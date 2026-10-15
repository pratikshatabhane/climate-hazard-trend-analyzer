from __future__ import annotations

import hashlib
import json
import os
import time
from datetime import date
from typing import Any

import httpx
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient
from pymongo.errors import PyMongoError

app = FastAPI(
    title="Climate Hazard Trend Analyzer API",
    description="Analyze point-based historical heatwave trends from Open-Meteo daily maximum temperatures.",
    version="1.0.0",
)

allowed_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173",
).split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

CACHE_TTL_SECONDS = int(os.getenv("CACHE_TTL_SECONDS", "21600"))
_memory_cache: dict[str, tuple[float, dict[str, Any]]] = {}
_mongo_collection = None

mongo_uri = os.getenv("MONGO_URI")
if mongo_uri:
    try:
        client = MongoClient(mongo_uri, serverSelectionTimeoutMS=1500)
        client.admin.command("ping")
        _mongo_collection = client["climate_hazard_analyzer"]["analysis_cache"]
        _mongo_collection.create_index("expires_at", expireAfterSeconds=0)
    except Exception:
        # The API remains usable with in-memory caching if MongoDB is unavailable.
        _mongo_collection = None


def cache_key(latitude: float, longitude: float, start_year: int, end_year: int) -> str:
    raw = f"{latitude:.4f}|{longitude:.4f}|{start_year}|{end_year}|heatwave-v1"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def cache_get(key: str) -> dict[str, Any] | None:
    now = time.time()
    item = _memory_cache.get(key)
    if item and item[0] > now:
        return item[1]
    _memory_cache.pop(key, None)
    if _mongo_collection is not None:
        try:
            doc = _mongo_collection.find_one({"_id": key, "expires_at": {"$gt": now}})
            if doc:
                _memory_cache[key] = (float(doc["expires_at"]), doc["payload"])
                return doc["payload"]
        except PyMongoError:
            pass
    return None


def cache_set(key: str, payload: dict[str, Any]) -> None:
    expires_at = time.time() + CACHE_TTL_SECONDS
    _memory_cache[key] = (expires_at, payload)
    if _mongo_collection is not None:
        try:
            _mongo_collection.update_one(
                {"_id": key},
                {"$set": {"payload": payload, "expires_at": expires_at}},
                upsert=True,
            )
        except PyMongoError:
            pass


async def fetch_daily_temperatures(latitude: float, longitude: float, start_year: int, end_year: int) -> pd.DataFrame:
    start_date = f"{start_year}-01-01"
    # Do not request dates beyond yesterday; the archive can lag by a few days.
    end_date = min(date(end_year, 12, 31), date.today()).isoformat()
    if start_date > end_date:
        raise HTTPException(status_code=422, detail="The selected range must begin before today.")

    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_date,
        "end_date": end_date,
        "daily": "temperature_2m_max",
        "timezone": "UTC",
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(25.0, connect=8.0)) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            data = response.json()
    except httpx.TimeoutException as exc:
        raise HTTPException(status_code=504, detail="Weather provider timed out. Please try again.") from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail="Weather provider returned an error for this date range.") from exc
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(status_code=502, detail="Could not retrieve valid weather data.") from exc

    daily = data.get("daily") or {}
    dates = daily.get("time") or []
    temps = daily.get("temperature_2m_max") or []
    if not dates or len(dates) != len(temps):
        raise HTTPException(status_code=502, detail="Weather provider returned incomplete daily data.")

    frame = pd.DataFrame({"date": pd.to_datetime(dates, errors="coerce"), "tmax_c": temps})
    frame = frame.dropna(subset=["date"])
    frame["tmax_c"] = pd.to_numeric(frame["tmax_c"], errors="coerce")
    # Guard against implausible provider values; preserve missing observations as gaps.
    frame.loc[(frame["tmax_c"] < -90) | (frame["tmax_c"] > 65), "tmax_c"] = np.nan
    return frame.sort_values("date").drop_duplicates("date").reset_index(drop=True)


def analyze_heatwaves(frame: pd.DataFrame, latitude: float, longitude: float, start_year: int, end_year: int) -> dict[str, Any]:
    valid = frame["tmax_c"].dropna()
    if len(valid) < 30:
        raise HTTPException(status_code=422, detail="Not enough valid daily temperature observations for analysis.")

    threshold = float(valid.quantile(0.95))
    frame = frame.copy()
    frame["year"] = frame["date"].dt.year
    frame["above_threshold"] = frame["tmax_c"].notna() & (frame["tmax_c"] > threshold)

    # A missing date or missing temperature breaks a consecutive-day run.
    frame["previous_date"] = frame["date"].shift(1)
    frame["previous_above"] = frame["above_threshold"].shift(1, fill_value=False)
    consecutive = (frame["date"] - frame["previous_date"]).dt.days.eq(1)
    starts = frame["above_threshold"] & ~(frame["previous_above"] & consecutive)
    frame["run_id"] = starts.cumsum()
    frame["run_length"] = 0

    events: list[dict[str, Any]] = []
    for _, group in frame[frame["above_threshold"]].groupby("run_id", sort=False):
        # Verify the dates inside each run are consecutive.
        if len(group) >= 3 and group["date"].diff().dropna().dt.days.eq(1).all():
            events.append({
                "start_date": group["date"].iloc[0].date().isoformat(),
                "end_date": group["date"].iloc[-1].date().isoformat(),
                "year": int(group["date"].iloc[0].year),
                "duration_days": int(len(group)),
                "peak_temperature_c": round(float(group["tmax_c"].max()), 1),
                "mean_temperature_c": round(float(group["tmax_c"].mean()), 1),
            })

    years = list(range(start_year, min(end_year, date.today().year) + 1))
    annual: list[dict[str, Any]] = []
    for year in years:
        yearly = frame[frame["year"] == year]
        valid_days = int(yearly["tmax_c"].notna().sum())
        annual_events = [event for event in events if event["year"] == year]
        heatwave_days = sum(
            1 for event in events
            for day in pd.date_range(event["start_date"], event["end_date"], freq="D")
            if day.year == year
        )
        annual.append({
            "year": year,
            "heatwave_events": len(annual_events),
            "heatwave_days": heatwave_days,
            "valid_days": valid_days,
        })

    if len(annual) >= 2:
        x = np.array([row["year"] for row in annual], dtype=float)
        y = np.array([row["heatwave_days"] for row in annual], dtype=float)
        slope = float(np.polyfit(x, y, 1)[0])
    else:
        slope = 0.0

    window = min(5, len(annual))
    first_avg = float(np.mean([row["heatwave_days"] for row in annual[:window]])) if annual else 0.0
    last_avg = float(np.mean([row["heatwave_days"] for row in annual[-window:]])) if annual else 0.0
    if first_avg > 0:
        change_pct: float | None = round(((last_avg - first_avg) / first_avg) * 100, 1)
        direction = "increased" if change_pct > 0 else ("decreased" if change_pct < 0 else "remained broadly unchanged")
        insight = f"Average annual heatwave days {direction} by {abs(change_pct):.1f}% between the first and last {window}-year windows."
    elif last_avg > 0:
        change_pct = None
        insight = f"The first {window}-year window had no detected heatwave days on average; the last window averaged {last_avg:.1f} days per year, so a percentage change is not defined."
    else:
        change_pct = None
        insight = "No heatwave days were detected in the comparison windows using this threshold and definition."

    return {
        "hazard": "heatwave",
        "location": {"latitude": latitude, "longitude": longitude},
        "period": {"start_year": start_year, "end_year": min(end_year, date.today().year)},
        "methodology": {
            "definition": "At least 3 consecutive days with daily maximum temperature above the 95th percentile.",
            "threshold_percentile": 95,
            "threshold_temperature_c": round(threshold, 2),
            "valid_observations": int(len(valid)),
            "missing_observations": int(frame["tmax_c"].isna().sum()),
            "temperature_unit": "°C",
        },
        "annual": annual,
        "events": events,
        "trend": {
            "heatwave_days_per_year_slope": round(slope, 3),
            "first_window_average_days": round(first_avg, 2),
            "last_window_average_days": round(last_avg, 2),
            "change_percent": change_pct,
            "window_years": window,
        },
        "insight": insight,
        "data_source": "Open-Meteo Historical Weather API (daily temperature_2m_max)",
        "generated_at": date.today().isoformat(),
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/analyze")
async def analyze(
    latitude: float = Query(..., ge=-90, le=90),
    longitude: float = Query(..., ge=-180, le=180),
    start_year: int = Query(1990, ge=1940, le=2100),
    end_year: int = Query(2020, ge=1940, le=2100),
) -> dict[str, Any]:
    current_year = date.today().year
    if start_year > end_year:
        raise HTTPException(status_code=422, detail="start_year must be less than or equal to end_year.")
    if end_year > current_year:
        raise HTTPException(status_code=422, detail=f"end_year cannot be later than {current_year}.")
    if end_year - start_year > 80:
        raise HTTPException(status_code=422, detail="Please select a maximum range of 80 years.")

    key = cache_key(latitude, longitude, start_year, end_year)
    cached = cache_get(key)
    if cached:
        return {**cached, "cache": "hit"}

    frame = await fetch_daily_temperatures(latitude, longitude, start_year, end_year)
    result = analyze_heatwaves(frame, latitude, longitude, start_year, end_year)
    cache_set(key, result)
    return {**result, "cache": "miss"}

# Climate Hazard Trend Analyzer

A full-stack MVP focused on **heatwave trends** for a selected point/region. Built with React + Vite + Recharts and FastAPI, using the Open-Meteo Historical Weather API.

## Features
- Choose a city preset or enter latitude/longitude.
- Choose a year range (defaults to 1990–2020).
- Fetches daily maximum temperature from Open-Meteo Archive API.
- Detects heatwaves as **3 or more consecutive days above the 95th percentile** of daily maximum temperatures in the selected analysis period.
- Shows annual heatwave events, heatwave days, a chart, trend estimate, and a concise summary.
- Backend caching: TTL cache in memory; optional MongoDB persistence/cache when `MONGO_URI` is configured.
- Input validation, bounded date range, API timeout, and clear errors for missing data.

## Architecture
- `frontend/`: React, Vite, Recharts.
- `backend/`: FastAPI, pandas/numpy for percentile and trend calculations, Open-Meteo API client.
- `MongoDB`: optional document cache. If no `MONGO_URI` is set, the app uses in-memory TTL cache so local development is easy.

## Assumptions and methodology
1. The selected latitude/longitude represents the region with a single grid-point daily temperature series. This is a useful MVP approximation, not a spatial average over a whole state.
2. The threshold is the 95th percentile of valid daily maximum temperatures across the chosen analysis period. A more rigorous climate-normal implementation would calculate calendar-day percentiles over a fixed 30-year baseline and use a spatially averaged dataset.
3. A heatwave is a run of at least 3 consecutive valid days where daily maximum temperature is strictly above that threshold. Missing dates break a run; missing temperatures are not imputed.
4. Annual event counts are assigned to the year in which the event starts. Heatwave days are counted in each calendar year.
5. Trend is an ordinary least-squares linear slope across annual heatwave-day counts. It describes the period selected and is not a causal attribution claim.
6. The comparison insight compares the average annual heatwave days in the first and last up-to-five-year windows. When the baseline average is zero, percentage change is reported as unavailable rather than infinite.
7. Open-Meteo data availability and API policies may change. No API key is required for the public archive endpoint used here.

## Run locally

### Requirements
- Node.js 18+
- Python 3.10+
- Optional: MongoDB instance

### Backend
```bash
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate
pip install -r requirements.txt
# Optional MongoDB:
# Windows PowerShell: $env:MONGO_URI="mongodb://localhost:27017"
# macOS/Linux: export MONGO_URI="mongodb://localhost:27017"
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/docs

### Frontend
Open a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Visit the URL printed by Vite (usually http://localhost:5173).

## API
`GET /api/analyze?latitude=37.7749&longitude=-122.4194&start_year=1990&end_year=2020`

Returns metadata, threshold, annual values, event details, trend slope, and insight text.

`GET /health` returns service status.

## AI tools disclosure
AI assistance was used to scaffold and review the project structure, API logic, UI, and documentation. All generated code should be reviewed and tested by the submitting developer. Before submission, run the app, verify the API output, review security and edge cases, and be prepared to explain and modify the implementation live.

## Before submitting
- Run both services locally and verify the chart and API.
- Add screenshots to the README if desired.
- Deploy backend and frontend, configure `VITE_API_BASE_URL` to the deployed backend URL, and enable CORS for the deployed frontend domain.
- Create a public GitHub repository and push this project.
- Submit the repository and deployed app URLs using the employer's form.

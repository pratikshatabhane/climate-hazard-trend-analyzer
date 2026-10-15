import { useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts'
import { Activity, ArrowDownRight, ArrowUpRight, CalendarDays, ChevronDown, CloudSun, Download, MapPin, RefreshCw, Thermometer, Waves } from 'lucide-react'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
const places = {
  'San Francisco, USA': { latitude: 37.7749, longitude: -122.4194 },
  'Phoenix, USA': { latitude: 33.4484, longitude: -112.0740 },
  'Delhi, India': { latitude: 28.6139, longitude: 77.2090 },
  'Mumbai, India': { latitude: 19.0760, longitude: 72.8777 },
  'Pune, India': { latitude: 18.5204, longitude: 73.8567 },
  'London, UK': { latitude: 51.5072, longitude: -0.1276 },
  'Sydney, Australia': { latitude: -33.8688, longitude: 151.2093 },
}

function Stat({ label, value, detail, icon: Icon }) {
  return <div className="stat-card">
    <div className="stat-top"><span>{label}</span><span className="stat-icon"><Icon size={17}/></span></div>
    <div className="stat-value">{value}</div>
    <div className="stat-detail">{detail}</div>
  </div>
}

function App() {
  const [place, setPlace] = useState('Pune, India')
  const [lat, setLat] = useState(String(places['Pune, India'].latitude))
  const [lon, setLon] = useState(String(places['Pune, India'].longitude))
  const [startYear, setStartYear] = useState('1990')
  const [endYear, setEndYear] = useState('2020')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const updatePlace = (name) => {
    setPlace(name)
    if (places[name]) {
      setLat(String(places[name].latitude))
      setLon(String(places[name].longitude))
    }
  }

  const runAnalysis = async (event) => {
    event?.preventDefault()
    setLoading(true); setError('')
    try {
      const query = new URLSearchParams({
        latitude: String(Number(lat)), longitude: String(Number(lon)),
        start_year: startYear, end_year: endYear,
      })
      const response = await fetch(`${API_BASE}/api/analyze?${query}`)
      const body = await response.json()
      if (!response.ok) throw new Error(body.detail || 'Analysis could not be completed.')
      setData(body)
    } catch (e) {
      setError(`${e.message}. Check that the backend is running and try again.`)
    } finally {
      setLoading(false)
    }
  }

  const totalEvents = useMemo(() => data?.annual?.reduce((sum, row) => sum + row.heatwave_events, 0) ?? 0, [data])
  const totalDays = useMemo(() => data?.annual?.reduce((sum, row) => sum + row.heatwave_days, 0) ?? 0, [data])
  const averageDays = useMemo(() => data?.annual?.length ? (totalDays / data.annual.length).toFixed(1) : '—', [data, totalDays])
  const change = data?.trend?.change_percent
  const changeText = change == null ? 'Not comparable' : `${change > 0 ? '+' : ''}${change}%`
  const ChangeIcon = change != null && change < 0 ? ArrowDownRight : ArrowUpRight

  const exportCsv = () => {
    if (!data) return
    const rows = [['year', 'heatwave_events', 'heatwave_days', 'valid_days'], ...data.annual.map(r => [r.year, r.heatwave_events, r.heatwave_days, r.valid_days])]
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a'); link.href = url; link.download = 'heatwave-trend.csv'; link.click()
    URL.revokeObjectURL(url)
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Waves size={21}/></div><div><strong>TerraSignal</strong><small>CLIMATE INTELLIGENCE</small></div></div>
      <div className="side-label">WORKSPACE</div>
      <div className="nav-item active"><Activity size={18}/> Hazard analyzer <span className="nav-dot"/></div>
      <div className="nav-item muted"><MapPin size={18}/> Regional explorer <span className="soon">SOON</span></div>
      <div className="nav-item muted"><CalendarDays size={18}/> Saved reports <span className="soon">SOON</span></div>
      <div className="sidebar-bottom"><div className="status-dot"/> <span>Data source operational</span><div className="side-divider"/><small>OPEN-METEO ARCHIVE API</small></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="breadcrumb">Climate intelligence <span>/</span> <b>Hazard analyzer</b></div><div className="top-right"><span className="live-pill"><span/> HISTORICAL ANALYSIS</span><div className="avatar">TS</div></div></header>
      <section className="page-heading">
        <div><div className="eyebrow"><span className="eyebrow-line"/> CLIMATE RISK MONITORING</div><h1>Climate Hazard <em>Trend Analyzer</em></h1><p>Understand how extreme heat is changing across your region over time.</p></div>
        <div className="heading-icon"><CloudSun size={32}/><span>°C</span></div>
      </section>

      <form className="filters" onSubmit={runAnalysis}>
        <div className="filter-heading"><div><span className="filter-kicker">CONFIGURE ANALYSIS</span><h2>Analysis parameters</h2></div><span className="filter-note"><span className="green-dot"/> Heatwave model v1.0</span></div>
        <div className="filter-grid">
          <label className="field"><span>REGION / CITY</span><div className="select-wrap"><MapPin size={16}/><select value={place} onChange={e => updatePlace(e.target.value)}>{Object.keys(places).map(name => <option key={name}>{name}</option>)}<option value="Custom coordinates">Custom coordinates</option></select><ChevronDown size={15}/></div></label>
          <label className="field"><span>LATITUDE</span><input type="number" step="any" min="-90" max="90" value={lat} onChange={e => {setLat(e.target.value); setPlace('Custom coordinates')}} required /></label>
          <label className="field"><span>LONGITUDE</span><input type="number" step="any" min="-180" max="180" value={lon} onChange={e => {setLon(e.target.value); setPlace('Custom coordinates')}} required /></label>
          <label className="field"><span>START YEAR</span><input type="number" min="1940" max={new Date().getFullYear()} value={startYear} onChange={e => setStartYear(e.target.value)} required /></label>
          <label className="field"><span>END YEAR</span><input type="number" min="1940" max={new Date().getFullYear()} value={endYear} onChange={e => setEndYear(e.target.value)} required /></label>
          <div className="field"><span>HAZARD TYPE</span><div className="hazard-choice"><Thermometer size={16}/><b>Heatwave</b><span>SELECTED</span></div></div>
        </div>
        <div className="filter-footer"><span className="method-note"><span className="info-mark">i</span> 3+ consecutive days above the 95th percentile</span><button className="analyze-button" type="submit" disabled={loading}>{loading ? <><RefreshCw className="spin" size={16}/> Analyzing...</> : <><Activity size={16}/> Analyze trends</>}</button></div>
      </form>

      {error && <div className="error-banner">{error}</div>}
      {!data && !error && <div className="empty-state"><div className="empty-illustration"><Thermometer size={32}/></div><h2>Your climate report starts here</h2><p>Choose a region and time range, then run the analysis to explore historical heatwave patterns.</p><button onClick={runAnalysis} className="text-button" type="button">Analyze Pune, 1990–2020 <span>→</span></button></div>}

      {data && <>
        <div className="results-heading"><div><div className="eyebrow">ANALYSIS OVERVIEW</div><h2>Heatwave indicators <span className="period-tag">{data.period.start_year}—{data.period.end_year}</span></h2><p>{place === 'Custom coordinates' ? `${Number(lat).toFixed(3)}, ${Number(lon).toFixed(3)}` : place} · Daily maximum temperature</p></div><button className="export-button" onClick={exportCsv}><Download size={16}/> Export CSV</button></div>
        <div className="stats-grid">
          <Stat label="HEATWAVE EVENTS" value={totalEvents.toLocaleString()} detail="Detected events in period" icon={Activity}/>
          <Stat label="TOTAL HEATWAVE DAYS" value={totalDays.toLocaleString()} detail="Days within detected events" icon={CalendarDays}/>
          <Stat label="ANNUAL AVERAGE" value={averageDays} detail="Heatwave days per year" icon={Thermometer}/>
          <Stat label="PERIOD CHANGE" value={changeText} detail={`First vs. last ${data.trend.window_years}-year average`} icon={ChangeIcon}/>
        </div>
        <div className="chart-grid">
          <section className="panel trend-panel"><div className="panel-heading"><div><h3>Annual heatwave days</h3><p>Days per year above threshold in 3+ day events</p></div><span className="unit-tag">DAYS / YEAR</span></div><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data.annual} margin={{top:12,right:8,left:-18,bottom:0}}><defs><linearGradient id="heatFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#e87550" stopOpacity={0.26}/><stop offset="100%" stopColor="#e87550" stopOpacity={0.015}/></linearGradient></defs><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8ece7"/><XAxis dataKey="year" tick={{fontSize:11,fill:'#82908a'}} axisLine={false} tickLine={false} minTickGap={25}/><YAxis tick={{fontSize:11,fill:'#82908a'}} axisLine={false} tickLine={false} allowDecimals={false}/><Tooltip contentStyle={{borderRadius:10,border:'1px solid #e3e9e2',fontSize:12}}/><Area type="monotone" dataKey="heatwave_days" name="Heatwave days" stroke="#d96d4b" strokeWidth={2.2} fill="url(#heatFill)" connectNulls={false} activeDot={{r:4,strokeWidth:0}}/></AreaChart></ResponsiveContainer></div><div className="chart-foot"><span><i className="legend-dot orange"/> Annual heatwave days</span><span>Source: Open-Meteo Archive</span></div></section>
          <section className="panel events-panel"><div className="panel-heading"><div><h3>Event frequency</h3><p>Heatwave events by year</p></div><span className="unit-tag">EVENTS</span></div><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.annual} margin={{top:12,right:8,left:-18,bottom:0}}><CartesianGrid strokeDasharray="3 5" vertical={false} stroke="#e8ece7"/><XAxis dataKey="year" tick={{fontSize:11,fill:'#82908a'}} axisLine={false} tickLine={false} minTickGap={25}/><YAxis tick={{fontSize:11,fill:'#82908a'}} axisLine={false} tickLine={false} allowDecimals={false}/><Tooltip contentStyle={{borderRadius:10,border:'1px solid #e3e9e2',fontSize:12}}/><Line type="monotone" dataKey="heatwave_events" name="Heatwave events" stroke="#4b8977" strokeWidth={2.2} dot={false} activeDot={{r:4}}/></LineChart></ResponsiveContainer></div><div className="chart-foot"><span><i className="legend-dot green"/> Annual event count</span><span>3+ consecutive days</span></div></section>
        </div>
        <div className="insights-grid"><section className="insight-card"><div className="insight-icon"><Activity size={19}/></div><div><div className="insight-label">KEY INSIGHT</div><h3>{data.insight}</h3><p>This is a descriptive comparison of the selected period, not a causal attribution statement.</p></div></section><section className="threshold-card"><div className="threshold-top"><span className="insight-label">DETECTION THRESHOLD</span><span className="threshold-chip">95TH PERCENTILE</span></div><div className="threshold-value">{data.methodology.threshold_temperature_c}°C</div><p>Daily maximum temperature cutoff for this analysis period.</p><div className="threshold-meta"><span>Valid observations</span><b>{data.methodology.valid_observations.toLocaleString()}</b><span>Missing readings</span><b>{data.methodology.missing_observations.toLocaleString()}</b></div></section></div>
        <section className="panel event-table-panel"><div className="panel-heading"><div><h3>Detected heatwave events</h3><p>Events meeting the consecutive-day definition</p></div><span className="unit-tag">{data.events.length} EVENTS</span></div><div className="table-scroll"><table><thead><tr><th>START DATE</th><th>END DATE</th><th>DURATION</th><th>PEAK TEMP.</th><th>MEAN TEMP.</th></tr></thead><tbody>{data.events.length ? [...data.events].reverse().slice(0,12).map((event,i)=><tr key={`${event.start_date}-${i}`}><td>{event.start_date}</td><td>{event.end_date}</td><td><span className="duration-pill">{event.duration_days} days</span></td><td>{event.peak_temperature_c}°C</td><td>{event.mean_temperature_c}°C</td></tr>) : <tr><td colSpan="5" className="no-events">No heatwave events were detected in this period.</td></tr>}</tbody></table></div>{data.events.length > 12 && <div className="table-note">Showing the 12 most recent events in the selected period.</div>}</section>
        <div className="methodology-note"><span className="info-mark">i</span><div><b>Methodology & limitations</b><p>Heatwaves are runs of at least three consecutive days above the period's 95th-percentile daily maximum temperature. Missing observations break a run. This analysis uses one grid point and a period-specific threshold; compare results cautiously across locations and time windows.</p></div><span className="cache-label">{data.cache === 'hit' ? 'CACHED RESULT' : 'FRESH RESULT'}</span></div>
      </>}
      <footer className="footer"><span>TerraSignal <b>·</b> Climate Hazard Trend Analyzer</span><span>Built with Open-Meteo historical data <span className="footer-dot"/> Research prototype</span></footer>
    </main>
  </div>
}

export default App

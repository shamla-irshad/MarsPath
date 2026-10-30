import { useEffect, useRef, useState } from 'react'
import { requestRoute, RouteApiError, type RouteResult } from './api'
import { buildManeuvers, cumulativeDistances, interpolatePosition } from './navigation'
import { earthDeltaMeters, nearestRouteProgress, type EarthFix } from './earthTracking'

type Point = { row: number; col: number }
type Location = { id: string; name: string; category: string; description: string; point?: Point; custom?: 'coordinates' | 'map'; section?: string; demo?: boolean }
type SelectedLocation = Location & { point: Point }
type RouteState = 'idle' | 'loading' | 'found' | 'blocked' | 'unreachable' | 'error'
type IconName = 'help' | 'settings' | 'plus' | 'minus' | 'reset' | 'pin' | 'route' | 'chevron' | 'layers' | 'target' | 'search' | 'close'

const locations: Location[] = [
  { id: 'octavia', name: 'Octavia E. Butler Landing', category: 'Current landing site', description: 'Verified navigation-grid origin.', point: { row: 200, col: 200 }, section: 'CURRENT LANDING SITE' },
  { id: 'example', name: 'Example Destination', category: 'Demo destination', description: 'Sample in-grid endpoint for prototype routing.', point: { row: 210, col: 215 }, section: 'RECENT DESTINATIONS · DEMO', demo: true },
  { id: 'coordinates', name: 'Custom Grid Coordinates', category: 'Grid entry', description: 'Enter a row and column from 0 through 400.', custom: 'coordinates', section: 'CUSTOM LOCATION' },
  { id: 'map', name: 'Select Destination on Map', category: 'Map selection', description: 'Choose a fully covered navigation-grid cell.', custom: 'map', section: 'CUSTOM LOCATION' },
]

const iconPaths: Record<IconName, React.ReactNode> = {
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.6 9a2.6 2.6 0 1 1 4.1 2.2c-1.1.8-1.7 1.3-1.7 2.8m0 3h.01"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a8 8 0 0 0-1.7-1L14.5 3h-5L9 6.1a8 8 0 0 0-1.7 1l-2.4-1-2 3.4L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a8 8 0 0 0 1.7 1l.4 3.1h5l.4-3.1a8 8 0 0 0 1.7-1l2.4 1 2 3.4-2-1.5Z"/></>,
  plus: <path d="M12 5v14M5 12h14"/>, minus: <path d="M5 12h14"/>,
  reset: <><path d="M4 8V4h4"/><path d="M5.8 17.5A8 8 0 1 0 5 7l-1 1"/></>,
  pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  route: <><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M7 19c7 0 1-12 10-14"/></>,
  chevron: <path d="m8 10 4 4 4-4"/>, layers: <><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 12 9 5 9-5m-18 4 9 5 9-5"/></>,
  target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></>,
  close: <path d="m6 6 12 12M18 6 6 18"/>,
}

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{iconPaths[name]}</svg>
}

function Logo() {
  return <div className="logo"><span className="orbit"><i/><i/><b/></span><div><strong>MARS<span>PATH</span></strong><small>ORBIT GUARDIANS · TEAM OG</small></div></div>
}

function Toggle({ on, setOn, label }: { on: boolean; setOn: (value: boolean) => void; label: string }) {
  return <button className="toggle-row" onClick={() => setOn(!on)} aria-pressed={on}><span>{label}</span><i className={on ? 'toggle on' : 'toggle'}><b/></i></button>
}

function LocationCombobox({ kind, value, onSelect, onCustom, onClear }: {
  kind: 'start' | 'destination'
  value: SelectedLocation | null
  onSelect: (location: SelectedLocation) => void
  onCustom: (mode: 'coordinates' | 'map') => void
  onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [loading, setLoading] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const available = locations.filter(location => kind === 'destination' || location.id !== 'example')
  const matches = available.filter(location => {
    const coordinate = location.point ? `${location.point.row}, ${location.point.col} ${location.point.row} ${location.point.col}` : ''
    return `${location.name} ${location.category} ${coordinate}`.toLowerCase().includes(query.toLowerCase())
  })
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])
  useEffect(() => setActive(0), [query])
  useEffect(() => {
    if (!open) return
    setLoading(true)
    const timer = window.setTimeout(() => setLoading(false), 180)
    return () => window.clearTimeout(timer)
  }, [open, query])
  const choose = (location: Location) => {
    if (location.custom) { onCustom(location.custom); setOpen(false); setQuery(''); return }
    if (!location.point) return
    onSelect({ ...location, point: location.point }); setOpen(false); setQuery('')
  }
  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setOpen(false); return }
    if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive(index => Math.min(index + 1, matches.length - 1)) }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(index - 1, 0)) }
    if (event.key === 'Enter' && open && matches[active]) { event.preventDefault(); choose(matches[active]) }
  }
  return <div className={`combobox ${kind}`} ref={root}>
    <div className="combo-input">
      <Icon name={kind === 'start' ? 'pin' : 'search'} size={15}/>
      <input role="combobox" aria-expanded={open} aria-controls={`${kind}-locations`} aria-activedescendant={open ? `${kind}-option-${active}` : undefined} value={open ? query : value?.name ?? ''} placeholder={kind === 'destination' ? 'Search a destination on Mars...' : 'Search a starting point...'} onFocus={() => { setOpen(true); setQuery('') }} onChange={event => { setQuery(event.target.value); setOpen(true) }} onKeyDown={onKeyDown}/>
      {value && !open ? <button aria-label={`Clear ${kind}`} onClick={onClear}><Icon name="close" size={14}/></button> : <Icon name="chevron" size={14}/>}
    </div>
    {open && <div className="combo-menu" id={`${kind}-locations`} role="listbox">
      <div className="combo-caption">{query ? 'MATCHING LOCATIONS' : kind === 'start' ? 'AVAILABLE STARTING POINTS' : 'AVAILABLE LOCATIONS'}</div>
      {loading ? <div className="combo-loading"><i/> SEARCHING NAVIGATION GRID</div> : matches.length ? matches.map((location, index) => <div className="combo-option-wrap" key={location.id}>
        {!query && (index === 0 || matches[index - 1]?.section !== location.section) && <div className="combo-section">{location.section}</div>}
        <button id={`${kind}-option-${index}`} role="option" aria-selected={value?.id === location.id} className={`${index === active ? 'active' : ''} ${value?.id === location.id ? 'selected' : ''}`} onMouseEnter={() => setActive(index)} onClick={() => choose(location)}>
          <i><Icon name={location.custom ? 'target' : 'pin'} size={14}/></i><span><strong>{location.id === 'map' && kind === 'start' ? 'Select Starting Point on Map' : location.name}{location.demo && <em>DEMO</em>}</strong><small>{location.category}{location.point ? ` · Row ${location.point.row}, Column ${location.point.col}` : ` · ${location.description}`}</small></span>
        </button>
      </div>) : <div className="no-results">No matching locations found</div>}
    </div>}
  </div>
}

function App() {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapCanvasRef = useRef<HTMLDivElement>(null)
  const octavia = locations[0] as Location & { point: Point }
  const [start, setStart] = useState<SelectedLocation | null>({ ...octavia, point: octavia.point })
  const [destination, setDestination] = useState<SelectedLocation | null>(null)
  const [selectionMode, setSelectionMode] = useState<'start' | 'destination' | null>(null)
  const [focused, setFocused] = useState<'start' | 'destination'>('start')
  const [cursor, setCursor] = useState<Point>({ row: 200, col: 200 })
  const [routeState, setRouteState] = useState<RouteState>('idle')
  const [routeResult, setRouteResult] = useState<RouteResult | null>(null)
  const [routeError, setRouteError] = useState('')
  const [navigationMode, setNavigationMode] = useState<'stopped'|'playing'|'paused'|'arrived'>('stopped')
  const [travelledMeters, setTravelledMeters] = useState(0)
  const [simSpeed, setSimSpeed] = useState(0.2)
  const [positionDraft, setPositionDraft] = useState({row:'200',col:'200'})
  const [positionError, setPositionError] = useState('')
  const [positionMode, setPositionMode] = useState<'simulation'|'manual'>('simulation')
  const [gpsActive, setGpsActive] = useState(false)
  const [gpsFix, setGpsFix] = useState<EarthFix | null>(null)
  const [gpsError, setGpsError] = useState('')
  const [gpsSampleCount, setGpsSampleCount] = useState(0)
  const [gpsAnchor, setGpsAnchor] = useState<EarthFix | null>(null)
  const [demoMappingEnabled, setDemoMappingEnabled] = useState(false)
  const [gpsBackendStatus, setGpsBackendStatus] = useState('Not connected')
  const gpsWatch = useRef<number | null>(null)
  const [gpsFixAge, setGpsFixAge] = useState(0)
  const gpsGood = Boolean(gpsFix && gpsFix.accuracy <= 10 && gpsFixAge < 30)
  const demoDelta = gpsFix && gpsAnchor ? earthDeltaMeters(gpsAnchor, gpsFix) : null
  const demoCell = demoDelta ? {row: 200 - demoDelta.north/5, col: 200 + demoDelta.east/5} : null
  const lastFrame = useRef<number | null>(null)
  const [zoom, setZoom] = useState(1)
  const [followRover, setFollowRover] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [terrain, setTerrain] = useState(true)
  const [routeVisible, setRouteVisible] = useState(true)
  const [leftOpen, setLeftOpen] = useState(true)
  const [rightOpen, setRightOpen] = useState(true)
  const [bottomOpen, setBottomOpen] = useState(false)
  const [coordinateModal, setCoordinateModal] = useState<'start' | 'destination' | null>(null)
  const [coordinateDraft, setCoordinateDraft] = useState({ row: '200', col: '200' })
  const [coordinateError, setCoordinateError] = useState('')
  const [recentDestinations, setRecentDestinations] = useState<SelectedLocation[]>([])
  const [orthoAvailable, setOrthoAvailable] = useState(false)
  const drag = useRef({ active: false, moved: false, x: 0, y: 0 })

  async function handleGenerateRoute() {
    if (!destination || !start || start.point.row !== 200 || start.point.col !== 200) return
    setRouteResult(null)
    setPositionDraft({row:'200',col:'200'});setPositionError('');setPositionMode('simulation')
    setNavigationMode('stopped'); setTravelledMeters(0); lastFrame.current=null
    setRouteError('')
    setRouteState('loading')
    try {
      const result = await requestRoute(destination.point)
      setRouteResult(result)
      setRouteState('found')
      setRightOpen(true)
    } catch (error) {
      if (error instanceof RouteApiError) {
        setRouteState(error.code === 'BLOCKED' || error.code === 'OUT_OF_BOUNDS' ? 'blocked' : error.code === 'UNREACHABLE' ? 'unreachable' : 'error')
        setRouteError(error.message)
      } else {
        setRouteState('error')
        setRouteError(error instanceof Error ? error.message : 'Unable to connect to route service')
      }
    }
  }
  const resetRoute = () => { setRouteState('idle'); setRouteResult(null); setRouteError(''); setNavigationMode('stopped'); setTravelledMeters(0); lastFrame.current=null }


  const pointFromEvent = (event: React.MouseEvent<HTMLDivElement>): Point => {
    const box = mapCanvasRef.current!.getBoundingClientRect()
    const x = Math.max(0, Math.min(1, (event.clientX - box.left) / box.width))
    const y = Math.max(0, Math.min(1, (event.clientY - box.top) / box.height))
    return { col: Math.min(399, Math.floor(x * 2001 / 5)), row: Math.min(399, Math.floor(y * 2001 / 5)) }
  }
  const selectMapPoint = (event: React.MouseEvent<HTMLDivElement>) => {
    // Only bare terrain clicks select a destination. Never interpret a UI-control click as a map click.
    const target = event.target as HTMLElement
    if (target.closest('button, input, select, [data-map-ui], .marker, .sim-rover-marker, .route-svg') || drag.current.moved) { drag.current.moved = false; return }
    if (!target.closest('.map-canvas')) return
    const point = pointFromEvent(event)
    const selected: SelectedLocation = { id: `custom-${selectionMode ?? 'destination'}`, name: 'Custom Location', category: 'Custom map point', description: `Navigation grid row ${point.row}, column ${point.col}.`, point, custom: 'map' }
    if (selectionMode === 'start') setStart(selected)
    else setDestination(selected)
    setFocused(selectionMode === 'start' ? 'start' : 'destination'); setSelectionMode(null); resetRoute()
  }
  const focusLocation = (kind: 'start' | 'destination', location: SelectedLocation) => {
    if (kind === 'start') setStart(location); else setDestination(location)
    if (kind === 'destination') setRecentDestinations(items => [location, ...items.filter(item => item.id !== location.id)].slice(0, 3))
    const box = mapRef.current?.getBoundingClientRect()
    setFocused(kind); setZoom(1.35)
    if (box) setPan({ x: (.5 - location.point.col / 400) * 1.35 * box.width, y: (.5 - location.point.row / 400) * 1.35 * box.height })
    resetRoute()
  }
  const openCustom = (kind: 'start' | 'destination', mode: 'coordinates' | 'map') => {
    if (mode === 'map') { setSelectionMode(kind); return }
    setCoordinateDraft({ row: '200', col: '200' }); setCoordinateError(''); setCoordinateModal(kind)
  }
  const applyCoordinates = () => {
    const row = Number(coordinateDraft.row), col = Number(coordinateDraft.col)
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 400 || col < 0 || col > 400) {
      setCoordinateError('Enter whole-number grid coordinates from 0 to 400.'); return
    }
    const location: SelectedLocation = { id: `custom-${coordinateModal}-${row}-${col}`, name: 'Custom Grid Location', category: 'Custom grid coordinates', description: `Navigation grid row ${row}, column ${col}.`, point: { row, col }, custom: 'coordinates' }
    focusLocation(coordinateModal!, location); setCoordinateModal(null)
  }
  const clear = () => { setDestination(null); resetRoute() }
  const startX = ((start?.point.col ?? 200) * 5 + 2.5) / 2001 * 100, startY = ((start?.point.row ?? 200) * 5 + 2.5) / 2001 * 100
  const destX = destination ? (destination.point.col * 5 + 2.5) / 2001 * 100 : 65
  const destY = destination ? (destination.point.row * 5 + 2.5) / 2001 * 100 : 32
  const routePath = routeResult?.path.map(([row, col], index) => `${index ? 'L' : 'M'} ${(col * 5 + 2.5) / 2001 * 100} ${(row * 5 + 2.5) / 2001 * 100}`).join(' ') ?? ''
  const distance = routeResult?.distance_m ?? 0
  const steps = routeResult?.steps ?? 0
  const difficulty = routeResult ? (routeResult.moderate_cost_cells ? 'MIXED TERRAIN' : 'LOW SLOPE') : '—'

  const routeCells = routeResult?.path ?? []
  const cum = cumulativeDistances(routeCells)
  const routeLength = cum.length ? cum[cum.length-1] : 0
  const maneuvers = buildManeuvers(routeCells)
  const activeManeuverIndex = maneuvers.findIndex(m => travelledMeters < m.endMeters - 0.0001)
  const activeManeuver = activeManeuverIndex >= 0 ? maneuvers[activeManeuverIndex] : null
  const simulationPosition = routeResult ? interpolatePosition(routeCells, cum, travelledMeters) : null
  const remainingMeters = Math.max(0, routeLength - travelledMeters)
  const nextTurn = maneuvers[activeManeuverIndex + 1] ?? null
  const liveProjection = demoMappingEnabled && gpsActive && gpsGood && demoCell && routeCells.length
    ? nearestRouteProgress(routeCells, cum, demoCell.row, demoCell.col) : null
  const liveOnRoute = Boolean(liveProjection && liveProjection.separationM <= 7.5)
  const displayMeters = liveOnRoute && liveProjection ? liveProjection.progressM : travelledMeters
  const livePosition = demoMappingEnabled && gpsActive && gpsGood && demoCell ? demoCell : null
  const gpsNavigationWarning = gpsActive && !gpsGood ? 'LOW GPS ACCURACY — navigation remains paused' :
    gpsActive && demoMappingEnabled && !liveOnRoute && routeResult ? 'OFF DEMO ROUTE — do not follow turn instructions' : ''

  useEffect(() => {
    if (!gpsActive) return
    if (!('geolocation' in navigator)) {setGpsError('Browser geolocation is not available.'); setGpsActive(false); return}
    setGpsError('')
    const id = navigator.geolocation.watchPosition(
      pos => {
        const fix: EarthFix = {latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy,timestamp:pos.timestamp}
        setGpsFix(fix); setGpsSampleCount(v=>v+1);setGpsFixAge(0)
        const url = `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'}/api/telemetry/earth`
        fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(fix)})
          .then(r=>{if(!r.ok)throw Error(`Backend HTTP ${r.status}`);setGpsBackendStatus('Receiving GPS reports')})
          .catch(()=>setGpsBackendStatus('Backend unavailable — tracking is still local'))
      },
      err => {setGpsError(`Location error: ${err.message}`);if(err.code===1)setGpsActive(false)},
      {enableHighAccuracy:true,maximumAge:0,timeout:20000}
    )
    gpsWatch.current=id
    return ()=>{navigator.geolocation.clearWatch(id);gpsWatch.current=null}
  },[gpsActive])
  useEffect(()=>{if(!gpsActive)return;const t=window.setInterval(()=>{if(gpsFix)setGpsFixAge(Math.max(0,(Date.now()-gpsFix.timestamp)/1000))},1000);return()=>window.clearInterval(t)},[gpsActive,gpsFix])
  useEffect(()=>{if(gpsActive){setNavigationMode('paused');lastFrame.current=null}},[gpsActive])
  useEffect(()=>{
    if(gpsActive && demoMappingEnabled && gpsGood && liveProjection && liveOnRoute){
      setTravelledMeters(liveProjection.progressM)
      setNavigationMode(liveProjection.progressM>=routeLength?'arrived':'paused')
    }
  },[gpsActive,demoMappingEnabled,gpsGood,liveOnRoute,liveProjection?.progressM,routeLength])
  function stopLaptopGPS(){setGpsActive(false);setDemoMappingEnabled(false);setGpsBackendStatus('Stopped')}
  function setGpsAnchorHere(){if(gpsFix){setGpsAnchor(gpsFix);setDemoMappingEnabled(false);setGpsError('Anchor set at the current Earth fix. This is a demonstration only, not a Mars coordinate.')}}
  const mapPointX = (col: number) => (col * 5 + 2.5) / 2001 * 100
  const mapPointY = (row: number) => (row * 5 + 2.5) / 2001 * 100
  useEffect(() => {
    if (!followRover || !simulationPosition || !mapRef.current) return
    const bounds = mapRef.current.getBoundingClientRect()
    setPan({x: (0.5 - mapPointX(simulationPosition.col)/100) * zoom * bounds.width, y: (0.5 - mapPointY(simulationPosition.row)/100) * zoom * bounds.height})
  }, [followRover, travelledMeters, zoom, routeResult])
  // Time-based simulation only: actual vehicle telemetry is not connected.
  useEffect(() => {
    if (navigationMode !== 'playing' || !routeResult) { lastFrame.current = null; return }
    const timer = window.setInterval(() => {
      const now = performance.now()
      const deltaSeconds = lastFrame.current === null ? 0 : Math.min(0.5, (now-lastFrame.current)/1000)
      lastFrame.current = now
      setTravelledMeters(previous => {
        const next = Math.min(routeLength, previous + deltaSeconds * simSpeed)
        if(next >= routeLength) setNavigationMode('arrived')
        return next
      })
    }, 100)
    return () => { window.clearInterval(timer); lastFrame.current = null }
  }, [navigationMode, routeResult, routeLength, simSpeed])

  // Native non-passive wheel handler: map zoom consumes wheel/ctrl-wheel so Chrome doesn't zoom the whole website.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      if (event.deltaY === 0) return
      setZoom(current => {
        const next = Math.max(1, Math.min(5, Math.round((current * (event.deltaY < 0 ? 1.13 : 1 / 1.13)) * 100) / 100))
        if(next === 1) setPan({x:0,y:0})
        return next
      })
    }
    map.addEventListener('wheel', onWheel, {passive:false})
    return () => map.removeEventListener('wheel', onWheel)
  }, [])

  function updateReportedPosition() {
    if (!routeResult || !routeCells.length) return
    const row = Number(positionDraft.row), col = Number(positionDraft.col)
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 400 || col < 0 || col > 400) {
      setPositionError('Enter whole-number rows and columns from 0 to 400.'); return
    }
    // Project the observation onto the nearest route segment (not merely the nearest vertex).
    let bestDistance = Infinity, nearestProgress = 0
    for (let i=0; i<routeCells.length-1; i++) {
      const [r1,c1]=routeCells[i], [r2,c2]=routeCells[i+1]
      const dr=r2-r1, dc=c2-c1, squared=dr*dr+dc*dc
      const t=Math.max(0,Math.min(1,((row-r1)*dr+(col-c1)*dc)/(squared||1)))
      const separation=Math.hypot(row-(r1+t*dr),col-(c1+t*dc))*5
      if(separation<bestDistance){bestDistance=separation;nearestProgress=cum[i]+t*(cum[i+1]-cum[i])}
    }
    if (bestDistance > 7.5) {
      setPositionError(`Position is ${bestDistance.toFixed(1)} m from route. Stop and request rerouting; current backend only routes from landing cell.`)
      setNavigationMode('paused')
      return
    }
    setPositionError('')
    setPositionMode('manual')
    setNavigationMode(nearestProgress >= routeLength ? 'arrived' : 'paused')
    setTravelledMeters(nearestProgress)
    lastFrame.current=null
  }

  const canRoute = Boolean(destination && start && (destination.point.row !== start.point.row || destination.point.col !== start.point.col))

  return <main className="app">
    <header className="topbar">
      <Logo/>
      <div className="mission-id"><span>MISSION LOCATION</span><strong><i/> Jezero Crater, Mars</strong></div>
      <div className="top-right"><span className="sim"><i/> SIMULATION</span><span className="utc">NAVIGATION DEMO · NO LIVE CLOCK</span><button aria-label="Help"><Icon name="help"/></button><button aria-label="Settings"><Icon name="settings"/></button></div>
    </header>

    <div className={`workspace ${!leftOpen ? 'left-collapsed' : ''} ${!rightOpen ? 'right-collapsed' : ''}`}>
      <aside className={`side left ${leftOpen ? '' : 'closed'}`}>
        <button className="panel-collapse" onClick={() => setLeftOpen(!leftOpen)} aria-label="Toggle mission controls"><Icon name="chevron"/></button>
        <div className="side-inner">
          <header className="panel-title"><span>01 / NAVIGATION</span><h2>Mission Controls</h2></header>
          <section className="field-block"><label>STARTING POINT</label><LocationCombobox kind="start" value={start} onSelect={location => focusLocation('start', location)} onCustom={mode => openCustom('start', mode)} onClear={() => { setStart(null); resetRoute() }}/></section>
          <section className="destination">
            <label>DESTINATION SELECTOR</label>
            <LocationCombobox kind="destination" value={destination} onSelect={location => focusLocation('destination', location)} onCustom={mode => openCustom('destination', mode)} onClear={clear}/>
            {destination && <div className="coordinate-card"><span>SELECTED DESTINATION</span><div><b>ROW <strong>{destination.point.row.toString().padStart(3, '0')}</strong></b><i/><b>COL <strong>{destination.point.col.toString().padStart(3, '0')}</strong></b></div><small>{destination.demo ? 'DEMO LOCATION' : 'VALID IMAGE-COVERED CELL'}</small></div>}
          </section>
          {selectionMode && <div className={`selection-instruction ${selectionMode}`}>Click on the map to select your {selectionMode === 'start' ? 'starting point' : 'destination'}.</div>}
          <button className="generate primary-route-action" disabled={!canRoute || routeState === 'loading' || start?.point.row !== 200 || start?.point.col !== 200} onClick={handleGenerateRoute}><Icon name="route"/>{routeState === 'loading' ? 'CALCULATING ROUTE' : 'GENERATE ROUTE'}</button>
          {start && start.id !== 'octavia' && <div className="backend-note">Routing currently requires start cell 200, 200. This starting point is preview-only.</div>}
          <div className="endpoint-actions"><button disabled={!destination || start?.point.row !== 200 || start?.point.col !== 200} title="Swap is unavailable while the route service requires start cell 200, 200"><Icon name="reset" size={13}/> SWAP</button><button disabled={routeState === 'idle'} onClick={() => resetRoute()}><Icon name="close" size={13}/> CLEAR ROUTE</button></div>
          {recentDestinations.length > 0 && <div className="recent-inline">RECENT · {recentDestinations.map(item => item.name).join(' · ')}</div>}
          <div className="divider"/>
          <section><label>MAP DISPLAY</label><Toggle label="Terrain map" on={terrain} setOn={setTerrain}/><Toggle label="Route overlay" on={routeVisible} setOn={setRouteVisible}/></section>
          <div className="legend"><label>MAP LEGEND</label><span><i className="legend-start"/>Landing point</span><span><i className="legend-dest"/>Selected destination</span><span><i className="legend-route"/>A* route path</span></div>
          <div className="source"><Icon name="layers"/><div><strong>{orthoAvailable ? 'SUPPLIED ORTHO PREVIEW' : 'DEMO TERRAIN PLACEHOLDER'}</strong><span>2001 × 2001 PX · GRID 401 × 401</span><small>Nominal grid spacing: 5 m</small></div></div>
        </div>
      </aside>

      <section className="map-section">
        <div className="map-header"><div>MAP VIEW</div><span>GRID CRS · LOCAL CARTESIAN</span><div className="mobile-map-actions persistent-map-actions"><button className="mobile-route" disabled={!canRoute || routeState === 'loading' || start?.point.row !== 200 || start?.point.col !== 200} onClick={handleGenerateRoute}>{routeState === 'loading' ? 'CALCULATING…' : 'GENERATE ROUTE'}</button><button className="mobile-planner" onClick={() => setLeftOpen(value => !value)}>{leftOpen ? 'CLOSE PLANNER' : 'MISSION PLANNER'}</button></div></div>
        <div className={`map-window ${selectionMode ? 'selecting' : ''}`} ref={mapRef} onClick={selectMapPoint} onMouseMove={e => setCursor(pointFromEvent(e))} onPointerDown={event => { if (!(event.target as HTMLElement).closest('.map-canvas') || (event.target as HTMLElement).closest('[data-map-ui], button, .marker')) return; if (zoom <= 1 || selectionMode) return; drag.current = { active: true, moved: false, x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerMove={event => { if (!drag.current.active) return; const dx = event.clientX - drag.current.x, dy = event.clientY - drag.current.y; if (Math.abs(dx) + Math.abs(dy) > 2) drag.current.moved = true; setPan(value => ({ x: value.x + dx, y: value.y + dy })); drag.current.x = event.clientX; drag.current.y = event.clientY }} onPointerUp={event => { drag.current.active = false; event.currentTarget.releasePointerCapture(event.pointerId) }}>
          <div ref={mapCanvasRef} className={`map-canvas ${terrain ? '' : 'terrain-off'}`} style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center' }}>
            <div className="terrain-image"/><img className="ortho-image" src="/data/landing_area_ortho_preview.png" alt="Mars landing-area orbital terrain" onLoad={() => setOrthoAvailable(true)} onError={event => { setOrthoAvailable(false); event.currentTarget.style.display = 'none' }}/><div className="map-grid"/>
            {routeState === 'found' && routeVisible && <svg className="route-svg" viewBox="0 0 100 100" preserveAspectRatio="none"><path className="route-shadow" style={{strokeWidth: 0.85 / zoom}} d={routePath}/><path className="route-line" style={{strokeWidth: 0.38 / zoom}} d={routePath}/></svg>}
            {livePosition && <div className="earth-demo-marker" style={{left:`${mapPointX(livePosition.col)}%`,top:`${mapPointY(livePosition.row)}%`,transform:`translate(-50%, -50%) scale(${1/zoom})`}} title="Earth-to-Mars demonstration estimate; not real Mars telemetry">◎</div>}
            {simulationPosition && routeState === 'found' && !gpsActive && <div className="sim-rover-marker" style={{transform:`translate(-50%, -50%) scale(${1/zoom})`,left:`${(simulationPosition.col*5+2.5)/2001*100}%`,top:`${(simulationPosition.row*5+2.5)/2001*100}%`}} title="Simulated rover position"><span>▲</span></div>}
            {start && <div className={`marker landing ${focused === 'start' ? 'highlighted' : ''}`} style={{ transform:`translate(-50%, -50%) scale(${1/zoom})`, left: `${startX}%`, top: `${startY}%` }}><span><Icon name="pin" size={17}/></span><b>{start.name}</b>{focused === 'start' && <div className="marker-popup"><strong>{start.name}</strong><small>{start.description}</small></div>}</div>}
            {destination && <div className={`marker destination-marker ${focused === 'destination' ? 'highlighted' : ''}`} style={{ transform:`translate(-50%, -50%) scale(${1/zoom})`, left: `${destX}%`, top: `${destY}%` }}><span><Icon name="target" size={17}/></span><b>{destination.name}</b>{focused === 'destination' && <div className="marker-popup"><strong>{destination.name}</strong><small>{destination.description}</small></div>}</div>}
          </div>
          <div className="map-instruction" data-map-ui onClick={event => event.stopPropagation()}>{selectionMode === 'start' ? 'CLICK ON THE MARS SURFACE TO CHOOSE A STARTING POINT' : 'TO CHANGE DESTINATION, USE THE SELECTOR OR CLICK THE TERRAIN'} {selectionMode && <button onClick={() => setSelectionMode(null)}>CANCEL</button>}</div>
          {routeState === 'loading' && <div className="map-loading" data-map-ui><i/><strong>COMPUTING A* ROUTE</strong><span>Evaluating traversable grid cells...</span></div>}
          <div className="map-label" data-map-ui><strong>{orthoAvailable ? 'HiRISE ORBITAL IMAGERY' : 'DEMO TERRAIN PLACEHOLDER'}</strong><span>Jezero Crater · Mars</span></div>
          {routeState === 'found' && routeResult && <div className="floating-navigation" data-map-ui onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
            <div className="floating-nav-top"><strong>◈ MARS NAVIGATION</strong><span>{positionMode === 'manual' ? 'REPORTED POSITION' : 'SIMULATED POSITION'}</span></div>
            <div className="floating-nav-direction"><span className="floating-nav-arrow">{navigationMode === 'arrived' ? '✓' : activeManeuver?.action.toLowerCase().includes('left') ? '↰' : activeManeuver?.action.toLowerCase().includes('right') ? '↱' : '↑'}</span><div><strong>{navigationMode === 'arrived' ? 'Destination reached' : activeManeuver ? `${activeManeuver.action} ${activeManeuver.heading}` : 'Follow route'}</strong><small>{navigationMode === 'arrived' ? 'Route complete' : `${Math.max(0, (activeManeuver?.endMeters ?? routeLength)-travelledMeters).toFixed(1)} m to next instruction · ${remainingMeters.toFixed(1)} m left`}</small></div></div>
            {nextTurn && navigationMode !== 'arrived' && <div className="floating-nav-next">THEN: {nextTurn.action} {nextTurn.heading}</div>}
            <div className="floating-nav-controls">
              <button disabled={gpsActive} onClick={() => {if(navigationMode==='playing')setNavigationMode('paused');else if(!gpsActive){if(navigationMode==='arrived')setTravelledMeters(0);lastFrame.current=null;setPositionMode('simulation');setNavigationMode('playing')}}}>{gpsActive?'GPS MODE':navigationMode==='playing'?'Ⅱ PAUSE':navigationMode==='paused'?'▶ RESUME':'▶ START'}</button>
              <button onClick={() => {setNavigationMode('stopped');setTravelledMeters(0);setFollowRover(false)}}>↺ RESET</button>
              <button className={followRover?'active':''} aria-pressed={followRover} onClick={() => setFollowRover(v=>!v)}>⌖ FOLLOW {followRover?'ON':'OFF'}</button>
              <button onClick={() => setRightOpen(v=>!v)}>☷ STEPS</button>
            </div>
            <div className="floating-nav-progress"><i style={{width:`${routeLength ? travelledMeters/routeLength*100:0}%`}}/></div>
          </div>}
          <div className="zoom-controls" data-map-ui onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}><button onClick={() => setZoom(Math.min(2.5, +(zoom + .2).toFixed(2)))} aria-label="Zoom in"><Icon name="plus"/></button><button onClick={() => { const next = Math.max(1, +(zoom - .2).toFixed(2)); setZoom(next); if (next === 1) setPan({ x: 0, y: 0 }) }} aria-label="Zoom out"><Icon name="minus"/></button><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }) }} aria-label="Fit map" title="Fit map"><Icon name="reset"/></button></div>
          <div className="north" data-map-ui>N <span>↑</span></div>
          <div className="cursor-readout" data-map-ui><span>CURSOR POSITION</span><b>ROW {cursor.row.toString().padStart(3, '0')} · COL {cursor.col.toString().padStart(3, '0')}</b><small>X {(cursor.col * 5).toLocaleString()} M · Y {(cursor.row * 5).toLocaleString()} M</small></div>
          <div className="scale" data-map-ui><i/> 250 M <i/></div>
        </div>
      </section>

      <aside className={`side right ${rightOpen ? '' : 'closed'}`}>
        <button className="panel-collapse" onClick={() => setRightOpen(!rightOpen)} aria-label="Toggle route intelligence"><Icon name="chevron"/></button>
        <div className="side-inner">
          <header className="panel-title"><span>02 / ANALYSIS</span><h2>Route Intelligence</h2></header>
          <div className={`status-card ${routeState}`}><div>{routeState === 'loading' ? <i className="spinner"/> : <i className="status-icon"><Icon name={routeState === 'found' ? 'route' : 'target'}/></i>}<span>NAVIGATION STATUS<strong>{routeState === 'found' ? 'ROUTE FOUND' : routeState === 'loading' ? 'CALCULATING ROUTE…' : routeState === 'blocked' ? 'DESTINATION BLOCKED' : routeState === 'unreachable' ? 'ROUTE UNREACHABLE' : routeState === 'error' ? 'SERVER ERROR' : 'AWAITING DESTINATION'}</strong></span></div><small>{routeState === 'found' ? 'NASA-DERIVED GRID · A* ROUTE COMPUTED' : routeState === 'loading' ? 'SEARCHING NAVIGATION GRID' : routeState === 'blocked' ? 'CHOOSE A DIFFERENT DESTINATION CELL' : routeState === 'unreachable' ? 'NO TRAVERSABLE PATH WAS RETURNED' : routeState === 'error' ? 'ROUTE SERVICE COULD NOT BE REACHED' : canRoute ? 'READY TO GENERATE' : destination ? 'START AND DESTINATION MUST DIFFER' : 'CHOOSE A DESTINATION TO BEGIN ROUTE PLANNING.'}</small></div>
          <section className="coordinates"><label>ROUTE COORDINATES</label><div><span>START GRID</span><b>{start ? `${start.point.row}, ${start.point.col}` : '—, —'}</b></div><div><span>DESTINATION GRID</span><b>{destination ? `${destination.point.row}, ${destination.point.col}` : '—, —'}</b></div></section>
          <section className="metric-grid"><div><span>TOTAL DISTANCE</span><b>{routeState === 'found' ? distance.toLocaleString() : '—'} <small>{routeState === 'found' ? 'M' : ''}</small></b></div><div><span>ROUTE STEPS</span><b>{routeState === 'found' ? steps : '—'}</b></div><div><span>GRID SPACING</span><b>5 <small>M</small></b></div><div><span>TERRAIN DIFFICULTY</span><b>{difficulty}</b></div></section>
          <section className="earth-gps-panel" aria-label="Laptop GPS tracking" data-map-ui>
            <div className="earth-gps-heading"><strong>LIVE LAPTOP LOCATION</strong><span>EARTH · BROWSER GEOLOCATION</span></div>
            <p>Track this Windows laptop, with your permission. Earth coordinates are NOT Martian coordinates.</p>
            <div className="earth-gps-actions">
              <button className="earth-gps-primary" onClick={()=>gpsActive?stopLaptopGPS():setGpsActive(true)}>{gpsActive?'■ STOP TRACKING':'◎ START LAPTOP GPS'}</button>
              <button disabled={!gpsFix} onClick={setGpsAnchorHere}>SET DEMO ORIGIN</button>
            </div>
            <div className="earth-gps-stats">
              <div><small>GPS STATUS</small><strong>{gpsActive?(gpsFix?'Receiving fixes':'Requesting permission…'):'Stopped'}</strong></div>
              <div><small>HORIZONTAL UNCERTAINTY</small><strong className={gpsGood?'gps-ok':'gps-warn'}>{gpsFix?`± ${Math.round(gpsFix.accuracy)} m`:'—'}</strong></div>
              <div><small>FIX AGE</small><strong>{gpsFix?`${gpsFixAge.toFixed(0)} s`:'—'}</strong></div>
              <div><small>REPORTS</small><strong>{gpsSampleCount}</strong></div>
            </div>
            {gpsFix && <p className="earth-gps-coordinates">EARTH WGS84 · {gpsFix.latitude.toFixed(6)}°, {gpsFix.longitude.toFixed(6)}°</p>}
            {gpsFix && <div className="earth-gps-accuracy"><div className={gpsGood?'gps-ok':'gps-warn'}>{gpsGood?'ACCURACY SUFFICIENT FOR EXPERIMENTAL TRACKING':'LOW ACCURACY: precise 5 m turn instructions disabled'}</div><small>Browser accuracy is a reported approximate 95% horizontal confidence radius, not a measured guarantee.</small></div>}
            <label className="earth-gps-toggle"><input type="checkbox" checked={demoMappingEnabled} disabled={!gpsAnchor || !gpsActive} onChange={e=>setDemoMappingEnabled(e.target.checked)}/> SHOW EARTH-TO-MARS DEMO MAPPING</label>
            <p>Set an Earth origin first. The anchor maps to Mars grid (200, 200); local East/North Earth motion is scaled into 5 m Mars grid cells. This is an illustrative overlay only. Positions more than 7.5 m from the planned demo route will not update directions.</p>
            {demoCell && demoMappingEnabled && <p className="earth-gps-coordinates">DEMO GRID ESTIMATE · row {demoCell.row.toFixed(1)}, col {demoCell.col.toFixed(1)}</p>}
            {gpsNavigationWarning && <div className="earth-gps-warning" role="status">{gpsNavigationWarning}</div>}
            {gpsError && <div className="earth-gps-warning" role="alert">{gpsError}</div>}
            <small>{gpsBackendStatus}. GPS reports stay on this laptop's FastAPI server and are stored only in server memory.</small>
          </section>
          {routeState === 'found' && routeResult && <section className="turn-navigation" aria-label="Turn-by-turn simulated navigation">
            <div className="nav-kicker">TURN-BY-TURN NAVIGATION <span>SIMULATION · NOT LIVE GPS</span></div>
            <div className="nav-primary">
              <strong>{navigationMode === 'arrived' ? 'DESTINATION REACHED' : activeManeuver ? `${activeManeuver.action} ${activeManeuver.heading}` : 'DESTINATION REACHED'}</strong>
              <b>{navigationMode === 'arrived' ? '0 m remaining' : activeManeuver ? `${Math.max(0, activeManeuver.endMeters - travelledMeters).toFixed(1)} m to next instruction` : 'Route completed'}</b>
              <small>{remainingMeters.toFixed(1)} m remaining of {routeLength.toFixed(1)} m</small>
            </div>
            <div className="nav-progress"><div style={{ width: `${routeLength ? 100 * travelledMeters / routeLength : 0}%` }}/></div>
            <div className="nav-actions">
              <button disabled={gpsActive} onClick={() => { if(navigationMode==='arrived'){setTravelledMeters(0)};lastFrame.current=null;setPositionMode('simulation');setNavigationMode('playing') }}>{navigationMode==='playing'?'NAVIGATING…':navigationMode==='paused'?'RESUME':'START NAVIGATION'}</button>
              <button disabled={navigationMode!=='playing'} onClick={() => setNavigationMode('paused')}>PAUSE</button>
              <button onClick={() => {setNavigationMode('stopped');setTravelledMeters(0)}}>RESET</button>
            </div>
            <label className="nav-speed">SIMULATED SPEED
              <select value={simSpeed} onChange={event => setSimSpeed(Number(event.target.value))}>
                <option value={0.1}>0.1 m/s · slow</option><option value={0.2}>0.2 m/s · default</option><option value={0.5}>0.5 m/s</option><option value={1}>1 m/s · fast demo</option><option value={2}>2 m/s · accelerated</option>
              </select>
            </label>
            <div className="nav-maneuvers"><label>DIRECTIONS FROM A* PATH · {maneuvers.length} SEGMENTS</label>
              {maneuvers.map((m,i) => <div key={`${m.startIndex}-${i}`} className={`${i===activeManeuverIndex?'current ':''}${travelledMeters>=m.endMeters?'completed':''}`}>
                <b>{i+1}.</b><span>{m.instruction}</span><small>{m.endMeters.toFixed(1)} m</small>
              </div>)}
            </div>
            <div className="nav-position-update">
              <strong>POSITION UPDATES · TEST MODE</strong>
              <p>Enter the rover's newly reported grid location. The blue marker and next direction update without running the simulation clock.</p>
              <div className="position-fields"><label>ROW<input aria-label="Reported grid row" type="number" min="0" max="400" value={positionDraft.row} onChange={e=>setPositionDraft(v=>({...v,row:e.target.value}))}/></label><label>COL<input aria-label="Reported grid column" type="number" min="0" max="400" value={positionDraft.col} onChange={e=>setPositionDraft(v=>({...v,col:e.target.value}))}/></label><button onClick={updateReportedPosition}>UPDATE POSITION</button></div>
              {positionError && <p className="position-error" role="alert">{positionError}</p>}
              {positionMode==='manual' && !positionError && <small>Position accepted · {remainingMeters.toFixed(1)} m remain on planned path</small>}
            </div>
            <div className="nav-disclaimer">Directions use grid north/east and exact route-cell distances. Turn alerts are based on the simulated rover position. No physical vehicle or positioning sensor is connected.</div>
          </section>}
          {routeError && <div className="coordinate-error" role="alert">{routeError}</div>}
          {routeState === 'found' ? <><div className="demo-flag">SIMULATION</div><section className="route-details"><label>ROUTE SUMMARY</label><dl><div><dt>Algorithm</dt><dd>A* computed route</dd></div><div><dt>Destination</dt><dd>{destination?.point.row}, {destination?.point.col}</dd></div><div><dt>Terrain difficulty</dt><dd>{difficulty}</dd></div></dl></section></> :
          <div className="empty-state"><Icon name="route" size={27}/><strong>Awaiting destination</strong><span>Choose a destination to begin route planning.</span></div>}
          <div className="notice"><Icon name="help"/><span>NASA-derived terrain-cost simulation; not validated for actual rover driving.</span></div>
        </div>
      </aside>
    </div>

    <section className={`bottom-panel ${bottomOpen ? 'open' : ''}`}>
      <button className="bottom-handle" onClick={() => setBottomOpen(!bottomOpen)}><span><Icon name="route"/> ROUTE OVERVIEW</span><b>{routeState === 'found' ? `A* ROUTE · ${distance.toLocaleString()} M` : 'NO ACTIVE ROUTE'}</b><Icon name="chevron"/></button>
      <div className="bottom-content"><div className="timeline"><label>ROUTE STATUS TIMELINE</label>{['Destination selected','Grid validated','A* search complete','Route rendered'].map((item, index) => <span className={routeState === 'found' || (destination && index < 2) ? 'done' : ''} key={item}><i/>{item}</span>)}</div><div className="route-table"><label>ROUTE INFORMATION</label><div><span>START</span><span>DESTINATION</span><span>ALGORITHM</span><span>STATUS</span></div><div><b>{start ? `${start.point.row}, ${start.point.col}` : '—'}</b><b>{destination ? `${destination.point.row}, ${destination.point.col}` : '—'}</b><b>A* GRID</b><b>{routeState === 'found' ? 'SIMULATED' : 'PENDING'}</b></div></div><div className="elevation"><label>FUTURE ELEVATION PROFILE</label><span>Terrain values unavailable</span><i/></div></div>
    </section>
    {coordinateModal && <div className="modal-backdrop" onClick={() => setCoordinateModal(null)}><div className="coordinate-modal" onClick={event => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="coordinate-title"><button className="modal-close" onClick={() => setCoordinateModal(null)} aria-label="Close"><Icon name="close"/></button><span>CUSTOM LOCATION</span><h2 id="coordinate-title">Enter Grid Coordinates</h2><p>Choose a fully covered cell in the 401 × 401 navigation grid.</p><div className="coordinate-inputs"><label>ROW<input inputMode="numeric" value={coordinateDraft.row} onChange={event => setCoordinateDraft({ ...coordinateDraft, row: event.target.value })}/></label><label>COLUMN<input inputMode="numeric" value={coordinateDraft.col} onChange={event => setCoordinateDraft({ ...coordinateDraft, col: event.target.value })}/></label></div>{coordinateError && <div className="coordinate-error">{coordinateError}</div>}<button className="generate" onClick={applyCoordinates}>USE GRID LOCATION</button></div></div>}
    <footer>Research and educational prototype — not certified for astronaut navigation. <span>NASA SPACE APPS CHALLENGE 2026 · ORBIT GUARDIANS</span></footer>
  </main>
}

export default App

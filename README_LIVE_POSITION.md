# MarsPath — map navigation update

## Changes
- Browser wheel over Mars map zooms the map only (not page). Chrome Ctrl+wheel on map also prevented. Use zoom buttons if your browser intercepts browser zoom before sending it to the page.
- Generate Route button always shown in map header at desktop and mobile widths.
- Default simulated movement 0.2 m/s; Start button required. No real telemetry is connected.
- Removed fake/static mission clock label.
- Route panel now accepts **reported grid row and column**. Updates path progress, marker and instructions by nearest route segment, using a 7.5 m off-route threshold. Off-route positions trigger a warning and pause navigation.
- To integrate real position telemetry later, replace manual position input with verified rover localization reports and handle rerouting from arbitrary start grid cells in the backend.

## Run locally
1. Copy your previous navigation_grid.json to backend/.
2. Copy landing_area_ortho_preview.png and map_metadata.json to public/data/.
3. Create .env.local beside package.json: `VITE_API_URL=http://127.0.0.1:8000`
4. Run backend: `cd backend; python -m uvicorn main:app --reload --port 8000`
5. In a second terminal at project root: `npm install; npm run dev`

## Caution
Manual reported-position mode snaps observations within 7.5 metres of the planned route; it is a prototyping feature, not certified navigation. Off-route rerouting requires generalizing backend pathfinding to accept current position rather than fixed (200,200).

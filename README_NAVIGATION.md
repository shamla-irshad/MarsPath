# MarsPath turn-by-turn navigation (local simulation)

## Run on ONE laptop
1. Copy your existing `navigation_grid.json` into `backend/`.
2. Copy your `landing_area_ortho_preview.png` and `map_metadata.json` into `public/data/`.
3. Create `.env.local` next to `package.json` containing `VITE_API_URL=http://127.0.0.1:8000`.
4. Terminal 1: `cd backend`; `python -m pip install -r requirements.txt`; `python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000`.
5. Terminal 2 (project root): `npm install`; `npm run dev`. Open http://127.0.0.1:5173.
6. Select a destination, click **Generate Route**, then **Start Navigation** in the right panel. Adjust simulated speed; Pause/Resume/Reset as needed.

## What the navigation does
- Uses the exact ordered `path` returned by the `/api/route` A* endpoint, with 5 m per grid cell.
- Groups consecutive steps on the same 8-direction heading; changes of heading produce left/right/bear/sharp-turn cues. Some jagged grid routes have frequent turns.
- Animates a marker along the actual cell path and counts distance remaining based on elapsed real time multiplied by the *simulated* speed.
- Displays route direction relative to map north, not a physical user's body direction.
- **Not live telemetry or real GPS**: no Mars rover location sensor is connected; actual Mars positioning needs a rover/robot localization data stream (e.g. odometry/SLAM) and timestamped projected coordinates.
- Headings and distances are mathematically derived from the 5 m grid and are approximate relative to physical driving distances.
- The original grid validity/safety caveats remain: not rover-certified.

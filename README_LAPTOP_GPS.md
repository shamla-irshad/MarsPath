# MarsPath — Live Laptop Geolocation (Earth GPS)

## Setup (same Windows laptop)
1. Extract archive. Copy `navigation_grid.json` into `backend/`.
2. Copy NASA `landing_area_ortho_preview.png` and `map_metadata.json` into `public/data/`.
3. Create `.env.local` next to `package.json` with `VITE_API_URL=http://127.0.0.1:8000`.
4. In terminal one: `cd backend`, `python -m pip install -r requirements.txt`, then `python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload`. Stop any older backend on port 8000 first.
5. In terminal two (project root): `npm install`, `npm run dev`. Open `http://127.0.0.1:5173`.
6. In Route Intelligence on the right, press **START LAPTOP GPS**, allow Chrome location, observe accuracy. Press **STOP TRACKING** to end browser geolocation watches.

## Explicit Earth-to-Mars demo mapping
An optional demonstration origin maps the current Earth location estimate to Mars grid row 200, col 200. Local Earth east/north displacement (metres) is mapped into 5-metre Mars grid cells. This is NOT the user's real location on Mars. **Default is disabled.** To use: start GPS → SET DEMO ORIGIN → enable checkbox. Display on Mars requires reported horizontal accuracy <=10 m and a recent fix (<30 s). To update turn directions, estimated demo point must also fall within 7.5 metres of the planned route. With typical Windows Wi-Fi accuracy of ~125 m, mapping will *not* move the marker or offer misleading turn instructions. An independent simulated rover still works when GPS tracking is stopped.

## Privacy and limitations
Browser requests location permission explicitly. During tracking, frontend POSTs each fix to `http://127.0.0.1:8000/api/telemetry/earth` and backend holds only the latest Earth fix in RAM; no database or file writes. `GET /api/telemetry/earth` returns that last fix while the backend runs. Stopping browser tracking does not clear the latest fix held in backend memory; restarting FastAPI clears it. Protect the backend if exposing it beyond localhost. Actual real Mars telemetry is **not** supported. No automatic rerouting from arbitrary cells is claimed, because this backend currently starts only at (200,200). Browser accuracy is the platform's estimated horizontal confidence radius, not actual displacement.

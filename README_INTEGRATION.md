# MarsPath full-stack handover

This is Shamla’s original React interface with the fake route timer and curved route replaced by FastAPI A* results.

## Backend (your laptop, 10.34.11.162)

1. Copy your genuine `navigation_grid.json` to `backend/navigation_grid.json`, or set `MARSPATH_GRID` to its existing absolute Windows path.
2. In the `backend` folder: `python -m pip install -r requirements.txt`
3. Start: `python -m uvicorn main:app --host 0.0.0.0 --port 8000`
4. Open `http://10.34.11.162:8000/docs` and test `/api/route` with `{"destination":{"row":210,"col":215}}`.
5. Keep the backend server on a trusted private network. Do not forward port 8000 to the internet.

## Frontend (Shamla’s laptop, 10.34.8.160)

1. Copy `landing_area_ortho_preview.png` and `map_metadata.json` to `public/data/`. These are not provided in this ZIP.
2. Copy `.env.example` to `.env.local`, preserving `VITE_API_URL=http://10.34.11.162:8000`.
3. Run `npm install`, then `npm run dev`.
4. Select Example Destination (210, 215), click Generate Route.
5. Open browser DevTools > Network: confirm POST `/api/route` returns 200 and the real polyline appears.

## Notes

- The backend expects a 401x401 real navigation grid, with 255 blocked. It is not bundled due to absence from uploaded files.
- Map points are grid coordinates (row, col), not Earth latitude/longitude.
- Only Octavia E. Butler Landing (200,200) is supported as the start.
- `sample_route.json` is not required for the live API.
- If frontend origin is different, add its origin to `MARSPATH_CORS_ORIGINS` and restart the backend.
- This is a proof-of-concept and route traversability is only modeled from slope data.

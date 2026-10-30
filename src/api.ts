export type Cell = { row: number; col: number };
export type RouteResult = {
  status: 'found'; algorithm: string; start: Cell; destination: Cell;
  path: [number, number][]; distance_m: number; weighted_terrain_cost: number;
  steps: number; low_cost_cells: number; moderate_cost_cells: number;
  blocked_cells: number; projected_path_mars: { x: number; y: number }[];
  crs: string; simulation_only: boolean;
};
export class RouteApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000';
export async function requestRoute(destination: Cell): Promise<RouteResult> {
  const response = await fetch(`${API_BASE}/api/route`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination, start: { row: 200, col: 200 } })
  });
  const body = await response.json();
  if (!response.ok) throw new RouteApiError(response.status, body.detail?.code ?? 'SERVER_ERROR', body.detail?.message ?? 'Route request failed');
  return body as RouteResult;
}

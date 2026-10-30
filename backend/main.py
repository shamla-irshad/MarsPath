"""MarsPath terrain-grid A* API. Set MARSPATH_GRID to your navigation_grid.json path."""
import json, math, os, heapq
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

GRID_PATH = Path(os.environ.get('MARSPATH_GRID', str(Path(__file__).parent / 'navigation_grid.json')))
app = FastAPI(title='MarsPath Route API', version='1.0')
app.add_middleware(CORSMiddleware, allow_origins=[origin.strip() for origin in os.environ.get('MARSPATH_CORS_ORIGINS','http://localhost:5173,http://127.0.0.1:5173,http://10.34.8.160:5173').split(',') if origin.strip()], allow_credentials=False, allow_methods=['GET','POST'], allow_headers=['Content-Type'])
nav = None
costs = None

class Cell(BaseModel):
    row: int
    col: int

class RouteRequest(BaseModel):
    destination: Cell
    start: Cell | None = None

def load():
    global nav, costs
    if not GRID_PATH.is_file():
        raise RuntimeError(f'Missing grid: {GRID_PATH}. Set MARSPATH_GRID to its full path.')
    nav = json.loads(GRID_PATH.read_text(encoding='utf-8'))
    costs = nav['costs']
    if len(costs) != nav['height'] or any(len(row) != nav['width'] for row in costs):
        raise RuntimeError('Grid width/height mismatch')
    if nav['blocked_value'] != 255 or nav['cell_size_m'] != 5:
        raise RuntimeError('Unexpected grid contract')

@app.on_event('startup')
def startup():
    load()

def cell_ok(r,c):
    return 0 <= r < nav['height'] and 0 <= c < nav['width'] and costs[r][c] in (1,5)

def blocked_check(r,c):
    if not (0 <= r < nav['height'] and 0 <= c < nav['width']):
        raise HTTPException(400, detail={'code':'OUT_OF_BOUNDS','message':'Cell is outside the MarsPath grid'})
    if not cell_ok(r,c):
        raise HTTPException(422, detail={'code':'BLOCKED','message':'Cell is blocked or unknown'})

def astar(start, end):
    step = float(nav['cell_size_m'])
    def h(p): return step * math.hypot(p[0]-end[0], p[1]-end[1])
    queue=[(h(start), 0.0, start)]
    best={start:0.0}; prev={}; visited=set()
    while queue:
        _, g, current = heapq.heappop(queue)
        if current in visited: continue
        visited.add(current)
        if current == end:
            result=[end]
            while result[-1] != start: result.append(prev[result[-1]])
            return result[::-1]
        r,c=current
        for dr in (-1,0,1):
            for dc in (-1,0,1):
                if not(dr or dc): continue
                nr,nc=r+dr,c+dc
                if not cell_ok(nr,nc):continue
                if dr and dc and (not cell_ok(r+dr,c) or not cell_ok(r,c+dc)): continue
                neighbor=(nr,nc)
                length=step*(math.sqrt(2) if dr and dc else 1)
                new_g=g+length*costs[nr][nc]
                if new_g < best.get(neighbor,float('inf')):
                    best[neighbor]=new_g;prev[neighbor]=current
                    heapq.heappush(queue,(new_g+h(neighbor),new_g,neighbor))
    return None

def point_xy(row,col):
    # Rasterio affine [a,b,c,d,e,f] and center of a full 5x5 block
    a,b,c,d,e,f=nav['source_transform']; px=col*5+2.5; py=row*5+2.5
    return {'x':round(a*px+b*py+c,3),'y':round(d*px+e*py+f,3)}

@app.get('/api/health')
def health():
    return {'status':'ok','grid_loaded':nav is not None,'grid_size':[nav['height'],nav['width']]}

@app.get('/api/grid')
def grid():
    return {'width':nav['width'],'height':nav['height'],'cell_size_m':nav['cell_size_m'],'blocked_value':nav['blocked_value'],'start':{'row':int(nav['landing']['row']),'col':int(nav['landing']['col'])},'crs':'ESRI:103885'}

@app.get('/api/cell/{row}/{col}')
def cell(row:int,col:int):
    if not(0<=row<nav['height'] and 0<=col<nav['width']):
        raise HTTPException(400,detail={'code':'OUT_OF_BOUNDS','message':'Invalid cell'})
    value=costs[row][col]
    return {'row':row,'col':col,'cost':value,'traversable':value in (1,5)}

@app.post('/api/route')
def route(request:RouteRequest):
    l=nav['landing']; start=(int(l['row']),int(l['col']))
    if request.start is not None and (request.start.row,request.start.col)!=start:
        raise HTTPException(422,detail={'code':'START_FIXED','message':'Only Octavia E. Butler Landing is supported as the start'})
    end=(request.destination.row,request.destination.col)
    blocked_check(*start);blocked_check(*end)
    path=astar(start,end)
    if path is None:
        raise HTTPException(404,detail={'code':'UNREACHABLE','message':'No traversable route to destination'})
    distance=sum(float(nav['cell_size_m'])*(math.sqrt(2) if a[0]!=b[0] and a[1]!=b[1] else 1) for a,b in zip(path,path[1:]))
    weighted=sum(float(nav['cell_size_m'])*(math.sqrt(2) if a[0]!=b[0] and a[1]!=b[1] else 1)*costs[b[0]][b[1]] for a,b in zip(path,path[1:]))
    return {'status':'found','algorithm':'A*','start':{'row':start[0],'col':start[1]},'destination':{'row':end[0],'col':end[1]},'path':[[r,c] for r,c in path], 'distance_m':round(distance,2),'weighted_terrain_cost':round(weighted,2),'steps':len(path)-1,'low_cost_cells':sum(costs[r][c]==1 for r,c in path),'moderate_cost_cells':sum(costs[r][c]==5 for r,c in path),'blocked_cells':0,'projected_path_mars':[point_xy(r,c) for r,c in path],'crs':'ESRI:103885','simulation_only':True}

# Live Earth telemetry: separate from Mars route coordinates. Only last fix in RAM.
from threading import Lock
from time import time
from pydantic import Field

class EarthTelemetry(BaseModel):
    latitude: float = Field(ge=-90,le=90)
    longitude: float = Field(ge=-180,le=180)
    accuracy: float = Field(ge=0,le=1000000)
    timestamp: float = Field(ge=0)

_earth_lock = Lock()
_last_earth_fix = None

@app.post('/api/telemetry/earth')
def ingest_earth_fix(fix: EarthTelemetry):
    global _last_earth_fix
    with _earth_lock:
        _last_earth_fix = {**fix.model_dump(), 'received_at_unix_s':time()}
    return {'accepted':True,'coordinate_system':'Earth WGS84','mars_position':None,'navigation_safe':fix.accuracy <= 10}

@app.get('/api/telemetry/earth')
def latest_earth_fix():
    with _earth_lock:
        fix = dict(_last_earth_fix) if _last_earth_fix else None
    return {'status':'ready' if fix else 'no_fix','earth_fix':fix,'mars_position':None}

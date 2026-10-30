"""Run pytest after placing actual navigation_grid.json beside main.py."""
from fastapi.testclient import TestClient
from main import app, load

def test_mars_grid():
    load()
    client=TestClient(app)
    r=client.get('/api/health')
    assert r.status_code==200 and r.json()['grid_loaded']
    g=client.get('/api/grid').json()
    assert g['width']==401 and g['height']==401 and g['start']=={'row':200,'col':200}
    start=client.get('/api/cell/200/200').json()
    assert start['cost']==1 and start['traversable']
    result=client.post('/api/route',json={'destination':{'row':210,'col':215}})
    assert result.status_code==200,result.text
    data=result.json()
    assert data['path'][0]==[200,200] and data['path'][-1]==[210,215]
    assert data['blocked_cells']==0
    assert data['distance_m']>0
    for r,c in data['path']:
        assert client.get(f'/api/cell/{r}/{c}').json()['traversable']

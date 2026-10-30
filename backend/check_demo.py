"""A standalone smoke test against synthetic data; never claims to test NASA raster."""
import json, tempfile
from pathlib import Path
import main
from fastapi.testclient import TestClient
from fastapi import HTTPException
with tempfile.TemporaryDirectory() as d:
    f=Path(d)/'navigation_grid.json'
    cost=[[1]*401 for _ in range(401)]
    for r in range(202,208): cost[r][207]=255
    f.write_text(json.dumps({'width':401,'height':401,'cell_size_m':5,'blocked_value':255,'landing':{'row':200,'col':200},'costs':cost,'source_transform':[1,0,4589872,0,-1,1094305]}))
    main.GRID_PATH=f
    main.load()
    client=TestClient(main.app)
    assert client.get('/api/health').json()['status']=='ok'
    result=client.post('/api/route',json={'destination':{'row':210,'col':215}})
    assert result.status_code==200,result.text
    body=result.json()
    assert body['path'][0]==[200,200] and body['path'][-1]==[210,215]
    assert all(cost[r][c] != 255 for r,c in body['path'])
    assert client.post('/api/route',json={'destination':{'row':205,'col':207}}).status_code==422
    assert client.post('/api/route',json={'destination':{'row':500,'col':0}}).status_code==400
    print('PASS synthetic smoke tests',body['distance_m'],'m')

"""Pack northbound Blender road tiles with the existing Zhubei landscape in its shared OSM projection.
Run after extract_roads.mjs decathlon-sheraton and build_roads.py; pass the tile directory.
"""
import json
import math
import sys
from pathlib import Path

root=Path(__file__).resolve().parents[1]
world=root/'dist/assets/world'
route_id='decathlon-sheraton'
route=json.loads((root/'dist/data/routes'/f'{route_id}.json').read_text())
tiles=Path(sys.argv[1])
roads=json.loads((tiles/'manifest.json').read_text())
base=json.loads((world/'zhubei-tsmc.json').read_text())
original=(world/'zhubei-tsmc.bin').read_bytes()
def read_section(item):
    return original[item['offset']:item['offset']+item['length']]
def near_route(tile):
    x,z=tile['x']*500,tile['z']*500
    return any(math.hypot(max(x-p['x'],p['x']-x-500,0),
                          max(z-p['z'],p['z']-z-500,0))<1250 for p in route['points'][::8])
with (world/f'{route_id}.bin').open('wb') as archive:
    def append(data):
        assert data[:4]==b'glTF'
        segment={'offset':archive.tell(),'length':len(data)}
        archive.write(data)
        return segment
    road_tiles=[{'x':t['x'],'z':t['z'],**append((tiles/t['file']).read_bytes())} for t in roads['tiles']]
    global_mesh=append(read_section(base['scenery']['global']))
    scenery_tiles=[{'x':t['x'],'z':t['z'],**append(read_section(t))} for t in base['scenery']['tiles'] if near_route(t)]
    terrain=append(read_section(base['terrain']))
    result={'version':1,'id':route_id,'roads':{'tiles':road_tiles},'scenery':{'tiles':scenery_tiles,'global':global_mesh},'terrain':terrain,'byteLength':archive.tell()}
(world/f'{route_id}.json').write_text(json.dumps(result,separators=(',',':')))

"""Pack Blender GLB tiles into range-addressable route archives."""
import json,pathlib,sys
if len(sys.argv)!=3:raise SystemExit('Usage: pack_world.py RAW_ASSETS_DIR OUTPUT_DIR')
root,out=map(pathlib.Path,sys.argv[1:]);out.mkdir(parents=True,exist_ok=True)
routes=['zhubei-tsmc','zhubei-mediatek','erchong-tsmc','erchong-mediatek','guanxin-tsmc','guanxin-mediatek','tsmc-guanxin','mediatek-guanxin']
for route in routes:
 out_file=out/(route+'.bin');manifest={'version':1,'id':route};offset=0
 with out_file.open('wb') as dest:
  def append(file):
   global offset
   data=file.read_bytes();assert data[:4]==b'glTF';entry={'offset':offset,'length':len(data)};dest.write(data);offset+=len(data);return entry
  for kind in ('roads','scenery'):
   directory=root/kind/route;data=json.loads((directory/'manifest.json').read_text());assert data['id']==route and data['tileSize']==500
   section={'tiles':[]}
   if data.get('global'):section['global']=append(directory/data['global'])
   for tile in data['tiles']:
    r=append(directory/tile['file']);section['tiles'].append({'x':tile['x'],'z':tile['z'],**r})
   manifest[kind]=section
  manifest['terrain']=append(root/'terrain'/(route+'-terrain.glb'));manifest['byteLength']=offset
 (out/(route+'.json')).write_text(json.dumps(manifest,separators=(',',':')))
 print(route,round(offset/1048576,2),'MiB')

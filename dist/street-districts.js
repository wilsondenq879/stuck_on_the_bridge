// World-space bounds in the common OSM projection, including both approaches.
const districts=[
 ['city',-930,-455,3200,3840],['park',-1730,-268,3880,5280],
 ['campus',-6130,-5920,5280,5520],['hill',-7550,-5670,4870,6060]
];
export class StreetDistricts {
 constructor(tiles){this.tiles=tiles;this.assets=new Map();this.closed=false;}
 async near(x,z){
  await Promise.all(districts.map(async ([key,x0,x1,z0,z1])=>{
   const distance=Math.hypot(Math.max(x0-x,0,x-x1),Math.max(z0-z,0,z-z1));
   const old=this.assets.get(key);
   if(distance>1350&&old?.root){
    this.tiles.root.remove(old.root);this.tiles.destroy(old.root);this.assets.delete(key);
   }
   if(distance>730||this.closed)return;
   if(old)return old.promise;
   const entry={};this.assets.set(key,entry);
   entry.promise=(async()=>{
    const response=await fetch('assets/streets/'+key+'.glb.gz?v=0981');
    if(!response.ok)throw Error('街景載入失敗 '+key);
    let bytes=await response.arrayBuffer();
    // A host can serve .gz as a file or decode it via Content-Encoding.
    if(new Uint8Array(bytes)[0]===0x1f)bytes=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    const {scene}=await this.tiles.loader.parseAsync(bytes,'');
    if(this.closed){this.tiles.destroy(scene);return;}
    entry.root=scene;this.tiles.root.add(scene);
   })().catch(e=>{this.assets.delete(key);throw e;});
   return entry.promise;
  }));
 }
 dispose(){this.closed=true;for(const a of this.assets.values())if(a.root){this.tiles.root.remove(a.root);this.tiles.destroy(a.root);}this.assets.clear();}
}

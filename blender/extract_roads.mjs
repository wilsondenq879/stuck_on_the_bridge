import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {Route,seeded}=await import(repo+'/dist/geo.js');const THREE=await import(repo+'/dist/vendor/three.module.js');
const {DrivingWorld}=await import(repo+'/dist/world.js');const {bikeBranches}=await import(repo+'/dist/road-geometry.js');
const read=p=>JSON.parse(fs.readFileSync(path.join(repo,'dist/data',p)));
const index=read('routes/index.json'),overpasses=read('overpasses.json');
const target=path.resolve('road-intermediate');fs.mkdirSync(target,{recursive:true});
for(const item of index.routes.filter(r=>!process.argv[2]||process.argv[2]===r.id)){
 const data=read('routes/'+item.file),w=Object.create(DrivingWorld.prototype);w.route=new Route(data);
 w.bikeRoute=new Route({...data,points:data.bikePoints,lengthMeters:data.bikeLengthMeters});w.branches=bikeBranches(w.route,w.bikeRoute);
 w.interchange=(data.sceneryProfile==='south-hsinchu'||data.opposingAlignment)?null:overpasses;w.scene=new THREE.Scene();w.rng=seeded(12);
 const colors={road:0x465051,side:0x979f93,median:0xc4c4ae,paint:0xe1e0cb,yellow:0xdbb755,metal:0x737d76,leaf:0x62785b,trunk:0x77705c};
 w.mats=Object.fromEntries(Object.entries(colors).map(([k,v])=>[k,new THREE.MeshStandardMaterial({name:k,color:v})]));
 w.prepareRoadClearance();w.makeRoad();w.scene.updateMatrixWorld(true);
 const tiles=new Map(),pt=new THREE.Vector3(),world=new THREE.Matrix4(),inst=new THREE.Matrix4(),tri=[];
 w.scene.traverse(o=>{if(!o.isMesh)return;const attr=o.geometry.getAttribute('position'),index=o.geometry.index;
  const count=index?index.count:attr.count,repeat=o.isInstancedMesh?o.count:1,mat=o.material.name||'road';
  for(let n=0;n<repeat;n++){
   if(o.isInstancedMesh){o.getMatrixAt(n,inst);world.multiplyMatrices(o.matrixWorld,inst);}else world.copy(o.matrixWorld);
   for(let i=0;i+2<count;i+=3){tri.length=0;
    for(let j=0;j<3;j++){pt.fromBufferAttribute(attr,index?index.getX(i+j):i+j).applyMatrix4(world);tri.push(pt.x,pt.y,pt.z);}
    const x=Math.floor((tri[0]+tri[3]+tri[6])/3/500),z=Math.floor((tri[2]+tri[5]+tri[8])/3/500),key=x+','+z;
    if(!tiles.has(key))tiles.set(key,new Map());const tile=tiles.get(key);if(!tile.has(mat))tile.set(mat,[]);
    const out=tile.get(mat);for(let j=0;j<9;j+=3)out.push(tri[j]-x*500,tri[j+1],tri[j+2]-z*500);
   }
  }
 });
 const result={id:item.id,tileSize:500,tiles:[...tiles].map(([key,mats])=>({x:Number(key.split(',')[0]),z:Number(key.split(',')[1]),meshes:[...mats].map(([material,v])=>({material,vertices:Buffer.from(new Float32Array(v).buffer).toString('base64')}))}))};
 const outfile=path.join(target,item.id+'.json');fs.writeFileSync(outfile,JSON.stringify(result));console.log(item.id,'tiles',tiles.size,'MiB',(fs.statSync(outfile).size/1048576).toFixed(2));
}

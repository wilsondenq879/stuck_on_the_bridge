import * as THREE from './vendor/three.module.js';
import {hillHeight} from './corridor.js';

// Adapt the original Blender tiles in their common, metre-based world coordinates.
export function liftHill(scene){
 scene.updateMatrixWorld(true);
 const pos=new THREE.Vector3(),matrix=new THREE.Matrix4(),up=new THREE.Vector3(),inverse=new THREE.Matrix4();
 scene.traverse(o=>{
  if(!o.isMesh)return;
  if(o.isInstancedMesh){if(!o.boundingBox)o.computeBoundingBox();}
  else if(!o.geometry.boundingBox)o.geometry.computeBoundingBox();
  const bounds=(o.isInstancedMesh?o.boundingBox:o.geometry.boundingBox).clone().applyMatrix4(o.matrixWorld);
  if(bounds.max.x< -7104||bounds.min.x> -5112||bounds.max.z<4656||bounds.min.z>6840)return;
  inverse.copy(o.matrixWorld).invert();
  up.set(0,1,0).applyMatrix4(inverse).sub(new THREE.Vector3().applyMatrix4(inverse));
  if(o.isInstancedMesh){
   for(let i=0;i<o.count;i++){
    o.getMatrixAt(i,matrix);pos.setFromMatrixPosition(matrix).applyMatrix4(o.matrixWorld);
    const h=hillHeight(pos.x,pos.z);
    matrix.elements[12]+=up.x*h;matrix.elements[13]+=up.y*h;matrix.elements[14]+=up.z*h;o.setMatrixAt(i,matrix);
   }
   o.instanceMatrix.needsUpdate=true;o.computeBoundingSphere();return;
  }
  const a=o.geometry.attributes.position;
  if(!a)return;
  // Meshes may share geometry but have different world transforms.
  let writable=null;
  for(let i=0;i<a.count;i++){
   pos.fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld);const h=hillHeight(pos.x,pos.z);
   if(!h)continue;
   if(!writable){o.geometry=o.geometry.clone();writable=o.geometry.attributes.position;}
   writable.setXYZ(i,a.getX(i)+up.x*h,a.getY(i)+up.y*h,a.getZ(i)+up.z*h);
  }
  if(writable){o.geometry.computeBoundingSphere();o.geometry.computeBoundingBox();}
 });
}
export function lineDividers(route){
 const cells=new Map();
 for(let i=1;i<route.points.length;i++){
  const p=route.points[i-1],q=route.points[i];
  if(p.bridge||p.highway?.startsWith('motorway')||p.geometryCenter!=='shared_bidirectional_way')continue;
  const dx=q.x-p.x,dz=q.z-p.z,len=Math.hypot(dx,dz);if(!len)continue;
  const rx=-dz/len,rz=dx/len,w=route.width(p.s)/2;
  const seg={x:p.x-rx*w,z:p.z-rz*w,dx,dz,len,rx,rz};
  for(let x=Math.floor((Math.min(p.x,q.x)-12)/32);x<=Math.floor((Math.max(p.x,q.x)+12)/32);x++)
   for(let z=Math.floor((Math.min(p.z,q.z)-12)/32);z<=Math.floor((Math.max(p.z,q.z)+12)/32);z++){
    const k=x+','+z;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(seg);
   }
 }
 return (x,z)=>{
  let found=null,min=3;
  for(const s of cells.get(Math.floor(x/32)+','+Math.floor(z/32))||[]){
   const t=Math.max(0,Math.min(1,((x-s.x)*s.dx+(z-s.z)*s.dz)/s.len**2));
   const d=Math.hypot(x-s.x-t*s.dx,z-s.z-t*s.dz);
   if(d<min){min=d;found=s;}
  }
  return found;
 };
}
export function flattenDividers(scene,lookup){
 scene.updateMatrixWorld(true);const extra=[],v=new THREE.Vector3();
 scene.traverse(o=>{
  if(!o.isMesh||!['median','yellow'].includes(o.material.name))return;
  const g=o.geometry,a=g.attributes.position,idx=g.index,keep=[],flat=[],stripe=[];
  for(let i=0;i<(idx?.count??a.count);i+=3){
   const ids=[0,1,2].map(j=>idx?idx.getX(i+j):i+j);
   const pts=ids.map(j=>v.fromBufferAttribute(a,j).applyMatrix4(o.matrixWorld).clone());
   const c=pts[0].clone().add(pts[1]).add(pts[2]).multiplyScalar(1/3);
   const s=lookup(c.x,c.z);
   if(!s||Math.max(...pts.map(p=>p.y))>.19||Math.min(...pts.map(p=>p.y))<.05){keep.push(...ids);continue;}
   if(o.material.name==='median'){
    if(pts.every(p=>p.y>.17))for(const p of pts)flat.push(p.x,.061,p.z);
   }else{
    for(const shift of [-.68,-1.0])for(const p of pts)stripe.push(p.x+s.rx*shift,.085,p.z+s.rz*shift);
   }
  }
  g.setIndex(keep);
  for(const [verts,color] of [[flat,0x465051],[stripe,0xdbb755]]){
   if(!verts.length)continue;const geom=new THREE.BufferGeometry();geom.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geom.computeVertexNormals();
   extra.push(new THREE.Mesh(geom,new THREE.MeshStandardMaterial({color,side:THREE.DoubleSide})));
  }
 });
 for(const mesh of extra)scene.add(mesh);
}

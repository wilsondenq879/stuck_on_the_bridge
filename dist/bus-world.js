import * as THREE from './vendor/three.module.js';
import {drawText} from './game-text.js?v=0.8.2-puns';

export function makeBusParts(part,materials){
 const {body,glass,rubber,chrome,red,white}=materials;
 const cube=new THREE.BoxGeometry(1,1,1);
 const B=(mat,x,y,z,w,h,d,color=false)=>part(cube,mat,[x,y,z],[w,h,d],[0,0,0],color);
 const cream=new THREE.MeshStandardMaterial({color:0xe3d5b9,roughness:.6});
 const stripe=new THREE.MeshStandardMaterial({color:0xa33e37,roughness:.45});
 B(cream,0,1.5,0,2.43,2.28,9.8);
 B(glass,0,2.28,-4.91,2.2,1.12,.025);
 B(glass,0,2.25,4.91,1.96,1.02,.025);
 B(stripe,0,.8,0,2.46,.48,9.82);
 B(cream,0,2.94,0,2.48,.18,9.84);
 B(chrome,0,.47,-4.94,2.28,.18,.12);B(chrome,0,.47,4.94,2.28,.18,.12);
 for(const x of [-1.225,1.225]){
  for(let j=0;j<8;j++)B(glass,x,2.25,-3.5+j*1.0,.025,1.02,.83);
  B(stripe,x,1.52,0,.03,.17,9.5);
  for(const z of [-2.9,2.9]){
   part(new THREE.CylinderGeometry(.5,.5,.24,12),rubber,[x,.5,z],[1,1,1],[0,0,Math.PI/2]);
   part(new THREE.CylinderGeometry(.25,.25,.255,10),chrome,[x,.5,z],[1,1,1],[0,0,Math.PI/2]);
  }
  B(chrome,x*1.15,2.55,-4.3,.12,.5,.28);B(glass,x*1.17,2.55,-4.45,.15,.41,.22);
 }
 B(glass,1.24,1.72,-3.63,.035,1.95,1.0);
 B(chrome,1.264,1.72,-3.63,.025,1.95,.05);
 for(const x of [-.9,.9]){
  B(red,x,1.02,4.94,.19,.31,.045,'brake');
  B(white,x,.93,-4.94,.48,.16,.045,'headlight');
 }
 B(rubber,0,1.15,4.94,1.14,.32,.03);
 B(chrome,0,.64,4.96,.58,.2,.02);
 if(typeof document!=='undefined'){
  const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle='#832e2a';ctx.fillRect(0,0,512,128);ctx.fillStyle='#f8e9b6';ctx.font='600 67px sans-serif';ctx.textAlign='center';drawText(ctx,'康橋交通車',256,89);
  const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.MeshStandardMaterial({map:tex,side:THREE.DoubleSide});
  part(new THREE.PlaneGeometry(1.9,.48),sign,[0,2.91,-4.94],[1,1,1],[0,Math.PI,0]);
  part(new THREE.PlaneGeometry(1.9,.42),sign,[0,2.91,4.94],[1,1,1],[0,0,0]);
  part(new THREE.PlaneGeometry(3.3,.82),sign,[-1.24,1.4,0],[1,1,1],[0,-Math.PI/2,0]);
  part(new THREE.PlaneGeometry(3.3,.82),sign,[1.24,1.4,0],[1,1,1],[0,Math.PI/2,0]);
 }
}

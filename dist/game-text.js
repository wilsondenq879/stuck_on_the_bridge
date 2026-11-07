import {NAME_ALIASES} from './name-aliases.js?v=0.8.2-puns';

const escapePattern=value=>value.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
const pattern=new RegExp(Object.keys(NAME_ALIASES).sort((a,b)=>b.length-a.length).map(escapePattern).join('|'),'g');

export function gameText(value){
 return String(value).replace(pattern,name=>NAME_ALIASES[name]);
}

export function drawText(context,value,...position){
 context.fillText(gameText(value),...position);
}

// The display layer also covers option captions and text updated by the HUD.
// IDs, option values, source URLs and the canonical route data remain usable
// by their existing callers.
export function installGameText(root){
 if(root.ownerDocument?.title)root.ownerDocument.title=gameText(root.ownerDocument.title);
 const skip=new Set(['SCRIPT','STYLE','NOSCRIPT','CODE','PRE']);
 const attributes=['aria-label','title','alt'];
 function update(node){
  if(node.nodeType===3){
   if(skip.has(node.parentElement?.tagName))return;
   const text=gameText(node.data);if(text!==node.data)node.data=text;
  }else if(node.nodeType===1){
   if(skip.has(node.tagName))return;
   for(const attribute of attributes){
    const original=node.getAttribute(attribute);
    if(original){const text=gameText(original);if(text!==original)node.setAttribute(attribute,text);}
   }
   for(const child of node.childNodes)update(child);
  }
 }
 update(root);
 const observer=new MutationObserver(records=>{
  for(const record of records){
   if(record.type==='childList'){for(const node of record.addedNodes)update(node);}
   else update(record.target);
  }
 });
 observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});
 return observer;
}

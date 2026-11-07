const ID=/^(zhubei|erchong|guanxin|tsmc|mediatek)-(tsmc|mediatek|guanxin)$/;
export class WorldArchive{
 static async create(id){
  if(!ID.test(id))throw Error('無效路線');const base='assets/world/'+id;
  const response=await fetch(base+'.json?v=0.9.7');if(!response.ok)throw Error('場景索引讀取失敗');const data=await response.json();
  if(data.version!==1||data.id!==id||!Number.isSafeInteger(data.byteLength)||data.byteLength<1||data.byteLength>30000000||!Array.isArray(data.roads?.tiles)||!Array.isArray(data.scenery?.tiles))throw Error('場景索引不正確');
  const archive=new WorldArchive(base+'.bin?v=0.9.7',data),probe=await fetch(archive.url,{headers:{Range:'bytes=0-0'}});if(!probe.ok)throw Error('場景資源讀取失敗');
  const body=await probe.arrayBuffer();if(probe.status===206){if(body.byteLength!==1||!/^bytes 0-0\//.test(probe.headers.get('Content-Range')||''))throw Error('場景分段回應不正確');archive.supportsRanges=true;}
  else if(probe.status===200&&body.byteLength===data.byteLength)archive.full=body;
  else throw Error('場景資源大小不正確');return archive;
 }
 constructor(url,data){this.url=url;this.data=data;this.full=null;this.supportsRanges=false;}
 async get(segment){
  const {offset,length}=segment||{};if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<=0||offset+length>this.data.byteLength)throw Error('場景區塊範圍不正確');
  if(this.full)return this.full.slice(offset,offset+length);
  const end=offset+length-1,response=await fetch(this.url,{headers:{Range:`bytes=${offset}-${end}`}});if(!response.ok)throw Error('場景區塊下載失敗');const bytes=await response.arrayBuffer();
  if(response.status===206){if(bytes.byteLength!==length||!(response.headers.get('Content-Range')||'').startsWith(`bytes ${offset}-${end}/`))throw Error('場景區塊下載不完整');return bytes;}
  if(response.status===200&&bytes.byteLength===this.data.byteLength){this.full=bytes;return bytes.slice(offset,offset+length);}
  throw Error('場景區塊回應不正確');
 }
 dispose(){this.full=null;}
}

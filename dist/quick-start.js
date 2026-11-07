// Fast previews begin upstream of junction boxes, even for a long school bus.
// This changes only the initial station, never the day's randomly rolled rules.
export function safeRoadStart(station,intersections=[],length=4.45){
 let s=Math.max(0,station);
 for(const light of [...intersections].filter(q=>q.signalTagged).sort((a,b)=>b.s-a.s)){
  if(s>light.s-12-length/2&&s<light.s+24+length/2)s=Math.max(0,light.s-20-length/2);
 }
 return s;
}

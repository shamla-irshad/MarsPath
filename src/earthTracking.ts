export type EarthFix = {latitude:number;longitude:number;accuracy:number;timestamp:number}
const DEG = Math.PI/180
// Short-range tangent-plane approximation for explicitly labeled Earth-to-Mars demo only.
export function earthDeltaMeters(origin:EarthFix, fix:EarthFix){
  const north = (fix.latitude-origin.latitude)*DEG*6371000
  const east = (fix.longitude-origin.longitude)*DEG*6371000*Math.cos((fix.latitude+origin.latitude)/2*DEG)
  return {north,east}
}
export function nearestRouteProgress(path:number[][], cum:number[], row:number, col:number){
  let separationM=Infinity,progressM=0
  for(let i=0;i<path.length-1;i++){
    const [r,c]=path[i], [r2,c2]=path[i+1];const dr=r2-r,dc=c2-c
    const squared=dr*dr+dc*dc
    const t=Math.max(0,Math.min(1,((row-r)*dr+(col-c)*dc)/(squared||1)))
    const dist=Math.hypot(row-(r+t*dr),col-(c+t*dc))*5
    if(dist<separationM){separationM=dist;progressM=cum[i]+t*(cum[i+1]-cum[i])}
  }
  return {separationM,progressM}
}

// MarsPath navigation instructions derived from the ACTUAL FastAPI A* cell sequence.
// Coordinates are grid-relative: smaller row = map north, larger col = map east.
export type GridCell = [number, number]
export type Maneuver = { startIndex: number; endIndex: number; startMeters: number; endMeters: number; meters: number; heading: string; action: string; instruction: string }
export const STEP_METERS = 5
export function stepDistance(a: GridCell, b: GridCell): number { return Math.hypot((b[0]-a[0])*STEP_METERS, (b[1]-a[1])*STEP_METERS) }
export function cumulativeDistances(path: GridCell[]): number[] {
  const out = [0]
  for (let i=1;i<path.length;i++) out.push(out[i-1]+stepDistance(path[i-1],path[i]))
  return out
}
function headingIndex(a: GridCell,b: GridCell): number {
  const bearing = Math.atan2(b[1]-a[1],a[0]-b[0])
  return ((Math.round(bearing/(Math.PI/4))%8)+8)%8
}
const headings = ['north','northeast','east','southeast','south','southwest','west','northwest']
function turnText(previous:number,next:number): string {
  const delta = (next-previous+8)%8
  if(delta===0) return 'Continue straight'
  if(delta===4) return 'Turn around'
  if(delta===1) return 'Bear right'
  if(delta===2) return 'Turn right'
  if(delta===3) return 'Turn sharply right'
  if(delta===7) return 'Bear left'
  if(delta===6) return 'Turn left'
  return 'Turn sharply left'
}
export function buildManeuvers(path: GridCell[]): Maneuver[] {
  if(path.length<2) return []
  const cum=cumulativeDistances(path)
  const result:Maneuver[]=[]
  let start=0
  let heading=headingIndex(path[0],path[1])
  for(let segment=1;segment<=path.length-1;segment++) {
    const nextHeading=segment<path.length-1?headingIndex(path[segment],path[segment+1]):-1
    if(nextHeading===heading) continue
    const action=result.length===0?'Head':turnText(headingIndex(path[start===0?0:start-1],path[start===0?1:start]),heading)
    const meters=cum[segment]-cum[start]
    result.push({startIndex:start,endIndex:segment,startMeters:cum[start],endMeters:cum[segment],meters,heading:headings[heading],action,instruction:`${action} ${headings[heading]} for ${meters.toFixed(1)} m`})
    start=segment
    heading=nextHeading
  }
  return result
}
export function interpolatePosition(path: GridCell[],cum:number[],distance:number): {row:number;col:number;segment:number} | null {
  if(!path.length) return null
  if(path.length===1)return {row:path[0][0],col:path[0][1],segment:0}
  let i=0
  while(i<cum.length-2 && cum[i+1]<=distance)i++
  const span=Math.max(0.000001,cum[i+1]-cum[i])
  const t=Math.max(0,Math.min(1,(distance-cum[i])/span))
  return {row:path[i][0]+(path[i+1][0]-path[i][0])*t,col:path[i][1]+(path[i+1][1]-path[i][1])*t,segment:i}
}

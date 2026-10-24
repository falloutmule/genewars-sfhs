/** One source8CBA0 material/border operation, without building reservations. */
import {cellIndex,repairMaterials,rebuildBorders,type TerrainState} from "./terrain";
export function prepareExtractorDepletedCell(terrain:TerrainState,cell:number,border8192:readonly number[]):{changedCells:number[];dirtyPoints:[number,number][]}{
  if(terrain.bytes.length!==229376||!Number.isInteger(cell)||cell<0||cell>=16384||border8192.length!==8192||border8192.some(v=>!Number.isInteger(v)||v<0||v>255))throw Error("Actual8CBA0 terrain/cell/border table required");
  const before=terrain.bytes.slice(),x=cell&127,y=cell>>7;
  for(const[dx,dy]of[[0,0],[1,0],[1,1],[0,1]]){const at=cellIndex(x+dx,y+dy)*14+5;if(terrain.bytes[at]&7)terrain.bytes[at]=(terrain.bytes[at]&248)|7;}
  const around:number[]=[],recomputed=new Set<number>();
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    around.push(cellIndex(x+dx,y+dy));
    const linear=(y+dy)*128+x+dx;
    //Literal-1 means pointer-derived index; the source passes its row-start.
    repairMaterials(terrain,linear===-1?cellIndex(x-1,y+dy):linear);
    for(const[ax,ay]of[[0,0],[-1,0],[-1,-1],[0,-1]])recomputed.add(cellIndex(x+dx+ax,y+dy+ay));
  }
  const forced:number[]=[];
  for(const c of recomputed){const at=c*14;if((terrain.bytes[at+5]&128)&&terrain.bytes[at+4]===151){forced.push(c);terrain.bytes[at+5]&=127;}}
  rebuildBorders(terrain,around,border8192);
  const dirtyPoints:[number,number][]=[];
  //8D1B0 visits the expanded rectangle in row-major order. The dirty flags12
  //belong to later753F0 reservation work, not to standalone8CBA0 depletion.
  for(let dy=-2;dy<=1;dy++)for(let dx=-2;dx<=1;dx++){
    const c=cellIndex(x+dx,y+dy);
    if(!(terrain.bytes[c*14+5]&128))dirtyPoints.push([((x+dx)<<8)<<17>>17,((y+dy)<<8)<<17>>17]);
  }
  for(const c of forced)terrain.bytes[c*14+5]|=128;
  const changedCells:number[]=[];
  for(let c=0;c<16384;c++)if(terrain.bytes.slice(c*14,c*14+14).some((v,i)=>v!==before[c*14+i]))changedCells.push(c);
  return{changedCells,dirtyPoints};
}

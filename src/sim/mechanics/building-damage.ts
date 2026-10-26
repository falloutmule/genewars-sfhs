/**446D0 damage,44380 retirement and43620/43560 owner accounting.
 * The caller stages the complete world before executing these ordered ports. */
import {nextRandom,type GeneRng} from "./random";
import {groundHeight,cellIndex,repairMaterials,rebuildBorders,type TerrainState} from "./terrain";
import type {SourceEntityId} from "../campaign/source-pools";
export interface BuildingDamageWorld {terrain:TerrainState;rng:GeneRng;buildingNative:(number|null)[][];players:{raw:number[]}[]}
export interface BuildingDamageRules {buildingFootprints:readonly number[];buildingHealth:readonly number[];buildingNameIndices:readonly number[]}
export interface BuildingDamageEffect {code:5|27|28|29|30|31|46;owner:0|4;position:[number,number];height:number;angles:[number,number,number];parameter:number;delay:0}
export type BuildingDamageEvent=
  |{type:"stop-audio";slot:number;channel:0x23|0x2f}
  |{type:"depleted-audio";slot:number;channel:0x4e;mode:2;parameter:0;volume:127;ratePercent:number}
  |{type:"destroyed-message";owner:number;nameIndex:number;mode:2;volume:127;ratePercent:100;parameter:0;extra64:64}
  |{type:"selection-cleared";slot:number}
  |{type:"selection-refresh";slot:number};
export interface BuildingDamageContext<W extends BuildingDamageWorld=BuildingDamageWorld>{
  rules:BuildingDamageRules;
  gameplayRunning:boolean;
  selectedBuildingSlot:number|null;
  /**48790, including immediate code5 area damage and native prior/RNG/capacity. */
  createEffect(world:W,request:BuildingDamageEffect):unknown;
  /**4EB80 family6 selector3,owner4; its32-slot capacity failure is permitted. */
  createCollapse(world:W,request:{code:3;owner:4;position:[number,number];buildingSlot:number;completed:boolean}):unknown;
  /**8ACC0 then724C0 and normalized binding cleanup while nativekind is4.
   * This port must not change owner counts/completion totals or clearkind. */
  unlinkBuilding(world:W,slot:number):void;
  /**44380 selector2/4's8B2A0 operation0/1, after footprint/count cleanup and
   * before selection/unlink. Clears the actual processing-front reservations;
   * does not unlink the plant/corpse, clear buildingkind or change balances. */
  clearProcessingFront?(world:W,slot:number):void;
  /**44380 selector5:753F0(size3,B1,C0) at the stored building point.
   * This sets the source launch footprint after ordinary footprint clearing. */
  restoreRecruitmentFootprint?(world:W,slot:number):void;
  /**79160→77C60; actual25×176 prior, capacity failure permitted. */
  createCrater(world:W,request:{position:[number,number];variant:0|1}):unknown;
  onEvent?(world:W,event:BuildingDamageEvent):void;
}
export interface BuildingDamageReceipt {slot:number;damage:number;destroyed:boolean;effects:BuildingDamageEffect[];events:BuildingDamageEvent[];clearedCells:number[];crater:{position:[number,number];variant:0|1}|null;capacityAfter:number;maximumGenepodGrade:number}
function byte(n:readonly(number|null)[],at:number){const value=n[at];if(value===null||value===undefined)throw new Error("Original building damage native field is uninitialized");return value;}
const wrap=(value:number)=>(value<<16)>>16;
const word=(n:readonly(number|null)[],at:number)=>wrap(byte(n,at)|(byte(n,at+1)<<8));
const dword=(n:readonly(number|null)[],at:number)=>(word(n,at)&65535)|(word(n,at+2)<<16);
const put=(n:(number|null)[],at:number,value:number)=>{n[at]=value&255;n[at+1]=(value>>8)&255;};
const put32=(n:(number|null)[],at:number,value:number)=>{put(n,at,value);put(n,at+2,value>>16);};
function partition(w:BuildingDamageWorld,owner:number){if(w.buildingNative.length!==256)throw new Error("Original256 building priors are required");return w.buildingNative.slice(owner*64,owner*64+64);}
/**43620 runs BEFORE the dying building is unlinked, matching source ordering. */
export function updateNativeBuildingCapacity(w:BuildingDamageWorld,owner:number):{capacity:number;maximumGenepodGrade:number}{const raw=w.players[owner]?.raw,active=partition(w,owner).filter(n=>n[6]!==0);if(!raw||raw.length!==1805||raw[0x4a1]!==owner||((raw[0x4a2]<<24)>>24)!==active.length)throw new Error("Original player building partition/count is inconsistent");let capacity=0,maximumGenepodGrade=0;
  for(const n of active){const flags=word(n,49)&65535,selector=byte(n,45),grade=byte(n,46);if(!(flags&0x840)){if(selector===11)capacity=(capacity+600)|0;else if(selector===4)capacity=(capacity+(grade+1)*400)|0;else if(selector===13)capacity=(capacity+(grade+1)*500)|0;}if(selector===0&&(flags&1)&&!(flags&0x140))maximumGenepodGrade=Math.max(maximumGenepodGrade,grade);}
  put32(raw,0x5e6,capacity);raw[0x6e1]=maximumGenepodGrade;return {capacity,maximumGenepodGrade};
}
/**753F0 flags1/16 clear only. Classification/borders wait for real crater jobs.
 * 8D5F0 increments native cell pointers across X rows; do not invent X wrapping. */
export function clearDestroyedFootprint(terrain:TerrainState,position:[number,number],footprint:number):number[]{if(![1,2,3].includes(footprint))throw new Error("Original building footprint is invalid");const touched=new Set<number>(),cx=(position[0]>>8)&127,cy=(position[1]>>8)&127,shift=footprint===1?0:-1;
  for(let y=0;y<footprint;y++)for(let x=0;x<footprint;x++){const cell=(((cy+shift+y)&127)*128)+((cx+shift+x)&127);terrain.bytes[cell*14+11]&=254;touched.add(cell);}
  const dim=footprint+1,anchorX=(cx+shift)&127,anchorY=(cy+shift)&127;
  for(let y=0;y<dim;y++)for(let x=0;x<dim;x++){const cell=((anchorY+y)&127)*128+anchorX+x;if(cell>=16384)throw new Error("Source building footprint clear crosses map into another source pool");terrain.bytes[cell*14+11]&=239;touched.add(cell);}
  terrain.revision++;return [...touched];
}
/**44380's selector5 retains EAX=building+7 despite computing an unused offset.
 * The subsequent753F0(size3,B1,C0) SETS a fixed surface at that stored point.
 * Material/border preparation is8CBA0; vertices use8D580's linear X pointer. */
export function setNativeBuildingFootprint(
  terrain:TerrainState,position:[number,number],footprint:2|3,border:readonly number[],
):number[]{
  if(terrain.bytes.length!==128*128*14||position.length!==2||
    position.some(v=>!Number.isInteger(v)||v< -32768||v>32767)||
    (footprint!==2&&footprint!==3)||
    border.length!==8192||border.some(v=>!Number.isInteger(v)||v<0||v>255))
    throw Error("Original Recruitment Center retirement terrain/border required");
  const touched=new Set<number>(),vertices:number[]=[],
    anchorX=((position[0]>>8)-1)&127,anchorY=((position[1]>>8)-1)&127;
  const dim=footprint+1;
  for(let y=0;y<dim;y++)for(let x=0;x<dim;x++){
    const cell=((anchorY+y)&127)*128+anchorX+x;
    if(cell>=16384)throw Error("Source recruitment footprint crosses map into another source pool");
    vertices.push(cell);
  }
  const steps=footprint===2?[[-1,0],[0,-1],[1,0]]:
    [[0,-1],[-1,0],[0,1],[0,1],[1,0],[1,0],[0,-1],[0,-1]];
  let cx=position[0]>>8,cy=position[1]>>8;
  for(let step=0;step<=steps.length;step++){
    const cell=cellIndex(cx,cy);
    for(const[dx,dy]of[[0,0],[1,0],[1,1],[0,1]]){
      const at=cellIndex(cx+dx,cy+dy)*14+5;
      if(terrain.bytes[at]&7)terrain.bytes[at]=(terrain.bytes[at]&248)|7;
    }
    const around:number[]=[],recomputed=new Set<number>(),sx=cell&127,sy=cell>>7;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const current=cellIndex(cx+dx,cy+dy);around.push(current);
      //8CBA0 supplies an unwrapped linear cell index to8B890. An X borrow
      //or carry changes its row before8B890 masks X/Y; wrap each axis only
      //for the separate border rectangle below.
      const linear=(sy+dy)*128+sx+dx;
      //The literal-1 operand invokes8B890's pointer-derived-index branch.
      //8CBA0 supplies its fixed row-start pointer, not the current X cell.
      repairMaterials(terrain,linear===-1?cellIndex(sx-1,sy+dy):linear);
      for(const[ax,ay]of[[0,0],[-1,0],[-1,-1],[0,-1]])
        recomputed.add(cellIndex(cx+dx+ax,cy+dy+ay));
    }
    //8D1B0 uses texture97 as a recomputation sentinel, including a retained
    //97 on an otherwise protected80 cell. Adapt the shared border calculator
    //only during this synchronous operation, restoring that exact bit below.
    const forced:number[]=[];
    for(const c of recomputed){const at=c*14;
      if((terrain.bytes[at+5]&128)&&terrain.bytes[at+4]===151){
        forced.push(c);terrain.bytes[at+5]&=127;
      }
    }
    rebuildBorders(terrain,around,border);
    for(const c of recomputed)if(!(terrain.bytes[c*14+5]&128)){
      terrain.bytes[c*14+11]|=12;touched.add(c);
    }
    for(const c of forced)terrain.bytes[c*14+5]|=128;
    terrain.bytes[cell*14+11]|=1;touched.add(cell);
    if(step<steps.length){cx+=steps[step][0];cy+=steps[step][1];}
  }
  for(const cell of vertices){terrain.bytes[cell*14+11]|=16;touched.add(cell);}
  return [...touched];
}
export function restoreRecruitmentFootprint(
  terrain:TerrainState,position:[number,number],border:readonly number[],
):number[]{return setNativeBuildingFootprint(terrain,position,3,border);}
function updateMean(w:BuildingDamageWorld,owner:number){const raw=w.players[owner].raw,count=(raw[0x4a2]<<24)>>24;if(count<=0)return;const live=partition(w,owner).filter(n=>n[6]!==0);if(live.length!==count)throw new Error("Source building mean/count differs");const sum=[0,0];for(const n of live){sum[0]+=(word(n,7)>>8)&255;sum[1]+=(word(n,9)>>8)&255;}put(raw,0x5fc,Math.trunc(sum[0]/count)<<8);put(raw,0x5fe,Math.trunc(sum[1]/count)<<8);}
/** Native damage family for admitted Genepod/Turret/Pulper/Distributor/Recycling Plant/
 * Recruitment Center/Photon/Extractor selectors0/1/2/3/4/5/6/11. Other selectors require their
 * special callbacks. The caller's transaction includes ordered front cleanup. */
export function damageNativeBuilding<W extends BuildingDamageWorld>(w:W,slot:number,damage:number,attacker:{id:SourceEntityId;owner:number}|null,c:BuildingDamageContext<W>):BuildingDamageReceipt {
  if(!Number.isInteger(slot)||slot<0||slot>=256||!Number.isInteger(damage)||damage<0||damage>32767)throw new Error("Invalid source building damage request");
  const n=w.buildingNative[slot];if(!n||n.length!==67||n.slice(31,39).some(v=>v!==null)||n[6]!==4||word(n,15)!==slot)throw new Error("Original live67-byte building record is required");
  const owner=byte(n,24),selector=byte(n,45),grade=byte(n,46),raw=w.players[owner]?.raw,position:[number,number]=[word(n,7),word(n,9)],health=word(n,43),flags=word(n,49)&65535,footprint=c.rules.buildingFootprints[selector];
  if(![0,1,2,3,4,5,6,11,13].includes(selector)||owner!==Math.trunc(slot/64)||!raw||raw.length!==1805||grade>2||c.rules.buildingHealth.length!==42||c.rules.buildingNameIndices.length!==14||c.rules.buildingFootprints.length!==14||![1,2,3].includes(footprint))throw new Error("Unadmitted source building damage selector/owner/rules");
  const out:BuildingDamageReceipt={slot,damage,destroyed:damage>=health,effects:[],events:[],clearedCells:[],crater:null,capacityAfter:dword(raw,0x5e6),maximumGenepodGrade:raw[0x6e1]},emit=(event:BuildingDamageEvent)=>{out.events.push(event);c.onEvent?.(w,event);},effect=(request:BuildingDamageEffect)=>{if(!c.createEffect)throw new Error("Source48790 destruction effect factory is required");out.effects.push(request);c.createEffect(w,request);};
  if(word(raw,0x5ec)===0)put(raw,0x5ec,1000);put(raw,0x5f4,100);
  const debris=()=>{const speed=5120+(nextRandom(w.rng)%80)*64,pitch=nextRandom(w.rng)%320-160,yaw=nextRandom(w.rng)%2045,code=(27+nextRandom(w.rng)%5)as 27|28|29|30|31;effect({code,owner:0,position:[...position],height:groundHeight(w.terrain,...position),angles:[yaw,pitch,speed],parameter:80,delay:0});};
  if(out.destroyed){const aggregate=updateNativeBuildingCapacity(w,owner);out.capacityAfter=aggregate.capacity;out.maximumGenepodGrade=aggregate.maximumGenepodGrade;
    if(selector===1||selector===6)emit({type:"stop-audio",slot,channel:0x23});else if(selector===11)emit({type:"stop-audio",slot,channel:0x2f});
    if([0,1,3].includes(selector)){if(!c.createCollapse)throw new Error("Source4EB80 family6 building collapse factory is required");c.createCollapse(w,{code:3,owner:4,position:[...position],buildingSlot:slot,completed:!!(flags&1)});}
    effect({code:46,owner:0,position:[...position],height:groundHeight(w.terrain,...position),angles:[0,0,0],parameter:200,delay:0});
    emit({type:"destroyed-message",owner,nameIndex:c.rules.buildingNameIndices[selector]+grade,mode:2,volume:127,ratePercent:100,parameter:0,extra64:64});
    out.clearedCells=clearDestroyedFootprint(w.terrain,position,footprint);if(flags&1){const currentRaw=w.players[owner].raw;currentRaw[0x600+selector]=(currentRaw[0x600+selector]-1)&255;}
    if(selector===2||selector===4){if(!c.clearProcessingFront)throw new Error("Source44380/8B2A0 processing-front cleanup is required");c.clearProcessingFront(w,slot);}
    else if(selector===5){if(!c.restoreRecruitmentFootprint)throw Error("Source44380 Recruitment Center footprint restoration is required");c.restoreRecruitmentFootprint(w,slot);}
    if(selector===13){const currentRaw=w.players[owner].raw;put32(currentRaw,0x4a7,(dword(currentRaw,0x4a7)-dword(w.buildingNative[slot],54))|0);}
    if(c.selectedBuildingSlot===slot)emit({type:"selection-cleared",slot});
    if(!c.unlinkBuilding)throw new Error("Source8ACC0/724C0 building retirement service is required");c.unlinkBuilding(w,slot);w.buildingNative[slot][6]=0;const currentRaw=w.players[owner].raw;currentRaw[0x4a2]=(currentRaw[0x4a2]-1)&255;updateMean(w,owner);
    if(footprint>1){if(!c.createCrater)throw new Error("Source79160 crater terrain-job factory is required");out.crater={position:[...position],variant:(footprint-2)as 0|1};c.createCrater(w,out.crater);}
    for(let i=0;i<footprint*3;i++)debris();
    effect({code:5,owner:4,position:[...position],height:groundHeight(w.terrain,...position),angles:[0,0,0],parameter:flags&1?0:1,delay:0});
    if(attacker&&attacker.owner!==4){if(attacker.owner<0||attacker.owner>=4)throw new Error("Source attacker owner is invalid");const attackerRaw=w.players[attacker.owner].raw;put32(attackerRaw,0x701,(dword(attackerRaw,0x701)+1)|0);}
  }else{put(n,43,health-damage);if(!(flags&0x40)&&word(n,43)<Math.trunc(c.rules.buildingHealth[selector*3+grade]/3)){
      n[21]=byte(n,21)|4;put(n,49,word(n,49)|0x140);const aggregate=updateNativeBuildingCapacity(w,owner);out.capacityAfter=aggregate.capacity;out.maximumGenepodGrade=aggregate.maximumGenepodGrade;if(selector===0)put32(n,54,0);
      if(c.gameplayRunning){emit({type:"depleted-audio",slot,channel:0x4e,mode:2,parameter:0,volume:127,ratePercent:115-footprint*15});if(c.selectedBuildingSlot===slot)emit({type:"selection-refresh",slot});}
    }
    if(nextRandom(w.rng)%30<damage)debris();w.buildingNative[slot][48]=11;
  }
  return out;
}

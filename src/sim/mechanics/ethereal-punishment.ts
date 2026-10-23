/** Source11C3B..12A83 parent state7. Logical target views and destructive
 * services are staged host bindings; absence must reject at the real call. */
import { nextRandom,type GeneRng } from "./random";
import type { EtherealRecord,EtherealContext,EtherealUpdate } from "./ethereal";
import type { SourceEntityId } from "../campaign/source-pools";
export interface PunishmentTarget {id:SourceEntityId;kind:1|3|4;index:number;owner:number;position:[number,number];ground:number;height:number;health:number;native:(number|null)[]}
export interface PunishmentQuery {center:[number,number];radius:2048;stepX:256|-256;stepY:256|-256;points:[number,number][]}
export interface EtherealPunishmentServices {
  resolve(kind:1|3|4,index:number):PunishmentTarget|null;
  /**13A40 spatial head->next, sameowner, virtual68false, kind1/3/4,
   * 2D73690 <=radius², strictnearestperkind. Seven entries indexednativekind. */
  nearby(parent:EtherealRecord,query:PunishmentQuery):readonly(PunishmentTarget|null)[];
  /**51E80 complete real work/assignment cancellation before51E30 writes. */
  cancelUnitWork(parent:EtherealRecord,target:PunishmentTarget):void;
  /**57740 complete unit unlink/reference/player-list/stat/selection cleanup. */
  removeUnit(parent:EtherealRecord,target:PunishmentTarget):void;
  /**446D0 full damage/destruction, terrain/owner state and real effect factories. */
  damageBuilding(parent:EtherealRecord,target:PunishmentTarget,damage:number):void;
  /**6D830 leading aim then48790 code25,parameter128, parentlogicalreference. */
  attack(parent:EtherealRecord,target:PunishmentTarget):void;
}
const wrap=(v:number)=>(v<<16)>>16;
function b(n:readonly(number|null)[],at:number){const v=n[at];if(v===null||v===undefined)throw new Error("Punishment native field is uninitialized");return v;}
const word=(n:readonly(number|null)[],at:number)=>wrap(b(n,at)|(b(n,at+1)<<8));
const dword=(n:readonly(number|null)[],at:number)=>(word(n,at)&65535)|(word(n,at+2)<<16);
const put=(n:(number|null)[],at:number,v:number)=>{n[at]=v&255;n[at+1]=(v>>8)&255;};
const put32=(n:(number|null)[],at:number,v:number)=>{put(n,at,v);put(n,at+2,v>>16);};
const signedByte=(v:number)=>(v<<24)>>24;
function stop(n:(number|null)[]){put(n,0x3f,0);put(n,0x49,word(n,0x49)&0xefe8);n[0x54]=0;n[0x16]=b(n,0x16)&0x3f;}
function services(c:EtherealContext){if(!c.punishment)throw new Error("Source Ethereal punishment destructive services are required");return c.punishment;}
function target(c:EtherealContext,kind:number,index:number):PunishmentTarget|null {
  if(![1,3,4].includes(kind))return null;
  const t=services(c).resolve(kind as 1|3|4,index);
  if(t&&(t.kind!==kind||t.index!==index||t.id!==`source:${kind-1}:${index}`))throw new Error("Punishment logical target binding differs");
  return t;
}
function retained(n:(number|null)[],c:EtherealContext){return target(c,b(n,0x5b),word(n,0x59));}
function bind(n:(number|null)[],t:PunishmentTarget){put(n,0x59,t.index);n[0x5b]=t.kind;}
function pointGoal(n:(number|null)[],at:[number,number],height:number){put(n,11,at[0]);put(n,13,at[1]);n[0x16]=b(n,0x16)&0x3f;n[0x49]=b(n,0x49)|0x14;put(n,0x49,word(n,0x49)&0xeffc);n[0x54]=20;n[0x4f]=n[0x52]=0;n[0x4a]=b(n,0x4a)&0x3f;put32(n,0x60,height);put(n,0x3f,1920);put(n,0x64,0);}
function credit(n:(number|null)[],c:EtherealContext,out:EtherealUpdate){const severity=signedByte(b(n,0x58)),raw=c.playerRaw(b(n,24));if(severity<1||severity>3||c.observationThresholds.length!==3)throw new Error("Punishment severity profile is invalid");let value=c.observationThresholds[severity-1]|0;if(raw[2]!==0)value=(value+value)|0;const delta=Math.imul(value,c.punishmentDivisor)>>8,next=(c.playerCounter(b(n,24))+delta)|0;out.playerCounterAfter=next>0?0:next;n[0x57]=0;}
function channel(out:EtherealUpdate,cue:number,rate=100){out.events.push({type:"audio-moving",channel:cue,mode:2,parameter:255,volume:127,initialRatePercent:100,adjustedRatePercent:rate});}
function query(record:EtherealRecord,rng:GeneRng):PunishmentQuery{const n=record.native,center:[number,number]=[word(n,7),word(n,9)],stepX=nextRandom(rng)%2===0?256:-256,stepY=nextRandom(rng)%2===0?256:-256,points:[number,number][]=[];for(let ix=-8;ix<=8;ix++)for(let iy=-8;iy<=8;iy++)if(ix*ix+iy*iy<=64)points.push([wrap(center[0]+ix*stepX),wrap(center[1]+iy*stepY)]);return {center,radius:2048,stepX,stepY,points};}
function chooseBuilding(record:EtherealRecord,c:EtherealContext,rng:GeneRng,preferDistributor:boolean,advanceBeforeFirst:boolean):PunishmentTarget {
  const owner=b(record.native,24),views=c.buildings(owner);if(views.length!==64)throw new Error("Punishment original64-building partition required");
  let index=nextRandom(rng)%64,step=nextRandom(rng)%10<5?-1:1;
  if(preferDistributor){let visited=0,active=0;while(active<=64){index=(index+64+step)%64;const view=views[index];if(view.active){active++;if(view.selector===1){const t=target(c,4,view.slot);if(!t)throw new Error("Punishment building live binding is missing");return t;}}if(++visited>64*65)throw new Error("Punishment building count has no active source slot");}}
  if(advanceBeforeFirst)index=(index+64+step)%64;
  for(let visited=0;visited<64;visited++){const view=views[index];if(view.active){const t=target(c,4,view.slot);if(!t)throw new Error("Punishment building live binding is missing");return t;}index=(index+64+step)%64;}
  throw new Error("Punishment player building count has no active source slot");
}
function buildingPunishment(record:EtherealRecord,c:EtherealContext,rng:GeneRng,out:EtherealUpdate){const n=record.native,stage=b(n,0x57),owner=b(n,24),raw=c.playerRaw(owner);
  if(stage===1){if(signedByte(raw[0x4a2])===0){n[0x57]=0;return;}const t=chooseBuilding(record,c,rng,raw[0x601]>0,false);bind(n,t);pointGoal(n,[wrap(t.position[0]+32),wrap(t.position[1]+32)],(t.ground+12800)|0);n[0x57]=2;}
  else if(stage===2){if(!retained(n,c)){stop(n);n[0x57]=0;return;}if(b(n,0x49)&0x20){put(n,0x64,100);n[0x57]=3;}}
  else if(stage===3){const before=word(n,0x64);channel(out,0x5f,before<80?wrap(200-Math.trunc(before*100/80)):100);const remaining=wrap(before-1);put(n,0x64,remaining);if(remaining===0){out.events.push({type:"stop-audio",channel:0x5f});const t=retained(n,c);if(t){if(t.kind!==4)throw new Error("Punishment building reference kind differs");if(!c.punishment?.damageBuilding)throw new Error("Source446D0 building destruction service is required");c.punishment.damageBuilding(record,t,t.health);}put(n,0x64,50);n[0x57]=4;}}
  else if(stage===4){const timer=wrap(word(n,0x64)-1);put(n,0x64,timer);if(timer===0)credit(n,c,out);}
}
function unitPunishment(record:EtherealRecord,c:EtherealContext,rng:GeneRng,out:EtherealUpdate){const n=record.native,stage=b(n,0x57),raw=c.playerRaw(b(n,24));
  if(stage===1){const count=signedByte(raw[3]);if(count===0){n[0x57]=0;return;}if(count<0||count>5)throw new Error("Punishment source unit list count is invalid");let selected:PunishmentTarget|null=null;
    for(let attempts=0;attempts<30;attempts++){const index=signedByte(raw[4+nextRandom(rng)%count]),t=target(c,3,index);if(!t)throw new Error("Punishment player unit list has no live target");if(!(b(t.native,0x71)&4)){selected=t;break;}}
    if(!selected){n[0x57]=0;return;}bind(n,selected);if(!c.punishment?.cancelUnitWork)throw new Error("Source51E80 unit work cancellation service is required");c.punishment.cancelUnitWork(record,selected);
    if(selected.native.length!==200||selected.native[6]!==3)throw new Error("Original200-byte specialist runtime image is required for abduction");
    selected.native[0x55]=3;put(selected.native,0x7f,record.slot);selected.native[0x81]=8;selected.native[25]=8;put32(selected.native,0x68,10);
    pointGoal(n,[wrap(selected.position[0]+16),wrap(selected.position[1]+16)],(selected.ground+12800)|0);n[0x57]=2;
  }else if(stage===2){if(b(n,0x49)&0x20){put(n,0x64,30);n[0x57]=3;}}
  else if(stage===3){const before=word(n,0x64);channel(out,0x5e,wrap(Math.trunc(before*100/30)+100));const timer=wrap(before-1);put(n,0x64,timer);if(timer===0){put(n,0x64,40);n[0x57]=4;}}
  else if(stage===4){channel(out,0x5e);const timer=wrap(word(n,0x64)-1);put(n,0x64,timer);if(timer===0){put(n,0x64,120);n[0x57]=5;const t=retained(n,c);if(!t||t.kind!==3){n[0x57]=0;return;}t.native[0x15]=b(t.native,0x15)|0x20;}}
  else if(stage===5){const before=word(n,0x64);channel(out,0x5e,wrap(200-Math.trunc(before*100/120)));const t=retained(n,c);if(!t||t.kind!==3){n[0x57]=0;return;}const timer=wrap(before-1);put(n,0x64,timer);if(timer===0){if(!c.punishment?.removeUnit)throw new Error("Source57740 unit removal service is required");c.punishment.removeUnit(record,t);credit(n,c,out);}else put32(t.native,0x27,(t.ground+Math.trunc(Math.imul(120-timer,(dword(n,0x27)-dword(n,17))|0)/120))|0);}
}
function attackPunishment(record:EtherealRecord,c:EtherealContext,rng:GeneRng,out:EtherealUpdate){const n=record.native,stage=b(n,0x57),owner=b(n,24),raw=c.playerRaw(owner);
  if(stage===1){if(!c.punishment?.nearby)throw new Error("Source13A40 punishment spatial target query is required");const choices=c.punishment.nearby(record,query(record,rng));if(choices.length!==7||choices.some((t,i)=>t&&(t.kind!==i||t.owner!==owner)))throw new Error("Punishment nearest-per-kind source query is invalid");let selected:PunishmentTarget|null=null;
    if(choices.some(t=>t!==null)){let index=nextRandom(rng)%7;for(let i=0;i<7;i++,index=(index+1)%7)if(choices[index]){selected=choices[index];break;}}
    else {const unit=raw[0x4a2]!==0?nextRandom(rng)%10<6:true;if(unit){const count=signedByte(raw[3]);if(count===0){n[0x57]=0;return;}if(count<0||count>5)throw new Error("Punishment unit list count is invalid");selected=target(c,3,signedByte(raw[4+nextRandom(rng)%count]));}else selected=chooseBuilding(record,c,rng,false,false);}
    if(!selected)throw new Error("Punishment selected target is unbound");bind(n,selected);n[0x16]=b(n,0x16)&0x3f;n[0x49]=b(n,0x49)|0x14;put(n,0x49,word(n,0x49)&0xeffc);n[0x54]=20;n[0x4f]=0;put(n,0x50,selected.index);n[0x52]=selected.kind;put32(n,0x60,12800);n[0x4a]=b(n,0x4a)&0x3f;put(n,0x3f,1920);put(n,0x64,30);n[0x57]=2;
  }else if(stage===2){const t=retained(n,c);if(!t){n[0x57]=0;return;}const timer=word(n,0x64);if(timer>0){put(n,0x64,wrap(timer-1));return;}const dx=wrap(wrap(t.position[0]-word(n,7))*2)>>1,dy=wrap(wrap(t.position[1]-word(n,9))*2)>>1;if(((Math.imul(dx,dx)+Math.imul(dy,dy))|0)>0x190000)return;
    if(!c.punishment?.attack)throw new Error("Source6D830/code19 punishment attack factory is required");c.punishment.attack(record,t);credit(n,c,out);stop(n);
  }
}
export function stepEtherealPunishment(record:EtherealRecord,c:EtherealContext,rng:GeneRng,out:EtherealUpdate){const severity=b(record.native,0x58);if(severity===2)buildingPunishment(record,c,rng,out);else if(severity===3)unitPunishment(record,c,rng,out);else attackPunishment(record,c,rng,out);}
/**6FB60 target50 refresh points for real following-reference movement. */
export function refreshPunishmentTarget(record:EtherealRecord,c:EtherealContext){const n=record.native;if(b(n,0x52)===0||(word(n,0x3f)<=0&&!(b(n,0x49)&0x10)))return;if(b(n,0x4f)!==0)throw new Error("Ethereal building-route reference is not admitted");const flags=word(n,0x49),phase=(c.frame+record.slot)&3;if((flags&12)!==0||(phase===3&&(flags&3)===0)){const t=target(c,b(n,0x52),word(n,0x50));if(!t)throw new Error("Ethereal following target reference is unbound");put(n,11,t.position[0]);put(n,13,t.position[1]);}}



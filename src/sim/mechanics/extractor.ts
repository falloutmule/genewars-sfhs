/** Complete native451F0 selector11 body/common tail. Required cross-pool work
 * executes immediately in the caller's isolated transaction. */
import { advanceAnimation, type AnimationProfile } from "./animation";
import { nextRandom, type GeneRng } from "./random";
import { groundHeight, worldCell, type TerrainState } from "./terrain";

export type ExtractorNative = (number | null)[];
export interface NativeExtractorWorld {
  frame: number;
  buildingNative: ExtractorNative[];
  players: { id: number; raw: number[] }[];
  terrain: TerrainState;
  rng: GeneRng;
}
export interface ExtractorAudio {
  type: "play" | "stop";
  slot: number;
  cue: 47 | 48 | 50 | 78;
  mode?: 2;
  parameter?: 0 | 255;
  volume?: number;
  range?: number;
  initialRatePercent?: number;
}
export interface ExtractorConditionalAudio {
  type: "if-playing-stop-play";
  slot: number;
  cue: 47;
  nextCue: 48;
  nextParameter: 0;
  nextRange: 100;
  nextGain: number;
}
export interface ExtractorSmoke {
  code: 6;
  sourceSlot: number;
  position: [number, number];
  height: number;
  angles: [number, number, number];
  owner: 0;
  parameter: 0;
  delay: 0;
}
export interface NativeExtractorContext<W extends NativeExtractorWorld> {
  upkeep: readonly number[];
  contactOffset: readonly [number, number];
  workDelayBase: number;
  profile(world: W, slot: number, action: 0 | 1 | 2 | 3 | 4): AnimationProfile;
  audio(world: W, request: ExtractorAudio): void;
  conditionalAudio(world: W, request: ExtractorConditionalAudio): void;
  createSmoke(world: W, request: ExtractorSmoke): number | null;
  firstForeignCreature(world: W, point: [number, number], owner: number): number | null;
  firstOwnCreature(world: W, point: [number, number], owner: number): number | null;
  creatureVirtual68(world: W, creature: number): boolean;
  damageCreature(world: W, creature: number, amount: 0 | 8 | 16, attacker: null): void;
  depleteCell(world: W, cell: number): void;
  exhausted(world: W, slot: number): void;
  dirtyScanEndpoint(world: W, point: [number, number]): void;
  queueBuilding(world: W, slot: number): void;
  /** Immediate mirror only, after actual terrain byte13 subtraction. */
  resourceChanged?(world: W, cell: number): void;
}
export interface NativeExtractorReceipt {
  handled: true;
  slot: number;
  selector: 11;
  grade: 0 | 1 | 2;
  operational: boolean;
  harvested: number;
  credited: number;
  selectedCell: number | null;
  depletedCell: number | null;
  empty: boolean;
  contactedCreature: number | null;
  smokeSlots: number[];
  queueRequested: boolean;
  audio: (ExtractorAudio | ExtractorConditionalAudio)[];
}
const integer = (v: number, lo: number, hi: number) => Number.isInteger(v) && v >= lo && v <= hi;
function byte(n: readonly (number | null)[], p: number): number {
  const v = n[p];
  if (v === null || v === undefined || !integer(v, 0, 255)) throw Error(`Actual Extractor byte ${p} required`);
  return v;
}
const word = (n: readonly (number | null)[], p: number) => ((byte(n,p) | byte(n,p+1)<<8)<<16)>>16;
const dword = (n: readonly (number | null)[], p: number) => ((word(n,p)&65535)|(word(n,p+2)<<16))>>>0;
const put = (n: ExtractorNative, p: number, v: number) => { n[p]=v&255; n[p+1]=(v>>8)&255; };
const put32 = (n: ExtractorNative, p: number, v: number) => { put(n,p,v);put(n,p+2,v>>>16); };
const wrap = (v: number) => (v<<16)>>16;

/** No clone or partial commit. The host must roll back all ports on failure. */
export function stepStagedNativeExtractor<W extends NativeExtractorWorld>(w: W, slot: number, c: NativeExtractorContext<W>): NativeExtractorReceipt {
  const n=w.buildingNative[slot], owner=n?.[24], raw=typeof owner==="number"?w.players.find(p=>p.id===owner)?.raw:undefined;
  if (!integer(slot,0,255)||!integer(w.frame,0,0xffffffff)||w.buildingNative.length!==256||!n||n.length!==67||n[6]!==4||n[45]!==11||owner===null||owner===undefined||owner!==Math.floor(slot/64)||word(n,15)!==slot||byte(n,46)>2||n.slice(31,39).some(v=>v!==null)||!raw||raw.length!==1805||raw[1]!==owner||raw[0x4a1]!==owner||w.terrain.bytes.length!==229376) throw Error("Actual Extractor native67/owner1805/terrain/frame required");
  if (word(n,49)&0x800) throw Error("Actual451F0 common demolition callback required");
  if (c.upkeep.length!==14||!integer(c.upkeep[11],0,255)||!integer(c.workDelayBase,3,127)||c.contactOffset.length!==2||c.contactOffset.some(v=>!integer(v,-32768,32767))) throw Error("Admitted Extractor upkeep/contact/animation delay required");
  const grade=byte(n,46) as 0|1|2, pool=w.buildingNative, terrain=w.terrain, bytes=terrain.bytes, player=w.players.find(p=>p.id===owner)!;
  const held=()=>{if(w.buildingNative!==pool||pool[slot]!==n||player.raw!==raw||!w.players.includes(player)||w.terrain!==terrain||terrain.bytes!==bytes)throw Error("Extractor service replaced a held native/player/terrain");};
  const r:NativeExtractorReceipt={handled:true,slot,selector:11,grade,operational:false,harvested:0,credited:0,selectedCell:null,depletedCell:null,empty:false,contactedCreature:null,smokeSlots:[],queueRequested:false,audio:[]};
  const audio=(cue:ExtractorAudio["cue"],parameter:0|255=0,volume=127)=>{const q:ExtractorAudio={type:"play",slot,cue,mode:2,parameter,volume,range:100};if(!c.audio)throw Error("Extractor audio request service required");r.audio.push(q);c.audio(w,q);held();};
  const stop=()=>{const q:ExtractorAudio={type:"stop",slot,cue:47};if(!c.audio)throw Error("Extractor stop request service required");r.audio.push(q);c.audio(w,q);held();};
  const oldAction=byte(n,25),oldPower=byte(n,49)&4,flags=word(n,49)&65535;
  if((flags&1)&&!(flags&0x40)){
    put(n,61,word(n,61)-c.upkeep[11]-byte(n,63));
    if(word(n,61)<=0){put(n,61,0);if(!(word(n,49)&0x100)){n[49]=byte(n,49)&251;if(word(raw,0x5ea)===0)put(raw,0x5ea,1000);}}
    if(byte(n,27)!==0){n[28]=1;n[21]=byte(n,21)|4;}
    else{
      n[28]=0;
      if(!c.conditionalAudio)throw Error("Extractor ordered conditional audio service required");
      const q:ExtractorConditionalAudio={type:"if-playing-stop-play",slot,cue:47,nextCue:48,nextParameter:0,nextRange:100,nextGain:80/127};
      r.audio.push(q);c.conditionalAudio(w,q);held();
    }
    if(byte(n,27)===17){n[27]=0;n[28]=0;n[21]=byte(n,21)|4;}
    if(word(n,61)!==0&&(word(n,49)&1)&&!(word(n,49)&0x140)){
      r.operational=true;
      const oldCycle=byte(n,51);n[51]=(oldCycle+1)&255;
      if(oldCycle>=240){n[51]=0;if(dword(raw,0x4a7)<dword(raw,0x5e6)){n[27]=1;n[29]=c.workDelayBase-grade;audio(47,255);}}
      if(byte(n,27)>=7&&byte(n,27)<=10){
        const point:[number,number]=[wrap(word(n,7)+c.contactOffset[0]),wrap(word(n,9)+c.contactOffset[1])];
        if((w.frame+byte(n,15))&1){
          const speed=(nextRandom(w.rng)%30)<<6,pitch=nextRandom(w.rng)%160-80,yaw=nextRandom(w.rng)%2045;
          if(!c.createSmoke)throw Error("Actual Extractor smoke6 factory required");
          const made=c.createSmoke(w,{code:6,sourceSlot:slot,position:point,height:groundHeight(terrain,...point),angles:[yaw,pitch,speed],owner:0,parameter:0,delay:0});held();
          if(made!==null){if(!integer(made,0,199))throw Error("Actual Extractor smoke slot required");r.smokeSlots.push(made);}
        }
        if(!c.firstForeignCreature||!c.firstOwnCreature||!c.creatureVirtual68)throw Error("Actual lazy Extractor contact query services required");
        let target=c.firstForeignCreature(w,point,owner);held();
        if(target===null){target=c.firstOwnCreature(w,point,owner);held();}
        if(target!==null){if(!integer(target,0,299))throw Error("Actual Extractor contact creature index required");const dead=c.creatureVirtual68(w,target);held();if(!dead){if(!c.damageCreature)throw Error("Actual Extractor virtual34 including incoming0 required");r.contactedCreature=target;c.damageCreature(w,target,(grade*8)as 0|8|16,null);held();}}
        n[63]=3;
        if(dword(raw,0x4a7)<dword(raw,0x5e6)){
          let selected:number|null=null,best=0;
          for(let dy=-3;dy<=3;dy++)for(let dx=-3;dx<=3;dx++){
            const cell=worldCell(wrap(word(n,7)+(dx<<8)),wrap(word(n,9)+(dy<<8))),amount=bytes[cell*14+13];
            if(!integer(amount,0,255))throw Error("Actual Extractor mineral byte required");
            if(amount>best){best=amount;selected=cell;}
          }
          r.selectedCell=selected;
          if(selected!==null){
            const take=Math.min(best,2*(grade+1));r.harvested=take;
            if(best<=2*(grade+1)){if(!c.depleteCell)throw Error("Actual8CBA0 material depletion required");r.depletedCell=selected;c.depleteCell(w,selected);held();}
            const oldGoop=dword(raw,0x4a7),value=(oldGoop+take*2)>>>0,capacity=dword(raw,0x5e6),after=value<capacity?value:capacity;
            put32(raw,0x4a7,after);r.credited=(after-oldGoop)>>>0;
            bytes[selected*14+13]=(bytes[selected*14+13]-take)&255;
            c.resourceChanged?.(w,selected);held();
            if(!c.dirtyScanEndpoint)throw Error("Actual84E10 scan endpoint request required");
            c.dirtyScanEndpoint(w,[wrap(word(n,7)+768),wrap(word(n,9)+768)]);held();
          }else{
            n[50]=byte(n,50)|3;r.empty=true;
            if(!c.exhausted)throw Error("Actual Extractor44E50/43620 service required");c.exhausted(w,slot);held();audio(78);
          }
        }
      }
    }else n[49]=byte(n,49)&251;
    if(byte(n,27)===7){stop();audio(50);}else if(byte(n,27)===10)audio(47,255);
    if(byte(n,63))n[63]=byte(n,63)-1;
  }
  if(word(n,61)>200)put(n,61,200);
  const tail=word(n,49)&65535;
  if(tail&0x140||!(tail&1)){if(word(n,61)>0)put(n,61,word(n,61)-1);stop();}
  if(oldAction!==byte(n,25)||byte(n,28)!==0||((oldPower^byte(n,49))&4)!==0||byte(n,48)>0)n[21]=byte(n,21)|4;
  if(byte(n,48))n[48]=byte(n,48)-1;
  if(!(tail&1)&&word(n,43)<=0)return r;
  if(!(tail&1)){n[25]=0;n[28]=0;n[27]=byte(n,47);}else if(tail&0x40){n[25]=4;n[28]=0;n[27]=grade;}else n[25]=grade+1;
  if(!c.queueBuilding)throw Error("Actual Extractor83140 request service required");r.queueRequested=true;c.queueBuilding(w,slot);held();
  if(!c.profile)throw Error("Actual Extractor animation profile required");
  const profile=c.profile(w,slot,byte(n,25)as 0|1|2|3|4);held();
  if(profile.holds.some(h=>!integer(h,0,255))||!integer(profile.flags,0,255))throw Error("Actual Extractor animation holds/flags required");
  const a=advanceAnimation({action:byte(n,25),hold:byte(n,26),frame:byte(n,27),direction:(byte(n,28)<<24)>>24,delay:(byte(n,29)<<24)>>24,counter:(byte(n,30)<<24)>>24},profile);
  n[26]=a.hold;n[27]=a.frame;n[28]=a.direction&255;n[29]=a.delay&255;n[30]=a.counter&255;
  return r;
}

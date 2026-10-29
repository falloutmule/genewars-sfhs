/** Shared48790/4B630 effects9,65,66 used by the shield building and ring pool. */
import { advanceAnimation, animationFinished, type AnimationProfile } from "./animation";
import { originalAngle, wrap16, type MotionTables } from "./motion";
import { integerSqrt, torusDelta } from "./terrain";
import { nextRandom, type GeneRng } from "./random";
import { effectFactoryPrior, effectPriorByte as byte, putEffectWord as put,
  putEffectDword as put32, type EffectNativePrior } from "./power-motion";
import { stepSharedFreeEffectMotion, type SharedFreeEffectMotionContext } from "./destruction-effect";
const word = (n: EffectNativePrior, p: number) => wrap16(byte(n, p) | byte(n, p + 1) << 8);
const dword = (n: EffectNativePrior, p: number) => (word(n, p) & 65535) | word(n, p + 2) << 16;
export interface ShieldEffectInput {
  code: 9 | 65 | 66;
  slot: number;
  owner: number;
  position: [number, number];
  height: number;
  ground: number;
  shade: number;
  delay: number;
  shield?: EffectNativePrior;
}
export function makeShieldEffect(prior: EffectNativePrior, r: ShieldEffectInput,
  rng: GeneRng, tables: MotionTables,
  publish: (n: EffectNativePrior) => void,
  wave: (code: 4 | 5, owner: number, position: [number, number], grade: number) => void) {
  if (![9, 65, 66].includes(r.code) || prior[6] !== 0 ||
      !Number.isInteger(r.slot) || r.slot < 0 || r.slot >= 200 ||
      !Number.isInteger(r.owner) || r.owner < 0 || r.owner > (r.code === 66 ? 7 : 4))
    throw Error("Actual shield shared-effect input required");
  const n = effectFactoryPrior(prior, {slot:r.slot,code:r.code,owner:r.owner,
    x:r.position[0],y:r.position[1],ground:r.ground,height:r.height,shade:r.shade,
    vx:0,vy:0,vz:0,accelerationZ:0,yaw:0,pitch:0,speed:0,delay:r.delay});
  if (r.code === 66) {
    // This source factory never inserts a spatial node: head bytes remain prior.
    n[0] = prior[0]; n[1] = prior[1];
    n[22] = byte(n,22) | 8; n[76] = 2;
    put(n,74,r.delay); n[70] = r.owner;
  } else if (r.code === 65) {
    const b = r.shield;
    if (!b || b[6] !== 4 || byte(b,46) > 2)
      throw Error("Actual shield65 borrowed building required");
    const dx=torusDelta(r.position[0],word(b,7)),dy=torusDelta(r.position[1],word(b,9)),
      dz=(dword(b,17)-r.height)>>3,
      yaw=originalAngle(wrap16(dx*2),wrap16(dy*2),tables.atan),
      pitch=originalAngle(integerSqrt((dx*dx+dy*dy)>>>0),dz,tables.atan),
      radius=wrap16(integerSqrt((dx*dx+dy*dy+dz*dz)>>>0)),
      speed=wrap16(Math.trunc(r.delay*768/64));
    put(n,57,(2560-yaw)&2047); put(n,59,(-pitch)&2047);
    put(n,74,radius); put(n,65,speed);
    put(n,63,originalAngle(Math.trunc(speed/2),-radius,tables.atan));
    n[70]=255;n[22]=byte(n,22)|8;
    publish(n);
    if(nextRandom(rng)%(byte(b,46)*12+10)<=byte(b,63))
      wave(nextRandom(rng)%10>=5?5:4,byte(b,24),[word(b,7),word(b,9)],byte(b,46));
    return n;
  }
  publish(n);return n;
}
export function stepShieldEffect(before: EffectNativePrior, rng: GeneRng,
  c: SharedFreeEffectMotionContext & { profile: AnimationProfile; waves: EffectNativePrior[] }) {
  const code=byte(before,69);
  if(![9,65,66].includes(code))throw Error("Actual shield effect selector required");
  const result=stepSharedFreeEffectMotion(before,rng,c,{movable:false,waterResponse:false}),n=result.native;
  if(code===9) {
    if(word(n,74)>=0)put(n,74,word(n,74)-1);
    const a=advanceAnimation({action:9,hold:byte(n,26),frame:byte(n,27),direction:byte(n,28)<<24>>24,delay:byte(n,29)<<24>>24,counter:byte(n,30)<<24>>24},c.profile);
    n[26]=a.hold;n[27]=a.frame;n[28]=a.direction&255;n[29]=a.delay&255;n[30]=a.counter&255;
    result.retirementRequired=word(n,74)<0 && animationFinished(a,c.profile);
  } else if(code===65) {
    n[70]=(byte(n,70)+1)&255;result.retirementRequired=byte(n,70)>7;
  } else {
    const index=byte(n,70)<<24>>24,table=c.waves[index],segment=word(n,74);
    if(!table || table.length!==449 || segment<0 || segment>=16)
      throw Error("Actual shield66 ring/segment binding required");
    if(!byte(table,448)){result.retirementRequired=true;return result;}
    const next=(segment+1)%16;
    for(let axis=0;axis<3;axis++) {
      const sum=(dword(table,segment*12+axis*4)+dword(table,next*12+axis*4)+dword(table,192+segment*12+axis*4)+dword(table,192+next*12+axis*4))|0,
        average=Math.trunc(sum/4);
      if(axis===2)put32(n,39,average);else put(n,7+axis*2,average);
    }
    n[76]=[384+segment,384+next,400+segment,400+next].every(p=>byte(table,p)!==0)?1:0;
  }
  return result;
}

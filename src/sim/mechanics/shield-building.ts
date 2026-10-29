/** Source451F0 selector12. Immediate collision/effect ports execute in the
 * caller's owner transaction; no unknown collision is treated as a no-op. */
import { advanceAnimation, type AnimationProfile } from "./animation";
import { nextRandom, type GeneRng } from "./random";
import { wrap16, type MotionTables } from "./motion";
type Native = (number | null)[];
const byte=(n:Native,p:number)=>{const v=n[p];if(!Number.isInteger(v)||v!<0||v!>255)throw Error(`Actual shield byte ${p} required`);return v!;};
const word=(n:Native,p:number)=>wrap16(byte(n,p)|byte(n,p+1)<<8);
const put=(n:Native,p:number,v:number)=>{n[p]=v&255;n[p+1]=v>>8&255;};
export interface ShieldBuildingContext {
  upkeep: number;
  tables: MotionTables;
  rng: GeneRng;
  player: Native;
  profile(action:number):AnimationProfile;
  query(points:[number,number][]):void;
  damage(amount:number):void;
  wave(code:4|5):void;
  orbit(position:[number,number]):void;
  audio():void;
  queue():void;
}
export function stepShieldBuilding(n:Native,c:ShieldBuildingContext) {
  if(n.length!==67||n[6]!==4||n[45]!==12||byte(n,46)>2||
      !Number.isInteger(c.upkeep)||c.upkeep<0||c.upkeep>255||c.player.length!==1805)
    throw Error("Actual shield building/player/upkeep required");
  const flags=word(n,49)&65535,grade=byte(n,46),oldAction=byte(n,25),oldPower=flags&4;
  if(flags&0x800)throw Error("Actual shield common demolition callback required");
  if(flags&1 && !(flags&0x40)) {
    put(n,61,word(n,61)-c.upkeep-byte(n,63));
    if(word(n,61)<=0) {
      put(n,61,0);
      if(!(flags&0x100)) {
        n[49]=byte(n,49)&~4;
        if(word(c.player,0x5ea)===0)put(c.player,0x5ea,1000);
      }
    }
    if(word(n,61)>0 && !(word(n,49)&0x40)) {
      n[28]=1;n[29]=((200-word(n,61))>>6)&255;
      const radius=grade*256+1920,extent=radius>>8,
        stepX=nextRandom(c.rng)%2===0?256:-256,
        stepY=nextRandom(c.rng)%2===0?256:-256,points:[number,number][]=[];
      for(let x=-extent;x<=extent;x++)for(let y=-extent;y<=extent;y++)
        if((x*x+y*y)*65536<=radius*radius)
          points.push([wrap16(word(n,7)+x*stepX),wrap16(word(n,9)+y*stepY)]);
      c.query(points);
      if(byte(n,63)>grade*12+24)c.damage(byte(n,63)>>4);
      if(word(n,61)>=190 && nextRandom(c.rng)%100===0) {
        c.wave(nextRandom(c.rng)%10>=5?5:4);c.audio();
      }
      put(n,52,(word(n,52)+150)&2047);
      const angle=(word(n,52)-512)&2047,r=grade*256+1536;
      c.orbit([wrap16(word(n,7)+Math.floor(c.tables.cosine[angle]*r/65536)),
        wrap16(word(n,9)+Math.floor(c.tables.sine[angle]*r/65536))]);
    }
    if(word(n,61)<=0) {
      if(oldPower){c.wave(5);c.wave(5);}
      n[28]=0;n[49]=byte(n,49)&~4;
    }
    if(word(n,61)>200)put(n,61,200);
    if(byte(n,63))n[63]=byte(n,63)-1;
  }
  const tail=word(n,49)&65535;
  if(tail&0x140||!(tail&1)) {
    if(word(n,61)>0)put(n,61,word(n,61)-1);
    if(word(n,61)!==0)n[29]=((200-word(n,61))>>6)&255;
    else n[28]=0;
  }
  if(oldAction!==byte(n,25)||byte(n,28)!==0||((oldPower^byte(n,49))&4)||byte(n,48))n[21]=byte(n,21)|4;
  if(byte(n,48))n[48]=byte(n,48)-1;
  if(!(tail&1)&&word(n,43)<=0)return;
  if(!(tail&1)){n[25]=0;n[28]=0;n[27]=byte(n,47);}
  else if(tail&0x40){n[25]=4;n[28]=0;n[27]=grade;}
  else n[25]=grade+1;
  c.queue();
  const a=advanceAnimation({action:byte(n,25),hold:byte(n,26),frame:byte(n,27),direction:byte(n,28)<<24>>24,delay:byte(n,29)<<24>>24,counter:byte(n,30)<<24>>24},c.profile(byte(n,25)));
  n[26]=a.hold;n[27]=a.frame;n[28]=a.direction&255;n[29]=a.delay&255;n[30]=a.counter&255;
}

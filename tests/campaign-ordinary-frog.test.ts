import { describe, it, expect } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { speciesFixture } from "./fixtures/creature-species";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
} from "../src/sim/campaign/world";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { put16, put32 } from "../src/sim/campaign/bytes";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
function fixture(owner: number, recycled = false) {
  const pack = campaignFixture(),
    s = speciesFixture();
  Object.assign(pack.ecologyRules!, {
    speciesTraits: s.rules.speciesTraits,
    attackChannels: s.rules.attackChannels,
    corpseFriction: Array(8).fill(128),
  });
  pack.zoneRules!.speciesComponents = s.components;
  pack.assets.FROG = structuredClone(pack.assets.MULE);
  pack.assets.BONES = structuredClone(pack.assets.MULE);
  pack.assets.FROG.frames = Array.from({ length: 8 }, () =>
    structuredClone(pack.assets.MULE.frames![0]),
  );
  for (let a = 0; a < 8; a++)
    pack.assets.FROG.animations![a] = { first: 0, last: 7, rawTrailingWord: 8 };
  const w = createCampaign(pack, "synthetic-ordinary-frog");
  enterCampaign(w, pack);
  for (let i = 0; i < 200; i++) stepCampaign(w, pack);
  expect(w.phase).toBe("active");
  const at: [number, number] = [10240, 10240],
    prior = w.creatureNative[0];
  if (recycled) {
    put16(prior as number[], 80, 1);
    prior[82] = 1;
    const peer = w.creatureNative[1];
    put16(peer as number[], 7, at[0]);
    put16(peer as number[], 9, at[1]);
    w.ecology.mules.push({ id: "source:0:1", index: 1, native: peer, pending: [] });
  }
  const made = initializeMuleNative(
      prior,
      w.rng,
      { slot: 0, owner, position: at, quality: 100, species: 2 },
      {
        terrain: w.terrain,
        tables: pack.rules!.tables,
        rules: pack.ecologyRules!,
        speciesComponents: s.components,
      },
    );
  if (!made.ok) throw Error(made.reason);
  const n = made.value.native;
  w.rng = made.value.rng;
  n[94] = 8;
  n[119] = 0;
  n[123] = 255;
  n[97] = 0;
  n[21] = 128;
  put16(n as number[], 102, 30000);
  put16(n as number[], 104, 100);
  put16(n as number[], 108, 1000);
  put16(n as number[], 63, 0);
  put16(n as number[], 61, 0);
  put16(n as number[], 73, 0);
  n.fill(0, 45, 57);
  put32(n as number[], 39, groundHeight(w.terrain, ...at) + 4096);
  w.creatureNative[0] = n;
  w.ecology.mules.push({ id: "source:0:0", index: 0, native: n, pending: [] });
  insertSpatial(w.spatial, w.terrain, "source:0:0", worldCell(...at));
  put16(w.missionPrefix, 0x3550, 1);
  synchronizeCampaignLinks(w);
  return { w, pack };
}
describe("ordinary pure Frog campaign transaction", () => {
  it.each([0, 4])("reuses owner%i retired slots without reading unused movement references", (owner) => {
    const { w, pack } = fixture(owner, true), replay = recordCampaign(w, null);
    expect(w.creatureNative[0][82]).toBe(1);
    for (let i = 0; i < 8; i++) stepCampaign(w, pack);
    expect(w.phase, JSON.stringify(w.notices.slice(-3))).toBe("active");
    const resumed = loadCampaign(saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }), w.contentHash).world;
    for (let i = 0; i < 32; i++) { stepCampaign(w, pack); stepCampaign(resumed, pack); }
    expect(w.phase, JSON.stringify(w.notices.slice(-3))).toBe("active");
    expect(w.creatureNative[0][82]).toBe(1);
    expect(w.creatureNative[1][6]).toBe(0);
    expect(checksum(w)).toBe(checksum(resumed));
    expect(checksum(replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash))).toBe(checksum(w));
    expect(() => validateSpatial(w.spatial)).not.toThrow();
  });
  it.each([0, 4])(
    "preserves owner%i airborne callbacks through save/reload and replay",
    (owner) => {
      const { w, pack } = fixture(owner),
        replay = recordCampaign(w, null);
      for (let i = 0; i < 8; i++) stepCampaign(w, pack);
      expect(w.phase, JSON.stringify(w.notices.slice(-3))).toBe("active");
      expect(w.creatureNative[0][28]).toBe(0);
      expect(w.creatureNative[0][122]).toBe(2);
      const resumed = loadCampaign(
        saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
        w.contentHash,
      ).world;
      for (let i = 0; i < 32; i++) {
        stepCampaign(w, pack);
        stepCampaign(resumed, pack);
      }
      expect(w.phase, JSON.stringify(w.notices.slice(-3))).toBe("active");
      expect(checksum(w)).toBe(checksum(resumed));
      expect(() => validateSpatial(w.spatial)).not.toThrow();
      expect(
        checksum(
          replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
        ),
      ).toBe(checksum(w));
    },
    30000,
  );
  it.each([0,4])("runs owner%i self-water damage with food flags through full save and replay",owner=>{
    const {w,pack}=fixture(owner),n=w.creatureNative[0];
    const waterFirst=pack.assets.EFF.frames!.length;
    for(let i=0;i<12;i++)pack.assets.EFF.frames!.push({...structuredClone(pack.assets.TEST.frames![0]),rawFlags:[0,0,0]});
    for(const [code,count] of [[21,2],[22,3],[48,12]])pack.assets.EFF.animations![code]={first:waterFirst,last:waterFirst+count-1,rawTrailingWord:count};
    for(let y=36;y<=44;y++)for(let x=36;x<=44;x++){const cell=(y*128+x)*14;put16(w.terrain.bytes,cell+2,0);w.terrain.bytes[cell+5]=0;}w.terrain.revision++;
    put32(n as number[],17,0);put32(n as number[],39,0);put16(n as number[],106,30);
    n[83]=1;n[97]=64;n[96]=8;n[118]=70;
    const replay=recordCampaign(w,null),before=n[106]!;
    for(let i=0;i<4;i++)stepCampaign(w,pack);
    expect(w.phase,JSON.stringify(w.notices.slice(-3))).toBe("active");expect(w.creatureNative[0][106]).toBeLessThan(before);
    const resumed=loadCampaign(saveCampaign(w,{paused:true,speed:1,accumulator:0}),w.contentHash).world;
    for(let i=0;i<8;i++){stepCampaign(w,pack);stepCampaign(resumed,pack);}
    expect(w.phase,JSON.stringify(w.notices.slice(-3))).toBe("active");expect(checksum(resumed)).toBe(checksum(w));
    expect(checksum(replayCampaign(sealCampaignReplay(replay,w),pack,w.contentHash))).toBe(checksum(w));
  });
  it("does not confuse mating readiness with an entered spit action", () => {
    const { w, pack } = fixture(4);
    w.creatureNative[0][94] = 3;
    w.creatureNative[0][97] = 32;
    stepCampaign(w, pack);
    expect(w.phase, JSON.stringify(w.notices.slice(-3))).toBe("active");
    expect(w.creatureNative[0][94]).toBe(3);
    expect(w.creatureNative[0][97]! & 32).toBe(32);
  });
  it.each([20, 21])("preserves ordinary Frog state%i through host save and replay", state => {
    const { w, pack } = fixture(4);
    w.creatureNative[0][118] = 70;
    w.creatureNative[0][94] = state;
    const replay = recordCampaign(w, null);
    for (let i=0;i<16;i++) stepCampaign(w,pack);
    expect(w.phase, JSON.stringify(w.notices.slice(-3))).toBe("active");
    const restored = loadCampaign(saveCampaign(w,{paused:true,speed:1,accumulator:0}),w.contentHash).world;
    for(let i=0;i<16;i++){stepCampaign(w,pack);stepCampaign(restored,pack);}
    expect(w.phase).toBe("active");
    expect(checksum(restored)).toBe(checksum(w));
    expect(checksum(replayCampaign(sealCampaignReplay(replay,w),pack,w.contentHash))).toBe(checksum(w));
  });
  it("retains an explicit entered spit boundary and rolls back native/RNG/spatial roots", () => {
    const { w, pack } = fixture(4);
    w.creatureNative[0][94] = 1;
    w.creatureNative[0][97] = 32;
    const before = checksum({
      n: w.creatureNative[0],
      rng: w.rng,
      spatial: w.spatial,
      terrain: w.terrain,
    });
    stepCampaign(w, pack);
    expect(w.phase).toBe("blocked");
    expect(w.notices.at(-1)?.text).toMatch(/Frog spit approach/);
    expect(
      checksum({
        n: w.creatureNative[0],
        rng: w.rng,
        spatial: w.spatial,
        terrain: w.terrain,
      }),
    ).toBe(before);
  });
  it.each([90,91])("uses the original neutral spit-quality boundary at %i", quality => {
    const { w,pack }=fixture(4);w.creatureNative[0][94]=1;w.creatureNative[0][118]=quality;
    stepCampaign(w,pack);
    expect(w.phase).toBe(quality===90?"active":"blocked");
    if(quality===91)expect(w.notices.at(-1)?.text).toMatch(/Frog spit approach/);
  });
  it.each(["inherited","research"])("keeps the owned Frog %s spit gate explicit", admission => {
    const { w,pack }=fixture(0);w.creatureNative[0][94]=1;
    if(admission==="inherited")w.creatureNative[0][97]=4;
    else w.players[0].raw[0x6c7+2]=1;
    stepCampaign(w,pack);
    expect(w.phase).toBe("blocked");
    expect(w.notices.at(-1)?.text).toMatch(/Frog spit approach/);
  });
});

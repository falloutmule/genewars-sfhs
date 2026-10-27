import { beforeAll, describe, expect, it } from "vitest";
import { stepNeutralMule, type MuleContext } from "../src/sim/mechanics/mule";
import type { EcologyState } from "../src/sim/mechanics/ecology";
import {
  terrainFromBytes,
  groundHeight,
  worldCell,
} from "../src/sim/mechanics/terrain";
import { i16, u32, put16, put32 } from "../src/sim/campaign/bytes";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

/** Synthetic state arrangements exercise the real common/death callbacks.
 * They are not an ordinary mission trace or mission acceptance. */
function fixture(stage = 24) {
  const p = campaignFixture(),
    n: Array<number | null> = Array(124).fill(0);
  n.fill(null, 31, 39);
  n[6] = 1;
  n[24] = 4;
  n[94] = stage;
  n[25] = stage === 24 ? 17 : stage === 25 ? 18 : 4;
  n[28] = stage === 24 ? 1 : 0;
  n[96] = 8;
  n[83] = 1;
  n[118] = 30;
  n[119] = 255;
  n[122] = 4;
  n[123] = 255;
  put16(n as number[], 7, 8192);
  put16(n as number[], 9, 8192);
  put16(n as number[], 11, 8192);
  put16(n as number[], 13, 8192);
  put16(n as number[], 21, 0x280);
  put16(n as number[], 43, 50);
  put16(n as number[], 59, 512);
  put16(n as number[], 63, -1);
  put16(n as number[], 73, 0x220);
  put16(n as number[], 98, 80);
  put16(n as number[], 104, 100);
  put16(n as number[], 106, 40);
  put16(n as number[], 108, 30000);
  put32(n as number[], 17, 2048);
  put32(n as number[], 39, 2049);
  const state: EcologyState = {
    schemaVersion: 1,
    sourceSha256: "synthetic-corpse",
    ticks: 0,
    plantCursor: 0,
    plantCount: 0,
    ownerPlantCounts: [0, 0, 0, 0],
    plants: [],
    mules: [{ index: 0, id: "source:0:0", native: n, pending: [] }],
    otherEntities: [],
    pending: [],
    unsupported: [],
    plantOrder: {},
  };
  const terrain = terrainFromBytes(Array(229376).fill(0));
  for (let cell = 0; cell < 16384; cell++) {
    put16(terrain.bytes, cell * 14 + 2, 1024);
    terrain.bytes[cell * 14 + 5] = 2;
  }
  const context: MuleContext = {
    terrain,
    tables: p.rules!.tables,
    rules: { ...p.ecologyRules!, corpseFriction: Array(8).fill(128) },
    frame: 0,
    gravity: 1024,
    water: 0,
    climate: 100,
    bounce: Array(8).fill(128),
    profile: () => ({ first: 0, last: 2, holds: [0, 0, 0], flags: 0 }),
    bonesProfile: () => ({ first: 0, last: 1, holds: [0, 0], flags: 0 }),
    obstacleAt: () => false,
    airborneObstacle: () => null,
  };
  return { state, context, n, rng: { seed: 5428, ring: 31, draws: 0 } };
}
describe("negative-desired Mule corpse common physics", () => {
  it.each([24, 25, 26, 27])(
    "lets stage%s first impact from ground+1 and continue airborne/grounded physics",
    (stage) => {
      const f = fixture(stage),
        rng = { ...f.rng };
      for (let frame = 0; frame < 12; frame++) {
        f.context.frame = frame;
        const r = stepNeutralMule(f.state, 0, f.rng, f.context);
        expect(r.reason, `frame${frame}`).toBeNull();
        expect(i16(f.state.mules[0].native as number[], 63)).toBe(-1);
      }
      expect(f.rng).toEqual(rng);
      expect(f.state.mules[0].native[6]).toBe(1);
    },
  );
  it("uses actual first-impact bounce rather than snapping the dead physical height to old ground", () => {
    const f = fixture();
    const r = stepNeutralMule(f.state, 0, f.rng, f.context),
      n = f.state.mules[0].native;
    expect(r.committed).toBe(true);
    expect(u32(n as number[], 39)).toBe(2048);
    expect(i16(n as number[], 49)).toBe(512);
    expect(i16(n as number[], 61)).toBe(512);
    f.context.frame = 1;
    expect(stepNeutralMule(f.state, 0, f.rng, f.context).committed).toBe(true);
  });
  it("applies only the original odd-phase6A290 shared flags clear", () => {
    for (const frame of [0, 1]) {
      const f = fixture();
      f.context.frame = frame;
      expect(stepNeutralMule(f.state, 0, f.rng, f.context).reason).toBeNull();
      expect(f.state.mules[0].native[74]).toBe(frame ? 0 : 2);
    }
  });
  it("preserves source accelerations, grounded friction and negative desired without living contact", () => {
    const f = fixture();
    put32(f.n as number[], 39, 2048);
    put16(f.n as number[], 45, 640);
    put16(f.n as number[], 51, 64);
    put16(f.n as number[], 53, -32);
    put16(f.n as number[], 55, 128);
    const r = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(r.reason).toBeNull();
    const n = f.state.mules[0].native;
    expect([
      i16(n as number[], 51),
      i16(n as number[], 53),
      i16(n as number[], 55),
      i16(n as number[], 63),
    ]).toEqual([64, -32, 128, -1]);
    expect(i16(n as number[], 61)).toBeGreaterThan(0);
    //The negative Y fraction crosses a cell and invokes real5B260's draw.
    expect(f.rng.draws).toBe(1);
  });
  it("caps a free airborne corpse above19200 to12800 after deriving its angle", () => {
    const f = fixture();
    put32(f.n as number[], 39, 20000);
    put16(f.n as number[], 45, 22000);
    expect(stepNeutralMule(f.state, 0, f.rng, f.context).reason).toBeNull();
    expect(i16(f.state.mules[0].native as number[], 61)).toBe(12800);
    expect(i16(f.state.mules[0].native as number[], 63)).toBe(-1);
  });
  it("treats reached positive fall damage and submerged self damage as original dead-target no-ops", () => {
    const f = fixture();
    put32(f.n as number[], 17, 2048);
    put32(f.n as number[], 39, 2049);
    put16(f.n as number[], 49, 2048);
    //A higher next terrain sample makes the positive-vz first-impact call real.
    put16(f.n as number[], 45, 16384);
    for (let cell = 0; cell < 16384; cell++)
      put16(f.context.terrain.bytes, cell * 14 + 2, 2048);
    const r = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(r.reason).toBeNull();
    expect(i16(f.state.mules[0].native as number[], 106)).toBe(40);
    expect(r.events.some((e) => e.kind === "mule-combat-damage")).toBe(false);
    const water = fixture();
    for (let cell = 0; cell < 16384; cell++) {
      put16(water.context.terrain.bytes, cell * 14 + 2, 0);
      water.context.terrain.bytes[cell * 14 + 5] = 0;
    }
    put32(water.n as number[], 17, 0);
    put32(water.n as number[], 39, 0);
    water.n[83] = 1;
    water.context.frame = 3;
    const q = stepNeutralMule(water.state, 0, water.rng, water.context);
    expect(q.reason).toBeNull();
    expect(q.events.some((e) => e.kind === "mule-water-damage")).toBe(false);
    expect(i16(water.state.mules[0].native as number[], 106)).toBe(40);
  });
  it("admits source reentrant state8 with passive physical flags", () => {
    const f = fixture(8);
    put16(f.n as number[], 106, -7);
    const r = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(r.reason).toBeNull();
    expect(f.state.mules[0].native[94]).toBe(8);
    expect(i16(f.state.mules[0].native as number[], 106)).toBe(-7);
  });
  it("preserves missing passive-flag, attached and frozen guards", () => {
    for (const [at, value] of [
      [21, 0],
      [22, 3],
      [22, 10],
    ] as const) {
      const f = fixture();
      f.n[at] = value;
      const before = JSON.stringify(f.state);
      expect(stepNeutralMule(f.state, 0, f.rng, f.context).committed).toBe(
        false,
      );
      expect(JSON.stringify(f.state)).toBe(before);
    }
  });
  it("keeps gravity suppression independent of passive corpse motion", () => {
    const f=fixture();
    f.n[21]=0xa0;
    put32(f.n as number[],39,4096);
    expect(stepNeutralMule(f.state,0,f.rng,f.context).reason).toBeNull();
    expect(u32(f.state.mules[0].native as number[],39)).toBe(4096);
    expect(i16(f.state.mules[0].native as number[],49)).toBe(0);
    expect(i16(f.state.mules[0].native as number[],73)&0x400).toBe(0);
  });
  it("rolls back after late collision or missing BONES/profile failures", () => {
    const f = fixture();
    put32(f.n as number[], 39, 9000);
    put16(f.n as number[], 45, 100);
    f.context.frame = 1;
    f.context.airborneObstacle = () => {
      throw Error("late74270");
    };
    const before = JSON.stringify({
      state: f.state,
      terrain: f.context.terrain,
      rng: f.rng,
    });
    const r = stepNeutralMule(f.state, 0, f.rng, f.context);
    expect(r.reason).toBe("late74270");
    expect(
      JSON.stringify({
        state: f.state,
        terrain: f.context.terrain,
        rng: f.rng,
      }),
    ).toBe(before);
    const bones = fixture(26);
    bones.context.bonesProfile = undefined;
    const old = JSON.stringify(bones.state);
    expect(
      stepNeutralMule(bones.state, 0, bones.rng, bones.context).reason,
    ).toMatch(/BONES/);
    expect(JSON.stringify(bones.state)).toBe(old);
  });
});
describe("corpse physics normal campaign host", () => {
  const pack = campaignFixture();
  let initial: CampaignWorld;
  beforeAll(() => {
    pack.assets.BONES = structuredClone(pack.assets.MULE);
    pack.ecologyRules!.corpseFriction = Array(8).fill(128);
    initial = createCampaign(pack, "synthetic-corpse-host");
    enterCampaign(initial);
    for (let i = 0; i < 200; i++) stepCampaign(initial, pack);
  }, 30000);
  it("survives the full normal callback at ground+1 and JSON save continuation has identical checksums", () => {
    const w = structuredClone(initial),
      point: [number, number] = [12000, 18000],
      r = initializeMuleNative(
        w.creatureNative[0],
        w.rng,
        { slot: 0, owner: 4, position: point, quality: 50 },
        { terrain: w.terrain, tables: pack.rules!.tables },
      );
    if (!r.ok) throw Error(r.reason);
    w.rng = r.value.rng;
    const n = r.value.native;
    n[94] = 24;
    n[25] = 17;
    put16(n as number[], 63, -1);
    put16(n as number[], 73, 0x220);
    put16(n as number[], 108, 30000);
    put32(n as number[], 39, groundHeight(w.terrain, ...point) + 1);
    w.creatureNative[0] = n;
    w.ecology.mules.push({
      index: 0,
      id: "source:0:0",
      native: n,
      pending: [],
    });
    put16(w.missionPrefix, 0x3550, 1);
    insertSpatial(w.spatial, w.terrain, "source:0:0", worldCell(...point));
    synchronizeCampaignLinks(w);
    const replay = recordCampaign(w, null),
      session = { paused: true, speed: 1 as const, accumulator: 0 },
      loaded = loadCampaign(saveCampaign(w, session), w.contentHash).world;
    for (let i = 0; i < 8; i++) {
      stepCampaign(w, pack);
      stepCampaign(loaded, pack);
      expect(w.phase, w.notices.at(-1)?.text).toBe("active");
      expect(loaded.phase, loaded.notices.at(-1)?.text).toBe("active");
      expect(checksum(loaded)).toBe(checksum(w));
    }
    expect(w.ecology.mules[0].native[94]).toBeGreaterThanOrEqual(24);
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  });
});

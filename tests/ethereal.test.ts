import { describe, it, expect } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import {
  createEtherealState,
  createCampaignEthereal,
  stepCountdownEthereals,
  type EtherealAdapterOptions,
} from "../src/sim/campaign/ethereal-adapter";
import {
  etherealDword,
  etherealWord,
  putEtherealWord,
  putEtherealDword,
  etherealWaterRequest,
} from "../src/sim/mechanics/ethereal";
import { stepEffectScheduler } from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { groundHeight } from "../src/sim/mechanics/terrain";
import { put16 } from "../src/sim/campaign/bytes";
function fixture() {
  const pack = campaignFixture(),
    frames = Array.from({ length: 12 }, (_, i) => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [i < 5 ? 1 : 0, 0, 0],
    }));
  pack.assets.ETHEREAL = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 19 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 9 }, (_, i) => ({
      first: i < 8 ? i : 8,
      last: i < 8 ? i : 18,
      rawTrailingWord: i < 8 ? 1 : 267,
    })),
  };
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames,
    animations: Array.from({ length: 61 }, (_, i) => ({
      first: i === 26 ? 0 : 5,
      last: i === 26 ? 4 : i === 48 ? 11 : 6,
      rawTrailingWord: i === 26 ? 5 : i === 48 ? 7 : 2,
    })),
  };
  pack.etherealRules = {
    schemaVersion: 1,
    observationThresholds: [16, 64, 128],
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  const original = createCampaign(pack, "synthetic-visitors"),
    world = Object.assign(original, {
      ethereals: createEtherealState(original.source),
    });
  world.landings = [
    {
      slot: 0,
      owner: 0,
      point: [8192, 8192],
      height: 0,
      phase: 4,
      timer: 0,
      vz: 0,
      accelerationZ: 0,
      particles: [],
      messageIndex: null,
      activationFrame: null,
    },
  ];
  put16(world.missionPrefix, 0x1c7a, 6000);
  put16(world.missionPrefix, 0x1c7c, 100);
  put16(world.missionPrefix, 0x1c78, 256);
  const options: EtherealAdapterOptions<typeof world> = {
    gravity: 512,
    obstacleAt: () => false,
    cleanupReferences: (w, id) => cleanupCampaignReferences(w, id),
  };
  return { world, pack, options };
}
describe("source family8 visitor lifecycle", () => {
  it("expires into a real source parent and runs it in the same ascending pass", () => {
    const f = fixture();
    f.world.countdown = 1;
    const before = { ...f.world.rng },
      out = stepCountdownEthereals(f.world, f.pack, f.options);
    expect(out.countdown.expired).toBe(true);
    expect(out.created).toEqual([0]);
    expect(out.callbacks).toEqual([
      { slot: 0, selector: 0, stateBefore: 4, stateAfter: 4 },
    ]);
    expect(f.world.ethereals.count).toBe(1);
    expect(etherealDword(f.world.ethereals.records[0].native, 0x27)).toBe(
      27648,
    );
    expect(etherealWord(f.world.ethereals.records[0].native, 0x3d)).toBe(1912);
    expect(f.world.rng).toEqual(before);
    expect(
      out.events
        .slice(0, 3)
        .map((e) => (e.type === "countdown" ? e.request.type : null)),
    ).toEqual(["expiry-effect3a", "expiry-effect3a", "expiry-narration"]);
  });
  it("creates a shared water particle on signed-water Ethereal contact", () => {
    const f = fixture();
    f.world.source.source.terrain.loadedPhysicalWaterHeight = -2208;
    for (let cell = 0; cell < 16384; cell++) f.world.terrain.bytes[cell * 14 + 5] = 0;
    createCampaignEthereal(f.world, {selector: 0, owner: 0,
      position: [8192, 8192], initialHeight: 27648}, f.pack, f.options);
    f.world.frame = 3;
    f.world.countdown = 0;
    const out = stepCountdownEthereals(f.world, f.pack, f.options);
    expect(out.particles).toHaveLength(1);
    const effect = f.world.waterEffects.find(e => e.slot === out.particles[0])!;
    expect(effect.code).toBe(21);
    expect(effect.owner).toBe(0);
    expect(f.world.powerEffects.slots[effect.slot].occupied).toBe(true);
    expect(f.world.spatial.nodes[`source:4:${effect.slot}`]).toBeDefined();
  });
  it("uses unsigned water/ground height selection and source speed/material gates", () => {
    const f = fixture(), n = Array(102).fill(0);
    putEtherealWord(n, 61, 128);
    putEtherealDword(n, 39, 1700);
    putEtherealDword(n, 17, -1);
    for (let cell = 0; cell < 16384; cell++) f.world.terrain.bytes[cell * 14 + 5] = 0;
    const c = {terrain:f.world.terrain, water:1632, frame:3};
    expect(etherealWaterRequest(n, 2000, c)).toMatchObject({code:48,height:-1});
    putEtherealWord(n, 61, 127);
    expect(etherealWaterRequest(n, 2000, c)).toBeNull();
    putEtherealWord(n, 61, 128);
    f.world.terrain.bytes[5] = 2;
    expect(etherealWaterRequest(n, 2000, c)).toBeNull();
  });
  it("creates and advances a higher child immediately on parent altitude arrival", () => {
    const f = fixture(),
      g = groundHeight(f.world.terrain, 8192, 8192),
      draws = f.world.rng.draws;
    createCampaignEthereal(
      f.world,
      {
        selector: 0,
        owner: 0,
        position: [8192, 8192],
        initialHeight: g + 16000,
      },
      f.pack,
      f.options,
    );
    f.world.countdown = 0;
    const out = stepCountdownEthereals(f.world, f.pack, f.options);
    expect(out.callbacks.map((c) => [c.slot, c.stateAfter])).toEqual([
      [0, 5],
      [1, 0],
    ]);
    expect(f.world.ethereals.count).toBe(2);
    expect(etherealWord(f.world.ethereals.records[1].native, 0x41)).toBe(32);
    expect(f.world.rng.draws).toBe(draws + 1);
    expect(out.particles).toEqual([]);
  });
  it("returns null without draws at16capacity and still visits each current slot", () => {
    const f = fixture(),
      g = groundHeight(f.world.terrain, 8192, 8192);
    for (let i = 0; i < 16; i++)
      expect(
        createCampaignEthereal(
          f.world,
          {
            selector: 2,
            owner: 0,
            position: [8192, 8192],
            initialHeight: g + 22400,
          },
          f.pack,
          f.options,
        ),
      ).toBe(i);
    const before = { ...f.world.rng };
    expect(
      createCampaignEthereal(
        f.world,
        { selector: 0, owner: 0, position: [0, 0], initialHeight: 100 },
        f.pack,
        f.options,
      ),
    ).toBeNull();
    f.world.countdown = 1;
    const out = stepCountdownEthereals(f.world, f.pack, f.options);
    expect(out.spawnAttempts[0].slot).toBeNull();
    expect(out.callbacks).toHaveLength(16);
    expect(f.world.rng).toEqual(before);
    expect(
      f.world.ethereals.records.every(
        (r) => r.native[24] === 4 && r.native[0x58] === 0,
      ),
    ).toBe(true);
  });
  it("rolls back expiry factories and earlier callbacks on a later unsupported state", () => {
    const f = fixture(),
      g = groundHeight(f.world.terrain, 8192, 8192);
    createCampaignEthereal(
      f.world,
      {
        selector: 0,
        owner: 0,
        position: [8192, 8192],
        initialHeight: g + 16000,
      },
      f.pack,
      f.options,
    );
    createCampaignEthereal(
      f.world,
      {
        selector: 0,
        owner: 0,
        position: [8192, 8192],
        initialHeight: g + 16000,
      },
      f.pack,
      f.options,
    );
    f.world.ethereals.records[1].native[0x56] = 15;
    const before = JSON.stringify(f.world);
    expect(() => stepCountdownEthereals(f.world, f.pack, f.options)).toThrow(
      /state 15/,
    );
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it("retains the original attempt30 recenter and accepts attempt31 after site rejections", () => {
    const f = fixture(),
      g = groundHeight(f.world.terrain, 8192, 8192);
    createCampaignEthereal(
      f.world,
      {
        selector: 0,
        owner: 0,
        position: [8192, 8192],
        initialHeight: g + 16000,
      },
      f.pack,
      f.options,
    );
    const n = f.world.ethereals.records[0].native;
    n[0x56] = 6;
    n[0x57] = 0;
    const draws = f.world.rng.draws;
    stepCountdownEthereals(f.world, f.pack, {
      ...f.options,
      obstacleAt: () => true,
    });
    const after = f.world.ethereals.records[0].native;
    expect(f.world.rng.draws - draws).toBe(64);
    expect(after[0x57]).toBe(1);
    expect(etherealWord(after, 11)).toBe(etherealWord(after, 0x5c));
    expect(etherealDword(after, 0x60)).toBe(
      groundHeight(
        f.world.terrain,
        etherealWord(after, 11),
        etherealWord(after, 13),
      ) + 9600,
    );
    expect(etherealWord(after, 0x3f)).toBe(1920);
  });
  it("requires the real reward factory, credits1000 once and completes its200-tick wait", () => {
    const f = fixture(),
      g = groundHeight(f.world.terrain, 8192, 8192);
    createCampaignEthereal(
      f.world,
      {
        selector: 0,
        owner: 0,
        position: [8192, 8192],
        initialHeight: g + 9600,
      },
      f.pack,
      f.options,
    );
    const n = f.world.ethereals.records[0].native;
    n[0x56] = 6;
    n[0x57] = 1;
    n[0x16] = n[0x16]! & 0x3f;
    n[0x49] = n[0x49]! | 0x10;
    putEtherealWord(n, 11, 8192);
    putEtherealWord(n, 13, 8192);
    putEtherealDword(n, 0x60, g + 9600);
    const before = JSON.stringify(f.world);
    expect(() => stepCountdownEthereals(f.world, f.pack, f.options)).toThrow(
      /reward effect3B/,
    );
    expect(JSON.stringify(f.world)).toBe(before);
    const requests: unknown[] = [],
      funds = f.world.players[0].funds;
    stepCountdownEthereals(f.world, f.pack, {
      ...f.options,
      rewardEffect: (_w, _r, request) => requests.push(request),
    });
    expect(requests).toEqual([
      {
        code: 59,
        owner: 0,
        position: [8192, 8192],
        height: g,
        angles: [0, 0, 0],
      },
    ]);
    expect(f.world.players[0].funds).toBe(funds + 1000);
    expect(etherealDword(f.world.players[0].raw, 0x4a3)).toBe(funds + 1000);
    expect(etherealWord(f.world.ethereals.records[0].native, 0x64)).toBe(200);
    for (let i = 0; i < 200; i++)
      stepCountdownEthereals(f.world, f.pack, f.options);
    expect(f.world.ethereals.records[0].native[0x56]).toBe(8);
    expect(requests).toHaveLength(1);
    expect(f.world.players[0].funds).toBe(funds + 1000);
  });
  it("runs a triggered marker delay, consumes two departure draws and cleans its retirement", () => {
    const f = fixture(),
      g = groundHeight(f.world.terrain, 8192, 8192);
    createCampaignEthereal(
      f.world,
      {
        selector: 2,
        owner: 0,
        position: [8192, 8192],
        initialHeight: g + 22400,
      },
      f.pack,
      f.options,
    );
    let n = f.world.ethereals.records[0].native;
    n[0x56] = 13;
    putEtherealWord(n, 0x64, 19);
    const draws = f.world.rng.draws;
    stepCountdownEthereals(f.world, f.pack, f.options);
    n = f.world.ethereals.records[0].native;
    expect(n[0x56]).toBe(14);
    expect(f.world.rng.draws - draws).toBe(2);
    expect(etherealWord(n, 0x37)).toBe(640);
    expect(etherealWord(n, 0x3f)).toBe(-1);
    n[0x16] = n[0x16]! & 0x3f;
    n[0x49] = n[0x49]! & ~0x10;
    putEtherealDword(n, 0x27, 60000);
    const out = stepCountdownEthereals(f.world, f.pack, f.options);
    expect(out.retired).toEqual([0]);
    expect(f.world.ethereals.count).toBe(0);
    expect(f.world.spatial.nodes["source:7:0"]).toBeUndefined();
    expect(
      out.events
        .filter((e) => e.type === "visitor")
        .map((e) => (e.type === "visitor" ? e.request : null)),
    ).toEqual([
      { type: "stop-audio", channel: 94 },
      { type: "stop-audio", channel: 95 },
    ]);
  });
  it("runs the normal child survey, return, notification, parent departure and timer restart", () => {
    const f = fixture(),
      g = groundHeight(f.world.terrain, 8192, 8192);
    createCampaignEthereal(
      f.world,
      {
        selector: 0,
        owner: 0,
        position: [8192, 8192],
        initialHeight: g + 16000,
      },
      f.pack,
      f.options,
    );
    f.world.countdown = 0;
    const states = new Set<number>(),
      parents = new Set<number>();
    let frames = 0,
      particles = 0,
      retired = 0;
    for (; frames < 2500; frames++) {
      f.world.frame = frames;
      const out = stepCountdownEthereals(f.world, f.pack, f.options);
      particles += out.particles.length;
      retired += out.retired.length;
      for (const r of f.world.ethereals.records)
        if (r.native[6] !== 0)
          (r.native[0x55] === 1 ? states : parents).add(r.native[0x56]!);
      stepEffectScheduler(f.world, f.pack, {
        ...f.options,
        onLandingEvent: () => {},
      });
      if (f.world.ethereals.count === 0 && f.world.countdown === 6000) break;
    }
    expect(frames).toBeLessThan(2500);
    expect([...states]).toEqual(expect.arrayContaining([0, 1, 3]));
    expect([...parents]).toEqual(expect.arrayContaining([5, 8, 9]));
    expect(retired).toBe(2);
    expect(particles).toBeGreaterThan(0);
    expect(
      f.world.powerEffects.slots.filter((s) => s.occupied).length,
    ).toBeLessThan(200);
  }, 20000);
});


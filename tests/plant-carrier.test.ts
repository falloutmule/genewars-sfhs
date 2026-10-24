import { describe, it, expect } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  makeMulePlantCarrier,
  stepPlantCarrierRecord,
  dropPlantCarrier,
} from "../src/sim/mechanics/plant-carrier";
import {
  createCampaignMulePlantCarrier,
  createStagedCampaignMulePlantCarrier,
  stepCampaignPlantCarrier,
} from "../src/sim/campaign/plant-carrier-adapter";
import {
  stepEffectScheduler,
  retireStagedSharedEffect,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { validateSpatial, insertSpatial } from "../src/sim/campaign/spatial";
import { put16, put32, i16, u16 } from "../src/sim/campaign/bytes";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { animationProfile } from "../src/sim/mechanics/animation";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

function fixture() {
  const pack = campaignFixture();
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: code === 67 || code === 68 ? 5 : 0,
      gravity: code === 67 || code === 68,
      priority: 1,
      childCode: null,
      movable: code === 67 || code === 68,
      waterResponse: code === 67 || code === 68,
    })),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  const eff = pack.assets.EFF,
    f = structuredClone(eff.frames![0]),
    first = eff.frames!.length;
  eff.frames!.push({ ...f, rawFlags: [0, 0, 0] });
  while (eff.animations!.length < 68)
    eff.animations!.push({ first: 0, last: 0, rawTrailingWord: 1 });
  eff.animations![67] = { first, last: first, rawTrailingWord: 1 };
  pack.ecologyRules!.corpseFriction = Array(8).fill(512);
  const w = createCampaign(pack, "synthetic-plant-carrier"),
    options: EffectSchedulerOptions<CampaignWorld> = {
      gravity: 512,
      obstacleAt: () => false,
      destructionObstacle: () => null,
      cleanupReferences: cleanupCampaignReferences,
      stageHost: (a, s) => Object.assign(s, structuredClone(a)),
      commitHost: (a, s) => Object.assign(a, s),
      plantCarrierEffect: (s, slot, out) =>
        stepCampaignPlantCarrier(s, slot, pack, options, out),
    };
  for (let slot = 0; slot < 200; slot++)
    if (w.powerEffects.slots[slot].occupied)
      retireStagedSharedEffect(w, slot, options);
  const p = w.ecology.plants[0],
    n: (number | null)[] = Array.from({ length: 49 }, (_, at) =>
      at >= 31 && at < 39 ? null : 0,
    );
  n[6] = 2;
  n[24] = 4;
  n[46] = 0x10;
  put16(n as number[], 15, 0);
  put16(n as number[], 7, 2048);
  put16(n as number[], 9, 2048);
  put16(n as number[], 44, 100);
  Object.assign(p, {
    active: true,
    owner: 4,
    position: [2048, 2048],
    selector: 0,
    growth: 100,
    flags: 0,
    plantFlags: 0x10,
    updateCounter: 0,
    retirement: 0,
    animation: 0,
    frame: 0,
    shade: 0,
    height: 2048,
    native: n,
  });
  w.ecology.plantCount = 1;
  put16(w.missionPrefix, 0x3552, 1);
  const q = {
    position: [8192, 8192] as [number, number],
    height: groundHeight(w.terrain, 8192, 8192),
    angles: [0, 0, 0] as [number, number, number],
    owner: 0 as const,
    parameter: 0 as const,
    delay: 0 as const,
  };
  const create = () => {
    const carrier = createStagedCampaignMulePlantCarrier(w, pack, q, options)!;
    put16(carrier.native as number[], 71, 0);
    carrier.native[73] = 2;
    return carrier;
  };
  const context = () => ({
    terrain: w.terrain,
    tables: pack.rules!.tables,
    bounce: pack.rules!.tables.bounce,
    friction: pack.ecologyRules!.corpseFriction!,
    gravity: 512,
    water: 0,
    frame: 2,
    obstacle: () => null,
    particle: () => false,
    publishMotion: () => {},
    plant: () => p.native,
    footprintBuilding: () => null,
    relinkPlant: () => {},
    depositOffset: [0, 0] as [number, number],
  });
  return { pack, w, options, p, q, create, context };
}
describe("shared plant carriers67/0x43 and68/0x44", () => {
  it("constructs only67 and retains untouched fields and preallocation prior identity", () => {
    const { w, pack, q, options } = fixture(),
      prior = w.powerEffects.slots[0].nativePrior!;
    prior[30] = 199;
    prior[67] = 47;
    prior[68] = 91;
    prior[73] = 4;
    prior[76] = 121;
    const result = createStagedCampaignMulePlantCarrier(w, pack, q, options)!;
    expect(result.native).toBe(prior);
    expect([
      u16(prior as number[], 21),
      prior[30],
      prior[67],
      prior[68],
      prior[73],
      prior[76],
    ]).toEqual([0x180, 199, 47, 91, 4, 121]);
    expect(prior.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(w.spatial.nodes[`source:4:${result.slot}`].cell).toBe(
      worldCell(...q.position),
    );
  });
  it("mode5 preserves timer and uninitialized animation fields;67 copies only plant shade", () => {
    const { create, context, p } = fixture(),
      n = create().native;
    p.native[23] = 255;
    n.fill(null, 26, 31);
    put16(n as number[], 74, 17);
    const before = p.native.slice(),
      rng = { seed: 9, draws: 0, ring: null },
      r = stepPlantCarrierRecord(n, rng, context());
    expect(r.native.slice(26, 31)).toEqual(Array(5).fill(null));
    expect(i16(r.native as number[], 74)).toBe(17);
    expect(
      p.native
        .map((v, i) => (v === before[i] ? null : i))
        .filter((v) => v !== null),
    ).toEqual([23]);
    expect(r.retirementRequired).toBe(false);
    expect(rng.draws).toBe(0);
  });
  it.each([2, 4, 3])(
    "4B1D0 uses actual first footprint selector%s and preserves identity/height",
    (selector) => {
      const { create, context, p } = fixture(),
        n = create().native;
      n[69] = 68;
      p.native[46] = 0xff;
      const held = p.native,
        oldHeight = p.native.slice(17, 21),
        order: string[] = [];
      const r = dropPlantCarrier(
        n,
        {
          ...context(),
          footprintBuilding: (at) => {
            order.push("query");
            expect(p.native.slice(7, 11)).toEqual(n.slice(7, 11));
            return { selector, position: at };
          },
          relinkPlant: (_index, actual) => {
            order.push("link");
            expect(actual).toBe(held);
          },
        },
        true,
      );
      expect(order).toEqual(["query", "link"]);
      expect(p.native).toBe(held);
      expect(p.native[46]).toBe(selector === 3 ? 0xeb : 0xef);
      expect(p.native.slice(17, 21)).toEqual(oldHeight);
      expect(n[70]).toBe(1);
      expect(r).toEqual({ plant: 0, retirementRequired: false });
    },
  );
  it("drop null kind does not relink or set phase;67 directdrop requests retirement", () => {
    const { create, context } = fixture(),
      n = create().native;
    n[69] = 68;
    n[73] = 0;
    expect(dropPlantCarrier(n, context(), true)).toEqual({
      plant: null,
      retirementRequired: false,
    });
    expect(n[70]).toBe(0);
    n[73] = 2;
    n[69] = 67;
    expect(dropPlantCarrier(n, context(), false).retirementRequired).toBe(true);
  });
  it("requires real obstacle/water services only when reached and rejects unknown retained refs", () => {
    const { create, context } = fixture(),
      n = create().native;
    n[71] = null;
    expect(() =>
      stepPlantCarrierRecord(n, { seed: 1, draws: 0, ring: null }, context()),
    ).toThrow("Unknown");
    n[71] = 0;
    n[73] = 0;
    expect(() =>
      stepPlantCarrierRecord(n, { seed: 1, draws: 0, ring: null }, context()),
    ).toThrow("kind2 plant");
    n[73] = 2;
    put32(n as number[], 39, 20000);
    expect(() =>
      stepPlantCarrierRecord(
        n,
        { seed: 1, draws: 0, ring: null },
        { ...context(), frame: 1, obstacle: undefined },
      ),
    ).toThrow("obstacle");
  });
  it("scheduler drops the original plant now and retires68 on the following callback", () => {
    const { w, pack, options, create, p } = fixture(),
      c = create();
    c.native[69] = 68;
    const held = p.native;
    const first = stepEffectScheduler(w, pack, options);
    expect(first.callbacks).toEqual([
      { phase: "primary", slot: c.slot, code: 68 },
    ]);
    expect(first.createdNewborns).toBe(0);
    expect(first.retired).toEqual([]);
    expect(w.powerEffects.slots[c.slot].nativePrior![70]).toBe(1);
    expect(w.ecology.plants[0].native).not.toBe(held); //outer scheduler transaction
    expect(w.ecology.plants[0].position).toEqual([8192, 8192]);
    expect(w.spatial.heads[worldCell(8192, 8192)]).toBe("source:1:0");
    expect(w.spatial.nodes["source:1:0"].next).toBe(`source:4:${c.slot}`);
    expect(stepEffectScheduler(w, pack, options).retired).toEqual([
      `source:4:${c.slot}`,
    ]);
    expect(w.spatial.nodes["source:1:0"].next).toBeNull();
    expect(w.ecology.plants[0].native[5]).toBe(0);
    validateSpatial(w.spatial);
  });
  it("an orphan marked carrier does not invent a newborn success count", () => {
    const { w, pack, options, create } = fixture(),
      c = create();
    c.native[21]! |= 1;
    //Source scheduler second pass requires a primary callback's success count;
    //a stale marked record alone is skipped, not fabricated into a newborn.
    const r = stepEffectScheduler(w, pack, options);
    expect(r.callbacks).toEqual([]);
    expect(w.powerEffects.slots[c.slot].nativePrior![21]! & 1).toBe(1);
  });
  it("capacity false never reads EFF67; late allocation/profile failure rolls back", () => {
    const { w, pack, options, q } = fixture();
    for (let slot = 0; slot < 200; slot++) {
      const made = createStagedCampaignMulePlantCarrier(w, pack, q, options)!;
      expect(made.slot).toBe(slot);
      made.native[21]! |= 1;
    }
    const broken = {
      ...pack,
      assets: { ...pack.assets, EFF: undefined },
    } as unknown as typeof pack;
    expect(
      createStagedCampaignMulePlantCarrier(w, broken, q, options),
    ).toBeNull();
    retireStagedSharedEffect(w, 0, options);
    const before = checksum(w);
    expect(() => createCampaignMulePlantCarrier(w, broken, q, options)).toThrow(
      "EFF",
    );
    expect(checksum(w)).toBe(before);
  });
  it("priority replacement preserves held prior and source49D30 does not invent a plant drop", () => {
    const { w, pack, options, q, create, p } = fixture(),
      carrier = create();
    //Actual49D30 has no67/68-specific plant-unload branch. Pool replacement
    //must retain this source behavior instead of manufacturing an insertion.
    retireStagedSharedEffect(w, carrier.slot, options);
    expect(w.spatial.nodes[p.id]).toBeUndefined();
    expect(p.native[46]).toBe(0x10);
    for (let i = 0; i < 200; i++)
      createStagedCampaignMulePlantCarrier(w, pack, q, options);
    const held = w.powerEffects.slots[0].nativePrior!;
    pack.effectRules!.descriptors[32].priority = 2;
    w.powerEffects.slots[0].nativePrior![69] = 32;
    const replaced = createStagedCampaignMulePlantCarrier(w, pack, q, options)!;
    expect(replaced.slot).toBe(0);
    expect(replaced.native).toBe(held);
    w.powerEffects.slots[0].nativePrior![69] = 32;
    const snapshot = checksum(w),
      broken = {
        ...pack,
        assets: { ...pack.assets, EFF: undefined },
      } as unknown as typeof pack;
    expect(() => createCampaignMulePlantCarrier(w, broken, q, options)).toThrow(
      "EFF",
    );
    expect(checksum(w)).toBe(snapshot);
  });
  it("staged drop keeps held roots/native identities and late query failure rolls back through scheduler", () => {
    const { w, pack, options, create, p } = fixture(),
      c = create();
    c.native[69] = 68;
    const held = [w.ecology, w.ecology.plants, p.native, w.rng, w.terrain],
      out = {
        callbacks: [],
        landingEvents: [],
        water: [],
        power: [],
        rewards: [],
        geneticist: [],
        createdNewborns: 0,
        retired: [],
        cleanedReferenceBytes: 0,
        queueCandidates: [],
      };
    const r = stepCampaignPlantCarrier(w, c.slot, pack, options, out);
    [w.ecology, w.ecology.plants, p.native, w.rng, w.terrain].forEach(
      (value, i) => expect(value).toBe(held[i]),
    );
    expect(r.droppedPlant).toBe(0);
    //Fresh isolated fixture: fail AFTER physics publication and drop writes.
    const f = fixture(),
      carrier = f.create();
    carrier.native[69] = 68;
    f.w.terrain.bytes[worldCell(...f.q.position) * 14 + 11] |= 1;
    const b = f.w.buildingNative[0];
    b[6] = 4;
    b[45] = 4;
    put16(b as number[], 15, 0);
    put16(b as number[], 7, 8192);
    put16(b as number[], 9, 8192);
    insertSpatial(
      f.w.spatial,
      f.w.terrain,
      "source:3:0",
      worldCell(8192, 8192),
    );
    synchronizeCampaignLinks(f.w);
    f.pack.creatureCommandRules = undefined;
    const before = checksum(f.w);
    expect(() => stepEffectScheduler(f.w, f.pack, f.options)).toThrow("74160");
    expect(checksum(f.w)).toBe(before);
  });
  it("ordinary host continuation saves and recorded-command replay preserve the drop/retirement", () => {
    const { w, pack, create, options } = fixture();
    enterCampaign(w, pack);
    for (let slot = 0; slot < 200; slot++)
      if (w.powerEffects.slots[slot].occupied)
        retireStagedSharedEffect(w, slot, options);
    const c = create();
    c.native[69] = 68;
    const replay = recordCampaign(w, null),
      loaded = loadCampaign(
        saveCampaign(w, { paused: false, speed: 1, accumulator: 0 }),
        w.contentHash,
      ).world;
    for (let i = 0; i < 4; i++) {
      stepCampaign(w, pack);
      stepCampaign(loaded, pack);
      expect(w.phase).toBe("active");
      expect(loaded.phase).toBe("active");
    }
    expect(checksum(loaded)).toBe(checksum(w));
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
    expect(w.powerEffects.slots[c.slot].occupied).toBe(false);
    expect(w.ecology.plants[0].active).toBe(true);
  });
});

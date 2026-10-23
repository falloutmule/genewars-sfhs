import { describe, expect, it } from "vitest";
import {
  planEtherealAttack,
  makeEtherealAttackEffect,
  stepEtherealAttackEffectRecord,
} from "../src/sim/mechanics/ethereal-attack";
import type {
  ImpactProjectileStepContext,
  ImpactProjectileChildRequest,
  GeneticistEffectEntity,
} from "../src/sim/mechanics/geneticist-projectile";
import {
  putEffectWord as put,
  putEffectDword as put32,
} from "../src/sim/mechanics/power-motion";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign, type CampaignWorld } from "../src/sim/campaign/world";
import {
  createStagedEtherealAttack,
  stepCampaignEtherealAttackEffect,
} from "../src/sim/campaign/ethereal-attack-adapter";
import {
  publishStagedSharedEffect,
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  campaignBlastTarget,
  synchronizeCampaignLinks,
} from "../src/sim/campaign/entity-view";
import {
  insertSpatial,
  unlinkSpatial,
  validateSpatial,
} from "../src/sim/campaign/spatial";
import { worldCell } from "../src/sim/mechanics/terrain";
import { u16 } from "../src/sim/campaign/bytes";
import type { SourceEntityId } from "../src/sim/campaign/source-pools";
type N = (number | null)[];
const word = (n: readonly (number | null)[], p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
const profile = { first: 0, last: 1, flags: 0, holds: [0, 0] };
const descriptor = {
  code: 25,
  completion: 4,
  gravity: false,
  priority: 7,
  childCode: 5,
  obstacle: true,
  water: true,
};
function native(size: number, kind: number, index = 0): N {
  const n: N = Array(size).fill(0);
  n.fill(null, 31, 39);
  n[6] = kind;
  put(n, 15, index);
  put(n, 7, 8192);
  put(n, 9, 8192);
  put32(n, 17, 2048);
  if (size > 100) put32(n, 39, 12800);
  return n;
}
function numeric() {
  const pack = campaignFixture(),
    terrain = { bytes: Array(229376).fill(0), revision: 0 };
  for (let cell = 0; cell < 16384; cell++) {
    put(terrain.bytes, cell * 14 + 2, 1024);
    terrain.bytes[cell * 14 + 5] = 2;
  }
  const parent = native(102, 8),
    target = native(67, 4),
    prior = native(81, 0);
  prior[30] = 217;
  prior[67] = 11;
  prior[68] = 93;
  prior[76] = 177;
  prior[80] = 231;
  put(target, 7, 8448);
  put32(target, 39, 0x12345678);
  const plan = planEtherealAttack(parent, target, {
      terrain,
      tables: pack.rules!.tables,
    }),
    n = makeEtherealAttackEffect(prior, 0, plan.request, {
      terrain,
      tables: pack.rules!.tables,
      descriptor,
      profile,
    }).native,
    children: ImpactProjectileChildRequest[] = [],
    rng = { seed: 5428, ring: 31, draws: 0 };
  const c: ImpactProjectileStepContext = {
    terrain,
    tables: pack.rules!.tables,
    bounce: Array(8).fill(128),
    water: 0,
    frame: 0,
    descriptor,
    profile,
    players: Array.from({ length: 4 }, () => Array(1805).fill(0)),
    speciesComponents: Array.from({ length: 25 }, () => [4, 4]),
    nearby: () => [],
    entity: () => ({
      id: "source:7:0",
      kind: 8,
      index: 0,
      owner: 0,
      position: [8192, 8192],
      physicalHeight: 12800,
      native: parent,
    }),
    obstacle: () => null,
    child: (r) => {
      children.push(structuredClone(r));
      return true;
    },
  };
  return { pack, parent, target, prior, terrain, plan, n, c, rng, children };
}
function campaign() {
  const pack = campaignFixture();
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 14 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 71 }, (_, code) => ({
      first: 0,
      last: code === 25 ? 1 : code === 5 ? 13 : 0,
      rawTrailingWord: code === 25 ? 2 : code === 5 ? 14 : 1,
    })),
  };
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: code === 25 ? 4 : 0,
      gravity: false,
      priority: code === 25 ? 7 : code === 5 ? 5 : 1,
      childCode: code === 25 ? 5 : null,
      movable: code === 25,
      waterResponse: code === 25,
    })),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  const w = createCampaign(pack, "synthetic-ethereal-attack");
  for (const node of Object.values(w.spatial.nodes))
    if (node.family === 4) unlinkSpatial(w.spatial, w.terrain, node.id);
  for (const s of w.powerEffects.slots) {
    s.occupied = false;
    s.packet = null;
    s.nativePrior![6] = 0;
  }
  w.landings = [];
  w.waterEffects = [];
  w.notices = [];
  const parent = native(102, 8),
    target = native(67, 4);
  put(target, 7, 8448);
  put(target, 9, 8192);
  put32(target, 17, 2048);
  w.ethereals.records[0].native = parent;
  w.buildingNative[0] = target;
  insertSpatial(w.spatial, w.terrain, "source:7:0", worldCell(8192, 8192));
  insertSpatial(w.spatial, w.terrain, "source:3:0", worldCell(8448, 8192));
  synchronizeCampaignLinks(w);
  const immediateFlags: number[] = [];
  const options: EffectSchedulerOptions<CampaignWorld> = {
    gravity: 512,
    obstacleAt: () => false,
    destructionObstacle: () => null,
    cleanupReferences: cleanupCampaignReferences,
    stageHost(original, staged) {
      staged.ethereals = structuredClone(original.ethereals);
      staged.buildingNative = original.buildingNative.map((n) => n.slice());
      staged.specialists = {
        ...original.specialists,
        records: original.specialists.records.map((n) => n.slice()),
      };
    },
    commitHost(target, staged) {
      target.ethereals = staged.ethereals;
      target.buildingNative = staged.buildingNative;
      target.specialists = staged.specialists;
    },
    etherealAttackEffect: (s, slot, out) =>
      stepCampaignEtherealAttackEffect(s, slot, pack, options, out),
    blastArea(s, n) {
      immediateFlags.push(n[21]! & 1);
      return {
        tables: pack.rules!.tables,
        directions: pack.ecologyRules!.spreadDirections,
        readCountdown: () => u16(s.missionPrefix, 0x355c),
        writeCountdown: (v) => {
          put(s.missionPrefix, 0x355c, v);
          s.countdown = v;
        },
        head: (p) => s.spatial.heads[worldCell(...p)],
        resolve: (id) => campaignBlastTarget(s, pack, id),
        next: (id) => s.spatial.nodes[id]?.next as SourceEntityId | null,
        damage: () => {
          throw Error("Unexpected synthetic native damage");
        },
      };
    },
  };
  return { pack, w, options, immediateFlags };
}
describe("Ethereal punishment attack25", () => {
  it("aims a stationary building at virtual0 ground rather than its health dword", () => {
    const f = numeric();
    expect(f.plan.request).toMatchObject({
      owner: 0,
      height: 12160,
      parameter: 128,
      parent: { kind: 8, index: 0 },
      newborn: false,
    });
    expect(f.plan.forecastPosition).toEqual([8448, 8192]);
    expect(f.plan.forecastHeight).toBe(2048);
    expect(f.plan.initialDistance).toBe(1368);
    const changed = f.target.slice();
    put32(changed, 39, -1);
    expect(
      planEtherealAttack(f.parent, changed, {
        terrain: f.terrain,
        tables: f.c.tables,
      }),
    ).toEqual(f.plan);
  });
  it("predicts actual specialist velocities with signed word wrap and terrain clamp", () => {
    const f = numeric(),
      target = native(200, 3, 2);
    put(target, 7, 32760);
    put(target, 9, -32760);
    put32(target, 39, 100);
    put(target, 45, 16000);
    put(target, 47, -13000);
    put(target, 49, -32000);
    const p = planEtherealAttack(f.parent, target, {
      terrain: f.terrain,
      tables: f.c.tables,
    });
    expect(p.forecastHeight).toBeGreaterThanOrEqual(2048);
    expect(p.forecastPosition).not.toEqual([32760, -32760]);
    expect(p.request.angles[2]).toBe(3840);
    expect(p.forecastPosition.every((v) => v >= -32768 && v <= 32767)).toBe(
      true,
    );
    const creature = target.slice(0, 124);
    creature[6] = 1;
    expect(
      planEtherealAttack(f.parent, creature, {
        terrain: f.terrain,
        tables: f.c.tables,
      }),
    ).toEqual(p);
  });
  it("retains slot priors while writing actual parent and audio10 without RNG", () => {
    const f = numeric(),
      rng = { ...f.rng },
      made = makeEtherealAttackEffect(f.prior, 4, f.plan.request, {
        terrain: f.terrain,
        tables: f.c.tables,
        descriptor,
        profile,
      });
    expect(made.native[30]).toBe(217);
    expect(made.native.slice(67, 69)).toEqual([11, 93]);
    expect(made.native[80]).toBe(231);
    expect(made.native[76]).toBe(0);
    expect(word(made.native, 74)).toBe(128);
    expect(word(made.native, 71)).toBe(0);
    expect(made.native[73]).toBe(8);
    expect(made.events).toEqual([
      {
        type: "audio",
        entity: "source:4:4",
        cue: 10,
        mode: 2,
        parameter: 0,
        ratePercent: 100,
      },
    ]);
    expect(f.rng).toEqual(rng);
    expect(JSON.parse(JSON.stringify(made))).toEqual(made);
    expect(f.prior[6]).toBe(0);
  });
  it("expires into one real newborn5 request before parent retirement, skipping query RNG", () => {
    const f = numeric();
    put(f.n, 74, 0);
    const r = stepEtherealAttackEffectRecord(f.n, f.rng, f.c);
    expect(r.retirementRequired).toBe(true);
    expect(r.newborns).toBe(1);
    expect(r.query).toBeNull();
    expect(f.rng.draws).toBe(0);
    expect(f.children).toEqual([
      {
        code: 5,
        owner: 0,
        position: [word(r.native, 7), word(r.native, 9)],
        height: dword(r.native, 39),
        angles: [0, 0, 0],
        parameter: 0,
        delay: 0,
        parent: { kind: 8, index: 0 },
        newborn: true,
      },
    ]);
    expect(r.native[6]).toBe(5);
    f.c.child = () => false;
    expect(stepEtherealAttackEffectRecord(f.n, f.rng, f.c).newborns).toBe(0);
  });
  it("records a parity building hit and forwards its index+1 into the blast parameter", () => {
    const f = numeric();
    f.c.frame = 1;
    f.c.obstacle = () => ({ kind: 4, index: 23 });
    const r = stepEtherealAttackEffectRecord(f.n, f.rng, f.c);
    expect(r.retirementRequired).toBe(true);
    expect(f.children[0].parameter).toBe(24);
    expect(r.query).toBeNull();
    expect(f.rng.draws).toBe(0);
  });
  it("uses strict nearest collision order and actual reflection research with five draws", () => {
    const f = numeric(),
      target = native(124, 1, 3);
    target[24] = 4;
    target[94] = 8;
    target[118] = 91;
    target[122] = 19;
    const contact: GeneticistEffectEntity = {
      id: "source:0:3",
      kind: 1,
      index: 3,
      owner: 4,
      position: [word(f.n, 7), word(f.n, 9)],
      physicalHeight: dword(f.n, 39),
      native: target,
    };
    f.c.nearby = () => [contact];
    const r = stepEtherealAttackEffectRecord(f.n, f.rng, f.c);
    expect(r.retirementRequired).toBe(false);
    expect(r.events[0]).toMatchObject({ cue: 97, entity: contact.id });
    expect(f.rng.draws).toBe(5);
    expect(f.children).toEqual([]);
    const g = numeric();
    g.c.nearby = () => [
      { ...contact, kind: 3, id: "source:2:3", native: native(200, 3, 3) },
    ];
    const hit = stepEtherealAttackEffectRecord(g.n, g.rng, g.c);
    expect(hit.retirementRequired).toBe(true);
    expect(hit.newborns).toBe(1);
    expect(g.rng.draws).toBe(2);
  });
  it("executes unmarked water21 before the expiration blast5", () => {
    const f = numeric();
    for (let cell = 0; cell < 16384; cell++) {
      put(f.terrain.bytes, cell * 14 + 2, 100);
      f.terrain.bytes[cell * 14 + 5] = 0;
    }
    f.c.frame = 3;
    f.c.water = 1600;
    put32(f.n, 17, 200);
    put32(f.n, 39, 1000);
    put(f.n, 49, 0);
    put(f.n, 74, 0);
    const r = stepEtherealAttackEffectRecord(f.n, f.rng, f.c);
    expect(f.children.map((r) => r.code)).toEqual([21, 5]);
    expect(f.children.map((r) => r.newborn)).toEqual([false, true]);
    expect(r.newborns).toBe(1);
  });
  it("rejects absent physical inputs and an incorrect original EFF binding", () => {
    const f = numeric(),
      target = f.target.slice();
    target[17] = null;
    expect(() =>
      planEtherealAttack(f.parent, target, {
        terrain: f.terrain,
        tables: f.c.tables,
      }),
    ).toThrow(/prior byte/);
    expect(() =>
      makeEtherealAttackEffect(f.prior, 0, f.plan.request, {
        terrain: f.terrain,
        tables: f.c.tables,
        descriptor,
        profile: { ...profile, holds: [0], last: 0 },
      }),
    ).toThrow(/two zero-hold/);
  });
  it("runs real shared blast immediate work, marks newborn afterwards, and dispatches it once", () => {
    const f = campaign(),
      made = createStagedEtherealAttack(
        f.w,
        0,
        "source:3:0",
        f.pack,
        f.options,
      );
    expect(made.slot).toBe(0);
    put(f.w.powerEffects.slots[0].nativePrior!, 74, 0);
    const receipt = stepEffectScheduler(f.w, f.pack, f.options);
    expect(receipt.callbacks).toEqual([
      { phase: "primary", slot: 0, code: 25 },
      { phase: "newborn", slot: 1, code: 5 },
    ]);
    expect(receipt.attacks).toHaveLength(1);
    expect(receipt.createdNewborns).toBe(1);
    expect(f.immediateFlags).toEqual([0]);
    expect(f.w.powerEffects.slots[0].occupied).toBe(false);
    expect(f.w.powerEffects.slots[1].nativePrior![21]! & 1).toBe(0);
    expect(f.w.audio.requests.some((r) => r.cue === 10)).toBe(true);
    validateSpatial(f.w.spatial);
  });
  it("fails capacity without factory RNG/audio, preserving the full source aim result", () => {
    const f = campaign(),
      n = numeric().n;
    for (let slot = 0; slot < 200; slot++) {
      const image = n.slice();
      put(image, 15, slot);
      image[69] = 69;
      publishStagedSharedEffect(f.w, slot, image);
    }
    const rng = { ...f.w.rng },
      audio = JSON.stringify(f.w.audio),
      r = createStagedEtherealAttack(f.w, 0, "source:3:0", f.pack, f.options);
    expect(r.slot).toBeNull();
    expect(r.request.angles[2]).toBe(3840);
    expect(f.w.rng).toEqual(rng);
    expect(JSON.stringify(f.w.audio)).toBe(audio);
  });
  it("rolls back the whole shared pass if a required real blast service fails late", () => {
    const f = campaign();
    createStagedEtherealAttack(f.w, 0, "source:3:0", f.pack, f.options);
    put(f.w.powerEffects.slots[0].nativePrior!, 74, 0);
    f.options.blastArea = () => {
      throw Error("synthetic missing target damage service");
    };
    const before = JSON.stringify(f.w);
    expect(() => stepEffectScheduler(f.w, f.pack, f.options)).toThrow(
      /missing target damage/,
    );
    expect(JSON.stringify(f.w)).toBe(before);
  });
  it("keeps unsupported same-slot inline replacement explicit and atomic", () => {
    const f = campaign();
    createStagedEtherealAttack(f.w, 0, "source:3:0", f.pack, f.options);
    const source = f.w.powerEffects.slots[0].nativePrior!;
    put(source, 74, 0);
    for (let slot = 1; slot < 200; slot++) {
      const image = source.slice();
      put(image, 15, slot);
      image[69] = 69;
      publishStagedSharedEffect(f.w, slot, image);
    }
    const before = JSON.stringify(f.w);
    expect(() => stepEffectScheduler(f.w, f.pack, f.options)).toThrow(
      /same-slot continuation/,
    );
    expect(JSON.stringify(f.w)).toBe(before);
  });
});

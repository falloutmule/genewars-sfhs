import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  queueCampaign,
  stepCampaign,
  validateCampaignWorld,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  campaignBotanistContext,
  createStagedBotanistPlant,
  applyCampaignBotanistEconomy,
  createStagedBotanistEconomyEffect,
  stepCampaignBotanist,
} from "../src/sim/campaign/botanist-adapter";
import type { CampaignSpecialistServices } from "../src/sim/campaign/specialist-adapter";
import {
  stepEffectScheduler,
  publishStagedSharedEffect,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { put16, put32, u16, u32 } from "../src/sim/campaign/bytes";
import { worldCell } from "../src/sim/mechanics/terrain";
import { readGeneticistMotion } from "../src/sim/mechanics/geneticist";
import { stepStagedBotanistRole } from "../src/sim/mechanics/botanist";
import { checksum } from "../src/sim/checksum";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";

/** Source-shaped synthetic startup/factories; readiness is deliberately an
 * isolated host fixture, not a landing or mission-acceptance playthrough. */
function fixture() {
  const pack = campaignFixture();
  pack.missions[0].startup!.context.actorMask = 7;
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 13 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 71 }, (_, code) => ({
      first: 0,
      last: code === 8 ? 12 : code === 61 ? 8 : 5,
      rawTrailingWord: code === 8 ? 13 : code === 61 ? 9 : 6,
    })),
  };
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: 0,
      gravity: false,
      priority: code === 7 || code === 8 ? 21 : 11,
      childCode: null,
      movable: false,
      waterResponse: false,
    })),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  for (const p of pack.ecologyRules!.plants) {
    p.growthDeltas.fill(2);
    p.opaqueBytes[16] = 6;
    p.retirementDelay = 8;
  }
  const seed = createCampaign(pack, "synthetic-botanist-adapter");
  seed.players[0].progress = 1;
  seed.players[0].raw[0x6e7] = 1;
  const w = createCampaign(pack, "synthetic-botanist-adapter", 1, {
    players: seed.players,
    selectedPlayer: 0,
    world: seed.missionPrefix.slice(0x34ba, 0x3550),
    rngRing: seed.rng.ring,
  });
  w.phase = "active";
  w.frame = 1;
  w.tick = 1;
  for (const a of w.actors) {
    const n = w.specialists.records[a.id];
    put16(n as number[], 7, 8192 + a.id * 128);
    put16(n as number[], 9, 8192);
    put32(n as number[], 17, 2048);
    put32(n as number[], 39, 2048);
    put16(n as number[], 112, (u16(n as number[], 112) & 0xfbfe) | 1);
    n[22] = n[22]! & 247;
    a.ready = true;
    a.motion = readGeneticistMotion(n);
    a.goal = null;
    a.route = [];
    insertSpatial(
      w.spatial,
      w.terrain,
      `source:2:${a.id}`,
      worldCell(a.motion.x, a.motion.y),
    );
  }
  synchronizeCampaignLinks(w);
  put16(w.missionPrefix, 0x1c7c, 5000);
  put16(w.missionPrefix, 0x1c78, 100);
  put32(w.players[0].raw, 13, 0);
  put32(w.players[0].raw, 17, 0);
  put32(w.players[0].raw, 0x49d, 1);
  const actor = w.actors.find(
    (a) => w.players[a.owner].blueprints[a.blueprintIndex].category === 1,
  )!;
  if (!actor) throw Error("Synthetic actual factory did not produce category1");
  function options(_w: CampaignWorld): EffectSchedulerOptions<CampaignWorld> {
    return {
      gravity: 512,
      obstacleAt: () => false,
      cleanupReferences: cleanupCampaignReferences,
      stageHost: (before, staged) =>
        Object.assign(staged, structuredClone(before)),
      commitHost: (target, staged) => Object.assign(target, staged),
    };
  }
  const services: CampaignSpecialistServices = { effectOptions: options };
  return { pack, w, index: actor.id, services, options };
}
const occupied = (w: CampaignWorld) =>
  w.powerEffects.slots.flatMap((p, slot) =>
    p.occupied ? [{ slot, n: p.nativePrior! }] : [],
  );

describe("campaign Botanist adapter", () => {
  it("uses actual category1 factory bindings and preserves held native/player/binding through plant creation and credit1/8", () => {
    const f = fixture(),
      { w, pack, index, services } = f,
      n = w.specialists.records[index],
      raw = w.players[0].raw,
      binding = w.specialists.bindings[index],
      plant = w.ecology.plants[0],
      plantNative = plant.native;
    const at: [number, number] = [8192 + index * 128, 8192];
    n[85] = 10;
    n[88] = 1;
    n[126] = 1;
    n[131] = 0;
    n[114] = 10;
    n[112] = 129;
    put32(n as number[], 104, 1);
    put16(n as number[], 136, at[0]);
    put16(n as number[], 138, at[1]);
    put32(n as number[], 142, 1536 * 1536);
    const draws = w.rng.draws;
    stepStagedBotanistRole(
      w,
      index,
      campaignBotanistContext(w, pack, services),
    );
    expect(w.specialists.records[index]).toBe(n);
    expect(w.players[0].raw).toBe(raw);
    expect(w.specialists.bindings[index]).toBe(binding);
    expect(w.ecology.plants[0]).toBe(plant);
    expect(plant.native).toBe(plantNative);
    expect([
      plant.active,
      plant.flags,
      plant.owner,
      plant.growth,
      n[114],
    ]).toEqual([true, 4, 0, 4, 4]);
    expect([
      u16(w.missionPrefix, 0x3552),
      u16(raw, 0x5fa),
      w.ecology.ownerPlantCounts[0],
    ]).toEqual([1, 1, 1]);
    expect([u32(raw, 13), u32(raw, 17)]).toEqual([9, 9]);
    expect(
      w.audio.requests
        .filter((r) => r.type !== "playback-rate" && r.cue === 57)
        .map((r) => r.entity),
    ).toEqual(["source:1:0", `source:2:${index}`]);
    expect(occupied(w).map((p) => p.n[69])).toEqual([60, 60]);
    expect(w.rng.draws - draws).toBe(15);
    expect(w.spatial.nodes[plant.id].cell).toBe(worldCell(...plant.position));
    validateSpatial(w.spatial);
    validateCampaignWorld(w, w.contentHash);
  });
  it("runs actual code7/60/61 scheduled callbacks to retirement with persistent shared fractions/counts", () => {
    const f = fixture(),
      { w, pack, index, services } = f,
      c = campaignBotanistContext(w, pack, services),
      effect = {
        code: 7 as const,
        owner: 0 as const,
        position: [8192, 8192] as [number, number],
        height: 2048,
        angles: [0, 0, 0] as [0, 0, 0],
        parameter: 0 as const,
        delay: 0 as const,
        newborn: false as const,
      };
    w.powerEffects.slots[0].nativePrior![67] = 193;
    w.powerEffects.slots[0].fractionX = 193;
    w.powerEffects.slots[0].nativePrior![68] = 71;
    w.powerEffects.slots[0].fractionY = 71;
    const draws = w.rng.draws;
    c.effect!(w, effect);
    expect(w.rng.draws).toBe(draws);
    for (const code of [60, 61] as const)
      createStagedBotanistEconomyEffect(
        w,
        { ...effect, code, owner: 0, angles: [512, 0, 800] },
        pack,
        services,
      );
    expect(w.rng.draws - draws).toBe(2);
    expect(occupied(w).map((p) => p.n[69])).toEqual([7, 60, 61]);
    expect([
      w.powerEffects.slots[0].fractionX,
      w.powerEffects.slots[0].fractionY,
    ]).toEqual([193, 71]);
    expect(u16(w.missionPrefix, 0x3554)).toBe(3);
    const callbacks = new Set<number>();
    for (let i = 0; i < 40 && occupied(w).length; i++) {
      w.frame++;
      const r = stepEffectScheduler(w, pack, f.options(w));
      r.callbacks.forEach((call) => callbacks.add(call.slot));
    }
    expect([...callbacks].sort()).toEqual([0, 1, 2]);
    expect(occupied(w)).toEqual([]);
    expect(u16(w.missionPrefix, 0x3554)).toBe(0);
    expect(w.rng.draws - draws).toBe(2);
    validateCampaignWorld(w, w.contentHash);
  });
  it("keeps the held plant/player/specialist identities across real damage and ignition", () => {
    const f = fixture(),
      { w, pack, index, services } = f;
    const slot = createStagedBotanistPlant(
      w,
      { actor: index, owner: 0, selector: 0, position: [9000, 9000] },
      pack,
      services,
    )!;
    const plant = w.ecology.plants[slot],
      native = plant.native,
      actor = w.specialists.records[index],
      player = w.players[0].raw,
      binding = w.specialists.bindings[index],
      c = campaignBotanistContext(w, pack, services);
    c.damagePlant!(w, slot, 1, index);
    expect(plant.growth).toBe(3);
    expect(plant.native).toBe(native);
    c.ignitePlant!(w, slot, index);
    expect(plant.native).toBe(native);
    expect(w.specialists.records[index]).toBe(actor);
    expect(w.players[0].raw).toBe(player);
    expect(w.specialists.bindings[index]).toBe(binding);
    expect([plant.growth, plant.plantFlags & 0x88]).toEqual([0, 0x88]);
    expect(occupied(w).map((e) => e.n[69])).toContain(8);
    validateSpatial(w.spatial);
  });
  it("preserves credit/debit caller draws on full capacity and uses real cleanup before priority replacement", () => {
    const f = fixture(),
      { w, pack, index, services } = f,
      q = {
        code: 60 as const,
        owner: 0,
        position: [8192, 8192] as [number, number],
        height: 2048,
        angles: [0, 0, 640] as [number, number, number],
        parameter: 0 as const,
        delay: 0 as const,
        newborn: false as const,
      };
    expect(createStagedBotanistEconomyEffect(w, q, pack, services)).toBe(0);
    // Legal synthetic full-pool afterimages isolate capacity from200 repeated
    // factories; no additional gameplay constructor is being claimed here.
    const carrier = w.powerEffects.slots[0].nativePrior!;
    for (let slot = 1; slot < 200; slot++) {
      const n = carrier.slice();
      put16(n as number[], 15, slot);
      publishStagedSharedEffect(w, slot, n);
    }
    put16(w.missionPrefix, 0x3554, 200);
    const beforeEffects = checksum(w.powerEffects),
      draws = w.rng.draws,
      raw = w.players[0].raw,
      entity = `source:2:${index}` as const,
      c = campaignBotanistContext(w, pack, services);
    expect(createStagedBotanistEconomyEffect(w, q, pack, services)).toBeNull();
    c.effect!(w, { ...q, code: 7, owner: 0, angles: [0, 0, 0] });
    expect(w.rng.draws).toBe(draws);
    applyCampaignBotanistEconomy(w, pack, entity, "credit", 8, services);
    expect(w.rng.draws - draws).toBe(3);
    expect([u32(raw, 13), u32(raw, 17)]).toEqual([8, 8]);
    applyCampaignBotanistEconomy(w, pack, entity, "debit", 50, services);
    expect(w.rng.draws - draws).toBe(21);
    expect(u32(raw, 17) | 0).toBe(-42);
    expect(checksum(w.powerEffects)).toBe(beforeEffects);
    expect(u16(w.missionPrefix, 0x3554)).toBe(200);
    // A weaker source7 descriptor is now replaceable by60. The actual shared
    // cleanup clears an actor reference BEFORE the same identity is reused.
    const weak = w.powerEffects.slots[5].nativePrior!.slice();
    weak[69] = 7;
    weak[29] = 0;
    publishStagedSharedEffect(w, 5, weak);
    const actor = w.specialists.records[index];
    put16(actor as number[], 127, 5);
    actor[129] = 5;
    const replaceDraws = w.rng.draws;
    expect(createStagedBotanistEconomyEffect(w, q, pack, services)).toBe(5);
    expect(actor[129]).toBe(0);
    expect(w.rng.draws - replaceDraws).toBe(1);
    expect(w.powerEffects.slots[5].nativePrior![69]).toBe(60);
    expect(u16(w.missionPrefix, 0x3554)).toBe(200);
    validateCampaignWorld(w, w.contentHash);
  });
  it("retires a lethally damaged owned plant and clears held target references/counts before slot reuse", () => {
    const f = fixture(),
      { w, pack, index, services } = f;
    pack.ecologyRules!.plants[0].retirementDelay = 0;
    const slot = createStagedBotanistPlant(
      w,
      { actor: index, owner: 0, selector: 0, position: [9000, 9000] },
      pack,
      services,
    )!;
    const p = w.ecology.plants[slot],
      n = p.native,
      actor = w.specialists.records[index];
    put16(actor as number[], 127, slot);
    actor[129] = 2;
    campaignBotanistContext(w, pack, services).damagePlant!(w, slot, 4, index);
    expect(p.native).toBe(n);
    expect([
      p.active,
      n[6],
      actor[129],
      w.ecology.plantCount,
      u16(w.players[0].raw, 0x5fa),
    ]).toEqual([false, 0, 0, 0, 0]);
    expect(w.spatial.nodes[p.id]).toBeUndefined();
    expect(u16(w.missionPrefix, 0x3552)).toBe(0);
    validateSpatial(w.spatial);
  });
  it("round-trips a mid-work save and continues native planting/shared effects with the same complete checksum", () => {
    const f = fixture(),
      { w, pack, index, services } = f,
      n = w.specialists.records[index];
    n[85] = 10;
    n[88] = 1;
    n[126] = 1;
    n[131] = 0;
    n[114] = 10;
    n[112] = 129;
    put32(n as number[], 104, 3);
    put16(n as number[], 136, 8192 + index * 128);
    put16(n as number[], 138, 8192);
    put32(n as number[], 142, 1536 * 1536);
    stepStagedBotanistRole(
      w,
      index,
      campaignBotanistContext(w, pack, services),
    );
    const loaded = loadCampaign(
      saveCampaign(w, { paused: true, speed: 2, accumulator: 5 }),
      w.contentHash,
    ).world;
    expect(checksum(loaded)).toBe(checksum(w));
    for (let i = 0; i < 2; i++) {
      for (const state of [w, loaded]) {
        stepStagedBotanistRole(
          state,
          index,
          campaignBotanistContext(state, pack, services),
        );
        state.frame++;
        stepEffectScheduler(state, pack, f.options(state));
      }
      expect(checksum(loaded)).toBe(checksum(w));
    }
    expect(w.ecology.plantCount).toBe(1);
    expect(u32(w.players[0].raw, 13)).toBe(9);
    validateCampaignWorld(loaded, w.contentHash);
  });
  it("accepts only a ready owned Botanist and a researched selector at the ordinary command boundary", () => {
    const f = fixture(),
      { w, index } = f,
      point: [number, number] = [9000, 9000],
      engineer = w.actors.find(
        (a) => w.players[a.owner].blueprints[a.blueprintIndex].category === 0,
      )!;
    expect(
      queueCampaign(w, {
        type: "botanist-work",
        actorId: engineer.id,
        task: 0,
        point,
      }).reason,
    ).toMatch(/Botanist/);
    const actor = w.actors.find((a) => a.id === index)!;
    actor.ready = false;
    expect(
      queueCampaign(w, {
        type: "botanist-work",
        actorId: index,
        task: 0,
        point,
      }).reason,
    ).toMatch(/landed/);
    actor.ready = true;
    w.specialists.records[index][85] = 4;
    expect(
      queueCampaign(w, {
        type: "botanist-work",
        actorId: index,
        task: 0,
        point,
      }).reason,
    ).toMatch(/dying/);
    w.specialists.records[index][85] = 1;
    expect(
      queueCampaign(w, {
        type: "botanist-work",
        actorId: index,
        task: 1,
        point,
      }).ok,
    ).toBe(false);
    put32(w.players[0].raw, 0x67e, 0);
    expect(
      queueCampaign(w, {
        type: "botanist-work",
        actorId: index,
        task: 1,
        selector: 0,
        point,
      }).ok,
    ).toBe(false);
    expect(w.pending).toEqual([]);
    put32(w.players[0].raw, 0x67e, 1);
    expect(
      queueCampaign(w, {
        type: "botanist-work",
        actorId: index,
        task: 1,
        selector: 0,
        point,
      }),
    ).toEqual({ ok: true, reason: null });
    expect(w.pending[0].command).toEqual({
      type: "botanist-work",
      actorId: index,
      task: 1,
      selector: 0,
      point,
    });
    const saved = loadCampaign(
      saveCampaign(w, { paused: false, speed: 1, accumulator: 0 }),
      w.contentHash,
    ).world;
    expect(saved.pending).toEqual(w.pending);
    expect(checksum(saved)).toBe(checksum(w));
  });
  it("admits all three original modes while demanding plant knowledge only for selected planting", () => {
    for (const task of [0, 1, 2] as const) {
      const f = fixture(),
        { w, index } = f;
      put32(w.players[0].raw, 0x67e, task === 1 ? 1 : 0);
      const command = {
        type: "botanist-work" as const,
        actorId: index,
        task,
        point: [9000, 9000] as [number, number],
        ...(task === 1 ? { selector: 0 } : {}),
      };
      expect(queueCampaign(w, command)).toEqual({ ok: true, reason: null });
      expect(w.pending[0].command).toEqual(command);
    }
  });
  it("consumes an ordinary queued planting command through the real host callback after save/reload", () => {
    const f = fixture(),
      { w, pack, index } = f,
      n = w.specialists.records[index];
    n[114] = 10;
    put32(w.players[0].raw, 0x67e, 1);
    const point: [number, number] = [8192 + index * 128, 8192];
    expect(
      queueCampaign(w, {
        type: "botanist-work",
        actorId: index,
        task: 1,
        selector: 0,
        point,
      }).ok,
    ).toBe(true);
    const loaded = loadCampaign(
      saveCampaign(w, { paused: false, speed: 1, accumulator: 0 }),
      w.contentHash,
    ).world;
    stepCampaign(w, pack);
    stepCampaign(loaded, pack);
    expect(checksum(loaded)).toBe(checksum(w));
    expect(w.pending).toEqual([]);
    const current = w.specialists.records[index];
    expect([
      current[85],
      current[126],
      current[87]! & 1,
      current[88]! & 1,
    ]).toEqual([10, 1, 0, 1]);
    expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
  });
  it("rolls back the entire callback on a late invalid61 profile after damage, ignition, audio, credits and RNG", () => {
    const f = fixture(),
      { w, pack, index, services } = f;
    const slot = createStagedBotanistPlant(
      w,
      { actor: index, owner: 0, selector: 0, position: [9000, 9000] },
      pack,
      services,
    )!;
    const n = w.specialists.records[index];
    n[85] = 10;
    n[88] = 1;
    n[126] = 2;
    n[129] = 2;
    n[112] = 129;
    n[27] = 0;
    put16(n as number[], 127, slot);
    put16(n as number[], 134, 1);
    put32(n as number[], 104, 5);
    pack.assets.EFF.animations![61] = { first: 0, last: 1, rawTrailingWord: 2 };
    const before = checksum(w),
      player = w.players[0].raw,
      binding = w.specialists.bindings[index],
      plantNative = w.ecology.plants[slot].native;
    expect(() => stepCampaignBotanist(w, index, pack, services)).toThrow(
      /EFF60\/61/,
    );
    expect(checksum(w)).toBe(before);
    expect(w.specialists.records[index]).toBe(n);
    expect(w.players[0].raw).toBe(player);
    expect(w.specialists.bindings[index]).toBe(binding);
    expect(w.ecology.plants[slot].native).toBe(plantNative);
  });
});

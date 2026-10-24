import { beforeAll, describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  queueCampaign,
  validateCampaignWorld,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  damageCampaignSpecialist,
  stepCampaignSpecialistAbduction,
  cancelStagedCampaignSpecialistWork,
  type CampaignSpecialistServices,
} from "../src/sim/campaign/specialist-adapter";
import {
  createStagedGeneticistEffectChild,
  stepCampaignGeneticistEffect,
} from "../src/sim/campaign/geneticist-effect-adapter";
import {
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { specialistCorpseBinding } from "../src/sim/mechanics/specialist-corpse";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { i16, put16, u32 } from "../src/sim/campaign/bytes";
import { checksum } from "../src/sim/checksum";
import { setupStagedSpecialistAbduction } from "../src/sim/mechanics/specialist-abduction";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";

describe("campaign specialist services", () => {
  const pack = campaignFixture();
  let start: CampaignWorld;
  function options(w: CampaignWorld): EffectSchedulerOptions<CampaignWorld> {
    return {
      gravity: 512,
      obstacleAt: () => false,
      cleanupReferences: cleanupCampaignReferences,
      stageHost: (w, s) => Object.assign(s, structuredClone(w)),
      commitHost: (w, s) => Object.assign(w, s),
      geneticistEffect: (s, slot, out) =>
        stepCampaignGeneticistEffect(s, slot, pack, options(s), out),
    };
  }
  const services: CampaignSpecialistServices = { effectOptions: options };
  beforeAll(() => {
    pack.assets.EFF = {
      ...pack.assets.EFF,
      frames: Array.from({ length: 15 }, (_, index) => ({
        components: [],
        width: 1,
        height: 1,
        rawFlags: [index >= 10 ? 1 : 0, 0],
      })),
      animations: Array.from({ length: 50 }, (_, code) => ({
        first: code === 26 ? 10 : 0,
        last:
          code === 32
            ? 9
            : code === 26
              ? 14
              : code === 20
                ? 6
                : code >= 41 && code <= 43
                  ? 0
                  : 1,
        rawTrailingWord:
          code === 32
            ? 10
            : code === 26
              ? 5
              : code === 20
                ? 7
                : code >= 41 && code <= 43
                  ? 1
                  : 2,
      })),
    };
    pack.assets.BONES = pack.assets.MULE;
    pack.ecologyRules!.muleCombat = {
      queryRadius: 512,
      attack: 20,
      defense: 2,
      disposition: 50,
      foodWeights: [10, 20, 30],
      attackChannel: 41,
    };
    pack.effectRules = {
      schemaVersion: 1,
      descriptors: Array.from({ length: 71 }, (_, code) => ({
        code,
        retirementMode: code === 69 ? 5 : 0,
        gravity: false,
        priority: 20,
        childCode: null,
        movable: code === 69,
        waterResponse: false,
      })),
      provenance: {
        executableSha256: "0".repeat(64),
        originalExecution: false,
      },
    };
    start = createCampaign(pack, "specialist-host");
    enterCampaign(start);
    for (let i = 0; i < 200; i++) stepCampaign(start, pack);
    expect(start.notices.filter((n) => n.severity === "error")).toEqual([]);
    expect(start.actors.every((a) => a.ready)).toBe(true);
  }, 30000);
  function abducted() {
    const w = structuredClone(start),
      n = w.ethereals.records[0].native;
    n.fill(0);
    n.fill(null, 31, 39);
    n[6] = 8;
    n[24] = 0;
    n[87] = 4;
    put16(n as number[], 15, 0);
    const actor = w.specialists.records[1];
    put16(n as number[], 7, i16(actor as number[], 7));
    put16(n as number[], 9, i16(actor as number[], 9));
    w.ethereals.count = 1;
    w.missionPrefix[0x3559] = 1;
    insertSpatial(
      w.spatial,
      w.terrain,
      "source:7:0",
      ((i16(n as number[], 9) >> 8) & 127) * 128 +
        ((i16(n as number[], 7) >> 8) & 127),
    );
    synchronizeCampaignLinks(w);
    setupStagedSpecialistAbduction(w, 1, n, {
      cancelWork: (s, index) =>
        cancelStagedCampaignSpecialistWork(s, index, pack, services),
    });
    w.frame = 207; //Synthetic phase8 feedback admission; no mission gate claim.
    return w;
  }
  it("binds actual abducting visitor stages and shared26 feedback, with complete save continuation", () => {
    const w = abducted();
    stepCampaignSpecialistAbduction(w, 1, pack, services);
    expect(w.specialists.records[1][89]).toBe(11);
    expect(w.actors[1].reason).toBe("Being abducted");
    const feedback = w.powerEffects.slots.filter(
      (e) => e.occupied && e.nativePrior?.[69] === 26,
    );
    expect(feedback).toHaveLength(1);
    expect(feedback[0].nativePrior![21]! & 1).toBe(0);
    const loaded = loadCampaign(
      saveCampaign(w, { paused: true, speed: 2, accumulator: 0 }),
      w.contentHash,
    ).world;
    w.frame++;
    loaded.frame++;
    stepCampaignSpecialistAbduction(w, 1, pack, services);
    stepCampaignSpecialistAbduction(loaded, 1, pack, services);
    expect(checksum(loaded)).toBe(checksum(w));
  });
  it("rolls back motion, RNG and feedback when the actual visitor reference is absent", () => {
    const w = abducted();
    w.ethereals.records[0].native[6] = 0;
    const before = checksum(w);
    expect(() => stepCampaignSpecialistAbduction(w, 1, pack, services)).toThrow(
      /parent reference/,
    );
    expect(checksum(w)).toBe(before);
  });
  it("runs ordinary Geneticist movement through pending native commands, saves and replay", () => {
    const w = structuredClone(start),
      a = w.actors[1],
      r = recordCampaign(w, "synthetic-specialist-host"),
      command = {
        type: "move" as const,
        actorId: a.id,
        point: [9000, 9000] as [number, number],
        queued: false,
      };
    expect(queueCampaign(w, command).ok).toBe(true);
    r.commands.push({ tick: w.tick, type: "command", command });
    stepCampaign(w, pack);
    expect(w.specialists.records[a.id][85]).toBe(8);
    expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
    const saved = saveCampaign(w, { paused: true, speed: 2, accumulator: 3 }),
      loaded = loadCampaign(saved, w.contentHash).world;
    stepCampaign(w, pack);
    stepCampaign(loaded, pack);
    expect(checksum(loaded)).toBe(checksum(w));
    expect(
      checksum(replayCampaign(sealCampaignReplay(r, w), pack, w.contentHash)),
    ).toBe(checksum(w));
  });
  it("rejects role/target mistakes at the actual campaign command boundary", () => {
    const w = structuredClone(start);
    expect(
      queueCampaign(w, { type: "research-mule", actorId: 0, muleIndex: 0 })
        .reason,
    ).toMatch(/Geneticist/);
    expect(
      queueCampaign(w, { type: "heal-mule", actorId: 1, muleIndex: 0 }).reason,
    ).toMatch(/Mule/);
    expect(
      queueCampaign(w, {
        type: "construct",
        actorId: 1,
        selector: 11,
        point: [8192, 8192],
        queued: false,
      }).reason,
    ).toMatch(/Engineer/);
  });
  it("retargets a moving Geneticist through queued81080 and preserves pending save continuation and full replay", () => {
    const w = structuredClone(start), actor = w.actors[1];
    const position: [number, number] = [actor.motion.x + 128, actor.motion.y];
    const factory = initializeMuleNative(w.creatureNative[0], w.rng,
      { slot: 0, owner: 4, position, quality: 50 },
      { terrain: w.terrain, tables: pack.rules!.tables });
    if (!factory.ok) throw Error(factory.reason);
    const n = factory.value.native;
    //Explicit synthetic initial captured-target condition; commands and all
    //subsequent motion, research, saves and replay use the ordinary host.
    n[94] = 18;
    put16(n as number[], 108, 200);
    w.rng = factory.value.rng;
    w.creatureNative[0] = n;
    w.ecology.mules.push({ index: 0, id: "source:0:0", native: n, pending: [] });
    put16(w.missionPrefix, 0x3550, 1);
    insertSpatial(w.spatial, w.terrain, "source:0:0", ((position[1] >> 8) & 127) * 128 + ((position[0] >> 8) & 127));
    synchronizeCampaignLinks(w);
    const recording = recordCampaign(w, "synthetic-moving-retarget");
    const move = { type: "move" as const, actorId: actor.id, point: [9000, 9000] as [number, number], queued: false };
    expect(queueCampaign(w, move).ok).toBe(true);
    recording.commands.push({ tick: w.tick, type: "command", command: move });
    stepCampaign(w, pack);
    expect([w.specialists.records[actor.id][85], w.specialists.records[actor.id][88]! & 2]).toEqual([8, 2]);
    const research = { type: "research-mule" as const, actorId: actor.id, muleIndex: 0 };
    expect(queueCampaign(w, research).ok).toBe(true);
    recording.commands.push({ tick: w.tick, type: "command", command: research });
    const loaded = loadCampaign(saveCampaign(w, { paused: true, speed: 2, accumulator: 0 }), w.contentHash).world;
    const initialResearch = u32(w.players[0].raw, 0x62a);
    for (let i = 0; i < 16; i++) {
      stepCampaign(w, pack);
      stepCampaign(loaded, pack);
      expect(checksum(loaded)).toBe(checksum(w));
      expect(w.notices.filter(notice => notice.severity === "error")).toEqual([]);
      if (i === 0) expect([w.specialists.records[actor.id][85], w.specialists.records[actor.id][87]! & 1, w.specialists.records[actor.id][130]]).toEqual([11, 0, 1]);
    }
    expect(u32(w.players[0].raw, 0x62a)).toBeGreaterThan(initialResearch);
    expect(checksum(replayCampaign(sealCampaignReplay(recording, w), pack, w.contentHash))).toBe(checksum(w));
  });
  it("performs immediate child20 capture with retained parent identity, source damage gate and shared scheduling", () => {
    const w = structuredClone(start),
      a = w.specialists.records[1],
      position: [number, number] = [
        i16(a as number[], 7),
        i16(a as number[], 9),
      ],
      result = initializeMuleNative(
        w.creatureNative[0],
        w.rng,
        { slot: 0, owner: 4, position, quality: 50 },
        { terrain: w.terrain, tables: pack.rules!.tables },
      );
    if (!result.ok) throw Error(result.reason);
    w.rng = result.value.rng;
    const n = result.value.native;
    n[94] = 8;
    put16(n as number[], 106, 100);
    w.creatureNative[0] = n;
    w.ecology.mules.push({
      index: 0,
      id: "source:0:0",
      native: n,
      pending: [],
    });
    put16(w.missionPrefix, 0x3550, 1);
    insertSpatial(
      w.spatial,
      w.terrain,
      "source:0:0",
      ((position[1] >> 8) & 127) * 128 + ((position[0] >> 8) & 127),
    );
    synchronizeCampaignLinks(w);
    const slot = w.powerEffects.slots.findIndex((e) => !e.occupied),
      prior = w.powerEffects.slots[slot].nativePrior!;
    //The actual reused slot carries this logical reference; factory20 retains
    //it. Parent on the request is deliberately different and must not win.
    put16(prior as number[], 71, 1);
    prior[73] = 3;
    const actor = a,
      raw = w.players[0].raw;
    expect(
      createStagedGeneticistEffectChild(
        w,
        {
          code: 20,
          owner: 0,
          position,
          height: u32(n as number[], 39) | 0,
          angles: [0, 0, 0],
          parameter: 32,
          delay: 0,
          parent: null,
          newborn: true,
        },
        pack,
        options(w),
      ),
    ).toBe(true);
    expect(w.specialists.records[1]).toBe(actor);
    expect(w.players[0].raw).toBe(raw);
    expect(w.ecology.mules[0].native).toBe(n);
    expect(n[94]).toBe(18);
    expect(i16(n as number[], 108)).toBe((raw[22 + 10 * 36 + 23] << 2) + 32);
    expect(i16(n as number[], 106)).toBe(99);
    expect(
      w.powerEffects.slots.some((e) => e.occupied && e.nativePrior![69] === 32),
    ).toBe(false);
    expect(w.powerEffects.slots[slot].nativePrior![21]! & 1).toBe(1);
    const loaded = loadCampaign(
      saveCampaign(w, { paused: true, speed: 4, accumulator: 0 }),
      w.contentHash,
    ).world;
    validateCampaignWorld(loaded, w.contentHash);
    stepEffectScheduler(w, pack, options(w));
    stepEffectScheduler(loaded, pack, options(loaded));
    expect(checksum(loaded)).toBe(checksum(w));
  });
  it("keeps damage through player synchronization and retires via original ANB9/corpse69", () => {
    const w = structuredClone(start),
      index = 1,
      binding = w.specialists.bindings[index]!,
      offset = 22 + binding.blueprintIndex * 36,
      before = (w.players[0].raw[offset + 26] << 24) >> 24;
    damageCampaignSpecialist(w, index, 4, null, pack, services);
    const voice = w.presentation.pending.find(
      (e) => e.event.type === "specialist-voice",
    );
    expect(voice?.event).toMatchObject({
      type: "specialist-voice",
      sequence: 0,
      request: {
        entity: "source:2:1",
        variant: 4,
        resource: { status: "profile-unavailable" },
      },
    });
    expect(w.presentation.voiceSequence).toBe(1);
    const hit = w.players[0].blueprints[binding.blueprintIndex].health;
    expect(hit).toBeLessThan(before);
    stepCampaign(w, pack);
    expect((w.players[0].raw[offset + 26] << 24) >> 24).toBe(hit);
    //Hit reactions have a source gate. Let it finish before the lethal hit.
    for (let i = 0; i < 12 && w.specialists.records[index][85] === 5; i++)
      stepCampaign(w, pack);
    damageCampaignSpecialist(w, index, 1000, null, pack, services);
    expect(w.specialists.records[index][85]).toBe(4);
    const saved = loadCampaign(
      saveCampaign(w, { paused: true, speed: 2, accumulator: 0 }),
      w.contentHash,
    ).world;
    for (let i = 0; i < 15 && w.specialists.records[index][6] !== 0; i++) {
      stepCampaign(w, pack);
      stepCampaign(saved, pack);
    }
    expect(checksum(saved)).toBe(checksum(w));
    expect(w.specialists.records[index][6]).toBe(0);
    expect(w.specialists.bindings[index]).toEqual(binding);
    expect(w.actors.find((a) => a.id === index)!.ready).toBe(false);
    expect(w.spatial.nodes[`source:2:${index}`]).toBeUndefined();
    expect(w.players[0].raw[3]).toBe(1);
    expect(u32(w.players[0].raw, 0x709)).toBe(1);
    expect(w.players[0].blueprints[binding.blueprintIndex].name).toBe("");
    const corpse = w.powerEffects.slots.find(
      (e) => e.occupied && e.nativePrior![69] === 69,
    )!;
    expect(
      specialistCorpseBinding(corpse.nativePrior!, pack.rules!.tables).assetKey,
    ).toBe("TEST");
    expect(corpse.nativePrior!.slice(77, 81)).toEqual([null, null, null, null]);
    validateCampaignWorld(w, w.contentHash);
  });
});

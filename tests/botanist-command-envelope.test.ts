import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { installEconomyEffect61 } from "./fixtures/economy-effect-profile";
import {
  createCampaign,
  queueCampaign,
  stepCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  queueBotanistWork,
  type BotanistWorkRequest,
} from "../src/sim/mechanics/botanist";
import {
  campaignBotanistContext,
  createStagedBotanistPlant,
  stepCampaignBotanist,
} from "../src/sim/campaign/botanist-adapter";
import type { CampaignSpecialistServices } from "../src/sim/campaign/specialist-adapter";
import type { EffectSchedulerOptions } from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { put16, put32, u16, u32 } from "../src/sim/campaign/bytes";
import { readGeneticistMotion } from "../src/sim/mechanics/geneticist";
import { worldCell } from "../src/sim/mechanics/terrain";
import { checksum } from "../src/sim/checksum";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";

/** Synthetic actual startup factories and ready specialists isolate human input.
 * Initial sample storage/knowledge is arranged; all later orders and planting
 * use the ordinary campaign host. No original mission acceptance is claimed. */
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
  installEconomyEffect61(pack.assets.EFF);
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
  const seed = createCampaign(pack, "synthetic-botanist-command-envelope");
  seed.players[0].progress = 1;
  seed.players[0].raw[0x6e7] = 1;
  const w = createCampaign(pack, seed.contentHash, 1, {
    players: seed.players,
    selectedPlayer: 0,
    world: seed.missionPrefix.slice(0x34ba, 0x3550),
    rngRing: seed.rng.ring,
  });
  w.phase = "active";
  w.frame = w.tick = 1;
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
  put32(w.players[0].raw, 0x67e, 1);
  const actor = w.actors.find(
    (a) => w.specialists.bindings[a.id]?.category === 1,
  )!;
  const index = actor.id;
  w.specialists.records[index][114] = 10;
  const options = (): EffectSchedulerOptions<CampaignWorld> => ({
    gravity: 512,
    obstacleAt: () => false,
    cleanupReferences: cleanupCampaignReferences,
    stageHost: (before, staged) =>
      Object.assign(staged, structuredClone(before)),
    commitHost: (target, staged) => Object.assign(target, staged),
  });
  const services: CampaignSpecialistServices = { effectOptions: options };
  return { pack, w, index, services };
}

describe("human Botanist81080 command envelope", () => {
  it("preserves retained motion and unrelated bytes when native130 is zero outside state8", () => {
    for (const task of [0, 1, 2] as const) {
      const { w, index, pack, services } = fixture(),
        n = w.specialists.records[index];
      n[85] = 1;
      n[87] = 2;
      n[88] = 3;
      n[130] = 0;
      put16(n as number[], 63, 700);
      put16(n as number[], 73, 0x3fff);
      n[84] = 19;
      n[22] = 255;
      const before = structuredClone(n),
        rng = structuredClone(w.rng);
      const q: BotanistWorkRequest =
        task === 1
          ? { callerOwner: 0, task, point: [8300, 8400], selector: 0 }
          : { callerOwner: 0, task, point: [8300, 8400] };
      const r = queueBotanistWork(
          w,
          index,
          q,
          campaignBotanistContext(w, pack, services),
        ),
        current = w.specialists.records[index];
      expect(r.events.filter((e) => e.type === "released")).toEqual([]);
      expect([current[87], current[88], current[130], current[126]]).toEqual([
        3,
        3,
        1,
        task,
      ]);
      for (const p of [
        21, 22, 45, 46, 47, 48, 49, 50, 63, 64, 73, 74, 84, 112, 113,
      ])
        expect(current[p]).toBe(before[p]);
      expect(w.rng).toEqual(rng);
    }
  });

  it("releases only a stamped prior task, then stamps setup and stops state8 without clearing velocity or pending move", () => {
    for (const stamp of [0, 1, 255]) {
      const { w, index, pack, services } = fixture(),
        n = w.specialists.records[index];
      n[85] = 8;
      n[87] = 2;
      n[88] = 2;
      n[130] = stamp;
      n[22] = 255;
      n[84] = 20;
      put16(n as number[], 63, 832);
      put16(n as number[], 73, 0x3fff);
      put16(n as number[], 45, 55);
      put16(n as number[], 47, -66);
      const rng = structuredClone(w.rng);
      const r = queueBotanistWork(
          w,
          index,
          { callerOwner: 0, task: 1, point: [8300, 8400], selector: 0 },
          campaignBotanistContext(w, pack, services),
        ),
        current = w.specialists.records[index];
      expect(r.events.filter((e) => e.type === "released")).toHaveLength(
        Number(stamp !== 0),
      );
      expect([
        current[85],
        current[87],
        current[88],
        current[130],
        current[126],
      ]).toEqual([8, 3, 0, 1, 1]);
      expect([u16(current as number[], 63), current[84], current[22]]).toEqual([
        0, 0, 63,
      ]);
      expect(u16(current as number[], 73)).toBe(
        stamp ? 0x3fff & 0xefe8 & 0xeffc : 0x3fff & 0xefe8,
      );
      expect(readGeneticistMotion(current)).toMatchObject({ vx: 55, vy: -66 });
      expect(w.rng).toEqual(rng);
    }
  });

  it("publishes the pending bit before active area cleanup and rolls back a late query failure", () => {
    const { w, index, pack, services } = fixture(),
      n = w.specialists.records[index];
    n[85] = 10;
    n[87] = 2;
    n[88] = 1;
    n[130] = 1;
    n[126] = 0;
    n[112] = 129;
    const before = checksum(w),
      raw = w.players[0].raw,
      binding = w.specialists.bindings[index],
      rng = w.rng;
    const context = campaignBotanistContext(w, pack, services);
    let calls = 0;
    context.cellOrder = (s) => {
      calls++;
      expect([
        s.specialists.records[index][87],
        s.specialists.records[index][126],
        s.specialists.records[index][130],
      ]).toEqual([3, 0, 1]);
      expect(s.rng.draws).toBe(rng.draws + 2);
      throw Error("late actual area query failure");
    };
    expect(() =>
      queueBotanistWork(
        w,
        index,
        { callerOwner: 0, task: 1, point: [8300, 8400], selector: 0 },
        context,
      ),
    ).toThrow(/late actual area/);
    expect(calls).toBe(1);
    expect(checksum(w)).toBe(before);
    expect(w.specialists.records[index]).toBe(n);
    expect(w.players[0].raw).toBe(raw);
    expect(w.specialists.bindings[index]).toBe(binding);
    expect(w.rng).toBe(rng);
  });

  it("preserves or releases the actual retained plant reservation according to the prior stamp", () => {
    for (const stamp of [0, 1]) {
      const { w, index, pack, services } = fixture();
      const slot = createStagedBotanistPlant(
        w,
        { actor: index, owner: 0, selector: 0, position: [8400, 8400] },
        pack,
        services,
      )!;
      const n = w.specialists.records[index],
        plant = w.ecology.plants[slot];
      n[85] = 10;
      n[88] = 1;
      n[130] = stamp;
      n[126] = 2;
      n[129] = 2;
      put16(n as number[], 127, slot);
      plant.native[46] = plant.plantFlags = 4;
      queueBotanistWork(
        w,
        index,
        { callerOwner: 0, task: 0, point: [8300, 8400] },
        campaignBotanistContext(w, pack, services),
      );
      expect(w.ecology.plants[slot].native[46]).toBe(stamp ? 0 : 4);
      expect(w.ecology.plants[slot].plantFlags).toBe(stamp ? 0 : 4);
      expect(w.specialists.records[index][129]).toBe(stamp ? 0 : 2);
    }
  });

  it("moves through ordinary input, retargets to real planting after JSON reload, and reproduces a sealed command replay", () => {
    const { w, pack, index } = fixture();
    const recording = recordCampaign(w, "synthetic-botanist-moving-work"),
      at = w.actors.find((a) => a.id === index)!.motion;
    const move = {
      type: "move" as const,
      actorId: index,
      point: [at.x + 1000, at.y + 1000] as [number, number],
      queued: false,
    };
    expect(queueCampaign(w, move).ok).toBe(true);
    recording.commands.push({ tick: w.tick, type: "command", command: move });
    stepCampaign(w, pack);
    expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
    expect([
      w.specialists.records[index][85],
      w.specialists.records[index][88]! & 2,
    ]).toEqual([8, 2]);
    const beforePlants = w.ecology.plantCount,
      beforeCredit = u32(w.players[0].raw, 13);
    const command = {
      type: "botanist-work" as const,
      actorId: index,
      task: 1 as const,
      selector: 0,
      point: [at.x, at.y] as [number, number],
    };
    expect(queueCampaign(w, command).ok).toBe(true);
    recording.commands.push({ tick: w.tick, type: "command", command });
    const loaded = loadCampaign(
      saveCampaign(w, { paused: true, speed: 2, accumulator: 0 }),
      w.contentHash,
    ).world;
    let entered = false;
    for (let i = 0; i < 128; i++) {
      stepCampaign(w, pack);
      stepCampaign(loaded, pack);
      expect(checksum(loaded)).toBe(checksum(w));
      expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
      const n = w.specialists.records[index];
      if (i === 0)
        expect([n[85], n[87]! & 1, n[88]! & 2, n[130]]).toEqual([10, 0, 0, 1]);
      entered ||= n[85] === 10 && !!(n[88]! & 1);
    }
    expect(entered).toBe(true);
    expect(w.ecology.plantCount).toBeGreaterThan(beforePlants);
    expect(u32(w.players[0].raw, 13)).toBeGreaterThan(beforeCredit);
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(recording, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  });

  it("keeps a callback's queued command afterimage intact on a late actor animation failure", () => {
    const { w, pack, index, services } = fixture(),
      context = campaignBotanistContext(w, pack, services);
    queueBotanistWork(
      w,
      index,
      { callerOwner: 0, task: 1, point: [8300, 8400], selector: 0 },
      context,
    );
    const before = checksum(w),
      n = w.specialists.records[index],
      raw = w.players[0].raw,
      rng = w.rng;
    expect(() =>
      stepCampaignBotanist(
        w,
        index,
        {
          ...pack,
          assets: {
            ...pack.assets,
            [w.specialists.bindings[index]!.assetKey]: {
              ...pack.assets[w.specialists.bindings[index]!.assetKey],
              animations: [],
            },
          },
        },
        services,
      ),
    ).toThrow();
    expect(checksum(w)).toBe(before);
    expect(w.specialists.records[index]).toBe(n);
    expect(w.players[0].raw).toBe(raw);
    expect(w.rng).toBe(rng);
  });
});

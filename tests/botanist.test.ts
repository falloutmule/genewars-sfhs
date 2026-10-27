import { describe, it, expect, vi } from "vitest";
import {
  botanistRulesFromEcology,
  queueBotanistWork,
  queueBotanistMove,
  stepBotanistRole,
  stepBotanistCallback,
  cancelBotanistWork,
  cancelStagedBotanistWork,
  tryBotanistIdleAcquisition,
  planBotanistPlantCreation,
  planBotanistEconomy,
  emitBotanistEconomyBurst,
  type BotanistContext,
  type BotanistCallbackContext,
} from "../src/sim/mechanics/botanist";
import type { GeneticistWorld } from "../src/sim/mechanics/geneticist";
import type { EcologyPlant } from "../src/sim/mechanics/ecology";
import { worldCell } from "../src/sim/mechanics/terrain";
import { nextRandom } from "../src/sim/mechanics/random";
import {
  makeBotanistWorkEffect,
  stepBotanistWorkEffectRecord,
  makeBotanistEconomyEffect,
  stepBotanistEconomyEffectRecord,
} from "../src/sim/mechanics/botanist-effect";
type Native = (number | null)[];
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const put32 = (n: Native, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
const word = (n: Native, p: number) => ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const dword = (n: Native, p: number) =>
  n[p]! | (n[p + 1]! << 8) | (n[p + 2]! << 16) | (n[p + 3]! << 24);
function plant(index: number, growth = 30, x = 1100, y = 1000): EcologyPlant {
  const native: Native = Array(49).fill(0);
  native.fill(null, 31, 39);
  native[6] = 2;
  native[24] = 4;
  native[28] = 1;
  put(native, 7, x);
  put(native, 9, y);
  put(native, 15, index);
  put(native, 44, growth);
  put32(native, 17, 2048);
  return {
    id: `source:1:${index}`,
    index,
    active: true,
    owner: 4,
    position: [x, y],
    selector: 0,
    growth,
    flags: 0,
    plantFlags: 0,
    updateCounter: 0,
    retirement: 0,
    animation: 0,
    frame: 0,
    shade: 0,
    height: 2048,
    native,
  };
}
function fixture(skill = 50) {
  const n: Native = Array(200).fill(0);
  n.fill(null, 31, 39);
  n.fill(null, 176, 180);
  n.fill(null, 192, 200);
  n[6] = 3;
  n[85] = 10;
  n[88] = 1;
  n[112] = 1;
  n[126] = 0;
  n[28] = 1;
  put(n, 7, 1000);
  put(n, 9, 1000);
  put(n, 136, 1000);
  put(n, 138, 1000);
  put32(n, 142, 1536 * 1536);
  const w: GeneticistWorld = {
    specialists: {
      schemaVersion: 1,
      records: Array.from({ length: 20 }, (_, i) =>
        i === 0 ? n : Array(200).fill(0),
      ),
      bindings: Array(20).fill(null),
    },
    players: Array.from({ length: 4 }, () => ({ raw: Array(1805).fill(0) })),
    ecology: {
      schemaVersion: 1,
      sourceSha256: "synthetic",
      ticks: 0,
      plantCursor: 0,
      plantCount: 0,
      ownerPlantCounts: [0, 0, 0, 0, 0],
      plants: [],
      mules: [],
      otherEntities: [],
      plantOrder: {},
      pending: [],
      unsupported: [],
    },
    terrain: { bytes: Array(229376).fill(0), revision: 0 },
    rng: { seed: 131, ring: 31, draws: 0 },
    frame: 0,
    missionPrefix: Array(0x355e).fill(0),
  };
  w.specialists.bindings[0] = {
    owner: 0,
    blueprintIndex: 0,
    style: 0,
    category: 1,
    resourceKey: 1,
    assetKey: "SYNTHETIC",
    sourceName: "data/spec/synthetic.anb",
    classSpeed: 700,
    blueprintOffset: 192,
    animationOffset: 31,
    resourceOffset: 196,
    internal: { offset: 176, targetOffset: 196 },
    vtable: "kind3",
  };
  const raw = w.players[0].raw;
  raw[0x16 + 22] = 1;
  raw[0x16 + 23] = skill;
  raw[0x16 + 24] = 50;
  for (let i = 0; i < 16384; i++) {
    put(w.terrain.bytes, i * 14, 16384);
    put(w.terrain.bytes, i * 14 + 2, 1024);
    w.terrain.bytes[i * 14 + 5] = 2;
    w.terrain.bytes[i * 14 + 12] = 64;
  }
  const c: BotanistContext<GeneticistWorld> = {
    rules: {
      schemaVersion: 1,
      plants: [
        {
          selector: 0,
          growthDeltas: Array(8).fill(2),
          crowdingLimit: 2,
          seedCost: 6,
        },
      ],
    },
    tables: {
      atan: Array.from({ length: 257 }, (_, i) =>
        Math.round((Math.atan(i / 256) * 1024) / Math.PI),
      ),
      sine: Array.from({ length: 2048 }, (_, i) =>
        Math.round(Math.sin((i * Math.PI) / 1024) * 65536),
      ),
      cosine: Array.from({ length: 2048 }, (_, i) =>
        Math.round(Math.cos((i * Math.PI) / 1024) * 65536),
      ),
    },
    cellOrder: (s, cell) =>
      s.ecology.plants
        .filter((p) => p.active && worldCell(...p.position) === cell)
        .map((p) => p.id),
  };
  return {
    w,
    c,
    n: () => w.specialists.records[0],
    raw: () => w.players[0].raw,
  };
}
describe("original category1 Botanist", () => {
  it("plans80780 credits against actual doubled prefix cap and806E0 debits only with a real source49D gate", () => {
    const f = fixture(),
      raw = f.raw(),
      prefix = f.w.missionPrefix;
    put32(raw, 13, 40);
    put32(raw, 17, 98);
    put(prefix, 0x1c7c, 50);
    put(prefix, 0x1c78, 7);
    const credit = planBotanistEconomy(raw, prefix, {
      operation: "credit",
      amount: 8,
      entity: "source:3:0",
    });
    expect([
      dword(credit.raw, 13),
      dword(credit.raw, 17),
      dword(raw, 17),
    ]).toEqual([48, 100, 98]);
    expect(credit.audio).toMatchObject({
      cue: 57,
      parameter: 1,
      volume: 30,
      ratePercent: 200,
    });
    expect(credit.burst).toMatchObject({
      code: 60,
      count: 1,
      speedBase: 10,
      speedRange: 10,
    });
    const ignored = planBotanistEconomy(raw, prefix, {
      operation: "debit",
      amount: 50,
      entity: "source:3:0",
    });
    expect(ignored).toMatchObject({ applied: false, audio: null, burst: null });
    expect(ignored.raw).toEqual(raw);
    put32(raw, 0x49d, 1);
    put32(raw, 17, 20);
    const debit = planBotanistEconomy(raw, prefix, {
      operation: "debit",
      amount: 50,
      entity: "source:3:0",
    });
    expect([dword(debit.raw, 17), dword(debit.raw, 13)]).toEqual([-7, 40]);
    expect(debit.audio).toMatchObject({ cue: 38, volume: 60 });
    expect(debit.burst).toMatchObject({ code: 61, count: 6 });
  });
  it("interleaves each6D500 three-draw request with actual factory draws even when later capacity fails", () => {
    const f = fixture(),
      rng = f.w.rng;
    put32(f.n(), 17, 2048);
    put32(f.n(), 39, 2200);
    const seen: number[][] = [];
    const created = emitBotanistEconomyBurst(
      f.n(),
      rng,
      {
        entity: "source:3:0",
        code: 61,
        variation: 0,
        speedBase: 10,
        speedRange: 10,
        count: 2,
        inheritedOwner: true,
      },
      (q) => {
        seen.push([...q.angles, rng.draws]);
        if (seen.length === 1) {
          nextRandom(rng);
          return true;
        }
        return false;
      },
    );
    expect(created).toBe(1);
    expect(seen.map((v) => v[3])).toEqual([3, 7]);
    expect(rng.draws).toBe(7);
    expect(
      seen.every(
        (v) => v[0] % 16 === 0 && v[1] % 8 === 0 && v[2] >= 640 && v[2] <= 1216,
      ),
    ).toBe(true);
  });
  it("creates code7 from actual retained fractions and advances to real mode0 animation retirement", () => {
    const f = fixture(),
      prior: Native = Array(81).fill(0);
    prior.fill(null, 31, 39);
    prior[67] = 201;
    prior[68] = 93;
    prior[73] = 7;
    prior[76] = 49;
    const profile = { holds: Array(6).fill(0), flags: 0, first: 0, last: 5 },
      q = {
        slot: 2,
        code: 7 as const,
        position: [1000, 1000] as [number, number],
        height: 2048,
        owner: 0 as const,
        angles: [0, 0, 0] as [0, 0, 0],
        parameter: 0 as const,
        delay: 0 as const,
        newborn: false as const,
      };
    let n = makeBotanistWorkEffect(prior, q, f.w.terrain, profile);
    expect([n[67], n[68], n[73], n[76], n[69]]).toEqual([201, 93, 7, 49, 7]);
    let retired = false;
    for (let frame = 0; frame < 8 && !retired; frame++) {
      const r = stepBotanistWorkEffectRecord(n, f.w.terrain, {
        frame,
        gravity: 1024,
        water: 1000,
        tables: f.c.tables,
        bounce: Array(8).fill(128),
        profile,
      });
      n = r.native;
      retired = r.retirementRequired;
    }
    expect(retired).toBe(true);
    expect([n[6], n[69]]).toEqual([5, 7]);
  });
  it.each([60, 61] as const)(
    "uses49129's actual delay draw and distinct imported ANB profile for effect%i",
    (code) => {
      const f = fixture(),
        prior: Native = Array(81).fill(0);
      prior.fill(null, 31, 39);
      prior[67] = 77;
      prior[68] = 19;
      prior[73] = 3;
      const count = code === 60 ? 6 : 9,
        profile = {
          holds:
            code === 60 ? Array(count).fill(0) : [9, 9, 0, 0, 0, 0, 0, 0, 0],
          flags: 0,
          first: 0,
          last: count - 1,
        };
      const n = makeBotanistEconomyEffect(
        prior,
        {
          slot: 0,
          code,
          position: [1000, 1000],
          height: 2300,
          owner: 0,
          angles: [512, 64, 800],
          parameter: 0,
          delay: 0,
          newborn: false,
        },
        f.w.terrain,
        1024,
        f.w.rng,
        f.c.tables,
        profile,
      );
      expect([word(n, 55), n[67], n[68], n[73], f.w.rng.draws]).toEqual([
        -16, 77, 19, 3, 1,
      ]);
      expect(n[29]).toBeGreaterThanOrEqual(1);
      expect(n[29]).toBeLessThanOrEqual(3);
      const r = stepBotanistEconomyEffectRecord(
        n,
        f.w.terrain,
        {
          frame: 1,
          gravity: 1024,
          water: 1000,
          tables: f.c.tables,
          bounce: Array(8).fill(128),
          profile,
        },
        code,
      );
      expect(r.queries.every((q) => q.type !== "obstacle")).toBe(true);
      expect(f.w.rng.draws).toBe(1);
      if (code === 61) {
        const held = n.slice();
        held[26] = 9;
        held[27] = 1;
        held[29] = 1;
        held[30] = 0;
        const next = stepBotanistEconomyEffectRecord(
          held,
          f.w.terrain,
          {
            frame: 2,
            gravity: 1024,
            water: 1000,
            tables: f.c.tables,
            bounce: Array(8).fill(128),
            profile,
          },
          code,
        );
        expect([next.native[26], next.native[27]]).toEqual([8, 1]);
        const wrong = { ...profile, holds: Array(9).fill(0) };
        expect(() =>
          stepBotanistEconomyEffectRecord(
            held,
            f.w.terrain,
            {
              frame: 2,
              gravity: 1024,
              water: 1000,
              tables: f.c.tables,
              bounce: Array(8).fill(128),
              profile: wrong,
            },
            code,
          ),
        ).toThrow(/EFF60\/61/);
      }
    },
  );
  it("projects actual row1E rather than inventing a seed cost from nutrition/retirement", () => {
    const p = {
      selector: 0,
      growthDeltas: Array(8).fill(1),
      crowdingLimit: 4,
      opaqueBytes: Array(18).fill(99),
    };
    p.opaqueBytes[16] = 7;
    expect(botanistRulesFromEcology({ plants: [p] }).plants[0].seedCost).toBe(
      7,
    );
    expect(() =>
      botanistRulesFromEcology({ plants: [{ ...p, opaqueBytes: [] }] }),
    ).toThrow(/plant row/);
  });
  it("queues source51960 geometry and activates507D0 after motion before role/animation", () => {
    const f = fixture();
    f.n()[85] = 1;
    f.n()[88] = 0;
    queueBotanistWork(
      f.w,
      0,
      { callerOwner: 0, task: 2, point: [1200, 1300] },
      f.c,
    );
    expect([
      f.n()[85],
      f.n()[88],
      f.n()[87]! & 1,
      word(f.n(), 136),
      word(f.n(), 138),
      dword(f.n(), 142),
    ]).toEqual([1, 0, 1, 1200, 1300, 1152 * 1152]);
    const c: BotanistCallbackContext<GeneticistWorld> = {
      ...f.c,
      globalFlags: 0,
      runtimeMode: 0,
      override180d80: 0,
      runtimeCount11c2bc: 1,
      motion: (s) => expect(s.specialists.records[0][85]).toBe(1),
      animation: () => ({ holds: [0, 0], flags: 0, first: 0, last: 1 }),
    };
    const r = stepBotanistCallback(f.w, 0, c);
    expect(r.reason).toBe("no-harvest-target");
    expect([f.n()[85], f.n()[126], f.w.rng.draws]).toEqual([10, 255, 3]);
    expect(r.events[0]).toMatchObject({
      type: "feedback",
      mode: 2,
      reason: "botanist-harvest-started",
    });
  });
  it("researches every linked plant in a sampled cell, damages via6C900 and earns at most one retained resource per pulse", () => {
    const f = fixture();
    f.w.ecology.plants = [plant(0), plant(1, 0)];
    f.n()[114] = 10;
    const seen: number[] = [];
    f.c.damagePlant = (s, i, amount, a) => {
      expect([amount, a]).toEqual([3, 0]);
      seen.push(i);
      const p = s.ecology.plants[i];
      if (p.growth > 0) {
        p.growth -= amount;
        put(p.native, 44, p.growth);
      }
    };
    stepBotanistRole(f.w, 0, f.c);
    expect(seen).toEqual([0, 1]);
    expect([
      f.n()[114],
      f.n()[89],
      f.w.ecology.plants[0].growth,
      f.w.ecology.plants[0].plantFlags,
      f.w.ecology.plants[1].plantFlags,
    ]).toEqual([11, 13, 27, 2, 0]);
    expect(dword(f.raw(), 0x67e)).toBe(1);
    expect(f.w.rng.draws).toBe(2);
  });
  it("honors source work cadence and rolls back all damage/RNG/flags when a late plant service is absent", () => {
    const f = fixture();
    f.w.frame = 1;
    f.w.ecology.plants = [plant(0)];
    stepBotanistRole(f.w, 0, f.c);
    expect(f.w.rng.draws).toBe(0);
    expect(f.n()[89]).toBe(13);
    f.w.frame = 0;
    const before = structuredClone(f.w);
    expect(() => stepBotanistRole(f.w, 0, f.c)).toThrow(/6C900/);
    expect(f.w).toEqual(before);
  });
  it("cancels area flags with its own two query draws while preserving held records in staged cancellation", () => {
    const f = fixture();
    f.w.ecology.plants = [plant(0)];
    f.w.ecology.plants[0].native[46] = 6;
    f.w.ecology.plants[0].plantFlags = 6;
    f.n()[112] = 129;
    f.n()[87] = 3;
    f.n()[114] = 11;
    const n = f.n(),
      raw = f.raw(),
      binding = f.w.specialists.bindings[0];
    cancelStagedBotanistWork(f.w, 0, 0, f.c);
    expect(f.n()).toBe(n);
    expect(f.raw()).toBe(raw);
    expect(f.w.specialists.bindings[0]).toBe(binding);
    expect([
      f.n()[87],
      f.n()[126],
      f.n()[114],
      f.w.rng.draws,
      f.w.ecology.plants[0].native[46],
      dword(f.n(), 142),
    ]).toEqual([3, 255, 11, 2, 4, 0]);
  });
  it("rejects incomplete shared chains atomically even when the omitted plant is not the target", () => {
    const f = fixture();
    f.w.ecology.plants = [plant(0)];
    f.n()[126] = 2;
    const before = structuredClone(f.w);
    expect(() =>
      stepBotanistRole(f.w, 0, { ...f.c, cellOrder: () => [] }),
    ).toThrow(/shared-cell order/);
    expect(f.w).toEqual(before);
  });
  it("spends planted resource and credits8 even when6C4B0 returns full, then consumes weighted search draws", () => {
    const f = fixture();
    f.n()[126] = 1;
    f.n()[114] = 10;
    f.n()[112] = 129;
    put32(f.n(), 104, 1);
    const calls: string[] = [];
    f.c.createPlant = (_s, q) => {
      expect(q).toEqual({
        actor: 0,
        owner: 0,
        selector: 0,
        position: [1000, 1000],
      });
      calls.push("factory");
      return null;
    };
    f.c.economy = (s, q) => {
      expect(s.specialists.records[0][114]).toBe(4);
      expect(q).toMatchObject({ operation: "credit", amount: 8 });
      calls.push("credit");
    };
    f.c.escapeRay = (_s, _i, yaw, distance) => {
      expect(yaw).toBeGreaterThanOrEqual(0);
      expect(distance).toBeGreaterThanOrEqual(128);
      calls.push("ray");
      return false;
    };
    stepBotanistRole(f.w, 0, f.c);
    expect(calls).toEqual(["factory", "credit", "ray"]);
    expect(f.n()[114]).toBe(4);
    expect(f.w.rng.draws).toBe(6);
  });
  it("rejects insufficient planting stock without creating a plant or guessing a replacement resource", () => {
    const f = fixture();
    f.n()[126] = 1;
    f.n()[114] = 5;
    put32(f.n(), 104, 99);
    const r = stepBotanistRole(f.w, 0, f.c);
    expect([f.n()[126], f.n()[114], dword(f.n(), 104), f.w.rng.draws]).toEqual([
      255, 5, 0, 0,
    ]);
    expect(r.status).toBe("released");
  });
  it("arrives at an admitted planting site then starts its exact105-skill work timer", () => {
    const f = fixture(60);
    f.n()[126] = 1;
    f.n()[114] = 8;
    f.n()[112] = 17;
    put(f.n(), 73, 32);
    stepBotanistRole(f.w, 0, f.c);
    expect([
      f.n()[89],
      f.n()[112]! & 0x90,
      dword(f.n(), 104),
      f.w.rng.draws,
    ]).toEqual([14, 128, 45, 0]);
  });
  it("uses only the first eligible plant of each cell when choosing harvest target and retains work duration", () => {
    const f = fixture();
    f.n()[126] = 2;
    f.w.ecology.plants = [plant(0, 30, 1150, 1000), plant(1, 30, 1100, 1000)];
    stepBotanistRole(f.w, 0, f.c);
    expect([
      word(f.n(), 127),
      f.n()[129],
      word(f.n(), 96),
      word(f.n(), 98),
      f.w.rng.draws,
    ]).toEqual([0, 2, 1118, 1000, 2]);
    put(f.n(), 73, 32);
    stepBotanistRole(f.w, 0, f.c);
    expect([f.n()[89], dword(f.n(), 104), word(f.n(), 134)]).toEqual([
      15, 91, 91,
    ]);
  });
  it("orders code7 before real6C6B0/economy/audio state and releases the completed target", () => {
    const f = fixture();
    f.n()[126] = 2;
    f.n()[129] = 2;
    f.n()[112] = 129;
    put(f.n(), 127, 0);
    put(f.n(), 134, 1);
    put32(f.n(), 104, 5);
    f.w.ecology.plants = [plant(0)];
    const calls: string[] = [];
    f.c.effect = (_s, q) => {
      expect(q).toMatchObject({
        code: 7,
        owner: 0,
        height: 2048,
        position: [1100, 1000],
      });
      calls.push("7");
    };
    f.c.ignitePlant = (s, i) => {
      calls.push("8");
      s.ecology.plants[i].growth = 0;
      put(s.ecology.plants[i].native, 44, 0);
      s.ecology.plants[i].native[46] = 136;
    };
    f.c.economy = (_s, q) => {
      expect(q).toMatchObject({ amount: 50, operation: "debit" });
      calls.push("debit");
    };
    f.c.audioPlaying = () => {
      calls.push("audio");
      return true;
    };
    const r = stepBotanistRole(f.w, 0, f.c);
    expect(calls).toEqual(["7", "8", "debit", "audio"]);
    expect([f.n()[129], f.n()[112]! & 128, word(f.n(), 134)]).toEqual([
      0, 0, 0,
    ]);
    expect(
      r.events.filter((e) => e.type === "audio").map((e) => e.mode),
    ).toEqual([2, "stop"]);
  });
  it("preserves a complete outer rollback when later shared effect/debit services fail", () => {
    const f = fixture();
    f.n()[126] = 2;
    f.n()[129] = 2;
    f.n()[112] = 129;
    put(f.n(), 127, 0);
    put(f.n(), 134, 1);
    put32(f.n(), 104, 5);
    f.w.ecology.plants = [plant(0)];
    const before = structuredClone(f.w);
    f.c.effect = (s) => {
      s.rng.draws++;
    };
    f.c.ignitePlant = (s) => {
      s.ecology.plants[0].growth = 0;
    };
    expect(() => stepBotanistRole(f.w, 0, f.c)).toThrow(/806E0/);
    expect(f.w).toEqual(before);
  });
  it("routes ordinary80FC0 moves through its resolver and cancellation gate without overwriting velocity", () => {
    const f = fixture();
    f.n()[130] = 1;
    put(f.n(), 45, 77);
    f.c.resolveMovePoint = () => [1800, 1900];
    queueBotanistMove(f.w, 0, { callerOwner: 0, point: [2000, 2100] }, f.c);
    expect([
      f.n()[126],
      f.n()[87],
      word(f.n(), 11),
      word(f.n(), 13),
      word(f.n(), 45),
    ]).toEqual([255, 2, 1800, 1900, 77]);
    expect(cancelBotanistWork(f.w, 0, 0, f.c).status).toBe("released");
  });
  it("does not invent a plant acquisition or reward on an empty idle pulse", () => {
    const f = fixture(100);
    f.n()[85] = 1;
    f.n()[88] = 0;
    const before = f.raw().slice();
    const r = tryBotanistIdleAcquisition(f.w, 0, f.c);
    expect(r.status).toBe("ignored");
    expect(f.raw()).toEqual(before);
    expect(f.w.rng.draws).toBe(3);
  });
  it("runs common57A10 with one atomic world copy and no category2 cooldown mutation", () => {
    const f = fixture();
    f.n()[85] = 1;
    f.n()[88] = 0;
    f.w.frame = 1;
    put32(f.n(), 100, 9);
    const c: BotanistCallbackContext<GeneticistWorld> = {
      ...f.c,
      globalFlags: 0,
      motion: () => {},
      runtimeMode: 0,
      override180d80: 0,
      runtimeCount11c2bc: 1,
      animation: () => ({ holds: [0, 0], flags: 0, first: 0, last: 1 }),
    };
    const spy = vi.spyOn(globalThis, "structuredClone");
    try {
      stepBotanistCallback(f.w, 0, c);
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }
    expect(dword(f.n(), 100)).toBe(9);
  });
  it("constructs exact plant common fields from actual inactive priors and preserves30/48/opaque bytes", () => {
    const f = fixture(),
      prior: Native = Array(49).fill(173);
    prior[6] = 0;
    prior.fill(null, 31, 39);
    const r = planBotanistPlantCreation(
      prior,
      3,
      0,
      1,
      [1000, 1000],
      f.w.terrain,
    );
    expect(r.position).toEqual([922, 922]);
    expect([
      r.native[6],
      word(r.native, 15),
      r.native[21],
      r.native[22],
      r.native[30],
      r.native[48],
      word(r.native, 44),
      r.native[46],
      r.native[47],
    ]).toEqual([2, 3, 4, 0, 173, 173, 4, 0, 0]);
    expect(r.native.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(prior[21]).toBe(173);
  });
});

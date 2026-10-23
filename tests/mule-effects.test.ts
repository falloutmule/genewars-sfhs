import { describe, expect, it } from "vitest";
import {
  consumeMuleEffects,
  createMuleConsumptionEffect,
  type MuleEffectWorld,
} from "../src/sim/campaign/mule-effects";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  copySpatialLinks,
  insertSpatial,
  validateSpatial,
} from "../src/sim/campaign/spatial";
import { establishedEffectPriorities } from "../src/sim/mechanics/reward-effect";
import type { MuleEvent } from "../src/sim/mechanics/mule";
import type { Pack } from "../src/content/types";
import type { GeneRng } from "../src/sim/mechanics/random";
type Native = (number | null)[];
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const word = (n: Native, p: number) => ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
function fixture() {
  const tables = {
    atan: Array.from({ length: 257 }, (_, i) =>
      Math.round((Math.atan(i / 256) * 1024) / Math.PI),
    ),
    sine: Array.from({ length: 2048 }, (_, i) =>
      Math.round(Math.sin((i * Math.PI) / 1024) * 65536),
    ),
    cosine: Array.from({ length: 2048 }, (_, i) =>
      Math.round(Math.cos((i * Math.PI) / 1024) * 65536),
    ),
  };
  const pack = {
    rules: { tables },
    assets: {
      EFF: {
        kind: "animation",
        image: "synthetic",
        frames: Array.from({ length: 10 }, () => ({
          components: [],
          rawFlags: [0, 0],
        })),
        animations: Array.from({ length: 33 }, () => ({
          first: 0,
          last: 9,
          rawTrailingWord: 10,
        })),
      },
    },
  } as unknown as Pack;
  const native = (slot: number) => {
    const n: Native = Array(81).fill(0);
    n.fill(null, 31, 39);
    n[30] = 37;
    n[67] = (slot * 3 + 17) & 255;
    n[68] = (slot * 7 + 23) & 255;
    return n;
  };
  const w: MuleEffectWorld & { rng: GeneRng } = {
    powerEffects: {
      slots: Array.from({ length: 200 }, (_, i) => {
        const n = native(i);
        return {
          nativePrior: n,
          occupied: false,
          packet: null,
          fractionX: n[67],
          fractionY: n[68],
        };
      }),
    },
    spatial: { heads: Array(16384).fill(null), nodes: {} },
    terrain: { bytes: Array(229376).fill(0), revision: 0 },
    source: { entities: [] },
    ecology: { mules: [] },
    landings: [],
    waterEffects: [],
    missionPrefix: Array(0x355e).fill(0),
    rng: { seed: 5428, draws: 7, ring: 31 },
  };
  const activate = (slot: number, code = 32, flags = 0) => {
    const p = w.powerEffects.slots[slot],
      n = p.nativePrior!;
    n[6] = 5;
    n[21] = flags;
    n[69] = code;
    put(n, 15, slot);
    p.occupied = true;
    insertSpatial(w.spatial, w.terrain, `source:4:${slot}`, 0);
  };
  const sync = () => {
    for (const [i, p] of w.powerEffects.slots.entries())
      if (p.occupied)
        copySpatialLinks(w.spatial, `source:4:${i}`, p.nativePrior!);
    put(
      w.missionPrefix!,
      0x3554,
      w.powerEffects.slots.filter((p) => p.occupied).length,
    );
  };
  const event: MuleEvent = {
    kind: "mule-effect",
    id: "source:0:3",
    code: 32,
    position: [256, 512],
    height: 4096,
    angles: [2016, 224, 9088],
  };
  return { w, pack, event, activate, sync };
}
describe("source Mule corpse-consumption effect adapter", () => {
  it("allocates the lowest actual free shared slot, retaining fractions and counter and consuming zero RNG", () => {
    const f = fixture();
    f.activate(0);
    f.sync();
    const rng = { ...f.w.rng };
    const out = consumeMuleEffects(f.w, [f.event], f.pack, {
      cleanupReferences: cleanupCampaignReferences,
    });
    expect(out.created.map((e) => e.slot)).toEqual([1]);
    expect(out.countDelta).toBe(1);
    expect(f.w.rng).toEqual(rng);
    const n = f.w.powerEffects.slots[1].nativePrior!;
    expect([
      n[6],
      n[24],
      n[69],
      word(n, 21),
      word(n, 74),
      n[73],
      n[29],
      n[30],
      n[67],
      n[68],
    ]).toEqual([5, 0, 32, 0, -1, 0, 0, 37, 20, 30]);
    expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(word(n, 39)).toBe(4096);
    expect(word(f.w.missionPrefix!, 0x3554)).toBe(2);
    expect(f.w.spatial.heads[257]).toBe("source:4:1");
    validateSpatial(f.w.spatial);
  });
  it("admits every complete source high-byte yaw draw without masking the raw native yaw word", () => {
    const f = fixture(),
      prior = f.w.powerEffects.slots[0].nativePrior!;
    for (let draw = 0; draw < 256; draw++) {
      const yaw = draw * 8,
        n = createMuleConsumptionEffect(
          prior,
          0,
          { code: 32, position: [0, 0], height: 0, angles: [yaw, 298, 12224] },
          f.w.terrain,
          f.pack,
        );
      expect(word(n, 57)).toBe(yaw);
      expect(n[6]).toBe(5);
    }
    expect(() =>
      createMuleConsumptionEffect(
        prior,
        0,
        { code: 32, position: [0, 0], height: 0, angles: [2048, 0, 0] },
        f.w.terrain,
        f.pack,
      ),
    ).toThrow(/request/);
  });
  it("returns the source null factory for a full pool with no strictly worse priority", () => {
    const f = fixture();
    for (let i = 0; i < 200; i++) f.activate(i);
    f.sync();
    const saved = structuredClone(f.w);
    const out = consumeMuleEffects(f.w, [f.event], f.pack, {
      cleanupReferences: cleanupCampaignReferences,
    });
    expect(out.created).toEqual([]);
    expect(out.failedFactories).toEqual([32]);
    expect(out.countDelta).toBe(0);
    expect(f.w).toEqual(saved);
  });
  it("replaces the first maximal worse-priority slot, skips newborns, cleans old references before reuse and keeps count", () => {
    const f = fixture();
    for (let i = 0; i < 200; i++) f.activate(i);
    f.w.powerEffects.slots[0].nativePrior![69] = 99;
    f.w.powerEffects.slots[1].nativePrior![69] = 99;
    f.w.powerEffects.slots[2].nativePrior![69] = 98;
    f.w.powerEffects.slots[2].nativePrior![21] = 1;
    f.sync();
    const target: Native = Array(124).fill(0);
    target[6] = 1;
    target[0x57] = 5;
    put(target, 0x55, 0);
    f.w.ecology.mules.push({ native: target });
    const rng = { ...f.w.rng };
    let observed = false;
    const out = consumeMuleEffects(f.w, [f.event], f.pack, {
      priority: (code) =>
        code === 99 ? 60 : code === 98 ? 70 : establishedEffectPriorities[code],
      cleanupReferences: (s, id) => {
        observed =
          !s.spatial.nodes[id] && s.powerEffects.slots[0].nativePrior![6] === 5;
        return cleanupCampaignReferences(s, id);
      },
    });
    expect(observed).toBe(true);
    expect(out.created[0].slot).toBe(0);
    expect(out.retired[0]).toMatchObject({
      slot: 0,
      code: 99,
      countDelta: -1,
      displayPhase: 12,
      moduleCleanup: true,
    });
    expect(out.cleanedReferenceBytes).toBe(1);
    expect(out.countDelta).toBe(0);
    expect(f.w.ecology.mules[0].native[0x57]).toBe(0);
    expect(word(f.w.ecology.mules[0].native, 0x55)).toBe(0);
    expect(word(f.w.missionPrefix!, 0x3554)).toBe(200);
    expect(f.w.rng).toEqual(rng);
    expect(f.w.powerEffects.slots[0].nativePrior![67]).toBe(17);
    expect(f.w.powerEffects.slots[2].nativePrior![69]).toBe(98);
    validateSpatial(f.w.spatial);
  });
  it("rolls back every staged field on missing priority or failed replacement cleanup", () => {
    const f = fixture();
    for (let i = 0; i < 200; i++) f.activate(i);
    f.w.powerEffects.slots[4].nativePrior![69] = 99;
    f.sync();
    const before = structuredClone(f.w);
    expect(() =>
      consumeMuleEffects(f.w, [f.event], f.pack, {
        cleanupReferences: cleanupCampaignReferences,
      }),
    ).toThrow(/priority/);
    expect(f.w).toEqual(before);
    expect(() =>
      consumeMuleEffects(f.w, [f.event], f.pack, {
        priority: (code) =>
          code === 99 ? 60 : establishedEffectPriorities[code],
        cleanupReferences: (s) => {
          s.rng.seed = 1;
          throw Error("cleanup rejected");
        },
      }),
    ).toThrow(/cleanup rejected/);
    expect(f.w).toEqual(before);
  });
  it("rolls back an earlier successful request when a later event has an unknown numeric prior", () => {
    const f = fixture();
    f.w.powerEffects.slots[1].nativePrior![67] = null;
    f.w.powerEffects.slots[1].fractionX = null;
    const before = structuredClone(f.w);
    expect(() =>
      consumeMuleEffects(f.w, [f.event, f.event], f.pack, {
        cleanupReferences: cleanupCampaignReferences,
      }),
    ).toThrow(/prior byte 67/);
    expect(f.w).toEqual(before);
  });
});

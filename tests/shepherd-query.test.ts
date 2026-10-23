import { describe, it, expect } from "vitest";
import {
  queryShepherdHostile,
  shepherdTargetVirtual58,
  shepherdTargetVirtual68,
  shepherdLineOfSight,
  type ShepherdQueryContext,
} from "../src/sim/mechanics/shepherd-query";
import type { GeneticistWorld } from "../src/sim/mechanics/geneticist";
import { worldCell } from "../src/sim/mechanics/terrain";
import { nextRandom } from "../src/sim/mechanics/random";
type Native = (number | null)[];
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >>> 8) & 255;
};
function creature(index: number, x: number, y: number, owner = 1) {
  const n: Native = Array(124).fill(0);
  n[6] = 1;
  n[24] = owner;
  n[94] = 8;
  put(n, 15, index);
  put(n, 7, x);
  put(n, 9, y);
  return n;
}
function fixture() {
  const n: Native = Array(200).fill(0);
  n[6] = 3;
  put(n, 7, 1024);
  put(n, 9, 1024);
  const raw = Array(1805).fill(0);
  raw[44] = 3;
  raw[45] = 50;
  const w: GeneticistWorld = {
    specialists: {
      schemaVersion: 1,
      records: [n],
      bindings: [
        {
          owner: 0,
          blueprintIndex: 0,
          style: 0,
          category: 3,
          resourceKey: 3,
          assetKey: "synthetic",
          sourceName: "synthetic",
          classSpeed: 700,
          blueprintOffset: 192,
          animationOffset: 31,
          resourceOffset: 196,
          internal: { offset: 176, targetOffset: 196 },
          vtable: "kind3",
        },
      ],
    },
    players: [{ raw }],
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
    missionPrefix: [],
    frame: 0,
    rng: { seed: 0, ring: 31, draws: 0 },
  };
  const creatures: Record<number, Native> = {},
    order: Record<number, string[]> = {},
    samples: number[] = [];
  const c: ShepherdQueryContext<typeof w> = {
    cellOrder: (_s, cell) => {
      samples.push(cell);
      return order[cell] ?? [];
    },
    creature: (_s, i) => creatures[i] ?? null,
  };
  function add(t: Native) {
    const i = t[15]! | (t[16]! << 8),
      x = t[7]! | (t[8]! << 8),
      y = t[9]! | (t[10]! << 8),
      cell = worldCell(x, y);
    creatures[i] = t;
    (order[cell] ??= []).push(`source:0:${i}`);
    return t;
  }
  return { w, n, raw, c, creatures, order, samples, add };
}
describe("source112748 Shepherd hostile query", () => {
  it("consumes two8D7B0 draws and scans X outer/Y inner even when empty", () => {
    const f = fixture(),
      rng = { ...f.w.rng };
    nextRandom(rng);
    nextRandom(rng);
    expect(queryShepherdHostile(f.w, 0, 512, f.c)).toBeNull();
    expect(f.w.rng).toEqual(rng);
    expect(f.samples).toEqual([
      worldCell(512, 1024),
      worldCell(768, 768),
      worldCell(768, 1024),
      worldCell(768, 1280),
      worldCell(1024, 512),
      worldCell(1024, 768),
      worldCell(1024, 1024),
      worldCell(1024, 1280),
      worldCell(1024, 1536),
      worldCell(1280, 768),
      worldCell(1280, 1024),
      worldCell(1280, 1280),
      worldCell(1536, 1024),
    ]);
  });
  it("skips noncreature shared identities and filters owner/alliance/corpse but not stun or species", () => {
    const f = fixture(),
      a = f.add(creature(1, 1100, 1024, 0)),
      b = f.add(creature(2, 1110, 1024, 2)),
      corpse = f.add(creature(3, 1120, 1024));
    corpse[94] = 24;
    const stunned = f.add(creature(4, 1130, 1024));
    stunned[94] = 18;
    put(stunned, 108, 90);
    stunned[122] = 255;
    f.raw[0x6e5] = 1 << 2;
    f.order[worldCell(1100, 1024)].unshift(
      "source:2:1",
      "source:3:2",
      "source:4:5",
    );
    expect(queryShepherdHostile(f.w, 0, 512, f.c)?.native).toBe(stunned);
    expect(a[6]).toBe(1);
    expect(b[6]).toBe(1);
  });
  it("selects nearest terrain736F0 distance and first shared-chain ties", () => {
    const f = fixture(),
      first = f.add(creature(9, 1100, 1024)),
      second = f.add(creature(1, 1100, 1024));
    expect(queryShepherdHostile(f.w, 0, 512, f.c)?.native).toBe(first);
    f.order[worldCell(1100, 1024)].reverse();
    expect(queryShepherdHostile(f.w, 0, 512, f.c)?.native).toBe(second);
  });
  it("limits sampled cells rather than adding a candidate radius cutoff", () => {
    const f = fixture(),
      t = f.add(creature(1, 1791, 1024));
    expect(queryShepherdHostile(f.w, 0, 512, f.c)?.native).toBe(t);
  });
  it("uses ground elevation rather than native physical cache for ranking", () => {
    const f = fixture(),
      near = f.add(creature(1, 1280, 1024)),
      far = f.add(creature(2, 1024, 1536));
    put(f.w.terrain.bytes, worldCell(1280, 1024) * 14 + 2, 10000);
    near[39] = 0;
    far[39] = 255;
    expect(queryShepherdHostile(f.w, 0, 512, f.c)?.native).toBe(far);
  });
  it("wraps source15-bit distances and signed-word sampled coordinates", () => {
    const f = fixture();
    put(f.n, 7, 32760);
    const t = f.add(creature(1, 8, 1024));
    expect(queryShepherdHostile(f.w, 0, 512, f.c)?.native).toBe(t);
  });
  it("does not commit preview RNG after a late missing or stale linked native record", () => {
    const f = fixture();
    f.order[worldCell(1536, 1024)] = ["source:0:99"];
    const before = { ...f.w.rng };
    expect(() => queryShepherdHostile(f.w, 0, 512, f.c)).toThrow(
      "linked creature",
    );
    expect(f.w.rng).toEqual(before);
  });
  it("JSON continuation preserves traversal direction draws and target selection", () => {
    const f = fixture();
    f.add(creature(1, 1100, 1024));
    const saved = JSON.parse(JSON.stringify(f.w));
    const one = queryShepherdHostile(f.w, 0, 512, f.c),
      two = queryShepherdHostile(saved, 0, 512, f.c);
    expect(one?.index).toBe(two?.index);
    expect(saved.rng).toEqual(f.w.rng);
  });
});
describe("Shepherd concrete target virtuals and75890", () => {
  it("distinguishes positive stun virtual58 from corpse virtual68", () => {
    const n = creature(1, 0, 0),
      t = { kind: 1 as const, native: n };
    expect(shepherdTargetVirtual58(t)).toBe(false);
    n[94] = 18;
    put(n, 108, 1);
    expect(shepherdTargetVirtual58(t)).toBe(true);
    expect(shepherdTargetVirtual68(t)).toBe(false);
    put(n, 108, 65535);
    expect(shepherdTargetVirtual58(t)).toBe(false);
    n[94] = 24;
    expect(shepherdTargetVirtual58(t)).toBe(false);
    expect(shepherdTargetVirtual68(t)).toBe(true);
  });
  it("uses actual signed blueprint health for specialists, signedword43 buildings, and constantfalse58", () => {
    const n: Native = Array(200).fill(null);
    n[6] = 3;
    const bp = Array(36).fill(0);
    bp[26] = 255;
    expect(shepherdTargetVirtual68({ kind: 3, native: n }, bp)).toBe(true);
    bp[26] = 1;
    expect(shepherdTargetVirtual68({ kind: 3, native: n }, bp)).toBe(false);
    expect(shepherdTargetVirtual58({ kind: 3, native: n })).toBe(false);
    expect(() => shepherdTargetVirtual68({ kind: 3, native: n })).toThrow(
      "blueprint",
    );
    n[6] = 4;
    put(n, 43, 65535);
    expect(shepherdTargetVirtual68({ kind: 4, native: n })).toBe(true);
    expect(shepherdTargetVirtual58({ kind: 4, native: n })).toBe(false);
  });
  it("uses the shared exact ray with terrain muzzle+1280 and mask1 for general building targets", () => {
    const f = fixture(),
      t = Array(67).fill(0);
    t[6] = 4;
    put(t, 7, 1200);
    put(t, 9, 1024);
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
    const samples: { mask: number; height: number }[] = [];
    expect(
      shepherdLineOfSight(
        f.w,
        0,
        { kind: 4, index: 0, native: t, physicalHeight: 999999 },
        {
          tables,
          obstacle: (_w, _p, mask, height) => {
            samples.push({ mask, height });
            return false;
          },
        },
      ),
    ).toBe(true);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples.every((s) => s.mask === 1 && s.height < 1280)).toBe(true);
    expect(
      shepherdLineOfSight(
        f.w,
        0,
        { kind: 4, index: 0, native: t, physicalHeight: 0 },
        { tables, obstacle: () => true },
      ),
    ).toBe(false);
  });
});

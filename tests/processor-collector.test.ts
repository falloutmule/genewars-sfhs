import { describe, it, expect } from "vitest";
import { processorFixture, processorPlant } from "./fixtures/processor";
import {
  createStagedProcessorCollector,
  stepStagedProcessorCollector,
  stepProcessorCollector,
  cancelStagedProcessorCollector,
  damageStagedProcessorCollector,
  queryProcessorCollection,
  collectorWord as word,
  type ProcessorCollectorContext,
} from "../src/sim/mechanics/processor-collector";
import { put16 } from "../src/sim/campaign/bytes";
function fixture(mode: 0 | 1 = 1) {
  const f = processorFixture(2, mode === 0 ? 1 : 2),
    p = processorPlant(f, 7, [8960, 8192]),
    log: string[] = [],
    c: ProcessorCollectorContext<typeof f.w> = {
      resolve: (s, r) =>
        r.kind === 4
          ? s.buildingNative[r.index]
          : r.kind === 2
            ? s.ecology.plants[r.index]?.native
            : r.kind === 1
              ? s.creatureNative[r.index]
              : s.powerEffects.slots[r.index].nativePrior!,
      profile: (_s, a) => {
        const count = a === 25 ? 2 : a === 26 ? 5 : 8;
        return {
          flags: 0,
          first: 0,
          last: count - 1,
          holds: Array(count).fill(a === 26 ? 1 : 0),
        };
      },
      motion: () => {
        log.push("motion");
      },
      insert: () => {
        log.push("insert");
      },
      unlink: () => {
        log.push("unlink");
      },
      cleanup: () => {
        log.push("cleanup");
      },
      audio: (_s, _i, e) => {
        log.push(e.operation);
      },
      ignitePlant: () => {
        log.push("ignite");
        p.native[46] = p.native[46]! | 8;
        p.native[44] = p.native[45] = 0;
      },
      createPlantCarrier: () => {
        log.push("carrier");
        return null;
      },
      feedback: () => {
        log.push("feedback");
      },
    };
  const made = createStagedProcessorCollector(
    f.w,
    { building: 0, target: { kind: 2, index: 0 }, mode },
    c,
  )!;
  return {
    ...f,
    p,
    log,
    c,
    index: made.index,
    n: f.w.collectors.records[made.index],
  };
}
describe("sourcekind7 collector family", () => {
  it("constructs the first free retained97-byte slot and preserves fields the source never writes", () => {
    const f = processorFixture(2, 1),
      p = processorPlant(f, 7, [8960, 8192]),
      n = f.w.collectors.records[0];
    n[30] = 219;
    put16(n as number[], 65, -12);
    n[67] = 157;
    n[68] = 93;
    const held = n,
      player = f.w.players[0].raw;
    let inserted = false;
    createStagedProcessorCollector(
      f.w,
      { building: 0, target: { kind: 2, index: 0 }, mode: 0 },
      {
        resolve: (_s, r) => (r.kind === 4 ? f.w.buildingNative[0] : p.native),
        profile: () => {
          throw Error("not read by factory");
        },
        insert: () => {
          inserted = true;
          expect(n[6]).toBe(7);
        },
      },
    );
    expect(n).toBe(held);
    expect(f.w.players[0].raw).toBe(player);
    expect(inserted).toBe(true);
    expect(n.slice(65, 69)).toEqual([244, 255, 157, 93]);
    expect(n[30]).toBe(219);
    expect(word(n, 43)).toBe(16);
    expect(word(n, 63)).toBe(576);
    expect(p.native[46]! & 4).toBe(4);
    expect(f.w.collectors.count).toBe(1);
  });
  it("declines full capacity before reading a target or animation resource", () => {
    const f = fixture();
    f.w.collectors.count = 32;
    expect(
      createStagedProcessorCollector(
        f.w,
        { building: 999, target: { kind: 2, index: 999 }, mode: 0 },
        {
          resolve: () => {
            throw Error("target read");
          },
          profile: () => {
            throw Error("profile read");
          },
        },
      ),
    ).toBeNull();
  });
  it("finishes mode0 cut work and its real retirement animation, without material income", () => {
    const f = fixture(0);
    put16(f.n as number[], 73, 32);
    const funds = f.w.players[0].raw.slice(),
      stock = f.w.buildingNative[0].slice(54, 58);
    stepStagedProcessorCollector(f.w, 0, f.c);
    expect(f.n[86]).toBe(1);
    expect(f.n[25]).toBe(26);
    for (let i = 0; i < 40 && f.n[6] !== 0; i++)
      stepStagedProcessorCollector(f.w, 0, f.c);
    expect(f.log).toContain("ignite");
    expect(f.log.slice(-3)).toEqual(["feedback", "unlink", "cleanup"]);
    expect(f.n[6]).toBe(0);
    expect(f.w.collectors.count).toBe(0);
    expect(f.p.native[46]! & 12).toBe(8);
    expect(f.w.players[0].raw).toEqual(funds);
    expect(f.w.buildingNative[0].slice(54, 58)).toEqual(stock);
  });
  it("handles a full carrier pool by clearing the target mark and entering real state3", () => {
    const f = fixture();
    f.p.native[46] = f.p.native[46]! | 8;
    put16(f.n as number[], 73, 32);
    stepStagedProcessorCollector(f.w, 0, f.c);
    expect(f.log).toContain("carrier");
    expect(f.n[86]).toBe(3);
    expect(f.n[25]).toBe(27);
    expect(f.p.native[46]! & 4).toBe(0);
    expect(word(f.n, 63)).toBe(0);
  });
  it("returns a picked-up corpse to the actual parent+[-128,+128] and releases both flags on damage", () => {
    const f = fixture(),
      t = f.w.creatureNative[3];
    t.fill(0);
    t.fill(null, 31, 39);
    t[6] = 1;
    put16(t as number[], 15, 3);
    t[94] = 25;
    t[96] = 1;
    put16(f.n as number[], 90, 3);
    f.n[92] = 1;
    f.n[85] = 2;
    put16(f.n as number[], 73, 32);
    stepStagedProcessorCollector(f.w, 0, f.c);
    expect(f.n[86]).toBe(2);
    expect(t[97]! & 1).toBe(1);
    expect([word(f.n, 11), word(f.n, 13)]).toEqual([8320, 8320]);
    expect(f.n[79]).toBe(4);
    damageStagedProcessorCollector(f.w, 0, f.c);
    expect(t[96]! & 1).toBe(0);
    expect(t[97]! & 1).toBe(0);
    expect(f.n[86]).toBe(3);
    const before = JSON.stringify(f.n);
    damageStagedProcessorCollector(f.w, 0, f.c);
    expect(JSON.stringify(f.n)).toBe(before);
  });
  it("cancels on power loss before the ordinary ANB tail", () => {
    const f = fixture();
    put16(f.w.buildingNative[0] as number[], 49, 1);
    f.n[27] = 1;
    const r = stepStagedProcessorCollector(f.w, 0, f.c);
    expect(f.n[27]).toBe(0);
    expect(f.n[25]).toBe(27);
    expect(r.events.some((e) => e.type === "collector-draw")).toBe(false);
    expect(f.p.native[46]! & 4).toBe(0);
  });
  it("transitions moving67 to68 but uses the real drop port for an idle carrier", () => {
    for (const moving of [true, false]) {
      const f = fixture(),
        e = f.w.powerEffects.slots[0].nativePrior!;
      e[6] = 5;
      e[69] = 67;
      put16(f.n as number[], 90, 0);
      f.n[92] = 5;
      f.n[86] = 2;
      put16(f.n as number[], 73, moving ? 16 : 0);
      let dropped = 0;
      f.c.dropPlantCarrier = () => {
        dropped++;
      };
      cancelStagedProcessorCollector(f.w, 0, f.c);
      expect(e[69]).toBe(moving ? 68 : 67);
      expect(dropped).toBe(moving ? 0 : 1);
    }
  });
  it("keeps atomic input and nested player/native identities after a late missing profile", () => {
    const f = fixture(),
      before = JSON.stringify(f.w),
      held = f.n,
      raw = f.w.players[0].raw;
    expect(() =>
      stepProcessorCollector(f.w, 0, {
        ...f.c,
        profile: () => {
          throw Error("missing EFF25");
        },
      }),
    ).toThrow("missing EFF25");
    expect(JSON.stringify(f.w)).toBe(before);
    expect(f.w.collectors.records[0]).toBe(held);
    expect(f.w.players[0].raw).toBe(raw);
  });
  it("queries with two draws even when empty and observes exact grade/mode and first-chain masks", () => {
    const f = fixture(),
      parent = f.w.buildingNative[0];
    f.p.native[46] = 5;
    const before = f.w.rng.draws;
    expect(queryProcessorCollection(f.w, parent, 2048, () => [])).toBeNull();
    expect(f.w.rng.draws - before).toBe(2);
    const plant = f.p.native.slice();
    plant[46] = 0;
    put16(plant as number[], 7, 8960);
    const result = queryProcessorCollection(f.w, parent, 2048, (_s, cell) =>
      cell === 32 * 128 + 35 ? [f.p.native, plant] : [],
    );
    expect(result).toEqual({ target: { kind: 2, index: 0 }, mode: 1 });
    parent[45] = 4;
    parent[46] = 1;
    expect(
      queryProcessorCollection(f.w, parent, 1024, () => [plant]),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  stepStagedNativePowerProducer,
  type NativePowerProducerWorld,
  type NativePowerProducerContext,
  type PowerProducerTransfer,
} from "../src/sim/mechanics/power-producer";
import { put16, put32, i16, u32 } from "../src/sim/campaign/bytes";
import {
  planEngineerBuildingUpgrade,
  planEngineerBuildingContribution,
} from "../src/sim/mechanics/engineer-construction";

/** Synthetic retained byte priors and deliberately non-original ANB lengths. */
function fixture(selector: 3 | 6 = 3, grade: 0 | 1 | 2 = 0) {
  const records: (number | null)[][] = Array.from({ length: 256 }, () =>
    Array.from({ length: 67 }, (_, i) => (i >= 31 && i < 39 ? null : 0)),
  );
  const w: NativePowerProducerWorld = {
    frame: grade * 16,
    buildingNative: records,
    players: Array.from({ length: 4 }, (_, id) => {
      const raw = Array(1805).fill(0);
      raw[1] = raw[0x4a1] = id;
      return { id, raw };
    }),
    rng: { seed: 0, ring: 31, draws: 0 },
  };
  function add(
    slot: number,
    type: number,
    point: [number, number] = [4096 + slot * 64, 4096],
    flags = 1,
    targetGrade = 0,
  ) {
    const n = records[slot];
    n[6] = 4;
    n[24] = Math.floor(slot / 64);
    n[45] = type;
    n[46] = n[47] = targetGrade;
    n[25] = targetGrade + 1;
    put16(n as number[], 15, slot);
    put16(n as number[], 7, point[0]);
    put16(n as number[], 9, point[1]);
    put16(n as number[], 43, 100);
    put16(n as number[], 49, flags);
    return n;
  }
  const n = add(0, selector, [4096, 4096], 1, grade),
    transfers: PowerProducerTransfer[] = [],
    order: string[] = [],
    lengths = [3, 2, 5, 7, 3];
  const c: NativePowerProducerContext<NativePowerProducerWorld> = {
    upkeep: Array(14).fill(0),
    solarGeneration: 5,
    profile(_s, _slot, action) {
      order.push(`profile:${action}`);
      const holds = Array(lengths[action]).fill(0);
      if (action === 3) holds[5] = 3;
      return { holds, first: 0, last: holds.length - 1, flags: 0 };
    },
    audio: (_s, _slot, request) =>
      order.push(`${request.type}:${request.channel}`),
    createTransfer(_s, request) {
      transfers.push(request);
      order.push(`factory:${request.targetSlot}`);
      return transfers.length - 1;
    },
    queueBuilding: () => {
      order.push("queue");
    },
  };
  return { w, n, c, add, transfers, order };
}

describe("complete Distributor/Photon native callbacks", () => {
  it.each([0, 1, 2] as const)(
    "uses grade%s output, one source draw without recipients,54 and wrapped4AD",
    (grade) => {
      for (const selector of [3, 6] as const) {
        const f = fixture(selector, grade);
        put16(f.n as number[], 61, selector === 3 ? 99 : 199);
        put16(f.w.players[0].raw, 0x4ad, 32767);
        put32(f.n as number[], 54, 0x12345678);
        const r = stepStagedNativePowerProducer(f.w, 0, f.c),
          generated = selector === 3 ? Math.max(2, grade * 4) : 5 + grade;
        expect(r).toMatchObject({
          generated,
          operational: true,
          pulse: true,
          draw: 0,
          recipientCount: 0,
          queueRequested: true,
        });
        expect(i16(f.w.players[0].raw, 0x4ad)).toBe(
          ((32767 + generated) << 16) >> 16,
        );
        expect(f.w.rng).toEqual({ seed: 0, ring: 0, draws: 1 });
        expect(i16(f.n as number[], 61)).toBe(
          selector === 3 ? 99 + generated : 0,
        );
        expect(u32(f.n as number[], 54)).toBe(selector === 3 ? 0 : 0x12345678);
        expect(f.n[25]).toBe(grade + 1);
      }
    },
  );

  it("marks recipients first, clears each mark before its ordered immediate factory, then runs queue/ANB", () => {
    const f = fixture(3, 1),
      first = f.add(1, 11),
      last = f.add(4, 0, [6400, 4096], 0x41);
    f.add(2, 11, [4200, 4096], 0x101);
    f.add(3, 6);
    put16(f.n as number[], 61, 196);
    f.c.createTransfer = (_w, q) => {
      expect(f.w.buildingNative[0]).toBe(f.n);
      expect(f.w.buildingNative[q.targetSlot][49]! & 0x10).toBe(0);
      if (q.targetSlot === 1) expect(last[49]! & 0x10).toBe(0x10);
      expect(i16(f.n as number[], 61)).toBe(200);
      f.transfers.push(q);
      f.order.push(`factory:${q.targetSlot}`);
      return f.transfers.length - 1;
    };
    const r = stepStagedNativePowerProducer(f.w, 0, f.c);
    expect(f.transfers.map((q) => [q.targetSlot, q.payload])).toEqual([
      [1, 100],
      [4, 100],
    ]);
    expect([
      u32(f.n as number[], 54),
      i16(f.n as number[], 61),
      first[49]! & 16,
      last[49]! & 16,
    ]).toEqual([2, 0, 0, 0]);
    expect(r.createdSlots).toEqual([0, 1]);
    expect(f.order).toEqual([
      "play:61",
      "factory:1",
      "factory:4",
      "queue",
      "profile:2",
    ]);
  });

  it("uses each Distributor recipient's grade radius and admits its0100 mark for a Photon", () => {
    const f = fixture(6, 0);
    f.add(1, 3, [4096 + 2304, 4096], 0x101, 1);
    f.add(2, 3, [4096 + 2305, 4096], 1, 1);
    f.add(3, 11);
    put16(f.n as number[], 61, 199);
    stepStagedNativePowerProducer(f.w, 0, f.c);
    expect(f.transfers.map((q) => [q.targetSlot, q.payload])).toEqual([
      [1, 200],
    ]);
    expect(f.order).toEqual([
      "stop:35",
      "play:35",
      "factory:1",
      "queue",
      "profile:1",
    ]);
    expect(f.n[29]).toBe(3);
  });

  it("does not create zero-share Distributor packets and preserves unsigned negative shares", () => {
    const zero = fixture();
    zero.add(1, 11);
    zero.add(2, 11);
    put16(zero.n as number[], 61, -2);
    stepStagedNativePowerProducer(zero.w, 0, zero.c);
    expect(zero.transfers).toEqual([]);
    expect(u32(zero.n as number[], 54)).toBe(2);
    const negative = fixture();
    negative.add(1, 11);
    put16(negative.n as number[], 61, -99);
    stepStagedNativePowerProducer(negative.w, 0, negative.c);
    expect(negative.transfers[0].payload).toBe(255);
  });

  it("keeps incomplete and disabled drains/counters and unknown afterimages through the common tail", () => {
    for (const selector of [3, 6] as const)
      for (const flags of [0x100, 0x41]) {
        const f = fixture(selector, 2);
        put16(f.n as number[], 49, flags);
        put16(f.n as number[], 61, 200);
        f.n[26] = 255;
        f.n[27] = 255;
        f.n[28] = 1;
        f.n[29] = 128;
        f.n[30] = 127;
        f.n[48] = 201;
        f.n[63] = 29;
        f.n[51] = null;
        f.n[58] = 77;
        const r = stepStagedNativePowerProducer(f.w, 0, f.c);
        expect([
          i16(f.n as number[], 61),
          f.n[63],
          f.n[48],
          f.n[51],
          f.n[58],
        ]).toEqual([199, 29, 200, null, 77]);
        expect(r.generated).toBe(0);
        expect(f.w.rng.draws).toBe(0);
        expect([f.n[25], f.n[27], f.n[28], f.n[30]]).toEqual([
          flags & 1 ? 4 : 0,
          2,
          0,
          128,
        ]);
        expect(r.audio.map((a) => a.type)).toEqual(
          selector === 6 ? ["stop"] : [],
        );
      }
  });

  it("charges and decays a suppressed complete producer without generating or drawing", () => {
    const f = fixture(6, 1);
    put16(f.n as number[], 49, 0x101);
    put16(f.n as number[], 61, 200);
    f.n[63] = 7;
    f.n[28] = 255;
    f.n[29] = 2;
    f.n[30] = 2;
    const r = stepStagedNativePowerProducer(f.w, 0, f.c);
    expect([i16(f.n as number[], 61), f.n[63], f.n[28], f.n[30]]).toEqual([
      192, 6, 255, 1,
    ]);
    expect(r.operational).toBe(false);
    expect(f.w.rng.draws).toBe(0);
  });

  it("uses the actual grade2 hold3 and arbitrary admitted action length", () => {
    const f = fixture(6, 2);
    f.w.frame = 33;
    f.n[27] = 5;
    f.n[26] = 255;
    f.n[30] = 0;
    stepStagedNativePowerProducer(f.w, 0, f.c);
    expect([f.n[25], f.n[26], f.n[27], f.n[30]]).toEqual([3, 2, 5, 3]);
    const d = fixture(3, 2);
    d.w.frame = 33;
    d.n[27] = 255;
    d.n[29] = 255;
    d.n[30] = 128;
    stepStagedNativePowerProducer(d.w, 0, d.c);
    expect([d.n[25], d.n[27], d.n[30]]).toEqual([3, 0, 255]);
  });

  it("uses real upgrade/completion priors rather than a reset animation", () => {
    const f = fixture(3, 0);
    f.n[30] = 127;
    f.n[48] = 44;
    f.n[63] = 19;
    const upgraded = planEngineerBuildingUpgrade(f.n);
    f.n.splice(0, 67, ...upgraded.native);
    stepStagedNativePowerProducer(f.w, 0, f.c);
    expect([f.n[25], f.n[46], f.n[47], f.n[48], f.n[63]]).toEqual([
      0, 0, 1, 43, 19,
    ]);
    const completed = planEngineerBuildingContribution(f.n, 200, 300);
    f.n.splice(0, 67, ...completed.native);
    f.w.frame = 17;
    stepStagedNativePowerProducer(f.w, 0, f.c);
    expect([f.n[25], f.n[46], f.n[48], f.n[63]]).toEqual([2, 1, 42, 18]);
    expect(f.order.at(-1)).toBe("profile:2");
  });

  it("does not queue/profile a zero-health incomplete record and rejects replacing held arrays", () => {
    const f = fixture(6);
    put16(f.n as number[], 49, 0);
    put16(f.n as number[], 43, 0);
    f.c.profile = () => {
      throw Error("must be lazy");
    };
    expect(stepStagedNativePowerProducer(f.w, 0, f.c).queueRequested).toBe(
      false,
    );
    expect(f.order).toEqual(["stop:35"]);
    const replaced = fixture();
    replaced.c.audio = (w) => {
      w.players[0].raw = w.players[0].raw.slice();
    };
    expect(() =>
      stepStagedNativePowerProducer(replaced.w, 0, replaced.c),
    ).toThrow("held native/player");
    const demolition = fixture();
    put16(demolition.n as number[], 49, 0x801);
    const before = structuredClone(demolition.w);
    expect(() =>
      stepStagedNativePowerProducer(demolition.w, 0, demolition.c),
    ).toThrow("demolition");
    expect(demolition.w).toEqual(before);
  });
});

import { describe, expect, it } from "vitest";
import {
  planSpecialistCharge,
  applyStagedSpecialistCharge,
  type SpecialistChargeWorld,
} from "../src/sim/mechanics/specialist-charge";
import {
  stepGeneticistCallback,
  type GeneticistWorld,
  type GeneticistCallbackContext,
} from "../src/sim/mechanics/geneticist";
type Native = (number | null)[];
const refs = [77, 80, 85, 88, 91] as const;
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
function fixture(index = 7) {
  const target: Native = Array(200).fill(null);
  target[6] = 3;
  put(target, 15, index);
  target[115] = 224;
  const world: SpecialistChargeWorld = {
    specialists: {
      records: Array.from({ length: 20 }, (_, i) =>
        i === index ? target : Array(200).fill(null),
      ),
    },
    creatureNative: Array.from({ length: 300 }, () => {
      const n: Native = Array(124).fill(null);
      n[6] = 0;
      return n;
    }),
  };
  return { world, target, index };
}
function active(n: Native) {
  n[6] = 1;
  for (const p of refs) n[p + 2] = 0;
}
function reference(n: Native, p: number, index: number, kind = 3) {
  put(n, p, index);
  n[p + 2] = kind;
}
describe("source57860 powered specialist reference release", () => {
  it("skips all inactive rows without reading unknown references or the unused target identity", () => {
    const f = fixture();
    f.target[6] = null;
    f.target[15] = f.target[16] = null;
    const before = JSON.stringify(f.world);
    expect(applyStagedSpecialistCharge(f.world, f.index)).toEqual({
      activeRows: 0,
      skippedRows: 300,
      writes: [],
    });
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it.each(refs)(
    "clears only matching reference kind at native%i and preserves its retained index",
    (p) => {
      const f = fixture(),
        n = f.world.creatureNative[11];
      active(n);
      reference(n, p, f.index);
      n[96] = 255;
      n[97] = 213;
      const before = n.slice(),
        plan = applyStagedSpecialistCharge(f.world, f.index);
      const expected = before.slice();
      expected[p + 2] = 0;
      if (p === 91) expected[96] = 253;
      expect(n).toEqual(expected);
      expect([n[p], n[p + 1]]).toEqual([f.index, 0]);
      expect(plan.writes.map((w) => w.offset)).toEqual(
        p === 91 ? [96, 93] : [p + 2],
      );
      expect(plan.activeRows).toBe(1);
      expect(plan.skippedRows).toBe(299);
    },
  );
  it("processes all300 active rows regardless of owner, species or live/dead action while retaining array identities", () => {
    const f = fixture(),
      root = f.world.creatureNative,
      rows = [...root],
      targetBefore = f.target.slice();
    for (let i = 0; i < 300; i++) {
      const n = root[i];
      active(n);
      n[24] = i % 5;
      n[94] = i % 3 === 0 ? 24 : 8;
      n[122] = i % 25;
      n[96] = 255;
      n[97] = 211;
      for (const p of refs) reference(n, p, f.index);
    }
    const plan = applyStagedSpecialistCharge(f.world, f.index);
    expect(plan.writes).toHaveLength(1800);
    expect([plan.activeRows, plan.skippedRows]).toEqual([300, 0]);
    expect(f.world.creatureNative).toBe(root);
    expect(f.target).toEqual(targetBefore);
    for (let i = 0; i < 300; i++) {
      expect(root[i]).toBe(rows[i]);
      expect(refs.map((p) => root[i][p + 2])).toEqual([0, 0, 0, 0, 0]);
      expect([root[i][96], root[i][97], root[i][24], root[i][122]]).toEqual([
        253,
        211,
        i % 5,
        i % 25,
      ]);
    }
  });
  it("preserves wrong-kind and wrong-index references and only reads indices after kind equality", () => {
    const f = fixture(),
      n = f.world.creatureNative[0];
    active(n);
    reference(n, 77, f.index + 1);
    reference(n, 80, f.index, 1);
    reference(n, 85, f.index);
    reference(n, 88, f.index, 4);
    n[93] = 1;
    n[91] = n[92] = null;
    n[96] = n[97] = null;
    const plan = applyStagedSpecialistCharge(f.world, f.index);
    expect(plan.writes.map((w) => w.offset)).toEqual([87]);
    expect([n[79], n[82], n[87], n[90], n[93], n[96], n[97]]).toEqual([
      3,
      1,
      0,
      4,
      1,
      null,
      null,
    ]);
  });
  it("preserves unknown high flags byte97 after its sourceword high half is masked away", () => {
    const f = fixture(),
      n = f.world.creatureNative[0];
    active(n);
    reference(n, 91, f.index);
    n[96] = 6;
    n[97] = null;
    const plan = applyStagedSpecialistCharge(f.world, f.index);
    expect([n[96], n[97], n[93]]).toEqual([4, null, 0]);
    expect(plan.writes.map((w) => w.offset)).toEqual([96, 93]);
  });
  it("retains source equality behavior after the specialist kind becomes0, including the last-target flag clear", () => {
    const f = fixture(),
      n = f.world.creatureNative[0];
    f.target[6] = 0;
    active(n);
    for (const p of refs) n[p + 2] = 1;
    reference(n, 91, f.index, 0);
    n[96] = 2;
    n[97] = 199;
    const plan = applyStagedSpecialistCharge(f.world, f.index);
    expect(plan.writes).toEqual([
      {
        creatureIndex: 0,
        offset: 96,
        before: 2,
        after: 0,
        reason: "retained-target-flag",
      },
      {
        creatureIndex: 0,
        offset: 93,
        before: 0,
        after: 0,
        reason: "reference-kind",
      },
    ]);
    expect([n[96], n[97], n[93]]).toEqual([0, 199, 0]);
  });
  it("does not reset charge, allocate particles or alter serializable world roots unrelated to creature references", () => {
    const f = fixture(),
      n = f.world.creatureNative[4];
    active(n);
    reference(n, 77, f.index);
    const world = {
      ...f.world,
      rng: { seed: 42, ring: 9, draws: 123 },
      players: [{ raw: [2, 4, 6] }],
      effects: [{ code: 60 }],
      resource: 17,
    };
    const target = world.specialists.records[f.index],
      rng = world.rng,
      player = world.players[0].raw;
    applyStagedSpecialistCharge(world, f.index);
    expect(target).toBe(f.target);
    expect(target[115]).toBe(224);
    expect(world.rng).toBe(rng);
    expect(world.rng.draws).toBe(123);
    expect(world.players[0].raw).toBe(player);
    expect(world.effects).toEqual([{ code: 60 }]);
    expect(world.resource).toBe(17);
  });
  it("prevalidates the complete plan so an unknown late active reference cannot partially clear an earlier row", () => {
    const f = fixture(),
      first = f.world.creatureNative[0],
      last = f.world.creatureNative[299];
    active(first);
    reference(first, 77, f.index);
    active(last);
    last[87] = null;
    const before = JSON.stringify(f.world),
      rows = [...f.world.creatureNative];
    expect(() => applyStagedSpecialistCharge(f.world, f.index)).toThrow(
      /numeric byte 87/,
    );
    expect(JSON.stringify(f.world)).toBe(before);
    rows.forEach((row, i) => expect(f.world.creatureNative[i]).toBe(row));
  });
  it("returns a pure JSON plan and the same continuation after save/reload without rebuilding nullable prior bytes", () => {
    const f = fixture(),
      n = f.world.creatureNative[299];
    active(n);
    reference(n, 88, f.index);
    const before = JSON.stringify(f.world),
      plan = planSpecialistCharge(f.target, f.world.creatureNative);
    expect(JSON.stringify(f.world)).toBe(before);
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
    const loaded = JSON.parse(before) as SpecialistChargeWorld;
    expect(applyStagedSpecialistCharge(loaded, f.index)).toEqual(
      applyStagedSpecialistCharge(f.world, f.index),
    );
    expect(loaded).toEqual(f.world);
  });
  it("rejects incompatible pool extents before writes", () => {
    const f = fixture();
    expect(() =>
      planSpecialistCharge(f.target, f.world.creatureNative.slice(0, 299)),
    ).toThrow(/300x124/);
    expect(() =>
      planSpecialistCharge(f.target.slice(0, 199), f.world.creatureNative),
    ).toThrow(/specialist200/);
    expect(() =>
      planSpecialistCharge(
        f.target,
        Array(300).fill(f.world.creatureNative[0]),
      ),
    ).toThrow(/Distinct/);
    expect(() => applyStagedSpecialistCharge(f.world, 20)).toThrow(
      /twenty-slot/,
    );
  });
});

describe("57A10 powered specialist gate binding", () => {
  function callbackFixture() {
    const f = fixture(0),
      n: Native = Array(200).fill(0);
    n.fill(null, 31, 39);
    n.fill(null, 176, 180);
    n.fill(null, 192, 200);
    n[6] = 3;
    n[85] = 1;
    n[112] = 1;
    n[115] = 223;
    n[28] = 1;
    f.world.specialists.records[0] = n;
    const raw = Array(1805).fill(0);
    raw[43] = 3;
    raw[44] = 2;
    raw[45] = 50;
    raw[46] = raw[47] = raw[48] = raw[49] = 50;
    raw[0x610] = 1;
    const world: GeneticistWorld & SpecialistChargeWorld = {
      ...f.world,
      specialists: {
        schemaVersion: 1,
        records: f.world.specialists.records,
        bindings: Array(20).fill(null),
      },
      players: [{ raw }],
      ecology: {
        schemaVersion: 1,
        sourceSha256: "synthetic",
        ticks: 0,
        plantCursor: 0,
        plantCount: 0,
        ownerPlantCounts: [0, 0, 0, 0],
        plants: [],
        mules: [],
        otherEntities: [],
        pending: [],
        unsupported: [],
      },
      terrain: { bytes: Array(229376).fill(0), revision: 0 },
      rng: { seed: 131, ring: 31, draws: 0 },
      frame: 1,
      missionPrefix: Array(0x355e).fill(0),
    };
    world.specialists.bindings[0] = {
      owner: 0,
      blueprintIndex: 0,
      style: 3,
      category: 2,
      resourceKey: 14,
      assetKey: "SYNTHETIC",
      sourceName: "synthetic",
      classSpeed: 600,
      blueprintOffset: 192,
      animationOffset: 31,
      resourceOffset: 196,
      internal: { offset: 176, targetOffset: 196 },
      vtable: "kind3",
    };
    const c: GeneticistCallbackContext<typeof world> = {
      rules: { schemaVersion: 1, projectiles: [] },
      tables: { atan: [], sine: [], cosine: [] },
      globalFlags: 0,
      cellOrder: () => [],
      motion: () => {},
      runtimeMode: 0,
      override180d80: 0,
      runtimeCount11c2bc: 1,
      animation: () => ({ holds: [0, 0], flags: 0, first: 0, last: 1 }),
      charge: applyStagedSpecialistCharge,
    };
    const creature = world.creatureNative[0];
    active(creature);
    reference(creature, 77, 0);
    return { world, c, n: () => world.specialists.records[0] };
  }
  it("binds the literal no-RNG release only when the common powered idle increment reaches224", () => {
    const f = callbackFixture();
    stepGeneticistCallback(f.world, 0, f.c);
    expect([
      f.n()[115],
      f.world.creatureNative[0][79],
      f.world.rng.draws,
    ]).toEqual([224, 0, 0]);
    reference(f.world.creatureNative[0], 77, 0);
    f.world.frame = 3;
    stepGeneticistCallback(f.world, 0, f.c);
    expect([f.n()[115], f.world.creatureNative[0][79]]).toEqual([225, 3]);
  });
  it("does not call the service when unpowered or physically moving", () => {
    for (const moving of [false, true]) {
      const f = callbackFixture();
      if (moving) put(f.n(), 45, 1);
      else f.world.players[0].raw[0x610] = 0;
      f.c.charge = () => {
        throw Error("unused charge callback");
      };
      stepGeneticistCallback(f.world, 0, f.c);
      expect([f.n()[115], f.world.creatureNative[0][79]]).toEqual([
        moving ? 223 : 0,
        3,
      ]);
    }
  });
});

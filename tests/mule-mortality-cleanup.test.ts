import { describe, expect, it } from "vitest";
import {
  releaseMuleMortalityReferences,
  stepNeutralMule,
  type MuleContext,
} from "../src/sim/mechanics/mule";
import type {
  EcologyRules,
  EcologyState,
  EcologyMule,
} from "../src/sim/mechanics/ecology";
import type { MuleHaulingContext } from "../src/sim/mechanics/mule-hauling";
import { terrainFromBytes } from "../src/sim/mechanics/terrain";

/**Frame-20,933-shaped synthetic record: a living Mule whose lifetime reaches
 * zero while it still holds an attachment, a task target and an association.
 * The arrangement is synthetic evidence, not a mission trace. */
const put = (n: (number | null)[], at: number, v: number) => {
  n[at] = v & 255;
  n[at + 1] = (v >> 8) & 255;
};
const put32 = (n: (number | null)[], at: number, v: number) => {
  put(n, at, v);
  put(n, at + 2, v >> 16);
};
const word = (n: (number | null)[], at: number) =>
  ((n[at]! | (n[at + 1]! << 8)) << 16) >> 16;
function rules(): EcologyRules {
  return {
    schemaVersion: 1,
    plants: Array.from({ length: 12 }, (_, selector) => ({
      selector,
      growthDeltas: Array(8).fill(1),
      spreadPeriod: 2,
      walkSteps: 1,
      crowdingLimit: 20,
      checkThreshold: 100,
      nutrition: 3,
      retirementDelay: 3,
    })),
    spreadDirections: Array.from({ length: 9 }, () => [0, 0] as [number, number]),
    plantResources: [],
    corpseFriction: Array(8).fill(128),
    mule: {
      selector: 4,
      baseSpeed: 704,
      lifetimeScale: 19000,
      reserveScale: 160,
      healthScale: 80,
      healthRecoveryPeriod: 20,
      warmThreshold: 25,
    },
  };
}
function tables() {
  return {
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
}
function carrierSlot(code = 67): (number | null)[] {
  const effect: (number | null)[] = Array(81).fill(0);
  effect.fill(null, 31, 39);
  effect[6] = 5;
  effect[69] = code;
  put(effect, 15, 0);
  put(effect, 7, 16384);
  put(effect, 9, 15872);
  effect[21] = 0xa0;
  effect[22] = 1;
  return effect;
}
interface Arrangement {
  state: EcologyState;
  context: MuleContext;
  rng: { seed: number; draws: number; ring: number | null };
  native: (number | null)[];
  effect: (number | null)[];
  releases: () => number;
}
/**mode"noop" leaves the source attachment bit set, which5CDB0's D71A mask
 * would preserve into mortality. */
function fixture(
  options: {
    owners?: number[];
    service?: "release" | "noop" | "absent";
    priors?: number;
  } = {},
): Arrangement {
  const owners = options.owners ?? [4],
    service = options.service ?? "release";
  const effect = carrierSlot();
  const natives = owners.map((owner, slot) => {
    const native: (number | null)[] = Array(124).fill(0);
    native.fill(null, 31, 39);
    native[6] = 1;
    native[24] = owner;
    native[94] = 8;
    native[95] = 1;
    native[96] = 0x8a;
    native[97] = 0x80;
    native[100] = 67;
    native[102] = 1;
    native[104] = 135;
    native[106] = 67;
    native[118] = 50;
    native[120] = 5;
    native[122] = 4;
    native[123] = 255;
    put(native, 15, slot);
    put(native, 7, 16384);
    put(native, 9, 15872);
    put(native, 11, 16384);
    put(native, 13, 15872);
    put(native, 21, 0x280);
    put(native, 0x2b, 50);
    put(native, 0x3b, 512);
    put32(native, 0x11, 2048);
    put32(native, 0x27, 2048);
    put(native, 0x33, 0);
    put(native, 0x35, 0);
    put(native, 0x37, 0);
    put(native, 0x3d, 0);
    put(native, 0x3f, 612);
    put(native, 0x41, 0);
    put(native, 43, 50);
    put(native, 49, 4242);
    put(native, 63, 612);
    put(native, 73, 4242);
    put(native, 77, 5);
    native[79] = 0;
    put(native, 80, 0);
    native[82] = 0;
    put(native, 85, 5);
    native[87] = 4;
    put(native, 88, 52);
    native[90] = 2;
    put(native, 91, 0);
    native[93] = 5;
    return native;
  });
  const mules: EcologyMule[] = natives.map((native, slot) => ({
    id: `source:0:${slot}`,
    index: slot,
    native,
    pending: [],
  }));
  const state: EcologyState = {
    schemaVersion: 1,
    sourceSha256: "synthetic-mortality-cleanup",
    ticks: 0,
    plantCursor: 0,
    plantCount: 0,
    ownerPlantCounts: [0, 0, 0, 0],
    plants: [],
    mules,
    otherEntities: [],
    pending: [],
    unsupported: [],
    plantOrder: {},
  };
  const terrain = terrainFromBytes(Array(229376).fill(0));
  for (let cell = 0; cell < 16384; cell++) {
    put(terrain.bytes, cell * 14 + 2, 1024);
    terrain.bytes[cell * 14 + 5] = 2;
  }
  const engine = tables();
  const rng = { seed: 5428, draws: 16855, ring: null };
  let releases = 0;
  const nope = (..._args: unknown[]): never => {
    throw new Error("Mortality cleanup used an unrelated material service");
  };
  const context: MuleContext = {
    terrain,
    tables: engine,
    rules: rules(),
    frame: 1,
    gravity: 1024,
    water: 0,
    climate: 106,
    bounce: Array(8).fill(0),
    profile: () => ({ first: 0, last: 1, holds: [0, 0], flags: 0 }),
    bonesProfile: () => ({ first: 0, last: 1, holds: [0, 0], flags: 0 }),
    obstacleAt: () => false,
    ...(options.priors === undefined
      ? {}
      : {
          creaturePriors: Array.from({ length: options.priors }, (_, i) => {
            const prior: (number | null)[] = Array(124).fill(0);
            prior[6] = 0;
            put(prior, 15, i);
            return prior;
          }),
        }),
  };
  if (service !== "absent")
    context.material = (staged, _t, _r, mule) => {
      const n = mule.native;
      const stub: MuleHaulingContext = {
        terrain,
        rng,
        tables: engine,
        queryRadius: 512,
        resolve: () => null,
        cell: () => [],
        serviceBuilding: () => null,
        storageFull: () => false,
        maximumBuildingHealth: () => 0,
        pointAccepted: () => false,
        footprintBuilding: () => null,
        target: nope,
        detach: nope,
        release: () => {
          releases++;
          if (service === "noop") return;
          //The callback-owned5CC60 body:5C920 detach, then5CCEF/5CD14 for a
          //kind1 target and5CCA0's local reset. The host supplies this, so the
          //stub only mirrors its observable effects.
          n[0x60] = n[0x60]! & 253;
          n[93] = 0;
          effect[69] = 68;
          effect[21] = effect[21]! & 223;
          const phase = n[0x5e]!,
            kind = n[0x57],
            target = word(n, 0x55);
          if (kind === 1 && [3, 5, 10].includes(phase)) {
            const peer = staged.mules.find((m) => m.index === target);
            if (!peer) throw new Error("Mortality stub target is missing");
            peer.native[0x60] = peer.native[0x60]! & 254;
          } else if (kind === 2 && [1, 7, 11].includes(phase)) {
            const plant = staged.plants[target];
            if (!plant) throw new Error("Mortality stub plant is missing");
            plant.plantFlags &= phase === 7 ? 0xfe : 0xfb;
            plant.native[46] = plant.plantFlags;
          }
          put(n, 0x60, word(n, 0x60) & 0xd71a);
          n[0x57] = 0;
          put(n, 0x6c, 0);
        },
        attach: nope,
        occupied: () => false,
        idle: nope,
        speed: () => 704,
        ignite: nope,
        unlinkPlant: nope,
        createPlantCarrier: () => null,
        audio: nope,
      };
      return stub;
    };
  if (context.material)
    context.materialRuntime = (mule) =>
      context.material!(state, terrain, rng, mule);
  return {
    state,
    context,
    rng,
    native: natives[0],
    effect,
    releases: () => releases,
  };
}
function step(f: Arrangement, index = 0) {
  return stepNeutralMule(f.state, index, f.rng, f.context);
}

describe("Mule pre-death reference cleanup", () => {
  it("admits old-age death and clears the attachment, task target and association", () => {
    const f = fixture({ owners: [4, 4] }),
      peer = f.state.mules[1].native,
      before = f.native.slice(),
      rngBefore = { ...f.rng };
    //A live kind1 association and the4D/50/55/58/5B task envelope.
    peer[0x60] = 0x08;
    peer[93] = 0;
    put(f.native, 80, 1);
    f.native[82] = 1;
    const r = step(f),
      n = f.state.mules[0].native;
    expect(r.reason, JSON.stringify(r)).toBeNull();
    expect(r.committed).toBe(true);
    expect(r.events.map((e) => e.kind)).toEqual(["mule-died"]);
    expect(n[0x5e]).toBe(24);
    expect([n[0x60]! & 2, n[0x5d], n[0x57], n[0x4f], n[0x52]]).toEqual([
      0, 0, 0, 0, 0,
    ]);
    //Stale indices stay opaque exactly as5CCA0/5CDB0 leave them.
    expect([word(n, 85), word(n, 88), word(n, 91), word(n, 77)]).toEqual([
      5, 52, 0, 5,
    ]);
    expect(f.releases()).toBe(1);
    expect(f.effect[69]).toBe(68);
    expect(f.effect[21]! & 32).toBe(0);
    expect(f.effect).toBe(f.effect);
    expect(f.rng).toEqual(rngBefore);
    //The numeric death body is unchanged: sentinel, counters and flags.
    expect([word(n, 0x6c), n[0x54], word(n, 0x3f), n[0x78], word(n, 0x66)]).toEqual(
      [32766, 0, -1, 0, 0],
    );
    expect(word(n, 0x49) & 0x400).toBe(0);
    expect([n[0x19], n[0x1c]]).toEqual([17, 1]);
    expect(before[0x5e]).toBe(8);
    expect(f.state.mules[0].native[6]).toBe(1);
  });
  it("fails closed and leaves the record untouched when the carrier binding is absent", () => {
    const f = fixture({ service: "absent" }),
      pristine = f.state.mules[0].native.slice(),
      r = step(f);
    expect(r.committed).toBe(false);
    expect(r.reason).toBe(
      "Mule attachment cleanup requires the actual carrier binding",
    );
    expect(r.events).toEqual([]);
    expect(f.state.mules[0].native).toEqual(pristine);
    expect(f.state.mules[0].native[0x5e]).toBe(8);
    expect([f.effect[69], f.releases()]).toEqual([67, 0]);
  });
  it("rejects an update whose carrier service leaves the source attachment bit set", () => {
    const f = fixture({ service: "noop" }),
      pristine = f.state.mules[0].native.slice(),
      r = step(f);
    expect(r.committed).toBe(false);
    expect(r.reason).toBe(
      "Mule mortality attachment cleanup left the source attachment bit set",
    );
    expect(r.events).toEqual([]);
    expect(f.state.mules[0].native).toEqual(pristine);
    expect(f.state.mules[0].native[0x60]).toBe(0x8a);
    expect(f.releases()).toBe(1);
    expect(f.effect[69]).toBe(67);
  });
  it("releases the kind1 reservation of a dying feeder through5CCEF/5CD14 once", () => {
    const f = fixture({ owners: [4, 4] });
    const corpseBefore = f.state.mules[1].native,
      dyingBefore = f.state.mules[0].native;
    corpseBefore[94] = 25;
    corpseBefore[96] = 0x09;
    put(corpseBefore, 15, 1);
    put(corpseBefore, 7, 16384);
    put(corpseBefore, 9, 15872);
    dyingBefore[94] = 5;
    put(dyingBefore, 80, 1);
    dyingBefore[82] = 1;
    put(dyingBefore, 85, 1);
    dyingBefore[87] = 1;
    const r = step(f),
      dying = f.state.mules[0].native,
      corpse = f.state.mules[1].native;
    expect(r.reason, JSON.stringify(r)).toBeNull();
    expect(dying[0x5e]).toBe(24);
    expect([dying[0x5d], dying[0x57], dying[0x4f], dying[0x52]]).toEqual([
      0, 0, 0, 0,
    ]);
    expect(f.releases()).toBe(1);
    //The living target's reservation is the only record the dying Mule mutates.
    expect([corpse[0x60]! & 1, corpse[0x5e]]).toEqual([0, 25]);
    expect(f.effect[69]).toBe(68);
  });
  it("lets several Mules die in one update with exactly one release each", () => {
    const f = fixture({ owners: [4, 4, 4] });
    //Same odd callback phase for all three; each holds its own carrier slot.
    f.context.frame = 0;
    for (const mule of f.state.mules) put(mule.native, 15, 1);
    f.state.mules[1].native[0x60] = 0x8a;
    f.state.mules[1].native[93] = 5;
    f.state.mules[2].native[0x60] = 0x8a;
    f.state.mules[2].native[93] = 5;
    const results = [0, 1, 2].map((index) => step(f, index));
    expect(results.map((r) => r.reason)).toEqual([null, null, null]);
    expect(f.state.mules.map((m) => m.native[0x5e])).toEqual([24, 24, 24]);
    expect(f.state.mules.map((m) => m.native[0x60]! & 2)).toEqual([0, 0, 0]);
    expect(f.state.mules.map((m) => m.native[0x5d])).toEqual([0, 0, 0]);
    expect(f.releases()).toBe(3);
    expect(results.flatMap((r) => r.events.map((e) => e.kind))).toEqual([
      "mule-died",
      "mule-died",
      "mule-died",
    ]);
  });
  it("keeps a living Mule's reference to the corpse until716F0 retirement clears it", () => {
    const f = fixture({ owners: [4, 4] }),
      livingBefore = f.state.mules[1].native;
    livingBefore[94] = 8;
    livingBefore[96] = 0x09;
    livingBefore[0x60] = 0x0f;
    put(livingBefore, 80, 0);
    livingBefore[82] = 1;
    put(livingBefore, 85, 0);
    livingBefore[87] = 1;
    put(livingBefore, 91, 0);
    livingBefore[93] = 1;
    const first = step(f);
    expect(first.reason).toBeNull();
    //Source keeps the live association while the corpse decays.
    let living = f.state.mules[1].native;
    expect([living[87], living[82], living[93], living[0x60]! & 3]).toEqual([
      1, 1, 1, 3,
    ]);
    //A near-empty reserve reaches the716F0 boundary within the source decay.
    put(f.state.mules[0].native, 0x68, 2);
    put(f.state.mules[0].native, 0x62, 0);
    for (let frame = 1; frame < 400; frame++) {
      f.context.frame = frame;
      const r = step(f, 0);
      expect(r.reason, `frame${frame}`).toBeNull();
      if (f.state.mules[0].native[6] === 0) break;
    }
    expect(f.state.mules[0].native[6]).toBe(0);
    living = f.state.mules[1].native;
    expect([living[87], living[82], living[93]]).toEqual([0, 0, 0]);
    //Only the attachment back-reference clears60bit2; the5CCEF reservation
    //bit belongs to the living record's own5CC60.
    expect(living[0x60]! & 2).toBe(0);
    expect(living[0x60]! & 1).toBe(1);
    //Retirement is not a second attachment release.
    expect(f.releases()).toBe(1);
    expect(f.state.mules[0].native[0x5e]).toBe(27);
  });
  it("nulls the associated4D and association50 kinds through the exported family", () => {
    const f = fixture({ owners: [4, 4] }),
      n = f.state.mules[0].native;
    put(n, 77, 5);
    n[79] = 4;
    put(n, 80, 1);
    n[82] = 1;
    releaseMuleMortalityReferences(f.state, f.state.mules[0], f.context);
    //Kinds are null; the source indices stay opaque.
    expect([n[79], n[82], n[87], n[93]]).toEqual([0, 0, 0, 0]);
    expect([word(n, 77), word(n, 80), word(n, 85)]).toEqual([5, 1, 5]);
    expect(f.releases()).toBe(1);
    expect(n[0x5e]).toBe(8);
  });
  it("admits death with a full retained300-slot creature pool", () => {
    const f = fixture({ priors: 300 }),
      priors = f.context.creaturePriors!,
      snapshot = priors.map((p) => p.slice()),
      r = step(f);
    expect(r.reason).toBeNull();
    expect(f.state.mules[0].native[0x5e]).toBe(24);
    expect(r.events.some((e) => e.kind === "mule-born")).toBe(false);
    expect(priors).toHaveLength(300);
    expect(priors.every((p, i) => p.every((v, at) => v === snapshot[i][at]))).toBe(
      true,
    );
    expect(f.releases()).toBe(1);
  });
});

describe("Mule mortality pool and preservation", () => {
  it("admits death with a near-full300-slot pool and leaves every other record byte-identical", () => {
    const owners = [4, ...Array(298).fill(4)];
    const f = fixture({ owners }),
      before = f.state.mules.map((m) => m.native.slice());
    const r = step(f);
    expect(r.reason, JSON.stringify(r)).toBeNull();
    expect(r.committed).toBe(true);
    expect(f.state.mules[0].native[0x5e]).toBe(24);
    for (let i = 1; i < before.length; i++)
      expect(f.state.mules[i].native, `slot${i}`).toEqual(before[i]!);
  });
  it("produces an identical cleanup for two identical worlds", () => {
    const a = fixture({ owners: [4, 4] }),
      b = fixture({ owners: [4, 4] });
    const ra = step(a),
      rb = step(b);
    expect(ra.reason).toBe(rb.reason);
    expect(a.state.mules.map((m) => m.native)).toEqual(
      b.state.mules.map((m) => m.native),
    );
    expect(ra.events).toEqual(rb.events);
  });
  it("preserves unrelated settled state outside the dying record", () => {
    const f = fixture({ owners: [4, 4] }),
      peerBefore = f.state.mules[1].native.slice(),
      otherPlants = f.state.plants.map((p) => p.native.slice());
    //A second dead-and-retired record must stay exactly as it was.
    f.state.mules[1].native[0x5e] = 27;
    f.state.mules[1].native[6] = 0;
    peerBefore[0x5e] = 27;
    peerBefore[6] = 0;
    const r = step(f);
    expect(r.reason, JSON.stringify(r)).toBeNull();
    expect(f.state.mules[1].native).toEqual(peerBefore);
    expect(f.state.plants.map((p) => p.native)).toEqual(otherPlants);
    expect(f.native[0x4f]).toBe(0);
    expect(f.native[0x52]).toBe(0);
  });
});


describe("source deferred health admission", () => {
  function deferred(frame: number, reserve: number) {
    const f = fixture();
    f.context.frame=frame;
    put(f.native,102,4096);put(f.native,104,reserve);put(f.native,106,-7);
    put(f.native,63,-1);put(f.native,73,0x220);
    put(f.native,49,0);put(f.native,108,10);
    f.native[21]=0x80;f.native[22]=2;f.native[96]=0;f.native[97]=0;
    f.native[87]=f.native[93]=0;
    return f;
  }
  it("keeps reentrant negative health until its starvation phase", () => {
    const f=deferred(3,0),r=step(f);
    expect(r.reason).toBeNull();
    expect(f.state.mules[0].native[94]).toBe(8);
    expect(word(f.state.mules[0].native,106)).toBe(-7);
  });
  it("uses the actual starvation phase to enter mortality", () => {
    const f=deferred(33,0),r=step(f);
    expect(r.reason).toBeNull();
    expect(f.state.mules[0].native[94]).toBeGreaterThanOrEqual(24);
    expect(word(f.state.mules[0].native,106)).toBe(-8);
  });
  it("permits phase-gated recovery from negative health", () => {
    const f=deferred(21,3),r=step(f);
    expect(r.reason).toBeNull();
    expect(word(f.state.mules[0].native,106)).toBe(-5);
    expect(word(f.state.mules[0].native,104)).toBe(0);
  });
  it("still rejects other negative-speed records atomically", () => {
    const f=deferred(3,0);put(f.native,63,-2);
    const before=structuredClone(f.state),rng={...f.rng};
    expect(step(f).committed).toBe(false);
    expect(f.state).toEqual(before);expect(f.rng).toEqual(rng);
  });
});

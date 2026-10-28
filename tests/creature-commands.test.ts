import { describe, it, expect } from "vitest";
import {
  releaseStagedCreatureAction,
  moveStagedCreature,
  executeStagedCreatureMove,
  targetStagedCreature,
  interactStagedCreature,
  executeCreatureCommand,
  type CreatureCommandWorld,
  type CreatureCommandContext,
} from "../src/sim/mechanics/creature-commands";
import {
  requestOwnedMuleMove,
  requestStagedOwnedMuleMove,
} from "../src/sim/mechanics/mule";
import { campaignFixture } from "./fixtures/campaign";
import { nextRandom } from "../src/sim/mechanics/random";
type N = (number | null)[];
const put = (n: N, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >>> 8) & 255;
};
const word = (n: N, p: number) => ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
function native(kind: number, index: number, size = 124): N {
  const n: N = Array(size).fill(0);
  n.fill(null, 31, 39);
  n[6] = kind;
  n[24] = 0;
  put(n, 15, index);
  put(n, 7, 1000);
  put(n, 9, 1000);
  if (kind === 1) {
    n[94] = 8;
    n[118] = 100;
    n[119] = 250;
    n[122] = 4;
    n[123] = 255;
  }
  return n;
}
interface World extends CreatureCommandWorld {
  external: Record<string, N>;
  extra: { nested: number[] }[];
}
function fixture() {
  const pack = campaignFixture(),
    n = native(1, 0),
    peer = native(1, 1),
    plant = native(2, 0, 49),
    specialist = native(3, 0, 200),
    building = native(4, 0, 67),
    service = native(4, 1, 67);
  put(building, 7, 1200);
  put(building, 9, 1400);
  put(building, 43, 100);
  building[45] = 3;
  put(service, 7, 1500);
  put(service, 9, 1700);
  const w: World = {
    creatureNative: Array.from({ length: 300 }, (_, i) =>
      i === 0 ? n : i === 1 ? peer : native(0, i),
    ),
    ecology: {
      schemaVersion: 1,
      sourceSha256: "synthetic",
      ticks: 0,
      plantCursor: 0,
      plantCount: 1,
      ownerPlantCounts: [1, 0, 0, 0, 0],
      plants: [
        {
          id: "source:1:0",
          index: 0,
          active: true,
          owner: 0,
          position: [1000, 1000],
          selector: 0,
          growth: 100,
          flags: 0,
          plantFlags: 7,
          updateCounter: 0,
          retirement: 0,
          animation: 0,
          frame: 0,
          shade: 0,
          height: 0,
          native: plant,
        },
      ],
      mules: [
        { id: "source:0:0", index: 0, native: n, pending: [] },
        { id: "source:0:1", index: 1, native: peer, pending: [] },
      ],
      otherEntities: [],
      pending: [],
      unsupported: [],
    },
    rng: { seed: 0, ring: 31, draws: 0 },
    players: [{ raw: Array(1805).fill(0) }],
    external: { "3:0": specialist, "4:0": building, "4:1": service },
    extra: [{ nested: [12] }],
  };
  plant[46] = 7;
  const c: CreatureCommandContext<World> = {
    rules: {
      ...pack.ecologyRules!,
      mule: { ...pack.ecologyRules!.mule, baseSpeed: 600 },
    },
    tables: pack.rules!.tables,
    speciesComponents: [
      [0, 0],
      [1, 0],
      [2, 2],
      [3, 0],
      [4, 4],
    ],
    resolve: (s, r) => s.external[`${r.kind}:${r.index}`] ?? null,
    requestedSpeed: () => 700,
    occupied: () => false,
    collisionBuilding: () => null,
    footprintBuilding: () => 0,
    corpseDepositOffset: [256, 256],
    buildingHalfWidth: () => 128,
    buildingMaximumHealth: () => 1000,
    findServiceBuilding: () => 1,
  };
  return { w, c, n, peer, plant, specialist, building, service };
}
describe("concrete in-place creature commands", () => {
  it("uses exact81C60 admission and selected-caller feedback without adding ownership to the source body", () => {
    const f = fixture();
    f.n[24] = 1;
    const r = executeStagedCreatureMove(f.w, 0, [-32768, 32767], f.c, {
      callerOwner: 0,
      selectedPlayer: 0,
      selectedPanelRefresh: true,
    });
    expect(r.accepted).toBe(true);
    expect(r.feedback).toEqual({
      owner: 0,
      cue: 73,
      mode: 2,
      parameter: 0,
      volume: 127,
      ratePercent: 101,
      range: 64,
    });
    expect(word(f.n, 110)).toBe(-32768);
    expect(word(f.n, 114)).toBe(-32768);
    expect(f.n[120]).toBe(7);
    expect(f.n[94]).toBe(0);
    expect(f.w.rng.draws).toBe(0);
  });
  it.each([15, 18, 24])(
    "ignores protected/cold/stunned state%d before feedback or writes",
    (state) => {
      const f = fixture();
      f.n[94] = state;
      const before = structuredClone(f.w);
      expect(
        executeStagedCreatureMove(f.w, 0, [1, 2], f.c, {
          callerOwner: 0,
          selectedPlayer: 0,
          selectedPanelRefresh: false,
        }).accepted,
      ).toBe(false);
      expect(f.w).toEqual(before);
    },
  );
  it("does not synthesize selected-owner sound and retains neutral task bytes", () => {
    const f = fixture();
    f.n[24] = 4;
    f.n[120] = 22;
    f.n[97] = 64;
    const r = executeStagedCreatureMove(f.w, 0, [2, 3], f.c, {
      callerOwner: 1,
      selectedPlayer: 0,
      selectedPanelRefresh: false,
    });
    expect(r.feedback).toBeUndefined();
    expect(f.n[120]).toBe(22);
    expect(f.n[97]).toBe(192);
    expect(f.n[96]! & 16).toBe(0);
  });
  it("preserves the state2 attachment instead of releasing it during movement", () => {
    const f = fixture();
    f.n[94] = 2;
    f.n[96] = 2;
    f.n[93] = 3;
    moveStagedCreature(f.w, 0, [2, 3], f.c);
    expect(f.n[94]).toBe(2);
    expect(f.n[96]! & 3).toBe(3);
    expect(f.n[93]).toBe(3);
    expect(word(f.n, 63)).toBe(600);
    expect(word(f.n, 108)).toBe(32767);
    expect([word(f.n, 11), word(f.n, 13)]).toEqual([2, 3]);
  });
  it.each([1, 7, 11])(
    "releases state%d plant reservation from actualnative and normalized mirror",
    (state) => {
      const f = fixture();
      f.n[94] = state;
      f.n[87] = 2;
      put(f.n, 85, 0);
      f.n[21] = 255;
      f.n[96] = 255 & ~2;
      f.n[97] = 255;
      put(f.n, 51, 123);
      put(f.n, 53, 234);
      releaseStagedCreatureAction(f.w, 0, f.c);
      expect(f.plant[46]).toBe(state === 7 ? 6 : 3);
      expect(f.w.ecology.plants[0].plantFlags).toBe(f.plant[46]);
      expect(word(f.n, 51)).toBe(0);
      expect(word(f.n, 53)).toBe(0);
      expect(f.n[87]).toBe(0);
      expect(f.n[93]).toBe(0);
      expect(word(f.n, 108)).toBe(0);
      expect(f.n[21]! & 32).toBe(0);
    },
  );
  it.each([3, 5, 10])(
    "clears only the exact paired reference for state%d",
    (state) => {
      const f = fixture();
      f.n[94] = state;
      f.n[87] = 1;
      put(f.n, 85, 1);
      f.peer[87] = 1;
      f.peer[96] = 255;
      releaseStagedCreatureAction(f.w, 0, f.c);
      expect(f.peer[87]).toBe(state === 5 ? 1 : 0);
      expect(f.peer[96]).toBe(state === 5 ? 254 : 255);
    },
  );
  it("stun release returns before carrier or reference services", () => {
    const f = fixture();
    f.n[94] = 18;
    f.n[96] = 2;
    f.n[93] = 5;
    const before = f.n.slice();
    expect(releaseStagedCreatureAction(f.w, 0, f.c).accepted).toBe(false);
    expect(f.n).toEqual(before);
  });
  it("detaches an actual specialist in place and releases a living creature with one delay draw", () => {
    const f = fixture();
    f.n[96] = 2;
    f.n[93] = 3;
    put(f.n, 91, 0);
    f.specialist[74] = 255;
    f.specialist[21] = 255;
    releaseStagedCreatureAction(f.w, 0, f.c);
    expect(f.specialist[85]).toBe(1);
    expect(f.specialist[74]).toBe(59);
    expect(f.specialist[21]).toBe(223);
    f.n[96] = 2;
    f.n[93] = 1;
    put(f.n, 91, 1);
    releaseStagedCreatureAction(f.w, 0, f.c);
    expect(f.peer[94]).toBe(8);
    expect(word(f.peer, 108)).toBe(5);
    expect(f.w.rng.draws).toBe(1);
  });
  it("draws delay before the two occupied-carrier escape draws and keeps native aliases", () => {
    const f = fixture();
    f.n[96] = 2;
    f.n[93] = 1;
    put(f.n, 91, 1);
    const root = f.w.creatureNative,
      p = f.peer;
    releaseStagedCreatureAction(f.w, 0, { ...f.c, occupied: () => true });
    expect(f.w.rng.draws).toBe(3);
    expect(word(f.peer, 108)).toBe(32767);
    expect(f.w.creatureNative).toBe(root);
    expect(f.w.creatureNative[1]).toBe(p);
  });
  it("marks source corpse unload only at the exact74160 store anchor", () => {
    const f = fixture();
    f.n[96] = 2;
    f.n[93] = 1;
    put(f.n, 91, 1);
    f.peer[94] = 24;
    f.building[45] = 4;
    put(f.building, 7, 1024);
    put(f.building, 9, 1024);
    put(f.peer, 7, 1281);
    put(f.peer, 9, 1300);
    releaseStagedCreatureAction(f.w, 0, f.c);
    expect(f.peer[96]! & 32).toBe(32);
    expect(f.w.rng.draws).toBe(0);
  });
  it("requires real effect36 attachment retention and handles source67 conversion concretely", () => {
    const f = fixture(),
      effect = native(5, 0, 81);
    f.w.external["5:0"] = effect;
    f.n[96] = 2;
    f.n[93] = 5;
    put(f.n, 91, 0);
    effect[69] = 36;
    releaseStagedCreatureAction(f.w, 0, f.c);
    expect(f.n[96]! & 2).toBe(2);
    expect(f.n[93]).toBe(5);
    f.n[94] = 24;
    expect(() =>
      executeCreatureCommand(f.w, 0, { type: "release" }, f.c),
    ).toThrow("effect36");
    releaseStagedCreatureAction(f.w, 0, {
      ...f.c,
      retireCarrierEffect36: (w) => {
        w.external["5:0"][6] = 0;
      },
    });
    expect(effect[6]).toBe(0);
    expect(f.n[93]).toBe(0);
    effect[6] = 5;
    f.n[94] = 8;
    f.n[96] = 2;
    f.n[93] = 5;
    effect[69] = 67;
    effect[21] = 255;
    releaseStagedCreatureAction(f.w, 0, f.c);
    expect(effect[69]).toBe(68);
    expect(effect[21]).toBe(223);
    expect(f.n[93]).toBe(0);
  });
  it("stages real plant work without inventing its later action state", () => {
    const f = fixture();
    f.n[120] = 7;
    const r = targetStagedCreature(f.w, 0, { kind: 2, index: 0 }, f.c);
    expect(r.accepted).toBe(true);
    expect(f.n[94]).toBe(8);
    expect(f.n[95]).toBe(1);
    expect(f.n[87]).toBe(2);
    expect(f.n[90]).toBe(2);
    expect(f.plant[46]! & 4).toBe(4);
    expect(word(f.n, 63)).toBe(600);
    expect(f.n[96]! & 64).toBe(64);
  });
  it("distinguishes living creature rejection from corpse/walk-through target91 movement", () => {
    const f = fixture();
    expect(
      targetStagedCreature(f.w, 0, { kind: 1, index: 1 }, f.c).accepted,
    ).toBe(false);
    f.peer[94] = 24;
    expect(
      targetStagedCreature(f.w, 0, { kind: 1, index: 1 }, f.c).accepted,
    ).toBe(true);
    expect(f.n[93]).toBe(1);
    expect(word(f.n, 91)).toBe(1);
    f.plant[46] = 8;
    targetStagedCreature(f.w, 0, { kind: 2, index: 0 }, f.c);
    expect(f.n[93]).toBe(2);
    expect(f.plant[46]).toBe(8);
  });
  it("requires serialized source scratch for other accepted uninitialized-gene branches", () => {
    const f = fixture(),
      before = structuredClone(f.w);
    expect(() =>
      executeCreatureCommand(
        f.w,
        0,
        { type: "target", target: { kind: 4, index: 0 } },
        f.c,
      ),
    ).toThrow("serialized5D870");
    expect(f.w).toEqual(before);
    f.w.creatureCommandScratch = {
      0: { value: 77, provenance: "synthetic caller stack" },
    };
    const r = targetStagedCreature(f.w, 0, { kind: 4, index: 0 }, f.c);
    expect(r.accepted).toBe(true);
    expect(f.n[95]).toBe(77);
    expect(r.sourceScratch95).toEqual(f.w.creatureCommandScratch[0]);
    f.n[122] = 1;
    f.building[49] = 1;
    put(f.building, 43, 1000);
    expect(targetStagedCreature(f.w, 0, { kind: 4, index: 0 }, f.c).accepted).toBe(false);
    expect(f.n[95]).toBe(77);
  });
  it.each([1000,1001])("rejects no-action Crab repairs at health%i without copying undefined scratch", health => {
    const f=fixture();f.n[122]=1;f.n[95]=222;f.n[97]=2;
    f.building[49]=1;put(f.building,43,health);
    const before=structuredClone(f.w), n=f.n;
    const result=targetStagedCreature(f.w,0,{kind:4,index:0},f.c);
    expect(result.accepted).toBe(false);
    expect(result.sourceScratch95).toBeUndefined();
    expect(f.w).toEqual(before);
    expect(f.w.creatureNative[0]).toBe(n);
  });
  it("implements gene1 direct and43130 service-building selection as actualpending2 commands", () => {
    const f = fixture();
    f.n[122] = 1;
    f.building[45] = 2;
    f.building[54] = 1;
    targetStagedCreature(f.w, 0, { kind: 4, index: 0 }, f.c);
    expect(f.n[95]).toBe(2);
    expect(f.n[79]).toBe(4);
    expect(word(f.n, 77)).toBe(0);
    f.building[45] = 3;
    f.building[54] = 0;
    targetStagedCreature(f.w, 0, { kind: 4, index: 0 }, f.c);
    expect(word(f.n, 77)).toBe(1);
    expect(word(f.n, 91)).toBe(1);
    expect([word(f.n, 11), word(f.n, 13)]).toEqual([1500, 1700]);
    expect(f.n[97]! & 8).toBe(8);
  });
  it("executes5B580 creature/specialist/plant branches with exactassociation and force flags", () => {
    for (const kind of [1, 2, 3] as const) {
      const f = fixture();
      f.n[120] = 7;
      const index = kind === 1 ? 1 : 0;
      const r = interactStagedCreature(f.w, 0, { kind, index }, true, f.c);
      expect(r.accepted).toBe(true);
      expect(f.n[94]).toBe(1);
      expect(f.n[87]).toBe(kind);
      expect(f.n[90]).toBe(kind);
      expect(f.n[82]).toBe(kind === 2 ? 0 : kind);
      expect(f.n[96]! & 32).toBe(kind === 2 ? 32 : 0);
    }
  });
  it("handles building overlap and null/protected-target fallback with exact2draw escape", () => {
    const f = fixture();
    expect(
      interactStagedCreature(f.w, 0, { kind: 4, index: 0 }, false, {
        ...f.c,
        collisionBuilding: () => 0,
      }).accepted,
    ).toBe(false);
    expect(f.n[94]).toBe(8);
    expect(f.w.rng.draws).toBe(2);
    const g = fixture();
    interactStagedCreature(g.w, 0, null, false, g.c);
    expect(word(g.n, 108)).toBe(3);
    expect(g.w.rng.draws).toBe(0);
    put(g.peer, 73, 1024);
    expect(
      interactStagedCreature(g.w, 0, { kind: 1, index: 1 }, false, g.c)
        .accepted,
    ).toBe(false);
  });
  it("preserves live staged native/player identities and rejects service pointer replacement atomically", () => {
    const f = fixture(),
      root = f.w.creatureNative,
      n = f.n,
      raw = f.w.players![0].raw;
    executeStagedCreatureMove(f.w, 0, [5, 6], f.c, {
      callerOwner: 0,
      selectedPlayer: 0,
      selectedPanelRefresh: false,
    });
    expect(f.w.creatureNative).toBe(root);
    expect(f.w.creatureNative[0]).toBe(n);
    expect(f.w.ecology.mules[0].native).toBe(n);
    expect(f.w.players![0].raw).toBe(raw);
    const before = structuredClone(f.w);
    expect(() =>
      executeCreatureCommand(
        f.w,
        0,
        { type: "interact", target: { kind: 4, index: 0 }, force: false },
        {
          ...f.c,
          collisionBuilding: (s) => {
            s.creatureNative[0] = s.creatureNative[0].slice();
            s.extra[0].nested.push(99);
            return null;
          },
        },
      ),
    ).toThrow("replaced retained");
    expect(f.w).toEqual(before);
  });
  it("preserves source scratch and all mutable host additions across atomic rollback and JSON continuation", () => {
    const f = fixture();
    f.w.creatureCommandScratch = {
      0: { value: 31, provenance: "synthetic caller" },
    };
    executeCreatureCommand(
      f.w,
      0,
      { type: "target", target: { kind: 4, index: 0 } },
      f.c,
    );
    const restored = JSON.parse(JSON.stringify(f.w)) as World;
    for (const w of [f.w, restored])
      executeCreatureCommand(
        w,
        0,
        {
          type: "move",
          point: [7, 8],
          callerOwner: 0,
          selectedPlayer: 0,
          selectedPanelRefresh: false,
        },
        f.c,
      );
    expect(JSON.parse(JSON.stringify(f.w))).toEqual(restored);
    const before = structuredClone(f.w);
    expect(() =>
      executeCreatureCommand(
        f.w,
        0,
        { type: "interact", target: null, force: false },
        {
          ...f.c,
          occupied: (s) => {
            s.extra[0].nested.push(5);
            s.creatureCommandScratch![0].value = 99;
            throw Error("late actualservice");
          },
        },
      ),
    ).toThrow("late actualservice");
    expect(f.w).toEqual(before);
  });
  it("keeps the existing owned move wrapper compatible while its staged entry retains ecology aliases", () => {
    const f = fixture(),
      context = {
        callerOwner: 0,
        callerIsSelected: true,
        selectedPanelRefresh: true,
      },
      m = f.w.ecology.mules[0],
      root = f.w.ecology.mules;
    expect(
      requestStagedOwnedMuleMove(f.w.ecology, 0, [5, 6], context).outcome,
    ).toBe("installed");
    expect(f.w.ecology.mules).toBe(root);
    expect(f.w.ecology.mules[0]).toBe(m);
    expect(m.native).toBe(f.n);
    const before = structuredClone(f.w.ecology);
    expect(
      requestOwnedMuleMove(f.w.ecology, 0, [7, 8], {
        ...context,
        callerOwner: 1,
      }).outcome,
    ).toBe("rejected");
    expect(f.w.ecology).toEqual(before);
    const old = f.w.ecology.mules;
    expect(requestOwnedMuleMove(f.w.ecology, 0, [7, 8], context).outcome).toBe(
      "installed",
    );
    expect(f.w.ecology.mules).not.toBe(old);
  });
  it("rejects invalid references, unknown speed bytes and malformed geometry results without committing partial cleanup", () => {
    const f = fixture(),
      before = structuredClone(f.w);
    expect(() =>
      executeCreatureCommand(
        f.w,
        0,
        { type: "target", target: { kind: 1, index: 300 } },
        f.c,
      ),
    ).toThrow("reference");
    expect(() =>
      executeCreatureCommand(
        f.w,
        0,
        {
          type: "move",
          point: [40000, 0],
          callerOwner: 0,
          selectedPlayer: 0,
          selectedPanelRefresh: false,
        },
        f.c,
      ),
    ).toThrow("point");
    expect(() =>
      executeCreatureCommand(
        f.w,
        0,
        { type: "interact", target: { kind: 4, index: 0 }, force: false },
        { ...f.c, collisionBuilding: () => undefined as never },
      ),
    ).toThrow("74270 building index");
    expect(f.w).toEqual(before);
    f.n[118] = null;
    const unknown = structuredClone(f.w);
    expect(() =>
      executeCreatureCommand(
        f.w,
        0,
        { type: "target", target: { kind: 2, index: 0 } },
        f.c,
      ),
    ).toThrow("byte 118");
    expect(f.w).toEqual(unknown);
  });
  it("refuses unequal preserved native mirrors instead of discarding saved bytes during alias restoration", () => {
    const f = fixture(),
      restored = JSON.parse(JSON.stringify(f.w)) as World;
    restored.ecology.mules[0].native[100] = 3;
    const before = JSON.stringify(restored);
    expect(() =>
      executeCreatureCommand(restored, 0, { type: "release" }, f.c),
    ).toThrow("pool and ecology mirror differ");
    expect(JSON.stringify(restored)).toBe(before);
  });
});

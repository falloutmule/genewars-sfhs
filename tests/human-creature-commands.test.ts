import { describe, expect, it } from "vitest";
import {
  classifyHumanCreatureTarget,
  executeHumanCreatureCommand,
  issueStagedHumanCreatureTarget,
  stopStagedHumanCreature,
  type HumanCreatureClassifierContext,
  type HumanCreatureCommandContext,
} from "../src/sim/mechanics/human-creature-commands";
import type {
  CreatureCommandContext,
  CreatureCommandWorld,
} from "../src/sim/mechanics/creature-commands";
import { campaignFixture } from "./fixtures/campaign";
type N = (number | null)[];
const put = (n: N, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >>> 8) & 255;
};
const word = (n: N, p: number) => ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
function native(kind: number, index: number, length = 124): N {
  const n: N = Array(length).fill(0);
  n.fill(null, 31, 39);
  n[6] = kind;
  put(n, 15, index);
  put(n, 7, 1000);
  put(n, 9, 1400);
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
  visible: number;
  log: unknown[];
  nested: number[][];
}
function fixture() {
  const pack = campaignFixture(),
    n = native(1, 0),
    peer = native(1, 1),
    plant = native(2, 1, 49),
    specialist = native(3, 1, 200),
    building = native(4, 1, 67);
  put(peer, 7, -32000);
  put(peer, 9, 32767);
  peer[24] = 1;
  put(plant, 44, 100);
  plant[46] = 7;
  put(building, 43, 100);
  building[45] = 4;
  const w: World = {
    creatureNative: [n, peer],
    ecology: {
      schemaVersion: 1,
      sourceSha256: "synthetic",
      ticks: 0,
      plantCursor: 0,
      plantCount: 1,
      ownerPlantCounts: [1, 0, 0, 0, 0],
      plants: [
        {
          id: "source:1:1",
          index: 1,
          active: true,
          owner: 0,
          position: [1000, 1400],
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
      mules: [{ id: "source:0:0", index: 0, native: n, pending: [] }],
      otherEntities: [],
      pending: [],
      unsupported: [],
    },
    players: Array.from({ length: 5 }, () => ({ raw: Array(1805).fill(0) })),
    rng: { seed: 0, ring: 31, draws: 0 },
    visible: 1,
    log: [],
    nested: [[9]],
    external: { "3:1": specialist, "4:1": building },
  };
  const genes: [number, number][] = Array.from({ length: 25 }, (_, i) => [
    i,
    i,
  ]);
  w.ecology.plants.unshift({
    ...w.ecology.plants[0],
    id: "source:1:0",
    index: 0,
    active: false,
    native: native(0, 0, 49),
  });
  const resolve = (s: World, r: { kind: number; index: number }) =>
    r.kind === 1
      ? (s.creatureNative[r.index] ?? null)
      : r.kind === 2
        ? (s.ecology.plants[r.index]?.native ?? null)
        : (s.external[`${r.kind}:${r.index}`] ?? null);
  const c: CreatureCommandContext<World> = {
    rules: {
      ...pack.ecologyRules!,
      mule: { ...pack.ecologyRules!.mule, baseSpeed: 600 },
    },
    tables: pack.rules!.tables,
    speciesComponents: genes,
    resolve,
    requestedSpeed: () => 600,
    occupied: () => false,
    collisionBuilding: () => null,
    footprintBuilding: () => null,
    buildingMaximumHealth: () => 100,
    findServiceBuilding: () => null,
  };
  const common = {
    components: (_s: World, species: number) => genes[species],
    resolve,
  };
  const classifier: HumanCreatureClassifierContext<World> = {
    ...common,
    visibility: (s) => s.visible,
    buildingMaximumHealth: () => 100,
    virtual68: (_s, _r, t) => t[130] === 255,
  };
  const command: HumanCreatureCommandContext<World> = {
    ...common,
    commands: () => c,
    onFeedback: (s, feedback) =>
      s.log.push({ feedback, anchor: word(s.creatureNative[0], 110) }),
  };
  const classify = (
    kind: 1 | 2 | 3 | 4 | 5,
    force = false,
    bypassVisibility = false,
  ) =>
    classifyHumanCreatureTarget(
      w,
      0,
      { kind, index: 1 },
      { force, bypassVisibility },
      classifier,
    );
  const issue = (mode: number, kind: 1 | 2 | 3 | 4 | 5 = 1) =>
    issueStagedHumanCreatureTarget(
      w,
      0,
      { target: { kind, index: 1 }, mode, callerOwner: 0, selectedPlayer: 0 },
      command,
    );
  return {
    w,
    n,
    peer,
    plant,
    specialist,
    building,
    genes,
    c,
    classifier,
    command,
    classify,
    issue,
  };
}
describe("human6A760 target classifier", () => {
  it.each([1,3,11,22])("installs admitted species%i attacks through the real5B580 body",species=>{
    for(const kind of [1,3,4] as const)for(const mode of [1,2]){
      const f=fixture();f.n[122]=species;f.genes[species]=species===1?[1,1]:species===3?[3,3]:species===11?[1,4]:[4,1];
      f.building[24]=1;
      const out=f.issue(mode,kind);
      expect(out.disposition).toBe('installed');expect(f.n[120]).toBe(mode);
      expect([word(f.n,85),f.n[87]]).toEqual([1,kind]);expect(f.n[94]).toBe(1);
      expect(f.n[97]!&128).toBe(128);expect(out.feedback?.cue).toBe(species===22?73:species===3?72:70);
    }
  });
  it.each([0,2,10,14,19,24])("keeps species%i action families outside the combat admission",species=>{
    const f=fixture();f.n[122]=species;const before=structuredClone(f.w);
    expect(()=>executeHumanCreatureCommand(f.w,0,{type:'target',target:{kind:1,index:1},mode:1,callerOwner:0,selectedPlayer:0},f.command)).toThrow(/concrete action/);
    expect(f.w).toEqual(before);
  });
  it("does not admit Crab material work through its attack gate",()=>{
    const f=fixture();f.n[122]=1;
    expect(()=>f.issue(5,2)).toThrow(/concrete action/);
  });
  it.each([1,2])("resumes Crab combat mode%i with its retained plant reference",mode=>{
    const f=fixture();f.n[122]=1;f.genes[1]=[1,1];
    const out=f.issue(mode,2);
    expect(out.disposition).toBe('installed');
    expect([f.n[120],word(f.n,85),f.n[87],word(f.n,88),f.n[90]]).toEqual([mode,1,2,1,2]);
    expect(f.n[94]).toBe(1);
    expect(f.n[96]!&32).toBe(mode===2?32:0);
  });
  it("honors dead/visibility/self gates before requiring component profiles and is read-only", () => {
    const f = fixture(),
      before = JSON.stringify(f.w);
    expect(f.classify(1)).toBe(1);
    expect(JSON.stringify(f.w)).toBe(before);
    f.classifier.components = () => {
      throw Error("missing components");
    };
    f.n[94] = 24;
    expect(f.classify(1)).toBe(0);
    f.n[94] = 8;
    f.w.visible = 0;
    expect(f.classify(1)).toBe(0);
    expect(() => f.classify(1, false, true)).toThrow("missing components");
    expect(
      classifyHumanCreatureTarget(
        f.w,
        0,
        { kind: 1, index: 0 },
        { force: false, bypassVisibility: true },
        f.classifier,
      ),
    ).toBe(0);
  });
  it("uses directed alliances, force and completed Recycling count for living/corpse targets", () => {
    const f = fixture();
    expect(f.classify(1)).toBe(1);
    f.w.players![0].raw[0x6e5] = 2;
    expect(f.classify(1)).toBe(0);
    expect(f.classify(1, true)).toBe(1);
    f.peer[94] = 24;
    expect(f.classify(1, true)).toBe(0);
    f.w.players![0].raw[0x604] = 1;
    expect(f.classify(1)).toBe(4);
    expect(f.classify(4)).toBe(0); //Healthy friendly Recycling is no remote haul command.
  });
  it("classifies cut/uncut plant material and component1 repair/upgrade with lazy health", () => {
    const f = fixture();
    expect(f.classify(2)).toBe(5);
    f.plant[46] = f.plant[46]! | 8;
    expect(f.classify(2)).toBe(4);
    f.n[122] = 1;
    expect(f.classify(2)).toBe(0);
    f.plant[46] = f.plant[46]! & ~8;
    expect(f.classify(2)).toBe(5);
    put(f.building, 43, 99);
    expect(f.classify(4)).toBe(6);
    f.building[47] = 1;
    put(f.building, 49, 0x400);
    f.classifier.buildingMaximumHealth = () => {
      throw Error("must remain lazy");
    };
    expect(f.classify(4)).toBe(6);
    f.building[24] = 1;
    expect(f.classify(4)).toBe(1);
  });
  it("uses owner research, explicit research flag and neutral quality for component0", () => {
    const f = fixture();
    f.n[122] = 0;
    expect(f.classify(2)).toBe(0);
    f.w.players![0].raw[0x6c7] = 1;
    expect(f.classify(2)).toBe(2);
    f.w.players![0].raw[0x6c7] = 0;
    f.n[97] = 4;
    expect(f.classify(2)).toBe(2);
    f.n[24] = 4;
    f.n[118] = 90;
    expect(f.classify(2)).toBe(0);
    f.n[118] = 91;
    expect(f.classify(2)).toBe(2);
    f.plant[46] = f.plant[46]! | 8;
    expect(f.classify(2)).toBe(0);
  });
  it("classifies species14 transport with real specialist/creature gates without claiming its action body", () => {
    const f = fixture();
    f.n[122] = 14;
    f.peer[24] = 0;
    expect(f.classify(1)).toBe(3);
    f.peer[122] = 3;
    expect(f.classify(1)).toBe(0);
    f.peer[94] = 15;
    expect(f.classify(1)).toBe(3);
    expect(f.classify(3)).toBe(3);
    f.specialist[85] = 2;
    expect(f.classify(3)).toBe(0);
    f.specialist[85] = 1;
    f.specialist[130] = 1;
    expect(f.classify(3)).toBe(0);
    expect(() => f.issue(3)).toThrow("Mule4");
  });
  it("requires an actual virtual68 for hostile extra families and excludes kind8", () => {
    const f = fixture(),
      other = native(5, 1, 81);
    other[24] = 1;
    f.w.external["5:1"] = other;
    delete f.classifier.virtual68;
    expect(() => f.classify(5)).toThrow("virtual68");
    other[6] = 8;
    expect(f.classify(5)).toBe(0);
  });
  it("retains the pool's virtual68 after byte6 is cleared on a stale building", () => {
    const f = fixture();
    f.building[6] = 0;
    f.building[24] = 1;
    expect(f.classify(4)).toBe(1);
    put(f.building, 43, 0);
    expect(f.classify(4)).toBe(0);
  });
});
describe("source human target/stop packets", () => {
  it.each([1, 11, 22])("stops species %i through common82230/5CC60 cleanup", (species) => {
    for (const state of [3, 7, 8, 18]) {
      const f = fixture();
      f.n[122] = species;
      f.n[94] = state;
      f.n[120] = 7;
      f.n[96] = 16;
      put(f.n, 108, 32767);
      if (state === 3) {
        f.n[87] = 1;
        put(f.n, 85, 1);
        f.peer[87] = 1;
      } else if (state === 7) {
        f.n[87] = 2;
        put(f.n, 85, 1);
      }
      const out = stopStagedHumanCreature(f.w, 0,
        {argument: 0, selectedPlayer: 0, selectedPanelRefresh: true}, f.command);
      expect(out.disposition).toBe("stopped");
      expect(f.n[120]).toBe(0);
      expect(f.n[96]! & 16).toBe(0);
      expect(f.n[94]).toBe(state);
      expect(word(f.n, 108)).toBe(state === 18 ? 32767 : 0);
      if (state === 3) expect(f.peer[87]).toBe(0);
      if (state === 7) expect(f.plant[46]! & 1).toBe(0);
    }
  });
  it.each([15, 18, 24])(
    "leaves blocked state%s unchanged without resolving resources",
    (state) => {
      const f = fixture();
      f.n[94] = state;
      const before = JSON.stringify(f.w);
      f.command.resolve = () => {
        throw Error("must remain lazy");
      };
      expect(f.issue(1).disposition).toBe("blocked");
      expect(JSON.stringify(f.w)).toBe(before);
    },
  );
  it("clears task/bit16 for a missing target without requiring action profiles", () => {
    const f = fixture();
    f.n[96] = 255;
    f.n[120] = 6;
    f.command.commands = () => {
      throw Error("must remain lazy");
    };
    const out = issueStagedHumanCreatureTarget(
      f.w,
      0,
      { target: null, mode: 3, callerOwner: 0, selectedPlayer: 0 },
      f.command,
    );
    expect(out.disposition).toBe("missing-target");
    expect(f.n[120]).toBe(0);
    expect(f.n[96]).toBe(239);
    expect(f.w.log).toEqual([]);
  });
  it("installs mode1 and emits selected-caller feedback before anchor writes, without an owner gate", () => {
    const f = fixture();
    f.n[24] = 1;
    f.n[97] = 64;
    const held = f.n,
      out = f.issue(1);
    expect(out.accepted).toBe(true);
    expect(f.n).toBe(held);
    expect(f.n[120]).toBe(1);
    expect(f.n[97]! & 192).toBe(128);
    expect(word(f.n, 110)).toBe(-32000);
    expect(word(f.n, 112)).toBe(32767);
    expect(word(f.n, 114)).toBe(-32000);
    expect(f.w.log).toEqual([{ feedback: out.feedback, anchor: 0 }]);
    expect(out.feedback?.cue).toBe(73);
    expect(out.feedback?.ratePercent).toBe(101);
  });
  it("keeps mode1 rejection cleanup while mode2 false interaction still installs anchors/feedback", () => {
    const a = fixture();
    a.peer[73] = 0;
    put(a.peer, 73, 1024);
    a.n[96] = 16;
    a.n[120] = 7;
    const one = a.issue(1);
    expect(one.disposition).toBe("rejected");
    expect(a.n[120]).toBe(0);
    expect(a.n[96]! & 16).toBe(0);
    expect(word(a.n, 110)).toBe(0);
    expect(a.w.log).toEqual([]);
    const b = fixture();
    put(b.peer, 73, 1024);
    const two = b.issue(2);
    expect(two.disposition).toBe("installed");
    expect(b.n[120]).toBe(2);
    expect(word(b.n, 110)).toBe(-32000);
    expect(b.w.log).toEqual([{ feedback: two.feedback, anchor: -32000 }]);
  });
  it("uses5D870 pending material action without changing later work state and commits false afterimages", () => {
    const f = fixture();
    f.n[97] = 64;
    f.plant[46] = 3;
    const out = f.issue(5, 2);
    expect(out.accepted).toBe(true);
    expect(f.n[95]).toBe(1);
    expect(f.n[94]).toBe(8);
    expect(f.n[120]).toBe(5);
    expect(f.n[97]! & 192).toBe(128);
    expect(f.plant[46]).toBe(7);
    const no = fixture();
    no.n[120] = 7;
    const result = executeHumanCreatureCommand(
      no.w,
      0,
      {
        type: "target",
        callerOwner: 0,
        selectedPlayer: 0,
        target: { kind: 3, index: 1 },
        mode: 4,
      },
      no.command,
    );
    expect(result.disposition).toBe("rejected");
    expect(no.w.creatureNative[0][120]).toBe(7);
  });
  it("rejects mode3 and rolls back all roots on a late feedback failure", () => {
    const f = fixture();
    expect(() => f.issue(3)).toThrow("5D0E0");
    const before = JSON.stringify(f.w);
    f.command.onFeedback = (s) => {
      s.nested[0].push(10);
      throw Error("audio unavailable");
    };
    expect(() =>
      executeHumanCreatureCommand(
        f.w,
        0,
        {
          type: "target",
          callerOwner: 0,
          selectedPlayer: 0,
          target: { kind: 2, index: 1 },
          mode: 5,
        },
        f.command,
      ),
    ).toThrow("audio unavailable");
    expect(JSON.stringify(f.w)).toBe(before);
  });
  it("rejects feedback services that replace a retained target and rolls back the complete host", () => {
    const f = fixture(),
      before = JSON.stringify(f.w);
    f.command.onFeedback = (s) => {
      s.creatureNative[1] = s.creatureNative[1].slice();
      s.players![0].raw[0] = 23;
    };
    expect(() =>
      executeHumanCreatureCommand(
        f.w,
        0,
        {
          type: "target",
          callerOwner: 0,
          selectedPlayer: 0,
          target: { kind: 1, index: 1 },
          mode: 1,
        },
        f.command,
      ),
    ).toThrow("retained native/player identity");
    expect(JSON.stringify(f.w)).toBe(before);
  });
  it("uses82230 cleanup even for stunned actors and never replaces anchors with current position", () => {
    const f = fixture();
    f.n[94] = 18;
    f.n[120] = 5;
    f.n[96] = 255;
    put(f.n, 110, -1234);
    put(f.n, 114, 5432);
    const out = stopStagedHumanCreature(
      f.w,
      0,
      { argument: 0, selectedPlayer: 0, selectedPanelRefresh: true },
      f.command,
    );
    expect(out.disposition).toBe("stopped");
    expect(out.panelRefreshRequested).toBe(true);
    expect(f.n[94]).toBe(18);
    expect(f.n[120]).toBe(0);
    expect(f.n[96]).toBe(239);
    expect(word(f.n, 110)).toBe(-1234);
    expect(word(f.n, 114)).toBe(5432);
    expect(f.w.log).toEqual([]);
  });
  it("stop with zero task or nonzero argument is inert, and JSON continuation rebinds aliases", () => {
    const f = fixture();
    f.command.commands = () => {
      throw Error("must remain lazy");
    };
    expect(
      stopStagedHumanCreature(
        f.w,
        0,
        { argument: 0, selectedPlayer: 0, selectedPanelRefresh: true },
        f.command,
      ).disposition,
    ).toBe("unchanged");
    f.n[120] = 5;
    expect(
      stopStagedHumanCreature(
        f.w,
        0,
        { argument: 1, selectedPlayer: 0, selectedPanelRefresh: true },
        f.command,
      ).disposition,
    ).toBe("unchanged");
    const a = fixture(),
      b: World = JSON.parse(JSON.stringify(a.w));
    const packet = {
      type: "target" as const,
      callerOwner: 0,
      selectedPlayer: 0,
      target: { kind: 2 as const, index: 1 },
      mode: 5,
    };
    executeHumanCreatureCommand(a.w, 0, packet, a.command);
    executeHumanCreatureCommand(b, 0, packet, a.command);
    expect(b).toEqual(a.w);
    expect(b.ecology.mules[0].native).toBe(b.creatureNative[0]);
  });
});

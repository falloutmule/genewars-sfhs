import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import {
  campaignCreatureCommandContext,
  campaignCreatureCommandReference,
  campaignCreatureOccupied,
  campaignCreatureFootprintBuilding,
  campaignCreatureServiceBuilding,
  executeStagedCampaignCreatureCommand,
  executeCampaignCreatureCommand,
  type CampaignCreatureCommandWorld,
} from "../src/sim/campaign/creature-command-adapter";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import {
  insertSpatial,
  moveSpatial,
  validateSpatial,
} from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { i16, put16, put32, u16 } from "../src/sim/campaign/bytes";
import { worldCell } from "../src/sim/mechanics/terrain";
import { queryMuleAirborneBuilding } from "../src/sim/mechanics/mule";
import type { EffectSchedulerOptions } from "../src/sim/campaign/effect-scheduler";
import type { CampaignWorld } from "../src/sim/campaign/world";
import { speciesFixture } from "./fixtures/creature-species";

type Native = (number | null)[];
const put = (n: Native, p: number, v: number) => put16(n as number[], p, v);
const at: [number, number] = [8192, 8192];
function fixture() {
  const pack = campaignFixture(),
    w: CampaignCreatureCommandWorld = createCampaign(
      pack,
      "commands-synthetic",
    );
  pack.creatureCommandRules = {
    schemaVersion: 1,
    corpseDepositOffset: [-512, 256],
    footprintSearchOffsets: [
      [0, 0],
      [256, 0],
      [-256, 0],
      [0, 256],
      [0, -256],
      [256, 256],
      [-256, 256],
      [256, -256],
      [-256, -256],
    ],
    provenance: {
      executableSha256: "0".repeat(64),
      originalExecution: false,
      corpseDepositOffset: {
        object: 3,
        objectOffset: 0x457c,
        bytes: 4,
        sha256: "0".repeat(64),
      },
      footprintSearchOffsets: {
        object: 3,
        orderOffset: 0x60b8,
        orderBytes: 9,
        indexedBase: 0x4564,
        joinedBytes: 36,
        orderSha256: "0".repeat(64),
        sha256: "0".repeat(64),
      },
    },
  };
  function mule(slot = 0, point: [number, number] = [...at]) {
    const result = initializeMuleNative(
      w.creatureNative[slot],
      w.rng,
      { slot, owner: 0, position: point, quality: 50 },
      { terrain: w.terrain, tables: pack.rules!.tables },
    );
    if (!result.ok) throw Error(result.reason);
    const n = result.value.native;
    w.rng = result.value.rng;
    n[94] = 8;
    w.creatureNative[slot] = n;
    w.ecology.mules.push({
      id: `source:0:${slot}`,
      index: slot,
      native: n,
      pending: [],
    });
    insertSpatial(
      w.spatial,
      w.terrain,
      `source:0:${slot}`,
      worldCell(...point),
    );
    return n;
  }
  function building(
    slot = 0,
    point: [number, number] = [...at],
    selector = 11,
    owner = 0,
  ) {
    const n: Native = Array(67).fill(0);
    n.fill(null, 31, 39);
    n[6] = 4;
    n[24] = owner;
    n[45] = selector;
    n[49] = 1;
    put(n, 15, slot);
    put(n, 7, point[0]);
    put(n, 9, point[1]);
    put(n, 43, 20);
    put32(n as number[], 17, 2048);
    w.buildingNative[slot] = n;
    insertSpatial(
      w.spatial,
      w.terrain,
      `source:3:${slot}`,
      worldCell(...point),
    );
    w.terrain.bytes[worldCell(...at) * 14 + 11] |= 1;
    return n;
  }
  function effect(slot = 0, code = 36) {
    const n: Native = Array(81).fill(0);
    n.fill(null, 31, 39);
    n[6] = 5;
    n[69] = code;
    put(n, 15, slot);
    put(n, 7, at[0]);
    put(n, 9, at[1]);
    put32(n as number[], 17, 2048);
    put32(n as number[], 39, 2048);
    const p = w.powerEffects.slots[slot];
    p.nativePrior = n;
    p.occupied = true;
    insertSpatial(w.spatial, w.terrain, `source:4:${slot}`, worldCell(...at));
    put16(
      w.missionPrefix,
      0x3554,
      w.powerEffects.slots.filter((p) => p.occupied).length,
    );
    return n;
  }
  const n = mule();
  return { pack, w, n, mule, building, effect };
}
const options = (w: CampaignWorld): EffectSchedulerOptions<CampaignWorld> => ({
  gravity: 512,
  obstacleAt: () => false,
  cleanupReferences: cleanupCampaignReferences,
});
describe("campaign creature commands", () => {
  it("binds a Crab's actual virtual80 through ordinary interaction without RNG or alias replacement", () => {
    const {w,n,pack,mule}=fixture(), f=speciesFixture();
    pack.ecologyRules!.speciesTraits=f.rules.speciesTraits;
    pack.zoneRules!.speciesComponents=f.components;
    n[122]=1;n[118]=100;n[123]=255;
    mule(1,[8448,8192]);const rng=structuredClone(w.rng);
    const out=executeStagedCampaignCreatureCommand(w,0,{type:"interact",target:{kind:1,index:1},force:false},pack);
    expect(out.accepted).toBe(true);expect(i16(n as number[],63)).toBe(410);
    expect(w.rng).toEqual(rng);expect(w.creatureNative[0]).toBe(n);expect(w.ecology.mules[0].native).toBe(n);
  });
  it("requires actual non-Mule speed priors and traits inside the command transaction", () => {
    for(const missing of ["traits","skill","warmth"]){
      const {w,n,pack,mule}=fixture(),f=speciesFixture();
      pack.ecologyRules!.speciesTraits=f.rules.speciesTraits;pack.zoneRules!.speciesComponents=f.components;
      n[122]=1;mule(1,[8448,8192]);
      if(missing==="traits")pack.ecologyRules!.speciesTraits=undefined;
      else n[missing==="skill"?118:123]=null;
      const before=JSON.stringify(w);
      expect(()=>executeCampaignCreatureCommand(w,0,{type:"interact",target:{kind:1,index:1},force:false},pack)).toThrow();
      expect(JSON.stringify(w)).toBe(before);
    }
  });
  it("retains an explicit source speed service override", () => {
    const {w,n,pack,mule}=fixture();n[122]=1;mule(1,[8448,8192]);
    const out=executeStagedCampaignCreatureCommand(w,0,{type:"interact",target:{kind:1,index:1},force:false},pack,{requestedSpeed:()=>777});
    expect(out.accepted).toBe(true);expect(i16(n as number[],63)).toBe(777);
  });
  it("executes81C60 against actual retained native/player/RNG and source audio", () => {
    const { w, n, pack } = fixture(),
      players = w.players,
      raw = w.players[0].raw,
      natives = w.creatureNative,
      ecology = w.ecology,
      random = structuredClone(w.rng),
      power = w.powerEffects,
      specialist = w.specialists.records[0];
    const receipt = executeStagedCampaignCreatureCommand(
      w,
      0,
      {
        type: "move",
        point: [8700, 8800],
        callerOwner: 0,
        selectedPanelRefresh: true,
      },
      pack,
    );
    expect(receipt.accepted).toBe(true);
    expect(receipt.panelRefreshRequested).toBe(true);
    expect(w.creatureNative).toBe(natives);
    expect(w.creatureNative[0]).toBe(n);
    expect(w.ecology).toBe(ecology);
    expect(w.ecology.mules[0].native).toBe(n);
    expect(w.players).toBe(players);
    expect(w.players[0].raw).toBe(raw);
    expect(w.powerEffects).toBe(power);
    expect(w.specialists.records[0]).toBe(specialist);
    expect(w.rng).toEqual(random);
    expect([i16(n as number[], 110), i16(n as number[], 112)]).toEqual([
      8700, 8800,
    ]);
    expect(n[94]).toBe(0);
    expect(n[97]! & 128).toBe(128);
    expect(w.audio.requests.at(-1)).toMatchObject({
      entity: "source:0:0",
      cue: 73,
      mode: 2,
      range: 64,
      gain: 127,
    });
    validateSpatial(w.spatial);
  });
  it("retains source admission for strategic foreign-owner moves, without selected-player audio", () => {
    const { w, n, pack } = fixture();
    n[24] = 1;
    const out = executeStagedCampaignCreatureCommand(
      w,
      0,
      {
        type: "move",
        point: [8700, 8800],
        callerOwner: 1,
        selectedPanelRefresh: false,
      },
      pack,
    );
    expect(out.accepted).toBe(true);
    expect(w.audio.requests).toHaveLength(0);
    n[94] = 18;
    const before = JSON.stringify(w);
    expect(
      executeStagedCampaignCreatureCommand(
        w,
        0,
        {
          type: "move",
          point: [9000, 9000],
          callerOwner: 1,
          selectedPanelRefresh: false,
        },
        pack,
      ).accepted,
    ).toBe(false);
    expect(JSON.stringify(w)).toBe(before);
  });
  it("5B100 uses real chain order, attached gate, pursuit count, and effect17", () => {
    const { w, n, mule, effect } = fixture(),
      peer = mule(1);
    //Insertion is at head: last living remains n, even with another resident.
    expect(campaignCreatureOccupied(w, 0)).toBe(false);
    expect(campaignCreatureOccupied(w, 1)).toBe(true);
    put(peer, 73, 1024);
    expect(campaignCreatureOccupied(w, 1)).toBe(false);
    put(peer, 73, 0);
    peer[94] = 1;
    peer[87] = 1;
    put(peer, 85, 0);
    expect(campaignCreatureOccupied(w, 1)).toBe(false);
    mule(2);
    expect(campaignCreatureOccupied(w, 1)).toBe(true);
    w.creatureNative[2][94] = 24;
    expect(campaignCreatureOccupied(w, 1)).toBe(false);
    effect(0, 17);
    expect(campaignCreatureOccupied(w, 0)).toBe(true);
    n[94] = 10;
    put(n, 11, at[0]);
    put(n, 13, at[1]);
    expect(campaignCreatureOccupied(w, 0)).toBe(true);
  });
  it("5B100 keeps distinct retained noncreature target semantics and samecell state10", () => {
    const { w, n, mule, building } = fixture();
    mule(1);
    //Make the actor first in the chain so it is not the last living creature.
    moveSpatial(w.spatial, w.terrain, "source:0:0", worldCell(9000, 9000));
    moveSpatial(w.spatial, w.terrain, "source:0:0", worldCell(...at));
    expect(campaignCreatureOccupied(w, 0)).toBe(true);
    n[94] = 1;
    n[87] = 3;
    put(n, 85, 0);
    expect(campaignCreatureOccupied(w, 0)).toBe(false);
    n[87] = 4;
    building();
    expect(campaignCreatureOccupied(w, 0)).toBe(false);
    n[94] = 10;
    put(n, 11, at[0]);
    put(n, 13, at[1]);
    expect(campaignCreatureOccupied(w, 0)).toBe(false);
    put(n, 11, at[0] + 256);
    expect(campaignCreatureOccupied(w, 0)).toBe(true);
  });
  it("74160 first footprint differs from74270 shape/height and failed mask stops scanning", () => {
    const { w, pack, building } = fixture(),
      b = building(0, [at[0] + 200, at[1]], 11);
    pack.rules!.tables.buildingFootprints[11] = 1;
    expect(campaignCreatureFootprintBuilding(w, pack, at)).toBe(0);
    //Source74270 rejects outside class3's256 radius (its admitted native class).
    put(b, 7, at[0] + 300);
    expect(
      campaignCreatureCommandContext(w, pack).collisionBuilding!(w, 0),
    ).toBe(null);
    put(b, 7, at[0] + 200);
    b[49] = 0;
    building(1, [at[0] + 256, at[1]]);
    expect(campaignCreatureFootprintBuilding(w, pack, at, 1)).toBe(null);
    expect(campaignCreatureFootprintBuilding(w, pack, at, 0)).toBe(0);
    w.terrain.bytes[worldCell(...at) * 14 + 11] &= 254;
    expect(campaignCreatureFootprintBuilding(w, pack, at)).toBe(null);
  });
  it("reads imported ninepoint input only when the buildingflag enters74160 and validates the shared helper", () => {
    const { w, pack, building } = fixture();
    delete pack.creatureCommandRules;
    expect(campaignCreatureFootprintBuilding(w, pack, at)).toBe(null);
    building();
    expect(() => campaignCreatureFootprintBuilding(w, pack, at)).toThrow(
      /offsets/,
    );
    const samples = Array.from({ length: 9 }, () => [1024, 0] as const);
    expect(
      campaignCreatureFootprintBuilding(w, pack, at, 0, {
        value: samples,
        provenance: "synthetic remote samples",
      }),
    ).toBe(null);
    const bad = Array.from({ length: 8 }, () => [0, 0] as const);
    expect(() =>
      queryMuleAirborneBuilding(
        w.terrain,
        at,
        -1,
        () => null,
        () => 0,
        1,
        bad,
      ),
    ).toThrow(/nine/);
    w.terrain.bytes[worldCell(...at) * 14 + 11] &= 254;
    expect(
      queryMuleAirborneBuilding(
        w.terrain,
        at,
        -1,
        () => null,
        () => 0,
        1,
        bad,
      ),
    ).toBe(null);
  });
  it("5B580 collision returnsfalse after real cleanup, escape draws and order writes", () => {
    const { w, n, pack, building } = fixture();
    building();
    pack.assets.BMINE.frames![0].sourceSize = [4, 100];
    n[94] = 3;
    n[87] = 1;
    put(n, 85, 0);
    n[96] = 255;
    //Avoid an unrelated attachment branch while retaining canceled action bits.
    n[96] = 253;
    const draws = w.rng.draws;
    const out = executeCampaignCreatureCommand(
      w,
      0,
      { type: "interact", target: { kind: 4, index: 0 }, force: false },
      pack,
    );
    expect(out.accepted).toBe(false);
    const after = w.creatureNative[0];
    expect(after[94]).toBe(8);
    expect(i16(after as number[], 108)).toBe(32767);
    expect(w.rng.draws - draws).toBe(2);
    expect([
      i16(after as number[], 11),
      i16(after as number[], 13),
    ]).not.toEqual(at);
    expect(after[87]).toBe(4);
    expect(w.ecology.mules[0].native).toBe(after);
  });
  it("43130 selects complete selector2 with unsignedmaterial, strict ties, owner block and alliances", () => {
    const { w, n, building } = fixture();
    const a = building(0, [8192 + 256, 8192], 2),
      b = building(1, [8192 - 256, 8192], 2),
      ally = building(64, [8192 + 1, 8192], 2, 1);
    put32(a as number[], 54, 0xffffffff);
    put32(b as number[], 54, 2);
    put32(ally as number[], 54, 3);
    expect(campaignCreatureServiceBuilding(w, 0)).toBe(0);
    a[49] = 0;
    expect(campaignCreatureServiceBuilding(w, 0)).toBe(1);
    w.players[0].raw[0x6e5] = 2;
    expect(campaignCreatureServiceBuilding(w, 0)).toBe(1);
    w.runtimeMode |= 1;
    expect(campaignCreatureServiceBuilding(w, 0)).toBe(64);
    w.players[0].raw[0x4a1] = 1;
    w.players[1].raw[1] = 1;
    w.runtimeMode = 0;
    expect(campaignCreatureServiceBuilding(w, 0)).toBe(64);
    expect(n[94]).toBe(8);
  });
  it("5D870 alternatebuilding service mutates real nominated/attachment and retainedtarget, not94", () => {
    const { w, n, pack, building } = fixture();
    pack.zoneRules!.speciesComponents[4] = [4, 1];
    building(1, [9000, 9000], 11);
    const service = building(0, [8500, 8500], 2);
    put32(service as number[], 54, 9);
    n[120] = 1;
    const out = executeStagedCampaignCreatureCommand(
      w,
      0,
      { type: "target", target: { kind: 4, index: 1 } },
      pack,
    );
    expect(out.accepted).toBe(true);
    expect(n[94]).toBe(8);
    expect(n[95]).toBe(2);
    expect([
      i16(n as number[], 77),
      n[79],
      i16(n as number[], 91),
      n[93],
    ]).toEqual([0, 4, 0, 4]);
    expect([i16(n as number[], 88), n[90]]).toEqual([1, 4]);
    expect(n[97]! & 8).toBe(8);
  });
  it("retained inactive targets are visible and unknown caller scratch is refused atomically", () => {
    const { w, n, pack, building } = fixture(),
      b = building();
    b[6] = 0;
    expect(campaignCreatureCommandReference(w, { kind: 4, index: 0 })).toBe(b);
    //Remove its link: inactive pointers are retained but never live query members.
    b[6] = 4;
    const before = JSON.stringify(w),
      held = w.creatureNative;
    expect(() =>
      executeCampaignCreatureCommand(
        w,
        0,
        { type: "target", target: { kind: 4, index: 0 } },
        pack,
      ),
    ).toThrow(/caller byte/);
    expect(JSON.stringify(w)).toBe(before);
    expect(w.creatureNative).toBe(held);
    expect(w.creatureNative[0]).toBe(n);
    w.creatureCommandScratch = {
      0: { value: 19, provenance: "synthetic caller stack snapshot" },
    };
    expect(
      executeCampaignCreatureCommand(
        w,
        0,
        { type: "target", target: { kind: 4, index: 0 } },
        pack,
      ).sourceScratch95,
    ).toEqual(w.creatureCommandScratch[0]);
    expect(w.creatureNative[0][95]).toBe(19);
  });
  it("dead36 retirement performs actual sharedcleanup and retains held record/player identities", () => {
    const { w, n, pack, effect } = fixture(),
      e = effect(),
      raw = w.players[0].raw,
      slots = w.powerEffects.slots;
    n[94] = 24;
    n[96] = 2;
    n[93] = 5;
    put(n, 91, 0);
    executeStagedCampaignCreatureCommand(w, 0, { type: "release" }, pack, {
      effectOptions: options,
    });
    expect(w.powerEffects.slots).toBe(slots);
    expect(slots[0].nativePrior).toBe(e);
    expect(e[6]).toBe(0);
    expect(slots[0].occupied).toBe(false);
    expect(w.players[0].raw).toBe(raw);
    expect(w.creatureNative[0]).toBe(n);
    expect(n[93]).toBe(0);
    expect(n[96]! & 2).toBe(0);
    expect(w.spatial.nodes["source:4:0"]).toBeUndefined();
    expect(u16(w.missionPrefix, 0x3554)).toBe(0);
    validateSpatial(w.spatial);
  });
  it("detaches the actual specialist and refreshes normalized motion without replacing native/player aliases", () => {
    const { w, n, pack } = fixture(),
      actor = w.actors[0],
      slot = actor.id,
      target = w.specialists.records[slot],
      raw = w.players[actor.owner].raw,
      point = [i16(target as number[], 7), i16(target as number[], 9)];
    target[85] = 3;
    target[74] = 255;
    target[21] = 255;
    n[96] = 2;
    n[93] = 3;
    put(n, 91, slot);
    executeStagedCampaignCreatureCommand(w, 0, { type: "release" }, pack);
    expect(w.specialists.records[slot]).toBe(target);
    expect(w.players[actor.owner].raw).toBe(raw);
    expect(target[85]).toBe(1);
    expect(target[74]).toBe(59);
    expect(target[21]).toBe(223);
    expect([actor.motion.x, actor.motion.y]).toEqual(point);
    const builder = w.builders.find((b) => b.id === slot);
    if (builder) expect(builder.motion).toBe(actor.motion);
  });
  it("rolls back the entire host after actual unlink/cleanup and a late service failure", () => {
    const { w, n, pack, effect } = fixture(),
      e = effect();
    n[94] = 24;
    n[96] = 2;
    n[93] = 5;
    put(n, 91, 0);
    const before = JSON.stringify(w),
      raw = w.players[0].raw,
      spatial = w.spatial,
      natives = w.creatureNative;
    expect(() =>
      executeCampaignCreatureCommand(w, 0, { type: "release" }, pack, {
        effectOptions: (s) => ({
          ...options(s),
          cleanupReferences: (host, id) => {
            cleanupCampaignReferences(host, id);
            host.players[0].raw[0x700] = 99;
            host.rng.draws++;
            host.audio.nextSequence++;
            throw Error("late cleanup failure");
          },
        }),
      }),
    ).toThrow("late cleanup failure");
    expect(JSON.stringify(w)).toBe(before);
    expect(w.players[0].raw).toBe(raw);
    expect(w.spatial).toBe(spatial);
    expect(w.creatureNative).toBe(natives);
    expect(w.creatureNative[0]).toBe(n);
    expect(w.powerEffects.slots[0].nativePrior).toBe(e);
  });
  it("requires an actual imported corpseanchor only on entered selector4 unload and persists continuation", () => {
    const { w, n, pack, mule, building } = fixture(),
      corpse = mule(1, [7680, 8448]);
    corpse[94] = 24;
    building(0, at, 4);
    n[96] = 2;
    n[93] = 1;
    put(n, 91, 1);
    const imported = pack.creatureCommandRules!;
    //Keep query input admitted while deliberately removing only the anchor.
    const services = {
      footprintSearchOffsets: {
        value: imported.footprintSearchOffsets,
        provenance: "synthetic footprint profile",
      },
    };
    delete pack.creatureCommandRules;
    const before = JSON.stringify(w);
    expect(() =>
      executeCampaignCreatureCommand(w, 0, { type: "release" }, pack, services),
    ).toThrow(/10457C/);
    expect(JSON.stringify(w)).toBe(before);
    //Synthetic anchor intentionally differs from original table: the adapter reads data.
    pack.creatureCommandRules = imported;
    const saved = JSON.parse(JSON.stringify(w)) as CampaignCreatureCommandWorld;
    executeCampaignCreatureCommand(w, 0, { type: "release" }, pack);
    executeCampaignCreatureCommand(saved, 0, { type: "release" }, pack);
    expect(saved).toEqual(w);
    expect(w.creatureNative[1][96]! & 32).toBe(32);
    expect(w.ecology.mules[1].native).toBe(w.creatureNative[1]);
  });
  it("staged port rejects detached JSON aliases instead of overwriting retained records", () => {
    const { w, pack } = fixture(),
      copy = JSON.parse(JSON.stringify(w));
    expect(() =>
      executeStagedCampaignCreatureCommand(copy, 0, { type: "release" }, pack),
    ).toThrow(/aliases/);
    synchronizeCampaignLinks(w);
    //Standalone wrapper rebinds byte-equal JSON images in its private stage.
    executeCampaignCreatureCommand(copy, 0, { type: "release" }, pack);
    expect(copy.ecology.mules[0].native).toBe(copy.creatureNative[0]);
  });
});

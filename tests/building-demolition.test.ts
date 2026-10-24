import { beforeAll, describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  demolitionSalvagePayload,
  stepStagedBuildingDemolition,
  type BuildingDemolitionContext,
} from "../src/sim/mechanics/building-demolition";
import {
  makeSalvageEffect,
  stepSalvageEffect,
  type SalvageContact,
  type SalvageEffectContext,
} from "../src/sim/mechanics/salvage-effect";
import {
  createStagedCampaignSalvage,
  stepCampaignBuildingDemolition,
  stepStagedCampaignBuildingDemolition,
  stepCampaignSalvageEffect,
  clearStagedCampaignBuildingProcessingFront,
  type CampaignDemolitionServices,
} from "../src/sim/campaign/building-demolition-adapter";
import {
  createStagedCampaignEngineerBuilding,
  progressCampaignEngineerBuilding,
} from "../src/sim/campaign/engineer-adapter";
import {
  publishStagedSharedEffect,
  retireStagedSharedEffect,
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { moveSpatial, unlinkSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { planBotanistPlantCreation } from "../src/sim/mechanics/botanist";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { i16, u16, u32, put16, put32 } from "../src/sim/campaign/bytes";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { checksum } from "../src/sim/checksum";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";

/** Synthetic source records/phases test arithmetic and host services. These
 * arrangements are not ordinary mission play or mission acceptance. */
describe("451F0 timed demolition and owner9 salvage45/0x2D", () => {
  const profile = { first: 0, last: 0, holds: [0], flags: 0 };
  const descriptor = {
    code: 45,
    retirementMode: 2,
    gravity: true,
    priority: 12,
    childCode: null,
    movable: true,
    waterResponse: true,
  };
  const pack = campaignFixture();
  let start: CampaignWorld;
  beforeAll(() => {
    pack.buildingRules = {
      schemaVersion: 1,
      resources: Array.from({ length: 13 }, (_, selector) => ({
        selector,
        path: `B${selector}.ANB`,
        assetKey: "TEST",
      })),
      unsupportedSelectors: [13],
      upkeep: Array(14).fill(0),
      processingFrontOffset: [256, -128],
      provenance: {
        executableSha256: "0".repeat(64),
        originalExecution: false,
      },
    };
    pack.ecologyRules = {
      ...pack.ecologyRules!,
      corpseFriction: Array(8).fill(256),
    };
    pack.effectRules = {
      schemaVersion: 1,
      descriptors: Array.from({ length: 71 }, (_, code) => ({
        ...descriptor,
        code,
        priority: code === 45 ? 12 : 1,
      })),
      provenance: {
        executableSha256: "0".repeat(64),
        originalExecution: false,
      },
    };
    pack.assets.EFF = {
      ...pack.assets.EFF,
      frames: [{ components: [], width: 1, height: 1, rawFlags: [0, 0, 0] }],
      animations: Array.from({ length: 71 }, () => ({
        first: 0,
        last: 0,
        rawTrailingWord: 1,
      })),
    };
    start = createCampaign(pack, "synthetic-demolition");
    enterCampaign(start);
    for (let i = 0; i < 200; i++) stepCampaign(start, pack);
    expect(start.specialists.records[0][6]).toBe(3);
  }, 30000);
  function fixture() {
    const w = structuredClone(start),
      content = structuredClone(pack);
    const options: EffectSchedulerOptions<CampaignWorld> = {
      gravity: 512,
      obstacleAt: () => false,
      cleanupReferences: cleanupCampaignReferences,
    };
    options.salvageEffect = (s, slot, out) =>
      stepCampaignSalvageEffect(s, slot, content, options, out);
    for (let i = 0; i < 200; i++)
      if (w.powerEffects.slots[i].occupied)
        retireStagedSharedEffect(w, i, options);
    const services: CampaignDemolitionServices = {
      effectOptions: () => options,
    };
    const made = createStagedCampaignEngineerBuilding(w, content, services, {
      code: 44,
      owner: 0,
      selector: 1,
      point: [9087, 8319],
      height: 2048,
    })!;
    const slot = made.buildingSlot;
    progressCampaignEngineerBuilding(w, content, slot, 1000);
    const b = w.buildings.find((b) => b.slot === slot)!;
    w.economy.buildings.push({
      ...b,
      slot: slot % 64,
      disabled: false,
      hqUpgradeSuppressed: false,
      capacitySuppressed: false,
      powered: true,
      extraDrain: 0,
      depleted: false,
      storedGoop: 0,
      specialPowerDelivery: false,
    });
    for (let i = 0; i < 200; i++)
      if (w.powerEffects.slots[i].occupied)
        retireStagedSharedEffect(w, i, options);
    const n = w.buildingNative[slot],
      actor = w.specialists.records[0];
    put16(n as number[], 49, u16(n as number[], 49) | 0x800);
    put32(n as number[], 54, 8);
    put16(n as number[], 64, 0);
    n[66] = 3;
    put16(actor as number[], 127, slot);
    actor[129] = 4;
    return { w, content, slot, n, actor, options, services };
  }
  function pure(timer = 8, selector = 1) {
    const n = Array<number | null>(67).fill(0),
      actor = Array<number | null>(200).fill(0),
      trace: string[] = [];
    n[6] = 4;
    n[24] = 0;
    n[45] = selector;
    n[66] = 3;
    n[28] = 1;
    put16(n as number[], 43, 100);
    put16(n as number[], 49, 0x801);
    put32(n as number[], 54, timer);
    put16(n as number[], 61, 100);
    put16(actor as number[], 127, 0);
    actor[129] = 4;
    const w = { n, actor },
      context: BuildingDemolitionContext<typeof w> = {
        native: (s) => s.n,
        actor: (s) => ({ index: 0, native: s.actor, skill: 60 }),
        constructionCosts: Array(14).fill(250),
        profile: () => profile,
        salvage: () => {
          trace.push("factory");
          return 7;
        },
        capacity: () => {
          trace.push("capacity");
        },
        retire: (s) => {
          trace.push("retire");
          s.n[6] = 0;
        },
        onEvent: (_s, e) => trace.push(`stop:${e.channel}`),
      };
    return { w, n, actor, trace, context };
  }
  function salvage(f: ReturnType<typeof fixture>, delay = 4) {
    return createStagedCampaignSalvage(
      f.w,
      {
        code: 45,
        owner: 9,
        position: [1024, 1024],
        height: groundHeight(f.w.terrain, 1024, 1024),
        angles: [0, 0, 0],
        parameter: 5000,
        delay,
        parent: null,
        newborn: false,
      },
      f.content,
      f.options,
    )!;
  }
  function context(
    f: ReturnType<typeof fixture>,
    target: SalvageContact | null = null,
  ): SalvageEffectContext {
    return {
      frame: 0,
      gravity: 512,
      water: 0,
      terrain: f.w.terrain,
      tables: f.content.rules!.tables,
      bounce: f.content.rules!.tables.bounce,
      friction: Array(8).fill(256),
      profile,
      obstacle: () => null,
      child: () => false,
      contact: () => target,
      credit: () => {},
    };
  }
  it("keeps signed multiplication/division/payload truncation and the later unsigned-byte quirk", () => {
    expect(demolitionSalvagePayload(250, 60)).toBe(4);
    expect(demolitionSalvagePayload(251, -60)).toBe(-5);
    expect(demolitionSalvagePayload(0x7fffffff, 127)).toBe(-113);
    expect(demolitionSalvagePayload(409600, 100)).toBe(0);
    expect(() => demolitionSalvagePayload(250, 128)).toThrow(/signed/);
  });
  it("allocates before capacity and retirement, then retargets only the surviving current reference", () => {
    const f = pure();
    const r = stepStagedBuildingDemolition(f.w, 0, f.context);
    expect(f.trace).toEqual(["factory", "stop:35", "capacity", "retire"]);
    expect([
      r.retired,
      r.queueDraw,
      i16(f.actor as number[], 127),
      f.actor[129],
    ]).toEqual([true, false, 7, 5]);
    expect(r.salvage?.request).toMatchObject({
      owner: 9,
      parameter: 5000,
      delay: 4,
      parent: null,
      newborn: false,
    });
  });
  it("retires on capacity false and does not resurrect a factory-cleaned reference", () => {
    const f = pure();
    f.context.salvage = (s) => {
      s.actor[129] = 0;
      return null;
    };
    expect(stepStagedBuildingDemolition(f.w, 0, f.context).retired).toBe(true);
    expect(f.actor[129]).toBe(0);
    const g = pure();
    g.context.salvage = (s) => {
      s.actor[129] = 0;
      return 7;
    };
    stepStagedBuildingDemolition(g.w, 0, g.context);
    expect(g.actor[129]).toBe(0);
  });
  it("handles incomplete0800 before completion/upkeep and executes only the common animation tail", () => {
    const f = pure(16);
    put16(f.n as number[], 49, 0x800);
    f.n[48] = 3;
    f.n[47] = 1;
    const r = stepStagedBuildingDemolition(f.w, 0, f.context);
    expect([
      r.timerAfter,
      r.retired,
      r.queueDraw,
      i16(f.n as number[], 61),
      f.n[48],
      f.n[25],
      f.n[28],
    ]).toEqual([8, false, true, 99, 2, 0, 0]);
    expect(f.trace).toEqual(["stop:35"]);
  });
  it("skips ANB/queue for incomplete nonpositive health and ignores actor data until terminal", () => {
    const f = pure(16);
    put16(f.n as number[], 49, 0x800);
    put16(f.n as number[], 43, 0);
    f.n[64] = null;
    f.n[65] = null;
    f.context.profile = () => {
      throw Error("unread profile");
    };
    expect(stepStagedBuildingDemolition(f.w, 0, f.context).queueDraw).toBe(
      false,
    );
  });
  it("stores original factory counter/fractions and signed delay as unsigned payload without RNG", () => {
    const f = fixture(),
      prior = f.w.powerEffects.slots[0].nativePrior!;
    prior[30] = 219;
    prior[67] = 181;
    prior[68] = 193;
    prior[73] = 4;
    const rng = structuredClone(f.w.rng),
      slot = salvage(f, -5),
      n = f.w.powerEffects.slots[slot].nativePrior!;
    expect([
      u16(n as number[], 21),
      n[70],
      i16(n as number[], 74),
      n[29],
      n[76],
      n[30],
      n[67],
      n[68],
      n[73],
    ]).toEqual([0x180, 1, 5000, 251, 251, 219, 181, 193, 4]);
    expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(f.w.rng).toEqual(rng);
  });
  it("requires concrete descriptor/profile/prior rather than manufacturing missing source bytes", () => {
    const f = fixture(),
      prior = f.w.powerEffects.slots[0].nativePrior!;
    prior[30] = null;
    const slot = salvage(f),
      n = f.w.powerEffects.slots[slot].nativePrior!;
    expect(() => stepSalvageEffect(n, context(f))).toThrow(/Unknown/);
    expect(() =>
      makeSalvageEffect(
        { ...prior, length: 80 } as never,
        0,
        {
          code: 45,
          owner: 9,
          position: [0, 0],
          height: 0,
          angles: [0, 0, 0],
          parameter: 5000,
          delay: 0,
          parent: null,
          newborn: false,
        },
        f.w.terrain,
        profile,
        descriptor,
      ),
    ).toThrow(/prior/);
  });
  it("expires timer0 before querying the cell or crediting funds", () => {
    const f = fixture(),
      slot = salvage(f),
      n = f.w.powerEffects.slots[slot].nativePrior!,
      c = context(f);
    put16(n as number[], 74, 0);
    c.contact = () => {
      throw Error("late query");
    };
    const r = stepSalvageEffect(n, c);
    expect(r.retirementRequired).toBe(true);
    expect(i16(r.native as number[], 74)).toBe(-1);
  });
  it("runs genuine common water factory requests before the own-cell query, including capacity false", () => {
    const f = fixture(),
      slot = salvage(f),
      n = f.w.powerEffects.slots[slot].nativePrior!,
      c = context(f),
      order: string[] = [];
    for (let cell = 0; cell < 16384; cell++)
      f.w.terrain.bytes[cell * 14 + 5] = 0;
    put32(n as number[], 39, groundHeight(f.w.terrain, 1024, 1024) + 128);
    put16(n as number[], 45, 1024);
    put16(n as number[], 49, 1024);
    c.frame = (3 - slot) & 3;
    c.water = 3000;
    c.child = (q) => {
      order.push(`child:${q.code}`);
      return false;
    };
    c.contact = () => {
      order.push("query");
      return null;
    };
    const submerged = stepSalvageEffect(n, c);
    expect(order).toEqual(["child:21", "query"]);
    expect(submerged.factories[0]).toMatchObject({
      request: { code: 21, angles: [0, 0, 128], newborn: false },
      created: false,
    });
    expect(submerged.newborns).toBe(0);
    order.length = 0;
    c.water = 2200;
    expect(stepSalvageEffect(n, c).factories[0].request).toMatchObject({
      code: 48,
      height: 2200,
      angles: [0, 0, 0],
    });
    expect(order).toEqual(["child:48", "query"]);
  });
  it("selects only the first kind1/3/4 and admits only specialist category0 irrespective of owner", () => {
    const f = fixture(),
      slot = salvage(f, -1),
      n = f.w.powerEffects.slots[slot].nativePrior!;
    for (const [kind, category] of [
      [1, null],
      [4, null],
      [3, 1],
    ] as const) {
      const c = context(f, {
        id: "source:0:0",
        kind,
        index: 0,
        owner: 1,
        category,
      });
      c.credit = () => {
        throw Error("wrong candidate");
      };
      expect(stepSalvageEffect(n, c).retirementRequired).toBe(false);
    }
    const c = context(f, {
        id: "source:2:0",
        kind: 3,
        index: 0,
        owner: 1,
        category: 0,
      }),
      credits: number[] = [];
    c.credit = (_e, n) => credits.push(n);
    expect(stepSalvageEffect(n, c).pickup).toEqual({
      target: "source:2:0",
      owner: 1,
      amount: 4080,
    });
    expect(credits).toEqual([4080]);
  });
  it("removes native/spatial/view/economy rows in place and retains exact source capacity/funds timing", () => {
    const f = fixture(),
      held = {
        economy: f.w.economy,
        rows: f.w.economy.buildings,
        buildings: f.w.buildings,
        players: f.w.players,
        actor: f.actor,
      },
      funds = f.w.players[0].funds,
      rng = structuredClone(f.w.rng);
    const r = stepStagedCampaignBuildingDemolition(
      f.w,
      f.slot,
      f.content,
      f.services,
    );
    expect(r.retired).toBe(true);
    expect(r.salvage?.slot).not.toBeNull();
    expect(f.n[6]).toBe(0);
    expect(f.w.spatial.nodes[`source:3:${f.slot}`]).toBeUndefined();
    expect([
      f.w.economy,
      f.w.economy.buildings,
      f.w.buildings,
      f.w.players,
      f.w.specialists.records[0],
    ]).toEqual([
      held.economy,
      held.rows,
      held.buildings,
      held.players,
      held.actor,
    ]);
    expect(f.w.economy).toBe(held.economy);
    expect(f.w.buildings).toBe(held.buildings);
    expect(f.w.economy.buildings).toBe(held.rows);
    expect(f.w.buildings.some((b) => b.slot === f.slot)).toBe(false);
    expect(
      f.w.economy.buildings.some((b) => b.owner * 64 + b.slot === f.slot),
    ).toBe(false);
    expect(f.w.players[0].raw[0x601]).toBe(0);
    expect(f.w.players[0].raw[0x4a2]).toBe(0);
    expect(f.w.players[0].funds).toBe(funds);
    expect(f.w.rng).toEqual(rng);
    expect(f.actor[129]).toBe(5);
    expect(i16(f.actor as number[], 127)).toBe(r.salvage!.slot);
  });
  it("uses real first-cell order: a building prevents pickup before a later Engineer", () => {
    const f = fixture(),
      slot = salvage(f),
      effect = f.w.powerEffects.slots[slot].nativePrior!,
      actor = f.actor;
    put16(actor as number[], 7, 1024);
    put16(actor as number[], 9, 1024);
    moveSpatial(f.w.spatial, f.w.terrain, "source:2:0", worldCell(1024, 1024));
    //Moving a real linked building later places it at the head before Engineer.
    put16(f.n as number[], 7, 1024);
    put16(f.n as number[], 9, 1024);
    moveSpatial(
      f.w.spatial,
      f.w.terrain,
      `source:3:${f.slot}`,
      worldCell(1024, 1024),
    );
    synchronizeCampaignLinks(f.w);
    const funds = f.w.players[0].funds;
    const r = stepEffectScheduler(f.w, f.content, f.options);
    expect(r.salvage?.find((r) => r.slot === slot)?.update.pickup).toBeNull();
    expect(f.w.players[0].funds).toBe(funds);
    expect(effect[69]).toBe(45);
  });
  it("credits raw wrapping funds only on actual Engineer pickup then clears references on retirement", () => {
    const f = fixture(),
      slot = salvage(f),
      actor = f.actor;
    put16(actor as number[], 7, 1024);
    put16(actor as number[], 9, 1024);
    moveSpatial(f.w.spatial, f.w.terrain, "source:2:0", worldCell(1024, 1024));
    synchronizeCampaignLinks(f.w);
    put32(f.w.players[0].raw, 0x4a3, 0xfffffff0);
    f.w.players[0].funds = 0xfffffff0;
    put16(actor as number[], 127, slot);
    actor[129] = 5;
    const beforeRng = structuredClone(f.w.rng),
      r = stepEffectScheduler(f.w, f.content, f.options);
    expect(r.salvage?.find((r) => r.slot === slot)?.update.pickup?.amount).toBe(
      64,
    );
    expect(f.w.players[0].funds).toBe(48);
    expect(u32(f.w.players[0].raw, 0x4a3)).toBe(48);
    expect(f.w.powerEffects.slots[slot].occupied).toBe(false);
    expect(f.w.specialists.records[0][129]).toBe(0);
    expect(f.w.rng).toEqual(beforeRng);
  });
  it("retires building even when all200 source priorities prevent salvage allocation", () => {
    const f = fixture();
    for (let i = 0; i < 200; i++) {
      const n = makeSalvageEffect(
        f.w.powerEffects.slots[i].nativePrior!,
        i,
        {
          code: 45,
          owner: 9,
          position: [1024, 1024],
          height: 2048,
          angles: [0, 0, 0],
          parameter: 5000,
          delay: 0,
          parent: null,
          newborn: false,
        },
        f.w.terrain,
        profile,
        descriptor,
      );
      n[69] = 50;
      publishStagedSharedEffect(f.w, i, n);
    }
    const r = stepCampaignBuildingDemolition(
      f.w,
      f.slot,
      f.content,
      f.services,
    );
    expect(r.salvage?.slot).toBeNull();
    expect(f.w.buildingNative[f.slot][6]).toBe(0);
    expect(f.w.specialists.records[0][129]).toBe(0);
  });
  it("rolls back late retirement failure including factory, audio, references and terrain", () => {
    const f = fixture(),
      before = JSON.stringify(f.w);
    f.services.selectedBuildingSlot = () => f.slot;
    f.services.onEvent = (_s, e) => {
      if (e.type === "selection-cleared")
        throw Error("late presentation failure");
    };
    expect(() =>
      stepCampaignBuildingDemolition(f.w, f.slot, f.content, f.services),
    ).toThrow(/late presentation/);
    expect(JSON.stringify(f.w)).toBe(before);
  });
  it("reads an inactive starter's retained blueprint binding and rejects unknown C0", () => {
    const f = fixture(),
      binding = f.w.specialists.bindings[0]!;
    unlinkSpatial(f.w.spatial, f.w.terrain, "source:2:0");
    f.actor[6] = 0;
    f.w.players[binding.owner].raw[22 + binding.blueprintIndex * 36 + 23] = 100;
    const r = stepStagedCampaignBuildingDemolition(
      f.w,
      f.slot,
      f.content,
      f.services,
    );
    expect(r.salvage?.request.delay).toBe(7);
    const g = fixture(),
      before = JSON.stringify(g.w);
    g.w.specialists.bindings[0] = null;
    const unbound = JSON.stringify(g.w);
    expect(() =>
      stepCampaignBuildingDemolition(g.w, g.slot, g.content, g.services),
    ).toThrow(/retained.*blueprint/);
    expect(JSON.stringify(g.w)).toBe(unbound);
    expect(before).not.toBe(unbound);
  });
  it("uses753F0 flags-only retirement and leaves materials, heights, borders and source unrelated bits intact", () => {
    const f = fixture(),
      x = i16(f.n as number[], 7) >> 8,
      y = i16(f.n as number[], 9) >> 8;
    for (const dy of [0, 1])
      for (const dx of [0, 1]) {
        const p = ((y + dy) * 128 + x + dx) * 14;
        f.w.terrain.bytes[p + 11] = 0x7f;
        f.w.terrain.bytes[p + 4] = 123;
        f.w.terrain.bytes[p + 5] = 0x5a;
      }
    const before = f.w.terrain.bytes.slice();
    stepStagedCampaignBuildingDemolition(f.w, f.slot, f.content, f.services);
    const changed = f.w.terrain.bytes.flatMap((v, i) =>
      v === before[i] ? [] : [i],
    );
    expect(changed.every((i) => [6, 7, 8, 11].includes(i % 14))).toBe(true);
    expect(changed.filter((i) => i % 14 === 11)).toHaveLength(4);
    expect(f.w.terrain.bytes[(y * 128 + x) * 14 + 11]).toBe(0x6e);
    expect(f.w.terrain.bytes[((y + 1) * 128 + x + 1) * 14 + 11]).toBe(0x6f);
  });
  it("retains zero-count mean and selector13 unsigned stored-field subtraction after the signed timer write", () => {
    const f = fixture();
    f.n[45] = 13;
    f.w.buildings[0].selector = 13;
    f.w.economy.buildings[0].selector = 13;
    f.w.players[0].raw[0x601] = 0;
    f.w.players[0].raw[0x60d] = 1;
    put32(f.n as number[], 54, 0);
    put32(f.w.players[0].raw, 0x4a7, 100);
    put16(f.w.players[0].raw, 0x5fc, 1111);
    put16(f.w.players[0].raw, 0x5fe, 2222);
    const r = stepStagedCampaignBuildingDemolition(
      f.w,
      f.slot,
      f.content,
      f.services,
    );
    expect(r.timerAfter).toBe(-8);
    expect(f.w.players[0].goop).toBe(108);
    expect(f.w.economy.players[0].goop).toBe(108);
    expect([
      i16(f.w.players[0].raw, 0x5fc),
      i16(f.w.players[0].raw, 0x5fe),
    ]).toEqual([1111, 2222]);
  });
  it("clears processing-front reservations only for source dead plants and selector4 corpses", () => {
    const f = fixture(),
      point: [number, number] = [9216, 8192];
    f.content.buildingRules!.processingFrontOffset = [
      point[0] - i16(f.n as number[], 7),
      point[1] - i16(f.n as number[], 9),
    ];
    const plants = [0, 1].map((index) => {
      const p = f.w.ecology.plants[index],
        plan = planBotanistPlantCreation(
          p.native,
          index,
          4,
          0,
          point,
          f.w.terrain,
        );
      p.native.splice(0, 49, ...plan.native);
      Object.assign(p, {
        active: true,
        owner: 4,
        position: point,
        selector: 0,
        growth: index ? 4 : 0,
        flags: 4,
        plantFlags: 4,
      });
      put16(p.native as number[], 44, index ? 1024 : 0);
      p.native[46] = 4;
      insertSpatial(f.w.spatial, f.w.terrain, p.id, worldCell(...point));
      return p;
    });
    const r = initializeMuleNative(
      f.w.creatureNative[0],
      f.w.rng,
      { slot: 0, owner: 4, position: point, quality: 50 },
      { terrain: f.w.terrain, tables: f.content.rules!.tables },
    );
    if (!r.ok) throw Error(r.reason);
    const m = r.value.native;
    m[94] = 128;
    m[96] = 0xa0;
    f.w.creatureNative[0] = m;
    f.w.ecology.mules.push({
      index: 0,
      id: "source:0:0",
      native: m,
      pending: [],
    });
    insertSpatial(f.w.spatial, f.w.terrain, "source:0:0", worldCell(...point));
    synchronizeCampaignLinks(f.w);
    f.n[45] = 2;
    expect(
      clearStagedCampaignBuildingProcessingFront(f.w, f.slot, f.content),
    ).toEqual([plants[0].id]);
    expect(m[96]).toBe(0xa0);
    expect(plants.map((p) => p.plantFlags)).toEqual([0, 4]);
    plants[0].native[46] = plants[0].plantFlags = 4;
    f.n[45] = 4;
    expect(
      clearStagedCampaignBuildingProcessingFront(f.w, f.slot, f.content),
    ).toEqual(["source:0:0", plants[0].id]);
    expect(m[96]).toBe(0x80);
    expect(plants[1].native[46]).toBe(4);
  });
  it("runs demolition through the ordinary interleaved campaign building callback and shared effect scheduler", () => {
    const f = fixture();
    put32(f.n as number[], 54, 16);
    const frame = f.w.frame;
    stepCampaign(f.w, f.content);
    expect(f.w.frame).toBe(frame + 1);
    expect(i16(f.w.buildingNative[f.slot] as number[], 54)).toBe(8);
    expect(f.w.buildingNative[f.slot][6]).toBe(4);
    stepCampaign(f.w, f.content);
    expect(f.w.frame).toBe(frame + 2);
    expect(f.w.buildingNative[f.slot][6]).toBe(0);
    expect(f.w.buildings).toHaveLength(0);
    expect(
      f.w.powerEffects.slots.some(
        (s) => s.occupied && s.nativePrior?.[69] === 45,
      ),
    ).toBe(true);
  });
  it("round-trips a real allocated salvage carrier and replays identical callbacks", () => {
    const f = fixture();
    stepCampaignBuildingDemolition(f.w, f.slot, f.content, f.services);
    const session = { paused: true, speed: 1 as const, accumulator: 0 },
      saved = saveCampaign(f.w, session),
      a = loadCampaign(saved, f.w.contentHash).world,
      b = loadCampaign(saved, f.w.contentHash).world;
    for (let i = 0; i < 4; i++) {
      stepEffectScheduler(a, f.content, f.options);
      stepEffectScheduler(b, f.content, f.options);
      a.frame++;
      b.frame++;
    }
    expect(checksum(a)).toBe(checksum(b));
    expect(JSON.parse(saveCampaign(a, session))).toEqual(
      JSON.parse(saveCampaign(b, session)),
    );
  });
});

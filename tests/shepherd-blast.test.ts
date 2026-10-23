import { describe, it, expect } from "vitest";
import {
  makeDestructionEffect,
  runBlastArea,
  stepDestructionEffect,
  type BlastTarget,
  type BlastAreaContext,
} from "../src/sim/mechanics/destruction-effect";
import {
  putEffectWord as put,
  putEffectDword as put32,
} from "../src/sim/mechanics/power-motion";
import { terrainFromBytes, worldCell } from "../src/sim/mechanics/terrain";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign, type CampaignWorld } from "../src/sim/campaign/world";
import {
  createCampaignDestructionEffect,
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  validateSpatial,
  insertSpatial,
  unlinkSpatial,
} from "../src/sim/campaign/spatial";
import {
  createStagedShepherdShot,
  stepCampaignShepherdEffect,
} from "../src/sim/campaign/shepherd-effect-adapter";
import { campaignBlastAreaContext } from "../src/sim/campaign/blast-adapter";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { cloneSpecialistPool } from "../src/sim/mechanics/specialist-native";
import type { ShepherdShot } from "../src/sim/mechanics/shepherd";
import type { SourceEntityId } from "../src/sim/campaign/source-pools";
type N = (number | null)[];
const word = (n: readonly (number | null)[], p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const profile = () => ({
  holds: Array(10).fill(0),
  flags: 0,
  first: 0,
  last: 9,
});
function fixture(code: 0 | 1) {
  const pack = campaignFixture(),
    raw = Array(229376).fill(0);
  for (let i = 0; i < 16384; i++) {
    put(raw, i * 14 + 2, 1000);
    raw[i * 14 + 5] = 7;
  }
  const terrain = terrainFromBytes(raw),
    tables = pack.rules!.tables,
    rng = { seed: 0, draws: 0, ring: 31 },
    prior: N = Array.from({ length: 81 }, (_, i) =>
      i >= 31 && i < 39 ? null : (i * 7) & 255,
    );
  prior[6] = 0;
  const made = makeDestructionEffect(
    prior,
    {
      slot: 0,
      code,
      owner: 0,
      position: [1024, 1024],
      height: 2000,
      angles: [0, 0, 0],
      parameter: 0,
      delay: 0,
    },
    terrain,
    rng,
    tables,
    profile(),
  );
  return { pack, terrain, tables, rng, prior, made, n: made.native };
}
function target(kind: number, index = 0, x = 1024, height = 2000): BlastTarget {
  const n: N = Array(
    kind === 1
      ? 124
      : kind === 3
        ? 200
        : kind === 4
          ? 67
          : kind === 2
            ? 49
            : 97,
  ).fill(0);
  n.fill(null, 31, 39);
  n[6] = kind;
  n[24] = 4;
  put(n, 7, x);
  put(n, 9, 1024);
  put(n, 15, index);
  put32(n, 17, 2000);
  put32(n, 39, height);
  put(n, 43, 100);
  return {
    id: `source:${kind - 1}:${index}`,
    kind,
    index,
    owner: 4,
    position: [x, 1024],
    height,
    relativeHeight: height - 2000,
    movable: false,
    native: n,
    plantProtected: false,
  };
}
function area(
  list: BlastTarget[],
  tables: ReturnType<typeof fixture>["tables"],
) {
  let countdown = 1200;
  const calls: {
      target: SourceEntityId;
      amount: number;
      attacker: SourceEntityId | null;
    }[] = [],
    plants: string[] = [];
  const c: BlastAreaContext = {
    tables,
    directions: [
      [-256, -256],
      [-256, 0],
      [-256, 256],
      [0, -256],
      [0, 0],
      [0, 256],
      [256, -256],
      [256, 0],
      [256, 256],
    ],
    readCountdown: () => countdown,
    writeCountdown: (v) => {
      countdown = v;
    },
    head: (p) =>
      p[0] === 1024 && p[1] === 1024 ? (list[0]?.id ?? null) : null,
    resolve: (id) => {
      const t = list.find((t) => t.id === id);
      if (!t) throw Error("missingactualtarget");
      return t;
    },
    next: (id) => list[list.findIndex((t) => t.id === id) + 1]?.id ?? null,
    damage: (target, amount, attacker) =>
      calls.push({ target, amount, attacker }),
    plantDamage: (id, amount) => plants.push(`damage:${id}:${amount}`),
    plantIgnite: (id) => plants.push(`ignite:${id}`),
  };
  return {
    c,
    calls,
    plants,
    get countdown() {
      return countdown;
    },
  };
}
describe("Shepherd blast0/1 exactnumeric contracts", () => {
  it.each([0, 1] as const)(
    "constructs code%d with10 originalzero-holdframes, audio6 and retained slotbytes without RNG",
    (code) => {
      const f = fixture(code);
      expect(f.made.areaRequired).toBe(true);
      expect(f.made.events).toEqual([
        {
          type: "audio",
          channel: 6,
          mode: 2,
          parameter: 0,
          volume: 127,
          ratePercent: 100,
        },
      ]);
      expect(f.rng.draws).toBe(0);
      expect(word(f.n, 74)).toBe(-1);
      for (const i of [30, 67, 68, 71, 72, 73, 76, 77, 78, 79, 80])
        expect(f.n[i]).toBe(f.prior[i]);
      expect(() =>
        makeDestructionEffect(
          f.prior,
          {
            slot: 0,
            code,
            owner: 0,
            position: [0, 0],
            height: 0,
            angles: [0, 0, 0],
            parameter: 0,
            delay: 0,
          },
          f.terrain,
          f.rng,
          f.tables,
          { ...profile(), holds: Array(9).fill(0), last: 8 },
        ),
      ).toThrow(
        "animationprofile".replace("animationprofile", "animation profile"),
      );
    },
  );
  it.each([0, 1] as const)(
    "uses code%d radiusandseparatecreature/specialist/building/family7damage",
    (code) => {
      const f = fixture(code),
        creature = target(1),
        specialist = target(3),
        building = target(4),
        family7 = target(7),
        a = area([creature, specialist, building, family7], f.tables);
      runBlastArea(f.n, 0, null, f.rng, a.c);
      expect(a.calls.map((v) => [v.amount, v.attacker])).toEqual([
        [(code + 1) * 6 + 8, "source:4:0"],
        [code * 4 + 12, "source:4:0"],
        [code * 8 + 8, "source:4:0"],
        [1, null],
      ]);
      expect(a.countdown).toBe(1190);
      expect(f.rng.draws).toBe(0);
    },
  );
  it.each([0, 1] as const)(
    "credits sourceShepherdcreaturedamagefor%d andforcesonlythenominatedfarbuilding",
    (code) => {
      const f = fixture(code),
        creature = target(1),
        specialist = target(3),
        building = target(4, 0, 1024, 10000),
        actor = target(3, 7),
        a = area([creature, specialist, building, actor], f.tables);
      actor.native[129] = 1;
      put(actor.native, 127, 0);
      a.c.next = (id) =>
        id === creature.id
          ? specialist.id
          : id === specialist.id
            ? building.id
            : null;
      runBlastArea(f.n, 1, actor.id, f.rng, a.c);
      expect(a.calls.map((v) => [v.amount, v.attacker])).toEqual([
        [(code + 1) * 24 + 16, "source:4:0"],
        [code * 2 + 6, "source:4:0"],
        [code * 4 + 4, null],
      ]);
      expect(word(actor.native, 132) + word(actor.native, 134)).toBe(9);
    },
  );
  it("keeps radiusstrictanddoesnotinfergroupdamagefromthehighertier", () => {
    const f = fixture(0),
      inside = target(1, 0, 1087),
      edge = target(1, 1, 1088),
      a = area([inside, edge], f.tables);
    runBlastArea(f.n, 0, null, f.rng, a.c);
    expect(a.calls.map((v) => v.target)).toEqual([inside.id]);
    const one = fixture(1),
      at128 = target(1, 2, 1152),
      b = area([at128], one.tables);
    runBlastArea(one.n, 0, null, one.rng, b.c);
    expect(b.calls).toEqual([]);
  });
  it("code0stillconsumesplantbranchdrawbutcannotdamageorignite; code1takesonlytheactualhitbranch", () => {
    const zero = fixture(0),
      p = target(2),
      a = area([p], zero.tables);
    runBlastArea(zero.n, 0, null, zero.rng, a.c);
    expect(a.plants).toEqual([]);
    expect(zero.rng.draws).toBe(1);
    const one = fixture(1),
      b = area([p], one.tables);
    runBlastArea(one.n, 0, null, one.rng, b.c);
    expect(b.plants).toEqual([`damage:${p.id}:4`]);
    expect(one.rng.draws).toBe(1);
    p.plantProtected = true;
    runBlastArea(one.n, 0, null, one.rng, b.c);
    expect(one.rng.draws).toBe(1);
  });
  it.each([0, 1] as const)(
    "applies source%dairimpulsewithoutchangingordersandgroundimpulsewithonedraw",
    (code) => {
      const f = fixture(code),
        t = target(1, 0, 1024, 2100),
        a = area([t], f.tables);
      t.movable = true;
      put(t.native, 49, 1000);
      put(t.native, 63, 777);
      put(t.native, 11, 222);
      runBlastArea(f.n, 0, null, f.rng, a.c);
      expect(word(t.native, 49)).toBe(9192);
      expect(word(t.native, 63)).toBe(777);
      expect(word(t.native, 11)).toBe(222);
      expect(f.rng.draws).toBe(0);
      t.relativeHeight = 0;
      t.height = 2000;
      runBlastArea(f.n, 0, null, f.rng, a.c);
      expect(f.rng.draws).toBe(1);
    },
  );
  it("followscurrentnextlinksafterrealrecursivedamageandkeepsmissingservicesexplicit", () => {
    const f = fixture(1),
      one = target(4, 0),
      two = target(4, 1),
      three = target(4, 2),
      a = area([one, two, three], f.tables);
    let retired = false;
    a.c.next = (id) => (id === one.id ? (retired ? three.id : two.id) : null);
    a.c.damage = (id, amount, attacker) => {
      a.calls.push({ target: id, amount, attacker });
      retired = true;
    };
    runBlastArea(f.n, 0, null, f.rng, a.c);
    expect(a.calls.map((v) => v.target)).toEqual([one.id, three.id]);
    a.c.damage = undefined as never;
    expect(() => runBlastArea(f.n, 0, null, f.rng, a.c)).toThrow(
      "damage virtual",
    );
  });
  it.each([0, 1] as const)(
    "runs fullsource%dcallbacktolastframeandretirementwithoutrepeatingimmediatearea",
    (code) => {
      const f = fixture(code);
      f.n[30] = 0;
      let n = f.n;
      const before = { ...f.rng };
      const c = {
        frame: 0,
        gravity: 512,
        water: 0,
        terrain: f.terrain,
        tables: f.tables,
        bounce: Array(8).fill(128),
        friction: Array(8).fill(32),
        profile,
        particle: () => {
          throw Error("blast0/1hasnochild");
        },
      };
      for (let i = 0; i < 8; i++) {
        const r = stepDestructionEffect(n, f.rng, c);
        expect(r.retirementRequired).toBe(false);
        n = r.native;
      }
      const r = stepDestructionEffect(n, f.rng, c);
      expect(r.native[27]).toBe(9);
      expect(r.retirementRequired).toBe(true);
      expect(f.rng).toEqual(before);
    },
  );
});
function host() {
  const pack = campaignFixture();
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 10 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 71 }, () => ({
      first: 0,
      last: 9,
      rawTrailingWord: 10,
    })),
  };
  const w = createCampaign(pack, "synthetic-shepherd-blast");
  const calls: number[] = [];
  const options: EffectSchedulerOptions<CampaignWorld> = {
    gravity: 512,
    obstacleAt: () => false,
    cleanupReferences: cleanupCampaignReferences,
    blastArea: (staged, n) => {
      expect(staged.powerEffects.slots[0].occupied).toBe(true);
      expect(n[6]).toBe(5);
      expect(staged.spatial.nodes["source:4:0"]).toBeDefined();
      calls.push(n[69]!);
      return {
        tables: pack.rules!.tables,
        directions: Array.from(
          { length: 9 },
          (_, i) =>
            [(Math.floor(i / 3) - 1) * 256, ((i % 3) - 1) * 256] as [
              number,
              number,
            ],
        ),
        readCountdown: () => staged.countdown,
        writeCountdown: (v) => {
          staged.countdown = v;
        },
        head: () => null,
        resolve: () => {
          throw Error("emptyactualchain");
        },
        next: () => null,
        damage: () => {
          throw Error("emptyactualchain");
        },
      };
    },
  };
  return { pack, w, options, calls };
}
describe("Shepherd0/1sharedhostobligations", () => {
  it.each([0, 1] as const)(
    "publishes%dthenrunsimmediateareaonceandcontinuesaserializablescheduledlifecycle",
    (code) => {
      const f = host(),
        request = {
          code,
          owner: 0,
          position: [8192, 8192] as [number, number],
          height: 2048,
          angles: [0, 0, 0] as [number, number, number],
          parameter: 0,
          delay: 0,
        };
      expect(
        createCampaignDestructionEffect(f.w, request, f.pack, f.options),
      ).toBe(0);
      expect(f.calls).toEqual([code]);
      validateSpatial(f.w.spatial);
      const saved = JSON.parse(JSON.stringify(f.w)) as CampaignWorld;
      const savedOptions = {
        ...f.options,
        blastArea: () => {
          throw Error("callbackmustnotrepeatblastarea");
        },
      };
      for (let i = 0; i < 12; i++) {
        f.w.frame++;
        saved.frame++;
        stepEffectScheduler(f.w, f.pack, savedOptions);
        stepEffectScheduler(saved, f.pack, savedOptions);
      }
      expect(JSON.parse(JSON.stringify(saved))).toEqual(
        JSON.parse(JSON.stringify(f.w)),
      );
      expect(f.w.powerEffects.slots[0].occupied).toBe(false);
      expect(f.calls).toEqual([code]);
      validateSpatial(f.w.spatial);
    },
  );
  it("rollsbackfactorypublicationandreleasedslot/RNGwhentheactualimmediateareaservicefails", () => {
    const f = host(),
      before = JSON.stringify(f.w);
    expect(() =>
      createCampaignDestructionEffect(
        f.w,
        {
          code: 0,
          owner: 0,
          position: [8192, 8192],
          height: 2048,
          angles: [0, 0, 0],
          parameter: 0,
          delay: 0,
        },
        f.pack,
        {
          ...f.options,
          blastArea: () => {
            throw Error("actualrecursiveservicemissing");
          },
        },
      ),
    ).toThrow("actualrecursiveservicemissing");
    expect(JSON.stringify(f.w)).toBe(before);
    validateSpatial(f.w.spatial);
  });
});

function projectileHost(code: 37 | 38) {
  const f = host(),
    w = f.w,
    pack = f.pack;
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, selector) => ({
      code: selector,
      retirementMode: 0,
      gravity: false,
      priority: selector === 0 ? 6 : selector === 1 ? 5 : 1,
      childCode: null,
      movable: false,
      waterResponse: false,
    })),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  pack.assets.EFF.animations = Array.from({ length: 71 }, (_, i) => ({
    first: 0,
    last: i === 37 || i === 38 ? 0 : 9,
    rawTrailingWord: i === 37 || i === 38 ? 1 : 10,
  }));
  for (const i of [37, 38])
    Object.assign(pack.effectRules!.descriptors[i], {
      priority: 9,
      retirementMode: 4,
      childCode: i - 37,
      movable: true,
      waterResponse: true,
    });
  pack.ecologyRules!.muleCombat = {
    queryRadius: 512,
    attack: 20,
    defense: 2,
    disposition: 50,
    foodWeights: [10, 20, 30],
    attackChannel: 41,
  };
  const actor = w.specialists.records[0],
    binding = w.specialists.bindings[0]!;
  if (w.spatial.nodes["source:2:0"])
    unlinkSpatial(w.spatial, w.terrain, "source:2:0");
  actor[6] = 3;
  actor[24] = 0;
  put(actor, 15, 0);
  put(actor, 7, 8192);
  put(actor, 9, 8192);
  put32(actor, 17, 2048);
  put32(actor, 39, 2048);
  actor[130] = 0;
  binding.category = 3;
  const bp = 22 + binding.blueprintIndex * 36;
  w.players[0].raw[bp + 22] = 3;
  insertSpatial(w.spatial, w.terrain, "source:2:0", worldCell(8192, 8192));
  const created = initializeMuleNative(
    w.creatureNative[0],
    w.rng,
    { slot: 0, owner: 4, position: [8448, 8192], quality: 50 },
    { terrain: w.terrain, tables: pack.rules!.tables },
  );
  if (!created.ok) throw Error(created.reason);
  const n = created.value.native;
  w.rng = created.value.rng;
  n[94] = 8;
  // This scheduler fixture holds its target stationary;6D830 must forecast
  // that same stationary physical state while only effects are being stepped.
  for (const offset of [45, 47, 49, 61, 63]) put(n, offset, 0);
  put(n, 98, 100);
  put(n, 100, 100);
  put(n, 106, 100);
  w.ecology.mules = w.ecology.mules.filter((m) => m.index !== 0);
  w.ecology.mules.push({ id: "source:0:0", index: 0, native: n, pending: [] });
  w.creatureNative[0] = n;
  if (w.spatial.nodes["source:0:0"])
    unlinkSpatial(w.spatial, w.terrain, "source:0:0");
  insertSpatial(w.spatial, w.terrain, "source:0:0", worldCell(8448, 8192));
  synchronizeCampaignLinks(w);
  f.options.stageHost = (original, staged) => {
    staged.specialists = cloneSpecialistPool(original.specialists);
    staged.buildingNative = original.buildingNative.map((n) => n.slice());
    staged.creatureNative = original.creatureNative.map((n) => n.slice());
    for (const m of staged.ecology.mules)
      staged.creatureNative[m.index] = m.native;
  };
  f.options.commitHost = (target, staged) => {
    target.specialists = staged.specialists;
    target.buildingNative = staged.buildingNative;
    target.creatureNative = staged.creatureNative;
  };
  f.options.shepherdEffect = (staged, slot, out) =>
    stepCampaignShepherdEffect(staged, slot, pack, f.options, out);
  f.options.destructionObstacle = () => null;
  f.options.blastArea = (staged, image) => {
    f.calls.push(image[69]!);
    const context = campaignBlastAreaContext(staged, pack, {
      damageSpecialist: () => {
        throw Error("unexpectedspecialistdamage");
      },
      damageBuilding: () => {
        throw Error("unexpectedbuildingdamage");
      },
      effectOptions: () => f.options,
    });
    const damage = context.damage;
    context.damage = (id, amount, attacker) => {
      const actor = staged.specialists.records[0],
        binding = staged.specialists.bindings[0],
        raw = staged.players[0].raw,
        mule = staged.ecology.mules.find((m) => m.index === 0)!.native;
      try {
        damage(id, amount, attacker);
      } finally {
        expect(staged.specialists.records[0]).toBe(actor);
        expect(staged.specialists.bindings[0]).toBe(binding);
        expect(staged.players[0].raw).toBe(raw);
        expect(staged.ecology.mules.find((m) => m.index === 0)!.native).toBe(
          mule,
        );
        expect(staged.creatureNative[0]).toBe(mule);
      }
    };
    return context;
  };
  const speedWord = code === 37 ? 50 : 60,
    shot: ShepherdShot = {
      actor: 0,
      target: { kind: 1, index: 0 },
      projectileIndex: code - 37,
      profile: { speedWord, rangeFactor: 20, cooldown: 3, effectCode: code },
      position: [8192, 8192],
      height: 2048,
      owner: 0,
      aimSpeed: speedWord << 6,
      aimHeightOffset: 1280,
      parameter: 32,
      delay: 0,
    };
  expect(createStagedShepherdShot(w, shot, pack, f.options)).toBe(true);
  return f;
}
describe("real Shepherd projectile to blast to Mule host chain", () => {
  it.each([37, 38] as const)(
    "runs projectile%d through its real blast and Mule/blood services, then preserves save continuation",
    (code) => {
      const f = projectileHost(code);
      let created = false;
      for (let i = 0; i < 12 && f.w.powerEffects.slots[0].occupied; i++) {
        f.w.frame++;
        const r = stepEffectScheduler(f.w, f.pack, f.options);
        if (r.createdNewborns) {
          created = true;
          expect(r.shepherd).toHaveLength(1);
        }
      }
      expect(created).toBe(true);
      expect(f.calls).toEqual([code - 37]);
      const mule = f.w.ecology.mules.find((m) => m.index === 0)!;
      expect(word(mule.native, 106)).toBeLessThan(100);
      expect(f.w.creatureNative[0]).toBe(mule.native);
      expect(
        f.w.powerEffects.slots.some(
          (s) => s.occupied && s.nativePrior![69] === 32,
        ),
      ).toBe(true);
      expect(f.w.powerEffects.slots[0].occupied).toBe(false);
      validateSpatial(f.w.spatial);
      const saved = JSON.parse(JSON.stringify(f.w)) as CampaignWorld;
      for (let i = 0; i < 5; i++) {
        f.w.frame++;
        saved.frame++;
        stepEffectScheduler(f.w, f.pack, f.options);
        stepEffectScheduler(saved, f.pack, f.options);
      }
      expect(JSON.parse(JSON.stringify(saved))).toEqual(
        JSON.parse(JSON.stringify(f.w)),
      );
      validateSpatial(f.w.spatial);
    },
  );
  it("rolls back the entire scheduler when the real blood factory fails after blast damage starts", () => {
    const f = projectileHost(37);
    f.pack.assets.EFF.animations![32] = {
      first: 0,
      last: 0,
      rawTrailingWord: 1,
    };
    let refused = false;
    for (let i = 0; i < 12 && !refused; i++) {
      f.w.frame++;
      const before = JSON.stringify(f.w),
        specialists = f.w.specialists,
        actor = f.w.specialists.records[0],
        binding = f.w.specialists.bindings[0],
        raw = f.w.players[0].raw,
        natives = f.w.creatureNative,
        mule = f.w.ecology.mules.find((m) => m.index === 0)!.native,
        rng = f.w.rng;
      try {
        stepEffectScheduler(f.w, f.pack, f.options);
      } catch (error) {
        expect(String(error)).toContain("selector32 ten zero-hold");
        expect(JSON.stringify(f.w)).toBe(before);
        expect(f.w.specialists).toBe(specialists);
        expect(f.w.specialists.records[0]).toBe(actor);
        expect(f.w.specialists.bindings[0]).toBe(binding);
        expect(f.w.players[0].raw).toBe(raw);
        expect(f.w.creatureNative).toBe(natives);
        expect(f.w.creatureNative[0]).toBe(mule);
        expect(f.w.rng).toBe(rng);
        refused = true;
      }
    }
    expect(refused).toBe(true);
    expect(
      word(f.w.ecology.mules.find((m) => m.index === 0)!.native, 106),
    ).toBe(100);
    expect(f.w.powerEffects.slots[0].occupied).toBe(true);
    validateSpatial(f.w.spatial);
  });
});

import { describe, it, expect } from "vitest";
import {
  aimShepherdProjectile,
  createShepherdProjectileNative,
  createShepherdProjectileRecord,
  stepShepherdProjectileRecord,
  type ShepherdProjectileCode,
} from "../src/sim/mechanics/shepherd-projectile";
import {
  stepImpactProjectileRecord,
  type ImpactProjectileStepContext,
  type ImpactProjectileChildRequest,
  type GeneticistEffectEntity,
} from "../src/sim/mechanics/geneticist-projectile";
import { campaignFixture } from "./fixtures/campaign";
import {
  putEffectWord as put,
  putEffectDword as put32,
} from "../src/sim/mechanics/power-motion";
import type {
  ShepherdShot,
  ShepherdTarget,
} from "../src/sim/mechanics/shepherd";
type N = (number | null)[];
const word = (n: readonly (number | null)[], p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
const descriptor = (code: number) => ({
  code,
  completion: 4,
  gravity: false,
  priority: 9,
  childCode: code - 37,
  obstacle: true,
  water: true,
});
const profile = { first: 0, last: 0, flags: 0, holds: [0] };
function numeric(code: ShepherdProjectileCode = 37) {
  const tables = campaignFixture().rules!.tables,
    terrain = { bytes: Array(229376).fill(0), revision: 0 };
  for (let i = 0; i < 16384; i++) {
    put(terrain.bytes, i * 14 + 2, 1024);
    terrain.bytes[i * 14 + 5] = 2;
  }
  const prior: N = Array.from({ length: 81 }, (_, i) => (i * 17) & 255);
  prior.fill(null, 31, 39);
  prior[6] = 0;
  const r = {
      code,
      owner: 0,
      position: [8192, 8192] as [number, number],
      height: 4096,
      angles: [512, 512, 3200] as [number, number, number],
      parameter: 32,
      delay: 0,
      parent: { kind: 3, index: 2 },
    },
    c = { terrain, tables, descriptor: descriptor(code), profile };
  const made = createShepherdProjectileNative(prior, 0, r, c),
    rng = { seed: 5428, ring: 31, draws: 0 },
    children: ImpactProjectileChildRequest[] = [];
  const step: ImpactProjectileStepContext = {
    ...c,
    frame: 0,
    water: 0,
    bounce: Array(8).fill(128),
    players: Array.from({ length: 4 }, () => Array(1805).fill(0)),
    speciesComponents: Array.from({ length: 25 }, () => [4, 4]),
    nearby: () => [],
    entity: () => null,
    obstacle: () => null,
    child(q) {
      children.push(q);
      return true;
    },
  };
  return { prior, r, c, made, rng, children, step };
}
function target(kind: 1 | 3 | 4 = 1, index = 1): ShepherdTarget {
  const n: N = Array(kind === 1 ? 124 : kind === 3 ? 200 : 67).fill(0);
  n.fill(null, 31, 39);
  n[6] = kind;
  n[24] = 1;
  put(n, 15, index);
  put(n, 7, 8704);
  put(n, 9, 8192);
  put32(n, 17, 2048);
  if (kind !== 4) put32(n, 39, 4096);
  return { kind, index, native: n, physicalHeight: kind === 4 ? 2048 : 4096 };
}
const actor = () => {
  const n = target(3, 2).native;
  put(n, 7, 8192);
  n[24] = 0;
  return n;
};
describe("Shepherd37..40 source projectile family", () => {
  it.each([37,38,39,40] as const)("retains projectile%d motion with negative native water",code=>{
    const f=numeric(code),n=f.made.native;
    n[30]=0;
    const result=stepShepherdProjectileRecord(n,f.rng,{...f.step,frame:3,water:-2208});
    expect(result.retirementRequired).toBe(false);
    expect(word(result.native,7)).not.toBe(word(n,7));
    expect(f.children).toEqual([]);
    expect(()=>stepShepherdProjectileRecord(n,f.rng,{...f.step,water:-2147483649})).toThrow(/context required/);
  });
  it.each([37, 38, 39, 40] as const)(
    "constructs exacttier%d retained image, sourceaudio andcorrespondingimpactchild",
    (code) => {
      const f = numeric(code),
        n = f.made.native;
      expect(n[69]).toBe(code);
      expect(n[30]).toBe(f.prior[30]);
      expect(n.slice(67, 69)).toEqual(f.prior.slice(67, 69));
      expect(n.slice(77)).toEqual(f.prior.slice(77));
      expect(n[76]).toBe(0);
      expect(word(n, 71)).toBe(2);
      expect(n[73]).toBe(3);
      expect(word(n, 74)).toBe(32);
      expect(f.made.events[0].cue).toBe(code - 28);
      expect(f.rng.draws).toBe(0);
      put(n, 74, 0);
      const r = stepShepherdProjectileRecord(n, f.rng, f.step);
      expect(r.retirementRequired).toBe(true);
      expect(r.newborns).toBe(1);
      expect(f.children).toHaveLength(1);
      expect(f.children[0]).toMatchObject({
        code: code - 37,
        owner: 0,
        parameter: 0,
        parent: { kind: 3, index: 2 },
        newborn: true,
      });
      expect(n[6]).toBe(5);
      expect(r.native[6]).toBe(5);
    },
  );
  it("maps parameterzero to-1 and retains delaybyte instead ofinventing lifetime", () => {
    const f = numeric(),
      r = createShepherdProjectileNative(
        f.prior,
        199,
        { ...f.r, parameter: 0, delay: 255 },
        f.c,
      );
    expect(word(r.native, 74)).toBe(-1);
    expect(r.native[29]).toBe(255);
    expect(r.native[30]).toBe(f.prior[30]);
    const unknown = f.prior.slice();
    unknown[67] = null;
    expect(() => createShepherdProjectileNative(unknown, 0, f.r, f.c)).toThrow(
      "Unknown shared effect prior byte 67",
    );
  });
  it("requires actualtierdescriptor/ANB and parent beforeallocationafterimage", () => {
    const f = numeric(),
      before = f.prior.slice();
    expect(() =>
      createShepherdProjectileNative(f.prior, 0, f.r, {
        ...f.c,
        descriptor: { ...f.c.descriptor, childCode: 3 },
      }),
    ).toThrow("descriptor");
    expect(() =>
      createShepherdProjectileNative(f.prior, 0, f.r, {
        ...f.c,
        profile: { ...profile, holds: [1] },
      }),
    ).toThrow("profile");
    expect(f.prior).toEqual(before);
  });
  it("predicts moving specialist likecreature, whilebuilding ignoresvelocityandphysicalcache", () => {
    const f = numeric(),
      a = actor(),
      m = target(1),
      s = target(3),
      b = target(4);
    for (const t of [m, s, b]) {
      put(t.native, 45, 1234);
      put(t.native, 47, -600);
      put(t.native, 49, -12);
    }
    expect(aimShepherdProjectile(a, m, 55, f.c)).toEqual(
      aimShepherdProjectile(a, s, 55, f.c),
    );
    const expected = aimShepherdProjectile(a, b, 55, f.c);
    put(b.native, 45, -9999);
    put32(b.native, 39, 1234567);
    expect(aimShepherdProjectile(a, b, 55, f.c)).toEqual(expected);
    expect(expected).not.toEqual(aimShepherdProjectile(a, s, 55, f.c));
  });
  it("forms actual54A00 shot with1280muzzleheightand32timer", () => {
    const f = numeric(38),
      a = actor(),
      t = target(),
      shot: ShepherdShot = {
        actor: 2,
        target: { kind: 1, index: 1 },
        projectileIndex: 1,
        profile: {
          speedWord: 65,
          rangeFactor: 40,
          cooldown: 20,
          effectCode: 38,
        },
        position: [8192, 8192],
        height: 4096,
        owner: 0,
        aimSpeed: 65 << 6,
        aimHeightOffset: 1280,
        parameter: 32,
        delay: 0,
      };
    const r = createShepherdProjectileRecord(f.prior, 0, shot, a, t, f.c);
    expect(dword(r.native, 39)).toBe(5376);
    expect(word(r.native, 74)).toBe(32);
    expect(r.aim).toEqual(aimShepherdProjectile(a, t, 65, f.c));
    expect(() =>
      createShepherdProjectileRecord(
        f.prior,
        0,
        { ...shot, owner: 1 },
        a,
        t,
        f.c,
      ),
    ).toThrow("retained");
  });
  it("flies withfixedfractions, twoquerydraws andsamegenericcompletion4controller", () => {
    const f = numeric(),
      before = f.made.native.slice(),
      rng = { ...f.rng },
      r = stepShepherdProjectileRecord(before, f.rng, f.step),
      generic = stepImpactProjectileRecord(before, rng, f.step);
    expect(r).toEqual(generic);
    expect(f.rng).toEqual(rng);
    expect(f.rng.draws).toBe(2);
    expect(r.retirementRequired).toBe(false);
    expect(r.native.slice(7, 11)).not.toEqual(before.slice(7, 11));
    expect(before).toEqual(f.made.native);
  });
  it("createschildbeforeparentretirement andhonorscapacityfailurewithoutfreezing", () => {
    const f = numeric(40);
    put(f.made.native, 74, 0);
    const r = stepShepherdProjectileRecord(f.made.native, f.rng, {
      ...f.step,
      child(q, _rng, n) {
        expect(n[6]).toBe(5);
        expect(q.code).toBe(3);
        return false;
      },
    });
    expect(r.retirementRequired).toBe(true);
    expect(r.newborns).toBe(0);
  });
  it("usesactualobstaclecontactindexaschildparameterandignoresparentbuilding", () => {
    const f = numeric(39);
    f.step.frame = 1;
    const r = stepShepherdProjectileRecord(f.made.native, f.rng, {
      ...f.step,
      obstacle: () => ({ kind: 4, index: 8 }),
    });
    expect(r.retirementRequired).toBe(true);
    expect(f.children[0].parameter).toBe(9);
    f.children.length = 0;
    put(f.made.native, 71, 8);
    f.made.native[73] = 4;
    expect(
      stepShepherdProjectileRecord(f.made.native, f.rng, {
        ...f.step,
        obstacle: () => ({ kind: 4, index: 8 }),
      }).retirementRequired,
    ).toBe(false);
  });
  it("collisioncreatesactualblastchildanddeflectionconsumesits5drawsinstead", () => {
    const f = numeric(),
      t = target(),
      n = f.made.native;
    put(t.native, 7, 8242);
    put(t.native, 9, 8192);
    t.native[94] = 8;
    t.native[122] = 4;
    const entity: GeneticistEffectEntity = {
      id: "source:0:1",
      index: 1,
      kind: 1,
      owner: 1,
      position: [8242, 8192],
      physicalHeight: 4096,
      native: t.native,
    };
    const r = stepShepherdProjectileRecord(n, f.rng, {
      ...f.step,
      nearby: () => [entity],
    });
    expect(r.retirementRequired).toBe(true);
    expect(f.children[0].code).toBe(0);
    f.children.length = 0;
    f.step.speciesComponents = Array.from({ length: 25 }, () => [1, 4]);
    t.native[97] = 4;
    const reflected = stepShepherdProjectileRecord(n, f.rng, {
      ...f.step,
      nearby: () => [entity],
      entity: () => ({
        id: "source:2:2",
        kind: 3,
        index: 2,
        owner: 0,
        position: [8192, 8192],
        physicalHeight: 4096,
      }),
    });
    expect(reflected.retirementRequired).toBe(false);
    expect(reflected.events[0].cue).toBe(97);
    expect(f.children).toEqual([]);
    expect(f.rng.draws).toBe(7);
  });
  it("JSON continuation retainsmotion/priorfractions/timerandRNG", () => {
    const f = numeric(),
      copy = JSON.parse(JSON.stringify({ native: f.made.native, rng: f.rng }));
    let current = f.made.native;
    for (let i = 0; i < 4; i++) {
      f.step.frame = i;
      current = stepShepherdProjectileRecord(current, f.rng, f.step).native;
      copy.native = stepShepherdProjectileRecord(
        copy.native,
        copy.rng,
        f.step,
      ).native;
    }
    expect(copy).toEqual(
      JSON.parse(JSON.stringify({ native: current, rng: f.rng })),
    );
  });
});

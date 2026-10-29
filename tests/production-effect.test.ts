import { describe, expect, it } from "vitest";
import {
  stepProductionEffectRecord,
  stepEffect26Record,
  type ProductionEffectContext,
} from "../src/sim/mechanics/production-effect";
import {
  putEffectWord as put,
  putEffectDword as put32,
  type EffectNativePrior,
} from "../src/sim/mechanics/power-motion";
import { groundHeight, terrainFromBytes } from "../src/sim/mechanics/terrain";
const word = (n: EffectNativePrior, p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const dword = (n: EffectNativePrior, p: number) =>
  n[p]! | (n[p + 1]! << 8) | (n[p + 2]! << 16) | (n[p + 3]! << 24);
function fixture() {
  const raw = Array(229376).fill(0);
  for (let i = 0; i < 16384; i++) {
    put(raw, i * 14 + 2, 1000);
    raw[i * 14 + 5] = 2;
  }
  const terrain = terrainFromBytes(raw),
    n: EffectNativePrior = Array.from({ length: 81 }, (_, p) =>
      p >= 31 && p < 39 ? null : 0,
    );
  n[6] = 5;
  n[69] = 32;
  n[28] = 1;
  n[30] = 219;
  n[76] = 99;
  n[67] = 181;
  n[68] = 193;
  put(n, 7, 1024);
  put(n, 9, 1024);
  put(n, 63, -1);
  put(n, 74, -1);
  const g = groundHeight(terrain, 1024, 1024);
  put32(n, 17, g);
  put32(n, 39, g + 3840);
  const c: ProductionEffectContext = {
    frame: 0,
    gravity: 1024,
    water: 0,
    bounce: Array(8).fill(128),
    tables: {
      atan: Array.from({ length: 257 }, (_, i) =>
        Math.round((Math.atan(i / 256) * 1024) / Math.PI),
      ),
      sine: Array.from({ length: 2048 }, (_, i) =>
        Math.trunc(Math.sin((i * Math.PI) / 1024) * 65536),
      ),
      cosine: Array.from({ length: 2048 }, (_, i) =>
        Math.trunc(Math.cos((i * Math.PI) / 1024) * 65536),
      ),
    },
    profile: { holds: Array(10).fill(0), flags: 0, first: 0, last: 9 },
    obstacleAt: () => false,
  };
  return { n, c, terrain, g };
}
describe("source production failure32/0x20 callback", () => {
  it("accepts negative physical water while retaining the unsigned native contact comparison", () => {
    const {n,c,terrain}=fixture();
    c.frame=3;c.water=-2208;
    const result=stepProductionEffectRecord(n,terrain,c);
    expect(result.queries.some(q=>q.type==='water-material')).toBe(true);
    expect(stepProductionEffectRecord(n,terrain,{...c,water:0}).queries.some(q=>q.type==='water-material')).toBe(false);
    for(const water of [-2147483649,4294967296,NaN])
      expect(()=>stepProductionEffectRecord(n,terrain,{...c,water})).toThrow(/water required/);
  });
  it("applies gravity without changing the factory acceleration, flags, or retained bytes", () => {
    const { n, c, terrain, g } = fixture(),
      before = structuredClone(n);
    put(n, 45, 256);
    put(n, 55, 32);
    const r = stepProductionEffectRecord(n, terrain, c);
    expect(word(r.native, 49)).toBe(-992);
    expect(word(r.native, 55)).toBe(32);
    expect(dword(r.native, 39)).toBe(g + 3840 + (-992 >> 3));
    expect(r.native[76]).toBe(99);
    expect(r.native[21]).toBe(0);
    expect(r.native[30]).toBe(0);
    expect(r.native.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(n.slice(0, 45)).toEqual(before.slice(0, 45));
  });
  it("uses first-impact bounce, then the separate grounded second sample", () => {
    const { n, c, terrain, g } = fixture();
    put32(n, 39, g + 100);
    put(n, 49, -1024);
    const r = stepProductionEffectRecord(n, terrain, c);
    expect(dword(r.native, 39)).toBe(g);
    expect(word(r.native, 49)).toBe(1024);
    expect(r.samples).toHaveLength(1);
    put(n, 45, 257);
    put32(n, 39, g);
    const grounded = stepProductionEffectRecord(n, terrain, c);
    expect(grounded.samples).toHaveLength(2);
    expect(dword(grounded.native, 39)).toBe(g);
    expect(word(grounded.native, 49)).toBe(0);
  });
  it("allows positive-impact virtual34 no-op on terrain rising above an airborne particle", () => {
    const { n, c, terrain, g } = fixture();
    put32(n, 17, g - 2000);
    put32(n, 39, g - 1500);
    put(n, 49, 2048);
    c.gravity = 0;
    const r = stepProductionEffectRecord(n, terrain, c);
    expect(dword(r.native, 39)).toBe(g);
    expect(word(r.native, 49)).toBe(1024);
  });
  it("queries obstacles by source parity without applying a descriptor-disabled impulse", () => {
    const { n, c, terrain } = fixture();
    c.frame = 1;
    let queried = 0;
    c.obstacleAt = () => {
      queried++;
      return true;
    };
    const hit = stepProductionEffectRecord(n, terrain, c);
    c.obstacleAt = () => false;
    const miss = stepProductionEffectRecord(n, terrain, c);
    expect(queried).toBe(1);
    expect(hit.native).toEqual(miss.native);
    expect(hit.queries[0]).toMatchObject({
      type: "obstacle",
      found: true,
      mask: 1,
    });
    c.frame = 0;
    c.obstacleAt = undefined;
    expect(stepProductionEffectRecord(n, terrain, c).queries).toEqual([]);
  });
  it("keeps underwater and water-crossing callbacks with disabled water response and zero RNG", () => {
    const { n, c, terrain, g } = fixture();
    c.frame = 3;
    c.water = g + 4000;
    for (let i = 0; i < 16384; i++) terrain.bytes[i * 14 + 5] = 0;
    const r = stepProductionEffectRecord(n, terrain, c);
    expect(r.queries.map((q) => q.type)).toEqual([
      "obstacle",
      "water-material",
    ]);
    expect(r.queries[1]).toMatchObject({ material: 0, response: false });
    expect(r.native[69]).toBe(32);
    expect(r.retirementRequired).toBe(false);
  });
  it("caps only airborne signed speed at source threshold and requantizes velocity", () => {
    const { n, c, terrain } = fixture();
    put(n, 45, 20000);
    c.gravity = 0;
    const r = stepProductionEffectRecord(n, terrain, c);
    expect(word(r.native, 61)).toBe(0x3200);
    expect(word(r.native, 45)).toBe(0x3200);
  });
  it("retires at EFF32 terminal frame after exactly nine zero-delay callbacks and survives JSON save", () => {
    const { n, c, terrain } = fixture();
    let a = n;
    for (let frame = 0; frame < 9; frame++) {
      const r = stepProductionEffectRecord(
        JSON.parse(JSON.stringify(a)),
        terrain,
        { ...c, frame },
      );
      expect(r.retirementRequired).toBe(frame === 8);
      expect(r.native[27]).toBe(frame + 1);
      a = r.native;
    }
    expect(a[6]).toBe(5);
    expect(a[30]).toBe(0);
  });
  it("rejects unknown required bytes, unbound queries and unsupported flags atomically", () => {
    const { n, c, terrain } = fixture();
    const before = structuredClone(n);
    c.frame = 1;
    c.obstacleAt = undefined;
    expect(() => stepProductionEffectRecord(n, terrain, c)).toThrow(
      /obstacle query/,
    );
    expect(n).toEqual(before);
    n[67] = null;
    expect(() => stepProductionEffectRecord(n, terrain, c)).toThrow(/Unknown/);
    n[67] = 0;
    n[21] = 32;
    expect(() => stepProductionEffectRecord(n, terrain, c)).toThrow(
      /Unsupported/,
    );
    n[21] = 0;
    c.profile.holds[0] = 1;
    expect(() => stepProductionEffectRecord(n, terrain, c)).toThrow(/EFF32/);
  });
});
describe("source26 feedback and trail common physics", () => {
  function particle26() {
    const f = fixture();
    f.n[69] = 26;
    f.n[21] = 0x20;
    f.n[29] = 2;
    f.n[73] = 4;
    f.n[76] = 73;
    f.c.profile = { holds: Array(5).fill(1), flags: 0, first: 0, last: 4 };
    f.c.obstacleAt = undefined;
    return f;
  }
  it("uses free-altitude acceleration without common gravity or obstacle queries", () => {
    const f = particle26();
    put(f.n, 49, -128);
    put(f.n, 55, -16);
    f.c.frame = 1;
    const r = stepEffect26Record(f.n, f.terrain, f.c);
    expect(word(r.native, 49)).toBe(-144);
    expect(dword(r.native, 39)).toBe(f.g + 3840 + (-144 >> 3));
    expect(r.queries).toEqual([]);
    expect(r.native[73]).toBe(4);
    expect(r.native[76]).toBe(73);
    expect(r.native[29]).toBe(2);
  });
  it("covers first-impact and already-grounded paths while preserving source fractions", () => {
    const f = particle26();
    put32(f.n, 39, f.g + 5);
    put(f.n, 49, -256);
    put(f.n, 55, 0);
    put(f.n, 45, 300);
    const hit = stepEffect26Record(f.n, f.terrain, f.c);
    expect(dword(hit.native, 39)).toBe(f.g);
    expect(word(hit.native, 49)).toBe(128);
    expect(hit.samples).toHaveLength(1);
    put32(f.n, 39, f.g);
    const grounded = stepEffect26Record(f.n, f.terrain, f.c);
    expect(grounded.samples).toHaveLength(2);
    expect(word(grounded.native, 49)).toBe(0);
    expect(grounded.native[67]).not.toBe(f.n[67]);
  });
  it("checks actual water materials but has no water or obstacle response", () => {
    const f = particle26();
    f.c.frame = 3;
    f.c.water = f.g + 4000;
    for (let i = 0; i < 16384; i++) f.terrain.bytes[i * 14 + 5] = 0;
    const r = stepEffect26Record(f.n, f.terrain, f.c);
    expect(r.queries).toEqual([
      {
        type: "water-material",
        point: r.samples[0],
        material: 0,
        response: false,
      },
    ]);
  });
  it("retains signed delay/counter semantics across JSON saves through exact terminal hold", () => {
    const f = particle26();
    let n = f.n;
    let retired = -1;
    for (let frame = 0; frame < 60; frame++) {
      const r = stepEffect26Record(JSON.parse(JSON.stringify(n)), f.terrain, {
        ...f.c,
        frame,
      });
      n = r.native;
      if (r.retirementRequired) {
        retired = frame;
        break;
      }
    }
    expect(retired).toBe(23);
    expect(n[27]).toBe(4);
    expect(n[26]).toBe(0);
    expect(n[30]).toBe(0);
    expect(n[29]).toBe(2);
    expect(n[6]).toBe(5);
  });
});

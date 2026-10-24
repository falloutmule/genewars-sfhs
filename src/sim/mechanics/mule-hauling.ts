/** Source Mule4 material work:63049..64CE7,653C8 and5D1C0.
 * All entries mutate an already isolated callback. Foreign pools remain ports. */
import { nextRandom, type GeneRng } from "./random";
import { originalAngle, type MotionTables } from "./motion";
import {
  groundHeight,
  torusDelta,
  worldCell,
  integerSqrt,
  type TerrainState,
} from "./terrain";
import type { MulePlantCarrierRequest } from "./plant-carrier";
export type HaulingNative = (number | null)[];
export type HaulingPoint = [number, number];
export interface HaulingReference {
  kind: 1 | 2 | 3 | 4 | 5;
  index: number;
}
export interface MuleHaulingContext {
  terrain: TerrainState;
  rng: GeneRng;
  tables: MotionTables;
  /** Admitted1045FC selector4 query radius, before source+512. */
  queryRadius: number;
  resolve(ref: HaulingReference): HaulingNative | null;
  /** Complete current intrusive chain, in head order. */
  cell(cell: number): readonly HaulingReference[];
  serviceBuilding(
    selectorMask: 4 | 16,
    requiredFlags: 0x10 | 0x30,
  ): HaulingNative | null;
  storageFull(): boolean;
  maximumBuildingHealth(building: HaulingNative): number;
  pointAccepted(point: HaulingPoint): boolean;
  footprintBuilding(point: HaulingPoint): HaulingNative | null;
  target(ref: HaulingReference): boolean;
  detach(): void;
  release(): void;
  attach(ref: HaulingReference): void;
  /**5F56B rebuilds81D30 from retained88/90 and task120, with owner caller. */
  resumeTask?(reference: HaulingReference | null, mode: number): void;
  occupied(): boolean;
  /** Full5AA00 using supplied, already drawn delay; may escape occupancy. */
  idle(delay: number): void;
  speed(): number;
  ignite(plant: HaulingNative): void;
  unlinkPlant(plant: HaulingNative): void;
  createPlantCarrier(
    request: MulePlantCarrierRequest,
  ): { slot: number; native: HaulingNative } | null;
  audio(cue: number): void;
}
export const haulingByte = (
  n: readonly (number | null)[],
  p: number,
): number => {
  const v = n[p];
  if (v == null || !Number.isInteger(v) || v < 0 || v > 255)
    throw Error(`Actual material-work byte${p} required`);
  return v;
};
export const haulingWord = (n: readonly (number | null)[], p: number) =>
  ((haulingByte(n, p) | (haulingByte(n, p + 1) << 8)) << 16) >> 16;
export const haulingDword = (n: readonly (number | null)[], p: number) =>
  haulingByte(n, p) |
  (haulingByte(n, p + 1) << 8) |
  (haulingByte(n, p + 2) << 16) |
  (haulingByte(n, p + 3) << 24);
export const haulingPut = (n: HaulingNative, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >>> 8) & 255;
};
export const haulingPoint = (n: readonly (number | null)[]): HaulingPoint => [
  haulingWord(n, 7),
  haulingWord(n, 9),
];
const wrap = (v: number) => (v << 16) >> 16;
function ref(n: HaulingNative, p: number): HaulingReference | null {
  const kind = haulingByte(n, p + 2),
    index = haulingWord(n, p);
  if (!kind || index < 0) return null;
  if (kind < 1 || kind > 5)
    throw Error("Actual material reference kind required");
  return { kind: kind as HaulingReference["kind"], index };
}
function bind(n: HaulingNative, p: number, r: HaulingReference) {
  haulingPut(n, p, r.index);
  n[p + 2] = r.kind;
}
function get(c: MuleHaulingContext, r: HaulingReference | null) {
  if (!r) return null;
  const n = c.resolve(r);
  if (!n || haulingWord(n, 15) !== r.index)
    throw Error("Actual retained material binding required");
  return n;
}
export function haulingDistance(
  t: TerrainState,
  a: HaulingPoint,
  b: HaulingPoint,
) {
  const x = torusDelta(b[0], a[0]),
    y = torusDelta(b[1], a[1]),
    z = (groundHeight(t, ...b) - groundHeight(t, ...a)) >> 3;
  return (Math.imul(x, x) + Math.imul(y, y) + Math.imul(z, z)) | 0;
}
/**5D7D0 preserves signed32 wrapping, strict comparison and Recycler ties. */
export function chooseMuleMaterialBuilding(
  n: HaulingNative,
  pulper: HaulingNative | null,
  recycler: HaulingNative | null,
  t: TerrainState,
): HaulingNative | null {
  const kind = haulingByte(n, 93);
  if (kind === 1) return recycler;
  if (kind !== 2 && kind !== 5) return null;
  if (!pulper || !recycler) return pulper ?? recycler;
  let p =
    (haulingDistance(t, haulingPoint(n), haulingPoint(pulper)) + 0x100000) | 0;
  const r =
      (haulingDistance(t, haulingPoint(n), haulingPoint(recycler)) + 0x400000) |
      0,
    delta = (haulingDword(pulper, 54) - 20 * (haulingByte(pulper, 46) + 2)) | 0,
    v = delta << 7,
    bias = Math.imul(v, v);
  p = (p + (delta < 0 ? -bias : bias)) | 0;
  return r > p ? pulper : recycler;
}
/**58ED0 is a nominated building route, including the retained4D and bit80. */
export function setMuleMaterialBuildingRoute(
  n: HaulingNative,
  b: HaulingNative,
  offset: HaulingPoint,
) {
  const p = haulingPoint(b);
  haulingPut(n, 11, p[0] + offset[0]);
  haulingPut(n, 13, p[1] + offset[1]);
  n[22] = haulingByte(n, 22) & 63;
  haulingPut(n, 73, (haulingWord(n, 73) | 20) & 0xeffc);
  n[84] = 20;
  n[79] = n[82] = 0;
  bind(n, 77, { kind: 4, index: haulingWord(b, 15) });
  n[73] = haulingByte(n, 73) | 128;
}
function follow(n: HaulingNative, p: HaulingPoint, clear = 63) {
  haulingPut(n, 11, p[0]);
  haulingPut(n, 13, p[1]);
  n[22] = haulingByte(n, 22) & clear;
  haulingPut(n, 73, (haulingWord(n, 73) | 20) & 0xeffc);
  n[84] = 20;
  n[79] = n[82] = 0;
}
function start(n: HaulingNative, c: MuleHaulingContext) {
  haulingPut(n, 63, c.speed());
  haulingPut(n, 108, 32767);
  n[96] = haulingByte(n, 96) | 128;
}
/**Mule virtual84=1EE50 (also used by pending travel cancellation). */
export function stopMuleMaterialMotion(n: HaulingNative) {
  haulingPut(n, 63, 0);
  haulingPut(n, 73, haulingWord(n, 73) & 0xefe8);
  n[84] = 0;
  n[22] = haulingByte(n, 22) & 63;
  haulingPut(n, 73, haulingWord(n, 73) & 0xeffc);
  n[22] = haulingByte(n, 22) & 127;
}
/**5AA00 idle with actual73C20 two-draw occupancy escape. */
export function idleMuleMaterial(
  n: HaulingNative,
  delay: number,
  c: MuleHaulingContext,
) {
  n[94] = 8;
  if (!c.occupied()) {
    haulingPut(n, 108, delay);
    return;
  }
  const at = haulingPoint(n),
    angle = nextRandom(c.rng) * 8,
    length = (256 * nextRandom(c.rng)) >> 8,
    a = (angle + 1536) & 2047;
  const p: HaulingPoint = [
    (wrap(
      wrap(at[0] * 2) + (Math.imul(length * 2, c.tables.cosine[a]) >> 16),
    ) >>
      1) &
      32767,
    (wrap(wrap(at[1] * 2) + (Math.imul(length * 2, c.tables.sine[a]) >> 16)) >>
      1) &
      32767,
  ];
  follow(n, p, 191);
  n[22] = haulingByte(n, 22) & 127;
  start(n, c);
}
/**Completed hit16/20's non-move task prefix. A missing target is deliberately
 * passed to81D30; its source afterimage clears120 rather than retaining work. */
export function resumeMuleMaterialTask(
  n: HaulingNative,
  c: MuleHaulingContext,
): void {
  if (haulingByte(n, 120) === 0 || (haulingWord(n, 73) & 3) === 3) return;
  if (haulingByte(n, 120) === 7)
    throw Error("Move task uses its distinct81C60 caller");
  if (!c.resumeTask)
    throw Error("Mule hit resume requires actual retained81D30 task service");
  c.resumeTask(ref(n, 88), haulingByte(n, 120));
}
function same(c: MuleHaulingContext, n: HaulingNative, r: HaulingReference) {
  return c
    .cell(worldCell(...haulingPoint(n)))
    .some((x) => x.kind === r.kind && x.index === r.index);
}
/**5D1C0. Capacity failure precedes every plant flag/ref/ignition/unlink write. */
export function pickUpMuleMaterial(
  n: HaulingNative,
  r: HaulingReference,
  c: MuleHaulingContext,
): boolean {
  const target = get(c, r)!;
  if (haulingByte(target, 6) === 2) {
    const made = c.createPlantCarrier({
      position: haulingPoint(n),
      height: haulingDword(n, 39),
      angles: [haulingWord(n, 57), haulingWord(n, 59), haulingWord(n, 61)],
      owner: 0,
      parameter: 0,
      delay: 0,
    });
    if (!made) return false;
    if (
      haulingByte(made.native, 6) !== 5 ||
      haulingWord(made.native, 15) !== made.slot ||
      haulingByte(made.native, 69) !== 67
    )
      throw Error("Actual shared carrier67 factory identity required");
    bind(n, 91, { kind: 5, index: made.slot });
    if (!(haulingByte(target, 46) & 8)) c.ignite(target);
    bind(made.native, 71, r);
    target[46] = haulingByte(target, 46) | 16;
    c.unlinkPlant(target);
    n[96] = haulingByte(n, 96) | 2;
    return true;
  }
  if (haulingByte(target, 6) === 1) {
    if (haulingByte(target, 94) < 24)
      throw Error(
        "Live creature pickup requires its separate5D1C0 release/stop service",
      );
    target[97] = haulingByte(target, 97) | 1;
    n[96] = haulingByte(n, 96) | 2;
    bind(n, 91, r);
    return true;
  }
  if (haulingByte(target, 6) === 3)
    throw Error("Specialist pickup requires actual51E80 cancellation service");
  return false;
}
function buildings(n: HaulingNative, c: MuleHaulingContext, carrying: boolean) {
  let p = c.serviceBuilding(4, carrying ? 0x10 : 0x30),
    r = c.serviceBuilding(16, carrying ? 0x10 : 0x30);
  if (p && haulingDword(p, 54) === 40 * (haulingByte(p, 46) + 2)) p = null;
  if (!carrying && r && c.storageFull()) r = null;
  return { p, r };
}
function sendToBuilding(
  n: HaulingNative,
  b: HaulingNative,
  c: MuleHaulingContext,
  pickup: 0 | 1 | 2 = 0,
) {
  bind(n, 85, { kind: 4, index: haulingWord(b, 15) });
  start(n, c);
  if (pickup !== 1 && haulingWord(b, 43) < c.maximumBuildingHealth(b)) {
    follow(n, haulingPoint(b));
    bind(n, 77, { kind: 4, index: haulingWord(b, 15) });
  } else if (pickup) {
    //First draw is Y, second X in the source23A60 caller.
    const y = (nextRandom(c.rng) % 128) + 64,
      x = (nextRandom(c.rng) % 128) - 192;
    setMuleMaterialBuildingRoute(n, b, [x, y]);
  } else {
    const y = 128 + (nextRandom(c.rng) % 126),
      x = -128 - (nextRandom(c.rng) % 126);
    const p = haulingPoint(b);
    follow(n, [wrap(p[0] + x), wrap(p[1] + y)]);
  }
}
function localCorpse(
  n: HaulingNative,
  c: MuleHaulingContext,
): HaulingReference | null {
  let result: HaulingReference | null = null,
    best = -128;
  for (const r of c.cell(worldCell(...haulingPoint(n))))
    if (r.kind === 1) {
      const o = get(c, r)!;
      //Signed byte comparison in8B0E0 is intentional.
      if (
        (haulingByte(o, 94) << 24) >> 24 >= 25 &&
        !(haulingByte(o, 97) & 1) &&
        haulingWord(o, 104) > best
      ) {
        best = haulingWord(o, 104);
        result = r;
      }
    }
  return result;
}
function localCutPlant(
  n: HaulingNative,
  c: MuleHaulingContext,
): HaulingReference | null {
  const rows = c.cell(worldCell(...haulingPoint(n))),
    building = rows.find((r) => r.kind === 4),
    bn = building ? get(c, building) : null;
  for (const r of rows)
    if (r.kind === 2) {
      const p = get(c, r)!;
      if (
        haulingWord(p, 44) <= 0 &&
        haulingByte(p, 46) & 8 &&
        (!bn || haulingByte(bn, 49) & 1)
      )
        return r;
    }
  return null;
}
/**6B3B0/6B190 and6B660/6B5E0, including8D9E0 center exclusion and
 * randomized descending sector tie order. Query constructor draws precede axes. */
export function queryMuleMaterial(
  n: HaulingNative,
  c: MuleHaulingContext,
  recycle: boolean,
  uncut = false,
): HaulingReference | null {
  const radius = c.queryRadius + 512;
  if (!Number.isInteger(radius) || radius < 512 || radius > 4096)
    throw Error("Admitted material query radius required");
  const weights = Array(16).fill(0),
    best = Array(16).fill(0),
    targets: (HaulingReference | null)[] = Array(16).fill(null),
    at = haulingPoint(n);
  const angle = (p: HaulingPoint) =>
    originalAngle(
      wrap(torusDelta(p[0], at[0]) * 2),
      wrap(torusDelta(p[1], at[1]) * 2),
      c.tables.atan,
    ) & 2047;
  if (!uncut && haulingByte(n, 97) & 128)
    weights[angle([haulingWord(n, 110), haulingWord(n, 112)]) >> 7] = 300;
  const plantBonus = uncut ? 0 : nextRandom(c.rng) % 255,
    corpseBonus = !uncut && recycle ? nextRandom(c.rng) % 255 : 0,
    sx = nextRandom(c.rng) % 2 ? -256 : 256,
    sy = nextRandom(c.rng) % 2 ? -256 : 256,
    extent = radius >> 8;
  let found = false;
  for (let x = -extent; x <= extent; x++)
    for (let y = -extent; y <= extent; y++) {
      const metric = Math.imul(x * sx, x * sx) + Math.imul(y * sy, y * sy);
      if (!metric || metric > radius * radius) continue;
      const sample: HaulingPoint = [wrap(at[0] + x * sx), wrap(at[1] + y * sy)],
        rows = c.cell(worldCell(...sample)),
        base = radius - integerSqrt(metric);
      for (const r of rows) {
        if (uncut && r.kind !== 2) continue;
        if (!uncut && r.kind !== 1 && r.kind !== 2) continue;
        const o = get(c, r)!;
        if (o === n) continue;
        let score = base;
        if (r.kind === 2) {
          if (uncut) {
            if (haulingWord(o, 44) <= 0 || haulingByte(o, 46) & 4) continue;
          } else {
            if (
              haulingWord(o, 44) > 0 ||
              haulingByte(o, 46) & 20 ||
              !c.pointAccepted(haulingPoint(o))
            )
              continue;
            const b = c.footprintBuilding(haulingPoint(o));
            if (b && !(haulingByte(b, 49) & 1)) continue;
            score += plantBonus;
          }
        } else {
          if (
            !recycle ||
            haulingByte(o, 94) < 24 ||
            haulingWord(o, 96) & 0x120 ||
            !c.pointAccepted(haulingPoint(o))
          )
            continue;
          score += corpseBonus;
        }
        const sector = angle(haulingPoint(o)) >> 7;
        weights[sector] = (weights[sector] + score) | 0;
        if (score > best[sector]) {
          best[sector] = score;
          targets[sector] = r;
        }
        found = true;
        if (uncut) break; //8B340 returns the first qualifying plant per cell.
      }
    }
  if (!found) return null;
  let sector = nextRandom(c.rng) % 16,
    winning = sector,
    highest = -0x7fffffff;
  for (let count = 0; count < 16; count++, sector = (sector + 15) & 15)
    if (weights[sector] > highest) {
      highest = weights[sector];
      winning = sector;
    }
  return targets[winning];
}
function failed(n: HaulingNative, c: MuleHaulingContext, base = 10, mod = 20) {
  c.idle(base + (nextRandom(c.rng) % mod));
}
/**Source work decision after food/hostile/mating have declined.
 * Returns the actual DL work-success flag. False joins commonChoice at64CEF,
 * after preserving this work body's wait/drop/cancellation afterimages. */
export function stepMuleMaterialWork(
  n: HaulingNative,
  c: MuleHaulingContext,
): boolean {
  if (haulingByte(n, 24) >= 4) return false;
  const pending = haulingByte(n, 95);
  if (pending === 2)
    throw Error("Mule pending2 builder service is a distinct source family");
  if (pending !== 0 && pending !== 1) return false;
  if (pending === 0 && haulingByte(n, 120) !== 0) return false;
  let worked = true;
  if (haulingByte(n, 96) & 2) {
    const existing = ref(n, 85),
      old = existing?.kind === 4 ? get(c, existing) : null;
    if (!old) {
      const { p, r } = buildings(n, c, true),
        b = chooseMuleMaterialBuilding(n, p, r, c.terrain);
      if (b) sendToBuilding(n, b, c);
      else {
        stopMuleMaterialMotion(n);
        c.detach();
        n[97] = haulingByte(n, 97) | 2;
        failed(n, c, 1, 5);
        worked = false;
      }
    } else {
      stopMuleMaterialMotion(n);
      c.detach();
      n[97] = haulingByte(n, 97) | 2;
      const y = 128 + (nextRandom(c.rng) % 256),
        yaw = 1024 + (nextRandom(c.rng) % 512),
        at = haulingPoint(n),
        a = yaw >= 512 ? yaw - 512 : yaw + 1536;
      const p: HaulingPoint = [
        (wrap(wrap(at[0] * 2) + (Math.imul(y * 2, c.tables.cosine[a]) >> 16)) >>
          1) &
          32767,
        (wrap(wrap(at[1] * 2) + (Math.imul(y * 2, c.tables.sine[a]) >> 16)) >>
          1) &
          32767,
      ];
      if (c.pointAccepted(p)) {
        follow(n, p);
        start(n, c);
      } else {
        n[73] = haulingByte(n, 73) | 64;
        failed(n, c, 1, 5);
      }
      worked = false;
    }
  } else if (haulingByte(n, 96) & 64) {
    if (haulingWord(n, 73) & 0x200) {
      const r = ref(n, 85),
        p = r?.kind === 2 ? get(c, r) : null;
      if (p && !(haulingByte(p, 46) & 8)) {
        n[94] = 11;
        haulingPut(n, 108, 32767);
        p[46] = haulingByte(p, 46) | 4;
        c.audio(12);
      } else {
        worked = false;
        n[97] = haulingByte(n, 97) | 2;
        failed(n, c);
      }
      n[96] = haulingByte(n, 96) & 191;
    }
  } else {
    const { p, r } = buildings(n, c, false);
    worked = false;
    if (p || r) {
      const material = ref(n, 91),
        b =
          material && haulingWord(n, 73) & 0x200
            ? chooseMuleMaterialBuilding(n, p, r, c.terrain)
            : null;
      if (material && b) {
        //40170 runs before plant5D1C0, even when its factory later has no slot.
        if (material.kind === 2 && same(c, n, material)) {
          n.splice(110, 4, ...n.slice(7, 11));
          n[97] = haulingByte(n, 97) | 128;
        }
        if (
          (material.kind === 1 || material.kind === 2) &&
          same(c, n, material) &&
          pickUpMuleMaterial(n, material, c)
        ) {
          sendToBuilding(n, b, c, material.kind);
          worked = true;
        }
        if (!worked) n[93] = 0;
      }
      if (!worked) {
        const target =
          (r ? localCorpse(n, c) : null) ??
          localCutPlant(n, c) ??
          queryMuleMaterial(n, c, !!r);
        if (target) {
          c.target(target);
          worked = true;
        }
      }
      if (!worked) {
        const target = queryMuleMaterial(n, c, false, true);
        if (target) {
          c.target(target);
          worked = true;
        }
      }
    }
    if (!worked) failed(n, c);
  }
  if (worked) n[95] = 1;
  else if (haulingByte(n, 120) === 0) n[95] = 0;
  return worked;
}
/**653C8 positive-timer pending1 dispatch. */
export function stepMuleMaterialTravel(
  n: HaulingNative,
  c: MuleHaulingContext,
): void {
  if (haulingByte(n, 24) >= 4 || haulingByte(n, 95) !== 1) return;
  if (haulingByte(n, 96) & 2 && (haulingWord(n, 73) & 3) === 3) {
    c.detach();
    if (haulingByte(n, 97) & 128) {
      follow(n, [haulingWord(n, 110), haulingWord(n, 112)], 191);
      start(n, c);
    } else failed(n, c, 4, 5);
  } else if (haulingByte(n, 96) & 64) {
    const r = ref(n, 85),
      p = r?.kind === 2 ? get(c, r) : null;
    if (p && !(haulingByte(p, 46) & 8)) return;
    n[96] = haulingByte(n, 96) & 191;
    stopMuleMaterialMotion(n);
    failed(n, c, 5, 10);
  }
}
/**618FD state11 completion; no plant callback runs when8B4F0 is false. */
export function finishMuleMaterialCut(n: HaulingNative, c: MuleHaulingContext) {
  const r = ref(n, 85);
  if (r?.kind === 2 && same(c, n, r)) {
    c.ignite(get(c, r)!);
    n[87] = 0;
  }
  failed(n, c, 4, 20);
}

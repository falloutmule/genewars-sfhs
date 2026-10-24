/**Kind7's14040/147B0 processor collectors, distinct from the shared EFF pool.
 * Staged entries preserve actual native identities. Their caller owns rollback. */
import {
  advanceAnimation,
  animationFinished,
  type AnimationProfile,
  type AnimationState,
} from "./animation";
import { groundHeight, torusDelta, type TerrainState } from "./terrain";
import { effectTerrainShade } from "./power-motion";
import { nextRandom, type GeneRng } from "./random";
import type {
  ProcessorCollectorPool,
  ProcessorCollectorNative,
} from "./processor-collector-state";
export type {
  ProcessorCollectorPool,
  ProcessorCollectorNative,
} from "./processor-collector-state";
export type CollectorNative = (number | null)[];
export interface CollectorReference {
  kind: 1 | 2 | 4 | 5;
  index: number;
}
export interface ProcessorCollectorWorld {
  collectors: ProcessorCollectorPool;
  terrain: TerrainState;
  rng: GeneRng;
  frame: number;
}
export type ProcessorCollectorEvent =
  | {
      type: "collector-audio";
      operation: "play" | "stop";
      cue: 0x53;
      rate?: number;
    }
  | { type: "collector-created"; slot: number; mode: 0 | 1 | 2 }
  | { type: "collector-retired"; slot: number }
  | { type: "collector-draw"; slot: number };
export interface ProcessorCollectorReceipt {
  events: ProcessorCollectorEvent[];
  retired: boolean;
}
export interface ProcessorCollectorContext<W extends ProcessorCollectorWorld> {
  /**6D390: actual retained rows, including inactive afterimages. */
  resolve(world: W, reference: CollectorReference): CollectorNative | null;
  profile(world: W, action: number): AnimationProfile;
  /**One actual6FB60 pass; may invoke the collector's cancellation virtualA8. */
  motion?(world: W, index: number): void;
  insert?(world: W, index: number): void;
  unlink?(world: W, index: number): void;
  cleanup?(world: W, index: number): void;
  ignitePlant?(world: W, index: number): void;
  unlinkPlant?(world: W, index: number): void;
  createPlantCarrier?(
    world: W,
    request: {
      position: [number, number];
      height: number;
      angles: [number, number, number];
      owner: 0;
      parameter: 0;
      delay: 0;
    },
  ): { slot: number; native: CollectorNative } | null;
  attach?(
    world: W,
    carried: CollectorNative,
    parent: ProcessorCollectorNative,
  ): void;
  /**4B1D0 with the collector's actual current cell, followed by49D30 when needed. */
  dropPlantCarrier?(world: W, effect: CollectorNative): void;
  retireEffect?(world: W, index: number): void;
  /**Unmarked48790(10), at actual ground; no invented newborn flag. */
  feedback?(world: W, position: [number, number], height: number): void;
  audio?(
    world: W,
    index: number,
    event: Extract<ProcessorCollectorEvent, { type: "collector-audio" }>,
  ): void;
}
export const collectorByte = (
  n: readonly (number | null)[],
  p: number,
): number => {
  const v = n[p];
  if (!Number.isInteger(v) || v == null || v < 0 || v > 255)
    throw Error(`Unknown collector byte${p}`);
  return v;
};
export const collectorWord = (n: readonly (number | null)[], p: number) =>
  ((collectorByte(n, p) | (collectorByte(n, p + 1) << 8)) << 16) >> 16;
export const collectorDword = (n: readonly (number | null)[], p: number) =>
  (collectorWord(n, p) & 65535) | (collectorWord(n, p + 2) << 16);
export const putCollectorWord = (n: CollectorNative, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const b = collectorByte,
  w = collectorWord,
  d = collectorDword,
  put = putCollectorWord;
const put32 = (n: CollectorNative, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
const point = (n: readonly (number | null)[]): [number, number] => [
  w(n, 7),
  w(n, 9),
];
function required<T>(port: T | undefined, name: string): T {
  if (port === undefined)
    throw Error(`Actual collector ${name} service required`);
  return port;
}
function current<W extends ProcessorCollectorWorld>(s: W, index: number) {
  const n = s.collectors.records[index];
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 32 ||
    !n ||
    n.length !== 97 ||
    b(n, 6) !== 7 ||
    w(n, 15) !== index
  )
    throw Error("Actual livekind7 collector identity required");
  return n;
}
const reference = (
  n: CollectorNative,
  p: number,
): CollectorReference | null => {
  const kind = b(n, p + 2);
  if (kind === 0) return null;
  if (![1, 2, 4, 5].includes(kind))
    throw Error("Collector retained reference family is not admitted");
  return { kind: kind as CollectorReference["kind"], index: w(n, p) };
};
function resolve<W extends ProcessorCollectorWorld>(
  s: W,
  n: CollectorNative,
  p: number,
  c: ProcessorCollectorContext<W>,
) {
  const r = reference(n, p);
  return r ? c.resolve(s, r) : null;
}
function animation(n: CollectorNative): AnimationState {
  return {
    action: b(n, 25),
    hold: b(n, 26),
    frame: b(n, 27),
    direction: (b(n, 28) << 24) >> 24,
    delay: (b(n, 29) << 24) >> 24,
    counter: (b(n, 30) << 24) >> 24,
  };
}
function advance<W extends ProcessorCollectorWorld>(
  s: W,
  n: CollectorNative,
  c: ProcessorCollectorContext<W>,
) {
  const a = advanceAnimation(animation(n), c.profile(s, b(n, 25)));
  [a.action, a.hold, a.frame, a.direction, a.delay, a.counter].forEach(
    (v, i) => (n[25 + i] = v & 255),
  );
}
function audio<W extends ProcessorCollectorWorld>(
  s: W,
  index: number,
  c: ProcessorCollectorContext<W>,
  out: ProcessorCollectorReceipt,
  play = false,
) {
  const e: Extract<ProcessorCollectorEvent, { type: "collector-audio" }> = play
    ? {
        type: "collector-audio",
        operation: "play",
        cue: 0x53,
        rate: 100 + Math.trunc((w(current(s, index), 65) * 100) / 576),
      }
    : { type: "collector-audio", operation: "stop", cue: 0x53 };
  required(c.audio, "audio53")(s, index, e);
  out.events.push(e);
}
/**14220 uses the retained reference kind, not a broad live/dead predicate. */
export function releaseStagedCollectorTarget<W extends ProcessorCollectorWorld>(
  s: W,
  index: number,
  c: ProcessorCollectorContext<W>,
): void {
  const n = current(s, index),
    r = reference(n, 90);
  if (r?.kind === 1 || r?.kind === 2) {
    const t = required(c.resolve(s, r) ?? undefined, "retained target");
    t[r.kind === 1 ? 96 : 46] =
      b(t, r.kind === 1 ? 96 : 46) & (r.kind === 1 ? 0xfe : 0xfb);
  }
}
/**146E0. Transition67→68 only while moving; idle67 uses real4B1D0. */
export function detachStagedProcessorCollector<
  W extends ProcessorCollectorWorld,
>(s: W, index: number, c: ProcessorCollectorContext<W>): void {
  const n = current(s, index);
  if (b(n, 86) !== 2) return;
  const t = resolve(s, n, 90, c);
  if (!t) return;
  if (b(t, 6) === 1) t[97] = b(t, 97) & 0xfe;
  else if (b(t, 6) === 5) {
    if (b(t, 69) === 36) required(c.retireEffect, "49D30")(s, w(t, 15));
    else if (b(t, 69) === 67) {
      if (w(n, 73) & 16) t[69] = 68;
      else required(c.dropPlantCarrier, "4B1D0")(s, t);
    }
  }
}
/**14290/14320: no fabricated health debit; actual hit cancels once. */
export function cancelStagedProcessorCollector<
  W extends ProcessorCollectorWorld,
>(
  s: W,
  index: number,
  c: ProcessorCollectorContext<W>,
): ProcessorCollectorReceipt {
  const n = current(s, index),
    out: ProcessorCollectorReceipt = { events: [], retired: false };
  releaseStagedCollectorTarget(s, index, c);
  detachStagedProcessorCollector(s, index, c);
  n[86] = 3;
  put(n, 63, 0);
  n[27] = 0;
  n[25] = 27;
  audio(s, index, c, out);
  return out;
}
export function damageStagedProcessorCollector<
  W extends ProcessorCollectorWorld,
>(
  s: W,
  index: number,
  c: ProcessorCollectorContext<W>,
): ProcessorCollectorReceipt & { accepted: true } {
  return {
    ...(b(current(s, index), 86) === 3
      ? { events: [], retired: false }
      : cancelStagedProcessorCollector(s, index, c)),
    accepted: true,
  };
}
/**141C0 itself has no target release, carried drop, feedback or ANB tail. */
export function retireStagedProcessorCollector<
  W extends ProcessorCollectorWorld,
>(
  s: W,
  index: number,
  c: ProcessorCollectorContext<W>,
): ProcessorCollectorReceipt {
  const n = current(s, index);
  required(c.unlink, "8ACC0")(s, index);
  required(c.cleanup, "724C0")(s, index);
  n[6] = 0;
  s.collectors.count--;
  return {
    events: [{ type: "collector-retired", slot: index }],
    retired: true,
  };
}
function returnToBuilding<W extends ProcessorCollectorWorld>(
  s: W,
  index: number,
  c: ProcessorCollectorContext<W>,
  out: ProcessorCollectorReceipt,
) {
  const n = current(s, index);
  if (b(n, 86) === 3) return;
  const r = reference(n, 87),
    parent = r?.kind === 4 ? c.resolve(s, r) : null;
  if (!parent) {
    out.events.push(...cancelStagedProcessorCollector(s, index, c).events);
    return;
  }
  put(n, 63, 576);
  put(n, 11, w(parent, 7) - 128);
  put(n, 13, w(parent, 9) + 128);
  n[22] = b(n, 22) & 0xbf;
  put(n, 73, (w(n, 73) | 0x14) & 0xeffc);
  n[84] = 20;
  n[22] = b(n, 22) & 0x7f;
  n[79] = n[82] = 0;
  put(n, 77, w(parent, 15));
  n[79] = b(parent, 6);
  n[25] = 25;
  n[73] = b(n, 73) | 128;
}
/**143C0 pickup and actual return-route writes. Allocation failure is normal. */
export function pickUpStagedProcessorCollector<
  W extends ProcessorCollectorWorld,
>(
  s: W,
  index: number,
  c: ProcessorCollectorContext<W>,
): ProcessorCollectorReceipt {
  const n = current(s, index),
    out: ProcessorCollectorReceipt = { events: [], retired: false },
    r = reference(n, 90);
  if (r?.kind === 1) {
    const t = required(c.resolve(s, r) ?? undefined, "corpse target");
    t[97] = b(t, 97) | 1;
    n[86] = 2;
  } else if (r?.kind === 2) {
    const made = required(c.createPlantCarrier, "67 factory")(s, {
      position: point(n),
      height: d(n, 39),
      angles: [w(n, 57), w(n, 59), w(n, 61)],
      owner: 0,
      parameter: 0,
      delay: 0,
    });
    if (!made)
      out.events.push(...cancelStagedProcessorCollector(s, index, c).events);
    else {
      const t = required(c.resolve(s, r) ?? undefined, "plant target");
      if (!(b(t, 46) & 8)) required(c.ignitePlant, "6C6B0")(s, r.index);
      put(made.native, 71, w(t, 15));
      made.native[73] = b(t, 6);
      put(n, 90, w(made.native, 15));
      n[92] = b(made.native, 6);
      t[46] = (b(t, 46) & 0xeb) | 16;
      required(c.unlinkPlant, "plant8ACC0")(s, r.index);
      n[86] = 2;
    }
  }
  returnToBuilding(s, index, c, out);
  return out;
}
/**14040 complete constructor. Count32 declines before target/resource access.
 * Slot counter30,65,fractions67/68 and all unmentioned bytes are retained. */
export function createStagedProcessorCollector<
  W extends ProcessorCollectorWorld,
>(
  s: W,
  q: {
    building: number;
    target: { kind: 1 | 2; index: number };
    mode: 0 | 1 | 2;
  },
  c: ProcessorCollectorContext<W>,
): { index: number; resource: "EFF" } | null {
  if (
    !Number.isInteger(s.collectors.count) ||
    s.collectors.count < 0 ||
    s.collectors.count > 32 ||
    s.collectors.records.length !== 32
  )
    throw Error("Actual collector pool/count required");
  if (s.collectors.count >= 32) return null;
  const index = s.collectors.records.findIndex((n) => b(n, 6) === 0);
  if (index < 0) throw Error("Collector count/firstfree differ");
  if (![0, 1, 2].includes(q.mode) || (q.mode === 2) !== (q.target.kind === 1))
    throw Error("Actual processor collector mode/target pair required");
  const parent = required(
      c.resolve(s, { kind: 4, index: q.building }) ?? undefined,
      "factory parent",
    ),
    target = required(c.resolve(s, q.target) ?? undefined, "factory target"),
    n = s.collectors.records[index];
  if (
    n.length !== 97 ||
    b(parent, 6) !== 4 ||
    w(parent, 15) !== q.building ||
    b(target, 6) !== q.target.kind ||
    w(target, 15) !== q.target.index
  )
    throw Error("Actual collector factory rows required");
  const at = point(parent);
  n[2] = n[5] = 0;
  n[6] = 7;
  put(n, 15, index);
  n[24] = b(parent, 24);
  put(n, 7, at[0]);
  put(n, 9, at[1]);
  put32(n, 17, groundHeight(s.terrain, ...at));
  n[23] = effectTerrainShade(s.terrain, ...at);
  put(n, 21, 0);
  put(n, 11, 0);
  put(n, 13, 0);
  n[25] = n[26] = n[27] = n[29] = 0;
  n[28] = 1;
  n.fill(0, 45, 63);
  put(n, 43, 16);
  put32(n, 39, d(parent, 17));
  n[83] = 1;
  n[84] = 0;
  n[74] = b(n, 74) & 0x3b;
  n[86] = 0;
  n[25] = 25;
  n[85] = q.mode;
  put(n, 87, w(parent, 15));
  n[89] = b(parent, 6);
  put(n, 90, w(target, 15));
  n[92] = b(target, 6);
  put(n, 93, w(target, 7));
  put(n, 95, w(target, 9));
  if (q.target.kind === 1) target[96] = b(target, 96) | 1;
  else target[46] = b(target, 46) | 4;
  required(c.insert, "8AC60")(s, index);
  n.fill(null, 31, 39);
  put(n, 63, 576);
  n[84] = 20;
  put(n, 11, w(target, 7));
  put(n, 13, w(target, 9));
  n[73] = b(n, 73) | 0x14;
  n[22] = b(n, 22) & 63;
  put(n, 73, w(n, 73) & 0xeffc);
  n[79] = n[82] = 0;
  s.collectors.count++;
  return { index, resource: "EFF" };
}
/**147B0 full ordinary callback, with one motion pass and one surviving ANB tail. */
export function stepStagedProcessorCollector<W extends ProcessorCollectorWorld>(
  s: W,
  index: number,
  c: ProcessorCollectorContext<W>,
): ProcessorCollectorReceipt {
  const n = current(s, index),
    out: ProcessorCollectorReceipt = { events: [], retired: false };
  required(c.motion, "6FB60")(s, index);
  if (current(s, index) !== n)
    throw Error("Collector motion replaced held native");
  if (b(n, 86) !== 3) {
    const r = reference(n, 87),
      parent = r?.kind === 4 ? c.resolve(s, r) : null;
    if (
      w(n, 73) & 64 ||
      !parent ||
      !(w(parent, 49) & 4) ||
      w(parent, 49) & 0x140
    ) {
      out.events.push(...cancelStagedProcessorCollector(s, index, c).events);
      return out;
    }
  }
  audio(s, index, c, out, !!(w(n, 73) & 16) && b(n, 86) !== 3);
  switch (b(n, 86)) {
    case 0: {
      const t = resolve(s, n, 90, c),
        invalid =
          !t ||
          (b(t, 6) === 1
            ? !!(b(t, 97) & 1)
            : b(t, 6) === 2
              ? !!(b(t, 46) & 16)
              : false);
      if (invalid) {
        out.events.push(...cancelStagedProcessorCollector(s, index, c).events);
        break;
      }
      if (w(n, 93) !== w(t!, 7) || w(n, 95) !== w(t!, 9)) {
        put(n, 93, w(t!, 7));
        put(n, 95, w(t!, 9));
        put(n, 11, w(t!, 7));
        put(n, 13, w(t!, 9));
        n[84] = 20;
        n[73] = b(n, 73) | 0x14;
        n[22] = b(n, 22) & 63;
        put(n, 73, w(n, 73) & 0xeffc);
        n[79] = n[82] = 0;
      }
      if (w(n, 73) & 32) {
        if (
          b(n, 85) === 2 ||
          b(required(resolve(s, n, 90, c) ?? undefined, "arrival plant"), 46) &
            8
        )
          out.events.push(
            ...pickUpStagedProcessorCollector(s, index, c).events,
          );
        else {
          n[86] = 1;
          n[25] = 26;
          n[29] = 1;
          n[27] = 0;
        }
      }
      break;
    }
    case 1:
      if (animationFinished(animation(n), c.profile(s, b(n, 25)))) {
        if (b(n, 85) === 0) {
          const r = reference(n, 90);
          if (r?.kind === 2) {
            const t = c.resolve(s, r);
            if (t && !(b(t, 46) & 8))
              required(c.ignitePlant, "6C6B0")(s, r.index);
          }
          out.events.push(
            ...cancelStagedProcessorCollector(s, index, c).events,
          );
        } else if (b(n, 85) === 1)
          out.events.push(
            ...pickUpStagedProcessorCollector(s, index, c).events,
          );
      }
      break;
    case 2: {
      const t = resolve(s, n, 90, c);
      if (!t)
        out.events.push(...cancelStagedProcessorCollector(s, index, c).events);
      else {
        required(c.attach, "6EAF0")(s, t, n);
        if (w(n, 73) & 32)
          out.events.push(
            ...cancelStagedProcessorCollector(s, index, c).events,
          );
      }
      break;
    }
    case 3:
      if (animationFinished(animation(n), c.profile(s, b(n, 25)))) {
        required(c.feedback, "unmarked10 factory")(
          s,
          point(n),
          groundHeight(s.terrain, ...point(n)),
        );
        const retired = retireStagedProcessorCollector(s, index, c);
        out.retired = retired.retired;
        out.events.push(...retired.events);
      }
      break;
  }
  if (b(n, 6) !== 0) {
    advance(s, n, c);
    out.events.push({ type: "collector-draw", slot: index });
  }
  return out;
}
export function stepProcessorCollector<W extends ProcessorCollectorWorld>(
  before: W,
  index: number,
  c: ProcessorCollectorContext<W>,
): { world: W; receipt: ProcessorCollectorReceipt } {
  const world = structuredClone(before),
    receipt = stepStagedProcessorCollector(world, index, c);
  return { world, receipt };
}

/**112724/112728 scan. Native head order and the two actual axis draws matter. */
export function queryProcessorCollection<
  W extends Pick<ProcessorCollectorWorld, "rng">,
>(
  s: W,
  parent: CollectorNative,
  radius: 1024 | 1536 | 2048,
  cellOrder: (world: W, cell: number) => readonly CollectorNative[],
): { target: { kind: 1 | 2; index: number }; mode: 0 | 1 | 2 } | null {
  const selector = b(parent, 45),
    grade = b(parent, 46),
    origin = point(parent);
  if (
    !(
      (selector === 2 &&
        ((grade === 1 && radius === 1024) ||
          (grade === 2 && radius === 2048))) ||
      (selector === 4 &&
        ((grade === 1 && radius === 1024) || (grade === 2 && radius === 1536)))
    )
  )
    throw Error("Actual processor query grade/radius required");
  const sx = nextRandom(s.rng) % 2 ? -256 : 256,
    sy = nextRandom(s.rng) % 2 ? -256 : 256,
    extent = radius >> 8;
  let best = 0x7fffffff,
    selected: CollectorNative | null = null;
  for (let x = -extent; x <= extent; x++)
    for (let y = -extent; y <= extent; y++) {
      const at: [number, number] = [
          ((origin[0] + x * sx) << 16) >> 16,
          ((origin[1] + y * sy) << 16) >> 16,
        ],
        dx = torusDelta(at[0], origin[0]),
        dy = torusDelta(at[1], origin[1]);
      if (Math.imul(dx, dx) + Math.imul(dy, dy) > radius * radius) continue;
      const cell = ((at[1] >> 8) & 127) * 128 + ((at[0] >> 8) & 127),
        rows = cellOrder(s, cell);
      let candidate: CollectorNative | null = null;
      if (selector === 4) {
        let weight = -128;
        for (const n of rows)
          if (
            b(n, 6) === 1 &&
            (b(n, 94) << 24) >> 24 >= 25 &&
            !(b(n, 97) & 1) &&
            w(n, 104) > weight
          ) {
            weight = w(n, 104);
            candidate = n;
          }
      }
      if (!candidate && (selector === 2 || grade === 2))
        candidate = rows.find((n) => b(n, 6) === 2 && !(b(n, 46) & 5)) ?? null;
      if (!candidate) continue;
      const a = torusDelta(w(candidate, 7), origin[0]),
        z = torusDelta(w(candidate, 9), origin[1]),
        h =
          ((d(candidate, b(candidate, 6) === 1 ? 39 : 17) - d(parent, 17)) |
            0) >>
          3,
        distance = (Math.imul(a, a) + Math.imul(z, z) + Math.imul(h, h)) | 0;
      if (distance < best) {
        best = distance;
        selected = candidate;
      }
    }
  return selected
    ? {
        target: { kind: b(selected, 6) as 1 | 2, index: w(selected, 15) },
        mode:
          selector === 2 ? (grade === 1 ? 0 : 1) : b(selected, 6) === 1 ? 2 : 1,
      }
    : null;
}

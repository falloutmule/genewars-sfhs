/** Category1 source51960/507D0/56530/56090, actual shared57A10 envelope. */
import { nextRandom } from "./random";
import type { GeneRng } from "./random";
import type { SourceEntityId } from "../campaign/source-pools";
import { originalAngle, wrap16 } from "./motion";
import { groundHeight, integerSqrt, torusDelta, worldCell } from "./terrain";
import { ecologyTerrainClass, type EcologyPlant } from "./ecology";
import { effectTerrainShade } from "./power-motion";
import {
  continueSpecialistMovement,
  querySpecialistHostileMule,
  readSpecialistControlActor,
  stepSpecialistRoleCallback,
  type GeneticistWorld,
  type GeneticistContext,
  type GeneticistCallbackContext,
  type GeneticistReceipt,
} from "./geneticist";

type Native = (number | null)[];
type Point = [number, number];
export interface BotanistPlantRule {
  selector: number;
  growthDeltas: readonly number[];
  crowdingLimit: number;
  /** Actual original plant row1E, not its nutrition/retirement fields. */
  seedCost: number;
}
export interface BotanistRules {
  schemaVersion: 1;
  plants: readonly BotanistPlantRule[];
}
export interface BotanistEffect {
  code: 7;
  position: Point;
  height: number;
  owner: 0;
  angles: [0, 0, 0];
  parameter: 0;
  delay: 0;
  newborn: false;
}
export interface BotanistContext<W extends GeneticistWorld>
  extends Pick<
    GeneticistContext<W>,
    "tables" | "cellOrder" | "escapeRay" | "resolveMovePoint"
  > {
  rules: BotanistRules;
  /**6C900, including immediate6C780 if growth becomes nonpositive. */
  damagePlant?(w: W, plant: number, amount: number, actor: number): void;
  /**6C4B0 first-free factory, real links/BP bookkeeping/80780(+1) included. */
  createPlant?(
    w: W,
    request: {
      actor: number;
      owner: number;
      selector: number;
      position: Point;
    },
  ): number | null;
  /**6C6B0 already implemented by igniteStagedPlant; real8 factory included. */
  ignitePlant?(w: W, plant: number, actor: number): void;
  /** Real unmarked48790 code7 factory, including shared allocation/cleanup RNG. */
  effect?(w: W, request: BotanistEffect): void;
  /**80780(+8) or806E0(50,-1). Own actual funds caps/audio/floating6D500. */
  economy?(
    w: W,
    request: {
      actor: number;
      owner: number;
      operation: "credit" | "debit";
      amount: 8 | 50;
    },
  ): void;
  /** Source97830 for audio33; only the conditional stop needs this query. */
  audioPlaying?(w: W, actor: number, cue: 51): boolean;
}
export type BotanistCallbackContext<W extends GeneticistWorld> =
  BotanistContext<W> & Omit<GeneticistCallbackContext<W>, "rules">;
export type BotanistReceipt = GeneticistReceipt;
export type BotanistWorkRequest =
  | { callerOwner: number; task: 0 | 2; point: Point }
  | { callerOwner: number; task: 1; point: Point; selector: number };
export interface BotanistEconomyPlan {
  raw: number[];
  applied: boolean;
  audio: null | {
    entity: SourceEntityId;
    cue: 57 | 38;
    mode: 2;
    parameter: 1;
    volume: 30 | 60;
    ratePercent: 200;
  };
  burst: null | {
    entity: SourceEntityId;
    code: 60 | 61;
    variation: 0;
    speedBase: 10;
    speedRange: 10;
    count: number;
    inheritedOwner: true;
  };
}
/**80780/806E0 numeric mutation and exact6D500 call parameters. Prefix cells
 *1C78/1C7C are actual source startup words; no default caps are supplied. */
export function planBotanistEconomy(
  raw: readonly number[],
  missionPrefix: readonly number[],
  request: {
    operation: "credit" | "debit";
    amount: number;
    entity: SourceEntityId | null;
  },
): BotanistEconomyPlan {
  if (
    raw.length !== 1805 ||
    !Number.isInteger(request.amount) ||
    request.amount < 0 ||
    request.amount > 2147483647
  )
    throw Error("Actual player record and source economy amount required");
  const n = [...raw],
    credit = request.operation === "credit";
  if (!credit && request.operation !== "debit")
    throw Error("Unsupported Botanist economy operation");
  const applied = credit || dword(n, 0x49d) >>> 0 !== 0;
  if (applied) {
    if (credit) {
      put32(n, 13, dword(n, 13) + request.amount);
      put32(
        n,
        17,
        Math.min(
          (dword(n, 17) + request.amount) | 0,
          (word(missionPrefix, 0x1c7c) & 65535) * 2,
        ),
      );
    } else
      put32(
        n,
        17,
        Math.max(
          (dword(n, 17) - request.amount) | 0,
          -(word(missionPrefix, 0x1c78) & 65535),
        ),
      );
  }
  const show = applied && request.entity !== null;
  return {
    raw: n,
    applied,
    audio: show
      ? {
          entity: request.entity!,
          cue: credit ? 57 : 38,
          mode: 2,
          parameter: 1,
          volume: credit ? 30 : 60,
          ratePercent: 200,
        }
      : null,
    burst: show
      ? {
          entity: request.entity!,
          code: credit ? 60 : 61,
          variation: 0,
          speedBase: 10,
          speedRange: 10,
          count: Math.max(1, request.amount >> 3) & 255,
          inheritedOwner: true,
        }
      : null,
  };
}
export interface BotanistEconomyParticle {
  code: 60 | 61;
  owner: number;
  position: Point;
  height: number;
  angles: [number, number, number];
  parameter: 0;
  delay: 0;
  newborn: false;
}
/**6D500 credit/debit burst, with factory calls interleaved between each three
 * caller draws. The actual shared factory owns its successful delay draw. */
export function emitBotanistEconomyBurst(
  native: readonly (number | null)[],
  rng: GeneRng,
  burst: NonNullable<BotanistEconomyPlan["burst"]>,
  factory: (request: BotanistEconomyParticle) => boolean,
): number {
  const kind = byte(native, 6);
  if (
    ![2, 3].includes(kind) ||
    ![60, 61].includes(burst.code) ||
    !Number.isInteger(burst.count) ||
    burst.count < 0 ||
    burst.count > 255
  )
    throw Error("Actual plant/specialist economy burst source required");
  const height = dword(native, kind === 3 ? 39 : 17),
    relative = kind === 3 ? (height - dword(native, 17)) | 0 : 0;
  let created = 0;
  for (let i = 0; i < burst.count; i++) {
    const speed = (10 + (nextRandom(rng) % 10)) * 64,
      pitch = nextRandom(rng),
      yaw = (nextRandom(rng) % 128) * 16;
    if (
      factory({
        code: burst.code,
        owner: byte(native, 24),
        position: point(native),
        height,
        angles: [yaw, relative < 128 ? pitch % 150 : (pitch % 128) * 8, speed],
        parameter: 0,
        delay: 0,
        newborn: false,
      })
    )
      created++;
  }
  return created;
}

const byte = (n: readonly (number | null)[], p: number): number => {
  const v = n[p];
  if (v == null || !Number.isInteger(v) || v < 0 || v > 255)
    throw Error(`Unknown Botanist numeric byte ${p}`);
  return v;
};
const signed = (v: number) => (v << 24) >> 24;
const word = (n: readonly (number | null)[], p: number) =>
  ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  byte(n, p) |
  (byte(n, p + 1) << 8) |
  (byte(n, p + 2) << 16) |
  (byte(n, p + 3) << 24);
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const put32 = (n: Native, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
const point = (n: readonly (number | null)[], p = 7): Point => [
  word(n, p),
  word(n, p + 2),
];
const distance = (a: Point, b: Point) => {
  const x = torusDelta(a[0], b[0]),
    y = torusDelta(a[1], b[1]);
  return (Math.imul(x, x) + Math.imul(y, y)) >>> 0;
};
const receipt = (reason: string): BotanistReceipt => ({
  events: [],
  status: "ignored",
  reason,
});
function actor<W extends GeneticistWorld>(w: W, index: number) {
  if (w.specialists.bindings[index]?.category !== 1)
    throw Error("Actual category1 Botanist required");
  return readSpecialistControlActor(w, index);
}
function row(r: BotanistRules, selector: number): BotanistPlantRule {
  const p = r.plants[selector];
  if (
    r.schemaVersion !== 1 ||
    !p ||
    p.selector !== selector ||
    p.growthDeltas.length !== 8 ||
    p.growthDeltas.some((x) => !Number.isInteger(x) || x < -128 || x > 127) ||
    !Number.isInteger(p.seedCost) ||
    p.seedCost < 0 ||
    p.seedCost > 255 ||
    !Number.isInteger(p.crowdingLimit) ||
    p.crowdingLimit < 0 ||
    p.crowdingLimit > 255
  )
    throw Error("Original admitted Botanist plant row required");
  return p;
}
/** The existing importer retains the two original row-tail bytes separately
 * from the named ecology fields. Only row1E is projected into this rule. */
export function botanistRulesFromEcology(source: {
  plants: readonly {
    selector: number;
    growthDeltas: readonly number[];
    crowdingLimit: number;
    opaqueBytes: readonly number[];
  }[];
}): BotanistRules {
  const rules: BotanistRules = {
    schemaVersion: 1,
    plants: source.plants.map((p) => ({
      selector: p.selector,
      growthDeltas: [...p.growthDeltas],
      crowdingLimit: p.crowdingLimit,
      seedCost: p.opaqueBytes.length === 18 ? p.opaqueBytes[16] : NaN,
    })),
  };
  rules.plants.forEach((_, i) => row(rules, i));
  return rules;
}
function guard<W extends GeneticistWorld, T>(
  w: W,
  index: number,
  call: () => T,
): T {
  const a = actor(w, index),
    n = a.native,
    raw = a.blueprint,
    binding = w.specialists.bindings[index];
  const result = call();
  if (
    w.specialists.records[index] !== n ||
    w.players[a.owner].raw !== raw ||
    w.specialists.bindings[index] !== binding
  )
    throw Error(
      "Botanist service replaced retained actor/player/binding identity",
    );
  return result;
}
function plants<W extends GeneticistWorld>(
  w: W,
  cell: number,
  c: BotanistContext<W>,
): EcologyPlant[] {
  const present = w.ecology.plants.filter(
      (p) => byte(p.native, 6) === 2 && worldCell(...point(p.native)) === cell,
    ),
    ids = c.cellOrder(w, cell);
  if (
    new Set(ids).size !== ids.length ||
    present.some((p) => !ids.includes(p.id))
  )
    throw Error("Botanist query requires complete actual shared-cell order");
  return ids.flatMap((id) => {
    const p = present.find((p) => p.id === id);
    if (!p) return [];
    if (
      p.native.length !== 49 ||
      word(p.native, 15) !== p.index ||
      p.id !== `source:1:${p.index}`
    )
      throw Error("Actual Botanist plant native/binding required");
    return [p];
  });
}
/**8D7B0 axes, then8D930 or8D9E0 samples. Callback sees entire linked cell. */
function scan<W extends GeneticistWorld>(
  w: W,
  index: number,
  radius: number,
  skipCenter: boolean,
  visit: (p: Point, cell: number, metric: number) => void,
): void {
  const at = point(actor(w, index).native),
    sx = nextRandom(w.rng) % 2 ? -256 : 256,
    sy = nextRandom(w.rng) % 2 ? -256 : 256,
    extent = Math.trunc(radius / 256);
  for (let x = -extent; x <= extent; x++)
    for (let y = -extent; y <= extent; y++) {
      const metric = Math.imul(x * sx, x * sx) + Math.imul(y * sy, y * sy);
      if ((skipCenter && metric === 0) || metric > Math.imul(radius, radius))
        continue;
      const p: Point = [wrap16(at[0] + x * sx), wrap16(at[1] + y * sy)];
      visit(p, worldCell(...p), metric);
    }
}
function area<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: BotanistContext<W>,
  work: boolean,
  undo: boolean,
): number {
  const a = actor(w, index),
    n = a.native,
    radius = Math.trunc((a.skill * 1024) / 100) + 512;
  let count = 0;
  scan(w, index, radius, false, (_point, cell) => {
    for (const p of plants(w, cell, c)) {
      const pn = p.native;
      if (undo) pn[46] = byte(pn, 46) & 253;
      else if (word(pn, 44) > 0 && !(byte(pn, 46) & 8))
        pn[46] = byte(pn, 46) | 2;
      p.plantFlags = byte(pn, 46);
      if (!work) continue;
      count++;
      const selector = signed(byte(pn, 43)),
        params = row(c.rules, selector);
      put32(a.blueprint, 0x61a + 0x64 + selector * 4, 1);
      if (!c.damagePlant)
        throw Error(
          "Botanist area work requires actual6C900/6C780 plant service",
        );
      guard(w, index, () =>
        c.damagePlant!(w, p.index, Math.max(1, params.seedCost >> 1), index),
      );
    }
  });
  n[114] = Math.min(40, (byte(n, 114) + Number(count >>> 1 !== 0)) & 255);
  return count;
}
function release<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: BotanistContext<W>,
  out: BotanistReceipt,
): void {
  const n = actor(w, index).native,
    task = byte(n, 126);
  if (byte(n, 88) & 1) {
    if (task === 0 && byte(n, 112) & 128) area(w, index, c, false, true);
    if (task >= 2) {
      if (byte(n, 129) === 2) {
        const p = w.ecology.plants.find((p) => p.index === word(n, 127));
        if (!p) throw Error("Retained Botanist target plant is missing");
        p.native[46] = byte(p.native, 46) & 251;
        p.plantFlags = byte(p.native, 46);
        n[129] = 0;
      }
    }
    put32(n, 142, 0);
    n[88] = byte(n, 88) & 254;
  }
  n[130] = 0;
  n[126] = 255;
  put(n, 112, word(n, 112) & 0xee69);
  put(n, 63, 0);
  put(n, 73, word(n, 73) & 0xefe8);
  n[84] = 0;
  n[22] = byte(n, 22) & 63;
  put(n, 73, word(n, 73) & 0xeffc);
  n[22] = byte(n, 22) & 127;
  out.events.push({ type: "released", actor: index, panelRefresh: true });
  out.status = "released";
}
function feedback(
  out: BotanistReceipt,
  index: number,
  mode: 1 | 2,
  reason: string,
) {
  out.events.push({ type: "feedback", actor: index, mode, reason });
  out.reason = reason;
}
function activate<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: BotanistContext<W>,
  out: BotanistReceipt,
) {
  const n = actor(w, index).native,
    task = byte(n, 126);
  n[112] = byte(n, 112) & 251;
  n[85] = 10;
  n[90] = 1;
  if (task === 0 || (task === 1 && byte(n, 114) !== 0))
    feedback(out, index, 2, "botanist-work-started");
  else if (task === 2) {
    nextRandom(w.rng);
    feedback(out, index, 2, "botanist-harvest-started");
  }
  out.status = "active";
}
export function queueBotanistWork<W extends GeneticistWorld>(
  world: W,
  index: number,
  q: BotanistWorkRequest,
  c: BotanistContext<W>,
): BotanistReceipt {
  const w = structuredClone(world),
    a = actor(w, index),
    n = a.native,
    out = receipt("ineligible-actor");
  if (q.callerOwner !== a.owner) throw Error("Botanist command owner differs");
  if (!(byte(n, 112) & 1)) return out;
  if (
    ![0, 1, 2].includes(q.task) ||
    q.point.length !== 2 ||
    q.point.some((x) => !Number.isInteger(x) || x < -32768 || x > 32767)
  )
    throw Error("Unsupported Botanist command");
  if (q.task === 1) row(c.rules, q.selector);
  release(w, index, c, out);
  n[126] = q.task;
  put(n, 92, q.point[0]);
  put(n, 94, q.point[1]);
  put(n, 136, q.point[0]);
  put(n, 138, q.point[1]);
  if (q.task === 1) n[131] = q.selector;
  const radius =
    q.task === 2
      ? Math.trunc((a.skill * 768) / 100) + 768
      : Math.trunc((a.skill * 1024) / 100) + 512;
  put32(n, 142, Math.imul(radius, radius));
  n[87] = byte(n, 87) | 1;
  out.status = "pending";
  out.reason = "botanist-work-queued";
  Object.assign(world, w);
  return out;
}
export function cancelStagedBotanistWork<W extends GeneticistWorld>(
  world: W,
  index: number,
  callerOwner: number,
  c: BotanistContext<W>,
): BotanistReceipt {
  if (actor(world, index).owner !== callerOwner)
    throw Error("Botanist command owner differs");
  const out = receipt("botanist-work-released");
  release(world, index, c, out);
  return out;
}
export function cancelBotanistWork<W extends GeneticistWorld>(
  world: W,
  index: number,
  callerOwner: number,
  c: BotanistContext<W>,
): BotanistReceipt {
  const w = structuredClone(world),
    out = cancelStagedBotanistWork(w, index, callerOwner, c);
  Object.assign(world, w);
  return out;
}
export function queueBotanistMove<W extends GeneticistWorld>(
  world: W,
  index: number,
  q: { callerOwner: number; point: Point },
  c: BotanistContext<W>,
): BotanistReceipt {
  const w = structuredClone(world),
    a = actor(w, index),
    n = a.native,
    out = receipt("move-inhibited");
  if (a.owner !== q.callerOwner) throw Error("Botanist command owner differs");
  if (byte(n, 113) & 16) return out;
  if (
    q.point.length !== 2 ||
    q.point.some((x) => !Number.isInteger(x) || x < -32768 || x > 32767)
  )
    throw Error("Invalid Botanist move point");
  if (!c.resolveMovePoint)
    throw Error("Botanist move requires actual74A50 resolver");
  n[87] = byte(n, 87) | 2;
  n[91] = 0;
  put(n, 92, q.point[0]);
  put(n, 94, q.point[1]);
  const p = guard(w, index, () => c.resolveMovePoint!(w, index, q.point));
  if (
    p.length !== 2 ||
    p.some((x) => !Number.isInteger(x) || x < -32768 || x > 32767)
  )
    throw Error("Invalid resolved Botanist move point");
  put(n, 92, p[0]);
  put(n, 94, p[1]);
  put(n, 11, p[0]);
  put(n, 13, p[1]);
  if (byte(n, 130) !== 0 || byte(n, 87) & 1) {
    n[87] = byte(n, 87) & 254;
    release(w, index, c, out);
  }
  out.status = "pending";
  out.reason = "move-queued";
  Object.assign(world, w);
  return out;
}
/**52780 category1 always escapes a selected hostile creature. It does not
 * manufacture a plant task or acquire DNA/GOOP on its idle pulse. */
function idle<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: BotanistContext<W>,
): BotanistReceipt {
  const a = actor(w, index),
    n = a.native,
    out = receipt("no-idle-acquisition");
  if ((w.frame + index) & 15) return out;
  const chance = a.skill >> (byte(a.blueprint, 2) === 0 ? 1 : 3);
  if (nextRandom(w.rng) % 100 < chance) {
    const target = querySpecialistHostileMule(w, index, 512, c);
    if (target) {
      put(n, 127, word(target.native, 15));
      n[129] = byte(target.native, 6);
      n[90] = 5;
      n[91] = 5;
      put(n, 63, a.speed);
      n[87] = byte(n, 87) | 2;
      n[112] = byte(n, 112) | 16;
      out.status = "pending";
      out.reason = "hostile-target-escape";
    }
  }
  return out;
}
export function tryBotanistIdleAcquisition<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: BotanistContext<W>,
): BotanistReceipt {
  const w = structuredClone(world),
    out = idle(w, index, c);
  Object.assign(world, w);
  return out;
}
function plantingSearch<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: BotanistContext<W>,
  out: BotanistReceipt,
) {
  const a = actor(w, index),
    n = a.native,
    params = row(c.rules, signed(byte(n, 131))),
    at = point(n);
  const radius =
    byte(n, 88) & 2
      ? (Math.trunc(a.skill / 30) +
          Number(
            nextRandom(w.rng) % 100 <= signed(byte(a.blueprint, a.offset + 24)),
          )) *
        256
      : 1024;
  //401A0 initializes8D7B0 before the cd choice draw.
  const samples: { p: Point; cell: number; metric: number }[] = [];
  scan(w, index, radius, true, (p, cell, metric) =>
    samples.push({ p, cell, metric }),
  );
  const preferNear = nextRandom(w.rng) % 10 < 5,
    weights = Array<number>(16).fill(0);
  let found = false;
  for (const sample of samples) {
    if (distance(sample.p, point(n, 136)) > dword(n, 142) >>> 0) continue;
    const terrain = ecologyTerrainClass(w.terrain, sample.p);
    if (
      terrain <= 1 ||
      plants(w, sample.cell, c).filter((p) => word(p.native, 44) > 0).length >=
        params.crowdingLimit
    )
      continue;
    const yaw =
        originalAngle(
          torusDelta(sample.p[0], at[0]),
          torusDelta(sample.p[1], at[1]),
          c.tables.atan,
        ) & 2047,
      sector = Math.trunc(yaw / 128),
      metric = integerSqrt(sample.metric),
      score =
        (preferNear ? radius - metric : metric) +
        params.growthDeltas[terrain] * (a.skill >> 1);
    weights[sector] = (weights[sector] + score) | 0;
    found = true;
  }
  if (!found) {
    feedback(out, index, 1, "no-planting-site");
    release(w, index, c, out);
    return;
  }
  //8D9E0 tie order starts at a source draw and visits sectors descending.
  let sector = 0,
    best = -2147483647,
    start = nextRandom(w.rng) % 16;
  for (let i = 0; i < 16; i++) {
    const s = (start - i) & 15;
    if (weights[s] > best) {
      best = weights[s];
      sector = s;
    }
  }
  const yaw = sector * 128 + (nextRandom(w.rng) % 128),
    distanceValue = 128 + (nextRandom(w.rng) % 256);
  if (!c.escapeRay)
    throw Error("Botanist planting requires actual707A0 escape ray");
  if (guard(w, index, () => c.escapeRay!(w, index, yaw, distanceValue))) {
    put(n, 57, yaw);
    put(n, 96, word(n, 11));
    put(n, 98, word(n, 13));
    n[112] = byte(n, 112) | 16;
    put(n, 63, a.speed);
  }
}
function work<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: BotanistContext<W>,
  out: BotanistReceipt,
) {
  const a = actor(w, index),
    n = a.native,
    task = byte(n, 126);
  if (task === 0) {
    if (byte(n, 114) >= 40) {
      feedback(out, index, 1, "botanist-resource-full");
      release(w, index, c, out);
      return;
    }
    n[112] = byte(n, 112) | 128;
    n[89] = 13;
    if (!(word(n, 73) & 32) && w.frame % (30 - (a.skill >> 2)) !== 0) return;
    out.events.push({
      type: "audio",
      actor: index,
      cue: 42,
      mode: 2,
      parameter: 0,
    });
    if (area(w, index, c, true, false) === 0) {
      feedback(out, index, 1, "no-area-plants");
      release(w, index, c, out);
    }
    return;
  }
  if (task !== 1) throw Error("Botanist56530 task is not admitted");
  const params = row(c.rules, signed(byte(n, 131)));
  if (byte(n, 114) < params.seedCost) {
    feedback(out, index, 1, "insufficient-botanist-resource");
    release(w, index, c, out);
    put32(n, 104, 0);
    return;
  }
  let search = false;
  if (byte(n, 112) & 128) {
    put32(n, 104, dword(n, 104) - 1);
    if (dword(n, 104) > 0) return;
    n[112] = byte(n, 112) & 127;
    if (!c.createPlant)
      throw Error("Botanist planting requires actual6C4B0 factory");
    guard(w, index, () =>
      c.createPlant!(w, {
        actor: index,
        owner: a.owner,
        selector: signed(byte(n, 131)),
        position: point(n),
      }),
    );
    n[114] = (byte(n, 114) - params.seedCost) & 255;
    if (!c.economy)
      throw Error("Botanist planting requires actual80780 reward");
    guard(w, index, () =>
      c.economy!(w, {
        actor: index,
        owner: a.owner,
        operation: "credit",
        amount: 8,
      }),
    );
    search = true;
  } else if (byte(n, 112) & 16) {
    if (!(word(n, 73) & 32)) {
      continueSpecialistMovement(w, index, 0, c);
      return;
    }
    n[112] = byte(n, 112) & 239;
    const at = point(n),
      cell = worldCell(...at);
    if (
      plants(w, cell, c).every((p) => word(p.native, 44) <= 0) &&
      ecologyTerrainClass(w.terrain, at) > 1 &&
      !(w.terrain.bytes[cell * 14 + 11] & 1)
    ) {
      n[89] = 14;
      n[27] = 0;
      n[112] = byte(n, 112) | 128;
      put32(n, 104, 105 - a.skill);
    } else search = true;
  } else search = true;
  if (search) plantingSearch(w, index, c, out);
}
function harvest<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: BotanistContext<W>,
  out: BotanistReceipt,
) {
  const a = actor(w, index),
    n = a.native;
  if (byte(n, 126) !== 2)
    throw Error("Direct target Botanist task is not admitted");
  let target =
    byte(n, 129) === 2
      ? w.ecology.plants.find((p) => p.index === word(n, 127))
      : undefined;
  if (!(byte(n, 112) & 0x90) || !target || byte(target.native, 46) & 8) {
    let winner: EcologyPlant | undefined,
      best = 0x7fffffff;
    const radius = Math.trunc((a.skill * 768) / 100) + 768;
    scan(w, index, radius, false, (_p, cell) => {
      const first = plants(w, cell, c).find(
        (p) => word(p.native, 44) > 0 && !(byte(p.native, 46) & 5),
      );
      if (
        !first ||
        distance(point(first.native), point(n, 136)) > dword(n, 142) >>> 0
      )
        return;
      const score = distance(point(first.native), point(n));
      if (score < best) {
        best = score;
        winner = first;
      }
    });
    if (!winner) {
      release(w, index, c, out);
      feedback(out, index, 1, "no-harvest-target");
      return;
    }
    target = winner;
    put(n, 127, target.index);
    n[129] = byte(target.native, 6);
    put32(n, 104, 0);
    n[112] = byte(n, 112) & 127;
    const p = point(target.native),
      yaw = originalAngle(
        torusDelta(p[0], word(n, 7)),
        torusDelta(p[1], word(n, 9)),
        c.tables.atan,
      );
    if (yaw >= 768 && yaw <= 1792) {
      p[1] = wrap16(p[1] - 32);
      n[112] = byte(n, 112) & 251;
    } else {
      p[0] = wrap16(p[0] - 32);
      n[112] = byte(n, 112) | 4;
    }
    n[90] = 1;
    put(n, 96, p[0]);
    put(n, 98, p[1]);
    put(n, 63, a.speed);
    n[112] = byte(n, 112) | 16;
    n[73] = byte(n, 73) & 223;
  }
  if (!target) throw Error("Retained Botanist harvest target missing");
  if (byte(n, 112) & 16) {
    if (!(word(n, 73) & 32)) {
      continueSpecialistMovement(w, index, 0, c);
      return;
    }
    n[112] = (byte(n, 112) & 0x6f) | 128;
    n[89] = 15;
    const duration =
      word(target.native, 44) > 0
        ? Math.trunc(a.skill / 3) + 60 + Math.trunc(word(target.native, 44) / 2)
        : (nextRandom(w.rng) % (21 - Math.trunc(a.skill / 5))) + 5;
    put32(n, 104, Math.max(1, duration));
    put(n, 134, Math.max(1, duration));
    return;
  }
  put32(n, 104, dword(n, 104) - 1);
  if (byte(n, 27) === 0 && !(byte(n, 104) & 3)) {
    if (!c.effect)
      throw Error("Botanist harvesting requires actual code7 factory");
    const p = point(target.native);
    guard(w, index, () =>
      c.effect!(w, {
        code: 7,
        position: p,
        height: groundHeight(w.terrain, ...p),
        owner: 0,
        angles: [0, 0, 0],
        parameter: 0,
        delay: 0,
        newborn: false,
      }),
    );
    out.events.push({
      type: "audio",
      actor: index,
      cue: 51,
      mode: 2,
      parameter: 0,
    });
  }
  put(n, 134, word(n, 134) - 1);
  if (word(n, 134) !== 0) return;
  if (word(target.native, 44) > 0) {
    if (!c.ignitePlant)
      throw Error("Botanist harvest requires actual6C6B0 ignition");
    guard(w, index, () => c.ignitePlant!(w, target!.index, index));
    if (!c.economy) throw Error("Botanist harvest requires actual806E0 debit");
    guard(w, index, () =>
      c.economy!(w, {
        actor: index,
        owner: a.owner,
        operation: "debit",
        amount: 50,
      }),
    );
    if (!c.audioPlaying)
      throw Error("Botanist harvest requires actual97830 audio state");
    if (guard(w, index, () => c.audioPlaying!(w, index, 51)))
      out.events.push({
        type: "audio",
        actor: index,
        cue: 51,
        mode: "stop",
        parameter: 0,
      });
    n[129] = 0;
  }
  n[112] = byte(n, 112) & 127;
}
export function stepBotanistRole<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: BotanistContext<W>,
): BotanistReceipt {
  const w = structuredClone(world),
    out = stepStagedBotanistRole(w, index, c);
  Object.assign(world, w);
  return out;
}
/** Already isolated common-callback transaction owns rollback. */
export function stepStagedBotanistRole<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: BotanistContext<W>,
): BotanistReceipt {
  const n = actor(w, index).native,
    out = receipt("inactive-botanist-role");
  if (byte(n, 85) !== 10 || !(byte(n, 88) & 1)) return out;
  out.status = "active";
  out.reason = byte(n, 126) <= 1 ? "botanist-work" : "botanist-harvest";
  if (byte(n, 126) <= 1) work(w, index, c, out);
  else harvest(w, index, c, out);
  return out;
}
export function stepBotanistCallback<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: BotanistCallbackContext<W>,
): BotanistReceipt {
  return stepSpecialistRoleCallback(w, index, c, {
    category: 1,
    roleState: 10,
    activate,
    release: (w, i, out) => release(w, i, c, out),
    idle,
    role: stepStagedBotanistRole,
  });
}

/**6C4B0/1F340 numeric factory plan. Caller owns the actual first-free pool,
 * shared8AC60 insertion, resource binding and owner counter/reward ordering. */
export function planBotanistPlantCreation(
  before: readonly (number | null)[],
  index: number,
  owner: number,
  selector: number,
  requested: Point,
  terrain: GeneticistWorld["terrain"],
): { native: Native; position: Point; height: number } {
  if (
    before.length !== 49 ||
    byte(before, 6) !== 0 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 512 ||
    !Number.isInteger(owner) ||
    owner < 0 ||
    owner > 4 ||
    !Number.isInteger(selector) ||
    selector < 0 ||
    selector >= 12
  )
    throw Error(
      "Actual original inactive plant prior/factory arguments required",
    );
  const n = before.slice(),
    p = requested.map((x) =>
      wrap16((x & 0xff00) + ((x & 255) >> 2) + 96),
    ) as Point,
    height = groundHeight(terrain, ...p);
  n[2] = n[5] = 0;
  n[6] = 2;
  put(n, 7, p[0]);
  put(n, 9, p[1]);
  n.fill(0, 11, 15);
  put(n, 15, index);
  put32(n, 17, height);
  put(n, 21, 4);
  n[23] = effectTerrainShade(terrain, ...p);
  n[24] = owner;
  n[25] = n[26] = n[27] = n[29] = 0;
  n[28] = 1;
  //6C690 resource binding resets the unrendered cache, not retained30/48.
  put32(n, 39, 0);
  n[43] = selector;
  put(n, 44, 4);
  n[46] = n[47] = 0;
  return { native: n, position: p, height };
}

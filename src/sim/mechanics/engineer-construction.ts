/** Native534D0 task0 stages0..5 and ordinary507D0/51E80 construction work.
 * Reuses the original shared terrain pool and526C0 continuation. It never
 * performs common6FB60 physics, idle recovery, or7AC00 presentation. */
import {
  continueSpecialistMovement,
  readSpecialistControlActor,
  type GeneticistWorld,
  type GeneticistContext,
} from "./geneticist";
import { cancelSpecialistWithoutActiveRole } from "./specialist-abduction";
import {
  CRATER_JOB_BASE,
  CRATER_JOB_COUNT,
  CRATER_JOB_STRIDE,
  createLevelTerrainJob,
} from "./crater";
import { animationFinished, type AnimationProfile } from "./animation";
import { originalAngle, wrap16 } from "./motion";
import { groundHeight, torusDelta } from "./terrain";
import { nextRandom } from "./random";
import type {
  EngineerConstructionReceipt,
  EngineerConstructionServices,
  EngineerReleaseRequest,
} from "./engineer";
import type {
  ConstructionEvent,
  ConstructionBuildingRequest,
} from "./construction";

type Native = (number | null)[];
type Point = [number, number];
type Selector = 0 | 1 | 3 | 6 | 11;
export interface EngineerCompletedBuildingContribution {
  native: Native;
  /** Source43620 runs against this image BEFORE43F60 when both paths occur. */
  damageRecoveryNative: Native | null;
  completed: boolean;
  completionRequired: boolean;
  /**43F60 grade0 bookkeeping repeats even for an already-completed building. */
  completedPlayerCountOffset: number | null;
  acquiredOwnershipBit: number | null;
  clearCreatureTargets: boolean;
  refreshCapacity: boolean;
  /** Already-completed flag1 suppresses43F60's first-completion audio. The
   * separate441C0 active-UI change audio remains an explicit host condition. */
  firstCompletionAudio: null;
  changedUiAudioCondition: boolean;
}
/**441C0(BL0) numeric completed-building repair branch. Normal incomplete
 * construction continues to use progressNativeBuilding. The host applies
 *43620/43F60 obligations at their actual staged points, retaining this record. */
export function planEngineerCompletedBuildingContribution(
  before: readonly (number | null)[],
  increment: number,
  maximumHealth: number,
): EngineerCompletedBuildingContribution {
  const s = byte(before, 45),
    index = word(before, 15),
    owner = byte(before, 24);
  if (
    before.length !== 67 ||
    byte(before, 6) !== 4 ||
    ![0, 1, 3, 6, 11].includes(s) ||
    owner >= 4 ||
    index < 0 ||
    index >= 256 ||
    Math.floor(index / 64) !== owner ||
    byte(before, 46) !== 0 ||
    byte(before, 47) !== 0 ||
    !(word(before, 49) & 1) ||
    !Number.isInteger(increment) ||
    increment < -32768 ||
    increment > 32767 ||
    !Number.isInteger(maximumHealth) ||
    maximumHealth < 1 ||
    maximumHealth > 32767 ||
    word(before, 43) < 0 ||
    word(before, 43) > maximumHealth
  )
    throw Error("Actual completed grade0 building contribution required");
  const n = before.slice();
  put(n, 43, wrap16(word(n, 43) + increment));
  let damageRecoveryNative: Native | null = null;
  if (word(n, 49) & 0x40 && word(n, 43) > Math.trunc(maximumHealth / 3)) {
    put(n, 49, word(n, 49) & 0xfebf);
    //43620 precedes the subsequent source21 dirty-bit write.
    damageRecoveryNative = n.slice();
    n[21] = byte(n, 21) | 4;
  }
  const completed = word(n, 43) >= maximumHealth;
  if (completed) {
    n[46] = n[47]!;
    n[27] = 0;
    put(n, 43, maximumHealth);
    put(n, 49, (word(n, 49) | 1) & 0xfebf);
    n[21] = byte(n, 21) | 4;
    put(n, 61, 200);
  }
  return {
    native: n,
    damageRecoveryNative,
    completed,
    completionRequired: completed,
    completedPlayerCountOffset: completed ? 0x600 + s : null,
    acquiredOwnershipBit: completed ? 1 << s : null,
    clearCreatureTargets: completed,
    refreshCapacity: completed,
    firstCompletionAudio: null,
    changedUiAudioCondition: completed || damageRecoveryNative !== null,
  };
}
export interface EngineerSiteReservation {
  point: Point;
  targetHeight: number;
  events: ConstructionEvent[];
}
export interface EngineerNativeConstructionContext<W extends GeneticistWorld>
  extends Pick<GeneticistContext<W>, "tables" | "escapeRay"> {
  /** Actual104E1C fourteen signed dwords. Only the admitted selector is read. */
  constructionCosts: readonly number[];
  /**74E80(point,footprint,100), including real8B340 mask0 occupancy. */
  siteClass(world: W, point: Point, footprint: 1 | 3): 0 | 1 | 2 | 3 | 4;
  /**42B90/8CBA0, including reservation/material/border writes and actual
   * perimeter-average height. Must preserve world/native/player identities. */
  reserveSite(
    world: W,
    point: Point,
    footprint: 1 | 3,
  ): EngineerSiteReservation;
  /**753F0/75240 ordinary task0 footprint release, including neighbor vertex
   * protection and current climate/borders. No building demolition/refund. */
  releaseSite(
    world: W,
    request: { point: Point; footprint: 1 | 3; stage: number },
  ): ConstructionEvent[];
  /** Actual retained kind4 pool. Null represents a cleaned/unresolved target. */
  building(world: W, slot: number): Native | null;
  /**48790 code44 including real shared allocation and immediate kind4 child
   * creation. No fake building is installed when shared capacity is exhausted. */
  createBuildingEffect(
    world: W,
    request: ConstructionBuildingRequest,
  ): { effectSlot: number; buildingSlot: number } | null;
  /**441C0 actual contribution (including completed-building repair branch),
   * native/player/completion bookkeeping and its returned AL completion flag. */
  progressBuilding(
    world: W,
    slot: number,
    increment: number,
  ): { completed: boolean; events: ConstructionEvent[] };
  /** Actual Engineer resource action14 descriptor, before common advancement. */
  animation(world: W, actor: number, action: 14): AnimationProfile;
}
const byte = (n: readonly (number | null)[], p: number): number => {
  const v = n[p];
  if (v == null || !Number.isInteger(v) || v < 0 || v > 255)
    throw Error(`Unknown native Engineer construction byte ${p}`);
  return v;
};
const word = (n: readonly (number | null)[], p: number) =>
  ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const put32 = (n: Native, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
const position = (n: readonly (number | null)[], p = 7): Point => [
  word(n, p),
  word(n, p + 2),
];
function selected(n: Native): Selector {
  const s = byte(n, 131);
  if (![0, 1, 3, 6, 11].includes(s))
    throw Error(
      "Native Engineer task0 selector requires an unimplemented construction family",
    );
  return s as Selector;
}
const footprint = (s: Selector): 1 | 3 => (s === 1 || s === 6 ? 1 : 3);
function bound<W extends GeneticistWorld>(world: W, index: number) {
  if (world.specialists.bindings[index]?.category !== 0)
    throw Error("Native Engineer construction requires category0");
  const a = readSpecialistControlActor(world, index);
  if (
    byte(a.native, 126) !== 0 ||
    byte(a.native, 130) !== 1 ||
    byte(a.native, 85) !== 9
  )
    throw Error("Native Engineer construction requires actual state9 task0");
  return a;
}
function result(reason: string): EngineerConstructionReceipt {
  return { status: "active", reason, events: [], terrainJobs: [] };
}
function audio(
  out: EngineerConstructionReceipt,
  index: number,
  channel: number,
  mode: 2 | 4,
  parameter = 0,
) {
  out.events.push({ type: "audio", actorId: index, channel, mode, parameter });
}
function draw<W extends GeneticistWorld>(
  world: W,
  index: number,
  journal: number,
  out: EngineerConstructionReceipt,
): number {
  const value = nextRandom(world.rng);
  out.events.push({ type: "rng", actorId: index, journal, value });
  return value;
}
/** Virtual80/51930 is already bound to the actual actor class-speed entry. */
function goal(n: Native, p: Point, speed: number): void {
  n[90] = 1;
  put(n, 96, p[0]);
  put(n, 98, p[1]);
  put(n, 63, speed);
  n[112] = byte(n, 112) | 16;
}
function yaw(
  n: Native,
  p: Point,
  tables: EngineerNativeConstructionContext<GeneticistWorld>["tables"],
): number {
  return (
    originalAngle(
      wrap16(wrap16(p[0] - word(n, 7)) * 2),
      wrap16(wrap16(p[1] - word(n, 9)) * 2),
      tables.atan,
    ) & 2047
  );
}
function slot(n: Native): number {
  const s = byte(n, 144);
  if (s >= 25)
    throw Error("Native Engineer referenced terrain slot is unresolved");
  return s;
}
function retireJob<W extends GeneticistWorld>(
  world: W,
  n: Native,
  out: EngineerConstructionReceipt,
): void {
  const index = slot(n),
    at = CRATER_JOB_BASE + index * CRATER_JOB_STRIDE;
  if (world.missionPrefix.length <= CRATER_JOB_COUNT)
    throw Error("Native Engineer retained terrain pool required");
  const countBefore = byte(world.missionPrefix, CRATER_JOB_COUNT);
  put(world.missionPrefix, at + 12, -1);
  //51E80/539E6 are byte decrements, even if79220 already retired this job.
  world.missionPrefix[CRATER_JOB_COUNT] = (countBefore - 1) & 255;
  (out.terrainJobs ??= []).push({
    operation: "retired",
    slot: index,
    remaining: -1,
    countBefore,
    countAfter: world.missionPrefix[CRATER_JOB_COUNT],
  });
}
function releaseResources<W extends GeneticistWorld>(
  world: W,
  index: number,
  request: EngineerReleaseRequest,
  c: EngineerNativeConstructionContext<W>,
): EngineerConstructionReceipt {
  const a = readSpecialistControlActor(world, index),
    n = a.native,
    out: EngineerConstructionReceipt = {
      status: "released",
      reason: "native-construction-resources-released",
      events: [],
      terrainJobs: [],
    };
  if (
    request.task !== 0 ||
    byte(n, 126) !== 0 ||
    world.specialists.bindings[index]?.category !== 0
  )
    throw Error("Native Engineer release requires ordinary task0");
  const s = selected(n),
    stage = word(n, 136);
  if (
    request.selector !== s ||
    request.stage !== stage ||
    request.active !== !!(byte(n, 88) & 1)
  )
    throw Error("Native Engineer release snapshot differs");
  if (request.active) {
    n[74] = byte(n, 74) & 247;
    if (stage >= 1 && stage <= 2) {
      retireJob(world, n, out);
      audio(out, index, 0x29, 4);
    }
    if (stage <= 4)
      out.events.push(
        ...c.releaseSite(world, {
          point: position(n, 140),
          footprint: footprint(s),
          stage,
        }),
      );
    n[88] = byte(n, 88) & 254;
  }
  return out;
}
function cancel<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: EngineerNativeConstructionContext<W>,
  out: EngineerConstructionReceipt,
  reason: string,
): void {
  const n = readSpecialistControlActor(world, index).native;
  const r = releaseResources(
    world,
    index,
    {
      mode: 1,
      task: byte(n, 126),
      selector: byte(n, 131),
      stage: word(n, 136),
      active: !!(byte(n, 88) & 1),
    },
    c,
  );
  out.events.push(...r.events);
  (out.terrainJobs ??= []).push(...(r.terrainJobs ?? []));
  const after = cancelSpecialistWithoutActiveRole(n);
  for (let i = 0; i < n.length; i++) n[i] = after[i];
  out.status = "released";
  out.reason = reason;
  out.events.push({
    type: "cancelled",
    actorId: index,
    reason,
    retainedBuildingId: byte(n, 129) === 4 ? word(n, 127) : null,
  });
}
function building<W extends GeneticistWorld>(
  world: W,
  n: Native,
  c: EngineerNativeConstructionContext<W>,
): Native | null {
  if (byte(n, 129) !== 4) return null;
  const index = word(n, 127),
    target = c.building(world, index);
  if (!target) return null;
  if (
    target.length !== 67 ||
    byte(target, 6) !== 4 ||
    word(target, 15) !== index
  )
    throw Error("Native Engineer actual building reference differs");
  return target;
}
/** Actual two-pool wrapping debit, including selected resource-owner refill. */
function pay<W extends GeneticistWorld>(
  world: W,
  index: number,
  cost: number,
): boolean {
  const a = readSpecialistControlActor(world, index),
    raw = a.blueprint,
    primary = dword(raw, 0x4a3),
    secondary = dword(raw, 0x4a7);
  if (((primary + secondary) | 0) < cost) return false;
  const remaining = (cost - primary) | 0;
  if (remaining <= 0) put32(raw, 0x4a3, -remaining | 0);
  else {
    put32(raw, 0x4a3, 0);
    put32(raw, 0x4a7, (secondary - remaining) | 0);
  }
  const resourceOwner = byte(raw, 0x4a1);
  if (resourceOwner >= 4 || world.players[resourceOwner]?.raw.length !== 1805)
    throw Error("Native Engineer selected resource owner is unresolved");
  if (
    byte(world.players[resourceOwner].raw, 2) !== 0 &&
    ((dword(raw, 0x4a3) + dword(raw, 0x4a7)) | 0) <= 1000
  )
    put32(raw, 0x4a7, 1000);
  return true;
}
function activate<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: EngineerNativeConstructionContext<W>,
): EngineerConstructionReceipt {
  const a = bound(world, index),
    n = a.native,
    s = selected(n),
    size = footprint(s),
    out = result("native-site-prepared");
  if (!(byte(n, 88) & 1) || word(n, 136) !== 0)
    throw Error("Native Engineer507D0 prefix/active state required");
  const site = c.siteClass(world, position(n), size);
  if (![0, 1, 2, 3, 4].includes(site))
    throw Error("Unknown original74E80 classification");
  if (site !== 0) {
    n[122] = [0, 6, 5, 7, 2][site];
    if (site < 4)
      out.events.push({
        type: "message",
        actorId: index,
        index: [0, 12, 13, 14][site],
      });
    cancel(world, index, c, out, "native-site-rejected");
    out.status = "rejected";
    return out;
  }
  put(n, 11, word(n, 11) & 32767);
  put(n, 13, word(n, 13) & 32767);
  const prepared = c.reserveSite(world, position(n), size),
    p = prepared.point;
  if (
    !prepared ||
    p.length !== 2 ||
    p.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767) ||
    !Number.isInteger(prepared.targetHeight) ||
    prepared.targetHeight < -32768 ||
    prepared.targetHeight > 32767 ||
    !Array.isArray(prepared.events)
  )
    throw Error("Native Engineer actual site reservation required");
  put(n, 140, p[0]);
  put(n, 142, p[1]);
  put(n, 138, prepared.targetHeight);
  n[90] = 1;
  put(n, 96, (word(n, 7) & ~255) | 127);
  put(n, 98, (word(n, 9) & ~255) | 127);
  put(n, 134, 0);
  put32(n, 144, -1);
  put(n, 132, a.skill >> 2);
  n[74] = byte(n, 74) | 8;
  out.events.push(...prepared.events, {
    type: "message",
    actorId: index,
    index: 15,
  });
  return out;
}
function step<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: EngineerNativeConstructionContext<W>,
): EngineerConstructionReceipt {
  const a = bound(world, index),
    n = a.native,
    s = selected(n),
    stage = word(n, 136),
    out = result(`native-construction-stage${stage}`),
    arrived = !!(word(n, 73) & 32);
  if (!(byte(n, 88) & 1) || stage < 0 || stage > 5)
    throw Error("Native Engineer stage0..5 active task required");
  const continuation = (mode: 0 | 1) =>
    continueSpecialistMovement(world, index, mode, c);
  if (stage === 0) {
    if (!arrived) {
      continuation(0);
      return out;
    }
    n[89] = 13;
    n[112] = (byte(n, 112) & 239) | 128;
    const countBefore = byte(world.missionPrefix, CRATER_JOB_COUNT),
      allocation = createLevelTerrainJob(
        world,
        position(n, 11),
        footprint(s),
        word(n, 138),
        word(n, 132),
      );
    if (allocation) {
      (out.terrainJobs ??= []).push({
        operation: "allocated",
        slot: allocation.slot,
        remaining: allocation.remaining,
        countBefore,
        countAfter: byte(world.missionPrefix, CRATER_JOB_COUNT),
      });
      put32(n, 144, allocation.slot);
      put(n, 136, 1);
      audio(out, index, 0x29, 2, 255);
    }
    return out;
  }
  if (stage === 1 || stage === 2) {
    if (byte(n, 27) === 2 && byte(n, 26) === 0) audio(out, index, 0x60, 2);
    const at = CRATER_JOB_BASE + slot(n) * CRATER_JOB_STRIDE;
    if (word(world.missionPrefix, at + 12) >= 0) {
      const dx = torusDelta(word(n, 11), word(n, 7)),
        dy = torusDelta(word(n, 13), word(n, 9));
      if ((Math.imul(dx, dx) + Math.imul(dy, dy)) >>> 0 >= 65536) {
        n[112] = byte(n, 112) & 127;
        retireJob(world, n, out);
        put32(n, 144, -1);
        put(n, 136, 0);
        goal(n, position(n, 140), a.speed);
        out.reason = "native-terraform-restart-distance";
      }
      return out;
    }
    audio(out, index, 0x29, 4);
    if (draw(world, index, 0x78b, out) % 10 < 5)
      out.events.push({ type: "message", actorId: index, index: 16 });
    const sign = draw(world, index, 0x7b2, out) % 10 < 5 ? -1 : 1;
    n[112] = byte(n, 112) & 127;
    goal(
      n,
      [wrap16(word(n, 140) + sign * 256), wrap16(word(n, 142) - sign * 256)],
      a.speed,
    );
    put(n, 136, 3);
    continuation(0);
    return out;
  }
  if (stage === 3) {
    if (!arrived) {
      continuation(0);
      return out;
    }
    const base = c.constructionCosts[s];
    if (
      c.constructionCosts.length !== 14 ||
      !Number.isInteger(base) ||
      base < -2147483648 ||
      base > 2147483647
    )
      throw Error("Actual native Engineer construction cost required");
    if (!pay(world, index, (base - a.skill * 2) | 0)) {
      n[122] = 8;
      cancel(world, index, c, out, "native-construction-insufficient-funds");
      return out;
    }
    put(n, 136, 4);
    n[112] = byte(n, 112) & 239;
    const angle = yaw(n, position(n, 140), c.tables);
    n[112] = byte(n, 112) | (angle < 0x300 || angle >= 0x700 ? 0x84 : 0x80);
    n[89] = 14;
    n[29] = n[27] = 0;
    n[28] = 1;
    return out;
  }
  if (stage === 4) {
    const profile = c.animation(world, index, 14);
    if (
      byte(n, 25) !== 14 ||
      !profile ||
      !profile.holds.length ||
      profile.holds.length > 255 ||
      profile.flags & ~1 ||
      byte(n, 27) >= profile.holds.length
    )
      throw Error("Actual Engineer action14 native/descriptor required");
    if (
      !animationFinished(
        {
          action: 14,
          frame: byte(n, 27),
          hold: byte(n, 26),
          direction: (byte(n, 28) << 24) >> 24,
          delay: (byte(n, 29) << 24) >> 24,
          counter: (byte(n, 30) << 24) >> 24,
        },
        profile,
      )
    )
      return out;
    n[74] = byte(n, 74) & 247;
    const point = position(n, 140),
      request: ConstructionBuildingRequest = {
        code: 44,
        owner: a.owner,
        selector: s,
        point,
        height: groundHeight(world.terrain, ...point),
      };
    const created = c.createBuildingEffect(world, request);
    if (!created) {
      out.reason = "native-building-effect-capacity";
      return out;
    }
    const target = c.building(world, created.buildingSlot);
    if (
      !target ||
      target.length !== 67 ||
      byte(target, 6) !== 4 ||
      word(target, 15) !== created.buildingSlot ||
      byte(target, 24) !== a.owner ||
      byte(target, 45) !== s ||
      !Number.isInteger(created.effectSlot) ||
      created.effectSlot < 0 ||
      created.effectSlot >= 200
    )
      throw Error(
        "Native Engineer effect44 actual building child is unresolved",
      );
    goal(n, position(target), a.speed);
    const progressed = c.progressBuilding(world, created.buildingSlot, 1);
    if (c.building(world, created.buildingSlot) !== target)
      throw Error("Native Engineer441C0 replaced a held building record");
    if (
      !progressed ||
      typeof progressed.completed !== "boolean" ||
      !Array.isArray(progressed.events)
    )
      throw Error("Native441C0 building contribution receipt required");
    out.events.push(
      {
        type: "building-created",
        buildingId: created.buildingSlot,
        effectId: created.effectSlot,
        request,
      },
      ...progressed.events,
    );
    put(n, 127, word(target, 15));
    n[129] = byte(target, 6);
    put(n, 136, 5);
    n[89] = 15;
    n[112] = byte(n, 112) & 123;
    return out;
  }
  const target = building(world, n, c);
  if (!target) {
    n[122] = 3;
    cancel(world, index, c, out, "native-construction-building-missing");
    return out;
  }
  if (arrived) {
    if (word(target, 49) & 1) {
      out.events.push({ type: "message", actorId: index, index: 17 });
      cancel(world, index, c, out, "native-construction-finished");
      return out;
    }
    const delay = wrap16(110 - a.skill);
    put(n, 132, delay);
    put(n, 134, delay);
    n[112] = (byte(n, 112) & 0x6f) | 128;
    const angle = yaw(n, position(target), c.tables);
    n[112] =
      angle >= 0x300 && angle <= 0x700 ? byte(n, 112) | 4 : byte(n, 112) & 251;
    audio(out, index, 0x4a, 2);
    return out;
  }
  if (!(byte(n, 112) & 128)) {
    continuation(1);
    return out;
  }
  const remaining = wrap16(word(n, 134) - 1);
  put(n, 134, remaining);
  if ((world.frame + index) & 1 && draw(world, index, 0x833, out) % 10 < 1)
    audio(out, index, 0x4a, 2);
  if (remaining !== 0) return out;
  n[112] = byte(n, 112) & 123;
  if (word(target, 49) & 1 && !pay(world, index, 120 - a.skill)) {
    n[122] = 3;
    cancel(
      world,
      index,
      c,
      out,
      "native-completed-building-repair-insufficient",
    );
    return out;
  }
  const progress = c.progressBuilding(
    world,
    word(target, 15),
    wrap16(a.skill * 2),
  );
  if (c.building(world, word(target, 15)) !== target)
    throw Error("Native Engineer441C0 replaced a held building record");
  if (
    !progress ||
    typeof progress.completed !== "boolean" ||
    !Array.isArray(progress.events)
  )
    throw Error("Native441C0 building work receipt required");
  out.events.push(...progress.events);
  if (progress.completed) {
    const at = position(target),
      departure: Point = [wrap16(at[0] + 384), wrap16(at[1] + 384)];
    goal(n, departure, a.speed);
    put(n, 11, departure[0]);
    put(n, 13, departure[1]);
    n[22] = byte(n, 22) & 191;
    n[84] = 20;
    put(n, 73, (word(n, 73) | 20) & 0xeffc);
    //13E60 clears16-bit7 only; it does not stop motion.
    n[22] = byte(n, 22) & 127;
    n[79] = 0;
    n[82] = 0;
    put(n, 77, word(target, 15));
    n[79] = byte(target, 6);
    n[73] = byte(n, 73) | 128;
    put(n, 57, yaw(n, position(target), c.tables));
  } else {
    const angle = draw(world, index, 0x59c, out) * 8,
      radius = draw(world, index, 0x59d, out),
      trig = (angle - 512) & 2047;
    const dx = Math.imul(c.tables.cosine[trig], radius * 2) >> 16,
      dy = Math.imul(c.tables.sine[trig], radius * 2) >> 16;
    const center = position(target),
      point: Point = [
        (wrap16(wrap16(center[0] * 2) + dx) >> 1) & 32767,
        (wrap16(wrap16(center[1] * 2) + dy) >> 1) & 32767,
      ];
    goal(n, point, a.speed);
    put(n, 134, word(n, 132));
  }
  return out;
}
/** Concrete ordinary Engineer service implementation. The remaining host
 * ports are existing terrain/building primitives, not an opaque role callback. */
export function makeEngineerConstructionServices<W extends GeneticistWorld>(
  c: EngineerNativeConstructionContext<W>,
): EngineerConstructionServices<W> {
  return {
    activate: (world, index) => activate(world, index, c),
    step: (world, index) => step(world, index, c),
    release: (world, index, request) =>
      releaseResources(world, index, request, c),
  };
}

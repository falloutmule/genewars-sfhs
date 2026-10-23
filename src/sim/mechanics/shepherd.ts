/** Category3 source51960/507D0/54E80/54B10/54A00 and control582A5.
 * One shared57A10 motion/animation envelope; real foreign services are lazy. */
import {
  readSpecialistControlActor,
  continueSpecialistMovement,
  stepSpecialistRoleCallback,
  type GeneticistWorld,
  type GeneticistContext,
  type GeneticistCallbackContext,
  type GeneticistReceipt,
  type GeneticistProjectileProfile,
} from "./geneticist";
import { nextRandom } from "./random";
import { animationFinished } from "./animation";
import { originalAngle, wrap16 } from "./motion";
import { integerSqrt, torusDelta } from "./terrain";

type Native = (number | null)[];
type Point = [number, number];
export interface ShepherdRules {
  schemaVersion: 1;
  projectiles: readonly GeneticistProjectileProfile[];
}
export interface ShepherdReference {
  kind: 1 | 3 | 4;
  index: number;
}
export interface ShepherdTarget extends ShepherdReference {
  /** Actual canonical native image. No synthesized target or pointer fields. */
  native: Native;
  /** Actual virtual0 physical height, including the building family contract. */
  physicalHeight: number;
}
export interface ShepherdShot {
  actor: number;
  target: ShepherdReference;
  projectileIndex: number;
  profile: GeneticistProjectileProfile;
  position: Point;
  height: number;
  owner: number;
  aimSpeed: number;
  aimHeightOffset: 1280;
  parameter: 32;
  delay: 0;
}
export interface ShepherdContext<W extends GeneticistWorld>
  extends Pick<
    GeneticistContext<W>,
    "tables" | "cellOrder" | "escapeRay" | "resolveMovePoint"
  > {
  rules: ShepherdRules;
  runtimeCount11c2bc: number;
  /**6D390 logical reference resolution, read-only and without RNG. */
  resolveTarget?(
    world: W,
    actor: number,
    reference: ShepherdReference,
  ): ShepherdTarget | null;
  /**8D7B0/8D930 descriptor112748, including actual cell order, scoring and
   * virtual predicates. Null establishes a complete search with no candidate. */
  findHostile?(world: W, actor: number, radius: number): ShepherdTarget | null;
  /** Actual target virtual68/58, in source call order. */
  protectedTarget?(world: W, target: ShepherdTarget): boolean;
  deadTarget?(world: W, target: ShepherdTarget): boolean;
  targetVisible?(world: W, actor: number, target: ShepherdTarget): boolean;
  /** Source6D830→48790 effect37..43. False means actual capacity failure only;
   * an unsupported factory/lifecycle must throw. No instant creature action. */
  launchProjectile?(world: W, shot: ShepherdShot): boolean;
  /** Source806E0 after successful37..40 allocation. show=false for kind3;
   * includes original debit eligibility/balance/audio/effects, never fakefunds. */
  debit?(world: W, actor: number, amount: number, show: boolean): void;
  animation?: GeneticistContext<W>["animation"];
}
export type ShepherdCallbackContext<W extends GeneticistWorld> =
  ShepherdContext<W> & Omit<GeneticistCallbackContext<W>, "rules">;
export type ShepherdReceipt = GeneticistReceipt;
const byte = (n: readonly (number | null)[], at: number) => {
  const value = n[at];
  if (value == null || !Number.isInteger(value) || value < 0 || value > 255)
    throw Error(`Unknown Shepherd byte ${at}`);
  return value;
};
const signed = (value: number) => (value << 24) >> 24;
const word = (n: readonly (number | null)[], at: number) =>
  ((byte(n, at) | (byte(n, at + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], at: number) =>
  byte(n, at) |
  (byte(n, at + 1) << 8) |
  (byte(n, at + 2) << 16) |
  (byte(n, at + 3) << 24);
function put(n: Native, at: number, value: number) {
  n[at] = value & 255;
  n[at + 1] = (value >>> 8) & 255;
}
function put32(n: Native, at: number, value: number) {
  put(n, at, value);
  put(n, at + 2, value >>> 16);
}
function point(n: readonly (number | null)[]): Point {
  return [word(n, 7), word(n, 9)];
}
function validPoint(p: readonly number[]): asserts p is Point {
  if (
    p.length !== 2 ||
    p.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767)
  )
    throw Error("Actual signed Shepherd point required");
}
function actor<W extends GeneticistWorld>(w: W, index: number) {
  const a = readSpecialistControlActor(w, index);
  if (w.specialists.bindings[index]?.category !== 3)
    throw Error("Shepherd requires actual category3 blueprint");
  return a;
}
function receipt(reason: string): ShepherdReceipt {
  return { events: [], status: "ignored", reason };
}
function required<T>(port: T | undefined, name: string): T {
  if (!port) throw Error(`Shepherd requires actual ${name}`);
  return port;
}
function guard<W extends GeneticistWorld, T>(
  w: W,
  index: number,
  run: () => T,
): T {
  const a = actor(w, index),
    binding = w.specialists.bindings[index],
    result = run();
  if (
    actor(w, index).native !== a.native ||
    w.players[a.owner].raw !== a.blueprint ||
    w.specialists.bindings[index] !== binding
  )
    throw Error("Shepherd service replaced retained actor/player/binding");
  return result;
}
function checkedTarget(
  t: ShepherdTarget | null,
  ref?: ShepherdReference,
): ShepherdTarget | null {
  if (!t) return null;
  if (
    ![1, 3, 4].includes(t.kind) ||
    byte(t.native, 6) !== t.kind ||
    word(t.native, 15) !== t.index ||
    !Number.isInteger(t.physicalHeight) ||
    t.physicalHeight < -2147483648 ||
    t.physicalHeight > 2147483647 ||
    (ref && (t.kind !== ref.kind || t.index !== ref.index))
  )
    throw Error("Invalid actual Shepherd target");
  return t;
}
function resolve<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: ShepherdContext<W>,
  ref?: ShepherdReference,
): ShepherdTarget | null {
  const n = actor(w, index).native,
    kind = ref?.kind ?? byte(n, 129),
    targetIndex = ref?.index ?? word(n, 127);
  if (!kind) return null;
  if (![1, 3, 4].includes(kind))
    throw Error("Shepherd target kind requires its source family");
  const requested = { kind: kind as 1 | 3 | 4, index: targetIndex };
  return checkedTarget(
    guard(w, index, () =>
      required(c.resolveTarget, "6D390 target resolver")(w, index, requested),
    ),
    requested,
  );
}
function movement<W extends GeneticistWorld, C extends ShepherdContext<W>>(
  c: C,
) {
  return {
    ...c,
    movementTarget: (w: W, index: number, ref: ShepherdReference) =>
      resolve(w, index, c, ref)?.native ?? null,
  };
}
function refer(n: Native, target: ShepherdTarget) {
  put(n, 127, target.index);
  n[129] = target.kind;
}
function stop(n: Native) {
  put(n, 63, 0);
  put(n, 73, word(n, 73) & 0xefe8);
  n[84] = 0;
  n[22] = byte(n, 22) & 63;
}
function moving(n: Native) {
  return (
    word(n, 45) !== 0 ||
    word(n, 47) !== 0 ||
    word(n, 49) !== 0 ||
    dword(n, 39) > dword(n, 17)
  );
}
function angle(
  n: Native,
  target: ShepherdTarget,
  c: ShepherdContext<GeneticistWorld>,
) {
  return originalAngle(
    wrap16((word(target.native, 7) - word(n, 7)) * 2),
    wrap16((word(target.native, 9) - word(n, 9)) * 2),
    c.tables.atan,
  );
}
function profile(
  rules: ShepherdRules,
  index: number,
): GeneticistProjectileProfile {
  const p = rules?.schemaVersion === 1 ? rules.projectiles[index] : undefined;
  if (
    !p ||
    index < 0 ||
    index > 6 ||
    p.effectCode !== 37 + index ||
    [p.speedWord, p.rangeFactor, p.cooldown].some(
      (v) => !Number.isInteger(v) || v < -32768 || v > 32767,
    )
  )
    throw Error("Admitted Shepherd projectile profile required");
  return p;
}
function release<W extends GeneticistWorld>(
  w: W,
  index: number,
  out: ShepherdReceipt,
) {
  const n = actor(w, index).native;
  if (byte(n, 88) & 1) {
    n[74] = byte(n, 74) & 247;
    if (byte(n, 126) === 0) put32(n, 135, 0);
    else n[129] = 0;
    n[88] = byte(n, 88) & 254;
  }
  n[130] = 0;
  n[126] = 255;
  put(n, 112, word(n, 112) & 0xee69);
  stop(n);
  put(n, 73, word(n, 73) & 0xeffc);
  n[22] = byte(n, 22) & 127;
  out.events.push({ type: "released", actor: index, panelRefresh: true });
  out.status = "released";
  out.reason = "shepherd-work-released";
}
function prepareTarget<W extends GeneticistWorld>(
  w: W,
  index: number,
  target: ShepherdTarget,
) {
  const a = actor(w, index),
    n = a.native;
  refer(n, target);
  put(n, 136, 0);
  put(n, 138, Math.trunc((a.skill * 362) / 100) + 150);
  put(n, 132, 0);
  put(n, 134, 0);
}
function activate<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: ShepherdContext<W>,
  out: ShepherdReceipt,
) {
  const a = actor(w, index),
    n = a.native,
    task = byte(n, 126);
  n[112] = byte(n, 112) & 251;
  if (task === 0) n[129] = 0;
  n[85] = 12;
  if (task === 0) n[89] = 13;
  else {
    const selected =
      task === 2
        ? Math.min(Math.trunc((a.skill - 1) / 33), 2) + 4
        : Math.trunc((a.skill - 1) / 25);
    n[131] = selected & 255;
    const p = profile(c.rules, byte(n, 131));
    put32(n, 140, Math.imul(p.speedWord, p.rangeFactor));
  }
  out.events.push({
    type: "feedback",
    actor: index,
    mode: 2,
    reason: "shepherd-work-started",
  });
  out.status = "active";
  out.reason = "shepherd-work-started";
}

/**51960 category3 task0. Point is source5C, mode is source DL; no movement or
 * animal attachment is manufactured by staging this serializable command. */
export function queueShepherdControl<W extends GeneticistWorld>(
  world: W,
  index: number,
  q: { callerOwner: number; point: Point; mode: number },
): ShepherdReceipt {
  const w = structuredClone(world),
    a = actor(w, index),
    n = a.native,
    out = receipt("ineligible-actor");
  if (a.owner !== q.callerOwner) throw Error("Shepherd command owner differs");
  validPoint(q.point);
  if (!Number.isInteger(q.mode) || q.mode < 0 || q.mode > 255)
    throw Error("Actual Shepherd control byte required");
  if (!(byte(n, 112) & 1)) return out;
  n[87] = byte(n, 87) | 1;
  if (byte(n, 130) !== 0) release(w, index, out);
  n[126] = 0;
  put(n, 92, q.point[0]);
  put(n, 94, q.point[1]);
  n[139] = q.mode;
  put32(n, 135, Math.trunc((a.skill * 1536) / 100) + 768);
  put(n, 131, q.point[0]);
  put(n, 133, q.point[1]);
  n[130] = 1;
  out.status = "pending";
  out.reason = "shepherd-control-queued";
  Object.assign(world, w);
  return out;
}
/**51960 category3 task1/2, actual source reference and aiming tolerance. */
export function queueShepherdInteraction<W extends GeneticistWorld>(
  world: W,
  index: number,
  q: { callerOwner: number; task: 1 | 2; target: ShepherdReference },
  c: ShepherdContext<W>,
): ShepherdReceipt {
  const w = structuredClone(world),
    a = actor(w, index),
    n = a.native,
    out = receipt("ineligible-actor");
  if (a.owner !== q.callerOwner || ![1, 2].includes(q.task))
    throw Error("Invalid Shepherd interaction owner/task");
  if (!(byte(n, 112) & 1)) return out;
  const target = resolve(w, index, c, q.target);
  if (!target) throw Error("Actual Shepherd command target missing");
  n[87] = byte(n, 87) | 1;
  if (byte(n, 130) !== 0) release(w, index, out);
  n[126] = q.task;
  prepareTarget(w, index, target);
  n[130] = 1;
  out.status = "pending";
  out.reason = "shepherd-interaction-queued";
  Object.assign(world, w);
  return out;
}
export function queueShepherdMove<W extends GeneticistWorld>(
  world: W,
  index: number,
  q: { callerOwner: number; point: Point },
  c: ShepherdContext<W>,
): ShepherdReceipt {
  const w = structuredClone(world),
    a = actor(w, index),
    n = a.native,
    out = receipt("move-inhibited");
  if (a.owner !== q.callerOwner) throw Error("Shepherd command owner differs");
  if (byte(n, 113) & 16) return out;
  validPoint(q.point);
  n[87] = byte(n, 87) | 2;
  n[91] = 0;
  put(n, 92, q.point[0]);
  put(n, 94, q.point[1]);
  const p = guard(w, index, () =>
    required(c.resolveMovePoint, "74A50 move resolver")(w, index, [...q.point]),
  );
  validPoint(p);
  put(n, 92, p[0]);
  put(n, 94, p[1]);
  put(n, 11, p[0]);
  put(n, 13, p[1]);
  if (byte(n, 130) !== 0 || byte(n, 87) & 1) {
    n[87] = byte(n, 87) & 254;
    release(w, index, out);
  }
  out.status = "pending";
  out.reason = "shepherd-move-queued";
  Object.assign(world, w);
  return out;
}
export function cancelStagedShepherdWork<W extends GeneticistWorld>(
  w: W,
  index: number,
  callerOwner: number,
): ShepherdReceipt {
  if (actor(w, index).owner !== callerOwner)
    throw Error("Shepherd command owner differs");
  const out = receipt("shepherd-work-released");
  release(w, index, out);
  return out;
}
export function cancelShepherdWork<W extends GeneticistWorld>(
  world: W,
  index: number,
  callerOwner: number,
): ShepherdReceipt {
  const w = structuredClone(world),
    out = cancelStagedShepherdWork(w, index, callerOwner);
  Object.assign(world, w);
  return out;
}
function idle<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: ShepherdContext<W>,
): ShepherdReceipt {
  const a = actor(w, index),
    n = a.native,
    out = receipt("no-idle-acquisition");
  if ((w.frame + index) & 15) return out;
  const chance = (a.skill >> (byte(a.blueprint, 2) === 0 ? 1 : 3)) * 2;
  if (nextRandom(w.rng) % 100 >= chance) return out;
  const target = checkedTarget(
    guard(w, index, () =>
      required(c.findHostile, "112748 hostile query")(w, index, 512),
    ),
  );
  if (!target) return out;
  refer(n, target);
  if (
    guard(w, index, () => required(c.deadTarget, "target virtual58")(w, target))
  ) {
    n[90] = n[91] = 5;
    put(n, 63, a.speed);
    n[87] = byte(n, 87) | 2;
    n[112] = byte(n, 112) | 16;
    out.reason = "shepherd-hostile-escape";
  } else {
    n[87] = byte(n, 87) | 1;
    n[126] = 2;
    prepareTarget(w, index, target);
    n[112] = byte(n, 112) | 2;
    out.reason = "shepherd-hostile-interaction";
  }
  out.status = "pending";
  return out;
}
export function tryShepherdIdleAcquisition<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: ShepherdContext<W>,
): ShepherdReceipt {
  const w = structuredClone(world),
    out = idle(w, index, c);
  Object.assign(world, w);
  return out;
}

function firing<W extends GeneticistWorld>(
  w: W,
  index: number,
  target: ShepherdTarget,
  c: ShepherdContext<W>,
  out: ShepherdReceipt,
) {
  const a = actor(w, index),
    n = a.native,
    range = integerSqrt(
      (Math.imul(
        torusDelta(word(target.native, 7), word(n, 7)),
        torusDelta(word(target.native, 7), word(n, 7)),
      ) +
        Math.imul(
          torusDelta(word(target.native, 9), word(n, 9)),
          torusDelta(word(target.native, 9), word(n, 9)),
        ) +
        Math.imul(
          (target.physicalHeight - dword(n, 39)) >> 3,
          (target.physicalHeight - dword(n, 39)) >> 3,
        )) >>>
        0,
    );
  if (byte(n, 112) & 128) {
    const p = required(c.animation, "original firing ANB")(
      w,
      index,
      signed(byte(n, 89)),
    );
    if (
      animationFinished(
        {
          action: byte(n, 25),
          frame: byte(n, 27),
          hold: byte(n, 26),
          direction: signed(byte(n, 28)),
          delay: signed(byte(n, 29)),
          counter: signed(byte(n, 30)),
        },
        p,
      )
    ) {
      n[28] = n[27] = 0;
      n[112] = byte(n, 112) & 127;
    }
  } else if (byte(n, 112) & 16) {
    if (!(word(n, 73) & 32))
      continueSpecialistMovement(w, index, 0, movement(c));
    else {
      put(n, 112, word(n, 112) & 0xfeef);
      n[113] = byte(n, 113) | 1;
    }
  }
  if (byte(n, 90) === 5 && byte(n, 112) & 16) return;
  const inRange = range <= dword(n, 140) >>> 0;
  let pursuit = true;
  if (
    inRange &&
    guard(w, index, () =>
      required(c.targetVisible, "75890 visibility")(w, index, target),
    )
  ) {
    pursuit = false;
    if (word(n, 63) === 0 || !moving(n)) {
      if (!(byte(n, 112) & 4) && word(n, 63) === 0 && !moving(n)) {
        n[84] = 0;
        n[28] = n[27] = 0;
        n[22] = byte(n, 22) & 63;
        n[112] = (byte(n, 112) & 235) | 4;
        put(n, 73, word(n, 73) & 0xefec);
      }
    } else {
      stop(n);
      put(n, 73, word(n, 73) & 0xeffc);
      n[22] = byte(n, 22) & 127;
      n[113] = byte(n, 113) | 1;
    }
    if (byte(n, 112) & 4) {
      if (dword(n, 100) < 1) {
        const yaw = angle(n, target, c as ShepherdContext<GeneticistWorld>),
          delta = ((yaw - word(n, 57) + 1024) & 2047) - 1024;
        if (Math.abs(delta) > word(n, 138)) put(n, 75, yaw);
        else {
          const selected = byte(n, 131),
            p = profile(c.rules, selected);
          const created = guard(w, index, () =>
            required(c.launchProjectile, "6D830/48790 projectile factory")(w, {
              actor: index,
              target: { kind: target.kind, index: target.index },
              projectileIndex: selected,
              profile: p,
              position: point(n),
              height: dword(n, 39),
              owner: a.owner,
              aimSpeed: p.speedWord << 6,
              aimHeightOffset: 1280,
              parameter: 32,
              delay: 0,
            }),
          );
          if (
            typeof created !== "boolean" ||
            resolve(w, index, c, { kind: target.kind, index: target.index })
              ?.native !== target.native
          )
            throw Error(
              "Shepherd projectile service returned no real result or replaced its retained target",
            );
          if (created) {
            if (p.effectCode < 41)
              guard(w, index, () =>
                required(c.debit, "806E0 projectile debit")(
                  w,
                  index,
                  (p.effectCode - 36) * (target.kind === 3 ? 400 : 40),
                  target.kind !== 3,
                ),
              );
            put32(n, 100, p.cooldown);
            put(n, 136, word(n, 136) + 1);
          }
          n[28] = 1;
          n[27] = n[29] = 0;
          n[112] = byte(n, 112) | 128;
          out.events.push({
            type: "shot",
            actor: index,
            target: target.index,
            code: p.effectCode,
            created,
          });
        }
      } else if (range < 257) {
        put(n, 112, word(n, 112) & 0xfefb);
        refer(n, target);
        n[90] = 5;
        put(n, 63, a.speed);
        n[112] = byte(n, 112) | 16;
        continueSpecialistMovement(w, index, 0, movement(c));
      } else if (((w.frame + index) & 3) === 3)
        put(n, 75, angle(n, target, c as ShepherdContext<GeneticistWorld>));
      n[89] =
        (byte(n, 131) < 5 ? 14 : 22) +
        (((((word(n, 57) >> 7) + 1) >> 1) + 1) & 7);
    }
  }
  if (pursuit && (!(byte(n, 112) & 16) || word(n, 63) === 0)) {
    put(n, 112, word(n, 112) & 0xfefb);
    refer(n, target);
    n[90] = 4;
    put(n, 63, a.speed);
    n[112] = byte(n, 112) | 16;
    continueSpecialistMovement(w, index, 0, movement(c));
  }
}
/** Role-only54E80 / inline582A5. No motion, idle envelope or ANB tail repeats. */
export function stepStagedShepherdRole<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: ShepherdContext<W>,
): ShepherdReceipt {
  const a = actor(w, index),
    n = a.native,
    out = receipt("shepherd-role-return");
  if (byte(n, 85) !== 12) throw Error("Shepherd role requires source state12");
  if (byte(n, 126) === 0) {
    put32(n, 104, 0);
    n[112] = byte(n, 112) | 128;
    put(n, 131, word(n, 7));
    put(n, 133, word(n, 9));
    out.status = "active";
    out.reason = "shepherd-control-active";
    return out;
  }
  if (
    byte(n, 126) === 1 &&
    ((w.frame + index) & 3) === 3 &&
    c.runtimeCount11c2bc === 0 &&
    nextRandom(w.rng) % 100 < a.skill
  )
    n[126] = 2;
  if (![1, 2].includes(byte(n, 126))) return out;
  const target = resolve(w, index, c);
  if (!target) {
    if (word(n, 136) > 0)
      out.events.push({
        type: "feedback",
        actor: index,
        mode: 1,
        reason: "shepherd-target-lost",
      });
    release(w, index, out);
    return out;
  }
  const protectedTarget = guard(w, index, () =>
    required(c.protectedTarget, "target virtual68")(w, target),
  );
  const invalid =
    protectedTarget ||
    (byte(n, 126) === 2 &&
      guard(w, index, () =>
        required(c.deadTarget, "target virtual58")(w, target),
      ));
  if (!invalid) {
    firing(w, index, target, c, out);
    out.status = "active";
    out.reason = "shepherd-target-active";
    return out;
  }
  if (byte(n, 112) & 16) {
    if (!(word(n, 73) & 32))
      continueSpecialistMovement(w, index, 0, movement(c));
    else {
      put(n, 112, word(n, 112) & 0xfeef);
      n[113] = byte(n, 113) | 1;
    }
    return out;
  }
  const found = checkedTarget(
    guard(w, index, () =>
      required(c.findHostile, "112748 reacquisition query")(
        w,
        index,
        a.skill * 16 + 256,
      ),
    ),
  );
  if (found) {
    refer(n, found);
    out.status = "active";
    out.reason = "shepherd-target-reacquired";
    return out;
  }
  if (!(word(n, 112) & 2) && word(n, 136) > 0)
    out.events.push({
      type: "feedback",
      actor: index,
      mode: 1,
      reason: "shepherd-no-target",
    });
  release(w, index, out);
  return out;
}
export function stepShepherdRole<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: ShepherdContext<W>,
): ShepherdReceipt {
  const w = structuredClone(world),
    out = stepStagedShepherdRole(w, index, c);
  Object.assign(world, w);
  return out;
}
export function stepShepherdCallback<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: ShepherdCallbackContext<W>,
): ShepherdReceipt {
  return stepSpecialistRoleCallback(world, index, movement(c), {
    category: 3,
    roleState: 12,
    activate,
    release,
    idle,
    role: stepStagedShepherdRole,
  });
}

/** Actual player actor-list order for5D700. An empty returned roster is proven
 * by actual source player lists; it is never an assumed no-operator fallback. */
export function readShepherdOperators<W extends GeneticistWorld>(w: W) {
  const operators: {
    index: number;
    owner: number;
    position: Point;
    enabled: number;
    commandState: number;
    flags70: number;
    mode: number;
    range: number;
    attackBonus: number;
  }[] = [];
  for (let owner = 0; owner < w.players.length; owner++) {
    const raw = w.players[owner].raw,
      count = signed(byte(raw, 3));
    for (let at = 0; at < count; at++) {
      const index = signed(byte(raw, 4 + at)),
        n = w.specialists.records[index],
        binding = w.specialists.bindings[index];
      if (!n || n.length !== 200 || !binding)
        throw Error("Shepherd roster requires its retained C0 binding");
      const blueprint = w.players[binding.owner]?.raw,
        offset = 0x16 + binding.blueprintIndex * 36;
      if (!blueprint) throw Error("Shepherd roster blueprint player missing");
      //5D700 dereferences retained C0 before its control gates. It does not
      // demand a live kind, current ANB binding, style or valid other-role skill.
      if (signed(byte(blueprint, offset + 22)) !== 3) continue;
      if (byte(n, 130) === 0 || byte(n, 126) !== 0 || !(byte(n, 112) & 128))
        continue;
      operators.push({
        index,
        owner,
        position: point(n),
        enabled: byte(n, 130),
        commandState: byte(n, 126),
        flags70: byte(n, 112),
        mode: byte(n, 139),
        range: dword(n, 135),
        attackBonus: signed(byte(blueprint, offset + 23)),
      });
    }
  }
  return operators;
}

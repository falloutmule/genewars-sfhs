/** Category0 command/507D0 prefix/52780 and the common57A10 envelope.
 * The existing construction family supplies only its534D0 role body: running
 * its complete callback here would repeat6FB60 and7AC00. */
import {
  querySpecialistHostileMule,
  readSpecialistControlActor,
  stepSpecialistRoleCallback,
  type GeneticistWorld,
  type GeneticistContext,
  type GeneticistCallbackContext,
  type GeneticistReceipt,
} from "./geneticist";
import { cancelSpecialistWithoutActiveRole } from "./specialist-abduction";
import { nextRandom } from "./random";
import type { ConstructionEvent } from "./construction";

type Native = (number | null)[];
type Point = [number, number];
export interface EngineerConstructionReceipt {
  status: "active" | "released" | "rejected";
  reason: string;
  events: ConstructionEvent[];
  terrainJobs?: EngineerTerrainJobChange[];
}
export interface EngineerTerrainJobChange {
  operation: "allocated" | "retired";
  slot: number;
  remaining: number;
  countBefore: number;
  countAfter: number;
}
export interface EngineerReleaseRequest {
  mode: 0 | 1;
  /** Null for inactive pending work:51E80 bypasses its task operands. */
  task: number | null;
  selector: number | null;
  stage: number | null;
  active: boolean;
}
/** All services run inside the caller's isolated transaction and mutate held
 * records in place. A receipt acknowledges actual work, not a ready flag.
 * No service may perform6FB60, idle recovery, or the common7AC00 tail. */
export interface EngineerConstructionServices<W extends GeneticistWorld> {
  /** Source74E80 ->42B90/8CBA0 task0, or existing-building task1/4 setup,
   * Success includes actual reservation/task bytes and message15; rejection
   * includes actual feedback/reason and51E80 release. No motion step. */
  activate(world: W, actor: number): EngineerConstructionReceipt;
  /** Source534D0 task0/1/4 ONLY. Arrival/526C0 continuation still belongs here,
   * following the common motion prefix already performed this callback.
   * Terrain jobs run in their separate79220 family pass. */
  step(world: W, actor: number): EngineerConstructionReceipt;
  /** Source51E80 category0/task0 resource obligations: actual native job
   * retirement/count/audio for stages1/2, footprint release through4, keep
   * incomplete building at5. Clear58-bit0. The common stop is applied below.
   * Called for a queued task too so the documented normalized travel bridge
   * can cancel its own task; inactive source work must not release a site. */
  release(
    world: W,
    actor: number,
    request: EngineerReleaseRequest,
  ): EngineerConstructionReceipt;
}
export interface EngineerContext<W extends GeneticistWorld>
  extends Pick<
    GeneticistContext<W>,
    "tables" | "cellOrder" | "escapeRay" | "resolveMovePoint"
  > {
  construction?: EngineerConstructionServices<W>;
  /** Actual74A50 mask0 with explicit origin and target. Source811A0 calls
   * twice from the actual actor position, with the first result as new target. */
  resolvePlacementPoint?(
    world: W,
    actor: number,
    origin: Point,
    requested: Point,
  ): Point;
}
export type EngineerCallbackContext<W extends GeneticistWorld> =
  EngineerContext<W> & Omit<GeneticistCallbackContext<W>, "rules">;
export interface EngineerReceipt extends GeneticistReceipt {
  constructionEvents: ConstructionEvent[];
  terrainJobs: EngineerTerrainJobChange[];
}
const byte = (n: readonly (number | null)[], p: number): number => {
  const v = n[p];
  if (v == null || !Number.isInteger(v) || v < 0 || v > 255)
    throw Error(`Unknown Engineer numeric byte ${p}`);
  return v;
};
const word = (n: readonly (number | null)[], p: number) =>
  ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16;
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
function point(p: readonly number[]): asserts p is Point {
  if (
    p.length !== 2 ||
    p.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767)
  )
    throw Error("Actual signed Engineer point required");
}
function selector(s: number): number {
  if (!Number.isInteger(s) || s < 0 || s >= 14)
    throw Error("Unsupported Engineer building selector");
  return s;
}
function actor<W extends GeneticistWorld>(w: W, index: number) {
  if (w.specialists.bindings[index]?.category !== 0)
    throw Error("Actual category0 Engineer required");
  return readSpecialistControlActor(w, index);
}
function receipt(reason: string): EngineerReceipt {
  return {
    status: "ignored",
    reason,
    events: [],
    constructionEvents: [],
    terrainJobs: [],
  };
}
function guard<W extends GeneticistWorld, T>(
  w: W,
  index: number,
  call: () => T,
): T {
  const a = actor(w, index),
    binding = w.specialists.bindings[index],
    result = call();
  if (
    actor(w, index).native !== a.native ||
    w.players[a.owner].raw !== a.blueprint ||
    w.specialists.bindings[index] !== binding
  )
    throw Error(
      "Engineer service replaced retained actor/player/binding identity",
    );
  return result;
}
function absorb(out: EngineerReceipt, r: EngineerConstructionReceipt): void {
  if (
    !r ||
    !["active", "released", "rejected"].includes(r.status) ||
    typeof r.reason !== "string" ||
    !Array.isArray(r.events)
  )
    throw Error("Engineer construction service returned no actual receipt");
  out.constructionEvents.push(...r.events);
  out.terrainJobs.push(...(r.terrainJobs ?? []));
  out.status = r.status === "active" ? "active" : "released";
  out.reason = r.reason;
}
function services<W extends GeneticistWorld>(c: EngineerContext<W>) {
  if (!c.construction)
    throw Error(
      "Engineer task0/1/4 requires actual role-only construction service",
    );
  return c.construction;
}
function released(n: Native): void {
  if (byte(n, 88) & 1 || byte(n, 130) !== 0 || byte(n, 126) !== 255)
    throw Error(
      "Engineer construction release did not publish native51E80 state",
    );
}
/** Native task0 setup is admitted for all14 source selectors; the real
 * construction service must explicitly reject selectors it cannot execute. */
function activate<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: EngineerContext<W>,
  out: EngineerReceipt,
): void {
  const n = actor(w, index).native;
  const task = byte(n, 126);
  if (![0, 1, 4].includes(task) || byte(n, 130) !== 1)
    throw Error("Engineer507D0 requires source building task0/1/4");
  if (task !== 0) {
    n[112] = byte(n, 112) & 251;
    n[85] = 9;
    const r = guard(w, index, () => services(c).activate(w, index));
    absorb(out, r);
    if (r.status !== "active") released(n);
    return;
  }
  const selected = byte(n, 131) === 255 ? 255 : selector(byte(n, 131));
  n[112] = byte(n, 112) & 251;
  if (selected !== 255) n[129] = 0;
  n[85] = 9;
  put(n, 136, selected === 255 ? 5 : 0);
  const port = services(c).activate;
  if (!port) throw Error("Engineer source507D0 site service is required");
  const r = guard(w, index, () => port(w, index));
  absorb(out, r);
  if (byte(n, 85) !== 9)
    throw Error("Engineer507D0 service changed the retained state9 dispatch");
  if (r.status === "active" && selected === 255) {
    if (
      byte(n, 126) !== 0 ||
      word(n, 136) !== 5 ||
      byte(n, 89) !== 15 ||
      !(byte(n, 88) & 1)
    )
      throw Error("Engineer existing-building repair setup differs");
  } else if (r.status === "active") {
    const taskPoint = engineerPlacementPoint(
      [word(n, 7), word(n, 9)],
      selected,
    );
    if (
      byte(n, 126) !== 0 ||
      byte(n, 130) !== 1 ||
      byte(n, 131) !== selected ||
      !(byte(n, 88) & 1) ||
      word(n, 136) !== 0 ||
      word(n, 132) !== actor(w, index).skill >> 2 ||
      word(n, 134) !== 0 ||
      word(n, 144) !== -1 ||
      word(n, 146) !== -1 ||
      byte(n, 90) !== 1 ||
      word(n, 96) !== ((word(n, 7) & ~255) | 127) ||
      word(n, 98) !== ((word(n, 9) & ~255) | 127) ||
      word(n, 140) !== taskPoint[0] ||
      word(n, 142) !== taskPoint[1] ||
      !(byte(n, 74) & 8)
    )
      throw Error(
        "Engineer site service did not publish source prepared task0",
      );
  } else released(n);
}
function release<W extends GeneticistWorld>(
  w: W,
  index: number,
  mode: 0 | 1,
  c: EngineerContext<W>,
  out: EngineerReceipt,
): void {
  const n = actor(w, index).native,
    active = !!(byte(n, 88) & 1),
    task = active ? byte(n, 126) : null;
  if (active || byte(n, 130) !== 0) {
    if (active && ![0, 1, 4].includes(task!))
      throw Error("Engineer release requires unimplemented non-building task");
    const port = services(c).release;
    if (!port)
      throw Error("Engineer source51E80 construction release is required");
    if (active && task === 0) n[74] = byte(n, 74) & 247;
    const r = guard(w, index, () =>
      port(w, index, {
        mode,
        task,
        selector:
          active && task === 0
            ? byte(n, 131) === 255
              ? 255
              : selector(byte(n, 131))
            : null,
        stage: active && (task === 0 || task === 1) ? word(n, 136) : null,
        active,
      }),
    );
    absorb(out, r);
    if (r.status === "active" || byte(n, 88) & 1)
      throw Error("Engineer resource release did not release its active task");
  }
  const common = cancelSpecialistWithoutActiveRole(n);
  for (let i = 0; i < n.length; i++) n[i] = common[i];
  if (mode === 1)
    out.events.push({ type: "released", actor: index, panelRefresh: true });
  out.status = "released";
  out.reason = "engineer-work-released";
}
/** Source26890 ->75080 table104DE0. Signed torus coordinates are retained. */
export function engineerPlacementPoint(p: Point, building: number): Point {
  point(p);
  const footprint = [3, 1, 2, 3, 2, 2, 1, 2, 1, 2, 3, 3, 2, 1][
    selector(building)
  ];
  return p.map((v) => (v & ~255) | (footprint === 2 ? 0 : 127)) as Point;
}
/** Bounded opcode5 ->81080 ->51960: new task0, idle actor, no work yet.
 * Command packet argument high byte is represented by the typed selector. */
export function queueEngineerAssignment<W extends GeneticistWorld>(
  world: W,
  index: number,
  q: { callerOwner: number; selector: number },
): EngineerReceipt {
  const w = structuredClone(world),
    a = actor(w, index),
    n = a.native,
    out = receipt("ineligible-actor");
  if (q.callerOwner !== a.owner) throw Error("Engineer command owner differs");
  selector(q.selector);
  if (!(byte(n, 112) & 1)) return out;
  if (byte(n, 130) !== 0 || byte(n, 85) !== 1)
    throw Error("Engineer assignment requires idle new-task admission");
  n[87] = byte(n, 87) | 1;
  n[126] = 0;
  n[131] = q.selector;
  n[130] = 1;
  out.status = "pending";
  out.reason = "engineer-assignment-queued";
  Object.assign(world, w);
  return out;
}
/** Source26890/811A0 ordinary task0 placement. Source movement is queued;
 *507D0 setup occurs only after the common state8 arrival releases its gate. */
export function queueEngineerPlacement<W extends GeneticistWorld>(
  world: W,
  index: number,
  q: { callerOwner: number; selector: number; point: Point },
  c: EngineerContext<W>,
): EngineerReceipt {
  const w = structuredClone(world),
    a = actor(w, index),
    n = a.native,
    out = receipt("ineligible-actor"),
    requested = engineerPlacementPoint(q.point, q.selector);
  if (q.callerOwner !== a.owner) throw Error("Engineer command owner differs");
  if (!(byte(n, 112) & 1)) return out;
  if (![1, 8].includes(byte(n, 85)))
    throw Error("Engineer placement requires idle or ordinary movement state");
  if (!c.resolvePlacementPoint)
    throw Error("Engineer placement requires both actual74A50 resolver calls");
  n[87] = byte(n, 87) | 1;
  if (byte(n, 130) !== 0) release(w, index, 1, c, out);
  n[126] = 0;
  put(n, 92, requested[0]);
  put(n, 94, requested[1]);
  const first = guard(w, index, () =>
    c.resolvePlacementPoint!(
      w,
      index,
      [word(n, 7), word(n, 9)],
      [...requested],
    ),
  );
  point(first);
  n[91] = 0;
  put(n, 92, first[0]);
  put(n, 94, first[1]);
  const second = guard(w, index, () =>
    c.resolvePlacementPoint!(w, index, [word(n, 7), word(n, 9)], [...first]),
  );
  point(second);
  n[90] = 0;
  put(n, 92, second[0]);
  put(n, 94, second[1]);
  put(n, 11, second[0]);
  put(n, 13, second[1]);
  n[87] = byte(n, 87) | 3;
  n[88] = byte(n, 88) | 2;
  n[131] = q.selector;
  n[130] = 1;
  out.status = "pending";
  out.reason = "engineer-placement-queued";
  Object.assign(world, w);
  return out;
}
/** Actual80FC0 move command, including real51E80 cancellation before pending
 * source57A10 handles its movement discriminator. No simulation step here. */
export function queueEngineerMove<W extends GeneticistWorld>(
  world: W,
  index: number,
  q: { callerOwner: number; point: Point },
  c: EngineerContext<W>,
): EngineerReceipt {
  const w = structuredClone(world),
    a = actor(w, index),
    n = a.native,
    out = receipt("move-inhibited");
  if (q.callerOwner !== a.owner) throw Error("Engineer command owner differs");
  if (byte(n, 113) & 16) return out;
  point(q.point);
  if (!c.resolveMovePoint)
    throw Error("Engineer move requires actual74A50 resolver");
  n[87] = byte(n, 87) | 2;
  n[91] = 0;
  put(n, 92, q.point[0]);
  put(n, 94, q.point[1]);
  const p = guard(w, index, () => c.resolveMovePoint!(w, index, [...q.point]));
  point(p);
  put(n, 92, p[0]);
  put(n, 94, p[1]);
  put(n, 11, p[0]);
  put(n, 13, p[1]);
  if (byte(n, 130) !== 0 || byte(n, 87) & 1) {
    n[87] = byte(n, 87) & 254;
    release(w, index, 1, c, out);
  }
  out.status = "pending";
  out.reason = "move-queued";
  Object.assign(world, w);
  return out;
}
export function cancelStagedEngineerWork<W extends GeneticistWorld>(
  w: W,
  index: number,
  owner: number,
  c: EngineerContext<W>,
): EngineerReceipt {
  if (actor(w, index).owner !== owner)
    throw Error("Engineer command owner differs");
  const out = receipt("engineer-work-released");
  release(w, index, 1, c, out);
  return out;
}
export function cancelEngineerWork<W extends GeneticistWorld>(
  world: W,
  index: number,
  owner: number,
  c: EngineerContext<W>,
): EngineerReceipt {
  const w = structuredClone(world),
    out = cancelStagedEngineerWork(w, index, owner, c);
  Object.assign(world, w);
  return out;
}
/**52780 category0: same source hostile scorer as category1, then escape. */
function idle<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: EngineerContext<W>,
): EngineerReceipt {
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
      n[90] = n[91] = 5;
      put(n, 63, a.speed);
      n[87] = byte(n, 87) | 2;
      n[112] = byte(n, 112) | 16;
      out.status = "pending";
      out.reason = "hostile-target-escape";
    }
  }
  return out;
}
export function tryEngineerIdleAcquisition<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: EngineerContext<W>,
): EngineerReceipt {
  const w = structuredClone(world),
    out = idle(w, index, c);
  Object.assign(world, w);
  return out;
}
/** Native role body inside an existing isolated callback. No common prefix or
 * animation tail; a cancelled FF task executes the source534D0 return path. */
export function stepStagedEngineerRole<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: EngineerContext<W>,
): EngineerReceipt {
  const n = actor(w, index).native,
    out = receipt("cancelled-construction-return");
  if (byte(n, 85) !== 9) throw Error("Engineer role requires native state9");
  if (byte(n, 126) === 255 && byte(n, 130) === 0 && !(byte(n, 88) & 1))
    return out;
  if (
    ![0, 1, 4].includes(byte(n, 126)) ||
    byte(n, 130) !== 1 ||
    !(byte(n, 88) & 1) ||
    (byte(n, 126) === 0 && (word(n, 136) < 0 || word(n, 136) > 5))
  )
    throw Error("Engineer534D0 requires admitted building task0/1/4");
  if (byte(n, 126) === 0 && byte(n, 131) !== 255) selector(byte(n, 131));
  const port = services(c).step;
  if (!port) throw Error("Engineer source534D0 role-only service is required");
  const r = guard(w, index, () => port(w, index));
  absorb(out, r);
  if (r.status === "active") {
    if (
      byte(n, 85) !== 9 ||
      ![0, 1, 4].includes(byte(n, 126)) ||
      byte(n, 130) !== 1 ||
      !(byte(n, 88) & 1) ||
      (byte(n, 126) === 0 && (word(n, 136) < 0 || word(n, 136) > 5))
    )
      throw Error(
        "Engineer role service did not retain its active native task",
      );
  } else released(n);
  return out;
}
/** Complete shared57A10 sequencing, with actual lazy construction ports.
 * Commands/native/task/RNG/animation are serializable; missing role work is
 * an atomic error, never an acknowledged static Engineer. */
export function stepEngineerCallback<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: EngineerCallbackContext<W>,
): EngineerReceipt {
  const constructionEvents: ConstructionEvent[] = [],
    terrainJobs: EngineerTerrainJobChange[] = [],
    collect = (r: EngineerReceipt): GeneticistReceipt => {
      constructionEvents.push(...r.constructionEvents);
      terrainJobs.push(...r.terrainJobs);
      return r;
    },
    result = stepSpecialistRoleCallback(world, index, c, {
      category: 0,
      roleState: 9,
      activate: (w, i, context, out) => {
        const r = receipt("engineer-activation");
        activate(w, i, context, r);
        constructionEvents.push(...r.constructionEvents);
        terrainJobs.push(...r.terrainJobs);
        out.events.push(...r.events);
        out.status = r.status;
        out.reason = r.reason;
      },
      release: (w, i, out) => {
        const r = receipt("engineer-release");
        release(w, i, 1, c, r);
        constructionEvents.push(...r.constructionEvents);
        terrainJobs.push(...r.terrainJobs);
        out.events.push(...r.events);
        out.status = r.status;
        out.reason = r.reason;
      },
      idle: (w, i, context) => collect(idle(w, i, context)),
      role: (w, i, context) => collect(stepStagedEngineerRole(w, i, context)),
    });
  return { ...result, constructionEvents, terrainJobs };
}

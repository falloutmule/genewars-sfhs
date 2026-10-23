/** Source51E30 setup and57A10 state3 with an Ethereal kind8 association.
 * Real work cancellation/motion/resource ports belong to the staged host. */
import {
  stepSpecialistRoleCallback,
  type GeneticistWorld,
  type GeneticistCallbackContext,
  type GeneticistReceipt,
} from "./geneticist";
import { validateSpecialistNative } from "./specialist-native";
import { nextRandom } from "./random";
type Native = (number | null)[];
function byte(n: readonly (number | null)[], p: number) {
  const v = n[p];
  if (v === null || v === undefined || !Number.isInteger(v) || v < 0 || v > 255)
    throw Error("Unknown specialist abduction byte " + p);
  return v;
}
const word = (n: readonly (number | null)[], p: number) =>
  ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
const wrap = (v: number) => (v << 16) >> 16;
const put = (n: Native, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const put32 = (n: Native, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
function bound<W extends Pick<GeneticistWorld, "specialists" | "players">>(
  w: W,
  index: number,
) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 20 ||
    w.specialists.records.length !== 20 ||
    w.specialists.bindings.length !== 20 ||
    w.players.length !== 4
  )
    throw Error("Actual specialist and player pools required for abduction");
  const n = w.specialists.records[index],
    b = w.specialists.bindings[index];
  validateSpecialistNative(n);
  if (
    byte(n, 6) !== 3 ||
    word(n, 15) !== index ||
    !b ||
    b.owner !== Math.floor(index / 5) ||
    b.owner !== byte(n, 24) ||
    b.blueprintIndex !== byte(n, 116) ||
    ![0, 1, 2, 3].includes(b.category) ||
    ![0, 1, 2, 3].includes(b.style)
  )
    throw Error("Actual specialist abduction binding differs");
  const raw = w.players[b.owner].raw,
    offset = 22 + b.blueprintIndex * 36;
  if (
    raw.length !== 1805 ||
    byte(raw, offset + 21) !== b.style ||
    byte(raw, offset + 22) !== b.category
  )
    throw Error("Specialist abduction retained blueprint differs");
  return { n, b, raw };
}
/** Pure51E80 common path when58-bit0 is clear. No role-specific release,
 * resource/job cancellation, idle reset, pending-bit clear or RNG is added.
 * The host handles its selected-unit panel refresh for mode1 separately. */
export function cancelSpecialistWithoutActiveRole(
  before: readonly (number | null)[],
): Native {
  validateSpecialistNative(before);
  if (byte(before, 6) !== 3 || byte(before, 88) & 1)
    throw Error(
      "Specialist cancellation requires the actual category task release first",
    );
  const n = before.slice();
  n[130] = 0;
  n[126] = 255;
  put(n, 112, word(n, 112) & 0xee69);
  put(n, 63, 0);
  put(n, 73, word(n, 73) & 0xefe8);
  n[84] = 0;
  n[22] = byte(n, 22) & 63;
  put(n, 73, word(n, 73) & 0xeffc);
  n[22] = byte(n, 22) & 127;
  return n;
}
/**51E30 inside an existing full transaction. The required51E80 call runs
 * before every setup write, including an idle specialist's common stop path. */
export function setupStagedSpecialistAbduction<
  W extends Pick<GeneticistWorld, "specialists" | "players">,
>(
  w: W,
  index: number,
  parent: readonly (number | null)[],
  c: { cancelWork(world: W, index: number, mode: 1): void },
): void {
  const a = bound(w, index),
    parentIndex = word(parent, 15);
  if (
    parent.length !== 102 ||
    byte(parent, 6) !== 8 ||
    parentIndex < 0 ||
    parentIndex >= 16
  )
    throw Error("Actual Ethereal native parent required for abduction");
  if (!c.cancelWork)
    throw Error("Source51E80 work cancellation is required before abduction");
  c.cancelWork(w, index, 1);
  const current = bound(w, index);
  if (current.n !== a.n || current.raw !== a.raw)
    throw Error(
      "Specialist abduction cancellation replaced a retained native/player record",
    );
  a.n[85] = 3;
  put(a.n, 127, parentIndex);
  a.n[129] = 8;
  a.n[25] = 8;
  put32(a.n, 104, 10);
}
export interface SpecialistAbductionParticle {
  code: 26;
  owner: 0;
  position: [number, number];
  height: number;
  angles: [0, 0, 0];
  parameter: 0;
  delay: 0;
  parent: null;
  newborn: false;
}
export interface SpecialistAbductionServices<W extends GeneticistWorld> {
  /** Actual referenced family8 pool record, not a cached stage or pose. */
  parent(world: W, index: number): readonly (number | null)[] | null;
  /** Real unmarked48790 code26, including capacity and its successful delay
   * draw. Null means capacity failure; the three caller draws still occurred. */
  particle(world: W, request: SpecialistAbductionParticle): number | null;
}
export interface SpecialistAbductionStep {
  parentStage: number;
  timerBefore: number;
  timerAfter: number;
  particle: {
    request: SpecialistAbductionParticle;
    slot: number | null;
  } | null;
}
/** Entire52B90 over the current held unit and actual visitor stage. */
export function stepStagedSpecialistAbductionState<W extends GeneticistWorld>(
  w: W,
  index: number,
  c: SpecialistAbductionServices<W>,
): SpecialistAbductionStep {
  const a = bound(w, index),
    n = a.n,
    parentIndex = word(n, 127);
  if (
    byte(n, 85) !== 3 ||
    byte(n, 129) !== 8 ||
    parentIndex < 0 ||
    parentIndex >= 16
  )
    throw Error("Actual live Ethereal association is required by52B90");
  if (!c?.parent)
    throw Error("Source52B90 actual Ethereal parent resolver is required");
  const parent = c.parent(w, parentIndex);
  if (
    !parent ||
    parent.length !== 102 ||
    byte(parent, 6) !== 8 ||
    word(parent, 15) !== parentIndex
  )
    throw Error("Specialist abduction parent reference is unresolved");
  const stage = byte(parent, 87),
    out: SpecialistAbductionStep = {
      parentStage: stage,
      timerBefore: dword(n, 104),
      timerAfter: dword(n, 104),
      particle: null,
    };
  if ((stage << 24) >> 24 < 5 && ((w.frame + index) & 7) === 0) {
    const height = (dword(n, 39) + 640 + (nextRandom(w.rng) % 20 << 6)) | 0,
      dy = nextRandom(w.rng) % 32,
      dx = nextRandom(w.rng) % 32,
      request: SpecialistAbductionParticle = {
        code: 26,
        owner: 0,
        position: [wrap(word(n, 7) + dx), wrap(word(n, 9) + dy)],
        height,
        angles: [0, 0, 0],
        parameter: 0,
        delay: 0,
        parent: null,
        newborn: false,
      };
    if (!c.particle)
      throw Error("Source52B90 actual shared feedback26 factory is required");
    const slot = c.particle(w, request);
    const current = bound(w, index);
    if (current.n !== n || current.raw !== a.raw)
      throw Error(
        "Specialist abduction feedback replaced a retained native/player record",
      );
    out.particle = { request, slot };
  }
  if (stage === 4) {
    n[89] = 11;
    if (nextRandom(w.rng) % 4 < 2) n[112] = byte(n, 112) | 4;
    else n[112] = byte(n, 112) & 251;
  } else if (stage === 5) n[89] = 10;
  else {
    const timer = (dword(n, 104) - 1) | 0;
    put32(n, 104, timer);
    if (timer <= 0) {
      n[89] = nextRandom(w.rng) % 10 < 3 ? 8 : 11;
      put32(n, 104, 20 + (nextRandom(w.rng) % 30));
      if (nextRandom(w.rng) % 4 < 2) n[112] = byte(n, 112) | 4;
      else n[112] = byte(n, 112) & 251;
    }
  }
  out.timerAfter = dword(n, 104);
  return out;
}
export interface SpecialistAbductionCallbackContext<W extends GeneticistWorld>
  extends Omit<GeneticistCallbackContext<W>, "rules"> {
  /** Required lazily by an active state3 dispatch, after actual motion. */
  abductionServices?: SpecialistAbductionServices<W>;
}
/** Whole57A10 envelope, with the real6FB60 service before52B90 dispatch.
 * The existing charge/regen/presentation/7AC00 tail still runs.
 * The supplied optional stageWorld owns full isolation, else the default is
 * structuredClone. No ordinary role/idle callback is installed. */
export function stepSpecialistAbductionCallback<W extends GeneticistWorld>(
  world: W,
  index: number,
  c: SpecialistAbductionCallbackContext<W>,
): GeneticistReceipt & { abduction: SpecialistAbductionStep | null } {
  const a = bound(world, index);
  if (byte(a.n, 85) !== 3 || byte(a.n, 129) !== 8)
    throw Error("Actual Ethereal-associated specialist state3 required");
  if (byte(a.n, 129) === 8 && (word(a.n, 127) < 0 || word(a.n, 127) >= 16))
    throw Error("Specialist abduction parent index is invalid");
  let update: SpecialistAbductionStep | null = null;
  const unsupported = (): never => {
    throw Error("Specialist abduction entered an ordinary role callback");
  };
  const receipt = stepSpecialistRoleCallback(
    world,
    index,
    {
      ...c,
      abductionState(s: W, i: number) {
        if (!c.abductionServices)
          throw Error("Actual52B90 abduction services are required");
        update = stepStagedSpecialistAbductionState(s, i, c.abductionServices);
      },
    },
    {
      category: a.b.category as 0 | 1 | 2 | 3,
      roleState: (9 + a.b.category) as 9 | 10 | 11 | 12,
      activate: unsupported,
      release: unsupported,
      idle: unsupported,
      role: unsupported,
    },
  );
  return { ...receipt, abduction: update };
}

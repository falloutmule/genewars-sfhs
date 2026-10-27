/** Human target classifier6A760 and packet17/19 consumers81D30/82230.
 * Concrete action bodies remain in creature-commands. Staged entries belong
 * to an outer transaction; the standalone entry stages the complete host. */
import {
  interactStagedCreature,
  targetStagedCreature,
  releaseStagedCreatureAction,
  restoreCreatureCommandAliases,
  type CreatureCommandContext,
  type CreatureCommandReceipt,
  type CreatureCommandReference,
  type CreatureCommandWorld,
} from "./creature-commands";
type Native = (number | null)[];
export type HumanCreatureTargetMode = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface HumanCreatureClassifierContext<
  W extends CreatureCommandWorld,
> {
  /** Actual104A64 row; deliberately lazy after dead/visibility/self gates. */
  components(world: W, species: number): readonly [number, number];
  /** Retained6D390 address, including inactive afterimages. */
  resolve(world: W, reference: CreatureCommandReference): Native | null;
  /** Actual target cell byte12, not a UI visibility approximation. */
  visibility(world: W, target: readonly (number | null)[]): number;
  /** Only kind3 and other concrete virtual68 families use this port. */
  virtual68?(
    world: W,
    reference: CreatureCommandReference,
    native: Native,
  ): boolean;
  /** Signed104D1E[selector*3+grade], only on the repair classifier path. */
  buildingMaximumHealth?(world: W, index: number): number;
}
export interface HumanCreatureCommandContext<W extends CreatureCommandWorld> {
  components(world: W, species: number): readonly [number, number];
  resolve(world: W, reference: CreatureCommandReference): Native | null;
  /** Construct the released concrete services only when a body is reached. */
  commands(world: W): CreatureCommandContext<W>;
  /** Called at the source position (mode1 precedes its anchor writes). */
  onFeedback?(
    world: W,
    feedback: NonNullable<CreatureCommandReceipt["feedback"]>,
  ): void;
}
export interface HumanCreatureCommandReceipt {
  routine: 0x81d30 | 0x82230;
  creature: number;
  accepted: boolean;
  disposition:
    | "blocked"
    | "missing-target"
    | "installed"
    | "rejected"
    | "stopped"
    | "unchanged";
  mode?: number;
  feedback?: CreatureCommandReceipt["feedback"];
  panelRefreshRequested?: boolean;
  sourceScratch95?: CreatureCommandReceipt["sourceScratch95"];
}
const byte = (n: readonly (number | null)[], p: number): number => {
  const v = n[p];
  if (v == null || !Number.isInteger(v) || v < 0 || v > 255)
    throw Error(`Actual human creature command byte${p} required`);
  return v;
};
const word = (n: readonly (number | null)[], p: number) =>
  ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16;
const put = (n: Native, p: number, value: number) => {
  n[p] = value & 255;
  n[p + 1] = (value >>> 8) & 255;
};
function actor<W extends CreatureCommandWorld>(w: W, index: number) {
  const n = w.creatureNative[index];
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 300 ||
    !n ||
    n.length !== 124 ||
    byte(n, 6) !== 1 ||
    word(n, 15) !== index
  )
    throw Error("Actual human creature native124 identity required");
  return n;
}
function reference(r: CreatureCommandReference) {
  if (
    ![1, 2, 3, 4, 5].includes(r.kind) ||
    !Number.isInteger(r.index) ||
    r.index < 0 ||
    r.index >= { 1: 300, 2: 512, 3: 20, 4: 256, 5: 200 }[r.kind]
  )
    throw Error("Invalid human creature retained reference");
}
function resolved<W extends CreatureCommandWorld>(
  w: W,
  r: CreatureCommandReference,
  c: { resolve(world: W, reference: CreatureCommandReference): Native | null },
) {
  reference(r);
  const n = c.resolve(w, r);
  if (n && word(n, 15) !== r.index)
    throw Error("Human creature retained target index differs");
  return n;
}
function components<W extends CreatureCommandWorld>(
  w: W,
  n: Native,
  c: { components(world: W, species: number): readonly [number, number] },
) {
  const row = c.components(w, (byte(n, 122) << 24) >> 24);
  if (
    !row ||
    row.length !== 2 ||
    row.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
  )
    throw Error("Actual104A64 component pair required");
  return row;
}
function raw<W extends CreatureCommandWorld>(w: W, owner: number) {
  const n = w.players?.[owner]?.raw;
  if (!n || n.length !== 1805)
    throw Error("Actual human creature owner1805 record required");
  return n;
}
function friendly<W extends CreatureCommandWorld>(w: W, n: Native, t: Native) {
  const owner = byte(n, 24),
    other = byte(t, 24);
  return (
    owner === other ||
    (owner !== 4 && !!(byte(raw(w, owner), 0x6e5) & (1 << (other & 31))))
  );
}
function dead<W extends CreatureCommandWorld>(
  w: W,
  n: Native,
  r: CreatureCommandReference,
  c: HumanCreatureClassifierContext<W>,
) {
  //The vtable survives retirement; byte6 may already be zero. Logical pool
  //identity carries the former native vtable without retaining a pointer.
  const kind = r.kind;
  if (kind === 1) return byte(n, 94) >= 24;
  if (kind === 2) return word(n, 44) <= 0;
  if (kind === 4) return word(n, 43) <= 0;
  if (!c.virtual68)
    throw Error(`Actual kind${kind} classifier virtual68 required`);
  return c.virtual68(w, r, n);
}

/** Read-only6A760. Mode3 can be classified from actual species14 inputs;
 * its5D0E0 execution remains a separate, explicitly unimplemented family. */
export function classifyHumanCreatureTarget<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  target: CreatureCommandReference | null,
  input: { force: boolean; bypassVisibility: boolean },
  c: HumanCreatureClassifierContext<W>,
): HumanCreatureTargetMode {
  const n = actor(w, index),
    t = target ? resolved(w, target, c) : null;
  if (byte(n, 94) >= 24) return 0;
  if (t && !input.bypassVisibility && byte([c.visibility(w, t)], 0) === 0)
    return 0;
  if (t === n) return 0;
  const genes = components(w, n, c),
    has = (v: number) => genes.includes(v);
  if (t && byte(t, 6) === 4 && has(1) && friendly(w, n, t)) {
    if (byte(t, 47) > byte(t, 46) && word(t, 49) & 0x400) return 6;
    if (!c.buildingMaximumHealth)
      throw Error("Actual104D1E classifier health required");
    const maximum = c.buildingMaximumHealth(w, target!.index);
    if (!Number.isInteger(maximum) || maximum < -32768 || maximum > 32767)
      throw Error("Actual signed classifier building health required");
    if (word(t, 43) < maximum) return 6;
  }
  if (!t) return 0;
  const kind = byte(t, 6);
  if (kind === 2) {
    if (has(4) || has(1)) return !(byte(t, 46) & 8) ? 5 : has(4) ? 4 : 0;
    if (genes[0] !== 0) return 0;
    const owner = byte(n, 24),
      species = (byte(n, 122) << 24) >> 24;
    const ability =
      owner === 4
        ? byte(n, 118) > 90
        : !!(byte(n, 97) & 4) || byte(raw(w, owner), 0x6c7 + species) >= 1;
    return ability && !(byte(t, 46) & 8) ? 2 : 0;
  }
  if (byte(n, 122) === 14 && friendly(w, n, t) && !dead(w, t, target!, c)) {
    if (kind === 3)
      return byte(t, 130) === 0 && (byte(t, 85) << 24) >> 24 !== 2 ? 3 : 0;
    if (kind === 1)
      return components(w, t, c)[0] === 3 && byte(t, 94) !== 15 ? 0 : 3;
  }
  if (kind === 1 && has(4)) {
    if (dead(w, t, target!, c) && byte(raw(w, byte(n, 24)), 0x604) > 0)
      return 4;
    if (dead(w, t, target!, c)) return 0;
    return !friendly(w, n, t) || input.force ? 1 : 0;
  }
  if (kind === 8 || kind === 2) return 0;
  if (friendly(w, n, t) && !input.force) return 0;
  return dead(w, t, target!, c) ? 0 : 1;
}

function mule(n: Native) {
  if (byte(n, 122) !== 4)
    throw Error(
      "Human command execution requires admitted Mule4; other species need their concrete action bodies",
    );
}
function anchors(n: Native, t: Native) {
  put(n, 114, word(t, 7));
  put(n, 116, word(t, 9));
  n[96] = byte(n, 96) | 8;
  put(n, 110, word(t, 7));
  put(n, 112, word(t, 9));
  n[97] = byte(n, 97) | 128;
}
function feedback<W extends CreatureCommandWorld>(
  w: W,
  n: Native,
  input: { callerOwner: number; selectedPlayer: number },
  c: HumanCreatureCommandContext<W>,
  out: HumanCreatureCommandReceipt,
) {
  if (input.callerOwner !== input.selectedPlayer) return;
  out.feedback = {
    owner: input.selectedPlayer,
    cue: ((components(w, n, c)[0] + 0x45) << 24) >> 24,
    mode: 2,
    parameter: 0,
    volume: 127,
    ratePercent: (100 + ((256 - byte(n, 119)) >> 2)) & 255,
    range: 64,
  };
  c.onFeedback?.(w, out.feedback);
}
/** Protect source pointer identity across concrete action and feedback ports. */
function stable<W extends CreatureCommandWorld, T>(
  w: W,
  index: number,
  t: Native | null,
  r: CreatureCommandReference | null,
  c: HumanCreatureCommandContext<W>,
  run: () => T,
): T {
  const pool = w.creatureNative,
    n = actor(w, index),
    players = w.players?.map((p) => p.raw);
  const out = run();
  if (
    w.creatureNative !== pool ||
    actor(w, index) !== n ||
    players?.some((p, i) => p !== w.players?.[i]?.raw) ||
    (r && resolved(w, r, c) !== t)
  )
    throw Error(
      "Human creature service replaced retained native/player identity",
    );
  return out;
}

/** Full81D30 packet mode, not a fresh classifier decision. Ownership belongs
 * to the producer/queue; the original consumer has no owner gate. */
export function issueStagedHumanCreatureTarget<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  input: {
    callerOwner: number;
    selectedPlayer: number;
    target: CreatureCommandReference | null;
    mode: number;
  },
  c: HumanCreatureCommandContext<W>,
): HumanCreatureCommandReceipt {
  if (!Number.isInteger(input.mode) || input.mode < 0 || input.mode > 255)
    throw Error("Actual human target packet mode byte required");
  const n = actor(w, index),
    out: HumanCreatureCommandReceipt = {
      routine: 0x81d30,
      creature: index,
      accepted: false,
      disposition: "blocked",
      mode: input.mode,
    };
  if ([18, 15].includes(byte(n, 94)) || byte(n, 94) >= 24 || byte(n, 97) & 1)
    return out;
  const t = input.target ? resolved(w, input.target, c) : null;
  return stable(w, index, t, input.target, c, () => {
    if (!t) {
      n[120] = 0;
      n[96] = byte(n, 96) & 239;
      out.disposition = "missing-target";
      return out;
    }
    mule(n);
    if (input.mode === 3)
      throw Error("Human mode3 requires concrete5D0E0 carrier command");
    const commands = c.commands(w);
    if (input.mode === 1 || input.mode === 2) {
      n[96] = byte(n, 96) | 16;
      n[120] = input.mode;
      n[97] = byte(n, 97) & 191;
      const inner = interactStagedCreature(
        w,
        index,
        input.target!,
        input.mode === 2,
        commands,
      );
      if (input.mode === 1 && !inner.accepted) {
        n[120] = 0;
        n[96] = byte(n, 96) & 239;
        out.disposition = "rejected";
        return out;
      }
      if (input.mode === 1) feedback(w, n, input, c, out);
      anchors(n, t);
      if (input.mode === 2) feedback(w, n, input, c, out);
    } else {
      const inner = targetStagedCreature(w, index, input.target!, commands);
      if (!inner.accepted) {
        out.disposition = "rejected";
        return out;
      }
      if (inner.sourceScratch95) out.sourceScratch95 = inner.sourceScratch95;
      anchors(n, t);
      n[96] = byte(n, 96) | 16;
      n[120] = input.mode;
      n[97] = byte(n, 97) & 191;
      feedback(w, n, input, c, out);
    }
    out.accepted = true;
    out.disposition = "installed";
    return out;
  });
}

/**82230's argument word is zero in the human stop producer. A stunned
 *5CC60 false result still clears wrapper task120/flag96bit4. Unlike target
 *execution, this common release has no species gate or concrete action body. */
export function stopStagedHumanCreature<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  input: {
    argument: number;
    selectedPlayer: number;
    selectedPanelRefresh: boolean;
  },
  c: HumanCreatureCommandContext<W>,
): HumanCreatureCommandReceipt {
  if (
    !Number.isInteger(input.argument) ||
    input.argument < -32768 ||
    input.argument > 32767
  )
    throw Error("Actual human stop packet argument word required");
  const n = actor(w, index),
    out: HumanCreatureCommandReceipt = {
      routine: 0x82230,
      creature: index,
      accepted: false,
      disposition: "unchanged",
    };
  if (input.argument !== 0 || byte(n, 120) === 0) return out;
  return stable(w, index, null, null, c, () => {
    releaseStagedCreatureAction(w, index, c.commands(w));
    n[96] = byte(n, 96) & 239;
    n[120] = 0;
    out.accepted = true;
    out.disposition = "stopped";
    out.panelRefreshRequested =
      input.selectedPlayer === byte(n, 24) && input.selectedPanelRefresh;
    return out;
  });
}

/** Atomic reusable wrapper. Completed source false paths commit their writes. */
export function executeHumanCreatureCommand<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  command:
    | ({ type: "target" } & Parameters<
        typeof issueStagedHumanCreatureTarget<W>
      >[2])
    | ({ type: "stop" } & Parameters<typeof stopStagedHumanCreature<W>>[2]),
  c: HumanCreatureCommandContext<W>,
) {
  const staged = structuredClone(w);
  restoreCreatureCommandAliases(staged);
  const out =
    command.type === "target"
      ? issueStagedHumanCreatureTarget(staged, index, command, c)
      : stopStagedHumanCreature(staged, index, command, c);
  Object.assign(w, staged);
  return out;
}

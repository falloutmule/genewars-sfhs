/** Concrete81C60/5DF50,5CC60(+5C920),5D870 and5B580 command bodies.
 * Staged entries retain all native aliases; standalone entry owns whole-host clone. */
import { nextRandom, type GeneRng } from "./random";
import {
  muleRequestedSpeed,
  type EcologyState,
  type EcologyRules,
} from "./ecology";
import { originalAngle, wrap16, type MotionTables } from "./motion";
type N = (number | null)[];
type Point = [number, number];
export interface CreatureCommandReference {
  kind: 1 | 2 | 3 | 4 | 5;
  index: number;
}
export interface CreatureCommandWorld {
  creatureNative: N[];
  ecology: EcologyState;
  rng: GeneRng;
  players?: { raw: number[] }[];
  /**Actual caller-stack byte for accepted5D870 arms that do not initialize it.*/ creatureCommandScratch?: Record<
    number,
    { value: number; provenance: string }
  >;
}
export interface CreatureCommandContext<W extends CreatureCommandWorld> {
  rules: EcologyRules;
  tables: MotionTables;
  speciesComponents: readonly (readonly [number, number])[];
  /**Retained6D390 binding. No live-kind filter may hide an inactive afterimage.*/ resolve?(
    world: W,
    ref: CreatureCommandReference,
  ): N | null;
  /**Actual other-species virtual80; Mule4 uses its admitted scalar rules.*/ requestedSpeed?(
    world: W,
    index: number,
  ): number;
  /**Actual creature virtual8C, after any command prefix writes.*/ occupied?(
    world: W,
    index: number,
  ): boolean;
  /**74270 mask1 at actual physical39, source5B60B.*/ collisionBuilding?(
    world: W,
    index: number,
  ): number | null;
  /**74160 mask0 first footprint, source5C9DA corpse-unload branch.*/ footprintBuilding?(
    world: W,
    index: number,
  ): number | null;
  /**10457C exact source corpse-deposit anchor, read lazily.*/ corpseDepositOffset?: Point;
  /**104DE0→104E12 source combat halfwidth, not construction footprint.*/ buildingHalfWidth?(
    world: W,
    index: number,
  ): number;
  /**104D1E[selector*3+grade] for completed service target admission.*/ buildingMaximumHealth?(
    world: W,
    index: number,
  ): number;
  /**43130(owner aggregate,currentpoint,selector mask4,required flags0x18).*/ findServiceBuilding?(
    world: W,
    index: number,
  ): number | null;
  /**Actual49D30 effect36 unlink/reference cleanup, only when carrier is dead.*/ retireCarrierEffect36?(
    world: W,
    creature: number,
    effect: number,
  ): void;
}
export interface CreatureCommandReceipt {
  routine: 0x81c60 | 0x5df50 | 0x5cc60 | 0x5d870 | 0x5b580;
  creature: number;
  accepted: boolean;
  feedback?: {
    owner: number;
    cue: number;
    mode: 2;
    parameter: 0;
    volume: 127;
    ratePercent: number;
    range: 64;
  };
  panelRefreshRequested?: boolean;
  sourceScratch95?: { value: number; provenance: string };
}
const b = (n: readonly (number | null)[], p: number) => {
  const v = n[p];
  if (v == null || !Number.isInteger(v) || v < 0 || v > 255)
    throw Error(`Unknown creature command byte ${p}`);
  return v;
};
const word = (n: readonly (number | null)[], p: number) =>
  ((b(n, p) | (b(n, p + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  b(n, p) | (b(n, p + 1) << 8) | (b(n, p + 2) << 16) | (b(n, p + 3) << 24);
const put = (n: N, p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >>> 8) & 255;
};
const at = (n: N): Point => [word(n, 7), word(n, 9)];
const point = (p: Point) => {
  if (
    p.length !== 2 ||
    p.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767)
  )
    throw Error("Actual signed-word creature command point required");
};
function actor<W extends CreatureCommandWorld>(w: W, index: number) {
  const n = w.creatureNative[index];
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= 300 ||
    !n ||
    n.length !== 124 ||
    b(n, 6) !== 1 ||
    word(n, 15) !== index
  )
    throw Error("Actual creature command native124 identity required");
  return n;
}
function retained<W extends CreatureCommandWorld>(
  w: W,
  r: CreatureCommandReference,
  c: CreatureCommandContext<W>,
): N | null {
  if (
    ![1, 2, 3, 4, 5].includes(r.kind) ||
    !Number.isInteger(r.index) ||
    r.index < 0 ||
    r.index >= { 1: 300, 2: 512, 3: 20, 4: 256, 5: 200 }[r.kind]
  )
    throw Error("Invalid retained creature-command reference");
  const n =
    r.kind === 1
      ? w.creatureNative[r.index]
      : r.kind === 2
        ? w.ecology.plants[r.index]?.native
        : c.resolve?.(w, r);
  if (!n) throw Error("Actual retained creature-command binding missing");
  return n;
}
function target<W extends CreatureCommandWorld>(
  w: W,
  r: CreatureCommandReference,
  c: CreatureCommandContext<W>,
) {
  const n = retained(w, r, c)!;
  if (word(n, 15) !== r.index)
    throw Error("Creature target retained index differs");
  return n;
}
function genes<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  c: CreatureCommandContext<W>,
) {
  const n = actor(w, index),
    selector = (b(n, 122) << 24) >> 24,
    row = c.speciesComponents[selector];
  if (
    !row ||
    row.length !== 2 ||
    row.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
  )
    throw Error("Admitted creature component row required");
  return row;
}
function speed<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  c: CreatureCommandContext<W>,
) {
  const n = actor(w, index);
  if (b(n, 122) === 4) {
    b(n, 118);
    b(n, 123);
  }
  const v =
    b(n, 122) === 4
      ? muleRequestedSpeed(
          { id: `source:0:${index}`, index, native: n, pending: [] },
          c.rules,
        )
      : c.requestedSpeed?.(w, index);
  if (v == null || !Number.isInteger(v) || v < -32768 || v > 32767)
    throw Error("Actual creature virtual80 speed required");
  return v;
}
function reference(n: N, p: number, r: CreatureCommandReference) {
  put(n, p, r.index);
  n[p + 2] = r.kind;
}
function follow(n: N, p: Point, clear = 63) {
  point(p);
  put(n, 11, p[0]);
  put(n, 13, p[1]);
  n[22] = b(n, 22) & clear;
  put(n, 73, (word(n, 73) | 20) & 0xeffc);
  n[84] = 20;
  n[79] = n[82] = 0;
}
function start<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  c: CreatureCommandContext<W>,
) {
  const n = actor(w, index);
  put(n, 63, speed(w, index, c));
  put(n, 108, 32767);
  n[96] = b(n, 96) | 128;
  if (genes(w, index, c)[0] === 3) {
    n[74] = b(n, 74) | 4;
    put(n, 59, 300);
    n[21] = b(n, 21) | 32;
  }
}
function occupied<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  c: CreatureCommandContext<W>,
) {
  if (!c.occupied)
    throw Error("Actual creature virtual8C occupancy service required");
  const result = c.occupied(w, index);
  if (typeof result !== "boolean")
    throw Error("Creature occupancy result is not established");
  return result;
}
function buildingIndex(value: number | null, name: string): number | null {
  if (value !== null && (!Number.isInteger(value) || value < 0 || value >= 256))
    throw Error(`Actual ${name} building index required`);
  return value;
}
function escape<W extends CreatureCommandWorld>(
  w: W,
  p: Point,
  radius: number,
  c: CreatureCommandContext<W>,
): Point {
  if (!Number.isInteger(radius) || radius < 0 || radius > 65535)
    throw Error("Admitted source73C20 radius required");
  const angle = (nextRandom(w.rng) * 8 - 512) & 2047,
    length = (radius * nextRandom(w.rng)) >> 8;
  return [
    (wrap16(
      wrap16(p[0] * 2) + (Math.imul(length * 2, c.tables.cosine[angle]) >> 16),
    ) >>
      1) &
      32767,
    (wrap16(
      wrap16(p[1] * 2) + (Math.imul(length * 2, c.tables.sine[angle]) >> 16),
    ) >>
      1) &
      32767,
  ];
}
function virtual68(n: N, kind: number) {
  return kind === 1
    ? b(n, 94) >= 24
    : kind === 2
      ? word(n, 44) <= 0
      : kind === 4
        ? word(n, 43) <= 0
        : false;
}
function detach<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  c: CreatureCommandContext<W>,
) {
  const n = actor(w, index);
  if (!(b(n, 96) & 2)) return;
  let clear = true;
  const kind = b(n, 93),
    slot = word(n, 91);
  if (kind !== 0 && slot >= 0) {
    const r = { kind: kind as CreatureCommandReference["kind"], index: slot };
    if (![1, 2, 3, 4, 5].includes(kind))
      throw Error("Carrier target requires its concrete source family");
    const peer = retained(w, r, c)!;
    if (b(peer, 6) === 1) {
      peer[97] = b(peer, 97) & 254;
      peer[21] = b(peer, 21) & 223;
      peer[74] = b(peer, 74) & 59;
      if (!virtual68(peer, 1)) {
        const delay = 5 + (nextRandom(w.rng) % 5);
        peer[94] = 8;
        if (occupied(w, slot, c)) {
          follow(peer, escape(w, at(peer), 256, c), 191);
          peer[22] = b(peer, 22) & 127;
          start(w, slot, c);
        } else put(peer, 108, delay);
      } else {
        if (!c.footprintBuilding)
          throw Error("Actual74160 corpse-unload service required");
        const building = buildingIndex(c.footprintBuilding(w, index), "74160");
        if (building !== null) {
          const bn = target(w, { kind: 4, index: building }, c);
          if (b(bn, 45) === 4) {
            const offset = c.corpseDepositOffset;
            if (!offset)
              throw Error("Admitted10457C corpse-deposit offset required");
            if (
              (word(peer, 7) & 0xff00) ===
                ((word(bn, 7) + offset[0]) & 65535) &&
              (word(peer, 9) & 0xff00) === ((word(bn, 9) + offset[1]) & 65535)
            )
              peer[96] = b(peer, 96) | 32;
          }
        }
      }
    } else if (b(peer, 6) === 3) {
      peer[74] = b(peer, 74) & 59;
      peer[85] = 1;
      peer[21] = b(peer, 21) & 223;
    } else if (b(peer, 6) === 5) {
      const code = b(peer, 69);
      if (code === 36) {
        if (!virtual68(n, 1)) clear = false;
        else {
          if (!c.retireCarrierEffect36)
            throw Error("Actual49D30 effect36 retirement service required");
          c.retireCarrierEffect36(w, index, slot);
          if (b(peer, 6) !== 0)
            throw Error("Effect36 retirement did not retire its real record");
        }
      } else if (code === 67) {
        peer[69] = 68;
        peer[21] = b(peer, 21) & 223;
      }
    }
  }
  if (clear) {
    n[96] = b(n, 96) & 253;
    n[93] = 0;
  }
}
function releaseStagedCreatureActionBody<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  c: CreatureCommandContext<W>,
): CreatureCommandReceipt {
  const n = actor(w, index);
  if (b(n, 94) === 18)
    return { routine: 0x5cc60, creature: index, accepted: false };
  detach(w, index, c);
  const state = b(n, 94),
    kind = b(n, 87),
    slot = word(n, 85);
  if (kind === 2 && [1, 7, 11].includes(state)) {
    const p = retained(w, { kind: 2, index: slot }, c)!;
    p[46] = b(p, 46) & (state === 7 ? 254 : 251);
    const projection = w.ecology.plants[slot];
    if (projection?.native === p) projection.plantFlags = p[46]!;
  } else if (kind === 1 && [3, 5, 10].includes(state)) {
    const peer = retained(w, { kind: 1, index: slot }, c)!;
    if (state === 5) peer[96] = b(peer, 96) & 254;
    else peer[87] = 0;
  }
  const flags = word(n, 96);
  put(n, 53, 0);
  put(n, 51, 0);
  n[21] = b(n, 21) & 223;
  put(n, 96, flags & 0xd71a);
  if (!(flags & 2)) n[93] = 0;
  n[87] = 0;
  put(n, 108, 0);
  return { routine: 0x5cc60, creature: index, accepted: true };
}
function moveStagedCreatureBody<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  p: Point,
  c: CreatureCommandContext<W>,
  panelRefresh = false,
): CreatureCommandReceipt {
  point(p);
  const n = actor(w, index);
  if (b(n, 94) === 2 && word(n, 96) & 2) n[96] = b(n, 96) | 1;
  else {
    releaseStagedCreatureAction(w, index, c);
    n[94] = 0;
  }
  for (const offset of [110, 114]) {
    put(n, offset, p[0]);
    put(n, offset + 2, p[1]);
  }
  n[96] = b(n, 96) | 8;
  n[97] = b(n, 97) | 128;
  if (b(n, 24) !== 4) {
    n[120] = 7;
    n[96] = b(n, 96) | 16;
    n[97] = b(n, 97) & 191;
  }
  n[95] = 0;
  if (b(n, 94) === 2) {
    start(w, index, c);
    n[22] = b(n, 22) & 63;
    put(n, 11, p[0]);
    put(n, 13, p[1]);
    n[84] = 20;
    put(n, 73, (word(n, 73) | 20) & 0xeffc);
    n[79] = n[82] = 0;
  }
  return {
    routine: 0x5df50,
    creature: index,
    accepted: true,
    panelRefreshRequested: panelRefresh,
  };
}
function executeStagedCreatureMoveBody<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  p: Point,
  c: CreatureCommandContext<W>,
  q: {
    callerOwner: number;
    selectedPlayer: number;
    selectedPanelRefresh: boolean;
  },
): CreatureCommandReceipt {
  const n = actor(w, index),
    out: CreatureCommandReceipt = {
      routine: 0x81c60,
      creature: index,
      accepted: false,
    };
  if ([18, 15].includes(b(n, 94)) || virtual68(n, 1) || b(n, 97) & 1)
    return out;
  const primary = genes(w, index, c)[0];
  if (q.callerOwner === q.selectedPlayer)
    out.feedback = {
      owner: q.selectedPlayer,
      cue: ((primary + 69) << 24) >> 24,
      mode: 2,
      parameter: 0,
      volume: 127,
      ratePercent: (((256 - b(n, 119)) >> 2) + 100) & 255,
      range: 64,
    };
  moveStagedCreature(w, index, p, c, q.selectedPanelRefresh);
  out.accepted = true;
  out.panelRefreshRequested = q.selectedPanelRefresh;
  return out;
}
function interactStagedCreatureBody<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  r: CreatureCommandReference | null,
  force: boolean,
  c: CreatureCommandContext<W>,
): CreatureCommandReceipt {
  const n = actor(w, index);
  releaseStagedCreatureAction(w, index, c);
  const t = r ? target(w, r, c) : null;
  if (
    !t ||
    ([1, 3].includes(r!.kind) &&
      word(t, 73) & 1024 &&
      genes(w, index, c)[0] !== 3)
  ) {
    n[94] = 8;
    if (!occupied(w, index, c)) put(n, 108, 3);
    else {
      follow(n, escape(w, at(n), 256, c), 191);
      n[22] = b(n, 22) & 127;
      start(w, index, c);
    }
    return { routine: 0x5b580, creature: index, accepted: false };
  }
  reference(n, 85, r!);
  if (b(n, 120) !== 0) reference(n, 88, r!);
  let accepted = true;
  if (r!.kind === 1 || r!.kind === 3) {
    n[22] = b(n, 22) & 63;
    put(n, 73, (word(n, 73) | 20) & 0xeffc);
    n[84] = 20;
    n[79] = 0;
    reference(n, 80, r!);
  } else if (r!.kind === 4) {
    if (!c.collisionBuilding)
      throw Error("Actual74270 building acquisition service required");
    if (buildingIndex(c.collisionBuilding(w, index), "74270") === r!.index) {
      if (!c.buildingHalfWidth)
        throw Error("Admitted104DE0/104E12 building radius required");
      const half = c.buildingHalfWidth(w, r!.index);
      if (!Number.isInteger(half) || half < 0 || half > 32767)
        throw Error("Admitted building half-width required");
      follow(n, escape(w, at(t), (half + 256) & 65535, c));
      accepted = false;
    } else {
      follow(n, at(t), 191);
      n[22] = b(n, 22) & 127;
      reference(n, 77, r!);
    }
  } else {
    follow(n, at(t));
    if (r!.kind === 2 && force) n[96] = b(n, 96) | 32;
  }
  start(w, index, c);
  n[94] = accepted ? 1 : 8;
  if (accepted) n[96] = b(n, 96) | 64;
  return { routine: 0x5b580, creature: index, accepted };
}
/**5D870 sets pending95; it does not fabricate its later5ED20 action state.*/
function targetStagedCreatureBody<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  r: CreatureCommandReference,
  c: CreatureCommandContext<W>,
): CreatureCommandReceipt {
  const n = actor(w, index),
    t = target(w, r, c),
    kind = b(t, 6),
    component = genes(w, index, c),
    has = (v: number) => component.includes(v),
    out: CreatureCommandReceipt = {
      routine: 0x5d870,
      creature: index,
      accepted: true,
    };
  let pending: number | undefined;
  const retain = () => {
    if (b(n, 120) !== 0) reference(n, 88, r);
  };
  if (kind === 1) {
    if (!virtual68(t, 1) || !has(4)) out.accepted = false;
    else {
      releaseStagedCreatureAction(w, index, c);
      reference(n, 91, r);
      start(w, index, c);
      follow(n, at(t), 191);
      n[22] = b(n, 22) & 127;
      put(
        n,
        57,
        originalAngle(
          wrap16((word(t, 7) - word(n, 7)) * 2),
          wrap16((word(t, 9) - word(n, 9)) * 2),
          c.tables.atan,
        ),
      );
      pending = 1;
      retain();
    }
  } else if (kind === 2) {
    if (b(t, 46) & 8) {
      if (has(4)) {
        releaseStagedCreatureAction(w, index, c);
        reference(n, 91, r);
        retain();
        start(w, index, c);
        follow(n, at(t), 191);
        n[22] = b(n, 22) & 127;
        put(
          n,
          57,
          originalAngle(
            wrap16((word(t, 7) - word(n, 7)) * 2),
            wrap16((word(t, 9) - word(n, 9)) * 2),
            c.tables.atan,
          ),
        );
        pending = 1;
      }
    } else if (has(4) || has(1)) {
      releaseStagedCreatureAction(w, index, c);
      t[46] = b(t, 46) | 4;
      const p = w.ecology.plants[r.index];
      if (p?.native === t) p.plantFlags = t[46]!;
      reference(n, 85, r);
      retain();
      start(w, index, c);
      follow(n, at(t));
      n[96] = b(n, 96) | 64;
      pending = 1;
    } else if (component[0] === 0) {
      const owner = b(n, 24);
      let ability = owner === 4 ? b(n, 118) > 90 : !!(b(n, 97) & 4);
      if (owner < 4 && !ability) {
        const raw = w.players?.[owner]?.raw;
        if (!raw || raw.length !== 1805)
          throw Error("Actual owner research1805 record required");
        ability = raw[0x6c7 + ((b(n, 122) << 24) >> 24)] >= 1;
      }
      if (!ability) out.accepted = false;
      else retain();
    } else out.accepted = false;
  } else if (kind === 4) {
    if (has(1)) {
      let usable = true;
      if (b(t, 49) & 1) {
        if (!c.buildingMaximumHealth)
          throw Error("Admitted104D1E building health row required");
        const maximum = c.buildingMaximumHealth(w, r.index);
        if (!Number.isInteger(maximum) || maximum < -32768 || maximum > 32767)
          throw Error("Admitted building maximum health required");
        if (word(t, 43) >= maximum) usable = false;
      }
      if (usable) {
        if (word(n, 96) & 2 || (b(t, 45) === 2 && dword(t, 54) >>> 0 > 0)) {
          retain();
          reference(n, 85, r);
          follow(n, at(t), 191);
          n[22] = b(n, 22) & 127;
          reference(n, 77, r);
          start(w, index, c);
          pending = 2;
        } else {
          if (!c.findServiceBuilding)
            throw Error("Actual43130 service-building selector required");
          const selected = buildingIndex(
            c.findServiceBuilding(w, index),
            "43130",
          );
          if (selected === null) out.accepted = false;
          else {
            const service = target(w, { kind: 4, index: selected }, c);
            releaseStagedCreatureAction(w, index, c);
            retain();
            n[97] = b(n, 97) | 8;
            follow(n, at(service), 191);
            n[22] = b(n, 22) & 127;
            reference(n, 77, { kind: 4, index: selected });
            reference(n, 91, { kind: 4, index: selected });
            start(w, index, c);
            pending = 2;
          }
        }
      }
    }
  } else out.accepted = false;
  if (out.accepted) {
    if (pending === undefined) {
      const scratch = w.creatureCommandScratch?.[index];
      if (
        !scratch ||
        !Number.isInteger(scratch.value) ||
        scratch.value < 0 ||
        scratch.value > 255 ||
        !scratch.provenance.trim()
      )
        throw Error(
          "Actual serialized5D870 uninitialized pending95 caller byte/provenance required",
        );
      pending = scratch.value;
      out.sourceScratch95 = { ...scratch };
    }
    n[95] = pending;
    n[97] = b(n, 97) & 253;
  }
  return out;
}
/** Full caller-owned state, including serialized scratch/native additions, is
 * cloned once. Foreign services must use only their supplied staged world.*/
export function executeCreatureCommand<W extends CreatureCommandWorld>(
  world: W,
  index: number,
  command:
    | { type: "release" }
    | {
        type: "move";
        point: Point;
        callerOwner: number;
        selectedPlayer: number;
        selectedPanelRefresh: boolean;
      }
    | { type: "target"; target: CreatureCommandReference }
    | {
        type: "interact";
        target: CreatureCommandReference | null;
        force: boolean;
      },
  c: CreatureCommandContext<W>,
): CreatureCommandReceipt {
  const staged = structuredClone(world);
  restoreCreatureCommandAliases(staged);
  const out =
    command.type === "release"
      ? releaseStagedCreatureAction(staged, index, c)
      : command.type === "move"
        ? executeStagedCreatureMove(staged, index, command.point, c, command)
        : command.type === "target"
          ? targetStagedCreature(staged, index, command.target, c)
          : interactStagedCreature(
              staged,
              index,
              command.target,
              command.force,
              c,
            );
  Object.assign(world, staged);
  return out;
}
/** JSON does not encode shared array identity. Rebind only equal preserved
 * numeric images inside an isolated load/transaction; never discard a mismatch. */
export function restoreCreatureCommandAliases<W extends CreatureCommandWorld>(
  w: W,
): void {
  for (const mule of w.ecology.mules) {
    const native = w.creatureNative[mule.index];
    if (
      !native ||
      native.length !== 124 ||
      mule.native.length !== 124 ||
      mule.native.some((value, at) => value !== native[at])
    )
      throw Error("Creature command native pool and ecology mirror differ");
    mule.native = native;
  }
}

/** Wrap source-like pointers around foreign services without replacing the
 * records themselves. Retained bindings are re-read only through pure6D390. */
function stable<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  c: CreatureCommandContext<W>,
  run: (c: CreatureCommandContext<W>) => CreatureCommandReceipt,
) {
  const records = w.creatureNative,
    n = actor(w, index),
    playerRows = w.players?.map((p) => p.raw),
    held = new Map<
      string,
      { ref: CreatureCommandReference; native: N | null }
    >();
  const guarded: CreatureCommandContext<W> = {
    ...c,
    ...(c.resolve
      ? {
          resolve: (s: W, ref: CreatureCommandReference) => {
            const native = c.resolve!(s, ref),
              key = `${ref.kind}:${ref.index}`,
              old = held.get(key);
            if (old && old.native !== native)
              throw Error("Creature command service replaced retained target");
            held.set(key, { ref: { ...ref }, native });
            return native;
          },
        }
      : {}),
  };
  const out = run(guarded);
  if (
    w.creatureNative !== records ||
    actor(w, index) !== n ||
    playerRows?.some((raw, i) => w.players?.[i]?.raw !== raw)
  )
    throw Error(
      "Creature command service replaced retained native/player roots",
    );
  for (const { ref, native } of held.values())
    if (c.resolve!(w, ref) !== native)
      throw Error("Creature command service replaced retained target");
  return out;
}
export function releaseStagedCreatureAction<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  c: CreatureCommandContext<W>,
) {
  return stable(w, index, c, (g) =>
    releaseStagedCreatureActionBody(w, index, g),
  );
}
export function moveStagedCreature<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  p: Point,
  c: CreatureCommandContext<W>,
  panelRefresh = false,
) {
  return stable(w, index, c, (g) =>
    moveStagedCreatureBody(w, index, p, g, panelRefresh),
  );
}
export function executeStagedCreatureMove<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  p: Point,
  c: CreatureCommandContext<W>,
  q: {
    callerOwner: number;
    selectedPlayer: number;
    selectedPanelRefresh: boolean;
  },
) {
  return stable(w, index, c, (g) =>
    executeStagedCreatureMoveBody(w, index, p, g, q),
  );
}
export function interactStagedCreature<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  r: CreatureCommandReference | null,
  force: boolean,
  c: CreatureCommandContext<W>,
) {
  return stable(w, index, c, (g) =>
    interactStagedCreatureBody(w, index, r, force, g),
  );
}
export function targetStagedCreature<W extends CreatureCommandWorld>(
  w: W,
  index: number,
  r: CreatureCommandReference,
  c: CreatureCommandContext<W>,
) {
  return stable(w, index, c, (g) => targetStagedCreatureBody(w, index, r, g));
}

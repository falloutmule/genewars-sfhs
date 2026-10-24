/** Human20AE0/21700 input admission and packets7/8/10. No AI quotas,
 * automatic category fill, charge or replacement blueprint deletion. */
import {
  aiByte as byte,
  aiDword as dword,
  aiSByte as signedByte,
  aiSWord as signedWord,
  aiWord as word,
  aiInteger,
} from "./strategic-ai-state";
import type { SpecialistNative } from "./specialist-native";

export interface HumanRosterLink {
  player: number;
  index: number;
}
export interface HumanRosterState {
  players: number[][];
  specialists: {
    native: SpecialistNative;
    blueprint: HumanRosterLink | null;
  }[];
  buildings: SpecialistNative[];
  missionPrefix: number[];
}
export type HumanRosterCommand =
  | { type: "roster-select"; blueprintIndex: number }
  | { type: "roster-deselect"; blueprintIndex: number }
  | { type: "roster-target"; point: [number, number] }
  | {
      type: "roster-deploy";
      deployment: 0 | 1;
      associatedBuilding: number | null;
    };
export interface HumanSpecialistRequest {
  routine: 0x4fd30;
  player: number;
  slot: number;
  blueprint: number;
}
export interface HumanLandingRequest {
  routine: 0x80830;
  player: number;
  deployment: 1;
  associatedBuilding: number | null;
}
export interface HumanRosterServices {
  createSpecialist?(
    s: HumanRosterState,
    request: HumanSpecialistRequest,
  ): HumanSpecialistRequest;
  createLanding?(s: HumanRosterState, request: HumanLandingRequest): boolean;
  /** A null logical binding is unknown, not evidence of a null C0 pointer.
   * Only needed when80360 reaches an unestablished retained slot. */
  inactiveBlueprint?(s: HumanRosterState, slot: number): HumanRosterLink | null;
  /** Projection only:80360 clears C4/activity, retains C0/BP and list tail. */
  deselected?(s: HumanRosterState, slot: number, blueprint: number): void;
}
export interface HumanRosterReceipt {
  packet: 7 | 8 | 9 | 10;
  owner: number;
  created: number | null;
  removed: number[];
  landingRequested: boolean;
  landingCreated: boolean | null;
}
export interface HumanInitialRosterContext {
  flags: number;
  /** Logical identities of source11697C at2BDE3/2BDEB. */
  module: "campaign185DEF" | "network1863B8" | "other";
  /** manager+C8 is the current child pointer, not a permanent counter. */
  currentPanelEmpty: boolean;
}
/**2BBE0's one-time module setup, AFTER7D090→72AD0. Call at module entry;
 * this predicate is not permission to reopen an unassociated panel in play. */
export function initialHumanRosterPanel(
  s: HumanRosterState,
  owner: number,
  c: HumanInitialRosterContext,
): { open: boolean; reason: string | null } {
  const raw = player(s, owner);
  integer(c.flags, 0, 255, "initial flags");
  const reason = !c.currentPanelEmpty
    ? "A child panel is retained"
    : c.module === "other"
      ? "Initial recruitment module is unavailable"
      : dword(s.missionPrefix, 0x1ec2) !== 0
        ? "Mission uses its special recruitment marker"
        : c.flags & 0x20 && signedByte(raw, 0x6e7) < 4
          ? "Early campaign uses automatic deployment"
          : null;
  return { open: reason === null, reason };
}
function integer(
  value: number,
  low: number,
  high: number,
  label: string,
): void {
  if (!aiInteger(value, low, high))
    throw Error("Invalid human roster " + label);
}
function player(s: HumanRosterState, owner: number): number[] {
  integer(owner, 0, 3, "owner");
  const raw = s.players[owner];
  if (
    s.players.length !== 4 ||
    s.specialists.length !== 20 ||
    s.buildings.length !== 256 ||
    !raw ||
    raw.length !== 1805 ||
    byte(raw, 1) !== owner
  )
    throw Error("Actual human roster player/native pools required");
  return raw;
}
function blueprintOffset(index: number): number {
  integer(index, 0, 31, "blueprint index");
  return 0x16 + index * 36;
}
/**21700(category,rank): four signed-skill leaders, earlier index wins ties.
 * Style is not a filter. Both low flag bits must be clear; health is signed. */
export function chooseHumanBlueprints(
  s: HumanRosterState,
  owner: number,
  category: number,
): (number | null)[] {
  integer(category, 0, 3, "category");
  const raw = player(s, owner),
    candidates: number[] = [];
  for (let i = 0; i < 32; i++) {
    const at = blueprintOffset(i);
    if (
      byte(raw, at) === 0 ||
      signedByte(raw, at + 22) !== category ||
      signedByte(raw, at + 26) <= 0 ||
      dword(raw, at + 32) & 3
    )
      continue;
    let position = 0;
    while (
      position < candidates.length &&
      signedByte(raw, blueprintOffset(candidates[position]) + 23) >=
        signedByte(raw, at + 23)
    )
      position++;
    candidates.splice(position, 0, i);
    candidates.length = Math.min(4, candidates.length);
  }
  return Array.from({ length: 4 }, (_, i) => candidates[i] ?? null);
}
function pending(s: HumanRosterState, owner: number) {
  const raw = player(s, owner),
    count = signedByte(raw, 3);
  integer(count, 0, 5, "stored actor count");
  return Array.from({ length: count }, (_, i) => {
    const slot = signedByte(raw, i + 4);
    integer(slot, owner * 5, owner * 5 + 4, "stored actor identity");
    const entry = s.specialists[slot],
      link = entry.blueprint;
    if (!link || link.player !== owner)
      throw Error("Actual human roster retained C0 binding required");
    const at = blueprintOffset(link.index),
      flags = dword(raw, at + 32);
    const waiting = !!(flags & 1) && !(flags & 2),
      landing = !!(byte(entry.native, 113) & 4);
    return {
      slot,
      blueprintIndex: link.index,
      waiting,
      landing,
      canDeselect: waiting && !landing,
      reason: landing
        ? "Awaiting landing"
        : !waiting
          ? "Already deployed"
          : null,
    };
  });
}
/**30100 case4→2CB02 routes selector0 to21A10, selector5 to20880,
 * every other selector to27430. Allied access requires both alliance bits. */
export function humanRecruitmentBuildingRoute(
  s: HumanRosterState,
  owner: number,
  slot: number,
): string | null {
  integer(slot, 0, 255, "associated building");
  const raw = player(s, owner),
    native = s.buildings[slot],
    targetOwner = byte(native, 24);
  if (!byte(native, 6)) return "Building is inactive";
  if (byte(native, 45) !== 5)
    return "Building does not open the recruitment panel";
  if (
    targetOwner !== owner &&
    (targetOwner > 3 ||
      !(byte(raw, 0x6e5) & (1 << targetOwner)) ||
      !(byte(s.players[targetOwner], 0x6e5) & (1 << owner)))
  )
    return "Building is not owned or mutually allied";
  return null;
}
function permittedBuilding(
  s: HumanRosterState,
  owner: number,
  slot: number,
): string | null {
  const route = humanRecruitmentBuildingRoute(s, owner, slot);
  if (route) return route;
  const native = s.buildings[slot];
  const flags = word(native, 49);
  if (!(flags & 4)) return "Building has no recruitment landing";
  if (!(flags & 1)) return "Building is incomplete";
  if (flags & 0x40) return "Building landing is unavailable";
  if (flags & 0x100) return "Building landing is occupied";
  return null;
}
export interface HumanRosterCard {
  category: number;
  rank: number;
  blueprintIndex: number | null;
  name: string;
  style: number | null;
  skill: number | null;
  health: number | null;
  canSelect: boolean;
  reason: string | null;
}
/** Read-only20AE0 panel projection. Packet10zero's real cancellation is
 * exposed separately; it has no20AE0 mouse control and no landing-kind gate. */
export function humanRosterView(
  s: HumanRosterState,
  owner: number,
  associatedBuilding: number | null = null,
) {
  const raw = player(s, owner),
    human = byte(raw, 2) === 0,
    roster = pending(s, owner),
    count = signedByte(raw, 3),
    cards: HumanRosterCard[] = [],
    mask = byte(s.missionPrefix, 0x1ebd);
  for (let category = 0; category < 4; category++) {
    const choices = chooseHumanBlueprints(s, owner, category);
    for (let rank = 0; rank < 4; rank++) {
      const blueprintIndex = choices[rank],
        at = blueprintIndex === null ? null : blueprintOffset(blueprintIndex);
      let name = "";
      if (at !== null)
        for (let c = 0; c < 20 && byte(raw, at + c) !== 0; c++)
          name += String.fromCharCode(byte(raw, at + c));
      const reason = !human
        ? "Human player required"
        : !(mask & (1 << category))
          ? "Role unavailable in this mission"
          : count >= 5
            ? "Roster is full"
            : at === null
              ? "No eligible blueprint"
              : null;
      cards.push({
        category,
        rank,
        blueprintIndex,
        name,
        style: at === null ? null : signedByte(raw, at + 21),
        skill: at === null ? null : signedByte(raw, at + 23),
        health: at === null ? null : signedByte(raw, at + 26),
        canSelect: reason === null,
        reason,
      });
    }
  }
  const buildingChoices: {
    slot: number;
    owner: number;
    point: [number, number];
    canDeploy: boolean;
    reason: string | null;
  }[] = [];
  for (let slot = 0; slot < 256; slot++) {
    //Inactive slots need no unknown owner/flags reads for the view.
    const n = s.buildings[slot];
    if (byte(n, 6) && humanRecruitmentBuildingRoute(s, owner, slot) === null) {
      const reason = permittedBuilding(s, owner, slot);
      buildingChoices.push({
        slot,
        owner: byte(n, 24),
        point: [signedWord(n, 7), signedWord(n, 9)],
        canDeploy: reason === null,
        reason,
      });
    }
  }
  const deployReason = !human
    ? "Human player required"
    : associatedBuilding !== null &&
        permittedBuilding(s, owner, associatedBuilding) !== null
      ? permittedBuilding(s, owner, associatedBuilding)
      : byte(raw, 0x498) !== 0
        ? "A landing reference is retained"
        : !roster.some((r) => r.waiting)
          ? "No waiting specialists"
          : null;
  const canCancelWaiting =
    human &&
    s.specialists
      .slice(owner * 5, owner * 5 + 5)
      .some((e) => byte(e.native, 6) !== 0 && !(word(e.native, 112) & 0x401));
  return {
    owner,
    associatedBuilding,
    target: [signedWord(raw, 9), signedWord(raw, 11)] as [number, number],
    cards,
    pending: roster,
    buildingChoices,
    canDeploy: deployReason === null,
    deployReason,
    canCancelWaiting,
  };
}
export function admitHumanRosterCommand(
  s: HumanRosterState,
  owner: number,
  command: HumanRosterCommand,
): { accepted: boolean; reason: string | null } {
  const view = humanRosterView(
    s,
    owner,
    command.type === "roster-deploy" ? command.associatedBuilding : null,
  );
  if (byte(s.players[owner], 2) !== 0)
    return { accepted: false, reason: "Human player required" };
  if (command.type === "roster-target") {
    if (
      !Array.isArray(command.point) ||
      command.point.length !== 2 ||
      command.point.some((v) => !aiInteger(v, -32768, 32767))
    )
      throw Error("Invalid human roster target point");
    return { accepted: true, reason: null };
  }
  if (command.type === "roster-select") {
    blueprintOffset(command.blueprintIndex);
    const card = view.cards.find(
      (c) => c.blueprintIndex === command.blueprintIndex,
    );
    return {
      accepted: !!card?.canSelect,
      reason:
        card?.reason ??
        (card ? null : "Blueprint is outside the four human candidates"),
    };
  }
  if (command.type === "roster-deselect") {
    blueprintOffset(command.blueprintIndex);
    const entry = view.pending.find(
      (r) => r.blueprintIndex === command.blueprintIndex,
    );
    return {
      accepted: !!entry?.canDeselect,
      reason:
        entry?.reason ?? (entry ? null : "Blueprint is not in the roster"),
    };
  }
  integer(command.deployment, 0, 1, "deployment");
  return command.deployment
    ? { accepted: view.canDeploy, reason: view.deployReason }
    : { accepted: true, reason: null };
}
/**81360→80360 searches all retained C0 bindings, including inactive records.
 * It does not unlink, cancel work, delete the BP name, or clear the list tail. */
export function unselectHumanBlueprint(
  s: HumanRosterState,
  owner: number,
  index: number,
  services: HumanRosterServices,
): number | null {
  const raw = player(s, owner),
    at = blueprintOffset(index);
  for (let slot = owner * 5; slot < owner * 5 + 5; slot++) {
    const entry = s.specialists[slot];
    let link = entry.blueprint;
    if (!link) {
      if (!services.inactiveBlueprint)
        throw Error(
          "Human80360 requires actual retained C0 binding at slot " + slot,
        );
      link = services.inactiveBlueprint(s, slot);
    }
    if (link?.player !== owner || link.index !== index) continue;
    const n = entry.native,
      count = signedByte(raw, 3);
    integer(count, 0, 5, "stored actor count");
    raw[at + 32] = byte(raw, at + 32) & 252;
    let found = 0;
    while (found < count && signedByte(raw, 4 + found) !== signedWord(n, 15))
      found++;
    raw[3] = (byte(raw, 3) - 1) & 255;
    const after = signedByte(raw, 3);
    for (let i = found; i < after; i++) raw[4 + i] = byte(raw, 5 + i);
    n.fill(null, 196, 200);
    n[6] = 0;
    services.deselected?.(s, slot, index);
    if (
      s.specialists[slot] !== entry ||
      entry.native !== n ||
      s.players[owner] !== raw
    )
      throw Error(
        "Human80360 projection replaced retained native/player state",
      );
    return slot;
  }
  return null;
}
/** Exact numeric handlers, already isolated by caller. Admission is a distinct
 * source20AE0 concern. In particular10one calls80830 even with no pending actor. */
export function issueHumanRosterPacket(
  s: HumanRosterState,
  owner: number,
  command: HumanRosterCommand,
  services: HumanRosterServices,
): HumanRosterReceipt {
  const raw = player(s, owner),
    receipt: HumanRosterReceipt = {
      packet:
        command.type === "roster-select"
          ? 7
          : command.type === "roster-deselect"
            ? 8
            : command.type === "roster-target"
              ? 9
              : 10,
      owner,
      created: null,
      removed: [],
      landingRequested: false,
      landingCreated: null,
    };
  if (command.type === "roster-select") {
    const at = blueprintOffset(command.blueprintIndex);
    let slot = owner * 5;
    while (slot < owner * 5 + 5 && byte(s.specialists[slot].native, 6)) slot++;
    if (slot === owner * 5 + 5) return receipt;
    if (!services.createSpecialist)
      throw Error("Human81300 requires actual4FD30 constructor");
    const count = signedByte(raw, 3),
      n = s.specialists[slot].native;
    integer(count, 0, 4, "roster append slot");
    raw[at + 32] = byte(raw, at + 32) | 1;
    const request: HumanSpecialistRequest = {
        routine: 0x4fd30,
        player: owner,
        slot,
        blueprint: command.blueprintIndex,
      },
      out = services.createSpecialist(s, request),
      link = s.specialists[slot].blueprint;
    if (
      !out ||
      out.routine !== request.routine ||
      out.player !== owner ||
      out.slot !== slot ||
      out.blueprint !== request.blueprint ||
      s.players[owner] !== raw ||
      s.specialists[slot].native !== n ||
      byte(n, 6) !== 3 ||
      byte(n, 24) !== owner ||
      signedWord(n, 15) !== slot ||
      link?.player !== owner ||
      link.index !== request.blueprint
    )
      throw Error("Actual human4FD30 native/logical afterimage required");
    n[112] = byte(n, 112) & 254;
    raw[3] = (byte(raw, 3) + 1) & 255;
    raw[4 + count] = byte(n, 15);
    receipt.created = slot;
  } else if (command.type === "roster-deselect") {
    const removed = unselectHumanBlueprint(
      s,
      owner,
      command.blueprintIndex,
      services,
    );
    if (removed !== null) receipt.removed.push(removed);
  } else if (command.type === "roster-target") {
    if (
      !Array.isArray(command.point) ||
      command.point.length !== 2 ||
      command.point.some((v) => !aiInteger(v, -32768, 32767))
    )
      throw Error("Invalid human81370 signed point");
    raw[9] = command.point[0] & 255;
    raw[10] = (command.point[0] >> 8) & 255;
    raw[11] = command.point[1] & 255;
    raw[12] = (command.point[1] >> 8) & 255;
  } else {
    integer(command.deployment, 0, 1, "deployment");
    if (command.associatedBuilding !== null)
      integer(command.associatedBuilding, 0, 255, "associated building");
    if (command.deployment) {
      if (!services.createLanding)
        throw Error("Human81390 requires actual80830 landing");
      receipt.landingRequested = true;
      receipt.landingCreated = services.createLanding(s, {
        routine: 0x80830,
        player: owner,
        deployment: 1,
        associatedBuilding: command.associatedBuilding,
      });
      if (
        typeof receipt.landingCreated !== "boolean" ||
        s.players[owner] !== raw
      )
        throw Error("Actual human80830 result required");
    } else
      for (let slot = owner * 5; slot < owner * 5 + 5; slot++) {
        const entry = s.specialists[slot];
        if (!byte(entry.native, 6) || word(entry.native, 112) & 0x401) continue;
        if (!entry.blueprint || entry.blueprint.player !== owner)
          throw Error("Human81390 requires actual active C0 binding");
        const removed = unselectHumanBlueprint(
          s,
          owner,
          entry.blueprint.index,
          services,
        );
        if (removed !== null) receipt.removed.push(removed);
      }
  }
  return receipt;
}

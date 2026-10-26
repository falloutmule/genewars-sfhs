/**37540/37770/36C10/3E270/3E8F0 source numeric initialization and group binding. */
import {
  aiByte,
  aiDword,
  aiInteger,
  aiPoint,
  aiPutDword,
  aiPutWord,
  aiSByte,
  aiSWord,
  aiWord,
  aiDistance,
  type StrategicAIContext,
  type StrategicAIEvent,
  type StrategicAIState,
} from "./strategic-ai-state";

export const AI_GROUP_BASE = 0x387;
export const AI_GROUP_BYTES = 38;
/** Admitted variant's byte1079DA, read by3E270 for reward kind6, is0.
 * The original six-entry ordinary-group profile ends immediately before it.
 * Keep this explicit source constant separate from that saved pack contract. */
export const AI_REWARD_GROUP_LIMIT = 0;
export function strategicGroupOffset(index: number): number {
  if (!aiInteger(index, 0, 15))
    throw Error("Actual strategic group index0..15 required");
  return AI_GROUP_BASE + index * AI_GROUP_BYTES;
}
/**32CC0 only registers an already-active building. It does not create one. */
export function registerStrategicBuilding(
  s: StrategicAIState,
  player: number,
  localSlot: number,
): void {
  const ai = s.records[player],
    slot = player * 64 + localSlot,
    b = s.buildings[slot];
  if (
    !aiInteger(localSlot, 0, 63) ||
    !b ||
    !aiByte(b, 6) ||
    aiSWord(b, 15) !== slot
  )
    throw Error("Actual active strategic building identity required");
  if (aiByte(b, 45) === 3) {
    if (ai[0x5e8] === 64) ai[0x5e8] = aiSWord(b, 15) % 64 & 255;
    else if (ai[0x5ee] === 64) ai[0x5ee] = aiSWord(b, 15) % 64 & 255;
  }
  ai[0x55 + aiSWord(b, 15) - player * 64] = 1;
}
/** Exact37540 order, including selected knowledge copied from player0 and the
 * unchanged low11 fractional bits being cleared in25 signed research dwords. */
export function initializeStrategicBuildings(
  s: StrategicAIState,
  player: number,
): void {
  const ai = s.records[player];
  if (!(ai[0x6ae] & 1)) {
    for (let i = 0; i < 16; i++) {
      const at = strategicGroupOffset(i);
      ai[at + 8] = player;
      ai[at + 11] = i;
      aiPutWord(ai, at + 4, 65535);
      ai[at + 10] = 0;
      ai[at + 12] = 255;
    }
    for (let i = 0; i < 64; i++)
      if (aiByte(s.buildings[player * 64 + i], 6))
        registerStrategicBuilding(s, player, i);
    const from = s.players[0],
      to = s.players[player];
    for (let i = 0; i < 25; i++) {
      aiPutDword(to, 0x61a + i * 4, (aiDword(from, 0x61a + i * 4) >> 11) << 11);
      to[0x6c7 + i] = from[0x6c7 + i];
      to[0x6ae + i] = from[0x6ae + i];
    }
    for (let i = 0; i < 12; i++)
      aiPutDword(to, 0x67e + i * 4, aiDword(from, 0x67e + i * 4));
  }
  ai[0x6ae] |= 1;
}
export interface StrategicGroupCreation {
  index: number;
  point: [number, number];
  kind: number;
  parameter: number;
  zone: number;
  /** The known low6 source flag bits. null uses the source default1. */
  flags: number | null;
}
/**3E270 preserves destination flags6/7 and all unassigned bytes, including the
 * fourth byte in each target record. No RNG and no creature orders are issued. */
export function createStrategicGroup(
  s: StrategicAIState,
  player: number,
  request: StrategicGroupCreation,
  c: Pick<StrategicAIContext, "groupLimits">,
): void {
  const ai = s.records[player],
    at = strategicGroupOffset(request.index),
    r = request;
  if (
    !aiInteger(r.kind, 0, 6) ||
    !aiInteger(r.parameter, 0, 255) ||
    !aiInteger(r.zone, -1, 63) ||
    r.point.length !== 2 ||
    r.point.some((v) => !aiInteger(v, -32768, 32767)) ||
    (r.flags !== null && !aiInteger(r.flags, 0, 255))
  )
    throw Error("Actual strategic group constructor fields required");
  aiPutWord(ai, at + 4, 0);
  aiPutWord(ai, at, r.point[0]);
  aiPutWord(ai, at + 2, r.point[1]);
  ai[at + 10] = r.parameter;
  ai[at + 9] = r.kind;
  ai[at + 12] = r.zone & 255;
  ai[at + 13] = (ai[at + 13] & 0xc0) | (r.flags === null ? 1 : r.flags & 63);
  for (let i = 0; i < 6; i++) {
    aiPutWord(ai, at + 14 + i * 4, 65535);
    ai[at + 16 + i * 4] = 0;
  }
  let limit = r.kind === 6 ? AI_REWARD_GROUP_LIMIT : c.groupLimits[r.kind];
  if (r.kind === 5) {
    if (r.zone < 0 || r.zone >= s.missionPrefix[0x34b8])
      throw Error("Actual strategic zone binding required for group5");
    //Signed664 and signed quota/256, with truncation toward zero then BX wrap.
    limit = ((limit + aiSByte(s.records[ai[at + 8]], 0x664)) << 16) >> 16;
    limit =
      ((limit +
        Math.trunc(
          (aiDword(s.missionPrefix, 0x2ff8 + r.zone * 19 + 14) | 0) / 256,
        )) <<
        16) >>
      16;
  }
  aiPutWord(ai, at + 6, Math.max(1, limit));
}
const matchesGroup = (
  s: StrategicAIState,
  player: number,
  at: number,
  creature: number,
) =>
  aiByte(s.creatures[creature], 24) === aiSByte(s.records[player], at + 8) &&
  aiSByte(s.creatureControl, creature * 2 + 1) === s.records[player][at + 11];
/**3E8F0 propagates the new group point to real live members. Invalid members
 * are unbound and decrement the existing count; indexwords remain retained. */
export function moveStrategicGroup(
  s: StrategicAIState,
  player: number,
  index: number,
  point: [number, number],
  c: StrategicAIContext,
): void {
  const ai = s.records[player],
    at = strategicGroupOffset(index);
  aiPutWord(ai, at, point[0]);
  aiPutWord(ai, at + 2, point[1]);
  for (let i = 0; i < 300; i++)
    if (matchesGroup(s, player, at, i)) {
      const n = s.creatures[i];
      if (aiByte(n, 6) && !c.creatureProtected(s, i)) {
        aiPutDword(n, 114, aiDword(ai, at));
        n[96] = aiByte(n, 96) | 8;
        aiPutDword(n, 110, aiDword(ai, at));
        n[97] = aiByte(n, 97) | 128;
      } else if (aiSByte(s.creatureControl, i * 2 + 1) === ai[at + 11]) {
        aiPutWord(ai, at + 4, aiWord(ai, at + 4) - 1);
        s.creatureControl[i * 2 + 1] = 255;
        s.creatureControl[i * 2] = aiByte(s.creatureControl, i * 2) & 0xfb;
      }
    }
}
/**36C10: strict ascending nearest ties; Genepod3 preferred, then other building,
 * then the source player center or start target. The existing-group fallback
 * intentionally tests the AI OWNER's building count, as the literal does. */
export function refreshStrategicPlayerGroup(
  s: StrategicAIState,
  player: number,
  targetPlayer: number,
  c: StrategicAIContext,
): void {
  if (!aiInteger(targetPlayer, 0, 3))
    throw Error("Actual strategic target player required");
  const ai = s.records[player],
    at = strategicGroupOffset(targetPlayer),
    center = aiPoint(s.players[targetPlayer], 0x5fc);
  let nearestPod = 64,
    firstPod = 64,
    nearestOther = 64,
    podDistance = 0x80000000,
    otherDistance = 0x80000000;
  for (let i = 0; i < 64; i++) {
    const b = s.buildings[targetPlayer * 64 + i];
    if (!aiByte(b, 6)) continue;
    const distance = aiDistance(aiPoint(b, 7), center);
    if (aiByte(b, 45) === 3) {
      if (firstPod === 64) firstPod = i;
      if (distance < podDistance) {
        nearestPod = i;
        podDistance = distance;
      }
    } else if (distance < otherDistance) {
      nearestOther = i;
      otherDistance = distance;
    }
  }
  const existing = aiSWord(ai, at + 4) >= 0,
    building =
      nearestPod !== 64
        ? nearestPod
        : firstPod !== 64
          ? firstPod
          : nearestOther,
    point =
      building !== 64
        ? aiPoint(s.buildings[targetPlayer * 64 + building], 7)
        : aiSByte(s.players[existing ? player : targetPlayer], 0x4a2) > 0
          ? center
          : aiPoint(s.players[targetPlayer], 9);
  if (existing) moveStrategicGroup(s, player, targetPlayer, point, c);
  else
    createStrategicGroup(
      s,
      player,
      {
        index: targetPlayer,
        point,
        kind: player === targetPlayer ? 2 : 0,
        parameter: 1,
        zone: -1,
        flags: player === targetPlayer ? 3 : 1,
      },
      c,
    );
}
/**37770 marks only actual owned active nonprotected creatures, then binds the
 * owner's group. The retained low bits use the source1C mask before22. */
export function initializeStrategicCreatures(
  s: StrategicAIState,
  player: number,
  c: StrategicAIContext,
): void {
  const ai = s.records[player];
  if (ai[0x6ae] & 4) return;
  for (let i = 0; i < 300; i++) {
    const n = s.creatures[i];
    if (aiByte(n, 6) && aiByte(n, 24) === player && !c.creatureProtected(s, i))
      s.creatureControl[i * 2] =
        (aiByte(s.creatureControl, i * 2) & 0x1c) | 0x22;
  }
  refreshStrategicPlayerGroup(s, player, player, c);
  ai[0x6ae] |= 4;
}
export interface StrategicGroupStepReceipt {
  routine: 0x3c700;
  player: number;
  group: number;
}
export type StrategicGroupStep = (
  s: StrategicAIState,
  player: number,
  group: number,
) => StrategicGroupStepReceipt;
export function requireStrategicGroupStep(
  s: StrategicAIState,
  player: number,
  group: number,
  step?: StrategicGroupStep,
): void {
  if (!step)
    throw Error(
      `Strategic group3C700 kind${s.records[player][strategicGroupOffset(group) + 9]} service is not implemented`,
    );
  const ai = s.records[player],
    control = s.creatureControl,
    receipt = step(s, player, group);
  if (
    receipt?.routine !== 0x3c700 ||
    receipt.player !== player ||
    receipt.group !== group
  )
    throw Error("Actual strategic3C700 group receipt required");
  if (s.records[player] !== ai || s.creatureControl !== control)
    throw Error(
      "Strategic group services must preserve retained record identities",
    );
}
/**3BEB0 may call the same group twice. It re-reads after each callback and never
 * deduplicates these source scheduler calls. */
export function stepStrategicGroupCadence(
  s: StrategicAIState,
  player: number,
  c: StrategicAIContext,
  step: StrategicGroupStep | undefined,
  events: StrategicAIEvent[],
): void {
  if (c.frame & 15) return;
  const group = (c.frame & 255) >>> 4,
    ai = s.records[player];
  const call = (index: number) => {
    requireStrategicGroupStep(s, player, index, step);
    events.push({ routine: 0x3c700, player, kind: "group-step", index });
  };
  if (aiSWord(ai, strategicGroupOffset(group) + 4) >= 0) call(group);
  if (
    ai[strategicGroupOffset(group) + 13] & 64 &&
    group % 2 === 0 &&
    aiSWord(ai, strategicGroupOffset(player) + 4) >= 0
  )
    call(player);
  if (group % 8 === 0 && aiSWord(ai, AI_GROUP_BASE + 4) >= 0) call(0);
}

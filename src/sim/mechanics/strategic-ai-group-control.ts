/**Complete3C700 numeric group controller and its bounded target primitives. */
import {
  aiByte,
  aiDistance,
  aiDword,
  aiInteger,
  aiPoint,
  aiPutWord,
  aiSByte,
  aiSWord,
  aiWord,
  cloneStrategicAIState,
  strategicBlueprint,
  validateStrategicAIContext,
  validateStrategicAIState,
  type StrategicAIState,
} from "./strategic-ai-state";
import {
  refreshStrategicPlayerGroup,
  strategicGroupOffset,
  type StrategicGroupStepReceipt,
} from "./strategic-ai-groups";
import { retireStrategicGroup } from "./strategic-ai-orders";
import {
  addStrategicCreatureToGroup,
  scatterStrategicCreature,
  strategicGroupAcceptsCreature,
  type StrategicCreatureContext,
} from "./strategic-ai-creatures";
import type { StrategicAIServices } from "./strategic-ai";

export interface StrategicGroupContext extends StrategicCreatureContext {
  specialistProtected(state: StrategicAIState, index: number): boolean;
  effects?(state: StrategicAIState): readonly (readonly (number | null)[])[];
  releaseAction?(
    state: StrategicAIState,
    creature: number,
  ): { routine: 0x5cc60; creature: number };
  interact?(
    state: StrategicAIState,
    request: {
      routine: 0x5b580;
      creature: number;
      target: { family: 1 | 3 | 4; index: number };
      force: false;
    },
  ): {
    routine: 0x5b580;
    creature: number;
    target: { family: 1 | 3 | 4; index: number };
    force: false;
  };
}
const unavailable = (
  s: StrategicAIState,
  i: number,
  c: StrategicGroupContext,
) =>
  [15, 18].includes(aiByte(s.creatures[i], 94)) ||
  c.creatureProtected(s, i) ||
  !!(aiByte(s.creatures[i], 97) & 1);
const special = (n: readonly (number | null)[]) =>
  aiByte(n, 94) === 1 || (aiByte(n, 94) >= 21 && aiByte(n, 94) < 24);
function member(
  s: StrategicAIState,
  ai: number[],
  at: number,
  i: number,
): boolean {
  return (
    aiByte(s.creatures[i], 24) === aiSByte(ai, at + 8) &&
    aiSByte(s.creatureControl, i * 2 + 1) === ai[at + 11]
  );
}
function release(
  s: StrategicAIState,
  i: number,
  c: StrategicGroupContext,
): void {
  if (!c.releaseAction)
    throw Error("Strategic creature5CC60 action release is not implemented");
  const n = s.creatures[i],
    r = c.releaseAction(s, i);
  if (r?.routine !== 0x5cc60 || r.creature !== i || s.creatures[i] !== n)
    throw Error("Actual strategic5CC60 release receipt required");
}
function move(
  s: StrategicAIState,
  owner: number,
  i: number,
  point: [number, number],
  c: StrategicGroupContext,
): void {
  if (!c.moveOrder)
    throw Error("Strategic creature81C60 move command is not implemented");
  const n = s.creatures[i],
    r = c.moveOrder(s, {
      routine: 0x81c60,
      player: s.records[owner][4],
      creature: i,
      point,
    });
  if (
    r?.routine !== 0x81c60 ||
    r.player !== s.records[owner][4] ||
    r.creature !== i ||
    !Array.isArray(r.point) ||
    r.point[0] !== point[0] ||
    r.point[1] !== point[1] ||
    !["installed", "ignored"].includes(r.outcome) ||
    s.creatures[i] !== n
  )
    throw Error("Actual strategic81C60 group move receipt required");
}
/**3E100: least assigned target with count<3, strict first ties. */
export function selectStrategicGroupTarget(
  s: StrategicAIState,
  player: number,
  group: number,
): number {
  const ai = s.records[player],
    at = strategicGroupOffset(group);
  let best = 6,
    count = 300;
  for (let i = 0; i < 6; i++) {
    const p = at + 14 + i * 4;
    if (aiSWord(ai, p) >= 0 && ai[p + 2] < 3 && ai[p + 2] < count) {
      best = i;
      count = ai[p + 2];
    }
  }
  return best;
}
/**3EA40: real5B580 interaction first, then target participation byte increment.
 * Unknown target categories still increment in the source without a call. */
export function interactStrategicGroupTarget(
  s: StrategicAIState,
  player: number,
  group: number,
  target: number,
  creature: number,
  c: StrategicGroupContext,
): void {
  const ai = s.records[player],
    at = strategicGroupOffset(group) + 14 + target * 4,
    index = aiSWord(ai, at),
    n = s.creatures[creature];
  if (
    !aiInteger(target, 0, 5) ||
    index < 0 ||
    !aiByte(n, 6) ||
    c.creatureProtected(s, creature)
  )
    return;
  const kind = ai[at + 3],
    family = kind === 0 ? 1 : kind === 1 ? 4 : kind === 2 ? 3 : null;
  if (family !== null) {
    const capacity = family === 1 ? 300 : family === 4 ? 256 : 20;
    if (index >= capacity)
      throw Error("Strategic interaction target outside native pool");
    if (!c.interact)
      throw Error("Strategic creature5B580 interaction is not implemented");
    const r = c.interact(s, {
      routine: 0x5b580,
      creature,
      target: { family, index },
      force: false,
    });
    if (
      r?.routine !== 0x5b580 ||
      r.creature !== creature ||
      r.target?.family !== family ||
      r.target.index !== index ||
      r.force !== false ||
      s.creatures[creature] !== n
    )
      throw Error("Actual strategic5B580 interaction receipt required");
  }
  ai[at + 2] = (ai[at + 2] + 1) & 255;
}
/**3DBB0's three strict-swap passes are retained, including their tie ordering. */
export function strategicTargetCategoryOrder(
  s: StrategicAIState,
  player: number,
  group: number,
  adjustment: number,
): number[] {
  const ai = s.records[player],
    at = strategicGroupOffset(group),
    owner = aiSByte(ai, at + 8),
    base = s.records[owner][0x628],
    delta = (adjustment << 24) >> 24,
    aggression =
      delta >= 0 ? Math.min(100, base + delta) : Math.max(0, base + delta),
    first = Math.max(0, 75 - aggression),
    third = Math.max(0, aggression - 25),
    scores = [first, 100 - first - third, third],
    counts = [0, 0, 0];
  for (let i = 0; i < 6; i++) {
    const p = at + 14 + i * 4;
    if (aiSWord(ai, p) >= 0 && ai[p + 3] <= 2) counts[ai[p + 3]]++;
  }
  const rows = scores.map((score, type) => ({
    score: score - counts[type] * 20,
    type,
  }));
  for (let i = 0; i < 2; i++)
    for (let j = i + 1; j < 3; j++)
      if (rows[j].score < rows[i].score)
        [rows[i], rows[j]] = [rows[j], rows[i]];
  return rows.map((r) => r.type);
}
type Candidate = { index: number; distance: number };
/**3D500 complete ordered native-pool scan, signed distance scores and target
 * fill. Preserve the original closer-building insertion into creature scratch. */
export function discoverStrategicGroupTargets(
  s: StrategicAIState,
  player: number,
  group: number,
  adjustment: number,
  c: StrategicGroupContext,
): number {
  const ai = s.records[player],
    at = strategicGroupOffset(group),
    owner = aiSByte(ai, at + 8),
    defending = ai[at + 9] === 2;
  if (!aiInteger(owner, 0, 3))
    throw Error("Actual strategic group owner required");
  let count = 0;
  for (let i = 0; i < 6; i++) if (aiSWord(ai, at + 14 + i * 4) >= 0) count++;
  if (count === 6) return count;
  const buckets: Candidate[][] = Array.from({ length: 3 }, () =>
      Array.from({ length: 6 }, () => ({ index: -1, distance: 255 })),
    ),
    hostile = (targetOwner: number) =>
      (defending && targetOwner !== s.records[owner][4]) ||
      (targetOwner < c.activePlayerCount &&
        !!(s.records[owner][0x6af] & (1 << targetOwner))),
    point = aiPoint(ai, at),
    score = (n: readonly (number | null)[]) =>
      Math.floor(Math.sqrt(aiDistance(point, aiPoint(n, 7)))) >>> 8;
  const insert = (type: number, index: number, distance: number) => {
    const rows = buckets[type];
    for (let i = 0; i < 6; i++) {
      if (rows[i].index < 0) {
        rows[i] = { index, distance };
        return;
      }
      if (distance >= rows[i].distance) continue;
      for (let j = 5; j > i; j--) rows[j] = { ...rows[j - 1] };
      //Literal3D837 lacks the building scratch+18 destination displacement.
      buckets[type === 1 ? 0 : type][i] = { index, distance };
      return;
    }
  };
  for (let i = 0; i < 300; i++) {
    const n = s.creatures[i];
    if (!aiByte(n, 6) || c.creatureProtected(s, i) || !hostile(aiByte(n, 24)))
      continue;
    const distance = score(n);
    if (distance < 10) insert(0, aiSWord(n, 15), distance);
  }
  for (let ownerIndex = 0; ownerIndex < 4; ownerIndex++)
    for (let slot = 0; slot < 64; slot++) {
      const n = s.buildings[ownerIndex * 64 + slot];
      if (!aiByte(n, 6) || aiWord(n, 49) & 0x100 || !hostile(ownerIndex))
        continue;
      const distance = score(n);
      if (distance < 10) insert(1, aiSWord(n, 15), distance);
    }
  const specialistLimit =
    c.activePlayerCount > 0 &&
    s.records[owner][0x6af] & 1 &&
    !defending &&
    s.players[0][0x4a2] === 0
      ? 128
      : 10;
  for (let ownerIndex = 0; ownerIndex < 4; ownerIndex++)
    for (let slot = 0; slot < 5; slot++) {
      const index = ownerIndex * 5 + slot,
        n = s.specialists[index].native;
      if (
        !aiByte(n, 6) ||
        c.specialistProtected(s, index) ||
        !hostile(ownerIndex)
      )
        continue;
      let distance = score(n);
      if (strategicBlueprint(s, index)[21] === 3) {
        if (aiByte(n, 115) >= 201) continue;
        distance = ((distance + (aiByte(n, 115) >>> 2)) << 16) >> 16;
      }
      if (distance < specialistLimit) insert(2, aiSWord(n, 15), distance);
    }
  for (let i = 0; i < 6; i++) {
    const p = at + 14 + i * 4;
    if (aiSWord(ai, p) >= 0) continue;
    let chosen: Candidate | null = null,
      type = 0;
    for (const category of strategicTargetCategoryOrder(
      s,
      player,
      group,
      adjustment,
    )) {
      for (const candidate of buckets[category]) {
        if (candidate.index < 0) continue;
        let duplicate = false;
        for (let j = 0; j < 6; j++) {
          const q = at + 14 + j * 4;
          if (ai[q + 3] === category && aiSWord(ai, q) === candidate.index) {
            duplicate = true;
            break;
          }
        }
        if (!duplicate) {
          chosen = candidate;
          type = category;
          break;
        }
      }
      if (chosen) break;
    }
    if (chosen) {
      aiPutWord(ai, p, chosen.index);
      ai[p + 2] = 0;
      ai[p + 3] = type;
      count++;
    }
  }
  return count;
}
function unbind(
  s: StrategicAIState,
  player: number,
  group: number,
  creature: number,
): void {
  const ai = s.records[player],
    at = strategicGroupOffset(group),
    p = creature * 2;
  if (aiSByte(s.creatureControl, p + 1) !== ai[at + 11]) return;
  aiPutWord(ai, at + 4, aiWord(ai, at + 4) - 1);
  s.creatureControl[p + 1] = 255;
  s.creatureControl[p] = aiByte(s.creatureControl, p) & 0xfb;
}
/**3E050 intentionally maps the specialist index with /4,%4 before reading115.
 * A mapped slot20..23 reaches the actual adjacent building pool bytes. */
function specialistTargetGate(s: StrategicAIState, index: number): number {
  if (!aiInteger(index, 0, 19))
    throw Error("Strategic specialist target index outside native pool");
  const mapped = Math.trunc(index / 4) * 5 + (index % 4);
  if (mapped < 20) return aiByte(s.specialists[mapped].native, 115);
  const offset = (mapped - 20) * 200 + 115;
  return aiByte(s.buildings[Math.trunc(offset / 67)], offset % 67);
}
function prepareGroup(
  s: StrategicAIState,
  player: number,
  group: number,
  c: StrategicGroupContext,
): void {
  const ai = s.records[player],
    at = strategicGroupOffset(group);
  //The first two source cleanup passes use the creature pool for every target
  //category. Do not redirect these reads to the target's polymorphic family.
  for (let i = 0; i < 6; i++) {
    const p = at + 14 + i * 4,
      index = aiSWord(ai, p);
    if (index < 0) continue;
    if (index >= 300)
      throw Error("Strategic cleanup target outside creature pool");
    if (
      aiDistance(aiPoint(ai, at), aiPoint(s.creatures[index], 7)) > 0x640000
    ) {
      aiPutWord(ai, p, -1);
      ai[p + 2] = 0;
    }
  }
  for (let i = 0; i < 6; i++) {
    const p = at + 14 + i * 4,
      index = aiSWord(ai, p);
    if (index >= 0 && c.creatureProtected(s, index)) {
      aiPutWord(ai, p, -1);
      ai[p + 2] = 0;
    }
  }
  for (let i = 0; i < 6; i++) {
    const p = at + 14 + i * 4,
      index = aiSWord(ai, p);
    if (index >= 0 && ai[p + 3] === 2 && specialistTargetGate(s, index) > 223) {
      aiPutWord(ai, p, -1);
      ai[p + 2] = 0;
    }
  }
  aiPutWord(ai, at + 4, 0);
  for (let i = 0; i < 300; i++)
    if (member(s, ai, at, i)) aiPutWord(ai, at + 4, aiWord(ai, at + 4) + 1);
}
function combatGroup(
  s: StrategicAIState,
  player: number,
  group: number,
  c: StrategicGroupContext,
): void {
  const ai = s.records[player],
    at = strategicGroupOffset(group);
  if (!discoverStrategicGroupTargets(s, player, group, 0, c)) return;
  for (let i = 0; i < 300; i++) {
    const n = s.creatures[i];
    if (
      !member(s, ai, at, i) ||
      !aiByte(n, 6) ||
      c.creatureProtected(s, i) ||
      unavailable(s, i, c)
    )
      continue;
    const near = aiDistance(aiPoint(n, 7), aiPoint(ai, at)) < 0x900001;
    if (!near && aiByte(n, 120) !== 7) {
      release(s, i, c);
      const target = selectStrategicGroupTarget(s, player, group);
      if (target < 6)
        interactStrategicGroupTarget(s, player, group, target, i, c);
      else scatterStrategicCreature(s, player, group, i, 5, c);
    } else if (near && !special(n)) {
      const target = selectStrategicGroupTarget(s, player, group);
      if (target < 6)
        interactStrategicGroupTarget(s, player, group, target, i, c);
      else scatterStrategicCreature(s, player, group, i, 5, c);
    }
  }
}
function defendGroup(
  s: StrategicAIState,
  player: number,
  group: number,
  c: StrategicGroupContext,
): void {
  const ai = s.records[player],
    at = strategicGroupOffset(group),
    owner = aiSByte(ai, at + 8),
    targets = discoverStrategicGroupTargets(s, player, group, 50, c);
  let defenders = 0;
  for (let i = 0; i < 300; i++) {
    const n = s.creatures[i];
    if (
      aiByte(n, 6) &&
      !c.creatureProtected(s, i) &&
      aiByte(n, 24) === s.records[owner][4] &&
      aiByte(n, 95) === 2
    )
      defenders++;
  }
  ai[at + 13] = targets > 0 ? ai[at + 13] | 64 : ai[at + 13] & 0xbf;
  if (
    ai[at + 13] & 2 &&
    !(c.activePlayerCount > 0 && s.records[owner][0x6af] & 1) &&
    Math.trunc((100 - s.records[owner][0x628]) / 20) <= targets
  ) {
    refreshStrategicPlayerGroup(s, owner, 0, c);
    if (c.activePlayerCount > 0) s.records[owner][0x6af] |= 1;
  }
  for (let i = 0; i < 300; i++) {
    const n = s.creatures[i];
    if (
      !member(s, ai, at, i) ||
      !aiByte(n, 6) ||
      c.creatureProtected(s, i) ||
      aiWord(n, 96) & 2 ||
      unavailable(s, i, c)
    )
      continue;
    if (special(n)) {
      if (aiDistance(aiPoint(n, 7), aiPoint(ai, at)) > 0x640000) {
        release(s, i, c);
        scatterStrategicCreature(s, player, group, i, 7, c);
      }
    } else if (targets < 1) {
      if (aiByte(n, 95) === 0)
        scatterStrategicCreature(s, player, group, i, 7, c);
    } else {
      const target = selectStrategicGroupTarget(s, player, group),
        allowed = !(aiByte(n, 95) === 2 && defenders < 3);
      if (target < 6 && allowed)
        interactStrategicGroupTarget(s, player, group, target, i, c);
      else if (aiByte(n, 95) === 0)
        scatterStrategicCreature(s, player, group, i, 7, c);
    }
  }
}
function distributeGroup(
  s: StrategicAIState,
  player: number,
  group: number,
  kind: 3 | 4,
  c: StrategicGroupContext,
): void {
  const ai = s.records[player],
    at = strategicGroupOffset(group),
    owner = aiSByte(ai, at + 8),
    to = s.records[owner];
  for (
    let target = 0;
    target < 16 && aiSWord(ai, at + 4) > (kind === 3 ? 3 : 4);
    target++
  ) {
    const targetAt = strategicGroupOffset(target),
      targetCount = aiSWord(to, targetAt + 4);
    if (
      targetCount < 0 ||
      (owner === player && target === group) ||
      to[targetAt + 13] & 8
    )
      continue;
    let amount =
      kind === 3
        ? Math.min(to[0x65f] - targetCount, aiSWord(ai, at + 4) - 3)
        : aiSWord(ai, at + 4) - 4;
    for (let i = 0; i < 300 && amount > 0; i++) {
      const n = s.creatures[i];
      if (
        !member(s, ai, at, i) ||
        !aiByte(n, 6) ||
        c.creatureProtected(s, i) ||
        !strategicGroupAcceptsCreature(s, owner, target, i, c)
      )
        continue;
      unbind(s, player, group, i);
      addStrategicCreatureToGroup(s, owner, target, i, true, c);
      amount--;
    }
  }
}
function zoneGroup(
  s: StrategicAIState,
  player: number,
  group: number,
  c: StrategicGroupContext,
): void {
  const ai = s.records[player],
    at = strategicGroupOffset(group),
    owner = aiSByte(ai, at + 8),
    zone = aiSByte(ai, at + 12);
  if (!aiInteger(zone, 0, s.missionPrefix[0x34b8] - 1))
    throw Error("Actual strategic zone-group geometry required");
  const z = 0x2ff8 + zone * 19,
    quota = aiDword(s.missionPrefix, z + 14) | 0;
  //Unlike3E270 this callback does not floor the recalculated limit at1.
  aiPutWord(
    ai,
    at + 6,
    c.groupLimits[5] +
      aiSByte(s.records[owner], 0x664) +
      Math.trunc(quota / 256),
  );
  for (let i = 0; i < 300; i++) {
    const n = s.creatures[i];
    if (!member(s, ai, at, i) || !aiByte(n, 6) || c.creatureProtected(s, i))
      continue;
    if (!strategicGroupAcceptsCreature(s, player, group, i, c))
      unbind(s, player, group, i);
    let radius = Math.trunc((aiDword(s.missionPrefix, z + 6) | 0) / 256) & 255;
    if (aiWord(s.missionPrefix, 0x355c) > 100) radius = (radius + 8) & 255;
    if (aiDistance(aiPoint(n, 7), aiPoint(ai, at)) > radius * radius * 65536) {
      if (!unavailable(s, i, c) && !(aiByte(s.creatureControl, i * 2) & 4)) {
        release(s, i, c);
        move(s, owner, i, aiPoint(ai, at), c);
        s.creatureControl[i * 2] = aiByte(s.creatureControl, i * 2) | 4;
      }
    } else s.creatureControl[i * 2] = aiByte(s.creatureControl, i * 2) & 0xfb;
  }
}
function rewardGroup(
  s: StrategicAIState,
  player: number,
  group: number,
  c: StrategicGroupContext,
): void {
  const ai = s.records[player],
    at = strategicGroupOffset(group),
    owner = aiSByte(ai, at + 8);
  if (!c.effects)
    throw Error("Actual strategic reward effect59 pool binding required");
  const effects = c.effects(s),
    index = ai[at + 12];
  if (effects.length !== 200 || index >= 200 || effects[index]?.length !== 81)
    throw Error("Actual strategic200-effect native81 pool required");
  if (!aiByte(effects[index], 6) || aiByte(effects[index], 69) !== 59) {
    retireStrategicGroup(s, player, group);
    return;
  }
  if (aiSWord(ai, at + 4) < 1) {
    let best: number | null = null,
      distance = 0x80000000;
    for (let i = 0; i < 300; i++) {
      const n = s.creatures[i];
      if (
        !aiByte(n, 6) ||
        aiByte(n, 24) !== aiSByte(ai, at + 8) ||
        !strategicGroupAcceptsCreature(s, player, group, i, c)
      )
        continue;
      const old = aiSByte(s.creatureControl, i * 2 + 1),
        kindOffset = 0x387 + old * 38 + 9;
      //A normal unassigned-1 link reads the retained byte before the group table.
      if (kindOffset < 0 || kindOffset >= 1726)
        throw Error("Strategic reward prior group read outside AI record");
      if (s.records[owner][kindOffset] === 6) continue;
      const candidate = aiDistance(aiPoint(ai, at), aiPoint(n, 7));
      if (candidate < distance) {
        distance = candidate;
        best = i;
      }
    }
    if (best === null) {
      ai[at + 13] |= 16;
      return;
    }
    const old = aiSByte(s.creatureControl, best * 2 + 1);
    //Literal3D30E skips3E5A0 entirely when the selected prior link is negative.
    if (old >= 0) {
      unbind(s, owner, old, best);
      addStrategicCreatureToGroup(s, player, group, best, false, c);
    }
    return;
  }
  for (let i = 0; i < 300; i++)
    if (member(s, ai, at, i)) {
      if (!strategicGroupAcceptsCreature(s, player, group, i, c))
        unbind(s, player, group, i);
      if (!unavailable(s, i, c) && !(aiByte(s.creatureControl, i * 2) & 4)) {
        release(s, i, c);
        move(s, owner, i, aiPoint(ai, at), c);
        s.creatureControl[i * 2] = aiByte(s.creatureControl, i * 2) | 4;
      }
      return;
    }
}
/**One complete3C700 callback on a retained logical group. */
export function stepStrategicGroup(
  s: StrategicAIState,
  player: number,
  group: number,
  c: StrategicGroupContext,
): StrategicGroupStepReceipt {
  const ai = s.records[player],
    at = strategicGroupOffset(group),
    held = ai,
    owner = aiSByte(ai, at + 8);
  if (!aiInteger(owner, 0, 3))
    throw Error("Actual strategic group owner required");
  prepareGroup(s, player, group, c);
  switch (ai[at + 9]) {
    case 0:
    case 1:
      combatGroup(s, player, group, c);
      break;
    case 2:
      defendGroup(s, player, group, c);
      break;
    case 3:
    case 4:
      distributeGroup(s, player, group, ai[at + 9] as 3 | 4, c);
      break;
    case 5:
      zoneGroup(s, player, group, c);
      break;
    case 6:
      rewardGroup(s, player, group, c);
      break;
    //Source's jump-table default performs only the common preparation above.
  }
  if (s.records[player] !== held)
    throw Error("Strategic group callback replaced its held AI record");
  return { routine: 0x3c700, player, group };
}
export function stepStrategicGroupAtomic(
  s: StrategicAIState,
  player: number,
  group: number,
  c: StrategicGroupContext,
): { state: StrategicAIState; receipt: StrategicGroupStepReceipt } {
  validateStrategicAIState(s);
  validateStrategicAIContext(c);
  const staged = cloneStrategicAIState(s),
    receipt = stepStrategicGroup(staged, player, group, c);
  validateStrategicAIState(staged);
  return { state: staged, receipt };
}
export function makeStrategicGroupService(
  c: StrategicGroupContext,
): Pick<StrategicAIServices, "stepGroup"> {
  return {
    stepGroup: (s, player, group) => stepStrategicGroup(s, player, group, c),
  };
}

/**35730/35820 creature allocation/directives and3C2A0/3DD60/3E5A0/3E6B0.
 * Methods operate inside an isolated strategic/host callback. Real81C60 and
 *5D870 command ports retain the existing creature action/cancellation family. */
import { nextRandom } from "./random";
import {
  aiByte,
  aiDistance,
  aiInteger,
  aiPoint,
  aiPutWord,
  aiSByte,
  aiSWord,
  aiWord,
  type StrategicAIContext,
  type StrategicAIState,
} from "./strategic-ai-state";
import { strategicGroupOffset } from "./strategic-ai-groups";
import type {
  StrategicAIServices,
  StrategicServiceReceipt,
} from "./strategic-ai";

export interface StrategicCreatureMoveRequest {
  routine: 0x81c60;
  player: number;
  creature: number;
  point: [number, number];
}
export interface StrategicCreatureMoveReceipt
  extends StrategicCreatureMoveRequest {
  outcome: "installed" | "ignored";
}
export interface StrategicCreatureTargetRequest {
  routine: 0x5d870;
  player: number;
  creature: number;
  target: { family: 2 | 4; index: number };
}
export interface StrategicCreatureTargetReceipt
  extends StrategicCreatureTargetRequest {
  accepted: boolean;
}
export interface StrategicCreatureContext extends StrategicAIContext {
  speciesGenes: readonly (readonly [number, number])[];
  /**Existing ecology profile object3+4564.3E6B0 selects directions0..7. */
  spreadDirections: readonly (readonly [number, number])[];
  plants(state: StrategicAIState): readonly (readonly (number | null)[])[];
  plantProtected(state: StrategicAIState, index: number): boolean;
  /**Complete81C60 including selected-player audio and5DF50 real action release. */
  moveOrder?(
    state: StrategicAIState,
    request: StrategicCreatureMoveRequest,
  ): StrategicCreatureMoveReceipt;
  /**Complete5D870 target classification/action release. Its returned boolean
   * is deliberately ignored by35820, which still sets its control bit. */
  targetOrder?(
    state: StrategicAIState,
    request: StrategicCreatureTargetRequest,
  ): StrategicCreatureTargetReceipt;
}
function genes(
  s: StrategicAIState,
  creature: number,
  c: StrategicCreatureContext,
): readonly [number, number] {
  const selector = aiSByte(s.creatures[creature], 122),
    row = c.speciesGenes[selector];
  if (
    !aiInteger(selector, 0, 24) ||
    !row ||
    row.length !== 2 ||
    row.some((v) => !aiInteger(v, 0, 255))
  )
    throw Error("Actual strategic species gene pair required");
  return row;
}
function creatureIndex(s: StrategicAIState, index: number): void {
  if (
    !aiInteger(index, 0, 299) ||
    !s.creatures[index] ||
    aiSWord(s.creatures[index], 15) !== index
  )
    throw Error("Actual strategic creature native identity required");
}
/**Source availability used by35730 and35820. It does not require active kind;
 * the callers perform their own active/owner tests before reaching this gate. */
function available(
  s: StrategicAIState,
  index: number,
  c: StrategicCreatureContext,
): boolean {
  const n = s.creatures[index],
    state = aiByte(n, 94);
  return (
    state !== 18 &&
    state !== 15 &&
    !c.creatureProtected(s, index) &&
    !(aiByte(n, 97) & 1)
  );
}
/**3DD60 complete group-kind/species/zone compatibility. The source accepts
 * unrecognized group kinds above6; constructors separately bound admitted kinds. */
export function strategicGroupAcceptsCreature(
  s: StrategicAIState,
  player: number,
  group: number,
  creature: number,
  c: StrategicCreatureContext,
): boolean {
  const ai = s.records[player],
    at = strategicGroupOffset(group),
    kind = ai[at + 9];
  if (kind <= 3 || kind > 6) return true;
  if (kind === 4) return genes(s, creature, c).includes(4);
  if (kind === 5) {
    const zone = aiSByte(ai, at + 12);
    if (!aiInteger(zone, 0, s.missionPrefix[0x34b8] - 1))
      throw Error("Actual strategic group zone binding required");
    const selector = s.missionPrefix[0x2ff8 + zone * 19 + 4];
    if (selector === 7) return true;
    if (selector >= 8 && selector <= 12)
      return genes(s, creature, c).includes(selector - 8);
    return false;
  }
  const n = s.creatures[creature],
    owner = aiByte(n, 24);
  if (owner === 4) return aiByte(n, 118) <= 90;
  if (!aiInteger(owner, 0, 3))
    throw Error("Actual strategic creature owner required");
  if (aiByte(n, 97) & 4) return false;
  const species = aiSByte(n, 122);
  if (!aiInteger(species, 0, 24))
    throw Error("Actual strategic research species required");
  return s.players[owner][0x6c7 + species] < 1;
}
function issueMove(
  s: StrategicAIState,
  player: number,
  creature: number,
  point: [number, number],
  c: StrategicCreatureContext,
): void {
  if (!c.moveOrder)
    throw Error(
      "Strategic creature81C60/5DF50 move command is not implemented",
    );
  const n = s.creatures[creature],
    request: StrategicCreatureMoveRequest = {
      routine: 0x81c60,
      player,
      creature,
      point,
    },
    receipt = c.moveOrder(s, request);
  if (
    receipt?.routine !== request.routine ||
    receipt.player !== player ||
    receipt.creature !== creature ||
    !Array.isArray(receipt.point) ||
    receipt.point.length !== 2 ||
    receipt.point[0] !== point[0] ||
    receipt.point[1] !== point[1] ||
    !["installed", "ignored"].includes(receipt.outcome) ||
    s.creatures[creature] !== n
  )
    throw Error("Actual strategic81C60 command receipt required");
}
/**3E6B0 makes exactly two draws before the actual81C60 command admission.
 * Source coordinates retain signed16 multiplication/addition wrap. */
export function scatterStrategicCreature(
  s: StrategicAIState,
  player: number,
  group: number,
  creature: number,
  radius: number,
  c: StrategicCreatureContext,
): [number, number] {
  if (!aiInteger(radius, 1, 0x7fffffff))
    throw Error("Actual positive strategic scatter radius required");
  const ai = s.records[player],
    at = strategicGroupOffset(group),
    direction = nextRandom(s.rng) % 8,
    distanceDraw = nextRandom(s.rng),
    distance =
      radius <= 3 ? distanceDraw % radius : (distanceDraw % (radius - 3)) + 3,
    delta = c.spreadDirections[direction];
  if (
    !delta ||
    delta.length !== 2 ||
    delta.some((v) => !aiInteger(v, -32768, 32767))
  )
    throw Error("Actual strategic scatter direction required");
  const point: [number, number] = [
      ((aiSWord(ai, at) + Math.imul(delta[0], distance)) << 16) >> 16,
      ((aiSWord(ai, at + 2) + Math.imul(delta[1], distance)) << 16) >> 16,
    ],
    owner = aiSByte(ai, at + 8);
  if (!aiInteger(owner, 0, 3))
    throw Error("Actual strategic group owner required");
  issueMove(s, s.records[owner][4], creature, point, c);
  return point;
}
/**3E5A0 increments group count BEFORE checking the member's active/protected
 * state. Kind0 alone is limited by AI65F. Existing group orders remain live. */
export function addStrategicCreatureToGroup(
  s: StrategicAIState,
  player: number,
  group: number,
  creature: number,
  scatter: boolean,
  c: StrategicCreatureContext,
): boolean {
  creatureIndex(s, creature);
  const ai = s.records[player],
    at = strategicGroupOffset(group),
    owner = aiSByte(ai, at + 8);
  if (!aiInteger(owner, 0, 3))
    throw Error("Actual strategic group owner required");
  if (aiSWord(ai, at + 4) >= s.records[owner][0x65f] && ai[at + 9] === 0)
    return false;
  aiPutWord(ai, at + 4, aiWord(ai, at + 4) + 1);
  if (!aiByte(s.creatures[creature], 6) || c.creatureProtected(s, creature))
    return false;
  s.creatureControl[creature * 2 + 1] = ai[at + 11];
  s.creatureControl[creature * 2] =
    (aiByte(s.creatureControl, creature * 2) & 31) | ((ai[at + 10] & 7) << 5);
  if (scatter) scatterStrategicCreature(s, player, group, creature, 8, c);
  else issueMove(s, s.records[owner][4], creature, aiPoint(ai, at), c);
  return true;
}
/**3C2A0 allocation uses count/target rescue of the owner's defender group,
 * otherwise strict maximum(limit-9*count), starting from score-10000. */
export function assignStrategicCreature(
  s: StrategicAIState,
  player: number,
  creature: number,
  excludedGroup: number,
  c: StrategicCreatureContext,
): boolean {
  creatureIndex(s, creature);
  if (!aiInteger(excludedGroup, -128, 127))
    throw Error("Actual signed strategic excluded-group byte required");
  const ai = s.records[player],
    controlAt = creature * 2,
    old = aiSByte(s.creatureControl, controlAt + 1);
  if (old >= 16) throw Error("Strategic creature has invalid group link");
  if (old >= 0 && aiSWord(ai, strategicGroupOffset(old) + 4) >= 0) return false;
  if (old >= 0) s.creatureControl[controlAt + 1] = 255;
  const ownAt = strategicGroupOffset(player);
  if (aiSWord(ai, ownAt + 4) >= 0) {
    let targets = 0;
    for (let i = 0; i < 6; i++)
      if (aiSWord(ai, ownAt + 14 + i * 4) >= 0) targets++;
    if (
      aiSWord(ai, ownAt + 4) < targets + 2 &&
      (aiByte(s.creatureControl, controlAt) & 3) === 2
    ) {
      addStrategicCreatureToGroup(s, player, player, creature, true, c);
      return true;
    }
  }
  let best = -1,
    score = -10000;
  for (let group = 0; group < 16; group++) {
    const at = strategicGroupOffset(group),
      count = aiSWord(ai, at + 4);
    if (
      count < 0 ||
      ai[at + 13] & 8 ||
      !(count < ai[0x65f] || ai[at + 9] === 2) ||
      !strategicGroupAcceptsCreature(s, player, group, creature, c) ||
      ai[at + 11] === excludedGroup
    )
      continue;
    const candidate = aiSWord(ai, at + 6) - count * 9;
    if (candidate > score) {
      best = group;
      score = candidate;
    }
  }
  if (best < 0) return false;
  addStrategicCreatureToGroup(s, player, best, creature, true, c);
  return true;
}
/**35730 complete ascending creature loop. The source calls3C2A0 only for a
 * negative group link; a positive stale group waits for another caller. */
export function allocateStrategicCreatures(
  s: StrategicAIState,
  player: number,
  c: StrategicCreatureContext,
): StrategicServiceReceipt {
  for (let i = 0; i < 300; i++) {
    const n = s.creatures[i];
    if (
      !aiByte(n, 6) ||
      c.creatureProtected(s, i) ||
      aiByte(n, 24) !== player ||
      !available(s, i, c)
    )
      continue;
    creatureIndex(s, i);
    if (aiSByte(s.creatureControl, i * 2 + 1) < 0)
      assignStrategicCreature(s, player, i, -1, c);
    else if (
      ((aiByte(s.creatureControl, i * 2) >> 2) & 1) === 1 &&
      aiByte(n, 94) !== 0
    )
      s.creatureControl[i * 2] = aiByte(s.creatureControl, i * 2) & 0xfb;
  }
  return { routine: 0x35730, player };
}
function targetOrder(
  s: StrategicAIState,
  player: number,
  creature: number,
  target: StrategicCreatureTargetRequest["target"],
  c: StrategicCreatureContext,
): void {
  if (!c.targetOrder)
    throw Error("Strategic creature5D870 target command is not implemented");
  const n = s.creatures[creature],
    request: StrategicCreatureTargetRequest = {
      routine: 0x5d870,
      player,
      creature,
      target,
    },
    receipt = c.targetOrder(s, request);
  if (
    receipt?.routine !== request.routine ||
    receipt.player !== player ||
    receipt.creature !== creature ||
    receipt.target?.family !== target.family ||
    receipt.target.index !== target.index ||
    typeof receipt.accepted !== "boolean" ||
    s.creatures[creature] !== n
  )
    throw Error("Actual strategic5D870 target receipt required");
}
/**35820 complete direct-feeding path. Candidate distances originate at the
 * group's retained point. Flag8 plants are weighted2/3 for admission, but the
 * stored threshold remains min(rawDistance,old); early exit is below6400^2. */
export function directStrategicCreatures(
  s: StrategicAIState,
  player: number,
  c: StrategicCreatureContext,
): StrategicServiceReceipt {
  const ai = s.records[player];
  for (let i = 0; i < 300; i++) {
    const group = aiSByte(s.creatureControl, i * 2 + 1);
    if (group <= 0 || group >= 16) continue;
    const at = strategicGroupOffset(group),
      kind = ai[at + 9],
      n = s.creatures[i];
    if (
      (kind !== 4 && kind !== 2) ||
      !aiByte(n, 6) ||
      c.creatureProtected(s, i) ||
      aiByte(n, 24) !== player
    )
      continue;
    creatureIndex(s, i);
    //6D390 resolves the stored91 reference but its result is unused. It only
    //reads the index/kind and preserves EDX (the group point), with no writes.
    if (aiSWord(n, 91) >= 0) aiByte(n, 93);
    let controlAt = aiSWord(n, 15) * 2;
    if (aiByte(s.creatureControl, controlAt) & 8 && aiWord(n, 96) & 0x200)
      s.creatureControl[controlAt] =
        aiByte(s.creatureControl, controlAt) & 0xe7;
    const state = aiByte(n, 94);
    if (
      state === 1 ||
      (state >= 21 && state < 24) ||
      aiByte(s.creatureControl, controlAt) & 0x18 ||
      !available(s, i, c) ||
      aiWord(n, 96) & 2
    )
      continue;
    const gene = genes(s, i, c),
      building = ai[0x46];
    if (building !== 64 && gene[0] === 1) {
      if (building > 63)
        throw Error("Strategic feeding building outside owner pool");
      targetOrder(
        s,
        player,
        i,
        { family: 4, index: player * 64 + building },
        c,
      );
      controlAt = aiSWord(n, 15) * 2;
      s.creatureControl[controlAt] = aiByte(s.creatureControl, controlAt) | 16;
      continue;
    }
    if (!gene.includes(4)) continue;
    const plants = c.plants(s);
    if (plants.length !== 512)
      throw Error("Actual strategic512-plant pool required");
    const point = aiPoint(ai, at);
    let best: number | null = null,
      threshold = 0x80000000;
    for (let index = 0; index < 512; index++) {
      const plant = plants[index];
      if (plant.length !== 49)
        throw Error("Actual strategic plant native49 image required");
      if (!aiByte(plant, 6) || c.plantProtected(s, index)) continue;
      const distance = aiDistance(point, aiPoint(plant, 7)),
        weighted =
          aiByte(plant, 46) & 8 ? Math.trunc((distance * 2) / 3) : distance;
      if (weighted >= threshold) continue;
      threshold = Math.min(distance, threshold);
      best = index;
      if (threshold < 0x2710000) break;
    }
    if (best !== null) targetOrder(s, player, i, { family: 2, index: best }, c);
    controlAt = aiSWord(n, 15) * 2;
    s.creatureControl[controlAt] = aiByte(s.creatureControl, controlAt) | 8;
  }
  return { routine: 0x35820, player };
}
/**Binds real concrete bodies to the existing37870 required service slots. */
export function makeStrategicCreatureServices(
  c: StrategicCreatureContext,
): Pick<StrategicAIServices, "allocateCreatures" | "directCreatures"> {
  return {
    allocateCreatures: (s, player) => allocateStrategicCreatures(s, player, c),
    directCreatures: (s, player) => directStrategicCreatures(s, player, c),
  };
}

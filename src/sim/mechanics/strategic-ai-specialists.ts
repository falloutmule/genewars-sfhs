/**Source33F60 specialist planning: retained roster, pending encounters, four
 * role decisions and exact command ordering. Host actions are required ports. */
import {
  aiByte,
  aiDistance,
  aiDword,
  aiInteger,
  aiPoint,
  aiPutDword,
  aiSByte,
  aiSWord,
  aiWord,
  strategicBlueprint,
  validateStrategicAIContext,
  validateStrategicAIState,
  type StrategicNative,
} from "./strategic-ai-state";
import type { StrategicAIServices } from "./strategic-ai";
import { strategicGroupOffset } from "./strategic-ai-groups";
import {
  prepareStrategicRoster,
  type StrategicRecruitServices,
} from "./strategic-ai-recruit";
import {
  chooseStrategicPlantWork,
  issueStrategicSpecialistCancel,
  issueStrategicSpecialistMove,
  retreatStrategicSpecialist,
  retryStrategicSpecialistRoute,
  routeStrategicSpecialistAroundBuilding,
  type StrategicSpecialistRouteContext,
} from "./strategic-ai-specialists-routes";
import {
  cloneStrategicSpecialistPlanner,
  issueStrategicRoleCommand,
  specialistLocalIndex,
  strategicRolePacket,
  validateStrategicPlannerMetadata,
  type StrategicSpecialistPlannerState,
} from "./strategic-ai-specialists-state";
import type { StrategicCreatureContext } from "./strategic-ai-creatures";
export interface StrategicPlantDensityRequest {
  routine: 0x8d930;
  source: 0x34eae;
  point: [number, number];
  radius: 0x500;
  extentSquared: 0x190000;
  mode: 1;
  predicate: 0x32a70;
  group: number;
}
export interface StrategicPlantStyleRequest {
  routine: 0x320e0 | 0x8d930;
  source: 0x34ffa | 0x3510a;
  player: number;
  group: number;
  point: [number, number];
  /**Actual constructor fields for320E0 or32750 before8D930. */
  radius: 0xf00 | 0x500;
  extentSquared: 0xe10000 | 0x190000;
  mode: 0x56 | 1;
  predicate: 0x327e0 | 0x32630;
}
export interface StrategicEngineerPlanRequest {
  routine: 0x37c50;
  player: number;
  specialist: number;
}
export interface StrategicSpecialistPlanContext
  extends StrategicCreatureContext,
    Omit<
      StrategicSpecialistRouteContext,
      "plants" | "plantProtected" | "spreadDirections"
    >,
    StrategicRecruitServices {
  specialistProtected(
    s: StrategicSpecialistPlannerState,
    index: number,
  ): boolean;
  effects?(
    s: StrategicSpecialistPlannerState,
  ): readonly (readonly (number | null)[])[];
  family6?(
    s: StrategicSpecialistPlannerState,
  ): readonly (readonly (number | null)[])[];
  plantDensity?(
    s: StrategicSpecialistPlannerState,
    request: StrategicPlantDensityRequest,
  ): {
    routine: 0x8d930;
    count: number;
  };
  plantStyle?(
    s: StrategicSpecialistPlannerState,
    request: StrategicPlantStyleRequest,
  ): {
    routine: StrategicPlantStyleRequest["routine"];
    found: boolean;
    point: [number, number];
    style: number;
  };
  /**Required37C50/37D60/37F30/390D0 construction planning subtree. */
  engineerPlan?(
    s: StrategicSpecialistPlannerState,
    request: StrategicEngineerPlanRequest,
  ): StrategicEngineerPlanRequest & { result: boolean };
}
export interface StrategicSpecialistPlanReceipt {
  routine: 0x33f60;
  player: number;
  visited: number[];
  retried: number | null;
}
const distance = (a: readonly number[], b: readonly number[]) =>
  Math.floor(Math.sqrt(aiDistance(a, b)));
function rosterSpecialist(
  s: StrategicSpecialistPlannerState,
  player: number,
  ordinal: number,
): number | null {
  const raw = s.players[player];
  if (ordinal >= aiSByte(raw, 3)) return null;
  const index = aiSByte(raw, 4 + ordinal);
  if (!aiInteger(index, 0, 19))
    throw Error("Actual strategic roster specialist link required");
  specialistLocalIndex(s, index);
  return index;
}
function building(
  s: StrategicSpecialistPlannerState,
  index: number,
): StrategicNative {
  if (!aiInteger(index, 0, 255))
    throw Error("Actual strategic building link required");
  return s.buildings[index];
}
function numericTarget(
  s: StrategicSpecialistPlannerState,
  kind: number,
  index: number,
  c: StrategicSpecialistPlanContext,
): readonly (number | null)[] | null {
  let rows: readonly (readonly (number | null)[])[], size: number;
  switch (kind) {
    case 1:
      rows = s.creatures;
      size = 124;
      break;
    case 2:
      rows = c.plants(s);
      size = 49;
      if (rows.length !== 512)
        throw Error("Actual strategic plant pool required");
      break;
    case 3:
      rows = s.specialists.map((v) => v.native);
      size = 200;
      break;
    case 4:
      return building(s, index);
    case 5:
      if (!c.effects)
        throw Error("Actual strategic pending-effect pool required");
      rows = c.effects(s);
      size = 81;
      if (rows.length !== 200)
        throw Error("Actual strategic200-effect pool required");
      break;
    case 6:
      if (!c.family6) throw Error("Actual strategic family6 pool required");
      rows = c.family6(s);
      size = 49;
      if (rows.length !== 32)
        throw Error("Actual strategic32-family6 pool required");
      break;
    default:
      return null;
  }
  if (!aiInteger(index, 0, rows.length - 1) || rows[index].length !== size)
    throw Error("Actual strategic pending-target native extent required");
  return rows[index];
}
function clearRoute(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
): void {
  s.records[player][0x173 + specialistLocalIndex(s, specialist)] = 0;
}
function cancelAndClear(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  source: number,
  c: StrategicSpecialistPlanContext,
): void {
  issueStrategicSpecialistCancel(s, player, specialist, source, c);
  clearRoute(s, player, specialist);
}
function targetCommand(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  source: number,
  task: number,
  argument: number,
  targetKind: number | null,
  c: StrategicSpecialistPlanContext,
  cache: boolean,
): void {
  const words: Record<number, number> = { 0: specialist, 2: task, 4: argument };
  if (targetKind !== null) words[6] = targetKind;
  issueStrategicRoleCommand(
    s,
    c,
    {
      routine: 0x81080,
      source,
      player,
      specialist,
      packet: strategicRolePacket(s, c, source, words, 5),
    },
    cache,
  );
}
function areaCommand(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  source: number,
  task: number,
  argument: number,
  point: [number, number],
  c: StrategicSpecialistPlanContext,
): void {
  issueStrategicRoleCommand(
    s,
    c,
    {
      routine: 0x811a0,
      source,
      player,
      specialist,
      packet: strategicRolePacket(
        s,
        c,
        source,
        { 0: specialist, 2: task, 4: argument, 6: point[0], 8: point[1] },
        16,
      ),
    },
    true,
  );
}
function pendingEncounter(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  category: number,
  c: StrategicSpecialistPlanContext,
): void {
  const n = s.specialists[specialist].native,
    kind = aiByte(n, 125);
  if (!kind) return;
  const index = aiSWord(n, 123),
    target = numericTarget(s, kind, index, c);
  if (kind === 1 && target) {
    if (category === 3 || category === 2)
      targetCommand(
        s,
        player,
        specialist,
        category === 3 ? 0x34493 : 0x344f4,
        category === 3 ? 0x203 : 3,
        aiSWord(target, 15),
        aiSByte(target, 6),
        c,
        false,
      );
    else {
      cancelAndClear(s, player, specialist, 0x3452a, c);
      retreatStrategicSpecialist(s, player, specialist, target, c);
    }
  } else if (kind === 4 && target) {
    const r = aiByte(target, 46) * 256 + 1536,
      selfDistance = distance(aiPoint(n, 7), aiPoint(target, 7));
    if (category === 3) {
      if (aiByte(n, 88) === 1 && [1, 2].includes(aiByte(n, 126))) {
        const otherKind = aiByte(n, 129);
        if (otherKind !== 1 && otherKind !== 3)
          throw Error(
            "Actual strategic Shepherd building encounter target required",
          );
        const other = numericTarget(s, otherKind, aiSWord(n, 127), c)!;
        const selfSide = (selfDistance >= r ? 1 : 0) + 1,
          otherSide =
            (distance(aiPoint(other, 7), aiPoint(target, 7)) >= r ? 1 : 0) + 1;
        if (!(selfSide & otherSide))
          cancelAndClear(s, player, specialist, 0x34305, c);
        else if (selfSide & 2)
          routeStrategicSpecialistAroundBuilding(
            s,
            player,
            specialist,
            index,
            aiPoint(other, 7),
            c,
          );
      }
    } else if (selfDistance > r)
      routeStrategicSpecialistAroundBuilding(
        s,
        player,
        specialist,
        index,
        aiPoint(n, 92),
        c,
      );
    else cancelAndClear(s, player, specialist, 0x343f0, c);
  } else if (kind === 5) {
    if (target && aiByte(target, 6)) {
      cancelAndClear(s, player, specialist, 0x345af, c);
      retreatStrategicSpecialist(s, player, specialist, target, c);
    }
  } else {
    cancelAndClear(s, player, specialist, 0x3466d, c);
    retreatStrategicSpecialist(s, player, specialist, target, c);
  }
  n[125] = 0;
}
function engineer(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  c: StrategicSpecialistPlanContext,
): void {
  const ai = s.records[player],
    n = s.specialists[specialist].native;
  if (aiByte(n, 85) !== 1) return;
  if (!aiByte(n, 122)) {
    if (aiByte(n, 131) !== 14) {
      const index = aiSWord(n, 127),
        local = index % 64;
      if (!aiInteger(local, 0, 63))
        throw Error(
          "Actual strategic Engineer completed-building slot required",
        );
      const b = building(s, player * 64 + local),
        kind = aiSByte(b, 45),
        offset = 0x47 + kind;
      if (offset < 0 || offset >= ai.length)
        throw Error("Actual strategic Engineer building kind required");
      const classification = ai[offset],
        referred = aiByte(n, 129) === 4 ? building(s, index) : null;
      if (referred && aiByte(referred, 45) === 3) {
        if (ai[0x5e7 + classification] === 64)
          ai[0x5e7 + classification] = local;
        else if (ai[0x5ed + classification] === 64)
          ai[0x5ed + classification] = local;
      }
      ai[0x55 + local] = classification;
      ai[offset] = 0;
      n[131] = 14;
      aiPutDword(ai, 0x6a2, aiDword(ai, 6));
    }
    if (ai[0x46] !== 64 && aiWord(building(s, player * 64 + ai[0x46]), 49) & 1)
      ai[0x46] = 64;
    for (let i = 0; i < 600; i += 2)
      s.creatureControl[i] = aiByte(s.creatureControl, i) & 0xef;
  } else {
    if (aiByte(n, 129) === 4)
      ai[0x47 + aiSByte(building(s, aiSWord(n, 127)), 45)] = 0;
    n[122] = 0;
    n[131] = 14;
  }
  ai[0x60f] = 3;
  const own = s.buildings.slice(player * 64, player * 64 + 64),
    has = (kind: number) =>
      own.some((b) => aiByte(b, 6) && aiSByte(b, 45) === kind);
  let allowed = true;
  if (
    has(0) &&
    has(3) &&
    aiDword(ai, 0x6a2) &&
    (aiDword(ai, 6) - aiDword(ai, 0x6a2)) >>> 0 <= ai[0x665] * 50
  )
    allowed = false;
  for (let i = 0; i < 14; i++)
    if (ai[0x47 + i]) {
      allowed = false;
      break;
    }
  if (allowed) {
    if (!c.engineerPlan)
      throw Error(
        "Strategic Engineer37C50 construction planning is not implemented",
      );
    const held = n,
      result = c.engineerPlan(s, { routine: 0x37c50, player, specialist });
    if (
      result?.routine !== 0x37c50 ||
      result.player !== player ||
      result.specialist !== specialist ||
      typeof result.result !== "boolean" ||
      s.specialists[specialist].native !== held
    )
      throw Error("Actual strategic37C50 planning receipt required");
  }
}
function botanist(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  bp: number[],
  c: StrategicSpecialistPlanContext,
): void {
  const ai = s.records[player],
    n = s.specialists[specialist].native;
  if (
    aiByte(n, 85) !== 1 ||
    aiSByte(bp, 27) <= Math.trunc((aiSByte(bp, 24) * ai[0x63c]) / 100)
  )
    return;
  const laboratory = s.buildings
    .slice(player * 64, player * 64 + 64)
    .find((b) => aiByte(b, 6) && aiSByte(b, 45) === 5);
  if (laboratory && aiByte(n, 114) === 0) {
    const flags = aiWord(laboratory, 49),
      p = s.players[player];
    if (flags & 1 && !(flags & 0x140) && !p[0x498] && aiDword(p, 0x499) === 0)
      targetCommand(
        s,
        player,
        specialist,
        0x34cf9,
        0xe00,
        aiSWord(laboratory, 15) << 8,
        null,
        c,
        false,
      );
    return;
  }
  if (!laboratory && aiByte(n, 114) < 20) {
    const point = chooseStrategicPlantWork(s, player, specialist, c);
    if (point) areaCommand(s, player, specialist, 0x34df9, 8, 0, point, c);
    return;
  }
  let chosen: number | null = null,
    best = 0x40000000;
  for (let group = 0; group < 16; group++) {
    const at = strategicGroupOffset(group),
      kind = ai[at + 9];
    if (kind !== 3 && kind !== 4 && kind !== 5) continue;
    if (kind === 5) {
      const zone = aiSByte(ai, at + 12);
      if (zone < 0 || zone >= s.missionPrefix[0x34b8])
        throw Error("Actual strategic Botanist zone-group geometry required");
      if (s.missionPrefix[0x2ff8 + zone * 19 + 4] !== 7) continue;
    }
    if (!c.plantDensity)
      throw Error(
        "Strategic Botanist8D930 plant-density survey is not implemented",
      );
    const result = c.plantDensity(s, {
      routine: 0x8d930,
      source: 0x34eae,
      group,
      point: aiPoint(ai, at),
      radius: 0x500,
      extentSquared: 0x190000,
      mode: 1,
      predicate: 0x32a70,
    });
    if (result?.routine !== 0x8d930 || !aiInteger(result.count, 0, 0x7fffffff))
      throw Error("Actual strategic plant-density result required");
    const score =
      kind === 5
        ? Math.max(0, result.count - Math.trunc(aiSByte(ai, 0x664) / 10))
        : result.count + 1;
    if (score < best) {
      best = score;
      chosen = group;
    }
  }
  if (chosen === null) return;
  if (!c.plantStyle)
    throw Error("Strategic Botanist plant-style survey is not implemented");
  const at = strategicGroupOffset(chosen),
    kind = ai[at + 9],
    request: StrategicPlantStyleRequest =
      kind === 4
        ? {
            routine: 0x320e0,
            source: 0x34ffa,
            player,
            group: chosen,
            point: aiPoint(ai, at),
            radius: 0xf00,
            extentSquared: 0xe10000,
            mode: 0x56,
            predicate: 0x327e0,
          }
        : {
            routine: 0x8d930,
            source: 0x3510a,
            player,
            group: chosen,
            point: aiPoint(ai, at),
            radius: 0x500,
            extentSquared: 0x190000,
            mode: 1,
            predicate: 0x32630,
          },
    result = c.plantStyle(s, request);
  if (
    result?.routine !== request.routine ||
    typeof result.found !== "boolean" ||
    !aiInteger(result.style, 0, 255) ||
    result.point.length !== 2 ||
    result.point.some((v) => !aiInteger(v, -32768, 32767))
  )
    throw Error("Actual strategic plant-style result required");
  if (kind === 4) {
    if (result.found)
      areaCommand(
        s,
        player,
        specialist,
        0x350df,
        0x107,
        result.style << 8,
        result.point,
        c,
      );
  } else if (result.style !== 12)
    areaCommand(
      s,
      player,
      specialist,
      0x351ec,
      0x107,
      result.style << 8,
      aiPoint(ai, at),
      c,
    );
}
function geneticist(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  c: StrategicSpecialistPlanContext,
): void {
  const ai = s.records[player],
    n = s.specialists[specialist].native,
    raw = s.players[player];
  if (aiByte(n, 85) !== 1) return;
  const threshold = (raw[0x6e1] * 25 + 50) * 2048;
  let chosen: number | null = null,
    best = 0;
  //The literal scans only25 creature records, not all300. Its second research
  //test is indexed by creature scan index, rather than the creature's species.
  for (let i = 0; i < 25; i++) {
    const target = s.creatures[i];
    if (!aiByte(target, 6) || c.creatureProtected(s, i)) continue;
    const species = aiByte(target, 122),
      genes = c.speciesGenes[species];
    if (species >= 25 || !genes)
      throw Error("Actual strategic species gene metadata required");
    if ((aiDword(raw, 0x61a + species * 4) | 0) >= threshold) continue;
    const first = aiSByte(ai, 0x647 + ((genes[0] << 24) >> 24));
    let score: number;
    if (first < -10) score = -10000;
    else if ((aiDword(raw, 0x61a + i * 4) | 0) >= threshold) score = -20000;
    else {
      score = first * 2 + aiSByte(ai, 0x647 + ((genes[1] << 24) >> 24));
      if (aiByte(target, 24) === ai[4] || aiByte(target, 24) === 4)
        score += 1000;
    }
    if (score > best) {
      best = score;
      chosen = i;
    }
  }
  if (chosen !== null)
    targetCommand(
      s,
      player,
      specialist,
      0x3556e,
      3,
      aiSWord(s.creatures[chosen], 15),
      aiSByte(s.creatures[chosen], 6),
      c,
      true,
    );
}
function shepherd(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  c: StrategicSpecialistPlanContext,
): void {
  const ai = s.records[player],
    n = s.specialists[specialist].native;
  if (aiByte(n, 85) !== 1) return;
  //Source visits groups4..15 and can issue multiple commands in one callback.
  for (let group = 4; group < 16; group++) {
    const at = strategicGroupOffset(group);
    if (ai[at + 9] === 3 && aiSWord(ai, at + 4) > 0)
      areaCommand(s, player, specialist, 0x35313, 6, 2, aiPoint(ai, at), c);
  }
}
/**One complete33F60 numeric planner entry, inside an isolated host transaction. */
export function planStagedStrategicSpecialists(
  s: StrategicSpecialistPlannerState,
  player: number,
  c: StrategicSpecialistPlanContext,
): StrategicSpecialistPlanReceipt {
  if (!aiInteger(player, 0, 3))
    throw Error("Actual strategic specialist planner player required");
  const ai = s.records[player],
    raw = s.players[player],
    receipt: StrategicSpecialistPlanReceipt = {
      routine: 0x33f60,
      player,
      visited: [],
      retried: null,
    };
  ai.fill(0, 0x69e, 0x6a2);
  for (let ordinal = 0; ordinal < 5; ordinal++) {
    const specialist = rosterSpecialist(s, player, ordinal);
    if (specialist === null || !aiByte(s.specialists[specialist].native, 6))
      continue;
    const category = aiSByte(strategicBlueprint(s, specialist), 22),
      at = 0x69e + category;
    if (!aiInteger(at, 0, ai.length - 1))
      throw Error("Actual strategic category counter address required");
    ai[at] = (ai[at] + 1) & 255;
  }
  if (ai[0x6b1] !== aiSByte(raw, 3)) {
    const lab = s.buildings
      .slice(player * 64, player * 64 + 64)
      .find((b) => aiByte(b, 6) && aiSByte(b, 45) === 5);
    if (lab) {
      const flags = aiWord(lab, 49);
      if (flags & 1 && !(flags & 0x140)) prepareStrategicRoster(s, player, c);
    }
  }
  for (let ordinal = 0; ordinal < aiSByte(raw, 3); ordinal++) {
    if (ordinal >= 5)
      throw Error("Actual strategic maximum specialist roster required");
    const specialist = rosterSpecialist(s, player, ordinal)!;
    const n = s.specialists[specialist].native;
    if (!aiByte(n, 6) || c.specialistProtected(s, specialist)) continue;
    const bp = strategicBlueprint(s, specialist),
      category = aiSByte(bp, 22);
    receipt.visited.push(specialist);
    pendingEncounter(s, player, specialist, category, c);
    ai[0x178 + ordinal] = bp[26];
    if (aiByte(n, 85) === 1) {
      if (ai[0x173 + specialistLocalIndex(s, specialist)]) {
        retryStrategicSpecialistRoute(s, player, specialist, c);
        receipt.retried = specialist;
        return receipt;
      }
      if (aiSByte(bp, 23) < 100)
        for (let g = 0; g < 16; g++) {
          const at = strategicGroupOffset(g);
          if (
            aiSWord(ai, at + 4) >= 0 &&
            ai[at + 9] === 6 &&
            ai[at + 13] & 16 &&
            !(ai[at + 13] & 32)
          ) {
            issueStrategicSpecialistMove(
              s,
              player,
              specialist,
              aiPoint(ai, at),
              0x347f7,
              c,
            );
            ai[at + 13] |= 32;
            break;
          }
        }
    }
    switch (category) {
      case 0:
        engineer(s, player, specialist, c);
        break;
      case 1:
        botanist(s, player, specialist, bp, c);
        break;
      case 2:
        geneticist(s, player, specialist, c);
        break;
      case 3:
        shepherd(s, player, specialist, c);
        break;
    }
    if (
      s.records[player] !== ai ||
      s.players[player] !== raw ||
      s.specialists[specialist].native !== n
    )
      throw Error(
        "Strategic specialist planner replaced its held native/player record",
      );
  }
  return receipt;
}
export function stepStrategicSpecialists(
  s: StrategicSpecialistPlannerState,
  player: number,
  c: StrategicSpecialistPlanContext,
): {
  state: StrategicSpecialistPlannerState;
  receipt: StrategicSpecialistPlanReceipt;
} {
  validateStrategicAIState(s);
  validateStrategicAIContext(c);
  validateStrategicPlannerMetadata(s);
  const state = cloneStrategicSpecialistPlanner(s),
    receipt = planStagedStrategicSpecialists(state, player, c);
  validateStrategicAIState(state);
  validateStrategicPlannerMetadata(state);
  return { state, receipt };
}
export function makeStrategicSpecialistService(
  c: StrategicSpecialistPlanContext,
): Pick<StrategicAIServices, "planSpecialists"> {
  return {
    planSpecialists: (s, player) =>
      planStagedStrategicSpecialists(s, player, c),
  };
}

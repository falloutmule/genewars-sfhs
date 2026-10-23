/** Source360B0 Genepod results, production balance and settlement planning.
 * Spatial31330/31560 survey remains an explicit required service boundary. */
import {
  aiByte, aiDword, aiInteger, aiPoint, aiPutDword, aiPutWord, aiSByte, aiSWord, aiWord,
  cloneStrategicAIState, validateStrategicAIState,
  type StrategicAIContext, type StrategicAIState,
} from "./strategic-ai-state";
import { createStrategicGroup, moveStrategicGroup, strategicGroupOffset } from "./strategic-ai-groups";
import { requestStagedStrategicProduction, type StrategicProductionContext, type StrategicProductionReceipt } from "./strategic-ai-production";
import type { StrategicAIServices } from "./strategic-ai";
export interface StrategicBuildingContext extends StrategicAIContext, StrategicProductionContext {
  buildingValues: readonly (readonly [number, number, number])[];
  /** Actual resumable31330 with31560 cell visitor. It owns source184..194
   * cursor/completion flags and real settlement counters. Never a done stub. */
  surveySettlement?(s: StrategicAIState, player: number, settlement: number): {
    routine: 0x31330; player: number; settlement: number; complete: boolean;
  };
}
export function strategicSettlementOffset(index: number): number {
  if (!aiInteger(index, 0, 5)) throw Error("Actual strategic settlement index0..5 required");
  return 0x195 + index * 83;
}
/**31830 resets only its listed fields. In particular cost4D..50 is retained. */
export function clearStrategicSettlement(s: StrategicAIState, player: number, index: number): void {
  const n = s.records[player], at = strategicSettlementOffset(index);
  aiPutDword(n, at, 0); n[at + 4] = 0;
  for (const p of [5, 7, 9, 0x27, 0x51]) aiPutWord(n, at + p, 0);
  for (const p of [0xb, 0xf, 0x13, 0x17, 0x1b, 0x1f, 0x23, 0x29, 0x3d, 0x41, 0x45, 0x49]) aiPutDword(n, at + p, 0);
  for (let i = 0; i < 8; i++) aiPutWord(n, at + 0x2d + i * 2, 0);
}
/** Source truncates signed coordinates to cells before averaging, rather than
 * averaging fixed-point positions. Unmatched settlements produce point0,0. */
export function strategicSettlementCenter(s: StrategicAIState, player: number, settlement: number): [number, number] {
  const ai = s.records[player]; let x = 0, y = 0, count = 0;
  for (let i = 0; i < 64; i++) {
    const n = s.buildings[player * 64 + i];
    if (!aiByte(n, 6) || ai[0x55 + i] !== settlement) continue;
    x += Math.trunc(aiSWord(n, 7) / 256); y += Math.trunc(aiSWord(n, 9) / 256); count++;
  }
  if (count) { x = Math.trunc(x / count) << 8; y = Math.trunc(y / count) << 8; }
  return [(x << 16) >> 16, (y << 16) >> 16];
}
/**36FF0 uses the first free group4..15, or moves its existing group. Known
 * low6 constructor flags are1; uninitialized caller high bits are discarded. */
export function ensureStrategicSettlementGroup(s: StrategicAIState, player: number, c: StrategicAIContext): void {
  const ai = s.records[player], point = aiSByte(s.players[player], 0x4a2) < 1
    ? aiPoint(s.players[player], 9) : strategicSettlementCenter(s, player, 1);
  let index = aiSByte(ai, 0x6b2);
  if (index >= 0) { moveStrategicGroup(s, player, index, point, c); return; }
  for (let i = 4; i < 16; i++) if (aiSWord(ai, strategicGroupOffset(i) + 4) < 0) {
    index = i; ai[0x6b2] = i; break;
  }
  if (index >= 0) createStrategicGroup(s, player, { index, point, kind: 4, parameter: 1, zone: 1, flags: 1 }, c);
}
export interface StrategicBuildingReceipt {
  routine: 0x360b0; player: number; completedOutputs: number[];
  production: StrategicProductionReceipt[]; surveys: number[];
}
function available(n: readonly (number | null)[]): boolean {
  const flags = aiWord(n, 49);
  return !!(flags & 1) && !(flags & 0x140) && aiByte(n, 27) === 0 && (aiDword(n, 54) | 0) <= 0;
}
/** Already-isolated37870 service. Conversion bug fix: the original emergency
 * result scratch was read before assignment. Initialize it false once per pass
 * instead of inheriting arbitrary DOS stack bytes; retain it across pods. */
export function planStagedStrategicBuildings(s: StrategicAIState, player: number, c: StrategicBuildingContext): StrategicBuildingReceipt {
  if (!aiInteger(player, 0, 3) || c.buildingValues.length !== 14 || c.buildingValues.some(r => r.length !== 3 || r.some(v => !aiInteger(v, -32768, 32767))))
    throw Error("Actual strategic owner/building value table required");
  const ai = s.records[player], raw = s.players[player], initialSettlement = strategicSettlementOffset(aiByte(ai, 0x183));
  const out: StrategicBuildingReceipt = { routine: 0x360b0, player, completedOutputs: [], production: [], surveys: [] };
  let emergencySubmitted = false;
  const produce = (building: number, role: 0 | 1 | 2) => {
    const result = requestStagedStrategicProduction(s, player, building, role, c); out.production.push(result); return result.submitted;
  };
  for (let local = 0; local < 64; local++) {
    const index = player * 64 + local, n = s.buildings[index];
    if (!aiByte(n, 6) || aiByte(n, 45) !== 0) continue;
    const result = aiSWord(n, 58);
    if (result === 301) aiPutWord(n, 58, -1);
    else if (result >= 0) {
      aiPutWord(n, 58, -1);
      if (!aiInteger(result, 0, 299)) throw Error("Strategic Genepod output leaves actual creature pool");
      const creature = s.creatures[result];
      if (aiByte(creature, 6)) {
        const species = aiSByte(creature, 122), role = aiByte(n, 60), nativeIndex = aiSWord(creature, 15), weights = c.productionWeights[species];
        if (!weights || !aiInteger(nativeIndex, 0, 299)) throw Error("Actual strategic produced species/identity required");
        aiPutDword(ai, 0x6a6, aiDword(ai, 6));
        const at = nativeIndex * 2;
        if (role <= 2) {
          const field = role === 0 ? 0x1b : role === 1 ? 0x1f : 0x13;
          aiPutDword(ai, initialSettlement + field, aiDword(ai, initialSettlement + field) + weights[role]);
          s.creatureControl[at] = (aiByte(s.creatureControl, at) & 252) | role;
        }
        s.creatureControl[at] = (aiByte(s.creatureControl, at) & 31) | ((ai[0x55 + local] & 7) << 5);
        aiPutDword(ai, initialSettlement + 0x17, aiDword(ai, initialSettlement + 0x17) + weights[3]);
        out.completedOutputs.push(result);
      }
    }
    const group = strategicGroupOffset(player); let validTargets = 0;
    for (let target = 0; target < 6; target++) if (aiSWord(ai, group + 14 + target * 4) >= 0) validTargets++;
    if (aiSWord(ai, group + 4) < validTargets + 2 && available(n)) emergencySubmitted = produce(index, 2);
    if (ai[0x194] === 0) {
      if (ai[0x192] === 0) {
        ensureStrategicSettlementGroup(s, player, c);
        ai[0x183] = 1; clearStrategicSettlement(s, player, 1); ai[0x18d] = 1;
        const center = strategicSettlementCenter(s, player, 1);
        ai[0x18c] = 75; aiPutDword(ai, 0x18e, 5120); ai[0x192] = 1;
        aiPutWord(ai, 0x188, center[0]); aiPutWord(ai, 0x18a, center[1]);
      } else {
        if (!c.surveySettlement) throw Error("Strategic31330/31560 settlement survey is not implemented");
        const selected = aiByte(ai, 0x183), beforeAI = s.records[player], native = s.buildings[index],
          receipt = c.surveySettlement(s, player, selected);
        if (receipt?.routine !== 0x31330 || receipt.player !== player || receipt.settlement !== selected || typeof receipt.complete !== "boolean")
          throw Error("Actual strategic settlement survey receipt required");
        if (s.records[player] !== beforeAI || s.buildings[index] !== native || s.players[player] !== raw)
          throw Error("Strategic survey replaced retained records");
        out.surveys.push(selected);
        if (receipt.complete) {
          const at = strategicSettlementOffset(aiByte(ai, 0x183)); aiPutDword(ai, at, aiDword(ai, 6));
          let cost = 0;
          for (let slot = 0; slot < 64; slot++) {
            const b = s.buildings[player * 64 + slot];
            if (!aiByte(b, 6) || (ai[0x183] !== 0 && ai[0x55 + slot] !== ai[0x183])) continue;
            const value = c.buildingValues[aiSByte(b, 45)]?.[aiByte(b, 46)];
            if (value === undefined) throw Error("Actual strategic building selector/grade required");
            cost = (cost + value) | 0;
          }
          aiPutDword(ai, at + 0x4d, cost);
        }
      }
    } else if (((aiDword(ai, 6) - aiDword(ai, strategicSettlementOffset(ai[0x183]))) >>> 0) < aiWord(ai, 0x650)) {
      if (emergencySubmitted || !available(n)) continue;
      const last = aiDword(ai, 0x6a6), elapsed = (aiDword(ai, 6) - last) >>> 0;
      if (last !== 0 && elapsed <= aiWord(ai, 0x660)) continue;
      if ((aiDword(ai, 0x64c) | 0) >= ((aiDword(raw, 0x4a3) + aiDword(raw, 0x4a7)) | 0)) continue;
      const counts = [0, 0, 0, 0], deficits = [0, 0, 0]; let total = 0, best = -5, role = 3;
      //Literal360B0 deliberately counts owner bytes even on inactive rows.
      for (let i = 0; i < 300; i++) if (aiByte(s.creatures[i], 24) === player) { total++; counts[aiByte(s.creatureControl, i * 2) & 3]++; }
      for (let i = 0; i < 3; i++) {
        const desired = aiByte(ai, 0x653 + i), actual = total ? desired === 0 ? 1000 : Math.trunc(counts[i] * 100 / total) : 0;
        deficits[i] = desired - actual;
        if (deficits[i] > best) { best = deficits[i]; role = i; }
      }
      if (role >= 3) continue;
      let threshold = aiWord(ai, 0x662); const difference = (aiDword(s.players[0], 0x616) - threshold) | 0;
      if (difference > 0) threshold += Math.trunc(difference / 2);
      if ((aiDword(raw, 0x616) | 0) >= threshold || produce(index, role as 0 | 1 | 2)) continue;
      let fallback = 3; best = -100;
      for (let i = 0; i < 3; i++) if (i !== role && deficits[i] > best) { fallback = i; best = deficits[i]; }
      if (fallback < 3) produce(index, fallback as 0 | 1 | 2);
    } else ai[0x192] = ai[0x193] = ai[0x194] = 0;
  }
  return out;
}
export function stepStrategicBuildings(before: StrategicAIState, player: number, c: StrategicBuildingContext) {
  validateStrategicAIState(before); const state = cloneStrategicAIState(before);
  return { state, receipt: planStagedStrategicBuildings(state, player, c) };
}
export const makeStrategicBuildingService = (c: StrategicBuildingContext): Pick<StrategicAIServices, "planBuildings"> => ({
  planBuildings: (s, player) => planStagedStrategicBuildings(s, player, c),
});

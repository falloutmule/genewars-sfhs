/** Complete resumable31330 grid and31560 settlement entity census. */
import { originalAngle, wrap16, type MotionTables } from "./motion";
import { worldCell } from "./terrain";
import { aiByte, aiDistance, aiDword, aiInteger, aiPoint, aiPutDword, aiPutWord, aiSByte, aiSWord,
  strategicBlueprint, type StrategicAIState, type StrategicNative } from "./strategic-ai-state";
import { strategicSettlementOffset, type StrategicBuildingContext } from "./strategic-ai-buildings";
export interface StrategicSurveyReference { kind: number; index: number }
export interface StrategicSurveyContext {
  tables: Pick<MotionTables, "atan">;
  productionWeights: StrategicBuildingContext["productionWeights"];
  buildingThreatValues: readonly (readonly [number, number, number])[];
  specialistThreatWeights: readonly number[];
  plantValues: readonly { nutrition: number; retirementDelay: number }[];
  /** Complete current source6D390 head→next chain, including other kinds. */
  cellOrder(s: StrategicAIState, cell: number): readonly StrategicSurveyReference[];
  entity(s: StrategicAIState, reference: StrategicSurveyReference): readonly (number | null)[] | null;
  /** Actual concrete virtual68, including ignored kinds6..8. No mutation/RNG. */
  protectedTarget(s: StrategicAIState, reference: StrategicSurveyReference): boolean;
}
export interface StrategicSurveyReceipt {
  routine: 0x31330; player: number; settlement: number; complete: boolean;
}
const add32 = (n: StrategicNative, p: number, v: number) => aiPutDword(n, p, aiDword(n, p) + v);
const add16 = (n: StrategicNative, p: number, v: number) => aiPutWord(n, p, aiSWord(n, p) + v);
function census(s: StrategicAIState, player: number, at: number, center: [number, number], cell: number, c: StrategicSurveyContext) {
  const ai = s.records[player];
  for (const reference of c.cellOrder(s, cell)) {
    const n = c.entity(s, reference);
    if (!n) throw Error("Actual linked strategic survey entity missing");
    const kind = aiByte(n, 6);
    if (!kind || kind === 5) continue;
    if (kind !== reference.kind || aiSWord(n, 15) !== reference.index)
      throw Error("Strategic survey entity identity differs");
    const own = aiByte(n, 24) === ai[4];
    if (c.protectedTarget(s, reference)) continue;
    if (kind === 2) {
      const value = c.plantValues[aiSByte(n, 43)];
      if (!value || !aiInteger(value.nutrition, 0, 255) || !aiInteger(value.retirementDelay, 0, 255))
        throw Error("Actual strategic plant value row required");
      add32(ai, at + 0x45, value.nutrition); add32(ai, at + 0x29, 1);
      const p = aiPoint(n, 7), angle = originalAngle(wrap16((p[0] - center[0]) * 2), wrap16((p[1] - center[1]) * 2), c.tables.atan);
      add16(ai, at + 0x2d + ((angle & 2047) >>> 8) * 2, value.retirementDelay);
    } else if (kind === 1) {
      const weights = c.productionWeights[aiSByte(n, 122)];
      if (!weights) throw Error("Actual strategic survey species weights required");
      add16(ai, at + (own ? 9 : 7), 1);
      if (own) {
        add32(ai, at + 0x17, weights[3]);
        const role = aiByte(s.creatureControl, aiSWord(n, 15) * 2) & 3;
        if (role <= 2) add32(ai, at + (role === 0 ? 0x1b : role === 1 ? 0x1f : 0x13), weights[role]);
      } else { add32(ai, at + 0xb, weights[2]); add32(ai, at + 0xf, weights[3]); }
    } else if (!own && kind === 3) {
      const blueprint = strategicBlueprint(s, reference.index), category = aiSByte(blueprint, 22), value = c.specialistThreatWeights[category];
      if (!aiInteger(value, 0, 255)) throw Error("Actual strategic specialist threat category required");
      ai[at + 4] = (ai[at + 4] + 1) & 255; add16(ai, at + 0x27, value);
    } else if (!own && kind === 4) {
      const value = c.buildingThreatValues[aiSByte(n, 45)]?.[aiByte(n, 46)];
      if (!aiInteger(value, -32768, 32767)) throw Error("Actual strategic building threat selector/grade required");
      add16(ai, at + 5, 1); add32(ai, at + 0x23, value);
    }
  }
}
/** Called inside the existing strategic transaction. mode0 grid construction
 * consumes no RNG. Source stores its CURRENT cursor at a budget stop, so the
 * boundary cell is revisited on resume; this original behavior is retained. */
export function surveyStagedStrategicSettlement(s: StrategicAIState, player: number, settlement: number, c: StrategicSurveyContext): StrategicSurveyReceipt {
  const ai = s.records[player];
  if (!ai || ai[4] !== player || ai[0x183] !== settlement) throw Error("Actual selected strategic settlement required");
  const center = aiPoint(ai, 0x188), radius = aiDword(ai, 0x18e), budget = aiByte(ai, 0x18c),
    at = strategicSettlementOffset(aiByte(ai, 0x18d));
  if (!aiInteger(radius, 0, 32767)) throw Error("Actual source settlement radius0..32767 required");
  const extent = radius >>> 8, startX = wrap16(center[0] - extent * 256), endX = wrap16(center[0] + extent * 256 + 256),
    startY = wrap16(center[1] - extent * 256), endY = wrap16(center[1] + extent * 256 + 256), square = Math.imul(radius, radius) >>> 0;
  let resume = ai[0x193] !== 0, x = resume ? aiSWord(ai, 0x184) : startX, visited = 0, traversed = 0;
  const receipt = (complete: boolean): StrategicSurveyReceipt => ({ routine: 0x31330, player, settlement, complete });
  while (x !== endX) {
    let y = resume ? aiSWord(ai, 0x186) : startY; resume = false;
    while (y !== endY) {
      if (++traversed > 65536) throw Error("Strategic survey cursor cannot reach its source bounds");
      if (aiDistance([x, y], center) <= square) {
        visited = (visited + 1) & 65535;
        census(s, player, at, center, worldCell(x, y), c);
      }
      if (visited >= budget) {
        ai[0x193] = 1; aiPutWord(ai, 0x184, x); aiPutWord(ai, 0x186, y); return receipt(false);
      }
      y = wrap16(y + 256);
    }
    x = wrap16(x + 256);
  }
  ai[0x194] = 1;
  return receipt(true);
}
export const makeStrategicSurveyService = (c: StrategicSurveyContext) => ({
  surveySettlement: (s: StrategicAIState, player: number, settlement: number) => surveyStagedStrategicSettlement(s, player, settlement, c),
});

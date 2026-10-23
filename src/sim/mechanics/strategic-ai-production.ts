/** Source36920 species selection and814A0 production command boundary.
 * The caller's Genepod is explicit instead of the source's preserved EBX. */
import { nextRandom } from "./random";
import { aiByte, aiDword, aiInteger, aiSByte, aiSWord, aiWord, cloneStrategicAIState, validateStrategicAIState, type StrategicAIState } from "./strategic-ai-state";

export interface StrategicProductionRequest {
  routine: 0x814a0;
  player: number;
  building: number;
  species: number;
  role: 0 | 1 | 2;
  command: 12;
  parameter: 1;
}
export interface StrategicProductionContext {
  speciesGenes: readonly (readonly [number, number])[];
  productionWeights: readonly (readonly [number, number, number, number, number])[];
  /** Actual814A0 input dispatch, including the real species/production handler.
   * A receipt acknowledges dispatch, not successful payment or birth. */
  requestProduction?(state: StrategicAIState, request: StrategicProductionRequest): StrategicProductionRequest;
}
export interface StrategicProductionReceipt {
  routine: 0x36920;
  player: number;
  building: number;
  role: 0 | 1 | 2;
  selectedSpecies: number | null;
  score: number;
  draws: number;
  submitted: boolean;
}
function profile(c: StrategicProductionContext) {
  if (c.speciesGenes.length !== 25 || c.productionWeights.length !== 25 ||
      c.speciesGenes.some(row => row.length !== 2 || row.some(v => !aiInteger(v, 0, 255))) ||
      c.productionWeights.some(row => row.length !== 5 || row.some(v => !aiInteger(v, 0, 255))))
    throw Error("Actual strategic production gene/weight tables required");
}
/** In-place inside the complete strategic transaction. Candidate RNG precedes
 * the final busy/disabled checks, exactly as the original caller does. */
export function requestStagedStrategicProduction(s: StrategicAIState, player: number, building: number,
  role: 0 | 1 | 2, c: StrategicProductionContext): StrategicProductionReceipt {
  profile(c);
  if (!aiInteger(player, 0, 3) || !aiInteger(building, player * 64, player * 64 + 63) || ![0, 1, 2].includes(role))
    throw Error("Actual strategic production owner/role required");
  const n = s.buildings[building], p = s.players[player], ai = s.records[player];
  if (!n || !aiByte(n, 6) || aiByte(n, 45) !== 0 || aiSWord(n, 15) !== building || aiByte(n, 24) !== player)
    throw Error("Actual owned Genepod required for strategic production");
  let best = -100000, selected: number | null = null, draws = 0;
  for (let species = 0; species < 25; species++) {
    const weight = c.productionWeights[species][role], quality = (aiDword(p, 0x61a + species * 4) | 0) >> 11;
    if (!weight || quality <= 5 || (aiByte(n, 46) === 0 && species >= 5)) continue;
    const genes = c.speciesGenes[species], a = (genes[0] << 24) >> 24, b = (genes[1] << 24) >> 24;
    const first = aiSByte(ai, 0x647 + a), second = Math.trunc(aiSByte(ai, 0x647 + b) / 2);
    const random = nextRandom(s.rng) % 20;
    draws++;
    const score = Math.imul(quality, weight + first + second + random);
    if (score > best) { best = score; selected = species; }
  }
  const out: StrategicProductionReceipt = { routine: 0x36920, player, building, role, selectedSpecies: selected, score: best, draws, submitted: false };
  const flags = aiWord(n, 49);
  if (selected === null || !(flags & 1) || flags & 0x140 || aiByte(n, 27) !== 0 || (aiDword(n, 54) | 0) > 0) return out;
  if (!c.requestProduction) throw Error("Strategic production814A0 command is not implemented");
  // Source writes the role even if the subsequent input dispatcher refuses
  // production. No payment, work timer or successful birth is synthesized.
  n[60] = role;
  const request: StrategicProductionRequest = { routine: 0x814a0, player, building, species: selected, role, command: 12, parameter: 1 },
    rng = s.rng, receipt = c.requestProduction(s, request);
  if (!receipt || Object.keys(request).some(key => receipt[key as keyof StrategicProductionRequest] !== request[key as keyof StrategicProductionRequest]))
    throw Error("Actual strategic814A0 command receipt required");
  if (s.buildings[building] !== n || s.players[player] !== p || s.records[player] !== ai || s.rng !== rng)
    throw Error("Strategic production command replaced retained native/player records");
  out.submitted = true;
  return out;
}
/** Standalone atomic entry. Nested37870 services use the staged function. */
export function stepStrategicProduction(before: StrategicAIState, player: number, building: number,
  role: 0 | 1 | 2, c: StrategicProductionContext): { state: StrategicAIState; receipt: StrategicProductionReceipt } {
  validateStrategicAIState(before);
  const state = cloneStrategicAIState(before);
  return { state, receipt: requestStagedStrategicProduction(state, player, building, role, c) };
}

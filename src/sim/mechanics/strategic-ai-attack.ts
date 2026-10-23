/**Source3BF90 recruitment thresholds, group transfers and launch sequencing. */
import { nextRandom } from "./random";
import {
  aiByte,
  aiDword,
  aiInteger,
  aiPutDword,
  aiPutWord,
  aiSByte,
  aiSWord,
  aiWord,
  cloneStrategicAIState,
  validateStrategicAIContext,
  validateStrategicAIState,
  type StrategicAIState,
} from "./strategic-ai-state";
import {
  requireStrategicGroupStep,
  strategicGroupOffset,
  type StrategicGroupStep,
} from "./strategic-ai-groups";
import {
  addStrategicCreatureToGroup,
  type StrategicCreatureContext,
} from "./strategic-ai-creatures";
import type { StrategicAIServices } from "./strategic-ai";

export interface StrategicAttackReceipt {
  routine: 0x3bf90;
  player: number;
  targetGroup: number;
  threshold: number;
  waitTicks: number | null;
  recruited: number[];
  launched: boolean;
}
/**The initial random threshold work occurs even if a self/absent/cooling group
 * later prevents launch. force=true does not skip those source RNG draws. */
export function attackStrategicGroup(
  s: StrategicAIState,
  player: number,
  targetGroup: number,
  force: boolean,
  c: StrategicCreatureContext,
  stepGroup?: StrategicGroupStep,
): StrategicAttackReceipt {
  if (
    !aiInteger(player, 0, 3) ||
    !aiInteger(targetGroup, 0, 15) ||
    typeof force !== "boolean"
  )
    throw Error("Actual strategic attack player/group/force required");
  const ai = s.records[player],
    total = aiDword(s.players[player], 0x616) | 0,
    result: StrategicAttackReceipt = {
      routine: 0x3bf90,
      player,
      targetGroup,
      threshold: ai[0x65f],
      waitTicks: null,
      recruited: [],
      launched: false,
    },
    round = ai[5];
  if (
    aiSByte(s.players[c.selectedPlayer], 0x6e7) > 10 &&
    round > 0 &&
    round % 2 === 0
  ) {
    const limit = ai[0x65f];
    if (limit === 0) throw Error("Strategic attack65F zero divisor");
    result.threshold +=
      (nextRandom(s.rng) % limit) + (round % 4 === 0 ? limit : 1);
    if (total < result.threshold) result.threshold = total;
  }
  if (force) result.threshold = total;
  const at = strategicGroupOffset(targetGroup);
  if (targetGroup === ai[4] || aiSWord(ai, at + 4) < 0) return result;
  const remaining =
    (ai[0x642] * 50 - ((aiDword(ai, 6) - aiDword(ai, 0x6b3)) >>> 0)) | 0;
  result.waitTicks = remaining > 0 ? remaining : 0;
  if (result.waitTicks !== 0) {
    ai[at + 13] |= 8;
    return result;
  }
  ai[at + 13] &= 0xf7;
  for (let i = 0; i < 300; i++) {
    if (aiSWord(ai, at + 4) >>> 0 === result.threshold >>> 0) break;
    if (aiByte(s.creatures[i], 24) !== ai[4]) continue;
    const old = aiSByte(s.creatureControl, i * 2 + 1);
    if (old < 0 || old >= 16) continue;
    const oldAt = strategicGroupOffset(old),
      kind = ai[oldAt + 9];
    if (aiSWord(ai, oldAt + 4) < 0 || kind === 0 || kind === 4) continue;
    //The literal has no active/protected filter here.3E5A0 performs its own
    //count-before-admission semantics after this unconditional source unlink.
    if (aiSByte(s.creatureControl, i * 2 + 1) === ai[oldAt + 11]) {
      aiPutWord(ai, oldAt + 4, aiWord(ai, oldAt + 4) - 1);
      s.creatureControl[i * 2 + 1] = 255;
      s.creatureControl[i * 2] = aiByte(s.creatureControl, i * 2) & 0xfb;
    }
    addStrategicCreatureToGroup(s, player, targetGroup, i, true, c);
    result.recruited.push(i);
  }
  ai[at + 13] |= 8;
  aiPutDword(ai, 0x6b3, aiDword(ai, 6));
  ai[5] = (ai[5] + 1) & 255;
  requireStrategicGroupStep(s, player, targetGroup, stepGroup);
  result.launched = true;
  return result;
}
/**Standalone atomic numeric entry; campaign adapters may use the in-place
 * function inside their complete outer host transaction. */
export function stepStrategicAttack(
  s: StrategicAIState,
  player: number,
  targetGroup: number,
  force: boolean,
  c: StrategicCreatureContext,
  stepGroup?: StrategicGroupStep,
): { state: StrategicAIState; receipt: StrategicAttackReceipt } {
  validateStrategicAIState(s);
  validateStrategicAIContext(c);
  const staged = cloneStrategicAIState(s),
    receipt = attackStrategicGroup(
      staged,
      player,
      targetGroup,
      force,
      c,
      stepGroup,
    );
  validateStrategicAIState(staged);
  return { state: staged, receipt };
}
export function makeStrategicAttackService(
  c: StrategicCreatureContext,
  stepGroup: StrategicGroupStep,
): Pick<StrategicAIServices, "planAttack"> {
  return {
    planAttack: (s, player, target, force) =>
      attackStrategicGroup(s, player, target, force, c, stepGroup),
  };
}

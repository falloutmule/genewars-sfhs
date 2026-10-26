/**35F90 registers an existing reward59 in the owner's retained AI groups.
 * It neither creates the effect nor assigns a creature. No RNG is consumed. */
import {
  aiAssertBytes,
  aiByte,
  aiInteger,
  aiPoint,
  aiSWord,
  type StrategicAIContext,
  type StrategicAIState,
} from "./strategic-ai-state";
import {
  createStrategicGroup,
  strategicGroupOffset,
} from "./strategic-ai-groups";

export function registerStrategicReward(
  s: StrategicAIState,
  effect: readonly (number | null)[],
  c: Pick<StrategicAIContext, "groupLimits">,
): number | null {
  const owner = aiByte(effect, 24);
  // Source returns before reading even the effect position or AI storage.
  if (owner === 0) return null;
  if (
    !aiInteger(owner, 1, 3) ||
    effect.length !== 81 ||
    aiByte(effect, 6) !== 5 ||
    aiByte(effect, 69) !== 59 ||
    !aiInteger(aiSWord(effect, 15), 0, 199)
  )
    throw Error("Actual nonzero-owner reward59 identity required");
  const ai = s.records[owner],
    point = aiPoint(effect, 7);
  aiAssertBytes(ai, 1726, "reward AI record");
  for (let group = 4; group < 16; group++) {
    const at = strategicGroupOffset(group);
    if (aiSWord(ai, at + 4) >= 0) continue;
    //35F90/3E270 preserve these initialized identities; never repair a prior.
    if (ai[at + 8] !== owner || ai[at + 11] !== group)
      throw Error("Reward AI group retained identity differs");
    createStrategicGroup(
      s,
      owner,
      {
        index: group,
        point,
        kind: 6,
        parameter: 1,
        zone: -1,
        flags: 9,
      },
      c,
    );
    ai[at + 12] = aiByte(effect, 15);
    return group;
  }
  // Exhausting the twelve AI groups does not fail the shared-effect factory.
  return null;
}

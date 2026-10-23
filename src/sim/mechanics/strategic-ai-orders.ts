/**3EBD0 condition evaluation and3C4A0 observation-zone group synchronization. */
import {
  aiByte,
  aiDword,
  aiInteger,
  aiPutWord,
  aiSByte,
  aiSWord,
  aiWord,
  aiPoint,
  type StrategicAIState,
  type StrategicAIContext,
} from "./strategic-ai-state";
import {
  AI_GROUP_BASE,
  strategicGroupOffset,
  createStrategicGroup,
} from "./strategic-ai-groups";

/** Actual7-byte source order. The source compares signed native fields to
 * unsigned request words; no human-friendly threshold reinterpretation. */
export function strategicOrderSatisfied(
  s: StrategicAIState,
  player: number,
  order: readonly number[],
  c: StrategicAIContext,
): boolean {
  if (order.length !== 7 || order.some((v) => !aiInteger(v, 0, 255)))
    throw Error("Actual strategic seven-byte order required");
  if (order[6] !== 0) return false;
  const kind = order[0],
    selector = order[1],
    owner = order[3],
    required = aiWord(order, 4);
  if ((kind === 0 || kind === 1 || kind === 3) && owner > 3)
    throw Error("Strategic order player binding is outside native pool");
  switch (kind) {
    case 0: {
      if (selector === 14) return aiSByte(s.players[owner], 0x4a2) >= required;
      let count = 0;
      for (let i = 0; i < 64; i++) {
        const b = s.buildings[owner * 64 + i];
        if (aiByte(b, 6) && aiSByte(b, 45) === selector)
          count = (count + 1) & 255;
      }
      return count >= required;
    }
    case 1: {
      if (selector === 25)
        return required <= (aiDword(s.players[owner], 0x616) | 0);
      let count = 0;
      for (let i = 0; i < 300; i++) {
        const n = s.creatures[i];
        if (
          aiByte(n, 6) &&
          !c.creatureProtected(s, i) &&
          aiByte(n, 24) === owner &&
          aiSByte(n, 122) === selector
        )
          count++;
      }
      return count >= required;
    }
    //Source3ED64: timer < selector*1000, not an elapsed-time>= predicate.
    case 2:
      return aiDword(s.records[player], 6) < selector * 1000;
    case 3:
      return required < (aiDword(s.players[owner], 13) | 0);
    default:
      return false;
  }
}
/**3E490 retirement retains point/type/flags and target records. The source
 * considers stored ownership/group links even for an inactive creature. */
export function retireStrategicGroup(
  s: StrategicAIState,
  player: number,
  group: number,
): void {
  const ai = s.records[player],
    at = strategicGroupOffset(group);
  for (let i = 0; i < 300; i++) {
    if (
      aiByte(s.creatures[i], 24) === aiSByte(ai, at + 8) &&
      aiSByte(s.creatureControl, i * 2 + 1) === ai[at + 11] &&
      aiSByte(s.creatureControl, i * 2 + 1) === ai[at + 11]
    ) {
      aiPutWord(ai, at + 4, aiWord(ai, at + 4) - 1);
      s.creatureControl[i * 2 + 1] = 255;
      s.creatureControl[i * 2] = aiByte(s.creatureControl, i * 2) & 0xfb;
    }
  }
  aiPutWord(ai, at + 4, 65535);
  ai[at + 10] = 0;
  ai[at + 12] = 255;
}
/**3C4A0 runs once per actual zone revision byte. Exhausted zones retire their
 * assigned group; positive quotas allocate the first free group4..15. */
export function synchronizeStrategicZones(
  s: StrategicAIState,
  player: number,
  c: StrategicAIContext,
): void {
  const ai = s.records[player],
    revision = s.missionPrefix[0x34b9];
  //Source compares signed AI6B0 with unsigned revision before storing the byte.
  if (aiSByte(ai, 0x6b0) === revision) return;
  ai[0x6b0] = revision;
  const zoneCount = s.missionPrefix[0x34b8];
  if (zoneCount > 64)
    throw Error("Strategic zone count exceeds actual64-byte scratch");
  const flags = Array<number>(64).fill(0);
  for (let group = 0; group < 16; group++) {
    const at = strategicGroupOffset(group),
      zone = aiSByte(ai, at + 12);
    if (ai[at + 9] === 5 && zone !== -1) {
      if (zone < 0 || zone >= 64)
        throw Error("Strategic group has invalid zone link");
      //Preserve OR when duplicate zone groups exist; no arbitrary tie-breaking.
      flags[zone] |= 1 | (group * 4);
    }
  }
  for (let zone = 0; zone < zoneCount; zone++)
    if ((aiDword(s.missionPrefix, 0x2ff8 + zone * 19 + 14) | 0) > 0)
      flags[zone] |= 2;
  for (let zone = 0; zone < zoneCount; zone++) {
    if ((flags[zone] & 3) === 2) {
      for (let group = 4; group < 16; group++)
        if (aiSWord(ai, strategicGroupOffset(group) + 4) < 0) {
          createStrategicGroup(
            s,
            player,
            {
              index: group,
              point: aiPoint(s.missionPrefix, 0x2ff8 + zone * 19),
              kind: 5,
              parameter: 1,
              zone,
              flags: null,
            },
            c,
          );
          break;
        }
    }
    if ((flags[zone] & 3) === 1)
      retireStrategicGroup(s, player, flags[zone] >>> 2);
  }
}

export function strategicGroupView(
  s: StrategicAIState,
  player: number,
  group: number,
) {
  const ai = s.records[player],
    at = strategicGroupOffset(group);
  return {
    id: `ai:${player}:group:${group}`,
    player,
    index: group,
    position: aiPoint(ai, at),
    count: aiSWord(ai, at + 4),
    limit: aiSWord(ai, at + 6),
    owner: ai[at + 8],
    kind: ai[at + 9],
    parameter: ai[at + 10],
    zone: aiSByte(ai, at + 12),
    flags: ai[at + 13],
    raw: ai.slice(at, at + 38),
  };
}
export const strategicGroupTableRange = {
  offset: AI_GROUP_BASE,
  stride: 38,
  count: 16,
} as const;

/**32E60/32F10/81300 numeric roster control. Actual4FD30 construction and80830
 * landing remain narrow required host services, with their complete mutations. */
import {
  aiByte,
  aiDword,
  aiInteger,
  aiPutDword,
  aiSByte,
  aiSWord,
  type StrategicAIState,
} from "./strategic-ai-state";

export interface StrategicSpecialistFactoryRequest {
  routine: 0x4fd30;
  player: number;
  slot: number;
  blueprint: number;
}
export interface StrategicLandingRequest {
  routine: 0x80830;
  player: number;
  /**Source32E60 command10: deployment1, blueprint selection-1. */
  deployment: 1;
  selection: -1;
}
export interface StrategicRecruitServices {
  createSpecialist?(
    s: StrategicAIState,
    request: StrategicSpecialistFactoryRequest,
  ): StrategicSpecialistFactoryRequest;
  createLanding?(
    s: StrategicAIState,
    request: StrategicLandingRequest,
  ): StrategicLandingRequest;
}
/**The32F10 selection score is signed skill+maximum health, not current health.
 * Healthy current health is separately required to be signed-positive. */
export function chooseStrategicBlueprint(
  s: StrategicAIState,
  player: number,
  category: number,
): number | null {
  if (!aiInteger(category, 0, 3))
    throw Error("Actual strategic specialist category required");
  const raw = s.players[player];
  if (aiSByte(raw, 3) >= 5) return null;
  let selected: number | null = null,
    score = 0;
  for (let i = 0; i < 32; i++) {
    const at = 0x16 + i * 36;
    if (
      raw[at] === 0 ||
      aiSByte(raw, at + 22) !== category ||
      aiSByte(raw, at + 26) <= 0 ||
      aiDword(raw, at + 32) & 1
    )
      continue;
    const value = aiSByte(raw, at + 23) + aiSByte(raw, at + 25);
    if (selected === null || value > score) {
      selected = i;
      score = value;
    }
  }
  return selected;
}
/**81300/81310: actual first-free player block, before4FD30 the BP active bit is
 * set. A capacity miss leaves player/BP data unchanged and returns false. */
export function recruitStrategicSpecialist(
  s: StrategicAIState,
  player: number,
  blueprint: number,
  ports: StrategicRecruitServices,
): boolean {
  if (!aiInteger(blueprint, 0, 31))
    throw Error("Actual strategic blueprint index required");
  let slot: number | null = null;
  for (let i = player * 5; i < player * 5 + 5; i++)
    if (aiByte(s.specialists[i].native, 6) === 0) {
      slot = i;
      break;
    }
  if (slot === null) return false;
  if (!ports.createSpecialist)
    throw Error("Strategic specialist4FD30 factory is not implemented");
  const raw = s.players[player],
    count = aiSByte(raw, 3),
    at = 0x16 + blueprint * 36,
    n = s.specialists[slot].native;
  if (!aiInteger(count, 0, 4))
    throw Error("Actual strategic roster append slot required");
  aiPutDword(raw, at + 32, aiDword(raw, at + 32) | 1);
  const request: StrategicSpecialistFactoryRequest = {
      routine: 0x4fd30,
      player,
      slot,
      blueprint,
    },
    receipt = ports.createSpecialist(s, request),
    binding = s.specialists[slot].blueprint;
  if (
    !receipt ||
    receipt.routine !== request.routine ||
    receipt.player !== player ||
    receipt.slot !== slot ||
    receipt.blueprint !== blueprint ||
    s.specialists[slot].native !== n ||
    aiByte(n, 6) !== 3 ||
    aiByte(n, 24) !== player ||
    aiSWord(n, 15) !== slot ||
    binding?.player !== player ||
    binding.index !== blueprint
  )
    throw Error(
      "Actual strategic4FD30 native/logical binding afterimage required",
    );
  n[112] = aiByte(n, 112) & 0xfe;
  raw[3] = count + 1;
  raw[count + 4] = aiByte(n, 15);
  return true;
}
export interface StrategicRecruitReceipt {
  routine: 0x32e60;
  player: number;
  selected: { category: number; blueprint: number; created: boolean }[];
  landingRequested: boolean;
}
/**32E60 never chooses while the actual player499 landing dword is nonzero.
 * Every selected32F10 attempt increments AI69E even on a capacity miss, and its
 * success flag requests80830. Preserve this source afterimage, not a retry fix. */
export function prepareStrategicRoster(
  s: StrategicAIState,
  player: number,
  ports: StrategicRecruitServices,
): StrategicRecruitReceipt {
  const ai = s.records[player],
    raw = s.players[player],
    selected: StrategicRecruitReceipt["selected"] = [];
  if (aiDword(raw, 0x499) === 0) {
    for (let pass = 0; pass < 5; pass++)
      for (let category = 0; category < 4; category++) {
        if (ai[0x69e + category] >= ai[0x65a + category]) continue;
        const blueprint = chooseStrategicBlueprint(s, player, category);
        if (blueprint === null) continue;
        const created = recruitStrategicSpecialist(s, player, blueprint, ports);
        ai[0x69e + category] = (ai[0x69e + category] + 1) & 255;
        selected.push({ category, blueprint, created });
      }
  }
  if (selected.length) {
    if (!ports.createLanding)
      throw Error("Strategic landing80830 factory is not implemented");
    const request: StrategicLandingRequest = {
        routine: 0x80830,
        player,
        deployment: 1,
        selection: -1,
      },
      receipt = ports.createLanding(s, request);
    if (
      !receipt ||
      receipt.routine !== request.routine ||
      receipt.player !== player ||
      receipt.deployment !== 1 ||
      receipt.selection !== -1
    )
      throw Error("Actual strategic80830 landing receipt required");
  }
  return {
    routine: 0x32e60,
    player,
    selected,
    landingRequested: selected.length > 0,
  };
}

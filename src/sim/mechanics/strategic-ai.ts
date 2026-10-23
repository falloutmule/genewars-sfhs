/**70B00/37870 strategic dispatch and complete bounded numeric initialization.
 * Concrete planning/role routines remain required ports until their complete
 * source families are installed. An absent port rejects the whole transaction. */
import {
  aiByte,
  aiDword,
  aiInteger,
  aiPutDword,
  aiSByte,
  aiSWord,
  aiWord,
  aiPoint,
  cloneStrategicAIState,
  strategicBlueprint,
  validateStrategicAIContext,
  validateStrategicAIState,
  type StrategicAIContext,
  type StrategicAIEvent,
  type StrategicAIState,
} from "./strategic-ai-state";
import {
  createStrategicGroup,
  initializeStrategicBuildings,
  initializeStrategicCreatures,
  refreshStrategicPlayerGroup,
  stepStrategicGroupCadence,
  strategicGroupOffset,
  type StrategicGroupStep,
} from "./strategic-ai-groups";
import {
  strategicOrderSatisfied,
  synchronizeStrategicZones,
} from "./strategic-ai-orders";
import {
  prepareStrategicRoster,
  type StrategicRecruitServices,
} from "./strategic-ai-recruit";
export * from "./strategic-ai-state";
export * from "./strategic-ai-groups";
export * from "./strategic-ai-orders";
export * from "./strategic-ai-recruit";

export type StrategicRequiredRoutine =
  | 0x32e60
  | 0x35820
  | 0x35730
  | 0x360b0
  | 0x3bf90
  | 0x33f60;
export interface StrategicServiceReceipt {
  routine: StrategicRequiredRoutine;
  player: number;
}
export interface StrategicAIServices extends StrategicRecruitServices {
  /** Source35820: group member feeding/attack target decisions. */
  directCreatures?(
    state: StrategicAIState,
    player: number,
  ): StrategicServiceReceipt;
  /** Source35730: unassigned creature allocation and busy flag maintenance. */
  allocateCreatures?(
    state: StrategicAIState,
    player: number,
  ): StrategicServiceReceipt;
  /** Source360B0: completed Genepod results, production and build planning. */
  planBuildings?(
    state: StrategicAIState,
    player: number,
  ): StrategicServiceReceipt;
  /** Source3BF90(ai,0), caller BL=0: attack-group recruitment/launch. */
  planAttack?(
    state: StrategicAIState,
    player: number,
    targetPlayer: 0,
    force: false,
  ): StrategicServiceReceipt;
  /** Source33F60: real Engineer/Shepherd/Geneticist/Botanist commands. */
  planSpecialists?(
    state: StrategicAIState,
    player: number,
  ): StrategicServiceReceipt;
  stepGroup?: StrategicGroupStep;
}
function service(
  s: StrategicAIState,
  player: number,
  routine: StrategicRequiredRoutine,
  run: (() => StrategicServiceReceipt) | undefined,
  events: StrategicAIEvent[],
): void {
  if (!run)
    throw Error(
      `Strategic AI${routine.toString(16).toUpperCase()} service is not implemented`,
    );
  const rows = s.records.slice(),
    players = s.players.slice(),
    creatures = s.creatures.slice(),
    buildings = s.buildings.slice(),
    specialists = s.specialists.map((u) => u.native),
    control = s.creatureControl,
    prefix = s.missionPrefix,
    rng = s.rng,
    receipt = run();
  if (receipt?.routine !== routine || receipt.player !== player)
    throw Error(
      `Actual strategic${routine.toString(16).toUpperCase()} receipt required`,
    );
  if (
    rows.some((r, i) => s.records[i] !== r) ||
    players.some((r, i) => s.players[i] !== r) ||
    creatures.some((r, i) => s.creatures[i] !== r) ||
    buildings.some((r, i) => s.buildings[i] !== r) ||
    specialists.some((r, i) => s.specialists[i]?.native !== r) ||
    s.creatureControl !== control ||
    s.missionPrefix !== prefix ||
    s.rng !== rng
  )
    throw Error(
      "Strategic services must preserve retained native/player identities",
    );
  events.push({ routine, player, kind: "required-service-applied" });
}
/**37690 retains the real32E60 prerequisite. Marker6 records are64×8 bytes at
 * mission1C9E, with low3 owner/high5 group kind in byte6. */
export function initializeStrategicOrders(
  s: StrategicAIState,
  player: number,
  c: StrategicAIContext,
  ports: StrategicAIServices,
  events: StrategicAIEvent[],
): void {
  const ai = s.records[player];
  if (ai[0x6ae] & 2) return;
  service(
    s,
    player,
    0x32e60,
    () => prepareStrategicRoster(s, player, ports),
    events,
  );
  ai[0x6b1] = 0;
  for (let i = 0; i < 4; i++) ai[0x6b1] = (ai[0x6b1] + ai[0x65a + i]) & 255;
  for (let i = 0; i < 64; i++) {
    const at = 0x1c9e + i * 8,
      marker = s.missionPrefix;
    if (marker[at + 4] !== 6 || (marker[at + 6] & 7) !== player) continue;
    createStrategicGroup(
      s,
      player,
      {
        index: aiSByte(marker, at + 5),
        point: aiPoint(marker, at),
        kind: marker[at + 6] >>> 3,
        //Literal37690 retains EBX=owner as constructor parameter, not a constant1.
        parameter: player,
        zone: -1,
        flags: null,
      },
      c,
    );
  }
  refreshStrategicPlayerGroup(s, player, player, c);
  ai[0x6ae] |= 2;
}
function roster(s: StrategicAIState, player: number): number[] {
  const raw = s.players[player],
    count = aiSByte(raw, 3),
    result: number[] = [];
  if (count < 0) return result;
  if (count > 5)
    throw Error("Actual strategic player roster exceeds five source slots");
  for (let i = 0; i < count; i++) {
    const index = aiSByte(raw, 4 + i);
    if (!aiInteger(index, 0, 19))
      throw Error("Strategic roster has invalid specialist index");
    const n = s.specialists[index].native;
    if (aiSWord(n, 15) !== index || aiByte(n, 24) !== player)
      throw Error("Strategic roster specialist identity differs");
    strategicBlueprint(s, index);
    result.push(index);
  }
  return result;
}
/**37870's post-planner bookkeeping consumes actual pool/blueprint records. */
export function maintainStrategicReservations(
  s: StrategicAIState,
  player: number,
): void {
  const ai = s.records[player];
  for (let i = 0; i < 64; i++)
    if (!aiByte(s.buildings[player * 64 + i], 6)) ai[0x55 + i] = 0;
  for (let i = 0; i < 14; i++) {
    const at = 14 + i * 4,
      n = aiDword(ai, at) | 0;
    if (n > 0) aiPutDword(ai, at, n - 10);
  }
  for (let selector = 0; selector < 14; selector++)
    if (ai[0x47 + selector]) {
      let found = false;
      for (const index of roster(s, player))
        if (
          strategicBlueprint(s, index)[22] === 0 &&
          aiByte(s.specialists[index].native, 131) === selector
        )
          found = true;
      if (!found) ai[0x47 + selector] = 0;
    }
}
/**37870 phase timer uses unsigned wrapped elapsed values and an unsigned
 * short preview interval. Setting639 alone is a real intermediate afterimage. */
export function advanceStrategicAttackPhase(
  s: StrategicAIState,
  player: number,
): void {
  const ai = s.records[player];
  if (ai[0x95] <= 1) return;
  const elapsed = (aiDword(ai, 6) - aiDword(ai, 0x97)) >>> 0,
    threshold = aiDword(ai, 0x635);
  if ((elapsed + aiWord(ai, 0x63a)) >>> 0 < threshold) return;
  ai[0x639] = 1;
  const next = ai[0x6bd] < ai[0x95] ? (ai[0x6bd] + 1) & 255 : 1;
  if (elapsed < threshold || next === ai[0x6bd]) return;
  ai[0x639] = 0;
  ai[0x6bd] = next;
  aiPutDword(ai, 0x97, aiDword(ai, 6));
}
/**One source37870 call inside an already isolated world. */
export function stepStagedStrategicPlayer(
  s: StrategicAIState,
  player: number,
  c: StrategicAIContext,
  ports: StrategicAIServices,
  events: StrategicAIEvent[] = [],
): StrategicAIEvent[] {
  if (!aiInteger(player, 0, 3)) throw Error("Actual strategic player required");
  if (s.players[player][2] === 0) return events;
  const ai = s.records[player];
  aiPutDword(ai, 6, aiDword(ai, 6) + 1);
  if (!(ai[0x6ae] & 1)) {
    initializeStrategicBuildings(s, player);
    events.push({ routine: 0x37540, player, kind: "building-initialization" });
  }
  if (!(ai[0x6ae] & 4)) {
    initializeStrategicCreatures(s, player, c);
    events.push({ routine: 0x37770, player, kind: "creature-initialization" });
  }
  stepStrategicGroupCadence(s, player, c, ports.stepGroup, events);
  if (!(c.frame & 31))
    service(
      s,
      player,
      0x35820,
      ports.directCreatures && (() => ports.directCreatures!(s, player)),
      events,
    );
  if (c.frame % 10) return events;
  service(
    s,
    player,
    0x35730,
    ports.allocateCreatures && (() => ports.allocateCreatures!(s, player)),
    events,
  );
  if (aiWord(s.missionPrefix, 0x1eb1 + player * 2) * 100 > aiDword(ai, 6))
    return events;
  //The source reads ready blueprint flags into its five-entry temporary list
  //even though no later numeric instruction in37870 consumes that temporary.
  for (const index of roster(s, player))
    aiDword(strategicBlueprint(s, index), 32);
  if (!(ai[0x6ae] & 2)) initializeStrategicOrders(s, player, c, ports, events);
  service(
    s,
    player,
    0x360b0,
    ports.planBuildings && (() => ports.planBuildings!(s, player)),
    events,
  );
  for (let i = 0; i < 8; i++) {
    const order = ai.slice(0x666 + i * 7, 0x66d + i * 7);
    if (order[0] === 4 || !strategicOrderSatisfied(s, player, order, c))
      continue;
    if (!(c.activePlayerCount > 0 && ai[0x6af] & 1)) {
      refreshStrategicPlayerGroup(s, player, 0, c);
      if (c.activePlayerCount > 0) ai[0x6af] |= 1;
    }
  }
  for (let target = 0; target < c.activePlayerCount; target++) {
    //CMP sign-extends player count but zero-extends the retained AI byte.
    if (aiSByte(s.players[target], 0x4a2) === ai[0x607 + target]) continue;
    ai[0x607 + target] = s.players[target][0x4a2];
    if (aiSWord(ai, strategicGroupOffset(target) + 4) >= 0)
      refreshStrategicPlayerGroup(s, player, target, c);
  }
  service(
    s,
    player,
    0x3bf90,
    ports.planAttack && (() => ports.planAttack!(s, player, 0, false)),
    events,
  );
  maintainStrategicReservations(s, player);
  service(
    s,
    player,
    0x33f60,
    ports.planSpecialists && (() => ports.planSpecialists!(s, player)),
    events,
  );
  synchronizeStrategicZones(s, player, c);
  advanceStrategicAttackPhase(s, player);
  return events;
}
/**Exact70B00 gates and ascending active players. A later failed provider leaves
 * every original AI/player/pool/prefix/RNG byte unchanged. */
export function stepStrategicAI(
  s: StrategicAIState,
  c: StrategicAIContext,
  ports: StrategicAIServices = {},
): { state: StrategicAIState; events: StrategicAIEvent[] } {
  validateStrategicAIState(s);
  validateStrategicAIContext(c);
  const staged = cloneStrategicAIState(s),
    events: StrategicAIEvent[] = [];
  if (c.flags & 4 && !(c.runtimeMode & 2))
    for (let player = 0; player < c.activePlayerCount; player++)
      if (staged.players[player][2])
        stepStagedStrategicPlayer(staged, player, c, ports, events);
  validateStrategicAIState(staged);
  return { state: staged, events };
}

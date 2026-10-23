/**Source specialist planner packets. Unwritten stack bytes remain explicit. */
import {
  aiByte,
  aiInteger,
  aiPutWord,
  aiSWord,
  cloneStrategicAIState,
  type StrategicAIState,
} from "./strategic-ai-state";
export type StrategicSpecialistPacket = (number | null)[];
export interface StrategicSpecialistPlannerState extends StrategicAIState {
  /**Effective AI9C cache images; null marks an unwritten source stack byte.
   * The numeric AI image keeps its opaque prior carrier at those bytes. */
  specialistPlanner?: {
    schemaVersion: 1;
    commandCaches: StrategicSpecialistPacket[];
  };
}
export interface StrategicRoleCommand {
  routine: 0x80fc0 | 0x81080 | 0x81150 | 0x811a0;
  source: number;
  player: number;
  specialist: number;
  packet: StrategicSpecialistPacket;
}
export interface StrategicRoleCommandReceipt {
  routine: StrategicRoleCommand["routine"];
  player: number;
  specialist: number;
  outcome: "installed" | "ignored";
}
export interface StrategicRoleCommandContext {
  command?(
    s: StrategicSpecialistPlannerState,
    request: StrategicRoleCommand,
  ): StrategicRoleCommandReceipt;
  /**Optional explicit caller scratch image, used only for otherwise unwritten
   * packet bytes. Absence retains null; it never supplies a zero default. */
  packetPrior?(
    s: StrategicSpecialistPlannerState,
    source: number,
  ): readonly (number | null)[];
}
export function validateStrategicPlannerMetadata(
  s: StrategicSpecialistPlannerState,
): void {
  const p = s.specialistPlanner;
  if (!p) return;
  if (
    p.schemaVersion !== 1 ||
    p.commandCaches.length !== 4 ||
    p.commandCaches.some(
      (r) =>
        r.length !== 55 || r.some((v) => v !== null && !aiInteger(v, 0, 255)),
    )
  )
    throw Error("Actual specialist planner cache extent required");
  for (let owner = 0; owner < 4; owner++)
    for (let i = 0; i < 55; i++) {
      const v = p.commandCaches[owner][i];
      if (v !== null && v !== s.records[owner][0x9c + i])
        throw Error(
          "Specialist planner effective cache differs from numeric carrier",
        );
    }
}
export function cloneStrategicSpecialistPlanner(
  s: StrategicSpecialistPlannerState,
): StrategicSpecialistPlannerState {
  return {
    ...cloneStrategicAIState(s),
    ...(s.specialistPlanner
      ? {
          specialistPlanner: {
            schemaVersion: 1 as const,
            commandCaches: s.specialistPlanner.commandCaches.map((r) =>
              r.slice(),
            ),
          },
        }
      : {}),
  };
}
export function specialistLocalIndex(
  s: StrategicAIState,
  specialist: number,
): number {
  if (
    !aiInteger(specialist, 0, 19) ||
    aiSWord(s.specialists[specialist].native, 15) !== specialist
  )
    throw Error("Actual strategic specialist native identity required");
  return specialist % 5;
}
/**Known word writes are supplied by the independently expressed caller. */
export function strategicRolePacket(
  s: StrategicSpecialistPlannerState,
  c: StrategicRoleCommandContext,
  source: number,
  words: Readonly<Record<number, number>>,
  code: number,
): StrategicSpecialistPacket {
  const prior = c.packetPrior?.(s, source);
  if (
    prior &&
    (prior.length !== 11 ||
      prior.some((v) => v !== null && !aiInteger(v, 0, 255)))
  )
    throw Error("Actual source command scratch extent required");
  const result: StrategicSpecialistPacket = prior
    ? Array.from(prior)
    : Array(11).fill(null);
  for (const [key, value] of Object.entries(words)) {
    const offset = Number(key);
    if (!aiInteger(offset, 0, 8) || offset % 2 || !Number.isInteger(value))
      throw Error("Actual source role packet word required");
    aiPutWord(result, offset, value);
  }
  if (!aiInteger(code, 0, 255))
    throw Error("Actual source role command code required");
  result[10] = code;
  return result;
}
export function cacheStrategicRolePacket(
  s: StrategicSpecialistPlannerState,
  player: number,
  specialist: number,
  packet: StrategicSpecialistPacket,
): void {
  const local = specialistLocalIndex(s, specialist);
  if (
    !aiInteger(player, 0, 3) ||
    packet.length !== 11 ||
    packet.some((v) => v !== null && !aiInteger(v, 0, 255))
  )
    throw Error("Actual source role cache image required");
  if (!s.specialistPlanner)
    s.specialistPlanner = {
      schemaVersion: 1,
      commandCaches: s.records.map((r) => r.slice(0x9c, 0x9c + 55)),
    };
  const image = s.specialistPlanner.commandCaches[player],
    at = local * 11;
  for (let i = 0; i < 11; i++) {
    image[at + i] = packet[i];
    if (packet[i] !== null) s.records[player][0x9c + at + i] = packet[i]!;
  }
}
export function issueStrategicRoleCommand(
  s: StrategicSpecialistPlannerState,
  c: StrategicRoleCommandContext,
  request: StrategicRoleCommand,
  cache = false,
): void {
  const held = s.specialists[request.specialist].native,
    ai = s.records[request.player];
  specialistLocalIndex(s, request.specialist);
  //Only semantic command fields are required. Null in an unconsumed word is
  //allowed and must not be reinterpreted by a command adapter as zero.
  if (
    request.packet.length !== 11 ||
    request.packet.some((v) => v !== null && !aiInteger(v, 0, 255))
  )
    throw Error("Actual strategic role command image required");
  aiByte(request.packet, 10);
  if (!c.command)
    throw Error(
      `Strategic specialist${request.routine.toString(16)} role command is not implemented`,
    );
  if (cache)
    cacheStrategicRolePacket(
      s,
      request.player,
      request.specialist,
      request.packet,
    );
  const result = c.command(s, request);
  if (
    result?.routine !== request.routine ||
    result.player !== request.player ||
    result.specialist !== request.specialist ||
    !["installed", "ignored"].includes(result.outcome) ||
    s.specialists[request.specialist].native !== held ||
    s.records[request.player] !== ai
  )
    throw Error("Actual strategic specialist role command receipt required");
}

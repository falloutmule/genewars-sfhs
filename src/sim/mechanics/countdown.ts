/** Source13780 timer prefix and ordered expiry requests. */
export interface CountdownTransition {
  before: number;
  after: number;
  started: boolean;
  expired: boolean;
}
export interface CountdownInput {
  count: number;
  period: number;
  progress: number;
  playerByte607: number;
  runtimeFlags: number;
  activeSelector0: boolean;
}
export type CountdownPresentation =
  | { type: "start-narration"; selectedPlayer: number }
  | { type: "expiry-effect3a"; selectedPlayer: number }
  | { type: "expiry-narration"; selectedPlayer: number }
  | { type: "reset-ui-byte" }
  | {
      type: "advance-ui-animation";
      descriptorOffset: number;
      stateAddress: number;
    };
export interface CountdownSpawn {
  owner: number;
  selector: 0;
  position: [number, number];
  initialHeight: number;
}
const integer = (v: number, min: number, max: number) =>
  Number.isInteger(v) && v >= min && v <= max;
export function countdownTransition(
  input: CountdownInput,
): CountdownTransition {
  const { count, period, playerByte607, runtimeFlags, activeSelector0 } = input,
    progress = (input.progress << 24) >> 24;
  if (
    !integer(count, 0, 65535) ||
    !integer(period, 0, 65535) ||
    !integer(input.progress, -128, 255) ||
    !integer(playerByte607, 0, 255) ||
    !integer(runtimeFlags, 0, 255)
  )
    throw new Error("Invalid source countdown context");
  const special = progress === 14 || progress === 20;
  if (count === 0) {
    if (activeSelector0)
      return { before: count, after: 0, started: false, expired: false };
    return {
      before: count,
      after: special ? 3000 : runtimeFlags & 0xc0 ? 65535 : period,
      started: true,
      expired: false,
    };
  }
  const decrement = special ? playerByte607 !== 0 : count !== 65535,
    after = decrement ? count - 1 : count;
  return {
    before: count,
    after,
    started: false,
    expired: decrement && after === 0,
  };
}
export function countdownPresentation(
  transition: CountdownTransition,
  selectedPlayer: number,
): CountdownPresentation[] {
  if (!integer(selectedPlayer, 0, 3))
    throw new Error("Invalid countdown selected player");
  return transition.started
    ? [{ type: "start-narration", selectedPlayer }, { type: "reset-ui-byte" }]
    : transition.expired
      ? [
          { type: "expiry-effect3a", selectedPlayer },
          { type: "expiry-effect3a", selectedPlayer },
          { type: "expiry-narration", selectedPlayer },
        ]
      : [];
}
export function countdownAnimationRequests(): CountdownPresentation[] {
  return Array.from({ length: 8 }, (_, i) => ({
    type: "advance-ui-animation",
    descriptorOffset: i === 0 ? 0x15e : 0x118 + (i - 1) * 10,
    stateAddress: i === 0 ? 0x184d04 : 0x184d0c + (i - 1) * 5,
  }));
}
/** Caller enters only for a transition tozero. Player gating is source6E3,
 * position depends on signed building-count4A2; no replacement starts. */
export function countdownExpiryRequests(
  players: readonly (readonly number[])[],
  height: (point: [number, number]) => number,
): CountdownSpawn[] {
  if (players.length > 4)
    throw new Error("Countdown expiry supports at most4players");
  const out: CountdownSpawn[] = [];
  for (const [owner, raw] of players.entries()) {
    if (raw.length !== 1805 || raw.some((v) => !integer(v, 0, 255)))
      throw new Error("Countdown player source record is invalid");
    if (raw[0x6e3] !== 0) continue;
    const at = (raw[0x4a2] << 24) >> 24 > 0 ? 0x5fc : 9,
      word = (p: number) => ((raw[p] | (raw[p + 1] << 8)) << 16) >> 16,
      position: [number, number] = [word(at), word(at + 2)],
      ground = height(position);
    if (!integer(ground, -65536, 65534))
      throw new Error("Countdown height sample is outside source bounds");
    out.push({
      owner,
      selector: 0,
      position,
      initialHeight: (ground + 0x6400) | 0,
    });
  }
  return out;
}

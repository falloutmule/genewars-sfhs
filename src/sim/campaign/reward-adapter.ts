/** Campaign ports for source59/0x3B reward factory and4F7C0 target scan.
 * The effect mechanic consumes scan RNG; this adapter consumes none.
 */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { SourceEntityId } from "./source-pools";
import { validateSpatial } from "./spatial";
import { worldCell } from "../mechanics/terrain";
import { effectPriorByte } from "../mechanics/power-motion";
import { requestAudio } from "../mechanics/audio";
import {
  rewardTargetDistance,
  type RewardTarget,
  type RewardQuery,
  type RewardEvent,
} from "../mechanics/reward-effect";
import {
  createCampaignRewardEffect,
  type EffectSchedulerOptions,
} from "./effect-scheduler";

type TargetWorld = Pick<
  CampaignWorld,
  "spatial" | "actors" | "players" | "creatureNative" | "ecology"
>;
const byte = effectPriorByte;
const word = (n: readonly (number | null)[], p: number) =>
  ((byte(n, p) | (byte(n, p + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], p: number) =>
  byte(n, p) |
  (byte(n, p + 1) << 8) |
  (byte(n, p + 2) << 16) |
  (byte(n, p + 3) << 24);
function integer(v: number, lo: number, hi: number, label: string): void {
  if (!Number.isInteger(v) || v < lo || v > hi)
    throw Error("Invalid source reward " + label);
}
export interface CampaignRewardQueryVisit {
  point: [number, number];
  cell: number;
  id: SourceEntityId;
  admitted: boolean;
  distance: number | null;
  selected: boolean;
}
export interface CampaignRewardTargetReceipt {
  target: RewardTarget | null;
  visits: CampaignRewardQueryVisit[];
}
/** Actual1F270/1F260 getters, not sprite dimensions. The returned blueprint
 * or creature native is a mutable view of the enclosing staged world.
 */
function target(
  w: TargetWorld,
  id: SourceEntityId,
  family: number,
  index: number,
): RewardTarget | null {
  if (family === 0) {
    const native =
      w.ecology.mules.find((m) => m.index === index)?.native ??
      w.creatureNative[index];
    if (!native || native.length !== 124 || byte(native, 6) !== 1)
      throw Error("Reward spatial creature/native identity differs");
    const owner = byte(native, 24);
    if (owner === 4) return null;
    integer(owner, 0, 3, "creature owner");
    const height = dword(native, 39);
    return {
      id,
      kind: 1,
      owner,
      native,
      position: [word(native, 7), word(native, 9)],
      height,
      visualHeight: (height - dword(native, 17)) | 0,
    };
  }
  if (family !== 2) return null;
  const actor = w.actors.find((a) => a.sourceId === id);
  if (!actor || actor.id !== index)
    throw Error("Reward spatial specialist host is missing");
  integer(actor.owner, 0, 3, "specialist owner");
  const player = w.players[actor.owner],
    blueprint = player?.blueprints.find(
      (b) => b.index === actor.blueprintIndex,
    );
  if (!blueprint) throw Error("Reward specialist blueprint binding is missing");
  for (const value of [actor.motion.x, actor.motion.y])
    integer(value, -32768, 32767, "specialist coordinate");
  integer(
    actor.motion.height,
    -2147483648,
    2147483647,
    "specialist physical height",
  );
  integer(
    actor.motion.ground,
    -2147483648,
    2147483647,
    "specialist ground height",
  );
  return {
    id,
    kind: 3,
    owner: actor.owner,
    blueprint,
    position: [actor.motion.x, actor.motion.y],
    height: actor.motion.height,
    visualHeight: (actor.motion.height - actor.motion.ground) | 0,
  };
}
/** Source8D930 calls4F7C0 once per planned point: X-outer/Y-inner scan,
 * then that actual map head→next chain. No owner/health/ready/cap preference
 * precedes nearest selection; only neutral creatures are excluded.
 */
export function queryCampaignRewardTarget(
  w: TargetWorld,
  native: readonly (number | null)[],
  query: RewardQuery,
): CampaignRewardTargetReceipt {
  if (native.length !== 81 || byte(native, 6) !== 5 || byte(native, 69) !== 59)
    throw Error("Source reward target query needs live59/0x3B effect");
  validateSpatial(w.spatial);
  if (
    query.center[0] !== word(native, 7) ||
    query.center[1] !== word(native, 9) ||
    ![256, -256].includes(query.stepX) ||
    ![256, -256].includes(query.stepY) ||
    query.points.length !== 5
  )
    throw Error("Source reward8D7B0 query plan differs");
  const wrap = (v: number) => (v << 16) >> 16,
    [x, y] = query.center,
    expected = [
      [wrap(x - query.stepX), y],
      [x, wrap(y - query.stepY)],
      [x, y],
      [x, wrap(y + query.stepY)],
      [wrap(x + query.stepX), y],
    ];
  if (JSON.stringify(query.points) !== JSON.stringify(expected))
    throw Error("Source reward8D930 point order differs");
  const visits: CampaignRewardQueryVisit[] = [],
    seenPoints = new Set<number>();
  let best = 0x7fffffff,
    nearest: RewardTarget | null = null;
  for (const point of query.points) {
    point.forEach((v) => integer(v, -32768, 32767, "scan coordinate"));
    const cell = worldCell(...point);
    if (seenPoints.has(cell)) throw Error("Duplicate source reward scan cell");
    seenPoints.add(cell);
    let id = w.spatial.heads[cell];
    while (id) {
      const node = w.spatial.nodes[id],
        candidate = target(w, id, node.family, node.index),
        distance = candidate ? rewardTargetDistance(native, candidate) : null,
        selected = distance !== null && distance <= 65536 && distance < best;
      visits.push({
        point: [...point],
        cell,
        id,
        admitted: candidate !== null,
        distance,
        selected,
      });
      if (selected) {
        nearest = candidate;
        best = distance!;
      }
      id = node.next;
    }
  }
  return { target: nearest, visits };
}
export function campaignRewardTarget(
  w: TargetWorld,
  native: readonly (number | null)[],
  query: RewardQuery,
): RewardTarget | null {
  return queryCampaignRewardTarget(w, native, query).target;
}
export interface CampaignRewardPorts<W extends CampaignWorld = CampaignWorld> {
  /** Actual35F90 AI order service, required only for owner!=0. The current
   * host has no admitted1831BC+owner*6BE AI-prior pool; it is never zero-filled.
   */
  registerAI?: (staged: W, slot: number) => void;
  /** Ordered presentation services:98210 audio adjustment,76620 cues and
   *981D3/41CE0 research message. Required when one of those events occurs.
   */
  presentation?: (staged: W, slot: number, event: RewardEvent) => void;
  onQuery?: (staged: W, receipt: CampaignRewardTargetReceipt) => void;
}
function syncSpecialist(
  w: CampaignWorld,
  event: Extract<RewardEvent, { type: "specialist-improved" }>,
): void {
  const actor = w.actors.find((a) => a.sourceId === event.target),
    player = actor ? w.players[actor.owner] : null,
    b = actor
      ? player?.blueprints.find((b) => b.index === actor.blueprintIndex)
      : null;
  if (!actor || !player || !b)
    throw Error("Reward improved specialist binding disappeared");
  if (
    b.skill !== event.skill ||
    b.maxHealth !== event.health ||
    b.health !== event.health
  )
    throw Error("Reward specialist receipt differs from staged blueprint");
  const at = 0x16 + b.index * 36;
  player.raw[at + 0x17] = b.skill & 255;
  player.raw[at + 0x19] = b.maxHealth & 255;
  player.raw[at + 0x1a] = b.health & 255;
  // Construction's normalized cache reads the same source blueprint field.
  for (const builder of w.builders)
    if (builder.id === actor.id) builder.skill = b.skill;
}
/** Compose these hooks with root scheduler ports. cloneEffectHost already
 * clones actors/players/ecology; this adds native aliases and derived caches.
 * Presentation hooks receive staged data, so failures roll back the pass.
 */
export function createRewardSchedulerOptions<W extends CampaignWorld>(
  pack: Pack,
  base: EffectSchedulerOptions<W>,
  ports: CampaignRewardPorts<W> = {},
): EffectSchedulerOptions<W> {
  const tables = pack.rules?.tables;
  if (
    !tables ||
    tables.blueprintStat17Caps.length !== 4 ||
    tables.blueprintStat19Caps.length !== 4
  )
    throw Error("Original reward blueprint caps missing");
  return {
    ...base,
    stageHost(original, staged) {
      base.stageHost?.(original, staged);
      staged.creatureNative = original.creatureNative.map((n) => n.slice());
      for (const mule of staged.ecology.mules)
        staged.creatureNative[mule.index] = mule.native;
    },
    commitHost(original, staged) {
      base.commitHost?.(original, staged);
      original.creatureNative = staged.creatureNative;
    },
    rewardTarget(staged, native, query) {
      const receipt = queryCampaignRewardTarget(staged, native, query);
      ports.onQuery?.(staged, receipt);
      return receipt.target;
    },
    onRewardFactory(staged, slot) {
      const n = staged.powerEffects.slots[slot]?.nativePrior;
      if (!n || byte(n, 6) !== 5 || byte(n, 69) !== 59)
        throw Error(
          "Reward registration requires current source factory record",
        );
      if (byte(n, 24) !== 0) {
        const register = ports.registerAI ?? base.onRewardFactory;
        if (!register)
          throw Error(
            "Source reward35F90 AI registration prior/service required for nonzero owner",
          );
        register(staged, slot);
      }
    },
    onRewardEvent(staged, slot, event) {
      const entity = `source:4:${slot}`;
      if (event.type === "audio" || event.type === "stop-if-playing")
        requestAudio(staged.audio, {
          frame: staged.frame,
          entity,
          cue: event.channel,
          mode: event.mode,
          parameter: event.type === "audio" ? event.parameter : 0,
          range: null,
          ...(event.type === "audio"
            ? { initialRatePercent: event.ratePercent }
            : {}),
          gain: event.type === "audio" ? event.volume / 127 : 1,
        });
      if (event.type === "specialist-improved") syncSpecialist(staged, event);
      if (
        ["adjust-audio", "selected-player-cue", "research-message"].includes(
          event.type,
        )
      ) {
        if (!ports.presentation && !base.onRewardEvent)
          throw Error(
            "Source reward presentation service required: " + event.type,
          );
        ports.presentation?.(staged, slot, event);
      }
      base.onRewardEvent?.(staged, slot, event);
    },
  };
}
export function createCampaignReward<W extends CampaignWorld>(
  w: W,
  request: Parameters<typeof createCampaignRewardEffect>[1],
  pack: Pack,
  base: EffectSchedulerOptions<W>,
  ports: CampaignRewardPorts<W> = {},
): number | null {
  return createCampaignRewardEffect(
    w,
    request,
    pack,
    createRewardSchedulerOptions(pack, base, ports),
  );
}

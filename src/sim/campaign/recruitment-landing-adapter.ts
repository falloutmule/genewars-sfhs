/**Actual49/0x31 recruitment return identity and64/0x40 marker lifecycle. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  makeRecruitmentEffect,
  planRecruitmentLandingReturn,
  stepRecruitmentEffectRecord,
  validateRecruitmentDescriptor,
  type RecruitmentEffectRequest,
  type RecruitmentEffectUpdate,
} from "../mechanics/recruitment-effect";
import { createLanding } from "../mechanics/landing";
import { animationProfile } from "../mechanics/animation";
import { putEffectDword, putEffectWord } from "../mechanics/power-motion";
import { requestAudio } from "../mechanics/audio";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
  type EffectSchedulerOptions,
  type EffectSchedulerReceipt,
} from "./effect-scheduler";
import { synchronizeCampaignLinks } from "./entity-view";
import { createStagedCampaignWater } from "./geneticist-effect-adapter";
import { i16, u32 } from "./bytes";
import { groundHeight } from "../mechanics/terrain";
import { revealCampaignRadius } from "./reveal-adapter";

export interface CampaignRecruitmentLandingRequest {
  owner: number;
  position: [number, number];
  height: number;
  parameter: 0 | 1;
  parentBuilding: number | null;
}
export interface CampaignRecruitmentLandingReceipt {
  allocatedSlot: number;
  returned: { slot: number; kind: number };
}
function publish(
  w: CampaignWorld,
  slot: number,
  n: readonly (number | null)[],
) {
  const held = w.powerEffects.slots[slot].nativePrior!;
  publishStagedSharedEffect(w, slot, n);
  held.splice(0, 81, ...w.powerEffects.slots[slot].nativePrior!);
  w.powerEffects.slots[slot].nativePrior = held;
  synchronizeCampaignLinks(w);
}
/**The caller owns80830 prefix/raw496/498/reveal and its full transaction.
 * Capacity false precedes resources/parent reads, as in48790. */
export function createStagedCampaignRecruitmentLanding(
  w: CampaignWorld,
  q: CampaignRecruitmentLandingRequest,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out?: EffectSchedulerReceipt,
): CampaignRecruitmentLandingReceipt | null {
  const heldPriors = w.powerEffects.slots.map((p) => p.nativePrior),
    slot = allocateStagedSharedEffect(w, 49, pack, options, out);
  if (slot === null) return null;
  if (
    !Number.isInteger(q.owner) ||
    q.owner < 0 ||
    q.owner > 3 ||
    q.position.length !== 2 ||
    q.position.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767) ||
    !Number.isInteger(q.height) ||
    q.height < -2147483648 ||
    q.height > 2147483647 ||
    (q.parameter !== 0 && q.parameter !== 1) ||
    (q.parentBuilding !== null &&
      (!Number.isInteger(q.parentBuilding) ||
        q.parentBuilding < 0 ||
        q.parentBuilding >= 256))
  )
    throw Error("Actual recruitment landing factory request required");
  if (!pack.assets.EFF) throw Error("Original EFF landing resource required");
  animationProfile(pack.assets.EFF, 49);
  if (
    q.parentBuilding !== null &&
    w.buildingNative[q.parentBuilding]?.[6] !== 4
  )
    throw Error("Actual recruitment landing parent building required");
  const created = createLanding(
    q.owner,
    q.position,
    w.terrain,
    slot,
    w.powerEffects.slots[slot].nativePrior!,
  );
  created.height = q.height;
  created.timer = q.parameter || -1;
  putEffectDword(created.native!, 39, q.height);
  putEffectWord(created.native!, 74, created.timer);
  created.native![76] = q.parameter ? 3 : 0;
  if (q.parentBuilding !== null) {
    putEffectWord(created.native!, 71, q.parentBuilding);
    created.native![73] = 4;
  }
  publish(w, slot, created.native!);
  const held = heldPriors[slot]!;
  held.splice(0, 81, ...w.powerEffects.slots[slot].nativePrior!);
  w.powerEffects.slots[slot].nativePrior = held;
  created.native = held;
  w.landings.push(created);
  const returned = planRecruitmentLandingReturn(
    w.powerEffects.slots.map((p) => p.nativePrior!),
    slot,
    q.parameter,
  );
  if (q.parameter) w.powerEffects.slots[returned.slot].nativePrior![76] = 1;
  requestAudio(w.audio, {
    frame: w.frame,
    entity: `source:4:${returned.slot}`,
    cue: 0x50,
    mode: 2,
    parameter: 255,
    gain: 127,
    initialRatePercent: 180,
    //Retain the old journal field for saved-request compatibility. The
    //device uses the explicit rate above and never interprets range as rate.
    range: 180,
  });
  return { allocatedSlot: slot, returned };
}
export function createCampaignRecruitmentLanding(
  w: CampaignWorld,
  q: CampaignRecruitmentLandingRequest,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
) {
  const staged = structuredClone(w),
    result = createStagedCampaignRecruitmentLanding(staged, q, pack, options);
  Object.assign(w, staged);
  return result;
}
/**Generic64/51 factory, with source newborn mark applied AFTER publication. */
export function createStagedCampaignRecruitmentEffect(
  w: CampaignWorld,
  q: RecruitmentEffectRequest,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out?: EffectSchedulerReceipt,
): number | null {
  const d = pack.effectRules?.descriptors[q.code];
  validateRecruitmentDescriptor(d, q.code);
  const heldPriors = w.powerEffects.slots.map((p) => p.nativePrior),
    slot = allocateStagedSharedEffect(w, q.code, pack, options, out);
  if (slot === null) return null;
  if (!pack.rules || !pack.assets.EFF)
    throw Error("Original recruitment motion tables/EFF required");
  const n = makeRecruitmentEffect(
    w.powerEffects.slots[slot].nativePrior!,
    slot,
    q,
    w.terrain,
    pack.rules.tables,
    animationProfile(pack.assets.EFF, q.code),
    d!,
  );
  publish(w, slot, n);
  const held = heldPriors[slot]!;
  held.splice(0, 81, ...w.powerEffects.slots[slot].nativePrior!);
  w.powerEffects.slots[slot].nativePrior = held;
  if (q.newborn) w.powerEffects.slots[slot].nativePrior![21]! |= 1;
  return slot;
}
/**72AD0→8AAE0 runs once at mission entry, before selected-player reveal.
 * The positive gate is unsigned, and the marker is independent of launch. */
export function createStagedCampaignRecruitmentMarker(
  w: CampaignWorld,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
): number | null {
  if (u32(w.missionPrefix, 0x1ec2) === 0) return null;
  const position: [number, number] = [
      i16(w.missionPrefix, 0x1c9a),
      i16(w.missionPrefix, 0x1c9c),
    ],
    slot = createStagedCampaignRecruitmentEffect(
      w,
      {
        code: 64,
        owner: 0,
        position,
        height: groundHeight(w.terrain, ...position),
        angles: [0, 0, 0],
        parameter: 0,
        delay: 0,
        newborn: false,
      },
      pack,
      options,
    );
  if (slot !== null) revealCampaignRadius(w, position, 4096);
  return slot;
}
/**Shared scheduler owns final publication/retirement after this full callback.
 * Every recursive factory sees current parent fields and actual spatial links. */
export function stepCampaignRecruitmentEffect(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out: EffectSchedulerReceipt,
): RecruitmentEffectUpdate {
  const n = w.powerEffects.slots[slot]?.nativePrior,
    code = n?.[69];
  if (!n || (code !== 64 && code !== 51) || !pack.rules)
    throw Error("Actual recruitment64/51 callback binding required");
  validateRecruitmentDescriptor(pack.effectRules?.descriptors[code], code);
  return stepRecruitmentEffectRecord(n, w.terrain, {
    frame: w.frame,
    gravity: options.gravity,
    water: w.source.source.terrain.loadedPhysicalWaterHeight,
    tables: pack.rules.tables,
    bounce: pack.rules.tables.bounce,
    profile: animationProfile(pack.assets.EFF, code),
    obstacleTarget: options.destructionObstacle
      ? (p, h) => options.destructionObstacle!(w, p, h)
      : undefined,
    obstacleAt: options.obstacleAt,
    child(q, parent) {
      publish(w, slot, parent);
      const made =
        q.code === 21 || q.code === 48
          ? createStagedCampaignWater(
              w,
              { ...q, code: q.code },
              pack,
              options,
              out,
            )
          : q.code === 51
            ? createStagedCampaignRecruitmentEffect(
                w,
                { ...q, code: 51 },
                pack,
                options,
                out,
              )
            : (() => {
                throw Error("Unsupported recruitment common child");
              })();
      const current = w.powerEffects.slots[slot].nativePrior!;
      if (current[6] !== 5 || current[69] !== code)
        throw Error("Recruitment child replaced its executing parent");
      parent.splice(0, 81, ...current);
      return made !== null;
    },
  });
}

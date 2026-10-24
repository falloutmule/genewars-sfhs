/** Concrete planted50/0x32 and feedback51/0x33,10/0x0A in the shared pool. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { CampaignEngineerServices } from "./engineer-adapter";
import type { EngineerTakeoverChargeRequest } from "../mechanics/engineer-construction";
import {
  makeEngineerCharge,
  makeEngineerChargeFeedback,
  planEngineerChargePhase,
  stepEngineerChargeRecord,
  validateEngineerChargeDescriptor,
  type EngineerChargeCode,
  type EngineerChargeChildRequest,
  type EngineerChargeUpdate,
} from "../mechanics/engineer-charge";
import { stepEngineerChargeChildRecord } from "../mechanics/production-effect";
import { animationProfile } from "../mechanics/animation";
import {
  allocateStagedSharedEffect,
  publishStagedSharedEffect,
  cloneEffectHost,
  commitEffectHost,
  type EffectSchedulerOptions,
  type EffectSchedulerReceipt,
} from "./effect-scheduler";
import { synchronizeCampaignLinks } from "./entity-view";
import { i16 } from "./bytes";

function descriptor(pack: Pack, code: EngineerChargeCode) {
  const d = pack.effectRules?.descriptors[code];
  validateEngineerChargeDescriptor(d, code);
  return d!;
}
function publish(
  w: CampaignWorld,
  slot: number,
  native: readonly (number | null)[],
) {
  publishStagedSharedEffect(w, slot, native);
  synchronizeCampaignLinks(w);
}
/** Already isolated534D0 factory attempt. Capacity false occurs before resource
 * profile or parent reads; allocation cleanup precedes concrete parent writes. */
export function createStagedCampaignEngineerCharge(
  w: CampaignWorld,
  q: EngineerTakeoverChargeRequest,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out?: EffectSchedulerReceipt,
): number | null {
  descriptor(pack, 50);
  const slot = allocateStagedSharedEffect(w, 50, pack, options, out);
  if (slot === null) return null;
  const actor = w.specialists.records[q.actor];
  if (!actor || actor[6] !== 3 || i16(actor as number[], 15) !== q.actor)
    throw Error("Actual planted charge kind3 parent is required");
  const n = makeEngineerCharge(
    w.powerEffects.slots[slot].nativePrior!,
    slot,
    q,
    w.terrain,
    animationProfile(pack.assets.EFF, 50),
    descriptor(pack, 50),
  );
  publish(w, slot, n);
  return slot;
}
/** Exact534D0/51E80 ascending scan. Retains actual slot/native identities and
 * touches only phase70 after the complete matching plan validates. */
export function setStagedCampaignEngineerChargePhase(
  w: CampaignWorld,
  actor: number,
  phase: 1 | 2,
): { changed: number[] } {
  const changed = planEngineerChargePhase(
    w.powerEffects.slots.map((p) => {
      if (!p.nativePrior)
        throw Error("Actual charge phase native prior is missing");
      return p.nativePrior;
    }),
    actor,
    phase,
  );
  for (const slot of changed)
    w.powerEffects.slots[slot].nativePrior![70] = phase;
  return { changed };
}
function feedback(
  w: CampaignWorld,
  q: EngineerChargeChildRequest,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out: EffectSchedulerReceipt,
) {
  descriptor(pack, q.code);
  const slot = allocateStagedSharedEffect(w, q.code, pack, options, out);
  if (slot === null) return null;
  const n = makeEngineerChargeFeedback(
    w.powerEffects.slots[slot].nativePrior!,
    slot,
    q,
    w.terrain,
    animationProfile(pack.assets.EFF, q.code),
    descriptor(pack, q.code),
  );
  publish(w, slot, n);
  //Source sets this after the factory, so replacement cleanup sees unmarked child.
  w.powerEffects.slots[slot].nativePrior![21] = n[21]! | 1;
  return slot;
}
/** Scheduler owns final publication/retirement. Recursive allocation sees the
 * parent's current numeric image and real links before any replaced cleanup. */
export function stepCampaignEngineerChargeEffect(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
  out: EffectSchedulerReceipt,
): EngineerChargeUpdate {
  const before = w.powerEffects.slots[slot]?.nativePrior,
    code = before?.[69];
  if (!before || (code !== 50 && code !== 10 && code !== 51))
    throw Error("Actual Engineer charge/feedback callback slot is required");
  descriptor(pack, code);
  if (code !== 50) {
    if (!pack.rules)
      throw Error("Original feedback motion tables are required");
    return {
      ...stepEngineerChargeChildRecord(
        before,
        w.terrain,
        {
          frame: w.frame,
          gravity: options.gravity,
          water: w.source.source.terrain.loadedPhysicalWaterHeight,
          tables: pack.rules.tables,
          bounce: pack.rules.tables.bounce,
          profile: animationProfile(pack.assets.EFF, code),
          obstacleAt: options.obstacleAt,
        },
        code,
      ),
      newborns: 0,
    };
  }
  return stepEngineerChargeRecord(before, w.terrain, {
    profile: animationProfile(pack.assets.EFF, 50),
    child(q, parent) {
      publish(w, slot, parent);
      const made = feedback(w, q, pack, options, out),
        current = w.powerEffects.slots[slot].nativePrior!;
      if (made === slot || current[6] !== 5 || current[69] !== 50)
        throw Error(
          "Engineer feedback allocation replaced its executing charge",
        );
      parent.splice(0, 81, ...current);
      return made !== null;
    },
  });
}
/** Direct bindings for an existing caller's already-staged Engineer transaction. */
export function campaignEngineerChargeServices(
  pack: Pack,
  effectOptions: (w: CampaignWorld) => EffectSchedulerOptions<CampaignWorld>,
): Pick<
  CampaignEngineerServices,
  "placeTakeoverCharge" | "setTakeoverChargePhase"
> {
  return {
    placeTakeoverCharge: (w, q) =>
      createStagedCampaignEngineerCharge(w, q, pack, effectOptions(w)) !== null,
    setTakeoverChargePhase: (w, actor, phase) => {
      setStagedCampaignEngineerChargePhase(w, actor, phase);
    },
  };
}
const extraRoots = [
  "buildingNative",
  "creatureNative",
  "specialists",
  "collapse",
  "collectors",
  "ethereals",
  "presentation",
  "buildings",
  "jobs",
  "muleQueues",
  "auxiliary",
  "pendingEnvironmentEffects",
  "strategy",
] as const;
function stage(
  w: CampaignWorld,
  options: EffectSchedulerOptions<CampaignWorld>,
) {
  const s = cloneEffectHost(w, options);
  if (extraRoots.some((key) => w[key] && s[key] === w[key])) {
    Object.assign(
      s,
      structuredClone(
        Object.fromEntries(
          extraRoots.filter((key) => key in w).map((key) => [key, w[key]]),
        ),
      ),
    );
    for (const m of s.ecology.mules) s.creatureNative[m.index] = m.native;
  }
  return s;
}
function commit(
  w: CampaignWorld,
  s: CampaignWorld,
  options: EffectSchedulerOptions<CampaignWorld>,
) {
  commitEffectHost(w, s, options);
  for (const key of extraRoots)
    if (key in s) (w as unknown as Record<string, unknown>)[key] = s[key];
}
/** Standalone full-host transaction. Staged callers use the services above so
 * their currently held specialist/building/player/effect identities survive. */
export function createCampaignEngineerCharge(
  w: CampaignWorld,
  q: EngineerTakeoverChargeRequest,
  pack: Pack,
  options: EffectSchedulerOptions<CampaignWorld>,
): number | null {
  const s = stage(w, options),
    slot = createStagedCampaignEngineerCharge(s, q, pack, options);
  commit(w, s, options);
  return slot;
}
export function setCampaignEngineerChargePhase(
  w: CampaignWorld,
  actor: number,
  phase: 1 | 2,
  options: EffectSchedulerOptions<CampaignWorld>,
): { changed: number[] } {
  const s = stage(w, options),
    result = setStagedCampaignEngineerChargePhase(s, actor, phase);
  commit(w, s, options);
  return result;
}

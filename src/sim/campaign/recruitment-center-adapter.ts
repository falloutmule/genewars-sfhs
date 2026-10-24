/**Actual451F0 selector5 and7F480 associated landing, already-staged entries. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { CampaignSpecialistServices } from "./specialist-adapter";
import {
  stepStagedRecruitmentCenter,
  type RecruitmentCenterReceipt,
} from "../mechanics/recruitment-center";
import { animationProfile } from "../mechanics/animation";
import { campaignBuildingAsset } from "./building-startup-adapter";
import { campaignAssociatedRecruitmentPoint } from "./strategic-recruit-adapter";
import { createStagedCampaignRecruitmentLanding } from "./recruitment-landing-adapter";
import { revealCampaignRadius } from "./reveal-adapter";
import { synchronizeCampaignLinks } from "./entity-view";
import { cloneEffectHost, commitEffectHost } from "./effect-scheduler";
import { i16, u16, u32, put16 } from "./bytes";

/**7F480 has no80830/56E20 actor initialization prefix. The returned record,
 * source raw496/498 and owner9/11 are published only after actual allocation. */
export function requestStagedCampaignCenterLanding(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): { slot: number; kind: number } | null {
  const n = w.buildingNative[slot],
    owner = n?.[24];
  if (n?.[6] !== 4 || n[45] !== 5 || owner == null || owner > 3)
    throw Error("Actual7F480 Recruitment Center required");
  const p = w.players[owner].raw,
    point = campaignAssociatedRecruitmentPoint(w, slot, pack),
    created = createStagedCampaignRecruitmentLanding(
      w,
      {
        owner,
        position: point,
        height: (u32(n as number[], 17) + 0x6400) | 0,
        parameter: 0,
        parentBuilding: slot,
      },
      pack,
      services.effectOptions(w),
    );
  if (created === null) return null;
  if (w.buildingNative[slot] !== n || w.players[owner].raw !== p)
    throw Error(
      "Center landing factory replaced its retained native/player record",
    );
  const returned = w.powerEffects.slots[created.returned.slot].nativePrior;
  if (!returned || returned[6] !== created.returned.kind)
    throw Error("Actual7F480 returned effect record required");
  put16(p, 0x496, created.returned.slot);
  p[0x498] = created.returned.kind;
  if (owner === w.selectedPlayer)
    revealCampaignRadius(
      w,
      [i16(returned as number[], 7), i16(returned as number[], 9)],
      4096,
    );
  put16(p, 9, point[0]);
  put16(p, 11, point[1]);
  synchronizeCampaignLinks(w);
  return created.returned;
}
export function stepStagedCampaignRecruitmentCenter(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): RecruitmentCenterReceipt {
  if (!pack.buildingRules)
    throw Error("Original recruitment-center resource/upkeep profile required");
  const asset = pack.assets[campaignBuildingAsset(pack, 5)],
    receipt = stepStagedRecruitmentCenter(w, slot, {
      native: (s, i) => s.buildingNative[i],
      player: (s, i) => s.players[i].raw,
      upkeep: pack.buildingRules.upkeep,
      profile: (_s, _i, action) => animationProfile(asset, action),
      requestLanding7F480: (s, i) =>
        requestStagedCampaignCenterLanding(s, i, pack, services),
    }),
    n = w.buildingNative[slot],
    flags = u16(n as number[], 49),
    b = w.buildings.find((v) => v.slot === slot),
    e = w.economy.buildings.find((v) => v.owner * 64 + v.slot === slot),
    p = w.players[receipt.owner],
    ep = w.economy.players.find((v) => v.id === receipt.owner);
  if (
    !b ||
    !e ||
    !ep ||
    b.selector !== 5 ||
    e.selector !== 5 ||
    b.id !== e.id ||
    b.owner !== n[24]
  )
    throw Error(
      "Recruitment-center normalized building/economy binding missing",
    );
  b.health = i16(n as number[], 43);
  b.grade = e.grade = n[46] as 0 | 1 | 2;
  b.complete = e.complete = !!(flags & 1);
  b.energy = e.energy = i16(n as number[], 61);
  e.disabled = !!(flags & 0x40);
  e.capacitySuppressed = !!(flags & 0x840);
  e.hqUpgradeSuppressed = !!(flags & 0x140);
  e.powered = !!(flags & 4);
  e.depleted = !!(flags & 0x200);
  e.extraDrain = n[63]!;
  //For5 byte54 is a landing-pad stamp, not a resource balance.
  e.storedGoop = u32(n as number[], 54) | 0;
  p.funds = u32(p.raw, 0x4a3);
  p.goop = ep.goop = u32(p.raw, 0x4a7);
  ep.noPowerWarningTicks = i16(p.raw, 0x5ea);
  return receipt;
}
/**Standalone full-host isolation. Production owner/slot dispatch uses staged. */
export function stepCampaignRecruitmentCenter(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): RecruitmentCenterReceipt {
  const base = services.effectOptions(w),
    keys = [
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
    ] as const,
    hooks = {
      ...base,
      stageHost(original: CampaignWorld, staged: CampaignWorld) {
        base.stageHost?.(original, staged);
        Object.assign(
          staged,
          structuredClone(
            Object.fromEntries(keys.map((key) => [key, original[key]])),
          ),
        );
        for (const mule of staged.ecology.mules)
          staged.creatureNative[mule.index] = mule.native;
      },
      commitHost(target: CampaignWorld, staged: CampaignWorld) {
        for (const key of keys)
          (target as unknown as Record<string, unknown>)[key] = staged[key];
        base.commitHost?.(target, staged);
      },
    },
    staged = cloneEffectHost(w, hooks),
    receipt = stepStagedCampaignRecruitmentCenter(staged, slot, pack, services);
  commitEffectHost(w, staged, hooks);
  return receipt;
}

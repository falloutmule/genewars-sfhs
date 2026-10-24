/**4D13F/4D445 status and75240 current associated landing footprint. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { LandingBuildingRequest } from "../mechanics/landing";
import {
  updateLandingSite,
  type LandingSiteRules,
  type LandingSiteReceipt,
} from "../mechanics/landing-site";
import { u32 } from "./bytes";
export function stepStagedCampaignLandingBuilding(
  w: CampaignWorld,
  request: LandingBuildingRequest,
  pack: Pack,
): LandingSiteReceipt {
  if (
    !Number.isInteger(request.building) ||
    request.building < 0 ||
    request.building >= 256
  )
    throw Error("Actual associated landing building slot required");
  const n = w.buildingNative[request.building];
  if (!n || n.length !== 67)
    throw Error("Actual retained associated building native67 required");
  let result: LandingSiteReceipt;
  if (request.type === "status") {
    n[60] = Number(request.active);
    n[51] = 0;
    result = { updated: false, cells: [] };
  } else {
    const r = (
      pack.specialistRecruitmentRules as
        | { landingSite?: LandingSiteRules }
        | undefined
    )?.landingSite;
    if (!r) throw Error("Original75240 landing-site profile required");
    result = updateLandingSite(
      w.terrain,
      n,
      request.position,
      w.frame,
      request.argumentB,
      request.argumentC,
      r,
    );
  }
  const b = w.economy.buildings.find(
    (b) => b.owner * 64 + b.slot === request.building,
  );
  if (b) {
    b.storedGoop = u32(n as number[], 54) | 0;
    if (b.extractor) b.extractor.cycle = n[51]!;
  }
  return result;
}
/**Standalone atomic helper; the shared scheduler uses the staged entry. */
export function stepCampaignLandingBuilding(
  w: CampaignWorld,
  request: LandingBuildingRequest,
  pack: Pack,
) {
  const staged = structuredClone(w),
    result = stepStagedCampaignLandingBuilding(staged, request, pack);
  Object.assign(w, staged);
  return result;
}

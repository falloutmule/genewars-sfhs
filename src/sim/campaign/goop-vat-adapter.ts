/** Source451F0 selector13 in the enclosing47F80 owner/slot transaction. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import { stepStagedGoopVat } from "../mechanics/goop-vat";
import { animationProfile } from "../mechanics/animation";
import { campaignBuildingAsset } from "./building-startup-adapter";
import { i16, u16, u32 } from "./bytes";

export function stepStagedCampaignGoopVat(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
) {
  const n = w.buildingNative[slot],
    b = w.buildings.find((v) => v.slot === slot),
    e = w.economy.buildings.find((v) => v.owner * 64 + v.slot === slot);
  if (
    !pack.buildingRules ||
    !n ||
    !b ||
    !e ||
    b.id !== e.id ||
    b.owner !== n[24] ||
    e.owner !== n[24] ||
    b.selector !== 13 ||
    e.selector !== 13
  )
    throw Error("Actual GOOP Vat host/resource bindings required");
  const asset = pack.assets[campaignBuildingAsset(pack, 13)];
  const receipt = stepStagedGoopVat(w, slot, {
    frame: w.frame,
    upkeep: pack.buildingRules.upkeep[13],
    native: (s, i) => s.buildingNative[i],
    player: (s, owner) => s.players[owner].raw,
    profile: (_s, _i, action) => animationProfile(asset, action),
  });
  const raw = n as number[],
    owner = n[24]!,
    p = w.players[owner],
    economy = w.economy.players.find((v) => v.id === owner),
    flags = u16(raw, 49);
  if (!economy) throw Error("GOOP Vat owner economy binding required");
  p.goop = economy.goop = u32(p.raw, 0x4a7);
  economy.noPowerWarningTicks = i16(p.raw, 0x5ea);
  b.energy = e.energy = i16(raw, 61);
  e.powered = !!(flags & 4);
  e.extraDrain = n[63]!;
  e.storedGoop = u32(raw, 54) | 0;
  return receipt;
}

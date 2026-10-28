/** Human opcode5 ->81080 ->51960 task1. The existing staged command,
 * charge, demolition and salvage families own every numeric mutation. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { CampaignSpecialistServices } from "./specialist-adapter";
import { readSpecialistControlActor } from "../mechanics/geneticist";
import { dispatchCampaignStrategicRoleCommand } from "./strategic-role-command-adapter";
import { i16, put16, u16 } from "./bytes";
import { worldCell } from "../mechanics/terrain";

/** Converted ordinary retirement families.5/12 have separate dependencies. */
export const ENGINEER_DEMOLITION_SELECTORS = [
  0, 1, 2, 3, 4, 6, 11, 13,
] as const;

/** Phone producer eligibility, including the actual explored target cell.
 * These checks do not replace or bypass the source command/role callbacks. */
export function campaignEngineerDemolitionTarget(
  w: CampaignWorld,
  slot: number,
): boolean {
  if (!Number.isInteger(slot) || slot < 0 || slot >= 256) return false;
  const n = w.buildingNative[slot];
  if (
    !n ||
    n.length !== 67 ||
    [6, 7, 8, 9, 10, 15, 16, 43, 44, 45, 49, 50].some(
      (at) => !Number.isInteger(n[at]) || n[at]! < 0 || n[at]! > 255,
    ) ||
    n[6] !== 4 ||
    i16(n as number[], 15) !== slot ||
    i16(n as number[], 43) <= 0 ||
    u16(n as number[], 49) & 0x800 ||
    !ENGINEER_DEMOLITION_SELECTORS.some((s) => s === n[45])
  )
    return false;
  return (
    w.terrain.bytes[
      worldCell(i16(n as number[], 7), i16(n as number[], 9)) * 14 + 12
    ] !== 0
  );
}

export function requestCampaignEngineerDemolition(
  w: CampaignWorld,
  index: number,
  slot: number,
  pack: Pack,
  services: CampaignSpecialistServices,
) {
  const a = readSpecialistControlActor(w, index),
    binding = w.specialists.bindings[index]!;
  if (a.owner !== w.selectedPlayer || binding.category !== 0)
    throw Error("A human-owned Engineer is required");
  if (!campaignEngineerDemolitionTarget(w, slot))
    throw Error("Select a visible building with an admitted demolition family");
  //The human panel uses the same eligibility bit as its ordinary commands.
  if (!(a.native[112]! & 1)) return { outcome: "ignored" as const };
  const packet: (number | null)[] = Array(11).fill(null);
  put16(packet as number[], 0, index);
  packet[3] = 1;
  packet[5] = slot;
  packet[10] = 5;
  return dispatchCampaignStrategicRoleCommand(
    w,
    {
      routine: 0x81080,
      source: 0x1c120,
      player: a.owner,
      specialist: index,
      packet,
    },
    pack,
    services,
  );
}

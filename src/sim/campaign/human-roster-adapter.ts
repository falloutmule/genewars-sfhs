/** Explicit human20AE0 input, without AI32E60 quotas or autofill. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type { CampaignSpecialistServices } from "./specialist-adapter";
import {
  humanRosterView,
  humanRecruitmentBuildingRoute,
  initialHumanRosterPanel,
  admitHumanRosterCommand,
  issueHumanRosterPacket,
  type HumanRosterCommand,
  type HumanRosterState,
  type HumanRosterReceipt,
} from "../mechanics/human-roster";
import {
  createStagedCampaignSpecialist,
  createStagedCampaignRosterLanding,
  campaignAssociatedRecruitmentPoint,
  type CampaignRecruitEvent,
} from "./strategic-recruit-adapter";
import { synchronizeCampaignSpecialistBlueprints } from "./specialist-adapter";
import { aiByte, aiSByte } from "../mechanics/strategic-ai-state";
import type { RaceStyle, SpecialistCategory } from "../mechanics/blueprints";

function retainedState(w: CampaignWorld): HumanRosterState {
  return {
    players: w.players.map((p) => p.raw),
    specialists: w.specialists.records.map((native, slot) => {
      const binding = w.specialists.bindings[slot];
      return {
        native,
        blueprint: binding
          ? { player: binding.owner, index: binding.blueprintIndex }
          : null,
      };
    }),
    buildings: w.buildingNative,
    missionPrefix: w.missionPrefix,
  };
}
/** No content dependency: source raw records establish cards and UI gates. */
export function campaignHumanRosterView(
  w: CampaignWorld,
  associatedBuilding: number | null = null,
) {
  return humanRosterView(
    retainedState(w),
    w.selectedPlayer,
    associatedBuilding,
  );
}
/**The canonical campaign host is the source185DEF entry. Caller invokes this
 * once after72AD0, with the actual retained child-panel emptiness. */
export function campaignHumanRosterInitialPanel(
  w: CampaignWorld,
  currentPanelEmpty = true,
) {
  return initialHumanRosterPanel(retainedState(w), w.selectedPlayer, {
    flags: w.flags,
    module: "campaign185DEF",
    currentPanelEmpty,
  });
}
/**20880's packet9 producer. Only an actual selected building supplies this
 * point; the human UI does not synthesize arbitrary ground-point selection. */
export function campaignHumanRosterAssociatedTarget(
  w: CampaignWorld,
  slot: number,
  pack: Pack,
): [number, number] {
  const reason = humanRecruitmentBuildingRoute(
    retainedState(w),
    w.selectedPlayer,
    slot,
  );
  if (reason) throw Error(reason);
  return campaignAssociatedRecruitmentPoint(w, slot, pack);
}
export interface CampaignHumanRosterReceipt {
  accepted: boolean;
  disposition:
    | "rejected"
    | "created"
    | "removed"
    | "landing"
    | "capacity"
    | "unchanged";
  reason: string | null;
  packet: HumanRosterReceipt | null;
  events: CampaignRecruitEvent[];
}
/** Campaign projections are a dense indexed view; source21700 scans32 BPs.
 * If a retained named BP lies beyond the generated20, project actual raw
 * metadata (including intervening records), without writing any source byte. */
function projectBlueprintsThrough(
  w: CampaignWorld,
  owner: number,
  index: number,
): void {
  const p = w.players[owner],
    raw = p.raw;
  for (let i = p.blueprints.length; i <= index; i++) {
    const at = 0x16 + i * 36,
      style = aiSByte(raw, at + 21),
      category = aiSByte(raw, at + 22);
    if (style < 0 || style > 3 || category < 0 || category > 3)
      throw Error(
        "Actual retained human blueprint style/category metadata required",
      );
    let name = "";
    for (let c = 0; c < 20 && aiByte(raw, at + c) !== 0; c++)
      name += String.fromCharCode(aiByte(raw, at + c));
    p.blueprints.push({
      index: i,
      name,
      style: style as RaceStyle,
      category: category as SpecialistCategory,
      skill: aiByte(raw, at + 23),
      maxHealth: aiByte(raw, at + 25),
      health: aiSByte(raw, at + 26),
      runtimeFlags: aiByte(raw, at + 32),
      unresolved: {
        byte18: aiByte(raw, at + 24),
        byte1b: aiByte(raw, at + 27),
      },
    });
  }
}
/** Run in an already isolated full campaign callback. UI gates are re-read at
 * issue time, so queued select→deploy uses the newly changed actual roster. */
export function issueStagedCampaignHumanRoster(
  w: CampaignWorld,
  command: HumanRosterCommand,
  pack: Pack,
  services: CampaignSpecialistServices,
): CampaignHumanRosterReceipt {
  const owner = w.selectedPlayer,
    s = retainedState(w),
    admission = admitHumanRosterCommand(s, owner, command),
    events: CampaignRecruitEvent[] = [];
  if (!admission.accepted)
    return {
      accepted: false,
      disposition: "rejected",
      reason: admission.reason,
      packet: null,
      events,
    };
  const records = w.specialists.records,
    heldRecords = records.slice(),
    players = w.players,
    rawPlayers = players.map((p) => p.raw),
    result = issueHumanRosterPacket(s, owner, command, {
      createSpecialist(state, request) {
        projectBlueprintsThrough(w, owner, request.blueprint);
        const receipt = createStagedCampaignSpecialist(w, request, pack),
          binding = w.specialists.bindings[request.slot]!;
        state.specialists[request.slot].blueprint = {
          player: binding.owner,
          index: binding.blueprintIndex,
        };
        events.push({
          type: "specialist-created",
          owner,
          slot: request.slot,
          blueprint: request.blueprint,
        });
        return receipt;
      },
      createLanding(state, request) {
        const created = createStagedCampaignRosterLanding(
          w,
          request,
          pack,
          services,
          events,
        );
        for (let slot = owner * 5; slot < owner * 5 + 5; slot++) {
          const binding = w.specialists.bindings[slot];
          state.specialists[slot].blueprint = binding
            ? { player: binding.owner, index: binding.blueprintIndex }
            : null;
        }
        return created;
      },
      deselected(_state, slot) {
        //80360 is the pending-roster removal, not57740 death. C0 survives,
        //there is no unlink/724C0/800B0 work and no BP name/health deletion.
        if (w.spatial.nodes[`source:2:${slot}`])
          throw Error(
            "Human waiting-roster removal unexpectedly contains a spatial actor",
          );
        const actor = w.actors.find((a) => a.id === slot);
        if (actor) {
          actor.ready = false;
          actor.goal = null;
          actor.route = [];
          actor.orders = [];
          actor.reason = "Removed from waiting roster";
        }
        const builder = w.builders.find((b) => b.id === slot);
        if (builder) {
          builder.enabled = false;
          builder.task = null;
        }
      },
    });
  if (
    w.specialists.records !== records ||
    records.some((n, i) => n !== heldRecords[i]) ||
    w.players !== players ||
    players.some((p, i) => p.raw !== rawPlayers[i]) ||
    s.players.some((p, i) => p !== rawPlayers[i])
  )
    throw Error("Human roster service replaced retained native/player records");
  synchronizeCampaignSpecialistBlueprints(w);
  const disposition: CampaignHumanRosterReceipt["disposition"] =
    result.created !== null
      ? "created"
      : result.removed.length
        ? "removed"
        : result.landingCreated === true
          ? "landing"
          : result.landingCreated === false || command.type === "roster-select"
            ? "capacity"
            : "unchanged";
  return {
    accepted: true,
    disposition,
    reason:
      disposition === "capacity"
        ? "Source pool capacity prevented allocation"
        : null,
    packet: result,
    events,
  };
}
/** User commands are infrequent. The complete clone preserves all aliases and
 * guarantees that a late resource/selector64/service error changes no host root. */
export function issueCampaignHumanRoster(
  w: CampaignWorld,
  command: HumanRosterCommand,
  pack: Pack,
  services: CampaignSpecialistServices,
): CampaignHumanRosterReceipt {
  const staged = structuredClone(w),
    receipt = issueStagedCampaignHumanRoster(staged, command, pack, services);
  if (receipt.accepted) Object.assign(w, staged);
  return receipt;
}

/** Campaign bindings for source6A760/81D30/82230. No UI decisions or
 * reclassification are inserted into a recorded target packet. */
import type { Pack } from "../../content/types";
import {
  classifyHumanCreatureTarget,
  issueStagedHumanCreatureTarget,
  stopStagedHumanCreature,
  type HumanCreatureClassifierContext,
  type HumanCreatureCommandContext,
} from "../mechanics/human-creature-commands";
import {
  restoreCreatureCommandAliases,
  type CreatureCommandReference,
} from "../mechanics/creature-commands";
import {
  campaignCreatureCommandContext,
  campaignCreatureCommandReference,
  type CampaignCreatureCommandWorld,
  type CampaignCreatureCommandServices,
} from "./creature-command-adapter";
import { requestAudio } from "../mechanics/audio";
import { worldCell } from "../mechanics/terrain";
import { mirrorCampaignSpecialist } from "./specialist-adapter";
import { synchronizeCampaignLinks } from "./entity-view";

type Native = (number | null)[];
export interface CampaignHumanCreatureCommandServices
  extends CampaignCreatureCommandServices {
  /** Concrete virtual68 for any additional selectable family. Kind3 uses
   * its real retained blueprint health; known1/2/4 are implemented directly. */
  classifierVirtual68?(
    world: CampaignCreatureCommandWorld,
    ref: CreatureCommandReference,
    native: Native,
  ): boolean;
  /** Presentation-only current creature-panel identity, not a command gate. */
  selectedPanelRefresh?(
    world: CampaignCreatureCommandWorld,
    index: number,
  ): boolean;
}
const byte = (n: readonly (number | null)[], at: number): number => {
  const v = n[at];
  if (v == null || !Number.isInteger(v) || v < 0 || v > 255)
    throw Error(`Actual campaign human creature byte${at} required`);
  return v;
};
const word = (n: readonly (number | null)[], at: number) =>
  ((byte(n, at) | (byte(n, at + 1) << 8)) << 16) >> 16;
function components(pack: Pack, species: number): readonly [number, number] {
  const row = pack.zoneRules?.speciesComponents[species];
  if (!row || row.length !== 2)
    throw Error("Imported104A64 human target component row required");
  return row as [number, number];
}
export function campaignHumanCreatureClassifierContext(
  pack: Pack,
  services: CampaignHumanCreatureCommandServices = {},
): HumanCreatureClassifierContext<CampaignCreatureCommandWorld> {
  return {
    components: (_w, species) => components(pack, species),
    resolve: campaignCreatureCommandReference,
    visibility: (w, n) =>
      w.terrain.bytes[worldCell(word(n, 7), word(n, 9)) * 14 + 12],
    buildingMaximumHealth: (w, index) => {
      const n = w.buildingNative[index],
        selector = (byte(n, 45) << 24) >> 24,
        grade = byte(n, 46),
        value = pack.rules?.tables.buildingHealth[selector * 3 + grade];
      if (value === undefined)
        throw Error("Imported104D1E classifier health row required");
      return value;
    },
    virtual68: (w, ref, n) => {
      if (ref.kind === 3) {
        const binding = w.specialists.bindings[ref.index];
        if (!binding)
          throw Error(
            "Actual classifier specialist blueprint binding required",
          );
        const raw = w.players[binding.owner]?.raw;
        if (!raw)
          throw Error("Actual classifier specialist player record required");
        return (
          (byte(raw, 0x16 + binding.blueprintIndex * 36 + 26) << 24) >> 24 <= 0
        );
      }
      if (!services.classifierVirtual68)
        throw Error(
          `Concrete kind${byte(n, 6)} human target virtual68 required`,
        );
      return services.classifierVirtual68(w, ref, n);
    },
  };
}
export function classifyCampaignHumanMuleTarget(
  w: CampaignCreatureCommandWorld,
  index: number,
  target: CreatureCommandReference | null,
  input: { force: boolean; bypassVisibility: boolean },
  pack: Pack,
  services: CampaignHumanCreatureCommandServices = {},
) {
  return classifyHumanCreatureTarget(
    w,
    index,
    target,
    input,
    campaignHumanCreatureClassifierContext(pack, services),
  );
}
export function campaignHumanCreatureCommandContext(
  pack: Pack,
  index: number,
  services: CampaignHumanCreatureCommandServices,
): HumanCreatureCommandContext<CampaignCreatureCommandWorld> {
  return {
    components: (_w, species) => components(pack, species),
    resolve: campaignCreatureCommandReference,
    commands: (w) => campaignCreatureCommandContext(w, pack, services),
    onFeedback: (w, feedback) =>
      requestAudio(w.audio, {
        frame: w.frame,
        entity: `source:0:${index}`,
        cue: feedback.cue,
        mode: feedback.mode,
        parameter: feedback.parameter,
        range: feedback.range,
        gain: feedback.volume,
        initialRatePercent: feedback.ratePercent,
      }),
  };
}
function post(
  w: CampaignCreatureCommandWorld,
  before: (number | null | undefined)[][],
) {
  for (let i = 0; i < w.specialists.records.length; i++) {
    const n = w.specialists.records[i];
    if (n[6] === 3 && [21, 74, 85].some((at, j) => n[at] !== before[i][j]))
      mirrorCampaignSpecialist(w, i);
  }
  synchronizeCampaignLinks(w);
}
function aliases(w: CampaignCreatureCommandWorld) {
  for (const mule of w.ecology.mules)
    if (mule.native !== w.creatureNative[mule.index])
      throw Error(
        "Staged human command requires retained creature/ecology aliases",
      );
}
/** Caller owns full-host isolation; accepted false paths are real afterimages. */
export function issueStagedCampaignHumanMuleTarget(
  w: CampaignCreatureCommandWorld,
  index: number,
  packet: { target: CreatureCommandReference | null; mode: number },
  pack: Pack,
  services: CampaignHumanCreatureCommandServices = {},
) {
  aliases(w);
  const before = w.specialists.records.map((n) => [n[21], n[74], n[85]]),
    player = w.players[w.selectedPlayer];
  if (!player) throw Error("Actual human command caller player required");
  const out = issueStagedHumanCreatureTarget(
    w,
    index,
    {
      ...packet,
      callerOwner: byte(player.raw, 1),
      selectedPlayer: w.selectedPlayer,
    },
    campaignHumanCreatureCommandContext(pack, index, services),
  );
  post(w, before);
  return out;
}
export function stopStagedCampaignHumanMule(
  w: CampaignCreatureCommandWorld,
  index: number,
  pack: Pack,
  services: CampaignHumanCreatureCommandServices = {},
) {
  aliases(w);
  const before = w.specialists.records.map((n) => [n[21], n[74], n[85]]),
    out = stopStagedHumanCreature(
      w,
      index,
      {
        argument: 0,
        selectedPlayer: w.selectedPlayer,
        selectedPanelRefresh:
          byte(w.creatureNative[index], 120) !== 0 &&
          w.selectedPlayer === byte(w.creatureNative[index], 24) &&
          (services.selectedPanelRefresh?.(w, index) ?? false),
      },
      campaignHumanCreatureCommandContext(pack, index, services),
    );
  post(w, before);
  return out;
}
/** Whole-host atomic entries for per-packet warning recovery. No host closure
 * may mutate the original world while a staged callback is in flight. */
export function issueCampaignHumanMuleTarget(
  w: CampaignCreatureCommandWorld,
  index: number,
  packet: { target: CreatureCommandReference | null; mode: number },
  pack: Pack,
  services: CampaignHumanCreatureCommandServices = {},
) {
  const staged = structuredClone(w);
  restoreCreatureCommandAliases(staged);
  const out = issueStagedCampaignHumanMuleTarget(
    staged,
    index,
    packet,
    pack,
    services,
  );
  Object.assign(w, staged);
  return out;
}
export function stopCampaignHumanMule(
  w: CampaignCreatureCommandWorld,
  index: number,
  pack: Pack,
  services: CampaignHumanCreatureCommandServices = {},
) {
  const staged = structuredClone(w);
  restoreCreatureCommandAliases(staged);
  const out = stopStagedCampaignHumanMule(staged, index, pack, services);
  Object.assign(w, staged);
  return out;
}

/** Real814A0 binding for the strategic36920 caller, inside its complete host
 * transaction. Never routes AI input through human21E20 producer admission. */
import type { Pack } from "../../content/types";
import {
  aiByte,
  aiDword,
  aiInteger,
  aiSWord,
  type StrategicAIState,
} from "../mechanics/strategic-ai-state";
import {
  applyStagedGenepodCommand,
  genepodCommandPacket,
  type GenepodInputReceipt,
} from "../mechanics/genepod-command";
import type {
  StrategicProductionContext,
  StrategicProductionRequest,
} from "../mechanics/strategic-ai-production";
import type { CampaignWorld } from "./world";
export type CampaignStrategicProductionWorld = Pick<
  CampaignWorld,
  "buildingNative" | "players" | "economy" | "rng"
>;
export interface CampaignStrategicProductionOptions<
  W extends CampaignStrategicProductionWorld = CampaignStrategicProductionWorld,
> {
  panelRefreshEligible?(world: W, slot: number): boolean;
  /** Staged presentation observation only; no birth/audio/gameplay substitute. */
  onReceipt?(world: W, receipt: GenepodInputReceipt): void;
}
/** All source writes are made into held native/player images. Presentation and
 * economy views are read from the resulting bytes, never written back first. */
export function applyStagedCampaignProduction<
  W extends CampaignStrategicProductionWorld,
>(
  w: W,
  pack: Pack,
  s: StrategicAIState,
  request: StrategicProductionRequest,
  options: CampaignStrategicProductionOptions<W> = {},
): GenepodInputReceipt {
  if (
    request.routine !== 0x814a0 ||
    request.command !== 12 ||
    request.parameter !== 1 ||
    ![0, 1, 2].includes(request.role) ||
    !aiInteger(request.player, 0, 3) ||
    !aiInteger(request.building, request.player * 64, request.player * 64 + 63)
  )
    throw Error("Actual strategic36920 production command required");
  const n = s.buildings[request.building],
    player = w.players[request.player],
    raw = s.players[request.player],
    economic = w.economy.players.find((p) => p.id === request.player),
    traits = pack.ecologyRules?.speciesTraits;
  if (
    s.buildings !== w.buildingNative ||
    s.rng !== w.rng ||
    !n ||
    !player ||
    player.id !== request.player ||
    !economic ||
    s.players.length !== w.players.length ||
    s.players.some((p, i) => p !== w.players[i].raw) ||
    aiByte(n, 6) !== 4 ||
    aiByte(n, 45) !== 0 ||
    aiSWord(n, 15) !== request.building ||
    aiByte(n, 24) !== request.player
  )
    throw Error("Strategic production retained campaign binding differs");
  if (!traits) throw Error("Actual Genepod species cost table is unavailable");
  const rng = w.rng,
    buildings = w.buildingNative,
    players = w.players,
    rawRecords = s.players.slice(),
    nativeRecords = buildings.slice(),
    result = applyStagedGenepodCommand(
      { buildings, players: s.players },
      request.player,
      genepodCommandPacket(
        request.species,
        request.building,
        request.parameter,
      ),
      {
        speciesTraits: traits,
        panelRefreshEligible:
          options.panelRefreshEligible?.(w, request.building) === true,
      },
    );
  player.funds = aiDword(raw, 0x4a3);
  player.goop = aiDword(raw, 0x4a7);
  economic.goop = player.goop;
  options.onReceipt?.(w, result);
  if (
    w.rng !== rng ||
    s.rng !== rng ||
    w.buildingNative !== buildings ||
    s.buildings !== buildings ||
    buildings.some((row, i) => row !== nativeRecords[i]) ||
    w.players !== players ||
    w.players.some(
      (p, i) => p.raw !== rawRecords[i] || s.players[i] !== rawRecords[i],
    ) ||
    w.economy.players.find((p) => p.id === request.player) !== economic ||
    buildings[request.building] !== n ||
    w.players[request.player] !== player ||
    player.raw !== raw ||
    s.players[request.player] !== raw
  )
    throw Error(
      "Strategic production service replaced retained campaign records",
    );
  return result;
}
export function makeCampaignStrategicProductionService<
  W extends CampaignStrategicProductionWorld,
>(
  w: W,
  pack: Pack,
  options: CampaignStrategicProductionOptions<W> = {},
): NonNullable<StrategicProductionContext["requestProduction"]> {
  return (s, request) => {
    applyStagedCampaignProduction(w, pack, s, request, options);
    return { ...request };
  };
}

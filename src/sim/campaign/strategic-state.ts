/** Saved strategic storage and a retained view of the actual campaign pools.
 * This module binds state only. It does not bypass the opponent service guard. */
import { loadOpponentStartupAI } from "../mechanics/opponent-startup";
import { aiAssertBytes, aiByte, aiDword, aiSWord, resetStrategicCreatureControl, validateStrategicAIState } from "../mechanics/strategic-ai-state";
import { validateStrategicPlannerMetadata, type StrategicSpecialistPlannerState } from "../mechanics/strategic-ai-specialists-state";
import type { CampaignAuxiliaryMetadata } from "../mechanics/outcome";
import type { CampaignWorld } from "./world";
import { decodeBytes } from "./bytes";

export interface CampaignStrategicStorage {
  schemaVersion: 1;
  records: number[][];
  creatureControl: number[];
  controlProvenance: string;
  specialistPlanner?: StrategicSpecialistPlannerState["specialistPlanner"];
}
/**71B70 reloads all four AI records after its inline72E50 retention reset.
 * A subsequent mission must supply its actual prior control, not the cold one. */
export function createCampaignStrategicStorage(extensionBase64: string, priorControl: readonly number[],
  controlProvenance: string): CampaignStrategicStorage {
  if (!controlProvenance.trim()) throw Error("Actual strategic control provenance required");
  const source = loadOpponentStartupAI(decodeBytes(extensionBase64));
  return { schemaVersion: 1, records: source.records.map(r => r.raw),
    creatureControl: resetStrategicCreatureControl(priorControl), controlProvenance };
}
export function validateCampaignStrategicStorage(storage: CampaignStrategicStorage): void {
  if (storage.schemaVersion !== 1 || storage.records.length !== 4 || typeof storage.controlProvenance !== "string" ||
    !storage.controlProvenance.trim()) throw Error("Invalid saved campaign strategic storage");
  aiAssertBytes(storage.creatureControl, 600, "saved campaign control");
  storage.records.forEach((n, player) => {
    aiAssertBytes(n, 1726, "saved campaign AI record");
    if (aiDword(n, 0) !== 1726 || n[4] !== player) throw Error("Saved strategic record owner differs");
  });
  validateStrategicPlannerMetadata({ records: storage.records, specialistPlanner: storage.specialistPlanner } as StrategicSpecialistPlannerState);
}
export function cloneCampaignStrategicStorage(storage: CampaignStrategicStorage): CampaignStrategicStorage {
  return { ...storage, records: storage.records.map(n => n.slice()), creatureControl: storage.creatureControl.slice(),
    ...(storage.specialistPlanner ? { specialistPlanner: { schemaVersion: 1,
      commandCaches: storage.specialistPlanner.commandCaches.map(n => n.slice()) } } : {}) };
}
export function campaignStrategicAuxiliary(storage: CampaignStrategicStorage): CampaignAuxiliaryMetadata {
  validateCampaignStrategicStorage(storage);
  return { entries: Array.from({ length: 300 }, (_, i) => ({ lowFlags: storage.creatureControl[i * 2] & 7,
    second: storage.creatureControl[i * 2 + 1] })), provenance: storage.controlProvenance };
}
/**Bind only inside an isolated host transaction. The active ecology record is
 * authoritative; retained inactive native slots remain their actual priors. */
export function bindCampaignStrategicState(w: CampaignWorld): StrategicSpecialistPlannerState {
  const storage = w.strategy;
  if (!storage) throw Error("Campaign lacks established strategic state");
  validateCampaignStrategicStorage(storage);
  const occupied = new Set<number>();
  for (const mule of w.ecology.mules) {
    if (occupied.has(mule.index) || !w.creatureNative[mule.index] || aiSWord(mule.native, 15) !== mule.index)
      throw Error("Strategic campaign creature pool identity differs");
    occupied.add(mule.index); w.creatureNative[mule.index] = mule.native;
  }
  const s: StrategicSpecialistPlannerState = { schemaVersion: 1, records: storage.records,
    players: w.players.map(p => p.raw), creatures: w.creatureNative, buildings: w.buildingNative,
    specialists: w.specialists.records.map((native, index) => {
      const binding = w.specialists.bindings[index];
      return { native, blueprint: binding ? { player: binding.owner, index: binding.blueprintIndex } : null };
    }), creatureControl: storage.creatureControl, missionPrefix: w.missionPrefix, rng: w.rng,
    ...(storage.specialistPlanner ? { specialistPlanner: storage.specialistPlanner } : {}) };
  validateStrategicAIState(s); validateStrategicPlannerMetadata(s); return s;
}
/**Publish newly allocated cache metadata and low-bit carry projection. Native
 * records/player/RNG stay held; replacing a pool is a failed service. */
export function publishCampaignStrategicState(w: CampaignWorld, s: StrategicSpecialistPlannerState): void {
  const storage = w.strategy;
  if (!storage || s.records !== storage.records || s.creatureControl !== storage.creatureControl || s.creatures !== w.creatureNative ||
    s.buildings !== w.buildingNative || s.missionPrefix !== w.missionPrefix || s.rng !== w.rng ||
    s.players.some((p, i) => p !== w.players[i].raw) || s.specialists.some((p, i) => p.native !== w.specialists.records[i]))
    throw Error("Strategic host service replaced its retained campaign state");
  validateStrategicAIState(s); validateStrategicPlannerMetadata(s);
  if (s.specialistPlanner) storage.specialistPlanner = s.specialistPlanner;
  w.auxiliary = campaignStrategicAuxiliary(storage);
  //Source AI commands can debit the native player directly. Refresh projections
  //before the ordinary end-of-frame synchronizer writes them back.
  for (const p of w.players) {
    p.funds = aiDword(p.raw, 0x4a3); p.goop = aiDword(p.raw, 0x4a7);
    p.activationCount = aiDword(p.raw, 0x49d); p.progress = (aiByte(p.raw, 0x6e7) << 24) >> 24;
    p.completed = p.raw.slice(0x600, 0x60e); p.owned = p.raw[0x60e] | (p.raw[0x60f] << 8);
    for (const bp of p.blueprints) { const at = 0x16 + bp.index * 36;
      bp.skill = p.raw[at + 23]; bp.maxHealth = p.raw[at + 25]; bp.health = (p.raw[at + 26] << 24) >> 24; bp.runtimeFlags = p.raw[at + 32]; }
    const economyPlayer = w.economy.players.find(e => e.id === p.id); if (economyPlayer) economyPlayer.goop = p.goop;
  }
}

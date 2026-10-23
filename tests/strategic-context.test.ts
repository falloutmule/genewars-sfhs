import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import { encodeBytes } from "../src/sim/campaign/bytes";
import { bindCampaignStrategicState } from "../src/sim/campaign/strategic-state";
import {
  campaignStrategicContext,
  campaignStrategicNative,
  campaignStrategicProtected,
} from "../src/sim/campaign/strategic-context";
import { aiPutDword, aiPutWord } from "../src/sim/mechanics/strategic-ai-state";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { worldCell } from "../src/sim/mechanics/terrain";
import {
  queryStrategicPlantDensity,
  queryStrategicPlantStyle,
} from "../src/sim/mechanics/strategic-ai-spatial";
import type { RuntimeSourceEntity } from "../src/sim/campaign/source-pools";
function fixture() {
  const p = campaignFixture(),
    full = Array(1726 * 4).fill(0);
  for (let i = 0; i < 4; i++) {
    aiPutDword(full, i * 1726, 1726);
    full[i * 1726 + 4] = i;
  }
  p.missions[0].startup!.extensionBase64 = encodeBytes(full.slice(4));
  p.strategicAIRules = {
    schemaVersion: 1,
    groupLimits: Array(6).fill(1),
    speciesGenes: Array.from({ length: 25 }, () => [4, 4]),
    productionWeights: Array.from({ length: 25 }, () => [1, 2, 3, 4, 5]),
    buildingValues: Array.from({ length: 14 }, () => [1, 2, 3]),
    buildingThreatValues: Array.from({ length: 14 }, () => [4, 5, 6]),
    specialistThreatWeights: [1, 2, 3, 4],
    creatureControlPrior: Array(600).fill(0),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  p.strategicEngineerRules = {
    schemaVersion: 1,
    priorities: Array.from({ length: 14 }, () => [1, 2, 3]),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  p.buildingRules = {
    schemaVersion: 1,
    resources: Array.from({ length: 14 }, (_, selector) => ({
      selector,
      path: `synthetic/${selector}.anb`,
      assetKey: "BGENE",
    })).filter((row) => row.selector !== 2),
    unsupportedSelectors: [2],
    upkeep: Array(14).fill(0),
    processingFrontOffset: [0, 0],
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  const w = createCampaign(p, "fixture"),
    s = bindCampaignStrategicState(w),
    c = campaignStrategicContext(w, p);
  return { p, w, s, c };
}
describe("concrete strategic campaign context", () => {
  it("reads real intrusive head order and current native pools", () => {
    const { w, s, c } = fixture(),
      at = worldCell(8192, 8192),
      plant = w.ecology.plants[0].native;
    plant[6] = 2;
    aiPutWord(plant, 15, 0);
    aiPutWord(plant, 7, 8192);
    aiPutWord(plant, 9, 8192);
    insertSpatial(w.spatial, w.terrain, "source:1:0", at);
    const creature = s.creatures[0];
    creature[6] = 1;
    aiPutWord(creature, 15, 0);
    aiPutWord(creature, 7, 8192);
    aiPutWord(creature, 9, 8192);
    insertSpatial(w.spatial, w.terrain, "source:0:0", at);
    expect(c.cellOrder(s, at)).toEqual([
      { kind: 1, index: 0 },
      { kind: 2, index: 0 },
    ]);
    expect(c.entity(s, { kind: 2, index: 0 })).toBe(plant);
    expect(
      queryStrategicPlantDensity(
        s,
        {
          routine: 0x8d930,
          source: 0x34eae,
          point: [8192, 8192],
          radius: 0x500,
          extentSquared: 0x190000,
          mode: 1,
          predicate: 0x32a70,
          group: 0,
        },
        c,
      ).count,
    ).toBe(1);
  });
  it("uses the concrete different protection bodies for all eight kinds", () => {
    const { w, s } = fixture();
    s.creatures[0][94] = 24;
    expect(campaignStrategicProtected(w, s, { kind: 1, index: 0 })).toBe(true);
    aiPutWord(w.ecology.plants[0].native, 44, 1);
    expect(campaignStrategicProtected(w, s, { kind: 2, index: 0 })).toBe(false);
    s.players[0][0x16 + s.specialists[0].blueprint!.index * 36 + 26] = 255;
    expect(campaignStrategicProtected(w, s, { kind: 3, index: 0 })).toBe(true);
    aiPutWord(s.buildings[0], 43, 1);
    expect(campaignStrategicProtected(w, s, { kind: 4, index: 0 })).toBe(false);
    expect(campaignStrategicProtected(w, s, { kind: 5, index: 0 })).toBe(true);
    expect(campaignStrategicProtected(w, s, { kind: 6, index: 0 })).toBe(true);
    const family7 = Array(97).fill(0);
    family7[86] = 3;
    //This unit fixture supplies only the retained family7 fields consumed here.
    w.source.entities.push({
      family: 6,
      index: 0,
      nativeBytes: family7,
    } as RuntimeSourceEntity);
    expect(campaignStrategicProtected(w, s, { kind: 7, index: 0 })).toBe(true);
    family7[86] = 2;
    expect(campaignStrategicProtected(w, s, { kind: 7, index: 0 })).toBe(false);
    expect(campaignStrategicProtected(w, s, { kind: 8, index: 0 })).toBe(false);
  });
  it("uses actual plant research and terrain in the integrated style query", () => {
    const { w, s, c } = fixture();
    aiPutDword(s.players[0], 0x67e, 1);
    const request = {
      routine: 0x8d930 as const,
      source: 0x3510a as const,
      player: 0,
      group: 0,
      point: [8192, 8192] as [number, number],
      radius: 0x500 as const,
      extentSquared: 0x190000 as const,
      mode: 1 as const,
      predicate: 0x32630 as const,
    };
    expect(queryStrategicPlantStyle(s, request, c).style).toBe(0);
    for (let cell = 0; cell < 16384; cell++) w.terrain.bytes[cell * 14 + 5] = 0;
    expect(queryStrategicPlantStyle(s, request, c).style).toBe(12);
  });
  it("rejects missing tables, wrong staged state and malformed source chains", () => {
    const { p, w, s, c } = fixture();
    delete p.strategicAIRules!.buildingThreatValues;
    expect(() => campaignStrategicContext(w, p)).toThrow(/complete/);
    expect(() => c.terrain(structuredClone(s))).toThrow(/different/);
    expect(campaignStrategicNative(w, s, { kind: 1, index: 999 })).toBeNull();
    const cell = worldCell(8192, 8192);
    w.spatial.heads[cell] = "source:0:0";
    expect(() => c.cellOrder(s, cell)).toThrow(/link/);
  });
});

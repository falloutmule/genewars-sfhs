import { campaignFixture } from "./campaign";
import {
  createCampaign,
  enterCampaign,
  type CampaignWorld,
} from "../../src/sim/campaign/world";
import {
  decodeBytes,
  encodeBytes,
  put16,
  put32,
} from "../../src/sim/campaign/bytes";
import { cleanupCampaignReferences } from "../../src/sim/campaign/cleanup";
import { campaignAirborneBuilding } from "../../src/sim/campaign/mule-damage-adapter";
import type { CampaignStrategyServices } from "../../src/sim/campaign/strategic-adapter";
import { initializeCompletedGenepod } from "../../src/sim/mechanics/genepod";
import { groundHeight, worldCell } from "../../src/sim/mechanics/terrain";
import { insertSpatial } from "../../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../../src/sim/campaign/entity-view";
/** Synthetic saved-host inputs, not an original mission/opponent startup. All
 * strategic services remain the actual concrete composition under test. */
export function campaignStrategicFixture(
  options: { computers?: number[]; frame?: number; recruit?: boolean } = {},
) {
  const pack = campaignFixture(),
    computers = options.computers ?? [1, 2],
    full = Array(1726 * 4).fill(0),
    sha = "0".repeat(64);
  for (let player = 0; player < 4; player++) {
    const at = player * 1726;
    put32(full, at, 1726);
    full[at + 4] = player;
    full[at + 0x46] = 64;
    full.fill(64, at + 0x5e7, at + 0x5f5);
    full[at + 0x65f] = 5;
    full[at + 0x628] = 50;
    full[at + 0x632] = 60;
    full[at + 0x633] = 8;
    full[at + 0x634] = 9;
    full[at + 0x657] = 2;
    full[at + 0x658] = 8;
    full[at + 0x6b2] = 255;
    full[at + 0x626] = 2;
    full[at + 0x95] = full[at + 0x6bd] = 1;
    for (let i = 0; i < 8; i++) full[at + 0x666 + i * 7] = 4;
  }
  for (const mission of pack.missions) {
    mission.startup!.extensionBase64 = encodeBytes(full.slice(4));
    mission.startup!.context.activePlayerCount = Math.max(
      1,
      ...computers.map((p) => p + 1),
    );
    for (const player of computers) {
      const raw = decodeBytes(mission.startup!.players[player].recordBase64);
      raw[2] = 1;
      mission.startup!.players[player].recordBase64 = encodeBytes(raw);
    }
  }
  pack.strategicAIRules = {
    schemaVersion: 1,
    groupLimits: [5, 5, 5, 5, 5, 5],
    speciesGenes: Array.from({ length: 25 }, () => [4, 4]),
    productionWeights: Array.from({ length: 25 }, () => [1, 2, 3, 4, 5]),
    buildingValues: Array.from({ length: 14 }, () => [1, 2, 3]),
    buildingThreatValues: Array.from({ length: 14 }, () => [4, 5, 6]),
    specialistThreatWeights: [1, 2, 3, 4],
    creatureControlPrior: Array(600).fill(0),
    provenance: { executableSha256: sha, originalExecution: false },
  };
  pack.strategicEngineerRules = {
    schemaVersion: 1,
    priorities: Array.from({ length: 14 }, () => [1, 2, 3]),
    provenance: { executableSha256: sha, originalExecution: false },
  };
  pack.buildingRules = {
    schemaVersion: 1,
    resources: Array.from({ length: 14 }, (_, selector) => ({
      selector,
      path: `synthetic/${selector}.anb`,
      assetKey: "BGENE",
    })).filter((row) => row.selector !== 2),
    unsupportedSelectors: [2],
    upkeep: Array(14).fill(0),
    processingFrontOffset: [0, 0],
    provenance: { executableSha256: sha, originalExecution: false },
  };
  pack.source.executableSha256 = sha;
  pack.assets.BGENE = structuredClone(pack.assets.TEST);
  pack.assets.BGENE.frames!.push(...structuredClone(pack.assets.BGENE.frames!));
  pack.assets.BGENE.animations![1] = { first: 0, last: 3, rawTrailingWord: 4 };
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: 0,
      gravity: false,
      priority: 1,
      childCode: null,
      movable: false,
      waterResponse: false,
    })),
    provenance: { executableSha256: sha, originalExecution: false },
  };
  pack.ecologyRules!.speciesTraits = Array.from({ length: 25 }, () => {
    const row = Array(45).fill(0);
    put32(row, 32, 75);
    return row;
  });
  const w = createCampaign(pack, "synthetic-strategic-host");
  for (const player of computers) {
    const p = w.players[player],
      raw = p.raw;
    raw[2] = 1;
    raw[3] = 0;
    raw[0x4a1] = player;
    put16(raw, 9, 8192 + player * 512);
    put16(raw, 11, 8192);
    put16(raw, 0x5fc, 8192 + player * 512);
    put16(raw, 0x5fe, 8192);
    p.blueprints = [];
    raw.fill(0, 0x16, 0x496);
    if (options.recruit) {
      const at = 0x16;
      raw[at] = 65;
      raw[at + 22] = 0;
      raw[at + 23] = 60;
      raw[at + 24] = 77;
      raw[at + 25] = raw[at + 26] = 50;
      p.blueprints.push({
        index: 0,
        name: "A",
        style: 0,
        category: 0,
        skill: 60,
        maxHealth: 50,
        health: 50,
        runtimeFlags: 0,
        unresolved: { byte18: 77, byte1b: 0 },
      });
      w.strategy!.records[player][0x65a] = 1;
    }
  }
  enterCampaign(w, pack);
  w.frame = options.frame ?? 0;
  const services: CampaignStrategyServices = {
    effectOptions: (host: CampaignWorld) => ({
      gravity: 512,
      obstacleAt: (point) => !!campaignAirborneBuilding(host, pack, point, -1),
      destructionObstacle: (staged, point, height) => {
        const b = campaignAirborneBuilding(staged, pack, point, height);
        return b ? { position: b.position, ground: b.ground } : null;
      },
      cleanupReferences: cleanupCampaignReferences,
    }),
  };
  return { pack, w, services };
}

/** A synthetic completed save-state assembled with the actual numeric building
 * constructor/completion helper. Player counters and host views are explicit. */
export function addStrategicGenepod(w: CampaignWorld, slot: number) {
  const owner = Math.floor(slot / 64),
    position: [number, number] = [8192 + owner * 512, 8704],
    result = initializeCompletedGenepod(w.buildingNative[slot], {
      slot,
      owner,
      position,
      ground: groundHeight(w.terrain, ...position),
      shade: 64,
    });
  if (!result.ok) throw Error(result.reason);
  const n = w.buildingNative[slot];
  n.splice(0, n.length, ...result.value);
  const b = {
    id: 1000 + slot,
    slot,
    owner,
    selector: 0,
    grade: 0 as const,
    x: position[0],
    y: position[1],
    health: 280,
    complete: true,
    energy: 200,
  };
  w.buildings.push(b);
  w.economy.buildings.push({
    ...b,
    slot: slot % 64,
    disabled: false,
    capacitySuppressed: false,
    hqUpgradeSuppressed: false,
    powered: false,
    extraDrain: 0,
    depleted: false,
    storedGoop: 0,
    specialPowerDelivery: false,
  });
  const p = w.players[owner];
  p.raw[0x4a2]++;
  p.raw[0x600]++;
  p.completed[0]++;
  insertSpatial(
    w.spatial,
    w.terrain,
    `source:3:${slot}`,
    worldCell(...position),
  );
  synchronizeCampaignLinks(w);
  return b;
}

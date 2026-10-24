/**Public synthetic serialized processor state; no original bytes/assets. */
import { campaignFixture } from "./campaign";
import {
  createCampaign,
  type CampaignWorld,
} from "../../src/sim/campaign/world";
import { type EffectSchedulerOptions } from "../../src/sim/campaign/effect-scheduler";
import { cleanupCampaignReferences } from "../../src/sim/campaign/cleanup";
import { synchronizeCampaignLinks } from "../../src/sim/campaign/entity-view";
import { insertSpatial } from "../../src/sim/campaign/spatial";
import { worldCell, groundHeight } from "../../src/sim/mechanics/terrain";
import { put16, put32 } from "../../src/sim/campaign/bytes";
import { planBotanistPlantCreation } from "../../src/sim/mechanics/botanist";
export function processorFixture(selector: 2 | 4 = 2, grade: 0 | 1 | 2 = 0) {
  const pack = campaignFixture();
  pack.buildingRules = {
    schemaVersion: 1,
    unsupportedSelectors: [9],
    upkeep: Array(14).fill(1),
    processingFrontOffset: [-256, 0],
    resources: Array.from({ length: 14 }, (_, selector) => ({
      selector,
      assetKey: "SYNTHPROCESSOR",
      path: `synthetic/${selector}.ANB`,
    })).filter((x) => x.selector !== 9),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  const frames = Array.from({ length: 10 }, () => ({
    components: [],
    width: 1,
    height: 1,
    rawFlags: [0, 0, 0],
  }));
  pack.assets.SYNTHPROCESSOR = {
    ...pack.assets.TEST,
    frames,
    animations: [3, 10, 10, 9, 3, 4].map((n) => ({
      first: 0,
      last: n - 1,
      rawTrailingWord: n,
    })),
  };
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 10 }, () => ({
      ...frames[0],
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 71 }, () => ({
      first: 0,
      last: 0,
      rawTrailingWord: 1,
    })),
  };
  for (const [code, count] of [
    [10, 4],
    [25, 2],
    [26, 5],
    [27, 8],
    [36, 3],
  ]) {
    const first = pack.assets.EFF.frames!.length;
    pack.assets.EFF.frames!.push(
      ...Array.from({ length: count }, () => ({
        ...frames[0],
        rawFlags: [code === 26 ? 1 : 0, 0, 0],
      })),
    );
    pack.assets.EFF.animations![code] = {
      first,
      last: first + count - 1,
      rawTrailingWord: count,
    };
  }
  pack.effectRules = {
    schemaVersion: 1,
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: code === 36 ? 6 : code === 67 || code === 68 ? 5 : 0,
      gravity: [36, 67, 68].includes(code),
      priority: code === 10 ? 25 : 1,
      childCode: null,
      movable: [36, 67, 68].includes(code),
      waterResponse: [36, 67, 68].includes(code),
    })),
  };
  pack.ecologyRules!.corpseFriction = Array(8).fill(512);
  const w = createCampaign(pack, "synthetic-processor");
  w.phase = "active";
  w.frame = w.tick = 2;
  const n = w.buildingNative[0];
  n.fill(0);
  n.fill(null, 31, 39);
  n[6] = 4;
  n[45] = selector;
  n[46] = n[47] = grade;
  n[25] = grade + 1;
  put16(n as number[], 7, 8448);
  put16(n as number[], 9, 8192);
  put32(n as number[], 17, groundHeight(w.terrain, 8448, 8192));
  put16(n as number[], 43, 160);
  put16(n as number[], 49, 5);
  put16(n as number[], 61, 200);
  w.buildings.push({
    id: 2000,
    slot: 0,
    owner: 0,
    selector,
    grade,
    x: 8448,
    y: 8192,
    health: 160,
    complete: true,
    energy: 200,
  });
  w.economy.buildings.push({
    ...w.buildings[0],
    disabled: false,
    capacitySuppressed: false,
    hqUpgradeSuppressed: false,
    powered: true,
    extraDrain: 0,
    depleted: false,
    storedGoop: 0,
    specialPowerDelivery: false,
  });
  w.players[0].completed[selector] = w.players[0].raw[0x600 + selector] = 1;
  put16(w.players[0].raw, 0x60e, 1 << selector);
  w.players[0].owned = 1 << selector;
  insertSpatial(w.spatial, w.terrain, "source:3:0", worldCell(8448, 8192));
  synchronizeCampaignLinks(w);
  const options: EffectSchedulerOptions<CampaignWorld> = {
    gravity: 512,
    obstacleAt: () => false,
    destructionObstacle: () => null,
    cleanupReferences: cleanupCampaignReferences,
    stageHost: (original, staged) =>
      Object.assign(staged, structuredClone(original)),
    commitHost: (target, staged) => Object.assign(target, staged),
  };
  return { w, pack, options, services: { effectOptions: () => options } };
}
export function processorPlant(
  f: ReturnType<typeof processorFixture>,
  payload = 7,
  position: [number, number] = [8192, 8192],
) {
  const { w } = f,
    p = w.ecology.plants[0],
    plan = planBotanistPlantCreation(p.native, 0, 4, 0, position, w.terrain);
  p.native.splice(0, 49, ...plan.native);
  p.native[48] = payload;
  Object.assign(p, {
    active: true,
    owner: 4,
    position: plan.position,
    selector: 0,
    growth: 4,
    plantFlags: p.native[46]!,
    updateCounter: 0,
    retirement: 0,
    frame: 0,
    animation: 0,
    flags: 0,
    shade: p.native[23]!,
    height: groundHeight(w.terrain, ...position),
  });
  w.ecology.plantCount = 1;
  put16(w.missionPrefix, 0x3552, 1);
  insertSpatial(w.spatial, w.terrain, "source:1:0", worldCell(...position));
  synchronizeCampaignLinks(w);
  return p;
}

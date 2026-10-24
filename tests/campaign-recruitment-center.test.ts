import {beforeAll, describe, expect, it} from "vitest";
import {campaignFixture} from "./fixtures/campaign";
import {createCampaign, enterCampaign, stepCampaign, queueCampaign, type CampaignWorld} from "../src/sim/campaign/world";
import {createStagedCampaignEngineerBuilding, progressCampaignEngineerBuilding} from "../src/sim/campaign/engineer-adapter";
import type {CampaignSpecialistServices} from "../src/sim/campaign/specialist-adapter";
import {cleanupCampaignReferences} from "../src/sim/campaign/cleanup";
import {put16, put32, i16, u32} from "../src/sim/campaign/bytes";
import {reserveSite, groundHeight, worldCell} from "../src/sim/mechanics/terrain";
import {saveCampaign, loadCampaign, recordCampaign, sealCampaignReplay, replayCampaign} from "../src/sim/campaign/persistence";
import {checksum} from "../src/sim/checksum";

/**Synthetic artwork, profiles and progression. This does not accept a mission. */
function fixture() {
  const pack = campaignFixture(), sha = "0".repeat(64), frame = structuredClone(pack.assets.TEST.frames![0]);
  pack.rules!.tables.buildingFootprints[5] = 2;
  pack.rules!.tables.constructionCosts[5] = 600;
  for (let grade = 0; grade < 3; grade++) {pack.rules!.tables.buildingHealth[15 + grade] = 160 << grade; pack.rules!.tables.buildingProgressThresholds[15 + grade] = 3;}
  pack.buildingRules = {schemaVersion: 1, resources: Array.from({length: 14}, (_, selector) => ({selector,
    path: `SYNTHETIC/${selector}.ANB`, assetKey: selector === 5 ? "CENTER_TEST" : "TEST"})).filter(r => r.selector !== 9),
    unsupportedSelectors: [9], upkeep: Array(14).fill(1), processingFrontOffset: [-256, 0],
    provenance: {executableSha256: sha, originalExecution: false}};
  pack.assets.CENTER_TEST = {...structuredClone(pack.assets.TEST), frames: Array.from({length: 3}, () => ({...structuredClone(frame), sourceSize: [8, 8]})),
    animations: Array.from({length: 5}, () => ({first: 0, last: 2, rawTrailingWord: 3}))};
  const eff = structuredClone(pack.assets.EFF); eff.frames = [];
  eff.animations = Array.from({length: 71}, (_, code) => {
    const count = ({6: 13, 26: 5, 44: 9, 47: 6, 51: 23, 64: 5} as Record<number, number>)[code] ?? 1, first = eff.frames!.length;
    for (let i = 0; i < count; i++) eff.frames!.push({...structuredClone(frame), rawFlags: [code === 26 || code === 64 ? 1 : 0, 0, 0]});
    return {first, last: first + count - 1, rawTrailingWord: count};
  }); pack.assets.EFF = eff;
  pack.specialistRecruitmentRules = {schemaVersion: 1, associatedLandingOffset: [0, 768], landingSite: {
    directionIndices: [0, 1, 2, 3, 4, 5, 6, 7], directions: [[256, 0], [0, 256], [-256, 0], [-256, 0], [0, -256], [0, -256], [256, 0], [256, 0], [0, 0]],
    textures: [10, 11, 12, 13, 14, 15, 16, 17, 18], orientations: Array(9).fill(0)},
    provenance: {executableSha256: sha, originalExecution: false, associatedLandingOffset: {object: 3, objectOffset: 0x124f0, bytes: 4, sha256: sha}}};
  pack.effectRules = {schemaVersion: 1, descriptors: Array.from({length: 71}, (_, code) => ({code,
    retirementMode: code === 64 ? 6 : 0, gravity: code === 64, priority: code === 51 ? 2 : 1,
    childCode: code === 64 ? 51 : null, movable: code === 64, waterResponse: code === 64})),
    provenance: {executableSha256: sha, originalExecution: false}};
  const world = createCampaign(pack, "synthetic-campaign-recruitment-center"); enterCampaign(world, pack);
  for (let i = 0; i < 200; i++) stepCampaign(world, pack);
  expect(world.phase, JSON.stringify(world.notices)).toBe("active");
  world.players[0].progress = world.players[0].raw[0x6e7] = 3;
  world.players[0].completed[0] = world.players[0].raw[0x600] = 1;
  world.missionPrefix[0x1ebd] = 15;
  const services: CampaignSpecialistServices = {effectOptions: () => ({gravity: 512, obstacleAt: () => false,
    destructionObstacle: () => null, cleanupReferences: cleanupCampaignReferences})};
  function center(w: CampaignWorld) {
    reserveSite(w.terrain, [10240, 8192], 2, pack.rules!.tables.terrainBorder);
    const made = createStagedCampaignEngineerBuilding(w, pack, services, {code: 44, owner: 0, selector: 5, point: [10240, 8192], height: groundHeight(w.terrain, 10240, 8192)});
    expect(made?.buildingSlot).toBe(0);
    expect(progressCampaignEngineerBuilding(w, pack, 0, 160, services).completed).toBe(true);
    const n = w.buildingNative[0], b = w.buildings.find(b => b.slot === 0)!, e = w.economy.buildings.find(b => b.id === 1000)!;
    put16(n as number[], 49, 5); put16(n as number[], 61, 200); b.energy = e.energy = 200; e.powered = true;
    n[60] = 0;
    return n;
  }
  return {pack, world, services, center};
}
describe("ordinary campaign Recruitment Center host", () => {
  let start: ReturnType<typeof fixture>;
  beforeAll(() => {start = fixture();});
  it("dispatches native5 once in owner order and retains callback state across full saves and replay", () => {
    const w = structuredClone(start.world), n = start.center(w), replay = recordCampaign(w, null);
    const loaded = loadCampaign(saveCampaign(w, {paused: true, speed: 1, accumulator: 0}), w.contentHash).world;
    stepCampaign(w, start.pack); stepCampaign(loaded, start.pack);
    expect(w.phase, JSON.stringify(w.notices)).toBe("active"); expect(i16(w.buildingNative[0] as number[], 61)).toBe(199);
    expect(w.players[0].completed[5]).toBe(1); expect(w.buildings[0].selector).toBe(5);
    expect(checksum(loaded)).toBe(checksum(w)); expect(checksum(replayCampaign(sealCampaignReplay(replay, w), start.pack, w.contentHash))).toBe(checksum(w));
    expect(n[51]).toBeDefined();
  });
  it("uses real7F480 from request2 without reinitializing deployed specialists", () => {
    const w = structuredClone(start.world); start.center(w); w.buildingNative[0][60] = 2;
    w.players[0].raw[0x498] = 0; put32(w.players[0].raw, 0x499, 0);
    const before = w.specialists.records.map(n => n.slice(112, 114)), replay = recordCampaign(w, null);
    stepCampaign(w, start.pack);
    expect(w.phase, JSON.stringify(w.notices)).toBe("active"); expect(w.buildingNative[0][60]).toBe(0);
    expect(w.players[0].raw[0x498]).toBe(5);
    const slot = i16(w.players[0].raw, 0x496), effect = w.powerEffects.slots[slot].nativePrior!;
    expect([effect[69], effect[73], i16(effect as number[], 71)]).toEqual([49, 4, 0]);
    expect(w.specialists.records.map(n => n.slice(112, 114))).toEqual(before);
    expect(checksum(replayCampaign(sealCampaignReplay(replay, w), start.pack, w.contentHash))).toBe(checksum(w));
  });
  it("queues human selection and associated deployment through native5 with ordinary landing and continuation", () => {
    const w = structuredClone(start.world); start.center(w);
    w.players[0].raw[0x498] = 0; put32(w.players[0].raw, 0x499, 0);
    const replay = recordCampaign(w, null), commands = [
      {type: "roster-select" as const, blueprintIndex: 1},
      {type: "roster-target" as const, point: [10240, 8960] as [number, number]},
      {type: "roster-deploy" as const, deployment: 1 as const, associatedBuilding: 0},
    ];
    for (const command of commands) {expect(queueCampaign(w, command).ok).toBe(true); replay.commands.push({tick: w.tick, type: "command", command});}
    const loaded = loadCampaign(saveCampaign(w, {paused: true, speed: 1, accumulator: 0}), w.contentHash).world;
    for (let i = 0; i < 200; i++) {stepCampaign(w, start.pack); stepCampaign(loaded, start.pack);}
    expect(w.phase, JSON.stringify(w.notices)).toBe("active"); expect(w.actors.filter(a => a.ready)).toHaveLength(3);
    expect(w.players[0].raw[3]).toBe(3); expect(w.buildingNative[0][60]).toBe(1);
    expect(u32(w.players[0].raw, 0x49d)).toBeGreaterThan(1);
    expect(checksum(loaded)).toBe(checksum(w)); expect(checksum(replayCampaign(sealCampaignReplay(replay, w), start.pack, w.contentHash))).toBe(checksum(w));
  });
  it("constructs both terrain sites through the ordinary Engineer command, with live-work continuation and full replay", () => {
    const w = structuredClone(start.world), funds = w.players[0].funds;
    put16(w.terrain.bytes, worldCell(10240, 8192) * 14 + 2, 1120);
    put16(w.terrain.bytes, worldCell(10240, 8960) * 14 + 2, 1152);
    const replay = recordCampaign(w, null), command = {type: "construct" as const, actorId: 0, selector: 5 as const,
      point: [10367, 8319] as [number, number], queued: false};
    expect(queueCampaign(w, command).ok).toBe(true); replay.commands.push({tick: w.tick, type: "command", command});
    const stages = new Set<number>(); let resumed: CampaignWorld | null = null, saveFrame: number | null = null;
    for (let i = 0; i < 2000; i++) {
      stepCampaign(w, start.pack); if (resumed) stepCampaign(resumed, start.pack);
      expect(w.phase, JSON.stringify(w.notices.slice(-5))).toBe("active");
      const stage = w.specialists.records[0][136]!; stages.add(stage);
      if (!resumed && stage === 2) {resumed = loadCampaign(saveCampaign(w, {paused: true, speed: 1, accumulator: 0}), w.contentHash).world; saveFrame = w.frame;}
      if (w.buildings.some(b => b.selector === 5 && b.complete) && !(w.specialists.records[0][88]! & 1)) break;
    }
    expect(stages.has(1)).toBe(true); expect(stages.has(2)).toBe(true); expect(saveFrame).not.toBeNull();
    expect(w.buildings.find(b => b.selector === 5)?.complete).toBe(true); expect(w.players[0].completed[5]).toBe(1);
    expect(w.players[0].funds).toBe(funds - (600 - 2 * w.players[0].blueprints[0].skill));
    expect(checksum(resumed)).toBe(checksum(w)); expect(checksum(replayCampaign(sealCampaignReplay(replay, w), start.pack, w.contentHash))).toBe(checksum(w));
  }, 60000);
});

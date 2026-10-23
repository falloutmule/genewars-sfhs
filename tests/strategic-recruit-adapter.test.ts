import { describe, it, expect } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign, type CampaignWorld } from "../src/sim/campaign/world";
import { bindCampaignStrategicState } from "../src/sim/campaign/strategic-state";
import { recruitStrategicSpecialist } from "../src/sim/mechanics/strategic-ai-recruit";
import { initializeSpecialistNative } from "../src/sim/mechanics/specialist-native";
import {
  campaignStrategicRecruitServices,
  prepareStagedCampaignStrategicRoster,
  prepareCampaignStrategicRoster,
  activateStagedCampaignSpecialists,
} from "../src/sim/campaign/strategic-recruit-adapter";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import {
  encodeBytes,
  put16,
  put32,
  i16,
  u16,
  u32,
} from "../src/sim/campaign/bytes";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";
import type { CampaignSpecialistServices } from "../src/sim/campaign/specialist-adapter";
import { checksum } from "../src/sim/checksum";

function fixture() {
  const pack = campaignFixture(),
    records = Array(1726 * 4).fill(0);
  for (let owner = 0; owner < 4; owner++) {
    put32(records, owner * 1726, 1726);
    records[owner * 1726 + 4] = owner;
  }
  pack.missions.forEach(
    (m) => (m.startup!.extensionBase64 = encodeBytes(records.slice(4))),
  );
  pack.strategicAIRules = {
    schemaVersion: 1,
    groupLimits: Array(6).fill(0),
    creatureControlPrior: Array(600).fill(0),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  const w = createCampaign(pack, "synthetic-recruit"),
    raw = w.players[1].raw;
  w.frame = 1;
  w.specialistOrigin = [1024, 2048];
  raw[2] = 1;
  raw[3] = 0;
  put16(raw, 9, 12000);
  put16(raw, 11, 13000);
  raw.fill(0, 0x16, 0x16 + 32 * 36);
  w.players[1].blueprints = [];
  function bp(index: number, category: 0 | 1 | 2 | 3) {
    const at = 0x16 + index * 36;
    raw[at] = 65 + index;
    raw[at + 21] = 0;
    raw[at + 22] = category;
    raw[at + 23] = 60;
    raw[at + 24] = 77;
    raw[at + 25] = 50;
    raw[at + 26] = 50;
    w.players[1].blueprints.push({
      index,
      name: String.fromCharCode(65 + index),
      style: 0,
      category,
      skill: 60,
      maxHealth: 50,
      health: 50,
      runtimeFlags: 0,
      unresolved: { byte18: 77, byte1b: 0 },
    });
  }
  bp(0, 0);
  bp(1, 3);
  w.strategy!.records[1][0x65a] = 1;
  w.strategy!.records[1][0x65d] = 1;
  const services: CampaignSpecialistServices = { effectOptions: options };
  function options(
    _world: CampaignWorld,
  ): EffectSchedulerOptions<CampaignWorld> {
    return {
      gravity: 512,
      obstacleAt: () => false,
      destructionObstacle: () => null,
      cleanupReferences: cleanupCampaignReferences,
      stageHost: (original, staged) =>
        Object.assign(staged, structuredClone(original)),
      commitHost: (target, staged) => Object.assign(target, staged),
      onLandingEvent: (host, _landing, event) => {
        if (event.type === "activate")
          activateStagedCampaignSpecialists(host, event.owner, pack, services);
      },
    };
  }
  return { pack, w, raw, services, bp };
}
function fillEffects(w: CampaignWorld, newborn: boolean) {
  for (let slot = 0; slot < 200; slot++) {
    const n = w.powerEffects.slots[slot].nativePrior!;
    n[6] = 5;
    n[69] = 6;
    n[21] = newborn ? 1 : 0;
    put16(n as number[], 15, slot);
    put16(n as number[], 7, 8192);
    put16(n as number[], 9, 8192);
    w.powerEffects.slots[slot].occupied = true;
    insertSpatial(w.spatial, w.terrain, `source:4:${slot}`, 32 * 128 + 32);
  }
  put16(w.missionPrefix, 0x3554, 200);
}
describe("campaign strategic recruit binding", () => {
  it("extracts4FD30 independently of roster/landing/resource-reset writes and preserves unknown priors", () => {
    const { pack, w, raw } = fixture(),
      n = w.specialists.records[5];
    n[30] = 37;
    n[150] = 93;
    n[74] = 255;
    put16(n as number[], 63, 123);
    n[67] = 101;
    n[68] = 201;
    const before = n.slice(),
      player = raw.slice(),
      out = initializeSpecialistNative(
        n,
        raw,
        {
          slot: 5,
          blueprintIndex: 0,
          origin: { position: [1000, -2000], height: 12345, shade: 39 },
        },
        pack.rules!.tables,
      );
    expect(n).toEqual(before);
    expect(raw).toEqual(player);
    expect(out.native[6]).toBe(3);
    expect(i16(out.native as number[], 15)).toBe(5);
    expect([
      i16(out.native as number[], 7),
      i16(out.native as number[], 9),
    ]).toEqual([1000, -2000]);
    expect(u16(out.native as number[], 21)).toBe(0x280);
    expect(out.native[25]).toBe(0);
    expect(u16(out.native as number[], 112)).toBe(0);
    expect(out.native[150]).toBe(93);
    expect([
      out.native[30],
      out.native[67],
      out.native[68],
      i16(out.native as number[], 63),
    ]).toEqual([37, 101, 201, 123]);
    expect(out.native[74]).toBe(59);
    expect(out.binding).toMatchObject({
      owner: 1,
      blueprintIndex: 0,
      category: 0,
      assetKey: "TEST",
    });
  });
  it("binds the source-selected firstfree slot without double roster append or replacing native/player records", () => {
    const { pack, w, raw, services } = fixture(),
      s = bindCampaignStrategicState(w),
      held = w.specialists.records[5],
      pool = w.specialists.records,
      bindings = w.specialists.bindings,
      players = w.players;
    held[150] = 91;
    const draws = w.rng.draws;
    expect(
      recruitStrategicSpecialist(
        s,
        1,
        0,
        campaignStrategicRecruitServices(w, pack, services),
      ),
    ).toBe(true);
    expect(w.specialists.records).toBe(pool);
    expect(w.specialists.records[5]).toBe(held);
    expect(w.specialists.bindings).toBe(bindings);
    expect(w.players).toBe(players);
    expect(s.players[1]).toBe(raw);
    expect(raw[3]).toBe(1);
    expect(raw[4]).toBe(5);
    expect(raw[0x16 + 32] & 1).toBe(1);
    expect(s.specialists[5].blueprint).toEqual({ player: 1, index: 0 });
    expect(w.rng.draws).toBe(draws);
    expect(held[150]).toBe(91);
    expect(held[25]).toBe(0);
    expect(held[112]).toBe(0);
    expect(w.actors.find((a) => a.id === 5)).toMatchObject({
      owner: 1,
      blueprintIndex: 0,
      art: "TEST",
      ready: false,
    });
    expect(w.builders.find((b) => b.id === 5)?.motion).toBe(
      w.actors.find((a) => a.id === 5)!.motion,
    );
  });
  it("runs32E60 with real49 factory, retained priors, resource bindings, audio and sharedspatial publication", () => {
    const { pack, w, raw, services } = fixture(),
      n = w.specialists.records[5],
      e = w.powerEffects.slots[0].nativePrior!,
      rng = structuredClone(w.rng),
      players = w.players,
      pool = w.specialists.records;
    n[30] = 37;
    n[150] = 91;
    e[30] = 43;
    e[67] = 3;
    e[68] = 9;
    const out = prepareStagedCampaignStrategicRoster(w, 1, pack, services);
    expect(out.selected).toEqual([
      { category: 0, blueprint: 0, created: true },
      { category: 3, blueprint: 1, created: true },
    ]);
    expect(raw[3]).toBe(2);
    expect(raw.slice(4, 6)).toEqual([5, 6]);
    expect(w.players).toBe(players);
    expect(w.players[1].raw).toBe(raw);
    expect(w.specialists.records).toBe(pool);
    expect(w.specialists.records[5]).toBe(n);
    expect(w.powerEffects.slots[0].nativePrior).toBe(e);
    expect(n[150]).toBe(0);
    expect(n[30]).toBe(37);
    expect(n[25]).toBe(8);
    expect(u16(n as number[], 112)).toBe(0x400);
    expect([i16(n as number[], 7), i16(n as number[], 9)]).toEqual([
      12000, 13000,
    ]);
    expect([e[69], e[30], e[67], e[68], e[73], e[76]]).toEqual([
      49, 43, 3, 9, 0, 0,
    ]);
    expect(w.landings).toHaveLength(1);
    expect(w.landings[0].native).toBe(e);
    expect(u16(w.missionPrefix, 0x3554)).toBe(1);
    expect(raw[0x498]).toBe(5);
    expect(w.rng).toEqual(rng);
    expect(w.audio.requests.at(-1)).toMatchObject({
      cue: 80,
      mode: 2,
      parameter: 255,
      gain: 127,
      range: 180,
    });
    expect(out.events.at(-1)).toEqual({
      type: "landing-created",
      owner: 1,
      slot: 0,
    });
    validateSpatial(w.spatial);
  });
  it("capacity miss persists real recruitment and80830 prefix afterimages without inventing a landing", () => {
    const { pack, w, raw, services } = fixture();
    fillEffects(w, true);
    const rng = structuredClone(w.rng);
    const out = prepareCampaignStrategicRoster(w, 1, pack, services);
    expect(out.landingRequested).toBe(true);
    expect(out.events.at(-1)).toEqual({ type: "landing-capacity", owner: 1 });
    expect(w.players[1].raw[3]).toBe(2);
    expect(w.strategy!.records[1][0x69e]).toBe(1);
    expect(w.specialists.records[5][113]! & 4).toBe(4);
    expect(w.players[1].raw[0x498]).toBe(0);
    expect(w.landings).toHaveLength(0);
    expect(w.audio.requests).toHaveLength(0);
    expect(w.rng).toEqual(rng);
    expect(raw[3]).toBe(0); //Atomic commit replaced the outside old afterimage, not its held staged copy.
  });
  it("activation uses actual associated center plus pending74A50 move and exact metadata, keeping cached height", () => {
    const { pack, w, raw, services } = fixture();
    prepareStagedCampaignStrategicRoster(w, 1, pack, services);
    const held = w.specialists.records[5],
      ground = u32(held as number[], 17),
      height = u32(held as number[], 39),
      draws = w.rng.draws;
    const out = activateStagedCampaignSpecialists(w, 1, pack, services);
    expect(out.activated).toEqual([5, 6]);
    expect(w.rng.draws - draws).toBe(2);
    expect(w.specialists.records[5]).toBe(held);
    expect([i16(held as number[], 7), i16(held as number[], 9)]).toEqual([
      12000, 13000,
    ]);
    expect([i16(held as number[], 11), i16(held as number[], 13)]).toEqual(
      out.candidates[0].point,
    );
    expect(held[87]! & 2).toBe(2);
    expect(held[91]).toBe(0);
    expect(held[112]! & 1).toBe(1);
    expect(held[113]! & 4).toBe(0);
    expect([u32(held as number[], 17), u32(held as number[], 39)]).toEqual([
      ground,
      height,
    ]);
    expect(raw[0x16 + 27]).toBe(77);
    expect(u32(raw, 0x16 + 28)).toBe(1);
    expect(raw[0x16 + 32] & 3).toBe(3);
    expect(u32(raw, 0x49d)).toBe(1);
    expect(w.builders.find((b) => b.id === 5)?.enabled).toBe(true);
    expect(w.spatial.nodes["source:2:5"]).toBeDefined();
    validateSpatial(w.spatial);
  });
  it("frame0 human special entry activates immediately, sets49D=1 and creates no shared carrier", () => {
    const { pack, w, raw, services } = fixture();
    w.frame = 0;
    raw[2] = 0;
    put32(w.missionPrefix, 0x1ec2, 50);
    const out = prepareStagedCampaignStrategicRoster(w, 1, pack, services);
    expect(out.events.at(-1)).toMatchObject({
      type: "specialists-activated",
      owner: 1,
      slots: [5, 6],
      immediate: true,
    });
    expect(w.landings).toHaveLength(0);
    expect(u32(raw, 0x49d)).toBe(1);
    expect(w.audio.requests).toHaveLength(0);
    expect(w.actors.find((a) => a.id === 5)!.motion.x).not.toBe(12000);
    expect(w.specialists.records[5][87]! & 2).toBe(0);
    expect(w.spatial.nodes["source:2:5"]).toBeDefined();
  });
  it("reinforcement prefix/activation skips already-ready actors and adds only the new source slot", () => {
    const { pack, w, raw, services, bp } = fixture();
    prepareStagedCampaignStrategicRoster(w, 1, pack, services);
    activateStagedCampaignSpecialists(w, 1, pack, services);
    const existing = w.specialists.records[5],
      old = w.actors.find((a) => a.id === 5)!,
      point = old.motion;
    bp(2, 0);
    w.strategy!.records[1][0x65a] = 2;
    const result = prepareStagedCampaignStrategicRoster(w, 1, pack, services);
    expect(result.selected).toEqual([
      { category: 0, blueprint: 2, created: true },
    ]);
    expect(w.specialists.records[5]).toBe(existing);
    expect(old.motion).toBe(point);
    expect(
      activateStagedCampaignSpecialists(w, 1, pack, services).activated,
    ).toEqual([7]);
    expect(u32(raw, 0x16 + 28)).toBe(1);
    expect(u32(raw, 0x16 + 2 * 36 + 28)).toBe(1);
    expect(
      Object.keys(w.spatial.nodes)
        .filter((id) => id.startsWith("source:2:"))
        .sort(),
    ).toEqual(["source:2:5", "source:2:6", "source:2:7"]);
  });
  it("rolls back all native/player/strategy/spatial state after real effect replacement cleanup then missing EFF", () => {
    const { pack, w, raw, services } = fixture();
    fillEffects(w, false);
    const held = w.specialists.records[0];
    put16(held as number[], 77, 0);
    held[79] = 5;
    const before = JSON.stringify(w),
      pool = w.specialists.records,
      spatial = w.spatial,
      prior = w.powerEffects.slots[0].nativePrior;
    delete pack.assets.EFF;
    expect(() => prepareCampaignStrategicRoster(w, 1, pack, services)).toThrow(
      /EFF/,
    );
    expect(JSON.stringify(w)).toBe(before);
    expect(w.players[1].raw).toBe(raw);
    expect(w.specialists.records).toBe(pool);
    expect(w.specialists.records[0]).toBe(held);
    expect(w.spatial).toBe(spatial);
    expect(w.powerEffects.slots[0].nativePrior).toBe(prior);
  });
  it("performs real capacityreplacement while preserving the preallocation effect record and native/player identities", () => {
    const { pack, w, raw, services } = fixture();
    fillEffects(w, false);
    const prior = w.powerEffects.slots[0].nativePrior!,
      actor = w.specialists.records[0];
    put16(actor as number[], 77, 0);
    actor[79] = 5;
    const out = prepareStagedCampaignStrategicRoster(w, 1, pack, services);
    expect(out.events.at(-1)).toEqual({
      type: "landing-created",
      owner: 1,
      slot: 0,
    });
    expect(w.powerEffects.slots[0].nativePrior).toBe(prior);
    expect(prior[69]).toBe(49);
    expect(w.specialists.records[0]).toBe(actor);
    expect(actor[79]).toBe(0);
    expect(w.players[1].raw).toBe(raw);
    expect(u16(w.missionPrefix, 0x3554)).toBe(200);
    validateSpatial(w.spatial);
  });
  it("rejects foreign state/provider binding and exact unadmitted selector64 branch with full rollback", () => {
    const { pack, w, raw, services } = fixture(),
      s = bindCampaignStrategicState(w),
      ports = campaignStrategicRecruitServices(w, pack, services);
    const foreign = structuredClone(s);
    expect(() =>
      ports.createSpecialist!(foreign, {
        routine: 0x4fd30,
        player: 1,
        slot: 5,
        blueprint: 0,
      }),
    ).toThrow(/retained/);
    raw[2] = 0;
    put32(w.missionPrefix, 0x1ec2, 50);
    const before = JSON.stringify(w);
    expect(() => prepareCampaignStrategicRoster(w, 1, pack, services)).toThrow(
      /selector64/,
    );
    expect(JSON.stringify(w)).toBe(before);
  });
  it("refuses an inconsistent source sharedcount instead of selecting a different allocator branch", () => {
    const { pack, w, services } = fixture();
    put16(w.missionPrefix, 0x3554, 200);
    const before = JSON.stringify(w);
    expect(() => prepareCampaignStrategicRoster(w, 1, pack, services)).toThrow(
      /shared pool count/,
    );
    expect(JSON.stringify(w)).toBe(before);
  });
  it("rolls back actual landingcontact and candidate RNG when a retained work state needs an unavailable cancellation", () => {
    const { pack, w, raw, services } = fixture();
    prepareStagedCampaignStrategicRoster(w, 1, pack, services);
    const held = w.specialists.records[5],
      landing = w.landings[0];
    held[130] = 1;
    landing.height = 2048 + 136;
    put32(landing.native! as number[], 39, landing.height);
    const before = JSON.stringify(w),
      spatial = w.spatial;
    expect(() =>
      stepEffectScheduler(w, pack, services.effectOptions(w)),
    ).toThrow(/cancellation/);
    expect(JSON.stringify(w)).toBe(before);
    expect(w.specialists.records[5]).toBe(held);
    expect(w.players[1].raw).toBe(raw);
    expect(w.landings[0]).toBe(landing);
    expect(w.spatial).toBe(spatial);
  });
  it("saves and reloads a real recruitment, runs shared landing callbacks and activates through the existing scheduler", () => {
    const { pack, w, services } = fixture();
    prepareStagedCampaignStrategicRoster(w, 1, pack, services);
    const loaded = loadCampaign(
      saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
      "synthetic-recruit",
    ).world;
    for (let tick = 0; tick < 190; tick++) {
      w.frame++;
      loaded.frame++;
      stepEffectScheduler(w, pack, services.effectOptions(w));
      stepEffectScheduler(loaded, pack, services.effectOptions(loaded));
    }
    expect(checksum(loaded)).toBe(checksum(w));
    expect(w.actors.filter((a) => a.owner === 1).every((a) => a.ready)).toBe(
      true,
    );
    expect(w.landings[0].phase).toBe(1);
    expect(w.players[1].activationCount).toBe(1);
    expect(w.specialists.records[5][87]! & 2).toBe(2);
    validateSpatial(w.spatial);
  });
});

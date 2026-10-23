import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  activateStagedCampaignSpecialists,
  prepareStagedCampaignStrategicRoster,
} from "../src/sim/campaign/strategic-recruit-adapter";
import { cloneSpecialistPool } from "../src/sim/mechanics/specialist-native";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { encodeBytes, i16, u32, put16, put32 } from "../src/sim/campaign/bytes";
import { validateSpatial } from "../src/sim/campaign/spatial";
import type { CampaignSpecialistServices } from "../src/sim/campaign/specialist-adapter";
import { checksum } from "../src/sim/checksum";

interface ActivationObservation {
  owner: number;
  emitter: number;
  reference: number;
  kind: number;
  slots: number[];
  center: [number, number] | null;
  candidates: { slot: number; point: [number, number] }[];
}
function fixture(initialHumanLanding = false) {
  const pack = campaignFixture(),
    records = Array(4 * 1726).fill(0);
  for (let owner = 0; owner < 4; owner++) {
    put32(records, owner * 1726, 1726);
    records[owner * 1726 + 4] = owner;
  }
  for (const mission of pack.missions)
    mission.startup!.extensionBase64 = encodeBytes(records.slice(4));
  pack.strategicAIRules = {
    schemaVersion: 1,
    groupLimits: Array(6).fill(0),
    creatureControlPrior: Array(600).fill(0),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  const world = createCampaign(pack, "synthetic-landing-integration"),
    raw = world.players[1].raw;
  raw[2] = 1;
  raw[3] = 0;
  put16(raw, 9, 12000);
  put16(raw, 11, 13000);
  raw.fill(0, 22, 22 + 32 * 36);
  world.players[1].blueprints = [];
  for (const [index, category] of [0, 1, 3].entries()) {
    const at = 22 + index * 36;
    raw[at] = 65 + index;
    raw[at + 21] = 0;
    raw[at + 22] = category;
    raw[at + 23] = 60;
    raw[at + 24] = 77 + index;
    raw[at + 25] = 50;
    raw[at + 26] = 50;
    world.players[1].blueprints.push({
      index,
      name: String.fromCharCode(65 + index),
      style: 0,
      category: category as 0 | 1 | 3,
      skill: 60,
      maxHealth: 50,
      health: 50,
      runtimeFlags: 0,
      unresolved: { byte18: 77 + index, byte1b: 0 },
    });
  }
  world.strategy!.records[1][0x65a] = world.strategy!.records[1][0x65b] = 1;
  if (initialHumanLanding) enterCampaign(world, pack);
  function services(log: ActivationObservation[]): CampaignSpecialistServices {
    const service: CampaignSpecialistServices = { effectOptions: options };
    function options(
      _world: CampaignWorld,
    ): EffectSchedulerOptions<CampaignWorld> {
      return {
        gravity: 512,
        obstacleAt: () => false,
        destructionObstacle: () => null,
        cleanupReferences: cleanupCampaignReferences,
        //The ordinary effect transaction already clones actors/builders/players,
        //terrain/effects/spatial. Activation additionally writes the native pool.
        stageHost: (original, staged) => {
          staged.specialists = cloneSpecialistPool(original.specialists);
          staged.creatureNative = original.creatureNative.map((n) => n.slice());
          staged.buildingNative = original.buildingNative.map((n) => n.slice());
        },
        commitHost: (target, staged) => {
          target.specialists = staged.specialists;
          target.creatureNative = staged.creatureNative;
          target.buildingNative = staged.buildingNative;
        },
        onLandingEvent: (staged, landing, event) => {
          if (event.type === "activate") {
            const player = staged.players[event.owner].raw,
              reference = i16(player, 0x496),
              kind = player[0x498],
              carrier =
                kind === 5
                  ? staged.powerEffects.slots[reference].nativePrior!
                  : null,
              center: [number, number] | null = carrier
                ? [i16(carrier as number[], 7), i16(carrier as number[], 9)]
                : null,
              out = activateStagedCampaignSpecialists(
                staged,
                event.owner,
                pack,
                service,
              );
            //80AE0 consumes the player's current pointer; it does not clear it
            //or bind it to the particular carrier emitting this callback.
            expect([i16(player, 0x496), player[0x498]]).toEqual([
              reference,
              kind,
            ]);
            log.push({
              owner: event.owner,
              emitter: landing.slot,
              reference,
              kind,
              center,
              slots: out.activated,
              candidates: out.candidates,
            });
          }
          if (event.type === "retired") {
            const player = staged.players[event.owner].raw;
            player[0x498] = 0;
            put32(player, 0x499, 700);
          }
        },
      };
    }
    return service;
  }
  function advance(
    w: CampaignWorld,
    count: number,
    s: CampaignSpecialistServices,
  ) {
    for (let tick = 0; tick < count; tick++) {
      stepEffectScheduler(w, pack, s.effectOptions(w));
      w.frame++;
    }
  }
  function reload(w: CampaignWorld) {
    return loadCampaign(
      saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
      w.contentHash,
    ).world;
  }
  return { pack, world, services, advance, reload };
}
function reinforce(w: CampaignWorld, point: [number, number]) {
  w.strategy!.records[1][0x65d] = 1;
  put16(w.players[1].raw, 9, point[0]);
  put16(w.players[1].raw, 11, point[1]);
}
describe("ordinary shared landing activation integration", () => {
  it("uses the ordinary world landing hook for initial and reinforcement activation, with both airborne saves replayed", () => {
    const { pack, world, services, reload } = fixture(true),
      s = services([]),
      raw = world.players[1].raw;
    //Use the source-backed ordinary Engineer/Shepherd callbacks after arrival.
    //The fixture's Botanist profile is deliberately absent, so this synthetic
    //roster chooses two other admitted roles rather than adding a fake profile.
    raw[22 + 36 + 22] = 3;
    raw[22 + 72 + 22] = 0;
    world.players[1].blueprints[1].category = 3;
    world.players[1].blueprints[2].category = 0;
    world.strategy!.records[1][0x65b] = 0;
    world.strategy!.records[1][0x65d] = 1;
    prepareStagedCampaignStrategicRoster(world, 1, pack, s);
    const firstReference = i16(world.players[1].raw, 0x496);
    function ordinary(w: CampaignWorld, count: number) {
      for (let tick = 0; tick < count; tick++) {
        stepCampaign(w, pack);
        expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
        expect(w.phase).toBe("active");
      }
    }
    ordinary(world, 100);
    expect(world.landings.find((l) => l.slot === firstReference)!.phase).toBe(
      0,
    );
    let continued = reload(world);
    const firstReplay = recordCampaign(continued, null);
    for (let tick = 0; tick < 120; tick++) {
      ordinary(world, 1);
      ordinary(continued, 1);
      if (world.actors.find((a) => a.id === 5)!.ready) break;
    }
    expect(world.actors.every((a) => a.ready)).toBe(true);
    expect(world.actors.map((a) => a.id).sort((a, b) => a - b)).toEqual([
      0, 1, 5, 6,
    ]);
    expect(checksum(continued)).toBe(checksum(world));
    expect(
      checksum(
        replayCampaign(
          sealCampaignReplay(firstReplay, world),
          pack,
          world.contentHash,
        ),
      ),
    ).toBe(checksum(world));
    const newlyReady = world.specialists.records[5];
    expect([
      i16(newlyReady as number[], 7),
      i16(newlyReady as number[], 9),
    ]).toEqual([12000, 13000]);
    expect(newlyReady[87]! & 2).toBe(2);
    expect([
      i16(world.players[1].raw, 0x496),
      world.players[1].raw[0x498],
    ]).toEqual([firstReference, 5]);
    expect(world.players[0].activationCount).toBe(1);
    expect(world.players[1].activationCount).toBe(1);
    for (const w of [world, continued]) {
      w.strategy!.records[1][0x65a] = 2;
      put16(w.players[1].raw, 9, 15000);
      put16(w.players[1].raw, 11, 16000);
      const receipt = prepareStagedCampaignStrategicRoster(w, 1, pack, s);
      expect(receipt.selected).toEqual([
        { category: 0, blueprint: 2, created: true },
      ]);
    }
    const reinforcementReference = i16(world.players[1].raw, 0x496);
    expect(reinforcementReference).not.toBe(firstReference);
    ordinary(world, 70);
    ordinary(continued, 70);
    expect(
      world.landings.find((l) => l.slot === reinforcementReference)!.phase,
    ).toBe(0);
    continued = reload(continued);
    const secondReplay = recordCampaign(continued, null);
    for (let tick = 0; tick < 130; tick++) {
      ordinary(world, 1);
      ordinary(continued, 1);
      if (world.actors.find((a) => a.id === 7)!.ready) break;
    }
    expect(world.actors.every((a) => a.ready)).toBe(true);
    expect(checksum(continued)).toBe(checksum(world));
    expect(
      checksum(
        replayCampaign(
          sealCampaignReplay(secondReplay, world),
          pack,
          world.contentHash,
        ),
      ),
    ).toBe(checksum(world));
    const reinforcement = world.specialists.records[7];
    expect([
      i16(reinforcement as number[], 7),
      i16(reinforcement as number[], 9),
    ]).toEqual([15000, 16000]);
    expect([
      i16(world.players[1].raw, 0x496),
      world.players[1].raw[0x498],
    ]).toEqual([reinforcementReference, 5]);
    expect(
      [0, 1, 2].map((bp) => u32(world.players[1].raw, 22 + bp * 36 + 28)),
    ).toEqual([1, 1, 1]);
    expect(world.players[1].activationCount).toBe(2);
    expect(world.actors.filter((a) => a.id === 5)).toHaveLength(1);
    expect(world.actors.filter((a) => a.id === 6)).toHaveLength(1);
    expect(
      Object.keys(world.spatial.nodes).filter((id) =>
        id.startsWith("source:2:"),
      ),
    ).toHaveLength(5);
    ordinary(world, 30);
    ordinary(continued, 30);
    expect(checksum(continued)).toBe(checksum(world));
    //Source4D8E3 does not compare the retiring slot with raw496. The older
    //carrier clears kind even while the newer carrier is still alive.
    expect(world.powerEffects.slots[firstReference].occupied).toBe(false);
    expect(world.powerEffects.slots[reinforcementReference].occupied).toBe(
      true,
    );
    expect([
      i16(world.players[1].raw, 0x496),
      world.players[1].raw[0x498],
    ]).toEqual([reinforcementReference, 0]);
    expect(u32(world.players[1].raw, 0x499)).toBe(700);
    validateSpatial(world.spatial);
  });
  it("runs initial human/AI and reinforcement landings through actual descent, retaining saves before both arrivals", () => {
    const { pack, world, services, advance, reload } = fixture(true),
      log: ActivationObservation[] = [],
      s = services(log);
    expect(world.frame).toBe(0);
    prepareStagedCampaignStrategicRoster(world, 1, pack, s);
    const initialReference = i16(world.players[1].raw, 0x496);
    expect(world.players[1].raw[0x498]).toBe(5);
    advance(world, 100, s); //A real airborne save, with no phase/height edits.
    expect(world.landings.find((l) => l.slot === initialReference)!.phase).toBe(
      0,
    );
    let continued = reload(world);
    const continuedLog: ActivationObservation[] = [],
      c = services(continuedLog);
    advance(world, 90, s);
    advance(continued, 90, c);
    expect(checksum(continued)).toBe(checksum(world));
    expect(log.filter((v) => v.owner === 0).map((v) => v.slots)).toEqual([
      [0, 1],
    ]);
    expect(log.filter((v) => v.owner === 1).map((v) => v.slots)).toEqual([
      [5, 6],
    ]);
    const old = world.specialists.records[5].slice(7),
      oldProjection = structuredClone(world.actors.find((a) => a.id === 5));
    expect(world.specialists.records[6][114]).toBe(40);
    expect(u32(world.players[1].raw, 22 + 28)).toBe(1);
    expect(world.players[1].raw[22 + 27]).toBe(77);
    for (const w of [world, continued]) {
      reinforce(w, [15000, 16000]);
      const receipt = prepareStagedCampaignStrategicRoster(
        w,
        1,
        pack,
        w === world ? s : c,
      );
      expect(receipt.selected).toEqual([
        { category: 3, blueprint: 2, created: true },
      ]);
      expect(w.specialists.records[5].slice(7)).toEqual(old);
    }
    const reinforcementReference = i16(world.players[1].raw, 0x496);
    expect(reinforcementReference).not.toBe(initialReference);
    advance(world, 70, s);
    advance(continued, 70, c);
    expect(
      world.landings.find((l) => l.slot === reinforcementReference)!.phase,
    ).toBe(0);
    continued = reload(continued); //A second real airborne save.
    advance(world, 120, s);
    advance(continued, 120, c);
    expect(checksum(continued)).toBe(checksum(world));
    const ownerEvents = log.filter((v) => v.owner === 1);
    expect(ownerEvents.map((v) => v.slots)).toEqual([[5, 6], [7]]);
    expect(ownerEvents[1]).toMatchObject({
      emitter: reinforcementReference,
      reference: reinforcementReference,
      kind: 5,
      center: [15000, 16000],
    });
    const created = world.specialists.records[7];
    expect([i16(created as number[], 7), i16(created as number[], 9)]).toEqual([
      15000, 16000,
    ]);
    expect([
      i16(created as number[], 11),
      i16(created as number[], 13),
    ]).toEqual(ownerEvents[1].candidates[0].point);
    expect(created[87]! & 2).toBe(2);
    expect(created[113]! & 4).toBe(0);
    expect(created[112]! & 1).toBe(1);
    expect(world.specialists.records[5].slice(7)).toEqual(old);
    expect(world.actors.find((a) => a.id === 5)).toEqual(oldProjection);
    expect([
      u32(world.players[1].raw, 22 + 28),
      u32(world.players[1].raw, 22 + 36 + 28),
      u32(world.players[1].raw, 22 + 72 + 28),
    ]).toEqual([1, 1, 1]);
    expect(world.players[1].activationCount).toBe(2);
    expect(
      Object.keys(world.spatial.nodes)
        .filter((id) => id.startsWith("source:2:"))
        .sort(),
    ).toEqual([
      "source:2:0",
      "source:2:1",
      "source:2:5",
      "source:2:6",
      "source:2:7",
    ]);
    //Actual4D8E3 clears kind unconditionally when the older carrier retires.
    advance(world, 20, s);
    advance(continued, 20, c);
    expect(checksum(continued)).toBe(checksum(world));
    expect(i16(world.players[1].raw, 0x496)).toBe(reinforcementReference);
    expect(world.players[1].raw[0x498]).toBe(0);
    expect(u32(world.players[1].raw, 0x499)).toBe(700);
    validateSpatial(world.spatial);
  });
  it("uses the player's current retained carrier when another landing emits activation, then counts the later empty pass", () => {
    const { pack, world, services, advance, reload } = fixture(),
      log: ActivationObservation[] = [],
      s = services(log);
    prepareStagedCampaignStrategicRoster(world, 1, pack, s);
    const firstReference = i16(world.players[1].raw, 0x496);
    advance(world, 80, s);
    reinforce(world, [15000, 16000]);
    prepareStagedCampaignStrategicRoster(world, 1, pack, s);
    const latestReference = i16(world.players[1].raw, 0x496);
    expect(latestReference).not.toBe(firstReference);
    advance(world, 70, s);
    const continued = reload(world),
      continuedLog: ActivationObservation[] = [],
      c = services(continuedLog);
    advance(world, 70, s);
    advance(continued, 70, c);
    expect(checksum(continued)).toBe(checksum(world));
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      emitter: firstReference,
      reference: latestReference,
      kind: 5,
      center: [15000, 16000],
      slots: [5, 6, 7],
    });
    for (const slot of [5, 6, 7])
      expect([
        i16(world.specialists.records[slot] as number[], 7),
        i16(world.specialists.records[slot] as number[], 9),
      ]).toEqual([15000, 16000]);
    expect([
      i16(world.players[1].raw, 0x496),
      world.players[1].raw[0x498],
    ]).toEqual([latestReference, 5]);
    advance(world, 100, s);
    advance(continued, 100, c);
    expect(checksum(continued)).toBe(checksum(world));
    expect(log[1]).toMatchObject({
      emitter: latestReference,
      reference: latestReference,
      slots: [],
    });
    expect(u32(world.players[1].raw, 0x49d)).toBe(2);
    expect(
      [0, 1, 2].map((bp) => u32(world.players[1].raw, 22 + bp * 36 + 28)),
    ).toEqual([1, 1, 1]);
    validateSpatial(world.spatial);
  });
  it.each([0, 1] as const)(
    "at frame0 with specialcounter, creationmode%d follows the actual human/AI branch",
    (mode) => {
      const { pack, world, services } = fixture(),
        log: ActivationObservation[] = [],
        s = services(log);
      world.players[1].raw[2] = mode;
      put32(world.missionPrefix, 0x1ec2, 50);
      const receipt = prepareStagedCampaignStrategicRoster(world, 1, pack, s);
      if (mode === 0) {
        expect(world.landings).toHaveLength(0);
        expect(world.players[1].activationCount).toBe(1);
        expect(receipt.events.at(-1)).toMatchObject({
          type: "specialists-activated",
          immediate: true,
          slots: [5, 6],
        });
        expect(world.specialists.records[5][87]! & 2).toBe(0);
      } else {
        expect(world.landings).toHaveLength(1);
        expect(world.players[1].activationCount).toBe(0);
        expect(receipt.events.at(-1)?.type).toBe("landing-created");
        expect(world.specialists.records[5][113]! & 4).toBe(4);
        expect(world.specialists.records[5][112]! & 1).toBe(0);
        expect(world.players[1].raw[0x498]).toBe(5);
      }
    },
  );
});

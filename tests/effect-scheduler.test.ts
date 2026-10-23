import { describe, it, expect } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import {
  stepEffectScheduler,
  type EffectSchedulerOptions,
} from "../src/sim/campaign/effect-scheduler";
import { createWaterEffect } from "../src/sim/campaign/water-adapter";
import { createLanding, type LandingState } from "../src/sim/mechanics/landing";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  putEffectWord,
  putEffectDword,
  launchPowerPackets,
} from "../src/sim/mechanics/power-motion";
function fixture() {
  const pack = campaignFixture();
  pack.assets.EFF = {
    ...pack.assets.EFF,
    frames: Array.from({ length: 12 }, () => ({
      components: [],
      width: 1,
      height: 1,
      rawFlags: [0, 0, 0],
    })),
    animations: Array.from({ length: 50 }, (_, i) => ({
      first: 0,
      last: i === 21 ? 1 : i === 22 ? 2 : i === 48 ? 11 : i === 6 ? 3 : 1,
      rawTrailingWord:
        i === 21 ? 2 : i === 22 ? 3 : i === 48 ? 12 : i === 6 ? 4 : 2,
    })),
  };
  const world = createCampaign(pack, "synthetic-effect-scheduler"),
    options: EffectSchedulerOptions<typeof world> = {
      gravity: 512,
      obstacleAt: () => false,
      cleanupReferences: (w, id) => cleanupCampaignReferences(w, id),
      onLandingEvent: () => {},
    };
  return { world, pack, options };
}
function landing(
  f: ReturnType<typeof fixture>,
  slot: number,
  timer = 100,
): LandingState {
  const prior = f.world.powerEffects.slots[slot].nativePrior!,
    l = createLanding(0, [8192, 8192], f.world.terrain, slot, prior),
    g = groundHeight(f.world.terrain, ...l.point);
  l.phase = 1;
  l.timer = timer;
  l.height = g;
  l.vz = 0;
  l.native![70] = 1;
  putEffectWord(l.native!, 74, timer);
  putEffectDword(l.native!, 39, g);
  putEffectWord(l.native!, 49, 0);
  putEffectWord(l.native!, 59, 512);
  putEffectWord(l.native!, 61, 0);
  f.world.landings.push(l);
  f.world.powerEffects.slots[slot].occupied = true;
  f.world.powerEffects.slots[slot].nativePrior = l.native!.slice();
  insertSpatial(
    f.world.spatial,
    f.world.terrain,
    `source:4:${slot}`,
    worldCell(...l.point),
  );
  return l;
}
function packet(f: ReturnType<typeof fixture>, id: number, payload = 1) {
  const launched = launchPowerPackets(
    f.world.powerEffects,
    [
      {
        id,
        sourceId: 10,
        targetId: 11,
        x: 8192,
        y: 8192,
        targetX: 16384,
        targetY: 8192,
        destinationIndex: 11,
        payload,
      },
    ],
    f.pack.rules!.tables,
    (x, y) => groundHeight(f.world.terrain, x, y),
  );
  if (!launched.ok) throw new Error(launched.reason);
  f.world.powerEffects = launched.value.pool;
  const slot = launched.value.allocated[0].slot;
  insertSpatial(
    f.world.spatial,
    f.world.terrain,
    `source:4:${slot}`,
    worldCell(8192, 8192),
  );
  f.world.economy.packets.push({
    id,
    sourceId: 10,
    targetId: 11,
    payload,
    x: 8192,
    y: 8192,
  });
  f.world.economy.nextPacketId = id + 1;
  return slot;
}
const waterOptions = { obstacleAt: () => false, cleanupReferences: () => 0 };
describe("source global200-slot effect scheduler", () => {
  it("interleaves main, wake and bubble callbacks then runs reused/new child slots once", () => {
    const f = fixture();
    createWaterEffect(
      f.world,
      {
        code: 0x15,
        owner: 0,
        position: [8192, 8192],
        height: 2500,
        angles: [0, 0, 128],
      },
      f.pack,
      waterOptions,
    );
    landing(f, 1, 49);
    createWaterEffect(
      f.world,
      {
        code: 0x30,
        owner: 0,
        position: [8192, 8192],
        height: 2500,
        angles: [0, 0, 0],
      },
      f.pack,
      waterOptions,
    );
    const out = stepEffectScheduler(f.world, f.pack, f.options);
    expect(out.callbacks).toEqual([
      { phase: "primary", slot: 0, code: 0x15 },
      { phase: "primary", slot: 1, code: 0x31 },
      { phase: "primary", slot: 2, code: 0x30 },
      { phase: "newborn", slot: 0, code: 6 },
      { phase: "newborn", slot: 3, code: 0x16 },
    ]);
    expect(out.createdNewborns).toBe(2);
    expect(f.world.landings[0].particles[0].animation.frame).toBe(1);
    expect(
      f.world.waterEffects.find((e) => e.slot === 3)!.animation.frame,
    ).toBe(1);
    expect(f.world.powerEffects.slots[0].nativePrior![21]! & 1).toBe(0);
    validateSpatial(f.world.spatial);
  });
  it("reuses a lower slot freed by an earlier callback even at full source capacity", () => {
    const f = fixture();
    expect(packet(f, 0)).toBe(0);
    landing(f, 1, 49);
    for (let i = 2; i < 200; i++)
      createWaterEffect(
        f.world,
        {
          code: 0x30,
          owner: 0,
          position: [8192, 8192],
          height: 2500,
          angles: [0, 0, 0],
        },
        f.pack,
        waterOptions,
      );
    const out = stepEffectScheduler(f.world, f.pack, f.options);
    expect(out.callbacks.slice(0, 2)).toEqual([
      { phase: "primary", slot: 0, code: 0x21 },
      { phase: "primary", slot: 1, code: 0x31 },
    ]);
    expect(out.callbacks.at(-1)).toEqual({
      phase: "newborn",
      slot: 0,
      code: 6,
    });
    expect(out.retired).toContain("source:4:0");
    expect(out.createdNewborns).toBe(1);
    expect(f.world.powerEffects.slots.filter((s) => s.occupied)).toHaveLength(
      200,
    );
    expect(f.world.landings[0].particles[0].slot).toBe(0);
  });
  it("advances each packet only in its own slot callback", () => {
    const f = fixture();
    packet(f, 0, 5);
    packet(f, 1, 5);
    const out = stepEffectScheduler(f.world, f.pack, f.options);
    expect(out.callbacks.map((c) => c.slot)).toEqual([0, 1]);
    expect(f.world.economy.packets.map((p) => p.payload)).toEqual([4, 4]);
    expect(f.world.economy.packets.map((p) => p.x)).toEqual([8224, 8224]);
    expect(out.power).toHaveLength(2);
  });
  it("rolls back preceding main RNG, factories, audio and host roots on a late unknown selector", () => {
    const f = fixture();
    landing(f, 0, 50);
    const prior = f.world.powerEffects.slots[1];
    prior.occupied = true;
    prior.nativePrior![6] = 5;
    prior.nativePrior![69] = 0xff;
    insertSpatial(f.world.spatial, f.world.terrain, "source:4:1", 0);
    const before = JSON.stringify(f.world);
    expect(() =>
      stepEffectScheduler(f.world, f.pack, {
        ...f.options,
        onLandingEvent: (w, _l, event) => {
          if (event.type === "message") {
            w.actors[0].ready = true;
            w.players[0].activationCount++;
            w.audio.nextSequence++;
            w.notices.push({
              frame: 0,
              severity: "info",
              text: "Synthetic staged notice",
              entityId:null,
            });
          }
        },
      }),
    ).toThrow(/255/);
    expect(JSON.stringify(f.world)).toBe(before);
  });
  it("retains actor-builder aliases while committing an explicit activation host callback", () => {
    const f = fixture(),
      l = landing(f, 0);
    l.phase = 0;
    l.height = groundHeight(f.world.terrain, ...l.point) + 100;
    l.native![70] = 0;
    putEffectDword(l.native!, 39, l.height);
    f.world.powerEffects.slots[0].nativePrior = l.native!.slice();
    const out = stepEffectScheduler(f.world, f.pack, {
      ...f.options,
      onLandingEvent: (w, _l, event) => {
        if (event.type === "activate") {
          w.actors[0].ready = true;
          w.actors[0].motion.yaw = 777;
          w.builders[0].enabled = true;
          w.players[0].activationCount++;
        }
      },
    });
    expect(out.landingEvents.some((e) => e.event.type === "activate")).toBe(
      true,
    );
    expect(f.world.actors[0].ready).toBe(true);
    expect(f.world.builders[0].motion).toBe(f.world.actors[0].motion);
    expect(f.world.builders[0].motion.yaw).toBe(777);
  });
  it("retires main31 through its host event and preserves the native phase3 afterimage", () => {
    const f = fixture(),
      l = landing(f, 0, 1);
    l.phase = 3;
    l.height += 5000;
    l.native![70] = 3;
    putEffectDword(l.native!, 39, l.height);
    f.world.powerEffects.slots[0].nativePrior = l.native!.slice();
    let retired = 0;
    const out = stepEffectScheduler(f.world, f.pack, {
      ...f.options,
      onLandingEvent: (_w, _l, event) => {
        if (event.type === "retired") retired++;
      },
    });
    expect(retired).toBe(1);
    expect(out.retired).toEqual(["source:4:0"]);
    expect(f.world.landings[0].phase).toBe(4);
    expect(f.world.powerEffects.slots[0].nativePrior![70]).toBe(3);
    expect(f.world.powerEffects.slots[0].nativePrior![6]).toBe(0);
    expect(f.world.spatial.nodes["source:4:0"]).toBeUndefined();
  });
  it("leaves externally marked records for the source counted-newborn protocol", () => {
    const f = fixture();
    createWaterEffect(
      f.world,
      {
        code: 0x30,
        owner: 0,
        position: [8192, 8192],
        height: 2500,
        angles: [0, 0, 0],
      },
      f.pack,
      waterOptions,
    );
    f.world.waterEffects[0].flags |= 1;
    f.world.waterEffects[0].native[21]! |= 1;
    f.world.powerEffects.slots[0].nativePrior![21]! |= 1;
    const out = stepEffectScheduler(f.world, f.pack, f.options);
    expect(out.callbacks).toEqual([]);
    expect(out.queueCandidates).toEqual([0]);
    expect(f.world.waterEffects[0].animation.frame).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
} from "../src/sim/campaign/world";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import {
  haulingPut as put,
  haulingWord as word,
} from "../src/sim/mechanics/mule-hauling";
import { groundHeight, worldCell } from "../src/sim/mechanics/terrain";
import { put16, put32 } from "../src/sim/campaign/bytes";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

/**Synthetic carrier67 attachment and an aging owned Mule in the ordinary
 * campaign host. No mission acceptance is claimed and nothing original is
 * imported; only the public synthetic pack is used. */
function fixture(options: { deaths?: number; older?: boolean } = {}) {
  const deaths = options.deaths ?? 1,
    sha = "0".repeat(64),
    pack = campaignFixture();
  pack.assets.BONES = structuredClone(pack.assets.MULE);
  pack.ecologyRules!.corpseFriction = Array(8).fill(128);
  if (!options.older)
    pack.creatureCommandRules = {
      schemaVersion: 1,
      corpseDepositOffset: [-256, 0],
      footprintSearchOffsets: [
        [0, 0],
        [256, 0],
        [-256, 0],
        [0, 256],
        [0, -256],
        [256, 256],
        [-256, 256],
        [256, -256],
        [-256, -256],
      ],
      provenance: {
        executableSha256: sha,
        originalExecution: false,
        corpseDepositOffset: {
          object: 3,
          objectOffset: 0x457c,
          bytes: 4,
          sha256: sha,
        },
        footprintSearchOffsets: {
          object: 3,
          orderOffset: 0x60b8,
          orderBytes: 9,
          indexedBase: 0x4564,
          joinedBytes: 36,
          orderSha256: sha,
          sha256: sha,
        },
      },
    };
  const eff = pack.assets.EFF,
    frame = structuredClone(pack.assets.TEST.frames![0]);
  pack.assets.EFF = structuredClone(pack.assets.EFF);
  while (pack.assets.EFF.animations!.length < 71)
    pack.assets.EFF.animations!.push({ first: 0, last: 1, rawTrailingWord: 2 });
  for (const [code, count] of [
    [67, 1],
    [68, 1],
  ] as const) {
    const first = pack.assets.EFF.frames!.length;
    for (let i = 0; i < count; i++)
      pack.assets.EFF.frames!.push({
        ...structuredClone(frame),
        rawFlags: [0, 0, 0],
      });
    pack.assets.EFF.animations![code] = {
      first,
      last: first + count - 1,
      rawTrailingWord: count,
    };
  }
  void eff;
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: code === 67 || code === 68 ? 5 : 0,
      gravity: code === 67 || code === 68,
      priority: 1,
      childCode: null,
      movable: code === 67 || code === 68,
      waterResponse: code === 67 || code === 68,
    })),
    provenance: { executableSha256: sha, originalExecution: false },
  };
  const w = createCampaign(pack, "synthetic-mule-mortality-cleanup");
  enterCampaign(w, pack);
  for (let i = 0; i < 200; i++) stepCampaign(w, pack);
  expect(w.phase, JSON.stringify(w.notices.slice(-4))).toBe("active");
  const carriers: (number | null)[][] = [],
    carrierSlots: number[] = [];
  for (let slot = 0; slot < deaths; slot++) {
    const carrierSlot = w.powerEffects.slots.findIndex((p) => !p.occupied);
    if (carrierSlot < 0) throw Error("Synthetic effect pool is full");
    const at: [number, number] = [10240 + slot * 512, 10240],
      made = initializeMuleNative(
        w.creatureNative[slot],
        w.rng,
        { slot, owner: 0, position: at, quality: 50 },
        { terrain: w.terrain, tables: pack.rules!.tables },
      );
    if (!made.ok) throw Error(made.reason);
    const n = made.value.native;
    w.rng = made.value.rng;
    n[94] = 8;
    n[95] = 1;
    n[96] = 0x8a;
    n[97] = 0x80;
    n[120] = 5;
    n[93] = 5;
    put(n, 91, carrierSlot);
    put(n, 100, 67);
    put(n, 102, 1);
    put(n, 104, 135);
    put(n, 106, 67);
    put(n, 85, 5);
    n[87] = 4;
    w.creatureNative[slot] = n;
    w.ecology.mules.push({
      id: `source:0:${slot}`,
      index: slot,
      native: n,
      pending: [],
    });
    insertSpatial(w.spatial, w.terrain, `source:0:${slot}`, worldCell(...at));
    const effect: (number | null)[] = Array(81).fill(0);
    effect.fill(null, 31, 39);
    effect[6] = 5;
    effect[69] = 67;
    effect[22] = 1;
    put(effect, 21, 0x1a0);
    put(effect, 63, -1);
    const plantSlot = w.ecology.plants.findIndex((p) => !p.active),
      carried = w.ecology.plants[plantSlot],
      plant = carried.native;
    plant[6] = 2;
    plant[24] = 4;
    plant[25] = 2;
    plant[43] = 0;
    put(plant, 15, plantSlot);
    put(plant, 7, at[0] + 256);
    put(plant, 9, at[1]);
    put(plant, 21, 0);
    put(plant, 44, 10);
    plant[46] = 0;
    put32(plant as number[], 17, groundHeight(w.terrain, at[0] + 256, at[1]));
    Object.assign(carried, {
      active: true,
      owner: 4,
      position: [at[0] + 256, at[1]],
      selector: 0,
      growth: 10,
      flags: 0,
      plantFlags: 0,
      retirement: 0,
      animation: 2,
    });
    w.ecology.plantCount++;
    put16(w.missionPrefix, 0x3552, w.ecology.plantCount);
    put(effect, 15, carrierSlot);
    put(effect, 71, plantSlot);
    effect[73] = 2;
    put(effect, 7, at[0]);
    put(effect, 9, at[1]);
    w.powerEffects.slots[carrierSlot].nativePrior = effect;
    w.powerEffects.slots[carrierSlot].occupied = true;
    insertSpatial(
      w.spatial,
      w.terrain,
      `source:4:${carrierSlot}`,
      worldCell(at[0], at[1]),
    );
    carriers.push(effect);
    carrierSlots.push(carrierSlot);
  }
  put16(w.missionPrefix, 0x3550, deaths);
  synchronizeCampaignLinks(w);
  return { w, pack, carriers, carrierSlots, deaths };
}

describe("campaign Mule mortality reference cleanup", () => {
  it("lets the carrying Mule die, saves either side, reloads and replays across the cleanup", () => {
    const { w, pack, carriers, carrierSlots } = fixture(),
      replay = recordCampaign(w, null);
    let pre: ReturnType<typeof saveCampaign> | null = null,
      steps = 0;
    while (w.creatureNative[0][94]! < 24 && steps < 6) {
      pre = saveCampaign(w, { paused: true, speed: 1, accumulator: 0 });
      stepCampaign(w, pack);
      steps++;
    }
    expect(pre).not.toBeNull();
    expect(steps, JSON.stringify(w.notices.slice(-4))).toBeLessThanOrEqual(2);
    const n = w.creatureNative[0];
    expect(n[94]).toBe(24);
    expect([n[0x60]! & 2, n[93], n[87]]).toEqual([0, 0, 0]);
    //Stale source indices stay opaque through the death.
    expect([word(n, 91), word(n, 85)]).toEqual([carrierSlots[0], 5]);
    const carrier = w.powerEffects.slots[carrierSlots[0]].nativePrior!;
    expect(carrier[69]).toBe(68);
    expect(carrier[21]! & 32).toBe(0);
    expect(carriers[0][69]).toBe(67);
    expect(w.creatureNative).toHaveLength(300);
    expect(w.notices.filter((notice) => notice.severity === "error")).toEqual([]);
    //The corpse keeps its spatial membership until716F0 retirement.
    expect(w.spatial.nodes["source:0:0"]).toBeDefined();
    expect(() => validateSpatial(w.spatial)).not.toThrow();
    const post = saveCampaign(w, { paused: true, speed: 1, accumulator: 0 });
    const beforeWorld = loadCampaign(pre!, w.contentHash).world;
    stepCampaign(beforeWorld, pack);
    expect(checksum(beforeWorld)).toBe(checksum(w));
    const resumed = loadCampaign(post, w.contentHash).world;
    for (let i = 0; i < 20; i++) {
      stepCampaign(w, pack);
      stepCampaign(resumed, pack);
    }
    expect(checksum(resumed)).toBe(checksum(w));
    expect(checksum(replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash))).toBe(
      checksum(w),
    );
  }, 60000);
  it("kills two Mules in one update and detaches both carriers", () => {
    const { w, pack, carriers, carrierSlots } = fixture({ deaths: 2 });
    let steps = 0;
    while (
      (w.creatureNative[0][94]! < 24 || w.creatureNative[1][94]! < 24) &&
      steps < 8
    ) {
      stepCampaign(w, pack);
      steps++;
    }
    expect(
      w.ecology.mules.map((mule) => mule.native[0x5e]),
      JSON.stringify(w.notices.slice(-4)),
    ).toEqual([24, 24]);
    expect(w.ecology.mules.map((mule) => mule.native[0x60]! & 2)).toEqual([0, 0]);
    expect(
      carrierSlots.map(
        (carrierSlot) => w.powerEffects.slots[carrierSlot].nativePrior![69],
      ),
    ).toEqual([68, 68]);
    expect(carriers.map((effect) => effect[69])).toEqual([67, 67]);
    expect(w.creatureNative.map((native) => native[6])).toEqual([
      1, 1, ...Array(298).fill(0),
    ]);
    expect(w.notices.filter((notice) => notice.severity === "error")).toEqual([]);
    expect(() => validateSpatial(w.spatial)).not.toThrow();
  }, 60000);
  it("accepts an older imported pack without the newer creature-command profile", () => {
    const current = fixture(),
      older = fixture({ older: true });
    expect(older.pack.creatureCommandRules).toBeUndefined();
    for (const f of [current, older])
      for (let i = 0; i < 6 && f.w.creatureNative[0][94]! < 24; i++)
        stepCampaign(f.w, f.pack);
    const dying = (f: typeof current) =>
      JSON.stringify([
        f.w.creatureNative[0],
        f.w.ecology.mules[0].native,
        f.carriers[0],
      ]);
    expect(older.w.creatureNative[0][94]).toBe(24);
    expect(dying(older)).toBe(dying(current));
    expect(older.w.notices.filter((n) => n.severity === "error")).toEqual([]);
  }, 60000);
});

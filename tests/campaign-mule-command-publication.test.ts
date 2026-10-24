import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  queueCampaign,
  stepCampaign,
  type CampaignCommand,
} from "../src/sim/campaign/world";
import {
  loadCampaign,
  saveCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { i16, put16, put32 } from "../src/sim/campaign/bytes";
import { worldCell } from "../src/sim/mechanics/terrain";
import { checksum } from "../src/sim/checksum";

// Synthetic zone timing and native action arrangements isolate a real host
// publication boundary. They do not establish an original campaign route.
function fixture() {
  const pack = campaignFixture(),
    w = createCampaign(pack, "mule-publication");
  enterCampaign(w);
  for (let i = 0; i < 200; i++) stepCampaign(w, pack);
  expect(w.phase).toBe("active");
  for (let index = 0; index < 2; index++) {
    const position: [number, number] = [10000 + index * 256, 10000],
      made = initializeMuleNative(
        w.creatureNative[index],
        w.rng,
        { slot: index, owner: 0, position, quality: 50 },
        { terrain: w.terrain, tables: pack.rules!.tables },
      );
    if (!made.ok) throw Error(made.reason);
    const native = made.value.native;
    native[94] = 8;
    w.rng = made.value.rng;
    w.creatureNative[index] = native;
    w.ecology.mules.push({
      index,
      id: `source:0:${index}`,
      native,
      pending: [],
    });
    insertSpatial(
      w.spatial,
      w.terrain,
      `source:0:${index}`,
      worldCell(...position),
    );
  }
  synchronizeCampaignLinks(w);
  // An active distant zone takes the complete projection/adoption path once
  // the source countdown is zero; no rewards or visitors are synthesized.
  w.missionPrefix[0x34b8] = 1;
  put32(w.missionPrefix, 0x1eaa, 1024);
  put16(w.missionPrefix, 0x355c, 0);
  put16(w.missionPrefix, 0x2ff8, -16000);
  put16(w.missionPrefix, 0x2ffa, -16000);
  w.missionPrefix[0x2ffc] = 12;
  put32(w.missionPrefix, 0x2ffe, 100);
  put32(w.missionPrefix, 0x3002, 1024);
  put32(w.missionPrefix, 0x3006, 1024);
  w.missionPrefix[0x300a] = 1;
  const moves: CampaignCommand[] = [0, 1].map((muleIndex) => ({
    type: "move-mule",
    muleIndex,
    point: [14000, 14000],
    queued: false,
  }));
  const specialist: CampaignCommand = {
    type: "move",
    actorId: 1,
    point: [9000, 9000],
    queued: false,
  };
  return { pack, w, moves, specialist };
}
const commandPoint = (n: readonly (number | null)[]) => [
  i16(n as number[], 110),
  i16(n as number[], 112),
];

describe("human Mule commands publish before source-ordered host readers", () => {
  for (const order of ["mules", "mules-first", "specialist-first"] as const)
    it(`retains both orders through the real zone pass and save/replay (${order})`, () => {
      const { pack, w, moves, specialist } = fixture(),
        commands =
          order === "mules"
            ? moves
            : order === "mules-first"
              ? [...moves, specialist]
              : [specialist, ...moves],
        replay = recordCampaign(w, null);
      for (const command of commands) {
        expect(queueCampaign(w, command).ok).toBe(true);
        replay.commands.push({ tick: w.tick, type: "command", command });
      }
      const loaded = loadCampaign(
        saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
        w.contentHash,
      ).world;
      for (let i = 0; i < 8; i++) {
        stepCampaign(w, pack);
        stepCampaign(loaded, pack);
        expect(w.phase).toBe("active");
        expect(checksum(loaded)).toBe(checksum(w));
        for (const mule of w.ecology.mules) {
          expect(commandPoint(mule.native)).toEqual([14000, 14000]);
          expect(mule.native[120]).toBe(7);
          expect(mule.native).toEqual(w.creatureNative[mule.index]);
        }
      }
      expect(
        w.notices.filter(
          (n) => n.severity === "error" || n.severity === "warning",
        ),
      ).toEqual([]);
      expect(
        checksum(
          replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
        ),
      ).toBe(checksum(w));
    });

  it("publishes peer cleanup before a later zone failure and keeps the accepted order", () => {
    const { pack, w, moves } = fixture(),
      actor = w.ecology.mules[0].native,
      peer = w.ecology.mules[1].native;
    actor[94] = 5;
    put16(actor as number[], 85, 1);
    actor[87] = 1;
    peer[96] = peer[96]! | 1;
    expect(queueCampaign(w, moves[0]).ok).toBe(true);
    delete pack.zoneRules; // Failure occurs after dispatch, inside the zone boundary.
    stepCampaign(w, pack);
    expect(w.phase).toBe("blocked");
    expect(w.notices.at(-1)?.text).toMatch(/zone tables missing/);
    expect(commandPoint(w.creatureNative[0])).toEqual([14000, 14000]);
    expect(w.creatureNative[1][96]! & 1).toBe(0);
    for (const mule of w.ecology.mules)
      expect(mule.native).toBe(w.creatureNative[mule.index]);
  });

  it("publishes a queued waypoint before the ordinary Mule callback transaction", () => {
    const { pack, w } = fixture();
    w.muleQueues[0] = [[14000, 14000]];
    const replay = recordCampaign(w, null);
    stepCampaign(w, pack);
    expect(w.phase).toBe("active");
    expect(w.muleQueues[0]).toEqual([]);
    expect(commandPoint(w.creatureNative[0])).toEqual([14000, 14000]);
    expect(w.ecology.mules[0].native).toEqual(w.creatureNative[0]);
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(replay, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  });

  it("leaves all ecology records unchanged when atomic action cleanup rejects", () => {
    const { pack, w, moves } = fixture(),
      native = w.ecology.mules[0].native;
    native[96] = native[96]! | 2; // Requires an actual attachment carrier.
    const before = w.ecology.mules.map((m) => m.native.slice());
    expect(queueCampaign(w, moves[0]).ok).toBe(true);
    delete pack.zoneRules;
    stepCampaign(w, pack);
    expect(w.notices.some((n) => /actual carrier binding/.test(n.text))).toBe(
      true,
    );
    expect(w.ecology.mules.map((m) => m.native)).toEqual(before);
    expect(w.creatureNative.slice(0, 2)).toEqual(before);
  });
});

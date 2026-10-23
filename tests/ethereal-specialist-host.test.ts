import { beforeAll, describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  validateCampaignWorld,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import { createCampaignEthereal } from "../src/sim/campaign/ethereal-adapter";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import { i16, put16, put32, u32 } from "../src/sim/campaign/bytes";
import { groundHeight } from "../src/sim/mechanics/terrain";
import {
  planEtherealAttack,
  makeEtherealAttackEffect,
  stepEtherealAttackEffectRecord,
} from "../src/sim/mechanics/ethereal-attack";
import { animationProfile } from "../src/sim/mechanics/animation";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

type Native = (number | null)[];
const word = (n: Native, p: number) => i16(n as number[], p);
const dword = (n: Native, p: number) => u32(n as number[], p) | 0;
const put = (n: Native, p: number, v: number) => put16(n as number[], p, v);
const putDword = (n: Native, p: number, v: number) =>
  put32(n as number[], p, v);

/** Synthetic stage arrangements exercise the normal host step. They are not
 * imported source fixtures, legal mission commands, or mission acceptance. */
describe("synthetic Ethereal/specialist ordinary host integration", () => {
  const pack = campaignFixture();
  let start: CampaignWorld;
  const errors = (w: CampaignWorld) =>
    w.notices.filter((n) => n.severity === "error");
  function step(w: CampaignWorld) {
    stepCampaign(w, pack);
    expect(errors(w)).toEqual([]);
    expect(w.phase).toBe("active");
  }
  function stopParent(n: Native) {
    n[22] = 0;
    put(n, 73, 0);
    for (const p of [45, 47, 49, 51, 53, 55, 61, 63, 65]) put(n, p, 0);
    put(n, 59, 512);
    putDword(n, 69, 512);
  }
  function parent(w: CampaignWorld, severity: 1 | 3) {
    const a = w.actors.find((a) => a.id === 1)!,
      point: [number, number] = [a.motion.x + 512, a.motion.y + 512],
      ground = groundHeight(w.terrain, ...point);
    expect(
      createCampaignEthereal(
        w,
        {
          selector: 0,
          owner: 0,
          position: point,
          initialHeight: ground + 12800,
        },
        pack,
        {
          gravity: 512,
          obstacleAt: () => false,
          cleanupReferences: cleanupCampaignReferences,
        },
      ),
    ).toBe(0);
    const n = w.ethereals.records[0].native;
    stopParent(n);
    n[86] = 7;
    n[87] = 1;
    n[88] = severity;
    put32(w.players[0].raw, 17, -1000);
    put16(w.missionPrefix, 0x1c78, 256);
    return n;
  }
  function abduct() {
    const w = structuredClone(start);
    parent(w, 3);
    //Keep the actual owner list intact. Other native units are explicitly
    //ineligible, so source's at-most30 list draws can select Geneticist1.
    for (const a of w.actors)
      if (a.id !== 1) w.specialists.records[a.id][113]! |= 4;
    step(w);
    expect(w.ethereals.records[0].native[87]).toBe(2);
    expect([
      word(w.ethereals.records[0].native, 89),
      w.ethereals.records[0].native[91],
    ]).toEqual([1, 3]);
    return w;
  }
  beforeAll(() => {
    pack.assets.ETHEREAL = {
      ...pack.assets.EFF,
      frames: Array.from({ length: 19 }, () => ({
        components: [],
        width: 1,
        height: 1,
        rawFlags: [0, 0, 0],
      })),
      animations: Array.from({ length: 9 }, (_, i) => ({
        first: i < 8 ? i : 8,
        last: i < 8 ? i : 18,
        rawTrailingWord: i < 8 ? 1 : 267,
      })),
    };
    pack.assets.EFF = {
      ...pack.assets.EFF,
      frames: Array.from({ length: 19 }, (_, i) => ({
        components: [],
        width: 1,
        height: 1,
        rawFlags: [i < 5 ? 1 : 0, 0, 0],
      })),
      animations: Array.from({ length: 71 }, (_, code) => ({
        first: code === 26 ? 0 : 5,
        last:
          code === 26
            ? 4
            : code === 5
              ? 18
              : code === 8
                ? 17
                : code === 32
                  ? 14
                  : code === 48
                    ? 11
                    : 6,
        rawTrailingWord:
          code === 26
            ? 5
            : code === 5
              ? 14
              : code === 8
                ? 13
                : code === 32
                  ? 10
                  : code === 48
                    ? 7
                    : 2,
      })),
    };
    pack.etherealRules = {
      schemaVersion: 1,
      observationThresholds: [16, 64, 128],
      provenance: {
        executableSha256: "0".repeat(64),
        originalExecution: false,
      },
    };
    pack.effectRules = {
      schemaVersion: 1,
      descriptors: Array.from({ length: 71 }, (_, code) => ({
        code,
        retirementMode: code === 25 ? 4 : 0,
        gravity: false,
        priority: code === 25 ? 7 : code === 26 ? 35 : 5,
        childCode: code === 25 ? 5 : null,
        movable: code === 25 || code === 26,
        waterResponse: code === 25,
      })),
      provenance: {
        executableSha256: "0".repeat(64),
        originalExecution: false,
      },
    };
    start = createCampaign(pack, "synthetic-ethereal-specialist-host");
    enterCampaign(start);
    for (let i = 0; i < 200; i++) step(start);
    expect(start.actors.every((a) => a.ready)).toBe(true);
  }, 30000);

  it("runs state7 severity3 setup, then actual state3 callback and unmarked feedback26", () => {
    const w = abduct(),
      n = w.specialists.records[1];
    expect([n[85], n[25], word(n, 127), n[129], dword(n, 104)]).toEqual([
      3, 8, 0, 8, 10,
    ]);
    expect(w.actors.find((a) => a.id === 1)!.animation.action).toBe(8);
    expect(w.actors.find((a) => a.id === 1)!.reason).toBe("Being abducted");
    const binding = structuredClone(w.specialists.bindings[1]);
    let particle: Native | undefined;
    for (let i = 0; i < 8 && !particle; i++) {
      step(w);
      particle = w.powerEffects.slots.find(
        (s) => s.occupied && s.nativePrior![69] === 26,
      )?.nativePrior;
    }
    expect(particle).toBeDefined();
    expect(particle![6]).toBe(5);
    expect(particle![21]! & 1).toBe(0);
    expect(particle![24]).toBe(0);
    expect(dword(particle!, 39)).toBeGreaterThan(
      dword(w.specialists.records[1], 39),
    );
    expect(dword(w.specialists.records[1], 104)).toBeLessThan(10);
    expect(w.specialists.bindings[1]).toEqual(binding);
    validateCampaignWorld(w, w.contentHash);
  });

  it("keeps visitor lift mirrors through the next sync/save and retires via57740 without death counts", () => {
    const w = abduct(),
      binding = structuredClone(w.specialists.bindings[1]!),
      ownerCount = w.players[0].raw[3],
      deaths = u32(w.players[0].raw, 0x709),
      bp = binding.blueprintIndex;
    let p = w.ethereals.records[0].native;
    stopParent(p);
    p[87] = 4;
    put(p, 100, 1);
    step(w);
    expect(w.ethereals.records[0].native[87]).toBe(5);
    expect(w.specialists.records[1][21]! & 32).toBe(32);
    step(w);
    let n = w.specialists.records[1];
    const height = dword(n, 17) + Math.trunc(12800 / 120);
    expect(dword(n, 39)).toBe(height);
    expect(w.actors.find((a) => a.id === 1)!.motion.height).toBe(height);
    const loaded = loadCampaign(
      saveCampaign(w, { paused: true, speed: 2, accumulator: 0 }),
      w.contentHash,
    ).world;
    step(w);
    step(loaded);
    expect(checksum(loaded)).toBe(checksum(w));
    n = w.specialists.records[1];
    expect(dword(n, 39)).toBe(dword(n, 17) + Math.trunc((2 * 12800) / 120));
    expect(w.actors.find((a) => a.id === 1)!.motion.height).toBe(dword(n, 39));
    p = w.ethereals.records[0].native;
    put(p, 100, 1); //Synthetic direct stage boundary, not a mission command.
    step(w);
    expect(w.specialists.records[1][6]).toBe(0);
    expect(w.specialists.bindings[1]).toEqual(binding);
    expect(w.actors.find((a) => a.id === 1)!.ready).toBe(false);
    expect(w.spatial.nodes["source:2:1"]).toBeUndefined();
    expect(w.players[0].raw[3]).toBe(ownerCount - 1);
    expect(w.players[0].blueprints[bp].name).toBe("");
    expect(u32(w.players[0].raw, 0x709)).toBe(deaths);
    expect(w.ethereals.records[0].native[91]).toBe(0);
    validateCampaignWorld(w, w.contentHash);
  });

  it("aims source25 from the live post-motion parent pose in the ordinary visitor pass", () => {
    const w = structuredClone(start),
      n = parent(w, 1),
      oldX = word(n, 7),
      slot = w.powerEffects.slots.findIndex((s) => !s.occupied),
      prior = w.powerEffects.slots[slot].nativePrior!.slice();
    n[87] = 2;
    put(n, 89, 1);
    n[91] = 3;
    put(n, 100, 0);
    put(n, 45, 256);
    step(w);
    const p = w.ethereals.records[0].native,
      image = w.powerEffects.slots[slot].nativePrior!;
    expect(word(p, 7)).toBe(oldX + 4);
    expect(image[69]).toBe(25);
    expect([word(image, 71), image[73]]).toEqual([0, 8]);
    const plan = planEtherealAttack(p, w.specialists.records[1], {
        terrain: w.terrain,
        tables: pack.rules!.tables,
      }),
      descriptor = {
        code: 25,
        completion: 4,
        gravity: false,
        priority: 7,
        childCode: 5,
        obstacle: true,
        water: true,
      },
      made = makeEtherealAttackEffect(prior, slot, plan.request, {
        terrain: w.terrain,
        tables: pack.rules!.tables,
        descriptor,
        profile: animationProfile(pack.assets.EFF, 25),
      }),
      expected = stepEtherealAttackEffectRecord(
        made.native,
        { seed: 7, ring: 0, draws: 0 },
        {
          frame: w.frame - 1,
          terrain: w.terrain,
          tables: pack.rules!.tables,
          water: 0,
          bounce: pack.rules!.tables.bounce,
          descriptor,
          profile: animationProfile(pack.assets.EFF, 25),
          players: w.players.map((p) => p.raw),
          speciesComponents: pack.zoneRules!.speciesComponents,
          nearby: () => [],
          entity: () => null,
          obstacle: () => null,
          child: () => {
            throw Error("Unexpected synthetic projectile contact");
          },
        },
      ).native;
    expect(image.slice(7, 31)).toEqual(expected.slice(7, 31));
    expect(image.slice(39)).toEqual(expected.slice(39));
    expect(w.audio.requests.some((a) => a.cue === 10)).toBe(true);
  });
});

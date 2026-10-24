import { beforeAll, describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { addRecruitmentEffectFixture } from "./fixtures/recruitment-effects";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import {
  dispatchCampaignStrategicRoleCommand,
  dispatchStagedCampaignStrategicRoleCommand,
} from "../src/sim/campaign/strategic-role-command-adapter";
import type { StrategicRoleCommand } from "../src/sim/mechanics/strategic-ai-specialists-state";
import type { CampaignSpecialistServices } from "../src/sim/campaign/specialist-adapter";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  i16,
  u16,
  u32,
  put16,
  put32,
  decodeBytes,
  encodeBytes,
} from "../src/sim/campaign/bytes";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

/** Public synthetic later-progress carry, normal native constructors/landing.
 * These command integration cases are not a mission acceptance claim. */
describe("staged strategic specialist command host", () => {
  const pack = campaignFixture();
  const services: CampaignSpecialistServices = {
    effectOptions: () => ({
      gravity: 512,
      obstacleAt: () => false,
      cleanupReferences: cleanupCampaignReferences,
    }),
  };
  let start: CampaignWorld;
  beforeAll(() => {
    addRecruitmentEffectFixture(pack);
    const prior = createCampaign(pack, "strategic-role-host"),
      startup = pack.missions[0].startup!;
    prior.players[0].progress = prior.players[0].raw[0x6e7] = 4;
    startup.context.actorMask = 15;
    const prefix = decodeBytes(startup.missionPrefixBase64);
    put32(prefix, 0x1ec2, 1000000);
    startup.context.specialActivation = 1000000;
    startup.missionPrefixBase64 = encodeBytes(prefix);
    start = createCampaign(pack, "strategic-role-host", 1, {
      players: prior.players,
      selectedPlayer: 0,
      world: prior.retainedWorld,
      rngRing: prior.rng.ring,
    });
    enterCampaign(start, pack);
    for (let i = 0; i < 240; i++) stepCampaign(start, pack);
    expect(start.notices.filter((n) => n.severity === "error")).toEqual([]);
    expect(
      [0, 1, 2, 3].map(
        (c) =>
          start.actors.find(
            (a) => start.specialists.bindings[a.id]?.category === c,
          )?.ready,
      ),
    ).toEqual([true, true, true, true]);
  }, 30000);
  const index = (w: CampaignWorld, category: number) =>
    w.actors.find((a) => w.specialists.bindings[a.id]?.category === category)!
      .id;
  function command(
    w: CampaignWorld,
    category: number,
    routine: StrategicRoleCommand["routine"],
    words: Record<number, number> = {},
  ): StrategicRoleCommand {
    const specialist = index(w, category),
      packet: (number | null)[] = Array(11).fill(null);
    put16(packet as number[], routine === 0x80fc0 ? 4 : 0, specialist);
    for (const [at, v] of Object.entries(words))
      put16(packet as number[], Number(at), v);
    return { routine, source: 0x33f60, player: 0, specialist, packet };
  }
  it.each([0, 1, 2, 3])(
    "queues role%s movement with actual resolver and stable native/player/RNG pointers",
    (category) => {
      const w = structuredClone(start),
        q = command(w, category, 0x80fc0, { 0: 9000, 2: 9000 }),
        n = w.specialists.records[q.specialist],
        players = w.players,
        raw = players[0].raw,
        rng = w.rng,
        records = w.specialists.records,
        binding = w.specialists.bindings[q.specialist],
        beforeRng = checksum(rng);
      //AI owns the command independently of the currently displayed player and
      //does not pass through the UI eligibility flag112-bit0.
      w.selectedPlayer = 3;
      n[112] = n[112]! & 254;
      put16(n as number[], 45, 83);
      const r = dispatchStagedCampaignStrategicRoleCommand(
        w,
        q,
        pack,
        services,
      );
      expect(r.outcome).toBe("installed");
      expect(i16(n as number[], 11)).toBe(9000);
      expect(i16(n as number[], 13)).toBe(9000);
      expect(n[87]! & 2).toBe(2);
      expect(i16(n as number[], 45)).toBe(83);
      expect(checksum(rng)).toBe(beforeRng);
      expect(w.specialists.records).toBe(records);
      expect(records[q.specialist]).toBe(n);
      expect(w.specialists.bindings[q.specialist]).toBe(binding);
      expect(w.players).toBe(players);
      expect(players[0].raw).toBe(raw);
      expect(w.rng).toBe(rng);
    },
  );
  it("does not read unknown point bytes on source80FC0's inhibited branch", () => {
    const w = structuredClone(start),
      q = command(w, 2, 0x80fc0),
      n = w.specialists.records[q.specialist];
    n[113] = n[113]! | 16;
    const before = checksum(w);
    expect(
      dispatchStagedCampaignStrategicRoleCommand(w, q, pack, services).outcome,
    ).toBe("ignored");
    expect(checksum(w)).toBe(before);
  });
  it.each([0, 1, 2, 3])(
    "81150 stops role%s with real release, preserves pending-move and physical velocity",
    (category) => {
      const w = structuredClone(start),
        q = command(w, category, 0x81150),
        n = w.specialists.records[q.specialist];
      n[87] = 3;
      n[130] = 0;
      n[85] = 8;
      put16(n as number[], 45, 63);
      put16(n as number[], 63, 500);
      put32(n as number[], 104, 819);
      dispatchStagedCampaignStrategicRoleCommand(w, q, pack, services);
      expect([n[85], n[126], n[130], n[87]! & 3]).toEqual([1, 255, 0, 2]);
      expect(u32(n as number[], 104)).toBe(0);
      expect(i16(n as number[], 63)).toBe(0);
      expect(i16(n as number[], 45)).toBe(63);
    },
  );
  it("installs native811A0 Engineer placement without UI cell alignment or early activation", () => {
    const w = structuredClone(start),
      q = command(w, 0, 0x811a0, { 2: 6, 4: 11 << 8, 6: 9000, 8: 9000 }),
      n = w.specialists.records[q.specialist],
      rng = checksum(w.rng);
    dispatchStagedCampaignStrategicRoleCommand(w, q, pack, services);
    expect([
      n[126],
      n[130],
      n[131],
      n[90],
      n[91],
      n[87]! & 3,
      n[88]! & 2,
    ]).toEqual([0, 1, 11, 0, 0, 3, 2]);
    expect([i16(n as number[], 92), i16(n as number[], 94)]).toEqual([
      9000, 9000,
    ]);
    expect(w.terrain.revision).toBe(start.terrain.revision);
    expect(checksum(w.rng)).toBe(rng);
  });
  it("requires only Botanist semantic selector/geometry and preserves unused argument halves", () => {
    const w = structuredClone(start),
      q = command(w, 1, 0x811a0, { 6: 9000, 8: 8500 });
    q.packet[3] = 1;
    q.packet[5] = 7; //low task/argument and code/padding intentionally absent
    const n = w.specialists.records[q.specialist],
      b = w.specialists.bindings[q.specialist]!,
      skill = w.players[0].raw[0x16 + b.blueprintIndex * 36 + 23],
      radius = Math.trunc((skill * 1024) / 100) + 512;
    dispatchStagedCampaignStrategicRoleCommand(w, q, pack, services);
    expect(n[131]).toBe(7);
    expect(u32(n as number[], 142)).toBe(Math.imul(radius, radius) >>> 0);
    expect([i16(n as number[], 136), i16(n as number[], 138)]).toEqual([
      9000, 8500,
    ]);
    expect(q.packet[2]).toBeNull();
    expect(q.packet[4]).toBeNull();
  });
  it("sets Geneticist target words and aiming counters;81080 state8 stops the old movement", () => {
    const w = structuredClone(start),
      q = command(w, 2, 0x81080, { 4: 299, 6: 1 });
    q.packet[3] = 0;
    const n = w.specialists.records[q.specialist];
    n[85] = 8;
    n[88] = n[88]! | 2;
    put16(n as number[], 63, 999);
    put16(n as number[], 136, 42);
    dispatchStagedCampaignStrategicRoleCommand(w, q, pack, services);
    expect([
      i16(n as number[], 127),
      n[129],
      n[130],
      i16(n as number[], 136),
      n[88]! & 2,
    ]).toEqual([299, 1, 1, 0, 0]);
    expect(i16(n as number[], 63)).toBe(0);
    expect(n[85]).toBe(8);
  });
  it("releases active Geneticist audio at the exact pending gate before replacing a task", () => {
    const w = structuredClone(start),
      q = command(w, 2, 0x81080, { 4: 2, 6: 1 });
    q.packet[3] = 1;
    const n = w.specialists.records[q.specialist];
    n[88] = n[88]! | 1;
    n[130] = 1;
    n[126] = 0;
    const sequence = w.audio.nextSequence;
    dispatchStagedCampaignStrategicRoleCommand(w, q, pack, services);
    expect(n[88]! & 1).toBe(0);
    expect(n[126]).toBe(1);
    expect(n[130]).toBe(1);
    expect(
      w.audio.requests
        .filter((r) => r.sequence >= sequence)
        .map((r) => (r.type === undefined || r.type === "play" ? [r.cue, r.mode] : r.type)),
    ).toEqual([
      [87, 4],
      [86, 4],
    ]);
  });
  it("installs Shepherd control geometry and target interaction without fabricating attachment", () => {
    const w = structuredClone(start),
      q = command(w, 3, 0x811a0, { 2: 0, 4: 2, 6: 9000, 8: 9000 });
    const n = w.specialists.records[q.specialist];
    dispatchStagedCampaignStrategicRoleCommand(w, q, pack, services);
    expect(n[139]).toBe(2);
    expect([i16(n as number[], 131), i16(n as number[], 133)]).toEqual([
      9000, 9000,
    ]);
    expect(n[85]).not.toBe(12);
    expect(n[88]! & 1).toBe(0);
    const other = command(w, 3, 0x81080, { 2: 0x100, 4: 6, 6: 3 });
    dispatchStagedCampaignStrategicRoleCommand(w, other, pack, services);
    expect([i16(n as number[], 127), n[129]]).toEqual([6, 3]);
  });
  it("retains Shepherd original center when51960's high argument byte is nonzero", () => {
    const w = structuredClone(start),
      q = command(w, 3, 0x811a0, { 2: 0, 4: 0x102, 6: 9000, 8: 9000 }),
      n = w.specialists.records[q.specialist];
    put16(n as number[], 131, 7351);
    put16(n as number[], 133, -83);
    dispatchStagedCampaignStrategicRoleCommand(w, q, pack, services);
    expect(n[139]).toBe(2);
    expect([i16(n as number[], 131), i16(n as number[], 133)]).toEqual([
      7351, -83,
    ]);
  });
  it("runs Botanist area release's actual two scan draws inside the held transaction", () => {
    const w = structuredClone(start),
      q = command(w, 1, 0x81150),
      n = w.specialists.records[q.specialist],
      rng = w.rng,
      before = rng.draws;
    n[88] = n[88]! | 1;
    n[112] = n[112]! | 128;
    n[126] = 0;
    n[130] = 1;
    dispatchStagedCampaignStrategicRoleCommand(w, q, pack, services);
    expect(w.rng).toBe(rng);
    expect(rng.draws - before).toBe(2);
    expect(n[88]! & 1).toBe(0);
    expect(n[126]).toBe(255);
  });
  it("keeps known Engineer repair/upgrade reference side effects separate from unimplemented execution", () => {
    for (const task of [1, 4]) {
      const w = structuredClone(start),
        q = command(w, 0, 0x81080, { 2: task << 8, 4: 17 << 8 }),
        building = w.buildingNative[17],
        n = w.specialists.records[q.specialist];
      put16(building as number[], 15, 17);
      building[6] = 4;
      building[50] = 0;
      dispatchStagedCampaignStrategicRoleCommand(w, q, pack, services);
      expect([i16(n as number[], 127), n[129], building[50]]).toEqual([
        17,
        4,
        task === 1 ? 16 : 4,
      ]);
      if (task === 4)
        expect([i16(building as number[], 64), building[66]]).toEqual([
          q.specialist,
          3,
        ]);
      expect(i16(building as number[], 43)).toBe(
        i16(start.buildingNative[17] as number[], 43),
      );
    }
  });
  it("handles task14's byte-sized reference instead of reading absent target-kind word6", () => {
    const w = structuredClone(start),
      q = command(w, 1, 0x81080, { 2: 14 << 8, 4: (9 << 8) | 4 });
    dispatchStagedCampaignStrategicRoleCommand(w, q, pack, services);
    const n = w.specialists.records[q.specialist];
    expect([n[126], i16(n as number[], 127), n[129]]).toEqual([14, 9, 4]);
    expect(q.packet[6]).toBeNull();
  });
  it("rolls back late malformed geometry after cancellation/audio, including RNG and held original buffers", () => {
    const w = structuredClone(start),
      q = command(w, 2, 0x811a0, { 2: 0, 4: 2, 6: 1 }),
      n = w.specialists.records[q.specialist],
      raw = w.players[0].raw,
      rng = w.rng;
    n[88] = n[88]! | 1;
    n[130] = 1;
    const before = checksum(w);
    expect(() =>
      dispatchCampaignStrategicRoleCommand(w, q, pack, services),
    ).toThrow(/semantic byte/);
    expect(checksum(w)).toBe(before);
    expect(w.specialists.records[q.specialist]).toBe(n);
    expect(w.players[0].raw).toBe(raw);
    expect(w.rng).toBe(rng);
  });
  it("rejects packet/owner mismatches and unsupported task setup without guessed fields", () => {
    const w = structuredClone(start),
      q = command(w, 2, 0x81080, { 2: 3 << 8 });
    const before = checksum(w);
    expect(() =>
      dispatchCampaignStrategicRoleCommand(w, q, pack, services),
    ).toThrow(/task3/);
    expect(checksum(w)).toBe(before);
    q.player = 1;
    expect(() =>
      dispatchCampaignStrategicRoleCommand(w, q, pack, services),
    ).toThrow(/owner or identity/);
  });
  it("round-trips actual pending native setup and continues cancellation identically", () => {
    const w = structuredClone(start),
      q = command(w, 1, 0x811a0, { 2: 0x100, 4: 3 << 8, 6: 9000, 8: 9000 });
    dispatchCampaignStrategicRoleCommand(w, q, pack, services);
    const loaded = loadCampaign(
      saveCampaign(w, { paused: true, speed: 2, accumulator: 1 }),
      w.contentHash,
    ).world;
    const stop = command(w, 1, 0x81150);
    dispatchCampaignStrategicRoleCommand(w, stop, pack, services);
    dispatchCampaignStrategicRoleCommand(loaded, stop, pack, services);
    expect(checksum(loaded)).toBe(checksum(w));
  });
});

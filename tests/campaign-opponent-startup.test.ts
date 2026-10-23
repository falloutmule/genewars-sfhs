import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  bootstrapCampaign,
  campaignPlayerInitialLanding,
  synchronizePlayer,
} from "../src/sim/campaign/bootstrap";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
} from "../src/sim/campaign/world";
import { decodeBytes, encodeBytes, put32 } from "../src/sim/campaign/bytes";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

function opponentFixture() {
  const pack = campaignFixture();
  for (const mission of pack.missions) {
    const s = mission.startup!,
      raw = decodeBytes(s.players[1].recordBase64);
    s.context.activePlayerCount = 2;
    raw[2] = 1;
    raw[0x16 + 31 * 36 + 7] = 79;
    s.players[1].recordBase64 = encodeBytes(raw);
    const ai = Array(1726 * 4).fill(0);
    for (let i = 0; i < 4; i++) {
      put32(ai, i * 1726, 1726);
      ai[i * 1726 + 4] = i;
    }
    ai[1726 + 0x646] = 255;
    s.extensionBase64 = encodeBytes(ai.slice(4));
  }
  return pack;
}
describe("campaign opponent entry", () => {
  it("uses the exact human landing predicate independently of roster size", () => {
    const raw = Array(1805).fill(0),
      prefix = Array(0x355e).fill(0);
    raw[0x6e7] = 3;
    expect(campaignPlayerInitialLanding(raw, 0x3e, prefix)).toBe(true);
    raw[0x6e7] = 4;
    expect(campaignPlayerInitialLanding(raw, 0x3e, prefix)).toBe(false);
    put32(prefix, 0x1ec2, 1);
    expect(campaignPlayerInitialLanding(raw, 0x3e, prefix)).toBe(true);
    expect(campaignPlayerInitialLanding(raw, 0, prefix)).toBe(false);
    raw[2] = 1;
    expect(campaignPlayerInitialLanding(raw, 0x3e, prefix)).toBe(false);
  });
  it("generates the source opponent roster without creating specialists or copying human carry", () => {
    const pack = opponentFixture(),
      first = bootstrapCampaign(pack, "opponent-host");
    expect(first.players[1].blueprints).toHaveLength(20);
    expect(first.players[1].funds).toBe(2000);
    expect(first.players[1].progress).toBe(0);
    expect(first.actors.every((a) => a.owner === 0)).toBe(true);
    expect(first.rng.draws).toBe(128);
    first.players[0].progress = 2;
    synchronizePlayer(first.players[0]);
    const carried = bootstrapCampaign(pack, "opponent-host", 2, {
      players: first.players,
      selectedPlayer: 0,
      world: first.retainedWorld,
      rngRing: first.rng.ring,
    });
    expect(carried.players[1].progress).toBe(1);
    expect(carried.players[1].raw[3]).toBe(0);
    expect(carried.players[1].raw[0x16 + 31 * 36 + 7]).toBe(79);
    expect(carried.rng.draws).toBe(64);
    expect(carried.players[0].progress).toBe(2);
  });
  it("creates only human landing and rejects an older fixture without established strategic storage before simulation advances", () => {
    const pack = opponentFixture(),
      w = createCampaign(pack, "opponent-host");
    enterCampaign(w, pack);
    expect(w.landings.map((l) => l.owner)).toEqual([0]);
    const saved = saveCampaign(w, { paused: true, speed: 1, accumulator: 0 });
    expect(checksum(loadCampaign(saved, "opponent-host").world)).toBe(
      checksum(w),
    );
    const before = structuredClone(w);
    stepCampaign(w, pack);
    expect(w.phase).toBe("blocked");
    expect(w.notices.at(-1)!.text).toMatch(/lacks established strategic state/);
    expect({ ...w, phase: before.phase, notices: before.notices }).toEqual(
      before,
    );
  });
});

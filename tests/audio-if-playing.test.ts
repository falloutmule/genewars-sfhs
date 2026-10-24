import { describe, expect, it } from "vitest";
import {
  requestAudio,
  requestAudioIfPlayingStopPlay,
  requestAudioPlaybackRate,
  type AudioIfPlayingStopPlayRequest,
  type AudioState,
} from "../src/sim/mechanics/audio";
import { cloneCampaignHostRoots } from "../src/sim/campaign/clone-host";
import { createCampaign } from "../src/sim/campaign/world";
import { campaignFixture } from "./fixtures/campaign";
import { campaignBotanistContext } from "../src/sim/campaign/botanist-adapter";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";

const request = (): Omit<
  AudioIfPlayingStopPlayRequest,
  "sequence" | "type"
> => ({
  frame: 10,
  entity: "building:1000",
  cue: 47,
  nextCue: 48,
  nextParameter: 0,
  nextRange: 100,
  nextGain: 80 / 127,
});

describe("conditional source audio intent journal", () => {
  it("stores one flat intent with the existing shared sequence and exact source arguments", () => {
    const state: AudioState = { nextSequence: 12, requests: [] };
    requestAudio(state, {
      frame: 9,
      entity: "building:1000",
      cue: 47,
      mode: 2,
      parameter: 255,
      range: 100,
      gain: 1,
    });
    const q = { ...request(), unrelatedMutableArray: [1, 2] };
    requestAudioIfPlayingStopPlay(state, q);
    q.nextCue = 99;
    requestAudioPlaybackRate(state, {
      frame: 11,
      entity: "building:1000",
      cue: 48,
      ratePercent: 125,
    });
    expect(state.nextSequence).toBe(15);
    expect(state.requests[1]).toEqual({
      ...request(),
      type: "if-playing-stop-play",
      sequence: 13,
    });
    expect(state.requests.map((r) => r.sequence)).toEqual([12, 13, 14]);
    expect(
      Object.values(state.requests[1]).every(
        (v) => v === null || typeof v !== "object",
      ),
    ).toBe(true);
    expect("mode" in state.requests[1]).toBe(false);
    expect("playing" in state.requests[1]).toBe(false);
    expect("unrelatedMutableArray" in state.requests[1]).toBe(false);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("rejects malformed intent atomically and retains the newest256 shared entries", () => {
    const state: AudioState = { nextSequence: 0, requests: [] };
    requestAudioIfPlayingStopPlay(state, request());
    const before = structuredClone(state);
    const invalid = [
      { frame: -1 },
      { frame: 0x100000000 },
      { frame: 1.5 },
      { entity: "" },
      { cue: -1 },
      { cue: 256 },
      { cue: 1.5 },
      { nextCue: -1 },
      { nextCue: 256 },
      { nextParameter: -1 },
      { nextParameter: 256 },
      { nextRange: NaN },
      { nextRange: Infinity },
      { nextGain: NaN },
      { nextGain: Infinity },
      { nextInitialRatePercent: 0 },
      { nextInitialRatePercent: -1 },
      { nextInitialRatePercent: 32768 },
      { nextInitialRatePercent: 1.5 },
    ];
    for (const patch of invalid) {
      expect(() =>
        requestAudioIfPlayingStopPlay(state, { ...request(), ...patch }),
      ).toThrow(/conditional audio/);
      expect(state).toEqual(before);
    }
    requestAudioIfPlayingStopPlay(state, {
      ...request(),
      frame: 0xffffffff,
      cue: 255,
      nextCue: 0,
      nextParameter: 255,
      nextRange: null,
      nextInitialRatePercent: 32767,
    });
    for (let i = 0; i < 260; i++)
      requestAudioIfPlayingStopPlay(state, request());
    expect(state.requests).toHaveLength(256);
    expect(state.requests[0].sequence).toBe(6);
    expect(state.requests.at(-1)!.sequence).toBe(state.nextSequence - 1);
  });

  it("needs no nested clone changes and leaves the Botanist historic ordinary-play selector unchanged", () => {
    const pack = campaignFixture(),
      w = createCampaign(pack, "synthetic-conditional-audio");
    requestAudio(w.audio, {
      frame: 1,
      entity: "source:2:0",
      cue: 51,
      mode: 2,
      parameter: 0,
      range: null,
      gain: 1,
    });
    requestAudioIfPlayingStopPlay(w.audio, {
      ...request(),
      entity: "source:2:0",
      cue: 51,
    });
    requestAudioPlaybackRate(w.audio, {
      frame: 2,
      entity: "source:2:0",
      cue: 51,
      ratePercent: 125,
    });
    const c = campaignBotanistContext(w, pack, {
      effectOptions: () => ({
        gravity: 512,
        obstacleAt: () => false,
        cleanupReferences: cleanupCampaignReferences,
      }),
    });
    expect(c.audioPlaying!(w, 0, 51)).toBe(true);
    const copy = cloneCampaignHostRoots(w);
    expect(copy.audio).not.toBe(w.audio);
    expect(copy.audio.requests[1]).not.toBe(w.audio.requests[1]);
    const intent = copy.audio.requests[1];
    if (intent.type !== "if-playing-stop-play")
      throw Error("Missing copied conditional intent");
    intent.nextCue = 100;
    expect(w.audio.requests[1]).toMatchObject({ nextCue: 48 });
    requestAudio(w.audio, {
      frame: 3,
      entity: "source:2:0",
      cue: 51,
      mode: 4,
      parameter: 0,
      range: null,
      gain: 1,
    });
    requestAudioIfPlayingStopPlay(w.audio, {
      ...request(),
      entity: "source:2:0",
      cue: 51,
    });
    expect(c.audioPlaying!(w, 0, 51)).toBe(false);
  });
});

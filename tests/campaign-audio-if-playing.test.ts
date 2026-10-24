import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignAudio } from "../src/platform/campaign-audio";
import {
  requestAudio,
  requestAudioIfPlayingStopPlay,
  requestAudioPlaybackRate,
  type AudioState,
} from "../src/sim/mechanics/audio";
import type { Pack } from "../src/content/types";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
} from "../src/sim/campaign/world";
import { checksum } from "../src/sim/checksum";
import {
  loadCampaign,
  recordCampaign,
  replayCampaign,
  saveCampaign,
  sealCampaignReplay,
} from "../src/sim/campaign/persistence";

class Device {
  static instances: Device[] = [];
  static events: string[] = [];
  static fail: "none" | "constructor" | "sync" | "reject" = "none";
  static failSrc = "";
  paused = true;
  ended = false;
  volume = 1;
  playbackRate = 1;
  preservesPitch = true;
  plays = 0;
  listeners = new Map<string, () => void>();
  constructor(readonly src: string) {
    if (Device.fail === "constructor" && src === Device.failSrc)
      throw Error("missing device");
    Device.instances.push(this);
  }
  play() {
    this.plays++;
    Device.events.push("play:" + this.src);
    if (Device.fail === "sync" && this.src === Device.failSrc)
      throw Error("device play failed");
    this.paused = false;
    return Device.fail === "reject" && this.src === Device.failSrc
      ? Promise.reject(Error("autoplay rejected"))
      : Promise.resolve();
  }
  pause() {
    Device.events.push("stop:" + this.src);
    this.paused = true;
  }
  addEventListener(name: string, callback: () => void) {
    this.listeners.set(name, callback);
  }
  finish() {
    this.ended = this.paused = true;
    this.listeners.get("ended")?.();
  }
  error() {
    this.listeners.get("error")?.();
  }
}
function media(pack: Pack, classes = false): Pack {
  pack.audioProfile = {
    schemaVersion: 1,
    sourceVersion: "qa-beta-v5-cd",
    preferredFormatIndex: 0,
    alternateFormatIndex: 1,
    cues: {},
    speechBoundary: { effectCueSentinel: 99 },
    provenance: { originalExecution: false },
    records: [47, 48].map((cue) => ({
      cue,
      key: "sample" + cue,
      formatIndex: 0,
      name: "synthetic",
      offset: 0,
      bytes: 1,
      sha256: "0".repeat(64),
    })),
  };
  pack.sounds.sample47 = "synthetic47";
  pack.sounds.sample48 = "synthetic48";
  if (classes)
    pack.specialistVoiceProfile = {
      schemaVersion: 1,
      rows: [],
      descriptorClasses: Array(100).fill(1),
      provenance: {
        executableSha256: "0".repeat(64),
        originalExecution: false,
      },
    };
  return pack;
}
function fixture(classes = false) {
  Device.instances = [];
  Device.events = [];
  Device.fail = "none";
  Device.failSrc = "";
  vi.stubGlobal("Audio", Device);
  const pack = media(campaignFixture(), classes),
    consumer = new CampaignAudio(pack),
    state: AudioState = { nextSequence: 0, requests: [] };
  const play = (entity = "building:1000", cue = 47) =>
    requestAudio(state, {
      frame: 1,
      entity,
      cue,
      mode: 2,
      parameter: 255,
      range: 100,
      gain: 1,
    });
  const conditional = (entity = "building:1000", cue = 47) =>
    requestAudioIfPlayingStopPlay(state, {
      frame: 2,
      entity,
      cue,
      nextCue: 48,
      nextParameter: 0,
      nextRange: 100,
      nextGain: 80 / 127,
    });
  return { pack, consumer, state, play, conditional };
}
afterEach(() => vi.unstubAllGlobals());

describe("device-only97830 conditional stop/play", () => {
  it("takes one matching live-device snapshot, stops47 then plays48 with source gain, and never resolves into the journal", () => {
    const f = fixture(true);
    f.play();
    f.consumer.consume(f.state.requests);
    const old = Device.instances[0];
    let pausedReads = 0,
      endedReads = 0,
      paused = false;
    Object.defineProperty(old, "paused", {
      get: () => {
        pausedReads++;
        return paused;
      },
      set: (v) => {
        paused = v;
      },
    });
    Object.defineProperty(old, "ended", {
      get: () => {
        endedReads++;
        return false;
      },
    });
    f.conditional();
    const before = JSON.stringify(f.state);
    f.consumer.consume(f.state.requests);
    expect([pausedReads, endedReads]).toEqual([1, 1]);
    expect(Device.events).toEqual([
      "play:synthetic47",
      "stop:synthetic47",
      "play:synthetic48",
    ]);
    expect(Device.instances[1].volume).toBeCloseTo(
      (f.consumer.effectsVolume * 80) / 127,
    );
    expect(Device.instances[1].playbackRate).toBe(1); //Range100 is not a rate.
    const allocator = (
      f.consumer as unknown as {
        allocator: {
          slots: {
            descriptor: null | {
              cue: number;
              parameterByte: number;
              comparisonByte: number;
              modeByte: number;
            };
          }[];
        };
      }
    ).allocator;
    expect(
      allocator.slots.flatMap((s) => (s.descriptor ? [s.descriptor] : [])),
    ).toMatchObject([
      { cue: 48, parameterByte: 0, comparisonByte: 80, modeByte: 2 },
    ]);
    f.consumer.consume(f.state.requests);
    expect([pausedReads, endedReads]).toEqual([1, 1]);
    expect(Device.instances).toHaveLength(2);
    expect(JSON.stringify(f.state)).toBe(before);
  });

  it("keeps same-batch play→condition→later play/rate order and one shared sequence per intent", () => {
    const f = fixture();
    f.play();
    f.conditional();
    f.play();
    requestAudioPlaybackRate(f.state, {
      frame: 3,
      entity: "building:1000",
      cue: 48,
      ratePercent: 125,
    });
    const before = JSON.stringify(f.state);
    f.consumer.consume(f.state.requests);
    expect(Device.events).toEqual([
      "play:synthetic47",
      "stop:synthetic47",
      "play:synthetic48",
      "play:synthetic47",
    ]);
    expect(Device.instances[1].playbackRate).toBe(1.25);
    expect(f.state.nextSequence).toBe(4);
    expect(JSON.stringify(f.state)).toBe(before);
  });

  it("does not infer playing from a prior request for missing, wrong, ended, errored, rejected, muted or paused devices", async () => {
    for (const reason of [
      "missing",
      "entity",
      "cue",
      "ended",
      "error",
      "rejected",
      "muted",
      "paused",
    ] as const) {
      const f = fixture();
      if (reason !== "missing") {
        if (reason === "rejected") {
          Device.fail = "reject";
          Device.failSrc = "synthetic47";
        }
        f.play();
        f.consumer.consume(f.state.requests);
        await Promise.resolve();
        if (reason === "ended") Device.instances[0].finish();
        if (reason === "error") Device.instances[0].error();
        if (reason === "muted") f.consumer.enabled = false;
        if (reason === "paused") f.consumer.pause();
      }
      const events = Device.events.slice();
      f.conditional(
        reason === "entity" ? "different" : "building:1000",
        reason === "cue" ? 46 : 47,
      );
      const before = JSON.stringify(f.state);
      f.consumer.consume(f.state.requests);
      expect(Device.events, reason).toEqual(events);
      expect(JSON.stringify(f.state), reason).toBe(before);
    }
  });

  it("observes real shared-slot eviction instead of retaining the old cue's request as active", () => {
    const f = fixture(true);
    f.pack.specialistVoiceProfile!.descriptorClasses![48] = 0;
    f.play();
    for (let i = 0; i < 8; i++) f.play("other:" + i);
    f.consumer.consume(f.state.requests);
    f.play("replacement", 48);
    f.consumer.consume(f.state.requests);
    expect(Device.instances[0].paused).toBe(true);
    expect(Device.instances).toHaveLength(10);
    const events = Device.events.slice();
    f.conditional();
    f.consumer.consume(f.state.requests);
    expect(Device.instances).toHaveLength(10);
    expect(Device.events).toEqual(events);
  });

  it("does not undo the stop when the following sample is missing or the next device creation/play fails", async () => {
    for (const failure of [
      "missing",
      "constructor",
      "sync",
      "reject",
    ] as const) {
      const f = fixture(true);
      f.pack.specialistVoiceProfile!.descriptorClasses!.fill(0);
      f.play();
      for (let i = 0; i < 8; i++) f.play("protected:" + i);
      f.consumer.consume(f.state.requests);
      if (failure === "missing") delete f.pack.sounds.sample48;
      else {
        Device.fail = failure;
        Device.failSrc = "synthetic48";
      }
      f.conditional();
      const before = JSON.stringify(f.state);
      expect(() => f.consumer.consume(f.state.requests)).not.toThrow();
      await Promise.resolve();
      expect(Device.instances[0].paused, failure).toBe(true);
      const attempts = Device.instances.length;
      f.play("freed-after-failure");
      f.consumer.consume(f.state.requests);
      expect(Device.instances.length, failure).toBe(attempts + 1);
      expect(Device.instances.at(-1)!.paused).toBe(false);
      expect(
        JSON.stringify({
          ...f.state,
          requests: f.state.requests.slice(0, -1),
          nextSequence: f.state.nextSequence - 1,
        }),
      ).toBe(before);
    }
  });

  it("does not re-evaluate an entry consumed while muted or paused, and reset skips history without restoring a loop", () => {
    const f = fixture();
    f.play();
    f.consumer.consume(f.state.requests);
    f.consumer.enabled = false;
    f.conditional();
    f.consumer.consume(f.state.requests);
    f.consumer.enabled = true;
    f.consumer.consume(f.state.requests);
    expect(Device.instances).toHaveLength(1);
    f.consumer.pause();
    f.conditional();
    f.consumer.consume(f.state.requests);
    expect(Device.instances).toHaveLength(1);
    f.consumer.resume();
    f.consumer.consume(f.state.requests);
    expect(Device.instances).toHaveLength(1);
    expect(Device.instances[0].plays).toBe(2);
    f.conditional();
    f.consumer.consume(f.state.requests);
    expect(Device.instances).toHaveLength(2);
    f.consumer.reset(f.state.nextSequence);
    f.consumer.consume(f.state.requests);
    expect(Device.instances[1].paused).toBe(true);
    f.conditional();
    f.consumer.consume(f.state.requests);
    expect(Device.instances).toHaveLength(2);
    f.play();
    f.conditional();
    f.consumer.consume(f.state.requests);
    expect(Device.instances).toHaveLength(4);
    f.consumer.dispose();
    expect(Device.instances.slice(2).every((d) => d.paused)).toBe(true);
  });

  it("cannot change complete synthetic campaign state, RNG, saves or headless sealed replay across live/missing/ended consumers", () => {
    const f = fixture(),
      w = createCampaign(f.pack, "synthetic-audio-consumer-independence");
    enterCampaign(w);
    //Explicit initial presentation intents isolate the new consumer contract;
    //this test does not add an Extractor event binding or a mission precondition.
    const startSequence = w.audio.nextSequence;
    requestAudio(w.audio, {
      frame: w.frame,
      entity: "building:1000",
      cue: 47,
      mode: 2,
      parameter: 255,
      range: 100,
      gain: 1,
    });
    requestAudioIfPlayingStopPlay(w.audio, {
      frame: w.frame,
      entity: "building:1000",
      cue: 47,
      nextCue: 48,
      nextParameter: 0,
      nextRange: 100,
      nextGain: 80 / 127,
    });
    const before = checksum(w),
      journal = JSON.stringify(w.audio),
      missing = new CampaignAudio(f.pack),
      ended = new CampaignAudio(f.pack);
    missing.reset(w.audio.nextSequence - 1);
    ended.consume(w.audio.requests.filter((r) => r.sequence === startSequence));
    Device.instances.at(-1)!.finish();
    f.consumer.consume(w.audio.requests);
    missing.consume(w.audio.requests);
    ended.consume(w.audio.requests);
    expect(
      Device.instances.filter((d) => d.src === "synthetic48"),
    ).toHaveLength(1);
    expect(checksum(w)).toBe(before);
    expect(JSON.stringify(w.audio)).toBe(journal);
    const loaded = loadCampaign(
        saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
        w.contentHash,
      ).world,
      recording = recordCampaign(w, "synthetic-conditional-audio");
    expect(loaded.audio).toEqual(w.audio);
    for (let i = 0; i < 8; i++) {
      stepCampaign(w, f.pack);
      stepCampaign(loaded, f.pack);
      expect(checksum(loaded)).toBe(checksum(w));
    }
    expect(w.notices.filter((n) => n.severity === "error")).toEqual([]);
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(recording, w), f.pack, w.contentHash),
      ),
    ).toBe(checksum(w));
  });
});

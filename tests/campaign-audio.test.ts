import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignAudio } from "../src/platform/campaign-audio";
import {
  requestAudio,
  requestAudioPlaybackRate,
  type AudioState,
} from "../src/sim/mechanics/audio";
import type { Pack } from "../src/content/types";
class FakeAudio {
  static instances: FakeAudio[] = [];
  static rejectRate = false;
  static rejectPlay = false;
  paused = true;
  ended = false;
  volume = 1;
  preservesPitch = true;
  rate = 1;
  rateWrites: number[] = [];
  plays = 0;
  pauses = 0;
  listeners = new Map<string, () => void>();
  constructor(readonly src: string) {
    FakeAudio.instances.push(this);
  }
  get playbackRate() {
    return this.rate;
  }
  set playbackRate(value: number) {
    if (FakeAudio.rejectRate) throw Error("Unsupported device rate");
    this.rateWrites.push(value);
    this.rate = value;
  }
  play() {
    this.plays++;
    this.paused = false;
    return FakeAudio.rejectPlay
      ? Promise.reject(Error("Autoplay denied"))
      : Promise.resolve();
  }
  pause() {
    this.pauses++;
    this.paused = true;
  }
  addEventListener(name: string, callback: () => void) {
    this.listeners.set(name, callback);
  }
  finish() {
    this.ended = true;
    this.paused = true;
    this.listeners.get("ended")?.();
  }
}
function fixture() {
  FakeAudio.instances = [];
  FakeAudio.rejectRate = FakeAudio.rejectPlay = false;
  vi.stubGlobal("Audio", FakeAudio);
  const pack = {
    audioProfile: {
      preferredFormatIndex: 0,
      records: [
        { cue: 84, formatIndex: 0, key: "WAVE84" },
        { cue: 41, formatIndex: 0, key: "WAVE41" },
      ],
    },
    sounds: {
      WAVE84: "data:audio/wav;base64,synthetic84",
      WAVE41: "data:audio/wav;base64,synthetic41",
    },
  } as unknown as Pack;
  const state: AudioState = { nextSequence: 0, requests: [] },
    consumer = new CampaignAudio(pack);
  const play = (entity = "source:4:3", cue = 84, initialRatePercent?: number) =>
    requestAudio(state, {
      frame: 1,
      entity,
      cue,
      mode: 2,
      parameter: 255,
      range: 100,
      gain: 1,
      ...(initialRatePercent === undefined ? {} : { initialRatePercent }),
    });
  const rate = (ratePercent: number, entity = "source:4:3", cue = 84) =>
    requestAudioPlaybackRate(state, { frame: 2, entity, cue, ratePercent });
  return { state, consumer, play, rate };
}
afterEach(() => vi.unstubAllGlobals());
describe("explicit source audio rate journal", () => {
  it("keeps legacy play requests compatible and records a separate serializable control without a play mode", () => {
    const { state, play, rate } = fixture();
    play();
    rate(500);
    expect(state.requests).toEqual([
      {
        sequence: 0,
        frame: 1,
        entity: "source:4:3",
        cue: 84,
        mode: 2,
        parameter: 255,
        range: 100,
        gain: 1,
      },
      {
        type: "playback-rate",
        sequence: 1,
        frame: 2,
        entity: "source:4:3",
        cue: 84,
        ratePercent: 500,
      },
    ]);
    expect("mode" in state.requests[1]).toBe(false);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
  it("validates signed SI controls and initial rate atomically, with shared sequence retention", () => {
    const { state, play, rate } = fixture();
    play();
    const saved = structuredClone(state);
    for (const value of [-32769, 32768, NaN, 1.5])
      expect(() => rate(value)).toThrow("playback-rate");
    for (const value of [0, -1, 32768, NaN])
      expect(() => play("source:4:3", 84, value)).toThrow("audio request");
    expect(state).toEqual(saved);
    rate(-32768);
    rate(0);
    rate(32767);
    for (let i = 0; i < 260; i++) rate(100);
    expect(state.requests).toHaveLength(256);
    expect(state.requests.at(-1)?.sequence).toBe(state.nextSequence - 1);
  });
});
describe("CampaignAudio read-only source playback-rate device", () => {
  it("adjusts the matching playing sample with an absolute percent and leaves requests untouched", () => {
    const { state, consumer, play, rate } = fixture();
    play();
    consumer.consume(state.requests);
    const a = FakeAudio.instances[0];
    rate(500);
    const saved = JSON.stringify(state);
    consumer.consume(state.requests);
    expect(a.playbackRate).toBe(5);
    expect(a.preservesPitch).toBe(false);
    expect(a.plays).toBe(1);
    expect(FakeAudio.instances).toHaveLength(1);
    expect(JSON.stringify(state)).toBe(saved);
    rate(200);
    consumer.consume(state.requests);
    expect(a.playbackRate).toBe(2);
    expect(a.rateWrites).toEqual([5, 2]);
    rate(200);
    consumer.consume(state.requests);
    expect(a.rateWrites).toEqual([5, 2]);
    consumer.consume(state.requests);
    expect(a.plays).toBe(1);
  });
  it("sets an explicit initial rate before playback and never infers it from the legacy range field", () => {
    const { state, consumer, play } = fixture();
    play("a", 84, 125);
    play("b", 84);
    consumer.consume(state.requests);
    expect(FakeAudio.instances.map((a) => a.playbackRate)).toEqual([1.25, 1]);
    expect(FakeAudio.instances.map((a) => a.plays)).toEqual([1, 1]);
  });
  it("never creates/restarts samples for missing, different entity/channel, ended, paused or nonpositive updates", () => {
    const { state, consumer, play, rate } = fixture();
    rate(500);
    consumer.consume(state.requests);
    expect(FakeAudio.instances).toHaveLength(0);
    play();
    consumer.consume(state.requests);
    const a = FakeAudio.instances[0];
    rate(500, "other");
    rate(500, "source:4:3", 41);
    rate(0);
    rate(-1);
    consumer.consume(state.requests);
    expect(a.rateWrites).toEqual([]);
    consumer.pause();
    rate(300);
    consumer.consume(state.requests);
    expect(a.rateWrites).toEqual([]);
    expect(a.plays).toBe(1);
    consumer.resume();
    a.finish();
    rate(500);
    consumer.consume(state.requests);
    expect(a.rateWrites).toEqual([]);
    expect(FakeAudio.instances).toHaveLength(1);
  });
  it("obeys request order for play/control/stop and reset removes device aliases", () => {
    const { state, consumer, play, rate } = fixture();
    play();
    rate(500);
    requestAudio(state, {
      frame: 3,
      entity: "source:4:3",
      cue: 84,
      mode: 4,
      parameter: 0,
      range: null,
      gain: 1,
    });
    rate(200);
    consumer.consume(state.requests);
    const a = FakeAudio.instances[0];
    expect(a.playbackRate).toBe(5);
    expect(a.pauses).toBe(1);
    consumer.reset(state.nextSequence);
    rate(100);
    consumer.consume(state.requests);
    expect(FakeAudio.instances).toHaveLength(1);
    play();
    consumer.consume(state.requests);
    expect(FakeAudio.instances).toHaveLength(2);
  });
  it("isolates unsupported rate and autoplay rejection without clamping or mutating the journal", async () => {
    const { state, consumer, play, rate } = fixture();
    play();
    consumer.consume(state.requests);
    const a = FakeAudio.instances[0];
    FakeAudio.rejectRate = true;
    rate(32767);
    const saved = JSON.stringify(state);
    expect(() => consumer.consume(state.requests)).not.toThrow();
    expect(a.playbackRate).toBe(1);
    expect(JSON.stringify(state)).toBe(saved);
    FakeAudio.rejectRate = false;
    rate(500);
    consumer.consume(state.requests);
    expect(a.playbackRate).toBe(5);
    FakeAudio.rejectPlay = true;
    play("denied");
    consumer.consume(state.requests);
    await Promise.resolve();
    rate(500, "denied");
    consumer.consume(state.requests);
    expect(FakeAudio.instances.at(-1)?.rateWrites).toEqual([]);
  });
});

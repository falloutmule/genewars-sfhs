import { afterEach, describe, expect, it, vi } from "vitest";
import { CampaignAudio } from "../src/platform/campaign-audio";
import {
  requestAudio,
  requestAudioPlaybackRate,
  type AudioState,
} from "../src/sim/mechanics/audio";
import type { Pack } from "../src/content/types";
import { mapSpecialistDamageVoice } from "../src/sim/mechanics/specialist-voice";
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
  return { state, consumer, play, rate, pack };
}

function voiceFixture() {
  const f = fixture();
  f.pack.specialistVoiceProfile = {
    schemaVersion: 1,
    descriptorClasses: Array(100).fill(1),
    rows: Array.from({ length: 16 }, (_, i) => ({
      style: i >> 2,
      category: i & 3,
      filenamePrefix: `synthetic/voice${i}_`,
      filenameSuffix: ".wav",
      speechContainer: `synthetic/VOICE${i}.SPE`,
      bundleIndex: i,
      soundKeyPrefix: `VOICE${i}.SPE:`,
    })),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  f.pack.specialistVoiceProfile.descriptorClasses![99] = 0;
  for (let i = 0; i < 16; i++)
    for (const record of [3, 4])
      f.pack.sounds[`VOICE${i}.SPE:${record}`] =
        `data:audio/wav;base64,synthetic-voice${i}-${record}`;
  const voice = (sequence: number, variant: 4 | 5 = 4, index = 0) => ({
    sequence,
    request: mapSpecialistDamageVoice(
      {
        type: "specialist-voice",
        index,
        style: 0,
        category: 0,
        variant,
        queuePolicy: 0,
        arguments: [2, 0, 127, 100],
      },
      {
        frame: 7,
        owner: Math.floor(index / 5),
        pathPrefix: "",
        profile: f.pack.specialistVoiceProfile,
        sounds: f.pack.sounds,
      },
    ),
  });
  return { ...f, voice, context: { selectedPlayer: 0, runtimeFlags: 4 } };
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

describe("CampaignAudio specialist speech with shared source415C0 capacity", () => {
  it("plays the SPE key with voice volume, preserves journals, and deduplicates case-insensitive filenames across entities", () => {
    const f = voiceFixture(),
      entries = [f.voice(0)];
    f.consumer.voiceVolume = 0.25;
    const before = JSON.stringify([f.state, entries, f.pack]);
    expect(f.consumer.consumeVoices(entries, f.context)).toEqual([
      { sequence: 0, status: "submitted" },
    ]);
    const a = FakeAudio.instances[0];
    expect(a.src).toBe(f.pack.sounds["VOICE0.SPE:3"]);
    expect(a.volume).toBe(0.25);
    expect(a.preservesPitch).toBe(false);
    expect(a.playbackRate).toBe(1);
    expect(a.plays).toBe(1);
    expect(JSON.stringify([f.state, entries, f.pack])).toBe(before);
    expect(f.consumer.consumeVoices(entries, f.context)).toEqual([]);
    const same = f.voice(1, 4, 1);
    if (same.request.resource.status !== "profile-unavailable")
      same.request.resource.filename =
        same.request.resource.filename.toUpperCase();
    expect(f.consumer.consumeVoices([same], f.context)[0].status).toBe(
      "same-filename",
    );
    a.finish();
    expect(f.consumer.consumeVoices([f.voice(2)], f.context)[0].status).toBe(
      "same-filename",
    );
    expect(FakeAudio.instances).toHaveLength(1);
  });
  it("consumes muted/other-owner/disabled entries without starting devices or latching their filename", () => {
    const f = voiceFixture();
    f.consumer.enabled = false;
    expect(f.consumer.consumeVoices([f.voice(0)], f.context)[0].status).toBe(
      "muted",
    );
    f.consumer.enabled = true;
    expect(
      f.consumer.consumeVoices([f.voice(1)], {
        ...f.context,
        selectedPlayer: 1,
      })[0].status,
    ).toBe("other-owner");
    expect(
      f.consumer.consumeVoices([f.voice(2)], {
        ...f.context,
        runtimeFlags: 0,
      })[0].status,
    ).toBe("disabled");
    expect(FakeAudio.instances).toHaveLength(0);
    expect(f.consumer.consumeVoices([f.voice(3)], f.context)[0].status).toBe(
      "submitted",
    );
    expect(FakeAudio.instances).toHaveLength(1);
  });
  it("shares nine descriptors with numeric effects, applies class0 eviction, and frees capacity on device end", () => {
    const f = voiceFixture();
    for (let i = 0; i < 9; i++) f.play(`effect:${i}`);
    f.consumer.consume(f.state.requests);
    expect(FakeAudio.instances).toHaveLength(9);
    expect(f.consumer.consumeVoices([f.voice(0)], f.context)[0].status).toBe(
      "submitted",
    );
    expect(FakeAudio.instances).toHaveLength(10);
    expect(FakeAudio.instances[0].pauses).toBe(1); //First equal nonzero class.
    expect(FakeAudio.instances.slice(1).every((a) => !a.paused)).toBe(true);
    f.play("full-effect");
    f.consumer.consume(f.state.requests);
    expect(FakeAudio.instances).toHaveLength(10);
    FakeAudio.instances[1].finish();
    f.play("freed-effect");
    f.consumer.consume(f.state.requests);
    expect(FakeAudio.instances).toHaveLength(11);
    expect(FakeAudio.instances.at(-1)!.src).toBe(f.pack.sounds.WAVE84);
  });
  it("retains the419E0 filename copy when all nine classes are protected and allocation fails", () => {
    const f = voiceFixture();
    f.pack.specialistVoiceProfile!.descriptorClasses!.fill(0);
    for (let i = 0; i < 9; i++) f.play(`protected:${i}`);
    f.consumer.consume(f.state.requests);
    expect(f.consumer.consumeVoices([f.voice(0)], f.context)[0].status).toBe(
      "capacity",
    );
    FakeAudio.instances[0].finish();
    expect(f.consumer.consumeVoices([f.voice(1)], f.context)[0].status).toBe(
      "same-filename",
    );
    expect(FakeAudio.instances).toHaveLength(9);
    expect(f.consumer.consumeVoices([f.voice(2, 5)], f.context)[0].status).toBe(
      "submitted",
    );
  });
  it("interrupts speech and updates the filename before missing-sample failure; cue99 never loads SOUND.DAT", () => {
    const f = voiceFixture();
    f.consumer.consumeVoices([f.voice(0)], f.context);
    const old = FakeAudio.instances[0],
      missing = f.pack.sounds["VOICE0.SPE:4"];
    delete f.pack.sounds["VOICE0.SPE:4"];
    expect(f.consumer.consumeVoices([f.voice(1, 5)], f.context)[0].status).toBe(
      "sample-unavailable",
    );
    expect(old.pauses).toBe(1);
    expect(FakeAudio.instances).toHaveLength(1);
    f.pack.sounds["VOICE0.SPE:4"] = missing;
    expect(f.consumer.consumeVoices([f.voice(2, 5)], f.context)[0].status).toBe(
      "same-filename",
    );
    expect(f.consumer.consumeVoices([f.voice(3)], f.context)[0].status).toBe(
      "submitted",
    );
    expect(FakeAudio.instances).toHaveLength(2);
  });
  it("reports absent profiles/classes explicitly while retaining legacy numeric device behavior", () => {
    const f = voiceFixture(),
      mapped = f.voice(0);
    delete f.pack.specialistVoiceProfile;
    expect(f.consumer.consumeVoices([f.voice(0)], f.context)[0].status).toBe(
      "profile-unavailable",
    );
    expect(
      f.consumer.consumeVoices([{ ...mapped, sequence: 1 }], f.context)[0]
        .status,
    ).toBe("descriptor-classes-unavailable");
    for (let i = 0; i < 10; i++) f.play(`legacy:${i}`);
    f.consumer.consume(f.state.requests);
    expect(FakeAudio.instances).toHaveLength(10);
  });
  it("releases a rejected speech descriptor, isolates stale ended callbacks after replacement, and honors voice rate/stop", async () => {
    const f = voiceFixture();
    FakeAudio.rejectPlay = true;
    f.consumer.consumeVoices([f.voice(0)], f.context);
    await Promise.resolve();
    FakeAudio.rejectPlay = false;
    f.consumer.consumeVoices([f.voice(1, 5)], f.context);
    const first = FakeAudio.instances[1];
    f.consumer.consumeVoices([f.voice(2)], f.context);
    const latest = FakeAudio.instances[2];
    first.finish(); //Late notification for a replaced physical channel.
    f.rate(500, "source:2:0", 99);
    f.consumer.consume(f.state.requests);
    expect(latest.playbackRate).toBe(5);
    for (let i = 0; i < 8; i++) f.play(`effect:${i}`);
    f.consumer.consume(f.state.requests);
    expect(FakeAudio.instances).toHaveLength(11); //Three voice attempts+eight effects.
    f.play("must-not-steal-voice");
    f.consumer.consume(f.state.requests);
    expect(FakeAudio.instances).toHaveLength(11);
    requestAudio(f.state, {
      frame: 9,
      entity: "source:2:0",
      cue: 99,
      mode: 4,
      parameter: 0,
      range: null,
      gain: 1,
    });
    f.consumer.consume(f.state.requests);
    expect(latest.paused).toBe(true);
    f.play("released-by-voice-stop");
    f.consumer.consume(f.state.requests);
    expect(FakeAudio.instances).toHaveLength(12);
  });
  it("defers new speech while paused, resumes it once, and resets both journal cursors and aliases", () => {
    const f = voiceFixture();
    f.consumer.pause();
    expect(f.consumer.consumeVoices([f.voice(0)], f.context)[0].status).toBe(
      "paused",
    );
    expect(FakeAudio.instances[0].plays).toBe(0);
    f.consumer.resume();
    expect(FakeAudio.instances[0].plays).toBe(1);
    f.consumer.resume();
    expect(FakeAudio.instances[0].plays).toBe(1);
    f.consumer.reset(f.state.nextSequence, 5);
    expect(
      f.consumer.consumeVoices([f.voice(0), f.voice(4)], f.context),
    ).toEqual([]);
    expect(f.consumer.consumeVoices([f.voice(5)], f.context)[0].status).toBe(
      "submitted",
    );
    expect(FakeAudio.instances).toHaveLength(2);
    FakeAudio.instances[0].finish(); //Cannot release the newly reset allocator.
    f.consumer.dispose();
    expect(FakeAudio.instances[1].paused).toBe(true);
    f.consumer.reset(f.state.nextSequence); //Default voice cursor starts at0.
    expect(f.consumer.consumeVoices([f.voice(0)], f.context)[0].status).toBe(
      "submitted",
    );
  });
  it("frees rejected speech capacity before any later voice, and frees a subsequent media-error channel", async () => {
    const f = voiceFixture();
    FakeAudio.rejectPlay = true;
    f.consumer.consumeVoices([f.voice(0)], f.context);
    await Promise.resolve();
    FakeAudio.rejectPlay = false;
    f.pack.specialistVoiceProfile!.descriptorClasses!.fill(0);
    for (let i = 0; i < 9; i++) f.play(`after-rejection:${i}`);
    f.consumer.consume(f.state.requests);
    expect(FakeAudio.instances).toHaveLength(10); //Denied voice+nine occupied effects.
    const broken = FakeAudio.instances[1];
    broken.listeners.get("error")!();
    expect(broken.paused).toBe(true);
    f.play("after-media-error");
    f.consumer.consume(f.state.requests);
    expect(FakeAudio.instances).toHaveLength(11);
  });
});

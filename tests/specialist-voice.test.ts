import { describe, expect, it } from "vitest";
import {
  mapSpecialistDamageVoice,
  planSpecialistVoicePolicy0,
  createSpecialistVoiceJournal,
  journalSpecialistDamageVoice,
  createSourceAudioAllocator,
  allocateSourceAudioDescriptor,
  releaseSourceAudioDescriptor,
  specialistVoiceDescriptor,
  type SourceAudioDescriptor,
  type SpecialistVoiceProfile,
  type SpecialistDamageVoiceEvent,
} from "../src/sim/mechanics/specialist-voice";

const profile: SpecialistVoiceProfile = {
  schemaVersion: 1,
  rows: Array.from({ length: 16 }, (_, i) => ({
    style: i >> 2,
    category: i & 3,
    filenamePrefix: `synthetic/voice${i}_`,
    filenameSuffix: ".wav",
    speechContainer: `synthetic/TEST${i}.SPE`,
    bundleIndex: 15 - i,
    soundKeyPrefix: `TEST${i}.SPE:`,
  })),
};
const event = (
  style = 0,
  category = 0,
  variant: 4 | 5 = 4,
): SpecialistDamageVoiceEvent => ({
  type: "specialist-voice",
  index: 7,
  style,
  category,
  variant,
  queuePolicy: 0,
  arguments: [2, 0, 127, 100],
});
const mapContext = {
  frame: 123,
  pathPrefix: "",
  owner: 1,
  profile,
  sounds: { "TEST0.SPE:3": "synthetic-wave" },
};
const queueContext = {
  selectedPlayer: 1,
  runtimeFlags: 4,
  filenameBuffer: "",
  currentSpeech: null,
};
describe("source specialist filename speech", () => {
  it("prepends the explicit runtime1187BC path without changing the SPE key", () => {
    const r = mapSpecialistDamageVoice(event(), {
      ...mapContext,
      pathPrefix: "chosen/",
    });
    expect(r.resource).toMatchObject({
      filename: "chosen/synthetic/voice0_004.wav",
      speechContainer: "chosen/synthetic/TEST0.SPE",
      soundKey: "TEST0.SPE:3",
    });
    expect(() =>
      mapSpecialistDamageVoice(event(), {
        ...mapContext,
        pathPrefix: "x".repeat(64),
      }),
    ).toThrow(/bounded source buffer/);
    expect(specialistVoiceDescriptor(r)).toEqual({
      entity: "source:2:7",
      cue: 99,
      comparisonByte: 127,
      parameterByte: 0,
      modeByte: 2,
      ratePercent: 100,
      flags: 64,
      mediaKey: "TEST0.SPE:3",
    });
  });
  it("maps all16 category/style bindings and both damage variants to existing zero-based SPE keys", () => {
    for (let style = 0; style < 4; style++)
      for (let category = 0; category < 4; category++)
        for (const variant of [4, 5] as const) {
          const key = `TEST${style * 4 + category}.SPE:${variant - 1}`,
            r = mapSpecialistDamageVoice(event(style, category, variant), {
              ...mapContext,
              sounds: { [key]: "synthetic-wave" },
            });
          expect(r.entity).toBe("source:2:7");
          expect(r.resource).toEqual({
            status: "ready",
            filename: `synthetic/voice${style * 4 + category}_${String(variant).padStart(3, "0")}.wav`,
            speechContainer: `synthetic/TEST${style * 4 + category}.SPE`,
            bundleIndex: 15 - style * 4 - category,
            recordIndex: variant - 1,
            soundKey: key,
          });
          expect(r).not.toHaveProperty("cue");
          expect(r).not.toHaveProperty("textIndex");
        }
  });
  it("preserves explicit missing profile/sample boundaries without falling back to SOUND cue ordinals", () => {
    const noProfile = mapSpecialistDamageVoice(event(), {
      ...mapContext,
      profile: null,
    });
    expect(noProfile.resource).toEqual({ status: "profile-unavailable" });
    expect(planSpecialistVoicePolicy0(noProfile, queueContext)).toEqual({
      type: "unresolved",
      reason: "profile-unavailable",
    });
    const noSample = mapSpecialistDamageVoice(event(), {
      ...mapContext,
      sounds: { "SOUND:0:2:4": "effect-wave" },
    });
    expect(noSample.resource.status).toBe("sample-unavailable");
    expect(planSpecialistVoicePolicy0(noSample, queueContext).type).toBe(
      "submit",
    );
  });
  it("applies selected-owner and flags4 gates before current-speech tests", () => {
    const r = mapSpecialistDamageVoice(event(), mapContext);
    expect(
      planSpecialistVoicePolicy0(r, { ...queueContext, selectedPlayer: 0 }),
    ).toEqual({ type: "ignored", reason: "other-owner" });
    expect(
      planSpecialistVoicePolicy0(r, { ...queueContext, runtimeFlags: 0 }),
    ).toEqual({ type: "ignored", reason: "disabled" });
  });
  it("drops a lower comparison byte and submits an equal byte with explicit interruption intent", () => {
    const r = mapSpecialistDamageVoice(event(), mapContext),
      current = { entity: "source:2:6", comparisonByte: 128 };
    expect(
      planSpecialistVoicePolicy0(r, {
        ...queueContext,
        currentSpeech: current,
      }),
    ).toEqual({ type: "ignored", reason: "lower-comparison-byte" });
    current.comparisonByte = 127;
    const decision = planSpecialistVoicePolicy0(r, {
      ...queueContext,
      currentSpeech: current,
    });
    expect(decision).toEqual({
      type: "submit",
      allocator: "source415C0",
      interrupt: current,
      filenameBufferAfter: "synthetic/voice0_004.wav",
    });
    if (decision.type === "submit")
      expect(decision.interrupt).not.toBe(current);
  });
  it("uses ASCII-insensitive filename-buffer deduplication even without a current speech pointer", () => {
    const r = mapSpecialistDamageVoice(event(), mapContext);
    expect(
      planSpecialistVoicePolicy0(r, {
        ...queueContext,
        filenameBuffer: "SYNTHETIC/VOICE0_004.WAV",
      }),
    ).toEqual({ type: "ignored", reason: "same-filename" });
    expect(
      planSpecialistVoicePolicy0(r, {
        ...queueContext,
        filenameBuffer: "synthetic/voice0_005.wav",
      }).type,
    ).toBe("submit");
  });
  it("journals requests/decisions in serializable order without mutating event, profile or queue state", () => {
    const journal = createSpecialistVoiceJournal(),
      e = event(),
      c = { ...mapContext, ...queueContext },
      before = JSON.stringify([e, c]);
    expect(journalSpecialistDamageVoice(journal, e, c).sequence).toBe(0);
    expect(
      journalSpecialistDamageVoice(journal, event(0, 0, 5), c).sequence,
    ).toBe(1);
    expect(JSON.stringify([e, c])).toBe(before);
    expect(JSON.parse(JSON.stringify(journal))).toEqual(journal);
    expect(journal.nextSequence).toBe(2);
  });
  it("rejects malformed bindings/contracts atomically before journal append", () => {
    const journal = createSpecialistVoiceJournal(),
      before = JSON.stringify(journal);
    for (const e of [
      { ...event(), style: 4 },
      { ...event(), index: 20 },
      { ...event(), arguments: [2, 0, 127, 99] },
    ] as SpecialistDamageVoiceEvent[])
      expect(() =>
        journalSpecialistDamageVoice(journal, e, {
          ...mapContext,
          ...queueContext,
        }),
      ).toThrow();
    expect(() =>
      mapSpecialistDamageVoice(event(), { ...mapContext, owner: 0 }),
    ).toThrow(/contract/);
    const invalid = structuredClone(profile);
    invalid.rows = [...invalid.rows, invalid.rows[0]];
    expect(() =>
      mapSpecialistDamageVoice(event(), { ...mapContext, profile: invalid }),
    ).toThrow(/16 rows/);
    expect(JSON.stringify(journal)).toBe(before);
  });
});

const descriptor = (
  cue: number,
  comparisonByte = 127,
): SourceAudioDescriptor => ({
  entity: `synthetic:${cue}`,
  cue,
  comparisonByte,
  parameterByte: 0,
  modeByte: 2,
  ratePercent: 100,
  flags: 64,
  mediaKey: `synthetic-wave:${cue}`,
});
function fullAllocator(classes: number[]) {
  let s = createSourceAudioAllocator();
  for (let i = 0; i < 9; i++)
    s = allocateSourceAudioDescriptor(s, descriptor(i), classes).after;
  return s;
}
describe("source415C0 shared nine-descriptor allocator", () => {
  it("uses first free slots, retains source new-slot marker100 and tracks/retires the speech slot", () => {
    const classes = Array(100).fill(1);
    classes[99] = 0;
    const s = fullAllocator(classes),
      released = releaseSourceAudioDescriptor(s, 2);
    released.slots[2].deferredStop.entity = "retained-sidecar";
    const r = allocateSourceAudioDescriptor(released, descriptor(99), classes);
    expect(r.slot).toBe(2);
    expect(r.after.count).toBe(9);
    expect(r.after.speechSlot).toBe(2);
    expect(r.after.slots[2].deferredStop).toEqual({
      entity: "retained-sidecar",
      cue: 100,
    });
    expect(releaseSourceAudioDescriptor(r.after, 2).speechSlot).toBeNull();
    expect(s.slots[2].descriptor?.cue).toBe(2);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
  it("selects class0's minimum comparison byte, then larger class, then first tie, overwriting the sidecar", () => {
    const classes = Array(100).fill(1);
    classes[0] = classes[99] = 0;
    classes[2] = 2;
    classes[3] = classes[4] = 4;
    const s = fullAllocator(classes);
    s.slots[0].descriptor!.comparisonByte = 1; //Protected class0 is excluded.
    for (const i of [2, 3, 4]) s.slots[i].descriptor!.comparisonByte = 20;
    s.slots[3].deferredStop = { entity: "old-pending", cue: 11 };
    const before = JSON.stringify(s),
      r = allocateSourceAudioDescriptor(s, descriptor(99), classes);
    expect(r.slot).toBe(3);
    expect(r.replaced?.entity).toBe("synthetic:3");
    expect(r.after.slots[3].deferredStop).toEqual({
      entity: "synthetic:3",
      cue: 3,
    });
    expect(JSON.stringify(s)).toBe(before);
  });
  it("uses nonzero class's first eligible slot and preserves a previously pending sidecar", () => {
    const classes = Array(100).fill(2);
    classes[0] = 0;
    classes[50] = 1;
    const s = fullAllocator(classes);
    s.slots[1].descriptor!.comparisonByte = 100;
    s.slots[2].descriptor!.comparisonByte = 5;
    s.slots[1].deferredStop = { entity: "pending-prior", cue: 18 };
    let r = allocateSourceAudioDescriptor(s, descriptor(50, 100), classes);
    expect(r.slot).toBe(1);
    expect(r.after.slots[1].deferredStop).toEqual({
      entity: "pending-prior",
      cue: 18,
    });
    s.slots[1].deferredStop = { entity: null, cue: 0 };
    r = allocateSourceAudioDescriptor(s, descriptor(50, 100), classes);
    expect(r.after.slots[1].deferredStop).toEqual({
      entity: "synthetic:1",
      cue: 1,
    });
  });
  it("does not evict protected classes or manufacture capacity when no source candidate qualifies", () => {
    const classes = Array(100).fill(0),
      s = fullAllocator(classes),
      before = JSON.stringify(s);
    expect(
      allocateSourceAudioDescriptor(s, descriptor(99), classes).slot,
    ).toBeNull();
    classes.fill(1);
    expect(
      allocateSourceAudioDescriptor(s, descriptor(50, 127), classes).slot,
    ).toBeNull();
    classes[99] = 0;
    for (const slot of s.slots) slot.descriptor!.comparisonByte = 128;
    expect(
      allocateSourceAudioDescriptor(s, descriptor(99), classes).slot,
    ).toBeNull(); //Source starts its best byte at127.
    expect(JSON.parse(before).count).toBe(s.count);
  });
  it("rejects unknown classifications and inconsistent counts without mutating input", () => {
    const s = createSourceAudioAllocator(),
      before = JSON.stringify(s);
    expect(() =>
      allocateSourceAudioDescriptor(s, descriptor(99), undefined),
    ).toThrow(/Admitted105F60/);
    expect(() =>
      allocateSourceAudioDescriptor(s, descriptor(100), Array(100).fill(1)),
    ).toThrow(/cue/);
    expect(JSON.stringify(s)).toBe(before);
    s.count = 1;
    expect(() =>
      allocateSourceAudioDescriptor(s, descriptor(1), Array(100).fill(1)),
    ).toThrow(/occupancy/);
  });
});

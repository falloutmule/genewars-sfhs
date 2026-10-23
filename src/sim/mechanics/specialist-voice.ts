/**419E0 policy0 specialist speech. This journal is presentation state only;
 * no device playback result, effect cue or subtitle ordinal drives gameplay. */
import type { SpecialistDamageEvent } from "./specialist-damage";

export type SpecialistDamageVoiceEvent = Extract<
  SpecialistDamageEvent,
  { type: "specialist-voice" }
>;
export interface SpecialistVoiceProfile {
  schemaVersion: 1;
  /** Imported105F60. Required by415C0 allocation, independent of filenames. */
  descriptorClasses?: readonly number[];
  rows: readonly {
    style: number;
    category: number;
    filenamePrefix: string;
    filenameSuffix: string;
    speechContainer: string;
    bundleIndex: number;
    soundKeyPrefix: string;
  }[];
}
export interface SpecialistVoiceBinding {
  filename: string;
  speechContainer: string;
  bundleIndex: number;
  /**40360 decodes the filename's decimal suffix and subtracts1. */
  recordIndex: number;
  soundKey: string;
}
export interface SpecialistVoiceRequest {
  type: "specialist-voice";
  frame: number;
  entity: `source:2:${number}`;
  owner: number;
  style: number;
  category: number;
  variant: 4 | 5;
  queuePolicy: 0;
  arguments: [2, 0, 127, 100];
  resource:
    | { status: "profile-unavailable" }
    | (SpecialistVoiceBinding & { status: "ready" | "sample-unavailable" });
}
export interface SpecialistVoiceMapContext {
  frame: number;
  /** Actual1187BC path prepended by A6390, or an explicit presentation policy. */
  pathPrefix: string;
  /** Actual native24. Its five-slot partition is independently validated. */
  owner: number;
  profile?: SpecialistVoiceProfile | null;
  /** Existing private pack.sounds, including SPE-basename:zero-based-index. */
  sounds?: Readonly<Record<string, string>>;
}
function integer(v: number, min: number, max: number, name: string) {
  if (!Number.isInteger(v) || v < min || v > max)
    throw Error("Invalid specialist voice " + name);
}
function safeName(v: string) {
  return (
    typeof v === "string" &&
    /^[A-Za-z0-9_./\\:-]+$/.test(v) &&
    !v.includes("..") &&
    !v.startsWith("/") &&
    !v.startsWith("\\")
  );
}
function validateProfile(profile: SpecialistVoiceProfile) {
  if (profile.schemaVersion !== 1 || profile.rows.length !== 16)
    throw Error("Actual specialist voice profile16 rows required");
  const slots = new Set<number>();
  for (const r of profile.rows) {
    integer(r.style, 0, 3, "profile style");
    integer(r.category, 0, 3, "profile category");
    integer(r.bundleIndex, 0, 17, "SPE bundle index");
    const slot = r.style * 4 + r.category;
    if (
      slots.has(slot) ||
      ![
        r.filenamePrefix,
        r.filenameSuffix,
        r.speechContainer,
        r.soundKeyPrefix,
      ].every(safeName) ||
      r.filenamePrefix.includes(":") ||
      r.speechContainer.includes(":") ||
      r.filenamePrefix.length + r.filenameSuffix.length + 3 >= 64 ||
      !/^\.[A-Za-z0-9]+$/.test(r.filenameSuffix) ||
      r.soundKeyPrefix !==
        r.speechContainer
          .replaceAll("\\", "/")
          .split("/")
          .at(-1)!
          .toUpperCase() +
          ":"
    )
      throw Error("Invalid specialist voice resource binding");
    slots.add(slot);
  }
}
export function mapSpecialistDamageVoice(
  event: SpecialistDamageVoiceEvent,
  c: SpecialistVoiceMapContext,
): SpecialistVoiceRequest {
  integer(event.index, 0, 19, "index");
  integer(event.style, 0, 3, "style");
  integer(event.category, 0, 3, "category");
  integer(c.owner, 0, 3, "owner");
  integer(c.frame, 0, 0xffffffff, "frame");
  if (typeof c.pathPrefix !== "string" || !/^[\x20-\x7e]*$/.test(c.pathPrefix))
    throw Error("Explicit specialist voice path prefix required");
  if (
    event.type !== "specialist-voice" ||
    ![4, 5].includes(event.variant) ||
    event.queuePolicy !== 0 ||
    event.arguments.length !== 4 ||
    event.arguments.some((v, i) => v !== [2, 0, 127, 100][i]) ||
    c.owner !== Math.floor(event.index / 5)
  )
    throw Error("Actual specialist damage voice contract required");
  const request: SpecialistVoiceRequest = {
    type: "specialist-voice",
    frame: c.frame,
    entity: `source:2:${event.index}`,
    owner: c.owner,
    style: event.style,
    category: event.category,
    variant: event.variant,
    queuePolicy: 0,
    arguments: [...event.arguments],
    resource: { status: "profile-unavailable" },
  };
  if (!c.profile) return request;
  validateProfile(c.profile);
  const row = c.profile.rows.find(
      (r) => r.style === event.style && r.category === event.category,
    )!,
    recordIndex = event.variant - 1,
    soundKey = row.soundKeyPrefix + recordIndex;
  if (
    c.pathPrefix.length +
      row.filenamePrefix.length +
      3 +
      row.filenameSuffix.length >=
    64
  )
    throw Error("Specialist voice filename exceeds bounded source buffer");
  request.resource = {
    status: c.sounds?.[soundKey] ? "ready" : "sample-unavailable",
    filename:
      c.pathPrefix +
      row.filenamePrefix +
      String(event.variant).padStart(3, "0") +
      row.filenameSuffix,
    speechContainer: c.pathPrefix + row.speechContainer,
    bundleIndex: row.bundleIndex,
    recordIndex,
    soundKey,
  };
  return request;
}

export interface SpecialistVoiceQueueContext {
  selectedPlayer: number;
  runtimeFlags: number;
  /** Source+118FE filename buffer, independently of whether+FA is active. */
  filenameBuffer: string;
  currentSpeech: { entity: string; comparisonByte: number } | null;
}
export type SpecialistVoiceDecision =
  | {
      type: "ignored";
      reason:
        | "other-owner"
        | "disabled"
        | "lower-comparison-byte"
        | "same-filename";
    }
  | { type: "unresolved"; reason: "profile-unavailable" }
  | {
      type: "submit";
      /** Source415C0 shares nine active descriptors with ordinary effects.
       * Submission does not promise allocation or device playback success. */
      allocator: "source415C0";
      interrupt: SpecialistVoiceQueueContext["currentSpeech"];
      filenameBufferAfter: string;
    };
const asciiFold = (s: string) => s.replace(/[A-Z]/g, (v) => v.toLowerCase());
export function planSpecialistVoicePolicy0(
  request: SpecialistVoiceRequest,
  c: SpecialistVoiceQueueContext,
): SpecialistVoiceDecision {
  integer(c.selectedPlayer, 0, 3, "selected player");
  integer(c.runtimeFlags, 0, 0xffffffff, "runtime flags");
  if (request.owner !== c.selectedPlayer)
    return { type: "ignored", reason: "other-owner" };
  if (!(c.runtimeFlags & 4)) return { type: "ignored", reason: "disabled" };
  if (c.currentSpeech) {
    integer(c.currentSpeech.comparisonByte, 0, 255, "current comparison byte");
    if (request.arguments[2] < c.currentSpeech.comparisonByte)
      return { type: "ignored", reason: "lower-comparison-byte" };
  }
  if (request.resource.status === "profile-unavailable")
    return { type: "unresolved", reason: "profile-unavailable" };
  if (typeof c.filenameBuffer !== "string")
    throw Error("Actual speech filename buffer required");
  if (asciiFold(c.filenameBuffer) === asciiFold(request.resource.filename))
    return { type: "ignored", reason: "same-filename" };
  return {
    type: "submit",
    allocator: "source415C0",
    interrupt: c.currentSpeech ? { ...c.currentSpeech } : null,
    filenameBufferAfter: request.resource.filename,
  };
}
export interface SpecialistVoiceJournalEntry {
  sequence: number;
  request: SpecialistVoiceRequest;
  decision: SpecialistVoiceDecision;
}
export interface SpecialistVoiceJournal {
  schemaVersion: 1;
  nextSequence: number;
  entries: SpecialistVoiceJournalEntry[];
}
export function createSpecialistVoiceJournal(): SpecialistVoiceJournal {
  return { schemaVersion: 1, nextSequence: 0, entries: [] };
}
/** Appends a source request/decision only. The host owns any history retention
 * and supplies current queue state; browser audio never changes simulation. */
export function journalSpecialistDamageVoice(
  journal: SpecialistVoiceJournal,
  event: SpecialistDamageVoiceEvent,
  c: SpecialistVoiceMapContext & SpecialistVoiceQueueContext,
): SpecialistVoiceJournalEntry {
  if (
    journal.schemaVersion !== 1 ||
    !Array.isArray(journal.entries) ||
    !Number.isSafeInteger(journal.nextSequence) ||
    journal.nextSequence < 0 ||
    journal.nextSequence >= Number.MAX_SAFE_INTEGER
  )
    throw Error("Invalid specialist voice journal");
  const request = mapSpecialistDamageVoice(event, c),
    decision = planSpecialistVoicePolicy0(request, c),
    entry = { sequence: journal.nextSequence, request, decision };
  journal.entries.push(entry);
  journal.nextSequence++;
  return entry;
}

/** Source22-byte descriptor's known numeric fields and logical entity. Device
 * handles, source process pointers and untouched stack bytes are not modeled.
 * mediaKey is a conversion resource binding, not an original field. */
export interface SourceAudioDescriptor {
  entity: string;
  cue: number;
  comparisonByte: number;
  parameterByte: number;
  modeByte: number;
  ratePercent: number;
  flags: number;
  mediaKey: string;
}
export interface SourceAudioSlot {
  descriptor: SourceAudioDescriptor | null;
  /** Source five-byte sidecar. Cue100 is the new-slot marker, not a sample.
   * Nonzero sidecars survive the nonzero-class replacement branch. */
  deferredStop: { entity: string | null; cue: number };
}
export interface SourceAudioAllocatorState {
  schemaVersion: 1;
  slots: SourceAudioSlot[];
  count: number;
  speechSlot: number | null;
}
export interface SourceAudioAllocation {
  after: SourceAudioAllocatorState;
  slot: number | null;
  replaced: SourceAudioDescriptor | null;
}
/**419E0's actual cue99 speech descriptor; its media is the bound SPE sample,
 * never numeric99 in SOUND.DAT. Unknown-profile requests cannot construct it. */
export function specialistVoiceDescriptor(
  request: SpecialistVoiceRequest,
): SourceAudioDescriptor | null {
  if (request.resource.status === "profile-unavailable") return null;
  return {
    entity: request.entity,
    cue: 99,
    comparisonByte: request.arguments[2],
    parameterByte: request.arguments[1],
    modeByte: request.arguments[0],
    ratePercent: request.arguments[3],
    flags: 64,
    mediaKey: request.resource.soundKey,
  };
}
/** Explicit presentation initialization; not an imported native audio image. */
export function createSourceAudioAllocator(): SourceAudioAllocatorState {
  return {
    schemaVersion: 1,
    count: 0,
    speechSlot: null,
    slots: Array.from({ length: 9 }, () => ({
      descriptor: null,
      deferredStop: { entity: null, cue: 0 },
    })),
  };
}
function validateDescriptor(d: SourceAudioDescriptor) {
  if (
    typeof d.entity !== "string" ||
    !d.entity ||
    typeof d.mediaKey !== "string"
  )
    throw Error("Logical source audio entity/media binding required");
  integer(d.cue, 0, 99, "descriptor cue");
  for (const v of [d.comparisonByte, d.parameterByte, d.modeByte, d.flags])
    integer(v, 0, 255, "descriptor byte");
  integer(d.ratePercent, -2147483648, 2147483647, "descriptor rate dword");
}
function cloneAllocator(state: SourceAudioAllocatorState) {
  if (
    state.schemaVersion !== 1 ||
    state.slots.length !== 9 ||
    state.count !== state.slots.filter((s) => s.descriptor !== null).length
  )
    throw Error("Actual source415C0 nine-slot occupancy required");
  integer(state.count, 0, 9, "allocator count");
  for (const s of state.slots) {
    if (s.descriptor) validateDescriptor(s.descriptor);
    integer(s.deferredStop.cue, 0, 100, "deferred cue");
    if (
      s.deferredStop.entity !== null &&
      typeof s.deferredStop.entity !== "string"
    )
      throw Error("Logical deferred audio entity required");
  }
  if (state.speechSlot !== null) {
    integer(state.speechSlot, 0, 8, "speech slot");
    if (state.slots[state.speechSlot].descriptor?.cue !== 99)
      throw Error("Actual source speech descriptor binding required");
  }
  return {
    ...state,
    slots: state.slots.map((s) => ({
      descriptor: s.descriptor ? { ...s.descriptor } : null,
      deferredStop: { ...s.deferredStop },
    })),
  };
}
/**415C0, including both distinct full-pool replacement branches. No device
 * state, RNG, wall clock, duplicate test or41780 per-cue cap is inferred. */
export function allocateSourceAudioDescriptor(
  state: SourceAudioAllocatorState,
  descriptor: SourceAudioDescriptor,
  classes: readonly number[] | undefined,
): SourceAudioAllocation {
  const after = cloneAllocator(state);
  validateDescriptor(descriptor);
  if (
    !classes ||
    classes.length !== 100 ||
    classes.some((v) => !Number.isInteger(v) || v < 0 || v > 255)
  )
    throw Error("Admitted105F60 audio descriptor classes required");
  let slot = -1;
  const incomingClass = classes[descriptor.cue];
  if (after.count < 9) {
    slot = after.slots.findIndex((s) => s.descriptor === null);
    after.slots[slot].deferredStop.cue = 100;
    after.count++;
  } else if (incomingClass === 0) {
    let bestByte = 127,
      bestClass = 0;
    for (let i = 0; i < 9; i++) {
      const d = after.slots[i].descriptor!,
        cls = classes[d.cue];
      if (
        cls !== 0 &&
        (bestByte > d.comparisonByte ||
          (bestByte === d.comparisonByte && cls > bestClass))
      ) {
        slot = i;
        bestByte = d.comparisonByte;
        bestClass = cls;
      }
    }
    if (slot >= 0) {
      const old = after.slots[slot].descriptor!;
      after.slots[slot].deferredStop = { entity: old.entity, cue: old.cue };
    }
  } else {
    slot = after.slots.findIndex((s) => {
      const d = s.descriptor!,
        cls = classes[d.cue];
      return (
        cls !== 0 &&
        (d.comparisonByte < descriptor.comparisonByte ||
          (d.comparisonByte === descriptor.comparisonByte &&
            cls > incomingClass))
      );
    });
    if (slot >= 0 && after.slots[slot].deferredStop.cue === 0) {
      const old = after.slots[slot].descriptor!;
      after.slots[slot].deferredStop = { entity: old.entity, cue: old.cue };
    }
  }
  if (slot < 0) return { after, slot: null, replaced: null };
  const replaced = after.slots[slot].descriptor;
  after.slots[slot].descriptor = { ...descriptor };
  if (descriptor.cue === 99) after.speechSlot = slot;
  return { after, slot, replaced };
}
/** Presentation lifecycle removal. Call only when the corresponding source
 * stop/completion has been accepted; this does not infer device completion. */
export function releaseSourceAudioDescriptor(
  state: SourceAudioAllocatorState,
  slot: number,
): SourceAudioAllocatorState {
  const after = cloneAllocator(state);
  integer(slot, 0, 8, "released slot");
  if (after.slots[slot].descriptor) {
    after.slots[slot].descriptor = null;
    after.count--;
    if (after.speechSlot === slot) after.speechSlot = null;
  }
  return after;
}

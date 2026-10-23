import type { Pack } from "../content/types";
import type { AudioEventRequest } from "../sim/mechanics/audio";
import {
  allocateSourceAudioDescriptor,
  createSourceAudioAllocator,
  planSpecialistVoicePolicy0,
  releaseSourceAudioDescriptor,
  specialistVoiceDescriptor,
  type SourceAudioDescriptor,
  type SpecialistVoiceRequest,
} from "../sim/mechanics/specialist-voice";

export interface CampaignVoiceEntry {
  sequence: number;
  request: SpecialistVoiceRequest;
}
export interface CampaignVoiceReceipt {
  sequence: number;
  status:
    | "submitted"
    | "paused"
    | "muted"
    | "other-owner"
    | "disabled"
    | "lower-comparison-byte"
    | "same-filename"
    | "profile-unavailable"
    | "descriptor-classes-unavailable"
    | "sample-unavailable"
    | "capacity"
    | "device-error";
}
interface Playback {
  key: string;
  audio: HTMLAudioElement;
  slot: number | null;
}
/** Read-only browser consumer. Both journals, campaign state and RNG are never
 * mutated. Device end/rejection only changes this presentation instance.
 *
 *415C0 selection/sidecars are exact. A replaced physical device is stopped
 * immediately; source deferred-stop polling latency and41780 per-cue caps are
 * not emulated. Audio/voice batches retain their caller-supplied device order.
 */
export class CampaignAudio {
  enabled = true;
  effectsVolume = 0.7;
  voiceVolume = 0.8;
  musicVolume = 0.6;
  private last = -1;
  private lastVoice = -1;
  private suspended = false;
  private active = new Map<string, Playback>();
  private devicesBySlot = new Map<number, Playback>();
  private allocator = createSourceAudioAllocator();
  private filenameBuffer = "";
  constructor(private pack: Pack) {}
  private get classes() {
    return this.pack.specialistVoiceProfile?.descriptorClasses;
  }
  consume(requests: readonly AudioEventRequest[]): void {
    for (const r of requests) {
      if (r.sequence <= this.last) continue;
      this.last = r.sequence;
      const key = r.entity + ":" + r.cue,
        old = this.active.get(key);
      if (r.type === "playback-rate") {
        //98210 adjusts an existing sample; it never allocates or restarts.
        if (
          this.enabled &&
          old &&
          !old.audio.ended &&
          !old.audio.paused &&
          r.ratePercent > 0
        )
          this.applyRate(old.audio, r.ratePercent);
        continue;
      }
      if (r.mode === 4) {
        if (old) this.remove(old, true);
        continue;
      }
      if (!this.enabled || r.mode !== 2 || r.cue === 99) continue;
      const sample = this.pack.audioProfile?.records.find(
          (s) =>
            s.cue === r.cue &&
            s.formatIndex === this.pack.audioProfile!.preferredFormatIndex,
        ),
        src = sample ? this.pack.sounds[sample.key] : undefined;
      if (!src || !sample) continue;
      if (old && !old.audio.ended && (!old.audio.paused || this.suspended))
        continue;
      if (old) this.remove(old, true);
      let slot: number | null = null;
      if (this.classes) {
        const descriptor: SourceAudioDescriptor = {
          entity: r.entity,
          cue: r.cue,
          comparisonByte: Math.max(0, Math.min(127, Math.round(r.gain * 127))),
          parameterByte: r.parameter & 255,
          modeByte: r.mode & 255,
          ratePercent: r.initialRatePercent ?? 100,
          flags: 64,
          mediaKey: sample.key,
        };
        slot = this.allocate(descriptor);
        if (slot === null) continue;
      }
      this.start(
        key,
        src,
        slot,
        this.effectsVolume * r.gain,
        r.initialRatePercent,
      );
    }
  }
  consumeVoices(
    entries: readonly CampaignVoiceEntry[],
    context: { selectedPlayer: number; runtimeFlags: number },
  ): CampaignVoiceReceipt[] {
    const receipts: CampaignVoiceReceipt[] = [];
    for (const entry of entries) {
      if (entry.sequence <= this.lastVoice) continue;
      this.lastVoice = entry.sequence;
      const result = (status: CampaignVoiceReceipt["status"]) =>
        receipts.push({ sequence: entry.sequence, status });
      if (!this.enabled) {
        result("muted");
        continue;
      }
      const currentSlot = this.allocator.speechSlot,
        current =
          currentSlot === null
            ? null
            : this.allocator.slots[currentSlot].descriptor,
        decision = planSpecialistVoicePolicy0(entry.request, {
          ...context,
          filenameBuffer: this.filenameBuffer,
          currentSpeech: current
            ? { entity: current.entity, comparisonByte: current.comparisonByte }
            : null,
        });
      if (decision.type === "ignored") {
        result(decision.reason);
        continue;
      }
      if (decision.type === "unresolved") {
        result(decision.reason);
        continue;
      }
      if (!this.classes) {
        result("descriptor-classes-unavailable");
        continue;
      }
      //419E0 interrupts/removes old speech and copies the filename BEFORE
      //415C0 capacity or40360 sample loading can fail.
      if (currentSlot !== null) {
        const old = this.devicesBySlot.get(currentSlot);
        if (old) this.remove(old, true);
        else
          this.allocator = releaseSourceAudioDescriptor(
            this.allocator,
            currentSlot,
          );
      }
      this.filenameBuffer = decision.filenameBufferAfter;
      const descriptor = specialistVoiceDescriptor(entry.request)!;
      const slot = this.allocate(descriptor);
      if (slot === null) {
        result("capacity");
        continue;
      }
      const src = this.pack.sounds[descriptor.mediaKey];
      if (!src) {
        this.allocator = releaseSourceAudioDescriptor(this.allocator, slot);
        result("sample-unavailable");
        continue;
      }
      const started = this.start(
        descriptor.entity + ":99",
        src,
        slot,
        (this.voiceVolume * descriptor.comparisonByte) / 127,
        descriptor.ratePercent,
      );
      result(
        started ? (this.suspended ? "paused" : "submitted") : "device-error",
      );
    }
    return receipts;
  }
  private allocate(descriptor: SourceAudioDescriptor): number | null {
    const result = allocateSourceAudioDescriptor(
      this.allocator,
      descriptor,
      this.classes,
    );
    this.allocator = result.after;
    if (result.slot !== null) {
      const old = this.devicesBySlot.get(result.slot);
      //The allocator already published the replacement: releasing this old
      //device must not clear the newly allocated descriptor at the same slot.
      if (old) this.remove(old, true, false);
    }
    return result.slot;
  }
  private start(
    key: string,
    src: string,
    slot: number | null,
    gain: number,
    rate?: number,
  ): boolean {
    let audio: HTMLAudioElement;
    try {
      audio = new Audio(src);
    } catch {
      if (slot !== null)
        this.allocator = releaseSourceAudioDescriptor(this.allocator, slot);
      return false;
    }
    const playback = { key, audio, slot };
    audio.preservesPitch = false;
    if (rate !== undefined && rate > 0) this.applyRate(audio, rate);
    audio.volume = Math.max(0, Math.min(1, gain));
    audio.addEventListener("ended", () => this.remove(playback, false), {
      once: true,
    });
    audio.addEventListener("error", () => this.remove(playback, true), {
      once: true,
    });
    this.active.set(key, playback);
    if (slot !== null) this.devicesBySlot.set(slot, playback);
    return this.suspended ? true : this.play(playback);
  }
  private play(playback: Playback): boolean {
    try {
      void playback.audio.play().catch(() => this.remove(playback, true));
      return true;
    } catch {
      this.remove(playback, true);
      return false;
    }
  }
  private remove(playback: Playback, pause: boolean, release = true): void {
    if (this.active.get(playback.key) !== playback) return;
    if (pause) playback.audio.pause();
    this.active.delete(playback.key);
    if (
      playback.slot !== null &&
      this.devicesBySlot.get(playback.slot) === playback
    ) {
      this.devicesBySlot.delete(playback.slot);
      if (release)
        this.allocator = releaseSourceAudioDescriptor(
          this.allocator,
          playback.slot,
        );
    }
  }
  private applyRate(audio: HTMLAudioElement, percent: number): void {
    const rate = percent / 100;
    if (audio.playbackRate === rate) return;
    //Device limits cannot clamp or rewrite the source request journal.
    try {
      audio.playbackRate = rate;
    } catch {}
  }
  pause(): void {
    for (const p of this.active.values()) p.audio.pause();
    this.suspended = true;
  }
  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    for (const p of this.active.values()) if (!p.audio.ended) this.play(p);
  }
  reset(nextAudioSequence: number, nextVoiceSequence = 0): void {
    this.dispose();
    this.suspended = false;
    this.last = nextAudioSequence - 1;
    this.lastVoice = nextVoiceSequence - 1;
  }
  dispose(): void {
    this.pause();
    this.active.clear();
    this.devicesBySlot.clear();
    this.allocator = createSourceAudioAllocator();
    this.filenameBuffer = "";
  }
}

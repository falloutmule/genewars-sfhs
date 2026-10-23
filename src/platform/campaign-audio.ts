import type { Pack } from "../content/types";
import type { AudioEventRequest } from "../sim/mechanics/audio";
/** Browser playback is a read-only consumer. Muting, device rejection and
 * render pace cannot alter source audio-request state or gameplay. */
export class CampaignAudio {
  enabled = true;
  effectsVolume = 0.7;
  voiceVolume = 0.8;
  musicVolume = 0.6;
  private last = -1;
  private suspended = false;
  private active = new Map<string, HTMLAudioElement>();
  constructor(private pack: Pack) {}
  consume(requests: readonly AudioEventRequest[]): void {
    for (const r of requests) {
      if (r.sequence <= this.last) continue;
      this.last = r.sequence;
      const key = r.entity + ":" + r.cue,
        old = this.active.get(key);
      if (r.type === "playback-rate") {
        //98210 never allocates or restarts a sample. Its signed positive
        //percentage replaces the prior rate; it is not a relative multiplier.
        if (
          this.enabled &&
          old &&
          !old.ended &&
          !old.paused &&
          r.ratePercent > 0
        )
          this.applyRate(old, r.ratePercent);
        continue;
      }
      if (r.mode === 4) {
        old?.pause();
        this.active.delete(key);
        continue;
      }
      if (!this.enabled || r.mode !== 2 || r.cue === 99) continue;
      const sample = this.pack.audioProfile?.records.find(
          (s) =>
            s.cue === r.cue &&
            s.formatIndex === this.pack.audioProfile!.preferredFormatIndex,
        ),
        src = sample ? this.pack.sounds[sample.key] : undefined;
      if (!src) continue;
      if (old && !old.ended && !old.paused) continue;
      const audio = new Audio(src);
      // The source changes sample frequency, which changes pitch as well as
      // duration; browser speech/music time-stretching must not cancel that.
      audio.preservesPitch = false;
      if (r.initialRatePercent !== undefined)
        this.applyRate(audio, r.initialRatePercent);
      audio.volume = Math.max(0, Math.min(1, this.effectsVolume * r.gain));
      audio.addEventListener(
        "ended",
        () => {
          if (this.active.get(key) === audio) this.active.delete(key);
        },
        { once: true },
      );
      this.active.set(key, audio);
      void audio.play().catch(() => {
        if (this.active.get(key) === audio) this.active.delete(key);
      });
    }
  }
  private applyRate(audio: HTMLAudioElement, percent: number): void {
    const rate = percent / 100;
    if (audio.playbackRate === rate) return;
    // A browser can reject a source-supported rate. Do not clamp or feed that
    // device limitation into the simulation, request journal or sample state.
    try {
      audio.playbackRate = rate;
    } catch {}
  }
  pause(): void {
    for (const a of this.active.values()) a.pause();
    this.suspended = true;
  }
  resume(): void {
    if (!this.suspended) return;
    this.suspended = false;
    for (const a of this.active.values())
      if (!a.ended) void a.play().catch(() => {});
  }
  reset(nextSequence: number): void {
    this.dispose();
    this.suspended = false;
    this.last = nextSequence - 1;
  }
  dispose(): void {
    this.pause();
    this.active.clear();
  }
}

export interface AudioRequest {
  type?: "play";
  sequence: number;
  frame: number;
  entity: string;
  cue: number;
  mode: number;
  parameter: number;
  range: number | null;
  gain: number;
  /** Explicit source initial sample-rate percentage. Omission preserves the
   * legacy100% device default; range is never interpreted as a rate. */
  initialRatePercent?: number;
}
/** Source98210 adjusts an existing entity/channel sample; it has no play mode. */
export interface AudioPlaybackRateRequest {
  type: "playback-rate";
  sequence: number;
  frame: number;
  entity: string;
  cue: number;
  /** Source reads signed SI. Nonpositive requests have no device effect. */
  ratePercent: number;
}
export type AudioEventRequest = AudioRequest | AudioPlaybackRateRequest;
export interface AudioState {
  nextSequence: number;
  requests: AudioEventRequest[];
}
export function requestAudio(
  state: AudioState,
  request: Omit<AudioRequest, "sequence">,
): void {
  if (
    (request.type !== undefined && request.type !== "play") ||
    !Number.isInteger(request.cue) ||
    request.cue < 0 ||
    request.cue > 255 ||
    !Number.isInteger(request.mode) ||
    !Number.isFinite(request.gain) ||
    (request.initialRatePercent !== undefined &&
      (!Number.isInteger(request.initialRatePercent) ||
        request.initialRatePercent <= 0 ||
        request.initialRatePercent > 32767))
  )
    throw new Error("Invalid source audio request");
  state.requests.push({ ...request, sequence: state.nextSequence++ });
  if (state.requests.length > 256)
    state.requests.splice(0, state.requests.length - 256);
}
export function requestAudioPlaybackRate(
  state: AudioState,
  request: Omit<AudioPlaybackRateRequest, "sequence" | "type">,
): void {
  if (
    !Number.isInteger(request.cue) ||
    request.cue < 0 ||
    request.cue > 255 ||
    !Number.isInteger(request.frame) ||
    request.frame < 0 ||
    request.frame > 0xffffffff ||
    typeof request.entity !== "string" ||
    !request.entity ||
    !Number.isInteger(request.ratePercent) ||
    request.ratePercent < -32768 ||
    request.ratePercent > 32767
  )
    throw new Error("Invalid source audio playback-rate request");
  state.requests.push({
    ...request,
    type: "playback-rate",
    sequence: state.nextSequence++,
  });
  if (state.requests.length > 256)
    state.requests.splice(0, state.requests.length - 256);
}

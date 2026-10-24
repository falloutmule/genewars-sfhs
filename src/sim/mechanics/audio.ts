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
/** Source97830 condition followed by one ordered stop/play pair. The device
 * consumer evaluates the condition; no playback result enters saved state. */
export interface AudioIfPlayingStopPlayRequest {
  type: "if-playing-stop-play";
  sequence: number;
  frame: number;
  entity: string;
  /** Exact entity/cue to query and, only when playing, stop. */
  cue: number;
  nextCue: number;
  nextParameter: number;
  nextRange: number | null;
  nextGain: number;
  nextInitialRatePercent?: number;
}
export type AudioEventRequest =
  | AudioRequest
  | AudioPlaybackRateRequest
  | AudioIfPlayingStopPlayRequest;
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
export function requestAudioIfPlayingStopPlay(
  state: AudioState,
  request: Omit<AudioIfPlayingStopPlayRequest, "sequence" | "type">,
): void {
  if (
    !Number.isInteger(request.frame) ||
    request.frame < 0 ||
    request.frame > 0xffffffff ||
    typeof request.entity !== "string" ||
    !request.entity ||
    !Number.isInteger(request.cue) ||
    request.cue < 0 ||
    request.cue > 255 ||
    !Number.isInteger(request.nextCue) ||
    request.nextCue < 0 ||
    request.nextCue > 255 ||
    !Number.isInteger(request.nextParameter) ||
    request.nextParameter < 0 ||
    request.nextParameter > 255 ||
    (request.nextRange !== null && !Number.isFinite(request.nextRange)) ||
    !Number.isFinite(request.nextGain) ||
    (request.nextInitialRatePercent !== undefined &&
      (!Number.isInteger(request.nextInitialRatePercent) ||
        request.nextInitialRatePercent <= 0 ||
        request.nextInitialRatePercent > 32767))
  )
    throw new Error("Invalid source conditional audio request");
  state.requests.push({
    type: "if-playing-stop-play",
    sequence: state.nextSequence++,
    frame: request.frame,
    entity: request.entity,
    cue: request.cue,
    nextCue: request.nextCue,
    nextParameter: request.nextParameter,
    nextRange: request.nextRange,
    nextGain: request.nextGain,
    ...(request.nextInitialRatePercent === undefined
      ? {}
      : { nextInitialRatePercent: request.nextInitialRatePercent }),
  });
  if (state.requests.length > 256)
    state.requests.splice(0, state.requests.length - 256);
}

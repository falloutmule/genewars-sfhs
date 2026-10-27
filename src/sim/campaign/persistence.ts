import { checksum } from "../checksum";
import {
  validateCampaignWorld,
  queueCampaign,
  stepCampaign,
  actOnCampaignResult,
  continueCampaign,
  enterCampaign,
  upgradeEmptyCollapsePool,
  upgradeEmptyProcessorCollectors,
  type CampaignWorld,
  type CampaignCommand,
} from "./world";
import type { ResultAction } from "../mechanics/outcome";
import type { Pack } from "../../content/types";
import type { RuleExtensionIdentity } from "../../content/rule-extension";
export interface CampaignSession {
  paused: boolean;
  speed: 0.5 | 1 | 2 | 4;
  accumulator: number;
}
export interface CampaignSave {
  kind: "genewars-campaign-save";
  schemaVersion: 2;
  engineVersion: string;
  world: CampaignWorld;
  session: CampaignSession;
  checksum: string;
}
function sessionValid(s: CampaignSession): boolean {
  return (
    typeof s.paused === "boolean" &&
    [0.5, 1, 2, 4].includes(s.speed) &&
    Number.isFinite(s.accumulator) &&
    s.accumulator >= 0 &&
    s.accumulator < 60000
  );
}
export function saveCampaign(
  world: CampaignWorld,
  session: CampaignSession,
): string {
  validateCampaignWorld(world, world.contentHash);
  if (!sessionValid(session)) throw new Error("Invalid campaign session");
  return JSON.stringify({
    kind: "genewars-campaign-save",
    schemaVersion: 2,
    engineVersion: world.engineVersion,
    world,
    session,
    checksum: checksum({ world, session }),
  } satisfies CampaignSave);
}
export function loadCampaign(text: string, hash: string, extension?: RuleExtensionIdentity): CampaignSave {
  if (text.length > 16000000) throw new Error("Campaign save exceeds16MB");
  const s = JSON.parse(text) as CampaignSave;
  if (
    s.kind !== "genewars-campaign-save" ||
    s.schemaVersion !== 2 ||
    s.engineVersion !== "0.2.0-campaign-development" ||
    !sessionValid(s.session)
  )
    throw new Error(
      "Unsupported campaign save. Workbench saves cannot become campaign starts.",
    );
  if (checksum({ world: s.world, session: s.session }) !== s.checksum)
    throw new Error("Campaign save checksum mismatch");
  if (extension && extension.contentHash !== hash)
    throw new Error("Campaign rule-extension identity mismatch");
  const collapseUpgrade = upgradeEmptyCollapsePool(s.world);
  const collectorUpgrade = upgradeEmptyProcessorCollectors(s.world);
  if (collapseUpgrade || collectorUpgrade)
    s.checksum = checksum({ world: s.world, session: s.session });
  if (extension && s.world.contentHash === extension.basePackSha256) {
    // Verify the unchanged genuine base save BEFORE migrating its identity.
    // Rule admission is additive and hash-checked by the content loader.
    validateCampaignWorld(s.world, extension.basePackSha256);
    s.world.contentHash = hash;
    s.checksum = checksum({ world: s.world, session: s.session });
  }
  validateCampaignWorld(s.world, hash);
  return s;
}
export type CampaignReplayEvent =
  | { tick: number; type: "command"; command: CampaignCommand }
  | { tick: number; type: "result"; action: ResultAction }
  | { tick: number; type: "enter" }
  | { tick: number; type: "continue" };
export interface CampaignReplay {
  kind: "genewars-campaign-replay";
  schemaVersion: 2;
  sourceCommit: string | null;
  sourceDirty: boolean | null;
  contentHash: string;
  initial: CampaignWorld;
  initialRng: CampaignWorld["rng"];
  commands: CampaignReplayEvent[];
  hashes: [number, string][];
  final: null | {
    tick: number;
    checksum: string;
    result: string;
    carryHash: string;
  };
}
/** A failed replay retains its isolated result for local drift diagnostics.
 * It is never installed as a successful campaign or written to normal slots. */
export class CampaignReplayMismatch extends Error {
  constructor(
    message: string,
    readonly actualWorld: CampaignWorld,
  ) {
    super(message);
    this.name = "CampaignReplayMismatch";
  }
}
export function recordCampaign(
  world: CampaignWorld,
  sourceCommit: string | null,
  sourceDirty: boolean | null = null,
): CampaignReplay {
  return {
    kind: "genewars-campaign-replay",
    schemaVersion: 2,
    sourceCommit,
    sourceDirty,
    contentHash: world.contentHash,
    initial: structuredClone(world),
    initialRng: { ...world.rng },
    commands: [],
    hashes: [],
    final: null,
  };
}
export function replayCampaign(
  r: CampaignReplay,
  pack: Pack,
  hash: string,
): CampaignWorld {
  if (
    r.kind !== "genewars-campaign-replay" ||
    r.schemaVersion !== 2 ||
    r.contentHash !== hash ||
    !r.final ||
    r.final.tick > 10000000
  )
    throw new Error("Invalid campaign replay");
  validateCampaignWorld(r.initial, hash);
  if (
    checksum(r.initialRng) !== checksum(r.initial.rng) ||
    !Number.isInteger(r.final.tick) ||
    r.final.tick < r.initial.tick ||
    r.commands.some(
      (e, i) =>
        !Number.isInteger(e.tick) ||
        e.tick < r.initial.tick ||
        e.tick > r.final!.tick ||
        (i > 0 && e.tick < r.commands[i - 1].tick),
    )
  )
    throw new Error("Invalid campaign replay timeline");
  let w = structuredClone(r.initial),
    next = 0;
  const checks = new Map(r.hashes);
  while (w.tick <= r.final.tick) {
    const before = w.tick;
    while (next < r.commands.length && r.commands[next].tick === before) {
      const event = r.commands[next++];
      if (event.type === "command") {
        const c = queueCampaign(w, event.command);
        if (!c.ok) throw new Error(c.reason ?? "Replay command rejected");
      } else if (event.type === "result") actOnCampaignResult(w, event.action);
      else if (event.type === "enter") enterCampaign(w, pack);
      else {
        w = continueCampaign(w, pack);
      }
    }
    if (w.tick === r.final.tick) break;
    if (w.tick === before) stepCampaign(w, pack);
    if (w.tick === before)
      throw new Error(`Replay stopped at ${w.tick}: ${w.phase}`);
    if (checks.has(w.tick) && checks.get(w.tick) !== checksum(w))
      throw new Error(`Replay checksum mismatch at ${w.tick}`);
  }
  if (
    next !== r.commands.length ||
    checksum(w) !== r.final.checksum ||
    w.result.phase !== r.final.result ||
    checksum({
      players: w.players,
      world: w.retainedWorld,
      auxiliary: w.auxiliary,
    }) !== r.final.carryHash
  )
    throw new CampaignReplayMismatch(
      `Campaign replay final mismatch (events ${next}/${r.commands.length}; tick ${w.tick}/${r.final.tick}; checksum ${checksum(w)}/${r.final.checksum}; result ${w.result.phase}/${r.final.result}; carry ${checksum({ players: w.players, world: w.retainedWorld, auxiliary: w.auxiliary })}/${r.final.carryHash})`,
      w,
    );
  return w;
}
export function sealCampaignReplay(
  r: CampaignReplay,
  w: CampaignWorld,
): CampaignReplay {
  return {
    ...r,
    final: {
      tick: w.tick,
      checksum: checksum(w),
      result: w.result.phase,
      carryHash: checksum({
        players: w.players,
        world: w.retainedWorld,
        auxiliary: w.auxiliary,
      }),
    },
  };
}
const recoveryKey = "gw:campaign:recovery:";
export function storeCampaignRecovery(storage: Storage, text: string): void {
  for (let i = 3; i > 0; i--) {
    const old = storage.getItem(recoveryKey + (i - 1));
    if (old) storage.setItem(recoveryKey + i, old);
  }
  storage.setItem(recoveryKey + "0", text);
}
export function recoverCampaign(
  storage: Storage,
  hash: string,
  extension?: RuleExtensionIdentity,
): CampaignSave | null {
  for (let i = 0; i < 4; i++) {
    const s = storage.getItem(recoveryKey + i);
    if (s)
      try {
        return loadCampaign(s, hash, extension);
      } catch {}
  }
  return null;
}

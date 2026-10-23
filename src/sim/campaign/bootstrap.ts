import type { Pack } from "../../content/types";
import {
  generateBlueprints,
  selectMissionBlueprints,
  type Blueprint,
} from "../mechanics/blueprints";
import type { GeneRng } from "../mechanics/random";
import { createMotion, type MotionState } from "../mechanics/motion";
import {
  terrainFromBytes,
  groundHeight,
  type TerrainState,
} from "../mechanics/terrain";
import { animationState, type AnimationState } from "../mechanics/animation";
import {
  createSourcePoolRegistry,
  type SourcePoolRegistry,
} from "./source-pools";
import { decodeBytes, i16, u32, put16, put32 } from "./bytes";

export interface CampaignPlayer {
  id: number;
  raw: number[];
  blueprints: Blueprint[];
  funds: number;
  goop: number;
  progress: number;
  activationCount: number;
  completed: number[];
  owned: number;
}
export interface CampaignActor {
  id: number;
  sourceId: string;
  owner: number;
  blueprintIndex: number;
  art: string;
  motion: MotionState;
  ready: boolean;
  goal: [number, number] | null;
  route: [number, number][];
  animation: AnimationState;
  idleTimer: number;
  idleFacing: boolean;
  egressBuildingId: number | null;
  reason: string;
  orders: {
    type: "move" | "construct";
    point: [number, number];
    selector?: number;
  }[];
}
export interface CampaignBootstrap {
  version: 2;
  engineVersion: string;
  contentHash: string;
  missionId: number;
  selectedPlayer: number;
  frame: number;
  frameBackup: number;
  flags: number;
  runtimeMode: number;
  countdown: number;
  rng: GeneRng;
  players: CampaignPlayer[];
  actors: CampaignActor[];
  terrain: TerrainState;
  source: SourcePoolRegistry;
  missionPrefix: number[];
  retainedWorld: number[];
  limitations: string[];
}
export const CAMPAIGN_ENGINE = "0.2.0-campaign-development";
/** Explicit normalized replacement for native pointers and uninitialized scratch.
 * Scratch18/1B stay null: callback consumers must establish their own admission.
 */
export function freshCampaignPlayer(
  id: number,
  target: [number, number],
  label: string,
): number[] {
  if (
    id < 0 ||
    id > 3 ||
    !Number.isInteger(id) ||
    !label ||
    label.length > 13 ||
    /[^\x20-\x7e]/.test(label)
  )
    throw new Error("Invalid campaign player");
  const b = new Array<number>(1805).fill(0);
  b[0] = 2;
  b[1] = b[0x4a1] = b[0x6e2] = id;
  put16(b, 9, target[0]);
  put16(b, 11, target[1]);
  put32(b, 0x67e, 1);
  b[0x6ae] = 4;
  b[0x6e0] = 1;
  put32(b, 0x705, 1);
  put32(b, 0x62a, 0x11800);
  for (let i = 0; i < label.length; i++) b[0x6e9 + i] = label.charCodeAt(i);
  return b;
}
export function synchronizePlayer(p: CampaignPlayer): void {
  put32(p.raw, 0x4a3, p.funds);
  put32(p.raw, 0x4a7, p.goop);
  put32(p.raw, 0x49d, p.activationCount);
  p.raw[0x6e7] = p.progress & 255;
  p.completed.forEach((v, s) => (p.raw[0x600 + s] = v & 255));
  put16(p.raw, 0x60e, p.owned);
  for (const b of p.blueprints) {
    const at = 0x16 + b.index * 36;
    p.raw.fill(0, at, at + 20);
    for (let i = 0; i < b.name.length; i++)
      p.raw[at + i] = b.name.charCodeAt(i);
    p.raw[at + 0x15] = b.style;
    p.raw[at + 0x16] = b.category;
    p.raw[at + 0x17] = b.skill;
    p.raw[at + 0x19] = b.maxHealth;
    p.raw[at + 0x1a] = b.health;
    p.raw[at + 0x20] = b.runtimeFlags;
    // Unknown scratch bytes remain represented by Blueprint.unresolved. They
    // cannot be recovered by serializing this known-byte projection alone.
    if (b.unresolved.byte18 !== null) p.raw[at + 0x18] = b.unresolved.byte18;
    if (b.unresolved.byte1b !== null) p.raw[at + 0x1b] = b.unresolved.byte1b;
  }
}
export function bootstrapCampaign(
  pack: Pack,
  contentHash: string,
  missionId = 1,
  retained?: {
    players: CampaignPlayer[];
    selectedPlayer: number;
    world: number[];
    rngRing: number | null;
  },
): CampaignBootstrap {
  const m = pack.missions.find((v) => v.id === missionId),
    s = m?.startup,
    r = pack.rules;
  if (!m || !s || !r || !pack.economyRules || !pack.ecologyRules)
    throw new Error("Original campaign requires a version2 source import");
  if (!retained && missionId !== 1)
    throw new Error("Campaign carry is required for this mission");
  if (s.context.specialActivation !== 0)
    throw new Error("Immediate mission activation is not implemented");
  if (!s.terrain.atlasResource)
    throw new Error("Unsupported mission terrain atlas");
  const selected = retained?.selectedPlayer ?? 0,
    terrain = terrainFromBytes(decodeBytes(s.terrain.mapCells14)),
    source = createSourcePoolRegistry(s);
  const rng: GeneRng = {
    seed: s.context.rngSeed,
    draws: s.context.rngDrawCount,
    ring: retained?.rngRing ?? null,
  };
  const players: CampaignPlayer[] = [],
    actors: CampaignActor[] = [];
  for (let id = 0; id < 4; id++) {
    const raw = decodeBytes(s.players[id].recordBase64),
      target = s.targets[id] as [number, number];
    const prior = retained?.players[id];
    if (id === selected) {
      const keep = prior?.raw ?? freshCampaignPlayer(id, target, "Player 1");
      for (const [a, b] of [
        [0, 0x4a1],
        [0x61a, 0x6f7],
      ])
        raw.splice(a, b - a, ...keep.slice(a, b));
    }
    const progress = (raw[0x6e7] << 24) >> 24;
    let blueprints: Blueprint[] =
      prior && id === selected ? structuredClone(prior.blueprints) : [];
    if (
      id < s.context.activePlayerCount &&
      raw[2] === 0 &&
      (progress === 0 || raw[0x15] === 0)
    ) {
      const generated = generateBlueprints(
        pack.texts.slice(0, 128),
        s.blueprintRules,
        rng,
        true,
      );
      blueprints = generated.blueprints;
      Object.assign(rng, generated.rng);
      raw[0x15] = 20;
    }
    const p: CampaignPlayer = {
      id,
      raw,
      blueprints,
      funds:
        id < s.context.activePlayerCount
          ? raw[2] === 0
            ? s.context.campaignFundsBeforeEngineerCosts
            : 2000
          : u32(raw, 0x4a3),
      goop: u32(raw, 0x4a7),
      progress,
      activationCount: u32(raw, 0x49d),
      completed: raw.slice(0x600, 0x60e),
      owned: raw[0x60e] | (raw[0x60f] << 8),
    };
    if (id < s.context.activePlayerCount) {
      if (raw[2] !== 0)
        throw new Error(
          `Player ${id} opponent initialization is not implemented`,
        );
      const chosen = selectMissionBlueprints(
        blueprints,
        s.context.actorMask,
        progress,
      );
      raw[3] = chosen.length;
      for (const [slot, b] of chosen.entries()) {
        const aid = id * 5 + slot,
          art = r.tables.actorResourceNames[b.style * 4 + b.category]
            .split(/[\/]/)
            .at(-1)!
            .replace(/\.anb$/i, "")
            .toUpperCase();
        if (!pack.assets[art])
          throw new Error(`Missing original specialist resource ${art}`);
        const blueprint = blueprints.find((v) => v.index === b.index)!;
        blueprint.runtimeFlags |= 1;
        raw[4 + slot] = aid;
        actors.push({
          id: aid,
          sourceId: `source:2:${aid}`,
          owner: id,
          blueprintIndex: b.index,
          art,
          motion: createMotion(
            ...target,
            groundHeight(terrain, ...target),
            r.tables.actorClassSpeeds[b.style],
          ),
          ready: false,
          goal: null,
          route: [],
          animation: animationState(8),
          idleTimer: 0,
          idleFacing: false,
          egressBuildingId: null,
          reason: "Awaiting landing",
          orders: [],
        });
      }
      put16(raw, 9, target[0]);
      put16(raw, 11, target[1]);
    }
    synchronizePlayer(p);
    players.push(p);
  }
  const prefix = decodeBytes(s.missionPrefixBase64);
  if (retained) {
    if (retained.world.length !== 150)
      throw new Error("Campaign world carry requires150 retained bytes");
    prefix.splice(0x34ba, 150, ...retained.world);
  }
  return {
    version: 2,
    engineVersion: CAMPAIGN_ENGINE,
    contentHash,
    missionId,
    selectedPlayer: selected,
    frame: 0,
    frameBackup: 0,
    flags: 0x3e,
    runtimeMode: 0,
    countdown: 1000,
    rng,
    players,
    actors,
    terrain,
    source,
    missionPrefix: prefix,
    retainedWorld: retained?.world.slice() ?? prefix.slice(0x34ba, 0x3550),
    limitations: [
      "Canonical mission acceptance remains0/24",
      "Original uninitialized blueprint18/1B and RNG journal ring remain explicit unknowns",
      "Full runtime pool callbacks require family admission; imported pools alone do not establish gameplay",
    ],
  };
}

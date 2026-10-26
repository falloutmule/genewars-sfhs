/** Real campaign bindings for81C60/5DF50,5CC60,5D870 and5B580.
 * Staged entries belong to the caller's whole-host transaction. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import {
  executeStagedCreatureMove,
  releaseStagedCreatureAction,
  targetStagedCreature,
  interactStagedCreature,
  restoreCreatureCommandAliases,
  type CreatureCommandContext,
  type CreatureCommandReference,
  type CreatureCommandWorld,
} from "../mechanics/creature-commands";
import { queryMuleAirborneBuilding } from "../mechanics/mule";
import { groundHeight, torusDelta, worldCell } from "../mechanics/terrain";
import { campaignBuildingAsset } from "./building-startup-adapter";
import { campaignQueryEntities, synchronizeCampaignLinks } from "./entity-view";
import { mirrorCampaignSpecialist } from "./specialist-adapter";
import {
  retireStagedSharedEffect,
  type EffectSchedulerOptions,
} from "./effect-scheduler";
import { requestAudio } from "../mechanics/audio";
import { muleRequestedSpeed } from "../mechanics/ecology";

type Native = (number | null)[];
type Point = [number, number];
export type CampaignCreatureCommandWorld = CampaignWorld &
  Pick<CreatureCommandWorld, "creatureCommandScratch">;
export interface CampaignCreatureCommandServices {
  /** Optional explicit virtual80 override. The ordinary host binds5A990. */
  requestedSpeed?(world: CampaignCreatureCommandWorld, index: number): number;
  /** Real49D30 cleanup options; required only for a dead carrier's effect36. */
  effectOptions?(
    world: CampaignCreatureCommandWorld,
  ): EffectSchedulerOptions<CampaignWorld>;
  /** Imported object3+457C pair; never substitute a construction footprint. */
  corpseDepositOffset?: {
    value: readonly [number, number];
    provenance: string;
  };
  /** Actual74160 indexed nine-point table; required lazily when flag11bit0. */
  footprintSearchOffsets?: {
    value: readonly (readonly [number, number])[];
    provenance: string;
  };
}
export type CampaignCreatureCommand =
  | { type: "release" }
  | {
      type: "move";
      point: Point;
      callerOwner: number;
      selectedPanelRefresh: boolean;
    }
  | { type: "target"; target: CreatureCommandReference }
  | {
      type: "interact";
      target: CreatureCommandReference | null;
      force: boolean;
    };

const byte = (n: readonly (number | null)[], at: number): number => {
  const value = n[at];
  if (!Number.isInteger(value) || value == null || value < 0 || value > 255)
    throw Error(`Actual campaign creature-command byte${at} required`);
  return value;
};
const word = (n: readonly (number | null)[], at: number) =>
  ((byte(n, at) | (byte(n, at + 1) << 8)) << 16) >> 16;
const dword = (n: readonly (number | null)[], at: number) =>
  byte(n, at) |
  (byte(n, at + 1) << 8) |
  (byte(n, at + 2) << 16) |
  (byte(n, at + 3) << 24);
const position = (n: Native): Point => [word(n, 7), word(n, 9)];
const signed = (value: number) => (value << 16) >> 16;

/**6D390 retained records: inactive afterimages remain addressable. */
export function campaignCreatureCommandReference(
  w: CampaignCreatureCommandWorld,
  ref: CreatureCommandReference,
): Native | null {
  if (
    !Number.isInteger(ref.index) ||
    ref.index < 0 ||
    ref.index >= ({ 1: 300, 2: 512, 3: 20, 4: 256, 5: 200 }[ref.kind] ?? 0)
  )
    throw Error("Invalid campaign retained creature-command reference");
  return ref.kind === 1
    ? (w.creatureNative[ref.index] ?? null)
    : ref.kind === 2
      ? (w.ecology.plants[ref.index]?.native ?? null)
      : ref.kind === 3
        ? (w.specialists.records[ref.index] ?? null)
        : ref.kind === 4
          ? (w.buildingNative[ref.index] ?? null)
          : (w.powerEffects.slots[ref.index]?.nativePrior ?? null);
}

/**5B100 with real8B780 (last living creature) and8B7D0(effect17).
 * The query is at the current cell, including the actor itself. */
export function campaignCreatureOccupied(
  w: CampaignCreatureCommandWorld,
  index: number,
): boolean {
  const n = w.creatureNative[index];
  if (!n || byte(n, 6) !== 1)
    throw Error("Actual occupied-query creature required");
  if (word(n, 73) & 1024) return false; //virtual10
  const at = position(n),
    cell = worldCell(...at),
    entries = campaignQueryEntities(w, [at]),
    living = entries.filter((e) => e.kind === 1 && byte(e.native, 94) < 24),
    last = living.at(-1)?.native ?? null;
  let occupied: boolean;
  if (byte(n, 94) === 10 && worldCell(word(n, 11), word(n, 13)) === cell)
    occupied = false;
  else if (byte(n, 94) === 1 && byte(n, 87) !== 0 && word(n, 85) >= 0) {
    const kind = byte(n, 87);
    if (kind < 1 || kind > 5)
      throw Error("Unadmitted5B100 retained target kind");
    const target = campaignCreatureCommandReference(w, {
      kind: kind as CreatureCommandReference["kind"],
      index: word(n, 85),
    });
    if (!target) throw Error("Actual5B100 retained target missing");
    if (last === n) occupied = false;
    else if (byte(target, 6) === 1)
      occupied =
        worldCell(...position(target)) !== cell ||
        byte(target, 94) >= 24 ||
        living.length > 2;
    else occupied = byte(target, 6) === 2;
  } else occupied = last !== n;
  return (
    occupied || entries.some((e) => e.kind === 5 && byte(e.native, 69) === 17)
  );
}

/**74160 search order, independently expressed from its nine source samples.
 * First candidate's failed mask terminates the query; it does not try another. */
export function campaignCreatureFootprintBuilding(
  w: CampaignCreatureCommandWorld,
  pack: Pack,
  at: Point,
  mask = 0,
  supplied?: CampaignCreatureCommandServices["footprintSearchOffsets"],
): number | null {
  if (!(w.terrain.bytes[worldCell(...at) * 14 + 11] & 1)) return null;
  const deltas = searchOffsets(pack, supplied);
  for (const [ordinal, delta] of deltas.entries()) {
    const point: Point = [signed(at[0] + delta[0]), signed(at[1] + delta[1])],
      first = campaignQueryEntities(w, [point]).find((e) => e.kind === 4);
    if (!first) continue;
    const shape = pack.rules?.tables.buildingFootprints[byte(first.native, 45)];
    if (
      !Number.isInteger(shape) ||
      shape === undefined ||
      shape < 0 ||
      shape > 3
    )
      throw Error("Admitted74160 building shape required");
    if (shape === 2 && ordinal >= 4) continue;
    return (word(first.native, 49) & mask) === mask ? first.index : null;
  }
  return null;
}
function searchOffsets(
  pack: Pack,
  supplied?: CampaignCreatureCommandServices["footprintSearchOffsets"],
) {
  const imported = pack.creatureCommandRules,
    input =
      supplied ??
      (imported
        ? {
            value: imported.footprintSearchOffsets,
            provenance: imported.provenance.footprintSearchOffsets.sha256,
          }
        : undefined);
  if (
    !input ||
    !input.provenance.trim() ||
    input.value.length !== 9 ||
    input.value.some(
      (p) =>
        p.length !== 2 ||
        p.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767),
    )
  )
    throw Error(
      "Imported74160 nine signed-word footprint offsets/provenance required",
    );
  return input.value;
}

/**43130. The compatibility defaults are5D870's selector mask4/flags18;
 * hauling supplies its actual10/30 masks, without a second query body. */
export function campaignCreatureServiceBuilding(
  w: CampaignCreatureCommandWorld,
  index: number,
  query: {
    selectorMask?: number;
    requiredFlags?: number;
    position?: Point;
  } = {},
): number | null {
  const mask = query.selectorMask ?? 4,
    flags = query.requiredFlags ?? 0x18;
  if (
    !Number.isInteger(mask) ||
    mask < 0 ||
    mask > 0xffffffff ||
    !Number.isInteger(flags) ||
    flags < 0 ||
    flags > 0xffff ||
    query.position?.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767)
  )
    throw Error("Actual43130 selector/flag/point query required");
  const n = w.creatureNative[index],
    owner = byte(n, 24),
    aggregateOwner = byte(w.players[owner]?.raw ?? [], 0x4a1),
    raw = w.players[aggregateOwner]?.raw;
  if (aggregateOwner >= 4 || !raw || raw.length !== 1805)
    throw Error("Actual43130 owner aggregate required");
  const from = query.position ?? position(n),
    fromHeight = groundHeight(w.terrain, ...from),
    all = !!(w.runtimeMode & 1),
    start = all ? 0 : aggregateOwner * 64,
    count = all ? 256 : 64;
  let selected: number | null = null,
    best = 0x7fffffff;
  for (let slot = start; slot < start + count; slot++) {
    const b = w.buildingNative[slot];
    if (!byte(b, 6)) continue;
    const buildingOwner = byte(b, 24);
    if (
      buildingOwner !== byte(raw, 1) &&
      !(byte(raw, 0x6e5) & (1 << (buildingOwner & 31)))
    )
      continue;
    if (!(mask & (1 << (byte(b, 45) & 31)))) continue;
    const nativeFlags = byte(b, 49) | (byte(b, 50) << 8);
    let actualFlags = 0;
    if (flags & 4 && nativeFlags & 4) actualFlags |= 4;
    if (flags & 8 && byte(b, 45) === 2 && dword(b, 54) !== 0) actualFlags |= 8;
    if (flags & 0x10 && nativeFlags & 1) actualFlags |= 0x10;
    if (flags & 0x20 && (nativeFlags & 0x141) === 1) actualFlags |= 0x20;
    if (actualFlags !== flags) continue;
    const to = position(b),
      dx = torusDelta(to[0], from[0]),
      dy = torusDelta(to[1], from[1]),
      dz = (groundHeight(w.terrain, ...to) - fromHeight) >> 3,
      score = (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) | 0;
    if (score < best) {
      best = score;
      selected = slot;
    }
  }
  return selected;
}

export function campaignCreatureCommandContext(
  w: CampaignCreatureCommandWorld,
  pack: Pack,
  services: CampaignCreatureCommandServices = {},
): CreatureCommandContext<CampaignCreatureCommandWorld> {
  if (!pack.rules || !pack.ecologyRules || !pack.zoneRules)
    throw Error("Admitted creature command rules/components required");
  const imported = pack.creatureCommandRules,
    offset =
      services.corpseDepositOffset ??
      (imported
        ? {
            value: imported.corpseDepositOffset,
            provenance: `${imported.provenance.executableSha256}:object3+457C:${imported.provenance.corpseDepositOffset.sha256}`,
          }
        : undefined);
  if (
    offset &&
    (!offset.provenance.trim() ||
      offset.value.length !== 2 ||
      offset.value.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767))
  )
    throw Error("Imported corpse-deposit offset/provenance required");
  return {
    rules: pack.ecologyRules,
    tables: pack.rules.tables,
    speciesComponents: pack.zoneRules.speciesComponents as [number, number][],
    resolve: campaignCreatureCommandReference,
    requestedSpeed: services.requestedSpeed ?? ((s, index) => {
      const n = s.creatureNative[index];
      if (!n || n[6] !== 1 || word(n, 15) !== index)
        throw Error("Actual creature speed native identity required");
      // The generic scalar reads these exact bytes; null is never a cold prior.
      byte(n, 118); byte(n, 123);
      return muleRequestedSpeed({id:`source:0:${index}`,index,native:n,pending:[]}, pack.ecologyRules!);
    }),
    occupied: campaignCreatureOccupied,
    footprintBuilding: (s, index) =>
      campaignCreatureFootprintBuilding(
        s,
        pack,
        position(s.creatureNative[index]),
        0,
        services.footprintSearchOffsets,
      ),
    ...(offset ? { corpseDepositOffset: [...offset.value] as Point } : {}),
    collisionBuilding: (s, index) => {
      const n = s.creatureNative[index],
        offsets =
          s.terrain.bytes[worldCell(...position(n)) * 14 + 11] & 1
            ? searchOffsets(pack, services.footprintSearchOffsets)
            : undefined,
        result = queryMuleAirborneBuilding(
          s.terrain,
          position(n),
          dword(n, 39),
          (cell) => {
            const p: Point = [(cell & 127) << 8, (cell >> 7) << 8];
            return (
              campaignQueryEntities(s, [p]).find((e) => e.kind === 4)?.native ??
              null
            );
          },
          (b) => {
            const resource =
                pack.assets[campaignBuildingAsset(pack, byte(b, 45))],
              animation = resource.animations?.[byte(b, 25)],
              raw = animation
                ? resource.frames?.[animation.first + byte(b, 27)]
                    ?.sourceSize?.[1]
                : undefined;
            if (raw === undefined)
              throw Error(
                "Original current building raw frame height required",
              );
            return raw;
          },
          1,
          offsets,
        );
      return result ? word(result.native, 15) : null;
    },
    buildingHalfWidth: (s, index) => {
      const shape =
          pack.rules!.tables.buildingFootprints[
            byte(s.buildingNative[index], 45)
          ],
        width = pack.rules!.tables.buildingCombatHalfWidths?.[shape];
      if (width === undefined)
        throw Error("Admitted104E12 building width required");
      return width;
    },
    buildingMaximumHealth: (s, index) => {
      const n = s.buildingNative[index],
        selector = byte(n, 45),
        grade = byte(n, 46),
        maximum =
          grade < 3
            ? pack.rules!.tables.buildingHealth[selector * 3 + grade]
            : undefined;
      if (maximum === undefined)
        throw Error("Admitted104D1E building health required");
      return maximum;
    },
    findServiceBuilding: campaignCreatureServiceBuilding,
    retireCarrierEffect36: (s, _creature, index) => {
      if (!services.effectOptions)
        throw Error("Actual49D30 campaign effect cleanup service required");
      const held = s.powerEffects.slots[index].nativePrior;
      if (!held || byte(held, 69) !== 36)
        throw Error("Actual carrier effect36 required");
      retireStagedSharedEffect(s, index, services.effectOptions(s));
      const after = s.powerEffects.slots[index].nativePrior!;
      held.splice(0, held.length, ...after);
      s.powerEffects.slots[index].nativePrior = held;
    },
  };
}

export function executeStagedCampaignCreatureCommand(
  w: CampaignCreatureCommandWorld,
  index: number,
  command: CampaignCreatureCommand,
  pack: Pack,
  services: CampaignCreatureCommandServices = {},
) {
  for (const mule of w.ecology.mules)
    if (mule.native !== w.creatureNative[mule.index])
      throw Error(
        "Staged creature command needs retained pool/ecology aliases",
      );
  const c = campaignCreatureCommandContext(w, pack, services),
    specialistBefore = w.specialists.records.map((n) => [n[21], n[74], n[85]]),
    out =
      command.type === "release"
        ? releaseStagedCreatureAction(w, index, c)
        : command.type === "move"
          ? executeStagedCreatureMove(w, index, command.point, c, {
              ...command,
              selectedPlayer: w.selectedPlayer,
            })
          : command.type === "target"
            ? targetStagedCreature(w, index, command.target, c)
            : interactStagedCreature(
                w,
                index,
                command.target,
                command.force,
                c,
              );
  for (let slot = 0; slot < w.specialists.records.length; slot++) {
    const n = w.specialists.records[slot];
    if (
      n[6] === 3 &&
      [21, 74, 85].some((at, i) => n[at] !== specialistBefore[slot][i])
    )
      mirrorCampaignSpecialist(w, slot);
  }
  if (out.feedback)
    requestAudio(w.audio, {
      frame: w.frame,
      entity: `source:0:${index}`,
      cue: out.feedback.cue,
      mode: out.feedback.mode,
      parameter: out.feedback.parameter,
      range: out.feedback.range,
      gain: out.feedback.volume,
      initialRatePercent: out.feedback.ratePercent,
    });
  synchronizeCampaignLinks(w);
  return out;
}

/** Whole-host rollback on a late unavailable port. False source result bits
 * commit their completed numeric writes, cleanup, audio and RNG. */
export function executeCampaignCreatureCommand(
  w: CampaignCreatureCommandWorld,
  index: number,
  command: CampaignCreatureCommand,
  pack: Pack,
  services: CampaignCreatureCommandServices = {},
) {
  const staged = structuredClone(w);
  restoreCreatureCommandAliases(staged);
  const out = executeStagedCampaignCreatureCommand(
    staged,
    index,
    command,
    pack,
    services,
  );
  Object.assign(w, staged);
  return out;
}

import type {
  SourcePoolRegistry,
  SourceEntityId,
} from "../campaign/source-pools";
import { nextRandom, type GeneRng } from "./random";
import {
  cellIndex,
  groundHeight,
  worldCell,
  type TerrainState,
} from "./terrain";

export interface PlantRule {
  selector: number;
  growthDeltas: number[];
  spreadPeriod: number;
  walkSteps: number;
  crowdingLimit: number;
  checkThreshold: number;
  nutrition: number;
  retirementDelay: number;
}
export interface EcologyRules {
  schemaVersion: 1;
  plants: PlantRule[];
  spreadDirections: [number, number][];
  plantResources: { selector: number; path: string; assetKey: string }[];
  corpseFriction?: number[];
  speciesTraits?: number[][];
  attackChannels?: number[];
  muleCombat?: {
    queryRadius: number;
    attack: number;
    defense: number;
    disposition: number;
    attackChannel: number;
    foodWeights: [number, number, number];
  };
  mule: {
    selector: number;
    baseSpeed: number;
    lifetimeScale: number;
    reserveScale: number;
    healthScale: number;
    healthRecoveryPeriod: number;
    warmThreshold: number;
  };
}
export interface EcologyPlant {
  id: SourceEntityId;
  index: number;
  active: boolean;
  owner: number;
  position: [number, number];
  selector: number;
  growth: number;
  flags: number;
  plantFlags: number;
  updateCounter: number;
  retirement: number;
  animation: number;
  frame: number;
  shade: number;
  height: number;
  /** Exact copied native numeric state; resource/vtable slots stay null. */
  native: (number | null)[];
}
export interface EcologyMule {
  id: SourceEntityId;
  index: number;
  native: (number | null)[];
  pending: string[];
}
export interface EcologyState {
  schemaVersion: 1;
  sourceSha256: string;
  ticks: number;
  plantCursor: number;
  plantCount: number;
  ownerPlantCounts: number[];
  plants: EcologyPlant[];
  mules: EcologyMule[];
  /** Callers must keep other entities current when using creature query plans. */
  otherEntities: {
    id: SourceEntityId;
    kind: number;
    owner: number;
    position: [number, number];
  }[];
  plantOrder?: Record<string, number[]>;
  pending: EcologyEvent[];
  unsupported: string[];
}
export type EcologyEvent =
  | { kind: "plant-growth"; id: SourceEntityId; before: number; after: number }
  | {
      kind: "plant-born";
      id: SourceEntityId;
      parent: SourceEntityId;
      position: [number, number];
    }
  | {
      kind: "plant-retired";
      id: SourceEntityId;
      cell: number;
      oldCellOperand: number;
      newCellOperand: number;
    }
  | { kind: "cleanup-required"; id: SourceEntityId; reason: string }
  | {
      kind: "plant-fed";
      plant: SourceEntityId;
      mule: SourceEntityId;
      damage: number;
      nutrition: number;
    };
export interface EcologyStepResult {
  committed: boolean;
  events: EcologyEvent[];
  reason: string | null;
  callbacks: number[];
}
export function cloneEcologyState(state: EcologyState): EcologyState {
  return {
    ...state,
    ownerPlantCounts: state.ownerPlantCounts.slice(),
    plants: state.plants.map((plant) => ({
      ...plant,
      position: [...plant.position],
      native: plant.native.slice(),
    })),
    mules: state.mules.map((mule) => ({
      ...mule,
      native: mule.native.slice(),
      pending: mule.pending.slice(),
    })),
    otherEntities: state.otherEntities.map((entity) => ({
      ...entity,
      position: [...entity.position],
    })),
    plantOrder: state.plantOrder
      ? Object.fromEntries(
          Object.entries(state.plantOrder).map(([cell, indices]) => [
            cell,
            indices.slice(),
          ]),
        )
      : undefined,
    pending: structuredClone(state.pending),
    unsupported: state.unsupported.slice(),
  };
}
const i16 = (value: number) => (value << 16) >> 16;
const word = (raw: readonly (number | null)[], at: number) => {
  if (raw[at] === null || raw[at + 1] === null)
    throw new Error("Ecology read requires an uninitialized native field");
  return i16(raw[at]! | (raw[at + 1]! << 8));
};
const put = (raw: (number | null)[], at: number, value: number) => {
  raw[at] = value & 255;
  raw[at + 1] = (value >> 8) & 255;
};
const decode = (value: string) =>
  Array.from(atob(value), (c) => c.charCodeAt(0));
function nativeRecord(
  packed: number[],
  stride: number,
  index: number,
  nativeStride: number,
) {
  const raw = packed.slice(index * stride, (index + 1) * stride),
    native: (number | null)[] = Array(nativeStride).fill(null);
  raw.forEach((value, at) => (native[at < 31 ? at : at + 8] = value));
  return native;
}
function plantFromNative(
  native: (number | null)[],
  index: number,
): EcologyPlant {
  return {
    id: `source:1:${index}`,
    index,
    active: native[6] === 2,
    owner: native[24]!,
    position: [word(native, 7), word(native, 9)],
    selector: (native[43]! << 24) >> 24,
    growth: word(native, 44),
    flags: native[21]!,
    plantFlags: native[46]!,
    updateCounter: native[47]!,
    retirement: native[48]!,
    animation: native[25]!,
    frame: native[27]!,
    shade: native[23]!,
    height:
      native[17]! |
      (native[18]! << 8) |
      (native[19]! << 16) |
      (native[20]! << 24),
    native,
  };
}
function syncPlant(plant: EcologyPlant) {
  const n = plant.native;
  n[6] = plant.active ? 2 : 0;
  n[21] = plant.flags;
  n[25] = plant.animation;
  put(n, 44, plant.growth);
  n[46] = plant.plantFlags;
  n[47] = plant.updateCounter;
  n[48] = plant.retirement;
}
export function createEcologyState(registry: SourcePoolRegistry): EcologyState {
  const pool = registry.source.pools.find((value) => value.family === 1)!,
    packed = decode(pool.packedBase64),
    prefix = decode(registry.source.missionPrefixBase64);
  const plants = Array.from({ length: 512 }, (_, index) => {
    const native = nativeRecord(packed, 41, index, 49);
    if (native[6] === 2) native.fill(0, 39, 43); // 6C690 cache reset
    return plantFromNative(native, index);
  });
  const count = prefix[0x3552] | (prefix[0x3553] << 8),
    active = plants.filter((value) => value.active).length;
  if (count !== active)
    throw new Error(
      "Ecology serialized plant count disagrees with active pool",
    );
  return {
    schemaVersion: 1,
    sourceSha256: registry.sourceSha256,
    ticks: 0,
    plantCursor: prefix[0x355a] | (prefix[0x355b] << 8),
    plantCount: count,
    ownerPlantCounts: registry.source.players.map(
      (player) => word(decode(player.recordBase64), 0x5fa) & 65535,
    ),
    plants,
    mules: registry.entities
      .filter((entity) => entity.family === 0)
      .map((entity) => ({
        id: entity.id,
        index: entity.index,
        native: [...entity.nativeBytes],
        pending:
          entity.record.resourceSelector === 4 && entity.record.owner === 4
            ? []
            : ["Creature species/owner callback is not admitted"],
      })),
    otherEntities: registry.entities
      .filter((entity) => entity.family !== 0 && entity.family !== 1)
      .map((entity) => ({
        id: entity.id,
        kind: entity.record.type,
        owner: entity.record.owner,
        position: [...entity.position],
      })),
    plantOrder: Object.fromEntries(
      registry.mapHeads.flatMap((head, cell) => {
        const indices: number[] = [];
        let id = head;
        while (id) {
          const entity = registry.entities.find(
            (candidate) => candidate.id === id,
          )!;
          if (entity.family === 1) indices.push(entity.index);
          id =
            entity.links.next.kind === "entity" ? entity.links.next.id : null;
        }
        return indices.length ? [[String(cell), indices]] : [];
      }),
    ),
    pending: [],
    unsupported: [
      "Complete creature movement/contact, food scoring, mating and mortality callbacks remain required",
      "Plant retirement/creation events require shared-world link/reference and presentation handling",
    ],
  };
}

/** 74CC0/8B130 plant contribution. A reserved flag8 plant contributes zero. */
export function plantBlockerWeight(state: EcologyState, cell: number): number {
  return state.plants.reduce(
    (sum, plant) =>
      sum +
      (plant.active &&
      worldCell(...plant.position) === (cell & 16383) &&
      !(plant.plantFlags & 8)
        ? 10
        : 0),
    0,
  );
}
/** Construction eligibility is an any-plant test, independent of its weight. */
export function sitePlantBlocked(state: EcologyState, cell: number): boolean {
  return state.plants.some(
    (plant) => plant.active && worldCell(...plant.position) === (cell & 16383),
  );
}
export function ecologyTerrainClass(
  terrain: TerrainState,
  position: [number, number],
): number {
  const x = (position[0] >> 8) & 127,
    y = (position[1] >> 8) & 127;
  const rounded = cellIndex(
    x + Number((position[0] & 255) >= 128),
    y + Number((position[1] & 255) >= 128),
  );
  const value = terrain.bytes[rounded * 14 + 5] & 7;
  if (value) return value;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      if ((dx || dy) && terrain.bytes[cellIndex(x + dx, y + dy) * 14 + 5] & 7)
        return 1;
  return 0;
}
function positivePlants(state: EcologyState, cell: number): number {
  return state.plants.filter(
    (plant) =>
      plant.active && plant.growth > 0 && worldCell(...plant.position) === cell,
  ).length;
}
function neighbors(state: EcologyState, position: [number, number]): number {
  const x = position[0] >> 8,
    y = position[1] >> 8;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      count = (count + positivePlants(state, cellIndex(x + dx, y + dy))) & 255;
  return count;
}
function shade(terrain: TerrainState, position: [number, number]): number {
  const x = position[0] >> 8,
    y = position[1] >> 8,
    fx = position[0] & 255,
    fy = position[1] & 255;
  const vertex = (dx: number, dy: number) => {
    const at = cellIndex(x + dx, y + dy) * 14;
    return (word(terrain.bytes, at) * terrain.bytes[at + 12]) >> 6;
  };
  const a = vertex(0, 0),
    b = vertex(1, 0),
    c = vertex(0, 1),
    d = vertex(1, 1);
  const doubled =
    2 * a +
    ((fx < fy ? (d - c) * fx + (c - a) * fy : (b - a) * fx + (d - b) * fy) >>
      7);
  return Math.max(0, Math.min(64, ((doubled - 0x1e00) >> 8) + 16));
}
function validateRules(rules: EcologyRules) {
  if (
    rules.schemaVersion !== 1 ||
    rules.plants.length !== 12 ||
    rules.spreadDirections.length !== 9 ||
    rules.plants.some(
      (row, index) => row.selector !== index || row.growthDeltas.length !== 8,
    )
  )
    throw new Error(
      "Original ecology rule profile is missing or has the wrong layout",
    );
}
function retire(
  state: EcologyState,
  terrain: TerrainState,
  plant: EcologyPlant,
  params: PlantRule,
  events: EcologyEvent[],
) {
  if (!(plant.plantFlags & 0x88)) {
    plant.animation = (plant.animation + 6) & 255;
    plant.growth = 0;
    plant.flags |= 4;
    plant.plantFlags |= 0x80;
    plant.retirement = params.retirementDelay;
  }
  if (plant.retirement >= 4) {
    plant.retirement -= 4;
    return;
  }
  plant.active = false;
  state.plantCount = (state.plantCount - 1) & 65535;
  if (state.plantOrder) {
    const key = String(worldCell(...plant.position));
    state.plantOrder[key] = (state.plantOrder[key] ?? []).filter(
      (index) => index !== plant.index,
    );
  }
  if (plant.owner < 4)
    state.ownerPlantCounts[plant.owner] =
      (state.ownerPlantCounts[plant.owner] - 1) & 65535;
  else if (plant.owner !== 4)
    throw new Error(
      "Plant owner is outside the original players and neutral owner",
    );
  const cell = worldCell(...plant.position),
    oldCellOperand = terrain.bytes[cell * 14 + 13],
    newCellOperand = oldCellOperand < 64 ? oldCellOperand + 2 : oldCellOperand;
  terrain.bytes[cell * 14 + 13] = newCellOperand;
  terrain.revision++;
  events.push({
    kind: "plant-retired",
    id: plant.id,
    cell,
    oldCellOperand,
    newCellOperand,
  });
  events.push({
    kind: "cleanup-required",
    id: plant.id,
    reason:
      "Unlink common map references, clear cross-family targets, and process original 724C0 UI/audio cleanup",
  });
}
function reproduce(
  state: EcologyState,
  terrain: TerrainState,
  rng: GeneRng,
  rules: EcologyRules,
  parent: EcologyPlant,
  params: PlantRule,
  water: number,
  events: EcologyEvent[],
) {
  if (parent.owner !== 4)
    throw new Error(
      "Owned plant reproduction factory requires its original owner bookkeeping",
    );
  let point: [number, number] = [...parent.position];
  for (let step = 0; step < params.walkSteps; step++) {
    const delta = rules.spreadDirections[nextRandom(rng) % 9];
    point = [i16(point[0] + delta[0]), i16(point[1] + delta[1])];
  }
  if (params.growthDeltas[ecologyTerrainClass(terrain, point)] < 0) return;
  const cell = worldCell(...point);
  if (positivePlants(state, cell) >= 1 || terrain.bytes[cell * 14 + 11] & 1)
    return;
  const jitterY = (nextRandom(rng) % 255) - 128,
    jitterX = (nextRandom(rng) % 255) - 128;
  const requested: [number, number] = [
    i16((point[0] & 0xff00) | (i16(point[0] + jitterX) & 255)),
    i16((point[1] & 0xff00) | (i16(point[1] + jitterY) & 255)),
  ];
  if (groundHeight(terrain, ...requested) <= water + 512) return;
  const slot = state.plants.find((plant) => !plant.active);
  if (!slot) return;
  const position = requested.map((v) =>
    i16((v & 0xff00) + ((v & 255) >> 2) + 96),
  ) as [number, number];
  const native = [...slot.native];
  native[2] = 0;
  native[5] = 0;
  native[6] = 2;
  native[24] = 4;
  put(native, 7, position[0]);
  put(native, 9, position[1]);
  native.fill(0, 11, 15);
  put(native, 15, slot.index);
  const height = groundHeight(terrain, ...position);
  for (let byte = 0; byte < 4; byte++)
    native[17 + byte] = (height >> (byte * 8)) & 255;
  native[21] = 5;
  native[22] = 0;
  native[23] = shade(terrain, position);
  for (const at of [25, 26, 27, 29]) native[at] = 0;
  native[28] = 1;
  native.fill(0, 39, 43);
  native[43] = parent.selector;
  put(native, 44, 4);
  native[46] = 0;
  native[47] = 0;
  const child = plantFromNative(native, slot.index);
  state.plants[slot.index] = child;
  state.plantCount++;
  if (state.plantOrder) {
    const key = String(worldCell(...position));
    (state.plantOrder[key] ??= []).unshift(slot.index);
  }
  events.push({
    kind: "plant-born",
    id: child.id,
    parent: parent.id,
    position,
  });
  events.push({
    kind: "cleanup-required",
    id: child.id,
    reason:
      "Insert newborn into shared map links and bind its imported plant animation before presentation",
  });
}
function callback(
  state: EcologyState,
  terrain: TerrainState,
  rng: GeneRng,
  rules: EcologyRules,
  index: number,
  water: number,
  events: EcologyEvent[],
) {
  const plant = state.plants[index];
  if (!plant.active) throw new Error("Scheduled plant slot is inactive");
  if (plant.flags & 1 || plant.plantFlags & 0x10) return;
  const params = rules.plants[plant.selector];
  if (!params)
    throw new Error("Plant selector has no admitted original parameter row");
  const oldGrowth = plant.growth,
    oldAnimation = plant.animation;
  if (plant.growth > 0) {
    const oldCounter = plant.updateCounter;
    plant.updateCounter = (oldCounter + 1) & 255;
    if (
      oldCounter >= params.checkThreshold ||
      terrain.bytes[worldCell(...plant.position) * 14 + 13] === 0
    )
      plant.growth = i16(plant.growth - 4);
    else if (neighbors(state, plant.position) > params.crowdingLimit)
      plant.growth = 0;
    else {
      plant.growth = Math.min(
        32,
        i16(
          plant.growth +
            params.growthDeltas[ecologyTerrainClass(terrain, plant.position)],
        ),
      );
      if (params.spreadPeriod === 0)
        throw new Error(
          "Original plant period-zero division path is unsupported",
        );
      if (
        plant.updateCounter % params.spreadPeriod === 0 &&
        state.plantCount < (plant.owner === 4 ? 412 : 512)
      )
        reproduce(state, terrain, rng, rules, plant, params, water, events);
    }
    plant.animation = Math.max(plant.animation, Math.min(plant.growth >> 3, 2));
  }
  if (plant.growth <= 0) retire(state, terrain, plant, params, events);
  else
    events.push({
      kind: "plant-growth",
      id: plant.id,
      before: oldGrowth,
      after: plant.growth,
    });
  if (plant.animation !== oldAnimation || plant.plantFlags & 2)
    plant.flags |= 4;
  syncPlant(plant);
}
export function advancePlantCursor(cursor: number): number {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > 512)
    throw new Error("Invalid source plant scheduler cursor");
  const next = cursor + 8;
  return next > 512 ? (next + 1) & 7 : next;
}
/** Source6D0B0 scheduling and neutral6CA90/6C4B0 lifecycle. Atomic on failure.
 * Shared-world link cleanup is returned explicitly and must be consumed. */
export function stepPlants(
  state: EcologyState,
  terrain: TerrainState,
  rng: GeneRng,
  rules: EcologyRules,
  rawWaterHeight: number,
): EcologyStepResult {
  const staged = cloneEcologyState(state),
    map = { bytes: terrain.bytes.slice(), revision: terrain.revision },
    random = { ...rng },
    events: EcologyEvent[] = [],
    callbacks: number[] = [];
  try {
    validateRules(rules);
    let remaining = state.plantCount,
      cursor = advancePlantCursor(state.plantCursor);
    const initial = state.plants.map((plant) => ({
      active: plant.active,
      flags: plant.flags,
    }));
    for (let index = 0; index < 512 && remaining > 0; index++) {
      if (!initial[index].active || initial[index].flags & 1) continue;
      if (callbacks.length < 2 && index === cursor) {
        callbacks.push(index);
        callback(staged, map, random, rules, index, rawWaterHeight, events);
        cursor = advancePlantCursor(cursor);
      }
      remaining--;
    }
    if (remaining !== 0)
      throw new Error("Plant scheduler count exceeds eligible source slots");
    for (const event of events)
      if (event.kind === "plant-born") {
        const child = staged.plants[Number(event.id.split(":")[2])];
        child.flags &= 0xfe;
        syncPlant(child);
      }
    staged.plantCursor = cursor;
    staged.ticks++;
    staged.pending.push(
      ...events.filter((event) => event.kind === "cleanup-required"),
    );
    Object.assign(state, staged);
    Object.assign(terrain, map);
    Object.assign(rng, random);
    return { committed: true, events, reason: null, callbacks };
  } catch (error) {
    return {
      committed: false,
      events: [],
      reason: String(error instanceof Error ? error.message : error),
      callbacks,
    };
  }
}
/** 6C900 applies damage only to living growth, then immediately enters6C780. */
export function damagePlant(
  state: EcologyState,
  terrain: TerrainState,
  rules: EcologyRules,
  index: number,
  damage: number,
): EcologyStepResult {
  if (!Number.isInteger(damage) || damage < 0 || damage > 32767)
    return {
      committed: false,
      events: [],
      callbacks: [],
      reason: "Plant damage is outside the admitted signed word domain",
    };
  const staged = cloneEcologyState(state),
    map = { bytes: terrain.bytes.slice(), revision: terrain.revision },
    events: EcologyEvent[] = [];
  try {
    const plant = staged.plants[index];
    if (!plant?.active) throw new Error("Plant damage target is inactive");
    if (plant.growth > 0) {
      plant.growth = i16(plant.growth - damage);
      if (plant.growth <= 0)
        retire(staged, map, plant, rules.plants[plant.selector], events);
      syncPlant(plant);
    }
    staged.pending.push(
      ...events.filter((event) => event.kind === "cleanup-required"),
    );
    Object.assign(state, staged);
    Object.assign(terrain, map);
    return { committed: true, events, callbacks: [], reason: null };
  } catch (error) {
    return {
      committed: false,
      events: [],
      callbacks: [],
      reason: String(error),
    };
  }
}

export function muleSkillPercent(skill: number, minimum: number): number {
  return minimum + Math.trunc((Math.min(skill, 100) * (100 - minimum)) / 100);
}
export function muleRequestedSpeed(
  mule: EcologyMule,
  rules: EcologyRules,
): number {
  const n = mule.native;
  return (
    (Math.trunc((rules.mule.baseSpeed * muleSkillPercent(n[0x76]!, 75)) / 100) *
      (n[0x7b]! + 1)) >>
    8
  );
}
/** Pure6A290 scalar tail after an admitted health/action prefix. It is not a
 * replacement for physics, target queries, mortality or the preceding decrement. */
export function muleLifecycleTail(
  mule: EcologyMule,
  rules: EcologyRules,
): void {
  const n = mule.native,
    energy = i16(word(n, 0x66) - 1),
    percent = muleSkillPercent(n[0x76]!, 30),
    life = Math.trunc((rules.mule.lifetimeScale * percent) / 100),
    reserve = life >> 3,
    threshold = life - reserve;
  put(n, 0x66, energy);
  if (energy <= threshold) {
    n[0x77] = 255;
    const stage =
      Math.trunc((energy - reserve) / Math.trunc(threshold / 3)) + 1;
    if (stage !== Math.abs((n[0x79]! << 24) >> 24)) n[0x79] = stage & 255;
  } else {
    const hunger =
      Math.max(16, Math.trunc(((life - energy) * 255) / reserve)) & 255;
    n[0x77] = hunger;
    put(
      n,
      0x62,
      ((Math.trunc(
        (rules.mule.reserveScale * muleSkillPercent(n[0x76]!, 40)) / 100,
      ) *
        (hunger + 1)) >>
        8) +
        32,
    );
    put(
      n,
      0x64,
      ((Math.trunc((rules.mule.healthScale * percent) / 100) * (hunger + 1)) >>
        8) +
        16,
    );
  }
}
/** Neutral state8 no-action choice after original motion/health and scorer.
 * No creature is teleported or marked ready. The caller must admit movement. */
export function chooseNeutralMule(
  mule: EcologyMule,
  rng: GeneRng,
  rules: EcologyRules,
  trig: { sine: readonly number[]; cosine: readonly number[] },
  accept: (point: [number, number]) => boolean,
  forcedWander = false,
) {
  const after = structuredClone(mule),
    n = after.native,
    random = { ...rng },
    samples: { point: [number, number]; accepted: boolean }[] = [];
  if (
    n[6] !== 1 ||
    n[24] !== 4 ||
    n[0x5e] !== 8 ||
    n[0x7a] !== 4 ||
    n[0x76]! > 90 ||
    n[0x7b] !== 255 ||
    word(n, 0x6a) <= 0 ||
    word(n, 0x6c) !== 0
  )
    throw new Error(
      "Neutral Mule choice is outside its admitted owner/species/state/health/timer domain",
    );
  if (trig.sine.length !== 2048 || trig.cosine.length !== 2048)
    throw new Error("Original trigonometric tables are required");
  nextRandom(random);
  nextRandom(random); // original neighborhood scan-order draws
  if (!(n[0x60]! & 8)) {
    n.splice(0x72, 4, ...n.slice(7, 11));
    n[0x60] = n[0x60]! | 8;
  }
  let chosen: [number, number] | null = null;
  const explicit = !!(n[0x61]! & 0x80),
    delay = !explicit && !forcedWander && nextRandom(random) % 10 < 4;
  if (delay) put(n, 0x6c, 20);
  else {
    for (let attempt = 0; attempt < (explicit ? 1 : 16); attempt++) {
      let point: [number, number];
      if (explicit) point = [word(n, 0x6e), word(n, 0x70)];
      else {
        const angle = nextRandom(random) * 8,
          radius = (2048 * nextRandom(random)) >> 8,
          index = (angle - 512) & 2047;
        const delta = [
          (trig.cosine[index] * (radius * 2)) >> 16,
          (trig.sine[index] * (radius * 2)) >> 16,
        ];
        point = [
          (i16(i16(word(n, 0x72) * 2) + i16(delta[0])) >> 1) & 0x7fff,
          (i16(i16(word(n, 0x74) * 2) + i16(delta[1])) >> 1) & 0x7fff,
        ];
      }
      const accepted = accept(point);
      samples.push({ point, accepted });
      if (accepted) {
        chosen = point;
        break;
      }
      n[0x49] = n[0x49]! | 0x40;
    }
    if (!chosen)
      throw new Error(
        "Mule backward target search is required after rejected candidates",
      );
    put(n, 11, chosen[0]);
    put(n, 13, chosen[1]);
    n[0x16] = n[0x16]! & 0x3f;
    put(n, 0x49, (word(n, 0x49) | 0x14) & 0xeffc);
    n[0x54] = 20;
    n[0x4f] = 0;
    n[0x52] = 0;
    put(n, 0x3f, muleRequestedSpeed(after, rules));
    put(n, 0x6c, 32767);
    n[0x60] = n[0x60]! | 0x80;
  }
  return {
    mule: after,
    rng: random,
    target: chosen,
    samples,
    requiresOriginalMovement: true as const,
  };
}

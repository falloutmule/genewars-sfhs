import {
  StartupSchema,
  SOURCE_POOL_LAYOUTS,
  type Startup,
  type SourceActiveRecord,
} from "../../content/startup";

export type SourceFamily = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type SourceEntityId = `source:${number}:${number}`;
export type SourceReference = { index: number; kind: number };
export type LogicalSourceReference =
  | { kind: "none" }
  | { kind: "map-cell"; cell: number }
  | { kind: "entity"; id: SourceEntityId };
export type SourceResourceBinding =
  | {
      kind: "creature-animation";
      selector: number;
      bones: boolean;
      assetKey: string | null;
    }
  | { kind: "plant-animation"; selector: number }
  | { kind: "building-animation"; selector: number }
  | { kind: "effect-animation"; code: number; tableByteOffset: number }
  | {
      kind: "specialist-animation";
      style: number;
      category: number;
      key: number;
    }
  | { kind: "family6-animation" }
  | { kind: "family7-animation"; tableByteOffset: 0 | 80 };
export interface SourceInitialization {
  status:
    | "source-copy"
    | "numeric-initializer-applied"
    | "logical-binding-only";
  resource: SourceResourceBinding | null;
  bindingStatus:
    | "logical"
    | "requires-resource-table"
    | "requires-player-blueprint"
    | "none-required"
    | "unresolved";
  /** No imported object has had its gameplay callbacks executed here. */
  readyForCallbacks: false;
  gates: string[];
}
export interface RuntimeSourceEntity {
  id: SourceEntityId;
  family: SourceFamily;
  index: number;
  record: SourceActiveRecord;
  position: [number, number];
  cell: [number, number];
  fractions: [number, number];
  links: { previous: LogicalSourceReference; next: LogicalSourceReference };
  source: {
    offset: number;
    header: number[];
    payload: number[];
    packedBase64: string;
  };
  /** Pointer slots and runtime-only bytes remain null until established.
   * Resource/class pointers are logical bindings, never process addresses. */
  nativeBytes: (number | null)[];
  initialization: SourceInitialization;
}
export interface SourcePoolRegistry {
  schemaVersion: 1;
  sourceSha256: string;
  canonicalStartupComplete: false;
  /** Preserves every imported source byte and opaque/unknown field for saves. */
  source: Startup;
  entities: RuntimeSourceEntity[];
  mapHeads: (SourceEntityId | null)[];
  unknown: string[];
}

function decode(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
function encode(value: Uint8Array): string {
  return btoa(Array.from(value, (v) => String.fromCharCode(v)).join(""));
}
function word(raw: Uint8Array, at: number): number {
  return new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getInt16(
    at,
    true,
  );
}
function unsignedWord(raw: Uint8Array, at: number): number {
  return new DataView(raw.buffer, raw.byteOffset, raw.byteLength).getUint16(
    at,
    true,
  );
}
function signedByte(value: number): number {
  return value > 127 ? value - 256 : value;
}
function fixedCell(position: [number, number]): [number, number] {
  return [(position[0] >> 8) & 127, (position[1] >> 8) & 127];
}
export function sourceEntityId(family: number, index: number): SourceEntityId {
  if (
    !Number.isInteger(family) ||
    family < 0 ||
    family > 7 ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= SOURCE_POOL_LAYOUTS[family][2]
  )
    throw new Error("Source family/index is outside its fixed pool");
  return `source:${family}:${index}`;
}
export function entityForSource(
  registry: SourcePoolRegistry,
  family: number,
  index: number,
): RuntimeSourceEntity | undefined {
  const id = sourceEntityId(family, index);
  return registry.entities.find((entity) => entity.id === id);
}
export function resolveSourceReference(
  registry: SourcePoolRegistry,
  reference: SourceReference,
  mapAnchor = false,
): LogicalSourceReference {
  if (
    !Number.isInteger(reference.kind) ||
    !Number.isInteger(reference.index) ||
    reference.kind < 0 ||
    reference.kind > 8
  )
    throw new Error("Invalid source link kind/index");
  if (reference.kind === 0) {
    if (!mapAnchor) return { kind: "none" };
    if (reference.index < 0 || reference.index >= 16384)
      throw new Error("Invalid source map anchor");
    return { kind: "map-cell", cell: reference.index };
  }
  const id = sourceEntityId(reference.kind - 1, reference.index);
  if (!registry.entities.some((entity) => entity.id === id))
    throw new Error("Source link refers to an inactive record");
  return { kind: "entity", id };
}

function verifyRecord(
  raw: Uint8Array,
  record: SourceActiveRecord,
  family: SourceFamily,
  index: number,
): void {
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const same = (actual: unknown, imported: unknown, field: string) => {
    if (JSON.stringify(actual) !== JSON.stringify(imported))
      throw new Error(
        `Source record ${family}:${index} ${field} disagrees with packed bytes`,
      );
  };
  same(raw[6], family + 1, "type/family");
  same(word(raw, 15), index, "identity");
  const fields: Record<string, unknown> = {
    type: raw[6],
    position: [word(raw, 7), word(raw, 9)],
    destination: [word(raw, 11), word(raw, 13)],
    sourceId: word(raw, 15),
    height: view.getInt32(17, true),
    flags: unsignedWord(raw, 21),
    shade: raw[23],
    owner: raw[24],
    animation: raw[25],
    animationSubframe: raw[26],
    frame: raw[27],
    animationState: raw[28],
    animationDelay: unsignedWord(raw, 29),
    previousLink: { index: word(raw, 0), kind: raw[2] },
    nextLink: { index: word(raw, 3), kind: raw[5] },
  };
  if (family === 0)
    Object.assign(fields, {
      resourceSelector: signedByte(raw[0x72]),
      behaviorState: raw[0x56],
    });
  if (family === 1)
    Object.assign(fields, {
      resourceSelector: signedByte(raw[0x23]),
      plantFlags: raw[0x26],
    });
  if (family === 2)
    Object.assign(fields, {
      commandState: signedByte(raw[0x4d]),
      readyFlags: unsignedWord(raw, 0x68),
      blueprintIndex: raw[0x6c],
    });
  if (family === 3)
    Object.assign(fields, {
      resourceSelector: raw[0x25],
      constructionPhase: raw[0x26],
    });
  if (family === 4) Object.assign(fields, { effectCode: raw[0x3d] });
  for (const [field, value] of Object.entries(fields)) {
    const imported =
      field === "previousLink" || field === "nextLink"
        ? { index: record[field].index, kind: record[field].kind }
        : record[field];
    same(value, imported, field);
  }
  if (raw[24] > 4)
    throw new Error("Source owner is outside players and neutral owner");
}

function initialize(
  family: SourceFamily,
  raw: Uint8Array,
  native: (number | null)[],
  record: SourceActiveRecord,
): SourceInitialization {
  const result: SourceInitialization = {
    status: "source-copy",
    resource: null,
    bindingStatus: "unresolved",
    readyForCallbacks: false,
    gates: [
      "Family callbacks, startup shade refresh and lifecycle integration are pending",
    ],
  };
  if (family === 0) {
    const selector = record.resourceSelector!,
      bones = record.behaviorState! >= 26;
    result.resource = {
      kind: "creature-animation",
      selector,
      bones,
      assetKey: bones ? "BONES" : selector === 4 ? "MULE" : null,
    };
    result.status = "logical-binding-only";
    result.bindingStatus =
      bones || selector === 4 ? "logical" : "requires-resource-table";
    if (result.bindingStatus !== "logical")
      result.gates.push(
        "5A1C0 loaded creature table and 104A64 fallback table are required",
      );
  } else if (family === 1 || family === 3) {
    // 6C690 / 44FF0 zero the auxiliary native dword, then bind an
    // animation table by a signed byte selector. No other numeric writes.
    native.fill(0, 0x27, 0x2b);
    const selector =
      family === 1 ? record.resourceSelector! : signedByte(raw[0x25]);
    result.resource = {
      kind: family === 1 ? "plant-animation" : "building-animation",
      selector,
    };
    result.status = "numeric-initializer-applied";
    result.bindingStatus =
      selector >= 0 && selector < (family === 1 ? 12 : 14)
        ? "logical"
        : "requires-resource-table";
    if (result.bindingStatus !== "logical")
      result.gates.push(
        "Signed resource selector is outside the admitted table",
      );
  } else if (family === 2) {
    result.bindingStatus = "requires-player-blueprint";
    result.gates.push(
      "56E20 requires the retained player blueprint, native priors and specialist resource key",
    );
  } else if (family === 4) {
    const code = raw[0x3d]; // native+0x45, not the physics payload at+0x2D
    if (code !== 0x45) {
      result.resource = {
        kind: "effect-animation",
        code,
        tableByteOffset: code * 10,
      };
      result.status = "logical-binding-only";
      result.bindingStatus = "logical";
    } else {
      const flags = raw[0x44],
        style = (flags & 6) >> 1,
        category = (flags & 0x38) >> 3;
      if (flags & 0xc0 && category < 4) {
        result.resource = {
          kind: "specialist-animation",
          style,
          category,
          key: style * 4 + category,
        };
        // 49E90 also writes the associated resource database pointer at4D.
        native.fill(null, 0x4d, 0x51);
        result.status = "logical-binding-only";
        result.bindingStatus = "logical";
      } else
        result.gates.push(
          "Effect45 initializer preserves an inherited binding or requires a valid specialist category",
        );
    }
  } else if (family === 5) {
    // 4EE70 is a return; all source numeric bytes stay as loaded.
    result.bindingStatus = "none-required";
    result.gates.push(
      "Family5 gameplay meaning and callback remain unimplemented",
    );
  } else if (family === 6) {
    result.resource = { kind: "family6-animation" };
    result.status = "logical-binding-only";
    result.bindingStatus = "logical";
    result.gates.push(
      "Family6 gameplay meaning and callback remain unimplemented",
    );
  } else {
    const state = raw[0x4d]; // native+0x55
    if (state <= 2) {
      result.resource = {
        kind: "family7-animation",
        tableByteOffset: state === 1 ? 0 : 80,
      };
      result.status = "logical-binding-only";
      result.bindingStatus = "logical";
    } else
      result.gates.push(
        "10060 preserves inherited resource binding for this state",
      );
    result.gates.push(
      "Family7 gameplay meaning and callback remain unimplemented",
    );
  }
  return result;
}

/** Source/header copy, proved local initializer effects, and logical rebinding.
 * This neither executes an original program nor initializes a complete world. */
export function createSourcePoolRegistry(input: Startup): SourcePoolRegistry {
  const source = StartupSchema.parse(input);
  const registry: SourcePoolRegistry = {
    schemaVersion: 1,
    sourceSha256: source.sourceSha256,
    canonicalStartupComplete: false,
    source,
    entities: [],
    mapHeads: Array(16384).fill(null),
    unknown: [
      "Native pointer bytes have no serialized provenance",
      "Payload references outside common map links require family-specific lifecycle decoding",
    ],
  };
  for (const pool of [...source.pools].sort((a, b) => a.family - b.family)) {
    const family = pool.family as SourceFamily,
      packed = decode(pool.packedBase64);
    const byIndex = new Map(
      pool.activeRecords.map((record) => [record.index, record]),
    );
    for (let index = 0; index < pool.capacity; index++) {
      const raw = packed.subarray(
          index * pool.packedStride,
          (index + 1) * pool.packedStride,
        ),
        record = byIndex.get(index);
      if (!raw[6]) {
        if (record)
          throw new Error(
            "Normalized source record is active but packed slot is inactive",
          );
        continue;
      }
      if (!record)
        throw new Error(
          "Packed active source slot is missing normalized record",
        );
      verifyRecord(raw, record, family, index);
      const native: (number | null)[] = Array(pool.nativeStride).fill(null);
      for (let byte = 0; byte < 31; byte++) native[byte] = raw[byte];
      for (let byte = 31; byte < raw.length; byte++)
        native[byte + 8] = raw[byte];
      const position: [number, number] = [...record.position];
      registry.entities.push({
        id: sourceEntityId(family, index),
        family,
        index,
        record,
        position,
        cell: fixedCell(position),
        fractions: [position[0] & 255, position[1] & 255],
        links: { previous: { kind: "none" }, next: { kind: "none" } },
        source: {
          offset: record.sourceOffset,
          header: Array.from(raw.subarray(0, 31)),
          payload: Array.from(raw.subarray(31)),
          packedBase64: encode(raw),
        },
        nativeBytes: native,
        initialization: initialize(family, raw, native, record),
      });
    }
  }
  const byId = new Map(registry.entities.map((entity) => [entity.id, entity]));
  for (const entity of registry.entities) {
    entity.links.previous = resolveSourceReference(
      registry,
      entity.record.previousLink,
      true,
    );
    entity.links.next = resolveSourceReference(
      registry,
      entity.record.nextLink,
    );
  }
  const map = decode(source.terrain.mapCells14),
    visited = new Set<SourceEntityId>();
  for (let cell = 0; cell < 16384; cell++) {
    const head = resolveSourceReference(registry, {
      index: word(map, cell * 14 + 6),
      kind: map[cell * 14 + 8],
    });
    if (head.kind !== "entity") continue;
    registry.mapHeads[cell] = head.id;
    let previous: LogicalSourceReference = { kind: "map-cell", cell },
      current: LogicalSourceReference = head;
    while (current.kind === "entity") {
      if (visited.has(current.id))
        throw new Error("Source map list contains a cycle or duplicate entity");
      visited.add(current.id);
      const entity: RuntimeSourceEntity = byId.get(current.id)!;
      if (entity.cell[1] * 128 + entity.cell[0] !== cell)
        throw new Error(
          "Source entity is linked to a different wrapped map cell",
        );
      if (JSON.stringify(entity.links.previous) !== JSON.stringify(previous))
        throw new Error("Source map list has an invalid previous link");
      previous = current;
      current = entity.links.next;
    }
  }
  if (visited.size !== registry.entities.length)
    throw new Error("Active source entity is absent from the map lists");
  return registry;
}

function views(registry: SourcePoolRegistry, family: SourceFamily) {
  return registry.entities
    .filter((entity) => entity.family === family)
    .map((entity) => ({
      id: entity.id,
      index: entity.index,
      position: [...entity.position] as [number, number],
      cell: [...entity.cell] as [number, number],
      owner: entity.record.owner,
      height: entity.record.height,
      flags: entity.record.flags,
      shade: entity.record.shade,
      animation: entity.record.animation,
      frame: entity.record.frame,
      initialization: structuredClone(entity.initialization),
      sourcePayload: [...entity.source.payload],
      nativeBytes: [...entity.nativeBytes],
      entity,
    }));
}
export function activeCreatures(registry: SourcePoolRegistry) {
  return views(registry, 0).map((view) => ({
    ...view,
    resourceSelector: view.entity.record.resourceSelector!,
    behaviorState: view.entity.record.behaviorState!,
  }));
}
export function activePlants(registry: SourcePoolRegistry) {
  return views(registry, 1).map((view) => ({
    ...view,
    resourceSelector: view.entity.record.resourceSelector!,
    plantFlags: view.entity.record.plantFlags!,
  }));
}
export function activeBuildings(registry: SourcePoolRegistry) {
  return views(registry, 3).map((view) => ({
    ...view,
    resourceSelector: view.entity.record.resourceSelector!,
    constructionPhase: view.entity.record.constructionPhase!,
  }));
}
export function activeEffects(registry: SourcePoolRegistry) {
  return views(registry, 4).map((view) => ({
    ...view,
    effectCode: view.entity.record.effectCode!,
  }));
}

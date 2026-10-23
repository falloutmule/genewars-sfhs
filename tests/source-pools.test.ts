import { describe, expect, it } from "vitest";
import { initializeNativePool } from "../src/sim/campaign/native-pools";
import {
  StartupSchema,
  SOURCE_POOL_LAYOUTS,
  type Startup,
  type SourceActiveRecord,
} from "../src/content/startup";
import {
  createSourcePoolRegistry,
  sourceEntityId,
  entityForSource,
  activeCreatures,
  activePlants,
  activeBuildings,
  activeEffects,
} from "../src/sim/campaign/source-pools";

const sha = "0".repeat(64);
it("refuses to read specialist native tails from the next serialized slot", () => {
  const source = createSourcePoolRegistry(fixture());
  expect(() => initializeNativePool(source, 2)).toThrow(
    /dedicated native tail loader/,
  );
  expect(initializeNativePool(source, 0)).toHaveLength(300);
  expect(initializeNativePool(source, 3)[255]).toHaveLength(67);
});
const b64 = (value: Uint8Array | number[]) =>
  Buffer.from(value).toString("base64");
const blank = (length: number) => b64(new Uint8Array(length));
type Item = {
  family: number;
  index?: number;
  position?: [number, number];
  selector?: number;
  state?: number;
};
function fixture(items: Item[] = []): Startup {
  const map = new Uint8Array(229376),
    mapView = new DataView(map.buffer);
  const pools = SOURCE_POOL_LAYOUTS.map(
    ([family, sourceOffset, capacity, packedStride, nativeStride]) => ({
      family,
      sourceOffset,
      capacity,
      packedStride,
      nativeStride,
      packedBase64: "",
      packedSha256: sha,
      activeCount: 0,
      activeRecords: [] as SourceActiveRecord[],
      nativeCopyRanges: [
        [0, 31, 0],
        [31, packedStride, 39],
      ],
      unknown: ["Fixture opaque bytes"],
    }),
  );
  const buffers = pools.map(
    (pool) => new Uint8Array(pool.capacity * pool.packedStride),
  );
  for (const [ordinal, item] of items.entries()) {
    const pool = pools[item.family],
      index = item.index ?? 0,
      raw = buffers[item.family].subarray(
        index * pool.packedStride,
        (index + 1) * pool.packedStride,
      ),
      view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength),
      position: [number, number] = item.position ?? [
        256 * (ordinal + 2) + 17,
        256 * 4 + 23,
      ],
      cell = ((position[1] >> 8) & 127) * 128 + ((position[0] >> 8) & 127),
      selector = item.selector ?? 4,
      state = item.state ?? 8;
    raw.fill(0xa5, 31); // a source payload with unmentioned bytes to preserve
    view.setInt16(0, cell, true);
    raw[2] = 0;
    raw[6] = item.family + 1;
    view.setInt16(7, position[0], true);
    view.setInt16(9, position[1], true);
    view.setInt16(15, index, true);
    view.setInt32(17, -123, true);
    view.setUint16(21, 0x0280, true);
    raw[23] = 47;
    raw[24] = 4;
    raw[25] = 6;
    raw[27] = 2;
    raw[28] = 1;
    const record: SourceActiveRecord = {
      index,
      sourceOffset: pool.sourceOffset + index * pool.packedStride,
      type: item.family + 1,
      position,
      destination: [0, 0],
      sourceId: index,
      height: -123,
      flags: 0x0280,
      shade: 47,
      owner: 4,
      animation: 6,
      animationSubframe: 0,
      frame: 2,
      animationState: 1,
      animationDelay: 0,
      previousLink: { index: cell, kind: 0 },
      nextLink: { index: 0, kind: 0 },
    };
    if (item.family === 0) {
      raw[0x72] = selector;
      raw[0x56] = state;
      record.resourceSelector = selector;
      record.behaviorState = state;
    }
    if (item.family === 1) {
      raw[0x23] = selector;
      raw[0x26] = 0x3a;
      record.resourceSelector = selector;
      record.plantFlags = 0x3a;
    }
    if (item.family === 2) {
      raw[0x4d] = 0;
      view.setUint16(0x68, 0x400, true);
      raw[0x6c] = 10;
      record.commandState = 0;
      record.readyFlags = 0x400;
      record.blueprintIndex = 10;
    }
    if (item.family === 3) {
      raw[0x25] = selector;
      raw[0x26] = state;
      record.resourceSelector = selector;
      record.constructionPhase = state;
    }
    if (item.family === 4) {
      raw[0x3d] = selector;
      record.effectCode = selector;
    }
    if (item.family === 7) raw[0x4d] = state;
    pool.activeRecords.push(record);
    pool.activeCount++;
    mapView.setInt16(cell * 14 + 6, index, true);
    map[cell * 14 + 8] = item.family + 1;
  }
  for (const pool of pools) pool.packedBase64 = b64(buffers[pool.family]);
  return StartupSchema.parse({
    schemaVersion: 1,
    layoutVersion: "cd-conq-fast-0x55336-v1",
    missionNumber: 1,
    runtimeStatus: "source-only",
    canonicalStartupComplete: false,
    sourceSha256: sha,
    headerSha256: sha,
    title: "Fixture",
    headerBase64: blank(699),
    missionPrefixBase64: blank(0x355e),
    players: Array.from({ length: 4 }, (_, slot) => ({
      slot,
      sourceOffset: 20 + slot * 1805,
      recordBase64: blank(1805),
      recordSha256: sha,
      state: 0,
      playerId: slot,
      creationMode: 0,
      actorCount: 0,
      actorIds: [0, 0, 0, 0, 0],
      target: [0, 0],
      metadataCount: 0,
      blueprints: [],
      funds: 0,
      separateBalance: 0,
      progress: 0,
      unknown: [],
    })),
    targets: [
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ],
    context: {
      flags: 0x38,
      frameCounter: 0,
      rngDrawCount: 0,
      frameBackup: 0,
      rngSeed: 1,
      rngRing: null,
      activePlayerCount: 1,
      serializedCountdown: 0,
      campaignEntryCountdown: 1000,
      actorMask: 5,
      specialActivation: 0,
      missionFundUnits: 20,
      campaignFundsBeforeEngineerCosts: 2000,
      globalsBase64: blank(52),
      viewportSnapshotBase64: blank(4),
      unknown: [],
    },
    terrain: {
      atlasSelector: 0,
      atlasResource: "B32A",
      atlasSelectorFileOffset: 0x1c5b,
      mapCells14: b64(map),
      mapCellsSha256: sha,
      mapOffset: 0x355e,
      width: 128,
      height: 128,
      cellStride: 14,
      cellLayout: {
        lightOperandI16: 0,
        heightI16: 2,
        textureU8: 4,
        materialAndOrientationU8: 5,
        headIndexI16: 6,
        headKindU8: 8,
        climateOffsetI16: 9,
        jobFlagsU8: 11,
        revealFactorU8: 12,
        rawByte13U8: 13,
      },
      rawWaterHeight: 0,
      serializedPhysicalWaterHeight: 999,
      loadedPhysicalWaterHeight: 0,
      climate: 0,
      solarGeneration: 0,
      climateCenter: [0, 0],
      zoneCount: 0,
      zones: [],
      unknown: [],
    },
    pools,
    specialistInputs: { fixture: true },
    blueprintRules: {
      skillBase: 1,
      skillRange: 2,
      skillDifficultyIncrement: 1,
      healthDifficultyIncrement: 1,
      styles: Array.from({ length: 4 }, () => ({
        healthBase: 1,
        healthRange: 2,
        healthLimit: 10,
        skillLimit: 10,
      })),
    },
    extensionBase64: blank(6900),
    unknown: ["Fixture-only source"],
  });
}
function patchRecord(
  source: Startup,
  family: number,
  index: number,
  mutate: (raw: Uint8Array, record: SourceActiveRecord) => void,
) {
  const pool = source.pools[family],
    packed = Uint8Array.from(Buffer.from(pool.packedBase64, "base64"));
  const record = pool.activeRecords.find((value) => value.index === index)!;
  mutate(
    packed.subarray(index * pool.packedStride, (index + 1) * pool.packedStride),
    record,
  );
  pool.packedBase64 = b64(packed);
}

describe("normalized source pool initialization", () => {
  it("admits all eight pools, preserves opaque source bytes and assigns stable identities", () => {
    const source = fixture(
        SOURCE_POOL_LAYOUTS.map(([family]) => ({ family, state: 1 })),
      ),
      before = JSON.stringify(source),
      registry = createSourcePoolRegistry(source);
    expect(registry.entities.map((entity) => entity.id)).toEqual(
      SOURCE_POOL_LAYOUTS.map(([family]) => `source:${family}:0`),
    );
    expect(
      registry.entities.every((entity) =>
        entity.nativeBytes.slice(31, 39).every((value) => value === null),
      ),
    ).toBe(true);
    expect(
      registry.entities.every(
        (entity) => entity.initialization.readyForCallbacks === false,
      ),
    ).toBe(true);
    expect(registry.canonicalStartupComplete).toBe(false);
    expect(JSON.stringify(source)).toBe(before);
    expect(JSON.parse(JSON.stringify(registry))).toEqual(registry);
    expect(
      createSourcePoolRegistry({
        ...source,
        pools: [...source.pools].reverse(),
      }).entities,
    ).toEqual(registry.entities);
    expect(
      entityForSource(registry, 6, 0)?.initialization.gates.some((gate) =>
        gate.includes("unimplemented"),
      ),
    ).toBe(true);
  });
  it("applies only the proved plant/building numeric initializer and exposes source fields", () => {
    const registry = createSourcePoolRegistry(
      fixture([
        { family: 0 },
        { family: 1 },
        { family: 3 },
        { family: 4, selector: 7 },
      ]),
    );
    const creature = activeCreatures(registry)[0],
      plant = activePlants(registry)[0],
      building = activeBuildings(registry)[0],
      effect = activeEffects(registry)[0];
    expect([
      creature.resourceSelector,
      creature.behaviorState,
      creature.shade,
      creature.flags,
    ]).toEqual([4, 8, 47, 0x280]);
    expect(creature.initialization.resource).toEqual({
      kind: "creature-animation",
      selector: 4,
      bones: false,
      assetKey: "MULE",
    });
    expect(creature.nativeBytes.slice(39, 43)).toEqual([
      0xa5, 0xa5, 0xa5, 0xa5,
    ]);
    expect(plant.nativeBytes.slice(39, 43)).toEqual([0, 0, 0, 0]);
    expect(building.nativeBytes.slice(39, 43)).toEqual([0, 0, 0, 0]);
    expect(plant.sourcePayload.slice(0, 4)).toEqual([0xa5, 0xa5, 0xa5, 0xa5]);
    expect(plant.plantFlags).toBe(0x3a);
    expect(effect.effectCode).toBe(7);
    expect(effect.initialization.resource).toEqual({
      kind: "effect-animation",
      code: 7,
      tableByteOffset: 70,
    });
  });
  it("keeps unresolved bindings and unsupplied specialist priors explicit", () => {
    const registry = createSourcePoolRegistry(
      fixture([
        { family: 0, selector: 10 },
        { family: 2 },
        { family: 7, state: 3 },
      ]),
    );
    expect(
      registry.entities.map((entity) => entity.initialization.bindingStatus),
    ).toEqual([
      "requires-resource-table",
      "requires-player-blueprint",
      "unresolved",
    ]);
    expect(
      registry.entities[1].nativeBytes
        .slice(148)
        .every((value) => value === null),
    ).toBe(true);
    expect(
      activeCreatures(
        createSourcePoolRegistry(fixture([{ family: 0, state: 26 }])),
      )[0].initialization.resource,
    ).toMatchObject({ bones: true, assetKey: "BONES" });
  });
  it("wraps signed fixed-point coordinates to the original map and retains fractions", () => {
    const registry = createSourcePoolRegistry(
      fixture([{ family: 0, index: 299, position: [-1, -32768] }]),
    );
    expect(registry.entities[0].cell).toEqual([127, 0]);
    expect(registry.entities[0].fractions).toEqual([255, 0]);
    expect(registry.mapHeads[127]).toBe("source:0:299");
    expect(sourceEntityId(0, 299)).toBe("source:0:299");
    expect(() => sourceEntityId(0, 300)).toThrow();
    expect(() => sourceEntityId(8, 0)).toThrow();
  });
  it("rejects duplicate identities, malformed capacities, payload lengths and missing source records", () => {
    let source = fixture([{ family: 0 }]);
    source.pools[0].activeRecords.push(
      structuredClone(source.pools[0].activeRecords[0]),
    );
    source.pools[0].activeCount++;
    expect(() => createSourcePoolRegistry(source)).toThrow(/Duplicate/);
    source = fixture();
    source.pools[0].capacity--;
    expect(() => createSourcePoolRegistry(source)).toThrow(/extent/);
    source = fixture();
    source.pools[1].packedBase64 = blank(1);
    expect(() => createSourcePoolRegistry(source)).toThrow(/extent/);
    source = fixture([{ family: 0 }]);
    source.pools[0].activeRecords = [];
    source.pools[0].activeCount = 0;
    expect(() => createSourcePoolRegistry(source)).toThrow(
      /missing normalized/,
    );
    source = fixture([{ family: 0 }]);
    patchRecord(source, 0, 0, (raw, record) => {
      raw[15] = 1;
      record.sourceId = 1;
    });
    expect(() => createSourcePoolRegistry(source)).toThrow(/identity/);
  });
  it("rejects links to inactive records and normalized fields that disagree with source", () => {
    const source = fixture([{ family: 0 }]);
    patchRecord(source, 0, 0, (raw, record) => {
      raw[5] = 2;
      record.nextLink.kind = 2;
    });
    expect(() => createSourcePoolRegistry(source)).toThrow(/inactive/);
    const mismatch = fixture([{ family: 0 }]);
    mismatch.pools[0].activeRecords[0].position[0]++;
    expect(() => createSourcePoolRegistry(mismatch)).toThrow(/disagrees/);
  });
  it("rejects map cycles, missing heads and wrong previous anchors", () => {
    let source = fixture([{ family: 0 }]);
    patchRecord(source, 0, 0, (raw, record) => {
      raw[5] = 1;
      record.nextLink.kind = 1;
    });
    expect(() => createSourcePoolRegistry(source)).toThrow(/cycle/);
    source = fixture([{ family: 0 }]);
    source.terrain.mapCells14 = blank(229376);
    expect(() => createSourcePoolRegistry(source)).toThrow(/absent/);
    source = fixture([{ family: 0 }]);
    patchRecord(source, 0, 0, (raw, record) => {
      raw[0]++;
      record.previousLink.index++;
    });
    expect(() => createSourcePoolRegistry(source)).toThrow(/previous link/);
  });
  it("preserves extra source metadata while refusing fabricated complete-startup claims", () => {
    const source = fixture();
    source.extraEvidence = { opaque: true };
    expect(createSourcePoolRegistry(source).source.extraEvidence).toEqual({
      opaque: true,
    });
    expect(() =>
      StartupSchema.parse({ ...source, canonicalStartupComplete: true }),
    ).toThrow();
  });
});

import { z } from "zod";

/** Serialized source admission. Runtime readiness is a separate contract. */
export const SOURCE_POOL_LAYOUTS = [
  [0, 243038, 300, 116, 124],
  [1, 277838, 512, 41, 49],
  [2, 298830, 20, 140, 200],
  [3, 301630, 256, 59, 67],
  [4, 316734, 200, 73, 81],
  [5, 331334, 32, 41, 49],
  [6, 332646, 32, 89, 97],
  [7, 335494, 16, 94, 102],
] as const;
const u8 = z.number().int().min(0).max(255);
const i8 = z.number().int().min(-128).max(127);
const u16 = z.number().int().min(0).max(65535);
const i16 = z.number().int().min(-32768).max(32767);
const u32 = z.number().int().min(0).max(0xffffffff);
const i32 = z.number().int().min(-0x80000000).max(0x7fffffff);
const point = z.tuple([i16, i16]);
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const unknowns = z.array(z.string());
const base64 = z
  .string()
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const byteLength = (value: string) =>
  (value.length / 4) * 3 -
  (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
const bytes = (length: number) =>
  base64.refine(
    (value) => byteLength(value) === length,
    `Expected ${length} decoded source bytes`,
  );

export const SourceActiveRecordSchema = z
  .object({
    index: z.number().int().nonnegative(),
    sourceOffset: z.number().int().nonnegative(),
    type: u8,
    position: point,
    destination: point,
    sourceId: i16,
    height: i32,
    flags: u16,
    shade: u8,
    owner: u8,
    animation: u8,
    animationSubframe: u8,
    frame: u8,
    animationState: u8,
    animationDelay: u16,
    previousLink: z.object({ index: i16, kind: u8 }).passthrough(),
    nextLink: z.object({ index: i16, kind: u8 }).passthrough(),
    resourceSelector: i16.optional(),
    behaviorState: u8.optional(),
    plantFlags: u8.optional(),
    commandState: i8.optional(),
    readyFlags: u16.optional(),
    blueprintIndex: u8.optional(),
    constructionPhase: u8.optional(),
    effectCode: u8.optional(),
  })
  .passthrough();
export type SourceActiveRecord = z.infer<typeof SourceActiveRecordSchema>;

const PoolSchema = z
  .object({
    family: z.number().int().min(0).max(7),
    sourceOffset: z.number().int(),
    capacity: z.number().int().positive(),
    packedStride: z.number().int().positive(),
    nativeStride: z.number().int().positive(),
    packedBase64: base64,
    packedSha256: sha,
    activeCount: z.number().int().nonnegative(),
    activeRecords: z.array(SourceActiveRecordSchema),
    nativeCopyRanges: z.array(
      z.tuple([z.number().int(), z.number().int(), z.number().int()]),
    ),
    unknown: unknowns,
  })
  .passthrough()
  .superRefine((pool, ctx) => {
    const [family, offset, count, stride, native] =
      SOURCE_POOL_LAYOUTS[pool.family];
    if (
      pool.sourceOffset !== offset ||
      pool.capacity !== count ||
      pool.packedStride !== stride ||
      pool.nativeStride !== native
    )
      ctx.addIssue({
        code: "custom",
        message: `Unsupported family ${family} extent`,
      });
    if (byteLength(pool.packedBase64) !== count * stride)
      ctx.addIssue({
        code: "custom",
        path: ["packedBase64"],
        message: "Packed pool byte extent mismatch",
      });
    if (
      pool.activeCount !== pool.activeRecords.length ||
      pool.activeCount > count
    )
      ctx.addIssue({ code: "custom", message: "Active pool count mismatch" });
    if (
      JSON.stringify(pool.nativeCopyRanges) !==
      JSON.stringify([
        [0, 31, 0],
        [31, stride, 39],
      ])
    )
      ctx.addIssue({
        code: "custom",
        message: "Unsupported source/native copy ranges",
      });
    const seen = new Set<number>();
    for (const [at, record] of pool.activeRecords.entries()) {
      if (record.index >= count || seen.has(record.index))
        ctx.addIssue({
          code: "custom",
          path: ["activeRecords", at],
          message: "Duplicate or out-of-bounds source identity",
        });
      seen.add(record.index);
      if (
        record.sourceOffset !== offset + record.index * stride ||
        record.type === 0
      )
        ctx.addIssue({
          code: "custom",
          path: ["activeRecords", at],
          message: "Invalid active source record",
        });
    }
  });

const BlueprintSchema = z
  .object({
    index: z.number().int().min(0).max(31),
    name: z.string(),
    style: i8,
    category: i8,
    stat17: u8,
    opaque18: u8,
    stat19: u8,
    stat1a: u8,
    opaque1b: u8,
    flags20: u8,
  })
  .passthrough();
const PlayerSchema = z
  .object({
    slot: z.number().int().min(0).max(3),
    sourceOffset: z.number().int(),
    recordBase64: bytes(1805),
    recordSha256: sha,
    state: u8,
    playerId: u8,
    creationMode: u8,
    actorCount: i8,
    actorIds: z.array(u8).length(5),
    target: point,
    metadataCount: u8,
    blueprints: z.array(BlueprintSchema).max(32),
    funds: u32,
    separateBalance: u32,
    progress: i8,
    unknown: unknowns,
  })
  .passthrough();

const NumericRulesSchema = z
  .object({
    skillBase: u8,
    skillRange: z.number().int().positive().max(256),
    skillDifficultyIncrement: u8,
    healthDifficultyIncrement: u8,
    styles: z
      .array(
        z
          .object({
            healthBase: u8,
            healthRange: z.number().int().positive().max(256),
            healthLimit: u8,
            skillLimit: u8,
          })
          .passthrough(),
      )
      .length(4),
  })
  .passthrough();

export const StartupSchema = z
  .object({
    schemaVersion: z.literal(1),
    layoutVersion: z.literal("cd-conq-fast-0x55336-v1"),
    missionNumber: z.number().int().min(1).max(24).nullable(),
    runtimeStatus: z.literal("source-only"),
    canonicalStartupComplete: z.literal(false),
    sourceSha256: sha,
    headerSha256: sha,
    title: z.string(),
    headerBase64: bytes(699),
    missionPrefixBase64: bytes(0x355e),
    players: z.array(PlayerSchema).length(4),
    targets: z.array(point).length(4),
    context: z
      .object({
        flags: u8,
        frameCounter: u32,
        rngDrawCount: u32,
        frameBackup: u32,
        rngSeed: u16,
        rngRing: z.null(),
        activePlayerCount: z.number().int().min(0).max(4),
        serializedCountdown: u16,
        campaignEntryCountdown: z.literal(1000),
        actorMask: u8,
        specialActivation: u32,
        missionFundUnits: u8,
        campaignFundsBeforeEngineerCosts: z.number().int().min(0).max(25500),
        globalsBase64: bytes(52),
        viewportSnapshotBase64: bytes(4),
        unknown: unknowns,
      })
      .passthrough(),
    terrain: z
      .object({
        atlasSelector: u8,
        atlasResource: z.enum(["B32A", "B32B", "B32C", "B32D"]).nullable(),
        atlasSelectorFileOffset: z.literal(0x1c5b),
        mapCells14: bytes(229376),
        mapCellsSha256: sha,
        mapOffset: z.literal(0x355e),
        width: z.literal(128),
        height: z.literal(128),
        cellStride: z.literal(14),
        cellLayout: z
          .object({
            lightOperandI16: z.literal(0),
            heightI16: z.literal(2),
            textureU8: z.literal(4),
            materialAndOrientationU8: z.literal(5),
            headIndexI16: z.literal(6),
            headKindU8: z.literal(8),
            climateOffsetI16: z.literal(9),
            jobFlagsU8: z.literal(11),
            revealFactorU8: z.literal(12),
            rawByte13U8: z.literal(13),
          })
          .passthrough(),
        rawWaterHeight: i16,
        serializedPhysicalWaterHeight: i32,
        loadedPhysicalWaterHeight: i32,
        climate: i16,
        solarGeneration: i16,
        climateCenter: point,
        zoneCount: u8,
        zones: z
          .array(
            z
              .object({
                index: z.number().int().min(0).max(3),
                sourceOffset: z.number().int(),
                center: point,
                selector: u8,
                rawByte5: u8,
                radius: i32,
                initialQuota: i32,
                remainingQuota: i32,
                rawByte18: u8,
              })
              .passthrough(),
          )
          .max(4),
        unknown: unknowns,
      })
      .passthrough(),
    pools: z.array(PoolSchema).length(8),
    specialistInputs: z.record(z.unknown()),
    blueprintRules: NumericRulesSchema,
    extensionBase64: bytes(6900),
    unknown: unknowns,
  })
  .passthrough()
  .superRefine((startup, ctx) => {
    if (new Set(startup.pools.map((pool) => pool.family)).size !== 8)
      ctx.addIssue({
        code: "custom",
        path: ["pools"],
        message: "All eight distinct source pool families are required",
      });
    for (let i = 0; i < 4; i++) {
      if (
        startup.players[i].slot !== i ||
        startup.players[i].sourceOffset !== 20 + i * 1805
      )
        ctx.addIssue({
          code: "custom",
          path: ["players", i],
          message: "Source player order/extent mismatch",
        });
    }
    const expectedAtlas =
      ["B32A", "B32B", "B32C", "B32D"][startup.terrain.atlasSelector] ?? null;
    if (
      startup.terrain.atlasResource !== expectedAtlas ||
      startup.terrain.loadedPhysicalWaterHeight !==
        startup.terrain.rawWaterHeight * 2
    )
      ctx.addIssue({
        code: "custom",
        path: ["terrain"],
        message: "Terrain loader metadata mismatch",
      });
    if (
      startup.context.campaignFundsBeforeEngineerCosts !==
      startup.context.missionFundUnits * 100
    )
      ctx.addIssue({
        code: "custom",
        path: ["context"],
        message: "Mission fund-unit conversion mismatch",
      });
  });
export type Startup = z.infer<typeof StartupSchema>;

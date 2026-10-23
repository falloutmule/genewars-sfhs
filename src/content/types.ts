import { z } from "zod";
import { StartupSchema } from "./startup";
import { OriginalRulesSchema } from "./rules";
import { BuildingRulesSchema } from "./building-rules";
import { StrategicAIRulesSchema } from "./strategic-ai";
import { EconomyRulesSchema } from "./economy";
import { EcologyRulesSchema } from "./ecology";
import { AudioProfileSchema } from "./audio";
import { SpecialistVoiceProfileSchema } from "./specialist-voice";
import { ZoneRulesSchema, EtherealRulesSchema } from "./zones";
export const MissionSchema = z.object({
  id: z.number().int().min(1).max(24),
  name: z.string(),
  width: z.literal(128),
  height: z.literal(128),
  cells: z
    .array(
      z.tuple([
        z.number().int(),
        z.number().int().min(0).max(255),
        z.number().int().min(0).max(255),
      ]),
    )
    .length(16384),
  target: z.tuple([
    z.number().int().min(0).max(65535),
    z.number().int().min(0).max(65535),
  ]),
  sourceSeed: z.number().int().nullable(),
  runtimeStatus: z.string(),
  briefing: z.string(),
  unknown: z.array(z.string()),
  sourceSha256: z.string().optional(),
  headerSha256: z.string().optional(),
  startup: StartupSchema.optional(),
});
export type Mission = z.infer<typeof MissionSchema>;
export const AssetSchema = z.object({
  kind: z.enum(["terrain", "interface", "animation"]),
  image: z.string().startsWith("data:image/png;base64,"),
  sprites: z
    .array(z.tuple([z.number(), z.number(), z.number(), z.number()]))
    .optional(),
  frames: z
    .array(
      z.object({
        components: z.array(
          z.tuple([z.number(), z.number(), z.number(), z.number(), z.number()]),
        ),
        sourceComponents: z
          .array(
            z.tuple([
              z.number().int(),
              z.number().int(),
              z.number().int(),
              z.number().int(),
              z.number().int(),
            ]),
          )
          .optional(),
        sourceSize: z.tuple([z.number().int(), z.number().int()]).optional(),
        width: z.number(),
        height: z.number(),
        rawFlags: z.array(z.number()),
      }),
    )
    .optional(),
  animations: z
    .array(
      z.object({
        first: z.number(),
        last: z.number(),
        rawTrailingWord: z.number(),
      }),
    )
    .optional(),
  paletteMode: z.string().optional(),
  paletteAtlases: z
    .record(z.string().startsWith("data:image/png;base64,"))
    .optional(),
  packed4: z
    .object({
      indices: z.string(),
      opacity: z.string(),
      pixelSha256: z.string(),
    })
    .passthrough()
    .optional(),
});
export type Asset = z.infer<typeof AssetSchema>;
export const PackSchema = z
  .object({
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    importerVersion: z.string(),
    kind: z.enum(["original-private", "synthetic"]),
    source: z.object({
      variant: z.string(),
      sha256: z.string().nullable(),
      executableSha256: z.string().optional(),
    }),
    manifest: z.array(
      z.object({ path: z.string(), size: z.number(), sha256: z.string() }),
    ),
    missions: z.array(MissionSchema),
    assets: z.record(AssetSchema),
    sounds: z.record(z.string().startsWith("data:audio/wav;base64,")),
    texts: z.array(z.string()),
    rules: OriginalRulesSchema.optional(),
    buildingRules: BuildingRulesSchema.optional(),
    strategicAIRules: StrategicAIRulesSchema.optional(),
    economyRules: EconomyRulesSchema.optional(),
    ecologyRules: EcologyRulesSchema.optional(),
    effectRules: z
      .object({
        schemaVersion: z.literal(1),
        descriptors: z
          .array(
            z.object({
              code: z.number().int().min(0).max(70),
              retirementMode: z.number().int().min(0).max(255),
              gravity: z.boolean(),
              priority: z.number().int().min(0).max(255),
              childCode: z.number().int().min(0).max(255).nullable(),
              movable: z.boolean(),
              waterResponse: z.boolean(),
            }),
          )
          .length(71)
          .refine(
            (rows) => rows.every((row, index) => row.code === index),
            "Expected ordered source effect descriptors",
          ),
        provenance: z
          .object({
            executableSha256: z.string().length(64),
            originalExecution: z.literal(false),
          })
          .passthrough(),
      })
      .optional(),
    geneticistRules: z
      .object({
        schemaVersion: z.literal(1),
        revealRadii: z
          .array(z.number().int().min(-2147483648).max(2147483647))
          .length(4),
        projectiles: z
          .array(
            z.object({
              speedWord: z.number().int().min(-32768).max(32767),
              rangeFactor: z.number().int().min(-32768).max(32767),
              cooldown: z.number().int().min(-32768).max(32767),
              effectCode: z.number().int().min(0).max(255),
            }),
          )
          .length(3),
        effectDescriptors: z
          .array(
            z.object({
              code: z.number().int().min(0).max(255),
              completion: z.number().int().min(0).max(255),
              gravity: z.boolean(),
              priority: z.number().int().min(0).max(255),
              childCode: z.number().int().min(0).max(255).nullable(),
              obstacle: z.boolean(),
              water: z.boolean(),
            }),
          )
          .length(4),
        provenance: z
          .object({
            executableSha256: z.string().length(64),
            originalExecution: z.literal(false),
          })
          .passthrough(),
      })
      .optional(),
    craterRules: z
      .object({
        schemaVersion: z.literal(1),
        largeTextures: z.array(z.number().int().min(0).max(255)).length(9),
        largeFlags: z.array(z.number().int().min(0).max(255)).length(9),
        provenance: z
          .object({
            executableSha256: z.string().length(64),
            originalExecution: z.literal(false),
          })
          .passthrough(),
      })
      .optional(),
    audioProfile: AudioProfileSchema.optional(),
    specialistVoiceProfile: SpecialistVoiceProfileSchema.optional(),
    zoneRules: ZoneRulesSchema.optional(),
    etherealRules: EtherealRulesSchema.optional(),
    palettes: z
      .object({
        mainRgb8: z
          .array(
            z.tuple([
              z.number().int().min(0).max(255),
              z.number().int().min(0).max(255),
              z.number().int().min(0).max(255),
            ]),
          )
          .length(256),
        fadeBase64: z
          .string()
          .refine((v) => v.length === 21848, "Expected64x256 fade bytes"),
        fadeSha256: z.string().length(64),
      })
      .optional(),
    unknown: z.array(
      z.object({ path: z.string(), reason: z.string() }).passthrough(),
    ),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.missions.map((m) => m.id)).size !== p.missions.length)
      ctx.addIssue({ code: "custom", message: "duplicate mission id" });
    if (p.kind === "original-private" && p.missions.length !== 24)
      ctx.addIssue({
        code: "custom",
        message: "original pack requires 24 mission pairs",
      });
  });
export type Pack = z.infer<typeof PackSchema>;

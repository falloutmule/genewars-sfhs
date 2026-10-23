import { z } from "zod";
const integers = (length: number, min: number, max: number) =>
  z.array(z.number().int().min(min).max(max)).length(length);
export const OriginalRulesSchema = z.object({
  schemaVersion: z.literal(1),
  tables: z
    .object({
      terrainCornerPatterns: integers(640, 0, 255),
      terrainBorder: integers(8192, 0, 255),
      atan: integers(257, 0, 256),
      bounce: integers(8, -32768, 32767),
      constructionCosts: integers(14, -0x80000000, 0x7fffffff),
      sine: integers(2048, -65536, 65536),
      cosine: integers(2048, -65536, 65536),
      actorClassSpeeds: integers(4, -32768, 32767),
      blueprintStat17Caps: integers(4, 0, 255),
      blueprintStat19Caps: integers(4, 0, 255),
      actorResourceNames: z.array(z.string().min(1).max(28)).length(16),
      buildingMenuOrder: integers(14, 0, 13),
      buildingHealth: integers(42, -32768, 32767),
      buildingProgressThresholds: integers(42, 0, 255),
      buildingFootprints: integers(14, 0, 255),
      buildingNameIndices: integers(14, 0, 255).optional(),
      buildingPrerequisites: integers(14, 0, 255),
    })
    .passthrough(),
  provenance: z
    .object({
      executableSha256: z.string().length(64),
      originalExecution: z.literal(false),
    })
    .passthrough(),
});
export type OriginalRules = z.infer<typeof OriginalRulesSchema>;

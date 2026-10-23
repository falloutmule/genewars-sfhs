import { z } from "zod";
/** Numeric metadata only; possession does not admit unimplemented AI services. */
export const StrategicAIRulesSchema = z.object({
  schemaVersion: z.literal(1),
  groupLimits: z.array(z.number().int().min(0).max(255)).length(6),
  buildingValues: z.array(z.tuple([
    z.number().int().min(-32768).max(32767),
    z.number().int().min(-32768).max(32767),
    z.number().int().min(-32768).max(32767),
  ])).length(14).optional(),
  buildingThreatValues: z.array(z.tuple([
    z.number().int().min(-32768).max(32767),
    z.number().int().min(-32768).max(32767),
    z.number().int().min(-32768).max(32767),
  ])).length(14).optional(),
  specialistThreatWeights: z.array(z.number().int().min(0).max(255)).length(4).optional(),
  speciesGenes: z
    .array(
      z.tuple([
        z.number().int().min(0).max(255),
        z.number().int().min(0).max(255),
      ]),
    )
    .length(25)
    .optional(),
  productionWeights: z
    .array(
      z.tuple([
        z.number().int().min(0).max(255),
        z.number().int().min(0).max(255),
        z.number().int().min(0).max(255),
        z.number().int().min(0).max(255),
        z.number().int().min(0).max(255),
      ]),
    )
    .length(25)
    .optional(),
  provenance: z
    .object({
      executableSha256: z.string().length(64),
      originalExecution: z.literal(false),
    })
    .passthrough(),
});

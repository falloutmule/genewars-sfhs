import { z } from "zod";
const i32 = z.number().int().min(-0x80000000).max(0x7fffffff);
const provenance = z
  .object({
    executableSha256: z.string().length(64),
    originalExecution: z.literal(false),
  })
  .passthrough();
export const ZoneRulesSchema = z.object({
  schemaVersion: z.literal(1),
  speciesComponents: z
    .array(
      z.tuple([z.number().int().min(0).max(4), z.number().int().min(0).max(4)]),
    )
    .length(25),
  zoneTextIndices: z.array(z.number().int().min(0).max(255)).length(14),
  terrainLightVector: z.tuple([i32, i32, i32]),
  provenance,
});
export const EtherealRulesSchema = z.object({
  schemaVersion: z.literal(1),
  observationThresholds: z.array(i32).length(3),
  provenance,
});

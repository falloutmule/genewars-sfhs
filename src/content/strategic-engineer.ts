import { z } from "zod";
/** Numeric390D0 priorities; this does not admit an opponent host. */
export const StrategicEngineerRulesSchema = z.object({
  schemaVersion: z.literal(1),
  priorities: z.array(z.tuple([
    z.number().int().min(0).max(255), z.number().int().min(0).max(255), z.number().int().min(0).max(255),
  ])).length(14),
  provenance: z.object({ executableSha256: z.string().length(64), originalExecution: z.literal(false) }).passthrough(),
});

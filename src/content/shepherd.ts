import { z } from "zod";
export const ShepherdRulesSchema = z.object({
  schemaVersion: z.literal(1),
  projectiles: z.array(z.object({
    speedWord: z.number().int().min(-32768).max(32767),
    rangeFactor: z.number().int().min(-32768).max(32767),
    cooldown: z.number().int().min(-32768).max(32767),
    effectCode: z.number().int().min(37).max(43),
  })).length(7).superRefine((rows, c) => {
    rows.forEach((row, i) => { if (row.effectCode !== 37 + i) c.addIssue({ code: z.ZodIssueCode.custom, path: [i, "effectCode"], message: "Source projectile row/code order differs" }); });
  }),
  provenance: z.object({ executableSha256: z.string().length(64), originalExecution: z.literal(false) }).passthrough(),
});

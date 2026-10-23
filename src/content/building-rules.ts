import { z } from "zod";
export const BuildingRulesSchema = z
  .object({
    schemaVersion: z.literal(1),
    resources: z
      .array(
        z.object({
          selector: z.number().int().min(0).max(13),
          path: z.string().min(1),
          assetKey: z.string().min(1),
        }),
      )
      .length(13)
      .refine(
        (rows) => new Set(rows.map((row) => row.selector)).size === 13,
        "Unique building resource selectors required",
      ),
    unsupportedSelectors: z.array(z.number().int().min(0).max(13)).length(1),
    upkeep: z.array(z.number().int().min(0).max(255)).length(14),
    processingFrontOffset: z.tuple([
      z.number().int().min(-32768).max(32767),
      z.number().int().min(-32768).max(32767),
    ]),
    provenance: z
      .object({
        executableSha256: z.string().length(64),
        originalExecution: z.literal(false),
      })
      .passthrough(),
  })
  .refine(
    (p) =>
      !p.resources.some((row) => p.unsupportedSelectors.includes(row.selector)),
    "Supported and unsupported building selectors overlap",
  );

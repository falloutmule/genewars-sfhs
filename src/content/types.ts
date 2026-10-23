import { z } from "zod";
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
});
export type Asset = z.infer<typeof AssetSchema>;
export const PackSchema = z
  .object({
    schemaVersion: z.literal(1),
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

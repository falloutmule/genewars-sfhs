import { z } from "zod";

const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const i16 = z.number().int().min(-32768).max(32767);
const holds = z.array(z.number().int().min(0).max(255)).length(20);
const animation = z.object({
  grade: z.number().int().min(0).max(2),
  action: z.number().int().min(1).max(3),
  resource: z.literal("BMINE.ANB"),
  resourceSha256: sha256,
  resourceBytes: z.literal(34955),
  frameTableOffset: z.literal(33981),
  animationTableOffset: z.literal(34905),
  firstFrameOffset: z.number().int().nonnegative(),
  lastFrameOffset: z.number().int().nonnegative(),
  frameStride: z.literal(14),
  holdByteOffsetWithinFrame: z.literal(10),
  flags: z.literal(0),
});

/** Additive admission for the complete native11 callback. The historical
 * economy profile remains a distinct grade0 compatibility contract. */
export const ExtractorRulesSchema = z
  .object({
    schemaVersion: z.literal(1),
    contactOffset: z.tuple([i16, i16]),
    frameHolds: z.tuple([holds, holds, holds]),
    provenance: z.object({
      sourceVersion: z.string().min(1),
      executableSha256: sha256,
      originalExecution: z.literal(false),
      contactOffset: z.object({
        object: z.literal(3),
        objectOffset: z.literal(0x4574),
        bytes: z.literal(4),
        sha256,
      }),
      animationProfiles: z.tuple([animation, animation, animation]),
    }),
  })
  .superRefine((rules, context) => {
    for (let grade = 0; grade < 3; grade++) {
      const profile = rules.provenance.animationProfiles[grade],
        first = (3 + grade * 20) * 14;
      if (
        profile.grade !== grade ||
        profile.action !== grade + 1 ||
        profile.firstFrameOffset !== first ||
        profile.lastFrameOffset !== first + 19 * 14
      )
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["provenance", "animationProfiles", grade],
          message:
            "Extractor grade/action and admitted running-frame geometry must agree",
        });
    }
  });
export type ExtractorRules = z.infer<typeof ExtractorRulesSchema>;

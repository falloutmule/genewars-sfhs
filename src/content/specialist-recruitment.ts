import { z } from "zod";

/**80830's associated-building landing point, distinct from processing fronts. */
export const SpecialistRecruitmentRulesSchema = z.object({
  schemaVersion: z.literal(1),
  associatedLandingOffset: z.tuple([
    z.number().int().min(-32768).max(32767),
    z.number().int().min(-32768).max(32767),
  ]),
  landingSite: z.object({
    directionIndices: z.array(z.number().int().min(0).max(8)).length(8),
    directions: z.array(z.tuple([
      z.number().int().min(-32768).max(32767),
      z.number().int().min(-32768).max(32767),
    ])).length(9),
    textures: z.array(z.number().int().min(0).max(255)).length(9),
    orientations: z.array(z.number().int().min(0).max(255)).length(9),
  }).optional(),
  provenance: z.object({
    executableSha256: z.string().length(64),
    originalExecution: z.literal(false),
    associatedLandingOffset: z.object({
      object: z.literal(3),
      objectOffset: z.literal(0x124f0),
      bytes: z.literal(4),
      sha256: z.string().length(64),
    }).passthrough(),
    landingSite: z.object({
      directionIndices: z.object({ object: z.literal(3), objectOffset: z.literal(0x4e0c), bytes: z.literal(8), sha256: z.string().length(64) }).passthrough(),
      directions: z.object({ object: z.literal(3), objectOffset: z.literal(0x4564), bytes: z.literal(36), sha256: z.string().length(64) }).passthrough(),
      textures: z.object({ object: z.literal(3), objectOffset: z.literal(0x4e54), bytes: z.literal(18), sha256: z.string().length(64) }).passthrough(),
      orientations: z.object({ object: z.literal(3), objectOffset: z.literal(0x4e68), bytes: z.literal(9), sha256: z.string().length(64) }).passthrough(),
    }).optional(),
  }).passthrough(),
});

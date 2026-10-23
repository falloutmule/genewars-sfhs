import { z } from "zod";
const byte = z.number().int().min(0).max(255),
  word = z.number().int().min(-32768).max(32767);
export const EcologyRulesSchema = z.object({
  schemaVersion: z.literal(1),
  plants: z
    .array(
      z.object({
        selector: byte,
        growthDeltas: z.array(z.number().int().min(-128).max(127)).length(8),
        spreadPeriod: byte,
        walkSteps: byte,
        crowdingLimit: byte,
        checkThreshold: byte,
        nutrition: byte,
        retirementDelay: byte,
        opaqueBytes: z.array(byte).length(18),
        rowSha256: z.string().length(64),
      }),
    )
    .length(12),
  spreadDirections: z.array(z.tuple([word, word])).length(9),
  corpseFriction: z.array(word).length(8).optional(),
  speciesTraits: z.array(z.array(byte).length(45)).length(25).optional(),
  attackChannels: z
    .array(z.number().int().min(-128).max(127))
    .length(5)
    .optional(),
  muleCombat: z
    .object({
      queryRadius: z.number().int().min(-0x80000000).max(0x7fffffff),
      attack: byte,
      defense: byte,
      disposition: byte,
      attackChannel: z.number().int().min(-128).max(127),
      foodWeights: z.tuple([byte, byte, byte]),
    })
    .optional(),
  plantResources: z
    .array(z.object({ selector: byte, path: z.string(), assetKey: z.string() }))
    .length(12),
  mule: z.object({
    selector: z.literal(4),
    baseSpeed: word,
    lifetimeScale: word,
    reserveScale: word,
    healthScale: word,
    healthRecoveryPeriod: word,
    warmThreshold: word,
  }),
  provenance: z
    .object({
      executableSha256: z.string().length(64),
      originalExecution: z.literal(false),
    })
    .passthrough(),
});

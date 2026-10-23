import { z } from "zod";
const integer = z.number().int();
const positive = integer.positive();
const nonnegative = integer.nonnegative();
const grades = z.tuple([integer, integer, integer]);
export const EconomyRulesSchema = z
  .object({
    evidence: z.string().min(1),
    cellSize: positive,
    power: z.object({
      distributorGeneration: grades,
      distributorRange: grades,
      distributorCapacity: positive,
      distributorPulsePeriod: positive,
      distributorPulsePhase: grades,
      photonReleaseThreshold: nonnegative,
      photonReleaseAmount: positive,
      packetPayloadCap: positive,
      consumerCapacity: positive,
      deliveryRadius: positive,
      noPowerWarningTicks: positive,
      noPowerWarningCooldownTicks: positive,
    }),
    extractor: z.object({
      upkeep: nonnegative,
      harvestRadius: positive,
      harvestUnits: grades,
      goopPerResource: positive,
      cycleLength: positive,
      startFrame: nonnegative,
      resetFrame: nonnegative,
      harvestFrames: z.array(nonnegative),
      workDelay: positive,
      harvestExtraDrain: nonnegative,
      frameHolds: z.tuple([
        z.array(nonnegative).min(1),
        z.array(nonnegative),
        z.array(nonnegative),
      ]),
    }),
    capacity: z.object({
      extractor: nonnegative,
      store4: grades,
      store13: grades,
      unusedGoopWarningTicks: positive,
    }),
  })
  .passthrough();

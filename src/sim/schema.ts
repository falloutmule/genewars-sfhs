import { z } from "zod";
export const ENGINE_VERSION = "0.1.0-workbench";
const nat = z.number().int().nonnegative().max(0x7fffffff);
const coord = z.number().int().min(0).max(127);
const base = { tick: nat, playerId: z.literal(0), sequence: nat };
export const CommandSchema = z.discriminatedUnion("type", [
  z.object({
    ...base,
    type: z.literal("move"),
    actorIds: z.array(nat).min(1).max(64),
    x: coord,
    y: coord,
    queued: z.boolean(),
  }),
  z.object({
    ...base,
    type: z.literal("construct"),
    actorId: nat,
    selector: z.union([z.literal(11), z.literal(3), z.literal(6)]),
    x: coord,
    y: coord,
    queued: z.boolean(),
  }),
]);
export type Command = z.infer<typeof CommandSchema>;
export const OrderSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), x: coord, y: coord }),
  z.object({
    type: z.literal("construct"),
    x: coord,
    y: coord,
    selector: z.union([z.literal(11), z.literal(3), z.literal(6)]),
    buildingId: nat.nullable(),
  }),
]);
export const WorldSchema = z
  .object({
    engineVersion: z.literal(ENGINE_VERSION),
    contentHash: z.string().min(1),
    missionId: z.number().int().min(1).max(24),
    mode: z.enum(["synthetic", "construction-workbench"]),
    tick: nat,
    nextId: nat,
    nextSequence: nat,
    seed: nat,
    status: z.enum(["active", "workbench-complete"]),
    goop: z.number().int().min(-1000000).max(1000000),
    completed: z.record(nat),
    ownedSelectors: z.array(nat),
    pending: z.array(CommandSchema).max(10000),
    specialists: z
      .array(
        z.object({
          id: nat,
          owner: z.literal(0),
          role: z.enum(["Engineer", "Geneticist"]),
          x: coord,
          y: coord,
          skill: z.number().int().min(-128).max(127),
          orders: z.array(OrderSchema).max(32),
          route: z.array(z.tuple([coord, coord])).max(16384),
          reason: z.string(),
        }),
      )
      .max(16),
    buildings: z
      .array(
        z.object({
          id: nat,
          selector: z.union([z.literal(11), z.literal(3), z.literal(6)]),
          x: coord,
          y: coord,
          remaining: nat,
          hp: nat,
          complete: z.boolean(),
          reason: z.string(),
        }),
      )
      .max(512),
    blocked: z.array(z.number().int().min(0).max(16383)).max(16384),
    alerts: z
      .array(
        z.object({
          tick: nat,
          severity: z.enum(["info", "warning", "critical"]),
          cause: z.string(),
          subject: z.string(),
          count: nat,
          x: coord,
          y: coord,
        }),
      )
      .max(50),
  })
  .strict();
export type World = z.infer<typeof WorldSchema>;
export type Order = z.infer<typeof OrderSchema>;

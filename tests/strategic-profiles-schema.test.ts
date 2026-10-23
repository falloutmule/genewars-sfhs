import { describe, expect, it } from "vitest";
import { StrategicEngineerRulesSchema } from "../src/content/strategic-engineer";
import { CreatureCommandRulesSchema } from "../src/content/creature-command";
const provenance = { executableSha256: "0".repeat(64), originalExecution: false };
describe("strategic command metadata admission", () => {
  it("requires all fourteen unsigned Engineer priority rows", () => {
    const valid = { schemaVersion: 1, priorities: Array.from({ length: 14 }, () => [0, 128, 255]), provenance };
    expect(StrategicEngineerRulesSchema.parse(valid).priorities[0]).toEqual([0, 128, 255]);
    expect(StrategicEngineerRulesSchema.safeParse({ ...valid, priorities: valid.priorities.slice(1) }).success).toBe(false);
    expect(StrategicEngineerRulesSchema.safeParse({ ...valid, priorities: valid.priorities.map(() => [-1, 0, 0]) }).success).toBe(false);
  });
  it("requires signed corpse coordinates and exact numeric source range metadata", () => {
    const valid = { schemaVersion: 1, corpseDepositOffset: [-32768, 32767], footprintSearchOffsets: Array.from({ length: 9 }, () => [0, 0]),
      provenance: { ...provenance,
      corpseDepositOffset: { object: 3, objectOffset: 0x457c, bytes: 4, sha256: "1".repeat(64) },
      footprintSearchOffsets: { object: 3, orderOffset: 0x60b8, orderBytes: 9, orderSha256: "2".repeat(64),
        indexedBase: 0x4564, joinedBytes: 36, sha256: "3".repeat(64) } } };
    expect(CreatureCommandRulesSchema.parse(valid).corpseDepositOffset).toEqual([-32768, 32767]);
    expect(CreatureCommandRulesSchema.safeParse({ ...valid, corpseDepositOffset: [32768, 0] }).success).toBe(false);
    expect(CreatureCommandRulesSchema.safeParse({ ...valid, provenance: { ...valid.provenance,
      corpseDepositOffset: { ...valid.provenance.corpseDepositOffset, bytes: 8 } } }).success).toBe(false);
  });
});

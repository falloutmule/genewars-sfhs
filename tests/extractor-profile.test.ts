import { describe, expect, it } from "vitest";
import { ExtractorRulesSchema } from "../src/content/extractor";
import { PackSchema } from "../src/content/types";
import { campaignFixture } from "./fixtures/campaign";

function fixture() {
  return {
    schemaVersion: 1 as const,
    contactOffset: [-17, 321],
    frameHolds: Array.from({ length: 3 }, (_, grade) =>
      Array.from({ length: 20 }, (_, frame) => (grade + frame * 7) % 13),
    ),
    provenance: {
      sourceVersion: "synthetic-extractor-profile",
      executableSha256: "0".repeat(64),
      originalExecution: false,
      contactOffset: {
        object: 3,
        objectOffset: 0x4574,
        bytes: 4,
        sha256: "0".repeat(64),
      },
      animationProfiles: Array.from({ length: 3 }, (_, grade) => ({
        grade,
        action: grade + 1,
        resource: "BMINE.ANB",
        resourceSha256: "0".repeat(64),
        resourceBytes: 34955,
        frameTableOffset: 33981,
        animationTableOffset: 34905,
        firstFrameOffset: (3 + grade * 20) * 14,
        lastFrameOffset: (22 + grade * 20) * 14,
        frameStride: 14,
        holdByteOffsetWithinFrame: 10,
        flags: 0,
      })),
    },
  };
}

describe("additive complete Extractor profile admission", () => {
  it("keeps the old profile and absent new field intact, while admitting a separate full profile", () => {
    const pack = campaignFixture(),
      legacy = structuredClone(pack.economyRules);
    const old = PackSchema.parse(pack);
    expect(Object.hasOwn(old, "extractorRules")).toBe(false);
    expect(old.economyRules).toEqual(legacy);
    pack.extractorRules = ExtractorRulesSchema.parse(fixture());
    const parsed = PackSchema.parse(pack);
    expect(parsed.extractorRules).toEqual(fixture());
    expect(parsed.economyRules).toEqual(legacy);
    expect(
      ExtractorRulesSchema.parse(
        JSON.parse(JSON.stringify(parsed.extractorRules)),
      ),
    ).toEqual(parsed.extractorRules);
  });

  it.each([
    "missing-grade",
    "short-holds",
    "bad-hold",
    "bad-coordinate",
    "duplicate-grade",
    "wrong-action",
    "wrong-range",
    "wrong-span",
    "bad-digest",
    "executed",
  ])("rejects inconsistent profile %s", (kind) => {
    const p = fixture();
    if (kind === "missing-grade") p.frameHolds.pop();
    if (kind === "short-holds") p.frameHolds[1].pop();
    if (kind === "bad-hold") p.frameHolds[2][19] = 256;
    if (kind === "bad-coordinate") p.contactOffset[1] = 32768;
    if (kind === "duplicate-grade") p.provenance.animationProfiles[2].grade = 1;
    if (kind === "wrong-action") p.provenance.animationProfiles[1].action = 1;
    if (kind === "wrong-range")
      p.provenance.animationProfiles[1].firstFrameOffset += 14;
    if (kind === "wrong-span") p.provenance.contactOffset.objectOffset++;
    if (kind === "bad-digest") p.provenance.executableSha256 = "not-a-digest";
    if (kind === "executed") p.provenance.originalExecution = true;
    expect(ExtractorRulesSchema.safeParse(p).success).toBe(false);
  });
});

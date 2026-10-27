import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  admitPackRuleExtension,
  ruleBytesSha256,
  ruleExtensionIdentity,
} from "../src/content/rule-extension";
import { createCampaign } from "../src/sim/campaign/world";
import {
  loadCampaign,
  saveCampaign,
  recordCampaign,
  replayCampaign,
  sealCampaignReplay,
  recoverCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
const baseHash = "1".repeat(64),
  extensionHash = "2".repeat(64);
const source =
  "4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba";
/** Deliberately synthetic values: they MUST fail original numeric admission. */
function fixture() {
  const base = campaignFixture();
  base.kind = "original-private";
  base.source.executableSha256 = source;
  const span = (
    objectOffset: number,
    bytes: number,
    sha256 = "0".repeat(64),
  ) => ({ object: 3, objectOffset, bytes, sha256 });
  const manifest = {
    schemaVersion: 1,
    basePackSha256: baseHash,
    profiles: {
      specialistRecruitmentRules: {
        schemaVersion: 1,
        associatedLandingOffset: [300, -600],
        landingSite: {
          directionIndices: Array(8).fill(0),
          directions: Array.from({ length: 9 }, () => [0, 0]),
          textures: Array(9).fill(0),
          orientations: Array(9).fill(0),
        },
        provenance: {
          executableSha256: source,
          originalExecution: false,
          associatedLandingOffset: span(
            0x124f0,
            4,
            "4737857dac75cb2770fca5c42ecc29996a7656b68c84bc14064a35b16fc3f117",
          ),
          landingSite: {
            directionIndices: span(0x4e0c, 8),
            directions: span(0x4564, 36),
            textures: span(0x4e54, 18),
            orientations: span(0x4e68, 9),
          },
        },
      },
    },
  };
  return { base, manifest };
}
async function admit(
  base: ReturnType<typeof campaignFixture>,
  manifest: unknown,
  hash = baseHash,
) {
  const text = JSON.stringify(manifest),
    digest = await ruleBytesSha256(new TextEncoder().encode(text));
  return admitPackRuleExtension(base, hash, text, digest);
}
describe("separately hashed additive numeric rules", () => {
  it("rejects an unverified ICE profile and a missing palette", async () => {
    const { base } = fixture();
    const manifest = {
      schemaVersion: 1,
      basePackSha256: baseHash,
      profiles: {
        packed4Ice: {
          dataBase64: btoa(String.fromCharCode(...new Uint8Array(6144))),
          decodedSha256: "0".repeat(64),
          mainRgbSha256: "0".repeat(64),
        },
      },
    };
    await expect(admit(base, manifest)).rejects.toThrow(
      "requires existing palette",
    );
    base.palettes = {
      mainRgb8: Array.from({ length: 256 }, () => [0, 0, 0]),
      fadeBase64: "A".repeat(21848),
      fadeSha256: "0".repeat(64),
    };
    await expect(admit(base, manifest)).rejects.toThrow("hash mismatch");
  });
  it("binds both exact hashes under a separate deterministic content identity", async () => {
    const a = await ruleExtensionIdentity(baseHash, extensionHash);
    expect(a).toEqual(await ruleExtensionIdentity(baseHash, extensionHash));
    expect(a.contentHash).not.toBe(baseHash);
    expect(
      (await ruleExtensionIdentity(baseHash, "3".repeat(64))).contentHash,
    ).not.toBe(a.contentHash);
    expect(
      (await ruleExtensionIdentity("3".repeat(64), extensionHash)).contentHash,
    ).not.toBe(a.contentHash);
  });
  it("rejects tampered bytes and a different base pack", async () => {
    const { base, manifest } = fixture();
    await expect(
      admitPackRuleExtension(
        base,
        baseHash,
        JSON.stringify(manifest),
        extensionHash,
      ),
    ).rejects.toThrow("hash mismatch");
    await expect(admit(base, manifest, "3".repeat(64))).rejects.toThrow(
      "different base pack",
    );
  });
  it("rejects replacing existing profiles and adding assets or unknown profiles", async () => {
    const { base, manifest } = fixture();
    await expect(admit(base, { ...manifest, assets: {} })).rejects.toThrow();
    await expect(
      admit(base, {
        ...manifest,
        profiles: { ...manifest.profiles, unknownRules: {} },
      }),
    ).rejects.toThrow();
    base.specialistRecruitmentRules = manifest.profiles
      .specialistRecruitmentRules as never;
    await expect(admit(base, manifest)).rejects.toThrow(
      "replace an existing profile",
    );
  });
  it("requires the same source variant and actual numeric hashes, not claimed provenance", async () => {
    const { base, manifest } = fixture(),
      before = structuredClone(base);
    await expect(admit(base, manifest)).rejects.toThrow(
      "numeric span hash mismatch: associatedLandingOffset",
    );
    expect(base).toEqual(before);
    base.source.executableSha256 = "3".repeat(64);
    await expect(admit(base, manifest)).rejects.toThrow(
      "admitted source executable",
    );
  });
  it("rejects oversized extensions before parsing", async () => {
    await expect(
      admitPackRuleExtension(
        campaignFixture(),
        baseHash,
        " ".repeat(65537),
        extensionHash,
      ),
    ).rejects.toThrow("exceeds64KB");
  });
});
describe("verified base-save identity migration", () => {
  const session = { paused: true, speed: 1 as const, accumulator: 0 };
  it("changes only contentHash after verifying the complete genuine input checksum", async () => {
    const pack = campaignFixture(),
      world = createCampaign(pack, baseHash),
      text = saveCampaign(world, session),
      identity = await ruleExtensionIdentity(baseHash, extensionHash);
    const migrated = loadCampaign(text, identity.contentHash, identity),
      expected = structuredClone(world);
    expected.contentHash = identity.contentHash;
    expect(migrated.world).toEqual(expected);
    expect(migrated.session).toEqual(session);
    expect(migrated.checksum).toBe(
      checksum({ world: migrated.world, session }),
    );
    expect(
      loadCampaign(saveCampaign(migrated.world, session), identity.contentHash)
        .world,
    ).toEqual(expected);
    expect(JSON.parse(text).world).toEqual(world);
  });
  it("never accepts damaged state, another pack, or an identity for another artifact", async () => {
    const world = createCampaign(campaignFixture(), baseHash),
      text = saveCampaign(world, session),
      identity = await ruleExtensionIdentity(baseHash, extensionHash);
    expect(() => loadCampaign(text, identity.contentHash)).toThrow();
    expect(() => loadCampaign(text, "3".repeat(64), identity)).toThrow(
      "identity mismatch",
    );
    const bad = JSON.parse(text);
    bad.world.players[0].funds++;
    expect(() =>
      loadCampaign(JSON.stringify(bad), identity.contentHash, identity),
    ).toThrow("checksum mismatch");
    const other = createCampaign(campaignFixture(), "3".repeat(64));
    expect(() =>
      loadCampaign(
        saveCampaign(other, session),
        identity.contentHash,
        identity,
      ),
    ).toThrow();
  });
  it("uses the composite identity for future replay and recovery without relaxing old replay checks", async () => {
    const pack = campaignFixture(),
      world = createCampaign(pack, baseHash),
      text = saveCampaign(world, session),
      old = sealCampaignReplay(recordCampaign(world, null), world),
      identity = await ruleExtensionIdentity(baseHash, extensionHash);
    const migrated = loadCampaign(text, identity.contentHash, identity).world;
    expect(
      checksum(
        replayCampaign(
          sealCampaignReplay(recordCampaign(migrated, null), migrated),
          pack,
          identity.contentHash,
        ),
      ),
    ).toBe(checksum(migrated));
    expect(() => replayCampaign(old, pack, identity.contentHash)).toThrow();
    const storage = {
      getItem: (key: string) =>
        key === "gw:campaign:recovery:0" ? text : null,
    } as Storage;
    expect(
      recoverCampaign(storage, identity.contentHash, identity)?.world,
    ).toEqual(migrated);
    expect(recoverCampaign(storage, identity.contentHash)).toBeNull();
  });
});

describe("verified predecessor save identities", () => {
  const session = { paused: true, speed: 1 as const, accumulator: 0 };
  it("changes only identity for an admitted predecessor and rejects arbitrary old hashes", async () => {
    const prior = await ruleExtensionIdentity(baseHash, extensionHash),
      next = await ruleExtensionIdentity(baseHash, "4".repeat(64)),
      identity = { ...next, compatibleContentHashes: [prior.contentHash] },
      world = createCampaign(campaignFixture(), prior.contentHash),
      text = saveCampaign(world, session),
      expected = structuredClone(world);
    expected.contentHash = identity.contentHash;
    expect(loadCampaign(text, identity.contentHash, identity).world).toEqual(
      expected,
    );
    expect(() => loadCampaign(text, identity.contentHash, next)).toThrow();
    const bad = JSON.parse(text);
    bad.world.players[0].funds++;
    expect(() =>
      loadCampaign(JSON.stringify(bad), identity.contentHash, identity),
    ).toThrow(/checksum/);
    const replay = sealCampaignReplay(recordCampaign(world, null), world);
    expect(() =>
      replayCampaign(replay, campaignFixture(), identity.contentHash),
    ).toThrow();
    expect(JSON.parse(text).world).toEqual(world);
  });
  it("rejects empty, unknown and oversized predecessor/profile manifests", async () => {
    const { base, manifest } = fixture();
    await expect(admit(base, { ...manifest, profiles: {} })).rejects.toThrow();
    await expect(
      admit(base, { ...manifest, profiles: { extractorRules: {} } }),
    ).rejects.toThrow();
    await expect(
      admit(base, { ...manifest, previousExtensions: Array(9).fill("{}") }),
    ).rejects.toThrow();
  });
});

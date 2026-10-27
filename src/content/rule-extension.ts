import { z } from "zod";
import type { Pack } from "./types";
import { SpecialistRecruitmentRulesSchema } from "./specialist-recruitment";
import { ExtractorRulesSchema } from "./extractor";
import { animationProfile } from "../sim/mechanics/animation";

/** Separately hashed numeric rules, never a replacement pack or game state. */
const ExtensionSchema = z
  .object({
    schemaVersion: z.literal(1),
    basePackSha256: z.string().regex(/^[a-f0-9]{64}$/),
    profiles: z
      .object({
        specialistRecruitmentRules: SpecialistRecruitmentRulesSchema.optional(),
        extractorRules: ExtractorRulesSchema.optional(),
        packed4Ice: z
          .object({
            dataBase64: z.string().length(8192),
            decodedSha256: z.string().regex(/^[a-f0-9]{64}$/),
            mainRgbSha256: z.string().regex(/^[a-f0-9]{64}$/),
          })
          .strict()
          .optional(),
      })
      .strict()
      .refine(
        (p) =>
          p.specialistRecruitmentRules !== undefined ||
          p.extractorRules !== undefined ||
          p.packed4Ice !== undefined,
        "At least one admitted profile required",
      ),
    previousExtensions: z.array(z.string().max(65536)).max(8).optional(),
  })
  .strict();
export interface RuleExtensionIdentity {
  readonly basePackSha256: string;
  readonly extensionSha256: string;
  readonly contentHash: string;
  /** Derived only from fully verified, unchanged predecessor profiles. */
  readonly compatibleContentHashes?: readonly string[];
}
const SOURCE =
  "4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba";
const PINS = {
  associatedLandingOffset:
    "4737857dac75cb2770fca5c42ecc29996a7656b68c84bc14064a35b16fc3f117",
  directionIndices:
    "3527398a27fcc55470658f3ac8017543efe8fc8361116678e68da761b03a6568",
  directions:
    "8aa88c050cdb4229467f43347efcd9a8d88e5651cf2684e92666dcfe886515b6",
  textures: "a4f6449d8c575136ea84494e0ab1661a1b19c919c290ad8808b2b86fc6171288",
  orientations:
    "ae9c4c6189a51a76f6bb8d49d8e7fcb001a9af16688d288725ed4b89216c8bfb",
};
export async function ruleBytesSha256(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function ruleExtensionIdentity(
  basePackSha256: string,
  extensionSha256: string,
): Promise<RuleExtensionIdentity> {
  if (![basePackSha256, extensionSha256].every((s) => /^[a-f0-9]{64}$/.test(s)))
    throw Error("Invalid rule-extension identity");
  const contentHash = await ruleBytesSha256(
    new TextEncoder().encode(
      `genewars-rule-extension-v1\n${basePackSha256}\n${extensionSha256}\n`,
    ),
  );
  return Object.freeze({ basePackSha256, extensionSha256, contentHash });
}
function words(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2),
    view = new DataView(bytes.buffer);
  values.forEach((v, i) => view.setUint16(i * 2, v & 65535, true));
  return bytes;
}
/** The caller has already SHA-verified the embedded base bytes. Only absent
 * profiles from the same admitted executable can be added. Numeric spans and
 * bounded predecessor manifests are verified before admitting save identities. */
export async function admitPackRuleExtension(
  base: Pack,
  baseHash: string,
  text: string,
  expectedExtensionHash: string,
): Promise<{ pack: Pack; identity: RuleExtensionIdentity }> {
  return admitExtension(base, baseHash, text, expectedExtensionHash, 8);
}
async function admitExtension(
  base: Pack,
  baseHash: string,
  text: string,
  expectedExtensionHash: string,
  depth: number,
): Promise<{ pack: Pack; identity: RuleExtensionIdentity }> {
  if (depth <= 0) throw Error("Rule-extension predecessor depth exceeded");
  if (text.length > 65536) throw Error("Rule extension exceeds64KB");
  const extensionHash = await ruleBytesSha256(new TextEncoder().encode(text));
  if (extensionHash !== expectedExtensionHash)
    throw Error("Rule-extension hash mismatch");
  const e = ExtensionSchema.parse(JSON.parse(text));
  if (e.basePackSha256 !== baseHash)
    throw Error("Rule extension belongs to a different base pack");
  if (
    base.kind !== "original-private" ||
    base.source.executableSha256 !== SOURCE
  )
    throw Error("Rule extension requires the admitted source executable");
  const pack = { ...base };
  const recruitment = e.profiles.specialistRecruitmentRules;
  if (recruitment) {
    if (base.specialistRecruitmentRules !== undefined)
      throw Error("Rule extension cannot replace an existing profile");
    const profile = recruitment,
      site = profile.landingSite,
      provenance = profile.provenance;
    if (
      !site ||
      !provenance.landingSite ||
      provenance.executableSha256 !== SOURCE
    )
      throw Error("Complete source-backed recruitment profile required");
    const spans = {
      associatedLandingOffset: words(profile.associatedLandingOffset),
      directionIndices: Uint8Array.from(site.directionIndices),
      directions: words(site.directions.flat()),
      textures: words(site.textures),
      orientations: Uint8Array.from(site.orientations),
    };
    for (const name of Object.keys(spans) as (keyof typeof spans)[]) {
      const declared =
        name === "associatedLandingOffset"
          ? provenance.associatedLandingOffset
          : provenance.landingSite[name];
      if (
        declared.sha256 !== PINS[name] ||
        (await ruleBytesSha256(spans[name])) !== PINS[name]
      )
        throw Error(`Recruitment numeric span hash mismatch: ${name}`);
    }
    pack.specialistRecruitmentRules = recruitment;
  }
  const extractor = e.profiles.extractorRules;
  if (extractor) {
    if (base.extractorRules !== undefined)
      throw Error("Rule extension cannot replace an existing profile");
    const contactPin =
        "b40711a88c7039756fb8a73827eabe2c0fe5a0346ca7e0a104adc0fc764f528d",
      holdsPin =
        "087cd3d775279d19b7c7eceec94bb0b478a427a2a7b19e4c723fb5f6f5c8655b",
      resourcePin =
        "218b117a4b0f84c6e5a362e5afdc46d29fb1525930c6131e2ffff3bcfcda2142";
    if (
      extractor.provenance.executableSha256 !== SOURCE ||
      extractor.provenance.contactOffset.sha256 !== contactPin ||
      (await ruleBytesSha256(words(extractor.contactOffset))) !== contactPin ||
      (await ruleBytesSha256(Uint8Array.from(extractor.frameHolds.flat()))) !==
        holdsPin
    )
      throw Error("Extractor numeric span hash mismatch");
    for (let grade = 0; grade < 3; grade++) {
      const actual = animationProfile(base.assets.BMINE, grade + 1),
        declared = extractor.provenance.animationProfiles[grade];
      if (
        declared.resourceSha256 !== resourcePin ||
        actual.flags !== declared.flags ||
        JSON.stringify(actual.holds) !==
          JSON.stringify(extractor.frameHolds[grade])
      )
        throw Error("Extractor animation profile/resource mismatch");
    }
    pack.extractorRules = extractor;
  }
  const ice = e.profiles.packed4Ice;
  if (ice) {
    if (!base.palettes || base.palettes.iceBase64 !== undefined)
      throw Error(
        "ICE profile requires existing palette and cannot replace one",
      );
    const icePin =
        "c1a0294fca6947b0690e2aec400cdad587f1962721244f6783a95314f8349085",
      mainPin =
        "3f6b3a8b714efdf7889edac168a3b3109538a31d0a82e426471c133b7a3260ba";
    let decoded: Uint8Array;
    try {
      decoded = Uint8Array.from(atob(ice.dataBase64), (c) => c.charCodeAt(0));
    } catch {
      throw Error("Invalid ICE profile encoding");
    }
    if (
      decoded.length !== 6144 ||
      ice.decodedSha256 !== icePin ||
      ice.mainRgbSha256 !== mainPin ||
      (await ruleBytesSha256(decoded)) !== icePin ||
      (await ruleBytesSha256(
        Uint8Array.from(base.palettes.mainRgb8.flat()),
      )) !== mainPin
    )
      throw Error("ICE profile or palette hash mismatch");
    pack.palettes = { ...base.palettes, iceBase64: ice.dataBase64 };
  }
  const compatible = new Set<string>();
  for (const previousText of e.previousExtensions ?? []) {
    const previous = ExtensionSchema.parse(JSON.parse(previousText));
    for (const name of [
      "specialistRecruitmentRules",
      "extractorRules",
      "packed4Ice",
    ] as const) {
      if (
        previous.profiles[name] !== undefined &&
        JSON.stringify(previous.profiles[name]) !==
          JSON.stringify(e.profiles[name])
      )
        throw Error("Predecessor profiles must be an unchanged subset");
    }
    const verified = await admitExtension(
      base,
      baseHash,
      previousText,
      await ruleBytesSha256(new TextEncoder().encode(previousText)),
      depth - 1,
    );
    compatible.add(verified.identity.contentHash);
    for (const hash of verified.identity.compatibleContentHashes ?? [])
      compatible.add(hash);
    if (compatible.size > 32)
      throw Error("Too many rule-extension predecessor identities");
  }
  const identity = await ruleExtensionIdentity(baseHash, extensionHash);
  return {
    pack,
    identity: compatible.size
      ? Object.freeze({
          ...identity,
          compatibleContentHashes: Object.freeze([...compatible].sort()),
        })
      : identity,
  };
}

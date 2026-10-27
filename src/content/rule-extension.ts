import { z } from "zod";
import type { Pack } from "./types";
import { SpecialistRecruitmentRulesSchema } from "./specialist-recruitment";

/** Separately hashed numeric rules, never a replacement pack or game state. */
const ExtensionSchema = z
  .object({
    schemaVersion: z.literal(1),
    basePackSha256: z.string().regex(/^[a-f0-9]{64}$/),
    profiles: z
      .object({ specialistRecruitmentRules: SpecialistRecruitmentRulesSchema })
      .strict(),
  })
  .strict();
export interface RuleExtensionIdentity {
  readonly basePackSha256: string;
  readonly extensionSha256: string;
  readonly contentHash: string;
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
/** The caller has already SHA-verified the embedded base bytes. Only one
 * absent profile from the same admitted executable can be added. Every
 * decoded numeric span must match its importer pin, not merely its metadata. */
export async function admitPackRuleExtension(
  base: Pack,
  baseHash: string,
  text: string,
  expectedExtensionHash: string,
): Promise<{ pack: Pack; identity: RuleExtensionIdentity }> {
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
  if (base.specialistRecruitmentRules !== undefined)
    throw Error("Rule extension cannot replace an existing profile");
  const profile = e.profiles.specialistRecruitmentRules,
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
  return {
    pack: { ...base, specialistRecruitmentRules: profile },
    identity: await ruleExtensionIdentity(baseHash, extensionHash),
  };
}

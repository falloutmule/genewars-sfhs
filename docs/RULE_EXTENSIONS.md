# Verified numeric rule extensions

An older private pack can lack a numeric profile whose mechanic has since been reconstructed. The SFHS builder accepts `--rule-extension <private-json-path>` for missing specialist recruitment and complete Extractor profiles. The extension is embedded separately; the original compressed pack is unchanged.

Admission requires the exact base-pack SHA-256, the same supported executable, an absent profile, and decoded numeric spans matching the importer’s source hashes. Recruitment checks its five spans. Extractor checks the contact offset, all60 running hold bytes, source resource identity, and each imported BMINE animation. Assets, missions, unknown profiles and replacements are rejected. The manifest contains `schemaVersion: 1`, `basePackSha256` and a nonempty `profiles` object with `specialistRecruitmentRules` and/or `extractorRules`. Generate its profile with the existing source-backed importer; keep its values and source files private.

The build receipt records the base hash, extension hash and composite runtime content hash. The composite hashes a domain-separated identity containing both input hashes. New saves and replays use that identity.

A compatible old save first passes its complete checksum and world validation against the verified base identity. Loading then changes only `world.contentHash` and recomputes the save checksum. The original file remains unchanged. No actors, pools, orders, resources, objectives or results are created by migration. Saves from another base, damaged saves and mismatched extension identities still fail. Old replay checksum checks remain strict; they are not converted into claims about the extended runtime.

Mission acceptance remains tied to genuine phone UI gameplay, exact artifact and content identities, result flow and campaign carry. Admitting data or building an artifact alone does not accept a mission.

An extension may include `previousExtensions`, containing the exact JSON text
of earlier manifests. Each predecessor is fully hash/source/numeric validated
against the unchanged base, and its profiles must be an unchanged subset of
the new manifest. Only those derived composite identities become compatible
save inputs. Limits are64KB total text,8 predecessors per manifest,8 levels
and32 distinct predecessor identities. Unknown profiles, replacement or removal
of predecessor profiles, wrong bases and arbitrary claimed hash lists fail.
Metadata migration validates each predecessor save using its own identity and
checksum before changing only `world.contentHash`. Original saves and all old
replay checks remain unchanged.

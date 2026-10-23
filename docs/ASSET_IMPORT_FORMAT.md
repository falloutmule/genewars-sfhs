# Original-file import and GWPACK

Public Python code independently expresses the documented resource formats. It reads original files, never executes a DOS executable. `--source` accepts a loose installation, a flat installation ZIP, ISO2048, or raw MODE1/2352 image. Directory paths/ZIP paths are normalized; traversal, duplicates, symlinks, ISO cycles, interleaving and multi-extent records are rejected. Individual source reads are bounded to 64 MiB. Nested 7z/ZIP packages require local extraction to their disc image first.

Only the exact QA BETA V5 candidate GW.EXE hash is admitted. Its bytes are excluded from the pack. Other hashes fail with an explicit edition message. Output is constrained to resolved repository `.private/`. Unknown resources do not get guessed decoders.

`genewars.gwpack` is gzip-compressed UTF-8 JSON, deterministic key ordering and gzip timestamp zero. Original-private schema version:2; importer version:0.2.0. The asset-free development fixture retains schema1. Hash the **compressed bytes** with SHA-256. The HTML embeds those bytes as base64, validates the hash, decompresses them with the browser's native gzip stream, then validates the normalized schema.

Top-level fields:

| Field                              | Contents                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| schemaVersion/importerVersion/kind | Version tags; kind `original-private`                                                                                                                           |
| source                             | Edition, input file hash, identifying executable hash; no personal source path                                                                                  |
| manifest                           | Original resource paths, byte lengths, SHA-256; no executable bytes                                                                                             |
| missions                           | All 24 699-byte HDRCO / 343,958-byte CONQ pairs: names, source hashes, briefing, 128×128 cells `[signedHeight, texture, rawFlags]`, camera target words         |
| assets                             | PNG data URIs; indexed8 and packed4 atlases; original component coordinates/flips; animation metadata; packed4 index/opacity streams and paired192/208 palettes |
| palettes                           | Original MAIN RGB palette and64×256 FADE lookup, with hashes                                                                                                    |
| sounds/audioProfile                | SOUND.DAT bank/format/cue descriptor identities,196 extracted WAVE records and473 English SPE WAVE records                                                      |
| rules/economyRules/ecologyRules    | Hash-admitted numeric tables, scalar equations, source ANB holds and resource descriptors; no instructions or pointers                                          |
| zoneRules/etherealRules            | Species components, zone text selectors, terrain light vector and observation thresholds from hash-admitted numeric ranges                                      |
| geneticistRules/craterRules/effectRules | Geneticist projectile/capture metadata, crater textures and all71 ordered shared effect descriptors; metadata rows68–70 do not imply EFF animations |
| texts                              | First 604 CP437 English text entries, private only                                                                                                              |
| unknown                            | Resource and reason records; explicit missing campaign/music/font/codec work                                                                                    |

CONQ admission checks size, fast tag `0x55336`, extension tag `0x6BE`, map region at `0x355e`, and14-byte cell stride. Every mission includes four complete serialized players, all eight packed pools (including inactive priors), intrusive links, raw terrain, zones, target positions and serialized RNG seed/draw count. The unobserved RNG journal index stays null. Serialized startup remains source-only; runtime bootstrap must perform blueprint selection, landing and activation. This pack is not a complete campaign conversion or a DOS save format.

ANB:18-byte header; six-byte sprite records; bounded row RLE with opaque literal zero;10-byte component,14-byte frame,10-byte animation records. Indexed8 uses RGB6 MAIN.PAL expanded by floor(component×255/63). The packed4 decoder admits all26 creature/BONES resources and retains high-nibble-first pixels, transparency and source metadata. Neutral Mule/BONES rendering uses the original paired palette, health depth and FADE row. Other runtime palette wrappers remain separate work. Metadata pointers are bounds/alignment checked.

The numeric LE reader admits the exact executable hash and each selected range independently. It supports initialized data pages and virtual zero tails, and never executes or packs original instructions. See mechanic documents for source locations and gameplay limits. Original font and CD music integration remain unresolved.

Ecology tables retain all25 species trait rows, Mule combat parameters and signed cold-loss coefficients. Shared effect descriptors retain retirement mode, gravity, priority, retirement child, movement and water-response flags. Their source numeric range is admitted independently; importing a descriptor does not install its factory, callback or an unsupported resource. Geneticist profiles retain signed speed/range/cooldown words and the actual effect codes41–43, with separately admitted20/41–43 descriptors.

Frame metadata also retains optional `sourceSize: [rawWidth, rawHeight]` and `sourceComponents: [spriteIndex, rawX, rawY, flags, extra][]` before presentation scaling. Gameplay uses these signed original coordinates where source callbacks require them: EFF59 initialization reads the first component's raw Y, and building collision reads raw frame height. Odd or negative values must not be reconstructed by doubling already truncated display coordinates. Both indexed8 and packed4 readers preserve this metadata.

`import-report.json` stores input/pack hashes, sizes, counts and unresolved resources. `inspect:pack` validates basic structure and PNG signatures. Browser code applies the TypeScript/Zod content schema. Import diagnostics are private. Breaking changes require a new schema version and explicit adapter; unsupported versions are refused.

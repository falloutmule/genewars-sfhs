# Original-file import and GWPACK v1

Public Python code independently expresses the documented resource formats. It reads original files, never executes a DOS executable. `--source` accepts a loose installation, a flat installation ZIP, ISO2048, or raw MODE1/2352 image. Directory paths/ZIP paths are normalized; traversal, duplicates, symlinks, ISO cycles, interleaving and multi-extent records are rejected. Individual source reads are bounded to 64 MiB. Nested 7z/ZIP packages require local extraction to their disc image first.

Only the exact QA BETA V5 candidate GW.EXE hash is admitted. Its bytes are excluded from the pack. Other hashes fail with an explicit edition message. Output is constrained to resolved repository `.private/`. Unknown resources do not get guessed decoders.

`genewars.gwpack` is gzip-compressed UTF-8 JSON, deterministic key ordering and gzip timestamp zero. Schema version: 1; importer version: 0.1.0. Hash the **compressed bytes** with SHA-256. The HTML embeds those bytes as base64, validates the hash, decompresses them with the browser's native gzip stream, then validates the normalized schema.

Top-level fields:

| Field | Contents |
|---|---|
| schemaVersion/importerVersion/kind | Version tags; kind `original-private` |
| source | Edition, input file hash, identifying executable hash; no personal source path |
| manifest | Original resource paths, byte lengths, SHA-256; no executable bytes |
| missions | All 24 699-byte HDRCO / 343,958-byte CONQ pairs: names, source hashes, briefing, 128×128 cells `[signedHeight, texture, rawFlags]`, camera target words |
| assets | PNG data URIs; indexed8 atlases; sprite rectangles; frame components; animation first/last frame and uninterpreted fields |
| sounds | Independently bounded RIFF WAVE data URIs from SOUND.DAT and English SPE offset/length records |
| texts | First 604 CP437 English text entries, private only |
| unknown | Resource and reason records; explicit missing campaign/music/font/codec work |

CONQ admission checks size, fast tag `0x55336`, extension tag `0x6BE`, map region at `0x355e`, and 14-byte cell stride. RNG startup is unresolved and stored as null. Serialized source pools are not imported as ready runtime entities. This pack is not a complete content conversion or a DOS save format.

ANB: 18-byte header; six-byte sprite records; bounded row RLE with opaque literal zero; 10-byte component, 14-byte frame, 10-byte animation records. Indexed8 uses RGB6 MAIN.PAL expanded by floor(component×255/63). Packed4's raw decoder is tested but runtime palette admission is not integrated. Creature/BONES resources are reported unresolved. Metadata pointers are bounds/alignment checked. Palette animation and lighting are pending.

`import-report.json` stores input/pack hashes, sizes, counts and unresolved resources. `inspect:pack` validates basic structure and PNG signatures. Browser code applies the TypeScript/Zod content schema. Import diagnostics are private. Breaking changes require a new schema version and explicit adapter; unsupported versions are refused.

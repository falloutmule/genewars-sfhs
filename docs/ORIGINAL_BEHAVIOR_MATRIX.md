# Original behavior and coverage

Evidence root: neighboring preservation archive at `da94fd29d5d5674f1b3c6827068d60d5342fdd35`, particularly `genewars-preflight/research/`. Historical acceptance belongs to its Rust reconstruction, not this new runtime.

| System | Original evidence | Conversion status | Improvement | Tests | Remaining uncertainty |
|---|---|---|---|---|---|
| Variant | game-files-manifest, pinned CD executable | Exact hash admission | Explicit unsupported-edition refusal | Input hashes | Retail equivalence |
| RNC1 | formats/rnc.md; rnc-corpus | Independent Python reader | Bounded decode and CRC checks | Synthetic tests; private corpus hash comparison | Compound resources not inferred |
| ANB indexed8 | genewars-assets contracts, sprite-corpus | Atlas/frame/component import | Searchable viewer | Bounds tests; private sprite metrics | Runtime lighting, flips, palette, animation timing |
| Packed4 creatures | creature-evidence, bones-evidence | Not imported | Unknown record report | Synthetic codec only | Runtime palette/admission integration |
| Terrain | map_atlas contract; all 24 CONQ files | 128×128 height/texture/orientation import and Three.js view | Pan/zoom/minimap | 393,216 private cell comparisons | Shader/palette, water, collision, atlas selection |
| Campaign | campaign-sequence.json | 24 paired maps/titles/briefings | Direct-entry atlas | Source hashes and names | All mission logic, carry, result flow |
| Specialists | mission-001 contract; original manual | Provisional Engineer/Geneticist workbench | Selection and order queue | Unit tests; DOM input | All original jobs/rosters/team choices |
| Exceland construction | mission-001-contract.json | Costs/availability/count predicate | Readable construction ledger | 18 TS checks include build chain; browser construction path | Scheduling, travel, terraforming and complete eligibility |
| Power and GOOP | extractor/distributor/photon research | Debit only; running callbacks absent | Explicit reason | Insufficient funds test | Original production, storage, distribution and power |
| Plants/terrain jobs | archived modules/contracts | Not integrated | None claimed | None | All running behavior |
| Creatures/hybrids | archived modules and manual | Not integrated | None claimed | None | Needs, aging, mating, traits, work, death |
| Research/combat/AI | archived evidence | Not integrated | None claimed | None | All running behavior |
| Ethereals/scoring | archived mission evidence | Not integrated | None claimed | None | Observation, inspections, rewards, failure chains |
| Saves/replays | New conversion schema | Complete current workbench state | Version/hash messages, manual/recovery/export | Active-construction continuation, drift/corruption checks | Future subsystem migrations; original DOS save compatibility |
| Audio | Original RIFF bank and SPE tables | 474 validated WAVE records in inspection UI | Level controls | Offline browser startup; structural extraction | Gameplay cue/subtitle mapping, music, remaining bank tail |
| Browser/phone | New conversion acceptance policy | Desktop and two phone viewport sizes | Responsive panels | Offline Chromium mouse/touch, saves, selfcheck | Physical S21 Ultra; performance and full gesture suite |

Accepted complete missions in this TypeScript conversion: **0/24**. Workbench completion is separate from original mission acceptance.

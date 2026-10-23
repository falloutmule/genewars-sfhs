# Destruction craters and native terrain jobs

`src/sim/mechanics/crater.ts` independently expresses source79160/77C60 crater creation and the79220/78E30 native terrain-job scheduler. The authoritative serialized records are the25 retained176-byte jobs at mission-prefix1EC7, with the active byte count at2FF7. Inactive counters are negative. No construction job or synthetic inactive native record is substituted.

`createCraterJob(world,point,variant,rules)` stages the complete serializable world and returns `{slot,viewportInvalidations}`. A full pool returns `slot:null` before map writes, RNG draws or unused rule access. The first inactive slot retains all untouched bytes. Variant0 creates a3×3 target grid around the supplied position; variant1 rounds the position down to the original cell boundary and creates a4×4 grid. Both use step640. The constructor captures live heights, installs the original protected crater textures/material bits, and sets protected-vertex flags with source8D580's contiguous row behavior. It then consumes nine or sixteen RNG draws respectively, in original center/edge/corner order, to form independent signed targets. The duration is the maximum absolute target difference divided by the step, plus one. Targets below zero remain signed in the job;8C550 clamps actual height assignments to zero.

The building destruction family calls variant `footprint-2` after actual retirement and footprint release, before debris parameter/factory RNG. It may ignore the original null-factory result. The caller must pass the same `world.rng`; crater creation does not own a second stream.

## Rules and private import

`CraterRules` accepts actual nine-vector `ecologyRules.spreadDirections`, initialized `rules.tables.terrainBorder`, and `zoneRules.terrainLightVector`, plus `largeTextures[9]` and `largeFlags[9]`. The last two fields come from `tools/import-original/crater_profile.py::import_crater_rules(executable_bytes)`. The helper verifies the exact admitted executable before mapping object3 and individually verifies its two nine-byte ranges at4B44 and4B50. It returns normalized private data and provenance, without copying unrelated table rows or executing the original.

The small crater's four texture orientations and all target equations are source instruction constants expressed in mechanics code. The large crater's actual texture/flag tables are imported inputs. No table or original fixture is committed in public tests.

## Scheduler and host bindings

`stepCraterJobs(world,context)` stages the entire supplied serializable host, processes live native slots in ascending order and commits atomically. Each vertex reads the current terrain after every preceding setter and job. It applies8C550 height assignment, both ordered8BEE0 diagonal slope repairs and their RNG draws, signed shader calculations, dirty flags, live object height/shade callbacks, classification, material repair, protected border reconstruction, water-edge completion and counter retirement. Every other callback runs the source rectangle maintenance according to the decremented counter. A retiring job gets counter-1 and decrements2FF7. The returned receipts preserve before/after native bytes, ordered viewport requests, height writes, linked writes and count transitions.

The context binds concrete host state:

| Input                                         | Contract                                                                                                                                                                                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rules`                                       | The admitted tables above. Environment globals are read from actual prefix1C61/1C63/1EA2/1EA4.                                                                                                                                                     |
| `linkedRecords(stagedWorld,cell)`             | Complete current shared head-to-tail list, returning `{id,native}` images belonging to the staged host. The implementation checks every numeric identity and next reference against the actual map head and chain. An omitted real object rejects. |
| `linkedChanged(stagedWorld,record,operation)` | Synchronizes any additional normalized mirrors after a native shade or height write. It is unnecessary only when those native images are the sole authoritative representation.                                                                    |
| `refreshZones(stagedWorld,activeIndices)`     | Runs actual79D50 with activation1 over the positive active19-byte zones after at least one retirement. It is required lazily only when such a zone exists; it runs once after all jobs. Return its ordered viewport cell requests.                 |

Linked shades use the real plant/building virtual behavior and preserve the source flags21-bit1 gate. Height refresh writes actual ground for recognized live kinds1/2/3/4/5/8; physical height is raised only when it falls below ground, with the original forced selector46 effect behavior. Plant/building physical storage is untouched. Unknown numeric bytes, unsupported families, incomplete lists or a failed normalized/zone continuation roll back the complete pass, including earlier jobs and RNG.

Viewport cache847D0 and rendering remain host presentation work. The receipt carries the source requests and numeric dirty flags; it does not fabricate a viewport-cache acknowledgement. Retired native jobs preserve opaque storage for future reuse.

## Evidence and limits

Read-only source evidence includes the original79160/79220 instructions,77C60/77960/78E30,8C550/8BEE0,84960/84B40/8B800/8B840,8C1C0/8CB00/8C290,8B890/8D1B0/8D580/8D660/8CBA0/8CDE0 and the preserved terrain-job, height, maintenance and terrain-refresh contracts. No original executable, old frame-frontier process or next-refusal probe was run.

Fourteen already complete source-compared79220 fixture cases pass:3,272,976 compared terrain/job/RNG bytes and all799 ordered viewport requests. They cover raw/reserved terrain, sparse overlapping native jobs, counters1/2/4, retirement, a70-draw steep diagonal repair and a58-draw water-completion path. These fixtures use a proven empty linked-object/zone context; live linked-object semantics have synthetic tests. The77C60 constructor has static-source and synthetic coverage, without a complete private constructor fixture claim.

Nine synthetic TypeScript tests cover both constructor variants, retained bytes and fractions of the small anchor, null capacity, signed targets/clamping, sparse scheduling/order/counts, physical-height behavior, actual-list validation and staged zone/unknown-byte rollback. Three importer tests cover executable-first admission, narrow table reads and changed-range rejection. The focused crater/terrain/effect suite passes22 tests and strict typing passes. Private tables, fixtures and receipts remain ignored.

Unsupported native job dimensions/counters, map-storage overflow, unavailable live families or missing active-zone services are explicit failures. Mission acceptance, real destruction integration, complete failure/alternative strategies, save/replay and all24 gates remain host acceptance work; these family checks do not promote canonical acceptance.

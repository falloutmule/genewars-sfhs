# Source-backed plant and neutral Mule callbacks

The source registry remains a source import. `createEcologyState(registry)` creates a separate serializable callback state, preserving every packed numeric field and the uninitialized native pointer gap. It does not mark the registry ready for arbitrary original callbacks. The implemented domain is original plants and neutral owner-4, species-selector-4 Mules, including the living behavior exercised in Exceland.

## Admitted inputs

`tools/import-original/ecology_profile.py::import_ecology_rules(executable_bytes)` verifies the executable identity before mapping LE object 3. It returns twelve plant rows, nine spread directions, twelve logical plant animation resource names, eight corpse-friction values, and source-backed Mule coefficients. Four table ranges are individually hashed:

| Table | LE object offset | Bytes | Normalized fields |
| --- | ---: | ---: | --- |
| Plants | `0x4B80` | 384 | Signed eight-class growth deltas; spread period, walk count, crowding threshold, old-counter threshold, nutrition, retirement delay; other bytes retained |
| Spread directions | `0x4564` | 36 | Nine signed word coordinate pairs |
| Plant resources | `0x3B78` | 528 | Selector, normalized path, logical asset key; original selector binding verified |
| Corpse friction | `0x4520` | 16 | Eight signed terrain-class coefficients |

The normalized profile includes range hashes and `originalExecution:false`. Reading initialized data is independent of executable execution. Original resources and private conformance inputs stay in `.private/`.

A live Mule callback additionally requires admitted integer angle/trigonometry/bounce tables, actual animation holds and flags for its selected action, gravity, doubled physical water height, climate, and the live source `74270` obstacle query. `MuleContext.profile(action,state)` must return actual MULE metadata. `bonesProfile(action)` must independently bind BONES before corpse state 26; missing BONES metadata rejects the transaction.

## Plant API and behavior

`stepPlants(state,terrain,rng,rules,rawWaterHeight)` commits atomically and returns callback slots, events, and a nullable rejection reason. Its scheduler preserves the source cursor stride, wrap, eligibility counter and maximum two callbacks. The callback retains old-byte counter comparison, signed-word growth wrapping, upper cap, nine-cell crowding, terrain class, spread-period gate, source capacity limits and the original order of retirement and spread decisions.

Spread uses original direction-table steps, then the original Y/X jitter draws, terrain/material and raw-water tests, slot choice, coordinate quantization and creation fields. New plants retain untouched slot bytes. Plant linked-list order is represented by `plantOrder`; inserted plants precede prior cell entries. Retirement preserves native numeric state, applies its animation/delay flags and source cell-operand mutation, and emits an event for host unlinking and reference cleanup.

`damagePlant(...)` shares the source damage/death path. `plantBlockerWeight(state,cell)` contributes ten for every active plant except those with source plant flag bit 3. `sitePlantBlocked(state,cell)` tests any active plant, matching the separate construction query. These are intentionally distinct source predicates.

The host consumes `plant-born`, `plant-retired`, and `cleanup-required` events and updates the common spatial index, shared counts and references at their source boundaries. Source pointers are never copied into runtime references.

## Neutral Mule API and behavior

`stepNeutralMule(state,sourceSlot,rng,context)` addresses the stable source slot, stages state/RNG/terrain and returns `{committed,reason,events}`. A rejected callback changes none of those inputs. Native pointer bytes remain null.

The living implementation covers:

- Frame-plus-signed-ID parity, grounded/nonflight acceleration, gravity, fixed-point fractional positions, ground interpolation and shade, steering, braking, terrain/contact speed, bounce, and arrival.
- Original `743C0` fixed-point ray sampling, including its unusual initially rejected point result and preceding failure point. Rejected goals use `74A50`. Obstacle avoidance uses both `6F0C0/6EDE0` boundary walks, the 128-slot visited table, cycle fallback, side/cost selection, tie RNG draw, retained waypoint fields and the waiting-speed prefix. It does not substitute a modern grid route.
- Original neighborhood scan draw order and torus-cell order, exact first-plant tie order, food score, reserved plant eligibility, wandering samples, requested speed, idle delays, food target acquisition, arrival/reservation, feeding cadence, plant damage and nutrition.
- Source health recovery and reserve cost, movement expenditure, energy/lifetime/hunger/reserve/health parameterization, natural energy death, bounded starvation entry, corpse friction, death-animation completion, corpse decay, separate BONES binding and final bone retirement.
- Water classification and water-effect requests. Qualified neutral nonlethal self-water damage applies original defense and reset behavior without RNG, retaliation or audio.

`muleStraightRay(...)` and `muleWaypoint(...)` are exported pure geometry queries with the same live point-admission callback used by the host.

Events are serializable requests:

| Kind | Extra fields | Host action |
| --- | --- | --- |
| `mule-moved` | `position` | Relink the same logical entity in the common spatial index |
| `mule-target` | Optional plant slot `target`, `position` | Observe chosen source goal |
| `mule-fed` | Plant slot `target` | Observe damage/nutrition already applied |
| `mule-audio` | `channel` | Submit original presentation request |
| `mule-water-effect` | `code`, `position`, `height`, `angles` | Allocate the original effect in the shared family-4 pool; handle factory failure/priority and callback order in the whole-world transaction |
| `mule-water-damage` | `damage` | Observe damage already applied; do not damage again |
| `mule-died` | None | Apply host death observers as supported |
| `mule-retired` | None | Unlink, apply original pool/global count and reference cleanup; do not reuse a stale logical reference |

Water requests currently carry code `0x15` for deep effects with angles `[0,0,128]`, or `0x30` for surface effects with zero angles. Those source factory requests themselves require no RNG draw. Source damage is applied once before the later living callback work.

## Evidence and verification boundary

The implementation is independently expressed from the preserved contracts in `creature_world.rs`, `actor_world/creature_updates.rs`, `actor_motion.rs`, `mule_waypoint_wait.rs`, `plant_spread.rs`, and `world.rs`, with source addresses retained above. These are read-only inputs in the preserved research archive. Original data and disassembly were read as data; no original executable was launched and the old frame frontier was not resumed.

Private conformance establishes:

- All 24 missions and all 192 source pool layouts/linked-map memberships validate before startup.
- The first 32 original Exceland Mule callbacks match the bounded original instruction model for every nonpointer numeric byte except common map links, which the host owns; RNG state also matches. The first two callbacks additionally match those common-link bytes.
- A bounded 184-instruction neutral self-water-damage comparison agrees on damage, numeric reset fields and zero RNG draws.
- The integrated original Exceland command path constructs Extractor, Distributor and three Photons, reaches the original victory predicate at frame 3899, reports no ecology callback refusal, and preserves save/load checksums while terraforming, placing and working. This is a private content conformance run, not a general mission certification.

Synthetic tests cover cursor wrap/counter ordering, signed arithmetic, spread RNG order and newborn bytes, blocker predicates, delayed retirement, atomic rejection, first-choice RNG, stable source slots, ray/waypoint behavior and coordinate wrap, separate BONES binding, feeding effects on both entities, natural death and retirement.

The later [owned Mule and reproduction extension](OWNED_MULE.md) adds ordinary human orders, shared-list cell entry, actual airborne building response, same-Mule association routes, original owned reveal and complete same-species natural pairing/birth. The [corpse/BONES extension](CORPSE_FEEDING.md) adds corpse food scoring, consumption, retirement and the code32 shared effect factory. Their contexts/receipts and current explicit boundaries supersede the older neutral-only boundary. Live hostile combat, carrier attachments, low-temperature damage and code11 escape still require their source families. The host must keep other entity positions and source list order current and complete cleanup/effect factories before claiming a whole callback family or mission canonical. No all-ready callback flag is inferred from a copied buffer or a successful bounded test.

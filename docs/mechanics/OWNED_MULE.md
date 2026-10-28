# Owned Mule orders, autonomy, reproduction and feeding

`requestOwnedMuleMove(state,index,target,context)` installs the ordinary source opcode11/5DF50 order for any human owner0..3. It validates identity/ownership, releases the previous plant or paired task through5CC60, retains physical position and fractional bytes, stores both command and anchor coordinates, and enters state0/task7. The request consumes no RNG. Feedback and selected-panel refresh are receipts. Ineligible dead/state15/state18/high61-bit0 actors ignore the command. Missing attachments or references reject atomically.

`stepOwnedMule(state,index,rng,context)` and `stepNeutralMule(...)` share the independently expressed source numeric callback. Both stage the ecology, RNG and terrain and commit together. This extends the ordinary movement and plant lifecycle described in [ECOLOGY.md](ECOLOGY.md). Serializing that state preserves the native numeric records, opaque null resource pointers, command goals, reservations, counters, fractions and shared RNG.

The implementation now includes:

- Human command continuation from0 to8, two source query-order draws, explicit goal admission, original fixed-point movement/path repair and retained command completion. Even frame-plus-ID phases preserve the AI timer.
- Owned idle building queries and source common choice. With no processing-building action the owned idle prefix draws its original delay, then continues to the common branch. Owned positive-reserve wander radius is512; neutral or empty-reserve wander radius is2048. The branch implements sixteen sampled attempts, the original anchor repair and random wait after all fail.
- Actual5D700 operator eligibility. Neutral owner4 qualifies directly. An owned creature needs an enabled same-owner category3 control record, commandState0, flags70 bit80, matching mode and original planar range. Food selection uses half reserve with an operator and quarter without one. No specialist is invented.
- Plant approach, arrival/reservation, feeding nutrition/damage/cadence, interruption cleanup, invalid food reset, energy/hunger/health tail and natural death/corpse decay. Ordinary owned and neutral species4 actors use the same mechanics.
- Corpse food scoring/acquisition, reserved-target arrival, corpse and BONES consumption, natural bone retirement and reference-kind cleanup. [CORPSE_FEEDING.md](CORPSE_FEEDING.md) describes the nutrition, emitted code32 effect factory and host retirement work.
- Same-species mate scoring in randomized radius1024 cell traversal; peer stage79 may be negative. Mutual task cleanup, pursuit, rendezvous corners, shared center movement, stop/countdown, parent reserve/stage changes, original gene/inheritance draws, first-free native factory and peer-before-current birth continuation are implemented. A full300-slot pool skips only the factory; parents still finish the source continuation.
- Source59280 owned reveal and84B40 four-cell dirtiness/plant shade changes, with building shade patches returned for the host. Reveal runs after physical contact and before arrival/AI.
- Source5B100 last-living-creature selection and5B260 cell-entry waypoint draw, including wrap and shared-list order. Airborne6DD50 collision impulse uses the actual selected building and physical height.
- Owned Mule4 material work now binds the actual processing-building query, autonomous and commanded plant/corpse selection, cutting20 animation, carrier67 pickup, carried pose, delivery/drop and retained task recovery after damage. See [MULE_HAULING.md](MULE_HAULING.md) and [PLANT_CARRIER.md](PLANT_CARRIER.md). Ground-carried corpses skip their own motion and aging while97bit1 is set.

## Context and host obligations

Stopped movement follows6FD81..6FD99 to7077E before resolving retained
associations or nominated buildings. When the low movement flags are not3,
desired speed is nonpositive and movement bit16 is clear, those cached bytes
remain unread and unchanged. This matters when5A210 reuses a retired slot:
the original factory preserves its former reference bytes. An unused reference
to another retired slot must not block a newly produced creature. Entered
linked movement still requires its actual target binding; no reference sweep
or fabricated target is introduced.

A closed static-listing comparison covers480 complete even-phase5ED20
callbacks across human/neutral owners, zero/negative desired speed, retained
flags, nominated kinds and unused association kinds/indices. All numeric
bytes and RNG match across317,760 mapped instructions, with6D390 proven
unentered and no foreign ports. Synthetic regressions retain the existing
entered-reference refusal, verify rollback after a later animation failure,
and carry recycled creature slots through campaign save/reload and replay.

`MuleContext` retains the admitted ecology/motion/animation/environment inputs and adds:

| Input                                            | Meaning                                                                                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cellOrder(cell)`                                | Actual source IDs in current shared head-to-tail order. Required for multi-creature ordering and mate score ties.                                 |
| `airborneObstacle(point,height,mule)`            | Source74270 result at that physical height.                                                                                                       |
| `creaturePriors`                                 | Actual300 native124 records, including inactive retained bytes. Required lazily at a natural birth.                                               |
| `owned.selectedPlayer/globalFlags/allianceMasks` | Actual player and source flag context.                                                                                                            |
| `owned.buildings`                                | Actual indexed native67 records for the two source43130 selector-mask queries.                                                                    |
| `owned.operators`                                | Complete actual category3 roster's enabled/control/mode/range fields. An empty proven roster is valid.                                            |
| `owned.players`                                  | Optional actual four1805-byte player records; required lazily for human trait-inheritance research flags when the parent lacks its inherited bit. |

`queryMuleAirborneBuilding(terrain,point,height,firstLinkedBuilding,heightRaw)` exposes74270/74160. It preserves the nine source sample offsets, footprint classes/extents and first-candidate rejection rule. The selected building's current ANB frame supplies signed raw height. Its physical collision limit is `(rawHeight<<6)-320` above building ground. A rejected selected candidate ends the query. The negative-height form does not access animation metadata.

The optional `effectCode(id)` input supplies actual shared effect native69 selectors, read lazily when a visited shared list contains family4 entries. Non11 entries skip; code11 forces the source cell-escape predicate and its neighborhood scorer remains explicit.

New events:

| Event                   | Host work                                                                                                                                                                                                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mule-command-feedback` | Submit the established command presentation feedback.                                                                                                                                                                                                                        |
| `mule-reveal`           | Consume changed vertices and apply `buildingShades` to actual building records. Terrain and plant changes already committed.                                                                                                                                                 |
| `mule-born`             | `newborn:{index,native,owner,bornCounterIncrement}`; synchronize the actual backing/count, insert that stable source0 identity at the shared cell head, bind MULE and increment a human owner's born counter6F9 by the receipt amount. The new record is already in ecology. |
| `mule-effect`           | Consume the exact code32 request with `consumeMuleEffects`; its three parameter RNG draws already occurred in the gameplay callback. The factory consumes no RNG. |
| `mule-retired`          | Unlink the stable source0 identity, run cross-family724C0 cleanup, apply the source count decrement and presentation/module requests in `retirement`. Creature-to-creature cleanup already committed in ecology. |

Other movement, water factories, death and retirement events keep the same host responsibilities as ECOLOGY.md. Natural birth accounts for its own source head insertion in the subsequent two local5B100 queries. It does not execute a newborn second pass or fabricate an entity ID/count outside the real first-free allocation.

`initializeMuleNative` in genepod.ts is the shared5A210 initializer. Its optional actual parent supplies physical height, full newborn lifetime and task78. The Genepod null-parent behavior and numeric receipts remain unchanged. Unknown inactive bytes, animation counter30 and position fractions remain retained.

## Evidence and scope

Source contracts: `mule_owned_command.rs`, `owned_mule_ai.rs`, `owned_mule_common_choice.rs`, `actor_world/owned_mule_updates.rs`, `mule_cell_entry.rs`, `airborne_building_collision.rs`, `building_obstacle.rs`, `mule_idle_pair_init.rs`, `mule_pair_init/rendezvous/center/stop/birth/birth_tail.rs`, `mule_factory.rs` and the original5ED20/5DF50/5CC60/5D700/59280/74270 listings were inspected read-only. No original executable or next-refusal probe was run.

Existing private complete callback fixtures match eighteen owned callbacks, including Genepod ejection, six-draw autonomy, reveal and an actual opcode11 move:4,375,098 compared numeric/map/building bytes and RNG. Six additional complete natural-pair callbacks match all live creature numeric fields/RNG and terrain effects, including a fourteen-draw natural birth and later remating. Intrusive links0..5 and logical pointers31..38 are host-owned exclusions in these family comparisons. Existing Genepod fixtures still match571,610 bytes after extracting the shared initializer. Receipts remain under ignored `.private/`.

Synthetic tests cover command authority, ignored versus rejected outcomes, atomic attachment failure, distinct plant reservation release masks, explicit target draw count, even-phase timers, fixed physics, operator-dependent food thresholds, negative-stage peer selection, natural birth retention, capacity failure and raw-height boundary/first-candidate behavior.

The ordinary campaign now publishes a successful atomic ecology move into
every retained canonical creature record immediately, then rebinds each
ecology Mule to that record. This includes peer cleanup writes; the atomic
wrapper clones the entire ecology, not just the commanded Mule. Cloned plant
reservation changes stay installed as well. Both direct orders and queued
waypoints use this host boundary. The move mechanics themselves are unchanged.
Previously the following zone pass could adopt stale canonical bytes over the
new order while the UI still reported success. Six host regressions cover real
zone projection/adoption, both same-frame specialist command orders, peer
cleanup, a later zone failure, atomic command rejection, queued continuation,
JSON saves and full recorded-command replay. The existing failed private
strategy and frozen runtime remain preserved; new-runtime continuation is
reported separately. This fix does not establish canonical acceptance.

The corpse extension adds eighteen complete existing source callback comparisons, including final retirement, with15,416 compared numeric bytes, matching RNG and matching terrain effects. Synthetic tests additionally cover rich-corpse nutrition and the code32 shared-pool factory. Its scope and fixture limits are recorded in [CORPSE_FEEDING.md](CORPSE_FEEDING.md).

Explicit remaining boundaries include non-Mule species scorers, live-creature/specialist pickup, pending2/state13 builder work, broader flight attachments and code11 effect escape. Entered unavailable services remain reason-bearing atomic failures; the admitted cold/stun paths retain their existing source gates. The implemented ordinary families and fixture comparisons do not establish canonical mission acceptance.

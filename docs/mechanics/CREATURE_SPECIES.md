# Shared creature species bindings

Brown introduces neutral Crabs (native selector1). The former campaign host dispatched every creature through the selector4 Mule callback and supplied MULE animation, scalar, combat and temperature data. Merely removing its selector guard would give Crabs incorrect movement, lifetime, reserve limits, defenses, animations and offspring.

The shared data layer reads the already imported, hash-admitted 25 rows at `1045FC` (45-byte stride) and ordered component pairs at `104A64`. No content-pack rewrite or saved-state migration is required. Source `5A990` chooses speed from the actual row; `5E0B0` uses its recovery cadence; `6A290` uses its lifetime, reserve, health and stage-divisor fields. The constructor's turn rate is the row's word27. The original skill clamp and truncation order are preserved.

Source `5A1C0` binds the actual loaded creature animation, falls back to its primary component when a hybrid resource is absent, and uses BONES from state26. Resource table `104494` confirms all25 identities already present in the private pack. The renderer draws each ANB component separately, retaining its own packed4 checkerboard origin, flips, clipping and opacity. It does not flatten a multi-component Crab into one parity origin.

The shared callback domain covers the Crab/Bird/Mule component family (selectors1,3,4,10,11,14,19,22,24) and ordinary pure Frog2 callbacks, including shared ground combat. Primary Bird takeoff and ordinary controlled flight use the original shared motion, physics and animation paths. Primary Bird hostile acquisition, dive impact and vertical pullup follow [BIRD_HOSTILE_FLIGHT.md](BIRD_HOSTILE_FLIGHT.md). Dinosaur callbacks, Frog hybrids, advanced Frog spit and live creature/specialist material carrying remain explicit entered boundaries. Scalar tests alone do not admit those behaviors.

Controlled flight is native73bit0400; native21bit20 separately suppresses gravity. Source6FB60 retains the common target refresh, then uses its flight altitude/arrival arm. Source6F980 permits airborne yaw for either Bird component and turns controlled pitch toward the retained dword69 target. Flight point distance uses terrain heights while pitch uses physical height, with the source avoided-terrain aim offset. The arrival call passes BL=1 to6E9E0: it snaps XY and terrain height while retaining physical height for ordinary landing physics. Source5E640 retains the flight loop and climb/descent playback cadence. Flight occupancy returns before ground obstacle queries. Ground contact also retains5B400's primary-Crab terrain-penalty exception.

The6A540 host pass clears active players'616 totals, then counts each living, unflagged owned creature before its callback. Neutral, deferred and dead records do not contribute. This counter feeds the unchanged805E0 capability predicate; supplied creatures can preserve capability on missions that prohibit Engineers. It is recomputed through the ordinary pass, not patched into saves or outcomes.

Private mapped-instruction checks cover84 angular-control cases,270 point-goal cases,48 associated flight-target cases,144 animation cases,24 complete timed Bird callbacks and12 population-prefix cases. The complete callbacks compare all nonpointer/nonlink native bytes through steering, physics, animation and lifecycle. A genuine Oid parent also passed a500-tick diagnostic save/reload/replay check; diagnostics are not campaign acceptance. Evidence is under `.private/bird-flight-20261027/`.

Movement retains native83 as the terrain-avoidance bitmask. Original `1EDCD..1EDF7` initializes it to1, then to0 for primary Crab; `74CC0` tests the caller's actual mask. Crab in either component also selects movement reserve cadence127 in `5E317..5E396`. Temperature loss uses ordered primary1060B0 and secondary1060A8 lanes. Combat uses the recipient's actual defense and source primary sound lane; only primary Mule can take the researched recoil branch (`5C0A9..5C141`).

Natural crossbreeding consumes actual parental eligibility and component pairs (`61DF4..62201`), preserves source RNG ordering, and selects the real offspring species. The original choice5 second-parent primary-component quirk is retained. Owner research eligibility reads `player+6C7+species`. The shared numeric factory accepts actual inactive priors and explicit species/rules, preserves logical pointer gaps, and leaves spatial insertion/counts to its existing host transaction. It never replaces non-Mule offspring with Mules. Capacity and unsupported-service failures retain the existing transaction boundaries.

Private mapped-instruction comparisons cover600 speed/lifecycle cases,1,250 ordered breeding cases,150 factory numeric cases, and the first genuine Brown Crab callback (1,891 instructions, every nonpointer/nonlink numeric byte equal). Those checks do not claim full campaign acceptance. Positive/negative synthetic regressions cover missing traits, invalid divisors, resource fallback, ordered hybrid selection/RNG, inactive prior/parent preservation, Crab callback rollback, absent component evidence, non-Mule recoil rejection, and independently phased overlapping packed4 components. Full private evidence is under `.private/species-callback-20261026/`.

Plant food eligibility follows6B700/6BC8E..6BD29: live growth with plant flags1/8 clear, across all owners. The friendly grouping does not skip the plant scorer. Botanist-grown flora and its owned offspring therefore remain food candidates; the former neutral-owner-only filter was a port defect. Ownership does not alter food traversal order or its two previewed query draws.

Frozen-creature damage now executes the original6D500 shard14 burst before immediate retirement. Its owner argument-1 inherits the creature owner; physical and relative heights come from the creature virtuals. Every attempted shard consumes the three caller draws even on shared-capacity failure, with successful factories interleaved. The14 constructor retains source counter/fractions/payload, enables gravity without adding audio or RNG, and shares6DF30 movement, obstacle, friction and water factories. Its4B630 mode1 callback retires on ground equality or collision payload76, rather than animation completion. Both ordinary creature callbacks and recursive staged damage bind the real factory, followed by reference/spatial/queue cleanup. No schema or pack change is required.

## Ordinary pure Frog callback

Zed supplies neutral pure Frogs before the first campaign tick. Selector2 now
uses its actual trait row, component pair, FROG animation resource, movement,
physics, feeding, mating and lifecycle paths through the shared callback. The
ordinary5E640 airborne arm is distinct: with a Frog component, no controlled
flight, and relative height at least64, playback stops and its frame is selected
from relative height shifted by10 and the sign of vertical velocity. The
ascending frame is capped at half the actual action count; descent keeps at
least half+1. Existing hold, delay and counter bytes survive selection. The
carried arm precedes that height test; ordinary ground and flight retain their
existing branches. Animation playback still occurs exactly once.

Pure Frogs now use the original shared5B580 acquisition,6EDA0/5C840 contact,
reaction20 and completed melee21 paths.5D360 separately gates advanced spit:
neutral quality must exceed90; human owners need the inherited ability bit or
actual species research byte. Entered spit and advanced approach still fail
explicitly with the enclosing transaction rolled back. Their5AAC0/34 effect
ability family and Frog hybrid callbacks remain separate work. Human Frog
attack controls are not exposed.

Private static-listing comparisons match48 complete timed5ED20 callbacks
(61,830 instructions) across states0/8, movement, relative height and both
phases, plus2885E640 airborne selections (18,516 instructions,31,680 numeric
values). They use actual FROG metadata and retain pointer/link exclusions.
Synthetic host tests cover neutral/owned airborne continuation, full replay and
late hostile-boundary rollback. An isolated1,000-tick Zed diagnostic is not a
campaign continuation or acceptance claim. Evidence remains under
`.private/frog-callback-20261028/`.

The Frog spit guard interprets bit97/20 only in approach state1. The same bit
is ordinary mating readiness in state3; it does not require an ability service
there. A focused host regression and108 additional mapped animation cases
retain that contextual distinction. The stopped Zed404 world is excluded from
continuation; its earlier pending-order checkpoint remains the parent.

The ordinary combat extension matches24 complete mapped callbacks,117,634
instructions, both participants' nonpointer/nonlink native bytes and RNG.
Cases cover near/far pursuit, ground/air, reaction, contact and completed
attacks with actual FROG metadata. These comparisons also correct the shared
neighborhood code11 predicate and kill-only neutral anchor update described
in [MULE_COMBAT.md](MULE_COMBAT.md). Evidence is private under
`.private/frog-combat-20261028/`; no original executable is run.

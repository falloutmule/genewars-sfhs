# Building damage and destruction

`damageNativeBuilding(stagedWorld,slot,damage,attacker,context)` expresses source446D0 for the current host's Genepod, Turret, Distributor, Recycling Plant, Recruitment Center, Photon Processor and Extractor selectors0/1/3/4/5/6/11. It consumes actual67-byte building priors with null process-pointer gap31..38 and actual1805-byte player records. The caller owns the complete transaction because dependent factories can recursively damage other entities and replace shared roots. The implementation re-reads those roots after each service call.

Selector5 additionally requires its ordered footprint-restoration port at44380.
That source operation sets a larger site at the stored point and retains its
landing fields/references according to724C0; see `RECRUITMENT_CENTER_DAMAGE.md`
for the exact quirk, full-map comparisons and host continuation coverage.

Partial damage subtracts health, runs the exact one-third depletion threshold, sets flags and Genepod production fields, recomputes owner capacity, requests source audio and selection refresh, performs the random fragment chance, then writes the damage flash11. Each fragment attempt consumes speed, pitch, yaw and selector draws before the real factory. Only factory success consumes its own phase draw.

Lethal damage recomputes capacity before unlinking the building. It requests selector-specific audio stops and actual family6 collapse, creates effect46, emits the destroyed message using imported name indices, clears source753F0 occupancy/vertex flags, adjusts completed counts and selection, unlinks and cleans references while native kind is4, then clears kind and updates owner count/mean. A large footprint creates the actual crater job before debris draws. Footprint times three fragment attempts precede the actual code5 area-damage factory. An owned attacker increments its player's kill counter. The source retains the dying building's old health afterimage and may retain capacity contributed by that building until the next recomputation.

The context requires real ordered services: `createEffect` for5/27..31/46, `createCollapse` for family6 selector3, `unlinkBuilding` for8ACC0/724C0 plus normalized host cleanup, and `createCrater` for79160. Lethal selector4 additionally requires `clearProcessingFront` for8B2A0 operation1 after terrain/completed-count cleanup and before selection/unlink. The campaign adapter binds the released shared processing-front helper and returns `clearedFrontReferences`. A full factory may return failure normally. Missing services throw; success-shaped empty callbacks are not an implementation. Code5 performs immediate area damage and can recursively destroy neighbors. Its absence cannot be treated as a visual omission. Other building selectors require their original special retirement/depletion callbacks and are explicitly unadmitted here.

`clearDestroyedFootprint` preserves753F0/8D5F0's actual flags-only clearing, including pointer-linear vertex writes across X row boundaries. It does not run terrain classification or borders. A write beyond the map into another source pool rejects rather than inventing wrapping. Crater creation and later terrain callbacks own their separate changes.

Evidence is statically decoded source446D0/44380/44E50/43620/43560/753F0/8D5F0 from the hash-admitted original mapping. The baseline private closed-listing comparison covers25 synthetic cases across the original five admitted selectors,34,768 interpreted source instructions and6,292,500 numeric building/player/terrain bytes, matching factory requests and caller RNG. Dependent effect/collapse/crater factories were explicit stubbed ports in that caller comparison, so it does not validate those families. Seven public synthetic tests cover ordering, completed/incomplete accounting, capacity failure, nested factory root replacement, terrain boundary semantics and outer-transaction rollback. No original executable was run.

The separate selector4 extension passes15 cases across grades0/1/2 and lethal,
incomplete, partial, already disabled and small-damage modes:19,551 interpreted
instructions and3,775,500 numeric bytes match.8B2A0 is an ordered cell/operation
port in that caller proof; its actual scan has the separate released demolition
proof. See [Recycling Plant damage](RECYCLING_DAMAGE.md) for real host services,
JSON continuation, complete callback replay and late-factory rollback coverage.

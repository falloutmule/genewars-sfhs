# Strategic Genepod species selection

`requestStagedStrategicProduction` converts source36920 inside an isolated
strategic transaction. `stepStrategicProduction` provides a standalone atomic
entry. The caller supplies an actual owned Genepod and role0/1/2. Candidate
species use the admitted25 gene pairs and25×5 production weights.

Species are visited in ascending order. Zero role weights, signed research
quality at most5 and grade0 hybrids consume no draw. Every admitted candidate
consumes one original RNG draw before the final building availability checks.
Selection uses signed gene preferences, division toward zero, signed32-bit
multiplication and strict improvement, retaining the first equal score.

A completed, enabled, idle Genepod receives its role byte and the exact814A0
input command. The required command port acknowledges dispatch; it does not
claim payment, production or birth succeeded. Missing or mismatched dispatch
rejects the standalone transaction, preserving all prior state. Retained native,
player, AI and RNG identities are checked after the port.

Six public synthetic cases cover eligibility, tie order, signed preferences,
candidate RNG before busy checks, missing/invalid command rollback and JSON
continuation. A private closed listing comparison passes21 cases and1,721,566
numeric values over21,251 interpreted listing steps. It compares complete
numeric state, RNG and input fields. The814A0 body is an explicit trace port in
that comparison and is excluded from the proof. Original native code was never
executed. This helper alone does not establish the360B0 planner or AI gameplay.

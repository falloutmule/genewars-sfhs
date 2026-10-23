# Strategic AI initialization and dispatch

`mechanics/strategic-ai.ts` implements the numeric orchestration rooted at
70B00/37870. Its supporting modules implement retained storage, group binding,
recruitment control, condition evaluation and zone-group synchronization.
Concrete strategic planners and group role actions remain required services.
The campaign opponent guard must remain until those complete services are
available; this module does not establish a playable strategic opponent.

The serializable `StrategicAIState` retains four 1726-byte AI records, four
1805-byte players, all 300 creature/256 building/20 specialist native images,
the 600-byte creature-control array, mission context and complete RNG. The
specialist blueprint binding uses `{player,index}`. Native pointer gaps31..38
and specialist192..199 remain null. Unknown numeric bytes remain null and
reject when consumed. The 1726-byte AI records come from the admitted CONQ
extension through `loadOpponentStartupAI`; they are not zeroed or regenerated.

The mission prefix includes a historical copy of the player window. The
explicit `players` arrays are authoritative for that window; AI code reads
context, markers, zones and delays from the non-player prefix regions. The
controller does not treat a stale prefix player duplicate as another player
state. `resetStrategicCreatureControl` implements72E50's 300 pair reset from
an actual prior: retain low3 control bits, write group255. It requires that
prior and does not assert a zero constructor image.

`stepStrategicAI(state, context, services)` isolates every retained array and
returns `{state,events}`. It applies flag118770 bit4,118968 bit2-clear and
ascending active-player gates exactly. `stepStagedStrategicPlayer` is the
in-place37870 body for a host already inside a complete isolated transaction.
Services must mutate its staged retained records in place; missing services,
invalid receipts or replaced held records reject. External host mutations must
belong to that same outer transaction. The public pure entry leaves all original
player/native/context/control/RNG data unchanged after a late failure.

Each nonzero-mode player increments the unsigned dword timer6 once, then calls
37540 when6AE bit1 is clear,37770 when bit4 is clear, and3BEB0. Frame32 invokes 35820. Every frame10 invokes35730 before testing unsigned delay1EB1[player]
times100 against timer6. Once that delay permits, the body reads actual roster
blueprint flags, performs37690 when6AE bit2 is clear, then360B0. It evaluates
eight seven-byte orders, refreshes player groups, invokes3BF90, maintains
building/task reservations and invokes33F60 before zone and phase updates.
No extra sleeping interval or initial grace period is added.

37540 initializes sixteen 38-byte group records at387: owner8, index11,
count4=-1, parameter10=0 and zone12=-1. Other group bytes are retained. It
registers every active building in that player's ascending 64-slot block via
the complete32CC0 numeric contract: first two Genepod3 local slots go into
5E8/5EE only when the retained value is64; each active local slot receives
reservation55=1. It then copies player0's established research/knowledge
ranges into the opponent, clearing the low11 fractional research bits in
25 signed dwords. Source ordering also works when player0 is the opponent.

37770 visits all 300 creatures. Only actual owned, active, virtual68-clear
creatures receive control `(prior & 0x1C) | 0x22`; group links are retained.
The actual owner group is then established by36C10. That routine uses strict
ascending nearest ties, preferring Genepod3, then another building, then the
player center or start target. Its existing-group fallback deliberately tests
the AI owner's building-count byte, whereas the new-group branch tests the
target player's count. Both source paths are retained.73690 uses the original
32768-coordinate wrap through doubled16-bit subtraction.

3E270 initializes the actual group point/count/type/parameter/zone, writes the
low6 flag bits while retaining destination bits6/7, and clears six target
indexwords/active bytes while retaining each target's fourth byte. Limits use
the six admitted numeric bytes at object3+79D4. Group5 adds signed AI664 and
the signed zone quota divided by256 toward zero, keeps BX wrap, and floors the
result at1.3E8F0 moves an existing group and updates actual live members'
110/114 goals and96/97 flags. Inactive or protected members are unbound with
the source count decrement and control-bit clear. Indices are retained.

3BEB0 runs on frame16, selects `(frame &255)>>4`, then performs its actual
conditional owner-group and group0 calls. A group can be called twice in one
pass. Each condition is reread after the prior callback; no deduplication is
allowed. Its required `stepGroup` service is the complete3C700 role callback.
An unimplemented group kind cannot be acknowledged with an empty receipt.

37690 performs the complete32E60 recruitment controller, sums four desired
category counters modulo256, processes all64 marker records of8 bytes at1C9E,
and refreshes its owner group before setting6AE bit2. Marker type6 supplies
the group index in signed byte5, the owner in byte6 low3 and the group kind in
byte6 high5. The marker constructor's parameter is the retained EBX owner,
not a constant1.

32E60 skips recruitment while actual player499 is nonzero. Otherwise it makes
five ascending passes over categories0..3.32F10 chooses a named, healthy,
inactive blueprint from all32 records, using signed skill17 plus signed
maximum health19, with strict first ties. The signed current health1A must be
positive.81300/81310 finds the first free slot in the owner's five specialist
records. Capacity failure preserves player/BP data. Success sets blueprint20
mask0x01 before requiring the actual4FD30 constructor, then clears native112 bit0
and appends the actual slot to the player roster. The constructor port must
provide the real native image and logical blueprint binding.

The source32F10 caller increments69E after a selected blueprint even if81300
reports capacity failure.32E60 still requests81390 command10/deployment1,
selection-1 in that case.81390 then calls80830. Both afterimages are retained,
including their surprising capacity behavior. `createLanding` must execute
the actual80830 family, including allocation and player references. The core
does not fabricate a landing or make all new actors active by default.

3EBD0 implements all four condition kinds and the disabled-byte gate. Building
and species conditions use actual owner pools and signed native selectors;
virtual68 protects creatures. Kind2 is strictly `AI timer < selector*1000`.
It is not an elapsed-time greater-than predicate. Kind3 is a strict signed
resource comparison.37870's bookkeeping clears inactive-building reservations,
subtracts10 from positive signed cooldowns without clamping, and keeps a build
selector reservation only when an actual bound Engineer roster record retains
that selector. It does not invent an active normalized construction task.

3C4A0 responds to the actual zone revision byte34B9, creates positive-quota
groups in the first free slot4..15 and retires exhausted-zone links with the
actual creature-control cleanup. It retains the original OR behavior for
duplicate zone group metadata. The final attack-phase controller preserves
unsigned elapsed wrap, the63A preview interval, intermediate639=1, phase-count
comparison and97 timer update. These metadata updates do not issue an attack.

Required remaining services are explicit in `StrategicAIServices`:

| Service             | Source family | Required behavior                                                                        |
| ------------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `createSpecialist`  | 4FD30         | Real retained200-byte constructor, blueprint/resource binding and host projection        |
| `createLanding`     | 80830         | Actual deployment allocation, player references and landing scheduling                   |
| `stepGroup`         | 3C700         | Group target maintenance and all kind0..5 creature role/order paths                      |
| `directCreatures`   | 35820         | Feeding/attack target decisions with actual species genes, terrain and live pools        |
| `allocateCreatures` | 35730         | Unassigned-creature allocation through3C2A0 and actual3E5A0/3E6B0 or81C60 orders         |
| `planBuildings`     | 360B0         | Genepod results, production, settlement/build selection, real cost/site/command services |
| `planAttack`        | 3BF90         | Source recruitment thresholds/RNG, group transfers and launch callback                   |
| `planSpecialists`   | 33F60         | Real Engineer, Shepherd, Geneticist and Botanist orders with source target scoring       |

These are distinct missing bodies. Their typed receipts validate the binding
boundary; a receipt does not prove an implementation. Neither the default
entry nor the campaign host installs a no-op provider. Preserved Rust has
reusable blueprint RNG/generation and human entry contracts, but no complete
37870 strategic implementation. Existing native specialist/landing/production
families can back the narrow factory/action ports once their host adapters are
bound; the preserved data alone does not run them.

`tools/import-original/strategic_ai_profile.py` admits only the executable
identity and six hashed unsigned numeric group limits. Its provenance records
object3+79D4, virtual1079D4, six bytes, originalExecution=false and SHA-256
`b2c9995a81357cf8cf6b6d59e964165b009fc3c9450769ea5ee35d1362b9c9fe`.
No shared importer/schema file is changed by this module.

Thirty-four synthetic TS tests cover mutation ranges, strict ties, coordinate
wrap, inactive/protected control cleanup, retained bytes, duplicate scheduler
calls, recruitment order/capacity, conditions, timers, JSON restoration, native
pointer/extent bounds and rollback after an earlier player or RNG mutation.
Four synthetic importer cases cover numeric/provenance, foreign and oversized
inputs, changed/truncated tables and object bounds. The private closed listing
comparison covers36 cases including actual mission3's first noncadence pass,
with2,950,275 compared numeric values and131,504 model steps. Pointer gaps are
excluded; player bytes are compared through authoritative player arrays.
The unimplemented planner/group bodies are explicit trace ports in that
comparison.4FD30/80830 use supplied synthetic afterimage ports, so the report
does not claim constructor proof or strategic gameplay. No original executable
process/native code is run, and canonical campaign acceptance remains0/24.

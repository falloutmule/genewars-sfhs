# Timed demolition and salvage

`451F0` tests building flag `0800` at `4523B`, before the completed,
disabled, upkeep and selector branches. The host invokes
`stepStagedCampaignBuildingDemolition` at that exact owner/slot callback
position. It handles incomplete buildings too. Ordinary selector work and
upkeep must not run again after this complete callback.

Each callback sets native byte21 bit4 and subtracts eight from the signed
32-bit timer at54. A positive result runs the original common tail at47DA4:
conditional energy decay/audio stops, dirty-counter decay, current building
ANB selection and animation. Incomplete nonpositive-health buildings skip
the draw/ANB work. Canonical native ANB bytes must survive later projection
synchronization; a stale producer/Extractor animation must not overwrite
them while flag0800 is set.

At zero or below, the callback optionally creates salvage, updates the
starter's still-matching target reference after that factory, stops the
applicable loop, runs43620 capacity calculation, and then retires through 44380. It returns immediately. No ownership transfer, immediate refund,
explosion, crater, collapse or additional upkeep is introduced.

The starter reference64/66 is dereferenced only when kind66 is3. There is
no live-kind check on its retained specialist record. A retained logical
blueprint binding supplies signed skill byte23 even after specialist
retirement. An unknown C0 binding is an explicit error; native116/24 alone
does not prove which source pointer survived.

The payload follows source integer operations in order: signed cost SAR1,
wrapping signed32 multiplication by signed8 skill, truncating IDIV100,
SAR4, and signed8 promotion. Factory45 stores the low byte both as ANB
delay29 and payload76. Its pickup reads76 **unsigned** and shifts left4.
This arithmetic, including signed overflow and negative payloads, is
deliberately preserved.

## Retirement

44380 calls753F0 with EBX=0 and ECX=0. The adapter reuses
`clearDestroyedFootprint`, which clears occupancy1 and protected-vertex16
only. It preserves the source pointer-linear X traversal at vertex rows.
It does not reclassify climate/material, rebuild terrain borders, preserve
shared reservation bits, or schedule a crater. The construction
`releaseSite` operation has additional behavior and is not used here.

Completed count600+selector decreases only when completed bit1 was set.
Selector2 and4 run the original processing-front8B2A0 scan using the admitted
10457C offset. `clearStagedCampaignBuildingProcessingFront` exposes that
scan for other44380 callers: signed plant growth word44<=0 clears native46
bit4; operation1 (selector4) also clears Mule96 bit20 when unsigned state94
is at least24. It uses current cell head→next order with no owner, health,
species, distance, or corpse-eligibility filter.

Selector13 subtracts unsigned native54 from raw Goop4A7 after the signed
demolition timer write. This source quirk can increase the balance when
the terminal timer is negative. Then selection presentation is cleared,
the actual building is unlinked,724C0 clears matching reference kind bytes,
native6 is cleared, and owner count4A2 decreases.43560 updates mean coordinates
only if the resulting signed count is positive; zero preserves the old
mean. Source capacity is calculated before unlinking and is not recomputed
by host synchronization. The staged adapter removes current building/view
and economy rows in place, retaining held roots.

Selectors5 and12 require separate admitted retirement dependencies and
remain explicit errors in this bounded adapter; selector9 has no admitted
ordinary resource. The shared flags/count/reference behavior for admitted
selectors is reusable. Other building work families remain separately
guarded.

## Salvage effect45 (0x2D)

`createStagedCampaignSalvage` uses the real200-slot shared allocator and
descriptor45, `02 01 0C FF 01 01`: mode2, gravity, priority12, no expiry
child, movable, water response. Full capacity can return null; demolition
still retires the building. Factory48C22 creates owner9, phase70=1,
timer74=5000, flags0180, zero velocity/angles, and no parent/newborn mark.
Counter30, fractions67/68 and untouched numeric priors survive slot reuse.
Process pointer/resource bytes31..38 stay null. No factory RNG or audio is
added. Original EFF45 has one zero-hold frame.

`stepCampaignSalvageEffect` binds the complete6DF30 flags0180 motion and
mode2 timer/ANB callback before4CB4A/4D00A pickup. This includes gravity,
ground slide/friction, first bounce, airborne speed cap,74270/6DD50 obstacle
response, wrapped coordinates and actual unmarked water-child requests21
(0x15) or48 (0x30). Their original priorities19/20 cannot replace their
executing priority12 salvage carrier. Current parent state is published
before recursive allocation and the subsequent own-cell query.

A timer that becomes negative retires before the pickup query. Otherwise
the query stops at the **first** current kind1,3 or4 entity in the effect's
cell. It does not search past a Mule, building or wrong-role specialist.
Owner9/phase1 pickup succeeds only when that first entity is a specialist
whose actual blueprint category22 is0. The credited owner comes from that
specialist. Funds are a raw unsigned32 add of unsigned payload76<<4;
there is no80780 cap, Goop credit, warning, burst, sound or RNG. Successful
pickup retires through the shared scheduler's normal reference cleanup.
Other owner-tagged45 pickup families are explicit unsupported contracts.

## Integration and verification

The staged adapter assumes its caller already isolated all authoritative
host roots. It never commits a nested clone over held economy/building
arrays. `stepCampaignBuildingDemolition` provides a standalone whole-host
atomic wrapper. Effect options must bind actual recursive factories and
source reference cleanup. UI/audio events remain serializable requests.

Public tests arrange synthetic phases and test normal constructors,
capacity failure, retained references, first-candidate traversal, delayed
funds/wrap, flags-only terrain, processing-front predicates, rollback,
ordinary `stepCampaign` dispatch, and save/replay.

Private evidence is retained in
`.private/building-demolition-proof-20261023/`. The closed listing
comparison does not execute the original program. It compares5 factories,
96 complete effect callbacks,48 demolition callbacks, and24 flags-only
terrain clears against pinned preserved listings/data. Spatial operations,
capacity/44380 services in the451F0 numeric comparison, and unsuccessful
water-child allocation are declared ports and tested separately in the
host. The corpus includes actual6DD50 deflection and water request ordering.
It is bounded mechanism evidence, not mission acceptance or proof for
unsupported selectors/owner tags.

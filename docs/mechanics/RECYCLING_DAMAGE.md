# Recycling Plant damage

Selector4 now uses the existing446D0 damage family and the released44380
processing-front cleanup. Existing selectors0/1/3/6/11 retain their damage
bodies. Rules, health, footprint and message indices come from the admitted
pack; tests use synthetic records and assets.

`BuildingDamageContext.clearProcessingFront(world,slot)` is lazy and required
only by lethal4. `damageCampaignBuilding` binds it to
`clearStagedCampaignBuildingProcessingFront` and returns the ordered identities
in `clearedFrontReferences`. This is an already isolated entry: its caller
owns the whole host transaction, including recursive effect factories.

## Source order and retained fields

Partial damage subtracts native43 health. Crossing the one-third threshold
while0040 is clear sets native21bit4 and native49flags0140, runs44E50/43620,
and emits the existing source warning/selection presentation when appropriate.
Selector4 retains native54. Random fragment chance and dirty48=11 follow.

Lethal damage runs43620 before unlinking. Selector4 has no selector-specific
audio-stop or family6 collapse branch. Effect46 and the destroyed message
precede44380. Its order is:

1. 753F0 clears only the actual footprint occupancy/vertex flags.
2. Completed600+4 decreases only when native49bit1 was set.
3. 8B2A0 operation1 scans the imported processing-front cell in head→next order.
4. Selection clears, then8ACC0 and724C0 run while the building kind is4.
5. Native6 clears, raw4A2 decreases, and43560 updates the surviving mean.
6. Footprint2 creates the actual79160 crater variant0 before six debris attempts.
7. Effect5 completes its real immediate area damage, then attacker accounting.

The processing scan clears plant46bit4 for signed growth44<=0, and Mule96bit20
for unsigned state94>=24. It does not unlink or retire these materials. The
helper preserves both JSON-separated equal Mule images in place and rejects
different numeric images rather than hiding an unrelated stale command.

There is no selector4 native54 subtraction from rawGOOP4A7; that is the separate
selector13 branch. Native54, dead health and the source pre-unlink capacity
afterimage remain retained. Host projection synchronization does not recompute
capacity after unlinking. Thus an intact grade0/1/2 storage contribution can
remain400/800/1200 until a later source recomputation. An incomplete4 still
contributes to the pre-unlink storage calculation and does not decrement its
completed count.

## Verification and limits

Ignored `recycling-damage-source.py` and `recycling-damage-conformance.ts` read
the admitted QA BETA V5 mapping, with executable SHA-256
`4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba`.
Fifteen closed static-listing cases cover all three grades and five damage
modes:19,551 interpreted instructions,3,775,500 numeric native/player/terrain
bytes, ordered dependent requests and RNG match. The source fixture SHA-256 is
`56bdba16bed959e3e4c75876d0a5de1e46ac854a1cea8f2b4dbe814730c63ef8`.
The proof records8B2A0's exact front cell/operation1 as a port and reuses the
separately proven shared scan; effect/crater/collapse bodies remain declared
ports in this caller comparison. Older comparison files are unchanged.

Twelve public tests cover grade/completion accounting, threshold writes,
retained GOOP, service ordering, real front-cell cleanup, native/player
identities, JSON-separated images, mismatch rejection and actual crater,
fragment and blast factories. A malformed debris ANB fails after staged front
cleanup/unlink/crater and rolls back the complete outer blast transaction,
including held original native/player/terrain/RNG roots. Save continuation
matches complete checksums. A separately declared synthetic incoming37
projectile drives ordinary `stepCampaign` through child0 and actual4 damage;
the complete campaign replay and post-destruction save continuation match.
This arranged test is not an ordinary mission route or mission acceptance.

Original code was read as evidence, never executed. Missing profiles, front
offsets, native images or dependent services still reject. Other unsupported
building selectors and higher-grade collectors retain their separate
boundaries. Canonical acceptance remains0/24.

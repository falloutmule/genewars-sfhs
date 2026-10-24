# Recruitment Center damage and retirement

Selector5 uses the common native67 building vtable112120. Damage virtual34 is
`446D0`; virtual68 is `1EBC0`, which returns signed health43 at most0. Physical
height is ground17 (`1F450`), relative height is0 (`1F440`) and movable is false
(`1F430`). The generic damage body is reused without changing other selectors.

The damage switch sends5 through the ordinary branch. It requests no
selector-specific audio stop and no family6 collapse. Partial depletion shares
the exact one-third-health threshold, flags0140, capacity recomputation,
fragment chance and damage flash11. Only selector0 clears DWORD54 on this
threshold; selector5 keeps its current pad fields.

Lethal damage requests real effect46 (`0x2E`), emits the destroyed message,
runs44380, then creates crater variant0 for the normal footprint2, makes six
27..31 (`0x1B..0x1F`) debris attempts and creates the actual code5 (`0x05`)
blast. Factories can fail for capacity. Their own draw occurs only after
successful allocation. Recursive area damage completes inside the current
whole-host transaction; a late failure rolls back earlier map, reference,
player, native, factory and RNG changes.

## The selector5 retirement quirk

`44380` first calls753F0 at the stored building point with its normal size2,
B0/C0, clearing occupancy1 and protected vertices16. It then decrements the
completed selector5 count when bit0001 is set. The selector5 branch at
444FF..4453D computes a point using1124F0 but does not use that local as EAX.
The actual next call retains EAX=building+7 and uses size3, B1/C0. Thus it
**sets** a larger footprint at the original stored point before selection,
unlink and reference cleanup. The conversion preserves this behavior; it does
not move the operation to the landing offset or replace it with a release.

`setNativeBuildingFootprint(terrain,point,2|3,terrainBorder)` implements this
753F0 set operation. Construction uses2 and selector5 retirement uses3. Each
ordered center/perimeter visit runs8CBA0: four nonwater material corners become7,
ordered8B890 material repair runs, borders are rebuilt through8D1B0, and the
visited cell receives occupancy1. Recomputed borders include84E10's cell11
OR0C; legacy847D0 viewport/cache updates are presentation only. The source97
hexadecimal texture sentinel also recomputes a retained protected80 cell with
that texture. The existing border calculator is reused while preserving that
sentinel behavior.

8CBA0 passes a linear cell index to8B890. An X borrow/carry changes its row
before8B890 masks the axes. The literal index-1 invokes8B890's pointer-derived
branch using8CBA0's fixed row-start pointer. The helper retains both behaviors;
wrapping X first loses these edge afterimages. Final8D580 vertices use a linear
X pointer with wrapped Y. A write beyond the map into another source pool is an
explicit conversion boundary, rejected before mutation.

The campaign adapter exports
`restoreStagedCampaignRecruitmentFootprint(world,slot,pack)` and binds it both
to the damage context's required lazy `restoreRecruitmentFootprint` port and
the timed-demolition44380 path. The helper reads the actual native point and
admitted terrain border table. It does not replace held native/player records.

## References and retained landing fields

44380 selection cleanup precedes8ACC0 unlink and724C0 reference cleanup while
the building kind is still4. Kind6 is cleared only afterward, followed by the
owner count and mean-position update. Active effect49 (`0x31`) and power
effect33 (`0x21`) parent/destination references lose only kind byte73. Their
index71/72 remains. Inactive effects are not changed. The corresponding current
landing/native copies are updated, including JSON-separated saved images.

Player496/498 does not point directly to the center and is not cleared by this
retirement. Later49 retirement owns its unconditional498 clear and499=700.
An active49 whose parent73 was cleared no longer calls building status/75240.
A separately retained kind4 reference still resolves its native record even
when inactive, as the source does; no active-kind normalization is introduced.

44380 leaves native51,52,DWORD54 and60 untouched. They retain any changes made
earlier in the current caller. In timed demolition, this includes the already
decremented DWORD54 timer. Center destruction does not itself credit money,
transfer ownership or cancel unrelated player reinforcement references.

## Verification

`tests/recruitment-center-damage.test.ts` has12 synthetic cases: all three
grades, partial depletion, required service and native-boundary failures,
literal-1 sentinel, actual crater/debris/blast factories, normal full capacity
false, late recursive failure, timed-demolition save/rollback, and ordinary
37 (`0x25`) projectile→blast0 destruction followed by full save continuation
and sealed command replay. Held native/player identities and retained landing
references are checked. These arrangements are not mission acceptance.

The ignored `.private/recruitment-center5-proof-20261023` comparison interprets
preserved static listings and admitted data, never the original program:

| Comparison | Cases | Instructions | Compared bytes |
| --- | ---: | ---: | ---: |
| Whole446D0/44380/724C0, capacity, owner mean and terrain | 15 | 359,487 | 3,994,500 numeric |
| Direct753F0 set2/set3 with full material/border/84E10 afterimages | 16 | 575,130 | 3,670,016 map |

All differences are zero. The caller comparison includes active49/33 and
inactive-effect reference afterimages, raw player association/cooldown,
native51/52/54/60, grades, completed/incomplete, threshold/disabled/small damage,
mixed materials, protected97 cells, X carry/borrow and Y wrap. Dependent
48790/4EB80/79160 factories, audio/messages and final GUI/cursor cleanup are
declared ports in that caller proof; the actual host tests cover the reached
recursive effect/crater services. Existing generic and selector4 damage and
timed-demolition tests remain separate regression coverage. No broader
selector admission or canonical campaign acceptance is claimed.

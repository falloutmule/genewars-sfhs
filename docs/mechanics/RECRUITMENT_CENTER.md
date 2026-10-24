# Recruitment Center, selector 5

This family implements the selector5 building callback and its ordinary native
Engineer construction path. It uses the existing human roster, shared49 landing,
landing-pad, economy, demolition and damage families. It does not admit the other
building selectors. Canonical campaign acceptance remains0/24.

`stepStagedCampaignRecruitmentCenter(world,slot,pack,services)` belongs at the
actual owner/slot building callback position, before generic incomplete handling.
It owns the entire ordinary451F0 envelope, including upkeep, inactive energy
decay, dirty flags, grade/action selection and one7AC00 animation advancement.
Returning handled=true prevents a second generic economy/ANB pass. The earlier
common0800 demolition dispatch remains separate and must run first. The standalone
`stepCampaignRecruitmentCenter` isolates the complete mutable host, including real
cross-pool allocation, raw player references, spatial links, audio and visibility.

The independently expressed numeric controller is
`stepStagedRecruitmentCenter`; its standalone counterpart returns an isolated
world. Required native bytes are checked when consumed. Native pointer gaps stay
logical nulls, and unconsumed retained bytes survive. Missing7F480 is rejected
only when the source actually requests it. Capacity failure is an ordinary null
result; a later missing profile rolls back the outer transaction.

## Ordinary callback and associated landing

The authoritative body is451F0, specifically470E1..471B5 and the common tail
47D63 onward. Complete, enabled centers subtract unsigned upkeep5 and drain63
from signed energy61 with word wrapping. Exhaustion clamps energy to0 and,
unless0100 suppresses the power transition, clears powered0004 and starts the
owner5EA warning only when that signed word was0. Energy is capped at200; the
active switch decrements drain63 once. Incomplete, disabled or0100 states also
perform the exact conditional inactive energy decay.

Byte60==2 requests7F480 only when player498.kind and the signed/unsigned-zero
test of dword499 are both0. This branch does not additionally require power.
The callback writes60=0 **before** calling the factory. A full effect pool leaves
that0 afterimage and does not retry on the next callback. Powered, complete,
enabled, non0100 centers advance direction28=1; otherwise they reset direction
and frame. Disabled action4 uses the current grade frame; ordinary complete
action is grade+1; an incomplete center uses action0/target-grade frame and skips
the queue when health is below1. Dirty timer48 and retained ANB counters follow
the common callback.

`requestStagedCampaignCenterLanding` is the actual7F480 caller. It adds the
hash-admitted1124F0 signed offset to the building point with word wrapping and
requests real49 with parameter0, parent kind4/building slot, height native17+
0x6400 and the original fixed angles. On success it publishes the actual returned
slot/kind into owner496/498, performs selected-owner reveal, and writes the
prepared point to owner9/11. It does not run80830's specialist56E20 prefix.
Existing source49 contact/takeoff/activation and75240 pad callbacks remain the
authoritative continuations, including retained inactive parent records.

The field meanings are specific to selector5:

| Native field | Source meaning                                                        |
| ------------ | --------------------------------------------------------------------- |
| 51           | Retained constructor byte;49 contact and takeoff reset it to0.        |
| 52           | 75240 pad phase/pulse byte.                                           |
| 54           | 75240 landed stamp byte; the constructor clears the containing dword. |
| 60           | 0 idle,1 landing contact,2 pending automatic associated request.      |

The generic storage pass does not write center54. The numeric compatibility
projection retains its value without treating it as harvest or production state.

## Construction and resources

43E30 resets the common kind4 fields,60 and dword54; its selector5 branch also
sets52=0. It retains51,53,58/59, counter30, timer48, energy61 and drain63. Real
44FF0 resource binding resolves imported `BLAUN`, whose original metadata has
five actions and twelve frames. There is no synthetic-resource fallback.

507D0 deliberately calls74E80 with discriminator100. Its initial admission
therefore omits the extra landing-pad predicate. The separate
`classifyRecruitmentCenterSite(terrain,point,offset,occupied)` implements full
74E80 discriminator5: test the main2x2 first, then test aligned main point+
1124F0 as3x3 with discriminator100. A rejected main site needs no offset profile.
Strategic site queries use this explicit full form only for discriminator5.

Native534D0 task0 retains both terrain jobs in the existing25-slot shared pool:

1. At the main anchor, allocate footprint2 and enter stage1.
2. After its actual job retires, select anchor+1124F0, return to stage0 and use
   the normal specialist movement continuation.
3. At the second point, perform753F0(BL0,ECX0), allocate footprint3 and enter
   stage2. Capacity false preserves stage0 after the real release.
4. After that job retires, perform75240(point,null,0,0), then move to the
   deterministic104578 working corner and stage3. Only the existing completion
   speech draw occurs; selector5 does not draw a random working side.
5. Existing stages3..5 own payment, placement44, contribution441C0, completion,
   repair, command release and departure. No second movement or terrain-job
   scheduler is introduced.

Cancellation through stage4 releases both the main2x2 and offset3x3 with exact
753F0(BL0,ECX0); stages1/2 retire only their currently bound native job. Stage5
retains its incomplete building. The initial42B90 reservation uses the actual
753F0(BL1,ECX0) material/border walk, including unwrapped X borrow/carry, then
reads the original perimeter-average target height. It preserves native linear
vertex writes. A write that would cross the terrain array into another source
pool remains an explicit error; it is never replaced by invented toroidal bytes.

The imported tables allow grade0 center construction from carried progress3,
after a completed Genepod0 or the actual acquired-center bit. Its source
footprint is2, cost600 before the Engineer skill adjustment, health160/320/640,
and upkeep1. Thus construction first becomes possible in canonical mission4
Roach. The first serialized center is mission10 Pylon, slot1/owner0; another is
mission17 Ape, slot1/owner0. Those records already use the existing45010/44FF0
loader. Availability is not evidence that a mission has been accepted.

## Damage and retirement boundary

The separate building-damage/demolition implementation owns the complete
selector5 destruction path and recursive damage services. Source44380 first
clears the ordinary footprint, then selector5 unusually calls753F0 at the
**stored building point** with size3,BL1,ECX0. Although the listing computes an
offset local, that local is not the EAX argument. This sets occupancy and vertex
protection using real8CBA0, rather than clearing an offset footprint. Numeric
fields51/52/54/60 remain retained. The shared724C0 cleanup clears49's parent kind
while preserving its index operand; player498 is retained until its actual
landing lifecycle clears it. See the damage worker's comparison receipts for
that distinct family; no all-selector destruction fallback is installed here.

## Verification

Public synthetic tests cover state/power/word-wrap branches, retained constructor
bytes, real shared capacity and49 allocation, actor-prefix preservation, both
Engineer jobs, deterministic side/RNG, cancellation, lazy profiles and complete
late-error rollback. Parent host tests cover the ordinary two-site build, source
stage snapshots, pending-save continuation, associated human landing and recorded
replay. Synthetic profiles are explicitly fixtures, not canonical assets.

Private closed static-listing comparisons, without original program execution:

| Scope                                              |  Cases | Interpreted instructions | Compared numeric values |
| -------------------------------------------------- | -----: | -----------------------: | ----------------------: |
| Whole451F0 selector5,4 owners×3 grades×22 branches |    264 |                   72,828 |                 494,208 |
| 43E30/44FF0 plus actual8AC60 insertion             |      8 |                    2,268 |                     472 |
| Whole534D0 and811A0/51960 commands                 | 108+28 |                   24,359 |                 804,240 |
| Whole7F480 caller, actual converted49 factory      |     16 |                    1,072 |                 173,316 |
| Whole42B90 size2 reservation and84E10 map writes   |      8 |                  158,014 |               1,835,008 |

The451F0 comparison excludes the separately compared7F480 cross-pool body and
83140 presentation. Engineer comparisons include the complete native control
decisions and RNG, with terrain reservation/release,75240,44 and441C0 as explicit
concrete family ports; common movement/ANB have their existing separate proofs.
The7F480 comparison excludes original48790/75B00 bodies, uses the real converted
factory, and compares complete player afterimages, unchanged specialist/RNG state,
successful factory arguments, returned identity and reveal presence. Independent
full-map reservation and destruction comparisons are recorded privately. These
receipts do not establish integrated campaign or human/physical-device acceptance.

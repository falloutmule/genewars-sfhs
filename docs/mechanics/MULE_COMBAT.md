# Mule hostile contact and reaction

`mule-combat.ts` implements selector4 Mule combat against creatures(kind1),
specialists(kind3), and buildings(kind4), for owners0–4. `mule.ts` delegates
neighborhood decisions, pursuit, completed attack, hit/recoil and feeding
continuation to these functions. It retains the existing physics, animation,
mating, feeding, mortality and serializable native124 records. Specialist and
building damage executes through required services against their current
native records; it does not substitute creature health or death rules.

The source is the admitted QA BETA V5 candidate, SHA256
`4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba`.
Evidence is the preserved `player-creation`5ED20/5E640/5EB30 listings,
`initial-creature`6B700/6B150, `construction-command`5B9F0/1EE50,
`terrain-map-refs`5B580/74CC0, `mission-array-refs`5CC60, and
`activation-rng-refs`6DB90/707A0/5CDB0. Static review of admitted relocated
object1 also covers5B260,6FB60,65F04,69730 and8AE10. These files are read-only
evidence; the implementation does not execute original code.

## Numeric content and query order

The host supplies `MuleContext.combat: MuleCombatTraits` from the admitted
private pack. Species4's45-byte row is LE object3+46B0, SHA256
`6289b68eea87a5228a06c9db3f31e3d3cbaebc89bf23f27ab6752a8b89ce8114`.
The fields are signedDWord query radius+0; unsigned attack/confidence+4,
defense+5, disposition+24hex, and food weights+1D/+1E/+1F. The attack sound
is signedbyte object3+60A4, independently admitted. There are no process
pointers in these numeric traits. Missing traits reject an actual encounter.
Building classes come from admitted104DE0, and their four signed104E12 radii
come from LE object3+4E12(length8), SHA256
`8cb0e2422b9e82feae1c3e540d689a87a2675f952d36fe60b52ad62e6a88cec5`.
Those attack/approach radii are distinct from74270 collision extents.

`queryMuleCombat` previews the two X/Y traversal draws used by the food
and mating scorers. Conditional specialist rolls also advance its preview.
`consumeMuleCombatQuery` commits the complete preview at the original caller's
draw point; food and mating still inspect the same initial traversal. X is
outer and Y inner; sample cells inside the squared
radius are visited in source order, then their actual shared list head→next.
The sample distance determines weight; the candidate's exact signed15 wrapped
position determines its16-way angular sector. A strict improvement replaces
the selected pointer, preserving the first tie. Alliance tests are asymmetric
and neutral owner4 has no inferred player alliance record. The source primary
threat count/sector weights and secondary selected pointer are separate:
hostile buildings are secondary only, hostile living creatures are secondary
and primary unless state15, and hostile specialists follow their real style.
Styles0/1 set both flags without a draw; style2 uses one20% roll; style3 draws
only below charge224, comparing the roll with224-charge. Actual virtual68
rejects dead enemies before these rolls. Friendly entries, including plants,
are counted before enemy death/style gates.

One intentional conversion bug fix applies to6B700's undefined specialist
branches. The original can leave its primary/secondary stack flags
uninitialized after a failed style2/3 roll. Both flags start false for each
candidate here. Determined branch writes and all source draws are preserved;
the undefined original branch has no claimed byte parity. A synthetic test
places a failed specialist immediately after a successful creature to ensure
the previous candidate's flags cannot leak.

The decision uses signed integer divisions in source order for health,
enemy-sector pressure and friendly-sector contribution. A disposition roll
above its trait bypasses the confidence draw and pursues; it does not cancel
the encounter. Low confidence executes the real friend/no-friend escape draw
sequences and707A0's additional direction draw. That search tests16 headings
using74CC0's terrain-mask/plant-weight predicate. The occupied-cell neighborhood
branch instead uses73E00's one-draw circle of radius384. Ordinary idle escape
continues to use73C20's two draws. These paths are not interchangeable.

## Contact, animation and damage

5B580 releases the previous action first, then installs logical references
55/57 and retained task58/5A. Creature/specialist pursuit uses50/52 and
preserves the literal goal11/13 until the real6D390 movement refresh copies
the associated record's current position. A target with virtual10's0400
flight flag is refused at acquisition. Hunger flag61&40 can remain set during
a hostile encounter and does not disable live contact.

Building acquisition queries actual74270 at the Mule. Outside the target it
sets nominated4D/4F and a center goal. A clear path replaces that center with
the source7024F radius boundary. The required74D90 predicate owns nominated
building admission, including5B260's occupied-cell waypoint selection.
Nominated arrival uses source distance squared400 and its exact flag masks.
Already inside the building, acquisition performs the real two-draw73C20
escape with radius104E12+256. It does not use a construction footprint.

Live specialist pursuit includes the style2 doubled timeout and original
quartet bail roll. A target above1280 relative height with the flight flag
takes65F04: release/wait, or the eligible current-cell8AE10 fallback. That
query uses actual head order, compares owners without alliance expansion,
and draws nothing. It preserves the original coefficient-sort/index-rank
behavior, including all-equal coefficients selecting nothing and the
state26 corpse cutoff.

Physical distance73770 includes signed15 wrapped XY and the physical height
difference shifted by3. Contact range128 and angular tolerance256 are
inclusive. False contact only turns desired yaw; true contact installs
state21, source stop fields and the conditional attack-sound draw. It causes
no damage. Buildings and dead specialist arrival enter5C840 directly through
the actual arrival flags. Directional actions8–15 use the reserve-dependent delay;
state20 uses action16 and researched recoil state16 uses action23.

5EB30's actual animation completion sets timer6C to0. Completed state21
rechecks range, pays reserve, calculates skill-scaled attack and the required
operator contribution, draws attack variation, then calls5B9F0 on the actual
staged target. Specialist attack damage is quartered after reserve, operator
and variation calculations. Building damage is halved, uses range104E12+64,
and plays source88 before its synchronous virtual34 damage service. A surviving
building reenters attack21 directly; a surviving specialist returns to pursuit.
A miss consumes its original wait draw and retains references.
Damage subtracts skill-scaled defense with a minimum effective1. The source
speed comparison can stop the target. Nonlethal damage enters hit20, or the
actual neutral-skill/owned-research recoil ability16 when reserve permits.
The latter spends7 reserve and uses its66F draw to set the real knock-away
impulse; CL1 conditionally draws pitch when virtual height<=128. It does not
invent an impulse of1. Owned hit completion resumes the retained ordinary
move command; other retained task commands reject pending their own command
families. Neutral completion runs the same query/scorers and attacker fallback.

Lethal damage enters ordinary corpse24 immediately, retaining the creature
pool identity for the existing corpse/BONES lifecycle. It does not decrement
the creature count at death. It publishes one `mule-combat-kill` receipt.
Successful specialist damage whose retained record still has kind3 enters
consumption state6 with its actual10+rand%6 timer. While waiting, its quartet
branch emits source32/0x20 blood at physical height; expiry performs69730's
unscaled1000 nutrition, lifetime/growth tradeoff, sound27 and ordinary wait.
If external destruction clears the target kind, the Mule instead performs the
source idle/occupied-cell transition against the already updated spatial list.

## Transaction and host obligations

The whole Mule callback still stages ecology, terrain and RNG and commits
them only on success. `combatEffect(stagedEcology, stagedTerrain, rng, request)`
is required on blood emission. Its request is code32/0x20, source identity,
position, `[yaw,pitch,speed]`, and optional physical `height`. Ordinary5B9F0
blood uses source ground;69730 supplies physical height. The factory consumes0
extra draws. It runs immediately after the three
parameter draws, before subsequent combat queries/draws. Corpse eating captures
its query before the particle and resolves confidence afterward, in the source
order. Effect replacement cleanup must therefore use an isolated complete host
transaction and mutate held Mule/native array identities in place. A closure
that mutates the authoritative world breaks rollback. Dynamic shared-cell and
effect-selector lookups must see this staged host. The actual8ACC0 `relocate`
port publishes position-cell changes before cell-entry queries, including
arrival snapping. Buffered movement receipts must not relocate the entity
again after commit.

Additional `MuleContext` ports are `combatEntity`, `combatDamage`,
`combatBuildingAt` and `combatBuildingPointAccepted`. They receive staged
ecology/terrain/RNG where relevant. Entity projections supply actual identity,
owner, native record, physical height and virtual68; specialists also supply
blueprint style, and buildings supply the admitted104E12 radius. Damage returns
the actual virtual34 result and completes all immediate retirement/cleanup
before returning. Point admission is a required boolean74D90 result, not a
blanket building pass. Missing services reject the callback atomically.

Plant feeding calls synchronous `plantDamage(state,terrain,rng,index,amount)`
at source688CB, before nutrition, audio and the68968 neighborhood query. Bind
it to `damageCampaignPlant` using the same staged host. Actual6C780 unlink,
count updates and724C0 reference cleanup must be visible to that query; flushing
an eaten-plant receipt after the whole Mule callback is too late. The numeric
fallback remains usable when damage does not retire the plant; immediate
retirement without this host service rejects before any query or commit.

The host must synchronize every changed Mule backing record, including the
target and any recoil recipient. Supplying only the current creature is
insufficient. The exact selected-player/alliance/player research records and
actual category3 operator roster are required; qualifying attack operators
must expose signed blueprint byte17 as `attackBonus`.

On a successful kill receipt, source5CDB0 increments killer player signedDWord
`+6FD` with32-bit wrap when killerOwner!=4. The selected victim portrait is
refreshed. Owned AI players (`player[2]!=0`) require source35F00 creature
unregistration; this remains an explicit host service, not an assumed empty
AI pool. Later ordinary corpse retirement owns count decrement, intrusive
unlinking and target-reference cleanup.

## Validation and limits

Forty-two synthetic combat tests cover asymmetric alliance/sector/head
order, primary/secondary scores, specialist style gates and conditional draws,
the intentional scratch-flag fix, current kind3 motion, nominated building
radius/admission/arrival,8AE10 fallback, attack quarter/half scaling, synchronous
damage and retirement, state6 blood/nutrition, reference retention, range/yaw
seams, escape paths, recoil, death, ANB gating, JSON saveability and full
callback rollback, plus feeding retirement/query ordering and failed immediate
retirement rollback. The29 other Mule tests also pass.

Private read-only frozen source packets match40 complete local numeric records
(4,640 nonpointer bytes), RNG and audio:10 damage,10 attack entry with its
caller bit clear,7 false contact,5 attack misses and8 reacquisitions. Receipt:
`.private/mule-combat-conformance.json`; input fixture hashes are recorded there.
No proprietary fixtures enter public tests, and no new original-code run or
frame-frontier search was used. These packets do not establish a full callback,
Krell result, new kind3/4 source-afterimage parity, broader combat species, AI
or campaign acceptance. Other creature species, shared neighborhood selector
17/0x11, target kinds6/7, and attached-carrier physics retain explicit source
family boundaries rather than inferred behavior.

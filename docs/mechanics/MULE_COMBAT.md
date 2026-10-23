# Mule hostile contact and reaction

`mule-combat.ts` implements the ordinary selector4 creature versus selector4
creature branch for owners0–4. `mule.ts` delegates its neighborhood decision,
live kind1 pursuit, completed attack, completed hit/recoil and corpse-feeding
neighborhood continuation to these functions. It retains the existing physics,
animation interpreter, mating, feeding, mortality and serializable native124
records. Other species, specialist/building combat and attached carriers retain
explicit source-family boundaries.

The source is the admitted QA BETA V5 candidate, SHA256
`4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba`.
Evidence is the preserved `player-creation`5ED20/5E640/5EB30 listings,
`initial-creature`6B700/6B150, `construction-command`5B9F0/1EE50,
`terrain-map-refs`5B580/74CC0, `mission-array-refs`5CC60, and
`activation-rng-refs`6DB90/707A0/5CDB0. These files are read-only evidence;
the implementation does not execute original code.

## Numeric content and query order

The host supplies `MuleContext.combat: MuleCombatTraits` from the admitted
private pack. Species4's45-byte row is LE object3+46B0, SHA256
`6289b68eea87a5228a06c9db3f31e3d3cbaebc89bf23f27ab6752a8b89ce8114`.
The fields are signedDWord query radius+0; unsigned attack/confidence+4,
defense+5, disposition+24hex, and food weights+1D/+1E/+1F. The attack sound
is signedbyte object3+60A4, independently admitted. There are no process
pointers in these numeric traits. Missing traits reject an actual encounter.

`queryMuleCombat` previews the same two X/Y traversal draws used by the food
and mating scorers. X is outer and Y inner; sample cells inside the squared
radius are visited in source order, then their actual shared list head→next.
The sample distance determines weight; the candidate's exact signed15 wrapped
position determines its16-way angular sector. A strict improvement replaces
the selected pointer, preserving the first tie. Alliance tests are asymmetric
and neutral owner4 has no inferred player alliance record. Hostile corpse and
state15 eligibility follows the source scorer; allied entries contribute to
the friendly sector count separately.

The decision uses signed integer divisions in source order for health,
enemy-sector pressure and friendly-sector contribution. A disposition roll
above its trait bypasses the confidence draw and pursues; it does not cancel
the encounter. Low confidence executes the real friend/no-friend escape draw
sequences and707A0's additional direction draw. That search tests16 headings
using74CC0's terrain-mask/plant-weight predicate. The occupied-cell neighborhood
branch instead uses73E00's one-draw circle of radius384. Ordinary idle escape
continues to use73C20's two draws. These paths are not interchangeable.

## Contact, animation and damage

5B580 installs logical references50/52 and55/57; task-bearing creatures also
retain58/5A. It preserves the literal goal11/13. Hunger flag61&40 can remain
set during a hostile encounter and does not disable live contact.

Physical distance73770 includes signed15 wrapped XY and the physical height
difference shifted by3. Contact range128 and angular tolerance256 are
inclusive. False contact only turns desired yaw; true contact installs
state21, source stop fields and the conditional attack-sound draw. It causes
no damage. Directional actions8–15 use the original reserve-dependent delay;
state20 uses action16 and researched recoil state16 uses action23.

5EB30's actual animation completion sets timer6C to0. Completed state21
rechecks range, pays reserve, calculates skill-scaled attack and the required
operator contribution, draws attack variation, then calls5B9F0 on the actual
staged target. A miss consumes its original wait draw and retains references.
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

## Transaction and host obligations

The whole Mule callback still stages ecology, terrain and RNG and commits
them only on success. `combatEffect(stagedEcology, stagedTerrain, rng, request)`
is required on blood emission. Its request is code32/0x20, source identity,
position and `[yaw,pitch,speed]`. The factory initializes height from the source
ground point and consumes0 extra draws. It runs immediately after the three
parameter draws, before subsequent combat queries/draws. Corpse eating captures
its query before the particle and resolves confidence afterward, in the source
order. Effect replacement cleanup must therefore use an isolated complete host
transaction and mutate held Mule/native array identities in place. A closure
that mutates the authoritative world breaks rollback. Dynamic shared-cell and
effect-selector lookups must see this staged host.

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

Fourteen synthetic tests cover asymmetric alliance/sector/head order, first
ties, immutable query previews, conditional draw counts, reference retention,
angular/range seams, both escape paths, damage/defense, blood ordering,
researched recoil, death, actual ANB gating, JSON saveability and full callback
rollback on a failing required factory. The29 preexisting Mule tests still
pass.

Private read-only frozen source packets match40 complete local numeric records
(4,640 nonpointer bytes), RNG and audio:10 damage,10 attack entry with its
caller bit clear,7 false contact,5 attack misses and8 reacquisitions. Receipt:
`.private/mule-combat-conformance.json`; input fixture hashes are recorded there.
No proprietary fixtures enter public tests, and no new original-code run or
frame-frontier search was used. These packets do not establish a full callback,
Krell result, broader combat species, AI or campaign acceptance.

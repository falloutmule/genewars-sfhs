# Geneticist projectiles and capture

`geneticist-projectile.ts` expresses original factories48790, predicted aim6D830,
free-altitude physics6DF30, effect callback4B630, proximity query4F9F0 and
immediate capture query4F6A0. The supported selectors are41/0x29,42/0x2A,
43/0x2B and capture20/0x14. Numeric records are serializable; pointer bytes31..38
remain null. Source files and original assets remain private.

## Source data and entry points

The importer supplies three original Geneticist projectile profiles and the
four descriptors. The21-byte profile table SHA256 is
`575d8d96052769d6f57b96437a4d1281eeba23f034115bdf53deacc1e091cce1`.
Descriptor20 SHA256 is
`4c36b4fe514235396adc275a09330b023ee3faf13c20c8d7564080cfa3c1cd9b`;
the combined41..43 descriptor SHA256 is
`26d6648b545ca129ad6b17685b5ba69b8e32c88a5a48c5bfd524718c792dc8ac`.
Use the actual EFF animation profiles:20 has seven frames;41..43 each have one.
All use hold0 and playback flags0. A descriptor alone does not establish art.

`createGeneticistProjectileRecord` accepts the role module's `GeneticistShot`,
actual specialist200 and target124 records, the actual free81-byte prior and
allocated index. It computes two-pass moving-target aim, then makes the
concrete projectile. The source first travel estimate uses integer physical
distance738F0 and speedWord. Final73A50 receives the second predicted XY and
height after averaging the two travel estimates. The source muzzle is actor
physical height+1280. `aimMovingCreatureProjectile` supplies this shared numeric
helper to callers with their own established physical-height/muzzle arguments.
`createGeneticistProjectileNative` is the common41..43 factory when the real
caller has already resolved its angles, including a building caller.

Factories consume no RNG, install the actual parent reference, initialize
payload76=0, and emit cue33, mode2, parameter0, ratePercent100. The Geneticist
caller supplies timer32. Counter30 and fractions67/68 retain the actual slot
prior. No missing prior is replaced with zero.

## Shared scheduler contract

`stepGeneticistProjectileRecord(before81,rng,context)` returns a current native,
`retirementRequired`, marked-newborn count, audio events, physics samples and
the optional source query plan. The incoming record is copied. Its RNG and
explicit ports belong to the host's encompassing isolated transaction.

The context supplies current frame/water, terrain, original angle/trig/bounce
tables, actual descriptors/ANB, player records, species components and:

- `nearby(query)`: exact query-point order, each cell head→next; no sorting,
  deduplication or RNG. The pure callback consumes the two source traversal
  draws itself. The scan visits radius256 cells, then accepts physical distance
  at most64; the first strict nearest tie remains selected.
- `entity(ref)` and `specialistSkill(entity)`: actual current logical records
  and signed blueprint byte17. Physical heights follow each concrete kind.
- `obstacle(point,height)`: original74270 mask1 first-building result. The
  actual parent building is exempt; another building sets payload76 to its
  index+1 truncated to a byte. A projectile is not generically reflected here.
- `child(request,rng,parentNative)`: actual shared factory, capacity/replacement,
  links, immediate20 query and cleanup. Publish/move the current parent before
  allocation, and copy the canonical numeric carrier back into `parentNative`
  after inline cleanup/replacement. This preserves source aliasing. A successful
  capture child is marked newborn only after its immediate impacts finish.
- `impact(target,effect,rng,request)`: the actual damage1 and stun response,
  supplied by `applyMuleCaptureImpact` for the admitted selector4 creature.

The host installs returned native before the next slot, runs real shared
retirement/cleanup when requested, and counts only successful marked children.
The returned parent retains kind5 so cleanup sees its real family. Timer expiry,
ground contact or payload76 requests child20, then retires the parent even on
capacity failure. Common water feedback21/0x15 and48/0x30 is unmarked and occurs
before completion/proximity. Deflection consumes its exact cue-rate, pitch and
yaw draws only for an eligible hostile creature's researched ability; a Mule's
class4 does not acquire another species' projectile reflection.

## Capture and Mule damage

`createGeneticistCaptureEffectRecord` preserves its own allocated prior71/73
and76. Source factory20 never installs the passed projectile-parent reference.
Consequently duration64 is used unless this slot retains kind3, in which case
the actual retained specialist's signed skill supplies `skill*4+32` and the
Mule's retained target58/5A. Unknown retained bytes are rejected when read.

`applyGeneticistCaptureEffect` visits every eligible kind1 target in source list
order. Dead states≥24 and cold state15 are skipped. It invokes real damage1
before stun5C7E0, even after lethal damage has entered mortality. The resulting
health0/state18 is preserved. Stun uses the original stop/flags/timer writes,
then emits per-Mule cue57; factory20 separately emits57 if any hit, else13.

`mule.ts` exports `damageMuleEntity(state,index,amount,attacker|null,rng,context)`
for an already isolated host transaction. It uses the same task release,
animation, blood factory and death receipts as creature combat and retains native
array identities. Actual creature class pairs control defense bypass and
creature-only recoil. A specialist/effect cannot trigger the recoil response.
Self damage preserves the source no-reaction/no-sound path; null environmental
damage uses its ordinary reaction. State18 makes5CC60 return without clearing
references or timer. Effect17/0x11 and34/0x22 require their additional smoke
service and remain an explicit rejection. Death receipts carry real killer
owner; the host applies signed player+6FD kill statistics and actual AI/presentation
cleanup before another spatial query.

`applyMuleCaptureImpact` is the in-place damage/stun composition. The host must
consume its death/retirement/audio receipts in the same staged transaction.
Already-cold damage instead requires `MuleContext.coldBurst`: exact6D500 code14/
0x0E, parameters80/70, count10+rand%10, height−1, followed by source unlink and
cleanup. This branch cannot create fabricated particles. The hook must implement
the actual family before it is admitted by a host.

Ordinary Mule callbacks now admit actual stun18 expiry: odd-phase timer0 uses
one idle-delay draw, then the actual occupancy/escape branch. Cold15 uses the
admitted signed component losses (`muleCold`) until warmth reaches0, then stops
and enters timer500. An already-cold Mule skips5E0B0 at entry, as the instructions
require; no automatic thaw is inferred from the later unreachable recovery arm.
Its timer/shared tail still run. Cold/stun ANB uses the source directional action
with playback0 and preserves the prior frame/hold/counter selector fields.

## Evidence and limits

Preserved instruction/decompiler contracts are `construction-command/6D830`,
`plant-command/4B630`, `construction-command/4F9F0`, `construction-command/4F6A0`,
`construction-command/5B9F0`, `construction-command/5C7E0`,
`mission-array-refs/5CC60`, `startup-prior-refs/5E0B0`,
`player-creation/5ED20` and `actor-activation/6DF30`.

Read-only archived original numeric fixtures pass256 moving-target6D830 aim
vectors,64 complete42 factories and64
immediate20 capture impacts:12,096 nonpointer bytes plus RNG, audio and player
kill-counter wrap. The private receipt records fixture hashes. Host cell-head
insertion is explicitly applied before the immediate query. No original code or
instruction interpreter was executed during conversion. Synthetic tests exercise
the remaining aim/flight/contact/water/deflection/expiry and failure ports. These
checks establish the bounded family, not a full mission acceptance.

The source5B260 cell-entry waypoint callback has no creature-state restriction.
The older bounded states1/3/8 gate was removed for attack-state21 coasting into
another cell. Mask53/ref4D and actual74D90 acceptance remain required; the same
one-draw waypoint loop is tested in a whole Mule callback.

Normal hosts also bind `MuleContext.relocate(state,terrain,rng,mule,oldCell,newCell)`
to their staged intrusive-list transaction. Source6DF30 relinks before virtual88
and later action queries. Source6E9E0 arrival snapping relinks and calls virtual88
before assigning the final position. Both sites invoke this port at that order;
the arriving self is admitted to the explicit destination-cell predicate while
its old XY is still present. `cellOrder` must read the current staged links. The
living-occupant list invariant remains enforced. Tests cover both ordering sites.

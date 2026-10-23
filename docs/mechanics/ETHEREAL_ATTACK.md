# Ethereal punishment attack25

`ethereal-attack.ts` implements severity1's concrete launch at1296B..129C9,
aim6D830 and the selector25/0x19 factory/callback. It uses the existing shared
200-slot scheduler, actual numeric priors and logical source references. Source
files, original artwork and comparison fixtures remain private.

`planEtherealAttack(parent102,targetNative,context)` accepts the actual visitor
and a creature124, specialist200 or building67. Its result includes the exact
request, initial integer physical distance and second predicted position/height.
The target virtualC is true for creatures/specialists (1F230), false for buildings
(1F420). Initial heights are each concrete virtual0; building height is17, not
its health dword39. Two travel estimates use unsigned divisions by60, signed
word velocity offsets, torus coordinates and forecast terrain clamping. The
launch speed is3840, muzzle offset-640, timer128, owner the visitor's player,
delay0 and parent the actual visitor index/kind8. No aim/factory RNG is added.

`makeEtherealAttackEffect(prior81,slot,request,context)` runs only after real
allocation. Descriptor25 is mode4, gravityfalse, priority7, child5, movabletrue,
watertrue (`040007050101` at object3+4EB4+25\*6). Actual EFF25 has two hold0
frames/flags0. Factory48D84 emits channel10/mode2/parameter0/volume127/rate100,
writes parent71/73 and collision76=0, and retains counter30/fractions67/68 and
unused afterimage fields. Pointer/resource bytes31..38 remain logical nulls.

`stepEtherealAttackEffectRecord(before,rng,context)` uses the extracted common
implementation of6DF30 and4B630/4B9AC, shared with41..43. The Geneticist wrapper
still accepts only20/41/42/43. Full free-altitude motion, fixed fractions,
first-contact terrain bounce, grounded resampling, speed cap, parity74270 hit,
water21/48, signed timer and7AC00 animation precede proximity handling. A ground
hit, collision byte or negative timer creates actual child5 before retirement.
The child receives owner0, zero angles, current position/height, parameter76,
the resolved retained parent and a newborn mark after its real factory returns.

The surviving4F9F0 query consumes two draws to choose point traversal signs.
The host traverses each supplied point's actual cell head→next, preserving
repeated cells. It excludes the parent, self and kinds4/5, accepts physical
distance<=64 and retains the first strict nearest tie. Source creature state,
species components, ability/research and parent-owner alliances determine
reflection. A reflection emits target channel97 with rate80+rand%40, then
draws pitch and yaw in the source order. Missing physical views, player records,
species rules or real services fail at the required branch.

`ethereal-attack-adapter.ts` exports:

- `createStagedEtherealAttack(world,parentSlot,targetId,pack,options)`, returning
  the plan plus allocated slot or null. Full capacity preserves the computed aim
  and consumes no factory RNG/audio.
- `stepCampaignEtherealAttackEffect(world,slot,pack,options,receipt)`, bound to
  scheduler `etherealAttackEffect`. It uses current native entity views, exact
  ordered spatial queries, actual airborne-building query and imported rules.
  Water uses the real water factory; child5 uses real immediate blast area/
  recursive damage. The child is marked newborn only after immediate work.

These are already-staged operations. The outer visitor/shared transaction must
clone and commit every concrete damage root through its existing host hooks.
`effectOptions.blastArea` supplies actual target traversal, damage, plant ignition
and countdown services; no cosmetic blast substitute is installed. Normalized
effect occupancy, linked references, fractions, raw count3554 and audio requests
are synchronized before the next callback. Scheduler receipts expose optional
`attacks` updates. An inline factory replacing its executing25 record remains an
explicit atomic error; continuation of that source alias case is not implemented.

Synthetic tests cover virtual-height selection, prediction/wrap/clamping,
retained priors, timer/obstacle impacts, reflection draws, water/child order,
shared immediate/newborn scheduling, capacity and transaction rollback. Private
bounded static comparisons read source bytes as data and compare36 exact aim
vectors,12 complete factories and12 complete numeric callbacks. Empty query and
inline factories are explicit comparison ports; this does not prove full host
damage, later severity paths or campaign acceptance. Original executable code
is never run. Specialist abduction's common57A10 state3 motion/dispatch remains
a separate required family; parent punishment writes alone do not complete it.

# Mule corpse common physics

An ordinary dead Mule remains a live kind1 pool record during stages24..27.
Its desired-speed word63 is-1 and native21 bit80 enables corpse friction.
This is a free physics record, including when its physical height39 is above
its previous ground17. It is not a request to stop gravity or snap to ground.

The concrete Madami development boundary was state24 at physical8927 and
ground8926, with zero velocity/acceleration, word21=0280 and word73=0220.
The former admission incorrectly required the corpse already to be grounded.
The new admission requires all of: admitted corpse stage24..27, desired63=-1,
and byte21 bit80. Existing guards still reject attached/frozen/sliding flags
outside the admitted ordinary Mule domain, other negative desired speeds,
living negative-speed records and unknown source branches. No world state,
physics constant, height tolerance or animation timing was changed.

## Source sequence

5ED20 calls the actual movement virtual94 (6FB60), which calls6DF30. The
ordinary acceleration/gravity and fixed-point XY/fraction calculation run
before comparing candidate physical height with the sampled terrain:

- A free airborne corpse keeps its physical trajectory.6E620..6E757 derives
  angles/speed and caps speed above19200 to12800 before regenerating velocity.
- At first ground impact,6E3C1 restores the candidate XY/fractions, performs
  the actual bounce coefficient/normal response and derives angles. A reached
  positive impact calls5B9F0, which returns immediately for state>=24. There
  is no corpse damage, reaction, audio or RNG from that call.
- On grounded contact,6E10B tests desired63==-1 and byte21 bit80. Its friction
  comes from the admitted104520 terrain-class table. It then uses the signed
  ground delta, derives angles and regenerates the quantized movement before
  resampling terrain.6E266 skips living contact virtualA4 for desired-1.

Current source cell-entry relocation/5B260 and74270/6DD50 obstacle response
remain in their existing order. A corpse can cross a cell and consume the
real5B260 waypoint draw; corpse physics is not universally RNG-free. Existing
water21/48 requests retain source phase/height/material conditions. At zero
physical height, a reached self-water5B9F0 is also a dead-target no-op.

The existing mortality/ANB/retirement family still handles24→25→26→27.
The complete5ED20 comparison also exposed a shared-tail omission: odd-phase
corpse callbacks join6A290, clearing native74 low two bits withFC. Even-phase
callbacks return earlier at5EED4 and retain those bits. That exact odd-phase
write is now preserved. No additional corpse lifecycle policy was added.

## Host and evidence

No new campaign port is needed. The existing staged Mule callback, immediate
spatial relocation, actual airborne building service, water-effect consumer
and mortality receipts remain authoritative. Failure of a reached query or
resource binding rolls back the callback's ecology, terrain and RNG.

`tests/mule-corpse-physics.test.ts` uses explicitly synthetic records and
normal campaign constructors/callbacks. It covers stages24..27 across
airborne/ground transitions, first bounce, grounded friction/acceleration,
airborne cap, dead damage no-ops, odd/even shared tail, retained guards,
late failure, eight normal host frames, JSON continuation and recorded replay.

Private evidence under `.private/mule-corpse-physics-proof-20261023/` runs a
closed interpreter over preserved pinned listings/data. The comparison uses
whole5ED20 callbacks, including actual6DF30,5B260,6DD50,5EB30,5E640 and7AC00.
Logical8ACC0/8AC60 publication and unsuccessful21/48 allocation are declared
ports; their numeric requests are compared, not replaced with invented
effects. Process pointers and six link-header bytes are excluded from numeric
record comparison. The report records the exact corpus and counts.

A separate one-frame regression loaded only the unmodified **valid** Madami
pre-step save5346 (`fcb2e3e8`) with its matching frozen b887 content. The
current converted runtime advanced to5347 active (`8507b1e5`), and one-frame
recorded replay plus JSON reload matched. It never loaded, repaired or stepped
the failed afterimage. This is cross-runtime development regression evidence,
not a fresh campaign continuation or canonical mission acceptance.

# Mule corpse common physics

An ordinary dead Mule remains a live kind1 pool record during stages24..27.
Its desired-speed word63 is-1 and native21 bit80 enables corpse friction.
This is a free physics record, including when its physical height39 is above
its previous ground17. It is not a request to stop gravity or snap to ground.

The concrete Madami development boundary was state24 at physical8927 and
ground8926, with zero velocity/acceleration, word21=0280 and word73=0220.
The former admission incorrectly required the corpse already to be grounded.
The physical admission requires desired63=-1 and byte21 bit80. It does not
require a mortality stage: recursive building destruction can enter death,
then5ED20's completed-attack tail writes state8 again (6072F..608B7).
The original6DF30 friction gate6E10B uses these physical fields independently
of logical mortality. Attached/frozen/sliding flags, other negative desired
speeds and unrelated unknown branches remain guarded. Positive-impact and
water virtual34 dead-target no-ops still require logical state>=24.
The common airborne speed cap also applies to desired0 (6E534..6E620).

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

## Reentrant combat extension (26 October)

The genuine Lunacon frame12800 parent first refused at13074 after an AI Crab
attacked a building. Read-only tracing proved recursive destruction changed
its health15 to-7, state21 to24 and desired speed0 to-1; the attack tail then
changed state24 to8 without another RNG draw. Source6071E..608B7 does the same;
there is no caller survival recheck. The callback must admit nonpositive health
and let5E0B0 perform phase-gated recovery/starvation.5E1A7 decrements the signed
health word before testing mortality; it does not clamp negative health to0.

The same family audit recovered60553..60573: building damage is doubled for
primary component1, unchanged for secondary1, and arithmetic-halved otherwise.
The modifier uses all25 ordered component pairs; callback admission remains
1/4/11/22. Specialist quartering and update/RNG order are unchanged.

Private mapped-instruction evidence compares200 modifier cases,4 reentrant
completion tails,384 health-prefix cases and25 direct physics cases, including
the exact diagnostic record. All613 cases match their defined source boundaries.
This is closed mapped-listing execution, not native executable observation;
occupancy, spatial/effect/obstacle and death entry boundaries are explicit ports.
The death-port health-prefix comparison proves health/reserve and state entry,
not full death lifecycle. A separate genuine-parent500tick simulation checks
save reload and recorded replay. Ordinary UI continuation remains required for
campaign acceptance. Complete receipts are private in
`.private/combat-reentrant-20261026/`.

# Native Engineer work on existing buildings

This extends the existing task0 terrain/construction family through the same
507D0 activation,534D0 role body,51E80 release and57A10 callback transaction.
It introduces no public UI command and does not run a second motion or animation
tick. The strategic command adapter already produces these native orders.

The source task meanings are:

- **Task0, selectorFF:** repair or finish an existing building.51960 obtains its
  kind4 reference when the task0 argument selector is14.507D0 selects action15
  and stage5 immediately, with no site reservation or terrain job.
- **Task1:** plant perimeter sabotage charges, finish action17, trigger those
  charges and start the building's44F20 timed demolition/salvage state.
- **Task4:** upgrade an existing building through44F50 and subsequent441C0 work.

## Repair and upgrade

SelectorFF repair uses the actual current-grade health table to decide whether
an arrived actor has finished. Damaged completed buildings continue through the
existing skill timer and contribution path. Each terminal work cycle pays
`120-skill` only when the target's completed bit is set, using the source two
resource pools and the existing nonhuman refill condition. Insufficient funds
release work with reason3. A successful contribution is `skill*2`; source
grade0 completion bookkeeping may repeat even for a previously completed
building. Source51E80 clears the task0 movement bit but releases no reservation
for selectorFF.

Task4 activation selects action13, sets stage88 to whether the target grade47
already exceeds current grade46, clears timer86 and approaches the source
front offset104570 divided by2. The exact signed-word offset arithmetic is
retained. A first arrival at stage0 sets stage1 and invokes44F50 once.

44F50 clears flags0101, sets the dirty byte21 bit2 and upgrade flag0100,
increments target grade47, then calls44E50. Capacity43620 observes that image
before the Genepod selector0 stored-GOOP reset. Source44F50 adds no funds debit.
The caller's existing lifecycle controls upgrade admission; target grades0/1
are admitted here, and an attempted grade3 is an explicit unsupported target.
Selector12's separate double family6 effect branch remains an explicit required
service rather than manufactured effects.

Each task4 arrival consumes journal8F2's one draw to set a100..299 timer and
uses the inclusive yaw flip range300h..700h. Work normally waits for the signed
timer to reach0; source phase3 may finish the wait early when73770 distance
exceeds65536. Actual player byte2 controls the branch: nonhuman work calls
441C0 with increment5, while human work does not add that contribution. The
next work point uses the real73C20 two-draw distribution. Movement mode6 retains
the building nomination through the source52340/526C0 behavior.

`planEngineerBuildingContribution` expresses441C0/43F60 numeric writes for
grades0..2, including same-grade damage recovery, target-grade health, frame0,
flags, energy200 and selector7/11 special bytes. Completion only adds the
grade0 count/ownership bit where the source does. When flag0400 names an
attending specialist, the campaign adapter performs its actual51E80 release
before capacity and target cleanup. The outer task4 completion release remains
idempotent after that recursive release. Existing task0 construction behavior
continues through its prior admitted path.

## Sabotage and demolition start

Task1 activation reads actual104DE0 classes and104E12 radii. It sets remaining
charges to class+1, work period to110-skill and action16. Class1 uses the
front offset and preserves otherwise unwritten angle fields. Larger classes
initialize the angular increment and initial768 heading. The actor approaches
the real building with its class speed and nominated-building reference.

Arrivals initialize the work timer; a terminal timer uses the actual73770
distance including height. An eligible attempt calls the real shared50/32h
factory. **Remaining count decrements even when that factory returns capacity
false**, matching the source. It then chooses the next perimeter point, or the
one-draw73E00 departure when the count reaches0.

At the final arrival the controller selects action17 and waits for its actual
ANB completion predicate. A hostile, nonallied target debits500 through806E0
with no displayed economy burst. Existing code50 records for this actor change
to phase1 before44F20 writes building64/66 actor reference,54=256 and flag0800.
The actor retains stage-1 and sets native71 bit0. The later451F0 branch
subtracts8 from native54 each callback, then attempts salvage effect45 and
retires the building through44380. It does not transfer ownership.

Active task1 cancellation clears building32 bit4 and sends matching charges to
phase2 while its signed stage is nonnegative. Active task4 cancellation clears
building32 bit2. An inactive pending task does not clear those target flags.
Neither path releases a terrain reservation or refunds resources.

`CampaignEngineerServices` adds required-on-use ports:

```ts
placeTakeoverCharge(world, request: EngineerTakeoverChargeRequest): boolean
setTakeoverChargePhase(world, actor, phase: 1 | 2): void
```

The exported request contains code50, actor/building identities, owner, actual
actor point and terrain height, zero angle tuple, parameter0 and delay1. Phase
services scan current shared slots in ascending order, admitting active code50
records whose parent71/73 names that kind3 actor. A missing reached service
throws.44F20 and44F50 numeric host bindings are provided directly; the code50
factory and scheduler belong to the shared effect host. The existing
`Takeover` request/port names are legacy API identifiers, not an ownership
transfer mechanic.

`buildingPresentationActive` is the explicit source MAINPANL-specific audio/UI
condition. It affects only optional presentation. Message indices and sound
requests remain receipts; this module does not fabricate a speech-bank cue or
claim device/presentation acceptance.

## Isolation and validation

All concrete services retain held native building, specialist, player and RNG
identities. The normal callback uses the existing staged effect host. Public
callers with bare effect options receive the missing mutable campaign roots in
one shared clone, without cloning immutable source content or introducing
undefined optional save keys. Late failures roll back native writes, resource
changes, effects, links, RNG and presentation together.

Public synthetic tests cover all three building classes, both task4 arrival
states, signed wrapping, AI/human contribution, recursive completion,
selectorFF payment/failure, charge capacity false, action17 completion,
hostile score debit, cancellation, full rollback and save continuation.

The private bounded comparison covers124 predefined activation, work, release,
upgrade and repair cases:44,410 literal listing instructions and287,060
serialized afterimage bytes matched, including200-byte actor carriers,
67-byte buildings,1805-byte player records, three81-byte charge records and
live RNG. Pointer gaps are normalized logical placeholders;284,580 bytes are
numeric comparisons. The listing's overlapping dword reads also observe unused
upper bytes of packed-coordinate scratch words. Repeating every case with
scratch fills00/A5/FF produces identical compared state, RNG and port calls.
Source ports explicitly cover audio/UI,43620 capacity,
6A6D0 cleanup, score debit and the shared charge factory; task4 controller
441C0 calls are typed ports, with actual441C0/43F60 grade writes separately
compared. No original executable was run and no original content is committed.
The shared effect scheduler, later higher-grade building callbacks and mission
acceptance are not established by this bounded proof.

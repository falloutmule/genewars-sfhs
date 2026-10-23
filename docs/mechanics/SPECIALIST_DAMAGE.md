# Specialist damage and removal

`specialist-damage.ts` expresses kind3 vtable112194 virtual34→4FF40, state4/5
dispatch inside57A10, retirement57740 and owner-bookkeeping80360/800B0. Native
process pointers remain null and have explicit logical bindings. The original
executable is never executed by this conversion.

## Damage

`damageSpecialist(world,index,amount,attacker|null,context)` mutates an already
isolated host transaction and preserves native/player array identities. It
returns the source boolean as `dead` plus health/effective-damage diagnostics and
ordered presentation events. It consumes no RNG.

- A current abduction state3 returns false immediately. Signed blueprint
  byte1A≤0 returns true without applying another hit.
- Blueprint style1 halves signed incoming damage, with minimum1. Other styles
  retain the original amount, including zero. Health is the signed byte in the
  actual owner blueprint, not a fabricated native health field.
- A real attacker installs reference7B/7D. A creature kind1 also halves current
  speed41. Null environmental damage clears only reference kind7D and retains
  its old index bytes.
- A nonlethal hit subtracts the blueprint health byte and saves native55→56,
  timer68→6C, enters state5 and installs timer10000. An existing state5 still
  accepts the attacker reference/speed change but does not subtract another
  nonlethal hit or restart its animation.
- Lethal damage conditionally calls actual51E80(mode1) when native58 bit0 says
  work is active, then enters native55=4 and flags71|10. It preserves the positive
  blueprint health byte. Setting it to zero or immediately removing the actor
  would change the source lifecycle.

The lethal work-cancel port must run the actual category and task service,
including construction reservations/jobs/payment or Geneticist references as
appropriate. A stop-only callback is insufficient. Native/player replacement by
a port is rejected because callers retain those source identities.

Damage emits `specialist-voice` variant4 (hurt) or5 (death). These are formatted
filename requests to entity voice queue419E0, with queuePolicy0 and exact stack
arguments `[2,0,127,100]`. They are not indexed WAVE play requests. The real
queue separately applies selected-owner/runtimeFlags4 gating and its queue
policy. The host must resolve the original filename and presentation queue;
there is no guessed sample ID or play mode.

## Shared callback hooks

`stepSpecialistDamageState(world,index,context)` runs at57F92 dispatch, after the
actual common motion/prefix. It handles current states4 and5 only. It requires
actual actor ANB metadata, checks the current action and source animation-finished
gate, and does not advance animation itself.

State5 waits for action10 to finish, then restores state55 from56 and timer68
from6C. State4 waits for action9, requests actual unmarked corpse69/0x45, increments
the victim owner's signed DWORD player+709 with32-bit wrapping, and removes the
specialist. Capacity failure of the corpse factory still proceeds with removal.
The result's `retired` flag suppresses the ordinary ANB tail, matching sourceBL=0.
Other state families remain owned by their actual callbacks.

`selectSpecialistDamageAnimation` is the small ANB-selector hook. It selects9 for
state4 or10 for state5, setting direction1/delay0 only when the action changes.
It preserves existing hold/frame/counter. The normal host then performs7AC00
with the actor's actual profile. The shared Geneticist callback has an explicit
lifecycle service slot for these hooks.

The corpse request contains the actor's actual owner, XY, physical height,
yaw/pitch/speed, asset binding, action9 and its last frame, plus packed76:
`(category<<3)|(style*2)|blueprint14|C0`. Parameter/delay are0, parent is null and
newborn is false. Factory69 preserves shared prior state, uses timer1000 and
direction0/desiredSpeed0, then copies the actor ANB/resource binding; it must not
use EFF69 as replacement art. The shared corpse scheduler owns its full callback.

## Retirement and owner state

`retireSpecialist(world,index,context)` implements57740 and is also used for
Ethereal abduction. It does not cancel work again or increment the death statistic.
Source order is:

1. If the actual original unit panel is active, return selected-panel-clear and
   list-row removal requests. A missing list row is the original byteFF.
2. Invoke actual8ACC0 spatial unlink with display discriminator16, then full
   shared724C0 reference cleanup in the same host transaction.
3. Source80360 searches all five owner slots for the first retained C0 blueprint
   binding, including inactive records. It clears blueprint20 low2 bits,
   decrements/shifts the signed-byte owner actor list, clears C4 resource and
   native kind6. The stale trailing list byte remains unchanged.
4. Source800B0 deletes the blueprint by clearing its first byte and decrementing
   owner byte15. Other blueprint bytes, including health, remain retained.

Inactive C0 bindings must survive retirement. `SpecialistPool.bindings[index]`
therefore remains available; native6 controls activity and C4 is represented by
the explicit resource-clear receipt. If an earlier inactive slot has no admitted
C0 identity, the optional `inactiveBlueprint` port must establish its real
retained binding or proven absence. Unknown is not treated as a null pointer.
The source first match can differ from the requested actor; `retiredIndex`
records that actual80360 result and can be null when no pointer matches. Hosts
must project the native afterimage rather than blindly delete the requested UI
actor for every receipt.

The host owns full rollback/commit around these services. It must consume
presentation/retirement receipts and synchronize all actual aliases before a
later query, preserve retained C0 data, and route corpse69 through the shared
effect pool. The module does not edit campaign world/UI state on its own.

## Evidence and validation

Static source ranges:4FF40..5012C damage;57740..5785A removal;
80360..80421 owner actor bookkeeping;800B0..800D0 blueprint deletion;
57FD8..581EB death dispatch;581F0..5826C hit completion;
58476..584B5 hit/death ANB selection. Actual4FF40 and57740 bytes were read through
the hash-admitted LE mapper. Preserved51E80 task cancellation and419E0 queue
listings establish the external services. Private provenance records the range
hashes and source EXE hash.

Focused synthetic tests cover signed health/style arithmetic, hit suppression,
abduction immunity, exact conditional work cancellation, retained references,
native aliases, ANB completion gates, corpse-capacity failure, statistic wrapping,
owner-list shift/stale bytes, inactive bindings, unknown priors and late service
failure inside a host transaction. No original fixtures or asset data are added
to public source. These checks establish this bounded family and do not claim
mission acceptance.

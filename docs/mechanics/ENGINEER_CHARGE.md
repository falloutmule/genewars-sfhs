# Engineer planted charges

Source task1 plants effect **50 (0x32)** through48790, with its own factory
branch48B4F and callback4B910 inside4B630. This is the sabotage controller's
charge, distinct from the specialist57860 creature-reference service.

The admitted effect descriptor supplies completion mode5, priority1, no child
descriptor, no gravity or movement response, and water response enabled.
The factory writes flags0820, parent71/73 from the actual kind3 specialist,
phase70=0, timer74=-1 and delay29=1. It preserves source counter30,
fractions67/68 and otherwise untouched numeric fields, including payload76.
Pointer/resource bytes31..38 remain logical nulls. It creates no audio request,
does not mark itself newborn, consumes no RNG and changes no building owner.

## Callback and shared ordering

The frozen-physics bit22:08 skips movement in6DF30. Source obstacle admission
is false, and actual speed0 suppresses water factories. Coordinates still pass
through the source15-bit normalization. Completion mode5 bypasses the generic
timer74 decrement and animation-completion retirement prelude.

- Phase0, and other phase values except1/2, run the actual charge7AC00 animation
  and remain active across loops. The charge profile has eight frames; its
  first frame holds2 and the remaining frames hold0.
- Phase1 calls the real shared factory for **51 (0x33)** at the current point's
  actual terrain height. Successful publication is then marked newborn. The
  charge retires whether allocation succeeds or fails.
- Phase2 does the same with **10 (0x0A)**.

Feedback51 and10 use their own ordinary mode0 callbacks and genuine23-frame
and4-frame zero-hold profiles. Their factory writes no additional numeric
fields or RNG. They reuse the established common ground/airborne/slope physics,
obstacle queries, water checks, timer/animation and terminal retirement path.
Their descriptors admit neither obstacle response nor water factories.

The shared scheduler records successful child creation and processes it once
in the ascending newborn pass. It retires the parent's final current image
through real unlink,724C0 reference cleanup and pool count updates. Factory
replacement cleanup runs before parent retirement and can change retained
references; the adapter publishes the parent before allocation and copies its
current canonical image back afterward. A child's priority cannot replace its
currently executing lower-priority charge.

## Host API

```ts
createStagedCampaignEngineerCharge(world, request, pack, options, receipt?)
  //-> actual shared slot or null; no outer clone
setStagedCampaignEngineerChargePhase(world, actor, 1 | 2)
  //-> {changed: ascending actual slot indices}
campaignEngineerChargeServices(pack, effectOptions)
  //-> CampaignEngineerServices placeTakeoverCharge/setTakeoverChargePhase
stepCampaignEngineerChargeEffect(world, slot, pack, options, receipt)
  //-> current native afterimage, retirementRequired, newborn count
```

The staged methods operate inside the caller's isolated transaction and retain
held specialist/player/root identities. The phase service plans every matching
active50 record before writing byte70, matching logical kind3 parent71/73.
Unknown bytes are never replaced with zero.

Standalone `createCampaignEngineerCharge` and `setCampaignEngineerChargePhase`
provide full mutable-host transactions. They extend bare effect-host cloning
with the campaign's missing mutable pools while preserving shared aliases.
Late failures leave native records, links, resources, RNG and presentation
unchanged. Immutable pack content is not cloned. Scheduler callers continue
to supply their normal complete campaign staging options.

`EffectSchedulerOptions.engineerChargeEffect` is the explicit binding for
50/10/51. A missing reached callback raises an error. Capacity failure occurs
before a missing resource profile is read. No new save-only charge container
is needed; the existing81-byte carrier, shared occupancy and spatial state are
the complete serializable representation.

This family does not perform the later building demolition callback. The
Engineer controller has already selected action17, waited for
its completion, applied the actual hostile/nonallied500 score debit, set these
charges to phase1 and started44F20's timed demolition/salvage state.
451F0 subtracts8 from native54 each callback; its terminal branch attempts
actual salvage effect45 and retires the building through44380. Ownership is
not transferred. This later building family remains a separate service.
The current `Takeover` names in the request/port API are legacy identifiers;
they do not describe an ownership change.

## Pending Engineer cancellation

Source51E80 tests88bit0 before reading resource-task operands. An inactive
pending order may legitimately retain selector131=14 from strategic planning,
or unread task/selector/stage bytes. Converted queued-travel release receives
its existing notification with null task/selector/stage fields; it releases no
site or charge resources. The common stop then clears the pending task state.
Active work continues to validate and execute its actual source operands.

## Validation scope

Public synthetic tests cover actual shared allocation, retained priors,
animation loops, both phases, source capacity false, ascending parent matches,
newborn processing, recursive replacement failure, whole-pass rollback,
held-root identity and full save/replay. Explicitly arranged phases are unit
fixtures, not ordinary mission acceptance.

The private pinned comparison uses the preserved original numeric tables,
EFF metadata and closed arithmetic instruction interpreter.77 predefined
factory/callback cases match43,674 listing instructions and5,963 numeric
afterimage bytes, including12 real child factories, with zero RNG draws.
It covers the frozen parent and ordinary feedback ground/airborne/slope/wrap
paths. Spatial insertion and49D30 cross-record cleanup are explicit host
ports; their logical behavior is covered by campaign tests. Six spatial header
bytes and eight process pointer bytes per record are excluded from the numeric
comparison. No original executable is run or packaged, and no original
fixtures or content are committed.

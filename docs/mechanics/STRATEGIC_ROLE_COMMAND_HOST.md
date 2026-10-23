# Strategic specialist command host

`campaign/strategic-role-command-adapter.ts` binds independently expressed
80FC0,81080,81150,811A0 command setup to the current campaign specialist pools.
The request is the existing `StrategicRoleCommand`, including its nullable
11-byte packet. `source` identifies the original planner call site; it does
not grant authority to reinterpret missing packet bytes as zero.

Use `dispatchStagedCampaignStrategicRoleCommand(w, request, pack, services)`
inside the caller's isolated AI transaction. It returns the existing receipt
`{routine,player,specialist,outcome:"installed"|"ignored"}`. Bind it directly as
the planner's command service, with the campaign host already associated with
the planner's current numeric state. The staged function does not clone or
replace its caller's specialist, player, building or RNG roots. It validates
the actual native identity, blueprint category/style, packet index and owner.
The displayed selected player need not be the command's owner.

`dispatchCampaignStrategicRoleCommand` is the outer atomic wrapper. It clones
the entire campaign graph with aliases retained, runs the staged command, and
publishes only a successful installed result. Exceptions leave the original
graph untouched. Callers retaining native pointers inside an existing
transaction must use the staged export.

## Command ordering

- 80FC0 reads the specialist index at packet4. Native113 bit10h returns ignored
  without reading the packet's target point. Otherwise it stages pending57
  bit1, stores point0/2 in native5C, clears5B, runs the actual74A50 resolver,
  and stores the resolved movement target. It clears pending57 bit0 and calls
  the real51E80 release only when native82 or pending57 bit0 was set.
- 81080 sets pending57 bit0, releases a prior native82 task, then installs the
  task from packet3 through51960. It sets82=1. When current state55 is8, it
  performs virtual84/1EE50 and clears58 bit1. Physical velocity is retained.
- 81150 clears57 bit0, runs51E80, sets state55=1 and dword68=0. It retains
  pending57 bit1; the modern UI Stop wrapper's extra pending-bit clearing is
  not applied to this source command.
- 811A0 first sets pending57 bit0 and releases a prior native82 task. It reads
  task3 and point6/8, resolves74A50 twice from the actual actor position,
  clears5B between the calls and5A after the second, stages57/58 bit1, then
  runs51960 and sets82=1/pending57 bit0. Packet geometry is already the
  planner's chosen geometry; the adapter does not add the UI26890 alignment.

The74A50 binding reuses `campaignEngineerContext.resolvePlacementPoint`, whose
terrain-class, building obstacle and live shared-cell blocker predicate is
already the current campaign binding. Both resolver calls and all role
cancellations run against the same staged graph. Native views are mirrored
after setup; no motion tick, activation507D0, role work or animation tick is
inserted into a command.

These source entry points do not test native112 bit0. The ordinary UI helpers
perform additional admission; routing AI commands through those helpers would
introduce an unsupported ignored branch and replace nested roots via their
independent transactions. The adapter therefore performs the concrete numeric
dispatch while reusing existing **staged** role cancellation services.

## Semantic packet reads and51960

Packet10 is dispatcher/cache metadata, not consumed by these direct entry
points. Neither unused padding nor an unused argument half-byte is required.
Task selection consumes packet3; packet2's low action byte is unused by the
admitted51960 setup. Target index/point words remain signed16 source values.

| Branch             | Semantic arguments and native setup                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Generic task14     | packet5 index, packet4 kind -> native7F/81; no word6 read                                                                       |
| Engineer task0     | packet5 selector ->83; selector14 instead reads retained building slot packet4, copies its0F/06 reference, sets83=FF            |
| Engineer task1     | packet5 retained building ->7F/81, building32 bit4                                                                              |
| Engineer task4     | packet5 retained building ->7F/81, building40/42 actor reference, building32 bit2                                               |
| Botanist task0/1   | native5C ->88 center, squared radius `(trunc(skill*1024/100)+512)^2`; task1 additionally copies packet5 selector to83           |
| Botanist task2     | native5C ->88 center, squared radius `(trunc(skill*768/100)+768)^2`                                                             |
| Geneticist task0/1 | packet4 word index/packet6 word kind ->7F/81; kind1 resets88/84/86 words and sets8A aiming tolerance                            |
| Shepherd task0     | packet4 low byte mode ->8B, range87=`trunc(skill*1536/100)+768`; packet5==0 copies5C to83 center, otherwise retains that center |
| Shepherd task1/2   | packet4 word index/packet6 word kind ->7F/81; resets88/84/86 words and sets8A aiming tolerance                                  |

The aiming tolerance is `trunc(skill*362/100)+150`. Retained building slots are
read as source slots, including their actual inactive afterimage; the command
does not invent a live target. Target reference setup likewise does not
manufacture capture, attachment, healing, a repaired building or an upgrade.

Unknown role setup tasks throw. Known Engineer repair/upgrade and generic14
numeric setup are expressed, but this module supplies no missing task lifecycle
implementation. Existing role dispatch/release guards remain explicit when
such work requires an unimplemented service. Failed capacity/activation belongs
to that later service, not a fake successful command-side effect.

## Evidence and checks

The bounded static basis is preserved instructions80FC0,81080,81150,811A0,
51960,51E80 for admitted executable
`4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba`.
Notable ordering anchors are810A7..810C1 pending/release;81129..81144 moving
stop;811CD..811E7 pending/release;81275/812AD resolver calls;812DD setup;
51978..5198E generic14;519BE..51A2C Engineer references; category dispatch
51CCC onward. Existing role modules supply their concrete51E80 branches.

Public tests use synthetic content and the normal constructor/landing to obtain
allfour roles. They cover stable native/player/RNG identities, actual map
resolution, inhibited false afterimages, nullable semantic fields, active
release/audio, Botanist's real scan draws, native reference side effects,
late rollback and complete save continuation. No proprietary data, original
execution, mission win, or canonical campaign acceptance is claimed by these
integration tests.

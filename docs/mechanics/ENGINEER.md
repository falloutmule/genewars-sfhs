# Engineer native control boundary

`mechanics/engineer.ts` implements source category0 command admission and the
shared specialist callback, using retained20×200 native specialists and their
actual player blueprint bindings. It is separate from the campaign host.

`queueEngineerAssignment` admits the bounded idle/new task0 opcode5 path.
`queueEngineerPlacement` combines26890/75080 placement alignment with811A0:
both74A50 calls, their explicit origins, the intervening91 discriminator clear,
the final90 clear, pending work/movement flags and51960 selector write are kept
in order. `queueEngineerMove` performs ordinary80FC0 admission, including actual
work cancellation. These commands queue work without advancing motion or ANB.
Selectors0..13 are native command values; this does not assert that all14
construction kinds have executable host bindings.

`stepEngineerCallback` uses `stepSpecialistRoleCallback` for one6FB60 motion
prefix, pending command/arrival dispatch, health and skill recovery, class3
charging, real lifecycle ports and one7AC00 animation tail. Category0 has no
category2/3 native100 cooldown decrement. Its52780 idle pulse uses the actual
hostile-Mule scorer and requests escape rather than making a construction task.
States3/4/5 retain their existing required abduction/injury/death services.

The507D0 task0 prefix clears112-bit2, sets state85=9, clears reference-kind129
and resets stage136 before site validation. A successful construction activation
is followed by534D0 in the same callback. Failed placement still reaches the
source cancelled-FF return at534D0. No extra idle reset is inserted.

`cancelStagedEngineerWork` runs within an already isolated callback;
`cancelEngineerWork` isolates and commits the entire world. Active task0 release
first clears74-bit3, then requires actual job/site/audio cleanup. The common
51E80 tail clears task130/126, flags and desired speed while retaining physical
velocity, timer, current state and pending bits. The next shared callback owns
idle recovery and its RNG draw. Stage5 must retain its incomplete building and
footprint. A queued task release allows the existing documented travel bridge
to cancel its normalized task without pretending a native inactive site was
reserved.

The control wrapper accepts a role binding:

```
EngineerConstructionServices<W> {
  activate(world, actor): EngineerConstructionReceipt
  step(world, actor): EngineerConstructionReceipt
  release(world, actor, {mode, task, selector, stage, active}): EngineerConstructionReceipt
}
EngineerConstructionReceipt = {
  status: "active" | "released" | "rejected",
  reason: string,
  events: ConstructionEvent[]
}
```

These mutate the isolated world and retained native/player/binding records in
place. `activate` owns74E80/42B90/8CBA0 site validation and preparation.
`step` owns only the534D0 task0 body after common motion, including its real
526C0/52340 continuation. `release` owns51E80 category0 resource cleanup and
clears58-bit0. All native afterimages are checked. Missing services, invalid
afterimages, unsupported non-building tasks or replacement of held records
throw atomically. All committed authoritative data remains JSON serializable.

`mechanics/engineer-construction.ts` supplies this binding through
`makeEngineerConstructionServices`. It implements ordinary new-building
selectors0/1/3/6/11, native task0 stages0..5 and cancellation. It uses the actual
saved25×176 job priors, prefix2FF7 count and native144 slot, without creating a
second authoritative job queue. Its narrow host ports are site classification,
terrain reservation/release, native building lookup, real shared effect44
creation and441C0 building contribution. The host must perform the existing
terrain/building services on the staged world and preserve retained records.

The507D0 reservation port returns the actual42B90 taskpoint and perimeter
average height. Task XY clears its low byte then uses127 for ordinary supported
footprints1/3. The source preserves signed high bytes; it separately masks
native11/13 to7FFF. The controller writes the remaining132..147 task data,
native90/96 movement target, terrain-working flag and started message15.

Stage0 starts791C0 only after actual arrival. Pool exhaustion keeps stage0 and
does not debit funds or draw RNG. Stage1/2 wait checks planar736F0 distance to
native11/13. At distance65536 or greater, it retires the referenced job, clears
144, returns to stage0 and moves back to taskpoint140/142. This is a retry,
not51E80 cancellation. Completed jobs stop29 audio, draw journals78B/7B2,
optionally request message16 and install the diagonal approach goal before the
actual526C0 continuation. Terrain79220 remains one separately ordered pass.

Stage3 performs the original signed two-pool debit, including the player
resource-selector4A1 refill owner, then sets action14. Stage4 tests the existing
action14 ANB before the common tail; actual44 capacity failure retries. A
successful factory must return its real kind4 child. Contribution1 precedes
the retained building reference, stage5 and action15. Stage5 establishes the
110-skill work timer only after actual arrival, clocks once per callback,
preserves the odd-frame833 audio draw and exact59C/59D random work point, and
installs the referenced departure only after441C0 returns completion. A later
arrival requests message17 then releases work without removing its building or
footprint. Missing targets use the source reason3 cancellation.

Native51E80/539E6 decrement the job count as a byte without testing whether
79220 already retired that slot. The controller retains this source afterimage,
including a possible255 underflow, instead of silently applying the earlier
modern bridge's defensive clamp. `terrainJobs` receipt metadata records
allocation/retirement slot, remaining and before/after count for host caches;
the prefix remains authoritative and must not be mutated a second time.

`planEngineerCompletedBuildingContribution` handles the numeric441C0 repair
branch for an already-completed grade0 building. It preserves signed word
addition, the strict health>max/3 damage-recovery threshold, flagsFEBF and the
43620-before-dirty-bit intermediate image. Reaching maximum still invokes
43F60 in the source, repeating grade0 completed-count/ownership bookkeeping,
clearing creature targets and refreshing capacity. The plan exposes these
obligations; it does not acknowledge them as performed. Its prior flag1
suppresses first-completion audio. The separate441C0 change audio requires the
actual active-UI global condition and remains a host binding.

The existing `stepConstruction` is a complete modern bridge callback: its
`move` includes a ground-motion step and its final `tail` advances ANB. It
cannot serve this role-only port. The native controller instead uses the shared
6FB60 prefix and526C0/52340 continuation, followed by one common ANB tail.
Specialist motion admits category0/state9 specifically, preserving wrong-role
state rejection. Existing modern construction remains available for explicit
compatibility; no native callback advances its route or ANB a second time.

Selector5's complete second-site construction is now bound; see
RECRUITMENT_CENTER.md for the source pad, second job and cancellation contract.
Existing-building repair, sabotage and grade upgrades also have their later
bindings. Other unimplemented tasks and selectors still reject. Complete
whole-campaign acceptance remains separate from these mechanic releases.
No fallback acknowledges work or skips required native movement.

The campaign binds ordinary new-building task0 to its actual terrain, native
25-slot jobs, retained67-byte buildings, real shared44 factory,441C0 progress,
43620 capacity, live spatial links and deterministic audio journal. Category0
uses this source controller inside one common motion/ANB envelope. Its modern
queue waits for native idle after source departure; Stop releases native work
and clears the queue. The old normalized construction projection no longer
drives this role. Working saves retain actual native task/job bytes. Public
host tests cover immediate factory/progress identity, capacity, resolver
rollback, ordinary queued orders, cancellation and complete save/replay.

A private ordinary-command route reaches Exceland victory at frame2750,
continues into Krell frame250 and reproduces checksum68022bc1 across10 checks
and11 events with the earlier18147b77 pack. This is development evidence,
not mission acceptance. The separately conditional441C0 active-UI changed
audio remains unbound; first-completion audio is journaled by the host.

Evidence is the read-only preserved runtime contracts `actor_construction.rs`,
`actor_construction_placement.rs`, `construction_setup.rs`,
`actor_construction_lifecycle.rs`, `construction_cancellation.rs`,
`actor_construction_tail.rs` and `actor_world/construction_scheduler.rs`, checked
against mapped source51960,811A0,507D0,51E80,52780,534D0 and57A10. The relocated
507BC category0 entry is5122F;51948 category0 is51A31. No original executable
was executed and no original bytes are included here.

Synthetic tests cover exact queued bytes, signed alignment, both resolver
origins and intermediate writes, same-callback activation/role order, one
motion/ANB pass, lazy missing-port rollback including RNG/terrain, retained
record guards, native cancellation, save/reload continuation and lifecycle
admission, all ordinary native stages, capacity, retry distance, payment/refill,
retained work, completed repair and actual category0/state9 motion admission.
They do not establish campaign acceptance.

A private bounded listing comparison covers88 whole534D0 callbacks across
four styles and22 branch shapes, plus28 whole811A0/51960 commands across all14
selectors and native states1/8. All656,240 compared numeric bytes, four player
records, RNG, native job counts, ordered primitive requests, audio and message
indices match over20,352 literal listing instructions. The placement comparison
confirms both74A50 queries originate at the actual actor XY; the second target
is the first result. The common6FB60/7AC00 and shared terrain/building families
have their separate proofs. Reservation/release and44/441C0 are explicit ports
in this bounded control comparison, not new proof of those family internals.
The reports remain ignored/private; the original executable was not run.

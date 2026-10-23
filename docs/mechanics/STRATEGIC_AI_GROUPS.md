# Strategic group control and attack launch

`strategic-ai-group-control.ts` supplies the complete numeric source3C700
controller, target discovery3D500, cleanup3E050, priority3DBB0, target choice3E100
and interaction dispatch3EA40. `strategic-ai-attack.ts` supplies3BF90 recruitment
and launch. These reuse the retained1726-byte AI records,38-byte groups, native
creature/building/specialist pools and600-byte creature-control image. Logical
family/index references replace native pointers. Unknown native bytes remain
unknown; no pool copy establishes a working action service.

`stepStrategicGroup(state,player,group,context)` mutates a caller-isolated state
and returns the exact typed3C700 receipt. `makeStrategicGroupService(context)`
provides the core's `stepGroup` service. `attackStrategicGroup` takes the same
state/player plus target group, force flag, creature context and a real group
service; its receipt records threshold, cooldown, recruited indices and launch.
`makeStrategicAttackService(context,stepGroup)` provides `planAttack`.

`stepStrategicGroupAtomic` and `stepStrategicAttack` clone and validate the
strategic roots for standalone use. A campaign provider uses the in-place
entries inside its complete host transaction. Command services must mutate that
same staged host: the standalone wrappers do not isolate unrelated captured
ecology, effects, audio or rendering objects.

The context extends `StrategicCreatureContext` with actual specialist virtual68,
readonly200-slot native81 effect views and typed action ports. `releaseAction`
executes source5CC60 and returns `{routine:0x5cc60,creature}`. `interact` executes
5B580 against `{family:1|3|4,index}`, with `force:false`, returning that exact
request. `moveOrder` remains the real81C60 service from the creature context.
Missing action services reject when consumed. Returned success receipts cannot
replace those bodies; held native and AI identities are checked. Existing Mule
combat supplies part of5B580, but the campaign still needs an adapter with real
action cleanup, target projection and command effects.5D870 remains a separate
directive dependency of the creature service.

Common maintenance preserves source quirks. Distance/protection cleanup reads
the creature pool for every target category. Category2 cleanup maps the stored
specialist index using `/4,%4`, although the specialist owner block has five
slots. Mapped slots20..23 consequently read the actual adjacent building bytes;
the implementation resolves that numeric address without a native pointer.
Member recount includes owned/control-linked inactive records. The default
jump-table branch performs this common work and no role work.

Discovery scans all300 creatures, four64-slot building blocks and four5-slot
specialist blocks in source order. It uses actual virtual68, hostility masks,
building flag0100 and wrapped73690 distance with integer square root. Specialist
style3 adds its source115 adjustment and excludes115>=201. The longer specialist
range128 requires the source player0/hostility/defending conditions. Three
six-entry candidate buckets preserve strict insertion and equal-distance order.
The closer-building path's missing destination displacement at3D837 writes the
new candidate into creature scratch, while shifting building scratch. This is
retained rather than replaced with a conventional nearest-target list.

The category order applies signed adjustment/clamps to aggression, subtracts20
per existing category target and uses the source nested strict-swap network.
Ties therefore preserve that network's order. Missing target slots fill by this
order without duplicate category/index pairs. Choice3E100 selects the first
strict minimum participation below3. Interaction increments its participation
byte after the actual call, wrapping at255; an unknown category increments
without issuing a call, as the literal does.

Kinds0/1 discover and dispatch available combatants, releasing distant actors
before interaction/scatter. Distant native120 mode7 skips dispatch. Kind2
discovers defensive targets, maintains its target-present flag, performs the
source hostility refresh and counts native95 mode2 defenders across the owned
live nonprotected pool. Those defenders require at least three before target
interaction. Target exhaustion uses the source radius7 scatter paths.

Kind3 donor transfer retains three members and respects destination65F capacity;
kind4 retains four. Both scan groups then creatures in ascending order, test
compatibility and unlock state, unlink before3E5A0 and preserve its
count-before-admission semantics. Kind4's decompiled pointer subtraction is
four bytes: its transfer amount is `count-4`.

Kind5 recalculates its signed limit from the actual group-limit row, signed664
and signed zone quota divided by256, without the constructor's floor at1.
It uses the source low-byte radius and countdown355C extension, including byte
wrap. An incompatible member unbinds but still traverses the same radius/order
tail. Outside actors release/move only when available and control4-clear;
inside actors clear control4.

Kind6 binds the actual referenced active effect59. Missing/retired effects
retire the group and clear its links. An empty group finds the strictly nearest
eligible owned research candidate while preserving the source read before the
group table for a negative prior link. The literal then skips attachment when
that chosen link is negative. No candidate sets flag16. An existing first
member may unbind after research completion and still execute its final move
tail. This callback never fabricates a reward effect or research result.

Attack3BF90 computes its possible threshold draw before self/absent/cooldown
checks. Positive even rounds above progress10 draw once; multiples of4 add the
65F base, other even rounds add1, with signed total cap. Odd rounds do not
commit a draw. `force` replaces the threshold only after this work. Actual zero
divisors reject. Elapsed time uses uint32 subtraction and signed cooldown
arithmetic. Waiting locks the group without recruitment or launch stamps.

An eligible attack unlocks its group and scans all300 rows until count equals
the threshold, rather than stopping when count is greater. Its caller has no
active/protected pre-unlink check. Active donor groups exclude kinds0 and4;
3E5A0 performs its own cap and count-before-admission checks after source unlink.
Finally it locks the target, stamps6B3, increments the round byte and invokes
the real3C700 service. A failed required command or launch rejects the outer
transaction; it cannot silently become a launched attack.

Thirty-two synthetic tests cover priority/participation ties, wrapped range,
scratch and specialist-index quirks, protected/inactive members, defender
thresholds, both donor minima, zone/reward lifecycles, exact draw/cap ordering,
cooldown/round rollover, absent services, identity checks, JSON restoration and
late rollback. The private99-case closed comparison matches11,639,339 numeric
values over719,945 listing-model steps; its generated input/output SHA-256 is
`062c2cf92cfff4f7ee91a1b912232f758552be234944c7514364ce34adc5bdbe`.
The comparison includes all0..6 controller branches, attack launch into the
controller and actual admitted group/gene/direction tables.5CC60,5B580 and81C60
use explicit synthetic afterimage ports; their command bodies are outside this
proof. Pointer gaps are excluded. The closed model infers the omitted width of
absolute memory MOV destinations from their typed source registers, preserving
the16-bit seed write and neighboring active-player count. No original process
or native game instruction execution occurs. Strategic and campaign acceptance
remain unclaimed until all required concrete host services are installed.

Evidence is the read-only `mission-array-refs` listings for3C700/3D500/3E050/
3EA40, `startup-prior-refs`3BF90, `validated`737F0, bounded mapped3DBB0/3E100 and
the previously released3E5A0/3E6B0/3DD60 contracts. Private proof scripts and
generated original-data outputs remain ignored.

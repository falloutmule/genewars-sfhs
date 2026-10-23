# Serialized building startup and Recycling Plant

`building-startup.ts` implements source45010/44FF0 numeric rebind and the
ordinary selector4 branch of451F0. This is a reusable building family; it does
not establish mission acceptance. Canonical acceptance remains0/24.

## Loading actual records

Call `initializeSerializedBuildings(initializeNativePool(source,3),context)`.
The input is the actual256×67 native pool, including inactive retained priors.
No construction factory runs. Source45010 copies31 header bytes and28 payload
bytes across the eight-byte native pointer gap. Only active records call44FF0,
which clears39..42 and binds resource31 from11685C[signed45]. The helper accepts
the existing split-copy result, reapplies that idempotent numeric initializer,
and returns copied records, separate logical bindings, projections, owner
counts and derived4×14 completed counts. It does not write player counts.

Native31..38 remain logical nulls. Health, grade/target grade, energy,
payload, flags, ANB25..30, dirty timer, native links and all other known/unknown
bytes survive. The loader never clamps a saved ANB frame, resets a timer,
samples terrain, reconstructs a building from zeros or changes source lists.
Slot/owner partitions and resource presence are validated atomically.

`import_building_rules(executableBytes)` admits the existing executable SHA256
`4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba` and
three independently hashed data spans. It returns `schemaVersion:1`,
`resources:[{selector,path,assetKey}]`, `unsupportedSelectors`, `upkeep[14]`,
`processingFrontOffset:[signed16,signed16]` and provenance. The original
numeric/resource data are imported into a private pack; production code embeds
neither the table values nor a guessed selector-to-art list.

The13 named descriptors at object3+393C (572 bytes) identify selector destinations
through their object-relative relocation addresses, rather than descriptor
order. Source154B0/9A111 loads these descriptors into116824;1DFB0 relocates them
into11685C;44FF0 selects the resulting resource. Selector9 has no established
binding in this admitted descriptor span and is explicitly unsupported.
Other selectors can bind without implying their runtime callbacks are complete.
Selector4 resolves to the original BFARM resource, the Recycling Plant.

| Imported range | SHA256 |
| --- | --- |
| object3+393C,572 bytes | `5ed6c6a837f5e0ed5681490ef3482985be324d1a9fc151288cfcaad85cdcff71` |
| object3+4D10,14 bytes, upkeep | `a7d0a5cdef73f2a5672793fb185fd748ee4f2ab7f26dcdf39435287dbbffad23` |
| object3+457C,4 bytes, processing offset | `e890f350f4385cfe5b486628906ccb2370663d40763f50d39c272d49b3d583a6` |

## Ordinary selector4 callback

`stepStagedRecyclingPlant(world,slot,context)` mutates only an already-isolated
host transaction; native/player identities survive. `stepRecyclingPlant` is
the atomic standalone wrapper and returns a staged world or an explicit reason.
The host may supply its existing `stageWorld` copy. Required services are lazy:
a paused building does not need material queries; a deposit requires80780;
grade1/2 collection requires the actual scanner/factory only on its cadence.

This entry includes the exact common upkeep and tail. The host must exclude
selector4 from a second generic economy upkeep pass. Complete, enabled
buildings subtract imported upkeep plus native63, with signed16 wrapping.
Depletion clamps energy to0, clears power unless capacity-suppressed, and starts
the source player5EA warning at1000 only when it is0. Normal energy caps at200;
extra drain decays after the selector branch. Disabled/incomplete cases bypass
that branch and share inactive energy decay. Suppression, dirty timer,
action/grade selection and signed ANB holds/delays/counter continue in source
order. Incomplete health0 returns before drawing/ANB. Collapse flag0800 requires
the existing shared collapse callback and is refused before mutation here.

At local animation frame0, a powered operational plant deposits native51 GOOP
into player4A7, clamps using unsigned source arithmetic against5E6 capacity,
clears native51, and calls actual80780 credit20 even when storage is full.
It then queries the source front cell. `selectRecyclingPlant` implements
8B300(cell,0): the first kind2 in actual intrusive chain order. A plant queues
byte payload `growth48*4+grade+2`, starts frame1 and is unlinked/cleaned/retired.

When no plant is selected, `selectRecyclingCorpse` implements8B0E0: kind1,
signed state94>=25, native97 bit0 clear, greatest signed word104 strictly
above-128; ties keep the earlier chain entry. Fresh state24 corpses do not
qualify. Consumption queues the source byte-wrapped104-low-byte formula,
unlinks first, then increases that species' player61A research by
`grade*32+32`, capped by `(player6E1*25+50)*2048`, then performs724C0 cleanup,
kind0 and actual shared creature-count decrement. Source plant/corpse cleanup
context is2/3 respectively. Query helpers do not replace real spatial links.

If neither material is present, grade1/2 uses the original256-frame slot cadence
and1024/1536 range. The `dispatchCollection` port must run8D930 with112724,
then14040's actual32-slot collection factory. Only successful allocation adds16
extra drain. Collector capacity failure is a normal false result. At a nonzero
processing frame, direction becomes1, extra drain2 and delay3-grade. Pending
GOOP is deposited only after the real ANB wraps to0 on a later callback.

Cross-pool ports must execute immediately on the staged world:80780 includes
its funds cap/audio/floating effects/RNG;8ACC0 precedes research;724C0 handles
references before kind/count retirement. Drawing is returned as `queueDraw`;
the host owns the actual render queue. No default credit, resource rate,
retirement, RNG, query result or collection particle is fabricated.

## Evidence and checks

The read-only preservation contract `research/ghidra/building-loader-contract.json`
pins45010,44FF0 and6D490. Preserved `building-update/instructions-000451f0.txt`
provides the selector4 branch46547..46800 and common tail47D63..47F74;
8B300 and a static mapped-byte reading of8B0E0 establish material eligibility.
No original executable was launched.

Synthetic tests cover all admitted binding rows, actual-byte isolation,
retained ANB, Madami-shaped selector roster, plant/corpse priority/research,
storage full, wrapped values, power loss/restoration, inactivity, exact
collector cadence, pending animation, JSON continuation, in-place identities
and rollback after late failures. Importer tests verify identity/span admission,
destination-derived selectors and path/destination rejection.

Private `building-startup-conformance.json` records18 ordinary caller cases,
5756 interpreted source-listing instructions and33696 equal native/player
bytes, plus matching ordered service requests. Query/credit/unlink/cleanup and
collector factories are explicit deterministic boundaries in that comparison;
synthetic ANB descriptors exercise the real7AC00 listing. The private actual
Madami check initializes all five owner0 records (selectors3/0/4/6/6), resolves
their real imported resources and preserves every native byte outside44FF0's
established dword. Original bytes and fixture reports remain ignored.

Remaining boundaries: selector9 resource binding, unrelated building callbacks,
collapse/destruction dispatch, actual cross-pool collector runtime and campaign
host/UI wiring are separate families. Successful startup/caller tests are not a
claim that all14 building gameplay families or mission3 are complete.

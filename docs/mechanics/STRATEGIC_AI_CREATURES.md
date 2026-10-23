# Strategic creature assignment and directives

`strategic-ai-creatures.ts` supplies the complete numeric35730 and35820 bodies
to `makeStrategicCreatureServices(context)`. They run inside the isolated37870
callback and retain every native/control record. They use actual species gene
pairs from object3+4A64 and the existing ecology directions from object3+4564.
They do not substitute an idle creature or a successful command for a missing
host service.

35730 visits all300 creatures in ascending order, requiring active ownership,
virtual68-clear and the source availability gate: state94 is neither15 nor18,
virtual68 is clear and native97 mask1 is clear. A negative control group link
enters3C2A0. A positive stale group link is retained in this particular caller.
Assigned nonidle available creatures clear control mask4 as the source does.

3C2A0 preserves valid assignments and clears a stale link when called directly.
The owner defender group has first priority when count is below its occupied
target count plus2 and the creature's low control class is2. Otherwise it scans
all16 groups, rejects locked/full/incompatible/excluded groups and chooses the
strict maximum `signed limit -9*signed count`, starting at-10000. Equal scores
keep the first source group. Kind2 can exceed the usual65F capacity limit.

3DD60 accepts kinds0..3, checks gene4 for kind4, and uses the actual zone rule
for kind5: zone7 accepts all,8..12 require gene0..4 respectively,13 and other
values reject. Kind6 accepts only creatures still eligible for research: a
neutral's quality118 must be at most90; owned creatures must lack97 mask4 and
their owner's6C7 species-knowledge byte must be0. The literal accepts group
kinds above6. This does not extend the separately bounded3E270 constructor to
unadmitted table rows.

3E5A0 limits kind0 by65F, then increments the signed group count before checking
whether the actual member is active/protected. Such a failed member retains
that source count afterimage. Successful members receive the group index and
high control-class bits from group parameter10.3E6B0 draws exactly twice:
direction modulo8, then distance modulo radius for radius<=3 or modulo
`radius-3` plus3 otherwise. Word multiplication/addition preserves signed16
coordinate wrap. These draws occur before the actual81C60 command may ignore
the actor. No extra RNG is used by assignment, scoring or directives.

35820 considers only control group1..15 with group kind2 or4, actual owned live
nonprotected creatures and the source state/control gates. It performs the
unused6D390 reference resolution read; that function has no numeric writes and
preserves EDX. EDX is the group record, so plant distances originate at the
group point, even when the creature is elsewhere. Native0200 can clear control
masks8/16 before the later state checks. States1 and21..23 skip directives.

A primary gene1 creature uses the actual owner-block building selected by AI46
when that byte is not64. The source does not first test that building's active
flag. It calls5D870 and sets control16 regardless of the command result.
Otherwise a creature with gene4 scans all512 plant records in ascending order,
requiring live and plant virtual68-clear. Plant flag8 changes admission score
to `floor(distance*2/3)`, while the stored threshold remains
`min(raw distance,old threshold)`. A selected candidate exits early when that
threshold is below6400 squared. The actual target can therefore differ from a
generic nearest-neighbor query. Control8 is set even if no plant exists, or
the called5D870 command returns false.

The context supplies exact readonly plant native49 views and plant virtual68.
`moveOrder` must execute81C60 including its selected-player audio and actual
5DF50 action cleanup/movement setup. `targetOrder` must execute5D870 against the
logical `{family:2|4,index}` target and return its actual boolean. The typed
receipts also preserve held native identity. Missing command families reject;
the code does not write a guessed target reference or acknowledge a fabricated
successful order. Existing owned-Mule movement can back the admitted Mule
81C60 port. Broader creature commands and5D870 must be concretely bound.

The reusable exports `assignStrategicCreature`,
`strategicGroupAcceptsCreature`, `addStrategicCreatureToGroup` and
`scatterStrategicCreature` are available for the remaining3BF90/3C700 families.
They mutate only an already isolated strategic callback. External command
services must mutate the same staged host; the caller's outer transaction owns
plants, ecology mirrors, audio and other native action-cleanup roots.

Sixteen synthetic tests cover source admission/scoring, strict ties, stale
links, protected/cold rows, count-before-admission, RNG/direction/ring behavior,
gene/zone/research rules, group-origin plant ordering, weighted admission,
missing command/metadata errors, JSON restoration and late whole-core rollback.
The private closed comparison passes52 cases with5,354,342 numeric values and
96,446 listing-model steps. It includes whole35730/35820 and helper bodies with
the actual admitted gene/direction data.81C60 and5D870 use explicit supplied
synthetic command afterimages in that comparison; their full bodies are outside
its claim. Pointer gaps are excluded. No original process/native game code is
executed and no strategic/campaign acceptance is asserted.

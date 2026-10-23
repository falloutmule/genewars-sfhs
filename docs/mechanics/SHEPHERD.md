# Shepherd native role

`shepherd.ts` independently expresses source51960 category3 command setup,
507D0 activation,52780 idle acquisition, inline582A5 control,54E80 role,
54B10 pursuit/firing,54A00 factory continuation and51E80 cancellation.
`stepShepherdCallback` uses the shared57A10 envelope exactly once: actual6FB60
motion, queued-command dispatch, role work, then common7AC00 animation/tail.
`stepShepherdRole` is atomic; `stepStagedShepherdRole` and
`cancelStagedShepherdWork` mutate an already isolated transaction in place.
Native/player/binding identities are checked across required services.

`queueShepherdControl(world,index,{callerOwner,point,mode})` publishes the
source skill-derived control range and mode. It does not mutate creatures;
source5D700 consumes enabled130, task126==0, flags112 bit128, mode139 and
range135 from the player's real raw roster. `readShepherdOperators` projects
that roster in source order, inspecting retained blueprint category before
live actor checks.5D700 has no kind or health filter. Ordinary move, interaction
task1/2, cancellation and idle acquisition are separate exported APIs.

The context requires actual motion/ANB tables, runtime11C2BC, cell order and
common specialist callback services. Lazy role ports resolve logical kind1/3/4
references, search descriptor112748, evaluate virtual68/58, perform75890
visibility, and create source6D830→48790 effects37..43. A successful37..40
allocation then calls806E0 debit (400 per tier for kind3,40 for other kinds).
Factory capacity failure retains the source animation transition but does not
charge or set cooldown. An unsupported factory must throw. Creature capture,
damage, attachment and ownership are never acknowledged by invented changes.

The names `protectedTarget`/`deadTarget` denote exact virtual slots, not a
shared semantic death flag. Mule virtual68 is state94>=24; virtual58 is
state94==18 with signed108>0. Specialist virtual68 is signed blueprint26<=0,
building virtual68 signed native43<=0; both virtual58 implementations return
false. The required112748 query owns two8D7B0 direction RNG draws even when
there is no candidate. Missing services fail atomically; no no-target fallback
is manufactured.

`tools/import-original/shepherd_profile.py` admits the executable identity and
reads only the seven7-byte source projectile rows at object3+4AB4. Each row
has signed16 speed, range factor and cooldown plus unsigned8 effect code.
The private49-byte region hash is
`5b5970788c90e1f91017023f9286ad5621f45e150461fcc54073b37c13c7360c`.
The root importer/schema integration owns the optional pack profile. No
original table values or resource bytes are committed here.

Validation:21 synthetic TS tests and3 importer tests cover control/interaction
commands, skill thresholds, pursuit and escape, source cadence/RNG, factory
failure/debit/cooldown, cancellation, retained inactive roster filtering,
service identity, rollback, one common motion/tail, and JSON continuation.
A private frozen comparison (`.private/shepherd-conformance.json`) compares
17 attack-role cases against7,868 preserved static instructions:5,051 numeric
actor/target bytes, RNG and ordered aim/factory/debit ports agree. Those ports
remain explicit boundaries; this proof does not establish their implementation
or canonical mission acceptance. No original executable was run. Campaign
acceptance remains0/24.

The campaign binds real control/movement/interaction commands, current target
predicates, the general visibility ray, shared projectile factories,806E0 debit
and ordered effect callbacks. The sidebar exposes control modes and actual
creature/specialist/building targets. Mule services consume the source roster
projection instead of an empty operator list. Synthetic host checks cover
control, native movement/Stop, saves and replay; the blast host checks cover
actual projectile-to-Mule/blood effects and complete late-failure rollback.

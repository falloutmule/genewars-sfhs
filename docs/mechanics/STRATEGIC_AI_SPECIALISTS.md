# Strategic specialist planner

`strategic-ai-specialists.ts` independently expresses the complete33F60 numeric
controller. `strategic-ai-specialists-routes.ts` supplies32FF0 waypoint retry,
33B00 building-relative route generation,330B0 retreat and355B0 plant selection.
They operate on the retained AI/player/native pools used by the strategic core,
with logical family/index references. They do not update campaign authority or
execute a role by acknowledging an unimplemented command.

The in-place entry is `planStagedStrategicSpecialists(state,player,context)`.
`makeStrategicSpecialistService(context)` supplies the core `planSpecialists`
service. `stepStrategicSpecialists` validates and isolates a standalone entry,
including the additive mutable planner metadata. Campaign adapters must provide
the complete outer transaction for ecology, effects, terrain, audio and other
objects touched by their concrete command/query services.

The planner clears/recounts69E role counters from the actual player roster and
blueprint links, checks the first selector5 lab before source32E60 recruitment
and visits active nonprotected roster members in source order. Pending123/125
references resolve to actual creature/plant/specialist/building/effect/family6
numeric views. Category2/3 creature encounters issue their actual capture or
Shepherd command. Other categories cancel and retreat. Building encounters use
source width/range and relative-side tests; Shepherd additionally requires the
actual referenced creature/specialist. Effect encounters cancel/retreat only if
the effect is active. The pending kind clears afterward while its index word
remains retained. Invalid or unbound required native references reject.

Quality is cached by roster ordinal. An idle specialist with a positive route
counter executes32FF0 and returns from the complete planner, leaving later
roster members for another pass. Counter100 resets to0. Otherwise the counter
decrements before reading the D3 route point and issuing80FC0; reaching0 after
that call writes100. This reads the retained waypoint array, not the9C action
cache. A waiting reward group can request one actual move for a specialist below
skill100 and sets its request flag32. Later role tests use the command's actual
native state afterimage.

33B00 constructs the source eight building-relative points with width-derived
cardinal/corner radii, computes the two actual73970 directions, retains forward
or reverse source ordering and stores at most four waypoints in reverse retry
order. It immediately calls32FF0. It does not substitute modern pathfinding.

330B0 scans owned selector12 refuges only under actual player60C, excluding
building flag0100, and keeps the strict nearest by737F0 distance. Opposite
inside/outside sides cancel and clear the route. Both outside invokes the real
30F10 position search with retry counts3/2/1; both inside derives the actual
angle/radius point before a search. Without a refuge it cancels, then either
draws once for a source direction×20 scatter or queries around the source base
using the actual angle and tables. Capacity/query misses do not fabricate a
move. The context must supply the actual query result and consumed CH decrement.

355B0 considers actual active virtual68-clear plants without flag8. It excludes
plants within source group radius; kind4 doubles the squared distance before
that test. It keeps a strict nearest candidate but exits at the first admitted
candidate within6400². If all candidates were group-excluded, it falls back to
the first eligible plant in pool order. This differs from generic nearest-plant
selection and consumes no RNG.

Idle Engineer planning retains completion/error bookkeeping: selector/local
classification, settlement construction slots, reservation clears,6A2 timer,
AI46 readiness and global creature-control mask16 cleanup. It respects the
source existing-building/cooldown/reservation gates. The37C50 construction
planning subtree is a required service, with its exact actor/player request and
typed result. `strategic-ai-engineer.ts` supplies its concrete numeric
37D60/37F30/390D0 bodies and requires the remaining real site/query/action ports;
see `STRATEGIC_AI_ENGINEER.md`. No provider is installed here.

Botanist decisions use signed blueprint energy fields and AI63C. A ready lab
with a clear actual landing state can receive its training command. With no lab
and inventory below20 the planner selects source355B0 work. Otherwise it scores
kind3/4 and admitted zone7 kind5 groups, including inactive count afterimages.
Its real plant-density survey counts source spatial cells; strict ties keep the
first group and signed664 adjusts zone scores. Kind4 uses320E0/327E0 selection;
other candidates use32750/8D930/32630. The actual chosen style/point determines
the work packet. These spatial families remain typed required query services;
neither plant count nor style is guessed from a normalized decoration list.

Geneticist selection preserves two literal quirks: it scans only the first25
creature rows, and its second research-quality gate is indexed by scan index,
not species. It uses the actual species gene pair, signed647 weights, player6E1
quality threshold, own/neutral bonus1000 and strict positive maximum. The actual
selected target supplies the capture packet. Shepherd visits groups4..15 and
issues one command for every kind3 positive-count donor; it can issue multiple
commands in one pass even if the first changes the actor state.

`command` receives `{routine,source,player,specialist,packet}` and must execute
the actual80FC0 movement,81080 target/task,81150 cancel or811A0 role/area command.
Its typed receipt records `installed|ignored`; that receipt does not replace the
body. The packet is11 bytes with unconsumed unwritten words represented by null.
Move uses words0/2 for XY and4 for actor; target/task uses actor0, task2,
argument4 and, when established, target kind6; area work uses actor0, task2,
argument4 and XY6/8. Cancel consumes actor0. Byte10 is the actual command code.
An adapter must validate only fields its source command consumes, and must not
convert an unconsumed null word to a claimed source zero. Held native/player/AI
identities are checked around actions.

Some source callers copy unwritten stack words into the AI9C command cache.
`StrategicSpecialistPlannerState.specialistPlanner` therefore stores schema1
effective `commandCaches[4][55]`: known bytes mirror AI9C, while null explicitly
marks an unwritten byte. The numeric AI carrier retains its opaque prior at
those positions. The planner never consumes such a carrier as a known value.
Standalone cloning deeply copies all cache arrays; JSON saves preserve nulls.
Host persistence must retain/migrate this extension before admitting the family.
An optional explicit packet scratch input can supply proven prior bytes; there
is no zero default.

Twenty-seven synthetic tests cover roster/quality order, real recruitment
failure, encounters, route/sentinel order, source plant selection, retreat
side/retry/RNG, Engineer bookkeeping/gates, Botanist queries/work/training,
Geneticist literal gates, multiple Shepherd commands, actual reward-state
feedback, unknown-cache preservation, JSON restoration and late rollback.
The private48-case closed comparison matches5,706,867 known numeric values over
92,704 listing-model steps, SHA-256
`754224c15a1205c609d96c1308f6806516a474b153262a5d9ccc4378925d39fe`.
It includes33F60 plus the four local helper bodies with actual admitted motion,
gene and direction tables. Role actions, query constructors/traversal/results
and37C50 use explicit synthetic afterimage ports; their bodies are outside this
proof. Unwritten packet/cache bytes and pointer gaps are masked null and excluded
from the numeric comparison. No original process or native code executes, and
this release does not establish complete strategic or campaign acceptance.

Read-only evidence: `mission-array-refs`33F60/330B0/355B0 listings,
`validated`737F0, bounded mapped32FF0/33B00/32750/32630/32A70/327E0, the preserved
73970 contract, and the previously released32E60 recruitment family. All private
fixtures, original tables and generated comparison outputs remain ignored.

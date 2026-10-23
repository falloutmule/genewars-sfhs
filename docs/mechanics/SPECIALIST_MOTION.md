# Category 2 specialist common motion

`specialist-motion.ts` independently expresses the actual kind 3/category 2
6FB60 common motion callback, its 6F980 steering, 6DF30 numeric physics and
related Geneticist query services. The same established numeric path is also
admitted for category0/1 ordinary idle/move states (55=1/8, no active role in
58 bit0), actual category1 Botanist state10, and category0..3 damage/death
states4/5. Engineer/Shepherd work states remain separate. It consumes retained 200-byte records and
real blueprint bindings. It does not call `stepGroundMotion` or `actorStep`.

## Integration

Bind `stepStagedSpecialistMotion(world,index,context)` inside the already
isolated common callback. `stepSpecialistMotion` retains an atomic standalone
entry using the same implementation. This avoids nested copies while preserving
rollback through every later common/role service. Motion runs before
57A10 cooldown, pending activation, role and animation. It covers actual live
target references, idle relocation, target repair, straight rays, two-sided
boundary waypoints, failed-search retry/backoff, turning, contact speed,
accelerations/gravity, fixed fractions, ground sampling, falling/bounce,
airborne building collision, water, reveal and arrival.

The host supplies these actual services:

- `obstacle(world, point, mask, height)`: source 74270/74160 first-candidate
  footprint and current-frame height query. Ground paths use height -1;
  airborne collision and visibility use the current ray/physical height.
- `blockerWeight`: source 8B130 against the complete current linked cell.
  `specialistBlockerWeight` implements its category 2 arithmetic: 0800 flags
  bypass the query; each kind 2 plant whose 2E bit 8 is clear contributes ten.
  Other kinds contribute zero. The category 1 target exception does not apply.
  When hosting category 1 ordinary motion, its blocker port must additionally
  implement the retained kind 2 target 7F/81 exception: if that plant is in the
  queried cell, source 8B130 returns zero for the entire query.
- `relocate`: source unlink/prepend at each changed cell, using supplied before
  and after points. This happens before water factories, and can happen again
  at arrival. Kind 3 virtual 88 is the established empty callback. Retained
  native links must reflect the actual shared cell chain.
- `waterEffect`: actual shared code 48 or 21 factory at the source point in the
  callback, with no extra RNG draws. Factory capacity failure is source-valid.
- `damage`: actual kind 3 virtual 34 for gated fall damage or water hit 3.
- `reveal`: actual virtual 2C/51CF0/75B00, after the original selected-owner,
  cadence and movement gates. `specialistRevealRadius` supplies the imported
  radius, including class 3's charge-dependent calculation.

Ground/class-dependent bounce coefficients and angle/trig tables are imported
inputs. Nominated building references require actual records and the source
footprint target radius when that branch is reached. Motion services act on the
isolated transaction in place, preserving the selected native record identity;
they must not perform external I/O before the transaction commits.

`SpecialistMotionReceipt` records route, arrival, relocations and water request.
Code 48/21 factory and damage callbacks execute in order inside the transaction;
the receipt is not a request to execute them a second time.

The 6E9E0 arrival call uses BL=1: it resamples native ground 17 and shade 23,
clears fractions/contact speed, and preserves physical height 39. The ordinary
80AE0 landing placement likewise writes only point 7/9, readiness flags, links
and blueprint metadata; it does not refresh cached height, shade or velocity.
The first source physics callback performs that refresh. Fresh 4FD30 actors
start in native state 55 = 1. Ordinary 80AE0 does not manufacture a moving state
or goal. Its associated type 5 branch separately queues an actual move command.

## Geneticist query helpers

- `escapeStagedSpecialistRay` is the in-place 707A0 service for an already
  isolated Geneticist role callback. The role caller's 610 draw supplies
  distance `384 + draw % 256`; this helper takes the distinct 5EC direction
  draw. It tries sixteen angular candidates using 74CC0 terrain/plant admission
  and no building query. `escapeSpecialistRay` provides an atomic outer entry.
- `specialistApproachPoint` implements pure 73AC0 with explicit distance. It
  doubles and wraps signed word coordinates, offsets opposite the actor-to-target
  heading, halves arithmetically and masks 15 bits. It takes no RNG or query.
  55200 passes `128 + skill × (task0 ? 12 : 4)`.
- `specialistVisibilityRay` implements 75890's fixed six-fraction 3D walk at
  speed 4096, terrain tests every step, and height-aware building tests on even
  steps. `geneticistLineOfSight` supplies fresh actor ground +1280 and target
  ground samples, matching 54B10. Cached physical actor/target heights are not
  substituted. The original terminal metric is checked before taking a step.
- `specialistRevealRadius` implements 51CF0 using the four admitted signed
  dword cells in `geneticistRules.revealRadii`. The class 3 formula is
  `(((255 - native73) × class3Cell) >> 8) + 256`, with 32-bit multiplication.
  The importer admits only those sixteen table bytes and records their source
  offsets/hash; it does not expose a general source class-table dump.

## Boundaries and evidence

Free flight/vertical targets, attached special ground physics and negative
desired-speed actor states are explicit unadmitted branches. Required numeric
bytes are never replaced with zero. Finite ray/target/waypoint bounds reject
runaway inputs rather than return an invented path or visibility result. Other
specialist role callbacks and terminal death removal are separate families.

The read-only admitted executable is SHA-256
`4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba`.
Evidence includes static 6FB60, 6F980, 6DF30, 6F8F0/6DB00 contact speed,
6F760/73770/736F0 metrics, 743C0 ray, 6F0C0/6EDE0 waypoints, 305F0/6D230
idle search, 52280 setter, 707A0/74CC0 escape, 6E9E0 relocation,
8B130/74D90 admission, and bounded mapped-code reads of 73AC0, 75890 and51CF0.
Code is expressed independently; source bytes and fixtures remain private.

Twenty private closed source cases match **3,600 numeric actor bytes**, all RNG
state and water factory code order across **220,467 static instructions**.
Cases cover idle, arrival, movement/turning, backoff and release, actual Mule
association, airborne/bounce, shallow/deep water, boundary waypoint, automatic
idle relocation, crossing a cell, sloped terrain, detached and gravity-disabled
movement, plus escape success/failure. Pointer slots are excluded. The cell
crossing case includes native link bytes; factory internals are explicit ports.

Fifteen further closed cases match standoff/reveal results and complete
visibility query point/height sequences across **10,123 static instructions**.
The visibility building predicate is an explicit controlled port in those
cases; this proves the ray arithmetic/order, not all building resources.
Nineteen public tests use synthetic states/tables and cover these contracts,
native preservation, lazy capabilities and atomic failures. Geneticist role
tests and importer tests cover the connecting callback and admitted data cells.

These checks establish bounded reusable family behavior. Canonical mission
acceptance remains **0/24** pending the separate complete playthrough criteria.

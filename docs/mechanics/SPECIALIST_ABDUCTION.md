# Specialist abduction

`specialist-abduction.ts` implements source51E30 setup,52B90 and the actual
57A10 state3 callback, using the existing common motion and animation envelope.
The visitor's punishment controller still owns target selection, its30/40/120
phase timers, height39 writes, gravity flag21-bit20, and final57740 removal.
An abducted unit continues its source physics, animation and common bookkeeping.

## Setup and cancellation

`setupStagedSpecialistAbduction(world,index,parentNative102,{cancelWork})` runs
the actual51E80(mode1) port before any setup writes. The specialist native and
retained player/blueprint arrays must keep their identities across that call.
Then51E30 sets state85=3, reference127/129 to the actual visitor index/kind8,
action25=8 and signed timer104=10. It does not clear velocity, reset ANB frame/
counter, disable physics, set the gravity flag, or remove the unit.

`cancelSpecialistWithoutActiveRole(native200)` implements51E80's common path
when native88-bit0 is clear. It returns a numeric copy; an already-staged host
can splice it into the retained record. It writes130=0,126=255,
word112&=EE69, desired63=0, word73&=EFE8,84=0,22&=3F, then word73&=EFFC
and22&=7F. Queued87, physical velocity, timer104, state85 and remaining88 bits
survive. The selected-unit mode1 panel refresh remains a host presentation
obligation. No idle reset or RNG is added.

For category0, an actual modern construction task must first run the real
construction cancellation/projection bridge, even when that bridge has no
native88 task bit. Native category0 tasks with88-bit0 set also require their
actual51E80 task release: construction job12=-1/count decrement, sound29 stop
and the appropriate footprint protection release for stages<=4. A task already
at stage5 keeps its building. Other native task modes have their own required
building/effect releases and are not admitted by the no-role helper.
Category1 and2 use the existing in-place Botanist and Geneticist cancellation
functions. An active category3 task requires its actual source release; the
no-role helper cannot substitute for that. Native88-bit0 still set is an error.

## Actual state dispatch

The relocated table at579AC maps state3 to57FBE→52B90. State7 maps to53000.
Their adjacent listings do not establish the dispatch order. This distinction
was checked against a complete static callback comparison before release.

`stepSpecialistAbductionCallback(world,index,context)` reuses the complete
57A10 envelope. Its context adds `abductionServices`:

- `parent(world,visitorIndex)` resolves the actual102-byte family8 record at
  reference127/129. It must match kind8 and index; a missing/cleared association
  fails explicitly instead of leaving an immortal static specialist.
- `particle(world,request)` runs real48790 selector26 and returns its slot or
  null for capacity failure. The request is owner0, parameter0, caller delay0,
  null parent and `newborn:false`, with zero angles. The existing actual26
  factory supplies its successful delay draw; the host publishes spatial links,
  native prior/fractions, occupancy and count before continuing.

`stepStagedSpecialistAbductionState` exposes52B90 alone inside an already
isolated callback. Its receipt includes parent stage, timer before/after and
the optional exact particle request/allocation result. The wrapper returns this
as `receipt.abduction` alongside the ordinary common receipt.

Before parent stage5, every eighth `(frame+unitIndex)` callback consumes three
draws and calls26: height is current physical39+640+(rand1%20)\*64, Y adds
rand2%32 and X adds rand3%32, with signed-word coordinate wrapping. All three
caller draws occur even when capacity fails. A successful26 factory consumes
its own additional draw; its record remains unmarked for the later shared pass.

Parent stage4 sets idle action89=11 and consumes one draw each callback to
set/clear native112-bit4. Stage5 sets89=10 and preserves timer104 without a draw.
Other stages decrement timer104 as signed32; at<=0, three draws select89=8 or11
(rand%10<3), timer20..49 and112-bit4 (rand%4<2). Periodic feedback precedes
these stage writes and draws.52B90 does not retire the actor or emit audio.

## Motion, common tail and isolation

State3 now passes the existing6FB60/6F980/6DF30 motion admission for every
category. Physics retains fractions, residual velocity, gravity until the
visitor sets21-bit20, terrain samples, real spatial relocation, water effects,
damage and reveal ports. Virtual8 is false in state3 for blast classification,
but6DD50 does not consult it: a real74270 building hit still applies its normal
impulse. The motion implementation is otherwise unchanged. Existing explicit
guards for unimplemented attached/flight/vertical-target paths remain guards.

57A10 still applies category2/3 cooldown100, source health regeneration,
class3 charge115/57860, skill recovery, presentation selection and7AC00. State3
normally selects action from signed native89; setup's initial action8 does not
freeze the ANB. Common selection flags can still choose their established
alternative states. Parent stage5's10 action remains the actor's own art,
not an effect resource. Current position/height must be mirrored after stepping.

`GeneticistCallbackContext.stageWorld` is an optional complete host staging
provider shared by all common specialist callbacks. Without it, the existing
full structured clone is used. A provider must isolate every mutable callback
and service root, including native pools, player bytes, terrain, RNG, effect
allocation/cleanup and visitor records. It may share immutable imported content.
The entire callback commits only after all required services and ANB succeed.
The new setup/staged state helpers require an encompassing host transaction.

## Verification

Fifteen synthetic tests cover setup ordering/identities, no-role cancellation,
all four categories, source stage/timer/RNG order, a real26 constructor,
height/gravity/residual motion and collision impulse, charge/regen/ANB,
custom/default staging equivalence, missing references and late rollback.
Existing Geneticist, Botanist, damage and motion regression tests pass.

Ignored private comparisons read pinned disassembly/mapped numeric data as
input, never execute the original program. Sixty-four whole57A10 callbacks
across all16 actual actor resources and four complete51E30/no-role51E80 setups
match474,320 numeric bytes including all player afterimages and RNG over80,592
literal instructions. Cases include parent stages2/4/5, periodic26 capacity
failure, timer expiry, real6DD50 impulse, gravity/free height and ANB tails.
Render-queue insertion and the26 factory are explicit comparison ports; the
actual26 constructor/lifetime and shared scheduler have separate checks.
This bounded family does not establish complete specialist roles or campaign
acceptance. Source files and original artwork remain private.

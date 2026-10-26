# Geneticist capture, research and healing

`geneticist.ts` independently expresses the category 2 specialist control family
against actual kind1 creature records with species selectors0..24. It requires retained 20 × 200 specialist
records, real blueprint bindings and the four 1805-byte player records. Unknown
native bytes remain nullable and required numeric reads fail atomically. No
creature, DNA, research completion or projectile contact is synthesized.

## Host entry points

- `queueGeneticistInteraction` binds category2 packet81080 for task0 research
  or task1 healing. It sets pending57 bit0 before conditional51E80 release,
  initializes51960 target/role bytes, then stamps130=1. If state85 is8, it
  performs virtual84 Stop and clears active58 bit1 so57A10 can leave the old
  movement and activate the pending role. Physical velocity is retained. It
  does not perform a motion or role callback during command admission.
- `stepGeneticistCallback` orders actual 6FB60 motion, cooldown decrement,
  blueprint recovery, moving-state completion/error, pending command activation,
  idle acquisition or role work, class 3 charge, stamina recovery, animation
  selection, presentation, 7AC00 animation and gated terrain footsteps. This is
  the ordinary runtime entry. The required `motion` port must implement actual
  source 6FB60, including routing, arrival, water and spatial relocation.
- `tryGeneticistIdleAcquisition` exposes only the 52780 pulse. It does not replace
  the idle timer tail. Acquisition is consumed on the following callback, because
  pending dispatch precedes the idle callback. An ordinary hostile Mule queues
  task 1; the source stunned predicate (state 18 with positive word 108) queues
  escape instead. This automatic task does not grant research.
- `stepGeneticistRole` is the isolated 55200 callback, after the common cooldown
  phase and before common animation. `requestGeneticistInteraction` retains an
  immediate initialization/activation entry for isolated arithmetic comparisons;
  ordinary UI orders use the queued entry.

Task 0 pursues and fires real projectiles at uncaptured live targets. Research is
eligible for the original stunned, capture or corpse conditions. The exact
research cadence, chance, skill/flag/dead modifiers, species-list insertion,
new-species counter, research cap, target damage and release are retained. Task 1
uses the source eight-phase healing cadence and BL=3 nutrition branch, including
young-Mule energy cost. Capture creation, flight, collision and stun expiration
belong to the actual shared projectile/Mule lifecycle; a successful factory
receipt alone never changes target state.

The three 7-byte projectile rows are explicit `GeneticistRules` inputs. Each row
contains signed words `speedWord`, `rangeFactor`, `cooldown` and byte `effectCode`.
They bind original object 3 offset 4AD0, length 21, SHA-256
`575d8d96052769d6f57b96437a4d1281eeba23f034115bdf53deacc1e091cce1`.
The range product is a **linear** physical-distance threshold. The 6D830 muzzle
height adds 1280; the target predicted height does not receive that offset.

## Shared native mirrors and services

`readGeneticistMotion` / `writeGeneticistMotion` map these known fields only:

| Native offset, decimal       | Motion field                            |
| ---------------------------- | --------------------------------------- |
| 7 / 9                        | x / y                                   |
| 17 / 39                      | ground / physical height, signed dwords |
| 43                           | width, unsigned word                    |
| 45 / 47 / 49                 | vx / vy / vz                            |
| 57 / 59 / 61 / 63            | yaw / pitch / speed / desired speed     |
| 67 / 68                      | retained fixed fractions                |
| word 73 bit 2000 hexadecimal | turn braking                            |

Native word 65 is the separate contact speed used for walking animation delay.
Routing flags, accelerations, references and unknown bytes stay authoritative in
the native backing. Mirroring `MotionState` cannot reconstruct them.

Context supplies actual shared cell order (including eligibility completeness),
75890 visibility, pure 73AC0 standoff, 707A0 escape ray, 6D830/shared 48790 shot
creation and kind 1 virtual 34 damage. Runtime globals 118770, 118968, 180D80 and
11C2BC are explicit inputs. Actual animation profiles are required; no default
holds are used. 57860 charge and 8B520/code 6 footsteps are required lazily at
their original gates. Footstep factory precedes audio 4B even if capacity fails.

Role services mutate the staged world in place and retain specialist, target
and player raw array identity, matching stable source pointer records. Replacing
them is rejected. The outer common motion/charge services may replace fields;
the callback reacquires native records afterward. Port implementations must keep
side effects inside the staged world; send returned audio/presentation events
after commit. Any missing required service rolls back state and RNG together.

The admitted four reveal dwords at object 3 offsets 4AEC, 4AFC, 4B0C and 4B1C
bind combined SHA-256
`2d5bc62eabe8e715b61cff309e65bbd852fc04477c710600e30d78b9de3ff0e4`.
`specialistRevealRadius` applies the class 3 charge formula before 75B00.
`specialist-motion.ts` supplies the source motion, visibility, standoff,
category 2 plant blocker and escape helpers; see `SPECIALIST_MOTION.md`.
The approach distance is `128 + skill × (task0 ? 12 : 4)`, passed explicitly
to the pure standoff helper. It takes no query or RNG draw. Escape has a caller
610 distance draw followed by the 707A0 5EC direction draw, both retained.

`cancelStagedGeneticistWork` exposes in-place51E80 for an already isolated
damage transaction, preserving native/player/binding identity. The atomic
command entry remains available. `stepSpecialistLifecycleCallback` admits only
actual category0..3 states4/5 and delegates their dispatcher to
`specialist-damage.ts`. The source checks retained C0 blueprint bytes after
deletion before its class3 charge gate; retired actors then skip the ordinary
ANB/stamina/footstep tail. No live-actor validation is performed after retirement.

The shared57A10 envelope also supports the category1 Botanist hooks. Its
cooldown100 decrement belongs only to categories2/3. Staged idle/role entries
run inside the callback's single outer rollback transaction; public isolated
entries retain their own atomic clone. Bind `stepStagedSpecialistMotion` inside
this envelope to avoid another full-world copy. Missing later services still
roll back all earlier motion, RNG, role and lifecycle changes together.

## Evidence and checks

The read-only preservation archive's source contracts and Rust runtime were
checked against the admitted executable SHA-256
`4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba`:
57A10 common order; 51960/507D0 admission and activation; 52780/58A70 idle
acquisition; 58920/589E0 query scoring; 55200 work/research; 54A00/54B10 capture;
526C0/52340 movement continuation; 51E80 release; 5C730 nutrition; 73770/738F0
physical metric; and 1EC10/1EC20/1EC30/1EC50 Mule virtual predicates.
Query scoring uses exact terrain heights in 736F0's squared metric, including
the source corpse penalty and strict first-winner tie behavior.

Thirty public tests use synthetic states/rules. A private frozen comparison
of fifteen closed 55200/capture/release cases matches **112,740 numeric bytes**
and all RNG state across **6,511 static source instructions**. Cases include
live-stunned and corpse research, minimum gain, young/non-cadence healing,
cap/release, flags 32/64, an existing species list, fired/null factory, cooldown,
turning, no visibility and distant pursuit. Pointer bytes are excluded. Aim,
factory, visibility and presentation are explicit ports in this comparison, so
it proves the caller arithmetic and state changes, not full world/projectile
conformance. Public callback tests separately cover queue/activation order,
recovery, idle draws, arrival, motion mirrors, factory order and atomic refusal.

This is reusable family evidence, not canonical mission acceptance. The
conversion's canonical mission ledger remains **0/24** until the separate
source-data playthrough and result/carry acceptance requirements are met.

The complete81080 category2 caller is additionally compared against static
instructions in576 cases: both tasks, four native states, three retained stamps,
four active-bit combinations, two pending images and three skills. All103,680
numeric actor bytes, ordered stop-audio requests and unchanged RNG match over
79,632 interpreted instructions. Device audio returns are explicit ports and
MAINPANL selection is inactive; no original executable is executed. Public
regressions cover retargeting during native state8, pending JSON continuation,
actual next-callback activation, conditional prior-task release, late rollback
and normal campaign movement-to-research with full sealed replay. This repairs
a command-wrapper omission; earlier frozen campaign graphs and their stalled
travel evidence remain unchanged. It does not establish canonical acceptance.


## All-species target binding

Brown's first AI acquisition at frame760 exposed a conversion-only selector4 guard. The source target resolver, queued human command, capture child20 impact and55200 research/healing family now validate the actual kind1 record, stable slot/back-reference and selector0..24. The human target list identifies Crabs and keeps the existing wire-command names for save/replay compatibility. Actual capture/contact, ownership, visibility, range, cooldown, death/cold and capacity predicates remain in force.

Research completion uses `player+61A+target7A*4`, matching the pre-existing indexed cap predicate. Discovery inserts the actual species once at6AE, updates6E0 and counter705, and emits that species in its receipt. It never writes the Mule DNA slot while researching a different species. Damage still dispatches the actual recipient's source species context, including Crab defense; unsupported distinct creature behavior domains remain explicit failures in their owning callbacks.

A new private comparison runs all25 species through the15 frozen caller cases:375 cases,162775 mapped instructions,2818500 compared numeric bytes and exact RNG. Focused regressions cover all25 independent DNA lanes, discovery uniqueness, actual Crab command admission without research synthesis, healing without DNA changes, invalid-species rollback, and generic child20 impact identity. The genuine pre-refusal frame700 save also advances500 ticks with exact save/reload and replay and no source error notices. These are mechanic verification receipts, not mission5 acceptance.

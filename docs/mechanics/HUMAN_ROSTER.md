# Human specialist selection and recruitment

`human-roster.ts` implements the explicit human picker and packets7/8/9/10.
`human-roster-adapter.ts` binds them to retained campaign players, native
specialists, resources, shared effects, landing and activation. It does not use
the AI32E60 automatic roster, quotas or32F10 health-plus-skill score.

## Input and native handlers

| Input                                             | Source                  | Behavior                                                                                                                                          |
| ------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `roster-select {blueprintIndex}`                  | 20AE0/21700→81300/81310 | Select the actual named, healthy, unselected candidate; construct the first free player slot through4FD30 and append its actual ID.               |
| `roster-deselect {blueprintIndex}`                | 20AE0→81360/80360       | Remove a waiting roster entry while retaining its blueprint and C0 identity.                                                                      |
| `roster-target {point}`                           | 20880→81370             | Copy both signed16 point words to player9/11. The established UI producer uses the associated building's point plus its admitted offset.          |
| `roster-deploy {deployment:1,associatedBuilding}` | 20AE0→81390/80830       | Mark pending actors, bind their resources/ANB8, then request actual landing or immediate activation.                                              |
| `roster-deploy {deployment:0,...}`                | 20A80→81390             | Scan five native rows ascending and unselect active rows whose word112 has neither readiness1 nor landing0x400. The second packet word is unused. |

21700 scans all32 metadata records. A candidate needs a nonempty name, matching
signed category, signed-positive current health, and both low runtime flag bits
clear. Four candidates per category are ranked by **signed skill**, across all
styles; the earlier metadata index wins ties. Source210D0's four horizontal
positions choose rank, not style. The mission1EBD category mask and stored
signed actor count below5 gate the human add input. There is no extra campaign
progress restriction in20AE0: the actual mission mask owns role availability.

The human launch gate is player498's **reference kind equal to0**, not the AI
499 cooldown dword. It also requires a stored roster entry with BP flag1 set
and flag2 clear. Individual removal additionally requires native113 bit4 clear.
No handler in this family charges funds, changes health or consumes RNG before
the separately established landing/activation services. Creation and removal
preserve every unrelated numeric byte.

80360 searches all five retained C0 bindings, including inactive rows. It clears
the BP's low two flag bits, decrements the stored count, shifts the list without
clearing its old tail, clears the resource pointer and native activity, and
retains the C0 blueprint identity. It does not perform57740 death, unlink,
724C0 cleanup, work cancellation or800B0 name deletion. An unknown retained C0
binding reached by the scan remains an explicit error; null is not silently
treated as a known mismatch. The ordinary human input gates prevent removing
landed/spatial actors through this pending-roster path.

## Panel access and entry order

The source building-selection route in30100 is a separate prerequisite from
20AE0's inner launch predicate. Case4 at2CA94..2CB59 opens21A10 for selector0,
20880 for **selector5**, and27430 for other selectors. Owned selector5 buildings
can open the recruitment panel; an allied building requires both players'
alliance bits. This prevents treating Genepod production fields as landing-pad
fields. The panel can open while a center is incomplete or busy. The launch
button then requires building flags49 to contain5 and exclude0x140. The view
therefore returns every routable active center with a separate launch reason.

The unassociated initial panel is a module-entry action.7D090 completes its
player loop, calls72AD0, then7F950 and requests the main game module. Its
30120→2BBE0 setup tests the current child pointer at manager+C8. If empty,
2BDE3..2BE26 opens20880 only for the actual campaign185DEF/network1863B8
modules, zero mission1EC2, and either flags20 clear or signed progress at least4.
The current child pointer is not a permanent first-setup counter.2BBE0 itself
is module setup, not the ordinary per-frame update: closing the child does not
automatically rerun it or authorize an unassociated panel reopen during play.
Early campaign auto801C0 selection/deployment remains unchanged.

71B70 first clears flags2/4, then reads the actual serialized52 global bytes.
7D090 ORs2. All24 admitted variant maps store flags0x38, establishing0x3A before
the main panel.2BBE0's nonmanual branch ORs4; the manual panel leaves4 clear.
70B00 skips strategic AI while4 is clear.1C120 still dispatches input packets,
then1C73B skips zones and world callbacks while4 is clear. Source20AE0's
unassociated launch queues10[1,-1], closes the panel and ORs4 when runtimeMode
bit1 is clear, **before** allocation. Thus a true allocation-capacity false
still resumes simulation. The conversion's saved initial-panel state represents
this input stage. Its host `tick` can record input iterations while the original
frame, RNG, countdown and world remain unchanged; those clocks are distinct.

20A80 is the panel-close virtual14 reached through13C80, including the global
Backspace route2D302. It closes through24850 and emits10zero unless the outgoing
packet already has opcode10, in which case it preserves that packet. It does
not set run flag4. Escape's menu route also requires4 set. Cancellation does
not invent an initial-panel reopen or a zero-roster launch; the converted UI
states the resulting hold honestly. Presentation capture, original layout and
keyboard-device behavior are outside these numeric packet comparisons.

Carry cleanup must precede the next entry.80590 copies selected raw0..4A1 and
61A..6F7 literally, including actor count/list/BP flags. The existing outcome
carry plan implements80E90/80360 removal and clears retained landing metadata;
`continueCampaign` supplies those cleaned player records. There is no invented
extra raw3 reset on the progress>=4 startup branch.

## Shared80830 and special landing

The narrow exports in `strategic-recruit-adapter.ts` share actual4FD30 creation,
the actor/Engineer projection,80830 and80AE0 with both callers. Its AI entry
still checks retained strategic state before those bodies. The human adapter
requires no AI record, quota or automatic candidate selection.

80830 marks every active, unready native row with113 bit4, writes its point,
sets22 bit8, executes56E20's actual scratch reset/resource binding, then selects
ANB8/frame0/delay0/direction1. This prefix remains on a genuine capacity false.
For ordinary unassociated actors it uses player9/11.7F3B0's carrier point uses
that same target, except human nonzero1EC2 uses mission1C9A/1C9C and parameter1.
The factory height is sampled terrain plus0x6400. There is no source water/site
admission in7F3B0; an unavailable downstream water callback must reject explicitly.

Associated actor/carrier placement adds the separately admitted object3+124F0
signed-word pair to building7/9 with16-bit wrapping. Its4-byte SHA-256 is
`4737857dac75cb2770fca5c42ecc29996a7656b68c84bc14064a35b16fc3f117`.
The profile is required only when this branch consumes it; the processing-front
offset is a different table. Carrier height is the building's retained native17
plus0x6400. On successful allocation, the acting player stores the actual
returned slot/kind. Reveal tests the building owner against the selected player,
and the prepared point is written to the **building owner's** target, including
an allied-center request. Capacity false leaves these later writes untouched.

The selector64 marker is created by actual72AD0→8AAE0 after zone initialization
and before selected-player reveal. A positive unsigned1EC2 creates64 at1C9A/1C9C,
at terrain height, owner0, zero angles/parameter/delay, then reveals its point.
It is not fabricated by a later launch or by packet9. Parameter1's49 factory
allocates the real carrier, then returns the first retained selector64 row,
even if inactive. Its true kind is preserved. An absent64 gives the source's
one-past boundary and a complete conversion transaction rollback. Selector64,
its51 child and associated49 site/contact lifecycle have their own concrete
mechanic and scheduler implementation/receipts. Source724C0 does not clear the
player reference on marker retirement;49's own tail owns that later clear.

## APIs and verification

The campaign host invokes module setup once after72AD0. Manual initial selection
retains a saved `initialRecruitmentPanel` identity and source runflag4 stays clear.
Input packets continue through1C120 while AI and ordinary world callbacks wait.
The modern replay `tick` counts these input iterations; native `frame`, simulation
RNG, countdown and terrain do not advance. Closing cancels waiting selections
without setting4 or reopening the panel automatically. The UI exposes restart
after that source cancellation, rather than inventing a resupply route.

An initial launch retains its producer phase in the pending save.70B00 reads the
old runflag first, then20AE0 sets4 unless runtimeMode bit1 is set, before packet10
attempts80830. A later capacity or concrete-service failure does not undo that
earlier UI flag write. Normal subsequent frames retain the established order:
AI, queued packets, zones, actors, buildings and remaining callbacks.

Special human frame0 entry uses the existing shared80830 immediate80AE0 branch
before72AD0. It sets activation count1 without allocating49; zones and64 marker
initialization follow. Startup rejects inconsistent normalized specialActivation
metadata instead of treating a changed convenience field as source bytes. The
existing early-campaign automatic picker and ordinary carrier path are retained.
The complete entry is atomic, including a later marker/profile failure.

The normal UI offers initial selection through its briefing and later selection
through actual selector5 centers with owned or mutual-alliance routing. Busy or
incomplete centers can open their panel; source launch flags still gate landing.
No generic active unassociated recruitment control is exposed. Initial panel
identity, pending producer, packets and actual native state all persist in saves
and recorded replays.

- Mechanics: `chooseHumanBlueprints`, `humanRosterView`,
  `humanRecruitmentBuildingRoute`, `initialHumanRosterPanel`,
  `admitHumanRosterCommand`, `unselectHumanBlueprint`, `issueHumanRosterPacket`.
- Campaign: `campaignHumanRosterView`, `campaignHumanRosterInitialPanel`,
  `campaignHumanRosterAssociatedTarget`, `issueStagedCampaignHumanRoster`,
  `issueCampaignHumanRoster`. The last is a complete isolated host transaction.
- Receipts distinguish rejection, real creation/removal/landing, capacity false
  and unchanged outcomes. Staged services retain native/player array identity.
  A late profile, allocation, resource or concrete-service error rolls back the
  full host, including shared cleanup, audio and RNG. Normalized blueprint and
  actor/Engineer views read actual native afterimages; they do not supply rules.

23 public synthetic tests cover ranking, flags, capacity, retained inactive C0,
list tail, actual4FD30 construction and resources,49/64, signed offsets, ally
owner effects, late rollback, initial gates, save/reload and200 actual shared
callbacks with a complete repeated semantic input segment. Existing13 AI recruit
tests continue to pass. Independent root tests cover ordinary queued commands,
recorded full-host replay and initial input-only persistence; those are separate
from this module's tests. Synthetic profiles do not establish campaign acceptance.

Private closed static-listing comparisons preserve these receipts:

| Scope                                              | Cases |      Compared values | Interpreted instructions |
| -------------------------------------------------- | ----: | -------------------: | -----------------------: |
| 21700,81300/80360/81370/81390,20AE0 input branches |   104 |            4,117,322 |                   32,592 |
| 80830/7F3B0 caller and56E20 numeric reset/bindings |    28 |              303,320 |                    7,936 |
| 2BDB9 initial gate and30100 case4 routing          |   232 | 232 boolean outcomes |                    4,310 |

The first receipt excludes4FD30/80830 bodies and presentation capture/close;
the second uses real converted factories but excludes48790's body,75B00's map
body and immediate80AE0 (already separately compared). Successful factory
arguments and complete defined specialist/player numeric afterimages match.
Capacity-failure factory arguments are a source trace, not an observed converted
native image. The access receipt compares literal call selection, excluding
presentation callee bodies. Pointer gaps and native process addresses remain
logical bindings. No original executable was run and no original bytes, text,
artwork or captures are committed. Canonical acceptance remains0/24.

# Strategic Engineer construction planning

`strategic-ai-engineer.ts` supplies the complete numeric37C50 dispatcher and its
37D60 repair,37F30 infrastructure and390D0 development bodies. It also implements
the distinct43960 building/439E0 next-grade admission tests. It replaces the
specialist controller's temporary `engineerPlan` service with
`makeStrategicEngineerPlanningService(context)`. This release requires the real
site, terrain, resource, expansion and action services described below; it does
not remove the campaign strategy guard by itself.

The in-place entry is `planStagedStrategicEngineer(state,player,actor,context)`.
`stepStrategicEngineer` isolates the strategic roots and the effective command
cache metadata. The receipt returns37C50 identity/result, numeric planning
capacity and expansion afterimage.37C50 always returns true in its admitted
domain; its internal phase60F distinguishes disabled4, repair23, infrastructure6,
development7 and exhausted8. A phase does not prove a command was installed.

37C50 sums source104D10 weights for active buildings matching the actual6BD
classification, retaining the16-bit sum. These are the already imported
`buildingRules.upkeep` bytes; no alternative building weights are invented.
It checks639 before dispatch.37D60 visits all64 owned rows in order, selects the
first incomplete row not referenced by another live Engineer and compares
actual signed health with104D1E selector/grade health. References are compared
by the source signed index remainder64. A damaged row receives its real repair
task. Even a full-health incomplete row reserves47+selector and returns handled,
without fabricating a repair action.

37F30 preserves source strict/weak budget distinctions and reservations. Empty
bases first consider selector11; missing primary construction slots consider
selector3. Discounted construction cost uses signed blueprint skill and signed
104E1C cost against the actual sum of player4A3/4A7. Infrastructure derives its
capacity from matching source buildings: selector3 grade, selector6 grade plus
the retained mission1C5F coefficient, selector8 actual7B140 height and selector9
grade. The height path retains the source repeated read when the first level is
at most8. Low and negative height behavior is preserved, including word wrap.
The actual625/603 conditions, outstanding reservations and existing source
counts determine power or storage planning. Both available power types trigger
two real selector15 site-planning calls; the first result does not replace the
source's preserved second selector15 argument.

All plan attempts retain the source final affordability and74E80 occupancy
checks. Selector11 also uses the actual resource survey when buildings exist;
score below200 rejects the site and writes the5000 backoff. Source callers can
report handled when a real site is blocked or an attempt produces no command.
Successful site admission writes its classification reservation and the complete
known11-byte construction cache before the actual811A0 action. Neither a site
receipt nor a reservation is a constructed building.

390D0 checks the source early selector3 condition, then scores missing available
types, repair candidates, selector11 special work and upgrades. It preserves
strict ties and a literal selection quirk: repair/special choices replace the
selected action without updating the stored best score, so a later weaker
candidate can replace one against that unchanged threshold. Upgrade priorities
combine the actual1079A0 next-grade byte and signed627. Native maximum-grade,
flag0400, readiness and439E0 gates are distinct. The chosen actual native row
supplies repair, upgrade or special-work arguments. Those actions retain their
source handled/unhandled result and phase behavior.

When no action is selected, expansion uses the source6BD/95/626 restrictions,
existing classification counts and player start point or mean of classification1
buildings. The mean truncates each signed coordinate to cells, then truncates
the average and shifts back to world units. It does not use a circular mean.
The320E0 interval derives from658 with its source fallback, and634 supplies
radius/extent. A real found point increments95, writes6AA and marks the local
expansion afterimage. A miss updates626; no settlement is synthesized.

43960 obtains progress through the construction subrecord's retained owner byte
`player[4A1]`. It does not assume this equals the top-level player index. It
checks progress threshold below30, the actual prerequisite count or60E override.
439E0 separately checks602, excluded types10/11/13, next grade and that retained
owner's progress. Inputs use the actual imported progress/prerequisite tables.

`StrategicEngineerRules` receives existing imported upkeep, signed health42,
signed costs14, unsigned footprints14, progress thresholds42, prerequisites14,
signed `strategicAIRules.buildingValues[14][3]` and the new unsigned priorities.
`strategic_engineer_profile.py` imports only hash-admitted object3+79A0's42
priority bytes, normalized to14×3 with executable/range provenance. Its SHA-256
is`61f3637e2c07fcc1db043ef0ce2eb71788651b48cc265600f2d15a8c26c843e1`.
It never executes the original, applies fixups or exports code bytes.

Required concrete services use these exact bounded interfaces:

- `planSite`:3A1E0 request includes source callsite, actor, desired selector,
  classification and `{player,owner,capacity,expansion}` planning context.
  It returns an actual selector0..14 and point, with null admitted for invalid14.
- `siteBlocked`:74E80 receives source point and imported footprint; it returns
  the actual blocked boolean.
- `resourceScore`:8D930 receives point, radius0400, extent100000, mode1 and
  logical predicate31B30 (vtable112708); it returns the actual unsigned score.
- `terrainHeight`: reads actual7B140 at the supplied point, preserving signed
  source height rather than a guessed grade or generic elevation.
- `expansionSite`:320E0 receives owner, point, interval, radius/extent and logical
  predicate32230; it returns the actual found point or null.
- `command`: the existing nullable packet service executes811A0 construction/
  repair or81080 upgrade/special work, with actual cleanup/motion/cancellation.
  Known construction cache bytes are copied before the call. Unconsumed target
  packet words remain null. Held source records are preserved.

These services must mutate the same isolated host when their actual source body
has writes. Missing services reject when their branch is consumed; there is no
silent query result or successful role-action provider. The parent spatial/site
family owns the remaining3A1E0/74E80/31B30/32230 bodies and their concrete host
bindings. The standalone transaction does not clone unrelated captured roots.

Twenty synthetic TypeScript tests cover admission/subrecord identity, disabled
capacity, first repair/attended/full-health behavior, blocked planning, repeated
power searches, source height reads, resource backoff, exact caches/reservations,
budget rejection, upgrade/special/repair selection, expansion mean/miss,
late rollback, missing services and33F60/save composition. Three synthetic Python
tests cover unsigned priority decoding, provenance, identity/hash/extent and
mapping bounds.

The private40-case closed comparison matches3,279,833 known numeric values over
411,189 listing-model steps, SHA-256
`907fec9be7146781918f822c61f2fc0bcd1c341b679d146216d7ba51cbaf9ce1`.
It includes whole37C50/37D60/37F30/390D0 and43960/439E0 with actual admitted
tables.3A1E0/74E80, resource/expansion surveys, terrain reads and real role actions
use explicit synthetic afterimage ports; their bodies are outside this proof.
Pointer gaps and unwritten target packet words are excluded. Original processes
and native game code never execute. No complete AI or campaign acceptance is
asserted.

Read-only evidence: the `mission-array-refs` listings/decompiles for37C50,
37D60,37F30,390D0 and3A1E0; `mission-contract-refs`43960/439E0 ranges; existing
numeric import contracts for104D10/104D1E/104DE0/104E1C/104D88/104E74 and1078F8;
new bounded1079A0 priority metadata. Original table contents, private fixtures
and generated proof outputs remain ignored.

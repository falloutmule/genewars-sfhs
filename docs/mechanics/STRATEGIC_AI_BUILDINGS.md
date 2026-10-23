# Strategic Genepod and settlement planning

`strategic-ai-buildings.ts` implements source360B0,36FF0 and31830.
It consumes the actual Genepod58 result, including the301 failure sentinel,
updates production timestamps/settlement counters and assigns the creature's
real role and settlement control bits. It visits all64 owner building slots in
source order. Group creation uses the first free group4..15 with the actual
constructor zone1 and retained high flags. Settlement centers average signed
cell coordinates toward zero before converting back to fixed point.

Production balances the source three role percentages, counts retained owner
bytes even on inactive creature records and preserves emergency production,
cooldown, funds/GOOP, population threshold, fallback and unsigned elapsed-time
gates. Species selection delegates to the complete36920 helper. Actual814A0
production remains a required command port, with no invented payment or birth.

`strategic-ai-survey.ts` implements31330/31560 with the actual source grid,
shared head-to-next ordering, virtual68 and family-specific census. It retains
friendly creature roles, foreign threat values, plant nutrition and the eight
angle bins. The census destination is independently selected by18D. Its mode0
grid consumes no RNG. The current cursor is saved before advancing at a work
budget stop, so the boundary cell is counted again on resume. This original
behavior is retained. Source31830 preserves the previous four-byte cost field
while clearing its other listed settlement fields.

One deliberate deterministic bug fix initializes the emergency-production
result scratch to false once per360B0 pass. The literal source reads that stack
byte without a preceding assignment when an emergency request is skipped.
The conversion retains subsequent values across pods, but never inherits
arbitrary stack contents. Private comparisons use an explicit zero stack
image; they do not claim parity with other uninitialized stack values.

Private numeric comparisons pass24 planner cases (1,967,424 values/58,514
listing steps) and27 combined planner/census cases (2,780,132 values/103,299
listing steps). The first set excludes the survey and814A0 bodies through
explicit ports. The second executes the survey/census arithmetic and real
source reference resolution, with concrete virtual68 as a readonly predicate
port and no production calls. Public tests cover output/failure handling,
constructor/cost priors, signed centers, role ratios, cursor behavior, missing
services and JSON continuation. No original native program was executed.

These are strategic services, not an active opponent in the campaign host.
Real creature commands, specialist/construction planning, production dispatch,
host persistence and complete gameplay verification remain required before
removing the strategic first-pass guard. Canonical acceptance remains0/24.

# Current direct-conversion state — 24 October 2026

## Krell (mission 2) proven in ordinary play, simulation layer

The carried Exceland state now plays Krell end to end with public commands only.

**Objective:** `terrain-score` (source player byte `0x0D`) target 1000 from the single marked zone at **(256, 24320)**, decoded from the mission prefix at `BASE 0x2ff8`, stride 19 — selector **12** (gene category 4), chain −1, quota present. The mission *target* (1536,15360) is a different point and is not the zone; moving Mules there scores nothing.

**Route, all ordinary commands:**
- Power (`3`) then Gene Pod (`0`) at Krell's own anchor
- Geneticist `research-mule` on a wild Mule with `native[122] === 4` — research quality 3 → 7 → 18, which is what makes the pod's birth roll succeed
- `produce-mule` repeatedly: each birth costs 75 total and yields an **owner 0** Mule (pod-born Mules are player-owned; the mission's wild Mules are owner 4)
- `move-mule` each owned Mule to the zone centre, re-issued as new Mules are born

**Result:** nine live Mules in the zone, `terrain-score` reached **1008/1000** at frame **9,921**, `phase: "result"`, `result.phase: "victory-notification"`, zero error notices. Save → reload at that state gives an identical checksum and the same result. `continue-notification` → `enter-victory` → `advance-victory(1)` → `campaign-view-queued` with `progress 2`, and `continueCampaign` initialises **mission 3 Madami** at frame 0, `briefing`, `progress [2,1,0,0]`, funds 800.

**Mechanics confirmed, not defects:** the zone pass runs only while the mission countdown `0x355c` is zero, so credit accrues in windows; and Mules starve in the zone because it is barren (`reserve 12 → 0`, `health 67 → 0`, zero plants nearby), so sustained production and herding is the actual requirement. Both match `ZONES.md` and `mule.ts` mortality rather than indicating missing code.

**Evidence:** `.private/build-probe-20261024/probe10.ts`, `probe11.ts`, `probe12.ts`, `probe13.ts`, with `krell6.log`, `krell7.log`, `krell8.log`, `krell9.log`, and `zones.log` (zone geometry decode).

**Acceptance: Krell is accepted in the software ledger through the real UI.** The browser campaign run against the built artifact (`outputSha256 eb4ca213…`) played this route with real taps at **phone-landscape 915×412, phone-portrait 412×915 and desktop 1440×900**:

- Extractor (`11`), First Stage Distributor (`3`) and Gene Pod (`0`) placed by pointer from the Construct menu — the Photon Processor is not a Krell prerequisite (`pre[0] = 3`, `pre[3] = 11`)
- Mules produced from the **Economy** panel ("Produce Mule · 75 total"), up to three per round until funds run out
- each Mule selected in the **Units** panel, the camera centred with **"Show zone 1"**, then a ground tap to issue the move
- `victory-notification` with the objective ledger reading **`terrain-score 1024/1000`** and **`Finish marked zones 1/1`**, both complete
- "View result" → "Continue to next mission" → Madami initialised at frame 0, progress 2, briefing

Portrait needs the Mission/Units/Economy tab switches; the other viewports show every panel at once. The tap lands a few pixels off the exact zone centre because the camera focuses precisely on it and the centre ray otherwise misses the ground intersection — a projection quirk, not a game defect.

The route is verified in two invocations because one full run exceeds the 420 s execution budget: `CAMPAIGN_SKIP_REPLAY=1` exercises the Krell play-through, `CAMPAIGN_SKIP_KRELL=1` exercises the Exceland replay export/import and restart block. Both pass; neither is a weakened assertion.

Evidence: `.private/build-probe-20261024/ui-krell915k.log`, `ui-krell412j.log`, `ui-krell1440b.log`, `ui-replay1440.log`, plus `.private/browser-campaign/report.json` (artifact hash `eb4ca2131834acff…`). Simulation-layer reasoning remains in the probe logs above.

## Madami (mission 3) route research

Objective: **1400 current GOOP**, with storage capacity 1600 tracked separately. Decoded from the pack (`economyRules`, printed by `.private/build-probe-20261024/madami1.ts`):

- `extractor.goopPerResource = 2`, `harvestUnits = [2, 4, 6]` by grade, `cycleLength = 240`, harvest on frames 7–10, `harvestRadius = 3`, `upkeep = 1`
- `capacity.extractor = 600`, `capacity.store4 = [400, 800, 1200]` (Recycling Plant), `capacity.store13 = [500, 1000, 1500]` (Stores)

So **capacity 1600 is exactly four grade-1 Recycling Plants** (4 × 400), which is what the preserved Madami runs built, and it is a *separate* requirement from the GOOP total.

**GOOP is credited only by Extractor harvesting** (`economy.ts:736`): `player.goop = min(goop + consumed × goopPerResource, capacity)`. A grade-0 Extractor therefore yields 4 GOOP per 240-frame cycle, i.e. ~60 GOOP per 3,600 frames per Extractor. Reaching 1400 at grade 0 needs roughly 21,000 frames with four Extractors.

**Correction to an earlier reading of this section:** grade upgrades are *not* a lever available today. `capacity.store4[building.grade]` and `harvestUnits[building.grade]` read a grade that is fixed at construction or startup — nothing in `src/sim/` increments a building's `grade` during play, and `src/app/campaign.ts` has no upgrade affordance at all (`grep -n "upgrade" src/app/campaign.ts` returns nothing). Adding one would invent behaviour without source evidence, so the implementable route is **more grade-0 Extractors plus sustained harvesting time**, not upgrading. Four Extractors reach 1400 in ~21,000 frames; six reach it in ~14,000.

This explains the preserved runs: they grew GOOP 294 → 444 → 558 → 640 over ~20,000 ticks with four Recycling Plants and Botanist planting, because the Botanist path only feeds corpses/plants into recycling and never matches extractor throughput. It is not a missing mechanic — it is the wrong economy emphasis, and the prior chains simply built too few Extractors.

**Funds answer:** `player.funds` is mirrored from `raw 0x4a3` rather than computed in the converted economy, and `recycling-adapter.ts` re-reads it after consumption — so Recycling Plants are the income as well as the capacity (they convert corpses/plants into funds). That reconciles the preserved runs, which sat at 11 funds with capacity 1600 and four plants: they had already spent down, and the plants were the running income. Construction costs read from `rules.tables.constructionCosts`: Extractor 650, Recycling Plant 300, Stores 300, First Stage Distributor 400, Genepod 600.

**Consequence for the route:** a single grade-0 Extractor takes ~22,000 ticks for 1400 GOOP, and capacity must reach 1400 first (extractor 600 + two Recycling Plants at 400 each), so the opening move is plants for capacity and income, then Extractors paid for out of recycling, then harvesting time. This is a long mission by construction and will not fit a 420 s browser run in one pass.

## Mission 3 was blocked by the wrong content pack

Madami would not advance at all: the world sat in phase `blocked` with `frame` pinned at 0 and the notice `Campaign lacks established strategic state`, thrown at `strategic-state.ts:50` because `w.strategy` was null.

`w.strategy` is created in `world.ts:478` **only** when `pack.strategicAIRules.creatureControlPrior` exists. The `.private/imported` pack does not contain that 600-byte prior; `.private/imported-ai-host-priors` does (objectOffset 544124, virtualAddress 1592700, provenance recorded), and its hash `b8872317…` is the pack the sealed saves were built against.

Building with the priors pack fixes it outright. Measured on the rebuilt artifact: `hasStrategy: true`, phase stays `active`, frames advance 0 → 600, specialists land and report ready at frame 200. Every earlier symptom — disabled specialist rows, taps producing no notice, `placing` never arming — was the blocked world, not the UI.

Build with `npm run build:sfhs:priors` (or `--assets .private/imported-ai-host-priors`). The plain `--assets .private/imported` pack still builds, but its artifact cannot run mission 3 and must not be used for campaign acceptance beyond mission 2.

## Software campaign acceptance: 2/24 — Exceland and Krell

Exceland is accepted in the **software** ledger through the real UI, not a simulation harness. The browser campaign run on the artifact built from commit `2f3c6c1` passed at **desktop 1440×900, phone-landscape 915×412 and phone-portrait 412×915**, the two phone viewports using `hasTouch` and real `touchscreen.tap` input:

- Engineer selected, construction menu opened, Mine / First Stage Distributor / Photon Processor ×3 placed by pointer
- ordinary commands queued and completed (`completed[11] === 1`, build loop reaching `result`)
- save slot 1 → load slot 1 during the route, with `lockCount` and render purity preserved
- `result === "victory-notification"`, "View result" → "Continue to next mission" → "Deploy specialists" visible
- carried state: mission 2, progress 1, specialists deployed from the carried record
- `renderPurity()` true and zero render errors on every viewport

**Physical S21 Ultra validation remains separate and pending** — no physical device was operated, and that does not gate this ledger.

**Next:** mission 2 Krell through the same ordinary-play route.

## Exceland ordinary-play chain proven end to end (simulation layer)

A real mission-1 run using only ordinary queued player construction reaches the authentic source result, and the result tail through to Krell works.

**Route:** Mine (`11`) → Power (`3`) → Solar ×3 (`6`). The objective is `completed-photons`, `sourcePlayerOffset 1542`, target 3 — it counts **selector 6**, not the pulper (`2`), which was the earlier mistaken assumption. Queued through `queueCampaign`, built by the Engineer with no injected buildings or fixtures.

**Verified sequence (frame 4,951):**
- objective ledger `completed-photons` current 3 / target 3, `thresholdReached: true`
- `phase: "result"`, `result.phase: "victory-notification"`, zero error notices
- **save/reload at that state: identical checksum, result preserved**
- `continue-notification` → `victory-view-queued`
- `enter-victory` → `victory-view`, `progress 1`, terminal `won/player0/winner0`
- `advance-victory(runtimeInputFlags 1)` → `campaign-view-queued`
- `continueCampaign` → **mission number 2 (Krell), phase `briefing`, frame 0, progress `[1,0,0,0]`**

So the objective scan (`72ED0`), result stages, save/reload and campaign carry were already correctly wired: `world.ts:2695` evaluates each tick and `actOnCampaignResult` drives the tail. The mission was never blocked by a missing mechanic — the earlier chains simply built the wrong building.

**Evidence:** `.private/build-probe-20261024/probe2.ts` (objective recipe, per-stage ledger dumps) and `probe4.ts` (result flow and carry), with `run3.log`.

**Requirement met:** the same route is now played through the real UI at desktop and phone-landscape/portrait viewports, with save/reload during that play. Both Exceland and Krell are accepted in the software ledger (2/24); see the acceptance sections above for the artifact hash and per-viewport evidence.

**Next:** drive this route in the browser build and fix whatever the UI layer cannot yet express.

## Sealed continuation across the mortality boundary

The sealed pre-step save `.private/madami-power-botanist-continuation-20261023/segment-003/save-last-valid-prestep.json` (frame **20,933**, sha256 `0ba30528…aadae2`) was re-hashed before use and is **byte-unchanged**; the continuation ran from a child in `.private/mortality-continuation-20261024/`.

- **Continuation A:** frame 20,933 (hash `f3b28716…`) → **20,960**, phase active, **no error notices** — the guard that previously stopped the run at 20,933 no longer fires.
- **Continuation B:** save at frame 20,940, reload, continue → same frame and **identical hash `513c21bb…`**, so save/reload continuation is deterministic across the boundary.
- The dying record entered state 24 at frame 20,934 with its attachment bit cleared, and 13 records were in post-death states, all with `0x60` bit 2 clear.
- The pack the sealed world belongs to is content hash `b8872317…`; the current `.private/imported/genewars.gwpack` is a later rebuild (`ff9853…`) and cannot be used to load this save. The preserved `b8872317` pack is `.private/imported-ai-host-priors/genewars.gwpack`.

**Not proven:** canonical acceptance stays **0/24**. Nothing here is a mission result.

**Next executable task:** continue the child continuation past 20,960 until the next genuine unsupported family appears, then implement that family.

## Checkpoint — Mule mortality cleanup as a reusable creature-lifecycle family

**Canonical acceptance remains 0/24.**

The pre-death guard that refused the frame-20,933 record is replaced by a general family. `releaseMuleMortalityReferences` runs before the numeric death at every `5CDB0` entry and follows the source order already expressed by the runtime: `releaseAction` (`5CC60` through the callback-owned `5C920` attachment detach, preserving its own state-18 stun gate and timer, releasing the kind-1 target reservation through `5CCEF/5CD14` and the kind-2 plant flags), then the `5CCA0/5CDB0` null-reference convention for the remaining task envelope — the `0x4D`/`0x50` association kinds are cleared while their indices stay opaque, exactly as `installTarget` and `5CCA0` already leave them. All four `enterDeath` call sites (selector-4 combat, cold, hunger and starvation/old-age) now take the staged state and context, so cleanup participates in the existing transaction rather than bypassing it.

One shape is still refused, deliberately: an attachment bit that survives the tray release. `5CDB0`'s D71A mask preserves `0x60` bit 2, so a caller whose carrier service leaves it set must reject and roll back rather than enter mortality with a live attachment. The old blanket refusal is gone; this narrower one is source-backed.

The draft inherited from the interrupted run was audited rather than trusted: its ordering, addresses and transactional threading were checked against `releaseAction`, the state-27 retirement block and the preserved audit record, and were retained. Three tests were added for coverage the draft lacked.

**Verification:** focused mortality 11/11 (`tests/mule-mortality-cleanup.test.ts` 11, `tests/campaign-mule-mortality-cleanup.test.ts` 3 — normal old-age death, absent carrier binding, carrier leaving the attachment bit set, kind-1 reservation release exactly once, multiple deaths in one update, living referrer retained until `716F0` retirement, `4D`/`50` nulling, full 300-slot pool, near-full 299-slot pool with every other record byte-identical, two identical worlds producing identical cleanup, unrelated settled state preserved, save before and after with reload and replay across the boundary, older imported pack). Full TypeScript suite **1651 tests across 154 suites** (previous baseline 1637/152 — increased). Importer **116 OK, 3 skipped**. `tsc --noEmit` clean. Leak check pass: 506 public files scanned, 255 private hashes compared, no failures.

**Not yet proven:** the sealed frame-20,933 save has not been continued through this boundary. The campaign test uses the public synthetic pack only; the real continuation is the next task.

**Next executable task:** create an immutable child of the last valid sealed campaign save and continue it through the mortality boundary, then resume family-by-family work.

## Checkpoint — complete Extractor family and conditional audio proof (Hermes, DeepSeek V4.1 Flash 1017)

Interrupted-after-Codex work resumed and completed. **Canonical acceptance remains 0/24.**

**Extractor11 is now one complete reusable mechanic family.** Additive `extractorRules` profile (schema-versioned, `contactOffset`, per-grade `frameHolds`, provenance with executable hash and per-grade ANB geometry) admits the full native callback; grade-zero/older packs keep their separately bounded legacy profile and no new profile is synthesized. The callback owns, in source order, upkeep/energy drain, powered-state and warning transitions, ordered conditional work audio, cycle counting, grade resource harvest, terrain byte13 depletion through the standalone mineral pass with row-major dirty points, foreign-before-own contact chains with alliance masks and `virtual+68` exclusion, in-place contact damage, smoke6 publication with retained native priors, capacity refresh, exhaustion/empty handling with footprint-keyed cue pitch, and building-queue and terrain-dirty presentation requests. `nativeExtractorCallbacks` marks explicit native11 ownership so the legacy economy validator no longer double-admits the row, and a missing handler fails closed.

**Fixture correction, disclosed:** the new extractor fixture inherited the synthetic grade-zero `workDelay: 1`, which the admitted callback rejects because `base − grade` must stay positive for grade 2. It now uses `5`, the value `tools/import-original/economy_profile.py` actually emits, cited in the fixture. No assertion, expected hash or skip was changed.

**Conditional audio proof:** playback-device availability stays outside authoritative simulation state. Ordered `if-playing-stop-play` requests are presentation-only; the proof covers live, missing and already-ended consumers and asserts identical authoritative state, RNG, saves and the headless sealed replay in every case.

**Verification at this checkpoint:** Extractor-focused 34/34 (adapter 9 including grade0/1/2 priors, contact chains, alliance masks, smoke and ordered journal, late-mineral rollback with alias preservation, running/empty save continuation, absent-profile refusal; material 3; native 11; profile 11). Conditional audio 10/10. Full TypeScript suite **1637 tests across 152 suites, all passing** (previous baseline 1593/146 — increased, not decreased). Importer **116 tests OK, 3 skipped** (baseline 109). `tsc --noEmit` clean. Leak check pass: 504 public files scanned, 255 private hashes compared, no failures. Single heavyweight job at a time; no browser or campaign job ran concurrently.

**Unchanged and preserved:** the sealed frame-15,585 save, the frame-20,933 valid prefix and its separately preserved failed attempted world, all `.private` receipts. Nothing was reset, cleaned, stashed or pushed.

**Next executable task:** resolve the frame-20,933 Mule mortality cleanup guard as a reusable creature lifecycle/cleanup family, then resume the sealed campaign continuation to a new child artifact.


## Active continuous conversion

**Canonical acceptance remains 0/24.** Work continues in the existing repository from preserved baseline `34bc4b2`. Local importer commits `989591c` and `f28bf46` precede campaign checkpoint `720fe18`. No original assets or private builds are committed; nothing has been pushed or published. The preservation archive remains read-only evidence.

The complete native Distributor3/Photon6 callback now owns all three grades, source upkeep/generation, actual recipient marking and ordered immediate33 factories, retained native54/raw4AD, grade resources and7AC00. Native projections refresh before legacy mirrors, each owner resets generated power at its source prefix (including empty owners), and the later shared-effect pass still owns delivery. All409 complete source callbacks and32 constructor/upgrade transitions match1,189,429 interpreted instructions and110,410,876 numeric bytes with zero differences in their documented scope. Twenty-one dedicated tests pass; root host checks additionally cover source callback ownership/order, owner resets, ordinary upgraded3/6 dispatch, moving save continuation, actual packet delivery and sealed replay. The original83140 request is explicit; original renderer admission and device audio outcomes are not claimed. Extractor11's upgraded mineral/contact/audio family remains separate. Existing packs and saved worlds are unchanged. The combined full check passes1593 TypeScript tests/146 suites,109 Python tests (3 skips), strict typing and leak checks. Both corrected families are included in the latest verified HTML below.

The human Botanist work-command wrapper now preserves the complete81080 envelope: pending bit before conditional prior-task release, native130 setup stamp and state8 movement interruption/active-bit clearing. The previous wrapper could retain a stopped state8 actor with pending work indefinitely. All864 whole-caller source cases match865,736 interpreted instructions and1,750,464 numeric bytes with zero differences in their documented scope, including96 actual area-release scans, ordered service requests and RNG. Six dedicated regressions and65 focused tests pass, including ordinary planting, JSON continuation, complete command replay and late rollback. This prospective command fix does not repair already-saved pending afterimages; any corrected-runtime reissue is a distinct ordinary input with its own provenance.

A distinct frozenfa6afc9/b887 continuation verifies the original15585 save first and loads the new runtime with zero serialized changes or migrations. One explicitly recorded ordinary Botanist reissue uses the retained requested point/selector;22 later commands come from the unchanged Botanist policy. All2000 forward ticks and their complete2000-tick replay match frame17585/tick38498 checksum5fb3fd38, with nine save/native/alias checks and no guards, errors or service warnings. The Botanist actually moves, plants and refills;11 ordinary sample-availability warnings remain recorded. GOOP294→444, funds11/capacity1600/research102400 persist. No new Mule, research, production or construction commands occur. Exact final saveecf41e11e4d628051cf28cc19c9557ceb365fcd02dcee81110ea07bf968b29a7 and policy state remain sealed;1400 current GOOP and canonical acceptance are not claimed.

The current host binds ordinary selector2 Pulper construction and material processing, including the source two-cell site, real payment/appearance, retained pending51 and unsigned stock54 order. Shared36 building material has its actual mode6 motion and factory. Upgraded Pulper/Recycler callbacks dispatch the concrete ordered collection queries and actual32x97 collector factory. Its live ascending14EC0 pass runs after plants and before collapse/shared effects, with source motion, burning, plant/corpse carrying, cancellation, damage and unmarked10 retirement. Saved native identity, byte3558 count, current spatial reads, neighboring headers and recursive cleanup stay concrete; provably empty earlier saves migrate only after their original checksum passes. Ordinary host tests separately verify grade1 Pulper burning, grade2 plant delivery into stock and Recycler corpse delivery into GOOP, with moving/carrying saves and complete replay. Pulper damage uses source processing-front operation0 and retains pending material/stock without a refund. This work is included in the latest browser artifact below and does not change campaign acceptance.

Scheduled owned-plant reproduction now publishes each birth and actual80780 credit immediately before later callback RNG. Retirement unlinks, adjusts owner/map state, performs724C0 and clears the active slot before same-pass reuse. The plant pass binds the actual355A cursor and isolates all additional host roots lazily on lifecycle work. All96 complete static source passes match672,152 interpreted instructions,4,110,416 native bytes and22,020,096 map bytes in their documented scope; full/replacement effect capacity, source caps, owner-counter wrapping and six alternate scratch fills are covered. Eight host regressions include late rollback, ten ordinary ticks of JSON continuation and sealed command replay. No preserved failed world is repaired or reused as a valid campaign prefix.

The Mule correction returns the actual source work result into64CE7: successful work skips common movement, while failed work enters the existing retained-destination/wander/anchor-repair decision exactly once. The real work body already performed its wait, so the caller bypasses the legacy extra wait and RNG draw. Complete comparisons extend beyond the old work-proof endpoint through650F5 and the74A50 numeric repair loop:84 cases/403,876 interpreted instructions/17,952 numeric bytes, including54 false and30 true results, match with zero differences in their documented scope. Nine dedicated tests pass, including24 normal host ticks, JSON continuation, full replay and late core/whole-host rollback;90 related tests across11 suites also pass. The full stable check passes1564 TypeScript tests/142 suites,109 Python tests (3 skips), strict typing and leak checks. The latest HTML below includes this correction; the distinct frozen continuation preserves the exact11585 save on intake. No command overrides or repairs the preserved11585 save.

This processor/plant source checkpoint passes1,549 TypeScript tests across140 suites,109 Python tests with3 skips, strict typing and leak checks. Separate collector comparisons cover394 new cases/2,537,838 interpreted instructions with zero differences; prior specialist-motion/Mule-hauling source comparisons still match. Its full seven-suite browser verification and separate collector visual evidence remain sealed for2f44789; the latest artifact also includes the subsequent Botanist query fix.

The Botanist query fix binds actual intrusive-map membership independently of active kind2 pool membership. A carried plant remains active but is deliberately unlinked; it no longer becomes a cell-query candidate merely because its current pose shares the cell. Missing linked records, duplicate order, listed unlinked/wrong-cell records and mismatched poses still reject, with no blanket growth/flag filtering. All72 full56530/56090 source comparisons match932,534 interpreted instructions and538,704 numeric bytes, including ordered service requests and RNG in their documented scope. Six new tests cover the real67 carrier, ordinary planting, JSON continuation, complete replay and late rollback; the51-test focused family passes. The full stable check passes1555 TypeScript tests/141 suites,109 Python tests (3 skips), strict typing and leak checks. This fix is included in the latest verified HTML and does not rewrite the preserved9585 save or failed attempt.

The latest mechanic work completes shared44 building appearance through the existing6DF30 motion service, including changed ground, water contact, actual odd74270 queries, source timer/ANB retirement and same-callback spatial/reference cleanup. Private comparisons match256 numeric callbacks and12 literal shared-host callbacks with zero differences in their documented scope. A separate source-backed correction completes Geneticist packet81080: conditional prior-task release, retained130 stamp and interruption of active state8 movement. The previous wrapper could leave a moving Geneticist stopped with pending work undispatched. All576 complete static caller cases match; normal host movement-to-research, pending JSON save continuation, full replay and late rollback pass. Both changes are included in the latest verified HTML below; earlier evidence remains preserved.

A distinct frozen5d1332d/b887 diagnostic continues the exact old009 Madami save for2000 ordinary ticks and reproduces the entire2000-tick replay, ending frame8000/tick28913 checksum2954bb77. Nine saves match, with no guards or service warnings. Three additional Recycling Plants complete through ordinary commands and actual3×238 payment, leaving86 funds/capacity1600/currentGOOP0. Research stays81920; the selected corpses retire, no production or hauling commands occur, and the Geneticist retains the now-diagnosed old81080 stopped-movement afterimage. This valid outcome and its exact save are immutable. No capacity-only win, Mule birth or canonical mission acceptance is claimed. Corrected-runtime continuation requires ordinary new commands and separate provenance.

A separate frozenec9adc6/b887 diagnostic then issues one ordinary Geneticist research order to a living neutral Mule and preserves the same research-first resource constraints. Its704 successful forward ticks and entire704-tick valid-prefix replay match at frame8704/tick29617 checksum16318c0c; three save continuations pass. The next attempted callback stops on the explicit owned-plant reproduction service guard. The Geneticist has actually travelled toward the herd and remains in active research work; research81920, funds86, capacity1600 and currentGOOP0 remain unchanged. The valid save, failed attempted world and policy state are sealed separately.

The distinct frozen2f44789/b887 continuation starts from that exact valid8704 save, verifies its original checksum and adds only the proven empty collector root. Its881 successful forward ticks and entire881-tick replay match at frame9585/tick30498 checksum5a490b01; three periodic save continuations pass. Research reaches102400 at9257, the policy places one paid75 Genepod order at9280, Mule0 is born at9355 and one ordinary plant-hauling order follows at9376. Funds are11/currentGOOP0/capacity1600. The next attempted callback stops on the Botanist shared-cell completeness guard: carried plant11 remains active kind2 but has been deliberately unlinked by its actual carrier67. The failed world remains separate. This identifies a linked-query contract gap; no material delivery, sustainable biomass or mission win is claimed. The distinct23064db continuation verifies that exact valid9585 save and already-paid/born/hauling policy state with zero serialized-world changes or migrations. All2000 forward ticks and their complete2000-tick replay match at frame11585/tick32498 checksum96f8c756, with nine save checks and no guard, error or service warning. Real delivery raises currentGOOP0→18 by256 ticks→40 by512, then remains40; funds11/capacity1600/research102400 persist. The only new commands are ordinary Botanist refill10496 and planting10528; no research, production or Mule orders are repeated. Exact final saveb90de15a948a8827569fa3a4931a196eaae65d43e0970cda051bc902f962331e and policy state remain sealed. A separate source audit identifies an omitted failed-material-work return join into normal movement choices; the older proof stopped before that join. Its correction passes the full local suite and is included in the separately verified artifact below. No replacement order or saved-state repair masks that gap.

A distinct frozenb4b26bb/b887 continuation verifies the original11585 envelope/world checksums before loading with zero serialized changes or migrations. Two bounded segments each pass2000 forward ticks and their entire2000-tick replay, with nine save checks per segment and no guards, errors or new commands. The first ends frame13585/tick34498 checksum8febc890/currentGOOP174; the second ends frame15585/tick36498 checksum508a087d/currentGOOP294. Funds11/capacity1600/research102400 persist. The Mule continues actual travel/carrying without a replacement order. The Botanist's entire200-byte record and normalized actor remain unchanged across the second segment's checkpoints, preserving the diagnosed old human81080 afterimage. Exact save9614eeca4dbb563338c7234cb05dd51f128106374153dac52e8d6d679ce78eff and unchanged policy are sealed separately. No saved-state repair,1400-GOOP goal or canonical acceptance is claimed.

Importer 0.2.0/schema 2 admits the exact QA BETA V5 candidate: all 24 serialized startups, original RNG, four players/eight source pools, numeric rules, correct terrain/water, 91 visual resources and 669 WAVE records. All 26 packed4 resources decode. Owned/neutral Mule palettes, actual MAIN/FADE rows and raw gameplay frame metadata are implemented. Private numeric profiles include all25 species trait rows, Mule combat/cold parameters, crater textures, specialist reveal radii, Geneticist projectile/capture descriptors, all71 shared effect descriptors,16 specialist speech resource rows/100 audio allocation classes,13 building resource rows/upkeep/front offsets and bounded strategic group/gene/production metadata. The separately admitted building combat reach table is distinct from collision extents. Preserved importer-folder pack SHA-256: `ff985386a14d4ec592c4860eb582162acd286b599b2ca5a8a36f8cd30a0d28f6` (31,803,886 compressed bytes), including seven Shepherd projectile rows and settlement value/threat tables. The preserved24d9eaf7 pack remains the frozen campaign run input. The verifiedb8872317 host pack(31,804,349 compressed bytes) adds hash-admitted Engineer priorities, creature command displacement/ordered footprint samples and the cold600-byte control image; all24 AI payloads and actual Exceland storage validate. Earlier73b552a3 remains preserved. The later strategic-host graphs retainb8872317; the latest HTML uses the additiveced8fd7f pack described below; the older packs and receipts remain preserved. All32 hurt/death SPE samples resolve to existing imported records. Retail equivalence, fonts, CD music, remaining narration/subtitles and other dynamic palette wrappers remain unresolved. Earlier18147b77 packs and their replay evidence are preserved privately.

The normal campaign host implements blueprint selection, full 20×200 specialist native records/bindings, landing, construction travel/payment/terraforming/cancellation/completion/appearance, live power/GOOP, plants, owned/neutral Mule orders, feeding/aging/death/reveal, mating/birth and Genepod production. Creature corpse/BONES feeding and bounded selector4 combat are implemented; immediate blood factories use isolated full-host transactions with retained native identities. Original startup zone lighting/marker visitors, pre-actor zone scoring, countdown, 16-slot visitor pass and 200-slot effect scheduling are integrated. Real native crater jobs retain their original 25×176 priors and ordered linked-height updates. Some complete services remain unimplemented below; imported pools and generic predicates do not establish complete gameplay.

After correcting landing placement to actual candidate XY, the earlier Engineer bridge route reaches Exceland victory at frame4002 and carries into Krell frame250 (`6636364c`). The new native Engineer route reaches the same original predicate at frame2750, saves/reloads construction and each result stage, and actually carries into Krell: progress1, selected blueprints0/5/10, funds2000, four neutral Mules,25 plants and one marked zone. Its complete replay matches10 checks/11 events through Krell frame250 (`68022bc1`) without ecology errors. The native route also passes with the preservedfe420891 pack: all10 checks/11 events match`dce56bdf`, with its exact production graph frozen privately. The earlier runs use preserved18147b77. From the earlier carry, an ordinary Geneticist order fires at frame478, captures a Mule for219 frames and raises research quality71680→85078; its1200-tick replay matches at frame1450 (`ef8d1756`). These are development checks, not mission acceptance.

A legal segmented Krell run from that earlier carry completes Extractor/Distributor/Photon/Genepod, preserves failed production attempts, produces two owned Mules and uses ordinary movement/healing/feeding. Real Ethereal observation earns the zone credit. The original predicate wins at frame13697/score1002 while22 quota remains; a pre-eligibility save reproduces the win on its next ordinary tick. Every frozen segment replays its own complete input/events/checksum; the final result sequence matches`a8cc9518` and carries progress2. The chain does not claim one latest runtime replays every earlier segment. Actual mission3 continuation on a clone of the preserved valid result stops at opponent initialization. Opponent entry and serialized buildings are bound. The current host now composes the concrete strategic37870 planning/action services and runs them in source order; downstream missing mechanic branches still reject explicitly. A fresh frozen df63585 chain wins Exceland atframe2742 and carries normally into Krell. Its first complete legal strategy attempt remainsactive atframe16222/score564 after its owned herd and nearby neutral contributors die in ordinarycombat. Every segment replays exactly with no actor/service errors; resources and failures are preserved. The fresh safer-herd strategy on the same immutable production/24d9eaf7 graph wins Krell atframe17921/tick20667, score1024/quota0, with two owned Mules alive athealth60/59. All six segments replay exactly, including515 ordinary commands, with no actor/service errors. The independent pre-eligibility step reproduces the win; normal result actions carry progress2 into mission3 checksum2ebad21c. Its actual five buildings and opponent1progress1 are retained. The entered pre-step save remains valid; an isolated active probe hits the explicit37870 guard before gameplay. The42,019 converted verification ticks are bounded per invocation and preserved separately from the failed first attempt. Canonical acceptance remains0/24.

Source45010/44FF0 now initializes actual existing native67 building records with logical imported resource bindings. All24 mission pools validate without changing bytes outside the established initializer writes; Madami retains its five3/0/4/6/6 buildings, health, grades, energy, links and ANB. Rendering uses the actual native action/frame. The normal campaign binds the Recycling Plant callback, actual80780 credit/effects and immediate plant/corpse cleanup. Recycling preserves source owner5FA even when it differs from active owned plants. The global plant count still tracks its pool. Producer/consumer callbacks and real packet factories run in owner/slot order, followed by each owner's exact437A0 storage scan. Unvisited/collapsed native54 values retain their source afterimages. Late query, resource or factory failure rolls back the complete economy transaction. A failed next-mission startup also preserves the valid old result map.

The strategic numeric services now include creature allocation/directives, all group kinds/target maintenance, attack recruitment/launch, Genepod output/production balance and complete resumable settlement census. Private comparisons separately cover52 creature cases,99 group/attack cases,21 species-selection cases,24 building-plan cases and27 combined planner/census cases. Their reports identify real command/predicate ports and excluded bodies; numeric service comparisons do not establish AI gameplay. The original36-case37870 orchestration proof still uses explicit trace ports for then-missing bodies. Source360B0's uninitialized emergency-result scratch has an explicit deterministic initialize-false fix; its boundary-cell census revisit is retained. The33F60 specialist controller and numeric route/cache helpers pass48 source cases, with unwritten packet bytes represented explicitly as unknown. The37C50 Engineer construction planner passes40 source cases, with exact43960/439E0 sub-owner progress, repair, upgrade, budget and settlement decisions. Concrete density/resource/plant-style/retreat spatial queries pass40 closed cases, including original traversal RNG and footprint/terrain gates. The creature command family81C60/5DF50/5CC60/5D870/5B580 passes46 cases, preserving cleanup after a false result and explicit unknown scratch provenance. Concrete creature command host bindings additionally pass31 source-query cases and15 integrated tests. Saved strategic storage now holds all four AI records, full600-byte creature control, provenance and nullable command caches. Eight tests cover native identity, debits, save/reload/replay and low-bit-preserving carry; the original loader reset is established on both paths. Complete3A1E0/32230 site and expansion planning additionally passes39 closed cases and14 public tests, including actual mineral/plant/land/power/owner predicates and eleven-attempt cooldown. Concrete roster/landing, specialist role commands, Genepod814A0 input, spatial/site queries, Engineer planning and creature commands are now bound to saved campaign state in one atomic strategic pass. No no-op provider is installed. Source order is current-frame AI, queued game commands, zones, specialists, then buildings; the frame increments after simulation. Complete planted50/trigger51/cancel10 charge effects are bound. Pending inactive Engineer cancellation does not read task operands, including the valid planner sentinel131=14. Actual landing activation consumes the current associated carrier, queues movement and updates blueprint counters exactly once; the real parity/height building query is bound, with its proven immovable no-op response.

A private Madami diagnostic reconstructs only the proven missing control image from the exact prior converted runtime8ffc594e and its verified progress2 carry; it is explicitly cross-runtime development evidence, not a fresh canonical chain. The first20-frame failure identified the now-fixed pending Engineer selector read. The corrected250-tick segment has no service errors, activates actual AI specialists, survives save continuation and replays exactly (7360a62e). The following1000 ordinary ticks reach frame1250 with the actual AI Engineer contributing to a newly placed Extractor, six live buildings and no actor/service errors. Airborne and active-work saves continue exactly; the full1000-tick replay matches77ba3917. Both private reports remain diagnostic rather than a frozen fresh campaign chain. No resources, quota, actor states or command results are injected. Canonical acceptance remains0/24.

Selector4 Recycling Plant construction now runs the existing native Engineer path, including source FF00 alignment for its2-cell footprint, real reservation/terraforming/payment/appearance/completion and normal processing. Seven new host tests and93,955 interpreted source instructions cover the role, constructor and full-map site families. Selector4 building damage/destruction now uses the released source processing-front cleanup; fifteen additional static comparisons/19,551 instructions and twelve host tests preserve GOOP, pre-unlink capacity, JSON mirrors, recursive effects and full rollback/replay. Common451F0 timed demolition now precedes upkeep/selector work, retains the actual common ANB tail and retires through flags-only terrain cleanup. Real salvage45 allocation, full common motion/obstacle/water callbacks, first-candidate pickup and raw funds credit are bound to the shared scheduler. Twenty-one new tests and173 closed comparisons/103,212 interpreted instructions pass; declared numeric ports and unsupported selectors/owner tags remain explicit. See the mechanic documents for source scope and boundaries.

The frozen Madami diagnostic continues from verified1250 through3250 to5250 on the preserved e886c5e graph. Both2000-tick segments replay completely and all periodic save/reloads match, without actor errors or missing-service warnings. Actual AI completes an Extractor, Distributor and Photon Processor and starts a Genepod. This is cross-runtime development evidence, with no canonical acceptance claim.

A fresh e886c5e Krell run reached verified frame9204 after three replayed4000-tick segments. Investigation found that a successful human Mule order can be overwritten by stale canonical creature bytes during the following zone pass. The failed food-order strategy and its exact saves remain preserved. Direct and queued moves now publish every cloned Mule row, including peer cleanup, into retained canonical records before the next host reader. Six regressions cover zone updates, mixed specialist command order, queued continuation, rejection, save/load and recorded replay. No hunger, command mechanic or mission predicate is retuned.

The frozen Madami diagnostic next reaches a verified frame5346 boundary, then stops on a dead Mule one unit above terrain. The valid96-tick segment replays exactly; the failed frame remains separate. The complete negative-desired corpse common-physics family for states24..27 now admits actual first impact, airborne speed limiting, friction and dead-target damage no-ops. A missing odd-phase shared-tail byte74 mask is corrected. 128 complete source callbacks/166,480 interpreted instructions match numeric bytes, animation, child requests and RNG. Twelve public regressions include normal host save continuation and replay. A separate one-tick diagnostic resumes the unmodified valid5346 save to5347/8507b1e5 and replays exactly; this is explicit new-runtime diagnostic evidence, not a rewrite of the frozen failure or canonical acceptance. Attached/flight branches remain guarded.

Native Shepherd control, movement, interaction, cancellation and the shared motion/animation envelope are bound. The normal sidebar exposes herd control modes and actual creature/specialist/building targets. Owned Mule behavior reads the real player actor-list control projection. Target58 stun and68 corpse/health predicates remain distinct. General leading aim precedes allocation; real37..40 shots use inline blast0..3 and41..43 use the existing capture family. Projectile debit uses806E0 and the source target-kind presentation gate. Public synthetic campaign control/save/reload/replay checks pass. Actual37/38 projectile-to-blast-to-Mule/blood host paths, save continuation and complete late-failure rollback pass. Private/synthetic offline smoke and the full normal construction/result/Krell/Geneticist/Botanist/save/replay/restart UI route pass all three viewports. A separately constructed development-only later-progress Shepherd save also passes actual UI import, all control modes, save/load, stop and stun targeting in all three viewports, with screenshot review. That entry is explicitly injected and does not establish canonical initialization, carry or later campaign acceptance.

Campaign save/replay schema2 stores every implemented authoritative root, including native pools, actual terrain-job bytes, RNG, pending work, results and carry. IndexedDB has three manual/four transactional recovery slots, with export/import and restart recipes. Replays include commit/dirty state, content, initial RNG, entry/command/result/transition events and final world/result/carry checks. JSON alias-dependent Engineer motion and eaten-plant retirement/reused-slot bugs are fixed. The source ordered crater native height can differ from a later terrain sample within the same callback; the host preserves its actual afterimage rather than inventing an extra resample.

Explicit human recruitment now binds packets7/8/9/10, the signed-skill four-candidate picker, actual native constructor, pending removal and shared80830 landing. The initial manual panel opens once after72AD0 at its source progress/special gate; input-only iterations preserve native frame/RNG/countdown while runflag4 holds AI and ordinary callbacks. Saved launch-producer state preserves AI gate→UI flag write→packet ordering, including mode1 and later allocation failure. Special human frame0 entry activates immediately before zones/64, without allocating49. The normal UI exposes initial selection and actual selector5 center routing, including mutual allies, with source landing admission. There is no generic active unassociated resupply control. Nine host regressions cover complete queued/initial replay, pending-input saves, cancellation, special entry, source ordering and late rollback. The existing automatic early-campaign picker is preserved.

The complete selector64 marker/generic51 feedback and parameter1/associated49 family is bound, including real shared smoke/departure allocation, source-returned inactive identities, player references and exact activation→nine-cell75240 order. Private comparisons match364 human caller/access cases,228 effect cases,144 whole49 callbacks and64 full-map site cases with their documented ports/exclusions; no original executable runs. Water contact in the established vertical49 model remains explicit. The new privateced8fd7f pack(31,804,814 bytes) adds only the hash-admitted associated offset and landing-site profile; every earlier decoded field remains deeply equal tob8872317. The latest verified HTML below uses this pack; earlier packs and immutable campaign graphs remain preserved. See the human roster and recruitment-effect mechanic documents for exact scope.

Selector5 Recruitment Center now has its actual owner/slot callback, one upkeep/ANB pass, real7F480 automatic associated landing, native constructor and complete two-site Engineer construction. The full74E80 discriminator5 checks the additional3x3 pad;507D0 retains its source100 main-only admission. Source75240 pad preparation, both terrain jobs, cancellation, payment,44 appearance and completion run through existing services. Ordinary host tests retain a live second-job save and replay the full build, then separately exercise actual associated human selection/landing and automatic7F480 without an80830 actor-reset prefix. Private core comparisons match432 cases/258,541 interpreted instructions. The destruction family matches15 whole damage/44380/724C0 cases and16 full-map2/3 footprint cases. Its unusual original-point3x3 SET after the main clear is preserved, including the literal-1 row-pointer sentinel and active/inactive landing references. Neighboring-pool terrain writes remain an explicit atomic guard. The new source family is verified by the full suite and included in the latest browser artifact below.

Human Mule input now binds the actual27AE0/6A760 classifier, packet17/81D30 target dispatch and packet19/82230 Stop. Producer-time numeric modes survive queued input, JSON saves and replay. The normal sidebar offers source-eligible visible plant/corpse material targets and real Stop. Owned Mule4 work includes autonomous and commanded material queries, plant cutting, shared67 pickup, retained carried pose, source delivery/drop, corpse aging suspension and damage/capture release with retained task recovery. Shared67/68 callbacks use the existing motion/factory/retirement services; immediate spatial publication updates neighboring native plant and creature headers before the next callback. Synthetic full-host tests run plant and corpse collection through actual Recycling Plant consumption/GOOP, carrying saves, complete replay and damage release. Static comparisons match587 human input cases,193 material cases,204 carrier cases and12 literal shared-world cases/16 callbacks with zero differences in their documented scope. Builder/Pulper pending2/state13, live-creature/specialist pickup, true-flight attachments and non-Mule species remain explicit boundaries. This family is fully checked locally and included in the latest browser-verified artifact below.

Recent completed checks: **1564 TypeScript tests across142 suites,109 Python cases (three private-only skips), strict TypeScript and leak/license checks pass.** The complete human, Recruitment Center, Mule material, processor collector and immediate plant lifecycle families pass, including preserved role-command, economy, strategic-state and verification suites. Existing checks cover actual Geneticist pending movement/replay, child20 capture/shared scheduling, injury/death/ANB9 corpse69, persistent blueprint deletion, Botanist lifecycle/economy, hostile specialist/building encounters and Ethereal abduction. The ordinary synthetic host also verifies lifting across next-frame synchronization/save/load, retirement without death counters and projectile aim from the current visitor pose. A retained visitor afterimage shares the canonical record during destructive calls, so recursive reference cleanup survives callback publication. Source feeding-target validation runs every odd callback, while only damage uses the16-tick cadence; dangling inactive links still reject. Botanist empty-area/full-storage/missing-sample feedback produces explicit reasons and alerts. Bounded source comparisons cover destruction, plant ignition, collapse, specialist motion/lifecycle/abduction, Geneticist projectiles, attack25, Botanist work, Engineer534D0/commands and opponent entry. Those proofs do not transfer the old Rust campaign acceptance.

The expanded normal campaign UI passed mouse1440×900, landscape touch915×412 and portrait touch412×915 through actual construction, result, carried Krell entry, Geneticist and Botanist controls, generated replay import and restart on artifact`1d406d68…`; desktop and portrait screenshot review passes. Each export payload was validated, but managed Chrome also cancels a minimal asset-free Blob download. Downloads remain explicitly unverified; the test records cancellation and captures the actual UI-generated JSON. No HTTP requests or renderer errors occurred. The ordered-building economy artifact passes the complete route, private/synthetic offline smoke and desktop/portrait screenshot review.

Latest verified private HTML: **43,858,200 bytes**, SHA-256 `a3e2799f1e82247559355b657fbb12aaf7d399dcf3b2d6771d963da213ab0a1d`, built from clean checkpoint `fa6afc9f18cd8a64897eec6614d91292eaaa303f` with the ced8fd7f pack. Five private suites pass at1440×900,915×412 and412×915: offline smoke, normal construction/save-load/result/carryKrell/Geneticist/Botanist/generated-replay-import/restart, manual initial recruitment, associated Recruitment Center recruitment/save-load/landing, and human Mule material collection/save-load/retirement/GOOP/Stop. The processor collector route also passes all three viewports, including movement, carrier67 save/load and delivery; the separate synthetic smoke passes all three. Seven suites/twenty-one main viewport runs and six additional collector zoom/save-load cases pass, with33 fresh captures reviewed by root. No page, console, renderer or network errors occurred in the selected successful runs. An initial construction/result wait timed out without preserving its full failed world. That failure remains pinned; a separate diagnostic reached the original victory predicate, and a fresh full run passed all three viewports with stronger per-building count assertions and failure-state capture. No source, timeout or simulation guard was changed to obtain the successful run; the initial cause is not claimed resolved.

The manual route uses its disclosed progress4 mission1 fixture; selection freezes native frame/RNG, saves both choices and lands both. The center route retains its prebuilt/powered progress3 fixture and naturally level site. The material route uses an explicitly arranged fresh mission3 entry with unchanged fresh-carry progress0, the five actual serialized source buildings and ordinary ongoing power. Real factories create the hauler and a neutral Mule; actual fatal damage and ordinary settling create its corpse. No later power/resource/ANB writes occur. Collection carries at500, drops532, retires/unlinks533 and credits98GOOP599; carrying save/load and Stop600 pass. Actual AI slot reuse560 is recorded separately from retirement. Exact earlier fixture saves verify their original checksums before the proven empty collector root is added; every other original field and RNG is retained. Bounded UI observations are checked on this artifact; no earlier whole-world checksum is relabeled as a new-runtime result.

The separate collector fixture retains its disclosed one-time native construction grant and grade2/max-health Pulper, with two actual grade0 Photons and a Distributor. Real33 power packets support movement769, carrier67 pickup872 and stock0→6 delivery1022. Its exact prior entry save passes the original checksum before a zero-change new-runtime load; no migration or reconstruction occurs. The complete current preflight replay matches276a3059, and all six browser world checksums match the current frozen graph. Actual raw4AD callback changes make these world hashes distinct from the priorb730966d run; all18 fresh image hashes happen to remain equal. Camera-only zoom/pan and UI save/load leave gameplay unchanged. Small original collector art blends with terrain/plants; capture review does not independently establish exact animation fidelity. Earlier setup/assertion failures remain preserved and excluded from successful route totals.

The fresh material route additionally records normal post-delivery movement before Stop: the hauler moves from its retirement point while the actual98 GOOP credit still occurs at599, and the ordinary Stop clears its task at600. Exact current observations are sealed separately; no prior whole-world checksum is claimed on the corrected runtime.

These are development UI checks. Existing workbench portrait clipping remains; supplemental material-control captures confirm reachable controls. Chrome cancels Blob downloads, so generated replay payloads are verified and imported while physical file delivery remains unverified. Artifact, builds, scripts, reports, screenshots, entry saves and hashes remain private. The final receipt is `.private/checkpoint-a3e2799f/verification-receipt.json`, SHA-256 `22ddfe7c847a5fad10e7248218a635f170e771a9ab03b3dc4128308826666c14`. The previousee536c85 artifact remains sealed at seven suites/twenty-one viewports/33 root-reviewed images, receipta57285d7dd73acd9832521ecafc2595d5df90f6be5745688f62082b6c1af6277. The earlierf6910bdd artifact remains sealed at seven suites/twenty-one viewports/33 root-reviewed images, receipt11dd6ae3dbf890f8f9832409c627741493310a69029c4efce152bae91de7d0d7. The earlierae7fb974 artifact is also fully sealed at seven suites/twenty-one viewports/33 root-reviewed images, receipt2753ea0798be482e103ae0c06b4608588b1b2aaa94152b20705bad346e40dc4c. Earlier78bf194c,8e56b2c5,034957f3,56cc0bee,d46c5a90,423bc6ba and1d406d68 artifacts and sealed receipts remain unchanged. Normal browser campaign coverage reaches Krell; the arranged material route additionally exercises Madami. Physical-phone testing and canonical acceptance remain outstanding.

The fresh frozene886c5e campaign starts from a new campaign with ordinary commands and no legacy migration. Its first4000-tick segment completes Exceland through the original predicate and carries normally into Krell. All8000 forward-plus-replay verification ticks match, with zero actor errors or missing-service warnings; segment1 ends atKrell frame1204/tick4000 checksumb1b8c819. Subsequent segments continue only verified saves on that unchanged frozen runtime/pack. This remains development verification, with canonical acceptance0/24.

The clean6fc1eba frozen production graph has SHA-256`5338436a6929ffde78d30db38435e64e89762f653c3ec3cbca19ef81776cbc66`, using unchangedb8872317. Its fresh ordinary campaign follows the exact preserved safe-herd policy through Exceland and Krell victory, then carries normally to mission3 briefing31b3fd2a/progress2. All six complete segment replays and111 driver save checks match:20,913 forward plus20,913 replay ticks. A separate145-tick boundary reconstruction saves/reloads pre-eligibilityc857956f atscore984/quota40, reproduces victory on the next ordinary tick5caf4975 atscore1024/quota0, and matches every result/carry checksum. Total41,971 converted verification ticks,529 ordinary commands/539 events, no actor or service errors, no policy changes or state injections. The old e886c5e strategy, including its lost food orders, is preserved separately.

Fresh mission3 enters normally on that same immutable6fc1eba graph, then three2,000-tick segments reach frame6000/tick26913 checksum191885cf with zero human commands. All6,000 complete replay ticks and28 save checks match. The opponent activates its actual Engineer/Botanist and completes an Extractor, Distributor, Photon and Genepod. Its Extractor is destroyed at5975 in ordinary combat; the warning is retained. AI funds/GOOP are exhausted, so no completed birth is claimed. Human funds800/GOOP0, all five original buildings and three landed roles remain. No actor or service guards occur in these segments. Further idle expansion is stopped at this verified boundary while owned Mule material hauling is implemented. The original mission3 predicate requires1400 current GOOP; storage capacity alone does not win. A source-backed ordinary-command plan needs additional Recycling Plants, real Mule production and sustainable biomass. Existing graphs, saves and policies remain immutable; this is bounded host verification, with canonical acceptance0/24.

An explicit cross-runtime regression starts from the unchanged valid old Krell frame9204 save and issues three ordinary food moves plus a Geneticist move. All eight forward frames retain the commands across zone updates; JSON save/load and the full eight-frame replay match4b2e2030, without errors or warnings. A separate no-human-command Madami continuation starts from the valid old5346/fcb2e3e8 boundary and reaches7346/3234a213 on the clean6fc1eba graph. All2000 forward and2000 complete replay ticks and nine save checks match. The AI completes its Genepod, loses its Extractor in actual combat and selects Mule production; no completed AI birth is claimed because funds/GOOP are exhausted. The ordinary building-destruction warning is preserved, with no actor or service failures. These are development diagnostics, not fresh canonical mission acceptance or repairs of failed afterimages.

**Remaining acceptance work is implementation, not a permission blocker.** The successful segmented Krell run replaces the earlier incomplete zone strategy as development evidence. Failure/alternative strategies, fresh whole-route checks on the native Engineer runtime and all canonical gates remain unfinished. No quota, carry or observation state is injected. Specialist damage/retirement/corpse69, recursive building destruction, plant damage/fire, collapse, Geneticist capture/research/healing, Botanist work and visitor destructive punishment are bound. Abduction uses the actual referenced visitor, feedback26 and shared motion; lifted native pose is mirrored before the next frame. Shepherd alternative/later-mission acceptance, remaining construction selectors, broader creatures/hybrids, other combat, broader strategic campaign acceptance, later campaign/ending and remaining audiovisual families are incomplete.

Converted-runtime profiling identified repeated transaction copies as the dominant local cost. Typed spatial, economy, effect-pool, specialist-pool and campaign-root copies preserve mutable isolation and actor/builder aliases; ordinary Mule relocation now stages mutable host roots instead of the entire immutable mission input. The public default transaction remains available. Isolation, alias, late-failure and save/replay tests pass. Frozen runtimes on identical valid inputs produce deeply equal complete states through Exceland400 and Krell450, including own undefined fields. Local Node timings improve from20.82 to8.87ms per tick for Exceland and30.59 to12.36ms for Krell. These concurrent-load diagnostics are not browser or physical-phone measurements.

Construction and craters share the original25×176 job pool, first-free capacity and one ascending79220 pass. Native Engineer task0 stages0..5 now own actual travel, terrain work, reservation/release, payment, placement, contribution and source departure inside one common6FB60/7AC00 envelope. Current native task/job bytes are authoritative; legacy normalized builder tasks no longer drive category0. Existing-building repair, sabotage and grade0..2 upgrade work are bound; selector12 double effects, remaining construction selectors and conditional441C0 active-UI audio remain separate unfinished families. A missing empty collapse pool can migrate only from proven inactive retained priors. Nested staged services preserve rollback and held identities. Shared factories/retirements update saved3554 immediately. Hurt/death speech uses imported SPE samples and source policy/allocation in the browser; device outcomes never enter gameplay.41780 caps, original service polling latency, subtitle mapping and total order across numeric/speech journals remain unresolved. Physical Galaxy S21 Ultra testing/performance is unattempted; emulated viewports are not a device pass. Continue through Krell and all remaining missions. This checkpoint is not a closeout.

## Archived starting baseline (superseded by the active status above)

**Assignment incomplete. Canonical campaign acceptance: 0/24.** This is a separate implementation repository, preserving the source/research archive. No original assets or private HTML are staged or published. No old Hermes worker or frame-frontier process was restarted.

## Implemented

- Pinned Battle Drones audit and attributed Apache platform adaptations.
- Independent original-file readers: ISO2048/MODE1 disc, flat ZIP/loose installation, RNC1, RGB6 palette, indexed8 ANB sprites/metadata, mission maps, RIFF/SPE WAVE inspection.
- Exact source-variant/hash admission and reproducible private pack. Initial import: 24 mission pairs, 65 visual resources, 474 audio records, 30 unresolved records. Original executable is identity-only.
- Original map atlas and original-art/animation/audio browser, unlit orthographic Three.js terrain and original sprite components.
- Fixed deterministic world/command boundary, source-backed Exceland costs/availability/count predicate, provisional construction workbench, reason-bearing states and alerts.
- Pause/speeds, selection/queues, mouse/touch routing, pan/zoom/minimap, groups/bookmarks, responsive DOM panels.
- Current-world saves/recovery/manual slots/export/import and replay validation.
- Private single HTML packaging, explicit synthetic build, build provenance/size/SHA receipts, leak checks and synthetic CI definition.

## Fresh checks

Strict TypeScript, 18 TS tests and nine Python tests comprise the final check suite (results in `.private/verification.json`). Local leak/license scan passed. Synthetic and private offline Chromium checks passed at 1440×900, 915×412 and 412×915. Browser screenshot review caught/fixed an obscuring minimap bug. Browser construction tests exercise mouse and touch through the workbench to its predicate and open Krell for inspection. Private conformance passed 123 RNC hashes, 60 indexed8 resources / 2,983 sprite records, 24 mission pairs and 393,216 map cells; one compound RNC resource is explicitly skipped. The local evidence reports, exact latest artifact hashes and final rerun results are in ignored `.private/` and `dist/*.receipt.json`; no final campaign or real-phone pass is asserted here.

## Important implementation limits

Construction takes a provisional 30 ticks, specialist setup/skill and movement are development policies, and site travel/terraforming is absent. Original power, GOOP production/storage/distribution, plants, ecology, creatures/hybrids, research, combat, AI, Ethereal scoring/outcome, carry and actual mission transitions are absent. No further missions are playable. These are missing implementation, not user-permission or input blockers.

Packed4 creatures/BONES, fonts, CD music, residual sound bank records, runtime palette effects and correct per-mission terrain atlas selection remain unresolved. Sprite frame preview does not claim runtime animation fidelity. No complete source-pool runtime initialization exists. The reserved seed does not claim original RNG provenance.

Physical Galaxy S21 Ultra testing is outstanding. No phone performance measurements exist. No remote CI run, GitHub repository creation/push or public release has occurred. The build artifact is for local use only.

## Mission 3 (Madami) route, measured on the carried save

Mission 3 cannot be won by building alone; three separate limits were measured on the
carried campaign save rather than inferred:

- **The carried base has no player-owned mule.** Filtering ecology mules by owner shows
  zero owned mules at frame 600; every mule on the map (9, rising to 12) belongs to the
  neutral owner. All 42 plants are neutral too, so edible food exists but nothing eats it.
  The workforce has to be created.
- **"Produce Mule · 75 total" works from the default view.** Clicking it queues the order
  ("Mule production order queued") and 800 ticks later the player owns one mule with funds
  800 -> 725. This is the entry point for every later economy step.
- **Extractors need power, not just resource.** Extractor 1064 at cell (79,65) sits on a
  cell whose 7x7 resource neighbourhood peaks at 99, is neither disabled nor depleted, and
  cycles 199/240; it never harvests because `energy` is 0. Its nearest distributor is 5.8
  cells away with spare energy, while an extractor that did read `energy: 163` was 5.1
  cells from its distributor. Treat the power radius as about five cells.
- **Capacity is a separate ceiling.** The economy player reads `capacity: 400` because one
  grade-0 Recycling Plant is standing. Harvest clamps `goop` to `capacity`, so plants must
  reach 1,400 before the objective can count. Plants cost 238 each and add 400 capacity.

Two measurement traps worth keeping: the campaign world has no `width`/`height` (the
resource array must be indexed with `w.economy.width`/`height`, or every read is `res[NaN]`
and looks empty), and `players[0].capacity` is undefined on the world player - capacity and
goop live on `w.economy.players[0]`.

The frame-6612 block is not a time bomb. A run that only advances passes 6612 and reaches
frame 7,300 active, while runs that build a plant block there, so the trip is an interaction
effect around construction, not elapsed time.

## Why long Madami runs block: damage to an incomplete building

Every stalled Madami run traced back to one guard. `building-native.ts:184-192`
(`stepIncompleteNativeBuilding`) throws `unsupported-incomplete-building-state` whenever an
under-construction building fails any of: `byte(n,6) !== 4`, `byte(n,24) >= 4`, a selector
outside `[0,1,2,3,4,5,6,11]`, or `(word(n,49) & 0x841) !== 0`.

Measured on the pristine Madami start: building 1067 (slot 67, **selector 0 Genepod, owner 1**
- the opponent's, not the player's) carried flags `0x0` while incomplete, then `0x140` at the
frame the world blocked. `0x140` is `0x100 | 0x40`, and the adapters define those as
`depleted` and `disabled` respectively (`building-damage-adapter.ts:86-90`). The notices in
the same run read "Ethereals are arriving" and "Ethereal observation timer started".

So the sequence is: an Ethereal damages the opponent's in-progress building, the damage pass
sets disabled/depleted, and the incomplete-building stepper rejects the disabled state and
freezes the whole campaign. The selector was never the issue, and the building is not the
player's, so it cannot be avoided by playing differently: the opponent builds and is attacked
continuously, which is why advance-only runs pass a few thousand ticks and then block at
whatever frame the first damaged-under-construction event lands (3,232 and 6,612 observed).

That guard was a port defect, not a missing original behaviour. BUILDING_STARTUP.md states
that disabled and incomplete cases bypass the complete-and-enabled upkeep branch and share
inactive energy decay, so a damaged under-construction building keeps stepping its
construction timer - the original never aborts the step. The guard now refuses only genuinely
contradictory states, `word(n,49) & 0x801` (complete and collapse); bit 0x40 no longer stops
the world.

Verified on the rebuilt artifact from the pristine Madami start: the same building reaches
flags 0x140 at frame 3,900 with the world still active, and completes by frame 4,900. Before
the change the identical scenario blocked at frame 3,232. The full suite (1,651 tests across
154 files) and `tsc --noEmit` are clean.

## Night checkpoint 2026-10-24: Madami economy, everything proven except the deposit

Ledger is unchanged at **2/24** (Exceland and Krell accepted). Mission 3 remains open.

### Landed this run

- `af46b13` admits selector 4 in the legacy construction projection (Madami carries a
  Recycling Plant) and adds the segment runner.
- `adeabae` builds from `.private/imported-ai-host-priors` (`b8872317...`), the only pack that
  carries `strategicAIRules.creatureControlPrior`; without it `w.strategy` is null and every
  step throws "Campaign lacks established strategic state", pinning the world at
  `phase: blocked`, `frame: 0`.
- `c9f2af3` stops `stepIncompleteNativeBuilding` refusing a disabled under-construction
  building. This was the real ceiling on every long run: an Ethereal damaging the **opponent's**
  in-progress building set flags `0x140` (disabled|depleted), which the guard rejected, freezing
  the campaign at frames 3232 and 6612. BUILDING_STARTUP.md records that disabled/incomplete
  cases bypass the upkeep branch and share inactive energy decay, so construction keeps
  stepping. The guard now refuses only `0x801` (complete|collapse). Verified: the same scenario
  reaches flags 0x140 at frame 3900 with `phase: active` and completes by 4900.

### Madami economy: verified pieces

- **Mules**: none are carried. "Produce Mule - 75 total" creates player-owned mules from the
  default view; three survived 4000+ ticks with health recovering to 67. All plants and all
  carried mules are neutral-owned.
- **Plants**: the Botanist works. Samples cap at 40/40; "Plant selected type nearby" creates
  owned plants around the Botanist; "Collect plant samples nearby" refreshes. Owned plants are
  **transient** - one planted on a front cell was gone two rounds later - so plant last.
- **Recycling Plant**: consumes a plant at `processingFrontOffset` = **[-256, 0]**, the cell one
  west of the building. On deposit it does `goop += pending` clamped to capacity and credits 20.
  Site needs a **clear 2x2** (footprint 2); (76,92) builds reliably for 238, while (63,107),
  (62,105), (78,88) and (80,89) are silently dropped (order accepted, never charged).
- **Power**: recycler at (76,92) reads `energy: 0` until a First Stage Distributor is built at
  (79,90) (338); it then reads 139-183. Power range is about 5 cells.
- **Capacity**: 400 per grade-0 Recycling Plant; two plants give 800. Harvest clamps goop to
  capacity, so 1400 needs four.
- **Extractor**: harvests the richest cell within radius 3 of `w.economy.resources` and needs
  power; resource values peak at 100 at (72,59) and 1,240 cells within 20 of the base are
  non-zero. Plant death deposits +2 per cell (ecology.ts:439).

### Unproven

No deposit has fired yet: every attempt has plants a few cells off the front cell, or the plant
on it disappears before the recycler can take it. The last run had the recycler at (76,92)
powered (167-183), the Botanist standing at (76,92), four plant rounds producing (75,93),
(76,93), (77,93), (76,94) - and `pending: 0`, `goop: 0`, capacity 800.

### Probe-harness lessons (cost several iterations)

- `#campaign-notice` keeps its previous text, so a stale "Construction order queued" reads like
  a fresh result. Clear it before every tap and require non-empty output.
- Playwright `click()` never settles on the re-rendering sidebar; dispatch `b.click()` via
  `page.evaluate`. Specialist rows are disabled until `a.ready`, and a skipped click leaves the
  previous unit selected with the build tool armed.
- `issue()` picks the first selected actor by id, so the Engineer (id 0) steals orders unless
  the row click actually landed.
- Map taps after construction activity in the same session return empty - do movement first,
  and prefer sidebar buttons (planting) last.
- `advanceCampaign` runs at ~25 ticks/sec; keep simulation under ~300s per probe or the run
  hits the 420s tool cap and prints nothing.

### Next session

Get a plant to stay on the front cell of the (76,92) recycler after power is up, confirm
`pending` -> `goop` + the 20 credit, then push capacity 800 -> 1400+ and start the extractor /
power-ring work for the actual GOOP objective.

## Recycling deposit: the two rules that make it hard

Measured after the checkpoint, with a positive control each time:

- **`classifyConstructionSite` validates a 3x3 area**, not the 2x2 footprint. For footprint 2 it
  scans offsets -1..+1 and calls `sitePlantBlocked`, which counts **any** active plant
  (`ecology.ts:331-335`, no owner filter). The processing-front cell is one west of the site, so
  it sits inside that 3x3: **a plant on the front cell makes the site invalid**. Build-then-plant
  is therefore the only possible order.
- **Ecology does not fill the front cell on its own.** Over 4,000 ticks with a powered recycler at
  (76,92) and a clear (75,92), plant total oscillated 31-38 and **no plant appeared within one
  cell of the front cell at any sample**.
- **Neutral plants do satisfy `selectRecyclingPlant`**: it filters only `byte(native,6) === 2`, so
  the 24-42 neutral plants qualify and the Botanist is not required for material.

Site validity is terrain-driven and not predictable from occupancy alone: with the same fresh
order and a fresh notice, (76,92) charges 238 and builds, while (71,96) and the near-base cells
(63,107), (62,105), (78,88), (80,89) are cancelled with **"Construction stopped:
native-site-rejected"** (only visible in `world.notices`, never in `#campaign-notice`).
(76,92) + a First Stage Distributor at (79,90) gives a powered recycler (`energy` 151-199);
that pair is saved as `.private/browser-campaign/madami-recycler.json` (frame 2380, funds 224).

### Untested lead

`selectRecyclingCorpse` (`building-startup.ts:220`) processes **dead creatures** on the same front
cell, requiring state >= 25 and native97 bit0 clear. Mules and creatures die routinely on Madami,
so a corpse on the front cell is a far likelier trigger than a plant. Test that before trying to
force a plant into the cell.

## The recycling front cell is inside the recycler's own footprint

Measured, not inferred. A completed Recycling Plant at world cell (76,92) stores `native[7],[9]`
exactly equal to its world position (19456, 23552), and `stepStagedRecyclingPlant` scans
`native + processingFrontOffset` = `(76,92) + (-256,0)` = **(75,92)**.

`clearDestroyedFootprint` computes `shift = footprint === 1 ? 0 : -1`, so a footprint-2 building
occupies `(cx-1..cx, cy-1..cy)`: the stored position is the **south-east corner**. The occupancy
grid (`terrain.bytes[cell*14+11] & 1`) confirms it — cells (75,91), (76,91), (75,92), (76,92) are
marked for that building, and (78..80, 89..90) for the distributor at (79,90).

Therefore **the processing cell (75,92) is one of the building's own four cells**. Consequences,
all observed:

- No plant can ever sit there: `reproduce` rejects a cell whose occupancy bit is set, and 4,000+
  ticks of soak with a powered recycler never produced one.
- Map taps there are swallowed by the building's screen footprint, so the Botanist cannot even be
  walked onto it (a tap 4 cells away reports "Move order queued" and moves her; the front-cell tap
  dispatches nothing).
- The pack value is genuinely `[-256,0]` — decompressing `.private/imported-ai-host-priors/
  genewars.gpwpack` shows `"buildingRules":{"processingFrontOffset":[-256,0],...}` — so the port is
  faithful here and the original must have **built the recycler over vegetation and eaten it**.

This contradicts `engineer-adapter.ts:544-552`, which passes `sitePlantBlocked` as the `occupied`
callback, making any plant in the 3x3 window (and therefore any plant under the building) reject
the site as class 3. If the original 74E80 classification ignored plants, that callback is the
defect and Madami's economy is unreachable for the wrong reason.

**Resolved: plants are not occupancy.** The docs never establish plants as blocking 74E80, and
`resolveTaskTarget` already treats them as non-blocking ("plant weight<10", "not made traversable
through plants"). Combined with the geometry above, a site is only ever valid if a plant may sit
under the building. `engineer-adapter.ts` now passes `() => false` as the classification's
`occupied` callback; building-blocking still comes from the terrain occupancy bit.

Verified end to end: a Recycling Plant ordered at (70,104) with an owned plant already at (69,104)
— its processing cell — was accepted and **charged 238** (funds 800 -> 562), where the same class
of site previously reported "Construction order queued" and silently dropped. Full suite still
passes (154 files, 1,651 tests) and `tsc --noEmit` is clean; artifact rebuilt as `b9731fda...`.

**Remaining blocker: power.** That build site is ~8 cells from the nearest distributor, so the new
recycler reads `energy: 0` and never deposits. A First Stage Distributor ordered at (73,104) was
*not* charged (funds stayed 562), i.e. that site was rejected on terrain. The next run should try
several distributor sites within 5 cells of the plant-over site until one charges 338, then watch
`pending` -> `goop` while a plant sits on the processing cell.

## Build-over-plant works; two calibration problems remain

After `98580ef`, a Recycling Plant ordered on a cell holding an owned plant is accepted and
**charged 238** (funds 800 -> 562) in three consecutive runs. The remaining failures are not the
construction gate:

- **Tap-to-placement offset.** Tapping cell (64,103) produced a building at **(64,101)** — two
  cells north. The tap is projected on flat ground, so elevated terrain near the base shifts the
  raycast. Always identify the new building by diffing `w.buildings` before pairing it with a
  plant; never assume `placed === tapped`.
- **Power near the base is still unavailable.** With the recycler at (64,101), a First Stage
  Distributor ordered at (64,104) was cancelled with "Construction stopped: native-site-rejected"
  and never charged. That is no longer the plant gate (plants are non-blocking now), so the rejection
  is terrain/occupancy. The result is a recycler at `energy: 0` that cannot deposit.
- A recycler at (64,103) also sat 6 cells from the distributor at (64,109), just outside the ~5-cell
  power range.

Next step: build a small distributor ring from open ground proven admissible in an earlier run
((79,90) charged 338), then place the plant-over recycler within 5 cells of *that*, keeping the
target cell on flat ground so the tap lands where projected.

## The recycling economy now works end to end

First observed deposit on Madami. One run, start save, real touch input only:

- First Stage Distributor at (79,90) — charged **338** (funds 800 -> 462), reads energy 570.
- Botanist walked to (76,88); four plant rounds produced five owned plants.
- Recycling Plant tapped at (75,88), one cell east of the plant at (74,88) which became its
  processing cell — charged **238** (462 -> 224).
- The new building resolved exactly where tapped (no offset in this region) and read
  `energy: 182` on completion, `166` a few hundred ticks later.
- Plant count dropped and **`goop` went 0 -> 14** within 400 ticks.

The 14 is a real deposit, not biomass drift: earlier powered recyclers with plants elsewhere on
the map held `goop: 0` for thousands of ticks across five separate runs.

Open detail: `funds` stayed 224 rather than gaining the documented +20 credit. Either the credit
lands elsewhere or the adapter's mirror of `raw 0x4a3` misses it — check before relying on
recycling for income.

### The working recipe

1. Build a First Stage Distributor on open ground (79,90 is proven; 338).
2. Walk the Botanist to open ground inside its radius and plant until an owned plant exists.
3. Tap the cell **one east** of that plant — the plant lands under the new footprint and becomes
   the processing cell. Build cost 238.
4. Confirm `energy > 0` on completion, then `goop` rises as plants are eaten.

Capacity is 400 per grade-0 plant, so the 1,400 objective needs four powered recyclers plus
stores; `goop` is clamped to capacity, so capacity must lead collection.

## Recycling pays goop and botanist credit, not funds

Sampled at 50-tick resolution inside the construction window of a successful run:

- frame 3260: funds 462 -> **224** (the 238 build charge)
- frame 3710: goop 0 -> **14**, funds **224 -> 224**

So the deposit fires correctly but adds no money. That is faithful, not a defect: the deposit's
`credit(owner, 20)` calls 80780, which `planBotanistEconomy` implements
(`docs/mechanics/BOTANIST.md:65`) and which writes the player's botanist economy counters
(`raw+13`, clamped `raw+17`) — while funds live at `raw 0x4a3` (`world.ts:1517`) and only change
through construction debit, demolition refund and ethereal events. `BUILDING_STARTUP.md:52`
likewise says a deposit requires 80780. Do not "fix" this by redirecting the credit into funds.

### What that means for the 1,400 objective

Funds start at 800 and recycling does not replace them, so build order matters:

- distributor 338 + recycler 238 = 576, leaving 224 — that is the run above.
- capacity is 400 per grade-0 recycler, 600 per extractor, 500 per grade-0 store (selector 13).
- reaching capacity 1,400 from the carried 400 needs ~two stores (300 each) rather than two more
  recyclers that cannot be afforded.

Next: check whether stores require power, then build capacity first and let the one powered
recycler accumulate goop against it.

## A recycler deposits once, then starves: the material source is unresolved

After the successful deposit (`goop 0 -> 14` at frame 3710), 2,000 further ticks left
`goop: 14`, `cap: 800`, `funds: 224` completely flat. There is no second deposit, because the
processing cell is a cell of the building's own 2x2: `reproduce` refuses any cell whose terrain
occupancy bit is set (`ecology.ts:487`), so vegetation cannot regrow where the recycler can reach
it. The one deposit came from a plant that was already under the footprint when the building went
up.

That makes a recycler a **single-use** machine as the port stands: one plant in, ~14 goop out. With
1,400 GOOP required and capacity at 400 per recycler (extractors 600, and stores are not in the
build menu at all — `NAMES` in `campaign.ts:41` lists only 0-6 and 11), the objective is not
reachable this way.

The unresolved question is therefore the one the handoff flagged: **how material legally reaches a
processing cell repeatedly.** Candidates, in order of plausibility:

1. Vegetation regrowth *on* the footprint in the original (i.e. the occupancy bit should not block
   plant reproduction on a recycler's own cells). This needs source evidence for what 753F0's
   occupancy bit means for reproduct77C0, not a guess.
2. Corpses: `selectRecyclingCorpse` accepts dead creatures (state >= 25, native97 bit0 clear) on
   the same cell, but a corpse also cannot occupy a footprint cell, so this has the same geometry
   problem.
3. Mules/herbivores delivering biomass to the plant through a separate route.

Until (1) is settled with evidence, do not weaken the occupancy check: it is what keeps buildings
from overlapping.

## Single-use recyclers confirmed; extractors are the replenishable source

Direct test against a working recycler at (75,88), whose processing cell is (74,88):

- the terrain occupancy bit at (74,88) reads **1** — the cell is building ground
- the Botanist was walked to (73,89) and even onto (74,88); six "Plant selected type nearby"
  orders all succeeded and none placed a plant on the processing cell (`onFront` false every round)
- `goop` stayed at **14** through all six rounds while `energy` climbed 156 -> 186

This matches the evidence rather than contradicting it: `OWNED_PLANT_REPRODUCTION.md` says
reproduction retains the original "target-cell checks", and `reproduce` refuses a cell whose
occupancy bit is set. So no vegetation can be re-established where a recycler can reach, and a
recycler converts exactly the plant it was built over — one deposit each.

**Consequence for Madami.** Recycling is a one-shot bonus, not an income stream, so the 1,400 GOOP
objective cannot be met by stacking recyclers. The replenishable source is the **Extractor**
(selector 11): it harvests the richest resource cell within radius 3 indefinitely, adds 600
capacity, and needs power. Funds are the binding constraint: 800 buys one 650 extractor plus a 338
distributor and little else, and nothing in the port replenishes funds once spent.

Next: verify an extractor placed on a rich cell (v=100 at (72,59)) inside a distributor's radius
actually accumulates goop over thousands of ticks, and measure the real rate. That is the only
mechanic that can total 1,400.

## Mules haul biomass into recyclers: the repeatable deposit source

The single-use finding above is only true for the plant that happens to be under the footprint at
construction. Material *carried in by a Mule* is the repeatable source, and it is proven.

Starting from the saved segment `.private/browser-campaign/madami-recycler.json` (frame 2486,
funds 224, capacity 800, two powered recyclers at (67,106) energy 177 and (76,92) energy 173,
three distributors, one Genepod, 32 plants, no owned Mule):

1. "Produce Mule · 75 total" queued (`Mule production order queued`), funds 224 -> **149**, an owned
   Mule appears within ~900 ticks.
2. Clicking the Mule row (`Mule 1 · health 67/67`) then "Collect material" queued
   `Mule collection order queued`.
3. Over the next ~500 ticks the Mule's carried byte went null -> 192 -> 108 -> 92 and **goop rose
   0 -> 26** at frame 8356, with funds unchanged at 149 and recycler energy climbing 171 -> 195.

So a Mule delivers biomass to a recycling plant and the plant fires a deposit. Note the target
select `#campaign-mule-target` was NOT found in the DOM (`targets: "NO_SELECT"`) and the order still
queued - so the button works with a default material choice and the Mule selects material itself.
Do not assume an explicit target selection is required.

Two further consequences:
- **Funds do not grow from recycling** (149 before and after the deposit), consistent with the
  80780-credit finding. Mules cost 75 each against a 224-fund balance, so the fleet cannot be bought
  outright.
- **Mule reproduction is therefore the scaling lever**, not purchases. `OWNED_MULE.md` documents
  same-species pairing/birth, so the hauling fleet grows without funds.

Route shape now: keep two recyclers powered and let a growing Mule fleet feed them; each delivery is
worth roughly 26 goop against the 1,400 objective. This replaces the "build plants on the front
cell" approach that the 3x3 site rule makes impossible.

## Madami's objective is STORED goop, and capacity is the real wall

Settled from code, not from prose. The briefing says "collect 1400 units of GOOP", which reads
cumulative, but the actual predicate in `src/sim/mechanics/mission-objectives.ts` is:

```js
const current = i32(p, 0x4a7);            // stored goop
thresholdReached: current >= c.targetCount // c.targetCount = 1400 for Madami
```

So the win condition compares the **currently stored** goop against 1400. Storing 1400 therefore
requires **capacity >= 1400**, and capacity is 400 per grade-0 Recycling Plant.

Measured long segment (`.private/build-probe-20261024/w32.mjs`, saved madami-recycler segment,
2 mules hauling into 2 powered recyclers):

- goop rose repeatably `0 -> 78 -> 160 -> 236 -> 378 -> 464 -> 544 -> 594 -> 672 -> 800`
- it then **clamped at 800 = capacity** and stayed there (`[9085,672],[9385,800],[9685,800]`)
- funds fell 224 -> 149 -> 74 (one Mule is 75) and never rose across all those deposits

So the deposit mechanic works and is repeatable; the objective is simply unreachable at capacity
800. Two more grade-0 recyclers (238 each, 400 each) would give 1600 for about 476 funds, and the
balance is 74. **Funds, not goop, is the binding constraint.**

### The funds lever: salvage credits raw funds

`src/sim/mechanics/salvage-effect.ts` states its credit is a "Raw unsigned32 funds add; no80780
cap", and `building-demolition.ts` exposes `salvage(w, request): number | null` with the comment
"timed demolition/salvage, never an ownership transfer". So demolition/salvage is the one verified
route that writes to `player.funds`, unlike recycling deposits, which pay goop plus botanist credit.

This also explains the preserved runs sitting at 11 funds with capacity 1600: they must have
recouped funds from salvage rather than from recycling.

Route to 1400 now: salvage enemy (or surplus own) buildings for raw funds -> build two more grade-0
recyclers to reach capacity 1600 -> keep the Mule fleet hauling until stored goop reaches 1400.

## Stores are unreachable, but the mission may already be affordable

Two dead ends checked and closed:

- **No demolition/salvage affordance exists for the player.** `campaign.ts` has no Demolish or
  Salvage control at all; `BuildingDemolitionContext.salvage` is only reachable from the timed
  demolition path, which nothing in the UI issues. So salvage cannot be farmed as income today.
- **Stores (selector 13) cannot be built.** The pack defines `capacity.store13 = [500,1000,1500]`
  and the sim supports selector 13 (`goop-storage.ts:122`, `economy.ts:305`, `zones.ts:944`,
  `constructionAvailable` accepts 0..13), but `building-native.ts:31` admits only
  `[0,1,2,3,4,5,6,11]` for the native construction family, so a selector-13 order raises
  "Native Engineer task0 selector requires an unimplemented construction family". Adding a name to
  the build menu would not help; it needs a real native family with source evidence.

### The arithmetic that matters

Capacity is 400 per grade-0 Recycling Plant, and **recyclers only need power, not a new
distributor** if they are sited within ~5 cells of one that already exists. The carried state has a
distributor at (64,109) powering the carried recycler at (67,106).

So: 3 new grade-0 recyclers at 238 each = **714 funds**, which fits inside the starting 800
without any income at all, and gives 400 + 3x400 = 1600 capacity. That satisfies the 1400 stored
goal by itself.

The earlier plan spent 338 on a new distributor and 150 on two Mules before any capacity, which is
what made funds look like a hard wall. **Build capacity first, inside the existing distributor's
radius, and only then spend on Mules to feed it.**

Next test: plant near (64,109), build a recycler over a plant within 5 cells of that distributor,
and confirm it comes up with `energy > 0` and no new distributor.

## There is no buildable site near the carried distributor

Tested the "capacity first, no new distributor" hypothesis directly (`.private/build-probe-20261024/
w34.mjs`, start save, funds 800, capacity 400, one distributor at (64,109) with the carried
recycler at (67,106) at energy 196, 46 plants):

- the Botanist walked to (62,105) as ordered and four plant rounds left plants including (64,105)
  and (66,104)
- the best candidate was a plant at (64,105) with a free east cell (65,105), **4.1 cells** from the
  distributor — comfortably inside the ~5-cell power radius
- tapping (65,105) with "Recycling Plant · 238" armed reported "Construction order queued", then
  **funds stayed 800** and no building appeared, twice

So the site is rejected on terrain/occupancy, not on power. Every buildable site found so far is
far from existing distributors ((70,104), (75,88), (76,92)), and every site near one is rejected.
That is why a new distributor (338) keeps being needed, and why the 714-funds-for-three-recyclers
plan does not work as written.

Also fixed a probe bug worth remembering: **plants expose `position`, not `native[7]/[9]`** — reading
native coordinates gave cells like (1,0) and produced a false NO_CANDIDATE. Mules do use
`native[7]/[9]`.

Open question for the next run: is the near-base terrain genuinely inadmissible, or is
`classifyConstructionSite` rejecting because of the cluster's own buildings within the 3x3 window?
Test a candidate whose 3x3 does not intersect any building but is still within 5 cells of (64,109).

## Capacity raised to 1200 on the starting funds, in chained segments

The cheap route works. Replicating `classifyConstructionSite` in-page (footprint 2: the 2x2 at
`(px-1..px, py-1..py)` must be occupancy-free, and the whole 3x3 must clear `bytes[at+5] & 7` water)
reproduced every observed outcome exactly - valid at (70,104), (75,88), (76,92); blocked at (65,105);
water at (62,105) - and found four valid sites inside the carried distributor's 5-cell radius:
(67,109) d=3, (67,108) d=3.2, (68,108) d=4.1, (64,104) d=5.

Chained one build per segment, each exported:

- `madami-cap1.json` - recycler at (68,108) - capacity 800 - funds 562
- `madami-cap2.json` - recycler at (64,104) - capacity 1200 - funds 324
- `madami-cap3.json` - no site left in radius - capacity 1200 - funds 324

Every build charged 238 and came up **powered** from the carried distributor - no new distributor
was bought, and no plant had to sit under the site. Three recyclers now read energy 194/190/140.

### The last 200 capacity

Capacity 1200 is short of the 1400 the objective needs, so one more recycler (238, affordable at 324)
would reach 1600 and leave 86 - close to the preserved runs' signature of capacity 1600 with 11
funds after one 75 Mule. But the four valid sites are used up, and a replacement distributor costs
338 against 324 funds: **14 short**.

Open questions, in order:
1. Does an AI-owned distributor power a player recycler? Sites exist near (74,62) (e.g. (74,65) at
   d=2). A short run that builds there and reads `energy` answers it; if yes the fourth plant is
   affordable today.
2. If not, capacity 1200 caps stored goop at 1200 - and only 14 funds are missing for a distributor,
   so any small income source would unblock it.

Probe notes worth keeping: the export control only exists inside the **Save / load** dialog, so the
download must be armed after opening it (a direct click never fires a download); and long runs let
the AI build its own distributors, which previously pulled site selection away from the base - pin
the search to the carried distributor.

## Madami: capacity 1600 reached for 789 of the starting 800

The fourth plant fits, and the resulting state matches the preserved runs exactly: **capacity 1600,
funds 11**.

Two findings unlocked it:

- **Power reaches past 5.0 cells.** A plant built at (62,104) - 5.39 cells from the distributor at
  (64,109) - completed and charged 238. Range is not a hard 5, so the "radius is full" conclusion
  was wrong. (It nevertheless reads `energy: 0`: completed but out of range, so it supplies
  capacity without processing.)
- **Capacity counts completed buildings regardless of power**, so 1600 is available even though
  only three of the four plants run.

Final state, exported as **`.private/browser-campaign/madami-ready.json`**:

- (67,106) carried, energy 184
- (68,108) energy 180
- (64,104) energy 194
- (62,104) energy 0 - capacity only
- funds **11**, capacity **1600**, one owned Mule

That is the preserved runs' exact signature (capacity 1600 / funds 11), reached here from a clean
start in four chained segments. The remaining work is pure accumulation: feed the three powered
plants with Mule hauling until stored goop reaches 1400, then the `goop-threshold` predicate fires.

Spend so far: 238 x 3 plants (714) + 75 Mule = 789 of 800. No distributor was bought; the carried
one at (64,109) powers three of the four plants.

## Accumulation works, then stalls at 326 when the local plants run out

From `madami-ready.json` (capacity 1600, funds 11, one Mule, three powered plants):

- **No collection order is needed.** With no dispatch at all, goop rose 0 -> 34 -> 132 -> 230 -> 300
  over 2400 ticks. A single owned Mule hauls on its own.
- Chained segments took goop to **326 at frame 18,600** (segment 2), about 0.09 goop/tick.
- The next segment then held **flat at 326 for 2400 ticks** (frames 21k-24k), and a 600-tick
  diagnostic reproduced the stall: goop 326 -> 326 while the Mule was alive and its carried value
  moved 21 -> 1.

So the Mule is not dead and not idle - the material supply is gone. At the stall the world had 34
plants (down from 38) but only 5, 2 and 9 within 8 cells of the three powered recyclers, and the two
remaining pumps sit at 5 and 2. Stored goop also has no other sink, so the flat reading is a supply
limit rather than a deposit bug.

Next step is therefore the Botanist, not the economy: replant around the powered recyclers
(67,106), (68,108), (64,104) to refill the local biomass, then resume accumulation. Both the
Botanist and the Engineer are still alive at skill 28 and 31.

Two harness notes: the world phase is `"active"`, not `"playing"` (an exit test on `"playing"` ends a
run after one chunk), and the run cost grows as the AI expands - 3600-tick segments now exceed a
280s budget, so segments are capped near 2400 ticks.

Notable world event at frame 19105: an AI engineer logged "Native Engineer task0 selector requires an
unimplemented construction family" - the AI is attempting a selector the port does not implement,
which is the same fail-closed family gap as selector 13. It does not affect us yet.

## Goop is spendable currency - and a drowning Mule now halts Madami

Two decisive results from `madami-goop3.json` (goop 326, funds 11, capacity 1600, no Mule).

### Goop pays for construction (`engineer-construction.ts:899-924`)

`pay()` is a **two-pool debit**: it spends funds first, then drains goop for the remainder. That is
live in the player UI, not just the AI path - ordering "Produce Mule · 75" spent exactly 11 funds +
64 goop (326 -> 262) and produced a Mule. A second Mule cost 75 more goop (funds already 0).

So goop is a currency and the mission is not funds-starved: 326 goop buys four Mules. Consequence
for planning: keep enough goop to re-buy Mules, because Mules die and there is no other workforce
source. (The "Mule produced" notices in `world.notices` are the *AI's* production - the Genepod does
not make free player Mules; 2400 ticks with 0 owned Mules produced none.)

### Accumulation works once Mules exist

With two purchased Mules, stored goop went **273 -> 779 over 2000 ticks** (~0.25/tick), from
`madami-goop4.json`. No collection order was needed; no recycler has a plant on its processing cell,
so Mule biomass converts without one.

### The blocker: Owned self-water damage

At frame 30,556, one tick after "Ethereals are arriving", the world went `phase: blocked`:

```
Mule 39: Owned self-water damage requires lethal/action/reference continuation
```

`applyOwnedMuleSelfWaterDamage` (`mule.ts:1221-1245`) admits only a narrow state: `n[0x5e] === 8`
(empty), `n[0x7a] === 4`, idle-or-commanded flags, health > 5, and no command references. Mule 39
was **carrying 21** material, so `n[0x5e] !== 8` and it throws instead of resolving. The original's
lethal/action/reference continuation for a laden mule entering water is unported.

This is the next implementation task, and it is a hard gate on finishing Madami: once Mules exist
they wander into water (the map has 42 water cells inside the distributor radius alone), and any
laden one that does halts the whole world. Do not weaken the guard - port the continuation.

Current best state: `madami-goop4.json` (goop 779, funds 0, capacity 1600, 2 Mules) and
`madami-goop5.json` (same at the blocked frame 30556, kept as evidence).

## Next implementation work

Complete Exceland's original startup/specialist preparation and complete construction/terrain/power/economy families using the existing source-backed contracts. Replace provisional scheduling with established observable behavior, integrate original result eligibility and continuation, and accept the whole first mission through save/reload and carried Krell initialization. Then expand complete mechanic families across all 24 original maps. Keep the workbench acceptance separate from campaign acceptance throughout.

The preservation archive contains later corrections beyond the early mission-001 static contract; consult acceptance-004 and current-state history without resuming callback-by-callback frontier work. Do not silently promote the workbench into canonical gameplay because its synthetic tests pass.

# Strategic construction site planning

`strategic-ai-site-planning.ts` implements source3A1E0 and its local numeric predicates, including32230 expansion. It calls the separately implemented spatial traversal and74E80 site classification. It does not issue construction commands or initialize an opponent by itself. Canonical campaign acceptance remains0/24.

## API and transactions

- `planStagedStrategicSite(state, request, context)` matches the existing Engineer `planSite` request/result. It selects an actual point and selector, or source selector14 with the player's landing point after all eleven failures. Failed selection writes the actual selector cooldown2000 at AI+0E+4×selector.
- `queryStrategicExpansion(state, request, context)` matches Engineer `expansionSite`:320E0/32230 returns a selected point or null.
- `makeStrategicSitePlanningServices(context)` supplies both ports. These run inside the caller's transaction, including RNG changes and the AI expansion reference/cap writes.
- `stepStrategicSite` provides a standalone atomic wrapper, cloning all strategic numeric pools and additive specialist command-cache metadata before committing.
- `strategicSitePowered` implements432C0 over the construction owner's actual64 buildings, completed flag1, selector3 and grade-dependent reach.

The context extends `StrategicSpatialContext`, with actual active-player count, the released Engineer rule tables and all12 full `PlantRule` rows. Physical terrain, spatial linked order and entity lookup remain actual supplied services. No guessed terrain, target protection, table values or empty callback substitutes are installed.

## Implemented branches

3A1E0 selects its anchor from the exact retained Photon, selected building reference, source base point or truncated signed building centroid. Class0 wildcard counting and later exact-class anchor lookup remain distinct. A centroid truncates each signed coordinate to cells before averaging and truncating again; it does not compute a circular mean. The search attempts the initial radius and ten increments of512.

The branches implement these source bodies:

| Source | Behavior |
| --- | --- |
|305F0 | Ordered outward ring traversal, origin alignment and batch stop behavior |
|318E0/319D0/31A60 | Twelve-species cumulative suitability plus decay/nutrition scoring, including signed wrapped constructor weights |
|31D70/432C0 | First valid dependent-facility site inside completed Photon reach |
|31E10/31FF0 | Nearby first-building owner census and original last-tie selection |
|31E60/31F00 | Local land percentage and highest land-count candidate, with original stop timing |
|31420 | Strict highest valid ground site for selector8 |
|31B30/31B50 | Mineral sum and strict best extractor site |
|31BF0 | Actual selector6/8 power choice from fixed-power byte and capped solar altitude |
|321E0/32230 | Expansion separation and mineral/plant value scoring |
|30F10/31D10 | Existing concrete free-point search for other building selectors |

`31FF0` receives a building-count byte at query+39, but its body does not read it. Its nested radius derives from query+37, initialized0, so the source radius is1536. This behavior is retained. Its owner count wraps as a byte, and equal scores replace the selected point. `31F00` finishes the current batch of callbacks after setting its stop flag; the next batch is skipped.

32230 compares separation against its retained query+23 reference point, while land and value queries use the current angular point+7. The original callers initialize the reference to the query origin. All linked plants contribute10 to expansion value, without a protection or owner filter; eligible land contributes30 plus its mineral byte. Query constructors consume the real two RNG draws in the source order, including nested queries whose candidate is later rejected.

## Evidence and boundaries

The read-only preserved source is `private/ghidra/mission-array-refs/instructions-0003a1e0.txt` and its companion decompilation. Local predicates use mapped object1 ranges31420..3148F,318E0..31ADE,31B50..31D03,31D70..31DE2,31E10..31E76,31F00..31FDF,31FF0..320D7,321E0..32621 and432C0..4333B. Mapped object3 vtables1126D0/6D8/6DC/6F0/700/704/70C/710 establish the actual callback addresses. Rule bytes come through existing hash-admitted imports; no original instructions or assets are copied into this module or public fixtures.

An expansion marked successful without ever writing a positive-score best point has an uninitialized source output point. The conversion rejects that data-dependent case explicitly instead of inventing a point. It also rejects incompatible owner identities, unknown numeric fields and unsupported traversal extents before treating them as usable gameplay. This module supplies a concrete dependency of strategic planning; the remaining real role commands and other strategic services remain separate requirements.

## Verification

Public synthetic tests cover source free-point order/minimum radius, exact Photon reach, exact classification anchor, actual6/8 selection, all eleven failed attempts/cooldown, nested mineral RNG, expansion's retained-origin separation, protected-plant counting, JSON persistence and atomic late failure.

The ignored private closed-listing comparison passes39 cases and75,335,550 listing-model instructions, comparing3,217,978 retained numeric values across outputs, all state roots and RNG. It exercises3A1E0 and32230 against actual numeric tables and synthetic retained states, including linked building census, nested plant/mineral grids, fixed/solar power, own/opponent expansion separation, all failed-radius paths and signed centroids. The fixture SHA-256 is `6a8bcc7897afbac686fd39b86d4d942ff9729891581269a0d8b9ac4ca80018a3`. It does not execute the original program. Plant virtual68 remains a readonly comparison port, reused through the separately proven site classifier.

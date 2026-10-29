# Implementation audit and roadmap

Audited 29 October 2026 against conversion commit `65929b2`. This document records a read-only source, test, documentation and preserved-evidence audit. Tests and campaign gameplay were not rerun for the audit. Original assets, disassembly, private comparisons and campaign saves are not distributed here.

## Maturity

The repository is a substantial but incomplete conversion. Historical software acceptance is 11/24; mission 12 is partial. The last recorded full suite passed 2,002 tests in 172 files. Neither figure is an overall completion percentage. Some tests deliberately verify rejection of unimplemented behavior.

Implemented foundations include deterministic simulation, complete implemented-state saves/replays, original-content import, terrain and animation rendering, specialist roles, construction/economy, ecology, supported creature callbacks, strategic AI and campaign results. Physical phone acceptance remains pending.

## Confirmed gaps and qualifications

- Creature callbacks admit selectors 1,2,3,4,9,10,11,14,19,22,24. Dinosaur families and remaining Frog hybrids are not admitted. See `src/sim/mechanics/creature-species.ts`.
- Ordinary Frog movement and melee exist; advanced spit and special attacks remain entered failures in `src/sim/mechanics/mule.ts`.
- Human creature attack admission is narrower than autonomous callback admission. Carrier mode3 is rejected in `human-creature-commands.ts`.
- Plant/corpse material work exists; live-creature and specialist pickup remain explicit gaps in `mule-hauling.ts`.
- Engineer repair, upgrade and sabotage bodies already exist. Do not rebuild them wholesale. Reconcile selector coverage, human controls and dependent effects; see `engineer.ts`, `campaign/engineer-adapter.ts` and `docs/mechanics/ENGINEER_EXISTING_BUILDING.md`.
- Shield operation and damage exist, but construction is outside `building-native.ts` admission, timed demolition excludes it, and `continueCampaign` refuses worlds with a Shield ring pool. Existing Shield tests seed completed buildings and cannot prove construction.
- Ethereal attack25 is implemented and wired into the campaign. Its remaining explicit gap includes same-slot inline effect replacement, not the entire attack family.
- Many AI missing-service exceptions are defensive interfaces with actual services supplied by `campaign/strategic-adapter.ts`. Determine reachability before treating every exception as a missing mechanic.
- Campaign audio and specialist voices are consumed. Remaining source device caps/polling, narration, music and captions need completion or verification.
- Campaign recovery saving exists despite stale player-improvements documentation. Complete help, management UI, gestures and physical-device/performance acceptance remain unfinished or uncertain.
- Rule extensions are tightly source-validated compatibility profiles, not a general modding SDK.

## Dependency-ordered development

1. Record a species/state/command, building/lifecycle and effect/factory coverage ledger, distinguishing implemented services, real entered gaps and invalid-input guards.
2. Establish shared-pool replacement, reference retirement and campaign cleanup contracts.
3. Complete building factories, repair/upgrade coverage and retirement, then expose verified player operations.
4. Complete live carrying/attachment lifecycle and human carrier commands.
5. Implement Frog ability/effect behavior on the existing shared infrastructure.
6. Trace and bind Dinosaur callbacks and remaining ordered hybrids.
7. Reconcile AI and human command coverage against the completed mechanic families.
8. Complete remaining reachable Ethereal/outcome/ending paths, presentation and delivery validation. Treat general modding as separate scope.

## Five immediate tasks and acceptance criteria

1. **Shield campaign cleanup:** trace the complete original transition chain; verify live/inactive rings, linked effects, destroyed generators, save before result, exact carry/reload and no stale references. Do not simply clear the pool.
2. **Shield construction and building operations:** verify original factory initialization, placement/payment, cancellation, completion, repair, upgrade, destruction and demolition with human/AI differences and mid-work replay.
3. **Live carrying:** verify cancellation, reciprocal references, spatial membership, pickup/unload, carrier/passenger death, stun/freeze, capacity failure, attached saves and exact RNG/rollback.
4. **Frog spit:** verify neutral quality90/91, inherited/researched eligibility, approach, launch, collision, expiry, water, target loss, allocation failure and replay against preserved source routines.
5. **Dinosaur and hybrids:** trace pure-species dispatch before widening admission; compare movement, feeding, combat, abilities, damage/death, ordered components, breeding, player commands and host replay.

## Risks and efficient verification

Native pools, projected entities, spatial lists and shared effects have complex alias/transaction requirements. Local rollback does not establish whole-tick atomicity. Source comparisons that stub factories need separate real-factory integration tests. Historical acceptance receipts apply to their recorded builds. Documentation must distinguish historical and current coverage.

Use bounded source comparisons, focused unit tests, small synthetic host scenarios, save/load and replay tests. Run affected suites during iteration and the full suite at mechanic-family boundaries. Use short UI checks for changed controls. Campaign play should answer a specific integration question under a fixed budget, not serve as the primary implementation process.

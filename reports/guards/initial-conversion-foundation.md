# Initial conversion foundation guard

## WHAT WAS DONE

Created the separate direct-conversion repository, imported user-owned content privately, adapted the pinned Battle Drones platform seam, implemented the original-art browser/rendering boundary and deterministic construction workbench, and packaged private/synthetic standalone HTML.

## WHAT WAS VERIFIED

Strict TypeScript; 18 workbench/mechanic/save/replay/scheduling tests; nine Python format/security tests; local leak/license checks; offline release-artifact browser tests at three viewports; mouse and touchscreen construction paths; original resource identity; 123 RNC output hashes; 60 indexed8 resources and 2,983 sprite records; all 24 campaign map/title pairs and 393,216 cells. Physical phone validation is not included.

## WHAT FAILED

Early packaging corrupted literal dollar sequences during replacement; fixed with callback substitution. A minimap CSS selector covered the game; fixed and regression-tested. Pointer placement originally lost taps near selectable actors; placing now has priority. First RAF could report a negative display delta; clamped at the display boundary. Vitest initially discovered donor tests; explicit conversion-only test routing fixed this and donor results are excluded. None is claimed as a verified bug in original GeneWars.

## CURRENT EXACT STATE

Usable private content inspector and construction workbench. Accepted original missions: 0/24. The construction schedule and specialist initialization remain provisional. Final artifact hashes and source revision are recorded by the build receipt, with verification bound to the exact browser-tested file.

## REMAINING BLOCKERS

Missing implementation: original startup, full specialist jobs, construction/terrain work, power and GOOP callbacks, ecology/genetics/research/combat/AI, Ethereals and scoring, outcomes/carry/progression, remaining media, original mechanic acceptance, all 24 complete missions, physical S21 Ultra and performance acceptance. No extra user permission is needed to continue this authorized work.

## NEXT ACTIONABLE STEP

Replace the provisional workbench scheduling with complete source-backed Exceland startup and construction/terrain/power/economy families, then accept its original result/carry path before broad campaign expansion. Preserve the neighboring archive and private-output separation.

## EVIDENCE

Private `.private/conformance.json`, `.private/verification.json`, `.private/mission-runner.json`, `.private/browser-private/`, `test-results/browser-synthetic/`, and `dist/*.receipt.json`. Public behavior matrix and current-state documents distinguish conversion checks from historical Rust results and original-rule acceptance.

## GITHUB PAGES URL

None. Private builds must not be deployed publicly.

Foundation guard: **PASS**. Full requested conversion: **FAIL — incomplete**.

# Verification and acceptance

Run `npm run check`: strict TypeScript, 18 Vitest mechanic/save/replay/scheduling checks, nine Python format/security tests, and the public-candidate leak/license scan. Vitest explicitly excludes `.private/`, including the donor checkout. Donor tests accidentally discovered during initial setup were stopped and are not conversion acceptance evidence. `npm run verify -- --private` runs checks and both artifact/browser suites, binds browser reports to output SHA-256, and appends results to build receipts.

Run `npm run build:sfhs -- --synthetic` and `npm run test:browser` for the standalone synthetic artifact. The checked-in GitHub Actions workflow uses synthetic/open data only, installs Chromium, and runs these commands without original assets. It has not yet run remotely; local equivalents are recorded separately. No Pages or release upload job exists.

Browser tests open the actual emitted file via `file://`, set the browser context offline, reject network requests, run isolated `CR.runFullSelfCheck()`, verify no selfcheck world contamination, start the renderer, pause/speed, select, save/reload, check render purity, and inspect three viewport layouts (1440×900, 915×412, 412×915). Desktop mouse and landscape touchscreen complete the development construction sequence through UI clicks/taps. Private tests can open Krell's map afterward; this is not canonical carried progression. Screenshots must be visually reviewed; triangle counts alone did not catch an early obscuring minimap defect.

Private tests:

```powershell
npm run build:sfhs -- --assets .private/imported
npm run test:browser -- --private
python -B tools/import-original/conformance.py --source "D:\Games\GeneWars\GENEWARS.img" --evidence "..\genewars\genewars-preflight\research"
```

The conformance tool compares independent RNC decode hashes with preserved outputs, indexed8 sprite dimensions/opacity with recorded Rust metrics, all 24 campaign source hashes/names, and all 393,216 imported map cells with source bytes. It reads evidence only; it does not execute historical scripts, the original executable or reconstructed game. Compound RNC resources are explicitly skipped rather than guessed.

Generated reports/captures are private or ignored. Synthetic screenshots under test-results contain no original content. Private reports and original-art screenshots remain under `.private/`. Do not label private evidence reproducible from a public clean checkout.

Remaining acceptance: complete original gameplay, all 24 start/save/reload/fail/win/transition paths, original mechanic/mission regressions, difficult save points for future systems, full touch gesture/lifecycle/audio suite, original music/captions, physical Galaxy S21 Ultra usability, measured 60/30 FPS targets, and complete asset import. Emulated viewport tests do not certify these.

Single-file skill failure modes guarded: deliverable drift, external dependencies, eval/inline handlers, render-side mutation, save corruption, harness pollution, viewport overflow/safe-area, minimap overlap, input cancellation and release-artifact mismatch. Remaining full gesture/performance coverage is explicitly unaccepted.

# GeneWars direct SFHS conversion

An in-progress direct conversion of the original GeneWars using TypeScript and Three.js, with platform patterns adapted from Battle Drones. The target is the original 24-mission campaign in one offline HTML file. **This checkout is a development foundation, not a playable campaign release.**

Implemented: deterministic campaign simulation and save/replay, imported startup data for all 24 maps, rendering and touch controls, specialist work, construction and economy, ecology, supported creature families, strategic AI, and many combat/effect callbacks. **Software campaign acceptance is 11/24; mission 12 is partial.** This is historical software acceptance, not proof that every original mechanic is complete or physical-device acceptance.

Last recorded verification: 2,002 tests across 172 files, strict TypeScript and leak checks passed. See [campaign progress](docs/CAMPAIGN_PROGRESS.md) and the [implementation audit and roadmap](docs/IMPLEMENTATION_ROADMAP.md). Older documents contain historical coverage statements and should not override these records.

## Original files stay local

No original graphics, sound, mission files or executables are included. Supply your legally owned files. Original content and generated builds remain under ignored `.private/` and `dist/`. Never upload a generated private build or pack to Pages, releases or a public repository. The Apache license covers conversion code and donor adaptations, not EA/Bullfrog content.

Currently supported source: the hash-identified QA BETA V5 candidate, supplied as a MODE1/2352 `.img`, ISO2048 image, loose installation or flat installation ZIP. The original executable is read only for identity and hash-admitted numeric tables, never executed or embedded. Retail and other editions are refused explicitly pending adapters. A ZIP containing nested ZIP/7z/CD packages must first be opened locally to obtain its disc image; it is not a flat installation ZIP.

## Build on Windows

Requires Node.js 22+, npm, Python 3.12+, and a browser with WebGL2 and DecompressionStream.

```powershell
.\scripts\build-local.ps1 -Source "D:\Games\GeneWars\GENEWARS.img"
```

The resulting private development artifact is `dist/genewars-sfhs.html`; its SHA-256 and provenance are in `dist/genewars-sfhs.html.receipt.json`. Open the HTML directly in Chrome or Edge. It needs no server or runtime network access. **Start original campaign** opens the campaign briefing and current development runtime; **Campaign atlas**, **Asset browser** and **Exceland construction workbench** remain separate inspection tools.

Individual steps:

```powershell
npm ci --ignore-scripts
npm run import:original -- --source "D:\Games\GeneWars\GENEWARS.img"
npm run inspect:pack -- --pack .private/imported/genewars.gwpack
npm run check
npm run build:sfhs -- --assets .private/imported
npm run test:browser -- --private
```

`npm run dev` starts the asset-free development fixture. To test the bundled open fixture offline:

```powershell
npm run build:sfhs -- --synthetic
npm run test:browser
```

Set `CHROME_PATH` if Chromium is not in a standard location. This build has not been tested on a physical Galaxy S21 Ultra. Browser viewport tests do not establish phone performance.

## Workbench controls

Choose a construction button, then click/tap a site. Complete Extractor, Distributor, and three Photon Processors. The resulting message confirms the construction predicate, not original mission acceptance. **Inspect Krell** opens its imported map without claiming a campaign transition.

Space pauses; commands can be queued while paused. Shift queues orders. Right-click or tap empty terrain orders movement. Desktop drag selects specialists; touch drag pans; wheel/pinch zooms. Arrow keys pan. Ctrl+1–9 stores groups; 1–9 recalls them. Alt+1–9 stores camera locations; Shift+1–9 recalls them. The minimap and alert buttons focus locations. Saves provides three manual slots, JSON export/import and replay export. Four recovery slots rotate automatically.

See [current state](docs/CURRENT_STATE.md), [evidence matrix](docs/ORIGINAL_BEHAVIOR_MATRIX.md), [testing](docs/TESTING.md), [provenance](docs/ORIGINAL_ASSET_PROVENANCE.md) and [donor audit](docs/UPSTREAM_BATTLE_DRONES.md).

# Battle Drones donor audit

Source: https://github.com/simonw/battledrones

Exact detached revision: `39d6f587f98a82f5c0426e8bd476cef49fd19ef0`.

Fetched for this task into ignored `.private/battledrones`. License: Apache-2.0, copied verbatim to root LICENSE. The donor has no root NOTICE file; root NOTICE identifies its authors/project, source URL, pin and modifications. New/adapted conversion code uses Apache-2.0. Original game content remains excluded.

| Audited component | Finding / conversion decision |
|---|---|
| package.json | Adopt Vite/TypeScript/Three.js/Vitest and browser-test toolchain pattern; independently pinned minimal dependencies; no QR/PWA runtime |
| src/sim/sim.ts | Commands before defined ordered systems; adopt boundary, replace every drone system |
| src/sim/types.ts | Factions, Goliaths and drone tech types incompatible; import none |
| src/sim/world.ts | Serializable authority and stable IDs useful; implement GeneWars workbench types independently |
| src/sim/checksum.ts | FNV pattern useful; donor's selected-field hash insufficient for complete saves. Adapt to all canonical state fields |
| src/arena/record.ts | Adopt seeded/setup record, issued commands, checkpoint hash and result verification; replace schemas and command handling |
| src/game/GameScene.ts | Adopt fixed tick/presentation separation and lifecycle ownership; do not copy drone scene/effects |
| src/game/awareness.ts | Adapt accumulated-time scheduling; retain backlog instead of donor's dropping policy |
| src/game/controller.ts | Selection and queued-command boundary; independently express controls for specialists |
| src/game/three/stage.ts | Adapt renderer/scene/camera/resource-disposal structure; replace lighting, models and cinematic camera with unlit original-art orthographic view |
| src/ui/ (20 files) | Inspect responsive DOM layout/audio/speed/replay patterns; independently implement compact panels; no donor story/art/content |
| tools/arena.ts | Headless command/replay harness pattern; no LLM seats, relay or commander service imported |
| tools/balance.ts | Accelerated simulation validation pattern; no drone balance constants imported |
| .github/workflows/test.yml | Adopt isolated CI check pattern with current conversion-only tests |
| .github/workflows/pages.yml | Deliberately excluded: private builds must never be publicly deployed |

Materially adapted files mark their source in headers: `src/platform/clock.ts`, `src/sim/checksum.ts`, `src/sim/replay.ts`, `src/render/stage.ts`. No donor gameplay/content assets are incorporated. Pin/hash audit receipt for inspected files is private `.private/upstream-audit.json`.

Retain LICENSE and NOTICE in source distributions. Preserve attribution and modified-file markers. Retain Three.js and other bundled dependency license comments in generated JavaScript; minification is not a license exemption. Do not imply original GeneWars content is Apache licensed.

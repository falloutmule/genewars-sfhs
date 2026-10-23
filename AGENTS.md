# Direct GeneWars conversion

Preserve the neighboring preservation repository. This repository implements the direct conversion in TypeScript and Three.js using Battle Drones platform patterns. No drone game content belongs here. The original 24-mission campaign is the target; a development shell is not campaign acceptance.

Never commit, upload, publish or deploy original EA/Bullfrog files, decoded assets, proprietary text, private captures, private packs or private HTML builds. Keep them under `.private/` or `dist/`, both ignored. CI uses synthetic data only. Run `npm run leak:check` before commits and public preparation. No Pages deployment workflow.

Keep simulation independent from rendering. Commands, complete saves and replays must be deterministic. All rule deviations and provisional implementations must be documented; unknown original mechanics must not silently become invented defaults. Read docs/CURRENT_STATE.md before resuming.

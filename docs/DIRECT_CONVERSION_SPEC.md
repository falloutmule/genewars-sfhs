# Direct conversion product contract

The governing 23 October 2026 handoff selects Battle Drones as platform donor, TypeScript as simulation language, Three.js as renderer, original user-owned audiovisual content, and public code/private assets distribution. It supersedes the archived Rust frame-frontier assignment. Preserve the neighboring archive unchanged.

Final scope: all 24 original missions, original teams/specialists/buildings/resources/terrain/plants/species/hybrids/research/AI/Ethereals/scoring, reliable saves/replays, readable controls, mouse/keyboard/touch, and one standalone offline HTML. Skirmish/multiplayer follows dependable campaign operation. No replacement story, species, resources or campaign.

Architecture: serializable deterministic world → read-only view; commands validate and enter an ordered queue; fixed ticks are independent of display speed. Imported content is edition/hash identified and schema validated. Rendering, picking volumes, camera and audio are presentation concerns. No simulation state lives only in Three.js objects or the DOM.

Acceptance requires human-playable mission paths, original mechanic evidence, campaign starts/failures/wins/transitions, difficult save/reload points, replay equality, offline artifacts and real Galaxy S21 Ultra testing. Imported maps, a construction predicate, viewport emulation or a synthetic checksum do not satisfy campaign acceptance.

This foundation deliberately exposes a construction workbench rather than asserting a canonical playable mission. The scope remains the complete campaign; see CURRENT_STATE.md for the unimplemented work.

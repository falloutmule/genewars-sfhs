# Save and replay formats

Save version 1 is JSON `{version,world,session,checksum}`. Zod validates the envelope and world; wrong versions, engine versions, content hashes, malformed fields, duplicate IDs, invalid pending-command timing/sequence and checksum mismatches are refused. There is no earlier released save schema to migrate. Future schema changes must add explicit migrations or a clear incompatibility message; never silently drop fields.

The complete implemented authoritative state includes tick, next entity ID, next command sequence, content hash, mission/mode, reserved deterministic seed, outcome, GOOP, completed counts, owned selectors, pending future commands, specialist skills/positions/orders/routes/reasons, construction progress/health, blocked cells and alerts. Session includes pause, display speed and fractional clock accumulator. It does not include original gameplay systems that have not been implemented. Imported source bytes are content, not saves. No compatibility with DOS saves or archived callback fixtures is claimed.

FNV-1a over canonical UTF-8 JSON detects accidental corruption/drift; it is not authentication. SHA-256 identifies the content pack. Three manual localStorage slots and four rotating recovery slots are namespaced `gw:`. Write the next recovery slot before updating its head, so a write failure preserves prior slots. Recovery tries older compatible slots if the latest is corrupt. Export saves when browser storage is unavailable. Clearing browser storage removes local slots.

Autosave points currently: workbench start, every 300 ticks, menu exit, pagehide and visibility backgrounding. Original mission completion/campaign transitions are not implemented and therefore not claimed as save points.

Replay v1 records engine/content version, a complete initial authoritative snapshot, each command with issued tick and target tick, periodic complete-state hashes, final tick and final hash. Issued tick is necessary because queuing a future command changes the current authoritative state. Final paused-tick commands are included. Missing/unreachable records and checksum drift fail. A loaded save starts a new replay segment at that complete state.

Browser render state, input capture, camera and audio are excluded from authoritative checksums. The harness uses temporary local objects and never touches normal saves.

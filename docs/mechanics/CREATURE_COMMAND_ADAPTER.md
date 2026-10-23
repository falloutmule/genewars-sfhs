# Campaign creature command bindings

`campaign/creature-command-adapter.ts` binds the released81C60/5DF50,
5CC60/5C920,5D870 and5B580 bodies to current campaign native pools. It does
not activate strategic AI or change player-facing command ownership rules.

`executeStagedCampaignCreatureCommand(world,index,command,pack,services)` is
the entry for an already isolated whole-host transaction. Commands are
`release`, `move` (point,callerOwner,selectedPanelRefresh), `target` and
`interact` (target or null,force). The source receipt is returned unchanged.
The move caller's selected-player sound is appended to real audio state.
The panel-refresh request remains in the receipt for its presentation caller.

`executeCampaignCreatureCommand` owns a full-host clone, equal-image JSON
native alias restoration, execution and commit. A missing late service rolls
back every host root, including spatial chains, players, effects, audio,
scratch and RNG. Source returnfalse is a completed operation: its cancellation,
escape, timer and RNG afterimages commit. The staged entry never replaces
creature/player roots or retained target records, including the effect36
record that the shared retirement helper internally publishes as a copy.

Command bodies do not relocate7/9. Their escape and follow writes are orders;
ordinary motion later performs actual spatial relocation. Existing spatial
links are mirrored after command/cleanup. Specialist detach state is reflected
into the ordinary actor/builder motion view without clearing source caches.

## Concrete numeric host services

-6D390 resolves current retained creature124,plant49,specialist200,building67
 and effect81 records. An inactive record remains addressable. Live spatial
 queries use the existing intrusive chain and its existing validity checks.
-5B100 first tests attached virtual10 (native73bit1024).8B780 returns the last
 living creature in the chain and its count;8B7D0 tests effect17. State1 uses
 the actual referenced kind and live target cell/count; state10 compares its
 goal cell before the ordinary occupancy test. This is not a rectangular
 blocker estimate or a generic creature count.
-74160 reads the current terrain11bit0 and nine imported search samples,
 finds the first building in each chain, skips shape2 on sample ordinals4..8,
 and terminates if the first candidate fails the required native49 mask.
-74270 uses the shared exact Mule query with those imported samples, actual
 native physical39, completed mask1, source shape extents and current raw ANB
 frame height. `campaignBuildingAsset` provides logical resource binding for
 every admitted selector, including storage4; native process pointer bytes
 remain unresolved.
-43130 scans ascending source building slots: owner aggregate's64 slots or all
256 when runtimeModebit0 is set. It applies actual raw-player1/6E5 friendship,
 selector mask4 (=selector2), required flags0x18 (=nonzero unsigned material54
 and completion49bit0), then strict nearest736F0 terrain-distance selection.
0x18 is a flag mask, not a radius. Equal scores retain the first slot.
-49D30 uses `retireStagedSharedEffect` and the supplied real effect scheduler
 cleanup options, preserving unlink/reference cleanup, shared occupancy and
 missionPrefix3554. It is required only for a dead creature attached to36.

## Admitted data and guarded branches

`pack.creatureCommandRules` supplies the corpse deposit pair and the nine
footprint samples. Provenance-bearing service overrides support synthetic
tests. No original numeric anchor/table is hardcoded in this adapter. Corpse
anchor object3+457C is4bytes; sample order object3+60B8 is9bytes, indexing
signed-word pairs at object3+4564. The last source order entry255 is used;
it is not replaced with an inferred conventional neighboring sample.

The Mule4 requested speed comes from the existing admitted ecological rule.
Another species requires its actual virtual80 `requestedSpeed` port when the
command enters it. Carrier families outside the released1..5 reference kinds
remain explicit errors. A dead36 requires real `effectOptions`; a live36 does
not invent retirement. The43130 service path requires an actual0..3 player
aggregate; no fifth neutral player record is synthesized. No callbacks for
other species are implied here.

The accepted5D870 branches that copy an uninitialized source local95 require
`world.creatureCommandScratch[index]={value,provenance}` from a real serialized
caller prior. The adapter never substitutes zero or infers that byte from an
old native95. A campaign caller must retain that extension in its save format
before using such a branch; absent provenance is an atomic refusal.

## Evidence and verification

Preservation evidence is read-only: private `initial-creature` listings5B100,
8B780,8B7D0 and736F0; `terrain-map-refs`74160;
`command-resolver`74270; `building-loader-refs`43130, plus the released command
body evidence in `CREATURE_COMMANDS.md`. No original native program was run.

The ignored `creature-command-host-source.py` and
`verify-creature-command-host.ts` compare31 synthetic cases against13,898
interpreted static listing instructions, with matching5B100/74160/74270/43130
results. Cases cover chain order, pursuit, attachments, effect17, exact shape
and height edges, first-mask rejection, late shape2 samples, source index255,
owner/alliance scope, unsigned material and strict nearest ties. They use
actual admitted numeric tables privately; no proprietary fixtures are public.

Public regressions exercise real host arrays, source audio, false afterimages,
JSON continuation, missing scratch/table/anchor guards, actual effect36
cleanup and late failure rollback. This establishes the bounded command
binding family; it does not establish canonical mission acceptance (0/24).

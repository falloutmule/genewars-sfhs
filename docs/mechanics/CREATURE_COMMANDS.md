# Creature command bodies

`creature-commands.ts` independently implements81C60 admission/feedback,
5DF50 movement,5CC60 release with5C920 carrier cleanup,5D870 target directives,
and5B580 interaction. Staged functions mutate the supplied isolated world in
place. Native/player/retained-target replacement is rejected. A booleanfalse
source result can still have real cleanup or escape afterimages; callers must
retain those writes rather than treatingfalse as an uncommitted transaction.

The structural world owns the actual300 native124 records, ecology mirrors,
RNG, optional actual player1805 records and serialized caller scratch.
`executeCreatureCommand` clones the complete serializable host once and commits
after a complete body; late service failures leave the input unchanged.
`restoreCreatureCommandAliases` rebinds equal preserved native/ecology images
after JSON load, rejecting any unequal mirror instead of discarding bytes.
The staged entries require their caller to own full-host rollback.

Exports:

- `executeStagedCreatureMove` is81C60. Its source body uses the caller owner for
  selected-player feedback and adds no ownership test. Cold15, stun18,
  virtual68 corpse and97-bit1 block the command. Actual selected feedback uses
  primary component+69 and rate`100+((256-quality119)>>2)` with sourcebyte wrap.
- `moveStagedCreature` is5DF50. It preserves the state2 attachment branch,
  stores both command/anchor points, installs owned task7 and exact movement
  flags, and retains physical position, fractions and velocity.
- `releaseStagedCreatureAction` is5CC60. Stun returns first. It clears actual
  plant reservations and peer references, preserves an active carrier reference
  when required, and applies the native masks/timer reset.5C920 releases living
  carried creatures with one delay draw, then two escape draws only if occupied;
  specialists receive their exact state/flag changes. Corpse unloading tests
 74160's actual store anchor. Live effect36 attachments remain retained; dead
  carriers require actual49D30 retirement. Effect67 changes concretely to68.
- `targetStagedCreature` is5D870. It implements corpse and plant branches,
  trait/research gates, completed-building health admission, direct building
  service and43130 alternate service selection. It writes pending95 without
  inventing the subsequent5ED20 state. Original accepted branches that do not
  initialize stack-local95 require `creatureCommandScratch[index]` with an actual
  byte and provenance. This includes incompatible-gene building targets and
  already healthy completed targets. Missing provenance rejects atomically.
- `interactStagedCreature` is5B580. It releases previous work first, handles
  creature/specialist association, plants and force flag, nominated buildings,
  overlap escape, and null/attached-target fallback with source RNG order.

`mule.ts` has a narrow compatible refactor: `requestStagedOwnedMuleMove` retains
all ecology/native identities. The existing `requestOwnedMuleMove` remains its
atomic player-facing wrapper with the established ownership guard and receipt
shape. Its previous bounded carrier refusal remains explicit; complete source
state2/carrier commands use the new family with actual context.

Required lazy services and data are concrete boundaries: retained6D390 views;
actual virtual8C occupancy;74270 mask1 at current physical39;74160 mask0 corpse
footprint;10457C deposit offset;104DE0→104E12 building halfwidth;
104D1E[selector,grade] health;43130 owner aggregate/selector mask4/required flags0x18 selection;
other-species virtual80; and49D30 effect36 retirement when a carrier is dead.
Mule4 speed uses the existing admitted scalar rules. Foreign services must
operate on the supplied staged world and preserve held records. No missing
service is replaced with a successful acknowledgment. These command bodies do
not establish another species' runtime callback or the remaining strategic host
services, so strategic activation must keep its required-port guard.

Validation:28 new synthetic tests cover admission, ownership distinction,
feedback, plant/paired/carrier release, corpse anchor, effect36/67, delayed target
work, source scratch, building service/overlap, null/attached fallback,
identity preservation, unknown inputs, complete rollback and JSON continuation.
107 related TS tests and strict TypeScript pass. Private
`.private/creature-commands-conformance.json` compares46 frozen cases against
5,923 preserved static instructions and25,814 numeric actor/target/peer/specialist/
effect bytes; acceptance bits, feedback and RNG agree. Virtual80, occupancy,
74270/74160,43130 and effect49D30 retirement are explicit deterministic ports in
that comparison. The original instruction bodies and vtable contracts were
read from the admitted executable's preserved mapped listings; no original
program was run, and no proprietary fixtures are committed. Acceptance remains
0/24.

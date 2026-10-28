# Human creature input

`human-creature-commands.ts` implements the read-only6A760 classifier and the
81D30 target /82230 Stop packet consumers around the released creature command
bodies. Classification and packet execution are distinct. A queued/replayed
packet retains its original mode; execution does not classify the target again.

The source creature panel27AE0 permits an owned, living creature to produce a
target packet when gameplay is unpaused and its commit input is present. It
calls6A760 with the published hovered object, the force modifier and visibility
bypass false. The target packet contains creature index, target kind/index and
the mode byte. Its opcode occupies byte10 in the original queue record; the
decompiler's ushort-pointer `+5` is not byte5. Source1C120 dispatches packet17
to81D30 and packet19 to82230 for eligible human players, before world callbacks.
The modern command schema/producer owns human authority and structural bounds.
The numeric81D30 consumer itself adds no ownership test.

Classifier modes are0 none,1 interaction,2 forced interaction/research,3 species14
transport,4 material pickup,5 plant cutting and6 building repair/upgrade. It
uses actual104A64 component pairs, directed player alliance masks, target-cell
byte12, completed Recycling count604 and source research/quality gates. The
building health table is requested only on the repair path. Kind3 virtual68
reads signed retained blueprint26, rather than inferring health from actor state.
The logical retained pool supplies the vtable family after native kind6 is
cleared; all source kind tests still read the current byte6. Other unresolved
virtual68 families require an explicit service.

For actual Mule4 this gives mode5 on an uncut plant and mode4 on a cut plant.
A corpse gives mode4 only when the actor's player has a completed Recycling
Plant. Living enemies give mode1; a friendly living target requires force.
A healthy friendly Recycling Plant gives mode0: this family introduces no
remote material-transfer command. Material processing and the subsequent
owned-work callbacks are separate concrete simulation dependencies.

81D30 blocks cold15, stun18, corpse virtual68 and native97 bit0. A missing
retained target clears task120 and flag96 bit4. Mode1 installs its prefix, calls
5B580 and, on success, emits feedback before copying target command anchors;
on failure it clears the prefix task/bit while preserving the body's cleanup.
Mode2 copies anchors and emits feedback even when its forced5B580 returns false.
The other implemented modes call5D870 and install wrapper flags/task only on
its success. The source's uninitialized pending95 arms still require the
released command family's serialized byte/provenance; no zero is invented.
Mule4 execution and the ground combat extension below are admitted. Mode3's5D0E0 body and other species' runtime action
families remain explicit errors, even though their read-only classification is
expressed.

82230 acts only for argument0 and a nonzero task120. It calls5CC60, then clears
task120/flag96 bit4 even when stunned cleanup returned false. It does not move
the creature to its current position, change command anchors or emit feedback.
This common Stop path has no species check. Its retained-reference cleanup also
applies to Crabs and hybrids; target action admission belongs to the concrete mode family described below. Any required carrier services still remain explicit. Regression
coverage includes Crab1, CrabMule11 and MuleCrab22 mating, feeding, idle and stun
afterimages, including peer/plant reservation release and the preserved stun timer.
The optional selected-panel dirty receipt is presentation only. Pending95 can
precede the later work state, so stopping before states1/7/11 does not invent a
plant-reservation release that5CC60 did not perform.

The campaign adapter exports `classifyCampaignHumanMuleTarget`,
`issueStagedCampaignHumanMuleTarget`, `stopStagedCampaignHumanMule` and atomic
`issueCampaignHumanMuleTarget` / `stopCampaignHumanMule`. It binds actual retained
pools, raw caller1, terrain visibility, imported tables, source audio, specialist
motion mirrors and spatial links. Public entries clone the complete serializable
host, restore equal creature/ecology aliases after JSON load, and commit completed
false afterimages. A late unavailable service leaves every original root intact.
Staged entries require their caller to provide that transaction. Foreign services
must use the supplied staged world and preserve retained native/player identities.

Validation covers23 synthetic tests across the pure mechanic and campaign
adapter, including lazy gates, alliances, material/repair/species14 classification,
stale vtables, false afterimages, feedback order, real Stop, unavailable mode3,
late profile failure rollback and JSON continuation. Private closed-listing
comparison covers587 complete6A760/81D30/82230 cases,60,391 interpreted
instructions and1,401,712 numeric values, with zero differences in outputs,
native/player afterimages, feedback order or RNG. It includes all25 admitted
component rows, visibility/self/neutral gates, retained inactive records,
91 target packets and9 Stop paths. Virtual80 speed, occupancy, building collision
and service selection use explicit deterministic ports shared with the released
command-body comparison. The mapped instructions are interpreted as data; no
original program runs. Private fixtures and original bytes remain uncommitted.
This is mechanic conformance, not canonical campaign acceptance (0/24).

The phone creature panel now exposes attack targets for kind1 creatures, kind3 specialists and kind4 buildings. Each option must pass the existing6A760 classifier with force and visibility bypass disabled and return mode1. Dispatch checks the target again, queues the existing target-mule packet and records it through the ordinary replay path. The controls preserve source target eligibility, visibility and ownership checks. Material controls retain their existing classifier modes.

Ground combat packet modes1/2 now admit Crab1, CrabMule11 and MuleCrab22 for creature, specialist and building targets, alongside the existing Mule4 domain. This closes the old wrapper-only Mule4 rejection; the released5B580 ground action already retains the actual species and component row. No damage, speed, target classification, visibility or resource rule changes are introduced. Other non-Mule action modes and Bird/Dinosaur/Frog command families remain explicit boundaries, and the phone attack panel uses the same admitted combat domain.

Private verification under `.private/ground-creature-command-20261027/` compares144 complete81D30 packet cases against22,674 preserved instructions:345,552 numeric values plus feedback/anchor ordering and RNG agree. Cases cover all three newly admitted species, modes1/2, target kinds1/3/4, caller mismatch, missing targets, cold/stun/attached actor gates, flying-target refusal, occupancy and same-building escape. Requested speed, collision/occupancy and audio are declared matching primitive ports; no original executable is run. Public regressions cover ordinary species/target/mode combinations, excluded families/material modes, atomic rejection, and actual campaign queued input/save/replay.

A save imported after a source fix retains its complete genuine afterimage. Previously rejected command replays remain tied to their original clean artifact: expanded admission can legitimately change their historical result. An explicit zero-tick source bridge must validate that original replay against its recorded runtime, preserve the exact save hash and checksum, and verify the fresh imported baseline under the new clean artifact. It must not relabel a divergent old replay as a new-runtime pass.

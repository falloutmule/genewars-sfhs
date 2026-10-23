# Recycling Plant campaign binding

`stepStagedCampaignRecyclingPlant(world, slot, pack, services)` runs the
complete source `451F0` selector **4 / 0x04** callback inside an existing
isolated campaign transaction. `stepCampaignRecyclingPlant` supplies a
standalone `cloneEffectHost` / `commitEffectHost` transaction. Both return the
mechanic receipt plus retired logical IDs and the number of cleaned reference
bytes. The staged entry preserves the current native arrays, player records,
economy roots and building/player objects.

The host must dispatch the staged entry in the original owned-building
owner/slot sequence, before that owner's `437A0` aggregation. It must publish
the current economy energy, extra drain and power state to the building native
before entering. The callback includes ordinary upkeep, extra drain, power
loss warning, animation advancement and the common dirty/countdown tail;
running generic selector4 upkeep as well would double charge it.

The native record remains authoritative. Native **49 / 0x31** is a flags word:
completion `0x0001`, power `0x0004`, disabled `0x0040`, inactive operational
gate `0x0100`, capacity suppression `0x0840`, HQ suppression `0x0140`, and
collapse `0x0800`. Collapse requires its shared callback and is explicitly
rejected here. The economy extractor exhaustion projection uses `0x0200`,
separately from the callback's `0x0100` operational gate.

Native **51 / 0x33** is the Recycling Plant's pending material byte. It is
neither native49 nor an Extractor cycle. A frame-zero callback first deposits
that pending amount in player `4A7`, clamps it to the existing player `5E6`
capacity, clears native51 and calls actual `80780` with credit20. That service
updates the source credit counters, requests audio57 and attempts two unmarked
**60 / 0x3C** effects, interleaving the original caller and successful factory
RNG draws. Income bookkeeping owns any subsequent funds conversion. Full
effect capacity does not undo the deposit or credit.

Next, the imported processing offset identifies the current intrusive cell
chain. `selectRecyclingPlant` takes its first kind2 plant. If there is none,
`selectRecyclingCorpse` takes the greatest signed native104 word, strictly
above -128; ties retain the first chain entry. Corpses require signed state94
at least25 and native97 bit0 clear. The material payload uses native48 for a
plant, but only the low unsigned native104 byte for a corpse. Corpse research
uses the original species byte and the player's current HQ-derived cap.

Retirement is immediate `8ACC0` unlink, then `724C0` reference-kind cleanup,
native-kind clear and global family count decrement. The retired record's own
link operands remain retained. Normalized active state, plant order, creature
priors and command queues are updated at that point. A source-registry overlay
receives the same final native bytes. Plant recycling does **not** invoke
`6C780`: it does not add terrain resource, apply delayed plant retirement, or
decrement player `5FA`. An owned plant's source `5FA` and its normalized
`ownerPlantCounts` mirror can therefore outlive the active owned plant count.

Grade1/2 collection on the source cadence requires
`services.dispatchCollection(staged, slot, range)` to perform the actual
`8D7B0`/`8D930` scan and `14040` factory. Ranges are1024 and1536. Capacity
failure returns false, with no collection drain. True success adds16 before
the callback's ordinary extra-drain decrement. A missing service throws; no
collector is fabricated. Service callbacks must mutate only the supplied
staged world and retain held native/player arrays.

The asset and animation profile come from `pack.buildingRules` selector4
resource metadata and the corresponding imported ANB. No new original data or
art is embedded here. Tests use synthetic serialized building stages and the
actual plant, Mule and effect factory implementations. They exercise chain
order, both consumption paths, source owner counters, credit/capacity, staged
identities, cadence boundaries, late rollback and save/resume. These tests are
host integration evidence, not mission acceptance or an original-byte
conformance claim.

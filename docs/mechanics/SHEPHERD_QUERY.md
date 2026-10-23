# Shepherd hostile query and target virtuals

`shepherd-query.ts` implements the complete descriptor112748 callback58A70
with8D7B0/8D930 traversal. The descriptor admits only kind1 creatures. It skips
other shared identities, own/allied creatures (actual player6E5 alliance mask)
and virtual68 corpses. Stunned creatures remain eligible.736F0 scores actual
terrain elevation and source signed15-bit XY deltas. It selects strictly smaller
unsigned squared distance, preserving the first shared-chain tie. Radius limits
sampled cells; the source adds no separate candidate-radius cutoff.

`queryShepherdHostile(world,actor,radius,{cellOrder,creature})` returns an
actual retained native target or null. `cellOrder` must establish the complete
head→next chain. `creature` supplies each encountered actual124-byte record.
Two source direction RNG draws occur even for an empty search; a late unknown
record leaves RNG unchanged. The caller's ordinary full transaction still owns
service failure rollback. Neither callback may mutate state during the query.

`shepherdTargetVirtual58` and `shepherdTargetVirtual68` preserve the concrete
slots: Mule58 means state18 with positive signed108 stun timer; Mule68 means
state>=24. Specialist58 and building58 are false. Specialist68 reads signed
health26 from the actual retained36-byte blueprint; building68 reads signed
word43. These predicates must not be replaced with one shared dead flag.

`shepherdLineOfSight` accepts general1/3/4 targets and delegates to the proved
75890 numeric ray, using fresh terrain height at each endpoint and source
muzzle+1280. Its required obstacle callback is74270 mask1 with sampled height;
physical caches do not replace these caller heights.

Validation:11 synthetic tests cover RNG/order, ownership/alliance, species and
stun admission, corpse rejection, first ties, cell-edge radius behavior,
terrain-height ranking, wrap, late refusal, JSON continuation, exact virtuals
and general visibility. Private `.private/shepherd-query-conformance.json`
compares11 frozen cases with26,528 preserved8D7B0/8D930/58A70 instructions;
winner identities and RNG agree in every case. No original executable was run,
no original resource fixtures are committed, and campaign acceptance is0/24.

# Shepherd blast0/1 validation

`tests/shepherd-blast.test.ts` verifies the source0/1 extension owned by the
root conversion. Both effects use original ten-frame EFF animations, flags0,
zero holds, common audio6 and immediate4929C/4995A area work. Their successful
factories consume no RNG and retain the source slot's counter, fractions and
unused payload. Their later4B630 callbacks animate and retire; immediate area
work is not repeated.

The same source formulas apply with code0 or1. Radius is strictly less than
`(code+1)*64`. Ordinary creature damage is `(code+1)*6+8`; a kind3 instigator
makes it `(code+1)*24+16`. Specialist damage is `code*4+12`, or `code*2+6`
when the building parameter is nonzero. Building near/far damage remains
`code*8+8` / `code*4+4`, with the separate near threshold and exact forced
building index. Family7 receives1. Code0 still consumes an eligible plant
branch draw despite having no plant hit or ignition branch; code1 can damage
a plant by4 only on its actual roll. Ground impulse consumes one draw; airborne
impulse retains the source vertical8192 contribution without that draw.
Countdown reduction applies only above600. Traversal reads the current next
link after real damage, including recursive removal.

The19 new tests cover both factories, ten-frame lifetime, each numeric damage
family, strict radius, forced buildings and attribution, tracked Shepherd
counters, plant branches, impulse/order preservation, recursive next-link
mutation, missing services, shared publication, JSON continuation and rollback.
Two tests additionally run actual37/38 projectile aim/factory through the
campaign scheduler into blast0/1, `campaignBlastAreaContext`, real Mule damage
and real selector32 blood allocation. Their synthetic target is stationary,
matching its native velocity while the test steps only effects. The tests
verify retained native/player/binding aliases during damage and full save
continuation. A late invalid blood profile proves rollback of the complete
scheduler world and preservation of the original native-array identities.

New ignored evidence files preserve older reports:

- `.private/shepherd-blast-destruction-conformance.json`:2 factories and18 full
  6DF30/4B630 callbacks,18,232 static instructions and1,352 numeric bytes.
- `.private/shepherd-blast-area-conformance.json`:16 immediate-area cases,
  32,495 static instructions and1,488 numeric impulse/counter bytes plus
  exact ordered damage/plant ports, RNG and countdown.
- `.private/shepherd-blast-provenance.json`: admitted executable identity,
  pinned listing-memory/resource inputs and decoded original0/1 metadata.

All comparisons agree. The private area matrix treats target damage as an
explicit service boundary; it does not claim to implement every recursively
reached building/specialist/family7 callback. The public host tests establish
the concrete Mule/blood continuation and transactional failure behavior.
Actual recursive damage, source cleanup and shared allocation remain required
host services; missing services must fail rather than acknowledge damage.

68 related TS tests and strict TypeScript pass. No original program was run,
no original resource bytes were committed, and canonical campaign acceptance
remains0/24.

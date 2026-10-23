# Powered specialist threshold callback

`specialist-charge.ts` independently expresses the complete57860 callback.
Despite its position in the style3 charge path, this routine releases creature
references. It changes no specialist charge, energy, resource, timer, animation,
audio, effect or RNG state. There are no spatial queries or virtual service calls.

## API and numeric behavior

`planSpecialistCharge(targetNative200,creatureRecords300x124)` returns a
serializable, ordered list of byte writes. `applyStagedSpecialistCharge(world,index)`
validates the complete plan, then applies its writes in place. Every native row,
pool array and specialist object keeps its identity. Validation of a later row
cannot leave earlier references partially cleared. No whole-world clone is
needed because this callback has no interleaved external services.

The source walks all300 creature records in ascending index order, skipping only
records whose native kind6 equals0. There is no owner, species or corpse gate.
Each active row compares the specialist's retained kind6/index15 against these
five references:

| Reference index offset | Kind byte cleared on equality |
| ---------------------- | ----------------------------- |
| 77 (4D)                | 79                            |
| 80 (50)                | 82                            |
| 85 (55)                | 87                            |
| 88 (58)                | 90                            |
| 91 (5B)                | 93                            |

Only a matching last reference also clears mask02 in byte96, before clearing93.
Byte97 and every retained reference index remain unchanged. The source masks
away the high half of its word96 read, so nullable97 does not prevent deriving
the known low-byte result. Inactive rows and mismatched-reference indices are
not read unnecessarily. The retained target kind can be0 after retirement;
the literal equality and last-reference flag behavior still apply.

## Common callback and host binding

The existing57A10 envelope owns the source trigger: retained blueprint style3,
nonzero player610, charge115 below255, odd frame+index and physical inactivity.
It increments115 and calls this service only when that increment reaches224.
An unpowered specialist resets115 to0 in the common envelope;57860 itself does
not reset it. This service is reusable for every role and does not inspect role
category, blueprint, campaign progress or mission identity.

The host must supply the current actual300-row creature pool. Where live ecology
records are separate projections, overlay those current native arrays before
planning and apply the receipt to their corresponding backing rows without
replacing held arrays. Do not invoke57860 only on the normalized Mule list:
other active source creature rows must receive the same reference cleanup.
No additional energy, resource, query or effect port is needed. Host/render
integration is outside this module's scope.

## Evidence and checks

The read-only admitted executable has SHA-256
`4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba`.
Evidence is the complete57860..579A9 static instruction listing and the
57A10 threshold call at5836E..58377. Source data and fixtures remain private.

Sixteen synthetic tests cover all five references, all300 active rows,
owner/species/corpse independence, inactive and nullable fields, equality gates,
last-reference flags, retained inactive targets, array identity, late invalid
input rollback, JSON continuation and actual57A10 threshold/no-power/motion
gates. Six private closed instruction comparisons match224,400 numeric bytes
and unchanged RNG across116,910 static instructions. The callback has no stubbed
services in those comparisons. This bounded family proof is not a normal
campaign playthrough; canonical acceptance remains0/24.

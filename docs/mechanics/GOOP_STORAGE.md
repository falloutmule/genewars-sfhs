# Native GOOP storage allocation

`goop-storage.ts` implements source437A0 independently from the original
instructions. `planGoopStorageAllocation(records,player,currentPlayer,rules)`
returns a pure plan; `allocateStagedGoopStorage` validates the complete plan,
then applies its established writes in place. Inputs are the actual256×67
building pool, actual1805-byte player record and admitted economy capacity
profile. Mutable native/player identities and unknown retained bytes survive.
There are no generated stores, default resource amounts or repaired counts.

The source input pointer is player+4A1. That byte supplies the owner; signed
byte4A2 supplies the saved active-record count; signed32 player4A7 supplies
remaining GOOP. Scanning starts at owner*64 and advances by one native67 record.
Every nonzero native6 consumes one count, including nonstorage buildings.
Inactive gaps consume no count. Scanning stops before the next slot when either
the saved count or remaining GOOP is nonpositive. A malformed count that runs
past the actual256-record pool is an explicit failure, without partial writes.

Only selector4,11,13 participate. Source capacity is400*(grade+1),600 and
500*(grade+1) respectively, using the unsigned grade byte. These constants are
already independently admitted by `economy_profile.py`; the helper receives
that profile and validates the original linear grade relationship. Completion,
power and0100 suppression do not gate this allocation. Flags0040 or0800 set
capacity to0. With positive capacity, native54 receives the lesser of capacity
and remaining GOOP; remaining GOOP decreases by that amount.

At zero capacity, native54 is cleared unless0800 is set. A collapsed building
retains its previous54 bytes, even when disabled too. Once GOOP reaches0, all
later stores retain54, including disabled stores the loop never visits.
Initial zero or negative GOOP causes no storage writes. This is why a broad
clear-all-stores operation or an allocation based only on aggregate capacity
would change source behavior. Unknown54 bytes may be retained untouched or
overwritten only when this source branch establishes a value.

Positive leftovers are subtracted from player4A7. The player5F0 warning is set
to1000 only when currently0; existing signed16 values survive. The source
speech/UI branch runs only when the resulting warning is exactly1000 and the
owner is the current player. `noticeRequested` returns this real obligation;
the host resolves the original speech and UI service. This numeric family
consumes no RNG. Unused warning countdown is owned by the enclosing player pass.
No resource/money credit is part of storage allocation.

The receipt exposes visited slots, ordered54 writes, retained collapsed slots,
discarded GOOP, count remainder, optional warning write and notice request.
Applying the helper writes only54..57 on selected buildings,4A7..4AA for actual
discard, and5F0..5F1 when the warning starts. A late unknown read cannot partly
clear a store or discard GOOP, because planning completes before application.

The source47F80 owner pass calls437A0 after that owner's ascending building
callbacks. Integrations should mirror these actual54 values into normalized
`storedGoop`,4A7 into GOOP and5F0 into the warning timer. Selector4's separate
451F0 callback already performs upkeep, branch logic, extra-drain decay and ANB.
Keep selector4 in power recipient/capacity/history sets, but run no second
upkeep or animation step. Original order relative to producers is meaningful.

Synthetic tests cover ascending gaps, all three storage selectors, partial and
exact fill, early retained fields, disabled/collapse distinction, incomplete
and0100 eligibility, unsigned grades, signed counts/GOOP/warnings, owner/current
player distinction, untouched bytes/aliases, late-failure rollback and JSON
continuation. The read-only source evidence is
`private/ghidra/mission-array-refs/instructions-000437a0.txt` and its decompile.
Private frozen comparison `goop-storage-conformance.json` covers21 cases,
3734 interpreted source-listing instructions and398097 equal native/player
bytes, with matching speech/UI requests. It uses the actual admitted numeric
capacity profile and explicit speech/UI boundaries. No original executable was
launched. Original fixtures remain ignored. This family does not establish
mission acceptance; canonical acceptance remains0/24.

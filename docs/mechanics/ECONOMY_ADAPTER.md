# Campaign economy owner/slot transaction

`stepCampaignEconomyBuildings(world,pack,services,contacts?)` returns the usual
`EconomyReceipt` and commits one isolated building/player phase. It uses real
source native67/player1805 records, imported rules, the shared200 effect pool
and current spatial links. It never substitutes a no-op Recycling Plant or
suppresses the old pure-economy storage guard.

The pure economy exposes optional lazy services in its cloned afterimage:
`beforeBuilding`, `buildingCallback`, `afterBuilding`, `allocateOwner`,
`afterOwner`, and a lazy contact-resolution predicate. Callbacks run in owner
then native slot order. Each owner's allocation/warning pass runs before the
next owner's first callback. Returning true from `buildingCallback` means the
entire native callback ran, including upkeep/common tail/ANB; generic numeric
work is skipped. Returning true from `allocateOwner` replaces bounded generic
storage with the actual source437A0 operation. Missing/declined services retain
the existing `additional-storage-allocation-required` failure. Late exceptions
return an atomic economy failure instead of mutating input state.

The campaign adapter binds these services inside one `cloneEffectHost`
transaction. Existing typed host copies are respected; additional concrete
native/carry roots are copied only when still shared with the input. In-place
selector4 calls retain native, player, building and economy identities inside
the staged transaction. Publication occurs after every required service passes.
An error after an earlier deposit, retirement, audio request, RNG draw, packet
factory or native54 write rolls back the whole adapter operation.

At each actual building position:

1. Current economic player fields and building energy/extra-drain/power are
   mirrored into actual raw records. Unrelated flags, retained51 and unknown
   priors are preserved.
2. Completed3/6 producers consume their source pulse draw and advance original
   ANB/audio at this position. Their numeric generation/distribution follows.
3. A required Extractor contact pass creates the actual smoke factory before
   its ordered creature queries. The host resolves living virtual callbacks
   through `contacts.resolve`; omission keeps the existing explicit refusal.
   A known already-resolved callback can be supplied through `resolvedIds`.
4. Selector4 calls `stepStagedCampaignRecyclingPlant` once. It includes its own
   upkeep, consuming/depositing/research, credit20, cross-pool effects and ANB.
   It remains in the economy's recipient, capacity and history sets. No generic
   second upkeep runs.
5. Other native host callbacks are delegated to `dispatchBuilding`. The root
   binds its existing whole Genepod callback and common incomplete callback,
   returning true. A missing unsupported callback explicitly fails. Generic
   completed3/6/11 numeric work runs only when the host returns false.
6. Immediately after a producer, `applyPowerBuildingEvents` allocates real
   packet33 slots, preserving source fractions, updates occupancy/count and
   spatial links, and makes them visible to later callbacks. Delivery still
   belongs to the later effect scheduler. Incomplete source ANB is read back
   into retained producer views so a later synchronization cannot overwrite it.

After each owner, `allocateStagedGoopStorage` executes the full source437A0
scan. Actual54 values, including retained later stores, mirror into normalized
storage; raw4A7 and5F0 mirror into GOOP/warning. Existing player warning
maintenance then runs and its raw afterimage is preserved. Source unused-GOOP
speech/UI requests are returned as notice events. Resource bytes are published
to terrain only as part of the successful complete transaction.

The caller must remove the earlier separate producer RNG/Genepod/incomplete/
contact prepass and final `applyPowerBuildingEvents` call. Running both would
duplicate source work. The root still owns journal rendering and extraction
audio-event dispatch. Recycling receipts are carried in typed `recycling`
economy events. Source80780's credit20 updates raw13/17 income/balance fields;
this adapter does not invent a direct increase to construction funds4A3.

Tests exercise interleaving across shuffled buildings, owner allocation before
the next owner's callback, live packet visibility, exact one-time selector4,
retained native54, lazy contact gates after a deposit, late native/contact
rollback, real smoke/RNG ordering, incomplete ANB preservation, JSON continuation
and unchanged default storage guards. Source arithmetic proofs remain the
separate building-startup and GOOP-storage comparisons.

Existing explicit boundaries remain: producer grade/flag admission, missing
living Extractor virtual callbacks, unadmitted packet/smoke full-pool priority
replacement, and missing Recycling Plant collector14040 service on an entered
grade1/2 cadence. No failure is converted into a passive callback or fabricated
factory success. Broader Extractor disabled/depletion numeric semantics are the
existing generic family; this integration preserves its established profile and
does not claim a new whole451F0 proof for all selectors. Canonical mission
acceptance remains0/24.

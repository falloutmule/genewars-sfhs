# Genepod production input814A0

`mechanics/genepod-command.ts` implements the numeric opcode12 input handler814A0 for all25 admitted species cost rows. `campaign/strategic-production-adapter.ts` binds it to the concrete36920 strategic production request. Canonical campaign acceptance remains0/24.

## Boundaries

814A0 consumes three signed packet words: species at0, global building index at2 and start/cancel parameter at4. Any nonzero parameter starts; zero cancels. It reads the signed cost dword at species row+32 (source10461C+45×species). The existing hash-admitted `ecologyRules.speciesTraits` supplies all25 complete45-byte rows. No additional import, copied original payload or inferred cost is needed.

Readiness, ownership, species-list/research, cash sufficiency, recorded-payer and UI interaction checks belong to the human producer21E20 or the strategic caller36920. The handler does not repeat them. Its numeric implementation deliberately accepts a bounded retained building record without adding native-kind, selector, flag, frame, funds, research, population or capacity gates. The campaign strategic adapter validates its actual owned Genepod binding and the exact typed36920 request before dispatch; it does not impose the human producer's gameplay admission.

The strategic caller's real eleven-byte packet is encoded by `genepodCommandPacket`. Its unused bytes6..9 remain explicit nulls. The handler reads only the three consumed words, retaining every unused byte and unrelated native field.

## Numeric behavior

On start, grade uses the x86 five-bit shift count. The signed cost arithmetic-shifts into native remaining54, its low word is copied to52, and species goes to51. The handler debits only `cost & ((1 << grade) - 1)` immediately, cash first and then GOOP, with signed32-bit wrap. It does not charge the full production cost at input time.

Computer refill resolves player+4A1 to the actual subowner's player type byte2. If that type is nonzero and the request player's signed cash-plus-GOOP is at most1000, request-player GOOP becomes1000. This check is separate from the final top-level human-type check. Only a top-level human player copies its actual byte1 to native payer58. Computer commands retain payer58, including its prior unknown value.

On cancel, refund is `(signedWord(native52) - signedDword(native54)) * (1 << grade) + remainder`, with exact32-bit wrapping. GOOP-plus-refund compares to capacity as unsigned32-bit values. Equality takes the capacity branch; excess goes to cash. Only native54 is cleared. Species51 and initial work52 remain retained. Cancel performs no computer refill.

814A0 consumes no RNG, emits no production audio and allocates no creature or effect. Its optional21D70 panel refresh is represented by `panelRefreshRequested`, conditioned on a real host-supplied complete presentation predicate and only on start. The static comparison records this presentation call as a separate receipt; it does not substitute any gameplay callback.

## API and host binding

- `applyStagedGenepodCommand(state, player, packet, context)` mutates held native/player images in the caller's complete transaction and returns a numeric receipt.
- `applyGenepodCommand` independently copies the numeric player/building arrays and returns `{state, receipt}`. Failure leaves its input untouched.
- `applyStagedCampaignProduction(world, pack, strategicState, request, options?)` verifies actual shared bindings, dispatches the handler and refreshes the affected campaign/economy balances from resulting raw bytes. It never writes stale normalized balances into raw state before dispatch.
- `makeCampaignStrategicProductionService(world, pack, options?)` returns `StrategicProductionContext.requestProduction`, acknowledging the exact request after real dispatch. Its world must be the current staged world, and its strategic state must retain that world's native/player/RNG aliases.

The adapter retains the native pool, every native record, player records and shared RNG object. A presentation observer replacing them is rejected. The outer full-host transaction owns rollback for such a late error. The adapter has no independent partial commit and does not touch the existing human producer or birth callback.

The existing completed Genepod lifecycle still explicitly admits its implemented Mule/grade0 birth family. An admitted numeric hybrid request does not establish its later birth factory, animation, lifecycle or resource family. Those guards remain actual requirements rather than a fabricated successful birth.

## Evidence and verification

The authoritative read-only evidence is `private/ghidra/mission-array-refs/instructions-000814a0.txt` (814A0..81619), cross-checked with the companion decompilation. The listing is authoritative for signed arithmetic, subowner type lookup, unsigned refund capacity and retained computer payer.

Fourteen public numeric tests cover exact packet/unknown bytes, all25 admitted species, absence of invented producer gates, signed shifts/costs, partial debit, subowner refill, signed sum overflow, human/computer payer, cancellation/refund/cap/equality, retained native identity and atomic missing-input failure. Eight adapter tests cover concrete36920 submission, stale normalized balances, held state identity, no birth synthesis, presentation receipts, JSON reload/rebind and missing/replaced bindings.

The ignored private independent arithmetic model executes the preserved instructions as data, never the original program. All108 cases match786,456 numeric values across all four player records, retained native record and RNG, using7,379 listing-model instructions. The source fixture SHA-256 is `4acf5831c6036c5c520563af6f25c2269f92b01b433cc7a53900ae33264ddcdc`. Actual25-species tables remain private; public tests use synthetic tables.21D70 is a presentation-only receipt port outside the numeric-body comparison.

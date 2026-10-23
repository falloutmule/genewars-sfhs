# Strategic AI campaign host

`campaign/strategic-adapter.ts` binds the released numeric strategic family to
the current campaign pools. `stepStagedCampaignStrategy` runs within an existing
isolated callback; `stepCampaignStrategy` clones the complete host, then commits
only after every participating computer player succeeds. Neither entry accepts
replacement planner or readiness providers.

`campaignStrategicServices` composes the real creature assignment/directives,
group maintenance, attack planning, settlement survey, production, specialist
planning, Engineer site planning, role commands, recruitment and landing
factories. Its creature/role command adapters retain explicit errors for concrete
downstream branches that lack an admitted profile or implementation. A successful
planning receipt is not evidence of payment, readiness or creature birth.

The context uses actual terrain, native records, logical resource bindings,
intrusive cell order, player records, retained AI state and shared RNG. Staged
service checks preserve the identities of those held records. Publishing updates
the serialized planner cache and auxiliary control projection, then refreshes
normalized player/economy balances from the resulting raw bytes. The strategic
phase does not route AI production through the human producer panel gates.

## Frame and phase order

The preserved static call sites establish this order:

1. Main `1BD36` calls `70B00`. That function calls input polling `70E40` at
   `70B78`, applies the flag/runtime-mode gates, and calls `37870` at `70BBD` for
   active computer players in ascending order.
2. Main `1BD3B` calls `1C120`, which dispatches queued human packets. Examples
   include `814A0` at `1C5C6` and `81C60` at `1C5D4`.
3. After packet dispatch completes, `1C760` calls zones `7A280`, followed by
   specialists `58780` at `1C76D`, buildings `47F80` at `1C778`, creatures
   `6A540` at `1C785`, plants `6D0B0` at `1C790`, countdown `13780` at `1C79D`,
   visitors `14EC0` at `1C7A8`, family7 `4F580` at `1C7B4`, shared effects
   `4E950` at `1C7C0`, craters `79220` at `1C7CA`, and results `72ED0` at
   `1C7D4`.
4. Main `1BD4F` increments the source frame only after those calls.

Therefore AI receives the current `world.frame`, independently of the replay
tick. It runs before queued game commands; zones observe their resulting writes.
The host's native/view synchronization is bookkeeping around those phases and
does not insert a second movement, animation or construction callback.

Static evidence is the read-only preserved Ghidra listings
`font-menu-state/instructions-0001bbc0.txt`, the `input-scheduling` `70B00`
listing, and `ui-command-queue-refs` `1C120` listing. These are source inspection,
not execution of the original program.

## Integration verification

`tests/strategic-adapter.test.ts` uses public synthetic content and explicit
synthetic saved-state inputs from `tests/fixtures/campaign-strategic.ts`. It
retains all concrete planner, spatial, constructor and command implementations.
The fixture supplies numeric tables and real logical bindings; obstacle ports
use the actual campaign building query. Read-only profile getters observe phase
ordering without replacing callback bodies.

The tests cover:

- Ascending computer players, frame-zero complete dispatch, current-frame
  cadence, runtime gates and the human-only early return.
- Real specialist allocation, roster/native binding, shared landing allocation
  and source pool counts; recruits remain unready pending actual landing.
- Real `36920` to `814A0` production with zero initial computer funds, actual
  partial debit/refill, one candidate RNG draw and no fabricated birth.
- A late absent species-cost profile after the first player's real recruit and
  landing mutations. The standalone transaction preserves the entire original
  host checksum and retained roots on failure.
- AI-before-command and command-before-zone ordering, observed using an actual
  queued human production command and the real inactive-zone callback.
- Ordinary host stepping, a recorded human command, JSON save/load continuation,
  replay, native pools, AI storage and shared RNG.

These synthetic integration tests do not establish original mission acceptance.
Closed per-family literal comparisons are documented in their respective
mechanic files; they remain distinct from an integrated campaign conformance
run. Missing concrete profiles/actions must still fail explicitly. No canonical
mission count is advanced by this test suite.

# Mule corpse and BONES lifecycle

`stepOwnedMule` and `stepNeutralMule` in `src/sim/mechanics/mule.ts` now share source-backed corpse acquisition, arrival, consumption and final retirement. They stage ecology, terrain and RNG together. Missing concrete source inputs or an unsupported live-prey branch reject atomically. This extends [OWNED_MULE.md](OWNED_MULE.md); it does not establish a complete mission.

The shared food scorer admits species4 corpses in states24/25 with the original reservation-weight reduction. Food can cross owner boundaries. Mixed plant/corpse ties follow the actual shared cell order, and the query consumes the same two RNG draws. BONES states26/27 are not newly published by that food scorer; an already associated corpse can enter those states before arrival. Corpse acquisition writes the logical kind1 target and association without overwriting the retained literal goal. Retained tasks also receive the original saved target.

Arrival selects feeding state5 for corpses or state4 for BONES, reserves the target and updates the source timer, anchor and movement flags. A missing target returns through the original wait. A kind1 target that is still alive requires the hostile interaction family and rejects explicitly.

On the original sixteen-callback cadence, BONES consumption removes2 target reserve and supplies nutrition amount2. Rich-corpse consumption removes6 target reserve and supplies amount12. The admitted source Mule nutrition coefficients are each100: nutrition therefore gains4 or24 reserve respectively. Young actors spend twice that gain in energy; mature actors retain their energy before the common natural tick. Arithmetic keeps the original signed-word behavior. The full predicate is strictly greater than maximum reserve, so exactly reaching capacity does not end feeding yet.

A state5 corpse at or below half its maximum reserve is abandoned. Its reservation is released and the association survives the task release. Full BONES and low-corpse abandonment use the original base20 wait; full rich-corpse feeding and a missing feeding target use base10. State4 release retains its distinct original reservation behavior. Consumption reaching zero does not immediately remove the target: normal death/BONES callbacks still advance through state27 and retirement.

Rich-corpse consumption makes its two query draws followed by exactly three particle-parameter draws. It emits `mule-effect` code32 at the current source position and physical height, with original speed/pitch/yaw parameters. The source RNG returns a high byte, so every possible yaw is an unchanged multiple of8 from0 through2040. No wider fabricated RNG range or new draw is admitted.

## Shared effect factory

`src/sim/campaign/mule-effects.ts` exports:

- `createMuleConsumptionEffect(prior,slot,request,terrain,pack)`: the original code32 numeric factory from an actual inactive81-byte prior. It requires admitted motion tables and EFF selector32 metadata, preserves retained fractions/counter/opaque bytes, initializes the ten-frame zero-hold effect and consumes no RNG.
- `consumeMuleEffects(world,events,pack,options)`: an atomic batch adapter for the actual shared200-slot pool, stable spatial identities and source counter3554. It uses the lowest free slot, or the first maximal strictly worse priority while skipping protected newborns. Failure to find a replaceable slot is the original null factory, returned in `failedFactories`.

The adapter requires `options.cleanupReferences` on the complete staged host. Replacement unlinks the previous effect, performs cross-family724C0 cleanup while its kind is still5, clears its kind and reuses that same stable slot. Logical links are synchronized back to all supplied native images. Active landing/water/economy mirrors are retired with the replaced slot. Actual live selectors outside the established priority set require `options.priority`; unknown priority does not become a guessed default. Special source49D30 retirement for selector17 or selector49 status1/2 requires `options.onSpecialRetirement` so its host continuation is not dropped.

The result records created native images, null factories, retired effect identities, cleanup byte counts and count delta. All requests in a batch commit together; a later missing prior or failed cleanup also rolls back earlier staged factories. Root integration consumes the events after each Mule callback without drawing RNG again.

## Final creature retirement

The state27 zero-reserve callback performs the creature portion of724C0 over every live Mule before clearing the retiring actor kind. Only matching reference-kind bytes are cleared; stale index operands remain, and matching carrier references also clear their source flag. Unknown numeric reference fields reject. The retiring actor retains its own old intrusive link bytes until the host unlinks it.

`mule-retired.retirement` supplies the real cleanup target `{index,kind:1}`, count decrement, display phase11, portrait refresh and module cleanup requests. The host must unlink the source0 identity, clean every other family, update the actual creature count and apply presentation/module work. The callback does not fabricate an external record, resource pointer or host acknowledgement.

## Evidence and verification

The original5ED20 corpse/BONES and mortality branches,5C730 nutrition,5B580 acquisition,5CC60 release,48790 factory,1F070 numeric constructor,49D30 retirement and724C0 cleanup listings were inspected read-only alongside the preserved Rust contracts. The three nutrition coefficients were checked in the admitted executable's mapped object3. No original executable or next-refusal probe was run.

Eighteen already complete private source callback captures match15,416 compared numeric bytes plus RNG and terrain effects: corpse acquisition/arrival, low-corpse abandonment, BONES arrival/feeding/loss, and two final retirements. Intrusive links0..5 and logical pointers31..38 remain host-owned comparison exclusions. There is no complete rich-corpse processing capture in this evidence set; that branch is covered by the original listing and synthetic semantic tests.

The focused suite passes48 tests across owned Mule, neutral Mule, Genepod and Mule effects. New tests cover target kinds, retained task goals, corpse/BONES arrival, rich and bone nutrition, strict capacity, reservation release, young energy cost, final reference cleanup, all256 source yaw draws, retained factory bytes, priority replacement, null factories, exact count/RNG behavior and batch rollback. Strict TypeScript checking passes. Private fixtures and receipts stay ignored under `.private/`.

Remaining Mule boundaries are live hostile interactions/non-Mule species scoring, carrier attachments, low-temperature continuation, code11 neighborhood escape and owned processing-building actions. Whole mission failure, alternative strategy, UI, save/replay and all24 mission gates remain separate acceptance work; canonical acceptance is not promoted by this family.

# Source-backed water effects

`water.ts` implements original effect selectors `0x15` (rising bubble), `0x16` (child surface particle), and `0x30` (stationary wake). `water-adapter.ts` connects those callbacks to the actual 200-slot family-4 pool, common spatial lists, logical reference cleanup and EFF resources. These effects consume no RNG.

## API

- `makeWaterEffect(slot,request,nativePrior,context)` and `updateWaterEffect(effect,context)` are pure staged numeric operations. `retireWaterEffect(effect)` clears its native kind and retains the numeric afterimage.
- `createWaterEffect(world,request,pack,options?)` and `consumeMuleWaterEvents(world,events,pack,options?)` commit ordered factories atomically. A request contains `{code,owner,position,height,angles}`.
- `stepWaterEffects(world,pack,options?)` runs ascending water callbacks, then each marked child once in the source newborn pass.
- Options contain the actual `obstacleAt(position)` predicate for moving particles and `cleanupReferences(stagedWorld,logicalId)` for the host's original reference-kind cleanup. Missing collision queries reject moving-particle callbacks. Missing cleanup produces an explicit `cleanupRequired` receipt; it does not certify complete retirement.

`WaterAdapterWorld` structurally uses `waterEffects`, `powerEffects`, `spatial`, `terrain`, `rng`, `source`, and `frame`. It also accepts `landings` for real smoke/departure replacement, and `ecology.mules.native` for cleanup. The adapter stages water, shared slots, map links, numeric terrain, landing particles, Mule native records, and imported entity native overlays. The immutable imported source buffers remain untouched. A late error rolls back all staged roots.

Receipts report `created`, `failedFactories`, `retired`, `audio`, `primary`, `newborn`, `cleanedReferenceBytes`, and `cleanupRequired`. Root callers own actual audio submission. A wake requests channel `0x3B`, mode 2, parameter 0, volume 127 and range 100 only when its factory succeeds.

## Factory and callback behavior

The current shared slot must supply an 81-byte numeric `nativePrior`, with logical/null pointer gap, original animation counter byte `0x1E`, and fractional XY bytes `67/68`. Counter and fractions survive factory reuse. Shared power/landing adapters update those priors after their own callbacks and retirement. No absent counter is replaced by zero. Untouched bytes, including retained reference operands, remain explicit numeric or unknown values.

Factories take the first free source slot. When full, the established original selectors use strict greatest-priority selection above the requested effect's priority, retaining the first equal-priority candidate and excluding newborn-bit records. Known water, power, landing, smoke and departure priorities are represented. Water or real landing-particle victims retire through spatial unlink and synchronous reference cleanup before reuse. An unknown selector or unsupported callback host rejects rather than inventing replacement behavior. If no eligible victim exists, the factory returns the source no-effect result without a draw.

Bubble/child physics follows source `6DF30`: signed-word acceleration and velocity, fixed-point XY and retained fractions, doubled terrain height/shade sampling, first impact bounce, grounded orientation/velocity quantization and second ground sample, signed 15-bit coordinate wrapping. Gravity is not added to these zero-acceleration water factories. The original `74270` collision query is required at the actual flight or second grounded point. Entity collision response and positive impact damage remain explicit unsupported branches.

Animation requires the actual EFF profiles: two zero-hold frames for selector `0x15`, three for `0x16`, and twelve for animation 48 used by `0x30`. Bubble/child delay is zero; wake delay is two. The factory preserves the previous slot counter, which affects the first wake tick.

A rising bubble tests the original signed **raw** water word after movement. At the surface it attempts a child factory before its own retirement, even if the shared pool is still full. A successful child is marked newborn and receives exactly one callback in the second pass. An unsuccessful child factory does not prevent parent retirement. Slow grounded bubbles also retire. A child retires at its final frame after timer expiry. A wake skips physics and retires at the source final-frame/counter gate: 33 calls with prior counter zero, 35 with prior counter two. Retirement unlinks before `724C0` reference-kind cleanup, clears kind, releases occupancy, and preserves the final numeric state for reuse.

## Evidence and limits

The independently expressed implementation follows preserved `water_effect.rs`, `landing.rs`, `actor_world/effect_updates.rs`, and `landing_effect_lifecycle.rs`: source `48790/491CA` factories, `6DF30` physics, `4B3B0` child behavior, `49D30/724C0` retirement, and `4E950` two-pass scheduling. No original executable is executed and the preserved archive remains read-only.

Synthetic tests include the source golden bubble/child sequence (parent slot 0 height 1000 to 1016, child slot 1 frame 1, child retirement next callback), both wake-counter lifetimes, current shared priors, raw-water threshold, torus wrap, impact/grounded physics, full-pool no-victim and priority behavior, child-before-free capacity ordering, real typed cleanup, malformed profiles/requests, and rollback after child creation or cleanup failure.

The campaign host uses `stepEffectScheduler` to interleave landing, smoke, departure, power and water callbacks by their actual shared slot, followed by one counted newborn pass. `stepWaterEffects` remains a compatibility water-only composition; `stepWaterEffectAt` is its atomic one-slot port and `runWaterEffectCallback` runs inside the scheduler's enclosing staged transaction. The admitted behavior does not certify unknown selectors, collision responses, UI pointer cleanup outside the host's represented state, or all 24 missions.

# Building appearance 44 / 0x2C

Campaign appearance effects now run the complete common callback when terrain
height changes or the effect touches water. The existing factory and building
constructor retain their behavior. This does not broaden building selectors,
construction rules or the distinct completed-building callbacks.

`stepBuildingEffectRecord(native, rng, context)` returns the staged native
afterimage, retirement request, samples and obstacle queries. Its context supplies
the actual frame, terrain, motion tables, bounce coefficients, water height,
gravity, resource animation and reached obstacle-query service. The host supplies
the existing shared effect context. Descriptor-disabled child creation is an
explicit invariant; the callback neither allocates children nor draws RNG.

The callback follows 4B630:

1. Effect virtual slot 0x94 calls the already released 6DF30 numeric motion helper.
   Selector 44 uses its original no-gravity flags and immovable descriptor.
   Ground resampling, fractions, first-impact bounce, airborne speed cap and
   15-bit coordinate wrapping therefore follow the shared source rules.
2. The odd airborne 74270 mask 1 query still runs. The original descriptor disables
   the resulting impulse; the query itself is required when reached. Missing
   providers fail explicitly. The water-response descriptor is false, so water
   contact neither creates wake/bubble effects nor substitutes a retirement rule.
3. A nonnegative signed timer at byte 74 decrements, then the original nine zero-hold
   EFF44 frames advance through 7AC00, retaining signed counter 30 semantics.
4. Mode 0 requests retirement only when the timer is negative and animation has
   reached its terminal frame. Selector 44 has no additional selector-specific
   tail and no child descriptor.

The scheduler publishes the resulting point through the existing shared
publication helper before retirement. This retains the actual relinked native
headers even when motion and retirement occur in the same callback. The existing
49D30 path unlinks and runs 724C0/reference cleanup before clearing native kind 6.
Any callback/provider failure rolls back the staged shared pass.

`stepBuildingEffect` remains a compatibility wrapper for an explicitly quiet,
level site. Campaign dispatch uses the complete record callback. The full entry
admits the original 44 factory flags, owner/slot, negative desired speed and
original animation profile; attached or unrelated physics domains stay guarded.

Synthetic tests cover raised/lowered ground, actual odd query timing, disabled
impulse, water materials 0/1, first bounce and ascent, speed cap/wrap, retained
priors, late query/cleanup rollback and normal campaign save continuation. The
normal host test records an ordinary roster-target command and verifies a full
sealed replay while the changed-ground appearance runs and retires.

Private closed listing comparisons use read-only preserved data and an
independent arithmetic interpreter; the original executable is not run:

- 256 complete numeric callbacks match 169,376 instruction steps and 18,432
  numeric bytes, including 26 retirements and 85 exact reached 74270 query plans.
  Scanner results are supplied as read-only ports; spatial/retirement calls are
  ports in this body comparison.
- 12 shared-host callbacks additionally execute the actual 8ACC0, 8AC60, 49D30 and
  724C0 bodies. They match 56,311 instruction steps, 2,760 effect/neighbor/reference
  numeric bytes and 2,752,512 map bytes, with exact global count/RNG results.
  The 74270 result and presentation/AI retirement hooks remain explicit ports.

These comparisons and synthetic host tests establish the bounded appearance
family. They do not accept a mission or establish additional effect families.

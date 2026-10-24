# Landing building query

`LandingContext.obstacle(point,physicalHeight)` is the actual74270 query with
mask1. The common6DF30 callback calls it after physics, before the code49
phase-specific particle draws, when `(frame + lowByte(slot)) & 1` is nonzero
and physical height minus ground is positive. Terrain contact and even
callbacks do not require this service. Missing service throws at the entered
branch; the shared scheduler's existing transaction rolls back the whole host.

The effect scheduler binds its existing `destructionObstacle` port to the
current staged host. The campaign's existing reward-factory options already
supply that port with `campaignAirborneBuilding(staged,pack,point,height)`, which
uses the actual74270 first-building traversal, mask1, shape and current ANB
height. Its boolean `obstacleAt` port does not provide the height contract and
is not used as a fallback. No new world binding is required.

A returned building does not deflect code49. The actual family4 vtable112254
maps virtual4 to1F260 (physical minus ground),70 to4B090 (true for code49),94
to6DF30 andA0 to4AF40. Code49 takes4AF40's ordinary branch, where virtual8
calls1E620 and reads the six-byte source descriptor's movable byte as0.
Therefore6DD50 is not called: there is no impulse, damage, child factory or
RNG draw. This is the complete numeric response, rather than treating a
non-null result as an unsupported collision. The previous preservation Rust
slice's null-obstacle precondition was a narrower admission boundary.

The same query executes during airborne departure because it precedes
phase dispatch in the source common callback. The source grounded contact
frame has zero physical-ground difference and skips it.

## Evidence and checks

Read-only evidence: source6DF30 at6E7C3..6E808,1F260,4B090,4AF40 and1E620;
vtable112254 and descriptor104EB4 +49×6 from the admitted executable mapping.
The code49 six-byte descriptor hash is
`b2d03123faa1da79bfedd31524d04b517d6baeacf32e2e68072adae153646dcb`.
Only its proven movable=0 behavior is expressed in the implementation; no
original descriptor bytes or resource tables are committed.

Ignored `landing-obstacle-source.py` and `verify-landing-obstacle.ts` compare
12 synthetic airborne cases against4,392 interpreted source instructions,
876 numeric native bytes and every query's point, physical height, mask and
result. Cases cover hit/null targets and multiple frame/slot parity
combinations. All match. Original native code was not executed.

Seven public tests cover these gates, source query before smoke/departure RNG,
identical hit/null numeric afterimages, the actual staged host binding and
missing-service rollback with held native identity preserved. Existing real
initial/reinforcement descent, save/replay and campaign tests cover the normal
host path. Selector64 parameter1, associated building updates and full-pool
smoke replacement are now separately bound and compared in
`HUMAN_RECRUITMENT_EFFECT.md`. Selector49 water environmental contact remains
explicit. These source comparisons do not establish canonical mission acceptance.

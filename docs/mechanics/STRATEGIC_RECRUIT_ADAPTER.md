# Campaign strategic recruitment

`campaign/strategic-recruit-adapter.ts` supplies real4FD30 and80830 ports to
`strategic-ai-recruit.ts`. It creates the source-selected specialist, logical
blueprint/resource binding, ordinary actor/render projection and Engineer
builder projection, followed by the real shared49 landing and eventual80AE0
activation. It does not enable the opponent scheduler or remove its guard.

## Entries and transactions

- `campaignStrategicRecruitServices(world,pack,specialistServices,events?)`
 returns the source recruit ports. Bind them to the same already staged host
 used by `bindCampaignStrategicState`.
- `prepareStagedCampaignStrategicRoster(world,owner,pack,specialistServices)`
 runs the complete32E60 family, publishes the strategic projections and returns
 its receipt plus concrete creation/capacity/activation events.
- `prepareCampaignStrategicRoster` owns one full-host clone and commits only
 after the complete family succeeds. Capacity failures are source results and
 commit their completed numeric writes; missing services/resources throw and
 roll back player/native/AI/spatial/audio/RNG state.
- `activateStagedCampaignSpecialists(world,owner,pack,specialistServices)` is
 the shared80AE0 entry for landing arrival or immediate deployment. It returns
 actual activated slots and accepted candidate points. Presentation notices
 remain the caller's responsibility.

Staged ports retain native200 arrays, raw1805 player arrays, native pool roots
and logical strategic bindings. Pure constructor/resource afterimages are
copied into the held native array. Landing replacement also preserves the
preallocation native81 array across real49D30 cleanup and publication. A
reused render/builder identity is updated in place; a new slot is appended.
Engineer actor and builder share their current motion object.

## Source order

The newly extracted `initializeSpecialistNative` is4FD30 alone. It takes the
actual prior, owner/player, selected slot/blueprint and current112D10 origin
with terrain ground/shade. It neither appends a roster nor executes80830 or
56E20. It preserves untouched counter30, desired speed63, fractions67/68,
command/reference fields and scratch148..191. Existing `createSpecialist`
reuses this constructor before its unchanged historical allocation and
deployment tail.32E60's core remains responsible for the single BP active bit,
roster append/count and AI69E increments.

80830(-1) visits the owner's five native slots in order, selects active
records whose native112bit0 is clear, marks113bit2, writes the raw-player9
point and22bit3, executes actual56E20 resource binding/scratch reset, then
sets frame27/delay29 to0,direction28 to1 and action25 to8. These writes occur
before a landing capacity attempt and survive a source capacity failure.

Ordinary7F3B0 uses raw-player9, actual terrain+25600, speed1088/pitch1024,
source49 shared allocation and current retained native81 priors. The existing
`createLanding` factory matches the admitted optional-argument-zero entry.
The adapter publishes actual shared spatial links/count3554, source cue50
mode2/parameter255/gain127/range180, and player496/498 reference. Only the
selected owner receives the source4096 reveal. No factory RNG is introduced.

For a human raw2=0,frame0 and nonzero mission counter1EC2,80830 invokes80AE0
immediately, then sets activation count49D to1. No landing is created.

## Activation and reinforcement

80AE0 selects active native slots with113bit2 set; it clears112word0401 bits
as source `(flags&FBFE)|1` and22bit3. Each candidate73E00 consumes one shared
draw at radius512 and retries actual83 terrain mask/8B130 plant weight. The
8B130 pass includes its native73bit0800 bypass and actual retained Botanist
target-cell exception. It does not add a building obstacle test to74CC0.

With no associated kind5 reference, the accepted candidate becomes7/9. With
an associated retained effect,7/9 becomes the carrier's current point; unless
113bit4 inhibits it, the accepted candidate is queued via actual57bit1,
mode5B=0,5C target and74A50 resolver into5C/0B, followed by the source51E80
cancellation gate. This is the same numeric move setter as80FC0. The actor's
cached physical/ground/shade/fractions/velocities are retained for its first
ordinary motion pass.

The helper inserts the actual spatial record, copies BP24 toBP27, sets BP32
bit1, increments BP28, sets first-activation Botanist114=40 and increments
player49D even when no slot qualified. Already-ready actors are not marked by
80830 and do not deploy again during reinforcement. No existing live actor
is duplicated or teleported to a new candidate.

## Explicit boundaries

The human raw2=0,frame>0,nonzero1EC2 branch of7F3B0 passes factory parameter1.
Source48CA4..48CE2 then sets payload3, scans selector64 records and changes the
factory's returned pointer. The concrete selector64 return/lifecycle family is
now bound through `recruitment-landing-adapter.ts`; see `HUMAN_ROSTER.md` and
`HUMAN_RECRUITMENT_EFFECT.md` for its separate proofs. An absent64 reaches an
explicit one-past source guard. Ordinary strategic opponents use raw2!=0.

Existing selector49 callbacks still reject water/environmental contact. Smoke
and departure children now use the real shared priority allocator, including
full-pool replacement and genuine capacity failure.
The main recruitment landing factory itself uses real shared priority
replacement and cleanup. Role cancellation services are required only if
80AE0 enters the actual native130/87bit0 cancellation gate; unavailable work
is an atomic failure through the standalone entry.

## Evidence and validation

Read-only preservation listings:4FD30/13EB0/1F480,56E20,80830,7F3B0,
48790/48C77..48D0D,80AE0,73E00,74CC0,8B130,74A50 and8AC60. The existing
landing factory/callback was also checked against the preserved numeric
`landing.rs` contract. Original native code was not executed.

Ignored `strategic-recruit-host-source.py` and
`verify-strategic-recruit-host.ts` compare14 synthetic constructor/activation
cases against5,509 interpreted static instructions and1,389,752 numeric bytes,
including full map/player/native afterimages and shared RNG. All match.
Constructor cases cover eight owner/slot/blueprint/prior combinations;
activation covers ordinary/associated/inhibited/not-pending and first/second
Botanist paths. Source runtime resource handles are logical bindings; no
proprietary bytes or fixtures are committed.

Public host tests cover allocation, held aliases, source capacity afterimages,
real effect replacement/cleanup, immediate and reinforcement activation,
resource failure rollback and save/reload through190 ordinary shared scheduler
callbacks. Canonical campaign acceptance remains0/24.

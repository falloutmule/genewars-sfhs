# Human recruitment marker and landing surface

The human reinforcement path uses the real shared selector49 (`0x31`)
parameter1 factory and selector64 (`0x40`) marker. The created carrier and the
factory's returned reference are different identities. The ordinary shared
effect scheduler runs their callbacks; recruitment does not substitute an AI
landing or activate the specialists at launch.

## Startup and factory identity

`72AD0 → 8AAE0` reads the unsigned mission-prefix dword at `1EC2`. A nonzero
value creates selector64, owner0, at the signed-word point `1C9A/1C9C`, at
actual terrain height, with zero angles, parameter0, delay0 and no parent.
Successful allocation reveals radius4096 around the actual allocated point.
This happens during mission initialization after zone creation. Packet9 only
changes the player's target point; it does not create a marker.

The common `48790` factory publishes selector49 before `48CA4..48CE2` scans
all200 records for the first byte69 equal to64. This scan does not test the
record's active kind. Parameter1 writes carrier payload76=3, writes the found
marker's payload76=1, and returns the marker's actual slot and kind. Audio50
also addresses that returned identity. The marker's retained index and numeric
priors are preserved, including when its kind is already0. An absent64 reaches
a one-past source pointer; the conversion reports this undefined source
boundary and rolls back the outer transaction.

The factory requests audio50 at the source initial rate180 percent through
`initialRatePercent`. Its historical `range:180` journal metadata is retained
for compatibility; the device consumes the explicit rate and does not treat
that legacy field as a playback rate or a second source argument.

`createStagedCampaignRecruitmentLanding` returns
`{allocatedSlot, returned:{slot,kind}}`. Its caller owns the `80830` prefix,
raw player496/498 publication, reveal and target writes. It accepts both real
parameter0 and parameter1. The associated branch supplies the original
building-relative point, building ground17 plus25600, and parent kind4.
`createStagedCampaignRecruitmentMarker` implements the separate startup call.
All staged functions mutate the caller's isolated host and preserve existing
selected-slot native arrays. Standalone wrappers commit only after success.

## Marker and carrier callbacks

Selector64 has the admitted mode6, gravity, movable and water-response
descriptor. It runs the ordinary `6DF30` numeric motion, terrain contact,
`74270/6DD50` obstacle response, real water21 (`0x15`) /48 (`0x30`) factories,
timer and EFF64 animation. Its five hold1 frames and expired timer never retire
it. Only payload76=1 reaches `4B7E5`: `4B3B0` creates the genuine generic
selector51 (`0x33`) at the current point and physical height, with the same
owner and zero angles/parameter/delay. Successful51 is marked newborn after
publication. Selector64 then retires even when51 allocation fails.

Generic51 is not limited to an Engineer parent or owner0. Its factory retains
untouched parent71..73 and payload76; its ordinary callback uses its admitted
23 hold0 frames, mode0, no gravity, immovable and no-water descriptor. The
existing Engineer feedback callback is shared without changing its older
wrapper behavior.

Selector49 phases1/2 with unsigned payload76 at least3 read the actual signed
player byte3. A nonzero count holds the timer and consumes no body RNG. At zero,
payload3 becomes2, larger payloads become1, and timer74 becomes75. Later signed
timer decrements expire at `<=0`. Phase1 departure explicitly writes native
angles `[0,0,512]`; phase2 emits smoke even with a positive timer at least50.
The scheduler allocates smoke6 (`0x06`) and departure47 (`0x2F`) immediately
through the real shared priority allocator. Failed capacity consumes no factory
delay draw. Successful factories publish before later calls and join the
ascending newborn pass. Cleanup failure rolls back the whole scheduler host.

Retiring64 does not clear raw player496/498. The later49 retirement clears498
and sets499 to700 unconditionally; retained496 survives. This permits source
overlap behavior and does not impose a same-slot condition.

## Associated building order and `75240`

The parent kind4 reference is resolved to its retained67-byte building record,
including after that record becomes inactive. Contact writes byte60=1 and
byte51=0 before immediate `80AE0` activation. Takeoff writes60=0 and51=0.
The ordinary `75240` tail uses B0/C0. Phase2→3 uses B1/C0. Final raw-player
reference/cooldown writes occur before B0/C1 and `49D30` cleanup. Parent native
fields and spatial links are published before recursive host services.

`updateLandingSite` implements the actual nine-cell surface operation, not
construction reservation or climate rebuilding. It uses the admitted eight
observable direction transitions, nine packed texture low bytes and nine
orientation bytes. The frame pulse is `(frame &31)<15`. Byte52 toggles on a
pulse mismatch, C1 sets52=0, and B1 sets54=1. The center texture is154 when54 is
nonzero, otherwise150. Other textures use their source row plus4 when52 is
nonzero. Each reached cell receives its orientation OR87 hexadecimal,
byte13=0 and `84E10`'s cell11 OR0C hexadecimal. Height, occupancy, climate and
unrelated native fields survive. The source's ninth direction read updates
an unused local after the last cell; the imported profile needs only eight
observable transitions.

`84E10 → 847D0` also invalidates the original viewport/cache/minimap. That
device cache is represented by a modern terrain revision increment. The
authoritative cell11 writes remain exact. The adapter mirrors touched stored
Goop and extractor cycle fields into the existing economy row in place.

## Evidence and boundaries

Public tests use synthetic data only. They cover factory return identity,
inactive64 selection, mode6 persistence, real owner2 feedback51, retained
player references, shared allocation/replacement/capacity false, late rollback,
JSON/full saves, ordinary host callbacks and sealed command replay. Site tests
cover wrap, frame boundaries, B/C combinations, status/activation/site ordering,
retained inactive parents and invalid-profile rollback.

Ignored closed arithmetic-listing comparisons read preserved listings and
admitted data. They never execute the original program. Factory64/51/49 and
whole64/51 callback cases compare current numeric bytes, RNG, real51 child
factories, return identity, terrain/obstacle/water branches and retirement.
Separate49 comparisons include real6/47 factories and associated caller order;
`75240/84E10` compares complete map afterimages. Spatial insertion/cleanup,
specialist activation, audio/device presentation and legacy viewport caching
are declared call ports, not claimed as covered whole-program execution.
Detailed counts, hashes and harnesses remain in the ignored private reports.

| Closed comparison | Cases | Interpreted instructions | Compared bytes |
| --- | ---: | ---: | ---: |
| 48790 factories and whole64/51 callbacks | 228 | 164,751 | 17,420 numeric |
| Whole49 callbacks, actual6/47 factories and associated call order | 144 | 122,206 | 16,880 numeric |
| 75240/84E10 complete map afterimages | 64 | 68,109 | 14,680,064 map |

All three comparisons have zero differences. The49 comparison also matches
all219 source RNG draws. The earlier32 (`0x20`) 63-callback and26 (`0x1A`)
eight-callback conformance suites pass again after the common-motion extension.

The existing49 model remains the established vertical carrier. It explicitly
rejects `ground <= water+320` pending that environmental family and requires
the actual parity/height obstacle query, associated building service and
parameter1 player-count service when reached. `7F3B0` does not itself reject
water points; the conversion does not invent a UI gate. Selector64's complete
flags0 motion path separately requires native desired=-1, zero XY acceleration,
forward animation/delay0 and its admitted descriptor/profile. Unknown numeric
priors or missing services fail explicitly. This family is synthetic/source
conformance evidence, not mission acceptance.

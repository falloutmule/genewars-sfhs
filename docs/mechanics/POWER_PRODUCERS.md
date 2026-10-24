# Distributor and Photon callbacks

`mechanics/power-producer.ts` implements the complete source451F0 numeric
Distributor3 and Photon6 callbacks for grades0/1/2, including their common tail
and actual7AC00 animation. `campaign/power-producer-adapter.ts` binds their real
shared33 factories, audio requests and current native/player/economy records.
The source67-byte building is authoritative. No original byte tables or assets
are included in public tests, and canonical mission acceptance remains0/24.

## Native state and ordering

Complete buildings without0040 pay imported104D10 upkeep plus unsigned extra
drain63. Both producer upkeep entries are0 in the admitted source build; this is
independent of grade. Incomplete and0040 buildings jump directly to the common
tail, including bypassing extra-drain decay. An operational producer also
requires0100 clear. Source0800 demolition remains the separately implemented
common callback and must run first.

Distributor generation is max(2,4×grade); energy caps at2000. It pulses at
`(frame &63)==16×grade` or a full reservoir. Photon adds actual mission solar
generation plus grade, and pulses at signed energy>=200. Both write signed16
player4AD and draw once on every pulse, including a pulse without recipients.
The RNG stream is shared with all other callbacks. Mod7/50 animation/audio
requests happen before target scanning and factories.

The real owner64-slot order determines selection and factory order. Distributor
range uses its own grade and excludes source selectors3/6/8/9 and0100 targets.
Photon selects completed Distributors using each recipient's own grade range;
it does not add the Distributor target-suppression test. Selection sets49 bit10,
Distributor writes its dword54 recipient count, and each mark clears before its
immediate factory. Signed Distributor division becomes an unsigned16 share,
capped to payload255; zero shares create no packets. Photon splits200. A
Distributor with no recipient retains energy; a pulsing Photon discards energy
even without recipients. No delivery or recipient energy credit occurs here.

Factories reuse the established shared allocator, priority replacement,
reference cleanup, retained slot priors, exact33 factory and intrusive linking.
The packet is published immediately before the next factory. Native counter30
and fractions67/68 survive slot reuse. Full capacity with no eligible replacement
raises an explicit error; the caller's whole transaction rolls back. Packet
motion, later4C8E6 delivery/decay and target retirement use the existing family.

After the selector work, the common tail decays drain63 when that source path
was entered, applies the suppressed/incomplete positive-energy decrement,
emits required stop35 requests, updates dirty21/timer48, and selects the native
action. Incomplete buildings use action0/frame47;0040 uses action4/frame46;
other completed buildings use action `grade+1`. Actual imported frame counts,
holds, flags, signed delays/direction and retained counter30 drive7AC00. The
implementation advances animation after immediate factories, rather than in a
producer prepass.

44F50 starts an upgrade by clearing completion, setting0100 and incrementing
target grade47. This uses incomplete action0.43F60 completion establishes the
new grade, frame0 and energy200 while retaining counter30, dirty48 and drain63.
The adapter refreshes those actual native priors before writing any normalized
view, so an old producer animation cannot undo Engineer completion.

## API and host transaction

`stepStagedNativePowerProducer(world,slot,context)` operates in place over the
256x67 pool, actual1805-byte players and shared RNG. Its context supplies
imported upkeep/mission solar, lazy resource profiles, immediate33 allocation,
audio requests and the explicit83140 presentation-request boundary. Services
must retain the held native/player records. Source pointer gaps remain null;
unrelated bytes, including unknown untouched fields, survive.

`stepStagedCampaignPowerProducer` is the ordinary owner-pass entry. It preserves
the existing native, player, building, economy and animation objects. Its
compatible economy events have `factoriesAlreadyApplied:true`; they must not be
fed to a second packet factory. `stepCampaignPowerProducer` is a standalone
whole-host atomic wrapper. A late missing animation or factory service preserves
the complete input world and its held arrays.

`refreshStagedCampaignPowerProducer` reads actual native state into the same
views. `resetStagedCampaignPowerGenerated` clears raw4AD and its normalized view
once at the actual owner482F2 start, including an empty owner pass. It does not
reset funds, GOOP or another owner's generation. The host retains47F80 owner/
slot order and one outer transaction, skips legacy producer prepasses and
generic/incomplete work for handled3/6 records, and runs shared effects later.

83140 is recorded as a presentation request before7AC00, with native slot0..255,
action0..4, frame0..255 and its original queue capacity256 explicitly exposed.
`originalQueueOutcome:"not-modeled"` means the source camera/frontscreen,
visibility and renderer-list admission are not synthesized. The modern renderer
reads current native state continuously. No successful original queue insertion
or device allocation is claimed. Audio events similarly record play/stop
requests, not playback status. Producers3/6 do not query97830.

## Content, evidence and boundaries

Existing b887/ced8 imports already contain every BPOWE/BSOLA action0..4, including
grade-specific lengths and holds. No profile/schema/pack change or fallback
animation delays are required. Previous packs, saves, replays, compatibility
APIs and proof receipts remain preserved. Original save checksums still precede
loading; this family adds no serialized root or migration.

Private comparisons cover409 complete451F0 callbacks and32 real44F50/441C0/
43F60 transition cases, totaling1,189,429 interpreted listing instructions and
110,410,876 compared bytes with zero differences. They compare all256 building
records,200 effects,4 players, the full229376-byte map, count, RNG and ordered
factory/audio/queue requests. Only native process-pointer/resource bytes31..38
are normalized. Every real running animation frame in every grade, hold3,
signed-counter boundaries, dense63-recipient scans and all32 preserved grade0
inputs are included. Actual48790/1F070/49E90/map linking and7AC00 run in the
listing arithmetic; audio/83140 are explicit presentation ports. Separate
transition capacity/reveal ports reuse already owned families. The original
executable is never launched.

The two new public suites cover21 synthetic cases, including priority
replacement/cleanup, no allocatable slot, lazy resource access, real later
delivery, JSON/save continuation and late full-host rollback. Root integration
tests separately exercise the ordinary combined owner pass and sealed replay.
These are development/source-family checks, not canonical mission acceptance.

Extractor11 remains a distinct mineral/contact/audio family. Its compatibility
behavior and explicit grade/contact/97830 boundaries are unchanged here. This
implementation also does not manufacture missing source assets, accept a stale
mark as a nonexistent building, or implement other selectors through a passive
producer fallback.

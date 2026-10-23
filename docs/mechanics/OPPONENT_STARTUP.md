# Campaign opponent initialization

`mechanics/opponent-startup.ts` implements the campaign computer-player branch
of source7D090 and the saved AI-record load performed by71B70. It does not run
strategic37870. The campaign host must bind that separate family before an
active opponent can take its first scheduled turn.

`loadOpponentStartupAI(extensionPayload)` accepts the exact6900-byte imported
CONQ extension. The importer excludes only the first four-byte sizeword. The
loader restores that word (`0x6BE`) and splits the complete6904-byte image into
four1726-byte records. It validates every record's sizeword and player byte4,
then names signed byte646 as `levelAdjustment`. All other source bytes remain
retained data; copying an AI record does not initialize or execute its orders.

`prepareOpponentStartup(playerRaw, input)` is a pure transaction over an actual
1805-byte player record. Inputs include the selected player's actual progress,
opponent target, source mode flags, matching AI record, admitted name/rule
tables, RNG and explicit reusable blueprint scratch bytes18/1B. The current
entry admits a source computer player with no existing specialists, in campaign
and nonnetwork mode. Existing specialist rosters and other modes require their
actual bindings rather than a fabricated replacement.

The plan preserves the7D090 order: set player identity, clear6E3, install the
mission target, assign2000 funds, regenerate20 blueprints unconditionally and
adjust progress. Generation uses7F580/7FAD0 category ordering and consumes64
draws through the existing blueprint family. It clears the first name byte of
all32 records while materializing every established field of the generated20.
Signed AI646 is added to selected progress, with the original sign-dependent
lower or upper bound. Other player data is retained.

Blueprint18/1B come from reused generator stack data. Numeric values supplied
with provenance are copied; explicit `null` leaves their offsets listed in
`unresolvedPlayerOffsets` and in blueprint `unresolved`. At those offsets the
returned raw byte is a retained placeholder, not an asserted generator value.
Names use the actual admitted ASCII bank; alternate encodings need their
original bytes. Failure leaves the input player, AI record and RNG unchanged.

The opponent branch does not call801C0 specialist construction,80830 landing,
81310 motion setup or48790 effect creation. `specialistsCreated` is empty and
`landingRequired` is false. A host must create landings from the actual human
entry requests instead of treating every active player as an arriving roster.
Both returned plans and retained AI images are JSON serializable.

`requiredOpponentStrategyPlayers(players, context)` expresses only the70B00
dispatch gate: flag118770 bit4 set,118968 bit2 clear, ascending active player
order, and a nonzero player mode. `assertOpponentStrategyImplemented` rejects
when that pass requires37870. It does not advance the AI timer or acknowledge
any initialization/decision callback. This guard prevents a loaded opponent
from silently remaining frozen while campaign simulation advances.

For the admitted mission3 source, active players are0 and1; player1 has mode1,
no specialists and target(18176,14592). AI1 signed646 is-1, so a legal carried
selected progress2 gives opponent progress1. Source seed53809/draws50582 becomes
seed39729/draws50646 after its64 blueprint draws, if the earlier selected-player
entry consumes no RNG. The source contains nine neutral Mules,49 plants and
five owner0 buildings with selectors3/0/4/6/6. It contains no initial opponent
specialist, landing or shared effect. These observations do not establish the
later strategic AI, serialized building activation or mission acceptance.

The next required family is the complete37870 pass. Its direct scheduled calls
are37540,37770,3BEB0,35820,35730,37690,360B0,3EBD0,36C10,3BF90,33F60 and3C4A0.
The first three are immediately relevant to mission3's cleared6AE flags;
frame32 and frame10 cadences gate the later work, and mission3's initial delay
is zero. The pass also validates specialist/blueprint references, traverses
eight7-byte group orders, updates building occupancy/repair cooldown data and
advances its attack-phase timing. The preserved Rust startup code covers the
selected human branch and blueprint generation; it supplies no reusable
strategic37870 implementation. These dependencies must be implemented with
their real mutation/query/factory ports, rather than replacing the guard with
an empty callback.

Source evidence is the read-only QA BETA V5 instruction/decompile material for
71B70 (`723B9..72411`),7D090 (`7D61D..7D687`, `7D6C1..7D76A`),7F580,7FAD0 and
70B00 (`70B7D..70BC7`), plus the complete37870 listing. The original executable
identity is checked by the private importer; no executable or proprietary data
is included here.

Eighteen synthetic cases cover extension boundaries/identity, generator
mutation extents, explicit unknown scratch, signed progress bounds, RNG ring
wrap, invalid contexts/rosters, late atomic failure, JSON restoration and the
exact scheduler gates. A private closed comparison of12 opponent entries uses
the actual mission3 numeric inputs and signed adjustments-128/-1/0/127 with
selected progress0/2/24. All1805 player bytes, complete RNG state and all four
loaded AI images match:28,564 numeric bytes over1,486,885 listing-model steps.
REP copy, memcmp and memcpy are explicit semantic primitive ports. No original
executable process or native code was run; the comparison does not run37870 or
transfer campaign acceptance.

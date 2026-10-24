# Pulper construction material processing

`mechanics/pulper.ts` implements the complete ordinary selector2 portion of
451F0, including upkeep, incomplete/disabled handling and its single common
ANB tail. `campaign/pulper-adapter.ts` binds actual native67 records, imported
BSAWM metadata, head-order plant queries, immediate spatial removal and724C0.
The enclosing owner/slot economy pass intercepts0800 demolition first.

The retained pending byte51 enters unsigned stock54 on animation frame0,
before the selector's energy gate. Positive energy and operational flags allow
new work below40\*(grade+2). Frame5 consumes the actual front-cell plant and
records its byte48 in51; a later frame0 deposits it into54. Source audio2F/31,
extra-drain arithmetic, stock clamping, dirty48 and signed ANB counter30 remain
ordered. This stock is construction material; this callback awards no GOOP,
funds or research and does not decrement player-owned plant count5FA.

The source43E30 constructor has no selector2-specific reset. In particular,
51 remains the actual prior, while generic54..57 clear. The runtime never
fabricates a clean pending byte, grade, energy or animation for a reused slot.
Ordinary Engineer commands and the campaign construction controls admit
selector2 only with its imported resource. The native task uses the source
two-cell footprint, reservation/terraforming, actual payment and shared44
appearance. A synthetic host regression preserves a live-work save, continues
both copies and replays the whole command through completion and pending51
processing. The older normalized construction bridge keeps its narrower scope.

The authoritative collector state is the separate32x97 family6 pool and byte
3558 count. Saves, current spatial reads, recursive724C0 cleanup and isolated
host transactions retain these records. Earlier development saves migrate only
when both original counts and retained images prove that pool was empty; the
original save checksum is verified first. Missing live records are rejected.
The normal host now runs the actual live ascending14EC0 pass immediately after
plants, before collapse/shared EFF. Current collector poses use their real EFF
resource and native97 image. See [Processor collectors](PROCESSOR_COLLECTORS.md)
for complete query, motion, work, pickup/drop, damage and retirement semantics.

Public entry points:

- `stepStagedPulper(world, slot, context)` mutates the already isolated world.
- `stepPulper(before, slot, context)` returns a cloned world and receipt.
- `stepStagedCampaignPulper(world, slot, pack, services)` preserves held
  native/player/building/economy objects and performs real cleanup immediately.
- `stepCampaignPulper` provides standalone full-host rollback.

Grade1/2 collection reaches the concrete112728→484E0/8D930→14040 service on
low-byte(slot+frame)==0, with radii1024/2048 and modes0/1 respectively. That
service is bound to the complete shared32-slot processor collector in the
campaign host. A false actual capacity allocation costs no extra drain;
absence remains an error for standalone callers and rolls back an atomic
caller. Normal campaign tests cover grade1 burn-only work and grade2 actual
plant pickup, return and material processing, with moving/carrying saves and
full sealed replay. Recycler4 uses the same concrete collector family for
corpse and plant delivery. Source Pulper damage and operation0 processing-front
cleanup are documented in [Pulper damage](PULPER_DAMAGE.md).

Evidence: preserved `building-update/instructions-000451f0.txt`, selector2
46805..46B67 and shared451F0 tail; `building-loader-refs/instructions-00043e30.txt`;
source484E0 collection predicate and14040 constructor. Private listing
arithmetic comparison covers51 cases/16,187 instructions and95,472 numeric
bytes with zero differences. The declared query, collection, cleanup and audio
ports are recorded explicitly. It does not claim those foreign bodies were
executed by that comparison. Public synthetic tests exercise retained identity,
power loss, processing/stock order, save continuation and late full rollback.
No original executable runs, proprietary fixtures or canonical acceptance.

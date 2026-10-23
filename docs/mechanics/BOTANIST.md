# Botanist plant work

`botanist.ts` implements actual category1 native records and retained player
blueprints through51960/507D0/56530/56090/51E80 and the shared57A10 envelope.
The world, native records, timers, pending commands, RNG and unknown bytes remain
serializable. All public command/callback entries are atomic; staged entries are
for an enclosing isolated host transaction only.

## Commands and callback

`queueBotanistWork` accepts task0 area research, task1 planting an admitted plant
selector, or task2 harvesting within the commanded area. It retains command
origin/radius and queues native57-bit0. Activation occurs after actual6FB60 on
the next57A10 callback. `queueBotanistMove` uses80FC0 and the actual74A50 resolver.
`cancelBotanistWork` and `cancelStagedBotanistWork` implement51E80, including the
area undo query's two RNG draws and target flag release.

`stepBotanistCallback` uses one outer transaction, actual motion, pending
activation, idle acquisition, role work and common animation/tail. The isolated
`stepBotanistRole` and in-place `stepStagedBotanistRole` are also exposed. The
idle52780 category1 branch escapes the chosen hostile Mule; it does not invent
a plant task or DNA gain. The shared scorer retains its actual chance, linked
query order and strict first winner.

Area work marks eligible plants, writes the original per-selector research
dword at player67E+selector\*4, and calls6C900 damage for every plant in each
sampled cell. Its resource byte114 increases by at most one per pulse, and only
when at least two plants were visited; it caps at40. This work does not grow or
fertilize plants. The cadence/arrived gate and area undo behavior are retained.

Planting uses original row1E as its resource cost and105-skill as its work timer.
After its actual6C4B0 attempt, it spends that cost and calls80780(+8), including
when the512-plant pool is full. Its8D9E0 search uses the source growth weights,
crowding/radius filters, randomized descending sector tie order, and interleaved
RNG before707A0. No modern pathfinder substitutes for that service.

Harvesting uses8B340(mask5)'s first eligible linked plant per cell before the
nearest/origin-radius score. It walks to the original32-unit approach offset,
uses separate live/dead arrival timers, emits actual effect7 on its frame/timer
gate, then calls6C6B0 ignition and806E0(50,-1). The target reference is cleared
only by the source branch. No inferred harvested-resource reward is added.

## Rules and host services

`botanistRulesFromEcology(pack.ecologyRules)` projects only named ecology growth
deltas/crowding and already imported `opaqueBytes[16]` (original row1E). The
imported384-byte plant table is object3+4B80, admitted by the ecology profile.
There is no fallback seed cost or new broad table dump.

The host supplies actual shared cell order,707A0 escape and74A50 move resolution,
6C900/6C780 plant damage/retirement,6C6B0 ignition,6C4B0 creation, actual audio33
playing state, and shared factories/economy. Service ports mutate the staged
world in place and retain held specialist/player/binding identities. Their
actual factories and RNG must run immediately at the call site.

`planBotanistPlantCreation` expresses6C4B0/1F340 known numeric writes over a real
inactive49-byte prior. It preserves counter30/retirement48/unknown bytes and
returns rounded point/height. The host selects the actual first free slot,
inserts8AC60 links, binds the plant resource, increments plant count and owned
player5FA, then80780(+1). A fresh owned plant has flags4. Neutral6CA90 separately
ORs1 after6C4B0 at6CFCE;6D1A0..6D1DA clears that newborn flag after its scan.
The existing ecology implementation preserves that distinction; its newborn
gate is unchanged.

`planBotanistEconomy` implements80780 credit and806E0 debit, reading actual
startup cap words1C7C/1C78 and the debit player49D gate. It returns exact raw
player changes, audio57/38 and6D500 burst60/61 parameters. `emitBotanistEconomyBurst`
interleaves each three caller draws with the actual factory attempt. Allocation
failure consumes no factory delay draw; successful49129 factories consume one.

`botanist-effect.ts` supplies actual code7 factory/common callback and code60/61
factory/common callbacks. The shared scheduler owns allocation, replacement,
cleanup, insertion, count and final retirement. Actual imported EFF profiles
are required: code7/60 six zero-hold frames and61 nine zero-hold frames. Code7
does not consume factory RNG. Codes60/61 retain their49129 acceleration/delay.

## Evidence and limits

Read-only admitted executable SHA-256:
`4bdf296febc88984aab6939fe3f3ef3196891f0be9bcb84a9283ab3b668a60ba`.
Evidence includes56530/56090,51960/507D0/51E80,58B30/58CD0/58E80,
8D7B0/8D930/8D9E0,8B340/8B6F0,1EBD0,6C4B0/1F340/6C690,
6C900/6C780/6C6B0,80780/806E0/6D500,48790/49129/4B630 and EFF metadata.

Twenty-one synthetic tests cover task activation, query completeness, area
damage/resource/research, cadence, cancellation, planting capacity/cost/timer,
harvest ordering, effect lifetime, economy gates/caps/bursts and rollback.
Fifteen private closed56530/56090 cases match111,533 numeric bytes, complete RNG
and ordered service calls across81,400 static instructions. Source binaries,
tables and fixtures remain ignored. Factory/economy/ray internals are explicit
ports in those closed caller comparisons, not whole-host evidence.

Direct target task3 and additional role categories are explicitly unadmitted.
This family does not establish mission acceptance; the campaign ledger remains
0/24 pending normal source-data playthrough/result/carry acceptance.

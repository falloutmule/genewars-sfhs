# Crab building work

The shared creature callback now includes commanded pending2 work and automatic
Crab-component work after food, combat and mating decline. Automatic Mule
hauling requires a Mule component; a failed hybrid hauling attempt may proceed
to its Crab work branch. A retained human task still suppresses new automatic
work.

The original decisions at63BC9/64A2B distinguish waiting for service arrival,
collecting material36 from a stocked Pulper, collecting a same-cell plant,
entering state13 at the destination, and selecting a repair or upgrade target.
Target selection uses the actual owner aggregate, runtime search extent,
alliances, native repair/upgrade eligibility, toroidal terrain distance and
source scan-order ties. Existing human task targets take precedence, including
their no-longer-eligible result. Valid work uses the existing creature target
adapter; allocation exhaustion preserves the source success flag without
inventing material.

State13 uses animation21 and the source quality-dependent timer with one random
draw. At timer expiry,61A5A applies one building contribution: material36 payload
times5, a carried plant payload times8, or a capped direct debit from a Pulper's
stock times5. The existing441C0 host handles repair, completion, upgrades,
capacity and retained task cleanup. Material retirement, plant drop, reference
cleanup, pool count and native record writes follow the original order. The
ordinary post-work idle draw and occupancy escape remain shared.

Ground attachment6EAF0 is shared by grounded creatures, including Crabs. Flying
attachment remains an explicit separate admission boundary. No new asset,
resource, default caller scratch or campaign outcome is introduced here.

Validation includes72 closed static-instruction comparisons covering commanded
and reachable automatic decisions plus complete state13 expiry. All concrete
creature bytes except opaque pointers, random draw counts and declared service
requests match. Foreign target selection, factories, building contribution and
retirement are explicit ports in these comparisons, with separate host tests;
this is not a claim to execute the original executable. Synthetic campaign
coverage consumes an actual shared plant carrier through normal callbacks,
checks pool/spatial state, save continuation and sealed replay. A private
500-tick diagnostic from the genuine Zed10902 parent also passes save/replay;
its world is not a phone campaign continuation parent or mission acceptance.

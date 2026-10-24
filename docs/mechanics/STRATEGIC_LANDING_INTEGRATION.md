# Recruitment landing integration

The ordinary campaign landing arrival now calls
`activateStagedCampaignSpecialists(staged, event.owner, pack, services)` from
the existing shared effect transaction. This replaces the whole historical
inline deployment loop. The helper owns source80AE0 eligibility, placement,
move setter, cancellation, spatial publication, blueprint counters and
player49D. The caller retains presentation notices and audio.

Neither the emitter's slot nor its center replaces player496/498 before that
call. Source80AE0 resolves the player's current retained kind5 reference, which
can differ from the effect emitting activation. It selects active native
records with113bit2, rather than every unready render projection. The associated
branch places7/9 at the current referenced carrier and queues the accepted
candidate through74A50. With no kind5 association, the accepted candidate becomes
7/9 directly. Physical/ground/shade caches, fractions and velocity remain for
the following ordinary motion callback.

Source4D8E3/4D8EE retirement clears player498 and sets499 to700 unconditionally.
It does not compare the retiring slot with496. Consequently an older carrier
can clear the association while a newer one is still descending; its later
activation uses the unassociated branch. The retained index496 itself is not
cleared. This behavior is covered without a same-slot condition.

## Caller branches

- Ordinary AI creation (`raw2 != 0`) uses7F3B0 parameter0 even at frame0 with
  nonzero mission counter1EC2. It creates a real shared code49 carrier and waits
  for its ordinary callback before80AE0 activation.
- Human creation (`raw2 == 0`) at frame0 with nonzero1EC2 activates immediately,
  then sets49D to1. It does not allocate a landing carrier.
- Human creation at a later frame with nonzero1EC2 uses parameter1, the mission
  center rather than raw-player9, and source48CA4..48CE2's selector64 scan and
  returned-reference changes. The concrete family is now bound through the
  shared recruitment landing adapter; see `HUMAN_RECRUITMENT_EFFECT.md`.

## Verification

`tests/strategic-landing-integration.test.ts` has five synthetic integration
cases. Four use the actual shared scheduler with the concrete activation helper
and source retirement writes. They cover simultaneous initial human/AI
landings, ordinary reinforcement without redeploying old ready records,
overlapping carriers whose emitter differs from player496, an empty second
activation pass, and the frame0 human/AI branch distinction. Saves are taken
during both genuine descents; heights and phases are not edited.

The fifth runs `stepCampaign` and therefore the real world landing hook and
ordinary Engineer, Geneticist and Shepherd callbacks. Initial deployment and
reinforcement each resume an airborne save and replay their full ordinary
segment. It checks native carrier-center placement and queued move flags at
activation, blueprint counters exactly once, five distinct spatial identities,
and the older carrier's unconditional association clear while the newer carrier
remains live. Both continued worlds and both sealed replays have matching full
world checksums and no host error notices. These are public synthetic fixtures,
not original mission acceptance.

Source gates and numeric activation were previously checked by the ignored
`strategic-recruit-host-source.py` / `verify-strategic-recruit-host.ts` harness:
14 cases,5,509 interpreted static instructions and1,389,752 compared numeric
bytes. That harness and the preserved80AE0/80830/7F3B0 and landing31 listings
are read-only evidence. Original native code was never executed.

## Remaining landing environment boundaries

Existing `landing.ts` explicitly rejects water contact (`ground <= water + 320`).
The scheduler now performs immediate smoke/departure priority allocation,
publication and cleanup, including normal capacity false. A follow-up source
audit has now replaced the preservation Rust31 model's null-obstacle restriction
with the actual74270 parity/height query and code49's immovable4AF40 response;
see `LANDING_OBSTACLE.md`. Referenced-building status/75240 and the selector64
parameter1 lifecycle are documented in `HUMAN_RECRUITMENT_EFFECT.md`. Canonical
campaign acceptance remains0/24.

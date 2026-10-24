# Human Botanist work command

`queueBotanistWork` implements the category1 human `81080` envelope around the existing `51960` setup and `51E80` release. A work command can interrupt an ordinary move and enter the real planting, collection or clearing controller on the next specialist callback. Previously the wrapper always released work, left native130 unset, and retained active movement when state85 was8. Release could leave desired speed zero while the queued work waited for state8 to end.

The source order is preserved:

1. Set pending87 bit0 before inspecting prior native130.
2. Call `51E80` only when native130 is nonzero. This retains its actual area cleanup, target reservation cleanup and RNG behavior.
3. Apply the existing category1 task, point, selector and skill-radius setup.
4. Set native130 to1.
5. If state85 is8, call the numeric `1EE50` virtual84 stop and clear active88 bit1 with `&0xFD`.

The stop zeroes desired63, clears route73 with `&0xEFE8`, resets routeTimer84 and masks native22 with63. Physical velocities remain intact. The subsequent shared `57A10` callback runs motion first, resets an inactive state8 through its existing idle branch, then consumes pending87 bit0 and activates `507D0`. No speed is invented by this command fix, and no shared movement, controller, query or strategic command implementation changes.

The public work request still accepts a signed point, task0/1/2, and a researched selector for task1 through normal campaign admission. The private numeric comparison stages this same point in native92/94 before source `81080`: that caller receives the category1 selector in the high byte of packet4, while `51960` copies the already stored point to area136/138. The comparison does not claim that point coordinates are carried in that selector packet.

Verification covers 864 full static caller cases: tasks0/1/2; states1/8/10/4; prior native130 values0/1/255; active88 values0/1/2/3; pending movement absent/present; and skills1/50/100. Complete `81080`, numeric `51960`, `51E80`, `1EE50`, and actual `8D7B0`/`8D930` empty-area scans match in 865,736 interpreted instructions and1,750,464 numeric bytes. Six trace-only hooks in a private bundle verify ordered cleanup, scan, setup and stop sites against source calls. The96 area-release scans consume exactly two RNG draws each; other envelope cases consume none. Retained plant reservation cleanup and complete player bytes also match. Pointer gaps remain null in the conversion. Device/panel calls, nonempty area query contents and the shared `57A10` physics callback are outside this caller comparison; existing role/query proofs and ordinary host tests cover their respective boundaries. The original program is never started.

Six dedicated tests cover the conditional release, all three tasks, stamp/active/pending combinations, velocity retention, real plant reservation cleanup, pending-before-cleanup order and rollback after a late query failure. An ordinary move followed by a planting command runs128 host ticks, creates real plants and credits, preserves complete checksums after JSON save/load, and matches a sealed command replay. A late actor animation failure preserves the complete queued-command afterimage and retained actor/player/RNG identities. The related Botanist, linked-query and strategic role command suites pass65 tests in five suites; strict typing and the asset leak check pass.

This correction applies when a new work command is submitted. Existing saved state8/pending/zero-speed afterimages are not patched, migrated or automatically reissued. The frozen b4b26bb Madami continuations and their policies remain unchanged. Any later ordinary recovery command needs its own authorized run and evidence. Synthetic host tests and numeric source comparisons establish this bounded family; they make no mission or canonical acceptance claim.

# Behavior and change policy

Classify each decision: original rule, verified bug fix, interface improvement, optional assist, or unresolved behavior. Preserve established original rules by default. Record evidence before calling an original behavior a bug. Tests of two new implementations establish internal agreement, not original fidelity.

| ID | Category | Current decision | Basis and limits |
|---|---|---|---|
| O1 | Original rule | Costs 650/400/250, less twice signed Engineer skill | Preserved mission-001 contract; no balancing adjustment |
| O2 | Original rule | Extractor → Distributor → Processor prerequisites, prior ownership permits rebuilding | Preserved construction availability contract |
| O3 | Original rule | Three completed selector-6 buildings satisfy Exceland's construction predicate | Full eligibility/outcome path still pending |
| U1 | Unresolved / development only | 30 fixed ticks per building | Workbench scheduling, explicitly not recovered construction timing |
| U2 | Unresolved / development only | Two specialists, skill 0, immediate construction-site assignment | Original roster/team selection, travel, terraforming and startup not integrated |
| U3 | Unresolved / development only | Four-neighbor BFS with explicit blocked cells | Original terrain movement admission and collision rules not integrated |
| U4 | Unresolved | No running power/economy/ecology/AI callbacks | UI states this instead of silently substituting invented rates |
| U5 | Unresolved | Source RNG startup is null; reserved workbench seed 1 | No opaque source dword is labeled an original RNG state; no random gameplay runs |
| U6 | Unresolved | B32A display palette/terrain transform and fixed frame sprite preview | Palette effects, terrain shading, runtime animation selection and other planetary atlas selection pending |
| Q1 | Interface | Pause/order queue, 0.5/1/2/4 speeds, larger hit areas, overlap cycle, selection groups | Fixed tick rules unchanged by display speed |
| Q2 | Interface | Readable DOM panels, state reasons, objective counts, alert focus/deduplication | Original interface-art composition not yet integrated |
| Q3 | Reliability | Complete current-world saves, rotating recovery, replay hashes, background pause | Completeness applies only to currently implemented world systems |
| P1 | Conversion scheduling | Retain accumulated simulation time when rendering is slow | Donor dropped backlog; handoff forbids losing simulation ticks |

No original bug is claimed fixed by this initial conversion. Rebuilds, picking and command-queue corrections encountered here fix conversion bugs, not verified 1996 bugs. No assist or rebalance is enabled. The workbench result never increments an accepted-mission counter or pretends to initialize carried Krell gameplay.

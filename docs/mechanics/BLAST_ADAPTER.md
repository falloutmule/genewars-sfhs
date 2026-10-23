# Campaign blast damage binding

`campaignBlastAreaContext(world,pack,services)` binds the independently expressed `runBlastArea` (`4929C`/`4995A`) to the current campaign. It requires the admitted nine ecology directions and motion tables. It resolves current native targets through `campaignBlastTarget`; serialized startup overlays do not replace live pools. The services are:

```ts
interface CampaignBlastServices<W extends CampaignWorld = CampaignWorld> {
  damageSpecialist(
    w: W,
    index: number,
    amount: number,
    attacker: SourceEntityId | null,
  ): void;
  damageBuilding(
    w: W,
    index: number,
    amount: number,
    attacker: SourceEntityId | null,
  ): void;
  effectOptions(w: W): EffectSchedulerOptions<W>;
}
```

The caller supplies a complete isolated host transaction. The adapter does not open an independent transaction or commit a partial damage receipt. Required specialist/building services execute immediately against this same host and must preserve held native/player array identities. Ignition's recursive shared-pool factories use `effectOptions(w)` for this staged host. A missing reached service throws; kind7 damage remains explicitly unsupported until its actual source virtual is implemented. Kind1 damage uses `damageCampaignMule`, including immediate blood factories, release/death handling and owner receipts.

`damageCampaignPlant(world,pack,index,amount)` exports the same in-place plant damage body independently of blast context for real Botanist and other source callers.

`head(point)` reads the current intrusive map head. `next(id)` reads the current link after damage and recursive mutation. Source `6D390` decodes an index/kind reference without testing the referenced active byte. When the current target has retired and its spatial node has been removed, the adapter therefore decodes its retained native `+3/+5` continuation. It synchronizes live neighbor headers after services. Repeated cells and visits remain in source order; the adapter does not sort or deduplicate. If a retained continuation points to an inactive target whose virtual bindings are unavailable, normal target resolution still rejects it explicitly.

The current RNG is read dynamically from `world.rng`, including after recursive factories replace that object. Countdown reads use the actual unsigned mission-prefix word `355C`; writes update that word and the normalized countdown together. The area core retains the source `>600` decrement by10, distance tests, impulse ordering and per-direction specialist counters. The adapter copies only the six impulse words `45/47/49/57/59/61` into existing specialist/construction motion objects. Actual smoke particle native/velocity mirrors are synchronized before later callbacks can overwrite the impulse. Code33 (`0x21`) power packets and the water/landing constructors remain immovable according to their admitted descriptors.

Plant damage expresses the established `6C900` → `6C780` path in place, without RNG: subtract signed growth; on lethal damage initialize retirement/action only when flags46 mask88 is clear; decrement retirement by4 when it is at least4; otherwise unlink, decrement owner player `5FA`, recover cell byte13 by2 only below64, perform `724C0`, clear kind6, and decrement the mission plant word `3552`. The source permits cell63 to become65. It retains native arrays and references' stale index operands. No unused cold/burning fields or delay defaults are invented. Counts must agree between the native prefix/player words and EcologyState before immediate retirement; the host synchronizes these mirrors after earlier plant changes. Source old-frame dirty drawing depends on the original viewport and belongs to presentation; the adapter does not fabricate viewport tests or mutate dirty flags for this branch.

Ignition delegates to established `igniteStagedPlant`: commit the plant afterimage, attempt real unmarked effect8 (`0x08`), then request channel15 (`0x0F`), mode2, parameter0, gain1, initial playback rate100. Shared capacity failure retains ignition and audio. The adapter copies the final current image back into the held plant array, including inline link/cleanup mutations. There are no added RNG draws or synthetic replacement effects.

Evidence is the already established destruction/plant-fire contracts and read-only preserved static listings. Additional source pins used for this binding:

| Preserved listing                                 | SHA-256                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| `display-geometry/instructions-0006c780.txt`      | `462f1d606d4212d724b783dfe542df7cc6f8ea322cfd77e218ec26b72fc957d8` |
| `review/creature-motion/listing-6c900-closed.txt` | `52af752da376a47255b1d1da30d161749e4373164a587af8f3d063b40c7a5c1e` |
| `mission-array-refs/instructions-0006d390.txt`    | `7f1c49974e62a52382eed53b9dcfa8dcc53b0727c9fdd2a626d57009a8376548` |

Fourteen public synthetic tests cover current and retired link traversal, recursive list changes, repeated source samples, countdown/RNG mirrors, exact typed service dispatch, real Mule blood, specialist/smoke impulses, delayed and immediate plant retirement, cleanup/counter wrap operands, unknown bytes, real ignition/capacity failure and caller-owned rollback. The dependent destruction and plant-fire mechanics have their own bounded conformance receipts. These adapter tests do not establish mission acceptance or complete kind7 damage.

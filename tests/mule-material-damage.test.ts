import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import {
  damageCampaignMule,
  captureCampaignMule,
} from "../src/sim/campaign/mule-damage-adapter";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { insertSpatial, validateSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import {
  haulingPut as put,
  haulingWord as word,
} from "../src/sim/mechanics/mule-hauling";
import { worldCell } from "../src/sim/mechanics/terrain";

function fixture(health: number) {
  const pack = campaignFixture(),
    w = createCampaign(pack, "synthetic-carry-damage"),
    at: [number, number] = [10240, 10240];
  pack.ecologyRules!.muleCombat = {
    queryRadius: 512,
    attack: 5,
    defense: 0,
    disposition: 0,
    foodWeights: [1, 2, 3],
    attackChannel: 41,
  };
  const made = initializeMuleNative(
    w.creatureNative[0],
    w.rng,
    { slot: 0, owner: 0, position: at, quality: 50 },
    { terrain: w.terrain, tables: pack.rules!.tables },
  );
  if (!made.ok) throw Error(made.reason);
  const n = made.value.native;
  n[94] = 8;
  put(n, 106, health);
  n[96] = 2;
  put(n, 91, 0);
  n[93] = 5;
  w.rng = made.value.rng;
  w.creatureNative[0] = n;
  w.ecology.mules.push({ id: "source:0:0", index: 0, native: n, pending: [] });
  const effect: (number | null)[] = Array(81).fill(0);
  effect.fill(null, 31, 39);
  effect[6] = 5;
  effect[69] = 67;
  put(effect, 15, 0);
  put(effect, 7, at[0]);
  put(effect, 9, at[1]);
  effect[21] = 0xa0;
  effect[22] = 1;
  w.powerEffects.slots[0].nativePrior = effect;
  w.powerEffects.slots[0].occupied = true;
  insertSpatial(w.spatial, w.terrain, "source:0:0", worldCell(...at));
  insertSpatial(w.spatial, w.terrain, "source:4:0", worldCell(...at));
  synchronizeCampaignLinks(w);
  return { pack, w, n, effect };
}
describe("carrying Mule source damage release", () => {
  for (const health of [50, 1])
    it(`detaches67 in-place before ${health === 1 ? "lethal" : "nonlethal"} health handling`, () => {
      const f = fixture(health),
        players = f.w.players.map((p) => p.raw),
        pool = f.w.creatureNative,
        actor = f.w.ecology.mules[0],
        rng = f.w.rng;
      const events = damageCampaignMule(f.w, f.pack, 0, 1, null);
      expect(f.w.creatureNative).toBe(pool);
      expect(f.w.ecology.mules[0]).toBe(actor);
      expect(actor.native).toBe(f.n);
      expect(f.w.powerEffects.slots[0].nativePrior).toBe(f.effect);
      expect(f.w.players.every((p, i) => p.raw === players[i])).toBe(true);
      expect([
        f.effect[69],
        f.effect[21]! & 32,
        f.n[96]! & 2,
        f.n[93],
        word(f.n, 106),
        f.n[94],
      ]).toEqual([68, 0, 0, 0, health - 1, health === 1 ? 24 : 20]);
      expect(f.w.rng).toBe(rng);
      expect(events.some((e) => e.kind === "mule-combat-kill")).toBe(
        health === 1,
      );
      expect(() => validateSpatial(f.w.spatial)).not.toThrow();
    });
  it("capture's damage and subsequent5CC60 use the same staged carrier service", () => {
    const f = fixture(50),
      capture: (number | null)[] = Array(81).fill(0);
    capture.fill(null, 31, 39);
    capture[6] = 5;
    capture[69] = 20;
    put(capture, 15, 1);
    captureCampaignMule(f.w, f.pack, 0, capture, {
      damage: 1,
      duration: 77,
      capturedByActor: null,
    });
    expect([
      f.effect[69],
      f.n[93],
      f.n[96]! & 2,
      f.n[94],
      word(f.n, 108),
    ]).toEqual([68, 0, 0, 18, 77]);
    expect(f.w.creatureNative[0]).toBe(f.n);
  });
});

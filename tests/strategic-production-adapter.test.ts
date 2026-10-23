import { describe, expect, it } from "vitest";
import { createCampaign } from "../src/sim/campaign/world";
import { campaignFixture } from "./fixtures/campaign";
import { strategicFixture } from "./fixtures/strategic-production";
import {
  aiDword,
  aiPutDword,
  aiPutWord,
} from "../src/sim/mechanics/strategic-ai-state";
import {
  applyStagedCampaignProduction,
  makeCampaignStrategicProductionService,
} from "../src/sim/campaign/strategic-production-adapter";
import {
  requestStagedStrategicProduction,
  type StrategicProductionContext,
  type StrategicProductionRequest,
} from "../src/sim/mechanics/strategic-ai-production";
function fixture() {
  const pack = campaignFixture(),
    world = createCampaign(pack, "synthetic"),
    state = strategicFixture();
  pack.ecologyRules!.speciesTraits = Array.from({ length: 25 }, () => {
    const row = Array(45).fill(0);
    aiPutDword(row, 32, 75);
    return row;
  });
  state.buildings = world.buildingNative;
  state.players = world.players.map((p) => p.raw);
  state.rng = world.rng;
  const n = state.buildings[64],
    p = world.players[1];
  n[6] = 4;
  n[45] = 0;
  n[24] = 1;
  n[46] = 2;
  n[58] = 3;
  aiPutWord(n, 15, 64);
  aiPutWord(n, 49, 1);
  aiPutDword(n, 54, 0);
  n[27] = 0;
  p.raw[2] = 1;
  p.raw[0x4a1] = 1;
  aiPutDword(p.raw, 0x4a3, 1);
  aiPutDword(p.raw, 0x4a7, 0);
  const request: StrategicProductionRequest = {
    routine: 0x814a0,
    player: 1,
    building: 64,
    species: 4,
    role: 1,
    command: 12,
    parameter: 1,
  };
  return { pack, world, state, n, p, request };
}
describe("campaign strategic production command adapter", () => {
  it("binds actual AI input, partial debit, refill and unchanged payer in place", () => {
    const f = fixture(),
      n = f.n,
      raw = f.p.raw,
      rng = f.world.rng,
      pool = f.world.buildingNative,
      players = f.world.players;
    const receipt = applyStagedCampaignProduction(
      f.world,
      f.pack,
      f.state,
      f.request,
    );
    expect(receipt).toMatchObject({
      disposition: "started",
      partialPayment: 3,
      remaining: 18,
      computerRefilled: true,
    });
    expect(aiDword(n, 54)).toBe(18);
    expect(n[58]).toBe(3);
    expect(f.p.funds).toBe(0);
    expect(f.p.goop).toBe(1000);
    expect(f.world.economy.players[1].goop).toBe(1000);
    expect(f.world.buildingNative).toBe(pool);
    expect(pool[64]).toBe(n);
    expect(f.p.raw).toBe(raw);
    expect(f.world.players).toBe(players);
    expect(f.world.rng).toBe(rng);
    expect(rng.draws).toBe(f.state.rng.draws);
  });
  it("never overwrites raw debits with stale normalized balances or applies human gates", () => {
    const f = fixture();
    f.p.funds = 123456;
    f.p.goop = 654321;
    f.n[27] = 40;
    aiPutWord(f.n, 49, 0x140);
    applyStagedCampaignProduction(f.world, f.pack, f.state, f.request);
    expect(f.p.funds).toBe(0);
    expect(f.p.goop).toBe(1000);
    expect(f.n[27]).toBe(40);
  });
  it("supplies the exact existing36920 service and leaves birth/pools untouched", () => {
    const f = fixture(),
      beforeRng = { ...f.world.rng },
      creatures = JSON.stringify(f.world.creatureNative),
      c: StrategicProductionContext = {
        speciesGenes: Array.from({ length: 25 }, () => [0, 0]),
        productionWeights: Array.from({ length: 25 }, (_, species) =>
          species === 4 ? [0, 10, 0, 0, 0] : [0, 0, 0, 0, 0],
        ),
        requestProduction: makeCampaignStrategicProductionService(
          f.world,
          f.pack,
        ),
      };
    aiPutDword(f.p.raw, 0x61a + 4 * 4, 6 * 2048);
    expect(
      requestStagedStrategicProduction(f.state, 1, 64, 1, c),
    ).toMatchObject({ submitted: true, selectedSpecies: 4, draws: 1 });
    expect(f.n[60]).toBe(1);
    expect(aiDword(f.n, 54)).toBe(18);
    expect(f.world.rng.draws).toBe(beforeRng.draws + 1);
    expect(JSON.stringify(f.world.creatureNative)).toBe(creatures);
  });
  it("dispatches admitted hybrid numeric costs without synthesizing unsupported births", () => {
    const f = fixture();
    f.request.species = 24;
    const creatures = JSON.stringify(f.world.creatureNative);
    expect(
      makeCampaignStrategicProductionService(f.world, f.pack)(
        f.state,
        f.request,
      ),
    ).toEqual(f.request);
    expect(f.n[51]).toBe(24);
    expect(JSON.stringify(f.world.creatureNative)).toBe(creatures);
  });
  it("routes presentation refresh only through the supplied staged observation", () => {
    const f = fixture();
    const observations: number[] = [];
    applyStagedCampaignProduction(f.world, f.pack, f.state, f.request, {
      panelRefreshEligible: (_w, slot) => slot === 64,
      onReceipt(w, r) {
        expect(w).toBe(f.world);
        observations.push(Number(r.panelRefreshRequested));
      },
    });
    expect(observations).toEqual([1]);
  });
  it("rejects replaced native/player/RNG bindings and absent admitted cost table", () => {
    const f = fixture();
    const original = f.state.rng;
    f.state.rng = { ...original };
    expect(() =>
      applyStagedCampaignProduction(f.world, f.pack, f.state, f.request),
    ).toThrow("binding");
    f.state.rng = original;
    f.state.players[1] = f.state.players[1].slice();
    expect(() =>
      applyStagedCampaignProduction(f.world, f.pack, f.state, f.request),
    ).toThrow("binding");
    f.state.players[1] = f.p.raw;
    delete f.pack.ecologyRules!.speciesTraits;
    expect(() =>
      applyStagedCampaignProduction(f.world, f.pack, f.state, f.request),
    ).toThrow("cost table");
  });
  it("rejects late presentation replacement of a retained native record", () => {
    const f = fixture();
    expect(() =>
      applyStagedCampaignProduction(f.world, f.pack, f.state, f.request, {
        onReceipt(w) {
          w.buildingNative[65] = w.buildingNative[65].slice();
        },
      }),
    ).toThrow("replaced");
  });
  it("preserves complete resumed numeric command behavior after JSON reload/rebind", () => {
    const f = fixture(),
      w = JSON.parse(JSON.stringify(f.world));
    const state = {
      ...f.state,
      buildings: w.buildingNative,
      players: w.players.map((p: typeof f.p) => p.raw),
      rng: w.rng,
    };
    expect(applyStagedCampaignProduction(w, f.pack, state, f.request)).toEqual(
      applyStagedCampaignProduction(f.world, f.pack, f.state, f.request),
    );
    expect(w).toEqual(f.world);
  });
});

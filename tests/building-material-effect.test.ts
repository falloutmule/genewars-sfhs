import { describe, it, expect } from "vitest";
import { processorFixture } from "./fixtures/processor";
import {
  makeBuildingMaterialEffect,
  stepBuildingMaterialEffectRecord,
} from "../src/sim/mechanics/building-material-effect";
import {
  createCampaignBuildingMaterial,
  createStagedCampaignBuildingMaterial,
  stepCampaignBuildingMaterial,
} from "../src/sim/campaign/building-material-effect-adapter";
import { animationProfile } from "../src/sim/mechanics/animation";
import { put16, put32, u32, i16 } from "../src/sim/campaign/bytes";
import { groundHeight } from "../src/sim/mechanics/terrain";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { validateSpatial } from "../src/sim/campaign/spatial";
import { stepEffectScheduler } from "../src/sim/campaign/effect-scheduler";
import { saveCampaign, loadCampaign } from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";
function fixture(grade: 0 | 1 | 2 = 0) {
  const f = processorFixture(2, grade),
    { w, pack, options } = f;
  put32(w.buildingNative[0] as number[], 54, 47);
  const q = {
    position: [8192, 8192] as [number, number],
    height: groundHeight(w.terrain, 8192, 8192) + 2000,
    angles: [0, 0, 256] as [number, number, number],
    owner: 0,
    parameter: 0 as const,
    delay: 0 as const,
    parentBuilding: 0,
  };
  const context = () => ({
    terrain: w.terrain,
    tables: pack.rules!.tables,
    profile: animationProfile(pack.assets.EFF, 36),
    gravity: 512,
    water: 0,
    frame: 2,
    bounce: pack.rules!.tables.bounce,
    friction: pack.ecologyRules!.corpseFriction!,
    obstacle: () => null,
    particle: () => false,
  });
  options.buildingMaterialEffect = (s, slot, out) =>
    stepCampaignBuildingMaterial(s, slot, pack, options, out);
  return { ...f, q, context };
}
describe("shared construction material36", () => {
  it.each([0, 1, 2] as const)(
    "debits actual grade%d Pulper stock only after allocation and retains payload/grade",
    (grade) => {
      const { w, pack, options, q } = fixture(grade),
        heldParent = w.buildingNative[0],
        heldPrior = w.powerEffects.slots[0].nativePrior!;
      heldPrior[30] = 77;
      heldPrior[67] = 23;
      heldPrior[68] = 91;
      heldPrior[73] = 4;
      const rng = structuredClone(w.rng),
        result = createStagedCampaignBuildingMaterial(w, pack, q, options)!;
      expect(result.native).toBe(heldPrior);
      expect(w.buildingNative[0]).toBe(heldParent);
      expect(w.rng).toEqual(rng);
      expect([
        u32(heldParent as number[], 54),
        heldPrior[76],
        heldPrior[27],
        heldPrior[28],
        i16(heldPrior as number[], 21),
      ]).toEqual([47 - 10 * (grade + 1), 10 * (grade + 1), grade, 0, 0]);
      expect([
        heldPrior[30],
        heldPrior[67],
        heldPrior[68],
        heldPrior[73],
      ]).toEqual([77, 23, 91, 4]);
      expect(heldPrior.slice(31, 39)).toEqual(Array(8).fill(null));
      validateSpatial(w.spatial);
    },
  );
  it("handles unsigned stock and the short final amount without a rate default", () => {
    const { w, pack, q } = fixture(2),
      prior = w.powerEffects.slots[0].nativePrior!,
      p = w.buildingNative[0];
    put32(p as number[], 54, 7);
    const made = makeBuildingMaterialEffect(
      prior,
      0,
      q,
      p,
      w.terrain,
      pack.rules!.tables,
      animationProfile(pack.assets.EFF, 36),
    );
    expect(made.amount).toBe(7);
    expect(u32(made.parent as number[], 54)).toBe(0);
    expect(u32(p as number[], 54)).toBe(7);
    put32(p as number[], 54, 0xffffffff);
    expect(
      makeBuildingMaterialEffect(
        prior,
        0,
        q,
        p,
        w.terrain,
        pack.rules!.tables,
        animationProfile(pack.assets.EFF, 36),
      ).amount,
    ).toBe(30);
  });
  it("runs real gravity/fixed fractions and preserves the grade image with no automatic expiration", () => {
    const { w, pack, q, context } = fixture(1);
    q.angles[2] = 0;
    const n = makeBuildingMaterialEffect(
      w.powerEffects.slots[0].nativePrior!,
      0,
      q,
      w.buildingNative[0],
      w.terrain,
      pack.rules!.tables,
      animationProfile(pack.assets.EFF, 36),
    ).native;
    put16(n as number[], 74, 0);
    const r = stepBuildingMaterialEffectRecord(n, w.rng, context());
    expect([
      i16(r.native as number[], 49),
      u32(r.native as number[], 39),
      i16(r.native as number[], 74),
      r.native[27],
      r.native[28],
    ]).toEqual([-512, q.height - 64, -1, 1, 0]);
    expect(r.retirementRequired).toBe(false);
    expect(r.native[67]).toBe(n[67]);
    expect(n[74]).toBe(0);
  });
  it("keeps 36 out of the ordinary destruction auto-retirement contract", () => {
    const { w, pack, q, context } = fixture(),
      made = makeBuildingMaterialEffect(
        w.powerEffects.slots[0].nativePrior!,
        0,
        q,
        w.buildingNative[0],
        w.terrain,
        pack.rules!.tables,
        animationProfile(pack.assets.EFF, 36),
      );
    let n = made.native;
    for (let frame = 0; frame < 40; frame++) {
      const result = stepBuildingMaterialEffectRecord(n, w.rng, {
        ...context(),
        frame,
      });
      expect(result.retirementRequired).toBe(false);
      n = result.native;
    }
    expect(n[6]).toBe(5);
    expect(n[76]).toBe(10);
  });
  it("rolls back full host state on a missing late factory resource", () => {
    const { w, pack, q, options } = fixture();
    delete pack.assets.EFF.animations;
    const before = structuredClone(w),
      parent = w.buildingNative[0],
      prior = w.powerEffects.slots[0].nativePrior!;
    expect(() => createCampaignBuildingMaterial(w, pack, q, options)).toThrow();
    expect(w).toEqual(before);
    expect(w.buildingNative[0]).toBe(parent);
    expect(w.powerEffects.slots[0].nativePrior).toBe(prior);
  });
  it("full shared pool declines before parent/profile access and keeps all material", () => {
    const { w, pack, q, options } = fixture();
    for (let i = 0; i < 200; i++)
      expect(
        createStagedCampaignBuildingMaterial(w, pack, q, options),
      ).not.toBeNull();
    put32(w.buildingNative[0] as number[], 54, 47);
    const before = structuredClone(w);
    delete pack.assets.EFF;
    expect(
      createStagedCampaignBuildingMaterial(
        w,
        pack,
        { ...q, parentBuilding: 999 },
        options,
      ),
    ).toBeNull();
    expect(w).toEqual(before);
    validateSpatial(w.spatial);
  });
  it("late scheduler obstacle failure rolls back motion/publication with held parent/effect identities", () => {
    const { w, pack, q, options } = fixture();
    createStagedCampaignBuildingMaterial(w, pack, q, options);
    w.frame = 3;
    options.destructionObstacle = () => {
      throw Error("late obstacle");
    };
    const before = structuredClone(w),
      parent = w.buildingNative[0],
      effect = w.powerEffects.slots[0].nativePrior;
    expect(() => stepEffectScheduler(w, pack, options)).toThrow(
      "late obstacle",
    );
    expect(w).toEqual(before);
    expect(w.buildingNative[0]).toBe(parent);
    expect(w.powerEffects.slots[0].nativePrior).toBe(effect);
  });
  it("preserves JSON continuation through airborne material motion and explicit host publication", () => {
    const { w, pack, q, options } = fixture(),
      result = createStagedCampaignBuildingMaterial(w, pack, q, options)!;
    const saved = loadCampaign(
        saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
        w.contentHash,
      ).world,
      clone = structuredClone(w);
    for (const s of [saved, clone]) {
      const receipt = stepEffectScheduler(s, pack, options);
      expect(receipt.callbacks).toContainEqual({
        phase: "primary",
        slot: result.slot,
        code: 36,
      });
    }
    expect(checksum(saved)).toBe(checksum(clone));
  });
});

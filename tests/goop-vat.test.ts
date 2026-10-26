import { describe, expect, it } from "vitest";
import {
  stepStagedGoopVat,
  type GoopVatContext,
} from "../src/sim/mechanics/goop-vat";
import {
  createNativeBuilding,
  progressNativeBuilding,
  type BuildingNative,
} from "../src/sim/mechanics/building-native";
import {
  putEffectWord as put,
  putEffectDword as put32,
} from "../src/sim/mechanics/power-motion";
const word = (n: BuildingNative, p: number) =>
  ((n[p]! | (n[p + 1]! << 8)) << 16) >> 16;
const dword = (n: BuildingNative, p: number) =>
  (word(n, p) & 65535) | (word(n, p + 2) << 16);
function fixture() {
  const native: BuildingNative = Array(67).fill(0),
    player: BuildingNative = Array(1805).fill(0);
  native.fill(null, 31, 39);
  native[6] = 4;
  native[45] = 13;
  put(native, 43, 100);
  put(native, 49, 5);
  put(native, 61, 200);
  put32(native, 54, 250);
  put32(player, 0x4a7, 400);
  const world = { native, player };
  const context: GoopVatContext<typeof world> = {
    frame: 32,
    upkeep: 1,
    native: (w) => w.native,
    player: (w) => w.player,
    profile: () => ({ first: 0, last: 12, holds: Array(13).fill(0), flags: 0 }),
  };
  return { world, context, native, player };
}
describe("source GOOP Vat lifecycle", () => {
  it("retains constructor priors and completes without source77 audio", () => {
    const prior: BuildingNative = Array(67).fill(77);
    prior.fill(null, 31, 39);
    prior[6] = 0;
    const made = createNativeBuilding(prior, {
      slot: 64,
      owner: 1,
      selector: 13,
      position: [8192, 8192],
      ground: 1000,
      shade: 64,
    });
    expect(made.ok).toBe(true);
    if (!made.ok) return;
    expect([made.value[30], made.value[48], made.value[63]]).toEqual([
      77, 77, 77,
    ]);
    expect(dword(made.value, 54)).toBe(0);
    const done = progressNativeBuilding(made.value, {
      increment: 100,
      maximumHealth: 100,
      loading: false,
    });
    expect(done.ok).toBe(true);
    if (!done.ok) return;
    expect(done.value).toMatchObject({
      completed: true,
      completionAudioCue: null,
      completedPlayerCountOffset: 0x60d,
      acquiredOwnershipBit: 1 << 13,
    });
    expect(word(done.value.native, 61)).toBe(200);
  });
  it("preserves powered storage and uses the stored-volume frame", () => {
    const f = fixture(),
      out = stepStagedGoopVat(f.world, 0, f.context);
    expect(out).toEqual({
      leaked: false,
      playerDebited: false,
      warningStarted: false,
      queueDraw: true,
    });
    expect(dword(f.native, 54)).toBe(250);
    expect(dword(f.player, 0x4a7)).toBe(400);
    expect([f.native[25], f.native[27], f.native[28]]).toEqual([1, 6, 0]);
  });
  it.each([400, 0, -1])(
    "leaks on the source slot/frame phase with signed GOOP %i",
    (goop) => {
      const f = fixture();
      put(f.native, 61, 0);
      put32(f.player, 0x4a7, goop);
      const out = stepStagedGoopVat(f.world, 0, f.context);
      expect(out.leaked).toBe(true);
      expect(out.playerDebited).toBe(goop > 0);
      expect(dword(f.native, 54)).toBe(249);
      expect(dword(f.player, 0x4a7)).toBe(goop > 0 ? goop - 1 : goop);
      expect(word(f.player, 0x5ea)).toBe(1000);
    },
  );
  it("does not leak off-phase or restart an existing power warning", () => {
    const f = fixture();
    f.context.frame = 31;
    put(f.native, 61, 0);
    put(f.player, 0x5ea, 12);
    const out = stepStagedGoopVat(f.world, 0, f.context);
    expect(out.leaked).toBe(false);
    expect(out.warningStarted).toBe(false);
    expect(word(f.player, 0x5ea)).toBe(12);
  });
  it("leaks suppressed storage even with energy and retains the common extra decay", () => {
    const f = fixture();
    put(f.native, 49, 0x105);
    f.native[63] = 7;
    stepStagedGoopVat(f.world, 0, f.context);
    expect(dword(f.native, 54)).toBe(249);
    expect(word(f.native, 61)).toBe(191);
    expect(f.native[63]).toBe(6);
  });
  it("disabled vats bypass storage work and upkeep", () => {
    const f = fixture();
    put(f.native, 49, 0x45);
    f.native[63] = 7;
    stepStagedGoopVat(f.world, 0, f.context);
    expect(dword(f.native, 54)).toBe(250);
    expect(word(f.native, 61)).toBe(199);
    expect(f.native[63]).toBe(7);
    expect([f.native[25], f.native[27]]).toEqual([4, 0]);
  });
  it("zero-health construction performs no ANB lookup or storage leakage", () => {
    const f = fixture();
    put(f.native, 49, 0);
    put(f.native, 43, 0);
    f.context.profile = () => {
      throw Error("unexpected profile");
    };
    expect(stepStagedGoopVat(f.world, 0, f.context).queueDraw).toBe(false);
    expect(dword(f.native, 54)).toBe(250);
    expect(word(f.native, 61)).toBe(199);
  });
  it("truncates the volume frame to a byte before clamping", () => {
    const f = fixture();
    put32(f.native, 54, 10000);
    stepStagedGoopVat(f.world, 0, f.context);
    expect(f.native[27]).toBe(4);
  });
  it("rejects missing numeric priors, foreign identities and shared demolition", () => {
    for (const mutate of [
      (f: ReturnType<typeof fixture>) => (f.native[54] = null),
      (f: ReturnType<typeof fixture>) => put(f.native, 15, 64),
      (f: ReturnType<typeof fixture>) => put(f.native, 49, 0x801),
    ]) {
      const f = fixture();
      mutate(f);
      const original = structuredClone(f.world);
      expect(() =>
        stepStagedGoopVat(structuredClone(f.world), 0, f.context),
      ).toThrow();
      expect(f.world).toEqual(original);
    }
  });
});

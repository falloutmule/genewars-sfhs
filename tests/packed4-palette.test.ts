import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  composeNeutralPacked4Frame,
  composeOwnedPacked4Frame,
  createNeutralPacked4Material,
  createOwnedPacked4Material,
  neutralPacked4Bank,
  neutralPacked4Depth,
  neutralPacked4PaletteIndex,
  neutralPacked4Shade,
  ownedPacked4PaletteIndex,
  ownedPacked4Profile,
  packed4IndexTexture,
  packed4LookupTexture,
  packed4PaletteLookup,
  updateNeutralPacked4Material,
  updateOwnedPacked4Material,
  type OwnedPacked4SourceContext,
  type NeutralPacked4Frame,
  type NeutralPacked4PixelContext,
  type NeutralPacked4ScreenContext,
} from "../src/render/packed4-palette";

const pixel = (
  patch: Partial<NeutralPacked4PixelContext> = {},
): NeutralPacked4PixelContext => ({
  screenX: 0,
  screenY: 0,
  componentOriginX: 0,
  pitch: 640,
  clipFlagBit0: false,
  depth: 0,
  ...patch,
});
const rgb = () => Uint8Array.from({ length: 768 }, (_, i) => Math.floor(i / 3));
const identity = () => Uint8Array.from({ length: 256 }, (_, i) => i);
const lookup = () => packed4PaletteLookup(rgb(), identity());
function frame(
  width: number,
  height: number,
  values: readonly number[],
): NeutralPacked4Frame {
  return {
    width,
    height,
    indices: Uint8Array.from(values),
    bank192: Uint8Array.from({ length: width * height * 4 }, (_, i) =>
      i % 4 === 3 ? 255 : 111,
    ),
    bank208: Uint8Array.from({ length: width * height * 4 }, (_, i) =>
      i % 4 === 3 ? 255 : 222,
    ),
  };
}
const screen = (
  patch: Partial<NeutralPacked4ScreenContext> = {},
): NeutralPacked4ScreenContext => ({
  componentOriginX: 13,
  clipFlagBit0: false,
  depth: 0,
  pitch: 640,
  logicalViewportHeight: 480,
  physicalPixelsPerLogicalPixel: [2, 2],
  viewportPhysicalOrigin: [0, 0],
  ...patch,
});
const owned = (
  patch: Partial<OwnedPacked4SourceContext> = {},
): OwnedPacked4SourceContext => ({
  owner: 0,
  state: 8,
  current6A: 160,
  max64: 160,
  rawShade: 0,
  virtualHeight: 0,
  flags15: 0,
  globalShadowMode: 0,
  sourceFrame: 0,
  entityId: 0,
  timer6C: 0,
  renderCounter7B: 0,
  ...patch,
});

describe("neutral packed4 runtime palette", () => {
  it("derives health depth from signed6A/64 words, never camera Z", () => {
    expect(neutralPacked4Depth(8, 160, 160)).toBe(0);
    expect(neutralPacked4Depth(8, 80, 160)).toBe(4);
    expect(neutralPacked4Depth(8, 0, 160)).toBe(8);
    expect(neutralPacked4Depth(8, 1, 3)).toBe(6);
    expect(neutralPacked4Depth(8, -1, 3)).toBe(10);
    expect(neutralPacked4Depth(8, 160, 80)).toBe(248); // original low byte
    expect(neutralPacked4Depth(26, 0, 0)).toBe(0); // division is bypassed
    expect(neutralPacked4Depth(255, 0, 0)).toBe(0);
    expect(() => neutralPacked4Depth(8, 0, 0)).toThrow("zero");
    expect(() => neutralPacked4Depth(8, 32768, 3)).toThrow("current6A");
  });

  it("selects the actual ordinary fade row and rejects the unbound special branch", () => {
    expect(neutralPacked4Shade(0, 123456, 0, 0)).toBe(0);
    expect(neutralPacked4Shade(2, 255, 0, 0)).toBe(3);
    expect(neutralPacked4Shade(1, -128, 0, 0)).toBe(0);
    expect(neutralPacked4Shade(255, 10000, 0, 0)).toBe(31);
    expect(() => neutralPacked4Shade(1, -256, 0, 0)).toThrow("negative");
    expect(() => neutralPacked4Shade(1, 0, 0x10, 0)).toThrow("special parity");
    expect(neutralPacked4Shade(1, 0, 0x10, 1)).toBe(1);
  });

  it("matches source pointer XOR parity across pitch, clipping, negative origin and both seed bits", () => {
    for (const pitch of [640, 641, 65535])
      for (const y of [0, 1, 2, 479])
        for (const x of [0, 1, 2, 639])
          for (const originX of [-13, -2, 0, 7])
            for (const seed of [false, true]) {
              const pointer = BigInt(y) * BigInt(pitch) + BigInt(x);
              const original =
                Number((pointer ^ BigInt(originX)) & 1n) ^ Number(seed);
              expect(
                neutralPacked4Bank(
                  pixel({
                    screenX: x,
                    screenY: y,
                    pitch,
                    componentOriginX: originX,
                    clipFlagBit0: seed,
                  }),
                ),
              ).toBe(original ? 208 : 192);
            }
    expect(neutralPacked4Bank(pixel({ screenX: 4, componentOriginX: 3 }))).toBe(
      208,
    );
    expect(neutralPacked4Bank(pixel({ screenX: 4, componentOriginX: 4 }))).toBe(
      192,
    );
  });

  it("uses strict nibble<depth and threshold135-minus-quarter before fade", () => {
    expect(neutralPacked4PaletteIndex(0, pixel())).toBe(192);
    expect(neutralPacked4PaletteIndex(0, pixel({ screenX: 1 }))).toBe(208);
    for (const n of [0, 1, 2, 3])
      expect(neutralPacked4PaletteIndex(n, pixel({ depth: 4 }))).toBe(135);
    expect(neutralPacked4PaletteIndex(4, pixel({ depth: 4 }))).toBe(196);
    expect(neutralPacked4PaletteIndex(4, pixel({ depth: 5 }))).toBe(134);
    expect(neutralPacked4PaletteIndex(15, pixel({ depth: 255 }))).toBe(132);
    expect(() => neutralPacked4PaletteIndex(16, pixel())).toThrow("nibble");
  });

  it("requires and applies FADE even for row0 and opaque literalzero", () => {
    const fade = identity();
    fade[192] = 23;
    fade[209] = 31;
    fade[135] = 47;
    const colors = packed4PaletteLookup(rgb(), fade);
    const context = {
      frameOrigin: [0, 0] as const,
      componentOriginX: 0,
      clipFlagBit0: false,
      depth: 0,
      pitch: 640,
      viewport: [640, 480] as const,
      paletteLookup: colors,
    };
    const f = frame(2, 1, [0, 1]);
    const result = composeNeutralPacked4Frame(f, context);
    expect(Array.from(result.rgba)).toEqual([23, 23, 23, 255, 31, 31, 31, 255]);
    expect(result.written).toBe(2);
    expect(
      Array.from(
        composeNeutralPacked4Frame(f, { ...context, depth: 1 }).rgba,
      ).slice(0, 4),
    ).toEqual([47, 47, 47, 255]);
  });

  it("keeps alternation in destination space after horizontal/vertical texture flips", () => {
    const original = frame(4, 2, [0, 1, 2, 3, 4, 5, 6, 7]);
    const flipX = frame(4, 2, [3, 2, 1, 0, 7, 6, 5, 4]);
    const flipY = frame(4, 2, [4, 5, 6, 7, 0, 1, 2, 3]);
    const context = {
      frameOrigin: [10, 20] as const,
      componentOriginX: 10,
      clipFlagBit0: false,
      depth: 0,
      pitch: 640,
      viewport: [640, 480] as const,
      paletteLookup: lookup(),
    };
    for (const f of [original, flipX, flipY]) {
      const result = composeNeutralPacked4Frame(f, context).rgba;
      for (let i = 0; i < 8; i++)
        expect(result[i * 4] - f.indices[i]).toBe(i % 2 ? 208 : 192);
    }
    const odd = composeNeutralPacked4Frame(frame(2, 2, [0, 0, 0, 0]), {
      ...context,
      pitch: 641,
    }).rgba;
    expect([odd[0], odd[4], odd[8], odd[12]]).toEqual([192, 208, 208, 192]);
  });

  it("clips in logical screen space and rejects inconsistent opacity atomically", () => {
    const f = frame(3, 1, [0, 1, 2]);
    const context = {
      frameOrigin: [-1, 0] as const,
      componentOriginX: -1,
      clipFlagBit0: false,
      depth: 0,
      pitch: 640,
      viewport: [640, 480] as const,
      paletteLookup: lookup(),
    };
    const result = composeNeutralPacked4Frame(f, context);
    expect(result).toMatchObject({ written: 2, clipped: 1 });
    expect(Array.from(result.rgba).slice(0, 4)).toEqual([0, 0, 0, 0]);
    const saved = Array.from(f.bank192);
    (f.bank208 as Uint8Array)[3] = 0;
    expect(() => composeNeutralPacked4Frame(f, context)).toThrow(
      "opacity mismatch",
    );
    expect(Array.from(f.bank192)).toEqual(saved);
  });

  it("wires raw nibble textures, source lookup and live logical-screen shader context", () => {
    const indices = packed4IndexTexture(2, 2, [0, 1, 2, 3]);
    expect(Array.from(indices.image.data as Uint8Array)).toEqual([2, 3, 0, 1]);
    expect(indices.colorSpace).toBe(THREE.NoColorSpace);
    expect(indices.flipY).toBe(false);
    expect(indices.magFilter).toBe(THREE.NearestFilter);
    const paletteLookup = packed4LookupTexture(lookup());
    expect(paletteLookup.colorSpace).toBe(THREE.SRGBColorSpace);
    const textures = {
      bank192: new THREE.Texture(),
      bank208: new THREE.Texture(),
      indices,
      paletteLookup,
    };
    // The frame cache also carries component geometry; validate only samplers.
    const frame = { ...textures, componentLeft: 94 };
    const material = createNeutralPacked4Material(frame, screen());
    expect(material.uniforms.rawIndices.value).toBe(indices);
    expect(material.uniforms.paletteLookup.value).toBe(paletteLookup);
    expect(material.uniforms.neutralOpacity.value).toBe(1);
    expect(material.fragmentShader).toContain("gl_FragCoord");
    expect(material.fragmentShader).toContain("nibble < healthDepth");
    updateNeutralPacked4Material(
      material,
      screen({
        componentOriginX: -4,
        depth: 6,
        clipFlagBit0: true,
        physicalPixelsPerLogicalPixel: [1.5, 1.5],
      }),
    );
    expect(material.uniforms.healthDepth.value).toBe(6);
    expect(material.uniforms.clipFlagBit0.value).toBe(1);
    expect(material.uniforms.componentOriginX.value).toBe(-4);
    expect(
      (
        material.uniforms.physicalPixelsPerLogicalPixel.value as THREE.Vector2
      ).toArray(),
    ).toEqual([1.5, 1.5]);
    expect(() =>
      createNeutralPacked4Material(
        { ...textures, paletteLookup: undefined } as never,
        screen(),
      ),
    ).toThrow("lookup textures");
    material.dispose();
    indices.dispose();
    paletteLookup.dispose();
  });

  it("rejects missing source extents and invalid screen context", () => {
    expect(() => packed4PaletteLookup(rgb(), new Uint8Array(255))).toThrow(
      "extent",
    );
    expect(() => packed4IndexTexture(2, 2, [0, 1, 2, 16])).toThrow("nibble");
    expect(() => neutralPacked4Bank(pixel({ pitch: 0 }))).toThrow("pitch");
    const textures = {
      bank192: new THREE.Texture(),
      bank208: new THREE.Texture(),
      indices: new THREE.Texture(),
      paletteLookup: new THREE.Texture(),
    };
    expect(() =>
      createNeutralPacked4Material(
        textures,
        screen({ physicalPixelsPerLogicalPixel: [0, 1] }),
      ),
    ).toThrow("scale");
  });
});
describe("kind1 owned packed4 runtime palette", () => {
  it("uses a single actual player bank across every nibble/parity and the same strict health threshold", () => {
    for (const owner of [0, 1, 2, 3] as const)
      for (let n = 0; n < 16; n++) {
        expect(ownedPacked4PaletteIndex(n, { owner, depth: 0 })).toBe(
          192 + 16 * owner + n,
        );
        expect(ownedPacked4PaletteIndex(n, { owner, depth: n })).toBe(
          192 + 16 * owner + n,
        );
        expect(ownedPacked4PaletteIndex(n, { owner, depth: n + 1 })).toBe(
          135 - (n >> 2),
        );
      }
    expect(() =>
      ownedPacked4PaletteIndex(0, { owner: 4 as never, depth: 0 }),
    ).toThrow("owned player");
    expect(
      ownedPacked4Profile(owned({ state: 26, current6A: 0, max64: 0 })).depth,
    ).toBe(0);
  });
  it("preserves ordinary NULL-fade gates and nonidentity FADE rowzero", () => {
    expect(ownedPacked4Profile(owned()).fadeRow).toBe(0);
    expect(ownedPacked4Profile(owned({ flags15: 2 })).fadeRow).toBe(null);
    expect(ownedPacked4Profile(owned({ rawShade: 29 })).fadeRow).toBe(29);
    expect(ownedPacked4Profile(owned({ rawShade: 30 })).fadeRow).toBe(null);
    expect(ownedPacked4Profile(owned({ rawShade: 255 }))).toMatchObject({
      shade: 31,
      fadeRow: null,
    });
    expect(
      ownedPacked4Profile(owned({ rawShade: 0, virtualHeight: 999999 })).shade,
    ).toBe(0);
    expect(() =>
      ownedPacked4Profile(owned({ rawShade: 1, virtualHeight: -256 })),
    ).toThrow("negative");
  });
  it("selects the source state18 fade tail using signed timer6C", () => {
    for (const [timer, shade] of [
      [-31, 0],
      [0, 31],
      [29, 60],
      [30, 62],
      [32767, 62],
    ])
      expect(
        ownedPacked4Profile(owned({ state: 18, rawShade: 1, timer6C: timer })),
      ).toMatchObject({ shade, fadeRow: shade });
    expect(
      ownedPacked4Profile(owned({ state: 18, rawShade: 0, timer6C: 30 }))
        .fadeRow,
    ).toBe(0);
    expect(
      ownedPacked4Profile(
        owned({ state: 18, rawShade: 1, flags15: 2, timer6C: 30 }),
      ).fadeRow,
    ).toBe(null);
    expect(() =>
      ownedPacked4Profile(owned({ state: 18, rawShade: 1, timer6C: -32 })),
    ).toThrow("negative");
  });
  it("uses exact source frame+ID parity for the highlight row16 before ordinary fade gates", () => {
    for (const sourceFrame of [0, 1, 2, 0xffffffff])
      for (const entityId of [0, 1, 255, 256, 65535]) {
        const p = ownedPacked4Profile(
          owned({ rawShade: 30, flags15: 0x12, sourceFrame, entityId }),
        );
        expect(p.fadeRow).toBe((sourceFrame + entityId) & 1 ? 16 : null);
      }
    expect(
      ownedPacked4Profile(
        owned({
          rawShade: 1,
          flags15: 0x10,
          sourceFrame: 1,
          globalShadowMode: 1,
        }),
      ).fadeRow,
    ).toBe(1);
    expect(
      ownedPacked4Profile(owned({ rawShade: 0, flags15: 0x10, sourceFrame: 1 }))
        .fadeRow,
    ).toBe(0);
  });
  it("rejects the separate unimported7B remap instead of substituting an owner bank", () => {
    for (const renderCounter7B of [1, 63, 64, 127, 128, 191])
      expect(() => ownedPacked4Profile(owned({ renderCounter7B }))).toThrow(
        "116DA8",
      );
    for (const renderCounter7B of [0, 192, 255])
      expect(ownedPacked4Profile(owned({ renderCounter7B })).paletteBase).toBe(
        192,
      );
    // Source highlight branch bypasses the7B remap dispatch entirely.
    expect(
      ownedPacked4Profile(
        owned({ renderCounter7B: 1, rawShade: 1, flags15: 16, sourceFrame: 1 }),
      ).fadeRow,
    ).toBe(16);
  });
  it("selects the source ICE row, bank and health ink across 7B and shade boundaries", () => {
    for (const owner of [0, 1, 2, 3] as const)
      for (const counter of [1, 63, 64, 127, 128, 191])
        for (const shade of [0, 4, 28, 31, 32, 60, 62]) {
          const source =
            shade < 32
              ? owned({ owner, renderCounter7B: counter, rawShade: shade })
              : owned({
                  owner,
                  renderCounter7B: counter,
                  rawShade: 1,
                  state: 18,
                  timer6C: shade === 62 ? 30 : shade - 31,
                });
          const profile = ownedPacked4Profile(source, true);
          const base = Math.floor((shade >= 32 ? shade - 32 : shade) / 4) * 32;
          expect(profile).toMatchObject({
            shade,
            paletteBase: base,
            thresholdBase: base + 19,
            iceRow: owner * 6 + Math.floor(counter / 64) * 2,
            fadeRow: null,
          });
          for (let nibble = 0; nibble < 16; nibble++)
            for (const depth of [0, 3, 8, 16])
              expect(
                ownedPacked4PaletteIndex(nibble, {
                  owner,
                  depth,
                  paletteBase: profile.paletteBase,
                  thresholdBase: profile.thresholdBase,
                }),
              ).toBe(
                nibble < depth
                  ? base + 19 - Math.floor(nibble / 4)
                  : base + nibble,
              );
        }
    expect(
      ownedPacked4Profile(owned({ renderCounter7B: 1, flags15: 2 })),
    ).toMatchObject({ iceRow: null, paletteBase: 0, thresholdBase: 19 });
  });
  it("composes raw nibbles with the selected source lookup and ignores destination parity for owners", () => {
    const f = frame(4, 1, [0, 1, 4, 15]),
      fade = identity();
    fade[240] = 23;
    fade[241] = 31;
    fade[244] = 47;
    const context = {
      owner: 3 as const,
      frameOrigin: [0, 0] as const,
      componentOriginX: 0,
      clipFlagBit0: false,
      depth: 0,
      pitch: 640,
      viewport: [640, 480] as const,
      paletteLookup: packed4PaletteLookup(rgb(), fade),
    };
    const a = composeOwnedPacked4Frame(f, context),
      b = composeOwnedPacked4Frame(f, {
        ...context,
        clipFlagBit0: true,
        componentOriginX: 1,
      });
    expect(a.rgba).toEqual(b.rgba);
    expect([a.rgba[0], a.rgba[4], a.rgba[8], a.rgba[12]]).toEqual([
      23, 31, 47, 255,
    ]);
    const threshold = composeOwnedPacked4Frame(f, {
      ...context,
      depth: 5,
      paletteLookup: lookup(),
    });
    expect([
      threshold.rgba[0],
      threshold.rgba[4],
      threshold.rgba[8],
      threshold.rgba[12],
    ]).toEqual([135, 135, 134, 255]);
  });
  it("binds only four samplers with numeric frame metadata and updates owner/neutral transitions", () => {
    const textures = {
      bank192: new THREE.Texture(),
      bank208: new THREE.Texture(),
      indices: new THREE.Texture(),
      paletteLookup: packed4LookupTexture(lookup()),
      componentLeft: 94,
    };
    const material = createOwnedPacked4Material(textures, {
      ...screen(),
      owner: 3,
    });
    expect(material.uniforms.paletteBase.value).toBe(240);
    expect(material.uniforms.bankStride.value).toBe(0);
    updateOwnedPacked4Material(material, { ...screen({ depth: 4 }), owner: 1 });
    expect(material.uniforms.paletteBase.value).toBe(208);
    expect(material.uniforms.healthDepth.value).toBe(4);
    updateOwnedPacked4Material(material, {
      ...screen(),
      owner: 2,
      paletteBase: 64,
      thresholdBase: 83,
    });
    expect(material.uniforms.paletteBase.value).toBe(64);
    expect(material.uniforms.thresholdBase.value).toBe(83);
    updateNeutralPacked4Material(material, screen());
    expect(material.uniforms.thresholdBase.value).toBe(135);
    expect(material.uniforms.paletteBase.value).toBe(192);
    expect(material.uniforms.bankStride.value).toBe(16);
    for (const name of [
      "bank192",
      "bank208",
      "indices",
      "paletteLookup",
    ] as const)
      expect(() =>
        createOwnedPacked4Material(
          { ...textures, [name]: undefined } as never,
          { ...screen(), owner: 0 },
        ),
      ).toThrow("lookup textures");
    material.dispose();
    for (const name of [
      "bank192",
      "bank208",
      "indices",
      "paletteLookup",
    ] as const)
      textures[name].dispose();
  });
});

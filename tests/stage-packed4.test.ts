import { describe, expect, it } from "vitest";
import type { Asset, Pack } from "../src/content/types";
import * as THREE from "three";
import {
  Stage,
  type SceneEntity,
  type SceneOwnedPacked4Context,
} from "../src/render/stage";

type RawStage = {
  rawPacked4Frame(
    art: string,
    asset: Asset,
    frame: number,
  ): { indices: Uint8Array; componentLeft: number };
  packed4Lookup(shade: number | null): import("three").DataTexture;
  packed4IceLookup(row: number): import("three").DataTexture;
  syncScene: Stage["syncScene"];
};
function asset(flags = 0): Asset {
  return {
    kind: "animation",
    image: "data:image/png;base64,synthetic",
    sprites: [[0, 0, 2, 2]],
    frames: [
      {
        components: [[0, -2, -3, flags, 0]],
        width: 2,
        height: 2,
        rawFlags: [1, 0, 0],
      },
    ],
    packed4: {
      indices: btoa(String.fromCharCode(1, 2, 3, 4)),
      opacity: btoa(String.fromCharCode(1, 0, 1, 1)),
      pixelSha256: "synthetic",
    },
  };
}
function bareStage(pack: Partial<Pack> = {}): RawStage {
  const stage = Object.create(Stage.prototype);
  Object.assign(stage, {
    pack,
    packed4Streams: new Map(),
    packed4Lookups: new Map(),
    iceLookups: new Map(),
    iceBytes: null,
    fadeBytes: null,
    sceneRequest: 0,
    disposed: false,
    sceneSprites: new Map(),
  });
  return stage;
}

describe("Stage neutral packed4 binding", () => {
  it("places the raw nibble plane at the same frame anchor under every canvas flip", () => {
    for (const flags of [0, 1, 2, 3]) {
      const source = asset(flags),
        saved = JSON.stringify(source),
        stage = bareStage(),
        raw = stage.rawPacked4Frame("MULE", source, 0);
      const left = flags & 1 ? 124 : 126,
        top = flags & 2 ? 155 : 157;
      const rows =
        flags === 0
          ? [
              [1, 0],
              [3, 4],
            ]
          : flags === 1
            ? [
                [0, 1],
                [4, 3],
              ]
            : flags === 2
              ? [
                  [3, 4],
                  [1, 0],
                ]
              : [
                  [4, 3],
                  [0, 1],
                ];
      expect(raw.componentLeft).toBe(left);
      for (let y = 0; y < 2; y++)
        for (let x = 0; x < 2; x++)
          expect(raw.indices[(top + y) * 256 + left + x]).toBe(rows[y][x]);
      expect(raw.indices.reduce((sum, value) => sum + value, 0)).toBe(8);
      expect(JSON.stringify(source)).toBe(saved);
    }
  });

  it("clips raw frame pixels and rejects unsupported layouts or malformed streams", () => {
    const source = asset();
    source.frames![0].components[0][1] = -129;
    expect(
      bareStage()
        .rawPacked4Frame("BONES", source, 0)
        .indices.reduce((a, b) => a + b, 0),
    ).toBe(4);
    const multiple = asset();
    multiple.frames![0].components.push([0, 0, 0, 0, 0]);
    expect(() => bareStage().rawPacked4Frame("MULE", multiple, 0)).toThrow(
      "component layout",
    );
    const unsupported = asset(4);
    expect(() => bareStage().rawPacked4Frame("MULE", unsupported, 0)).toThrow(
      "flags/reference",
    );
    const short = asset();
    short.packed4!.indices = btoa("x");
    expect(() => bareStage().rawPacked4Frame("MULE", short, 0)).toThrow(
      "extent mismatch",
    );
    const invalid = asset();
    invalid.packed4!.opacity = btoa(String.fromCharCode(1, 2, 1, 1));
    expect(() => bareStage().rawPacked4Frame("MULE", invalid, 0)).toThrow(
      "raw pixel",
    );
  });

  it("builds and shares a source FADE lookup even when rowzero is nonidentity", () => {
    const fade = Uint8Array.from({ length: 16384 }, (_, i) => i & 255);
    fade[192] = 23;
    const mainRgb8 = Array.from(
      { length: 256 },
      (_, i) => [i, i, i] as [number, number, number],
    );
    const stage = bareStage({
        palettes: {
          mainRgb8,
          fadeBase64: btoa(String.fromCharCode(...fade)),
          fadeSha256: "synthetic",
        },
      }),
      texture = stage.packed4Lookup(0);
    expect(stage.packed4Lookup(0)).toBe(texture);
    expect(
      Array.from(
        (texture.image.data as Uint8Array).slice(192 * 4, 192 * 4 + 4),
      ),
    ).toEqual([23, 23, 23, 255]);
    expect(() => bareStage().packed4Lookup(0)).toThrow("MAIN palette and FADE");
    texture.dispose();
  });

  it("uses the requested ICE row independently from cached FADE rows", () => {
    const ice = Uint8Array.from(
      { length: 6144 },
      (_, i) => (i + Math.floor(i / 256) * 7) & 255,
    );
    const stage = bareStage({
      palettes: {
        mainRgb8: Array.from(
          { length: 256 },
          (_, i) => [i, i, i] as [number, number, number],
        ),
        fadeBase64: btoa(String.fromCharCode(...new Uint8Array(16384))),
        fadeSha256: "synthetic",
        iceBase64: btoa(String.fromCharCode(...ice)),
      },
    });
    const texture = stage.packed4IceLookup(8);
    expect(stage.packed4IceLookup(8)).toBe(texture);
    expect(
      Array.from((texture.image.data as Uint8Array).slice(20, 24)),
    ).toEqual([61, 61, 61, 255]);
    expect(() => stage.packed4IceLookup(24)).toThrow("ICE");
    texture.dispose();
  });
  it("rejects missing owner context before touching existing scene objects or input", async () => {
    const source = asset(),
      stage = bareStage({ assets: { MULE: source } });
    const existing = new Map([["old", { mesh: "sentinel" }]]);
    Object.assign(stage, {
      sceneSprites: existing,
      actors: {
        remove() {
          throw new Error("Visible mutation");
        },
      },
    });
    const entity = Object.freeze({
      id: "mule",
      x: 1,
      y: 2,
      art: "MULE",
      frame: 0,
    });
    await expect(stage.syncScene(Object.freeze([entity]))).rejects.toThrow(
      "source context required",
    );
    expect(existing.get("old")).toEqual({ mesh: "sentinel" });
    expect(entity).toEqual({ id: "mule", x: 1, y: 2, art: "MULE", frame: 0 });
  });
});
function ownedContext(
  patch: Partial<SceneOwnedPacked4Context> = {},
): SceneOwnedPacked4Context {
  return {
    owner: 0,
    state: 8,
    current6A: 160,
    max64: 160,
    rawShade: 0,
    virtualHeight: 0,
    flags15: 0,
    globalShadowMode: 0,
    clipFlagBit0: false,
    sourceFrame: 0,
    entityId: 0,
    timer6C: 0,
    renderCounter7B: 0,
    ...patch,
  };
}
function preparedStage() {
  const fade = Uint8Array.from({ length: 16384 }, (_, i) => i & 255);
  fade[192] = 23;
  fade[240] = 47;
  fade[135] = 63;
  const stage = bareStage({
    assets: { MULE: asset() },
    palettes: {
      mainRgb8: Array.from(
        { length: 256 },
        (_, i) => [i, i, i] as [number, number, number],
      ),
      fadeBase64: btoa(String.fromCharCode(...fade)),
      fadeSha256: "synthetic",
    },
  });
  const actors = new THREE.Group(),
    sprites = new Map();
  Object.assign(stage, {
    actors,
    sceneSprites: sprites,
    camera: new THREE.OrthographicCamera(-15, 15, 10, -10, 0.1, 1000),
    heightAt: () => 0,
    packed4Frame: async () => ({
      bank192: new THREE.Texture(),
      bank208: new THREE.Texture(),
      indices: new THREE.Texture(),
      componentLeft: 94,
    }),
  });
  return { stage, actors, sprites };
}
describe("Stage owned packed4 binding", () => {
  it("creates real shader objects from typed owner context and source raw lookup without mutating scene input", async () => {
    const { stage, actors, sprites } = preparedStage();
    const context = Object.freeze(ownedContext({ owner: 3, current6A: 80 })),
      entity: SceneEntity = Object.freeze({
        id: "owned",
        art: "MULE",
        frame: 0,
        x: 1,
        y: 2,
        ownedPacked4: context,
      });
    const saved = JSON.stringify(entity);
    await stage.syncScene(Object.freeze([entity]));
    const item = sprites.get("owned"),
      shader = item.mesh.material as THREE.ShaderMaterial;
    expect(shader.isShaderMaterial).toBe(true);
    expect(actors.children).toHaveLength(1);
    expect(shader.uniforms.paletteBase.value).toBe(240);
    expect(shader.uniforms.bankStride.value).toBe(0);
    expect(shader.uniforms.healthDepth.value).toBe(4);
    expect(shader.uniforms.rawIndices.value.isTexture).toBe(true);
    const lookup = shader.uniforms.paletteLookup.value.image.data as Uint8Array;
    expect(Array.from(lookup.slice(240 * 4, 240 * 4 + 4))).toEqual([
      47, 47, 47, 255,
    ]);
    expect(Array.from(lookup.slice(135 * 4, 135 * 4 + 4))).toEqual([
      63, 63, 63, 255,
    ]);
    expect(JSON.stringify(entity)).toBe(saved);
  });
  it("binds an active ICE remap then restores ordinary owner uniforms", async () => {
    const { stage, sprites } = preparedStage();
    const ice = Uint8Array.from(
      { length: 6144 },
      (_, i) => (i + Math.floor(i / 256) * 7) & 255,
    );
    (stage as unknown as { pack: Pack }).pack.palettes!.iceBase64 = btoa(
      String.fromCharCode(...ice),
    );
    const e: SceneEntity = {
      id: "mule",
      art: "MULE",
      frame: 0,
      x: 1,
      y: 2,
      ownedPacked4: ownedContext({
        owner: 2,
        renderCounter7B: 64,
        rawShade: 9,
      }),
    };
    await stage.syncScene([e]);
    const shader = sprites.get("mule").mesh.material as THREE.ShaderMaterial;
    expect(shader.uniforms.paletteBase.value).toBe(64);
    expect(shader.uniforms.thresholdBase.value).toBe(83);
    const data = shader.uniforms.paletteLookup.value.image.data as Uint8Array;
    expect(Array.from(data.slice(64 * 4, 64 * 4 + 4))).toEqual([
      162, 162, 162, 255,
    ]);
    await stage.syncScene([{ ...e, ownedPacked4: ownedContext({ owner: 2 }) }]);
    expect(shader.uniforms.paletteBase.value).toBe(224);
    expect(shader.uniforms.thresholdBase.value).toBe(135);
  });
  it("binds actual NULL-fade identity and changes owner/neutral wrappers without a replacement preview", async () => {
    const { stage, sprites } = preparedStage(),
      e: SceneEntity = {
        id: "mule",
        art: "MULE",
        frame: 0,
        x: 1,
        y: 2,
        ownedPacked4: ownedContext({ flags15: 2 }),
      };
    await stage.syncScene([e]);
    const shader = sprites.get("mule").mesh.material as THREE.ShaderMaterial;
    expect(
      Array.from(
        shader.uniforms.paletteLookup.value.image.data.slice(
          192 * 4,
          192 * 4 + 4,
        ),
      ),
    ).toEqual([192, 192, 192, 255]);
    await stage.syncScene([{ ...e, ownedPacked4: ownedContext({ owner: 2 }) }]);
    expect(sprites.get("mule").mesh.material).toBe(shader);
    expect(shader.uniforms.paletteBase.value).toBe(224);
    await stage.syncScene([
      {
        ...e,
        ownedPacked4: undefined,
        neutralPacked4: {
          state: 8,
          current6A: 160,
          max64: 160,
          rawShade: 0,
          virtualHeight: 0,
          flags15: 0,
          globalShadowMode: 0,
          clipFlagBit0: false,
        },
      },
    ]);
    expect(shader.uniforms.paletteBase.value).toBe(192);
    expect(shader.uniforms.bankStride.value).toBe(16);
  });
  it("rejects conflicting owner contexts, missing owned fields and unimported remap before visible mutation", async () => {
    const { stage, actors } = preparedStage(),
      e: SceneEntity = {
        id: "mule",
        art: "MULE",
        frame: 0,
        x: 1,
        y: 2,
        ownedPacked4: ownedContext(),
      };
    const neutral = {
      state: 8,
      current6A: 160,
      max64: 160,
      rawShade: 0,
      virtualHeight: 0,
      flags15: 0,
      globalShadowMode: 0,
      clipFlagBit0: false,
    };
    await expect(
      stage.syncScene([{ ...e, neutralPacked4: neutral }]),
    ).rejects.toThrow("Exactly one");
    await expect(
      stage.syncScene([
        { ...e, ownedPacked4: { ...ownedContext(), owner: 4 as never } },
      ]),
    ).rejects.toThrow("owned player");
    await expect(
      stage.syncScene([
        {
          ...e,
          ownedPacked4: { ...ownedContext(), sourceFrame: undefined as never },
        },
      ]),
    ).rejects.toThrow("source frame");
    await expect(
      stage.syncScene([
        { ...e, ownedPacked4: ownedContext({ renderCounter7B: 1 }) },
      ]),
    ).rejects.toThrow("116DA8");
    expect(actors.children).toHaveLength(0);
  });
});

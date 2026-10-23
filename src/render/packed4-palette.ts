/** Neutral owner4 foreground palette path59470 ->94F30 ->93F80.
 * Source-indexed FADE happens after health-depth/bank selection. */
import * as THREE from "three";

export const NEUTRAL_PACKED4_THRESHOLD = 135;
export interface NeutralPacked4PixelContext {
  /** Top-left logical destination coordinates, not UV/source texel parity. */
  screenX: number;
  screenY: number;
  /** Original indexed destination row stride in pixels/bytes. */
  pitch: number;
  /** Actual scaled component origin passed to93F80, before clipping. */
  componentOriginX: number;
  /** Source19CFAC bit0 at wrapper entry. */
  clipFlagBit0: boolean;
  /** Health-derived byte, unrelated to camera Z/depth-buffer ordering. */
  depth: number;
}
function integer(n: number, low: number, high: number, name: string): void {
  if (!Number.isInteger(n) || n < low || n > high)
    throw new Error("Invalid packed4 " + name);
}
function bytes(values: ArrayLike<number>, length: number, name: string): void {
  if (values.length !== length)
    throw new Error("Invalid packed4 " + name + " extent");
  for (let i = 0; i < length; i++) integer(values[i], 0, 255, name);
}
/**59470 forces0 for state>=26. Otherwise the signed16 numerator/max are
 * divided toward0, subtracted from8 and passed in the low byte. */
export function neutralPacked4Depth(
  state: number,
  current6a: number,
  maximum64: number,
): number {
  integer(state, 0, 255, "source state");
  if (state >= 26) return 0;
  integer(current6a, -32768, 32767, "current6A");
  integer(maximum64, -32768, 32767, "maximum64");
  if (maximum64 === 0) throw new Error("Packed4 source maximum64 is zero");
  return (8 - Math.trunc((current6a * 8) / maximum64)) & 255;
}
/** Ordinary raw-zero / height-adjusted fade-row admission. The separate
 * parity-dependent recolor branch rejects until its own inputs are provided. */
export function neutralPacked4Shade(
  rawShade: number,
  virtualHeight: number,
  flags15: number,
  globalShadowMode: number,
): number {
  integer(rawShade, 0, 255, "raw shade");
  integer(virtualHeight, -0x80000000, 0x7fffffff, "virtual height");
  integer(flags15, 0, 255, "record flags15");
  integer(globalShadowMode, 0, 255, "shadow mode");
  const adjusted = rawShade === 0 ? 0 : rawShade + (virtualHeight >> 7);
  if (adjusted < 0)
    throw new Error(
      "Packed4 negative fade row requires unsupported source branch",
    );
  const row = Math.min(31, adjusted);
  if (globalShadowMode === 0 && row !== 0 && flags15 & 0x10)
    throw new Error("Packed4 special parity recolor branch is not admitted");
  return row;
}
export function neutralPacked4Bank(
  context: NeutralPacked4PixelContext,
): 192 | 208 {
  for (const [n, name] of [
    [context.screenX, "screen X"],
    [context.screenY, "screen Y"],
    [context.componentOriginX, "component origin X"],
  ] as const)
    integer(n, -0x80000000, 0x7fffffff, name);
  integer(context.pitch, 1, 65536, "pitch");
  integer(context.depth, 0, 255, "depth");
  if (typeof context.clipFlagBit0 !== "boolean")
    throw new Error("Packed4 source clip flag is required");
  // Only the low pointer bit participates. Avoid loss of parity in a large
  // screenY*pitch floating-point product and preserve negative coordinates.
  const pointerParity =
    (context.screenY & 1 & (context.pitch & 1)) ^
    (context.screenX & 1) ^
    (context.componentOriginX & 1);
  return Number(context.clipFlagBit0) ^ pointerParity ? 208 : 192;
}
/** Raw kind1 owner0..3 fields for59470's94910/94D70 foreground wrapper. */
export interface OwnedPacked4SourceContext {
  owner: 0 | 1 | 2 | 3;
  state: number;
  current6A: number;
  max64: number;
  rawShade: number;
  virtualHeight: number;
  flags15: number;
  globalShadowMode: number;
  sourceFrame: number;
  entityId: number;
  timer6C: number;
  renderCounter7B: number;
}
export interface OwnedPacked4Profile {
  depth: number;
  shade: number;
  paletteBase: number;
  /** null is the source NULL fade pointer: identity, including threshold ink. */
  fadeRow: number | null;
}
/**59470 selects one owner bank, not the neutral alternating pair. Ordinary
 * flags15&2 or shade>=30 pass NULL fade; state18 has its own31..62 fade tail.
 * The parity-highlight branch supplies row16 directly before those gates.
 */
export function ownedPacked4Profile(
  c: OwnedPacked4SourceContext,
): OwnedPacked4Profile {
  integer(c.owner, 0, 3, "owned player");
  integer(c.rawShade, 0, 255, "raw shade");
  integer(c.virtualHeight, -0x80000000, 0x7fffffff, "virtual height");
  integer(c.flags15, 0, 255, "record flags15");
  integer(c.globalShadowMode, 0, 255, "shadow mode");
  integer(c.sourceFrame, 0, 0xffffffff, "source frame");
  integer(c.entityId, 0, 65535, "source entity ID");
  integer(c.timer6C, -32768, 32767, "timer6C");
  integer(c.renderCounter7B, 0, 255, "render counter7B");
  const depth = neutralPacked4Depth(c.state, c.current6A, c.max64),
    adjusted = c.rawShade === 0 ? 0 : c.rawShade + (c.virtualHeight >> 7);
  if (adjusted < 0)
    throw new Error(
      "Packed4 negative fade row requires unsupported source branch",
    );
  let shade = Math.min(31, adjusted);
  const highlight =
    c.globalShadowMode === 0 &&
    shade !== 0 &&
    !!(c.flags15 & 0x10) &&
    ((c.sourceFrame + c.entityId) & 1) !== 0;
  const paletteBase = (192 + c.owner * 16) & 255;
  if (highlight) return { depth, shade, paletteBase, fadeRow: 16 };
  if (shade !== 0 && c.state === 18) {
    shade = c.timer6C < 30 ? c.timer6C + 31 : 62;
    if (shade < 0) throw new Error("Packed4 negative state18 fade row");
  }
  if (c.renderCounter7B > 0 && c.renderCounter7B < 192)
    throw new Error(
      "Packed4 owner7B remap requires original116DA8 runtime palette profile",
    );
  return {
    depth,
    shade,
    paletteBase,
    fadeRow: c.flags15 & 2 || (shade >= 30 && c.state !== 18) ? null : shade,
  };
}
export function ownedPacked4PaletteIndex(
  nibble: number,
  context: { owner: 0 | 1 | 2 | 3; depth: number },
): number {
  integer(nibble, 0, 15, "raw nibble");
  integer(context.owner, 0, 3, "owned player");
  integer(context.depth, 0, 255, "depth");
  return nibble < context.depth
    ? (135 - (nibble >> 2)) & 255
    : 192 + context.owner * 16 + nibble;
}
/** The health threshold branch precedes fade and overrides either color bank. */
export function neutralPacked4PaletteIndex(
  nibble: number,
  context: NeutralPacked4PixelContext,
): number {
  integer(nibble, 0, 15, "raw nibble");
  const base = neutralPacked4Bank(context);
  return nibble < context.depth
    ? (NEUTRAL_PACKED4_THRESHOLD - (nibble >> 2)) & 255
    : base + nibble;
}
/** RGB output for every possible post-selection palette index. Even FADE row0
 * is supplied: the admitted original row0 is not an identity mapping. */
export function packed4PaletteLookup(
  mainRgb: ArrayLike<number>,
  fadeRow: ArrayLike<number>,
): Uint8Array {
  bytes(mainRgb, 768, "MAIN palette RGB");
  bytes(fadeRow, 256, "FADE row");
  const rgba = new Uint8Array(1024);
  for (let index = 0; index < 256; index++) {
    const source = fadeRow[index] * 3;
    rgba[index * 4] = mainRgb[source];
    rgba[index * 4 + 1] = mainRgb[source + 1];
    rgba[index * 4 + 2] = mainRgb[source + 2];
    rgba[index * 4 + 3] = 255;
  }
  return rgba;
}
export interface NeutralPacked4Frame {
  width: number;
  height: number;
  /** Same-UV, already-composited RGBA frame planes; opacity must match. */
  bank192: ArrayLike<number>;
  bank208: ArrayLike<number>;
  /** Matching topmost component raw nibbles; already flipped/composited. */
  indices: ArrayLike<number>;
}
export interface NeutralPacked4FrameContext {
  /** Top-left logical origin of the complete supplied frame plane. */
  frameOrigin: readonly [number, number];
  componentOriginX: number;
  clipFlagBit0: boolean;
  depth: number;
  pitch: number;
  viewport: readonly [number, number];
  /** packed4PaletteLookup for the actual admitted source fade row. */
  paletteLookup: ArrayLike<number>;
}
export function composeNeutralPacked4Frame(
  frame: NeutralPacked4Frame,
  context: NeutralPacked4FrameContext,
): { rgba: Uint8ClampedArray; written: number; clipped: number } {
  return composePacked4Frame(frame, context, neutralPacked4PaletteIndex);
}
export function composeOwnedPacked4Frame(
  frame: NeutralPacked4Frame,
  context: NeutralPacked4FrameContext & { owner: 0 | 1 | 2 | 3 },
): { rgba: Uint8ClampedArray; written: number; clipped: number } {
  return composePacked4Frame(frame, context, (n) =>
    ownedPacked4PaletteIndex(n, context),
  );
}
function composePacked4Frame(
  frame: NeutralPacked4Frame,
  context: NeutralPacked4FrameContext,
  paletteIndex: (nibble: number, context: NeutralPacked4PixelContext) => number,
): { rgba: Uint8ClampedArray; written: number; clipped: number } {
  integer(frame.width, 1, 4096, "frame width");
  integer(frame.height, 1, 4096, "frame height");
  const count = frame.width * frame.height;
  bytes(frame.bank192, count * 4, "bank192 frame");
  bytes(frame.bank208, count * 4, "bank208 frame");
  if (frame.indices.length !== count)
    throw new Error("Packed4 raw index frame required");
  bytes(context.paletteLookup, 1024, "palette lookup");
  // Owned banks ignore parity, but malformed shared screen/clipping inputs
  // must still fail before writing any output.
  neutralPacked4Bank({
    ...context,
    screenX: context.frameOrigin[0],
    screenY: context.frameOrigin[1],
  });
  integer(context.viewport[0], 1, 65536, "viewport width");
  integer(context.viewport[1], 1, 65536, "viewport height");
  if (context.pitch < context.viewport[0])
    throw new Error("Packed4 pitch is narrower than viewport");
  const rgba = new Uint8ClampedArray(count * 4);
  let written = 0,
    clipped = 0;
  for (let row = 0; row < frame.height; row++)
    for (let col = 0; col < frame.width; col++) {
      const index = row * frame.width + col,
        at = index * 4,
        alpha = frame.bank192[at + 3];
      if ((alpha !== 0 && alpha !== 255) || frame.bank208[at + 3] !== alpha)
        throw new Error("Packed4 bank frame opacity mismatch");
      integer(frame.indices[index], 0, 15, "raw nibble");
      const pixel: NeutralPacked4PixelContext = {
        ...context,
        screenX: context.frameOrigin[0] + col,
        screenY: context.frameOrigin[1] + row,
      };
      const selected = paletteIndex(frame.indices[index], pixel);
      if (!alpha) continue;
      if (
        pixel.screenX < 0 ||
        pixel.screenY < 0 ||
        pixel.screenX >= context.viewport[0] ||
        pixel.screenY >= context.viewport[1]
      ) {
        clipped++;
        continue;
      }
      const source = selected * 4;
      rgba[at] = context.paletteLookup[source];
      rgba[at + 1] = context.paletteLookup[source + 1];
      rgba[at + 2] = context.paletteLookup[source + 2];
      rgba[at + 3] = 255;
      written++;
    }
  return { rgba, written, clipped };
}
/** Top-left CPU frame indices -> conventional bottom-left UV DataTexture.
 * The two bank frame textures must use those same conventional UVs. */
export function packed4IndexTexture(
  width: number,
  height: number,
  indices: ArrayLike<number>,
): THREE.DataTexture {
  integer(width, 1, 4096, "index texture width");
  integer(height, 1, 4096, "index texture height");
  if (indices.length !== width * height)
    throw new Error("Packed4 raw index texture extent mismatch");
  const data = new Uint8Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const source = y * width + x;
      integer(indices[source], 0, 15, "raw nibble");
      data[(height - 1 - y) * width + x] = indices[source];
    }
  const texture = new THREE.DataTexture(
    data,
    width,
    height,
    THREE.RedFormat,
    THREE.UnsignedByteType,
  );
  texture.colorSpace = THREE.NoColorSpace;
  texture.flipY = false;
  texture.unpackAlignment = 1;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
export function packed4LookupTexture(
  rgba: ArrayLike<number>,
): THREE.DataTexture {
  bytes(rgba, 1024, "palette lookup");
  const texture = new THREE.DataTexture(
    Uint8Array.from(rgba),
    256,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}
export interface NeutralPacked4Textures {
  bank192: THREE.Texture;
  bank208: THREE.Texture;
  indices: THREE.Texture;
  /** FADE-selected MAIN.PAL RGBA, 256x1, SRGBColorSpace. */
  paletteLookup: THREE.Texture;
}
export interface NeutralPacked4ScreenContext {
  componentOriginX: number;
  clipFlagBit0: boolean;
  depth: number;
  pitch: number;
  /** Height in ORIGINAL LOGICAL pixels, not framebuffer physical pixels. */
  logicalViewportHeight: number;
  /** Physical framebuffer pixels per original logical pixel; explicit zoom/DPR policy. */
  physicalPixelsPerLogicalPixel: readonly [number, number];
  /** Bottom-left WebGL viewport origin in physical framebuffer pixels. */
  viewportPhysicalOrigin: readonly [number, number];
}
function validateScreen(context: NeutralPacked4ScreenContext): void {
  neutralPacked4Bank({ ...context, screenX: 0, screenY: 0 });
  integer(context.logicalViewportHeight, 1, 65536, "logical viewport height");
  context.physicalPixelsPerLogicalPixel.forEach((n) => {
    if (!Number.isFinite(n) || n <= 0)
      throw new Error("Packed4 logical pixel scale required");
  });
  context.viewportPhysicalOrigin.forEach((n) =>
    integer(n, 0, 0x7fffffff, "physical viewport origin"),
  );
}
export const neutralPacked4FragmentShader = `
uniform sampler2D bank192;
uniform sampler2D bank208;
uniform sampler2D rawIndices;
uniform sampler2D paletteLookup;
uniform float componentOriginX;
uniform float clipFlagBit0;
uniform float healthDepth;
uniform float neutralOpacity;
uniform float paletteBase;
uniform float bankStride;
uniform float sourcePitch;
uniform float logicalViewportHeight;
uniform vec2 physicalPixelsPerLogicalPixel;
uniform vec2 viewportPhysicalOrigin;
varying vec2 frameUv;
void main() {
  vec4 first = texture2D(bank192, frameUv);
  vec4 second = texture2D(bank208, frameUv);
  float alpha = min(first.a, second.a);
  if (alpha < 0.5) discard;
  vec2 fromBottom = floor((gl_FragCoord.xy - viewportPhysicalOrigin) / physicalPixelsPerLogicalPixel);
  float screenY = logicalViewportHeight - 1.0 - fromBottom.y;
  float parity = mod(mod(screenY, 2.0) * mod(sourcePitch, 2.0) + mod(fromBottom.x, 2.0) + mod(componentOriginX, 2.0), 2.0);
  float alternate = mod(clipFlagBit0 + parity, 2.0);
  float nibble = floor(texture2D(rawIndices, frameUv).r * 255.0 + 0.5);
  float index = nibble < healthDepth ? mod(135.0 - floor(nibble / 4.0) + 256.0, 256.0) : paletteBase + bankStride * alternate + nibble;
  gl_FragColor = vec4(texture2D(paletteLookup, vec2((index + 0.5) / 256.0, 0.5)).rgb, alpha * neutralOpacity);
  #include <colorspace_fragment>
}`;
/** All frame textures must be composed with identical placement/flips/UVs.
 * Health/fade are exact indexed lookups; no RGB approximation or light tint. */
export function createNeutralPacked4Material(
  textures: NeutralPacked4Textures,
  context: NeutralPacked4ScreenContext,
): THREE.ShaderMaterial {
  validateScreen(context);
  for (const texture of [
    textures.bank192,
    textures.bank208,
    textures.indices,
    textures.paletteLookup,
  ]) {
    if (!texture?.isTexture)
      throw new Error(
        "Packed4 paired frames, raw indices and source palette lookup textures are required",
      );
  }
  if (
    !textures.bank192 ||
    !textures.bank208 ||
    !textures.indices ||
    !textures.paletteLookup
  )
    throw new Error(
      "Packed4 paired frames, raw indices and source palette lookup textures are required",
    );
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      bank192: { value: textures.bank192 },
      bank208: { value: textures.bank208 },
      rawIndices: { value: textures.indices },
      paletteLookup: { value: textures.paletteLookup },
      componentOriginX: { value: context.componentOriginX },
      clipFlagBit0: { value: Number(context.clipFlagBit0) },
      healthDepth: { value: context.depth },
      neutralOpacity: { value: 1 },
      paletteBase: { value: 192 },
      bankStride: { value: 16 },
      sourcePitch: { value: context.pitch },
      logicalViewportHeight: { value: context.logicalViewportHeight },
      physicalPixelsPerLogicalPixel: {
        value: new THREE.Vector2(...context.physicalPixelsPerLogicalPixel),
      },
      viewportPhysicalOrigin: {
        value: new THREE.Vector2(...context.viewportPhysicalOrigin),
      },
    },
    vertexShader: `varying vec2 frameUv; void main() { frameUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: neutralPacked4FragmentShader,
  });
  return material;
}
/** Call after camera/viewport/DPR or source health/clip changes, without rebuilding material. */
export function updateNeutralPacked4Material(
  material: THREE.ShaderMaterial,
  context: NeutralPacked4ScreenContext,
): void {
  validateScreen(context);
  material.uniforms.paletteBase.value = 192;
  material.uniforms.bankStride.value = 16;
  material.uniforms.componentOriginX.value = context.componentOriginX;
  material.uniforms.clipFlagBit0.value = Number(context.clipFlagBit0);
  material.uniforms.healthDepth.value = context.depth;
  material.uniforms.sourcePitch.value = context.pitch;
  material.uniforms.logicalViewportHeight.value = context.logicalViewportHeight;
  (material.uniforms.physicalPixelsPerLogicalPixel.value as THREE.Vector2).set(
    ...context.physicalPixelsPerLogicalPixel,
  );
  (material.uniforms.viewportPhysicalOrigin.value as THREE.Vector2).set(
    ...context.viewportPhysicalOrigin,
  );
}
export interface OwnedPacked4ScreenContext extends NeutralPacked4ScreenContext {
  owner: 0 | 1 | 2 | 3;
}
/** Shares the exact raw/opacity samplers, with a constant owner palette bank. */
export function createOwnedPacked4Material(
  textures: NeutralPacked4Textures,
  context: OwnedPacked4ScreenContext,
): THREE.ShaderMaterial {
  integer(context.owner, 0, 3, "owned player");
  const material = createNeutralPacked4Material(textures, context);
  updateOwnedPacked4Material(material, context);
  return material;
}
export function updateOwnedPacked4Material(
  material: THREE.ShaderMaterial,
  context: OwnedPacked4ScreenContext,
): void {
  integer(context.owner, 0, 3, "owned player");
  updateNeutralPacked4Material(material, context);
  material.uniforms.paletteBase.value = 192 + context.owner * 16;
  material.uniforms.bankStride.value = 0;
}

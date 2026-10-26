/** Battle Drones Stage pattern adapted for original indexed artwork and an
 * orthographic camera. Lighting, drone models and biome content removed.
 * This module only consumes world state; it never advances the simulation.
 */
import * as THREE from "three";
import type { Asset, Mission, Pack } from "../content/types";
import type { World } from "../sim/schema";
import { BUILDINGS } from "../sim/world";
import type { TerrainState } from "../sim/mechanics/terrain";
import {
  createNeutralPacked4Material,
  createOwnedPacked4Material,
  neutralPacked4Depth,
  neutralPacked4Shade,
  ownedPacked4Profile,
  packed4IndexTexture,
  packed4LookupTexture,
  packed4PaletteLookup,
  updateNeutralPacked4Material,
  updateOwnedPacked4Material,
  type NeutralPacked4ScreenContext,
  type OwnedPacked4SourceContext,
} from "./packed4-palette";
/** Raw fields for the admitted neutral owner4 foreground wrapper. Source
 * globals remain explicit presentation inputs; rendering never changes them. */
export interface SceneNeutralPacked4Context {
  state: number;
  current6A: number;
  max64: number;
  rawShade: number;
  virtualHeight: number;
  flags15: number;
  globalShadowMode: number;
  clipFlagBit0: boolean;
}
/** Actual kind1 owner0..3 wrapper; never inferred from asset name or selection. */
export interface SceneOwnedPacked4Context extends OwnedPacked4SourceContext {
  clipFlagBit0: boolean;
}
export interface SceneEntity {
  id: string;
  x: number;
  y: number;
  height?: number;
  art: string;
  frame: number;
  /** Single original ANB component for independently phased packed4 draws. */
  component?: number;
  selected?: boolean;
  opacity?: number;
  neutralPacked4?: Readonly<SceneNeutralPacked4Context>;
  ownedPacked4?: Readonly<SceneOwnedPacked4Context>;
}
interface Packed4FrameTextures {
  bank192: THREE.Texture;
  bank208: THREE.Texture;
  indices: THREE.DataTexture;
  /** Actual left edge in the existing 256px frame plane, before clipping. */
  componentLeft: number;
}
interface SceneSprite {
  mesh: THREE.Mesh;
  ring: THREE.Mesh | null;
  visual: string;
  neutral?: {
    componentLeft: number;
    depth: number;
    clipFlagBit0: boolean;
    owner?: 0 | 1 | 2 | 3;
  };
}
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-15, 15, 10, -10, 0.1, 1000);
  readonly target = new THREE.Vector3(81, 0, 53);
  private ground: THREE.Mesh | null = null;
  private actors = new THREE.Group();
  private textureCache = new Map<string, THREE.Texture>();
  private images = new Map<string, HTMLImageElement>();
  private pendingImages = new Map<string, Promise<HTMLImageElement>>();
  private observer: ResizeObserver;
  private lastVisual = "";
  private activeMission: Mission | null = null;
  private terrainRevision = -1;
  private sceneSprites = new Map<string, SceneSprite>();
  private frameTextures = new Map<string, THREE.Texture>();
  private packed4Frames = new Map<string, Packed4FrameTextures>();
  private pendingPacked4Frames = new Map<
    string,
    Promise<Packed4FrameTextures>
  >();
  private packed4Streams = new Map<
    string,
    { indices: Uint8Array; opacity: Uint8Array; offsets: number[] }
  >();
  private packed4Lookups = new Map<number, THREE.DataTexture>();
  private fadeBytes: Uint8Array | null = null;
  private sceneRequest = 0;
  private disposed = false;
  readonly raycaster = new THREE.Raycaster();
  constructor(
    readonly host: HTMLElement,
    readonly pack: Pack,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    // Renderer failures must reject the presentation update / reach the page
    // error handler. A logged shader error cannot count as a rendered scene.
    this.renderer.debug.checkShaderErrors = true;
    this.renderer.debug.onShaderError = (gl, program, vertex, fragment) => {
      throw new Error(
        "Stage shader compilation failed: " +
          [
            gl.getProgramInfoLog(program),
            gl.getShaderInfoLog(vertex),
            gl.getShaderInfoLog(fragment),
          ]
            .filter(Boolean)
            .join("\n"),
      );
    };
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x111b20);
    this.renderer.domElement.className = "view3d";
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-label", "Isometric world");
    this.scene.add(this.actors);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }
  resize(): void {
    const { width, height } = this.host.getBoundingClientRect();
    this.renderer.setSize(width, height, false);
    const aspect = width / Math.max(1, height),
      half = 12;
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    this.positionCamera();
  }
  private positionCamera(): void {
    this.camera.position.copy(this.target).add(new THREE.Vector3(80, 80, 80));
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
  }
  focus(x: number, y: number): void {
    this.target.set(x, this.heightAt(x, y), y);
    this.positionCamera();
  }
  pan(dx: number, dy: number): void {
    const scale = 24 / (Math.max(1, this.host.clientHeight) * this.camera.zoom);
    this.target.add(
      new THREE.Vector3(-dx - dy * 1.42, 0, dx - dy * 1.42).multiplyScalar(
        scale / 1.414,
      ),
    );
    this.target.x = THREE.MathUtils.clamp(this.target.x, 0, 128);
    this.target.z = THREE.MathUtils.clamp(this.target.z, 0, 128);
    this.positionCamera();
  }
  zoom(factor: number): void {
    this.camera.zoom = THREE.MathUtils.clamp(this.camera.zoom * factor, 0.3, 5);
    this.camera.updateProjectionMatrix();
  }
  image(key: string): Promise<HTMLImageElement> {
    const asset = this.pack.assets[key];
    if (!asset) return Promise.reject(new Error("Missing asset " + key));
    return this.loadImage(key, asset.image);
  }
  private loadImage(key: string, source: string): Promise<HTMLImageElement> {
    const cached = this.images.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = this.pendingImages.get(key);
    if (pending) return pending;
    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => {
        if (!this.disposed) this.images.set(key, i);
        resolve(i);
      };
      i.onerror = () => reject(new Error("Cannot decode " + key));
      i.src = source;
    }).finally(() => this.pendingImages.delete(key));
    this.pendingImages.set(key, promise);
    return promise;
  }
  async texture(key: string): Promise<THREE.Texture> {
    const old = this.textureCache.get(key);
    if (old) return old;
    const t = new THREE.Texture(await this.image(key));
    t.magFilter = t.minFilter = THREE.NearestFilter;
    t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    this.textureCache.set(key, t);
    return t;
  }
  async setMission(
    m: Mission,
    atlas = m.startup?.terrain.atlasResource ?? "B32A",
  ): Promise<void> {
    this.sceneRequest++;
    this.activeMission = { ...m, cells: m.cells.map((cell) => [...cell]) };
    if (this.ground) {
      this.scene.remove(this.ground);
      this.ground.geometry.dispose();
      (this.ground.material as THREE.Material).dispose();
    }
    const vertices: number[] = [],
      uvs: number[] = [],
      colors: number[] = [];
    const height = (x: number, y: number) =>
      m.cells[(y % 128) * 128 + (x % 128)][0] / 256;
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const cell = m.cells[y * 128 + x],
          tile = cell[1] % 160,
          flags = cell[2] & 0x70;
        const corners = [
          [x, height(x, y), y],
          [x + 1, height(x + 1, y), y],
          [x + 1, height(x + 1, y + 1), y + 1],
          [x, height(x, y + 1), y + 1],
        ];
        let coords = [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ];
        // B32 transform bits preserved independently from world collision size.
        coords = coords.map(([u, v]) => {
          if (flags & 16) [u, v] = [v, u];
          if (flags & 32) u = 1 - u;
          if (flags & 64) v = 1 - v;
          return [u, v];
        });
        for (const i of [0, 2, 1, 0, 3, 2]) {
          vertices.push(...corners[i]);
          uvs.push(
            ((tile % 8) * 32 + 0.5 + coords[i][0] * 31) / 256,
            1 - (Math.floor(tile / 8) * 32 + 0.5 + coords[i][1] * 31) / 640,
          );
          const shade = (x + y) % 2 ? 0.35 : 0.45;
          colors.push(shade, shade + 0.12, shade + 0.04);
        }
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    const texture = this.pack.assets[atlas] ? await this.texture(atlas) : null;
    if (!texture)
      geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      vertexColors: !texture,
      side: THREE.DoubleSide,
    });
    this.ground = new THREE.Mesh(geo, mat);
    this.scene.add(this.ground);
    this.focus(m.target[0] >> 8, m.target[1] >> 8);
    this.target.y = height(m.target[0] >> 8, m.target[1] >> 8);
    this.positionCamera();
    this.lastVisual = "";
    this.terrainRevision = -1;
    this.sceneSprites.clear();
    this.clearActors();
  }
  pick(clientX: number, clientY: number): { x: number; y: number } | null {
    if (!this.ground) return null;
    const b = this.host.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - b.left) / b.width) * 2 - 1,
        1 - ((clientY - b.top) / b.height) * 2,
      ),
      this.camera,
    );
    const point = this.raycaster.intersectObject(this.ground)[0]?.point;
    return point
      ? {
          x: Math.min(127, Math.max(0, Math.floor(point.x))),
          y: Math.min(127, Math.max(0, Math.floor(point.z))),
        }
      : null;
  }
  heightAt(x: number, y: number): number {
    const m = this.activeMission;
    if (!m) return 0;
    const ix = Math.floor(x),
      iy = Math.floor(y),
      u = x - ix,
      v = y - iy;
    const h = (dx: number, dy: number) =>
      m.cells[((iy + dy) % 128) * 128 + ((ix + dx) % 128)][0] / 256;
    return v <= u
      ? h(0, 0) + (h(1, 0) - h(0, 0)) * u + (h(1, 1) - h(1, 0)) * v
      : h(0, 0) + (h(1, 1) - h(0, 1)) * u + (h(0, 1) - h(0, 0)) * v;
  }
  project(x: number, y: number, h?: number): { x: number; y: number } {
    h ??= this.heightAt(x, y);
    const v = new THREE.Vector3(x, h, y).project(this.camera),
      b = this.host.getBoundingClientRect();
    return {
      x: b.left + ((v.x + 1) * b.width) / 2,
      y: b.top + ((1 - v.y) * b.height) / 2,
    };
  }
  private clearActors(): void {
    for (const child of [...this.actors.children]) {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.MeshBasicMaterial;
      if (mat?.map && ![...this.frameTextures.values()].includes(mat.map))
        mat.map.dispose();
      mat?.dispose();
      this.actors.remove(child);
    }
  }
  async frameCanvas(asset: Asset, index = 0): Promise<HTMLCanvasElement> {
    const entry = Object.entries(this.pack.assets).find(([, a]) => a === asset);
    if (!entry) throw new Error("Asset unavailable");
    return this.composeFrame(asset, index, await this.image(entry[0]));
  }
  private composeFrame(
    asset: Asset,
    index: number,
    image: HTMLImageElement,
    component?: number,
  ): HTMLCanvasElement {
    const frame = asset.frames?.[index];
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    if (frame && asset.sprites) {
      for (const [ref, x, y, flags] of (component===undefined?frame.components:frame.components.slice(component,component+1))) {
        const r = asset.sprites[ref];
        if (!r) continue;
        ctx.save();
        ctx.translate(128 + x, 160 + y);
        ctx.scale(flags & 1 ? -1 : 1, flags & 2 ? -1 : 1);
        ctx.drawImage(image, ...r, 0, 0, r[2], r[3]);
        ctx.restore();
      }
    } else
      ctx.drawImage(
        image,
        0,
        0,
        Math.min(image.width, 256),
        Math.min(image.height, 256),
      );
    return canvas;
  }
  private decodeStream(base64: string): Uint8Array {
    const raw = atob(base64);
    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
  }
  private rawPacked4Frame(
    art: string,
    asset: Asset,
    index: number,
    component?: number,
  ): { indices: Uint8Array; componentLeft: number } {
    const frame = asset.frames?.[index], part=component??0;
    // Each original component is composed separately so its checkerboard
    // origin survives clipping, flips and overlap with other components.
    if (
      !asset.packed4 ||
      !asset.sprites ||
      !frame ||
      (component===undefined && frame.components.length!==1) ||
      !Number.isInteger(part) || part < 0 || !frame.components[part]
    )
      throw new Error("Unsupported packed4 component layout for " + art);
    let streams = this.packed4Streams.get(art);
    if (!streams) {
      const indices = this.decodeStream(asset.packed4.indices),
        opacity = this.decodeStream(asset.packed4.opacity),
        offsets: number[] = [];
      let count = 0;
      for (const [, , width, height] of asset.sprites) {
        if (
          !Number.isInteger(width) ||
          !Number.isInteger(height) ||
          width < 0 ||
          height < 0 ||
          width > 255 ||
          height > 255
        )
          throw new Error("Invalid packed4 sprite dimensions for " + art);
        offsets.push(count);
        count += width * height;
      }
      if (indices.length !== count || opacity.length !== count)
        throw new Error("Packed4 raw stream extent mismatch for " + art);
      for (let i = 0; i < count; i++) {
        if (indices[i] > 15 || opacity[i] > 1)
          throw new Error("Invalid packed4 raw pixel for " + art);
      }
      streams = { indices, opacity, offsets };
      this.packed4Streams.set(art, streams);
    }
    const [ref, x, y, flags] = frame.components[part],
      sprite = asset.sprites[ref];
    if (
      !sprite ||
      !Number.isInteger(ref) ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      !Number.isInteger(flags) ||
      (flags & ~3) !== 0
    )
      throw new Error(
        "Unsupported packed4 component flags/reference for " + art,
      );
    const [, , width, height] = sprite,
      pixels = new Uint8Array(256 * 256),
      offset = streams.offsets[ref];
    // Match composeFrame's integer canvas translation/flip exactly, including
    // clipping and opaque nibblezero. Mask opacity is taken from both PNGs.
    for (let row = 0; row < height; row++)
      for (let col = 0; col < width; col++) {
        const source = offset + row * width + col;
        if (!streams.opacity[source]) continue;
        const dx = 128 + x + (flags & 1 ? -1 - col : col),
          dy = 160 + y + (flags & 2 ? -1 - row : row);
        if (dx >= 0 && dx < 256 && dy >= 0 && dy < 256)
          pixels[dy * 256 + dx] = streams.indices[source];
      }
    return {
      indices: pixels,
      componentLeft: 128 + x - (flags & 1 ? width : 0),
    };
  }
  private async packed4Frame(
    art: string,
    asset: Asset,
    index: number,
    component?: number,
  ): Promise<Packed4FrameTextures> {
    const key = art + ":" + index + ":" + component,
      cached = this.packed4Frames.get(key);
    if (cached) return cached;
    const pending = this.pendingPacked4Frames.get(key);
    if (pending) return pending;
    const promise = (async () => {
      const first = asset.paletteAtlases?.["192"],
        second = asset.paletteAtlases?.["208"];
      if (!first || !second)
        throw new Error("Paired packed4 palette atlases required for " + art);
      const raw = this.rawPacked4Frame(art, asset, index,component);
      const images = await Promise.all([
        this.loadImage("packed4:192:" + art, first),
        this.loadImage("packed4:208:" + art, second),
      ]);
      if (this.disposed)
        throw new Error("Stage disposed during packed4 frame load");
      const make = (image: HTMLImageElement) => {
        const texture = new THREE.CanvasTexture(
          this.composeFrame(asset, index, image,component),
        );
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = texture.minFilter = THREE.NearestFilter;
        texture.generateMipmaps = false;
        return texture;
      };
      const frame = {
        bank192: make(images[0]),
        bank208: make(images[1]),
        indices: packed4IndexTexture(256, 256, raw.indices),
        componentLeft: raw.componentLeft,
      };
      this.packed4Frames.set(key, frame);
      return frame;
    })().finally(() => this.pendingPacked4Frames.delete(key));
    this.pendingPacked4Frames.set(key, promise);
    return promise;
  }
  private packed4Lookup(shade: number | null): THREE.DataTexture {
    const key = shade ?? -1;
    const old = this.packed4Lookups.get(key);
    if (old) return old;
    const palettes = this.pack.palettes;
    if (!palettes)
      throw new Error(
        "Original MAIN palette and FADE rows required for packed4 rendering",
      );
    if (
      shade !== null &&
      (!Number.isInteger(shade) || shade < 0 || shade >= 64)
    )
      throw new Error("Invalid packed4 source FADE row");
    if (shade !== null && !this.fadeBytes) {
      const fade = this.decodeStream(palettes.fadeBase64);
      if (fade.length !== 64 * 256)
        throw new Error("Invalid packed4 FADE extent");
      this.fadeBytes = fade;
    }
    const texture = packed4LookupTexture(
      packed4PaletteLookup(
        palettes.mainRgb8.flat(),
        shade === null
          ? Uint8Array.from({ length: 256 }, (_, i) => i)
          : this.fadeBytes!.subarray(shade * 256, (shade + 1) * 256),
      ),
    );
    this.packed4Lookups.set(key, texture);
    return texture;
  }
  private packed4Screen(item: SceneSprite): NeutralPacked4ScreenContext {
    if (!item.neutral) throw new Error("Packed4 scene context required");
    const ratio = this.renderer.getPixelRatio(),
      canvas = this.renderer.domElement,
      width = canvas.width / ratio,
      height = canvas.height / ratio;
    // Stage presentation policy: a logical pixel is one CSS pixel. Project
    // the existing billboard's actual component left before viewport clipping.
    const topLeft = new THREE.Vector3(-4, 4, 0)
        .applyQuaternion(item.mesh.quaternion)
        .add(item.mesh.position)
        .project(this.camera),
      topRight = new THREE.Vector3(4, 4, 0)
        .applyQuaternion(item.mesh.quaternion)
        .add(item.mesh.position)
        .project(this.camera),
      left = ((topLeft.x + 1) * width) / 2,
      planeWidth = ((topRight.x - topLeft.x) * width) / 2;
    return {
      componentOriginX: Math.floor(
        left + (planeWidth * item.neutral.componentLeft) / 256,
      ),
      clipFlagBit0: item.neutral.clipFlagBit0,
      depth: item.neutral.depth,
      pitch: 640,
      logicalViewportHeight: Math.max(1, Math.ceil(height)),
      physicalPixelsPerLogicalPixel: [ratio, ratio],
      viewportPhysicalOrigin: [0, 0],
    };
  }
  async sync(
    w: Readonly<World>,
    m: Mission,
    selection: ReadonlySet<number>,
  ): Promise<void> {
    const key = JSON.stringify([
      w.specialists.map((a) => [a.id, a.x, a.y]),
      w.buildings.map((b) => [b.id, b.complete]),
      [...selection],
    ]);
    if (key === this.lastVisual) return;
    this.lastVisual = key;
    const group = new THREE.Group();
    for (const entity of [...w.specialists, ...w.buildings]) {
      const isBuilding = "selector" in entity;
      const art = isBuilding
        ? BUILDINGS[entity.selector].art
        : entity.role === "Engineer"
          ? "HARCH"
          : "HSCIE";
      const asset = art ? this.pack.assets[art] : undefined;
      let mat: THREE.MeshBasicMaterial, geo: THREE.PlaneGeometry;
      if (asset) {
        const frames = asset.frames || [],
          index = Math.max(
            0,
            frames.findIndex((f) => f.components.length > 0),
          );
        const canvas = await this.frameCanvas(asset, index);
        const map = new THREE.CanvasTexture(canvas);
        map.colorSpace = THREE.SRGBColorSpace;
        map.magFilter = map.minFilter = THREE.NearestFilter;
        mat = new THREE.MeshBasicMaterial({
          map,
          transparent: true,
          alphaTest: 0.01,
          depthWrite: false,
        });
        geo = new THREE.PlaneGeometry(8, 8);
      } else {
        mat = new THREE.MeshBasicMaterial({
          color: isBuilding ? 0xe2b363 : 0x9fffc7,
          side: THREE.DoubleSide,
        });
        geo = new THREE.PlaneGeometry(0.5, 1);
      }
      const mesh = new THREE.Mesh(geo, mat),
        ht = this.heightAt(entity.x + 0.5, entity.y + 0.5);
      mesh.position.set(entity.x + 0.5, ht + 1, entity.y + 0.5);
      mesh.quaternion.copy(this.camera.quaternion);
      mesh.renderOrder = entity.x + entity.y;
      group.add(mesh);
      if (selection.has(entity.id)) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.48, 0.57, 32),
          new THREE.MeshBasicMaterial({
            color: 0xb9ff98,
            side: THREE.DoubleSide,
            depthTest: false,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(entity.x + 0.5, ht + 0.04, entity.y + 0.5);
        ring.renderOrder = 999;
        group.add(ring);
      }
    }
    if (key !== this.lastVisual) {
      for (const c of group.children) {
        const mesh = c as THREE.Mesh;
        mesh.geometry.dispose();
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
      return;
    }
    this.clearActors();
    this.actors.add(...[...group.children]);
  }
  /** Read-only campaign view. Runtime coordinates/animations come from the
   * authoritative state; sprite objects and frame textures are reused. */
  async syncScene(entities: readonly SceneEntity[]): Promise<void> {
    const request = ++this.sceneRequest;
    // Finish validation and asynchronous decoding before changing visible
    // entities. Failed/missing packed4 context cannot leave a preview mesh.
    const prepared = await Promise.all(
      entities.map(async (input) => {
        const e = {
            ...input,
            neutralPacked4: input.neutralPacked4
              ? { ...input.neutralPacked4 }
              : undefined,
            ownedPacked4: input.ownedPacked4
              ? { ...input.ownedPacked4 }
              : undefined,
          },
          asset = this.pack.assets[e.art];
        if (!asset) return null;
        const key = e.art + ":" + e.frame;
        if (asset.packed4) {
          if (e.neutralPacked4 && e.ownedPacked4)
            throw new Error(
              "Exactly one packed4 owner source context is required",
            );
          const source = e.ownedPacked4 ?? e.neutralPacked4;
          if (!source)
            throw new Error(
              "Packed4 owner source context required for " + e.art,
            );
          if (typeof source.clipFlagBit0 !== "boolean")
            throw new Error("Packed4 clip flag context required for " + e.art);
          const owned = e.ownedPacked4
            ? ownedPacked4Profile(e.ownedPacked4)
            : null;
          const depth =
              owned?.depth ??
              neutralPacked4Depth(source.state, source.current6A, source.max64),
            shade = owned
              ? owned.fadeRow
              : neutralPacked4Shade(
                  source.rawShade,
                  source.virtualHeight,
                  source.flags15,
                  source.globalShadowMode,
                ),
            paletteLookup = this.packed4Lookup(shade),
            frame = await this.packed4Frame(e.art, asset, e.frame,e.component);
          return {
            e,
            key: "packed4:" + key,
            frame,
            depth,
            owner: e.ownedPacked4?.owner,
            clipFlagBit0: source.clipFlagBit0,
            paletteLookup,
            texture: null,
          };
        }
        let texture = this.frameTextures.get(key);
        if (!texture) {
          const canvas = await this.frameCanvas(asset, e.frame);
          if (this.disposed)
            throw new Error("Stage disposed during frame load");
          // Another pending scene may already have decoded the same frame.
          texture = this.frameTextures.get(key);
          if (!texture) {
            texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.magFilter = texture.minFilter = THREE.NearestFilter;
            this.frameTextures.set(key, texture);
          }
        }
        return {
          e,
          key: "indexed8:" + key,
          texture,
          frame: null,
          depth: 0,
          owner: undefined,
          clipFlagBit0: false,
          paletteLookup: null,
        };
      }),
    );
    if (request !== this.sceneRequest || this.disposed) return;
    const active = new Set(entities.map((e) => e.id));
    for (const [id, item] of this.sceneSprites) {
      if (active.has(id)) continue;
      this.actors.remove(item.mesh);
      item.mesh.geometry.dispose();
      (item.mesh.material as THREE.Material).dispose();
      if (item.ring) {
        this.actors.remove(item.ring);
        item.ring.geometry.dispose();
        (item.ring.material as THREE.Material).dispose();
      }
      this.sceneSprites.delete(id);
    }
    for (const view of prepared) {
      if (!view) continue;
      const {
        e,
        key,
        frame,
        depth,
        paletteLookup,
        texture,
        owner,
        clipFlagBit0,
      } = view;
      const makePacked4Material = () => {
        const context = {
          componentOriginX: 0,
          clipFlagBit0,
          depth,
          pitch: 640,
          logicalViewportHeight: 1,
          physicalPixelsPerLogicalPixel: [1, 1] as const,
          viewportPhysicalOrigin: [0, 0] as const,
        };
        return owner === undefined
          ? createNeutralPacked4Material(
              { ...frame!, paletteLookup: paletteLookup! },
              context,
            )
          : createOwnedPacked4Material(
              { ...frame!, paletteLookup: paletteLookup! },
              { ...context, owner },
            );
      };
      let item = this.sceneSprites.get(e.id);
      if (!item) {
        const material =
          frame && paletteLookup
            ? makePacked4Material()
            : new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                alphaTest: 0.01,
                depthWrite: false,
              });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), material);
        this.actors.add(mesh);
        item = { mesh, ring: null, visual: key };
        this.sceneSprites.set(e.id, item);
      }
      if (frame && paletteLookup) {
        let material = item.mesh.material;
        if (!(material instanceof THREE.ShaderMaterial)) {
          (material as THREE.Material).dispose();
          material = makePacked4Material();
          item.mesh.material = material;
        }
        const shader = material as THREE.ShaderMaterial;
        shader.uniforms.bank192.value = frame.bank192;
        shader.uniforms.bank208.value = frame.bank208;
        shader.uniforms.rawIndices.value = frame.indices;
        shader.uniforms.paletteLookup.value = paletteLookup;
        shader.uniforms.neutralOpacity.value = e.opacity ?? 1;
        shader.uniforms.paletteBase.value =
          owner === undefined ? 192 : 192 + owner * 16;
        shader.uniforms.bankStride.value = owner === undefined ? 16 : 0;
        item.neutral = {
          componentLeft: frame.componentLeft,
          depth,
          clipFlagBit0,
          owner,
        };
      } else {
        let material = item.mesh.material;
        if (!(material instanceof THREE.MeshBasicMaterial)) {
          (material as THREE.Material).dispose();
          material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            alphaTest: 0.01,
            depthWrite: false,
          });
          item.mesh.material = material;
        }
        if (item.visual !== key) {
          (material as THREE.MeshBasicMaterial).map = texture;
          material.needsUpdate = true;
        }
        material.opacity = e.opacity ?? 1;
        item.neutral = undefined;
      }
      item.visual = key;
      const h = e.height ?? this.heightAt(e.x, e.y);
      item.mesh.position.set(e.x, h + 1, e.y);
      item.mesh.quaternion.copy(this.camera.quaternion);
      item.mesh.renderOrder = e.x + e.y;
      if (e.selected && !item.ring) {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.48, 0.57, 24),
          new THREE.MeshBasicMaterial({
            color: 0xb9ff98,
            side: THREE.DoubleSide,
            depthTest: false,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 999;
        this.actors.add(ring);
        item.ring = ring;
      }
      if (item.ring) {
        item.ring.visible = !!e.selected;
        item.ring.position.set(e.x, this.heightAt(e.x, e.y) + 0.05, e.y);
      }
    }
  }
  updateTerrain(t: Readonly<TerrainState>): void {
    if (
      this.terrainRevision === t.revision ||
      !this.ground ||
      !this.activeMission
    )
      return;
    this.terrainRevision = t.revision;
    const cells = this.activeMission.cells,
      bytes = t.bytes;
    for (let cell = 0; cell < 16384; cell++) {
      const p = cell * 14;
      cells[cell] = [
        ((bytes[p + 2] | (bytes[p + 3] << 8)) << 16) >> 16,
        bytes[p + 4],
        bytes[p + 5],
      ];
    }
    const pos = this.ground.geometry.getAttribute("position"),
      uv = this.ground.geometry.getAttribute("uv");
    let at = 0;
    const h = (x: number, y: number) =>
      cells[(y & 127) * 128 + (x & 127)][0] / 256;
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const cell = cells[y * 128 + x],
          tile = cell[1] % 160,
          flags = cell[2] & 0x70;
        const corners = [
          [x, h(x, y), y],
          [x + 1, h(x + 1, y), y],
          [x + 1, h(x + 1, y + 1), y + 1],
          [x, h(x, y + 1), y + 1],
        ];
        const coords = [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ].map(([u, v]) => {
          if (flags & 16) [u, v] = [v, u];
          if (flags & 32) u = 1 - u;
          if (flags & 64) v = 1 - v;
          return [u, v];
        });
        for (const i of [0, 2, 1, 0, 3, 2]) {
          pos.setXYZ(at, ...(corners[i] as [number, number, number]));
          uv.setXY(
            at,
            ((tile % 8) * 32 + 0.5 + coords[i][0] * 31) / 256,
            1 - (Math.floor(tile / 8) * 32 + 0.5 + coords[i][1] * 31) / 640,
          );
          at++;
        }
      }
    pos.needsUpdate = uv.needsUpdate = true;
    this.ground.geometry.computeBoundingSphere();
  }
  render(): void {
    for (const item of this.sceneSprites.values()) {
      if (item.neutral) {
        const context = this.packed4Screen(item),
          material = item.mesh.material as THREE.ShaderMaterial;
        if (item.neutral.owner === undefined)
          updateNeutralPacked4Material(material, context);
        else
          updateOwnedPacked4Material(material, {
            ...context,
            owner: item.neutral.owner,
          });
      }
    }
    this.renderer.render(this.scene, this.camera);
  }
  dispose(): void {
    this.disposed = true;
    this.sceneRequest++;
    this.observer.disconnect();
    this.clearActors();
    this.ground?.geometry.dispose();
    (this.ground?.material as THREE.Material | undefined)?.dispose();
    for (const t of this.textureCache.values()) t.dispose();
    for (const t of this.frameTextures.values()) t.dispose();
    this.frameTextures.clear();
    for (const frame of this.packed4Frames.values()) {
      frame.bank192.dispose();
      frame.bank208.dispose();
      frame.indices.dispose();
    }
    this.packed4Frames.clear();
    for (const texture of this.packed4Lookups.values()) texture.dispose();
    this.packed4Lookups.clear();
    this.packed4Streams.clear();
    this.fadeBytes = null;
    this.images.clear();
    this.pendingImages.clear();
    this.pendingPacked4Frames.clear();
    this.sceneSprites.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** Battle Drones Stage pattern adapted for original indexed artwork and an
 * orthographic camera. Lighting, drone models and biome content removed.
 * This module only consumes world state; it never advances the simulation.
 */
import * as THREE from "three";
import type { Asset, Mission, Pack } from "../content/types";
import type { World } from "../sim/schema";
import { BUILDINGS } from "../sim/world";
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-15, 15, 10, -10, 0.1, 1000);
  readonly target = new THREE.Vector3(81, 0, 53);
  private ground: THREE.Mesh | null = null;
  private actors = new THREE.Group();
  private textureCache = new Map<string, THREE.Texture>();
  private images = new Map<string, HTMLImageElement>();
  private observer: ResizeObserver;
  private lastVisual = "";
  private activeMission: Mission | null = null;
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
    this.target.set(x, 0, y);
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
    const cached = this.images.get(key);
    if (cached) return Promise.resolve(cached);
    const asset = this.pack.assets[key];
    if (!asset) return Promise.reject(new Error("Missing asset " + key));
    return new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => {
        this.images.set(key, i);
        resolve(i);
      };
      i.onerror = () => reject(new Error("Cannot decode " + key));
      i.src = asset.image;
    });
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
  async setMission(m: Mission, atlas = "B32A"): Promise<void> {
    this.activeMission = m;
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
      mat?.map?.dispose();
      mat?.dispose();
      this.actors.remove(child);
    }
  }
  async frameCanvas(asset: Asset, index = 0): Promise<HTMLCanvasElement> {
    const entry = Object.entries(this.pack.assets).find(([, a]) => a === asset);
    if (!entry) throw new Error("Asset unavailable");
    const image = await this.image(entry[0]),
      frame = asset.frames?.[index];
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    if (frame && asset.sprites) {
      for (const [ref, x, y, flags] of frame.components) {
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
  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
  dispose(): void {
    this.observer.disconnect();
    this.clearActors();
    this.ground?.geometry.dispose();
    for (const t of this.textureCache.values()) t.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

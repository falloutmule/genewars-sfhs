import type { Stage } from "../render/stage";
export interface PickEntity {
  id: number;
  x: number;
  y: number;
  hitOffset?: number;
}
export interface PickWorld {
  specialists: readonly PickEntity[];
  buildings: readonly PickEntity[];
}
export function connectInput(
  stage: Stage,
  getWorld: () => PickWorld | null,
  select: (ids: number[]) => void,
  command: (x: number, y: number, queued: boolean) => void,
  isPlacing: () => boolean = () => false,
): () => void {
  const el = stage.renderer.domElement,
    abort = new AbortController(),
    opts = { signal: abort.signal };
  const points = new Map<
    number,
    {
      x: number;
      y: number;
      startX: number;
      startY: number;
      time: number;
      type: string;
    }
  >();
  let pinch = 0,
    multi = false,
    cycle = 0,
    lastHit = "";
  el.addEventListener("contextmenu", (e) => e.preventDefault(), opts);
  el.addEventListener(
    "pointerdown",
    (e) => {
      el.setPointerCapture(e.pointerId);
      points.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        time: performance.now(),
        type: e.pointerType,
      });
      if (points.size > 1) {
        multi = true;
        const p = [...points.values()];
        pinch = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      }
    },
    opts,
  );
  el.addEventListener(
    "pointermove",
    (e) => {
      const p = points.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x,
        dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (points.size === 2) {
        const ps = [...points.values()],
          distance = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
        if (pinch > 5) stage.zoom(distance / pinch);
        pinch = distance;
        stage.pan(dx / 2, dy / 2);
      } else if (p.type === "touch" || e.buttons === 4 || e.buttons === 2)
        stage.pan(dx, dy);
    },
    opts,
  );
  el.addEventListener(
    "pointerup",
    (e) => {
      const p = points.get(e.pointerId);
      points.delete(e.pointerId);
      if (!p) return;
      const distance = Math.hypot(e.clientX - p.startX, e.clientY - p.startY),
        world = getWorld();
      if (!multi && world) {
        if (distance > 12 && p.type === "mouse" && e.button === 0) {
          select(
            world.specialists
              .filter((a) => {
                const s = stage.project(
                  a.x + (a.hitOffset ?? 0.5),
                  a.y + (a.hitOffset ?? 0.5),
                );
                return (
                  s.x >= Math.min(p.startX, e.clientX) &&
                  s.x <= Math.max(p.startX, e.clientX) &&
                  s.y >= Math.min(p.startY, e.clientY) &&
                  s.y <= Math.max(p.startY, e.clientY)
                );
              })
              .map((a) => a.id),
          );
        } else if (distance < 12) {
          const entities = [...world.specialists, ...world.buildings];
          const hits = entities
            .filter((a) => {
              const s = stage.project(
                a.x + (a.hitOffset ?? 0.5),
                a.y + (a.hitOffset ?? 0.5),
              );
              return Math.hypot(s.x - e.clientX, s.y - e.clientY) < 30;
            })
            .map((a) => a.id)
            .sort((a, b) => a - b);
          if (hits.length && e.button === 0 && !isPlacing()) {
            const key = hits.join(",");
            cycle = key === lastHit ? (cycle + 1) % hits.length : 0;
            lastHit = key;
            select([hits[cycle]]);
          } else {
            const point = stage.pick(e.clientX, e.clientY);
            if (point) command(point.x, point.y, e.shiftKey);
          }
        }
      }
      if (points.size === 0) {
        multi = false;
        pinch = 0;
      }
    },
    opts,
  );
  el.addEventListener(
    "pointercancel",
    (e) => {
      points.delete(e.pointerId);
      if (!points.size) {
        multi = false;
        pinch = 0;
      }
    },
    opts,
  );
  el.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      stage.zoom(Math.exp(-e.deltaY * 0.001));
    },
    { ...opts, passive: false },
  );
  window.addEventListener(
    "blur",
    () => {
      points.clear();
      multi = false;
      pinch = 0;
    },
    opts,
  );
  return () => abort.abort();
}

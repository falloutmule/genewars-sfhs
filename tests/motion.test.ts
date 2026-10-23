import { it, expect } from "vitest";
import {
  createMotion,
  findRoute,
  originalAngle,
  stepGroundMotion,
  terrainNormal,
} from "../src/sim/mechanics/motion";
import {
  terrainFromBytes,
  MAP_BYTES,
  groundHeight,
  cellIndex,
} from "../src/sim/mechanics/terrain";
const trig = {
  atan: Array.from({ length: 257 }, (_, i) =>
    Math.trunc((Math.atan(i / 256) * 1024) / Math.PI),
  ),
  sine: Array.from({ length: 2048 }, (_, i) =>
    Math.trunc(Math.sin((i * Math.PI) / 1024) * 65536),
  ),
  cosine: Array.from({ length: 2048 }, (_, i) =>
    Math.trunc(Math.cos((i * Math.PI) / 1024) * 65536),
  ),
};
const flat = () =>
  terrainFromBytes(
    Array.from({ length: MAP_BYTES }, (_, i) =>
      i % 14 === 3 ? 4 : i % 14 === 5 ? 2 : 0,
    ),
  );
it("uses source angular directions and exact flat normal", () => {
  expect(originalAngle(1, 0, trig.atan)).toBe(512);
  expect(originalAngle(0, 1, trig.atan)).toBe(1024);
  expect(originalAngle(-1, 0, trig.atan)).toBe(1536);
  expect(terrainNormal(flat(), 0, 0)).toEqual([0, 0, 256]);
});
it("moves with fractions and acceleration rather than one cell per tick", () => {
  const t = flat(),
    m = createMotion(2048, 2048, groundHeight(t, 2048, 2048), 960);
  m.yaw = 512;
  stepGroundMotion(m, [4096, 2048], t, trig, 1024, () => false);
  expect(m.x - 2048).toBeLessThan(2);
  expect(m.fractionX).toBeGreaterThan(0);
  expect(m.speed).toBe(50);
});
it("crosses the world seam through a short wrapped route", () => {
  const path = findRoute([32760, 2048], [50, 2048], () => false)!;
  expect(path.length).toBe(1);
  const t = flat(),
    m = createMotion(32760, 2048, groundHeight(t, 32760, 2048), 960);
  m.yaw = 512;
  let arrived = false;
  for (let i = 0; i < 200 && !arrived; i++)
    arrived = stepGroundMotion(
      m,
      [50, 2048],
      t,
      trig,
      1024,
      () => false,
    ).arrived;
  expect(arrived).toBe(true);
  expect(m.x).toBe(50);
});
it("preserves motion state on blocked cell admission with an explained stop", () => {
  const t = flat(),
    m = createMotion(255, 2048, groundHeight(t, 255, 2048), 960);
  m.yaw = 512;
  m.speed = 960;
  const result = stepGroundMotion(
    m,
    [512, 2048],
    t,
    trig,
    1024,
    (c) => c === cellIndex(1, 8),
  );
  expect(result.blocked).toBe("Route obstructed");
  expect(m.x).toBe(255);
});
it("finds a route around occupied cells and rejects enclosed goals", () => {
  const blocked = new Set([cellIndex(1, 0)]);
  expect(findRoute([0, 0], [512, 0], (c) => blocked.has(c))!.length).toBe(4);
  for (const p of [
    [1, 0],
    [2, 127],
    [3, 0],
    [2, 1],
  ])
    blocked.add(cellIndex(...(p as [number, number])));
  expect(findRoute([0, 0], [512, 0], (c) => blocked.has(c))).toBeNull();
});
it("queries the proposed movement point instead of a cell-center surrogate", () => {
  const t = flat(),
    m = createMotion(255, 2048, groundHeight(t, 255, 2048), 960);
  m.yaw = 512;
  m.speed = 960;
  const queried: [number, [number, number]][] = [];
  const result = stepGroundMotion(
    m,
    [1024, 2048],
    t,
    trig,
    1024,
    (cell, point) => {
      queried.push([cell, point]);
      return point[0] >= 256;
    },
  );
  expect(queried.length).toBe(1);
  expect(queried[0][0]).toBe(cellIndex(1, 8));
  expect(queried[0][1][0]).toBeGreaterThanOrEqual(256);
  expect(queried[0][1][0]).toBeLessThan(384);
  expect(queried[0][1][1]).toBe(2048);
  expect(result.blocked).toBe("Route obstructed");
  expect(m.x).toBe(255);
});
it("can turn away from contact instead of repeating the same blocked heading", () => {
  const t = flat(),
    m = createMotion(255, 2048, groundHeight(t, 255, 2048), 960);
  m.yaw = 512;
  m.speed = 960;
  const r = stepGroundMotion(m, [1024, 1024], t, trig, 1024, () => true);
  expect(r.blocked).toBe("Route obstructed");
  expect(m.x).toBe(255);
  expect(m.y).toBe(2048);
  expect(m.yaw).toBeLessThan(512);
  expect(m.speed).toBe(0);
});

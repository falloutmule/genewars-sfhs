import {
  groundHeight,
  readWord,
  worldCell,
  cellIndex,
  integerSqrt,
  torusDelta,
  type TerrainState,
} from "./terrain";
export interface MotionTables {
  atan: readonly number[];
  sine: readonly number[];
  cosine: readonly number[];
}
export interface MotionState {
  x: number;
  y: number;
  fractionX: number;
  fractionY: number;
  height: number;
  ground: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  pitch: number;
  speed: number;
  desiredSpeed: number;
  width: number;
  turnBraking: boolean;
}
export const wrap16 = (v: number) => (v << 16) >> 16;
export function originalAngle(
  x: number,
  y: number,
  t: readonly number[],
): number {
  if (t.length !== 257) throw new Error("Original angle lookup is required");
  if (!x && !y) return 0;
  const ax = Math.abs(x),
    ay = Math.abs(y),
    a = t[Math.trunc((Math.min(ax, ay) * 256) / Math.max(ax, ay))];
  return x >= 0
    ? y < 0
      ? ax < ay
        ? a
        : 512 - a
      : ax < ay
        ? 1024 - a
        : 512 + a
    : y < 0
      ? ax < ay
        ? 2048 - a
        : 1536 + a
      : ax < ay
        ? 1024 + a
        : 1536 - a;
}
export function terrainNormal(
  t: TerrainState,
  x: number,
  y: number,
): [number, number, number] {
  const cx = (x >> 8) & 127,
    cy = (y >> 8) & 127,
    h = (a: number, b: number) =>
      readWord(t, cellIndex(cx + a, cy + b), 2) >> 3;
  const norm = (v: number[]): [number, number, number] => {
    const d = Math.max(
      1,
      integerSqrt(v.reduce((s, n) => (s + Math.imul(n, n)) >>> 0, 0)),
    );
    return v.map((n) => Math.trunc((n * 256) / d)) as [number, number, number];
  };
  const a = norm(
    (x & 255) < (y & 255)
      ? [256, 256, h(1, 1) - h(0, 0)]
      : [256, 0, h(1, 0) - h(0, 0)],
  );
  const b = norm(
    (x & 255) < (y & 255)
      ? [-256, 0, h(0, 1) - h(1, 1)]
      : [0, 256, h(1, 1) - h(1, 0)],
  );
  return norm([
    (a[1] * b[2] - b[1] * a[2]) >> 8,
    (a[2] * b[0] - b[2] * a[0]) >> 8,
    (a[0] * b[1] - b[0] * a[1]) >> 8,
  ]);
}
export function velocity(m: MotionState, t: MotionTables): void {
  const yaw = (m.yaw - 512) & 2047,
    pitch = (m.pitch - 512) & 2047;
  const horizontal = Math.floor((t.cosine[pitch] * m.speed) / 65536);
  m.vx = wrap16(Math.floor((t.cosine[yaw] * horizontal) / 65536));
  m.vy = wrap16(Math.floor((t.sine[yaw] * horizontal) / 65536));
  m.vz = wrap16(Math.floor((-t.sine[pitch] * m.speed) / 65536));
}
export function createMotion(
  x: number,
  y: number,
  ground: number,
  desiredSpeed: number,
  width = 50,
): MotionState {
  return {
    x: x & 32767,
    y: y & 32767,
    fractionX: 0,
    fractionY: 0,
    height: ground,
    ground,
    vx: 0,
    vy: 0,
    vz: 0,
    yaw: 0,
    pitch: 512,
    speed: 0,
    desiredSpeed,
    width,
    turnBraking: false,
  };
}
export function moveGoal(
  m: MotionState,
  goal: [number, number],
  tables: MotionTables,
): void {
  m.yaw = originalAngle(
    torusDelta(goal[0], m.x) * 2,
    torusDelta(goal[1], m.y) * 2,
    tables.atan,
  );
  m.turnBraking = false;
}
/**74A50 moves a rejected destination back toward the actor in fixed64-unit
 * steps. The radius64 terminal sample is queried and returned as in source. */
export function resolveMovementTarget(
  current: [number, number],
  requested: [number, number],
  tables: MotionTables,
  accepts: (p: [number, number]) => boolean,
): [number, number] {
  const angle = originalAngle(
      wrap16(wrap16(current[0] - requested[0]) * 2),
      wrap16(wrap16(current[1] - requested[1]) * 2),
      tables.atan,
    ),
    direction = (angle + 1536) & 2047;
  const delta = [tables.cosine[direction] << 6, tables.sine[direction] << 6],
    fixed = requested.map((v) => v << 16);
  for (let i = 0; i < 4096; i++) {
    let p: [number, number] = [fixed[0] >> 16, fixed[1] >> 16];
    const dx = torusDelta(current[0], p[0]),
      dy = torusDelta(current[1], p[1]);
    if (dx * dx + dy * dy <= 4096) p = [...current];
    if (accepts(p) || (p[0] === current[0] && p[1] === current[1]))
      return p.map((v) => v & 32767) as [number, number];
    fixed[0] = (fixed[0] + delta[0]) | 0;
    fixed[1] = (fixed[1] + delta[1]) | 0;
  }
  throw new Error("Original movement target search did not converge");
}
export type MotionResult = {
  arrived: boolean;
  blocked: string | null;
  enteredCell: number | null;
};
/** Source ground contact/steering and fixed-point integration. Water, airborne
 * collision and entity contacts are explicit host boundaries, never guessed.
 */
export function stepGroundMotion(
  m: MotionState,
  goal: [number, number],
  terrain: TerrainState,
  tables: MotionTables,
  gravity: number,
  blocked: (cell: number, point: [number, number]) => boolean,
): MotionResult {
  const dx = torusDelta(goal[0], m.x),
    dy = torusDelta(goal[1], m.y),
    dz = (groundHeight(terrain, ...goal) - m.ground) >> 3;
  const distance =
    (Math.imul(dx, dx) + Math.imul(dy, dy) + Math.imul(dz, dz)) | 0;
  if (
    m.height <= m.ground &&
    m.speed <= 256 &&
    distance >= 0 &&
    distance <= 1024
  ) {
    m.x = goal[0] & 32767;
    m.y = goal[1] & 32767;
    m.fractionX = m.fractionY = m.speed = m.vx = m.vy = m.vz = 0;
    m.ground = m.height = groundHeight(terrain, m.x, m.y);
    return { arrived: true, blocked: null, enteredCell: null };
  }
  const previous = { ...m },
    oldCell = worldCell(m.x, m.y),
    normal = terrainNormal(terrain, m.x, m.y);
  const targetYaw = originalAngle(dx * 2, dy * 2, tables.atan),
    delta = ((targetYaw - m.yaw + 3072) & 2047) - 1024;
  m.turnBraking = Math.abs(delta) >= 256;
  const brake = () => (m.speed > m.width ? m.speed - m.width : 0);
  const stopping = Math.trunc((m.speed * m.speed) / (m.width << 7));
  const desired =
    Math.imul(
      normal[2] + (wrap16(m.ground) < m.ground ? 0 : 128) - 128,
      m.desiredSpeed,
    ) >> 7;
  m.speed =
    m.turnBraking || distance <= Math.imul(stopping, stopping)
      ? brake()
      : Math.abs(m.speed - desired) <= m.width
        ? wrap16(desired)
        : desired < m.speed
          ? brake()
          : wrap16(m.speed + m.width);
  // Physics samples pitch from the previous velocity/ground before applying the
  // new contact speed; normal slopes change vertical motion on the next sample.
  const sampleX = ((m.x << 16) + (m.fractionX << 8) + (m.vx << 10)) | 0,
    sampleY = ((m.y << 16) + (m.fractionY << 8) + (m.vy << 10)) | 0;
  const sampleGround = groundHeight(terrain, sampleX >> 16, sampleY >> 16),
    vz = wrap16((sampleGround - m.ground) * 8);
  const xy = integerSqrt((Math.imul(m.vx, m.vx) + Math.imul(m.vy, m.vy)) >>> 0);
  m.pitch = xy || vz ? originalAngle(xy, -vz, tables.atan) : 512;
  velocity(m, tables);
  const fixedX = ((m.x << 16) + (m.fractionX << 8) + (m.vx << 10)) | 0,
    fixedY = ((m.y << 16) + (m.fractionY << 8) + (m.vy << 10)) | 0;
  const nx = (fixedX >> 16) & 32767,
    ny = (fixedY >> 16) & 32767,
    newCell = worldCell(nx, ny);
  if (blocked(newCell, [nx, ny])) {
    Object.assign(m, previous);
    m.speed = m.vx = m.vy = m.vz = 0;
    // Route reliability policy: retain steering while contact stops translation.
    // Restoring heading too can trap an actor facing a building permanently.
    m.yaw =
      (previous.yaw +
        Math.sign(delta) * Math.min(Math.abs(delta), m.width * 2)) &
      2047;
    return { arrived: false, blocked: "Route obstructed", enteredCell: null };
  }
  m.x = nx;
  m.y = ny;
  m.fractionX = (fixedX >> 8) & 255;
  m.fractionY = (fixedY >> 8) & 255;
  m.ground = groundHeight(terrain, nx, ny);
  m.height = m.ground;
  m.yaw =
    (m.yaw + Math.sign(delta) * Math.min(Math.abs(delta), m.width * 2)) & 2047;
  velocity(m, tables);
  return {
    arrived: false,
    blocked: null,
    enteredCell: newCell !== oldCell ? newCell : null,
  };
}
/** Modern route reliability policy over original terrain admission; torus
 * wrapping and source speed/acceleration remain in the motion system above. */
export function findRoute(
  start: [number, number],
  goal: [number, number],
  blocked: (cell: number) => boolean,
): [number, number][] | null {
  const from = worldCell(...start),
    to = worldCell(...goal);
  if (from === to) return [goal];
  if (blocked(to)) return null;
  const prior = new Int32Array(16384).fill(-1),
    queue = [from];
  prior[from] = from;
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i],
      x = c & 127,
      y = c >> 7;
    for (const [dx, dy] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ]) {
      const next = cellIndex(x + dx, y + dy);
      if (prior[next] !== -1 || blocked(next)) continue;
      prior[next] = c;
      if (next === to) {
        const result: [number, number][] = [goal];
        for (let at = prior[to]; at !== from; at = prior[at])
          result.push([((at & 127) << 8) | 127, ((at >> 7) << 8) | 127]);
        return result.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

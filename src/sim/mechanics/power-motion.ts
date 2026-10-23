/** Effect33's no-gravity horizontal motion and stable shared-pool allocation.
 * Source451F0/48790 ->6DF30 ->4C8E6. No homing or RNG is introduced. */
import { originalAngle, type MotionTables } from "./motion";
import { integerSqrt, worldCell, type TerrainState } from "./terrain";

export type EffectNativePrior = (number | null)[];
/** Loader49FD0 copies numeric bytes around its eight-byte pointer/resource
 * gap. Null means unknown, never an executable process address. */
export function validateEffectNativePrior(
  prior: readonly (number | null)[],
): void {
  if (prior.length !== 81)
    throw new Error("Invalid shared effect native prior");
  for (let p = 0; p < 81; p++) {
    const v = prior[p];
    if (
      p >= 31 && p < 39
        ? v !== null
        : v !== null && (!Number.isInteger(v) || v < 0 || v > 255)
    )
      throw new Error("Invalid shared effect native prior");
  }
}
export function effectPriorByte(
  prior: readonly (number | null)[],
  offset: number,
): number {
  const value = prior[offset];
  if (value === null || value === undefined)
    throw new Error("Unknown shared effect prior byte " + offset);
  return value;
}
export function putEffectWord(
  prior: EffectNativePrior,
  offset: number,
  value: number,
): void {
  prior[offset] = value & 255;
  prior[offset + 1] = (value >> 8) & 255;
}
export function putEffectDword(
  prior: EffectNativePrior,
  offset: number,
  value: number,
): void {
  putEffectWord(prior, offset, value);
  putEffectWord(prior, offset + 2, value >> 16);
}
/**7B380 shade sampling, shared with the known factory/physics numeric image. */
export function effectTerrainShade(
  terrain: TerrainState,
  x: number,
  y: number,
): number {
  const cx = x >> 8,
    cy = y >> 8,
    fx = x & 255,
    fy = y & 255;
  const corner = (dx: number, dy: number) => {
    const p = (((cy + dy) & 127) * 128 + ((cx + dx) & 127)) * 14;
    return (
      ((((terrain.bytes[p] | (terrain.bytes[p + 1] << 8)) << 16) >> 16) *
        terrain.bytes[p + 12]) >>
      6
    );
  };
  const a = corner(0, 0),
    b = corner(1, 0),
    c = corner(0, 1),
    d = corner(1, 1);
  return Math.max(
    0,
    Math.min(
      64,
      ((2 * a +
        ((fx < fy
          ? (d - c) * fx + (c - a) * fy
          : (b - a) * fx + (d - b) * fy) >>
          7) -
        0x1e00) >>
        8) +
        16,
    ),
  );
}
export interface EffectFactoryFields {
  slot: number;
  code: number;
  owner: number;
  x: number;
  y: number;
  ground: number;
  height: number;
  shade?: number;
  vx: number;
  vy: number;
  vz: number;
  accelerationZ: number;
  yaw: number;
  pitch: number;
  speed: number;
  delay: number;
}
/**48790 common numeric writes. Counter30, fractions67/68, child73 and76
 * survive unless the concrete factory writes them afterward. Spatial host
 * installs actual previous/next identity links after insertion. */
export function effectFactoryPrior(
  prior: readonly (number | null)[],
  f: EffectFactoryFields,
): EffectNativePrior {
  validateEffectNativePrior(prior);
  const n = prior.slice();
  n[2] = n[5] = 0;
  n[6] = 5;
  putEffectWord(n, 0, worldCell(f.x, f.y));
  putEffectWord(n, 7, f.x);
  putEffectWord(n, 9, f.y);
  n.fill(0, 11, 15);
  putEffectWord(n, 15, f.slot);
  putEffectDword(n, 17, f.ground);
  putEffectWord(n, 21, 0x20);
  n[23] = f.shade ?? null;
  n[24] = f.owner;
  n[25] = n[26] = n[27] = 0;
  n[28] = 1;
  n[29] = f.delay & 255;
  putEffectDword(n, 39, f.height);
  putEffectWord(n, 43, 16);
  putEffectWord(n, 45, f.vx);
  putEffectWord(n, 47, f.vy);
  putEffectWord(n, 49, f.vz);
  n.fill(0, 51, 57);
  putEffectWord(n, 55, f.accelerationZ);
  putEffectWord(n, 57, f.yaw);
  putEffectWord(n, 59, f.pitch);
  putEffectWord(n, 61, f.speed);
  putEffectWord(n, 63, -1);
  n[69] = f.code;
  n[70] = 0;
  putEffectWord(n, 74, -1);
  return n;
}
/**49D30 retains the numeric afterimage; source724C0 clears a self-reference's
 * kind byte only. Cross-record cleanup belongs to the host transaction. */
export function retireEffectPrior(
  prior: readonly (number | null)[],
  slot: number,
): EffectNativePrior {
  validateEffectNativePrior(prior);
  const n = prior.slice();
  n[6] = 0;
  if (n[21] !== null) n[21] &= 0xfe;
  if (
    n[73] === 5 &&
    (effectPriorByte(n, 71) | (effectPriorByte(n, 72) << 8)) === slot
  )
    n[73] = 0;
  return n;
}

export interface PowerMotionPacket {
  id: number;
  sourceId: number;
  /** Null is the source destination-kind clear after target destruction. */
  targetId: number | null;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ground: number;
  height: number;
  frame: number;
  timer: number;
  yaw: number;
  pitch: 512;
  speed: number;
  /** Cached source orientation derived from constant velocity/table inputs. */
  motionYaw: number;
  motionSpeed: number;
}
export interface PowerEffectSlot {
  nativePrior?: EffectNativePrior;
  /** Inactive source fraction bytes survive slot retirement/reuse. Null means
   * no admitted prior is available; the factory must reject rather than zero. */
  fractionX: number | null;
  fractionY: number | null;
  /** A non-power effect may occupy this shared source slot. */
  occupied: boolean;
  packet: PowerMotionPacket | null;
}
export interface PowerEffectPool {
  slots: PowerEffectSlot[];
}
export interface PowerLaunchRequest {
  id: number;
  sourceId: number;
  targetId: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  /** Explicit source building index and payload, distinct from normalized ID. */
  destinationIndex?: number;
  payload?: number;
}
export type PowerMotionResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string; slot?: number };
const validInteger = (n: number, min: number, max: number) =>
  Number.isInteger(n) && n >= min && n <= max;
const wrap16 = (n: number) => (n << 16) >> 16;
const delta = (a: number, b: number) => wrap16((a - b) * 2) >> 1;
const clone = (pool: PowerEffectPool): PowerEffectPool => ({
  slots: pool.slots.map((s) => ({
    ...s,
    ...(s.nativePrior ? { nativePrior: s.nativePrior.slice() } : {}),
    packet: s.packet ? { ...s.packet } : null,
  })),
});
function invalidPool(pool: PowerEffectPool) {
  if (pool.slots.length !== 200) return "power-effect-pool-must-have-200-slots";
  const ids = new Set<number>();
  for (const slot of pool.slots) {
    if (slot.nativePrior) {
      try {
        validateEffectNativePrior(slot.nativePrior);
      } catch {
        return "invalid-power-native-prior";
      }
    }
    if (
      (slot.fractionX !== null && !validInteger(slot.fractionX, 0, 255)) ||
      (slot.fractionY !== null && !validInteger(slot.fractionY, 0, 255))
    )
      return "invalid-power-fraction-prior";
    const p = slot.packet;
    if (p) {
      if (
        !slot.occupied ||
        slot.fractionX === null ||
        slot.fractionY === null ||
        !validInteger(p.id, 0, Number.MAX_SAFE_INTEGER) ||
        ids.has(p.id) ||
        !validInteger(p.x, -32768, 32767) ||
        !validInteger(p.y, -32768, 32767) ||
        !validInteger(p.vx, -32768, 32767) ||
        !validInteger(p.vy, -32768, 32767) ||
        !validInteger(p.yaw, 0, 2048) ||
        !validInteger(p.motionYaw, 0, 2048) ||
        !validInteger(p.speed, 0, 0x4b00) ||
        !validInteger(p.motionSpeed, 0, 0x4b00) ||
        !validInteger(p.frame, 0, 255) ||
        !validInteger(p.timer, -32768, 32767) ||
        !validInteger(p.ground, -65536, 65534) ||
        p.height !== p.ground + 512 ||
        p.pitch !== 512
      )
        return "invalid-power-motion-packet";
      ids.add(p.id);
    }
  }
  return undefined;
}

/** Initial fractions can be read from original inactive packed-effect bytes
 *59/60, which57540 copies to native67/68. Occupancy belongs to the shared pool. */
export function createPowerEffectPool(
  priors: readonly {
    fractionX: number | null;
    fractionY: number | null;
    occupied: boolean;
    nativePrior?: (number | null)[];
  }[],
): PowerMotionResult<PowerEffectPool> {
  const pool = {
    slots: priors.map((p) => ({
      ...p,
      ...(p.nativePrior ? { nativePrior: p.nativePrior.slice() } : {}),
      packet: null,
    })),
  };
  const invalid = invalidPool(pool);
  return invalid ? { ok: false, reason: invalid } : { ok: true, value: pool };
}

/** Ordered48790 free-slot factories. A later failure rolls back every earlier
 * request. Full-pool priority replacement remains explicit unsupported work. */
export function launchPowerPackets(
  before: PowerEffectPool,
  requests: readonly PowerLaunchRequest[],
  tables: MotionTables,
  groundAt: (x: number, y: number) => number,
  shadeAt?: (x: number, y: number) => number,
): PowerMotionResult<{
  pool: PowerEffectPool;
  allocated: { packetId: number; slot: number }[];
}> {
  const invalid = invalidPool(before);
  if (invalid) return { ok: false, reason: invalid };
  if (
    tables.atan.length !== 257 ||
    tables.sine.length !== 2048 ||
    tables.cosine.length !== 2048 ||
    tables.atan.some((n) => !validInteger(n, 0, 256)) ||
    [...tables.sine, ...tables.cosine].some(
      (n) => !validInteger(n, -65536, 65536),
    )
  )
    return { ok: false, reason: "source-power-motion-tables-required" };
  const pool = clone(before),
    allocated: { packetId: number; slot: number }[] = [];
  const ids = new Set(
    pool.slots.flatMap((s) => (s.packet ? [s.packet.id] : [])),
  );
  for (const request of requests) {
    if (
      !validInteger(request.id, 0, Number.MAX_SAFE_INTEGER) ||
      ids.has(request.id) ||
      [request.x, request.y, request.targetX, request.targetY].some(
        (n) => !validInteger(n, -32768, 32767),
      ) ||
      (request.destinationIndex !== undefined &&
        !validInteger(request.destinationIndex, 0, 255)) ||
      (request.payload !== undefined && !validInteger(request.payload, 0, 255))
    )
      return { ok: false, reason: "invalid-power-launch-request" };
    const index = pool.slots.findIndex((s) => !s.occupied);
    if (index < 0)
      return {
        ok: false,
        reason: "power-effect-pool-full-replacement-required",
      };
    const slot = pool.slots[index];
    if (slot.fractionX === null || slot.fractionY === null)
      return {
        ok: false,
        reason: "power-effect-fraction-prior-required",
        slot: index,
      };
    const ground = groundAt(request.x, request.y);
    if (!validInteger(ground, -65536, 65534))
      return { ok: false, reason: "invalid-power-ground-sample", slot: index };
    const yaw = originalAngle(
      delta(request.targetX, request.x) * 2,
      delta(request.targetY, request.y) * 2,
      tables.atan,
    );
    const angle = (yaw - 512) & 2047;
    const horizontal = Math.floor((tables.cosine[0] * 2048) / 65536);
    const vx = wrap16(Math.floor((tables.cosine[angle] * horizontal) / 65536));
    const vy = wrap16(Math.floor((tables.sine[angle] * horizontal) / 65536));
    // Pitch512 has zero vertical component in the admitted original table.
    if (tables.sine[0] !== 0 || tables.cosine[0] !== 65536)
      return { ok: false, reason: "source-power-horizontal-pitch-required" };
    slot.occupied = true;
    slot.packet = {
      id: request.id,
      sourceId: request.sourceId,
      targetId: request.targetId,
      x: request.x,
      y: request.y,
      vx,
      vy,
      ground,
      height: ground + 512,
      frame: 0,
      timer: -1,
      yaw,
      pitch: 512,
      speed: 2048,
      motionYaw:
        vx !== 0 || vy !== 0 ? originalAngle(vx, vy, tables.atan) : yaw,
      motionSpeed: integerSqrt((Math.imul(vx, vx) + Math.imul(vy, vy)) >>> 0),
    };
    if (slot.nativePrior) {
      const p = slot.packet,
        shade = shadeAt?.(p.x, p.y);
      if (shade !== undefined && !validInteger(shade, 0, 64))
        return { ok: false, reason: "invalid-power-shade-sample", slot: index };
      slot.nativePrior = effectFactoryPrior(slot.nativePrior, {
        slot: index,
        code: 33,
        owner: 0,
        x: p.x,
        y: p.y,
        ground: p.ground,
        height: p.height,
        shade,
        vx: p.vx,
        vy: p.vy,
        vz: 0,
        accelerationZ: 0,
        yaw: p.yaw,
        pitch: p.pitch,
        speed: p.speed,
        delay: 0,
      });
      const n = slot.nativePrior;
      // These source caller writes replace particle child/payload afterimages.
      n[71] =
        request.destinationIndex === undefined
          ? null
          : request.destinationIndex & 255;
      n[72] =
        request.destinationIndex === undefined
          ? null
          : request.destinationIndex >> 8;
      n[73] = 4;
      n[76] = request.payload ?? null;
      n[67] = slot.fractionX;
      n[68] = slot.fractionY;
    }
    ids.add(request.id);
    allocated.push({ packetId: request.id, slot: index });
  }
  return { ok: true, value: { pool, allocated } };
}

/** Source movement is constant launch velocity, not target seeking. Fixed XY
 *integration retains8 fraction bits: coordinate += velocity/64 per callback.
 *4C8E6 then restores sampled terrain+512, so no repeated grounded branch is
 *silently substituted. Source effect33 collision/water virtuals are no-ops. */
export function stepPowerPacketMotion(
  before: PowerEffectPool,
  groundAt: (x: number, y: number) => number,
  shadeAt?: (x: number, y: number) => number,
  onlySlots?: readonly number[],
): PowerMotionResult<{
  pool: PowerEffectPool;
  samples: { id: number; x: number; y: number; targetValid: boolean }[];
  moved: { packetId: number; slot: number; oldCell: number; newCell: number }[];
}> {
  const invalid = invalidPool(before);
  if (invalid) return { ok: false, reason: invalid };
  if (
    onlySlots &&
    (new Set(onlySlots).size !== onlySlots.length ||
      onlySlots.some((slot) => !validInteger(slot, 0, 199)))
  )
    return { ok: false, reason: "invalid-power-callback-slot" };
  const pool = clone(before),
    samples: { id: number; x: number; y: number; targetValid: boolean }[] = [],
    moved: {
      packetId: number;
      slot: number;
      oldCell: number;
      newCell: number;
    }[] = [];
  for (const [index, slot] of pool.slots.entries()) {
    if (onlySlots && !onlySlots.includes(index)) continue;
    const p = slot.packet;
    if (!p) continue;
    const oldCell = ((p.y >> 8) & 127) * 128 + ((p.x >> 8) & 127);
    const fixedX = p.x * 256 + slot.fractionX! + p.vx * 4;
    const fixedY = p.y * 256 + slot.fractionY! + p.vy * 4;
    p.x = Math.floor(fixedX / 256) & 32767;
    p.y = Math.floor(fixedY / 256) & 32767;
    slot.fractionX = fixedX & 255;
    slot.fractionY = fixedY & 255;
    const ground = groundAt(p.x, p.y);
    if (!validInteger(ground, -65536, 65534))
      return { ok: false, reason: "invalid-power-ground-sample", slot: index };
    p.ground = ground;
    p.height = ground + 512;
    p.yaw = p.motionYaw;
    p.speed = p.motionSpeed;
    p.frame = (Math.min(p.frame, 3) + 1) % 4;
    if (p.timer >= 0) p.timer = wrap16(p.timer - 1);
    if (slot.nativePrior) {
      const n = slot.nativePrior,
        shade = shadeAt?.(p.x, p.y);
      if (shade !== undefined && !validInteger(shade, 0, 64))
        return { ok: false, reason: "invalid-power-shade-sample", slot: index };
      putEffectWord(n, 7, p.x);
      putEffectWord(n, 9, p.y);
      putEffectDword(n, 17, p.ground);
      n[23] = shade ?? null;
      putEffectDword(n, 39, p.height);
      putEffectWord(n, 57, p.yaw);
      putEffectWord(n, 59, p.pitch);
      putEffectWord(n, 61, p.speed);
      n[26] = 0;
      n[27] = p.frame;
      n[30] = 0;
      n[67] = slot.fractionX;
      n[68] = slot.fractionY;
      putEffectWord(n, 74, p.timer);
    }
    const newCell = ((p.y >> 8) & 127) * 128 + ((p.x >> 8) & 127);
    if (oldCell !== newCell)
      moved.push({ packetId: p.id, slot: index, oldCell, newCell });
    samples.push({
      id: p.id,
      x: p.x,
      y: p.y,
      targetValid: p.targetId !== null,
    });
  }
  return { ok: true, value: { pool, samples, moved } };
}

/** Source destruction clears destination kind before a building slot can be
 *reused. Index/launch velocity remain unchanged and decay continues. */
export function detachPowerPacketTargets(
  before: PowerEffectPool,
  targetId: number,
): PowerMotionResult<PowerEffectPool> {
  const invalid = invalidPool(before);
  if (invalid) return { ok: false, reason: invalid };
  const pool = clone(before);
  for (const slot of pool.slots)
    if (slot.packet?.targetId === targetId) {
      slot.packet.targetId = null;
      if (slot.nativePrior) slot.nativePrior[73] = 0;
    }
  return { ok: true, value: pool };
}

/** Retire delivered/expired packet IDs after stepEconomyPackets. Fractions
 *survive, and future factories reuse the lowest genuinely free shared slot. */
export function retirePowerPacketSlots(
  before: PowerEffectPool,
  packetIds: readonly number[],
): PowerMotionResult<PowerEffectPool> {
  const invalid = invalidPool(before);
  if (invalid) return { ok: false, reason: invalid };
  const pool = clone(before),
    seen = new Set<number>();
  for (const id of packetIds) {
    const slot = pool.slots.find((s) => s.packet?.id === id);
    if (!slot || seen.has(id))
      return { ok: false, reason: "stale-power-packet-retirement" };
    seen.add(id);
    if (slot.nativePrior)
      slot.nativePrior = retireEffectPrior(
        slot.nativePrior,
        pool.slots.indexOf(slot),
      );
    slot.packet = null;
    slot.occupied = false;
  }
  return { ok: true, value: pool };
}

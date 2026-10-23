/** Source57540 specialist split-copy;81310/4FD30/80830(no unit)/56E20.
 * Native process addresses are typed bindings and always null in byte images.
 */
export type SpecialistNative = (number | null)[];
export interface SpecialistRules {
  actorResourceNames: readonly string[];
  actorClassSpeeds: readonly number[];
}
export interface SpecialistBinding {
  owner: number;
  blueprintIndex: number;
  style: number;
  category: number;
  resourceKey: number;
  assetKey: string;
  sourceName: string;
  classSpeed: number;
  blueprintOffset: 192;
  animationOffset: 31;
  resourceOffset: 196;
  internal: { offset: 176; targetOffset: 196 };
  vtable: "kind3";
}
export interface SpecialistPool {
  schemaVersion: 1;
  records: SpecialistNative[];
  bindings: (SpecialistBinding | null)[];
}
function cloneBinding(binding: SpecialistBinding): SpecialistBinding {
  return { ...binding, internal: { ...binding.internal } };
}
/** Preserve unknown numeric cells and inactive retained resource bindings. */
export function cloneSpecialistPool(pool: SpecialistPool): SpecialistPool {
  return {
    ...pool,
    records: pool.records.map((record) => record.slice()),
    bindings: pool.bindings.map((binding) =>
      binding ? cloneBinding(binding) : null,
    ),
  };
}
export interface SpecialistOrigin {
  position: [number, number];
  height: number;
  shade: number;
}
export interface SpecialistCreateRequest {
  blueprintIndex: number;
  origin: SpecialistOrigin;
  finalTarget: [number, number];
}
export interface SpecialistMotionProjection {
  x: number;
  y: number;
  ground: number;
  height: number;
  width: number;
  fractionX: number;
  fractionY: number;
  velocity: [number, number, number];
  acceleration: [number, number, number];
  yaw: number;
  pitch: number;
  speed: number;
  desiredSpeed: number;
  sourceClassSpeed: number;
}
export interface SpecialistCreationReceipt {
  pool: SpecialistPool;
  player: number[];
  created: {
    index: number;
    binding: SpecialistBinding;
    motion: SpecialistMotionProjection;
  } | null;
  origin: SpecialistOrigin;
  finalTarget: [number, number];
  /** No source map insertion or80AE0 readiness is performed by this factory. */
  activationPending: boolean;
}
const pointers = [
  [31, 39],
  [176, 180],
  [192, 200],
] as const;
const pointer = (p: number) => pointers.some(([a, b]) => p >= a && p < b);
function int(v: number, lo: number, hi: number, label: string) {
  if (!Number.isInteger(v) || v < lo || v > hi)
    throw Error("Invalid specialist " + label);
}
function b(n: readonly (number | null)[], p: number) {
  const v = n[p];
  if (v === null || v === undefined)
    throw Error("Unknown specialist native byte " + p);
  return v;
}
function w(n: readonly (number | null)[], p: number) {
  return ((b(n, p) | (b(n, p + 1) << 8)) << 16) >> 16;
}
function d(n: readonly (number | null)[], p: number) {
  return (
    b(n, p) | (b(n, p + 1) << 8) | (b(n, p + 2) << 16) | (b(n, p + 3) << 24)
  );
}
function pw(n: SpecialistNative, p: number, v: number) {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
}
function pd(n: SpecialistNative, p: number, v: number) {
  for (let i = 0; i < 4; i++) n[p + i] = (v >>> (i * 8)) & 255;
}
export function validateSpecialistNative(n: readonly (number | null)[]): void {
  if (n.length !== 200)
    throw Error("Specialist native record must contain200 bytes");
  for (let i = 0; i < 200; i++)
    if (
      pointer(i)
        ? n[i] !== null
        : n[i] !== null && (!Number.isInteger(n[i]) || n[i]! < 0 || n[i]! > 255)
    )
      throw Error("Invalid specialist numeric/pointer prior at " + i);
}
/** Explicit unknown constructor/tail prior. This does not establish zeroes. */
export function unknownSpecialistPriors(): SpecialistNative[] {
  return Array.from({ length: 20 }, () => Array(200).fill(null));
}
function rules(r: SpecialistRules) {
  if (r.actorResourceNames.length !== 16 || r.actorClassSpeeds.length !== 4)
    throw Error("Original specialist resource/style tables required");
  r.actorClassSpeeds.forEach((v) => int(v, -32768, 32767, "class speed"));
}
function player(raw: readonly number[]) {
  if (raw.length !== 1805)
    throw Error("Original specialist player record extent required");
  raw.forEach((v) => int(v, 0, 255, "player byte"));
  int(raw[1], 0, 3, "player owner");
  return raw[1];
}
function binding(
  raw: readonly number[],
  index: number,
  r: SpecialistRules,
): SpecialistBinding {
  const owner = player(raw);
  rules(r);
  int(index, 0, 31, "blueprint index");
  const at = 0x16 + index * 36,
    style = (raw[at + 0x15] << 24) >> 24,
    category = (raw[at + 0x16] << 24) >> 24;
  int(style, 0, 3, "blueprint style");
  int(category, 0, 3, "blueprint category");
  const resourceKey = 4 * style + category,
    sourceName = r.actorResourceNames[resourceKey];
  if (
    typeof sourceName !== "string" ||
    !/^data[\\/]spec[\\/][a-z0-9_]+\.anb$/i.test(sourceName)
  )
    throw Error("Original specialist resource name required");
  return {
    owner,
    blueprintIndex: index,
    style,
    category,
    resourceKey,
    sourceName,
    assetKey: sourceName
      .split(/[\\/]/)
      .at(-1)!
      .replace(/\.anb$/i, "")
      .toUpperCase(),
    classSpeed: r.actorClassSpeeds[style],
    blueprintOffset: 192,
    animationOffset: 31,
    resourceOffset: 196,
    internal: { offset: 176, targetOffset: 196 },
    vtable: "kind3",
  };
}
function validatePool(pool: SpecialistPool) {
  if (
    pool.schemaVersion !== 1 ||
    pool.records.length !== 20 ||
    pool.bindings.length !== 20
  )
    throw Error("Specialist pool requires20 records/bindings");
  pool.records.forEach(validateSpecialistNative);
}
/** Source56E20 for a copied live actor; resets only94..BF and binds handles.
 * Player metadata comes from the actual retained roster, never table defaults.
 */
export function bindSpecialistResources(
  before: readonly (number | null)[],
  raw: readonly number[],
  r: SpecialistRules,
): { native: SpecialistNative; binding: SpecialistBinding } {
  validateSpecialistNative(before);
  if (b(before, 6) !== 3 || b(before, 24) !== player(raw))
    throw Error("Specialist resource owner/type differs");
  const result = binding(raw, b(before, 0x74), r),
    native = before.slice();
  native.fill(0, 0x94, 0xc0);
  for (const [a, z] of pointers) native.fill(null, a, z);
  return { native, binding: result };
}
/**57540 copies exactly140 serialized bytes around the eight-byte header gap.
 * Tail148..199 remains supplied prior/null. Active copies require live player
 * rosters and56E20 binding; inactive copies retain their existing bindings.
 */
export function loadSpecialistPool(
  packed: readonly number[],
  priors: readonly (readonly (number | null)[])[] = unknownSpecialistPriors(),
  options: {
    bindings?: readonly (SpecialistBinding | null)[];
    players?: readonly (readonly number[])[];
    rules?: SpecialistRules;
  } = {},
): SpecialistPool {
  if (packed.length !== 2800 || priors.length !== 20)
    throw Error(
      "Specialist source requires20×140 packed and20×200 prior bytes",
    );
  packed.forEach((v) => int(v, 0, 255, "packed byte"));
  priors.forEach(validateSpecialistNative);
  if (options.bindings && options.bindings.length !== 20)
    throw Error("Specialist prior binding extent differs");
  const pool: SpecialistPool = {
    schemaVersion: 1,
    records: priors.map((n) => n.slice()),
    bindings: (options.bindings ?? Array(20).fill(null)).map((binding) =>
      binding ? cloneBinding(binding) : null,
    ),
  };
  for (let slot = 0; slot < 20; slot++) {
    const n = pool.records[slot],
      start = slot * 140;
    for (let p = 0; p < 31; p++) n[p] = packed[start + p];
    for (let p = 31; p < 140; p++) n[p + 8] = packed[start + p];
    if (b(n, 6) !== 0) {
      if (!options.players || !options.rules)
        throw Error(
          "Active specialist source requires retained player/resource binding",
        );
      const owner = b(n, 24),
        raw = options.players[owner];
      if (!raw || w(n, 15) !== slot || Math.floor(slot / 5) !== owner)
        throw Error("Active specialist identity/partition differs");
      const initialized = bindSpecialistResources(n, raw, options.rules);
      pool.records[slot] = initialized.native;
      pool.bindings[slot] = initialized.binding;
    }
  }
  return pool;
}
export function projectSpecialistMotion(
  n: readonly (number | null)[],
  handle: SpecialistBinding,
): SpecialistMotionProjection {
  validateSpecialistNative(n);
  if (
    b(n, 6) !== 3 ||
    b(n, 24) !== handle.owner ||
    b(n, 0x74) !== handle.blueprintIndex
  )
    throw Error("Specialist motion binding differs");
  return {
    x: w(n, 7),
    y: w(n, 9),
    ground: d(n, 17),
    height: d(n, 39),
    width: w(n, 43),
    fractionX: b(n, 67),
    fractionY: b(n, 68),
    velocity: [w(n, 45), w(n, 47), w(n, 49)],
    acceleration: [w(n, 51), w(n, 53), w(n, 55)],
    yaw: w(n, 57),
    pitch: w(n, 59),
    speed: w(n, 61),
    desiredSpeed: w(n, 63),
    sourceClassSpeed: handle.classSpeed,
  };
}
/**4FD30 only: no roster append,80830 placement or56E20 scratch reset.
 * The actual slot prior is preserved outside this constructor's writes. */
export function initializeSpecialistNative(
  before: readonly (number | null)[],
  raw: readonly number[],
  request: { slot: number; blueprintIndex: number; origin: SpecialistOrigin },
  r: SpecialistRules,
): { native: SpecialistNative; binding: SpecialistBinding } {
  validateSpecialistNative(before);
  const owner = player(raw);
  int(request.slot, owner * 5, owner * 5 + 4, "owner slot");
  int(request.blueprintIndex, 0, 31, "blueprint index");
  if (request.origin.position.length !== 2)
    throw Error("Specialist coordinate extent differs");
  request.origin.position.forEach((v) =>
    int(v, -32768, 32767, "temporary coordinate"),
  );
  int(request.origin.height, -2147483648, 2147483647, "origin height");
  int(request.origin.shade, 0, 255, "origin shade");
  const n = before.slice(),
    handle = binding(raw, request.blueprintIndex, r);
  n[2] = n[5] = 0;
  n[6] = 3;
  pw(n, 15, request.slot);
  n[24] = owner;
  pw(n, 7, request.origin.position[0]);
  pw(n, 9, request.origin.position[1]);
  pd(n, 17, request.origin.height);
  n[23] = request.origin.shade;
  n.fill(0, 11, 15);
  pw(n, 21, 0x280);
  n[25] = n[26] = n[27] = n[29] = 0;
  n[28] = 1;
  pd(n, 39, 0);
  pw(n, 43, 50);
  n.fill(0, 45, 57);
  pw(n, 57, 0);
  pw(n, 59, 512);
  pw(n, 61, 0);
  n[74] = b(n, 74) & 0x3b;
  n[83] = 1;
  n[84] = 0;
  n[85] = 1;
  n.fill(0, 104, 108);
  pw(n, 112, 0);
  n[116] = request.blueprintIndex;
  return { native: n, binding: handle };
}
/**81310 first-free allocation plus4FD30,80830(no associated unit),56E20.
 * Entire pool/player afterimages are returned; no caller input is mutated.
 */
export function createSpecialist(
  before: SpecialistPool,
  raw: readonly number[],
  request: SpecialistCreateRequest,
  r: SpecialistRules,
): SpecialistCreationReceipt {
  validatePool(before);
  const owner = player(raw);
  int(request.blueprintIndex, 0, 31, "blueprint index");
  if (request.origin.position.length !== 2 || request.finalTarget.length !== 2)
    throw Error("Specialist coordinate extent differs");
  request.origin.position.forEach((v) =>
    int(v, -32768, 32767, "temporary coordinate"),
  );
  request.finalTarget.forEach((v) => int(v, -32768, 32767, "final coordinate"));
  int(request.origin.height, -2147483648, 2147483647, "origin height");
  int(request.origin.shade, 0, 255, "origin shade");
  const count = (raw[3] << 24) >> 24;
  int(count, 0, 5, "stored actor count");
  const pool = cloneSpecialistPool(before),
    next = raw.slice(),
    local = pool.records
      .slice(owner * 5, owner * 5 + 5)
      .findIndex((n) => b(n, 6) === 0),
    receipt: SpecialistCreationReceipt = {
      pool,
      player: next,
      created: null,
      origin: structuredClone(request.origin),
      finalTarget: [...request.finalTarget],
      activationPending: false,
    };
  if (local < 0) return receipt;
  if (count >= 5)
    throw Error("Specialist player ID list is full despite free native slot");
  const index = owner * 5 + local,
    at = 0x16 + request.blueprintIndex * 36;
  // Allocation metadata writes precede4FD30; validation below remains staged.
  next[at + 0x20] |= 1;
  next[4 + count] = index;
  next[3] = count + 1;
  const constructor = initializeSpecialistNative(
      pool.records[index],
      next,
      {
        slot: index,
        blueprintIndex: request.blueprintIndex,
        origin: request.origin,
      },
      r,
    ),
    n = constructor.native,
    handle = constructor.binding;
  //80830 no-unit branch places without refreshing origin ground/shade.
  pw(n, 7, request.finalTarget[0]);
  pw(n, 9, request.finalTarget[1]);
  pw(n, 21, 0x0a80);
  pw(n, 112, 0x0400);
  n[25] = 8;
  const initialized = bindSpecialistResources(n, next, r);
  pool.records[index] = initialized.native;
  pool.bindings[index] = handle;
  receipt.created = {
    index,
    binding: handle,
    motion: projectSpecialistMotion(initialized.native, handle),
  };
  receipt.activationPending = true;
  return receipt;
}
/**801C0 metadata order/category quotas, including allocation-failure quota.
 * Blueprint generation and the80830 landing/immediate branch are separate.
 */
export function createMissionSpecialists(
  before: SpecialistPool,
  raw: readonly number[],
  input: {
    mask: number;
    campaign: boolean;
    progress: number;
    origin: SpecialistOrigin;
    target: [number, number];
  },
  r: SpecialistRules,
): {
  pool: SpecialistPool;
  player: number[];
  attempts: {
    blueprintIndex: number;
    category: number;
    index: number | null;
  }[];
  created: number[];
  activationPending: boolean;
} {
  validatePool(before);
  player(raw);
  int(input.mask, 0, 255, "category mask");
  int(input.progress, -128, 127, "campaign progress");
  if (typeof input.campaign !== "boolean" || input.target.length !== 2)
    throw Error("Specialist mission context missing");
  input.target.forEach((v) =>
    int(v, -32768, 32767, "mission target coordinate"),
  );
  let pool = cloneSpecialistPool(before),
    next = raw.slice(),
    attempted = 0;
  const attempts: {
      blueprintIndex: number;
      category: number;
      index: number | null;
    }[] = [],
    created: number[] = [];
  for (let index = 0; index < 32; index++) {
    const at = 0x16 + index * 36,
      category = next[at + 0x16],
      bit = 1 << category;
    if (
      !next[at] ||
      category > 3 ||
      !(input.mask & bit) ||
      attempted & bit ||
      (input.campaign &&
        ((category === 1 && input.progress < 1) ||
          (category === 3 && input.progress < 4)))
    )
      continue;
    attempted |= bit;
    const result = createSpecialist(
      pool,
      next,
      {
        blueprintIndex: index,
        origin: input.origin,
        finalTarget: input.target,
      },
      r,
    );
    pool = result.pool;
    next = result.player;
    attempts.push({
      blueprintIndex: index,
      category,
      index: result.created?.index ?? null,
    });
    if (result.created) created.push(result.created.index);
  }
  pw(next, 9, input.target[0]);
  pw(next, 11, input.target[1]);
  return {
    pool,
    player: next,
    attempts,
    created,
    activationPending: created.length > 0,
  };
}

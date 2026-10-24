/**451F0 selector5 and its complete ordinary common envelope.
 * The caller isolates cross-pool services; retained native/player records are
 * mutated in place. Flags0800 belong to the earlier demolition callback. */
import { advanceAnimation, type AnimationProfile } from "./animation";
import type { BuildingNative } from "./building-native";
import { classifyConstructionSite } from "./construction";
import type { TerrainState } from "./terrain";
/**Full74E80 with discriminator5.507D0 uses100 and intentionally omits
 * this extra predicate. The pad starts at the aligned center plus1124F0. */
export function classifyRecruitmentCenterSite(
  terrain: TerrainState,
  point: [number, number],
  offset: readonly [number, number] | undefined,
  occupied: (cell: number) => boolean,
): ReturnType<typeof classifyConstructionSite> {
  const result = classifyConstructionSite(terrain, point, 2, 100, occupied);
  if (result !== "valid") return result;
  if (
    !offset ||
    offset.length !== 2 ||
    offset.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767)
  )
    throw Error("Actual1124F0 recruitment landing offset required");
  return classifyConstructionSite(
    terrain,
    [
      (((point[0] & 0xff00) + offset[0]) << 16) >> 16,
      (((point[1] & 0xff00) + offset[1]) << 16) >> 16,
    ],
    3,
    100,
    occupied,
  );
}
export interface RecruitmentCenterContext<W> {
  native(world: W, slot: number): BuildingNative;
  player(world: W, owner: number): BuildingNative;
  upkeep: readonly number[];
  profile(world: W, slot: number, action: number): AnimationProfile;
  /**Actual7F480, NOT80830: no specialist56E20 prefix. Null is real capacity. */
  requestLanding7F480?(
    world: W,
    slot: number,
  ): { slot: number; kind: number } | null;
}
export interface RecruitmentCenterReceipt {
  slot: number;
  owner: number;
  queueDraw: boolean;
  landingRequested: boolean;
  landing: { slot: number; kind: number } | null;
  powerLost: boolean;
  warningStarted: boolean;
}
const integer = (v: number, lo: number, hi: number) =>
  Number.isInteger(v) && v >= lo && v <= hi;
const byte = (n: readonly (number | null)[], at: number): number => {
  const v = n[at];
  if (v == null || !integer(v, 0, 255))
    throw Error(`Unknown recruitment-center byte ${at}`);
  return v;
};
const word = (n: readonly (number | null)[], at: number) =>
  ((byte(n, at) | (byte(n, at + 1) << 8)) << 16) >> 16;
const put = (n: BuildingNative, at: number, v: number) => {
  n[at] = v & 255;
  n[at + 1] = (v >> 8) & 255;
};
export function stepStagedRecruitmentCenter<W>(
  world: W,
  slot: number,
  c: RecruitmentCenterContext<W>,
): RecruitmentCenterReceipt {
  const n = c.native(world, slot);
  if (
    !integer(slot, 0, 255) ||
    n.length !== 67 ||
    n.slice(31, 39).some((v) => v !== null) ||
    byte(n, 6) !== 4 ||
    word(n, 15) !== slot ||
    byte(n, 45) !== 5
  )
    throw Error("Actual native67 selector5 recruitment center required");
  const owner = byte(n, 24),
    grade = byte(n, 46),
    p = c.player(world, owner);
  if (
    owner > 3 ||
    Math.floor(slot / 64) !== owner ||
    grade > 2 ||
    p.length !== 1805 ||
    c.upkeep.length !== 14 ||
    !integer(c.upkeep[5], 0, 255)
  )
    throw Error("Actual recruitment-center player/upkeep context required");
  let flags = word(n, 49) & 65535;
  if (flags & 0x800)
    throw Error(
      "Recruitment-center demolition requires the shared common callback",
    );
  const oldAction = byte(n, 25),
    oldPower = flags & 4,
    complete = !!(flags & 1),
    disabled = !!(flags & 0x40),
    out: RecruitmentCenterReceipt = {
      slot,
      owner,
      queueDraw: false,
      landingRequested: false,
      landing: null,
      powerLost: false,
      warningStarted: false,
    };
  if (complete && !disabled) {
    put(n, 61, word(n, 61) - c.upkeep[5] - byte(n, 63));
    if (word(n, 61) < 1) {
      put(n, 61, 0);
      if (!(flags & 0x100)) {
        flags &= ~4;
        put(n, 49, flags);
        out.powerLost = true;
        out.warningStarted = word(p, 0x5ea) === 0;
        if (out.warningStarted) put(p, 0x5ea, 1000);
      }
    }
    //470E1: this request is not conditional on the powered bit.
    if (
      byte(n, 60) === 2 &&
      byte(p, 0x498) === 0 &&
      ((word(p, 0x499) & 65535) | (word(p, 0x49b) << 16)) === 0
    ) {
      n[60] = 0;
      out.landingRequested = true;
      if (!c.requestLanding7F480)
        throw Error("Actual recruitment-center7F480 landing service required");
      out.landing = c.requestLanding7F480(world, slot);
      if (c.native(world, slot) !== n || c.player(world, owner) !== p)
        throw Error(
          "Recruitment-center service replaced a held native/player record",
        );
      if (
        out.landing &&
        (!integer(out.landing.slot, 0, 199) ||
          !integer(out.landing.kind, 0, 255))
      )
        throw Error("Actual7F480 returned effect identity required");
    }
    flags = word(n, 49) & 65535;
    if (flags & 4 && flags & 1 && !(flags & 0x140)) n[28] = 1;
    else n[28] = n[27] = 0;
    if (word(n, 61) > 200) put(n, 61, 200);
    if (byte(n, 63)) n[63] = byte(n, 63) - 1;
  }
  if ((flags & 0x100 || disabled || !complete) && word(n, 61) > 0)
    put(n, 61, word(n, 61) - 1);
  if (
    oldAction !== byte(n, 25) ||
    byte(n, 28) !== 0 ||
    oldPower !== (word(n, 49) & 4) ||
    byte(n, 48)
  )
    n[21] = byte(n, 21) | 4;
  if (byte(n, 48)) n[48] = byte(n, 48) - 1;
  if (!complete && word(n, 43) < 1) return out;
  if (!complete) {
    n[25] = 0;
    n[28] = 0;
    n[27] = byte(n, 47);
  } else if (!disabled) n[25] = grade + 1;
  else {
    n[25] = 4;
    n[28] = 0;
    n[27] = grade;
  }
  const a = advanceAnimation(
    {
      action: byte(n, 25),
      hold: byte(n, 26),
      frame: byte(n, 27),
      direction: (byte(n, 28) << 24) >> 24,
      delay: (byte(n, 29) << 24) >> 24,
      counter: (byte(n, 30) << 24) >> 24,
    },
    c.profile(world, slot, byte(n, 25)),
  );
  n[26] = a.hold;
  n[27] = a.frame;
  n[28] = a.direction & 255;
  n[29] = a.delay & 255;
  n[30] = a.counter & 255;
  out.queueDraw = true;
  return out;
}
/**Standalone atomic entry; full campaign owner/slot passes use staged above. */
export function stepRecruitmentCenter<W>(
  world: W,
  slot: number,
  c: RecruitmentCenterContext<W> & { stageWorld?(world: W): W },
) {
  const staged = c.stageWorld ? c.stageWorld(world) : structuredClone(world);
  return {
    world: staged,
    receipt: stepStagedRecruitmentCenter(staged, slot, c),
  };
}

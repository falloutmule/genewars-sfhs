/**75240 fixed nine-cell landing surface. This changes texture/orientation,
 * not terrain height, reservation ownership, climate or material borders. */
import { worldCell, type TerrainState } from "./terrain";
export interface LandingSiteRules {
  directionIndices: readonly number[];
  directions: readonly (readonly [number, number])[];
  textures: readonly number[];
  orientations: readonly number[];
}
export interface LandingSiteReceipt {
  updated: boolean;
  cells: number[];
}
const byte = (n: readonly (number | null)[], at: number): number => {
  const value = n[at];
  if (value === null || !Number.isInteger(value) || value < 0 || value > 255)
    throw Error("Actual landing-site native byte required");
  return value;
};
const signed = (v: number) => (v << 16) >> 16;
function validate(r: LandingSiteRules) {
  if (
    !r ||
    r.directionIndices.length !== 8 ||
    r.directions.length !== 9 ||
    r.directionIndices.some((v) => !Number.isInteger(v) || v < 0 || v >= 9) ||
    r.directions.some(
      (p) =>
        p.length !== 2 ||
        p.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767),
    ) ||
    r.textures.length !== 9 ||
    r.orientations.length !== 9 ||
    [...r.textures, ...r.orientations].some(
      (v) => !Number.isInteger(v) || v < 0 || v > 255,
    )
  )
    throw Error("Admitted original landing-site tables required");
}
/**The final source ninth direction read updates an unused local after the
 * last cell. Only the eight observable transitions are normalized here. */
export function updateLandingSite(
  terrain: TerrainState,
  building: (number | null)[] | null,
  position: [number, number],
  frame: number,
  argumentB: 0 | 1,
  argumentC: 0 | 1,
  rules: LandingSiteRules,
): LandingSiteReceipt {
  validate(rules);
  if (
    terrain.bytes.length !== 128 * 128 * 14 ||
    position.length !== 2 ||
    position.some((v) => !Number.isInteger(v) || v < -32768 || v > 32767) ||
    !Number.isInteger(frame) ||
    frame < 0 ||
    frame > 0xffffffff ||
    ![0, 1].includes(argumentB) ||
    ![0, 1].includes(argumentC) ||
    (building !== null && building.length !== 67)
  )
    throw Error("Actual landing-site context required");
  const prior =
      building === null ? null : [byte(building, 52), byte(building, 54)],
    mismatch = prior !== null && prior[0] !== Number((frame & 31) < 15),
    updated = building === null || mismatch || !!argumentB || !!argumentC;
  if (!updated) return { updated: false, cells: [] };
  if (building) {
    if (argumentB) building[54] = 1;
    if (argumentC) building[52] = 0;
    else if (mismatch) building[52] = byte(building, 52) ^ 1;
  }
  const shadeOffset = building && byte(building, 52) !== 0 ? 4 : 0,
    cells: number[] = [];
  let p: [number, number] = [
    signed(position[0] & 0xff00),
    signed(position[1] & 0xff00),
  ];
  for (let i = 0; i < 9; i++) {
    const cell = worldCell(...p),
      at = cell * 14;
    //84E10's gameplay image:847D0's legacy viewport cache is presentation
    //only. The modern renderer invalidates the complete terrain revision.
    terrain.bytes[at + 11] |= 12;
    terrain.bytes[at + 4] =
      i === 0
        ? building && byte(building, 54) !== 0
          ? 154
          : 150
        : (rules.textures[i] + shadeOffset) & 255;
    terrain.bytes[at + 5] = rules.orientations[i] | 0x87;
    terrain.bytes[at + 13] = 0;
    cells.push(cell);
    if (i < 8) {
      const delta = rules.directions[rules.directionIndices[i]];
      p = [signed(p[0] + delta[0]), signed(p[1] + delta[1])];
    }
  }
  terrain.revision++;
  return { updated: true, cells };
}

/** Source6EAF0 attachment virtual9C, with Mule's established virtual10=false.
 * Caller owns the full-host transaction and actual spatial/effect services. */
import { groundHeight, worldCell, type TerrainState } from "./terrain";
import { effectTerrainShade } from "./power-motion";
import { ecologyTerrainClass } from "./ecology";
import {
  haulingWord as word,
  haulingDword as dword,
  haulingByte as byte,
  haulingPoint as point,
  haulingPut as put,
  type HaulingNative,
} from "./mule-hauling";
export interface MuleAttachmentContext {
  terrain: TerrainState;
  frame: number;
  /**48790(6), no parent, owner0,param0,delay8; full pool may return false. */
  scrape(request: {
    code: 6;
    position: [number, number];
    height: number;
    angles: [number, number, number];
    owner: 0;
    parameter: 0;
    delay: 8;
  }): void;
  relocate(carried: HaulingNative, oldCell: number, newCell: number): void;
}
const put32 = (n: HaulingNative, p: number, v: number) => {
  put(n, p, v);
  put(n, p + 2, v >> 16);
};
export function attachMuleMaterialPose(
  carried: HaulingNative,
  parent: HaulingNative,
  c: MuleAttachmentContext,
): void {
  if (byte(parent, 6) !== 1 || byte(parent, 122) !== 4)
    throw Error("Attachment requires actual Mule4 parent");
  if (![1, 5].includes(byte(carried, 6)))
    throw Error("Concrete carried creature/effect9C required");
  const old = worldCell(...point(carried));
  carried.splice(7, 4, ...parent.slice(7, 11));
  carried.splice(45, 6, ...parent.slice(45, 51));
  put32(carried, 39, dword(parent, 39));
  put(carried, 7, word(carried, 7) - (word(carried, 45) >> 4));
  put(carried, 9, word(carried, 9) - (word(carried, 47) >> 4));
  put32(carried, 39, (dword(carried, 39) - (word(carried, 49) >> 3)) | 0);
  const at = point(carried),
    ground = groundHeight(c.terrain, ...at);
  put32(carried, 17, ground);
  carried[23] = effectTerrainShade(c.terrain, ...at);
  if (dword(carried, 39) <= ground) {
    put32(carried, 39, ground);
    if (
      ((word(carried, 15) + c.frame) & 3) === 3 &&
      (word(carried, 45) !== 0 || word(carried, 47) !== 0) &&
      ecologyTerrainClass(c.terrain, at) > 1
    )
      c.scrape({
        code: 6,
        position: at,
        height: ground,
        angles: [
          word(parent, 57),
          Math.max(0, word(parent, 59) - 256),
          word(parent, 61) >> 1,
        ],
        owner: 0,
        parameter: 0,
        delay: 8,
      });
  }
  carried.splice(51, 6, ...parent.slice(51, 57));
  put(carried, 65, word(parent, 65));
  const cell = worldCell(...point(carried));
  if (old !== cell && !(byte(carried, 22) & 32)) c.relocate(carried, old, cell);
}

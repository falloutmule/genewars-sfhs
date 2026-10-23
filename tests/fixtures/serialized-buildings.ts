import { campaignFixture } from "./campaign";
import {
  decodeBytes,
  encodeBytes,
  put16,
  put32,
} from "../../src/sim/campaign/bytes";
/** Synthetic active kind4 record, including retained payload/ANB and real links. */
export function serializedBuildingFixture() {
  const pack = campaignFixture(),
    s = pack.missions[0].startup!,
    pool = s.pools[3];
  pack.buildingRules = {
    schemaVersion: 1,
    resources: Array.from({ length: 14 }, (_, selector) => ({
      selector,
      path: "DATA/TEST.ANB",
      assetKey: "TEST",
    })).filter((row) => row.selector !== 9),
    unsupportedSelectors: [9],
    upkeep: Array(14).fill(1),
    processingFrontOffset: [0, 256],
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  pack.economyRules!.capacity.store4 = [400, 800, 1200];
  pack.economyRules!.capacity.store13 = [500, 1000, 1500];
  const slot = 2,
    point: [number, number] = [8575, 8319],
    cell = (point[1] >> 8) * 128 + (point[0] >> 8),
    native = Array(67).fill(0),
    packed = decodeBytes(pool.packedBase64),
    map = decodeBytes(s.terrain.mapCells14);
  put16(native, 0, cell);
  native[6] = 4;
  put16(native, 7, point[0]);
  put16(native, 9, point[1]);
  put16(native, 15, slot);
  put32(native, 17, 1024);
  native[23] = 77;
  native[25] = 3;
  native[26] = 2;
  native[27] = 1;
  native[28] = 1;
  native[29] = 2;
  native[30] = 3;
  put32(native, 39, 0x12345678);
  put16(native, 43, 67);
  native[45] = 4;
  native[46] = native[47] = 2;
  put16(native, 49, 5);
  native[51] = 13;
  put32(native, 54, 69);
  put16(native, 61, 113);
  native[63] = 7;
  packed.splice(slot * 59, 59, ...native.slice(0, 31), ...native.slice(39));
  pool.packedBase64 = encodeBytes(packed);
  pool.activeCount = 1;
  pool.activeRecords = [
    {
      index: slot,
      sourceOffset: pool.sourceOffset + slot * 59,
      type: 4,
      position: point,
      destination: [0, 0],
      sourceId: slot,
      height: 1024,
      flags: 0,
      shade: 77,
      owner: 0,
      animation: 3,
      animationSubframe: 2,
      frame: 1,
      animationState: 1,
      animationDelay: 770,
      previousLink: { index: cell, kind: 0 },
      nextLink: { index: 0, kind: 0 },
      resourceSelector: 4,
      constructionPhase: 2,
    },
  ];
  put16(map, cell * 14 + 6, slot);
  map[cell * 14 + 8] = 4;
  map[cell * 14 + 11] |= 1;
  s.terrain.mapCells14 = encodeBytes(map);
  const player = decodeBytes(s.players[0].recordBase64);
  player[0x4a2] = 1;
  player[0x604] = 1;
  put16(player, 0x60e, 1 << 4);
  put32(player, 0x5e6, 1200);
  s.players[0].recordBase64 = encodeBytes(player);
  return { pack, slot, native };
}

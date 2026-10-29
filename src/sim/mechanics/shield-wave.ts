/** Source4EB80 selectors4/5 and4EA50/4EFE0 shield rings. These retain the
 * separate eight449-byte wave slots, not the shared200-slot effect pool. */
import type { CollapseWorld } from "./collapse";
import { nextRandom } from "./random";
import { groundHeight } from "./terrain";
import { effectTerrainShade } from "./power-motion";
import { wrap16, type MotionTables } from "./motion";
type Native = (number | null)[];
export interface ShieldWaveWorld extends CollapseWorld { shieldWaves: Native[] }
const byte = (n: Native, at: number) => {
  const v = n[at];
  if (!Number.isInteger(v) || v! < 0 || v! > 255)
    throw Error(`Actual shield wave byte ${at} required`);
  return v!;
};
const word = (n: Native, at: number) => wrap16(byte(n, at) | byte(n, at + 1) << 8);
const dword = (n: Native, at: number) => (word(n, at) & 65535) | word(n, at + 2) << 16;
const put = (n: Native, at: number, value: number) => { n[at] = value & 255; n[at + 1] = value >> 8 & 255; };
const put32 = (n: Native, at: number, value: number) => { put(n, at, value); put(n, at + 2, value >> 16); };
function validate(w: ShieldWaveWorld) {
  if (w.shieldWaves.length !== 8 || w.shieldWaves.some(n => n.length !== 449) ||
      w.collapse.records.length !== 32 || word(w.missionPrefix, 0x3556) !== w.collapse.count)
    throw Error("Actual shield wave/pool/count bindings required");
  for (const n of w.shieldWaves) byte(n, 448);
}
/** Writes all16 numeric vertices and visibility flags, retaining other bytes. */
export function sampleShieldRing(w: ShieldWaveWorld, n: Native, table: Native,
  vertices: number, flags: number, phase: number, t: MotionTables) {
  if (t.sine.length !== 2048 || t.cosine.length !== 2048)
    throw Error("Actual shield ring trigonometric tables required");
  phase &= 255;
  const radius = word(n, 41),
    horizontal = Math.floor(t.sine[phase * 4] * radius / 65536),
    height = (dword(n, 17) - radius * 8 + ((radius * 16 * phase) >> 8)) | 0;
  let visible = false;
  for (let i = 0; i < 16; i++) {
    const x = word(n, 7) + Math.floor(t.cosine[i * 128] * horizontal / 65536),
      y = word(n, 9) + Math.floor(t.sine[i * 128] * horizontal / 65536);
    put32(table, vertices + i * 12, x);
    put32(table, vertices + i * 12 + 4, y);
    put32(table, vertices + i * 12 + 8, height);
    const above = groundHeight(w.terrain, wrap16(x), wrap16(y)) <= height;
    table[flags + i] = above ? 1 : 0;
    visible ||= above;
  }
  return visible;
}
export function createShieldWave(w: ShieldWaveWorld, code: 4 | 5, owner: number,
  position: [number, number], grade: number, tables: MotionTables,
  effect: (wave: number, segment: number, position: [number, number], height: number) => void): number | null {
  validate(w);
  if (![4, 5].includes(code) || !Number.isInteger(owner) || owner < 0 || owner > 4 ||
      !Number.isInteger(grade) || grade < 0 || grade > 2 ||
      position.some(v => !Number.isInteger(v) || v < -32768 || v > 32767))
    throw Error("Actual shield wave request required");
  if (w.collapse.count >= 32) return null;
  const slot = w.collapse.records.findIndex(n => n[6] === 0);
  if (slot < 0) throw Error("Shield wave family6 count/free slot differs");
  const n = w.collapse.records[slot].slice();
  n[2] = n[5] = 0; n[6] = 6;
  put(n, 7, position[0]); put(n, 9, position[1]);
  n.fill(0, 11, 15); put(n, 15, slot);
  put32(n, 17, groundHeight(w.terrain, ...position)); put(n, 21, 0);
  n[23] = effectTerrainShade(w.terrain, ...position); n[24] = owner;
  n[25] = n[26] = n[27] = n[29] = 0; n[28] = 1;
  n[39] = code; n[40] = 1; put(n, 41, 0);
  w.collapse.records[slot] = n; w.collapse.count++;
  const wave = w.shieldWaves.findIndex(n => byte(n, 448) === 0);
  put(n, 43, wave);
  if (wave < 0) {
    n[6] = 0; w.collapse.count--; put(w.missionPrefix, 0x3556, w.collapse.count);
    return null;
  }
  w.shieldWaves[wave][448] = 1;
  put(n, 41, grade * 256 + 1536);
  put(n, 13, nextRandom(w.rng) % 10 + 2);
  if (code === 5) { put(n, 11, 256); put(n, 13, -word(n, 13)); }
  else {
    put(n, 11, 16);
    const temporary = Array(208).fill(null);
    while (word(n, 11) < 256) {
      const visible = sampleShieldRing(w, n, temporary, 0, 192, byte(n, 11), tables);
      put(n, 11, word(n, 11) + 16);
      if (visible) break;
    }
  }
  put(w.missionPrefix, 0x3556, w.collapse.count);
  for (let segment = 0; segment < 16; segment++) effect(wave, segment, position, dword(n, 17));
  return slot;
}
export function stepShieldWave(w: ShieldWaveWorld, slot: number, tables: MotionTables): boolean {
  validate(w);
  const n = w.collapse.records[slot];
  if (!n || n[6] !== 6 || ![4, 5].includes(byte(n, 39)) || word(n, 15) !== slot)
    throw Error("Actual active shield wave identity required");
  const wave = word(n, 43), table = w.shieldWaves[wave];
  if (!table || byte(table, 448) !== 1) throw Error("Actual allocated shield ring required");
  let retire: boolean;
  if (byte(n, 39) === 4) {
    retire = word(n, 11) >= 256;
    if (!retire) {
      sampleShieldRing(w, n, table, 0, 384, byte(n, 11), tables);
      sampleShieldRing(w, n, table, 192, 400, (byte(n, 11) - 16) & 255, tables);
      put(n, 11, word(n, 11) + word(n, 13));
    }
  } else {
    retire = word(n, 11) <= word(n, 13);
    if (!retire) {
      retire = !sampleShieldRing(w, n, table, 192, 400, (byte(n, 11) - 16) & 255, tables);
      if (!retire) {
        sampleShieldRing(w, n, table, 0, 384, byte(n, 11), tables);
        put(n, 11, word(n, 11) + word(n, 13));
      }
    }
  }
  if (retire) { table[448] = 0; n[6] = 0; w.collapse.count--; put(w.missionPrefix, 0x3556, w.collapse.count); }
  return retire;
}

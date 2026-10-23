export const decodeBytes = (value: string): number[] =>
  Array.from(atob(value), (c) => c.charCodeAt(0));
export const encodeBytes = (value: readonly number[]): string => {
  let s = "";
  for (let at = 0; at < value.length; at += 8192)
    s += String.fromCharCode(...value.slice(at, at + 8192));
  return btoa(s);
};
export const u16 = (b: readonly number[], o: number) => b[o] | (b[o + 1] << 8);
export const i16 = (b: readonly number[], o: number) => (u16(b, o) << 16) >> 16;
export const u32 = (b: readonly number[], o: number) =>
  (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
export function put16(b: number[], o: number, v: number) {
  b[o] = v & 255;
  b[o + 1] = (v >> 8) & 255;
}
export function put32(b: number[], o: number, v: number) {
  for (let i = 0; i < 4; i++) b[o + i] = (v >>> (i * 8)) & 255;
}

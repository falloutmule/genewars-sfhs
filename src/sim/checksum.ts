/** Modified Battle Drones checksum.ts FNV-1a pattern, Apache-2.0.
 * Covers every authoritative field through canonical serialization, replacing
 * the donor's drone-specific partial field list. Not a security/content hash.
 */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value !== null && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function checksum(value: unknown): string {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(canonical(value)))
    h = Math.imul(h ^ byte, 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

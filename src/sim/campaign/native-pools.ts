import { SOURCE_POOL_LAYOUTS } from "../../content/startup";
import type { SourcePoolRegistry, SourceFamily } from "./source-pools";
import { decodeBytes } from "./bytes";
/** Inactive numeric priors survive loader/factory reuse. Runtime process
 * pointers have typed bindings elsewhere and remain null in this image. */
export function initializeNativePool(
  source: SourcePoolRegistry,
  family: SourceFamily,
): (number | null)[][] {
  const pool = source.source.pools.find((p) => p.family === family);
  const [, , capacity, packedStride, nativeStride] =
    SOURCE_POOL_LAYOUTS[family];
  if (nativeStride !== packedStride + 8)
    throw new Error(
      "This source family requires its dedicated native tail loader",
    );
  if (!pool) throw new Error("Missing source pool");
  const raw = decodeBytes(pool.packedBase64);
  if (raw.length !== capacity * packedStride)
    throw new Error("Invalid native pool source extent");
  return Array.from({ length: capacity }, (_, slot) => {
    const initialized = source.entities.find(
      (e) => e.family === family && e.index === slot,
    );
    if (initialized) return initialized.nativeBytes.slice();
    return Array.from({ length: nativeStride }, (_, at) =>
      at >= 31 && at < 39
        ? null
        : raw[slot * packedStride + (at < 31 ? at : at - 8)],
    );
  });
}

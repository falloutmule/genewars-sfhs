/** Source kind7/family6: retained32x97 numeric records, not the shared EFF pool. */
export type ProcessorCollectorNative = (number | null)[];
export interface ProcessorCollectorPool {
  records: ProcessorCollectorNative[];
  count: number;
}
export const PROCESSOR_COLLECTOR_COUNT_OFFSET = 0x3558;
export function makeProcessorCollectorPool(
  records: readonly (readonly (number | null)[])[],
  count: number,
): ProcessorCollectorPool {
  if (
    records.length !== 32 ||
    !Number.isInteger(count) ||
    count < 0 ||
    count > 32 ||
    records.some(
      (n, index) =>
        n.length !== 97 ||
        n.some((v, at) =>
          at >= 31 && at < 39
            ? v !== null
            : !Number.isInteger(v) || v! < 0 || v! > 255,
        ) ||
        (n[6] !== 0 && (n[6] !== 7 || (n[15]! | (n[16]! << 8)) !== index)),
    ) ||
    records.filter((n) => n[6] !== 0).length !== count
  )
    throw Error("Actual32x97 processor collector priors/count required");
  return { records: records.map((n) => n.slice()), count };
}

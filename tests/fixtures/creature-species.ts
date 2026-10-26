import type { EcologyRules } from "../../src/sim/mechanics/ecology";

/** Synthetic coefficients and a complete ordered two-component enum. */
export function speciesFixture() {
  const components: [number, number][] = Array.from({ length: 5 }, (_, i) => [
    i,
    i,
  ]);
  for (let a = 0; a < 5; a++)
    for (let b = a + 1; b < 5; b++) components.push([a, b]);
  for (let a = 1; a < 5; a++)
    for (let b = 0; b < a; b++) components.push([a, b]);
  const rows = Array.from({ length: 25 }, (_, i) => {
    const r = Array(45).fill(0),
      put = (at: number, value: number) => {
        for (let j = 0; j < 4; j++) r[at + j] = (value >>> (j * 8)) & 255;
      };
    put(0, 384);
    r[4] = 10;
    r[5] = 8;
    put(6, 400 + i * 10);
    put(10, 10000 + i * 100);
    put(14, 80);
    put(18, 160);
    put(22, 10 + i);
    r[26] = 2 + (i % 3);
    r[27] = 30 + i;
    r[29] = r[30] = r[31] = 100;
    r[36] = 90;
    return r;
  });
  const rules: EcologyRules = {
    schemaVersion: 1,
    plants: [],
    spreadDirections: [],
    plantResources: [],
    speciesTraits: rows,
    attackChannels: [10, 11, 12, 13, 14],
    mule: {
      selector: 4,
      baseSpeed: 704,
      lifetimeScale: 19000,
      reserveScale: 160,
      healthScale: 80,
      healthRecoveryPeriod: 20,
      warmThreshold: 25,
    },
  };
  return { components, rules };
}

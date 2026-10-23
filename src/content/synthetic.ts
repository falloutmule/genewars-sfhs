import type { Pack } from "./types";
// Deliberately asset-free open fixture. Never presented as original GeneWars data.
export function syntheticPack(): Pack {
  return {
    schemaVersion: 1,
    importerVersion: "0.1.0",
    kind: "synthetic",
    source: { variant: "Synthetic platform fixture", sha256: null },
    manifest: [],
    assets: {},
    sounds: {},
    texts: [],
    unknown: [],
    missions: [
      {
        id: 1,
        name: "Synthetic platform fixture",
        width: 128,
        height: 128,
        cells: Array.from({ length: 16384 }, (_, i) => [
          0,
          ((i % 128) + Math.floor(i / 128)) % 2,
          0,
        ]),
        target: [81 * 256, 53 * 256],
        sourceSeed: 1,
        runtimeStatus: "synthetic-test-only",
        briefing: "Open test fixture. No original game content is included.",
        unknown: [],
      },
    ],
  };
}

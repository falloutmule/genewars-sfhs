import { describe, it, expect } from "vitest";
import { Stage } from "../src/render/stage";
import type { Asset } from "../src/content/types";

describe("independent packed4 component draws", () => {
  it("keeps overlapping flipped components and their distinct parity origins separate", () => {
    // No WebGL renderer is needed to exercise raw component composition.
    const stage = Object.create(Stage.prototype) as {
      packed4Streams: Map<string, unknown>;
      rawPacked4Frame(
        art: string,
        asset: Asset,
        frame: number,
        component: number,
      ): { indices: Uint8Array; componentLeft: number };
    };
    stage.packed4Streams = new Map();
    const asset = {
      kind: "animation",
      image: "data:image/png;base64,",
      sprites: [
        [0, 0, 2, 1],
        [2, 0, 2, 1],
      ],
      frames: [
        {
          components: [
            [0, -2, 0, 0, 0],
            [1, 1, 0, 1, 0],
          ],
          width: 4,
          height: 1,
        },
      ],
      packed4: {
        indices: Buffer.from([1, 2, 4, 5]).toString("base64"),
        opacity: Buffer.from([1, 1, 1, 1]).toString("base64"),
      },
    } as unknown as Asset;
    const first = stage.rawPacked4Frame("synthetic", asset, 0, 0),
      second = stage.rawPacked4Frame("synthetic", asset, 0, 1),
      row = 160 * 256;
    expect(first.componentLeft).toBe(126);
    expect(second.componentLeft).toBe(127);
    expect(Array.from(first.indices.slice(row + 126, row + 130))).toEqual([
      1, 2, 0, 0,
    ]);
    expect(Array.from(second.indices.slice(row + 126, row + 130))).toEqual([
      0, 5, 4, 0,
    ]);
    expect(() => stage.rawPacked4Frame("synthetic", asset, 0, 2)).toThrow(
      /component layout/,
    );
  });
});

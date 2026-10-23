import { describe, expect, it } from "vitest";
import {
  OPPONENT_AI_RECORD_BYTES,
  loadOpponentStartupAI,
  prepareOpponentStartup,
  requiredOpponentStrategyPlayers,
  assertOpponentStrategyImplemented,
  type OpponentStartupInput,
} from "../src/sim/mechanics/opponent-startup";
import {
  generateBlueprints,
  type BlueprintRules,
} from "../src/sim/mechanics/blueprints";
import { nextRandom } from "../src/sim/mechanics/random";
const put = (n: number[], p: number, v: number) => {
  n[p] = v & 255;
  n[p + 1] = (v >> 8) & 255;
};
const word = (n: number[], p: number) => ((n[p] | (n[p + 1] << 8)) << 16) >> 16;
function rawAI() {
  const n = Array(1726 * 4).fill(0);
  for (let i = 0; i < 4; i++) {
    put(n, i * 1726, 1726);
    n[i * 1726 + 4] = i;
    n[i * 1726 + 0x6b0] = 255;
  }
  return n;
}
const rules: BlueprintRules = {
  skillBase: 25,
  skillRange: 10,
  skillDifficultyIncrement: 10,
  healthDifficultyIncrement: 5,
  styles: [
    { healthBase: 15, healthRange: 25, healthLimit: 70, skillLimit: 100 },
    { healthBase: 40, healthRange: 10, healthLimit: 100, skillLimit: 75 },
    { healthBase: 10, healthRange: 15, healthLimit: 65, skillLimit: 75 },
    { healthBase: 30, healthRange: 20, healthLimit: 90, skillLimit: 75 },
  ],
};
const names = Array.from(
  { length: 128 },
  (_, i) => `name${i.toString().padStart(3, "0")}`,
);
function fixture(delta = -1, progress = 2) {
  const full = rawAI();
  full[1726 + 0x646] = delta & 255;
  const ai = loadOpponentStartupAI(full.slice(4));
  const raw = Array.from({ length: 1805 }, (_, i) => (i * 37 + 11) & 255);
  raw[1] = 1;
  raw[2] = 1;
  raw[3] = 0;
  raw[0x6e7] = 0;
  raw[0x6e3] = 89;
  const c: OpponentStartupInput = {
    player: 1,
    selectedPlayer: 0,
    selectedProgress: progress,
    activePlayerCount: 2,
    target: [18176, 14592],
    flags: 0x3e,
    runtimeMode: 0,
    aiRecord: ai.records[1],
    names,
    blueprintRules: rules,
    rng: { seed: 53809, draws: 50582, ring: null },
    blueprintScratch: { byte18: null, byte1b: null },
  };
  return { raw, c, ai };
}
describe("source71B70/7D090 campaign opponent startup", () => {
  it("reconstructs the single omitted sizeword and all four exact1726-byte records", () => {
    const full = rawAI();
    for (let i = 0; i < 4; i++) full[i * 1726 + 0x646] = -i & 255;
    const payload = full.slice(4),
      loaded = loadOpponentStartupAI(payload);
    expect(loaded.records.map((r) => r.raw).flat()).toEqual(full);
    expect(loaded.records.map((r) => [r.player, r.levelAdjustment])).toEqual([
      [0, 0],
      [1, -1],
      [2, -2],
      [3, -3],
    ]);
    loaded.records[1].raw[5] = 99;
    expect(payload[1726 + 1]).toBe(0);
    expect(loaded.strategicAI).toBe("unimplemented");
  });
  it("rejects incorrect extension stride, later record headers, duplicate owner and nonbytes", () => {
    for (const change of [
      (n: number[]) => n.pop(),
      (n: number[]) => {
        n[1726 - 4] = 0;
      },
      (n: number[]) => {
        n[1726] = 2;
      },
      (n: number[]) => {
        n[19] = 256;
      },
    ]) {
      const n = rawAI().slice(4);
      change(n);
      expect(() => loadOpponentStartupAI(n)).toThrow();
    }
    expect(OPPONENT_AI_RECORD_BYTES).toBe(1726);
  });
  it("generates20 blueprints/64 campaign draws and no specialists or landing", () => {
    const f = fixture(),
      before = structuredClone(f),
      q = prepareOpponentStartup(f.raw, f.c);
    expect([
      q.player,
      q.funds,
      q.progress,
      q.levelAdjustment,
      q.raw[3],
      q.raw[0x15],
      q.landingRequired,
      q.strategicAI,
    ]).toEqual([1, 2000, 1, -1, 0, 20, false, "unimplemented"]);
    expect(q.specialistsCreated).toEqual([]);
    expect(q.blueprints).toHaveLength(20);
    expect(q.rng).toEqual({ seed: 39729, draws: 50646, ring: null });
    expect(f).toEqual(before);
    expect(q.blueprints.map((b) => b.category)).toEqual(
      Array.from({ length: 20 }, (_, i) => Math.floor(i / 5)),
    );
    expect(q.blueprints.every((b) => b.runtimeFlags === 0)).toBe(true);
  });
  it("preserves all player bytes outside exact initialization/generated ranges and original unused payload", () => {
    const f = fixture(),
      q = prepareOpponentStartup(f.raw, f.c);
    const changed = new Set([
      1, 9, 10, 11, 12, 0x15, 0x4a3, 0x4a4, 0x4a5, 0x4a6, 0x6e3, 0x6e7,
    ]);
    for (let i = 0; i < 32; i++) changed.add(0x16 + i * 36);
    for (let i = 0; i < 20; i++)
      for (let j = 0; j < 36; j++)
        if (j !== 0x18 && j !== 0x1b) changed.add(0x16 + i * 36 + j);
    for (let i = 0; i < 1805; i++)
      if (!changed.has(i))
        expect(q.raw[i], `byte${i.toString(16)}`).toBe(f.raw[i]);
    expect([
      word(q.raw, 9),
      word(q.raw, 11),
      q.raw[0x6e3],
      q.raw.slice(0x4a3, 0x4a7),
    ]).toEqual([18176, 14592, 0, [0xd0, 7, 0, 0]]);
    for (let i = 20; i < 32; i++) {
      const at = 0x16 + i * 36;
      expect(q.raw[at]).toBe(0);
      expect(q.raw.slice(at + 1, at + 36)).toEqual(
        f.raw.slice(at + 1, at + 36),
      );
    }
  });
  it("keeps unknown reusable scratch explicit instead of using source prior as generated truth", () => {
    const f = fixture(),
      q = prepareOpponentStartup(f.raw, f.c);
    expect(q.unresolvedPlayerOffsets).toHaveLength(40);
    for (let i = 0; i < 20; i++)
      for (const offset of [0x18, 0x1b]) {
        const at = 0x16 + i * 36 + offset;
        expect(q.unresolvedPlayerOffsets).toContain(at);
        expect(q.raw[at]).toBe(f.raw[at]);
      }
    expect(
      q.blueprints.every(
        (b) => b.unresolved.byte18 === null && b.unresolved.byte1b === null,
      ),
    ).toBe(true);
    f.c.blueprintScratch = { byte18: 123, byte1b: 219 };
    const known = prepareOpponentStartup(f.raw, f.c);
    expect(known.unresolvedPlayerOffsets).toEqual([]);
    for (let i = 0; i < 20; i++) {
      expect(known.raw[0x16 + i * 36 + 0x18]).toBe(123);
      expect(known.raw[0x16 + i * 36 + 0x1b]).toBe(219);
    }
  });
  it("writes all source-generated record fields including terminator, zero activation dword and tail", () => {
    const f = fixture(),
      q = prepareOpponentStartup(f.raw, f.c);
    for (const b of q.blueprints) {
      const at = 0x16 + b.index * 36;
      expect(q.raw.slice(at, at + b.name.length)).toEqual(
        Array.from(b.name, (c) => c.charCodeAt(0)),
      );
      expect(
        q.raw.slice(at + b.name.length, at + 21).every((v) => v === 0),
      ).toBe(true);
      expect(q.raw.slice(at + 0x15, at + 0x18)).toEqual([
        b.style,
        b.category,
        b.skill,
      ]);
      expect(q.raw.slice(at + 0x19, at + 0x1b)).toEqual([
        b.maxHealth,
        b.health,
      ]);
      expect(q.raw.slice(at + 0x1c, at + 0x24)).toEqual(Array(8).fill(0));
    }
  });
  it.each([
    [-128, 0, 0],
    [-1, 0, 0],
    [-1, 24, 23],
    [0, 24, 24],
    [1, 24, 24],
    [127, 0, 24],
  ] as const)(
    "uses signed AI delta%i with selected progress%i",
    (delta, progress, expected) => {
      const f = fixture(delta, progress);
      expect(prepareOpponentStartup(f.raw, f.c).progress).toBe(expected);
    },
  );
  it("regenerates opponents unconditionally even with prior metadata and nonzero progress", () => {
    const f = fixture();
    f.raw[0x15] = 32;
    f.raw[0x6e7] = 17;
    const q = prepareOpponentStartup(f.raw, f.c),
      reference = generateBlueprints(names, rules, f.c.rng, true);
    expect(q.rng).toEqual(reference.rng);
    expect(q.blueprints.map((b) => b.name)).toEqual(
      reference.blueprints.map((b) => b.name),
    );
    expect(q.progress).toBe(1);
  });
  it("preserves caller RNG order and ring wrapping, including earlier human draws", () => {
    const f = fixture();
    f.c.rng.ring = 31;
    nextRandom(f.c.rng);
    const before = { ...f.c.rng },
      q = prepareOpponentStartup(f.raw, f.c),
      expected = { ...before };
    for (let i = 0; i < 64; i++) nextRandom(expected);
    expect(q.rng).toEqual(expected);
    expect(f.c.rng).toEqual(before);
  });
  it("rejects unsupported existing roster and inconsistent source owner/level without mutation", () => {
    for (const corrupt of [
      (f: ReturnType<typeof fixture>) => {
        f.raw[3] = 1;
      },
      (f: ReturnType<typeof fixture>) => {
        f.c.aiRecord.levelAdjustment = 0;
      },
      (f: ReturnType<typeof fixture>) => {
        f.raw[1] = 2;
      },
      (f: ReturnType<typeof fixture>) => {
        f.raw[2] = 0;
      },
      (f: ReturnType<typeof fixture>) => {
        f.c.runtimeMode = 1;
      },
      (f: ReturnType<typeof fixture>) => {
        f.c.flags &= ~0x20;
      },
    ]) {
      const f = fixture();
      corrupt(f);
      const before = structuredClone(f);
      expect(() => prepareOpponentStartup(f.raw, f.c)).toThrow();
      expect(f).toEqual(before);
    }
  });
  it("rejects invalid late generation inputs and keeps all input images/RNG unchanged", () => {
    const f = fixture();
    f.c.names = [...names.slice(0, 127), names[0]];
    const before = structuredClone(f);
    expect(() => prepareOpponentStartup(f.raw, f.c)).toThrow(/name table/);
    expect(f).toEqual(before);
  });
  it("is serializable and repeats exactly after restoring all native input/RNG records", () => {
    const f = fixture(),
      saved = JSON.parse(JSON.stringify(f)),
      a = prepareOpponentStartup(f.raw, f.c),
      b = prepareOpponentStartup(saved.raw, saved.c);
    expect(b).toEqual(a);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
  it("selects only the exact70B00 flags/mode/active/nonzero-mode players in ascending order", () => {
    const players = Array.from({ length: 4 }, (_, i) => {
      const p = Array(1805).fill(0);
      p[1] = i;
      p[2] = i % 2;
      return p;
    });
    const c = { flags: 0x3e, runtimeMode: 0, activePlayerCount: 4 };
    expect(requiredOpponentStrategyPlayers(players, c)).toEqual([1, 3]);
    expect(
      requiredOpponentStrategyPlayers(players, { ...c, activePlayerCount: 2 }),
    ).toEqual([1]);
    expect(
      requiredOpponentStrategyPlayers(players, { ...c, flags: 0x3a }),
    ).toEqual([]);
    expect(
      requiredOpponentStrategyPlayers(players, { ...c, runtimeMode: 2 }),
    ).toEqual([]);
    const before = structuredClone(players);
    expect(() => assertOpponentStrategyImplemented(players, c)).toThrow(
      /37870.*1, 3/,
    );
    expect(players).toEqual(before);
    expect(() =>
      assertOpponentStrategyImplemented(players, { ...c, runtimeMode: 2 }),
    ).not.toThrow();
  });
});

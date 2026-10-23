import { describe, expect, it } from "vitest";
import {
  captureGenepodInput,
  createGenepodMule,
  initializeCompletedGenepod,
  readyGenepodPanel,
  requestGenepodMule,
  stepGenepod,
  type GenepodContext,
  type GenepodHumanInput,
  type GenepodNative,
  type GenepodPools,
  type GenepodResult,
  type GenepodState,
} from "../src/sim/mechanics/genepod";
import {
  createNativeBuilding,
  progressNativeBuilding,
  stepIncompleteNativeBuilding,
} from "../src/sim/mechanics/building-native";

const put = (n: GenepodNative, at: number, value: number) => {
  n[at] = value & 255;
  n[at + 1] = (value >> 8) & 255;
};
const put32 = (n: GenepodNative, at: number, value: number) => {
  put(n, at, value);
  put(n, at + 2, value >> 16);
};
const word = (n: GenepodNative, at: number) =>
  ((n[at]! | (n[at + 1]! << 8)) << 16) >> 16;
const dword = (n: GenepodNative, at: number) =>
  (word(n, at) & 65535) | (word(n, at + 2) << 16);
function value<T>(result: GenepodResult<T>): T {
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
function native(size: number, fill = 0) {
  const n: GenepodNative = Array(size).fill(fill);
  n.fill(null, 31, 39);
  n[6] = 0;
  return n;
}
function players() {
  return Array.from({ length: 4 }, (_, owner) => {
    const p = Array(1805).fill(0);
    p[1] = p[0x4a1] = owner;
    put32(p, 0x4a3, 200);
    put32(p, 0x5e6, 600);
    put32(p, 0x62a, 50 << 11);
    p[0x6e0] = 1;
    p[0x6ae] = 4;
    return p;
  });
}
function state(): GenepodState {
  const b = value(
    initializeCompletedGenepod(native(67), {
      slot: 0,
      owner: 0,
      position: [4096, 8192],
      ground: 128,
      shade: 16,
    }),
  );
  b[49] = 5;
  return {
    schemaVersion: 1,
    building: b,
    players: players(),
    rng: { seed: 1234, draws: 9, ring: null },
  };
}
function pools(): GenepodPools {
  return {
    creatureCount: 0,
    creatures: Array.from({ length: 300 }, () => native(124)),
    effectCount: 0,
    effects: Array.from({ length: 200 }, () => native(81)),
  };
}
function context(frame = 0): GenepodContext {
  const bytes = Array(128 * 128 * 14).fill(0);
  for (let cell = 0; cell < 128 * 128; cell++) {
    put(bytes, cell * 14, 100);
    put(bytes, cell * 14 + 2, 64);
    bytes[cell * 14 + 12] = 128;
  }
  return {
    evidence: "synthetic independent profile",
    frame,
    terrain: { bytes, revision: 0 },
    runningAnimation: { holds: [1, 2, 1, 3], flags: 0, first: 0, last: 3 },
    tables: {
      atan: Array(257).fill(0),
      sine: Array(2048).fill(0),
      cosine: Array(2048).fill(65536),
    },
    pools: pools(),
  };
}
const input = (patch: Partial<GenepodHumanInput> = {}): GenepodHumanInput => ({
  selectedPlayer: 0,
  panelState: 3,
  speciesListIndex: 0,
  eventFlags: 8,
  capturedHit: true,
  selectedPanelRefreshEligible: true,
  ...patch,
});
function work(s = state(), remaining = 2) {
  put32(s.building, 54, remaining);
  put(s.building, 52, 75);
  s.building[51] = 4;
  s.building[58] = 0;
  return s;
}

describe("native building allocation and completion retain real priors", () => {
  it("preserves counter30/timer48/drain63 and unknown gaps for all supported selectors", () => {
    for (const selector of [0, 1, 3, 6, 11] as const) {
      const prior = native(67, 165),
        before = prior.slice();
      const made = value(
        createNativeBuilding(prior, {
          slot: 129,
          owner: 2,
          selector,
          position: [4096, 8192],
          ground: 123,
          shade: 17,
        }),
      );
      expect(prior).toEqual(before);
      expect(made.slice(31, 39)).toEqual(Array(8).fill(null));
      expect([made[30], made[48], made[63]]).toEqual([165, 165, 165]);
      expect(word(made, 49)).toBe(0);
      expect(word(made, 43)).toBe(0);
      expect(word(made, 61)).toBe(-23131);
      const staged = value(
        progressNativeBuilding(made, {
          increment: 8,
          maximumHealth: 9,
          loading: false,
        }),
      );
      expect(staged.completed).toBe(false);
      expect(staged.completedPlayerCountOffset).toBeNull();
      const completed = value(
        progressNativeBuilding(staged.native, {
          increment: 2,
          maximumHealth: 9,
          loading: false,
        }),
      );
      expect(word(completed.native, 43)).toBe(9);
      expect(word(completed.native, 49)).toBe(1);
      expect(word(completed.native, 61)).toBe(200);
      expect([
        completed.native[30],
        completed.native[48],
        completed.native[63],
      ]).toEqual([165, 165, 165]);
      expect(completed.completedPlayerCountOffset).toBe(0x600 + selector);
      expect(completed.acquiredOwnershipBit).toBe(1 << selector);
      expect(completed.completionAudioCue).toBe(selector === 6 ? null : 0x4d);
      expect(completed.clearCreatureTargets && completed.refreshCapacity).toBe(
        true,
      );
    }
  });

  it("rejects occupied/incorrect partition/progress states instead of creating replacement bytes", () => {
    const prior = native(67);
    prior[6] = 4;
    expect(
      createNativeBuilding(prior, {
        slot: 0,
        owner: 0,
        selector: 0,
        position: [0, 0],
        ground: 0,
        shade: 0,
      }).ok,
    ).toBe(false);
    prior[6] = 0;
    expect(
      createNativeBuilding(prior, {
        slot: 64,
        owner: 0,
        selector: 0,
        position: [0, 0],
        ground: 0,
        shade: 0,
      }).ok,
    ).toBe(false);
    const b = state().building;
    expect(
      progressNativeBuilding(b, {
        increment: 1,
        maximumHealth: 280,
        loading: false,
      }).ok,
    ).toBe(false);
  });

  it("steps the incomplete timer/dirty/animation tail using target grade47 rather than health", () => {
    const made = value(
      createNativeBuilding(native(67), {
        slot: 0,
        owner: 0,
        selector: 11,
        position: [0, 0],
        ground: 0,
        shade: 0,
      }),
    );
    put(made, 43, 137);
    put(made, 61, 3);
    made[47] = 1;
    made[48] = 2;
    made[30] = 127;
    made[29] = 0;
    made[28] = 1;
    const stepped = value(
      stepIncompleteNativeBuilding(made, {
        holds: [2, 5, 7],
        flags: 0,
        first: 0,
        last: 2,
      }),
    );
    expect(word(stepped.native, 61)).toBe(2);
    expect(stepped.native[48]).toBe(1);
    expect(stepped.native[21]! & 4).toBe(4);
    expect(stepped.native[27]).toBe(1);
    expect(stepped.native[26]).toBe(5);
    expect(stepped.native[30]).toBe(0);
    expect(stepped.native[28]).toBe(0);
    expect(stepped).toMatchObject({
      queueRequested: true,
      stopAudio23: false,
      stopAudio2f: true,
    });
    put(made, 43, 0);
    put(made, 61, -1);
    const hidden = value(
      stepIncompleteNativeBuilding(made, {
        holds: [],
        flags: 0,
        first: 0,
        last: -1,
      }),
    );
    expect(hidden.queueRequested).toBe(false);
    expect(word(hidden.native, 61)).toBe(-1);
    expect(hidden.native[30]).toBe(127);
  });
});

describe("ordinary human Genepod production commands", () => {
  it("captures a genuine release, starts exact75 work and refunds paid work on cancellation", () => {
    const s = state(),
      down = value(
        captureGenepodInput(
          { captured: false, inside: false, draw: 0, event: 0 },
          1,
          true,
        ),
      );
    const pressed = value(
      requestGenepodMule(s, input({ eventFlags: down.state.event })),
    );
    expect(pressed.disposition).toBe("ignored");
    expect(pressed.panelState).toBe(2);
    expect(pressed.state).toEqual(s);
    const up = value(captureGenepodInput(down.state, 2, true));
    const started = value(
      requestGenepodMule(
        s,
        input({ panelState: pressed.panelState, eventFlags: up.state.event }),
      ),
    );
    expect(started.disposition).toBe("started");
    expect(started.audioCue).toBe(0x2c);
    expect(started.panelRefreshRequested).toBe(true);
    expect(dword(started.state.building, 54)).toBe(75);
    expect(word(started.state.building, 52)).toBe(75);
    expect(started.state.players).toEqual(s.players);
    expect(started.state.rng).toEqual(s.rng);
    let working = started.state;
    for (let frame = 0; frame < 3; frame++)
      working = value(stepGenepod(working, context(frame))).state;
    const cancelled = value(
      requestGenepodMule(working, input({ panelState: 1 })),
    );
    expect(cancelled.disposition).toBe("cancelled");
    expect(dword(cancelled.state.building, 54)).toBe(0);
    expect(dword(cancelled.state.players[0], 0x4a3)).toBe(197);
    expect(dword(cancelled.state.players[0], 0x4a7)).toBe(3);
  });

  it("ignores cancelled captures and implements actual ready/ownership/flags/research/funds/list gates", () => {
    const s = state(),
      down = value(
        captureGenepodInput(
          { captured: false, inside: false, draw: 0, event: 0 },
          1,
          true,
        ),
      );
    const up = value(captureGenepodInput(down.state, 2, false));
    expect(
      value(requestGenepodMule(s, input({ eventFlags: up.state.event })))
        .disposition,
    ).toBe("ignored");
    expect(value(readyGenepodPanel(s.building, 0))).toEqual({
      panelState: 3,
      service55Requested: true,
    });
    expect(
      value(requestGenepodMule(s, input({ capturedHit: false }))).reason,
    ).toBe("no-captured-hit");
    expect(
      value(requestGenepodMule(s, input({ selectedPlayer: 1 }))).reason,
    ).toBe("disabled-or-not-owned");
    s.building[50] = 1;
    expect(value(requestGenepodMule(s, input())).reason).toBe("building-flags");
    s.building[50] = 0;
    put32(s.players[0], 0x4a3, 74);
    expect(value(requestGenepodMule(s, input()))).toMatchObject({
      disposition: "denied",
      audioCue: 0x26,
    });
    put32(s.players[0], 0x4a7, 1);
    put32(s.players[0], 0x62a, 0);
    expect(value(requestGenepodMule(s, input())).disposition).toBe("denied");
    put32(s.players[0], 0x62a, 1);
    expect(value(requestGenepodMule(s, input())).disposition).toBe("started");
    expect(requestGenepodMule(s, input({ speciesListIndex: 1 }))).toEqual({
      ok: false,
      reason: "invalid-genepod-species-list-index",
    });
    s.players[0][0x6ae] = 3;
    expect(requestGenepodMule(s, input())).toEqual({
      ok: false,
      reason: "unsupported-genepod-species",
    });
  });

  it("uses grade-dependent initial remainder and unsigned capped cancellation refund", () => {
    const s = state();
    s.building[46] = 2;
    const started = value(requestGenepodMule(s, input())).state;
    expect(dword(started.building, 54)).toBe(18);
    expect(dword(started.players[0], 0x4a3)).toBe(197);
    put32(started.building, 54, 17);
    put32(started.players[0], 0x4a7, 598);
    const cancelled = value(requestGenepodMule(started, input())).state;
    expect(dword(cancelled.players[0], 0x4a7)).toBe(600);
    expect(dword(cancelled.players[0], 0x4a3)).toBe(202);
    expect(stepGenepod(started, context())).toEqual({
      ok: false,
      reason: "unsupported-genepod-callback-state",
    });
  });
});

describe("Genepod work and complete terminal continuation", () => {
  it("distinguishes unpowered frame cadence, source funds wait and actual recorded-payer debit", () => {
    const s = work();
    s.building[49] = 1;
    const waited = value(stepGenepod(s, context(1)));
    expect(waited.status).toBe("frame-wait");
    expect(dword(waited.state.building, 54)).toBe(2);
    expect(waited.state.building[63]).toBe(2);
    put32(s.players[0], 0x4a3, 0);
    expect(value(stepGenepod(s, context(6))).status).toBe("funds-wait");
    put32(s.players[0], 0x4a3, 1);
    s.building[58] = 1;
    const worked = value(stepGenepod(s, context(6)));
    expect(worked.status).toBe("working");
    expect(worked.paidBy).toBe(1);
    expect(dword(worked.state.players[0], 0x4a3)).toBe(1);
    expect(dword(worked.state.players[1], 0x4a3)).toBe(199);
    expect(worked.state.rng).toEqual(s.rng);
  });

  it("preserves signed energy wrapping/capping, power loss warnings and AI floor", () => {
    const s = work();
    put(s.building, 61, -32768);
    s.building[63] = 2;
    s.players[0][2] = 1;
    put32(s.players[0], 0x4a3, 1);
    put32(s.players[0], 0x4a7, 0);
    const wrapped = value(stepGenepod(s, context(1)));
    expect(word(wrapped.state.building, 61)).toBe(200);
    expect(wrapped.status).toBe("working");
    expect(dword(wrapped.state.players[0], 0x4a7)).toBe(1000);
    put(s.building, 61, 1);
    const lost = value(stepGenepod(s, context(1)));
    expect(word(lost.state.building, 61)).toBe(0);
    expect(lost.state.building[49]! & 4).toBe(0);
    expect(word(lost.state.players[0], 0x5ea)).toBe(1000);
    expect(lost.status).toBe("frame-wait");
  });

  it("completes the ordinary75-step path with real first-free Mule allocation and7 terminal draws", () => {
    let s = value(requestGenepodMule(state(), input())).state;
    const c = context(),
      p = c.pools!;
    p.creatureCount = 1;
    p.creatures[0][6] = 1;
    p.creatures[1][0x43] = 91;
    p.creatures[1][0x44] = 93;
    p.creatures[1][0x50] = 71;
    const originalPools = structuredClone(p),
      initialDraws = s.rng.draws;
    let last = value(stepGenepod(s, c));
    s = last.state;
    for (let frame = 1; frame < 75; frame++) {
      last = value(stepGenepod(s, { ...c, frame }));
      s = last.state;
    }
    expect(last.status).toBe("mule-born");
    expect(last.births).toHaveLength(1);
    expect(last.births[0]).toMatchObject({
      family: 0,
      slot: 1,
      resource: { kind: "creature", selector: 4 },
    });
    const n = last.births[0].native;
    expect([n[6], n[24], n[0x7a], n[0x76]]).toEqual([1, 0, 4, 50]);
    expect(n.slice(31, 39)).toEqual(Array(8).fill(null));
    expect(n.slice(0x43, 0x45)).toEqual([91, 93]);
    expect(n[0x50]).toBe(71);
    expect(dword(n, 39)).toBe(dword(n, 17) + 3840);
    expect(s.rng.draws - initialDraws).toBe(7);
    expect(dword(s.players[0], 0x4a3)).toBe(125);
    expect(dword(s.players[0], 0x6f9)).toBe(1);
    expect(last.pools!.creatureCount).toBe(2);
    expect(word(s.building, 58)).toBe(1);
    expect(dword(s.building, 54)).toBe(0);
    expect(last.audio).toEqual([{ cue: 0x1a, mode: 2 }]);
    expect(p).toEqual(originalPools);
    expect(JSON.parse(JSON.stringify(last))).toEqual(last);
  });

  it("keeps the inclusive roll0/quality0 success and full-creature-pool null return exact", () => {
    const s = work(state(), 1);
    s.rng.seed = 0;
    put32(s.players[0], 0x62a, 0);
    const made = value(stepGenepod(s, context()));
    expect(made.roll).toBe(0);
    expect(made.quality).toBe(0);
    expect(made.status).toBe("mule-born");
    const c = context();
    c.pools!.creatures.forEach((n) => (n[6] = 1));
    c.pools!.creatureCount = 300;
    const full = value(stepGenepod(s, c));
    expect(full.status).toBe("creature-pool-full");
    expect(full.births).toEqual([]);
    expect(word(full.state.building, 58)).toBe(301);
    expect(full.state.rng.draws - s.rng.draws).toBe(1);
    expect(dword(full.state.players[0], 0x6f9)).toBe(0);
    expect(dword(full.state.players[0], 0x62a)).toBe(0);
  });

  it("allocates actual failure particles with retained native fractions and no factory draws", () => {
    const s = work(state(), 1);
    put32(s.players[0], 0x62a, -2048);
    const c = context();
    c.pools!.effects[0][6] = 5;
    c.pools!.effectCount = 1;
    c.pools!.effects[1][67] = 83;
    c.pools!.effects[1][68] = 89;
    c.pools!.effects[1][71] = 91;
    const failed = value(stepGenepod(s, c)),
      count = failed.births.length;
    expect(failed.status).toBe("quality-failed");
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(8);
    expect(failed.state.rng.draws - s.rng.draws).toBe(4 + 3 * count);
    expect(failed.births[0].slot).toBe(1);
    const n = failed.births[0].native;
    expect([n[6], n[69], n[73], n[67], n[68], n[71]]).toEqual([
      5, 32, 0, 83, 89, 91,
    ]);
    expect(word(n, 21)).toBe(0);
    expect(dword(n, 39)).toBe(dword(s.building, 17) + 3840);
    expect(dword(failed.state.players[0], 0x62a)).toBe(0);
    expect(failed.pools!.effectCount).toBe(count + 1);
    expect(failed.audio[0].cue).toBe(8);
    expect(failed.audio[1].cue).toBeGreaterThanOrEqual(28);
  });

  it("rolls back all debit/RNG/births on late full effect pool or unknown real priors", () => {
    const s = work(state(), 1);
    put32(s.players[0], 0x62a, -2048);
    const c = context();
    for (let index = 0; index < 199; index++) c.pools!.effects[index][6] = 5;
    c.pools!.effectCount = 199;
    const before = structuredClone({ s, c });
    expect(stepGenepod(s, c)).toEqual({
      ok: false,
      reason: "genepod-effect-priority-replacement-required",
    });
    expect({ s, c }).toEqual(before);
    put32(s.players[0], 0x62a, 50 << 11);
    const good = context();
    good.pools!.creatures[0][0x4a] = null;
    expect(stepGenepod(s, good)).toEqual({
      ok: false,
      reason: "unknown-genepod-native-byte-74",
    });
    expect(stepGenepod(s, { ...good, pools: undefined })).toEqual({
      ok: false,
      reason: "actual-genepod-factory-pools-required",
    });
  });

  it("requires actual BGENE animation metadata and coherent count before factories", () => {
    const s = work(state(), 1),
      c = context();
    c.runningAnimation.holds = [];
    expect(stepGenepod(s, c)).toEqual({
      ok: false,
      reason: "original-bgene-grade0-animation-required",
    });
    const mismatch = context();
    mismatch.pools!.creatureCount = 1;
    expect(
      createGenepodMule(
        mismatch.pools!,
        s.players,
        s.rng,
        { owner: 0, position: [1, 2], quality: 50 },
        mismatch,
      ),
    ).toEqual({ ok: false, reason: "genepod-pool-count-mismatch" });
  });
});

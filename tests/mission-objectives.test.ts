import { describe, expect, it, vi } from "vitest";
import {
  describeMissionObjectives,
  evaluateMissionObjectives,
  readMissionObjectiveContext,
  scanMissionObjectives,
  type MissionObjectiveContext,
  type ObjectiveResult,
} from "../src/sim/mechanics/mission-objectives";
import {
  stepCampaignResult,
  stepExcelandResult,
  type CampaignResultState,
} from "../src/sim/mechanics/outcome";

const put16 = (r: number[], at: number, value: number) => {
  r[at] = value & 255;
  r[at + 1] = (value >>> 8) & 255;
};
const put32 = (r: number[], at: number, value: number) => {
  for (let n = 0; n < 4; n++) r[at + n] = (value >>> (n * 8)) & 255;
};
function value<T>(result: ObjectiveResult<T>): T {
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
function context(
  patch: Partial<MissionObjectiveContext> = {},
): MissionObjectiveContext {
  return {
    flags: 0x20,
    mode: 0,
    active: 1,
    selected: 0,
    frame: 23,
    missionCounter: 0,
    targetCount: 0,
    missionLimit: 17,
    missionTimer: 0,
    terrainCount: 0,
    terrainLimit: 31,
    field34b9: 0,
    ...patch,
  };
}
function players() {
  return Array.from({ length: 4 }, (_, id) => {
    const p = Array(1805).fill(0);
    p[1] = p[0x4a1] = id;
    p[3] = 1;
    p[0x6e7] = 1;
    put32(p, 0x49d, 1);
    return p;
  });
}
const capable = () => ({ ok: true as const, value: false });
const exhausted = () => ({ ok: true as const, value: true });
const scan = (p = players(), c = context()) =>
  value(scanMissionObjectives(p, c, capable));
const evaluate = (p = players(), c = context()) =>
  value(evaluateMissionObjectives(p, c, capable));
function prefix() {
  const b = Array(0x355e).fill(0);
  put32(b, 0x1ec2, 0xf1234567);
  put16(b, 0x1ea6, 0xfedc);
  put16(b, 0x1c7c, 0x8765);
  put16(b, 0x355c, 0xfed1);
  b[0x34b8] = 1;
  b[0x34b9] = 0;
  put32(b, 0x1eaa, -31);
  put16(b, 0x2ff8, -123);
  put16(b, 0x2ffa, 3000);
  b[0x2ffc] = 12;
  put32(b, 0x2ffe, 456);
  put32(b, 0x3002, 71);
  put32(b, 0x3006, 29);
  return b;
}

describe("complete source72ED0 objective scan", () => {
  it("reads signed and unsigned source fields from actual current backing bytes", () => {
    const b = prefix(),
      runtime = {
        flags: 0x3e,
        mode: 2,
        active: 4,
        selected: 3,
        frame: 0xffffffff,
      };
    expect(value(readMissionObjectiveContext(b, runtime))).toEqual({
      ...runtime,
      missionCounter: 0xf1234567,
      targetCount: 0xfedc,
      missionLimit: 0x8765,
      missionTimer: 0xfed1,
      terrainCount: 1,
      terrainLimit: -31,
      field34b9: 0,
    });
    expect(readMissionObjectiveContext(b.slice(1), runtime)).toEqual({
      ok: false,
      reason: "invalid-objective-source-prefix",
    });
    expect(readMissionObjectiveContext(b, { ...runtime, selected: 4 })).toEqual(
      { ok: false, reason: "invalid-outcome-context" },
    );
  });

  it("uses all progress bytes without assigning mission-number objective guesses", () => {
    for (let progress = 0; progress < 256; progress++) {
      const p = players();
      p[0][0x6e7] = progress;
      p[0][0x606] = 255;
      put32(p[0], 0x11, 17);
      const c = context(),
        result = scan(p, c);
      expect(result.winner, `progress ${progress}`).toBe(
        [0, 14, 20].includes(progress) ? 0 : null,
      );
      expect(result.capabilityQueries).toEqual(
        [0, 14, 20].includes(progress) ? [] : [0],
      );
    }
  });

  it("applies progress14/20 signed approval, unsigned limit, timer and mode gates", () => {
    for (const progress of [14, 20]) {
      const p = players();
      p[0][0x6e7] = progress;
      put32(p[0], 0x11, 65534);
      expect(scan(p, context({ missionLimit: 65535 })).winner).toBeNull();
      put32(p[0], 0x11, 65535);
      expect(scan(p, context({ missionLimit: 65535 })).winner).toBe(0);
      expect(
        scan(p, context({ missionLimit: 65535, missionTimer: 1 })).winner,
      ).toBeNull();
      expect(
        scan(p, context({ missionLimit: 65535, mode: 1 })).winner,
      ).toBeNull();
      put32(p[0], 0x11, -1);
      expect(scan(p, context({ missionLimit: 0 })).winner).toBeNull();
    }
  });

  it("gates direct objectives on activation and the exact empty-player branch", () => {
    const p = players();
    p[0][0x6e7] = 0;
    p[0][0x606] = 3;
    put32(p[0], 0x49d, 0);
    expect(scan(p).winner).toBeNull();
    put32(p[0], 0x49d, -1);
    p[0][3] = 0;
    expect(scan(p).players[0][0x6e3]).toBe(1);
    expect(scan(p).winner).toBeNull();
    p[0][3] = 255; // signed-1 is nonzero, not an empty count.
    expect(scan(p).winner).toBe(0);
    p[0][3] = 0;
    p[0][0x4a2] = 128;
    expect(scan(p).winner).toBe(0);
    p[0][0x4a2] = 0;
    p[0][2] = 1;
    expect(scan(p).winner).toBe(0);
    put16(p[0], 0x60e, 0x8000);
    expect(scan(p).winner).toBeNull();
    p[0][2] = 0;
    p[0][0x498] = 1;
    expect(scan(p, context({ missionCounter: 99 })).winner).toBe(0);
    expect(scan(p, context({ missionCounter: 0 })).winner).toBeNull();
  });

  it("queries capability lazily in selected-player source order and preserves atomic failure", () => {
    const p = players(),
      before = structuredClone(p);
    p[0][3] = 0;
    const query = vi.fn(() => ({
      ok: false as const,
      reason: "actual-blueprint-required",
      subject: 7,
    }));
    const snapshot = structuredClone(p);
    expect(
      scanMissionObjectives(p, context({ active: 3, selected: 1 }), query),
    ).toEqual({ ok: false, reason: "actual-blueprint-required", subject: 7 });
    expect(query.mock.calls).toHaveLength(1);
    expect(p).toEqual(snapshot);
    const successQuery = vi.fn(capable);
    const result = value(
      scanMissionObjectives(
        before,
        context({ active: 4, selected: 2 }),
        successQuery,
      ),
    );
    expect(result.capabilityQueries).toEqual([2]);
    expect(successQuery.mock.calls).toHaveLength(1);
    for (const c of [context({ flags: 0 }), context({ missionCounter: 99 })]) {
      const unused = vi.fn(query);
      expect(
        value(scanMissionObjectives(before, c, unused)).capabilityQueries,
      ).toEqual([]);
      expect(unused).not.toHaveBeenCalled();
    }
    before[0][0x6e7] = 0;
    before[0][0x606] = 3;
    expect(value(scanMissionObjectives(before, context(), query)).winner).toBe(
      0,
    );
  });

  it("allows the later generic threshold after capability marks the player eliminated", () => {
    const p = players();
    put32(p[0], 0x4a7, 9);
    const result = value(
      scanMissionObjectives(p, context({ targetCount: 9 }), exhausted),
    );
    expect(result.players[0][0x6e3]).toBe(1);
    expect(result.winner).toBe(0);
    expect(result.survivors).toBe(0);
  });

  it("compares GOOP signed storage against an unsigned target outside campaign mode", () => {
    const p = players(),
      c = context({ flags: 0, targetCount: 65535 });
    put32(p[0], 0x4a7, -1);
    expect(scan(p, c).winner).toBeNull();
    put32(p[0], 0x4a7, 65535);
    expect(scan(p, c).winner).toBe(0);
    p[0][2] = 1;
    expect(scan(p, c).winner).toBeNull();
    p[0][2] = 0;
    expect(scan(p, { ...c, targetCount: 0 }).winner).toBeNull();
    put32(p[1], 0x4a7, 99999);
    expect(scan(p, { ...c, active: 2, selected: 1 }).winner).toBe(0);
  });

  it("compares signed terrain score and limit independently from player type and GOOP", () => {
    const p = players();
    p[0][2] = 1;
    put32(p[0], 0xd, -3);
    const c = context({ terrainCount: 1, terrainLimit: -3 });
    expect(scan(p, c).winner).toBe(0);
    expect(scan(p, { ...c, terrainLimit: -2 }).winner).toBeNull();
    expect(scan(p, { ...c, terrainCount: 0 }).winner).toBeNull();
    put32(p[0], 0x49d, 0);
    expect(scan(p, c).winner).toBeNull();
  });

  it("uses exhausted-zone survivor ranking with first ties and source WORD best truncation", () => {
    const p = players(),
      c = context({
        active: 3,
        terrainCount: 2,
        field34b9: 2,
        terrainLimit: 0x7fffffff,
      });
    // Ranking is outside direct eligibility and ignores eliminated players.
    for (const record of p) put32(record, 0x49d, 0);
    put32(p[0], 0xd, 7);
    put32(p[1], 0xd, 7);
    put32(p[2], 0xd, 6);
    expect(scan(p, c).winner).toBe(0);
    p[0][0x6e3] = 1;
    expect(scan(p, c).winner).toBe(1);
    p[0][0x6e3] = 0;
    put32(p[0], 0xd, 65536);
    expect(scan(p, c).winner).toBe(1); // best65536 truncates to0 before player1.
    expect(scan(p, { ...c, targetCount: 9 }).winner).toBe(1);
    expect(scan(p, { ...c, field34b9: 1 }).winner).toBeNull();
    for (const record of p) put32(record, 0xd, -1);
    put32(p[1], 0xd, 0);
    expect(scan(p, c).winner).toBeNull();
  });

  it("uses last survivor only under the exact target/terrain/mode/active gates", () => {
    const p = players();
    p[0][0x6e3] = 1;
    p[2][0x6e3] = 1;
    const c = context({ active: 3 });
    expect(scan(p, c).winner).toBe(1);
    expect(scan(p, { ...c, targetCount: 1 }).winner).toBeNull();
    expect(scan(p, { ...c, terrainCount: 1 }).winner).toBeNull();
    expect(scan(p, { ...c, terrainCount: 1, mode: 1 }).winner).toBe(1);
    expect(scan(p, { ...c, active: 1 }).winner).toBeNull();
    put32(p[1], 0x49d, 0); // Inactive source record still participates as survivor.
    expect(scan(p, c).winner).toBe(1);
  });

  it("retains terminal identity/deferred landing boundaries and source ordering", () => {
    const p = players(),
      query = vi.fn(capable);
    const c = context({ missionCounter: 23 });
    expect(scanMissionObjectives(p, c, query)).toEqual({
      ok: false,
      reason: "deferred-landing-required",
    });
    expect(query).not.toHaveBeenCalled();
    expect(
      value(scanMissionObjectives(p, { ...c, flags: c.flags | 0x40 }, query))
        .alreadyTerminal,
    ).toBe(true);
    expect(
      evaluateMissionObjectives(p, { ...c, flags: c.flags | 0x40 }, query),
    ).toEqual({ ok: false, reason: "terminal-result-identity-required" });
    expect(query).not.toHaveBeenCalled();
  });

  it("preserves ordinary loss flags, winner priority and alternate-presentation boundaries", () => {
    const p = players();
    expect(evaluate(p, context({ flags: 0x80, mode: 1 })).outcome).toEqual({
      kind: "lost",
      player: 0,
      winner: null,
    });
    p[0][0x6e3] = 1;
    expect(
      evaluateMissionObjectives(p, context({ flags: 0, mode: 1 }), capable),
    ).toEqual({ ok: false, reason: "alternate-result-presentation-required" });
    expect(evaluate(p, context({ active: 2 })).outcome).toEqual({
      kind: "lost",
      player: 0,
      winner: 1,
    });
    p[0][0x6e7] = 0;
    p[0][0x606] = 3;
    const won = evaluate(p, context({ flags: 0xa0 }));
    expect(won.flagsAfter).toBe(0xe0);
    expect(won.outcome).toEqual({ kind: "won", player: 0 });
    expect(won.resultRequest).toBe("victory-185DFC");
    expect(evaluateMissionObjectives(p, context({ mode: 1 }), capable)).toEqual(
      { ok: false, reason: "alternate-result-presentation-required" },
    );
  });

  it("rejects malformed raw records/context without fabricating source values", () => {
    const p = players();
    expect(scanMissionObjectives(p.slice(1), context(), capable)).toEqual({
      ok: false,
      reason: "invalid-objective-player-records",
    });
    p[3][1804] = null as unknown as number;
    expect(scanMissionObjectives(p, context(), capable).ok).toBe(false);
    for (const patch of [
      { active: 5 },
      { selected: 4 },
      { terrainCount: 256 },
      { missionTimer: -1 },
      { targetCount: 65536 },
      { frame: 0x100000000 },
      { terrainLimit: 0x80000000 },
    ])
      expect(scanMissionObjectives(players(), context(patch), capable)).toEqual(
        { ok: false, reason: "invalid-outcome-context" },
      );
  });
});

describe("source-driven goal ledger and generic campaign result stages", () => {
  it("describes a non-Exceland marked-zone goal from actual prefix/context", () => {
    const p = players(),
      b = prefix();
    put32(b, 0x1ec2, 0);
    put16(b, 0x1ea6, 0);
    put32(b, 0x1eaa, 31);
    put32(p[0], 0xd, 19);
    const c = value(readMissionObjectiveContext(b, context()));
    const ledger = value(describeMissionObjectives(p, c, b));
    expect(ledger.goals.map((goal) => goal.id)).toEqual([
      "terrain-score",
      "terrain-ranking",
    ]);
    expect(ledger.goals[0]).toMatchObject({
      current: 19,
      target: 31,
      thresholdReached: false,
      sourcePlayerOffset: 0xd,
    });
    expect(ledger.zones).toEqual([
      {
        index: 0,
        center: [-123, 3000],
        selector: 12,
        radius: 456,
        initialQuota: 71,
        remainingQuota: 29,
        activeObservers: 0,
      },
    ]);
    expect(ledger.zoneMetadataStatus).toBe("provided");
    b[0x2ff8 + 18] = 2;
    expect(
      value(describeMissionObjectives(p, c, b)).zones![0].activeObservers,
    ).toBe(2);
    b[0x2ff8 + 18] = 255;
    expect(
      value(describeMissionObjectives(p, c, b)).zones![0].activeObservers,
    ).toBe(-1);
    expect(ledger.campaignProgress).toBe(1);
    expect(ledger.directlyEligible).toBe(true);
    expect(value(describeMissionObjectives(p, c)).zoneMetadataStatus).toBe(
      "source-prefix-required",
    );
    expect(
      value(describeMissionObjectives(p, { ...c, terrainCount: 5 }))
        .zoneMetadataStatus,
    ).toBe("unsupported-zone-count");
    expect(describeMissionObjectives(p, { ...c, terrainCount: 2 }, b)).toEqual({
      ok: false,
      reason: "objective-zone-count-mismatch",
    });
  });

  it("keeps display thresholds separate from eligibility and actual scan decisions", () => {
    const p = players();
    p[0][0x6e7] = 14;
    put32(p[0], 0x11, 17);
    expect(
      value(describeMissionObjectives(p, context({ missionTimer: 1 })))
        .goals[0],
    ).toMatchObject({
      id: "approval-timer",
      timerRemaining: 1,
      thresholdReached: false,
    });
    p[0][0x6e7] = 0;
    p[0][0x606] = 3;
    p[0][3] = 0;
    const ledger = value(describeMissionObjectives(p, context()));
    expect(ledger.goals[0].thresholdReached).toBe(true);
    expect(ledger.directlyEligible).toBe(false);
    expect(evaluate(p).outcome.kind).toBe("lost");
    p[0][0x6e7] = 7;
    expect(
      value(describeMissionObjectives(p, context())).selectedVictoryPredicate,
    ).toBe("none-configured");
  });

  it("uses generic source thresholds for later result flow while retaining the Exceland guard", () => {
    const p = players();
    put32(p[0], 0xd, 31);
    p[0][0x600] = 1;
    const state: CampaignResultState = {
      schemaVersion: 1,
      phase: "running",
      players: p,
      context: { missionNumber: 2, ...context({ terrainCount: 1 }) },
      savedFrame: 0,
      stage: 0,
      terminal: null,
    };
    const action = { type: "evaluate" as const, actors: [] };
    expect(stepExcelandResult(state, action)).toEqual({
      ok: false,
      reason: "unsupported-mission-objective",
    });
    const original = structuredClone(state);
    const won = value(stepCampaignResult(state, action));
    expect(state).toEqual(original);
    expect(won.state.phase).toBe("victory-notification");
    expect(won.state.players[0][0x6e7]).toBe(1);
    expect(won.events).toEqual([
      { type: "show-victory-notification", textIndex: 555 },
    ]);
    const queued = value(
      stepCampaignResult(won.state, { type: "continue-notification" }),
    );
    const entered = value(
      stepCampaignResult(queued.state, {
        type: "enter-victory",
        videoLockDepth: 0,
        presentationResolved: true,
      }),
    );
    expect(entered.state.players[0][0x6e7]).toBe(2);
    expect(entered.state.savedFrame).toBe(23);
    expect(
      value(
        stepCampaignResult(JSON.parse(JSON.stringify(entered.state)), {
          type: "advance-victory",
          runtimeInputFlags: 1,
        }),
      ).state.phase,
    ).toBe("campaign-view-queued");
    delete state.context.missionTimer;
    expect(stepCampaignResult(state, action)).toEqual({
      ok: false,
      reason: "invalid-outcome-context",
    });
  });
});

import { describe, expect, it } from "vitest";
import {
  completeCampaignRetirement,
  constructionCapabilityExhausted,
  planCampaignCarry,
  planCampaignPlayerCarry,
  restoreNextCampaignSource,
  resumeAfterCampaignViewEntry,
  projectCampaignAuxiliaryMetadata,
  stepExcelandResult,
  type CampaignCarryInput,
  type CampaignResultState,
  type OutcomeResult,
  type RawRecord,
  type ResultAction,
} from "../src/sim/mechanics/outcome";

const put16 = (r: number[], at: number, value: number) => {
  r[at] = value & 255;
  r[at + 1] = (value >> 8) & 255;
};
const put32 = (r: number[], at: number, value: number) => {
  for (let n = 0; n < 4; n++) r[at + n] = (value >>> (n * 8)) & 255;
};
function value<T>(result: OutcomeResult<T>): T {
  if (!result.ok) throw new Error(result.reason);
  return result.value;
}
function players() {
  return Array.from({ length: 4 }, (_, owner) => {
    const p = Array(1805).fill(0);
    p[1] = owner;
    p[0x4a1] = owner;
    return p;
  });
}
function resultState(): CampaignResultState {
  const p = players();
  put32(p[0], 0x49d, 1);
  p[0][3] = 1;
  p[0][4] = 0;
  return {
    schemaVersion: 1,
    phase: "running",
    players: p,
    context: {
      missionNumber: 1,
      flags: 0x3e,
      mode: 0,
      active: 1,
      selected: 0,
      frame: 123,
      missionCounter: 0,
      targetCount: 0,
      terrainCount: 0,
    },
    savedFrame: 0,
    stage: 0,
    terminal: null,
  };
}
const evaluate: ResultAction = {
  type: "evaluate",
  actors: [{ id: 0, owner: 0, category: 0 }],
};
const act = (state: CampaignResultState, action: ResultAction) =>
  value(stepExcelandResult(state, action));
function carryInput(): CampaignCarryInput {
  return {
    players: players(),
    actors: [],
    externalRecords: Array.from({ length: 600 }, (_, i) => (i * 17 + 9) & 255),
    retainedWorldBytes: Array.from(
      { length: 150 },
      (_, i) => (i * 19 + 5) & 255,
    ),
    flags: 0x7e,
    mode: 2,
    selectedPlayer: 0,
    selectedActor: null,
  };
}
function sourceConq(): RawRecord {
  const raw = Array(343958).fill(0);
  put32(raw, 0, 0x55336);
  put32(raw, 337054, 0x6be);
  for (let owner = 0; owner < 4; owner++) {
    const p = 20 + owner * 1805;
    raw[p + 1] = owner;
    raw[p + 0x4a1] = owner;
  }
  put32(raw, 0x52474, 37);
  put32(raw, 0x52478, 91);
  put32(raw, 0x5247c, 31);
  put16(raw, 0x52480, 765);
  return raw;
}

describe("Exceland source objective and capability eligibility", () => {
  it("requires three unsigned completed Photons inside the campaign/activation gates", () => {
    const s = resultState();
    s.players[0][0x606] = 2;
    expect(act(s, evaluate).state.phase).toBe("running");
    s.players[0][0x606] = 255;
    const won = act(s, evaluate);
    expect(won.state.phase).toBe("victory-notification");
    expect(won.state.context.flags & 0x40).toBe(0x40);
    expect(won.state.players[0][0x6e7]).toBe(0);
    expect(won.events).toEqual([
      { type: "show-victory-notification", textIndex: 555 },
    ]);
    expect(won.capabilityQueries).toEqual([]);
    for (const change of ["campaign", "activation"] as const) {
      const gated = structuredClone(s);
      if (change === "campaign") gated.context.flags &= ~0x20;
      else put32(gated.players[0], 0x49d, 0);
      expect(act(gated, evaluate).state.phase).toBe("running");
    }
  });

  it("marks an eligible empty player eliminated before testing its completed counter", () => {
    const s = resultState();
    s.players[0][3] = 0;
    s.players[0][0x606] = 3;
    const receipt = act(s, evaluate);
    expect(receipt.state.phase).toBe("lost");
    expect(receipt.state.players[0][0x6e3]).toBe(1);
    expect(receipt.events).toEqual([
      { type: "loss-latched", player: 0, winner: null },
    ]);
  });

  it("keeps lazy capability errors separate from gameplay loss and stops on architect category", () => {
    const s = resultState();
    s.players[0][3] = 2;
    s.players[0][5] = 255;
    expect(
      value(
        constructionCapabilityExhausted(s.players[0], [
          { id: 0, owner: 0, category: 0 },
        ]),
      ),
    ).toBe(false);
    const original = structuredClone(s);
    expect(stepExcelandResult(s, { type: "evaluate", actors: [] })).toEqual({
      ok: false,
      reason: "missing-capability-blueprint",
      subject: 0,
    });
    expect(s).toEqual(original);
    s.players[0][3] = 127;
    put32(s.players[0], 0x616, 1);
    expect(value(constructionCapabilityExhausted(s.players[0], []))).toBe(
      false,
    );
    put32(s.players[0], 0x616, 0);
    expect(constructionCapabilityExhausted(s.players[0], [])).toEqual({
      ok: false,
      reason: "invalid-capability-actor-count",
      subject: 127,
    });
  });

  it("uses source600/605 and active stored blueprint category gates without inventing resource meanings", () => {
    const p = players()[0];
    p[3] = 255;
    p[0x600] = 1;
    expect(value(constructionCapabilityExhausted(p, []))).toBe(false);
    p[0x600] = 0;
    expect(value(constructionCapabilityExhausted(p, []))).toBe(true);
    p[0x605] = 1;
    const last = 0x16 + 31 * 36;
    p[last] = 1;
    expect(value(constructionCapabilityExhausted(p, []))).toBe(false);
    p[last + 0x16] = 3;
    expect(value(constructionCapabilityExhausted(p, []))).toBe(true);
  });

  it("rejects unsupported mission scripts, deferred landing, missing terminal identity and alternate presentation", () => {
    const s = resultState();
    for (const patch of [
      { missionNumber: 2 },
      { targetCount: 1 },
      { terrainCount: 1 },
    ]) {
      const changed = structuredClone(s);
      Object.assign(changed.context, patch);
      expect(stepExcelandResult(changed, evaluate)).toEqual({
        ok: false,
        reason: "unsupported-mission-objective",
      });
    }
    s.context.missionCounter = s.context.frame;
    expect(stepExcelandResult(s, evaluate)).toEqual({
      ok: false,
      reason: "deferred-landing-required",
    });
    s.context.missionCounter = 0;
    s.context.flags |= 0x40;
    expect(stepExcelandResult(s, evaluate)).toEqual({
      ok: false,
      reason: "terminal-result-identity-required",
    });
    s.context.flags &= ~0x40;
    s.players[0][0x606] = 3;
    s.context.mode = 1;
    expect(stepExcelandResult(s, evaluate)).toEqual({
      ok: false,
      reason: "alternate-result-presentation-required",
    });
  });

  it("preserves the ordinary loss latch and source last-survivor ordering", () => {
    const s = resultState();
    s.context.flags |= 0x80;
    expect(act(s, evaluate).state.phase).toBe("lost");
    s.context.flags &= ~0x80;
    s.context.active = 2;
    s.players[0][0x6e3] = 1;
    const lost = act(s, evaluate);
    expect(lost.state.terminal).toEqual({ kind: "lost", player: 0, winner: 1 });
  });
});

describe("result notification, entry and continuation are serializable separate stages", () => {
  it("increments progress only when the queued victory view enters, and preserves statistics before cleanup", () => {
    const s = resultState();
    s.players[0][0x606] = 3;
    put32(s.players[0], 0x6f9, 19);
    put32(s.players[0], 0xd, -37);
    const won = act(s, evaluate).state;
    expect(act(won, evaluate).state).toEqual(won);
    const queued = act(won, { type: "continue-notification" }).state;
    expect(queued.players[0][0x6e7]).toBe(0);
    expect(
      stepExcelandResult(queued, {
        type: "enter-victory",
        videoLockDepth: 0,
        presentationResolved: false,
      }),
    ).toEqual({ ok: false, reason: "victory-presentation-service-required" });
    const entered = act(queued, {
      type: "enter-victory",
      videoLockDepth: 0,
      presentationResolved: true,
    });
    expect(entered.state.players[0][0x6e7]).toBe(1);
    expect(entered.state.savedFrame).toBe(123);
    expect(entered.state.context.frame).toBe(0);
    expect(entered.state.context.mode).toBe(2);
    expect(entered.state.stage).toBe(5);
    expect(entered.state.context.flags & 4).toBe(0);
    expect(entered.events[0]).toMatchObject({
      type: "victory-presentation",
      feedbackTextIndex: 478,
      statistics: [19, 0, 0, 0, 0, -37],
    });
    const saved = JSON.parse(JSON.stringify(entered.state));
    expect(
      act(saved, { type: "advance-victory", runtimeInputFlags: 0 }).state,
    ).toEqual(entered.state);
    const continued = act(saved, {
      type: "advance-victory",
      runtimeInputFlags: 1,
    });
    expect(continued.state.phase).toBe("campaign-view-queued");
    expect(continued.state.players[0][0x6e7]).toBe(1);
    expect(continued.events).toEqual([
      { type: "queue-view", view: "campaign-186F19" },
    ]);
  });

  it("requires result stage order and keeps the ending/input boundaries explicit", () => {
    const s = resultState();
    expect(stepExcelandResult(s, { type: "continue-notification" })).toEqual({
      ok: false,
      reason: "victory-notification-required",
    });
    s.phase = "victory-view";
    s.players[0][0x6e7] = 24;
    expect(
      stepExcelandResult(s, { type: "advance-victory", runtimeInputFlags: 1 }),
    ).toEqual({ ok: false, reason: "ending-sequence-required" });
    expect(resumeAfterCampaignViewEntry(0x82, 0, 7, 123)).toEqual({
      mode: 0x80,
      frame: 123,
      resumed: true,
    });
    expect(resumeAfterCampaignViewEntry(2, 1, 7, 123)).toEqual({
      mode: 2,
      frame: 7,
      resumed: false,
    });
  });
});

describe("four-player source cleanup and generic successor overlay", () => {
  it("clears exact ranges and only active blueprint runtime timers while preserving unknown bytes", () => {
    const input = carryInput();
    for (let owner = 0; owner < 4; owner++) {
      const p = input.players[owner];
      for (let index = 0; index < p.length; index++)
        p[index] = (index * 7 + owner) & 255;
      p[1] = owner;
      p[0x4a1] = owner;
      p[3] = 1;
      p[4] = owner * 5;
      input.actors.push({ id: owner * 5, owner, blueprintIndex: 0 });
      p[0x16] = 1;
      p[0x16 + 36] = 0;
      p[0x6e7] = owner + 1;
    }
    const before = structuredClone(input);
    const receipt = value(
      planCampaignPlayerCarry(input.players, input.actors, 0, 0),
    );
    expect(receipt.retiredActorIds).toEqual([0, 5, 10, 15]);
    expect(receipt.selectedActorResetRequired).toBe(true);
    for (let owner = 0; owner < 4; owner++) {
      const p = receipt.players[owner],
        prior = input.players[owner];
      expect(p[3]).toBe(0);
      expect(p[0x4a1]).toBe(owner);
      expect(p.slice(0x4a2, 0x61a).every((v) => v === 0)).toBe(true);
      expect(p.slice(0x498, 0x4a1).every((v) => v === 0)).toBe(true);
      expect(p.slice(0xd, 0x15)).toEqual(Array(8).fill(0));
      expect(p.slice(0x6f9, 0x70d)).toEqual(Array(20).fill(0));
      expect(p.slice(0x16 + 0x1c, 0x16 + 0x20)).toEqual([0, 0, 0, 0]);
      expect(p.slice(0x16 + 36 + 0x1c, 0x16 + 36 + 0x20)).toEqual(
        prior.slice(0x16 + 36 + 0x1c, 0x16 + 36 + 0x20),
      );
      expect(p[0x16 + 0x20]).toBe(prior[0x16 + 0x20] & ~3);
      expect(p[0x6e7]).toBe(owner + 1);
      expect(p[0x497]).toBe(prior[0x497]);
      expect(p[0x6f7]).toBe(prior[0x6f7]);
    }
    expect(input).toEqual(before);
  });

  it("logical actor retirement remains an explicit host obligation without fabricated native images", () => {
    const input = carryInput();
    input.players[0][3] = 1;
    input.players[0][4] = 0;
    input.actors = [{ id: 0, owner: 0, blueprintIndex: 0 }];
    input.selectedActor = 0;
    const plan = value(planCampaignCarry(input));
    expect(plan.nativeActors).toBeUndefined();
    expect(plan.retirementRequired).toBe(true);
    expect(
      completeCampaignRetirement(plan, {
        retiredActorIds: [],
        selectedActorResetResolved: true,
      }),
    ).toEqual({ ok: false, reason: "campaign-retirement-order-mismatch" });
    expect(
      completeCampaignRetirement(plan, {
        retiredActorIds: [0],
        selectedActorResetResolved: false,
      }),
    ).toEqual({ ok: false, reason: "selected-actor-reset-required" });
    expect(
      value(
        completeCampaignRetirement(plan, {
          retiredActorIds: [0],
          selectedActorResetResolved: true,
        }),
      ).retirementRequired,
    ).toBe(false);
    expect(
      plan.externalRecords.every(
        (n, index) =>
          n === (index % 2 ? 255 : input.externalRecords[index] & 7),
      ),
    ).toBe(true);
    expect(plan.flags).toBe(0x78);
    expect(plan.frame).toBe(0);
  });

  it("restores only the retained selected-player ranges and actual150 world bytes into the next source", () => {
    const input = carryInput();
    input.players[0][0x6e7] = 1;
    input.players[0][0x100] = 41;
    input.players[0][0x620] = 81;
    const plan = value(planCampaignCarry(input));
    const source = sourceConq();
    source[20 + 0x500] = 99;
    source[20 + 0x700] = 89;
    source[20 + 1805 + 0x100] = 29;
    source[298830 + 31] = 57;
    const previous = [...source];
    const restored = value(
      restoreNextCampaignSource(plan, {
        missionNumber: 2,
        sourceVersion: "qa-beta-v5-cd",
        conqBytes: source,
      }),
    );
    expect(restored.status).toBe("initialization-required");
    expect(restored.players[0][0x100]).toBe(41);
    expect(restored.players[0][0x620]).toBe(81);
    expect(restored.players[0][0x500]).toBe(99);
    expect(restored.players[0][0x700]).toBe(89);
    expect(restored.players[1][0x100]).toBe(29);
    expect(restored.conqBytes.slice(0x34ba, 0x3550)).toEqual(
      input.retainedWorldBytes,
    );
    expect(restored.nativeActors[0][39]).toBe(57);
    expect(restored.nativeActors[0].slice(31, 39)).toEqual(Array(8).fill(null));
    expect(restored.nativeActors[0].slice(148)).toEqual(Array(52).fill(null));
    expect(restored.nativeActorBindings).toEqual(Array(20).fill(null));
    expect(restored.sourceRng).toEqual({
      seed: 765,
      drawCount: 91,
      frame: 37,
      ring: null,
    });
    expect(source).toEqual(previous);
  });

  it("preserves supplied native priors only in the source loader's uncopied ranges", () => {
    const input = carryInput();
    input.players[0][0x6e7] = 1;
    input.nativeActors = Array.from({ length: 20 }, () => Array(200).fill(73));
    input.map = Array(229376).fill(0);
    const plan = value(planCampaignCarry(input));
    const restored = value(
      restoreNextCampaignSource(plan, {
        missionNumber: 2,
        sourceVersion: "qa-beta-v5-cd",
        conqBytes: sourceConq(),
      }),
    );
    expect(restored.nativeActors[0].slice(31, 39)).toEqual(Array(8).fill(73));
    expect(restored.nativeActors[0].slice(148)).toEqual(Array(52).fill(73));
    expect(restored.nativeActors[0][39]).toBe(0);
  });

  it("rejects duplicate/stale logical actors and mismatched/active successor sources atomically", () => {
    const input = carryInput();
    input.players[0][3] = 2;
    input.players[0][4] = 0;
    input.players[0][5] = 0;
    input.actors = [{ id: 0, owner: 0, blueprintIndex: 0 }];
    const before = structuredClone(input);
    expect(planCampaignCarry(input)).toEqual({
      ok: false,
      reason: "carry-actor-binding",
      subject: 0,
    });
    expect(input).toEqual(before);
    const clean = carryInput();
    clean.players[0][0x6e7] = 1;
    const plan = value(planCampaignCarry(clean));
    expect(
      restoreNextCampaignSource(plan, {
        missionNumber: 3,
        sourceVersion: "qa-beta-v5-cd",
        conqBytes: sourceConq(),
      }),
    ).toEqual({ ok: false, reason: "campaign-successor-mismatch" });
    const source = sourceConq();
    source[298830 + 6] = 3;
    expect(
      restoreNextCampaignSource(plan, {
        missionNumber: 2,
        sourceVersion: "qa-beta-v5-cd",
        conqBytes: source,
      }),
    ).toEqual({
      ok: false,
      reason: "active-successor-actor-initializer-required",
      subject: 0,
    });
  });
});

function mixedCell() {
  const input = carryInput();
  input.players[0][3] = 2;
  input.players[0][4] = 0;
  input.players[0][5] = 1;
  input.actors = [
    { id: 0, owner: 0, blueprintIndex: 0 },
    { id: 1, owner: 0, blueprintIndex: 10 },
  ];
  input.nativeActors = Array.from({ length: 20 }, () => Array(200).fill(0));
  input.map = Array(229376).fill(0);
  const building = Array(67).fill(0),
    plant = Array(49).fill(0);
  input.entities = [
    { kind: 4, id: 0, record: building },
    { kind: 2, id: 8, record: plant },
  ];
  const cell = 16 * 128 + 16;
  const chain = [
    { ref: [0, 0, 4], r: building },
    { ref: [0, 0, 3], r: input.nativeActors[0] },
    { ref: [8, 0, 2], r: plant },
    { ref: [1, 0, 3], r: input.nativeActors[1] },
  ];
  chain.forEach((entry, index) => {
    entry.r.splice(
      0,
      3,
      ...(chain[index - 1]?.ref ?? [cell & 255, cell >> 8, 0]),
    );
    entry.r.splice(3, 3, ...(chain[index + 1]?.ref ?? [33, 44, 0]));
    entry.r[6] = entry.ref[2];
    put16(entry.r, 15, entry.ref[0]);
    put16(entry.r, 7, 4096);
    put16(entry.r, 9, 4096);
    if (entry.ref[2] === 3) {
      entry.r[112] = 1;
      entry.r.fill(99, 196, 200);
    }
  });
  input.map.splice(cell * 14 + 6, 3, ...chain[0].ref);
  return input;
}
describe("optional source shared-registry carry", () => {
  it("carries unresolved auxiliary low bits without fabricating raw table bytes", () => {
    const input = {
      entries: Array.from({ length: 300 }, (_, index) => ({
        lowFlags: index === 0 ? 5 : null,
        second: null,
      })),
      provenance: "original external184D7C prior unresolved",
    };
    const before = structuredClone(input);
    const projected = value(projectCampaignAuxiliaryMetadata(input));
    expect(projected.knownMask).toBe(7);
    expect(projected.entries[0]).toEqual({ lowFlags: 5, second: 255 });
    expect(projected.entries[299]).toEqual({ lowFlags: null, second: 255 });
    expect(input).toEqual(before);
  });
  it("unlinks retiring actors from mixed building/plant cell chains and preserves neighbours", () => {
    const input = mixedCell();
    const before = structuredClone(input);
    const plan = value(planCampaignCarry(input));
    expect(plan.retirementRequired).toBe(false);
    expect(plan.retiredActorIds).toEqual([0, 1]);
    expect(plan.entities![0].record.slice(3, 6)).toEqual([8, 0, 2]);
    expect(plan.entities![1].record.slice(0, 3)).toEqual([0, 0, 4]);
    expect(plan.entities![1].record.slice(3, 6)).toEqual([33, 44, 0]);
    for (const id of [0, 1]) {
      expect(plan.nativeActors![id][6]).toBe(0);
      expect(plan.nativeActors![id][112] & 1).toBe(0);
      expect(plan.nativeActors![id].slice(196)).toEqual([0, 0, 0, 0]);
    }
    expect(input).toEqual(before);
  });
  it("rolls back earlier unlink projections on a late stale neighbour", () => {
    const input = mixedCell();
    input.nativeActors![1][0] = 17;
    const before = structuredClone(input);
    expect(planCampaignCarry(input)).toEqual({
      ok: false,
      reason: "stale-carry-actor-link",
      subject: 1,
    });
    expect(input).toEqual(before);
  });
});

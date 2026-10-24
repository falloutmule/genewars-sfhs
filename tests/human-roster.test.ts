import { describe, expect, it } from "vitest";
import {
  chooseHumanBlueprints,
  humanRosterView,
  admitHumanRosterCommand,
  initialHumanRosterPanel,
  issueHumanRosterPacket,
  unselectHumanBlueprint,
  type HumanRosterState,
  type HumanRosterServices,
} from "../src/sim/mechanics/human-roster";
import { put16, put32, u32 } from "../src/sim/campaign/bytes";

function fixture(owner = 0) {
  const s: HumanRosterState = {
    players: Array.from({ length: 4 }, (_, p) => {
      const raw = Array(1805).fill(0);
      raw[1] = p;
      return raw;
    }),
    specialists: Array.from({ length: 20 }, (_, slot) => {
      const native: (number | null)[] = Array.from(
        { length: 200 },
        (_, i) => (i * 37 + slot) & 255,
      );
      native.fill(null, 31, 39);
      native.fill(null, 176, 180);
      native.fill(null, 192, 200);
      native[6] = 0;
      native[24] = Math.floor(slot / 5);
      put16(native as number[], 15, slot);
      return { native, blueprint: null };
    }),
    buildings: Array.from({ length: 256 }, () => Array(67).fill(0)),
    missionPrefix: Array(0x355e).fill(0),
  };
  s.missionPrefix[0x1ebd] = 15;
  const raw = s.players[owner];
  const bp = (index: number, skill = 60, category = 0, style = 0) => {
    const at = 0x16 + index * 36;
    raw.fill(0, at, at + 36);
    raw[at] = 65 + index;
    raw[at + 21] = style;
    raw[at + 22] = category;
    raw[at + 23] = skill & 255;
    raw[at + 25] = 50;
    raw[at + 26] = 40;
    return at;
  };
  const services: HumanRosterServices = {
    createSpecialist(state, q) {
      const e = state.specialists[q.slot],
        n = e.native;
      n[6] = 3;
      n[24] = q.player;
      n[112] = 255;
      put16(n as number[], 15, q.slot);
      e.blueprint = { player: q.player, index: q.blueprint };
      return { ...q };
    },
  };
  return { s, raw, bp, owner, services };
}
describe("human20AE0/21700 and7/8/10", () => {
  it("ranks signed skills across styles, retains earlier ties, and excludes both runtime bits and signed-dead health", () => {
    const f = fixture();
    [60, 60, 80, 127, -1, 90, 100].forEach((v, i) => f.bp(i, v, 0, i % 4));
    f.raw[0x16 + 5 * 36 + 32] = 2;
    f.raw[0x16 + 6 * 36 + 26] = 128;
    f.bp(31, 70);
    expect(chooseHumanBlueprints(f.s, 0, 0)).toEqual([3, 2, 31, 0]);
    expect(chooseHumanBlueprints(f.s, 0, 1)).toEqual([null, null, null, null]);
    f.raw[0x16 + 3 * 36 + 32] = 1;
    expect(chooseHumanBlueprints(f.s, 0, 0)).toEqual([2, 31, 0, 1]);
  });
  it("projects actual16 rank slots and mission role mask without AI progress or quota gates", () => {
    const f = fixture();
    f.bp(0, 40, 1);
    f.bp(1, 50, 3);
    f.s.missionPrefix[0x1ebd] = 2;
    const before = structuredClone(f.s),
      v = humanRosterView(f.s, 0);
    expect(v.cards).toHaveLength(16);
    expect(v.cards.find((c) => c.blueprintIndex === 0)).toMatchObject({
      category: 1,
      rank: 0,
      canSelect: true,
    });
    expect(v.cards.find((c) => c.blueprintIndex === 1)).toMatchObject({
      canSelect: false,
      reason: "Role unavailable in this mission",
    });
    expect(
      admitHumanRosterCommand(f.s, 0, {
        type: "roster-select",
        blueprintIndex: 0,
      }).accepted,
    ).toBe(true);
    expect(f.s).toEqual(before);
  });
  it("rejects a fifth-ranked card and a full human roster before a factory call", () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) f.bp(i, 50 - i);
    expect(
      admitHumanRosterCommand(f.s, 0, {
        type: "roster-select",
        blueprintIndex: 4,
      }).accepted,
    ).toBe(false);
    for (let i = 0; i < 5; i++)
      issueHumanRosterPacket(
        f.s,
        0,
        { type: "roster-select", blueprintIndex: i },
        f.services,
      );
    expect(humanRosterView(f.s, 0).cards.every((c) => !c.canSelect)).toBe(true);
    expect(
      issueHumanRosterPacket(
        f.s,
        0,
        { type: "roster-select", blueprintIndex: 4 },
        {},
      ).created,
    ).toBeNull();
  });
  it("sets the BP bit before4FD30, appends actual first-free global slot, and leaves funds/retained fields untouched", () => {
    const f = fixture(2),
      at = f.bp(3);
    put32(f.raw, at + 32, 0x80604000);
    put32(f.raw, 0x4a3, 0xabcdef12);
    const native = f.s.specialists[10].native,
      untouched = native[150],
      raw = f.raw;
    const result = issueHumanRosterPacket(
      f.s,
      2,
      { type: "roster-select", blueprintIndex: 3 },
      {
        createSpecialist(s, q) {
          expect(s.players[2][at + 32] & 1).toBe(1);
          expect(s.players[2][3]).toBe(0);
          return f.services.createSpecialist!(s, q);
        },
      },
    );
    expect(result).toMatchObject({ packet: 7, created: 10, removed: [] });
    expect(f.raw).toBe(raw);
    expect(f.s.specialists[10].native).toBe(native);
    expect([f.raw[3], f.raw[4], native[112], native[150]]).toEqual([
      1,
      10,
      254,
      untouched,
    ]);
    expect(u32(f.raw, at + 32)).toBe(0x80604001);
    expect(u32(f.raw, 0x4a3)).toBe(0xabcdef12);
  });
  it("removes waiting roster metadata without death, cancellation, BP deletion or list-tail clearing", () => {
    const f = fixture();
    const at = f.bp(0);
    f.bp(1);
    issueHumanRosterPacket(
      f.s,
      0,
      { type: "roster-select", blueprintIndex: 0 },
      f.services,
    );
    issueHumanRosterPacket(
      f.s,
      0,
      { type: "roster-select", blueprintIndex: 1 },
      f.services,
    );
    put32(f.raw, at + 32, 0x80402003);
    f.raw[21] = 29;
    const native = f.s.specialists[0].native,
      prior = native.slice(),
      link = f.s.specialists[0].blueprint;
    expect(unselectHumanBlueprint(f.s, 0, 0, {})).toBe(0);
    expect([
      f.raw[3],
      f.raw[4],
      f.raw[5],
      f.raw[at],
      f.raw[at + 26],
      f.raw[21],
    ]).toEqual([1, 1, 1, 65, 40, 29]);
    expect(u32(f.raw, at + 32)).toBe(0x80402000);
    expect(native[6]).toBe(0);
    expect(f.s.specialists[0].blueprint).toBe(link);
    prior[6] = 0;
    prior.fill(null, 196, 200);
    expect(native).toEqual(prior);
  });
  it("searches inactive retained C0 before later active slots and refuses unknown prior links", () => {
    const f = fixture();
    f.bp(0);
    f.raw[3] = 1;
    f.raw[4] = 1;
    f.s.specialists[0].blueprint = { player: 0, index: 0 };
    f.s.specialists[1].blueprint = { player: 0, index: 0 };
    f.s.specialists[1].native[6] = 3;
    expect(unselectHumanBlueprint(f.s, 0, 0, {})).toBe(0);
    expect(f.s.specialists[1].native[6]).toBe(3);
    const other = fixture();
    other.bp(1);
    expect(() => unselectHumanBlueprint(other.s, 0, 1, {})).toThrow(
      "retained C0",
    );
    expect(
      unselectHumanBlueprint(other.s, 0, 1, { inactiveBlueprint: () => null }),
    ).toBeNull();
  });
  it("uses landing-kind498 for human launch, while cooldown499 is irrelevant", () => {
    const f = fixture();
    f.bp(0);
    issueHumanRosterPacket(
      f.s,
      0,
      { type: "roster-select", blueprintIndex: 0 },
      f.services,
    );
    f.s.specialists[0].native[113] = 0;
    put32(f.raw, 0x499, 0xffffffff);
    expect(humanRosterView(f.s, 0).canDeploy).toBe(true);
    f.raw[0x498] = 5;
    expect(humanRosterView(f.s, 0).deployReason).toContain("landing reference");
    f.raw[0x498] = 0;
    f.s.specialists[0].native[113] = 4;
    expect(humanRosterView(f.s, 0).pending[0].canDeselect).toBe(false);
    expect(humanRosterView(f.s, 0).canDeploy).toBe(true);
  });
  it("admits allied associated buildings with flags5 and rejects0x40/0x100 without borrowing AI gates", () => {
    const f = fixture();
    f.bp(0);
    issueHumanRosterPacket(
      f.s,
      0,
      { type: "roster-select", blueprintIndex: 0 },
      f.services,
    );
    const n = f.s.buildings[64];
    n[6] = 4;
    n[24] = 1;
    n[45] = 5;
    put16(n as number[], 49, 5);
    put16(n as number[], 7, 1200);
    put16(n as number[], 9, 3300);
    expect(humanRosterView(f.s, 0, 64).canDeploy).toBe(false);
    f.raw[0x6e5] = 2;
    expect(humanRosterView(f.s, 0, 64).canDeploy).toBe(false);
    f.s.players[1][0x6e5] = 1;
    expect(humanRosterView(f.s, 0, 64).buildingChoices).toEqual([
      {
        slot: 64,
        owner: 1,
        point: [1200, 3300],
        canDeploy: true,
        reason: null,
      },
    ]);
    expect(humanRosterView(f.s, 0, 64).canDeploy).toBe(true);
    for (const flags of [1, 4, 0x45, 0x105]) {
      put16(n as number[], 49, flags);
      const view = humanRosterView(f.s, 0, 64);
      expect(view.canDeploy).toBe(false);
      expect(view.buildingChoices).toHaveLength(1);
      expect(view.buildingChoices[0].canDeploy).toBe(false);
    }
    put16(n as number[], 49, 5);
    n[45] = 0;
    expect(humanRosterView(f.s, 0).buildingChoices).toEqual([]);
  });
  it("executes numeric10one even with zero pending, preserving a false landing result", () => {
    const f = fixture();
    let calls = 0;
    expect(humanRosterView(f.s, 0).canDeploy).toBe(false);
    const r = issueHumanRosterPacket(
      f.s,
      0,
      { type: "roster-deploy", deployment: 1, associatedBuilding: null },
      {
        createLanding(_s, q) {
          calls++;
          expect(q.associatedBuilding).toBeNull();
          return false;
        },
      },
    );
    expect(calls).toBe(1);
    expect(r).toMatchObject({ landingRequested: true, landingCreated: false });
  });
  it("numeric10zero scans ascending active rows and skips ready or landing actors", () => {
    const f = fixture();
    for (let i = 0; i < 4; i++) {
      f.bp(i);
      issueHumanRosterPacket(
        f.s,
        0,
        { type: "roster-select", blueprintIndex: i },
        f.services,
      );
    }
    for (let i = 0; i < 4; i++)
      put16(f.s.specialists[i].native as number[], 112, 0);
    put16(f.s.specialists[1].native as number[], 112, 1);
    put16(f.s.specialists[2].native as number[], 112, 0x400);
    const r = issueHumanRosterPacket(
      f.s,
      0,
      { type: "roster-deploy", deployment: 0, associatedBuilding: null },
      {},
    );
    expect(r.removed).toEqual([0, 3]);
    expect(f.raw.slice(3, 8)).toEqual([2, 1, 2, 3, 3]);
    expect([
      f.s.specialists[1].native[6],
      f.s.specialists[2].native[6],
    ]).toEqual([3, 3]);
  });
  it("does not accept an actor factory that replaces its native image", () => {
    const f = fixture();
    f.bp(0);
    expect(() =>
      issueHumanRosterPacket(
        f.s,
        0,
        { type: "roster-select", blueprintIndex: 0 },
        {
          createSpecialist(s, q) {
            f.services.createSpecialist!(s, q);
            s.specialists[q.slot].native = s.specialists[q.slot].native.slice();
            return q;
          },
        },
      ),
    ).toThrow("afterimage");
  });
  it("packet9 writes exactly the source point words and has no landing or funds gate", () => {
    const f = fixture();
    f.raw[0x498] = 5;
    const before = f.raw.slice();
    expect(
      admitHumanRosterCommand(f.s, 0, {
        type: "roster-target",
        point: [32767, 7],
      }).accepted,
    ).toBe(true);
    const result = issueHumanRosterPacket(
      f.s,
      0,
      { type: "roster-target", point: [-32768, 32767] },
      {},
    );
    expect(result.packet).toBe(9);
    before.splice(9, 4, 0, 128, 255, 127);
    expect(f.raw).toEqual(before);
    expect(humanRosterView(f.s, 0).target).toEqual([-32768, 32767]);
  });
  it("initial setup uses signed progress/special/module/current-child gates and grants no active reopen", () => {
    const f = fixture(),
      c = {
        flags: 0x3a,
        module: "campaign185DEF" as const,
        currentPanelEmpty: true,
      };
    expect(initialHumanRosterPanel(f.s, 0, c).open).toBe(false);
    f.raw[0x6e7] = 4;
    expect(initialHumanRosterPanel(f.s, 0, c).open).toBe(true);
    f.raw[0x6e7] = 128;
    expect(initialHumanRosterPanel(f.s, 0, c).open).toBe(false);
    expect(initialHumanRosterPanel(f.s, 0, { ...c, flags: 0 }).open).toBe(true);
    expect(
      initialHumanRosterPanel(f.s, 0, {
        ...c,
        flags: 0,
        currentPanelEmpty: false,
      }).open,
    ).toBe(false);
    expect(
      initialHumanRosterPanel(f.s, 0, { ...c, flags: 0, module: "other" }).open,
    ).toBe(false);
    put32(f.s.missionPrefix, 0x1ec2, 0x80000000);
    expect(initialHumanRosterPanel(f.s, 0, { ...c, flags: 0 }).open).toBe(
      false,
    );
  });
});

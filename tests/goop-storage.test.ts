import { describe, expect, it } from "vitest";
import {
  allocateStagedGoopStorage,
  planGoopStorageAllocation,
  type GoopStorageRules,
} from "../src/sim/mechanics/goop-storage";
import type { BuildingNative } from "../src/sim/mechanics/building-native";

const rules: GoopStorageRules = {
  extractor: 11,
  store4: [7, 14, 21],
  store13: [9, 18, 27],
  unusedGoopWarningTicks: 17,
};
function put(n: BuildingNative, at: number, value: number) {
  n[at] = value & 255;
  n[at + 1] = (value >>> 8) & 255;
}
function put32(n: BuildingNative, at: number, value: number) {
  put(n, at, value);
  put(n, at + 2, value >>> 16);
}
function word(n: BuildingNative, at: number) {
  return n[at]! | (n[at + 1]! << 8);
}
function dword(n: BuildingNative, at: number) {
  return word(n, at) | (word(n, at + 2) << 16);
}
function fixture(goop = 30, count = 3, owner = 0) {
  const records: BuildingNative[] = Array.from({ length: 256 }, () => {
    const n: BuildingNative = Array(67).fill(77);
    n[6] = 0;
    n.fill(null, 31, 39);
    return n;
  });
  const player: BuildingNative = Array(1805).fill(0);
  player[0x4a1] = owner;
  player[0x4a2] = count;
  put32(player, 0x4a7, goop);
  const add = (offset: number, selector: number, grade = 0, flags = 5) => {
    const n = records[owner * 64 + offset];
    n[6] = 4;
    n[45] = selector;
    n[46] = grade;
    put(n, 49, flags);
    put32(n, 54, 123456 + offset);
    return n;
  };
  add(0, 4);
  add(2, 11);
  add(3, 13);
  return { records, player, add };
}
function allocate(f: ReturnType<typeof fixture>, current = 0) {
  const r = allocateStagedGoopStorage(f.records, f.player, current, rules);
  if (!r.ok) throw new Error(r.reason);
  return r.receipt;
}
describe("source437A0 storage allocation", () => {
  it("allocates actual ascending slots across gaps and discards only real excess", () => {
    const f = fixture(),
      r = allocate(f);
    expect(r.visitedSlots).toEqual([0, 1, 2, 3]);
    expect(r.writes.map((w) => [w.slot, w.value])).toEqual([
      [0, 7],
      [2, 11],
      [3, 9],
    ]);
    expect(r.goopBefore).toBe(30);
    expect(r.goopAfter).toBe(27);
    expect(r.discarded).toBe(3);
    expect(dword(f.player, 0x4a7)).toBe(27);
    expect(word(f.player, 0x5f0)).toBe(17);
    expect(r.noticeRequested).toBe(true);
    expect(dword(f.records[0], 54)).toBe(7);
    expect(dword(f.records[2], 54)).toBe(11);
    expect(dword(f.records[3], 54)).toBe(9);
  });
  it("stops immediately when GOOP reaches0 and retains every later store value", () => {
    const f = fixture(7),
      before = structuredClone(f.records);
    const r = allocate(f);
    expect(r.visitedSlots).toEqual([0]);
    expect(r.activeCountRemaining).toBe(2);
    expect(r.discarded).toBe(0);
    expect(f.records[2]).toEqual(before[2]);
    expect(f.records[3]).toEqual(before[3]);
    expect(r.warningWrite).toBeNull();
  });
  it("GOOP0/negative does not clear retained stores, read unknown warning bytes or emit a notice", () => {
    for (const goop of [0, -1, -2147483648]) {
      const f = fixture(goop);
      f.player[0x5f0] = null;
      const before = structuredClone(f.records);
      const r = allocate(f);
      expect(f.records).toEqual(before);
      expect(r.visitedSlots).toEqual([]);
      expect(r.goopAfter).toBe(goop);
      expect(r.noticeRequested).toBe(false);
    }
  });
  it("ignores completion/power/0100 while honoring disabled0040 and collapse0800 distinctly", () => {
    const f = fixture(100, 4);
    f.add(0, 4, 1, 0);
    f.add(1, 13, 1, 0x100);
    f.add(2, 11, 0, 0x40);
    f.add(3, 4, 2, 0x840);
    const retained = f.records[3].slice();
    const r = allocate(f);
    expect(r.writes.map((w) => [w.slot, w.value, w.cause])).toEqual([
      [0, 14, "allocated"],
      [1, 18, "allocated"],
      [2, 0, "zero-capacity"],
    ]);
    expect(f.records[3]).toEqual(retained);
    expect(r.retainedCollapsedSlots).toEqual([3]);
    expect(r.goopAfter).toBe(32);
  });
  it("does not read or fabricate a collapsed unknown54 dword", () => {
    const f = fixture(5, 1);
    f.add(0, 4, 0, 0x800);
    f.records[0].fill(null, 54, 58);
    const r = allocate(f);
    expect(r.retainedCollapsedSlots).toEqual([0]);
    expect(f.records[0].slice(54, 58)).toEqual([null, null, null, null]);
    expect(dword(f.player, 0x4a7)).toBe(0);
  });
  it("overwrites an unknown54 dword only when source establishes its allocated/zero-capacity value", () => {
    for (const flags of [5, 0x40]) {
      const f = fixture(5, 1);
      f.add(0, 4, 0, flags);
      f.records[0].fill(null, 54, 58);
      allocate(f);
      expect(dword(f.records[0], 54)).toBe(flags === 5 ? 5 : 0);
    }
  });
  it("counts every nonzero source record, including nonstores, and honors the saved active count", () => {
    const f = fixture(20, 2);
    f.add(0, 0);
    f.add(2, 4);
    const before = f.records[3].slice();
    const r = allocate(f);
    expect(r.visitedSlots).toEqual([0, 1, 2]);
    expect(r.writes.map((w) => w.slot)).toEqual([2]);
    expect(f.records[3]).toEqual(before);
    expect(r.discarded).toBe(13);
  });
  it("uses the actual owner partition and issues speech/UI only for current player", () => {
    const f = fixture(30, 3, 2);
    const r = allocate(f, 0);
    expect(r.visitedSlots).toEqual([128, 129, 130, 131]);
    expect(r.owner).toBe(2);
    expect(r.noticeRequested).toBe(false);
    expect(word(f.player, 0x5f0)).toBe(17);
  });
  it("retains a nonzero warning and repeats the source notice branch when its value is exactly the original trigger", () => {
    for (const warning of [4, 17, -1]) {
      const f = fixture();
      put(f.player, 0x5f0, warning);
      const r = allocate(f);
      expect(word(f.player, 0x5f0)).toBe(warning & 65535);
      expect(r.warningWrite).toBeNull();
      expect(r.noticeRequested).toBe(warning === 17);
    }
  });
  it("uses unsigned grade bytes in the original linear capacity formula", () => {
    const f = fixture(5000, 1);
    f.add(0, 4, 255);
    const r = allocate(f);
    expect(r.writes[0].value).toBe(256 * 7);
    expect(r.goopAfter).toBe(256 * 7);
  });
  it("uses a signed saved active count and does not repair a negative/zero value", () => {
    for (const count of [0, 128, 255]) {
      const f = fixture(30, count),
        before = structuredClone(f.records);
      const r = allocate(f);
      expect(f.records).toEqual(before);
      expect(r.activeCountBefore).toBe((count << 24) >> 24);
      expect(r.discarded).toBe(30);
    }
  });
  it("rolls back all planned writes on a late unknown warning, unknown slot or pool overrun", () => {
    const f = fixture();
    f.player[0x5f0] = null;
    let before = structuredClone({ records: f.records, player: f.player });
    expect(allocateStagedGoopStorage(f.records, f.player, 0, rules).ok).toBe(
      false,
    );
    expect({ records: f.records, player: f.player }).toEqual(before);
    f.player[0x5f0] = 0;
    f.records[2][45] = null;
    before = structuredClone({ records: f.records, player: f.player });
    expect(allocateStagedGoopStorage(f.records, f.player, 0, rules).ok).toBe(
      false,
    );
    expect({ records: f.records, player: f.player }).toEqual(before);
    const tail = fixture(30, 2, 3);
    tail.records[194][6] = tail.records[195][6] = 0;
    const snapshot = structuredClone(tail.records);
    expect(
      allocateStagedGoopStorage(tail.records, tail.player, 0, rules),
    ).toEqual({
      ok: false,
      reason: "goop-storage-active-count-overruns-native-pool",
    });
    expect(tail.records).toEqual(snapshot);
  });
  it("plans without mutation and applies only54/playerGOOP/warning writes while retaining aliases", () => {
    const f = fixture(),
      n = f.records[0],
      p = f.player,
      before = structuredClone({ records: f.records, player: p });
    const planned = planGoopStorageAllocation(f.records, p, 0, rules);
    expect(planned.ok).toBe(true);
    expect({ records: f.records, player: p }).toEqual(before);
    allocate(f);
    expect(f.records[0]).toBe(n);
    expect(f.player).toBe(p);
    for (let slot = 0; slot < 256; slot++)
      for (let at = 0; at < 67; at++)
        if (at < 54 || at >= 58)
          expect(f.records[slot][at]).toBe(before.records[slot][at]);
    for (let at = 0; at < 1805; at++)
      if (!(at >= 0x4a7 && at < 0x4ab) && !(at >= 0x5f0 && at < 0x5f2))
        expect(p[at]).toBe(before.player[at]);
  });
  it("JSON save continuation preserves visited order, warning and retained later native54", () => {
    const f = fixture(7);
    allocate(f);
    const saved = JSON.parse(
      JSON.stringify({ records: f.records, player: f.player }),
    );
    put32(f.player, 0x4a7, 12);
    put32(saved.player, 0x4a7, 12);
    const one = allocateStagedGoopStorage(f.records, f.player, 0, rules),
      two = allocateStagedGoopStorage(saved.records, saved.player, 0, rules);
    expect(two).toEqual(one);
    expect(saved).toEqual({ records: f.records, player: f.player });
  });
});

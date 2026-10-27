import { expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { createCampaign } from "../src/sim/campaign/world";
import { campaignPunishmentServices } from "../src/sim/campaign/punishment-adapter";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { createNativeBuilding } from "../src/sim/mechanics/building-native";
import { put16 } from "../src/sim/campaign/bytes";
import { refreshPunishmentTarget } from "../src/sim/mechanics/ethereal-punishment";
import type { EtherealContext } from "../src/sim/mechanics/ethereal";

it("follows retained pool coordinates after specialist removal without exposing a live target", () => {
  const w = createCampaign(campaignFixture(), "punishment-host"),
    parent = w.ethereals.records[0],
    unit = w.specialists.records[0],
    services = campaignPunishmentServices(w, {
      cancelWork: () => {}, removeSpecialist: () => {}, damageBuilding: () => {},
    });
  put16(unit as number[], 7, 12345);
  put16(unit as number[], 9, 23456);
  unit[6] = 0;
  parent.native[0x52] = 3;
  put16(parent.native as number[], 0x50, 0);
  parent.native[0x4f] = 0;
  parent.native[0x49] = 0x14;
  parent.native[0x4a] = 0;
  expect(services.resolve(3, 0)).toBeNull();
  expect(services.followingPosition!(3, 0)).toEqual([12345, 23456]);
  refreshPunishmentTarget(parent, { frame: 0, punishment: services } as EtherealContext);
  expect(parent.native.slice(11, 15)).toEqual([57, 48, 160, 91]);
  expect(unit[6]).toBe(0);
  expect(() => services.followingPosition!(3, -1)).toThrow(/fixed pool/);
});

it("queries actual signed specialist/building health and retains a lethal animation's positive health", () => {
  const w = createCampaign(campaignFixture(), "punishment-host"),
    parent = w.ethereals.records[0];
  parent.native[24] = 0;
  const built = createNativeBuilding(w.buildingNative[0], {
    slot: 0,
    owner: 0,
    selector: 11,
    position: [8192, 8192],
    ground: 2048,
    shade: 0,
  });
  if (!built.ok) throw Error(built.reason);
  w.buildingNative[0] = built.value;
  put16(built.value as number[], 43, 80);
  insertSpatial(w.spatial, w.terrain, "source:2:0", 32 * 128 + 32);
  insertSpatial(w.spatial, w.terrain, "source:3:0", 32 * 128 + 32);
  const services = campaignPunishmentServices(w, {
      cancelWork: () => {},
      removeSpecialist: () => {},
      damageBuilding: () => {},
    }),
    query = {
      center: [8192, 8192] as [number, number],
      radius: 2048 as const,
      points: [[8192, 8192] as [number, number]],
      stepX: 256 as const,
      stepY: 256 as const,
    };
  const binding = w.specialists.bindings[0]!,
    offset = 22 + binding.blueprintIndex * 36 + 26;
  expect(services.nearby(parent, query)[3]?.index).toBe(0);
  expect(services.nearby(parent, query)[4]?.health).toBe(80);
  w.specialists.records[0][85] = 4;
  expect(services.nearby(parent, query)[3]?.index).toBe(0);
  w.players[0].raw[offset] = 255;
  put16(built.value as number[], 43, 0);
  expect(services.nearby(parent, query)[3]).toBeNull();
  expect(services.nearby(parent, query)[4]).toBeNull();
  expect(services.resolve(3, 0)?.health).toBe(-1);
});
it("invokes destructive services on the same staged host and rejects an unavailable attack25 port", () => {
  const w = createCampaign(campaignFixture(), "punishment-host"),
    parent = w.ethereals.records[0],
    calls: unknown[] = [];
  const services = campaignPunishmentServices(w, {
    cancelWork: (s, i) => calls.push([s === w, "cancel", i]),
    removeSpecialist: (s, i) => calls.push([s === w, "remove", i]),
    damageBuilding: (s, i, amount, attacker) =>
      calls.push([s === w, "damage", i, amount, attacker]),
  });
  parent.native[6] = 8;
  put16(parent.native as number[], 15, 0);
  const target = services.resolve(3, 0)!;
  services.cancelUnitWork(parent, target);
  services.removeUnit(parent, target);
  services.damageBuilding(parent, { ...target, kind: 4 }, 10);
  expect(calls).toEqual([
    [true, "cancel", 0],
    [true, "remove", 0],
    [true, "damage", 0, 10, "source:7:0"],
  ]);
  expect(() => services.attack(parent, target)).toThrow(/attack25/);
});

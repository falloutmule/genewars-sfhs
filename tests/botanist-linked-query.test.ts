import { describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import {
  createCampaign,
  queueCampaign,
  stepCampaign,
  type CampaignWorld,
} from "../src/sim/campaign/world";
import { campaignBotanistContext } from "../src/sim/campaign/botanist-adapter";
import {
  planBotanistPlantCreation,
  stepBotanistRole,
} from "../src/sim/mechanics/botanist";
import { createStagedCampaignMulePlantCarrier } from "../src/sim/campaign/plant-carrier-adapter";
import { cleanupCampaignReferences } from "../src/sim/campaign/cleanup";
import {
  insertSpatial,
  unlinkSpatial,
  validateSpatial,
} from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { synchronizeCampaignPlantCounts } from "../src/sim/campaign/ecology-adapter";
import { readGeneticistMotion } from "../src/sim/mechanics/geneticist";
import { put16, put32, u16 } from "../src/sim/campaign/bytes";
import { worldCell } from "../src/sim/mechanics/terrain";
import { checksum } from "../src/sim/checksum";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";

/** Synthetic post-pickup precondition isolates actual67 callbacks and the
 * Botanist query. Full ordinary Mule pickup is covered by the hauling suite. */
function fixture() {
  const pack = campaignFixture();
  pack.missions[0].startup!.context.actorMask = 7;
  pack.assets.EFF = structuredClone(pack.assets.EFF);
  for (const [code, count] of [
    [8, 13],
    [60, 6],
    [61, 9],
    [67, 1],
  ] as const) {
    const eff = pack.assets.EFF,
      first = eff.frames!.length;
    for (let i = 0; i < count; i++)
      eff.frames!.push({
        ...structuredClone(eff.frames![0]),
        rawFlags: [0, 0, 0],
      });
    while (eff.animations!.length <= code)
      eff.animations!.push({ first: 0, last: 1, rawTrailingWord: 2 });
    eff.animations![code] = {
      first,
      last: first + count - 1,
      rawTrailingWord: count,
    };
  }
  pack.effectRules = {
    schemaVersion: 1,
    descriptors: Array.from({ length: 71 }, (_, code) => ({
      code,
      retirementMode: code === 67 || code === 68 ? 5 : 0,
      gravity: code === 67 || code === 68,
      priority: 1,
      childCode: null,
      movable: code === 67 || code === 68,
      waterResponse: code === 67 || code === 68,
    })),
    provenance: { executableSha256: "0".repeat(64), originalExecution: false },
  };
  for (const p of pack.ecologyRules!.plants) {
    p.growthDeltas.fill(2);
    p.opaqueBytes[16] = 6;
    p.retirementDelay = 8;
  }
  pack.ecologyRules!.corpseFriction = Array(8).fill(512);
  const seed = createCampaign(pack, "synthetic-botanist-linked-query");
  seed.players[0].progress = 1;
  seed.players[0].raw[0x6e7] = 1;
  const w = createCampaign(pack, seed.contentHash, 1, {
    players: seed.players,
    selectedPlayer: 0,
    world: seed.missionPrefix.slice(0x34ba, 0x3550),
    rngRing: seed.rng.ring,
  });
  w.phase = "active";
  w.frame = 0;
  w.tick = 0;
  for (const a of w.actors) {
    const n = w.specialists.records[a.id];
    put16(n as number[], 7, 8192 + a.id * 128);
    put16(n as number[], 9, 8192);
    put32(n as number[], 17, 8192);
    put32(n as number[], 39, 8192);
    put16(n as number[], 112, (u16(n as number[], 112) & 0xfbfe) | 1);
    n[22] = n[22]! & 247;
    a.ready = true;
    a.motion = readGeneticistMotion(n);
    a.goal = null;
    a.route = [];
    insertSpatial(
      w.spatial,
      w.terrain,
      `source:2:${a.id}`,
      worldCell(a.motion.x, a.motion.y),
    );
  }
  const actor = w.actors.find(
    (a) => w.players[a.owner].blueprints[a.blueprintIndex].category === 1,
  )!;
  if (!actor) throw Error("Synthetic actual Botanist constructor required");
  w.specialists.records[actor.id][114] = 10;
  put16(w.missionPrefix, 0x1c7c, 5000);
  put16(w.missionPrefix, 0x1c78, 100);
  put32(w.players[0].raw, 0x49d, 1);
  const services = {
    effectOptions: (_w: CampaignWorld) => ({
      gravity: 512,
      obstacleAt: () => false,
      destructionObstacle: () => null,
      cleanupReferences: cleanupCampaignReferences,
    }),
  };
  for (let index = 0; index < 2; index++) {
    const p = w.ecology.plants[index],
      plan = planBotanistPlantCreation(
        p.native,
        index,
        0,
        0,
        [8320 + index * 32, 8224],
        w.terrain,
      );
    Object.assign(p, {
      active: true,
      owner: 0,
      position: plan.position,
      selector: 0,
      growth: 4,
      flags: 4,
      plantFlags: 0,
      updateCounter: 0,
      retirement: 8,
      animation: 0,
      frame: 0,
      shade: plan.native[23]!,
      height: plan.height,
      native: plan.native,
    });
    p.native[48] = 8;
    insertSpatial(w.spatial, w.terrain, p.id, worldCell(...p.position));
  }
  w.ecology.plantCount = 2;
  w.ecology.ownerPlantCounts = [2, 0, 0, 0];
  synchronizeCampaignPlantCounts(w);
  synchronizeCampaignLinks(w);
  const p = w.ecology.plants[0],
    carrier = createStagedCampaignMulePlantCarrier(
      w,
      pack,
      {
        position: [...p.position],
        height: p.height,
        angles: [0, 0, 0],
        owner: 0,
        parameter: 0,
        delay: 0,
      },
      services.effectOptions(w),
    );
  if (!carrier) throw Error("Synthetic actual carrier67 factory required");
  //The already-established5D1C0 ordering: allocation, ignition, ref, flag, unlink.
  campaignBotanistContext(w, pack, services).ignitePlant!(w, 0, actor.id);
  put16(carrier.native as number[], 71, 0);
  carrier.native[73] = 2;
  p.native[46] = p.native[46]! | 16;
  p.plantFlags = p.native[46];
  unlinkSpatial(w.spatial, w.terrain, p.id);
  synchronizeCampaignLinks(w);
  const n = w.specialists.records[actor.id];
  function area() {
    n[85] = 10;
    n[88] = 1;
    n[126] = 0;
    n[112] = 1;
    n[114] = 10;
    put16(n as number[], 136, actor.motion.x);
    put16(n as number[], 138, actor.motion.y);
    put32(n as number[], 142, 1536 * 1536);
  }
  return {
    w,
    pack,
    services,
    index: actor.id,
    carrier: carrier.slot,
    area,
    context: () => campaignBotanistContext(w, pack, services),
  };
}

describe("Botanist actual linked plant domain", () => {
  it("ignores a real unlinked carrier plant while marking the linked plant in source order", () => {
    const f = fixture();
    f.area();
    const c = f.context();
    expect(c.linkedPlantCell!(f.w, 0)).toBeNull();
    expect(f.w.ecology.plants[0].native[6]).toBe(2);
    stepBotanistRole(f.w, f.index, c);
    expect(f.w.ecology.plants[0].native[46]).toBe(0x98);
    expect(f.w.ecology.plants[1].native[46]! & 2).toBe(2);
  });
  it("does not blanket-filter an attached flag when its plant is actually linked", () => {
    const f = fixture();
    f.area();
    const p = f.w.ecology.plants[1];
    p.native[46] = 16;
    p.plantFlags = 16;
    stepBotanistRole(f.w, f.index, f.context());
    expect(f.w.ecology.plants[1].native[46]).toBe(18);
  });
  it("retains strict coordinate-domain completeness for older contexts", () => {
    const f = fixture();
    f.area();
    const { linkedPlantCell: _membership, ...legacy } = f.context(),
      before = checksum(f.w);
    expect(() => stepBotanistRole(f.w, f.index, legacy)).toThrow(
      /complete actual shared-cell order/,
    );
    expect(checksum(f.w)).toBe(before);
  });
  it("still rejects an omitted linked plant or duplicate IDs and rolls back its partial scan/RNG", () => {
    for (const duplicate of [false, true]) {
      const f = fixture();
      f.area();
      const c = f.context(),
        order = c.cellOrder,
        before = checksum(f.w);
      c.cellOrder = (s, cell) => {
        const ids = order(s, cell);
        return duplicate && ids.length
          ? [...ids, ids[0]]
          : ids.filter((id) => id !== "source:1:1");
      };
      expect(() => stepBotanistRole(f.w, f.index, c)).toThrow(
        /complete actual shared-cell order/,
      );
      expect(checksum(f.w)).toBe(before);
    }
  });
  it("rejects wrong-cell membership and a listed unlinked plant rather than accepting a partial domain", () => {
    for (const badPose of [false, true]) {
      const f = fixture();
      f.area();
      const c = f.context(),
        before = checksum(f.w);
      if (badPose) {
        const actual = c.linkedPlantCell!;
        c.linkedPlantCell = (s, i) => {
          const cell = actual(s, i);
          return cell === null ? null : cell + 1;
        };
      } else {
        const order = c.cellOrder;
        c.cellOrder = (s, cell) =>
          cell === worldCell(...s.ecology.plants[0].position)
            ? [...order(s, cell), "source:1:0"]
            : order(s, cell);
      }
      expect(() => stepBotanistRole(f.w, f.index, c)).toThrow(
        /linked plant cell|unlinked or wrong-cell/,
      );
      expect(checksum(f.w)).toBe(before);
    }
  });
  it("runs real67 and an ordinary Botanist planting order through save continuation and sealed replay", () => {
    const f = fixture(),
      recording = recordCampaign(f.w, null),
      command = {
        type: "botanist-work" as const,
        actorId: f.index,
        task: 1 as const,
        point: [8192, 8192] as [number, number],
        selector: 0,
      };
    expect(queueCampaign(f.w, command).ok).toBe(true);
    recording.commands.push({ tick: f.w.tick, type: "command", command });
    let resumed: CampaignWorld | null = null;
    for (let i = 0; i < 12; i++) {
      stepCampaign(f.w, f.pack);
      if (resumed) stepCampaign(resumed, f.pack);
      expect(f.w.phase, JSON.stringify(f.w.notices.slice(-5))).toBe("active");
      if (i === 2)
        resumed = loadCampaign(
          saveCampaign(f.w, { paused: true, speed: 1, accumulator: 0 }),
          f.w.contentHash,
        ).world;
      if (resumed) expect(checksum(resumed)).toBe(checksum(f.w));
    }
    expect(f.w.powerEffects.slots[f.carrier].nativePrior![69]).toBe(67);
    expect(f.w.ecology.plants[0].active).toBe(true);
    expect(f.w.spatial.nodes["source:1:0"]).toBeUndefined();
    expect(f.w.specialists.records[f.index][126]).toBe(1);
    expect(f.w.specialists.records[f.index][112]! & 0x90).not.toBe(0);
    validateSpatial(f.w.spatial);
    expect(
      checksum(
        replayCampaign(
          sealCampaignReplay(recording, f.w),
          f.pack,
          f.w.contentHash,
        ),
      ),
    ).toBe(checksum(f.w));
  });
});

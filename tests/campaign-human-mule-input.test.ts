import { beforeAll, describe, expect, it } from "vitest";
import { campaignFixture } from "./fixtures/campaign";
import { speciesFixture } from "./fixtures/creature-species";
import {
  createCampaign,
  enterCampaign,
  stepCampaign,
  queueCampaign,
  CampaignCommandSchema,
  type CampaignCommand,
} from "../src/sim/campaign/world";
import { classifyCampaignHumanMuleTarget } from "../src/sim/campaign/human-creature-command-adapter";
import { initializeMuleNative } from "../src/sim/mechanics/genepod";
import { planBotanistPlantCreation } from "../src/sim/mechanics/botanist";
import { insertSpatial } from "../src/sim/campaign/spatial";
import { synchronizeCampaignLinks } from "../src/sim/campaign/entity-view";
import { put16, put32, i16 } from "../src/sim/campaign/bytes";
import { worldCell } from "../src/sim/mechanics/terrain";
import {
  saveCampaign,
  loadCampaign,
  recordCampaign,
  sealCampaignReplay,
  replayCampaign,
} from "../src/sim/campaign/persistence";
import { checksum } from "../src/sim/checksum";

/**Synthetic pools and a paused native runflag isolate the actual input pass.
 * Full material callbacks have separate ordinary-host tests. */
function fixture() {
  const pack = campaignFixture(),
    w = createCampaign(pack, "synthetic-human-mule-input");
  enterCampaign(w);
  for (let i = 0; i < 200; i++) stepCampaign(w, pack);
  expect(w.phase).toBe("active");
  const made = initializeMuleNative(
    w.creatureNative[0],
    w.rng,
    { slot: 0, owner: 0, position: [10000, 10000], quality: 50 },
    { terrain: w.terrain, tables: pack.rules!.tables },
  );
  if (!made.ok) throw Error(made.reason);
  const native = made.value.native;
  native[94] = 8;
  w.rng = made.value.rng;
  w.creatureNative[0] = native;
  w.ecology.mules.push({ id: "source:0:0", index: 0, native, pending: [] });
  put16(w.missionPrefix, 0x3550, w.ecology.mules.length);
  insertSpatial(w.spatial, w.terrain, "source:0:0", worldCell(10000, 10000));
  const p = w.ecology.plants[0],
    plan = planBotanistPlantCreation(
      p.native,
      0,
      4,
      0,
      [10400, 10000],
      w.terrain,
    );
  p.native.splice(0, p.native.length, ...plan.native);
  Object.assign(p, {
    active: true,
    owner: 4,
    position: plan.position,
    selector: 0,
    growth: 4,
    flags: 4,
    plantFlags: 0,
    updateCounter: 0,
    retirement: 0,
    animation: 0,
    frame: 0,
    shade: p.native[23],
    height: plan.height,
  });
  w.ecology.plantCount++;
  put16(w.missionPrefix, 0x3552, w.ecology.plantCount);
  insertSpatial(w.spatial, w.terrain, p.id, worldCell(...p.position));
  synchronizeCampaignLinks(w);
  w.flags &= ~4;
  return { w, pack };
}

describe("human Mule packets through campaign input/save/replay", () => {
  let initial: ReturnType<typeof fixture>;
  beforeAll(() => {
    initial = fixture();
  });
  it.each([1,3,11,22])("publishes species%i building combat and preserves pending save/replay",species=>{
    const {w,pack}=structuredClone(initial),profile=speciesFixture();
    Object.assign(pack.ecologyRules!,{speciesTraits:profile.rules.speciesTraits,attackChannels:profile.rules.attackChannels});
    pack.zoneRules!.speciesComponents=profile.components;
    w.creatureNative[0][122]=species;w.ecology.mules[0].native=w.creatureNative[0];
    const b:(number|null)[]=Array(67).fill(0);b.fill(null,31,39);b[6]=4;b[24]=1;b[45]=11;b[49]=1;
    put16(b as number[],15,64);put16(b as number[],7,12000);put16(b as number[],9,10000);put32(b as number[],17,2048);put16(b as number[],43,280);
    w.buildingNative[64]=b;w.buildings.push({id:1064,slot:64,owner:1,selector:11,x:12000,y:10000,grade:0,health:280,complete:true,energy:0});
    insertSpatial(w.spatial,w.terrain,'source:3:64',worldCell(12000,10000));synchronizeCampaignLinks(w);
    const command:CampaignCommand={type:'target-mule',muleIndex:0,target:{kind:4,index:64},mode:1},replay=recordCampaign(w,null);
    expect(classifyCampaignHumanMuleTarget(w,0,command.target,{force:false,bypassVisibility:false},pack)).toBe(1);
    expect(queueCampaign(w,command).ok).toBe(true);replay.commands.push({tick:w.tick,type:'command',command});
    const loaded=loadCampaign(saveCampaign(w,{paused:true,speed:1,accumulator:0}),w.contentHash).world;
    stepCampaign(w,pack);stepCampaign(loaded,pack);
    expect(w.phase,JSON.stringify(w.notices)).toBe('active');
    expect([w.creatureNative[0][120],w.creatureNative[0][94],i16(w.creatureNative[0] as number[],85),w.creatureNative[0][87]]).toEqual([1,1,64,4]);
    expect(checksum(loaded)).toBe(checksum(w));
    expect(checksum(replayCampaign(sealCampaignReplay(replay,w),pack,w.contentHash))).toBe(checksum(w));
  });
  it("retains producer mode, target reservations and real Stop through input-only iterations", () => {
    const { w, pack } = structuredClone(initial),
      ref = { kind: 2 as const, index: 0 },
      frame = w.frame;
    expect(
      classifyCampaignHumanMuleTarget(
        w,
        0,
        ref,
        { force: false, bypassVisibility: false },
        pack,
      ),
    ).toBe(5);
    const command: CampaignCommand = {
        type: "target-mule",
        muleIndex: 0,
        target: ref,
        mode: 5,
      },
      replay = recordCampaign(w, null);
    expect(queueCampaign(w, command).ok).toBe(true);
    replay.commands.push({ tick: w.tick, type: "command", command });
    const loaded = loadCampaign(
      saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
      w.contentHash,
    ).world;
    expect(loaded.pending[0].command).toEqual(command);
    stepCampaign(w, pack);
    stepCampaign(loaded, pack);
    expect(w.phase, JSON.stringify(w.notices)).toBe("active");
    expect(w.frame).toBe(frame);
    expect(checksum(loaded)).toBe(checksum(w));
    const n = w.creatureNative[0],
      point = w.ecology.plants[0].position;
    expect([n[120], n[95], n[87], i16(n as number[], 85)]).toEqual([
      5, 1, 2, 0,
    ]);
    expect([i16(n as number[], 110), i16(n as number[], 112)]).toEqual(point);
    expect(n[96]! & 0x18).toBe(0x18);
    expect(n[97]! & 0xc0).toBe(0x80);
    expect(w.ecology.plants[0].native[46]! & 4).toBe(4);
    const destination = [i16(n as number[], 11), i16(n as number[], 13)],
      stop: CampaignCommand = { type: "stop-mule", muleIndex: 0 };
    w.muleQueues[0] = [[12000, 12000]];
    //The queued waypoint is saved authoritative state, included in this replay.
    const stopReplay = recordCampaign(w, null);
    expect(queueCampaign(w, stop).ok).toBe(true);
    stopReplay.commands.push({ tick: w.tick, type: "command", command: stop });
    const stopping = loadCampaign(
      saveCampaign(w, { paused: true, speed: 1, accumulator: 0 }),
      w.contentHash,
    ).world;
    stepCampaign(w, pack);
    stepCampaign(stopping, pack);
    expect(w.creatureNative[0][120]).toBe(0);
    expect(w.creatureNative[0][96]! & 16).toBe(0);
    expect([
      i16(w.creatureNative[0] as number[], 11),
      i16(w.creatureNative[0] as number[], 13),
    ]).toEqual(destination);
    expect(w.muleQueues[0]).toEqual([]);
    expect(checksum(stopping)).toBe(checksum(w));
    expect(
      checksum(
        replayCampaign(sealCampaignReplay(stopReplay, w), pack, w.contentHash),
      ),
    ).toBe(checksum(w));
    //The complete target input replay ends at the prior, independently saved boundary.
    expect(
      checksum(
        replayCampaign(
          sealCampaignReplay(replay, loaded),
          pack,
          loaded.contentHash,
        ),
      ),
    ).toBe(checksum(loaded));
  });
  it("rejects foreign/dead actors and malformed retained packet references without mutation", () => {
    const { w } = structuredClone(initial),
      command = {
        type: "target-mule",
        muleIndex: 0,
        target: { kind: 2, index: 0 },
        mode: 5,
      };
    w.creatureNative[0][24] = 1;
    w.ecology.mules[0].native[24] = 1;
    const before = checksum(w);
    expect(queueCampaign(w, command).ok).toBe(false);
    expect(checksum(w)).toBe(before);
    expect(
      CampaignCommandSchema.safeParse({
        ...command,
        target: { kind: 3, index: 20 },
      }).success,
    ).toBe(false);
    expect(
      CampaignCommandSchema.safeParse({
        ...command,
        target: { kind: 5, index: 200 },
      }).success,
    ).toBe(false);
    expect(
      CampaignCommandSchema.safeParse({ ...command, mode: 7 }).success,
    ).toBe(false);
  });
  it("preserves command state when an unavailable source carrier mode rejects late", () => {
    const { w, pack } = structuredClone(initial),
      before = structuredClone({
        native: w.creatureNative,
        rng: w.rng,
        plants: w.ecology.plants,
        audio: w.audio,
      });
    w.muleQueues[0] = [[12000, 12000]];
    expect(
      queueCampaign(w, {
        type: "target-mule",
        muleIndex: 0,
        target: { kind: 2, index: 0 },
        mode: 3,
      }).ok,
    ).toBe(true);
    stepCampaign(w, pack);
    expect({
      native: w.creatureNative,
      rng: w.rng,
      plants: w.ecology.plants,
      audio: w.audio,
    }).toEqual(before);
    expect(w.muleQueues[0]).toEqual([[12000, 12000]]);
    expect(w.notices.at(-1)?.severity).toBe("warning");
    expect(w.phase).toBe("active");
  });
});

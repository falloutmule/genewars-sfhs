/** Native strategic command setup. All staged services retain source pointers. */
import type { Pack } from "../../content/types";
import type { CampaignWorld } from "./world";
import type {
  StrategicRoleCommand,
  StrategicRoleCommandReceipt,
} from "../mechanics/strategic-ai-specialists-state";
import {
  readSpecialistControlActor,
  cancelStagedGeneticistWork,
} from "../mechanics/geneticist";
import {
  campaignEngineerContext,
  cancelStagedCampaignEngineer,
} from "./engineer-adapter";
import { cancelStagedCampaignBotanist } from "./botanist-adapter";
import { cancelStagedCampaignShepherd } from "./shepherd-adapter";
import {
  consumeCampaignGeneticistReceipt,
  mirrorCampaignSpecialist,
  type CampaignSpecialistServices,
} from "./specialist-adapter";
import { put16, put32 } from "./bytes";

type Native = (number | null)[];
type Point = [number, number];
const integer = (v: number, lo: number, hi: number) =>
  Number.isInteger(v) && v >= lo && v <= hi;
function byte(n: readonly (number | null)[], at: number): number {
  const v = n[at];
  if (v == null || !integer(v, 0, 255))
    throw Error(`Uninitialized strategic role semantic byte ${at}`);
  return v;
}
const word = (n: readonly (number | null)[], at: number) =>
  ((byte(n, at) | (byte(n, at + 1) << 8)) << 16) >> 16;
function put(n: Native, at: number, value: number) {
  put16(n as number[], at, value);
}
function point(p: readonly number[]): asserts p is Point {
  if (p.length !== 2 || p.some((v) => !integer(v, -32768, 32767)))
    throw Error("Actual strategic role signed point required");
}
function held(w: CampaignWorld) {
  const specialists = w.specialists,
    records = specialists.records,
    bindings = specialists.bindings,
    natives = records.slice(),
    bindingRows = bindings.slice(),
    players = w.players,
    owners = players.slice(),
    raw = players.map((p) => p.raw),
    rng = w.rng,
    buildings = w.buildingNative,
    buildingRows = buildings.slice();
  return () => {
    if (
      w.specialists !== specialists ||
      specialists.records !== records ||
      specialists.bindings !== bindings ||
      records.length !== natives.length ||
      bindings.length !== bindingRows.length ||
      records.some((n, i) => n !== natives[i]) ||
      bindings.some((n, i) => n !== bindingRows[i]) ||
      w.players !== players ||
      players.length !== owners.length ||
      players.some((p, i) => p !== owners[i] || p.raw !== raw[i]) ||
      w.rng !== rng ||
      w.buildingNative !== buildings ||
      buildings.length !== buildingRows.length ||
      buildings.some((n, i) => n !== buildingRows[i])
    )
      throw Error(
        "Strategic role service replaced retained native/player/RNG identity",
      );
  };
}
function cancel(
  w: CampaignWorld,
  index: number,
  pack: Pack,
  services: CampaignSpecialistServices,
): void {
  const category = w.specialists.bindings[index]!.category;
  if (category === 0) cancelStagedCampaignEngineer(w, index, pack, services);
  else if (category === 1)
    cancelStagedCampaignBotanist(w, index, pack, services);
  else if (category === 2)
    consumeCampaignGeneticistReceipt(
      w,
      index,
      cancelStagedGeneticistWork(
        w,
        index,
        w.specialists.bindings[index]!.owner,
      ),
    );
  else if (category === 3) cancelStagedCampaignShepherd(w, index);
  else throw Error("Unsupported strategic role cancellation category");
}
/** Actual kind3 virtual84/1EE50. This preserves physical velocity. */
function stop(n: Native): void {
  put(n, 63, 0);
  put(n, 73, word(n, 73) & 0xefe8);
  n[84] = 0;
  n[22] = byte(n, 22) & 63;
}
function aim(n: Native, skill: number): void {
  put(n, 136, 0);
  put(n, 138, Math.trunc((skill * 362) / 100) + 150);
  put(n, 132, 0);
  put(n, 134, 0);
}
/**51960 consumes only the branch's semantic EBX/ECX arguments. Padding and
 * even an unused half of an argument word may remain explicitly null. */
function setup(w: CampaignWorld, request: StrategicRoleCommand): void {
  const a = readSpecialistControlActor(w, request.specialist),
    n = a.native,
    category = w.specialists.bindings[request.specialist]!.category,
    p = request.packet,
    task = byte(n, 126);
  const arg = () =>
    category < 2 || task === 14 || (category === 3 && task === 0)
      ? byte(p, 5)
      : word(p, 4);
  const kind = () =>
    category < 2 || task === 14 || (category === 3 && task === 0)
      ? byte(p, 4)
      : word(p, 6);
  if (task === 14) {
    put(n, 127, arg());
    n[129] = kind() & 255;
    return;
  }
  if (category === 0) {
    if (![0, 1, 4].includes(task))
      throw Error(`Strategic Engineer51960 task${task} is not implemented`);
    const value = arg();
    if (task === 0 && value !== 14) {
      if (!integer(value, 0, 13))
        throw Error("Actual Engineer construction selector required");
      n[131] = value;
      return;
    }
    const index = task === 0 ? kind() : value,
      building = w.buildingNative[index];
    if (!integer(index, 0, 255) || !building || building.length !== 67)
      throw Error("Actual strategic Engineer retained building slot required");
    //Source reads the retained slot, even if currently unoccupied.
    put(n, 127, word(building, 15));
    n[129] = byte(building, 6);
    if (task === 0) n[131] = 255;
    else if (task === 1) building[50] = byte(building, 50) | 16;
    else {
      put(building, 64, word(n, 15));
      building[66] = byte(n, 6);
      building[50] = byte(building, 50) | 4;
    }
    return;
  }
  if (category === 1) {
    if (![0, 1, 2].includes(task))
      throw Error(`Strategic Botanist51960 task${task} is not implemented`);
    put(n, 136, word(n, 92));
    put(n, 138, word(n, 94));
    if (task === 1) n[131] = arg();
    const radius =
      Math.trunc((a.skill * (task === 2 ? 768 : 1024)) / 100) +
      (task === 2 ? 768 : 512);
    put32(n as number[], 142, Math.imul(radius, radius));
    return;
  }
  if (category === 2) {
    if (task !== 0 && task !== 1)
      throw Error(`Strategic Geneticist51960 task${task} is not implemented`);
    put(n, 127, arg());
    n[129] = kind() & 255;
    if (n[129] === 1) aim(n, a.skill);
    return;
  }
  if (category === 3) {
    if (![0, 1, 2].includes(task))
      throw Error(`Strategic Shepherd51960 task${task} is not implemented`);
    if (task === 0) {
      n[139] = kind() & 255;
      put32(n as number[], 135, Math.trunc((a.skill * 1536) / 100) + 768);
      if (arg() === 0) {
        put(n, 131, word(n, 92));
        put(n, 133, word(n, 94));
      }
    } else {
      put(n, 127, arg());
      n[129] = kind() & 255;
      aim(n, a.skill);
    }
    return;
  }
  throw Error("Actual strategic category0..3 required");
}

/** Already-isolated command service, suitable for StrategicRoleCommandContext.
 * Source command dispatch does not test native112-bit0 or selectedPlayer.
 * Invariant failures throw: the enclosing host transaction must roll back. */
export function dispatchStagedCampaignStrategicRoleCommand(
  w: CampaignWorld,
  request: StrategicRoleCommand,
  pack: Pack,
  services: CampaignSpecialistServices,
): StrategicRoleCommandReceipt {
  if (
    !integer(request.player, 0, 3) ||
    !integer(request.specialist, 0, 19) ||
    !integer(request.source, 0, 0xffffffff) ||
    ![0x80fc0, 0x81080, 0x81150, 0x811a0].includes(request.routine) ||
    request.packet.length !== 11 ||
    request.packet.some((v) => v !== null && !integer(v, 0, 255))
  )
    throw Error("Actual strategic role request required");
  const a = readSpecialistControlActor(w, request.specialist),
    n = a.native,
    p = request.packet,
    check = held(w),
    index = word(p, request.routine === 0x80fc0 ? 4 : 0);
  if (a.owner !== request.player || index !== request.specialist)
    throw Error("Strategic role packet/native owner or identity differs");
  const receipt = (
    outcome: "installed" | "ignored",
  ): StrategicRoleCommandReceipt => ({
    routine: request.routine,
    player: request.player,
    specialist: request.specialist,
    outcome,
  });
  const release = () => {
    cancel(w, request.specialist, pack, services);
    check();
  };
  const resolve = (requested: Point): Point => {
    const origin: Point = [word(n, 7), word(n, 9)],
      c = campaignEngineerContext(w, pack, services),
      result = c.resolvePlacementPoint!(
        w,
        request.specialist,
        origin,
        requested,
      );
    check();
    point(result);
    return result;
  };
  if (request.routine === 0x81150) {
    n[87] = byte(n, 87) & 254;
    release();
    n[85] = 1;
    put32(n as number[], 104, 0);
  } else if (request.routine === 0x80fc0) {
    if (byte(n, 113) & 16) return receipt("ignored");
    n[87] = byte(n, 87) | 2;
    put(n, 92, word(p, 0));
    put(n, 94, word(p, 2));
    n[91] = 0;
    const next = resolve([word(n, 92), word(n, 94)]);
    put(n, 92, next[0]);
    put(n, 94, next[1]);
    put(n, 11, next[0]);
    put(n, 13, next[1]);
    if (byte(n, 130) !== 0 || byte(n, 87) & 1) {
      n[87] = byte(n, 87) & 254;
      release();
    }
  } else {
    n[87] = byte(n, 87) | 1;
    if (byte(n, 130) !== 0) release();
    n[126] = byte(p, 3);
    if (request.routine === 0x811a0) {
      put(n, 92, word(p, 6));
      put(n, 94, word(p, 8));
      const first = resolve([word(n, 92), word(n, 94)]);
      n[91] = 0;
      put(n, 92, first[0]);
      put(n, 94, first[1]);
      const second = resolve(first);
      n[90] = 0;
      put(n, 92, second[0]);
      put(n, 94, second[1]);
      put(n, 11, second[0]);
      put(n, 13, second[1]);
      n[87] = byte(n, 87) | 2;
      n[88] = byte(n, 88) | 2;
    }
    setup(w, request);
    n[130] = 1;
    if (request.routine === 0x811a0) n[87] = byte(n, 87) | 1;
    else if (byte(n, 85) === 8) {
      stop(n);
      n[88] = byte(n, 88) & 253;
    }
  }
  check();
  mirrorCampaignSpecialist(w, request.specialist);
  return receipt("installed");
}

/** Public outer transaction boundary. Call the staged export from an AI pass;
 * never replace that pass's held roots with an independently cloned wrapper. */
export function dispatchCampaignStrategicRoleCommand(
  w: CampaignWorld,
  request: StrategicRoleCommand,
  pack: Pack,
  services: CampaignSpecialistServices,
): StrategicRoleCommandReceipt {
  const staged = structuredClone(w),
    result = dispatchStagedCampaignStrategicRoleCommand(
      staged,
      request,
      pack,
      services,
    );
  if (result.outcome !== "ignored") Object.assign(w, staged);
  return result;
}

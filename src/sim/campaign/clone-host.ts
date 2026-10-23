/** Typed mutable campaign host roots, for complete outer host transactions.
 * Numeric buffers use slice; one memo preserves existing cross-root aliases.
 * This does not clone terrain, native pools, economy or other host roots. */
import type { CampaignActor, CampaignPlayer } from "./bootstrap";
import type { CampaignNotice } from "./world";
import type {
  ConstructionActor,
  ConstructionTask,
} from "../mechanics/construction";
import type { AudioState } from "../mechanics/audio";
import type { Blueprint } from "../mechanics/blueprints";
import type { SiteReservation } from "../mechanics/terrain";
export interface CampaignHostRoots {
  actors: CampaignActor[];
  builders: ConstructionActor[];
  players: CampaignPlayer[];
  notices: CampaignNotice[];
  audio: AudioState;
}
/** Clones the declared, serializable host shape. Alias preservation is based
 * on object identity, never actor IDs or equal values. The caller owns all
 * remaining mutable roots and the eventual transaction commit. */
export function cloneCampaignHostRoots(
  source: Readonly<CampaignHostRoots>,
): CampaignHostRoots {
  const seen = new Map<object, object>();
  const memo = <T extends object>(value: T, make: () => T): T => {
    const existing = seen.get(value);
    if (existing) return existing as T;
    const copy = make();
    seen.set(value, copy);
    return copy;
  };
  const numbers = <T extends number[]>(value: T): T =>
    memo(value, () => value.slice() as T);
  const array = <T>(value: T[], copy: (v: T) => T): T[] =>
    memo(value, () => value.map(copy));
  const flat = <T extends object>(value: T): T =>
    memo(value, () => ({ ...value }));
  const reservation = (value: SiteReservation): SiteReservation =>
    memo(value, () => ({
      ...value,
      anchor: numbers(value.anchor),
      cells: numbers(value.cells),
      vertices: numbers(value.vertices),
    }));
  const task = (value: ConstructionTask): ConstructionTask =>
    memo(value, () => ({
      ...value,
      point: numbers(value.point),
      requestedGoal: numbers(value.requestedGoal),
      goal: numbers(value.goal),
      route: array(value.route, numbers),
      reservation: value.reservation ? reservation(value.reservation) : null,
    }));
  const actor = (value: CampaignActor): CampaignActor =>
    memo(value, () => ({
      ...value,
      motion: flat(value.motion),
      animation: flat(value.animation),
      goal: value.goal ? numbers(value.goal) : null,
      route: array(value.route, numbers),
      orders: array(value.orders, (order) =>
        memo(order, () => ({ ...order, point: numbers(order.point) })),
      ),
    }));
  const builder = (value: ConstructionActor): ConstructionActor =>
    memo(value, () => ({
      ...value,
      motion: flat(value.motion),
      animation: flat(value.animation),
      task: value.task ? task(value.task) : null,
    }));
  const blueprint = (value: Blueprint): Blueprint =>
    memo(value, () => ({ ...value, unresolved: flat(value.unresolved) }));
  const player = (value: CampaignPlayer): CampaignPlayer =>
    memo(value, () => ({
      ...value,
      raw: numbers(value.raw),
      completed: numbers(value.completed),
      blueprints: array(value.blueprints, blueprint),
    }));
  return {
    actors: array(source.actors, actor),
    builders: array(source.builders, builder),
    players: array(source.players, player),
    notices: array(source.notices, flat),
    audio: memo(source.audio, () => ({
      ...source.audio,
      requests: array(source.audio.requests, flat),
    })),
  };
}

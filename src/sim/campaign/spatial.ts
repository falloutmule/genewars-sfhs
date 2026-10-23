import type { SourcePoolRegistry, SourceEntityId } from "./source-pools";
import type { TerrainState } from "../mechanics/terrain";
export interface SpatialNode {
  id: SourceEntityId;
  family: number;
  index: number;
  cell: number;
  previous: SourceEntityId | null;
  next: SourceEntityId | null;
}
export interface SpatialState {
  heads: (SourceEntityId | null)[];
  nodes: Record<string, SpatialNode>;
}
/** Transaction copy: map heads and every mutable chain node are independent. */
export function cloneSpatial(before: SpatialState): SpatialState {
  const nodes: Record<string, SpatialNode> = {};
  for (const [id, node] of Object.entries(before.nodes))
    nodes[id] = { ...node };
  return { ...before, heads: before.heads.slice(), nodes };
}
export function createSpatial(registry: SourcePoolRegistry): SpatialState {
  const nodes: Record<string, SpatialNode> = {};
  for (const e of registry.entities)
    nodes[e.id] = {
      id: e.id,
      family: e.family,
      index: e.index,
      cell: e.cell[1] * 128 + e.cell[0],
      previous: e.links.previous.kind === "entity" ? e.links.previous.id : null,
      next: e.links.next.kind === "entity" ? e.links.next.id : null,
    };
  const s = { heads: [...registry.mapHeads], nodes };
  validateSpatial(s);
  return s;
}
function head(
  s: SpatialState,
  t: TerrainState,
  cell: number,
  id: SourceEntityId | null,
) {
  s.heads[cell] = id;
  const p = cell * 14,
    n = id ? s.nodes[id] : null;
  if (n) {
    t.bytes[p + 6] = n.index & 255;
    t.bytes[p + 7] = (n.index >> 8) & 255;
    t.bytes[p + 8] = n.family + 1;
  } else t.bytes[p + 8] = 0;
}
export function unlinkSpatial(
  s: SpatialState,
  t: TerrainState,
  id: SourceEntityId,
): void {
  const n = s.nodes[id];
  if (!n) throw new Error(`Missing spatial entity ${id}`);
  if (n.previous) {
    const p = s.nodes[n.previous];
    if (p?.next !== id) throw new Error("Broken previous spatial link");
    p.next = n.next;
  } else {
    if (s.heads[n.cell] !== id) throw new Error("Broken spatial map head");
    head(s, t, n.cell, n.next);
  }
  if (n.next) {
    const next = s.nodes[n.next];
    if (next?.previous !== id) throw new Error("Broken next spatial link");
    next.previous = n.previous;
  }
  delete s.nodes[id];
}
export function insertSpatial(
  s: SpatialState,
  t: TerrainState,
  id: SourceEntityId,
  cell: number,
): void {
  if (s.nodes[id]) throw new Error(`Duplicate spatial entity ${id}`);
  if (!Number.isInteger(cell) || cell < 0 || cell >= 16384)
    throw new Error("Invalid spatial map cell");
  const [, family, index] = id.split(":").map(Number),
    old = s.heads[cell];
  s.nodes[id] = { id, family, index, cell, previous: null, next: old };
  if (old) s.nodes[old].previous = id;
  head(s, t, cell, id);
}
export function moveSpatial(
  s: SpatialState,
  t: TerrainState,
  id: SourceEntityId,
  cell: number,
): void {
  if (s.nodes[id]?.cell === cell) return;
  if (s.nodes[id]) unlinkSpatial(s, t, id);
  insertSpatial(s, t, id, cell);
}
export function validateSpatial(s: SpatialState): void {
  if (s.heads.length !== 16384) throw new Error("Invalid spatial map extent");
  const seen = new Set<string>();
  for (let cell = 0; cell < 16384; cell++) {
    let id = s.heads[cell],
      previous: SourceEntityId | null = null;
    while (id) {
      const n: SpatialNode | undefined = s.nodes[id];
      if (!n || seen.has(id) || n.cell !== cell || n.previous !== previous)
        throw new Error("Invalid spatial chain");
      seen.add(id);
      previous = id;
      id = n.next;
    }
  }
  if (seen.size !== Object.keys(s.nodes).length)
    throw new Error("Unlinked spatial entity");
}
export function copySpatialLinks(
  s: SpatialState,
  id: SourceEntityId,
  native: (number | null)[],
): void {
  const node = s.nodes[id];
  if (!node) return;
  const previous = node.previous ? s.nodes[node.previous] : null,
    next = node.next ? s.nodes[node.next] : null;
  const put = (at: number, v: number) => {
    native[at] = v & 255;
    native[at + 1] = (v >> 8) & 255;
  };
  put(0, previous ? previous.index : node.cell);
  native[2] = previous ? previous.family + 1 : 0;
  if (next) put(3, next.index);
  native[5] = next ? next.family + 1 : 0;
}

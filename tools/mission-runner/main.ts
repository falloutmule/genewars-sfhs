import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { resolve } from "node:path";
import { PackSchema } from "../../src/content/types";
import { syntheticPack } from "../../src/content/synthetic";
import { createWorld, queue, step } from "../../src/sim/world";
import { checksum } from "../../src/sim/checksum";
import { load, save } from "../../src/sim/save";
import { captureCommand, record, replay, seal } from "../../src/sim/replay";
const args = process.argv.slice(2),
  pos = args.indexOf("--pack");
const bytes = pos >= 0 ? readFileSync(resolve(args[pos + 1])) : null;
const pack = bytes
  ? PackSchema.parse(JSON.parse(gunzipSync(bytes).toString("utf8")))
  : syntheticPack();
const hash = bytes
  ? createHash("sha256").update(bytes).digest("hex")
  : "synthetic-v1";
const world = createWorld(pack.missions[0], hash, pack.kind === "synthetic"),
  rec = record(world);
for (const [selector, x, y] of [
  [11, 83, 54],
  [3, 87, 54],
  [6, 81, 56],
  [6, 81, 58],
  [6, 83, 58],
] as const) {
  const c = queue(world, {
    type: "construct",
    tick: world.tick,
    sequence: world.nextSequence,
    playerId: 0,
    actorId: 1,
    selector,
    x,
    y,
    queued: false,
  });
  captureCommand(rec, world, c);
  for (let i = 0; i < 31; i++) {
    step(world);
    const restored = load(
      save(world, { paused: true, speed: 2, accumulator: 17 }),
      hash,
    );
    if (checksum(restored.world) !== checksum(world))
      throw new Error("Save divergence");
  }
  rec.hashes.push([world.tick, checksum(world)]);
}
if (
  world.status !== "workbench-complete" ||
  checksum(replay(seal(rec, world), hash)) !== checksum(world)
)
  throw new Error("Workbench regression");
const report = {
  status: "pass",
  mode: world.mode,
  missionId: 1,
  ticks: world.tick,
  goop: world.goop,
  checksum: checksum(world),
  contentHash: hash,
  completed: world.completed,
  acceptedOriginalMissions: 0,
  completeCampaign: false,
  scope: "Construction workbench; not original mission acceptance",
};
mkdirSync(".private", { recursive: true });
writeFileSync(
  ".private/mission-runner.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify(report));

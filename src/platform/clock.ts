/** Modified from Battle Drones GameScene.update/awareness.planTicks patterns,
 * 39d6f587, Apache-2.0. Original rules replaced by a presentation-only clock.
 * Retains all accumulated time; background lifecycle explicitly pauses it.
 */
export type Speed = 0.5 | 1 | 2 | 4;
export const TICK_MS = 100;
export class FixedClock {
  accumulator = 0;
  paused = false;
  speed: Speed = 1;
  advance(deltaMs: number, tick: () => void): number {
    if (!Number.isFinite(deltaMs) || deltaMs < 0)
      throw new Error("Invalid display delta");
    if (this.paused) return 0;
    this.accumulator += deltaMs * this.speed;
    const count = Math.min(
      100,
      Math.floor((this.accumulator + 1e-7) / TICK_MS),
    );
    for (let i = 0; i < count; i++) {
      tick();
      this.accumulator -= TICK_MS;
    }
    this.accumulator = Math.max(0, this.accumulator);
    return count;
  }
}

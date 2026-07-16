/**
 * Deterministic tests for shard generation and falling physics.
 */
import { describe, it, expect } from 'vitest';
import { generateShards, updateShards } from '../src/shardSystem.js';
import { CONFIG } from '../src/config.js';

const BOUNDS = { width: 1280, height: 720 };
const IMPACTS = [
  { x: 400, y: 360, strength: 0.5 },
  { x: 800, y: 300, strength: 0.9 }, // strongest -> break origin
];

const triangleArea = (pts) =>
  Math.abs(
    (pts[1].x - pts[0].x) * (pts[2].y - pts[0].y) -
      (pts[2].x - pts[0].x) * (pts[1].y - pts[0].y),
  ) / 2;

describe('generateShards', () => {
  it('is deterministic for the same seed and diverges across seeds', () => {
    const a = generateShards(BOUNDS, IMPACTS, { count: 90, seed: 7 });
    const b = generateShards(BOUNDS, IMPACTS, { count: 90, seed: 7 });
    const c = generateShards(BOUNDS, IMPACTS, { count: 90, seed: 8 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('covers the whole viewport with triangles', () => {
    const shards = generateShards(BOUNDS, IMPACTS, { count: 90, seed: 7 });
    const total = shards.reduce((sum, s) => sum + triangleArea(s.relPoints), 0);
    // Concave jittered quads split on the wrong diagonal can overlap by a
    // hair, so allow 0.5% deviation from exact tiling.
    const viewportArea = BOUNDS.width * BOUNDS.height;
    expect(Math.abs(total - viewportArea) / viewportArea).toBeLessThan(0.005);
    expect(shards.length).toBeGreaterThanOrEqual(80);
  });

  it('launches shards outward from the strongest impact', () => {
    const shards = generateShards(BOUNDS, IMPACTS, { count: 90, seed: 7 });
    const origin = IMPACTS[1];
    let outward = 0;
    for (const s of shards) {
      const dx = s.cx - origin.x;
      // Outward means vx shares the sign of the offset from the origin.
      if (Math.abs(dx) > 40 && Math.sign(s.vx) === Math.sign(dx)) outward++;
    }
    const considered = shards.filter(
      (s) => Math.abs(s.cx - origin.x) > 40,
    ).length;
    expect(outward / considered).toBeGreaterThan(0.95);
  });

  it('staggers launch delays so nearer shards fly first', () => {
    const shards = generateShards(BOUNDS, IMPACTS, { count: 90, seed: 7 });
    const origin = IMPACTS[1];
    const dist = (s) => Math.hypot(s.cx - origin.x, s.cy - origin.y);
    const near = shards.filter((s) => dist(s) < 200);
    const far = shards.filter((s) => dist(s) > 600);
    const avg = (list) =>
      list.reduce((sum, s) => sum + s.delayMs, 0) / list.length;
    expect(avg(near)).toBeLessThan(avg(far));
  });
});

describe('updateShards', () => {
  it('applies gravity and clears every shard below the viewport', () => {
    const shards = generateShards(BOUNDS, IMPACTS, { count: 90, seed: 7 });

    // One early step: launched shards must be accelerating downward.
    updateShards(shards, 400, BOUNDS);
    const launched = shards.find((s) => !s.gone && s.delayMs <= 0);
    const vyAfterFirst = launched.vy;
    updateShards(shards, 100, BOUNDS);
    expect(launched.vy).toBeGreaterThan(vyAfterFirst);

    // Simulate up to 8 seconds; everything must leave the screen.
    let alive = Infinity;
    for (let t = 0; t < 8000 && alive > 0; t += 16) {
      alive = updateShards(shards, 16, BOUNDS);
    }
    expect(alive).toBe(0);
    expect(shards.every((s) => s.gone)).toBe(true);
  });

  it('holds shards in place until their stagger delay elapses', () => {
    const shards = generateShards(BOUNDS, IMPACTS, { count: 90, seed: 7 });
    const delayed = shards.filter((s) => s.delayMs > 30);
    expect(delayed.length).toBeGreaterThan(0);
    updateShards(shards, 10, BOUNDS);
    for (const s of delayed) {
      expect(s.x).toBe(0);
      expect(s.y).toBe(0);
      expect(s.rotation).toBe(0);
    }
  });

  it('respects the configured shard-count targets', () => {
    const desktop = generateShards(BOUNDS, IMPACTS, {
      count: CONFIG.rendering.desktopShardCount,
      seed: 3,
    });
    const reduced = generateShards(BOUNDS, IMPACTS, {
      count: CONFIG.rendering.reducedMotionShardCount,
      seed: 3,
    });
    expect(desktop.length).toBeGreaterThan(reduced.length * 2);
  });
});

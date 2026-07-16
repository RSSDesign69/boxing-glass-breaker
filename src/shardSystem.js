/**
 * Shard generation and falling physics (section 10).
 *
 * Shards are irregular triangles produced by jittering a coarse grid of
 * vertices and splitting each cell along a random diagonal — full viewport
 * coverage without a fracture solver or Voronoi library. Each shard gets an
 * outward velocity away from the break origin (the strongest impact), an
 * initial upward pop, gravity, spin, and a staggered start delay so the
 * pane collapses as a ripple rather than one sheet.
 *
 * Pure logic module: no canvas access, seeded RNG, deterministic and
 * unit-testable. The renderer owns drawing (glass material clipped to each
 * polygon).
 */
import { CONFIG } from './config.js';
import { createSeededRandom } from './utils/random.js';
import { clamp } from './utils/geometry.js';

const JITTER_RATIO = 0.38; // of cell size; keeps triangles irregular

/**
 * Build the shard set for a viewport. impacts picks the break origin;
 * count is the target shard total (each grid cell yields two triangles).
 */
export function generateShards(bounds, impacts, { count, seed = 1 }) {
  const rng = createSeededRandom(seed);
  const { width, height } = bounds;
  const S = CONFIG.shatter;

  const origin = pickBreakOrigin(bounds, impacts);
  const maxDim = Math.max(width, height);

  // Jittered grid vertices, shared between neighboring cells so the
  // triangles tile the viewport without gaps.
  const cellsTarget = Math.max(6, Math.round(count / 2));
  const cols = Math.max(
    3,
    Math.round(Math.sqrt((cellsTarget * width) / height)),
  );
  const rows = Math.max(2, Math.ceil(cellsTarget / cols));
  const cellW = width / cols;
  const cellH = height / rows;

  const vertex = [];
  for (let r = 0; r <= rows; r++) {
    vertex[r] = [];
    for (let c = 0; c <= cols; c++) {
      // Border vertices stay pinned to the border on their clamped axis so
      // coverage reaches the edges exactly.
      const jx =
        c === 0 || c === cols ? 0 : rng.range(-1, 1) * cellW * JITTER_RATIO;
      const jy =
        r === 0 || r === rows ? 0 : rng.range(-1, 1) * cellH * JITTER_RATIO;
      vertex[r][c] = { x: c * cellW + jx, y: r * cellH + jy };
    }
  }

  const shards = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tl = vertex[r][c];
      const tr = vertex[r][c + 1];
      const bl = vertex[r + 1][c];
      const br = vertex[r + 1][c + 1];
      const triangles =
        rng.next() < 0.5
          ? [
              [tl, tr, br],
              [tl, br, bl],
            ]
          : [
              [tl, tr, bl],
              [tr, br, bl],
            ];
      for (const tri of triangles) {
        shards.push(buildShard(tri, origin, maxDim, rng, S));
      }
    }
  }
  return shards;
}

function buildShard(tri, origin, maxDim, rng, S) {
  const cx = (tri[0].x + tri[1].x + tri[2].x) / 3;
  const cy = (tri[0].y + tri[1].y + tri[2].y) / 3;
  const relPoints = tri.map((p) => ({ x: p.x - cx, y: p.y - cy }));
  const radius = Math.max(...relPoints.map((p) => Math.hypot(p.x, p.y)));

  // Outward direction from the break origin; shards close to it fly
  // hardest and first.
  const dx = cx - origin.x;
  const dy = cy - origin.y;
  const dist = Math.hypot(dx, dy) || 1;
  const closeness = 1 - clamp(dist / maxDim, 0, 1);
  const speed =
    (S.outwardSpeedMin + (S.outwardSpeedMax - S.outwardSpeedMin) * closeness) *
    rng.range(0.7, 1.3);

  return {
    relPoints,
    cx,
    cy,
    radius,
    x: 0,
    y: 0,
    vx: (dx / dist) * speed,
    vy:
      (dy / dist) * speed * 0.6 + rng.range(S.upwardSpeedMin, S.upwardSpeedMax),
    rotation: 0,
    angularVelocity: rng.range(-S.maxAngularVelocity, S.maxAngularVelocity),
    opacity: 1,
    delayMs: (1 - closeness) * S.maxStaggerMs * rng.range(0.6, 1.4),
    gone: false,
  };
}

function pickBreakOrigin(bounds, impacts) {
  if (!impacts || impacts.length === 0) {
    return { x: bounds.width / 2, y: bounds.height / 2 };
  }
  let best = impacts[0];
  for (const impact of impacts) {
    if (impact.strength > best.strength) best = impact;
  }
  return { x: best.x, y: best.y };
}

/**
 * Advance the simulation by dtMs. Mutates shards in place and returns the
 * number still visible. Shards are gone once fully below the viewport.
 */
export function updateShards(shards, dtMs, bounds) {
  const dt = dtMs / 1000;
  const g = CONFIG.shatter.gravity;
  let alive = 0;

  for (const shard of shards) {
    if (shard.gone) continue;

    if (shard.delayMs > 0) {
      shard.delayMs -= dtMs;
      alive++;
      continue;
    }

    shard.vy += g * dt;
    shard.x += shard.vx * dt;
    shard.y += shard.vy * dt;
    shard.rotation += shard.angularVelocity * dt;

    if (shard.cy + shard.y - shard.radius > bounds.height + 60) {
      shard.gone = true;
    } else {
      alive++;
    }
  }
  return alive;
}

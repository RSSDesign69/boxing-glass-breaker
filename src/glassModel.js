/**
 * Deterministic glass damage model: impacts, crack graph, and break
 * thresholds. Rendering never generates geometry — everything here is
 * produced once per impact with a seeded RNG so cracks are stable across
 * frames, and stored in viewport-pixel model coordinates.
 */
import { CONFIG } from './config.js';
import { createSeededRandom } from './utils/random.js';
import { distance, clamp } from './utils/geometry.js';

const EDGE_MARGIN_RATIO = 0.02; // keep impacts/cracks off the outer 2%
const CONNECT_DISTANCE = 7; // px; branch meets an existing crack -> join
const STEP_MIN = 9;
const STEP_MAX = 15;

export function createGlassModel(width, height) {
  let bounds = { width, height };
  let lastImpactAt = -Infinity;

  const state = {
    phase: 'intact', // 'intact' | 'damaged' | 'breaking' | 'clear' | 'rebuilding'
    totalDamage: 0,
    hitCount: 0,
    impacts: [],
    crackSegments: [],
  };

  return {
    get state() {
      return state;
    },
    setBounds(w, h) {
      bounds = { width: w, height: h };
    },

    /**
     * Register a hit and grow the crack graph. Returns the impact plus the
     * segments it added (renderer draws exactly these), or null when the
     * hit arrives inside the model-level debounce window (duplicate guard
     * on top of the detector's own cooldowns).
     */
    addImpact({ x, y, strength, punchType, seed, timestamp, directionX = 0 }) {
      const now = timestamp ?? performance.now();
      if (now - lastImpactAt < CONFIG.damage.impactDebounceMs) return null;
      lastImpactAt = now;

      const marginX = bounds.width * EDGE_MARGIN_RATIO;
      const marginY = bounds.height * EDGE_MARGIN_RATIO;
      const impact = {
        id: state.hitCount + 1,
        x: clamp(x, marginX, bounds.width - marginX),
        y: clamp(y, marginY, bounds.height - marginY),
        timestamp: now,
        strength: clamp(strength, 0, 1),
        punchType,
        directionX: Math.sign(directionX),
        // Forward hits chip a wide bloom; lateral hits gouge a smaller chip
        // but throw longer directional cracks (see generateCrackPattern).
        radius:
          punchType === 'lateral'
            ? (14 + strength * 20) * 0.9
            : 16 + strength * 26,
        seed:
          seed ?? ((state.hitCount + 1) * 7919) ^ Math.round(x * 31 + y * 17),
      };

      // Hits near existing cracks bite harder (section 7).
      const nearCrack = isNearExistingCrack(
        impact.x,
        impact.y,
        state.crackSegments,
      );
      impact.nearCrack = nearCrack;

      let damage =
        CONFIG.damage.baseDamage +
        impact.strength * CONFIG.damage.strengthDamage;
      if (nearCrack) damage *= CONFIG.damage.nearCrackMultiplier;

      const newSegments = generateCrackPattern(
        impact,
        bounds,
        state.crackSegments,
      );

      state.impacts.push(impact);
      state.crackSegments.push(...newSegments);
      state.totalDamage += damage;
      state.hitCount += 1;
      if (state.phase === 'intact') state.phase = 'damaged';

      return { impact, newSegments };
    },

    shouldBreak() {
      return (
        (state.totalDamage >= CONFIG.damage.breakDamage &&
          state.hitCount >= CONFIG.damage.minHitsBeforeBreak) ||
        state.hitCount >= CONFIG.damage.maxHitsBeforeForcedBreak
      );
    },

    forceBreak() {
      state.phase = 'breaking';
    },

    setPhase(phase) {
      state.phase = phase;
    },

    reset() {
      state.phase = 'intact';
      state.totalDamage = 0;
      state.hitCount = 0;
      state.impacts.length = 0;
      state.crackSegments.length = 0;
      lastImpactAt = -Infinity;
    },
  };
}

function isNearExistingCrack(x, y, segments) {
  const r = CONFIG.damage.nearCrackRadiusPx;
  for (const seg of segments) {
    for (const pt of seg.points) {
      if (distance(pt.x, pt.y, x, y) <= r) return true;
    }
  }
  return false;
}

/**
 * Per-impact pattern (section 8): radial branches, concentric stress arcs,
 * and secondary branches. All randomness comes from the impact's seed.
 * Shape varies by punch type: forward hits burst symmetrically; lateral
 * hits elongate along the travel direction. Hits near existing cracks
 * extend more aggressively (section 7).
 */
export function generateCrackPattern(impact, bounds, existingSegments) {
  const rng = createSeededRandom(impact.seed);
  const { x, y, strength } = impact;
  const segments = [];

  // Flatten existing points once for join/terminate checks.
  const existingPoints = [];
  for (const seg of existingSegments) existingPoints.push(...seg.points);

  const lateral = impact.punchType === 'lateral' && impact.directionX !== 0;
  const travelAngle = impact.directionX > 0 ? 0 : Math.PI;
  const nearBoost = impact.nearCrack ? 1.25 : 1;

  const branchCount = 5 + Math.round(rng.next() * 5 * (0.4 + strength * 0.6));
  const baseLength = (70 + strength * 190) * rng.range(0.8, 1.2) * nearBoost;
  const baseWidth = 1.2 + strength * 1.4;

  for (let i = 0; i < branchCount; i++) {
    let angle;
    let lengthScale = 1;
    if (lateral && i < Math.ceil(branchCount * 0.6)) {
      // Most lateral cracks fan out around the direction of travel.
      angle = travelAngle + rng.range(-0.9, 0.9);
      lengthScale = 1.3;
    } else {
      angle = (i / branchCount) * Math.PI * 2 + rng.range(-0.35, 0.35);
    }
    const length = baseLength * lengthScale * rng.range(0.55, 1.3);
    const points = walkBranch(x, y, angle, length, rng, bounds, existingPoints);
    if (points.length < 2) continue;

    segments.push({
      points,
      width: baseWidth * rng.range(0.8, 1.1),
      opacity: rng.range(0.7, 0.95),
      generation: 0,
      impactId: impact.id,
    });

    // Secondary branches split off roughly half the radial cracks.
    if (points.length >= 4 && rng.next() < 0.5) {
      const originIndex = rng.int(1, points.length - 2);
      const origin = points[originIndex];
      const sideAngle =
        angle + rng.range(0.5, 1.1) * (rng.next() < 0.5 ? -1 : 1);
      const subPoints = walkBranch(
        origin.x,
        origin.y,
        sideAngle,
        length * rng.range(0.25, 0.45),
        rng,
        bounds,
        existingPoints,
      );
      if (subPoints.length >= 2) {
        segments.push({
          points: subPoints,
          width: baseWidth * 0.6,
          opacity: rng.range(0.5, 0.75),
          generation: 1,
          impactId: impact.id,
        });
      }
    }
  }

  // Concentric / arc-shaped stress fractures around the impact point.
  const arcCount = rng.int(1, 3);
  for (let a = 0; a < arcCount; a++) {
    const radius = impact.radius * rng.range(0.9, 1.4) * (a + 1);
    const startAngle = rng.range(0, Math.PI * 2);
    const span = rng.range(0.7, 2.1); // 40–120 degrees
    const points = [];
    const steps = Math.max(5, Math.round(span * radius * 0.08));
    for (let s = 0; s <= steps; s++) {
      const theta = startAngle + (s / steps) * span;
      const jitter = rng.range(-2.5, 2.5);
      const px = x + Math.cos(theta) * (radius + jitter);
      const py = y + Math.sin(theta) * (radius + jitter);
      if (!inBounds(px, py, bounds)) break;
      points.push({ x: px, y: py });
    }
    if (points.length >= 3) {
      segments.push({
        points,
        width: baseWidth * 0.55,
        opacity: rng.range(0.4, 0.65),
        generation: 1,
        impactId: impact.id,
      });
    }
  }

  return segments;
}

/**
 * Grow a jagged polyline outward: fixed-ish steps with angular wobble.
 * Stops at the viewport margin or joins an existing crack point.
 */
function walkBranch(
  startX,
  startY,
  angle,
  length,
  rng,
  bounds,
  existingPoints,
) {
  const points = [{ x: startX, y: startY }];
  let px = startX;
  let py = startY;
  let theta = angle;
  let travelled = 0;

  while (travelled < length) {
    const step = rng.range(STEP_MIN, STEP_MAX);
    theta += rng.range(-0.25, 0.25);
    px += Math.cos(theta) * step;
    py += Math.sin(theta) * step;
    travelled += step;

    if (!inBounds(px, py, bounds)) break;

    // Join an existing crack instead of crossing it.
    const joined = existingPoints.find(
      (pt) => distance(pt.x, pt.y, px, py) < CONNECT_DISTANCE,
    );
    if (joined) {
      points.push({ x: joined.x, y: joined.y });
      break;
    }

    points.push({ x: px, y: py });
  }

  return points;
}

function inBounds(x, y, bounds) {
  const mx = bounds.width * EDGE_MARGIN_RATIO;
  const my = bounds.height * EDGE_MARGIN_RATIO;
  return (
    x >= mx && x <= bounds.width - mx && y >= my && y <= bounds.height - my
  );
}

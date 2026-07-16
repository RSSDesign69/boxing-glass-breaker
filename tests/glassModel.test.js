/**
 * Deterministic tests for the glass damage model: seeded crack generation,
 * damage accumulation and break thresholds, the near-crack multiplier,
 * punch-type crack shaping, and the duplicate-impact debounce.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createGlassModel, generateCrackPattern } from '../src/glassModel.js';
import { CONFIG } from '../src/config.js';

const W = 1280;
const H = 720;

function hit(model, overrides = {}) {
  return model.addImpact({
    x: W / 2,
    y: H / 2,
    strength: 0.6,
    punchType: 'forward',
    timestamp: (hit.t += 1000),
    ...overrides,
  });
}
hit.t = 0;

describe('glassModel', () => {
  let model;
  beforeEach(() => {
    model = createGlassModel(W, H);
    hit.t = 0;
  });

  it('generates identical crack geometry for the same seed', () => {
    const impact = {
      id: 1,
      x: 400,
      y: 300,
      strength: 0.7,
      punchType: 'forward',
      directionX: 0,
      radius: 30,
      seed: 12345,
    };
    const a = generateCrackPattern(impact, { width: W, height: H }, []);
    const b = generateCrackPattern(impact, { width: W, height: H }, []);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(4);
  });

  it('produces different geometry for different seeds', () => {
    const base = {
      id: 1,
      x: 400,
      y: 300,
      strength: 0.7,
      punchType: 'forward',
      directionX: 0,
      radius: 30,
    };
    const a = generateCrackPattern(
      { ...base, seed: 1 },
      { width: W, height: H },
      [],
    );
    const b = generateCrackPattern(
      { ...base, seed: 2 },
      { width: W, height: H },
      [],
    );
    expect(a).not.toEqual(b);
  });

  it('elongates lateral cracks along the travel direction', () => {
    const make = (punchType, directionX) =>
      generateCrackPattern(
        {
          id: 1,
          x: W / 2,
          y: H / 2,
          strength: 0.7,
          punchType,
          directionX,
          radius: 25,
          seed: 777,
        },
        { width: W, height: H },
        [],
      );

    const bias = (segments) => {
      let sum = 0;
      for (const seg of segments) {
        sum += seg.points[seg.points.length - 1].x - W / 2;
      }
      return sum / segments.length;
    };

    // Rightward lateral hit: endpoints skew right. Forward hit: roughly
    // symmetric, so its bias magnitude stays well below the lateral one.
    const lateralBias = bias(make('lateral', 1));
    const forwardBias = bias(make('forward', 0));
    expect(lateralBias).toBeGreaterThan(40);
    expect(lateralBias).toBeGreaterThan(Math.abs(forwardBias) * 2);
  });

  it('accumulates damage and breaks within the 8–14 punch target', () => {
    let hits = 0;
    while (!model.shouldBreak() && hits < 20) {
      hit(model, { x: 100 + hits * 55, y: 200 + (hits % 5) * 80 });
      hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(CONFIG.damage.minHitsBeforeBreak);
    expect(hits).toBeLessThanOrEqual(CONFIG.damage.maxHitsBeforeForcedBreak);
  });

  it('never breaks before minHitsBeforeBreak even with maximum strength', () => {
    for (let i = 0; i < CONFIG.damage.minHitsBeforeBreak - 1; i++) {
      hit(model, { strength: 1, x: 100 + i * 120 });
      expect(model.shouldBreak()).toBe(false);
    }
  });

  it('force-breaks at maxHitsBeforeForcedBreak even with weak hits', () => {
    for (let i = 0; i < CONFIG.damage.maxHitsBeforeForcedBreak; i++) {
      hit(model, { strength: 0, x: 60 + i * 80, y: 100 + (i % 4) * 120 });
    }
    expect(model.shouldBreak()).toBe(true);
  });

  it('applies the near-crack multiplier for hits close to existing cracks', () => {
    hit(model);
    const afterFirst = model.state.totalDamage;

    // Second hit lands on top of the first crack web.
    const near = hit(model, { x: W / 2 + 10, y: H / 2 + 10, strength: 0.6 });
    expect(near.impact.nearCrack).toBe(true);

    const nearDamage = model.state.totalDamage - afterFirst;
    const baseDamage =
      CONFIG.damage.baseDamage + 0.6 * CONFIG.damage.strengthDamage;
    expect(nearDamage).toBeCloseTo(
      baseDamage * CONFIG.damage.nearCrackMultiplier,
      5,
    );
  });

  it('debounces duplicate impacts inside the cooldown window', () => {
    const first = model.addImpact({
      x: 300,
      y: 300,
      strength: 0.5,
      punchType: 'forward',
      timestamp: 1000,
    });
    const duplicate = model.addImpact({
      x: 320,
      y: 310,
      strength: 0.5,
      punchType: 'forward',
      timestamp: 1000 + CONFIG.damage.impactDebounceMs - 10,
    });
    const later = model.addImpact({
      x: 340,
      y: 320,
      strength: 0.5,
      punchType: 'forward',
      timestamp: 1000 + CONFIG.damage.impactDebounceMs + 10,
    });
    expect(first).not.toBeNull();
    expect(duplicate).toBeNull();
    expect(later).not.toBeNull();
    expect(model.state.hitCount).toBe(2);
  });

  it('resets fully, including the debounce clock', () => {
    hit(model);
    model.reset();
    expect(model.state.hitCount).toBe(0);
    expect(model.state.crackSegments).toHaveLength(0);
    expect(model.state.phase).toBe('intact');
    // An impact right after reset must not be debounced away.
    const impact = model.addImpact({
      x: 200,
      y: 200,
      strength: 0.5,
      punchType: 'forward',
      timestamp: 5,
    });
    expect(impact).not.toBeNull();
  });
});

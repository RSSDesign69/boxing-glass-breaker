/**
 * Synthetic-sequence tests for the punch detector: hand-landmark frames are
 * generated the way MediaPipe would report them (normalized, unmirrored)
 * and fed to the detector at 60 fps. These validate the temporal state
 * machine and false-positive rules without a webcam; live-camera threshold
 * tuning is a separate manual step (Phase 3 acceptance).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createPunchDetector, computeFistScore } from '../src/punchDetector.js';

const VIEW = {
  videoWidth: 1000,
  videoHeight: 1000,
  viewWidth: 1000,
  viewHeight: 1000,
};
const FPS_DT = 1000 / 60;

/**
 * Build a 21-landmark hand. cx/cy are the palm center in normalized video
 * coordinates; scale grows the apparent palm size (forward motion proxy);
 * curled=false extends the fingertips (open hand).
 */
function makeHand({ cx, cy, scale = 1, curled = true, z = 0, reach = null }) {
  const wrist = { x: cx, y: cy + 0.1 * scale, z };
  const mcpOffsets = {
    5: -0.055,
    9: -0.02,
    13: 0.02,
    17: 0.055,
  };
  const landmarks = Array.from({ length: 21 }, () => ({ ...wrist }));
  const tipFor = { 5: 8, 9: 12, 13: 16, 17: 20 };
  for (const [mcpIndex, dx] of Object.entries(mcpOffsets)) {
    const mcp = { x: cx + dx * scale, y: cy, z };
    landmarks[mcpIndex] = mcp;
    // reach directly controls the tip-extension ratio (fist-score proxy):
    // ~0.5 = tight fist, ~1.7 = open hand, values between = partial curl
    // as seen when a fist turns to profile mid-hook.
    const tipReach = reach ?? (curled ? 0.5 : 1.7);
    landmarks[tipFor[mcpIndex]] = {
      x: wrist.x + (mcp.x - wrist.x) * tipReach,
      y: wrist.y + (mcp.y - wrist.y) * tipReach,
      z,
    };
  }
  return landmarks;
}

function frame(detector, tMs, hands) {
  return detector.update(
    hands.map(({ handedness = 'Right', ...pose }) => ({
      handedness,
      handednessScore: 0.95,
      landmarks: makeHand(pose),
    })),
    VIEW,
    tMs,
  );
}

/** Run a scripted timeline: fn(tMs) -> pose object or array of poses. */
function run(detector, durationMs, poseAt, startMs = 0) {
  const punches = [];
  for (let t = startMs; t <= startMs + durationMs; t += FPS_DT) {
    const pose = poseAt(t - startMs);
    const poses = Array.isArray(pose) ? pose : [pose];
    punches.push(...frame(detector, t, poses).punches);
  }
  return punches;
}

const lerp = (a, b, t) => a + (b - a) * Math.min(Math.max(t, 0), 1);

/** Idle guard fist, then a fast forward jab (palm grows, z toward camera). */
function forwardJab(t, { cx = 0.5, cy = 0.5 } = {}) {
  if (t < 300) return { cx, cy, scale: 1, z: 0 };
  if (t < 450) {
    const k = (t - 300) / 150;
    return { cx, cy, scale: lerp(1, 1.9, k), z: lerp(0, -0.25, k) };
  }
  if (t < 600) return { cx, cy, scale: 1.9, z: -0.25 };
  if (t < 900) {
    const k = (t - 600) / 300;
    return { cx, cy, scale: lerp(1.9, 1, k), z: lerp(-0.25, 0, k) };
  }
  return { cx, cy, scale: 1, z: 0 };
}

describe('computeFistScore', () => {
  it('scores a curled hand near 1 and an open hand near 0', () => {
    const curled = makeHand({ cx: 0.5, cy: 0.5, curled: true });
    const open = makeHand({ cx: 0.5, cy: 0.5, curled: false });
    const toPts = (lms) =>
      lms.map((lm) => ({ x: lm.x * 1000, y: lm.y * 1000 }));
    expect(computeFistScore(toPts(curled))).toBeGreaterThan(0.9);
    expect(computeFistScore(toPts(open))).toBeLessThan(0.2);
  });
});

describe('punch detection', () => {
  let detector;
  beforeEach(() => {
    detector = createPunchDetector();
  });

  it('registers a fast forward jab exactly once', () => {
    const punches = run(detector, 1000, (t) => forwardJab(t));
    expect(punches).toHaveLength(1);
    expect(punches[0].punchType).toBe('forward');
    expect(punches[0].handId).toBe('Right');
    expect(punches[0].strength).toBeGreaterThan(0);
    expect(punches[0].strength).toBeLessThanOrEqual(1);
    // Impact near the (mirrored) palm center.
    expect(punches[0].x).toBeGreaterThan(350);
    expect(punches[0].x).toBeLessThan(650);
  });

  it('registers a retract-and-jab sequence as two separate punches', () => {
    const cycle = 1000;
    const punches = run(detector, 2000, (t) => forwardJab(t % cycle));
    expect(punches).toHaveLength(2);
    expect(punches.every((p) => p.punchType === 'forward')).toBe(true);
  });

  it('registers a fast lateral cross-frame punch once as lateral', () => {
    const punches = run(detector, 1200, (t) => {
      if (t < 300) return { cx: 0.25, cy: 0.5 };
      if (t < 480) return { cx: lerp(0.25, 0.75, (t - 300) / 180), cy: 0.5 };
      return { cx: 0.75, cy: 0.5 };
    });
    expect(punches).toHaveLength(1);
    expect(punches[0].punchType).toBe('lateral');
  });

  it('does not trigger on a stationary fist', () => {
    const punches = run(detector, 2000, () => ({ cx: 0.5, cy: 0.5 }));
    expect(punches).toHaveLength(0);
  });

  it('does not trigger on a fist held continuously near the camera', () => {
    const punches = run(detector, 2000, () => ({
      cx: 0.5,
      cy: 0.5,
      scale: 2.2,
      z: -0.3,
    }));
    expect(punches).toHaveLength(0);
  });

  it('does not trigger on an open-hand wave', () => {
    const punches = run(detector, 2000, (t) => ({
      cx: 0.5 + 0.15 * Math.sin((t / 1000) * Math.PI * 4),
      cy: 0.5,
      curled: false,
    }));
    expect(punches).toHaveLength(0);
  });

  it('does not trigger on a slow forward reach', () => {
    const punches = run(detector, 2000, (t) => ({
      cx: 0.5,
      cy: 0.5,
      scale: t < 300 ? 1 : lerp(1, 1.4, (t - 300) / 1500),
      z: 0,
    }));
    expect(punches).toHaveLength(0);
  });

  it('does not trigger on small lateral guard adjustments', () => {
    const punches = run(detector, 3000, (t) => ({
      cx: 0.5 + 0.03 * Math.sin((t / 1000) * Math.PI * 3),
      cy: 0.5,
    }));
    expect(punches).toHaveLength(0);
  });

  it('suppresses a duplicate when both hands land simultaneously', () => {
    const punches = run(detector, 1000, (t) => [
      { ...forwardJab(t, { cx: 0.4 }), handedness: 'Right' },
      { ...forwardJab(t, { cx: 0.6 }), handedness: 'Left' },
    ]);
    expect(punches).toHaveLength(1);
  });

  it('survives a hand briefly leaving the frame without misfiring', () => {
    const punches = run(detector, 2000, (t) => {
      // Hand disappears between 600–900 ms, returns elsewhere, stays calm.
      if (t >= 600 && t < 900) return [];
      if (t < 600) return { cx: 0.3, cy: 0.5 };
      return { cx: 0.7, cy: 0.4 };
    });
    expect(punches).toHaveLength(0);
  });

  it('ignores single-frame teleports instead of reading them as motion', () => {
    const punches = run(detector, 1500, (t) => {
      const jump = Math.floor(t / 400) % 2 === 0;
      return { cx: jump ? 0.2 : 0.8, cy: 0.5 };
    });
    expect(punches).toHaveLength(0);
  });
});

describe('hook detection (lateral punches)', () => {
  let detector;
  beforeEach(() => {
    detector = createPunchDetector();
  });

  it('registers a gym-speed hook with a vertical arc', () => {
    // ~0.3 viewport of travel in ~280 ms with an arcing path — slower and
    // shorter than the cross-frame lateral test above.
    const punches = run(detector, 1300, (t) => {
      if (t < 300) return { cx: 0.32, cy: 0.55 };
      if (t < 580) {
        const k = (t - 300) / 280;
        return {
          cx: lerp(0.32, 0.62, k),
          cy: 0.55 - 0.07 * Math.sin(k * Math.PI),
        };
      }
      return { cx: 0.62, cy: 0.55 };
    });
    expect(punches).toHaveLength(1);
    expect(punches[0].punchType).toBe('lateral');
  });

  it('keeps tracking a hook whose fist score sags in profile view', () => {
    // Fist starts solid (reach 0.6), degrades to 0.35-score territory
    // mid-swing as the knuckles turn side-on, then recovers. The wide
    // hysteresis must carry the swing instead of aborting it.
    const punches = run(detector, 1300, (t) => {
      if (t < 300) return { cx: 0.3, cy: 0.5, reach: 0.6 };
      if (t < 560) {
        const k = (t - 300) / 260;
        return {
          cx: lerp(0.3, 0.64, k),
          cy: 0.5,
          reach: lerp(0.6, 1.1, Math.sin(k * Math.PI)),
        };
      }
      return { cx: 0.64, cy: 0.5, reach: 0.6 };
    });
    expect(punches).toHaveLength(1);
    expect(punches[0].punchType).toBe('lateral');
  });

  it('still rejects an open-hand lateral swipe', () => {
    const punches = run(detector, 1300, (t) => {
      if (t < 300) return { cx: 0.3, cy: 0.5, curled: false };
      if (t < 560) {
        return { cx: lerp(0.3, 0.64, (t - 300) / 260), cy: 0.5, curled: false };
      }
      return { cx: 0.64, cy: 0.5, curled: false };
    });
    expect(punches).toHaveLength(0);
  });
});

describe('temporal state machine', () => {
  it('walks OPEN_OR_IDLE → FIST_READY → ACCELERATING → COOLDOWN → RETRACTING → FIST_READY', () => {
    const detector = createPunchDetector();
    const states = [];
    for (let t = 0; t <= 1400; t += FPS_DT) {
      const pose = t < 60 ? { cx: 0.5, cy: 0.5, curled: false } : forwardJab(t);
      const { debug } = frame(detector, t, [pose]);
      const state = debug[0]?.state;
      if (state && states[states.length - 1] !== state) states.push(state);
    }
    // The observed sequence must contain the canonical path in order.
    const canonical = [
      'OPEN_OR_IDLE',
      'FIST_READY',
      'ACCELERATING',
      'COOLDOWN',
      'RETRACTING',
      'FIST_READY',
    ];
    let cursor = 0;
    for (const state of states) {
      if (state === canonical[cursor]) cursor++;
      if (cursor === canonical.length) break;
    }
    expect(cursor).toBe(canonical.length);
  });

  it('suppresses a second thrust inside the hand cooldown (no retraction)', () => {
    const detector = createPunchDetector();
    const punches = run(detector, 1200, (t) => {
      if (t < 300) return { cx: 0.5, cy: 0.5, scale: 1, z: 0 };
      if (t < 450) {
        const k = (t - 300) / 150;
        return {
          cx: 0.5,
          cy: 0.5,
          scale: lerp(1, 1.9, k),
          z: lerp(0, -0.25, k),
        };
      }
      // Slight drop, then a second forward thrust with no retraction —
      // still inside the 450 ms hand cooldown.
      if (t < 520) return { cx: 0.5, cy: 0.5, scale: 1.7, z: -0.2 };
      if (t < 660) {
        const k = (t - 520) / 140;
        return {
          cx: 0.5,
          cy: 0.5,
          scale: lerp(1.7, 2.4, k),
          z: lerp(-0.2, -0.4, k),
        };
      }
      return { cx: 0.5, cy: 0.5, scale: 2.4, z: -0.4 };
    });
    expect(punches).toHaveLength(1);
  });
});

describe('calibration', () => {
  // A short, sharp lateral snap: ~140 px of travel — above the default
  // 70 px requirement, below a calibrated large-arm requirement.
  const shortHook = (t) => {
    if (t < 300) return { cx: 0.3, cy: 0.5 };
    if (t < 420) return { cx: lerp(0.3, 0.44, (t - 300) / 120), cy: 0.5 };
    return { cx: 0.44, cy: 0.5 };
  };

  it('accepts a short lateral snap at the default travel requirement', () => {
    const detector = createPunchDetector();
    const punches = run(detector, 1200, shortHook);
    expect(punches).toHaveLength(1);
    expect(punches[0].punchType).toBe('lateral');
  });

  it('scales the lateral travel requirement to the calibrated palm width', () => {
    const detector = createPunchDetector();
    // Baseline palm 320 px -> required travel max(70, 160) = 160 px,
    // above the ~140 px this short snap covers.
    detector.setCalibration({ palmWidth: 320, meanZ: 0, noiseSpeed: 0.02 });
    const punches = run(detector, 1200, shortHook);
    expect(punches).toHaveLength(0);
  });

  it('keeps forward punches unaffected by lateral calibration scaling', () => {
    const detector = createPunchDetector();
    detector.setCalibration({ palmWidth: 320, meanZ: 0, noiseSpeed: 0.02 });
    const punches = run(detector, 1000, (t) => forwardJab(t));
    expect(punches).toHaveLength(1);
    expect(punches[0].punchType).toBe('forward');
  });

  it('survives detector reset (calibration describes the setup, not state)', () => {
    const detector = createPunchDetector();
    detector.setCalibration({ palmWidth: 320, meanZ: 0, noiseSpeed: 0.02 });
    detector.reset();
    expect(detector.calibration).not.toBeNull();
    const punches = run(detector, 1200, shortHook);
    expect(punches).toHaveLength(0);
  });
});

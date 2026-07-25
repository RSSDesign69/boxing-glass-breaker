/**
 * Temporal fist/punch detection (sections 6.2–6.7).
 *
 * Per fresh tracking frame the detector extracts per-hand features (fist
 * score, palm size, depth, smoothed velocities over a short sample window)
 * and advances one state machine per hand:
 *
 *   OPEN_OR_IDLE → FIST_READY → ACCELERATING → IMPACT → COOLDOWN
 *     → RETRACTING → FIST_READY | OPEN_OR_IDLE
 *
 * A punch is never a single-frame threshold: it needs a confirmed fist,
 * an armed hand, sustained intentional acceleration, an impact peak
 * (velocity peaks then drops / reverses), and per-hand + global cooldowns.
 * Two candidate families share the detector: forward (scale/depth driven)
 * and lateral (horizontal speed + deceleration driven).
 *
 * The detector is pure with respect to the DOM: inputs are landmark frames
 * plus video/viewport dimensions, output is punch events — so synthetic
 * sequences can drive it in unit tests.
 */
import { CONFIG } from './config.js';
import {
  distance,
  clamp,
  coverTransform,
  landmarkToViewport,
} from './utils/geometry.js';
import { createSampleWindow } from './utils/filters.js';

export const HandState = Object.freeze({
  OPEN_OR_IDLE: 'OPEN_OR_IDLE',
  FIST_READY: 'FIST_READY',
  ACCELERATING: 'ACCELERATING',
  IMPACT: 'IMPACT',
  COOLDOWN: 'COOLDOWN',
  RETRACTING: 'RETRACTING',
});

// Landmark topology used here: wrist + finger MCPs/tips.
const WRIST = 0;
const PALM_LANDMARKS = [0, 5, 9, 13, 17];
const FINGERS = [
  [5, 8],
  [9, 12],
  [13, 16],
  [17, 20],
];
// Wide hysteresis (hook-detection pass): a hook shows the fist in profile,
// where foreshortened landmarks depress the curl score mid-swing. Arming
// still requires the full fistThreshold; this only keeps an armed fist
// armed until the score collapses to threshold − 0.25.
const FIST_HYSTERESIS = 0.25;
const FIST_LOST_FRAMES = 3;
const VELOCITY_LOOKBACK_MS = 90;
const IMPACT_EDGE_MARGIN = 0.02;

export function createPunchDetector() {
  const tracks = new Map(); // handId -> per-hand tracking state
  let lastGlobalImpactAt = -Infinity;
  let calibration = null; // {palmWidth, meanZ, noiseSpeed} or null

  function getTrack(handId) {
    let track = tracks.get(handId);
    if (!track) {
      track = {
        handId,
        state: HandState.OPEN_OR_IDLE,
        window: createSampleWindow(CONFIG.tracking.sampleWindowMs),
        fistFrames: 0,
        openFrames: 0,
        accelFrames: 0,
        armedAt: -Infinity,
        lastImpactAt: -Infinity,
        peak: null, // best candidate sample while ACCELERATING
        widthAtImpact: 0,
        quietSince: null,
        lastSeen: -Infinity,
        prevRawCenter: null,
        smoothed: null, // {cx, cy, w, z}
      };
      tracks.set(handId, track);
    }
    return track;
  }

  function resetMotion(track) {
    track.window.clear();
    track.accelFrames = 0;
    track.peak = null;
    track.prevRawCenter = null;
    track.smoothed = null;
  }

  return {
    /**
     * Advance detection with one fresh landmark frame.
     * hands: [{handedness, handednessScore, landmarks}], view:
     * {videoWidth, videoHeight, viewWidth, viewHeight}. Returns
     * { punches, debug } — debug carries every per-hand feature the HUD
     * shows (section 15).
     */
    update(hands, view, timestampMs) {
      const punches = [];
      const debug = [];
      const seen = new Set();

      for (const hand of hands) {
        if (hand.handednessScore < 0.5) continue; // low-confidence: ignore
        if (seen.has(hand.handedness)) continue; // duplicate label: ignore
        seen.add(hand.handedness);

        const track = getTrack(hand.handedness);
        const features = extractFeatures(hand, view, timestampMs, track);
        track.lastSeen = timestampMs;

        const punch = advanceState(track, features, timestampMs);
        if (punch) {
          lastGlobalImpactAt = timestampMs;
          punches.push(punch);
        }

        debug.push({
          handId: track.handId,
          state: track.state,
          ...features,
          cooldownRemainingMs: Math.max(
            0,
            CONFIG.tracking.handCooldownMs - (timestampMs - track.lastImpactAt),
          ),
        });
      }

      // Forget hands that left the frame; a brief dropout must not leave a
      // stale state machine that misfires when the hand returns.
      for (const [id, track] of tracks) {
        if (timestampMs - track.lastSeen > CONFIG.punch.handMissingMs) {
          tracks.delete(id);
        }
      }

      return { punches, debug };
    },

    reset() {
      tracks.clear();
      lastGlobalImpactAt = -Infinity;
      // Calibration survives resets deliberately: it describes the user's
      // setup, not the detector's arming state.
    },

    /**
     * Apply session calibration baselines (numbers only; see Phase 8).
     * palmWidth (px) scales the lateral-travel requirement to arm length;
     * noiseSpeed (diag/s, measured at rest) raises the screen-speed floor
     * when the camera/setup is jittery. Pass null to clear.
     */
    setCalibration(values) {
      calibration =
        values && Number.isFinite(values.palmWidth) && values.palmWidth > 0
          ? values
          : null;
    },

    get calibration() {
      return calibration;
    },
  };

  function effectiveMinScreenSpeed() {
    return Math.max(
      CONFIG.punch.minScreenSpeed,
      (calibration?.noiseSpeed ?? 0) * 4,
    );
  }

  function effectiveMinLateralTravelPx() {
    // 0.5 × palm width (was 0.75): real hooks are tighter arcs than the
    // original factor assumed and were being rejected after calibration.
    return Math.max(
      CONFIG.tracking.minLateralTravelPx,
      (calibration?.palmWidth ?? 0) * 0.5,
    );
  }

  // -------------------------------------------------------------------------
  // Feature extraction (section 6.2)
  // -------------------------------------------------------------------------

  function extractFeatures(hand, view, timestampMs, track) {
    const { videoWidth, videoHeight, viewWidth, viewHeight } = view;
    const diag = Math.hypot(viewWidth, viewHeight);
    const cover = coverTransform(
      videoWidth,
      videoHeight,
      viewWidth,
      viewHeight,
    );
    const pts = hand.landmarks.map((lm) =>
      landmarkToViewport(lm.x, lm.y, videoWidth, videoHeight, cover),
    );

    let cx = 0;
    let cy = 0;
    let meanZ = 0;
    for (const i of PALM_LANDMARKS) {
      cx += pts[i].x;
      cy += pts[i].y;
      meanZ += hand.landmarks[i].z;
    }
    cx /= PALM_LANDMARKS.length;
    cy /= PALM_LANDMARKS.length;
    meanZ /= PALM_LANDMARKS.length;

    const palmWidth = distance(pts[5].x, pts[5].y, pts[17].x, pts[17].y);
    const fistScore = computeFistScore(pts);

    // Teleport rejection (section 6.7): a large frame-to-frame jump means
    // tracking glitched or a different hand got this label — restart motion.
    if (
      track.prevRawCenter &&
      distance(track.prevRawCenter.x, track.prevRawCenter.y, cx, cy) >
        CONFIG.tracking.teleportThresholdViewportRatio * diag
    ) {
      resetMotion(track);
      if (track.state === HandState.ACCELERATING) {
        track.state = HandState.FIST_READY;
      }
    }
    track.prevRawCenter = { x: cx, y: cy };

    // Position/size smoothing (EMA); raw values stay in the sample window
    // via the smoothed-but-responsive alpha below.
    const alpha = 0.55;
    if (!track.smoothed) {
      track.smoothed = { cx, cy, w: palmWidth, z: meanZ };
    } else {
      const s = track.smoothed;
      s.cx += alpha * (cx - s.cx);
      s.cy += alpha * (cy - s.cy);
      s.w += alpha * (palmWidth - s.w);
      s.z += alpha * (meanZ - s.z);
    }
    const s = track.smoothed;

    // Velocities against a sample ~VELOCITY_LOOKBACK_MS back.
    const ref = pickReference(track.window, timestampMs);
    let screenSpeed = 0; // viewport diagonals / s
    let vx = 0; // signed viewport widths / s
    let scaleVelocity = 0; // palm-width fractions / s
    let depthVelocity = 0; // z units / s, positive toward camera
    let vxPx = 0; // px/s, for HUD vector drawing only
    let vyPx = 0;
    if (ref) {
      const dt = (timestampMs - ref.timestampMs) / 1000;
      if (dt > 0.02) {
        screenSpeed = distance(ref.cx, ref.cy, s.cx, s.cy) / diag / dt;
        vx = (s.cx - ref.cx) / viewWidth / dt;
        vxPx = (s.cx - ref.cx) / dt;
        vyPx = (s.cy - ref.cy) / dt;
        scaleVelocity = (s.w - ref.w) / Math.max(ref.w, 1) / dt;
        depthVelocity = ((s.z - ref.z) / dt) * CONFIG.punch.depthSign;
      }
    }

    track.window.push(timestampMs, {
      cx: s.cx,
      cy: s.cy,
      w: s.w,
      z: s.z,
      vx,
    });

    return {
      fistScore,
      cx: s.cx,
      cy: s.cy,
      palmWidth: s.w,
      palmAreaProxy: s.w * s.w,
      meanZ: s.z,
      screenSpeed,
      vx,
      vxPx,
      vyPx,
      scaleVelocity,
      depthVelocity,
      viewWidth,
      viewHeight,
      ...scoreCandidates(
        { fistScore, screenSpeed, vx, scaleVelocity, depthVelocity },
        track,
      ),
    };
  }

  function pickReference(window, nowMs) {
    const samples = window.all;
    for (let i = samples.length - 1; i >= 0; i--) {
      if (nowMs - samples[i].timestampMs >= VELOCITY_LOOKBACK_MS) {
        return samples[i];
      }
    }
    return samples.length >= 2 ? samples[0] : null;
  }

  // -------------------------------------------------------------------------
  // Candidate scores (section 6.4)
  // -------------------------------------------------------------------------

  function scoreCandidates(f, track) {
    const P = CONFIG.punch;
    const screenSpeedN = clamp(f.screenSpeed / P.screenSpeedRef, 0, 1);
    const scaleVelN = clamp(f.scaleVelocity / P.scaleVelocityRef, 0, 1);
    const depthVelN = clamp(f.depthVelocity / P.depthVelocityRef, 0, 1);
    const hSpeedN = clamp(Math.abs(f.vx) / P.horizontalSpeedRef, 0, 1);

    // Horizontal deceleration relative to the tracked peak (lateral punches
    // announce themselves by stopping or reversing hard).
    let hDecelN = 0;
    if (track.peak && track.peak.hSpeedAbs > 0) {
      hDecelN = clamp(
        (track.peak.hSpeedAbs - Math.abs(f.vx)) / track.peak.hSpeedAbs,
        0,
        1,
      );
    }

    const forwardPunchScore =
      0.4 * scaleVelN +
      0.35 * depthVelN +
      0.15 * screenSpeedN +
      0.1 * f.fistScore;
    const lateralPunchScore =
      0.55 * hSpeedN + 0.2 * hDecelN + 0.15 * screenSpeedN + 0.1 * f.fistScore;

    return { forwardPunchScore, lateralPunchScore, screenSpeedN, hSpeedN };
  }

  // -------------------------------------------------------------------------
  // Hand state machine (section 6.5)
  // -------------------------------------------------------------------------

  function advanceState(track, f, ts) {
    const T = CONFIG.tracking;
    const P = CONFIG.punch;
    const fistHeld = f.fistScore >= T.fistThreshold;
    const fistLost = f.fistScore < T.fistThreshold - FIST_HYSTERESIS;

    switch (track.state) {
      case HandState.OPEN_OR_IDLE: {
        track.fistFrames = fistHeld ? track.fistFrames + 1 : 0;
        if (track.fistFrames >= T.fistConfirmFrames) {
          track.state = HandState.FIST_READY;
          track.armedAt = ts;
          track.accelFrames = 0;
        }
        return null;
      }

      case HandState.FIST_READY: {
        if (fistLost) {
          track.openFrames += 1;
          if (track.openFrames >= FIST_LOST_FRAMES) {
            track.state = HandState.OPEN_OR_IDLE;
            track.fistFrames = 0;
            track.openFrames = 0;
          }
          return null;
        }
        track.openFrames = 0;

        const aboveFloor =
          f.screenSpeed > effectiveMinScreenSpeed() ||
          f.scaleVelocity > P.minScaleVelocity ||
          f.depthVelocity > P.minDepthVelocity;
        track.accelFrames = aboveFloor ? track.accelFrames + 1 : 0;
        if (track.accelFrames >= P.minAccelFrames) {
          track.state = HandState.ACCELERATING;
          track.peak = null;
        }
        return null;
      }

      case HandState.ACCELERATING: {
        if (fistLost) {
          track.state = HandState.OPEN_OR_IDLE;
          track.fistFrames = 0;
          track.peak = null;
          return null;
        }

        const candidate = Math.max(f.forwardPunchScore, f.lateralPunchScore);
        if (!track.peak || candidate > track.peak.score) {
          track.peak = {
            score: candidate,
            forwardPunchScore: f.forwardPunchScore,
            screenSpeedN: f.screenSpeedN,
            hSpeedN: f.hSpeedN,
            fistScore: f.fistScore,
            cx: f.cx,
            cy: f.cy,
            palmWidth: f.palmWidth,
            vx: f.vx,
            hSpeedAbs: Math.abs(f.vx),
            timestampMs: ts,
          };
        }

        const peak = track.peak;
        const dropped = candidate <= peak.score * (1 - P.peakDropRatio);
        const reversed =
          Math.sign(f.vx) !== 0 &&
          Math.sign(peak.vx) !== 0 &&
          Math.sign(f.vx) !== Math.sign(peak.vx) &&
          peak.hSpeedAbs > P.minScreenSpeed;

        if (dropped || reversed) {
          const punch = tryEmitPunch(track, peak, ts, f);
          if (punch) return punch;
          // Peak collapsed without qualifying as a punch: rearm.
          track.state = HandState.FIST_READY;
          track.accelFrames = 0;
          track.peak = null;
          return null;
        }

        // Motion faded away without a distinct peak (slow reach).
        const stillMoving =
          f.screenSpeed > effectiveMinScreenSpeed() ||
          f.scaleVelocity > P.minScaleVelocity ||
          f.depthVelocity > P.minDepthVelocity;
        if (!stillMoving) {
          track.accelFrames = 0;
          track.state = HandState.FIST_READY;
          track.peak = null;
        }
        return null;
      }

      case HandState.COOLDOWN: {
        if (ts - track.lastImpactAt >= T.handCooldownMs) {
          track.state = HandState.RETRACTING;
          track.quietSince = null;
        }
        return null;
      }

      case HandState.RETRACTING: {
        // Rearm only after the hand demonstrably ended the motion that
        // scored: opened, pulled back, or went quiet (section 6.4 rule 6).
        if (fistLost) {
          track.state = HandState.OPEN_OR_IDLE;
          track.fistFrames = 0;
          return null;
        }
        const pulledBack = f.palmWidth < track.widthAtImpact * 0.9;
        if (f.screenSpeed < P.rearmSpeedDiag) {
          track.quietSince ??= ts;
        } else {
          track.quietSince = null;
        }
        const wentQuiet =
          track.quietSince !== null && ts - track.quietSince >= P.rearmQuietMs;

        if (pulledBack || wentQuiet) {
          track.state = HandState.FIST_READY;
          track.armedAt = ts;
          track.accelFrames = 0;
          track.peak = null;
        }
        return null;
      }

      default:
        track.state = HandState.OPEN_OR_IDLE;
        return null;
    }
  }

  function tryEmitPunch(track, peak, ts, f) {
    const T = CONFIG.tracking;
    const P = CONFIG.punch;

    if (ts - track.armedAt < P.armedDelayMs) return null;
    if (ts - track.lastImpactAt < T.handCooldownMs) return null;
    if (ts - lastGlobalImpactAt < T.globalImpactCooldownMs) return null;

    // The lateral deceleration term only becomes real once the hand stops
    // or reverses, so realize it at emission time from the current frame.
    const decelN =
      peak.hSpeedAbs > 0
        ? clamp((peak.hSpeedAbs - Math.abs(f.vx)) / peak.hSpeedAbs, 0, 1)
        : 0;
    const lateralPunchScore =
      0.55 * peak.hSpeedN +
      0.2 * decelN +
      0.15 * peak.screenSpeedN +
      0.1 * peak.fistScore;

    const punchType =
      peak.forwardPunchScore >= lateralPunchScore ? 'forward' : 'lateral';
    const punchScore = Math.max(peak.forwardPunchScore, lateralPunchScore);
    const threshold =
      punchType === 'forward'
        ? T.forwardPunchThreshold
        : T.lateralPunchThreshold;
    if (punchScore < threshold) return null;

    if (punchType === 'lateral') {
      // Require real horizontal displacement so guard adjustments don't
      // count (section 6.4).
      const samples = track.window.all;
      if (samples.length < 2) return null;
      let minX = Infinity;
      let maxX = -Infinity;
      for (const sample of samples) {
        minX = Math.min(minX, sample.cx);
        maxX = Math.max(maxX, sample.cx);
      }
      if (maxX - minX < effectiveMinLateralTravelPx()) return null;
    }

    // Impact location (section 6.6): fist center at the peak frame; lateral
    // hits land slightly ahead of the knuckles along the travel direction.
    let x = peak.cx;
    const y = peak.cy;
    if (punchType === 'lateral') {
      x += Math.sign(peak.vx) * peak.palmWidth * 0.5;
    }

    const strength = clamp(
      0.35 + ((punchScore - threshold) / Math.max(1 - threshold, 0.05)) * 0.65,
      0.25,
      1,
    );

    track.state = HandState.COOLDOWN;
    track.lastImpactAt = ts;
    track.widthAtImpact = peak.palmWidth;
    track.peak = null;

    return {
      x,
      y,
      strength,
      punchType,
      directionX: Math.sign(peak.vx),
      handId: track.handId,
      score: punchScore,
      timestampMs: ts,
    };
  }
}

// ---------------------------------------------------------------------------
// Fist classifier (section 6.3)
// ---------------------------------------------------------------------------

/**
 * Score 0–1: each finger is "curled" when its tip sits closer to the wrist
 * than its MCP joint. The ratio tip-to-wrist / mcp-to-wrist maps linearly to
 * a per-finger score (<=0.85 fully curled, >=1.25 fully extended); the fist
 * score averages the four fingers. Thumb is excluded — it barely moves the
 * ratio and hurts robustness for boxing-style vertical fists.
 */
export function computeFistScore(pts) {
  const wrist = pts[WRIST];
  let total = 0;
  for (const [mcp, tip] of FINGERS) {
    const tipDist = distance(pts[tip].x, pts[tip].y, wrist.x, wrist.y);
    const mcpDist = distance(pts[mcp].x, pts[mcp].y, wrist.x, wrist.y);
    if (mcpDist <= 0) continue;
    const ratio = tipDist / mcpDist;
    total += clamp((1.25 - ratio) / (1.25 - 0.85), 0, 1);
  }
  return total / FINGERS.length;
}

export { IMPACT_EDGE_MARGIN };

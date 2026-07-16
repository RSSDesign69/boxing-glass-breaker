/**
 * Optional landmark-anchored virtual boxing gloves (section 12).
 *
 * A stylized 2D vector glove is drawn over each detected fist:
 *   - center: palm-landmark average (wrist + MCPs)
 *   - scale: palm width (landmarks 5–17)
 *   - rotation: wrist → middle-MCP direction
 *
 * The overlay computes everything from raw hand landmarks, independent of
 * the punch detector — so gloves still render while detection is paused
 * (e.g. CLEAR_VIEW) and can never influence detection results. Gloves hide
 * for open hands and low-confidence tracking. Transforms are smoothed to
 * kill idle jitter, with much lighter smoothing while a hand is in an
 * active punch state to avoid visible lag.
 */
import { coverTransform, landmarkToViewport } from './utils/geometry.js';
import { computeFistScore } from './punchDetector.js';

const HIDE_BELOW_FIST_SCORE = 0.5;
const HIDE_BELOW_CONFIDENCE = 0.5;
const IDLE_ALPHA = 0.3;
const PUNCH_ALPHA = 0.85;
const PALM_LANDMARKS = [0, 5, 9, 13, 17];

export function createGloveRenderer() {
  const smoothed = new Map(); // handId -> {x, y, scale, rot}

  return {
    /**
     * Draw gloves for the current frame.
     * frame: {hands, video, viewWidth, viewHeight, activeHands: Set<handId>}
     */
    draw(ctx, frame) {
      const { hands, video, viewWidth, viewHeight, activeHands } = frame;
      if (!video?.videoWidth) return;

      const cover = coverTransform(
        video.videoWidth,
        video.videoHeight,
        viewWidth,
        viewHeight,
      );
      const toView = (lm) =>
        landmarkToViewport(
          lm.x,
          lm.y,
          video.videoWidth,
          video.videoHeight,
          cover,
        );

      const seen = new Set();
      for (const hand of hands) {
        if (hand.handednessScore < HIDE_BELOW_CONFIDENCE) continue;
        if (seen.has(hand.handedness)) continue;

        const pts = hand.landmarks.map(toView);
        if (computeFistScore(pts) < HIDE_BELOW_FIST_SCORE) continue;
        seen.add(hand.handedness);

        let cx = 0;
        let cy = 0;
        for (const i of PALM_LANDMARKS) {
          cx += pts[i].x;
          cy += pts[i].y;
        }
        cx /= PALM_LANDMARKS.length;
        cy /= PALM_LANDMARKS.length;

        const palmWidth = Math.hypot(
          pts[17].x - pts[5].x,
          pts[17].y - pts[5].y,
        );
        // Knuckle direction: wrist toward middle-finger MCP.
        const rot = Math.atan2(pts[9].y - pts[0].y, pts[9].x - pts[0].x);

        const target = { x: cx, y: cy, scale: palmWidth, rot };
        const alpha = activeHands?.has(hand.handedness)
          ? PUNCH_ALPHA
          : IDLE_ALPHA;
        const s = smooth(smoothed, hand.handedness, target, alpha);

        drawGlove(ctx, s.x, s.y, s.scale, s.rot, hand.handedness);
      }

      // Forget hands that vanished so a returning hand snaps into place
      // instead of gliding across the screen from its old position.
      for (const key of [...smoothed.keys()]) {
        if (!seen.has(key)) smoothed.delete(key);
      }
    },

    reset() {
      smoothed.clear();
    },
  };
}

function smooth(store, handId, target, alpha) {
  let s = store.get(handId);
  if (!s) {
    s = { ...target };
    store.set(handId, s);
    return s;
  }
  s.x += alpha * (target.x - s.x);
  s.y += alpha * (target.y - s.y);
  s.scale += alpha * (target.scale - s.scale);
  s.rot += alpha * angleDelta(s.rot, target.rot);
  return s;
}

/** Shortest signed angular difference, so smoothing never spins the long way. */
function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Neutral stylized glove, drawn in a local space where +x is the knuckle
 * direction. Design units assume a 100-unit palm width; scaled to match.
 * The thumb sits on the palm side, which mirrors naturally with handedness.
 */
function drawGlove(ctx, x, y, palmWidth, rot, handedness) {
  const unit = (palmWidth * 2.1) / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.scale(unit, handedness === 'Left' ? -unit : unit);

  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(30, 8, 10, 0.85)';
  ctx.lineWidth = 3;

  // Wrist cuff behind the fist.
  ctx.fillStyle = '#7d1420';
  roundedRect(ctx, -78, -26, 40, 52, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(245, 240, 235, 0.85)'; // lace band
  roundedRect(ctx, -52, -24, 9, 48, 4);
  ctx.fill();

  // Main fist body.
  const body = ctx.createRadialGradient(-14, -16, 6, 0, 0, 62);
  body.addColorStop(0, '#d9293c');
  body.addColorStop(0.65, '#b01f30');
  body.addColorStop(1, '#8a1626');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(-6, 0, 50, 42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Thumb on the palm side.
  ctx.fillStyle = '#a51d2d';
  ctx.beginPath();
  ctx.ellipse(-18, 32, 21, 14, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Knuckle highlight.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.beginPath();
  ctx.ellipse(16, -18, 16, 9, 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

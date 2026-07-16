/**
 * Development-only overlay: FPS, tracker stats, app state, hand landmarks,
 * and markers for simulated impacts from the mouse/keyboard dev controls.
 * Toggled with "D"; never shipped enabled by default.
 */
import { coverTransform, landmarkToViewport } from './utils/geometry.js';
import { createEma } from './utils/filters.js';

const MARKER_LIFETIME_MS = 1000;

// Bone connections for drawing the hand skeleton (MediaPipe topology).
const CONNECTIONS = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4], // thumb
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8], // index
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12], // middle
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16], // ring
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20], // pinky
  [0, 17], // palm base
];

export function createDebugHud() {
  let visible = false;
  const renderFps = createEma(0.15);
  let lastFrameAt = 0;
  const markers = [];
  const messages = [];

  return {
    get visible() {
      return visible;
    },
    toggle() {
      visible = !visible;
      return visible;
    },

    /** Record a simulated impact so it can be drawn briefly. */
    addMarker(x, y, label) {
      markers.push({ x, y, label, addedAt: performance.now() });
    },

    /** Show a short-lived status line (dev-control feedback). */
    addMessage(text) {
      messages.push({ text, addedAt: performance.now() });
      if (messages.length > 5) messages.shift();
    },

    clearMarkers() {
      markers.length = 0;
    },

    draw(ctx, frame) {
      const now = performance.now();
      if (lastFrameAt > 0) {
        const dt = now - lastFrameAt;
        if (dt > 0) renderFps.push(1000 / dt);
      }
      lastFrameAt = now;

      prune(markers, now);
      prune(messages, now, 2500);

      if (!visible) return;

      drawStats(ctx, frame, renderFps.value ?? 0);
      drawHands(ctx, frame);
      drawMarkers(ctx, now);
      drawMessages(ctx);
    },
  };

  function drawStats(ctx, frame, fps) {
    const lines = [
      `render fps: ${fps.toFixed(0)}`,
      `inference fps: ${frame.inferenceFps.toFixed(0)}`,
      `delegate: ${frame.delegate}`,
      `app state: ${frame.appState}`,
      `hands: ${frame.hands.length}`,
      ...frame.hands.map(
        (hand, i) =>
          `hand ${i}: ${hand.handedness} (${hand.handednessScore.toFixed(2)})`,
      ),
    ];
    ctx.save();
    ctx.font = '12px ui-monospace, Menlo, monospace';
    const boxWidth = 240;
    const boxHeight = 16 * lines.length + 12;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(12, 48, boxWidth, boxHeight);
    ctx.fillStyle = '#7dff9b';
    lines.forEach((line, i) => ctx.fillText(line, 20, 66 + i * 16));
    ctx.restore();
  }

  function drawHands(ctx, frame) {
    const { video, viewWidth, viewHeight } = frame;
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

    ctx.save();
    for (const hand of frame.hands) {
      ctx.strokeStyle = 'rgba(125, 255, 155, 0.7)';
      ctx.lineWidth = 1.5;
      for (const [a, b] of CONNECTIONS) {
        const pa = toView(hand.landmarks[a]);
        const pb = toView(hand.landmarks[b]);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
      ctx.fillStyle = '#7dff9b';
      for (const lm of hand.landmarks) {
        const p = toView(lm);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawMarkers(ctx, now) {
    ctx.save();
    for (const marker of markers) {
      const age = (now - marker.addedAt) / MARKER_LIFETIME_MS;
      const alpha = 1 - age;
      const radius = 14 + age * 30;
      ctx.strokeStyle = `rgba(255, 90, 90, ${alpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(marker.x, marker.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(marker.x - 8, marker.y);
      ctx.lineTo(marker.x + 8, marker.y);
      ctx.moveTo(marker.x, marker.y - 8);
      ctx.lineTo(marker.x, marker.y + 8);
      ctx.stroke();
      if (marker.label) {
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.font = '11px ui-monospace, Menlo, monospace';
        ctx.fillText(marker.label, marker.x + 12, marker.y - 12);
      }
    }
    ctx.restore();
  }

  function drawMessages(ctx) {
    ctx.save();
    ctx.font = '12px ui-monospace, Menlo, monospace';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    messages.forEach((msg, i) => {
      ctx.fillText(msg.text, 20, window.innerHeight - 20 - i * 16);
    });
    ctx.restore();
  }
}

function prune(list, now, lifetimeMs = MARKER_LIFETIME_MS) {
  while (list.length > 0 && now - list[0].addedAt > lifetimeMs) {
    list.shift();
  }
}

/**
 * Development-only overlay (section 15): FPS + tracker stats, per-hand
 * detector features and state, hand-skeleton/vector drawing, impact
 * markers, live threshold sliders, and a copy-tuning-JSON button.
 * Toggled with "D"; never shipped enabled by default.
 */
import { CONFIG } from './config.js';
import { coverTransform, landmarkToViewport } from './utils/geometry.js';
import { createEma } from './utils/filters.js';

const MARKER_LIFETIME_MS = 1200;
const MESSAGE_LIFETIME_MS = 2500;

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

// Live-tunable thresholds surfaced as sliders: [label, section, key, min, max, step]
const SLIDERS = [
  ['fist threshold', 'tracking', 'fistThreshold', 0.4, 0.95, 0.01],
  ['forward threshold', 'tracking', 'forwardPunchThreshold', 0.4, 0.95, 0.01],
  ['lateral threshold', 'tracking', 'lateralPunchThreshold', 0.4, 0.95, 0.01],
  ['hand cooldown ms', 'tracking', 'handCooldownMs', 200, 900, 10],
  ['min lateral travel px', 'tracking', 'minLateralTravelPx', 20, 200, 5],
  ['min screen speed', 'punch', 'minScreenSpeed', 0.1, 1.5, 0.05],
  ['min scale velocity', 'punch', 'minScaleVelocity', 0.1, 1.5, 0.05],
  ['min depth velocity', 'punch', 'minDepthVelocity', 0.1, 1.5, 0.05],
  ['peak drop ratio', 'punch', 'peakDropRatio', 0.1, 0.6, 0.02],
];

export function createDebugHud() {
  let visible = false;
  const renderFps = createEma(0.15);
  let lastFrameAt = 0;
  const markers = [];
  const messages = [];
  const panel = buildTuningPanel();

  return {
    get visible() {
      return visible;
    },
    toggle() {
      visible = !visible;
      panel.style.display = visible ? 'block' : 'none';
      return visible;
    },

    /** Record an impact so it can be drawn briefly. Color marks the type. */
    addMarker(x, y, label, color = '255, 90, 90') {
      markers.push({ x, y, label, color, addedAt: performance.now() });
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

      prune(markers, now, MARKER_LIFETIME_MS);
      prune(messages, now, MESSAGE_LIFETIME_MS);

      if (!visible) return;

      drawStats(ctx, frame, renderFps.value ?? 0);
      drawHands(ctx, frame);
      drawDetector(ctx, frame);
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
    ];
    for (const d of frame.detectorDebug ?? []) {
      lines.push(
        `— ${d.handId} ${d.state}`,
        `  fist ${d.fistScore.toFixed(2)}  palm ${d.palmWidth.toFixed(0)}px  z ${d.meanZ.toFixed(3)}`,
        `  spd ${d.screenSpeed.toFixed(2)}  scaleV ${d.scaleVelocity.toFixed(2)}  depthV ${d.depthVelocity.toFixed(2)}`,
        `  fwd ${d.forwardPunchScore.toFixed(2)}  lat ${d.lateralPunchScore.toFixed(2)}  cd ${d.cooldownRemainingMs.toFixed(0)}ms`,
      );
    }
    ctx.save();
    ctx.font = '12px ui-monospace, Menlo, monospace';
    const boxWidth = 320;
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

  /** Fist centers and velocity vectors from the detector's smoothed data. */
  function drawDetector(ctx, frame) {
    ctx.save();
    for (const d of frame.detectorDebug ?? []) {
      ctx.fillStyle = 'rgba(255, 210, 90, 0.9)';
      ctx.beginPath();
      ctx.arc(d.cx, d.cy, 5, 0, Math.PI * 2);
      ctx.fill();

      // Velocity vector, scaled to ~150 ms of travel.
      ctx.strokeStyle = 'rgba(255, 210, 90, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(d.cx, d.cy);
      ctx.lineTo(d.cx + d.vxPx * 0.15, d.cy + d.vyPx * 0.15);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 210, 90, 0.9)';
      ctx.font = '11px ui-monospace, Menlo, monospace';
      ctx.fillText(`${d.handId} ${d.state}`, d.cx + 10, d.cy - 10);
    }
    ctx.restore();
  }

  function drawMarkers(ctx, now) {
    ctx.save();
    for (const marker of markers) {
      const age = (now - marker.addedAt) / MARKER_LIFETIME_MS;
      const alpha = 1 - age;
      const radius = 14 + age * 30;
      ctx.strokeStyle = `rgba(${marker.color}, ${alpha})`;
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

/**
 * DOM panel with live threshold sliders and a copy-config button. Attached
 * to <body> so it survives screen re-renders; hidden unless the HUD is on.
 */
function buildTuningPanel() {
  const panel = document.createElement('div');
  panel.id = 'debug-tuning';
  panel.style.display = 'none';

  const title = document.createElement('p');
  title.className = 'debug-tuning-title';
  title.textContent = 'Detector tuning';
  panel.appendChild(title);

  for (const [label, section, key, min, max, step] of SLIDERS) {
    const row = document.createElement('label');
    row.className = 'debug-tuning-row';

    const caption = document.createElement('span');
    const value = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(CONFIG[section][key]);

    caption.textContent = label;
    value.textContent = String(CONFIG[section][key]);
    input.addEventListener('input', () => {
      CONFIG[section][key] = Number(input.value);
      value.textContent = input.value;
    });

    row.append(caption, input, value);
    panel.appendChild(row);
  }

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.textContent = 'Copy tuning JSON';
  copy.addEventListener('click', async () => {
    const json = JSON.stringify(
      { tracking: CONFIG.tracking, punch: CONFIG.punch },
      null,
      2,
    );
    try {
      await navigator.clipboard.writeText(json);
      copy.textContent = 'Copied!';
    } catch {
      // Clipboard can be unavailable (permissions); still surface the JSON.
      console.log(json);
      copy.textContent = 'Logged to console';
    }
    setTimeout(() => (copy.textContent = 'Copy tuning JSON'), 1500);
  });
  panel.appendChild(copy);

  document.body.appendChild(panel);
  return panel;
}

function prune(list, now, lifetimeMs) {
  while (list.length > 0 && now - list[0].addedAt > lifetimeMs) {
    list.shift();
  }
}

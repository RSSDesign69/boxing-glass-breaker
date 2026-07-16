/**
 * App boot and top-level orchestration: permission gate, camera + tracker
 * startup, the requestAnimationFrame loop, and the mouse/keyboard
 * development controls.
 */
import './styles.css';
import { AppState, createAppStateMachine } from './appState.js';
import { startCamera, CameraError } from './camera.js';
import { createHandTracker } from './handTracking.js';
import { createGlassRenderer } from './glassRenderer.js';
import { createGlassModel } from './glassModel.js';
import { createPunchDetector } from './punchDetector.js';
import { createAudioEngine } from './audio.js';
import { createDebugHud } from './debugHud.js';
import { CONFIG } from './config.js';

const app = document.querySelector('#app');
const appState = createAppStateMachine();
const debugHud = createDebugHud();
const punchDetector = createPunchDetector();
const audio = createAudioEngine();

let camera = null;
let tracker = null;
let trackerStatus = 'loading'; // 'loading' | 'ready' | 'failed'
let renderer = null;
let glassModel = null;
let videoElement = null;
let rafId = 0;

renderPermissionGate();

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function renderPermissionGate() {
  app.innerHTML = `
    <section class="gate" aria-labelledby="gate-title">
      <p class="eyebrow">Break Through</p>
      <h1 id="gate-title">Step up to the glass</h1>
      <p>
        Make a fist and punch toward the camera. Each hit will spread the
        cracks until the wall gives way.
      </p>
      <p class="privacy-note">
        Your camera stays on this device. Nothing is uploaded, saved, or
        analyzed remotely. No microphone access is requested.
      </p>
      <button type="button" id="enter-button">Enter the ring</button>
    </section>
  `;
  document
    .querySelector('#enter-button')
    .addEventListener('click', enterSession);
}

function renderCameraError(error) {
  const message =
    error instanceof CameraError
      ? error.message
      : 'Something went wrong while starting the camera.';
  app.innerHTML = `
    <section class="gate" aria-labelledby="error-title">
      <p class="eyebrow">Camera unavailable</p>
      <h1 id="error-title">No picture, no punches</h1>
      <p>${message}</p>
      <p class="privacy-note">
        This experience only ever asks for camera access. Frames are processed
        on this device and never leave your browser.
      </p>
      <button type="button" id="retry-button">Try again</button>
      ${
        import.meta.env.DEV
          ? '<button type="button" id="no-camera-button" class="secondary">Continue without camera (dev)</button>'
          : ''
      }
    </section>
  `;
  document.querySelector('#retry-button').addEventListener('click', () => {
    appState.transition(AppState.PERMISSION_GATE);
    renderPermissionGate();
  });
  // Dev-only escape hatch so visual effects and dev controls can be worked
  // on in environments without a webcam (section 6.8).
  document.querySelector('#no-camera-button')?.addEventListener('click', () => {
    appState.transition(AppState.PERMISSION_GATE);
    renderStage();
    beginSession({ withCamera: false });
  });
}

function renderStage() {
  app.innerHTML = `
    <div class="stage">
      <video id="camera" playsinline muted></video>
      <canvas id="glass-canvas"></canvas>
      <canvas id="fx-canvas"></canvas>
      <div class="hud">
        <p class="hud-note">Camera stays on this device</p>
        <div class="hud-right">
          <p class="hud-instruction" id="hud-instruction">Warming up…</p>
          <button type="button" id="mute-button" class="hud-button">
            Sound: on
          </button>
        </div>
      </div>
    </div>
  `;
  videoElement = document.querySelector('#camera');
  renderer = createGlassRenderer(
    document.querySelector('#glass-canvas'),
    document.querySelector('#fx-canvas'),
    document.querySelector('.stage'),
  );
  glassModel = createGlassModel(renderer.width, renderer.height);
  window.addEventListener('resize', () => {
    glassModel?.setBounds(renderer.width, renderer.height);
  });
  document.querySelector('#mute-button').addEventListener('click', toggleMute);
}

function toggleMute() {
  const nowMuted = audio.toggleMute();
  const button = document.querySelector('#mute-button');
  if (button) button.textContent = nowMuted ? 'Sound: off' : 'Sound: on';
}

function setInstruction(text) {
  const el = document.querySelector('#hud-instruction');
  if (el) el.textContent = text;
}

// ---------------------------------------------------------------------------
// Session startup
// ---------------------------------------------------------------------------

async function enterSession() {
  renderStage();

  try {
    camera = await startCamera(videoElement);
  } catch (error) {
    appState.transition(AppState.CAMERA_ERROR);
    renderCameraError(error);
    return;
  }

  beginSession({ withCamera: true });
}

function beginSession({ withCamera }) {
  // The session always starts from a user click, which is the moment the
  // autoplay policy lets us create/resume the AudioContext.
  audio.unlock();

  // Calibration becomes a real measurement flow in Phase 8; for now it is a
  // pass-through state so the machine's shape is already final.
  appState.transition(AppState.CALIBRATING);
  appState.transition(AppState.READY);

  if (withCamera) {
    setInstruction('Make a fist and punch the glass.');
  } else {
    setInstruction('No camera — mouse and keyboard controls only.');
  }
  // Load the tracker even without a camera so model/WASM loading and
  // delegate selection stay verifiable in camera-less dev environments;
  // detection itself only runs once video frames exist.
  initHandTracker();

  bindDevControls();
  rafId = requestAnimationFrame(frame);
}

async function initHandTracker() {
  try {
    tracker = await createHandTracker();
    trackerStatus = 'ready';
    debugHud.addMessage(`hand tracker ready (${tracker.delegate})`);
  } catch (error) {
    trackerStatus = 'failed';
    debugHud.addMessage(`hand tracker failed: ${error?.message ?? error}`);
    setInstruction(
      'Hand tracking could not load. Mouse and keyboard controls still work.',
    );
  }
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------

function frame(timestampMs) {
  rafId = requestAnimationFrame(frame);

  // Skip work entirely while hidden; rAF is throttled there anyway, and a
  // stale timestamp must not reach the tracker.
  if (document.hidden) return;

  let hands = [];
  let detectorDebug = [];
  if (tracker && trackerStatus === 'ready' && videoElement.videoWidth > 0) {
    const result = tracker.detect(videoElement, timestampMs);
    hands = result.hands;

    // Punch detection pauses outside READY/DAMAGING (section 6.7): no
    // registration during BREAKING, CLEAR_VIEW, or REBUILDING.
    if (result.fresh && appState.is(AppState.READY, AppState.DAMAGING)) {
      const detection = punchDetector.update(
        hands,
        {
          videoWidth: videoElement.videoWidth,
          videoHeight: videoElement.videoHeight,
          viewWidth: renderer.width,
          viewHeight: renderer.height,
        },
        timestampMs,
      );
      detectorDebug = detection.debug;
      for (const punch of detection.punches) applyPunch(punch);
    }
  }

  renderer.drawFrame(timestampMs);
  debugHud.draw(renderer.fxCtx, {
    hands,
    detectorDebug,
    inferenceFps: tracker?.inferenceFps ?? 0,
    delegate: tracker?.delegate ?? trackerStatus,
    appState: appState.state,
    video: videoElement,
    viewWidth: renderer.width,
    viewHeight: renderer.height,
  });
}

/** Route a detected punch into the glass exactly like a simulated impact. */
function applyPunch(punch) {
  const impact = registerImpact({
    x: punch.x,
    y: punch.y,
    strength: punch.strength,
    punchType: punch.punchType,
    directionX: punch.directionX,
    timestamp: punch.timestampMs,
  });
  if (!impact) return;

  if (debugHud.visible) {
    const color =
      punch.punchType === 'forward' ? '255, 160, 60' : '90, 200, 255';
    debugHud.addMarker(
      punch.x,
      punch.y,
      `${punch.punchType} ${punch.handId}`,
      color,
    );
    debugHud.addMessage(
      `punch: ${punch.punchType} ${punch.handId} score ${punch.score.toFixed(2)} ` +
        `strength ${punch.strength.toFixed(2)}`,
    );
  }
}

/**
 * Shared impact path for detected punches and dev-simulated hits: damage
 * the model, draw, sound, and break once the thresholds say so.
 */
function registerImpact(hit) {
  if (!appState.is(AppState.READY, AppState.DAMAGING)) return null;

  const result = glassModel.addImpact(hit);
  if (!result) return null; // debounced duplicate

  renderer.renderCracks(glassModel);
  renderer.addImpactEffects(result.impact);
  audio.playImpact(result.impact.strength);

  if (appState.is(AppState.READY)) appState.transition(AppState.DAMAGING);

  if (glassModel.shouldBreak()) breakGlass();

  return result.impact;
}

/**
 * Break: reached via accumulated damage or the B shortcut. The pane
 * snapshot fractures into falling shards; when they clear, the app parks
 * in CLEAR_VIEW with the unobstructed webcam (Phase 6 adds the timed
 * message + rebuild loop; R resets for now).
 */
function breakGlass() {
  if (!appState.is(AppState.READY, AppState.DAMAGING)) return;

  appState.transition(AppState.BREAKING);
  glassModel.setPhase('breaking');
  audio.playShatter();
  setInstruction('');

  renderer.startShatter(glassModel, () => {
    glassModel.setPhase('clear');
    appState.transition(AppState.CLEAR_VIEW);
    setInstruction(
      'Broken through — press R to rebuild (auto-loop in Phase 6).',
    );
  });
}

// ---------------------------------------------------------------------------
// Development controls (section 6.8) — mouse/keyboard simulation so visual
// effects can be built without live hand tracking.
// ---------------------------------------------------------------------------

function bindDevControls() {
  if (CONFIG.debug.mouseImpacts) {
    document.querySelector('#fx-canvas').addEventListener('click', (event) => {
      simulateImpact(event.clientX, event.clientY);
    });
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    switch (event.key) {
      case ' ':
        event.preventDefault();
        simulateImpact(renderer.width / 2, renderer.height / 2);
        break;
      case 'b':
      case 'B':
        forceBreak();
        break;
      case 'r':
      case 'R':
        resetGlass();
        break;
      case 'd':
      case 'D':
        debugHud.toggle();
        break;
      default:
    }
  });
}

function simulateImpact(x, y) {
  // Simulated hits vary in strength so crack scaling is exercised.
  const strength = 0.35 + Math.random() * 0.6;
  const impact = registerImpact({ x, y, strength, punchType: 'simulated' });

  if (impact && debugHud.visible) {
    debugHud.addMessage(
      `impact #${impact.id} at ${Math.round(impact.x)}, ${Math.round(impact.y)} ` +
        `strength ${impact.strength.toFixed(2)} damage ${glassModel.state.totalDamage.toFixed(0)}`,
    );
  }
}

function forceBreak() {
  breakGlass();
  debugHud.addMessage('forced break — R to reset');
}

function resetGlass() {
  renderer.cancelShatter();

  // Walk whatever state we are in back to READY along valid edges.
  if (appState.is(AppState.BREAKING)) appState.transition(AppState.CLEAR_VIEW);
  if (appState.is(AppState.CLEAR_VIEW)) {
    appState.transition(AppState.REBUILDING);
  }
  if (appState.is(AppState.REBUILDING)) appState.transition(AppState.READY);
  if (appState.is(AppState.DAMAGING)) appState.transition(AppState.READY);

  glassModel.reset();
  punchDetector.reset();
  renderer.setPaneOpacity(1);
  renderer.renderCracks(glassModel);
  debugHud.clearMarkers();
  setInstruction('Make a fist and punch the glass.');
  debugHud.addMessage('glass reset');
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

window.addEventListener('pagehide', () => {
  cancelAnimationFrame(rafId);
  camera?.stop();
  tracker?.close();
});

// Dev-only introspection handle for debugging and automated checks.
if (import.meta.env.DEV) {
  window.__breakThrough = {
    get glassModel() {
      return glassModel;
    },
    get appState() {
      return appState.state;
    },
    get trackerStatus() {
      return trackerStatus;
    },
    get punchDetector() {
      return punchDetector;
    },
    get renderer() {
      return renderer;
    },
    config: CONFIG,
    applyPunch,
  };
}

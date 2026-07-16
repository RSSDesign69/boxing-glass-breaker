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
import { createGloveRenderer } from './gloveRenderer.js';
import { createAudioEngine } from './audio.js';
import { createDebugHud } from './debugHud.js';
import { CONFIG } from './config.js';

const GLOVES_SESSION_KEY = 'break-through-gloves';
const CALIBRATION_SESSION_KEY = 'break-through-calibration';

const app = document.querySelector('#app');
const appState = createAppStateMachine();
const debugHud = createDebugHud();
const punchDetector = createPunchDetector();
const gloveRenderer = createGloveRenderer();
const audio = createAudioEngine();

let camera = null;
let tracker = null;
let trackerStatus = 'loading'; // 'loading' | 'ready' | 'failed'
let renderer = null;
let glassModel = null;
let videoElement = null;
let rafId = 0;
let loopTimers = [];
// Session-only preference (section 12); never any camera data.
let glovesEnabled = sessionStorage.getItem(GLOVES_SESSION_KEY) === '1';
// Session-only numeric calibration baselines; never any camera imagery.
let calibration = loadStoredCalibration();
// Live calibration measurement while in CALIBRATING (null otherwise).
let calibrationRun = null;
let lastHandSeenAt = 0;
let noHandsHintShown = false;

function loadStoredCalibration() {
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(CALIBRATION_SESSION_KEY) ?? 'null',
    );
    if (
      parsed &&
      Number.isFinite(parsed.palmWidth) &&
      Number.isFinite(parsed.meanZ) &&
      Number.isFinite(parsed.noiseSpeed)
    ) {
      return parsed;
    }
  } catch {
    // Corrupt value: ignore and recalibrate.
  }
  return null;
}

renderPermissionGate();

// ---------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------

function renderPermissionGate() {
  // Desktop/laptop is the supported MVP target (section 10); warn on
  // narrow or touch-primary devices without blocking them.
  const simplifiedDevice =
    window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 900;

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
      ${
        simplifiedDevice
          ? `<p class="device-notice">
              Heads up: this experience is built for desktop and laptop
              browsers with a webcam. On phones, tablets, or small windows
              it may run in a simplified or unreliable form.
            </p>`
          : ''
      }
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
          <button type="button" id="recalibrate-button" class="hud-button">
            Recalibrate
          </button>
          <button type="button" id="glove-button" class="hud-button">
            Gloves: off
          </button>
          <button type="button" id="mute-button" class="hud-button">
            Sound: on
          </button>
        </div>
      </div>
      <p class="reset-message" id="reset-message"></p>
      <section class="calibration" id="calibration" hidden>
        <p class="eyebrow">Quick calibration</p>
        <h2>Hold up a fist</h2>
        <p id="calibration-status">
          Stand about arm's length from the camera and hold a closed fist
          steady for a moment.
        </p>
        <div class="calibration-progress">
          <div id="calibration-bar"></div>
        </div>
        <button type="button" id="skip-calibration" class="secondary">
          Skip
        </button>
      </section>
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
  document
    .querySelector('#glove-button')
    .addEventListener('click', toggleGloves);
  document
    .querySelector('#recalibrate-button')
    .addEventListener('click', recalibrate);
  document
    .querySelector('#skip-calibration')
    .addEventListener('click', () => finishCalibration(null));
  updateGloveButton();
}

function toggleMute() {
  const nowMuted = audio.toggleMute();
  const button = document.querySelector('#mute-button');
  if (button) button.textContent = nowMuted ? 'Sound: off' : 'Sound: on';
}

function toggleGloves() {
  glovesEnabled = !glovesEnabled;
  sessionStorage.setItem(GLOVES_SESSION_KEY, glovesEnabled ? '1' : '0');
  gloveRenderer.reset();
  updateGloveButton();
}

function updateGloveButton() {
  const button = document.querySelector('#glove-button');
  if (button) button.textContent = glovesEnabled ? 'Gloves: on' : 'Gloves: off';
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

  // Apply any calibration stored earlier in this browser session so a skip
  // still benefits from the last measurement.
  if (calibration) punchDetector.setCalibration(calibration);

  // Load the tracker even without a camera so model/WASM loading and
  // delegate selection stay verifiable in camera-less dev environments;
  // detection itself only runs once video frames exist.
  initHandTracker();
  bindDevControls();
  rafId = requestAnimationFrame(frame);

  appState.transition(AppState.CALIBRATING);
  if (withCamera) {
    startCalibration();
  } else {
    // No camera: nothing to measure.
    appState.transition(AppState.READY);
    setInstruction('No camera — mouse and keyboard controls only.');
  }
}

// ---------------------------------------------------------------------------
// Calibration (section 5 CALIBRATING): measure baseline palm size, depth,
// and idle motion noise from a short steady fist hold. Numbers only —
// no camera imagery is stored anywhere.
// ---------------------------------------------------------------------------

function startCalibration() {
  calibrationRun = { samples: [], holdStartedAt: null, lastFistAt: 0 };
  const overlay = document.querySelector('#calibration');
  if (overlay) overlay.hidden = false;
  setCalibrationStatus(
    "Stand about arm's length from the camera and hold a closed fist steady for a moment.",
  );
  setInstruction('');
}

/** Feed one fresh detector-debug frame into the calibration measurement. */
function collectCalibrationSample(detectorDebug, timestampMs) {
  if (!calibrationRun) return;
  const C = CONFIG.calibration;

  const fist = detectorDebug.find(
    (d) => d.fistScore >= CONFIG.tracking.fistThreshold,
  );

  if (!fist) {
    // Tolerate brief tracking dropouts; otherwise restart the hold.
    if (
      calibrationRun.holdStartedAt !== null &&
      timestampMs - calibrationRun.lastFistAt > C.maxGapMs
    ) {
      calibrationRun.samples = [];
      calibrationRun.holdStartedAt = null;
      setCalibrationStatus('Lost the fist — hold it steady again.');
      setCalibrationProgress(0);
    }
    return;
  }

  calibrationRun.lastFistAt = timestampMs;
  calibrationRun.holdStartedAt ??= timestampMs;
  calibrationRun.samples.push({
    palmWidth: fist.palmWidth,
    meanZ: fist.meanZ,
    screenSpeed: fist.screenSpeed,
  });

  const heldMs = timestampMs - calibrationRun.holdStartedAt;
  setCalibrationStatus('Hold it…');
  setCalibrationProgress(Math.min(heldMs / C.holdMs, 1));

  if (heldMs >= C.holdMs && calibrationRun.samples.length >= 10) {
    const values = {
      palmWidth: median(calibrationRun.samples.map((s) => s.palmWidth)),
      meanZ: median(calibrationRun.samples.map((s) => s.meanZ)),
      noiseSpeed: median(calibrationRun.samples.map((s) => s.screenSpeed)),
    };
    finishCalibration(values);
  }
}

/** Leave CALIBRATING; values are null when the user skipped. */
function finishCalibration(values) {
  if (!appState.is(AppState.CALIBRATING)) return;
  calibrationRun = null;

  if (values) {
    calibration = values;
    sessionStorage.setItem(CALIBRATION_SESSION_KEY, JSON.stringify(values));
    punchDetector.setCalibration(values);
    debugHud.addMessage(
      `calibrated: palm ${values.palmWidth.toFixed(0)}px z ${values.meanZ.toFixed(3)} ` +
        `noise ${values.noiseSpeed.toFixed(3)}`,
    );
  }

  const overlay = document.querySelector('#calibration');
  if (overlay) overlay.hidden = true;
  punchDetector.reset();
  appState.transition(AppState.READY);
  lastHandSeenAt = performance.now();
  noHandsHintShown = false;
  setInstruction('Make a fist and punch the glass.');
}

function recalibrate() {
  // Without a camera nothing can be measured, but the overlay still opens
  // (dev mode) and Skip exits cleanly.
  if (!appState.is(AppState.READY, AppState.DAMAGING)) return;
  resetGlass(); // lands in READY from any punch-phase state
  appState.transition(AppState.CALIBRATING);
  startCalibration();
}

function setCalibrationStatus(text) {
  const el = document.querySelector('#calibration-status');
  if (el) el.textContent = text;
}

function setCalibrationProgress(ratio) {
  const bar = document.querySelector('#calibration-bar');
  if (bar) bar.style.width = `${Math.round(ratio * 100)}%`;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
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
    // registration during BREAKING, CLEAR_VIEW, or REBUILDING. During
    // CALIBRATING the detector runs purely as a feature extractor for the
    // baseline measurement; its punches are discarded.
    if (
      result.fresh &&
      appState.is(AppState.READY, AppState.DAMAGING, AppState.CALIBRATING)
    ) {
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

      if (appState.is(AppState.CALIBRATING)) {
        collectCalibrationSample(detectorDebug, timestampMs);
      } else {
        for (const punch of detection.punches) applyPunch(punch);
        updateNoHandsGuidance(hands, timestampMs);
      }
    }
  }

  renderer.drawFrame(timestampMs);

  if (glovesEnabled && hands.length > 0) {
    // Lighter smoothing for hands mid-punch so the glove keeps up.
    const activeHands = new Set(
      detectorDebug
        .filter((d) => d.state === 'ACCELERATING' || d.state === 'COOLDOWN')
        .map((d) => d.handId),
    );
    gloveRenderer.draw(renderer.fxCtx, {
      hands,
      video: videoElement,
      viewWidth: renderer.width,
      viewHeight: renderer.height,
      activeHands,
    });
  }

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

/**
 * Low-light / no-hand guidance (section: Phase 8): if tracking loses the
 * user's hands for a while during play, say so instead of feeling broken.
 */
function updateNoHandsGuidance(hands, timestampMs) {
  if (hands.length > 0) {
    lastHandSeenAt = timestampMs;
    if (noHandsHintShown) {
      noHandsHintShown = false;
      setInstruction('Make a fist and punch the glass.');
    }
    return;
  }
  if (
    !noHandsHintShown &&
    timestampMs - lastHandSeenAt > CONFIG.calibration.noHandsHintAfterMs
  ) {
    noHandsHintShown = true;
    setInstruction(
      'No hands in view — step back so your fists are visible, and add light if the room is dark.',
    );
  }
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
 * snapshot fractures into falling shards; when they clear, CLEAR_VIEW
 * holds the unobstructed webcam, the reset message fades in near the end,
 * and the glass rebuilds — an indefinitely repeatable loop (section 5).
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
    scheduleClearView();
  });
}

/** CLEAR_VIEW timing: several clean seconds, then the message, then rebuild. */
function scheduleClearView() {
  clearLoopTimers();
  const { clearViewMs, resetMessageDurationMs } = CONFIG.timing;
  loopTimers.push(
    setTimeout(
      () => showResetMessage(true),
      Math.max(0, clearViewMs - resetMessageDurationMs),
    ),
    setTimeout(startRebuild, clearViewMs),
  );
}

function startRebuild() {
  clearLoopTimers();
  showResetMessage(false); // fades out as reconstruction begins

  appState.transition(AppState.REBUILDING);
  glassModel.reset();
  punchDetector.reset();
  renderer.renderCracks(glassModel); // clears the crack layer
  renderer.startRebuild(CONFIG.timing.rebuildMs);

  loopTimers.push(
    setTimeout(() => {
      renderer.setPaneOpacity(1);
      appState.transition(AppState.READY);
      setInstruction('Make a fist and punch the glass.');
    }, CONFIG.timing.rebuildMs),
  );
}

function showResetMessage(visible) {
  const el = document.querySelector('#reset-message');
  if (!el) return;
  el.textContent = CONFIG.timing.resetMessageText;
  el.classList.toggle('visible', visible);
}

function clearLoopTimers() {
  for (const timer of loopTimers) clearTimeout(timer);
  loopTimers = [];
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
      case 'g':
      case 'G':
        toggleGloves();
        break;
      case 'c':
      case 'C':
        recalibrate();
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
  clearLoopTimers();
  showResetMessage(false);

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
    get gloveRenderer() {
      return gloveRenderer;
    },
    get glovesEnabled() {
      return glovesEnabled;
    },
    get calibration() {
      return calibration;
    },
    config: CONFIG,
    applyPunch,
    collectCalibrationSample,
    finishCalibration,
  };
}

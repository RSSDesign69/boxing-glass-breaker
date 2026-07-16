# Boxing Glass Breaker — Technical Handoff

## 1. Project objective

Build an original, clean-room boxing-oriented webcam interaction inspired by the general concept of browser-based camera effects. Do not copy, adapt, import, or refactor code from the Fog Mirror repository:

1. The user grants camera access and sees a mirrored live webcam feed behind a full-screen glass wall.
2. A punch toward the camera is detected from hand landmarks.
3. The user can choose **bare-hand mode** or **virtual-glove mode** before or during the session. Virtual gloves are optional visual overlays; punch detection works in either mode.
4. Valid forward punches and lateral/cross-frame punches create localized impact points, persistent cracks, and visual/audio feedback.
5. Repeated punches progressively expand cracks and loosen glass fragments. Progress is communicated through the crack pattern only—no damage meter or punch counter.
6. After enough accumulated damage, the wall catastrophically breaks. Glass shards fall away and the unobstructed mirrored webcam remains visible.
7. The clear webcam remains visible for **6 seconds by default** (configurable from 5–7 seconds). Near the end of that interval, show: **“Congrats. Now hit harder this time”** immediately before reconstruction.
8. The glass reconstructs, damage resets, and the interaction can begin again.
9. All camera processing remains on-device. No webcam frames are uploaded or saved.

Working title: **Break Through**.

---

## 2. Feasibility assessment

Yes, this is possible with a similar category of browser technologies, implemented independently:

- Browser webcam via `navigator.mediaDevices.getUserMedia()`
- MediaPipe Tasks Vision `HandLandmarker`
- `<video>` for the mirrored camera
- Canvas 2D for glass, cracks, highlights, impact flashes, and shards
- `requestAnimationFrame()` for rendering and physics updates
- Web Audio API or local audio files for impact and shatter sounds
- HTML/CSS/JavaScript, served over `localhost` or HTTPS

The primary technical challenge is **gesture recognition**. The interaction must classify a fist and estimate a fast punch event from motion over time.

A normal webcam cannot measure true physical impact. The implementation must infer a punch from a combination of:

- Fist confidence
- Palm/fist center velocity
- Forward movement toward the camera, estimated from landmark `z` values and apparent palm size
- A short deceleration/retraction pattern
- Cooldown and hysteresis rules to prevent one movement from registering as multiple punches

This can feel convincing, but it will require calibration and threshold tuning across lighting, camera positions, body sizes, and boxing styles.

---

## 3. Clean-room implementation boundary

The original Fog Mirror repository has no published software license or explicit reuse grant. Therefore, this project must be implemented independently in a new repository and must not contain copied or adapted source code from that repository.

### Allowed inspiration

The team may use high-level, non-proprietary ideas such as:

- A mirrored webcam feed rendered in the browser
- On-device MediaPipe hand tracking
- Canvas-based visual effects layered over video
- Gesture-triggered interaction states
- Local-only camera processing

These are general technical patterns, not source code.

### Prohibited carryover

Do not:

- Copy or paste any HTML, CSS, JavaScript, comments, constants, functions, algorithms, assets, README text, or project structure from the Fog Mirror repository
- Import the downloaded Fog Mirror ZIP into the new repository
- Preserve the original repository's commit history
- Use the original author's remote as `origin` or `upstream`
- Ask an AI coding agent to “convert,” “refactor,” or “modify” the original implementation
- Reproduce distinctive source-specific naming, UI copy, controls, endpoints, or implementation details

### Independent-development requirements

- Start from a fresh Vite vanilla JavaScript scaffold.
- Write camera, tracking, coordinate mapping, punch detection, rendering, and state logic from first principles using official browser and MediaPipe documentation.
- Use only self-created or properly licensed visual/audio assets.
- Document external packages and asset licenses in `THIRD_PARTY_NOTICES.md`.
- Keep the Fog Mirror repository outside the working project. It may be cited as visual inspiration in a brief attribution note, but it is not a code dependency.
- Do not compare new functions line-by-line against the original source during implementation.

### Privacy baseline

The new implementation must:

- Request camera permission only; never request microphone permission
- Process camera frames locally in the browser
- Never upload, save, or persist webcam frames or derived captures
- Avoid analytics and remote logging in the MVP

---

## 4. Recommended architecture

The current one-file prototype can support an initial proof of concept, but the boxing version should be split into modules so Cursor, Claude Code, and Codex can work safely across sessions.

### Recommended project structure

```text
/
├── index.html
├── package.json                       # optional for Vite workflow
├── vite.config.js                     # optional
├── src/
│   ├── main.js                        # app boot and top-level orchestration
│   ├── styles.css
│   ├── camera.js                      # webcam lifecycle and video drawing
│   ├── handTracking.js                # MediaPipe setup and landmark output
│   ├── punchDetector.js               # temporal fist/punch state machine
│   ├── glassModel.js                  # damage, crack graph, break thresholds
│   ├── glassRenderer.js               # glass pane, cracks, impact effects
│   ├── gloveRenderer.js               # optional landmark-anchored virtual gloves
│   ├── shardSystem.js                 # shard generation and falling physics
│   ├── audio.js                       # impact/shatter sound management
│   ├── config.js                      # tunable constants
│   ├── debugHud.js                    # landmark/velocity/calibration overlays
│   └── utils/
│       ├── geometry.js
│       ├── filters.js
│       └── random.js
├── assets/
│   └── audio/
│       ├── impact-1.mp3
│       ├── impact-2.mp3
│       ├── impact-3.mp3
│       └── shatter.mp3
├── tests/
│   ├── punchDetector.test.js
│   └── glassModel.test.js
├── README.md
└── BOXING_GLASS_HANDOFF.md             # this document; keep current
```

### Build-tool recommendation

Use **Vite + vanilla JavaScript** for maintainability and a clean-room implementation. No React framework is necessary. A no-build single-file version is possible, but it will become difficult to maintain once punch detection, crack generation, particle physics, audio, and debugging are added.

Suggested commands:

```bash
npm install
npm run dev
npm run build
npm run preview
```

Camera access works on `http://localhost` during development and HTTPS in production.

---

## 5. Interaction state machine

Use a single explicit app state. Avoid scattered booleans.

```text
PERMISSION_GATE
  → CALIBRATING
  → READY
  → DAMAGING
  → BREAKING
  → CLEAR_VIEW
  → REBUILDING
  → READY
```

### State definitions

#### `PERMISSION_GATE`

- Explain that camera processing is local.
- User presses a button to begin.
- Request camera only; do not request microphone.

#### `CALIBRATING`

- Ask the user to stand approximately arm’s length from the camera.
- Ask them to hold a fist in a neutral guard position for 1–2 seconds.
- Measure baseline palm size, baseline landmark depth, and normal motion noise.
- Allow skip/retry for the first prototype.

#### `READY`

- Glass is intact.
- Punch detector is armed.
- HUD instruction: “Make a fist and punch the glass.”
- Both forward punches toward the camera and lateral punches crossing the frame are eligible.
- Render virtual gloves only when the user has enabled glove mode.

#### `DAMAGING`

- At least one punch has landed.
- Cracks persist and spread with each impact.
- Detector returns to `READY` after each punch cooldown, while visual state remains damaged.

#### `BREAKING`

- Disable punch registration.
- Convert glass regions into shards.
- Trigger global shatter sound and screen impulse.
- Animate shards downward/outward for roughly 1–1.5 seconds.

#### `CLEAR_VIEW`

- Remove or fully fade the glass and shard layers.
- Show the unobstructed mirrored camera; virtual gloves may remain visible when enabled.
- Remain for `CLEAR_VIEW_DURATION_MS = 6000` by default.
- During the final `RESET_MESSAGE_DURATION_MS = 1400` of this interval, display the centered message: **“Congrats. Now hit harder this time”**.
- The message must fade in after the user has had several seconds of clean webcam view, then fade out as reconstruction begins.

#### `REBUILDING`

- Reconstruct glass with a short fade/slide/materialization animation.
- Clear crack graph, shards, hit count, and accumulated damage.
- Return to `READY`.

---

## 6. Punch detection specification

## 6.1 MediaPipe configuration

Start with the existing `HandLandmarker` and change:

```js
numHands: 2;
```

Keep:

- `runningMode: "VIDEO"`
- GPU delegate with CPU fallback
- Detection only on a fresh video frame
- Mirrored coordinate conversion

For a stronger phase-two detector, optionally add MediaPipe `PoseLandmarker` so wrist, elbow, and shoulder motion can verify extension and retraction. Do not add Pose Landmarker until the hand-only proof of concept is measured.

## 6.2 Per-hand tracked features

For each detected hand, calculate every fresh frame:

- `timestamp`
- `handedness`
- `fistCenter2D`: average of wrist and MCP landmarks `[0, 5, 9, 13, 17]`
- `palmWidth2D`: distance between landmarks `5` and `17`
- `palmAreaProxy`: squared palm width or polygon area of MCP points
- `meanZ`: average `z` of palm landmarks
- `fistScore`: 0–1 score based on all four fingers being curled
- `screenVelocity`: smoothed pixels/second of fist center
- `depthVelocityZ`: smoothed change in `meanZ` per second
- `scaleVelocity`: smoothed relative change in palm size per second
- `acceleration`: change in screen/depth velocity
- recent samples in a 250–400 ms ring buffer

Use a One Euro filter or exponential moving average for position and depth. Preserve raw values for peak detection.

## 6.3 Fist classifier

A finger is curled when the fingertip is closer to the wrist than its MCP joint, with tolerance. Implement this independently using landmark geometry and test-driven thresholds:

```js
curl(8, 5) && curl(12, 9) && curl(16, 13) && curl(20, 17);
```

Improve this from a boolean to a score. Evaluate each finger using both:

- tip-to-wrist distance versus MCP-to-wrist distance
- joint-angle bend across MCP/PIP/DIP where available

A fist is valid when `fistScore >= 0.75` for at least 2 consecutive detection frames.

## 6.4 Punch event heuristic

Support two punch families with one temporal detector:

- **Forward punch:** jab/cross motion toward the camera, inferred mainly from palm scale growth and landmark-depth change.
- **Lateral punch:** hook-like or cross-frame motion, inferred mainly from high horizontal velocity followed by a sharp deceleration or direction change.

A punch should register only when all shared conditions are satisfied:

1. **Fist held:** fist score exceeds threshold.
2. **Armed:** hand has spent at least 100–150 ms away from a recent impact state.
3. **Intentional acceleration:** motion exceeds the calibrated noise floor for a minimum number of frames.
4. **Impact peak:** the relevant velocity peaks and then drops sharply, changes direction, or reaches a near-camera threshold.
5. **Cooldown:** no second registration from that hand for approximately 350–550 ms.
6. **Retraction/rearm:** require the hand to move away, reverse direction, open, or slow before it can produce another hit.

Calculate two candidate scores:

```js
forwardPunchScore =
  0.4 * normalizedScaleVelocity +
  0.35 * normalizedDepthVelocity +
  0.15 * normalizedScreenSpeed +
  0.1 * fistScore;

lateralPunchScore =
  0.55 * normalizedHorizontalSpeed +
  0.2 * normalizedHorizontalDeceleration +
  0.15 * normalizedScreenSpeed +
  0.1 * fistScore;
```

Register the strongest valid candidate:

```js
const punchType =
  forwardPunchScore >= lateralPunchScore ? 'forward' : 'lateral';

const punchScore = Math.max(forwardPunchScore, lateralPunchScore);

if (
  fistScore >= 0.75 &&
  punchScore >= thresholdFor(punchType) &&
  impactPeakDetected(punchType) &&
  handState === 'ARMED'
) {
  emitPunch({ punchType, punchScore, x, y, handId });
}
```

For lateral impacts, place the impact slightly ahead of the fist along its direction of travel so the crack appears where the knuckles meet the pane. Require meaningful horizontal displacement to prevent ordinary guard movement from registering.

The exact sign of MediaPipe `z` must be verified in the debug HUD; do not assume it without observing live values.

## 6.5 Hand-level state machine

```text
OPEN_OR_IDLE
  → FIST_READY
  → ACCELERATING
  → IMPACT
  → COOLDOWN
  → RETRACTING
  → FIST_READY or OPEN_OR_IDLE
```

A temporal state machine is mandatory. Do not implement punch detection as a single-frame threshold.

## 6.6 Impact location

Use the mapped 2D fist center at the impact frame. Offset slightly toward the leading knuckles if stable enough. Clamp impacts away from the outermost 2% of the viewport so cracks remain visible.

## 6.7 False-positive controls

- Do not count a stationary fist.
- Do not count normal guard movement.
- Do not count a fist continuously held near the camera.
- Do not count the same forward motion twice.
- Ignore landmarks with low confidence or large frame-to-frame teleportation.
- Add a minimum time between impacts globally, initially 180 ms, to prevent two hands from producing accidental simultaneous duplicates.
- Pause detection while the app is in `BREAKING`, `CLEAR_VIEW`, or `REBUILDING`.

## 6.8 Mouse/keyboard development fallback

Provide non-camera controls for development:

- Mouse click: create impact at cursor.
- `Space`: create impact at screen center.
- `B`: trigger full break.
- `R`: reset glass.
- `D`: toggle debug HUD.

These controls are essential so visual effects can be developed independently of hand tracking.

---

## 7. Glass damage model

Use a deterministic model separate from rendering.

### Core data

```js
GlassState = {
  phase: 'intact' | 'damaged' | 'breaking' | 'clear' | 'rebuilding',
  totalDamage: 0,
  hitCount: 0,
  impacts: [],
  crackSegments: [],
  weakenedCells: [],
  shards: [],
};
```

### Impact object

```js
Impact = {
  id,
  x,
  y,
  timestamp,
  strength, // 0–1, derived from punch score
  punchType, // "forward" | "lateral" | "simulated"
  radius,
  seed,
};
```

### Damage progression

Use both hit count and strength so the interaction remains predictable:

- Each punch adds `BASE_DAMAGE + strength * STRENGTH_DAMAGE`.
- Typical break target: **8–14 clear punches**.
- Initial default: break around 10 medium-strength punches.
- Strong hits create larger radial cracks but should not instantly break the entire pane.
- Repeated hits near existing cracks receive a damage multiplier.
- Hits distributed across the pane should still eventually break it.

Suggested defaults:

```js
BREAK_DAMAGE = 100;
BASE_DAMAGE = 7;
STRENGTH_DAMAGE = 5;
NEAR_CRACK_MULTIPLIER = 1.25;
MIN_HITS_BEFORE_BREAK = 6;
MAX_HITS_BEFORE_FORCED_BREAK = 14;
CLEAR_VIEW_DURATION_MS = 6000;
```

Break when:

```js
(totalDamage >= BREAK_DAMAGE && hitCount >= MIN_HITS_BEFORE_BREAK) ||
  hitCount >= MAX_HITS_BEFORE_FORCED_BREAK;
```

---

## 8. Crack-generation system

Canvas 2D can produce a convincing stylized effect without a real fracture solver.

### Per-impact crack pattern

Create:

1. A small opaque impact chip at the center.
2. 5–10 radial crack branches.
3. 1–3 concentric or arc-shaped stress fractures.
4. Secondary branches from selected radial segments.
5. Tiny glass dust particles and brief white highlight.

Use a seeded random generator per impact so cracks do not change between frames.

### Crack growth rules

- Branch count and length scale with punch strength.
- Stop or deflect branches near canvas boundaries.
- When a branch approaches an existing crack, connect or terminate it.
- Repeated hits within a configurable radius extend existing cracks more aggressively.
- Preserve all generated path geometry in model coordinates; rendering should only draw it.

### Suggested crack representation

```js
CrackSegment = {
  points: [{x, y}, ...],
  width,
  opacity,
  generation,
  impactId
}
```

Render each crack in multiple passes:

- dark/gray shadow line offset by 1–2 px
- bright white highlight line
- subtle blur/glow around the impact center

This dual-line treatment gives cracks depth against both dark and light webcam backgrounds.

---

## 9. Glass rendering

Use two stacked canvases if it simplifies separation:

```html
<video id="video"></video>
<canvas id="glassCanvas"></canvas>
<canvas id="fxCanvas"></canvas>
```

### Intact glass appearance

Use a deliberate hybrid of **clear window glass** and a **stylized video-game barrier**. The webcam must remain clearly visible, while the pane feels more dramatic and reactive than ordinary architectural glass.

Add:

- mostly transparent clear-glass body with a slight cool tint
- faint vertical/diagonal reflection gradients
- edge vignette and crisp border highlight
- restrained luminous edge energy or scan-line accents
- subtle surface noise and scratches
- occasional moving specular sheen
- short-lived energy ripples around impacts, without turning the pane into an opaque force field

The material should read approximately 70% real glass and 30% game barrier. Do not heavily blur or obscure the webcam.

### Impact feedback

On each hit:

- 80–140 ms white flash at impact
- circular shock ring
- brief canvas/screen shake of 2–6 px based on strength
- localized glass dust particles
- impact sound selected from a small variation pool
- optional `navigator.vibrate(20)` on supported mobile devices

Respect `prefers-reduced-motion`; reduce shake, particle count, and rebuilding movement.

---

## 10. Shattering and shard physics

### Recommended MVP approach

Use custom lightweight particle physics rather than a heavy physics engine.

At break time:

1. Generate a Voronoi-like or triangulated set of polygon shards across the viewport.
2. Assign each shard:
   - polygon points
   - center
   - initial velocity outward from nearest/highest-damage impact
   - downward velocity
   - angular velocity
   - gravity
   - opacity
3. Clip the glass material to each polygon and render it independently.
4. Simulate until shards move below the viewport or timeout.

A true Voronoi library is optional. For the first version, generate irregular triangles around crack hubs and a coarse viewport grid. Visual believability matters more than physically exact fracture topology.

### Shard object

```js
Shard = {
  points,
  cx,
  cy,
  x,
  y,
  vx,
  vy,
  rotation,
  angularVelocity,
  gravity,
  opacity,
  delayMs,
};
```

### Physics defaults

```js
gravity = 1400;            // px/s², tune by viewport
outwardSpeed = 80–360;     // px/s
initialUpwardSpeed = -40 to -220;
angularVelocity = -4 to 4; // radians/s
shatterDuration = 1200–1700 ms;
```

Add slight staggered delays so the pane collapses rather than disappearing as one sheet.

### Performance constraint

The primary deployment is desktop/laptop. Target 60 FPS on a recent laptop at common 1080p-class viewport sizes. Start with 70–110 shards and reduce count adaptively based on measured frame time or viewport area. Mobile optimization is out of MVP scope; the interface may show an unsupported/simplified-device notice on narrow or touch-primary devices.

---

## 11. Audio

Use several short local impact sounds and one shatter sound.

Requirements:

- Audio begins only after the user’s start gesture to satisfy autoplay policies.
- Randomize impact sound and playback rate slightly.
- Scale volume by punch strength.
- Add a mute control.
- Do not request microphone permission.
- Use properly licensed or self-created audio assets and document their licenses.

Optional: use Web Audio synthesis for a low-frequency thump underneath the sampled crack sound.

---

## 12. UI and visual direction

### Start gate copy

Suggested:

> Step up to the glass. Make a fist and punch toward the camera. Each hit will spread the cracks until the wall gives way. Your camera stays on this device.

Button: **Enter the ring**

### In-session HUD

Keep UI minimal:

- top-left: concise on-device privacy note
- top-right: optional debug/state label in development only
- controls: mute, recalibrate, reset, and **Virtual gloves: On/Off**
- no punch count, health bar, progress ring, or damage meter in the production experience

Progression must be inferred only from accumulating cracks, impact chips, loosened fragments, and increasing barrier instability.

### Virtual glove mode

Virtual gloves are an optional visual layer, not a requirement for detection.

MVP implementation:

- Use MediaPipe hand landmarks to estimate glove center, scale, and rotation.
- Render a stylized 2D glove sprite or vector shape anchored over each detected fist.
- Scale from palm width and orient from wrist-to-middle-MCP direction.
- Smooth transforms to reduce jitter, but reduce smoothing during a detected punch to avoid visible lag.
- Mirror glove placement consistently with the webcam.
- Hide the overlay when tracking confidence is low or the hand is open.
- Persist the user’s glove preference for the current browser session; do not persist camera data.
- Provide at least one neutral glove treatment initially; color customization is optional polish.

This landmark-anchored overlay will not perfectly occlude fingers or pass behind the body. Full AR-quality gloves would require hand segmentation or a 3D model and are outside the MVP.

### Boxing feel

Use restrained boxing cues with selective game-barrier energy:

- corner-style typography and compact controls
- dark neutral chrome with white/red accents
- sharp, physical impact sound design
- barrier glow and impact pulses kept secondary to realistic crack behavior
- no explicit progress UI

---

## 13. Privacy, security, and deployment

- Camera must run on `localhost` or HTTPS.
- Keep all frame processing in-browser.
- Do not add any remote capture, upload, save, analytics, or telemetry endpoint.
- Do not store frames in local storage, analytics, or logs.
- Avoid third-party analytics in the prototype.
- Add a visible camera stop/exit action if the experience is embedded in a larger site.
- Stop media tracks on page unload where practical.
- Document that MediaPipe model files are downloaded from external CDNs unless they are self-hosted.

For production reliability and privacy messaging, consider self-hosting the MediaPipe JS/WASM/model assets.

---

## 14. Configuration file

Put all tuning values in `src/config.js`. Do not scatter magic numbers.

```js
export const CONFIG = {
  tracking: {
    numHands: 2,
    fistThreshold: 0.75,
    fistConfirmFrames: 2,
    handCooldownMs: 450,
    globalImpactCooldownMs: 180,
    forwardPunchThreshold: 0.72,
    lateralPunchThreshold: 0.76,
    minLateralTravelPx: 70,
    sampleWindowMs: 350,
    teleportThresholdViewportRatio: 0.22,
  },
  punch: {
    scoreThreshold: 0.68,
    minScreenSpeed: 0.5,
    minScaleVelocity: 0.35,
    minDepthVelocity: 0.35,
    peakDropRatio: 0.3,
  },
  damage: {
    breakDamage: 100,
    baseDamage: 7,
    strengthDamage: 5,
    nearCrackMultiplier: 1.25,
    minHitsBeforeBreak: 6,
    maxHitsBeforeForcedBreak: 14,
  },
  timing: {
    clearViewMs: 6000,
    resetMessageDurationMs: 1400,
    resetMessageText: 'Congrats. Now hit harder this time',
    shatterMs: 1450,
    rebuildMs: 700,
  },
  rendering: {
    desktopShardCount: 90,
    reducedMotionShardCount: 24,
    maxDevicePixelRatio: 2,
  },
  debug: {
    enabled: false,
    mouseImpacts: true,
  },
};
```

These are starting values, not validated production thresholds.

---

## 15. Debug HUD requirements

A debug mode is essential for tuning punch detection. Display:

- FPS
- detector inference FPS
- handedness
- fist score
- palm width/area
- mean Z
- screen velocity
- scale velocity
- depth velocity
- punch score
- hand detector state
- app state
- impact cooldown remaining
- calibration baseline values

Draw optional landmarks, fist center, velocity vector, and impact location.

Allow live threshold sliders in debug mode. Add a button to copy the current tuning configuration as JSON.

Do not ship debug mode enabled by default.

---

## 15A. GitHub ownership and clean repository setup

This project must live in a **new repository owned by the user** and begin from an empty or freshly scaffolded Vite project. The original author's repository and downloaded ZIP are reference-only and must not be imported.

Recommended setup:

```bash
npm create vite@latest boxing-glass-breaker -- --template vanilla
cd boxing-glass-breaker
npm install
cp /path/to/BOXING_GLASS_HANDOFF.md ./BOXING_GLASS_HANDOFF.md
git init
git add .
git commit -m "chore: initialize clean-room Vite project"
git branch -M main
git remote add origin git@github.com:<YOUR_GITHUB_USERNAME>/boxing-glass-breaker.git
git remote -v
git push -u origin main
git switch -c feature/boxing-glass-breaker
```

HTTPS remotes are also acceptable:

```bash
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/boxing-glass-breaker.git
```

Rules for AI coding agents:

- Treat `origin` as the user's repository.
- Do not add the original Fog Mirror repository as any Git remote.
- Do not copy files or code from the downloaded Fog Mirror ZIP.
- Before any push, run `git remote -v` and state the destination.
- Work on `feature/boxing-glass-breaker` until the implementation is ready to merge into the user's `main` branch.
- Do not force-push or rewrite `main`.
- Use official documentation and original code written for this project.
- Add third-party package and asset licensing information to `THIRD_PARTY_NOTICES.md`.

---

## 16. Implementation task list

### Phase 0 — Create a clean-room project in the user's GitHub repository

> **Clean-room rule:** Do not extract, import, convert, or modify the Fog Mirror source. Start from a fresh Vite vanilla JavaScript scaffold in a repository owned by the user.

- [x] Create a new empty repository in the user's GitHub account, for example `boxing-glass-breaker` or `break-through`. _(Created private repo `RSSDesign69/boxing-glass-breaker`.)_
- [x] Generate a fresh Vite vanilla JavaScript project with `npm create vite@latest`. _(Equivalent hand-rolled clean-room Vite vanilla scaffold; Vite 7.3.6.)_
- [x] Copy only this handoff document into the new project. Do not copy the original project's README, `index.html`, assets, code, or Git history.
- [x] Initialize Git and make the first commit: `chore: initialize clean-room Vite project`.
- [x] Set the user's new GitHub repository as `origin`; verify with `git remote -v` before the first push.
- [x] Create the working branch **inside the user's repository**: `feature/boxing-glass-breaker`.
- [x] Do not configure any remote pointing to the original author's repository. _(`git remote -v` shows only the user-owned `origin`.)_
- [x] Add `README.md` with project purpose, local setup, privacy statement, and clean-room notice.
- [x] Add `THIRD_PARTY_NOTICES.md` for MediaPipe, packages, fonts, audio, and other licensed dependencies.
- [x] Establish privacy requirements: camera only, no microphone, no frame upload, no persistent capture, and no analytics for MVP. _(Documented in README and shown in the permission-gate UI.)_
- [x] Add a basic permission gate and confirm the blank app runs over localhost before implementing camera behavior. _(Gate verified in-browser at `http://localhost:5173`; no camera code yet.)_

**Acceptance:** The Git history begins with a fresh Vite scaffold; no file from the Fog Mirror repository is present; `git remote -v` shows only the user-owned repository as `origin`; the app runs with `npm run dev`; and the README documents the clean-room and privacy constraints.

### Phase 1 — Build the original application foundation

- [x] Create the camera, tracking, app-state, configuration, and rendering modules from scratch. _(`camera.js`, `handTracking.js`, `appState.js`, `config.js`, `glassRenderer.js`, `debugHud.js`, utils.)_
- [x] Add lint/format scripts. _(ESLint 10 flat config + Prettier; `npm run lint`, `format`, `format:check`.)_
- [x] Add `BOXING_GLASS_HANDOFF.md` to source control. _(Done in Phase 0.)_
- [x] Add keyboard and mouse development controls. _(Click/Space impacts, B break, R reset, D debug HUD; plus a dev-only no-camera mode.)_

**Acceptance:** App starts with `npm run dev`; the independently written camera and hand-landmark foundation works; modules have clear ownership.

### Phase 2 — Static glass visual prototype

- [x] Render mirrored webcam full-screen. _(Implemented in Phase 1; needs a manual webcam check.)_
- [x] Render translucent intact glass overlay. _(Hybrid material: cool tint, reflection bands, vignette, seeded noise/scratches, luminous border.)_
- [x] Add seeded radial crack generation on mouse click. _(`glassModel.js`: radial branches, secondary branches, stress arcs; geometry generated once per impact from its seed.)_
- [x] Persist multiple cracks. _(Offscreen crack layer redrawn only on impact; verified stable across frames.)_
- [x] Add impact flash, shock ring, particles, and modest shake. _(Plus a cool-tinted energy ripple; reduced-motion scales shake/particles down.)_
- [x] Add forced-break keyboard shortcut; do not add a production damage meter or punch counter. _(B fades the pane — shards land in Phase 5; R rebuilds. No meters anywhere.)_

**Acceptance:** Clicking repeatedly produces stable, cumulative cracks at click locations without hand tracking.

### Phase 3 — Punch detector proof of concept

- [x] Configure up to two hands. _(Done in Phase 1: `numHands: 2`.)_
- [x] Implement fist score. _(Tip-to-wrist vs MCP-to-wrist ratio per finger, averaged; thumb excluded.)_
- [x] Implement per-hand sample history and smoothing. _(EMA on center/size/depth + 350 ms sample window per hand.)_
- [x] Calculate screen, depth, and scale velocity. _(Plus signed horizontal velocity; ~90 ms lookback.)_
- [x] Implement hand state machine and cooldown/rearm logic. _(OPEN_OR_IDLE → FIST_READY → ACCELERATING → COOLDOWN → RETRACTING; armed delay, per-hand + global cooldowns, retraction/quiet rearm, teleport rejection, hand-dropout expiry.)_
- [x] Emit `punch` events with `{x, y, strength, punchType, handId}`. _(Plus `score` and `timestampMs`.)_
- [x] Build full debug HUD and landmark overlay. _(Per-hand feature readout, state, cooldown, fist-center + velocity vector, punch markers colored by type, live threshold sliders, copy-tuning-JSON button.)_
- [x] Implement separate forward and lateral candidate scores. _(Handoff formulas; the lateral deceleration term is realized at emission time when the hand actually stops/reverses.)_
- [x] Emit `punchType` with every punch event.
- [x] Test forward jabs/crosses, lateral hooks/cross-frame punches, slow reaches, stationary fists, and hand waving. _(12 synthetic-sequence unit tests in `tests/punchDetector.test.js`; live-webcam validation still required — see acceptance note.)_

**Acceptance:** In controlled lighting, 8 of 10 deliberate punches register, with no more than 1 false positive during 30 seconds of normal guard movement. These are prototype targets, not final guarantees. **Status: pending live-webcam validation** — the detector passes all synthetic-sequence tests, but the 8/10 and false-positive targets, the MediaPipe `z` sign (`CONFIG.punch.depthSign`), and threshold defaults must be verified manually with a real camera using the debug HUD sliders.

### Phase 4 — Connect punches to damage

- [x] Convert punch strength and `punchType` to impact radius, crack shape, and damage. _(Lateral hits: smaller chip, cracks elongated along `directionX`; forward: symmetric burst; strength scales radius, branch count/length, damage.)_
- [x] Add near-existing-crack multiplier. _(1.25× damage + longer branches within 90 px of an existing crack.)_
- [x] Prevent duplicate impacts during cooldown. _(Detector per-hand + global cooldowns, plus a 150 ms model-level debounce in `glassModel.addImpact`.)_
- [x] Tune expected break to approximately 8–14 punches. _(Verified: ~8 medium hits in-browser, 14 forced max; deterministic tests pin the 8–14 window.)_
- [x] Add impact sound variation. _(Web Audio–synthesized crack + thump, 3 variations with random detune/rate, strength-scaled volume; shatter sound; mute button. No audio files shipped — nothing to license.)_

**Acceptance:** Deliberate repeated punches progressively damage the pane and consistently reach a break state.

### Phase 5 — Shatter sequence

- [x] Generate irregular polygon/triangle shards. _(`shardSystem.js`: jittered-grid triangles, ~2× cells = shard count target, full viewport coverage, seeded/deterministic.)_
- [x] Render glass material clipped to shard polygons. _(Pane+crack composite snapshotted at break; each shard draws the snapshot clipped to its translated/rotated triangle.)_
- [x] Add outward velocity, gravity, rotation, opacity, and stagger. _(Outward from the strongest impact, faster+earlier when closer; gravity 1400 px/s²; spin ±4 rad/s; ripple stagger ≤240 ms.)_
- [x] Trigger shatter sound and stronger screen impulse. _(Synth shatter from Phase 4 + 12 px stage impulse, reduced-motion aware.)_
- [x] Transition to unobstructed webcam when shards clear. _(Glass canvas empties when the last shard exits or on timeout; app parks in CLEAR_VIEW.)_

**Acceptance:** Glass visibly falls away rather than simply fading, and webcam remains stable behind it.

### Phase 6 — Clear-view, message, and rebuild loop

- [ ] Hold unobstructed webcam for configurable 5–7 seconds; default 6 seconds.
- [ ] During the final 1.4 seconds, show “Congrats. Now hit harder this time”.
- [ ] Fade the message out as the glass reconstruction begins.
- [ ] Rebuild/fade glass back in.
- [ ] Reset impacts, damage, cracks, shards, and detector arming state.
- [ ] Ensure loop can repeat indefinitely without memory growth.

**Acceptance:** Complete damage → shatter → clean webcam view → pre-reset message → rebuild cycle repeats at least 10 times without errors or major performance degradation.

### Phase 7 — Optional virtual gloves

- [ ] Add a user-facing Virtual gloves On/Off control.
- [ ] Implement `gloveRenderer.js` using fist landmarks for center, scale, and rotation.
- [ ] Hide gloves for open hands and low-confidence tracking.
- [ ] Smooth idle movement while minimizing punch-time lag.
- [ ] Confirm punch detection behaves identically with the overlay enabled or disabled.
- [ ] Store preference only for the browser session.

**Acceptance:** A user can toggle virtual gloves at any time; gloves track both fists convincingly enough for a stylized desktop experience, and bare-hand mode remains fully functional.

### Phase 8 — Calibration and desktop hardening

- [ ] Add neutral fist calibration flow.
- [ ] Save only non-sensitive numeric calibration values for the session, not camera imagery.
- [ ] Test Chrome desktop first, then Edge and desktop Safari.
- [ ] Tune thresholds for webcam mirroring and varied distances.
- [ ] Add low-light and no-hand guidance.
- [ ] Add reduced-motion behavior.
- [ ] Add a graceful unsupported/simplified notice for narrow or touch-primary devices; mobile optimization is not required for MVP.

**Acceptance:** Experience is reliable on the documented desktop/laptop support matrix and degrades gracefully when hand tracking fails.

### Phase 9 — Testing and deployment

- [ ] Add unit tests for fist scoring, temporal state transitions, cooldown, and damage thresholds.
- [ ] Add deterministic tests for seeded crack generation.
- [ ] Add a manual QA checklist.
- [ ] Build and host on an HTTPS environment.
- [ ] Verify camera permissions, CSP, CDN access, and desktop resizing/fullscreen behavior.
- [ ] Confirm no remote data capture.

**Acceptance:** Production build works over HTTPS and passes privacy/network inspection.

---

## 17. Manual QA scenarios

### Punch detection

- [ ] Stationary closed fist does not repeatedly trigger.
- [ ] Slow fist movement toward camera does not trigger or triggers only at deliberately permissive settings.
- [ ] Fast jab triggers once.
- [ ] Fast cross toward the camera triggers once.
- [ ] Lateral hook/cross-frame punch triggers once.
- [ ] Ordinary lateral guard adjustment does not trigger.
- [ ] Retract-and-jab sequence registers separate punches.
- [ ] Open-hand wave does not trigger.
- [ ] Adjusting hair/face does not trigger.
- [ ] Two fists in frame do not produce duplicate hits from one punch.
- [ ] Hand briefly leaving frame does not corrupt state.

### Visual behavior

- [ ] Impact location matches fist location after mirroring.
- [ ] Cracks remain readable over both bright and dark camera backgrounds.
- [ ] Cracks do not regenerate differently each frame.
- [ ] Damage persists until shatter.
- [ ] Crack progression is understandable without a meter or counter.
- [ ] Hybrid clear-glass/game-barrier styling remains transparent enough to see the webcam.
- [ ] Virtual gloves can be toggled without changing detection behavior.
- [ ] Shards fall below viewport and are removed from memory.
- [ ] Webcam is fully unobstructed during clear-view state.
- [ ] The reset message appears near the end of the 5–7 second clear-view interval.
- [ ] Glass returns after 5–7 seconds.

### Permissions/privacy

- [ ] Only camera permission is requested.
- [ ] Denied permission shows a useful recovery message.
- [ ] No images or derived captures are transmitted.
- [ ] Media tracks stop when leaving the experience where supported.

---

## 18. Performance strategy

- Run MediaPipe only when `video.currentTime` changes.
- Decouple model inference FPS from 60 FPS rendering.
- Clamp DPR to 2 or lower on constrained devices.
- Precompute crack geometry only at impact time.
- Pool particles and shards instead of allocating heavily per frame.
- Avoid expensive full-canvas blur filters each frame.
- Use offscreen canvases for static glass texture and persistent cracks.
- Measure actual frame time and reduce shards/particles adaptively.
- Pause processing when the document is hidden.

Potential canvas layers:

1. static glass texture offscreen canvas
2. persistent crack canvas updated only on impact
3. animated FX canvas updated every frame
4. shard canvas active only during break

---

## 19. Tool handoff protocol for Cursor, Claude Code, and Codex

This file is the canonical cross-session handoff. Every coding agent must follow this protocol.

### At the start of every session

1. Read `BOXING_GLASS_HANDOFF.md` completely.
2. Read `README.md`.
3. Inspect `git status` and the most recent 5 commits.
4. Run the project and verify the current clean-room baseline before editing.
5. Identify the earliest incomplete task in the task list.
6. State the intended files and acceptance criteria before making changes.

### During the session

- Work on one phase or one coherent slice at a time.
- Keep tuning constants in `src/config.js`.
- Do not silently remove privacy protections or debug controls.
- Do not add a backend, image upload, analytics, microphone request, or frame persistence.
- Do not rewrite the entire project when a focused change is sufficient.
- Add comments for temporal detection logic and non-obvious math.
- Test with mouse/keyboard simulation before relying on live camera gestures.

### Before ending the session

1. Run tests and production build.
2. Update task checkboxes in this file.
3. Update the session log below.
4. Record unresolved bugs and measured thresholds.
5. Summarize changed files.
6. Commit with a focused message when authorized.

### Required agent prompt

Use this prompt when starting a new agent session:

```text
Read BOXING_GLASS_HANDOFF.md and README.md first. Confirm that `origin` points only to the user-owned GitHub repository. Confirm that no Fog Mirror source files, code, assets, README text, or Git history are present. Implement from scratch using official browser and MediaPipe documentation. Inspect the repository and git history, run the current app, and continue from the earliest incomplete task. Do not add any backend, camera-frame upload, analytics, microphone permission, or persistent image capture. Keep all tuning values in src/config.js. Before editing, tell me the task you are taking, the files you expect to modify, and the acceptance criteria. At the end, run tests/build and update the handoff task list and session log.
```

---

## 20. Session log

Append new entries at the top. Never delete prior entries.

### 2026-07-15 — Phase 5 completed (Claude Code)

- Implemented `shardSystem.js` (pure logic, seeded, unit-testable): irregular triangles from a jittered shared-vertex grid split per-cell along a random diagonal — full-viewport coverage (≤0.5% overlap from occasional concave quads) without a Voronoi library. Each shard carries centroid-relative points, radius, outward velocity away from the strongest impact (faster and earlier when closer), upward pop, gravity, angular velocity, and a ripple stagger delay.
- `glassRenderer.startShatter(model, onComplete)`: snapshots the pane+crack composite once, then draws it clipped to each shard's translated/rotated polygon on the glass canvas every frame; delayed shards render in place so the pane looks whole until the ripple reaches them. Completion (all shards below viewport, or `timing.shatterMs` + 1.2 s timeout) clears the canvas, zeroes pane opacity, and fires the callback. `cancelShatter()` supports R during BREAKING. Reduced motion uses the 24-shard count and a gentler impulse.
- `breakGlass()` now runs BREAKING → shard animation → CLEAR_VIEW via the completion callback (replaces the Phase 4 fade placeholder); shatter sound + 12 px screen impulse fire at break.
- `tests/shardSystem.test.js`: 7 deterministic tests — seed identity/divergence, viewport coverage, outward-launch direction (>95% of shards), near-origin-first stagger, gravity integration + guaranteed clear-out, delay hold, and desktop-vs-reduced shard counts. 28 tests total pass; lint/build green.
- Verified in-browser by manually pumping `renderer.drawFrame` (the rAF loop pauses while the pane is hidden — expected): B → BREAKING with `shattering=true`; glass pixels fell 76k → 53k → 10k → 0 progressively (falls away, not a fade); → CLEAR_VIEW/`clear`; R → READY with the intact pane restored. Mid-shatter screenshot confirms rotating shards carrying the crack texture.
- Exposed `renderer` on the dev handle (`window.__breakThrough`) for frame-pumped automation.
- Next task: Phase 6 (clear-view timer, "Congrats. Now hit harder this time" message, rebuild loop).

### 2026-07-15 — Live-tuning pass 1 (Claude Code + user webcam session)

- First real-webcam test (user's machine): a noticeable share of deliberate punches did not register at the spec's starting thresholds. Detector logic behaved as designed; sensitivity was the issue.
- Loosened defaults in `src/config.js`: fistThreshold 0.75→0.65, forwardPunchThreshold 0.72→0.60, lateralPunchThreshold 0.76→0.68, minScreenSpeed 0.5→0.35, minScaleVelocity/minDepthVelocity 0.35→0.22, peakDropRatio 0.30→0.25, and lowered normalization refs (screenSpeedRef 1.6→1.3, scaleVelocityRef 1.8→1.2, depthVelocityRef 1.2→0.9, horizontalSpeedRef 1.4→1.2) so the same physical motion scores higher.
- All 21 unit tests still pass at the new sensitivity — the false-positive scenarios (slow reach, guard adjustment, stationary fist, open wave) remain silent.
- Still open from Phase 3 acceptance: `depthSign` verification on a real camera (watch mean z in the debug HUD while pushing a fist toward the lens — if z increases, flip `CONFIG.punch.depthSign` to +1), and the 8/10 + ≤1-false-positive/30 s measurements after this pass.

### 2026-07-15 — Phase 4 completed (Claude Code)

- Unified detected punches and dev-simulated hits behind one `registerImpact` path in `main.js`: model damage → crack redraw → impact FX → impact sound → READY→DAMAGING → break check. Impacts are only accepted in READY/DAMAGING.
- `glassModel.addImpact` now takes `punchType`/`directionX`/`timestamp`: lateral hits get a smaller chip radius and ~60% of branches fanned around the travel direction at 1.3× length; hits within `nearCrackRadiusPx` (90 px) of an existing crack take `nearCrackMultiplier` (1.25×) damage and grow 1.25× longer branches; a 150 ms `impactDebounceMs` guard rejects duplicate impacts at the model level (detector cooldowns remain the primary control). `addImpact` returns null when debounced — callers must handle it.
- Break is now wired: when `shouldBreak()` trips (verified ~8 medium hits; ≥6 min, 14 forced max), the app transitions BREAKING→CLEAR_VIEW, plays the shatter sound, and fades the pane (Phase 5 replaces the fade with shard physics; Phase 6 adds the timed rebuild). B uses the same path; R walks any state back to READY and fully resets model/detector/renderer.
- `audio.js`: Web Audio–synthesized sounds only, created/resumed from the user's start click (autoplay-safe). Impacts = band-passed noise crack (3 variations, random detune/playback-rate) + low sine thump, volume scaled by strength; shatter = high-pass noise wash + descending thump + staggered glassy pings. Mute button in the stage HUD. No audio assets shipped, so no third-party licensing.
- `tests/glassModel.test.js`: 9 deterministic tests — same-seed geometry identity, different-seed divergence, lateral elongation vs forward symmetry, break inside the 8–14 window, no early break before `minHitsBeforeBreak`, forced break at max hits, near-crack multiplier math, debounce window, full reset incl. debounce clock. 21 tests total pass; lint/build green.
- Verified in-browser end-to-end (no-camera dev mode): 8 spaced clicks → automatic break → CLEAR_VIEW with pane at 0 opacity; clicks during CLEAR_VIEW ignored; R → READY with clean model; mute toggles; zero console errors.
- Next task: Phase 5 (shatter sequence — real shard generation and physics).

### 2026-07-15 — Phase 3 completed pending live-camera tuning (Claude Code)

- Implemented `punchDetector.js` per sections 6.2–6.7: per-hand feature extraction (fist score from tip/MCP wrist-distance ratios, palm width/area, mean palm z, EMA smoothing, 350 ms sample window), screen/horizontal/scale/depth velocities with ~90 ms lookback, and the mandatory temporal state machine (OPEN_OR_IDLE → FIST_READY → ACCELERATING → COOLDOWN → RETRACTING) with armed delay, per-hand + global cooldowns, retraction/quiet rearm, low-confidence and duplicate-handedness filtering, teleport rejection, and hand-dropout expiry.
- Forward and lateral candidate scores use the handoff weightings. Design note: the lateral 0.20 deceleration term is near zero at the velocity peak by construction, so it is recomputed at emission time from the realized stop/reversal; peak-frame position is used for impact placement, with lateral impacts offset half a palm width along the travel direction.
- Punch events `{x, y, strength, punchType, handId, score, timestampMs}` route into the same impact path as simulated clicks; detection runs only on fresh tracker frames and only in READY/DAMAGING. R now also resets detector arming state.
- Debug HUD is feature-complete for section 15: per-hand feature/state/cooldown readout, fist-center + velocity vectors, punch markers colored by type (orange forward / cyan lateral), live threshold sliders (9 keys, mutating CONFIG in place), and a copy-tuning-JSON button. Panel lives on <body> and survives screen re-renders.
- Added `config.punch` normalization references (`screenSpeedRef`, `scaleVelocityRef`, `depthVelocityRef`, `horizontalSpeedRef`), `depthSign` (assumed −1: z shrinks toward camera — MUST be verified live in the HUD), armed-delay/rearm/hand-missing values.
- `tests/punchDetector.test.js`: 12 synthetic-sequence tests at 60 fps — forward jab exactly once, retract-and-jab twice, lateral cross-frame once (typed lateral), and no-fire for stationary fist, fist held near camera, open-hand wave, slow reach, small guard adjustments, simultaneous two-hand duplicate (global cooldown), brief hand dropout, and periodic teleports. All pass; lint/build green.
- Verified in-browser (no-camera dev mode): tuning panel renders with all sliders, slider input mutates the live CONFIG the detector reads, synthetic punch through `applyPunch` creates a typed impact and READY→DAMAGING. Note: the rAF loop intentionally pauses while `document.hidden` (section 18) — automated screenshots taken in a hidden tab show no FX-layer content; this is expected.
- **Open for manual validation on a webcam machine:** 8/10 detection target, ≤1 false positive per 30 s guard movement, `depthSign` confirmation, and threshold tuning via the HUD sliders (copy final values back into `src/config.js`).
- Next task: Phase 4 (connect punches to damage — near-crack multiplier, break tuning, impact sound variation).

### 2026-07-15 — Phase 2 completed (Claude Code)

- Implemented `glassModel.js`: deterministic damage model with per-impact seeded crack generation (5–10 radial branches with angular wobble, ~50% secondary branches, 1–3 concentric stress arcs), branch termination at viewport margins, branch-join when a walk comes within 7 px of an existing crack point, damage accumulation per section 7, and `shouldBreak()` per the handoff formula.
- Rewrote `glassRenderer.js` with the section 18 layering: offscreen pane texture (repainted on resize), offscreen crack layer (repainted on impact only), composited visible glass canvas, and a per-frame FX canvas. Pane material is the hybrid look (tint, reflection bands, vignette, seeded noise/scratches, luminous cyan border). Impact FX: 120 ms flash, white shock ring, slower cool energy ripple, pooled dust particles with gravity, 2–6 px stage shake (respects `prefers-reduced-motion`), and a slow specular sheen sweep.
- Wired dev controls to the model: click/Space add impacts (random 0.35–0.95 strength), B force-breaks (pane fades; shards in Phase 5), R resets model + layers. Clicks are ignored while the pane is clear. First impact transitions READY→DAMAGING.
- Added a dev-only `window.__breakThrough` introspection handle (model/app-state/tracker status) used by automated browser checks.
- Verified end-to-end in-browser via canvas pixel sampling and model introspection: cumulative cracks at 3 click locations, frame-stable geometry, B→0 visible pane pixels, R→model fully reset with zero leftover crack pixels, new impacts work after reset. One earlier "cracks survive reset" observation did not reproduce after a clean reload — attributed to stale Vite HMR module state during live editing, not shipped logic; re-check if it ever reappears.
- Lint/format/build/test all pass. Prettier scripts simplified to `prettier --write .` with `.prettierignore`.
- Next task: Phase 3 (punch detector proof of concept).

### 2026-07-15 — Phase 1 completed (Claude Code)

- Implemented the application foundation from scratch: `src/appState.js` (explicit state machine incl. `CAMERA_ERROR` recovery state), `src/camera.js` (camera-only getUserMedia, typed errors, track stop on pagehide), `src/handTracking.js` (HandLandmarker, VIDEO mode, 2 hands, GPU→CPU fallback, fresh-frame gating, handedness flipped to the user's mirrored perspective), `src/glassRenderer.js` (DPR-clamped stacked canvases, static placeholder pane repainted only on resize), `src/debugHud.js` (FPS/state/hand-skeleton overlay, impact markers, message log), `src/config.js` (full CONFIG from section 14 + camera/model-URL settings), and utils (`geometry.js` cover-mapping + mirrored landmark→viewport, `filters.js` EMA + sample window, `random.js` mulberry32 seeded RNG).
- Landmark mirroring approach: video is mirrored with CSS `scaleX(-1)`; landmarks stay raw and are mirrored during viewport mapping in `geometry.js`.
- Dev controls per section 6.8: mouse click / Space = simulated impact (debug markers until the glass model lands in Phase 2/4), B = break placeholder, R = reset, D = debug HUD. Added a dev-only "Continue without camera" path on the camera-error screen so effects work can proceed in camera-less environments (also fixed: dev controls previously only bound after camera success).
- Added ESLint 10 (flat config) + Prettier with `lint`/`format`/`format:check` scripts; all pass, as do `npm run build` and `npm test`.
- Verified in-browser: permission gate → camera-denied recovery screen (browser pane blocks camera), no-camera dev mode at 60 FPS render, MediaPipe WASM/model loaded from CDN with GPU delegate ("Graph successfully started running"), HUD toggle and click-impact markers confirmed via canvas pixel sampling. Live-hand landmark overlay still needs a manual check on a machine with a webcam.
- Next task: Phase 2 (static glass visual prototype).

### 2026-07-15 — Phase 0 completed (Claude Code)

- Installed dependencies: `@mediapipe/tasks-vision` 0.10.35 (Apache-2.0), `vite` 7.3.6 (MIT), `vitest` 3.2.7 (MIT); recorded them in `THIRD_PARTY_NOTICES.md`.
- Implemented the Phase 0 permission-gate shell in `src/main.js`/`src/styles.css` using the section 12 start-gate copy ("Enter the ring"); no camera code yet, per Phase 0 scope. The button currently leads to a placeholder screen that will become the camera session in Phase 1.
- Verified the app in a real browser over `http://localhost:5173` (gate renders, button navigation works, zero console errors). `npm run build` and `npm test` pass (`--passWithNoTests` added until Phase 9 adds tests).
- Initialized Git on `main` with first commit `chore: initialize clean-room Vite project`; created the private user-owned repo `RSSDesign69/boxing-glass-breaker`, verified `git remote -v` shows only that repo as `origin`, and pushed `main`.
- Created and pushed the working branch `feature/boxing-glass-breaker`; subsequent work happens there.
- Added `.claude/launch.json` so coding agents can start the dev server (`break-through-dev`, port 5173).
- No Fog Mirror files, remotes, or history are present. Next task: Phase 1 (camera, tracking, app-state, configuration, and rendering modules).

### 2026-07-15 — Clean-room implementation selected

- Confirmed that the Fog Mirror repository has no published license or explicit reuse grant.
- Reframed the project as an original implementation rather than a conversion or derivative.
- Removed all instructions to import, refactor, or preserve the original source.
- Phase 0 now starts from a fresh Vite vanilla JavaScript scaffold in the user's repository.
- Added clean-room boundaries, third-party notice requirements, and explicit agent safeguards.

### 2026-07-15 — Repository ownership clarified

- Clarified that Phase 0 creates and uses a new GitHub repository owned by the user.
- The `feature/boxing-glass-breaker` branch must be created in the user-owned repository, not the original source repository.
- Added remote-verification instructions and safeguards against accidentally pushing upstream.
- Superseded by the clean-room decision: no original source will be imported or redistributed.

### 2026-07-15 — Product decisions resolved

- Set visual direction to a hybrid of clear window glass and a stylized video-game barrier.
- Required detection for both forward/toward-camera and lateral/cross-frame punches.
- Added optional user-selectable virtual boxing gloves while preserving bare-hand operation.
- Removed production damage meters and punch counters; cracks are the sole progression signal.
- Added the pre-reset message: “Congrats. Now hit harder this time”.
- Confirmed desktop/laptop as the primary and MVP deployment target.
- Updated architecture, configuration, implementation phases, QA, and acceptance criteria accordingly.

### 2026-07-15 — Initial technical specification

- Reviewed the general technical approach demonstrated by the supplied prototype for feasibility only.
- Confirmed feasibility with MediaPipe Hand Landmarker, browser camera, and Canvas 2D.
- Defined punch-detection heuristic and temporal state machine.
- Defined progressive damage, crack generation, shatter, clear-view, and rebuild states.
- Recommended Vite + vanilla JavaScript modularization.
- Established camera-only, local-processing privacy requirements.
- No application implementation has been created yet beyond the clean-room starter scaffold and this handoff document.

---

## 21. Resolved product decisions

These decisions are now canonical unless the user explicitly changes them:

1. **Material:** a hybrid of clear window glass and a stylized video-game barrier—mostly transparent and physical, with restrained luminous/energy accents.
2. **Punch directions:** both forward punches toward the camera and lateral/cross-frame punches can trigger impacts.
3. **Gloves:** virtual boxing gloves are optional and user-selectable. Bare-hand use must always work. Physical gloves may also be used if tracking remains reliable.
4. **Progress communication:** cracks and material instability are the only progress indicators. Do not show a punch count, damage meter, health bar, or progress ring in production.
5. **Final reveal:** after shattering, expose the unobstructed webcam for approximately 6 seconds. Near the end, show **“Congrats. Now hit harder this time”** before the glass resets.
6. **Primary platform:** desktop/laptop browsers. Optimize and test there first; mobile support is not an MVP requirement.

## 22. Definition of done

The project is complete when:

- A user can open the page over HTTPS, grant camera access, and see themselves behind a convincing glass pane.
- Deliberate forward and lateral fist punches reliably create one impact each with acceptable false positives.
- The user can toggle virtual boxing gloves on or off, and bare-hand mode remains fully functional.
- Cracks accumulate at punch locations and visibly worsen across repeated hits without a visible progress meter or punch count.
- The pane breaks after sustained punching, with animated falling shards.
- The unobstructed mirrored webcam remains for 5–7 seconds; “Congrats. Now hit harder this time” appears near the end, then the pane rebuilds.
- The complete loop repeats without refresh.
- No camera frames are uploaded, stored, or transmitted.
- Camera-only permission is requested.
- Mouse/keyboard simulation and debug tools support development.
- The visual treatment clearly combines transparent window glass with restrained video-game barrier styling.
- The desktop/laptop experience is modular, buildable, tested at the logic level, and documented for cross-agent continuation.

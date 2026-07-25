/**
 * All tunable constants live here. Do not scatter magic numbers through
 * modules; import CONFIG instead. Values are starting points, not validated
 * production thresholds.
 */
export const CONFIG = {
  camera: {
    // Camera only. Never request audio/microphone.
    constraints: {
      video: {
        facingMode: 'user',
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
  },
  tracking: {
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    // MediaPipe runtime assets. Version-pinned; record any change in
    // THIRD_PARTY_NOTICES.md. Consider self-hosting for production.
    wasmBaseUrl:
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
    handLandmarkerModelUrl:
      'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
    // Live-tuning pass 2 (2026-07-15): user-validated values from real
    // webcam sessions. Re-tighten if false positives show up.
    fistThreshold: 0.55,
    fistConfirmFrames: 2,
    handCooldownMs: 450,
    globalImpactCooldownMs: 180,
    forwardPunchThreshold: 0.5,
    // Lowered (0.58 -> 0.5) in hook-detection pass: real hooks were not
    // registering while jabs/crosses were.
    lateralPunchThreshold: 0.5,
    minLateralTravelPx: 70,
    sampleWindowMs: 350,
    teleportThresholdViewportRatio: 0.22,
  },
  punch: {
    scoreThreshold: 0.68,
    // Noise floors for "intentional acceleration" (units noted below).
    // Lowered in live-tuning passes 1–2 alongside the thresholds above.
    minScreenSpeed: 0.35, // viewport diagonals per second
    minScaleVelocity: 0.15, // palm-width fractions per second
    minDepthVelocity: 0.15, // landmark-z units per second toward camera
    peakDropRatio: 0.15,
    // Reference maxima that map raw velocities to 0–1 score inputs.
    // Lower refs = the same physical motion scores higher.
    screenSpeedRef: 1.3, // diag/s treated as "1.0" screen speed
    scaleVelocityRef: 1.2, // rel/s treated as "1.0" scale velocity
    depthVelocityRef: 0.9, // z/s treated as "1.0" depth velocity
    // Lowered (1.2 -> 0.9) in hook-detection pass so gym-speed hooks score
    // near 1.0 instead of needing a whip-fast cross-frame swing.
    horizontalSpeedRef: 0.9, // viewport-widths/s treated as "1.0"
    // MediaPipe z shrinks as the hand approaches the camera on tested
    // setups; verify live in the debug HUD (section 6.4) and flip if needed.
    depthSign: -1,
    armedDelayMs: 120, // time in FIST_READY before a punch may register
    minAccelFrames: 2, // frames above the noise floor before ACCELERATING
    rearmSpeedDiag: 0.2, // "hand went quiet" speed for rearming, diag/s
    rearmQuietMs: 150,
    handMissingMs: 400, // drop per-hand tracking after this gap
  },
  damage: {
    // Endurance pass (user request): typical break now ~22–28 punches
    // (was ~8–14). breakDamage / avg damage-per-punch (~10–12) sets the
    // typical count; the min/max bounds keep it predictable.
    breakDamage: 250,
    baseDamage: 7,
    strengthDamage: 5,
    nearCrackMultiplier: 1.25,
    nearCrackRadiusPx: 90, // impact within this of an existing crack = "near"
    minHitsBeforeBreak: 18,
    maxHitsBeforeForcedBreak: 35,
    impactDebounceMs: 150, // model-level guard against duplicate impacts
  },
  calibration: {
    holdMs: 1500, // continuous fist hold needed to finish calibrating
    maxGapMs: 300, // tolerated tracking dropout during the hold
    noHandsHintAfterMs: 4000, // READY guidance when no hands are visible
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
    // Master opacity of the dirty-gym frosting (0 = clear pane, 1 = full
    // grime). The break payoff is the unobstructed view, so keep it high.
    paneFogOpacity: 1,
  },
  shatter: {
    gravity: 1400, // px/s²
    outwardSpeedMin: 80, // px/s, far from the break origin
    outwardSpeedMax: 360, // px/s, at the break origin
    upwardSpeedMin: -220, // px/s initial pop
    upwardSpeedMax: -40,
    maxAngularVelocity: 4, // radians/s
    maxStaggerMs: 240, // collapse ripples outward rather than as one sheet
  },
  debug: {
    enabled: false,
    mouseImpacts: true,
  },
};

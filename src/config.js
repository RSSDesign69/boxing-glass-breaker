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

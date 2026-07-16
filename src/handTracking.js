/**
 * MediaPipe HandLandmarker setup and per-frame landmark output.
 *
 * - VIDEO running mode, up to CONFIG.tracking.numHands hands
 * - GPU delegate with automatic CPU fallback
 * - Inference only when the video has a fresh frame (currentTime changed),
 *   which decouples model FPS from render FPS
 * - Landmarks are returned raw (unmirrored, normalized). Mirroring to
 *   viewport space is a rendering concern; see utils/geometry.js.
 */
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import { CONFIG } from './config.js';
import { createEma } from './utils/filters.js';

export async function createHandTracker() {
  const fileset = await FilesetResolver.forVisionTasks(
    CONFIG.tracking.wasmBaseUrl,
  );

  const options = (delegate) => ({
    baseOptions: {
      modelAssetPath: CONFIG.tracking.handLandmarkerModelUrl,
      delegate,
    },
    runningMode: 'VIDEO',
    numHands: CONFIG.tracking.numHands,
    minHandDetectionConfidence: CONFIG.tracking.minHandDetectionConfidence,
    minHandPresenceConfidence: CONFIG.tracking.minHandPresenceConfidence,
    minTrackingConfidence: CONFIG.tracking.minTrackingConfidence,
  });

  let landmarker;
  let delegate = 'GPU';
  try {
    landmarker = await HandLandmarker.createFromOptions(
      fileset,
      options('GPU'),
    );
  } catch {
    delegate = 'CPU';
    landmarker = await HandLandmarker.createFromOptions(
      fileset,
      options('CPU'),
    );
  }

  let lastVideoTime = -1;
  let lastResult = { hands: [], fresh: false };
  const inferenceFps = createEma(0.2);
  let lastInferenceAt = 0;

  return {
    get delegate() {
      return delegate;
    },
    get inferenceFps() {
      return inferenceFps.value ?? 0;
    },

    /**
     * Run detection if the video has advanced to a new frame. Returns
     * { hands, fresh }; `fresh` is false when the previous result was reused.
     */
    detect(videoElement, timestampMs) {
      if (videoElement.currentTime === lastVideoTime) {
        return { ...lastResult, fresh: false };
      }
      lastVideoTime = videoElement.currentTime;

      const result = landmarker.detectForVideo(videoElement, timestampMs);

      if (lastInferenceAt > 0) {
        const dt = timestampMs - lastInferenceAt;
        if (dt > 0) inferenceFps.push(1000 / dt);
      }
      lastInferenceAt = timestampMs;

      const hands = (result.landmarks ?? []).map((landmarks, i) => ({
        // MediaPipe reports handedness for the unmirrored frame; in a
        // mirrored selfie view the user's right hand is reported "Left".
        // Flip here so downstream code speaks from the user's perspective.
        handedness: flipHandedness(result.handednesses?.[i]?.[0]?.categoryName),
        handednessScore: result.handednesses?.[i]?.[0]?.score ?? 0,
        landmarks,
        timestampMs,
      }));

      lastResult = { hands, fresh: true };
      return lastResult;
    },

    close() {
      landmarker.close();
    },
  };
}

function flipHandedness(categoryName) {
  if (categoryName === 'Left') return 'Right';
  if (categoryName === 'Right') return 'Left';
  return 'Unknown';
}

/** Landmark indices used across modules (MediaPipe hand model topology). */
export const LANDMARK = Object.freeze({
  WRIST: 0,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_TIP: 20,
});

/** Palm landmark set used for fist center and mean depth. */
export const PALM_LANDMARKS = Object.freeze([0, 5, 9, 13, 17]);

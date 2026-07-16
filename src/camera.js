/**
 * Webcam lifecycle. Camera permission only — the constraints in CONFIG must
 * never request audio. All frames stay in the browser; nothing is uploaded,
 * saved, or persisted.
 */
import { CONFIG } from './config.js';

export async function startCamera(videoElement) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new CameraError(
      'unsupported',
      'This browser does not support camera access.',
    );
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(
      CONFIG.camera.constraints,
    );
  } catch (error) {
    throw toCameraError(error);
  }

  videoElement.srcObject = stream;
  await videoElement.play();

  const stop = () => {
    for (const track of stream.getTracks()) track.stop();
    videoElement.srcObject = null;
  };

  // Release the camera when the page is discarded or backgrounded-for-good.
  window.addEventListener('pagehide', stop, { once: true });

  return {
    stream,
    stop,
    get width() {
      return videoElement.videoWidth;
    },
    get height() {
      return videoElement.videoHeight;
    },
  };
}

export class CameraError extends Error {
  constructor(reason, message) {
    super(message);
    this.name = 'CameraError';
    this.reason = reason; // 'denied' | 'unavailable' | 'unsupported' | 'unknown'
  }
}

function toCameraError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return new CameraError(
      'denied',
      'Camera access was denied. Allow camera access in your browser settings, then try again.',
    );
  }
  if (
    error?.name === 'NotFoundError' ||
    error?.name === 'OverconstrainedError'
  ) {
    return new CameraError(
      'unavailable',
      'No usable camera was found on this device.',
    );
  }
  if (error?.name === 'NotReadableError') {
    return new CameraError(
      'unavailable',
      'The camera is already in use by another application.',
    );
  }
  return new CameraError(
    'unknown',
    `Could not start the camera (${error?.name ?? 'unknown error'}).`,
  );
}

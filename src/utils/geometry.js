/** Geometry helpers shared by tracking, rendering, and the debug HUD. */

export function distance(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Compute how a source rectangle (the video frame) maps onto a viewport when
 * rendered with cover semantics (fill the viewport, crop the overflow).
 * Returns the uniform scale plus the offsets of the source's top-left corner
 * in viewport pixels (offsets are <= 0 on the cropped axis).
 */
export function coverTransform(srcWidth, srcHeight, viewWidth, viewHeight) {
  const scale = Math.max(viewWidth / srcWidth, viewHeight / srcHeight);
  return {
    scale,
    offsetX: (viewWidth - srcWidth * scale) / 2,
    offsetY: (viewHeight - srcHeight * scale) / 2,
  };
}

/**
 * Map a normalized landmark (0–1 in unmirrored video-frame space) to viewport
 * pixels, applying the horizontal mirror so overlay positions match what the
 * user sees in the mirrored video.
 */
export function landmarkToViewport(normX, normY, srcWidth, srcHeight, cover) {
  return {
    x: cover.offsetX + (1 - normX) * srcWidth * cover.scale,
    y: cover.offsetY + normY * srcHeight * cover.scale,
  };
}

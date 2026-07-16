/**
 * Glass pane rendering. Phase 1 scope: own the layered canvases (sizing, DPR
 * clamp) and draw a minimal intact-glass placeholder so layer ordering is
 * verifiable. The hybrid clear-glass / game-barrier material, cracks, and
 * impact effects arrive in Phase 2.
 */
import { CONFIG } from './config.js';

export function createGlassRenderer(glassCanvas, fxCanvas) {
  const glassCtx = glassCanvas.getContext('2d');
  const fxCtx = fxCanvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resize() {
    dpr = Math.min(
      window.devicePixelRatio || 1,
      CONFIG.rendering.maxDevicePixelRatio,
    );
    width = window.innerWidth;
    height = window.innerHeight;
    for (const canvas of [glassCanvas, fxCanvas]) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    glassCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawIntactGlass();
  }

  // The static pane only needs repainting on resize, not every frame.
  function drawIntactGlass() {
    glassCtx.clearRect(0, 0, width, height);

    // Slight cool tint over the whole pane.
    glassCtx.fillStyle = 'rgba(190, 215, 235, 0.07)';
    glassCtx.fillRect(0, 0, width, height);

    // Faint diagonal reflection band.
    const sheen = glassCtx.createLinearGradient(0, 0, width, height);
    sheen.addColorStop(0.15, 'rgba(255, 255, 255, 0)');
    sheen.addColorStop(0.3, 'rgba(255, 255, 255, 0.05)');
    sheen.addColorStop(0.42, 'rgba(255, 255, 255, 0)');
    glassCtx.fillStyle = sheen;
    glassCtx.fillRect(0, 0, width, height);

    // Crisp border highlight.
    glassCtx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    glassCtx.lineWidth = 2;
    glassCtx.strokeRect(1, 1, width - 2, height - 2);
  }

  window.addEventListener('resize', resize);
  resize();

  return {
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get fxCtx() {
      return fxCtx;
    },
    /** Per-frame FX layer clear; the persistent glass layer is left alone. */
    beginFrame() {
      fxCtx.clearRect(0, 0, width, height);
    },
    redrawGlass: drawIntactGlass,
  };
}

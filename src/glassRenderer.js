/**
 * Glass pane rendering: the hybrid clear-glass / game-barrier material,
 * persistent cracks, and per-impact effects (flash, shock ring, dust,
 * shake). Layering (section 18):
 *
 *   - offscreen static pane texture: regenerated on resize only
 *   - offscreen crack layer: redrawn only when an impact adds segments
 *   - visible glass canvas: composite of the two, updated on impact/resize
 *   - visible fx canvas: cleared and redrawn every frame
 *
 * The renderer draws model geometry; it never generates crack shapes.
 */
import { CONFIG } from './config.js';
import { createSeededRandom } from './utils/random.js';
import { generateShards, updateShards } from './shardSystem.js';

const FLASH_MS = 120;
const RING_MS = 380;
const RIPPLE_MS = 550;
const SHAKE_MS = 180;
const DUST_GRAVITY = 900; // px/s²

export function createGlassRenderer(glassCanvas, fxCanvas, stageElement) {
  const glassCtx = glassCanvas.getContext('2d');
  const fxCtx = fxCanvas.getContext('2d');
  const paneLayer = document.createElement('canvas');
  const crackLayer = document.createElement('canvas');

  let width = 0;
  let height = 0;
  let dpr = 1;
  let paneOpacity = 1;

  const reducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches;

  const flashes = [];
  const rings = [];
  const particles = [];
  let shake = { until: 0, magnitude: 0 };
  // Shatter mode: {snapshot, shards, elapsedMs, onComplete} while active.
  let shatter = null;

  function resize() {
    dpr = Math.min(
      window.devicePixelRatio || 1,
      CONFIG.rendering.maxDevicePixelRatio,
    );
    width = window.innerWidth;
    height = window.innerHeight;
    for (const canvas of [glassCanvas, fxCanvas, paneLayer, crackLayer]) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    for (const canvas of [glassCanvas, fxCanvas]) {
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    glassCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintPaneTexture();
  }

  // -------------------------------------------------------------------------
  // Static pane material (~70% window glass / 30% game barrier)
  // -------------------------------------------------------------------------

  function paintPaneTexture() {
    const ctx = paneLayer.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Mostly transparent body with a slight cool tint.
    ctx.fillStyle = 'rgba(185, 212, 235, 0.06)';
    ctx.fillRect(0, 0, width, height);

    // Two faint diagonal reflection bands.
    for (const [from, to, alpha] of [
      [0.1, 0.32, 0.05],
      [0.55, 0.72, 0.035],
    ]) {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(Math.max(0, from - 0.06), 'rgba(255,255,255,0)');
      grad.addColorStop((from + to) / 2, `rgba(255,255,255,${alpha})`);
      grad.addColorStop(Math.min(1, to + 0.06), 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // Edge vignette.
    const vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.42,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72,
    );
    vignette.addColorStop(0, 'rgba(10, 16, 24, 0)');
    vignette.addColorStop(1, 'rgba(10, 16, 24, 0.28)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // Subtle surface noise and a few hairline scratches, seeded so the
    // texture is stable for a given viewport size.
    const rng = createSeededRandom(width * 7 + height * 13);
    ctx.fillStyle = 'rgba(255,255,255,0.02)';
    const speckCount = Math.round((width * height) / 9000);
    for (let i = 0; i < speckCount; i++) {
      ctx.fillRect(rng.range(0, width), rng.range(0, height), 1, 1);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const sx = rng.range(0, width);
      const sy = rng.range(0, height);
      const len = rng.range(40, 160);
      const ang = rng.range(-0.6, 0.6) + (rng.next() < 0.5 ? 0 : Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(ang) * len, sy + Math.sin(ang) * len);
      ctx.stroke();
    }

    // Restrained luminous edge energy: crisp border + soft inner glow line.
    ctx.strokeStyle = 'rgba(160, 220, 255, 0.30)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, width - 2, height - 2);
    ctx.strokeStyle = 'rgba(160, 220, 255, 0.08)';
    ctx.lineWidth = 6;
    ctx.strokeRect(5, 5, width - 10, height - 10);

    compositePane();
  }

  // -------------------------------------------------------------------------
  // Persistent cracks (redrawn only when segments are added)
  // -------------------------------------------------------------------------

  function paintCracks(model) {
    const ctx = crackLayer.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Soft glow + opaque chip at each impact center.
    for (const impact of model.state.impacts) {
      const glow = ctx.createRadialGradient(
        impact.x,
        impact.y,
        0,
        impact.x,
        impact.y,
        impact.radius,
      );
      glow.addColorStop(0, 'rgba(255,255,255,0.22)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(impact.x, impact.y, impact.radius, 0, Math.PI * 2);
      ctx.fill();

      const chipRng = createSeededRandom(impact.seed + 1);
      ctx.fillStyle = 'rgba(232, 242, 252, 0.9)';
      ctx.beginPath();
      const chipR = 3 + impact.strength * 3.5;
      for (let i = 0; i <= 7; i++) {
        const theta = (i / 7) * Math.PI * 2;
        const r = chipR * chipRng.range(0.6, 1.25);
        const px = impact.x + Math.cos(theta) * r;
        const py = impact.y + Math.sin(theta) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.fill();
    }

    // Dual-pass strokes: dark offset shadow under a bright highlight keeps
    // cracks readable over both bright and dark camera backgrounds.
    for (const seg of model.state.crackSegments) {
      strokeSegment(
        ctx,
        seg,
        1.5,
        1.5,
        `rgba(18, 24, 34, ${seg.opacity * 0.6})`,
        seg.width + 1.4,
      );
      strokeSegment(
        ctx,
        seg,
        0,
        0,
        `rgba(255, 255, 255, ${seg.opacity})`,
        seg.width,
      );
    }

    compositePane();
  }

  function strokeSegment(ctx, seg, dx, dy, style, lineWidth) {
    ctx.strokeStyle = style;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    seg.points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x + dx, pt.y + dy);
      else ctx.lineTo(pt.x + dx, pt.y + dy);
    });
    ctx.stroke();
  }

  function compositePane() {
    glassCtx.clearRect(0, 0, width, height);
    glassCtx.save();
    glassCtx.globalAlpha = paneOpacity;
    glassCtx.setTransform(1, 0, 0, 1, 0, 0);
    glassCtx.drawImage(paneLayer, 0, 0);
    glassCtx.drawImage(crackLayer, 0, 0);
    glassCtx.restore();
    glassCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // -------------------------------------------------------------------------
  // Per-impact transient effects
  // -------------------------------------------------------------------------

  function addImpactEffects(impact, nowMs) {
    const { x, y, strength } = impact;
    flashes.push({ x, y, strength, start: nowMs });
    rings.push({ x, y, strength, start: nowMs, kind: 'shock' });
    rings.push({ x, y, strength, start: nowMs, kind: 'ripple' });

    const count = Math.round((12 + strength * 20) * (reducedMotion ? 0.4 : 1));
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 220 * (0.5 + strength);
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: 350 + Math.random() * 350,
        born: nowMs,
        size: 1 + Math.random() * 1.6,
      });
    }

    shake = {
      until: nowMs + SHAKE_MS,
      magnitude: (2 + strength * 4) * (reducedMotion ? 0.25 : 1),
    };
  }

  function drawEffects(nowMs) {
    // Flashes: brief white burst at the impact point.
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      const t = (nowMs - f.start) / FLASH_MS;
      if (t >= 1) {
        flashes.splice(i, 1);
        continue;
      }
      const radius = 50 + f.strength * 90;
      const grad = fxCtx.createRadialGradient(f.x, f.y, 0, f.x, f.y, radius);
      grad.addColorStop(0, `rgba(255,255,255,${0.55 * (1 - t)})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      fxCtx.fillStyle = grad;
      fxCtx.beginPath();
      fxCtx.arc(f.x, f.y, radius, 0, Math.PI * 2);
      fxCtx.fill();
    }

    // Shock ring (white, fast) and energy ripple (cool tint, slower) — the
    // barrier accent stays secondary to the physical crack look.
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      const durMs = r.kind === 'shock' ? RING_MS : RIPPLE_MS;
      const t = (nowMs - r.start) / durMs;
      if (t >= 1) {
        rings.splice(i, 1);
        continue;
      }
      const eased = 1 - (1 - t) * (1 - t);
      const maxRadius = (r.kind === 'shock' ? 90 : 150) * (0.7 + r.strength);
      const alpha = (1 - t) * (r.kind === 'shock' ? 0.5 : 0.22);
      fxCtx.strokeStyle =
        r.kind === 'shock'
          ? `rgba(255,255,255,${alpha})`
          : `rgba(130, 205, 255, ${alpha})`;
      fxCtx.lineWidth = r.kind === 'shock' ? 2.5 : 1.5;
      fxCtx.beginPath();
      fxCtx.arc(r.x, r.y, 8 + eased * maxRadius, 0, Math.PI * 2);
      fxCtx.stroke();
    }
  }

  function drawParticles(nowMs, dtMs) {
    const dt = dtMs / 1000;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      const age = nowMs - p.born;
      if (age > p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += DUST_GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const alpha = 0.7 * (1 - age / p.life);
      fxCtx.fillStyle = `rgba(235, 244, 252, ${alpha})`;
      fxCtx.fillRect(p.x, p.y, p.size, p.size);
    }
  }

  function drawSheen(nowMs) {
    // Slow moving specular band so the pane feels present without blocking
    // the webcam. Skipped once the pane is gone.
    if (paneOpacity <= 0) return;
    const phase = (nowMs % 9000) / 9000;
    const cx = -0.4 + phase * 1.8; // sweeps past both edges
    const grad = fxCtx.createLinearGradient(
      width * cx,
      0,
      width * (cx + 0.35),
      height * 0.6,
    );
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(255,255,255,${0.03 * paneOpacity})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    fxCtx.fillStyle = grad;
    fxCtx.fillRect(0, 0, width, height);
  }

  // -------------------------------------------------------------------------
  // Shatter sequence (section 10): the glass composite is snapshotted once,
  // then drawn clipped to each falling shard polygon on the glass canvas.
  // -------------------------------------------------------------------------

  function startShatter(model, onComplete) {
    const snapshot = document.createElement('canvas');
    snapshot.width = glassCanvas.width;
    snapshot.height = glassCanvas.height;
    snapshot.getContext('2d').drawImage(glassCanvas, 0, 0);

    const count = reducedMotion
      ? CONFIG.rendering.reducedMotionShardCount
      : CONFIG.rendering.desktopShardCount;
    const seed =
      model.state.impacts.length > 0
        ? model.state.impacts[model.state.impacts.length - 1].seed
        : 424242;

    shatter = {
      snapshot,
      shards: generateShards({ width, height }, model.state.impacts, {
        count,
        seed,
      }),
      elapsedMs: 0,
      onComplete,
    };

    // Stronger impulse than a regular hit (section 10 "screen impulse").
    shake = {
      until: performance.now() + SHAKE_MS * 1.8,
      magnitude: (reducedMotion ? 3 : 12) * 1,
    };
  }

  function cancelShatter() {
    shatter = null;
  }

  function drawShatter(dtMs) {
    shatter.elapsedMs += dtMs;
    const alive = updateShards(shatter.shards, dtMs, { width, height });
    const timedOut = shatter.elapsedMs > CONFIG.timing.shatterMs + 1200;

    glassCtx.clearRect(0, 0, width, height);

    if (alive === 0 || timedOut) {
      const done = shatter.onComplete;
      shatter = null;
      paneOpacity = 0; // keeps the sheen off; pane is gone until rebuild
      done?.();
      return;
    }

    // Shards still waiting on their stagger delay draw in place (x/y/rot
    // all zero), so the pane looks whole until the ripple reaches them.
    for (const shard of shatter.shards) {
      if (shard.gone) continue;
      glassCtx.save();
      glassCtx.translate(shard.cx + shard.x, shard.cy + shard.y);
      glassCtx.rotate(shard.rotation);
      glassCtx.globalAlpha = shard.opacity;
      glassCtx.beginPath();
      shard.relPoints.forEach((p, i) => {
        if (i === 0) glassCtx.moveTo(p.x, p.y);
        else glassCtx.lineTo(p.x, p.y);
      });
      glassCtx.closePath();
      glassCtx.clip();
      glassCtx.drawImage(shatter.snapshot, -shard.cx, -shard.cy, width, height);
      glassCtx.restore();
    }
  }

  function applyShake(nowMs) {
    if (!stageElement) return;
    if (nowMs < shake.until && shake.magnitude > 0) {
      const m = shake.magnitude;
      const ox = (Math.random() * 2 - 1) * m;
      const oy = (Math.random() * 2 - 1) * m;
      stageElement.style.transform = `translate(${ox.toFixed(1)}px, ${oy.toFixed(1)}px)`;
    } else if (stageElement.style.transform) {
      stageElement.style.transform = '';
    }
  }

  window.addEventListener('resize', resize);
  resize();

  let lastFrameMs = 0;

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

    /** Redraw the persistent crack layer from the model (impact time only). */
    renderCracks: paintCracks,

    /** Register transient effects for a new impact. */
    addImpactEffects(impact) {
      addImpactEffects(impact, performance.now());
    },

    /** Set pane visibility (also used when a rebuild restores the glass). */
    setPaneOpacity(opacity) {
      paneOpacity = opacity;
      compositePane();
    },

    /** Snapshot the pane and start the falling-shard sequence. */
    startShatter,

    /** Abort an in-flight shatter (dev reset during BREAKING). */
    cancelShatter,

    get shattering() {
      return shatter !== null;
    },

    /** Per-frame pass: FX layer always; glass layer only while shattering. */
    drawFrame(nowMs) {
      const dtMs = lastFrameMs > 0 ? Math.min(nowMs - lastFrameMs, 50) : 16;
      lastFrameMs = nowMs;
      if (shatter) drawShatter(dtMs);
      fxCtx.clearRect(0, 0, width, height);
      drawSheen(nowMs);
      drawEffects(nowMs);
      drawParticles(nowMs, dtMs);
      applyShake(nowMs);
    },
  };
}

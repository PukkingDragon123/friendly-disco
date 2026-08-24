// Game feel: camera shake, hit-stop, screen flash, chromatic wobble, floating text,
// and a tiny tween runner. Every scene draws inside applyCamera/restore and finishes
// with drawOverlay, so juice composites uniformly.

import { rect, text, wash, clamp, W, H } from './pixel.js';
import { col } from './palette.js';

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t)),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - (1 - t) ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - 4 * (1 - t) ** 3),
  outBack: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
  inBack: (t) => 2.70158 * t * t * t - 1.70158 * t * t,
  outElastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
  outBounce: (t) => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
};

const tweens = [];

/** tween(from, to, dur, ease, onUpdate, onDone) -> handle with .cancel() */
export function tween(from, to, dur, ease, onUpdate, onDone) {
  const h = { t: 0, dur: Math.max(0.0001, dur), from, to, ease: ease || Ease.linear, onUpdate, onDone, dead: false, cancel() { this.dead = true; } };
  tweens.push(h);
  return h;
}

export function clearTweens() { tweens.length = 0; }

const pops = [];
let shakeMag = 0, shakeDur = 0, shakeT = 0;
let flashCol = null, flashDur = 0, flashT = 0, flashA = 0;
let slowScale = 1, slowDur = 0, slowT = 0;
let chromaMag = 0, chromaT = 0, chromaDur = 0;
let vignetteAmt = 0;
let camX = 0, camY = 0, camOffX = 0, camOffY = 0;
let clock = 0;
let seedN = 1;

function nrand() {
  // cheap deterministic-ish noise for shake; visual only, so no rng dependency needed
  seedN = (seedN * 1103515245 + 12345) & 0x7fffffff;
  return (seedN / 0x7fffffff) * 2 - 1;
}

export const Juice = {
  get timeScale() { return slowT > 0 ? slowScale : 1; },
  get t() { return clock; },
  get shaking() { return shakeT > 0; },

  shake(mag = 3, dur = 0.22) {
    if (mag >= shakeMag || shakeT <= 0) { shakeMag = mag; shakeDur = dur; shakeT = dur; }
    else { shakeT = Math.max(shakeT, dur * 0.6); }
  },

  flash(color = 'white', dur = 0.16, a = 0.5) {
    flashCol = color; flashDur = dur; flashT = dur; flashA = a;
  },

  /** Hit-stop / bullet-time. scale < 1 slows the world. */
  slow(scale = 0.25, dur = 0.25) {
    slowScale = scale; slowDur = dur; slowT = dur;
  },

  chromatic(mag = 2, dur = 0.3) { chromaMag = mag; chromaDur = dur; chromaT = dur; },

  vignette(amt) { vignetteAmt = clamp(amt, 0, 1); },

  /** Floating score/text pop. */
  pop(str, x, y, o = {}) {
    pops.push({
      str: String(str), x, y, vx: o.vx || 0, vy: o.vy !== undefined ? o.vy : -26,
      life: o.life || 0.9, t: 0, color: o.color || 'white', font: o.font || 5,
      outline: o.outline !== undefined ? o.outline : 'ink', scale: o.scale || 1,
      grav: o.grav !== undefined ? o.grav : 40, center: o.center !== false,
    });
    if (pops.length > 64) pops.shift();
  },

  pan(x, y) { camX = x; camY = y; },

  update(dt) {
    clock += dt;
    if (shakeT > 0) shakeT -= dt;
    if (flashT > 0) flashT -= dt;
    if (slowT > 0) slowT -= dt;
    if (chromaT > 0) chromaT -= dt;

    const k = shakeT > 0 ? (shakeT / shakeDur) ** 1.4 : 0;
    camOffX = k ? nrand() * shakeMag * k : 0;
    camOffY = k ? nrand() * shakeMag * k : 0;

    for (let i = tweens.length - 1; i >= 0; i--) {
      const h = tweens[i];
      if (h.dead) { tweens.splice(i, 1); continue; }
      h.t += dt;
      const p = Math.min(1, h.t / h.dur);
      const e = h.ease(p);
      if (h.onUpdate) h.onUpdate(h.from + (h.to - h.from) * e, e, p);
      if (p >= 1) { if (h.onDone) h.onDone(); tweens.splice(i, 1); }
    }

    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      if (p.t >= p.life) pops.splice(i, 1);
    }
  },

  applyCamera(g) {
    g.save();
    g.translate(Math.round(camX + camOffX), Math.round(camY + camOffY));
  },

  restore(g) { g.restore(); },

  drawPops(g) {
    for (const p of pops) {
      const k = p.t / p.life;
      // blink out at the end instead of fading — reads better in pixel art
      if (k > 0.75 && Math.floor(p.t * 24) % 2 === 0) continue;
      text(g, p.str, Math.round(p.x), Math.round(p.y), p.color, {
        font: p.font, center: p.center, outline: p.outline,
      });
    }
  },

  drawOverlay(g) {
    if (chromaT > 0) {
      // cheap chromatic fringe: two 1px offset colour bars at the screen edges
      const k = chromaT / chromaDur;
      const m = Math.max(1, Math.round(chromaMag * k));
      wash(g, 0, 0, m, H, 'red2', 0.25 * k);
      wash(g, W - m, 0, m, H, 'teal', 0.25 * k);
    }
    if (flashT > 0 && flashCol) {
      const k = flashT / flashDur;
      wash(g, 0, 0, W, H, flashCol, flashA * k);
    }
    if (vignetteAmt > 0) {
      const n = Math.round(10 * vignetteAmt);
      for (let i = 0; i < n; i++) {
        const a = 0.05 * vignetteAmt * (1 - i / n);
        wash(g, 0, i, W, 1, 'ink', a);
        wash(g, 0, H - 1 - i, W, 1, 'ink', a);
        wash(g, i, 0, 1, H, 'ink', a);
        wash(g, W - 1 - i, 0, 1, H, 'ink', a);
      }
    }
  },

  reset() {
    shakeT = 0; flashT = 0; slowT = 0; chromaT = 0; vignetteAmt = 0;
    camX = camY = camOffX = camOffY = 0;
    pops.length = 0; tweens.length = 0;
  },
};

/** Frame-rate independent exponential approach — used everywhere for smooth UI. */
export function approach(cur, target, rate, dt) {
  return cur + (target - cur) * (1 - Math.exp(-rate * dt));
}

// Pixel drawing primitives.
//
// Everything in the game draws through here so the whole screen stays on a single
// integer pixel grid. Canvas2D's arcs/gradients/AA are never used for art — they
// produce half-lit pixels that instantly break the pixel-art read.
//
// Perf note: the per-pixel helpers (shadeDisc, sphereMap, noiseFill) are meant for
// BAKING into an offscreen canvas once, not for calling every frame. The span-based
// helpers (rect/disc/ellipse/line/text) are cheap enough for per-frame use.

import { col, mix, alpha as pAlpha } from './palette.js';
import { FONT5, FONT3, FONT7 } from '../render/font.js';

export const W = 640;
export const H = 360;

const R = Math.round;

/* ------------------------------------------------------------------ basics */

export function px(g, x, y, c) {
  g.fillStyle = col(c);
  g.fillRect(R(x), R(y), 1, 1);
}

export function rect(g, x, y, w, h, c) {
  if (w <= 0 || h <= 0) return;
  g.fillStyle = col(c);
  g.fillRect(R(x), R(y), R(w), R(h));
}

/** 1px outline. */
export function frame(g, x, y, w, h, c, t = 1) {
  rect(g, x, y, w, t, c);
  rect(g, x, y + h - t, w, t, c);
  rect(g, x, y + t, t, h - t * 2, c);
  rect(g, x + w - t, y + t, t, h - t * 2, c);
}

/** Rounded-corner box: knocks the 4 corner pixels off a filled rect. */
export function box(g, x, y, w, h, c, r = 1) {
  rect(g, x + r, y, w - r * 2, h, c);
  rect(g, x, y + r, r, h - r * 2, c);
  rect(g, x + w - r, y + r, r, h - r * 2, c);
  if (r > 1) {
    rect(g, x + 1, y + 1, r - 1, r - 1, c);
    rect(g, x + w - r, y + 1, r - 1, r - 1, c);
    rect(g, x + 1, y + h - r, r - 1, r - 1, c);
    rect(g, x + w - r, y + h - r, r - 1, r - 1, c);
  }
}

export function boxFrame(g, x, y, w, h, c, r = 1) {
  rect(g, x + r, y, w - r * 2, 1, c);
  rect(g, x + r, y + h - 1, w - r * 2, 1, c);
  rect(g, x, y + r, 1, h - r * 2, c);
  rect(g, x + w - 1, y + r, 1, h - r * 2, c);
  if (r >= 1) {
    px(g, x + r - 1, y + r - 1, c); px(g, x + w - r, y + r - 1, c);
    px(g, x + r - 1, y + h - r, c); px(g, x + w - r, y + h - r, c);
  }
}

/** Bresenham line. */
export function line(g, x0, y0, x1, y1, c) {
  x0 = R(x0); y0 = R(y0); x1 = R(x1); y1 = R(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  g.fillStyle = col(c);
  for (let i = 0; i < 4096; i++) {
    g.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = err * 2;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

/** Dashed / dotted line. `on`/`off` in pixels, `phase` scrolls it. */
export function dashLine(g, x0, y0, x1, y1, c, on = 2, off = 2, phase = 0) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.max(1, Math.hypot(dx, dy));
  const period = on + off;
  g.fillStyle = col(c);
  for (let d = 0; d < len; d++) {
    if ((d + phase) % period < on) {
      g.fillRect(R(x0 + (dx * d) / len), R(y0 + (dy * d) / len), 1, 1);
    }
  }
}

export function tri(g, x0, y0, x1, y1, x2, y2, c) {
  const pts = [[x0, y0], [x1, y1], [x2, y2]].sort((a, b) => a[1] - b[1]);
  const [[ax, ay], [bx, by], [cx, cy]] = pts;
  g.fillStyle = col(c);
  const span = (y, p0, p1, p2, p3) => {
    const t0 = (y - p0[1]) / Math.max(1e-6, p1[1] - p0[1]);
    const t1 = (y - p2[1]) / Math.max(1e-6, p3[1] - p2[1]);
    const xa = p0[0] + (p1[0] - p0[0]) * t0;
    const xb = p2[0] + (p3[0] - p2[0]) * t1;
    const l = R(Math.min(xa, xb)), r = R(Math.max(xa, xb));
    g.fillRect(l, R(y), Math.max(1, r - l + 1), 1);
  };
  for (let y = R(ay); y <= R(cy); y++) {
    if (y < by) span(y, [ax, ay], [bx, by], [ax, ay], [cx, cy]);
    else span(y, [bx, by], [cx, cy], [ax, ay], [cx, cy]);
  }
}

/* ------------------------------------------------------------- round things */

/** Filled circle built from integer row spans — the pixel-art way. */
export function disc(g, cx, cy, r, c) {
  cx = R(cx); cy = R(cy);
  g.fillStyle = col(c);
  for (let dy = -R(r); dy <= R(r); dy++) {
    const dx = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.4);
    if (dx <= 0 && Math.abs(dy) === R(r) && r > 1.5) continue;
    g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
  }
}

export function ring(g, cx, cy, r, c, t = 1) {
  cx = R(cx); cy = R(cy);
  g.fillStyle = col(c);
  const ri = Math.max(0, r - t);
  for (let dy = -R(r); dy <= R(r); dy++) {
    const dxo = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)) + 0.4);
    const dxi = Math.abs(dy) <= ri ? Math.floor(Math.sqrt(Math.max(0, ri * ri - dy * dy)) + 0.4) : -1;
    if (dxi < 0) { g.fillRect(cx - dxo, cy + dy, dxo * 2 + 1, 1); }
    else {
      g.fillRect(cx - dxo, cy + dy, dxo - dxi, 1);
      g.fillRect(cx + dxi + 1, cy + dy, dxo - dxi, 1);
    }
  }
}

export function ellipse(g, cx, cy, rx, ry, c) {
  cx = R(cx); cy = R(cy);
  g.fillStyle = col(c);
  const ry2 = Math.max(0.5, ry);
  for (let dy = -Math.ceil(ry2); dy <= Math.ceil(ry2); dy++) {
    const k = 1 - (dy * dy) / (ry2 * ry2);
    if (k < 0) continue;
    const dx = Math.floor(rx * Math.sqrt(k) + 0.4);
    g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
  }
}

export function ellipseFrame(g, cx, cy, rx, ry, c) {
  cx = R(cx); cy = R(cy);
  g.fillStyle = col(c);
  let prev = -1;
  const ry2 = Math.max(0.5, ry);
  for (let dy = -Math.ceil(ry2); dy <= Math.ceil(ry2); dy++) {
    const k = 1 - (dy * dy) / (ry2 * ry2);
    const dx = k < 0 ? -1 : Math.floor(rx * Math.sqrt(k) + 0.4);
    if (dx < 0) { prev = dx; continue; }
    if (prev < 0 || Math.abs(dy) === Math.ceil(ry2)) g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
    else {
      const w = Math.max(1, dx - prev + 1);
      g.fillRect(cx - dx, cy + dy, w, 1);
      g.fillRect(cx + dx - w + 1, cy + dy, w, 1);
    }
    prev = dx;
  }
}

/**
 * Shaded sphere: 4-tone terminator with a rim light and a specular dot.
 * BAKE THIS — it is a per-pixel loop.
 */
export function shadeDisc(g, cx, cy, r, o = {}) {
  const base = col(o.base || 'grey1');
  const light = col(o.light || mix(base, '#ffffff', 0.35));
  const hi = col(o.hi || mix(base, '#ffffff', 0.7));
  const dark = col(o.dark || mix(base, '#000000', 0.35));
  const deepc = col(o.deep || mix(base, '#000000', 0.6));
  const rim = o.rim ? col(o.rim) : null;
  const lx = o.lx !== undefined ? o.lx : -0.45;
  const ly = o.ly !== undefined ? o.ly : -0.55;
  cx = R(cx); cy = R(cy);
  const ir = R(r);
  for (let dy = -ir; dy <= ir; dy++) {
    for (let dx = -ir; dx <= ir; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > r * r) continue;
      const nz = Math.sqrt(Math.max(0, 1 - d2 / (r * r)));
      const nx = dx / r, ny = dy / r;
      const lam = -(nx * lx + ny * ly) + nz * 0.55;
      const edge = Math.sqrt(d2) / r;
      let c;
      if (rim && edge > 0.86 && lam < 0.55) c = rim;
      else if (lam > 1.02) c = hi;
      else if (lam > 0.74) c = light;
      else if (lam > 0.36) c = base;
      else if (lam > 0.08) c = dark;
      else c = deepc;
      g.fillStyle = c;
      g.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
}

/* -------------------------------------------------------------- gradients   */

const BAYER = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
];

/** 4x4 ordered-dither blend of two colours. level 0..16 (0 = all A). */
export function dither(g, x, y, w, h, cA, cB, level) {
  const a = col(cA), b = col(cB);
  x = R(x); y = R(y); w = R(w); h = R(h);
  const L = Math.max(0, Math.min(16, level));
  if (L <= 0) { rect(g, x, y, w, h, a); return; }
  if (L >= 16) { rect(g, x, y, w, h, b); return; }
  rect(g, x, y, w, h, a);
  g.fillStyle = b;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (BAYER[(y + j) & 3][(x + i) & 3] < L) g.fillRect(x + i, y + j, 1, 1);
    }
  }
}

/** Banded vertical gradient through a list of palette keys, dithered at the seams. */
export function vgrad(g, x, y, w, h, keys, bandDither = 3) {
  const n = keys.length;
  if (n === 0) return;
  if (n === 1) { rect(g, x, y, w, h, keys[0]); return; }
  const bh = h / (n - 1);
  for (let i = 0; i < n - 1; i++) {
    const y0 = R(y + bh * i), y1 = R(y + bh * (i + 1));
    const seg = Math.max(1, y1 - y0);
    for (let j = 0; j < seg; j++) {
      const t = j / seg;
      const lvl = t < 0.5 - 0.5 / bandDither ? 0
        : t > 0.5 + 0.5 / bandDither ? 16
          : Math.round(((t - (0.5 - 0.5 / bandDither)) / (1 / bandDither)) * 16);
      dither(g, x, y0 + j, w, 1, keys[i], keys[i + 1], lvl);
    }
  }
}

/** Horizontal scanline shimmer used on water and metal. */
export function scan(g, x, y, w, h, c, step = 2, phase = 0) {
  g.fillStyle = col(c);
  for (let j = 0; j < h; j++) {
    if (((y + j + phase) % step) === 0) g.fillRect(R(x), R(y + j), R(w), 1);
  }
}

/** Value-noise speckle for cloth/sand/rock. Deterministic in (x,y). BAKE THIS. */
export function noiseFill(g, x, y, w, h, cA, cB, density = 0.18, seed = 1) {
  rect(g, x, y, w, h, cA);
  g.fillStyle = col(cB);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let n = ((i + 374761393) * 1274126177) ^ ((j + 668265263) * 2246822519) ^ (seed * 3266489917);
      n = Math.imul(n ^ (n >>> 15), 2246822507);
      n = (n ^ (n >>> 13)) >>> 0;
      if ((n % 1000) / 1000 < density) g.fillRect(R(x + i), R(y + j), 1, 1);
    }
  }
}

/* ------------------------------------------------------------------- text   */

function glyphIn(font, ch) {
  const gl = font.glyphs;
  if (gl[ch]) return gl[ch];
  const up = ch.toUpperCase();
  if (gl[up]) return gl[up];
  const lo = ch.toLowerCase();
  if (gl[lo]) return gl[lo];
  return null;
}

/** FONT3 deliberately carries a small glyph set; anything it lacks borrows the FONT5
 *  shape, scaled down by dropping its widest column. Better a squeezed glyph than a box. */
const SQUEEZE_CACHE = new Map();
function squeeze(rows, fromW, toW, fromH, toH) {
  const key = rows.join(',') + '|' + fromW + toW + fromH + toH;
  let hit = SQUEEZE_CACHE.get(key);
  if (hit) return hit;
  const out = [];
  for (let r = 0; r < toH; r++) {
    const src = rows[Math.min(rows.length - 1, Math.round((r * (fromH - 1)) / Math.max(1, toH - 1)))] || 0;
    let bits = 0;
    for (let c = 0; c < toW; c++) {
      const sc = Math.round((c * (fromW - 1)) / Math.max(1, toW - 1));
      // OR the neighbouring source columns so thin strokes survive the squeeze
      const lit = (src & (1 << (fromW - 1 - sc)))
        || (sc + 1 < fromW && c === toW - 1 && (src & (1 << (fromW - 2 - sc))));
      if (lit) bits |= 1 << (toW - 1 - c);
    }
    out.push(bits);
  }
  SQUEEZE_CACHE.set(key, out);
  return out;
}

function glyphFor(font, ch) {
  const direct = glyphIn(font, ch);
  if (direct) return direct;
  // Borrow from whichever other face has the glyph, rescaled into this one's box.
  // Better a squeezed or stretched letter than a solid placeholder box.
  for (const other of [FONT5, FONT7, FONT3]) {
    if (other === font) continue;
    const alt = glyphIn(other, ch);
    if (alt) return squeeze(alt, other.w, font.w, other.h, font.h);
  }
  return null;
}

export function charW(ch, font) {
  const gl = glyphFor(font, ch);
  if (ch === ' ') return font.spaceW || Math.max(2, Math.floor(font.w / 2));
  if (!gl) return font.w;
  if (font.widths && font.widths[ch] !== undefined) return font.widths[ch];
  // trim empty right columns so text kerns tightly
  let used = 0;
  for (const row of gl) {
    for (let c = 0; c < font.w; c++) {
      if (row & (1 << (font.w - 1 - c))) used = Math.max(used, c + 1);
    }
  }
  return used || Math.max(2, Math.floor(font.w / 2));
}

function pickFont(f) { return f === 3 ? FONT3 : f === 7 ? FONT7 : FONT5; }

export function textW(str, o = {}) {
  const font = pickFont(o.font);
  const sp = o.spacing !== undefined ? o.spacing : (font.gap !== undefined ? font.gap : 1);
  const scale = Math.max(1, Math.round(o.scale || 1));
  let w = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) w += charW(s[i], font) + (i < s.length - 1 ? sp : 0);
  return w * scale;
}

/** Line height for a font at a scale — handy for laying out blocks of text. */
export function textH(o = {}) {
  return pickFont(o.font).h * Math.max(1, Math.round(o.scale || 1));
}

/**
 * Draw bitmap text.
 * opts: {font:5|3, spacing, shadow:'ink'|true, outline, center, right, wave, t, alpha}
 * Returns the width drawn.
 */
export function text(g, str, x, y, c, o = {}) {
  const font = pickFont(o.font);
  const sp = o.spacing !== undefined ? o.spacing : (font.gap !== undefined ? font.gap : 1);
  const sc = Math.max(1, Math.round(o.scale || 1));
  const s = String(str);
  const total = textW(s, o);
  let ox = R(x);
  if (o.center) ox = R(x - total / 2);
  else if (o.right) ox = R(x - total);
  const oy = R(y);

  const drawPass = (dx, dy, color) => {
    g.fillStyle = col(color);
    let cx = ox + dx * sc;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      const cw = charW(ch, font);
      const gl = glyphFor(font, ch);
      if (gl && ch !== ' ') {
        const bob = o.wave ? Math.round(Math.sin((o.t || 0) * 6 + i * 0.6) * o.wave) : 0;
        for (let r = 0; r < font.h; r++) {
          const row = gl[r] || 0;
          if (!row) continue;
          let runStart = -1;
          for (let cc = 0; cc <= font.w; cc++) {
            const on = cc < font.w && (row & (1 << (font.w - 1 - cc)));
            if (on && runStart < 0) runStart = cc;
            else if (!on && runStart >= 0) {
              g.fillRect(cx + runStart * sc, oy + (dy + r + bob) * sc, (cc - runStart) * sc, sc);
              runStart = -1;
            }
          }
        }
      } else if (!gl && ch !== ' ') {
        g.fillRect(cx, oy + (dy + 1) * sc, (cw - 1) * sc, (font.h - 2) * sc);
      }
      cx += (cw + sp) * sc;
    }
  };

  const prevA = g.globalAlpha;
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  if (o.outline) {
    const oc = o.outline === true ? 'ink' : o.outline;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) drawPass(dx, dy, oc);
  } else if (o.shadow) {
    drawPass(o.shadowX || 1, o.shadowY || 1, o.shadow === true ? 'ink' : o.shadow);
  }
  drawPass(0, 0, c);
  g.globalAlpha = prevA;
  return total;
}

/** Greedy word wrap to a pixel width. */
export function wrap(str, maxW, o = {}) {
  const words = String(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const cand = cur ? cur + ' ' + w : w;
    if (textW(cand, o) <= maxW || !cur) cur = cand;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ------------------------------------------------------------------ misc    */

export function clip(g, x, y, w, h, fn) {
  g.save();
  g.beginPath();
  g.rect(R(x), R(y), R(w), R(h));
  g.clip();
  fn();
  g.restore();
}

/** Translucent wash — the one sanctioned use of alpha, for overlays. */
export function wash(g, x, y, w, h, c, a) {
  g.fillStyle = pAlpha(c, a);
  g.fillRect(R(x), R(y), R(w), R(h));
}

/** A crisp offscreen canvas for baking sprites. */
export function makeCanvas(w, h) {
  const c = typeof document !== 'undefined' && document.createElement
    ? document.createElement('canvas')
    : (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : null);
  if (!c) return null;
  c.width = Math.max(1, R(w)); c.height = Math.max(1, R(h));
  const g = c.getContext('2d');
  if (g) { g.imageSmoothingEnabled = false; }
  return { canvas: c, g };
}

/** Nearest-neighbour blit with optional integer scale and horizontal flip. */
export function blit(g, src, x, y, scale = 1, flip = false) {
  if (!src) return;
  const w = src.width * scale, h = src.height * scale;
  g.save();
  g.imageSmoothingEnabled = false;
  if (flip) {
    g.translate(R(x) + w, R(y));
    g.scale(-1, 1);
    g.drawImage(src, 0, 0, w, h);
  } else {
    g.drawImage(src, R(x), R(y), w, h);
  }
  g.restore();
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

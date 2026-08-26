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

// 960x540: 1.5x the old frame, so x2 lands exactly on 1920x1080. The extra pixels go
// into DETAIL rather than into fitting more on screen — the deck is a larger fraction of
// the frame than it was, animals are baked at 32px instead of 20, and the body face is
// the 7x9 rather than the 5x7. Net effect: zoomed in and sharper at the same time.
export const W = 960;
export const H = 540;

const R = Math.round;

/* ----------------------------------------------------------- THE MACRO PIXEL

ONE RESOLUTION FOR THE WHOLE GAME.

The frame is 960x540, but the game is not drawn at 960x540: every asset in it is drawn
on a TWO-PIXEL GRID, so the smallest thing anything can be is a 2x2 block. That is the
single rule that makes a screen look like one game rather than three:

  the animals were authored at half size and blitted at 2x  -> 2px features
  the tiles, the folk and the plants, likewise               -> 2px features
  the boat, the weather, the set-pieces, the chrome          -> 1px features

Mixed, the fine stuff reads as higher-resolution than the art it sits on, which is
exactly what "some of this looks like a different game" means. Rather than hand-editing
several thousand call sites, the grid lives HERE, in the primitives everything draws
through: positions snap to even, sizes round up to even, and the round things step two
rows at a time. A hairline becomes a two-pixel line, a one-pixel speckle becomes a
two-pixel fleck, and a hundred small decisions about detail density come out consistent
for free.

Text is the one exception and stays on the fine grid: the fonts are authored shapes with
their own stroke weights (FONT7's stems are already two pixels), and doubling them would
double every label in the game. Only the ORIGIN of a string snaps, so text sits on the
same grid as the box it is printed in.
*/
export let GRID = 2;
const Q = (n) => Math.round(n / GRID) * GRID;                      // a position
const QS = (n) => Math.max(GRID, Math.round(n / GRID) * GRID);     // a size, never zero
const QN = (n) => Math.round(n / GRID);                            // in whole macro pixels

/**
 * THE ONE EXEMPTION, and it is not an exemption at all.
 *
 * Half the game's art is authored at HALF SIZE and blitted at 2x -- the animals, the
 * folk, the tiles, the plants. Inside one of those buffers a single pixel already IS a
 * macro pixel, so snapping again would make it four screen pixels wide.
 *
 * fine() drops the grid for the duration of a bake that will be blitted at 2x. Anything
 * drawn straight to the screen, or baked and blitted at 1:1, stays on the grid. The rule
 * is not "some things are finer", it is "the macro pixel is measured in SCREEN pixels".
 */
export function fine(fn) {
  const prev = GRID;
  GRID = 1;
  try { return fn(); } finally { GRID = prev; }
}

/* ------------------------------------------------------------------ basics */

export function px(g, x, y, c) {
  g.fillStyle = col(c);
  g.fillRect(Q(x), Q(y), GRID, GRID);
}

export function rect(g, x, y, w, h, c) {
  if (w <= 0 || h <= 0) return;
  g.fillStyle = col(c);
  g.fillRect(Q(x), Q(y), QS(w), QS(h));
}

/** One-macro-pixel outline; `t` is in macro pixels. */
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

/** Bresenham line, walked in MACRO pixels so a diagonal steps like the art does. */
export function line(g, x0, y0, x1, y1, c) {
  x0 = QN(x0); y0 = QN(y0); x1 = QN(x1); y1 = QN(y1);
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  g.fillStyle = col(c);
  for (let i = 0; i < 2048; i++) {
    g.fillRect(x0 * GRID, y0 * GRID, GRID, GRID);
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
  const period = Math.max(1, on + off);
  g.fillStyle = col(c);
  for (let d = 0; d < len; d += GRID) {
    if ((Math.round(d / GRID) + phase) % period < on) {
      g.fillRect(Q(x0 + (dx * d) / len), Q(y0 + (dy * d) / len), GRID, GRID);
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
    const l = Q(Math.min(xa, xb)), r = Q(Math.max(xa, xb));
    g.fillRect(l, Q(y), Math.max(GRID, r - l + GRID), GRID);
  };
  for (let y = Q(ay); y <= Q(cy); y += GRID) {
    if (y < by) span(y, [ax, ay], [bx, by], [ax, ay], [cx, cy]);
    else span(y, [bx, by], [cx, cy], [ax, ay], [cx, cy]);
  }
}

/* ------------------------------------------------------------- round things */

/** Filled circle built from integer row spans — the pixel-art way. */
export function disc(g, cx, cy, r, c) {
  cx = Q(cx); cy = Q(cy);
  const ir = QN(r) * GRID;
  g.fillStyle = col(c);
  for (let dy = -ir; dy <= ir; dy += GRID) {
    const dx = Q(Math.sqrt(Math.max(0, r * r - dy * dy)));
    if (dx <= 0 && Math.abs(dy) === ir && r > 1.5 * GRID) continue;
    g.fillRect(cx - dx, cy + dy, dx * 2 + GRID, GRID);
  }
}

export function ring(g, cx, cy, r, c, t = 1) {
  cx = Q(cx); cy = Q(cy);
  g.fillStyle = col(c);
  const ri = Math.max(0, r - Math.max(GRID, t * GRID));
  const ir = QN(r) * GRID;
  for (let dy = -ir; dy <= ir; dy += GRID) {
    const dxo = Q(Math.sqrt(Math.max(0, r * r - dy * dy)));
    const dxi = Math.abs(dy) <= ri ? Q(Math.sqrt(Math.max(0, ri * ri - dy * dy))) : -1;
    if (dxi < 0) { g.fillRect(cx - dxo, cy + dy, dxo * 2 + GRID, GRID); }
    else {
      g.fillRect(cx - dxo, cy + dy, Math.max(GRID, dxo - dxi), GRID);
      g.fillRect(cx + dxi + GRID, cy + dy, Math.max(GRID, dxo - dxi), GRID);
    }
  }
}

export function ellipse(g, cx, cy, rx, ry, c) {
  cx = Q(cx); cy = Q(cy);
  g.fillStyle = col(c);
  const ry2 = Math.max(GRID / 2, ry);
  const iy = Math.max(GRID, QN(ry2) * GRID);
  for (let dy = -iy; dy <= iy; dy += GRID) {
    const k = 1 - (dy * dy) / (ry2 * ry2);
    if (k < 0) continue;
    const dx = Q(rx * Math.sqrt(k));
    g.fillRect(cx - dx, cy + dy, dx * 2 + GRID, GRID);
  }
}

export function ellipseFrame(g, cx, cy, rx, ry, c) {
  cx = Q(cx); cy = Q(cy);
  g.fillStyle = col(c);
  let prev = -1;
  const ry2 = Math.max(GRID / 2, ry);
  const iy = Math.max(GRID, QN(ry2) * GRID);
  for (let dy = -iy; dy <= iy; dy += GRID) {
    const k = 1 - (dy * dy) / (ry2 * ry2);
    const dx = k < 0 ? -1 : Q(rx * Math.sqrt(k));
    if (dx < 0) { prev = dx; continue; }
    if (prev < 0 || Math.abs(dy) === iy) g.fillRect(cx - dx, cy + dy, dx * 2 + GRID, GRID);
    else {
      const w = Math.max(GRID, dx - prev + GRID);
      g.fillRect(cx - dx, cy + dy, w, GRID);
      g.fillRect(cx + dx - w + GRID, cy + dy, w, GRID);
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
  for (let j = 0; j < h; j += GRID) {
    for (let i = 0; i < w; i += GRID) {
      if (BAYER[QN(y + j) & 3][QN(x + i) & 3] < L) g.fillRect(Q(x + i), Q(y + j), GRID, GRID);
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
    const y0 = Q(y + bh * i), y1 = Q(y + bh * (i + 1));
    const seg = Math.max(GRID, y1 - y0);
    for (let j = 0; j < seg; j += GRID) {
      const t = j / seg;
      const lvl = t < 0.5 - 0.5 / bandDither ? 0
        : t > 0.5 + 0.5 / bandDither ? 16
          : Math.round(((t - (0.5 - 0.5 / bandDither)) / (1 / bandDither)) * 16);
      dither(g, x, y0 + j, w, GRID, keys[i], keys[i + 1], lvl);
    }
  }
}

/** Horizontal scanline shimmer used on water and metal. */
export function scan(g, x, y, w, h, c, step = 2, phase = 0) {
  g.fillStyle = col(c);
  for (let j = 0; j < h; j += GRID) {
    if (((QN(y + j) + phase) % step) === 0) g.fillRect(Q(x), Q(y + j), QS(w), GRID);
  }
}

/** Value-noise speckle for cloth/sand/rock. Deterministic in (x,y). BAKE THIS. */
export function noiseFill(g, x, y, w, h, cA, cB, density = 0.18, seed = 1) {
  rect(g, x, y, w, h, cA);
  g.fillStyle = col(cB);
  for (let j = 0; j < h; j += GRID) {
    for (let i = 0; i < w; i += GRID) {
      let n = ((i + 374761393) * 1274126177) ^ ((j + 668265263) * 2246822519) ^ (seed * 3266489917);
      n = Math.imul(n ^ (n >>> 15), 2246822507);
      n = (n ^ (n >>> 13)) >>> 0;
      if ((n % 1000) / 1000 < density) g.fillRect(Q(x + i), Q(y + j), GRID, GRID);
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
  const b = font.bold ? 1 : 0;
  if (!gl) return font.w + b;
  if (font.widths && font.widths[ch] !== undefined) return font.widths[ch] + b;
  // trim empty right columns so text kerns tightly
  let used = 0;
  for (const row of gl) {
    for (let c = 0; c < font.w; c++) {
      if (row & (1 << (font.w - 1 - c))) used = Math.max(used, c + 1);
    }
  }
  return (used || Math.max(2, Math.floor(font.w / 2))) + b;
}

// EVERY FONT MOVES UP ONE STEP.
//
// The game reads at 960x540, which at a 5x7 body face is about a hundred and thirty
// characters to a line -- denser than a paperback and far denser than any farming game.
// Small text is not a style, it is a thing you squint at. So the three names the whole
// codebase already asks for now mean bigger faces:
//
//     font: 3   ->  FONT5     the small label on a sprite or a chip
//     font: 5   ->  FONT7     body text, and the default
//     font: 7   ->  FONT7 bold  headings and numbers you read across the room
//
// FONT3 is still compiled and still borrowed from for missing glyphs, but nothing asks
// for it by name any more. Bold is the same face drawn one pixel wider per run, which at
// this weight is a genuinely heavier letter rather than a blurred one.
const FONT7B = Object.assign(Object.create(Object.getPrototypeOf(FONT7)), FONT7, { bold: true });

function pickFont(f) { return f === 3 ? FONT5 : f === 7 ? FONT7B : FONT7; }

/**
 * FOLD the characters the fonts do not draw.
 *
 * pixel.js renders an unknown character as a SOLID BLOCK on purpose -- a missing glyph
 * should be impossible to miss and get fixed. But a curly apostrophe out of a quoted
 * line, or a non-breaking space out of a copied string, is not a missing glyph: it is
 * the same character the font already has, typeset differently. Those fold to their
 * ASCII twin instead of putting a black bar in the middle of a sentence.
 *
 * The em and en dashes are NOT here: they are real glyphs now, because a sentence that
 * uses one wants the long dash it asked for.
 */
const FOLD = {
  '\u2019': "'", '\u2018': "'", '\u201c': '"', '\u201d': '"',
  '\u2212': '-', '\u2010': '-', '\u2011': '-',
  '\u00a0': ' ', '\u2007': ' ', '\u2009': ' ', '\u202f': ' ',
  '\u00bb': '>', '\u00ab': '<', '\u2022': '\u00b7',
};
const FOLD_RE = /[\u2019\u2018\u201c\u201d\u2212\u2010\u2011\u00a0\u2007\u2009\u202f\u00bb\u00ab\u2026]/g;
export function fold(str) {
  const s = String(str);
  if (!FOLD_RE.test(s)) return s;
  return s.replace(/\u2026/g, '...').replace(FOLD_RE, (c) => FOLD[c] || c);
}

export function textW(str, o = {}) {
  const font = pickFont(o.font);
  const sp = o.spacing !== undefined ? o.spacing : (font.gap !== undefined ? font.gap : 1);
  const scale = Math.max(1, Math.round(o.scale || 1));
  let w = 0;
  const s = fold(str);
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
  const s = fold(str);
  const total = textW(s, o);
  // the string's ORIGIN lands on the macro grid; the glyphs keep their own fine strokes
  let ox = Q(x);
  if (o.center) ox = Q(x - total / 2);
  else if (o.right) ox = Q(x - total);
  const oy = Q(y);

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
              // bold widens each run by a pixel rather than stamping the glyph twice: one
              // fillRect instead of two, and a cleaner letter
              const wide = (cc - runStart + (font.bold ? 1 : 0)) * sc;
              g.fillRect(cx + runStart * sc, oy + (dy + r + bob) * sc, wide, sc);
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

  // A cached run is one blit instead of one fillRect per horizontal run of lit pixels
  // in every glyph -- and an OUTLINED string pays that nine times over. The UI is
  // mostly text, so this is the single biggest saving in the renderer.
  const run = o.wave ? null : cachedRun(s, total, font, sc, c, o);
  if (run) {
    g.drawImage(run.canvas, ox - run.padX, oy - run.padY);
  } else {
    // wave, or no offscreen support: straight to the target, one rect per pixel run
    if (o.outline) {
      const oc = o.outline === true ? 'ink' : o.outline;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        drawPass(dx, dy, oc);
      }
    } else if (o.shadow) {
      drawPass(o.shadowX || 1, o.shadowY || 1, o.shadow === true ? 'ink' : o.shadow);
    }
    drawPass(0, 0, c);
  }
  g.globalAlpha = prevA;
  return total;
}

/* ------------------------------------------------------------- text caching

Every distinct (string, font, scale, colour, shadow/outline) combination is baked once
into its own little canvas and blitted from then on. Alpha is deliberately NOT part of
the key -- it is applied at blit time -- so a fading label does not bake a new run per
frame. `wave` bypasses the cache entirely, since it moves each glyph independently.

The cap is generous because UI strings repeat heavily (labels, numbers 0-9999, animal
names) but it must exist: a caller that puts a float with six decimals on screen would
otherwise bake a new run every frame forever.
*/
const runCache = new Map();
const RUN_CAP = 1400;

function cachedRun(str, total, font, sc, c, o) {
  if (total <= 0 || total > 4000) return null;
  const key = [
    str, font.h, font.w, sc, c,
    o.outline === true ? 'ink' : (o.outline || ''),
    o.shadow === true ? 'ink' : (o.shadow || ''),
    o.shadowX || 0, o.shadowY || 0,
    o.spacing !== undefined ? o.spacing : '',
  ].join('\u0001');
  let hit = runCache.get(key);
  if (hit !== undefined) return hit;
  // outline reaches one pixel (times scale) in every direction; shadow reaches down-right
  const padX = sc, padY = sc;
  const mk = makeCanvas(total + sc * 3, font.h * sc + sc * 3);
  if (!mk) { runCache.set(key, null); return null; }
  // repaint into the offscreen at the pad offset
  textInto(mk.g, str, padX, padY, c, o, font, sc);
  hit = { canvas: mk.canvas, padX, padY };
  if (runCache.size > RUN_CAP) runCache.clear();
  runCache.set(key, hit);
  return hit;
}

/** Uncached draw straight into a context at an exact origin. Used by the baker. */
function textInto(gg, str, x, y, c, o, font, sc) {
  const sp = o.spacing !== undefined ? o.spacing : (font.gap !== undefined ? font.gap : 1);
  const pass = (dx, dy, color) => {
    gg.fillStyle = col(color);
    let cx = x + dx * sc;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const cw = charW(ch, font);
      const gl = glyphFor(font, ch);
      if (gl && ch !== ' ') {
        for (let r = 0; r < font.h; r++) {
          const row = gl[r] || 0;
          if (!row) continue;
          let runStart = -1;
          for (let cc = 0; cc <= font.w; cc++) {
            const on = cc < font.w && (row & (1 << (font.w - 1 - cc)));
            if (on && runStart < 0) runStart = cc;
            else if (!on && runStart >= 0) {
              gg.fillRect(cx + runStart * sc, y + (dy + r) * sc, (cc - runStart) * sc, sc);
              runStart = -1;
            }
          }
        }
      } else if (!gl && ch !== ' ') {
        gg.fillRect(cx, y + (dy + 1) * sc, (cw - 1) * sc, (font.h - 2) * sc);
      }
      cx += (cw + sp) * sc;
    }
  };
  if (o.outline) {
    const oc = o.outline === true ? 'ink' : o.outline;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) pass(dx, dy, oc);
  } else if (o.shadow) {
    pass(o.shadowX || 1, o.shadowY || 1, o.shadow === true ? 'ink' : o.shadow);
  }
  pass(0, 0, c);
}

/** Drop every baked text run. For a palette swap, or a test wanting a clean slate. */
export function clearTextCache() { runCache.clear(); }
export function textCacheSize() { return runCache.size; }

/** Greedy word wrap to a pixel width. */
export function wrap(str, maxW, o = {}) {
  const words = fold(str).split(/\s+/).filter(Boolean);
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
  g.fillRect(Q(x), Q(y), QS(w), QS(h));
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
    g.translate(Q(x) + w, Q(y));
    g.scale(-1, 1);
    g.drawImage(src, 0, 0, w, h);
  } else {
    g.drawImage(src, Q(x), Q(y), w, h);
  }
  g.restore();
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

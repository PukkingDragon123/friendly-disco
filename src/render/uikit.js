// The chrome. Dark varnished timber, brass brackets, enamel plates, engraved labels.
//
// Everything here is span-based pixel art from src/core/pixel.js — no gradients, no AA.
// Widgets take the 640x360 context first and return their rect where that is useful, so
// a scene can hit-test with hover(rect, Input.mouse) without duplicating layout maths.

import { P, col, mix, alpha } from '../core/palette.js';
import {
  rect, frame, box, boxFrame, px, line, dashLine, disc, ring, ellipse, tri,
  dither, vgrad, text, textW, wrap, wash, clip, clamp, lerp, makeCanvas,
} from '../core/pixel.js';
import { Juice } from '../core/juice.js';
import { W as SCREEN_W, H as SCREEN_H } from '../core/pixel.js';

export const RARITY_COLOR = { common: 'grey2', uncommon: 'sky', rare: 'purple1', legendary: 'gold' };
export const RARITY_STARS = { common: 1, uncommon: 2, rare: 3, legendary: 4 };

export function rectOf(x, y, w, h) { return { x, y, w, h }; }
export function hover(r, m) {
  return !!(r && m && m.x >= r.x && m.x < r.x + r.w && m.y >= r.y && m.y < r.y + r.h);
}

/* ------------------------------------------------------------------ panels */

/**
 * Five surfaces, and every one of them is WARM.
 *
 * `slate` used to be built out of shadow/deep/night -- and `night` is the one purple in
 * the palette, so every inset panel in the game had a cold violet cast sitting inside a
 * warm wooden frame. Nothing looks more like a UI mockup dropped on top of pixel art
 * than that. It is now oiled dark timber, which is what an inset panel in a boat is.
 *
 * `paper` is parchment on purpose: `parch` for the sheet, `cream` for the lit top edge,
 * `parch0` for the shadowed bottom. Bone and sand were close, but parchment is the
 * colour the whole cozy palette is built around and the cards are the thing the player
 * reads most.
 */
const STYLES = {
  wood: { fill: 'wood2', top: 'wood4', mid: 'wood3', bot: 'wood1', edge: 'wood0', ink: 'cream', trim: 'brass1', bright: 'brass2' },
  brass: { fill: 'brass1', top: 'brass3', mid: 'brass2', bot: 'brass0', edge: 'wood0', ink: 'wood0', trim: 'brass3', bright: 'cream' },
  slate: { fill: 'deep', top: 'shadow', mid: 'wood0', bot: 'ink', edge: 'ink', ink: 'parch1', trim: 'wood2', bright: 'wood3' },
  paper: { fill: 'parch', top: 'cream', mid: 'parch1', bot: 'parch0', edge: 'wood2', ink: 'wood0', trim: 'wood3', bright: 'cream' },
  glass: { fill: null, top: 'foam', mid: 'water2', bot: 'water0', edge: 'ice', ink: 'cream', trim: 'foam', bright: 'white' },
};

// Deterministic surface textures. Cheap enough per frame at these sizes, and they are
// what stops a panel reading as a flat rectangle.
function hash2(x, y, seed) {
  let n = Math.imul(x + 374761393, 1274126177) ^ Math.imul(y + 668265263, 2246822519) ^ Math.imul(seed, 3266489917);
  n = Math.imul(n ^ (n >>> 15), 2246822507);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}

function grain(g, x, y, w, h, s) {
  for (let j = 0; j < h; j++) {
    const r = hash2(0, y + j, 7);
    if (r < 0.22) rect(g, x, y + j, w, 1, s.bot);
    else if (r > 0.86) rect(g, x, y + j, w, 1, s.mid);
  }
  // long streaks along the grain
  for (let i = 0; i < Math.max(2, (w * h) / 320); i++) {
    const gx = x + Math.floor(hash2(i, 1, 11) * w);
    const gy = y + Math.floor(hash2(i, 2, 13) * h);
    const len = 3 + Math.floor(hash2(i, 3, 17) * 12);
    rect(g, gx, gy, Math.min(len, x + w - gx), 1, hash2(i, 4, 19) < 0.5 ? s.bot : s.mid);
  }
}

function speckle(g, x, y, w, h) {
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      if (hash2(x + i, y + j, 29) < 0.045) px(g, x + i, y + j, 'parch0');
    }
  }
}

function brushed(g, x, y, w, h, s) {
  for (let j = 0; j < h; j++) if (j % 4 === 1) rect(g, x, y + j, w, 1, s.mid);
}

/* ---------------------------------------------------------------- panel cache

A panel is completely determined by its style, size and flags: the wood grain, the
brass brushing, the bevels, the corner brackets and the rivets never move. Drawing
them per frame is what a panel costs, and at 960x540 the five big panels on the deck
came to roughly twelve thousand canvas calls a frame on their own -- more than
everything else in the scene put together.

So every distinct panel is BAKED once into its own little canvas and blitted after
that. The cache key is exactly the set of inputs that change a pixel. A scene has a
handful of distinct panels, so the cache stays small; the cap is a backstop against a
caller that animates a panel's width, which would otherwise bake a new one per frame.

PAD leaves room for the two things that draw OUTSIDE the panel rect: the drop shadow
(2px right and below) and the title plate (3px above).
*/
const PANEL_PAD = 6;
const panelCache = new Map();
const PANEL_CAP = 96;

function bakedPanel(w, h, o) {
  const key = [
    o.style || 'wood', w, h,
    o.inset ? 1 : 0, o.shadow ? 1 : 0, o.corners === false ? 0 : 1,
    o.rivets ? 1 : 0, o.title || '', o.titleColor || '', o.font || '',
  ].join('/');
  let hit = panelCache.get(key);
  if (hit !== undefined) return hit;
  const mk = makeCanvas(w + PANEL_PAD * 2, h + PANEL_PAD * 2);
  if (!mk) { panelCache.set(key, null); return null; }
  paintPanel(mk.g, PANEL_PAD, PANEL_PAD, w, h, o);
  hit = { canvas: mk.canvas, pad: PANEL_PAD };
  if (panelCache.size > PANEL_CAP) panelCache.clear();
  panelCache.set(key, hit);
  return hit;
}

/** Drop every baked panel. For a palette swap, or a test that wants a clean slate. */
export function clearPanelCache() { panelCache.clear(); }
export function panelCacheSize() { return panelCache.size; }

/**
 * panel(g,x,y,w,h,o)
 * o: {style, title, titleColor, shadow, rivets, inset, corners}
 *
 * Blits a baked panel. Everything that actually draws lives in paintPanel below.
 */
export function panel(g, x, y, w, h, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 4 || h < 4) return rectOf(x, y, w, h);
  const b = bakedPanel(w, h, o);
  if (b) {
    g.drawImage(b.canvas, x - b.pad, y - b.pad);
    return rectOf(x, y, w, h);
  }
  paintPanel(g, x, y, w, h, o);          // no offscreen support: draw it live
  return rectOf(x, y, w, h);
}

function paintPanel(g, x, y, w, h, o = {}) {
  const s = STYLES[o.style] || STYLES.wood;

  if (o.shadow) {
    wash(g, x + 2, y + h, w, 2, 'ink', 0.4);
    wash(g, x + w, y + 2, 2, h - 2, 'ink', 0.3);
  }

  if (s.fill) {
    box(g, x, y, w, h, s.fill, 2);
    // inset plates hold icons and readouts; texture would fight what sits on them
    if (!o.inset && w > 10 && h > 10) {
      if (o.style === 'wood' || o.style === undefined) grain(g, x + 2, y + 2, w - 4, h - 4, s);
      else if (o.style === 'paper') speckle(g, x + 2, y + 2, w - 4, h - 4);
      else if (o.style === 'brass') brushed(g, x + 2, y + 2, w - 4, h - 4, s);
    }
  } else {
    wash(g, x, y, w, h, 'water0', 0.55);
    dither(g, x + 1, y + 1, w - 2, h - 2, 'rgba(0,0,0,0)', 'water1', 4);
  }

  if (o.inset) {
    // sunken: dark on top-left, light on bottom-right
    rect(g, x + 1, y + 1, w - 2, 1, s.bot);
    rect(g, x + 1, y + 1, 1, h - 2, s.bot);
    rect(g, x + 1, y + h - 2, w - 2, 1, s.mid);
    rect(g, x + w - 2, y + 1, 1, h - 3, s.mid);
  } else {
    rect(g, x + 1, y + 1, w - 2, 1, s.top);
    rect(g, x + 1, y + 2, w - 2, 1, s.mid);
    rect(g, x + 1, y + 1, 1, h - 2, s.mid);
    rect(g, x + 1, y + h - 2, w - 2, 1, s.bot);
    rect(g, x + w - 2, y + 2, 1, h - 4, s.bot);
  }
  boxFrame(g, x, y, w, h, s.edge, 2);

  // brass corner brackets
  if (o.corners !== false && w > 16 && h > 12) {
    for (const [cx, cy, dx, dy] of [[x + 2, y + 2, 1, 1], [x + w - 3, y + 2, -1, 1], [x + 2, y + h - 3, 1, -1], [x + w - 3, y + h - 3, -1, -1]]) {
      rect(g, Math.min(cx, cx + dx * 4), cy, 4, 1, s.trim);
      rect(g, cx, Math.min(cy, cy + dy * 4), 1, 4, s.trim);
      px(g, cx, cy, s.bright);
    }
  }
  if (o.rivets && w > 40) {
    for (let rx = x + 10; rx < x + w - 8; rx += 18) {
      px(g, rx, y + 4, s.bright); px(g, rx, y + 5, s.bot);
      px(g, rx, y + h - 6, s.bright); px(g, rx, y + h - 5, s.bot);
    }
  }
  if (o.title) panelTitle(g, x, y, w, o.title, { color: o.titleColor || s.ink, style: o.style, font: o.font });
}

const TITLE_ACCENT = { wood: 'brass3', brass: 'brass3', slate: 'parch1', paper: 'cream', glass: 'foam' };

export function panelTitle(g, x, y, w, label, o = {}) {
  const s = STYLES[o.style] || STYLES.wood;
  const tw = textW(label, { font: o.font || 7 }) + 12;
  const tx = Math.round(x + (w - tw) / 2);
  // The plate is always dark regardless of panel style — a brass title on a brass
  // panel is unreadable, and this is the one label the player must never squint at.
  rect(g, tx, y - 3, tw, 11, 'ink');
  rect(g, tx + 1, y - 2, tw - 2, 9, 'shadow');
  rect(g, tx + 1, y - 2, tw - 2, 1, s.trim);
  px(g, tx + 1, y - 2, s.bright); px(g, tx + tw - 2, y - 2, s.bright);
  text(g, label, x + w / 2, y, o.color || TITLE_ACCENT[o.style] || 'bone',
    { center: true, shadow: 'ink', font: o.font || 7 });
}

export function divider(g, x, y, w, o = {}) {
  rect(g, x, y, w, 1, o.color || 'wood0');
  rect(g, x, y + 1, w, 1, o.light || 'wood3');
  if (o.pip !== false) {
    px(g, x + w / 2 - 2, y, o.color || 'brass2');
    px(g, x + w / 2 + 2, y, o.color || 'brass2');
  }
}

export function nineSlice(g, x, y, w, h, o = {}) { return panel(g, x, y, w, h, o); }

/* ----------------------------------------------------------------- buttons */

/** button(g, rect, label, {state, color, icon, sub, small}) -> rect */
export function button(g, r, label, o = {}) {
  const st = o.state || 'idle';
  const down = st === 'down';
  const dis = st === 'disabled';
  const hov = st === 'hover';
  const base = dis ? 'grey0' : (o.color || 'wood2');
  const x = Math.round(r.x), y = Math.round(r.y) + (down ? 2 : 0);
  const w = Math.round(r.w), h = Math.round(r.h) - (down ? 2 : 0);

  // the plinth the plate presses into
  box(g, r.x, r.y + 2, w, r.h - 2, 'ink', 1);
  // plate
  box(g, x, y, w, h, base, 1);
  rect(g, x + 1, y + 1, w - 2, 1, mix(col(base), P.white, hov ? 0.5 : 0.3));
  rect(g, x + 1, y + h - 2, w - 2, 1, mix(col(base), P.ink, 0.4));
  boxFrame(g, x, y, w, h, dis ? 'ink' : hov ? 'brass3' : 'wood0', 1);
  if (hov) { px(g, x + 1, y + 1, 'white'); px(g, x + w - 2, y + 1, 'white'); }

  const fg = dis ? 'grey1' : hov ? 'white' : 'bone';
  // the heavier face on anything that is not a cramped micro-button
  const font = o.small ? 3 : (o.font || 7);
  let tx = x + w / 2;
  if (o.icon) {
    icon(g, o.icon, x + 4, y + Math.round((h - 9) / 2), { color: dis ? 'grey1' : 'brass3' });
    tx = x + 7 + w / 2 - 4;
  }
  const capH = font === 3 ? 5 : font === 7 ? 7 : 5;
  const ty = o.sub ? y + Math.round(h / 2) - capH - 1 : y + Math.round((h - capH) / 2);
  text(g, label, tx, ty, fg, { center: true, font, shadow: 'ink' });
  if (o.sub) text(g, o.sub, tx, ty + (font === 3 ? 6 : 8), dis ? 'grey0' : 'brass2', { center: true, font: 3 });
  return r;
}

/* -------------------------------------------------------------------- bars */

/** bar(g,x,y,w,h,t,{fill,bg,frame,ticks,glow,label,stripe}) */
export function bar(g, x, y, w, h, t, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const k = clamp(t || 0, 0, 1);
  rect(g, x, y, w, h, o.bg || 'ink');
  const fw = Math.round((w - 2) * k);
  const f = o.fill || 'gold';
  if (fw > 0) {
    rect(g, x + 1, y + 1, fw, h - 2, f);
    rect(g, x + 1, y + 1, fw, 1, mix(col(f), P.white, 0.45));
    rect(g, x + 1, y + h - 2, fw, 1, mix(col(f), P.ink, 0.35));
    if (o.stripe) {
      const ph = Math.floor(Juice.t * 26);
      g.fillStyle = alpha(P.white, 0.25);
      for (let i = 0; i < fw; i++) if (((i + ph) % 6) < 2) g.fillRect(x + 1 + i, y + 1, 1, h - 2);
    }
  }
  if (o.ticks) {
    for (let i = 1; i < o.ticks; i++) {
      const tx = x + Math.round((w * i) / o.ticks);
      rect(g, tx, y + 1, 1, h - 2, alpha(P.ink, 0.45));
    }
  }
  boxFrame(g, x, y, w, h, o.frame || 'wood0', 1);
  if (o.glow) {
    const pulse = (Math.sin(Juice.t * 7) + 1) / 2;
    if (pulse > 0.4) boxFrame(g, x - 1, y - 1, w + 2, h + 2, f, 1);
  }
  if (o.label) text(g, o.label, x + w / 2, y + Math.round((h - 5) / 2), 'white', { font: 3, center: true, shadow: 'ink' });
  return rectOf(x, y, w, h);
}

/** Pip bar — shots, re-racks, charges. */
export function segBar(g, x, y, w, h, n, filled, o = {}) {
  n = Math.max(1, Math.min(14, Math.round(n)));
  const gap = 1;
  const sw = Math.max(2, Math.floor((w - gap * (n - 1)) / n));
  for (let i = 0; i < n; i++) {
    const sx = Math.round(x + i * (sw + gap));
    const on = i < filled;
    rect(g, sx, y, sw, h, on ? (o.fill || 'sky') : (o.bg || 'ink'));
    if (on) {
      rect(g, sx, y, sw, 1, mix(col(o.fill || 'sky'), P.white, 0.5));
      rect(g, sx, y + h - 1, sw, 1, mix(col(o.fill || 'sky'), P.ink, 0.4));
    } else {
      boxFrame(g, sx, y, sw, h, 'grey0', 0);
    }
  }
  return rectOf(x, y, w, h);
}

/* ------------------------------------------------------------------- pills */

function pill(g, x, y, label, value, cFill, cText, o = {}) {
  const s = String(value);
  const w = textW(s, { font: o.font || 5 }) + (o.icon ? 12 : 6) + 4;
  const h = o.h || 11;
  box(g, x, y, w, h, 'ink', 1);
  rect(g, x + 1, y + 1, w - 2, 1, mix(col(cFill), P.white, 0.35));
  rect(g, x + 1, y + 2, w - 2, h - 4, cFill);
  rect(g, x + 1, y + h - 2, w - 2, 1, mix(col(cFill), P.ink, 0.4));
  boxFrame(g, x, y, w, h, 'ink', 1);
  let tx = x + 3;
  if (o.icon) { icon(g, o.icon, x + 2, y + 1, { color: cText }); tx = x + 12; }
  text(g, s, tx, y + Math.round((h - 7) / 2), cText, { font: o.font || 5, shadow: o.shadow || null });
  void label;
  return rectOf(x, y, w, h);
}

export function chipPill(g, x, y, v, o = {}) { return pill(g, x, y, 'CHIPS', v, 'water1', 'ice', Object.assign({ icon: 'gem' }, o)); }
export function multPill(g, x, y, v, o = {}) { return pill(g, x, y, 'MULT', '×' + v, 'red0', 'red2', Object.assign({ icon: 'flame' }, o)); }
export function moneyPill(g, x, y, v, o = {}) { return pill(g, x, y, 'MONEY', '$' + v, 'brass0', 'brass3', Object.assign({ icon: 'coin' }, o)); }

/** Banner with notched ends. */
export function ribbon(g, x, y, w, label, o = {}) {
  const h = o.h || 13;
  const c = o.color || 'gold';
  rect(g, x + 3, y, w - 6, h, 'ink');
  rect(g, x + 4, y + 1, w - 8, h - 2, mix(col(c), P.ink, 0.55));
  rect(g, x + 4, y + 1, w - 8, 1, mix(col(c), P.ink, 0.2));
  tri(g, x + 3, y, x + 3, y + h - 1, x, y + Math.round(h / 2), 'ink');
  tri(g, x + w - 4, y, x + w - 4, y + h - 1, x + w - 1, y + Math.round(h / 2), 'ink');
  text(g, label, x + w / 2, y + Math.round((h - 7) / 2), c, { center: true, shadow: 'ink', font: o.font || 7 });
  return rectOf(x, y, w, h);
}

export function starRow(g, x, y, n, o = {}) {
  for (let i = 0; i < Math.max(0, Math.min(5, n)); i++) icon(g, 'star', x + i * 8, y, { color: o.color || 'gold' });
  return rectOf(x, y, n * 8, 9);
}

/* ------------------------------------------------------------------- cards */

/** card(g,x,y,w,h,{title,lines,rarity,icon,iconBg,price,owned,hover,tall,color}) */
export function card(g, x, y, w, h, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const rc = o.color || RARITY_COLOR[o.rarity] || 'grey2';
  if (o.hover) { wash(g, x - 1, y - 1, w + 2, h + 2, rc, 0.3); }
  panel(g, x, y, w, h, { style: 'slate', shadow: true, corners: false });

  // rarity spine down the left edge
  rect(g, x + 2, y + 2, 2, h - 4, rc);
  rect(g, x + 2, y + 2, 2, 2, mix(col(rc), P.white, 0.5));

  // icon plate
  const ib = 22;
  panel(g, x + 6, y + 6, ib, ib, { style: 'brass', inset: true, corners: false });
  if (o.icon) icon(g, o.icon, x + 6 + Math.round((ib - 9) / 2), y + 6 + Math.round((ib - 9) / 2), { color: o.iconFg || 'wood0' });

  // title, wrapped tightly
  const tx = x + 32;
  const tw = w - 38;
  // A short card cannot afford the heavy face wrapping to two rows — it would push the
  // rarity stars onto the price pill. Pick the face that fits the box.
  const tf = h >= 62 && textW(o.title || '', { font: 7 }) <= tw ? 7 : 5;
  const lh = tf === 7 ? 11 : 9;
  const tl = wrap(o.title || '', tw, { font: tf });
  tl.slice(0, 2).forEach((l, i) => text(g, l, tx, y + 5 + i * lh, 'white', { shadow: 'ink', font: tf }));
  if (o.rarity && h >= 56) {
    starRow(g, tx, y + 5 + Math.min(2, tl.length) * lh, RARITY_STARS[o.rarity] || 1, { color: rc });
  }

  // body lines
  let by = y + 32;
  for (const raw of (o.lines || [])) {
    for (const l of wrap(String(raw), w - 12, { font: 3 })) {
      if (by > y + h - 16) break;
      text(g, l, x + 6, by, 'grey2', { font: 3 });
      by += 6;
    }
  }

  if (o.price !== undefined && o.price !== null) {
    const pr = moneyPill(g, x + 5, y + h - 15, o.price, { font: 5 });
    if (o.owned) text(g, 'OWNED', x + w - 6, y + h - 12, 'green1', { font: 3, right: true });
    void pr;
  }
  boxFrame(g, x, y, w, h, o.hover ? rc : 'ink', 2);
  return rectOf(x, y, w, h);
}

/* ----------------------------------------------------------------- tooltip */

/** Always clamps itself inside the 640x360 frame. */
export function tooltip(g, x, y, o = {}) {
  const lines = (o.lines || []).slice(0, 8);
  const w = Math.min(230, Math.max(o.w || 120, textW(o.title || '', { font: 7 }) + 14));
  const h = 8 + (o.title ? 12 : 0) + lines.length * 7;
  let px0 = Math.round(x), py0 = Math.round(y);
  if (px0 + w > SCREEN_W - 2) px0 = SCREEN_W - 2 - w;
  if (px0 < 2) px0 = 2;
  if (py0 + h > SCREEN_H - 2) py0 = SCREEN_H - 2 - h;
  if (py0 < 2) py0 = 2;
  const c = o.color || 'brass3';

  wash(g, px0 + 2, py0 + 2, w, h, 'ink', 0.5);
  rect(g, px0, py0, w, h, 'ink');
  rect(g, px0 + 1, py0 + 1, w - 2, h - 2, 'shadow');
  rect(g, px0 + 1, py0 + 1, w - 2, 1, c);
  boxFrame(g, px0, py0, w, h, 'ink', 1);
  let ty = py0 + 4;
  if (o.title) { text(g, o.title, px0 + 4, ty, c, { shadow: 'ink', font: 7 }); ty += 12; }
  for (const l of lines) { text(g, l, px0 + 4, ty, o.textColor || 'bone', { font: 3 }); ty += 7; }
  return rectOf(px0, py0, w, h);
}

/* -------------------------------------------------------------- scroll list */

/** items: [{label, sub, color, icon}] — returns the index under the mouse, or -1. */
export function scrollList(g, x, y, w, h, items, o = {}) {
  const rowH = o.rowH || 12;
  const scroll = Math.max(0, Math.min(Math.max(0, items.length * rowH - h), Math.round(o.scroll || 0)));
  let hovered = -1;
  panel(g, x, y, w, h, { style: 'slate', inset: true, corners: false });
  clip(g, x + 2, y + 2, w - 4, h - 4, () => {
    items.forEach((it, i) => {
      const ry = y + 2 + i * rowH - scroll;
      if (ry + rowH < y || ry > y + h) return;
      const isHover = o.mouse && o.mouse.x >= x && o.mouse.x < x + w && o.mouse.y >= ry && o.mouse.y < ry + rowH;
      if (isHover) { hovered = i; rect(g, x + 2, ry, w - 4, rowH - 1, 'deep'); }
      if (i === o.selected) rect(g, x + 2, ry, 2, rowH - 1, it.color || 'gold');
      let lx = x + 6;
      if (it.icon) { icon(g, it.icon, lx, ry + 1, { color: it.color || 'brass2' }); lx += 11; }
      text(g, it.label, lx, ry + 2, isHover ? 'white' : 'bone', { font: 3 });
      if (it.sub) text(g, it.sub, x + w - 6, ry + 2, it.subColor || 'grey1', { font: 3, right: true });
    });
  });
  // scrollbar
  if (items.length * rowH > h) {
    const track = h - 6;
    const knob = Math.max(6, Math.round((h / (items.length * rowH)) * track));
    const ky = y + 3 + Math.round((scroll / (items.length * rowH - h)) * (track - knob));
    rect(g, x + w - 4, y + 3, 2, track, 'ink');
    rect(g, x + w - 4, ky, 2, knob, 'grey1');
  }
  return hovered;
}

/* ------------------------------------------------------------------- icons */

// 9x9 glyphs.  '#' primary · '+' shade · '*' highlight · '.' clear
const A = {
  acacia: ['..#####..', '.#######.', '#*#####+#', '.#######.', '..##+##..', '....#....', '....#....', '...#.#...', '..#...#..'],
  snowflake: ['....#....', '..#.#.#..', '...###...', '#.#####.#', '..#####..', '#.#####.#', '...###...', '..#.#.#..', '....#....'],
  leaf: ['.......#.', '.....###.', '...###*#.', '..###+#..', '.###+##..', '.####+...', '.###.....', '.#.......', '#........'],
  wave: ['.........', '.........', '..##..##.', '.#**#.#**', '#....#...', '.........', '..##..##.', '.#**#.#**', '#....#...'],
  cactus: ['....#....', '.#..#..#.', '.#..#..#.', '.#*.#.*#.', '.####*##.', '....#....', '....#....', '...###...', '..#####..'],
  barn: ['....#....', '...###...', '..#####..', '.#######.', '#########', '#.#***#.#', '#.#*+*#.#', '#.#***#.#', '#########'],
  reed: ['..#...#..', '..#..#*..', '.*#..#...', '..#.#*...', '..##*....', '..##.....', '..#......', '.###.....', '#####....'],
  peak: ['....#....', '...*#+...', '..**##+..', '..#*###..', '.##*###+.', '.###*###.', '########+', '#########', '.#######.'],
  pine: ['....#....', '...###...', '..#*##+..', '...###...', '..#*##+..', '.#*####+.', '..#####..', '....#....', '...###...'],
  sun: ['....#....', '.#..#..#.', '..*###*..', '..#####..', '#.#####.#', '..#####..', '..*###*..', '.#..#..#.', '....#....'],
  moon: ['..#####..', '.###*+...', '####+....', '####+....', '####+....', '####+....', '.###+....', '..###+...', '.........'],
  cloud: ['.........', '...###...', '..#***#..', '.##***##.', '###***###', '#########', '.#######.', '.........', '.........'],
  fish: ['.........', '...##....', '..####.#.', '.#*####.#', '#.######*', '.#*####.#', '..####.#.', '...##....', '.........'],
  bone: ['##.....##', '####.####', '.#######.', '...###...', '...###...', '.#######.', '####.####', '##.....##', '.........'],
  paw: ['.##...##.', '.##...##.', '.........', '##.....##', '##.....##', '..#####..', '.#######.', '.#######.', '..#####..'],
  feather: ['.......##', '......##.', '.....###.', '....###..', '...####..', '..####...', '.####....', '.###.....', '##.......'],
  horn: ['.......##', '.....###.', '...###...', '..##.....', '.##......', '.#.......', '##.......', '##.......', '.#.......'],
  egg: ['...###...', '..#***#..', '.##***##.', '.##***##.', '#########', '#########', '.#######.', '..#####..', '.........'],
  shell: ['..#####..', '.#*#*#*#.', '#*#*#*#*#', '#*#*#*#*#', '#########', '.#######.', '..#####..', '...###...', '.........'],
  hay: ['#.......#', '.#.....#.', '..#####..', '.#######.', '#*#####*#', '#########', '.#######.', '..#####..', '.#.....#.'],
  carrot: ['.#.....#.', '..#.#.#..', '...###...', '..#####..', '..#####..', '...###...', '...###...', '....#....', '....#....'],
  fishbone: ['#........', '##.#.#.#.', '.########', '##.#.#.#.', '#........', '.........', '.........', '.........', '.........'],
  whistle: ['.........', '..#####..', '.#*###+#.', '.#######.', '..#####..', '...##....', '...##....', '..####...', '.........'],
  compass: ['..#####..', '.#.....#.', '#...#...#', '#..###..#', '#.#####.#', '#..###..#', '#...#...#', '.#.....#.', '..#####..'],
  net: ['#.#.#.#.#', '.#######.', '#.#.#.#.#', '.#######.', '#.#.#.#.#', '.#######.', '#.#.#.#.#', '.#######.', '#.#.#.#.#'],
  crate: ['#########', '#*#####+#', '##.###.##', '#.#####.#', '#..###..#', '#.#####.#', '##.###.##', '#*#####+#', '#########'],
  boat: ['....#....', '...##....', '..###....', '.####....', '..###....', '.........', '#########', '.#######.', '..#####..'],
  anchor: ['...###...', '...#.#...', '...###...', '.#######.', '....#....', '#...#...#', '#...#...#', '.#*###*#.', '..#####..'],
  wheel: ['..#####..', '.#..#..#.', '#...#...#', '##.###.##', '..#####..', '##.###.##', '#...#...#', '.#..#..#.', '..#####..'],
  bell: ['....#....', '...###...', '..#***#..', '.##***##.', '.##***##.', '#########', '#########', '....#....', '...###...'],
  chalk: ['..#####..', '.#*****#.', '.#*****#.', '.#*****#.', '.#######.', '.#######.', '.#######.', '.#######.', '..#####..'],
  cue: ['.......##', '......##.', '.....##..', '....##...', '...##....', '..##.....', '.##......', '##.......', '#........'],
  star: ['....#....', '....#....', '...###...', '#########', '.#######.', '..#####..', '.###.###.', '.##...##.', '.#.....#.'],
  heart: ['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....', '.........'],
  coin: ['..#####..', '.##***##.', '#**###**#', '#*#***#*#', '#*#***#*#', '#*#***#*#', '#**###**#', '.##***##.', '..#####..'],
  gem: ['.#######.', '##..#..##', '#..###..#', '#.#####.#', '.#######.', '..#####..', '...###...', '....#....', '.........'],
  skull: ['..#####..', '.#######.', '##.###.##', '##.###.##', '#########', '.##.#.##.', '..#####..', '..#.#.#..', '.........'],
  eye: ['.........', '..#####..', '.#*****#.', '#**###**#', '#**###**#', '#**###**#', '.#*****#.', '..#####..', '.........'],
  clock: ['..#####..', '.#..#..#.', '#...#...#', '#...#...#', '#...####.', '#.......#', '#.......#', '.#.....#.', '..#####..'],
  lock: ['..#####..', '.##...##.', '.#.....#.', '#########', '#*#####+#', '#***#***#', '#**###**#', '#*#####+#', '#########'],
  key: ['..###....', '.#***#...', '.#*#*#...', '.#***#...', '..###....', '...#.....', '...##....', '...#.....', '...##....'],
  gear: ['.#.###.#.', '.#######.', '####.####', '##.....##', '#.......#', '##.....##', '####.####', '.#######.', '.#.###.#.'],
  flame: ['....#....', '...##....', '..###....', '.##*##...', '.#***#...', '#**#**#..', '#*###*#..', '.#####...', '..###....'],
  drop: ['....#....', '...###...', '..#####..', '.##***##.', '.##***##.', '#***##**#', '#**####*#', '.#######.', '..#####..'],
  bolt: ['.....###.', '....###..', '...###...', '..######.', '.######..', '...###...', '..###....', '.###.....', '.##......'],
  shield: ['#########', '#*#####+#', '#*#####+#', '#*#####+#', '.#######.', '.##***##.', '..#####..', '...###...', '....#....'],
  sword: ['.....###.', '....###..', '...###...', '..###....', '.###.....', '####.....', '###......', '##.......', '#........'],
  scroll: ['.#######.', '##*****##', '#.#####.#', '#.#####.#', '#.#####.#', '#.#####.#', '#.#####.#', '##*****##', '.#######.'],
  map: ['#########', '#.##.##.#', '#..#..#.#', '#.#.##..#', '#..###.##', '#.##..#.#', '#...#.#.#', '#.##.##.#', '#########'],
  dice: ['#########', '#*#####+#', '#.##.##.#', '#*#####+#', '#..#.#..#', '#*#####+#', '#.##.##.#', '#*#####+#', '#########'],
  sheep: ['.........', '..#####..', '.#*###*#.', '####.####', '#*#####+#', '.#######.', '..#####..', '..#...#..', '.##...##.'],
  cow: ['.##...##.', '.#######.', '#*#####+#', '##.###.##', '#########', '.#*###*#.', '..#####..', '..##.##..', '.........'],
  chicken: ['...##....', '..####.#.', '..###.##.', '.#####...', '#######..', '#*#####..', '.#####...', '..#.#....', '.##.##...'],
  pig: ['.#.....#.', '###...###', '#########', '#*#####+#', '##.###.##', '#########', '.##...##.', '.........', '.........'],
  arrow_l: ['....#....', '...##....', '..###....', '.####****', '#########', '.####****', '..###....', '...##....', '....#....'],
  arrow_r: ['....#....', '....##...', '....###..', '****####.', '#########', '****####.', '....###..', '....##...', '....#....'],
  arrow_u: ['....#....', '...###...', '..#####..', '.#######.', '####*####', '...***...', '...***...', '...***...', '...***...'],
  arrow_d: ['...***...', '...***...', '...***...', '...***...', '####*####', '.#######.', '..#####..', '...###...', '....#....'],
  check: ['.......##', '......##.', '.....##..', '.#..##...', '.##.#....', '.####....', '..##.....', '..#......', '.........'],
  cross: ['##.....##', '###...###', '.###.###.', '..#####..', '...###...', '..#####..', '.###.###.', '###...###', '##.....##'],
  plus: ['...###...', '...###...', '...###...', '#########', '#########', '#########', '...###...', '...###...', '...###...'],
  minus: ['.........', '.........', '.........', '#########', '#########', '#########', '.........', '.........', '.........'],
};

export const ICONS = Object.keys(A);
const ICON_SET = new Set(ICONS);
export function hasIcon(n) { return ICON_SET.has(n); }

/** icon(g, name, x, y, {color, shade, light, scale}) — 9x9 (times scale). */
export function icon(g, name, x, y, o = {}) {
  const art = A[name];
  x = Math.round(x); y = Math.round(y);
  const s = Math.max(1, Math.round(o.scale || 1));
  const c = col(o.color || 'brass3');
  const sh = o.shade ? col(o.shade) : mix(c, P.ink, 0.45);
  const li = o.light ? col(o.light) : mix(c, P.white, 0.5);
  if (!art) {
    // unknown icon: a visible placeholder rather than nothing, so it gets fixed
    frame(g, x, y, 9 * s, 9 * s, 'red2');
    line(g, x, y, x + 9 * s - 1, y + 9 * s - 1, 'red2');
    return;
  }
  for (let r = 0; r < art.length; r++) {
    const row = art[r];
    let runStart = -1, runCol = null;
    for (let i = 0; i <= row.length; i++) {
      const ch = i < row.length ? row[i] : '.';
      const cc = ch === '#' ? c : ch === '+' ? sh : ch === '*' ? li : null;
      if (cc !== runCol) {
        if (runCol) { g.fillStyle = runCol; g.fillRect(x + runStart * s, y + r * s, (i - runStart) * s, s); }
        runStart = i; runCol = cc;
      }
    }
  }
}

/** Big centred icon on a plate — used for boss blinds and crate stencils. */
export function iconPlate(g, x, y, size, name, o = {}) {
  panel(g, x, y, size, size, { style: o.style || 'slate', inset: true, corners: false });
  const s = Math.max(1, Math.floor((size - 6) / 9));
  icon(g, name, x + Math.round((size - 9 * s) / 2), y + Math.round((size - 9 * s) / 2), { color: o.color || 'brass3', scale: s });
}

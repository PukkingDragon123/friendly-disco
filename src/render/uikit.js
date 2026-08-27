// The chrome. Flat warm boards, hard black outlines, and nothing that pretends to be lit.
//
// THE THICK BLACK LINE. Every surface in the game is drawn the same way now: a flat fill,
// one lighter band along the top, one darker along the bottom, and a FOUR-PIXEL INK
// CONTOUR round the whole thing. What used to be here was a carpenter's idea of a panel --
// a border band, a bevel on four sides, corner studs, rivets, a drop shadow in three
// alphas -- eleven tones stacked up to imply a lit surface. On a four-pixel grid that
// stack has nowhere to go: every hairline bevel becomes a four-pixel stripe, and the panel
// reads as mud.
//
// One line does the work of the whole stack. It separates the panel from whatever is
// behind it at any size, it survives being scaled, and it is the same language the props,
// the ruins and the animals are drawn in, which is what makes the screen look like one
// drawing rather than a UI sitting on top of a game.
//
// Everything here is span-based pixel art from src/core/pixel.js — no gradients, no AA.
// Widgets take the 640x360 context first and return their rect where that is useful, so
// a scene can hit-test with hover(rect, Input.mouse) without duplicating layout maths.

import { P, col, mix, alpha } from '../core/palette.js';
import {
  rect, frame, box, boxFrame, px, line, tri,
  text, textW, wrap, wash, clip, clamp, makeCanvas, GRID,
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
 * Each style is a small ramp plus the two tones the FRAME is built from:
 *   band -- the solid mid-tone the thick border is made of
 *   lip  -- the light line where that border meets the fill
 * Everything else is the surface itself: fill, its lit top, its shadowed bottom, and
 * the brass (trim/bright) the corner studs are cast in.
 *
 * `paper` is a brown board around parchment on purpose: it is the box the player reads
 * the most, and dark timber around a pale sheet is the highest contrast the palette can
 * give a block of text.
 */
const STYLES = {
  wood: { fill: 'wood2', top: 'wood4', mid: 'wood3', bot: 'wood1', edge: 'wood0', band: 'wood1', lip: 'wood3', ink: 'cream', trim: 'brass1', bright: 'brass2' },
  // (the ramp keys above are what the widgets read; `edge` is no longer the contour --
  //  every panel is contoured in INK, and `edge` is now the inner rim under it.)
  brass: { fill: 'brass1', top: 'brass3', mid: 'brass2', bot: 'brass0', edge: 'wood0', band: 'brass0', lip: 'brass3', ink: 'wood0', trim: 'brass3', bright: 'cream' },
  slate: { fill: 'deep', top: 'shadow', mid: 'wood0', bot: 'ink', edge: 'ink', band: 'wood0', lip: 'wood2', ink: 'parch1', trim: 'wood2', bright: 'wood3' },
  paper: { fill: 'parch', top: 'cream', mid: 'wood3', bot: 'parch0', edge: 'wood0', band: 'wood2', lip: 'cream', ink: 'wood0', trim: 'brass2', bright: 'brass3' },
  glass: { fill: null, top: 'foam', mid: 'water2', bot: 'water0', edge: 'ink', band: 'water0', lip: 'foam', ink: 'cream', trim: 'foam', bright: 'white' },
};

/* ---------------------------------------------------------------- panel cache

A panel is completely determined by its style, size and flags: the border band, the
bevel, the corner studs and the title plate never move. Drawing them per frame is what
a panel costs, and at 960x540 the five big panels on the deck came to roughly twelve
thousand canvas calls a frame on their own -- more than everything else in the scene
put together.

So every distinct panel is BAKED once into its own little canvas and blitted after
that. The cache key is exactly the set of inputs that change a pixel. A scene has a
handful of distinct panels, so the cache stays small; the cap is a backstop against a
caller that animates a panel's width, which would otherwise bake a new one per frame.

PAD leaves room for the two things that draw OUTSIDE the panel rect: the drop shadow
(3px right and below) and the title plate (4px above).
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
/**
 * ONE MACRO PIXEL OF CONTOUR, whatever the grid is worth today.
 *
 * The commonest thing in the chrome. It was hard-coded to two pixels; on the four-pixel
 * world grid that drew a two-pixel line that the primitives then rounded up anyway, which
 * is how you get a border that is thick on one side and thin on the other.
 */
export function boxEdge(g, x, y, w, h, c) {
  rect(g, x, y, w, GRID, c);
  rect(g, x, y + h - GRID, w, GRID, c);
  rect(g, x, y, GRID, h, c);
  rect(g, x + w - GRID, y, GRID, h, c);
}

/** The thick black line itself: two macro pixels of ink, for anything that must separate. */
export function inkEdge(g, x, y, w, h, c) {
  const t = GRID * 2;
  rect(g, x, y, w, t, c || 'ink');
  rect(g, x, y + h - t, w, t, c || 'ink');
  rect(g, x, y, t, h, c || 'ink');
  rect(g, x + w - t, y, t, h, c || 'ink');
}

export function panel(g, x, y, w, h, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  if (w < 4 || h < 4) return rectOf(x, y, w, h);
  const b = bakedPanel(w, h, o);
  if (b) {
    // ON THE GRID, or the whole baked panel lands half a macro pixel out of step with the
    // scene it is sitting in and every one of its edges frays.
    g.drawImage(b.canvas,
      Math.round((x - b.pad) / GRID) * GRID, Math.round((y - b.pad) / GRID) * GRID);
    return rectOf(x, y, w, h);
  }
  paintPanel(g, x, y, w, h, o);          // no offscreen support: draw it live
  return rectOf(x, y, w, h);
}

/**
 * A BOARD WITH A BLACK LINE ROUND IT.
 *
 * Three passes and no more:
 *
 *   1  a HARD shadow -- solid ink, offset one macro pixel down and right. Not three
 *      alphas of soft edge: a poster's shadow, which is a shape.
 *   2  the FILL, flat, with one lighter band along the top and one darker along the
 *      bottom. That is the entire suggestion of light, and at this scale it is enough.
 *   3  the CONTOUR: two macro pixels of ink all the way round.
 *
 * What was here before -- a mid-tone border band, a one-pixel lip on four sides, corner
 * studs, rivets, a soft shadow in two alphas -- was eleven tones describing a lit carved
 * board. Every one of those one-pixel details became a four-pixel stripe on the world
 * grid, and the box the player reads the most turned to mud. The `corners` and `rivets`
 * flags are still accepted so no caller has to change; they draw nothing now, because the
 * line is the ornament.
 */
function paintPanel(g, x, y, w, h, o = {}) {
  const s = STYLES[o.style] || STYLES.wood;
  const t = GRID;                      // the band weight
  const ink = o.ink || 'ink';

  if (o.shadow) rect(g, x + t, y + t, w, h, ink);

  if (s.fill) rect(g, x, y, w, h, s.fill);
  else wash(g, x, y, w, h, 'water0', 0.6);      // glass: the scene stays visible through it

  if (o.inset) {
    // A SUNKEN PLATE reads by having its light on the WRONG side: dark along the top and
    // left, light along the bottom and right, which is the same trick at any resolution.
    if (w > t * 4 && h > t * 4) {
      rect(g, x + t, y + t, w - t * 2, t, s.bot);
      rect(g, x + t, y + t, t, h - t * 2, s.bot);
      rect(g, x + t, y + h - t * 2, w - t * 2, t, s.lip);
      rect(g, x + w - t * 2, y + t, t, h - t * 2, s.lip);
    }
    inkEdge(g, x, y, w, h, ink);
    if (o.title) panelTitle(g, x, y, w, o.title, { color: o.titleColor, style: o.style, font: o.font });
    return;
  }

  if (w > t * 6 && h > t * 5) {
    rect(g, x + t, y + t, w - t * 2, t, s.top);                 // the lit top band
    rect(g, x + t, y + h - t * 2, w - t * 2, t, s.bot);         // and the shaded bottom
    rect(g, x + t, y + t, t, h - t * 2, mix(col(s.fill || 'wood2'), P.white, 0.12));
    rect(g, x + w - t * 2, y + t, t, h - t * 2, mix(col(s.fill || 'wood2'), P.ink, 0.18));
  }
  inkEdge(g, x, y, w, h, ink);
  if (o.title) panelTitle(g, x, y, w, o.title, { color: o.titleColor, style: o.style, font: o.font });
}

const TITLE_ACCENT = { wood: 'brass3', brass: 'brass3', slate: 'parch1', paper: 'cream', glass: 'foam' };

/**
 * A PLAQUE straddling the top rail: flat dark board, ink contour, one lit line.
 *
 * The board is always dark whatever the panel is made of -- a brass title on a brass panel
 * is unreadable, and this is the one label the player must never squint at.
 */
export function panelTitle(g, x, y, w, label, o = {}) {
  const s = STYLES[o.style] || STYLES.wood;
  const font = o.font || 7;
  const tw = textW(label, { font }) + 24;
  const th = font === 3 ? 16 : 24;
  const tx = Math.round(x + (w - tw) / 2);
  const ty = y - Math.round(th / 2);
  rect(g, tx, ty, tw, th, 'shadow');
  rect(g, tx + GRID, ty + GRID, tw - GRID * 2, GRID, s.trim);
  inkEdge(g, tx, ty, tw, th, 'ink');
  text(g, label, x + w / 2, ty + Math.round((th - (font === 3 ? 5 : 7)) / 2),
    o.color || TITLE_ACCENT[o.style] || 'cream', { center: true, shadow: 'ink', font });
  return rectOf(tx, ty, tw, th);
}

export function divider(g, x, y, w, o = {}) {
  rect(g, x, y, w, GRID, o.color || 'ink');
  rect(g, x, y + GRID, w, GRID, o.light || 'wood3');
}

export function nineSlice(g, x, y, w, h, o = {}) { return panel(g, x, y, w, h, o); }

/* ----------------------------------------------------------------- buttons */

/** button(g, rect, label, {state, color, icon, sub, small}) -> rect */
export function button(g, r, label, o = {}) {
  const st = o.state || (o.hot ? 'hover' : 'idle');
  const down = st === 'down';
  const dis = st === 'disabled';
  const hov = st === 'hover';
  const base = dis ? 'grey0' : (o.color || 'wood2');
  const t = GRID;
  const x = Math.round(r.x), w = Math.round(r.w);
  // A BUTTON IS A BOARD THAT SITS ON A BLACK PLINTH and drops onto it when pressed.
  const y = Math.round(r.y) + (down ? t : 0);
  const h = Math.round(r.h) - t;

  rect(g, x, Math.round(r.y) + t, w, h, 'ink');                 // the plinth
  rect(g, x, y, w, h, hov && !dis ? mix(col(base), P.white, 0.16) : base);
  rect(g, x + t, y + t, w - t * 2, t, mix(col(base), P.white, hov ? 0.55 : 0.34));
  rect(g, x + t, y + h - t * 2, w - t * 2, t, mix(col(base), P.ink, 0.42));
  inkEdge(g, x, y, w, h, dis ? 'shadow' : 'ink');

  const fg = dis ? 'grey1' : hov ? 'white' : 'cream';
  const font = o.small ? 3 : (o.font || 7);
  let tx = x + w / 2;
  if (o.icon) {
    icon(g, o.icon, x + t * 2, y + Math.round((h - 9) / 2), { color: dis ? 'grey1' : 'brass3' });
    tx = x + 7 + w / 2 - 4;
  }
  const capH = font === 3 ? 5 : font === 7 ? 7 : 5;
  const ty = o.sub ? y + Math.round(h / 2) - capH - 1 : y + Math.round((h - capH) / 2);
  text(g, label, tx, ty, fg, { center: true, font, shadow: 'ink' });
  if (o.sub) text(g, o.sub, tx, ty + (font === 3 ? 6 : 9), dis ? 'grey0' : 'brass3', { center: true, font: 3 });
  return r;
}
export function bar(g, x, y, w, h, t, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const k = clamp(t || 0, 0, 1);
  const q = GRID;
  rect(g, x, y, w, h, o.bg || 'ink');
  const fw = Math.round((w - q * 2) * k);
  const f = o.fill || 'gold';
  if (fw > 0) {
    rect(g, x + q, y + q, fw, h - q * 2, f);
    rect(g, x + q, y + q, fw, q, mix(col(f), P.white, 0.45));
  }
  if (o.ticks) {
    for (let i = 1; i < o.ticks; i++) {
      rect(g, x + Math.round((w * i) / o.ticks), y + q, q, h - q * 2, alpha(P.ink, 0.5));
    }
  }
  inkEdge(g, x, y, w, h, o.frame || 'ink');
  if (o.label) {
    text(g, o.label, x + w / 2, y + Math.round((h - 5) / 2), 'white', { font: 3, center: true, shadow: 'ink' });
  }
  return rectOf(x, y, w, h);
}
export function segBar(g, x, y, w, h, n, filled, o = {}) {
  n = Math.max(1, Math.min(14, Math.round(n)));
  const gap = GRID;
  const sw = Math.max(GRID * 2, Math.floor((w - gap * (n - 1)) / n));
  for (let i = 0; i < n; i++) {
    const sx = Math.round(x + i * (sw + gap));
    const on = i < filled;
    rect(g, sx, y, sw, h, 'ink');
    rect(g, sx + GRID, y + GRID, sw - GRID * 2, h - GRID * 2,
      on ? (o.fill || 'sky') : (o.bg || 'shadow'));
    if (on) rect(g, sx + GRID, y + GRID, sw - GRID * 2, GRID, mix(col(o.fill || 'sky'), P.white, 0.5));
  }
  return rectOf(x, y, w, h);
}
function pill(g, x, y, label, value, cFill, cText, o = {}) {
  const str = String(value);
  const q = GRID;
  const w = textW(str, { font: o.font || 5 }) + (o.icon ? 16 : 8) + q * 2;
  const h = o.h || 20;
  rect(g, x, y, w, h, cFill);
  rect(g, x + q, y + q, w - q * 2, q, mix(col(cFill), P.white, 0.4));
  inkEdge(g, x, y, w, h, 'ink');
  let tx = x + q * 2;
  if (o.icon) { icon(g, o.icon, x + q + 1, y + Math.round((h - 9) / 2), { color: cText }); tx = x + 16; }
  text(g, str, tx, y + Math.round((h - 7) / 2), cText, { font: o.font || 5, shadow: o.shadow || null });
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
/**
 * A CARD: a slate board with the rarity down one edge, an icon plate, a title, and the
 * lines that say what it does. Laid out in macro pixels, so nothing lands between two.
 */
export function card(g, x, y, w, h, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const q = GRID;
  const rc = o.color || RARITY_COLOR[o.rarity] || 'grey2';
  if (o.hover) wash(g, x - q, y - q, w + q * 2, h + q * 2, rc, 0.3);
  panel(g, x, y, w, h, { style: 'slate', shadow: true });

  // the rarity spine, inside the contour
  rect(g, x + q * 2, y + q * 2, q, h - q * 4, rc);

  // the icon plate, top left
  const ib = q * 8;
  const ix = x + q * 4, iy = y + q * 2;
  rect(g, ix, iy, ib, ib, 'wood0');
  inkEdge(g, ix, iy, ib, ib, 'ink');
  if (o.icon) {
    icon(g, o.icon, ix + Math.round((ib - 9) / 2), iy + Math.round((ib - 9) / 2),
      { color: o.iconFg || 'brass3' });
  }

  // the title, beside the plate
  const tx = ix + ib + q * 2;
  const tw = x + w - tx - q * 2;
  const tf = textW(o.title || '', { font: 7 }) <= tw ? 7 : 5;
  const lh = tf === 7 ? 12 : 10;
  const tl = wrap(o.title || '', tw, { font: tf });
  tl.slice(0, 2).forEach((l, i) => text(g, l, tx, y + q * 2 + i * lh, 'white', { shadow: 'ink', font: tf }));
  if (o.rarity) starRow(g, tx, y + q * 2 + Math.min(2, tl.length) * lh, RARITY_STARS[o.rarity] || 1, { color: rc });

  // the body, under both
  let by = iy + ib + q * 2;
  for (const raw of (o.lines || [])) {
    for (const l of wrap(String(raw), w - q * 4, { font: 3 })) {
      if (by > y + h - q * 5) break;
      text(g, l, x + q * 2, by, 'parch1', { font: 3 });
      by += 8;
    }
  }

  if (o.price !== undefined && o.price !== null) {
    moneyPill(g, x + q * 2, y + h - q * 6, o.price, { font: 5 });
    if (o.owned) text(g, 'OWNED', x + w - q * 2, y + h - q * 5, 'green1', { font: 3, right: true });
  }
  if (o.hover) inkEdge(g, x, y, w, h, rc);
  return rectOf(x, y, w, h);
}
export function tooltip(g, x, y, o = {}) {
  const lines = (o.lines || []).slice(0, 8);
  const q = GRID;
  const w = Math.min(240, Math.max(o.w || 130, textW(o.title || '', { font: 7 }) + q * 4));
  const h = q * 3 + (o.title ? 14 : 0) + lines.length * 8;
  let px0 = Math.round(x), py0 = Math.round(y);
  if (px0 + w > SCREEN_W - q) px0 = SCREEN_W - q - w;
  if (px0 < q) px0 = q;
  if (py0 + h > SCREEN_H - q) py0 = SCREEN_H - q - h;
  if (py0 < q) py0 = q;
  const c = o.color || 'brass3';

  rect(g, px0 + q, py0 + q, w, h, 'ink');
  rect(g, px0, py0, w, h, 'shadow');
  rect(g, px0 + q, py0 + q, w - q * 2, q, c);
  inkEdge(g, px0, py0, w, h, 'ink');
  let ty = py0 + q + 2;
  if (o.title) { text(g, o.title, px0 + q * 2, ty, c, { shadow: 'ink', font: 7 }); ty += 14; }
  for (const l of lines) { text(g, l, px0 + q * 2, ty, o.textColor || 'parch1', { font: 3 }); ty += 8; }
  return rectOf(px0, py0, w, h);
}
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

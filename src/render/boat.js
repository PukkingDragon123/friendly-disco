// The boat.
//
// It is on screen for most of the game -- crossing the ocean map, moored off an island,
// waiting in the corner of a rescue -- so it has to bear looking at, and it has to CHANGE
// when you spend money on it. An upgrade you cannot see is an upgrade the player takes on
// trust, and trust is expensive.
//
// Four things are visible from the voyage's tiers:
//
//     capacity  ->  the deck gets longer, and pens appear along it
//     speed     ->  the sail gets taller, and gains a topsail
//     hull      ->  planking gets darker and gains iron bands; damage shows as patches
//     hold      ->  crates and barrels stack up at the stern
//
// Baked per (tier signature, size), because none of that changes between frames. The rock
// of the hull, the flap of the sail and the wake are live -- about thirty pixels.

import { P, col, mix } from '../core/palette.js';
import { makeCanvas, rect, px, line, disc, ellipse, tri, wash, clamp } from '../core/pixel.js';

const cache = new Map();

/** The signature that decides what the boat looks like. */
function sig(t, dmg) {
  return `${t.capacity | 0}${t.speed | 0}${t.hull | 0}${t.hold | 0}/${dmg | 0}`;
}

/**
 * Bake one boat. Local space is 96x64 with the waterline at y=48, so callers can place it
 * by its waterline and never have to think about the mast.
 */
function bake(t, dmg) {
  const W = 96, H = 64, WL = 48;
  const mk = makeCanvas(W, H);
  if (!mk) return null;
  const b = mk.g;
  const cap = t.capacity | 0, spd = t.speed | 0, hul = t.hull | 0, hold = t.hold | 0;

  const halfLen = 26 + cap * 4;              // the deck grows with the pens
  const cx = W / 2;
  const deckY = WL - 8;

  // --- hull: a shallow curve, three planks deep, darker with every hull tier
  const plank = ['wood2', 'wood2', 'wood1', 'wood1', 'wood0'][Math.min(4, hul)];
  const plankLit = ['wood4', 'wood3', 'wood3', 'wood2', 'wood2'][Math.min(4, hul)];
  for (let y = 0; y < 12; y++) {
    const f = y / 11;
    const hw = Math.round(halfLen * (1 - f * f * 0.42));
    rect(b, cx - hw, deckY + y, hw * 2, 1, y < 2 ? plankLit : plank);
    if (y === 3 || y === 7) rect(b, cx - hw, deckY + y, hw * 2, 1, mix(P[plank], P.ink, 0.3));
    px(b, cx - hw, deckY + y, 'ink');
    px(b, cx + hw - 1, deckY + y, 'ink');
  }
  // the rail, and a stem post at the bow
  rect(b, cx - halfLen, deckY - 2, halfLen * 2, 2, plankLit);
  rect(b, cx + halfLen - 2, deckY - 6, 3, 6, plank);
  tri(b, cx + halfLen - 1, deckY - 7, cx + halfLen + 4, deckY + 1, cx + halfLen - 1, deckY + 1, plankLit);

  // --- iron bands, one per hull tier: the cheapest way to show "stronger"
  for (let i = 0; i < hul; i++) {
    const bx = cx - halfLen + 8 + i * Math.round((halfLen * 2 - 16) / Math.max(1, hul));
    rect(b, bx, deckY, 2, 11, 'grey1');
    px(b, bx, deckY + 1, 'stone3');
  }
  // --- damage: tarred patches, one per point of damage taken
  for (let i = 0; i < Math.min(5, dmg); i++) {
    const dx2 = cx - halfLen + 12 + i * 13;
    rect(b, dx2, deckY + 4 + (i % 2) * 3, 5, 3, 'ink');
    px(b, dx2 + 1, deckY + 4 + (i % 2) * 3, 'wood0');
  }

  // --- pens along the deck, two animals to a pen
  const pens = Math.max(1, Math.ceil((6 + cap * 2) / 2));
  for (let i = 0; i < pens; i++) {
    const px2 = cx - halfLen + 6 + i * Math.round((halfLen * 2 - 12) / pens);
    rect(b, px2, deckY - 7, 1, 5, 'wood3');
    rect(b, px2 + 6, deckY - 7, 1, 5, 'wood3');
    rect(b, px2, deckY - 7, 7, 1, 'wood4');
  }

  // --- mast and sail: taller with every speed tier, plus a topsail from tier 3
  const mastH = 22 + spd * 5;
  const mx = cx - 4;
  rect(b, mx, deckY - mastH, 2, mastH, 'wood3');
  rect(b, mx, deckY - mastH, 1, mastH, 'wood4');
  const sailH = mastH - 8;
  for (let y = 0; y < sailH; y++) {
    const f = y / sailH;
    const w = Math.round(9 + f * (10 + spd * 3));
    rect(b, mx - w, deckY - mastH + 4 + y, w, 1, y < 3 ? 'white' : y % 7 === 0 ? 'bone' : 'cream');
  }
  rect(b, mx - 8, deckY - mastH + 4, 8, 1, 'wood2');
  if (spd >= 3) {
    for (let y = 0; y < 8; y++) {
      const w = 6 + y;
      rect(b, mx + 2, deckY - mastH - 8 + y, w, 1, y < 2 ? 'white' : 'cream');
    }
    rect(b, mx, deckY - mastH - 9, 2, 10, 'wood3');
  }
  // a dove pennant, because it is that kind of boat
  rect(b, mx, deckY - mastH - 3, 1, 3, 'wood4');
  tri(b, mx + 1, deckY - mastH - 3, mx + 7, deckY - mastH - 1, mx + 1, deckY - mastH + 1, 'foam');

  // --- cargo at the stern, one crate per hold tier
  for (let i = 0; i < hold + 1; i++) {
    const bx = cx - halfLen + 4 + (i % 3) * 8;
    const by = deckY - 5 - Math.floor(i / 3) * 5;
    rect(b, bx, by, 7, 5, 'wood2');
    rect(b, bx, by, 7, 1, 'wood4');
    rect(b, bx, by + 2, 7, 1, 'brass1');
    px(b, bx, by, 'ink'); px(b, bx + 6, by, 'ink');
  }
  // a lantern on the sternpost
  rect(b, cx - halfLen + 1, deckY - 9, 2, 4, 'wood1');
  disc(b, cx - halfLen + 2, deckY - 11, 2, 'brass2');
  px(b, cx - halfLen + 2, deckY - 11, 'gold');

  return { canvas: mk.canvas, w: W, h: H, wl: WL, halfLen };
}

function get(t, dmg) {
  const k = sig(t, dmg);
  let hit = cache.get(k);
  if (hit === undefined) {
    hit = bake(t, dmg);
    if (cache.size > 48) cache.clear();
    cache.set(k, hit);
  }
  return hit;
}

export function clearBoatCache() { cache.clear(); }

/**
 * drawBoat(g, x, y, t, o)
 *   x, y   where the WATERLINE sits
 *   t      seconds, for the rock and the wake
 *   o      { tiers, damage, scale, heading, wake, alpha }
 *
 * The rock is an integer bob plus a one-pixel lean, which is enough: a boat that rocks
 * smoothly looks like it is on rails, and a boat that rocks in whole pixels looks like it
 * is on water.
 */
export function drawBoat(g, x, y, t = 0, o = {}) {
  const tiers = o.tiers || {};
  const dmg = o.damage || 0;
  const sc = Math.max(1, Math.round(o.scale || 1));
  const B = get(tiers, dmg);
  if (!B) return;

  const bob = Math.round(Math.sin(t * 1.15) * 1.6);
  const lean = Math.round(Math.sin(t * 0.83 + 1.2));
  const dw = B.w * sc, dh = B.h * sc;
  const dx = Math.round(x - dw / 2);
  const dy = Math.round(y - B.wl * sc) + bob * sc;

  if (o.wake !== false) drawWake(g, x, y, B.halfLen * sc, t, o.speed || 0);

  const prevA = g.globalAlpha;
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  if (o.flip) {
    g.save();
    g.translate(dx + dw, dy + lean * sc);
    g.scale(-1, 1);
    g.drawImage(B.canvas, 0, 0, B.w, B.h, 0, 0, dw, dh);
    g.restore();
  } else {
    g.drawImage(B.canvas, 0, 0, B.w, B.h, dx, dy + lean * sc, dw, dh);
  }
  g.globalAlpha = prevA;

  // the waterline itself, drawn OVER the hull so the boat sits in the sea
  const hw = B.halfLen * sc;
  for (let i = 0; i < 3; i++) {
    const wob = Math.round(Math.sin(t * 2.2 + i) * 1);
    rect(g, x - hw + i * 2, y + i + bob * sc + wob, hw * 2 - i * 4, 1,
      i === 0 ? 'foam' : i === 1 ? 'water3' : 'water2');
  }
}

/** A short, cheap wake: two arcs and a few bubbles. */
function drawWake(g, x, y, hw, t, speed) {
  const n = 5 + Math.round(clamp(speed, 0, 1) * 5);
  for (let i = 0; i < n; i++) {
    const f = i / n;
    const wx = x - hw - 4 - i * 5;
    const wy = y + 2 + Math.round(Math.sin(t * 3 - i * 0.7) * 1.5);
    const c = i < 2 ? 'foam' : i < 4 ? 'water3' : 'water2';
    rect(g, wx, wy, 3, 1, c);
    if (i % 2 === 0) px(g, wx + 1, wy - 1, 'foam');
  }
  ellipse(g, x, y + 3, hw + 6, 3, 'water1');
  wash(g, x - hw - 8, y + 1, hw * 2 + 16, 4, 'foam', 0.16);
}

/**
 * The boat seen from FAR OFF, on the ocean map: a silhouette, a sail and a wake, at
 * whatever tiny size the map wants. Separate from the real boat because a scaled-down
 * 96px boat at 8 pixels is mud.
 */
export function drawBoatFar(g, x, y, t = 0, o = {}) {
  const sc = Math.max(1, o.scale || 1);
  const spd = (o.tiers && o.tiers.speed) | 0;
  const bob = Math.round(Math.sin(t * 1.4) * 1);
  const hw = Math.round(5 * sc);
  // hull
  for (let i = 0; i < 2 * sc; i++) {
    rect(g, x - hw + i, y + bob + i, (hw - i) * 2, 1, i === 0 ? 'wood3' : 'wood1');
  }
  // sail
  const sh = Math.round((6 + spd) * sc);
  rect(g, x - 1, y + bob - sh, 1, sh, 'wood3');
  for (let i = 0; i < sh - 1; i++) {
    const w = Math.round(1 + (i / sh) * 4 * sc);
    rect(g, x - 1 - w, y + bob - sh + 1 + i, w, 1, i < 2 ? 'white' : 'cream');
  }
  // wake
  for (let i = 1; i < 4; i++) px(g, x - hw - i * 2, y + bob + 1, i < 2 ? 'foam' : 'water3');
  void line; void col;
}

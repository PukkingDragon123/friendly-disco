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
 * Bake one boat. Local space is 112x80 with the waterline at y=60, so callers can place
 * it by its waterline and never have to think about the mast.
 *
 * IT IS AN ARK, NOT A DINGHY. The old bake was a hull, a mast and a sail, and at any
 * size that silhouette is a sailing boat -- which is why the thing the whole game is
 * about did not look like the thing the whole game is about. An ark reads from three
 * features and it needs all three: a LONG hull with a real sheer, a HOUSE on the deck
 * with a pitched roof, and a big DOOR in the side with a ramp down to the water. The
 * mast moves forward of the house so both are visible in the same silhouette.
 */
function bake(t, dmg) {
  const W = 112, H = 80, WL = 60;
  const mk = makeCanvas(W, H);
  if (!mk) return null;
  const b = mk.g;
  const cap = t.capacity | 0, spd = t.speed | 0, hul = t.hull | 0, hold = t.hold | 0;

  const halfLen = 30 + cap * 4;              // the deck grows with the pens
  const cx = W / 2;
  const deckY = WL - 8;

  const plank = ['wood2', 'wood2', 'wood1', 'wood1', 'wood0'][Math.min(4, hul)];
  const plankLit = ['wood4', 'wood3', 'wood3', 'wood2', 'wood2'][Math.min(4, hul)];

  // --- hull: a deep barge with a sheer that rises towards both ends
  for (let y = 0; y < 15; y++) {
    const f = y / 14;
    const hw = Math.round(halfLen * (1 - f * f * 0.30));
    rect(b, cx - hw, deckY + y, hw * 2, 1, y < 2 ? plankLit : plank);
    if (y === 4 || y === 9) rect(b, cx - hw, deckY + y, hw * 2, 1, mix(P[plank], P.ink, 0.3));
    px(b, cx - hw, deckY + y, 'ink');
    px(b, cx + hw - 1, deckY + y, 'ink');
  }
  // the sheer: the rail lifts at bow and stern, which is what makes a hull a hull
  for (let i = 0; i < halfLen * 2; i++) {
    const f = Math.abs(i - halfLen) / halfLen;
    const lift = Math.round(f * f * 5);
    rect(b, cx - halfLen + i, deckY - 2 - lift, 1, 3 + lift, plankLit);
    px(b, cx - halfLen + i, deckY - 2 - lift, 'wood4');
  }
  // stem post at the bow and a rudder at the stern
  rect(b, cx + halfLen - 2, deckY - 10, 3, 12, plank);
  tri(b, cx + halfLen - 1, deckY - 12, cx + halfLen + 5, deckY - 1, cx + halfLen - 1, deckY - 1, plankLit);
  rect(b, cx - halfLen - 3, deckY + 2, 4, 11, plank);
  rect(b, cx - halfLen - 3, deckY + 2, 4, 2, plankLit);

  // --- iron bands, one per hull tier
  for (let i = 0; i < hul; i++) {
    const bx = cx - halfLen + 10 + i * Math.round((halfLen * 2 - 20) / Math.max(1, hul));
    rect(b, bx, deckY, 2, 14, 'grey1');
    px(b, bx, deckY + 1, 'stone3');
  }
  // --- damage: tarred patches, one per point taken
  for (let i = 0; i < Math.min(5, dmg); i++) {
    const dx2 = cx - halfLen + 14 + i * 13;
    rect(b, dx2, deckY + 5 + (i % 2) * 4, 6, 4, 'ink');
    px(b, dx2 + 1, deckY + 5 + (i % 2) * 4, 'wood0');
  }

  // --- THE HOUSE. Stern half of the deck, two storeys, pitched roof.
  const hx0 = cx - halfLen + 6, hx1 = cx + 4;
  const hw2 = hx1 - hx0;
  const upperY = deckY - 14, roofY = deckY - 22;
  rect(b, hx0, upperY, hw2, 16, plank);
  rect(b, hx0, upperY, hw2, 2, plankLit);
  rect(b, hx0, deckY - 8, hw2, 1, mix(P[plank], P.ink, 0.35));      // the floor line
  rect(b, hx0, upperY, 1, 16, 'ink');
  rect(b, hx0 + hw2 - 1, upperY, 1, 16, 'ink');
  // roof: two pitches meeting at a ridge, with a gable to the stern
  for (let y = 0; y < 8; y++) {
    const inset = Math.round((y / 7) * 0);
    const w = Math.round(hw2 * (1 - (7 - y) / 16));
    rect(b, hx0 + Math.round((hw2 - w) / 2) + inset, roofY + y, w, 1, y < 2 ? 'red0' : y % 3 === 0 ? 'rust' : 'red1');
  }
  rect(b, hx0 - 1, roofY + 7, hw2 + 2, 2, 'wood0');
  rect(b, hx0 + Math.round(hw2 / 2) - 1, roofY - 2, 2, 4, 'wood2');  // a stub chimney
  px(b, hx0 + Math.round(hw2 / 2), roofY - 3, 'grey2');
  // windows with something looking out of them
  for (let i = 0; i < 3; i++) {
    const wx = hx0 + 5 + i * Math.round((hw2 - 12) / 2);
    rect(b, wx, upperY + 5, 5, 5, 'ink');
    rect(b, wx + 1, upperY + 6, 3, 3, 'amber');
    if (i === 1) px(b, wx + 2, upperY + 7, 'wood0');
  }
  // THE DOOR: a black opening with a ramp down to the water, and a lamp over it
  const dx3 = cx + 6;
  rect(b, dx3, deckY - 8, 8, 10, 'ink');
  rect(b, dx3, deckY - 8, 8, 1, 'wood0');
  rect(b, dx3 + 1, deckY - 7, 6, 8, mix(P.ink, P.wood0, 0.5));
  for (let i = 0; i < 10; i++) {                                      // the ramp
    rect(b, dx3 + 7 + i, deckY + 2 + i, 3, 1, i % 2 ? 'wood1' : 'wood2');
  }
  disc(b, dx3 + 4, deckY - 11, 2, 'brass2');
  px(b, dx3 + 4, deckY - 11, 'gold');

  // --- pens along the forward deck, one rail per pair of animals
  const pens = Math.max(1, Math.ceil((4 + cap * 2) / 2));
  for (let i = 0; i < pens; i++) {
    const px2 = dx3 + 12 + i * 7;
    if (px2 > cx + halfLen - 8) break;
    rect(b, px2, deckY - 8, 1, 6, 'wood3');
    rect(b, px2, deckY - 8, 6, 1, 'wood4');
  }

  // --- mast and sail, forward of the house so both read in one silhouette
  const mastH = 26 + spd * 5;
  const mx = cx + 16;
  rect(b, mx, deckY - mastH, 2, mastH, 'wood3');
  rect(b, mx, deckY - mastH, 1, mastH, 'wood4');
  rect(b, mx - 9, deckY - mastH + 4, 20, 1, 'wood2');                 // the yard
  const sailH = mastH - 12;
  for (let y = 0; y < sailH; y++) {
    const f = y / sailH;
    const w = Math.round(8 + f * (8 + spd * 2));
    rect(b, mx - w, deckY - mastH + 5 + y, w, 1, y < 3 ? 'white' : y % 7 === 0 ? 'bone' : 'cream');
    px(b, mx - w, deckY - mastH + 5 + y, 'wood1');
  }
  if (spd >= 3) {
    for (let y = 0; y < 9; y++) {
      const w = 5 + y;
      rect(b, mx + 2, deckY - mastH - 9 + y, w, 1, y < 2 ? 'white' : 'cream');
    }
    rect(b, mx, deckY - mastH - 10, 2, 11, 'wood3');
  }
  // stays, and a dove pennant, because it is that kind of boat
  bline2(b, mx, deckY - mastH + 2, cx + halfLen - 4, deckY - 6);
  bline2(b, mx, deckY - mastH + 2, hx0 + 4, roofY + 2);
  rect(b, mx, deckY - mastH - 4, 1, 4, 'wood4');
  tri(b, mx + 1, deckY - mastH - 4, mx + 8, deckY - mastH - 2, mx + 1, deckY - mastH, 'foam');

  // --- cargo on the roof, one crate per hold tier
  for (let i = 0; i < hold + 1; i++) {
    const bx = hx0 + 4 + (i % 3) * 9;
    const by = roofY - 5 - Math.floor(i / 3) * 5;
    rect(b, bx, by, 8, 5, 'wood2');
    rect(b, bx, by, 8, 1, 'wood4');
    rect(b, bx, by + 2, 8, 1, 'brass1');
    px(b, bx, by, 'ink'); px(b, bx + 7, by, 'ink');
  }

  return { canvas: mk.canvas, w: W, h: H, wl: WL, halfLen };
}

/** A rigging line: 1px, dark, drawn as a stepped run so it stays on the pixel grid. */
function bline2(b, x0, y0, x1, y1) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    px(b, Math.round(x0 + (x1 - x0) * f), Math.round(y0 + (y1 - y0) * f), 'wood1');
  }
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

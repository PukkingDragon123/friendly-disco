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
import { makeCanvas, rect, px, line, disc, ellipse, tri, wash, clamp, fine } from '../core/pixel.js';

const cache = new Map();

/** The signature that decides what the boat looks like. */
function sig(t, dmg) {
  return `${t.capacity | 0}${t.speed | 0}${t.hull | 0}${t.hold | 0}/${dmg | 0}`;
}

/**
 * Bake one ark. Local space is 168x120 with the waterline at y=90, blitted at 2x, so the
 * ark is 336 screen pixels long and every pixel in it is a 2x2 block -- the same macro
 * pixel as the tiles, the animals and the plants.
 *
 * THE HALF-SIZE RULE IS WHY THE NUMBERS LOOK ODD. It was authored at 112x80 and drawn at
 * 3x, which put its pixels at three screen pixels while everything around it was at two.
 * Half of "one resolution" is arithmetic like this: pick the art size that lands on the
 * grid at the size the thing actually appears, and spend the extra room on detail.
 *
 * An ark reads from three features and it needs all three: a LONG hull with a real sheer,
 * a HOUSE on the deck with a pitched roof, and a big DOOR in the side with a ramp down to
 * the water. The mast stands forward of the house so both are in the same silhouette.
 */
function bake(t, dmg) {
  const W = 168, H = 120, WL = 90;
  const mk = makeCanvas(W, H);
  if (!mk) return null;
  const b = mk.g;

  const cap = t.capacity | 0, spd = t.speed | 0, hul = t.hull | 0, hold = t.hold | 0;
  const halfLen = 45 + cap * 6;                // the deck grows with the pens

  fine(() => {
    const cx = W / 2;
    const deckY = WL - 12;

    const plank = ['wood2', 'wood2', 'wood1', 'wood1', 'wood0'][Math.min(4, hul)];
    const plankLit = ['wood4', 'wood3', 'wood3', 'wood2', 'wood2'][Math.min(4, hul)];

    // --- hull: a deep barge, planked, with a sheer that rises towards both ends
    for (let y = 0; y < 22; y++) {
      const f = y / 21;
      const hw = Math.round(halfLen * (1 - f * f * 0.30));
      rect(b, cx - hw, deckY + y, hw * 2, 1, y < 3 ? plankLit : plank);
      if (y === 6 || y === 13) rect(b, cx - hw, deckY + y, hw * 2, 1, mix(P[plank], P.ink, 0.3));
      px(b, cx - hw, deckY + y, 'ink');
      px(b, cx + hw - 1, deckY + y, 'ink');
    }
    // the sheer: the rail lifts at bow and stern, which is what makes a hull a hull
    for (let i = 0; i < halfLen * 2; i++) {
      const f = Math.abs(i - halfLen) / halfLen;
      const lift = Math.round(f * f * 8);
      rect(b, cx - halfLen + i, deckY - 3 - lift, 1, 5 + lift, plankLit);
      px(b, cx - halfLen + i, deckY - 3 - lift, 'wood4');
    }
    // stem post at the bow, rudder and tiller at the stern
    rect(b, cx + halfLen - 3, deckY - 15, 4, 18, plank);
    tri(b, cx + halfLen - 1, deckY - 18, cx + halfLen + 7, deckY - 1, cx + halfLen - 1, deckY - 1, plankLit);
    rect(b, cx - halfLen - 5, deckY + 3, 6, 16, plank);
    rect(b, cx - halfLen - 5, deckY + 3, 6, 3, plankLit);
    rect(b, cx - halfLen - 2, deckY - 6, 3, 9, 'wood2');

    // --- iron bands, one per hull tier
    for (let i = 0; i < hul; i++) {
      const bx = cx - halfLen + 15 + i * Math.round((halfLen * 2 - 30) / Math.max(1, hul));
      rect(b, bx, deckY, 3, 21, 'grey1');
      rect(b, bx, deckY + 1, 1, 20, 'stone3');
    }
    // --- damage: tarred patches, one per point taken
    for (let i = 0; i < Math.min(5, dmg); i++) {
      const dx2 = cx - halfLen + 21 + i * 19;
      rect(b, dx2, deckY + 7 + (i % 2) * 6, 9, 6, 'ink');
      rect(b, dx2 + 1, deckY + 7 + (i % 2) * 6, 3, 2, 'wood0');
    }

    // --- THE HOUSE. Stern half of the deck, two storeys, pitched roof.
    const hx0 = cx - halfLen + 9, hx1 = cx + 6;
    const hw2 = hx1 - hx0;
    const upperY = deckY - 21, roofY = deckY - 33;
    rect(b, hx0, upperY, hw2, 24, plank);
    rect(b, hx0, upperY, hw2, 3, plankLit);
    rect(b, hx0, deckY - 12, hw2, 2, mix(P[plank], P.ink, 0.35));      // the floor line
    rect(b, hx0, upperY, 2, 24, 'ink');
    rect(b, hx0 + hw2 - 2, upperY, 2, 24, 'ink');
    for (let i = 1; i < 6; i++) {                                      // board seams
      rect(b, hx0 + Math.round((hw2 * i) / 6), upperY + 3, 1, 21, mix(P[plank], P.ink, 0.25));
    }
    // roof: two pitches to a ridge, with a stub chimney
    for (let y = 0; y < 12; y++) {
      const wd = Math.round(hw2 * (1 - (11 - y) / 24));
      rect(b, hx0 + Math.round((hw2 - wd) / 2), roofY + y, wd, 1,
        y < 3 ? 'red0' : y % 4 === 0 ? 'rust' : 'red1');
    }
    rect(b, hx0 - 2, roofY + 11, hw2 + 4, 3, 'wood0');
    rect(b, hx0 + Math.round(hw2 / 2) - 2, roofY - 4, 4, 6, 'wood2');
    rect(b, hx0 + Math.round(hw2 / 2) - 1, roofY - 5, 2, 1, 'grey2');
    // two rows of windows, with something looking out of them
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 3; i++) {
        const wx = hx0 + 7 + i * Math.round((hw2 - 18) / 2);
        const wy = upperY + 5 + row * 11;
        rect(b, wx, wy, 7, 7, 'ink');
        rect(b, wx + 1, wy + 1, 5, 5, 'amber');
        if (i === 1 && row === 0) rect(b, wx + 2, wy + 2, 3, 3, 'wood0');
      }
    }
    // THE DOOR: a black opening with a ramp down to the water, and a lamp over it
    const dx3 = cx + 9;
    rect(b, dx3, deckY - 12, 12, 15, 'ink');
    rect(b, dx3, deckY - 12, 12, 2, 'wood0');
    rect(b, dx3 + 2, deckY - 10, 8, 13, mix(P.ink, P.wood0, 0.5));
    for (let i = 0; i < 15; i++) {                                     // the ramp
      rect(b, dx3 + 10 + i, deckY + 3 + i, 4, 2, i % 2 ? 'wood1' : 'wood2');
    }
    disc(b, dx3 + 6, deckY - 16, 3, 'brass2');
    rect(b, dx3 + 5, deckY - 17, 2, 2, 'gold');

    // --- pens along the forward deck, one rail per pair of animals
    const pens = Math.max(1, Math.ceil((4 + cap * 2) / 2));
    for (let i = 0; i < pens; i++) {
      const px2 = dx3 + 18 + i * 10;
      if (px2 > cx + halfLen - 12) break;
      rect(b, px2, deckY - 12, 2, 9, 'wood3');
      rect(b, px2, deckY - 12, 9, 2, 'wood4');
    }

    // --- mast and sail, forward of the house so both read in one silhouette
    const mastH = 39 + spd * 7;
    const mx = cx + 24;
    rect(b, mx, deckY - mastH, 3, mastH, 'wood3');
    rect(b, mx, deckY - mastH, 1, mastH, 'wood4');
    rect(b, mx - 14, deckY - mastH + 6, 30, 2, 'wood2');               // the yard
    const sailH = mastH - 18;
    for (let y = 0; y < sailH; y++) {
      const f = y / sailH;
      const w = Math.round(12 + f * (12 + spd * 3));
      rect(b, mx - w, deckY - mastH + 8 + y, w, 1, y < 4 ? 'white' : y % 9 === 0 ? 'bone' : 'cream');
      px(b, mx - w, deckY - mastH + 8 + y, 'wood1');
    }
    if (spd >= 3) {
      for (let y = 0; y < 13; y++) {
        const w = 7 + y;
        rect(b, mx + 3, deckY - mastH - 13 + y, w, 1, y < 3 ? 'white' : 'cream');
      }
      rect(b, mx, deckY - mastH - 15, 3, 16, 'wood3');
    }
    // stays, and a dove pennant, because it is that kind of boat
    stay(b, mx, deckY - mastH + 3, cx + halfLen - 6, deckY - 9);
    stay(b, mx, deckY - mastH + 3, hx0 + 6, roofY + 3);
    rect(b, mx, deckY - mastH - 6, 2, 6, 'wood4');
    tri(b, mx + 2, deckY - mastH - 6, mx + 12, deckY - mastH - 3, mx + 2, deckY - mastH, 'foam');

    // --- cargo on the roof, one crate per hold tier
    for (let i = 0; i < hold + 1; i++) {
      const bx = hx0 + 6 + (i % 3) * 13;
      const by = roofY - 8 - Math.floor(i / 3) * 8;
      rect(b, bx, by, 12, 8, 'wood2');
      rect(b, bx, by, 12, 2, 'wood4');
      rect(b, bx, by + 3, 12, 1, 'brass1');
      px(b, bx, by, 'ink'); px(b, bx + 11, by, 'ink');
    }
  });

  return { canvas: mk.canvas, w: W, h: H, wl: WL, halfLen };
}

/** A rigging line: one pixel, dark, stepped so it stays on the grid. */
function stay(b, x0, y0, x1, y1) {
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

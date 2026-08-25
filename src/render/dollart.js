// CLAY DOLLS, AND WHAT THE STORM DROPS ON THEM.
//
// Both at the same half resolution as everything else. A doll is authored at 10x14 and
// blitted at 2x, so it is 20x28 on a 32-pixel tile: unmistakably smaller than the golem
// who made it and smaller than the animals it herds, which is the read we want. It is a
// figurine standing in the mud, not a unit.
//
// A doll's TYPE has to be readable at a glance, from across the field, while it is raining.
// Colour alone does not do that -- five clay figures in five browns are five clay figures
// -- so each one carries a two-pixel emblem above its head in its own bright mark colour.
// The emblem is the doll, as far as the player is concerned.

import { P, mix } from '../core/palette.js';
import { makeCanvas, rect, disc, clamp } from '../core/pixel.js';
import {
  makeBuf, bset, brect, bline, btri, blob, outline, flush,
} from './pixbuf.js';

const DW = 12, DH = 15, S = 2;
const DCX = 6;

/* ------------------------------------------------------------------------ dolls */

/**
 * The emblem, drawn AFTER the outline pass.
 *
 * That ordering matters. Drawn before, the contour joins it to the head and it reads as a
 * hat -- which is how the first version came out: seven clay cones in seven different hats.
 * Drawn after, it floats clear of the figure and reads as what it is, a mark telling you
 * which rule this doll carries. It gets its own one-pixel shadow so it still separates
 * from a pale background.
 */
function emblem(b, kind, mark) {
  const y = 1;
  const put = (x, yy, c) => { bset(b, x, yy + 1, 'ink'); bset(b, x, yy, c); };
  if (kind === 'crook') { for (let i = 0; i < 3; i++) put(DCX, y + i, mark); put(DCX - 1, y, mark); }
  else if (kind === 'plank') { for (let i = -2; i <= 2; i++) put(DCX + i, y + 1, mark); }
  else if (kind === 'fang') { put(DCX - 2, y, mark); put(DCX - 1, y + 1, mark); put(DCX + 1, y + 1, mark); put(DCX + 2, y, mark); }
  else if (kind === 'flame') { put(DCX, y + 1, mark); put(DCX - 1, y + 2, mark); put(DCX + 1, y + 2, mark); put(DCX, y, 'white'); }
  else if (kind === 'horn') { put(DCX - 2, y + 1, mark); put(DCX - 1, y, mark); put(DCX + 1, y, mark); put(DCX + 2, y + 1, mark); }
  else if (kind === 'stack') { for (let i = -2; i <= 2; i++) put(DCX + i, y + 2, mark); for (let i = -1; i <= 1; i++) put(DCX + i, y + 1, mark); put(DCX, y, mark); }
  else if (kind === 'star') {
    put(DCX, y, mark); put(DCX, y + 2, mark);
    put(DCX - 2, y + 1, mark); put(DCX + 2, y + 1, mark); put(DCX, y + 1, 'white');
  }
}

/**
 * A CLAY DOLL, and what it took to stop it being a bowling pin.
 *
 * The first version was one tapering wedge with an emblem on top: no neck, no shoulders,
 * arms the same tone as the chest, and a body that got wider all the way to the floor. At
 * twenty pixels tall that is a cone, and seven cones in seven browns are indistinguishable.
 *
 * What makes a figure at this size is exactly three things, and none of them is detail:
 * a HEAD that is separated from the body by a narrower row, SHOULDERS wider than the neck,
 * and a GAP between the legs. Everything else is colour.
 */
function bakeDoll(def, lit) {
  const mk = makeCanvas(DW * S, DH * S);
  if (!mk) return null;
  const b = makeBuf(DW, DH);
  const [dk, md, ltc] = def.body;

  // legs first, with a real gap between them, then feet
  brect(b, DCX - 2, 12, 2, 2, dk);
  brect(b, DCX + 1, 12, 2, 2, dk);
  brect(b, DCX - 3, 14, 3, 1, dk);
  brect(b, DCX + 1, 14, 3, 1, dk);

  // the body: shoulders at the top, waisted, hips at the bottom
  const HW = [2, 3, 3, 2, 2];            // rows 7..11
  for (let i = 0; i < HW.length; i++) {
    const y = 7 + i, hw = HW[i];
    for (let x = -hw; x <= hw; x++) bset(b, DCX + x, y, x < 0 ? md : x < hw ? md : dk);
  }
  // arms, one tone darker so they separate from the chest they lie over
  for (const sd of [-1, 1]) {
    const ax = DCX + sd * 4;
    brect(b, sd < 0 ? ax : ax, 8, 1, 3, dk);
    bset(b, ax, 11, md);
  }

  // the neck: ONE row narrower than both the head and the shoulders. This is the whole
  // difference between a figure and a cone.
  brect(b, DCX - 1, 6, 3, 1, dk);

  // the head
  const HHW = [1, 2, 2];                 // rows 3..5
  for (let i = 0; i < HHW.length; i++) {
    const y = 3 + i, hw = HHW[i];
    for (let x = -hw; x <= hw; x++) bset(b, DCX + x, y, x < 0 ? ltc : md);
  }
  // two speck eyes, in the mark colour when the doll is doing its job
  bset(b, DCX - 1, 5, lit ? def.mark : dk);
  bset(b, DCX + 1, 5, lit ? def.mark : dk);

  outline(b, 'ink');
  emblem(b, def.glyph, def.mark);        // after the outline: a badge, not a hat
  flush(b, mk.g, 0, 0, S);
  return mk.canvas;
}

const dollCache = new Map();
function dollSprite(def, lit) {
  const k = def.id + (lit ? '/1' : '/0');
  let hit = dollCache.get(k);
  if (hit === undefined) { hit = bakeDoll(def, lit); dollCache.set(k, hit); }
  return hit;
}
export function clearDollCache() { dollCache.clear(); monCache.clear(); }
export function dollCacheSize() { return dollCache.size + monCache.size; }

export const DOLL_W = DW * S;
export const DOLL_H = DH * S;

/**
 * drawDoll(g, def, x, y, t, o)
 *   x, y   the doll's FEET
 *   o      { lit, radius, ring }
 *
 * `ring` draws the doll's area of effect. That is not decoration: a doll whose radius you
 * cannot see is a doll you cannot plan with, and the whole game is planning where the
 * circles overlap.
 */
export function drawDoll(g, def, x, y, t = 0, o = {}) {
  const rad = o.radius !== undefined ? o.radius : def.radius;
  if (o.ring && rad > 0) {
    const r = rad * (o.tile || 32);
    const puls = 1 + Math.sin(t * 2.2) * 0.02;
    // a dashed ellipse, flattened, because the field is drawn in three-quarter view
    const steps = Math.max(16, Math.round(r / 3));
    for (let i = 0; i < steps; i++) {
      if (i % 3 === 2) continue;
      const a = (i / steps) * Math.PI * 2;
      rect(g, x + Math.cos(a) * r * puls - 1, y + Math.sin(a) * r * 0.52 * puls - 1, 2, 2,
        o.lit ? def.mark : mix(P[def.mark], P.ink, 0.45));
    }
  }
  const cv = dollSprite(def, o.lit);
  if (!cv) return;
  const bob = o.lit ? Math.round(Math.sin(t * 3.4) * 1) : 0;
  g.drawImage(cv, Math.round(x - DOLL_W / 2), Math.round(y - DOLL_H) + bob);
  // a lit doll throws a couple of motes: the cheapest possible "this is working"
  if (o.lit) {
    for (let i = 0; i < 2; i++) {
      const k = ((t * 0.9 + i * 0.5) % 1);
      rect(g, x - 4 + i * 8, y - DOLL_H - 2 - k * 8, 2, 2, i ? def.mark : 'white');
    }
  }
}

/* --------------------------------------------------------------------- monsters */

const MW = 18, MH = 16;

function bakeMonster(def) {
  const mk = makeCanvas(MW * S, MH * S);
  if (!mk) return null;
  const b = makeBuf(MW, MH);
  const [dk, md, lt] = def.body;
  const cx = 9, by = MH - 2;
  switch (def.id) {
    case 'locust': {
      // a swarm, not an insect: five bodies at different heights with wing blurs
      for (const [x, y] of [[3, 10], [8, 7], [13, 9], [6, 4], [11, 3]]) {
        blob(b, x, y, 2, 1, md);
        bset(b, x + 2, y, dk);
        bset(b, x - 2, y - 1, lt); bset(b, x + 2, y - 1, lt);
        bset(b, x + 1, y, def.eye);
      }
      break;
    }
    case 'raven': {
      blob(b, cx, by - 4, 3, 3, md);
      blob(b, cx, by - 8, 2, 2, md);                       // head
      btri(b, cx - 3, by - 6, cx - 9, by - 10, cx - 2, by - 2, dk);   // wings
      btri(b, cx + 3, by - 6, cx + 9, by - 10, cx + 2, by - 2, dk);
      btri(b, cx + 2, by - 8, cx + 5, by - 8, cx + 2, by - 6, 'brass1');
      bset(b, cx + 1, by - 9, def.eye);
      brect(b, cx - 1, by - 2, 2, 2, 'brass0');
      break;
    }
    case 'serpent': {
      // a flat S low to the ground: the silhouette is the whole animal
      for (let i = 0; i < 14; i++) {
        const x = 2 + i, y = by - 2 - Math.round(Math.sin(i * 0.55) * 3);
        brect(b, x, y, 1, 2, i < 10 ? md : dk);
        if (i % 3 === 0) bset(b, x, y, lt);
      }
      blob(b, 15, by - 2 - Math.round(Math.sin(14 * 0.55) * 3), 2, 2, md);
      bset(b, 16, by - 3, def.eye);
      bset(b, 17, by - 2, 'red2');
      break;
    }
    case 'leviathan': {
      // humps out of the water, and a head at one end
      for (let i = 0; i < 3; i++) {
        blob(b, 3 + i * 5, by - 3 - (i === 1 ? 2 : 0), 3, 2, i % 2 ? md : dk);
      }
      blob(b, 15, by - 6, 3, 2, md);
      btri(b, 15, by - 8, 18, by - 12, 13, by - 7, dk);      // crest
      bset(b, 16, by - 6, def.eye);
      brect(b, 0, by - 1, MW, 2, 'water0');
      for (let i = 0; i < MW; i += 3) bset(b, i, by - 2, 'foam');
      break;
    }
    case 'behemoth': {
      // BULK, but a shape. A slab on four legs is a table: the back has to rise to a
      // shoulder hump and fall to the haunch, and the head has to sit BELOW the shoulder.
      for (const lx of [4, 7, 12, 15]) { brect(b, lx, by - 3, 2, 4, dk); bset(b, lx, by, 'ink'); }
      const BACK = [3, 4, 5, 6, 6, 5, 5, 4, 4, 3, 3];         // half-heights, front to back
      for (let i = 0; i < BACK.length; i++) {
        const x = 4 + i;
        for (let j = 0; j < BACK[i] + 3; j++) {
          bset(b, x, by - 3 - j, j > BACK[i] ? lt : j > BACK[i] - 2 ? md : dk);
        }
      }
      // the head: forward and LOW, which is what makes it read as a grazing animal
      blob(b, 2, by - 5, 2, 2, md);
      bset(b, 1, by - 5, def.eye);
      bset(b, 3, by - 3, dk);
      brect(b, 15, by - 8, 2, 1, dk);                         // tail
      break;
    }
    case 'nephil': {
      // tall and thin: the only thing here that is taller than it is wide
      brect(b, cx - 1, by - 12, 3, 10, md);
      brect(b, cx - 3, by - 10, 2, 6, dk); brect(b, cx + 2, by - 10, 2, 6, dk);
      brect(b, cx - 2, by - 2, 2, 2, dk); brect(b, cx + 1, by - 2, 2, 2, dk);
      blob(b, cx, by - 13, 2, 2, lt);
      bset(b, cx - 1, by - 13, def.eye); bset(b, cx + 1, by - 13, def.eye);
      for (let i = 0; i < 3; i++) bset(b, cx - 4 - i, by - 12 + i, md);
      break;
    }
    default: {   // goliath
      // A BLOCK WITH LEGS IS A CRATE. Three changes of width down the figure is the
      // minimum for a humanoid at this size: helm narrower than shoulders, shoulders wider
      // than waist, waist wider than legs. And the light goes on the LEFT of each row, not
      // over the leftmost two columns of all of them, which was making one beige slab.
      for (const lx of [cx - 3, cx + 1]) { brect(b, lx, by - 4, 3, 5, dk); brect(b, lx - 1, by, 4, 1, 'ink'); }
      const BODY = [5, 5, 4, 4, 3, 3];                        // shoulders down to waist
      for (let i = 0; i < BODY.length; i++) {
        const y = by - 10 + i, hw = BODY[i];
        for (let x = -hw; x <= hw; x++) bset(b, cx + x, y, x === -hw ? lt : x < 1 ? md : dk);
      }
      brect(b, cx - 6, by - 11, 13, 1, 'stone3');             // pauldrons, proud of the body
      bset(b, cx - 6, by - 12, 'stone3'); bset(b, cx + 6, by - 12, 'stone3');
      // the helm: three rows, narrower than the shoulders, with a lit slit
      brect(b, cx - 2, by - 14, 5, 3, md);
      brect(b, cx - 2, by - 14, 1, 3, lt);
      brect(b, cx - 1, by - 13, 3, 1, 'ink');
      bset(b, cx - 1, by - 13, def.eye); bset(b, cx + 1, by - 13, def.eye);
      brect(b, cx + 7, by - 16, 2, 14, 'wood1');              // spear, clear of the body
      btri(b, cx + 6, by - 16, cx + 10, by - 16, cx + 8, by - 19, 'stone4');
      break;
    }
  }
  outline(b, 'ink');
  flush(b, mk.g, 0, 0, S);
  return mk.canvas;
}

const monCache = new Map();
function monSprite(def) {
  let hit = monCache.get(def.id);
  if (hit === undefined) { hit = bakeMonster(def); monCache.set(def.id, hit); }
  return hit;
}

export const MON_W = MW * S;
export const MON_H = MH * S;

/**
 * drawMonster(g, def, x, y, t, o)
 *   x, y   its FEET
 *   o      { size, flip, scare, tile, calm }
 *
 * `scare` draws the radius at which animals bolt, in the same dashed style as a doll's
 * radius, because it is the same kind of information: an area you are making a plan about.
 */
export function drawMonster(g, def, x, y, t = 0, o = {}) {
  const sz = o.size || def.size || 1;
  const cv = monSprite(def);
  if (!cv) return;
  if (o.scare) {
    const r = def.scare * (o.tile || 32);
    const steps = Math.max(20, Math.round(r / 4));
    for (let i = 0; i < steps; i++) {
      if (i % 4 > 1) continue;
      const a = (i / steps) * Math.PI * 2 + t * 0.35;
      rect(g, x + Math.cos(a) * r - 1, y + Math.sin(a) * r * 0.52 - 1, 2, 2,
        o.calm ? mix(P.grey1, P.ink, 0.3) : mix(P.red2, P.ink, 0.25));
    }
  }
  const dw = Math.round(MON_W * sz), dh = Math.round(MON_H * sz);
  const bob = Math.round(Math.sin(t * (o.calm ? 1.1 : 3.1)) * (o.calm ? 1 : 2));
  const dx = Math.round(x - dw / 2), dy = Math.round(y - dh) + bob;
  const prevA = g.globalAlpha;
  if (o.calm) g.globalAlpha = 0.72;
  if (o.flip) {
    g.save();
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    g.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, dw, dh);
    g.restore();
  } else {
    g.drawImage(cv, 0, 0, cv.width, cv.height, dx, dy, dw, dh);
  }
  g.globalAlpha = prevA;
  if (o.calm) {
    // three z's, so a pacified monster is obviously pacified and not just standing there
    for (let i = 0; i < 3; i++) {
      const k = ((t * 0.5 + i * 0.33) % 1);
      rect(g, dx + dw - 2 + i * 3, dy - 4 - k * 10, 2, 2, 'ice');
    }
  }
}

/** A lightning strike, live. The thing that puts a monster on the board. */
export function drawStrike(g, x, y, k) {
  // k runs 0..1 over about a third of a second
  const a = clamp(1 - k, 0, 1);
  if (a <= 0) return;
  const w = Math.max(2, Math.round(6 * a));
  let cx = x;
  for (let sy = 0; sy < y; sy += 14) {
    const nx = cx + ((sy / 14) % 2 ? 7 : -7);
    for (let i = 0; i < 14; i += 2) {
      const f = i / 14;
      rect(g, cx + (nx - cx) * f - w / 2, sy + i, w, 3, i % 4 ? 'white' : 'ice');
    }
    cx = nx;
  }
  disc(g, x, y, Math.round(10 + (1 - a) * 26), a > 0.6 ? 'white' : 'ice');
  disc(g, x, y, Math.round(4 + (1 - a) * 14), 'white');
}

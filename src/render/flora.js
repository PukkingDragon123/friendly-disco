// EVERY PLANT IN THE GAME, AND ALL OF THEM MOVE.
//
// A cozy game is mostly foliage. The islands and the garden used to be flat ground with
// a few baked props sitting on it, and flat ground reads as a board game -- what makes a
// place feel like a place is a hundred small plants at three depths, all leaning the
// same way at the same moment.
//
// HOW THE WIND WORKS. Sway cannot be baked into one sprite, and drawing a hundred plants
// live is a hundred plants' worth of fillRects every frame. So each plant is baked at
// FIVE BEND PHASES, and the wind picks the phase:
//
//   bend = wind(t, x) -> -2..+2 -> one drawImage of the right pre-leaned sprite
//
// A screen full of grass is then a screen full of blits, the sway is free, and every
// plant leans with its neighbours because they all read the same wind function. The gust
// term (the slow sine) is what stops it looking like a metronome.
//
// Art is authored at HALF RESOLUTION and blitted at 2x, same as the tiles and the
// animals, so a blade of grass has the same two-pixel weight as the beast standing on it.

import { P, mix } from '../core/palette.js';
import { makeCanvas, clamp } from '../core/pixel.js';
import { makeBuf, bset, brect, bline, outline, flush } from './pixbuf.js';

const S = 2;                  // art pixels to screen pixels
const PHASES = 5;             // bend -2 -1 0 +1 +2
const VARIANTS = 4;

/** Every plant kind, and the art box it is authored in. */
export const PLANTS = {
  grass: { w: 13, h: 10, lean: 3 },
  tuft: { w: 17, h: 13, lean: 3 },
  fern: { w: 19, h: 15, lean: 2 },
  bush: { w: 23, h: 17, lean: 2 },
  flower: { w: 11, h: 15, lean: 3 },
  reed: { w: 11, h: 22, lean: 4 },
  cattail: { w: 13, h: 26, lean: 4 },
  sapling: { w: 19, h: 24, lean: 3 },
  palm: { w: 33, h: 40, lean: 3 },
  lily: { w: 19, h: 8, lean: 1 },
  vine: { w: 13, h: 26, lean: 3 },
};
export const PLANT_KINDS = Object.keys(PLANTS);

/**
 * The wind. One function for the whole game, so nothing sways out of step with anything
 * else: a fast ripple plus a slow gust, sampled by world x so a breeze crosses the
 * screen instead of pulsing everywhere at once.
 */
export function wind(t, x = 0) {
  return Math.sin(t * 1.6 + x * 0.016) * 0.62 + Math.sin(t * 0.53 + x * 0.004) * 0.45;
}

/** Which of the five bend phases this plant is in right now. */
export function bendAt(t, x, stiff = 1) {
  return clamp(Math.round(wind(t, x) * 2 * stiff), -2, 2);
}

/* ------------------------------------------------------------------- palettes */

// stem / dark / mid / light / bloom, per biome. Foliage is the loudest thing about a
// biome -- swap these and the same island reads as somewhere else entirely.
const RAMPS = {
  grassland: ['green0', 'green0', 'leaf2', 'leaf3', 'gold'],
  jungle: ['green0', 'leaf0', 'leaf1', 'moss', 'pink'],
  desert: ['wood1', 'moss', 'leaf1', 'sand', 'red2'],
  swamp: ['deep', 'green0', 'moss', 'leaf1', 'purple1'],
  snow: ['stone1', 'snow0', 'snow1', 'white', 'ice'],
  tundra: ['stone1', 'green0', 'moss', 'snow0', 'ice'],
  volcano: ['ink', 'ash', 'stone1', 'rust', 'orange'],
  ruins: ['bark', 'green0', 'moss', 'leaf2', 'cream'],
  coral: ['coral0', 'coral0', 'coral1', 'pink', 'cream'],
  storm: ['deep', 'green0', 'moss', 'leaf1', 'foam'],
  mountain: ['stone1', 'green0', 'moss', 'leaf2', 'snow0'],
  peak: ['stone2', 'snow0', 'snow1', 'white', 'ice'],
  sacred: ['bark', 'moss', 'leaf2', 'leaf4', 'gold'],
  eden: ['bark', 'leaf1', 'leaf3', 'leaf4', 'pink'],
};
function rampOf(biome) { return RAMPS[biome] || RAMPS.grassland; }

/* ---------------------------------------------------------------------- bake */

function hash(n) {
  const v = Math.sin(n * 91.7 + 13.1) * 43758.5453;
  return v - Math.floor(v);
}

/** The lean of row y: nothing at the root, everything at the tip, squared. */
function leanAt(bend, box, y) {
  const f = 1 - y / (box.h - 1);
  return Math.round(bend * box.lean * f * f * 0.5);
}

function bakeGrass(b, box, ramp, v, bend, blades, seedHead) {
  const cx = (box.w - 1) / 2;
  for (let i = 0; i < blades; i++) {
    const s = hash(v * 9 + i);
    const bx = cx + (i - (blades - 1) / 2) * 2 + (s > 0.6 ? 1 : 0);
    const hgt = 4 + Math.round(hash(v * 3 + i * 7) * (box.h - 5));
    const key = s < 0.34 ? ramp[1] : s < 0.72 ? ramp[2] : ramp[3];
    for (let y = box.h - 1; y >= box.h - hgt; y--) {
      const dx = leanAt(bend, box, y) + Math.round((box.h - 1 - y) * (s - 0.5) * 0.3);
      bset(b, bx + dx, y, key);
      if (y < box.h - hgt + 2) bset(b, bx + dx, y, ramp[3]);   // lit tip
    }
    if (seedHead && s > 0.55) {
      const ty = box.h - hgt - 1;
      const dx = leanAt(bend, box, ty);
      bset(b, bx + dx, ty, ramp[4]);
      bset(b, bx + dx, ty - 1, ramp[4]);
    }
  }
}

function bakeFern(b, box, ramp, v, bend) {
  const cx = (box.w - 1) / 2;
  for (let side = -1; side <= 1; side += 2) {
    const stemLean = side * (1 + hash(v + side) * 2);
    for (let y = box.h - 1; y >= 2; y--) {
      const f = 1 - y / (box.h - 1);
      const dx = Math.round(stemLean * f * f * 2) + leanAt(bend, box, y);
      bset(b, cx + dx, y, ramp[0]);
      // fronds: a pair of ticks every THIRD row. Every other row filled the box solid
      // and the fern came out as a hedge with no stem in it.
      if ((box.h - 1 - y) % 3 === 1) {
        const armn = Math.max(1, Math.round((1 - f) * 4 + 1));
        for (let a = 1; a <= armn; a++) {
          bset(b, cx + dx - a, y - (a > 2 ? 1 : 0), a === armn ? ramp[3] : ramp[2]);
          bset(b, cx + dx + a, y - (a > 2 ? 1 : 0), a === armn ? ramp[2] : ramp[1]);
        }
      }
    }
  }
}

function bakeBush(b, box, ramp, v, bend) {
  const cx = (box.w - 1) / 2, by = box.h - 1;
  const lobes = 4 + Math.round(hash(v) * 2);
  for (let i = 0; i < lobes; i++) {
    const a = (i / lobes) * Math.PI * 2;
    const lx = cx + Math.cos(a) * (box.w * 0.24);
    const ly = by - 4 - Math.sin(a) * (box.h * 0.2);
    const r = 3 + hash(v * 5 + i) * 2.6;
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
      const wd = Math.floor(Math.sqrt(Math.max(0, r * r - y * y)));
      const yy = ly + y;
      const dx = leanAt(bend, box, yy);
      for (let x = -wd; x <= wd; x++) {
        const top = y < -r * 0.35;
        bset(b, lx + x + dx, yy, top ? ramp[3] : y > r * 0.4 ? ramp[1] : ramp[2]);
      }
    }
  }
  // a couple of berries and the dark skirt where it meets the ground
  for (let i = 0; i < 3; i++) {
    if (hash(v * 11 + i) < 0.45) continue;
    const bxp = cx + (hash(v * 13 + i) - 0.5) * box.w * 0.6;
    const byp = by - 4 - hash(v * 17 + i) * box.h * 0.4;
    bset(b, bxp, byp, ramp[4]);
  }
  brect(b, cx - 3, by, 7, 1, ramp[0]);
}

function bakeFlower(b, box, ramp, v, bend) {
  const cx = (box.w - 1) / 2;
  const hgt = box.h - 4 - Math.round(hash(v) * 3);
  for (let y = box.h - 1; y >= box.h - hgt; y--) {
    const dx = leanAt(bend, box, y);
    bset(b, cx + dx, y, ramp[0]);
    if ((box.h - 1 - y) === 3) { bset(b, cx + dx - 1, y, ramp[2]); bset(b, cx + dx + 1, y, ramp[2]); }
  }
  const ty = box.h - hgt - 1, dx = leanAt(bend, box, ty);
  // the head, big enough to be a flower and not a plus sign
  const bloom = [ramp[4], 'cream', 'pink', 'gold'][v % 4];
  for (let yy = -2; yy <= 2; yy++) {
    const wd = 2 - Math.abs(yy) * 0.5;
    for (let xx = -2; xx <= 2; xx++) {
      if (Math.abs(xx) > wd) continue;
      bset(b, cx + dx + xx, ty + yy, bloom);
    }
  }
  bset(b, cx + dx, ty, 'cream');
  bset(b, cx + dx - 1, ty - 1, 'cream');
  bset(b, cx + dx - 2, ty + 2, ramp[1]); bset(b, cx + dx + 2, ty + 2, ramp[1]);
}

function bakeReed(b, box, ramp, v, bend, club) {
  const cx = (box.w - 1) / 2;
  const stems = 2 + Math.round(hash(v) * 1.4);
  for (let i = 0; i < stems; i++) {
    const bx = cx + (i - (stems - 1) / 2) * 3;
    const hgt = box.h - 2 - Math.round(hash(v * 7 + i) * 5);
    for (let y = box.h - 1; y >= box.h - hgt; y--) {
      const dx = leanAt(bend, box, y);
      bset(b, bx + dx, y, i % 2 ? ramp[1] : ramp[2]);
      // a cattail is a metre of stem holding one dark club: the stem has to be two
      // pixels or the club reads as floating in the air on its own
      if (club) { bset(b, bx + dx - 1, y, ramp[0]); bset(b, bx + dx, y, ramp[2]); }
    }
    const ty = box.h - hgt, dx = leanAt(bend, box, ty);
    if (club) {
      for (let y = ty + 1; y < ty + 7; y++) {
        bset(b, bx + dx - 1, y, 'bark');
        bset(b, bx + dx, y, 'wood1');
        bset(b, bx + dx + 1, y, 'bark');
      }
      bset(b, bx + dx, ty, 'wood2');
    } else {
      bset(b, bx + dx, ty - 1, ramp[3]);
      bset(b, bx + dx + 1, ty, ramp[3]);
    }
  }
}

function bakeSapling(b, box, ramp, v, bend) {
  const cx = (box.w - 1) / 2, by = box.h - 1;
  const th = Math.round(box.h * 0.55);
  for (let y = by; y >= by - th; y--) {
    const dx = leanAt(bend, box, y);
    bset(b, cx + dx, y, 'bark');
    bset(b, cx + dx + 1, y, ramp[0]);
  }
  const ty = by - th;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const lx = cx + Math.cos(a) * 4, ly = ty - 3 + Math.sin(a) * 3;
    const dx = leanAt(bend, box, ly);
    for (let yy = -3; yy <= 3; yy++) {
      const wd = Math.floor(Math.sqrt(Math.max(0, 9 - yy * yy)));
      for (let xx = -wd; xx <= wd; xx++) {
        bset(b, lx + xx + dx, ly + yy, yy < -1 ? ramp[3] : yy > 1 ? ramp[1] : ramp[2]);
      }
    }
  }
}

function bakePalm(b, box, ramp, v, bend) {
  const cx = (box.w - 1) / 2, by = box.h - 1;
  const th = Math.round(box.h * 0.72);
  const curve = (hash(v) - 0.5) * 6;
  let tx = cx;
  for (let y = by; y >= by - th; y--) {
    const f = (by - y) / th;
    tx = cx + curve * f * f;
    const dx = leanAt(bend, box, y);
    bset(b, tx + dx - 1, y, 'bark');
    bset(b, tx + dx, y, 'wood1');
    bset(b, tx + dx + 1, y, 'wood2');
    if ((by - y) % 3 === 0) { bset(b, tx + dx, y, 'wood0'); bset(b, tx + dx + 1, y, 'wood1'); }
  }
  const ty = by - th, hx = tx + leanAt(bend, box, ty);
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i / 5) * Math.PI;
    for (let s = 0; s < 9; s++) {
      const f = s / 8;
      const fx = hx + Math.cos(a) * f * 12;
      const fy = ty + Math.sin(a) * f * 6 + f * f * 5;
      bset(b, fx, fy, s > 6 ? ramp[3] : ramp[2]);
      bset(b, fx, fy + 1, ramp[1]);
      if (s % 2 === 0) bset(b, fx, fy - 1, ramp[3]);
    }
  }
  for (let i = 0; i < 3; i++) bset(b, hx + i - 1, ty + 1, ramp[4]);   // a few nuts
}

function bakeLily(b, box, ramp, v, bend) {
  const cx = (box.w - 1) / 2, by = box.h - 2;
  for (let y = -3; y <= 3; y++) {
    const wd = Math.floor(Math.sqrt(Math.max(0, 9 - y * y)) * 2.4);
    for (let x = -wd; x <= wd; x++) {
      if (x > 0 && x < 3 && y > 0) continue;                          // the notch
      bset(b, cx + x + bend, by + y, y < 0 ? ramp[2] : ramp[1]);
    }
  }
  if (v % 2) { bset(b, cx - 3 + bend, by - 4, 'cream'); bset(b, cx - 2 + bend, by - 4, ramp[4]); }
}

// A vine HANGS: it is anchored at the top of its box and the sway grows towards the free
// end at the bottom, which is the opposite of everything else in here.
function bakeVine(b, box, ramp, v, bend) {
  const cx = (box.w - 1) / 2;
  for (let y = 0; y < box.h; y++) {
    const f = y / (box.h - 1);
    const dx = Math.round(Math.sin(f * 4 + v) * 2) + Math.round(bend * box.lean * f * f);
    bset(b, cx + dx, y, ramp[0]);
    bset(b, cx + dx + 1, y, ramp[1]);
    // leaf pairs, alternating sides, big enough to read
    if (y % 4 === 1) {
      const side = (y % 8 === 1) ? -1 : 1;
      for (let a = 1; a <= 3; a++) {
        bset(b, cx + dx + side * a + (side > 0 ? 1 : 0), y, a === 3 ? ramp[3] : ramp[2]);
        if (a < 3) bset(b, cx + dx + side * a + (side > 0 ? 1 : 0), y + 1, ramp[1]);
      }
    }
    if (y % 9 === 4) { bset(b, cx + dx - 1, y + 2, ramp[4]); bset(b, cx + dx, y + 2, ramp[4]); }
  }
}

const OUTLINED = { bush: true, sapling: true, palm: true, lily: true };

const BAKERS = {
  grass: (b, box, r, v, bend) => bakeGrass(b, box, r, v, bend, 5, false),
  tuft: (b, box, r, v, bend) => bakeGrass(b, box, r, v, bend, 7, true),
  fern: bakeFern,
  bush: bakeBush,
  flower: bakeFlower,
  reed: (b, box, r, v, bend) => bakeReed(b, box, r, v, bend, false),
  cattail: (b, box, r, v, bend) => bakeReed(b, box, r, v, bend, true),
  sapling: bakeSapling,
  palm: bakePalm,
  lily: bakeLily,
  vine: bakeVine,
};

/* --------------------------------------------------------------------- cache */

const cache = new Map();
const CAP = 900;

function get(kind, biome, v, bend) {
  const key = kind + '/' + biome + '/' + v + '/' + bend;
  let hit = cache.get(key);
  if (hit !== undefined) return hit;
  const box = PLANTS[kind] || PLANTS.grass;
  const pad = box.lean + 2;
  const mk = makeCanvas((box.w + pad * 2) * S, (box.h + 2) * S);
  if (!mk) { cache.set(key, null); return null; }
  const b = makeBuf(box.w + pad * 2, box.h + 2);
  const shifted = { w: b.w, h: box.h, lean: box.lean };
  (BAKERS[kind] || BAKERS.grass)(b, shifted, rampOf(biome), v, bend);
  // A contour is what makes a MASS read against busy ground -- and what destroys a blade
  // of grass: a one-pixel blade wrapped in ink is a three-pixel black smear. Only the
  // solid shapes get outlined; the thin ones carry their own dark side instead.
  if (OUTLINED[kind]) outline(b, 'ink');
  flush(b, mk.g, 0, 0, S);
  hit = { canvas: mk.canvas, ax: (b.w / 2) * S, ay: box.h * S };
  if (cache.size > CAP) cache.clear();
  cache.set(key, hit);
  return hit;
}

export function clearFloraCache() { cache.clear(); }
export function floraCacheSize() { return cache.size; }

/* ---------------------------------------------------------------------- draw */

/**
 * drawPlant(g, x, y, kind, o)
 *   x, y — where the ROOT is: plants are anchored at the base, like everything that
 *          stands on ground, so a scene can sort them by y and never think about height.
 *   o — { biome, v, t, stiff, scale }
 */
export function drawPlant(g, x, y, kind, o = {}) {
  const v = (o.v === undefined ? 0 : o.v) % VARIANTS;
  const bend = o.bend !== undefined ? o.bend : bendAt(o.t || 0, x, o.stiff === undefined ? 1 : o.stiff);
  const c = get(kind, o.biome || 'grassland', v, bend);
  if (!c) return;
  // even, so the plant's 2x2 pixels stay in step with the ground under them
  g.drawImage(c.canvas, Math.round((x - c.ax) / 2) * 2, Math.round((y - c.ay) / 2) * 2);
}

/**
 * A whole band of undergrowth, deterministic in (seed) and sorted back to front.
 * `mix` names the kinds and their weights; `n` is how many plants to try.
 */
export function drawFoliage(g, x, y, w, h, o = {}) {
  const kinds = o.kinds || ['grass', 'grass', 'tuft', 'fern', 'flower', 'bush'];
  const n = o.n || 90;
  const seed = o.seed || 1;
  const t = o.t || 0;
  const skip = o.skip;                          // (x,y) -> true to leave a gap
  const items = [];
  for (let i = 0; i < n; i++) {
    const px0 = x + hash(seed + i * 3) * w;
    const py0 = y + hash(seed + i * 7) * h;
    if (skip && skip(px0, py0)) continue;
    items.push([px0, py0, kinds[Math.floor(hash(seed + i * 11) * kinds.length)], Math.floor(hash(seed + i * 13) * VARIANTS)]);
  }
  items.sort((a, b) => a[1] - b[1]);
  for (const [px0, py0, kind, v] of items) {
    drawPlant(g, px0, py0, kind, { biome: o.biome, v, t, stiff: o.stiff });
  }
  return items.length;
}

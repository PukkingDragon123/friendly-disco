// THE ISLAND, TILE BY TILE.
//
// One 32-pixel tile is authored in a 16x16 buffer and blitted at 2x, same as everything
// else, so the ground has the same two-pixel weight as the animals standing on it.
//
// FOUR VARIANTS PER TERRAIN, chosen by a hash of the tile's coordinates. A grid of
// identical tiles reads as a grid no matter how good the tile is -- the eye finds the
// repeat instantly and the field turns into graph paper. Four variants and no tile borders
// and the same field reads as ground.
//
// Everything here is baked once per (kind, biome, variant) and blitted. A stage is 29x11,
// so drawing the ground live would be three hundred and nineteen tiles of per-pixel work
// every frame; baked, the whole floor is 319 drawImage calls, and the terrain layer is
// composited into ONE canvas by the field renderer so in practice it is one.

import { P, mix } from '../core/palette.js';
import { makeCanvas, rect, clamp } from '../core/pixel.js';
import {
  makeBuf, bset, bget, brect, bline, btri, blob, outline, flush,
} from './pixbuf.js';

export const TILE = 32;
const A = 16;                 // art pixels per tile
const S = 2;

/** Terrain codes. Kept as small integers because the grid is a typed array. */
export const T = {
  GRASS: 0, SAND: 1, MUD: 2, WATER: 3, ROCK: 4, BUSH: 5, TREE: 6, CLIFF: 7, DECK: 8, PLANK: 9,
};
export const T_NAME = ['grass', 'sand', 'mud', 'water', 'rock', 'briar', 'deadfall', 'cliff', 'deck', 'plank'];

/** Which terrain can be walked on. PLANK is a bridged water tile. */
export function walkable(k) { return k === T.GRASS || k === T.SAND || k === T.MUD || k === T.DECK || k === T.PLANK; }
/** Which terrain a ram doll can break into open ground. */
export function breakable(k) { return k === T.ROCK || k === T.BUSH || k === T.TREE; }

/* ------------------------------------------------------------------- ground palettes */

// Per biome: [dark, mid, light] for grass-ish ground, plus the sand and the mud it uses.
const GROUND = {
  grassland: { turf: ['green0', 'leaf2', 'leaf3'], sand: ['wood1', 'sand', 'cream'], mud: ['bark', 'wood1', 'wood2'] },
  jungle: { turf: ['leaf0', 'leaf1', 'moss'], sand: ['wood0', 'wood1', 'sand'], mud: ['deep', 'bark', 'wood1'] },
  desert: { turf: ['wood1', 'sand', 'cream'], sand: ['wood1', 'sand', 'cream'], mud: ['wood0', 'wood1', 'sand'] },
  swamp: { turf: ['deep', 'green0', 'moss'], sand: ['bark', 'wood1', 'wood2'], mud: ['night', 'deep', 'green0'] },
  snow: { turf: ['snow0', 'snow1', 'white'], sand: ['snow0', 'snow1', 'white'], mud: ['stone1', 'stone2', 'snow0'] },
  tundra: { turf: ['snow0', 'snow1', 'white'], sand: ['snow0', 'snow1', 'white'], mud: ['stone1', 'stone2', 'snow0'] },
  volcano: { turf: ['ink', 'ash', 'stone1'], sand: ['ash', 'stone1', 'stone2'], mud: ['ink', 'ash', 'lava0'] },
  ruins: { turf: ['green0', 'moss', 'leaf2'], sand: ['stone1', 'stone2', 'stone3'], mud: ['shadow', 'stone0', 'stone1'] },
  coral: { turf: ['sand', 'cream', 'white'], sand: ['sand', 'cream', 'white'], mud: ['coral0', 'coral1', 'pink'] },
  storm: { turf: ['deep', 'green0', 'moss'], sand: ['stone1', 'stone2', 'stone3'], mud: ['night', 'deep', 'stone0'] },
  mountain: { turf: ['stone1', 'stone2', 'moss'], sand: ['stone2', 'stone3', 'stone4'], mud: ['stone0', 'stone1', 'stone2'] },
  peak: { turf: ['snow0', 'snow1', 'white'], sand: ['stone2', 'stone3', 'stone4'], mud: ['stone0', 'stone1', 'stone2'] },
  sacred: { turf: ['moss', 'leaf2', 'leaf3'], sand: ['cream', 'parch', 'white'], mud: ['brass0', 'brass1', 'brass2'] },
};
const DEFAULT_GROUND = GROUND.grassland;

function groundOf(biome) { return GROUND[biome] || DEFAULT_GROUND; }

/** A cheap deterministic hash, so a tile always looks the same in the same place. */
export function tileHash(c, r, salt = 0) {
  let h = (c * 374761393 + r * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0);
}
export function variantAt(c, r, n = 4) { return tileHash(c, r) % n; }

/* --------------------------------------------------------------------- the tiles */

/**
 * Turf, and a lesson about tiling.
 *
 * The first version put three big shaded blobs in each tile. With only four variants those
 * blobs landed in the same four places every time, got clipped by the tile edge, and the
 * field came out as a lozenge pattern repeating every four tiles -- wallpaper, not ground.
 *
 * A tile's own texture has to be SUBTLE and has to keep away from its edges. The variety
 * comes from the scatter pass instead (see drawScatter), which is placed off the world
 * position rather than the tile, so nothing about it lines up with the grid.
 */
function turfTile(b, ramp, v) {
  brect(b, 0, 0, A, A, ramp[1]);
  const h = tileHash(v, 7);
  for (let i = 0; i < 4 + v; i++) {
    const x = 2 + ((h >> (i * 2)) % (A - 4));
    const y = 2 + ((h >> (i * 3 + 1)) % (A - 4));
    bset(b, x, y, ramp[2]);
    bset(b, x, y + 1, ramp[0]);
  }
}

function sandTile(b, ramp, v) {
  brect(b, 0, 0, A, A, ramp[1]);
  const h = tileHash(v, 19);
  for (let i = 0; i < 4; i++) {
    const y = (h >> (i * 4)) % A;
    // ripples: short dashes, offset, never a full rule across the tile
    const x = (h >> (i * 2 + 3)) % (A - 5);
    brect(b, x, y, 4 + (i % 3), 1, i % 2 ? ramp[2] : ramp[0]);
  }
}

function mudTile(b, ramp, v) {
  brect(b, 0, 0, A, A, ramp[1]);
  const h = tileHash(v, 23);
  for (let i = 0; i < 3; i++) {
    blob(b, (h >> (i * 5)) % A, (h >> (i * 3)) % A, 3, 2, ramp[0]);
  }
  // two wet glints, because mud you can see is mud you avoid
  bset(b, (h >> 4) % A, (h >> 7) % A, ramp[2]);
  bset(b, (h >> 9) % A, (h >> 11) % A, ramp[2]);
}

function waterTile(b, v) {
  brect(b, 0, 0, A, A, 'water1');
  const h = tileHash(v, 31);
  for (let i = 0; i < 3; i++) {
    const y = 2 + ((h >> (i * 4)) % (A - 4));
    const x = (h >> (i * 3 + 2)) % (A - 6);
    brect(b, x, y, 4 + (i % 3), 1, i === 0 ? 'water3' : 'water0');
  }
  brect(b, 0, 0, A, 1, 'water0');
}

function plankTile(b, v) {
  // a bridge doll lying down: three boards with gaps, and water showing through
  brect(b, 0, 0, A, A, 'water0');
  for (let i = 0; i < 3; i++) {
    const y = 1 + i * 5;
    brect(b, 0, y, A, 4, i % 2 ? 'wood2' : 'wood1');
    brect(b, 0, y, A, 1, 'wood3');
    brect(b, 0, y + 3, A, 1, 'wood0');
  }
  bset(b, 2, 2, 'brass2'); bset(b, A - 3, 12, 'brass2');
  void v;
}

function deckTile(b, v) {
  brect(b, 0, 0, A, A, 'wood1');
  for (let i = 0; i < 4; i++) {
    brect(b, 0, i * 4, A, 1, 'wood0');
    brect(b, 0, i * 4 + 1, A, 1, 'wood2');
  }
  const h = tileHash(v, 41);
  bset(b, h % A, (h >> 5) % A, 'brass1');
  bset(b, (h >> 3) % A, (h >> 8) % A, 'wood3');
}

/* ------------------------------------------------------------------ the obstacles */

/**
 * Props stand TALLER than their tile.
 *
 * A rock that fits inside its 32-pixel square is a paving slab. Anything the player is
 * meant to read as an obstruction has to break the tile grid, so props bake into a
 * 16x24 buffer -- one tile wide, one and a half tall -- and are drawn anchored to the
 * bottom of their tile so the extra height hangs up into the row behind.
 */
const PROP_H = 24;

/**
 * A boulder.
 *
 * WIDEST AT THE FOOT. The first version took its width from a bump function peaking at
 * 70% of the height, which made every rock narrow at the base and broad near the top --
 * an upside-down mushroom, and on a field of them, a graveyard of tombstones. A stone
 * profile is a table, bottom row first, and it only ever narrows going up.
 */
const ROCK_HW = [
  [7, 7, 6, 6, 5, 5, 4, 3, 2],           // a broad low boulder
  [5, 6, 6, 5, 5, 4, 4, 3, 3, 2, 1],     // a taller one
  [6, 6, 6, 5, 4, 4, 3, 2],              // a squat one
];

function rockProp(b, ramp, v = 0) {
  const cx = 8, by = PROP_H - 2;
  const prof = ROCK_HW[v % ROCK_HW.length];
  // a shadow at the foot, so it is standing on the ground rather than floating over it
  brect(b, cx - prof[0], by + 1, prof[0] * 2 + 1, 1, mix(P.ink, P.shadow, 0.4));
  for (let i = 0; i < prof.length; i++) {
    const hw = prof[i], y = by - i;
    for (let x = -hw; x <= hw; x++) {
      // a mid left face and a dark right face, meeting at a hard edge just off centre
      bset(b, cx + x, y, x < hw * 0.2 ? ramp[1] : ramp[0]);
    }
  }
  // the lit top facet
  const topI = prof.length - 1;
  for (let i = 0; i <= 1; i++) {
    const hw = Math.max(1, prof[topI] - i);
    brect(b, cx - hw, by - topI - i, hw * 2 + 1, 1, i === 0 ? ramp[2] : ramp[2]);
  }
  // one crack down the dark face
  bline(b, cx + 1, by - topI + 1, cx + 3, by - 2, ramp[0]);
  bset(b, cx - prof[0] + 1, by - 1, ramp[1]);
}

function bushProp(b, ramp, v = 0) {
  const cx = 8, by = PROP_H - 2;
  const dk = mix(P[ramp[0]], P.ink, 0.45);
  const md = mix(P[ramp[0]], P.bark, 0.3);
  const lt = P[ramp[2]];
  const lift = (v % 2) * 2;
  for (const [dx, dy, r] of [[0, -7 - lift, 6], [-5, -4, 5 - (v % 2)], [5, -4, 5]]) {
    blob(b, cx + dx, by + dy, r, r - 1, md);
  }
  for (let i = -5; i <= 3; i++) bset(b, cx + i, by - 12 + Math.abs(i) * 0.5, lt);
  // notches, or the mass is a smooth blob
  for (const [nx, ny] of [[-8, -6], [8, -5], [0, -13], [-4, -1]]) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) bset(b, cx + nx + dx, by + ny + dy, null);
  }
  // thorns, so a briar looks like it would hurt
  for (const [txx, tyy] of [[-7, -5], [7, -6], [-2, -13], [4, -11], [6, -2]]) {
    bset(b, cx + txx, by + tyy, dk);
  }
  brect(b, cx - 6, by, 13, 1, dk);
}

function treeProp(b, ramp, v = 0) {
  const cx = 8, by = PROP_H - 2;
  const th = 7 + (v % 3);
  for (let i = 0; i < th; i++) {
    const w = i < 2 ? 4 : 3;
    brect(b, cx - (w >> 1), by - i, w, 1, 'bark');
    bset(b, cx - (w >> 1), by - i, 'wood2');
  }
  for (const [dx, dy, r] of [[0, -12, 6], [-5, -9, 4], [5, -9, 4], [-2, -16, 4], [3, -15, 4]]) {
    blob(b, cx + dx, by + dy, r, r - 1, ramp[1]);
  }
  for (let i = -4; i <= 2; i++) bset(b, cx + i, by - 19 + Math.abs(i) * 0.5, ramp[2]);
  // notches out of the rim, or the canopy is a smooth blob and reads as a balloon
  for (const [nx, ny] of [[-7, -13], [7, -12], [0, -20], [-5, -6]]) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) bset(b, cx + nx + dx, by + ny + dy, null);
  }
  for (let i = 0; i < 8; i++) bset(b, cx - 4 + i * 1.2, by - 6 + (i % 2), ramp[0]);
}

function cliffProp(b, ramp) {
  const by = PROP_H - 2;
  for (let i = 0; i <= 15; i++) {
    const w = 7 - Math.round(i / 6);
    brect(b, 8 - w, by - i, w * 2 + 1, 1, i > 12 ? ramp[2] : ramp[1]);
  }
  for (let i = 0; i <= 13; i++) brect(b, 10, by - i, 4, 1, ramp[0]);
  for (let i = 0; i < 3; i++) bline(b, 3 + i * 4, by - 2 - i, 5 + i * 4, by - 9 - i, ramp[0]);
}

/* --------------------------------------------------------------------- the bakes */

const tileCache = new Map();
const propCache = new Map();

function bakeTile(kind, biome, v) {
  const mk = makeCanvas(TILE, TILE);
  if (!mk) return null;
  const b = makeBuf(A, A);
  const G = groundOf(biome);
  if (kind === T.GRASS) turfTile(b, G.turf, v);
  else if (kind === T.SAND) sandTile(b, G.sand, v);
  else if (kind === T.MUD) mudTile(b, G.mud, v);
  else if (kind === T.WATER) waterTile(b, v);
  else if (kind === T.PLANK) plankTile(b, v);
  else if (kind === T.DECK) deckTile(b, v);
  else turfTile(b, G.turf, v);      // props stand ON ground, so bake the floor under them
  flush(b, mk.g, 0, 0, S);
  return mk.canvas;
}

function bakeProp(kind, biome, v) {
  const mk = makeCanvas(TILE, PROP_H * S);
  if (!mk) return null;
  const b = makeBuf(A, PROP_H);
  const G = groundOf(biome);
  const stone = biome === 'volcano' ? ['ink', 'ash', 'stone1']
    : biome === 'snow' || biome === 'tundra' || biome === 'peak' ? ['stone1', 'stone2', 'white']
      : ['stone0', 'stone2', 'stone3'];
  if (kind === T.ROCK) rockProp(b, stone, v);
  else if (kind === T.BUSH) bushProp(b, G.turf, v);
  else if (kind === T.TREE) treeProp(b, G.turf, v);
  else if (kind === T.CLIFF) cliffProp(b, stone);
  else return null;
  outline(b, 'ink');
  flush(b, mk.g, 0, 0, S);
  return mk.canvas;
}

function cached(map, key, make) {
  let hit = map.get(key);
  if (hit === undefined) {
    hit = make();
    if (map.size > 400) map.clear();
    map.set(key, hit);
  }
  return hit;
}

export function getTile(kind, biome, v) {
  return cached(tileCache, `${kind}/${biome}/${v}`, () => bakeTile(kind, biome, v));
}
export function getProp(kind, biome, v) {
  return cached(propCache, `${kind}/${biome}/${v}`, () => bakeProp(kind, biome, v));
}
export function clearTileCache() { tileCache.clear(); propCache.clear(); }
export function tileCacheSize() { return tileCache.size + propCache.size; }

/** The floor of one tile. */
export function drawTile(g, x, y, kind, biome, v) {
  const cv = getTile(kind, biome, v);
  if (cv) g.drawImage(cv, x | 0, y | 0);
}

/**
 * The prop standing on one tile, anchored to the BOTTOM of the tile so its extra height
 * hangs up over the row behind. Draw props back-to-front by row or they overlap wrongly.
 */
export function drawProp(g, x, y, kind, biome, v) {
  const cv = getProp(kind, biome, v);
  if (cv) g.drawImage(cv, x | 0, (y + TILE - cv.height) | 0);
}

/**
 * The scatter pass: the thing that actually stops a tiled floor looking tiled.
 *
 * Placed off the WORLD position rather than the tile, in twos and threes, at a density that
 * puts something in most tiles and nothing in some. Because none of it lines up with the
 * 32-pixel grid, the eye stops finding the repeat -- which is the only reason four tile
 * variants is enough.
 *
 * `ok(c, r)` is asked whether a tile will take detail, so nothing lands in the water or on
 * top of a rock.
 */
export function drawScatter(g, ox, oy, cols, rows, biome, ok, n = 260) {
  const G = groundOf(biome);
  const accent = [G.turf[0], G.turf[2], G.mud[1]];
  for (let i = 0; i < n; i++) {
    const h = tileHash(i, 991, 7);
    const x = h % (cols * TILE);
    const y = (h >> 9) % (rows * TILE);
    const c = (x / TILE) | 0, r = (y / TILE) | 0;
    if (ok && !ok(c, r)) continue;
    const k = (h >> 4) % 6;
    const col = accent[(h >> 6) % accent.length];
    if (k < 3) {
      // a tuft: two pixels up, one across. The commonest thing on the ground.
      rect(g, ox + x, oy + y, 2, 4, col);
      rect(g, ox + x + 2, oy + y + 2, 2, 2, col);
    } else if (k < 5) {
      rect(g, ox + x, oy + y, 4, 2, col);      // a pebble
      rect(g, ox + x, oy + y + 2, 2, 2, mix(P[col], P.ink, 0.35));
    } else {
      rect(g, ox + x, oy + y, 2, 2, 'white');  // a flower
      rect(g, ox + x - 2, oy + y + 2, 6, 2, col);
    }
  }
}

export const PROP_HEIGHT = PROP_H * S;

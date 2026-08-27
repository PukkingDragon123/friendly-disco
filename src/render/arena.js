// THE ARENA. A pool table that is an island, seen at a tilt, with the ark moored along the
// far shore.
//
// The game had a felt table once and it was the best-looking thing in it. Then it became a
// lane defence on a tile grid, because "an island is a line you hold" is a cleaner sentence
// than "an island is a pool table". It is also a worse game: a lane defence is a spreadsheet
// that ticks, and a pool table is a physical object you aim at. What we lost was the one
// verb nothing else in the game had -- YOU HIT A THING AND IT MOVES -- and every animal in
// the roster is a ball, so the verb was free.
//
// So the table is back, and it is not a table. It is a patch of shore with rocks on it, the
// sea on three sides, and the ark's hull along the fourth with three loading gaps in it. The
// rails are the shoreline. The pockets are the gaps. Rolling a beaten animal into a gap is
// how it gets aboard, which means the geometry of the arena and the point of the game are
// the same shape -- something the felt version never managed, because a pocket was a habitat
// and a habitat was a scoring rule.
//
// THE PROJECTION. Physics is flat, in ARENA UNITS. The view is a TILT plus a mild horizontal
// PERSPECTIVE, so the ground is a trapezoid -- narrower at the far shore -- which is what
// actually sells the two-and-a-half-D read. An affine tilt alone leaves a rectangle on
// screen and looks top-down no matter how you shade the edges.
//
//     scaleAt(ty) = 1 - persp * (1 - ty/AH)        // 1 at the near shore
//     screenX = cx + (tx - AW/2) * xs * scaleAt(ty)
//     screenY = oy + ty * tilt - tz * zs
//
// Balls are drawn at scaleAt() too, so an animal at the far shore is genuinely smaller.
//
// THE SCALE INVARIANT: BALL_R * xs must equal SPRITE_SIZE / 2, so an animal sprite drops
// onto a ball at scale 1 with no resampling at all. 5.2 * 4.615 = 24 = 48 / 2. If either
// number changes the other has to, or every animal on the arena is a resampled smear.
//
// WHAT IS BAKED AND WHAT IS NOT. The ground, the shore, the water bands and the ark are one
// canvas, baked once with the perspective already in them. What moves is drawn live: the
// foliage sways, the water glints, the gates breathe, and the balls are sorted with the
// plants so a fern in front of an animal is in front of it.

import { P, mix } from '../core/palette.js';
import {
  rect, disc, ellipse, ellipseFrame, tri, line, dither, noiseFill, text,
  makeCanvas, wash, clamp, lerp, W, H,
} from '../core/pixel.js';
import { drawPlant, drawFoliage, bendAt, wind } from './flora.js';
import { drawAnimal, drawAnimalShadow, SPRITE_SIZE, BALL_R as SPRITE_BALL_R } from './sprites.js';
import { BALL_R } from '../game/physics.js';
import { drawSea, drawSurf } from './ocean.js';

/* ------------------------------------------------------------------ geometry */

export const AW = 170;                  // arena width in units ...
export const AH = 86;                   // ... and depth

export const VIEW = {
  ox: 88,          // screen x of unit x=0 at the NEAR shore
  oy: 140,         // screen y of unit y=0 (the FAR shore)
  xs: 4.615,       // units -> pixels across, at the near shore
  tilt: 2.8,       // units -> pixels down the screen
  zs: 4.6,         // height units -> pixels
  persp: 0.16,     // how much narrower the far shore is
};
VIEW.cx = VIEW.ox + (AW / 2) * VIEW.xs;

export const GROUND = {
  farY: VIEW.oy,
  nearY: Math.round(VIEW.oy + AH * VIEW.tilt),
  nearW: AW * VIEW.xs,
};
GROUND.farW = GROUND.nearW * (1 - VIEW.persp);
GROUND.nearX = VIEW.cx - GROUND.nearW / 2;
GROUND.farX = VIEW.cx - GROUND.farW / 2;

/** Horizontal foreshortening at an arena depth. */
export function scaleAt(ty) {
  return 1 - VIEW.persp * (1 - clamp(ty / AH, -0.5, 1.5));
}

export function toScreen(tx, ty, tz = 0) {
  const s = scaleAt(ty);
  return {
    x: VIEW.cx + (tx - AW / 2) * VIEW.xs * s,
    y: VIEW.oy + ty * VIEW.tilt - tz * VIEW.zs,
    s,
  };
}

/** Inverse projection: a mouse position becomes a point on the ground plane. */
export function toArena(sx, sy) {
  const ty = (sy - VIEW.oy) / VIEW.tilt;
  const s = scaleAt(ty);
  return { x: (sx - VIEW.cx) / (VIEW.xs * s) + AW / 2, y: ty };
}

/** Visual radius of a ball at a given depth, in screen pixels. */
export function ballPixelRadius(r = BALL_R, ty = AH) {
  return r * VIEW.xs * scaleAt(ty);
}

/** Aim angle in ARENA space from a ball toward a screen point. */
export function aimAngle(ball, mx, my) {
  const p = toArena(mx, my);
  return Math.atan2(p.y - ball.y, p.x - ball.x);
}

/* ------------------------------------------------------------------ the gaps

THREE, ALONG THE FAR SHORE, AND NONE ANYWHERE ELSE.

A pool table has six pockets because a pool table is symmetrical and the point is to clear
it. This arena has three and they are all on one side, because the point is to get animals
ONTO THE BOAT: the gaps are the ark's loading doors and the ark is moored along the far
shore. That asymmetry is the whole tactical shape of the game -- everything you want to keep
has to end up going AWAY from you, up the table, which is the hard direction. Six pockets
would make every shot a pocket shot and nothing would ever be a decision.
*/

// WIDE. A door two ball-radii across is a door you thread; three is a door you aim for, and
// this game asks you to aim for it with something you are trying not to kill.
export const GATE_R = 14;

const GATE_POS = [
  { id: 'port', x: AW * 0.22, y: -1.5 },
  { id: 'main', x: AW * 0.5, y: -2.5 },
  { id: 'star', x: AW * 0.78, y: -1.5 },
];

export function buildGates(o = {}) {
  const closed = o.closed || [];
  return GATE_POS.map((p) => ({
    id: p.id, x: p.x, y: p.y, r: GATE_R * (o.scale || 1),
    closed: closed.includes(p.id),
  }));
}

export function gateScreen(gate) { return toScreen(gate.x, gate.y, 0); }

/* -------------------------------------------------------------------- ground

The island's surface, baked with the perspective in it.

Two rules do all the work. Depth is a VALUE ramp -- the far shore is a couple of steps
darker and cooler than the near, which is the only reason a flat trapezoid reads as ground
going away from you. And the texture is DITHER, not noise: at one pixel a random speckle is
video snow, and an ordered checker between two neighbouring greens is grass.
*/

const halfAtRow = (row) => (GROUND.nearW / 2) * scaleAt(row / VIEW.tilt);

const BIOMES = {
  grassland: { far: 'leaf0', near: 'leaf2', sand: 'sand', rock: 'grey0' },
  jungle: { far: 'moss0', near: 'moss2', sand: 'wood2', rock: 'grey0' },
  desert: { far: 'wood2', near: 'sand', sand: 'parch1', rock: 'wood1' },
  arctic: { far: 'ice', near: 'white', sand: 'foam', rock: 'grey1' },
  wetland: { far: 'moss0', near: 'leaf1', sand: 'wood1', rock: 'grey0' },
  sacred: { far: 'brass0', near: 'brass2', sand: 'parch1', rock: 'brass1' },
};

function biomeOf(island) {
  const k = (island && (island.biome || island.home)) || 'grassland';
  return BIOMES[k] || BIOMES.grassland;
}

/**
 * The sea, in bands, from the top of the frame down to the far shore -- and again below the
 * near shore. Hard-edged rows with a wavy travelling boundary: the fills do not move, the
 * EDGES do, which is what water looks like at this resolution and what a scrolling gradient
 * never does.
 */
function bakeSea(g, y0, y1, seed, near) {
  // THE SEA IS SHARED NOW (render/ocean.js). Four scenes each had their own version of this
  // function and all four of them were a gradient with dashes on it; the arena's was the best
  // of them and it was still a fault on a monitor. The base -- bands and haze -- bakes; the
  // crests and the sun's road are drawn live over it by drawArenaWater, on the frame clock.
  drawSea(g, {
    top: y0, bottom: y1, layer: 'base', calm: near ? 0.1 : 0.3,
    deep: near ? undefined : 'water1',
  });
  void seed;
  return;
  /* eslint-disable no-unreachable */
  const H2 = Math.max(1, y1 - y0);
  // THE DEPTH RAMP, and it runs the other way near and far. Water gets DARKER with depth,
  // so the open sea at the horizon is pale and the deep water in front of the camera is
  // nearly black -- eight rows of interpolation, not four hard bands, because a horizon in
  // four steps is a flag.
  for (let y = y0; y < y1; y++) {
    const f = (y - y0) / H2;
    const k = near ? f : 1 - f;
    rect(g, 0, y, W, 1, mix(P.water3, P.water0, Math.pow(k, 0.8)));
  }
  // SWELLS. A long wave is not a line: it is a lit crest, a dark trough under it, and a
  // white cap where it breaks. Three rows per swell, and the whole thing gets WIDER and
  // further apart as it comes toward the camera, which is the only perspective cue open
  // water has.
  const n = near ? 9 : 13;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const y = y0 + Math.round((near ? Math.pow(f, 0.72) : Math.pow(f, 1.35)) * H2);
    const depth = near ? f : 1 - f;
    const amp = 1 + depth * 4;
    const th = 1 + Math.round(depth * 2);
    const step = 2 + Math.round(depth * 2);
    for (let x = 0; x < W; x += step) {
      const ph = x * (0.020 - depth * 0.009) + i * 1.7 + seed;
      const wy = y + Math.round(Math.sin(ph) * amp + Math.sin(ph * 2.3 + 1) * amp * 0.35);
      rect(g, x, wy, step, th, mix(P.water3, P.foam, 0.35 + depth * 0.3));
      rect(g, x, wy + th, step, th, mix(P.water0, P.ink, 0.25));
      // a cap only where the crest is rising, so the foam is not a dashed line
      if (Math.cos(ph) > 0.72) rect(g, x, wy - 1, step, 1, 'foam');
    }
  }
  /* eslint-enable no-unreachable */
}

/** One rock, as a shaded lump with a flat lit top. Posts on the arena are drawn with this. */
export function drawRock(g, sx, sy, pr, tone = 'grey0') {
  // A BOULDER, NOT A SAUCER. Five ellipses stacked at 0.52 of their own width with the top
  // ones lighter came out as a flying saucer parked on the grass: the silhouette was a disc
  // and discs read as flat. A rock is a MASS -- taller than it is deep, one lit facet on the
  // top-left, one dark facet under it, a hard contour, and a shadow that is separate from it.
  const base = P[tone] || P.grey0;
  ellipse(g, sx + pr * 0.14, sy + pr * 0.34, pr * 1.02, pr * 0.3, mix(P.ink, P.shadow, 0.3));
  // the mass: an egg standing up
  for (let dy = -Math.round(pr * 1.15); dy <= Math.round(pr * 0.3); dy++) {
    const f = (dy + pr * 1.15) / (pr * 1.45);
    const wob = Math.sin(f * 5.2 + sx * 0.31) * pr * 0.06;
    const hw = pr * (0.42 + Math.sin(f * Math.PI * 0.92) * 0.62) + wob;
    const lit = f > 0.62 ? mix(base, P.ink, (f - 0.62) * 0.9)
      : mix(base, P.white, (0.62 - f) * 0.42);
    rect(g, sx - hw, sy + dy, hw * 2, 1, lit);
    // the contour, one pixel each side, so it never dissolves into the turf
    rect(g, sx - hw - 1, sy + dy, 1, 1, 'ink');
    rect(g, sx + hw, sy + dy, 1, 1, 'ink');
  }
  rect(g, sx - pr * 0.5, sy - pr * 1.16, pr, 1, 'ink');
  // two cracks, which is what makes it stone rather than a potato
  for (let i = 0; i < 2; i++) {
    const cx2 = sx - pr * 0.3 + i * pr * 0.6;
    for (let k = 0; k < Math.round(pr * 0.8); k++) {
      rect(g, cx2 + Math.round(Math.sin(k * 0.9 + i) * 2), sy - pr * 0.9 + k, 1, 1,
        mix(base, P.ink, 0.55));
    }
  }
  // moss on the lit shoulder
  for (let i = 0; i < 5; i++) {
    rect(g, sx - pr * 0.62 + i * pr * 0.22, sy - pr * (1.0 - (i % 2) * 0.12), 3, 2,
      mix(P.moss1, base, 0.35));
  }
}

/**
 * bakeArena(island, seed) -> canvas
 *
 * Everything that does not move: sea, shore, ground, the ark's hull, the loading gaps. Two
 * blits a frame instead of nine hundred draw calls, and it is the reason the arena can carry
 * this much foliage at all.
 */
export function bakeArena(island, seed = 1) {
  const cv = makeCanvas(W, H);
  if (!cv) return null;
  const g = cv.g;
  const B = biomeOf(island);
  const sd = (seed % 97) * 0.37;

  // --- sky and the open sea above the far shore
  rect(g, 0, 0, W, H, 'water0');
  // A SKY WITH SOMETHING IN IT. Fifty-two rows of gradient behind a wall of hull is fifty-two
  // rows of nothing; the ark reads as a cut-out unless there is weather behind it.
  const horizon = 46;
  for (let y = 0; y < horizon; y++) {
    const f = y / horizon;
    rect(g, 0, y, W, 1, mix(P.sky0, P.sky2, Math.pow(f, 0.7)));
  }
  for (let i = 0; i < 7; i++) {
    const cx2 = ((i * 191 + Math.round(sd * 60)) % (W + 200)) - 100;
    const cy2 = 6 + (i % 3) * 11;
    const cw = 60 + (i % 4) * 34;
    for (let k = 0; k < 3; k++) {
      rect(g, cx2 + k * 6, cy2 + k * 3, cw - k * 12, 4,
        k === 0 ? 'white' : mix(P.white, P.sky2, 0.35 + k * 0.2));
    }
  }
  rect(g, 0, horizon - 1, W, 2, mix(P.water0, P.foam, 0.45));
  bakeSea(g, horizon, GROUND.farY + 4, sd, false);

  // --- THE ARK, moored along the far shore, drawn BEFORE the ground so the ground's own
  // shore lip laps over the bottom of the hull and the two are one object.
  drawArkHull(g, sd);

  // --- the ground: a trapezoid of banded, dithered green with sand at the near shore
  for (let row = 0; row <= GROUND.nearY - GROUND.farY; row++) {
    const y = GROUND.farY + row;
    const hw = halfAtRow(row);
    const f = row / (GROUND.nearY - GROUND.farY);
    const base = mix(P[B.far], P[B.near], Math.pow(f, 0.85));
    rect(g, VIEW.cx - hw, y, hw * 2, 1, base);
    // two dithered bands of grain, offset by row so it reads as ground and not as stripes
    if (row % 2 === 0) {
      dither(g, VIEW.cx - hw, y, hw * 2, 1, base, mix(base, P.ink, 0.13), 0.35, 1);
    } else if (row % 5 === 0) {
      dither(g, VIEW.cx - hw, y, hw * 2, 1, base, mix(base, P.white, 0.1), 0.25, 1);
    }
  }
  // --- GROUND DETAIL. A trapezoid of two greens is a snooker table with the felt in the
  // wrong colour; what makes it ground is the litter on it. Pebbles, shells, a few dark
  // clumps of turf and a bright patch where the light gets through, all deterministic in
  // the seed so the same island looks the same every time you land on it.
  const rowsAll = GROUND.nearY - GROUND.farY;
  const h1 = (n) => ((Math.sin(n * 12.9898 + sd) * 43758.5453) % 1 + 1) % 1;
  for (let i = 0; i < 170; i++) {
    const row = 6 + Math.floor(h1(i * 3) * (rowsAll - 12));
    const hw = halfAtRow(row) - 8;
    const x = VIEW.cx + (h1(i * 5) * 2 - 1) * hw;
    const y = GROUND.farY + row;
    const k = h1(i * 7);
    const depth = row / rowsAll;
    if (k < 0.42) {
      // a pebble: two pixels of stone with one lit
      const pw = 1 + Math.round(depth * 2);
      rect(g, x, y, pw + 1, pw, mix(P[B.rock], P.ink, 0.3));
      rect(g, x, y, pw, 1, mix(P[B.rock], P.white, 0.3));
    } else if (k < 0.62) {
      // a shell
      rect(g, x, y, 2 + Math.round(depth * 2), 1 + Math.round(depth), 'parch1');
      rect(g, x, y, 1, 1, 'white');
    } else if (k < 0.86) {
      // a clump of darker turf
      const cw = 4 + Math.round(h1(i * 11) * 8 * (0.5 + depth));
      ellipse(g, x, y, cw, cw * 0.4, mix(P[B.near], P.ink, 0.14));
    } else {
      // and a patch where the light gets through the canopy
      const cw = 8 + Math.round(h1(i * 13) * 16 * (0.5 + depth));
      ellipse(g, x, y, cw, cw * 0.38, mix(P[B.near], P.white, 0.09));
    }
  }

  // the sand lip along the near shore, widening as it comes forward
  const sandRows = 26;
  for (let i = 0; i < sandRows; i++) {
    const row = (GROUND.nearY - GROUND.farY) - sandRows + i;
    const y = GROUND.farY + row;
    const hw = halfAtRow(row);
    const f = i / sandRows;
    const k = Math.pow(f, 1.6);
    const wob = Math.round(Math.sin(y * 0.32 + sd) * 2);
    rect(g, VIEW.cx - hw + wob, y, hw * 2, 1,
      mix(mix(P[B.near], P[B.sand], k), P[B.sand], k * 0.7));
    if (i % 2 === 0) {
      dither(g, VIEW.cx - hw + wob, y, hw * 2, 1,
        P[B.sand], mix(P[B.sand], P.ink, 0.12), 0.3, 1);
    }
  }

  // --- THE RAMPS come down out of the doors ONTO the sand, so they are drawn after the
  // ground. They used to be drawn with the hull, which painted the ground straight over
  // them: three doors opening onto nothing, forty pixels above the beach.
  drawArkRamps(g);

  // --- THE SHORE RAILS. The left, right and near edges are the island's own lip: a band of
  // wet rock and driftwood a ball bounces off. It is drawn as a solid contour plus a lit top
  // so it reads as something raised, because a rail you cannot see is a rail you blame.
  drawShoreRails(g, B, sd);

  // --- the water below the near shore, and the surf line on the sand
  bakeSea(g, GROUND.nearY + 2, H, sd + 3.1, true);
  for (let x = 0; x < W; x += 2) {
    const y = GROUND.nearY + 3 + Math.round(Math.sin(x * 0.03 + sd) * 2);
    rect(g, x, y, 2, 2, 'foam');
    rect(g, x, y + 2, 2, 1, mix(P.foam, P.water3, 0.5));
  }

  return cv.canvas;
}

/**
 * The ark's hull along the far shore, with three loading gaps in it.
 *
 * IT IS A WALL, NOT A BOAT. A whole ark drawn in profile up there would be a picture of a
 * boat behind the arena; what the game needs is the SIDE of one, close enough that the gaps
 * in it are obviously doors and low enough that it does not eat the frame.
 *
 * The one thing that stops it being a fence is SHEER: a ship's rail is not level. It rises
 * toward the bow and the stern, and the planks below it follow that curve. Six lines of
 * arithmetic, and the difference between a hull and a garden gate.
 */
/**
 * THE ARK'S RAIL, as a function of x, hoisted out of the hull painter.
 *
 * The far water has to know where the boat is. The live swells were drawn across the whole
 * band above the island, which meant they were drawn across the HULL: the ark had waves
 * running over its planking. The sea asks this where to stop.
 */
export function railYAt(x) {
  const x0 = GROUND.farX - 58, x1 = GROUND.farX + GROUND.farW + 58;
  const f = clamp((x - x0) / (x1 - x0), 0, 1);
  return 74 - Math.round(Math.pow(Math.abs(f - 0.5) * 2, 1.7) * 26);
}

function drawArkHull(g, sd) {
  const x0 = GROUND.farX - 58, x1 = GROUND.farX + GROUND.farW + 58;
  const span = x1 - x0;
  const baseY = GROUND.farY + 3;
  const sheer = (x) => {
    const f = clamp((x - x0) / span, 0, 1);
    return Math.round(Math.pow(Math.abs(f - 0.5) * 2, 1.7) * 26);
  };
  const railY = railYAt;

  // the hull, column by column, so the planking follows the sheer
  for (let x = x0; x < x1; x++) {
    const ry = railY(x);
    const hh = baseY - ry;
    rect(g, x, ry - 3, 1, hh + 6, 'ink');
    for (let i = 0; i < 12; i++) {
      const y = ry + Math.round((i / 12) * hh);
      const y2 = ry + Math.round(((i + 1) / 12) * hh);
      const tone = i < 2 ? 'wood3' : i < 4 ? 'wood2' : i < 8 ? 'wood1' : 'wood0';
      // one plank in five is a shade off, so the hull has grain rather than bands
      const off = ((Math.round(x / 23) * 7 + i * 5) % 5) === 0 ? 0.12 : 0;
      rect(g, x, y, 1, Math.max(1, y2 - y), mix(P[tone], P.ink, 0.1 + off));
      rect(g, x, y2 - 1, 1, 1, mix(P[tone], P.ink, 0.48));
    }
  }
  // ribs, following the sheer
  for (let x = x0 + 20; x < x1 - 12; x += 52) {
    const ry = railY(x);
    rect(g, x, ry, 3, baseY - ry, mix(P.wood1, P.ink, 0.38));
    rect(g, x, ry, 1, baseY - ry, mix(P.wood3, P.ink, 0.05));
  }
  // the rail: a capping timber and a brass strip, both on the curve
  for (let x = x0 - 8; x < x1 + 8; x++) {
    const ry = railY(clamp(x, x0, x1 - 1));
    rect(g, x, ry - 10, 1, 11, 'wood3');
    rect(g, x, ry - 10, 1, 2, 'brass3');
    rect(g, x, ry - 11, 1, 1, 'ink');
    rect(g, x, ry + 1, 1, 2, 'ink');
  }
  // lanterns hung along the rail, and a few animals watching over it
  for (let i = 0; i < 5; i++) {
    const lx = Math.round(x0 + span * (0.1 + i * 0.2));
    const ly = railY(lx) - 12;
    rect(g, lx - 1, ly - 8, 3, 8, 'wood1');
    rect(g, lx - 4, ly, 9, 9, 'ink');
    rect(g, lx - 3, ly + 1, 7, 7, 'brass1');
    rect(g, lx - 2, ly + 2, 5, 5, 'gold');
    rect(g, lx - 1, ly + 3, 3, 3, 'white');
    wash(g, lx - 12, ly - 4, 25, 22, 'gold', 0.1);
  }
  // the mast and its furled sail, above the rail
  const mx = Math.round(VIEW.cx);
  const mTop = 6;
  rect(g, mx - 4, mTop, 8, railY(mx) - mTop, 'wood1');
  rect(g, mx - 4, mTop, 2, railY(mx) - mTop, 'wood3');
  rect(g, mx + 3, mTop, 1, railY(mx) - mTop, 'ink');
  rect(g, mx - 62, 24, 124, 5, 'wood2');
  rect(g, mx - 62, 24, 124, 1, 'wood3');
  rect(g, mx - 62, 28, 124, 1, 'ink');
  for (let i = 0; i < 11; i++) {
    const bx = mx - 55 + i * 10;
    rect(g, bx, 29, 9, 11, i % 2 ? 'parch1' : 'parch0');
    rect(g, bx + 8, 29, 1, 11, mix(P.parch0, P.ink, 0.4));
  }
  rect(g, mx - 55, 39, 110, 2, mix(P.parch0, P.ink, 0.45));
  // rigging
  for (const s2 of [-1, 1]) {
    line(g, mx + s2 * 3, mTop + 6, mx + s2 * 110, railY(mx + s2 * 110) - 10, 'wood0');
    line(g, mx + s2 * 3, 30, mx + s2 * 150, railY(mx + s2 * 150) - 10,
      mix(P.wood0, P.ink, 0.3));
  }

  // --- the three doorways, cut into the hull
  for (const gp of buildGates()) {
    const p = toScreen(gp.x, gp.y, 0);
    const pr = Math.round(GATE_R * VIEW.xs * p.s);
    const dy = baseY - 2;
    const dTop = railY(p.x) + 6;
    // the frame
    rect(g, p.x - pr - 4, dTop - 4, pr * 2 + 8, dy - dTop + 6, 'ink');
    rect(g, p.x - pr - 2, dTop - 2, pr * 2 + 4, dy - dTop + 3, 'wood2');
    rect(g, p.x - pr, dTop, pr * 2, dy - dTop, mix(P.wood0, P.ink, 0.62));
    // an arch across the top, so it is a door and not a window
    for (let i = 0; i < pr; i++) {
      const h = Math.round(Math.sqrt(Math.max(0, pr * pr - (i - pr) * (i - pr))) * 0.42);
      rect(g, p.x - pr + i, dTop, 1, Math.max(0, 10 - h), 'wood2');
    }
    // a lit interior: warm at the back, and it spills DOWN the doorway
    for (let i = 0; i < 7; i++) {
      wash(g, p.x - pr + 4 + i, dTop + 8 + i * 2, pr * 2 - 8 - i * 2,
        dy - dTop - 12 - i * 2, 'gold', 0.075);
    }
    // straw on the floor of it, which is the one detail that says "somewhere to live"
    for (let i = 0; i < pr * 2; i += 3) {
      rect(g, p.x - pr + i, dy - 4 - ((i * 5) % 3), 2, 2, mix(P.brass2, P.ink, 0.35));
    }
    rect(g, p.x - pr - 2, dTop - 6, pr * 2 + 4, 4, 'brass2');
    rect(g, p.x - pr - 2, dTop - 6, pr * 2 + 4, 1, 'brass3');
  }
  void sd;
}

/** The ramps, down out of the doors onto the sand. Drawn after the ground, or they vanish. */
function drawArkRamps(g) {
  const baseY = GROUND.farY + 3;
  for (const gp of buildGates()) {
    const p = toScreen(gp.x, gp.y, 0);
    const pr = Math.round(GATE_R * VIEW.xs * p.s);
    // the shadow the doorway throws onto the beach, first
    wash(g, p.x - pr * 1.5, baseY, pr * 3, 22, 'ink', 0.2);
    // A RAMP IS LIGHTER THAN THE HULL IT COMES OUT OF, or it reads as a table standing on
    // the beach. Bright deal boards, a dark gap between every second one, and a kerb down
    // each side so the perspective has an edge to run along.
    for (let i = 0; i < 13; i++) {
      const f = i / 12;
      const rw = pr * (0.9 + f * 0.55);
      const ry = baseY - 2 + Math.round(f * 22);
      rect(g, p.x - rw - 2, ry, rw * 2 + 4, 3, 'ink');
      rect(g, p.x - rw, ry, rw * 2, 2, i % 2 ? 'parch0' : 'wood3');
      rect(g, p.x - rw, ry, rw * 2, 1, i % 2 ? 'parch1' : 'brass3');
      // the kerbs
      rect(g, p.x - rw - 2, ry, 3, 3, 'wood1');
      rect(g, p.x + rw - 1, ry, 3, 3, 'wood0');
    }
    // the light from the door, lying on the ramp and the sand in front of it
    wash(g, p.x - pr * 0.9, baseY - 2, pr * 1.8, 26, 'gold', 0.1);
  }
}

/** The island's lip: left, right and near. A rail you can see is a rail you can use. */
function drawShoreRails(g, B, sd) {
  const rows = GROUND.nearY - GROUND.farY;
  // side rails, following the trapezoid
  for (let row = 0; row <= rows; row++) {
    const y = GROUND.farY + row;
    const hw = halfAtRow(row);
    const th = 3 + Math.round((row / rows) * 3);
    for (const s of [-1, 1]) {
      const x = VIEW.cx + s * hw;
      rect(g, s < 0 ? x - th : x, y, th, 1, mix(P[B.rock], P.ink, 0.35));
      rect(g, s < 0 ? x - th : x + th - 1, y, 1, 1, 'ink');
      if (row % 3 === 0) {
        rect(g, s < 0 ? x - th : x, y, 1, 1, mix(P[B.rock], P.white, 0.28));
      }
    }
  }
  // the near lip: a chunkier bank of rock and driftwood
  const y0 = GROUND.nearY;
  const hw = halfAtRow(rows);
  rect(g, VIEW.cx - hw, y0, hw * 2, 3, 'ink');
  rect(g, VIEW.cx - hw, y0 - 3, hw * 2, 3, mix(P[B.rock], P.ink, 0.2));
  for (let x = -hw; x < hw; x += 17) {
    const h = 4 + ((Math.abs(Math.round(x)) * 7 + Math.round(sd * 13)) % 4);
    rect(g, VIEW.cx + x, y0 - 3 - h, 15, h, mix(P[B.rock], P.white, 0.14));
    rect(g, VIEW.cx + x, y0 - 3 - h, 15, 1, mix(P[B.rock], P.white, 0.4));
    rect(g, VIEW.cx + x + 14, y0 - 3 - h, 1, h + 3, 'ink');
  }
}

/* -------------------------------------------------------------------- live

Drawn every frame, in depth order, because everything here either moves or has to sort with
something that does.
*/

/**
 * The foliage. A LOT of it, and all of it outside the play surface except for the flat
 * stuff -- a fern in the middle of the table would be a fern the physics does not know
 * about, and an obstacle you can see and cannot hit is worse than no obstacle.
 *
 * So: dense banks along both side rails and across the near bank, palms behind them, and
 * inside the arena nothing taller than grass.
 */
export function drawArenaFoliage(g, island, t, seed = 1) {
  const B = biomeOf(island);
  const biome = (island && (island.biome || island.home)) || 'grassland';
  const rows = GROUND.nearY - GROUND.farY;
  // outside the left and right rails
  for (const s of [-1, 1]) {
    drawFoliage(g, VIEW.cx + s * (GROUND.nearW / 2 + 10) - (s < 0 ? 96 : 0),
      GROUND.farY + 10, 96, rows - 6, {
        kinds: ['grass', 'tuft', 'fern', 'bush', 'flower', 'sapling'],
        n: 34, seed: seed * 7 + (s < 0 ? 3 : 11), t, biome, stiff: 1,
      });
  }
  // the near bank, in front of the lip
  drawFoliage(g, VIEW.cx - GROUND.nearW / 2 - 40, GROUND.nearY + 4, GROUND.nearW + 80, 26, {
    kinds: ['grass', 'tuft', 'reed', 'flower', 'lily'],
    n: 46, seed: seed * 13, t, biome, stiff: 1.2,
  });
  // palms at the far corners, tall enough to frame the ark
  for (const s of [-1, 1]) {
    for (let i = 0; i < 2; i++) {
      const x = VIEW.cx + s * (GROUND.farW / 2 + 30 + i * 38);
      drawPlant(g, x, GROUND.farY + 16 + i * 12, i ? 'palm' : 'sapling',
        { t, biome, v: (i + (s < 0 ? 1 : 0)) % 4, stiff: 0.7 });
    }
  }
  void B;
}

/** Flat tufts INSIDE the arena: they never block a ball, so they never lie. */
export function drawArenaGrass(g, island, t, seed = 1) {
  const biome = (island && (island.biome || island.home)) || 'grassland';
  const rows = GROUND.nearY - GROUND.farY;
  for (let i = 0; i < 26; i++) {
    const f = ((i * 37) % 100) / 100;
    const row = 12 + ((i * 53) % (rows - 24));
    const hw = halfAtRow(row) - 26;
    const x = VIEW.cx - hw + f * hw * 2;
    drawPlant(g, x, GROUND.farY + row, i % 5 === 0 ? 'flower' : 'grass',
      { t, biome, v: i % 4, stiff: 1.4 });
  }
}

/**
 * The living sea, over the baked bands: the far water above the island and the near water in
 * front of it, plus the SURF where the near water meets the beach.
 *
 * The old version was twenty-two one-pixel dashes drifting at a fixed rate, which is the
 * fault this whole art pass exists to fix. It is the shared renderer now, on the frame clock,
 * so the arena's water and the map's water and the prologue's water are the same water.
 */
export function drawArenaWater(g, t) {
  drawSea(g, {
    top: 47, bottom: GROUND.farY + 4, layer: 'swell', t, calm: 0.3, deep: 'water1',
    sun: { x: Math.round(W * 0.62), k: 0.5 },
    floor: (x) => railYAt(x),
  });
  drawSea(g, { top: GROUND.nearY + 2, bottom: H, layer: 'swell', t: t * 1.2, calm: 0.1 });
  // and the beach: waves arrive rather than stopping at a hard line
  drawSurf(g, 0, GROUND.nearY + 6, W, t, { inland: -1, amp: 4, band: 5 });
}

/**
 * A loading gap, lit according to what it will accept.
 *
 * `state` is one of: 'open' (something is capturable), 'shut' (nothing is), 'full' (no
 * berths left). The difference has to be legible at a glance from across the arena, so it is
 * carried by COLOUR AND MOTION rather than by an icon: an open gap breathes gold, a shut one
 * sits dark, a full one has a bar across it.
 */
export function drawGate(g, gate, t, state = 'shut') {
  const s = toScreen(gate.x, gate.y, 0);
  const pr = GATE_R * VIEW.xs * s.s;
  const y = GROUND.farY + 2;
  if (state === 'open') {
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    for (let i = 0; i < 3; i++) {
      ellipseFrame(g, s.x, y, pr * (0.7 + i * 0.22 + pulse * 0.1),
        pr * (0.28 + i * 0.09), i === 0 ? 'gold' : 'brass2');
    }
    for (let i = 0; i < 8; i++) {
      const a = t * 1.4 + (i / 8) * Math.PI * 2;
      rect(g, s.x + Math.cos(a) * pr * 0.9 - 1, y + Math.sin(a) * pr * 0.34 - 1, 3, 3,
        i % 2 ? 'gold' : 'brass3');
    }
  } else if (state === 'full') {
    rect(g, s.x - pr, y - 6, pr * 2, 4, 'red1');
    rect(g, s.x - pr, y - 6, pr * 2, 1, 'red2');
  } else {
    ellipseFrame(g, s.x, y, pr * 0.8, pr * 0.3, mix(P.brass0, P.ink, 0.3));
  }
}

/* --------------------------------------------------------------------- balls */

/**
 * One ball on the arena.
 *
 * The sprite is dropped on at the depth scale, which is the one place the projection and the
 * art have to agree: BALL_R * VIEW.xs is exactly half a sprite, so at the near shore the
 * blit is 1:1 and nothing is resampled. Further up the table it shrinks, and nearest
 * neighbour at 0.85 of a 48-pixel sprite still reads because the art is chunky by design.
 *
 * `roll` comes off the physics ball's accumulated angle, so a ball that has travelled a long
 * way has spun a long way -- the pattern turning is most of what sells the roll.
 */
export function drawBall(g, ball, animal, o = {}) {
  const s = toScreen(ball.x, ball.y, 0);
  const sc = (ball.r * VIEW.xs * s.s) / SPRITE_BALL_R;
  const pr = ball.r * VIEW.xs * s.s;
  if (ball.sinkT > 0) {
    // going through a gap: shrink and sink, and the sprite goes with it
    const k = clamp(ball.sinkT, 0, 1);
    const sink = pr * k * 1.4;
    drawAnimal(g, animal, s.x, s.y + pr + sink, {
      scale: sc * (1 - k * 0.5), roll: ball.angle, mood: 'happy',
      material: o.material, alpha: 1 - k * 0.5, t: o.t || 0,
    });
    return;
  }
  drawAnimalShadow(g, s.x, s.y + pr * 0.92, sc, { alpha: 0.34 });
  drawAnimal(g, animal, s.x, s.y + pr, {
    scale: sc,
    roll: ball.angle,
    squash: ball.squash,
    mood: o.mood || 'idle',
    material: o.material,
    blessed: o.blessed,
    alpha: o.alpha,
    t: o.t || 0,
  });
}

/** A post: a rock the balls bounce off, at the right depth and the right size. */
export function drawPost(g, post, island) {
  const B = biomeOf(island);
  const s = toScreen(post.x, post.y, 0);
  const pr = post.r * VIEW.xs * s.s;
  drawRock(g, s.x, s.y + pr * 0.5, pr, B.rock);
}

/**
 * A zone: ground that changes the rules. Drawn as a patch ON the ground rather than a ring
 * over it, because a ring reads as a target and these are terrain.
 */
export function drawZone(g, zone, t) {
  const s = toScreen(zone.x, zone.y, 0);
  const pr = zone.r * VIEW.xs * s.s;
  const ry = pr * 0.4;
  const kind = zone.physics;
  if (kind === 'slow') {
    ellipse(g, s.x, s.y, pr, ry, mix(P.wood1, P.moss0, 0.4));
    dither(g, s.x - pr, s.y - ry, pr * 2, ry * 2, P.wood0, P.moss0, 0.4, 1);
    ellipseFrame(g, s.x, s.y, pr, ry, mix(P.wood0, P.ink, 0.4));
  } else if (kind === 'slick') {
    ellipse(g, s.x, s.y, pr, ry, mix(P.ice, P.white, 0.3));
    ellipseFrame(g, s.x, s.y, pr, ry, 'foam');
    for (let i = 0; i < 4; i++) {
      line(g, s.x - pr * 0.6 + i * pr * 0.4, s.y - ry * 0.4,
        s.x - pr * 0.2 + i * pr * 0.4, s.y + ry * 0.5, 'white');
    }
  } else if (kind === 'pull' || kind === 'gap') {
    for (let i = 0; i < 4; i++) {
      const k = ((t * 0.5 + i / 4) % 1);
      ellipseFrame(g, s.x, s.y, pr * (1 - k), ry * (1 - k),
        kind === 'gap' ? 'ink' : 'purple1');
    }
    ellipse(g, s.x, s.y, pr * 0.34, ry * 0.34, kind === 'gap' ? 'ink' : 'purple0');
  } else {
    ellipseFrame(g, s.x, s.y, pr, ry, 'brass1');
  }
}

/* --------------------------------------------------------------------- aim

The one piece of chrome that is allowed on the ground plane, because it is the only thing
the player is actually doing.
*/

/**
 * The aim: a fan of chevrons leaving the ball, brighter and longer with power.
 *
 * NO DOTTED PREDICTION LINE. The old table had one and it turned every shot into arithmetic:
 * you lined the dots up on the ball you wanted and released. Chevrons say direction and
 * strength and nothing else, so the shot stays a judgement.
 */
export function drawAim(g, ball, angle, power, t) {
  const s = toScreen(ball.x, ball.y, 0);
  const pr = ball.r * VIEW.xs * s.s;
  const n = 3 + Math.round(clamp(power, 0, 1.6) * 5);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  for (let i = 0; i < n; i++) {
    const d = pr * 1.5 + i * 15;
    const tx = ball.x + ca * (d / VIEW.xs);
    const ty = ball.y + sa * (d / VIEW.xs);
    const p = toScreen(tx, ty, 0);
    const k = 1 - i / n;
    const w2 = 4 + k * 5;
    const wob = Math.sin(t * 8 - i * 0.7) * 1.5;
    const tone = i < n - 2 ? 'gold' : 'brass2';
    tri(g, p.x - sa * w2, p.y + ca * w2 * 0.5 + wob,
      p.x + sa * w2, p.y - ca * w2 * 0.5 + wob,
      p.x + ca * 9, p.y + sa * 5 + wob, tone);
  }
}

/** The power ring under the ball you are about to hit. Reads without looking away. */
export function drawCharge(g, ball, power, t) {
  const s = toScreen(ball.x, ball.y, 0);
  const pr = ball.r * VIEW.xs * s.s;
  const k = clamp(power, 0, 1.6) / 1.6;
  const seg = 22;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2 - Math.PI / 2;
    const on = i / seg <= k;
    const rr = pr * (1.22 + (on ? 0.06 : 0));
    rect(g, s.x + Math.cos(a) * rr - 2, s.y + Math.sin(a) * rr * 0.42 - 2, 4, 4,
      on ? (k > 0.8 ? 'red2' : k > 0.5 ? 'gold' : 'brass3') : mix(P.ink, P.wood0, 0.5));
  }
  if (k > 0.8) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 14);
    ellipseFrame(g, s.x, s.y, pr * (1.4 + pulse * 0.1), pr * 0.6, 'red2');
  }
}

export { lerp, wind, bendAt, noiseFill, disc, text, SPRITE_SIZE };

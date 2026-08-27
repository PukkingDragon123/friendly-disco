// THE SEA. One renderer, used by every scene that has water in it.
//
// WHAT WAS WRONG WITH THE OCEAN, and it was wrong in four places at once: it was a vertical
// gradient with THIN HORIZONTAL LINES SCATTERED OVER IT. Every scene did its own version --
// the chart, the arena, the boat, the reels -- and every one of them drew the same thing: a
// dozen one-pixel dashes at fixed y, drifting sideways at a fixed rate. That is not water.
// It is a CRT with a fault, and the player has been told so twice.
//
// Water reads as water because of FOUR things, and none of them is the colour:
//
//   PERSPECTIVE IN THE RIPPLE SCALE. A wave two hundred yards out is a short dash close to
//   the next one; the same wave breaking at your feet is long, thick, and far from its
//   neighbour. Rows whose length AND spacing grow towards the camera are the single biggest
//   difference between a plane of colour and a surface. Everything else here is decoration.
//
//   CRESTS THAT ARE LIT ON ONE SIDE. A ripple is a shape with a top: one pale pixel along the
//   upper edge of a dash and one dark under it, and a flat dash becomes a swell.
//
//   PARALLAX. Near rows travel faster than far ones. If the whole field drifts at one speed
//   it reads as a texture sliding behind a window.
//
//   A HORIZON THAT GOES PALE. Air between you and the far water: three or four rows of haze
//   at the top, which is what stops the sea looking like a wall.
//
// And it moves ON THE FRAME CLOCK -- eight steps a second -- because a sea that advances by
// fractions of a pixel every frame at sixty is a shimmering mess at this resolution, and a
// sea that advances in whole pixels eight times a second is drawn animation.

import { P, mix } from '../core/palette.js';
import { rect, ellipse, clamp, lerp, W } from '../core/pixel.js';

/** Eight steps a second, and the sea is the same at the same instant for everyone. */
function step(t) { return Math.floor(t * 8); }

/**
 * The body of water.
 *
 * o.top      the horizon: where the water starts (default 0)
 * o.bottom   where it ends (default H, the near edge)
 * o.x, o.w   the strip it fills (default the whole frame)
 * o.t        time, for the drift
 * o.deep     the colour furthest from the camera is mixed towards this (default 'deep')
 * o.tint     an overall hue push, e.g. 'purple0' at dusk or 'gold' at sunset
 * o.sun      { x, k } -- a glitter road under a sun at x, strength k
 * o.calm     0..1, how much to hold the contrast down (a map background wants 0.5, a sea shot 0)
 * o.rows     how many swell rows (default derived from the height)
 * o.floor    (x) -> the lowest y the sea may paint at that x. For water that runs behind
 *            something with a curved top -- a hull, a ridge -- so the swells stop at the
 *            silhouette instead of being drawn across it.
 * o.layer    'all' (default), 'base' (the bands and the haze, which never change and so can
 *            be baked once) or 'swell' (the moving crests and the sun's road, drawn live over
 *            the baked base). Splitting it that way is what lets the arena carry a live sea
 *            and nine hundred draw calls of foliage in the same frame.
 */
export function drawSea(g, o = {}) {
  const x0 = o.x === undefined ? 0 : o.x;
  const wid = o.w === undefined ? W : o.w;
  const top = o.top === undefined ? 0 : o.top;
  const bot = o.bottom === undefined ? top + 200 : o.bottom;
  const hgt = Math.max(4, bot - top);
  const t = o.t || 0;
  const calm = clamp(o.calm === undefined ? 0 : o.calm, 0, 1);
  const q = step(t);
  // THE DEEP IS BLUE. Mixing the far rows towards `deep` -- which is a warm brown -- turned
  // the bottom half of every sea in the game to mud, and mud with cyan dashes on it is the
  // fault this file exists to fix.
  const deepC = P[o.deep] || o.deep || mix(P.water0, P.deep, 0.25);
  // THE SHALLOW END, so a caller with its own palette -- a night sea, a storm sea, a sunset
  // sea -- can hand this its two ends and get the same structure in its own colours.
  const shallowC = P[o.shallow] || o.shallow || P.water3;
  const nearTint = o.tint ? P[o.tint] || P.gold : null;
  const layer = o.layer || 'all';
  const wantBase = layer !== 'swell';
  const wantSwell = layer !== 'base';

  // 1. THE BANDS. Pale and green at the horizon, deep and blue underneath.
  if (wantBase) for (let y = 0; y < hgt; y++) {
    const f = y / hgt;
    let c = mix(mix(shallowC, mix(shallowC, deepC, 0.4), Math.pow(f, 0.35)), deepC,
      Math.pow(f, 0.85));
    if (nearTint) c = mix(c, nearTint, 0.1 * (1 - f));
    rect(g, x0, top + y, wid, 1, c);
  }

  // 2. THE HAZE. Rows at the horizon going pale, and it has to FADE OUT rather than stop, or
  //    the water starts with a hard cyan rule across it.
  // A WARM LIP AT THE HORIZON when the caller has a sky to reflect. The whole sea used to
  // take the sunset's colour from top to bottom, which turned the title screen's ocean into a
  // ploughed field: the fire belongs in the first dozen rows and in the crests, and the body
  // of the water stays the colour water is.
  const glowC = o.glow ? P[o.glow] || o.glow : null;
  if (wantBase) {
    const n = glowC ? 16 : 9;
    for (let i = 0; i < n; i++) {
      const k = 1 - i / n;
      const c = glowC ? mix(shallowC, glowC, k * k * 0.85) : mix(shallowC, P.foam, 0.42 * k * k);
      rect(g, x0, top + i, wid, 1, glowC ? mix(c, P.foam, 0.2 * k * k) : c);
    }
  }

  // 3. THE SWELLS. Rows with a growing gap, dashes with a growing length, drifting at a rate
  //    that grows too -- one loop, and it is the whole illusion.
  let y = 3, gap = 3.2;
  let row = 0;
  while (wantSwell && y < hgt) {
    const f = y / hgt;
    // A FLOOR UNDER THE PITCH, for the cost. The far rows have five-pixel dashes, so at a
    // pitch of eight and a half that is a hundred and thirteen dashes in the top row alone
    // and three rects each: the sea was costing two milliseconds a frame in dashes nobody can
    // see. Longer dashes further apart out there, and the read is identical.
    const len = 8 + f * f * 88;
    const pitch = Math.max(19, len * (1.7 + f * 1.1));
    const th = Math.max(1, Math.round(1 + f * 3));
    const drift = (q * (1 + f * 7) + row * 29) % pitch;
    const bob = Math.round(Math.sin(row * 1.7 + q * 0.11) * (f * 2));
    const face = mix(mix(mix(shallowC, deepC, 0.35), shallowC, 0.3 + f * 0.2), deepC,
      0.15 + f * 0.35);
    let crest = mix(o.foam ? P[o.foam] || o.foam : P.foam, shallowC,
      0.25 + f * 0.35 + calm * 0.3);
    // the reflection burns out of the crests near the horizon, not out of the whole sea
    if (glowC && f < 0.4) crest = mix(crest, glowC, (0.4 - f) * 1.4);
    let k = 0;
    for (let x = -pitch; x < wid + pitch; x += pitch) {
      // JITTER, or the field is a MESH. Evenly spaced dashes in evenly spaced rows line up
      // into columns and the sea comes out as woven fabric -- which is what the first cut of
      // this looked like, and it was worse than the dashes it replaced.
      const j = ((row * 53 + k * 97) % 100) / 100;
      const j2 = ((row * 31 + k * 61) % 100) / 100;
      const dl = Math.max(2, Math.round(len * (0.55 + j * 0.9)));
      const dx = Math.round(x0 + x + drift + j2 * pitch * 0.55);
      const dy = top + Math.round(y) + bob + (j > 0.8 ? 1 : 0);
      k++;
      if (dx > x0 + wid || dx + dl < x0) continue;
      if (o.floor && dy + th + 1 > o.floor(dx + dl / 2)) continue;
      rect(g, dx, dy, dl, th, face);
      // the lit top edge and the shadow under it: a dash with a top is a swell. Only where
      // there is room for it to read -- a crest highlight on a two-pixel dash is a cost.
      if (dl > 7) rect(g, dx + Math.round(dl * 0.12), dy - 1, Math.round(dl * 0.76), 1, crest);
      if (th > 1) {
        rect(g, dx, dy + th, Math.round(dl * 0.6), 1, mix(deepC, P.ink, 0.3));
      }
      // and some crests break: a short cluster of foam, on a third of them and no more
      if ((row + k) % 3 === 0 && f > 0.34 && j > 0.45) {
        rect(g, dx + Math.round(dl * 0.45), dy - 1, Math.round(dl * 0.28),
          Math.max(1, th - 1), mix(P.foam, P.white, 0.25 - calm * 0.2));
      }
    }
    y += gap; gap *= 1.13; row++;
    if (o.rows && row >= o.rows) break;
  }

  // 4. THE SUN'S ROAD, if there is a sun: bright broken glints, widening as they come at you.
  if (o.sun && wantSwell) {
    const sk = o.sun.k === undefined ? 1 : o.sun.k;
    let sy = 2, sgap = 3.4;
    let i = 0;
    while (sy < hgt) {
      const f = sy / hgt;
      const spread = 20 + f * f * 420;
      const n = 2 + Math.round(f * 9);
      for (let j = 0; j < n; j++) {
        const seed = (i * 71 + j * 37 + q * 3) % 100;
        if (seed / 100 > 0.62 + sk * 0.3) continue;      // gaps, or it is a ladder
        const jx = o.sun.x + ((seed / 100) - 0.5) * spread;
        const l = Math.max(3, (5 + f * 40) * (0.4 + (seed % 17) / 17));
        if (o.floor && top + sy + 2 > o.floor(jx)) continue;
        rect(g, Math.round(jx - l / 2), top + Math.round(sy), Math.round(l),
          Math.max(1, Math.round(1 + f * 2)),
          mix(P.gold, P.foam, ((i + j) % 3) * 0.28));
      }
      sy += sgap; sgap *= 1.14; i++;
    }
  }
}

/**
 * SURF along a shoreline: a scalloped band of foam that breathes in and out.
 *
 * The arena's island had a hard cut between grass and water, which is the one place a beach
 * absolutely cannot be hard: waves arrive. `inland` is the direction the land is in (-1 for
 * land above the line, +1 for land below), which is what lets the same call do the far shore
 * and the near one.
 */
export function drawSurf(g, x, y, w, t, o = {}) {
  const inland = o.inland || -1;
  const q = step(t);
  const amp = o.amp || 5;
  const band = o.band || 9;
  const breath = 0.5 + 0.5 * Math.sin(q * 0.12 + (o.phase || 0));
  for (let i = 0; i < w; i += 4) {
    const wob = Math.sin((x + i) * 0.05 + q * 0.14) * amp
      + Math.sin((x + i) * 0.013 - q * 0.07) * amp * 0.7;
    const d = Math.round(wob + breath * amp * 0.6);
    const yy = y + d * -inland;
    // THE BAND: a dark wet edge on the sea side, the foam itself, a bright lip, then the
    // water it came out of going pale. One line of foam is a chalk mark on a floor.
    rect(g, x + i, yy + band * inland, 4, band, mix(P.water3, P.water1, 0.45));
    rect(g, x + i, yy, 4, band, 'foam');
    rect(g, x + i, yy + (band - 2) * -inland, 4, 2, 'white');
    // bubbles in the wash, and they only show where the scallop is deepest
    if (d > amp * 0.55 && (i / 4 | 0) % 3 === 0) {
      rect(g, x + i, yy + (band + 3 + (i % 5)) * -inland, 2, 2, mix(P.foam, P.water3, 0.2));
    }
  }
}

/**
 * A WAKE behind something that is moving: two diverging lines of foam, brightest at the stern.
 * Cheap, and it is what tells the player the boat on the map is under way rather than moored.
 */
export function drawWake(g, x, y, len, t, o = {}) {
  const q = step(t);
  const spread = o.spread || 0.34;
  for (let i = 0; i < 12; i++) {
    const f = i / 11;
    const d = f * len;
    const dy = d * spread;
    const a = 1 - f;
    const c = mix(P.foam, P.water2, 0.2 + f * 0.7);
    const l = 6 + f * 14;
    const off = ((q + i * 3) % 6) - 3;
    rect(g, x - d - l / 2, y - dy + off * 0.3, l, Math.max(1, Math.round(2 * a)), c);
    rect(g, x - d - l / 2, y + dy + off * 0.3, l, Math.max(1, Math.round(2 * a)), c);
  }
}

/**
 * A SKY over water, in hard bands, with cloud bars broken into lozenges.
 *
 * Every scene wrote its own sunset and they all disagreed. `mood` picks the ramp: 'dusk' for
 * the map, 'dawn' for a hopeful shot, 'storm' for the prologue.
 */
const SKIES = {
  dusk: ['purple0', 'rust', 'orange', 'gold', 'brass3'],
  dawn: ['water0', 'purple1', 'pink', 'gold', 'brass3'],
  storm: ['night', 'purple0', 'purple1', 'grey0'],
  day: ['water1', 'sky', 'ice', 'cream'],
};
export function drawSky(g, top, bottom, mood = 'dusk', t = 0, o = {}) {
  const keys = SKIES[mood] || SKIES.dusk;
  const hgt = Math.max(2, bottom - top);
  for (let y = 0; y < hgt; y++) {
    const f = Math.pow(y / hgt, o.curve || 0.8) * (keys.length - 1);
    const i = Math.min(keys.length - 2, Math.floor(f));
    rect(g, 0, top + y, W, 1, mix(P[keys[i]], P[keys[i + 1]], f - i));
  }
  // CLOUD. Long, low, and only just darker than the sky it is in: four fat lozenges stacked
  // read as a flying saucer, which is what the first cut of this put over every sunset in the
  // game. A cloud at this scale is a WIDE flat mass with a lit upper edge and a shaded base,
  // and three of them is a sky.
  const n = o.clouds === undefined ? 3 : o.clouds;
  for (let i = 0; i < n; i++) {
    const cy = top + hgt * (0.24 + i * 0.19);
    const cw = 420 - i * 70;
    const cx = (o.cx === undefined ? W * 0.5 : o.cx)
      + Math.round(Math.sin(t * 0.09 + i * 1.7) * 26) + (i % 2 ? 150 : -160);
    const base = P[keys[Math.min(keys.length - 1, i + 1)]] || P.orange;
    const tone = mix(base, P.ink, 0.1);
    const lift = mix(base, P.white, 0.3);
    for (let j = 0; j < 7; j++) {
      const f = j / 6;
      const jw = cw * (0.22 + Math.sin(f * Math.PI) * 0.3);
      const jx = cx + (f - 0.5) * cw * 0.86;
      const jy = cy + Math.round(Math.sin(f * 4 + i) * 2);
      ellipse(g, jx, jy, jw * 0.5, 4 + Math.sin(f * Math.PI) * (5 - i), tone);
      ellipse(g, jx, jy - 2, jw * 0.42, 2 + Math.sin(f * Math.PI) * 2, lift);
    }
    rect(g, cx - cw * 0.42, cy + 5 - i, cw * 0.84, 2, mix(base, P.ink, 0.2));
  }
  if (o.sun) {
    const sx = o.sun.x, sy = o.sun.y;
    // the halo in eight quiet steps rather than four loud ones, so it glows out
    for (let i = 8; i > 0; i--) {
      ellipse(g, sx, sy, 38 + i * 9, 38 + i * 9,
        mix(P.gold, P[keys[2]] || P.orange, 0.4 + i * 0.07));
    }
    ellipse(g, sx, sy, 40, 40, 'gold');
    ellipse(g, sx, sy, 31, 31, 'cream');
    ellipse(g, sx - 8, sy - 8, 13, 13, 'white');
  }
  void lerp;
}

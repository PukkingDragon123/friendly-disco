// THE THREE SET-PIECES.
//
// A cutscene line is a portrait and some type. A SET-PIECE is the thing the line is
// describing, happening on screen, shot like film: a hard cut into a new framing every
// few seconds, letterbox bars, and a caption on the bar rather than over the picture.
//
// There are three, and they are the three moments the story turns on:
//
//   WRATH  the sky shuts, opens an eye, and puts a hand through it
//   FLOOD  one drop, then a valley, then a wall, then the waterline over the roofs
//   FORGE  clay in two hands, an armature, a word driven in, and a thing that stands
//
// ANGLE IS THE WHOLE POINT. Every shot is authored at the framing it wants -- worm's
// eye, bird's eye, extreme close-up -- rather than being the same wide shot cropped.
// That is also why there is no g.scale() anywhere in here: a camera push in pixel art
// has to be the SUBJECT growing, or every edge in the frame turns to mush. Motion
// inside a shot is done by moving and growing what is drawn, and the only transform is
// an integer translate for a pan or a shake.
//
// Every shot is a pure function of (u, t): u is 0..1 through this shot, t is wall time
// for idle motion. No state, so a screenshot tool can ask for any instant directly.

import { camKeys } from './cine.js';
import { P, col, mix } from '../core/palette.js';
import {
  rect, px, line, disc, ellipse, ellipseFrame, tri, text, wash, clamp, lerp, W, H,
} from '../core/pixel.js';
import { Ease } from '../core/juice.js';
import { drawSea } from './ocean.js';

/* ------------------------------------------------------------------ helpers */

// Deterministic scatter. Hashed rather than seeded: a set-piece has nothing to seed
// from, and every frame of a given instant must be identical.
function h(n) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/** A banded vertical gradient across the full width, from a list of palette keys. */
function vBand(g, y0, y1, keys) {
  const n = keys.length - 1;
  const span = Math.max(1, y1 - y0 - 1);
  for (let y = y0; y < y1; y++) {
    const f = ((y - y0) / span) * n;
    const s = Math.min(n - 1, Math.floor(f));
    rect(g, 0, y, W, 1, mix(P[keys[s]], P[keys[s + 1]], f - s));
  }
}

/**
 * A silhouette skyline. Two-pixel columns so it stays on the art grid, a lit top lip so
 * it reads as land rather than as a hole in the sky.
 */
function ridge(g, baseY, amp, seed, key, lip) {
  for (let x = 0; x < W; x += 2) {
    const y = Math.round(baseY - amp * (
      0.5 + 0.3 * Math.sin(x * 0.011 + seed) + 0.2 * Math.sin(x * 0.037 + seed * 2.3)
    ));
    rect(g, x, y, 2, H - y, key);
    if (lip) rect(g, x, y, 2, 2, lip);
  }
}

/** Tiny far-off roofs along a line — the thing that gives a landscape its scale. */
function village(g, y, x0, x1, seed, key, lit) {
  for (let i = 0; i < 22; i++) {
    const x = Math.round(x0 + h(seed + i) * (x1 - x0));
    const w = 4 + Math.floor(h(seed + i * 3) * 6);
    const hh = 3 + Math.floor(h(seed + i * 7) * 5);
    rect(g, x, y - hh, w, hh, key);
    tri(g, x - 1, y - hh, x + w, y - hh, x + w / 2, y - hh - 3, key);
    if (lit && h(seed + i * 11) > 0.5) px(g, x + 1, y - hh + 1, lit);
  }
}

/** Light rays from a point. Long thin triangles, washed so they stack softly. */
function rays(g, cx, cy, n, len, spread, key, a, phase) {
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (i / (n - 1) - 0.5) * spread + Math.sin(phase + i) * 0.02;
    const wd = 6 + h(i * 13) * 16;
    const ex = cx + Math.cos(ang + Math.PI) * len;
    const ey = cy - Math.sin(ang + Math.PI) * len;
    g.globalAlpha = a * (0.5 + h(i * 7) * 0.5);
    tri(g, cx, cy, ex - wd, ey, ex + wd, ey, key);
    g.globalAlpha = 1;
  }
}

/** A jagged crack with light in it. Returns the points, so debris can follow them. */
function fissure(g, x0, y0, x1, y1, wid, hot, edge, seed) {
  const steps = 18;
  let pxp = x0, pyp = y0;
  for (let i = 1; i <= steps; i++) {
    const f = i / steps;
    const nx = lerp(x0, x1, f) + (h(seed + i) - 0.5) * 34;
    const ny = lerp(y0, y1, f);
    const w = Math.max(1, Math.round(wid * (1 - f * 0.55)));
    for (let s = 0; s <= 1; s++) {
      const c = s ? hot : edge;
      const ww = s ? Math.max(1, w - 2) : w;
      const sx = pxp, sy = pyp;
      const dx = nx - sx, dy = ny - sy;
      const n = Math.max(1, Math.round(Math.hypot(dx, dy)));
      for (let j = 0; j <= n; j++) {
        rect(g, sx + (dx * j) / n - ww / 2, sy + (dy * j) / n, ww, 2, c);
      }
    }
    pxp = nx; pyp = ny;
  }
}

/**
 * A LENS. Rows whose half-width falls off as a parabola, so the ends come to a POINT --
 * which is the difference between an eye and an ellipse. Everything that goes inside an
 * eye is drawn row by row against the same profile, so nothing spills over the lid.
 */
function lensRows(rx, ry, fn) {
  const iy = Math.round(ry);
  for (let dy = -iy; dy <= iy; dy++) {
    const w = rx * (1 - (dy / ry) * (dy / ry));
    if (w >= 1) fn(dy, w);
  }
}

function lens(g, cx, cy, rx, ry, key) {
  lensRows(rx, ry, (dy, w) => rect(g, cx - w, cy + dy, w * 2, 1, key));
}

/** Rain, as slanted 1x3 dashes. Deterministic in t so it streams rather than crawls. */
function rain(g, n, t, key, slant) {
  for (let i = 0; i < n; i++) {
    const x = (h(i) * W + t * 60 * slant) % W;
    const y = (h(i * 3) * H + t * 520) % H;
    rect(g, x, y, 1, 4, key);
    if (i % 5 === 0) rect(g, x + slant, y + 4, 1, 3, key);
  }
}

/**
 * Water. Bands for depth, then ripple dashes whose LENGTH AND SPACING grow towards the
 * camera -- that perspective in the ripple scale is the only thing that makes a flat
 * plane of colour read as a surface receding to a horizon.
 */
/**
 * The water in the three big set-pieces, and it is the SHARED sea now (render/ocean.js).
 *
 * This was a gradient with dashes on it -- the same thing the chart, the arena, the title
 * screen and the four story reels each had their own copy of. The caller still hands over its
 * own two-to-four key ramp, so the wrath's sea is still the wrath's colour; what it gets back
 * is perspective in the ripple scale, lit crests and parallax.
 */
function waterRows(g, y0, y1, t, keys) {
  const n = keys.length;
  drawSea(g, {
    top: y0, bottom: y1, t,
    shallow: P[keys[0]] || keys[0],
    deep: P[keys[n - 1]] || keys[n - 1],
    calm: 0.15,
  });
}

/** A ripple ring on a surface: dashes, heavier and brighter on the near arc. */
function rippleRing(g, cx, cy, rx, ry, key, lit) {
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const near = Math.sin(a) > 0;
    if (!near && i % 2) continue;
    rect(g, cx + Math.cos(a) * rx - 2, cy + Math.sin(a) * ry,
      near ? 6 : 4, near ? 2 : 1, near ? lit : mix(P[key], P.foam, 0.45));
  }
}

/* -------------------------------------------------------------------- WRATH */

// SHOT 1 -- wide, low angle. The cloud ceiling comes down on a gold horizon.
function wrathSky(g, u, t) {
  const gy = 388;
  vBand(g, 0, gy, ['night', 'purple0', 'rust', 'brass2', 'gold']);
  // the lid, closing
  // The lid is already there in the first frame: an establishing shot of an empty
  // sunset says nothing is wrong, which is the opposite of the beat.
  const lid = Math.round(lerp(24, 268, Ease.inOutCubic(u)));
  cloudLid(g, lid, t, 1);
  ridge(g, gy + 26, 54, 3.1, 'ink', 'wood0');
  village(g, gy + 24, 40, W - 40, 5, 'ink', 'amber');
  // birds, going the other way
  for (let i = 0; i < 16; i++) {
    const bx = (h(i) * W + u * 300 + t * 34) % (W + 60) - 30;
    const by = 150 + h(i * 5) * 150 + Math.sin(t * 5 + i) * 4;
    const fl = Math.sin(t * 9 + i * 2) > 0 ? 1 : -1;
    line(g, bx - 4, by + fl * 2, bx, by, 'ink');
    line(g, bx, by, bx + 4, by + fl * 2, 'ink');
  }
  // dust lifting off the ground before the wind arrives
  for (let i = 0; i < 60; i++) {
    px(g, (h(i * 2) * W + t * 90) % W, gy + 10 + h(i * 9) * 60 - u * 20, 'wood1');
  }
}

// The underside of a cloud ceiling: a solid mass with a lumpy, lit edge.
function cloudLid(g, y, t, dark) {
  rect(g, 0, 0, W, Math.max(0, y), mix(P.ink, P.night, 0.35 * dark));
  for (let x = -30; x < W + 30; x += 13) {
    const r = 12 + h(x * 1.7) * 26;
    const yy = y - r * 0.4 + Math.sin(x * 0.017 + t * 0.25) * 4;
    disc(g, x + h(x) * 7, yy, r, mix(P.ink, P.night, 0.35 * dark));
  }
  // the lit lip, one tone up, only on the bulges' lower-left faces
  for (let x = -30; x < W + 30; x += 13) {
    const r = 12 + h(x * 1.7) * 26;
    const yy = y - r * 0.4 + Math.sin(x * 0.017 + t * 0.25) * 4;
    disc(g, x + h(x) * 7 - r * 0.25, yy + r * 0.55, Math.max(2, r * 0.4), mix(P.purple0, P.ink, 0.45));
  }
}

// SHOT 2 -- the eye. Dead centre, enormous, and it is looking at you.
function wrathEye(g, u, t) {
  const cx = W / 2, cy = 238;
  rect(g, 0, 0, W, H, 'ink');
  // the plain below, so the eye has something to stare AT
  const gy = 452;
  vBand(g, 300, gy, ['night', 'purple0', 'rust']);
  ridge(g, gy + 24, 26, 8.4, 'ink', 'wood0');
  // the cloud mass it is opening in: the whole upper frame is weather
  cloudLid(g, 330, t, 1.3);
  for (let i = 0; i < 120; i++) {
    disc(g, h(i) * W, h(i * 3) * 330, 14 + h(i * 5) * 34, mix(P.ink, P.night, 0.45));
  }

  const open = Ease.outCubic(clamp(u * 1.5, 0, 1));
  const rx = 150 + open * 210, ry = 20 + open * 96;
  // rays first, so the lid sits on top of them
  rays(g, cx, cy + ry * 0.5, 13, 460, 1.5, 'gold', 0.09 + open * 0.14, t);

  // the tear: white of the eye, then the iris, then the slit, all on the lens profile
  lens(g, cx, cy, rx + 5, ry + 5, mix(P.rust, P.ink, 0.45));
  lens(g, cx, cy, rx, ry, 'cream');
  // The iris is a ROUND thing clipped by the lid, not a band that follows it: four
  // concentric ellipses, each row trimmed to the lens profile.
  const ir = Math.min(rx * 0.36, ry * 1.35);
  const ramp = ['rust', 'orange', 'amber', 'gold'];
  for (let ring = 0; ring < 4; ring++) {
    const r = ir * (1 - ring * 0.2);
    for (let dy = -Math.round(r); dy <= r; dy++) {
      const ew = Math.sqrt(Math.max(0, 1 - (dy / r) * (dy / r))) * r * 1.55;
      const lw = rx * (1 - ((cy + dy - cy) / ry) * ((dy) / ry));
      const w = Math.min(ew, lw);
      if (w < 1) continue;
      rect(g, cx - w, cy + dy, w * 2, 1, ramp[ring]);
    }
  }
  // iris fibres, only where both ends are still inside the lid
  const inside = (x, y) => {
    const dy = y - cy;
    if (Math.abs(dy) > ry) return false;
    return Math.abs(x - cx) < rx * (1 - (dy / ry) * (dy / ry));
  };
  for (let i = 0; i < 44; i++) {
    const a = (i / 44) * Math.PI * 2;
    const x0 = cx + Math.cos(a) * ir * 0.42, y0 = cy + Math.sin(a) * ir * 0.42 * 0.7;
    const x1 = cx + Math.cos(a) * ir * 1.4, y1 = cy + Math.sin(a) * ir * 0.95 * 0.7;
    if (!inside(x0, y0) || !inside(x1, y1)) continue;
    line(g, x0, y0, x1, y1, i % 3 ? 'brass2' : 'cream');
  }
  // the slit, narrowing as it focuses on you
  const pw = Math.max(4, (1 - Ease.inOutCubic(u)) * 34 + 7);
  for (let dy = -Math.round(ry * 0.72); dy <= ry * 0.72; dy++) {
    const f = 1 - Math.abs(dy) / (ry * 0.72);
    const w = pw * (0.35 + f * 0.65);
    rect(g, cx - w, cy + dy, w * 2, 1, 'ink');
    if (f > 0.5) rect(g, cx - w * 0.5, cy + dy, w, 1, 'shadow');
  }
  rect(g, cx - pw - 6, cy - ry * 0.42, 5, 3, 'white');      // one specular, off-centre
  // the lids: cloud bulges lying over the top and bottom edge of the tear
  for (const side of [-1, 1]) {
    for (let x = -rx - 20; x <= rx + 20; x += 12) {
      const f = clamp(1 - Math.abs(x) / rx, 0, 1);
      const ly = cy + side * (ry * (1 - (x / rx) * (x / rx)) + 12 + f * 6);
      disc(g, cx + x, ly + side * 9, 8 + f * 16, mix(P.ink, P.night, 0.42));
      if (side < 0) disc(g, cx + x - 3, ly - 2, 4 + f * 6, mix(P.purple0, P.ink, 0.5));
    }
  }
  // and the light landing on the plain: a cone, widening as it falls
  g.globalAlpha = 0.09 + open * 0.09;
  tri(g, cx - 90, cy + ry, cx + 90, cy + ry, cx - 330, gy, 'gold');
  tri(g, cx + 90, cy + ry, cx - 330, gy, cx + 330, gy, 'gold');
  g.globalAlpha = 1;
  // everyone in it is flat on their face
  for (let i = 0; i < 26; i++) {
    const fx = cx - 250 + h(i) * 500;
    const fy = gy - 6 - h(i * 3) * 10;
    rect(g, fx, fy, 11 + h(i * 7) * 7, 3, 'ink');
    disc(g, fx + 13, fy, 2, 'ink');
  }
}

// SHOT 3 -- worm's eye. The crowd is at our feet and the hand fills the sky.

/**
 * A tapering limb, drawn as overlapping 2px rows along its axis so it is SOLID. The
 * first version of the hand stepped along the axis in whole segments and came out as a
 * dotted line -- at this scale a limb has to be filled, not sampled.
 */
function taper(g, x0, y0, x1, y1, w0, w1, key, lit, dark) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0)));
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const cx = lerp(x0, x1, f), cy = lerp(y0, y1, f), w = lerp(w0, w1, f);
    rect(g, cx - w / 2, cy, w, 2, key);
    // A NARROWER EDGE LIGHT. At a fifth of the width it is a stripe of paint down the middle
    // of the limb, and God's hand came out looking like a rubber glove: an eighth, mixed
    // halfway back into the body colour, is a lit edge.
    if (lit) {
      rect(g, cx - w / 2, cy, Math.max(2, w * 0.12), 2, lit);
      rect(g, cx - w / 2 + Math.max(2, w * 0.12), cy, Math.max(1, w * 0.08), 2,
        mix(col(lit), col(key), 0.5));
    }
    if (dark) rect(g, cx + w / 2 - Math.max(2, w * 0.14), cy, Math.max(2, w * 0.14), 2, dark);
  }
}

function wrathHand(g, u, t) {
  vBand(g, 0, H, ['ink', 'night', 'purple0', 'rust']);
  const drop = Ease.inOutCubic(u);
  const cx = W / 2 + 10;
  const wrist = Math.round(lerp(-70, 120, drop));
  const cloudK = mix(P.night, P.purple0, 0.55);
  // the edge light on it, and it is a HALF STEP rather than a highlight: cream mixed a third
  // of the way in gave every finger a chalk stripe down it, which is a rubber glove
  const litK = mix(P.purple0, P.purple1, 0.55);
  const darkK = 'ink';

  // the glow it carries with it. Ellipses, not rects: a stepped rectangle glow reads as
  // vertical banding across the whole sky.
  g.globalAlpha = 0.012;
  for (let i = 13; i >= 1; i--) ellipse(g, cx, wrist + 60, 74 * i, 54 * i, 'gold');
  g.globalAlpha = 1;
  // fingers FIRST, so they read as coming out from behind the knuckles
  for (let f = 0; f < 4; f++) {
    const spread = (f - 1.5) * 0.34;
    const long = 1 + (f === 1 ? 0.18 : f === 2 ? 0.1 : 0);
    let px0 = cx - 96 + f * 64, py0 = wrist + 74;
    let ang = spread;
    const segs = [[66 * long, 74, 64], [54 * long, 64, 54], [42 * long, 54, 40]];
    for (const [len, w0, w1] of segs) {
      const nx2 = px0 + Math.sin(ang) * len, ny2 = py0 + Math.cos(ang) * len;
      taper(g, px0, py0, nx2, ny2, w0, w1, cloudK, litK, darkK);
      disc(g, nx2, ny2, w1 * 0.5, cloudK);
      px0 = nx2; py0 = ny2; ang += spread * 0.34;   // curl, symmetric about the middle
    }
    disc(g, px0, py0, 19, cloudK);
    rect(g, px0 - 11, py0 - 5, 10, 9, mix(col(litK), P.purple1, 0.35));   // a nail of light
  }
  // thumb, out to the side and towards camera
  taper(g, cx - 118, wrist + 54, cx - 208, wrist + 126, 72, 58, cloudK, litK, darkK);
  taper(g, cx - 208, wrist + 126, cx - 254, wrist + 192, 58, 42, cloudK, litK, darkK);
  disc(g, cx - 254, wrist + 192, 21, cloudK);
  // forearm, always running off the top of frame -- there is never a shoulder
  taper(g, cx, -20, cx, wrist + 6, 210, 258, cloudK, litK, darkK);
  // the palm: wide, short, and round at the bottom corners
  const ph = 128;
  taper(g, cx, wrist, cx, wrist + ph - 22, 258, 266, cloudK, litK, darkK);
  disc(g, cx - 106, wrist + ph - 30, 30, cloudK);
  disc(g, cx + 106, wrist + ph - 30, 30, cloudK);
  taper(g, cx - 4, wrist + ph - 38, cx - 4, wrist + ph - 4, 250, 186, cloudK, null, darkK);
  // knuckles along the bottom edge
  for (let f = 0; f < 4; f++) disc(g, cx - 96 + f * 64, wrist + ph - 20, 33, cloudK);
  rect(g, cx - 129, wrist, 18, ph - 38, litK);

  // lightning between the fingers, on a coarse clock so it flickers rather than crawls
  const seed = Math.floor(t * 11);
  for (let b = 0; b < 3; b++) {
    if (h(seed + b) < 0.45) continue;
    let bx = cx - 120 + h(seed + b * 3) * 240, by = wrist + 300;
    for (let i = 0; i < 16 && by < H - 40; i++) {
      const nx2 = bx + (h(seed + i + b) - 0.5) * 30;
      const ny2 = by + 12 + h(seed + i * 2) * 8;
      line(g, bx, by, nx2, ny2, 'white');
      line(g, bx + 1, by, nx2 + 1, ny2, 'ice');
      bx = nx2; by = ny2;
    }
  }

  // THE CROWD, huge and close, because we are lying down among them -- and they are PEOPLE
  // rather than pins. Two failures to learn from: a rectangle with a disc on top and two
  // hairlines for arms is a bowling alley, and an arm drawn as a horizontal bar plus a line of
  // dots does not JOIN, so the second version had sticks floating beside the bodies. One
  // stepped path of blocks per limb, thick enough to be a limb, and a hem wider than the
  // shoulders.
  const cy = H - 6;
  const limb = (x0, y0, x1, y1, th) => {
    const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / (th * 0.5)));
    for (let k = 0; k <= n; k++) {
      rect(g, lerp(x0, x1, k / n) - th / 2, lerp(y0, y1, k / n) - th / 2, th, th, 'ink');
    }
  };
  for (let i = 0; i < 22; i++) {
    const cxx = 4 + i * 46 + h(i) * 20;
    const hh = 76 + h(i * 5) * 84;
    const wd = 24 + h(i * 3) * 14;
    const topY = cy - hh;
    const hipY = cy - hh * 0.44;
    // legs: two columns with daylight between them
    for (const sd of [-1, 1]) {
      limb(cxx + sd * wd * 0.24, hipY, cxx + sd * wd * 0.3, cy - 2, wd * 0.3);
    }
    // the body: shoulders in, hem out
    const bodyH = hipY - topY;
    for (let k = 0; k < 24; k++) {
      const f = k / 23;
      const bw = wd * (0.74 + f * 0.5);
      rect(g, cxx - bw / 2, topY + f * bodyH, bw, Math.ceil(bodyH / 23) + 1, 'ink');
    }
    // the head, and a neck under it so it is not a ball on a plank
    limb(cxx, topY + 2, cxx, topY - 4, wd * 0.32);
    disc(g, cxx, topY - 12 - h(i) * 3, 10 + h(i) * 3, 'ink');
    // arms up, shoulder to elbow to hand, waving at their own rate
    const sw = Math.sin(t * 1.6 + i) * 8;
    for (const sd of [-1, 1]) {
      const shx = cxx + sd * wd * 0.42, shy = topY + bodyH * 0.16;
      const ex = shx + sd * wd * 0.5, ey = shy - bodyH * 0.2;
      limb(shx, shy, ex, ey, wd * 0.24);
      limb(ex, ey, ex + sd * wd * 0.3 + sw * 0.4, ey - bodyH * 0.3, wd * 0.2);
    }
  }
}

// SHOT 4 -- low and wide. A chasm opens across the plain, lit from underneath.
function wrathCrack(g, u, t) {
  const hz = 186;
  vBand(g, 0, hz, ['ink', 'night', 'purple0']);
  cloudLid(g, 152, t, 1.2);
  // the plain, running away from us
  vBand(g, hz, H, ['rust', 'wood1', 'wood0', 'shadow']);
  ridge(g, hz + 8, 16, 5.5, 'shadow', 'wood1');
  village(g, hz + 6, 40, W - 40, 12, 'ink', 'amber');
  // ploughed texture, converging on the horizon so the ground reads as GROUND
  for (let i = 0; i < 70; i++) {
    const f = h(i);
    const y = hz + 8 + f * f * (H - hz);
    const wd = 30 + f * 160;
    rect(g, h(i * 3) * W, y, wd, 1 + f * 3, h(i * 5) > 0.5 ? 'wood0' : 'wood2');
  }

  const open = Ease.outCubic(u);
  // THE CHASM: a wedge from the horizon to the bottom of frame, with the light of the
  // world's underside coming up out of it.
  const apex = 520;
  for (let y = hz; y < H; y++) {
    const f = (y - hz) / (H - hz);
    const hw = f * f * 360 * (0.25 + open * 0.75) + 2;
    // the jag is per four-row block, not per row: a per-row wobble frays the lip into
    // something that reads as grass instead of as broken rock
    const jag = (h(Math.floor(y / 4) * 3.7) - 0.5) * (8 + f * 24);
    const cx = apex - f * 90 + jag;
    rect(g, cx - hw - 8, y, hw * 2 + 16, 1, 'ink');                       // the lip
    rect(g, cx - hw, y, hw * 2, 1, 'shadow');                             // the walls
    rect(g, cx - hw * 0.6, y, hw * 1.2, 1, mix(P.ink, P.rust, 0.55));     // deeper
    const core = hw * 0.34 * (0.4 + open * 0.6);
    rect(g, cx - core, y, core * 2, 1, f > 0.5 ? 'gold' : 'amber');
    rect(g, cx - core * 0.4, y, core * 0.8, 1, f > 0.35 ? 'cream' : 'gold');
  }
  // the glow it throws up over everything
  g.globalAlpha = 0.02;
  for (let i = 12; i >= 1; i--) ellipse(g, apex - 40, H - 60, 70 * i, 46 * i, 'gold');
  g.globalAlpha = 1;

  // Slabs of the plain tilting into it, anchored ON the lip, biggest nearest us. Each
  // one carries a piece of what was standing on it, which is the only thing in the shot
  // that gives the gap a size.
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const f = 0.22 + h(i * 5) * 0.78;
    const y = hz + f * f * (H - hz);
    const hw = f * f * 360 * (0.25 + open * 0.75);
    const jag = (h(Math.floor(y / 4) * 3.7) - 0.5) * (8 + f * 24);
    const bx = apex - f * 90 + jag + side * (hw + 34 + f * 40);
    const wd = 60 + f * 170, hh = 20 + f * 74;
    const lean = -side * (10 + f * 46) * open;
    // the top face, sliding towards the gap
    tri(g, bx - wd / 2, y, bx + wd / 2, y - 8, bx - wd / 2 + lean, y + hh, 'stone1');
    tri(g, bx + wd / 2, y - 8, bx - wd / 2 + lean, y + hh, bx + wd / 2 + lean, y + hh - 8, 'stone1');
    for (let x = 0; x < wd; x += 3) rect(g, bx - wd / 2 + x, y - (x / wd) * 8, 3, 5, 'stone3');
    wash(g, bx - wd / 2, y, wd, hh, 'ink', 0.3);
    // a house or two going with it
    if (f > 0.35) {
      for (let j = 0; j < 2; j++) {
        const hx = bx - wd / 4 + j * wd * 0.4 + lean * 0.4;
        const hs = 6 + f * 14;
        rect(g, hx, y - hs, hs, hs, 'ink');
        tri(g, hx - 2, y - hs, hx + hs + 2, y - hs, hx + hs / 2, y - hs * 1.7, 'ink');
        rect(g, hx + 2, y - hs + 2, 3, 3, 'amber');
      }
    }
  }

  // debris thrown up out of the gap, with the light on its underside
  for (let i = 0; i < 26; i++) {
    const p = (h(i * 3) + t * 0.15) % 1;
    const dx = apex - 70 + (h(i) - 0.5) * 260;
    const dy = H - p * (H - hz) * 0.8;
    const sz = 3 + h(i * 7) * 9;
    rect(g, dx, dy, sz, sz * 0.7, 'stone1');
    rect(g, dx, dy + sz * 0.4, sz, sz * 0.3, 'gold');
  }
  for (let i = 0; i < 90; i++) {
    px(g, apex - 60 + (h(i) - 0.5) * 300, H - ((h(i * 3) * 400) + t * 90) % 400, h(i * 7) > 0.5 ? 'sand' : 'brass1');
  }
}

export const WRATH = {
  id: 'wrath',
  dur: 12.5,
  // THE CAMERA, which these three set-pieces did without for a fortnight. A `drift` is a
  // parallel move at a constant rate -- it is a conveyor belt, not a camera -- and `shake` is
  // a constant tremble with no event under it. Keys and hits instead: the sky presses DOWN on
  // the first shot, the eye is a slow push in, the hand SNAPS the frame in when it arrives,
  // and the ground shot pulls back off the damage.
  shots: [
    {
      at: 0.00, id: 'sky', label: 'THE SKY SHUTS LIKE A LID', draw: wrathSky,
      cam: [{ at: 0, y: -30, zoom: 1.06 }, { at: 1, y: 26, zoom: 1.14, ease: 'in' }],
    },
    {
      at: 0.28, id: 'eye', label: 'AND OPENS AN EYE IN IT', draw: wrathEye,
      cam: [{ at: 0, zoom: 1 }, { at: 1, zoom: 1.22, ease: 'inout' }],
      hits: [[0.5, 4, null]],
    },
    {
      at: 0.56, id: 'hand', label: 'THE HAND COMES THROUGH', draw: wrathHand,
      cam: [
        { at: 0, y: -20, zoom: 1.02 },
        { at: 0.42, y: -14, zoom: 1.04, ease: 'linear' },
        { at: 0.5, y: 30, zoom: 1.3, ease: 'snap' },
        { at: 1, y: 10, zoom: 1.1, ease: 'out' },
      ],
      hits: [[0.46, 15, 'white'], [0.6, 7, null], [0.82, 5, null]],
    },
    {
      at: 0.80, id: 'crack', label: 'AND THE GROUND ANSWERS', draw: wrathCrack,
      cam: [
        { at: 0, y: 40, zoom: 1.34 },
        { at: 0.24, y: 30, zoom: 1.26, ease: 'snap' },
        { at: 1, y: 0, zoom: 1, ease: 'out' },
      ],
      hits: [[0.06, 16, 'white'], [0.3, 8, null], [0.62, 5, null]],
    },
  ],
};

/* -------------------------------------------------------------------- FLOOD */

// SHOT 1 -- extreme close-up. Still black water, and one drop.
function floodDrop(g, u, t) {
  const hz = 206;
  vBand(g, 0, hz, ['ink', 'shadow', 'deep', 'water0']);
  // one bar of light left in the sky, and it is going out
  rect(g, 0, hz - 14, W, 3, mix(P.rust, P.ink, 0.4 + u * 0.5));
  rect(g, 0, hz - 11, W, 8, mix(P.wood0, P.ink, 0.3 + u * 0.5));
  waterRows(g, hz, H, t, ['water3', 'water2', 'water1', 'water0']);
  rect(g, 0, hz, W, 2, 'water3');
  // the last of the sky, lying on the water in a column under the drop
  for (let y = hz + 2; y < H; y += 2) {
    const f = (y - hz) / (H - hz);
    rect(g, W / 2 + 30 - 26 + Math.sin(y * 0.2 + t) * (3 + f * 9), y, 52 - f * 20, 1,
      mix(P.water3, P.rust, 0.25 * (1 - f)));
  }

  const cx = W / 2 + 30, iy = 344;
  const land = 0.38;
  if (u < land) {
    const f = u / land;
    const dy = lerp(-70, iy, Ease.inQuad(f));
    const st = 14 + f * 40;                       // it stretches as it accelerates
    ellipse(g, cx, dy, 11, st, 'water3');
    ellipse(g, cx - 3, dy - st * 0.25, 5, st * 0.45, 'foam');
    ellipse(g, cx, dy + st * 0.7, 9, 9, 'white');
    // and its reflection, coming up to meet it
    ellipse(g, cx, iy + (iy - dy) * 0.28, 7, st * 0.4, mix(P.water2, P.deep, 0.4));
  } else {
    const f = (u - land) / (1 - land);
    // the crown: a ring of spikes thrown straight up, then falling back
    if (f < 0.34) {
      const k = f / 0.34;
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const d = 10 + k * 84;
        const yy = iy - Math.sin(k * Math.PI) * 58 + Math.abs(Math.cos(a)) * 8;
        ellipse(g, cx + Math.cos(a) * d, yy, 4, 7 + (1 - k) * 12, 'foam');
        if (i % 2 === 0) ellipse(g, cx + Math.cos(a) * d, yy - 6, 3, 4, 'white');
      }
      // the central jet
      ellipse(g, cx, iy - (1 - k) * 54, 12 * (1 - k) + 5, 30 * (1 - k) + 6, 'white');
    }
    // rings: four, each born later, dashed so they sit ON the surface
    for (let r = 0; r < 4; r++) {
      const rk = clamp(f * 1.3 - r * 0.2, 0, 1);
      if (rk <= 0) continue;
      const rr = rk * (300 + r * 130);
      rippleRing(g, cx, iy, rr, rr * 0.23, r === 0 ? 'water3' : 'water2', 'foam');
    }
  }
  // and then it is not one drop any more
  const many = clamp((u - 0.7) / 0.3, 0, 1);
  if (many > 0) {
    rain(g, Math.round(many * 260), t, 'water3', 1);
    for (let i = 0; i < many * 34; i++) {
      const rx = h(i * 7) * W;
      const ry2 = hz + 20 + h(i * 3) * (H - hz - 30);
      const rr = 8 + h(i) * 40;
      ellipseFrame(g, rx, ry2, rr, rr * 0.24, 'water2');
    }
  }
}

// SHOT 2 -- bird's eye. A whole valley, and the river climbing out of its bed.
function floodValley(g, u, t) {
  rect(g, 0, 0, W, H, 'moss');
  // fields, seen from above: a patchwork on the diagonal
  for (let i = 0; i < 150; i++) {
    const fx = -60 + h(i) * (W + 120), fy = -30 + h(i * 3) * (H + 60);
    const fw = 40 + h(i * 5) * 110, fh = 26 + h(i * 7) * 70;
    const k = h(i * 11);
    rect(g, fx, fy, fw, fh, k < 0.3 ? 'leaf1' : k < 0.55 ? 'moss' : k < 0.75 ? 'sand' : k < 0.9 ? 'leaf0' : 'wood1');
    rect(g, fx, fy, fw, 1, 'leaf2');
    rect(g, fx, fy + fh - 1, fw, 1, 'wood0');
    // furrows
    if (k > 0.6) for (let j = 2; j < fh; j += 4) rect(g, fx + 1, fy + j, fw - 2, 1, 'wood1');
  }
  // hedgerows and a road
  for (let x = 0; x < W; x += 3) {
    const y = 300 + Math.sin(x * 0.008) * 60;
    rect(g, x, y, 3, 5, 'sand');
    rect(g, x, y + 5, 3, 1, 'wood1');
  }
  // the river, and how wide it has decided to be
  const swell = Ease.inOutCubic(u);
  const rivY = (x) => 190 + Math.sin(x * 0.006 + 1.2) * 70 + Math.sin(x * 0.017) * 18;
  const rivW = (x) => 10 + swell * 250 + Math.sin(x * 0.01 + t * 0.4) * (6 + swell * 30);
  for (let x = 0; x < W; x += 2) {
    const cy = rivY(x), wd = rivW(x);
    rect(g, x, cy - wd / 2, 2, wd, 'water1');
    rect(g, x, cy - wd / 2, 2, 3, 'water2');
    rect(g, x, cy + wd / 2 - 3, 2, 3, 'water0');
    // the flooded fringe: field the water is standing in, not yet river
    if (swell > 0.15) {
      rect(g, x, cy - wd / 2 - 6, 2, 6, mix(P.water0, P.moss, 0.45));
      rect(g, x, cy + wd / 2, 2, 5, mix(P.water0, P.wood1, 0.4));
    }
  }
  // current: long dashes down the length of it
  for (let i = 0; i < 90; i++) {
    const x = h(i) * W;
    const cy = rivY(x) + (h(i * 3) - 0.5) * rivW(x) * 0.7;
    const len = 20 + h(i * 5) * 70;
    rect(g, (x + t * 26) % W, cy, len, 2, h(i * 7) > 0.7 ? 'water3' : 'water2');
  }
  // the village, drowning where it stands
  const vy = 250;
  for (let i = 0; i < 30; i++) {
    const bx = Math.round(300 + h(i) * 330), by = Math.round(vy + h(i * 3) * 110);
    const bw = 14 + Math.floor(h(i * 5) * 14), bh = 12 + Math.floor(h(i * 7) * 10);
    const under = by - 10 < rivY(bx) + rivW(bx) / 2 && by + 10 > rivY(bx) - rivW(bx) / 2;
    // seen from above, a house is a roof: two pitches with a ridge down the middle
    const rc = under ? mix(P.red0, P.water0, 0.6) : 'red0';
    rect(g, bx, by, bw, bh, under ? mix(P.rust, P.water0, 0.55) : 'rust');
    rect(g, bx, by, bw, Math.floor(bh / 2), rc);
    rect(g, bx, by + Math.floor(bh / 2) - 1, bw, 2, under ? 'water0' : 'sand');
    rect(g, bx, by, bw, 1, 'ink'); rect(g, bx, by + bh - 1, bw, 1, 'ink');
    if (!under) rect(g, bx + bw - 4, by + 2, 3, 4, 'wood0');    // a chimney at the gable
  }
  // a mill and its pond, so the scale of the valley is unmistakable
  ellipse(g, 596, 322, 26, 16, 'water0');
  ellipse(g, 596, 320, 20, 11, 'water1');
  disc(g, 556, 306, 15, 'bone');
  disc(g, 556, 306, 11, 'grey2');
  disc(g, 556, 306, 4, 'wood0');
  for (let i = 0; i < 4; i++) {
    const a = t * 0.6 + (i / 4) * Math.PI * 2;
    const ex = 556 + Math.cos(a) * 26, ey = 306 + Math.sin(a) * 26;
    line(g, 556, 306, ex, ey, 'wood0');
    rect(g, ex - 3, ey - 3, 6, 6, 'wood1');
  }
  // cloud shadows crossing the whole valley
  g.globalAlpha = 0.14;
  for (let i = 0; i < 5; i++) {
    const sx = ((h(i) * W) + t * 12 + u * 120) % (W + 400) - 200;
    ellipse(g, sx, 60 + h(i * 3) * 400, 150 + h(i) * 90, 90 + h(i * 5) * 70, 'ink');
  }
  g.globalAlpha = 1;
  // rain, from above: dots on the water rather than streaks in the air
  for (let i = 0; i < 120; i++) {
    const x = h(i * 11) * W, y = h(i * 13) * H;
    const cy = rivY(x);
    if (Math.abs(y - cy) < rivW(x) / 2) px(g, x, y + Math.floor(t * 9) % 3, 'water3');
  }
}

// SHOT 3 -- wide, low angle, from the water. The wall arrives.
function floodWall(g, u, t) {
  const hz = 300;
  vBand(g, 0, hz, ['ink', 'night', 'water0', 'water1']);
  rain(g, 200, t, 'water3', 3);
  // the hills it is about to eat
  ridge(g, hz + 2, 62, 4.4, mix(P.shadow, P.night, 0.5), 'wood0');
  village(g, hz - 4, 20, 420, 9, 'ink', 'amber');
  waterRows(g, hz, H, t, ['water2', 'water1', 'water0', 'deep']);

  // THE WAVE. It has a FACE that overhangs and a BACK that slopes away to the horizon,
  // and every row is clipped between the two. The first version filled everything to the
  // right of the face, which drew a teal rectangle over half the sky: a wave needs a
  // silhouette on both sides or it is just a colour.
  const march = Ease.inOutCubic(u);
  const crestX = Math.round(lerp(W + 200, 330, march));
  const crestY = Math.round(lerp(230, 66, march));
  const over = 130 + march * 120;
  const backSpan = Math.max(60, hz + 50 - crestY);
  const faceX = (y) => crestX + Math.pow(clamp((y - crestY) / (H - crestY), 0, 1), 0.55) * over;
  const backX = (y) => crestX + 46 + (W - crestX) * Math.pow(clamp((y - crestY) / backSpan, 0, 1), 1.45);

  for (let y = crestY; y < H; y++) {
    const f = (y - crestY) / (H - crestY);
    const x0 = Math.round(faceX(y));
    const x1 = y > crestY + backSpan ? W + 40 : Math.round(backX(y));
    if (x1 <= x0) continue;
    // A NIGHT WAVE IS A DARK MASS. The sea it is crossing is lit by the last of the sky,
    // so the only way the front reads is if the wave itself is much darker than the water,
    // with the light coming through the top eight percent of it and nowhere else.
    const c = f < 0.05 ? 'foam'
      : f < 0.13 ? mix(P.water3, P.foam, 0.4)
        : f < 0.26 ? mix(P.water1, P.water2, 0.5)
          : f < 0.5 ? mix(P.water0, P.night, 0.4) : mix(P.ink, P.deep, 0.45 - f * 0.2);
    rect(g, x0, y, x1 - x0, 1, c);
    rect(g, x0 - 3, y, 4, 1, 'ink');                   // the face's own outline
    rect(g, x0 + 1, y, 3, 1, f < 0.32 ? 'foam' : 'water2');
    // foam riding the back edge, while the back is still inside the frame
    if (x1 < W + 40) {
      rect(g, x1 - 7, y, 8, 1, f < 0.5 ? 'foam' : 'water3');
      rect(g, x1, y, 3, 1, 'ink');
    }
  }
  // streaks that follow the curve: each one steps right as it goes down
  for (let i = 0; i < 70; i++) {
    const y0 = crestY + 16 + h(i) * (H - crestY) * 0.85;
    const len = 20 + h(i * 3) * 80;
    const rows = 2 + Math.floor(h(i * 7) * 3);
    const c = h(i * 11) > 0.6 ? 'water2' : mix(P.water0, P.water1, 0.5);
    for (let r = 0; r < rows; r++) {
      const x = faceX(y0 + r) + 10 + h(i * 5) * 90 + r * 3;
      if (y0 + r > crestY + backSpan || x < backX(y0 + r) - len - 8) {
        rect(g, x, y0 + r, len, 1, c);
      }
    }
  }
  // the crest: a blunt cap of whitewater, curling forward and down over its own face
  for (let i = 0; i < 44; i++) {
    const f = i / 43;
    const cx = crestX + 44 - f * 92;
    const cy = crestY + 4 + f * f * 76;
    disc(g, cx, cy, 17 - f * 9, 'foam');
    disc(g, cx + 4, cy + 4, 10 - f * 6, 'white');
  }
  for (let i = 0; i < 16; i++) {
    px(g, crestX - 40 + h(i) * 120, crestY - 14 - h(i * 3) * 26, 'foam');
  }
  // and the froth where the face meets the sea
  for (let i = 0; i < 70; i++) {
    const y = H - h(i) * 150;
    disc(g, faceX(y) + (h(i * 3) - 0.2) * 90, y, 4 + h(i * 5) * 10, 'foam');
  }
  // spray thrown a long way ahead of it
  for (let i = 0; i < 150; i++) {
    const sx = crestX - h(i) * 420;
    const sy = crestY - 40 + h(i * 3) * 300 + Math.sin(t * 3 + i) * 6;
    px(g, sx, sy, h(i * 7) > 0.5 ? 'foam' : 'white');
  }
  // the ark, tiny, in front of the whole thing
  drawArkSmall(g, 220, 356 + Math.sin(t * 1.1) * 5, 1.6);
  // everything behind the wave is in its shadow
  wash(g, crestX - 20, 0, W - crestX + 60, H, 'ink', 0.16);
}

// SHOT 4 -- the waterline. Half the frame is over and half is under.
function floodUnder(g, u, t) {
  const line0 = Math.round(lerp(300, 150, Ease.inOutCubic(u)));
  vBand(g, 0, line0, ['shadow', 'deep', 'water0']);
  rain(g, 140, t, 'water3', 2);
  // over: the ark, close, riding it out
  drawArkSmall(g, 300, line0 + 6, 3.2);
  // under: the light shafts come down through the surface
  vBand(g, line0, H, ['water1', 'water0', 'deep', 'ink']);
  for (let i = 0; i < 9; i++) {
    const sx = 60 + i * 106 + Math.sin(t * 0.5 + i) * 8;
    g.globalAlpha = 0.1;
    tri(g, sx, line0, sx + 34, line0, sx + 90, H, 'foam');
    g.globalAlpha = 1;
  }
  rect(g, 0, line0, W, 3, 'foam');
  for (let x = 0; x < W; x += 7) {
    rect(g, x + Math.sin(x * 0.1 + t * 2) * 3, line0 - 2, 5, 2, 'white');
  }
  // the town, going under: a bell tower and roofs at the depth the line has reached
  const roofY = 330;
  drawTower(g, 690, roofY + 60, line0);
  for (let i = 0; i < 14; i++) {
    const bx = 40 + h(i) * 620, by = roofY + h(i * 3) * 130;
    const bw = 40 + h(i * 5) * 60;
    const deep = clamp((by - line0) / 200, 0, 1);
    const c = mix(P.rust, P.deep, 0.35 + deep * 0.5);
    tri(g, bx - 4, by, bx + bw + 4, by, bx + bw / 2, by - 26, c);
    rect(g, bx, by, bw, 60, mix(P.wood1, P.deep, 0.35 + deep * 0.5));
    rect(g, bx + bw / 2 - 4, by - 24, 8, 8, mix(P.amber, P.deep, deep * 0.8));
  }
  // debris and bubbles rising through it all
  for (let i = 0; i < 70; i++) {
    const bx = h(i) * W;
    const by = H - ((h(i * 3) * (H - line0)) + t * 40) % (H - line0);
    if (by < line0) continue;
    disc(g, bx, by, 1 + h(i * 7) * 2, 'foam');
  }
  for (let i = 0; i < 16; i++) {
    const dx = h(i * 5) * W, dy = line0 + 10 + h(i * 9) * 90 + Math.sin(t + i) * 4;
    rect(g, dx, dy, 14 + h(i) * 20, 3, 'wood1');
    rect(g, dx, dy, 14 + h(i) * 20, 1, 'wood2');
  }
  wash(g, 0, line0 + 120, W, H - line0, 'ink', 0.3);
}

/** The ark at any size, for the shots where scale is the whole point. */
function drawArkSmall(g, cx, cy, s) {
  const hw = Math.round(34 * s), hh = Math.round(11 * s);
  // hull: a proper sheer line, wider at the top than the bottom
  for (let i = 0; i < hh; i++) {
    const f = i / hh;
    const w = hw * 2 * (1 - f * 0.34);
    rect(g, cx - w / 2, cy - hh + i, w, 1, f < 0.2 ? 'wood3' : f < 0.6 ? 'wood2' : 'wood1');
  }
  rect(g, cx - hw, cy - hh, hw * 2, Math.max(1, s), 'wood4');       // gunwale
  // bow and stern posts
  rect(g, cx - hw - Math.round(2 * s), cy - hh - Math.round(5 * s), Math.round(3 * s), Math.round(7 * s), 'wood2');
  rect(g, cx + hw - Math.round(1 * s), cy - hh - Math.round(7 * s), Math.round(3 * s), Math.round(9 * s), 'wood2');
  // deckhouse + mast + sail
  rect(g, cx - Math.round(16 * s), cy - hh - Math.round(9 * s), Math.round(32 * s), Math.round(9 * s), 'wood1');
  rect(g, cx - Math.round(16 * s), cy - hh - Math.round(9 * s), Math.round(32 * s), Math.max(1, Math.round(2 * s)), 'wood3');
  rect(g, cx - Math.round(1 * s), cy - hh - Math.round(34 * s), Math.max(1, Math.round(2 * s)), Math.round(26 * s), 'wood2');
  for (let i = 0; i < Math.round(20 * s); i++) {
    const b = Math.round(Math.sin((i / (20 * s)) * Math.PI) * 9 * s) + 1;
    rect(g, cx - b, cy - hh - Math.round(32 * s) + i, b, 1, i % 6 < 3 ? 'white' : 'bone');
  }
  // and a light in the door, because that is where everybody is
  rect(g, cx + Math.round(8 * s), cy - hh - Math.round(6 * s), Math.max(1, Math.round(4 * s)), Math.max(1, Math.round(4 * s)), 'amber');
}

/** A bell tower, drowning. Bands go darker below the waterline. */
function drawTower(g, cx, baseY, waterY) {
  const w = 52;
  for (let y = baseY; y > baseY - 200; y -= 4) {
    const deep = clamp((y - waterY) / 220, 0, 1);
    const ww = w - (baseY - y) * 0.06;
    rect(g, cx - ww / 2, y - 4, ww, 4, mix(y % 8 === 0 ? P.stone1 : P.stone2, P.deep, 0.2 + deep * 0.55));
  }
  // the belfry, arches and all
  const ty = baseY - 200;
  rect(g, cx - 34, ty - 8, 68, 10, mix(P.stone3, P.deep, 0.25));
  for (let i = -1; i <= 1; i++) {
    rect(g, cx + i * 20 - 6, ty - 44, 12, 36, mix(P.ink, P.deep, 0.4));
    disc(g, cx + i * 20, ty - 44, 6, mix(P.ink, P.deep, 0.4));
  }
  rect(g, cx - 34, ty - 52, 68, 10, mix(P.stone2, P.deep, 0.3));
  tri(g, cx - 38, ty - 52, cx + 38, ty - 52, cx, ty - 104, mix(P.stone1, P.deep, 0.35));
  rect(g, cx - 1, ty - 118, 3, 16, 'stone3');
  disc(g, cx, ty - 30, 9, mix(P.brass1, P.deep, 0.3));       // the bell
}

export const FLOOD = {
  id: 'flood',
  dur: 13,
  shots: [
    {
      at: 0.00, id: 'drop', label: 'IT BEGINS WITH ONE DROP', draw: floodDrop,
      // one drop, and the frame flinches when it lands
      cam: [
        { at: 0, y: -16, zoom: 1.1 },
        { at: 0.34, y: -10, zoom: 1.12, ease: 'linear' },
        { at: 0.42, y: 6, zoom: 1.24, ease: 'snap' },
        { at: 1, y: 0, zoom: 1.04, ease: 'out' },
      ],
      hits: [[0.38, 9, 'white']],
    },
    {
      at: 0.30, id: 'valley', label: 'THE RIVERS CLIMB THEIR OWN BANKS', draw: floodValley,
      // a slow crane across the fields as the water takes them
      cam: [{ at: 0, x: 40, y: -20, zoom: 1.16 }, { at: 1, x: -30, y: 14, zoom: 1.04, ease: 'inout' }],
    },
    {
      at: 0.58, id: 'wall', label: 'AND THE SEA STANDS UP', draw: floodWall,
      cam: [
        { at: 0, y: 20, zoom: 1.02 },
        { at: 0.46, y: 10, zoom: 1.06, ease: 'linear' },
        { at: 0.56, y: -30, zoom: 1.26, ease: 'snap' },
        { at: 1, y: -10, zoom: 1.08, ease: 'out' },
      ],
      hits: [[0.52, 14, 'white'], [0.7, 7, null]],
    },
    {
      at: 0.82, id: 'under', label: 'EVERYTHING FLOATS, OR IT DOES NOT', draw: floodUnder,
      cam: [{ at: 0, y: -26, zoom: 1.12 }, { at: 1, y: 20, zoom: 1.02, ease: 'out' }],
      hits: [[0.1, 6, null]],
    },
  ],
};

/* -------------------------------------------------------------------- FORGE */

// SHOT 1 -- low and close on the riverbank, where the clay comes from.
//
// This shot used to be two hands working a lump, and hands at this scale are a puzzle of
// overlapping tapers that reads as a glove full of sticks. The bank says the same thing
// better: a scoop out of the strata, a barrow heaped with it, a shovel still standing in
// the hole, and the river that laid it all down going quietly past.
function forgeBank(g, u, t) {
  const far = 128, near = 250;
  // the far bank, and the river between
  vBand(g, 0, far, ['ink', 'shadow', 'wood0']);
  ridge(g, far + 4, 34, 6.2, 'ink', 'wood1');
  for (let i = 0; i < 60; i++) {                     // reeds on the far side
    const rx = h(i) * W, rh = 12 + h(i * 3) * 26;
    const sway = Math.sin(t * 1.2 + i) * 3;
    line(g, rx, far, rx + sway, far - rh, 'wood0');
    line(g, rx + 1, far, rx + 1 + sway, far - rh, 'bark');
  }
  waterRows(g, far, near, t, ['water1', 'water0', 'deep', 'shadow']);
  for (let i = 0; i < 26; i++) {                     // rain rings on the water
    const p = (h(i * 3) + t * 0.4) % 1;
    const ry = far + 8 + h(i) * (near - far - 16);
    rippleRing(g, h(i * 7) * W, ry, 6 + p * 34, (6 + p * 34) * 0.24, 'water1', 'water2');
  }
  rain(g, 90, t, 'water3', 1);

  // THE BANK: strata, cut through
  const strata = ['clay1', 'clay0', 'clay2', 'clay1', 'clay3', 'clay0', 'clay2'];
  for (let y = near; y < H; y++) {
    const f = (y - near) / (H - near);
    const band = strata[Math.min(strata.length - 1, Math.floor(f * strata.length))];
    rect(g, 0, y, W, 1, band);
    if ((y - near) % 26 < 2) rect(g, 0, y, W, 2, 'clay0');       // a seam between beds
  }
  rect(g, 0, near, W, 3, 'clay4');                                // the wet lip
  // pebbles and grit through the beds
  for (let i = 0; i < 220; i++) {
    const gx = h(i) * W, gy = near + 6 + h(i * 3) * (H - near - 12);
    rect(g, gx, gy, 2 + h(i * 5) * 5, 2 + h(i * 7) * 3, h(i * 11) > 0.5 ? 'stone1' : 'clay3');
  }

  // the scoop: a hollow that DEEPENS as the shot runs
  const dig = Ease.outCubic(u);
  const hx = 380, hy = 352;
  const hw = 190 + dig * 60, hh = 74 + dig * 26;
  ellipse(g, hx, hy, hw, hh, 'clay0');
  ellipse(g, hx, hy - 6, hw * 0.9, hh * 0.82, mix(P.clay0, P.ink, 0.45));
  ellipse(g, hx - 20, hy + 10, hw * 0.6, hh * 0.5, mix(P.ink, P.clay0, 0.3));
  for (let i = 0; i < 40; i++) {                     // the torn lip of the hollow
    const a = Math.PI + (i / 40) * Math.PI;
    disc(g, hx + Math.cos(a) * hw, hy + Math.sin(a) * hh, 6 + h(i) * 9, 'clay2');
  }
  // water pooling in the bottom of it
  ellipse(g, hx - 10, hy + hh * 0.5, hw * 0.5, hh * 0.22, 'water0');
  ellipse(g, hx - 10, hy + hh * 0.5 - 1, hw * 0.42, hh * 0.15, 'water1');

  // a shovel, still standing in the cut
  const sx = 620, sy = 300;
  rect(g, sx, sy - 150, 8, 154, 'wood2');
  rect(g, sx, sy - 150, 3, 154, 'wood3');
  rect(g, sx - 8, sy - 168, 24, 20, 'wood2');
  rect(g, sx - 8, sy - 168, 24, 5, 'wood3');
  rect(g, sx - 22, sy - 6, 52, 46, 'grey1');
  rect(g, sx - 22, sy - 6, 52, 6, 'grey2');
  tri(g, sx - 22, sy + 40, sx + 30, sy + 40, sx + 4, sy + 62, 'grey1');
  for (let i = 0; i < 10; i++) px(g, sx - 18 + h(i) * 44, sy + 6 + h(i * 3) * 30, 'clay1');

  // the barrow, heaped, in the near corner
  const bx = 790, by = H - 70;
  for (let i = 0; i < 30; i++) {                     // the heap
    const a = (i / 30) * Math.PI;
    const px0 = bx - 90 + Math.cos(a) * 84, py0 = by - 44 - Math.sin(a) * 36;
    disc(g, px0, py0, 30 + h(i) * 10, 'clay1');
    disc(g, px0 - 6, py0 - 8, 16 + h(i * 3) * 8, 'clay2');
  }
  for (let i = 0; i < 10; i++) {
    disc(g, bx - 150 + h(i) * 130, by - 78 - h(i * 3) * 14, 8 + h(i * 5) * 7, 'clay3');
  }
  rect(g, bx - 180, by - 46, 190, 44, 'wood1');
  rect(g, bx - 180, by - 46, 190, 5, 'wood3');
  rect(g, bx - 180, by - 6, 190, 6, 'wood0');
  rect(g, bx - 10, by - 60, 14, 60, 'wood2');
  rect(g, bx - 196, by - 62, 200, 8, 'wood2');       // the handles
  disc(g, bx - 150, by + 6, 26, 'wood0');            // the wheel
  disc(g, bx - 150, by + 6, 18, 'wood2');
  disc(g, bx - 150, by + 6, 6, 'wood0');

  // footprints filled with water, coming out of the hollow towards us
  for (let i = 0; i < 7; i++) {
    const fx = hx + 40 + i * 62 + (i % 2) * 22;
    const fy = hy + 90 + i * 22;
    if (fy > H - 10) break;
    ellipse(g, fx, fy, 20, 10, 'clay0');
    ellipse(g, fx, fy - 1, 15, 6, 'water0');
  }
  // lantern light from the right, and the rain going through it
  g.globalAlpha = 0.02;
  for (let i = 16; i >= 1; i--) ellipse(g, W - 90, 250, 44 * i, 34 * i, 'amber');
  g.globalAlpha = 1;
}

// SHOT 2 -- mid shot, the workshop. An armature with a body packed onto it.
function forgeFrame(g, u, t) {
  vBand(g, 0, H, ['ink', 'shadow', 'wood0']);
  // the shed: a wall of boards, a window with the storm in it
  for (let x = 0; x < W; x += 26) {
    rect(g, x, 0, 24, 400, mix(P.wood0, P.wood1, h(x) * 0.5));
    rect(g, x, 0, 2, 400, 'ink');
  }
  rect(g, 82, 54, 168, 132, 'wood0');
  vBand2(g, 88, 60, 156, 120, ['deep', 'water0']);
  rain(g, 40, t, 'water3', 2);
  rect(g, 82 + 80, 54, 6, 132, 'wood0');
  rect(g, 82, 54 + 63, 168, 6, 'wood0');
  rect(g, 76, 48, 180, 8, 'wood2');
  // tools on the wall, each recognisably itself
  drawTool(g, 700, 62, 'hammer');
  drawTool(g, 772, 58, 'saw');
  drawTool(g, 848, 64, 'trowel');
  drawTool(g, 906, 60, 'coil');
  // the floor
  rect(g, 0, 400, W, H - 400, 'wood1');
  rect(g, 0, 400, W, 3, 'wood2');
  for (let x = 0; x < W; x += 34) rect(g, x, 403, 2, H - 403, 'wood0');
  // the lantern, and the pool of light it makes
  const lx = 300, ly = 150;
  g.globalAlpha = 0.03;
  for (let i = 12; i >= 1; i--) ellipse(g, lx, ly + 40, 46 * i, 40 * i, 'amber');
  g.globalAlpha = 1;
  rect(g, lx - 14, ly, 28, 36, 'brass1');
  rect(g, lx - 10, ly + 4, 20, 28, 'amber');
  rect(g, lx - 6, ly + 11, 12, 16, 'gold');
  rect(g, lx - 17, ly - 6, 34, 7, 'brass2');
  rect(g, lx - 2, ly - 34, 4, 28, 'wood0');

  // THE FIGURE. A profile function, not a smooth curve: the first version tapered from
  // the feet to the head in one sweep and came out as a striped vase.
  const ax = 540, base = 476, top = base - 330;
  const prof = (f) => (
    f < 0.16 ? 40                                   // feet
      : f < 0.44 ? lerp(48, 62, (f - 0.16) / 0.28)  // legs
        : f < 0.54 ? 78                             // hips
          : f < 0.80 ? lerp(84, 96, (f - 0.54) / 0.26) // chest
            : f < 0.90 ? 104                        // shoulders
              : 34                                  // neck
  );
  // the armature, visible wherever the clay has not reached
  rect(g, ax - 5, top - 30, 10, base - top + 30, 'bark');
  for (let i = 0; i < 8; i++) {
    const ry = top + 30 + i * 30;
    const rw = prof((base - ry) / (base - top)) * 0.9;
    rect(g, ax - rw, ry, rw * 2, 5, 'bark');
    px(g, ax - rw, ry + 1, 'wood3'); px(g, ax + rw - 1, ry + 1, 'wood3');
  }
  rect(g, ax - 74, top + 40, 148, 7, 'bark');            // the shoulder bar
  rect(g, ax - 110, base - 6, 220, 10, 'wood0');         // the plinth
  rect(g, ax - 110, base - 6, 220, 3, 'wood2');
  rect(g, ax - 8, top - 40, 16, 16, 'wood3');            // the peg the head will go on

  // the clay, packed on from the feet up
  const fill = Ease.outCubic(u);
  const wet = base - fill * (base - top);
  // Shading runs DOWN the body, not across it: banding the rows light/dark by height
  // turns a torso into a stack of tyres. Lit on the lamp side, dark on the other, with a
  // coil seam every so often to say how it was built.
  for (let y = base - 6; y > wet; y -= 2) {
    const f = (base - y) / (base - top);
    const w = prof(f) + (h(Math.floor(y / 8)) - 0.5) * 5;
    rect(g, ax - w, y - 2, w * 2, 2, 'clay2');
    rect(g, ax - w, y - 2, Math.max(4, w * 0.3), 2, 'clay3');
    rect(g, ax - w, y - 2, 3, 2, 'clay4');
    rect(g, ax + w * 0.34, y - 2, Math.max(4, w * 0.66), 2, 'clay1');
    rect(g, ax + w - Math.max(3, w * 0.18), y - 2, Math.max(3, w * 0.18), 2, 'clay0');
    if (Math.floor(y / 2) % 17 === 0) rect(g, ax - w + 4, y - 2, w * 2 - 8, 2, 'clay0');
    // the gap between the legs, while we are still below the hips
    if (f < 0.42) rect(g, ax - 8, y - 2, 16, 2, mix(P.ink, P.clay0, 0.4));
  }
  // arms, once there are shoulders to hang them from
  if (fill > 0.78) {
    const ak = clamp((fill - 0.78) / 0.22, 0, 1);
    for (const side of [-1, 1]) {
      const sxx = ax + side * 88, syy = top + 52;
      taper(g, sxx, syy, sxx + side * 26, syy + 150 * ak, 46, 34, 'clay2', 'clay3', 'clay0');
      if (ak > 0.9) disc(g, sxx + side * 26, syy + 150, 19, 'clay1');
    }
  }
  // the rough wet edge where the work has got to
  for (let i = 0; i < 26; i++) {
    const w = prof((base - wet) / (base - top));
    disc(g, ax - w + h(i) * w * 2, wet + h(i * 3) * 8, 5 + h(i * 5) * 8, 'clay2');
  }
  // handfuls still going on
  for (let i = 0; i < 12; i++) {
    const hx2 = ax + (h(i) - 0.5) * 240, hy2 = wet - 30 + h(i * 3) * 40;
    disc(g, hx2, hy2, 6 + h(i * 5) * 8, 'clay1');
    disc(g, hx2 - 2, hy2 - 3, 4 + h(i * 7) * 5, 'clay2');
  }

  // Noah, up a ladder, with a trowel
  const ldx = 726;
  rect(g, ldx, base - 340, 8, 344, 'wood1');
  rect(g, ldx + 62, base - 340, 8, 344, 'wood1');
  for (let i = 0; i < 10; i++) rect(g, ldx, base - 30 - i * 34, 70, 7, 'wood2');
  const reach = Math.sin(t * 1.8) * 9;
  rect(g, ldx + 14, base - 262, 40, 92, 'cloth1');        // robe
  rect(g, ldx + 14, base - 262, 40, 9, 'cloth2');
  rect(g, ldx + 14, base - 180, 40, 10, 'cloth0');
  disc(g, ldx + 34, base - 276, 16, 'skin2');             // head
  rect(g, ldx + 18, base - 292, 32, 10, 'bone');          // hair
  rect(g, ldx + 22, base - 266, 16, 20, 'bone');          // beard
  taper(g, ldx + 18, base - 250, ax + 92 + reach, wet + 20, 12, 9, 'skin2', 'skin4', 'skin0');
  rect(g, ax + 86 + reach, wet + 14, 20, 6, 'grey2');     // the trowel
  rect(g, ax + 86 + reach, wet + 14, 20, 2, 'grey0');

  // a tub of river clay at the foot of it
  rect(g, 386, base - 52, 68, 52, 'wood2');
  rect(g, 386, base - 52, 68, 5, 'wood3');
  rect(g, 382, base - 34, 76, 5, 'grey1');
  ellipse(g, 420, base - 52, 34, 9, 'clay1');
  ellipse(g, 414, base - 54, 22, 6, 'clay2');
}

/** Tools on a wall. Each one is a handle plus the thing that does the work. */
function drawTool(g, x, y, kind) {
  rect(g, x, y, 4, 6, 'grey0');                            // the nail
  if (kind === 'hammer') {
    rect(g, x - 1, y + 6, 7, 66, 'wood2');
    rect(g, x - 1, y + 6, 3, 66, 'wood3');
    rect(g, x - 18, y + 66, 40, 18, 'grey1');
    rect(g, x - 18, y + 66, 40, 5, 'grey2');
    rect(g, x + 14, y + 62, 10, 26, 'grey1');
  } else if (kind === 'saw') {
    rect(g, x - 2, y + 6, 9, 26, 'wood2');
    rect(g, x - 22, y + 30, 54, 12, 'grey2');
    rect(g, x - 22, y + 30, 54, 3, 'white');
    for (let i = 0; i < 13; i++) tri(g, x - 22 + i * 4, y + 42, x - 18 + i * 4, y + 42, x - 20 + i * 4, y + 48, 'grey2');
  } else if (kind === 'trowel') {
    rect(g, x - 1, y + 6, 7, 30, 'wood2');
    tri(g, x - 14, y + 36, x + 18, y + 36, x + 2, y + 78, 'grey1');
    tri(g, x - 10, y + 38, x + 14, y + 38, x + 2, y + 68, 'grey2');
  } else {
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2;
      disc(g, x + 2 + Math.cos(a) * 17, y + 28 + Math.sin(a) * 17, 3, 'brass1');
    }
  }
}

/** A banded gradient inside a rect, for the window. */
function vBand2(g, x, y, w, hgt, keys) {
  const n = keys.length - 1;
  for (let j = 0; j < hgt; j++) {
    const f = (j / Math.max(1, hgt - 1)) * n;
    const s = Math.min(n - 1, Math.floor(f));
    rect(g, x, y + j, w, 1, mix(P[keys[s]], P[keys[s + 1]], f - s));
  }
}

// SHOT 3 -- close on the brow. Three strikes, and a word that stays lit.
function forgeWord(g, u, t) {
  vBand(g, 0, H, ['ink', 'shadow', 'wood0']);
  for (let i = 8; i >= 0; i--) wash(g, W / 2 - 60 * i, -40, 120 * i, 200 * i, 'amber', 0.025);
  // the head, from the eyebrows up, filling the frame
  const cx = W / 2, brow = 400;
  ellipse(g, cx, brow - 40, 300, 210, 'clay1');
  ellipse(g, cx - 40, brow - 90, 250, 160, 'clay2');
  ellipse(g, cx - 90, brow - 130, 140, 80, 'clay3');
  // the crown of the head is rough, unsmoothed clay
  for (let i = 0; i < 90; i++) {
    const a = Math.PI + (i / 90) * Math.PI;
    const rr = 200 + h(i) * 22;
    disc(g, cx + Math.cos(a) * rr * 1.4, brow - 40 + Math.sin(a) * rr * 0.95, 6 + h(i * 3) * 9, 'clay1');
  }
  // the brow ridge: it follows the skull, so it is a CURVE, not a plank across the frame
  for (let dx = -300; dx <= 300; dx += 2) {
    const f = dx / 300;
    const yy = brow + Math.round(f * f * 34);
    rect(g, cx + dx, yy, 2, 30, 'clay0');
    rect(g, cx + dx, yy, 2, 6, 'clay2');
    rect(g, cx + dx, yy + 30, 2, H - yy - 30, 'shadow');
  }
  rect(g, 0, brow + 34, cx - 300, H - brow - 34, 'shadow');
  rect(g, cx + 300, brow + 34, W, H - brow - 34, 'shadow');
  // three marks, cut one at a time
  const hits = [0.18, 0.48, 0.78];
  for (let i = 0; i < 3; i++) {
    const k = clamp((u - hits[i]) / 0.14, 0, 1);
    if (k <= 0) continue;
    const mx = cx - 150 + i * 150;
    drawMark(g, mx, brow - 150, i, k);
  }
  // the chisel and mallet, coming in on whichever mark is live
  const live = hits.findIndex((hh, i) => u >= hh && (i === 2 || u < hits[i + 1]));
  if (live >= 0) {
    const k = clamp((u - hits[live]) / 0.14, 0, 1);
    const mx = cx - 150 + live * 150;
    const back = Math.max(0, 1 - k * 3);
    const cxx = mx + 60 + back * 90, cyy = brow - 230 - back * 90;
    rect(g, cxx, cyy, 16, 120, 'grey2');                    // chisel
    rect(g, cxx, cyy, 5, 120, 'white');
    rect(g, cxx - 3, cyy + 110, 22, 14, 'grey1');
    rect(g, cxx - 10, cyy - 60, 36, 60, 'wood2');           // mallet head
    rect(g, cxx - 10, cyy - 60, 36, 6, 'wood3');
    // chips and sparks on the hit
    if (k < 0.5) {
      for (let i = 0; i < 20; i++) {
        const a = -Math.PI / 2 + (h(i) - 0.5) * 3;
        const d = k * 130 + h(i * 3) * 30;
        px(g, mx + Math.cos(a) * d, brow - 150 + Math.sin(a) * d, h(i * 5) > 0.5 ? 'gold' : 'clay3');
      }
    }
  }
  // the light of the finished word washing back over the clay
  const lit = clamp((u - 0.78) / 0.22, 0, 1);
  if (lit > 0) {
    for (let i = 6; i >= 0; i--) {
      wash(g, cx - 260 - 30 * i, brow - 230 - 20 * i, 520 + 60 * i, 160 + 40 * i, 'gold', 0.04 * lit);
    }
  }
}

/**
 * One of the three marks of the word. A carved trench first, then light in the trench.
 *
 * They are deliberately NOT Latin letters -- the first pass spelled out shapes that read
 * as "I F T", which turns a divine word into a label. These are three strokes each, one
 * of them diagonal, which is enough to read as writing and not enough to read as English.
 */
const MARKS = [
  [[-26, -42, 22, 34], [22, -42, 6, -8], [-8, 6, 24, 34]],
  [[-24, -42, -24, 34], [-24, -42, 24, -42], [24, -42, 24, 8]],
  [[-24, -42, 24, -42], [-2, -42, -2, 34], [-24, 34, -24, 10]],
];

function drawMark(g, x, y, which, k) {
  const strokes = MARKS[which % MARKS.length];
  // TWO PASSES. Carve the whole mark first, then light it: interleaving them let each
  // step's trench paint over the previous step's glow, and the word came out as a row of
  // sparks instead of a lit line.
  for (let pass = 0; pass < 2; pass++) {
    if (pass === 1 && k <= 0.4) break;
    const gk = (k - 0.4) / 0.6;
    for (const [x0, y0, x1, y1] of strokes) {
      const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 2));
      for (let i = 0; i <= n; i++) {
        const f = i / n;
        const cx = x + lerp(x0, x1, f), cy = y + lerp(y0, y1, f);
        if (pass === 0) {
          rect(g, cx - 8, cy - 8, 16, 16, 'ink');
          rect(g, cx - 8, cy - 8, 16, 3, 'clay0');
        } else {
          rect(g, cx - 5, cy - 5, 10, 10, mix(P.orange, P.gold, gk));
          rect(g, cx - 3, cy - 3, 6, 6, 'cream');
        }
      }
    }
  }
}

// SHOT 4 -- worm's eye. It stands up, and we are looking at it from the floor.
function forgeStand(g, u, t) {
  vBand(g, 0, H, ['night', 'shadow', 'wood0', 'wood1']);
  // rafters overhead, converging, because we are on our back looking up at them
  rect(g, 0, 0, W, 26, 'ink');
  for (let i = -3; i <= 3; i++) {
    const x0 = W / 2 + i * 150, x1 = W / 2 + i * 42;
    const n = 90;
    for (let j = 0; j <= n; j++) {
      const f = j / n;
      rect(g, lerp(x0, x1, f) - 9 + f * 4, 26 + f * 150, 18 - f * 9, 3, mix(P.wood0, P.ink, 0.2 + f * 0.5));
    }
  }
  for (let i = 0; i < 3; i++) {
    const ry = 30 + i * 52;
    rect(g, 0, ry, W, 9 - i * 2, mix(P.wood0, P.ink, 0.35 + i * 0.18));
    rect(g, 0, ry, W, 2, mix(P.wood1, P.ink, 0.3 + i * 0.2));
  }
  const rise = Ease.outCubic(u);
  // the figure, foreshortened: feet enormous at the bottom, head small at the top
  const footY = H + 40 - rise * 30;
  const headY = lerp(300, 96, rise);
  const cx = W / 2 + 20;
  // legs -- two tapering columns
  for (const side of [-1, 1]) {
    for (let s = 0; s < 22; s++) {
      const k = s / 21;
      const yy = lerp(footY, headY + 210, k);
      const wd = lerp(150, 54, k);
      const off = side * lerp(120, 26, k);
      rect(g, cx + off - wd / 2, yy - 12, wd, 16, k < 0.1 ? 'clay0' : 'clay2');
      rect(g, cx + off - wd / 2, yy - 12, wd * 0.26, 16, 'clay3');
      rect(g, cx + off + wd * 0.3, yy - 12, wd * 0.2, 16, 'clay1');
      rect(g, cx + off + wd / 2 - wd * 0.14, yy - 12, wd * 0.14, 16, 'clay0');
    }
  }
  // torso
  for (let s = 0; s < 20; s++) {
    const k = s / 19;
    const yy = lerp(headY + 210, headY + 54, k);
    const wd = lerp(230, 150, k);
    rect(g, cx - wd / 2, yy - 10, wd, 14, 'clay2');
    rect(g, cx - wd / 2, yy - 10, wd * 0.24, 14, 'clay3');
    rect(g, cx - wd / 2, yy - 10, 4, 14, 'clay4');
    rect(g, cx + wd * 0.22, yy - 10, wd * 0.2, 14, 'clay1');
    rect(g, cx + wd / 2 - wd * 0.14, yy - 10, wd * 0.14, 14, 'clay0');
  }
  // arms, hanging and swinging in
  for (const side of [-1, 1]) {
    for (let s = 0; s < 14; s++) {
      const k = s / 13;
      const yy = lerp(headY + 250, headY + 70, k);
      const wd = lerp(46, 66, k);
      const off = side * (lerp(150, 96, k) + Math.sin(t * 1.2 + side) * 4);
      rect(g, cx + off - wd / 2, yy - 10, wd, 14, 'clay2');
      rect(g, cx + off - wd / 2, yy - 10, wd * 0.28, 14, 'clay3');
      rect(g, cx + off + wd / 2 - wd * 0.2, yy - 10, wd * 0.2, 14, 'clay0');
    }
  }
  // the head, small and far away, and the word on it
  disc(g, cx, headY, 46, 'clay1');
  disc(g, cx - 10, headY - 10, 32, 'clay2');
  rect(g, cx - 34, headY + 10, 68, 12, 'clay0');
  for (let i = 0; i < 3; i++) {
    rect(g, cx - 24 + i * 18, headY - 24, 12, 16, 'ink');
    rect(g, cx - 22 + i * 18, headY - 22, 8, 12, 'gold');
  }
  for (const ex of [-18, 18]) {
    rect(g, cx + ex - 7, headY + 2, 14, 8, 'ink');
    rect(g, cx + ex - 5, headY + 4, 10, 4, 'orange');
  }
  // the light it throws on the rafters and the floor
  for (let i = 7; i >= 0; i--) {
    wash(g, cx - 60 * i, headY - 40 * i, 120 * i, 120 * i, 'orange', 0.022 * (0.6 + rise * 0.4));
  }
  // dust off the floor as it comes up
  for (let i = 0; i < 110; i++) {
    const dx = h(i) * W;
    const dy = H - ((h(i * 3) * 260) + t * 60 + rise * 120) % 300;
    px(g, dx, dy, h(i * 7) > 0.55 ? 'sand' : 'clay1');
  }
  // and the tools in the foreground, out of focus by being flat black
  rect(g, -20, H - 70, 260, 90, 'ink');
  rect(g, W - 190, H - 96, 240, 120, 'ink');
  rect(g, 40, H - 92, 90, 26, 'ink');
  disc(g, 700, H - 74, 40, 'ink');
}

export const FORGE = {
  id: 'forge',
  dur: 13.5,
  shots: [
    {
      at: 0.00, id: 'bank', label: 'A HUNDREDWEIGHT OF RIVER CLAY', draw: forgeBank,
      cam: [{ at: 0, x: -24, zoom: 1.08 }, { at: 1, x: 16, zoom: 1.02, ease: 'inout' }],
    },
    {
      at: 0.28, id: 'frame', label: 'PACKED ONTO A FRAME OF RIBS', draw: forgeFrame,
      cam: [{ at: 0, y: 24, zoom: 1.14 }, { at: 1, y: -18, zoom: 1.04, ease: 'inout' }],
    },
    {
      at: 0.56, id: 'word', label: 'AND A WORD DRIVEN IN', draw: forgeWord,
      // the chisel goes in, and the frame goes with it
      cam: [
        { at: 0, zoom: 1.1, y: 10 },
        { at: 0.4, zoom: 1.14, y: 8, ease: 'linear' },
        { at: 0.48, zoom: 1.36, y: 16, ease: 'snap' },
        { at: 1, zoom: 1.06, y: 0, ease: 'out' },
      ],
      hits: [[0.44, 13, 'white'], [0.66, 6, null]],
    },
    {
      at: 0.82, id: 'stand', label: 'IT STANDS UP', draw: forgeStand,
      // and the last shot of the reel is a pull back: it is bigger than you thought
      cam: [{ at: 0, y: 40, zoom: 1.3 }, { at: 1, y: -8, zoom: 1, ease: 'out' }],
      hits: [[0.08, 12, null], [0.4, 6, null]],
    },
  ],
};

/* ------------------------------------------------------------------- runner */

export const SEQUENCES = { wrath: WRATH, flood: FLOOD, forge: FORGE };

/**
 * THE SHARED KIT, for the reels that live in their own file.
 *
 * These are the parts every set-piece is built out of, and there are now more set-pieces
 * than fit in one file without it becoming a phone book. Exported as one object rather
 * than fifteen named exports so the next reel can pull the whole kit in one line.
 */
export const FX = {
  h, vBand, ridge, village, rays, fissure, lens, lensRows, rain, waterRows, rippleRing,
  cloudLid, taper, drawArkSmall, drawTower, drawMark,
};

const BAR = 38;              // letterbox bar height

export function shotIndex(seq, k) {
  let out = 0;
  for (let i = 0; i < seq.shots.length; i++) if (k >= seq.shots[i].at) out = i;
  return out;
}

/** Where the next cut is, in k. Clicking through the dialogue jumps to it. */
export function nextCut(seq, k) {
  for (const s of seq.shots) if (s.at > k + 1e-4) return s.at;
  return 1;
}

/**
 * drawSequence(g, seq, k, t, o)
 *   k — 0..1 through the whole sequence
 *   t — wall time, for motion that must not stop when k does
 *   o — { bars: false } to draw the picture with no letterbox
 * Returns the shot it drew, so the caller can fire audio and shake on a cut.
 */
export function drawSequence(g, seq, k, t, o = {}) {
  k = clamp(k, 0, 1);
  const i = shotIndex(seq, k);
  const sh = seq.shots[i];
  const nx = seq.shots[i + 1];
  const span = (nx ? nx.at : 1.0001) - sh.at;
  const u = clamp((k - sh.at) / span, 0, 1);

  /* THE CAMERA, and it is a PURE FUNCTION OF u.
   *
   * A shot can declare `cam` -- a short keyframe list of {at, x, y, zoom, roll} -- and `hits`,
   * a list of [at, magnitude, flashColour] for the moments something lands. Both are evaluated
   * from u alone and hold no state, which matters more than it sounds: the film scene rewinds,
   * re-renders and cuts, and a camera with a decaying timer inside it would drift out of step
   * with the picture it is supposed to be photographing. Same u, same frame, always.
   *
   * The transform is rounded to whole pixels and the zoom to whole eighths, because a
   * sub-pixel translate resamples every edge in a pixel-art frame: a mathematically smooth
   * push-in comes out as a shimmer.
   */
  let shakeX = 0, shakeY = 0, flashK = 0, flashCol = 'white';
  for (const hit of sh.hits || []) {
    const [at, mag, col] = hit;
    if (u < at) continue;
    const k = Math.max(0, 1 - (u - at) / 0.11);
    if (k <= 0) continue;
    const kk = k * k;
    shakeX += Math.sin((u - at) * 320) * (mag || 6) * kk;
    shakeY += Math.cos((u - at) * 271) * (mag || 6) * kk;
    if (col) {
      const fk = Math.max(0, 1 - (u - at) / 0.045);
      if (fk > flashK) { flashK = fk; flashCol = col; }
    }
  }
  g.save();
  if (sh.cam) {
    const c = camKeys({ x: 0, y: 0, zoom: 1, roll: 0 }, sh.cam, u);
    const z = Math.max(0.5, Math.round(c.zoom * 8) / 8);
    g.translate(Math.round(W / 2 + shakeX), Math.round(H / 2 + shakeY));
    if (c.roll) g.rotate(c.roll);
    g.scale(z, z);
    g.translate(Math.round(-W / 2 - c.x), Math.round(-H / 2 - c.y));
  } else if (shakeX || shakeY) {
    g.translate(Math.round(shakeX), Math.round(shakeY));
  }
  if (sh.drift) {
    g.translate(Math.round(sh.drift[0] * u), Math.round(sh.drift[1] * u));
  }
  sh.draw(g, u, t);
  g.restore();
  if (flashK > 0) wash(g, 0, 0, W, H, flashCol, flashK * 0.85);

  // vignette: the corners go down, which is most of what makes a frame look shot
  for (let j = 0; j < 5; j++) {
    const a = 0.05;
    wash(g, 0, 0, 30 + j * 26, H, 'ink', a);
    wash(g, W - 30 - j * 26, 0, 30 + j * 26, H, 'ink', a);
  }

  // the cut itself: two frames of black at the head of every shot but the first
  if (i > 0 && u < 0.035) wash(g, 0, 0, W, H, 'ink', 1 - u / 0.035);

  if (o.bars !== false) {
    rect(g, 0, 0, W, BAR, 'ink');
    rect(g, 0, H - BAR, W, BAR, 'ink');
    rect(g, 0, BAR, W, 1, 'wood0');
    rect(g, 0, H - BAR - 1, W, 1, 'wood0');
    // the caption lives ON the bar, never over the picture
    const a = Math.min(1, Math.min(u / 0.08, (1 - u) / 0.08));
    if (a > 0.02) {
      text(g, sh.label, 26, 14, 'brass3', { font: 7, alpha: a });
      const dots = seq.shots.length;
      for (let j = 0; j < dots; j++) {
        rect(g, W - 30 - (dots - 1 - j) * 14, 18, 9, 5, j === i ? 'cream' : j < i ? 'brass1' : 'wood0');
      }
    }
  }
  return sh;
}

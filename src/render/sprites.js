// Animals. Every one of them is a BALL.
//
// That is the design, not a shortcut. A sphere with two dot eyes is the most reliably
// cute shape in pixel art, it survives being drawn at sixteen pixels, and it is honest
// about the physics: these things roll around a level and bounce off rocks.
//
// What stops ninety balls being ninety marbles is that the species lives entirely in
// what BREAKS THE SILHOUETTE -- ears, horns, a tail, a wing, a shell, quills, a beak.
// Anything that stays inside the circle is invisible and does not count as a feature.
//
// The sprite is baked in three layers so it can move without re-baking:
//
//     BACK          tail, wing, shell, quills -- whatever sits BEHIND the ball
//     BODY[phase]   the shaded sphere and its pattern, at 8 rotations
//     FRONT[mood]   ears, eyes, nose -- everything that must stay upright
//
// Three, not two, because the first version folded the back features into the front
// layer and a sea turtle's shell ended up painted over its own face.
//
// The body spins as the animal rolls. The face never does, because a cute face that
// rotates away from the camera stops being cute. Wet sheen, water drips, rain hits and
// squash-on-impact are live pixels on top, so none of them costs a bake.
//
// Light is from the upper left throughout, in every sprite in the game.

import { P, col, mix } from '../core/palette.js';
import { makeCanvas, disc, ellipse, ellipseFrame, rect, px, line, tri, ring } from '../core/pixel.js';

export const SPRITE_SIZE = 32;
export const ICON_SIZE = 16;

const R = Math.round;

// --- geometry, in sprite-local pixels. The ball is centred and nearly fills the box.
const CX = 16;
const MIR = CX * 2;                       // mirror axis: x -> MIR - x

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

export const DEFAULT_RECIPE = {
  body: 'grey1', shade: 'grey0', light: 'grey2', belly: 'bone',
  eye: 'ink', eyeStyle: 'dot', ears: 'round', face: 'muzzle',
  pattern: 'none', patternColor: 'ink', extra: 'none',
};

/* ------------------------------------------------------------------- board */
// A recording wrapper over the bake context. `occ` marks anything drawn so the outline
// pass never paints over art; `core` marks only chunky art so the outline does not
// fatten 1px filaments (whiskers, antennae, quills) into black bars.

function makeBoard(w, h) {
  const mk = makeCanvas(w, h);
  const ctx = mk ? mk.g : null;
  const occ = new Uint8Array(w * h);
  const core = new Uint8Array(w * h);
  let fs = col('white');
  const b = {
    w, h, occ, core, canvas: mk ? mk.canvas : null, ctx, solid: true,
    get fillStyle() { return fs; },
    set fillStyle(v) { fs = v; if (ctx) ctx.fillStyle = v; },
    fillRect(x, y, ww, hh) {
      x = R(x); y = R(y); ww = R(ww); hh = R(hh);
      if (ww <= 0 || hh <= 0) return;
      if (ctx) ctx.fillRect(x, y, ww, hh);
      const x1 = Math.min(w, x + ww), y1 = Math.min(h, y + hh);
      const mark = b.solid;
      for (let j = Math.max(0, y); j < y1; j++) {
        for (let i = Math.max(0, x); i < x1; i++) {
          occ[j * w + i] = 1;
          if (mark) core[j * w + i] = 1;
        }
      }
    },
    save() { if (ctx) ctx.save(); },
    restore() { if (ctx) ctx.restore(); },
    beginPath() { if (ctx) ctx.beginPath(); },
    rect(x, y, ww, hh) { if (ctx) ctx.rect(x, y, ww, hh); },
    clip() { if (ctx) ctx.clip(); },
  };
  return b;
}

/** 1px silhouette outline — the single biggest legibility win on green felt. */
function outline(b, c) {
  const { w, h, occ, core } = b;
  const hits = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (occ[i]) continue;
      if ((x > 0 && core[i - 1]) || (x < w - 1 && core[i + 1])
        || (y > 0 && core[i - w]) || (y < h - 1 && core[i + w])) hits.push(x, y);
    }
  }
  b.fillStyle = col(c);
  for (let i = 0; i < hits.length; i += 2) b.fillRect(hits[i], hits[i + 1], 1, 1);
}

/* --------------------------------------------------------------- mirroring */

const mpx = (b, x, y, c) => { px(b, x, y, c); px(b, MIR - x, y, c); };
const mrect = (b, x, y, w, h, c) => { rect(b, x, y, w, h, c); rect(b, MIR - x - w, y, w, h, c); };
const mtri = (b, x0, y0, x1, y1, x2, y2, c) => {
  tri(b, x0, y0, x1, y1, x2, y2, c);
  tri(b, MIR - x0, y0, MIR - x1, y1, MIR - x2, y2, c);
};
const mline = (b, x0, y0, x1, y1, c) => {
  line(b, x0, y0, x1, y1, c); line(b, MIR - x0, y0, MIR - x1, y1, c);
};

/* ------------------------------------------------------------------ colour */

function makeTone(o) {
  const tint = o && o.tint ? o.tint : null;
  const amt = o && o.tintAmt !== undefined ? o.tintAmt : 0.38;
  const dim = o && o.dim ? clamp01(o.dim) : 0;
  if (!tint && !dim) return (c) => col(c);
  return (c) => {
    let h = col(c);
    if (tint) h = mix(h, col(tint), amt);
    if (dim) h = mix(h, 'shadow', dim * 0.7);
    return h;
  };
}

function colourSet(rc, tone) {
  const WH = tone('white'), IK = tone('ink');
  const body = tone(rc.body || 'grey1');
  const light = tone(rc.light || 'grey2');
  const shade = tone(rc.shade || 'grey0');
  const belly = tone(rc.belly || 'bone');
  const pat = tone(rc.patternColor || 'ink');
  const eye = tone(rc.eye || 'ink');
  return {
    WH, IK, body, light, shade, belly, pat, eye,
    hi: mix(light, WH, 0.5),
    deep: mix(shade, IK, 0.45),
    rim: mix(shade, IK, 0.72),
    bone: tone('bone'),
    horn: mix(tone('bone'), tone('sand'), 0.35),
    beak: mix(tone('amber'), tone('orange'), 0.4),
    earIn: mix(body, tone('pink'), 0.5),
    muz: mix(belly, WH, 0.2),
    nose: mix(tone('pink'), tone('red1'), 0.3),
    metal: tone('brass2'),
    quillA: IK,
    quillB: mix(tone('bone'), shade, 0.3),
  };
}

/* ==================================================================== the ball

Every animal is a BALL. That is not a shortcut, it is the design: a sphere with two dot
eyes is the most reliably cute shape in pixel art, it reads at any size, and it is
honest about the physics -- these things literally roll around a level.

What keeps ninety balls from being ninety marbles is that the SPECIES lives entirely in
what breaks the silhouette. Ears, horns, a tail, a wing, a shell, quills, a beak: all of
it pokes out past the circle. Nothing that stays inside the ball counts as a feature.

Two bakes per animal, both memoised:

    BODY[phase]  the shaded sphere and its pattern, at 8 rotations
    FACE[mood]   eyes, nose, ears, tail, wings -- everything that must stay upright

Drawing is body-blit + face-blit. The body spins as the animal rolls; the face never
does, because a cute face that rotates away from the camera stops being cute. Live pixels
on top handle wet sheen, drips and rain, which are the only per-frame work.
*/

const PHASES = 8;                       // rotations of the body pattern
const BALL_R = 13;                      // the sphere, in sprite-local pixels
const EYE_Y = CX + 1;                   // eyes sit just below the middle: cuter
const EYE_DX = 4;

/** Light direction, normalised. Upper-left, and the same for every sprite in the game. */
const LX = -0.55, LY = -0.62, LZ = 0.56;

/**
 * The shaded sphere.
 *
 * A real normal per pixel, so the terminator curves the way a ball's does and the two
 * bakes (body here, face later) agree about where the light is. Five tones plus a bounce
 * light along the lower right, which is what stops a shaded circle looking like a
 * gradient-filled circle.
 */
function ballBody(b, rc, C, phase) {
  const r = BALL_R;
  const spin = (phase / PHASES) * Math.PI * 2;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d2 = x * x + y * y;
      if (d2 > r * r) continue;
      const nx = x / r, ny = y / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lam = nx * LX + ny * LY + nz * LZ;
      // bounce light: a weak second source from below-right, unshadowed
      const bounce = Math.max(0, nx * 0.5 + ny * 0.55) * 0.5;
      let c;
      if (lam > 0.82) c = C.hi;
      else if (lam > 0.52) c = C.light;
      else if (lam > 0.12) c = C.body;
      else if (lam > -0.28) c = C.shade;
      else c = bounce > 0.3 ? mix(C.shade, C.rim, 0.4) : C.deep;
      if (lam <= 0.12 && bounce > 0.42) c = mix(c, C.light, 0.28);
      px(b, CX + x, CX + y, c);
    }
  }
  // the belly: a lit patch low and central, so the ball has a front
  for (let y = 3; y <= r - 1; y++) {
    const halfW = Math.round(Math.sqrt(Math.max(0, (r - 2) * (r - 2) - y * y)) * 0.72);
    for (let x = -halfW; x <= halfW; x++) {
      const fall = 1 - Math.abs(x) / Math.max(1, halfW);
      if (fall < 0.25) continue;
      px(b, CX + x, CX + y, mix(C.belly, C.body, 0.35 * (1 - fall)));
    }
  }
  ballPattern(b, rc, C, spin, r);
  // specular kiss, last so nothing paints over it
  px(b, CX - 5, CX - 6, C.WH);
  px(b, CX - 4, CX - 6, C.hi);
  px(b, CX - 5, CX - 5, C.hi);
}

/**
 * The pattern, wrapped onto the sphere and rotated by `spin`.
 *
 * Everything is evaluated in spherical coordinates (u = longitude, v = latitude) rather
 * than in screen space, so a stripe bends around the ball and a spot squashes toward the
 * edge. That single detail is the difference between a patterned sphere and a decal.
 */
function ballPattern(b, rc, C, spin, r) {
  const kind = rc.pattern || 'none';
  if (kind === 'none') return;
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > (r - 1) * (r - 1)) continue;
      const nx = x / r, ny = y / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      if (nz < 0.12) continue;                    // the rim is too foreshortened
      const u = Math.atan2(nx, nz) + spin;        // longitude, spun by the roll
      const v = Math.asin(Math.max(-1, Math.min(1, ny)));
      let on = false;
      switch (kind) {
        case 'stripes': on = Math.sin(u * 4.5) > 0.42; break;
        case 'bands': on = Math.sin(v * 7 + 0.6) > 0.35; break;
        case 'spots': on = Math.sin(u * 3.2) * Math.cos(v * 3.4) > 0.62; break;
        case 'patches': on = Math.sin(u * 1.7 + 1.1) * Math.cos(v * 1.9) > 0.28; break;
        case 'freckles': on = Math.sin(u * 9.5) * Math.cos(v * 8.5) > 0.74; break;
        case 'scales': on = Math.sin(u * 8) + Math.cos(v * 9) > 1.18; break;
        case 'plates': on = Math.sin(v * 5.5) > 0.62 || Math.sin(u * 2.4) > 0.86; break;
        case 'wool': on = Math.sin(u * 6.5) * Math.sin(v * 6) > 0.18; break;
        default: break;
      }
      if (!on) continue;
      // pattern respects the light, or it flattens the ball it is painted on
      const lam = nx * LX + ny * LY + nz * LZ;
      px(b, CX + x, CX + y, lam > 0.5 ? mix(C.pat, C.WH, 0.22) : lam > 0 ? C.pat : mix(C.pat, C.IK, 0.35));
    }
  }
  // wool gets a fluffed edge, because sheep are a silhouette not a texture
  if (kind === 'wool') {
    for (let a = 0; a < 360; a += 26) {
      const rad = (a * Math.PI) / 180;
      disc(b, CX + Math.cos(rad) * (r - 1), CX + Math.sin(rad) * (r - 1), 2,
        Math.sin(rad + spin) > 0 ? C.light : C.body);
    }
  }
}

/* ------------------------------------------------------------------- features

Everything here has to cross the circle's edge. The order is back-to-front: things behind
the ball, then the ball's own edge details, then the face on top.
*/

/** Behind the ball: tails, wings, plumes, fins, shells, quills, humps. */
function backFeatures(b, rc, C) {
  const r = BALL_R;
  switch (rc.extra) {
    case 'tail': {
      // an S that lifts off the flank and flicks up, with a tuft
      let tx = 0, ty = 0;
      for (let i = 0; i < 9; i++) {
        const f = i / 8;
        tx = CX + r - 3 + Math.round(Math.sin(f * 2.1) * 8);
        ty = CX + 2 - Math.round(f * f * 11);
        rect(b, tx, ty, 2, 2, i > 6 ? C.light : C.body);
        px(b, tx, ty + 1, C.shade);
      }
      disc(b, tx + 1, ty, 2, C.pat);
      px(b, tx, ty - 1, C.light);
      break;
    }
    case 'wing':
      for (const side of [-1, 1]) {
        for (let i = 0; i < 10; i++) {
          const h = 9 - Math.round(i * 0.7);
          rect(b, CX + side * (r - 2 + i) - (side < 0 ? 1 : 0), CX - 5 + Math.round(i * 0.5),
            1, h, i < 3 ? C.light : i < 6 ? C.body : C.pat);
        }
      }
      break;
    case 'plume':
      for (let i = 0; i < 8; i++) {
        const h = 6 + Math.round(Math.sin((i / 7) * Math.PI) * 8);
        rect(b, CX + r - 4 + i, CX - 4 - h, 1, h, i & 1 ? C.pat : C.light);
        px(b, CX + r - 4 + i, CX - 4 - h, C.WH);
      }
      break;
    case 'sail':
      for (let i = 0; i < 13; i++) {
        const h = 4 + Math.round(Math.sin((i / 12) * Math.PI) * 9);
        rect(b, CX - 6 + i, CX - r - h + 2, 1, h, i & 1 ? C.light : C.pat);
      }
      break;
    case 'flipper':
      for (const side of [-1, 1]) {
        mtri(b, CX + side * (r - 3), CX + 2, CX + side * (r + 6), CX + 8,
          CX + side * (r - 2), CX + 9, C.shade);
      }
      break;
    case 'shell':
      for (let i = 0; i < 4; i++) ring(b, CX, CX - 1, r - 1 - i * 3, i & 1 ? C.pat : mix(C.pat, C.light, 0.4));
      ring(b, CX, CX - 1, r, C.rim);
      break;
    case 'quills':
      b.solid = false;
      for (let a = 200; a <= 340; a += 12) {
        const rad = (a * Math.PI) / 180;
        const x0 = CX + Math.cos(rad) * (r - 1), y0 = CX + Math.sin(rad) * (r - 1);
        line(b, x0, y0, x0 + Math.cos(rad) * 7, y0 + Math.sin(rad) * 7,
          (a / 12) % 2 ? C.quillA : C.quillB);
      }
      b.solid = true;
      break;
    case 'hump':
      disc(b, CX - 2, CX - r + 1, 5, C.body);
      disc(b, CX - 3, CX - r, 3, C.light);
      break;
    case 'mane':
      for (let a = 0; a < 360; a += 10) {
        const rad = (a * Math.PI) / 180;
        for (let rr = r; rr < r + 5 + (a % 30 === 0 ? 2 : 0); rr++) {
          px(b, CX + Math.cos(rad) * rr, CX + Math.sin(rad) * rr,
            rr > r + 2 ? C.pat : mix(C.pat, C.shade, 0.4));
        }
      }
      break;
    case 'gill':
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 5; j++) px(b, CX + side * (r - 3 + i * 2), CX - 2 + j, mix(C.pat, C.light, j / 5));
        }
      }
      break;
    case 'antenna':
      b.solid = false;
      for (const side of [-1, 1]) {
        line(b, CX + side * 3, CX - r + 2, CX + side * 8, CX - r - 7, C.rim);
        disc(b, CX + side * 8, CX - r - 8, 2, C.pat);
      }
      b.solid = true;
      break;
    default: break;
  }
}

/** Ears and horns: on top, breaking the dome. The single biggest species cue. */
function ballEars(b, rc, C) {
  const r = BALL_R;
  const y = CX - r + 1;
  switch (rc.ears || 'round') {
    case 'none': break;
    case 'round':
      for (const side of [-1, 1]) {
        const x = CX + side * 9;
        disc(b, x, y - 2, 5, C.body);
        disc(b, x, y - 2, 3, C.earIn);
        disc(b, x - side, y - 3, 1, C.light);
      }
      break;
    case 'tiny':
      for (const side of [-1, 1]) { disc(b, CX + side * 8, y, 4, C.body); disc(b, CX + side * 8, y, 2, C.earIn); }
      break;
    case 'pointy':
      for (const side of [-1, 1]) {
        tri(b, CX + side * 3, y + 3, CX + side * 9, y - 9, CX + side * 9, y + 2, C.body);
        tri(b, CX + side * 4, y + 2, CX + side * 8, y - 5, CX + side * 8, y + 1, C.earIn);
      }
      break;
    case 'long':
      for (const side of [-1, 1]) {
        const x = CX + side * 5;
        rect(b, x - 1, y - 12, 3, 14, C.body);
        rect(b, x, y - 11, 1, 11, C.earIn);
        rect(b, x - 1, y - 12, 3, 1, C.light);
      }
      break;
    case 'tuft':
      for (const side of [-1, 1]) {
        const x = CX + side * 7;
        disc(b, x, y, 4, C.body);
        for (let i = 0; i < 5; i++) px(b, x + side * (i - 1), y - 4 - (i & 1), C.shade);
      }
      break;
    case 'horn':
      for (const side of [-1, 1]) {
        for (let i = 0; i < 9; i++) {
          const x = CX + side * (5 + Math.round(i * 0.7));
          const w = i < 3 ? 3 : i < 6 ? 2 : 1;
          rect(b, side < 0 ? x - w + 1 : x, y - 1 - i, w, 2, i > 6 ? C.horn : mix(C.horn, C.shade, 0.35));
        }
        px(b, CX + side * 10, y - 10, C.WH);
      }
      break;
    case 'antler':
      for (const side of [-1, 1]) {
        for (let i = 0; i < 10; i++) {
          const x = CX + side * (4 + (i >> 1));
          rect(b, side < 0 ? x - 1 : x, y - i, 2, 1, i > 7 ? C.horn : mix(C.horn, C.shade, 0.25));
        }
        for (const [ty2, len] of [[3, 3], [6, 3], [9, 2]]) {
          for (let j = 1; j <= len; j++) px(b, CX + side * (4 + (ty2 >> 1) + j), y - ty2 - j, C.horn);
          px(b, CX + side * (4 + (ty2 >> 1) + len), y - ty2 - len, C.WH);
        }
      }
      break;
    case 'crest':
      for (let i = 0; i < 6; i++) {
        const h = 4 + Math.round(Math.sin((i / 5) * Math.PI) * 6);
        rect(b, CX - 5 + i * 2, y - h + 1, 2, h, i & 1 ? C.pat : C.light);
      }
      break;
    case 'fin':
      tri(b, CX - 2, y + 3, CX - 10, y - 6, CX - 1, y - 4, C.light);
      line(b, CX - 8, y - 3, CX - 3, y + 1, C.shade);
      break;
    case 'frill':
      for (const side of [-1, 1]) {
        for (let i = 0; i < 8; i++) {
          const h = 7 - Math.abs(i - 3);
          rect(b, CX + side * (6 + i), y + 2 + Math.round(i * 0.7), 1, h, i & 1 ? C.body : C.shade);
        }
      }
      break;
    default: break;
  }
}

/**
 * The face. Two dot eyes and a small nose, and that is nearly all of it.
 *
 * The eyes are the whole game: 2x2 dots, four pixels apart, sitting BELOW the middle of
 * the ball. High eyes read as an adult animal, low eyes read as a baby, and a baby is
 * what we want. Each gets one white pixel of shine, which is what makes them look wet
 * and alive rather than painted on.
 */
function ballFace(b, rc, C, mood) {
  const ey = EYE_Y;
  const st = rc.eyeStyle || 'dot';
  const closed = mood === 'blink' || mood === 'sleepy' || st === 'sleepy';

  for (const side of [-1, 1]) {
    const ex = CX + side * EYE_DX;
    if (closed) {
      rect(b, ex - 2, ey, 4, 1, C.IK);
      px(b, ex - 2, ey + 1, C.IK);
      px(b, ex + 1, ey + 1, C.IK);
      continue;
    }
    if (mood === 'happy') {                       // ^ ^ — the cutest two pixels in games
      px(b, ex - 2, ey + 1, C.IK); px(b, ex - 1, ey, C.IK);
      px(b, ex, ey, C.IK); px(b, ex + 1, ey + 1, C.IK);
      continue;
    }
    if (mood === 'scared') {                      // wide with a big highlight
      rect(b, ex - 2, ey - 2, 4, 5, C.WH);
      rect(b, ex - 1, ey - 1, 2, 3, C.eye);
      px(b, ex - 1, ey - 1, C.WH);
      continue;
    }
    // the default: a soft dark dot with a shine
    rect(b, ex - 1, ey - 1, 3, 3, C.eye);
    if (st === 'wide' || st === 'sparkle') {
      rect(b, ex - 2, ey - 2, 4, 4, C.WH);
      rect(b, ex - 1, ey - 1, 3, 3, C.eye);
    }
    px(b, ex - 1, ey - 1, C.WH);
    if (st === 'sparkle') px(b, ex + 1, ey + 1, C.WH);
    if (st === 'angry') { px(b, ex - 2 * side, ey - 2, C.shade); px(b, ex - side, ey - 2, C.shade); }
    if (st === 'goggle') { ring(b, ex, ey, 3, C.metal); px(b, ex, ey - 3, C.hi); }
  }

  // the nose / snout / beak, always small and always just under the eyes
  const fy = ey + 5;
  switch (rc.face) {
    case 'beak':
      tri(b, CX - 3, fy - 1, CX + 3, fy - 1, CX, fy + 4, C.beak);
      px(b, CX, fy, mix(C.beak, C.IK, 0.4));
      break;
    case 'trunk':
      rect(b, CX - 1, fy - 1, 3, 8, C.body);
      rect(b, CX - 1, fy - 1, 1, 8, C.light);
      px(b, CX, fy + 7, C.shade);
      break;
    case 'tusk':
      ellipse(b, CX, fy, 3, 2, C.muz);
      for (const side of [-1, 1]) for (let i = 0; i < 4; i++) px(b, CX + side * (3 + i), fy + i, C.horn);
      break;
    case 'mandible':
      for (const side of [-1, 1]) {
        line(b, CX + side * 2, fy, CX + side * 6, fy + 3, C.IK);
        px(b, CX + side * 6, fy + 3, C.pat);
      }
      break;
    case 'whiskers':
      ellipse(b, CX, fy, 2, 1, C.nose);
      b.solid = false;
      for (const side of [-1, 1]) for (let i = 0; i < 2; i++) {
        line(b, CX + side * 3, fy + i, CX + side * 9, fy - 1 + i * 3, C.bone);
      }
      b.solid = true;
      break;
    case 'flat':
      rect(b, CX - 2, fy, 4, 1, C.shade);
      break;
    case 'snout':
      ellipse(b, CX, fy + 1, 4, 3, C.muz);
      px(b, CX - 1, fy + 1, C.nose); px(b, CX + 1, fy + 1, C.nose);
      break;
    default:                                       // muzzle: small, or it becomes the face
      ellipse(b, CX, fy + 1, 3, 2, mix(C.muz, C.body, 0.35));
      rect(b, CX - 1, fy, 2, 1, C.nose);
      break;
  }
  // a little smile, on the moods that want one
  if (mood === 'happy') {
    px(b, CX - 2, fy + 4, C.IK); px(b, CX - 1, fy + 5, C.IK);
    px(b, CX, fy + 5, C.IK); px(b, CX + 1, fy + 4, C.IK);
  }
}

/* ==================================================================== baking

Two caches, both lazy and both capped.

  backCache   (animal, tint)          what sits behind the ball
  bodyCache   (animal, phase, tint)   the spinning sphere
  faceCache   (animal, mood, tint)    the upright ears and face

Lazy matters: a rescue level has a dozen animals on screen, so a dozen animals times
eight phases get baked, not ninety times eight. The caps are a backstop against a caller
animating a tint, which would otherwise bake a new sprite every frame forever.
*/

const backCache = new Map();
const bodyCache = new Map();
const faceCache = new Map();
const iconCache = new Map();
const CACHE_CAP = 900;

function tintKey(o) {
  return `${(o && o.tint) || ''}/${(o && o.tintAmt) !== undefined ? o.tintAmt : ''}/${(o && o.dim) || 0}`;
}

/** The spinning half: sphere + pattern, at one of PHASES rotations. */
function bakeBody(recipe, phase, o) {
  const rc = Object.assign({}, DEFAULT_RECIPE, recipe || {});
  const C = colourSet(rc, makeTone(o || {}));
  const b = makeBoard(SPRITE_SIZE, SPRITE_SIZE);
  if (!b.canvas) return null;
  ballBody(b, rc, C, phase);
  outline(b, 'ink');
  return b.canvas;
}

/** Behind the ball. One bake per animal: none of it moves or emotes. */
function bakeBack(recipe, o) {
  const rc = Object.assign({}, DEFAULT_RECIPE, recipe || {});
  if ((rc.extra || 'none') === 'none') return null;      // nothing to draw, skip the blit
  const C = colourSet(rc, makeTone(o || {}));
  const b = makeBoard(SPRITE_SIZE, SPRITE_SIZE);
  if (!b.canvas) return null;
  backFeatures(b, rc, C);
  outline(b, 'ink');
  return b.canvas;
}

/** The upright half: ears and face, everything that must keep facing the camera. */
function bakeFace(recipe, mood, o) {
  const rc = Object.assign({}, DEFAULT_RECIPE, recipe || {});
  const C = colourSet(rc, makeTone(o || {}));
  const b = makeBoard(SPRITE_SIZE, SPRITE_SIZE);
  if (!b.canvas) return null;
  ballEars(b, rc, C);
  ballFace(b, rc, C, mood);
  outline(b, 'ink');
  return b.canvas;
}

/**
 * bakeAnimal(recipe, opts) -> canvas
 * The whole animal in one canvas, unrotated. Kept because the shop, the draft and every
 * card in the game want a single still image and should not pay for two blits.
 */
export function bakeAnimal(recipe, opts = {}) {
  const rc = Object.assign({}, DEFAULT_RECIPE, recipe || {});
  const C = colourSet(rc, makeTone(opts));
  const b = makeBoard(SPRITE_SIZE, SPRITE_SIZE);
  if (!b.canvas) return null;
  backFeatures(b, rc, C);
  ballBody(b, rc, C, opts.phase || 0);
  ballEars(b, rc, C);
  ballFace(b, rc, C, opts.mood || 'idle');
  outline(b, 'ink');
  return b.canvas;
}

function cachedBack(animal, o) {
  const k = `${(animal && animal.id) || 'x'}/${tintKey(o)}`;
  let hit = backCache.get(k);
  if (hit === undefined) {
    hit = bakeBack(animal && animal.sprite, o);
    if (backCache.size > CACHE_CAP) backCache.clear();
    backCache.set(k, hit);
  }
  return hit;
}

function cachedBody(animal, phase, o) {
  const k = `${(animal && animal.id) || 'x'}/${phase}/${tintKey(o)}`;
  let hit = bodyCache.get(k);
  if (hit === undefined) {
    hit = bakeBody(animal && animal.sprite, phase, o);
    if (bodyCache.size > CACHE_CAP) bodyCache.clear();
    bodyCache.set(k, hit);
  }
  return hit;
}

function cachedFace(animal, mood, o) {
  const k = `${(animal && animal.id) || 'x'}/${mood}/${tintKey(o)}`;
  let hit = faceCache.get(k);
  if (hit === undefined) {
    hit = bakeFace(animal && animal.sprite, mood, o);
    if (faceCache.size > CACHE_CAP) faceCache.clear();
    faceCache.set(k, hit);
  }
  return hit;
}

/** A single still image of the animal, memoised. For cards, lists and shop shelves. */
export function getAnimalSprite(animal, o = {}) {
  const k = `still/${(animal && animal.id) || 'x'}/${o.mood || 'idle'}/${tintKey(o)}`;
  let hit = bodyCache.get(k);
  if (hit === undefined) {
    hit = bakeAnimal(animal && animal.sprite, o);
    if (bodyCache.size > CACHE_CAP) bodyCache.clear();
    bodyCache.set(k, hit);
  }
  return hit;
}

export function clearSpriteCache() { backCache.clear(); bodyCache.clear(); faceCache.clear(); iconCache.clear(); }
export function spriteCacheSize() { return backCache.size + bodyCache.size + faceCache.size + iconCache.size; }

/* ------------------------------------------------------------------- drawing */

/**
 * drawAnimal(g, animal, sx, sy, opts)
 *
 * opts:
 *   scale    1 | 2         integer only, so pixels stay pixels
 *   roll     radians        how far it has rolled; picks the body phase
 *   squash   0..1          flattened by an impact; conserves area
 *   wet      0..1          sheen on top, drips off the bottom
 *   rain     0..1          how hard it is raining on this animal
 *   mood     idle|blink|happy|scared|sleepy
 *   flip     boolean       mirror (features only look right one way for some recipes)
 *   t        seconds       drives drips and sheen; pass the scene clock
 *   alpha, tint, dim
 *
 * Cost: two drawImage calls, plus up to four pixels of water. The rolling, the squash and
 * the wetness are all free at the call site because none of them re-bakes anything.
 */
export function drawAnimal(g, animal, sx, sy, opts = {}) {
  const sc = Math.max(1, Math.round(opts.scale || 1));
  const S = SPRITE_SIZE * sc;
  const phase = opts.roll !== undefined
    ? ((Math.round((opts.roll / (Math.PI * 2)) * PHASES) % PHASES) + PHASES) % PHASES
    : 0;
  const mood = opts.mood || (opts.blink ? 'blink' : 'idle');
  const back = cachedBack(animal, opts);
  const body = cachedBody(animal, phase, opts);
  const face = cachedFace(animal, mood, opts);
  if (!body && !face) return;

  // squash and stretch, area-preserving: a ball that flattens must also widen, or it
  // reads as shrinking rather than as landing
  const q = opts.squash ? Math.max(0, Math.min(0.5, opts.squash)) : 0;
  const dw = Math.round(S * (1 + q * 0.55));
  const dh = Math.round(S * (1 - q * 0.55));
  const dx = Math.round(sx - dw / 2);
  const dy = Math.round(sy - dh / 2 + (S - dh) / 2);

  const prevA = g.globalAlpha;
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  if (opts.flip) {
    g.save();
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    if (back) g.drawImage(back, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, dw, dh);
    if (body) g.drawImage(body, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, dw, dh);
    if (face) g.drawImage(face, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, dw, dh);
    g.restore();
  } else {
    if (back) g.drawImage(back, 0, 0, SPRITE_SIZE, SPRITE_SIZE, dx, dy, dw, dh);
    if (body) g.drawImage(body, 0, 0, SPRITE_SIZE, SPRITE_SIZE, dx, dy, dw, dh);
    if (face) g.drawImage(face, 0, 0, SPRITE_SIZE, SPRITE_SIZE, dx, dy, dw, dh);
  }
  g.globalAlpha = prevA;

  if (opts.wet) drawWet(g, sx, sy, sc, opts.wet, opts.t || 0);
  if (opts.rain) drawRainHit(g, sx, sy, sc, opts.rain, opts.t || 0);
}

/**
 * Wet: a bright sheen arc across the lit shoulder, and drips leaving the underside.
 *
 * Drips are indexed off a hash of the animal's position so neighbouring animals do not
 * drip in unison, which is what gives a sodden flock its liveliness for eight pixels of
 * work.
 */
function drawWet(g, sx, sy, sc, wet, t) {
  const w = Math.max(0, Math.min(1, wet));
  const r = (BALL_R - 1) * sc;
  // sheen: two short arcs, brighter the wetter it is
  for (let i = 0; i < 5; i++) {
    const a = -2.5 + i * 0.16;
    px(g, sx + Math.cos(a) * r * 0.82, sy + Math.sin(a) * r * 0.82, i & 1 ? 'ice' : 'foam');
  }
  if (w > 0.45) {
    for (let i = 0; i < 4; i++) {
      const a = -2.1 + i * 0.14;
      px(g, sx + Math.cos(a) * r * 0.6, sy + Math.sin(a) * r * 0.6, 'foam');
    }
  }
  // drips: three staggered, each falling on its own loop
  const n = w > 0.7 ? 3 : w > 0.35 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const seed = i * 2.7 + Math.floor(sx * 0.31 + sy * 0.17);
    const k = (t * (0.9 + i * 0.25) + seed) % 1;
    const dx = sx + ((i - 1) * 5 + (seed % 3) - 1) * sc;
    const dy = sy + r * 0.72 + k * 12 * sc;
    px(g, dx, dy, 'foam');
    px(g, dx, dy + 1, 'water3');
    if (k > 0.86) { px(g, dx - 1, dy + 2, 'foam'); px(g, dx + 1, dy + 2, 'foam'); }
  }
}

/** Rain landing on the animal: a couple of splash ticks on the dome. */
function drawRainHit(g, sx, sy, sc, rain, t) {
  const n = Math.round(1 + Math.max(0, Math.min(1, rain)) * 3);
  const r = (BALL_R - 2) * sc;
  for (let i = 0; i < n; i++) {
    const seed = i * 5.3 + Math.floor(sx * 0.7 + sy * 0.3);
    const k = (t * 3.4 + seed) % 1;
    if (k > 0.4) continue;                       // most of the loop is nothing happening
    const a = -2.6 + ((seed * 7) % 20) / 10;
    const px2 = sx + Math.cos(a) * r, py2 = sy + Math.sin(a) * r;
    px(g, px2, py2, 'white');
    if (k > 0.18) { px(g, px2 - 1, py2 - 1, 'foam'); px(g, px2 + 1, py2 - 1, 'foam'); }
  }
}

/** A flattened shadow on the ground, so a ball reads as resting on something. */
export function drawAnimalShadow(g, sx, sy, r, opts = {}) {
  const flat = opts.flat !== undefined ? opts.flat : 0.34;
  const a = opts.alpha !== undefined ? opts.alpha : 0.5;
  const c = opts.color || 'ink';
  const rx = Math.max(2, Math.round(r));
  const ry = Math.max(1, Math.round(r * flat));
  const prev = g.globalAlpha;
  g.globalAlpha = prev * a;
  ellipse(g, Math.round(sx), Math.round(sy), rx, ry, c);
  g.globalAlpha = prev * a * 0.55;
  ellipse(g, Math.round(sx), Math.round(sy), rx + 2, ry + 1, c);
  g.globalAlpha = prev;
}

/* --------------------------------------------------------------------- icons

A 16px badge. Not a shrunken sprite -- at sixteen pixels a whole animal is mud. It is the
ball's TOP HALF, cropped like a passport photo, which keeps the two dot eyes at a
readable size and lets the ears still break the edge.
*/

export function bakeIcon(recipe, size = ICON_SIZE) {
  const rc = Object.assign({}, DEFAULT_RECIPE, recipe || {});
  const C = colourSet(rc, makeTone({}));
  const b = makeBoard(size, size);
  if (!b.canvas) return { canvas: null, w: size, h: size, cx: size / 2, cy: size / 2 };
  const cx = Math.round(size / 2), cy = Math.round(size / 2) + 1;
  const r = Math.round(size * 0.42);

  // ears first so the dome overlaps their roots
  const et = rc.ears || 'round';
  if (et === 'long') {
    for (const side of [-1, 1]) { rect(b, cx + side * 2 - 1, cy - r - 5, 3, 7, C.body); px(b, cx + side * 2, cy - r - 4, C.earIn); }
  } else if (et === 'pointy') {
    for (const side of [-1, 1]) tri(b, cx + side * 2, cy - r + 2, cx + side * 6, cy - r - 5, cx + side * 1, cy - r, C.body);
  } else if (et === 'horn' || et === 'antler') {
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) rect(b, cx + side * (2 + (i >> 1)), cy - r - i, 2, 1, C.horn);
  } else if (et === 'crest' || et === 'tuft') {
    for (let i = 0; i < 5; i++) rect(b, cx - 4 + i * 2, cy - r - 2 - (i === 2 ? 2 : 0), 2, 4, i & 1 ? C.pat : C.light);
  } else if (et !== 'none') {
    for (const side of [-1, 1]) { disc(b, cx + side * 4, cy - r + 2, 2, C.body); px(b, cx + side * 4, cy - r + 2, C.earIn); }
  }

  // the dome, shaded with the same light as the big sprite
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      const nx = x / r, ny = y / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lam = nx * LX + ny * LY + nz * LZ;
      px(b, cx + x, cy + y, lam > 0.72 ? C.hi : lam > 0.4 ? C.light : lam > 0 ? C.body : lam > -0.3 ? C.shade : C.deep);
    }
  }
  // one pattern mark: enough to tell a zebra from a horse
  switch (rc.pattern) {
    case 'stripes': for (let i = -1; i <= 1; i++) rect(b, cx + i * 3, cy - r + 2, 1, r, C.pat); break;
    case 'spots': case 'freckles': case 'patches':
      px(b, cx - 3, cy + 1, C.pat); px(b, cx + 3, cy + 2, C.pat); px(b, cx + 1, cy - 3, C.pat); break;
    case 'bands': case 'scales': case 'plates':
      rect(b, cx - r + 2, cy - 2, r * 2 - 4, 1, C.pat); rect(b, cx - r + 3, cy + 2, r * 2 - 6, 1, C.pat); break;
    case 'wool':
      for (const [dx, dy] of [[-4, -3], [0, -4], [4, -3], [-3, 2], [3, 2]]) disc(b, cx + dx, cy + dy, 1, C.light);
      break;
    default: break;
  }
  // the two dots, and one shine
  for (const side of [-1, 1]) {
    const ex = cx + side * 3, ey = cy;
    px(b, ex, ey, C.eye);
    px(b, ex, ey - 1, C.eye);
    px(b, ex - 1, ey - 1, C.WH);
  }
  if (rc.face === 'beak') tri(b, cx - 2, cy + 3, cx + 2, cy + 3, cx, cy + 6, C.beak);
  else ellipse(b, cx, cy + 4, 2, 1, C.muz);
  outline(b, 'ink');
  return { canvas: b.canvas, w: size, h: size, cx, cy };
}

export function getAnimalIcon(animal, size = ICON_SIZE) {
  const k = (animal && animal.id ? animal.id : 'x') + '@' + size;
  let hit = iconCache.get(k);
  if (hit) return hit;
  hit = bakeIcon(animal && animal.sprite, size);
  if (iconCache.size > CACHE_CAP) iconCache.clear();
  iconCache.set(k, hit);
  return hit;
}

export function drawAnimalIcon(g, animal, sx, sy, opts = {}) {
  const size = opts.size || ICON_SIZE;
  const ic = getAnimalIcon(animal, size);
  if (!ic || !ic.canvas) return;
  const sc = Math.max(1, Math.round(opts.scale || 1));
  const prev = g.globalAlpha;
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  g.drawImage(ic.canvas, 0, 0, size, size,
    Math.round(sx - ic.cx * sc), Math.round(sy - ic.cy * sc), size * sc, size * sc);
  g.globalAlpha = prev;
}

// Procedural animal sprite factory.
//
// Rewritten for the 960x540 frame. The old 20px version was a shaded sphere with a face
// painted on it — the only silhouette that reads at that size. At 32px there is room for
// an actual creature, and a BODY plus a separate HEAD is what makes a pixel animal read
// as an animal rather than as a marble:
//
//        ears/horns          rows  0..8
//        head (r 7)          rows  5..19
//        body (9 x 7 oval)   rows 15..29
//        legs                rows 27..31
//        tail / wing         either flank
//
// A recipe (DESIGN.md 9.3) is baked ONCE into a 32x32 offscreen canvas and memoised, so
// an animal still costs one drawImage per frame. Two rules keep 90 recipes from turning
// into 90 blobs:
//   1. every feature has to break the silhouette somewhere — a shape that stays inside
//      the body is invisible at any size;
//   2. patterns are evaluated in a tilted spherical frame, so stripes and bands bend
//      around the body instead of lying on it like a decal.
//
// Light is from the upper left throughout.

import { P, col, mix } from '../core/palette.js';
import { makeCanvas, disc, ellipse, ellipseFrame, rect, px, line, tri, ring } from '../core/pixel.js';

export const SPRITE_SIZE = 32;
export const ICON_SIZE = 16;

const R = Math.round;

// --- anatomy, in sprite-local pixels
const CX = 16;
const BODY_Y = 21, BODY_RX = 9, BODY_RY = 7;
const HEAD_Y = 12, HEAD_R = 7;
const EYE_Y = HEAD_Y - 1, EYE_DX = 3;
const FACE_Y = HEAD_Y + 3;
const LEG_Y = BODY_Y + BODY_RY - 1;
const MIR = CX * 2;                       // mirror axis: x -> MIR - x
const CACHE_CAP = 700;

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

/* ---------------------------------------------------------------- shading */

/**
 * A shaded oval. Four tones plus a rim, lit from the upper left, with the terminator
 * computed from a real surface normal so body and head shade consistently.
 */
function shadedOval(b, cx, cy, rx, ry, C, o = {}) {
  const lx = -0.5, ly = -0.6;
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const n = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (n > 1) continue;
      const nz = Math.sqrt(Math.max(0, 1 - n));
      const nx = dx / rx, ny = dy / ry;
      const lam = -(nx * lx + ny * ly) + nz * 0.5;
      const edge = Math.sqrt(n);
      let c;
      if (edge > 0.88 && lam < 0.5) c = C.rim;
      else if (lam > 1.0) c = C.hi;
      else if (lam > 0.76) c = C.light;
      else if (lam > 0.4) c = C.body;
      else if (lam > 0.14) c = C.shade;
      else c = C.deep;
      // belly: the lower third of the body picks up the pale underside
      if (o.belly && dy > ry * 0.25 && Math.abs(nx) < 0.72) {
        const t = (dy - ry * 0.25) / (ry * 0.75);
        if (t > 0.35) c = mix(C.belly, c, 0.28);
      }
      px(b, cx + dx, cy + dy, c);
    }
  }
}

/* ---------------------------------------------------------------- patterns */

const TILT = 0.45, CT = Math.cos(TILT), ST = Math.sin(TILT);

/** Pattern pass, masked to the body oval and bent around its curvature. */
function patternPass(b, rc, C) {
  const kind = rc.pattern || 'none';
  if (kind === 'none') return;
  const rx = BODY_RX, ry = BODY_RY;
  for (let dy = -ry; dy <= ry; dy++) {
    for (let dx = -rx; dx <= rx; dx++) {
      const n = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
      if (n > 0.94) continue;
      const nx = dx / rx, ny = dy / ry;
      const nz = Math.sqrt(Math.max(0, 1 - n));
      // rotate the normal toward the viewer so bands wrap instead of lying flat
      const u = Math.atan2(nx, nz * CT - ny * ST);
      const v = Math.asin(clampN(ny * CT + nz * ST));
      let on = false;
      switch (kind) {
        case 'stripes': on = Math.sin(u * 5.2) > 0.32; break;
        case 'bands': on = Math.sin(v * 6.5) > 0.3; break;
        case 'spots': on = (Math.sin(u * 4.4) * Math.cos(v * 5.2)) > 0.55; break;
        case 'freckles': on = (Math.sin(u * 9) * Math.cos(v * 8.4)) > 0.72; break;
        case 'patches': on = (Math.sin(u * 2.1 + 1.1) * Math.cos(v * 2.4)) > 0.18; break;
        case 'scales': on = ((Math.floor(u * 6) + Math.floor(v * 7)) & 1) === 0 && nz > 0.35; break;
        case 'plates': on = Math.sin(v * 5) > 0.55 && nz > 0.3; break;
        case 'wool': on = (Math.sin(u * 8.5) + Math.cos(v * 9.5)) > 0.85; break;
        default: on = false;
      }
      if (!on) continue;
      // keep the pattern out of the darkest terminator so it never muddies
      const lam = -(nx * -0.5 + ny * -0.6) + nz * 0.5;
      if (lam < 0.2) continue;
      px(b, CX + dx, BODY_Y + dy, lam > 0.8 ? mix(C.pat, C.WH, 0.28) : C.pat);
    }
  }
}
function clampN(v) { return v < -1 ? -1 : v > 1 ? 1 : v; }

/* -------------------------------------------------------------------- legs */

function legs(b, rc, C) {
  const kind = rc.face === 'beak' ? 'bird' : rc.extra === 'flipper' || rc.extra === 'gill' ? 'none' : 'four';
  if (kind === 'none') return;
  if (kind === 'bird') {
    for (const side of [-1, 1]) {
      const x = CX + side * 3;
      rect(b, x, LEG_Y, 1, 4, C.beak);
      rect(b, x - 1, LEG_Y + 4, 3, 1, C.beak);
      px(b, x, LEG_Y + 3, mix(C.beak, C.IK, 0.4));
    }
    return;
  }
  // four stubby legs, the far pair a shade darker
  for (const [dx, far] of [[-6, 1], [-2, 0], [2, 0], [6, 1]]) {
    const x = CX + dx;
    const h = far ? 3 : 4;
    rect(b, x - 1, LEG_Y, 2, h, far ? C.shade : C.body);
    rect(b, x - 1, LEG_Y + h - 1, 2, 1, far ? C.deep : C.shade);
    if (!far) px(b, x - 1, LEG_Y, C.light);
  }
}

/* -------------------------------------------------------------------- ears */

function ears(b, rc, C) {
  const k = rc.ears || 'round';
  const y = HEAD_Y - HEAD_R;
  switch (k) {
    case 'none': break;
    case 'round':
      for (const side of [-1, 1]) {
        const x = CX + side * 5;
        disc(b, x, y + 1, 3, C.body);
        disc(b, x, y + 1, 1, C.earIn);
        px(b, x - side, y - 1, C.light);
      }
      break;
    case 'pointy':
      mtri(b, CX - 4, y + 4, CX - 7, y - 5, CX - 1, y + 1, C.body);
      mtri(b, CX - 4, y + 3, CX - 6, y - 2, CX - 2, y + 1, C.earIn);
      break;
    case 'long':
      for (const side of [-1, 1]) {
        const x = CX + side * 4;
        rect(b, x - 1, y - 9, 3, 11, C.body);
        rect(b, x, y - 8, 1, 8, C.earIn);
        rect(b, x - 1, y - 9, 3, 1, C.light);
      }
      break;
    case 'tiny':
      for (const side of [-1, 1]) disc(b, CX + side * 4, y + 2, 2, C.body);
      break;
    case 'tuft':
      for (const side of [-1, 1]) {
        const x = CX + side * 5;
        disc(b, x, y + 1, 3, C.body);
        for (let i = 0; i < 4; i++) px(b, x + side * (i - 1), y - 2 - (i & 1), C.shade);
      }
      break;
    case 'horn':
      // thick at the skull, thinning as it sweeps out — a horn, not a wire
      for (const side of [-1, 1]) {
        for (let i = 0; i < 8; i++) {
          const x = CX + side * (3 + Math.round(i * 0.7));
          const w = i < 3 ? 3 : i < 6 ? 2 : 1;
          rect(b, side < 0 ? x - w + 1 : x, y - 1 - i, w, 2, i > 5 ? C.horn : mix(C.horn, C.shade, 0.35));
          if (i < 4) px(b, side < 0 ? x - w + 1 : x + w - 1, y - 1 - i, mix(C.horn, C.WH, 0.3));
        }
        px(b, CX + side * 8, y - 9, C.WH);
      }
      break;
    case 'antler':
      // main beam two pixels thick so it reads as bone, then three tines off it
      for (const side of [-1, 1]) {
        for (let i = 0; i < 9; i++) {
          const x = CX + side * (3 + (i >> 1));
          rect(b, side < 0 ? x - 1 : x, y - i, 2, 1, i > 6 ? C.horn : mix(C.horn, C.shade, 0.25));
        }
        for (const [ty, len] of [[3, 3], [6, 3], [8, 2]]) {
          for (let j = 1; j <= len; j++) {
            px(b, CX + side * (3 + (ty >> 1) + j), y - ty - j, C.horn);
          }
          px(b, CX + side * (3 + (ty >> 1) + len), y - ty - len, C.WH);
        }
      }
      break;
    case 'crest':
      for (let i = 0; i < 5; i++) {
        const h = 3 + Math.round(Math.sin((i / 4) * Math.PI) * 4);
        rect(b, CX - 4 + i * 2, y - h + 1, 2, h, i & 1 ? C.pat : C.light);
      }
      break;
    case 'fin':
      mtri(b, CX - 2, y + 2, CX - 8, y - 4, CX - 1, y - 3, C.light);
      mline(b, CX - 6, y - 2, CX - 3, y + 1, C.shade);
      break;
    case 'frill':
      for (const side of [-1, 1]) {
        for (let i = 0; i < 7; i++) {
          const h = 6 - Math.abs(i - 3);
          rect(b, CX + side * (5 + i), y + 1 + Math.round(i * 0.6), 1, h, i & 1 ? C.body : C.shade);
        }
      }
      break;
    case 'shell':
      for (let i = 0; i < 3; i++) ellipseFrame(b, CX, y + 4, 8 - i * 2, 4 - i, i ? C.pat : C.light);
      break;
    default: break;
  }
}

/* -------------------------------------------------------------------- face */

function face(b, rc, C) {
  const k = rc.face || 'muzzle';
  // eyes first, so a muzzle can overlap them
  eyes(b, rc, C);
  switch (k) {
    case 'muzzle':
      ellipse(b, CX, FACE_Y + 1, 4, 3, C.muz);
      px(b, CX, FACE_Y, C.IK); px(b, CX - 1, FACE_Y, C.IK); px(b, CX + 1, FACE_Y, C.IK);
      line(b, CX, FACE_Y + 1, CX, FACE_Y + 3, C.shade);
      mline(b, CX - 1, FACE_Y + 3, CX - 3, FACE_Y + 2, C.shade);
      break;
    case 'snout':
      ellipse(b, CX, FACE_Y + 2, 3, 3, C.muz);
      ellipse(b, CX, FACE_Y + 3, 2, 1, C.nose);
      px(b, CX - 1, FACE_Y + 3, C.IK); px(b, CX + 1, FACE_Y + 3, C.IK);
      break;
    case 'beak':
      tri(b, CX - 3, FACE_Y, CX + 3, FACE_Y, CX, FACE_Y + 5, C.beak);
      line(b, CX - 2, FACE_Y + 1, CX + 2, FACE_Y + 1, mix(C.beak, C.IK, 0.4));
      px(b, CX, FACE_Y + 4, mix(C.beak, C.IK, 0.5));
      break;
    case 'trunk':
      for (let i = 0; i < 9; i++) {
        const w = 3 - Math.round(i / 4);
        rect(b, CX - Math.round(w / 2) + Math.round(Math.sin(i * 0.5) * 1.2), FACE_Y + i, w, 1, i & 1 ? C.body : C.shade);
      }
      break;
    case 'flat':
      ellipse(b, CX, FACE_Y + 1, 4, 2, C.muz);
      mpx(b, CX - 1, FACE_Y + 1, C.IK);
      break;
    case 'whiskers':
      ellipse(b, CX, FACE_Y + 1, 3, 2, C.muz);
      px(b, CX, FACE_Y, C.nose);
      for (const dy of [0, 2]) {
        mline(b, CX - 3, FACE_Y + dy, CX - 8, FACE_Y + dy - 1, C.bone);
      }
      break;
    case 'tusk':
      ellipse(b, CX, FACE_Y + 1, 4, 3, C.muz);
      px(b, CX, FACE_Y, C.IK);
      for (const side of [-1, 1]) {
        for (let i = 0; i < 5; i++) px(b, CX + side * (3 + Math.round(i * 0.3)), FACE_Y + 2 + i, C.horn);
      }
      break;
    case 'mandible':
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) px(b, CX + side * (2 + i), FACE_Y + 1 + Math.round(i * 0.7), C.rim);
        px(b, CX + side * 5, FACE_Y + 4, C.rim);
      }
      break;
    default: break;
  }
}

function eyes(b, rc, C) {
  const st = rc.eyeStyle || 'dot';
  const blink = rc.__blink;
  if (blink) {
    for (const side of [-1, 1]) rect(b, CX + side * EYE_DX - 1, EYE_Y, 3, 1, C.rim);
    return;
  }
  switch (st) {
    case 'dot':
      for (const side of [-1, 1]) {
        rect(b, CX + side * EYE_DX - 1, EYE_Y - 1, 2, 2, C.eye);
        px(b, CX + side * EYE_DX - 1, EYE_Y - 1, C.WH);
      }
      break;
    case 'wide':
      for (const side of [-1, 1]) {
        disc(b, CX + side * EYE_DX, EYE_Y, 2, C.WH);
        px(b, CX + side * EYE_DX, EYE_Y, C.eye);
        px(b, CX + side * EYE_DX, EYE_Y + 1, C.eye);
        px(b, CX + side * EYE_DX - 1, EYE_Y - 1, C.WH);
      }
      break;
    case 'sleepy':
      for (const side of [-1, 1]) {
        rect(b, CX + side * EYE_DX - 2, EYE_Y, 4, 1, C.eye);
        px(b, CX + side * EYE_DX - 2, EYE_Y - 1, C.eye);
      }
      break;
    case 'angry':
      for (const side of [-1, 1]) {
        rect(b, CX + side * EYE_DX - 1, EYE_Y, 2, 2, C.eye);
        line(b, CX + side * (EYE_DX - 2), EYE_Y - 2, CX + side * (EYE_DX + 2), EYE_Y - 1, C.rim);
      }
      break;
    case 'sparkle':
      for (const side of [-1, 1]) {
        disc(b, CX + side * EYE_DX, EYE_Y, 2, C.eye);
        px(b, CX + side * EYE_DX - 1, EYE_Y - 1, C.WH);
        px(b, CX + side * EYE_DX + 1, EYE_Y + 1, C.WH);
      }
      break;
    case 'goggle':
      for (const side of [-1, 1]) {
        ring(b, CX + side * EYE_DX, EYE_Y, 2, C.rim);
        px(b, CX + side * EYE_DX, EYE_Y, C.eye);
      }
      rect(b, CX - 1, EYE_Y, 2, 1, C.rim);
      break;
    default: break;
  }
}

/* ------------------------------------------------------------------- extra */

function extra(b, rc, C) {
  const k = rc.extra || 'none';
  switch (k) {
    case 'none': break;
    case 'mane':
      for (let a = 0; a < 360; a += 11) {
        const rad = (a * Math.PI) / 180;
        const r0 = HEAD_R + 1, r1 = HEAD_R + 4 + (a % 33 === 0 ? 1 : 0);
        for (let r = r0; r < r1; r++) {
          px(b, CX + Math.cos(rad) * r, HEAD_Y + Math.sin(rad) * r * 0.95, r > r0 + 1 ? C.pat : C.shade);
        }
      }
      break;
    case 'wing':
      for (const side of [-1, 1]) {
        for (let i = 0; i < 9; i++) {
          const h = 7 - Math.round(i * 0.7);
          rect(b, CX + side * (BODY_RX - 1 + i), BODY_Y - 4 + Math.round(i * 0.4), 1, h, i < 3 ? C.light : i < 6 ? C.body : C.pat);
        }
      }
      break;
    case 'tail': {
      // an S that lifts off the rump then flicks up, with a tuft on the end. A straight
      // diagonal here read as a pool cue laid across the animal.
      let tx = 0, ty = 0;
      for (let i = 0; i < 10; i++) {
        const t = i / 9;
        tx = CX + BODY_RX - 2 + Math.round(Math.sin(t * 2.1) * 7);
        ty = BODY_Y - 2 - Math.round(t * t * 9);
        rect(b, tx, ty, 2, 2, i > 6 ? C.light : C.body);
        px(b, tx, ty + 1, C.shade);
      }
      disc(b, tx + 1, ty, 2, C.pat);
      px(b, tx, ty - 1, C.light);
      break;
    }
    case 'shell':
      for (let i = 0; i < 4; i++) {
        ellipseFrame(b, CX, BODY_Y - 1, BODY_RX - i * 2, BODY_RY - i, i & 1 ? C.pat : mix(C.pat, C.light, 0.4));
      }
      ellipseFrame(b, CX, BODY_Y - 1, BODY_RX + 1, BODY_RY + 1, C.rim);
      break;
    case 'quills': {
      b.solid = false;
      for (let a = 190; a <= 350; a += 11) {
        const rad = (a * Math.PI) / 180;
        const x0 = CX + Math.cos(rad) * (BODY_RX - 1);
        const y0 = BODY_Y + Math.sin(rad) * (BODY_RY - 1);
        line(b, x0, y0, x0 + Math.cos(rad) * 6, y0 + Math.sin(rad) * 6, (a / 11) % 2 ? C.quillA : C.quillB);
      }
      b.solid = true;
      break;
    }
    case 'hump':
      ellipse(b, CX - 2, BODY_Y - BODY_RY, 5, 4, C.body);
      ellipse(b, CX - 2, BODY_Y - BODY_RY - 1, 4, 2, C.light);
      break;
    case 'flipper':
      for (const side of [-1, 1]) {
        mtri(b, CX + side * (BODY_RX - 2), BODY_Y, CX + side * (BODY_RX + 6), BODY_Y + 5, CX + side * (BODY_RX - 1), BODY_Y + 5, C.shade);
      }
      tri(b, CX + BODY_RX - 1, BODY_Y + 2, CX + BODY_RX + 8, BODY_Y - 2, CX + BODY_RX + 8, BODY_Y + 6, C.light);
      break;
    case 'plume':
      for (let i = 0; i < 7; i++) {
        const h = 5 + Math.round(Math.sin((i / 6) * Math.PI) * 5);
        rect(b, CX + BODY_RX - 2 + i, BODY_Y - 3 - h, 1, h, i & 1 ? C.pat : C.light);
        px(b, CX + BODY_RX - 2 + i, BODY_Y - 3 - h, C.WH);
      }
      break;
    case 'antenna':
      b.solid = false;
      for (const side of [-1, 1]) {
        line(b, CX + side * 2, HEAD_Y - HEAD_R, CX + side * 6, HEAD_Y - HEAD_R - 7, C.rim);
        disc(b, CX + side * 6, HEAD_Y - HEAD_R - 8, 1, C.pat);
      }
      b.solid = true;
      break;
    case 'gill':
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          for (let j = 0; j < 4; j++) px(b, CX + side * (HEAD_R - 1 + i * 2), HEAD_Y - 2 + j, mix(C.pat, C.light, j / 4));
        }
      }
      break;
    case 'sail':
      for (let i = 0; i < 11; i++) {
        const h = 3 + Math.round(Math.sin((i / 10) * Math.PI) * 7);
        rect(b, CX - 5 + i, BODY_Y - BODY_RY - h, 1, h, i & 1 ? C.light : C.pat);
      }
      break;
    default: break;
  }
}

/* ------------------------------------------------------------------- bake */

export function bakeAnimal(recipe, opts = {}) {
  const rc = Object.assign({}, DEFAULT_RECIPE, recipe || {});
  if (opts.blink) rc.__blink = true;
  const tone = makeTone(opts);
  const C = colourSet(rc, tone);
  const b = makeBoard(SPRITE_SIZE, SPRITE_SIZE);
  if (!b.canvas) {
    return { canvas: null, w: SPRITE_SIZE, h: SPRITE_SIZE, cx: CX, cy: BODY_Y, r: BODY_RX };
  }

  // back-to-front: things behind the body, the body, the head, then things in front
  if (rc.extra === 'wing' || rc.extra === 'plume' || rc.extra === 'sail' || rc.extra === 'tail') extra(b, rc, C);
  shadedOval(b, CX, BODY_Y, BODY_RX, BODY_RY, C, { belly: true });
  patternPass(b, rc, C);
  legs(b, rc, C);
  if (rc.extra === 'shell' || rc.extra === 'quills' || rc.extra === 'hump' || rc.extra === 'flipper') extra(b, rc, C);
  ears(b, rc, C);
  shadedOval(b, CX, HEAD_Y, HEAD_R, HEAD_R - 1, C, {});
  if (rc.extra === 'mane' || rc.extra === 'gill' || rc.extra === 'antenna') extra(b, rc, C);
  face(b, rc, C);
  // a specular kiss on the crown, stamped last so the pattern cannot bury it
  px(b, CX - 3, HEAD_Y - 4, C.hi);
  px(b, CX - 2, HEAD_Y - 5, C.WH);
  outline(b, opts.dim ? mix('ink', 'shadow', 0.5) : 'ink');
  if (opts.glowRing) ellipseFrame(b, CX, BODY_Y, BODY_RX + 2, BODY_RY + 2, opts.glowRing);

  return { canvas: b.canvas, w: SPRITE_SIZE, h: SPRITE_SIZE, cx: CX, cy: BODY_Y, r: BODY_RX, mask: b.occ };
}

/* ------------------------------------------------------------------ cache */

const cache = new Map();
const iconCache = new Map();

function keyFor(animal, o) {
  return [
    animal && animal.id ? animal.id : 'x',
    o && o.tint ? o.tint : '', o && o.tintAmt !== undefined ? o.tintAmt : '',
    o && o.dim ? Math.round(o.dim * 4) : 0,
    o && o.blink ? 1 : 0,
  ].join('|');
}

export function getAnimalSprite(animal, o = {}) {
  const k = keyFor(animal, o);
  let hit = cache.get(k);
  if (hit) return hit;
  hit = bakeAnimal(animal && animal.sprite, o);
  if (cache.size > CACHE_CAP) cache.clear();
  cache.set(k, hit);
  return hit;
}

export function clearSpriteCache() { cache.clear(); iconCache.clear(); }
export function spriteCacheSize() { return cache.size + iconCache.size; }

/* -------------------------------------------------------------------- draw */

function blitPart(g, src, sx0, sy0, sw, sh, dx, dy, dw, dh, flip) {
  if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
  g.save();
  g.imageSmoothingEnabled = false;
  if (flip) {
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    g.drawImage(src, sx0, sy0, sw, sh, 0, 0, dw, dh);
  } else {
    g.drawImage(src, sx0, sy0, sw, sh, dx, dy, dw, dh);
  }
  g.restore();
}

/**
 * Draw an animal with its BODY CENTRE at (sx, sy).
 * opts: {scale=1, squash=0, blink=0, bob=0, flip=false, tint, tintAmt, dim, glow, angle}
 */
export function drawAnimal(g, animal, sx, sy, opts = {}) {
  const scale = Math.max(0.05, opts.scale || 1);
  const blink = (typeof opts.blink === 'number' ? opts.blink : (opts.blink ? 1 : 0)) > 0.45;
  const sp = getAnimalSprite(animal, {
    tint: opts.tint, tintAmt: opts.tintAmt, dim: opts.dim, blink,
  });
  sx = R(sx); sy = R(sy) - R(opts.bob || 0);

  if (opts.glow) {
    const prev = g.globalAlpha;
    if (opts.glowAlpha !== undefined) g.globalAlpha = opts.glowAlpha;
    ellipseFrame(g, sx, sy, R(sp.r * scale) + 3, R(sp.r * scale * 0.8) + 3,
      opts.glow === true ? 'gold' : opts.glow);
    g.globalAlpha = prev;
  }

  if (!sp.canvas) { disc(g, sx, sy, sp.r * scale, 'grey1'); return sp; }

  const sq = Math.max(-0.6, Math.min(0.9, opts.squash || 0));
  const dw = Math.max(1, R(sp.w * scale * (1 + sq * 0.3)));
  const dh = Math.max(1, R(sp.h * scale * (1 - sq * 0.34)));
  const kx = dw / sp.w, ky = dh / sp.h;
  const x0 = R(sx - sp.cx * kx);
  // pin the feet: the sprite's contact point is the bottom of the leg band
  const y0 = R(sy + (sp.h - sp.cy) * ky * 0.42 - sp.h * ky + (sp.h - sp.cy) * ky * 0.58);
  const flip = !!opts.flip;

  const lean = opts.angle ? Math.max(-1, Math.min(1, R(Math.sin(opts.angle) * 1.3))) : 0;
  if (lean === 0) {
    blitPart(g, sp.canvas, 0, 0, sp.w, sp.h, x0, y0, dw, dh, flip);
  } else {
    const cut = HEAD_Y + HEAD_R;
    const hTop = Math.max(1, R(cut * ky));
    blitPart(g, sp.canvas, 0, 0, sp.w, cut, x0 + lean, y0, dw, hTop, flip);
    blitPart(g, sp.canvas, 0, cut, sp.w, sp.h - cut, x0, y0 + hTop, dw, Math.max(1, dh - hTop), flip);
  }
  return sp;
}

/* -------------------------------------------------------------------- icon */

/** A head-only badge for HUD lists. */
export function bakeIcon(recipe, size = ICON_SIZE) {
  const rc = Object.assign({}, DEFAULT_RECIPE, recipe || {});
  const C = colourSet(rc, makeTone({}));
  const b = makeBoard(size, size);
  if (!b.canvas) return { canvas: null, w: size, h: size, cx: size / 2, cy: size / 2 };
  const cx = Math.round(size / 2), cy = Math.round(size / 2) + 1;
  const r = Math.round(size * 0.36);
  // ears, cropped to the badge
  if (rc.ears === 'long') {
    for (const side of [-1, 1]) rect(b, cx + side * 2 - 1, cy - r - 4, 2, 5, C.body);
  } else if (rc.ears === 'pointy') {
    for (const side of [-1, 1]) tri(b, cx + side * 2, cy - r + 1, cx + side * 5, cy - r - 4, cx + side * 1, cy - r - 1, C.body);
  } else if (rc.ears === 'horn' || rc.ears === 'antler') {
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) px(b, cx + side * (2 + (i >> 1)), cy - r - i, C.horn);
  } else if (rc.ears !== 'none') {
    for (const side of [-1, 1]) disc(b, cx + side * 3, cy - r + 1, 2, C.body);
  }
  shadedOval(b, cx, cy, r, r - 1, C, {});
  const st = rc.eyeStyle || 'dot';
  for (const side of [-1, 1]) {
    if (st === 'sleepy') rect(b, cx + side * 2 - 1, cy - 1, 2, 1, C.eye);
    else px(b, cx + side * 2, cy - 1, C.eye);
  }
  if (rc.face === 'beak') tri(b, cx - 1, cy + 1, cx + 1, cy + 1, cx, cy + 4, C.beak);
  else ellipse(b, cx, cy + 2, 2, 1, C.muz);
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
  const sp = getAnimalIcon(animal, size);
  const scale = Math.max(1, R(opts.scale || 1));
  if (!sp.canvas) return sp;
  blitPart(g, sp.canvas, 0, 0, sp.w, sp.h,
    R(sx) - R(sp.cx * scale), R(sy) - R(sp.cy * scale),
    sp.w * scale, sp.h * scale, !!opts.flip);
  return sp;
}

/**
 * Flattened dither ellipse on the felt. (sx, sy) is the contact point.
 * opts: {flat=0.34, color='ink', alpha=1, spread=1}
 */
export function drawAnimalShadow(g, sx, sy, r, opts = {}) {
  const rx = Math.max(1, R(r * (opts.spread !== undefined ? opts.spread : 1)));
  const ry = Math.max(1, R(rx * (opts.flat !== undefined ? opts.flat : 0.34)));
  const cx = R(sx), cy = R(sy);
  const prev = g.globalAlpha;
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  g.fillStyle = col(opts.color || 'ink');
  for (let dy = -ry; dy <= ry; dy++) {
    const k = 1 - (dy * dy) / (ry * ry);
    if (k < 0) continue;
    const dxo = Math.floor(rx * Math.sqrt(k) + 0.4);
    if (dxo < 0) continue;
    const dxi = Math.floor(dxo * 0.58);
    g.fillRect(cx - dxi, cy + dy, dxi * 2 + 1, 1);
    const y = cy + dy;
    for (let x = cx - dxo; x < cx - dxi; x++) if (((x + y) & 1) === 0) g.fillRect(x, y, 1, 1);
    for (let x = cx + dxi + 1; x <= cx + dxo; x++) if (((x + y) & 1) === 0) g.fillRect(x, y, 1, 1);
  }
  g.globalAlpha = prev;
  void P;
}

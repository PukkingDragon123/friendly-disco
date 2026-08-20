// Procedural animal sprite factory.
//
// A sprite RECIPE (DESIGN 9.3) is baked ONCE into a 20x20 offscreen canvas and
// memoised, so an animal costs one drawImage per frame. The creature is a shaded
// sphere -- the ball the physics actually moves -- with features drawn BEHIND and
// IN FRONT of it, never merged into it, so the silhouette still reads at 20px:
// ears/horns/antlers poke above the crown, tails/wings/flippers break the sides,
// and the face sits in the lower middle of the sphere.
//
// Sizing: table.js renders a BALL_R=5.2 ball at 10.4px radius and blits sprites at
// scale 1, so the 20x20 cell is the ball's screen footprint. The body sphere is
// 15px across and the remaining margin is spent on features, which is what makes
// the whole silhouette (not just the body) fill the ball.
//
// Two rules keep 72 combinations from turning into 72 blobs:
//   1. every feature has to break the circle somewhere -- a shape that stays
//      inside the sphere is invisible at this size;
//   2. patterns are evaluated in a spherical frame TILTED toward the viewer, so
//      stripes and bands bend around the body and bunch up at the limb instead of
//      lying on it like a decal.
//
// Light comes from the upper-left. shadeDisc's term is -(n.l) + nz*0.55, so the
// light vector is handed over POSITIVE to put the terminator on the lower-right.
// A side effect: shadeDisc's `hi` tier is unreachable at that angle, so the
// specular is stamped explicitly after the pattern pass (which would bury it).

import { col, mix } from '../core/palette.js';
import {
  makeCanvas, shadeDisc, disc, ellipse, box, rect, px, line, tri, ring,
} from '../core/pixel.js';

export const SPRITE_SIZE = 20;
export const ICON_SIZE = 10;

const R = Math.round;
const CX = 10, CY = 11, BODY_R = 7.8;   // body centre + radius inside the 20x20 cell
const MIR = CX * 2;                     // mirror axis: x -> MIR - x
const LX = 0.45, LY = 0.55;             // light direction handed to shadeDisc
const EYE_Y = CY - 1;                   // eye row
const FACE_Y = CY + 4;                  // nose row
const EAR_X = CX - 4;                   // left ear axis
const TILT = 0.45;                      // pattern-frame tilt (radians) toward viewer
const CT = Math.cos(TILT), ST = Math.sin(TILT);
const BAY = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
const CACHE_CAP = 900;                  // 20x20 canvases; a full roster is ~700

const frac = (v) => v - Math.floor(v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const quant = (v, step) => Math.round(v / step) * step;

export const DEFAULT_RECIPE = {
  body: 'grey1', shade: 'grey0', light: 'grey2', belly: 'bone',
  eye: 'ink', eyeStyle: 'dot', ears: 'round', face: 'muzzle',
  pattern: 'none', patternColor: 'ink', extra: 'none',
};

/* ------------------------------------------------------------------ board */
// A recording wrapper around the bake context: it forwards fillStyle/fillRect to
// the real 2D context and keeps two masks. `occ` = anything drawn, so the outline
// pass never paints over art. `core` = chunky art only, so the outline pass does
// not fatten 1px filaments (whiskers, antennae, quills) into black bars.

function makeBoard(w, h) {
  const mk = makeCanvas(w, h);
  const ctx = mk ? mk.g : null;
  const occ = new Uint8Array(w * h);
  const core = new Uint8Array(w * h);
  let fs = col('white');
  const b = {
    w, h, occ, core, canvas: mk ? mk.canvas : null, ctx,
    solid: true,
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

/** 1px silhouette outline -- the single biggest legibility win on green felt. */
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
const mrect = (b, x, y, w, h, c) => {
  rect(b, x, y, w, h, c); rect(b, MIR - x - w + 1, y, w, h, c);
};
const mtri = (b, x0, y0, x1, y1, x2, y2, c) => {
  tri(b, x0, y0, x1, y1, x2, y2, c);
  tri(b, MIR - x0, y0, MIR - x1, y1, MIR - x2, y2, c);
};
const mline = (b, x0, y0, x1, y1, c) => {
  line(b, x0, y0, x1, y1, c); line(b, MIR - x0, y0, MIR - x1, y1, c);
};
const mchain = (b, pts, c) => { for (const p of pts) mpx(b, p[0], p[1], c); };
const mspans = (b, rows, c) => { for (const r of rows) mrect(b, r[1], r[0], r[2], 1, c); };

/** Topmost body row at column x, or null outside the sphere. */
function topY(x, cx, cy, r) {
  const dx = x - cx;
  const k = r * r - dx * dx;
  if (k < 0) return null;
  return cy - Math.floor(Math.sqrt(k));
}

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

// Every colour the features need, derived once per bake. Ramps are indexed by the
// same shading tiers shadeDisc uses: 0 hi, 1 light, 2 base, 3 dark, 4 deep.
function colourSet(rc, tone) {
  const WH = tone('white'), IK = tone('ink');
  const body = tone(rc.body), light = tone(rc.light), shade = tone(rc.shade);
  const belly = tone(rc.belly), pat = tone(rc.patternColor), eye = tone(rc.eye);
  const deepc = mix(shade, IK, 0.45);
  return {
    WH, IK, body, light, shade, belly, pat, eye, deepc,
    hi: mix(light, WH, 0.55),
    rim: mix(shade, IK, 0.7),
    lid: mix(shade, IK, 0.35),
    bone: tone('bone'),
    metal: tone('brass2'),
    metalDark: tone('brass0'),
    beak: mix(tone('amber'), tone('orange'), 0.4),
    horn: mix(tone('bone'), tone('sand'), 0.3),
    earIn: mix(body, tone('pink'), 0.45),
    muz: mix(belly, WH, 0.18),
    snout: mix(belly, tone('pink'), 0.5),
    whisk: mix(WH, belly, 0.25),
    gillC: mix(tone('pink'), light, 0.2),
    wing: mix(light, pat, 0.25),
    tailTip: mix(WH, belly, 0.3),
    flip: mix(shade, body, 0.35),
    mane0: shade,
    mane1: mix(shade, pat, 0.55),
    quill0: IK,
    quill1: mix(tone('bone'), shade, 0.3),
    bodyRamp: [mix(light, WH, 0.45), light, body, shade, deepc],
    patRamp: [mix(pat, WH, 0.35), mix(pat, WH, 0.14), pat, mix(pat, IK, 0.28), mix(pat, IK, 0.5)],
    litRamp: [WH, mix(light, WH, 0.55), mix(light, WH, 0.3), light, body],
    bellyRamp: [mix(belly, WH, 0.4), mix(belly, WH, 0.18), belly,
      mix(belly, shade, 0.42), mix(belly, shade, 0.72)],
  };
}

/* ----------------------------------------------------------------- pattern */

function hash2(a, b, s) {
  let n = Math.imul((a | 0) + 0x1f1f, 374761393) ^ Math.imul((b | 0) + 0x2c2c, 668265263)
    ^ Math.imul((s | 0) + 1, 2246822519);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  n = (n ^ (n >>> 16)) >>> 0;
  return n / 4294967296;
}

function strHash(s) {
  let h = 2166136261;
  const t = String(s);
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0) % 65536;
}

// Cow-style blotches, placed in the tilted (lon,lat) frame so they curve.
const PATCHES = [
  [-0.72, -0.34, 0.46, 0.42],
  [0.74, 0.16, 0.40, 0.48],
  [0.04, 0.92, 0.56, 0.30],
  [-0.34, -1.02, 0.36, 0.26],
];

/**
 * Pattern test in a spherical frame tilted toward the viewer.
 * Returns 0 = plain body, 1 = pattern colour, 2 = lit accent.
 */
function patAt(kind, nx, ny, nz, seed) {
  if (!kind || kind === 'none') return 0;
  const ay = ny * CT + nz * ST;
  const az = -ny * ST + nz * CT;
  const lat = Math.asin(ay < -1 ? -1 : ay > 1 ? 1 : ay);
  const lon = Math.atan2(nx, az);
  switch (kind) {
    case 'stripes': {
      // latitude term tapers the stripes so they read as flanks, not a barcode
      const w = Math.sin(lon * 4.1 + Math.sin(lat * 1.7) * 0.8);
      return w > 0.38 ? 1 : 0;
    }
    case 'bands':
      return frac(lat / 0.52 + 0.22) < 0.46 ? 1 : 0;
    case 'plates': {
      const f = frac(lat / 0.40 + 0.15);
      if (f > 0.80) return 1;
      if (f < 0.16) return 2;
      return 0;
    }
    case 'spots': {
      const cw = 0.56;
      const gu = Math.floor(lon / cw), gv = Math.floor(lat / cw);
      const h = hash2(gu, gv, seed);
      if (h > 0.66) return 0;
      const cu = (gu + 0.5 + (hash2(gu, gv, seed + 7) - 0.5) * 0.5) * cw;
      const cv = (gv + 0.5 + (hash2(gu, gv, seed + 13) - 0.5) * 0.5) * cw;
      const du = (lon - cu) / cw, dv = (lat - cv) / cw;
      return du * du + dv * dv < 0.05 + h * 0.16 ? 1 : 0;
    }
    case 'freckles': {
      const cw = 0.26;
      return hash2(Math.floor(lon / cw), Math.floor(lat / cw), seed + 3) < 0.15 ? 1 : 0;
    }
    case 'patches': {
      for (let i = 0; i < PATCHES.length; i++) {
        const p = PATCHES[i];
        const du = (lon - p[0]) / p[2], dv = (lat - p[1]) / p[3];
        if (du * du + dv * dv < 1) return 1;
      }
      return 0;
    }
    case 'scales': {
      const rowH = 0.34, colW = 0.42;
      const row = Math.floor(lat / rowH);
      const fu = frac(lon / colW + ((row & 1) ? 0.5 : 0));
      const fv = frac(lat / rowH);
      if (fv > 0.72) return 1;                              // scale lower edge
      if (fu < 0.20) return 1;                              // scale side edge
      if (fv < 0.30 && fu > 0.44 && fu < 0.80) return 2;    // lit crown
      return 0;
    }
    case 'wool': {
      const cw = 0.36;
      const gu = Math.floor(lon / cw), gv = Math.floor(lat / cw);
      const h = hash2(gu, gv, seed);
      const fu = frac(lon / cw), fv = frac(lat / cw);
      if (fv > 0.74 || (fu < 0.18 && h < 0.7)) return 1;    // creases between curls
      if (h < 0.6 && fv < 0.46 && fu > 0.22) return 2;      // curl highlight
      return 0;
    }
    default: return 0;
  }
}

/** Lower-front chest patch, faded in with an ordered dither so it never hard-edges. */
function bellyAt(nx, ny, nz, dx, dy) {
  if (nz < 0.14) return false;
  const t = (ny - 0.10) / 0.30;
  if (t <= 0) return false;
  if (Math.abs(nx) > 0.48 + 0.26 * ny) return false;
  if (t >= 1) return true;
  return BAY[(dy + 8) & 3][(dx + 8) & 3] < t * 16;
}

/** Belly + pattern in one masked pass over the sphere, shaded by the same tiers. */
function paintSkin(b, rc, cs, cx, cy, r, wantBelly) {
  const kind = rc.pattern || 'none';
  if (kind === 'none' && !wantBelly) return;
  const seed = cs.pseed;
  const ir = Math.ceil(r);
  const rr = r * r;
  for (let dy = -ir; dy <= ir; dy++) {
    for (let dx = -ir; dx <= ir; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > rr) continue;
      const nx = dx / r, ny = dy / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lam = -(nx * LX + ny * LY) + nz * 0.55;
      if (Math.sqrt(d2) / r > 0.88 && lam < 0.55) continue;  // leave the dark rim alone
      let ramp = null;
      if (wantBelly && bellyAt(nx, ny, nz, dx, dy)) ramp = cs.bellyRamp;
      const hit = patAt(kind, nx, ny, nz, seed);
      if (hit === 1) ramp = cs.patRamp;
      else if (hit === 2) ramp = cs.litRamp;
      if (!ramp) continue;
      const tier = lam > 0.74 ? 1 : lam > 0.36 ? 2 : lam > 0.08 ? 3 : 4;
      b.fillStyle = ramp[tier];
      b.fillRect(cx + dx, cy + dy, 1, 1);
    }
  }
}

/* -------------------------------------------------------------------- ears */
// Drawn BEFORE the body (except 'shell'), so the sphere swallows their roots and
// only what pokes past the crown survives.

function drawEars(b, rc, cs) {
  const L = EAR_X;
  switch (rc.ears) {
    case 'round':
      disc(b, L, CY - 7, 2.2, cs.shade);
      mrect(b, L - 1, CY - 6, 3, 3, cs.shade);
      mpx(b, L, CY - 7, cs.earIn);
      mpx(b, L, CY - 8, cs.earIn);
      break;
    case 'pointy':
      mtri(b, L - 2, CY - 3, L + 2, CY - 3, L - 1, CY - 10, cs.shade);
      mtri(b, L - 1, CY - 5, L + 1, CY - 5, L - 1, CY - 8, cs.earIn);
      break;
    case 'long': {
      const rows = [[0, 4, 2], [1, 4, 2], [2, 4, 2], [3, 4, 2], [4, 5, 2],
        [5, 5, 2], [6, 5, 2], [7, 6, 2], [8, 6, 2]];
      mspans(b, rows, cs.shade);
      for (let y = 1; y <= 6; y++) mpx(b, y >= 4 ? 6 : 5, y, cs.earIn);
      break;
    }
    case 'tiny':
      mrect(b, L - 1, CY - 7, 3, 2, cs.shade);
      mrect(b, L, CY - 5, 2, 2, cs.shade);
      break;
    case 'tuft':
      b.solid = false;
      mchain(b, [[7, 6], [6, 5], [6, 4], [5, 3], [5, 2]], cs.shade);
      mchain(b, [[8, 5], [8, 4], [7, 3]], cs.mane1);
      b.solid = true;
      break;
    case 'horn':
      mrect(b, 7, CY - 7, 2, 2, cs.horn);
      mchain(b, [[6, 3], [6, 2], [5, 1]], cs.horn);
      mpx(b, 5, 1, cs.WH);
      break;
    case 'antler':
      mchain(b, [[7, 5], [7, 4], [6, 3], [6, 2], [5, 1]], cs.horn);
      mchain(b, [[4, 2], [3, 1]], cs.horn);            // outer tine
      mchain(b, [[8, 2], [8, 1]], cs.horn);            // inner tine
      mpx(b, 5, 1, cs.WH);
      break;
    case 'crest': {
      const tops = [[8, 3], [9, 1], [10, 0], [11, 1], [12, 3]];
      for (const [x, ty] of tops) {
        rect(b, x, ty, 1, 5 - ty, cs.pat);
        px(b, x, ty, mix(cs.pat, cs.WH, 0.45));
      }
      break;
    }
    case 'fin':
      tri(b, 8, CY - 5, 14, CY - 5, 13, CY - 11, cs.shade);
      line(b, 13, CY - 11, 8, CY - 5, mix(cs.light, cs.pat, 0.45));
      break;
    case 'frill': {
      b.solid = false;
      for (let i = 0; i < 7; i++) {
        const a = -2.96 + i * 0.44;
        const ca = Math.cos(a), sa = Math.sin(a);
        line(b, CX + ca * 7.0, CY + sa * 7.0, CX + ca * 9.7, CY + sa * 9.7,
          i & 1 ? cs.pat : mix(cs.pat, cs.IK, 0.35));
      }
      b.solid = true;
      break;
    }
    default: break;   // 'none', and 'shell' which belongs to the front pass
  }
}

/** ears:'shell' -- a thin plain cap over the crown (front pass). */
function drawShellCap(b, cs) {
  for (let x = 4; x <= 16; x++) {
    const ty = topY(x, CX, CY, BODY_R);
    if (ty === null) continue;
    rect(b, x, ty, 1, 2, cs.pat);
    px(b, x, ty, mix(cs.pat, cs.WH, 0.4));
    px(b, x, ty + 2, mix(cs.pat, cs.IK, 0.45));
  }
}

/* -------------------------------------------------------------------- eyes */

function drawEyes(b, rc, cs, blink) {
  const style = rc.eyeStyle || 'dot';
  for (const s of [-1, 1]) {
    const ex = CX + s * 3;
    const x2 = s < 0 ? ex - 1 : ex;            // left edge of a 2px-wide eye
    if (blink) {
      if (style === 'goggle') {
        rect(b, ex - 1, EYE_Y - 1, 3, 3, cs.metal);
        rect(b, ex - 1, EYE_Y, 3, 1, cs.eye);
      } else {
        rect(b, ex - 1, EYE_Y + 1, 3, 1, cs.lid);
        px(b, ex + s * 2, EYE_Y, cs.lid);
      }
      continue;
    }
    switch (style) {
      case 'wide':
        rect(b, ex - 1, EYE_Y - 2, 3, 1, cs.lid);
        rect(b, ex - 1, EYE_Y - 1, 3, 3, cs.WH);
        rect(b, x2, EYE_Y, 2, 2, cs.eye);
        px(b, x2, EYE_Y, mix(cs.WH, cs.eye, 0.3));
        break;
      case 'sleepy':
        rect(b, ex - 1, EYE_Y, 3, 1, cs.eye);
        px(b, ex + s * 2, EYE_Y - 1, cs.eye);
        px(b, ex, EYE_Y + 1, cs.lid);
        break;
      case 'angry':
        rect(b, x2, EYE_Y, 2, 2, cs.eye);
        px(b, ex + s * 2, EYE_Y - 2, cs.lid);
        px(b, ex + s, EYE_Y - 2, cs.lid);
        px(b, ex, EYE_Y - 1, cs.lid);
        break;
      case 'sparkle':
        rect(b, x2, EYE_Y, 2, 2, cs.eye);
        px(b, x2, EYE_Y, cs.WH);
        px(b, ex + s * 2, EYE_Y - 1, cs.WH);
        px(b, ex + s * 2, EYE_Y + 1, cs.WH);
        break;
      case 'goggle':
        rect(b, ex - 1, EYE_Y - 1, 3, 3, cs.metal);
        px(b, ex - 1, EYE_Y - 1, cs.metalDark);
        px(b, ex + 1, EYE_Y + 1, cs.metalDark);
        px(b, ex, EYE_Y, cs.eye);
        break;
      default:                                  // 'dot'
        rect(b, x2, EYE_Y, 2, 2, cs.eye);
        px(b, x2, EYE_Y, mix(cs.WH, cs.eye, 0.25));
        break;
    }
  }
  if (!blink && style === 'goggle') {
    rect(b, CX - 1, EYE_Y, 3, 1, cs.metalDark);       // bridge
    mrect(b, 3, EYE_Y, 3, 1, cs.metalDark);           // straps
  }
}

/* -------------------------------------------------------------------- face */

function drawFace(b, rc, cs) {
  switch (rc.face) {
    case 'muzzle':
      ellipse(b, CX, FACE_Y, 3.4, 2.1, cs.muz);
      rect(b, CX - 1, FACE_Y - 2, 3, 1, cs.IK);
      px(b, CX, FACE_Y - 1, cs.IK);
      px(b, CX, FACE_Y, cs.deepc);
      mrect(b, CX - 3, FACE_Y + 1, 3, 1, cs.deepc);
      break;
    case 'snout':
      box(b, CX - 3, FACE_Y - 1, 7, 4, cs.snout, 1);
      mrect(b, CX - 2, FACE_Y, 2, 2, mix(cs.IK, cs.shade, 0.25));
      rect(b, CX - 2, FACE_Y + 2, 5, 1, mix(cs.snout, cs.IK, 0.4));
      break;
    case 'beak':
      tri(b, CX - 3, FACE_Y - 3, CX + 3, FACE_Y - 3, CX, FACE_Y + 3, cs.beak);
      rect(b, CX - 2, FACE_Y, 5, 1, mix(cs.beak, cs.IK, 0.45));
      px(b, CX - 1, FACE_Y - 2, mix(cs.beak, cs.IK, 0.3));
      break;
    case 'trunk': {
      const rows = [[FACE_Y - 2, 9], [FACE_Y - 1, 9], [FACE_Y, 10], [FACE_Y + 1, 10],
        [FACE_Y + 2, 11], [FACE_Y + 3, 12]];
      for (const [y, x] of rows) {
        rect(b, x, y, 2, 1, cs.body);
        px(b, x + 1, y, cs.shade);
        if ((y & 1) === 0) px(b, x, y, cs.light);
      }
      px(b, 13, FACE_Y + 3, cs.deepc);
      break;
    }
    case 'whiskers':
      rect(b, CX - 1, FACE_Y - 1, 2, 1, mix(cs.IK, cs.snout, 0.45));
      px(b, CX, FACE_Y, cs.deepc);
      mrect(b, CX - 3, FACE_Y + 1, 3, 1, cs.deepc);
      b.solid = false;
      mline(b, 7, FACE_Y - 1, 0, FACE_Y - 3, cs.whisk);
      mline(b, 7, FACE_Y, 0, FACE_Y, cs.whisk);
      mline(b, 7, FACE_Y + 1, 1, FACE_Y + 3, cs.whisk);
      b.solid = true;
      break;
    case 'tusk':
      rect(b, CX - 2, FACE_Y, 5, 1, cs.deepc);
      mchain(b, [[8, FACE_Y + 1], [7, FACE_Y + 2], [7, FACE_Y + 3], [8, FACE_Y + 4]], cs.bone);
      mpx(b, 8, FACE_Y + 4, cs.WH);
      break;
    case 'mandible':
      rect(b, CX - 1, FACE_Y, 3, 1, mix(cs.IK, cs.deepc, 0.4));
      mchain(b, [[6, FACE_Y], [6, FACE_Y + 1], [7, FACE_Y + 2], [8, FACE_Y + 3]],
        mix(cs.IK, cs.shade, 0.25));
      break;
    default:                                    // 'flat'
      rect(b, CX - 3, FACE_Y, 7, 1, cs.deepc);
      mpx(b, CX - 4, FACE_Y - 1, cs.deepc);
      mpx(b, CX - 1, FACE_Y - 3, cs.deepc);
      break;
  }
}

/* ------------------------------------------------------------------ extras */

function drawExtraBack(b, rc, cs) {
  switch (rc.extra) {
    case 'mane': {
      b.solid = false;
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2;
        const sa = Math.sin(a);
        if (sa > 0.72) continue;                       // keep the belly clear
        const ca = Math.cos(a);
        const r1 = 9.4 + (i & 1) * 0.6;
        line(b, CX + ca * 6.8, CY + sa * 6.8, CX + ca * r1, CY + sa * r1,
          i & 1 ? cs.mane1 : cs.mane0);
        line(b, CX + ca * 6.8 + 1, CY + sa * 6.8, CX + ca * (r1 - 1) + 1,
          CY + sa * (r1 - 1), cs.mane0);
      }
      b.solid = true;
      break;
    }
    case 'wing': {
      const rows = [[5, 4, 2], [6, 3, 3], [7, 2, 3], [8, 1, 3], [9, 0, 3],
        [10, 0, 3], [11, 0, 3], [12, 1, 2], [13, 2, 1]];
      mspans(b, rows, cs.wing);
      mpx(b, 3, 7, cs.shade); mpx(b, 2, 9, cs.shade); mpx(b, 1, 11, cs.shade);
      mpx(b, 4, 5, mix(cs.wing, cs.WH, 0.4));
      break;
    }
    case 'tail': {
      const cells = [[17, 15], [18, 13], [18, 11], [17, 9]];
      for (let i = 0; i < cells.length; i++) {
        rect(b, cells[i][0], cells[i][1], 2, 2, i >= 2 ? cs.tailTip : cs.body);
      }
      px(b, 18, 14, cs.light);
      px(b, 19, 12, cs.shade);
      break;
    }
    case 'quills': {
      b.solid = false;
      for (let i = 0; i < 21; i++) {
        const a = -Math.PI * 1.04 + i * 0.16;
        const sa = Math.sin(a);
        if (sa > 0.24) continue;
        const ca = Math.cos(a);
        line(b, CX + ca * 6.6, CY + sa * 6.6, CX + ca * 9.9, CY + sa * 9.9,
          i & 1 ? cs.quill0 : cs.quill1);
      }
      b.solid = true;
      break;
    }
    case 'hump':
      disc(b, CX + 1, CY - 6, 3.2, cs.body);
      rect(b, CX, CY - 9, 3, 1, cs.light);
      px(b, CX - 1, CY - 8, cs.light);
      rect(b, CX + 4, CY - 6, 1, 2, cs.shade);
      break;
    case 'plume': {
      b.solid = false;
      const roots = [[8, 6], [10, 4], [12, 6]];
      const ends = [[5, 0], [10, 0], [15, 0]];
      for (let i = 0; i < 3; i++) {
        line(b, roots[i][0], roots[i][1], ends[i][0], ends[i][1], cs.pat);
        rect(b, ends[i][0] - 1, ends[i][1], 2, 2, mix(cs.pat, cs.WH, 0.45));
        px(b, ends[i][0], ends[i][1] + 1, cs.pat);
      }
      b.solid = true;
      break;
    }
    case 'antenna':
      b.solid = false;
      mline(b, 8, CY - 6, 4, 1, mix(cs.IK, cs.shade, 0.3));
      mrect(b, 3, 0, 2, 2, cs.pat);
      b.solid = true;
      break;
    case 'sail': {
      tri(b, 7, CY - 5, 15, CY - 6, 13, CY - 12, mix(cs.pat, cs.light, 0.3));
      for (let i = 0; i < 3; i++) {
        line(b, 8 + i * 2, CY - 5, 11 + i, CY - 10, mix(cs.pat, cs.IK, 0.4));
      }
      line(b, 15, CY - 6, 13, CY - 12, mix(cs.pat, cs.IK, 0.55));
      break;
    }
    default: break;   // 'none', plus shell/flipper/gill which are front-pass
  }
}

function drawExtraFront(b, rc, cs) {
  switch (rc.extra) {
    case 'shell': {
      const div = mix(cs.pat, cs.IK, 0.5);
      for (let x = 3; x <= 17; x++) {
        const ty = topY(x, CX, CY, BODY_R);
        if (ty === null) continue;
        rect(b, x, ty, 1, 4, cs.pat);
        px(b, x, ty, mix(cs.pat, cs.WH, 0.3));
        px(b, x, ty + 4, div);
        if (x === 6 || x === 10 || x === 14) rect(b, x, ty + 1, 1, 3, div);
      }
      px(b, 6, 7, mix(cs.pat, cs.WH, 0.55));
      px(b, 7, 7, mix(cs.pat, cs.WH, 0.35));
      break;
    }
    case 'flipper': {
      const rows = [[12, 4, 2], [13, 3, 3], [14, 2, 3], [15, 2, 3], [16, 3, 2]];
      mspans(b, rows, cs.flip);
      mpx(b, 5, 12, mix(cs.flip, cs.WH, 0.35));
      mpx(b, 3, 16, mix(cs.flip, cs.IK, 0.4));
      break;
    }
    case 'gill':
      mpx(b, 5, 10, mix(cs.shade, cs.IK, 0.45));
      mpx(b, 5, 12, mix(cs.shade, cs.IK, 0.45));
      mpx(b, 5, 14, mix(cs.shade, cs.IK, 0.45));
      b.solid = false;
      mline(b, 4, 10, 1, 8, cs.gillC);
      mline(b, 4, 12, 0, 12, cs.gillC);
      mline(b, 4, 14, 1, 16, cs.gillC);
      b.solid = true;
      break;
    default: break;
  }
}

/* ------------------------------------------------------------------- bake  */

function normalize(recipe) {
  const src = recipe && recipe.sprite ? recipe.sprite : recipe;
  if (!src || typeof src !== 'object') return DEFAULT_RECIPE;
  const out = {};
  for (const k in DEFAULT_RECIPE) {
    out[k] = src[k] !== undefined && src[k] !== null ? src[k] : DEFAULT_RECIPE[k];
  }
  return out;
}

/**
 * Bake one animal into a 20x20 canvas.
 * opts: {tint, tintAmt, dim, blink}
 * -> {canvas, w, h, cx, cy, r, mask}
 */
export function bakeAnimal(recipe, opts = {}) {
  const rc = normalize(recipe);
  const cs = colourSet(rc, makeTone(opts));
  cs.pseed = strHash(`${rc.pattern}|${rc.patternColor}|${rc.body}|${rc.extra}`);
  const b = makeBoard(SPRITE_SIZE, SPRITE_SIZE);

  drawExtraBack(b, rc, cs);
  drawEars(b, rc, cs);

  shadeDisc(b, CX, CY, BODY_R, {
    base: cs.body, light: cs.light, hi: cs.bodyRamp[0],
    dark: cs.shade, deep: cs.bodyRamp[4], rim: cs.rim, lx: LX, ly: LY,
  });
  paintSkin(b, rc, cs, CX, CY, BODY_R, !!rc.belly);

  // specular last of the body pass -- the pattern would otherwise bury it
  px(b, CX - 3, CY - 4, cs.hi);
  px(b, CX - 2, CY - 4, cs.hi);
  px(b, CX - 4, CY - 3, cs.hi);
  px(b, CX - 3, CY - 3, cs.hi);

  if (rc.ears === 'shell') drawShellCap(b, cs);
  drawExtraFront(b, rc, cs);
  drawFace(b, rc, cs);
  drawEyes(b, rc, cs, !!opts.blink);

  outline(b, mix(cs.IK, cs.rim, 0.2));

  return {
    canvas: b.canvas, w: SPRITE_SIZE, h: SPRITE_SIZE,
    cx: CX, cy: CY, r: BODY_R, mask: b.occ,
  };
}

/**
 * Head-only badge for HUD rows and the habitat vitrine.
 * -> {canvas, w, h, cx, cy, r}
 */
export function bakeIcon(recipe, size = ICON_SIZE) {
  const rc = normalize(recipe);
  const s = Math.max(6, R(size));
  const cs = colourSet(rc, makeTone({}));
  cs.pseed = strHash(`${rc.pattern}|${rc.patternColor}|${rc.body}|${rc.extra}`);
  const b = makeBoard(s, s);
  const cx = s >> 1, cy = R(s * 0.6), r = s * 0.33;
  const top = R(cy - r);
  const ex = Math.max(1, R(r * 0.62));
  const eL = cx - ex, eR = cx + ex;

  // --- behind the head
  switch (rc.extra) {
    case 'mane':
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        if (Math.sin(a) > 0.7) continue;
        px(b, cx + Math.cos(a) * (r + 1.5), cy + Math.sin(a) * (r + 1.5),
          i & 1 ? cs.mane1 : cs.mane0);
      }
      break;
    case 'wing':
      rect(b, 0, cy - 1, 2, 3, cs.wing); rect(b, s - 2, cy - 1, 2, 3, cs.wing);
      break;
    case 'tail':
      rect(b, s - 2, cy + 1, 2, 2, cs.tailTip);
      break;
    case 'quills':
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI * 0.98 + i * 0.38;
        px(b, cx + Math.cos(a) * (r + 1.6), cy + Math.sin(a) * (r + 1.6),
          i & 1 ? cs.quill0 : cs.quill1);
      }
      break;
    case 'hump':
      rect(b, cx - 1, top - 2, 3, 3, cs.body);
      break;
    case 'plume':
      px(b, cx, top - 3, cs.pat); px(b, cx - 1, top - 2, cs.pat); px(b, cx + 1, top - 2, cs.pat);
      break;
    case 'antenna':
      px(b, eL, top - 2, cs.IK); px(b, eL - 1, top - 3, cs.pat);
      px(b, eR, top - 2, cs.IK); px(b, eR + 1, top - 3, cs.pat);
      break;
    case 'sail':
      tri(b, cx, top, cx + 3, top, cx + 1, top - 3, mix(cs.pat, cs.light, 0.3));
      break;
    case 'flipper':
      rect(b, cx - R(r) - 1, cy + 1, 1, 2, cs.flip);
      rect(b, cx + R(r) + 1, cy + 1, 1, 2, cs.flip);
      break;
    default: break;
  }

  // --- ears, reduced to a 2px silhouette cue
  switch (rc.ears) {
    case 'long':
      rect(b, eL, top - 3, 1, 4, cs.shade); rect(b, eR, top - 3, 1, 4, cs.shade);
      break;
    case 'pointy':
      px(b, eL, top - 1, cs.shade); px(b, eL - 1, top - 2, cs.shade);
      px(b, eR, top - 1, cs.shade); px(b, eR + 1, top - 2, cs.shade);
      break;
    case 'round':
      rect(b, eL - 1, top - 2, 2, 2, cs.shade); rect(b, eR, top - 2, 2, 2, cs.shade);
      break;
    case 'tiny':
      px(b, eL, top - 1, cs.shade); px(b, eR, top - 1, cs.shade);
      break;
    case 'tuft':
      px(b, eL, top - 1, cs.shade); px(b, eL - 1, top - 2, cs.mane1);
      px(b, eR, top - 1, cs.shade); px(b, eR + 1, top - 2, cs.mane1);
      break;
    case 'horn':
      rect(b, eL, top - 2, 1, 2, cs.horn); rect(b, eR, top - 2, 1, 2, cs.horn);
      break;
    case 'antler':
      rect(b, eL, top - 2, 1, 2, cs.horn); px(b, eL - 1, top - 3, cs.horn);
      rect(b, eR, top - 2, 1, 2, cs.horn); px(b, eR + 1, top - 3, cs.horn);
      break;
    case 'crest':
      px(b, cx - 1, top - 1, cs.pat); px(b, cx, top - 2, cs.pat); px(b, cx + 1, top - 1, cs.pat);
      break;
    case 'fin':
      tri(b, cx - 1, top, cx + 2, top, cx + 1, top - 3, cs.shade);
      break;
    case 'frill':
      px(b, cx - R(r) - 1, top + 1, cs.pat); px(b, cx + R(r) + 1, top + 1, cs.pat);
      px(b, cx - 2, top - 1, cs.pat); px(b, cx + 2, top - 1, cs.pat);
      break;
    default: break;
  }

  // --- head
  shadeDisc(b, cx, cy, r, {
    base: cs.body, light: cs.light, hi: cs.bodyRamp[0],
    dark: cs.shade, deep: cs.bodyRamp[4], rim: cs.rim, lx: LX, ly: LY,
  });
  paintSkin(b, rc, cs, cx, cy, r, false);
  px(b, cx - 1, cy - 2, cs.hi);

  if (rc.ears === 'shell' || rc.extra === 'shell') {
    for (let x = cx - 2; x <= cx + 2; x++) {
      const ty = topY(x, cx, cy, r);
      if (ty === null) continue;
      px(b, x, ty, cs.pat);
      if (rc.extra === 'shell') px(b, x, ty + 1, cs.pat);
    }
  }

  // --- face: two eye pixels plus one mouth cue read as a head at any size
  px(b, eL, cy, cs.eye);
  px(b, eR, cy, cs.eye);
  switch (rc.face) {
    case 'beak':
      px(b, cx, cy + 1, cs.beak); px(b, cx, cy + 2, cs.beak); break;
    case 'trunk':
      px(b, cx, cy + 1, cs.shade); px(b, cx + 1, cy + 2, cs.shade);
      px(b, cx + 1, cy + 3, cs.shade); break;
    case 'tusk':
      px(b, cx - 1, cy + 2, cs.bone); px(b, cx + 1, cy + 2, cs.bone);
      px(b, cx, cy + 1, cs.deepc); break;
    case 'mandible':
      px(b, cx - 1, cy + 2, cs.IK); px(b, cx + 1, cy + 2, cs.IK); break;
    case 'whiskers':
      px(b, cx, cy + 1, cs.deepc);
      b.solid = false;
      line(b, cx - 1, cy + 1, 0, cy, cs.whisk);
      line(b, cx + 1, cy + 1, s - 1, cy, cs.whisk);
      b.solid = true;
      break;
    case 'snout':
      rect(b, cx - 1, cy + 1, 3, 2, cs.snout); px(b, cx, cy + 2, cs.deepc); break;
    case 'muzzle':
      rect(b, cx - 1, cy + 1, 3, 2, cs.muz); px(b, cx, cy + 1, cs.IK); break;
    default:
      rect(b, cx - 1, cy + 2, 3, 1, cs.deepc); break;
  }

  if (rc.extra === 'gill') {
    px(b, cx - R(r) - 1, cy + 1, cs.gillC); px(b, cx + R(r) + 1, cy + 1, cs.gillC);
  }

  outline(b, mix(cs.IK, cs.rim, 0.2));
  return { canvas: b.canvas, w: s, h: s, cx, cy, r, mask: b.occ };
}

/* ------------------------------------------------------------------ cache  */

const spriteCache = new Map();
const iconCache = new Map();

// dim/tint arrive from per-frame animations, so they are quantised before they
// reach the cache key AND the bake -- otherwise a fading ball would bake a new
// canvas every frame.
function bakeOpts(o) {
  return {
    tint: o && o.tint ? o.tint : null,
    tintAmt: quant(o && o.tintAmt !== undefined ? clamp01(o.tintAmt) : 0.38, 0.125),
    dim: quant(o && o.dim ? clamp01(o.dim) : 0, 0.25),
    blink: !!(o && o.blink),
  };
}

const keyOf = (bo) => `${bo.tint || '-'}:${bo.tintAmt}:${bo.dim}:${bo.blink ? 1 : 0}`;

function idOf(animal, rc) {
  if (animal && animal.id) return String(animal.id);
  return 'r' + strHash(Object.keys(DEFAULT_RECIPE).map((k) => rc[k]).join(','));
}

/** Memoised bake. `animal` may be an animal record or a bare sprite recipe. */
export function getAnimalSprite(animal, opts = {}) {
  const rc = normalize(animal);
  const bo = bakeOpts(opts);
  const key = idOf(animal, rc) + '|' + keyOf(bo);
  let sp = spriteCache.get(key);
  if (!sp) {
    if (spriteCache.size > CACHE_CAP) spriteCache.clear();
    sp = bakeAnimal(rc, bo);
    spriteCache.set(key, sp);
  }
  return sp;
}

export function getAnimalIcon(animal, size = ICON_SIZE) {
  const rc = normalize(animal);
  const s = Math.max(6, R(size));
  const key = idOf(animal, rc) + '|i' + s;
  let sp = iconCache.get(key);
  if (!sp) {
    if (iconCache.size > CACHE_CAP) iconCache.clear();
    sp = bakeIcon(rc, s);
    iconCache.set(key, sp);
  }
  return sp;
}

export function clearSpriteCache() {
  spriteCache.clear();
  iconCache.clear();
}

export function spriteCacheSize() { return spriteCache.size + iconCache.size; }

/* ------------------------------------------------------------------- draw  */

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
 * Draw an animal with its body centre at (sx, sy).
 * opts: {scale=1, squash=0, blink=0, bob=0, flip=false, tint, tintAmt, dim,
 *        glow, glowAlpha, angle}
 * `squash` flattens the sphere while pinning its contact point (impact pop).
 * `angle` (ball roll, radians) shears the upper half by 1px -- a real rotation
 * would shred the pixel grid, so the roll is expressed as a lean instead.
 */
export function drawAnimal(g, animal, sx, sy, opts = {}) {
  const scale = Math.max(0.05, opts.scale || 1);
  const blinkAmt = typeof opts.blink === 'number' ? opts.blink : (opts.blink ? 1 : 0);
  const sp = getAnimalSprite(animal, {
    tint: opts.tint, tintAmt: opts.tintAmt, dim: opts.dim, blink: blinkAmt > 0.45,
  });
  sx = R(sx); sy = R(sy) - R(opts.bob || 0);

  if (opts.glow) {
    const prev = g.globalAlpha;
    if (opts.glowAlpha !== undefined) g.globalAlpha = opts.glowAlpha;
    ring(g, sx, sy, R(sp.r * scale) + 2, opts.glow === true ? 'gold' : opts.glow, 1);
    g.globalAlpha = prev;
  }

  if (!sp.canvas) { disc(g, sx, sy, sp.r * scale, 'grey1'); return sp; }

  const sq = Math.max(-0.6, Math.min(0.9, opts.squash || 0));
  const dw = Math.max(1, R(sp.w * scale * (1 + sq * 0.35)));
  const dh = Math.max(1, R(sp.h * scale * (1 - sq * 0.40)));
  const kx = dw / sp.w, ky = dh / sp.h;
  const x0 = R(sx - sp.cx * kx);
  const y0 = R(sy + sp.r * scale - (sp.cy + sp.r) * ky);   // pin the contact point
  const flip = !!opts.flip;

  const lean = opts.angle ? Math.max(-1, Math.min(1, R(Math.sin(opts.angle) * 1.2))) : 0;
  if (lean === 0) {
    blitPart(g, sp.canvas, 0, 0, sp.w, sp.h, x0, y0, dw, dh, flip);
  } else {
    const cut = sp.cy;                          // split at the equator
    const hTop = Math.max(1, Math.min(dh - 1, R(cut * ky)));
    blitPart(g, sp.canvas, 0, 0, sp.w, cut, x0 + lean, y0, dw, hTop, flip);
    blitPart(g, sp.canvas, 0, cut, sp.w, sp.h - cut, x0, y0 + hTop, dw, dh - hTop, flip);
  }
  return sp;
}

/** Head badge centred at (sx, sy). opts: {size, scale, flip} */
export function drawAnimalIcon(g, animal, sx, sy, opts = {}) {
  const sp = getAnimalIcon(animal, opts.size || ICON_SIZE);
  if (!sp.canvas) return sp;
  const scale = Math.max(1, R(opts.scale || 1));
  blitPart(g, sp.canvas, 0, 0, sp.w, sp.h,
    R(sx) - R(sp.cx * scale), R(sy) - R(sp.cy * scale),
    sp.w * scale, sp.h * scale, !!opts.flip);
  return sp;
}

/**
 * Flattened dither ellipse on the felt. (sx, sy) is the contact point.
 * opts: {flat=0.42, color='ink', alpha=1, spread=1, dim=0}
 * `dim` is what table.js passes as a ball sinks: the shadow shrinks and thins out.
 */
export function drawAnimalShadow(g, sx, sy, r, opts = {}) {
  const dim = opts.dim ? clamp01(opts.dim) : 0;
  const rx = Math.max(1, R(r * (opts.spread !== undefined ? opts.spread : 1) * (1 - dim * 0.5)));
  const ry = Math.max(1, R(rx * (opts.flat !== undefined ? opts.flat : 0.42)));
  const cx = R(sx), cy = R(sy);
  const prev = g.globalAlpha;
  const a = (opts.alpha !== undefined ? opts.alpha : 1) * (1 - dim * 0.7);
  if (a < 1) g.globalAlpha = Math.max(0, a);
  g.fillStyle = col(opts.color || 'ink');
  for (let dy = -ry; dy <= ry; dy++) {
    const k = 1 - (dy * dy) / (ry * ry);
    if (k < 0) continue;
    const dxo = Math.floor(rx * Math.sqrt(k) + 0.4);
    if (dxo < 0) continue;
    const dxi = Math.floor(dxo * 0.58);
    const y = cy + dy;
    g.fillRect(cx - dxi, y, dxi * 2 + 1, 1);
    for (let x = cx - dxo; x < cx - dxi; x++) if (((x + y) & 1) === 0) g.fillRect(x, y, 1, 1);
    for (let x = cx + dxi + 1; x <= cx + dxo; x++) if (((x + y) & 1) === 0) g.fillRect(x, y, 1, 1);
  }
  g.globalAlpha = prev;
}

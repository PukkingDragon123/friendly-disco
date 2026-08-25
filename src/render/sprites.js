// THE ANIMALS. A round body, two feet, and half the resolution.
//
// WHY HALF RESOLUTION. The art is authored in a 16x16 buffer and blown up 2x, so a
// finished animal is 32 screen pixels made of 2x2 blocks. Nothing can be finer than a
// block, every outline comes out two pixels thick, and every shape has to justify itself
// in about nine pixels of body. That constraint is the whole style: at 32 real pixels
// there is room to render a shoulder blade and a nostril, and the result is mush at arm's
// length and reads as machine-made up close. Chunky reads instantly and reads as drawn.
//
// It is also cheaper. Long runs of one colour merge into one fillRect in pixbuf.flush, and
// a quarter of the pixels means a quarter of the runs.
//
// WHAT A SPECIES IS. One lighting model, one silhouette, and then the details that BREAK
// the circle: ears, a horn, a beak, a tail, a chunky pattern, two dot eyes. Ninety animals
// share the ball so a jungle and a snowfield look like one game.
//
// THREE BAKES, SPLIT BY WHAT MOVES:
//
//     BACK[tint]         behind the body: tail, wing, shell, quills, hump, mane
//     BODY[phase][tint]  the shaded ball, its pattern, AND the legs -- 4 walk frames
//     FACE[mood][tint]   ears, species feature, eyes -- everything that stays upright
//
// The legs live with the body because a walk is a body bobbing over planted feet: bake
// them together and the bob is free, bake them apart and the feet float. The face and the
// back layer are blitted at the bob offset instead.

import { P, mix } from '../core/palette.js';
import { makeCanvas, rect, ellipse, clamp } from '../core/pixel.js';
import {
  makeBuf, bset, bget, brect, bline, btri, orb, blob, orbShade, outline, flush,
} from './pixbuf.js';

export const SPRITE_SIZE = 32;            // on screen
export const ICON_SIZE = 16;

const A = 16;                             // the art buffer: 16x16 ...
const S = 2;                              // ... at 2x, so one art pixel is a 2x2 block
const CX = 8;                             // body centre column; features mirror about it
const CY = 7;                             // body centre row
const R = 4;                              // body half-width at the waist
const EYE_Y = 7;                          // eyes occupy rows EYE_Y and EYE_Y+1
const EYE_DX = 3;                         // outer edge of each eye: CX-3 and CX+3
const MOUTH_Y = 10;
const HIP_Y = 11;                         // where the legs leave the body
const FOOT_Y = 13;                        // row 14 is the contour under the feet
const EAR_X = 3;                          // ears at CX-3..CX-4, TOUCHING the head
const EAR_Y = 4;
const LEG_X = [CX - 3, CX + 2];           // (5,6) and (10,11): mirrored about CX

// THE BODY IS A ROW TABLE, NOT A CIRCLE, and there are two reasons that matters.
//
// A circle of radius four has a one-pixel top and a one-pixel bottom, so the contour pass
// wraps each end into a little nub and the animal gets a pointed head. Eight hand-set row
// widths give a chunky egg with a flat top instead.
//
// And every attachment point has to be a pixel something can TOUCH. The first cut put the
// ears one pixel clear of the head; the contour pass fills an empty pixel that has a
// filled neighbour, so that one-pixel gap came out solid ink -- three pixels of it either
// side -- and every animal wore a black cap. Ears now overlap the row they sit on.
const BODY_HW = [1, 2, 3, 4, 4, 4, 4, 3, 2];   // half-widths, rows CY-4 .. CY+4

// The top three rows narrow 3, 5, 7 for a reason. A head whose top row is already the
// full five pixels wide gets a straight five-pixel contour laid across it, and a straight
// dark bar between two ears does not read as a skull -- it reads as a visor. Rounding the
// dome costs two rows and buys a head.
const PHASES = 4;

// A SIXTEEN PIXEL BUDGET, and what it taught. The first cut gave the ball radius five and
// the ears a radius of two, which came to fifteen pixels of width out of sixteen -- so the
// contour pass wrapped the lot in one rounded rectangle and every animal was a shield with
// a face on it. The ball has to be small enough that the ears, the feet and the contour
// all fit OUTSIDE it, or the silhouette is a box no matter how well the ball is shaded.
//
//   row 0       contour
//   rows 2-4    ears and horns, two pixels wide, never more
//   rows 2-10   the ball, nine pixels across
//   rows 10-13  legs, two pixels wide, feet three
//   row 14      contour

// A walk is four frames: plant, lift, plant, lift. The body rides up on the frames where
// a leg is under it and drops on the frames where one is swinging -- that is the bob, and
// it is the difference between walking and sliding.
const BOB = [0, -1, 0, -1];
const GAIT = [[0, 0], [1, -1], [0, 0], [-1, 1]];

export const DEFAULT_RECIPE = {
  body: 'grey1', shade: 'grey0', light: 'grey2', belly: 'bone',
  eye: 'ink', eyeStyle: 'dot', ears: 'round', face: 'muzzle',
  pattern: 'none', patternColor: 'ink', extra: 'none',
};

/** Fill the body from the row table, shading it as if it were a sphere. */
function bodyFill(b, cy, shade) {
  for (let i = 0; i < BODY_HW.length; i++) {
    const y = cy - 4 + i, hw = BODY_HW[i];
    for (let x = -hw; x <= hw; x++) {
      const nx = x / 4.4, ny = (y - cy) / 4.4;
      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
      bset(b, CX + x, y, shade(nx, ny, nz));
    }
  }
}

/** Mirror-write about the body centre. Every symmetric feature goes through this. */
function mir(b, x, y, k) { bset(b, x, y, k); bset(b, 2 * CX - x, y, k); }

/* ------------------------------------------------------------------- colours */

function tinted(key, tint, amt) {
  return tint ? mix(P[key] || key, P[tint] || tint, amt) : (P[key] || key);
}

/**
 * The tone set for one animal: FOUR body tones, not five.
 *
 * Five bands across ten pixels of ball is not shading, it is noise -- each band ends up
 * one or two pixels wide and the ball reads as speckled. Four bands give the terminator
 * somewhere to be.
 */
function tones(rc, o = {}) {
  const t = o.tint, a = o.tintAmt || 0.4;
  const body = tinted(rc.body || 'grey1', t, a);
  const shade = tinted(rc.shade || 'grey0', t, a);
  const light = tinted(rc.light || 'grey2', t, a);
  return {
    deep: mix(shade, P.ink, 0.3),
    shade,
    body,
    light: mix(light, P.white, 0.12),
    belly: tinted(rc.belly || 'bone', t, a * 0.6),
    // A pattern pulled toward the body colour stays a marking. Left at full strength it
    // becomes a hole: a cow with four pure-ink patches on nine pixels of ball is a cow
    // with a bite out of it.
    pat: mix(tinted(rc.patternColor || 'ink', t, a * 0.5), body, 0.3),
    eye: rc.eye || 'ink',
  };
}

// THREE TONES ON THE BODY, and no `deep`.
//
// The generic five-band sphere shader is built for a thirty-pixel ball. On nine pixels its
// thresholds land wherever they like: the band edge at 0.42 fell exactly down the middle
// of the face, so the muzzle and the space between the eyes came out in shadow tone while
// the cheeks stayed light -- a pale cow with a dirty stripe down its nose. And a deep band
// plus a rim inside the contour makes the outer two pixels dark all the way round, which
// turns any pale animal into a doughnut.
//
// So: a lit cap, the body over most of the surface, one crescent of shade at the
// lower right, and the contour doing the work the deep band used to. Three tones is also
// simply what nine pixels can hold.
function ramp(C) { return [C.shade, C.shade, C.body, C.light]; }

function bodyShade(C) {
  return (nx, ny, nz) => {
    const lam = nx * -0.52 + ny * -0.66 + nz * 0.54;
    if (lam > 0.62) return C.light;
    if (lam > 0.06) return C.body;
    return C.shade;
  };
}

/* -------------------------------------------------------------- body + legs */

/** Is this art pixel inside the face, where a pattern must not go? */
function onFace(x, y) { return x >= CX - 3 && x <= CX + 3 && y >= EYE_Y - 1 && y <= MOUTH_Y + 1; }

function ballPattern(b, rc, C) {
  const k = rc.pattern || 'none';
  if (k === 'none') return;
  const put = (x, y) => { if (!onFace(x, y) && bget(b, x, y) !== null) bset(b, x, y, C.pat); };
  const blk = (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j); };
  // Nine pixels of ball. Two marks is a marking, four is a different animal.
  if (k === 'bands') { for (let x = CX - R; x <= CX + R; x++) { put(x, CY - 2); put(x, CY + 2); } }
  else if (k === 'stripes') { for (let y = CY - 3; y <= CY + 3; y++) { put(CX - 3, y); put(CX + 3, y); } }
  else if (k === 'spots') { blk(CX - 3, CY - 2, 2, 2); blk(CX + 2, CY + 1, 2, 2); }
  else if (k === 'patches') { blk(CX - 3, CY - 2, 2, 3); blk(CX + 2, CY, 2, 2); }
  else if (k === 'freckles') { put(CX - 3, CY - 1); put(CX + 3, CY - 1); put(CX - 2, CY + 3); }
  else if (k === 'plates') { for (let x = CX - 2; x <= CX + 2; x++) put(x, CY - 3); }
  else if (k === 'scales') { for (let y = CY; y <= CY + 3; y++) for (let x = CX - 3; x <= CX + 3; x++) if ((x + y) % 2 === 0) put(x, y); }
  else if (k === 'wool') { for (let x = CX - 3; x <= CX + 3; x += 2) put(x, CY - 3); }
  else if (k === 'runes') { put(CX - 2, CY - 2); put(CX + 2, CY - 2); put(CX, CY + 3); }
}

/** The ball, its belly, its pattern -- and the two legs under it. */
function ballBody(b, rc, C, phase) {
  const bob = BOB[phase % PHASES];
  const cy = CY + bob;
  const g = GAIT[phase % PHASES];

  // Legs first, so the body sits over the hip and the join disappears. The near leg is
  // body-toned and the far leg is shaded: two legs in one colour read as one thick post.
  for (let i = 0; i < 2; i++) {
    const swing = g[i];
    const lift = swing > 0 ? 1 : 0;
    const bot = FOOT_Y - lift;
    brect(b, LEG_X[i], HIP_Y, 2, bot - HIP_Y, i === 0 ? C.body : C.shade);
    brect(b, LEG_X[i], bot, 2, 1, C.deep);
  }

  bodyFill(b, cy, bodyShade(C));

  // A belly makes a ball an animal -- but only just. Three pixels at the widest, low and
  // short: any bigger and it is a bib, and a bib covers the face.
  for (let y = cy + 2; y <= cy + 3; y++) {
    const w = y > cy + 2 ? 0 : 1;
    for (let x = CX - w; x <= CX + w; x++) {
      if (bget(b, x, y) === null) continue;
      bset(b, x, y, C.belly);
    }
  }

  ballPattern(b, rc, C);

  // ONE highlight pixel. Two read as dirt on the screen at this size.
  bset(b, CX - 2, cy - 2, mix(C.light, P.white, 0.45));

  // Ears and the species feature live HERE, not in the face layer, and that is a
  // correctness fix rather than tidying. The face layer knows nothing about the body, so
  // when the ears were baked into it the outline pass filled the pixels either side of
  // each ear -- pixels the body was about to occupy -- and those two ink columns
  // composited straight over the head. Anything that breaks the silhouette has to be
  // outlined in the same pass as the silhouette.
  ballEars(b, rc, C, cy);
  ballSnout(b, rc, C, cy);
}

/* ------------------------------------------------------- behind the body */

/** A tapering chunky spur: horn, quill, antler tine. Two passes so it keeps an edge. */
function spur(b, x0, y0, x1, y1, key, edge) {
  bline(b, x0 - 1, y0, x1 - 1, y1, edge);
  bline(b, x0 + 1, y0, x1 + 1, y1, edge);
  bline(b, x0, y0 + 1, x1, y1 + 1, edge);
  bline(b, x0, y0 - 1, x1, y1 - 1, edge);
  bline(b, x0, y0, x1, y1, key);
}

function backFeatures(b, rc, C) {
  const k = rc.extra || 'none';
  const dk = C.deep, md = C.shade, lt = C.light;
  if (k === 'tail') {
    spur(b, CX + 3, CY + 2, CX + 5, CY - 1, md, dk);
    bset(b, CX + 5, CY - 2, lt);
  } else if (k === 'wing') {
    blob(b, CX + 4, CY, 2, 3, [dk, md, lt], { edge: dk });
    bline(b, CX + 3, CY - 1, CX + 6, CY - 1, dk);
    bline(b, CX + 3, CY + 1, CX + 6, CY + 1, dk);
  } else if (k === 'wings2') {
    blob(b, CX + 4, CY - 1, 2, 3, [dk, md, lt], { edge: dk });
    blob(b, CX - 4, CY - 1, 2, 3, [dk, md, lt], { edge: dk });
  } else if (k === 'flipper') {
    blob(b, CX + 4, CY + 2, 2, 2, [dk, md, md], { edge: dk });
    blob(b, CX - 4, CY + 2, 2, 2, [dk, md, md], { edge: dk });
  } else if (k === 'shell') {
    blob(b, CX, CY - 1, R + 1, R, [dk, md, lt], { edge: dk });
    bline(b, CX - R, CY - 1, CX + R, CY - 1, dk);
    bline(b, CX, CY - R - 1, CX, CY + 2, dk);
  } else if (k === 'quills') {
    for (let i = -2; i <= 2; i++) spur(b, CX + i * 2, CY - 2, CX + i * 3, CY - 7, md, dk);
  } else if (k === 'hump') {
    blob(b, CX, CY - 3, 3, 2, [md, lt, lt], { edge: dk });
  } else if (k === 'mane') {
    // A ruff is ONE pixel of collar proud of the head. Two pixels of dark ring plus the
    // contour turned the lion into a life preserver with a face in the hole.
    for (let i = 0; i < BODY_HW.length; i++) {
      const y = CY - 4 + i, hw = BODY_HW[i] + 1;
      bset(b, CX - hw, y, md); bset(b, CX + hw, y, md);
    }
    for (let x = CX - 3; x <= CX + 3; x++) bset(b, x, CY - 5, md);
  } else if (k === 'plume') {
    spur(b, CX + 2, CY - 3, CX + 5, CY - R - 2, md, dk);
    bset(b, CX + 5, CY - R - 3, lt);
  } else if (k === 'sail') {
    btri(b, CX - 1, CY - 2, CX + 2, CY - R - 3, CX + 3, CY + 1, md);
    outlineTri(b, CX - 1, CY - 2, CX + 2, CY - R - 3, CX + 3, CY + 1, dk);
  } else if (k === 'gill') {
    for (let i = 0; i < 3; i++) bset(b, CX + 3 + (i & 1), CY - 1 + i, dk);
  } else if (k === 'antenna') {
    spur(b, CX - 1, CY - R, CX - 3, CY - R - 3, md, dk);
    spur(b, CX + 1, CY - R, CX + 3, CY - R - 3, md, dk);
  }
}

function outlineTri(b, x0, y0, x1, y1, x2, y2, key) {
  bline(b, x0, y0, x1, y1, key); bline(b, x1, y1, x2, y2, key); bline(b, x2, y2, x0, y0, key);
}

/* ----------------------------------------------------------------- the face */

function ballEars(b, rc, C, cy = CY) {
  const k = rc.ears || 'none';
  const dk = C.deep, md = C.body, lt = C.light, in_ = mix(C.belly, P.red1, 0.3);
  const EY = EAR_Y + (cy - CY);
  const CYb = cy;   // the bobbed body centre: ears ride with the head
  // TWO PIXELS WIDE. An ear with its own radius-two blob and its own edge comes to five
  // pixels a side, which is wider than the head it is attached to.
  const pair = (fn) => { fn(-1); fn(1); };
  if (k === 'round') {
    pair((s) => { brect(b, s < 0 ? CX - EAR_X - 1 : CX + EAR_X, EY - 1, 2, 3, md); bset(b, CX + s * EAR_X, EY, in_); });
  } else if (k === 'tiny') {
    pair((s) => { bset(b, CX + s * EAR_X, EY, md); bset(b, CX + s * EAR_X, EY + 1, md); });
  } else if (k === 'pointy') {
    pair((s) => { bset(b, CX + s * EAR_X, EY + 1, md); bset(b, CX + s * EAR_X, EY, md); bset(b, CX + s * (EAR_X + 1), EY - 1, md); });
  } else if (k === 'long') {
    pair((s) => { brect(b, s < 0 ? CX - EAR_X - 1 : CX + EAR_X, EY, 2, 5, md); bset(b, CX + s * EAR_X, EY + 4, dk); });
  } else if (k === 'tuft') {
    pair((s) => { bset(b, CX + s, CYb - 4, md); bset(b, CX + s * 2, CYb - 5, lt); });
  } else if (k === 'horn') {
    pair((s) => spur(b, CX + s * 2, CYb - 4, CX + s * 4, CYb - 5, C.belly, dk));
  } else if (k === 'antler') {
    pair((s) => { spur(b, CX + s * 2, CYb - 4, CX + s * 3, CYb - 6, C.belly, dk); bset(b, CX + s * 5, CYb - 5, C.belly); });
  } else if (k === 'crest') {
    const comb = mix(md, P.red2, 0.55);
    for (let i = -1; i <= 1; i++) { bset(b, CX + i, CYb - 5, comb); bset(b, CX + i * 2, CYb - 6, comb); }
  } else if (k === 'fin') {
    btri(b, CX - 2, CYb - 4, CX, CYb - 6, CX + 2, CYb - 4, md);
    outlineTri(b, CX - 2, CYb - 4, CX, CYb - 6, CX + 2, CYb - 4, dk);
  } else if (k === 'frill') {
    pair((s) => { bset(b, CX + s * (EAR_X + 1), EY + 2, md); bset(b, CX + s * (EAR_X + 1), EY + 4, md); });
  } else if (k === 'spike') {
    pair((s) => spur(b, CX + s * 2, CYb - 4, CX + s * 3, CYb - 7, mix(md, P.ink, 0.45), dk));
  }
}

/** The species feature: everything that changes the head's OUTLINE. Baked with the body. */
function ballSnout(b, rc, C, cy = CY) {
  const k = rc.face || 'flat';
  const dk = C.deep, snout = mix(C.belly, C.body, 0.2);
  const my = MOUTH_Y + (cy - CY);
  if (k === 'muzzle') {
    brect(b, CX - 1, my, 3, 1, snout);
  } else if (k === 'snout') {
    brect(b, CX - 2, my, 5, 1, snout);
    bset(b, CX - 1, my, dk); bset(b, CX + 1, my, dk);
  } else if (k === 'beak') {
    btri(b, CX - 2, my - 1, CX + 2, my - 1, CX, my + 2, 'brass2');
    bset(b, CX - 2, my - 1, 'brass0'); bset(b, CX + 2, my - 1, 'brass0');
  } else if (k === 'whiskers') {
    brect(b, CX - 1, my, 3, 1, snout);
    for (const s of [-1, 1]) bset(b, CX + s * 4, my - 1, dk);
  } else if (k === 'tusk') {
    brect(b, CX - 1, my, 3, 1, snout);
    for (const s of [-1, 1]) bset(b, CX + s * 3, my + 1, 'white');
  } else if (k === 'mandible') {
    for (const s of [-1, 1]) bset(b, CX + s * 2, my + 1, dk);
  } else if (k === 'trunk') {
    brect(b, CX, my, 1, 3, C.shade);
    bset(b, CX, my + 3, dk);
  } else if (k === 'fang') {
    for (const s of [-1, 1]) bset(b, CX + s * 2, my + 1, 'white');
  }
}

/**
 * The face: eyes, mouth, blush. NOTHING that breaks the silhouette, so this layer needs
 * no contour of its own -- which is the point, because a contour here lands on the body.
 */
function ballFace(b, rc, C, mood) {
  const dk = C.deep;
  const happy = mood === 'happy';
  const scared = mood === 'scared';

  // --- the mouth
  if (happy) { bset(b, CX - 1, MOUTH_Y + 1, dk); bset(b, CX + 1, MOUTH_Y + 1, dk); bset(b, CX, MOUTH_Y + 2, dk); }
  else if (scared) { brect(b, CX, MOUTH_Y + 1, 1, 2, dk); }
  else { bset(b, CX - 1, MOUTH_Y + 1, dk); bset(b, CX + 1, MOUTH_Y + 1, dk); }

  // --- the eyes.
  //
  // TWO PIXELS BY TWO, and it took three tries to accept that. A one-pixel eye is exactly
  // the weight of the contour, so it reads as a nick in the outline rather than an eye,
  // and the face vanishes -- worse on a pale animal, where the only dark marks on the
  // whole sprite are the outline and the legs. Two-by-two with a single catch light is
  // four art pixels: still a dot eye, and one you can actually see. It costs six of the
  // nine pixels of body width, and that is correct -- a cute animal at this size is
  // mostly eyes.
  const st = rc.eyeStyle || 'dot';
  const E = C.eye;
  if (mood === 'blink') {
    for (const s of [-1, 1]) brect(b, s < 0 ? CX - EYE_DX : CX + EYE_DX - 1, EYE_Y + 1, 2, 1, dk);
    return;
  }
  for (const s of [-1, 1]) {
    const x0 = s < 0 ? CX - EYE_DX : CX + EYE_DX - 1;   // left column of this eye
    if (st === 'sleepy') { brect(b, x0, EYE_Y + 1, 2, 1, E); continue; }
    brect(b, x0, EYE_Y, 2, 2, E);
    // the catch light goes in the corner nearest the key light, up and to the left
    bset(b, x0, EYE_Y, st === 'sparkle' ? 'white' : mix(P.white, P[E] || E, 0.15));
    if (st === 'goggle') { bset(b, x0 + 1, EYE_Y, 'ice'); bset(b, x0, EYE_Y + 1, 'ice'); }
    if (st === 'angry') bset(b, s < 0 ? CX - EYE_DX - 1 : CX + EYE_DX, EYE_Y - 1, dk);
    if (st === 'wide') bset(b, x0 + 1, EYE_Y + 1, mix(P.white, P[E] || E, 0.35));
  }
  if (scared) for (const s of [-1, 1]) bset(b, CX + s * EYE_DX, EYE_Y - 2, dk);
  if (happy) for (const s of [-1, 1]) bset(b, CX + s * 4, EYE_Y + 1, mix(P.red1, C.body, 0.5));
}

/* ------------------------------------------------------------------- bakes */

const backCache = new Map();
const bodyCache = new Map();
const faceCache = new Map();
const iconCache = new Map();
const CACHE_CAP = 900;

function tintKey(o) { return (o && o.tint) ? o.tint + ':' + (o.tintAmt || 0.4) : ''; }

/**
 * Bake one layer. `paint` fills a 16x16 art buffer; the buffer is outlined and flushed at
 * 2x onto a 32x32 canvas.
 */
function bakeLayer(paint, o = {}) {
  const b = makeBuf(A, A);
  paint(b);
  if (!o.noOutline) outline(b, 'ink', o.outline || {});
  const c = makeCanvas(SPRITE_SIZE, SPRITE_SIZE);
  flush(b, c.g, 0, 0, S);
  return { canvas: c.canvas, buf: b };
}

function bakeBody(rc, phase, o) {
  const C = tones(rc, o);
  return bakeLayer((b) => ballBody(b, rc, C, phase)).canvas;
}

function bakeBack(rc, o) {
  const C = tones(rc, o);
  if ((rc.extra || 'none') === 'none') return null;
  return bakeLayer((b) => backFeatures(b, rc, C)).canvas;
}

function bakeFace(rc, mood, o) {
  const C = tones(rc, o);
  // No contour on this layer. Everything in it is inside the body's silhouette, so an
  // outline here could only ever draw a ring round an eye -- onto the head underneath.
  return bakeLayer((b) => ballFace(b, rc, C, mood), { noOutline: true }).canvas;
}

export function bakeAnimal(recipe, opts = {}) {
  const rc = Object.assign({}, DEFAULT_RECIPE, recipe || {});
  return {
    back: bakeBack(rc, opts),
    body: bakeBody(rc, 0, opts),
    face: bakeFace(rc, opts.mood || 'idle', opts),
  };
}

function recipeOf(animal) {
  return Object.assign({}, DEFAULT_RECIPE, (animal && (animal.sprite || animal)) || {});
}

function fromCache(cache, key, make) {
  let v = cache.get(key);
  if (v === undefined) {
    v = make();
    if (cache.size > CACHE_CAP) cache.clear();
    cache.set(key, v);
  }
  return v;
}

function cachedBack(animal, o) {
  const id = (animal && animal.id) || 'x';
  return fromCache(backCache, id + '|' + tintKey(o), () => bakeBack(recipeOf(animal), o));
}
function cachedBody(animal, phase, o) {
  const id = (animal && animal.id) || 'x';
  return fromCache(bodyCache, id + '|' + phase + '|' + tintKey(o), () => bakeBody(recipeOf(animal), phase, o));
}
function cachedFace(animal, mood, o) {
  const id = (animal && animal.id) || 'x';
  return fromCache(faceCache, id + '|' + mood + '|' + tintKey(o), () => bakeFace(recipeOf(animal), mood, o));
}

export function getAnimalSprite(animal, o = {}) {
  return {
    back: cachedBack(animal, o),
    body: cachedBody(animal, 0, o),
    face: cachedFace(animal, o.mood || 'idle', o),
    size: SPRITE_SIZE,
  };
}

export function clearSpriteCache() {
  backCache.clear(); bodyCache.clear(); faceCache.clear(); iconCache.clear();
}
export function spriteCacheSize() {
  return backCache.size + bodyCache.size + faceCache.size + iconCache.size;
}

/* ------------------------------------------------------------------ drawing */

/** Which of the four walk frames? `step` is explicit, `walk` is a 0..1 cycle. */
export function walkPhase(opts) {
  if (opts.step !== undefined) return ((opts.step | 0) % PHASES + PHASES) % PHASES;
  if (opts.walk !== undefined) return Math.floor(((opts.walk % 1) + 1) % 1 * PHASES) % PHASES;
  if (opts.roll !== undefined) {
    return ((Math.round((opts.roll / (Math.PI * 2)) * PHASES) % PHASES) + PHASES) % PHASES;
  }
  return 0;
}

/**
 * drawAnimal(g, animal, sx, sy, opts)
 *   sx, sy   the CENTRE of the body
 *   opts     { scale, walk, step, squash, mood, blink, flip, alpha, wet, rain, t }
 *
 * Three blits. The body layer already holds the bob and the planted feet; the back and
 * face layers get the bob applied here so they ride with it.
 */
export function drawAnimal(g, animal, sx, sy, opts = {}) {
  const sc = Math.max(1, Math.round(opts.scale || 1));
  const SZ = SPRITE_SIZE * sc;
  const phase = walkPhase(opts);
  const mood = opts.mood || (opts.blink ? 'blink' : 'idle');
  const back = cachedBack(animal, opts);
  const body = cachedBody(animal, phase, opts);
  const face = cachedFace(animal, mood, opts);
  if (!body && !face) return;

  // A flattening ball must also widen, or it reads as shrinking rather than as landing.
  const q = opts.squash ? Math.max(0, Math.min(0.5, opts.squash)) : 0;
  const dw = Math.round(SZ * (1 + q * 0.55));
  const dh = Math.round(SZ * (1 - q * 0.55));
  // the sprite's body centre sits at art row CY of 16, so anchor on that, not on the box
  const dx = Math.round(sx - dw / 2);
  const dy = Math.round(sy - (dh * (CY + 0.5)) / A);
  const bob = BOB[phase] * S * sc;

  const prevA = g.globalAlpha;
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  const put = (c, oy) => c && g.drawImage(c, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, oy, dw, dh);
  if (opts.flip) {
    g.save();
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    put(back, bob); put(body, 0); put(face, bob);
    g.restore();
  } else {
    g.save();
    g.translate(dx, dy);
    put(back, bob); put(body, 0); put(face, bob);
    g.restore();
  }
  g.globalAlpha = prevA;

  if (opts.wet) drawWet(g, sx, sy, sc, opts.wet, opts.t || 0);
  if (opts.rain) drawRainHit(g, sx, sy, sc, opts.rain, opts.t || 0);
}

/** A wet animal: a sheen along the top and one to three drips off the bottom. */
function drawWet(g, sx, sy, sc, amt, t) {
  const a = clamp(amt, 0, 1);
  const r = R * S * sc;
  for (let i = 0; i < 3; i++) {
    rect(g, sx - r * 0.5 + i * r * 0.4, sy - r * 0.72 + i * sc, sc * 2, sc * 2, 'foam');
  }
  const n = 1 + Math.round(a * 2);
  for (let i = 0; i < n; i++) {
    const seed = (sx * 3 + sy * 7 + i * 31) % 17;
    const k = ((t * (0.7 + i * 0.2) + seed * 0.13) % 1);
    const ox = ((seed % 5) - 2) * 3 * sc;
    rect(g, sx + ox, sy + r * 0.7 + k * r * 0.8, sc * 2, sc * 2, 'water3');
    if (k > 0.85) {
      rect(g, sx + ox - sc * 3, sy + r * 1.4, sc * 2, sc, 'foam');
      rect(g, sx + ox + sc * 3, sy + r * 1.4, sc * 2, sc, 'foam');
    }
  }
}

/** Rain hitting an animal: a few bright ticks and a splash ring. */
function drawRainHit(g, sx, sy, sc, amt, t) {
  const n = Math.round(2 + clamp(amt, 0, 1) * 3);
  const r = R * S * sc;
  for (let i = 0; i < n; i++) {
    const seed = (sx * 5 + sy * 3 + i * 47) % 23;
    const k = ((t * 2.2 + seed * 0.09) % 1);
    const ox = ((seed % 7) - 3) * 2 * sc;
    rect(g, sx + ox, sy - r + k * r * 1.6, sc, sc * 3, 'ice');
    if (k > 0.9) rect(g, sx + ox - sc, sy + r * 0.9, sc * 3, sc, 'foam');
  }
}

/** The contact shadow. An animal without one is a sticker. */
export function drawAnimalShadow(g, sx, sy, sc = 1, opts = {}) {
  const r = R * S * sc;
  const k = opts.lift ? clamp(1 - opts.lift, 0.35, 1) : 1;
  ellipse(g, sx, sy + r * 0.92, r * 0.82 * k, r * 0.3 * k, opts.color || 'shadow');
}

/* -------------------------------------------------------------------- icons */

/**
 * The icon IS the art buffer at 1x. That is the whole trick of authoring at half
 * resolution: a 16-pixel icon and a 32-pixel sprite are the same drawing, so a roster
 * list and the field can never disagree about what an animal looks like.
 */
/**
 * Undo the contour where it crossed the face.
 *
 * The sprite avoids this by outlining the face layer with an `outside` circle, but the
 * icon is one flat buffer, so it has to be cleaned up afterwards: a one-pass outline over
 * a whole figure draws ink round both eyes and the muzzle, and at sixteen pixels those
 * rings are the animal.
 */
function scrubFace(b) {
  for (let y = EYE_Y - 1; y <= MOUTH_Y + 1; y++) {
    for (let x = CX - 3; x <= CX + 3; x++) {
      const d = (x - CX) * (x - CX) + (y - CY) * (y - CY);
      if (d < (R - 0.5) * (R - 0.5) && bget(b, x, y) === 'ink') bset(b, x, y, null);
    }
  }
}

export function bakeIcon(recipe, size = ICON_SIZE) {
  const rc = Object.assign({}, DEFAULT_RECIPE, recipe || {});
  const C = tones(rc, {});
  const b = makeBuf(A, A);
  backFeatures(b, rc, C);
  ballBody(b, rc, C, 0);            // body, ears and snout all in one
  outline(b, 'ink', {});
  scrubFace(b);                     // the contour crossed the face; take it back out
  ballFace(b, rc, C, 'idle');       // eyes last, over the top, never outlined
  const s = Math.max(1, Math.round(size / A));
  const c = makeCanvas(A * s, A * s);
  flush(b, c.g, 0, 0, s);
  return c.canvas;
}

export function getAnimalIcon(animal, size = ICON_SIZE) {
  const id = (animal && animal.id) || 'x';
  return fromCache(iconCache, id + '|' + size, () => bakeIcon(recipeOf(animal), size));
}

export function drawAnimalIcon(g, animal, sx, sy, opts = {}) {
  const size = opts.size || ICON_SIZE;
  const c = getAnimalIcon(animal, size);
  if (!c) return;
  const prevA = g.globalAlpha;
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  g.drawImage(c, Math.round(sx - size / 2), Math.round(sy - size / 2));
  g.globalAlpha = prevA;
}

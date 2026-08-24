// The cast: every person, spirit and serpent in the game.
//
// ONE art system for two jobs. A folk sprite is baked at 34x46 and used both as the
// walk-around character (Eden, the boat, an island) and, drawn at 4x and cropped to the
// shoulders, as the dialogue portrait. That is deliberate: two art systems for the same
// character is how a cast ends up looking like two different games, and it doubles the
// work every time somebody needs a new expression.
//
// PROPORTIONS ARE THE WHOLE TRICK. Cute is a big head on a small body:
//
//     hair / hat        rows  0..9
//     head  (r 9)       rows  6..24     <- 40% of the figure
//     eyes              row  17         <- 2px dots, 6px apart, BELOW the middle
//     nose              row  19
//     mouth             row  21
//     torso             rows 24..36
//     legs              rows 36..46
//
// Tiny dot eyes set low, a visible nose, and a head that is far too big. Every character
// here is built on that skeleton, which is also why they read as belonging together.
//
// Baked per (id, pose, mouth, blink) -- at most a hundred little canvases for the whole
// cast -- so drawing a character is one blit plus an integer bob. Everything that has to
// move every frame (the golem's mud, the cherub's sparkle, the snake's tongue) is a
// handful of live pixels on top.

import { P, col, mix } from '../core/palette.js';
import {
  makeCanvas, rect, px, line, disc, ellipse, ellipseFrame, ring, tri, wash, clamp,
} from '../core/pixel.js';

export const FOLK_W = 34;
export const FOLK_H = 46;
const CX = 17;                 // centre line
const HEAD_Y = 15, HEAD_R = 9;
const EYE_Y = HEAD_Y + 2, EYE_DX = 3;
const NOSE_Y = HEAD_Y + 4;
const MOUTH_Y = HEAD_Y + 6;
const TORSO_Y = 24;
const HIP_Y = 36;
const FOOT_Y = 45;

/** Poses. Every character supports all four; some just differ more than others. */
export const POSES = ['idle', 'talk', 'happy', 'react'];

/* ------------------------------------------------------------------ helpers */

const mpx = (b, x, y, c) => { px(b, x, y, c); px(b, 2 * CX - x, y, c); };
const mrect = (b, x, y, w, h, c) => { rect(b, x, y, w, h, c); rect(b, 2 * CX - x - w, y, w, h, c); };

/** A shaded ball, used for every head and every rounded limb. Light upper-left. */
function ball(b, cx, cy, r, lo, mid, hi, rim) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      const nx = x / r, ny = y / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lam = nx * -0.55 + ny * -0.62 + nz * 0.56;
      px(b, cx + x, cy + y, lam > 0.74 ? hi : lam > 0.34 ? mid : lam > -0.2 ? lo : (rim || lo));
    }
  }
}

/** A torso: a rounded trapezoid, wider at the shoulders. */
function torso(b, y0, y1, halfTop, halfBot, lo, mid, hi) {
  for (let y = y0; y <= y1; y++) {
    const f = (y - y0) / Math.max(1, y1 - y0);
    const hw = Math.round(halfTop + (halfBot - halfTop) * f);
    rect(b, CX - hw, y, hw * 2, 1, mid);
    rect(b, CX - hw, y, Math.max(1, Math.round(hw * 0.5)), 1, hi);
    rect(b, CX + Math.round(hw * 0.45), y, Math.round(hw * 0.55), 1, lo);
  }
}

/** Two stubby legs with feet. */
function legs(b, y0, y1, lo, mid, footC) {
  for (const side of [-1, 1]) {
    const x = CX + side * 4 - 2;
    rect(b, x, y0, 4, y1 - y0, mid);
    rect(b, x, y0, 1, y1 - y0, lo);
    rect(b, x - 1, y1 - 1, 6, 2, footC);
  }
}

/**
 * Arms.
 *
 * `shoulder` is the torso's half-width at the top, and the arm hangs from just OUTSIDE
 * it. The first version put the arms at a fixed offset that happened to be inside every
 * torso, so the whole cast appeared to have none: an arm the same colour as the chest it
 * is drawn on top of is not an arm.
 */
function arms(b, pose, lo, mid, hi, o = {}) {
  const top = TORSO_Y + 3;
  const len = o.len || 10;
  const sh = (o.shoulder || 8) + 1;
  for (const side of [-1, 1]) {
    const sx = CX + side * sh;
    // hanging, angled a little away from the body so the silhouette stays open
    let ex = sx + side * 2, ey = top + len;
    if (pose === 'react') { ex = sx + side * 4; ey = top - len + 3; }     // both up
    else if (pose === 'happy') { ex = sx + side * 4; ey = top - 2; }
    else if (pose === 'talk' && side === 1) { ex = sx + 5; ey = top + 2; }
    line(b, sx, top, ex, ey, mid);
    line(b, sx + side, top, ex + side, ey, side < 0 ? hi : lo);
    disc(b, ex, ey, 2, mid);                                    // a mitten hand
    px(b, ex - 1, ey - 1, hi);
    px(b, ex + side, ey + 1, lo);
  }
}

/**
 * The face. Two dot eyes, a nose, a mouth, and two blush pixels.
 *
 * The blush is not decoration -- two warm pixels on the cheeks is the cheapest way to
 * make a pixel face read as friendly rather than blank, and it is why cozy games all
 * have it.
 */
function faceOn(b, o) {
  const { eye, ink, blush, mouth, blink, pose } = o;
  const ey = o.eyeY !== undefined ? o.eyeY : EYE_Y;
  const dx = o.eyeDx !== undefined ? o.eyeDx : EYE_DX;
  for (const side of [-1, 1]) {
    const ex = CX + side * dx;
    if (blink) { rect(b, ex - 1, ey, 3, 1, ink); continue; }
    if (pose === 'happy') { px(b, ex - 1, ey + 1, ink); px(b, ex, ey, ink); px(b, ex + 1, ey + 1, ink); continue; }
    if (pose === 'react') {
      rect(b, ex - 1, ey - 1, 3, 3, 'white');
      px(b, ex, ey, eye);
      continue;
    }
    rect(b, ex, ey, 2, 2, eye);
    px(b, ex, ey, mix(col(eye), P.white, 0.75));
  }
  if (blush !== false) {
    mpx(b, CX + dx + 2, ey + 2, o.blushC || 'pink');
    mpx(b, CX + dx + 3, ey + 2, mix(col(o.blushC || 'pink'), P.white, 0.4));
  }
  // mouth: closed line, open oh, or a smile
  const my = o.mouthY !== undefined ? o.mouthY : MOUTH_Y;
  if (pose === 'happy') {
    px(b, CX - 2, my, ink); px(b, CX - 1, my + 1, ink);
    px(b, CX, my + 1, ink); px(b, CX + 1, my, ink);
  } else if (mouth === 'open' || pose === 'react') {
    ellipse(b, CX, my + 1, 2, 2, ink);
    px(b, CX, my + 1, mix(col(ink), P.red1, 0.5));
  } else {
    rect(b, CX - 1, my, 3, 1, ink);
  }
}

/* ==================================================================== the cast */

const FOLK = {
  /**
   * THE GOLEM. You.
   *
   * Big cute body, BIG NOSE, tiny dot eyes, chunky proportions. It is the only
   * character wider than it is elegant -- the silhouette is a boulder with legs -- and
   * the brass word plate on its brow is the brightest thing on it, because a golem story
   * turns on the word it is carrying.
   */
  golem(b, pose, mouth, blink) {
    // the head: a clay boulder, slightly squared at the top
    ball(b, CX, HEAD_Y, HEAD_R + 1, 'clay1', 'clay2', 'clay3', 'clay0');
    rect(b, CX - HEAD_R + 1, HEAD_Y - HEAD_R - 1, (HEAD_R - 1) * 2, 3, 'clay2');
    rect(b, CX - HEAD_R + 1, HEAD_Y - HEAD_R - 1, HEAD_R - 1, 3, 'clay3');
    // torso: broad, and broader at the shoulders than the hips
    torso(b, TORSO_Y, HIP_Y, 11, 9, 'clay1', 'clay2', 'clay3');
    legs(b, HIP_Y, FOOT_Y, 'clay0', 'clay1', 'clay0');
    arms(b, pose, 'clay1', 'clay2', 'clay4', { shoulder: 11, len: 11 });

    // THE BIG NOSE. A round clay bulb, not a wedge -- a wedge merged into the head and
    // read as a mask. Its own little shaded ball, sitting proud of the face.
    ball(b, CX, NOSE_Y + 2, 4, 'clay2', 'clay3', 'clay4', 'clay1');
    px(b, CX - 2, NOSE_Y, 'clay4');
    px(b, CX - 1, NOSE_Y + 4, 'clay1');
    px(b, CX + 2, NOSE_Y + 4, 'clay1');

    // tiny lit sockets, set WIDE so the nose cannot crowd them out
    for (const side of [-1, 1]) {
      const ex = CX + side * 6;
      if (blink) { rect(b, ex - 1, EYE_Y, 3, 1, 'clay0'); continue; }
      rect(b, ex - 2, EYE_Y - 1, 4, 3, 'clay0');
      rect(b, ex - 1, EYE_Y, 2, 2, pose === 'react' ? 'gold' : 'amber');
      px(b, ex - 1, EYE_Y, 'white');
      // a wisp of furnace light on the cheek below
      px(b, ex, EYE_Y + 3, mix(P.clay3, P.orange, 0.4));
    }
    // no mouth: a carved line, and it never speaks
    rect(b, CX - 3, MOUTH_Y + 2, 6, 1, 'clay0');

    // the brass word, driven into the brow
    const pw = 13, py = HEAD_Y - HEAD_R + 1;
    rect(b, CX - pw / 2 - 1, py - 1, pw + 2, 6, 'ink');
    rect(b, CX - pw / 2, py, pw, 5, 'brass1');
    rect(b, CX - pw / 2, py, pw, 1, 'brass3');
    for (let i = 0; i < 3; i++) rect(b, CX - pw / 2 + 2 + i * 4, py + 1, 1, 3, 'gold');
    // the heart-furnace, and seams
    disc(b, CX, TORSO_Y + 6, 3, 'orange');
    disc(b, CX, TORSO_Y + 6, 1, 'amber');
    for (const [sx, sy] of [[-7, 3], [5, 6], [-3, 9]]) {
      for (let i = 0; i < 5; i++) px(b, CX + sx + i, TORSO_Y + sy + (i & 1), i & 1 ? 'amber' : 'clay0');
    }
    void mouth;
  },

  /** NOAH. Six hundred years old, straw hat, enormous beard, out of patience. */
  noah(b, pose, mouth, blink) {
    ball(b, CX, HEAD_Y, HEAD_R, 'skin1', 'skin2', 'skin3', 'skin0');
    torso(b, TORSO_Y, HIP_Y, 9, 8, 'cloth1', 'cloth2', 'cloth3');
    legs(b, HIP_Y, FOOT_Y, 'wood0', 'wood1', 'wood0');
    arms(b, pose, 'cloth1', 'cloth2', 'cloth3', { shoulder: 9 });
    // a leather apron over the robe: he is a shipwright before he is a prophet
    torso(b, TORSO_Y + 3, HIP_Y - 1, 6, 6, 'wood1', 'wood2', 'wood3');
    faceOn(b, { eye: 'ink', ink: 'ink', blushC: 'red2', mouth, blink, pose, mouthY: MOUTH_Y - 1 });
    // the beard, covering the jaw and spilling onto the chest
    for (let i = 0; i < 9; i++) {
      const hw = Math.round(6 * (1 - i / 11));
      rect(b, CX - hw, MOUTH_Y + 1 + i, hw * 2, 1, i < 2 ? 'white' : 'bone');
      if (i > 3) px(b, CX + hw - 1, MOUTH_Y + 1 + i, 'grey2');
    }
    // the straw hat: a wide brim, which is the whole silhouette
    ellipse(b, CX, HEAD_Y - HEAD_R + 1, 15, 4, 'ink');
    ellipse(b, CX, HEAD_Y - HEAD_R, 15, 4, 'brass1');
    ellipse(b, CX, HEAD_Y - HEAD_R - 1, 14, 3, 'brass2');
    ellipse(b, CX, HEAD_Y - HEAD_R - 3, 7, 4, 'brass1');
    ellipse(b, CX, HEAD_Y - HEAD_R - 5, 6, 3, 'brass2');
    rect(b, CX - 7, HEAD_Y - HEAD_R - 3, 14, 1, 'wood1');
    for (let i = -6; i <= 6; i += 3) px(b, CX + i, HEAD_Y - HEAD_R, 'brass3');
  },

  /**
   * ADAM. Cute, plain, and holding out a gift he does not explain.
   * A woven leaf wrap at the hips, which is the point.
   */
  adam(b, pose, mouth, blink) {
    ball(b, CX, HEAD_Y, HEAD_R, 'skin1', 'skin2', 'skin3', 'skin0');
    torso(b, TORSO_Y, HIP_Y, 8, 7, 'skin1', 'skin2', 'skin3');
    legs(b, HIP_Y + 4, FOOT_Y, 'skin0', 'skin2', 'skin1');
    arms(b, pose, 'skin1', 'skin2', 'skin3', { shoulder: 8 });
    faceOn(b, { eye: 'ink', ink: 'ink', mouth, blink, pose });
    // short cropped hair, a cap of it
    for (let i = 0; i < 10; i++) {
      const hw = Math.round(Math.sqrt(Math.max(0, HEAD_R * HEAD_R - (HEAD_R - i) * (HEAD_R - i))));
      rect(b, CX - hw, HEAD_Y - HEAD_R + i, hw * 2, 1, i < 3 ? 'hair2' : 'hair1');
    }
    for (let i = -6; i <= 6; i += 4) px(b, CX + i, HEAD_Y - HEAD_R + 2, 'hair3');
    // a cord necklace with a stone, and collarbones: a bare chest needs SOMETHING or it
    // reads as an unfinished sprite
    for (let i = -5; i <= 5; i++) px(b, CX + i, TORSO_Y + 1 + Math.round(Math.abs(i) * 0.3), 'bark');
    disc(b, CX, TORSO_Y + 4, 2, 'stone2');
    px(b, CX - 1, TORSO_Y + 3, 'stone4');
    for (const side of [-1, 1]) {
      line(b, CX + side * 2, TORSO_Y + 2, CX + side * 6, TORSO_Y + 3, 'skin1');
      px(b, CX + side * 4, TORSO_Y + 7, 'skin1');
    }
    // THE LEAF WRAP: overlapping leaves on a vine belt, low on the hips
    rect(b, CX - 8, HIP_Y - 1, 16, 2, 'moss');
    for (let i = 0; i < 7; i++) {
      const lx = CX - 8 + i * 2.6;
      ellipse(b, lx, HIP_Y + 3, 3, 4, i & 1 ? 'leaf2' : 'leaf1');
      line(b, lx, HIP_Y, lx, HIP_Y + 6, 'leaf0');
      px(b, lx - 1, HIP_Y + 2, 'leaf3');
    }
    ellipse(b, CX, HIP_Y + 4, 4, 5, 'leaf2');
    line(b, CX, HIP_Y, CX, HIP_Y + 8, 'leaf0');
    px(b, CX - 1, HIP_Y + 3, 'leaf4');
  },

  /** EVE. The one who asked the question. Long hair, leaf wrap, and an apple. */
  eve(b, pose, mouth, blink) {
    // Hair behind, first, so the head sits in front of it. It has to HUG the skull for
    // the first few rows and only then fall, or it reads as two boxy sideburns.
    for (const side of [-1, 1]) {
      for (let i = 0; i < 22; i++) {
        const y = HEAD_Y - HEAD_R + 1 + i;
        // follow the head's circle while we are beside it, then flare gently
        const dy = y - HEAD_Y;
        const onHead = Math.abs(dy) < HEAD_R;
        const hw = onHead
          ? Math.round(Math.sqrt(HEAD_R * HEAD_R - dy * dy)) + 2
          : 9 + Math.round(Math.sin(i * 0.42) * 2);
        rect(b, CX + side * hw - 1, y, 3, 1, i % 5 === 0 ? 'hair2' : 'hair1');
        if (i % 7 === 3) px(b, CX + side * hw + 1, y, 'hair3');
      }
    }
    ball(b, CX, HEAD_Y, HEAD_R, 'skin2', 'skin3', 'skin4', 'skin1');
    torso(b, TORSO_Y, HIP_Y, 7, 7, 'skin2', 'skin3', 'skin4');
    legs(b, HIP_Y + 4, FOOT_Y, 'skin1', 'skin3', 'skin2');
    arms(b, pose, 'skin2', 'skin3', 'skin4', { shoulder: 7 });
    faceOn(b, { eye: 'ink', ink: 'ink', mouth, blink, pose, blushC: 'pink' });
    // a fringe and a flower crown
    for (let i = 0; i < 7; i++) {
      const hw = Math.round(Math.sqrt(Math.max(0, HEAD_R * HEAD_R - (HEAD_R - i) * (HEAD_R - i))));
      rect(b, CX - hw, HEAD_Y - HEAD_R + i, hw * 2, 1, i < 2 ? 'hair2' : 'hair1');
    }
    for (let i = -5; i <= 5; i += 2) px(b, CX + i, HEAD_Y - HEAD_R + 1, i % 4 === 0 ? 'pink' : 'white');
    // a leaf band across the chest, and the hip wrap
    rect(b, CX - 7, TORSO_Y + 4, 14, 3, 'leaf1');
    for (let i = 0; i < 5; i++) px(b, CX - 6 + i * 3, TORSO_Y + 5, 'leaf3');
    rect(b, CX - 8, HIP_Y - 1, 16, 2, 'moss');
    for (let i = 0; i < 7; i++) {
      const lx = CX - 8 + i * 2.6;
      ellipse(b, lx, HIP_Y + 3, 3, 4, i & 1 ? 'leaf2' : 'leaf1');
      line(b, lx, HIP_Y, lx, HIP_Y + 6, 'leaf0');
      px(b, lx - 1, HIP_Y + 2, 'leaf3');
    }
    // the apple, held out
    const ax = CX + 10, ay = TORSO_Y + 4;
    disc(b, ax, ay, 4, 'red1');
    disc(b, ax - 1, ay - 1, 2, 'red2');
    px(b, ax - 2, ay - 2, 'white');
    rect(b, ax, ay - 5, 1, 2, 'wood2');
    ellipse(b, ax + 2, ay - 5, 2, 1, 'leaf2');
  },

  /**
   * THE SERPENT. Not a human, so it does not use the skeleton -- but it keeps the dot
   * eyes and the too-big head, which is what makes it read as one of the cast.
   * Cute, and obviously up to something.
   */
  snake(b, pose, mouth, blink) {
    // ONE flat coil on the ground, wide and low, so it reads as a snake sitting on
    // itself rather than as a tower of blobs.
    ellipse(b, CX, FOOT_Y - 3, 15, 5, 'leaf0');
    ellipse(b, CX, FOOT_Y - 4, 14, 4, 'leaf1');
    ellipse(b, CX - 3, FOOT_Y - 5, 10, 3, 'leaf2');
    for (let j = -12; j <= 12; j += 4) px(b, CX + j, FOOT_Y - 4, 'leaf3');
    // the neck: a clear S from the coil up to the head, thick at the bottom
    for (let i = 0; i < 17; i++) {
      const f = i / 16;
      const y = FOOT_Y - 7 - i;
      const w = Math.round(6 - f * 2.2);
      const wob = Math.round(Math.sin(f * 3.4) * 4);
      rect(b, CX - w + wob, y, w * 2, 1, 'leaf1');
      rect(b, CX - w + wob, y, Math.max(1, w), 1, 'leaf2');
      px(b, CX + w + wob - 1, y, 'leaf0');
      if (i % 4 === 0) px(b, CX + wob, y, 'leaf3');   // belly scales
    }
    // the head: a wide wedge, and the hood behind it
    ellipse(b, CX, HEAD_Y + 2, 12, 9, 'leaf1');
    ellipse(b, CX, HEAD_Y + 1, 10, 8, 'leaf2');
    ellipse(b, CX - 2, HEAD_Y - 1, 7, 5, 'leaf3');
    for (const side of [-1, 1]) ellipse(b, CX + side * 10, HEAD_Y + 4, 4, 3, 'leaf1');
    // gold slit eyes, big and up to no good
    for (const side of [-1, 1]) {
      const ex = CX + side * 5, ey = HEAD_Y;
      if (blink) { rect(b, ex - 2, ey, 5, 1, 'leaf0'); continue; }
      disc(b, ex, ey, 3, 'gold');
      disc(b, ex, ey, 2, 'amber');
      rect(b, ex, ey - 2, 1, 5, 'ink');
      px(b, ex - 1, ey - 1, 'white');
      if (pose === 'happy') { px(b, ex - 2, ey - 3, 'leaf0'); px(b, ex - 1, ey - 3, 'leaf0'); }
    }
    // the smile, always upturned
    for (let i = -5; i <= 5; i++) px(b, CX + i, HEAD_Y + 6 - (Math.abs(i) > 3 ? 1 : 0), 'leaf0');
    // and the tongue, out on the talking poses
    if (mouth === 'open' || pose === 'talk' || pose === 'happy') {
      line(b, CX, HEAD_Y + 7, CX - 5, HEAD_Y + 11, 'red2');
      px(b, CX - 6, HEAD_Y + 10, 'red2');
      px(b, CX - 6, HEAD_Y + 12, 'red2');
    }
    // an apple in the coil, because of course
    disc(b, CX + 11, HIP_Y + 2, 4, 'red1');
    disc(b, CX + 10, HIP_Y + 1, 2, 'red2');
    px(b, CX + 9, HIP_Y, 'white');
  },

  /** A CHERUB. Chubby, winged, haloed, and holding a sword far too big for it. */
  cherub(b, pose, mouth, blink) {
    // wings behind
    for (const side of [-1, 1]) {
      for (let i = 0; i < 9; i++) {
        const h = 8 - Math.round(i * 0.7);
        rect(b, CX + side * (7 + i) - (side < 0 ? 1 : 0), TORSO_Y - 4 + Math.round(i * 0.4), 1, h,
          i < 3 ? 'white' : i < 6 ? 'cream' : 'bone');
      }
    }
    ball(b, CX, HEAD_Y + 2, HEAD_R, 'skin2', 'skin3', 'skin4', 'skin1');
    torso(b, TORSO_Y + 2, HIP_Y, 6, 5, 'skin2', 'skin3', 'skin4');
    legs(b, HIP_Y, FOOT_Y - 3, 'skin1', 'skin3', 'skin2');
    arms(b, pose, 'skin2', 'skin3', 'skin4', { shoulder: 6, len: 8 });
    faceOn(b, { eye: 'ink', ink: 'ink', mouth, blink, pose, eyeY: EYE_Y + 2, mouthY: MOUTH_Y + 2 });
    // curls
    for (let i = 0; i < 7; i++) disc(b, CX - 6 + i * 2, HEAD_Y - HEAD_R + 3, 2, i & 1 ? 'hair3' : 'hair2');
    // the halo, floating a little above
    ellipseFrame(b, CX, HEAD_Y - HEAD_R - 1, 7, 2, 'gold');
    ellipseFrame(b, CX, HEAD_Y - HEAD_R - 2, 6, 2, 'brass3');
    // a small flaming sword
    rect(b, CX + 9, TORSO_Y, 1, 12, 'grey2');
    rect(b, CX + 7, TORSO_Y + 11, 5, 2, 'brass2');
    for (let i = 0; i < 6; i++) px(b, CX + 9, TORSO_Y - i, i < 2 ? 'white' : i < 4 ? 'gold' : 'orange');
    void mouth;
  },
};

export const FOLK_IDS = Object.keys(FOLK);

/* ------------------------------------------------------------------- baking */

const cache = new Map();
const CAP = 160;

function bake(id, pose, mouth, blink) {
  const fn = FOLK[id];
  if (!fn) return null;
  const mk = makeCanvas(FOLK_W, FOLK_H);
  if (!mk) return null;
  fn(mk.g, pose, mouth, blink);
  return mk.canvas;
}

function sprite(id, pose, mouth, blink) {
  const k = `${id}/${pose}/${mouth}/${blink ? 1 : 0}`;
  let hit = cache.get(k);
  if (hit === undefined) {
    hit = bake(id, pose, mouth, blink);
    if (cache.size > CAP) cache.clear();
    cache.set(k, hit);
  }
  return hit;
}

export function clearFolkCache() { cache.clear(); }
export function folkCacheSize() { return cache.size; }

/* ------------------------------------------------------------------ drawing */

/**
 * drawFolk(g, id, x, y, t, o)
 *   x, y   the character's FEET, which is what you actually place
 *   t      seconds; drives the bob, the blink and the live effects
 *   o      { pose, scale, flip, talking, alpha, mud, sparkle, wet }
 *
 * One blit. The bob is an integer offset rather than a separate bake, the blink is a
 * timer, and the mud, sparkle and wet are a handful of pixels.
 */
export function drawFolk(g, id, x, y, t = 0, o = {}) {
  const sc = Math.max(1, Math.round(o.scale || 1));
  const pose = o.pose || 'idle';
  // a slow bob, and a faster one while talking
  const bob = Math.round(Math.sin(t * (o.talking ? 5.5 : 1.6) + (o.phase || 0)) * (o.talking ? 1.2 : 1));
  // blink about every four seconds, for a tenth of a second
  const blink = ((t * 0.9 + (o.phase || 0)) % 4) < 0.12;
  const mouth = o.talking && Math.floor(t * 7) % 2 === 0 ? 'open' : 'shut';
  const cv = sprite(id, pose, mouth, blink);
  if (!cv) return;
  const dw = FOLK_W * sc, dh = FOLK_H * sc;
  const dx = Math.round(x - dw / 2);
  const dy = Math.round(y - dh) + bob * sc;

  const prevA = g.globalAlpha;
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  if (o.flip) {
    g.save();
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    g.drawImage(cv, 0, 0, FOLK_W, FOLK_H, 0, 0, dw, dh);
    g.restore();
  } else {
    g.drawImage(cv, 0, 0, FOLK_W, FOLK_H, dx, dy, dw, dh);
  }
  g.globalAlpha = prevA;

  if (o.mud) drawMud(g, x, dy, dw, dh, sc, t, o.mud);
  if (o.sparkle) drawSparkle(g, x, dy + dh * 0.4, sc, t, o.sparkle);
  if (o.wet) drawFolkWet(g, x, dy, dw, dh, sc, t);
}

/**
 * Mud sliding off the golem. Four drips on their own loops, each leaving a splat ring
 * when it lands -- which is what sells it as wet clay rather than as brown pixels.
 */
function drawMud(g, x, dy, dw, dh, sc, t, amt) {
  const n = Math.round(2 + clamp(amt, 0, 1) * 2);
  for (let i = 0; i < n; i++) {
    const seed = i * 3.7;
    const k = (t * (0.55 + i * 0.16) + seed) % 1;
    const ox = Math.round(((i % 3) - 1) * 7 + Math.sin(seed) * 3) * sc;
    const top = dy + Math.round(dh * (0.42 + (i % 2) * 0.18));
    const py = top + k * dh * 0.5;
    px(g, x + ox, py, 'clay3');
    px(g, x + ox, py + 1, 'clay1');
    if (k > 0.9) {                                    // it lands
      const fy = dy + dh - 1;
      px(g, x + ox - 2, fy, 'clay2'); px(g, x + ox + 2, fy, 'clay2');
      px(g, x + ox - 1, fy - 1, 'clay3');
    }
  }
  // a wet sheen on the shoulders
  for (let i = 0; i < 4; i++) px(g, x - Math.round(dw * 0.2) + i * sc, dy + Math.round(dh * 0.36), 'clay4');
}

/** Cozy magic motes, used by the cherubim and by the shepherd wand. */
export function drawSparkle(g, x, y, sc, t, amt) {
  const n = Math.round(3 + clamp(amt, 0, 1) * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * 1.1;
    const r = (7 + Math.sin(t * 2 + i) * 4) * sc;
    const sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r * 0.6;
    px(g, sx, sy, i % 3 === 0 ? 'magic2' : i % 3 === 1 ? 'magic1' : 'gold');
  }
}

/* -------------------------------------------------------------- the shepherd wand

The tool the golem points at an animal. It replaced a pool cue, and the difference is
the whole feel of the game: a cue is a stick you hit something with, and a crook is
something you guide an animal home with. So it is short, warm, wooden, and it does its
work in light rather than in force.

Drawn live rather than baked -- it is about thirty pixels and its whole job is to move.
*/

/**
 * drawWand(g, x, y, angle, charge, t)
 *   x, y     the hand
 *   angle    where it points
 *   charge   0..1 how much power is wound into the flick
 *   o        { scale }
 */
export function drawWand(g, x, y, angle, charge = 0, t = 0, o = {}) {
  const ch = clamp(charge, 0, 1);
  const sc = Math.max(1, Math.round(o.scale || 1));
  const len = (20 + ch * 5) * sc;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const tipX = x + ca * len, tipY = y + sa * len;

  // the shaft, tapering, with a bound grip at the hand
  for (let i = 0; i < len; i++) {
    const f = i / len;
    const px2 = x + ca * i, py2 = y + sa * i;
    for (let k = 0; k < sc; k++) {
      px(g, px2 - sa * k, py2 + ca * k, f < 0.28 ? 'wood1' : f < 0.7 ? 'wood2' : 'wood3');
    }
    if (f < 0.28 && i % 3 === 0) px(g, px2 - sa * sc, py2 + ca * sc, 'brass1');
  }
  // the crook: a half curl off the tip, which is what makes it a shepherd's
  for (let k = 0; k < 7 * sc; k++) {
    const a = angle - 0.5 + (k / sc) * 0.42;
    px(g, tipX + Math.cos(a) * 4 * sc, tipY + Math.sin(a) * 4 * sc, k < 2 * sc ? 'wood3' : 'wood4');
  }
  // the light in the crook
  const glow = 0.4 + ch * 0.6;
  const gx = tipX + ca * 3 * sc, gy = tipY + sa * 3 * sc;
  if (glow > 0.5) disc(g, gx, gy, 2 * sc, 'magic1');
  disc(g, gx, gy, sc, 'magic2');
  drawSparkle(g, gx, gy, sc, t, 0.3 + ch);
  // and, while it is charged, a couple of motes running UP the shaft toward the crook
  if (ch > 0.02) {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 2.2 + i / 3) % 1;
      px(g, x + ca * ph * len, y + sa * ph * len, i % 2 ? 'magic1' : 'gold');
    }
  }
}

function drawFolkWet(g, x, dy, dw, dh, sc, t) {
  for (let i = 0; i < 3; i++) {
    const k = (t * (1.1 + i * 0.3) + i * 2.1) % 1;
    const ox = Math.round(((i % 3) - 1) * 6) * sc;
    px(g, x + ox, dy + dh * 0.5 + k * dh * 0.45, 'foam');
    px(g, x + ox, dy + dh * 0.5 + k * dh * 0.45 + 1, 'water3');
  }
}

/**
 * A dialogue portrait. Same sprite, drawn at 4x and cropped to the shoulders, on a baked
 * ground. One art system for the walk-around character and the talking head, which is
 * why they can never drift apart.
 */
const GROUNDS = {
  golem: ['ink', 'shadow', 'clay0', 'clay1'],
  noah: ['wood0', 'wood1', 'sand', 'sky'],
  adam: ['leaf0', 'leaf1', 'sand', 'gold'],
  eve: ['leaf0', 'leaf2', 'pink', 'gold'],
  snake: ['cloth0', 'leaf0', 'leaf1', 'moss'],
  cherub: ['purple0', 'magic0', 'sky', 'cream'],
};

const bgCache = new Map();
function ground(id, w, h) {
  const k = `${id}/${w}/${h}`;
  let hit = bgCache.get(k);
  if (hit !== undefined) return hit;
  const ramp = GROUNDS[id] || ['ink', 'shadow', 'wood1', 'sand'];
  const mk = makeCanvas(w, h);
  if (!mk) { bgCache.set(k, null); return null; }
  for (let y = 0; y < h; y++) {
    const f = y / h;
    const i = Math.min(ramp.length - 2, Math.floor(f * (ramp.length - 1)));
    const lf = f * (ramp.length - 1) - i;
    rect(mk.g, 0, y, w, 1, mix(P[ramp[i]], P[ramp[i + 1]], lf));
    if (y % 4 === 1) rect(mk.g, 0, y, w, 1, mix(P[ramp[i]], P.white, 0.06));
  }
  hit = mk.canvas;
  if (bgCache.size > 40) bgCache.clear();
  bgCache.set(k, hit);
  return hit;
}

export function drawFolkPortrait(g, id, x, y, w, h, t = 0, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  rect(g, x - 2, y - 2, w + 4, h + 4, 'ink');
  const bg = ground(id, w, h);
  if (bg) g.drawImage(bg, x, y);

  // The figure, scaled so HEAD PLUS TORSO fits the frame exactly. Scaling to the head
  // alone cropped the hats, halos and brow plates off the top -- which are precisely the
  // details that tell the cast apart.
  const SHOW = 34;                        // rows 0..34: everything above the knees
  // clamped by WIDTH as well: scaling to the height alone overflowed a narrow frame and
  // sliced the shoulders off, which is how a portrait box ends up cropping a hat
  const sc = Math.max(1, Math.min(Math.floor(h / SHOW), Math.floor(w / FOLK_W)));
  const pose = o.pose || 'idle';
  const bob = Math.round(Math.sin(t * (o.talking ? 5 : 1.4)) * 1);
  const blink = ((t * 0.9) % 4) < 0.12;
  const mouth = o.talking && Math.floor(t * 7) % 2 === 0 ? 'open' : 'shut';
  const cv = sprite(id, pose, mouth, blink);
  if (cv) {
    const dw = FOLK_W * sc;
    const dx = Math.round(x + (w - dw) / 2);
    const dy = Math.round(y + (h - SHOW * sc) / 2) + bob;
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    g.drawImage(cv, 0, 0, FOLK_W, SHOW, dx, dy, dw, SHOW * sc);
    g.restore();
  }
  if (o.mud) drawMud(g, x + w / 2, y + h * 0.2, w * 0.6, h * 0.8, 2, t, o.mud);
  if (o.sparkle) drawSparkle(g, x + w / 2, y + h * 0.4, 2, t, o.sparkle);

  // vignette + a warm wooden frame, so a portrait reads as a framed picture
  for (let i = 0; i < 4; i++) {
    const a = 0.2 - i * 0.045;
    wash(g, x, y + i, w, 1, 'ink', a);
    wash(g, x, y + h - 1 - i, w, 1, 'ink', a);
    wash(g, x + i, y, 1, h, 'ink', a);
    wash(g, x + w - 1 - i, y, 1, h, 'ink', a);
  }
  rect(g, x - 2, y - 2, w + 4, 2, 'wood2');
  rect(g, x - 2, y + h, w + 4, 2, 'wood1');
  rect(g, x - 2, y - 2, 2, h + 4, 'wood2');
  rect(g, x + w, y - 2, 2, h + 4, 'wood1');
  for (const [dx2, dy2] of [[-2, -2], [w, -2], [-2, h], [w, h]]) rect(g, x + dx2, y + dy2, 2, 2, 'brass2');
  void ring; void tri;
}

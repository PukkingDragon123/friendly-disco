// The cast: every person, spirit and serpent in the game.
//
// ONE art system for two jobs. A folk sprite is baked once and used both as the
// walk-around character (Eden, the boat, an island) and, cropped to the shoulders, as the
// dialogue portrait. Two art systems for the same character is how a cast ends up looking
// like two different games.
//
// HALF RESOLUTION, like the animals. The art is authored in a 20x28 buffer and blown up
// 2x to the 40x56 the game places, so every line is two pixels thick and no detail can be
// finer than a 2x2 block. That rules out most of what a figure this size wants to show --
// and that is the point. What survives is proportion and silhouette, which is what
// actually reads.
//
// PROPORTIONS ARE THE WHOLE TRICK. Cute is a big round head on a small body:
//
//     hat / hair / halo    rows  0.. 3
//     HEAD                 rows  2..12     <- 40% of the whole figure
//     eyes                 rows  7.. 8     <- 2x2 dots, close together, BELOW centre
//     nose                 row   9
//     mouth                row  10
//     torso                rows 13..20
//     legs                 rows 21..26
//
// Small dot eyes set low and close, a visible nose, and a head that is far too big. Every
// character is built on that skeleton, which is why they read as one family.
//
// TWO RULES LEARNED THE HARD WAY, both from the animals:
//
//   A GAP FILLS WITH CONTOUR. The outline pass inks any empty pixel with a filled
//   neighbour, so a hat brim one pixel clear of the head, or an arm one pixel clear of the
//   chest, comes out as a solid ink bar. Everything touches what it is attached to.
//
//   ONE PIXEL IS NOT A FEATURE. A single pixel is exactly the weight of the contour, so it
//   reads as a nick in the outline. Eyes are 2x2. The golem's nose is a blob.
//
// Baked per (id, pose, mouth, blink), so a character is one blit plus an integer bob.
// Anything that must move every frame -- the golem's mud, the cherub's motes, the snake's
// tongue -- is a handful of live pixels on top.

import { P, col, mix } from '../core/palette.js';
import { makeCanvas, rect, disc, ellipse, wash, clamp } from '../core/pixel.js';
import {
  makeBuf, bset, bget, brect, bline, btri, blob, outline, flush,
} from './pixbuf.js';

export const FOLK_W = 40;                 // on screen
export const FOLK_H = 56;

const A_W = 20, A_H = 28;                 // the art buffer ...
const S = 2;                              // ... at 2x
const CX = 10;

const HEAD_CY = 7;
const HEAD_HW = [2, 3, 4, 5, 5, 5, 5, 5, 4, 3, 2];   // rows HEAD_CY-5 .. HEAD_CY+5
const HEAD_TOP = HEAD_CY - 5;
const EYE_Y = 7;                          // eyes occupy rows EYE_Y and EYE_Y+1
const EYE_DX = 3;                         // outer edge of each eye
const NOSE_Y = 9;
const MOUTH_Y = 10;                       // NOT 11: the head's bottom row is three pixels
                                          // wide, so a mouth down there is half the jaw
const NECK_Y = 13;
const TORSO_HW = [3, 4, 4, 4, 4, 4, 3, 3];           // rows 13..20
const HIP_Y = 21;
const FOOT_Y = 26;
const LEG_X = [CX - 3, CX + 2];           // (7,8) and (12,13), mirrored about CX

/** Poses. Every character supports all four; some differ more than others. */
export const POSES = ['idle', 'talk', 'happy', 'react'];

/* ------------------------------------------------------------------ materials */

const SKIN = { dark: ['skin0', 'skin2', 'skin3'], warm: ['skin1', 'skin3', 'skin4'] };
const CLAY = ['clay1', 'clay2', 'clay3'];
const CLAY_DEEP = ['clay0', 'clay1', 'clay2'];   // limbs, so they read against the chest
const LEAF = ['leaf1', 'leaf2', 'leaf3'];
const CLOTH = ['wood1', 'wood2', 'wood3'];
const LINEN = ['parch0', 'parch', 'cream'];

/* -------------------------------------------------------------------- shading */

/**
 * Three tones, keyed off a fake surface normal.
 *
 * Three, not five, for the same reason the animals use three: the generic five-band
 * sphere shader is built for a thirty-pixel ball, and on an eleven-pixel head its band
 * edges land wherever they like -- most memorably straight down the middle of the face.
 */
function shade3(ramp) {
  const dk = ramp[0], md = ramp[1], lt = ramp[2] || ramp[1];
  return (nx, ny) => {
    const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
    const lam = nx * -0.52 + ny * -0.66 + nz * 0.54;
    // -0.28, not 0.06. At 0.06 the bottom third of an eleven-pixel head goes to the
    // darkest tone -- a slab under the mouth that reads as a heavy jaw on everyone, and
    // as a beard on people who do not have one. Now only a crescent at the lower right
    // is dark, which is where a shadow actually falls.
    return lam > 0.62 ? lt : lam > -0.28 ? md : dk;
  };
}

/** Fill a row table centred on `cx`, shading it as if it were round. */
function rows(b, cx, y0, hw, ramp, o = {}) {
  const sh = shade3(ramp);
  const cy = o.cy !== undefined ? o.cy : y0 + (hw.length - 1) / 2;
  const r = o.r || Math.max(...hw) + 1;
  for (let i = 0; i < hw.length; i++) {
    const y = y0 + i;
    for (let x = -hw[i]; x <= hw[i]; x++) {
      bset(b, cx + x, y, o.flat || sh(x / r, (y - cy) / r));
    }
  }
}

/** Mirror-write about the figure's centre line. */
function mir(b, x, y, k) { bset(b, x, y, k); bset(b, 2 * CX - x, y, k); }

/* ------------------------------------------------------------------- the body */

/** The head: eleven rows, domed at the top so its contour is a curve not a bar. */
function head(b, ramp, o = {}) {
  rows(b, CX, HEAD_TOP, HEAD_HW, ramp, { cy: HEAD_CY, r: 6 });
  if (o.chin) for (let x = -2; x <= 2; x++) bset(b, CX + x, HEAD_CY + 6, ramp[0]);
}

/** The torso. `wide` gives the golem his slab of a chest. */
function torso(b, ramp, o = {}) {
  const hw = o.wide ? TORSO_HW.map((v) => v + 1) : TORSO_HW;
  rows(b, CX, NECK_Y, hw, ramp, { cy: NECK_Y + 3, r: 6 });
  // the neck: two pixels, or the head looks stuck on
  brect(b, CX - 1, NECK_Y - 1, 3, 1, ramp[0]);
}

/**
 * Two legs and two feet.
 *
 * The gap between the legs is three pixels, which is the smallest gap that survives its
 * own contour: at two the ink from each leg meets in the middle and the figure has one
 * thick trunk instead of legs.
 */
function legs(b, ramp, footKey, o = {}) {
  const top = o.top || HIP_Y;
  for (let i = 0; i < 2; i++) {
    const lift = o.stride ? (i === 0 ? 0 : 1) : 0;
    brect(b, LEG_X[i], top, 2, FOOT_Y - top - lift, i === 0 ? ramp[1] : ramp[0]);
    brect(b, i === 0 ? CX - 4 : CX + 2, FOOT_Y - lift, 3, 1, footKey);
  }
}

/**
 * Arms, by pose.
 *
 * Every arm gets `edge`: drawn one pixel bigger in a darker tone underneath. The final
 * outline pass can only find the OUTSIDE of a figure, so an arm laid over a chest of the
 * same material simply vanishes -- which is how the first cast came out as slabs.
 */
function arms(b, pose, ramp, o = {}) {
  const sh = o.shoulder || NECK_Y + 1;
  const len = o.len || 5;
  const edge = o.edge || ramp[0];
  const put = (x0, y0, x1, y1) => {
    // fat pass then colour pass: a two-pixel arm with a one-pixel outline is mostly
    // outline unless the outline goes down first
    bline(b, x0 - 1, y0, x1 - 1, y1, edge);
    bline(b, x0 + 2, y0, x1 + 2, y1, edge);
    bline(b, x0, y1 + 1, x1, y1 + 1, edge);
    brect(b, Math.min(x0, x1), y0, 2, 1, ramp[1]);
    bline(b, x0, y0, x1, y1, ramp[2] || ramp[1]);
    bline(b, x0 + 1, y0, x1 + 1, y1, ramp[1]);
  };
  const L = CX - 5, R = CX + 4;
  if (pose === 'happy') {
    put(L, sh, L - 1, sh - len);
    put(R, sh, R + 1, sh - len);
  } else if (pose === 'talk') {
    put(L, sh, L - 1, sh + len);
    put(R, sh, R + 1, sh - len + 1);
  } else if (pose === 'react') {
    put(L, sh, L - 2, sh + 2);
    put(R, sh, R + 2, sh + 2);
  } else {
    put(L, sh, L, sh + len);
    put(R, sh, R, sh + len);
  }
}

/* --------------------------------------------------------------------- faces */

/**
 * The face. Eyes are 2x2 with a catch light; anything smaller is the weight of the
 * contour and reads as a nick in the outline rather than an eye.
 */
function face(b, o = {}) {
  const ink = o.ink || 'ink';
  const eye = o.eye || 'ink';
  const ey = o.eyeY !== undefined ? o.eyeY : EYE_Y;

  if (o.skipEyes) {
    // the golem draws his own: a dark socket band with one bright speck in it
  } else if (o.blink) {
    for (const s of [-1, 1]) brect(b, s < 0 ? CX - EYE_DX : CX + EYE_DX - 1, ey + 1, 2, 1, ink);
  } else if (o.happy) {
    // ^^ : the two-pixel version of a smiling eye
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? CX - EYE_DX : CX + EYE_DX - 1;
      bset(b, x0, ey + 1, ink); bset(b, x0 + 1, ey, ink);
    }
  } else if (o.slit) {
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? CX - EYE_DX : CX + EYE_DX - 1;
      brect(b, x0, ey, 2, 2, eye);
      bset(b, s < 0 ? x0 + 1 : x0, ey, ink);
      bset(b, s < 0 ? x0 + 1 : x0, ey + 1, ink);
    }
  } else {
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? CX - EYE_DX : CX + EYE_DX - 1;
      brect(b, x0, ey, 2, 2, eye);
      bset(b, x0, ey, mix(P.white, P[eye] || eye, 0.2));
    }
  }

  if (o.brow && !o.skipEyes) for (const s of [-1, 1]) {
    const x0 = s < 0 ? CX - EYE_DX : CX + EYE_DX - 1;
    brect(b, x0, ey - 2, 2, 1, o.brow);
  }
  if (o.angry) for (const s of [-1, 1]) bset(b, s < 0 ? CX - EYE_DX - 1 : CX + EYE_DX, ey - 1, ink);

  // the nose. One pixel is invisible, so it is two wide and set on the centre line.
  if (o.nose) brect(b, CX - 1, o.noseY || NOSE_Y, 2, 1, o.nose);

  // the mouth
  const my = o.mouthY !== undefined ? o.mouthY : MOUTH_Y;
  if (o.mouth === 'open') brect(b, CX - 1, my, 3, 2, o.mouthKey || ink);
  else if (o.smile) { bset(b, CX - 2, my, ink); bset(b, CX + 2, my, ink); brect(b, CX - 1, my + 1, 3, 1, ink); }
  else brect(b, CX - 1, my, 3, 1, o.mouthKey || ink);

  if (o.blush) for (const s of [-1, 1]) brect(b, s < 0 ? CX - 4 : CX + 3, ey + 2, 2, 1, o.blush);
}

/**
 * Hair as a MASS over the skull, not a line round it.
 *
 * The first cast walked the head's circumference setting single pixels, which at this size
 * is a comb of teeth rather than hair. Hair is a shape: fill the head's own top rows,
 * plus a fringe row that dips over the brow.
 */
function hairCap(b, ramp, o = {}) {
  const depth = o.depth || 4;
  for (let i = 0; i < depth; i++) {
    const y = HEAD_TOP + i;
    const hw = HEAD_HW[i] + (o.lift && i === 0 ? 1 : 0);
    for (let x = -hw; x <= hw; x++) bset(b, CX + x, y, x < 0 ? ramp[2] || ramp[1] : ramp[1]);
  }
  // the fringe: one notch over the brow, never a row of spikes
  if (o.fringe) {
    const y = HEAD_TOP + depth;
    for (let x = -HEAD_HW[depth]; x <= HEAD_HW[depth]; x++) {
      if (Math.abs(x) > o.fringe) bset(b, CX + x, y, ramp[1]);
    }
  }
}

/** Hair falling past the jaw, either side of the face. */
function hairFall(b, ramp, y0, y1, o = {}) {
  const w = o.w || 5;
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    const ww = Math.round(w - t * (o.taper || 1));
    for (let d = 0; d < (o.thick || 2); d++) {
      bset(b, CX - ww + d, y, ramp[1]);
      bset(b, CX + ww - d, y, ramp[2] || ramp[1]);
    }
  }
}

/* ------------------------------------------------------------------ the cast */

const FOLK = {
  /**
   * THE GOLEM. The player. Big body, big nose, small dot eyes.
   *
   * The nose is the whole character and it took three goes to make it visible. A nose in
   * the same clay as the face, lit the same way, is not a nose -- it is a smudge. It needs
   * a DARKER head to sit against, no bounce light underneath (the default bounce lit its
   * underside and turned it into a row of little teeth), and its own dark edge.
   */
  golem(b, o) {
    const pose = o.pose;
    torso(b, CLAY, { wide: true });
    legs(b, CLAY, 'clay0', { stride: pose === 'react' });
    arms(b, pose, CLAY_DEEP, { edge: 'clay0', len: 6 });
    // MID clay, not dark. On a dark head the socket, the mouth and the nose's underside
    // are all the same tone as the jaw, so he had no mouth at all and the nose merged into
    // one black band. Only the socket needs to be dark, and it is drawn dark below.
    head(b, CLAY, { chin: true });

    // a brass brow plate across the top of the face: the one hard edge on him
    brect(b, CX - 4, HEAD_CY - 2, 9, 1, 'brass1');
    brect(b, CX - 4, HEAD_CY - 3, 9, 1, 'brass0');

    // THE NOSE. A shaded blob with its own edge is not a nose at this size: the light
    // pixels come out separated by the edge pixels and it reads as a row of little teeth
    // under the eye socket. A nose is ONE MASS -- three wide, three deep, lit on top and
    // dark underneath -- and it has to overhang the mouth to have any depth at all.
    brect(b, CX - 1, NOSE_Y, 3, 3, 'clay3');
    brect(b, CX - 1, NOSE_Y, 3, 1, 'clay4');
    brect(b, CX - 1, NOSE_Y + 2, 3, 1, 'clay1');
    // the shadow goes down the SIDES of the nose, not under it: under it, it merges with
    // the mouth one row lower and the whole lower face becomes one dark bar
    bset(b, CX - 2, NOSE_Y + 1, 'clay1');
    bset(b, CX + 2, NOSE_Y + 1, 'clay1');

    // A DARK SOCKET, AND ONE PIXEL OF LIGHT IN IT. Everyone else needs a 2x2 eye to beat
    // the weight of the contour, but he does not: a gold speck on a dark clay face is the
    // brightest thing on him. Give him the 2x2 and he is wearing goggles.
    // TWO SOCKETS, NOT A BAND. A full-width dark bar across the eyes plus a light nose
    // row under it plus a dark mouth under that is three horizontal stripes, and three
    // horizontal stripes on a face read as a mouth full of teeth. Two small sockets leave
    // the middle of the face in its own tone, which is what lets the nose be a nose.
    for (const sd of [-1, 1]) {
      const sx = sd < 0 ? CX - 4 : CX + 3;      // cols 6,7 and 13,14: mirrored about CX
      brect(b, sx, EYE_Y, 2, 2, 'clay0');
      if (o.blink) continue;
      // a 1x2 speck, not a single pixel: the socket is dark enough that one pixel of gold
      // disappears into it, and three pixels of socket round it turn the face into a skull
      const gx = sd < 0 ? sx + 1 : sx;
      brect(b, gx, EYE_Y + (pose === 'happy' ? 1 : 0), 1, pose === 'happy' ? 1 : 2, 'gold');
      if (pose === 'react') bset(b, gx, EYE_Y + 1, 'orange');
    }
    face(b, {
      eye: 'gold', eyeY: EYE_Y, skipEyes: true, blink: o.blink,
      mouth: o.mouth, mouthY: MOUTH_Y + 2, mouthKey: 'clay0',
    });

    // the heart furnace, and two lit cracks: the only warm light on him
    brect(b, CX - 1, NECK_Y + 3, 3, 2, 'red2');
    bset(b, CX, NECK_Y + 3, 'orange');
    bset(b, CX - 4, NECK_Y + 5, 'orange');
    bset(b, CX + 4, NECK_Y + 2, 'orange');
  },

  /** ADAM. Bare chest, leaves over the lower body, short dark hair. */
  adam(b, o) {
    const pose = o.pose;
    torso(b, SKIN.dark);
    legs(b, SKIN.dark, 'skin0');
    // the leaves: a skirt across the hips, with three points hanging off it
    brect(b, CX - 4, HIP_Y - 2, 9, 3, 'leaf2');
    brect(b, CX - 4, HIP_Y - 2, 9, 1, 'leaf3');
    for (let i = -1; i <= 1; i++) {
      brect(b, CX + i * 3 - 1, HIP_Y + 1, 2, 1, 'leaf1');
      bset(b, CX + i * 3, HIP_Y + 2, 'leaf0');
    }
    arms(b, pose, SKIN.dark, { edge: 'skin0' });
    head(b, SKIN.dark);
    hairCap(b, ['wood0', 'wood1', 'wood2'], { depth: 4, fringe: 1 });
    face(b, {
      eye: 'ink', blink: o.blink, happy: pose === 'happy', mouth: o.mouth,
      smile: pose === 'happy', nose: 'skin0', blush: mix(P.red1, P.skin3, 0.55),
      brow: 'wood0',
    });
  },

  /** EVE. Leaves over the lower body and across the chest, long hair. */
  eve(b, o) {
    const pose = o.pose;
    torso(b, SKIN.warm);
    legs(b, SKIN.warm, 'skin1');
    brect(b, CX - 4, HIP_Y - 2, 9, 3, 'leaf2');
    brect(b, CX - 4, HIP_Y - 2, 9, 1, 'leaf3');
    for (let i = -1; i <= 1; i++) {
      brect(b, CX + i * 3 - 1, HIP_Y + 1, 2, 1, 'leaf1');
      bset(b, CX + i * 3, HIP_Y + 2, 'leaf0');
    }
    // a leaf band across the chest
    brect(b, CX - 4, NECK_Y + 2, 9, 2, 'leaf2');
    brect(b, CX - 4, NECK_Y + 2, 9, 1, 'leaf3');
    arms(b, pose, SKIN.warm, { edge: 'skin1' });
    hairFall(b, ['wood0', 'rust', 'wood2'], HEAD_CY, HEAD_CY + 8, { w: 6, thick: 2, taper: 1 });
    head(b, SKIN.warm);
    hairCap(b, ['wood0', 'rust', 'wood2'], { depth: 4, fringe: 2, lift: true });
    face(b, {
      eye: 'ink', blink: o.blink, happy: pose === 'happy', mouth: o.mouth,
      smile: true, nose: 'skin1', blush: mix(P.red1, P.skin4, 0.5),
    });
  },

  /**
   * THE SNAKE. No legs: a coil where the legs would be, and a long neck out of it.
   *
   * The silhouette is the character. A snake drawn as a person-shape with a snake head is
   * just a person; the coil has to take up the bottom third.
   */
  snake(b, o) {
    const pose = o.pose;
    // the coil: two flattened loops, the lower one wider
    blob(b, CX, FOOT_Y - 1, 7, 2, ['leaf0', 'leaf1', 'leaf2'], { edge: 'ink' });
    blob(b, CX + 1, FOOT_Y - 3, 5, 2, ['leaf0', 'leaf2', 'leaf3'], { edge: 'leaf0' });
    // scale marks along the top loop
    for (let x = -4; x <= 4; x += 2) bset(b, CX + x, FOOT_Y - 4, 'leaf0');
    // the neck: an S, thick at the coil and narrowing to the jaw
    for (let y = HEAD_CY + 5; y < FOOT_Y - 4; y++) {
      const t = (y - HEAD_CY - 5) / 8;
      const off = Math.round(Math.sin(t * 2.4) * 2);
      const w = 1 + Math.round(t * 1.4);
      for (let x = -w; x <= w; x++) bset(b, CX + off + x, y, x < 0 ? 'leaf2' : 'leaf1');
    }
    if (pose === 'happy' || pose === 'react') {
      // the hood: flared, and only when he means it
      for (let i = 0; i < 3; i++) {
        brect(b, CX - 7 - i, HEAD_CY + 2 + i, 3, 2, 'leaf1');
        brect(b, CX + 5 + i, HEAD_CY + 2 + i, 3, 2, 'leaf1');
      }
    }
    head(b, ['leaf1', 'leaf2', 'leaf3']);
    // a paler jaw, which is what makes him read as a snake and not a green man
    brect(b, CX - 3, MOUTH_Y - 1, 7, 3, 'leaf3');
    face(b, {
      eye: 'gold', slit: !o.blink, blink: o.blink, mouth: o.mouth,
      mouthKey: 'leaf0', angry: true,
    });
    // the grin and one fang
    bset(b, CX - 3, MOUTH_Y + 1, 'leaf0');
    bset(b, CX + 3, MOUTH_Y + 1, 'leaf0');
    bset(b, CX + 2, MOUTH_Y + 2, 'white');
  },

  /** NOAH. A brim, a crown, and a beard that covers the mouth. */
  noah(b, o) {
    const pose = o.pose;
    torso(b, LINEN);
    legs(b, CLOTH, 'wood0');
    // the tunic, long, with two fold lines
    rows(b, CX, NECK_Y + 1, [4, 5, 5, 5, 5, 5, 5], LINEN, { cy: NECK_Y + 4, r: 7 });
    bline(b, CX - 2, NECK_Y + 3, CX - 2, HIP_Y, 'parch0');
    bline(b, CX + 2, NECK_Y + 4, CX + 2, HIP_Y, 'parch0');
    // a rope belt
    brect(b, CX - 5, HIP_Y - 3, 11, 1, 'brass1');
    arms(b, pose, LINEN, { edge: 'parch0' });
    head(b, SKIN.warm);
    // THE BEARD: a mass under the nose, wider than the jaw, with the mouth inside it
    rows(b, CX, MOUTH_Y - 1, [4, 5, 5, 4, 3], ['grey1', 'grey2', 'white'], { cy: MOUTH_Y + 1, r: 6 });
    face(b, {
      eye: 'ink', blink: o.blink, happy: pose === 'happy',
      mouth: o.mouth, mouthY: MOUTH_Y + 1, mouthKey: 'grey0',
      nose: 'skin1', brow: 'grey2',
    });
    // THE HAT: a brim that touches the head, then a crown on top of it. A brim alone
    // reads as a headband.
    brect(b, CX - 7, HEAD_TOP + 2, 15, 1, 'wood1');
    brect(b, CX - 6, HEAD_TOP + 1, 13, 1, 'wood2');
    rows(b, CX, HEAD_TOP - 2, [3, 4, 4], ['wood0', 'wood1', 'wood2'], { cy: HEAD_TOP - 1, r: 5 });
    brect(b, CX - 4, HEAD_TOP, 9, 1, 'rust');
  },

  /** THE CHERUBIM. Wings, a halo behind the head, and a face made mostly of light. */
  cherub(b, o) {
    const pose = o.pose;
    // WINGS FIRST, so the body sits in front of them. A fan of feathers -- three lumps a
    // side came out as bread rolls.
    for (const s of [-1, 1]) {
      for (let i = 0; i < 4; i++) {
        // NECK_Y + 1, not NECK_Y - 1: the head's bottom row IS NECK_Y - 1, so wings
        // starting there landed two pale feather tips on his jaw.
        const y0 = NECK_Y + 1 + i;
        const len = 5 - Math.abs(i - 1);
        bline(b, CX + s * 4, y0, CX + s * (4 + len), y0 + i, 'ice');
        bset(b, CX + s * (4 + len), y0 + i, 'white');
      }
    }
    // THE HALO, drawn BEHIND the head as a flat ellipse. Drawn as a ring on top it came
    // out as two gold horns, and half of it ran off the top of the buffer.
    for (let x = -4; x <= 4; x++) {
      const y = HEAD_TOP - 2 + Math.round((x * x) / 10);
      bset(b, CX + x, y, 'gold');
      if (Math.abs(x) < 3) bset(b, CX + x, y - 1, 'brass3');
    }
    rows(b, CX, NECK_Y, [3, 4, 4, 4, 4, 4, 4, 4], LINEN, { cy: NECK_Y + 3, r: 6 });
    legs(b, LINEN, 'parch0', { top: HIP_Y + 1 });
    arms(b, pose, LINEN, { edge: 'parch0' });
    head(b, SKIN.warm);
    hairCap(b, ['brass0', 'brass1', 'brass2'], { depth: 3, fringe: 2 });
    // gold curls at the temples
    for (const s of [-1, 1]) { bset(b, CX + s * 5, HEAD_CY, 'gold'); bset(b, CX + s * 5, HEAD_CY + 1, 'brass3'); }
    face(b, {
      eye: 'sky', blink: o.blink, happy: pose === 'happy', mouth: o.mouth, smile: true,
      nose: 'skin1', blush: mix(P.red1, P.skin4, 0.6),
    });
    // one flame in the raised hand
    if (pose !== 'idle') {
      const fx = CX + 6, fy = NECK_Y + (pose === 'happy' ? -3 : 5);
      bset(b, fx, fy, 'orange'); bset(b, fx, fy - 1, 'gold'); bset(b, fx, fy - 2, 'white');
    }
  },
};

export const FOLK_IDS = Object.keys(FOLK);

/* -------------------------------------------------------------------- baking */

const cache = new Map();
const CAP = 160;

function sprite(id, pose, mouth, blink) {
  const key = `${id}/${pose}/${mouth}/${blink ? 1 : 0}`;
  let hit = cache.get(key);
  if (hit !== undefined) return hit;
  const fn = FOLK[id];
  const mk = fn ? makeCanvas(FOLK_W, FOLK_H) : null;
  if (!mk) { cache.set(key, null); return null; }
  const buf = makeBuf(A_W, A_H);
  fn(buf, { pose, mouth, blink });
  outline(buf, 'ink');
  flush(buf, mk.g, 0, 0, S);
  hit = mk.canvas;
  if (cache.size > CAP) cache.clear();
  cache.set(key, hit);
  return hit;
}

export function clearFolkCache() { cache.clear(); }
export function folkCacheSize() { return cache.size; }

/* ------------------------------------------------------------------ drawing */

/**
 * drawFolk(g, id, x, y, t, o)
 *   x, y   the character's FEET, which is what you actually place
 *   o      { pose, scale, flip, talking, alpha, mud, sparkle, wet, phase }
 */
export function drawFolk(g, id, x, y, t = 0, o = {}) {
  const sc = Math.max(1, Math.round(o.scale || 1));
  const pose = o.pose || 'idle';
  const bob = Math.round(Math.sin(t * (o.talking ? 5.5 : 1.6) + (o.phase || 0)) * (o.talking ? 1.2 : 1));
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
  if (id === 'snake') drawTongue(g, x, dy, dh, sc, t);
}

/**
 * Mud sliding off the golem. Four drips on their own loops, each leaving a splat when it
 * lands -- which is what sells it as wet clay rather than as brown pixels.
 */
function drawMud(g, x, dy, dw, dh, sc, t, amt) {
  const n = Math.round(2 + clamp(amt, 0, 1) * 3);
  for (let i = 0; i < n; i++) {
    const seed = i * 3.7;
    const k = (t * (0.55 + i * 0.16) + seed) % 1;
    const ox = Math.round(((i % 3) - 1) * 8 + Math.sin(seed) * 3) * sc;
    const top = dy + Math.round(dh * (0.42 + (i % 2) * 0.18));
    const py = top + k * dh * 0.5;
    rect(g, x + ox, py, 2 * sc, 2 * sc, 'clay3');
    rect(g, x + ox, py + 2 * sc, 2 * sc, 2 * sc, 'clay1');
    if (k > 0.9) {
      const fy = dy + dh - 2 * sc;
      rect(g, x + ox - 4 * sc, fy, 2 * sc, 2 * sc, 'clay2');
      rect(g, x + ox + 4 * sc, fy, 2 * sc, 2 * sc, 'clay2');
      rect(g, x + ox - 2 * sc, fy - 2 * sc, 2 * sc, 2 * sc, 'clay3');
    }
  }
  // a wet sheen across the shoulders
  for (let i = 0; i < 5; i++) {
    rect(g, x - Math.round(dw * 0.22) + i * sc * 4, dy + Math.round(dh * 0.36), 2 * sc, 2 * sc, 'clay4');
  }
}

/** Cozy magic motes, used by the cherubim and by the shepherd wand. */
export function drawSparkle(g, x, y, sc, t, amt) {
  const n = Math.round(3 + clamp(amt, 0, 1) * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * 1.1;
    const r = (7 + Math.sin(t * 2 + i) * 4) * sc;
    const sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r * 0.6;
    rect(g, sx, sy, 2 * sc, 2 * sc, i % 3 === 0 ? 'magic2' : i % 3 === 1 ? 'magic1' : 'gold');
  }
}

function drawFolkWet(g, x, dy, dw, dh, sc, t) {
  for (let i = 0; i < 4; i++) {
    const k = (t * (1.1 + i * 0.3) + i * 2.1) % 1;
    const ox = Math.round(((i % 3) - 1) * 7) * sc;
    rect(g, x + ox, dy + dh * 0.5 + k * dh * 0.45, 2 * sc, 2 * sc, 'foam');
    rect(g, x + ox, dy + dh * 0.5 + k * dh * 0.45 + 2 * sc, 2 * sc, 2 * sc, 'water3');
  }
  void dw;
}

/** The snake's tongue, because a still snake is a garden ornament. */
function drawTongue(g, x, dy, dh, sc, t) {
  const cyc = (t * 0.8) % 1;
  if (cyc > 0.32) return;
  const k = cyc / 0.32;
  const tx = x + Math.round(4 * sc);
  const ty = dy + Math.round(dh * 0.42);
  const len = Math.round((2 + k * 5) * sc);
  rect(g, tx, ty, len, 2 * sc, 'red2');
  rect(g, tx + len, ty - 2 * sc, 2 * sc, 2 * sc, 'red2');
  rect(g, tx + len, ty + 2 * sc, 2 * sc, 2 * sc, 'red2');
}

/* ------------------------------------------------------------- the shepherd wand

The tool the golem points at an animal. It replaced a pool cue, and the difference is the
whole feel of the game: a cue is a stick you hit something with, a crook is something you
guide an animal home with. Short, warm, wooden, and it does its work in light.
*/

export function drawWand(g, x, y, angle, charge = 0, t = 0, o = {}) {
  const ch = clamp(charge, 0, 1);
  const sc = Math.max(1, Math.round(o.scale || 1));
  const len = (20 + ch * 5) * sc;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const tipX = x + ca * len, tipY = y + sa * len;

  // a two-pixel shaft, to match every other line in the game
  const th = 2 * sc;
  for (let i = 0; i < len; i += 1) {
    const f = i / len;
    const bx = x + ca * i, by = y + sa * i;
    rect(g, bx - sa * th * 0.5, by + ca * th * 0.5, th, th, f < 0.28 ? 'wood1' : f < 0.7 ? 'wood2' : 'wood3');
    if (f < 0.3 && i % (3 * sc) === 0) rect(g, bx - sa * th, by + ca * th, th, th, 'brass1');
  }
  // the crook: an arc, drawn fat so it survives at this weight
  for (let k = 0; k < 9; k++) {
    const a = angle - 0.6 + k * 0.36;
    rect(g, tipX + Math.cos(a) * 4 * sc, tipY + Math.sin(a) * 4 * sc, th, th, k < 3 ? 'wood3' : 'wood4');
  }
  const gx = tipX + ca * 3 * sc, gy = tipY + sa * 3 * sc;
  if (0.4 + ch * 0.6 > 0.5) disc(g, gx, gy, 3 * sc, 'magic1');
  disc(g, gx, gy, 2 * sc, 'magic2');
  drawSparkle(g, gx, gy, sc, t, 0.3 + ch);
  if (ch > 0.02) {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 2.2 + i / 3) % 1;
      rect(g, x + ca * ph * len, y + sa * ph * len, 2 * sc, 2 * sc, i % 2 ? 'magic1' : 'gold');
    }
  }
}

/* ------------------------------------------------------------------ portraits */

const GROUNDS = {
  golem: ['shadow', 'clay0', 'clay2', 'sand'],   // his head runs dark; a dark ground hid it
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
  // a soft vignette, so the head reads against it wherever the frame is
  for (let i = 0; i < 4; i++) {
    wash(mk.g, 0, 0, w, h, 'ink', 0.04);
    wash(mk.g, 0, h - 10 - i * 6, w, 10 + i * 6, 'ink', 0.05);
  }
  hit = mk.canvas;
  if (bgCache.size > 40) bgCache.clear();
  bgCache.set(k, hit);
  return hit;
}

/**
 * A dialogue portrait: the same sprite, scaled up and cropped to the shoulders, on a
 * baked ground. One art system for the walk-around and the talking head, which is why
 * they can never drift apart.
 */
export function drawFolkPortrait(g, id, x, y, w, h, t = 0, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  rect(g, x - 2, y - 2, w + 4, h + 4, 'ink');
  const bg = ground(id, w, h);
  if (bg) g.drawImage(bg, x, y);

  // Rows 0..36 is head plus shoulders. Scaling to the head alone cropped the hats,
  // halos and brow plates off the top -- precisely the details that tell the cast apart.
  const SHOW = 38;
  const sc = Math.max(1, Math.min(Math.floor(h / SHOW), Math.floor(w / FOLK_W)));
  const pose = o.pose || (o.talking ? 'talk' : 'idle');
  const blink = ((t * 0.8) % 4.4) < 0.12;
  const mouth = o.talking && Math.floor(t * 7) % 2 === 0 ? 'open' : 'shut';
  const cv = sprite(id, pose, mouth, blink);
  if (!cv) return;
  const bob = Math.round(Math.sin(t * 1.3) * 1);
  const dw = FOLK_W * sc;
  const dx = x + Math.round((w - dw) / 2);
  const dy = y + h - SHOW * sc + bob;
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.drawImage(cv, 0, 0, FOLK_W, SHOW, dx, dy, dw, SHOW * sc);
  g.restore();

  if (o.mud) drawMud(g, x + w / 2, dy, dw, SHOW * sc, sc, t, o.mud);
  if (o.sparkle) drawSparkle(g, x + w / 2, y + h * 0.4, sc, t, o.sparkle);
  ellipse(g, x + w / 2, y + h - 2, w * 0.4, 2, 'ink');
  void col;
}

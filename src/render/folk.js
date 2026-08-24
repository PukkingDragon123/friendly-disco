// The cast: every person, spirit and serpent in the game.
//
// ONE art system for two jobs. A folk sprite is baked once and used both as the
// walk-around character (Eden, the boat, an island) and, cropped to the shoulders, as the
// dialogue portrait. Two art systems for the same character is how a cast ends up looking
// like two different games.
//
// PROPORTIONS ARE THE WHOLE TRICK. Cute is a big round head on a small body:
//
//     hat / hair / halo     rows  0.. 6
//     HEAD   (orb, r 11)    rows  4..26     <- 40% of the whole figure
//     eyes                  row  18         <- 2px dots, close together, BELOW centre
//     nose                  row  20
//     mouth                 row  22
//     torso                 rows 27..42
//     legs                  rows 42..55
//
// Tiny dot eyes set low and close, a visible nose, and a head that is far too big. Every
// character is built on that skeleton, which is why they read as one family.
//
// EVERYTHING GOES THROUGH render/pixbuf.js, and that is not an implementation detail: it
// gives every figure a one-pixel dark contour computed after the last shape is down, and
// spherical shading with a curved terminator, a rim light and a bounce. The previous cast
// was drawn straight to canvas with flat fills and a diagonal light split, and at 34
// pixels they were stacks of boxes with dashes for eyes.
//
// Baked per (id, pose, mouth, blink), so a character is one blit plus an integer bob.
// Anything that must move every frame -- the golem's mud, the cherub's motes, the snake's
// tongue -- is a handful of live pixels on top.

import { P, col, mix } from '../core/palette.js';
import { makeCanvas, rect, px, disc, ellipse, wash, clamp } from '../core/pixel.js';
import {
  makeBuf, bset, bget, bmir, brect, bline, orb, blob, limb, orbShade, outline, flush,
} from './pixbuf.js';

export const FOLK_W = 40;
export const FOLK_H = 56;

const CX = 20;
const HEAD_CY = 15, HEAD_R = 11;
const EYE_Y = HEAD_CY + 3;
const EYE_DX = 3;                 // 2px eyes at CX-4 and CX+2: close together is cuter
const NOSE_Y = HEAD_CY + 5;
const MOUTH_Y = HEAD_CY + 7;
const NECK_Y = 26;
const TORSO_Y = 27, HIP_Y = 42, FOOT_Y = 55;

/** Poses. Every character supports all four; some differ more than others. */
export const POSES = ['idle', 'talk', 'happy', 'react'];

/* ------------------------------------------------------------------ materials */

const SKIN = { dark: ['skin0', 'skin1', 'skin2', 'skin3'], warm: ['skin1', 'skin2', 'skin3', 'skin4'] };
const CLAY = ['clay0', 'clay1', 'clay2', 'clay3', 'clay4'];
const LEAF = ['leaf0', 'leaf1', 'leaf2', 'leaf3', 'leaf4'];
const CLOTH = ['wood0', 'wood1', 'wood2', 'wood3'];
const LINEN = ['parch0', 'parch1', 'parch', 'cream'];

/* ------------------------------------------------------------------- the body */

/** A tapering torso. `top`/`bot` are half-widths; the lit side is the left. */
function torso(b, y0, y1, top, bot, ramp) {
  const [lo, mid, hi, br] = [ramp[0], ramp[1], ramp[2], ramp[3] || ramp[2]];
  for (let y = y0; y <= y1; y++) {
    const f = (y - y0) / Math.max(1, y1 - y0);
    // a slight waist: narrowest a third of the way down
    const w = top + (bot - top) * f - Math.sin(f * Math.PI) * 0.8;
    const hw = Math.max(2, Math.round(w));
    for (let x = -hw; x <= hw; x++) {
      const t = x / hw;
      bset(b, CX + x, y, t < -0.45 ? hi : t < 0.25 ? mid : t < 0.7 ? lo : lo);
    }
    bset(b, CX - hw + 1, y, br);
  }
}

/** Two stubby legs with feet. */
function legs(b, y0, y1, w, ramp, footKey, o = {}) {
  const gap = o.gap === undefined ? 2 : o.gap;
  for (const side of [-1, 1]) {
    const x = side < 0 ? CX - gap - w : CX + gap;
    for (let y = y0; y < y1; y++) {
      for (let i = 0; i < w; i++) {
        bset(b, x + i, y, i === 0 ? ramp[2] : i >= w - 1 ? ramp[0] : ramp[1]);
      }
    }
    // a foot with a lit top and a dark sole, and one pixel of toe past the ankle
    brect(b, x - 1, y1 - 3, w + 2, 3, footKey || ramp[0]);
    brect(b, x - 1, y1 - 3, w + 2, 1, mix(P[footKey || ramp[0]], P.white, 0.25));
    brect(b, x - 1, y1 - 1, w + 2, 1, 'ink');
  }
  // the shadow between the legs, so they are two legs and not a column
  for (let y = y0; y < y1 - 1; y++) brect(b, CX - gap, y, gap * 2, 1, 'ink');
}

/**
 * Arms, hung from just outside the shoulder so the silhouette stays open, with a mitten
 * hand on the end. `pose` moves them, and that is most of what an animation IS here.
 */
function arms(b, pose, ramp, o = {}) {
  const sh = (o.shoulder || 9);
  const top = TORSO_Y + 2;
  const len = o.len || 12;
  for (const side of [-1, 1]) {
    const sx = CX + side * sh;
    let ex = sx + side * 2, ey = top + len;
    if (pose === 'react') { ex = sx + side * 5; ey = top - 7; }
    else if (pose === 'happy') { ex = sx + side * 5; ey = top + 1; }
    else if (pose === 'talk' && side === 1) { ex = sx + 6; ey = top + 3; }
    const dark = o.edge || 'ink';
    limb(b, sx, top, ex, ey, o.thick || 2, (o.thick || 2) - 0.4,
      [ramp[0], ramp[1], ramp[2]], { edge: dark });
    orb(b, ex, ey + 1, (o.thick || 2) + 0.6, orbShade(ramp), { edge: dark });
  }
}

/**
 * Hair, as a MASS.
 *
 * The first version walked the skull's circumference laying single pixels, and the result
 * was a bald head with a dotted line on it. Hair has volume: an orb slightly bigger than
 * the head, sat slightly higher, then cut off at the brow -- and only THEN a few strands
 * and a highlight, which is what a sixteen-pixel head can carry.
 */
function hairCap(b, cy, r, ramp, o = {}) {
  const cut = cy + (o.cut !== undefined ? o.cut : -2);         // the brow line
  const lift = o.lift !== undefined ? o.lift : 2;
  const shade = orbShade(ramp);
  for (let y = -r - 1; y <= r + 1; y++) {
    for (let x = -r - 1; x <= r + 1; x++) {
      const d = x * x + y * y;
      if (d > (r + 1) * (r + 1)) continue;
      const py = cy - lift + y;
      if (py > cut) continue;
      const nx = x / (r + 1), ny = y / (r + 1);
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      bset(b, CX + x, py, shade(nx, ny, nz));
    }
  }
  // a fringe that dips over the brow, so the hairline is not a straight cut
  const fr = o.fringe === undefined ? 3 : o.fringe;
  for (let i = -r; i <= r; i++) {
    if (Math.abs(i) > r - 1) continue;
    // a broad sweep with one soft notch, not a comb: a high-frequency sine along the
    // hairline gives a row of teeth, which reads as a wig
    const t = i / r;
    const dip = Math.round((1 - t * t) * fr + Math.sin(i * 0.42) * 0.9);
    for (let k = 0; k < dip; k++) bset(b, CX + i, cut + k, k === dip - 1 ? ramp[0] : ramp[1]);
  }
  // one highlight sweep, upper left, which is where the light is
  for (let i = 0; i < 6; i++) {
    bset(b, CX - 6 + i, cy - lift - r + 3 + Math.round(i * 0.4), ramp[ramp.length - 1]);
  }
}

/** Long hair falling behind the shoulders. Drawn BEFORE the body. */
function hairFall(b, y0, y1, ramp, o = {}) {
  for (let y = y0; y < y1; y++) {
    const f = (y - y0) / (y1 - y0);
    const hw = Math.round((o.w || 10) + Math.sin(f * 2.6) * 3 - f * 2);
    for (const s of [-1, 1]) {
      for (let i = 0; i < (o.thick || 5); i++) {
        const t = i / (o.thick || 5);
        bset(b, CX + s * (hw - i), y, t < 0.2 ? ramp[0] : t < 0.6 ? ramp[1] : ramp[2]);
      }
    }
  }
}

/* --------------------------------------------------------------------- faces */

/**
 * The face. Two dot eyes, a nose, a mouth, blush.
 *
 * The blush is not decoration: two warm pixels on the cheeks is the cheapest way to make
 * a pixel face read as friendly rather than vacant, and it is why every cozy game has it.
 */
function face(b, o) {
  const ink = o.ink || 'ink';
  const shine = o.shine || 'white';
  const blush = o.blush || 'pink';
  const pose = o.pose;
  const eyeY = o.eyeY !== undefined ? o.eyeY : EYE_Y;
  const dx = o.dx !== undefined ? o.dx : EYE_DX;

  if (o.blink) {
    for (const s of [-1, 1]) {
      const ex = CX + (s < 0 ? -dx - 1 : dx);
      brect(b, ex, eyeY + 1, 2, 1, ink);
    }
  } else if (pose === 'happy') {
    // ^^ eyes: two little arches
    for (const s of [-1, 1]) {
      const ex = CX + (s < 0 ? -dx - 1 : dx);
      bset(b, ex, eyeY + 1, ink);
      bset(b, ex + 1, eyeY, ink);
      bset(b, ex + (s < 0 ? 2 : -1), eyeY + 1, ink);
    }
  } else {
    const wide = pose === 'react';
    for (const s of [-1, 1]) {
      const ex = CX + (s < 0 ? -dx - 1 : dx);
      brect(b, ex, eyeY, 2, wide ? 3 : 2, ink);
      bset(b, ex, eyeY, shine);                       // the catch light
      if (wide) bset(b, ex + 1, eyeY + 2, shine);
    }
  }

  // brows: one pixel each, and they carry more expression than anything else on the face
  if (o.brow) {
    for (const s of [-1, 1]) {
      const ex = CX + (s < 0 ? -dx - 1 : dx);
      const lift = pose === 'react' ? -2 : pose === 'happy' ? -1 : 0;
      brect(b, ex, eyeY - 2 + lift, 2, 1, o.brow);
    }
  }

  // blush, tucked under the outside corner of each eye
  for (const s of [-1, 1]) {
    const bx = CX + s * (dx + 2);
    bset(b, bx, eyeY + 2, blush);
    bset(b, bx + (s < 0 ? -1 : 1), eyeY + 2, mix(P[blush], P.white, 0.35));
  }

  // nose: two pixels, shadowed underneath
  if (o.nose !== false) {
    bset(b, CX - 1, o.noseY || NOSE_Y, o.noseKey || ink);
    bset(b, CX, (o.noseY || NOSE_Y) + 1, o.noseKey || ink);
  }

  // mouth
  const my = o.mouthY || MOUTH_Y;
  if (o.mouth === 'open') {
    brect(b, CX - 2, my, 4, 2, ink);
    brect(b, CX - 1, my + 1, 2, 1, o.tongue || 'red1');
  } else if (pose === 'happy' || o.mouth === 'smile') {
    bset(b, CX - 2, my, ink);
    brect(b, CX - 1, my + 1, 2, 1, ink);
    bset(b, CX + 2, my, ink);
  } else if (pose === 'react') {
    brect(b, CX - 1, my, 2, 2, ink);
  } else if (o.mouthSmall) {
    brect(b, CX - 1, my, 2, 1, ink);
  } else {
    brect(b, CX - 1, my, 3, 1, ink);
  }
}

/* ------------------------------------------------------------------- the cast */

const FOLK = {
  /**
   * THE GOLEM. The brief, verbatim: big cute body, BIG NOSE, tiny dot eyes, chunky
   * proportions, mud. So the nose is an orb nearly half the width of his head and the
   * eyes are single lit pixels in deep sockets -- the exact opposite ratio to everybody
   * else, which is what makes him read as not-a-person at a glance.
   */
  golem(b, o) {
    // the head runs DARKER than the body on purpose: a pale nose needs something to
    // stand against, and on the full clay ramp it disappeared into the lit cheek
    const clay = orbShade(['clay0', 'clay1', 'clay1', 'clay2', 'clay3']);
    legs(b, HIP_Y, FOOT_Y, 7, ['clay0', 'clay1', 'clay2'], 'clay0', { gap: 1 });
    torso(b, TORSO_Y, HIP_Y + 1, 13, 12, CLAY);

    // clay TEXTURE. Cracks in clay0 against clay1 were invisible; a crack needs a dark
    // line with a lit lip along its upper edge, the same as any groove in anything.
    const crack = (x0, y0, x1, y1) => {
      bline(b, x0, y0, x1, y1, 'clay0');
      bline(b, x0, y0 - 1, x1, y1 - 1, 'clay4');
    };
    crack(CX - 9, TORSO_Y + 4, CX - 3, TORSO_Y + 7);
    crack(CX + 6, TORSO_Y + 11, CX + 11, TORSO_Y + 7);
    crack(CX - 11, HIP_Y - 4, CX - 5, HIP_Y - 2);
    crack(CX + 2, TORSO_Y + 1, CX + 8, TORSO_Y + 2);
    for (let i = 0; i < 20; i++) {
      const gx = CX - 11 + ((i * 7) % 23), gy = TORSO_Y + ((i * 5) % 16);
      bset(b, gx, gy, i % 4 === 0 ? 'clay4' : i % 4 === 1 ? 'clay0' : 'clay1');
    }
    // the heart furnace, glowing out through a chipped hole in his chest
    blob(b, CX + 1, TORSO_Y + 7, 4, 4, 'clay0');
    orb(b, CX + 1, TORSO_Y + 7, 3, orbShade(['brass0', 'brass1', 'gold', 'white']));
    bset(b, CX + 1, TORSO_Y + 6, 'white');

    arms(b, o.pose, ['clay1', 'clay2', 'clay3'], { shoulder: 13, thick: 3, len: 13, edge: 'clay0' });

    // --- the head: wider than tall, because a wide head is a heavy head
    orb(b, CX, HEAD_CY, HEAD_R, clay, { squashY: 0.94 });

    // A DEEP SOCKET BAND. Two lit specks on a smooth face read as sparkles on a cheek;
    // set into a band of shadow they read as eyes a long way back in a big skull.
    blob(b, CX, EYE_Y, 9, 3, 'clay0');
    for (const s of [-1, 1]) {
      const ex = CX + s * 5;
      bset(b, ex, EYE_Y, 'gold');
      bset(b, ex, EYE_Y - 1, 'brass2');
      bset(b, ex + (s < 0 ? -1 : 1), EYE_Y, 'brass0');
    }

    // THE NOSE. Twelve pixels across on a twenty-three pixel head: it is the first thing
    // you see, which is the entire brief. Its own contour, its own light, and a hard
    // shadow underneath so it reads as sticking OUT and not painted on.
    // bounce OFF: the underside of a nose is the one surface with nothing below it to
    // throw light back, and the default bounce lit it into a row of little teeth
    orb(b, CX, NOSE_Y + 1, 5, orbShade(['clay1', 'clay2', 'clay3', 'clay4'], { bounce: 0 }),
      { edge: 'clay0' });
    brect(b, CX - 4, NOSE_Y + 6, 9, 1, 'clay0');
    bmir(b, CX, CX - 3, NOSE_Y + 3, 'clay0');                  // nostrils
    bset(b, CX - 3, NOSE_Y, 'cream');                          // the highlight on the bridge

    // the brow: a plate of fired brass with three marks driven into it
    brect(b, CX - 8, HEAD_CY - 7, 17, 4, 'brass1');
    brect(b, CX - 8, HEAD_CY - 7, 17, 1, 'brass2');
    brect(b, CX - 8, HEAD_CY - 4, 17, 1, 'brass0');
    for (let i = 0; i < 3; i++) brect(b, CX - 5 + i * 4, HEAD_CY - 6, 1, 2, 'ink');

    // no mouth: a seam, under the nose's shadow. He has never said anything.
    brect(b, CX - 4, MOUTH_Y + 4, 9, 1, 'clay0');
    if (o.pose === 'happy') {
      bset(b, CX - 5, MOUTH_Y + 3, 'clay0');
      bset(b, CX + 5, MOUTH_Y + 3, 'clay0');
    }
    if (o.pose === 'react') brect(b, CX - 2, MOUTH_Y + 4, 5, 2, 'clay0');
  },

  /** ADAM. Made things with his hands, and looks it: wide shoulders, working arms. */
  adam(b, o) {
    const skin = orbShade(SKIN.dark);
    legs(b, HIP_Y, FOOT_Y, 5, ['skin0', 'skin1', 'skin2'], 'skin0');
    // the leaf wrap: overlapping fig leaves on a twisted cord
    for (let i = 0; i < 7; i++) {
      const lx = CX - 9 + i * 3;
      blob(b, lx, HIP_Y + 3 + (i % 2), 2, 4, orbShade(LEAF));
    }
    brect(b, CX - 10, HIP_Y - 1, 21, 2, 'leaf1');
    brect(b, CX - 10, HIP_Y - 1, 21, 1, 'leaf3');
    torso(b, TORSO_Y, HIP_Y, 9, 8, SKIN.dark);
    // collarbones, ribs and a navel. A bare torso with no landmarks is a plank, and
    // skin1 on a skin1..skin3 ramp was too close to see -- these use skin0.
    brect(b, CX - 6, TORSO_Y + 2, 5, 1, 'skin0');
    brect(b, CX + 2, TORSO_Y + 2, 5, 1, 'skin0');
    bset(b, CX - 1, TORSO_Y + 3, 'skin0');
    bmir(b, CX, CX - 4, TORSO_Y + 6, 'skin0');
    for (let i = 0; i < 3; i++) {
      bmir(b, CX, CX - 7, TORSO_Y + 9 + i * 2, 'skin1');
    }
    bset(b, CX, TORSO_Y + 12, 'skin0');
    arms(b, o.pose, ['skin0', 'skin1', 'skin2'], { shoulder: 9, thick: 2, len: 13 });
    // a cord round the neck with a river stone on it
    brect(b, CX - 3, NECK_Y, 7, 1, 'wood2');
    bset(b, CX, NECK_Y + 1, 'stone3');

    orb(b, CX, HEAD_CY, HEAD_R, skin);
    hairCap(b, HEAD_CY, HEAD_R, ['hair0', 'hair1', 'hair2'], { cut: -3, fringe: 4 });
    // sideburns, which are what stop a mop reading as a helmet
    for (const s2 of [-1, 1]) brect(b, CX + s2 * 10 - (s2 < 0 ? 1 : 0), HEAD_CY - 2, 2, 4, 'hair1');
    face(b, {
      pose: o.pose, mouth: o.mouth, blink: o.blink, brow: 'hair1', blush: 'red2',
      mouthSmall: true,
    });
  },

  /** EVE. Slighter, and the long hair is most of her silhouette. */
  eve(b, o) {
    const skin = orbShade(SKIN.warm);
    legs(b, HIP_Y, FOOT_Y, 4, ['skin1', 'skin2', 'skin3'], 'skin1');
    // hair BEHIND the shoulders first, so the head sits in front of it
    hairFall(b, HEAD_CY - 2, HIP_Y + 2, ['hair0', 'hair1', 'hair2'], { w: 11, thick: 5 });
    // the leaf wrap: a skirt, and a band across the chest
    for (let i = 0; i < 6; i++) blob(b, CX - 7 + i * 3, HIP_Y + 3 + (i % 2), 2, 4, orbShade(LEAF));
    brect(b, CX - 8, HIP_Y - 1, 17, 2, 'leaf1');
    brect(b, CX - 8, HIP_Y - 1, 17, 1, 'leaf3');
    torso(b, TORSO_Y, HIP_Y, 7, 7, SKIN.warm);
    for (let i = 0; i < 5; i++) {
      blob(b, CX - 5 + i * 3, TORSO_Y + 4, 2, 2, orbShade(['leaf1', 'leaf2', 'leaf3']));
    }
    arms(b, o.pose, ['skin1', 'skin2', 'skin3'], { shoulder: 7, thick: 2, len: 12 });

    orb(b, CX, HEAD_CY, HEAD_R, skin);
    hairCap(b, HEAD_CY, HEAD_R, ['hair0', 'hair1', 'hair2'], { cut: -4, fringe: 3, lift: 3 });
    // a centre part, and two locks framing the face
    brect(b, CX, HEAD_CY - HEAD_R - 1, 1, 5, 'hair0');
    for (const s2 of [-1, 1]) {
      for (let y = 0; y < 8; y++) {
        brect(b, CX + s2 * (10 - Math.floor(y / 4)) - (s2 < 0 ? 1 : 0), HEAD_CY - 4 + y, 2, 1,
          y % 3 === 0 ? 'hair2' : 'hair1');
      }
    }
    // a flower behind one ear
    orb(b, CX + 9, HEAD_CY - 1, 2, orbShade(['red1', 'pink', 'white']));
    bset(b, CX + 9, HEAD_CY - 1, 'gold');
    face(b, {
      pose: o.pose, mouth: o.mouth, blink: o.blink, brow: 'hair1',
      blush: 'pink', eyeY: EYE_Y, dx: EYE_DX,
    });
  },

  /**
   * THE SNAKE. Cute and MISCHIEVOUS, which are different jobs: cute is the big round
   * head and the belly plates, mischievous is the asymmetry -- one brow up, the grin
   * pulled to one side, the body coiled like it is about to be somewhere else.
   */
  snake(b, o) {
    const scale = orbShade(['cloth0', 'leaf0', 'leaf1', 'leaf2', 'leaf3']);
    // one broad coil on the ground, and a second riding on it
    blob(b, CX, FOOT_Y - 3, 16, 4, scale);
    blob(b, CX + 3, FOOT_Y - 8, 12, 4, scale);
    // belly plates along the front of both coils
    for (let i = 0; i < 11; i++) brect(b, CX - 13 + i * 3, FOOT_Y - 2, 2, 2, 'leaf4');
    for (let i = 0; i < 8; i++) brect(b, CX - 7 + i * 3, FOOT_Y - 7, 2, 1, 'leaf3');

    // the neck: an S rising out of the coil to the head
    for (let i = 0; i <= 22; i++) {
      const f = i / 22;
      const nx = CX + Math.sin(f * 3.1 + 0.4) * 6 - 2;
      const ny = FOOT_Y - 9 - f * 17;
      const r = 4.4 - f * 1.2;
      for (let y = -Math.ceil(r + 1); y <= Math.ceil(r + 1); y++) {
        for (let x = -Math.ceil(r + 1); x <= Math.ceil(r + 1); x++) {
          if (x * x + y * y > (r + 1) * (r + 1)) continue;
          bset(b, nx + x, ny + y, 'cloth0');
        }
      }
      for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
        for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
          if (x * x + y * y > r * r) continue;
          const t = x / r;
          bset(b, nx + x, ny + y, t < -0.4 ? 'leaf2' : t < 0.3 ? 'leaf1' : 'leaf0');
        }
      }
      if (i % 3 === 0) bset(b, nx - 1, ny, 'leaf3');
    }

    // the head: wide, low, with a snout that comes forward
    const hy = HEAD_CY + 1;
    blob(b, CX, hy, 11, 9, scale);
    blob(b, CX + 1, hy + 3, 8, 5, orbShade(['leaf1', 'leaf2', 'leaf3', 'leaf4']));
    // the hood: two flares that break the silhouette either side
    for (const s of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        brect(b, CX + s * (9 + i), hy - 2 + i, 2, 4 - Math.floor(i / 2), i < 3 ? 'leaf1' : 'leaf0');
      }
    }
    // chevrons down the back of the head
    for (let i = 0; i < 3; i++) {
      bline(b, CX - 5 + i * 5, hy - 7, CX - 3 + i * 5, hy - 4, 'cloth0');
    }

    // the eyes: gold almonds with a slit, half-lidded, and NOT level with each other
    for (const s of [-1, 1]) {
      const ex = CX + s * 4;
      const lift = s < 0 ? 0 : -1;                     // the asymmetry is the character
      blob(b, ex, hy - 1 + lift, 3, 2, 'gold');
      brect(b, ex - 1, hy - 2 + lift, 3, 1, 'brass2');
      brect(b, ex, hy - 1 + lift, 1, 2, 'ink');        // the slit pupil
      bset(b, ex - 1, hy - 2 + lift, 'white');
      // the lid, and the brow ridge over it
      brect(b, ex - 3, hy - 3 + lift, 6, 1, 'leaf1');
      brect(b, ex - 3, hy - 4 + lift + (s > 0 ? -1 : 0), 6, 1, 'leaf0');
    }
    // the grin, pulled to one side, with one fang showing
    if (o.mouth === 'open') {
      blob(b, CX + 1, hy + 5, 5, 2, 'red0');
      brect(b, CX - 1, hy + 5, 3, 1, 'red2');
      bset(b, CX + 4, hy + 4, 'white');
    } else {
      bline(b, CX - 5, hy + 4, CX + 2, hy + 5, 'ink');
      bline(b, CX + 2, hy + 5, CX + 6, hy + 3, 'ink');
      bset(b, CX + 5, hy + 4, 'white');
    }
    bset(b, CX - 6, hy + 2, 'leaf4');
    if (o.blink) for (const s of [-1, 1]) brect(b, CX + s * 4 - 1, hy - 1, 3, 1, 'leaf1');
  },

  /** NOAH. The hat and the beard do all the work; you know him from the silhouette. */
  noah(b, o) {
    legs(b, HIP_Y + 2, FOOT_Y, 5, ['wood0', 'wood1', 'wood2'], 'wood0');
    // a long tunic over a rope belt
    torso(b, TORSO_Y, HIP_Y + 6, 10, 12, LINEN);
    // folds: a flat cream slab from chin to knee is a bedsheet, not a garment
    for (let i = 0; i < 5; i++) {
      const fx = CX - 8 + i * 4;
      for (let y = TORSO_Y + 4; y < HIP_Y + 6; y++) {
        if ((y + i) % 7 < 4) bset(b, fx + Math.round(Math.sin(y * 0.3) * 1), y, 'parch0');
      }
    }
    brect(b, CX - 12, HIP_Y + 5, 25, 1, 'parch0');
    brect(b, CX - 11, HIP_Y - 1, 23, 2, 'wood2');
    brect(b, CX - 11, HIP_Y - 1, 23, 1, 'wood3');
    for (let i = 0; i < 6; i++) bset(b, CX - 9 + i * 4, HIP_Y, 'wood1');
    // a leather over-vest, so he is not one flat colour from chin to knee
    for (const s of [-1, 1]) {
      for (let y = TORSO_Y + 1; y < HIP_Y; y++) {
        brect(b, CX + s * 7 - (s < 0 ? 3 : 0), y, 3, 1, y % 4 === 0 ? 'wood1' : 'wood2');
      }
    }
    arms(b, o.pose, ['parch0', 'parch1', 'parch'], { shoulder: 10, thick: 2, len: 12 });

    orb(b, CX, HEAD_CY, HEAD_R, orbShade(SKIN.warm));
    // THE BEARD: it covers the jaw, which is why he reads as old at eight pixels
    for (let y = MOUTH_Y - 1; y < NECK_Y + 3; y++) {
      const f = (y - MOUTH_Y + 1) / (NECK_Y + 3 - MOUTH_Y + 1);
      const hw = Math.round(9 - f * 4 + Math.sin(f * 3) * 1.5);
      for (let x = -hw; x <= hw; x++) {
        const t = Math.abs(x) / hw;
        bset(b, CX + x, y, t > 0.75 ? 'grey0' : t > 0.35 ? 'grey1' : 'grey2');
      }
    }
    for (let i = 0; i < 7; i++) bset(b, CX - 6 + i * 2, MOUTH_Y + 3 + (i % 3), 'white');
    // THE HAT: a wide straw brim and a rounded crown. Three flat rows read as a
    // headband; a hat is a brim you can see the underside of and a dome above it.
    orb(b, CX, HEAD_CY - 9, 8, orbShade(['brass0', 'brass1', 'brass2', 'brass3']), { squashY: 0.7 });
    blob(b, CX, HEAD_CY - 5, 17, 3, orbShade(['brass0', 'brass1', 'brass2', 'brass3']));
    brect(b, CX - 16, HEAD_CY - 4, 33, 1, 'brass0');          // the shaded underside
    brect(b, CX - 9, HEAD_CY - 6, 19, 1, 'wood1');            // the band
    for (let i = 0; i < 8; i++) bset(b, CX - 12 + i * 3, HEAD_CY - 6, 'brass3');
    face(b, {
      pose: o.pose, mouth: o.mouth, blink: o.blink, brow: 'grey1', blush: 'red2',
      mouthY: MOUTH_Y, nose: true, noseKey: 'skin1',
    });
  },

  /** THE CHERUBIM. Wings, halo, flame. Serene and slightly alarming, on purpose. */
  cherub(b, o) {
    // WINGS, behind everything. A FAN of feathers from one root, each a little shorter
    // and a little steeper than the last, so the roots overlap into a mass and only the
    // tips separate. Three parallel ranks read as bread rolls stuck to his shoulders.
    for (const s of [-1, 1]) {
      const rx = CX + s * 7, ry = TORSO_Y + 5;
      for (let i = 0; i < 7; i++) {
        const a = -0.30 - i * 0.19;
        const len = 17 - i * 1.4;
        limb(b, rx, ry,
          rx + s * Math.cos(a) * len, ry + Math.sin(a) * len,
          2.6 - i * 0.18, 1.1,
          i % 2 ? ['parch1', 'cream', 'white'] : ['parch0', 'parch1', 'cream'],
          { edge: 'parch0' });
      }
      // the tips, notched, which is where a wing shows it is made of feathers
      for (let i = 0; i < 7; i++) {
        const a = -0.30 - i * 0.19;
        const len = 17 - i * 1.4;
        bset(b, rx + s * Math.cos(a) * len, ry + Math.sin(a) * len + 1, 'parch0');
      }
    }
    legs(b, HIP_Y, FOOT_Y, 4, ['skin1', 'skin2', 'skin3'], 'skin1', { gap: 2 });
    torso(b, TORSO_Y, HIP_Y + 3, 8, 9, LINEN);
    // folds in the linen rather than a diagonal stripe, which read as a zip
    for (let i = 0; i < 4; i++) {
      const fx = CX - 5 + i * 4;
      for (let y = TORSO_Y + 3; y < HIP_Y + 3; y++) if ((y + i) % 6 < 3) bset(b, fx, y, 'parch0');
    }
    arms(b, o.pose, ['skin1', 'skin2', 'skin3'], { shoulder: 8, thick: 2, len: 11 });

    // THE HALO, drawn BEHIND the head so the top arc rides over the curls and the sides
    // peek out past the ears. Floated above the skull it ran off the top of the canvas
    // and all that survived was two gold horns.
    for (let a = 0; a < Math.PI * 2; a += 0.06) {
      const hx = CX + Math.cos(a) * 13;
      const hy = HEAD_CY - 5 - Math.sin(a) * 8;
      const near = Math.sin(a) < 0;
      bset(b, hx, hy, near ? 'gold' : 'brass1');
      bset(b, hx, hy + 1, near ? 'brass2' : 'brass0');
    }
    orb(b, CX, HEAD_CY, HEAD_R, orbShade(SKIN.warm));
    // gold hair: a cap for the mass, then curls along the hairline for the bounce
    hairCap(b, HEAD_CY, HEAD_R, ['brass1', 'brass2', 'brass3'], { cut: -4, fringe: 3, lift: 2 });
    for (let i = 0; i < 5; i++) {
      orb(b, CX - 8 + i * 4, HEAD_CY - 8 + (i % 2), 2.4,
        orbShade(['brass1', 'brass2', 'brass3', 'cream']));
    }
    face(b, {
      pose: o.pose, mouth: o.mouth, blink: o.blink, brow: 'brass2', blush: 'pink',
      shine: 'white', mouthSmall: true,
    });

    // and the flame it keeps in one hand
    const fx2 = CX + 12, fy = TORSO_Y + 13;
    orb(b, fx2, fy, 3, orbShade(['red1', 'orange', 'gold', 'white']), { edge: 'red0' });
    bset(b, fx2, fy - 4, 'gold');
    bset(b, fx2, fy - 5, 'white');
    bset(b, fx2 - 1, fy - 3, 'orange');
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
  const buf = makeBuf(FOLK_W, FOLK_H);
  fn(buf, { pose, mouth, blink });
  outline(buf, 'ink');
  flush(buf, mk.g);
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
    rect(g, x + ox, py, sc, sc, 'clay3');
    rect(g, x + ox, py + sc, sc, sc, 'clay1');
    if (k > 0.9) {
      const fy = dy + dh - sc;
      rect(g, x + ox - 2 * sc, fy, sc, sc, 'clay2');
      rect(g, x + ox + 2 * sc, fy, sc, sc, 'clay2');
      rect(g, x + ox - sc, fy - sc, sc, sc, 'clay3');
    }
  }
  // a wet sheen across the shoulders
  for (let i = 0; i < 5; i++) {
    rect(g, x - Math.round(dw * 0.22) + i * sc * 2, dy + Math.round(dh * 0.36), sc, sc, 'clay4');
  }
}

/** Cozy magic motes, used by the cherubim and by the shepherd wand. */
export function drawSparkle(g, x, y, sc, t, amt) {
  const n = Math.round(3 + clamp(amt, 0, 1) * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t * 1.1;
    const r = (7 + Math.sin(t * 2 + i) * 4) * sc;
    const sx = x + Math.cos(a) * r, sy = y + Math.sin(a) * r * 0.6;
    rect(g, sx, sy, sc, sc, i % 3 === 0 ? 'magic2' : i % 3 === 1 ? 'magic1' : 'gold');
  }
}

function drawFolkWet(g, x, dy, dw, dh, sc, t) {
  for (let i = 0; i < 4; i++) {
    const k = (t * (1.1 + i * 0.3) + i * 2.1) % 1;
    const ox = Math.round(((i % 3) - 1) * 7) * sc;
    rect(g, x + ox, dy + dh * 0.5 + k * dh * 0.45, sc, sc, 'foam');
    rect(g, x + ox, dy + dh * 0.5 + k * dh * 0.45 + sc, sc, sc, 'water3');
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
  rect(g, tx, ty, len, sc, 'red2');
  rect(g, tx + len, ty - sc, sc, sc, 'red2');
  rect(g, tx + len, ty + sc, sc, sc, 'red2');
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

  for (let i = 0; i < len; i++) {
    const f = i / len;
    const px2 = x + ca * i, py2 = y + sa * i;
    for (let k = 0; k < sc; k++) {
      px(g, px2 - sa * k, py2 + ca * k, f < 0.28 ? 'wood1' : f < 0.7 ? 'wood2' : 'wood3');
    }
    if (f < 0.28 && i % 3 === 0) px(g, px2 - sa * sc, py2 + ca * sc, 'brass1');
  }
  for (let k = 0; k < 7 * sc; k++) {
    const a = angle - 0.5 + (k / sc) * 0.42;
    px(g, tipX + Math.cos(a) * 4 * sc, tipY + Math.sin(a) * 4 * sc, k < 2 * sc ? 'wood3' : 'wood4');
  }
  const gx = tipX + ca * 3 * sc, gy = tipY + sa * 3 * sc;
  if (0.4 + ch * 0.6 > 0.5) disc(g, gx, gy, 2 * sc, 'magic1');
  disc(g, gx, gy, sc, 'magic2');
  drawSparkle(g, gx, gy, sc, t, 0.3 + ch);
  if (ch > 0.02) {
    for (let i = 0; i < 3; i++) {
      const ph = (t * 2.2 + i / 3) % 1;
      px(g, x + ca * ph * len, y + sa * ph * len, i % 2 ? 'magic1' : 'gold');
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

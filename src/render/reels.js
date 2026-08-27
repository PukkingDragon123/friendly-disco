// THE REELS. Four more set-pieces, and the ones that carry the actual story.
//
// WRATH, FLOOD and FORGE (render/setpieces.js) are the three big weather events. These are
// the four that tell you WHY, WHO, and WHAT IT COST:
//
//   RIVERS   what people did to the water, and to the things that drank it
//   CHAOS    the night the animals turned, and one old man running for a cellar door
//   PASSING  the lantern going out, and what stood up out of the dark afterwards
//   SETSAIL  the water taking the last of the street, and a boat that floated anyway
//
// SAME RULES AS THE OTHERS. Every shot is a pure function of (u, t): u is 0..1 through
// this shot, t is wall time for idle motion, no state anywhere, so any instant can be
// screenshotted directly. No g.scale(): a push in pixel art is the SUBJECT growing, and
// the only transform allowed is an integer translate for a pan or a shake.
//
// AND NOBODY SPEAKS. There is no dialogue box in front of these -- the caption on the
// letterbox bar is the whole text, and the picture is expected to do the rest. That is
// the entire reason they exist.

import { P, mix } from '../core/palette.js';
import {
  rect, px, line, disc, ellipse, ellipseFrame, tri, wash, clamp, lerp, W, H,
} from '../core/pixel.js';
import { Ease } from '../core/juice.js';
import { FX } from './setpieces.js';

const { h, vBand, ridge, village, rays, rain, lens, lensRows, taper, drawArkSmall } = FX;

/**
 * A BOX WITH A BLACK LINE ROUND IT, which is the whole visual language of the game now.
 * Every prop in these reels goes through this: fill, a lit top, and ink on all four sides.
 */
function inked(g, x, y, w, hgt, fill, lit) {
  rect(g, x - 4, y - 4, w + 8, hgt + 8, 'ink');
  rect(g, x, y, w, hgt, fill);
  if (lit) rect(g, x, y, w, 4, lit);
}

/* ------------------------------------------------------------------- RIVERS */

/**
 * SHOT 1 -- high wide. A river coming down out of the hills through a town, and going
 * from snowmelt to sewer on the way.
 *
 * The whole shot is one gradient with a town on it: the water is CLEAN at the top of the
 * frame and brown at the bottom, and every pipe along the way is where it changed. That
 * reads in about a second and needs no caption to explain it.
 */
function riverTown(g, u, t) {
  vBand(g, 0, 150, ['sky', 'ice', 'cream', 'sand']);
  // the valley floor
  rect(g, 0, 150, W, H - 150, 'moss');
  ridge(g, 168, 34, 3.1, 'green0', 'moss');

  // THE RIVER: a wedge widening toward the camera, bent twice, drawn as rows so the
  // colour can rot on the way down.
  for (let y = 150; y < H; y++) {
    const f = (y - 150) / (H - 150);
    const cx = W * 0.5 + Math.sin(f * 2.4) * 120 - 30;
    const wid = 16 + f * f * 230;
    const clean = mix(P.ice, P.water2, f * 0.8);
    // brown, not green: a green river is indistinguishable from the grass it runs through,
    // and the whole shot is about the difference between the two.
    const foul = mix(P.brass0, P.wood0, 0.45);
    const c = mix(clean, foul, clamp((f - 0.14) * 1.9, 0, 1));
    // the bank as INK, so the river is a shape cut out of the valley rather than a stain
    rect(g, cx - wid - 8, y, wid * 2 + 16, 1, 'ink');
    rect(g, cx - wid, y, wid * 2, 1, c);
  }

  // the town: two rows of roofs down both banks, and it gets denser as it comes at you
  for (let i = 0; i < 26; i++) {
    const f = h(i * 7);
    const y = 170 + f * 300;
    const ff = (y - 150) / (H - 150);
    const cx = W * 0.5 + Math.sin(ff * 2.4) * 120 - 30;
    const wid = 16 + ff * ff * 230;
    const side = i % 2 ? 1 : -1;
    const bx = cx + side * (wid + 24 + h(i * 3) * 130);
    const bw = 26 + h(i * 5) * 46;
    const bh = 20 + h(i * 11) * 34;
    if (bx < -40 || bx > W + 40) continue;
    inked(g, bx - bw / 2, y - bh, bw, bh, 'wood1', 'wood2');
    tri(g, bx - bw / 2 - 10, y - bh, bx + bw / 2 + 10, y - bh, bx, y - bh - 26, 'ink');
    tri(g, bx - bw / 2 - 4, y - bh - 4, bx + bw / 2 + 4, y - bh - 4, bx, y - bh - 20, 'rust');
    // lit windows
    for (let k = 0; k < 2; k++) {
      if (h(i * 13 + k) < 0.4) continue;
      inked(g, bx - bw / 4 + k * (bw / 2) - 4, y - bh + 16, 12, 12, 'brass2', 'brass3');
    }
    // A PIPE INTO THE RIVER. This is the point of the shot, so it is short and it is
    // ON the bank: a pipe run all the way from the house crossed the whole frame and read
    // as telegraph wire.
    if (i % 3 === 0) {
      const tx = cx + side * (wid + 8);
      const mouth = 16 + ff * 28;
      inked(g, tx - (side < 0 ? mouth : 0), y - 20, mouth, 20, 'stone1', 'stone3');
      // and what comes out of it: a tongue of it, spreading downstream
      for (let s = 0; s < 5; s++) {
        const sw = mouth * (1 + s * 0.7);
        rect(g, tx - (side < 0 ? sw : 0) - side * 4, y + s * 8, sw, 8,
          s < 2 ? mix(P.moss, P.ink, 0.4) : mix(P.moss, P.brass0, 0.4));
      }
    }
    // chimney smoke
    if (i % 4 === 1) {
      for (let s = 0; s < 4; s++) {
        const sy = y - bh - 20 - s * 12 - (t * 8) % 12;
        disc(g, bx + Math.sin(t + s) * 6, sy, 6 + s * 2, mix(P.grey0, P.sand, 0.4));
      }
    }
  }

  // the foreground: the near bank, black, so the frame has a floor
  rect(g, 0, H - 40, W, 40, 'ink');
  void u;
}

/**
 * SHOT 2 -- extreme close-up on the surface. Everything they put in it, floating.
 *
 * A close-up of water is the hardest thing to draw in the whole game: it has no shape of
 * its own, so it has to be described entirely by WHAT IS ON IT. Oil bands, foam, a drum,
 * a wheel, and a fish that is the wrong way up.
 */
function riverSurface(g, u, t) {
  // brown water in bands, with the light coming from the top left
  const keys = ['clay2', 'wood1', 'wood0'];
  for (let y = 0; y < H; y++) {
    const f = y / H;
    const i = Math.min(keys.length - 2, Math.floor(f * (keys.length - 1)));
    rect(g, 0, y, W, 1, mix(P[keys[i]], P[keys[i + 1]], f * (keys.length - 1) - i));
  }
  // OIL. Long thin bands of the wrong colours, sliding.
  for (let i = 0; i < 14; i++) {
    const y = (h(i * 3) * H + t * 9) % H;
    const x = (h(i * 5) * W + t * 14) % (W + 300) - 150;
    const wid = 120 + h(i * 7) * 260;
    const c = i % 3 === 0 ? 'purple1' : i % 3 === 1 ? 'teal' : 'pink';
    wash(g, x, y, wid, 8, c, 0.16);
    rect(g, x, y, wid, 4, mix(P[c], P.wood1, 0.6));
  }
  // foam scum along the ripples
  for (let i = 0; i < 26; i++) {
    const y = (h(i * 11) * H + t * 12) % H;
    const x = (h(i * 13) * W - t * 20) % (W + 200) - 100;
    rect(g, x, y, 40 + h(i) * 90, 4, mix(P.cream, P.moss, 0.45));
  }
  // A DRUM, half sunk, leaking
  const dy = 250 + Math.sin(t * 0.8) * 6;
  rect(g, 300, dy, 150, 110, 'rust');
  rect(g, 300, dy, 150, 12, 'brass0');
  rect(g, 300, dy + 40, 150, 12, mix(P.rust, P.ink, 0.4));
  rect(g, 300, dy + 88, 150, 12, mix(P.rust, P.ink, 0.4));
  rect(g, 300, dy, 12, 110, mix(P.rust, P.white, 0.2));
  for (let s = 0; s < 6; s++) {
    rect(g, 452, dy + 30 + s * 2, 30 + s * 20, 6, mix(P.moss, P.ink, 0.25));
  }
  // A WHEEL, spokes up
  const wx = 690, wy = 190 + Math.sin(t * 0.7 + 2) * 5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + t * 0.1;
    line(g, wx, wy, wx + Math.cos(a) * 52, wy + Math.sin(a) * 22, 'ink');
  }
  ellipse(g, wx, wy, 56, 24, 'grey0');
  ellipse(g, wx, wy, 44, 16, mix(P.wood0, P.ink, 0.5));
  // THE FISH, belly up. The one thing in the shot that was alive.
  const fx = 170, fy = 420 + Math.sin(t * 0.9) * 4;
  ellipse(g, fx, fy, 70, 26, 'bone');
  ellipse(g, fx - 10, fy - 4, 50, 14, 'cream');
  tri(g, fx + 62, fy, fx + 96, fy - 22, fx + 96, fy + 22, 'bone');
  rect(g, fx - 52, fy - 8, 10, 10, 'ink');          // the eye, up at the sky
  px(g, fx - 50, fy - 6, 'white');
  for (let i = 0; i < 5; i++) rect(g, fx - 30 + i * 18, fy - 22, 12, 6, 'cream');
  // more of it, scattered: bottles, a boot, a tyre. A close-up of water needs CLUTTER.
  for (let i = 0; i < 9; i++) {
    const jx = 60 + h(i * 17) * (W - 120);
    const jy = 80 + h(i * 19) * (H - 160) + Math.sin(t * 0.9 + i) * 4;
    if (i % 3 === 0) {
      rect(g, jx, jy, 24, 60, mix(P.teal, P.wood0, 0.35));       // a bottle
      rect(g, jx + 6, jy - 20, 12, 22, mix(P.teal, P.wood0, 0.5));
      rect(g, jx, jy, 24, 6, 'ice');
    } else if (i % 3 === 1) {
      ellipse(g, jx, jy, 40, 18, 'ink');                          // a tyre
      ellipse(g, jx, jy, 24, 8, mix(P.wood0, P.clay2, 0.4));
    } else {
      rect(g, jx, jy, 50, 26, mix(P.wood0, P.ink, 0.3));          // a boot
      rect(g, jx + 34, jy - 22, 16, 26, mix(P.wood0, P.ink, 0.3));
    }
  }
  wash(g, 0, 0, W, H, 'wood0', 0.12 + u * 0.1);
}

/**
 * SHOT 3 -- silhouette, foreground-heavy. What they did to the things that drank it.
 *
 * NOBODY HAS A FACE IN THIS SHOT. Three black cut-outs across the bottom third, a bird
 * coming down out of a gold sky, and a scatter of feathers. A face would make it about a
 * person; a silhouette makes it about the act.
 */
function riverHunt(g, u, t) {
  vBand(g, 0, 300, ['rust', 'orange', 'gold', 'brass2']);
  // low sun
  disc(g, 240, 170, 40, 'cream');
  disc(g, 240, 170, 28, 'white');
  rays(g, 240, 170, 9, 200, 2.4, 'gold', 0.12, t * 0.4);
  // reeds and the far bank
  rect(g, 0, 300, W, H - 300, 'wood0');
  ridge(g, 316, 22, 7.3, 'ink', null);

  // THE BIRD, falling. It comes down across the sun as the shot runs.
  const bk = Ease.inQuad(clamp(u * 1.35, 0, 1));
  const bx = 560 + bk * 120;
  const by = 90 + bk * 230;
  const tilt = 0.5 + bk * 1.6;
  for (const s of [-1, 1]) {
    // wings, folding as it comes down
    const span = 96 * (1 - bk * 0.45);
    tri(g, bx, by, bx + s * span, by - 30 + bk * 60, bx + s * span * 0.5, by + 26, 'ink');
  }
  ellipse(g, bx, by, 34, 16, 'ink');
  rect(g, bx + 26, by - 6 + tilt * 6, 26, 6, 'ink');          // the long neck, going down
  for (let i = 0; i < 9; i++) {                              // feathers, coming off
    const fk = clamp(bk * 1.6 - i * 0.09, 0, 1);
    if (fk <= 0) continue;
    const fx = bx - 40 - fk * 130 + Math.sin(t * 2 + i) * 12;
    const fy = by - 30 + fk * fk * 220 + i * 6;
    rect(g, fx, fy, 14, 4, 'cream');
    rect(g, fx + 10, fy - 2, 6, 8, 'bone');
  }

  // THE THREE OF THEM, black, across the bottom. Two with bows, one with a net.
  const men = [[150, 1.0, 'bow'], [430, 0.86, 'net'], [770, 1.1, 'bow']];
  for (const [mx, sc, kind] of men) {
    const gy = H - 20;
    const hh = 210 * sc;
    rect(g, mx - 22 * sc, gy - hh, 44 * sc, hh, 'ink');        // body and legs as one mass
    disc(g, mx, gy - hh - 16 * sc, 22 * sc, 'ink');            // head
    if (kind === 'bow') {
      // the bow: an arc and a string, drawn as one thick curve
      for (let i = -30; i <= 30; i += 2) {
        const bxx = mx + 40 * sc + Math.cos(i * 0.05) * 6 * sc;
        rect(g, bxx, gy - hh - 10 * sc + i * 2 * sc, 6 * sc, 4 * sc, 'ink');
      }
      rect(g, mx + 20 * sc, gy - hh - 12 * sc, 60 * sc, 4 * sc, 'ink');   // the drawn arrow
    } else {
      // the net: a lattice on two poles
      rect(g, mx + 30 * sc, gy - hh - 40 * sc, 6 * sc, 90 * sc, 'ink');
      for (let i = 0; i < 5; i++) {
        rect(g, mx + 30 * sc, gy - hh - 40 * sc + i * 18 * sc, 90 * sc, 4 * sc, 'ink');
        rect(g, mx + 30 * sc + i * 18 * sc, gy - hh - 40 * sc, 4 * sc, 90 * sc, 'ink');
      }
    }
  }
  wash(g, 0, 0, W, H, 'rust', 0.08);
}

/**
 * SHOT 4 -- the eye in the water. The bridge into WRATH.
 *
 * The reflection is the whole trick: you never see the sky in this shot, only what the
 * river is showing you, and it is looking back.
 */
function riverSeen(g, u, t) {
  rect(g, 0, 0, W, H, 'night');
  for (let y = 0; y < H; y++) {
    rect(g, 0, y, W, 1, mix(P.night, P.deep, (y / H) * 0.8));
  }
  // ripple lines across the whole frame, so it reads as a surface
  for (let y = 40; y < H; y += 12) {
    const off = Math.sin(y * 0.2 + t * 1.1) * 20;
    rect(g, off, y, W, 4, mix(P.deep, P.water0, 0.5));
  }
  // THE REFLECTED EYE, opening as the shot runs
  const k = Ease.outCubic(clamp(u * 1.2, 0, 1));
  const cx = W / 2, cy = 270;
  const rx = 300 * k, ry = 96 * k;
  if (rx > 4) {
    lens(g, cx, cy, rx, ry, mix(P.cream, P.deep, 0.35));
    lens(g, cx, cy, rx * 0.94, ry * 0.9, mix(P.brass3, P.deep, 0.15));
    // the iris and the slit pupil
    lensRows(rx * 0.42, ry * 0.82, (dy, w) => {
      rect(g, cx - w, cy + dy, w * 2, 1, mix(P.gold, P.rust, 0.35 + Math.abs(dy) / (ry * 2)));
    });
    rect(g, cx - 10, cy - ry * 0.7, 20, ry * 1.4, 'ink');
    // and the water breaks it up, because it is only a reflection -- but not across the
    // middle of it: ripples over the iris turned the whole eye into a venetian blind.
    for (let y = -ry; y < ry; y += 12) {
      if (Math.abs(y) < ry * 0.45) continue;
      const off = Math.sin(y * 0.3 + t * 1.6) * 14;
      rect(g, cx - rx + off, cy + y, rx * 2, 4, mix(P.deep, P.night, 0.4));
    }
  }
  // one drop falling into it at the end of the shot
  if (u > 0.62) {
    const dk = (u - 0.62) / 0.38;
    const dy = -20 + dk * dk * 300;
    rect(g, cx + 180, dy, 8, 24, 'ice');
    if (dk > 0.85) {
      for (let i = 0; i < 3; i++) {
        ellipseFrame(g, cx + 184, 280, 40 + i * 40 + dk * 60, 12 + i * 12,
          mix(P.water3, P.deep, 0.4), 1);
      }
    }
  }
  wash(g, 0, 0, W, H, 'ink', 0.2 - u * 0.15);
}

export const RIVERS = {
  id: 'rivers',
  dur: 15,
  shots: [
    { at: 0.00, id: 'town', label: 'THE RIVER CAME DOWN THROUGH THE TOWN', draw: riverTown, drift: [0, 6] },
    { at: 0.27, id: 'surface', label: 'AND THEY PUT EVERYTHING IN IT', draw: riverSurface },
    { at: 0.54, id: 'hunt', label: 'WHAT DRANK FROM IT, THEY SHOT', draw: riverHunt, shake: 2 },
    { at: 0.80, id: 'seen', label: 'ALL OF IT WAS SEEN', draw: riverSeen, drift: [0, -4] },
  ],
};

/* -------------------------------------------------------------------- CHAOS */

/** A corrupted animal's eye-glow: two red dots and a dark aura. Used all over this reel. */
function badEyes(g, x, y, s, t) {
  const pulse = 0.6 + 0.4 * Math.sin(t * 6 + x);
  for (const dx of [-s, s]) {
    disc(g, x + dx, y, 4 + s * 0.2, mix(P.red1, P.ink, 0.4));
    disc(g, x + dx, y, 2 + s * 0.12, pulse > 0.7 ? 'red2' : 'red1');
  }
}

/**
 * SHOT 1 -- the street, at night, in the rain. Three of them coming down it.
 *
 * Silhouettes with red in them and nothing else. The reason the shot works is the
 * PERSPECTIVE: the street narrows to a vanishing point, so the shapes coming down it are
 * getting bigger, and the audience does the arithmetic without being told.
 */
function chaosStreet(g, u, t) {
  rect(g, 0, 0, W, H, 'night');
  // the street: a wedge to a vanishing point, wet cobbles
  const vx = W * 0.52, vy = 200;
  for (let y = vy; y < H; y++) {
    const f = (y - vy) / (H - vy);
    const wid = 20 + f * f * 620;
    rect(g, vx - wid, y, wid * 2, 1, mix(P.stone1, P.night, 0.55 - f * 0.25));
    if (y % 16 === 0) rect(g, vx - wid, y, wid * 2, 4, mix(P.stone2, P.night, 0.6));
  }
  // houses either side, leaning in
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const f = i / 5;
      const bx = vx + side * (30 + f * f * 520);
      const bw = 60 + f * 200;
      const bh = 150 + f * 260;
      rect(g, bx - (side < 0 ? bw : 0), vy - 40 - bh * 0.1, bw, bh, mix(P.wood0, P.night, 0.45));
      rect(g, bx - (side < 0 ? bw : 0), vy - 40 - bh * 0.1, bw, 6, mix(P.wood1, P.night, 0.4));
      // a lit window or two, and one of them has somebody at it
      for (let k = 0; k < 3; k++) {
        if (h(i * 7 + k + (side + 1) * 13) < 0.45) continue;
        const wx = bx - (side < 0 ? bw : 0) + 14 + k * (bw / 3);
        const wy = vy + 10 + k * 40;
        rect(g, wx, wy, 24 + f * 20, 30 + f * 20, 'brass1');
        rect(g, wx, wy, 24 + f * 20, 6, 'brass3');
      }
    }
  }
  // THEM. Three shapes coming up the street, the nearest nearly on top of us.
  const beasts = [[0.18, 0.5], [0.44, 0.8], [0.86, 1.5]];
  for (let i = 0; i < beasts.length; i++) {
    const [f0, sc0] = beasts[i];
    const f = clamp(f0 + u * 0.22, 0, 1.1);
    const sc = sc0 * (0.5 + f);
    const bx = vx + Math.sin(i * 2.1) * 180 * f;
    const by = vy + f * f * (H - vy) + 20;
    const bw = 70 * sc, bh = 44 * sc;
    // body, legs, head: one dark mass, because that is all you see of it
    rect(g, bx - bw / 2, by - bh, bw, bh, 'ink');
    for (let l = 0; l < 4; l++) rect(g, bx - bw / 2 + 6 + l * (bw / 4), by, 8 * sc, 22 * sc, 'ink');
    const hx = bx + bw / 2 + 10 * sc;
    disc(g, hx, by - bh - 6 * sc, 20 * sc, 'ink');
    tri(g, hx - 6 * sc, by - bh - 20 * sc, hx + 10 * sc, by - bh - 20 * sc, hx + 2 * sc, by - bh - 40 * sc, 'ink');
    badEyes(g, hx + 4 * sc, by - bh - 8 * sc, 6 * sc, t + i);
  }
  rain(g, 200, t, 'water3', 2);
  wash(g, 0, 0, W, H, 'purple0', 0.14);
}

/**
 * SHOT 2 -- the wall comes in. An elephant's head through a house, and a man running.
 *
 * The scale is the shot: the animal fills two thirds of the frame and Noah is nine pixels
 * tall in the corner of it. Nothing else needs to happen.
 */
function chaosElephant(g, u, t) {
  rect(g, 0, 0, W, H, 'ink');
  // the room we are standing in: floorboards, and a lamp swinging on the left
  rect(g, 0, 380, W, H - 380, 'wood1');
  for (let x = 0; x < W; x += 64) rect(g, x, 380, 4, H - 380, 'wood0');
  rect(g, 0, 372, W, 8, 'wood2');
  rect(g, 0, 380, W, 4, 'ink');

  const k = Ease.outCubic(clamp(u * 1.25, 0, 1));

  // THE WALL, breaking. Brick courses with ink mortar, and a hole with an ink lip.
  const wallX = 470 - k * 90;
  rect(g, wallX, 40, W - wallX, 340, 'clay0');
  for (let y = 40; y < 380; y += 24) {
    for (let x = wallX; x < W; x += 48) {
      const bx = x + ((y / 24) % 2) * 24;
      rect(g, bx, y, 44, 20, mix(P.clay2, P.clay1, h(bx * y) * 0.6));
      rect(g, bx, y, 44, 4, mix(P.clay3, P.clay2, 0.4));
    }
  }
  rect(g, wallX, 40, 8, 340, 'ink');

  // THE HEAD. Ears behind, then the skull, then the trunk down the middle of the frame.
  // EVERY PIECE IS INKED FIRST: without a contour a grey elephant on a grey wall is one
  // grey shape with two red dots in it, which is what this shot was.
  const es = 0.6 + k * 0.85;
  const ex = wallX + 210 + k * 40, ey = 220;
  const inkEll = (cx, cy, rx, ry, fill, lit) => {
    ellipse(g, cx, cy, rx + 8, ry + 8, 'ink');
    ellipse(g, cx, cy, rx, ry, fill);
    if (lit) ellipse(g, cx - rx * 0.25, cy - ry * 0.3, rx * 0.55, ry * 0.45, lit);
  };
  for (const side of [-1, 1]) {
    inkEll(ex + side * 150 * es, ey - 10 * es, 108 * es, 128 * es, 'grey0', null);
  }
  inkEll(ex, ey, 128 * es, 146 * es, 'grey1', 'grey2');
  // the brow, so the skull has a front and a top
  rect(g, ex - 70 * es, ey - 130 * es, 140 * es, 24 * es, 'grey2');
  rect(g, ex - 70 * es, ey - 130 * es, 140 * es, 8, 'ink');
  // the trunk, swinging, inked down both sides
  const sway = Math.sin(t * 2.2) * 34 * es;
  taper(g, ex, ey + 70 * es, ex + sway, ey + 310 * es, 84 * es, 40 * es, 'ink', 'ink', 'ink');
  taper(g, ex, ey + 70 * es, ex + sway, ey + 300 * es, 68 * es, 28 * es, 'grey1', 'grey2', 'grey0');
  for (let i = 0; i < 7; i++) {                 // the rings on it
    const f = i / 7;
    const tx = lerp(ex, ex + sway, f);
    const ty = lerp(ey + 90 * es, ey + 290 * es, f);
    rect(g, tx - (62 - f * 34) * es, ty, (124 - f * 68) * es, 6, mix(P.grey0, P.ink, 0.4));
  }
  // tusks: cream, inked, and they are the brightest thing in the frame
  for (const side of [-1, 1]) {
    taper(g, ex + side * 74 * es, ey + 76 * es, ex + side * 168 * es, ey + 220 * es,
      36 * es, 16 * es, 'ink', 'ink', 'ink');
    taper(g, ex + side * 74 * es, ey + 70 * es, ex + side * 160 * es, ey + 210 * es,
      24 * es, 8 * es, 'cream', 'white', 'bone');
  }
  // the eyes, with ink rings so they read as sockets rather than stickers
  for (const side of [-1, 1]) {
    disc(g, ex + side * 66 * es, ey - 44 * es, 22 * es, 'ink');
    disc(g, ex + side * 66 * es, ey - 44 * es, 14 * es, 'red1');
    disc(g, ex + side * 66 * es, ey - 44 * es, 7 * es, (0.6 + 0.4 * Math.sin(t * 6)) > 0.8 ? 'red2' : 'red0');
  }

  // brick and dust, thrown out of the hole
  for (let i = 0; i < 22; i++) {
    const dk = clamp(k * 1.4 - h(i) * 0.5, 0, 1);
    if (dk <= 0) continue;
    const dx = wallX - dk * (100 + h(i * 3) * 420);
    const dy = 120 + h(i * 5) * 200 + dk * dk * 240;
    const sz = 12 + h(i * 7) * 20;
    rect(g, dx - 4, dy - 4, sz + 8, sz * 0.6 + 8, 'ink');
    rect(g, dx, dy, sz, sz * 0.6, i % 3 ? 'clay2' : 'clay0');
  }

  // AND NOAH, running out of frame left. Nine pixels of him, and he is the scale.
  const nx = 250 - k * 200;
  const bob = Math.abs(Math.sin(t * 9)) * 8;
  rect(g, nx - 4, 300 - bob - 4, 34, 84, 'ink');
  rect(g, nx, 300 - bob, 26, 76, 'parch0');
  rect(g, nx, 296 - bob, 26, 10, 'wood2');
  disc(g, nx + 13, 288 - bob, 17, 'ink');
  disc(g, nx + 13, 288 - bob, 13, 'sand');
  rect(g, nx - 6, 278 - bob, 38, 10, 'ink');
  rect(g, nx - 4, 278 - bob, 34, 6, 'wood1');
  rect(g, nx + 26, 320 - bob, 48, 8, 'wood2');
  wash(g, 0, 0, W, H, 'red0', 0.08 + k * 0.06);
}

/**
 * SHOT 3 -- worm's eye. The sky has teeth in it.
 *
 * Looking straight up past a running man at a thing coming down. The wings are drawn as
 * two big blocks of black with feather steps cut into the trailing edge, because at this
 * size an eagle is a SHAPE and the shape is what frightens.
 */
function chaosEagle(g, u, t) {
  vBand(g, 0, H, ['purple0', 'night', 'deep', 'night']);
  // the street, seen almost edge-on at the bottom
  rect(g, 0, H - 90, W, 90, 'stone1');
  rect(g, 0, H - 94, W, 8, 'ink');
  rect(g, 0, H - 86, W, 4, 'stone2');
  village(g, H - 94, 0, W, 4.4, 'ink', 'brass2');

  const k = Ease.inQuad(clamp(u * 1.2, 0, 1));
  const ex = W * 0.46 + Math.sin(t * 0.8) * 20;
  const ey = 60 + k * 260;
  const es = 0.55 + k * 1.0;

  // THE WINGS. Alternating light and dark feather courses with an INK LEADING EDGE, and
  // splayed primaries at the tips. Drawn dark-on-dark they were invisible; the wing has to
  // be the brightest thing in the top half of the frame or the shot has no subject.
  for (const side of [-1, 1]) {
    const span = 400 * es;
    const rows = 7;
    for (let i = rows - 1; i >= 0; i--) {
      const f = i / (rows - 1);
      const wy = ey - 50 * es + f * 100 * es;
      const wl = span * (1 - f * 0.22);
      const x0 = side < 0 ? ex - wl : ex;
      rect(g, x0, wy - 4, wl, 24 * es, 'ink');
      rect(g, x0, wy, wl, 16 * es, i % 2 ? 'wood1' : 'wood2');
      rect(g, x0, wy, wl, 4, mix(P.sand, P.wood2, 0.5));
      // primaries: four long fingers off the tip
      if (i > 3) {
        for (let p = 0; p < 4; p++) {
          const tipx = side < 0 ? x0 - 70 * es : x0 + wl;
          const py = wy + p * 12 * es;
          rect(g, tipx - (side < 0 ? 0 : 0), py - 4, 74 * es, 16 * es, 'ink');
          rect(g, tipx + (side < 0 ? 4 : 0), py, 66 * es, 8 * es, 'wood0');
        }
      }
    }
  }
  // the body: dark, inked, with a PALE head so the face reads against the night
  ellipse(g, ex, ey + 40 * es, 70 * es, 100 * es, 'ink');
  ellipse(g, ex, ey + 40 * es, 58 * es, 88 * es, 'wood0');
  for (let i = 0; i < 5; i++) {
    rect(g, ex - 40 * es, ey + 10 * es + i * 22 * es, 80 * es, 10 * es, mix(P.wood1, P.ink, 0.3));
  }
  ellipse(g, ex, ey - 20 * es, 56 * es, 50 * es, 'ink');
  ellipse(g, ex, ey - 20 * es, 46 * es, 40 * es, 'bone');
  ellipse(g, ex, ey - 30 * es, 34 * es, 24 * es, 'cream');
  // the beak, open, and a tongue in it
  tri(g, ex - 22 * es, ey + 4 * es, ex + 22 * es, ey + 4 * es, ex, ey + 60 * es, 'ink');
  tri(g, ex - 16 * es, ey + 6 * es, ex + 16 * es, ey + 6 * es, ex, ey + 50 * es, 'gold');
  rect(g, ex - 6 * es, ey + 16 * es, 12 * es, 22 * es, 'red1');
  badEyes(g, ex, ey - 26 * es, 22 * es, t);
  // TALONS, out, and nearest the camera
  for (let i = 0; i < 4; i++) {
    const tx = ex - 70 * es + i * 46 * es;
    const ty = ey + 120 * es + Math.sin(t * 3 + i) * 5;
    rect(g, tx - 4, ty - 4, 26 * es, 72 * es, 'ink');
    rect(g, tx, ty, 18 * es, 64 * es, 'brass1');
    rect(g, tx, ty + 52 * es, 40 * es, 18 * es, 'brass0');
    rect(g, tx + 30 * es, ty + 44 * es, 14 * es, 30 * es, 'ink');
  }

  // and him, small, at the bottom, not looking up
  const nx = 690 - k * 70;
  const bob = Math.abs(Math.sin(t * 10)) * 6;
  rect(g, nx - 4, H - 154 - bob, 34, 70, 'ink');
  rect(g, nx, H - 150 - bob, 26, 62, 'parch0');
  disc(g, nx + 13, H - 158 - bob, 16, 'ink');
  disc(g, nx + 13, H - 158 - bob, 12, 'sand');
  rect(g, nx - 8, H - 168 - bob, 42, 10, 'ink');
  rect(g, nx - 6, H - 168 - bob, 38, 6, 'wood1');
  rain(g, 160, t, 'water3', 3);
}

/**
 * SHOT 4 -- the hatch. A wedge of light narrowing to nothing.
 *
 * The camera is IN the cellar looking up, which is the only place in the whole reel where
 * anything is safe, and the shot is built entirely out of the light going away.
 */
function chaosCellar(g, u, t) {
  rect(g, 0, 0, W, H, 'ink');
  const k = Ease.inCubic(clamp(u * 1.15, 0, 1));
  const open = 1 - k;
  const cx = W * 0.5;

  // the cellar walls, just visible: stone courses and a floor
  for (let y = 120; y < H; y += 40) {
    for (let x = 0; x < W; x += 80) {
      rect(g, x + ((y / 40) % 2) * 40, y, 74, 34, mix(P.stone0, P.ink, 0.72));
    }
  }
  rect(g, 0, H - 60, W, 60, mix(P.stone1, P.ink, 0.68));
  rect(g, 0, H - 64, W, 8, 'ink');

  // THE LIGHT COMING IN, and this is the whole shot: a wedge on the floor, narrowing.
  // It was a bright yellow trapezoid that took the frame; it is a dim wedge now, because
  // the subject is the dark and the light is what is leaving.
  const topW = 260 * open + 24;
  const botW = 460 * open + 40;
  for (let i = 0; i <= 32; i++) {
    const f = i / 32;
    const wid = lerp(topW, botW, f);
    const y = 140 + f * 300;
    wash(g, cx - wid / 2, y, wid, 12, 'brass2', 0.16 * open * (1 - f * 0.4));
  }
  if (open > 0.1) {
    for (let i = 0; i < 40; i++) {
      const x = cx + (h(i) - 0.5) * botW * 0.9;
      const y = (h(i * 3) * 380 + t * 640) % 380 + 130;
      rect(g, x, y, 4, 20, 'water3');
    }
  }

  // THE HATCH, swinging shut, with his hands on the underside of it.
  const hy = 70 + k * 50;
  const hw = 620 - k * 260;
  rect(g, cx - hw / 2 - 4, hy - 52, hw + 8, 60, 'ink');
  rect(g, cx - hw / 2, hy - 48, hw, 48, 'wood1');
  for (let i = 0; i < 5; i++) rect(g, cx - hw / 2 + 8 + i * (hw / 5), hy - 48, 8, 48, 'wood0');
  rect(g, cx - hw / 2, hy - 48, hw, 6, 'wood2');
  for (const side of [-1, 1]) {
    const hxx = cx + side * (hw * 0.28);
    rect(g, hxx - 28, hy + 2, 56, 30, 'ink');
    rect(g, hxx - 24, hy + 6, 48, 22, 'sand');
    rect(g, hxx - 24, hy + 20, 48, 8, 'wood2');
  }

  // the ladder, and the lantern he is about to need
  rect(g, 140, 140, 24, H - 200, 'ink');
  rect(g, 144, 140, 16, H - 200, 'wood1');
  rect(g, 250, 140, 24, H - 200, 'ink');
  rect(g, 254, 140, 16, H - 200, 'wood1');
  for (let y = 180; y < H - 60; y += 56) {
    rect(g, 140, y - 4, 134, 20, 'ink');
    rect(g, 144, y, 126, 12, 'wood2');
  }
  const flick = 0.7 + 0.3 * Math.sin(t * 9);
  rect(g, 300, 300, 52, 66, 'ink');
  rect(g, 306, 306, 40, 54, 'brass0');
  rect(g, 312, 316, 28, 38, flick > 0.8 ? 'gold' : 'brass2');
  disc(g, 326, 336, 10 + flick * 5, 'gold');
  wash(g, 236, 240, 200, 200, 'gold', 0.12 * flick);

  // water starting to come under the door at the end
  if (u > 0.6) {
    const wk = (u - 0.6) / 0.4;
    rect(g, 0, H - 24 - wk * 36, W, 24 + wk * 36, mix(P.water0, P.ink, 0.5));
    rect(g, 0, H - 24 - wk * 36, W, 8, 'water2');
  }
  wash(g, 0, 0, W, H, 'ink', 0.2 + k * 0.3);
}

export const CHAOS = {
  id: 'chaos',
  dur: 16,
  shots: [
    { at: 0.00, id: 'street', label: 'THE ANIMALS TURNED FIRST', draw: chaosStreet, drift: [0, 4], shake: 1 },
    { at: 0.26, id: 'wall', label: 'AND THEN THE WALLS CAME IN', draw: chaosElephant, shake: 7 },
    { at: 0.56, id: 'sky', label: 'THE SKY HAD TEETH IN IT', draw: chaosEagle, shake: 4 },
    { at: 0.80, id: 'cellar', label: 'HE WENT DOWN INTO THE DARK', draw: chaosCellar, drift: [0, -6] },
  ],
};

/* ------------------------------------------------------------------ PASSING */

/** SHOT 1 -- the floor. A hand, a staff, and a lantern that is doing its best. */
function passHand(g, u, t) {
  rect(g, 0, 0, W, H, 'ink');
  // flagstones, lit from the right by the lantern
  for (let y = 200; y < H; y += 60) {
    for (let x = -30; x < W; x += 90) {
      const f = 1 - Math.abs(x - 700) / W;
      rect(g, x + ((y / 60) % 2) * 45, y, 84, 54, mix(P.stone0, P.ink, 0.55 - f * 0.3));
      rect(g, x + ((y / 60) % 2) * 45, y, 84, 6, mix(P.stone1, P.ink, 0.5 - f * 0.3));
    }
  }
  const flick = 0.7 + 0.3 * Math.sin(t * 7);
  wash(g, 420, 160, 540, 380, 'brass1', 0.12 * flick);

  // the staff, dropped
  taper(g, 200, 470, 780, 330, 16, 12, 'wood1', 'wood2', 'wood0');
  // THE HAND, open, palm up. Fingers as four blocks with a knuckle line.
  const hx = 380, hy = 380 + Math.sin(t * 1.1) * 2;
  rect(g, hx, hy, 150, 60, 'sand');
  rect(g, hx, hy, 150, 8, mix(P.sand, P.white, 0.3));
  for (let i = 0; i < 4; i++) {
    rect(g, hx - 60 + i * 4, hy + 8 + i * 14, 66, 12, 'sand');
    rect(g, hx - 60 + i * 4, hy + 8 + i * 14, 66, 4, mix(P.sand, P.white, 0.25));
  }
  rect(g, hx + 120, hy - 30, 40, 40, 'sand');                  // the thumb
  wash(g, hx - 70, hy - 40, 250, 130, 'red0', 0.12);
  // a sleeve, and the dark he is lying in
  rect(g, hx + 150, hy - 20, W - hx - 150, 90, 'parch0');
  rect(g, hx + 150, hy - 20, W - hx - 150, 10, 'cream');
  wash(g, 0, 0, W, H, 'ink', 0.3 - u * 0.1);
}

/** SHOT 2 -- the flame, going. Everything in the frame is one small light. */
function passLantern(g, u, t) {
  rect(g, 0, 0, W, H, 'ink');
  const k = Ease.inCubic(clamp(u * 1.1, 0, 1));
  const cx = W / 2, cy = 280;
  const flick = 0.65 + 0.35 * Math.sin(t * 11);
  const size = (1 - k) * (0.8 + 0.2 * flick);

  // the lantern's cage, big and close
  rect(g, cx - 120, cy - 200, 240, 30, 'brass0');
  rect(g, cx - 100, cy - 170, 200, 300, mix(P.wood0, P.ink, 0.4));
  for (const side of [-1, 1]) rect(g, cx + side * 100 - 10, cy - 170, 20, 300, 'brass0');
  rect(g, cx - 100, cy + 130, 200, 30, 'brass0');
  rect(g, cx - 10, cy - 240, 20, 46, 'brass0');                 // the ring it hangs from

  // the glass, and the light inside it
  if (size > 0.02) {
    wash(g, cx - 90, cy - 160, 180, 280, 'gold', 0.2 * size);
    for (let i = 4; i > 0; i--) {
      disc(g, cx, cy, (30 + i * 22) * size, mix(P.gold, P.ink, 0.55 + i * 0.09));
    }
    // the flame: a teardrop, two tones
    const fh = 90 * size;
    for (let i = 0; i < fh; i++) {
      const f = i / Math.max(1, fh);
      const wd = Math.max(2, (1 - f) * 30 * size + Math.sin(t * 14 + i * 0.4) * 3);
      rect(g, cx - wd, cy + 40 * size - i, wd * 2, 2, f < 0.4 ? 'white' : f < 0.7 ? 'gold' : 'orange');
    }
    rays(g, cx, cy, 8, 300 * size, 3.0, 'gold', 0.14 * size, t);
  } else {
    // and after: one red thread of wick, and nothing else
    rect(g, cx - 4, cy + 30, 8, 16, 'red0');
  }
  wash(g, 0, 0, W, H, 'ink', 0.15 + k * 0.55);
}

/** SHOT 3 -- what stood up. A soul is a shape with a light in it and no weight. */
function passSoul(g, u, t) {
  rect(g, 0, 0, W, H, 'ink');
  const k = Ease.outCubic(clamp(u * 1.1, 0, 1));
  // the cellar, barely there
  rect(g, 0, 430, W, H - 430, mix(P.stone0, P.ink, 0.7));
  rect(g, 0, 426, W, 6, mix(P.stone1, P.ink, 0.6));
  // him, on the floor, still
  rect(g, 180, 400, 260, 30, mix(P.parch0, P.ink, 0.55));
  disc(g, 170, 400, 22, mix(P.sand, P.ink, 0.5));

  // THE SOUL, rising out of it. Same silhouette as the man, drawn in light.
  const sy = 380 - k * 200;
  const a = 0.35 + 0.45 * k + 0.1 * Math.sin(t * 3);
  const sx = 300;
  g.globalAlpha = a;
  rect(g, sx - 34, sy, 68, 130, 'ice');
  rect(g, sx - 34, sy, 68, 10, 'white');
  disc(g, sx, sy - 26, 30, 'ice');
  disc(g, sx - 8, sy - 32, 12, 'white');
  rect(g, sx - 54, sy + 20, 30, 70, 'ice');                     // an arm, hanging
  rect(g, sx + 24, sy + 20, 30, 70, 'ice');
  // the hat he keeps, because he would
  rect(g, sx - 46, sy - 44, 92, 12, 'ice');
  rect(g, sx - 26, sy - 62, 52, 20, 'ice');
  g.globalAlpha = 1;
  rays(g, sx, sy + 40, 10, 200, 2.6, 'ice', 0.1 * k, t * 0.6);
  // motes coming off it and going up
  for (let i = 0; i < 22; i++) {
    const mk = (t * 0.4 + h(i)) % 1;
    const mx = sx + (h(i * 3) - 0.5) * 160;
    const my = sy + 120 - mk * 320;
    rect(g, mx, my, 8, 8, mk > 0.6 ? 'white' : 'ice');
  }
  wash(g, 0, 0, W, H, 'ink', 0.4 - k * 0.25);
}

export const PASSING = {
  id: 'passing',
  dur: 11,
  shots: [
    { at: 0.00, id: 'hand', label: 'HE HAD ALREADY SPENT WHAT HE HAD', draw: passHand },
    { at: 0.38, id: 'lantern', label: 'AND THEN THE LANTERN WENT OUT', draw: passLantern, drift: [0, 4] },
    { at: 0.70, id: 'soul', label: 'WHAT WAS LEFT OF HIM STOOD UP ANYWAY', draw: passSoul, drift: [0, -8] },
  ],
};

/* ------------------------------------------------------------------ SETSAIL */

/** SHOT 1 -- the water takes the last of the street, and the hull is still on blocks. */
function sailStreet(g, u, t) {
  vBand(g, 0, 300, ['night', 'purple0', 'rust', 'brass1']);
  rect(g, 0, 300, W, H - 300, 'stone0');
  village(g, 300, 0, 380, 9.2, 'ink', 'brass2');

  // THE ARK, three quarters of the frame, on blocks, with a ramp down to the street. It
  // was drawn small and off to the right, and the shot was then about a puddle.
  const bx = 560, by = 330;
  rect(g, bx - 300, by - 40, 600, 40, 'ink');
  for (let i = 0; i < 22; i++) {
    const inset = Math.round(Math.pow(i / 22, 1.7) * 150);
    rect(g, bx - 296 + inset, by + i * 8, 592 - inset * 2, 8,
      i < 2 ? 'wood3' : i < 6 ? 'wood2' : i < 14 ? 'wood1' : 'wood0');
    rect(g, bx - 300 + inset, by + i * 8, 8, 8, 'ink');
    rect(g, bx + 292 - inset, by + i * 8, 8, 8, 'ink');
  }
  rect(g, bx - 300, by - 48, 600, 12, 'wood3');
  rect(g, bx - 300, by - 52, 600, 8, 'ink');
  // the house on the deck, and the mast going up out of frame
  rect(g, bx - 150, by - 170, 300, 130, 'ink');
  rect(g, bx - 142, by - 162, 284, 122, 'wood1');
  rect(g, bx - 142, by - 162, 284, 10, 'wood2');
  for (let i = 0; i < 4; i++) {
    rect(g, bx - 120 + i * 70, by - 130, 40, 50, 'ink');
    rect(g, bx - 116 + i * 70, by - 126, 32, 42, 'brass1');
  }
  rect(g, bx - 20, by - 340, 40, 180, 'ink');
  rect(g, bx - 12, by - 336, 24, 176, 'wood2');
  // blocks under the keel, and the ramp
  for (const kx of [bx - 200, bx, bx + 200]) {
    rect(g, kx - 40, by + 176, 80, 40, 'ink');
    rect(g, kx - 32, by + 180, 64, 32, 'wood0');
  }
  rect(g, bx - 420, by + 120, 200, 20, 'ink');
  rect(g, bx - 416, by + 124, 192, 12, 'wood1');

  // and the water, coming up the street as the shot runs
  const wk = Ease.outCubic(clamp(u * 1.1, 0, 1));
  const wy = H - 40 - wk * 200;
  for (let y = wy; y < H; y++) {
    const f = (y - wy) / Math.max(1, H - wy);
    rect(g, 0, y, W, 1, mix(P.water0, P.deep, 0.3 + f * 0.4));
  }
  for (let i = 0; i < 22; i++) {
    const x = (h(i) * W + t * 30) % W;
    rect(g, x, wy + 8 + (i % 4) * 12, 60 + h(i * 3) * 90, 4, i % 3 ? 'water3' : 'foam');
  }
  rect(g, 0, wy, W, 8, 'foam');
  rect(g, 0, wy - 4, W, 4, 'ink');
  rain(g, 120, t, 'water3', 2);
  wash(g, 0, 0, W, H, 'night', 0.14);
}

/**
 * SHOT 2 -- she floats. Low and close on the waterline: the keel comes off the blocks.
 *
 * The first version was a wall of dark planks with a teal band under it and nothing to
 * tell you which was which. What makes a hull read is the INK between the planks, the
 * WATERLINE with foam breaking on it, and something with a known size beside it -- so
 * there is a man's ladder against the hull and a block tumbling away under it.
 */
function sailFloat(g, u, t) {
  vBand(g, 0, 210, ['purple0', 'rust', 'orange', 'gold']);
  const k = Ease.outCubic(clamp(u * 1.15, 0, 1));
  const wy = 300;

  // the hull: a great curve of planking, lifting a few pixels off the blocks
  const by = 250 - k * 20 + Math.sin(t * 1.4) * 3;
  for (let i = 0; i < 30; i++) {
    const inset = Math.round(Math.pow(i / 30, 1.5) * 90);
    const y = by + i * 10;
    rect(g, 40 + inset, y, W - 80 - inset * 2, 10, i % 4 === 3 ? 'ink' : 'wood1');
    rect(g, 40 + inset, y, W - 80 - inset * 2, 4,
      i < 3 ? 'wood3' : mix(P.wood2, P.wood1, 0.4));
    rect(g, 36 + inset, y, 8, 10, 'ink');
    rect(g, W - 44 - inset, y, 8, 10, 'ink');
  }
  rect(g, 40, by - 20, W - 80, 20, 'wood2');
  rect(g, 40, by - 24, W - 80, 8, 'ink');
  // pitch, in a band along the waterline
  rect(g, 40, wy - 40, W - 80, 40, mix(P.ink, P.wood0, 0.35));

  // A LADDER against it, which is the whole sense of scale in the shot
  rect(g, 150, by + 40, 20, 220, 'ink');
  rect(g, 230, by + 40, 20, 220, 'ink');
  for (let y = by + 60; y < by + 250; y += 40) rect(g, 150, y, 100, 12, 'wood2');

  // ropes going slack as she comes off the blocks
  for (const rx of [120, 800]) {
    for (let i = 0; i < 12; i++) {
      const f = i / 11;
      rect(g, rx + f * 70, by - 24 - 140 * (1 - f) + Math.sin(f * Math.PI) * k * 50, 10, 10, 'bone');
    }
  }

  // the water, and the bow wave pushing out from under her
  for (let y = wy; y < H; y++) {
    rect(g, 0, y, W, 1, mix(P.water1, P.deep, ((y - wy) / (H - wy)) * 0.6));
  }
  rect(g, 0, wy, W, 8, 'foam');
  // RINGS, not discs. Six filled ellipses of foam stacked on each other is not a bow wave,
  // it is a white hole where the sea used to be.
  for (let i = 0; i < 6; i++) {
    const r = 80 + k * 320 + i * 60;
    ellipseFrame(g, W / 2, wy + 60, r, Math.max(6, r * 0.13), i % 2 ? 'foam' : 'water3', 1);
  }
  // and a block, tumbling out from under the keel
  if (k > 0.2) {
    const bk = (k - 0.2) / 0.8;
    const bx2 = 520 + bk * 120, by2 = wy - 20 + bk * bk * 160;
    rect(g, bx2 - 4, by2 - 4, 78, 46, 'ink');
    rect(g, bx2, by2, 70, 38, 'wood0');
    rect(g, bx2, by2, 70, 6, 'wood2');
  }
  wash(g, 0, 0, W, H, 'gold', 0.05);
}

/** SHOT 3 -- the wide one. A boat, a sea, and a light at the prow that used to be a man. */
function sailWide(g, u, t) {
  vBand(g, 0, 260, ['purple0', 'rust', 'orange', 'brass2', 'gold']);
  disc(g, 760, 210, 54, 'gold');
  disc(g, 760, 210, 40, 'cream');
  rays(g, 760, 210, 11, 320, 2.8, 'gold', 0.12, t * 0.3);
  // the sea, in bands, with the sun's road down it
  for (let y = 260; y < H; y++) {
    const f = (y - 260) / (H - 260);
    rect(g, 0, y, W, 1, mix(P.water1, P.deep, 0.2 + f * 0.6));
  }
  for (let y = 264; y < H; y += 14) {
    const f = (y - 260) / (H - 260);
    const off = Math.sin(y * 0.2 + t * 1.1) * (10 + f * 30);
    rect(g, off - 40, y, W + 80, 4, mix(P.water3, P.deep, 0.3));
    rect(g, 700 + off - f * 120, y, 120 + f * 200, 4, mix(P.gold, P.water2, 0.4));
  }
  // the ark, small, going left to right, and it is the only clean shape in the frame
  const bx = 260 + Ease.outCubic(clamp(u, 0, 1)) * 180;
  drawArkSmall(g, bx, 360 + Math.sin(t * 1.2) * 4, 2);
  // the soul at the prow: a small pale flame that keeps station with the boat
  const px0 = bx + 92, py0 = 322 + Math.sin(t * 1.2) * 4;
  g.globalAlpha = 0.5 + 0.2 * Math.sin(t * 3);
  disc(g, px0, py0, 14, 'ice');
  disc(g, px0, py0 - 6, 8, 'white');
  g.globalAlpha = 1;
  for (let i = 0; i < 10; i++) {
    const mk = (t * 0.5 + h(i)) % 1;
    rect(g, px0 + (h(i * 5) - 0.5) * 40, py0 - mk * 90, 6, 6, mk > 0.5 ? 'white' : 'ice');
  }
  wash(g, 0, 0, W, H, 'gold', 0.05);
}

export const SETSAIL = {
  id: 'setsail',
  dur: 12,
  shots: [
    { at: 0.00, id: 'street', label: 'THE WATER TOOK THE LAST OF THE STREET', draw: sailStreet, drift: [0, -6] },
    { at: 0.36, id: 'float', label: 'AND SHE FLOATED', draw: sailFloat, shake: 3 },
    { at: 0.68, id: 'wide', label: 'SO THE TWO OF YOU WENT OUT INTO IT', draw: sailWide, drift: [-8, 0] },
  ],
};

export const REELS = { rivers: RIVERS, chaos: CHAOS, passing: PASSING, setsail: SETSAIL };

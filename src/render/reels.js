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
import {
  drawFigure, drawBeast, drawBird, speedLines, dust, debris, shockRing, cracks,
  rainSheets, rays as cineRays, vignette, beat, onTwos, onThrees, cyc, smear, limbLine,
  drawElephant,
} from './cine.js';

const { h, vBand, ridge, village, rays, rain, lens, lensRows, taper, drawArkSmall } = FX;

/**
 * A BOX WITH A BLACK LINE ROUND IT, which is the whole visual language of the game now.
 * Every prop in these reels goes through this: fill, a lit top, and ink on all four sides.
 */
function inked(g, x, y, w, hgt, fill, lit) {
  rect(g, x - 2, y - 2, w + 4, hgt + 4, 'ink');
  rect(g, x, y, w, hgt, fill);
  if (lit) {
    rect(g, x, y, w, 3, lit);
    rect(g, x, y, 2, hgt, mix(P[lit] || P.white, P.ink, 0.25));
    rect(g, x, y + hgt - 2, w, 2, mix(P[fill] || P.wood1, P.ink, 0.45));
  }
}

/* ------------------------------------------------------------------- RIVERS */

/**
 * SHOT 1 -- a crane down the valley. A river coming out of the hills through a town, and
 * going from snowmelt to sewer on the way.
 *
 * The still version of this shot was already legible -- clean at the top, brown at the
 * bottom, a pipe at every place it changed -- and it was DEAD. A river that does not move
 * is a road. So: the water carries chevrons of scum downstream on the frame clock, every
 * outfall gulps on its own cycle rather than pouring in a steady line, the chimneys smoke
 * in eight steps a second, and there are people on the banks with legs. The camera cranes
 * down the valley across the whole shot, which is what turns a map into an establisher.
 */
function riverTown(g, u, t) {
  vBand(g, 0, 150, ['sky', 'ice', 'cream', 'sand']);
  rect(g, 0, 150, W, H - 150, 'moss');
  ridge(g, 168, 34, 3.1, 'green0', 'moss');
  // a second, nearer ridge, so the valley has depth rather than a backdrop
  ridge(g, 196, 22, 5.7, 'moss', mix(P.moss, P.green0, 0.5));

  // THE RIVER. Geometry first, as two helpers, because everything else in the shot has to
  // sit ON it: the town, the pipes and the scum all ask the river where it is at a depth.
  const bend = (f) => W * 0.5 + Math.sin(f * 2.4) * 120 - 30;
  const wide = (f) => 16 + f * f * 230;
  for (let y = 150; y < H; y++) {
    const f = (y - 150) / (H - 150);
    const cx = bend(f), wid = wide(f);
    const clean = mix(P.ice, P.water2, f * 0.8);
    // brown, not green: a green river is indistinguishable from the grass it runs through,
    // and the whole shot is about the difference between the two.
    const foul = mix(P.brass0, P.wood0, 0.45);
    const c = mix(clean, foul, clamp((f - 0.14) * 1.9, 0, 1));
    rect(g, cx - wid - 6, y, wid * 2 + 12, 1, 'ink');
    rect(g, cx - wid, y, wid * 2, 1, c);
    // a lit lip on the upstream side of every ripple row, which is what makes it read as
    // a surface rather than a painted stripe
    if (y % 9 === 0) rect(g, cx - wid + 3, y, wid * 2 - 6, 1, mix(c, P.white, 0.16));
  }

  // SCUM ON THE CURRENT. Chevrons, travelling downstream, quantised to eight steps a second
  // so they advance in jumps like drawn animation instead of sliding like a texture.
  const tq = onThrees(t) / 8;
  for (let i = 0; i < 22; i++) {
    const f = ((i / 22) + tq * 0.09) % 1;
    if (f < 0.05) continue;
    const cx = bend(f), wid = wide(f);
    const y = 150 + f * (H - 150);
    const sp = (h(i * 23) - 0.5) * 1.5 * wid;
    const sw = Math.max(4, 5 + f * 26);
    const tone = f < 0.2 ? P.foam : mix(P.cream, P.moss, 0.4 + f * 0.3);
    rect(g, cx + sp - sw, y, sw, Math.max(1, 1 + f * 2), tone);
    rect(g, cx + sp, y + 1 + f * 2, sw, Math.max(1, 1 + f * 2), tone);
  }

  // the town: two rows of roofs down both banks, denser as it comes at you
  for (let i = 0; i < 26; i++) {
    const f = h(i * 7);
    const y = 170 + f * 300;
    const ff = (y - 150) / (H - 150);
    const cx = bend(ff), wid = wide(ff);
    const side = i % 2 ? 1 : -1;
    const bx = cx + side * (wid + 24 + h(i * 3) * 130);
    const bw = 26 + h(i * 5) * 46;
    const bh = 20 + h(i * 11) * 34;
    if (bx < -40 || bx > W + 40) continue;
    inked(g, bx - bw / 2, y - bh, bw, bh, 'wood1', 'wood2');
    tri(g, bx - bw / 2 - 8, y - bh, bx + bw / 2 + 8, y - bh, bx, y - bh - 26, 'ink');
    tri(g, bx - bw / 2 - 4, y - bh - 3, bx + bw / 2 + 4, y - bh - 3, bx, y - bh - 21, 'rust');
    for (let k = 0; k < 2; k++) {
      if (h(i * 13 + k) < 0.4) continue;
      inked(g, bx - bw / 4 + k * (bw / 2) - 4, y - bh + 16, 12, 12, 'brass2', 'brass3');
    }
    // AN OUTFALL, and it GULPS. A pipe that pours a constant tongue reads as scenery; one
    // that heaves every second and a half reads as something being got rid of.
    if (i % 3 === 0) {
      const tx = cx + side * (wid + 4);
      const bore = Math.max(5, 5 + ff * 10);
      const len = 26 + ff * 52;
      const gulp = cyc(t + i * 0.37, 1.5, 6);
      const push = gulp < 0.34 ? 1 - gulp / 0.34 : 0;
      // a cylinder out of the bank, OVER THE WATER: the left bank's pipe runs right and the
      // right bank's runs left, which is the opposite of what the first cut did.
      const x0 = side < 0 ? tx : tx - len;
      rect(g, x0, y - bore - 3, len, bore * 2 + 6, 'ink');
      rect(g, x0, y - bore, len, bore * 2, 'stone1');
      rect(g, x0, y - bore, len, Math.max(2, bore * 0.5), 'stone3');
      const mx2 = side < 0 ? x0 + len - 5 : x0;
      rect(g, mx2 - 2, y - bore - 5, 9, bore * 2 + 10, 'ink');
      rect(g, mx2, y - bore - 2, 5, bore * 2 + 4, 'stone2');
      // and what comes out of it: a gout on the gulp, a stain always
      const fall = bore * (1.1 + push * 1.4);
      rect(g, mx2 - fall / 2, y + bore - 2, fall, 8 + ff * 10, mix(P.moss, P.brass0, 0.35));
      if (push > 0.4) {
        rect(g, mx2 - fall / 2, y - bore, fall, bore * 2 + 10, mix(P.moss, P.brass2, 0.28));
      }
      // the stain, spreading downstream from the mouth
      for (let s2 = 0; s2 < 5; s2++) {
        const sw = bore * (2 + s2 * 1.6);
        rect(g, mx2 - sw / 2 - side * s2 * 3, y + bore + 6 + s2 * 7, sw, 7,
          s2 < 2 ? mix(P.moss, P.ink, 0.35) : mix(P.moss, P.brass0, 0.45));
      }
    }
    // chimney smoke, on the frame clock
    if (i % 4 === 1) {
      const sc = onThrees(t);
      for (let s = 0; s < 4; s++) {
        const sy = y - bh - 20 - s * 12 - ((sc + s) % 4) * 3;
        disc(g, bx + Math.round(Math.sin((sc + s) * 0.7) * 6), sy, 5 + s * 2,
          mix(P.grey0, P.sand, 0.4));
      }
    }
  }

  // PEOPLE, on the banks, with legs. Four of them, tiny, on twos, at their own rates -- and
  // one of them is carrying something down to the water, which is the shot in miniature.
  const folk = [[210, 300, 1, 0.55], [700, 262, -1, 0.5], [330, 430, 1, 0.72], [640, 470, -1, 0.8]];
  folk.forEach(([fx, fy, dir, s], i) => {
    const walk = ((t * (14 + i * 3)) % 120) * dir;
    drawFigure(g, fx + walk, fy, s, onTwos(t, 9 + i), {
      run: true, cloth: i % 2 ? 'parch0' : 'cloth1', hair: 'hair1',
    });
    if (i === 2) {
      // the pail, swinging with the walk
      const sw = [0, 1, 2, 1, 0, -1][onTwos(t, 9 + i) % 6];
      rect(g, fx + walk + 10 * s, fy - 14 * s + sw, 9 * s, 8 * s, 'ink');
      rect(g, fx + walk + 10 * s + 1, fy - 14 * s + sw + 1, 7 * s, 6 * s, 'grey1');
    }
  });

  // birds, high and crossing, because an establisher needs something in the empty top third
  for (let i = 0; i < 3; i++) {
    drawBird(g, ((t * (26 + i * 9) + i * 340) % (W + 200)) - 100, 60 + i * 26,
      0.38, onTwos(t, 8 + i * 2), { tone: 'ink', lite: 'grey0', eye: 'ink' });
  }

  // the foreground: the near bank, black, so the frame has a floor
  rect(g, 0, H - 34, W, 34, 'ink');
  rect(g, 0, H - 38, W, 4, mix(P.ink, P.moss, 0.4));
  void u;
}

/**
 * SHOT 2 -- down at water level, and somebody empties one more cask into it.
 *
 * THE FIRST TWO VERSIONS OF THIS WERE AN ABSTRACT. Looking straight down at a river gives you
 * a brown field with objects on it, and a brown field with objects on it is a brown field with
 * objects on it -- no horizon, no perspective, no surface, and every prop reading as a sticker.
 * A dead fish came out as a white blob and the pour came out as a plant stem.
 *
 * So the camera is ON the water instead, a foot above it: a high horizon, the far bank across
 * the top, and the surface receding away with its ripples getting longer and further apart as
 * they come at us. That perspective in the ripple scale is the only thing that makes a flat
 * plane of colour read as water, and everything floating in it gets a bright MENISCUS on its
 * waterline, which is the only thing that makes an object read as IN it rather than on top of
 * the picture.
 *
 * The beat is unchanged: it floats, a cask goes over, it lands, and the slick spreads.
 */
function riverSurface(g, u, t) {
  const B = beat(u, [[0, 'float'], [0.36, 'drop'], [0.52, 'splash'], [0.6, 'after']]);
  const hor = 168;
  // the sky is not in this shot -- the far bank fills the top, in flat mud and weed
  for (let y = 0; y < hor; y++) {
    const f = y / hor;
    rect(g, 0, y, W, 1, mix(P.wood0, P.brass1, 0.15 + f * 0.5));
  }
  ridge(g, 118, 16, 6.1, 'ink', mix(P.moss, P.ink, 0.5));
  // weeds along it, swaying on the frame clock
  for (let i = 0; i < 46; i++) {
    const wx = h(i * 17) * W;
    const wh = 14 + h(i * 23) * 30;
    const sw = Math.round(Math.sin(onThrees(t) * 0.4 + i) * 3);
    for (let k2 = 0; k2 < wh; k2 += 3) {
      rect(g, wx + Math.round((k2 / wh) * sw), hor - 6 - k2, 2, 3,
        i % 3 ? mix(P.moss, P.ink, 0.45) : mix(P.green0, P.ink, 0.4));
    }
  }
  rect(g, 0, hor - 8, W, 10, mix(P.wood0, P.ink, 0.5));

  // THE WATER. Bands for depth, then dashes whose length and spacing grow towards us.
  for (let y = hor; y < H; y++) {
    const f = (y - hor) / (H - hor);
    rect(g, 0, y, W, 1, mix(mix(P.clay2, P.brass1, 0.4), P.wood1, 0.15 + f * 0.7));
  }
  const tq = onThrees(t);
  let ry2 = hor + 4, gap = 5;
  while (ry2 < H) {
    const f = (ry2 - hor) / (H - hor);
    const len = 16 + f * 130;
    const th = Math.max(1, Math.round(1 + f * 4));
    for (let x = -len; x < W + len; x += len * 1.9) {
      const off = ((tq * (3 + f * 9) + ry2 * 7) % (len * 1.9));
      const c = (ry2 + tq) % 3 === 0 ? mix(P.brass3, P.clay3, 0.4) : mix(P.brass2, P.clay2, 0.45);
      rect(g, x + off, ry2, len, th, c);
    }
    ry2 += gap; gap *= 1.11;
  }
  // OIL: slicks lying ON it, in the wrong colours, foreshortened with depth
  for (let i = 0; i < 9; i++) {
    const f = 0.12 + h(i * 7) * 0.86;
    const oy = hor + f * (H - hor);
    const ox = ((h(i * 13) * (W + 400)) + t * (10 + f * 40)) % (W + 400) - 200;
    const ow = (60 + h(i * 3) * 180) * (0.4 + f);
    const oh = Math.max(3, 6 * f * 3);
    const c = i % 3 === 0 ? 'purple1' : i % 3 === 1 ? 'teal' : 'pink';
    wash(g, ox - ow, oy - oh, ow * 2, oh * 2, c, 0.16);
    ellipseFrame(g, ox, oy, ow, oh, mix(P[c], P.brass2, 0.35));
  }
  // scum: a broken line of foam drifting down the middle distance
  for (let i = 0; i < 30; i++) {
    const f = 0.2 + h(i * 11) * 0.7;
    const sy2 = hor + f * (H - hor);
    const sx2 = ((h(i * 5) * (W + 300)) - t * (14 + f * 30)) % (W + 300) - 150;
    rect(g, sx2, sy2, (14 + h(i) * 40) * (0.5 + f), Math.max(2, 3 * f * 2),
      mix(P.cream, P.moss, 0.4));
  }

  /** anything floating: a meniscus line, a squashed shadow under it, and it bobs. */
  const afloat = (x, y, w, drawIt) => {
    const bob = [0, -1, -2, -1, 0, 1][(onTwos(t, 7) + Math.round(x / 40)) % 6];
    drawIt(x, y + bob);
    ellipse(g, x, y + bob + 2, w * 0.9, Math.max(2, w * 0.16), mix(P.wood0, P.ink, 0.4));
    rect(g, x - w, y + bob, w * 2, 3, mix(P.foam, P.brass1, 0.4));
    rect(g, x - w * 0.6, y + bob + 3, w * 1.2, 2, mix(P.foam, P.wood1, 0.5));
  };

  // a tyre, a crate corner, two bottles and a boot -- the far ones small, the near ones big
  afloat(770, 372, 62, (x, y) => {
    ellipse(g, x, y - 12, 62, 26, 'ink');
    ellipse(g, x, y - 12, 40, 14, mix(P.wood0, P.clay2, 0.35));
    ellipse(g, x, y - 16, 58, 18, mix(P.ink, P.grey0, 0.25));
  });
  afloat(300, 250, 34, (x, y) => {
    rect(g, x - 34, y - 30, 68, 32, 'ink');
    rect(g, x - 30, y - 27, 60, 27, 'wood1');
    rect(g, x - 30, y - 27, 60, 6, 'wood2');
  });
  afloat(520, 214, 12, (x, y) => {
    rect(g, x - 12, y - 26, 24, 28, 'ink');
    rect(g, x - 9, y - 23, 18, 24, mix(P.teal, P.wood0, 0.3));
    rect(g, x - 4, y - 40, 9, 18, mix(P.teal, P.wood0, 0.45));
    rect(g, x - 9, y - 23, 18, 4, 'ice');
  });
  afloat(120, 300, 18, (x, y) => {
    rect(g, x - 18, y - 22, 36, 24, 'ink');
    rect(g, x - 15, y - 19, 30, 20, mix(P.wood0, P.ink, 0.2));
    rect(g, x + 4, y - 40, 14, 22, mix(P.wood0, P.ink, 0.2));
  });

  // THE FISH, big and near, belly up, rolling with the swell -- the one thing in the shot
  // that was alive, and it gets the most pixels of anything in it.
  const fy = 470 + Math.sin(t * 0.9) * 4;
  const roll = Math.sin(t * 0.6) * 5;
  const fx = 345;
  ellipse(g, fx, fy + 8, 130, 20, mix(P.wood0, P.ink, 0.45));
  ellipse(g, fx, fy, 122, 44 + roll, 'ink');
  ellipse(g, fx, fy, 118, 40 + roll, 'bone');
  ellipse(g, fx - 18, fy - 8, 84, 22, 'cream');
  // the tail, forked
  tri(g, fx + 108, fy, fx + 170, fy - 40, fx + 168, fy + 6, 'bone');
  tri(g, fx + 108, fy + 4, fx + 170, fy + 44, fx + 168, fy - 2, 'bone');
  // fins, and the ribbed rays in them
  for (let i = 0; i < 6; i++) {
    rect(g, fx - 60 + i * 26, fy - 38 + roll * 0.3, 16, 12, 'cream');
    rect(g, fx - 60 + i * 26, fy - 44 + roll * 0.3, 3, 8, mix(P.cream, P.wood1, 0.4));
  }
  // the gill plate and the eye, up at the sky
  limbLine(g, fx - 60, fy - 26, fx - 52, fy + 24, 4, mix(P.bone, P.wood1, 0.35),
    mix(P.bone, P.wood1, 0.5));
  disc(g, fx - 86, fy - 12, 15, 'ink');
  disc(g, fx - 86, fy - 12, 11, 'bone');
  disc(g, fx - 86, fy - 12, 6, 'ink');
  rect(g, fx - 90, fy - 18, 5, 5, 'white');
  // the mouth, open
  tri(g, fx - 116, fy + 4, fx - 96, fy - 4, fx - 96, fy + 18, 'ink');
  rect(g, fx - 122, fy + 6, 26, 8, 'ink');
  // and its own meniscus, because it is IN the water
  rect(g, fx - 122, fy + 14, 244, 4, mix(P.foam, P.brass1, 0.35));

  // THE EVENT. A cask on a staging at the far bank goes over and empties into the river.
  const cx2 = 640, cy2 = 96, land = 210;
  const barrel = (tip) => {
    g.save();
    g.translate(Math.round(cx2), Math.round(cy2));
    g.rotate(tip);
    rect(g, -60, -46, 120, 92, 'ink');
    for (let i = 0; i < 11; i++) {
      const f = i / 10;
      const bow = Math.sin(f * Math.PI) * 7;
      rect(g, -57 + i * 11, -43 - bow, 10, 86 + bow * 2,
        i % 4 === 3 ? mix(P.wood1, P.ink, 0.35) : 'wood1');
      rect(g, -57 + i * 11, -43 - bow, 10, 8, 'wood2');
    }
    rect(g, -60, -24, 120, 9, 'brass0');
    rect(g, -60, 16, 120, 9, 'brass0');
    rect(g, -60, -24, 120, 3, 'brass1');
    // the open end, a dark ellipse: without it a tipped cask has the same silhouette as an
    // upright one and the tip does not read at all
    ellipse(g, 0, 44, 58, 13, 'ink');
    ellipse(g, 0, 43, 52, 10, mix(P.wood0, P.ink, 0.4));
    g.restore();
  };
  // the staging it stands on
  rect(g, cx2 - 76, cy2 + 48, 152, 12, 'ink');
  rect(g, cx2 - 72, cy2 + 50, 144, 8, 'wood2');
  for (const lx3 of [cx2 - 62, cx2 + 50]) {
    rect(g, lx3, cy2 + 58, 12, hor - cy2 - 52, 'ink');
    rect(g, lx3 + 2, cy2 + 58, 8, hor - cy2 - 52, 'wood1');
  }
  const tip = B.kind === 'float' ? -0.1 - Math.sin(t * 1.2) * 0.03
    : B.kind === 'drop' ? -0.1 - Ease.inQuad(B.k) * 1.5 : -1.62;
  barrel(tip);
  // the mouth: the cask's end cap, wherever the tip has put it
  const mx2 = cx2 - 50 * Math.sin(tip), my2 = cy2 + 50 * Math.cos(tip);
  const reach = B.kind === 'float' ? 0 : B.kind === 'drop' ? Ease.inQuad(B.k) * 1.6 : 1;
  if (reach > 0) {
    // A STREAM: it necks down as it accelerates and breaks into lumps. A solid tapering slab
    // is a plank of olive paint, which is exactly how the first one read.
    for (let y = my2; y < land; y += 6) {
      const f = (y - my2) / Math.max(1, land - my2);
      if (f > reach) break;
      const w = Math.max(8, 38 * (1 - f * 0.35) * (0.86 + 0.14 * Math.sin(f * 9 + t * 5)));
      const x0 = mx2 - w / 2 + f * 12;
      rect(g, x0, y, w, 6, mix(P.moss, P.brass1, 0.32 + f * 0.2));
      rect(g, x0, y, Math.max(3, w * 0.34), 6, mix(P.moss, P.brass3, 0.34));
      rect(g, x0 + w - 4, y, 4, 6, mix(P.moss, P.ink, 0.4));
      if ((y / 6 | 0) % 4 === 1) {
        rect(g, x0 - w * 0.4 + Math.sin(f * 14) * 11, y + 2, w * 0.45, 7,
          mix(P.moss, P.ink, 0.28));
      }
    }
  }
  const px2 = mx2 + 12;
  if (B.kind === 'drop' && reach >= 1) {
    // it is already hitting before the beat changes, so the surface has to answer early
    for (let i = 0; i < 8; i++) {
      const a = -Math.PI * (0.15 + (i / 8) * 0.7);
      rect(g, px2 + Math.cos(a) * 40, land + Math.sin(a) * 30, 5, 5, 'foam');
    }
    ellipseFrame(g, px2, land + 4, 46, 10, mix(P.foam, P.wood1, 0.4));
  }
  if (B.kind === 'splash') {
    shockRing(g, px2, land + 4, B.k, 'foam');
    for (let i = 0; i < 18; i++) {
      const a = -Math.PI * (0.1 + (i / 18) * 0.8);
      const sp = 70 + h(i * 31) * 190;
      rect(g, px2 + Math.cos(a) * sp * B.k,
        land + Math.sin(a) * sp * B.k + 520 * B.k * B.k,
        4 + (i % 3) * 3, 4 + (i % 3) * 3, i % 3 ? 'foam' : mix(P.moss, P.brass0, 0.4));
    }
    for (let i = 0; i < 5; i++) {
      rect(g, px2 - 60 + i * 30, land - 30 - (1 - B.k) * 46, 11, 46 * (1 - B.k * 0.5), 'foam');
    }
  }
  if (B.kind === 'after') {
    // and the river takes it: rings out, then a slick that is WIDER at the end of the shot
    for (let i = 0; i < 4; i++) {
      ellipseFrame(g, px2, land + 8, 50 + i * 54 + B.k * 200, 8 + i * 8 + B.k * 16,
        mix(P.foam, P.wood1, 0.4 + i * 0.12));
    }
    for (let i = 0; i < 4; i++) {
      const sw = 90 + i * 66 + B.k * 150;
      const sy3 = land + 26 + i * 34;
      const c = i % 2 ? 'purple1' : 'teal';
      const prevA = g.globalAlpha;
      g.globalAlpha = 0.22;
      ellipse(g, px2 - i * 26, sy3, sw, 9 + i * 4, mix(P[c], P.wood1, 0.35));
      g.globalAlpha = prevA;
      ellipseFrame(g, px2 - i * 26, sy3, sw, 9 + i * 4, mix(P[c], P.brass2, 0.45));
    }
  }
  wash(g, 0, 0, W, H, 'wood0', 0.08 + u * 0.08);
}

/**
 * A MAN, IN BLACK, FROM THE OUTLINE IN.
 *
 * `pull` is the bow draw, 0..1. Everything is built so the OUTLINE is the drawing: shoulders
 * narrower than the hem, a hat with a brim that breaks the skyline, boots, and the bow arm out
 * straight. The all-ink cine rig was tried here first and it lost every internal contour it
 * had, so what was left was a rectangle with a square head -- three of them read as post boxes
 * on a bank. A silhouette has to be BUILT as a silhouette.
 */
function hunter(g, x, gy, s, o = {}) {
  const S = s, pull = o.pull || 0, walk = o.walk || 0;
  const hipY = gy - 46 * S, shY = gy - 76 * S, headY = gy - 92 * S;
  // legs: apart, with boots, and the near one bends on the walk
  for (const side of [-1, 1]) {
    const kx = x + side * 7 * S + (side > 0 ? walk * 5 * S : 0);
    limbLine(g, x + side * 4 * S, hipY, kx, gy - 22 * S, 7 * S, 'ink', 'ink');
    limbLine(g, kx, gy - 22 * S, kx + side * 2 * S, gy - 3 * S, 6 * S, 'ink', 'ink');
    rect(g, kx + side * 2 * S - 6 * S, gy - 5 * S, 13 * S, 5 * S, 'ink');
  }
  // the tunic: a trapezoid, hem wider than the shoulders
  const tunH = hipY + 8 * S - shY;
  for (let i = 0; i < 34; i++) {
    const f = i / 33;
    const w = (11 + f * 8) * S;
    // the row height comes off the STEP, or the tunic comes out striped: at two pixels a row
    // over a hundred-pixel tunic there was a one-pixel gap between every course of it.
    rect(g, x - w, shY + f * tunH, w * 2, Math.ceil(tunH / 33) + 1, 'ink');
  }
  // the head, round, with a hat: brim then crown
  disc(g, x, headY, 9 * S, 'ink');
  rect(g, x - 17 * S, headY - 9 * S, 34 * S, 3 * S, 'ink');
  rect(g, x - 9 * S, headY - 17 * S, 18 * S, 8 * S, 'ink');
  // the quiver on his back, arrows fanned out of it
  limbLine(g, x - 6 * S, shY + 4 * S, x - 14 * S, hipY, 8 * S, 'ink', 'ink');
  for (let i = 0; i < 3; i++) {
    rect(g, x - 16 * S + i * 3 * S, shY - 12 * S - i * 2 * S, 2 * S, 16 * S, 'ink');
  }
  // ARMS. The bow arm is out straight; the string arm comes back with the draw.
  limbLine(g, x + 8 * S, shY + 2 * S, x + 26 * S, shY + 5 * S, 6 * S, 'ink', 'ink');
  const dx = x + (10 - pull * 10) * S;
  limbLine(g, x - 4 * S, shY + 2 * S, dx, shY + 6 * S, 6 * S, 'ink', 'ink');
  return { bowX: x + 30 * S, bowY: shY + 5 * S, drawX: dx, shY, headY };
}

/**
 * SHOT 3 -- the hunt. What they did to the things that drank it.
 *
 * NOBODY HAS A FACE IN THIS SHOT: three black cut-outs across the bottom third against a gold
 * sky. But they are the biped RIG in black rather than three rectangles, so they have knees
 * and shoulders, and the bow DRAWS -- the arm goes back over the first beat, the string goes
 * with it, and it looses on a frame. Then one white frame, feathers, and the bird comes down
 * tumbling with the camera falling after it. A silhouette makes it about the act; an animated
 * silhouette makes it about the act happening.
 */
function riverHunt(g, u, t) {
  const B = beat(u, [[0, 'draw'], [0.34, 'loose'], [0.44, 'hit'], [0.56, 'fall']]);
  vBand(g, 0, 384, ['rust', 'orange', 'gold', 'brass2']);
  // low sun
  disc(g, 240, 168, 42, 'cream');
  disc(g, 240, 168, 30, 'white');
  rays(g, 240, 168, 9, 220, 2.4, 'gold', 0.12, t * 0.4);
  // the far bank, then THE WATER they are standing over, then the near bank in shadow
  ridge(g, 384, 20, 7.3, 'ink', null);
  for (let y = 384; y < 436; y++) {
    const f = (y - 384) / 52;
    rect(g, 0, y, W, 1, mix(P.brass1, P.wood0, f * 0.9));
  }
  const q2 = onThrees(t);
  for (let i = 0; i < 16; i++) {
    const gy2 = 388 + (i % 6) * 8;
    rect(g, ((i * 137 + q2 * 9) % (W + 120)) - 60, gy2, 50 + (i % 4) * 30, 3,
      mix(P.gold, P.wood0, 0.3 + (i % 3) * 0.2));
  }
  rect(g, 0, 436, W, H - 436, 'wood0');
  rect(g, 0, 436, W, 4, mix(P.wood0, P.brass0, 0.4));
  // reeds, in front, swaying on the frame clock -- the only soft thing in the frame
  for (let c = 0; c < 9; c++) {
    const cx0 = 40 + c * 108 + h(c * 13) * 40;
    const base = 470 + h(c * 7) * 40;
    for (let i = 0; i < 7; i++) {
      const rx = cx0 + (i - 3) * 9 + h(c * 5 + i) * 6;
      const rh2 = 40 + h(c * 31 + i * 3) * 66;
      const sw = Math.round(Math.sin(onThrees(t) * 0.4 + c + i * 0.5) * 5);
      for (let s2 = 0; s2 < rh2; s2 += 4) {
        rect(g, rx + Math.round((s2 / rh2) * sw), base - s2, 3, 4, 'ink');
      }
      // a head on the tallest few, so they are reeds and not railings
      if (i % 3 === 1) rect(g, rx + sw - 2, base - rh2 - 8, 6, 12, 'ink');
    }
  }

  // THE BIRD. Wheeling, then hit, then falling -- and the fall is a TUMBLE, not a slide.
  let bx = 620 + Math.sin(t * 0.7) * 50;
  let by = 150 + Math.sin(t * 0.9) * 20;
  let bfr = onTwos(t, 9) % 4;
  let tumble = false;
  if (B.kind === 'hit') { bx = 640; by = 158; bfr = 0; }
  if (B.kind === 'fall') {
    bx = 640 - B.k * 90;
    by = 158 + Ease.inQuad(B.k) * 300;
    bfr = onTwos(t, 14) % 4;
    tumble = true;
  }
  if (tumble) {
    // wings half folded and the body rocking: a bird that keeps flapping level is a bird
    // that has not been hit
    g.save();
    g.translate(Math.round(bx), Math.round(by));
    g.rotate(Math.sin(B.k * 9) * 0.5 + B.k * 0.7);
    drawBird(g, 0, 0, 1.5, bfr, { tone: 'ink', lite: 'grey0', eye: 'ink', span: 34, flip: true });
    g.restore();
  } else {
    drawBird(g, bx, by, 1.5, bfr, { tone: 'ink', lite: 'grey0', eye: 'ink', flip: true });
  }
  if (B.kind === 'hit') {
    // the jolt: feathers off the near wing and a hard ring, on the frame it lands
    debris(g, bx, by, B.k, 16, 4, 'bone');
    shockRing(g, bx, by, B.k * 0.8, 'white');
  }
  if (B.kind === 'fall' || B.kind === 'hit') {
    for (let i = 0; i < 11; i++) {
      const fk = clamp((B.kind === 'fall' ? 0.3 + B.k : B.k * 0.3) * 1.5 - i * 0.09, 0, 1);
      if (fk <= 0) continue;
      const fx = bx + 30 + fk * 90 + Math.sin(t * 2 + i) * 12;
      const fy = by - 30 - fk * 60 + i * 8;
      rect(g, fx, fy, 13, 4, 'cream');
      rect(g, fx + 9, fy - 2, 6, 8, 'bone');
    }
  }

  // THE THREE OF THEM, across the bottom, black, and they are the rig -- so they have knees.
  const men = [[150, 1.0, 'bow'], [430, 0.84, 'net'], [770, 1.08, 'bow']];
  men.forEach(([mx, sc, kind], i) => {
    const gy = 470;
    // the recoil: they rock back on the loose and settle
    const rock = B.kind === 'loose' ? Ease.outCubic(B.k) * -4 : B.kind === 'draw' ? 0 : -1;
    const S = sc * 2.6;
    const pull = kind !== 'bow' ? 0
      : B.kind === 'draw' ? 0.2 + Ease.outCubic(clamp(B.k * 1.3, 0, 1)) * 0.8 : 0;
    const r = hunter(g, mx + rock, gy, S, {
      pull, walk: i === 1 ? [0, 0.4, 0.8, 1, 0.6, 0.2][onTwos(t, 5) % 6] : 0,
    });
    if (kind === 'bow') {
      // THE BOW. A recurve arc off the bow hand, a string to the draw hand, and the arrow
      // riding the string -- so the whole assembly moves when he pulls.
      const arc = 24 * S;
      for (let a = -1.2; a <= 1.2; a += 0.05) {
        const w = 3 * S * (1 - Math.abs(a) / 1.6);
        rect(g, r.bowX + Math.cos(a) * arc * 0.42, r.bowY + Math.sin(a) * arc, w + S, 3 * S, 'ink');
      }
      for (const s2 of [-1, 1]) {
        const tipx = r.bowX + Math.cos(s2 * 1.2) * arc * 0.42;
        const tipy = r.bowY + Math.sin(s2 * 1.2) * arc;
        limbLine(g, tipx, tipy, r.drawX, r.bowY, Math.max(1, S * 0.8), 'ink', 'ink');
      }
      if (B.kind === 'draw') {
        rect(g, r.drawX, r.bowY - S, r.bowX - r.drawX + 26 * S, 2 * S, 'ink');
        rect(g, r.bowX + 22 * S, r.bowY - 3 * S, 5 * S, 5 * S, 'ink');
      }
    } else {
      // the net: a lattice on a pole, and he shakes it out on the frame clock
      const sh = Math.round(Math.sin(onThrees(t) * 0.8) * 3) * S;
      limbLine(g, mx + 14 * S, gy - 6 * S, mx + 20 * S, r.shY - 26 * S, 3 * S, 'ink', 'ink');
      for (let j = 0; j < 5; j++) {
        rect(g, mx + 20 * S, r.shY - 24 * S + j * 11 * S + sh * (j / 5), 36 * S, 1.6 * S, 'ink');
        rect(g, mx + 20 * S + j * 9 * S, r.shY - 24 * S, 1.6 * S, 46 * S, 'ink');
      }
    }
  });

  // THE ARROW, on its own beat, and it is a streak rather than a stick
  if (B.kind === 'loose') {
    const k = Ease.linear(B.k);
    const ax = lerp(230, 620, k), ay = lerp(272, 168, k);
    speedLines(g, ax, ay, 8, 150, Math.atan2(272 - 168, 230 - 620),
      mix(P.white, P.gold, 0.4), 20);
    limbLine(g, ax, ay, ax - 70, ay + 46, 3, 'ink', 'ink');
    rect(g, ax, ay - 3, 8, 6, 'bone');
  }
  wash(g, 0, 0, W, H, 'rust', 0.08);
}

/**
 * SHOT 4 -- the eye in the water. The bridge into WRATH.
 *
 * The reflection is the whole trick: you never see the sky in this shot, only what the river
 * is showing you, and it is looking back. And it BLINKS -- one lid down and up across three
 * frames, on a beat, with the pupil narrower afterwards than it was before. A still eye is a
 * painting; an eye that blinks has noticed you.
 */
function riverSeen(g, u, t) {
  const B = beat(u, [[0, 'open'], [0.5, 'blink'], [0.62, 'seen']]);
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
  const k = Ease.outCubic(clamp(u * 2.4, 0, 1));
  const cx = W / 2, cy = 270;
  const rx = 272 * k, ry = 116 * k;
  if (rx > 4) {
    // the opening: a lens, which comes to a POINT at each corner. That point is the whole
    // read -- the first cut used ellipses and the shot was a fried egg on dark water.
    lens(g, cx, cy, rx, ry, mix(P.cream, P.deep, 0.3));
    lens(g, cx, cy, rx * 0.96, ry * 0.92, mix(P.brass3, P.deep, 0.1));
    // shading under the top lid and along the bottom, so the ball is round
    lensRows(rx * 0.98, ry * 0.94, (dy, w) => {
      if (dy < -ry * 0.4) rect(g, cx - w, cy + dy, w * 2, 1, mix(P.brass3, P.deep, 0.42));
      if (dy > ry * 0.62) rect(g, cx - w, cy + dy, w * 2, 1, mix(P.brass3, P.deep, 0.3));
    });
    // THE IRIS IS ROUND. It sits in the opening and is cut by the lids, which is why it has
    // to be a disc: a lens-shaped iris reads as a second eyelid.
    const ir = ry * 0.74;
    const nar = B.kind === 'seen' ? 1 - Ease.outCubic(clamp(B.k * 2, 0, 1)) * 0.55 : 1;
    lensRows(rx, ry, (dy, w) => {
      const k2 = 1 - (dy * dy) / (ir * ir);
      if (k2 <= 0) return;
      const iw = Math.min(w, ir * Math.sqrt(k2));
      const f = Math.abs(dy) / ir;
      rect(g, cx - iw, cy + dy, iw * 2, 1, mix(P.gold, P.rust, 0.2 + f * 0.55));
      // fibres in the iris: every third row is a shade darker, which reads as an iris
      if ((dy + 99) % 4 === 0) {
        rect(g, cx - iw, cy + dy, iw * 2, 1, mix(P.gold, P.rust, 0.3 + f * 0.5));
      }
      // the limbal ring, at the edge of the disc
      if (iw > 3 && ir * Math.sqrt(k2) <= w) {
        rect(g, cx - iw, cy + dy, 4, 1, mix(P.rust, P.ink, 0.55));
        rect(g, cx + iw - 4, cy + dy, 4, 1, mix(P.rust, P.ink, 0.55));
      }
    });
    // the slit pupil, and it TIGHTENS after the blink
    lensRows(rx, ry, (dy, w) => {
      void w;
      const pw = 11 * nar * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * 0.94 * ry * 0.94)));
      if (pw > 0.5) rect(g, cx - pw, cy + dy, pw * 2, 1, 'ink');
    });
    // one catch light, up and to the left, and it is the only clean white in the shot
    rect(g, cx - rx * 0.2, cy - ry * 0.44, 15, 10, 'white');
    rect(g, cx - rx * 0.2 + 15, cy - ry * 0.44 + 10, 6, 4, mix(P.white, P.brass3, 0.5));
    // the lash line along the top edge, and a few lashes off it
    lensRows(rx, ry, (dy, w) => {
      if (dy > -ry * 0.86) return;
      rect(g, cx - w, cy + dy, w * 2, 1, mix(P.deep, P.ink, 0.5));
    });
    for (let i = -3; i <= 3; i++) {
      const f = i * 0.24;
      const lx3 = cx + f * rx;
      const dy = -ry * (1 - f * f);
      // angled out and away, three pixels wide, which is a lash; vertical bars are a comb
      limbLine(g, lx3, cy + dy, lx3 + f * 26, cy + dy - 15, 3, mix(P.deep, P.ink, 0.55),
        mix(P.deep, P.ink, 0.6));
    }
    // and the water breaks it up, because it is only a reflection -- but not across the
    // middle of it: ripples over the iris turned the whole eye into a venetian blind.
    for (let y = -ry; y < ry; y += 12) {
      if (Math.abs(y) < ry * 0.5) continue;
      const off = Math.sin(y * 0.3 + t * 1.6) * 14;
      const w = rx * (1 - (y / ry) * (y / ry));
      rect(g, cx - w + off, cy + y, w * 2, 3, mix(P.deep, P.night, 0.4));
    }
    // THE BLINK. Three poses, held: the water closes over it from the top and comes back.
    if (B.kind === 'blink') {
      const seq = [0.34, 0.86, 1, 0.5][Math.min(3, Math.floor(B.k * 4))];
      lensRows(rx * 1.02, ry * 1.02, (dy, w) => {
        if (dy > -ry + ry * 2 * seq) return;
        rect(g, cx - w, cy + dy, w * 2, 1, mix(P.night, P.deep, 0.5));
      });
      const edge = cy - ry + ry * 2 * seq;
      rect(g, cx - rx * 0.9, edge - 4, rx * 1.8, 4, mix(P.water0, P.foam, 0.2));
    }
  }
  // one drop falling into it at the end of the shot
  if (u > 0.72) {
    const dk = (u - 0.72) / 0.28;
    const dy = -20 + dk * dk * 300;
    rect(g, cx + 180, dy, 8, 24, 'ice');
    if (dk > 0.7) shockRing(g, cx + 184, 280, (dk - 0.7) / 0.3, 'water3');
  }
  wash(g, 0, 0, W, H, 'ink', 0.2 - u * 0.15);
}

export const RIVERS = {
  id: 'rivers',
  dur: 15,
  shots: [
    {
      at: 0.00, id: 'town', label: 'THE RIVER CAME DOWN THROUGH THE TOWN', draw: riverTown,
      // a crane down the valley: it starts on the hills and ends on the near bank
      cam: [
        { at: 0, y: -46, zoom: 1.06 },
        { at: 1, y: 34, zoom: 1.16, ease: 'inout' },
      ],
    },
    {
      at: 0.27, id: 'surface', label: 'AND THEY PUT EVERYTHING IN IT', draw: riverSurface,
      // drifting, then it flinches when the sack lands
      cam: [
        { at: 0, x: -30, y: -20, zoom: 1.05 },
        { at: 0.5, x: 10, y: 0, zoom: 1.05, ease: 'linear' },
        { at: 0.58, x: 30, y: 20, zoom: 1.25, ease: 'snap' },
        { at: 1, x: 10, y: 10, zoom: 1.1, ease: 'out' },
      ],
      hits: [[0.52, 13, 'white'], [0.6, 6, null]],
    },
    {
      at: 0.54, id: 'hunt', label: 'WHAT DRANK FROM IT, THEY SHOT', draw: riverHunt,
      // on the men, whip up on the loose, then fall with the bird
      cam: [
        { at: 0, y: 22, zoom: 1.1 },
        { at: 0.3, y: 18, zoom: 1.09, ease: 'linear' },
        { at: 0.4, y: -46, zoom: 1.04, ease: 'whip' },
        { at: 0.86, y: 26, zoom: 1.08, ease: 'in' },
        { at: 1, y: 28, zoom: 1.08 },
      ],
      hits: [[0.44, 15, 'white'], [0.9, 8, null]],
    },
    {
      at: 0.80, id: 'seen', label: 'ALL OF IT WAS SEEN', draw: riverSeen,
      cam: [
        { at: 0, y: -10, zoom: 1 },
        { at: 0.5, y: 0, zoom: 1.08, ease: 'linear' },
        { at: 0.62, y: 4, zoom: 1.22, ease: 'snap' },
        { at: 1, y: 6, zoom: 1.3, ease: 'out' },
      ],
      hits: [[0.5, 5, null]],
    },
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
/**
 * SHOT ONE. One old man running down a street, and the things behind him gaining.
 *
 * REBUILT AS ANIMATION. The first version was a still: houses, rain on a sine, and a
 * silhouette translated across the frame. Everything in it moved and none of it was animated,
 * which is exactly the failure the cine kit exists to fix. Now he has a six-frame run cycle on
 * twos with the body dropping on the contacts, the things behind him have their own cycle at a
 * different rate so the pack does not march in step, and the camera tracks him rather than the
 * street sliding past.
 */
function chaosStreet(g, u, t) {
  const groundY = 384;
  // --- night, rain, and a street that recedes
  for (let y = 0; y < groundY; y++) {
    rect(g, 0, y, W, 1, mix(P.night, P.purple0, y / groundY * 0.7));
  }
  // the houses, two depths, the far ones flatter and cooler
  for (let d = 0; d < 2; d++) {
    const base = groundY - 26 + d * 26;
    for (let i = -1; i < 8; i++) {
      const bx = -60 + i * 150 + d * 70;
      const bh = 120 + ((i * 53 + d * 31) % 5) * 26 - d * 34;
      const tone = d ? 'wood0' : mix(P.wood0, P.night, 0.45);
      inked(g, bx, base - bh, 124, bh, tone, d ? 'wood1' : mix(P.wood1, P.night, 0.4));
      // a roof, pitched, and windows -- one of them lit, which is the only warm thing here
      tri(g, bx - 10, base - bh, bx + 134, base - bh, bx + 62, base - bh - 40, 'ink');
      tri(g, bx - 4, base - bh, bx + 128, base - bh, bx + 62, base - bh - 34,
        d ? 'rust' : mix(P.rust, P.night, 0.5));
      for (let wy = 0; wy < 2; wy++) {
        for (let wx = 0; wx < 3; wx++) {
          const lit2 = d && ((i * 7 + wx + wy * 3) % 11) === 0;
          rect(g, bx + 16 + wx * 34, base - bh + 26 + wy * 42, 22, 28, 'ink');
          rect(g, bx + 19 + wx * 34, base - bh + 29 + wy * 42, 16, 22,
            lit2 ? 'gold' : mix(P.night, P.ink, 0.4));
        }
      }
    }
  }
  // the road
  rect(g, 0, groundY, W, H - groundY, mix(P.wood0, P.ink, 0.45));
  for (let i = 0; i < 26; i++) {
    const y = groundY + 4 + ((i * 37) % (H - groundY - 8));
    rect(g, ((i * 91) % W), y, 30 + (i % 3) * 20, 2, mix(P.wood0, P.ink, 0.2));
  }
  // standing water, catching the one lit window
  for (let i = 0; i < 7; i++) {
    const px2 = (i * 157) % W, py = groundY + 18 + ((i * 43) % 90);
    ellipse(g, px2, py, 36 + (i % 3) * 14, 7, mix(P.night, P.water1, 0.5));
    rect(g, px2 - 10, py, 20, 1, mix(P.gold, P.night, 0.55));
  }

  // --- THE PACK, behind him and gaining. Different cycle rate per animal, so they do not
  // march in step -- three things running in unison read as one thing.
  // THE PACK, and it has to be BIG. At the scale it was drawn first the beasts had a
  // thirty-six pixel shoulder against a hundred-pixel man: the things chasing him were
  // knee-high, which is not a threat, it is a nuisance.
  const chase = lerp(130, 570, Ease.inQuad(u));
  for (let i = 0; i < 3; i++) {
    const bx = chase - i * 190;
    const fr = Math.floor(t * (9 + i * 2)) % 6;
    drawBeast(g, bx, groundY + 34 + i * 16, 2.5 - i * 0.25, fr, {
      kind: i === 1 ? 'lion' : 'ox',
      tone: i === 1 ? 'purple1' : 'purple0', eye: 'red2', rim: 'pink',
    });
    // a wash of their own light on the road under them, which is what puts them IN the street
    wash(g, bx - 150, groundY + 10 + i * 16, 340, 40, 'purple1', 0.1);
  }

  // --- HIM. The camera keys keep him near the middle of frame, so the run reads as a run
  // rather than as a slide across a photograph.
  const hx = lerp(320, 720, u);
  const fr = Math.floor(t * 12) % 6;
  speedLines(g, hx - 58, groundY - 46, 5, 130, Math.PI, mix(P.foam, P.night, 0.55), 60);
  drawFigure(g, hx, groundY + 40, 2.6, fr, { run: true, wide: true, cloth: 'parch0' });
  // splashes, and they only happen on the CONTACT frames, which is what sells the weight
  if (fr === 0 || fr === 3) {
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI * (0.15 + (i / 9) * 0.7);
      rect(g, hx - 24 + Math.cos(a) * (14 + i * 7), groundY + 36 + Math.sin(a) * (10 + i * 4),
        5, 5, i % 2 ? 'foam' : 'water3');
    }
  }
  rainSheets(g, t, 1.1, 0.26);
  wash(g, 0, 0, W, H, 'night', 0.16);
}

/**
 * SHOT TWO. A wall, and then not a wall.
 *
 * THIS IS THE COMIC-TIMING SHOT and it is built out of four beats rather than a curve:
 * WAIT (nothing, and it is too long), BULGE (the plaster cracks and he turns), HIT (one frame
 * of white, the camera snaps in, the wall becomes debris) and CHARGE (the elephant coming, on
 * the frame clock, camera shaking). A single eased interpolation cannot do this -- the whole
 * point is that nothing happens and then everything does.
 */
function chaosElephant(g, u, t) {
  const groundY = 400;
  const B = beat(u, [[0, 'wait'], [0.3, 'bulge'], [0.52, 'hit'], [0.6, 'charge']]);
  // the room: floorboards, a beam, and the wall we are about to lose
  for (let y = 0; y < groundY; y++) rect(g, 0, y, W, 1, mix(P.wood0, P.ink, 0.35 + y / groundY * 0.3));
  rect(g, 0, groundY, W, H - groundY, 'wood1');
  for (let i = 0; i < 14; i++) rect(g, 0, groundY + i * 12, W, 2, mix(P.wood0, P.ink, 0.3));
  // the wall, in courses of stone, and it bulges before it goes
  const bulge = B.kind === 'wait' ? 0 : B.kind === 'bulge' ? Ease.inQuad(B.k) * 16 : 0;
  const gone = B.kind === 'hit' || B.kind === 'charge';
  if (!gone) {
    for (let i = 0; i < 11; i++) {
      const cy = 60 + i * 32;
      const push = bulge * Math.sin((i / 10) * Math.PI);
      for (let j = -1; j < 9; j++) {
        const bx = j * 116 + ((i % 2) * 58);
        inked(g, bx + push, cy, 108, 28, mix(P.grey0, P.wood0, 0.4), 'grey1');
      }
    }
    // a beam across the top of it and a pair of joists, so the room is a room
    rect(g, 0, 34, W, 26, 'ink');
    rect(g, 0, 38, W, 18, 'wood1');
    rect(g, 0, 38, W, 5, 'wood2');
    for (const jx of [180, 620]) {
      rect(g, jx, 56, 34, 348, 'ink');
      rect(g, jx + 4, 56, 26, 344, 'wood1');
      rect(g, jx + 4, 56, 8, 344, 'wood2');
    }
    if (B.kind === 'bulge') cracks(g, 300, 210, B.k * 1.4, 9, 4, 'ink');
  } else {
    // the hole, and what is standing in it
    rect(g, 0, 0, W, groundY, mix(P.night, P.purple0, 0.5));
    for (let i = 0; i < 5; i++) {
      const cy = 60 + i * 32;
      inked(g, -20, cy, 90 - i * 12, 28, mix(P.grey0, P.wood0, 0.4), 'grey1');
      inked(g, W - 70 + i * 10, cy, 90, 28, mix(P.grey0, P.wood0, 0.4), 'grey1');
    }
    rainSheets(g, t, 0.7, 0.3);
  }

  if (B.kind === 'hit') {
    // AND THE THING IS ALREADY THROUGH IT. The impact frame used to be a ring on an empty
    // field, because the elephant only arrived in the next beat: the single loudest moment in
    // the prologue was a white ellipse and some dust with nothing in the middle of it. The
    // punch has to contain the fist.
    const fr = Math.floor(t * 14) % 6;
    drawElephant(g, 210 + Ease.outCubic(B.k) * 90, groundY, 2.4, fr, {
      tone: 'purple0', eye: 'red2', rim: 'pink',
    });
    shockRing(g, 380, 250, B.k, 'white');
    dust(g, 340, groundY - 20, B.k, 'grey1');
    debris(g, 380, 240, B.k, 22, 5, 'grey0');
  }
  if (B.kind === 'charge') {
    const fr = Math.floor(t * 10) % 6;
    const ex = lerp(240, 470, Ease.outCubic(B.k));
    speedLines(g, ex - 120, groundY - 90, 11, 90, Math.PI, mix(P.foam, P.night, 0.6), 150);
    dust(g, ex - 90, groundY - 6, 0.4 + (fr % 3) * 0.2, 'grey1');
    drawElephant(g, ex, groundY, 2.4, fr, {
      tone: 'purple0', eye: 'red2', rim: 'pink', trunk: 'raise',
    });
    debris(g, 420, 240, 0.6 + B.k * 0.4, 14, 5, 'grey0');
  }

  // him, at the right, and he does not run until the wall is actually gone
  const hx = gone ? lerp(760, 880, Ease.outCubic(B.kind === 'charge' ? B.k : 0)) : 780;
  drawFigure(g, hx, groundY + 30, 1.7, gone ? Math.floor(t * 12) % 6 : 1, {
    run: gone, wide: true, cloth: 'parch0',
  });
  if (B.kind === 'wait') {
    // the hold: nothing but a lantern swinging and the sound you cannot hear
    const sw = Math.sin(t * 2.2) * 10;
    rect(g, 620 + sw, 40, 3, 90, 'wood1');
    rect(g, 606 + sw, 128, 30, 34, 'ink');
    rect(g, 610 + sw, 132, 22, 26, 'brass1');
    rect(g, 614 + sw, 136, 14, 18, 'gold');
    for (let i = 0; i < 4; i++) {
      wash(g, 560 + sw - i * 14, 120 - i * 8, 130 + i * 28, 120 + i * 30, 'gold', 0.05);
    }
  }
  vignette(g, 0.4);
}

/**
 * SHOT THREE. The sky, and the thing in it.
 *
 * A LOW ANGLE, which is a camera decision and not a drawing one: the rooftops are at the
 * bottom of the frame and everything above them is weather, so the eagle has somewhere to
 * come FROM. Four-frame wingbeat, and the dive is one long move with the talons out for the
 * last third -- a bird that has its feet out the whole way is a bird that is not diving.
 */
function chaosEagle(g, u, t) {
  // sky in hard bands, brightest at the bottom, so the birds read as dark against it
  for (let y = 0; y < H; y++) {
    const f = y / H;
    rect(g, 0, y, W, 1, mix(P.night, P.purple1, Math.pow(f, 1.5) * 0.8));
  }
  for (let i = 0; i < 5; i++) {
    const y = 60 + i * 54;
    for (let x = 0; x < W; x += 6) {
      rect(g, x, y + Math.round(Math.sin(x * 0.011 + i * 1.4 + t * 0.2) * 9), 6, 8,
        mix(P.purple0, P.night, 0.4 + i * 0.1));
    }
  }
  // one break in the cloud, with light coming through it
  // cineRays, not FX.rays: the two have different signatures and the FX one silently read
  // the wall-clock as its ray COUNT, which drew between nought and several hundred of them
  cineRays(g, 700, -40, t, 5, 'brass2');

  // the rooftops, along the bottom, in flat silhouette
  const roofY = H - 96;
  for (let i = -1; i < 9; i++) {
    const bx = -40 + i * 128;
    const bh = 40 + ((i * 37) % 4) * 22;
    rect(g, bx, roofY - bh, 120, bh + 100, 'ink');
    tri(g, bx - 8, roofY - bh, bx + 128, roofY - bh, bx + 60, roofY - bh - 30, 'ink');
    if (i % 3 === 0) rect(g, bx + 84, roofY - bh - 46, 16, 50, 'ink');
  }

  // three more of them, wheeling, at their own rates
  for (let i = 0; i < 3; i++) {
    const a = t * (0.5 + i * 0.2) + i * 2.1;
    drawBird(g, 200 + i * 250 + Math.cos(a) * 90, 120 + Math.sin(a) * 40 + i * 24,
      0.7, Math.floor(t * (7 + i)) % 4, { tone: 'night', lite: 'purple0' });
  }

  // THE DIVE. One move, and the talons only come out at the end of it.
  const dk = Ease.inQuad(clamp((u - 0.18) / 0.72, 0, 1));
  const bx = lerp(880, 300, dk);
  const by = lerp(70, roofY - 40, dk * dk);
  const fr = dk > 0.4 ? 2 : Math.floor(t * 11) % 4;
  if (dk > 0.3) {
    speedLines(g, bx + 60, by - 40, 10, 120, Math.atan2(by - 70, bx - 880) + Math.PI,
      mix(P.foam, P.purple0, 0.5), 90);
  }
  drawBird(g, bx, by, 3.1, fr, {
    tone: 'ink', lite: 'grey0', talons: dk > 0.62, flip: true, span: 58,
  });


  // him, below, arms up, and he is small on purpose
  drawFigure(g, 250, roofY + 52, 2, 4, { run: false, wide: true, cloth: 'parch0' });
  rainSheets(g, t, 0.8, 0.3);
  vignette(g, 0.45);
}

/**
 * SHOT FOUR. Down, and the light going.
 *
 * The whole shot is one shape closing: a slit of grey sky at the top of a stair, narrowing to
 * nothing. He goes down it on a walk cycle and the hatch comes over.
 */
function chaosCellar(g, u, t) {
  rect(g, 0, 0, W, H, 'ink');
  // the stair, in perspective, going down and away
  const steps = 9;
  for (let i = 0; i < steps; i++) {
    const f = i / (steps - 1);
    const wide = lerp(560, 200, f);
    const y = lerp(H - 40, 150, f);
    const dep = lerp(30, 12, f);
    inked(g, W / 2 - wide / 2, y, wide, dep, mix(P.wood0, P.ink, 0.2 + f * 0.4),
      mix(P.wood1, P.ink, 0.2 + f * 0.4));
  }
  // the walls either side, closing in
  for (const sgn of [-1, 1]) {
    for (let i = 0; i < 7; i++) {
      const f = i / 6;
      const x = W / 2 + sgn * lerp(300, 108, f);
      const y = lerp(H, 130, f);
      tri(g, x, y, x + sgn * 200, y, x, y - 160, mix(P.wood0, P.ink, 0.5 + f * 0.4));
    }
  }
  // THE SLIT. It is the subject of the shot: everything else is what is left when it goes.
  const close = Ease.inCubic(clamp((u - 0.25) / 0.6, 0, 1));
  const slit = Math.max(0, 96 * (1 - close));
  if (slit > 0) {
    rect(g, W / 2 - 120, 108, 240, slit, mix(P.grey1, P.purple0, 0.4));
    rect(g, W / 2 - 120, 108, 240, Math.min(slit, 6), 'grey2');
    for (let i = 0; i < 4; i++) {
      wash(g, W / 2 - 200 - i * 30, 108, 400 + i * 60, slit + 60 + i * 40, 'grey2', 0.045);
    }
    // rain still coming in through it, for as long as there is an it
    for (let i = 0; i < 14; i++) {
      const rx = W / 2 - 110 + ((i * 47) % 220);
      rect(g, rx, 108 + ((t * 300 + i * 37) % Math.max(1, slit + 40)), 2, 10, 'foam');
    }
  }
  // the hatch coming over the top of it
  rect(g, W / 2 - 130, 108 - 30 + slit, 260, 34, 'ink');
  rect(g, W / 2 - 124, 114 - 30 + slit, 248, 22, 'wood1');
  rect(g, W / 2 - 124, 114 - 30 + slit, 248, 5, 'wood2');

  // him, going down, back to us
  const dy = lerp(190, H - 70, Ease.inOutCubic(clamp(u / 0.7, 0, 1)));
  const sc = lerp(1.1, 1.8, clamp(u / 0.7, 0, 1));
  drawFigure(g, W / 2 + 10, dy, sc, Math.floor(t * 7) % 6, {
    run: true, cloth: 'parch0', mouth: false,
  });
  // and the dark closing from the edges, which is the shot ending itself
  vignette(g, 0.5 + close * 0.45);
  if (close > 0.98) wash(g, 0, 0, W, H, 'ink', (close - 0.98) / 0.02);
}

export const CHAOS = {
  id: 'chaos',
  dur: 20,
  shots: [
    {
      at: 0.00, id: 'street', label: 'THE ANIMALS TURNED FIRST', draw: chaosStreet,
      // the camera tracks him: it starts behind and ends ahead, so he is never at the edge
      cam: [
        { at: 0, x: -120, zoom: 1.05 },
        { at: 1, x: 150, zoom: 1.1, ease: 'linear' },
      ],
    },
    {
      at: 0.26, id: 'wall', label: 'AND THEN THE WALLS CAME IN', draw: chaosElephant,
      // nothing, nothing, SNAP IN on the hit, then pull back as it charges
      cam: [
        { at: 0, x: 60, zoom: 1 },
        { at: 0.5, x: 60, zoom: 1, ease: 'linear' },
        { at: 0.56, x: -30, zoom: 1.5, ease: 'snap' },
        { at: 1, x: 40, zoom: 1.05, ease: 'out' },
      ],
      hits: [[0.52, 16, 'white'], [0.63, 7, null], [0.78, 5, null]],
    },
    {
      at: 0.56, id: 'sky', label: 'THE SKY HAD TEETH IN IT', draw: chaosEagle,
      // a whip up to the sky, then the camera falls with the dive
      cam: [
        { at: 0, y: 130, zoom: 1.15 },
        { at: 0.16, y: -60, zoom: 1.1, ease: 'whip' },
        { at: 0.9, y: 90, zoom: 1.2, ease: 'in' },
        { at: 1, y: 90, zoom: 1.2 },
      ],
      hits: [[0.9, 9, null]],
    },
    {
      at: 0.80, id: 'cellar', label: 'HE WENT DOWN INTO THE DARK', draw: chaosCellar,
      cam: [
        { at: 0, y: -40, zoom: 1 },
        { at: 1, y: 20, zoom: 1.2, ease: 'inout' },
      ],
      hits: [[0.86, 6, null]],
    },
  ],
};

/* ------------------------------------------------------------------ PASSING */

/**
 * A STONE FLOOR IN PERSPECTIVE, which is the only way a floor is not a wall.
 *
 * The first cut of this drew a grid of even courses, and an even grid seen head-on is
 * brickwork: the shot read as a man lying against a wall. Rows that get TALLER as they come
 * at you, and stones that get WIDER with them, is the whole difference.
 */
function flagstones(g, top, lightX, hgt0 = 84) {
  let y = top, hgt = hgt0, row = 0;
  while (y < H) {
    const wid = hgt * 2.4;
    for (let x = -wid; x < W + wid; x += wid) {
      const sx = x + (row % 2) * wid * 0.5;
      const f = 1 - Math.min(1, Math.abs(sx + wid / 2 - lightX) / (W * 0.7));
      rect(g, sx, y, wid, hgt, mix(P.stone0, P.ink, 0.62 - f * 0.34));
      rect(g, sx, y, wid, Math.max(2, hgt * 0.12), mix(P.stone1, P.ink, 0.5 - f * 0.32));
      rect(g, sx, y + hgt - 2, wid, 2, 'ink');
      rect(g, sx, y, 2, hgt, 'ink');
      // wear: a chipped corner every so often, because an even floor is a tiled bathroom
      if ((row * 7 + Math.round(sx / wid) * 13) % 5 === 0) {
        rect(g, sx + wid - 22, y + hgt - 16, 22, 14, 'ink');
      }
      // and a scatter of grit, so a slab is a surface and not a swatch
      for (let j = 0; j < 5; j++) {
        const gx = sx + ((j * 53 + row * 29) % (wid - 12)) + 6;
        const gy2 = y + ((j * 31 + row * 17) % (hgt - 10)) + 5;
        rect(g, gx, gy2, 3, 3, mix(P.stone1, P.ink, 0.44 - f * 0.2));
      }
    }
    y += hgt; hgt *= 1.3; row++;
  }
}

/**
 * A HAND, PALM UP, SEEN FROM ABOVE, with the fingers uncurling.
 *
 * `open` is 0 (closed round the staff) to 1 (open and empty). Four fingers off the palm, each
 * on its own spread angle with a knuckle where it bends, and a thumb across the top. The first
 * version drew the palm as one rectangle with four smaller rectangles overlapping it, which
 * read as a plank with splinters -- what makes a hand read is the INK BETWEEN THE FINGERS and
 * the fact that they are not all the same length.
 */
function palmUp(g, x, y, s, open) {
  const skin = P.skin2;
  const lit = mix(P.skin2, P.skin4, 0.5);
  const dark = mix(P.skin2, P.skin0, 0.42);
  const PW = 58 * s, PH = 46 * s;
  // THE PALM, as a silhouette first: a rect with four discs at its corners, drawn once in ink
  // two pixels bigger and once in skin. One enclosing outline is what makes a hand a hand
  // rather than a pile of parts, and it is why the ink pass comes before every fill.
  const shape = (pad, c) => {
    rect(g, x - PW / 2 - pad, y - PH / 2 - pad, PW + pad * 2, PH + pad * 2, c);
    for (const sx2 of [-1, 1]) for (const sy2 of [-1, 1]) {
      disc(g, x + sx2 * (PW / 2 - 9 * s), y + sy2 * (PH / 2 - 9 * s), 9 * s + pad, c);
    }
  };
  // FINGERS. Base on the palm's left edge, pointing away, index and little shorter than the
  // middle two -- four the same length is a rake, and that is exactly how it read.
  const fs = [[-0.34, 40, 10], [-0.11, 50, 11], [0.12, 48, 11], [0.35, 38, 10]];
  const geo = fs.map(([off, len, th], i) => {
    const own = Ease.outCubic(clamp((open - i * 0.07) / 0.7, 0, 1));
    const L = len * (0.42 + own * 0.58) * s;
    const bx = x - PW / 2 + 4 * s, by = y + off * PH;
    const a = off * 0.55 - (1 - own) * 0.42;
    const mx = bx - Math.cos(a) * L * 0.56, my = by + Math.sin(a) * L * 0.56;
    const a2 = a + (1 - own) * 1.0;
    return { bx, by, mx, my, tx: mx - Math.cos(a2) * L * 0.46, ty: my + Math.sin(a2) * L * 0.46,
      th: th * s, own };
  });
  // the thumb, low and across, and it is the last thing to let go
  const tk = Ease.outCubic(clamp(open / 0.8, 0, 1));
  const t0x = x - PW * 0.22, t0y = y + PH / 2 - 4 * s;
  const t1x = t0x - 20 * s - tk * 10 * s, t1y = t0y + 22 * s + tk * 8 * s;
  const t2x = t1x - 24 * s - tk * 12 * s, t2y = t1y + 10 * s - tk * 10 * s;

  // ink pass
  for (const f of geo) {
    limbLine(g, f.bx, f.by, f.mx, f.my, f.th + 3, 'ink', 'ink');
    limbLine(g, f.mx, f.my, f.tx, f.ty, f.th + 1, 'ink', 'ink');
  }
  limbLine(g, t0x, t0y, t1x, t1y, 17 * s, 'ink', 'ink');
  limbLine(g, t1x, t1y, t2x, t2y, 14 * s, 'ink', 'ink');
  shape(3, 'ink');
  // fill pass
  limbLine(g, t0x, t0y, t1x, t1y, 14 * s, skin);
  limbLine(g, t1x, t1y, t2x, t2y, 11 * s, lit);
  disc(g, t2x, t2y, 6 * s, lit);
  shape(0, skin);
  geo.forEach((f, i) => {
    limbLine(g, f.bx, f.by, f.mx, f.my, f.th, i % 2 ? skin : mix(P.skin2, P.skin3, 0.4));
    limbLine(g, f.mx, f.my, f.tx, f.ty, f.th - 2, lit);
    // the pad of the fingertip, and a knuckle crease where it bends
    disc(g, f.tx, f.ty, (f.th - 2) / 2, mix(P.skin3, P.skin4, 0.5));
    rect(g, f.mx - 2 * s, f.my - f.th / 2, 3 * s, f.th, dark);
  });
  // the hollow of the palm, the lit heel, and two creases across it. The hollow is a SHADE
  // and not a hole: at full contrast it read as a coin sitting in his hand.
  ellipse(g, x - 8 * s, y + 3 * s, PW * 0.3, PH * 0.26, mix(P.skin2, P.skin0, 0.22));
  ellipse(g, x - 10 * s, y + 4 * s, PW * 0.2, PH * 0.16, mix(P.skin2, P.skin0, 0.34));
  // the heel, lit down its rounded edge rather than as a bar stuck on the side
  for (let i = -1; i <= 1; i++) {
    disc(g, x + PW / 2 - 9 * s, y + i * (PH / 2 - 9 * s), 9 * s, lit);
  }
  rect(g, x + PW / 2 - 12 * s, y - PH / 2 + 8 * s, 8 * s, PH - 16 * s, lit);
  limbLine(g, x - PW * 0.3, y - PH * 0.24, x + PW * 0.16, y - PH * 0.3, 2, dark, dark);
  limbLine(g, x - PW * 0.26, y + PH * 0.16, x + PW * 0.2, y + PH * 0.24, 2, dark, dark);
}

/**
 * SHOT 1 -- the floor. A hand, a staff, and a lantern doing its best.
 *
 * THE HAND IS THE ANIMATION. It starts closed round the staff, and over the middle beat the
 * fingers uncurl one after another -- not all at once, which would read as a switch -- and
 * the staff rolls out of it and knocks against the flagstones. That is the death, and there
 * is no dialogue box in front of it. The lantern flickers on the frame clock rather than on a
 * sine, so the light steps the way firelight does.
 */
function passHand(g, u, t) {
  const B = beat(u, [[0, 'grip'], [0.4, 'let'], [0.62, 'still']]);
  rect(g, 0, 0, W, H, 'ink');
  flagstones(g, 40, 760, 96);
  // THE LANTERN LIGHT, in steps. Six poses of brightness on a loop is firelight; a sine at
  // sixty frames a second is a dimmer switch being stroked.
  const fl = [1, 0.82, 0.94, 0.7, 1, 0.88][onTwos(t, 9) % 6];
  for (let i = 0; i < 4; i++) {
    wash(g, 470 + i * 30, 150 + i * 30, 520 - i * 40, 400 - i * 60, i < 2 ? 'brass1' : 'gold',
      0.07 * fl);
  }

  // THE STAFF. Gripped, then rolling away, then still and out of reach -- and it knocks.
  const roll = B.kind === 'grip' ? 0 : B.kind === 'let' ? Ease.outCubic(B.k) : 1;
  const sy = 402 + roll * 120;
  const s0x = 70 - roll * 50, s0y = sy + 70, s1x = 700 - roll * 30, s1y = sy - 76;
  limbLine(g, s0x, s0y, s1x, s1y, 22, 'wood1');
  limbLine(g, s0x, s0y - 6, s1x, s1y - 6, 5, 'wood3', 'wood3');
  limbLine(g, s0x, s0y + 6, s1x, s1y + 6, 4, 'wood0', 'wood0');
  disc(g, s1x, s1y, 22, 'ink');
  disc(g, s1x, s1y, 18, 'wood2');                     // the knob at the top of it
  disc(g, s1x - 5, s1y - 5, 8, 'wood3');
  // the grip binding, which is where his hand was
  const bx0 = lerp(s0x, s1x, 0.42), by0 = lerp(s0y, s1y, 0.42);
  limbLine(g, bx0 - 30, by0 + 8, bx0 + 30, by0 - 8, 32, mix(P.wood0, P.ink, 0.25));
  if (roll > 0 && roll < 1) dust(g, 320, sy + 40, roll, 'stone1');

  // THE HAND, and the arm it is on.
  const open = B.kind === 'grip' ? 0 : B.kind === 'still' ? 1 : B.k;
  const hy = 380 + Math.sin(t * 1.1) * 2;
  // the sleeve, coming in from the right and foreshortened
  rect(g, 500, hy - 70, W - 490, 156, 'ink');
  for (let i = 0; i < 146; i++) {
    // shaded across its width, so it is a round arm in a sleeve and not a board
    const f = i / 146;
    const c = f < 0.16 ? mix(P.parch1, P.white, 0.2) : f < 0.44 ? P.parch1
      : mix(P.parch0, P.ink, (f - 0.44) * 0.8);
    rect(g, 504, hy - 65 + i, W - 494, 1, c);
  }
  // folds, angled, converging away up the arm
  for (let i = 0; i < 6; i++) {
    const fx = 560 + i * 78;
    limbLine(g, fx, hy - 62, fx + 22, hy + 56, 4, mix(P.parch0, P.ink, 0.32),
      mix(P.parch0, P.ink, 0.4));
  }
  // the cuff, and a frayed edge on it, because he had spent what he had
  rect(g, 492, hy - 78, 40, 172, 'ink');
  rect(g, 496, hy - 72, 32, 160, 'parch');
  rect(g, 496, hy - 72, 32, 16, 'cream');
  rect(g, 496, hy + 74, 32, 14, mix(P.parch, P.ink, 0.4));
  for (let i = 0; i < 9; i++) rect(g, 486, hy - 62 + i * 18, 10, 7, mix(P.parch, P.ink, 0.15));
  palmUp(g, 372, hy, 2.7, open);
  // and what is under it, spreading, all the way through the shot
  for (let i = 0; i < 8; i++) {
    const bw = 46 + h(i * 13) * 40 + u * 30;
    const bx1 = 230 + i * 52, by1 = hy + 100 + (i % 3) * 16;
    ellipse(g, bx1, by1, bw, 14 + h(i * 7) * 8 + u * 6, mix(P.red0, P.ink, 0.35));
    ellipse(g, bx1, by1 - 2, bw - 8, 10 + h(i * 7) * 6 + u * 5, 'red0');
    // and one gleam on it, because it is wet
    if (i % 3 === 1) rect(g, bx1 - 10, by1 - 8, 22, 4, mix(P.red1, P.ink, 0.2));
  }
  // a few drops thrown out further than the pool, which is what makes it read as spilled
  for (let i = 0; i < 9; i++) {
    disc(g, 200 + h(i * 31) * 460, hy + 60 + h(i * 17) * 120, 4 + h(i * 5) * 5,
      mix(P.red0, P.ink, 0.25));
  }
  vignette(g, 0.45);
  wash(g, 0, 0, W, H, 'ink', 0.22 - u * 0.06);
}

/**
 * A FLAME. A teardrop with a hot core, and its width comes from a PROFILE rather than from a
 * straight taper -- a triangle with a flat bottom is a traffic cone, which is precisely what
 * the first version of this looked like. Widest a third of the way up, tucked at the wick,
 * pointed at the tip, with the white core INSIDE it and not underneath it.
 */
function flame(g, cx, base, hgt, wide, wob) {
  for (let i = 0; i < hgt; i++) {
    const f = i / hgt;                                    // 0 at the wick, 1 at the tip
    const prof = Math.sqrt(Math.max(0, 1 - Math.pow((f - 0.3) / 0.72, 2)));
    const tuck = Math.min(1, 0.4 + f * 5);
    const w = wide * prof * tuck + (f > 0.5 ? wob * (f - 0.5) * 2 : 0);
    if (w < 1) continue;
    const y = base - i;
    rect(g, cx - w, y, w * 2, 1, 'orange');
    if (w > 3) rect(g, cx - w * 0.72, y, w * 1.44, 1, 'gold');
    if (f > 0.06 && f < 0.62 && w > 6) {
      const cw = w * 0.4 * (1 - Math.abs(f - 0.3) / 0.4);
      if (cw > 0.8) rect(g, cx - cw, y, cw * 2, 1, 'white');
    }
  }
}

/**
 * SHOT 2 -- the flame, going. Everything in the frame is one small light.
 *
 * FOUR BEATS AND A FLARE. It burns, it FLARES -- the last of the oil, brighter than it has
 * been all shot, which is the comic-timing trick of giving hope a frame before taking it --
 * then it is out in ONE frame rather than fading, and then there is a wick, a curl of smoke,
 * and the shape of a cage you can only just see. The flicker is a table of widths on the
 * frame clock; a flame interpolated smoothly is a lava lamp.
 */
function passLantern(g, u, t) {
  const B = beat(u, [[0, 'burn'], [0.42, 'flare'], [0.56, 'out'], [0.64, 'dark']]);
  rect(g, 0, 0, W, H, 'ink');
  const cx = W / 2, cy = 300;
  const lit = B.kind === 'burn' || B.kind === 'flare';
  const flare = B.kind === 'flare' ? 1 + Ease.outCubic(B.k) * 0.85 : 1;
  const step = [1, 0.84, 0.96, 0.78, 1.04, 0.9][onTwos(t, 10) % 6];
  const size = lit ? (B.kind === 'burn' ? 0.82 + 0.18 * step : flare * step) : 0;

  // the cellar behind it, so the light has something to fall on
  for (let i = 0; i < 9; i++) {
    rect(g, i * 110, 90, 100, H - 90, mix(P.stone0, P.ink, 0.72 + (i % 3) * 0.06));
    rect(g, i * 110, 90, 100, 5, mix(P.stone1, P.ink, 0.7));
  }
  rect(g, 0, 470, W, H - 470, mix(P.stone0, P.ink, 0.8));
  rect(g, 0, 466, W, 5, mix(P.stone1, P.ink, 0.72));
  // the glow BEHIND the cage, so the cage is a silhouette in its own light
  if (size > 0.02) {
    for (let i = 6; i > 0; i--) {
      wash(g, cx - 100 - i * 46, cy - 170 - i * 38, 200 + i * 92, 300 + i * 76,
        i > 3 ? 'brass1' : 'gold', 0.045 * size);
    }
  }

  // THE LANTERN. A top plate with vents, four corner posts, glass in between, a base, and a
  // bail handle -- and the glass gets a highlight down one pane, which is the whole read.
  const gx = cx - 96, gw = 192, gy = cy - 150, gh = 270;
  rect(g, gx - 8, gy - 6, gw + 16, gh + 12, 'ink');
  rect(g, gx, gy, gw, gh, mix(P.wood0, P.ink, 0.55));
  if (size > 0.02) {
    // the light in the glass, in three hard rings
    for (let i = 4; i > 0; i--) {
      ellipse(g, cx, cy, (26 + i * 24) * size, (30 + i * 26) * size,
        mix(P.gold, P.ink, 0.6 + i * 0.08));
    }
  }
  // the panes: mullions, and a highlight down the left one
  for (let i = 1; i < 3; i++) rect(g, gx + i * (gw / 3) - 3, gy, 6, gh, 'ink');
  wash(g, gx + 8, gy, gw / 3 - 16, gh, 'foam', size > 0.02 ? 0.12 : 0.04);
  rect(g, gx + 14, gy + 10, 5, gh - 30, mix(P.foam, P.wood0, 0.5));
  // the frame over the top of the glass
  rect(g, cx - 124, cy - 190, 248, 40, 'ink');
  rect(g, cx - 118, cy - 185, 236, 30, 'brass0');
  rect(g, cx - 118, cy - 185, 236, 7, 'brass1');
  for (let i = 0; i < 7; i++) rect(g, cx - 92 + i * 30, cy - 172, 16, 10, 'ink');
  rect(g, cx - 118, cy + 120, 236, 42, 'ink');
  rect(g, cx - 112, cy + 125, 224, 32, 'brass0');
  rect(g, cx - 112, cy + 125, 224, 7, 'brass1');
  for (const side of [-1, 1]) {
    rect(g, cx + side * 98 - 12, gy - 6, 24, gh + 12, 'ink');
    rect(g, cx + side * 98 - 9, gy - 4, 18, gh + 8, 'brass0');
    rect(g, cx + side * 98 - 9, gy - 4, 6, gh + 8, 'brass1');
  }
  // the bail, an arc, and the hook it is on
  for (let a = -1.25; a <= 1.25; a += 0.06) {
    rect(g, cx + Math.sin(a) * 74, cy - 196 - Math.cos(a) * 52, 6, 6, 'brass0');
  }
  rect(g, cx - 6, 40, 12, 60, 'ink');
  rect(g, cx - 4, 40, 8, 56, 'grey0');

  if (size > 0.02) {
    const wob = [0, 2, -1, 3, -2, 1][onTwos(t, 12) % 6];
    flame(g, cx, cy + 44 * size, 104 * size, 26 * size, wob);
    // the wick, visible through the flame's base
    rect(g, cx - 4, cy + 42 * size, 8, 16, mix(P.ink, P.red0, 0.5));
    rays(g, cx, cy, 8, 300 * size, 3.0, 'gold', 0.13 * size, t);
    if (B.kind === 'flare') {
      wash(g, 0, 0, W, H, 'brass1', 0.055 * Ease.outCubic(B.k));
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        rect(g, cx + Math.cos(a) * (110 + B.k * 90), cy + Math.sin(a) * (90 + B.k * 70),
          6, 6, i % 2 ? 'gold' : 'white');
      }
    }
  } else {
    // AFTER. A red thread of wick, and smoke coming off it in steps, going up and OVER.
    rect(g, cx - 5, cy + 34, 10, 22, 'ink');
    rect(g, cx - 3, cy + 36, 6, 16, B.kind === 'out' ? 'red2' : 'red0');
    const sm = onThrees(t);
    for (let i = 0; i < 8; i++) {
      const k = ((sm + i * 2) % 16) / 16;
      const s = 3 + i * 2;
      disc(g, cx + Math.round(Math.sin((sm + i) * 0.55) * (5 + i * 5)) + i * 3,
        cy + 26 - k * 200 - i * 14, s, mix(P.grey0, P.ink, 0.4 + k * 0.4));
    }
    if (B.kind === 'out') shockRing(g, cx, cy, B.k, 'brass2');
  }
  vignette(g, 0.5);
  wash(g, 0, 0, W, H, 'ink', lit ? 0.08 : 0.26 + B.k * 0.2);
}

/**
 * SHOT 3 -- what stood up. A soul is a shape with a light in it and no weight.
 *
 * THE SAME RIG, DRAWN IN LIGHT, and it does not have feet. The soul is the biped from the cine
 * kit with every tone set to ice, doubled one pixel out at lower alpha so the edge glows, and
 * with the legs painted over by a wisp that tapers into nothing -- which is the difference
 * between a ghost and a man in a sheet. Underneath it, the body it came out of, drawn as a
 * body: a shoulder, an arm thrown out, and the hat where it fell.
 */
function passSoul(g, u, t) {
  rect(g, 0, 0, W, H, 'ink');
  const k = Ease.outCubic(clamp(u * 1.15, 0, 1));
  // the cellar: a floor, a skirting, and a stair going up out of frame
  rect(g, 0, 430, W, H - 430, mix(P.stone0, P.ink, 0.7));
  rect(g, 0, 426, W, 6, mix(P.stone1, P.ink, 0.6));
  for (let i = 0; i < 7; i++) {
    rect(g, W - 300 + i * 34, 430 - i * 36, 300, 14, mix(P.wood0, P.ink, 0.45));
    rect(g, W - 300 + i * 34, 430 - i * 36, 300, 4, mix(P.wood1, P.ink, 0.5));
  }

  // HIM, ON THE FLOOR, and he is a body rather than a plank: knees up, one arm thrown out,
  // the head turned away from us.
  const bx = 300, by = 428;
  limbLine(g, bx - 90, by - 10, bx + 40, by - 16, 44, mix(P.parch0, P.ink, 0.5));  // torso
  limbLine(g, bx + 40, by - 16, bx + 130, by - 6, 34, mix(P.parch0, P.ink, 0.58)); // hips
  limbLine(g, bx + 130, by - 6, bx + 186, by - 40, 20, mix(P.parch0, P.ink, 0.6)); // thigh up
  limbLine(g, bx + 186, by - 40, bx + 220, by - 2, 16, mix(P.parch0, P.ink, 0.64));
  limbLine(g, bx + 128, by + 2, bx + 214, by + 6, 18, mix(P.parch0, P.ink, 0.66));  // the other
  limbLine(g, bx - 60, by - 22, bx - 130, by + 4, 16, mix(P.skin1, P.ink, 0.5));    // arm out
  disc(g, bx - 150, by + 6, 14, 'ink');
  disc(g, bx - 150, by + 6, 11, mix(P.skin1, P.ink, 0.45));                          // his hand
  disc(g, bx - 104, by - 26, 26, 'ink');
  disc(g, bx - 104, by - 26, 23, mix(P.sand, P.ink, 0.5));                           // his head
  rect(g, bx - 120, by - 40, 40, 12, mix(P.wood1, P.ink, 0.55));                     // grey hair
  rect(g, bx - 240, by - 10, 84, 14, 'ink');
  rect(g, bx - 238, by - 8, 80, 10, mix(P.wood1, P.ink, 0.5));                        // the hat

  // THE SOUL, rising out of it.
  const sy = 400 - k * 210;
  const a = 0.3 + 0.42 * k + 0.08 * Math.sin(t * 3);
  const sx = 300;
  const prev = g.globalAlpha;
  const fr = onTwos(t, 4) % 6;
  g.globalAlpha = a * 0.6;
  drawFigure(g, sx, sy + 3, 2.4, fr, {
    run: false, cloth: 'ice', skin: 'foam', hair: 'ice', mouth: false,
  });
  g.globalAlpha = Math.min(1, a * 1.6);
  const r = drawFigure(g, sx, sy, 2.4, fr, {
    run: false, cloth: 'ice', skin: 'white', hair: 'ice', mouth: false,
  });
  // the hat he keeps, on his head this time. He would.
  rect(g, r.hx - 24, r.hy - 13, 48, 8, 'ice');
  rect(g, r.hx - 14, r.hy - 24, 28, 12, 'ice');
  // two dark eyes and a beard, so there is a face in the light
  rect(g, r.hx - 8, r.hy + 4, 5, 5, mix(P.water0, P.ice, 0.35));
  rect(g, r.hx + 5, r.hy + 4, 5, 5, mix(P.water0, P.ice, 0.35));
  rect(g, r.hx - 10, r.hy + 15, 22, 12, mix(P.foam, P.water1, 0.22));
  // AND NO FEET. A wisp over the legs, tapering, each row fainter than the one above it.
  for (let i = 0; i < 44; i++) {
    const f = i / 44;
    g.globalAlpha = Math.min(1, a * 1.5) * (1 - f) * (1 - f);
    const w = 26 - f * 22 + Math.sin(t * 4 + i * 0.3) * 3;
    rect(g, sx - w, sy - 34 + i * 2, w * 2, 2, f < 0.4 ? 'ice' : 'foam');
  }
  g.globalAlpha = prev;
  rays(g, sx, sy - 60, 10, 240, 2.6, 'ice', 0.055 * k, t * 0.6);
  // motes coming off it and going up, on the frame clock so they climb in steps
  const mt = onThrees(t);
  for (let i = 0; i < 24; i++) {
    const mk = (((mt + i * 3) % 40) / 40 + h(i)) % 1;
    const mx = sx + (h(i * 3) - 0.5) * 170;
    const my = sy + 90 - mk * 330;
    const s = mk > 0.7 ? 5 : 8;
    rect(g, mx, my, s, s, mk > 0.6 ? 'white' : 'ice');
  }
  // and the light he is casting on the floor, which is how you know he is really there
  wash(g, sx - 190, 384, 380, 66, 'ice', 0.06 + k * 0.08);
  vignette(g, 0.5);
  wash(g, 0, 0, W, H, 'ink', 0.32 - k * 0.22);
}

export const PASSING = {
  id: 'passing',
  dur: 11,
  shots: [
    {
      at: 0.00, id: 'hand', label: 'HE HAD ALREADY SPENT WHAT HE HAD', draw: passHand,
      // a slow push in on the hand, and it flinches when the staff comes down
      cam: [
        { at: 0, x: -30, y: 20, zoom: 1.02 },
        { at: 0.55, x: -10, y: 34, zoom: 1.12, ease: 'linear' },
        { at: 1, x: 0, y: 38, zoom: 1.18, ease: 'out' },
      ],
      hits: [[0.68, 7, null]],
    },
    {
      at: 0.38, id: 'lantern', label: 'AND THEN THE LANTERN WENT OUT', draw: passLantern,
      // in on the flame, one hard flash on the flare, then it pulls back off the dark
      cam: [
        { at: 0, zoom: 1.05, y: 10 },
        { at: 0.42, zoom: 1.22, y: 20, ease: 'linear' },
        { at: 0.56, zoom: 1.3, y: 20, ease: 'snap' },
        { at: 1, zoom: 1, y: 0, ease: 'out' },
      ],
      hits: [[0.42, 5, 'gold'], [0.56, 9, null]],
    },
    {
      at: 0.70, id: 'soul', label: 'WHAT WAS LEFT OF HIM STOOD UP ANYWAY', draw: passSoul,
      // a tilt up, following him, opening out as it goes
      cam: [
        { at: 0, y: 60, zoom: 1.18 },
        { at: 1, y: -40, zoom: 1.02, ease: 'inout' },
      ],
    },
  ],
};

/* ------------------------------------------------------------------ SETSAIL */

/**
 * SHOT 1 -- the water takes the last of the street, and you run for the ramp.
 *
 * A CRANE UP THE HULL, which is the only way a ship reads as big: the shot starts on the water
 * coming up the cobbles and ends on the masthead, so the audience measures the boat by how long
 * the camera takes to get to the top of it.
 *
 * WHICH MEANS THE SHOT HAS TO BE TALLER THAN THE FRAME. The first cut of this laid the boat out
 * inside 0..540 and then craned two hundred pixels, so a third of every frame was the black
 * outside the drawing -- a camera move over a picture the size of the screen is a camera move
 * over nothing. Everything here is placed in a world running from about -360 (the masthead) to
 * 700 (the near water), and the camera lives inside that.
 */
function sailStreet(g, u, t) {
  const bx = 540, deck = 110, keel = 430;
  // the sky, all the way up past the masthead
  for (let y = -400; y < keel; y++) {
    const f = (y + 400) / (keel + 400);
    rect(g, 0, y, W, 1, mix(P.night, P.rust, Math.pow(f, 1.6) * 0.9));
  }
  // the town behind, drowning: roofs only, and the far ones already half under
  for (let i = -1; i < 9; i++) {
    const hx = -60 + i * 132;
    const hh = 70 + ((i * 41) % 4) * 30;
    rect(g, hx, keel - hh, 116, hh, 'ink');
    rect(g, hx + 4, keel - hh + 4, 108, hh, mix(P.wood0, P.night, 0.5));
    tri(g, hx - 10, keel - hh, hx + 126, keel - hh, hx + 58, keel - hh - 34, 'ink');
    tri(g, hx - 4, keel - hh - 3, hx + 120, keel - hh - 3, hx + 58, keel - hh - 28,
      mix(P.rust, P.night, 0.55));
    if (i % 3 === 0) {
      rect(g, hx + 80, keel - hh - 44, 18, 48, 'ink');
      rect(g, hx + 83, keel - hh - 41, 12, 44, mix(P.wood0, P.night, 0.4));
    }
  }
  // the street: cobbles in courses that widen as they come at us
  let cy = keel, ch = 10;
  while (cy < 720) {
    for (let x = -40; x < W + 40; x += ch * 3) {
      rect(g, x + ((cy / 10 | 0) % 2) * ch * 1.5, cy, ch * 3 - 3, ch - 2,
        mix(P.stone0, P.ink, 0.4 + (ch > 20 ? 0.1 : 0)));
    }
    cy += ch; ch *= 1.22;
  }

  // THE ARK. Hull, deck, house, mast, yard -- and the mast runs up out of the top of the world.
  rect(g, bx - 306, deck - 8, 612, 16, 'ink');
  for (let i = 0; i < 30; i++) {
    const inset = Math.round(Math.pow(i / 30, 1.7) * 170);
    const y = deck + 8 + i * 11;
    rect(g, bx - 300 + inset, y, 600 - inset * 2, 11,
      i < 2 ? 'wood3' : i < 7 ? 'wood2' : i < 18 ? 'wood1' : 'wood0');
    rect(g, bx - 304 + inset, y, 9, 11, 'ink');
    rect(g, bx + 295 - inset, y, 9, 11, 'ink');
    if (i % 2) rect(g, bx - 296 + inset, y + 10, 592 - inset * 2, 1, 'ink');
    // trenails, in rows, which is what says BUILT rather than striped
    if (i % 3 === 1) {
      for (let x = bx - 270 + inset; x < bx + 270 - inset; x += 66) rect(g, x, y + 4, 4, 4, 'wood0');
    }
  }
  rect(g, bx - 306, deck - 22, 612, 14, 'wood3');
  rect(g, bx - 306, deck - 26, 612, 6, 'ink');
  // the house on the deck, with lights in it that step on the frame clock
  rect(g, bx - 156, deck - 150, 312, 130, 'ink');
  rect(g, bx - 148, deck - 143, 296, 121, 'wood1');
  rect(g, bx - 148, deck - 143, 296, 11, 'wood2');
  tri(g, bx - 168, deck - 150, bx + 168, deck - 150, bx, deck - 196, 'ink');
  tri(g, bx - 158, deck - 152, bx + 158, deck - 152, bx, deck - 190, 'wood2');
  for (let i = 0; i < 4; i++) {
    const on = i % 2 === 0 && [1, 1, 0, 1, 1, 1][onTwos(t, 8) % 6];
    rect(g, bx - 124 + i * 72, deck - 112, 44, 54, 'ink');
    rect(g, bx - 119 + i * 72, deck - 107, 34, 44, on ? 'gold' : 'brass1');
    rect(g, bx - 119 + i * 72, deck - 107, 34, 8, on ? 'brass3' : 'brass2');
  }
  // the mast, the yard, the furled sail and the rigging
  rect(g, bx - 22, -360, 44, deck - 150 + 360, 'ink');
  rect(g, bx - 15, -354, 30, deck - 150 + 354, 'wood2');
  rect(g, bx - 15, -354, 9, deck - 150 + 354, 'wood3');
  rect(g, bx - 180, -250, 360, 16, 'ink');
  rect(g, bx - 174, -246, 348, 9, 'wood2');
  rect(g, bx - 156, -234, 312, 30, 'bone');
  rect(g, bx - 156, -234, 312, 7, 'white');
  for (let i = 0; i < 7; i++) rect(g, bx - 140 + i * 46, -234, 7, 30, mix(P.bone, P.wood1, 0.3));
  for (const sd of [-1, 1]) {
    limbLine(g, bx + sd * 12, -330, bx + sd * 250, deck - 30, 2, mix(P.bone, P.ink, 0.45), 'ink');
    limbLine(g, bx + sd * 174, -244, bx + sd * 290, deck + 60, 2, mix(P.bone, P.ink, 0.4), 'ink');
  }
  // blocks under the keel, and the ramp down to the street
  for (const kx of [bx - 200, bx, bx + 200]) {
    rect(g, kx - 42, keel - 30, 84, 40, 'ink');
    rect(g, kx - 34, keel - 26, 68, 32, 'wood0');
    rect(g, kx - 34, keel - 26, 68, 5, 'wood1');
  }
  const rampX = bx - 470, rampY = keel + 30;
  limbLine(g, rampX, rampY + 70, rampX + 250, rampY - 60, 26, 'wood1');
  for (let i = 0; i < 7; i++) {
    const f = i / 6;
    limbLine(g, rampX + f * 250 - 8, rampY + 70 - f * 130, rampX + f * 250 + 8,
      rampY + 62 - f * 130, 5, 'wood2', 'wood0');
  }

  // YOU, going up the ramp, with the light beside you.
  const rk = Ease.inOutCubic(clamp(u * 1.3, 0, 1));
  const rx = lerp(rampX + 10, rampX + 240, rk);
  const ry = lerp(rampY + 62, rampY - 62, rk);
  drawFigure(g, rx, ry, 1.6, onTwos(t, 12), { run: true, cloth: 'cloth1', hair: 'hair1' });
  const prevA = g.globalAlpha;
  g.globalAlpha = 0.55 + 0.2 * Math.sin(t * 3);
  disc(g, rx - 44, ry - 88, 14, 'ice');
  disc(g, rx - 44, ry - 94, 8, 'white');
  g.globalAlpha = prevA;

  // AND THE WATER, coming up the street as the shot runs, with things in it.
  const wk = Ease.outCubic(clamp(u * 1.1, 0, 1));
  const wy = 700 - wk * 220;
  for (let y = wy; y < 760; y++) {
    const f = (y - wy) / Math.max(1, 760 - wy);
    rect(g, 0, y, W, 1, mix(P.water0, P.deep, 0.3 + f * 0.4));
  }
  for (let i = 0; i < 24; i++) {
    const x = (h(i) * W + t * 30) % W;
    rect(g, x, wy + 10 + (i % 5) * 12, 60 + h(i * 3) * 90, 4, i % 3 ? 'water3' : 'foam');
  }
  // flotsam: a barrel, a crate and a door, bobbing on the frame clock
  const bob = [0, -2, -3, -2, 0, 1][onTwos(t, 7) % 6];
  for (const [fx, kind] of [[110, 'barrel'], [340, 'crate'], [800, 'door']]) {
    const fy = wy + 26 + bob;
    if (kind === 'barrel') {
      rect(g, fx - 4, fy - 30, 70, 34, 'ink');
      rect(g, fx, fy - 26, 62, 26, 'wood2');
      rect(g, fx, fy - 26, 62, 6, 'wood3');
      rect(g, fx, fy - 16, 62, 4, 'brass0');
    } else if (kind === 'crate') {
      rect(g, fx - 4, fy - 34, 64, 38, 'ink');
      rect(g, fx, fy - 30, 56, 30, 'wood1');
      rect(g, fx, fy - 30, 56, 6, 'wood2');
      rect(g, fx + 24, fy - 30, 7, 30, 'wood0');
    } else {
      rect(g, fx - 4, fy - 16, 136, 20, 'ink');
      rect(g, fx, fy - 12, 128, 14, 'wood1');
      rect(g, fx, fy - 12, 128, 5, 'wood2');
    }
    rect(g, fx - 12, fy + 4, 88, 4, 'foam');
  }
  rect(g, 0, wy, W, 9, 'foam');
  rect(g, 0, wy - 4, W, 4, 'ink');
  // RAIN OVER THE WHOLE WORLD, not just the frame. rainSheets draws inside 0..H, and this
  // shot is a thousand pixels tall: one call left the top and bottom thirds of the crane dry.
  for (const off of [-420, 0, 420]) {
    g.save(); g.translate(0, off); rainSheets(g, t + off * 0.01, 0.8, 0.24); g.restore();
  }
  wash(g, 0, -400, W, 1200, 'night', 0.14);
}

/**
 * SHOT 2 -- she floats. Low and close on the waterline: the keel comes off the blocks.
 *
 * THE BEATS ARE THE SHOT. Held: ropes taut, hull creaking a pixel either way, and nothing
 * happens for longer than is comfortable. Then the near block SPLITS -- cracks, debris, one
 * white frame, the camera snapping down onto it. Then she LIFTS, and the bow wave goes out in
 * hard rings while the ropes go slack and the ladder falls away.
 *
 * AND THE WATER IS DRAWN FIRST. It was painted over the hull for two versions: the sea filled
 * everything below the waterline including the three hundred pixels of planking that were the
 * subject, so the biggest object in the prologue was a seventy-pixel brown stripe.
 */
function sailFloat(g, u, t) {
  const B = beat(u, [[0, 'blocks'], [0.3, 'crack'], [0.42, 'lift'], [0.66, 'float']]);
  const wy = 340;
  const lift = B.kind === 'blocks' || B.kind === 'crack' ? 0
    : B.kind === 'lift' ? Ease.outCubic(B.k) : 1;
  const creak = B.kind === 'blocks' ? [0, 1, 1, 0, -1, -1][onTwos(t, 5) % 6] : 0;
  const rock = B.kind === 'float' ? Math.sin(t * 1.4) * 4 : 0;
  vBand(g, 0, wy, ['purple0', 'rust', 'orange', 'gold']);

  // THE WATER FIRST, so the hull can sit in it.
  for (let y = wy; y < H; y++) {
    rect(g, 0, y, W, 1, mix(P.water1, P.deep, ((y - wy) / (H - wy)) * 0.6));
  }
  for (let y = wy + 10; y < H; y += 16) {
    const f = (y - wy) / (H - wy);
    rect(g, Math.sin(y * 0.2 + t) * (8 + f * 26) - 40, y, W + 80, 4, mix(P.water3, P.deep, 0.35));
  }

  // ropes, from out of frame down to the rail: taut and straight on the blocks, slack after
  for (const rx of [96, 828]) {
    for (let i = 0; i < 16; i++) {
      const f = i / 15;
      const sag = Math.sin(f * Math.PI) * lift * 70;
      rect(g, rx + f * 80, -20 + f * 210 + sag, 9, 9, 'bone');
    }
  }

  // THE HULL. Rail, planking down to a couple of pixels under the waterline, and a bilge
  // curve: the inset comes off a power curve so the bottom tucks under rather than going
  // straight down, which is the entire difference between a hull and a fence.
  const top = 150 - lift * 30 + creak + rock;
  const rows = Math.ceil((wy + 14 - top) / 11);
  for (let i = 0; i < rows; i++) {
    const f = i / rows;
    const inset = Math.round(Math.pow(f, 2.4) * 130);
    const y = top + i * 11;
    rect(g, 40 + inset, y, W - 80 - inset * 2, 11, i % 5 === 4 ? mix(P.wood1, P.ink, 0.4) : 'wood1');
    rect(g, 40 + inset, y, W - 80 - inset * 2, 4,
      i < 3 ? 'wood3' : mix(P.wood2, P.wood1, 0.35 + f * 0.4));
    rect(g, 36 + inset, y, 9, 11, 'ink');
    rect(g, W - 45 - inset, y, 9, 11, 'ink');
    if (i % 3 === 1) {
      for (let x = 90 + inset; x < W - 90 - inset; x += 68) rect(g, x, y + 5, 4, 4, 'wood0');
    }
  }
  rect(g, 40, top - 26, W - 80, 26, 'wood2');
  rect(g, 40, top - 30, W - 80, 8, 'ink');
  rect(g, 40, top - 22, W - 80, 5, 'wood3');
  // pitch along the waterline, and the boot-top stripe above it
  rect(g, 60, wy - 52, W - 120, 26, mix(P.ink, P.wood0, 0.4));
  rect(g, 56, wy - 58, W - 112, 8, 'brass0');

  // A LADDER against her, which is the whole sense of scale -- and it goes over when she
  // moves, because nothing was made fast for this.
  const lean = lift * 0.5;
  const lx = 150;
  for (const rail of [0, 84]) {
    limbLine(g, lx + rail + lean * 150, top + 30, lx + rail, wy + 6, 9, 'wood1');
  }
  for (let i = 0; i < 6; i++) {
    const f = i / 5;
    limbLine(g, lx + lean * 150 * (1 - f), top + 30 + f * (wy - top - 24),
      lx + 84 + lean * 150 * (1 - f), top + 30 + f * (wy - top - 24), 11, 'wood2');
  }

  // THE BLOCK, and it is the thing that gives way.
  const bkx = 470;
  if (B.kind === 'blocks' || B.kind === 'crack') {
    rect(g, bkx - 4, wy - 30, 122, 52, 'ink');
    rect(g, bkx, wy - 26, 114, 44, 'wood0');
    rect(g, bkx, wy - 26, 114, 6, 'wood1');
    if (B.kind === 'crack') {
      cracks(g, bkx + 57, wy - 4, B.k * 1.6, 7, 5, 'ink');
      if (B.k > 0.5) debris(g, bkx + 57, wy - 16, (B.k - 0.5) / 0.5, 16, 2, 'wood0');
      dust(g, bkx + 57, wy, B.k, 'grey1');
    }
  } else {
    debris(g, bkx + 57, wy - 16, 0.4 + (B.kind === 'lift' ? B.k : 1) * 0.6, 16, 2, 'wood0');
  }

  // and the sea's answer: rings out from under her, and foam breaking along the planking
  rect(g, 0, wy, W, 8, 'foam');
  if (lift > 0) {
    for (let i = 0; i < 6; i++) {
      const r = 80 + lift * 320 + i * 60;
      ellipseFrame(g, W / 2, wy + 70, r, Math.max(6, r * 0.13), i % 2 ? 'foam' : 'water3', 1);
    }
    const fq = onThrees(t);
    for (let i = 0; i < 20; i++) {
      const fx = 60 + ((i * 97 + fq * 11) % (W - 120));
      rect(g, fx, wy - 10 + ((i + fq) % 3) * 5, 34 + (i % 4) * 20, 6, i % 3 ? 'foam' : 'water3');
    }
  }
  wash(g, 0, 0, W, H, 'gold', 0.05);
}

/**
 * SHOT 3 -- the wide one. A boat, a sea, and a light at the prow that used to be a man.
 *
 * The camera PULLS BACK across this shot, which is the last thing that happens in the prologue
 * and the only correct move for it: the boat gets smaller, the water gets bigger, and you are
 * left looking at the size of what you have agreed to.
 */
function sailWide(g, u, t) {
  vBand(g, 0, 260, ['purple0', 'rust', 'orange', 'brass2', 'gold']);
  disc(g, 760, 210, 54, 'gold');
  disc(g, 760, 210, 40, 'cream');
  rays(g, 760, 210, 11, 320, 2.8, 'gold', 0.12, t * 0.3);
  // CLOUD, and it is stacked lozenges rather than bars: a rectangle across a sunset is a
  // shelf, and the first cut of this had five of them.
  for (let i = 0; i < 5; i++) {
    const cy = 96 + i * 32;
    const cw = 300 - i * 30;
    const cx = 470 + Math.round(Math.sin(t * 0.13 + i * 1.7) * 26) + (i % 2 ? 70 : -60);
    const tone = mix(P.purple0, P.rust, 0.25 + i * 0.13);
    for (let j = 0; j < 4; j++) {
      const jw = cw * (0.5 + j * 0.17);
      ellipse(g, cx + (j - 1.5) * cw * 0.22, cy + (j % 2) * 5, jw * 0.5, 11 - i, tone);
    }
    ellipse(g, cx, cy - 4, cw * 0.44, 6, mix(P.orange, P.gold, i * 0.18));
  }
  // the sea, in bands, with the sun's road down it
  for (let y = 260; y < H; y++) {
    const f = (y - 260) / (H - 260);
    rect(g, 0, y, W, 1, mix(P.water1, P.deep, 0.2 + f * 0.6));
  }
  const q = onThrees(t);
  for (let y = 264; y < H; y += 14) {
    const f = (y - 260) / (H - 260);
    const off = Math.sin(y * 0.2 + t * 1.1) * (10 + f * 30);
    rect(g, off - 40, y, W + 80, 4, mix(P.water3, P.deep, 0.3));
    // the road: broken into glints that step, rather than one continuous band
    const gl = ((y / 14 | 0) + q) % 3;
    rect(g, 700 + off - f * 120 + gl * 26, y, 90 + f * 170, 4, mix(P.gold, P.water2, 0.4));
  }
  // birds, crossing high, because the sky needs something with a wingbeat in it
  for (let i = 0; i < 2; i++) {
    drawBird(g, ((t * (20 + i * 12) + i * 420) % (W + 240)) - 120, 86 + i * 40,
      0.5, onTwos(t, 7 + i * 2), { tone: 'ink', lite: 'purple0', eye: 'ink' });
  }
  // the ark, small, going left to right, and it is the only clean shape in the frame
  const bx = 260 + Ease.outCubic(clamp(u, 0, 1)) * 180;
  const bob = [0, -1, -2, -1, 0, 1][onTwos(t, 6) % 6] * 2;
  drawArkSmall(g, bx, 360 + bob, 2);
  // her wake, opening out behind her
  for (let i = 0; i < 5; i++) {
    rect(g, bx - 120 - i * 50, 372 + bob + i * 5, 90 + i * 30, 4,
      mix(P.foam, P.water2, 0.2 + i * 0.15));
  }
  // the soul at the prow: a small pale flame that keeps station with the boat
  const px0 = bx + 92, py0 = 322 + bob;
  const prev = g.globalAlpha;
  g.globalAlpha = 0.45 + 0.25 * [1, 0.7, 0.9, 0.6, 1, 0.8][onTwos(t, 10) % 6];
  disc(g, px0, py0, 14, 'ice');
  disc(g, px0, py0 - 6, 8, 'white');
  g.globalAlpha = prev;
  const mt = onThrees(t);
  for (let i = 0; i < 10; i++) {
    const mk = (((mt + i * 3) % 24) / 24 + h(i)) % 1;
    rect(g, px0 + (h(i * 5) - 0.5) * 40, py0 - mk * 90, 6, 6, mk > 0.5 ? 'white' : 'ice');
  }
  wash(g, 0, 0, W, H, 'gold', 0.05);
}

export const SETSAIL = {
  id: 'setsail',
  dur: 12,
  shots: [
    {
      at: 0.00, id: 'street', label: 'THE WATER TOOK THE LAST OF THE STREET', draw: sailStreet,
      // a crane up the hull: the water at the bottom of the world, the masthead at the top
      cam: [
        { at: 0, y: 150, zoom: 1 },
        { at: 1, y: -170, zoom: 1, ease: 'inout' },
      ],
      hits: [[0.08, 5, null]],
    },
    {
      at: 0.36, id: 'float', label: 'AND SHE FLOATED', draw: sailFloat,
      // held, snap down onto the block that goes, then pull out as she lifts
      cam: [
        { at: 0, x: 0, y: 10, zoom: 1.04 },
        { at: 0.29, x: 0, y: 10, zoom: 1.04, ease: 'linear' },
        { at: 0.36, x: 40, y: 46, zoom: 1.3, ease: 'snap' },
        { at: 0.66, x: 0, y: 6, zoom: 1.02, ease: 'out' },
        { at: 1, x: 0, y: 0, zoom: 1 },
      ],
      hits: [[0.3, 14, 'white'], [0.44, 8, null], [0.7, 5, null]],
    },
    {
      at: 0.68, id: 'wide', label: 'SO THE TWO OF YOU WENT OUT INTO IT', draw: sailWide,
      // and the last move in the prologue is a pull back
      cam: [
        { at: 0, x: 30, y: 24, zoom: 1.22 },
        { at: 1, x: -10, y: 0, zoom: 1, ease: 'out' },
      ],
    },
  ],
};

export const REELS = { rivers: RIVERS, chaos: CHAOS, passing: PASSING, setsail: SETSAIL };

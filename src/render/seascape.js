// Sky, sea and horizon. Sits behind the title screen, around the pool deck, and fills
// the dock. This is most of the game's atmosphere, so it gets real attention.
//
// The water is the interesting part. Rows below the horizon scroll at a speed
// proportional to their distance from it, which fakes perspective for free; foam crests
// are dashed lines whose length, spacing and scroll speed all grow with depth, so they
// read as WAVES marching toward the viewer rather than as noise. Everything is derived
// from (seed, accumulated time) so it is deterministic and allocation-free per frame.

import { P, col, mix, alpha } from '../core/palette.js';
import {
  rect, px, line, disc, ring, ellipse, tri, dither, vgrad, text, wash, clamp, lerp,
  makeCanvas, blit,
} from '../core/pixel.js';
import { makeRng } from '../core/rng.js';
import { makeBuf, bset, btri, outline, flush } from './pixbuf.js';

export const TIME_OF_DAY = { dawn: 0, day: 0.25, dusk: 0.5, night: 0.75 };

// Four hand-picked looks. Snapping to the nearest instead of interpolating keeps the
// bands crisp — a blended sky turns into 40 shades of mud at this resolution.
const PRESETS = {
  dawn: {
    sky: ['purple0', 'red1', 'orange', 'amber', 'sand'],
    glowC: 'gold', bodyC: 'amber', night: false,
    water: ['amber', 'orange', 'rust', 'water2', 'water1', 'water0', 'deep'],
    foam: 'sand', horizon: 'gold', far: 'purple0', far2: 'shadow',
  },
  day: {
    sky: ['water2', 'sky', 'ice', 'foam', 'white'],
    glowC: 'white', bodyC: 'white', night: false,
    water: ['foam', 'water3', 'water2', 'water1', 'water0', 'deep', 'shadow'],
    foam: 'white', horizon: 'foam', far: 'deep', far2: 'night',
  },
  dusk: {
    sky: ['deep', 'purple0', 'purple1', 'red2', 'orange'],
    glowC: 'orange', bodyC: 'gold', night: false,
    water: ['orange', 'red1', 'purple1', 'purple0', 'water0', 'deep', 'ink'],
    foam: 'sand', horizon: 'orange', far: 'ink', far2: 'shadow',
  },
  night: {
    sky: ['ink', 'shadow', 'deep', 'night', 'purple0'],
    glowC: 'ice', bodyC: 'bone', night: true,
    water: ['night', 'water0', 'deep', 'shadow', 'ink', 'ink', 'ink'],
    foam: 'ice', horizon: 'night', far: 'ink', far2: 'shadow',
  },
};

/** A stable pseudo-random in -1..1 from an integer. */
function hashUnit(n) {
  let h = Math.imul(n ^ 0x9e3779b9, 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (((h ^ (h >>> 16)) >>> 0) / 2147483648) - 1;
}

/** Ring thinned on a checkerboard so haloes dissolve instead of banding. */
function glowRing(g, cx, cy, r, c, step) {
  cx = Math.round(cx); cy = Math.round(cy);
  g.fillStyle = col(c);
  for (let a = 0; a < 360; a += 3) {
    const rad = (a * Math.PI) / 180;
    const gx = Math.round(cx + Math.cos(rad) * r);
    const gy = Math.round(cy + Math.sin(rad) * r);
    if (step > 1 && ((gx + gy) % step) !== 0) continue;
    g.fillRect(gx, gy, 1, 1);
  }
}

function presetFor(tod) {
  const t = ((tod % 1) + 1) % 1;
  if (t < 0.125 || t >= 0.875) return PRESETS.dawn;
  if (t < 0.375) return PRESETS.day;
  if (t < 0.625) return PRESETS.dusk;
  return PRESETS.night;
}

/* ------------------------------------------------------------------- boats */

const BOAT_DEFS = {
  skiff: { w: 34, h: 20, sail: 1, funnels: 0, crates: 0, air: false },
  barge: { w: 58, h: 18, sail: 0, funnels: 1, crates: 3, air: false },
  freighter: { w: 92, h: 26, sail: 0, funnels: 2, crates: 7, air: false },
  zeppelin: { w: 78, h: 34, sail: 0, funnels: 0, crates: 2, air: true },
};

/**
 * drawBoat(g, boat, t)
 * boat: {kind, x, y, scale, flip, tint} — x/y is the WATERLINE centre (or the gondola
 * bottom for the zeppelin). Bobs and rolls off t.
 */
export function drawBoat(g, boat, t = 0) {
  const def = BOAT_DEFS[boat.kind] || BOAT_DEFS.skiff;
  const s = Math.max(1, Math.round(boat.scale || 1));
  const bob = Math.round(Math.sin(t * 1.7 + (boat.phase || 0)) * (def.air ? 2 : 1.2));
  const x = Math.round(boat.x);
  const y = Math.round(boat.y) + bob;
  const w = def.w * s, h = def.h * s;
  const hullTop = y - Math.round(h * 0.34);
  const flip = !!boat.flip;
  const fx = (v) => (flip ? x - (v - x) : v);   // mirror about the boat centre

  if (def.air) {
    // ---- zeppelin: envelope, fins, gondola, prop
    const ex = x, ey = y - 22 * s;
    for (let i = -Math.round(w / 2); i <= Math.round(w / 2); i++) {
      const k = 1 - (i / (w / 2)) ** 2;
      if (k <= 0) continue;
      const hh = Math.round(Math.sqrt(k) * 9 * s);
      const c = i < -w * 0.12 ? 'bone' : i > w * 0.18 ? 'wood2' : 'white';
      rect(g, ex + i, ey - hh, 1, hh * 2, c);
      if (hh > 2) px(g, ex + i, ey - hh + 1, 'white');
      if (hh > 3) px(g, ex + i, ey + hh - 1, 'grey1');
    }
    // seams
    for (let i = -2; i <= 2; i++) {
      const sx = ex + i * Math.round(w / 6);
      const k = 1 - (i / 3) ** 2;
      const hh = Math.round(Math.sqrt(Math.max(0, k)) * 9 * s);
      rect(g, sx, ey - hh, 1, hh * 2, 'grey1');
    }
    tri(g, fx(ex + Math.round(w / 2)), ey, fx(ex + Math.round(w / 2) + 6 * s), ey - 6 * s, fx(ex + Math.round(w / 2) + 6 * s), ey + 6 * s, 'red1');
    // gondola
    rect(g, ex - 7 * s, ey + 9 * s, 14 * s, 5 * s, 'wood2');
    rect(g, ex - 7 * s, ey + 9 * s, 14 * s, 1, 'wood4');
    for (let i = 0; i < 3; i++) px(g, ex - 4 * s + i * 4 * s, ey + 11 * s, 'brass3');
    line(g, ex - 5 * s, ey + 9 * s, ex - 5 * s, ey + 7 * s, 'grey0');
    line(g, ex + 5 * s, ey + 9 * s, ex + 5 * s, ey + 7 * s, 'grey0');
    // prop blur
    const spin = Math.floor(t * 30) % 2;
    rect(g, fx(ex - 9 * s), ey + 10 * s - (spin ? 2 : 0), 1, spin ? 5 : 3, 'grey2');
    return;
  }

  // ---- hull: a tapered wedge with a boot stripe and a lit gunwale
  for (let i = 0; i < h * 0.4; i++) {
    const inset = Math.round((i / (h * 0.4)) ** 1.6 * (w * 0.22));
    const c = i === 0 ? 'wood4' : i < 2 ? 'wood3' : i < h * 0.22 ? 'wood2' : 'wood1';
    rect(g, x - Math.round(w / 2) + inset, hullTop + i, w - inset * 2, 1, c);
  }
  rect(g, x - Math.round(w / 2), hullTop, w, 1, 'wood4');
  // boot stripe
  rect(g, x - Math.round(w / 2) + 2, hullTop + Math.round(h * 0.28), w - 4, 1, 'red1');

  // deck house
  const dh = Math.round(h * 0.34);
  rect(g, x - Math.round(w * 0.16), hullTop - dh, Math.round(w * 0.32), dh, 'wood3');
  rect(g, x - Math.round(w * 0.16), hullTop - dh, Math.round(w * 0.32), 1, 'wood4');
  for (let i = 0; i < 3; i++) {
    px(g, x - Math.round(w * 0.10) + i * 4 * s, hullTop - Math.round(dh / 2), 'ice');
  }

  // funnels with smoke
  for (let f = 0; f < def.funnels; f++) {
    const cx2 = fx(x - Math.round(w * 0.02) + f * 8 * s);
    rect(g, cx2, hullTop - dh - 6 * s, 3 * s, 6 * s, 'grey0');
    rect(g, cx2, hullTop - dh - 6 * s, 3 * s, 1, 'red1');
    for (let k = 0; k < 4; k++) {
      const sy = hullTop - dh - 7 * s - k * 3;
      const sw = 2 + k;
      dither(g, cx2 - Math.round(sw / 2) + Math.round(Math.sin(t * 2 + k) * 2), sy - 1, sw, 2, 'grey1', 'rgba(0,0,0,0)', 6 + k * 2);
    }
  }

  // mast + sail
  if (def.sail) {
    const mx = fx(x + Math.round(w * 0.06));
    line(g, mx, hullTop - dh, mx, hullTop - dh - 20 * s, 'wood2');
    for (let i = 0; i < 16 * s; i++) {
      const bulge = Math.round(Math.sin((i / (16 * s)) * Math.PI) * 9 * s);
      if (bulge <= 0) continue;
      const sxx = flip ? mx : mx - bulge;
      rect(g, sxx, hullTop - dh - 18 * s + i, bulge, 1, i % 6 < 3 ? 'white' : 'bone');
    }
    // pennant
    const fl = Math.round(Math.sin(t * 5) * 2);
    rect(g, mx + (flip ? -7 : 1), hullTop - dh - 21 * s, 6, 3, 'red2');
    rect(g, mx + (flip ? -7 : 1), hullTop - dh - 21 * s + fl, 6, 1, 'red1');
  }

  // deck cargo
  for (let c2 = 0; c2 < def.crates; c2++) {
    const cw = 6 * s;
    const cx2 = x - Math.round(w / 2) + 5 + c2 * (cw + 1);
    if (cx2 + cw > x + w / 2 - 4) break;
    rect(g, cx2, hullTop - cw, cw, cw, 'wood2');
    rect(g, cx2, hullTop - cw, cw, 1, 'wood4');
    rect(g, cx2, hullTop - Math.round(cw / 2), cw, 1, 'brass1');
    rect(g, cx2 + Math.round(cw / 2), hullTop - cw, 1, cw, 'wood1');
  }

  // wake + bow spray
  for (let i = 0; i < 3; i++) {
    const ww = w - 6 - i * 10;
    if (ww <= 0) break;
    rect(g, x - Math.round(ww / 2), y + Math.round(h * 0.08) + i, ww, 1, i === 0 ? 'foam' : 'water3');
  }
  const spray = Math.round(Math.abs(Math.sin(t * 3.3)) * 3);
  for (let i = 0; i < spray; i++) px(g, fx(x + Math.round(w / 2) - i), y + Math.round(h * 0.06) - i, 'foam');
}

/* --------------------------------------------------------------- seascape */

/* -------------------------------------------------------------- swells and dolphins

Two things a sea needs that dashed foam crests do not give it: SWELL, meaning long waves
you can watch travel toward you, and LIFE.
*/

/**
 * Long rolling swells.
 *
 * Drawn in four-pixel steps, which is both the look and the budget. A per-pixel sine
 * across a 960-wide sea is a thousand fillRects a swell; stepping four and drawing a
 * four-wide block is a quarter of that, and the result is chunky in exactly the way the
 * rest of the art is chunky.
 */
function drawSwells(g, x, y, w, hy, waterH, t, keys, foamC, storm) {
  const STEP = 4;
  const n = storm > 0.4 ? 3 : 2;
  for (let s = 0; s < n; s++) {
    // each swell walks from the horizon to the viewer, easing out as it nears
    const ph = ((t * (0.055 + s * 0.018) + s * 0.41) % 1);
    const base = hy + Math.round(Math.pow(ph, 0.62) * waterH);
    if (base < hy + 3 || base > hy + waterH - 3) continue;
    const k = (base - hy) / waterH;
    const amp = 1.5 + k * 6 + storm * 4;
    const per = 90 + k * 200;
    const th = 1 + Math.round(k * 3);
    const crest = mix(P[foamC], P[keys[Math.min(keys.length - 1, 2)]], 0.45 - k * 0.3);
    const trough = mix(P[keys[Math.min(keys.length - 1, Math.round(2 + k * 2))]], P.ink, 0.3);
    for (let i = 0; i < w; i += STEP) {
      const wy = base + Math.round(Math.sin((i / per) * Math.PI * 2 + t * 0.9 + s * 2.1) * amp);
      if (wy < hy || wy > hy + waterH - 2) continue;
      rect(g, x + i, wy, STEP, th, crest);
      rect(g, x + i, wy + th, STEP, 1, trough);
    }
  }
}

/**
 * A dolphin, baked in three poses.
 *
 * Rotating pixel art is off the table, so a leap is three sprites: nose up on the way out,
 * level at the apex, nose down on the way in. Flip for direction. Authored at half
 * resolution like everything else, so it comes out 28x18 with two-pixel lines.
 */
const DOLPHIN_POSES = ['rise', 'apex', 'dive'];
const dolphinCache = new Map();

function bakeDolphin(pose) {
  const hit = dolphinCache.get(pose);
  if (hit !== undefined) return hit;
  const AW = 14, AH = 9;
  const mk = makeCanvas(AW * 2, AH * 2);
  if (!mk) { dolphinCache.set(pose, null); return null; }
  const b = makeBuf(AW, AH);
  // the spine: a shallow arc whose tilt is the pose
  const tilt = pose === 'rise' ? -0.42 : pose === 'dive' ? 0.42 : 0;
  const spine = [];
  for (let i = 0; i < 12; i++) {
    const f = i / 11;
    spine.push([1 + i, 4 + Math.round(tilt * (f - 0.5) * 9 + Math.sin(f * Math.PI) * -0.9)]);
  }
  // body: thick in the middle, tapering both ways
  for (let i = 0; i < spine.length; i++) {
    const f = i / (spine.length - 1);
    const th = Math.max(1, Math.round(3.1 * Math.sin(Math.PI * Math.min(1, f * 1.18)) - f * 0.6));
    const [sx, sy] = spine[i];
    for (let d = -th; d <= th; d++) {
      // back dark, belly pale: the one thing that makes a dolphin a dolphin
      // A dark back on dark water is a smudge. The back is water1, the flank water3, the
      // belly ice: light enough that the silhouette survives against the deep ramp.
      bset(b, sx, sy + d, d < -th * 0.15 ? 'water1' : d < th * 0.45 ? 'water3' : 'ice');
    }
  }
  const [hx, hy2] = spine[spine.length - 1];
  const [tx, ty] = spine[0];
  // the beak
  bset(b, hx + 1, hy2, 'water3'); bset(b, hx + 2, hy2 + (tilt > 0 ? 1 : 0), 'water1');
  // the eye: one dark pixel, which on a pale flank is plenty
  bset(b, hx - 1, hy2 - 1, 'ink');
  // the dorsal fin
  const mid = spine[6];
  btri(b, mid[0] - 1, mid[1] - 2, mid[0] + 2, mid[1] - 2, mid[0] - 2, mid[1] - 5, 'water1');
  // the tail fluke
  btri(b, tx + 1, ty, tx - 1, ty - 3, tx - 1, ty + 3, 'water1');
  // a flipper
  btri(b, mid[0] + 2, mid[1] + 1, mid[0] + 4, mid[1] + 3, mid[0], mid[1] + 2, 'water1');
  outline(b, 'ink');
  flush(b, mk.g, 0, 0, 2);
  dolphinCache.set(pose, mk.canvas);
  return mk.canvas;
}

/**
 * A pod, arcing.
 *
 * Each dolphin runs one cycle: most of it underwater as a travelling shadow and a V of
 * wake, then a leap along a parabola with a splash at each end. The whole pod shares a
 * cycle length and staggers by index, which is what makes them look like they are
 * together rather than three animals that happen to be nearby.
 */
function drawPod(g, pod, x, y, w, hy, waterH, t, foamC) {
  for (const d of pod) {
    const cyc = (t / d.period + d.phase) % 1;
    const bandY = hy + Math.round(waterH * d.band);
    const travel = ((cyc + d.phase) % 1);
    const dx = x + Math.round((d.dir > 0 ? travel : 1 - travel) * (w + 80)) - 40;
    if (cyc < 0.62) {
      // under: a dark smudge and a wake, so you can see them coming
      const a = 0.5 + 0.5 * Math.sin(cyc * 14);
      rect(g, dx, bandY, 10, 2, mix(P.water0, P.deep, 0.4));
      rect(g, dx + (d.dir > 0 ? -6 : 8), bandY - 1, 5, 1, mix(P[foamC], P.water1, 0.5 + a * 0.3));
      continue;
    }
    // out: a parabola, with the pose picked from where it is on the arc
    const k = (cyc - 0.62) / 0.38;
    const lift = Math.round(Math.sin(k * Math.PI) * (10 + d.band * 22));
    const pose = k < 0.36 ? 'rise' : k < 0.64 ? 'apex' : 'dive';
    const cv = bakeDolphin(pose);
    const sc = 1;
    if (cv) {
      const dw = cv.width * sc, dh = cv.height * sc;
      const px2 = dx - dw / 2;
      const py2 = Math.max(hy + 1, bandY - lift - dh);   // never above the horizon
      if (d.dir > 0) {
        g.drawImage(cv, Math.round(px2), Math.round(py2), dw, dh);
      } else {
        g.save();
        g.translate(Math.round(px2) + dw, Math.round(py2));
        g.scale(-1, 1);
        g.drawImage(cv, 0, 0, dw, dh);
        g.restore();
      }
    }
    // splash on the way out and on the way back in
    if (k < 0.16 || k > 0.84) {
      for (let i = 0; i < 4; i++) {
        rect(g, dx - 8 + i * 5, bandY - 2 - (i % 2) * 2, 3, 2, foamC);
      }
    }
  }
}

export function createSeascape(seed, o = {}) {
  const rng = makeRng(String(seed || 'sea'));
  let t = 0;
  let tod = o.timeOfDay !== undefined ? o.timeOfDay : TIME_OF_DAY.day;

  // --- deterministic furniture, built once
  const stars = [];
  for (let i = 0; i < 90; i++) {
    stars.push({ x: rng.int(640), y: rng.int(150), b: rng.range(0, 1), sp: rng.range(0.6, 2.4) });
  }
  const clouds = [];
  for (let layer = 0; layer < 3; layer++) {
    const n = 4 - layer;
    for (let i = 0; i < n; i++) {
      clouds.push({
        layer,
        x: rng.range(-80, 720),
        y: 14 + layer * 22 + rng.range(-6, 8),
        w: (28 - layer * 6) * rng.range(0.8, 1.7),
        h: (8 - layer * 2) * rng.range(0.8, 1.4),
        sp: (5 - layer * 1.4) * rng.range(0.7, 1.3),
        lumps: 2 + rng.int(3),
        seed: rng.int(999),
      });
    }
  }
  const isles = [];
  for (let i = 0; i < 7; i++) {
    isles.push({
      depth: i < 4 ? 1 : 0,
      x: rng.range(-40, 700),
      w: rng.range(30, 130),
      h: rng.range(6, 26),
      spike: rng.chance(0.4),
      light: false,
      seed: rng.int(999),
    });
  }
  isles[rng.int(isles.length)].light = true;   // one gets a lighthouse

  // a pod of three, staggered on one shared cycle so they read as travelling together
  const pod = [];
  for (let i = 0; i < 3; i++) {
    pod.push({
      period: rng.range(11, 17),
      phase: i * 0.11 + rng.range(0, 0.5),
      // the NEAR half of the water only. A pod at band 0.3 leaping sixteen pixels clears
      // the horizon line and appears to jump out of the sky.
      band: 0.5 + i * 0.13 + rng.range(-0.04, 0.04),
      dir: rng.chance(0.5) ? 1 : -1,
    });
  }
  const birds = [];
  for (let i = 0; i < 5; i++) {
    birds.push({ x: rng.range(-200, 640), y: rng.range(24, 80), sp: rng.range(14, 30), ph: rng.range(0, 6), scale: rng.chance(0.4) ? 2 : 1 });
  }
  const splashes = [];
  const boats = [];

  // The sky bands and the water depth ramp are fully dithered, which means a per-pixel
  // pass over the whole frame — about 160k fillRects, and it measured 22fps in Chromium.
  // Neither of them changes unless the time of day, the storm level or the layout does,
  // so they get baked once into an offscreen canvas and blitted. Only the genuinely
  // animated parts (sun, clouds, crests, glitter, rain, birds) are drawn per frame.
  let bakeKey = '';
  let bakeCv = null;
  let bakeH = 0;
  let half = null;          // the half-resolution offscreen the whole layer renders into

  function ensureBake(o) {
    const w = Math.max(1, Math.round(o.w || 640));
    const h = Math.max(1, Math.round(o.h || 360));
    const hy = Math.round((o.horizonY !== undefined ? o.horizonY : (o.y || 0) + h * 0.42) - (o.y || 0));
    const todv = o.timeOfDay !== undefined ? o.timeOfDay : tod;
    const stormv = Math.round(clamp(o.storm || 0, 0, 1) * 10) / 10;
    const key = `${w}/${h}/${hy}/${Math.round(todv * 200)}/${stormv}`;
    if (key === bakeKey && bakeCv) return { cv: bakeCv, hy };
    const mk = makeCanvas(w, h);
    if (!mk) return { cv: null, hy };
    const bg = mk.g;
    const p = presetFor(todv);
    const skyKeys = stormv > 0.35 ? p.sky.map((k) => mix(k, P.deep, stormv * 0.6)) : p.sky;
    const waterKeys = stormv > 0.35 ? p.water.map((k) => mix(k, P.ink, stormv * 0.45)) : p.water;

    if (hy > 0) vgrad(bg, 0, 0, w, hy, skyKeys, 3);

    const waterH = Math.max(1, h - hy);
    const n = waterKeys.length;
    for (let i = 0; i < waterH; i++) {
      const k = Math.pow(i / waterH, 0.78);
      const fk = k * (n - 1);
      const i0 = Math.min(n - 1, Math.floor(fk));
      const i1 = Math.min(n - 1, i0 + 1);
      dither(bg, 0, hy + i, w, 1, waterKeys[i0], waterKeys[i1], Math.round((fk - i0) * 16));
    }
    rect(bg, 0, Math.max(0, hy - 1), w, 1, p.horizon);

    bakeKey = key;
    bakeCv = mk.canvas;
    bakeH = h;
    return { cv: bakeCv, hy };
  }

  function bandColor(list, k, offset) {
    const n = list.length;
    const idx = clamp(Math.floor(k * n) + (offset || 0), 0, n - 1);
    return list[idx];
  }

  const sea = {
    boats,
    get t() { return t; },
    get timeOfDay() { return tod; },
    setTimeOfDay(v) { tod = v; },

    update(dt) {
      t += dt;
      for (const c of clouds) {
        c.x += c.sp * dt;
        if (c.x > 700) c.x = -120;
      }
      for (const b of birds) {
        b.x += b.sp * dt;
        if (b.x > 700) { b.x = -60; b.y = 24 + ((b.ph * 37) % 56); }
      }
      for (let i = splashes.length - 1; i >= 0; i--) {
        splashes[i].t += dt;
        if (splashes[i].t > splashes[i].life) splashes.splice(i, 1);
      }
      for (const bt of boats) {
        if (bt.vx) bt.x += bt.vx * dt;
      }
    },

    splash(x, y, power = 1) {
      splashes.push({ x, y, t: 0, life: 0.6 + power * 0.3, power });
      if (splashes.length > 24) splashes.shift();
    },

    addBoat(spec) {
      const b = Object.assign({ kind: 'skiff', x: 700, y: 240, scale: 1, flip: false, vx: 0, phase: rng.range(0, 6) }, spec);
      boats.push(b);
      return b;
    },
    removeBoat(b) { const i = boats.indexOf(b); if (i >= 0) boats.splice(i, 1); },
    drawBoat(g, b) { drawBoat(g, b, t); },

    /* ------------------------------------------------------------ layers */

    drawSky(g, opt = {}) {
      const p = presetFor(opt.timeOfDay !== undefined ? opt.timeOfDay : tod);
      const storm = clamp(opt.storm || 0, 0, 1);
      const x = opt.x || 0, y = opt.y || 0, w = opt.w || 640;
      const hy = opt.horizonY !== undefined ? opt.horizonY : y + Math.round((opt.h || 360) * 0.42);
      const skyH = Math.max(1, hy - y);
      const keys = storm > 0.35 ? p.sky.map((k) => mix(k, P.deep, storm * 0.6)) : p.sky;
      const bake = ensureBake(opt);
      if (bake.cv) g.drawImage(bake.cv, 0, 0, w, Math.max(1, bake.hy), x, y, w, Math.max(1, bake.hy));
      else vgrad(g, x, y, w, skyH, keys, 3);

      if (p.night) {
        for (const s of stars) {
          if (s.y > skyH) continue;
          const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.b * 9);
          if (tw < 0.5) continue;
          px(g, x + s.x % w, y + s.y, tw > 0.9 ? 'white' : 'ice');
        }
      }

      // sun or moon
      const sunX = x + Math.round(w * (opt.sunX !== undefined ? opt.sunX : 0.72));
      const sunY = y + Math.round(skyH * (p.night ? 0.28 : 0.5));
      const r = p.night ? 7 : 9;
      // Concentric solid rings read as a spiderweb; thin the outer haloes on a
      // checkerboard so they dissolve into the sky instead.
      for (let i = 5; i > 0; i--) {
        const rr = r + i * 2;
        const c = mix(p.glowC, keys[Math.min(keys.length - 1, 2)], 0.42 + i * 0.1);
        glowRing(g, sunX, sunY, rr, c, i > 1 ? 2 : 1);
      }
      disc(g, sunX, sunY, r, p.bodyC);
      if (p.night) {
        // crescent bite + craters
        disc(g, sunX + 4, sunY - 2, r - 1, keys[1]);
        px(g, sunX - 3, sunY + 1, 'grey2'); px(g, sunX - 1, sunY + 3, 'grey2');
      } else {
        disc(g, sunX - 2, sunY - 2, Math.round(r * 0.45), 'white');
      }
      sea._sunX = sunX;

      // clouds, far layers first
      for (const c of clouds) {
        if (c.y > skyH - 4) continue;
        drawCloud(g, x + ((c.x % (w + 200)) - 100), y + c.y, c, p, storm);
      }

      // birds
      for (const b of birds) {
        if (b.y > skyH - 6) continue;
        const flap = Math.sin(t * 8 + b.ph) > 0 ? 0 : 1;
        const bx = Math.round(x + (b.x % (w + 120)) - 60), by = Math.round(y + b.y);
        const s = b.scale;
        line(g, bx - 3 * s, by - flap * s, bx, by + s, p.night ? 'grey0' : 'ink');
        line(g, bx, by + s, bx + 3 * s, by - flap * s, p.night ? 'grey0' : 'ink');
      }

      if (storm > 0.4) {
        // rain streaks, deterministic in (column, time bucket)
        const n = Math.round(storm * 90);
        for (let i = 0; i < n; i++) {
          const rx = x + ((i * 137 + Math.floor(t * 420)) % w);
          const ry = y + ((i * 71 + Math.floor(t * 620)) % Math.max(1, hy - y));
          line(g, rx, ry, rx - 1, ry + 4, 'water3');
        }
      }
    },

    drawFar(g, opt = {}) {
      const p = presetFor(opt.timeOfDay !== undefined ? opt.timeOfDay : tod);
      const x = opt.x || 0, w = opt.w || 640, y = opt.y || 0;
      const hy = opt.horizonY !== undefined ? opt.horizonY : y + Math.round((opt.h || 360) * 0.42);
      const par = opt.parallax !== undefined ? opt.parallax : 1;

      for (const depth of [0, 1]) {
        for (const isle of isles) {
          if (isle.depth !== depth) continue;
          const ix = Math.round(x + isle.x + t * (depth ? 1.4 : 0.5) * par) % (w + 260) - 130;
          const c = depth ? p.far2 : p.far;
          const bh = isle.h * (depth ? 1 : 0.75);
          for (let i = 0; i < isle.w; i++) {
            const u = i / isle.w;
            const prof = isle.spike
              ? Math.max(0, 1 - Math.abs(u - 0.5) * 2.4)
              : Math.sin(u * Math.PI) ** 0.7;
            const hh = Math.round(prof * bh);
            if (hh <= 0) continue;
            rect(g, x + ix + i, hy - hh, 1, hh, c);
            if (i > 0 && i < isle.w - 1 && hh > 2) px(g, x + ix + i, hy - hh, mix(c, P.white, 0.18));
          }
          if (isle.light) {
            const lx = Math.round(x + ix + isle.w * 0.5);
            const ly = hy - Math.round(bh) - 10;
            rect(g, lx - 1, ly, 3, 10, 'bone');
            rect(g, lx - 1, ly + 3, 3, 1, 'red1');
            rect(g, lx - 2, ly - 2, 5, 2, 'wood1');
            // sweeping beam
            const beam = (t * 0.7) % 2;
            if (beam < 1) {
              const bl = Math.round(28 * Math.sin(beam * Math.PI));
              for (let i = 0; i < bl; i++) {
                if ((i + Math.floor(t * 30)) % 3 === 0) continue;
                px(g, lx + 2 + i, ly + 1 - Math.round(i * 0.15), 'gold');
              }
            }
            px(g, lx, ly + 1, 'gold');
          }
        }
      }
      // the horizon line itself
      rect(g, x, hy - 1, w, 1, p.horizon);
    },

    drawWater(g, opt = {}) {
      const p = presetFor(opt.timeOfDay !== undefined ? opt.timeOfDay : tod);
      const storm = clamp(opt.storm || 0, 0, 1);
      const x = opt.x || 0, y = opt.y || 0, w = opt.w || 640, h = opt.h || 360;
      const hy = opt.horizonY !== undefined ? opt.horizonY : y + Math.round(h * 0.42);
      const bottom = y + h;
      const waterH = Math.max(1, bottom - hy);
      const keys = storm > 0.35 ? p.water.map((k) => mix(k, P.ink, storm * 0.45)) : p.water;
      const foamC = storm > 0.5 ? 'white' : p.foam;

      const n = keys.length;
      // the depth ramp comes from the bake; only the crests are live
      const bake = ensureBake(opt);
      if (bake.cv) {
        const bh = Math.max(1, (opt.h || 360) - bake.hy);
        g.drawImage(bake.cv, 0, bake.hy, w, bh, x, hy, w, waterH);
      }
      drawSwells(g, x, y, w, hy, waterH, t, keys, foamC, storm);
      for (let i = 0; i < waterH; i++) {
        const yy = hy + i;
        // depth curve: rows bunch up near the horizon, which is what sells the recession
        const k = Math.pow(i / waterH, 0.78);
        const fk = k * (n - 1);
        const i0 = Math.min(n - 1, Math.floor(fk));
        const band = keys[i0];
        if (!bake.cv) {
          const i1 = Math.min(n - 1, i0 + 1);
          dither(g, x, yy, w, 1, band, keys[i1], Math.round((fk - i0) * 16));
        }

        // foam crests: spacing, length and scroll speed all grow with depth
        const spacing = Math.max(2, Math.round(2 + k * 10));
        if ((i + Math.floor(t * (2 + k * 5))) % spacing === 0) {
          const speed = 5 + k * k * 130;
          const gap = Math.max(4, Math.round(7 + k * 20));
          const amp = (1 + k * 3.5) * (1 + storm * 2);
          const phase = t * speed + i * 9;
          const crest = k > 0.5 ? foamC : mix(foamC, band, 0.5);
          for (let cx2 = -gap; cx2 < w + gap; cx2 += gap) {
            const wob = Math.sin((cx2 + phase) * 0.05 + i * 0.4) * amp;
            const sx = Math.round(x + ((cx2 + phase * 0.6) % (w + gap * 2)) - gap + wob);
            if (sx > x + w) continue;
            // dash length varies per crest so the row is not a dotted rule
            const dashLen = Math.max(2, Math.round((2 + k * 8) * (0.6 + 0.7 * Math.abs(Math.sin(cx2 * 0.37 + i)))));
            rect(g, sx, yy, Math.min(dashLen, x + w - sx), 1, crest);
            // a darker lip under the crest gives the wave thickness
            if (k > 0.42 && yy + 1 < bottom) {
              rect(g, sx + 1, yy + 1, Math.max(1, Math.min(dashLen - 1, x + w - sx - 1)), 1, mix(band, P.ink, 0.35));
            }
          }
        }
      }

      // specular glitter column under the sun/moon
      const sunX = sea._sunX !== undefined ? sea._sunX : x + Math.round(w * 0.72);
      const glintC = p.night ? 'ice' : mix(p.glowC, P.white, 0.35);
      for (let i = 0; i < waterH; i++) {
        const yy = hy + i;
        const k = Math.pow(i / waterH, 0.78);
        // the fan widens sharply toward the viewer, the way a real sun column does
        const spreadW = 3 + k * k * 150;
        const count = 1 + Math.round(k * 6);
        for (let j = 0; j < count; j++) {
          const sv = i * 37 + j * 911;
          if (Math.sin(t * (1.6 + (sv % 7) * 0.3) + sv * 0.77) < 0.62 - k * 0.25) continue;
          const gx = Math.round(sunX + hashUnit(sv) * spreadW);
          if (gx < x || gx >= x + w) continue;
          rect(g, gx, yy, k > 0.55 ? 2 : 1, 1, glintC);
        }
      }

      if (opt.reflect) {
        // a wobbling mirror of the sun disc, dissolving as it comes toward the viewer
        for (let i = 0; i < Math.min(waterH, 34); i++) {
          const yy = hy + i;
          // keep the wobble small — a big one turns the reflection into a rope
          const wob = Math.round(Math.sin(t * 2.2 + i * 0.6) * Math.min(2, 0.6 + i * 0.06));
          const ww = Math.max(2, 9 - Math.round(i / 5));
          dither(g, sunX - Math.round(ww / 2) + wob, yy, ww, 1,
            mix(p.glowC, keys[Math.min(keys.length - 1, 1)], 0.3), 'rgba(0,0,0,0)', Math.round((i / 34) * 15));
        }
      }

      if (opt.life !== false) drawPod(g, pod, x, y, w, hy, waterH, t, foamC);

      // live splashes
      for (const s of splashes) {
        const k = s.t / s.life;
        const r = Math.round(3 + k * 14 * s.power);
        ring(g, s.x, s.y, r, k > 0.6 ? mix(foamC, keys[2], 0.5) : foamC, 1);
        if (k < 0.4) ring(g, s.x, s.y, Math.round(r * 0.5), foamC, 1);
      }
    },

    /** Everything, in order. */
    /**
     * The whole seascape, composed.
     *
     * HALF RESOLUTION, THEN BLIT UP. The sky, the islands and the water are one big
     * soft dithered background, and at 960x540 drawing them a pixel at a time cost
     * 8500 canvas calls a frame -- on its own, more than a 60fps budget, and this
     * layer is in the menu, the deck, the cutscenes and the summary.
     *
     * So it renders into an offscreen canvas at half size and is blitted back at 2x.
     * The call count drops by four, the animation is untouched, and the LOOK is
     * arguably better: the sea's dither becomes 2px chunky, which reads as background
     * against the crisp 1px foreground instead of competing with it. Foreground
     * layers -- the deck, the animals, all UI -- are unaffected and stay 1:1.
     *
     * Pass `crisp: true` to opt out and draw at full resolution (nothing does today,
     * but a close-up would want it).
     */
    draw(g, opt = {}) {
      const o2 = Object.assign({ x: 0, y: 0, w: 640, h: 360 }, opt);
      if (o2.horizonY === undefined) o2.horizonY = o2.y + Math.round(o2.h * 0.42);
      if (o2.crisp) { drawAt(g, o2); return; }

      const hw = Math.ceil(o2.w / 2), hh = Math.ceil(o2.h / 2);
      if (!half || half.canvas.width !== hw || half.canvas.height !== hh) {
        half = makeCanvas(hw, hh);
      }
      if (!half) { drawAt(g, o2); return; }        // no offscreen support: draw direct
      // the offscreen is its own coordinate space, so the layers are drawn at 0,0
      drawAt(half.g, {
        x: 0,
        y: 0,
        w: hw,
        h: hh,
        horizonY: Math.round((o2.horizonY - o2.y) / 2),
        timeOfDay: o2.timeOfDay,
        storm: o2.storm,
        parallax: o2.parallax,
        reflect: o2.reflect,
      });
      g.drawImage(half.canvas, 0, 0, hw, hh, o2.x, o2.y, hw * 2, hh * 2);
    },
  };

  function drawAt(gg, o2) {
    sea.drawSky(gg, o2);
    sea.drawFar(gg, o2);
    sea.drawWater(gg, o2);
    for (const b of boats) drawBoat(gg, b, t);
  }

  return sea;
}

function drawCloud(g, cx, cy, c, p, storm) {
  const base = storm > 0.4 ? 'grey0' : p.night ? 'night' : c.layer === 0 ? 'white' : c.layer === 1 ? 'bone' : 'grey2';
  const shade = storm > 0.4 ? 'ink' : p.night ? 'shadow' : mix(base, P.grey1, 0.45);
  const w = Math.round(c.w), h = Math.max(3, Math.round(c.h));
  const lumps = Math.max(3, c.lumps + 1);
  // Cumulus reads as a flat-bottomed stack of domes, so the lumps ride a common
  // baseline and only their tops vary.
  const baseY = cy + Math.round(h * 0.5);
  let topMin = baseY;
  for (let i = 0; i < lumps; i++) {
    const u = i / (lumps - 1);
    const lx = Math.round(cx - w / 2 + w * u);
    const bulge = Math.sin(u * Math.PI) ** 0.6;
    const lr = Math.max(2, Math.round((w / lumps) * 0.85));
    const lh = Math.max(2, Math.round(h * (0.45 + 0.85 * bulge * (0.75 + 0.25 * Math.sin(i * 2.1 + c.seed)))));
    ellipse(g, lx, baseY - lh, lr, lh, base);
    topMin = Math.min(topMin, baseY - lh * 2);
  }
  rect(g, Math.round(cx - w / 2) + 2, baseY, w - 4, 1, shade);
  // lit crown on the sunward side of each dome top
  for (let i = 0; i < lumps; i++) {
    const u = i / (lumps - 1);
    const lx = Math.round(cx - w / 2 + w * u);
    const bulge = Math.sin(u * Math.PI) ** 0.6;
    const lh = Math.max(2, Math.round(h * (0.45 + 0.85 * bulge * (0.75 + 0.25 * Math.sin(i * 2.1 + c.seed)))));
    rect(g, lx - Math.round((w / lumps) * 0.4), baseY - lh * 2 + 1, Math.round((w / lumps) * 0.6), 1, mix(base, P.white, 0.55));
  }
  void topMin;
}

// THE CINEMATIC KIT. A camera, a frame clock, effects, and three rigs that actually move.
//
// WHAT WAS WRONG WITH THE CUTSCENES, and it was the same thing every time: they were
// ILLUSTRATIONS ON A TIMER. Each shot was a still with a sine wave on one of its parts -- the
// rain fell, the water rose, a silhouette slid across -- and a still that drifts is not
// animation, it is a screensaver. Four things were missing and all four are cheap:
//
//   A CAMERA. Not a scrolling background: a real transform with zoom, pan, roll and shake
//   that every shot is drawn through, so a shot can push in on a face, whip-pan to what it
//   is looking at, and snap back. Camera movement is most of what makes a static drawing feel
//   like a shot, and it costs one save/restore.
//
//   A FRAME CLOCK. Animation drawn on every frame at sixty is SMOOTH, and smooth reads as
//   floating. Hand animation is on twos and threes -- twelve or eight distinct poses a second
//   -- and quantising the pose clock while leaving the camera smooth is the single biggest
//   difference between "moving picture" and "cartoon".
//
//   COMIC TIMING. A hold before the punch, a hard cut on it, two frames of white, and a beat
//   of nothing after. The engine has to be able to STOP, which a sine wave cannot.
//
//   RIGS THAT HAVE LEGS. A silhouette that slides has no weight. Three rigs -- a biped, a
//   quadruped and a bird -- each built from limbs driven by a phase, so a run cycle plants
//   feet, a charge has a stride, and a wingbeat has a downstroke that snaps.
//
// Nothing in here knows about the story. It knows about time, transforms and bodies.

import { P, mix } from '../core/palette.js';
import {
  rect, disc, ellipse, ellipseFrame, tri, line, wash, clamp, lerp, W, H,
} from '../core/pixel.js';

/* ------------------------------------------------------------------- the camera */

export function makeCam() {
  return { x: 0, y: 0, zoom: 1, roll: 0, shake: 0, shakeT: 0, flash: 0, flashCol: 'white' };
}

/**
 * Interpolate a camera from a keyframe list at u (0..1 through the shot).
 *
 * keys = [{ at, x, y, zoom, roll, ease }] -- `at` in 0..1, and any field left out holds its
 * previous value. Deliberately not a full animation system: a shot is two to four keys, and
 * anything that needs more than that is two shots.
 */
const EASES = {
  linear: (k) => k,
  in: (k) => k * k,
  out: (k) => 1 - (1 - k) * (1 - k),
  inout: (k) => (k < 0.5 ? 2 * k * k : 1 - 2 * (1 - k) * (1 - k)),
  // SNAP is the one that matters for comic timing: nothing, then all of it at the end.
  snap: (k) => (k < 0.72 ? k * 0.08 : 0.058 + (k - 0.72) / 0.28 * 0.942),
  // and WHIP: most of the move in the first fifth, then a settle
  whip: (k) => (k < 0.2 ? (k / 0.2) * 1.06 : 1.06 - 0.06 * ((k - 0.2) / 0.8)),
};

export function camKeys(cam, keys, u) {
  if (!keys || !keys.length) return cam;
  // HOLD OUTSIDE THE SHOT. Before the first key and after the last one, the camera is PARKED
  // on that key -- it does not extrapolate and it certainly does not run backwards. The first
  // cut did neither: past the last key nothing satisfied `at >= u`, so `b` stayed on keys[0]
  // and the shot interpolated from its final framing back towards its opening one, which is
  // a camera that lurches home the instant a shot overruns by a frame.
  const first = keys[0], last = keys[keys.length - 1];
  const t = clamp(u, first.at || 0, last.at || 0);
  let a = first, b = last;
  for (let i = 0; i < keys.length; i++) {
    if ((keys[i].at || 0) <= t) a = keys[i];
    if ((keys[i].at || 0) >= t) { b = keys[i]; break; }
  }
  const span = Math.max(1e-6, (b.at || 0) - (a.at || 0));
  const raw = clamp((t - (a.at || 0)) / span, 0, 1);
  const ease = EASES[b.ease || a.ease || 'inout'] || EASES.inout;
  const k = ease(raw);
  const pick = (f, d) => (a[f] !== undefined ? a[f] : d);
  const pickB = (f, d) => (b[f] !== undefined ? b[f] : pick(f, d));
  cam.x = lerp(pick('x', 0), pickB('x', 0), k);
  cam.y = lerp(pick('y', 0), pickB('y', 0), k);
  cam.zoom = lerp(pick('zoom', 1), pickB('zoom', 1), k);
  cam.roll = lerp(pick('roll', 0), pickB('roll', 0), k);
  return cam;
}

/** Kick the camera. Decays on its own; call cam.tick from the scene. */
export function camKick(cam, mag = 6, dur = 0.28) {
  if (mag >= cam.shake || cam.shakeT <= 0) { cam.shake = mag; cam.shakeDur = dur; cam.shakeT = dur; }
  else cam.shakeT = Math.max(cam.shakeT, dur * 0.6);
}

export function camFlash(cam, col = 'white', dur = 0.1) {
  cam.flash = dur; cam.flashDur = dur; cam.flashCol = col;
}

export function camTick(cam, dt) {
  if (cam.shakeT > 0) cam.shakeT = Math.max(0, cam.shakeT - dt);
  if (cam.flash > 0) cam.flash = Math.max(0, cam.flash - dt);
}

/**
 * Wrap a draw in the camera.
 *
 * ROUNDED TO WHOLE PIXELS. A sub-pixel translate on a pixel-art frame resamples every edge in
 * it, so a slow push-in that is mathematically smooth comes out as a shimmering mess. The
 * camera moves in whole pixels and the zoom in whole eighths, which is what keeps a moving
 * shot as crisp as a still one.
 */
export function camWrap(g, cam, fn) {
  // A CAMERA THAT IS NOT A NUMBER MUST NOT BLANK THE GAME. One caller passed its decay rate
  // and its delta the wrong way round, the zoom went to NaN, and every draw inside the
  // transform landed nowhere: the whole scene came out as an empty black frame. Anything
  // non-finite falls back to an identity camera, which loses the effect and keeps the picture.
  const num = (v, d) => (Number.isFinite(v) ? v : d);
  const q = (n) => Math.round(num(n, 0));
  const z = Math.max(0.5, Math.round(num(cam.zoom, 1) * 8) / 8);
  let sx = 0, sy = 0;
  if (cam.shakeT > 0) {
    const k = (cam.shakeT / (cam.shakeDur || 0.28)) ** 1.3;
    // deterministic wobble: two out-of-phase sines beat a random number for a shake you can
    // tune, and it never picks the same direction twice in a row the way rand() does
    sx = Math.round(Math.sin(cam.shakeT * 91) * cam.shake * k);
    sy = Math.round(Math.cos(cam.shakeT * 77) * cam.shake * k);
  }
  g.save();
  g.translate(q(W / 2 + sx), q(H / 2 + sy));
  if (num(cam.roll, 0)) g.rotate(cam.roll);
  g.scale(z, z);
  g.translate(q(-W / 2 - num(cam.x, 0)), q(-H / 2 - num(cam.y, 0)));
  try { fn(); } finally { g.restore(); }
  if (cam.flash > 0) {
    wash(g, 0, 0, W, H, cam.flashCol, clamp(cam.flash / (cam.flashDur || 0.1), 0, 1) * 0.85);
  }
}

/* -------------------------------------------------------------------- timing */

/**
 * THE FRAME CLOCK. Quantise a time to a pose rate.
 *
 * onTwos(t) gives twelve poses a second, onThrees eight. Use it for BODIES and never for the
 * camera: a quantised camera judders, and a smooth body floats. That split is the whole trick.
 */
export function onTwos(t, fps = 12) { return Math.floor(t * fps); }
export function onThrees(t) { return Math.floor(t * 8); }

/** A phase 0..1 that steps rather than slides — a cycle on the frame clock. */
export function cyc(t, period, steps = 6) {
  return Math.floor(((t / period) % 1) * steps) / steps;
}

/**
 * Comic timing, as a function.
 *
 * beat(u, marks) walks a list of [at, kind] and returns which beat u is in and how far
 * through it. `kind` is a name the shot understands; the engine only cares that beats are
 * ordered, because that is what lets a shot say "hold, hold, HIT, nothing" and get it.
 */
export function beat(u, marks) {
  let ix = 0;
  for (let i = 0; i < marks.length; i++) if (u >= marks[i][0]) ix = i;
  const at = marks[ix][0];
  const next = ix + 1 < marks.length ? marks[ix + 1][0] : 1;
  return { ix, kind: marks[ix][1], k: clamp((u - at) / Math.max(1e-6, next - at), 0, 1) };
}

/* ------------------------------------------------------------------- effects */

/** Speed lines. The cheapest way to say FAST, and they have to be BEHIND the thing. */
export function speedLines(g, x, y, n, len, ang, tone = 'white', spread = 40) {
  // A SPEED LINE IS A HAIRLINE, AT AN ANGLE. The first version drew each one as a rect of
  // width |cos*len| and height |sin*len|, which for anything off the axes is a SOLID FILLED
  // BOX: every diagonal dash in the prologue -- the eagle's dive, the elephant's charge, the
  // run down the street -- was a grey slab pasted over the shot. Lines are stepped, three
  // pixels at a time, exactly like the rain.
  const ca = Math.cos(ang), sa = Math.sin(ang);
  for (let i = 0; i < n; i++) {
    const off = ((i * 37) % spread) - spread / 2;
    const l = len * (0.5 + ((i * 53) % 100) / 100);
    const px = x - ca * 6 - sa * off;
    const py = y - sa * 6 + ca * off;
    const th = i % 3 === 0 ? 3 : 2;
    const steps = Math.max(2, Math.round(l / 3));
    for (let k = 0; k < steps; k++) {
      rect(g, px + ca * (l * k / steps) - th / 2, py + sa * (l * k / steps) - th / 2, th, th,
        k > steps * 0.7 ? mix(P[tone] || P.white, P.ink, 0.45) : tone);
    }
  }
}

/** A ring of dust where something landed. Two rings, offset, so it has a front and a back. */
export function dust(g, x, y, k, tone = 'sand') {
  const r = 10 + k * 90;
  const a = 1 - k;
  for (let i = 0; i < 14; i++) {
    const ang = (i / 14) * Math.PI * 2;
    const rr = r * (0.7 + ((i * 31) % 60) / 100);
    const px = x + Math.cos(ang) * rr;
    const py = y + Math.sin(ang) * rr * 0.34;
    const s = Math.max(2, Math.round(8 * a));
    rect(g, px - s / 2, py - s / 2, s, s, i % 3 ? tone : mix(P[tone] || P.sand, P.white, 0.4));
  }
}

/** Debris: chunks on ballistic arcs. `seed` keeps the same shot identical every time. */
export function debris(g, x, y, k, n = 10, seed = 1, tone = 'wood1') {
  for (let i = 0; i < n; i++) {
    const h = ((i * 71 + seed * 13) % 100) / 100;
    const ang = -Math.PI * (0.15 + h * 0.7);
    const sp = 120 + h * 220;
    const px = x + Math.cos(ang) * sp * k;
    const py = y + Math.sin(ang) * sp * k + 520 * k * k;
    const s = 3 + ((i * 17) % 3) * 2;
    rect(g, px, py, s, s, i % 4 === 0 ? mix(P[tone] || P.wood1, P.ink, 0.4) : tone);
  }
}

/** A shock ring: one hard ellipse expanding. Reads as impact at any size. */
export function shockRing(g, x, y, k, tone = 'white') {
  // A RING IS A FRAME. `ellipse` fills, so the first version of this drew a solid white
  // ellipse two hundred and sixty pixels across over the top of the shot it was supposed to
  // punctuate: the impact frame of the biggest beat in the prologue was a blank oval.
  const r = 12 + k * 260;
  const a = 1 - k;
  const th = Math.max(1, Math.round(7 * a));
  for (let i = 0; i < th; i++) {
    ellipseFrame(g, x, y, r - i * 2, (r - i * 2) * 0.32,
      i < 2 ? tone : mix(P[tone] || P.white, P.ink, 0.35));
  }
  // and a second, faster ring behind it, so the impact has a leading edge
  const r2 = 12 + Math.min(1, k * 1.7) * 300;
  if (k < 0.6) ellipseFrame(g, x, y, r2, r2 * 0.3, mix(P[tone] || P.white, P.ink, 0.5));
}

/** Cracks running out from a point. The one effect that says a WALL just lost. */
export function cracks(g, x, y, k, n = 6, seed = 3, tone = 'ink') {
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + seed;
    let px = x, py = y;
    const len = 40 + ((i * 53 + seed * 7) % 70);
    const steps = Math.round(len * clamp(k, 0, 1) / 6);
    for (let s = 0; s < steps; s++) {
      const wob = Math.sin(s * 1.7 + i) * 0.4;
      px += Math.cos(ang + wob) * 6;
      py += Math.sin(ang + wob) * 6;
      rect(g, px, py, 3, 3, tone);
    }
  }
}

/** A smear frame: the thing drawn three times along its path, fading. Sells a fast move. */
export function smear(g, drawFn, x0, y0, x1, y1, n = 3) {
  for (let i = 0; i < n; i++) {
    const k = i / n;
    const a = 0.22 + k * 0.4;
    const prev = g.globalAlpha;
    g.globalAlpha = a;
    drawFn(lerp(x0, x1, k), lerp(y0, y1, k));
    g.globalAlpha = prev;
  }
}

/** Rain, in sheets. Angled, layered by depth, and the near sheet is FAST. */
export function rainSheets(g, t, amount = 1, ang = 0.22) {
  for (let layer = 0; layer < 3; layer++) {
    const sp = 380 + layer * 520;
    const n = Math.round((30 + layer * 34) * amount);
    const len = 12 + layer * 16;
    const tone = layer === 0 ? mix(P.water1, P.ink, 0.3) : layer === 1 ? 'water2' : 'foam';
    for (let i = 0; i < n; i++) {
      const seed = i * 137 + layer * 31;
      const x = ((seed * 7) % (W + 200)) - 100 + ((t * sp * ang) % 200);
      const y = ((seed * 13 + t * sp) % (H + 120)) - 60;
      // RAIN IS A HAIRLINE. Width came out of the angle times the length, so at a
      // twenty-six-degree slant the near sheet was eleven pixels wide and forty long: the
      // prologue was falling fence posts. One pixel, two on the nearest sheet.
      const th = layer === 2 ? 2 : 1;
      // the slant is drawn as a stepped line rather than a wide rect, which is what a
      // one-pixel diagonal has to be
      const steps = Math.max(2, Math.round(len / 3));
      for (let k = 0; k < steps; k++) {
        rect(g, x + Math.round(k * 3 * ang), y + k * 3, th, 3, tone);
      }
    }
  }
}

/** God rays, from above. Hard-edged, because a soft gradient is not this game's language. */
export function rays(g, cx, cy, t, n = 7, tone = 'gold') {
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.19 + Math.sin(t * 0.4 + i) * 0.012;
    const wide = 10 + (i % 3) * 8;
    const far = 700;
    tri(g, cx, cy, cx + Math.cos(a) * far - wide, cy + Math.sin(a) * far,
      cx + Math.cos(a) * far + wide, cy + Math.sin(a) * far,
      i % 2 ? tone : mix(P[tone] || P.gold, P.white, 0.4));
  }
}

/** A vignette in hard bands. Focuses a shot without a blur. */
export function vignette(g, amt = 0.4) {
  const n = 7;
  for (let i = 0; i < n; i++) {
    const k = (1 - i / n) * amt;
    const inset = i * 14;
    wash(g, 0, inset, W, 10, 'ink', k);
    wash(g, 0, H - inset - 10, W, 10, 'ink', k);
    wash(g, inset, 0, 12, H, 'ink', k * 0.7);
    wash(g, W - inset - 12, 0, 12, H, 'ink', k * 0.7);
  }
}

/* ---------------------------------------------------------------------- rigs

Three bodies, each built from limbs driven by a phase, so they have WEIGHT. All three are
drawn as solid tone plus a one-pixel contour, at cutscene scale rather than sprite scale --
a cutscene figure is forty to a hundred pixels tall and gets to have a shoulder.
*/

function limbLine(g, x0, y0, x1, y1, th, tone, edge = 'ink') {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.max(1, Math.hypot(dx, dy));
  const n = Math.ceil(len / 2);
  // NO EDGE MEANS NO EDGE PASS. It used to draw one anyway with whatever `null` resolved to,
  // which was white -- so every call that asked for an un-contoured highlight got a white
  // halo two pixels wider than the highlight itself. The elephant's trunk came out looking
  // like a bandage with rungs in it, and that is the loudest shot in the prologue.
  if (edge) {
    for (let i = 0; i <= n; i++) {
      const k = i / n;
      const px = x0 + dx * k, py = y0 + dy * k;
      rect(g, px - th / 2 - 1, py - th / 2 - 1, th + 2, th + 2, edge);
    }
  }
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const px = x0 + dx * k, py = y0 + dy * k;
    rect(g, px - th / 2, py - th / 2, th, th, tone);
  }
}

/**
 * A BIPED, running or standing, at `frame` of a six-frame cycle.
 *
 * The cycle is the classic four contacts: reach, pass, reach, pass -- and the BODY DROPS on
 * the contact frames. That drop is the weight; without it a run cycle is a man riding an
 * invisible bicycle.
 */
export function drawFigure(g, x, y, sc, frame, o = {}) {
  const F = ((frame % 6) + 6) % 6;
  const run = o.run !== false;
  const cloth = o.cloth || 'parch1';
  const skin = o.skin || 'skin2';
  const hair = o.hair || 'wood1';
  const S = sc;
  // the drop: down on contacts (0 and 3), up on passes
  const drop = run ? [0, -2, -1, 0, -2, -1][F] * S : 0;
  const by = y + drop;
  const th = Math.max(2, Math.round(3 * S));
  // legs: two out of phase
  const legPh = [[-0.7, 0.6], [-0.2, 0.2], [0.4, -0.5], [0.7, -0.6], [0.2, -0.2], [-0.5, 0.4]][F];
  for (let i = 0; i < 2; i++) {
    const ph = run ? legPh[i] : (i ? 0.14 : -0.14);
    const kx = x + ph * 12 * S;
    const ky = by - 2 * S;
    const fx = x + ph * 20 * S;
    limbLine(g, x + (i ? 2 : -2) * S, by - 14 * S, kx, ky, th, i ? cloth : mix(P[cloth], P.ink, 0.22));
    limbLine(g, kx, ky, fx, y + 0.5 * S, th, i ? cloth : mix(P[cloth], P.ink, 0.22));
    rect(g, fx - 3 * S, y - S, 7 * S, 3 * S, 'wood0');
  }
  // the robe / torso
  const lean = run ? 0.2 : 0;
  const tx = x + lean * 10 * S;
  // A SHORTER ROBE, because the legs are the animation. At twenty-two pixels of cloth the hem
  // came down over the knees and a six-frame run cycle was a rectangle bobbing.
  const rh = 17 * S;
  rect(g, x - 8 * S - 1, by - 34 * S - 1, 16 * S + 2, rh + 2, 'ink');
  for (let i = 0; i < 4; i++) {
    rect(g, x - 8 * S, by - 34 * S + (i * rh) / 4, 16 * S, Math.ceil(rh / 4),
      mix(P[cloth], i < 1 ? P.white : P.ink, i < 1 ? 0.2 : (i - 1) * 0.11));
  }
  // the hem, cut on the diagonal by the lean, so the cloth moves with the run
  rect(g, x - 8 * S, by - 34 * S + rh - 2 * S, 16 * S, 2 * S, mix(P[cloth], P.ink, 0.42));
  // ARMS SWING FORWARD AND BACK, NOT ACROSS. Both elbows were placed from the body centre
  // plus a signed phase, so on every frame the two arms crossed over in front of the chest and
  // the figure ran with its arms folded in an X. An arm hangs off its own shoulder and stays
  // on its own side; only the amount of forward reach changes.
  const armPh = run ? [-legPh[0], -legPh[1]] : [0.12, -0.12];
  for (let i = 0; i < 2; i++) {
    const side = i ? 1 : -1;
    const sh = tx + side * 7 * S;
    const reach = armPh[i] * 11 * S;
    const ex = sh + reach * 0.55 + side * 2 * S;
    const ey = by - 24 * S + Math.abs(armPh[i]) * 3 * S;
    const t2 = i ? skin : mix(P[skin] || P.skin2, P.ink, 0.28);
    limbLine(g, sh, by - 31 * S, ex, ey, th, t2);
    limbLine(g, ex, ey, ex + reach * 0.7, ey + 8 * S - Math.abs(reach) * 0.3, th - 1, t2);
  }
  // the head
  const hx = tx + lean * 4 * S;
  const hy = by - 41 * S;
  rect(g, hx - 6 * S - 1, hy - 6 * S - 1, 12 * S + 2, 13 * S + 2, 'ink');
  rect(g, hx - 6 * S, hy - 6 * S, 12 * S, 13 * S, skin);
  rect(g, hx - 6 * S, hy - 6 * S, 12 * S, 5 * S, hair);
  rect(g, hx - 7 * S, hy - 2 * S, 3 * S, 9 * S, hair);        // the beard, on the far side
  if (o.mouth !== false) rect(g, hx + 1 * S, hy + 4 * S, 4 * S, 2 * S, 'ink');
  const eyeY = hy + Math.round(1 * S);
  rect(g, hx + 1 * S, eyeY, 2 * S, 2 * S, 'ink');
  if (o.wide) rect(g, hx + 1 * S, eyeY - S, 2 * S, S, 'white');
  return { hx, hy, by };
}

/**
 * A QUADRUPED at cutscene scale, at `frame` of six. Styled by `kind`.
 *
 * One rig, three animals: the elephant is the rig with a trunk and ears, the lion is the rig
 * with a mane, the ox is the rig with horns. What makes them different is proportion --
 * shoulder height, barrel depth, head size -- not three separate drawings, which is the only
 * way three of them get animated properly instead of one of them getting animated well.
 */
export function drawBeast(g, x, y, sc, frame, o = {}) {
  const F = ((frame % 6) + 6) % 6;
  const kind = o.kind || 'lion';
  const S = sc;
  const big = kind === 'elephant';
  const tone = o.tone || (big ? 'grey1' : kind === 'lion' ? 'gold' : 'wood2');
  const dark = mix(P[tone] || P.grey1, P.ink, 0.4);
  const flip = o.flip ? -1 : 1;
  const H2 = (big ? 46 : 34) * S;                 // shoulder height
  const L = (big ? 62 : 52) * S;                  // body length
  const drop = [0, -2, -1, 0, -2, -1][F] * S;
  const by = y - H2 + drop;
  const th = Math.max(3, Math.round((big ? 6 : 4.5) * S));

  // the four legs, front pair and back pair out of phase
  const ph = [[-0.7, 0.5, 0.6, -0.6], [-0.2, 0.2, 0.2, -0.2], [0.5, -0.6, -0.7, 0.5],
    [0.7, -0.5, -0.6, 0.6], [0.2, -0.2, -0.2, 0.2], [-0.5, 0.6, 0.5, -0.7]][F];
  const hipX = [L * 0.34, L * 0.28, -L * 0.3, -L * 0.36];
  for (let i = 0; i < 4; i++) {
    const near = i % 2 === 1;
    const lx = x + flip * hipX[i];
    const kx = lx + flip * ph[i] * 10 * S;
    const fx = lx + flip * ph[i] * 17 * S;
    const t2 = near ? tone : dark;
    limbLine(g, lx, by + 4 * S, kx, y - 12 * S, th, t2);
    limbLine(g, kx, y - 12 * S, fx, y - S, th - 1, t2);
    rect(g, fx - 4 * S, y - 2 * S, 9 * S, 4 * S, 'ink');
    rect(g, fx - 3 * S, y - 2 * S, 7 * S, 3 * S, dark);
  }
  // THE BARREL IS A MASS AND NOT A BOX. Six horizontal bands inside a rectangle is a
  // rectangle: the elephant came out as a grey filing cabinet on legs and the lion as a
  // yellow one. Rows of an ellipse, with the top rows lit and a spine line along the very
  // top, and it is a body.
  const bh = (big ? 32 : 23) * S;
  const bcy = by - bh * 0.5 + 2 * S;
  const brx = L / 2, bry = bh * 0.62;
  for (let dy = -Math.ceil(bry); dy <= Math.ceil(bry); dy++) {
    const ty = dy / bry;
    if (ty * ty > 1) continue;
    // fatter at the shoulder than at the hip, so it has a front
    const hw = brx * Math.sqrt(1 - ty * ty * 0.86);
    const skew = flip * brx * 0.06 * (1 - ty * ty);
    const f2 = (dy + bry) / (bry * 2);
    const t2 = mix(P[tone] || P.grey1, f2 < 0.34 ? P.white : P.ink,
      f2 < 0.34 ? 0.2 - f2 * 0.4 : (f2 - 0.34) * 0.5);
    rect(g, x - hw + skew - 1, bcy + dy, hw * 2 + 2, 1, 'ink');
    rect(g, x - hw + skew, bcy + dy, hw * 2, 1, t2);
  }
  rect(g, x - brx * 0.7, bcy - bry, brx * 1.4, Math.max(1, S),
    mix(P[tone] || P.grey1, P.white, 0.3));
  // A RIM, when the shot asks for one. A dark beast on a dark night is a hole with an eye in
  // it: one lit pixel down the leading edge is the whole difference, and it is the same trick
  // a live-action cameraman would use for the same reason.
  if (o.rim) {
    for (let dy = -Math.ceil(bry); dy <= Math.ceil(bry); dy++) {
      const ty = dy / bry;
      if (ty * ty > 1) continue;
      const hw = brx * Math.sqrt(1 - ty * ty * 0.86);
      const skew = flip * brx * 0.06 * (1 - ty * ty);
      rect(g, x + flip * hw + skew - (flip > 0 ? 2 * S : 0), bcy + dy, 2 * S, 1, o.rim);
    }
  }

  // the neck and head
  const hx = x + flip * (L * 0.55);
  const hy = bcy - bry * (big ? 1.15 : 0.95);
  limbLine(g, x + flip * (L * 0.32), bcy - bry * 0.55, hx, hy, th * 2.2, tone);
  const hr = (big ? 15 : 12) * S;
  // the skull, as a disc with a muzzle off the front rather than a square
  disc(g, hx, hy, hr + 1, 'ink');
  disc(g, hx, hy, hr, tone);
  disc(g, hx - flip * hr * 0.3, hy - hr * 0.3, hr * 0.7,
    mix(P[tone] || P.grey1, P.white, 0.16));
  if (!big) {
    ellipse(g, hx + flip * hr * 0.8, hy + hr * 0.35, hr * 0.7, hr * 0.42, 'ink');
    ellipse(g, hx + flip * hr * 0.8, hy + hr * 0.35, hr * 0.62, hr * 0.34,
      mix(P[tone] || P.gold, P.ink, 0.2));
  }
  // the eye: red if it is corrupted, which is most of the time in this story
  const ex = hx + flip * hr * 0.4;
  rect(g, ex - 2 * S, hy - hr * 0.2, 4 * S, 4 * S, o.eye || 'red2');
  rect(g, ex - 2 * S, hy - hr * 0.2, 2 * S, 2 * S, 'white');

  if (big) {
    // the ear, a plate behind the head, and the trunk, in segments that swing
    // THE EAR IS A PLATE, NOT A PANEL. A rectangle behind the head read as a suitcase strapped
    // to the elephant, and the ear is the single most recognisable thing on the animal.
    const swing = Math.sin(F * 1.05) * 6 * S;
    const flap = [0, 0.12, 0.2, 0.12, 0, -0.1][F];
    const ecx = hx - flip * hr * (0.7 + flap), ecy = hy + hr * 0.2;
    ellipse(g, ecx, ecy, hr * (1.35 + flap), hr * 1.5, 'ink');
    ellipse(g, ecx, ecy, hr * (1.24 + flap), hr * 1.4, dark);
    ellipse(g, ecx - flip * hr * 0.2, ecy - hr * 0.24, hr * 0.78, hr * 0.9,
      mix(P[tone] || P.grey1, P.ink, 0.2));
    // the fold along the top of the ear
    ellipseFrame(g, ecx, ecy - hr * 0.1, hr * (1.1 + flap), hr * 1.15,
      mix(P[tone] || P.grey1, P.ink, 0.45));
    // and a domed forehead, which is the other half of the read
    ellipse(g, hx, hy - hr * 0.5, hr * 0.86, hr * 0.6, mix(P[tone] || P.grey1, P.white, 0.2));
    const seg = [];
    let tx = hx + flip * hr * 0.75, ty = hy + hr * 0.55;
    for (let i = 0; i < 7; i++) {
      const nx = tx + flip * (4 * S + swing * 0.12);
      const ny = ty + 7 * S;
      seg.push([tx, ty, nx, ny, Math.max(4, (11 - i) * S)]);
      tx = nx; ty = ny;
    }
    for (const [ax, ay, bx2, by2, w] of seg) limbLine(g, ax, ay, bx2, by2, w + 3, 'ink', 'ink');
    for (const [ax, ay, bx2, by2, w] of seg) {
      limbLine(g, ax, ay, bx2, by2, w, tone, tone);
      // one lit pixel down the front of each segment, which is what makes it a tube
      limbLine(g, ax + flip * w * 0.3, ay, bx2 + flip * w * 0.3, by2, Math.max(2, w * 0.28),
        mix(P[tone] || P.grey1, P.white, 0.18), null);
    }
    // and the wrinkles across it, which is the whole read of an elephant's trunk
    seg.forEach(([ax, ay, bx2, by2, w], i) => {
      void bx2; void by2;
      if (i === 0) return;
      rect(g, ax - w / 2, ay, w, Math.max(1, S), mix(P[tone] || P.grey1, P.ink, 0.35));
    });
    // tusks, out and forward from under the trunk's root, in a pair
    for (const s2 of [-1, 1]) {
      const t0x = hx + flip * hr * 0.35, t0y = hy + hr * 0.62 + s2 * hr * 0.12;
      limbLine(g, t0x, t0y, t0x + flip * hr * 1.15, t0y + hr * (0.5 + s2 * 0.12), 5 * S, 'ink', 'ink');
      limbLine(g, t0x, t0y, t0x + flip * hr * 1.15, t0y + hr * (0.5 + s2 * 0.12), 4 * S, 'bone');
      disc(g, t0x + flip * hr * 1.15, t0y + hr * (0.5 + s2 * 0.12), 2.4 * S, 'white');
    }
  } else if (kind === 'lion') {
    // the mane, drawn round the skull and then the skull put back on top of it
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = hr * (1.35 + (i % 2) * 0.14);
      disc(g, hx + Math.cos(a) * rr, hy + Math.sin(a) * rr, 6.5 * S, 'ink');
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const rr = hr * (1.35 + (i % 2) * 0.14);
      disc(g, hx + Math.cos(a) * rr, hy + Math.sin(a) * rr, 5.4 * S, i % 2 ? 'rust' : 'wood2');
    }
    disc(g, hx, hy, hr, tone);
    disc(g, hx - flip * hr * 0.3, hy - hr * 0.3, hr * 0.7,
      mix(P[tone] || P.gold, P.white, 0.16));
    ellipse(g, hx + flip * hr * 0.8, hy + hr * 0.35, hr * 0.7, hr * 0.42, 'ink');
    ellipse(g, hx + flip * hr * 0.8, hy + hr * 0.35, hr * 0.62, hr * 0.34,
      mix(P[tone] || P.gold, P.ink, 0.2));
    rect(g, ex - 2 * S, hy - hr * 0.2, 4 * S, 4 * S, o.eye || 'red2');
    rect(g, ex - 2 * S, hy - hr * 0.2, 2 * S, 2 * S, 'white');
  } else {
    for (const s2 of [-1, 1]) {
      limbLine(g, hx + s2 * hr * 0.5, hy - hr * 0.7,
        hx + s2 * hr * 1.5, hy - hr * 1.6, 4 * S, 'bone');
    }
  }

  // A HAUNCH AND A CHEST, because an ellipse is a bean. Two overlapping masses at the ends of
  // the barrel are what give a quadruped somewhere for its legs to come out of, and the
  // difference between a lion and a yellow sausage is entirely in these two shapes.
  if (!big) {
    const hq = x - flip * L * 0.3;
    ellipse(g, hq, bcy + bry * 0.1, bry * 0.86, bry * 0.86, 'ink');
    ellipse(g, hq, bcy + bry * 0.1, bry * 0.8, bry * 0.8, mix(P[tone] || P.gold, P.ink, 0.16));
    ellipse(g, hq - flip * bry * 0.2, bcy - bry * 0.25, bry * 0.5, bry * 0.45,
      mix(P[tone] || P.gold, P.white, 0.12));
    const ch = x + flip * L * 0.3;
    ellipse(g, ch, bcy + bry * 0.15, bry * 0.7, bry * 0.78,
      mix(P[tone] || P.gold, P.ink, 0.08));
    // and a tail, swishing on the frame clock
    const sw = [0, 1, 2, 1, 0, -1][F] * 4 * S;
    limbLine(g, x - flip * L * 0.48, bcy - bry * 0.3,
      x - flip * L * 0.78, bcy - bry * 0.9 + sw, 3 * S, tone);
    disc(g, x - flip * L * 0.8, bcy - bry * 0.95 + sw, 5 * S, 'ink');
    disc(g, x - flip * L * 0.8, bcy - bry * 0.95 + sw, 4 * S, dark);
  }
  return { hx, hy, by, L, H2 };
}

/**
 * AN ELEPHANT, PROPERLY, at `frame` of six.
 *
 * The generic quadruped can be dressed as a lion or an ox because those animals are a barrel
 * with a head on it. An elephant is not: it is a MASS on four columns with a dome for a head,
 * a plate for an ear and a tube for a nose, and every one of those parts is a different
 * proportion from every other animal in the game. Dressing the shared rig up as one gave a
 * purple bean with a segmented bar hanging off it -- and this is the loudest shot in the
 * prologue, so it gets its own rig.
 *
 * The numbers are in units of `sc`, ground at `y`, shoulder at -46 -- the same scale contract
 * as drawBeast, so a shot can swap one for the other without re-tuning the framing.
 */
export function drawElephant(g, x, y, sc, frame, o = {}) {
  const F = ((frame % 6) + 6) % 6;
  const S = sc;
  const flip = o.flip ? -1 : 1;
  const tone = o.tone || 'grey1';
  const T = P[tone] || P.grey1;
  const dark = mix(T, P.ink, 0.42);
  const deep = mix(T, P.ink, 0.62);
  const lite = mix(T, P.white, 0.2);
  const U = (n) => n * S;
  const fx = (n) => x + flip * U(n);
  const drop = [0, -1.6, -0.8, 0, -1.6, -0.8][F];
  const by = y + U(drop);

  // THE LEGS ARE COLUMNS. Four of them, the far pair a shade darker, each with a knee and a
  // foot -- an elephant's leg is a quarter as wide as it is tall and it does not taper much.
  const ph = [[-0.5, 0.4, 0.45, -0.45], [-0.15, 0.15, 0.15, -0.15], [0.4, -0.45, -0.5, 0.4],
    [0.5, -0.4, -0.45, 0.5], [0.15, -0.15, -0.15, 0.15], [-0.4, 0.45, 0.4, -0.5]][F];
  const hipX = [-22, -15, 15, 22];
  for (let i = 0; i < 4; i++) {
    const near = i === 1 || i === 3;
    const t2 = near ? dark : deep;
    const lx = fx(hipX[i]);
    const kx = lx + flip * U(ph[i] * 5);
    const ex = lx + flip * U(ph[i] * 9);
    limbLine(g, lx, by - U(24), kx, y - U(11), U(near ? 9 : 8), t2);
    limbLine(g, kx, y - U(11), ex, y - U(2), U(near ? 8 : 7), t2);
    rect(g, ex - U(5.5), y - U(3.4), U(11), U(3.4), 'ink');
    rect(g, ex - U(5), y - U(3), U(10), U(3), near ? mix(T, P.ink, 0.26) : deep);
    // toenails, which are the one small detail that says elephant and not hippopotamus
    for (let j = 0; j < 3; j++) {
      rect(g, ex - U(3.6) + U(j * 2.6), y - U(1.6), U(1.6), U(1.6),
        near ? mix(T, P.white, 0.1) : dark);
    }
  }
  // THE MASS. Rows of a big ellipse, lit along the spine, with a rump and a shoulder blended
  // into the ends so it is not a bean.
  const bcy = by - U(34), brx = U(30), bry = U(13.5);
  for (let dy = -Math.ceil(bry); dy <= Math.ceil(bry); dy++) {
    const ty = dy / bry;
    if (ty * ty > 1) continue;
    const hw = brx * Math.sqrt(1 - ty * ty * 0.8);
    const f = (dy + bry) / (bry * 2);
    const c = f < 0.3 ? mix(T, P.white, 0.18 - f * 0.4) : mix(T, P.ink, (f - 0.3) * 0.55);
    rect(g, x - hw - 1, bcy + dy, hw * 2 + 2, 1, 'ink');
    rect(g, x - hw, bcy + dy, hw * 2, 1, c);
  }
  ellipse(g, fx(-20), bcy + U(2), U(13), U(13), 'ink');
  ellipse(g, fx(-20), bcy + U(2), U(12), U(12), mix(T, P.ink, 0.22));
  ellipse(g, fx(-22), bcy - U(4), U(7), U(6), lite);
  ellipse(g, fx(16), bcy + U(3), U(14), U(13), 'ink');
  ellipse(g, fx(16), bcy + U(3), U(13), U(12), mix(T, P.ink, 0.14));
  rect(g, fx(-16), bcy - bry, U(30), Math.max(1, U(1)), lite);
  // the tail, with a tuft, swishing on the frame clock
  const sw = [0, 1, 2, 1, 0, -1][F];
  limbLine(g, fx(-31), bcy - U(6), fx(-38), bcy + U(6) + U(sw), U(2), dark);
  disc(g, fx(-38), bcy + U(7) + U(sw), U(2.4), 'ink');
  disc(g, fx(-38), bcy + U(7) + U(sw), U(1.8), dark);

  // THE HEAD: a dome, tall rather than round, sat at the front and top of the mass.
  const hcx = fx(33), hcy = by - U(44) + U(drop * 0.4);
  // the ear FIRST, behind the head: a huge plate, and it flaps
  const flap = [0, 0.1, 0.18, 0.1, 0, -0.08][F];
  const ecx = hcx - flip * U(11 + flap * 6), ecy = hcy + U(3);
  ellipse(g, ecx, ecy, U(15 + flap * 3), U(18), 'ink');
  ellipse(g, ecx, ecy, U(14 + flap * 3), U(17), dark);
  ellipse(g, ecx - flip * U(2), ecy - U(2), U(9), U(11), mix(T, P.ink, 0.3));
  ellipseFrame(g, ecx, ecy - U(1), U(11 + flap * 2), U(13), mix(T, P.ink, 0.5));
  // the skull
  ellipse(g, hcx, hcy, U(15), U(17), 'ink');
  ellipse(g, hcx, hcy, U(14), U(16), T);
  // the domed forehead, in two lobes, which is the silhouette people recognise
  ellipse(g, hcx - flip * U(4), hcy - U(6), U(8), U(8), lite);
  ellipse(g, hcx + flip * U(5), hcy - U(6), U(7), U(7), mix(T, P.white, 0.12));
  rect(g, hcx - U(1), hcy - U(14), U(2), U(10), mix(T, P.ink, 0.3));
  // the eye, and it is the only red thing on the animal
  const ex2 = hcx + flip * U(9);
  rect(g, ex2 - U(1.6), hcy - U(3), U(3.4), U(3.4), 'ink');
  rect(g, ex2 - U(1.2), hcy - U(2.6), U(2.6), U(2.6), o.eye || 'red2');
  rect(g, ex2 - U(1.2), hcy - U(2.6), U(1.2), U(1.2), 'white');

  // THE TUSKS, a pair, down and out from under the cheek -- drawn BEFORE the trunk, so the
  // trunk lies over them the way it does on the animal.
  for (const s2 of [-1, 1]) {
    const t0x = hcx + flip * U(3 + s2 * 2), t0y = hcy + U(8 + s2);
    const t1x = t0x + flip * U(15 + s2 * 4), t1y = t0y + U(14 + s2 * 3);
    limbLine(g, t0x, t0y, t1x, t1y, U(3.4), 'ink', 'ink');
    limbLine(g, t0x, t0y, t1x, t1y, U(2.4), mix(P.bone, P.wood1, 0.15));
    limbLine(g, t0x, t0y, t1x - flip * U(2), t1y - U(2), U(1.2), 'bone', null);
  }

  // THE TRUNK. Six segments on an S curve, wide at the root and curled at the tip, drawn in
  // two passes -- all the contours, then all the fills -- because a per-segment contour paints
  // over the previous segment's fill and the whole thing comes out as a ladder.
  const swing2 = [0, 1, 2, 1, 0, -1][F] * 0.6;
  const seg = [];
  let tx = hcx + flip * U(9), ty = hcy + U(10);
  const curve = o.trunk === 'raise'
    ? [[4.5, 3.4], [5, 0.6], [4.6, -2.4], [3.4, -5], [1, -6], [-2, -5]]
    : [[3.2, 7], [3.6, 7], [3, 7], [1.6, 6.5], [-1.4, 5], [-3.6, 2]];
  for (let i = 0; i < 6; i++) {
    const nx = tx + flip * U(curve[i][0] + swing2 * (i * 0.2));
    const ny = ty + U(curve[i][1]);
    seg.push([tx, ty, nx, ny, U(9 - i * 1.1)]);
    tx = nx; ty = ny;
  }
  for (const [ax, ay, bx2, by2, w] of seg) limbLine(g, ax, ay, bx2, by2, w + 3, 'ink', 'ink');
  for (const [ax, ay, bx2, by2, w] of seg) {
    limbLine(g, ax, ay, bx2, by2, w, T, null);
    const th = Math.max(1, Math.round(w * 0.16));
    limbLine(g, ax + flip * (w / 2 - th), ay, bx2 + flip * (w / 2 - th), by2, th,
      mix(T, P.white, 0.12), null);
    limbLine(g, ax - flip * (w / 2 - th), ay, bx2 - flip * (w / 2 - th), by2, th, dark, null);
  }
  // the wrinkles across it, one pixel, a shade down -- any more and it is a bandage
  seg.forEach(([ax, ay, , , w], i) => {
    if (!i) return;
    rect(g, ax - w / 2, ay, w, Math.max(1, U(0.7)), mix(T, P.ink, 0.28));
  });


  // A RIM, when the shot asks for one: a dark beast on a dark night is a hole with an eye in
  // it, and one lit edge is the whole difference.
  if (o.rim) {
    const rimC = mix(P[o.rim] || P.pink, T, 0.35);
    for (let dy = -Math.ceil(bry); dy <= Math.ceil(bry); dy += 2) {
      const ty2 = dy / bry;
      if (ty2 * ty2 > 1) continue;
      const hw = brx * Math.sqrt(1 - ty2 * ty2 * 0.8);
      rect(g, x + flip * hw - (flip > 0 ? 2 : 0), bcy + dy, 2, 1, rimC);
    }
    for (let dy = -17; dy <= 6; dy += 2) {
      const k2 = 1 - (dy * dy) / (17 * 17);
      if (k2 <= 0) continue;
      const hw = 15 * Math.sqrt(k2);
      rect(g, hcx + flip * U(hw) - (flip > 0 ? 2 : 0), hcy + U(dy), 2, Math.max(1, S), rimC);
    }
  }
  return { hx: hcx, hy: hcy, by, L: U(60), H2: U(46) };
}

/**
 * A BIRD, at `frame` of four. The wingbeat is the whole animation and it is NOT a sine: the
 * downstroke is fast and the recovery is slow, which is why a bird drawn on a sine wave looks
 * like it is swimming.
 */
export function drawBird(g, x, y, sc, frame, o = {}) {
  const F = ((frame % 4) + 4) % 4;
  const S = sc;
  const tone = o.tone || 'ink';
  const lite = o.lite || 'grey0';
  const flip = o.flip ? -1 : 1;
  // wing angles: down, down-fast, up, up-slow
  const wa = [0.5, 0.95, -0.7, -0.25][F];
  const span = (o.span || 46) * S;
  const bodyL = 26 * S;
  // THE WINGS ARE BROAD. Each course was a triangle from a single point on the body out to a
  // tip, which is a spike: a bird drawn that way has two darts stuck in it, and at any size
  // over about forty pixels it reads as a paper plane. A wing has a ROOT -- a base along the
  // shoulder and the hip -- and a span, and the courses stack back from the leading edge.
  for (const side of [-1, 1]) {
    const t2 = side < 0 ? mix(P[tone] || P.ink, P.ink, 0.45) : tone;
    const lift = side < 0 ? 0.82 : 1;              // the far wing sits a little behind
    for (let i = 0; i < 3; i++) {
      const l = span * (0.98 - i * 0.19) * lift;
      const ang = wa * 0.9 + i * 0.1;
      const b1x = x + flip * (8 - i * 3) * S, b1y = y - (5 + i * 2) * S;
      const b2x = x - flip * (11 + i * 4) * S, b2y = y - S;
      const tx2 = x - flip * l * 0.72, ty2 = y + Math.sin(ang) * l * 0.72 - i * 3 * S;
      tri(g, b1x, b1y, b2x, b2y, tx2, ty2,
        i === 0 ? t2 : mix(P[t2] || P.ink, P.white, 0.1 + i * 0.05));
      // the leading edge, one shade up, which gives the wing a top and a bottom
      if (i === 0) {
        limbLine(g, b1x, b1y, tx2, ty2, Math.max(2, 2.2 * S),
          mix(P[t2] || P.ink, P.white, 0.16), null);
      }
      // feather notches along the trailing edge of the outermost course
      if (i === 2) {
        for (let f2 = 0; f2 < 4; f2++) {
          const k2 = 0.45 + f2 * 0.16;
          rect(g, lerp(b2x, tx2, k2), lerp(b2y, ty2, k2), 2.4 * S, 2.4 * S,
            mix(P[t2] || P.ink, P.white, 0.2));
        }
      }
    }
  }
  // THE TAIL IS A FAN, not a dart. It was a triangle with its point away from the bird, which
  // is a swallow's tail, and a swallow is not what is meant to be coming out of that sky.
  const tl = bodyL * 0.9;
  const tk = (F % 2 ? 2 : -2) * S;
  tri(g, x - flip * bodyL * 0.4, y - 5 * S, x - flip * tl, y - 9 * S + tk,
    x - flip * tl, y + 9 * S + tk, 'ink');
  tri(g, x - flip * bodyL * 0.42, y - 4 * S, x - flip * (tl - 2), y - 7 * S + tk,
    x - flip * (tl - 2), y + 7 * S + tk, tone);
  for (let i = 0; i < 4; i++) {
    rect(g, x - flip * (tl - 1), y - 6 * S + tk + i * 4 * S, 2 * S, 3 * S,
      mix(P[tone] || P.ink, P.white, 0.14));
  }
  // the body
  ellipse(g, x, y, bodyL * 0.5, 9 * S, 'ink');
  ellipse(g, x, y, bodyL * 0.5 - 1, 9 * S - 1, tone);
  ellipse(g, x + flip * bodyL * 0.16, y + 3 * S, bodyL * 0.3, 5 * S, lite);
  // the head, and a HOOKED beak: two wedges, the upper one overhanging the lower
  const hx = x + flip * bodyL * 0.5;
  disc(g, hx, y - 4 * S, 8 * S, 'ink');
  disc(g, hx, y - 4 * S, 7 * S, tone);
  disc(g, hx - flip * 2 * S, y - 6 * S, 4 * S, mix(P[tone] || P.ink, P.white, 0.1));
  tri(g, hx + flip * 3 * S, y - 8 * S, hx + flip * 15 * S, y - 5 * S,
    hx + flip * 5 * S, y - 2 * S, 'gold');
  tri(g, hx + flip * 12 * S, y - 5 * S, hx + flip * 15 * S, y - 5 * S,
    hx + flip * 11 * S, y + 2 * S, mix(P.gold, P.rust, 0.5));
  tri(g, hx + flip * 4 * S, y - 3 * S, hx + flip * 11 * S, y - 3 * S,
    hx + flip * 5 * S, y, mix(P.gold, P.ink, 0.35));
  rect(g, hx + flip * 2 * S, y - 8 * S, 3 * S, 3 * S, o.eye || 'red2');
  rect(g, hx + flip * 2 * S, y - 8 * S, 1.5 * S, 1.5 * S, 'white');
  // TALONS: three thin claws off a knuckle, out and forward on the dive frames. They used to
  // be two brass bars nine pixels thick, which read as a pair of banana skins.
  if (o.talons) {
    for (const s2 of [-1, 1]) {
      const kx = x + flip * (7 + s2) * S, ky = y + (7 + s2) * S;
      limbLine(g, x + flip * 3 * S, y + 5 * S, kx, ky, 3.4 * S, mix(P.brass1, P.wood1, 0.3));
      for (let c = 0; c < 3; c++) {
        const a2 = 0.5 + c * 0.42;
        limbLine(g, kx, ky, kx + flip * Math.cos(a2) * 8 * S, ky + Math.sin(a2) * 8 * S,
          1.6 * S, c === 1 ? 'bone' : mix(P.bone, P.wood1, 0.35));
      }
    }
  }
  return { hx, hy: y - 4 * S };
}

/* ------------------------------------------------------------------- letterbox */

/** The bars, and the caption on the lower one. A shot is a shot because it is framed. */
export function letterbox(g, h = 44) {
  rect(g, 0, 0, W, h, 'ink');
  rect(g, 0, H - h, W, h, 'ink');
  rect(g, 0, h, W, 1, mix(P.ink, P.wood0, 0.6));
  rect(g, 0, H - h - 1, W, 1, mix(P.ink, P.wood0, 0.6));
}

export { EASES, limbLine };
void line; void H;

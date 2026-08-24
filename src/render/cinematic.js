// Cinematics: staged set-pieces that play over a dialogue beat.
//
// A cutscene line is a portrait and some type. A CINEMATIC is the thing the line is
// describing, happening on screen. There is one so far — the summoning — and it earns
// the module because the whole game turns on it: the moment a hundredweight of river
// clay stands up is the moment you find out what you are.
//
// Every cinematic is a pure function of (progress, time). No state, no easing objects,
// no callbacks: pass k in 0..1 and it draws that instant. That means the cutscene scene
// owns the clock, a screenshot tool can ask for any frame directly, and scrubbing
// backwards works for free.

import { P, col, mix } from '../core/palette.js';
import {
  rect, px, line, disc, ellipse, ellipseFrame, text, textW, wash, clamp, lerp, W, H,
} from '../core/pixel.js';
import { Ease } from '../core/juice.js';

/** The five beats of the summoning, and where each one starts. */
export const SUMMON_BEATS = [
  { at: 0.00, id: 'clay', label: 'THE RIVERBANK STIRS' },
  { at: 0.28, id: 'assemble', label: 'IT TAKES A SHAPE' },
  { at: 0.54, id: 'word', label: 'A WORD COMES DOWN' },
  { at: 0.70, id: 'strike', label: 'AND IS DRIVEN IN' },
  { at: 0.79, id: 'wake', label: 'IT OPENS ITS EYES' },
];

/** Which beat a progress value is in. */
export function summonBeat(k) {
  let out = SUMMON_BEATS[0];
  for (const b of SUMMON_BEATS) if (k >= b.at) out = b;
  return out;
}

// Deterministic scatter: the clay must land in the same place every frame, and the same
// place on a replay. Hashed, not seeded, because there is nothing to seed from here.
function h(n) {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * drawSummoning(g, k, t, o)
 *   k — progress 0..1 through the whole sequence
 *   t — wall time in seconds, for idle motion that should not depend on k
 *   o — { cx, groundY, scale } optional placement
 *
 * Returns the beat it drew, so the caller can fire audio and shake on a change.
 */
export function drawSummoning(g, k, t, o = {}) {
  k = clamp(k, 0, 1);
  const cx = o.cx !== undefined ? o.cx : Math.round(W * 0.5);
  const gy = o.groundY !== undefined ? o.groundY : Math.round(H * 0.72);
  const S = o.scale || 1;
  const beat = summonBeat(k);

  drawDusk(g, gy, k, t);
  drawRiverbank(g, cx, gy, k, t, S);

  // --- the figure's target geometry, in the same proportions as the portrait
  const shW = Math.round(52 * S);
  const chH = Math.round(84 * S);
  const chY = gy - Math.round(26 * S) - chH;
  const hr = Math.round(20 * S);
  const hy = chY - hr - Math.round(14 * S);

  // How far assembled each part is. Bottom-up: legs, torso, arms, head, each over its
  // own slice of the assemble beat, so the body builds rather than fading in.
  const asm = (from, to) => Ease.outCubic(clamp((k - from) / (to - from), 0, 1));
  const legK = asm(0.24, 0.36);
  const torsoK = asm(0.32, 0.46);
  const armK = asm(0.42, 0.54);
  const headK = asm(0.50, 0.60);

  // --- loose clay still on its way in
  drawFlyingClay(g, cx, gy, k, t, S);

  if (legK > 0) drawLegs(g, cx, gy, shW, S, legK);
  if (torsoK > 0) drawTorso(g, cx, chY, chH, shW, S, torsoK, k, t);
  if (armK > 0) drawArms(g, cx, chY, chH, shW, S, armK);
  if (headK > 0) drawHead(g, cx, hy, hr, S, headK, k, t);

  // --- the word: a plate on a shaft of light, then driven home
  if (k >= 0.50) drawTheWord(g, cx, hy, hr, S, k, t);

  // --- the strike: a hard ring of dust and a white blow-out
  if (k >= 0.70 && k < 0.80) {
    const sk = (k - 0.70) / 0.10;
    const r = 20 + sk * 260 * S;
    wash(g, 0, 0, W, H, 'white', (1 - sk) * 0.5);
    ellipseFrame(g, cx, gy, r, r * 0.3, 'bone');
    ellipseFrame(g, cx, gy, r * 0.8, r * 0.24, 'sand');
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      const d = r * (0.7 + h(i) * 0.4);
      px(g, cx + Math.cos(a) * d, gy + Math.sin(a) * d * 0.3, i % 2 ? 'wood3' : 'sand');
    }
  }

  // --- once awake, it breathes and the light leaks out of it
  if (k >= 0.79) {
    const wk = clamp((k - 0.79) / 0.21, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
    for (let i = 8; i >= 0; i--) {
      const f = i / 8;
      wash(g, cx - 120 * f * S, chY - 40 * f * S, 240 * f * S, (chH + 90) * f * S,
        'orange', 0.03 * wk * (0.6 + pulse * 0.4));
    }
  }

  // --- the beat's caption, on its own dark strip
  // Top-LEFT, not centred: the word plate falls down the centre line, and a centred
  // caption sat directly in its path.
  const cap = beat.label;
  const cw = textW(cap, { font: 7 }) + 40;
  const cy2 = Math.round(H * 0.09);
  // fade each caption in and out inside its own beat
  const next = SUMMON_BEATS[SUMMON_BEATS.indexOf(beat) + 1];
  const span = (next ? next.at : 1.001) - beat.at;
  const local = (k - beat.at) / span;
  const a = Math.min(1, Math.min(local / 0.18, (1 - local) / 0.18));
  if (a > 0.02) {
    const capX = 28;
    wash(g, capX - 14, cy2 - 6, cw, 30, 'ink', 0.7 * a);
    rect(g, capX - 14, cy2 - 6, cw, 1, 'brass1');
    rect(g, capX - 14, cy2 + 23, cw, 1, 'brass1');
    rect(g, capX - 14, cy2 - 6, 2, 30, 'brass3');
    text(g, cap, capX, cy2, 'brass3', { font: 7, alpha: a, shadow: 'ink' });
  }

  return beat;
}

/* ------------------------------------------------------------------ pieces */

/**
 * The sky over the bank. The cinematic owns its own backdrop rather than borrowing
 * whatever the scene had, so it composes the same in the game and in a screenshot --
 * and so the light can DARKEN as the word comes down, which is the whole point of the
 * strike reading as a strike.
 */
function drawDusk(g, gy, k, t) {
  // it gets darker and greener as the summoning takes hold
  const dark = clamp((k - 0.35) / 0.4, 0, 1);
  for (let y = 0; y < gy; y++) {
    const f = y / Math.max(1, gy);
    let c = f < 0.34 ? mix(P.night, P.purple0, f / 0.34)
      : f < 0.66 ? mix(P.purple0, P.rust, (f - 0.34) / 0.32)
        : mix(P.rust, P.brass2, (f - 0.66) / 0.34);
    if (dark > 0) c = mix(c, P.ink, dark * 0.55);
    rect(g, 0, y, W, 1, c);
  }
  // a low moon behind it all, and the first stars once the sky goes
  const mx = Math.round(W * 0.78), my = Math.round(gy * 0.34);
  disc(g, mx, my, 26, mix(P.bone, P.ink, dark * 0.4));
  disc(g, mx, my, 22, mix(P.white, P.ink, dark * 0.35));
  disc(g, mx - 7, my - 6, 6, mix(P.grey2, P.ink, dark * 0.3));
  for (let i = 0; i < 40; i++) {
    const sx = (i * 137) % W, sy = (i * 61) % Math.round(gy * 0.7);
    if (Math.sin(t * 1.4 + i) < 0.2) continue;
    px(g, sx, sy, dark > 0.3 ? 'white' : 'bone');
  }
  // the ark on the skyline, waiting for its animals. Kept clear of x < 240, which is
  // where the cutscene's portrait frame sits.
  const ax = Math.round(W * 0.36), ay = gy - 26;
  rect(g, ax - 46, ay, 92, 14, mix(P.wood0, P.ink, 0.3));
  rect(g, ax - 40, ay - 10, 80, 10, mix(P.wood1, P.ink, 0.35));
  rect(g, ax - 30, ay - 18, 60, 8, mix(P.wood0, P.ink, 0.4));
  for (let i = -3; i <= 3; i++) px(g, ax + i * 12, ay + 4, 'amber');
}

function drawRiverbank(g, cx, gy, k, t, S) {
  // wet mud, lit from the low sun, with the hollow the clay came out of
  for (let y = gy; y < H; y++) {
    const f = (y - gy) / Math.max(1, H - gy);
    rect(g, 0, y, W, 1, f < 0.3 ? mix(P.wood1, P.wood0, f / 0.3)
      : f < 0.7 ? mix(P.wood0, P.shadow, (f - 0.3) / 0.4) : mix(P.shadow, P.ink, (f - 0.7) / 0.3));
  }
  rect(g, 0, gy, W, 1, 'wood2');
  // the hollow: a dark scoop that deepens as the clay leaves it
  const dig = Ease.outCubic(clamp(k / 0.3, 0, 1));
  const dw = Math.round(120 * S * (0.4 + dig * 0.6));
  ellipse(g, cx, gy + Math.round(6 * S), dw, Math.round(14 * S * dig + 2), 'wood0');
  ellipse(g, cx, gy + Math.round(5 * S), Math.round(dw * 0.8), Math.round(11 * S * dig + 1), 'ink');
  ellipseFrame(g, cx, gy + Math.round(6 * S), dw, Math.round(14 * S * dig + 2), 'wood2');
  // reeds either side, bending in the wind
  for (let i = 0; i < 26; i++) {
    const rx = (i * 71) % W;
    if (Math.abs(rx - cx) < dw * 0.9) continue;
    const rh = Math.round((14 + h(i) * 22) * S);
    const bend = Math.round(Math.sin(t * 1.2 + i) * 3);
    for (let j = 0; j < rh; j++) {
      px(g, rx + Math.round((bend * j) / rh), gy - j, j > rh - 4 ? 'moss' : 'green0');
    }
  }
  // water glinting at the very bottom edge
  for (let i = 0; i < 30; i++) {
    const wx = (i * 97 + Math.floor(t * 30)) % W;
    px(g, wx, H - 2 - (i % 3), i % 2 ? 'water3' : 'foam');
  }
}

/** Clumps of mud on their way up out of the bank. */
function drawFlyingClay(g, cx, gy, k, t, S) {
  const flying = clamp((0.62 - k) / 0.62, 0, 1);      // all gone by the time it stands
  if (flying <= 0) return;
  for (let i = 0; i < 34; i++) {
    // each clump has its own launch time, so they do not move as a block
    const born = h(i) * 0.34;
    const kk = clamp((k - born) / 0.30, 0, 1);
    if (kk <= 0 || kk >= 1) continue;
    const a = h(i + 50) * Math.PI * 2;
    const spread = (60 + h(i + 90) * 150) * S;
    const tx = cx + Math.cos(a) * spread * (1 - Ease.outCubic(kk));
    const rise = lerp(0, -(70 + h(i + 130) * 90) * S, Ease.outCubic(kk));
    const ty = gy + Math.round(rise) + Math.round(Math.sin(t * 3 + i) * 2);
    const r = Math.max(1, Math.round((2 + h(i + 170) * 4) * S));
    disc(g, tx, ty, r, i % 3 ? 'wood2' : 'wood1');
    px(g, tx - 1, ty - 1, 'wood3');
    // a trail of grit falling back
    for (let j = 1; j < 4; j++) px(g, tx + j, ty + j * 3, 'wood0');
  }
}

function drawLegs(g, cx, gy, shW, S, kk) {
  const lh = Math.round(26 * S * kk);
  for (const side of [-1, 1]) {
    const x = cx + side * Math.round(shW * 0.52) - Math.round(9 * S);
    rect(g, x - 1, gy - lh - 1, Math.round(18 * S) + 2, lh + 2, 'ink');
    rect(g, x, gy - lh, Math.round(18 * S), lh, 'wood1');
    rect(g, x, gy - lh, Math.round(6 * S), lh, 'wood2');
  }
}

function drawTorso(g, cx, chY, chH, shW, S, kk, k, t) {
  const grown = Math.round(chH * kk);
  const top = chY + chH - grown;
  for (let i = 0; i < grown; i++) {
    const f = (top + i - chY) / chH;
    const ww = Math.round(shW * (1 - f * 0.30));
    rect(g, cx - ww - 1, top + i, ww * 2 + 2, 1, 'ink');
    rect(g, cx - ww, top + i, ww * 2, 1, 'wood2');
    rect(g, cx - ww, top + i, Math.max(1, Math.round(ww * 0.42)), 1, 'wood3');
    rect(g, cx + Math.round(ww * 0.52), top + i, Math.round(ww * 0.48), 1, 'wood1');
  }
  // the heart-furnace, once there is a chest to put it in
  if (k >= 0.79 && kk > 0.9) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.6);
    const fy = chY + Math.round(chH * 0.40);
    disc(g, cx, fy, Math.round((8 + pulse * 3) * S), 'orange');
    disc(g, cx, fy, Math.round(4 * S), 'amber');
    disc(g, cx, fy, 1, 'white');
  }
  // seams, lighting up on waking
  if (kk > 0.6) {
    const lit = k >= 0.79;
    for (const [fx, fy] of [[-0.5, 0.16], [0.26, 0.3], [-0.14, 0.5], [0.5, 0.62]]) {
      const sx = cx + Math.round(shW * fx), sy = chY + Math.round(chH * fy);
      if (sy < top) continue;
      for (let i = 0; i < Math.round(9 * S); i++) {
        px(g, sx + i, sy + Math.round(Math.sin(i * 0.8) * 2), lit ? (i & 1 ? 'amber' : 'orange') : 'wood0');
      }
    }
  }
}

function drawArms(g, cx, chY, chH, shW, S, kk) {
  const ah = Math.round(chH * 0.82 * kk);
  for (const side of [-1, 1]) {
    const ax = cx + side * (shW - Math.round(4 * S));
    rect(g, ax - Math.round(8 * S) - 1, chY + 2, Math.round(16 * S) + 2, ah + 2, 'ink');
    rect(g, ax - Math.round(8 * S), chY + 3, Math.round(16 * S), ah, side < 0 ? 'wood2' : 'wood1');
    if (kk > 0.9) {
      rect(g, ax - Math.round(10 * S), chY + 3 + ah, Math.round(20 * S), Math.round(15 * S), 'wood2');
    }
  }
}

function drawHead(g, cx, hy, hr, S, kk, k, t) {
  const drop = Math.round((1 - Ease.outBack(kk)) * -60 * S);
  const y = hy + drop;
  rect(g, cx - hr - 1, y - hr - 1, hr * 2 + 2, hr * 2 + Math.round(6 * S) + 2, 'ink');
  rect(g, cx - hr, y - hr, hr * 2, hr * 2 + Math.round(5 * S), 'wood2');
  rect(g, cx - hr, y - hr, Math.round(hr * 0.75), hr * 2 + Math.round(5 * S), 'wood3');
  rect(g, cx + Math.round(hr * 0.45), y - hr, Math.round(hr * 0.55), hr * 2 + Math.round(5 * S), 'wood1');
  // the sockets: dark until the word lands, then furnace-lit
  const lit = k >= 0.79;
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.4);
  for (const side of [-1, 1]) {
    const ex = cx + side * Math.round(hr * 0.42);
    rect(g, ex - Math.round(3 * S), y - 2, Math.round(6 * S), Math.round(5 * S), 'ink');
    if (lit) {
      rect(g, ex - Math.round(3 * S), y - 2, Math.round(6 * S), Math.round(3 * S),
        pulse > 0.45 ? 'amber' : 'orange');
      rect(g, ex - 1, y - 2, 2, 1, 'white');
      wash(g, ex - Math.round(5 * S), y + Math.round(3 * S), Math.round(10 * S), Math.round(4 * S), 'orange', 0.25);
    }
  }
  // no mouth, just a carved line
  rect(g, cx - Math.round(hr * 0.4), y + Math.round(hr * 0.75), Math.round(hr * 0.8), 1, 'wood0');
}

function drawTheWord(g, cx, hy, hr, S, k, t) {
  const pw = Math.round(hr * 1.7), ph = Math.round(hr * 0.62);
  // 0.50..0.70 it descends on a shaft of light; after 0.70 it is seated in the brow
  const seated = hy - hr + 1;
  const fall = Ease.inQuad(clamp((k - 0.50) / 0.20, 0, 1));
  const py = Math.round(lerp(-40, seated, fall));

  if (k < 0.72) {
    // the shaft: brightest at the plate, fanning up out of frame
    for (let i = 0; i < 26; i++) {
      const f = i / 26;
      const ww = Math.round(pw * (0.6 + f * 2.4));
      wash(g, cx - ww / 2, py - Math.round(f * (py + 60)), ww, Math.round(6 * S), 'gold', 0.05 * (1 - f * 0.6));
    }
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + t * 2;
      px(g, cx + Math.cos(a) * (pw * 0.9), py + Math.sin(a) * (ph * 1.6), i % 2 ? 'gold' : 'brass3');
    }
  }
  // the plate itself
  rect(g, cx - pw / 2 - 1, py - 1, pw + 2, ph + 2, 'ink');
  rect(g, cx - pw / 2, py, pw, ph, 'brass1');
  rect(g, cx - pw / 2, py, pw, 1, 'brass3');
  rect(g, cx - pw / 2, py + ph - 1, pw, 1, 'brass0');
  const bright = k >= 0.79 ? (Math.sin(t * 1.4) > -0.1 ? 'gold' : 'brass2') : 'brass2';
  for (let i = 0; i < 3; i++) {
    const gx = cx - pw / 2 + 2 + i * Math.round((pw - 3) / 3);
    rect(g, gx, py + 1, Math.max(1, Math.round(S)), ph - 2, bright);
    px(g, gx + 1, py + 1 + (i % 2), bright);
  }
  px(g, cx - pw / 2, py + 1, 'grey2');
  px(g, cx + pw / 2 - 1, py + 1, 'grey2');
}

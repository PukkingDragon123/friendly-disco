// The particle system. Most of the "satisfying" lives in here.
//
// One preallocated pool, no allocation per emit, two draw layers so particles can sit
// behind or in front of the animals. Fade-out on the chunky kinds is DITHERED rather
// than alpha-blended, because a half-transparent pixel is the fastest way to make pixel
// art look cheap.

import { P, col, mix, alpha } from '../core/palette.js';
import {
  rect, px, line, disc, ring, ellipse, tri, dither, text, wash, clamp, lerp,
} from './pixel.js';
import { makeRng } from './rng.js';
import { Ease } from './juice.js';

export const KINDS = [
  'dust', 'spark', 'star', 'coin', 'chip', 'feather', 'splash', 'ring', 'smoke',
  'confetti', 'leaf', 'snow', 'bubble', 'shard', 'glint', 'text', 'score', 'heart',
  'zzz', 'hunger', 'trail',
];
const KIND_SET = new Set(KINDS);

// Higher priority survives when the pool is full.
const PRIORITY = {
  trail: 0, dust: 1, smoke: 1, snow: 1, spark: 2, bubble: 2, leaf: 2, feather: 2,
  splash: 3, shard: 3, ring: 4, star: 4, glint: 4, confetti: 4, heart: 4, zzz: 4,
  chip: 6, coin: 6, hunger: 7, text: 8, score: 9,
};

const DEFAULTS = {
  dust: { life: 0.55, speed: 24, gravity: -8, drag: 3.4, size: 2, color: 'grey2', spread: Math.PI * 2 },
  spark: { life: 0.26, speed: 100, gravity: 40, drag: 1.6, size: 1, color: 'white', color2: 'brass3', spread: Math.PI * 2 },
  star: { life: 0.7, speed: 52, gravity: 10, drag: 2.2, size: 3, color: 'gold', spread: Math.PI * 2 },
  coin: { life: 1.05, speed: 74, gravity: 210, drag: 0.35, size: 3, color: 'brass3', color2: 'brass1', spread: 1.1 },
  chip: { life: 0.55, speed: 40, gravity: 0, drag: 0, size: 2, color: 'sky', spread: Math.PI * 2 },
  feather: { life: 2.4, speed: 12, gravity: 12, drag: 1.1, size: 2, color: 'bone', spread: Math.PI * 2 },
  splash: { life: 0.75, speed: 82, gravity: 260, drag: 0.5, size: 2, color: 'foam', color2: 'water3', spread: 1.5 },
  ring: { life: 0.45, speed: 0, gravity: 0, drag: 0, size: 3, color: 'white', spread: 0 },
  smoke: { life: 1.5, speed: 14, gravity: -16, drag: 1.4, size: 3, color: 'grey1', spread: 0.9 },
  confetti: { life: 2.6, speed: 90, gravity: 150, drag: 0.7, size: 3, color: 'gold', color2: 'teal', spread: Math.PI * 2 },
  leaf: { life: 2.8, speed: 18, gravity: 22, drag: 1.2, size: 3, color: 'green1', color2: 'orange', spread: Math.PI * 2 },
  snow: { life: 4.5, speed: 8, gravity: 10, drag: 0.6, size: 1, color: 'ice', spread: Math.PI * 2 },
  bubble: { life: 1.5, speed: 20, gravity: -34, drag: 0.9, size: 2, color: 'foam', spread: 1.0 },
  shard: { life: 1.1, speed: 96, gravity: 320, drag: 0.5, size: 2, color: 'wood3', color2: 'wood1', spread: Math.PI * 2 },
  glint: { life: 0.42, speed: 0, gravity: 0, drag: 0, size: 5, color: 'white', spread: 0 },
  text: { life: 1.0, speed: 0, gravity: 26, drag: 0, size: 5, color: 'white', spread: 0 },
  score: { life: 1.25, speed: 0, gravity: 34, drag: 0, size: 5, color: 'gold', spread: 0 },
  heart: { life: 1.3, speed: 22, gravity: -22, drag: 1.2, size: 3, color: 'pink', spread: 0.7 },
  zzz: { life: 1.6, speed: 14, gravity: -18, drag: 0.8, size: 3, color: 'sky', spread: 0.5 },
  hunger: { life: 0.42, speed: 0, gravity: 0, drag: 0, size: 8, color: 'red2', spread: 0 },
  trail: { life: 0.24, speed: 0, gravity: 0, drag: 0, size: 2, color: 'cloth3', spread: 0 },
};

function blank() {
  return {
    live: false, kind: 'dust', layer: 1, pri: 0, born: 0,
    x: 0, y: 0, vx: 0, vy: 0, t: 0, life: 1,
    gravity: 0, drag: 0, size: 1, rot: 0, vrot: 0, phase: 0, sway: 0,
    c1: 'white', c2: null, str: '', font: 5,
    tx: 0, ty: 0, homing: false, onArrive: null, floorY: null, seedN: 0,
  };
}

export function createParticles(o = {}) {
  const limit = Math.max(32, o.limit || 900);
  const pool = new Array(limit);
  for (let i = 0; i < limit; i++) pool[i] = blank();
  let head = 0;
  let live = 0;
  let clock = 0;
  let rng = makeRng((o.seed || 'parts') + '/p');

  function take(pri) {
    // linear scan from a rotating head keeps this O(1) amortised
    for (let i = 0; i < limit; i++) {
      const p = pool[(head + i) % limit];
      if (!p.live) { head = (head + i + 1) % limit; return p; }
    }
    // full: evict the oldest particle of lower-or-equal priority
    let victim = null;
    for (let i = 0; i < limit; i++) {
      const p = pool[i];
      if (p.pri <= pri && (!victim || p.born < victim.born)) victim = p;
    }
    if (victim) { victim.live = false; live--; return victim; }
    return null;
  }

  const sys = {
    get count() { return live; },
    get limit() { return limit; },
    setLimit() { /* pool is fixed at construction; kept for API compatibility */ },
    setSeed(s) { rng = makeRng(String(s) + '/p'); },

    clear() { for (const p of pool) p.live = false; live = 0; },

    emit(kind, x, y, opt = {}) {
      if (!KIND_SET.has(kind)) kind = 'dust';
      const d = DEFAULTS[kind];
      const n = Math.max(1, Math.min(120, opt.count !== undefined ? opt.count : defaultCount(kind)));
      const pri = PRIORITY[kind] || 0;
      const r = opt.seed !== undefined ? makeRng(String(opt.seed)) : rng;
      const baseAngle = opt.angle !== undefined ? opt.angle : (kind === 'coin' || kind === 'splash' ? -Math.PI / 2 : 0);
      const spread = opt.spread !== undefined ? opt.spread : d.spread;
      const speed = opt.speed !== undefined ? opt.speed : d.speed;
      const life = opt.life !== undefined ? opt.life : d.life;

      for (let i = 0; i < n; i++) {
        const p = take(pri);
        if (!p) break;
        if (!p.live) live++;
        p.live = true; p.kind = kind; p.pri = pri; p.born = clock;
        p.layer = opt.layer === 'back' ? 0 : 1;
        p.t = 0;
        p.life = Math.max(0.02, life * (kind === 'trail' || kind === 'ring' ? 1 : r.range(0.82, 1.18)));
        p.x = x + (opt.jitter ? r.gauss(0, opt.jitter) : 0);
        p.y = y + (opt.jitter ? r.gauss(0, opt.jitter) : 0);
        const a = baseAngle + (spread ? r.range(-spread / 2, spread / 2) : 0);
        const sp = speed * (speed ? r.range(0.55, 1.25) : 0);
        p.vx = Math.cos(a) * sp;
        p.vy = Math.sin(a) * sp;
        p.gravity = opt.gravity !== undefined ? opt.gravity : d.gravity;
        p.drag = opt.drag !== undefined ? opt.drag : d.drag;
        p.size = Math.max(1, opt.size !== undefined ? opt.size : d.size);
        p.rot = r.range(0, Math.PI * 2);
        p.vrot = r.range(-7, 7);
        p.phase = r.range(0, Math.PI * 2);
        p.sway = r.range(0.6, 1.8);
        p.c1 = opt.color || d.color;
        p.c2 = opt.color2 || d.color2 || null;
        p.str = opt.text !== undefined ? String(opt.text) : '';
        p.font = opt.font || d.size === 5 ? (opt.font || 5) : 5;
        p.seedN = r.int(1024);
        p.floorY = opt.floorY !== undefined ? opt.floorY : null;
        p.onArrive = opt.onArrive || null;
        if (opt.target) {
          p.homing = true; p.tx = opt.target.x; p.ty = opt.target.y;
          p.vx = 0; p.vy = 0;
        } else p.homing = false;
        // fixed straight-up launch for the label kinds
        if (kind === 'text' || kind === 'score') {
          p.vx = opt.vx !== undefined ? opt.vx : r.range(-6, 6);
          p.vy = opt.vy !== undefined ? opt.vy : -26;
        }
      }
      return sys;
    },

    burst(kind, x, y, opt) { return sys.emit(kind, x, y, opt); },

    update(dt) {
      clock += dt;
      for (let i = 0; i < limit; i++) {
        const p = pool[i];
        if (!p.live) continue;
        p.t += dt;
        if (p.t >= p.life) {
          p.live = false; live--;
          if (p.onArrive) { const f = p.onArrive; p.onArrive = null; f(p); }
          continue;
        }
        const k = p.t / p.life;

        if (p.homing) {
          // ease straight to the target so chips visibly fly into the readout
          const e = Ease.inOutCubic(clamp(k / 0.92, 0, 1));
          p.x = lerp(p.x0 !== undefined ? p.x0 : (p.x0 = p.x), p.tx, e);
          p.y = lerp(p.y0 !== undefined ? p.y0 : (p.y0 = p.y), p.ty, e)
            - Math.sin(e * Math.PI) * 18;      // arc it
          if (k >= 0.92 && p.onArrive) { const f = p.onArrive; p.onArrive = null; f(p); }
          continue;
        }

        p.vy += p.gravity * dt;
        if (p.drag) { const f = 1 / (1 + p.drag * dt); p.vx *= f; p.vy *= f; }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vrot * dt;

        switch (p.kind) {
          case 'feather': case 'leaf':
            p.x += Math.sin(p.t * 3.1 * p.sway + p.phase) * 22 * dt;
            break;
          case 'snow':
            p.x += Math.sin(p.t * 1.4 * p.sway + p.phase) * 12 * dt;
            break;
          case 'bubble':
            p.x += Math.sin(p.t * 8 + p.phase) * 10 * dt;
            break;
          case 'zzz': case 'heart':
            p.x += Math.sin(p.t * 4 + p.phase) * 14 * dt;
            break;
          default: break;
        }

        if (p.floorY !== null && p.y > p.floorY && p.vy > 0) {
          p.y = p.floorY; p.vy *= -0.42; p.vx *= 0.72;
          if (Math.abs(p.vy) < 12) { p.vy = 0; p.gravity = 0; }
        }
      }
    },

    /** draw(g) draws both layers; draw(g,'back'|'front') draws one. */
    draw(g, layer) {
      const want = layer === 'back' ? 0 : layer === 'front' ? 1 : -1;
      for (let i = 0; i < limit; i++) {
        const p = pool[i];
        if (!p.live) continue;
        if (want >= 0 && p.layer !== want) continue;
        drawOne(g, p);
      }
    },
  };

  return sys;
}

function defaultCount(kind) {
  switch (kind) {
    case 'ring': case 'glint': case 'text': case 'score': case 'hunger': case 'trail': return 1;
    case 'splash': return 12;
    case 'confetti': return 14;
    case 'spark': return 6;
    default: return 6;
  }
}

/* -------------------------------------------------------------------- draw */

// Dither level for a fading chunky particle: solid until 55% of life, then thins out.
function fadeLevel(k) { return Math.round(clamp((k - 0.5) / 0.5, 0, 1) * 16); }

function drawOne(g, p) {
  const k = p.t / p.life;
  const x = Math.round(p.x), y = Math.round(p.y);
  const c = p.c1;

  switch (p.kind) {
    case 'dust': {
      const s = Math.max(1, Math.round(p.size * (1 + k * 0.8)));
      dither(g, x - s, y - s, s * 2, s * 2, c, 'rgba(0,0,0,0)', fadeLevel(k));
      break;
    }
    case 'smoke': {
      const s = Math.max(1, Math.round(p.size * (1 + k * 1.6)));
      dither(g, x - s, y - s, s * 2, s * 2, mix(col(c), P.ink, k * 0.5), 'rgba(0,0,0,0)', Math.round(k * 15));
      break;
    }
    case 'spark': {
      const tl = Math.min(3, Math.max(1, Math.round(Math.hypot(p.vx, p.vy) / 34)));
      const nx = p.vx === 0 && p.vy === 0 ? 0 : p.vx / Math.max(1, Math.hypot(p.vx, p.vy));
      const ny = p.vx === 0 && p.vy === 0 ? 0 : p.vy / Math.max(1, Math.hypot(p.vx, p.vy));
      line(g, x, y, Math.round(x - nx * tl), Math.round(y - ny * tl), k > 0.6 ? (p.c2 || c) : c);
      px(g, x, y, k > 0.5 ? (p.c2 || c) : 'white');
      break;
    }
    case 'star': {
      const s = Math.max(1, Math.round(p.size * (1 - k)));
      const sp = ((p.rot / Math.PI) % 1) > 0.5;
      if (sp) {
        rect(g, x - s, y, s * 2 + 1, 1, c);
        rect(g, x, y - s, 1, s * 2 + 1, c);
      } else {
        for (let d = -s; d <= s; d++) { px(g, x + d, y + d, c); px(g, x + d, y - d, c); }
      }
      px(g, x, y, 'white');
      break;
    }
    case 'coin': {
      const w = Math.max(1, Math.round(Math.abs(Math.cos(p.rot)) * p.size) + 1);
      ellipse(g, x, y, w, p.size, c);
      rect(g, x - w, y - 1, w * 2 + 1, 1, p.c2 || 'brass1');
      px(g, x - Math.max(0, w - 1), y - 1, 'white');
      break;
    }
    case 'chip': {
      const s = p.size;
      rect(g, x - s, y - s, s * 2, s * 2, c);
      rect(g, x - s, y - s, s * 2, 1, 'white');
      rect(g, x - s, y + s - 1, s * 2, 1, mix(col(c), P.ink, 0.4));
      break;
    }
    case 'feather': {
      const s = p.size;
      const lean = Math.sin(p.rot) > 0 ? 1 : -1;
      line(g, x, y - s, x + lean, y + s, c);
      px(g, x + lean, y + s, mix(col(c), P.ink, 0.3));
      px(g, x - lean, y - s + 1, 'white');
      break;
    }
    case 'splash': {
      px(g, x, y, c);
      if (p.size > 1) px(g, x, y - 1, p.c2 || 'water3');
      break;
    }
    case 'ring': {
      const r = Math.round(p.size + k * 14);
      ring(g, x, y, r, k > 0.6 ? mix(col(c), P.ink, 0.5) : c, 1);
      break;
    }
    case 'confetti': {
      const w = Math.max(1, Math.round(Math.abs(Math.cos(p.rot)) * p.size) + 1);
      const cc = Math.sin(p.rot) > 0 ? c : (p.c2 || c);
      rect(g, x - Math.round(w / 2), y - 1, w, 2, cc);
      break;
    }
    case 'leaf': {
      const w = Math.max(1, Math.round(Math.abs(Math.cos(p.rot)) * p.size));
      const cc = (p.seedN & 1) ? c : (p.c2 || c);
      ellipse(g, x, y, w, Math.max(1, Math.round(p.size / 2)), cc);
      px(g, x, y, mix(col(cc), P.ink, 0.4));
      break;
    }
    case 'snow': {
      px(g, x, y, k > 0.8 ? mix(col(c), P.ink, 0.4) : c);
      break;
    }
    case 'bubble': {
      ring(g, x, y, Math.max(1, p.size), c, 1);
      px(g, x - 1, y - 1, 'white');
      break;
    }
    case 'shard': {
      const s = p.size;
      const flip = Math.sin(p.rot) > 0;
      tri(g, x, y - s, x + (flip ? s : -s), y + s, x - (flip ? s : -s), y + s, (p.seedN & 1) ? c : (p.c2 || c));
      break;
    }
    case 'glint': {
      const s = Math.round(p.size * Math.sin(Math.PI * (1 - k)));
      if (s <= 0) break;
      rect(g, x - s * 2, y, s * 4 + 1, 1, c);
      rect(g, x, y - s, 1, s * 2 + 1, c);
      for (let d = 1; d <= Math.round(s / 2); d++) {
        px(g, x + d, y + d, c); px(g, x - d, y - d, c);
        px(g, x + d, y - d, c); px(g, x - d, y + d, c);
      }
      break;
    }
    case 'hunger': {
      // a chomping bite arc — two closing jaws
      const open = Math.sin((1 - k) * Math.PI) * p.size;
      const r = Math.round(p.size);
      for (let a = -0.9; a <= 0.9; a += 0.16) {
        px(g, Math.round(x + Math.cos(a) * r), Math.round(y - open + Math.sin(a) * r * 0.6), c);
        px(g, Math.round(x + Math.cos(a) * r), Math.round(y + open - Math.sin(a) * r * 0.6), c);
      }
      break;
    }
    case 'trail': {
      dither(g, x - 1, y - 1, 2, 2, c, 'rgba(0,0,0,0)', Math.round(k * 16));
      break;
    }
    case 'heart': {
      const s = Math.max(1, Math.round(p.size * (1 - k * 0.4)));
      rect(g, x - s, y - s, s, s, c);
      rect(g, x + 1, y - s, s, s, c);
      for (let i = 0; i <= s * 2; i++) rect(g, x - s + Math.floor(i / 2), y + Math.floor(i / 2), (s * 2 + 1) - i, 1, c);
      break;
    }
    case 'zzz': {
      if (k > 0.8 && (p.seedN + Math.floor(p.t * 20)) % 2 === 0) break;
      text(g, 'z', x, y, c, { font: 3 });
      break;
    }
    case 'text': {
      if (k > 0.78 && Math.floor(p.t * 22) % 2 === 0) break;
      text(g, p.str, x, y, c, { font: p.font, center: true, outline: 'ink' });
      break;
    }
    case 'score': {
      const s = Ease.outBack(clamp(k / 0.24, 0, 1));
      if (s <= 0.05) break;
      if (k > 0.82 && Math.floor(p.t * 22) % 2 === 0) break;
      // faux scale-up: draw the outline copy offset outward as it "slams" in
      const spread = Math.round((1 - s) * 4);
      if (spread > 0) text(g, p.str, x, y - spread, mix(col(c), P.white, 0.5), { font: p.font, center: true, outline: 'ink' });
      text(g, p.str, x, y, c, { font: p.font, center: true, outline: 'ink' });
      break;
    }
    default:
      px(g, x, y, c);
      break;
  }
}

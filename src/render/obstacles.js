// What is in the way, drawn.
//
// Fourteen obstacle kinds, one baked canvas each per (kind, radius, cleared, variant).
// A level holds five to nine of them and none of them ever moves, so the whole layer
// costs a handful of blits plus the live bits that have to breathe: lava glow, a strike
// zone's warning pulse, ripples on water.
//
// CLEARED IS DRAWN, NOT DELETED. A briar you have eaten becomes chewed stems, a
// landslide becomes a propped tunnel, black ice becomes slush. Seeing what you already
// solved is most of what makes a level feel like progress rather than like a list.

import { P, col, mix } from '../core/palette.js';
import { makeCanvas, rect, px, line, disc, ring, ellipse, tri, wash, clamp } from '../core/pixel.js';

const H2 = (n) => { const v = Math.sin(n * 91.7 + 47.3) * 39217.4; return v - Math.floor(v); };

const cache = new Map();
const CAP = 120;

function baked(kind, r, cleared, variant) {
  const k = `${kind}/${r}/${cleared ? 1 : 0}/${variant}`;
  let hit = cache.get(k);
  if (hit !== undefined) return hit;
  const S = (r + 6) * 2;
  const mk = makeCanvas(S, S);
  if (!mk) { cache.set(k, null); return null; }
  paint(mk.g, kind, S / 2, S / 2, r, cleared, variant);
  hit = { canvas: mk.canvas, half: S / 2 };
  if (cache.size > CAP) cache.clear();
  cache.set(k, hit);
  return hit;
}

export function clearObstacleCache() { cache.clear(); }

/* ------------------------------------------------------------------ painting */

/** A lumpy stone, lit from the top left. The base shape for four of the kinds. */
function stone(b, cx, cy, r, dark, mid, lite, v) {
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y)) * (0.92 + H2(v + y) * 0.16));
    if (w < 1) continue;
    const f = (y + r) / (2 * r);
    rect(b, cx - w, cy + y, w * 2, 1, f < 0.4 ? lite : f < 0.75 ? mid : dark);
    px(b, cx - w, cy + y, 'ink');
    px(b, cx + w - 1, cy + y, 'ink');
  }
  // two facets, which is what stops a disc reading as a ball
  for (let i = 0; i < 2; i++) {
    const a = H2(v + i * 7) * Math.PI * 2;
    const len = r * (0.5 + H2(v + i * 3) * 0.4);
    line(b, cx, cy - r * 0.2, cx + Math.cos(a) * len, cy + Math.sin(a) * len, dark);
  }
  rect(b, cx - Math.round(r * 0.4), cy - Math.round(r * 0.72), Math.round(r * 0.5), 1, 'white');
}

/** A pool of something: flat, rippled, darker in the middle. */
function pool(b, cx, cy, r, edge, mid, deep) {
  for (let y = -r; y <= r; y++) {
    const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
    if (w < 1) continue;
    const f = Math.abs(y) / r;
    rect(b, cx - w, cy + y, w * 2, 1, f > 0.8 ? edge : f > 0.42 ? mid : deep);
  }
  for (let i = 0; i < 5; i++) {
    const ry = cy - r + 3 + Math.round(H2(i * 5) * (r * 2 - 6));
    const rw = Math.round(Math.sqrt(Math.max(0, r * r - (ry - cy) ** 2)) * 0.6);
    rect(b, cx - rw, ry, rw * 2, 1, edge);
  }
  ring(b, cx, cy, r, mix(P[edge], P.white, 0.3), 1);
}

function paint(b, kind, cx, cy, r, cleared, v) {
  switch (kind) {
    case 'rock':
      if (cleared) {
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2, d = r * (0.4 + H2(v + i) * 0.6);
          stone(b, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.6, Math.max(2, r * 0.22),
            'stone0', 'stone1', 'stone2', v + i);
        }
      } else {
        stone(b, cx, cy, r, 'stone0', 'stone2', 'stone4', v);
      }
      break;

    case 'cliff':
      if (cleared) {
        // a trodden switchback: two zig lines of packed earth
        for (let i = 0; i < 4; i++) {
          const y = cy - r + 4 + i * Math.round((r * 2 - 8) / 4);
          rect(b, cx - r + (i % 2 ? 2 : 6), y, r * 2 - 8, 2, 'clay2');
          rect(b, cx - r + (i % 2 ? 2 : 6), y, r * 2 - 8, 1, 'clay4');
        }
      } else {
        for (let y = -r; y <= r; y++) {
          const f = (y + r) / (2 * r);
          const w = Math.round(r * (0.35 + f * 0.65));
          rect(b, cx - w, cy + y, w * 2, 1, f < 0.3 ? 'stone3' : f < 0.7 ? 'stone1' : 'stone0');
          if (y % 3 === 0) px(b, cx - w + 1, cy + y, 'stone2');
        }
        for (let i = 0; i < 6; i++) {
          px(b, cx - r + Math.round(H2(v + i) * r * 2), cy + Math.round(H2(v + i * 3) * r), 'stone4');
        }
      }
      break;

    case 'rubble':
      if (cleared) {
        // a dug tunnel: a dark mouth propped with roots
        stone(b, cx, cy, r, 'clay0', 'clay1', 'clay2', v);
        ellipse(b, cx, cy + 1, Math.round(r * 0.5), Math.round(r * 0.42), 'ink');
        for (let i = 0; i < 3; i++) rect(b, cx - r * 0.4 + i * r * 0.4, cy - r * 0.3, 1, r * 0.5, 'bark');
      } else {
        for (let i = 0; i < 9; i++) {
          const a = H2(v + i) * Math.PI * 2, d = r * H2(v + i * 5) * 0.8;
          stone(b, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, Math.max(2, r * 0.3),
            'clay0', 'clay2', 'clay4', v + i);
        }
      }
      break;

    case 'log': {
      const len = Math.round(r * 1.5), th = Math.round(r * 0.6);
      if (cleared) {
        // scrambled over: a trodden plank path along the trunk
        rect(b, cx - len, cy - 2, len * 2, 5, 'wood1');
        rect(b, cx - len, cy - 2, len * 2, 1, 'wood3');
        for (let i = 0; i < 7; i++) rect(b, cx - len + 3 + i * Math.round(len / 3.4), cy + 1, 2, 2, 'wood0');
        for (let i = 0; i < len; i += 4) px(b, cx - len + i, cy + 3, 'leaf1');
      } else {
        // A CAPSULE, not a crate. The trunk's ends round off and the top edge catches
        // the light -- a filled rectangle with a ring stuck on one end read as a box of
        // cargo, which is not a thing you climb over.
        for (let x = -len; x <= len; x++) {
          const e = Math.min(1, (len - Math.abs(x)) / Math.max(1, th * 0.9));
          const hh = Math.round(th * Math.sqrt(Math.max(0, e)));
          if (hh < 1) continue;
          for (let y = -hh; y <= hh; y++) {
            const f = (y + hh) / (2 * hh + 0.001);
            px(b, cx + x, cy + y, f < 0.22 ? 'wood3' : f < 0.62 ? 'bark' : f < 0.85 ? 'wood1' : 'wood0');
          }
          // bark grain, and moss along the sunlit top
          if ((x + len) % 5 === 0) px(b, cx + x, cy - hh + 1 + ((x * 7) % 3), 'wood0');
          if ((x + len) % 3 === 0) px(b, cx + x, cy - hh, 'leaf2');
          if ((x + len) % 11 === 0) px(b, cx + x, cy - hh - 1, 'leaf3');
        }
        // the cut end, with its rings
        ellipse(b, cx - len + 1, cy, 3, th, 'wood2');
        ring(b, cx - len + 1, cy, Math.max(2, th - 2), 'wood0', 1);
        ring(b, cx - len + 1, cy, Math.max(1, Math.round(th * 0.45)), 'wood1', 1);
        // a couple of snapped branches, so it reads as a tree that fell
        line(b, cx + len * 0.2, cy - th, cx + len * 0.45, cy - th - 6, 'wood1');
        line(b, cx - len * 0.4, cy + th, cx - len * 0.55, cy + th + 5, 'wood1');
      }
      break;
    }
    case 'thorns':
      if (cleared) {
        for (let i = 0; i < 10; i++) {
          const sx = cx - r + Math.round(H2(v + i) * r * 2);
          rect(b, sx, cy + Math.round(r * 0.4), 1, Math.max(2, r * 0.3), 'moss');
        }
        ellipse(b, cx, cy + r * 0.7, r, 2, 'leaf0');
      } else {
        // A BRIAR, not a lily pad. The first version was a dark ellipse with faint
        // scratches on it and read as a pond: what makes a thicket is the SPIKES
        // breaking its outline and the light caught on the top of the tangle.
        ellipse(b, cx, cy, r, Math.round(r * 0.8), 'leaf0');
        ellipse(b, cx, cy - Math.round(r * 0.18), Math.round(r * 0.8), Math.round(r * 0.5), 'leaf1');
        for (let i = 0; i < 30; i++) {
          const a = H2(v + i) * Math.PI * 2, d = r * (0.25 + H2(v + i * 7) * 0.95);
          const x2 = cx + Math.cos(a) * d, y2 = cy + Math.sin(a) * d * 0.86;
          line(b, cx + Math.cos(a) * d * 0.35, cy + Math.sin(a) * d * 0.35, x2, y2,
            i % 4 === 0 ? 'leaf3' : i % 2 ? 'leaf2' : 'leaf1');
          if (i % 3 === 0) px(b, x2, y2, i % 6 === 0 ? 'pink' : 'leaf4');
        }
        // and a few berries, which is the bit that makes a player want to eat it
        for (let i = 0; i < 4; i++) {
          const a = H2(v + i * 13) * Math.PI * 2, d = r * 0.55;
          disc(b, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 2, 'red1');
          px(b, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8 - 1, 'red2');
        }
      }
      break;

    case 'mud':
      if (cleared) {
        ellipse(b, cx, cy, r, Math.round(r * 0.7), 'clay2');
        rect(b, cx - r, cy - 2, r * 2, 5, 'clay3');
        rect(b, cx - r, cy - 2, r * 2, 1, 'clay4');
      } else {
        pool(b, cx, cy, r, 'clay2', 'clay1', 'clay0');
        for (let i = 0; i < 4; i++) {
          const a = H2(v + i * 11) * Math.PI * 2, d = r * 0.5 * H2(v + i);
          ring(b, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2, 'clay3', 1);
        }
      }
      break;

    case 'deep':
      pool(b, cx, cy, r, cleared ? 'water3' : 'water1', 'water0', cleared ? 'water1' : 'ink');
      if (cleared) {
        for (let i = 0; i < 3; i++) rect(b, cx - r + 4, cy - 4 + i * 4, r * 2 - 8, 1, 'foam');
      }
      break;

    case 'current':
      pool(b, cx, cy, r, 'foam', 'water2', 'water1');
      for (let i = 0; i < 4; i++) {
        const y = cy - r + 5 + i * Math.round((r * 2 - 10) / 3);
        const w = Math.round(Math.sqrt(Math.max(0, r * r - (y - cy) ** 2)) * 0.7);
        rect(b, cx - w, y, w * 2, 1, 'foam');
        if (!cleared) { px(b, cx + w - 2, y - 1, 'white'); px(b, cx + w - 3, y + 1, 'white'); }
      }
      break;

    case 'whirl': {
      pool(b, cx, cy, r, 'water2', 'water0', 'ink');
      for (let a = 0; a < Math.PI * 5; a += 0.22) {
        const d = (a / (Math.PI * 5)) * r;
        px(b, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, a < 6 ? 'ink' : 'water3');
      }
      break;
    }

    case 'gap':
      if (cleared) {
        for (let i = 0; i < 5; i++) rect(b, cx - r + i * Math.round(r * 0.5), cy - 3, Math.round(r * 0.36), 6, 'wood2');
      } else {
        ellipse(b, cx, cy, r, Math.round(r * 0.78), 'ink');
        ring(b, cx, cy, r, 'shadow', 1);
        // the broken ends of what used to bridge it
        for (let i = 0; i < 3; i++) {
          rect(b, cx - r - 2, cy - 6 + i * 6, Math.round(r * 0.4), 3, 'wood1');
          rect(b, cx + r - Math.round(r * 0.4) + 2, cy - 5 + i * 6, Math.round(r * 0.4), 3, 'wood1');
        }
      }
      break;

    case 'ice':
      if (cleared) {
        pool(b, cx, cy, r, 'snow0', 'water3', 'water2');
        for (let i = 0; i < 6; i++) px(b, cx - r + Math.round(H2(v + i) * r * 2), cy + Math.round((H2(v + i * 3) - 0.5) * r), 'snow1');
      } else {
        pool(b, cx, cy, r, 'white', 'ice', 'snow0');
        for (let i = 0; i < 4; i++) {
          const a = H2(v + i * 5) * Math.PI * 2;
          line(b, cx, cy, cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.75, 'snow0');
        }
      }
      break;

    case 'lava':
      pool(b, cx, cy, r, 'lava0', 'lava1', 'lava2');
      for (let i = 0; i < 6; i++) {
        const a = H2(v + i) * Math.PI * 2, d = r * (0.3 + H2(v + i * 3) * 0.6);
        disc(b, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, Math.max(1, r * 0.16), 'ash');
      }
      break;

    case 'wind':
      for (let i = 0; i < 5; i++) {
        const y = cy - r + 4 + i * Math.round((r * 2 - 8) / 4);
        const w = Math.round(Math.sqrt(Math.max(0, r * r - (y - cy) ** 2)) * 0.9);
        for (let x = -w; x < w; x += 5) px(b, cx + x, y, 'grey2');
      }
      break;

    case 'bolt':
      ellipse(b, cx, cy, r, Math.round(r * 0.8), 'ash');
      ring(b, cx, cy, r, 'brass1', 1);
      for (let i = 0; i < 8; i++) {
        const a = H2(v + i) * Math.PI * 2, d = r * H2(v + i * 5) * 0.8;
        px(b, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 'ink');
      }
      break;

    default:
      stone(b, cx, cy, r, 'stone0', 'stone2', 'stone4', v);
      break;
  }
}

/* ------------------------------------------------------------------ drawing */

/**
 * drawObstacle(g, o, sx, sy, t, opts)
 *   o    an obstacle row from game/rescue.js: {kind, r, cleared, seed, angle}
 *   sx, sy   screen centre
 *
 * One blit, plus whatever has to move.
 */
export function drawObstacle(g, o, sx, sy, t = 0, opts = {}) {
  const B = baked(o.kind, Math.round(o.r), o.cleared, (o.seed || 0) % 5);
  if (!B) return;
  const x = Math.round(sx - B.half), y = Math.round(sy - B.half);
  const prevA = g.globalAlpha;
  if (o.cleared) g.globalAlpha = 0.9;
  g.drawImage(B.canvas, x, y);
  g.globalAlpha = prevA;
  if (o.cleared) return;

  const r = o.r;
  switch (o.kind) {
    case 'lava': {
      // the crust breathes: two bright veins on their own cycle
      for (let i = 0; i < 3; i++) {
        const ph = (t * (0.7 + i * 0.3) + i * 2.1) % 1;
        const a = i * 2.4;
        const d = r * (0.2 + ph * 0.7);
        px(g, sx + Math.cos(a) * d, sy + Math.sin(a) * d * 0.8, ph < 0.5 ? 'lava2' : 'gold');
      }
      if (Math.sin(t * 2.2) > 0.85) wash(g, sx - r, sy - r, r * 2, r * 2, 'lava2', 0.14);
      break;
    }
    case 'bolt': {
      // the warning, then the strike. Both on the same clock so it can be read.
      const cyc = (t * 0.55) % 1;
      if (cyc > 0.82) {
        const k = (cyc - 0.82) / 0.18;
        wash(g, sx - r, sy - r, r * 2, r * 2, 'white', (1 - k) * 0.5);
        let bx = sx, by = sy - r * 3;
        for (let i = 0; i < 6; i++) {
          const nx = sx + (H2(i + Math.floor(t * 0.55) * 7) - 0.5) * r * 0.8;
          const ny = sy - r * 3 + ((i + 1) / 6) * r * 3;
          line(g, bx, by, nx, ny, i % 2 ? 'gold' : 'white');
          bx = nx; by = ny;
        }
      } else {
        ring(g, sx, sy, Math.round(r * (0.5 + cyc * 0.5)), 'brass2', 1);
      }
      break;
    }
    case 'deep': case 'current': case 'whirl': {
      const n = o.kind === 'whirl' ? 6 : 3;
      for (let i = 0; i < n; i++) {
        const ph = (t * (o.kind === 'current' ? 1.4 : 0.6) + i / n) % 1;
        if (o.kind === 'whirl') {
          const a = ph * Math.PI * 2 + i;
          const d = r * (1 - ph) * 0.9;
          px(g, sx + Math.cos(a) * d, sy + Math.sin(a) * d * 0.85, 'foam');
        } else {
          const y = sy - r + 4 + Math.round(ph * (r * 2 - 8));
          const w = Math.round(Math.sqrt(Math.max(0, r * r - (y - sy) ** 2)) * 0.75);
          rect(g, sx - w, y, w * 2, 1, 'foam');
        }
      }
      break;
    }
    case 'wind': {
      // gusts crossing the zone, which is the only way a wind reads at all
      for (let i = 0; i < 4; i++) {
        const ph = (t * 0.8 + i * 0.27) % 1;
        const y = sy - r + 6 + i * Math.round((r * 2 - 12) / 3);
        const x = sx - r + ph * r * 2;
        rect(g, Math.round(x), y, 7, 1, 'white');
        px(g, Math.round(x) + 7, y - 1, 'grey2');
      }
      break;
    }
    case 'mud': {
      const ph = (t * 0.5) % 1;
      ring(g, sx + Math.round(Math.sin(t) * r * 0.3), sy, Math.max(1, Math.round(ph * r * 0.5)),
        'clay3', 1);
      break;
    }
    default: break;
  }
  void col; void tri; void clamp;
}

/** A one-line label plate, used when the cursor is over an obstacle. */
export function obstacleGlyph(g, o, sx, sy) {
  const c = o.cleared ? 'leaf3' : o.ob.clearedBy ? o.ob.color : 'amber';
  ring(g, sx, sy, o.r + 3, c, 1);
}

// Scene transitions.
//
// A transition is a cover-swap-uncover: the overlay closes over the old scene, the swap
// happens at the midpoint while nothing is visible, and the overlay opens on the new one.
// Doing it this way means a scene never has to know it is being left, and a heavy enter()
// (baking a deck, rolling a manifest) lands behind the cover instead of hitching.

import { P, col, mix } from '../core/palette.js';
import { rect, px, line, disc, ellipse, tri, dither, wash, text, clamp, lerp, W, H } from './pixel.js';

export const KINDS = ['wave', 'light', 'iris', 'clouds', 'curtain'];


/** cover(p): 0 at the edges of the transition, 1 at the fully-covered midpoint. */
function coverage(p) { return p < 0.5 ? p * 2 : (1 - p) * 2; }

/**
 * drawTransition(g, kind, p, t)
 *  p — 0..1 through the whole transition
 *  t — wall clock, for animating the cover itself
 */
export function drawTransition(g, kind, p, t) {
  const k = clamp(coverage(p), 0, 1);
  if (k <= 0.001) return;
  const rising = p < 0.5;

  switch (kind) {
    case 'light': {
      // a holy wipe: white bloom plus rays turning out of the centre
      wash(g, 0, 0, W, H, 'white', Math.pow(k, 1.6));
      const cx = W / 2, cy = H / 2;
      const r = k * 460;
      g.fillStyle = col(mix('gold', 'white', k));
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2 + t * 0.4;
        const len = r * (0.55 + 0.45 * Math.abs(Math.sin(t * 2 + i)));
        for (let d = 0; d < len; d += 2) {
          const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
          if (x < 0 || x >= W || y < 0 || y >= H) break;
          g.fillRect(x | 0, y | 0, 2, 2);
        }
      }
      break;
    }

    case 'iris': {
      // everything outside a shrinking porthole goes dark
      const r = lerp(470, 0, k);
      g.fillStyle = col('ink');
      for (let y = 0; y < H; y++) {
        const dy = y - H / 2;
        const half = Math.sqrt(Math.max(0, r * r - dy * dy));
        if (half <= 0) { g.fillRect(0, y, W, 1); continue; }
        const x0 = Math.round(W / 2 - half), x1 = Math.round(W / 2 + half);
        if (x0 > 0) g.fillRect(0, y, x0, 1);
        if (x1 < W) g.fillRect(x1, y, W - x1, 1);
      }
      // a brass ring around the aperture
      if (r > 2 && r < 460) {
        for (let a = 0; a < 360; a += 2) {
          const rad = (a * Math.PI) / 180;
          px(g, W / 2 + Math.cos(rad) * r, H / 2 + Math.sin(rad) * r, 'brass2');
          px(g, W / 2 + Math.cos(rad) * (r + 1), H / 2 + Math.sin(rad) * (r + 1), 'wood1');
        }
      }
      break;
    }

    case 'clouds': {
      // two banks close on the middle
      const reach = k * (H / 2 + 26);
      for (const side of [-1, 1]) {
        const edge = side < 0 ? reach : H - reach;
        if (side < 0) rect(g, 0, 0, W, Math.max(0, Math.round(edge)), 'night');
        else rect(g, 0, Math.round(edge), W, H, 'night');
        // lumpy border
        for (let x = 0; x < W; x += 7) {
          const bump = Math.round(Math.sin(x * 0.09 + t * 1.4 + (side < 0 ? 0 : 2)) * 6 + 7);
          const y = side < 0 ? edge : edge - bump;
          ellipse(g, x + 3, Math.round(y), 7, bump, 'night');
          ellipse(g, x + 3, Math.round(y) + (side < 0 ? -1 : 1), 6, Math.max(1, bump - 2), side < 0 ? 'deep' : 'shadow');
        }
      }
      break;
    }

    case 'curtain': {
      // vertical timber slats sweeping in — used for the dock
      const cols = 16;
      const cw = Math.ceil(W / cols);
      for (let i = 0; i < cols; i++) {
        const lead = (i % 2 === 0 ? i : cols - i) / cols * 0.35;
        const kk = clamp((k - lead) / (1 - 0.35), 0, 1);
        const hh = Math.round(kk * H);
        const y = i % 2 === 0 ? 0 : H - hh;
        rect(g, i * cw, y, cw, hh, i % 2 ? 'wood1' : 'wood2');
        rect(g, i * cw, y, 1, hh, 'wood0');
        rect(g, i * cw + cw - 1, y, 1, hh, 'wood3');
      }
      break;
    }

    case 'wave':
    default: {
      // The water comes up and takes the screen, then drains. The whole game is about
      // this, so it is the default.
      const level = Math.round(lerp(H + 30, -30, Math.pow(k, 0.85)));
      const dir = rising ? 1 : -1;
      for (let y = Math.max(0, level); y < H; y++) {
        const d = (y - level) / Math.max(1, H - level);
        const band = d < 0.08 ? 'water3' : d < 0.24 ? 'water2' : d < 0.55 ? 'water1' : d < 0.8 ? 'water0' : 'deep';
        dither(g, 0, y, W, 1, band, 'deep', Math.round(d * 12));
        if (((y + Math.floor(t * 40 * dir)) % 6) === 0) {
          for (let x = 0; x < W; x += 26) {
            const sx = Math.round((x + t * 60) % W + Math.sin((x + t * 50) * 0.05) * 4);
            rect(g, sx, y, 8, 1, d < 0.3 ? 'foam' : 'water3');
          }
        }
      }
      // the crest: a wavy foam edge with spray above it
      for (let x = 0; x < W; x++) {
        const wob = Math.round(Math.sin(x * 0.055 + t * 3) * 4 + Math.sin(x * 0.017 - t * 2) * 3);
        const y = level + wob;
        if (y >= -2 && y < H) {
          rect(g, x, Math.max(0, y), 1, 2, 'foam');
          px(g, x, Math.max(0, y - 1), 'white');
        }
      }
      for (let i = 0; i < 40; i++) {
        const sx = (i * 61 + Math.floor(t * 130)) % W;
        const sy = level + Math.round(Math.sin(sx * 0.05 + t * 3) * 4) - 3 - ((i * 29 + Math.floor(t * 200)) % 12);
        if (sy > 0 && sy < H) px(g, sx, sy, i % 3 ? 'foam' : 'white');
      }
      break;
    }
  }
  void line; void disc; void tri; void text; void P;
}

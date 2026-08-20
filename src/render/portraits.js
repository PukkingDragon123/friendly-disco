// Speaker portraits for the dialogue scenes.
//
// Each portrait is drawn live rather than baked, because the interesting part is the
// motion: the Voice's rays turn, the Shepherd's halo breathes, the cherubs' wings beat,
// and every disaster has its own idle animation. They are all drawn into a square frame
// and are safe to call at any size from 40px up.

import { P, col, mix } from '../core/palette.js';
import {
  rect, px, line, disc, ring, ellipse, ellipseFrame, tri, dither, vgrad, text, wash,
  clamp, lerp, box, boxFrame,
} from '../core/pixel.js';
import { icon as drawIcon, hasIcon } from './uikit.js';

/* ------------------------------------------------------------------ helpers */

function starburst(g, cx, cy, r, n, t, c, thin) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + t;
    const len = r * (0.62 + 0.38 * Math.abs(Math.sin(t * 1.6 + i)));
    for (let d = Math.round(r * 0.28); d < len; d++) {
      if (thin && (d & 1)) continue;
      px(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d, c);
    }
  }
}

function halo(g, cx, cy, rx, ry, t, c) {
  const k = 1 + Math.sin(t * 2) * 0.06;
  for (let a = 0; a < 360; a += 5) {
    const rad = (a * Math.PI) / 180;
    px(g, cx + Math.cos(rad) * rx * k, cy + Math.sin(rad) * ry * k, c);
  }
}

function robe(g, cx, baseY, w, h, body, shade, light) {
  for (let i = 0; i < h; i++) {
    const t = i / h;
    const ww = Math.round(w * (0.34 + t * 0.66));
    rect(g, cx - ww, baseY - h + i, ww * 2, 1, body);
    rect(g, cx - ww, baseY - h + i, Math.max(1, Math.round(ww * 0.35)), 1, light);
    rect(g, cx + Math.round(ww * 0.45), baseY - h + i, Math.round(ww * 0.55), 1, shade);
  }
  // fold lines
  for (let i = 0; i < h; i += 4) {
    const t = i / h;
    const ww = Math.round(w * (0.34 + t * 0.66));
    px(g, cx - Math.round(ww * 0.3), baseY - h + i, shade);
    px(g, cx + Math.round(ww * 0.1), baseY - h + i, shade);
  }
}

/** A bearded face with eyes. Shared by the Shepherd and the elders. */
function face(g, cx, cy, r, skin, shadeC, hairC, eyeC, t, beard) {
  disc(g, cx, cy, r, skin);
  disc(g, cx + Math.round(r * 0.35), cy + 1, r - 1, mix(col(skin), col(shadeC), 0.35));
  // hair / hood line
  for (let a = 180; a <= 360; a += 4) {
    const rad = (a * Math.PI) / 180;
    px(g, cx + Math.cos(rad) * r, cy + Math.sin(rad) * r, hairC);
    px(g, cx + Math.cos(rad) * (r - 1), cy + Math.sin(rad) * (r - 1), hairC);
  }
  const blink = ((t * 0.7) % 5) < 0.1;
  if (!blink) {
    px(g, cx - Math.round(r * 0.36), cy - 1, eyeC);
    px(g, cx + Math.round(r * 0.36), cy - 1, eyeC);
  } else {
    rect(g, cx - Math.round(r * 0.5), cy - 1, 2, 1, eyeC);
    rect(g, cx + Math.round(r * 0.28), cy - 1, 2, 1, eyeC);
  }
  if (beard) {
    for (let i = 0; i < Math.round(r * 1.1); i++) {
      const ww = Math.round(r * 0.72 * (1 - i / (r * 1.4)));
      if (ww <= 0) break;
      rect(g, cx - ww, cy + Math.round(r * 0.42) + i, ww * 2, 1, hairC);
      if (i < 2) rect(g, cx - ww, cy + Math.round(r * 0.42) + i, ww * 2, 1, mix(col(hairC), P.white, 0.3));
    }
  }
}

/** Cherub: round body, two beating wings, a tiny halo. Used all over the god UI. */
export function drawCherub(g, cx, cy, t, o = {}) {
  const s = Math.max(1, o.scale || 1);
  const flap = Math.sin(t * 9 + (o.phase || 0));
  const skin = o.skin || 'sand';
  const wing = o.wing || 'white';
  // wings behind
  for (const side of [-1, 1]) {
    const span = Math.round((5 + flap * 2) * s);
    for (let i = 0; i < span; i++) {
      const h = Math.round((3 - i * 0.35) * s);
      if (h <= 0) break;
      rect(g, cx + side * (2 * s + i), cy - Math.round(3 * s) - Math.round(i * 0.35), 1, h + Math.round(2 * s), wing);
    }
    px(g, cx + side * (2 * s + span), cy - Math.round(3 * s), mix(col(wing), P.sky, 0.4));
  }
  // body + head
  disc(g, cx, cy + Math.round(1 * s), Math.round(2.2 * s), skin);
  disc(g, cx, cy - Math.round(2 * s), Math.round(2.4 * s), skin);
  px(g, cx - Math.round(1 * s), cy - Math.round(2 * s), 'ink');
  px(g, cx + Math.round(1 * s), cy - Math.round(2 * s), 'ink');
  // halo
  halo(g, cx, cy - Math.round(5 * s), Math.round(2.6 * s), Math.round(1.1 * s), t + (o.phase || 0), 'gold');
  if (o.arms) {
    rect(g, cx - Math.round(4 * s), cy, Math.round(2 * s), 1, skin);
    rect(g, cx + Math.round(2 * s), cy, Math.round(2 * s), 1, skin);
  }
}

/* ---------------------------------------------------------------- portraits */

const PORTRAITS = {
  // THE VOICE: no face. Cloud, light, an open eye, turning rays.
  god(g, x, y, w, h, t) {
    vgrad(g, x, y, w, h, ['night', 'deep', 'water1', 'sky'], 4);
    const cx = x + w / 2, cy = y + Math.round(h * 0.46);
    starburst(g, cx, cy, Math.round(w * 0.52), 12, t * 0.35, 'gold', true);
    starburst(g, cx, cy, Math.round(w * 0.36), 8, -t * 0.5, 'brass3', false);
    // cloud bank
    for (let i = 0; i < 5; i++) {
      const cw = Math.round(w * (0.5 + i * 0.12));
      ellipse(g, cx + (i % 2 ? 6 : -6), y + h - 6 - i * 3, Math.round(cw / 2), 4 - Math.round(i * 0.4), i < 2 ? 'white' : 'bone');
    }
    // the eye: sclera, iris, pupil, then a GOLD RIM. The rim has to be an outline —
    // a filled ellipse here paints over the whole eye and leaves a gold lozenge.
    const open = 0.6 + 0.4 * Math.sin(t * 0.8);
    const erx = Math.max(3, Math.round(w * 0.2));
    const ery = Math.max(2, Math.round(w * 0.12 * open));
    ellipse(g, cx, cy, erx, ery, 'white');
    disc(g, cx, cy, Math.max(1, Math.min(ery, Math.round(w * 0.075))), 'water2');
    disc(g, cx, cy, Math.max(1, Math.round(w * 0.035)), 'ink');
    px(g, cx - 1, cy - 1, 'white');
    ellipseFrame(g, cx, cy, erx + 1, ery + 1, 'gold');
    ellipseFrame(g, cx, cy, erx, ery, 'brass3');
    // lashes of light
    for (let i = -2; i <= 2; i++) {
      line(g, cx + i * Math.round(erx * 0.4), cy - ery - 1, cx + i * Math.round(erx * 0.5), cy - ery - 4, 'brass3');
    }
  },

  // THE SHEPHERD: robed, haloed, crook in hand. The player's avatar.
  shepherd(g, x, y, w, h, t) {
    vgrad(g, x, y, w, h, ['deep', 'water1', 'water2', 'sky'], 4);
    const cx = x + w / 2;
    const baseY = y + h;
    starburst(g, cx, y + Math.round(h * 0.3), Math.round(w * 0.44), 10, t * 0.2, mix('gold', 'water2', 0.55), true);
    robe(g, cx, baseY, Math.round(w * 0.34), Math.round(h * 0.56), 'bone', 'grey1', 'white');
    // sash
    rect(g, cx - Math.round(w * 0.12), baseY - Math.round(h * 0.4), Math.round(w * 0.24), 2, 'red1');
    face(g, cx, y + Math.round(h * 0.34), Math.max(4, Math.round(w * 0.15)), 'sand', 'rust', 'wood1', 'ink', t, true);
    halo(g, cx, y + Math.round(h * 0.2), Math.round(w * 0.2), Math.round(w * 0.075), t, 'gold');
    // shepherd's crook
    const sx = cx + Math.round(w * 0.3);
    rect(g, sx, y + Math.round(h * 0.28), 2, Math.round(h * 0.68), 'wood2');
    for (let a = 180; a <= 340; a += 12) {
      const rad = (a * Math.PI) / 180;
      px(g, sx + 1 + Math.cos(rad) * 4, y + Math.round(h * 0.28) + Math.sin(rad) * 4, 'wood3');
    }
  },

  // A messenger angel: taller, wings spread, holding a scroll.
  angel(g, x, y, w, h, t) {
    vgrad(g, x, y, w, h, ['purple0', 'water1', 'sky', 'white'], 4);
    const cx = x + w / 2, baseY = y + h;
    const flap = Math.sin(t * 3.2);
    for (const side of [-1, 1]) {
      for (let i = 0; i < Math.round(w * 0.42); i++) {
        const hh = Math.round((h * 0.34) * (1 - i / (w * 0.5)) + flap * 2);
        if (hh <= 0) break;
        rect(g, cx + side * (Math.round(w * 0.12) + i), y + Math.round(h * 0.26) - Math.round(i * 0.2), 1, hh, i < 3 ? 'white' : 'bone');
      }
    }
    robe(g, cx, baseY, Math.round(w * 0.26), Math.round(h * 0.52), 'white', 'grey2', 'white');
    face(g, cx, y + Math.round(h * 0.3), Math.max(3, Math.round(w * 0.12)), 'sand', 'rust', 'brass2', 'ink', t, false);
    halo(g, cx, y + Math.round(h * 0.17), Math.round(w * 0.17), Math.round(w * 0.06), t * 1.4, 'brass3');
    rect(g, cx - Math.round(w * 0.2), baseY - Math.round(h * 0.34), Math.round(w * 0.16), 3, 'bone');
  },

  // A cupid pair — the ones that carry the score plates.
  cupid(g, x, y, w, h, t) {
    vgrad(g, x, y, w, h, ['purple0', 'pink', 'sand', 'white'], 4);
    drawCherub(g, x + Math.round(w * 0.32), y + Math.round(h * 0.52), t, { scale: Math.max(1, Math.round(w / 26)), arms: true });
    drawCherub(g, x + Math.round(w * 0.68), y + Math.round(h * 0.6), t + 1.7, { scale: Math.max(1, Math.round(w / 30)), arms: true });
    // a heart passing between them
    const hx = x + Math.round(w * 0.5), hy = y + Math.round(h * 0.34) + Math.round(Math.sin(t * 2) * 2);
    rect(g, hx - 2, hy, 2, 2, 'red2'); rect(g, hx + 1, hy, 2, 2, 'red2');
    rect(g, hx - 2, hy + 2, 5, 1, 'red2'); rect(g, hx - 1, hy + 3, 3, 1, 'red2'); px(g, hx, hy + 4, 'red2');
  },

  // The generic disaster portrait: a boss icon looming in a coloured storm. The icon and
  // colour come from the boss itself, so a new boss needs no new art.
  disaster(g, x, y, w, h, t, o) {
    const c = (o && o.color) || 'red2';
    vgrad(g, x, y, w, h, ['ink', 'shadow', mix(c, P.ink, 0.6), mix(c, P.ink, 0.3)], 3);
    // driving rain
    for (let i = 0; i < 40; i++) {
      const rx = x + ((i * 37 + Math.floor(t * 260)) % w);
      const ry = y + ((i * 53 + Math.floor(t * 420)) % h);
      line(g, rx, ry, rx - 2, ry + 5, mix(c, P.white, 0.4));
    }
    const cx = x + w / 2, cy = y + Math.round(h * 0.44);
    starburst(g, cx, cy, Math.round(w * 0.5), 7, -t * 0.6, mix(c, P.ink, 0.35), true);
    const s = Math.max(2, Math.floor(w / 16));
    const name = o && hasIcon(o.icon) ? o.icon : 'skull';
    // a hard shadow behind the sigil so it reads against the storm
    drawIcon(g, name, cx - Math.round(9 * s / 2) + 2, cy - Math.round(9 * s / 2) + 2, { color: 'ink', scale: s });
    drawIcon(g, name, cx - Math.round(9 * s / 2), cy - Math.round(9 * s / 2), { color: c, light: 'white', scale: s });
    // two burning eyes below
    const blink = ((t * 1.3) % 3) < 0.15;
    if (!blink) {
      disc(g, cx - Math.round(w * 0.16), y + Math.round(h * 0.78), 2, 'gold');
      disc(g, cx + Math.round(w * 0.16), y + Math.round(h * 0.78), 2, 'gold');
      px(g, cx - Math.round(w * 0.16), y + Math.round(h * 0.78), 'white');
      px(g, cx + Math.round(w * 0.16), y + Math.round(h * 0.78), 'white');
    }
  },

  // The dove, for the ending.
  dove(g, x, y, w, h, t) {
    vgrad(g, x, y, w, h, ['water2', 'sky', 'ice', 'white'], 4);
    const cx = x + w / 2, cy = y + Math.round(h * 0.48);
    starburst(g, cx, cy, Math.round(w * 0.5), 14, t * 0.25, mix('gold', 'white', 0.5), true);
    const flap = Math.sin(t * 4);
    // body
    ellipse(g, cx, cy, Math.round(w * 0.18), Math.round(h * 0.1), 'white');
    disc(g, cx - Math.round(w * 0.16), cy - Math.round(h * 0.06), Math.max(2, Math.round(w * 0.07)), 'white');
    px(g, cx - Math.round(w * 0.19), cy - Math.round(h * 0.07), 'ink');
    tri(g, cx - Math.round(w * 0.24), cy - Math.round(h * 0.05), cx - Math.round(w * 0.2), cy - Math.round(h * 0.08), cx - Math.round(w * 0.2), cy - Math.round(h * 0.02), 'amber');
    // wings
    for (const side of [-1, 1]) {
      for (let i = 0; i < Math.round(w * 0.22); i++) {
        const hh = Math.round(Math.abs(flap) * 6 * (1 - i / (w * 0.26))) + 1;
        rect(g, cx + i * 1, cy - Math.round(h * 0.06) - hh * side, 1, hh, i < 2 ? 'bone' : 'white');
      }
    }
    // tail + olive sprig
    tri(g, cx + Math.round(w * 0.16), cy, cx + Math.round(w * 0.3), cy - 3, cx + Math.round(w * 0.3), cy + 4, 'bone');
    rect(g, cx - Math.round(w * 0.3), cy + 2, Math.round(w * 0.1), 1, 'green0');
    ellipse(g, cx - Math.round(w * 0.3), cy + 1, 2, 1, 'green1');
    ellipse(g, cx - Math.round(w * 0.24), cy + 3, 2, 1, 'green1');
  },
};

export const PORTRAIT_IDS = Object.keys(PORTRAITS);

/**
 * drawPortrait(g, id, x, y, w, h, t, opts)
 * Unknown ids fall back to the disaster frame, so a boss that forgets to name a
 * portrait still gets something menacing rather than an empty box.
 */
export function drawPortrait(g, id, x, y, w, h, t, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const fn = PORTRAITS[id] || PORTRAITS.disaster;
  // frame first: the portraits all bleed to their edges
  rect(g, x - 2, y - 2, w + 4, h + 4, 'ink');
  fn(g, x, y, w, h, t, o);
  // vignette + brass frame
  for (let i = 0; i < 4; i++) {
    const a = 0.22 - i * 0.05;
    wash(g, x, y + i, w, 1, 'ink', a);
    wash(g, x, y + h - 1 - i, w, 1, 'ink', a);
    wash(g, x + i, y, 1, h, 'ink', a);
    wash(g, x + w - 1 - i, y, 1, h, 'ink', a);
  }
  boxFrame(g, x - 2, y - 2, w + 4, h + 4, 'brass1', 1);
  boxFrame(g, x - 1, y - 1, w + 2, h + 2, 'brass3', 0);
  for (const [dx, dy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) px(g, x + dx, y + dy, 'brass3');
  void box;
  void dither;
  void text;
  void clamp;
  void lerp;
}

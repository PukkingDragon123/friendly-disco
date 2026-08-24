// Speaker portraits for the dialogue scenes.
//
// Each portrait is drawn live rather than baked, because the interesting part is the
// motion: the Voice's rays turn, the Shepherd's halo breathes, the cherubs' wings beat,
// and every disaster has its own idle animation. They are all drawn into a square frame
// and are safe to call at any size from 40px up.

import { P, col, mix } from '../core/palette.js';
import {
  rect, px, line, disc, ring, ellipse, ellipseFrame, tri, dither, vgrad, text, wash,
  clamp, lerp, box, boxFrame, makeCanvas,
} from '../core/pixel.js';
import { icon as drawIcon, hasIcon } from './uikit.js';
import { drawFolkPortrait, FOLK_IDS } from './folk.js';

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
  god(g, x, y, w, h, t, o) {
    if (!o || !o.bgDone) vgrad(g, x, y, w, h, ['night', 'deep', 'water1', 'sky'], 4);
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
  shepherd(g, x, y, w, h, t, o) {
    if (!o || !o.bgDone) vgrad(g, x, y, w, h, ['deep', 'water1', 'water2', 'sky'], 4);
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
  angel(g, x, y, w, h, t, o) {
    if (!o || !o.bgDone) vgrad(g, x, y, w, h, ['purple0', 'water1', 'sky', 'white'], 4);
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
  cupid(g, x, y, w, h, t, o) {
    if (!o || !o.bgDone) vgrad(g, x, y, w, h, ['purple0', 'pink', 'sand', 'white'], 4);
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
    if (!o || !o.bgDone) vgrad(g, x, y, w, h, ['ink', 'shadow', mix(c, P.ink, 0.6), mix(c, P.ink, 0.3)], 3);
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


  // THE GOLEM: you. Not a person -- a thing made of river clay and told to work.
  //
  // The silhouette has to do the work here, because the whole figure is one colour
  // family. So: shoulders far wider than the head, a hard dark gap where a neck would
  // be, and a black outline pass around everything. Every golem story turns on the
  // word written on the thing, so the brass brow plate is the brightest object in the
  // frame and it breathes with the idle.
  golem(g, x, y, w, h, t, o) {
    if (!o || !o.bgDone) vgrad(g, x, y, w, h, ['ink', 'shadow', 'wood0', 'wood1'], 3);
    const cx = x + w / 2;
    const baseY = y + h;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.4);

    // clay dust still hanging in the air -- it was dug out of a riverbank an hour ago
    for (let i = 0; i < 26; i++) {
      const dx = x + ((i * 41 + Math.floor(t * 9)) % w);
      const dy = y + h - ((i * 29 + Math.floor(t * 14)) % Math.round(h * 0.85));
      px(g, dx, dy, i % 3 ? 'wood2' : 'sand');
    }

    const shW = Math.round(w * 0.40);          // half-width at the shoulders
    const chH = Math.round(h * 0.40);
    const chY = baseY - chH - Math.round(h * 0.06);
    const hr = Math.max(4, Math.round(w * 0.15));
    const hy = chY - hr - Math.round(h * 0.05);  // the gap IS the neck

    // --- silhouette pass: everything again, one pixel out, in near-black. This is
    // what stops the figure dissolving into the background.
    const sil = (fn) => fn('ink');
    for (const pass of [1, 0]) {
      const o = pass;                            // 1 = outline pass, 0 = the real thing
      const body = o ? 'ink' : 'wood2';
      const litSide = o ? 'ink' : 'wood3';
      const darkSide = o ? 'ink' : 'wood1';
      // legs, planted wide
      for (const side of [-1, 1]) {
        rect(g, cx + side * Math.round(shW * 0.52) - Math.round(w * 0.08) - o,
          baseY - Math.round(h * 0.13) - o, Math.round(w * 0.16) + o * 2, Math.round(h * 0.13) + o * 2, o ? 'ink' : 'wood1');
        if (!o) {
          rect(g, cx + side * Math.round(shW * 0.52) - Math.round(w * 0.08),
            baseY - Math.round(h * 0.13), Math.round(w * 0.05), Math.round(h * 0.13), 'wood2');
        }
      }
      // arms, hanging long the way a made thing's arms hang
      for (const side of [-1, 1]) {
        const ax = cx + side * (shW - Math.round(w * 0.03));
        rect(g, ax - Math.round(w * 0.06) - o, chY + 2 - o, Math.round(w * 0.12) + o * 2,
          Math.round(chH * 0.82) + o * 2, o ? 'ink' : (side < 0 ? 'wood2' : 'wood1'));
        rect(g, ax - Math.round(w * 0.08) - o, chY + Math.round(chH * 0.82) - o,
          Math.round(w * 0.16) + o * 2, Math.round(w * 0.12) + o * 2, o ? 'ink' : 'wood2');
      }
      // the chest slab: a trapezoid, wide at the shoulders
      for (let i = 0; i < chH; i++) {
        const f = i / chH;
        const ww = Math.round(shW * (1 - f * 0.30));
        rect(g, cx - ww - o, chY + i - (i === 0 ? o : 0), ww * 2 + o * 2, 1 + (i === chH - 1 ? o : 0), body);
        if (!o) {
          rect(g, cx - ww, chY + i, Math.max(1, Math.round(ww * 0.42)), 1, litSide);
          rect(g, cx + Math.round(ww * 0.52), chY + i, Math.round(ww * 0.48), 1, darkSide);
        }
      }
      // the head: a blunt block, narrower than the shoulders by a long way
      rect(g, cx - hr - o, hy - hr - o, hr * 2 + o * 2, hr * 2 + Math.round(h * 0.04) + o * 2, body);
      if (!o) {
        rect(g, cx - hr, hy - hr, Math.round(hr * 0.75), hr * 2 + Math.round(h * 0.04), litSide);
        rect(g, cx + Math.round(hr * 0.45), hy - hr, Math.round(hr * 0.55), hr * 2 + Math.round(h * 0.04), darkSide);
      }
    }
    void sil;

    // --- the seams: cracks in the clay with furnace light behind them
    const seams = [[-0.5, 0.14], [0.24, 0.24], [-0.12, 0.44], [0.5, 0.5], [-0.34, 0.66]];
    for (const [fx, fy] of seams) {
      const sx = cx + Math.round(shW * fx), sy = chY + Math.round(chH * fy);
      for (let i = 0; i < 7; i++) {
        const yy = sy + Math.round(Math.sin(i * 1.2) * 2);
        px(g, sx + i, yy, i & 1 ? 'amber' : 'orange');
        px(g, sx + i, yy + 1, 'wood0');
      }
    }
    // the heart-furnace showing through the chest, breathing
    const fy2 = chY + Math.round(chH * 0.40);
    disc(g, cx, fy2, Math.max(3, Math.round(w * 0.075 * pulse + 2)), 'orange');
    disc(g, cx, fy2, Math.max(2, Math.round(w * 0.04)), 'amber');
    disc(g, cx, fy2, 1, 'white');
    for (let i = 0; i < 8; i++) {                 // light leaking up the chest
      wash(g, cx - 6 + i, fy2 - 8 - i, 12 - i * 2, 1, 'orange', 0.09 * pulse);
    }

    // --- eye sockets: sunk, wide, and burning. Two pixels is a mouse; this is a golem.
    for (const side of [-1, 1]) {
      const ex = cx + side * Math.round(hr * 0.42);
      rect(g, ex - 2, hy - 1, 4, 3, 'ink');
      rect(g, ex - 2, hy - 1, 4, 2, pulse > 0.45 ? 'amber' : 'orange');
      rect(g, ex - 1, hy - 1, 2, 1, 'white');
      // a little glow spilling onto the cheek
      wash(g, ex - 3, hy + 2, 6, 2, 'orange', 0.22);
    }
    // no mouth. A carved line where one would be.
    rect(g, cx - Math.round(hr * 0.4), hy + Math.round(hr * 0.75), Math.round(hr * 0.8), 1, 'wood0');

    // --- THE WORD: a brass plate driven into the brow. Take it out and this is mud.
    const pw2 = Math.round(hr * 1.7), ph2 = Math.max(5, Math.round(hr * 0.62));
    const py2 = hy - hr + 1;
    rect(g, cx - pw2 / 2 - 1, py2 - 1, pw2 + 2, ph2 + 2, 'ink');
    rect(g, cx - pw2 / 2, py2, pw2, ph2, 'brass1');
    rect(g, cx - pw2 / 2, py2, pw2, 1, 'brass3');
    rect(g, cx - pw2 / 2, py2 + ph2 - 1, pw2, 1, 'brass0');
    // three chiselled strokes -- a word, unreadable on purpose
    for (let i = 0; i < 3; i++) {
      const gx2 = cx - pw2 / 2 + 2 + i * Math.round((pw2 - 3) / 3);
      rect(g, gx2, py2 + 1, 1, ph2 - 2, pulse > 0.45 ? 'gold' : 'brass2');
      px(g, gx2 + 1, py2 + 1 + (i % 2), pulse > 0.45 ? 'gold' : 'brass2');
    }
    // rivets holding the plate on
    px(g, cx - pw2 / 2, py2 + 1, 'grey2');
    px(g, cx + pw2 / 2 - 1, py2 + 1, 'grey2');

    // --- weathering: chisel marks and a chipped shoulder, so someone MADE this
    for (let i = 0; i < 18; i++) {
      const mx = cx - shW + ((i * 23) % (shW * 2));
      const my = chY + 2 + ((i * 17) % (chH - 4));
      px(g, mx, my, i % 4 ? 'wood0' : 'wood3');
    }
    for (let i = 0; i < 4; i++) px(g, cx - shW + i, chY + i, 'ink');
  },

  // NOAH: six hundred years old, holding a hammer, entirely out of patience.
  noah(g, x, y, w, h, t, o) {
    if (!o || !o.bgDone) vgrad(g, x, y, w, h, ['wood0', 'wood1', 'sand', 'sky'], 4);
    const cx = x + w / 2, baseY = y + h;
    // the half-built hull behind him: ribs and a ladder
    for (let i = 0; i < 6; i++) {
      const rx = x + 3 + i * Math.round(w / 6.5);
      rect(g, rx, y + Math.round(h * 0.2), 2, Math.round(h * 0.8), 'wood1');
    }
    rect(g, x, y + Math.round(h * 0.34), w, 2, 'wood2');
    rect(g, x, y + Math.round(h * 0.58), w, 2, 'wood2');
    robe(g, cx, baseY, Math.round(w * 0.32), Math.round(h * 0.54), 'cloth1', 'cloth0', 'bone');
    // a leather apron over the robe -- he is a shipwright before he is a prophet
    rect(g, cx - Math.round(w * 0.16), baseY - Math.round(h * 0.44), Math.round(w * 0.32), Math.round(h * 0.3), 'wood2');
    rect(g, cx - Math.round(w * 0.16), baseY - Math.round(h * 0.44), Math.round(w * 0.32), 1, 'wood3');
    face(g, cx, y + Math.round(h * 0.32), Math.max(4, Math.round(w * 0.15)), 'sand', 'rust', 'bone', 'ink', t, true);
    // a wide straw hat, because forty days of sun came before the forty of rain
    const hy = y + Math.round(h * 0.32) - Math.round(w * 0.15);
    // a wide woven brim -- forty days of sun came before the forty of rain
    ellipse(g, cx, hy + 1, Math.round(w * 0.34) + 1, 5, 'ink');
    for (let i = 0; i < 5; i++) {
      ellipse(g, cx, hy - i, Math.round(w * 0.34) - i, 4 - Math.round(i * 0.5), i < 2 ? 'brass2' : 'brass1');
    }
    for (let i = -Math.round(w * 0.3); i < Math.round(w * 0.3); i += 4) px(g, cx + i, hy, 'brass3');
    ellipse(g, cx, hy - 6, Math.round(w * 0.15), 5, 'brass1');
    ellipse(g, cx, hy - 8, Math.round(w * 0.14), 3, 'brass2');
    rect(g, cx - Math.round(w * 0.15), hy - 5, Math.round(w * 0.3), 2, 'wood1');
    // the hammer, swinging on the idle
    const sw = Math.sin(t * 1.9) * 3;
    const hx2 = cx + Math.round(w * 0.28);
    rect(g, hx2, y + Math.round(h * 0.42) + sw, 2, Math.round(h * 0.26), 'wood3');
    rect(g, hx2 - 6, y + Math.round(h * 0.38) + sw, 14, 8, 'ink');
    rect(g, hx2 - 5, y + Math.round(h * 0.38) + sw + 1, 12, 6, 'grey2');
    rect(g, hx2 - 5, y + Math.round(h * 0.38) + sw + 1, 12, 2, 'ice');
    rect(g, hx2 - 5, y + Math.round(h * 0.38) + sw + 5, 12, 2, 'grey0');
  },

  // THE SERPENT: the shopkeeper. Coiled in the branches, smiling, holding the stock.
  snake(g, x, y, w, h, t, o) {
    if (!o || !o.bgDone) vgrad(g, x, y, w, h, ['cloth0', 'green0', 'green1', 'moss'], 4);
    const cx = x + w / 2;
    // the tree it lives in
    rect(g, cx + Math.round(w * 0.22), y, Math.round(w * 0.14), h, 'wood1');
    rect(g, cx + Math.round(w * 0.22), y, Math.round(w * 0.05), h, 'wood2');
    for (let i = 0; i < 26; i++) {
      const lx = x + ((i * 47) % w), ly = y + ((i * 31) % Math.round(h * 0.5));
      ellipse(g, lx, ly, 3, 2, i % 3 ? 'green1' : 'green0');
    }
    // the coil: a body that winds down the frame, thickest in the middle
    const sway = Math.sin(t * 1.1);
    // A thick body: at 34 segments and 3px half-width it read as a dotted chain, so
    // the coil is drawn twice -- an ink silhouette first, then the scales on top.
    const SEG = 60;
    for (const pass of [1, 0]) {
      for (let i = 0; i < SEG; i++) {
        const f = i / SEG;
        const sx = cx + Math.sin(f * 6.4 + sway * 0.4) * (w * 0.24);
        const sy = y + Math.round(h * 0.30) + f * h * 0.64;
        const th = Math.round(5 + Math.sin(f * Math.PI) * 5) + pass;
        if (pass) { rect(g, sx - th, sy - 1, th * 2, 4, 'ink'); continue; }
        rect(g, sx - th, sy, th * 2, 3, 'green1');
        rect(g, sx - th, sy, Math.max(1, Math.round(th * 0.7)), 3, 'foam');
        rect(g, sx + Math.round(th * 0.4), sy, Math.round(th * 0.6), 3, 'green0');
        // belly scales, in bands
        if (i % 4 === 0) rect(g, sx - Math.round(th * 0.5), sy + 1, th, 1, 'moss');
        if (i % 7 === 0) px(g, sx, sy, 'amber');
      }
    }
    // the head, level with you, far too close
    const hx3 = cx - Math.round(w * 0.14) + Math.round(sway * 2);
    const hy3 = y + Math.round(h * 0.30);
    ellipse(g, hx3, hy3, Math.round(w * 0.24) + 1, Math.round(w * 0.16) + 1, 'ink');
    ellipse(g, hx3, hy3, Math.round(w * 0.23), Math.round(w * 0.15), 'green1');
    ellipse(g, hx3 - 3, hy3 - 2, Math.round(w * 0.15), Math.round(w * 0.09), 'foam');
    // a hood flared behind the skull
    for (const side of [-1, 1]) {
      ellipse(g, hx3 + Math.round(w * 0.1), hy3 + side * Math.round(w * 0.11),
        Math.round(w * 0.1), Math.round(w * 0.06), 'green0');
    }
    // slit eyes with a gold ring -- the one honest thing about it
    for (const side of [-1, 1]) {
      const ex = hx3 + side * Math.round(w * 0.09);
      disc(g, ex, hy3 - 3, 3, 'gold');
      disc(g, ex, hy3 - 3, 2, 'amber');
      rect(g, ex, hy3 - 5, 1, 5, 'ink');      // the slit
      px(g, ex - 1, hy3 - 4, 'white');
    }
    // the smile, and the tongue
    for (let i = -5; i <= 5; i++) {
      px(g, hx3 + i, hy3 + Math.round(w * 0.07) + (Math.abs(i) > 3 ? -1 : 0), 'ink');
      if (Math.abs(i) > 3) px(g, hx3 + i, hy3 + Math.round(w * 0.07) - 2, 'ink');   // upturned
    }
    if (((t * 1.6) % 2) < 0.5) {
      const tl = Math.round(w * 0.1);
      line(g, hx3, hy3 + Math.round(w * 0.06), hx3 - tl, hy3 + Math.round(w * 0.1), 'red2');
      px(g, hx3 - tl - 1, hy3 + Math.round(w * 0.09), 'red2');
      px(g, hx3 - tl - 1, hy3 + Math.round(w * 0.12), 'red2');
    }
    // an apple held out in the coil, bobbing
    const ax2 = cx - Math.round(w * 0.28), ay2 = y + Math.round(h * 0.62) + Math.round(Math.sin(t * 2) * 2);
    disc(g, ax2, ay2, Math.max(3, Math.round(w * 0.09)), 'red2');
    disc(g, ax2 - 1, ay2 - 1, Math.max(1, Math.round(w * 0.04)), 'red1');
    rect(g, ax2, ay2 - Math.round(w * 0.1), 1, 3, 'wood2');
    ellipse(g, ax2 + 2, ay2 - Math.round(w * 0.1), 2, 1, 'green1');
  },

  // ADAM: the first one. Broad, plain, and holding out a gift he does not explain.
  adam(g, x, y, w, h, t, o) {
    if (!o || !o.bgDone) vgrad(g, x, y, w, h, ['moss', 'green0', 'sand', 'gold'], 4);
    const cx = x + w / 2, baseY = y + h;
    // garden behind: tall grass
    for (let i = 0; i < w; i += 3) {
      const gh = 5 + ((i * 7) % 7);
      rect(g, x + i, baseY - gh, 1, gh, i % 2 ? 'green1' : 'green0');
    }
    robe(g, cx, baseY, Math.round(w * 0.3), Math.round(h * 0.4), 'sand', 'rust', 'bone');
    // bare chest above the wrap
    rect(g, cx - Math.round(w * 0.16), baseY - Math.round(h * 0.62), Math.round(w * 0.32), Math.round(h * 0.24), 'sand');
    rect(g, cx + Math.round(w * 0.04), baseY - Math.round(h * 0.62), Math.round(w * 0.12), Math.round(h * 0.24), mix(P.sand, P.rust, 0.3));
    // the missing rib, drawn as a shadow line. He does not mention it.
    for (let i = 0; i < 4; i++) px(g, cx + Math.round(w * 0.1) + i, baseY - Math.round(h * 0.52) + i, 'rust');
    face(g, cx, y + Math.round(h * 0.28), Math.max(4, Math.round(w * 0.14)), 'sand', 'rust', 'wood1', 'ink', t, false);
    // a fig leaf, held with dignity
    const lx2 = cx - Math.round(w * 0.24);
    ellipse(g, lx2, baseY - Math.round(h * 0.3), Math.round(w * 0.09), Math.round(h * 0.07), 'green1');
    rect(g, lx2, baseY - Math.round(h * 0.3), 1, Math.round(h * 0.1), 'green0');
    // and what he is offering: a shaped stone tool on his open palm
    const gx = cx + Math.round(w * 0.26), gy = y + Math.round(h * 0.52) + Math.round(Math.sin(t * 1.3) * 2);
    tri(g, gx, gy - 4, gx + 5, gy + 4, gx - 5, gy + 4, 'grey2');
    tri(g, gx, gy - 3, gx + 3, gy + 3, gx - 1, gy + 3, 'ice');
    for (let i = 0; i < 6; i++) px(g, gx - 5 + i * 2, gy + 5, 'wood2');
  },

  // EVE: the one who asked the question. Holds the apple like a piece of evidence.
  eve(g, x, y, w, h, t, o) {
    if (!o || !o.bgDone) vgrad(g, x, y, w, h, ['moss', 'green1', 'pink', 'gold'], 4);
    const cx = x + w / 2, baseY = y + h;
    for (let i = 0; i < w; i += 3) {
      const gh = 4 + ((i * 11) % 8);
      rect(g, x + i, baseY - gh, 1, gh, i % 2 ? 'green1' : 'green0');
    }
    robe(g, cx, baseY, Math.round(w * 0.28), Math.round(h * 0.44), 'bone', 'grey1', 'white');
    rect(g, cx - Math.round(w * 0.13), baseY - Math.round(h * 0.6), Math.round(w * 0.26), Math.round(h * 0.2), 'sand');
    face(g, cx, y + Math.round(h * 0.28), Math.max(4, Math.round(w * 0.14)), 'sand', 'rust', 'wood2', 'ink', t, false);
    // long hair either side, moving in the garden air
    const sway2 = Math.sin(t * 1.2) * 1.5;
    for (const side of [-1, 1]) {
      for (let i = 0; i < Math.round(h * 0.34); i++) {
        const hw2 = Math.round(w * 0.13) + Math.round(Math.sin(i * 0.3 + t) * 1.2);
        rect(g, cx + side * hw2 + Math.round(sway2 * (i / (h * 0.34))), y + Math.round(h * 0.2) + i, 2, 1,
          i % 5 === 0 ? 'wood3' : 'wood2');
      }
    }
    // a crown of small flowers
    for (let i = -3; i <= 3; i++) {
      px(g, cx + i * 2, y + Math.round(h * 0.28) - Math.round(w * 0.15), i % 2 ? 'pink' : 'white');
    }
    // THE apple, held out at eye level
    const ax3 = cx + Math.round(w * 0.26), ay3 = y + Math.round(h * 0.46) + Math.round(Math.sin(t * 1.6) * 2);
    disc(g, ax3, ay3, Math.max(3, Math.round(w * 0.1)), 'red2');
    disc(g, ax3 - 1, ay3 - 1, Math.max(1, Math.round(w * 0.04)), 'gold');
    rect(g, ax3, ay3 - Math.round(w * 0.11), 1, 3, 'wood2');
    ellipse(g, ax3 + 2, ay3 - Math.round(w * 0.11), 2, 1, 'green1');
    // one bite already out of it
    disc(g, ax3 + Math.round(w * 0.08), ay3 - 1, 2, 'moss');
  },

  // The dove, for the ending.
  dove(g, x, y, w, h, t, o) {
    if (!o || !o.bgDone) vgrad(g, x, y, w, h, ['water2', 'sky', 'ice', 'white'], 4);
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
/* -------------------------------------------------------------- backgrounds

Every portrait opens with a full-frame vertical gradient, and a vgrad is one dithered
row per pixel of height: a 176x252 frame is 252 dithers before anything recognisable
has been drawn, times however many portraits are on screen. The gradients never move,
so they are baked per (id, size, tint) and blitted.

Each portrait function checks `bgDone` and skips its own vgrad when the bake has
already supplied one. Everything else in a portrait -- the rays, the halo, the wings,
the rain -- stays live, because that is the part that is alive.
*/
const bgCache = new Map();
const BG_RAMPS = {
  god: ['night', 'deep', 'water1', 'sky'],
  shepherd: ['deep', 'water1', 'water2', 'sky'],
  angel: ['purple0', 'water1', 'sky', 'white'],
  cupid: ['purple0', 'pink', 'sand', 'white'],
  golem: ['ink', 'shadow', 'wood0', 'wood1'],
  noah: ['wood0', 'wood1', 'sand', 'sky'],
  snake: ['cloth0', 'green0', 'green1', 'moss'],
  adam: ['moss', 'green0', 'sand', 'gold'],
  eve: ['moss', 'green1', 'pink', 'gold'],
  dove: ['water2', 'sky', 'ice', 'white'],
};

function bakedBg(id, w, h) {
  const ramp = BG_RAMPS[id];
  if (!ramp) return null;                 // disaster's ground depends on the boss colour
  const key = `${id}/${w}/${h}`;
  let hit = bgCache.get(key);
  if (hit !== undefined) return hit;
  const mk = makeCanvas(w, h);
  if (!mk) { bgCache.set(key, null); return null; }
  vgrad(mk.g, 0, 0, w, h, ramp, 4);
  hit = mk.canvas;
  if (bgCache.size > 48) bgCache.clear();
  bgCache.set(key, hit);
  return hit;
}

export function clearPortraitCache() { bgCache.clear(); }

/**
 * Speaker ids that the cast (render/folk.js) now owns. Those characters are drawn from
 * the SAME sprite as their walk-around selves, so a portrait and the figure standing in
 * Eden can never drift apart. `cupid` is an alias kept because the old scoring UI asks
 * for it by that name.
 */
const FOLK_ALIAS = { cupid: 'cherub', shepherd: 'noah' };

export function drawPortrait(g, id, x, y, w, h, t, o = {}) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  const folkId = FOLK_ALIAS[id] || id;
  if (FOLK_IDS.indexOf(folkId) >= 0) {
    drawFolkPortrait(g, folkId, x, y, w, h, t, o);
    return;
  }
  const fn = PORTRAITS[id] || PORTRAITS.disaster;
  // frame first: the portraits all bleed to their edges
  rect(g, x - 2, y - 2, w + 4, h + 4, 'ink');
  const bg = bakedBg(PORTRAITS[id] ? id : 'disaster', w, h);
  if (bg) g.drawImage(bg, x, y);
  fn(g, x, y, w, h, t, Object.assign({ bgDone: !!bg }, o));
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

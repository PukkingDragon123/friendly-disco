// The deck: a 2.5D pool table built as a floating barge.
//
// Physics is flat (table units, 232 x 116). The view is a TILT plus a mild horizontal
// PERSPECTIVE, so the felt is a trapezoid — narrower at the far rail — which is what
// actually sells the 2.5D read. An affine tilt alone leaves a rectangle on screen and
// looks top-down no matter how the rails are shaded.
//
//     scaleAt(ty) = 1 - persp * (1 - ty/TABLE_H)      // 1 at the near rail
//     screenX = cx + (tx - TABLE_W/2) * xs * scaleAt(ty)
//     screenY = oy + ty * tilt - tz * zs
//
// Balls are also drawn at scaleAt(), so an animal at the far rail is genuinely smaller.
// A ball of radius 5.2 units renders at ~10px near the viewer, which is half of
// SPRITE_SIZE (20) — animal sprites drop onto balls at scale 1.
//
// The static layers (felt, timber, gate mouths) are BAKED once with the perspective
// already in them, so a frame costs two blits plus the live glows and animals.

import { P, col, mix } from '../core/palette.js';
import {
  rect, frame, px, line, dashLine, disc, ring, ellipse, ellipseFrame, tri, box,
  dither, vgrad, noiseFill, text, textW, makeCanvas, blit, wash, clamp, lerp,
} from '../core/pixel.js';
import { HABITAT_BY_ID } from '../data/habitats.js';
import { icon as drawIcon, hasIcon } from './uikit.js';
import { drawAnimal, drawAnimalShadow } from './sprites.js';
import { TABLE_W, TABLE_H, BALL_R } from '../game/physics.js';

export const VIEW = {
  ox: 164,      // screen x of table-unit x=0 at the NEAR rail
  oy: 104,      // screen y of table-unit y=0
  xs: 2,        // horizontal units -> pixels at the near rail
  tilt: 1.24,   // vertical units -> pixels (2 * 0.62 foreshortening)
  zs: 2,        // height units -> pixels
  persp: 0.17,  // how much narrower the far rail is
};
VIEW.cx = VIEW.ox + (TABLE_W / 2) * VIEW.xs;

export const DECK = {
  feltY: VIEW.oy,
  feltW: TABLE_W * VIEW.xs,             // 464 at the near rail
  feltH: Math.round(TABLE_H * VIEW.tilt), // 144
  rail: 13,
  apron: 14,
};
DECK.feltX = VIEW.cx - DECK.feltW / 2;
DECK.x = Math.round(DECK.feltX - DECK.rail);
DECK.y = DECK.feltY - DECK.rail;
DECK.w = DECK.feltW + DECK.rail * 2;
DECK.h = DECK.feltH + DECK.rail * 2;
DECK.apronY = DECK.y + DECK.h;
DECK.totalH = DECK.h + DECK.apron;

/** Horizontal foreshortening at a table-space depth. */
export function scaleAt(ty) {
  return 1 - VIEW.persp * (1 - clamp(ty / TABLE_H, -0.35, 1.35));
}

export function toScreen(tx, ty, tz = 0) {
  const s = scaleAt(ty);
  return {
    x: VIEW.cx + (tx - TABLE_W / 2) * VIEW.xs * s,
    y: VIEW.oy + ty * VIEW.tilt - tz * VIEW.zs,
    s,
  };
}

/** Inverse projection — turns a mouse position into a point on the felt plane. */
export function toTable(sx, sy) {
  const ty = (sy - VIEW.oy) / VIEW.tilt;
  const s = scaleAt(ty);
  return { x: (sx - VIEW.cx) / (VIEW.xs * s) + TABLE_W / 2, y: ty };
}

/** Visual radius of a ball at a given depth, in screen pixels. */
export function ballPixelRadius(r = BALL_R, ty = TABLE_H) {
  return r * VIEW.xs * scaleAt(ty);
}

/* --------------------------------------------------------------- gate geometry */

// Gate centres in TABLE UNITS. Corners sit slightly inside so a ball rolling along a
// rail still finds the mouth.
const GATE_POS = {
  tl: { x: 7, y: 5 },
  tm: { x: TABLE_W / 2, y: -1.5 },
  tr: { x: TABLE_W - 7, y: 5 },
  bl: { x: 7, y: TABLE_H - 5 },
  bm: { x: TABLE_W / 2, y: TABLE_H + 1.5 },
  br: { x: TABLE_W - 7, y: TABLE_H - 5 },
};
export const GATE_R = 10;

/** Build the physics gate list for a habitat assignment: {slot -> habitatId}. */
export function buildGates(assignment, o = {}) {
  const scale = o.scale || 1;
  const out = [];
  for (const slot of Object.keys(GATE_POS)) {
    const hid = assignment[slot];
    if (!hid) continue;
    const p = GATE_POS[slot];
    out.push({
      id: slot, slot, habitatId: hid,
      x: p.x, y: p.y,
      r: GATE_R * scale,
      closed: !!(o.closed && o.closed.includes(hid)),
    });
  }
  return out;
}

export function gateScreen(gate) { return toScreen(gate.x, gate.y, 0); }

/* --------------------------------------------------------------------- baking */

// Half-width of the felt, in pixels, at a felt ROW (0 = far rail).
function feltHalfAtRow(row) {
  const ty = row / VIEW.tilt;
  return (DECK.feltW / 2) * scaleAt(ty);
}

function bakeFelt(seed) {
  const W = DECK.feltW, H = DECK.feltH;
  const mk = makeCanvas(W, H);
  if (!mk) return null;
  const g = mk.g;
  const mid = W / 2;

  for (let row = 0; row < H; row++) {
    const hw = feltHalfAtRow(row);
    const x0 = Math.round(mid - hw), x1 = Math.round(mid + hw);
    const k = row / H;                       // 0 far, 1 near
    // Six bands, fully dithered: the cloth is lit from the far rail and falls into
    // shadow toward the player, which is what a hooded table light actually does.
    const ramp = ['cloth3', 'cloth2', 'cloth2', 'cloth1', 'cloth1', 'cloth0'];
    const fk = Math.pow(k, 0.85) * (ramp.length - 1);
    const i0 = Math.min(ramp.length - 1, Math.floor(fk));
    const i1 = Math.min(ramp.length - 1, i0 + 1);
    dither(g, x0, row, x1 - x0, 1, ramp[i0], ramp[i1], Math.round((fk - i0) * 16));
  }

  // cloth tooth — very sparse and low-contrast; heavy noise reads as green static.
  // The mid tones are close to the base so it becomes a weave, not dirt.
  noiseFill(g, 0, 0, W, H, 'rgba(0,0,0,0)', mix('cloth2', 'cloth3', 0.5), 0.012, seed | 0);
  noiseFill(g, 0, 0, W, H, 'rgba(0,0,0,0)', mix('cloth1', 'cloth0', 0.4), 0.016, (seed | 0) + 77);

  // nap: brushed rows, only every third line so it stays a texture not a grille
  for (let row = 0; row < H; row += 3) {
    const hw = feltHalfAtRow(row);
    dither(g, Math.round(mid - hw), row, Math.round(hw * 2), 1, 'rgba(0,0,0,0)', 'cloth2', 2);
  }

  // vignette hugging the cushions
  for (let row = 0; row < H; row++) {
    const hw = feltHalfAtRow(row);
    const x0 = Math.round(mid - hw);
    const wRow = Math.round(hw * 2);
    const edgeV = Math.min(row, H - 1 - row);
    if (edgeV < 12) {
      const a = 7 - Math.round(edgeV * 0.6);
      dither(g, x0, row, wRow, 1, 'rgba(0,0,0,0)', 'cloth0', Math.max(0, a));
    }
    for (let i = 0; i < 10; i++) {
      const a = 6 - i * 0.6;
      if (a <= 0) break;
      dither(g, x0 + i, row, 1, 1, 'rgba(0,0,0,0)', 'cloth0', Math.max(0, Math.round(a)));
      dither(g, x0 + wRow - 1 - i, row, 1, 1, 'rgba(0,0,0,0)', 'cloth0', Math.max(0, Math.round(a)));
    }
  }

  // baulk line and the break spot, in pale thread
  const bRow = 0, bx = TABLE_W * 0.24;
  void bRow;
  for (let row = 2; row < H - 2; row++) {
    const ty = row / VIEW.tilt;
    const p = toScreen(bx, ty);
    if ((row & 3) === 0) continue;
    px(g, Math.round(p.x - DECK.feltX), row, 'cloth3');
  }
  const spot = toScreen(TABLE_W * 0.74, TABLE_H / 2);
  ring(g, spot.x - DECK.feltX, spot.y - DECK.feltY, 4, 'cloth3');

  // diamond sights just inside the cushions
  for (let i = 1; i < 8; i++) {
    const tx = (TABLE_W * i) / 8;
    const top = toScreen(tx, 1.5), bot = toScreen(tx, TABLE_H - 1.5);
    tri(g, top.x - DECK.feltX, 1, top.x - DECK.feltX - 2, 4, top.x - DECK.feltX + 2, 4, 'cloth3');
    tri(g, bot.x - DECK.feltX, H - 2, bot.x - DECK.feltX - 2, H - 5, bot.x - DECK.feltX + 2, H - 5, 'cloth3');
  }

  return mk.canvas;
}

function bakeFrame(seed, assignment) {
  const W = DECK.w, H = DECK.totalH;
  const mk = makeCanvas(W, H + 8);
  if (!mk) return null;
  const g = mk.g;
  const R = DECK.rail;
  const mid = W / 2;

  // Rows of the whole cabinet. `hw` is the felt half-width at that depth, so the rails
  // keep a constant thickness and converge with the cloth.
  for (let r = 0; r < H; r++) {
    let ty, phase;
    if (r < R) { ty = -(R - r) / VIEW.tilt; phase = 'top'; }
    else if (r < R + DECK.feltH) { ty = (r - R) / VIEW.tilt; phase = 'side'; }
    else if (r < R + DECK.feltH + R) { ty = TABLE_H + (r - R - DECK.feltH) / VIEW.tilt; phase = 'bottom'; }
    else { ty = TABLE_H + (r - R - DECK.feltH) / VIEW.tilt; phase = 'apron'; }

    const hw = (DECK.feltW / 2) * scaleAt(ty);
    const outer = hw + R;
    const ox0 = Math.round(mid - outer), ox1 = Math.round(mid + outer);

    if (phase === 'top') {
      const d = r / R;                     // 0 at the outer edge, 1 at the cloth
      const c = d < 0.18 ? 'wood1' : d < 0.42 ? 'wood4' : d < 0.72 ? 'wood3' : 'wood2';
      rect(g, ox0, r, ox1 - ox0, 1, c);
    } else if (phase === 'side') {
      const ix0 = Math.round(mid - hw), ix1 = Math.round(mid + hw);
      for (let i = 0; i < R; i++) {
        const d = i / R;
        const c = d < 0.15 ? 'wood1' : d < 0.5 ? 'wood2' : d < 0.8 ? 'wood3' : 'wood2';
        px(g, ox0 + i, r, c);
        px(g, ix1 + (R - 1 - i), r, d < 0.15 ? 'wood1' : d < 0.5 ? 'wood2' : 'wood1');
      }
      void ix0;
    } else if (phase === 'bottom') {
      const d = (r - R - DECK.feltH) / R;  // 0 at the cloth, 1 at the outer edge
      const c = d < 0.14 ? 'wood4' : d < 0.4 ? 'wood3' : d < 0.75 ? 'wood2' : 'wood1';
      rect(g, ox0, r, ox1 - ox0, 1, c);
    } else {
      const d = (r - R - DECK.feltH - R) / DECK.apron;
      dither(g, ox0 + 2, r, ox1 - ox0 - 4, 1, 'wood1', 'wood0', Math.round(d * 16));
    }
  }

  // grain streaks, confined to the timber
  for (let i = 0; i < 300; i++) {
    let n = ((i + 1) * 2654435761 ^ ((seed | 0) * 2246822519)) >>> 0;
    const gy = n % H; n = (n * 1103515245 + 12345) >>> 0;
    const gx = n % W; n = (n * 1103515245 + 12345) >>> 0;
    const len = 3 + (n % 16);
    // skip anything that would land on the cloth opening
    const ty = (gy - R) / VIEW.tilt;
    const hw = (DECK.feltW / 2) * scaleAt(ty);
    const onCloth = gy > R && gy < R + DECK.feltH && gx > mid - hw && gx < mid + hw;
    if (onCloth) continue;
    rect(g, gx, gy, Math.min(len, W - gx), 1, (n & 1) ? 'wood1' : 'wood3');
  }

  // brass beading around the cloth opening + the cushion shadow line
  for (let r = 0; r < DECK.feltH; r++) {
    const ty = r / VIEW.tilt;
    const hw = (DECK.feltW / 2) * scaleAt(ty);
    const y = R + r;
    px(g, Math.round(mid - hw) - 1, y, 'brass1');
    px(g, Math.round(mid + hw), y, 'brass0');
    px(g, Math.round(mid - hw) - 2, y, 'wood0');
    px(g, Math.round(mid + hw) + 1, y, 'wood0');
  }
  {
    const hwTop = (DECK.feltW / 2) * scaleAt(0);
    const hwBot = (DECK.feltW / 2) * scaleAt(TABLE_H);
    rect(g, Math.round(mid - hwTop) - 1, R - 1, Math.round(hwTop * 2) + 2, 1, 'brass2');
    rect(g, Math.round(mid - hwTop), R, Math.round(hwTop * 2), 1, 'cloth0');
    rect(g, Math.round(mid - hwBot) - 1, R + DECK.feltH, Math.round(hwBot * 2) + 2, 1, 'brass1');
  }

  // rivets along the near and far rails
  for (let i = 0; i <= 12; i++) {
    const tx = (TABLE_W * i) / 12;
    const topP = toScreen(tx, -R / VIEW.tilt / 2);
    const botP = toScreen(tx, TABLE_H + R / VIEW.tilt / 2);
    const txp = Math.round(topP.x - DECK.x), bxp = Math.round(botP.x - DECK.x);
    px(g, txp, Math.round(R * 0.35), 'brass2'); px(g, txp, Math.round(R * 0.35) + 1, 'brass0');
    px(g, bxp, R + DECK.feltH + Math.round(R * 0.6), 'brass2'); px(g, bxp, R + DECK.feltH + Math.round(R * 0.6) + 1, 'brass0');
  }

  // keel shadow melting into the water
  for (let i = 0; i < 7; i++) {
    const hw = (DECK.feltW / 2) * scaleAt(TABLE_H) + R;
    dither(g, Math.round(mid - hw) + 4 + i * 3, H + i, Math.round(hw * 2) - 8 - i * 6, 1, 'rgba(0,0,0,0)', 'ink', 13 - i * 2);
  }

  // ---- gate mouths, cut into the timber
  for (const slot of Object.keys(GATE_POS)) {
    const hid = assignment[slot];
    const p = GATE_POS[slot];
    const s = toScreen(p.x, p.y);
    const cx = Math.round(s.x - DECK.x), cy = Math.round(s.y - DECK.y);
    const rr = Math.round(GATE_R * VIEW.xs * s.s * 0.92);
    const ry = Math.max(3, Math.round(rr * 0.66));
    const hab = HABITAT_BY_ID[hid];

    // a wooden arch sitting proud of the rail, so the mouth reads as an opening
    ellipse(g, cx, cy, rr + 3, ry + 3, 'wood1');
    ellipse(g, cx, cy - 1, rr + 2, ry + 2, 'wood3');
    ellipse(g, cx, cy, rr + 1, ry + 1, 'wood0');
    // the throat: dark, with the biome glowing at the back of it
    ellipse(g, cx, cy, rr, ry, 'ink');
    if (hab) {
      ellipse(g, cx, cy + 1, rr - 2, Math.max(1, ry - 2), hab.dark || 'shadow');
      dither(g, cx - rr + 2, cy - 1, (rr - 2) * 2, 3, hab.dark || 'shadow', hab.color, 6);
      dither(g, cx - rr + 3, cy + ry - 3, (rr - 3) * 2, 2, hab.dark || 'shadow', hab.accent || hab.color, 9);
    }
    // brass throat ring, lit from the upper left
    for (let a = 0; a < 360; a += 6) {
      const rad = (a * Math.PI) / 180;
      const ex = Math.round(cx + Math.cos(rad) * (rr + 0.6));
      const ey = Math.round(cy + Math.sin(rad) * (ry + 0.6));
      px(g, ex, ey, (a > 200 && a < 340) ? 'brass3' : 'brass1');
    }
  }

  return mk.canvas;
}

/* ------------------------------------------------------------------------ deck */

export function createDeck(o = {}) {
  const seed = (o.seed | 0) || 1337;
  let assignment = o.assignment || {
    tl: 'savanna', tm: 'arctic', tr: 'jungle', bl: 'ocean', bm: 'desert', br: 'farm',
  };
  const felt = bakeFelt(seed);
  let frameCv = bakeFrame(seed, assignment);
  let t = 0;

  const deck = {
    assignment,
    closed: [],
    get gates() {
      return buildGates(assignment, { scale: o.gateScale || 1, closed: deck.closed });
    },

    setAssignment(a) {
      assignment = a;
      deck.assignment = a;
      frameCv = bakeFrame(seed, assignment);
    },

    update(dt) { t += dt; },

    /** Static layers. Call before the animals. */
    drawBase(g) {
      // hull shadow spilling onto the water
      for (let i = 0; i < 6; i++) {
        const hw = (DECK.feltW / 2) * scaleAt(TABLE_H) + DECK.rail;
        wash(g, VIEW.cx - hw + i * 2, DECK.apronY + DECK.apron + i, hw * 2 - i * 4, 1, 'ink', 0.3 - i * 0.045);
      }
      if (frameCv) blit(g, frameCv, DECK.x, DECK.y);
      if (felt) blit(g, felt, DECK.feltX, DECK.feltY);
    },

    /** Habitat gates: pulse, icon, name plate. */
    drawGates(g, o2 = {}) {
      const hi = o2.highlight;
      for (const gate of deck.gates) {
        const s = gateScreen(gate);
        const hab = HABITAT_BY_ID[gate.habitatId];
        if (!hab) continue;
        const rr = Math.round(gate.r * VIEW.xs * s.s * 0.92);
        const ry = Math.max(3, Math.round(rr * 0.66));
        const lit = hi === gate.habitatId || hi === gate.slot;
        const pulse = (Math.sin(t * 4 + gate.x * 0.05) + 1) / 2;

        if (gate.closed) {
          for (let i = -rr + 2; i <= rr - 2; i += 4) {
            line(g, s.x + i, s.y - ry + 1, s.x + i, s.y + ry - 1, 'grey0');
            px(g, s.x + i, s.y - ry + 1, 'grey2');
          }
          ellipseFrame(g, s.x, s.y, rr, ry, 'grey0');
          drawIcon(g, 'lock', s.x - 4, s.y - 4, { color: 'grey2' });
          continue;
        }

        if (lit) {
          const k = 1 + Math.round(pulse * 2);
          ellipseFrame(g, s.x, s.y, rr + k, ry + k, hab.color);
          ellipseFrame(g, s.x, s.y, rr + k + 2, ry + k + 1, hab.dark || 'shadow');
          // light spilling out of the mouth onto the cloth
          for (let i = 1; i < 5; i++) {
            dither(g, s.x - rr + i, s.y + ry - 1 + i, (rr - i) * 2, 1, 'rgba(0,0,0,0)', hab.color, Math.max(0, 5 - i));
          }
        }

        const ic = hasIcon(hab.icon) ? hab.icon : 'leaf';
        drawIcon(g, ic, s.x - 4, s.y - 5 - (lit ? Math.round(pulse) : 0), {
          color: lit ? 'white' : hab.accent || hab.color,
        });

        if (!o2.hideLabels) {
          const below = gate.y > TABLE_H / 2;
          const ly = below ? s.y + ry + 3 : s.y - ry - 10;
          const label = hab.short || hab.name.slice(0, 3).toUpperCase();
          const w = textW(label, { font: 3 }) + 7;
          box(g, s.x - w / 2, ly, w, 8, 'ink', 1);
          rect(g, s.x - w / 2 + 1, ly, w - 2, 1, hab.color);
          text(g, label, s.x, ly + 2, lit ? 'white' : hab.accent || hab.color, { font: 3, center: true });
        }
      }
    },

    /** Depth-sorted animals, scaled and shadowed by depth. */
    drawAnimals(g, world, o2 = {}) {
      const balls = world.balls.filter((b) => !b.sunk || (b.sinkT !== undefined && b.sinkT < 1));
      balls.sort((a, b) => a.y - b.y);
      const sel = o2.selected;
      for (const b of balls) {
        const animal = o2.lookup ? o2.lookup(b.animalId) : null;
        const sink = b.sinkT || 0;
        const s = toScreen(b.x, b.y, 0);
        const pr = ballPixelRadius(b.r, b.y) * (1 - sink * 0.75);
        if (sink < 0.92) {
          drawAnimalShadow(g, s.x + 1, s.y + Math.round(pr * 0.28), pr * 1.05, {
            alpha: 0.55 * (1 - sink), color: 'ink', flat: 0.34,
          });
        }
        const bob = o2.still ? 0 : Math.round(Math.sin(t * 2.4 + b.x * 0.07) * 0.5 - 0.5);
        const lift = Math.round(pr * 0.55) + (sink ? Math.round(sink * 9) : 0);
        if (animal) {
          drawAnimal(g, animal, s.x, s.y - lift + bob, {
            scale: s.s,
            squash: b.squash || 0,
            flip: b.vx < -0.4,
            dim: sink * 0.8,
            glow: sel && sel.id === b.id ? 'white' : (o2.glow && o2.glow[b.id]) || null,
            blink: ((t * 1.7 + (b.id || 0) * 0.37) % 4) < 0.12 ? 1 : 0,
          });
        } else {
          disc(g, s.x, s.y - lift, pr, 'bone');
        }
      }
    },

    /** Aim guide: dotted path, ghost ball, and the bounce direction off first contact. */
    drawAim(g, path, o2 = {}) {
      if (!path || !path.points || path.points.length < 2) return;
      const pts = path.points;
      const c = o2.color || 'white';
      let prev = toScreen(pts[0].x, pts[0].y);
      const phase = Math.floor(-t * 26);
      // A dark underlay first: a pale dashed line on green felt is nearly invisible,
      // and this is the single most important read on the table.
      for (let pass = 0; pass < 2; pass++) {
        prev = toScreen(pts[0].x, pts[0].y);
        const cc = pass === 0 ? 'ink' : c;
        const off = pass === 0 ? 1 : 0;
        for (let i = 1; i < pts.length; i++) {
          const s = toScreen(pts[i].x, pts[i].y);
          dashLine(g, prev.x + off, prev.y - 4 + off, s.x + off, s.y - 4 + off, cc, 2, 3, phase + i * 5);
          prev = s;
        }
      }
      const hit = path.hit;
      if (hit) {
        const s = toScreen(hit.x, hit.y);
        const pr = ballPixelRadius(o2.r || BALL_R, hit.y);
        ellipseFrame(g, s.x + 1, s.y - Math.round(pr * 0.5) + 1, Math.round(pr), Math.round(pr * 0.66), 'ink');
        ellipseFrame(g, s.x, s.y - Math.round(pr * 0.5), Math.round(pr), Math.round(pr * 0.66), 'white');
        if (hit.normal) {
          const nx = s.x + hit.normal.x * 20;
          const ny = s.y - Math.round(pr * 0.5) + hit.normal.y * 20 * (VIEW.tilt / VIEW.xs);
          dashLine(g, s.x, s.y - Math.round(pr * 0.5), nx, ny, hit.kind === 'gate' ? 'gold' : 'grey2', 1, 2, phase);
        }
      }
    },

    /**
     * The flood, climbing the ark. level 0 = dry rail, 1 = the water is over the felt.
     * Drawn as a real waterline with foam, wet timber below it, and — once it is on the
     * cloth — a shallow sheet with reflections, so the threat is legible at a glance
     * rather than being a number in the corner.
     */
    drawFlood(g, level, o2 = {}) {
      const k = clamp(level, 0, 1);
      if (k <= 0.001) return;
      // the water starts below the hull and climbs to just over the near rail
      const bottom = DECK.apronY + DECK.apron + 10;
      const topAt = DECK.feltY + DECK.feltH * 0.52;
      const wl = Math.round(lerp(bottom, topAt, Math.pow(k, 0.9)));
      const wob = Math.sin(t * 2.2) * (0.6 + k * 1.6);

      for (let y = wl; y < 360; y++) {
        const d = (y - wl) / Math.max(1, 360 - wl);
        const hw = (DECK.feltW / 2) * scaleAt(TABLE_H) + DECK.rail + 6;
        const x0 = Math.round(VIEW.cx - hw), ww = Math.round(hw * 2);
        // inside the hull the water is dark and still; outside it is open sea
        const band = d < 0.12 ? 'water2' : d < 0.34 ? 'water1' : d < 0.7 ? 'water0' : 'deep';
        dither(g, x0, y, ww, 1, band, 'water0', Math.round(d * 10));
        // moving crests
        if (((y + Math.floor(t * 26)) % 5) === 0) {
          for (let cx2 = 0; cx2 < ww; cx2 += 22) {
            const sx = Math.round(x0 + ((cx2 + t * 34) % ww) + Math.sin((cx2 + t * 40) * 0.06) * 3);
            rect(g, sx, y, 6, 1, d < 0.4 ? 'foam' : 'water3');
          }
        }
      }
      // the waterline itself: bright foam, and a wet stain on the timber above it
      rect(g, 0, wl + Math.round(wob), 640, 1, 'foam');
      rect(g, 0, wl + Math.round(wob) - 1, 640, 1, 'white');
      for (let i = 1; i < 7; i++) {
        dither(g, 0, wl + Math.round(wob) - 1 - i, 640, 1, 'rgba(0,0,0,0)', 'water1', 9 - i);
      }
      // spray along the line
      for (let i = 0; i < 26; i++) {
        const sx = ((i * 71 + Math.floor(t * 90)) % 640);
        const sy = wl + Math.round(wob) - 2 - ((i * 37 + Math.floor(t * 130)) % Math.round(4 + k * 8));
        px(g, sx, sy, i % 3 ? 'foam' : 'white');
      }
      // once it is on the cloth, sheet the felt and mirror the rail
      if (wl < DECK.feltY + DECK.feltH) {
        const from = Math.max(DECK.feltY, wl);
        for (let y = from; y < DECK.feltY + DECK.feltH; y++) {
          const row = y - DECK.feltY;
          const hw = feltHalfAtRow(row);
          wash(g, VIEW.cx - hw, y, hw * 2, 1, 'water1', 0.42);
          if (((y + Math.floor(t * 18)) % 7) === 0) {
            wash(g, VIEW.cx - hw, y, hw * 2, 1, 'foam', 0.16);
          }
        }
      }
      void o2;
    },

    /** The hooded table light: a bright pool at the far rail falling off toward you. */
    drawLight(g) {
      for (let i = 0; i < 22; i++) {
        const row = i;
        const hw = feltHalfAtRow(row);
        wash(g, VIEW.cx - hw, DECK.feltY + row, hw * 2, 1, 'white', 0.045 * (1 - i / 22));
      }
      for (let i = 0; i < 16; i++) {
        const row = DECK.feltH - 1 - i;
        const hw = feltHalfAtRow(row);
        wash(g, VIEW.cx - hw, DECK.feltY + row, hw * 2, 1, 'ink', 0.05 * (1 - i / 16));
      }
    },
  };

  return deck;
}

/** Aim angle in TABLE space from a ball toward a screen point. */
export function aimAngle(ball, mx, my) {
  const p = toTable(mx, my);
  return Math.atan2(p.y - ball.y, p.x - ball.x);
}

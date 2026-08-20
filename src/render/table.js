// The deck: a 2.5D pool table built as a floating barge.
//
// Physics is flat (table units, 232 x 116). The view is an ORTHOGRAPHIC TILT, not an
// isometric diamond — we want the classic tilted-rectangle pool read, which keeps the
// rails readable and the aim geometry intuitive:
//
//     screenX = ox + tx * xs
//     screenY = oy + ty * tilt - tz * zs
//
// xs is an integer 2 so table units map to whole pixels; tilt squashes depth. A ball of
// radius 5.2 units renders at ~10px, which is exactly half of SPRITE_SIZE (20) — animal
// sprites drop straight onto balls at scale 1.
//
// The static layers (felt, timber frame, gate mouths) are BAKED once into offscreen
// canvases. Only glows, labels, animals and particles are redrawn per frame.

import { P, col, mix } from '../core/palette.js';
import {
  rect, frame, px, line, dashLine, disc, ring, ellipse, ellipseFrame, tri, dither, vgrad,
  noiseFill, text, textW, makeCanvas, blit, wash, clamp, lerp,
} from '../core/pixel.js';
import { HABITAT_BY_ID } from '../data/habitats.js';
import { icon as drawIcon } from './uikit.js';
import { drawAnimal, drawAnimalShadow } from './sprites.js';
import { TABLE_W, TABLE_H, BALL_R } from '../game/physics.js';

export const VIEW = {
  ox: 164,          // screen x of table-unit x=0
  oy: 104,          // screen y of table-unit y=0
  xs: 2,            // horizontal units -> pixels
  tilt: 1.24,       // vertical units -> pixels (2 * 0.62 foreshortening)
  zs: 2,            // height units -> pixels
};

export const DECK = {
  feltX: VIEW.ox,
  feltY: VIEW.oy,
  feltW: TABLE_W * VIEW.xs,       // 464
  feltH: TABLE_H * VIEW.tilt,     // ~144
  rail: 12,
  apron: 12,
};
DECK.x = DECK.feltX - DECK.rail;
DECK.y = DECK.feltY - DECK.rail;
DECK.w = DECK.feltW + DECK.rail * 2;
DECK.h = DECK.feltH + DECK.rail * 2;
DECK.apronY = DECK.y + DECK.h;

export function toScreen(tx, ty, tz = 0) {
  return { x: VIEW.ox + tx * VIEW.xs, y: VIEW.oy + ty * VIEW.tilt - tz * VIEW.zs };
}

/** Inverse projection — turns a mouse position into a point on the felt plane. */
export function toTable(sx, sy) {
  return { x: (sx - VIEW.ox) / VIEW.xs, y: (sy - VIEW.oy) / VIEW.tilt };
}

/** Visual radius of a ball, in screen pixels. */
export function ballPixelRadius(r = BALL_R) { return r * VIEW.xs; }

/* --------------------------------------------------------------- gate geometry */

// Gate centres in TABLE UNITS. Corners sit slightly inside so a ball rolling along a
// rail still finds the mouth.
const GATE_POS = {
  tl: { x: 6, y: 6 },
  tm: { x: TABLE_W / 2, y: -1 },
  tr: { x: TABLE_W - 6, y: 6 },
  bl: { x: 6, y: TABLE_H - 6 },
  bm: { x: TABLE_W / 2, y: TABLE_H + 1 },
  br: { x: TABLE_W - 6, y: TABLE_H - 6 },
};
export const GATE_R = 9.5;

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

export function gateScreen(gate) {
  return toScreen(gate.x, gate.y, 0);
}

/* ------------------------------------------------------------------ baking */

function bakeFelt(seed) {
  const { canvas, g } = makeCanvas(DECK.feltW, DECK.feltH);
  if (!g) return null;
  const W = DECK.feltW, H = DECK.feltH;

  // base cloth with a soft top-lit gradient
  vgrad(g, 0, 0, W, H, ['cloth2', 'cloth1', 'cloth1', 'cloth0'], 4);
  // woven speckle so the felt has tooth
  noiseFill(g, 0, 0, W, H, 'rgba(0,0,0,0)', 'cloth3', 0.05, seed | 0);
  noiseFill(g, 0, 0, W, H, 'rgba(0,0,0,0)', 'cloth0', 0.06, (seed | 0) + 77);

  // nap lines: faint horizontal brushing, the thing that makes cloth read as cloth
  for (let y = 0; y < H; y += 3) {
    dither(g, 0, y, W, 1, 'rgba(0,0,0,0)', 'cloth2', 2);
  }

  // edge shading — the cloth sinks toward the rails
  for (let i = 0; i < 10; i++) {
    const a = 6 - i * 0.6;
    dither(g, 0, i, W, 1, 'rgba(0,0,0,0)', 'cloth0', Math.max(0, a));
    dither(g, 0, H - 1 - i, W, 1, 'rgba(0,0,0,0)', 'cloth0', Math.max(0, a));
    dither(g, i, 0, 1, H, 'rgba(0,0,0,0)', 'cloth0', Math.max(0, a * 0.7));
    dither(g, W - 1 - i, 0, 1, H, 'rgba(0,0,0,0)', 'cloth0', Math.max(0, a * 0.7));
  }

  // baulk line + the break spot, engraved in pale thread
  const bx = Math.round(W * 0.22);
  dashLine(g, bx, 2, bx, H - 3, 'cloth3', 1, 2);
  const spot = toScreen(TABLE_W * 0.72, TABLE_H / 2);
  ring(g, spot.x - DECK.feltX, spot.y - DECK.feltY, 4, 'cloth3');
  px(g, spot.x - DECK.feltX, spot.y - DECK.feltY, 'cloth3');

  // diamond sight markers along the long rails, inside the cloth edge
  for (let i = 1; i < 8; i++) {
    const x = Math.round((W * i) / 8);
    tri(g, x, 1, x - 2, 4, x + 2, 4, 'cloth3');
    tri(g, x, H - 2, x - 2, H - 5, x + 2, H - 5, 'cloth3');
  }

  return canvas;
}

function bakeFrame(seed, assignment) {
  const { canvas, g } = makeCanvas(DECK.w, DECK.h + DECK.apron + 6);
  if (!g) return null;
  const W = DECK.w, H = DECK.h, R = DECK.rail;

  // ---- outer timber slab
  rect(g, 0, 0, W, H, 'wood2');

  // top rail: lit from above
  vgrad(g, 0, 0, W, R, ['wood4', 'wood3', 'wood2'], 3);
  // bottom rail: the tall one, catches light on its top face then falls into shadow
  vgrad(g, 0, H - R, W, R, ['wood3', 'wood2', 'wood1'], 3);
  // side rails: vertical bands, darker toward the outside
  for (let i = 0; i < R; i++) {
    const t = i / R;
    const cA = i < 3 ? 'wood1' : 'wood2';
    const cB = i < 3 ? 'wood2' : 'wood3';
    dither(g, i, 0, 1, H, cA, cB, Math.round(t * 14));
    dither(g, W - 1 - i, 0, 1, H, cA, cB, Math.round(t * 14));
  }

  // grain: long deterministic streaks
  for (let i = 0; i < 220; i++) {
    let n = ((i + 1) * 2654435761 ^ ((seed | 0) * 2246822519)) >>> 0;
    const x = n % W; n = (n * 1103515245 + 12345) >>> 0;
    const y = n % H; n = (n * 1103515245 + 12345) >>> 0;
    const len = 3 + (n % 14);
    const onRail = y < R || y > H - R - 1 || x < R || x > W - R - 1;
    if (!onRail) continue;
    rect(g, x, y, Math.min(len, W - x), 1, (n & 1) ? 'wood1' : 'wood3');
  }

  // brass edge beading around the cloth opening
  frame(g, R - 2, R - 2, DECK.feltW + 4, DECK.feltH + 4, 'brass1');
  rect(g, R - 2, R - 2, DECK.feltW + 4, 1, 'brass2');
  rect(g, R - 1, R - 1, DECK.feltW + 2, 1, 'brass0');
  // inner shadow so the cloth sits BELOW the rail lip
  rect(g, R, R, DECK.feltW, 1, 'cloth0');
  rect(g, R, R, 1, DECK.feltH, 'cloth0');

  // outer highlight + drop line
  frame(g, 0, 0, W, H, 'wood1');
  rect(g, 0, 0, W, 1, 'wood4');

  // rivets along the rails
  for (let x = 6; x < W - 4; x += 22) {
    px(g, x, 3, 'brass2'); px(g, x, 4, 'brass0');
    px(g, x, H - 5, 'brass2'); px(g, x, H - 4, 'brass0');
  }

  // ---- apron below the front rail: planks, then a shadowed underside
  const ay = H;
  for (let i = 0; i < DECK.apron; i++) {
    const t = i / DECK.apron;
    dither(g, 2, ay + i, W - 4, 1, 'wood1', 'wood0', Math.round(t * 16));
  }
  for (let x = 8; x < W - 8; x += 16) rect(g, x, ay, 1, DECK.apron, 'wood0');
  rect(g, 2, ay, W - 4, 1, 'wood2');
  // keel shadow fading into the water
  for (let i = 0; i < 6; i++) dither(g, 6 + i * 2, ay + DECK.apron + i, W - 12 - i * 4, 1, 'rgba(0,0,0,0)', 'ink', 12 - i * 2);

  // ---- gate mouths cut into the timber
  for (const slot of Object.keys(GATE_POS)) {
    const hid = assignment[slot];
    const p = GATE_POS[slot];
    const s = toScreen(p.x, p.y);
    const cx = s.x - DECK.x, cy = s.y - DECK.y;
    const rr = Math.round(GATE_R * VIEW.xs * 0.85);

    // the mouth: dark opening with a lip
    ellipse(g, cx, cy, rr, Math.round(rr * 0.62) + 1, 'ink');
    ellipseFrame(g, cx, cy, rr + 1, Math.round(rr * 0.62) + 2, 'wood0');
    // brass throat ring, brighter on the lit side
    for (let a = 0; a < 360; a += 12) {
      const rad = (a * Math.PI) / 180;
      const ex = Math.round(cx + Math.cos(rad) * (rr + 1));
      const ey = Math.round(cy + Math.sin(rad) * (Math.round(rr * 0.62) + 1));
      px(g, ex, ey, a > 180 ? 'brass1' : 'brass2');
    }
    // a hint of the habitat inside the throat, baked so it never flickers
    const hab = HABITAT_BY_ID[hid];
    if (hab) {
      ellipse(g, cx, cy + 1, rr - 3, Math.round(rr * 0.4), hab.dark || 'shadow');
      dither(g, cx - rr + 3, cy - 1, (rr - 3) * 2, 3, hab.dark || 'shadow', hab.color, 5);
    }
  }

  return canvas;
}

/* ------------------------------------------------------------------- deck */

export function createDeck(o = {}) {
  const seed = (o.seed | 0) || 1337;
  let assignment = o.assignment || {
    tl: 'savanna', tm: 'arctic', tr: 'jungle', bl: 'ocean', bm: 'desert', br: 'farm',
  };
  let felt = bakeFelt(seed);
  let frameCv = bakeFrame(seed, assignment);
  let t = 0;

  const deck = {
    assignment,
    get gates() { return buildGates(assignment, { scale: o.gateScale || 1, closed: deck.closed }); },
    closed: [],

    setAssignment(a) {
      assignment = a;
      deck.assignment = a;
      frameCv = bakeFrame(seed, assignment);
    },

    update(dt) { t += dt; },

    /** Static layers. Call before drawing animals. */
    drawBase(g) {
      // hull shadow on the water
      for (let i = 0; i < 5; i++) {
        wash(g, DECK.x - 4 + i, DECK.apronY + DECK.apron + i, DECK.w + 8 - i * 2, 1, 'ink', 0.28 - i * 0.05);
      }
      if (frameCv) blit(g, frameCv, DECK.x, DECK.y);
      if (felt) blit(g, felt, DECK.feltX, DECK.feltY);
    },

    /** Habitat gates: glow, icon, name plate. Drawn AFTER the felt, BEFORE the animals
     *  for the top row and AFTER them for the bottom row, so animals can pass in front. */
    drawGates(g, o2 = {}) {
      const hi = o2.highlight;                 // habitat id or slot to pulse
      const gates = deck.gates;
      for (const gate of gates) {
        const s = gateScreen(gate);
        const hab = HABITAT_BY_ID[gate.habitatId];
        if (!hab) continue;
        const rr = Math.round(gate.r * VIEW.xs * 0.85);
        const lit = hi === gate.habitatId || hi === gate.slot;
        const pulse = (Math.sin(t * 4 + gate.x * 0.05) + 1) / 2;

        if (gate.closed) {
          // sealed: iron bars over the mouth
          for (let i = -rr + 2; i <= rr - 2; i += 4) {
            line(g, s.x + i, s.y - rr * 0.5, s.x + i, s.y + rr * 0.5, 'grey0');
            px(g, s.x + i, s.y - rr * 0.5, 'grey2');
          }
          ellipseFrame(g, s.x, s.y, rr, Math.round(rr * 0.62), 'grey0');
          drawIcon(g, 'lock', s.x - 4, s.y - 4, { color: 'grey2' });
          continue;
        }

        // glow ring — the "this one wants your animal" tell
        if (lit) {
          const k = 1 + Math.round(pulse * 2);
          ellipseFrame(g, s.x, s.y, rr + k, Math.round(rr * 0.62) + k, hab.color);
          ellipseFrame(g, s.x, s.y, rr + k + 2, Math.round(rr * 0.62) + k + 1, hab.dark || 'shadow');
        }

        // little biome diorama sitting in the throat
        drawIcon(g, hab.icon, s.x - 4, s.y - 5 - (lit ? Math.round(pulse) : 0), {
          color: lit ? 'white' : hab.accent || hab.color,
        });

        // name plate on the outward side of the rail
        if (!o2.hideLabels) {
          const below = gate.y > TABLE_H / 2;
          const ly = below ? s.y + 8 : s.y - 15;
          const label = hab.short || hab.name.slice(0, 3).toUpperCase();
          const w = textW(label, { font: 3 }) + 6;
          rect(g, s.x - w / 2, ly, w, 7, 'ink');
          rect(g, s.x - w / 2, ly, w, 1, hab.color);
          text(g, label, s.x, ly + 1, lit ? 'white' : hab.accent || hab.color, { font: 3, center: true });
        }
      }
    },

    /** Depth-sorted animals with shadows. `world` is the physics world. */
    drawAnimals(g, world, o2 = {}) {
      const balls = world.balls.filter((b) => !b.sunk || (b.sinkT !== undefined && b.sinkT < 1));
      balls.sort((a, b) => a.y - b.y);
      const sel = o2.selected;
      for (const b of balls) {
        const animal = o2.lookup ? o2.lookup(b.animalId) : null;
        const sink = b.sinkT || 0;
        const s = toScreen(b.x, b.y, 0);
        const pr = ballPixelRadius(b.r) * (1 - sink * 0.75);
        // shadow first, on the cloth plane
        if (sink < 0.9) drawAnimalShadow(g, s.x, s.y + Math.round(pr * 0.55), pr, { dim: sink });
        const bob = o2.still ? 0 : Math.round(Math.sin(t * 2.4 + b.x * 0.07) * 0.5 - 0.5);
        const lift = Math.round(pr * 0.55) + (sink ? Math.round(sink * 8) : 0);
        if (animal) {
          drawAnimal(g, animal, s.x, s.y - lift + bob, {
            scale: 1,
            squash: b.squash || 0,
            flip: b.vx < -0.4,
            dim: sink,
            glow: sel && sel.id === b.id ? 'white' : (o2.glow && o2.glow[b.id]) || null,
            blink: ((t * 1.7 + b.id * 0.37) % 4) < 0.12 ? 1 : 0,
          });
        } else {
          disc(g, s.x, s.y - lift, pr, 'bone');
        }
      }
    },

    /** Aim guide: dotted path, ghost ball, and the reflected direction off first contact. */
    drawAim(g, path, o2 = {}) {
      if (!path || !path.points || path.points.length < 2) return;
      const pts = path.points;
      const c = o2.color || 'white';
      let prev = toScreen(pts[0].x, pts[0].y);
      const phase = Math.floor(-t * 26);
      for (let i = 1; i < pts.length; i++) {
        const s = toScreen(pts[i].x, pts[i].y);
        dashLine(g, prev.x, prev.y, s.x, s.y, c, 2, 3, phase + i * 5);
        prev = s;
      }
      const hit = path.hit;
      if (hit) {
        const s = toScreen(hit.x, hit.y);
        const pr = ballPixelRadius(o2.r || BALL_R);
        ellipseFrame(g, s.x, s.y - Math.round(pr * 0.55), pr, Math.round(pr * 0.62), 'white');
        if (hit.normal) {
          const nx = s.x + hit.normal.x * 18, ny = s.y + hit.normal.y * 18 * (VIEW.tilt / VIEW.xs);
          dashLine(g, s.x, s.y, nx, ny, hit.kind === 'gate' ? 'gold' : 'grey2', 1, 2, phase);
        }
      }
    },

    /** A soft directional shaft of light across the cloth — pure vibe. */
    drawLight(g) {
      for (let i = 0; i < 26; i++) {
        const y = DECK.feltY + i;
        wash(g, DECK.feltX, y, DECK.feltW, 1, 'white', 0.035 * (1 - i / 26));
      }
      for (let i = 0; i < 18; i++) {
        const y = DECK.feltY + DECK.feltH - 1 - i;
        wash(g, DECK.feltX, y, DECK.feltW, 1, 'ink', 0.05 * (1 - i / 18));
      }
    },
  };

  return deck;
}

/** Convert a screen point to the nearest legal aim angle from a ball. */
export function aimAngle(ball, mx, my) {
  const s = toScreen(ball.x, ball.y);
  const dx = (mx - s.x) / VIEW.xs;
  const dy = (my - s.y) / VIEW.tilt;
  return Math.atan2(dy, dx);
}

// THE ANIMALS. Every one of them is a ball.
//
// That is a design decision, not a shortcut: a sphere reads at 32 pixels, it rolls
// convincingly, it squashes when it lands, and it lets ninety animals share one lighting
// model so a jungle and a snowfield look like the same game. Species live in the details
// that BREAK the circle -- ears, horns, a beak, a tail, a shell -- plus the pattern
// wrapped onto the surface and two dot eyes.
//
// WHAT WENT WRONG THE FIRST TIME, because it is all still avoidable:
//
//   NO CONTOUR. The ball had no dark edge, so on grass it turned to mush. Everything now
//   goes through render/pixbuf.js and gets a one-pixel ink outline computed after the
//   last shape is down -- and every attached part (ear, beak, trunk) gets its own, so it
//   does not dissolve into the body it overlaps.
//
//   A STRAIGHT TERMINATOR. Five tones split along a diagonal is a ball cut in half. The
//   bands now follow the surface, with a rim on the shadow side and a bounce below it.
//
//   PATTERNS THAT ATE THE ANIMAL. Mixing the pattern colour toward white on the lit side
//   gave big pale blobs; a cow was an amoeba. The pattern now shades with the ball and
//   never crosses the face.
//
//   FACES TOO BIG. A muzzle covering the lower third is a snout, not a face. Eyes are two
//   pixels, six apart, low on the ball, with one pixel of catch light. Small features,
//   lots of ball.
//
// THREE BAKES PER ANIMAL, each memoised, split by WHAT MOVES:
//
//     BACK[tint]         behind the ball: tail, wing, shell, quills, hump, mane
//     BODY[phase][tint]  the shaded sphere and its pattern, at 8 rotations
//     FACE[mood][tint]   ears, features, eyes -- everything that must stay upright
//
// Drawing is three blits. The body spins as the animal rolls; the face never does,
// because a cute face that rotates away from the camera stops being cute. Live pixels on
// top handle wet sheen, drips and rain.

import { P, col, mix } from '../core/palette.js';
import { makeCanvas, rect, px, ellipse, wash, clamp } from '../core/pixel.js';
import {
  makeBuf, bset, bget, bmir, brect, bline, btri, orb, blob, limb, orbShade, outline, flush,
} from './pixbuf.js';

export const SPRITE_SIZE = 32;
export const ICON_SIZE = 16;

const CX = 16;
const BALL_R = 13;
const PHASES = 8;
const EYE_Y = CX + 2;             // low on the ball: cuter
const EYE_DX = 3;                 // 2px eyes at CX-4 and CX+2 -- close together

export const DEFAULT_RECIPE = {
  body: 'grey1', shade: 'grey0', light: 'grey2', belly: 'bone',
  eye: 'ink', eyeStyle: 'dot', ears: 'round', face: 'muzzle',
  pattern: 'none', patternColor: 'ink', extra: 'none',
};

/* ------------------------------------------------------------------- colours */

/** Tint a key toward another colour, for the wet/frozen/sick variants. */
function tinted(key, tint, amt) {
  return tint ? mix(P[key] || key, P[tint] || tint, amt) : (P[key] || key);
}

/**
 * The full tone set for one animal.
 *
 * Five body tones from three recipe colours, because a roster written with three is not
 * going to be rewritten with five: `deep` and `hi` are derived, and derived tones are
 * consistent across ninety animals in a way hand-picked ones never are.
 */
function tones(rc, o = {}) {
  const t = o.tint, a = o.tintAmt || 0.4;
  const body = tinted(rc.body || 'grey1', t, a);
  const shade = tinted(rc.shade || 'grey0', t, a);
  const light = tinted(rc.light || 'grey2', t, a);
  return {
    deep: mix(shade, P.ink, 0.28),   // 0.45 put the shadow side into the background
    shade,
    body,
    light,
    hi: mix(light, P.white, 0.45),
    belly: tinted(rc.belly || 'bone', t, a * 0.6),
    pat: tinted(rc.patternColor || 'ink', t, a * 0.5),
    eye: rc.eye || 'ink',
    ramp: null,
  };
}

function ramp(C) { return [C.deep, C.shade, C.body, C.light, C.hi]; }

/* ---------------------------------------------------------------------- body */

/**
 * The shaded sphere, plus its pattern, plus a belly and a specular.
 *
 * `phase` spins the pattern; the shading never spins, because the light does not orbit
 * the animal when the animal rolls.
 */
function ballBody(b, rc, C, phase) {
  const r = BALL_R;
  orb(b, CX, CX, r, orbShade(ramp(C), { bounce: 0.55 }));

  // The belly is a BIB: an oval low and central, strong in the middle and fading at its
  // edge. As a wide fading crescent at a third strength it did nothing -- a penguin came
  // out uniformly dark -- and at full strength across the lower half it washed the
  // shading out and the ball went flat. An oval does both jobs.
  const by = 5, brx = r * 0.62, bry = r * 0.52;
  for (let y = -bry; y <= bry; y++) {
    for (let x = -brx; x <= brx; x++) {
      const t = (x * x) / (brx * brx) + (y * y) / (bry * bry);
      if (t > 1) continue;
      const cur = bget(b, CX + x, CX + by + y);
      if (cur === null) continue;
      const k = 0.85 * (1 - t * t);
      bset(b, CX + x, CX + by + y, mix(P[cur] || cur, P[C.belly] || C.belly, k));
    }
  }

  ballPattern(b, rc, C, (phase / PHASES) * Math.PI * 2, r);

  // the specular: a small arc where the light hits, drawn last so nothing covers it
  bset(b, CX - 5, CX - 6, C.hi);
  bset(b, CX - 4, CX - 6, mix(P[C.hi] || C.hi, P.white, 0.6));
  bset(b, CX - 6, CX - 5, C.hi);
  bset(b, CX - 5, CX - 5, mix(P[C.hi] || C.hi, P.white, 0.35));
}

/**
 * The pattern, wrapped onto the sphere and rotated by `spin`.
 *
 * Evaluated in spherical coordinates (u = longitude + spin, v = latitude) rather than in
 * screen space, so a stripe bends round the ball and a spot squashes toward the edge.
 * That one detail is the difference between a patterned sphere and a decal.
 */
function ballPattern(b, rc, C, spin, r) {
  const kind = rc.pattern || 'none';
  if (kind === 'none') return;
  // NEVER pure ink. A cow's patches drawn in the same colour as the outline and the
  // background made the ball look bitten -- one continuous black region over forty per
  // cent of a white animal reads as missing geometry, not as a marking. One step back
  // toward the body keeps it a marking.
  const pat = mix(P[C.pat] || C.pat, P[C.body] || C.body, 0.24);
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > (r - 1) * (r - 1)) continue;
      // KEEP OFF THE FACE. A patch across the eyes is not a marking, it is a blindfold.
      if (y > 0 && Math.abs(x) < 6 && y < 9) continue;
      const nx = x / r, ny = y / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      if (nz < 0.16) continue;
      const u = Math.atan2(nx, nz) + spin;
      const v = Math.asin(Math.max(-1, Math.min(1, ny)));
      let on = false;
      // Frequencies are tuned so a marking is SEVERAL SMALL SHAPES, not one region. The
      // difference between "a spotted animal" and "half an animal in another colour" is
      // entirely in these numbers.
      switch (kind) {
        case 'stripes': on = Math.sin(u * 5.5) > 0.58; break;
        case 'bands': on = Math.sin(v * 8 + 0.6) > 0.52; break;
        case 'spots': on = Math.sin(u * 4.6) * Math.cos(v * 4.8) > 0.62; break;
        case 'patches': on = Math.sin(u * 3.1 + 1.1) * Math.cos(v * 3.3) > 0.5; break;
        case 'freckles': on = Math.sin(u * 11) * Math.cos(v * 10) > 0.72; break;
        case 'scales': on = Math.sin(u * 9) + Math.cos(v * 10) > 1.35; break;
        case 'plates': on = Math.sin(v * 6.5) > 0.66; break;
        case 'wool': on = Math.sin(u * 7.5) * Math.sin(v * 7) > 0.32; break;
        default: break;
      }
      if (!on) continue;
      // the pattern takes the ball's light, and NEVER mixes toward white: that is what
      // turned a cow into a pale amoeba
      const lam = nx * -0.52 + ny * -0.66 + nz * 0.54;
      bset(b, CX + x, CX + y,
        lam > 0.5 ? pat : lam > 0 ? mix(pat, P.ink, 0.18) : mix(pat, P.ink, 0.42));
    }
  }
  // wool gets a fluffed rim, because a sheep is a silhouette before it is a texture
  if (kind === 'wool') {
    for (let a = 0; a < 360; a += 22) {
      const rad = (a * Math.PI) / 180;
      const wx = CX + Math.cos(rad) * (r - 1), wy = CX + Math.sin(rad) * (r - 1);
      if (wy > CX + 2 && Math.abs(wx - CX) < 7) continue;         // not over the face
      orb(b, wx, wy, 2.2, Math.sin(rad + spin) > 0 ? C.hi : C.light);
    }
  }
}

/* ------------------------------------------------------------------- features

Everything here has to CROSS the circle's edge -- that is the whole job. A detail that
stays inside the silhouette is decoration; a detail that breaks it is a species.
*/

/**
 * A chain of shaded beads with ONE contour round the whole thing.
 *
 * Drawing each bead with its own `edge` looked fine for a limb and was a disaster for
 * anything thin: at radius one, a bead with a one-pixel outline is almost entirely
 * outline, so every horn, antler and tail came out as a chain of black blobs. Two passes
 * -- the whole chain slightly fat in ink, then the whole chain in colour -- gives one
 * clean edge and keeps the beads bright.
 */
function chain(b, pts, ramp, edge) {
  if (edge) {
    for (const p of pts) {
      const r = p.r + 0.9;
      for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
        for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
          if (x * x + y * y > r * r) continue;
          bset(b, p.x + x, p.y + y, edge);
        }
      }
    }
  }
  const sh = orbShade(ramp);
  for (const p of pts) {
    for (let y = -Math.ceil(p.r); y <= Math.ceil(p.r); y++) {
      for (let x = -Math.ceil(p.r); x <= Math.ceil(p.r); x++) {
        const d = x * x + y * y;
        if (d > p.r * p.r) continue;
        const nx = x / Math.max(1, p.r), ny = y / Math.max(1, p.r);
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        bset(b, p.x + x, p.y + y, sh(nx, ny, nz));
      }
    }
  }
}

/** Behind the ball: tails, wings, plumes, fins, shells, quills, humps, manes. */
function backFeatures(b, rc, C) {
  const r = BALL_R;
  const lo = C.shade, mid = C.body, hi = C.light;
  switch (rc.extra) {
    case 'tail': {
      // an S-curve with a tuft on the end: a straight diagonal stick is a stick
      const pts = [];
      let x = CX + r - 3, y = CX + 4;
      for (let i = 0; i < 12; i++) {
        const f = i / 11;
        x += 1.1;
        y -= Math.sin(f * 2.6) * 1.5;
        pts.push({ x, y, r: 2.2 - f * 0.9 });
      }
      chain(b, pts, [lo, mid, hi], 'ink');
      chain(b, [{ x: x + 1, y: y - 1, r: 3 }], [lo, mid, hi], 'ink');
      break;
    }
    case 'wing': {
      // a FOLDED wing: one mass with three feather tips off the back of it. Four splayed
      // limbs a side read as talons, which is not what anybody wants on a chicken.
      for (const s of [-1, 1]) {
        blob(b, CX + s * (r - 2), CX + 1, 5, 7, orbShade([lo, mid, hi]), { edge: 'ink' });
        for (let k = 0; k < 3; k++) {
          limb(b, CX + s * (r - 1), CX + 4 + k,
            CX + s * (r + 4 + k), CX + 8 + k * 2,
            1.6 - k * 0.2, 0.9, [lo, mid, hi], { edge: 'ink' });
        }
      }
      break;
    }
    case 'plume': {
      for (let i = 0; i < 5; i++) {
        const a = -1.9 + i * 0.34;
        limb(b, CX + 3, CX - r + 4,
          CX + 3 + Math.cos(a) * 12, CX - r + 4 + Math.sin(a) * 12,
          1.6, 0.9, [lo, mid, hi], { edge: 'ink' });
      }
      break;
    }
    case 'sail': {
      for (let i = 0; i < 9; i++) {
        const h = 9 - Math.abs(i - 4) * 1.4;
        brect(b, CX - 8 + i * 2, CX - r - Math.round(h), 2, Math.round(h) + 3, i % 2 ? mid : lo);
      }
      break;
    }
    case 'flipper': {
      for (const s of [-1, 1]) {
        blob(b, CX + s * (r - 1), CX + 5, 4, 2.4, orbShade([lo, mid, hi]), { edge: 'ink' });
      }
      break;
    }
    case 'shell': {
      // a dome BEHIND the ball, so the animal sits in it rather than wearing it
      blob(b, CX, CX - 2, r + 2, r - 1, orbShade([mix(P[lo], P.ink, 0.3), lo, mid, hi]));
      // plates: rings AND radial seams, or a shell is just a darker ball behind a ball
      for (let i = 1; i <= 3; i++) {
        const rr = 4 + i * 3.4;
        for (let a = 3.25; a < 6.2; a += 0.09) {
          bset(b, CX + Math.cos(a) * rr, CX - 2 + Math.sin(a) * rr * 0.82, mix(P[lo], P.ink, 0.45));
          bset(b, CX + Math.cos(a) * (rr - 1), CX - 2 + Math.sin(a) * (rr - 1) * 0.82, hi);
        }
      }
      for (let k = 0; k < 5; k++) {
        const a = 3.3 + k * 0.66;
        for (let d = 4; d < 15; d++) {
          bset(b, CX + Math.cos(a) * d, CX - 2 + Math.sin(a) * d * 0.82, mix(P[lo], P.ink, 0.4));
        }
      }
      break;
    }
    case 'quills': {
      for (let a = -2.5; a < -0.6; a += 0.14) {
        const len = 7 + Math.sin(a * 3) * 2;
        const pts = [];
        for (let i = 0; i <= 6; i++) {
          const f = i / 6;
          pts.push({
            x: CX + Math.cos(a) * (r - 2 + f * (len + 2)),
            y: CX + Math.sin(a) * (r - 2 + f * (len + 2)),
            r: 1.5 - f * 0.9,
          });
        }
        chain(b, pts, [lo, mid, hi], 'ink');
      }
      break;
    }
    case 'hump': {
      blob(b, CX + 1, CX - r + 1, 8, 5, orbShade([lo, mid, hi]), { edge: 'ink' });
      break;
    }
    case 'mane': {
      // Overlapping locks with NO per-lock contour: eighteen little outlines round a ring
      // gave a wall of dark speckle that read as stones, not fur. The layer's own outline
      // pass draws the one edge that matters.
      for (let a = 0; a < 6.28; a += 0.26) {
        const wob = 2.4 + Math.sin(a * 3) * 1.3;
        orb(b, CX + Math.cos(a) * (r + 1), CX + Math.sin(a) * (r + 1), wob,
          orbShade([lo, mid, hi]));
      }
      // a few darker roots, so it has depth rather than being a doughnut
      for (let a = 0.13; a < 6.28; a += 0.52) {
        orb(b, CX + Math.cos(a) * (r - 1), CX + Math.sin(a) * (r - 1), 1.6, lo);
      }
      break;
    }
    case 'gill': {
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          blob(b, CX + s * (r - 2), CX + 1 + i * 3, 3, 1.2, i % 2 ? 'red2' : 'red1');
        }
      }
      break;
    }
    case 'antenna': {
      for (const s of [-1, 1]) {
        limb(b, CX + s * 3, CX - r + 3, CX + s * 8, CX - r - 6, 1.1, 0.8, [lo, mid, hi],
          { edge: 'ink' });
        orb(b, CX + s * 8, CX - r - 7, 1.8, orbShade([lo, mid, hi]), { edge: 'ink' });
      }
      break;
    }
    default: break;
  }
}

/** Ears, horns and crests: the fastest way to tell two balls apart. */
function ballEars(b, rc, C) {
  const r = BALL_R;
  const lo = C.shade, mid = C.body, hi = C.light;
  const inner = mix(P.pink, P[mid] || mid, 0.45);
  const kind = rc.ears || 'none';
  if (kind === 'none') return;
  for (const s of [-1, 1]) {
    // out at the RIM, not on the face. Radius five at eight pixels in gave two balloons
    // sitting on top of the head and every animal read as the same koala.
    const bx = CX + s * 9, by = CX - 8;
    switch (kind) {
      case 'round':
        orb(b, bx, by, 3.6, orbShade([lo, mid, hi]), { edge: 'ink' });
        orb(b, bx, by + 1, 1.6, inner);
        break;
      case 'tiny':
        orb(b, CX + s * 8, CX - 9, 2.6, orbShade([lo, mid, hi]), { edge: 'ink' });
        bset(b, CX + s * 8, CX - 9, inner);
        break;
      case 'pointy':
        btri(b, CX + s * 4, CX - 9, CX + s * 11, CX - 9, CX + s * 8, CX - 18, 'ink');
        btri(b, CX + s * 5, CX - 9, CX + s * 10, CX - 9, CX + s * 8, CX - 16, mid);
        btri(b, CX + s * 6, CX - 10, CX + s * 9, CX - 10, CX + s * 8, CX - 14, inner);
        break;
      case 'long':
        // out and DOWN, not straight up: twelve pixels of vertical ear turned every
        // long-eared animal into the same rabbit
        limb(b, CX + s * 7, CX - 7, CX + s * 14, CX - 1, 3, 1.8, [lo, mid, hi], { edge: 'ink' });
        limb(b, CX + s * 8, CX - 6, CX + s * 12, CX - 2, 1.4, 1, [inner, inner, inner]);
        break;
      case 'tuft':
        for (let i = 0; i < 3; i++) {
          limb(b, CX + s * (5 + i), CX - 9, CX + s * (7 + i * 2), CX - 16 - i,
            1.6, 0.8, [lo, mid, hi], { edge: 'ink' });
        }
        break;
      case 'horn': {
        // A horn sweeps OUT and BACK and it has ridges. Curved gently inward and smooth,
        // a pale tapering shape at the top of a head is just an ear -- which is exactly
        // how the goat and the narwhal both came out wearing rabbit ears.
        const pts = [];
        for (let i = 0; i <= 9; i++) {
          const f = i / 9;
          pts.push({
            x: CX + s * (5 + f * 9),
            y: CX - 8 - f * 5 + f * f * 5,
            r: 3 - f * 2.4,
          });
        }
        chain(b, pts, ['sand', 'bone', 'white'], 'ink');
        // the ridges, which is what says horn rather than ear
        for (let i = 2; i <= 7; i += 2) {
          const p = pts[i];
          bset(b, p.x, p.y - p.r * 0.6, mix(P.sand, P.ink, 0.45));
          bset(b, p.x + s, p.y - p.r * 0.2, mix(P.sand, P.ink, 0.3));
        }
        break;
      }
      case 'antler': {
        const main = [];
        for (let i = 0; i <= 8; i++) {
          const f = i / 8;
          main.push({ x: CX + s * (5 + f * 7), y: CX - 8 - f * 10, r: 2.2 - f * 1.3 });
        }
        chain(b, main, ['wood1', 'wood3', 'sand'], 'ink');
        for (const k of [0, 1]) {
          const br = [];
          for (let i = 0; i <= 4; i++) {
            const f = i / 4;
            br.push({
              x: CX + s * (7 + k * 3 + f * 5),
              y: CX - 11 - k * 4 - f * 4,
              r: 1.5 - f * 0.8,
            });
          }
          chain(b, br, ['wood1', 'wood3', 'sand'], 'ink');
        }
        break;
      }
      case 'crest':
        // a comb of soft lobes. Five bars of alternating red was a paper crown.
        if (s < 0) {
          for (let i = 0; i < 4; i++) {
            const h = 3 - Math.abs(i - 1.5) * 1.2;
            orb(b, CX - 4 + i * 2.4, CX - r + 1 - h, 2 + h * 0.5,
              orbShade(['red0', 'red1', 'red2']), { edge: 'ink' });
          }
        }
        break;
      case 'fin':
        if (s < 0) {
          btri(b, CX - 4, CX - r + 3, CX + 4, CX - r + 3, CX, CX - r - 7, 'ink');
          btri(b, CX - 3, CX - r + 3, CX + 3, CX - r + 3, CX, CX - r - 5, mid);
          bline(b, CX, CX - r - 4, CX, CX - r + 3, hi);
        }
        break;
      case 'frill':
        for (let i = 0; i < 4; i++) {
          const a = -2.3 + i * 0.3;
          orb(b, CX + s * Math.abs(Math.cos(a) * (r + 2)), CX + Math.sin(a) * (r + 2), 2.6,
            orbShade([lo, mid, hi]), { edge: 'ink' });
        }
        break;
      default: break;
    }
  }
}

/**
 * The face: eyes, and one species feature. SMALL.
 *
 * The old muzzle covered the lower third of the ball and every animal looked like it was
 * wearing a mask. Two dot eyes six pixels apart with one pixel of catch light, a two
 * pixel nose, and a feature that pokes out of the silhouette.
 */
function ballFace(b, rc, C, mood) {
  const lo = C.shade, mid = C.body, hi = C.light;
  const ink = C.eye || 'ink';
  const style = rc.eyeStyle || 'dot';
  const blink = mood === 'blink';
  const happy = mood === 'happy';
  const scared = mood === 'scared';

  // --- the species feature, drawn BEFORE the eyes so nothing covers them
  switch (rc.face) {
    case 'muzzle':
      // no ink edge: a lighter region that blends into the ball, plus a nose. Outlined,
      // it became a little white face floating in the middle of the big one.
      blob(b, CX, EYE_Y + 4, 4, 2.4, orbShade([mix(P[C.belly], P[lo], 0.25), C.belly, 'white']));
      bset(b, CX - 1, EYE_Y + 3, ink);
      bset(b, CX, EYE_Y + 3, ink);
      bline(b, CX - 2, EYE_Y + 5, CX + 2, EYE_Y + 5, mix(P[lo], P.ink, 0.35));
      break;
    case 'snout':
      blob(b, CX, EYE_Y + 5, 4.5, 2.6, orbShade([mix(P.pink, P.ink, 0.3), 'pink', 'white']));
      bmir(b, CX, CX - 2, EYE_Y + 5, mix(P.pink, P.ink, 0.6));
      break;
    case 'beak':
      btri(b, CX - 3, EYE_Y + 3, CX + 3, EYE_Y + 3, CX, EYE_Y + 8, 'ink');
      btri(b, CX - 2, EYE_Y + 3, CX + 2, EYE_Y + 3, CX, EYE_Y + 7, 'amber');
      bline(b, CX - 1, EYE_Y + 5, CX + 1, EYE_Y + 5, mix(P.amber, P.ink, 0.45));
      bset(b, CX - 1, EYE_Y + 4, 'gold');
      break;
    case 'trunk': {
      // ONE tapering limb. Nine outlined beads down the middle of a face is a chain, and
      // every one of those contours cut the trunk into segments of black.
      limb(b, CX, EYE_Y + 3, CX + 2, EYE_Y + 13, 2.6, 1.2, [lo, mid, hi], { edge: 'ink' });
      for (let i = 0; i < 4; i++) {
        bset(b, CX - 1 + Math.round(i * 0.5), EYE_Y + 5 + i * 2, lo);
        bset(b, CX + 1 + Math.round(i * 0.5), EYE_Y + 5 + i * 2, lo);
      }
      break;
    }
    case 'tusk':
      blob(b, CX, EYE_Y + 5, 4, 2.6, orbShade([lo, mid, hi]));
      for (const s of [-1, 1]) {
        for (let i = 0; i < 5; i++) {
          orb(b, CX + s * (3 + i * 0.6), EYE_Y + 6 + i, 1.6 - i * 0.2,
            orbShade(['bone', 'white', 'white']), { edge: 'ink' });
        }
      }
      break;
    case 'whiskers':
      blob(b, CX, EYE_Y + 4, 3.4, 2.2, orbShade([mix(P[C.belly], P[lo], 0.25), C.belly, 'white']));
      bmir(b, CX, CX - 2, EYE_Y + 3, ink);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          bline(b, CX + s * 4, EYE_Y + 3 + i, CX + s * 13, EYE_Y + 1 + i * 3, 'white');
        }
      }
      break;
    case 'mandible':
      for (const s of [-1, 1]) {
        limb(b, CX + s * 3, EYE_Y + 4, CX + s * 8, EYE_Y + 9, 1.6, 0.9,
          [mix(P[lo], P.ink, 0.3), lo, mid], { edge: 'ink' });
      }
      break;
    case 'flat':
      bline(b, CX - 4, EYE_Y + 5, CX + 4, EYE_Y + 5, mix(P[lo], P.ink, 0.4));
      bmir(b, CX, CX - 3, EYE_Y + 3, ink);
      break;
    default: break;
  }

  // --- the eyes
  const drawEye = (s) => {
    const ex = CX + (s < 0 ? -EYE_DX - 1 : EYE_DX);
    if (blink) { brect(b, ex, EYE_Y + 1, 2, 1, ink); return; }
    if (happy) {
      bset(b, ex, EYE_Y + 1, ink);
      bset(b, ex + 1, EYE_Y, ink);
      bset(b, ex + (s < 0 ? 2 : -1), EYE_Y + 1, ink);
      return;
    }
    const tall = scared || style === 'wide' ? 3 : 2;
    brect(b, ex, EYE_Y, 2, tall, ink);
    bset(b, ex, EYE_Y, 'white');                       // catch light, always upper-left
    if (tall > 2) bset(b, ex + 1, EYE_Y + 2, mix(P.white, P.ink, 0.4));
    if (style === 'sleepy') { brect(b, ex - 1, EYE_Y - 1, 4, 1, lo); bset(b, ex, EYE_Y, ink); }
    if (style === 'angry') brect(b, ex - (s < 0 ? 1 : 0), EYE_Y - 2, 3, 1, mix(P[lo], P.ink, 0.5));
    if (style === 'sparkle') {
      bset(b, ex + (s < 0 ? -1 : 2), EYE_Y - 1, 'white');
      bset(b, ex + (s < 0 ? -2 : 3), EYE_Y, 'gold');
    }
    if (style === 'goggle') {
      for (let a = 0; a < 6.28; a += 0.5) {
        bset(b, ex + 0.5 + Math.cos(a) * 3, EYE_Y + 0.5 + Math.sin(a) * 3, mix(P[lo], P.ink, 0.3));
      }
    }
  };
  drawEye(-1); drawEye(1);

  // blush, and a mouth for the moods that want one
  for (const s of [-1, 1]) {
    bset(b, CX + s * (EYE_DX + 4), EYE_Y + 2, mix(P.pink, P[mid] || mid, 0.25));
  }
  if (happy && rc.face !== 'beak' && rc.face !== 'trunk') {
    bset(b, CX - 2, EYE_Y + 7, ink);
    brect(b, CX - 1, EYE_Y + 8, 2, 1, ink);
    bset(b, CX + 2, EYE_Y + 7, ink);
  }
  if (scared) brect(b, CX - 1, EYE_Y + 7, 3, 2, ink);
}

/* ------------------------------------------------------------------- baking */

const backCache = new Map();
const bodyCache = new Map();
const faceCache = new Map();
const iconCache = new Map();
const CACHE_CAP = 900;

function tintKey(o) {
  return o && o.tint ? `${o.tint}:${Math.round((o.tintAmt || 0.4) * 10)}` : '-';
}

function bakeLayer(w, h, paint, o = {}) {
  const mk = makeCanvas(w, h);
  if (!mk) return null;
  const buf = makeBuf(w, h);
  paint(buf);
  outline(buf, 'ink', o);
  flush(buf, mk.g);
  return mk.canvas;
}

function bakeBody(rc, phase, o) {
  const C = tones(rc, o);
  return bakeLayer(SPRITE_SIZE, SPRITE_SIZE, (buf) => ballBody(buf, rc, C, phase));
}

function bakeBack(rc, o) {
  if (!rc.extra || rc.extra === 'none') return null;
  const C = tones(rc, o);
  return bakeLayer(SPRITE_SIZE, SPRITE_SIZE, (buf) => backFeatures(buf, rc, C));
}

function bakeFace(rc, mood, o) {
  const C = tones(rc, o);
  return bakeLayer(SPRITE_SIZE, SPRITE_SIZE, (buf) => {
    ballEars(buf, rc, C);
    ballFace(buf, rc, C, mood);
  }, { outside: { cx: CX, cy: CX, r: BALL_R } });
}

/** One complete still, for tools and tests. */
export function bakeAnimal(recipe, opts = {}) {
  const rc = Object.assign({}, DEFAULT_RECIPE, recipe || {});
  const mk = makeCanvas(SPRITE_SIZE, SPRITE_SIZE);
  if (!mk) return null;
  const back = bakeBack(rc, opts), body = bakeBody(rc, 0, opts), fc = bakeFace(rc, 'idle', opts);
  if (back) mk.g.drawImage(back, 0, 0);
  if (body) mk.g.drawImage(body, 0, 0);
  if (fc) mk.g.drawImage(fc, 0, 0);
  return mk.canvas;
}

function recipeOf(animal) {
  return Object.assign({}, DEFAULT_RECIPE, (animal && animal.sprite) || {});
}

function cachedBack(animal, o) {
  const k = `${animal && animal.id}/${tintKey(o)}`;
  let hit = backCache.get(k);
  if (hit === undefined) {
    hit = bakeBack(recipeOf(animal), o);
    if (backCache.size > CACHE_CAP) backCache.clear();
    backCache.set(k, hit);
  }
  return hit;
}

function cachedBody(animal, phase, o) {
  const k = `${animal && animal.id}/${phase}/${tintKey(o)}`;
  let hit = bodyCache.get(k);
  if (hit === undefined) {
    hit = bakeBody(recipeOf(animal), phase, o);
    if (bodyCache.size > CACHE_CAP) bodyCache.clear();
    bodyCache.set(k, hit);
  }
  return hit;
}

function cachedFace(animal, mood, o) {
  const k = `${animal && animal.id}/${mood}/${tintKey(o)}`;
  let hit = faceCache.get(k);
  if (hit === undefined) {
    hit = bakeFace(recipeOf(animal), mood, o);
    if (faceCache.size > CACHE_CAP) faceCache.clear();
    faceCache.set(k, hit);
  }
  return hit;
}

export function getAnimalSprite(animal, o = {}) {
  return {
    back: cachedBack(animal, o),
    body: cachedBody(animal, 0, o),
    face: cachedFace(animal, o.mood || 'idle', o),
    size: SPRITE_SIZE,
  };
}

export function clearSpriteCache() {
  backCache.clear(); bodyCache.clear(); faceCache.clear(); iconCache.clear();
}
export function spriteCacheSize() {
  return backCache.size + bodyCache.size + faceCache.size + iconCache.size;
}

/* ------------------------------------------------------------------ drawing */

/**
 * drawAnimal(g, animal, sx, sy, opts)
 *   sx, sy   the CENTRE of the ball
 *   opts     { scale, roll, squash, mood, blink, flip, alpha, wet, rain, t }
 *
 * Three blits. `roll` picks the baked rotation, `squash` is applied area-preserving --
 * a flattening ball must also widen, or it reads as shrinking rather than as landing.
 */
export function drawAnimal(g, animal, sx, sy, opts = {}) {
  const sc = Math.max(1, Math.round(opts.scale || 1));
  const S = SPRITE_SIZE * sc;
  const phase = opts.roll !== undefined
    ? ((Math.round((opts.roll / (Math.PI * 2)) * PHASES) % PHASES) + PHASES) % PHASES
    : 0;
  const mood = opts.mood || (opts.blink ? 'blink' : 'idle');
  const back = cachedBack(animal, opts);
  const body = cachedBody(animal, phase, opts);
  const face = cachedFace(animal, mood, opts);
  if (!body && !face) return;

  const q = opts.squash ? Math.max(0, Math.min(0.5, opts.squash)) : 0;
  const dw = Math.round(S * (1 + q * 0.55));
  const dh = Math.round(S * (1 - q * 0.55));
  const dx = Math.round(sx - dw / 2);
  const dy = Math.round(sy - dh / 2 + (S - dh) / 2);

  const prevA = g.globalAlpha;
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  if (opts.flip) {
    g.save();
    g.translate(dx + dw, dy);
    g.scale(-1, 1);
    if (back) g.drawImage(back, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, dw, dh);
    if (body) g.drawImage(body, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, dw, dh);
    if (face) g.drawImage(face, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, dw, dh);
    g.restore();
  } else {
    if (back) g.drawImage(back, 0, 0, SPRITE_SIZE, SPRITE_SIZE, dx, dy, dw, dh);
    if (body) g.drawImage(body, 0, 0, SPRITE_SIZE, SPRITE_SIZE, dx, dy, dw, dh);
    if (face) g.drawImage(face, 0, 0, SPRITE_SIZE, SPRITE_SIZE, dx, dy, dw, dh);
  }
  g.globalAlpha = prevA;

  if (opts.wet) drawWet(g, sx, sy, sc, opts.wet, opts.t || 0);
  if (opts.rain) drawRainHit(g, sx, sy, sc, opts.rain, opts.t || 0);
}

/** A wet animal: a sheen along the top and one to three drips off the bottom. */
function drawWet(g, sx, sy, sc, amt, t) {
  const a = clamp(amt, 0, 1);
  const r = BALL_R * sc;
  for (let i = 0; i < 3; i++) {
    const ax = sx - r * 0.5 + i * r * 0.4;
    rect(g, ax, sy - r * 0.72 + i * sc, sc * 2, sc, 'foam');
  }
  const n = 1 + Math.round(a * 2);
  for (let i = 0; i < n; i++) {
    const seed = (sx * 3 + sy * 7 + i * 31) % 17;
    const k = ((t * (0.7 + i * 0.2) + seed * 0.13) % 1);
    const ox = ((seed % 5) - 2) * 3 * sc;
    rect(g, sx + ox, sy + r * 0.7 + k * r * 0.8, sc, sc * 2, 'water3');
    if (k > 0.85) {
      rect(g, sx + ox - sc * 2, sy + r * 1.5, sc, sc, 'foam');
      rect(g, sx + ox + sc * 2, sy + r * 1.5, sc, sc, 'foam');
    }
  }
}

/** Rain hitting an animal: a few bright ticks and a splash ring. */
function drawRainHit(g, sx, sy, sc, amt, t) {
  const n = Math.round(2 + clamp(amt, 0, 1) * 3);
  for (let i = 0; i < n; i++) {
    const seed = (i * 41 + Math.floor(t * 6)) % 23;
    const ox = ((seed % 7) - 3) * 3 * sc;
    const oy = ((seed % 5) - 2) * 3 * sc;
    rect(g, sx + ox, sy + oy, sc, sc, 'foam');
    if (seed % 3 === 0) rect(g, sx + ox, sy + oy - sc, sc, sc, 'white');
  }
}

/** The shadow an animal casts. Not part of the sprite: it belongs to the ground. */
export function drawAnimalShadow(g, sx, sy, sc, opts = {}) {
  const r = BALL_R * Math.max(1, sc);
  const a = opts.alpha !== undefined ? opts.alpha : 0.3;
  ellipse(g, Math.round(sx), Math.round(sy), Math.round(r * 0.9), Math.round(r * 0.3), 'ink');
  wash(g, sx - r, sy - 2, r * 2, 4, 'ink', a * 0.4);
}

/* -------------------------------------------------------------------- icons

A passport photo: the top half of the ball with the ears and the eyes, at whatever size
the caller wants. Used in lists where a 32px sprite is too big.
*/

export function bakeIcon(recipe, size = ICON_SIZE) {
  const rc = Object.assign({}, DEFAULT_RECIPE, recipe || {});
  const C = tones(rc, {});
  const mk = makeCanvas(size, size);
  if (!mk) return null;
  const buf = makeBuf(size, size);
  const c = size / 2;
  const r = size * 0.42;
  orb(buf, c, c + 1, r, orbShade(ramp(C), { bounce: 0.5 }));
  // one mark of the pattern, so a patterned animal is still recognisable at 16px
  if (rc.pattern && rc.pattern !== 'none') {
    blob(buf, c - r * 0.4, c - r * 0.2, r * 0.35, r * 0.28, C.pat);
  }
  // ears, in whatever the recipe says, simplified to a bump
  if (rc.ears && rc.ears !== 'none') {
    for (const s of [-1, 1]) {
      orb(buf, c + s * r * 0.7, c - r * 0.7, r * 0.3, orbShade([C.shade, C.body, C.light]),
        { edge: 'ink' });
    }
  }
  const ey = Math.round(c + 1);
  for (const s of [-1, 1]) {
    bset(buf, Math.round(c + s * 2.2 - (s < 0 ? 1 : 0)), ey, C.eye || 'ink');
    bset(buf, Math.round(c + s * 2.2 - (s < 0 ? 1 : 0)), ey + 1, C.eye || 'ink');
  }
  outline(buf, 'ink');
  flush(buf, mk.g);
  return { canvas: mk.canvas, cx: c, cy: c, size };
}

export function getAnimalIcon(animal, size = ICON_SIZE) {
  const k = `${animal && animal.id}/${size}`;
  let hit = iconCache.get(k);
  if (hit === undefined) {
    hit = bakeIcon(recipeOf(animal), size);
    if (iconCache.size > CACHE_CAP) iconCache.clear();
    iconCache.set(k, hit);
  }
  return hit;
}

export function drawAnimalIcon(g, animal, sx, sy, opts = {}) {
  const size = opts.size || ICON_SIZE;
  const ic = getAnimalIcon(animal, size);
  if (!ic || !ic.canvas) return;
  const sc = Math.max(1, Math.round(opts.scale || 1));
  const prev = g.globalAlpha;
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  g.drawImage(ic.canvas, 0, 0, size, size,
    Math.round(sx - ic.cx * sc), Math.round(sy - ic.cy * sc), size * sc, size * sc);
  g.globalAlpha = prev;
}

void col; void px; void bline; void bmir;

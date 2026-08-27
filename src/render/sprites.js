// THE ANIMALS. Every one of them is a ball, and that is the whole point.
//
// THIS ART IS RECOVERED, NOT NEW. It was replaced twice -- once by five side-on body plans
// with real proportions, once by a coarse four-pixel world those plans were re-cut for --
// and both replacements were better arguments than they were sprites. A horse in profile
// with a long neck and four legs of a length is more correct than a ball with ears. It is
// also, at this size, an odd dog. The ball won on the only test that matters: you can tell
// ninety of them apart, they are cute, and they ROLL -- which the game now needs, because
// the arena is a pool table again.
//
// WHY A BALL WORKS. A sphere reads at any size, it has one lighting model so a jungle and a
// snowfield look like the same game, it squashes when it lands, and it spins. Species live
// in the details that BREAK the circle -- ears, horns, a beak, a tail, a shell -- plus the
// pattern wrapped onto the surface and two dot eyes. Ninety animals, one silhouette, and
// the differences are all in the parts you notice first.
//
// AUTHORED AT FORTY-EIGHT, up from thirty-two. Everything below is written in the units the
// thirty-two-pixel version used and multiplied by U on the way out, so the drawing reads as
// the original and lands at one and a half times the detail: an ear is six pixels across
// instead of four, a horn has room for its ridges, and an eye can have a pupil AND a catch
// light instead of choosing. Nothing here is upscaled -- every shape is re-rasterised at the
// new size, which is the difference between higher resolution and a bigger picture.
//
// WHAT WENT WRONG THE FIRST TIME, because it is all still avoidable:
//
//   NO CONTOUR. The ball had no dark edge, so on grass it turned to mush. Everything goes
//   through render/pixbuf.js and gets a one-pixel ink outline computed after the last shape
//   is down -- and every attached part gets its own, so it does not dissolve into the body.
//
//   A STRAIGHT TERMINATOR. Five tones split along a diagonal is a ball cut in half. The
//   bands follow the surface, with a rim on the shadow side and a bounce below it.
//
//   PATTERNS THAT ATE THE ANIMAL. Mixing the pattern toward white on the lit side gave big
//   pale blobs; a cow was an amoeba. The pattern shades with the ball and never crosses
//   the face.
//
//   FACES TOO BIG. A muzzle covering the lower third is a snout, not a face. Small features,
//   lots of ball.
//
// THREE BAKES PER ANIMAL, each memoised, split by WHAT MOVES:
//
//     BACK[tint]         behind the ball: tail, wing, shell, quills, hump, mane
//     BODY[phase][tint]  the shaded sphere and its pattern, at 8 rotations
//     FACE[mood][tint]   ears, features, eyes -- everything that must stay upright
//
// Drawing is three blits. The body spins as the animal rolls; the face never does, because
// a cute face that rotates away from the camera stops being cute. Live pixels on top handle
// wet sheen, drips and rain.

import { P, mix } from '../core/palette.js';
import { makeCanvas, rect, ellipse, wash, clamp } from '../core/pixel.js';
import {
  makeBuf, bset, bget, bmir, brect, bline, btri, orb, blob, limb, orbShade, outline, flush,
} from './pixbuf.js';

export const SPRITE_SIZE = 48;
export const SPRITE_H = 48;               // square, but the callers ask for both
export const ICON_SIZE = 24;

const CX = 24;
const BALL_R = 20;
const PHASES = 8;

// THE UNIT. Every offset below is written in the thirty-two-pixel version's pixels and
// scaled through this, so the drawing reads the way it was designed and lands at the new
// resolution. Changing SPRITE_SIZE and BALL_R together re-cuts the whole roster.
const U = BALL_R / 13;
const u = (n) => n * U;
const ui = (n) => Math.round(n * U);

// THE EYES ARE THE CUTENESS and they were the one thing the thirty-two-pixel version could
// not afford. Two pixels wide, six apart, is a pair of beads on a big ball -- correct, and
// distant. At forty-eight there is room for FOUR wide and only three from the centre line,
// which is the whole difference between an animal looking at you and an animal looking past
// you. Everything else on this sprite is a species marker; these two are the character.
const EYE_Y = CX + ui(2);
const EYE_DX = ui(2);
const EYE_W = Math.max(3, ui(2.6));

export const PLANS = ['ball'];
export function planFor() { return 'ball'; }

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
 * MATERIAL, not tint.
 *
 * A blessed beast and a corrupted one have to read across the arena at a glance, and mixing
 * the animal's own colours toward clay does not do it: a pink pig blended into clay is a
 * salmon pig. The state REPLACES the material and keeps only the shape -- which is the whole
 * idea, because the shape is the animal and the material is what has happened to it.
 *
 * Corruption is a BRUISE and not a hole. Ink on night on purple is three tones of black: a
 * corrupted lion had a silhouette and nothing inside it, and being able to see WHICH animal
 * is rolling at you is the entire reason one sprite serves all three states.
 */
const MATERIALS = {
  clay: {
    deep: 'clay0', shade: 'clay1', body: 'clay2', light: 'clay4', belly: 'clay3',
    pat: 'clay0', eye: 'gold',
  },
  corrupt: {
    deep: 'ink', shade: 'purple0', body: 'purple1', light: 'pink', belly: 'night',
    pat: 'ink', eye: 'red2',
  },
};

/**
 * The full tone set for one animal.
 *
 * Five body tones from three recipe colours, because a roster written with three is not
 * going to be rewritten with five: `deep` and `hi` are derived, and derived tones are
 * consistent across ninety animals in a way hand-picked ones never are.
 */
function tones(rc, o = {}) {
  if (o.material && MATERIALS[o.material]) {
    const M = MATERIALS[o.material];
    return {
      deep: P[M.deep], shade: P[M.shade], body: P[M.body],
      light: P[M.light], hi: mix(P[M.light], P.white, 0.4), belly: P[M.belly],
      pat: mix(P[M.pat], P[M.body], 0.3), eye: M.eye,
    };
  }
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
  };
}

function ramp(C) { return [C.deep, C.shade, C.body, C.light, C.hi]; }

/* ---------------------------------------------------------------------- body */

/**
 * The shaded sphere, plus its pattern, plus a belly and a specular.
 *
 * `phase` spins the pattern; the shading never spins, because the light does not orbit the
 * animal when the animal rolls.
 */
function ballBody(b, rc, C, phase) {
  const r = BALL_R;
  orb(b, CX, CX, r, orbShade(ramp(C), { bounce: 0.55 }));

  // The belly is a BIB: an oval low and central, strong in the middle and fading at its
  // edge. As a wide fading crescent at a third strength it did nothing -- a penguin came out
  // uniformly dark -- and at full strength across the lower half it washed the shading out
  // and the ball went flat. An oval does both jobs.
  const by = u(5), brx = r * 0.62, bry = r * 0.52;
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

  // THE CONTACT ARC. One band of the deepest tone hugging the bottom of the ball, which is
  // the light the ground does NOT throw back. At thirty-two pixels there was no room for it
  // and the ball sat on its shadow; at forty-eight it is what makes it sit IN it.
  for (let a = 0.95; a < 2.2; a += 0.03) {
    const px2 = CX + Math.cos(a) * (r - 1), py2 = CX + Math.sin(a) * (r - 1);
    if (bget(b, px2, py2) === null) continue;
    bset(b, px2, py2, mix(P[C.deep] || C.deep, P.ink, 0.16));
  }

  // the specular: a small arc where the light hits, drawn last so nothing covers it
  const sx = CX - ui(5), sy = CX - ui(6);
  brect(b, sx, sy, EYE_W, Math.max(1, ui(1)), C.hi);
  bset(b, sx + 1, sy, mix(P[C.hi] || C.hi, P.white, 0.65));
  brect(b, sx - 1, sy + Math.max(1, ui(1)), EYE_W, Math.max(1, ui(1)), C.hi);
  bset(b, sx, sy + Math.max(1, ui(1)), mix(P[C.hi] || C.hi, P.white, 0.4));
}

/**
 * The pattern, wrapped onto the sphere and rotated by `spin`.
 *
 * Evaluated in spherical coordinates (u = longitude + spin, v = latitude) rather than in
 * screen space, so a stripe bends round the ball and a spot squashes toward the edge. That
 * one detail is the difference between a patterned sphere and a decal -- and because it is
 * angular it costs nothing to render at a higher resolution.
 */
function ballPattern(b, rc, C, spin, r) {
  const kind = rc.pattern || 'none';
  if (kind === 'none') return;
  // NEVER pure ink. A cow's patches drawn in the same colour as the outline and the
  // background made the ball look bitten -- one continuous black region over forty per cent
  // of a white animal reads as missing geometry, not as a marking. One step back toward the
  // body keeps it a marking.
  const pat = mix(P[C.pat] || C.pat, P[C.body] || C.body, 0.24);
  const faceHalf = u(6), faceLow = u(9);
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > (r - 1) * (r - 1)) continue;
      // KEEP OFF THE FACE. A patch across the eyes is not a marking, it is a blindfold.
      if (y > 0 && Math.abs(x) < faceHalf && y < faceLow) continue;
      const nx = x / r, ny = y / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      if (nz < 0.16) continue;
      const uu = Math.atan2(nx, nz) + spin;
      const v = Math.asin(Math.max(-1, Math.min(1, ny)));
      let on = false;
      // Frequencies are tuned so a marking is SEVERAL SMALL SHAPES, not one region. The
      // difference between "a spotted animal" and "half an animal in another colour" is
      // entirely in these numbers, and they are angular, so they hold at any size.
      switch (kind) {
        case 'stripes': on = Math.sin(uu * 5.5) > 0.58; break;
        case 'bands': on = Math.sin(v * 8 + 0.6) > 0.52; break;
        case 'spots': on = Math.sin(uu * 4.6) * Math.cos(v * 4.8) > 0.62; break;
        case 'patches': on = Math.sin(uu * 3.1 + 1.1) * Math.cos(v * 3.3) > 0.5; break;
        case 'freckles': on = Math.sin(uu * 11) * Math.cos(v * 10) > 0.72; break;
        case 'scales': on = Math.sin(uu * 9) + Math.cos(v * 10) > 1.35; break;
        case 'plates': on = Math.sin(v * 6.5) > 0.66; break;
        case 'wool': on = Math.sin(uu * 7.5) * Math.sin(v * 7) > 0.32; break;
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
    for (let a = 0; a < 360; a += 18) {
      const rad = (a * Math.PI) / 180;
      const wx = CX + Math.cos(rad) * (r - 1), wy = CX + Math.sin(rad) * (r - 1);
      if (wy > CX + u(2) && Math.abs(wx - CX) < u(7)) continue;      // not over the face
      orb(b, wx, wy, u(2.2), Math.sin(rad + spin) > 0 ? C.hi : C.light);
    }
  }
}

/* ------------------------------------------------------------------- features

Everything here has to CROSS the circle's edge -- that is the whole job. A detail that stays
inside the silhouette is decoration; a detail that breaks it is a species.
*/

/**
 * A chain of shaded beads with ONE contour round the whole thing.
 *
 * Drawing each bead with its own `edge` looked fine for a limb and was a disaster for
 * anything thin: at radius one, a bead with a one-pixel outline is almost entirely outline,
 * so every horn, antler and tail came out as a chain of black blobs. Two passes -- the whole
 * chain slightly fat in ink, then the whole chain in colour -- gives one clean edge and
 * keeps the beads bright.
 */
function chain(b, pts, rmp, edge) {
  if (edge) {
    for (const p of pts) {
      const r = p.r + 1;
      for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
        for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
          if (x * x + y * y > r * r) continue;
          bset(b, p.x + x, p.y + y, edge);
        }
      }
    }
  }
  const sh = orbShade(rmp);
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
      let x = CX + r - u(3), y = CX + u(4);
      for (let i = 0; i < 14; i++) {
        const f = i / 13;
        x += u(1.1);
        y -= Math.sin(f * 2.6) * u(1.5);
        pts.push({ x, y, r: u(2.2 - f * 0.9) });
      }
      chain(b, pts, [lo, mid, hi], 'ink');
      chain(b, [{ x: x + u(1), y: y - u(1), r: u(3) }], [lo, mid, hi], 'ink');
      break;
    }
    case 'wing': {
      // a FOLDED wing: one mass with three feather tips off the back of it. Four splayed
      // limbs a side read as talons, which is not what anybody wants on a chicken.
      for (const s of [-1, 1]) {
        blob(b, CX + s * (r - u(2)), CX + u(1), u(5), u(7), orbShade([lo, mid, hi]),
          { edge: 'ink' });
        for (let k = 0; k < 3; k++) {
          limb(b, CX + s * (r - u(1)), CX + u(4 + k),
            CX + s * (r + u(4 + k)), CX + u(8 + k * 2),
            u(1.6 - k * 0.2), u(0.9), [lo, mid, hi], { edge: 'ink' });
        }
      }
      break;
    }
    case 'plume': {
      for (let i = 0; i < 5; i++) {
        const a = -1.9 + i * 0.34;
        limb(b, CX + u(3), CX - r + u(4),
          CX + u(3) + Math.cos(a) * u(12), CX - r + u(4) + Math.sin(a) * u(12),
          u(1.6), u(0.9), [lo, mid, hi], { edge: 'ink' });
      }
      break;
    }
    case 'sail': {
      for (let i = 0; i < 11; i++) {
        const h = u(9) - Math.abs(i - 5) * u(1.4);
        brect(b, CX - u(8) + i * u(1.7), CX - r - Math.round(h), Math.max(2, ui(1.7)),
          Math.round(h) + u(3), i % 2 ? mid : lo);
      }
      break;
    }
    case 'flipper': {
      for (const s of [-1, 1]) {
        blob(b, CX + s * (r - u(1)), CX + u(5), u(4), u(2.4), orbShade([lo, mid, hi]),
          { edge: 'ink' });
      }
      break;
    }
    case 'shell': {
      // a dome BEHIND the ball, so the animal sits in it rather than wearing it
      blob(b, CX, CX - u(2), r + u(2), r - u(1),
        orbShade([mix(P[lo], P.ink, 0.3), lo, mid, hi]));
      // plates: rings AND radial seams, or a shell is just a darker ball behind a ball
      for (let i = 1; i <= 4; i++) {
        const rr = u(4) + i * u(2.8);
        for (let a = 3.25; a < 6.2; a += 0.06) {
          bset(b, CX + Math.cos(a) * rr, CX - u(2) + Math.sin(a) * rr * 0.82,
            mix(P[lo], P.ink, 0.45));
          bset(b, CX + Math.cos(a) * (rr - 1), CX - u(2) + Math.sin(a) * (rr - 1) * 0.82, hi);
        }
      }
      for (let k = 0; k < 5; k++) {
        const a = 3.3 + k * 0.66;
        for (let d = u(4); d < u(15); d++) {
          bset(b, CX + Math.cos(a) * d, CX - u(2) + Math.sin(a) * d * 0.82,
            mix(P[lo], P.ink, 0.4));
        }
      }
      break;
    }
    case 'quills': {
      for (let a = -2.5; a < -0.6; a += 0.1) {
        const len = u(7) + Math.sin(a * 3) * u(2);
        const pts = [];
        for (let i = 0; i <= 6; i++) {
          const f = i / 6;
          pts.push({
            x: CX + Math.cos(a) * (r - u(2) + f * (len + u(2))),
            y: CX + Math.sin(a) * (r - u(2) + f * (len + u(2))),
            r: u(1.5 - f * 0.9),
          });
        }
        chain(b, pts, [lo, mid, hi], 'ink');
      }
      break;
    }
    case 'hump': {
      blob(b, CX + u(1), CX - r + u(1), u(8), u(5), orbShade([lo, mid, hi]), { edge: 'ink' });
      break;
    }
    case 'mane': {
      // Overlapping locks with NO per-lock contour: eighteen little outlines round a ring
      // gave a wall of dark speckle that read as stones, not fur. The layer's own outline
      // pass draws the one edge that matters.
      for (let a = 0; a < 6.28; a += 0.2) {
        const wob = u(2.4) + Math.sin(a * 3) * u(1.3);
        orb(b, CX + Math.cos(a) * (r + u(1)), CX + Math.sin(a) * (r + u(1)), wob,
          orbShade([lo, mid, hi]));
      }
      // a few darker roots, so it has depth rather than being a doughnut
      for (let a = 0.13; a < 6.28; a += 0.42) {
        orb(b, CX + Math.cos(a) * (r - u(1)), CX + Math.sin(a) * (r - u(1)), u(1.6), lo);
      }
      break;
    }
    case 'gill': {
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          blob(b, CX + s * (r - u(2)), CX + u(1 + i * 3), u(3), u(1.2),
            i % 2 ? 'red2' : 'red1');
        }
      }
      break;
    }
    case 'antenna': {
      for (const s of [-1, 1]) {
        limb(b, CX + s * u(3), CX - r + u(3), CX + s * u(8), CX - r - u(6), u(1.1), u(0.8),
          [lo, mid, hi], { edge: 'ink' });
        orb(b, CX + s * u(8), CX - r - u(7), u(1.8), orbShade([lo, mid, hi]), { edge: 'ink' });
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
    const bx = CX + s * u(9), by = CX - u(8);
    switch (kind) {
      case 'round':
        orb(b, bx, by, u(3.6), orbShade([lo, mid, hi]), { edge: 'ink' });
        orb(b, bx, by + u(1), u(1.6), inner);
        break;
      case 'tiny':
        orb(b, CX + s * u(8), CX - u(9), u(2.6), orbShade([lo, mid, hi]), { edge: 'ink' });
        orb(b, CX + s * u(8), CX - u(9), u(1), inner);
        break;
      case 'pointy':
        btri(b, CX + s * u(4), CX - u(9), CX + s * u(11), CX - u(9),
          CX + s * u(8), CX - u(18), 'ink');
        btri(b, CX + s * u(5), CX - u(9), CX + s * u(10), CX - u(9),
          CX + s * u(8), CX - u(16), mid);
        btri(b, CX + s * u(6), CX - u(10), CX + s * u(9), CX - u(10),
          CX + s * u(8), CX - u(14), inner);
        break;
      case 'long':
        // out and DOWN, not straight up: twelve pixels of vertical ear turned every
        // long-eared animal into the same rabbit
        limb(b, CX + s * u(7), CX - u(7), CX + s * u(14), CX - u(1), u(3), u(1.8),
          [lo, mid, hi], { edge: 'ink' });
        limb(b, CX + s * u(8), CX - u(6), CX + s * u(12), CX - u(2), u(1.4), u(1),
          [inner, inner, inner]);
        break;
      case 'tuft':
        for (let i = 0; i < 3; i++) {
          limb(b, CX + s * u(5 + i), CX - u(9), CX + s * u(7 + i * 2), CX - u(16 + i),
            u(1.6), u(0.8), [lo, mid, hi], { edge: 'ink' });
        }
        break;
      case 'horn': {
        // A horn sweeps OUT and BACK and it has ridges. Curved gently inward and smooth, a
        // pale tapering shape at the top of a head is just an ear -- which is exactly how
        // the goat and the narwhal both came out wearing rabbit ears.
        const pts = [];
        for (let i = 0; i <= 11; i++) {
          const f = i / 11;
          pts.push({
            x: CX + s * u(5 + f * 9),
            y: CX - u(8) - f * u(5) + f * f * u(5),
            r: u(3 - f * 2.4),
          });
        }
        chain(b, pts, ['sand', 'bone', 'white'], 'ink');
        // the ridges, which is what says horn rather than ear
        for (let i = 2; i <= 9; i += 2) {
          const p = pts[i];
          bset(b, p.x, p.y - p.r * 0.6, mix(P.sand, P.ink, 0.45));
          bset(b, p.x + s, p.y - p.r * 0.2, mix(P.sand, P.ink, 0.3));
        }
        break;
      }
      case 'antler': {
        const main = [];
        for (let i = 0; i <= 10; i++) {
          const f = i / 10;
          main.push({ x: CX + s * u(5 + f * 7), y: CX - u(8) - f * u(10), r: u(2.2 - f * 1.3) });
        }
        chain(b, main, ['wood1', 'wood3', 'sand'], 'ink');
        for (const k of [0, 1]) {
          const br = [];
          for (let i = 0; i <= 5; i++) {
            const f = i / 5;
            br.push({
              x: CX + s * u(7 + k * 3 + f * 5),
              y: CX - u(11 + k * 4) - f * u(4),
              r: u(1.5 - f * 0.8),
            });
          }
          chain(b, br, ['wood1', 'wood3', 'sand'], 'ink');
        }
        break;
      }
      case 'crest':
        // a comb of soft lobes. Five bars of alternating red was a paper crown.
        if (s < 0) {
          for (let i = 0; i < 5; i++) {
            const h = u(3) - Math.abs(i - 2) * u(1.1);
            orb(b, CX - u(5) + i * u(2.4), CX - r + u(1) - h, u(2) + h * 0.5,
              orbShade(['red0', 'red1', 'red2']), { edge: 'ink' });
          }
        }
        break;
      case 'fin':
        if (s < 0) {
          btri(b, CX - u(4), CX - r + u(3), CX + u(4), CX - r + u(3), CX, CX - r - u(7), 'ink');
          btri(b, CX - u(3), CX - r + u(3), CX + u(3), CX - r + u(3), CX, CX - r - u(5), mid);
          bline(b, CX, CX - r - u(4), CX, CX - r + u(3), hi);
        }
        break;
      case 'frill':
        for (let i = 0; i < 5; i++) {
          const a = -2.3 + i * 0.26;
          orb(b, CX + s * Math.abs(Math.cos(a) * (r + u(2))), CX + Math.sin(a) * (r + u(2)),
            u(2.6), orbShade([lo, mid, hi]), { edge: 'ink' });
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
 * wearing a mask. Two dot eyes six pixels apart with one pixel of catch light, a two pixel
 * nose, and a feature that pokes out of the silhouette.
 */
function ballFace(b, rc, C, mood) {
  const lo = C.shade, mid = C.body, hi = C.light;
  const ink = C.eye || 'ink';
  const style = rc.eyeStyle || 'dot';
  const blink = mood === 'blink';
  const happy = mood === 'happy';
  const scared = mood === 'scared';
  const angry = mood === 'angry';

  // --- the species feature, drawn BEFORE the eyes so nothing covers them
  switch (rc.face) {
    case 'muzzle':
      // no ink edge: a lighter region that blends into the ball, plus a nose. Outlined, it
      // became a little white face floating in the middle of the big one.
      blob(b, CX, EYE_Y + u(4), u(4), u(2.4),
        orbShade([mix(P[C.belly], P[lo], 0.25), C.belly, 'white']));
      brect(b, CX - ui(1), EYE_Y + ui(3), EYE_W, Math.max(1, ui(1)), ink);
      bline(b, CX - u(2), EYE_Y + u(5), CX + u(2), EYE_Y + u(5), mix(P[lo], P.ink, 0.35));
      break;
    case 'snout':
      blob(b, CX, EYE_Y + u(5), u(4.5), u(2.6),
        orbShade([mix(P.pink, P.ink, 0.3), 'pink', 'white']));
      bmir(b, CX, CX - ui(2), EYE_Y + ui(5), mix(P.pink, P.ink, 0.6));
      break;
    case 'beak':
      btri(b, CX - u(3), EYE_Y + u(3), CX + u(3), EYE_Y + u(3), CX, EYE_Y + u(8), 'ink');
      btri(b, CX - u(2), EYE_Y + u(3), CX + u(2), EYE_Y + u(3), CX, EYE_Y + u(7), 'amber');
      bline(b, CX - u(1), EYE_Y + u(5), CX + u(1), EYE_Y + u(5), mix(P.amber, P.ink, 0.45));
      bset(b, CX - ui(1), EYE_Y + ui(4), 'gold');
      break;
    case 'trunk': {
      // ONE tapering limb. Nine outlined beads down the middle of a face is a chain, and
      // every one of those contours cut the trunk into segments of black.
      limb(b, CX, EYE_Y + u(3), CX + u(2), EYE_Y + u(13), u(2.6), u(1.2), [lo, mid, hi],
        { edge: 'ink' });
      for (let i = 0; i < 5; i++) {
        bset(b, CX - ui(1) + Math.round(i * 0.5), EYE_Y + ui(5 + i * 1.8), lo);
        bset(b, CX + ui(1) + Math.round(i * 0.5), EYE_Y + ui(5 + i * 1.8), lo);
      }
      break;
    }
    case 'tusk':
      blob(b, CX, EYE_Y + u(5), u(4), u(2.6), orbShade([lo, mid, hi]));
      for (const s of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          orb(b, CX + s * u(3 + i * 0.6), EYE_Y + u(6 + i), u(1.6 - i * 0.18),
            orbShade(['bone', 'white', 'white']), { edge: 'ink' });
        }
      }
      break;
    case 'whiskers':
      blob(b, CX, EYE_Y + u(4), u(3.4), u(2.2),
        orbShade([mix(P[C.belly], P[lo], 0.25), C.belly, 'white']));
      bmir(b, CX, CX - ui(2), EYE_Y + ui(3), ink);
      for (const s of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          bline(b, CX + s * u(4), EYE_Y + u(3 + i), CX + s * u(13), EYE_Y + u(1 + i * 3),
            'white');
        }
      }
      break;
    case 'mandible':
      for (const s of [-1, 1]) {
        limb(b, CX + s * u(3), EYE_Y + u(4), CX + s * u(8), EYE_Y + u(9), u(1.6), u(0.9),
          [mix(P[lo], P.ink, 0.3), lo, mid], { edge: 'ink' });
      }
      break;
    case 'flat':
      bline(b, CX - u(4), EYE_Y + u(5), CX + u(4), EYE_Y + u(5), mix(P[lo], P.ink, 0.4));
      bmir(b, CX, CX - ui(3), EYE_Y + ui(3), ink);
      break;
    default: break;
  }

  // --- the eyes. AT FORTY-EIGHT AN EYE CAN HAVE BOTH: a pupil that fills it and a catch
  // light in the corner. At thirty-two the catch light WAS a quarter of the eye and every
  // animal in the roster looked startled.
  const eh = ui(2);
  const drawEye = (s) => {
    const ex = CX + (s < 0 ? -EYE_DX - EYE_W : EYE_DX);
    if (blink) { brect(b, ex, EYE_Y + Math.floor(eh / 2), EYE_W, Math.max(1, ui(1)), ink); return; }
    if (happy) {
      // a closed happy eye is an arc, drawn as three steps
      brect(b, ex, EYE_Y + ui(1), EYE_W, Math.max(1, ui(1)), ink);
      brect(b, ex + (s < 0 ? -1 : EYE_W), EYE_Y + ui(2), Math.max(1, ui(1)),
        Math.max(1, ui(1)), ink);
      brect(b, ex + (s < 0 ? EYE_W : -1), EYE_Y + ui(2), Math.max(1, ui(1)),
        Math.max(1, ui(1)), ink);
      return;
    }
    const tall = (scared || style === 'wide') ? eh + ui(1) : eh;
    brect(b, ex, EYE_Y, EYE_W, tall, ink);
    // ONE PIXEL of catch light, and one of glass on the far side. At ui(1) the catch light
    // was two by two out of a three-by-three eye, so every animal in the roster had two pale
    // squares for eyes and looked boiled.
    bset(b, ex, EYE_Y, 'white');
    bset(b, ex + EYE_W - 1, EYE_Y + tall - 1, mix(P.white, P[ink] || ink, 0.55));
    if (style === 'sleepy') {
      brect(b, ex - 1, EYE_Y - ui(1), EYE_W + 2, Math.max(1, ui(1)), lo);
      brect(b, ex, EYE_Y, Math.max(1, ui(1)), Math.max(1, ui(1)), ink);
    }
    if (style === 'angry' || angry) {
      // ON the eye, not floating above it. Two pixels of clear skin between a brow and an
      // eye is not a scowl, it is a moustache in the wrong place -- which is what the lion
      // was wearing.
      brect(b, ex - (s < 0 ? 1 : 0), EYE_Y - Math.max(1, ui(1)), EYE_W + 1,
        Math.max(1, ui(1)), mix(P[lo], P.ink, 0.55));
    }
    if (style === 'sparkle') {
      bset(b, ex + (s < 0 ? -1 : EYE_W), EYE_Y - ui(1), 'white');
      bset(b, ex + (s < 0 ? -2 : EYE_W + 1), EYE_Y, 'gold');
    }
    if (style === 'goggle') {
      for (let a = 0; a < 6.28; a += 0.34) {
        bset(b, ex + EYE_W / 2 + Math.cos(a) * u(3), EYE_Y + eh / 2 + Math.sin(a) * u(3),
          mix(P[lo], P.ink, 0.3));
      }
    }
  };
  drawEye(-1); drawEye(1);

  // blush -- and it is FAINT. At full pink over three pixels by two it read as a rash.
  for (const s of [-1, 1]) {
    blob(b, CX + s * (EYE_DX + u(5)), EYE_Y + u(2.4), u(1.3), u(0.9),
      mix(P.pink, P[mid] || mid, 0.62));
  }
  if (happy && rc.face !== 'beak' && rc.face !== 'trunk') {
    bset(b, CX - ui(2), EYE_Y + ui(7), ink);
    brect(b, CX - ui(1), EYE_Y + ui(8), EYE_W, Math.max(1, ui(1)), ink);
    bset(b, CX + ui(2), EYE_Y + ui(7), ink);
  }
  if (scared) brect(b, CX - ui(1), EYE_Y + ui(7), ui(3), ui(2), ink);
}

/* ------------------------------------------------------------------- baking */

const backCache = new Map();
const bodyCache = new Map();
const faceCache = new Map();
const iconCache = new Map();
const CACHE_CAP = 900;

function tintKey(o) {
  if (o && o.material) return `m:${o.material}`;
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
  return Object.assign({}, DEFAULT_RECIPE, (animal && (animal.sprite || animal)) || {});
}

function fromCache(cache, key, make) {
  let hit = cache.get(key);
  if (hit === undefined) {
    hit = make();
    if (cache.size > CACHE_CAP) cache.clear();
    cache.set(key, hit);
  }
  return hit;
}

function cachedBack(animal, o) {
  return fromCache(backCache, `${animal && animal.id}/${tintKey(o)}`,
    () => bakeBack(recipeOf(animal), o));
}
function cachedBody(animal, phase, o) {
  return fromCache(bodyCache, `${animal && animal.id}/${phase}/${tintKey(o)}`,
    () => bakeBody(recipeOf(animal), phase, o));
}
function cachedFace(animal, mood, o) {
  return fromCache(faceCache, `${animal && animal.id}/${mood}/${tintKey(o)}`,
    () => bakeFace(recipeOf(animal), mood, o));
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

/** Which of the eight baked rotations. `roll` is radians; `walk` is a 0..1 cycle. */
export function walkPhase(opts = {}) {
  if (opts.roll !== undefined) {
    return ((Math.round((opts.roll / (Math.PI * 2)) * PHASES) % PHASES) + PHASES) % PHASES;
  }
  if (opts.step !== undefined) return ((opts.step % PHASES) + PHASES) % PHASES;
  if (opts.walk !== undefined) return Math.floor(((opts.walk % 1) + 1) % 1 * PHASES) % PHASES;
  return 0;
}

/* ------------------------------------------------------------------ drawing */

/**
 * drawAnimal(g, animal, sx, sy, opts)
 *   sx, sy   the point the animal STANDS ON -- the bottom of the ball, not its centre
 *   opts     { scale, roll, walk, step, squash, slump, mood, blink, flip, alpha,
 *              material, tint, wet, rain, blessed, t }
 *
 * THE ANCHOR IS THE GROUND, and that is worth one line of explanation because the ball's
 * own centre would be the natural choice. Every scene in this game hands a creature a spot
 * on a floor -- a tile, a berth, a ramp, a felt -- and if the anchor is the centre then
 * every one of those call sites has to add a radius, and the ones that forget bury the
 * animal to its eyes. The arena, which thinks in centres because it is running physics,
 * adds the radius once. Everything else gets it free.
 *
 * Three blits. `roll` picks the baked rotation, `squash` is applied area-preserving -- a
 * flattening ball must also widen, or it reads as shrinking rather than as landing.
 */
export function drawAnimal(g, animal, sx, sy, opts = {}) {
  const sc = opts.scale || 1;
  const S = SPRITE_SIZE * sc;
  const phase = walkPhase(opts);
  const mood = opts.mood || (opts.blink ? 'blink' : 'idle');
  const back = cachedBack(animal, opts);
  const body = cachedBody(animal, phase, opts);
  const face = cachedFace(animal, mood, opts);
  if (!body && !face) return;

  // squash and slump are the same gesture at two amplitudes: one is a bounce landing, the
  // other is an animal lying where it fell. Both preserve area, so neither reads as scaling.
  const q = clamp((opts.squash || 0) + (opts.slump || 0) * 0.62, 0, 0.62);
  const dw = Math.round(S * (1 + q * 0.55));
  const dh = Math.round(S * (1 - q * 0.55));
  const dx = Math.round(sx - dw / 2);
  const dy = Math.round(sy - dh);

  const prevA = g.globalAlpha;
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  const put = (c) => c && g.drawImage(c, 0, 0, SPRITE_SIZE, SPRITE_SIZE, 0, 0, dw, dh);
  g.save();
  if (opts.flip) { g.translate(dx + dw, dy); g.scale(-1, 1); } else { g.translate(dx, dy); }
  put(back); put(body); put(face);
  g.restore();
  g.globalAlpha = prevA;

  const cy = dy + dh / 2;
  if (opts.blessed) drawBlessed(g, sx, cy, sc, opts.t || 0);
  if (opts.wet) drawWet(g, sx, cy, sc, opts.wet, opts.t || 0);
  if (opts.rain) drawRainHit(g, sx, cy, sc, opts.rain, opts.t || 0);
}

/** The clay glow on a blessed beast: four motes on a slow orbit. */
function drawBlessed(g, sx, sy, sc, t) {
  const r = BALL_R * sc;
  for (let i = 0; i < 4; i++) {
    const a = t * 1.1 + (i / 4) * Math.PI * 2;
    const rr = r * (1.05 + Math.sin(t * 2 + i) * 0.06);
    rect(g, sx + Math.cos(a) * rr - 2, sy + Math.sin(a) * rr * 0.55 - 2, 4, 4,
      i % 2 ? 'gold' : 'brass3');
  }
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
export function drawAnimalShadow(g, sx, sy, sc = 1, opts = {}) {
  const r = BALL_R * sc;
  const a = opts.alpha !== undefined ? opts.alpha : 0.3;
  // A CONTACT SHADOW, NOT A HOLE. At 0.86 of the radius in flat ink it was a black disc as
  // wide as the animal, and on sand the animal read as a balloon tied to a puddle.
  ellipse(g, Math.round(sx), Math.round(sy), Math.round(r * 0.62), Math.round(r * 0.2),
    mix(P.ink, P.shadow, 0.35));
  wash(g, sx - r * 0.9, sy - 3, r * 1.8, 6, 'ink', a * 0.5);
}

export { BALL_R };

/* -------------------------------------------------------------------- icons

A passport photo: the top half of the ball with the ears and the eyes, at whatever size the
caller wants. Used in lists where a full sprite is too big.
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
  // one mark of the pattern, so a patterned animal is still recognisable small
  if (rc.pattern && rc.pattern !== 'none') {
    blob(buf, c - r * 0.4, c - r * 0.2, r * 0.35, r * 0.28, C.pat);
  }
  // ears, in whatever the recipe says, simplified to a bump
  if (rc.ears && rc.ears !== 'none') {
    for (const s of [-1, 1]) {
      orb(buf, c + s * r * 0.7, c - r * 0.7, r * 0.32, orbShade([C.shade, C.body, C.light]),
        { edge: 'ink' });
    }
  }
  const ey = Math.round(c + r * 0.18);
  const ew = Math.max(1, Math.round(size / 12));
  for (const s of [-1, 1]) {
    brect(buf, Math.round(c + s * r * 0.34 - (s < 0 ? ew : 0)), ey, ew, ew * 2,
      C.eye || 'ink');
  }
  outline(buf, 'ink');
  flush(buf, mk.g);
  return { canvas: mk.canvas, cx: c, cy: c, size };
}

export function getAnimalIcon(animal, size = ICON_SIZE) {
  return fromCache(iconCache, `${animal && animal.id}/${size}`,
    () => bakeIcon(recipeOf(animal), size));
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

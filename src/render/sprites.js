// THE ANIMALS. Real bodies, in profile, at twice the resolution.
//
// WHAT THIS REPLACED, and why it had to go. Every animal used to be a ball with ears: one
// silhouette, ninety species, and the differences carried entirely by two dot eyes and a
// tail. It was cute and it read instantly, and after a while every island looked like the
// same six marbles. You could not tell a horse from a bear because there was nothing about
// a horse in it -- no legs to be long, no neck to be long, no barrel to be deep.
//
// So: BODY PLANS. Five of them, chosen off the animal's own tags, and each one built out of
// parts with real proportions -- a barrel, a neck at an angle, four legs of a length, a
// head of a size. A giraffe is a long neck steeply up. A dachshund is a long barrel on
// short legs. A raven is a round body on two thin legs with a wing folded over it. None of
// that is hand-drawn per animal; it all comes out of numbers derived from mass, size and
// tags, which is the only way ninety of them stay consistent.
//
// AND IN PROFILE. A front-facing animal at this size cannot show a body at all -- you get a
// face and two feet, which is why the ball worked and why nothing else did. Side-on, the
// silhouette IS the species, which is the whole point.
//
// RESOLUTION. Authored at 32x32 and blitted at 2x, so a sprite is 64 screen pixels with
// two-pixel lines: twice the detail of the old ball, same line weight as the rest of the
// game. Draw at scale 0.5 for a list or a manifest and you get the art at 1:1, which is
// exact rather than resampled.
//
// FOUR BAKES PER ANIMAL, split by what moves:
//
//     BACK[tint]         behind the body: far legs, far wing, tail
//     BODY[phase][tint]  barrel, near legs, neck, pattern -- four walk frames
//     HEAD[mood][tint]   head, ear, eye, snout: everything that must stay upright
//     GLOW[tint]         the blessed-clay overlay, when an animal has been tamed
//
// Drawing is three or four blits. Live pixels on top handle wet sheen, drips and rain.

import { P, mix } from '../core/palette.js';
import { makeCanvas, rect, ellipse, clamp } from '../core/pixel.js';
import {
  makeBuf, bset, bget, brect, bline, btri, blob, outline, flush,
} from './pixbuf.js';

export const SPRITE_SIZE = 80;            // the sprite's WIDTH on screen at scale 1
export const SPRITE_H = 88;               // and its height: 40x44 art at 2x
export const ICON_SIZE = 24;

// THE BUFFER IS TALLER THAN IT IS WIDE, and that is not an aesthetic choice. At 32x32
// the giraffe's head sat six rows ABOVE the top of the buffer and a lion's mane came out
// as a brown box clipped by two edges: an animal drawn to the top of its box has nowhere
// to put the antlers, ears, horns and manes that are most of how you tell one species
// from another. Eleven rows of headroom is what a set of antlers costs.
// THE BUFFER IS WIDER THAN THE ANIMAL, TOO. At 32 wide a big animal's barrel left five
// pixels in front of its shoulder for the whole head, and an elephant's trunk was drawn
// at x=33: off the edge, so the trunk simply did not exist. Forty gives the head, the
// muzzle and whatever hangs off it somewhere to be.
const AW = 40;                            // art width ...
const AH = 44;                            // ... and height, blitted at 2x
const S = 2;
const GROUND = 41;                        // the row the feet stand on
const PHASES = 4;

export const PLANS = ['quad', 'bird', 'serpent', 'fish', 'bug'];

export const DEFAULT_RECIPE = {
  body: 'grey1', shade: 'grey0', light: 'grey2', belly: 'bone',
  eye: 'ink', eyeStyle: 'dot', ears: 'round', face: 'muzzle',
  pattern: 'none', patternColor: 'ink', extra: 'none',
};

/* ---------------------------------------------------------------- the plan

Which body an animal gets, and the numbers that shape it. Read in order, most specific tag
first, exactly like abilities and materials are -- so a new animal is shaped sensibly the
moment its tags are right, and nothing rots when a tag changes.
*/

// `reptile` deliberately does NOT map to serpent: a chameleon and a sea turtle have four
// legs, and giving them a snake's body made three of the four serpents in the roster wrong.
// Only an actual snake is a serpent, and those are named.
const PLAN_TAGS = [
  ['fish', 'fish'],
  ['insect', 'bug'],
  ['bird', 'bird'], ['flying', 'bird'],
];

const PLAN_OVERRIDE = {
  snake: 'serpent', cobra: 'serpent', viper: 'serpent', python: 'serpent',
  rattlesnake: 'serpent', adder: 'serpent', serpent: 'serpent',
  eel: 'fish', whale: 'fish', dolphin: 'fish', shark: 'fish', kraken: 'fish',
  seal: 'fish', walrus: 'fish', octopus: 'fish', jellyfish: 'fish',
  narwhal: 'fish', clownfish: 'fish', axolotl: 'fish',
  chameleon: 'quad', seaturtle: 'quad', platypus: 'quad', treefrog: 'quad',
  turtle: 'quad', tortoise: 'quad', crocodile: 'quad', lizard: 'quad',
  penguin: 'bird', ostrich: 'bird', dove: 'bird', raven: 'bird',
  bee: 'bug', locust: 'bug', beetle: 'bug', ant: 'bug', spider: 'bug', scarab: 'bug',
};

export function planFor(a) {
  if (!a) return 'quad';
  if (PLAN_OVERRIDE[a.id]) return PLAN_OVERRIDE[a.id];
  const tags = a.tags || [];
  for (const [tag, plan] of PLAN_TAGS) if (tags.includes(tag)) return plan;
  return 'quad';
}

/**
 * The proportions.
 *
 * `mass` and `size` come off the roster and do most of the work; the tags bend it. The
 * ranges are deliberately WIDE -- a giraffe and a dachshund have to come out of the same
 * six numbers or the plan is not doing anything.
 */
export function specFor(a, rc) {
  const tags = (a && a.tags) || [];
  const has = (t) => tags.includes(t);
  const size = clamp((a && a.size) || 1, 0.55, 1.7);
  const mass = clamp((a && a.mass) || 1, 0.4, 1.8);
  const plan = planFor(a);

  // legs: the single most expressive number. A wading bird and a badger are the same
  // animal until you get this right.
  let legLen = 5 + (size - 0.8) * 7;
  if (has('tall') || has('majestic')) legLen += 2;
  if (has('digging') || has('tiny') || has('small')) legLen -= 2.5;
  if (has('fast')) legLen += 1.5;
  if (has('armored')) legLen -= 1;
  legLen = clamp(legLen, 2, 12);

  // the barrel
  let bodyLen = 11 + size * 4 + mass * 2;
  if (has('digging') || has('mustelid') || has('rodent')) bodyLen += 3;
  if (has('cat') || has('primate')) bodyLen -= 1;
  bodyLen = clamp(bodyLen, 10, 21);
  let bodyHigh = 4 + mass * 3.4;
  if (has('big') || has('pachyderm') || has('bovine')) bodyHigh += 1.4;
  if (has('tiny') || has('small')) bodyHigh -= 1.4;
  bodyHigh = clamp(bodyHigh, 3.5, 10);

  // the neck, as a length and an angle. Straight up is a giraffe, flat forward is a pig.
  let neckLen = 2 + size * 2.2;
  let neckUp = 0.5;
  if (has('majestic')) { neckLen += 2; neckUp += 0.15; }
  if (has('bovine') || has('equine')) { neckLen += 1.5; neckUp += 0.1; }
  if (has('digging') || has('armored')) { neckLen -= 1.5; neckUp -= 0.28; }
  if (has('bird')) { neckLen += 1; neckUp += 0.2; }
  if (a && (a.id === 'giraffe' || a.id === 'swan' || a.id === 'ostrich')) { neckLen = 12; neckUp = 0.92; }
  neckLen = clamp(neckLen, 1, 13);
  neckUp = clamp(neckUp, 0.05, 0.95);

  // A HEAD THIS SIZE IS A BLOB. At radius six the skull, the neck and the barrel come out
  // as one continuous mass and the animal has no outline anywhere -- and a head that big on
  // a horse is a cartoon. Four is a head.
  let headR = 2.2 + size * 1.2;
  if (has('smart') || has('primate') || has('cute')) headR += 0.5;
  if (has('tiny')) headR -= 0.8;
  headR = clamp(headR, 2.2, 5);

  // A BIRD IS NOT A SHORT QUADRUPED. Left on the generic numbers a raven came out with an
  // eighteen-pixel barrel and read as an odd dog: the body has to be compact and DEEP, and
  // the neck short unless the animal is a wader.
  if (plan === 'bird') {
    bodyLen = clamp(bodyLen * 0.6, 8, 14);
    bodyHigh = clamp(bodyHigh * 1.25, 5.5, 11);
    if (!(has('tall') || has('majestic'))) { neckLen = clamp(neckLen * 0.65, 2, 5); }
    neckUp = clamp(neckUp + 0.15, 0.3, 0.95);
    headR = clamp(headR * 0.82, 2, 4);
  }
  if (plan === 'bug') {
    bodyLen = clamp(bodyLen * 0.62, 8, 14);
    bodyHigh = clamp(bodyHigh * 0.8, 3, 7);
    legLen = clamp(legLen, 3, 7);
  }

  return {
    plan, legLen: Math.round(legLen), bodyLen: Math.round(bodyLen),
    bodyHigh: Math.round(bodyHigh), neckLen: Math.round(neckLen), neckUp,
    headR: Math.round(headR),
    legs: plan === 'bug' ? 6 : plan === 'bird' ? 2 : plan === 'quad' ? 4 : 0,
    heavy: has('big') || has('armored') || has('pachyderm'),
    pachyderm: has('pachyderm'),
    ears: rc.ears || 'round', face: rc.face || 'muzzle',
    extra: rc.extra || 'none', pattern: rc.pattern || 'none',
    eyeStyle: rc.eyeStyle || 'dot',
  };
}

/* ------------------------------------------------------------------- colours */

function tinted(key, tint, amt) {
  return tint ? mix(P[key] || key, P[tint] || tint, amt) : (P[key] || key);
}

/**
 * MATERIAL, not tint.
 *
 * A blessed beast and a corrupted one have to be readable across the field at a glance, and
 * mixing the animal's own colours toward clay does not do it: a pink pig blended 60% into
 * clay is a salmon pig, and a brown wolf blended into the dark is a brown wolf. The state
 * REPLACES the material and keeps only the shape -- which is the whole idea, because the
 * shape is the animal's identity and the material is what has happened to it.
 *
 * The eye stays bright and stays different: gold in a clay beast, red in a corrupted one.
 * It is the one pixel that says whose side this is on.
 */
const MATERIALS = {
  clay: {
    deep: 'clay0', shade: 'clay1', body: 'clay2', light: 'clay4', belly: 'clay3',
    pat: 'clay0', eye: 'gold',
  },
  corrupt: {
    deep: 'ink', shade: 'night', body: 'purple0', light: 'purple1', belly: 'deep',
    pat: 'ink', eye: 'red2',
  },
};

function tones(rc, o = {}) {
  if (o.material && MATERIALS[o.material]) {
    const M = MATERIALS[o.material];
    return {
      deep: P[M.deep], shade: P[M.shade], body: P[M.body],
      light: P[M.light], belly: P[M.belly],
      pat: mix(P[M.pat], P[M.body], 0.3), eye: M.eye,
    };
  }
  const t = o.tint, amt = o.tintAmt || 0.4;
  const body = tinted(rc.body || 'grey1', t, amt);
  const shade = tinted(rc.shade || 'grey0', t, amt);
  const light = tinted(rc.light || 'grey2', t, amt);
  return {
    deep: mix(shade, P.ink, 0.35),
    shade,
    body,
    light: mix(light, P.white, 0.1),
    belly: tinted(rc.belly || 'bone', t, amt * 0.6),
    // a marking pulled toward the body stays a marking; at full strength it is a hole
    pat: mix(tinted(rc.patternColor || 'ink', t, amt * 0.5), body, 0.28),
    eye: rc.eye || 'ink',
  };
}

/**
 * Three tones off a fake normal.
 *
 * Three and not five, for the same reason everywhere else in this codebase: the band edges
 * of a generic five-band sphere shader land wherever they like on a shape this size, and
 * one of the places they land is straight down the middle of a face.
 */
function lit(C) {
  return (nx, ny) => {
    const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
    const lam = nx * -0.42 + ny * -0.72 + nz * 0.55;
    return lam > 0.5 ? C.light : lam > -0.32 ? C.body : C.shade;
  };
}

/* --------------------------------------------------------------------- parts

Everything is built out of four primitives: a barrel, a tapering limb, a wedge and a disc.
Each takes its own `edge` colour, drawn one pixel bigger underneath, because the outline
pass at the end can only find the OUTSIDE of a figure -- a near leg laid over a barrel of
the same material simply vanishes without one.
*/

/** A barrel: an ellipse with a belly, which is the animal's whole mass. */
function barrel(b, x0, y0, x1, y1, C, o = {}) {
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  const sh = lit(C);
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const ty = (y - cy) / ry;
    if (ty * ty > 1) continue;
    const w = rx * Math.sqrt(1 - ty * ty);
    for (let x = Math.floor(cx - w); x <= Math.ceil(cx + w); x++) {
      const tx = (x - cx) / rx;
      if (tx * tx + ty * ty > 1) continue;
      bset(b, x, y, sh(tx, ty));
    }
  }
  // the belly: the bottom row or two only, and narrower than the barrel. Any more and it
  // is a light stripe across the middle of the animal rather than an underside.
  if (o.belly !== false) {
    for (let y = Math.round(cy + ry * 0.62); y <= Math.ceil(y1); y++) {
      const ty = (y - cy) / ry;
      if (ty * ty > 1) continue;
      const w = rx * Math.sqrt(1 - ty * ty) * 0.7;
      for (let x = Math.round(cx - w); x <= Math.round(cx + w); x++) {
        if (bget(b, x, y) === null) continue;
        bset(b, x, y, C.belly);
      }
    }
  }
}

/** A tapering limb, with its own edge. Legs, necks, tails, trunks. */
function limb(b, x0, y0, x1, y1, r0, r1, C, o = {}) {
  const n = Math.max(3, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  const edge = o.edge || C.deep;
  const near = o.near !== false;
  // `noEdge` matters for far legs. The edge pass grows a limb by a pixel each side, so four
  // legs across an eighteen-pixel barrel with edges on all of them is a solid skirt.
  const passes = o.noEdge ? 1 : 2;
  for (let pass = 2 - passes; pass < 2; pass++) {
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const cx = x0 + (x1 - x0) * f, cy = y0 + (y1 - y0) * f;
      const r = (r0 + (r1 - r0) * f) + (pass === 0 ? 0.9 : 0);
      for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
        for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
          if (x * x + y * y > r * r) continue;
          // near legs are lit like the BARREL's lower half, or the body reads as a
          // saddle blanket laid over a separate set of legs
          bset(b, cx + x, cy + y, pass === 0 ? edge
            : x < 0 ? (near ? C.light : C.body) : (near ? C.body : C.shade));
        }
      }
    }
  }
}

/** A shaded disc — heads, joints, berries. */
function disc(b, cx, cy, r, C, o = {}) {
  const sh = lit(C);
  if (o.edge) {
    for (let y = -r - 1; y <= r + 1; y++) {
      for (let x = -r - 1; x <= r + 1; x++) {
        if (x * x + y * y > (r + 1) * (r + 1)) continue;
        bset(b, cx + x, cy + y, o.edge);
      }
    }
  }
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y > r * r) continue;
      bset(b, cx + x, cy + y, sh(x / r, y / r));
    }
  }
}

/** A wedge — ears, fins, beaks, horns. */
function wedge(b, x0, y0, x1, y1, x2, y2, key, edge) {
  if (edge) {
    btri(b, x0 - 1, y0, x1, y1 - 1, x2 + 1, y2 + 1, edge);
    btri(b, x0, y0 + 1, x1 + 1, y1, x2, y2 + 1, edge);
  }
  btri(b, x0, y0, x1, y1, x2, y2, key);
}

/** A hoof or a paw: two rows, dark, wider than the leg. */
function foot(b, x, y, w, C) {
  brect(b, x - (w >> 1), y, w, 2, C.deep);
  brect(b, x - (w >> 1), y, w, 1, C.shade);
}

/* --------------------------------------------------------------- the geometry

One function works out where everything is, and the layer painters all read from it. That
matters: the head layer has to land exactly on the neck the body layer drew, and the far
legs have to come out of the same hips as the near ones.
*/

function frame(sp) {
  if (sp.plan === 'fish') {
    // a fish has no legs and no neck: its "head" is the front third of its own body, so
    // the head layer is told to put the eye there rather than on a disc of its own
    const cy = GROUND - 14, high = sp.bodyHigh + 2;
    const back = 4, front = back + sp.bodyLen + 3;
    return {
      back, front, bodyTop: cy - high / 2, bodyBottom: cy + high / 2,
      nx: front, ny: cy, headCx: front - 4, headCy: cy - 1, legLen: 0, noSkull: true,
    };
  }
  const legLen = sp.legLen;
  const bodyBottom = GROUND - legLen;
  void 0;
  const bodyTop = bodyBottom - sp.bodyHigh;
  const back = Math.round((AW - sp.bodyLen) / 2) - 1;
  const front = back + sp.bodyLen;
  const nx = front - 1;
  const ny = bodyTop + 1;
  const up = sp.neckUp;
  if (sp.plan === 'bug') {
    // a bug has no neck: the head is a small disc off the front of the thorax
    return {
      back, front, bodyTop, bodyBottom, nx: front, ny: (bodyTop + bodyBottom) / 2,
      headCx: front + 1, headCy: Math.round((bodyTop + bodyBottom) / 2) - 1, legLen,
    };
  }
  const headCx = Math.round(nx + Math.cos(up * Math.PI / 2) * sp.neckLen);
  const headCy = Math.round(ny - Math.sin(up * Math.PI / 2) * sp.neckLen);
  return { back, front, bodyTop, bodyBottom, nx, ny, headCx, headCy, legLen };
}

// A walk is four frames. The two pairs of legs are 180 degrees out of phase, the body rides
// up when a leg is under it and drops when one is swinging, and that bob is the entire
// difference between walking and sliding.
const BOB = [0, -1, 0, 0];
const SWING = [[3, -3], [0, 0], [-3, 3], [0, 0]];

/* ------------------------------------------------------------------ the plans */

/**
 * One leg.
 *
 * FOUR PIXELS APART, MINIMUM. The first cut put the near and far leg of each pair two
 * pixels apart and two and a half pixels thick, so all four merged into one solid skirt --
 * every animal was standing on a pedestal. The near/far split has to be wide enough that
 * you can see daylight between them, and the far leg has to be a tone darker or the eye
 * reads the pair as one thick leg anyway.
 */
function leg(b, f, sp, C, x, swing, near, lift) {
  const hipY = f.bodyBottom - 1;
  const footY = GROUND - lift;
  limb(b, x, hipY, x + swing, footY - 1, near ? 1.0 : 0.7, near ? 0.8 : 0.6, C,
    { near, noEdge: !near });
  foot(b, x + swing, footY - 1, near ? (sp.heavy ? 3 : 2) : 2, C);
}

/** QUAD: the barrel, four legs, a neck. Forty-eight of the roster is this. */
function quadBody(b, sp, C, phase, far) {
  const f = frame(sp);
  const sw = SWING[phase % PHASES];
  const bob = BOB[phase % PHASES];
  // four x positions, evenly spread across the barrel, so all four legs are visible
  const nf = f.front - 3, ff = f.front - 7, nr = f.back + 3, fr = f.back + 7;
  if (far) {
    leg(b, f, sp, C, ff, sw[1], false, sw[1] > 0 ? 1 : 0);
    leg(b, f, sp, C, fr, sw[0], false, sw[0] > 0 ? 1 : 0);
    tailOf(b, f, sp, C, phase);
    return;
  }
  barrel(b, f.back, f.bodyTop + bob, f.front, f.bodyBottom + bob, C);
  leg(b, f, sp, C, nf, sw[0], true, sw[0] > 0 ? 1 : 0);
  leg(b, f, sp, C, nr, sw[1], true, sw[1] > 0 ? 1 : 0);
  // the neck: THINNER than the barrel at the shoulder. Matched to it, the neck, the skull
  // and the body are one shape with no edge anywhere between them.
  limb(b, f.nx, f.ny + bob, f.headCx, f.headCy + bob,
    Math.max(1.2, sp.bodyHigh * 0.21), Math.max(1, sp.headR * 0.34), C, { near: true });
  patternOn(b, f, sp, C, bob);
}

/** BIRD: a round body low over two thin legs, with a wing folded onto it. */
function birdBody(b, sp, C, phase, far) {
  const f = frame(sp);
  const sw = SWING[phase % PHASES];
  const bob = BOB[phase % PHASES];
  if (far) {
    limb(b, f.back + 5, f.bodyBottom - 1, f.back + 5 + sw[1], GROUND - 1, 0.8, 0.6, C,
      { near: false, noEdge: true });
    foot(b, f.back + 5 + sw[1], GROUND - 1, 2, C);
    // ONE tail wedge. Three tapering limbs in a fan merged into a slab that read as a
    // second wing pointing the wrong way.
    const ty = (f.bodyTop + f.bodyBottom) / 2;
    wedge(b, f.back + 3, ty - 2, f.back - 7, ty - 5, f.back - 5, ty + 3, C.shade, C.deep);
    bline(b, f.back + 1, ty - 2, f.back - 6, ty - 3, C.deep);
    bline(b, f.back + 1, ty + 1, f.back - 5, ty + 1, C.deep);
    return;
  }
  barrel(b, f.back + 1, f.bodyTop + bob, f.front, f.bodyBottom + bob, C);
  limb(b, f.back + 7, f.bodyBottom - 1 + bob, f.back + 7 + sw[0], GROUND - 1, 1.1, 0.9, C, { near: true });
  foot(b, f.back + 7 + sw[0], GROUND - 1, 3, C);
  limb(b, f.nx - 1, f.ny + 1 + bob, f.headCx, f.headCy + bob,
    Math.max(1.4, sp.bodyHigh * 0.26), Math.max(1.2, sp.headR * 0.4), C, { near: true });
  // the folded wing: a shaded wedge with two covert lines, which is what makes it a wing
  const wx = f.back + 4, wy = f.bodyTop + bob + 3;
  wedge(b, wx, wy, wx + sp.bodyLen * 0.6, wy + 1, wx + 2, wy + sp.bodyHigh * 0.6, C.shade, C.deep);
  bline(b, wx + 1, wy + 2, wx + sp.bodyLen * 0.5, wy + 2, C.deep);
  bline(b, wx + 2, wy + 4, wx + sp.bodyLen * 0.42, wy + 4, C.deep);
  patternOn(b, f, sp, C, bob);
}

/** SERPENT: no legs at all. The silhouette is one long S and that is the animal. */
function serpentBody(b, sp, C, phase, far) {
  if (far) return;
  const ph = (phase % PHASES) * (Math.PI / 2);
  const y0 = GROUND - 3;
  const len = 26;
  for (let i = 0; i <= len; i++) {
    const t = i / len;
    const x = 3 + i;
    const y = Math.round(y0 - Math.sin(t * 5 + ph) * 2.6 - t * (sp.bodyHigh + 4));
    const r = 0.9 + (1 - t) * (sp.bodyHigh * 0.32);
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx * dx + dy * dy > r * r + 0.5) continue;
        bset(b, x + dx, y + dy, dy < -r * 0.2 ? C.light : dy < r * 0.4 ? C.body : C.shade);
      }
    }
    if (i % 4 === 0) bset(b, x, y - Math.round(r), C.belly);
  }
  // the coil the front rises out of
  barrel(b, 2, GROUND - 5, 12, GROUND - 1, C, { belly: false });
}

/** FISH: a teardrop with fins, floating. Whales, seals, octopus, anything that swims. */
function fishBody(b, sp, C, phase, far) {
  const cy = 15;
  const back = 4, front = back + sp.bodyLen + 3;
  const high = sp.bodyHigh + 2;
  const wag = [0, 2, 0, -2][phase % PHASES];
  if (far) {
    // the far pectoral, and the tail
    wedge(b, back + 4, cy + 3, back - 1, cy + 7, back + 7, cy + 5, C.shade, C.deep);
    wedge(b, back + 1, cy, back - 6, cy - 5 + wag, back - 6, cy + 5 + wag, C.shade, C.deep);
    return;
  }
  barrel(b, back, cy - high / 2, front, cy + high / 2, C, { belly: true });
  // dorsal
  wedge(b, back + 5, cy - high / 2, back + 9, cy - high / 2 - 4, back + 12, cy - high / 2 + 1,
    C.shade, C.deep);
  // near pectoral
  wedge(b, back + 8, cy + 1, back + 5, cy + 6, back + 12, cy + 3, C.shade, C.deep);
  // gill line
  bline(b, front - 6, cy - 2, front - 7, cy + 2, C.deep);
  patternOn(b, { back, front, bodyTop: cy - high / 2, bodyBottom: cy + high / 2 }, sp, C, 0);
}

/** BUG: a two-part body, six legs, antennae. */
function bugBody(b, sp, C, phase, far) {
  const f = frame(sp);
  const sw = SWING[phase % PHASES];
  const cy = (f.bodyTop + f.bodyBottom) / 2;
  if (far) {
    for (let i = 0; i < 3; i++) {
      const x = f.back + 3 + i * 4;
      limb(b, x, cy + 1, x - 3 + sw[i % 2], GROUND - 1, 0.9, 0.7, C, { near: false });
    }
    return;
  }
  // thorax and abdomen, two masses with a waist
  barrel(b, f.back, f.bodyTop, f.back + sp.bodyLen * 0.55, f.bodyBottom, C, { belly: false });
  barrel(b, f.back + sp.bodyLen * 0.5, f.bodyTop + 1, f.front, f.bodyBottom - 1, C);
  for (let i = 0; i < 3; i++) {
    const x = f.back + 4 + i * 4;
    limb(b, x, cy + 1, x + 2 + sw[(i + 1) % 2], GROUND - 1, 0.9, 0.6, C, { near: true });
    foot(b, x + 2 + sw[(i + 1) % 2], GROUND - 1, 2, C);
  }
  // a head at the front, and the waist between thorax and abdomen picked out, or the two
  // masses read as one lump
  disc(b, f.front + 1, cy - 1, Math.max(2, sp.headR - 1), C, { edge: C.deep });
  bline(b, Math.round(f.back + sp.bodyLen * 0.5), f.bodyTop + 1,
    Math.round(f.back + sp.bodyLen * 0.5), f.bodyBottom - 1, C.deep);
  patternOn(b, f, sp, C, 0);
}

/* ----------------------------------------------------------------- decoration */

function tailOf(b, f, sp, C, phase) {
  const swish = [0, 1, 0, -1][phase % PHASES];
  const k = sp.extra;
  const bx = f.back + 1, by = f.bodyTop + 2;
  if (k === 'tail') {
    limb(b, bx, by + 1, bx - 6, by - 2 + swish, 1.1, 0.6, C, { near: false });
    disc(b, bx - 7, by - 3 + swish, 2, C, { edge: C.deep });
  } else if (k === 'plume') {
    for (let i = -1; i <= 1; i++) {
      limb(b, bx, by, bx - 5, by - 6 + i * 3 + swish, 1.2, 0.6, C, { near: false });
    }
  } else if (k === 'mane') {
    // A MANE IS A RING ROUND THE SKULL. It used to be six strands laid up the neck, which
    // at this size is a scarf: a lion reads because its head is twice as wide as its
    // muzzle, and the only way to say that in eight pixels is a collar of dark fur drawn
    // BEFORE the head lands on top of it.
    const M = Object.assign({}, C, { body: C.shade, light: C.body, belly: C.shade });
    const rr = sp.headR + 1.8;
    // the collar, from the top of the head round the BACK to the chest. The front is left
    // open on purpose: a full ring buries the muzzle and the animal loses its face.
    for (let i = 0; i <= 12; i++) {
      const a = -Math.PI * 0.42 + (i / 12) * Math.PI * 1.32;
      disc(b, f.headCx - Math.cos(a) * rr, f.headCy - Math.sin(a) * rr, i % 2 ? 2.2 : 1.8, M,
        { edge: C.deep });
    }
    // and a bib, where the mane meets the chest
    for (let i = 0; i < 3; i++) disc(b, f.nx - 1 + i, f.ny + 2 + i * 1.5, 2.1, M, { edge: C.deep });
  } else if (k === 'shell') {
    barrel(b, f.back - 1, f.bodyTop - 3, f.front - 2, f.bodyBottom - 2, C, { belly: false });
    for (let i = 0; i < 4; i++) bline(b, f.back + 2 + i * 3, f.bodyTop - 2, f.back + 1 + i * 3, f.bodyBottom - 3, C.deep);
  } else if (k === 'quills') {
    for (let i = 0; i < 7; i++) {
      const x = f.back + 2 + i * 2;
      limb(b, x, f.bodyTop + 1, x - 3, f.bodyTop - 5, 0.9, 0.5, C, { near: false });
    }
  } else if (k === 'hump') {
    barrel(b, f.back + 3, f.bodyTop - 4, f.front - 4, f.bodyTop + 2, C, { belly: false });
  } else if (k === 'wing' || k === 'wings2') {
    wedge(b, f.back + 4, f.bodyTop + 1, f.back - 3, f.bodyTop - 6, f.back + 9, f.bodyTop + 3,
      C.shade, C.deep);
  } else if (k === 'flipper') {
    wedge(b, f.back + 5, f.bodyBottom - 1, f.back + 1, f.bodyBottom + 3, f.back + 9, f.bodyBottom,
      C.shade, C.deep);
  } else if (k === 'sail') {
    wedge(b, f.back + 3, f.bodyTop, f.back + 7, f.bodyTop - 7, f.front - 3, f.bodyTop,
      C.shade, C.deep);
  } else if (k === 'gill') {
    for (let i = 0; i < 3; i++) bline(b, f.front - 5 + i, f.bodyTop + 2, f.front - 6 + i, f.bodyBottom - 2, C.deep);
  } else if (k === 'antenna') {
    bline(b, f.headCx, f.headCy - 2, f.headCx + 5, f.headCy - 8, C.deep);
    bline(b, f.headCx, f.headCy - 2, f.headCx + 1, f.headCy - 9, C.deep);
    bset(b, f.headCx + 5, f.headCy - 8, C.light);
    bset(b, f.headCx + 1, f.headCy - 9, C.light);
  }
}

/** Markings, on the barrel only, and never many. */
function patternOn(b, f, sp, C, bob) {
  const k = sp.pattern;
  if (k === 'none') return;
  const x0 = Math.round(f.back + 2), x1 = Math.round(f.front - 3);
  const y0 = Math.round(f.bodyTop + bob + 1), y1 = Math.round(f.bodyBottom + bob - 2);
  const put = (x, y) => { if (bget(b, x, y) !== null) bset(b, x, y, C.pat); };
  const blk = (x, y, w, h) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j); };
  if (k === 'bands' || k === 'stripes') {
    for (let x = x0; x <= x1; x += 4) for (let y = y0; y <= y1; y++) put(x, y);
  } else if (k === 'spots') {
    for (let i = 0; i < 4; i++) blk(x0 + 1 + i * 4, y0 + ((i % 2) ? 1 : 3), 2, 2);
  } else if (k === 'patches') {
    blk(x0 + 1, y0, 5, 4); blk(x1 - 5, y1 - 3, 5, 3);
  } else if (k === 'freckles') {
    for (let i = 0; i < 6; i++) put(x0 + 2 + i * 3, y0 + (i % 3));
  } else if (k === 'plates') {
    for (let x = x0; x <= x1; x += 3) for (let y = y0; y <= y0 + 1; y++) put(x, y);
  } else if (k === 'scales') {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x + y) % 3 === 0) put(x, y);
  } else if (k === 'wool') {
    for (let x = x0; x <= x1; x += 3) { put(x, y0); put(x + 1, y0 + 1); }
  } else if (k === 'runes') {
    for (let i = 0; i < 3; i++) blk(x0 + 2 + i * 5, y0 + 1, 1, 3);
  }
}

/* -------------------------------------------------------------------- the head

Its own layer, because it is the only part that must never distort. The barrel bobs, the
legs swing, the tail swishes; the head is the animal's face and a face that shears with the
gait stops being a face.
*/

function headLayer(b, sp, C, mood) {
  const f = frame(sp);
  const cx = f.headCx, cy = f.headCy, r = sp.headR;
  const facing = 1;                       // always drawn facing right; drawAnimal flips

  // the skull -- unless the plan says the head IS the body's front, which is what a fish
  // is. A disc stuck on the nose of a whale reads as a bubble it is about to swallow.
  // An elephant's ear is the biggest thing on its head and half the reason you know what
  // you are looking at -- so it goes on FIRST, behind the skull, like a plate.
  if (!f.noSkull && sp.pachyderm && sp.ears === 'round') {
    blob(b, cx - r * 0.7, cy + 1, r * 1.05, r * 1.3, C.shade, { edge: C.deep });
    blob(b, cx - r * 0.9, cy + 1, r * 0.7, r * 0.95, mix(C.shade, C.deep, 0.4));
  }
  if (!f.noSkull) {
    disc(b, cx, cy, r, C, { edge: C.deep });
    blob(b, cx - r * 0.4, cy + r * 0.3, r * 0.7, r * 0.55, C.body);   // a cheek
    // A JAW. A skull drawn as one disc is a ball on a stick whatever you put in front of
    // it; the line from the ear down to the chin is what makes a head a head.
    blob(b, cx + r * 0.15, cy + r * 0.62, r * 0.66, r * 0.34, mix(C.shade, C.body, 0.5));
    bline(b, cx - r * 0.5, cy + r * 0.9, cx + r * 0.8, cy + r * 0.95, C.deep);
  }

  // --- the muzzle or beak, forward of the skull
  const mx = cx + Math.round(r * (f.noSkull ? 0.5 : 0.85)) * facing;
  const my = cy + Math.round(r * 0.35);
  const snout = mix(C.belly, C.body, 0.25);
  const k = sp.face;
  if (k === 'beak') {
    wedge(b, mx - 1, my - 2, mx + Math.round(r * 1.1), my, mx - 1, my + 2, 'brass2', 'brass0');
    bline(b, mx - 1, my, mx + Math.round(r * 0.9), my, 'brass0');
  } else if (k === 'trunk') {
    // A trunk is not a post. Three tapering segments curving forward and down, a curl at
    // the tip, and a pair of tusks either side of it -- without those it read as a cannon
    // bolted to the front of a grey dog.
    let tx = mx, ty = my;
    const drop = GROUND - 3 - my;
    for (let i = 1; i <= 7; i++) {
      const u = i / 7;
      const nx2 = mx + Math.round(Math.sin(u * 2.1) * 3.5);
      const ny2 = my + Math.round(drop * u);
      limb(b, tx, ty, nx2, ny2, 2.0 - u * 1.0, 1.9 - u * 1.0, C, { near: true });
      tx = nx2; ty = ny2;
    }
    bset(b, tx + 1, ty, C.body); bset(b, tx + 2, ty - 1, C.shade);
    for (const sgn of [-1, 1]) {
      limb(b, mx + 1, my + 2, mx + Math.round(r * 0.9), my + 4 + sgn, 1.0, 0.5,
        { body: 'white', shade: 'bone', deep: 'grey1', light: 'white' }, { near: sgn > 0 });
    }
  } else if (k === 'snout' || k === 'muzzle' || k === 'whiskers') {
    blob(b, mx, my, r * 0.62, r * 0.44, snout);
    bset(b, mx + Math.round(r * 0.5), my - 1, C.deep);          // the nostril
    if (k === 'whiskers') {
      for (let i = -1; i <= 1; i++) bline(b, mx, my + 1, mx + r + 2, my + 1 + i * 2, C.deep);
    }
  } else if (k === 'tusk') {
    blob(b, mx, my, r * 0.6, r * 0.42, snout);
    limb(b, mx, my + 1, mx + r, my + r * 0.9, 1.1, 0.5, { body: 'white', shade: 'bone', deep: 'grey1' }, { near: true });
  } else if (k === 'mandible') {
    blob(b, mx, my, r * 0.5, r * 0.4, snout);
    for (const s of [-1, 1]) bline(b, mx + 1, my + s, mx + r + 1, my + s * 2, C.deep);
  } else {
    blob(b, mx - 1, my, r * 0.45, r * 0.35, snout);
  }

  // --- the mouth
  const mo = mood === 'happy' ? 'happy' : mood === 'scared' ? 'scared' : 'idle';
  if (mo === 'happy') { bline(b, mx - 1, my + 2, mx + 2, my + 3, C.deep); }
  else if (mo === 'scared') { brect(b, mx, my + 2, 2, 2, C.deep); }
  else bline(b, mx - 1, my + 2, mx + 1, my + 2, C.deep);

  // --- ears and horns, on top of the skull and behind the eye
  if (!f.noSkull) earsOf(b, cx, cy, r, sp, C);

  // --- THE EYE. One eye, because this is a profile. Two art pixels across with a catch
  // light, which at 2x is a four-pixel highlight -- big enough to carry an expression and
  // small enough to still be a dot.
  const ex = cx + Math.round(r * 0.42), ey = cy - Math.round(r * 0.18);
  if (mood === 'blink') {
    brect(b, ex, ey + 1, 2, 1, C.deep);
  } else {
    brect(b, ex, ey, 2, 2, C.eye);
    bset(b, ex, ey, mix(P.white, P[C.eye] || C.eye, 0.2));
    const st = sp.eyeStyle;
    if (st === 'angry') bline(b, ex - 1, ey - 2, ex + 2, ey - 1, C.deep);
    if (st === 'sleepy') bline(b, ex - 1, ey - 1, ex + 2, ey - 1, C.deep);
    if (st === 'sparkle') bset(b, ex + 1, ey + 1, 'white');
    if (st === 'wide') { bset(b, ex - 1, ey, C.eye); bset(b, ex - 1, ey + 1, C.eye); }
    if (st === 'goggle') { bset(b, ex + 2, ey, 'ice'); bset(b, ex - 1, ey + 1, 'ice'); }
  }
  if (mood === 'happy') bset(b, cx - 1, cy + Math.round(r * 0.5), mix(P.red1, C.body, 0.55));
}

function earsOf(b, cx, cy, r, sp, C) {
  const k = sp.ears;
  const bx = cx - Math.round(r * 0.35);
  const by = cy - Math.round(r * 0.8);
  const in_ = mix(C.belly, P.red1, 0.3);
  if (k === 'round' && sp.pachyderm) {
    // drawn in headLayer BEFORE the skull -- see fanEar. Nothing to do here, or the ear
    // lands on top of the face and the animal has no eye.
  } else if (k === 'round') { disc(b, bx, by - 1, Math.max(2, Math.round(r * 0.42)), C, { edge: C.deep }); bset(b, bx, by - 1, in_); }
  else if (k === 'tiny') { brect(b, bx, by, 2, 2, C.shade); }
  else if (k === 'pointy') { wedge(b, bx - 1, by + 1, bx + 1, by - 4, bx + 2, by + 1, C.body, C.deep); bset(b, bx, by - 1, in_); }
  else if (k === 'long') { limb(b, bx, by + 1, bx - 2, by - 7, 1.4, 1, C, { near: true }); bset(b, bx - 1, by - 4, in_); }
  else if (k === 'tuft') { for (let i = -1; i <= 1; i++) limb(b, bx + i, by, bx + i * 2, by - 4, 0.9, 0.5, C, { near: false }); }
  else if (k === 'horn') { limb(b, bx + 1, by, bx + r + 1, by - 5, 1.3, 0.6, { body: C.belly, shade: C.belly, deep: C.deep }, { near: true }); }
  else if (k === 'antler') {
    limb(b, bx, by, bx + 2, by - 7, 1.2, 0.6, { body: C.belly, shade: C.belly, deep: C.deep }, { near: true });
    limb(b, bx + 1, by - 4, bx + 5, by - 6, 0.9, 0.5, { body: C.belly, shade: C.belly, deep: C.deep }, { near: true });
    limb(b, bx + 1, by - 6, bx - 2, by - 9, 0.9, 0.5, { body: C.belly, shade: C.belly, deep: C.deep }, { near: true });
  } else if (k === 'crest') {
    for (let i = 0; i < 3; i++) wedge(b, cx - 1 + i, by, cx + i, by - 4, cx + 1 + i, by, mix(C.shade, P.red2, 0.5), C.deep);
  } else if (k === 'fin') {
    wedge(b, cx - 2, by + 1, cx + 1, by - 5, cx + 3, by + 1, C.shade, C.deep);
  } else if (k === 'frill') {
    for (let i = -1; i <= 1; i++) bset(b, cx - r - 1, cy + i * 2, C.shade);
  } else if (k === 'spike') {
    for (let i = 0; i < 3; i++) limb(b, cx - 2 + i * 2, by, cx - 3 + i * 3, by - 6, 0.9, 0.4, C, { near: false });
  }
}

/* --------------------------------------------------------------------- bakes */

const backCache = new Map();
const bodyCache = new Map();
const headCache = new Map();
const iconCache = new Map();
const CACHE_CAP = 1200;

const PLANS_FN = {
  quad: quadBody, bird: birdBody, serpent: serpentBody, fish: fishBody, bug: bugBody,
};

function tintKey(o) {
  if (o && o.material) return 'm:' + o.material;
  return (o && o.tint) ? o.tint + ':' + (o.tintAmt || 0.4) : '';
}

function bakeLayer(paint, o = {}) {
  const b = makeBuf(AW, AH);
  paint(b);
  if (!o.noOutline) outline(b, 'ink', o.outline || {});
  const c = makeCanvas(SPRITE_SIZE, SPRITE_H);
  if (!c) return null;
  flush(b, c.g, 0, 0, S);
  return c.canvas;
}

function bakeBack(a, rc, o) {
  const sp = specFor(a, rc), C = tones(rc, o);
  const fn = PLANS_FN[sp.plan] || quadBody;
  return bakeLayer((b) => fn(b, sp, C, 0, true));
}

function bakeBody(a, rc, phase, o) {
  const sp = specFor(a, rc), C = tones(rc, o);
  const fn = PLANS_FN[sp.plan] || quadBody;
  return bakeLayer((b) => fn(b, sp, C, phase, false));
}

function bakeHead(a, rc, mood, o) {
  const sp = specFor(a, rc), C = tones(rc, o);
  if (sp.plan === 'serpent') {
    // the serpent's head rides at the top of its own S, not on a neck
    return bakeLayer((b) => {
      const spp = Object.assign({}, sp, { neckLen: 0 });
      headLayer(b, spp, C, mood);
    }, { outline: { } });
  }
  return bakeLayer((b) => headLayer(b, sp, C, mood));
}

function fromCache(cache, key, make) {
  let v = cache.get(key);
  if (v === undefined) {
    v = make();
    if (cache.size > CACHE_CAP) cache.clear();
    cache.set(key, v);
  }
  return v;
}

function recipeOf(a) { return Object.assign({}, DEFAULT_RECIPE, (a && (a.sprite || a)) || {}); }

function cachedBack(a, o) {
  return fromCache(backCache, `${(a && a.id) || 'x'}|${tintKey(o)}`, () => bakeBack(a, recipeOf(a), o));
}
function cachedBody(a, phase, o) {
  return fromCache(bodyCache, `${(a && a.id) || 'x'}|${phase}|${tintKey(o)}`,
    () => bakeBody(a, recipeOf(a), phase, o));
}
function cachedHead(a, mood, o) {
  return fromCache(headCache, `${(a && a.id) || 'x'}|${mood}|${tintKey(o)}`,
    () => bakeHead(a, recipeOf(a), mood, o));
}

export function bakeAnimal(recipe, opts = {}) {
  const a = { id: opts.id || 'anon', tags: opts.tags || [], sprite: recipe, size: 1, mass: 1 };
  return { back: cachedBack(a, opts), body: cachedBody(a, 0, opts), head: cachedHead(a, 'idle', opts) };
}

export function getAnimalSprite(a, o = {}) {
  return {
    back: cachedBack(a, o), body: cachedBody(a, 0, o),
    head: cachedHead(a, o.mood || 'idle', o), size: SPRITE_SIZE,
  };
}

export function clearSpriteCache() {
  backCache.clear(); bodyCache.clear(); headCache.clear(); iconCache.clear();
}
export function spriteCacheSize() {
  return backCache.size + bodyCache.size + headCache.size + iconCache.size;
}

/* ------------------------------------------------------------------ drawing */

/** Which of the four walk frames. `step` is explicit, `walk` is a 0..1 cycle. */
export function walkPhase(opts) {
  if (opts.step !== undefined) return ((opts.step | 0) % PHASES + PHASES) % PHASES;
  if (opts.walk !== undefined) return Math.floor((((opts.walk % 1) + 1) % 1) * PHASES) % PHASES;
  if (opts.roll !== undefined) {
    return ((Math.round((opts.roll / (Math.PI * 2)) * PHASES) % PHASES) + PHASES) % PHASES;
  }
  return 0;
}

/**
 * drawAnimal(g, animal, sx, sy, opts)
 *   sx, sy   the animal's FEET, centred
 *   opts     { scale, walk, step, mood, blink, flip, alpha, wet, rain, blessed, t }
 *
 * `scale` may be 0.5, which draws the art at 1:1 -- exact, not resampled -- for a manifest
 * or a list. 1 is the field size, 2 is a portrait.
 */
export function drawAnimal(g, animal, sx, sy, opts = {}) {
  const sc = opts.scale || 1;
  const SZ = Math.round(SPRITE_SIZE * sc);
  const SZH = Math.round(SPRITE_H * sc);
  const phase = walkPhase(opts);
  const mood = opts.mood || (opts.blink ? 'blink' : 'idle');
  const back = cachedBack(animal, opts);
  const body = cachedBody(animal, phase, opts);
  const head = cachedHead(animal, mood, opts);
  if (!body && !head) return;

  const dx = Math.round(sx - SZ / 2);
  // the art's ground row is GROUND of AH, so anchor the FEET rather than the box
  const dy = Math.round(sy - (SZH * (GROUND + 1)) / AH);

  const prevA = g.globalAlpha;
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  g.save();
  if (opts.flip) { g.translate(dx + SZ, dy); g.scale(-1, 1); } else { g.translate(dx, dy); }
  const put = (c) => c && g.drawImage(c, 0, 0, SPRITE_SIZE, SPRITE_H, 0, 0, SZ, SZH);
  put(back); put(body); put(head);
  g.restore();
  g.globalAlpha = prevA;

  if (opts.blessed) drawBlessed(g, sx, sy, sc, opts.t || 0);
  if (opts.wet) drawWet(g, sx, sy, sc, opts.wet, opts.t || 0);
  if (opts.rain) drawRainHit(g, sx, sy, sc, opts.rain, opts.t || 0);
}

/** A tamed animal, veined with clay and lit from inside. */
function drawBlessed(g, sx, sy, sc, t) {
  const r = 22 * sc;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + t * 0.8;
    const rr = r * (0.5 + 0.35 * Math.sin(t * 2 + i));
    rect(g, sx + Math.cos(a) * rr - 1, sy - r * 0.7 + Math.sin(a) * rr * 0.5 - 1,
      2 * sc, 2 * sc, i % 2 ? 'gold' : 'clay4');
  }
}

/** A wet animal: a sheen along the back and drips off the belly. */
function drawWet(g, sx, sy, sc, amt, t) {
  const a = clamp(amt, 0, 1);
  const r = 22 * sc;
  for (let i = 0; i < 3; i++) rect(g, sx - r * 0.4 + i * r * 0.35, sy - r * 1.1 + i * sc, 3 * sc, 2 * sc, 'foam');
  const n = 1 + Math.round(a * 2);
  for (let i = 0; i < n; i++) {
    const seed = (sx * 3 + sy * 7 + i * 31) % 17;
    const k = ((t * (0.7 + i * 0.2) + seed * 0.13) % 1);
    const ox = ((seed % 5) - 2) * 4 * sc;
    rect(g, sx + ox, sy - r * 0.35 + k * r * 0.4, 2 * sc, 3 * sc, 'water3');
    if (k > 0.85) rect(g, sx + ox - 2 * sc, sy - 2, 5 * sc, 2 * sc, 'foam');
  }
}

function drawRainHit(g, sx, sy, sc, amt, t) {
  const n = Math.round(2 + clamp(amt, 0, 1) * 3);
  const r = 22 * sc;
  for (let i = 0; i < n; i++) {
    const seed = (sx * 5 + sy * 3 + i * 47) % 23;
    const k = ((t * 2.2 + seed * 0.09) % 1);
    const ox = ((seed % 7) - 3) * 3 * sc;
    rect(g, sx + ox, sy - r * 1.4 + k * r * 1.5, 2 * sc, 4 * sc, 'ice');
    if (k > 0.9) rect(g, sx + ox - sc, sy - 2, 4 * sc, 2 * sc, 'foam');
  }
}

/** The contact shadow. An animal without one is a sticker. */
export function drawAnimalShadow(g, sx, sy, sc = 1, opts = {}) {
  const r = 20 * sc;
  const k = opts.lift ? clamp(1 - opts.lift, 0.35, 1) : 1;
  ellipse(g, sx, sy - 1, r * 0.75 * k, r * 0.22 * k, opts.color || 'shadow');
}

/* -------------------------------------------------------------------- icons */

/**
 * The icon IS the art buffer at 1:1, cropped to the animal's own box.
 *
 * That is the point of authoring at half the display size: a list entry and a field sprite
 * are the same drawing, so a manifest and the island can never disagree about what
 * something looks like.
 */
export function bakeIcon(a, size = ICON_SIZE) {
  const rc = recipeOf(a);
  const sp = specFor(a, rc), C = tones(rc, {});
  const fn = PLANS_FN[sp.plan] || quadBody;
  const b = makeBuf(AW, AH);
  fn(b, sp, C, 0, true);
  fn(b, sp, C, 0, false);
  headLayer(b, sp, C, 'idle');
  outline(b, 'ink');
  // CROP TO THE INK. The buffer has eleven rows of headroom for antlers, and an icon that
  // includes them for a badger is an icon of a badger in the bottom corner of a box.
  let x0 = AW, y0 = AH, x1 = -1, y1 = -1;
  for (let y = 0; y < AH; y++) {
    for (let x = 0; x < AW; x++) {
      if (bget(b, x, y) === null) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const cw = x1 - x0 + 1, chh = y1 - y0 + 1;
  const c = makeCanvas(size, size);
  const tmp = makeCanvas(AW, AH);
  if (!c || !tmp) return null;
  flush(b, tmp.g, 0, 0, 1);
  const sc2 = Math.min(size / cw, size / chh);
  const dw = Math.max(1, Math.round(cw * sc2)), dh = Math.max(1, Math.round(chh * sc2));
  c.g.imageSmoothingEnabled = false;
  c.g.drawImage(tmp.canvas, x0, y0, cw, chh,
    Math.round((size - dw) / 2), Math.round((size - dh) / 2), dw, dh);
  return c.canvas;
}

export function getAnimalIcon(a, size = ICON_SIZE) {
  return fromCache(iconCache, `${(a && a.id) || 'x'}|${size}`, () => bakeIcon(a, size));
}

export function drawAnimalIcon(g, animal, sx, sy, opts = {}) {
  const size = opts.size || ICON_SIZE;
  const c = getAnimalIcon(animal, size);
  if (!c) return;
  const prevA = g.globalAlpha;
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  g.drawImage(c, Math.round(sx - size / 2), Math.round(sy - size / 2));
  g.globalAlpha = prevA;
}

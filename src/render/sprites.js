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
const FISH_CY = 15;                       // ... and the row a swimmer floats on
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
  // A LITTLE BIGGER THAN LOOKS RIGHT ON ITS OWN. The head carries the eye, the ear, the
  // muzzle and the horn -- four of the five things that identify a species -- and at radius
  // four on a big animal there is no room for any of them to be distinct. Up by about a
  // sixth, which is one art pixel: at 2x that is a two-pixel wider face.
  let headR = 2.6 + size * 1.35;
  if (has('smart') || has('primate') || has('cute')) headR += 0.5;
  if (has('tiny')) headR -= 0.8;
  headR = clamp(headR, 2.4, 5.6);

  // A BIRD IS NOT A SHORT QUADRUPED. Left on the generic numbers a raven came out with an
  // eighteen-pixel barrel and read as an odd dog: the body has to be compact and DEEP, and
  // the neck short unless the animal is a wader.
  if (plan === 'bird') {
    // AND NOT AS SMALL AS IT WAS. At bodyLen * 0.6 a raven's body came out nine art pixels
    // by eight -- so its wing was four pixels, its tail was longer than its body, and there
    // was no room on the flank for either of them. A bird is COMPACT, which is not the same
    // as tiny: it wants a deep body and long legs, and the depth is where the wing goes.
    bodyLen = clamp(bodyLen * 0.82, 12, 17);
    bodyHigh = clamp(bodyHigh * 1.3, 7, 12);
    legLen = clamp(legLen * 1.15, 4, 12);
    if (has('tall') || has('majestic')) {
      neckUp = clamp(neckUp + 0.2, 0.3, 0.95);        // a heron, a swan, an ostrich
    } else {
      // UP AND FORWARD, not straight up. At neckUp 0.85 a raven's head sat directly on top
      // of its own shoulders with the beak the only thing in front of the body, so the bird
      // had no neck and no front -- it was a ball with a nose.
      neckLen = clamp(neckLen * 0.72, 2.5, 5);
      neckUp = 0.48;
    }
    headR = clamp(headR * 0.8, 2.4, 4);
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
    // WHICH FAMILY, because the extras have to know. Eight animals in the roster carry
    // `extra: 'mane'` and no two of them wear it the same way -- a ruff round the skull, a
    // crest along the neck, a ridge of hackles over the withers. One word in the data,
    // three different animals out of it.
    cat: has('cat'), equine: has('equine'), bovine: has('bovine'),
    canine: has('canine'), primate: has('primate'), tags, id: (a && a.id) || '',
    ears: rc.ears || 'round', face: rc.face || 'muzzle',
    extra: rc.extra || 'none', pattern: rc.pattern || 'none',
    eyeStyle: rc.eyeStyle || 'dot',
  };
}

/* ------------------------------------------------------------------- colours */

function tinted(key, tint, amt) {
  return tint ? mix(P[key] || key, P[tint] || tint, amt) : (P[key] || key);
}

/** How bright a colour is, 0..1. Used only to decide whether an animal needs a rim. */
function lumOf(hex) {
  const h = String(hex).replace('#', '');
  if (h.length < 6) return 0.5;
  const r = parseInt(h.slice(0, 2), 16), g2 = parseInt(h.slice(2, 4), 16), b2 = parseInt(h.slice(4, 6), 16);
  return (r * 0.299 + g2 * 0.587 + b2 * 0.114) / 255;
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
  // CORRUPTION USED TO BE A HOLE IN THE SCREEN. Ink on night on purple0 is three tones of
  // black: a corrupted lion had a silhouette and nothing inside it, so you could not tell
  // WHICH animal was walking at you -- and being able to tell is the entire reason the
  // same sprite is reused for all three states. It is a BRUISE now. The shape still reads,
  // the colours are just wrong, and the red eye is what says it means it.
  corrupt: {
    deep: 'ink', shade: 'purple0', body: 'purple1', light: 'pink', belly: 'night',
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
  let body = tinted(rc.body || 'grey1', t, amt);
  const shade = tinted(rc.shade || 'grey0', t, amt);
  let light = tinted(rc.light || 'grey2', t, amt);
  // A BLACK ANIMAL IS NOT A SILHOUETTE, and the reason it kept coming out as one is the ink
  // contour. Every sprite in this game is drawn with a black outline round it; when the
  // animal's own body colour is also ink, the animal and its outline are the SAME COLOUR,
  // so every bit of shading inside the shape has nowhere to sit and the raven, the penguin
  // and the boar all came out as flat black cutouts with an eye on the front.
  //
  // So a very dark recipe gets lifted twice: the BODY comes up off the contour far enough
  // that the contour reads as a line, and the LIGHT goes up much further so there is a rim.
  // It is lifted toward the recipe's own light rather than toward grey, which is what keeps
  // a raven purple-black and a penguin warm-black instead of making both of them slate.
  const dark = 1 - lumOf(body);
  if (dark > 0.66) {
    const k = (dark - 0.66) * 1.5;
    body = mix(body, light, k * 0.45);
    light = mix(light, P.white, k * 1.2);
  }
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
  // THE SPINE. One lit pixel along the very top of the barrel, front to back. Every animal
  // in this game is drawn against something -- grass, sand, wet sand, the dark of a hold --
  // and a black bear on a night field has no top edge at all without it. Two screen pixels
  // of light is a back, and it costs one pass down the width.
  if (o.spine !== false) {
    for (let x = Math.round(cx - rx * 0.74); x <= Math.round(cx + rx * 0.74); x++) {
      for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
        if (bget(b, x, y) === null) continue;
        bset(b, x, y, C.light);
        break;
      }
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
      // THE EDGE PASS USED TO BE AS THICK AS THE LIMB. At +0.9 on a leg of radius one the
      // contour grew the limb from two pixels to four, three of which were the contour --
      // so every leg and every neck in the game came out a black stick with a hint of
      // colour trapped in the middle of it. Half that, and a leg is a leg with a line on it.
      const r = (r0 + (r1 - r0) * f) + (pass === 0 ? 0.55 : 0);
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

/**
 * A hoof or a paw: three rows, dark, wider than the leg, with a toe at the front.
 *
 * TWO ROWS WAS A SMUDGE. A leg two pixels thick ending in a foot two pixels tall has no
 * ankle and no foot -- it is a stick that stops. Three rows and one pixel wider is the
 * difference between an animal standing on the ground and an animal hovering over it.
 */
function foot(b, x, y, w, C) {
  const w2 = w + 1;
  brect(b, x - (w2 >> 1), y - 1, w2, 3, C.deep);
  brect(b, x - (w2 >> 1), y - 1, w2, 1, C.shade);
  bset(b, x + (w2 >> 1), y, C.deep);
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
    //
    // AND IT FLOATS AT ROW FIFTEEN. This used to say GROUND - 14, which is twenty-seven,
    // while fishBody drew the animal at fifteen from a local of its own -- so for every
    // swimmer in the roster the head layer was baked TWELVE ROWS BELOW THE BODY. Thirteen
    // animals had an eye, a muzzle and a nostril floating in the water underneath them,
    // which is exactly what it looked like. One number, read by both.
    const cy = FISH_CY, high = sp.bodyHigh + 2;
    const back = 4, front = back + sp.bodyLen + 3;
    return {
      back, front, bodyTop: cy - high / 2, bodyBottom: cy + high / 2,
      nx: front, ny: cy, headCx: front - 4, headCy: cy - 1, legLen: 0, noSkull: true,
    };
  }
  if (sp.plan === 'serpent') {
    // THE HEAD RIDES THE TOP OF THE S. serpentBody draws a sine climbing from the coil at
    // GROUND - 3 to the raised front, and the head layer was being told to put the skull
    // where a quadruped's shoulder would be -- so a rattlesnake's head sat in the middle of
    // its own body. These two numbers are the last point of that sine, and nothing else.
    const tipY = GROUND - 3 - (sp.bodyHigh + 4);
    return {
      back: 3, front: 29, bodyTop: tipY, bodyBottom: GROUND - 1,
      nx: 27, ny: tipY + 1, headCx: 30, headCy: tipY, legLen: 0,
    };
  }
  const legLen = sp.legLen;
  const bodyBottom = GROUND - legLen;
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
  limb(b, x, hipY, x + swing, footY - 1, near ? 1.3 : 0.9, near ? 1.0 : 0.7, C,
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

/**
 * BIRD: a body up on two legs, a folded wing that catches the light, a short cocked tail.
 *
 * THE TWENTY WORST SPRITES IN THE GAME WERE ALL BIRDS, and every one of them failed the
 * same three ways. The tail was a ten-pixel fan off the back of a ten-pixel body, so half
 * the silhouette was tail and it read as a wing pointing backwards. The wing was drawn in
 * the SHADE tone, which on a raven -- ink body, shadow shade -- is a black shape on a black
 * shape, so the bird came out as a hole in the frame with a beak on it. And the legs were
 * two straight sticks, so the bird sat on the ground like a bag.
 *
 * Fixed in that order: a five-pixel tail, a wing in the LIGHT tone with its primaries cut
 * back past the body, and one bend in the leg. A bird is a shape standing UP.
 */
function birdBody(b, sp, C, phase, far) {
  const f = frame(sp);
  const sw = SWING[phase % PHASES];
  const bob = BOB[phase % PHASES];
  const cy = (f.bodyTop + f.bodyBottom) / 2;
  if (far) {
    // the tail, cocked up and back, with the feather lines cut into it
    const tx = f.back + 2, ty = cy - 1;
    const plume = sp.extra === 'plume';
    if (plume) {
      // A PEACOCK'S TRAIN, and an ostrich's, and a flamingo's: the one bird whose tail IS
      // the animal gets a real fan, five feathers wide, and nothing else in the roster does.
      // THREE FEATHERS, OVERLAPPING. Five at eight pixels long and three rows apart came
      // out as a spiky teal star behind the peacock, because at this size five separated
      // wedges are five separated wedges and not a fan. Three that touch read as one train.
      for (let i = -1; i <= 1; i++) {
        wedge(b, tx, ty + 1, tx - 7, ty - 1 + i * 3.4, tx - 5, ty + 3 + i * 3.4,
          i === 0 ? C.body : C.shade, C.deep);
      }
      for (let i = -1; i <= 1; i++) bset(b, tx - 6, ty + i * 3, C.light);
    } else {
      wedge(b, tx, ty - 1, tx - 6, ty - 3, tx - 4, ty + 2, C.shade, C.deep);
      bline(b, tx - 1, ty - 1, tx - 5, ty - 2, mix(C.body, C.light, 0.4));
      bline(b, tx - 1, ty + 1, tx - 4, ty, mix(C.body, C.deep, 0.35));
    }
    // the far leg
    const lx = f.back + 4;
    limb(b, lx, f.bodyBottom - 1, lx + sw[1], GROUND - 2, 0.8, 0.6, C,
      { near: false, noEdge: true });
    foot(b, lx + sw[1], GROUND - 1, 2, C);
    return;
  }
  // the body: an EGG with the fat end FORWARD. A symmetrical ellipse is a ball, and a ball
  // on two legs is a toy chicken whatever you put on the front of it.
  barrel(b, f.back + 1, f.bodyTop + bob + 1, f.front, f.bodyBottom + bob, C);
  // the breast, pulled toward the belly colour -- which is what draws a penguin's shirt and
  // a raven's dark chest out of the same two lines.
  blob(b, f.front - 3, cy + bob, sp.bodyHigh * 0.38, sp.bodyHigh * 0.46,
    mix(C.belly, C.body, 0.3));
  // the near leg, WITH A HOCK. One bend is the entire difference between a bird standing on
  // the ground and a bird resting on it.
  const lx = f.back + 6;
  limb(b, lx, f.bodyBottom - 1 + bob, lx + 1, GROUND - 4, 1.0, 0.8, C, { near: true });
  limb(b, lx + 1, GROUND - 4, lx + 1 + sw[0], GROUND - 1, 0.8, 0.6, C, { near: true });
  foot(b, lx + 1 + sw[0], GROUND - 1, 3, C);
  // the neck
  limb(b, f.nx - 1, f.ny + 1 + bob, f.headCx, f.headCy + bob,
    Math.max(1.4, sp.bodyHigh * 0.26), Math.max(1.2, sp.headR * 0.42), C, { near: true });
  // THE FOLDED WING, AND IT GETS THE LIGHT. Not the shade: the wing is the one part of a
  // bird you can always see from the side, so it takes the top of the value range and the
  // body takes the middle. Its primaries run BACK PAST the body, which is the only part of
  // a folded wing that has a shape you can read at four pixels.
  // and on the darkest birds it keeps ALL of the light: pulling the wing tone a third of
  // the way back toward the body is fine on a dove and puts a raven's wing back in the dark.
  const wingTone = lumOf(C.body) < 0.34 ? C.light : mix(C.light, C.body, 0.3);
  const covert = mix(C.body, C.deep, 0.45);
  // AND IT IS MOST OF THE FLANK. Three art pixels across is a patch of paint; the wing has
  // to be the biggest single shape on the bird after the body, because it is.
  const wl = Math.max(3.2, sp.bodyLen * 0.36), wh = Math.max(2.0, sp.bodyHigh * 0.27);
  const wcx = f.back + 3 + wl, wcy = f.bodyTop + bob + wh + 2.2;
  blob(b, wcx, wcy, wl, wh, wingTone, { edge: C.deep });
  // the primaries, running back off the wing and past the tail-end of the body
  for (let i = 0; i < 3; i++) {
    bline(b, wcx - wl * 0.2, wcy + i, wcx - wl - 2.5, wcy + 1.6 + i * 1.4, covert);
  }
  // the leading edge, one pale row, which is what turns the oval into a wing
  bline(b, wcx - wl * 0.5, wcy - wh, wcx + wl * 0.7, wcy - wh + 0.6, C.light);
  // A FLIPPER IS A WING THAT GAVE UP: a penguin gets a hard-edged paddle low on the body
  // instead of a feathered one, and that is the whole difference in the silhouette.
  if (sp.extra === 'flipper') {
    wedge(b, f.back + 6, f.bodyTop + bob + 4, f.back + 2, f.bodyBottom + bob + 1,
      f.back + 9, f.bodyBottom + bob - 1, C.shade, C.deep);
  }
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
  const cy = FISH_CY;
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
  // THE DORSAL, AND IT IS SMALL. Drawn four pixels tall with a contour on both sides it came
  // out as a lump on the animal's back bigger than its own head, and every swimmer in the
  // roster looked like it was carrying something.
  const top = cy - high / 2;
  wedge(b, back + 6, top, back + 9, top - 2.6, back + 11, top + 1, C.shade, C.deep);
  // near pectoral
  wedge(b, back + 8, cy + 1, back + 5, cy + 5, back + 11, cy + 3, C.shade, C.deep);
  // the gill, and the lateral line -- the one marking every fish has and the only thing
  // that says which way a teardrop is swimming
  bline(b, front - 6, cy - 2, front - 7, cy + 2, C.deep);
  bline(b, back + 4, cy, front - 7, cy - 1, mix(C.light, C.body, 0.35));
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

/**
 * A TAIL, HUNG THE WAY THE ANIMAL HANGS IT.
 *
 * The first version drew every tail as a stub going UP and BACK with a two-pixel ball on
 * the end of it -- which is a cat, and is wrong for the twenty-odd animals in the roster
 * that are not one. A cow's tail hangs. On a cow, that ball came off the rump at the height
 * of the shoulder and read, unmistakably, as a second head.
 */
function tailWhip(b, f, sp, C, swish) {
  const bx = f.back + 1, by = f.bodyTop + 2;
  const bushy = sp.cat || sp.tags.includes('bushy') || sp.tags.includes('rodent');
  // FLAT, NOT SHADED. A lit disc puts its highlight on the upper left, so a two-pixel tuft
  // out behind a tawny animal came out as a pale dot on a dark ball -- an eye, in other
  // words, hanging off the animal's rump. A tail tuft is one value.
  const T = Object.assign({}, C, { body: C.shade, light: C.shade, belly: C.shade });
  if (bushy) {
    limb(b, bx, by + 2, bx - 5, by - 2 + swish, 1.0, 0.7, C, { near: false });
    disc(b, bx - 6, by - 3 + swish, 1.5, T, { edge: C.deep });
  } else {
    // down the back of the leg, and the tuft at the bottom of it
    limb(b, bx, by + 1, bx - 2 + swish, f.bodyBottom + 2, 1.0, 0.6, C, { near: false });
    disc(b, bx - 2 + swish, f.bodyBottom + 3, 1.3, T, { edge: C.deep });
  }
}

function tailOf(b, f, sp, C, phase) {
  const swish = [0, 1, 0, -1][phase % PHASES];
  const k = sp.extra;
  const bx = f.back + 1, by = f.bodyTop + 2;
  if (k === 'tail') {
    tailWhip(b, f, sp, C, swish);
  } else if (k === 'plume') {
    for (let i = -1; i <= 1; i++) {
      limb(b, bx, by, bx - 5, by - 6 + i * 3 + swish, 1.2, 0.6, C, { near: false });
    }
  } else if (k === 'mane') {
    // ONE WORD, THREE ANIMALS. `mane` in the roster means lion, horse, wolf, boar, yak,
    // hyena, gorilla and qilin, and the first pass gave all eight of them a lion's ruff:
    // a ring of dark discs at headR + 2, every one of them with an edge, which came out as
    // a sixteen-pixel helmet with a face lost somewhere inside it. The horse had no head.
    //
    // So it is read off the FAMILY instead. A cat wears a RUFF round the skull. An equine
    // wears a CREST along the top of its neck and nothing at all on its face. Everything
    // else wears HACKLES -- a ridge of raised fur over the withers, which is what a wolf,
    // a boar and a yak actually have and none of them had.
    // AND IT HAS TO BE A TONE YOU CAN SEE. Built out of C.shade alone, a wolf's hackles
    // and a boar's bristle were shadow-on-shadow inside an ink contour: drawn, costed, and
    // invisible. The strands take a MID tone with the shade behind them, so the ridge has
    // light and dark in it and reads as fur at four pixels.
    const M = Object.assign({}, C, {
      body: mix(C.shade, C.body, 0.45), light: C.body, belly: C.shade,
    });
    if (sp.cat || sp.primate) {
      // the ruff: from the nape, over the crown, down to the cheek, and it STOPS there.
      // Tips a tone off the mass, so it reads as fur rather than as a hood.
      // AND IT IS SMALLER THAN A LION'S REALLY IS. At headR + 2 with two-pixel discs the
      // ruff was wider than the animal's own barrel, which is true of a lion and unusable
      // in a sprite: the head has to be the biggest thing about the head.
      const rr = sp.headR + 0.6;
      for (let i = 0; i <= 10; i++) {
        const a = -Math.PI * 0.3 + (i / 10) * Math.PI * 1.0;
        const dx = -Math.cos(a) * rr, dy = -Math.sin(a) * rr;
        disc(b, f.headCx + dx, f.headCy + dy, i % 2 ? 1.6 : 1.2, M, { edge: C.deep });
      }
      for (let i = 0; i < 2; i++) disc(b, f.nx - 1 + i, f.ny + 3 + i * 1.4, 1.5, M, { edge: C.deep });
    } else if (sp.equine) {
      // the crest, laid ALONG the neck as a sawtooth, and a forelock between the ears. A
      // horse's mane falls on the far side of its neck from you, which is why it is drawn
      // in the back pass -- the near side of the neck goes over it and only the top shows.
      const steps = 6;
      for (let i = 0; i <= steps; i++) {
        // STOPS AT THE POLL. Run it all the way to the head and the crest lands on the
        // skull, which is how the first cut of this buried a horse's face in its own mane.
        const u = (i / steps) * 0.74;
        const x = f.nx + (f.headCx - f.nx) * u;
        const y = f.ny + (f.headCy - f.ny) * u;
        const h = 2.4 + Math.sin(u * 4.2) * 1.1;
        limb(b, x, y + 1, x - 1.5, y - h, 1.3, 0.7, M, { near: false });
      }
    } else {
      // hackles: tallest just BEHIND the withers, dying out toward the hips. Starting them
      // at the shoulder put a five-pixel lump directly behind the wolf's head, and what the
      // wolf grew out of it was a mohawk.
      for (let i = 0; i < 8; i++) {
        const u = i / 7;
        const x = f.front - 5 - u * (sp.bodyLen * 0.62);
        const h = 4.2 - u * 2.6;
        limb(b, x, f.bodyTop + 2, x - 1, f.bodyTop + 2 - h, 1.3, 0.7, M, { near: false });
      }
      // and a THROAT RUFF on a canine, which is where a wolf's mane actually is and is the
      // one part of it you can see from the side.
      if (sp.canine) {
        for (let i = 0; i < 3; i++) disc(b, f.nx - 1, f.ny + 2 + i * 1.7, 1.8, M, { edge: C.deep });
      }
      if (sp.bovine) {
        // and a yak's skirt, hanging off the barrel: most of its outline is coat.
        for (let i = 0; i < 7; i++) {
          const x = f.back + 2 + i * 2.6;
          limb(b, x, f.bodyBottom - 2, x - 1, f.bodyBottom + 2, 1.5, 0.9, M, { near: false });
        }
      }
    }
    // AND A TAIL, because a lion and a wolf both have one and neither of them got one:
    // `extra` is a single slot and the mane was sitting in it.
    tailWhip(b, f, sp, C, swish);
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
    // A FRIESIAN'S PATCHES ARE BIG, AND THERE ARE TWO OF THEM WITH A GAP. Three of them
    // covered so much of the barrel that a cream cow came out a dark cow with cream on it,
    // which is the opposite animal. Two, offset, with the light running between them.
    blk(x0 + 1, y0, 6, 4); blk(x1 - 5, y1 - 3, 6, 4);
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
  const cx = f.headCx, cy = f.headCy;
  const facing = 1;                       // always drawn facing right; drawAnimal flips
  // A LONG FACE IS NOT A BIG BALL. A horse, a cow and a wolf all have a skull longer than
  // it is deep, and drawing them as a disc of radius five gave a horse a head a third the
  // length of its own body -- a cartoon pony, not a horse. The long-faced families get a
  // SMALLER skull and a LONGER muzzle, and it is the length that says which animal it is.
  const longFace = sp.equine || sp.bovine || sp.canine;
  const r = longFace ? Math.max(2.4, sp.headR - 1.4) : sp.headR;
  const snoutLong = longFace ? 1.15 : 0.62;

  // A FACE IS LIGHTER THAN A FLANK. Not because that is how light falls, but because it is
  // how you FIND a face: the head is the smallest part of the animal and it carries four of
  // the five things that say which animal it is, so it gets the top of the value range and
  // the barrel gets the middle. On the dark half of the roster -- wolf, raven, boar, brown
  // bear -- this is the whole difference between an animal and a shadow with an eye in it.
  const H = Object.assign({}, C, {
    shade: mix(C.shade, C.light, 0.34),
    body: mix(C.body, C.light, 0.36),
    light: mix(C.light, P.white, 0.3),
  });

  // the skull -- unless the plan says the head IS the body's front, which is what a fish
  // is. A disc stuck on the nose of a whale reads as a bubble it is about to swallow.
  // An elephant's ear is the biggest thing on its head and half the reason you know what
  // you are looking at -- so it goes on FIRST, behind the skull, like a plate.
  if (!f.noSkull && sp.pachyderm && sp.ears === 'round') {
    // AND IT IS NOT A BALLOON. At rx 1.05r by ry 1.3r the ear alone was thirteen pixels by
    // seventeen -- wider than the elephant's own barrel -- so the animal read as a head with
    // a body hanging off it. Big is the point; bigger than the body is not.
    blob(b, cx - r * 0.6, cy + r * 0.3, r * 0.82, r * 1.02, H.shade, { edge: C.deep });
    blob(b, cx - r * 0.8, cy + r * 0.3, r * 0.52, r * 0.72, mix(H.shade, C.deep, 0.4));
  }
  if (!f.noSkull) {
    disc(b, cx, cy, r, H, { edge: C.deep });
    blob(b, cx - r * 0.4, cy + r * 0.3, r * 0.7, r * 0.55, H.body);   // a cheek
    // A JAW. A skull drawn as one disc is a ball on a stick whatever you put in front of
    // it; the line from the ear down to the chin is what makes a head a head.
    blob(b, cx + r * 0.15, cy + r * 0.62, r * 0.66, r * 0.34, mix(H.shade, H.body, 0.5));
    bline(b, cx - r * 0.5, cy + r * 0.9, cx + r * 0.8, cy + r * 0.95, C.deep);
  }

  // --- the muzzle or beak, forward of the skull
  // A BEAK STARTS AT THE FRONT OF THE SKULL, not two-thirds of the way along it, or the
  // eye socket -- which is drawn after everything -- takes the first column of it back.
  const mx = cx + Math.round(r * (f.noSkull ? 0.5 : sp.face === 'beak' ? 1.0 : 0.85)) * facing;
  const my = cy + Math.round(r * 0.35);
  // THE MUZZLE HAS TO BE A DIFFERENT VALUE FROM THE FACE, and WHICH WAY depends on the
  // animal. A cow is bone with a white belly and a white light, so a pale muzzle on a cow
  // is three shades of nothing and the animal reads as a big dog; a wolf is charcoal, so a
  // dark one does the same to the wolf. Away from the face, whichever way away is.
  const snout = lumOf(C.body) > 0.5
    ? mix(C.body, C.shade, 0.6)
    : mix(C.belly, P.white, 0.25);
  const k = sp.face;
  if (f.noSkull) {
    // A FISH HAS NO SNOUT. The generic muzzle blob put a pale pad on the nose of every
    // swimmer in the roster and a dark nostril in the middle of it, which reads as a
    // bandage. On a teardrop the mouth line IS the face.
    bline(b, mx - 2, my + 1, mx + Math.round(r * 0.8), my + 1, C.deep);
  } else if (k === 'beak') {
    // A BEAK IS SMALL AND IT IS SHARP. The pass before this one made it r * 1.5 long and
    // six pixels deep in gold, on the theory that a beak is what tells you it is a bird:
    // what came out was a gold traffic cone bigger than the skull it was bolted to, with
    // the eye behind it. Three pixels of horn with an ink edge is a beak. A HOOK on it, and
    // it is a raptor -- which is the actual difference between an eagle and a dove.
    // AND IT IS HORN-COLOURED WHATEVER THE BIRD IS. A raven's bill really is black, and
    // black on a black head is a bird with no face -- the same trap as the wing. Every beak
    // in the game is warm bone with an ink edge, and a raptor's has a hook on it, which is
    // the actual visible difference between an eagle and a dove.
    // ROW BY ROW, not as a triangle. The version before this drew an ink triangle, a horn
    // triangle two pixels tall inside it, and then a MOUTH LINE down the middle of the horn
    // -- so what came out was an ink bar with a brown stripe in it, and a colour count of
    // the baked head layer had no horn tone in it at all. Every bird in the game was
    // wearing a black smudge. Drawn as explicit rows it is three pixels of horn tapering to
    // one, and nothing drawn afterwards can quietly delete it.
    const bl = Math.max(3, Math.round(r * 1.1));
    const raptor = sp.tags.includes('predator');
    const horn = raptor ? P.gold : mix(P.brass2, P.bone, 0.3);
    for (let i = 0; i <= bl; i++) {
      const half = i < bl * 0.45 ? 1 : 0;
      brect(b, mx - 1 + i, my - half, 1, half * 2 + 1, horn);
      bset(b, mx - 1 + i, my - half - 1, C.deep);
      bset(b, mx - 1 + i, my + half + 1, C.deep);
    }
    bset(b, mx - 1, my, mix(horn, C.deep, 0.5));        // the gape, against the face
    if (raptor) { bset(b, mx + bl, my + 1, horn); bset(b, mx + bl - 1, my + 2, C.deep); }
  } else if (k === 'trunk') {
    // A trunk is not a post. Three tapering segments curving forward and down, a curl at
    // the tip, and a pair of tusks either side of it -- without those it read as a cannon
    // bolted to the front of a grey dog.
    // THICKER AT THE TOP AND IT REACHES THE GROUND. Drawn at radius two it came out as a
    // grey wire down the front of the animal; a trunk is the heaviest single limb on it.
    let tx = mx, ty = my;
    const drop = GROUND - 2 - my;
    for (let i = 1; i <= 8; i++) {
      const u = i / 8;
      const nx2 = mx + Math.round(Math.sin(u * 2.1) * 3.5);
      const ny2 = my + Math.round(drop * u);
      limb(b, tx, ty, nx2, ny2, 2.6 - u * 1.5, 2.5 - u * 1.5, H, { near: true });
      tx = nx2; ty = ny2;
    }
    // the wrinkles, three of them: a smooth trunk is a hose
    for (let i = 1; i <= 3; i++) {
      const ny2 = my + Math.round(drop * (i / 4));
      bline(b, mx - 1, ny2, mx + 2, ny2, mix(H.shade, C.deep, 0.45));
    }
    bset(b, tx + 1, ty, H.body); bset(b, tx + 2, ty - 1, H.shade);
    // and the tusks, in bone, long enough to be tusks
    const TK = { body: P.white, shade: P.bone, deep: mix(P.bone, C.deep, 0.45), light: P.white };
    for (const sgn of [-1, 1]) {
      limb(b, mx - 1, my + 2, mx + Math.round(r * 1.15), my + 5 + sgn * 2, 1.2, 0.5, TK,
        { near: sgn > 0 });
    }
  } else if (k === 'snout' || k === 'muzzle' || k === 'whiskers') {
    blob(b, mx - (longFace ? 1 : 0), my, r * snoutLong, r * 0.44, snout);
    // A NOSE, not a nostril: two dark pixels at the tip. One dark pixel in the middle of a
    // pale muzzle reads as dirt -- and the lit pixel over it that was here reads as a chip
    // out of the sprite, because on a cream animal it came out white on white.
    brect(b, mx + Math.round(r * snoutLong * 0.66), my - 1, 2, 2, C.deep);
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
  if (!f.noSkull) earsOf(b, cx, cy, r, sp, H);
  // ... except a narwhal's, which is the whole animal and whose head is its own body, so it
  // never reached the branch that draws it.
  else if (NOSE_HORN[sp.id]) {
    const HN = { body: P.white, shade: P.bone, light: P.white, deep: mix(P.bone, C.deep, 0.5) };
    limb(b, cx + r * 0.6, cy, cx + r * 3.2, cy - r * 0.5, 1.5, 0.5, HN, { near: true });
  }

  // --- THE EYE. One eye, because this is a profile. Two art pixels across with a catch
  // light, which at 2x is a four-pixel highlight -- big enough to carry an expression and
  // small enough to still be a dot.
  // A BEAKED HEAD KEEPS ITS EYE FURTHER BACK. On a bird the beak starts at the front of the
  // skull, and an eye at r * 0.42 sits directly behind the base of it -- so the eye and the
  // beak fought over the same four pixels and the beak lost.
  const ex = cx + Math.round(r * (sp.face === 'beak' ? 0.06 : 0.42));
  const ey = cy - Math.round(r * 0.18);
  // AN EYE RING, AND A BROW OVER IT. This is the single change that made the whole roster
  // read as animals rather than as shapes, and the reason is arithmetic: a dark pupil on a
  // dark head is nothing at all, and a dark pupil on two PALE pixels is an eye from across
  // the room. Real animals have it -- the bare skin round an eye is never the same value as
  // the coat -- and it is the only thing that works when the eye itself is two pixels wide.
  //
  // The first attempt did the opposite and darkened the socket, which is what a painter
  // would do and is exactly wrong here: it welded the eye to the shadow and a horse ended
  // up with a hole in the side of its face.
  //
  // DARK RING, PALE SOCKET, DARK PUPIL, in that order and always all three. A pale socket
  // on its own works on a black raven and vanishes on a white cow; the dark contour round
  // it is what makes the same three pixels work at both ends of the palette. And it is
  // sized off the SKULL, because a fixed five-pixel socket on a horse's long narrow head
  // was most of the horse's face.
  //
  // AND IT IS DRAWN AS FOUR PIXELS BY FOUR, not as a blob with a contour. `blob` with an
  // `edge` grows the shape by a pixel all the way round, so a socket wide enough to show a
  // halo round a two-pixel eye came out as a SEVEN-pixel dark square in the middle of the
  // face: it ate the beak off every bird in the game and put a hole in the horse's cheek.
  // A halo is exactly one pixel wide. Say so.
  // Three by three, with the eye in the bottom right of it: the halo shows as an L up the
  // back and over the top, and the lower lid closes it underneath. Four by four was a pale
  // square with a pupil in the middle -- readable, and on a small head it WAS the head.
  if (mood !== 'blink') {
    brect(b, ex - 1, ey - 1, 3, 3, mix(C.light, P.white, 0.5));
    bline(b, ex - 1, ey - 2, ex + 2, ey - 2, C.deep);            // the brow over it
  }
  if (mood === 'blink') {
    brect(b, ex, ey + 1, 2, 1, C.deep);
  } else {
    brect(b, ex, ey, 2, 2, C.eye);
    // ONE catch light, not half the eye. Eighty per cent white across a two-by-two eye is
    // not a highlight, it is a googly eye, and every animal in the game had one.
    bset(b, ex + 1, ey, mix(P[C.eye] || C.eye, P.white, 0.55));
    // and a lower lid, so a pale eye on a pale ring still closes at the bottom
    bline(b, ex, ey + 2, ex + 1, ey + 2, C.deep);
    const st = sp.eyeStyle;
    if (st === 'angry') bline(b, ex - 1, ey - 2, ex + 2, ey - 1, C.deep);
    if (st === 'sleepy') bline(b, ex - 1, ey - 1, ex + 2, ey - 1, C.deep);
    if (st === 'sparkle') bset(b, ex + 1, ey + 1, 'white');
    if (st === 'wide') { bset(b, ex - 1, ey, C.eye); bset(b, ex - 1, ey + 1, C.eye); }
    if (st === 'goggle') { bset(b, ex + 2, ey, 'ice'); bset(b, ex - 1, ey + 1, 'ice'); }
  }
  if (mood === 'happy') bset(b, cx - 1, cy + Math.round(r * 0.5), mix(P.red1, C.body, 0.55));
}

// The three animals whose horn is on the nose rather than the crown. Everything else with
// `ears: 'horn'` is a hoofed thing wearing a pair of them, which is a different drawing.
const NOSE_HORN = { rhino: 1, narwhal: 1, unicorn: 1 };

function earsOf(b, cx, cy, r, sp, C) {
  const k = sp.ears;
  const bx = cx - Math.round(r * 0.35);
  const by = cy - Math.round(r * 0.8);
  const in_ = mix(C.belly, P.red1, 0.3);
  if (k === 'round' && sp.pachyderm) {
    // drawn in headLayer BEFORE the skull -- see fanEar. Nothing to do here, or the ear
    // lands on top of the face and the animal has no eye.
  // BIGGER THAN THEY WERE. At r * 0.42 a round ear on a cow was a two-pixel nub: four
  // screen pixels, the same size as the eye, and half of that was its own outline.
  } else if (k === 'round') {
    const er = Math.max(2, Math.round(r * 0.62));
    disc(b, bx, by - 1, er, C, { edge: C.deep });
    blob(b, bx, by - 1, er * 0.5, er * 0.6, in_);
  }
  else if (k === 'tiny') { brect(b, bx, by, 2, 2, C.shade); }
  else if (k === 'pointy') {
    // WIDE AT THE BASE, NOT LONG. Seven pixels tall on a wolf's head came out as a hare.
    wedge(b, bx - 2, by + 1, bx + 1, by - 4, bx + 3, by + 1, C.body, C.deep);
    bset(b, bx, by - 1, in_); bset(b, bx + 1, by - 2, in_);
  }
  else if (k === 'long') { limb(b, bx, by + 1, bx - 2, by - 7, 1.4, 1, C, { near: true }); bset(b, bx - 1, by - 4, in_); }
  else if (k === 'tuft') { for (let i = -1; i <= 1; i++) limb(b, bx + i, by, bx + i * 2, by - 4, 0.9, 0.5, C, { near: false }); }
  // HORN IS BONE. This was drawn in the animal's own BELLY colour, which on a rhino is the
  // same key as its body -- so the rhino's horn was a grey stick on a grey head and the most
  // recognisable animal in the roster had nothing left to recognise. And there was one of
  // them, on the crown, pointing forward: right for a unicorn and wrong for all nine others.
  // Bone with a bone contour, and WHERE it goes comes off the animal.
  else if (k === 'horn') {
    const HN = {
      body: P.bone, shade: mix(P.bone, C.deep, 0.3),
      light: P.white, deep: mix(P.bone, C.deep, 0.5),
    };
    if (NOSE_HORN[sp.id]) {
      // on the nose, forward and up, and starting CLEAR of the eye socket -- the socket is
      // pale too, and a bone horn rooted next to it merges into one pale smudge.
      const hx = cx + r * 1.05, hy = cy + r * 0.3;
      limb(b, hx, hy, hx + r * 1.35, hy - r * 1.05, 1.6, 0.5, HN, { near: true });
    } else {
      // a curving pair on the crown, which is a goat, an ox, an ibex and a yak
      for (const side of [-1, 1]) {
        limb(b, cx + side, cy - r * 0.72, cx + side * 3 - 1.6, cy - r * 0.72 - 3.6, 1.1, 0.5,
          HN, { near: side > 0 });
      }
    }
  }
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
  // HORNS ON A BOVINE, whatever its ears say. `ears` is one word and a cow has both ears
  // AND horns, so the horns cannot live in the recipe -- and without them a cow is a large
  // dog with patches on it, which is precisely what the first pass of this looked like.
  if (sp.bovine && k !== 'horn' && k !== 'antler') {
    // SMALL, PALE, AND CLEAR OF THE SKULL. The first pair were drawn thick, with the body's
    // own deep tone for a contour, straight across the crown -- so a cow got a black bar
    // over its eyes and the horns read as the top of its head. A horn is bone: it takes a
    // bone contour, it is two pixels thick, and it starts where the skull stops.
    const HN = {
      body: C.belly, shade: mix(C.belly, C.deep, 0.32),
      light: P.white, deep: mix(C.belly, C.deep, 0.55),
    };
    const hy = cy - Math.round(r * 0.75);
    for (const side of [-1, 1]) {
      limb(b, cx + side, hy, cx + side * 3.4, hy - 3.4, 1.0, 0.5, HN, { near: side > 0 });
    }
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

  // EVEN, both of them: the sprite's own pixels are 2x2 blocks, so a blit landing on an
  // odd row shifts its whole grid half a macro pixel out of step with the scene.
  const dx = Math.round((sx - SZ / 2) / 2) * 2;
  // the art's ground row is GROUND of AH, so anchor the FEET rather than the box
  const dy = Math.round((sy - (SZH * (GROUND + 1)) / AH) / 2) * 2;

  // DOWN. A knocked-out animal has to LOOK knocked out, and there is no fourth bake for
  // it: `slump` squashes the blit vertically and drops it so the feet stay where they were,
  // which folds the legs, sinks the barrel and brings the head to the ground all at once.
  // It is one number and it reads from across the room, which a whole lying-down pose
  // would also do at forty times the cost. 0 is standing, 1 is flat out.
  const sl = clamp(opts.slump || 0, 0, 1);
  const hh = Math.round(SZH * (1 - sl * 0.46));
  const drop = SZH - hh;

  const prevA = g.globalAlpha;
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  g.save();
  if (opts.flip) { g.translate(dx + SZ, dy + drop); g.scale(-1, 1); } else { g.translate(dx, dy + drop); }
  const put = (c) => c && g.drawImage(c, 0, 0, SPRITE_SIZE, SPRITE_H, 0, 0, SZ, hh);
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
  g.drawImage(c, Math.round((sx - size / 2) / 2) * 2, Math.round((sy - size / 2) / 2) * 2);
  g.globalAlpha = prevA;
}

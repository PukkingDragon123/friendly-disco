// The palette. A COZY palette: warm woods, parchment, clay, muted greens, and a sea you
// would put your hand in. Hand-tuned so any two adjacent ramp steps read cleanly at 1x.
//
// Two rules the whole look depends on:
//   * nothing is pure white or blue-black. `white` is cream, `ink` is a warm near-black.
//     A cold outline over warm art is the fastest way to make pixel art look like a UI
//     mockup instead of a place.
//   * every material gets its OWN ramp -- clay, stone, leaf, skin, wood. Sharing one
//     grey across a cliff, a golem and a person is what makes pixel art look flat.
//
// Rule for the whole codebase: never write a hex literal outside this file.
// Helpers accept a palette KEY (preferred) or a raw hex (escape hatch only).

export const P = {
  // --- structural darks. WARM, not blue-black: a cold outline over warm art is the
  // fastest way to make cozy pixel art look like a UI mockup.
  ink:     '#1a1210',
  shadow:  '#2b1e1a',
  deep:    '#33261f',
  night:   '#3d3348',

  // --- sea. Muted teal-leaning blue rather than navy. Cozy water is water you would
  // put your hand in.
  water0:  '#22424a',
  water1:  '#2f6068',
  water2:  '#40858f',
  water3:  '#66b0b2',
  foam:    '#d3ebe2',

  // --- timber + hull. The widest ramp in the palette, because almost every surface in
  // the game is a plank, a post, a crate or a deck.
  wood0:   '#2a1a13',
  wood1:   '#482d1e',
  wood2:   '#6d462c',
  wood3:   '#96663b',
  wood4:   '#c48d58',

  // --- metal
  brass0:  '#4a3616',
  brass1:  '#7f5e27',
  brass2:  '#c69c49',
  brass3:  '#f1d99c',

  // --- deep foliage / canopy shadow (was felt green)
  cloth0:  '#16301f',
  cloth1:  '#204b2c',
  cloth2:  '#2d6438',
  cloth3:  '#418446',

  // --- neutrals. `white` is CREAM and `bone` is PARCHMENT: nothing in a cozy palette
  // is ever pure #fff, and the warm greys keep shadows from going blue.
  white:   '#fdf6e3',
  bone:    '#ecdcbb',
  grey0:   '#544a41',
  grey1:   '#7d7164',
  grey2:   '#ab9d8d',

  // --- warm accents
  red0:    '#5c211c',
  red1:    '#a83a2f',
  red2:    '#d6614a',
  orange:  '#e08c46',
  gold:    '#f5c451',
  amber:   '#eaa740',
  rust:    '#a35730',
  sand:    '#e9d0a0',

  // --- greens. Muted: the old green1 was a highlighter.
  green0:  '#3d6b33',
  green1:  '#70b04b',
  moss:    '#57783f',
  teal:    '#4fb0a2',
  sky:     '#93b9cd',
  ice:     '#d8ebe6',

  // --- magic
  purple0: '#43305e',
  purple1: '#8a69b2',
  pink:    '#e08fa2',

  /* ==================================================== new ramps

  Everything below was added for the rebuild. They exist because the alternative is
  callers reaching for an approximate old key -- a golem drawn out of `wood` reads as a
  wooden puppet, a cliff drawn out of `grey` reads as concrete -- and because sharing
  one ramp across clay, stone and skin is what makes pixel art look flat.
  */

  // river clay: the golem's body, and the mud hazard
  clay0:   '#3b2418',
  clay1:   '#5d3a25',
  clay2:   '#875436',
  clay3:   '#b0714a',
  clay4:   '#d19a6e',

  // foliage, lit from above. leaf3 is the sun-caught top of a canopy.
  leaf0:   '#1e3a22',
  leaf1:   '#2f5a2f',
  leaf2:   '#457f3c',
  leaf3:   '#6ba84c',
  leaf4:   '#a3cc63',

  // skin. Four tones so a crowd of cute humans is not one family.
  skin0:   '#6b4029',   // shadow for the darkest
  skin1:   '#8f5a38',
  skin2:   '#c08a5e',
  skin3:   '#e0ab80',
  skin4:   '#f4d3ae',

  // hair
  hair0:   '#22160f',
  hair1:   '#4a2c18',
  hair2:   '#8a5a2c',
  hair3:   '#d9b46a',

  // stone: cliffs, ruins, rocks, standing walls
  stone0:  '#3a3730',
  stone1:  '#5c574c',
  stone2:  '#847c6d',
  stone3:  '#b0a693',
  stone4:  '#d8cdb6',

  // biome specials, one or two steps each -- enough to read, not enough to bloat
  lava0:   '#7a2410',
  lava1:   '#e0632a',
  lava2:   '#ffb347',
  snow0:   '#b9c9cf',
  snow1:   '#e6f0f2',
  ash:     '#4a453f',
  bark:    '#4d3524',
  coral0:  '#c2566b',
  coral1:  '#f08a95',

  // parchment UI. `parch` is the paper a menu is printed on, `cream` the lit edge.
  parch:   '#e3cfa4',
  parch1:  '#cbb183',
  parch0:  '#a68a5f',
  cream:   '#f6e9c8',

  // the shepherd wand's magic
  magic0:  '#3f6b8a',
  magic1:  '#7fd0d8',
  magic2:  '#e8fbf6',
};

const KEYS = Object.keys(P);
export function palKeys() { return KEYS.slice(); }

/** Resolve a palette key or pass through a hex/rgba string. */
export function col(c) {
  if (c == null) return P.white;
  const v = P[c];
  return v !== undefined ? v : c;
}

/** Hex -> {r,g,b} */
export function rgb(c) {
  const h = col(c);
  if (h[0] !== '#') return { r: 255, g: 255, b: 255 };
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

/** Blend two palette colours; t=0 -> a, t=1 -> b. Returns a hex string. */
export function mix(a, b, t) {
  const A = rgb(a), B = rgb(b);
  const k = Math.max(0, Math.min(1, t));
  const to = (n) => Math.round(n).toString(16).padStart(2, '0');
  return '#' + to(A.r + (B.r - A.r) * k) + to(A.g + (B.g - A.g) * k) + to(A.b + (B.b - A.b) * k);
}

/** hex + alpha -> rgba() string. Use sparingly; prefer dithering. */
export function alpha(c, a) {
  const { r, g, b } = rgb(c);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

/** Nearest palette key to an arbitrary colour — used by the sprite factory. */
export function quantize(c) {
  const t = rgb(c);
  let best = 'white', bd = Infinity;
  for (const k of KEYS) {
    const q = rgb(P[k]);
    const d = (q.r - t.r) ** 2 + (q.g - t.g) ** 2 + (q.b - t.b) ** 2;
    if (d < bd) { bd = d; best = k; }
  }
  return best;
}

/** Darken / lighten by stepping toward ink / white. Keeps art coherent. */
export const darker = (c, t = 0.3) => mix(c, P.ink, t);
export const lighter = (c, t = 0.3) => mix(c, P.white, t);

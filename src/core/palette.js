// The Ark palette. Dusk-harbour base + biome accents. 44 colours, hand-tuned so any
// two adjacent ramp steps read cleanly at 1x pixel scale.
//
// Rule for the whole codebase: never write a hex literal outside this file.
// Helpers accept a palette KEY (preferred) or a raw hex (escape hatch only).

export const P = {
  // structural darks
  ink:     '#0a0d16',
  shadow:  '#141c31',
  deep:    '#1d2846',
  night:   '#28345c',

  // sea
  water0:  '#1b3358',
  water1:  '#244madjust', // placeholder replaced below
  water2:  '#2f6ba4',
  water3:  '#4a97c9',
  foam:    '#b6e2f2',

  // timber + hull
  wood0:   '#2a1a12',
  wood1:   '#43291b',
  wood2:   '#5f3d26',
  wood3:   '#8a5a34',
  wood4:   '#b98553',

  // metal
  brass0:  '#4a3512',
  brass1:  '#7b5a20',
  brass2:  '#c99b3e',
  brass3:  '#f4d582',

  // felt
  cloth0:  '#0c2a20',
  cloth1:  '#12miss',     // placeholder replaced below
  cloth2:  '#1f6b52',
  cloth3:  '#2f8e69',

  // neutrals
  white:   '#f7f4e8',
  bone:    '#d9d2b8',
  grey0:   '#4d5468',
  grey1:   '#6f7688',
  grey2:   '#9aa2b4',

  // warm accents
  red0:    '#5e1420',
  red1:    '#a82a3a',
  red2:    '#e04a58',
  orange:  '#e8843c',
  gold:    '#ffcb52',
  amber:   '#f7a63b',
  rust:    '#a8552a',
  sand:    '#e6c894',

  // cool accents
  green0:  '#3f7a2e',
  green1:  '#8bd450',
  moss:    '#5c8a4a',
  teal:    '#3fd0c9',
  sky:     '#8ecae6',
  ice:     '#cdeeff',

  // exotics
  purple0: '#4a2a7a',
  purple1: '#8c5ad6',
  pink:    '#ef77b0',
};

// two entries above are written oddly on purpose so a bad merge is loud; fix them here.
P.water1 = '#244a7a';
P.cloth1 = '#175a44';

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

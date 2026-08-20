// The nine habitats of the ark, plus the affinity matrix that decides how much
// credit a misplaced animal still earns.
//
// Why an affinity matrix at all: a run only ever opens 6 of the 9 gates (see
// rollAssignment in run.js), so on a bad roll a caravan full of penguins would be
// unplayable. Neighbouring biomes act as a soft landing — an arctic animal potted
// into the mountains is cold and rocky enough to score partial credit, a lion in
// the desert is nearly home. Wrong-but-adjacent is a decision; wrong-and-alien is
// a punishment.
//
// Colour contract (consumed by render/table.js and the gate plates):
//   color  = the bright identity colour: glow ring, name plate, HUD tag
//   accent = the icon colour sitting in the gate throat
//   dark   = the shadow inside the throat, dithered up toward `color`
// All three are palette KEYS, never hex. Every habitat's `color` is unique so six
// lit gates are never ambiguous at a glance; ocean (water3) and wetland (teal) are the
// closest pair on purpose -- they are the two water biomes and each other's strongest
// affinity, and their icons (wave vs reed) and accents carry the difference.

/** The 9 habitats, in canonical order. run.js and table.js both rely on this order. */
export const HABITATS = [
  {
    id: 'savanna',
    name: 'Savanna',
    short: 'SAV',
    color: 'gold',
    accent: 'sand',
    dark: 'rust',
    biome: 'land',
    icon: 'acacia',
    blurb: 'Golden grass and long horizons.',
  },
  {
    id: 'arctic',
    name: 'Arctic',
    short: 'ARC',
    color: 'ice',
    accent: 'sky',
    dark: 'night',
    biome: 'cold',
    icon: 'snowflake',
    blurb: 'Blue ice, white silence, black water.',
  },
  {
    id: 'jungle',
    name: 'Jungle',
    short: 'JUN',
    color: 'green1',
    accent: 'foam',
    dark: 'cloth0',
    biome: 'land',
    icon: 'leaf',
    blurb: 'Green above, green below, all of it loud.',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    short: 'OCN',
    color: 'water3',
    accent: 'foam',
    dark: 'water0',
    biome: 'water',
    icon: 'wave',
    blurb: 'Deep blue with no floor to it.',
  },
  {
    id: 'desert',
    name: 'Desert',
    short: 'DES',
    color: 'sand',
    accent: 'green1',
    dark: 'wood1',
    biome: 'land',
    icon: 'cactus',
    blurb: 'Red rock, hot sand, patient shade.',
  },
  {
    id: 'farm',
    name: 'Farm',
    short: 'FARM',
    color: 'wood3',
    accent: 'green1',
    dark: 'wood1',
    biome: 'human',
    icon: 'barn',
    blurb: 'Mud, fodder and a warm barn door.',
  },
  {
    id: 'wetland',
    name: 'Wetland',
    short: 'WET',
    color: 'teal',
    accent: 'sand',
    dark: 'wood0',
    biome: 'water',
    icon: 'reed',
    blurb: 'Reeds, warm mud and rings on the water.',
  },
  {
    id: 'mountain',
    name: 'Mountain',
    short: 'MTN',
    color: 'grey2',
    accent: 'ice',
    dark: 'shadow',
    biome: 'cold',
    icon: 'peak',
    blurb: 'Thin air and a very long drop.',
  },
  {
    id: 'forest',
    name: 'Forest',
    short: 'FOR',
    color: 'moss',
    accent: 'wood4',
    dark: 'wood1',
    biome: 'land',
    icon: 'pine',
    blurb: 'Damp pine, leaf litter, watching eyes.',
  },
];

export const HABITAT_BY_ID = Object.freeze(
  HABITATS.reduce((acc, h) => { acc[h.id] = h; return acc; }, {}),
);

/**
 * Adjacency, declared ONCE per pair so the matrix cannot drift out of symmetry.
 * 0.6-0.7 = the same world with a different thermostat; 0.2-0.3 = a stretch you
 * take because the gate you wanted is shut.
 */
const PAIRS = [
  // hot and open: the savanna is a wetter desert, and a farm is a fenced savanna
  ['savanna', 'desert', 0.65],
  ['savanna', 'farm', 0.4],
  ['savanna', 'jungle', 0.3],
  ['savanna', 'forest', 0.2],
  ['savanna', 'mountain', 0.2],
  // cold and high: ice and altitude are the same problem
  ['arctic', 'mountain', 0.65],
  ['arctic', 'ocean', 0.45],
  ['arctic', 'forest', 0.2],
  // green and wet: the jungle drains into the wetland and thins into the forest
  ['jungle', 'wetland', 0.55],
  ['jungle', 'forest', 0.5],
  ['jungle', 'farm', 0.2],
  // water: salt to brackish is one step, salt to fresh is two
  ['ocean', 'wetland', 0.6],
  // rock and dust
  ['desert', 'mountain', 0.3],
  ['desert', 'farm', 0.25],
  // hedgerows and pasture: half the forest already eats out of the trough
  ['farm', 'forest', 0.45],
  ['farm', 'wetland', 0.3],
  ['farm', 'mountain', 0.25],
  // riverbank
  ['wetland', 'forest', 0.35],
  // treeline
  ['mountain', 'forest', 0.4],
];

/**
 * AFFINITY[a][b] in 0..1 = partial credit for an animal from `a` potted into `b`.
 * Symmetric by construction. Missing pair = 0. AFFINITY[a][a] is implicitly 1.
 */
export const AFFINITY = (() => {
  const m = {};
  for (const h of HABITATS) m[h.id] = {};
  for (const [a, b, v] of PAIRS) {
    if (!m[a] || !m[b]) continue;           // a typo must not silently half-exist
    m[a][b] = v;
    m[b][a] = v;
  }
  for (const h of HABITATS) Object.freeze(m[h.id]);
  return Object.freeze(m);
})();

/** 1 for a true home, the matrix value for a neighbour, 0 for anywhere alien. */
export function affinity(homeId, potId) {
  if (!homeId || !potId) return 0;
  if (homeId === potId) return 1;
  const row = AFFINITY[homeId];
  const v = row ? row[potId] : 0;
  return typeof v === 'number' ? v : 0;
}

/** The six pocket slots on the deck, in the order run.js assigns habitats to them. */
export const GATE_LAYOUT = ['tl', 'tm', 'tr', 'bl', 'bm', 'br'];

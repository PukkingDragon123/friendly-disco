// The nine BERTH TRAITS of the ark, plus the resemblance matrix that decides how
// much credit a badly-berthed animal still earns.
//
// This file used to hold biomes, and potting was right-or-wrong: a penguin belonged
// in the arctic gate and nowhere else. That made the deck a memory test. Traits
// replace it. A berth does not claim to BE anywhere — it advertises what it is LIKE:
// warm, bushy, soaked. Every animal in turn likes two or three of those conditions,
// in a ranked order, so almost every animal has several homes it would accept and a
// clear favourite among them. Potting stops being recall and becomes routing.
//
// Scoring reads it as: for each thing the animal likes, how close is this berth to
// it? Take the best answer.
//
//   likeness(animal, trait) = max over the animal's likes of
//                             rankWeight(rank) * resemblance(like, trait)
//
// rankWeight is 1 / 0.8 / 0.6 for first / second / third choice, and resemblance is
// 1 for the same trait, the RESEMBLES value for a related one, 0 for the alien. So a
// fennec fox (dusty, warm, lofty) berthed in WARM earns 0.8, in DUSTY earns 1, and
// in BRINY earns nothing at all. There is always a good answer and always a wrong one.
//
// Colour contract (consumed by render/table.js and the gate plates):
//   color  = the bright identity colour: glow ring, name plate, HUD tag
//   accent = the icon colour sitting in the gate throat
//   dark   = the shadow inside the throat, dithered up toward `color`
// All three are palette KEYS, never hex. Every trait's `color` is unique so six lit
// berths are never ambiguous at a glance; SOAKED (teal) and BRINY (water3) are the
// closest pair on purpose — they are the two wet traits and each other's strongest
// resemblance — and their icons (drop vs wave) carry the difference.

/** The 9 berth traits, in canonical order. run.js and table.js rely on this order. */
export const HABITATS = [
  {
    id: 'warm',
    name: 'Warm',
    short: 'WARM',
    color: 'gold',
    accent: 'sand',
    dark: 'rust',
    biome: 'heat',
    icon: 'sun',
    blurb: 'Sun on the boards and straw that never cools.',
  },
  {
    id: 'frozen',
    name: 'Frozen',
    short: 'FROZEN',
    color: 'ice',
    accent: 'sky',
    dark: 'night',
    biome: 'cold',
    icon: 'snowflake',
    blurb: 'Blue ice, white silence, black water.',
  },
  {
    id: 'bushy',
    name: 'Bushy',
    short: 'BUSHY',
    color: 'green1',
    accent: 'foam',
    dark: 'cloth0',
    biome: 'green',
    icon: 'leaf',
    blurb: 'Thicket thick enough to disappear into.',
  },
  {
    id: 'briny',
    name: 'Briny',
    short: 'BRINY',
    color: 'water3',
    accent: 'foam',
    dark: 'water0',
    biome: 'water',
    icon: 'wave',
    blurb: 'Salt, and no floor under any of it.',
  },
  {
    id: 'dusty',
    name: 'Dusty',
    short: 'DUSTY',
    color: 'sand',
    accent: 'green1',
    dark: 'wood1',
    biome: 'dry',
    icon: 'cactus',
    blurb: 'Dry rock, hot grit, patient shade.',
  },
  {
    id: 'tame',
    name: 'Tame',
    short: 'TAME',
    color: 'wood3',
    accent: 'green1',
    dark: 'wood1',
    biome: 'human',
    icon: 'barn',
    blurb: 'Troughs, fences, and a hand that feeds.',
  },
  {
    id: 'soaked',
    name: 'Soaked',
    short: 'SOAKED',
    color: 'teal',
    accent: 'sand',
    dark: 'wood0',
    biome: 'water',
    icon: 'drop',
    blurb: 'Fresh water, warm mud, rings spreading out.',
  },
  {
    id: 'lofty',
    name: 'Lofty',
    short: 'LOFTY',
    color: 'grey2',
    accent: 'ice',
    dark: 'shadow',
    biome: 'high',
    icon: 'peak',
    blurb: 'High perches, thin air, a very long drop.',
  },
  {
    id: 'gloomy',
    name: 'Gloomy',
    short: 'GLOOMY',
    color: 'moss',
    accent: 'wood4',
    dark: 'wood1',
    biome: 'dark',
    icon: 'moon',
    blurb: 'Roofed, quiet, and something in it watching.',
  },
];

export const HABITAT_BY_ID = Object.freeze(
  HABITATS.reduce((acc, h) => { acc[h.id] = h; return acc; }, {}),
);

/** Trait ids, canonical order. */
export const TRAITS = Object.freeze(HABITATS.map((h) => h.id));

/**
 * How much two traits resemble each other, declared ONCE per pair so the matrix
 * cannot drift out of symmetry. 0.55-0.65 = the same condition with a different
 * thermostat; 0.2-0.3 = a stretch you accept because the berth you wanted is shut.
 */
const PAIRS = [
  // heat and dust are the same complaint at different humidities
  ['warm', 'dusty', 0.6],
  ['warm', 'tame', 0.4],
  ['warm', 'bushy', 0.35],
  // cold and altitude are the same problem
  ['frozen', 'lofty', 0.65],
  ['frozen', 'briny', 0.45],
  // green, and what green needs
  ['bushy', 'soaked', 0.5],
  ['bushy', 'gloomy', 0.55],
  ['bushy', 'tame', 0.25],
  // salt to fresh is one step
  ['briny', 'soaked', 0.6],
  // rock
  ['dusty', 'lofty', 0.35],
  ['dusty', 'tame', 0.25],
  // the barn and the hedgerow
  ['tame', 'gloomy', 0.3],
  ['tame', 'soaked', 0.3],
  // under the canopy, under the overhang
  ['lofty', 'gloomy', 0.4],
  ['gloomy', 'soaked', 0.3],
];

/**
 * AFFINITY[a][b] in 0..1 = how much trait `a` resembles trait `b`.
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

/** 1 for the same trait, the matrix value for a relative, 0 for anything alien. */
export function affinity(traitA, traitB) {
  if (!traitA || !traitB) return 0;
  if (traitA === traitB) return 1;
  const row = AFFINITY[traitA];
  const v = row ? row[traitB] : 0;
  return typeof v === 'number' ? v : 0;
}

/** What a first / second / third choice is worth before resemblance is applied. */
export const RANK_WEIGHT = Object.freeze([1, 0.8, 0.6]);

/**
 * How well `berthTrait` suits an animal, in 0..1. Consults every trait the animal
 * likes and keeps the best answer, so a second choice satisfied exactly can beat a
 * first choice only half-resembled.
 */
export function likeness(animal, berthTrait) {
  if (!animal || !berthTrait) return 0;
  const likes = animal.likes && animal.likes.length ? animal.likes : [animal.home];
  let best = 0;
  for (let i = 0; i < likes.length; i++) {
    const w = RANK_WEIGHT[i] !== undefined ? RANK_WEIGHT[i] : 0.5;
    const v = w * affinity(likes[i], berthTrait);
    if (v > best) best = v;
  }
  return best;
}

/** Which of the animal's likes the berth actually answers, or null. Used for labels. */
export function likeRank(animal, berthTrait) {
  if (!animal || !berthTrait) return -1;
  const likes = animal.likes && animal.likes.length ? animal.likes : [animal.home];
  return likes.indexOf(berthTrait);
}

/** The six berth slots on the deck, in the order run.js assigns traits to them. */
export const GATE_LAYOUT = ['tl', 'tm', 'tr', 'bl', 'bm', 'br'];

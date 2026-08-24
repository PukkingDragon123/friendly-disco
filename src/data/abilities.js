// What an animal is FOR.
//
// In the rescue levels an animal is not just cargo to be saved -- the ones you already
// carry can be put down and used. A brought animal is a tool with legs.
//
// Abilities are DERIVED from tags, not hand-written onto ninety rows. That is the same
// call as the trait likes: a table of (tag -> ability) in priority order means a new
// animal gets a sensible ability the moment its tags are right, and nothing rots when a
// tag changes. It also guarantees the ability MATCHES the animal, which is the only way
// the player can guess it without reading a manual: of course the ox smashes the rock,
// of course the beaver dams the water.
//
// Each ability clears one family of obstacle (see data/obstacles.js). The pairing is the
// puzzle: you look at what is in your way, then at who is on your boat.

const A = (id, name, icon, color, verb, blurb) => ({ id, name, icon, color, verb, blurb });

export const ABILITIES = [
  A('smash', 'Smash', 'paw', 'rust', 'SMASH',
    'Shoulders straight through rock, rubble and a barred gate.'),
  A('ferry', 'Ferry', 'wave', 'water3', 'FERRY',
    'Swims. Carries one other animal across deep water or a current.'),
  A('tunnel', 'Tunnel', 'shell', 'clay3', 'DIG',
    'Digs under mud, a landslide or a blocked path.'),
  A('lift', 'Lift', 'feather', 'sky', 'CARRY',
    'Flies one animal over a gap, a chasm or a flooded stretch.'),
  A('climb', 'Climb', 'peak', 'stone3', 'CLIMB',
    'Takes a cliff, a scree slope or a fallen trunk as if it were a path.'),
  A('graze', 'Graze', 'leaf', 'leaf3', 'EAT',
    'Eats a way through thorns, briar and creeper.'),
  A('rally', 'Rally', 'bell', 'gold', 'CALL',
    'Every animal of its own kind nearby comes when it calls.'),
  A('warm', 'Warmth', 'flame', 'orange', 'THAW',
    'Body heat enough to melt ice and take the sting out of a cold snap.'),
];

export const ABILITY_BY_ID = Object.freeze(
  ABILITIES.reduce((m, a) => { m[a.id] = a; return m; }, {}),
);

/**
 * Hand-set where the pairing has to be RIGHT rather than merely plausible.
 *
 * These are the animals the player meets first and reasons about most, so a derived
 * answer is not good enough: everybody knows a goat climbs and a mole digs, and getting
 * that wrong once costs more trust than getting forty obscure ones right earns.
 */
const OVERRIDE = {
  goat: 'climb', mountaingoat: 'climb', ibex: 'climb', marmot: 'climb', snowleopard: 'climb',
  sheep: 'rally', lamb: 'rally', chicken: 'rally', dove: 'lift', nightingale: 'rally',
  cow: 'smash', ox: 'smash', boar: 'smash', rhino: 'smash', buffalo: 'smash',
  pig: 'tunnel', mole: 'tunnel', badger: 'tunnel', armadillo: 'tunnel', pangolin: 'tunnel',
  beaver: 'ferry', otter: 'ferry', duck: 'ferry', platypus: 'ferry',
  camel: 'graze', locust: 'graze', tortoise: 'graze', tapir: 'graze', giraffe: 'graze',
  polarbear: 'warm', yak: 'warm', musk: 'warm', bison: 'warm',
  eagle: 'lift', condor: 'lift', owl: 'lift', raven: 'lift',
};

/**
 * Read in order. The list runs from the MOST specific tag to the least, because the
 * generic body-size words match almost everything: with `bovine` above `herd` a sheep
 * came out as a battering ram.
 */
const TAG_ABILITY = [
  ['polar', 'warm'],
  ['climber', 'climb'],
  ['fish', 'ferry'],
  ['aquatic', 'ferry'],
  ['digging', 'tunnel'],
  ['rodent', 'tunnel'],
  ['venomous', 'graze'],
  ['insect', 'graze'],
  ['flying', 'lift'],
  ['bird', 'lift'],
  ['pachyderm', 'smash'],
  ['armored', 'smash'],
  ['swimming', 'ferry'],
  ['equine', 'smash'],
  ['bovine', 'smash'],
  ['big', 'smash'],
  ['herbivore', 'graze'],
  ['herd', 'rally'],
  ['pack', 'rally'],
  ['social', 'rally'],
];

/** The ability this animal brings to a rescue. Never null. */
export function abilityOf(animal) {
  if (!animal) return ABILITY_BY_ID.rally;
  const forced = OVERRIDE[animal.id];
  if (forced) return ABILITY_BY_ID[forced];
  const tags = animal.tags || [];
  for (const [tag, ab] of TAG_ABILITY) {
    if (tags.indexOf(tag) >= 0) return ABILITY_BY_ID[ab];
  }
  // last resort: what it wants tells you what it can cope with
  const likes = animal.likes || [];
  if (likes.indexOf('lofty') >= 0) return ABILITY_BY_ID.climb;
  if (likes.indexOf('frozen') >= 0) return ABILITY_BY_ID.warm;
  if (likes.indexOf('briny') >= 0 || likes.indexOf('soaked') >= 0) return ABILITY_BY_ID.ferry;
  return ABILITY_BY_ID.rally;
}

/** How strong the ability is, from the animal's mass. Bigger shoves harder. */
export function abilityPower(animal) {
  const m = (animal && animal.mass) || 1;
  return Math.max(1, Math.round(m * 2.4));
}

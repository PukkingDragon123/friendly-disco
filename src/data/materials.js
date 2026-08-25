// WHAT THE ANIMALS ON BOARD ARE FOR, besides being alive.
//
// A rescued animal used to be a number: it went in the hold and came out as a score. That
// is a fine thing for a roguelike to do once, but it means the deck has no texture -- six
// saved animals are six saved animals and it never matters which six.
//
// So animals on the ark PRODUCE. A sheep gives wool on the crossing, a cow gives milk, a
// bird gives a feather. Clay dolls are made out of that (see data/dolls.js), so the animals
// you saved on the last island are literally what you herd the next island with. That is
// the loop the whole game hangs off, and it is why a berth spent on a llama rather than a
// lizard is a decision rather than a preference.
//
// Materials are DERIVED FROM TAGS, exactly like abilities are, for the same reason: a
// table of (tag -> material) means a new animal produces something sensible the moment its
// tags are right, and nothing rots when a tag changes. It also means the player can guess
// it, which is the only way a crafting system is ever pleasant.

export const MATERIALS = [
  { id: 'clay', name: 'Clay', icon: 'shell', color: 'clay3', blurb: 'The golem sheds it. Everything starts here.' },
  { id: 'wool', name: 'Wool', icon: 'leaf', color: 'cream', blurb: 'Warm, and it takes a shape and keeps it.' },
  { id: 'milk', name: 'Milk', icon: 'wave', color: 'white', blurb: 'Mixed into the clay it stops a doll cracking.' },
  { id: 'feather', name: 'Feather', icon: 'feather', color: 'sky', blurb: 'What a doll needs if it is going to carry a sound.' },
  { id: 'hide', name: 'Hide', icon: 'paw', color: 'wood2', blurb: 'Tough enough to stand in a river all day.' },
  { id: 'wax', name: 'Wax', icon: 'flame', color: 'gold', blurb: 'It holds a flame, and a flame holds off the dark.' },
  { id: 'scale', name: 'Scale', icon: 'shell', color: 'teal', blurb: 'Harder than stone at the edge. Good for breaking things.' },
  { id: 'fang', name: 'Fang', icon: 'paw', color: 'bone', blurb: 'A predator leaves one behind. Other predators notice.' },
];

export const MATERIAL_BY_ID = Object.freeze(
  MATERIALS.reduce((m, x) => { m[x.id] = x; return m; }, Object.create(null)),
);
export const MATERIAL_IDS = MATERIALS.map((m) => m.id);

/**
 * Read in order, most specific tag first. The first row that matches wins, so a bee is
 * wax rather than the generic insect scale, and a lion is a fang rather than a hide.
 */
const TABLE = [
  ['bee', 'wax'], ['wax', 'wax'],
  ['wool', 'wool'], ['sheep', 'wool'], ['fleece', 'wool'], ['camelid', 'wool'],
  ['dairy', 'milk'], ['cattle', 'milk'], ['goat', 'milk'],
  ['bird', 'feather'], ['feathered', 'feather'], ['flier', 'feather'],
  ['predator', 'fang'], ['carnivore', 'fang'],
  ['reptile', 'scale'], ['fish', 'scale'], ['scaled', 'scale'], ['insect', 'scale'],
  ['big', 'hide'], ['mammal', 'hide'],
];

/** What does this animal give on a crossing? Everything gives something. */
export function materialOf(animal) {
  const tags = (animal && animal.tags) || [];
  for (const [tag, mat] of TABLE) if (tags.includes(tag)) return mat;
  return 'clay';
}

/**
 * The whole deck's yield for one crossing.
 *
 * One unit per animal, plus a bonus unit for anything rare or better -- so a legendary in a
 * berth pays for itself in dolls as well as in points.
 */
export function yieldFor(ids, byId) {
  const out = Object.create(null);
  for (const id of ids) {
    const a = byId[id];
    if (!a) continue;
    const m = materialOf(a);
    out[m] = (out[m] || 0) + 1;
    if (a.rarity === 'rare' || a.rarity === 'legendary') out[m] += 1;
  }
  // the golem always sheds a little of himself, whatever else happened
  out.clay = (out.clay || 0) + 2;
  return out;
}

export function addMats(into, from) {
  for (const k of Object.keys(from)) into[k] = (into[k] || 0) + from[k];
  return into;
}

export function matsText(mats) {
  return MATERIAL_IDS.filter((k) => mats[k]).map((k) => `${mats[k]} ${k}`).join(' · ');
}

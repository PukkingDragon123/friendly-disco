// WHAT COMES DOWN IN THE STORM.
//
// The flood is a clock, not an opponent. A clock alone makes a stage about arithmetic --
// how many animals can I reach in ninety seconds -- and every stage plays the same way.
// What makes a field a decision is something on it that wants the opposite of what you
// want, so the storm drops things.
//
// They are all out of the same book as everything else here: the locust of the eighth
// plague, the raven Noah sent and did not get back, the serpent, Behemoth and Leviathan
// out of Job, the Nephilim, and the giant. None of them fight the golem -- he is not in
// danger and never was. They frighten animals, which is worse, because a frightened animal
// runs the wrong way.
//
// `scare` is the radius in tiles at which an animal bolts. `speed` is tiles a second.
// `hunts` says what it goes after: 'animal' chases the nearest creature, 'wander' drifts,
// 'water' patrols the flood edge. `kill` is whether reaching an animal takes it off the
// board rather than just scattering it.

export const MONSTERS = [
  {
    id: 'locust', name: 'Locust Swarm',
    blurb: 'A brown cloud that eats the ground it passes over.',
    body: ['wood0', 'brass0', 'brass1'], eye: 'red2',
    size: 0.8, scare: 2.6, speed: 1.9, hunts: 'wander', kill: false,
    weight: 3, biomes: ['grassland', 'desert', 'jungle'],
  },
  {
    id: 'raven', name: 'The Raven',
    blurb: 'Sent out once and never came back. It has been busy.',
    body: ['ink', 'shadow', 'purple0'], eye: 'gold',
    size: 0.7, scare: 3.4, speed: 2.6, hunts: 'animal', kill: false,
    weight: 3, biomes: null,
  },
  {
    id: 'serpent', name: 'Field Serpent',
    blurb: 'Low in the grass, and patient about it.',
    body: ['leaf0', 'leaf1', 'moss'], eye: 'gold',
    size: 0.9, scare: 2.2, speed: 1.5, hunts: 'animal', kill: true,
    weight: 2, biomes: ['grassland', 'jungle', 'swamp'],
  },
  {
    id: 'leviathan', name: 'Leviathan',
    blurb: 'Whatever the water reaches, it can reach.',
    body: ['water0', 'water1', 'water3'], eye: 'ice',
    size: 1.5, scare: 4.2, speed: 2.2, hunts: 'water', kill: true,
    weight: 2, biomes: ['coral', 'swamp', 'storm', 'ruins'],
  },
  {
    id: 'behemoth', name: 'Behemoth',
    blurb: 'Slow. Does not turn aside. Drinks a river without noticing.',
    body: ['clay0', 'bark', 'wood1'], eye: 'orange',
    size: 1.7, scare: 4.6, speed: 0.9, hunts: 'animal', kill: true,
    weight: 1, biomes: ['mountain', 'volcano', 'grassland'],
  },
  {
    id: 'nephil', name: 'Nephilim',
    blurb: 'Tall, and looking for something it lost a long time ago.',
    body: ['purple0', 'purple1', 'cloth2'], eye: 'magic2',
    size: 1.4, scare: 5.0, speed: 1.4, hunts: 'animal', kill: false,
    weight: 1, biomes: ['ruins', 'storm', 'peak', 'sacred'],
  },
  {
    id: 'goliath', name: 'Goliath',
    blurb: 'Armoured, bored, and enormous.',
    body: ['brass0', 'brass1', 'stone3'], eye: 'red2',
    size: 1.6, scare: 4.0, speed: 1.1, hunts: 'animal', kill: true,
    weight: 1, biomes: ['desert', 'ruins', 'mountain'],
  },
];

export const MONSTER_BY_ID = Object.freeze(
  MONSTERS.reduce((m, x) => { m[x.id] = x; return m; }, Object.create(null)),
);

/** Which monsters can land on this island, with their weights. */
export function tableFor(island) {
  const biome = island && island.biome;
  const out = [];
  for (const m of MONSTERS) {
    if (m.biomes && biome && !m.biomes.includes(biome)) continue;
    for (let i = 0; i < m.weight; i++) out.push(m);
  }
  return out.length ? out : MONSTERS.slice();
}

/** Pick one for a strike. */
export function rollMonster(rng, island) {
  const table = tableFor(island);
  return table[rng.int(table.length)];
}

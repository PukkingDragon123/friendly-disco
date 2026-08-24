// The islands.
//
// Eleven biomes. Each one is a PLACE first and a level second: it has its own ground and
// sky, its own scenery on the horizon, its own weather, its own animals, and its own two
// or three obstacle kinds. You should be able to tell where you are with the HUD off.
//
// The obstacle list is the important part. A biome that draws from `obstacles: [rock,
// thorns]` will always ask you for SMASH and GRAZE, which means the roster you keep on
// the boat is a real decision made several islands in advance -- and it means an island
// can be read at a glance from the map before you commit to sailing there.
//
// `rock`, `relief` and `steep` are the island's SILHOUETTE on the map, kept separate from
// `ground` because the two answer different questions: ground is what a rescue is played
// on, and for the coral shallows that is ankle-deep water -- which drawn as a mountain
// gave us a pink circus tent on the horizon. rock is bottom-to-summit, lit from the top;
// relief is how tall it stands; steep is 0.2 for a mesa and 1.1 for a peak.
//
// `scenery` is a small vocabulary the island renderer knows how to draw. Keeping it as
// names rather than as coordinates is what lets one renderer serve eleven biomes without
// eleven special cases.

const I = (id, o) => Object.assign({ id, danger: 1, reward: 1 }, o);

export const ISLANDS = [
  I('meadow', {
    name: 'Green Reach',
    biome: 'grassland',
    blurb: 'Long grass, a stone wall, and more animals than anywhere else.',
    ground: ['leaf1', 'leaf2', 'moss'],
    rock: ['leaf1', 'leaf2', 'leaf3'], relief: 0.72, steep: 0.5,
    sky: ['sky', 'ice', 'cream'],
    scenery: ['hills', 'wall', 'tree', 'flowers'],
    weather: 'clear',
    obstacles: ['rock', 'thorns'],
    likes: ['tame', 'bushy', 'warm'],
    animals: 6,
    danger: 1,
    reward: 1,
  }),
  I('jungle', {
    name: 'The Green Deep',
    biome: 'jungle',
    blurb: 'Canopy so thick the ground never dries. Everything here bites.',
    ground: ['cloth0', 'leaf0', 'leaf1'],
    rock: ['leaf0', 'leaf1', 'leaf3'], relief: 0.95, steep: 0.62,
    sky: ['leaf1', 'moss', 'sand'],
    scenery: ['bigtrees', 'vines', 'waterfall', 'mist'],
    weather: 'rain',
    obstacles: ['thorns', 'log', 'mud'],
    likes: ['bushy', 'soaked', 'gloomy'],
    animals: 6,
    danger: 2,
    reward: 2,
  }),
  I('desert', {
    name: 'The Long Glare',
    biome: 'desert',
    blurb: 'Rock, heat, and a wind that has been going for a hundred years.',
    ground: ['sand', 'brass1', 'rust'],
    rock: ['rust', 'sand', 'cream'], relief: 0.6, steep: 0.28,
    sky: ['amber', 'sand', 'cream'],
    scenery: ['dunes', 'mesa', 'bones', 'cactus'],
    weather: 'heat',
    obstacles: ['rock', 'wind'],
    likes: ['dusty', 'warm', 'lofty'],
    animals: 5,
    danger: 2,
    reward: 2,
  }),
  I('swamp', {
    name: 'Blackwater',
    biome: 'swamp',
    blurb: 'You can hear it swallowing. Do not put anything down.',
    ground: ['cloth0', 'moss', 'water0'],
    rock: ['cloth0', 'moss', 'leaf2'], relief: 0.5, steep: 0.4,
    sky: ['grey1', 'moss', 'bone'],
    scenery: ['deadtrees', 'reeds', 'fog', 'lilies'],
    weather: 'fog',
    obstacles: ['mud', 'deep', 'thorns'],
    likes: ['soaked', 'gloomy', 'bushy'],
    animals: 5,
    danger: 3,
    reward: 2,
  }),
  I('snow', {
    name: 'The White Shelf',
    biome: 'snow',
    blurb: 'Flat, bright, and every surface is trying to move you along.',
    ground: ['snow1', 'snow0', 'ice'],
    rock: ['snow0', 'snow1', 'white'], relief: 0.62, steep: 0.34,
    sky: ['ice', 'sky', 'white'],
    scenery: ['bergs', 'pines', 'aurora', 'drifts'],
    weather: 'snow',
    obstacles: ['ice', 'cliff'],
    likes: ['frozen', 'lofty', 'briny'],
    animals: 5,
    danger: 3,
    reward: 2,
  }),
  I('volcano', {
    name: 'The Forge',
    biome: 'volcano',
    blurb: 'Nothing here can be cleared. You go round, or you do not go.',
    ground: ['ash', 'stone0', 'lava0'],
    rock: ['ink', 'ash', 'stone1'], relief: 1.0, steep: 0.95,
    sky: ['lava0', 'rust', 'ash'],
    scenery: ['cone', 'lavafall', 'embers', 'obsidian'],
    weather: 'ash',
    obstacles: ['lava', 'rock', 'rubble'],
    likes: ['warm', 'dusty', 'gloomy'],
    animals: 4,
    danger: 4,
    reward: 3,
  }),
  I('ruins', {
    name: 'The Drowned City',
    biome: 'ruins',
    blurb: 'Somebody built all this. The water is most of the way through it.',
    ground: ['stone1', 'stone2', 'moss'],
    rock: ['stone0', 'stone1', 'stone3'], relief: 0.7, steep: 0.45,
    sky: ['purple0', 'water2', 'sand'],
    scenery: ['columns', 'arch', 'statue', 'rubblefield'],
    weather: 'clear',
    obstacles: ['rubble', 'gap', 'deep'],
    likes: ['gloomy', 'lofty', 'soaked'],
    animals: 5,
    danger: 3,
    reward: 3,
  }),
  I('coral', {
    name: 'The Bright Shallows',
    biome: 'coral',
    blurb: 'Ankle-deep and beautiful, until the channel drops away.',
    ground: ['water3', 'foam', 'sand'],
    rock: ['sand', 'stone3', 'cream'], relief: 0.3, steep: 0.22,
    sky: ['ice', 'foam', 'white'],
    scenery: ['coralheads', 'palms', 'sandbar', 'shoals'],
    weather: 'clear',
    obstacles: ['deep', 'current'],
    likes: ['briny', 'soaked', 'warm'],
    animals: 6,
    danger: 2,
    reward: 2,
  }),
  I('storm', {
    name: 'Under the Anvil',
    biome: 'storm',
    blurb: 'The cloud has not moved off this rock in living memory.',
    ground: ['stone0', 'ash', 'water0'],
    rock: ['ink', 'stone0', 'stone2'], relief: 0.9, steep: 1.05,
    sky: ['night', 'shadow', 'grey0'],
    scenery: ['anvilcloud', 'spires', 'rainsheet', 'surf'],
    weather: 'storm',
    obstacles: ['bolt', 'wind', 'current'],
    likes: ['lofty', 'briny', 'gloomy'],
    animals: 4,
    danger: 4,
    reward: 3,
  }),
  I('peak', {
    name: 'The Last High Ground',
    biome: 'mountain',
    blurb: 'The tallest thing left. Everything alive is trying to get up here.',
    ground: ['stone2', 'stone1', 'snow0'],
    rock: ['stone1', 'stone2', 'snow1'], relief: 1.0, steep: 1.1,
    sky: ['sky', 'purple1', 'gold'],
    scenery: ['ridges', 'snowcap', 'clouds', 'eyrie'],
    weather: 'wind',
    obstacles: ['cliff', 'ice', 'gap'],
    likes: ['lofty', 'frozen', 'dusty'],
    animals: 5,
    danger: 4,
    reward: 3,
  }),
  I('sacred', {
    name: 'The Quiet Island',
    biome: 'sacred',
    blurb: 'No weather. No hazard. Something is keeping it that way.',
    ground: ['cream', 'sand', 'leaf3'],
    rock: ['sand', 'cream', 'white'], relief: 0.55, steep: 0.5,
    sky: ['gold', 'cream', 'white'],
    scenery: ['gate', 'olives', 'rays', 'stillwater'],
    weather: 'holy',
    obstacles: [],
    likes: ['bushy', 'warm', 'tame'],
    animals: 4,
    danger: 0,
    reward: 4,
    sanctuary: true,
  }),
];

export const ISLAND_BY_ID = Object.freeze(
  ISLANDS.reduce((m, i) => { m[i.id] = i; return m; }, {}),
);

/**
 * CHERUBIM ISLAND. Not in the list above, because it is not a rescue: it is the door to
 * Eden, and the only place in the ocean where nothing is trying to kill you.
 */
export const CHERUBIM = Object.freeze({
  id: 'cherubim',
  name: 'Cherubim Rock',
  biome: 'sacred',
  blurb: 'A gate, two guardians, and the way through to the garden.',
  ground: ['cream', 'sand', 'gold'],
  rock: ['stone2', 'cream', 'white'], relief: 0.66, steep: 0.4,
  sky: ['magic1', 'sky', 'cream'],
  scenery: ['gate', 'rays', 'stillwater'],
  weather: 'holy',
  obstacles: [],
  likes: [],
  animals: 0,
  danger: 0,
  reward: 0,
  teleport: true,
});

/** Every obstacle kind any island can throw at you. Used by the tests. */
export function allObstacleKinds() {
  const out = new Set();
  for (const i of ISLANDS) for (const o of i.obstacles) out.add(o);
  return [...out];
}

/**
 * Roll the three destinations for one leg of the voyage.
 *
 * Always: one island at or below the current danger, one above it, and -- from the second
 * leg on, and never twice in a row -- Cherubim Rock. That shape is the whole route
 * decision: a safe haul, a risky haul, and the option to bank what you have.
 */
export function rollLeg(rng, o = {}) {
  const leg = o.leg || 1;
  const wantDanger = Math.min(4, 1 + Math.floor(leg / 2));
  const pool = ISLANDS.filter((i) => !o.exclude || o.exclude.indexOf(i.id) < 0);
  const safe = pool.filter((i) => i.danger <= wantDanger);
  const risky = pool.filter((i) => i.danger > wantDanger);
  const out = [];
  if (safe.length) out.push(rng.pick(safe));
  if (risky.length) out.push(rng.pick(risky));
  else if (safe.length > 1) out.push(rng.pick(safe.filter((i) => i !== out[0])));
  if (leg >= 2 && !o.lastWasCherubim) out.push(CHERUBIM);
  else {
    const rest = pool.filter((i) => out.indexOf(i) < 0);
    if (rest.length) out.push(rng.pick(rest));
  }
  return out.slice(0, 3);
}

// BLESSED CLAY BEASTS. What a tamed animal becomes when the golem shares his own clay.
//
// THEY ARE THE TOWERS, and the whole reason the island plays as a defence rather than a
// chase. You plant them on the field for clay, they hold their row, and each one does
// exactly one thing -- which is the only way a tower defence stays legible.
//
// NO NEW ART. A blessed beast is the animal's own sprite tinted toward clay with a glow on
// it, and a corrupted beast is the same sprite tinted toward the deep. One sprite system,
// three states: wild, corrupted, blessed. That is not a shortcut -- it is the point. When
// you defeat a corrupted lion and tame it, the lion you plant next wave is visibly the same
// lion, and you can see it is the same lion.
//
// `base` names the animal the beast is made from, so a run's roster and its towers are the
// same list. `kind` is the one thing it does, and the words are closed:
//
//   gen     makes clay on a timer                      (the economy)
//   shoot   fires down its own row                     (the damage)
//   wall    high health, no attack                     (the time)
//   aoe     hits everything in a small area            (the crowds)
//   slow    everything in its row moves slower         (the tempo)
//   spawn   sends out little chasers                   (the pressure)
//   pad     lets you plant on water                    (the geometry)
//
// Two of them carry a second word because the fight grew something they had to answer:
// `pierce` ignores armour and crust, and `knock` shoves whatever it hits back down the row.
//
// Costs are in CLAY, which is the mana. They are tuned in fifties like Plants vs Zombies
// because the arithmetic has to be doable in your head while something is walking at you.

export const BEASTS = [
  {
    id: 'well', name: 'Clay Well', base: 'pig', kind: 'gen',
    cost: 50, hp: 60, rate: 7, amount: 25, tier: 1,
    blurb: 'Sits down and keeps making more of you.',
    rule: '+25 clay every 7s.',
  },
  {
    id: 'reed', name: 'Reed Lily', base: 'duck', kind: 'pad',
    cost: 25, hp: 40, tier: 1,
    blurb: 'Floats. Something else can stand on it.',
    rule: 'Lets you plant on water.',
  },
  {
    id: 'boar', name: 'Bulwark Boar', base: 'boar', kind: 'wall',
    cost: 50, hp: 420, tier: 1,
    blurb: 'Will not be moved. Has never once been moved.',
    rule: 'A great deal of health and no attack at all.',
  },
  {
    id: 'thorn', name: 'Thorn Ox', base: 'ox', kind: 'shoot',
    cost: 100, hp: 90, rate: 1.2, damage: 30, speed: 340, tier: 1,
    blurb: 'Spits a thorn the length of the field.',
    rule: 'Hits the first thing in its row.',
  },
  {
    id: 'ember', name: 'Ember Goat', base: 'goat', kind: 'aoe',
    cost: 150, hp: 80, rate: 2.0, damage: 30, radius: 1.4, tier: 1,
    blurb: 'Stamps, and the ground remembers it.',
    rule: 'Hits everything within a tile and a half.',
  },
  {
    id: 'bell', name: 'Bell Ewe', base: 'sheep', kind: 'slow',
    cost: 175, hp: 90, rate: 1.6, slow: 0.45, tier: 1,
    blurb: 'Rings once and everything in the row loses its nerve.',
    rule: 'Everything in its row moves at 55%.',
  },
  {
    id: 'thistle', name: 'Thistle Ram', base: 'ibex', kind: 'wall',
    cost: 100, hp: 260, spike: 15, tier: 2,
    blurb: 'Anything that bites it, bleeds.',
    rule: 'A wall that hurts whatever is chewing on it.',
  },
  {
    id: 'owl', name: 'Watch Owl', base: 'owl', kind: 'shoot',
    cost: 200, hp: 80, rate: 1.1, damage: 34, speed: 460, far: true, tier: 2,
    blurb: 'Takes the one at the back, because that is the one with time.',
    rule: 'Hits the FURTHEST thing in its row, hard.',
  },
  {
    id: 'hive', name: 'Hive Bear', base: 'brownbear', kind: 'spawn',
    cost: 200, hp: 140, rate: 3.4, damage: 14, tier: 2,
    blurb: 'Keeps bees. The bees are not friendly to anybody else.',
    rule: 'Sends out a bee that chases the nearest beast.',
  },
  {
    id: 'maul', name: 'Maul Rhino', base: 'rhino', kind: 'shoot',
    cost: 150, hp: 120, rate: 1.0, damage: 26, speed: 300, pierce: true, tier: 2,
    blurb: 'Does not care what you are wearing.',
    rule: 'Hits the first thing in its row and IGNORES armour.',
  },
  {
    id: 'tide', name: 'Tide Walrus', base: 'walrus', kind: 'aoe',
    cost: 175, hp: 150, rate: 2.4, damage: 16, radius: 1.3, knock: 0.85, tier: 2,
    blurb: 'Comes down like a wave, and everything goes back with it.',
    rule: 'Shoves everything near it back down the row.',
  },
];

/* ------------------------------------------------------------------- the summons

WHAT A BOATLOAD OF ORDINARY ANIMALS ADDS UP TO. One per myth (see data/summons.js), earned
by having a COLLECTION rather than by taming any one thing, and every one of them is the
best card in the deck at what it does. They are expensive on purpose: a summon should be a
decision about a whole board, not a card you drop in a gap.

They are built out of exactly the same seven kinds as everything else. A mythic beast that
needed its own mechanic in the lane loop would be a second game bolted onto the first.
*/
export const MYTHIC = [
  {
    id: 'qilin_beast', name: 'Qilin', base: 'qilin', kind: 'gen', mythic: true,
    cost: 200, hp: 220, rate: 6, amount: 95, tier: 4,
    blurb: 'Where it stands, the ground gives.',
    rule: '+95 clay every 6s. The best well there is.',
  },
  {
    id: 'thunder_beast', name: 'Thunderbird', base: 'thunderbird', kind: 'shoot', mythic: true,
    cost: 300, hp: 180, rate: 1.3, damage: 72, speed: 520, far: true, pierce: true, tier: 4,
    blurb: 'The storm has wings, and it is looking down.',
    rule: 'Hits the FURTHEST thing in its row for 72, through armour.',
  },
  {
    id: 'bakunawa_beast', name: 'Bakunawa', base: 'kraken', kind: 'aoe', mythic: true,
    cost: 325, hp: 260, rate: 2.1, damage: 46, radius: 2.4, knock: 1.7, tier: 4,
    blurb: 'It swallowed six moons and gave one back.',
    rule: 'Swallows everything within two and a half tiles and spits it backwards.',
  },
  {
    id: 'anansi_beast', name: 'Anansi', base: 'scarab', kind: 'wall', mythic: true,
    cost: 225, hp: 620, spike: 48, tier: 4,
    blurb: 'Never the strongest thing in the story. Wins anyway.',
    rule: 'A web nothing gets through, and it bites back hard.',
  },
  {
    id: 'sleipnir_beast', name: 'Sleipnir', base: 'unicorn', kind: 'aoe', mythic: true,
    cost: 275, hp: 340, rate: 2.6, damage: 24, radius: 1.7, knock: 2.4, tier: 4,
    blurb: 'Eight legs, because four was not going to do it.',
    rule: 'Kicks the whole row back down the field.',
  },
  {
    id: 'simurgh_beast', name: 'Simurgh', base: 'phoenix', kind: 'spawn', mythic: true,
    cost: 300, hp: 240, rate: 1.9, damage: 42, twin: true, tier: 4,
    blurb: 'Has watched the world end three times.',
    rule: 'Two burning feathers at a time, and they chase.',
  },
  {
    id: 'kitsune_beast', name: 'Kitsune', base: 'fox', kind: 'slow', mythic: true,
    cost: 250, hp: 200, rate: 1.4, slow: 0.18, tier: 4,
    blurb: 'One tail a century, and it is not counting out loud.',
    rule: 'Everything in its row nearly stops.',
  },
];

// ONE INDEX FOR BOTH. The tray, resolveBeast and every test look a beast up by id and do
// not care where it came from; a summon is just a card you cannot buy.
export const ALL_BEASTS = BEASTS.concat(MYTHIC);
export const BEAST_BY_ID = Object.freeze(
  ALL_BEASTS.reduce((m, b) => { m[b.id] = b; return m; }, Object.create(null)),
);
export const BEAST_IDS = BEASTS.map((b) => b.id);
export const MYTHIC_IDS = MYTHIC.map((b) => b.id);

/**
 * The four you always have.
 *
 * The reed is in there for a reason that is not generosity: a water row with no reed in the
 * hand cannot be planted in AT ALL, which makes it a free lane straight to the ark. That is
 * not difficulty, it is an unwinnable board handed out by a coin flip on the map.
 */
export const STARTER_BEASTS = ['well', 'reed', 'boar', 'thorn'];

/**
 * TOWER-DEFENCE UPGRADES. One line per beast, bought once, permanent for the run.
 *
 * Deliberately not a tree. A tree is a second game to learn on top of the first one; one
 * upgrade per beast is a decision you can make in four seconds between waves, which is the
 * pace this needs.
 */
export const UPGRADES = {
  well: { name: 'Deep Well', cost: 8, blurb: 'Makes 40 instead of 25.', apply: (b) => { b.amount = 40; } },
  boar: { name: 'Ironhide', cost: 8, blurb: 'Half again as much health.', apply: (b) => { b.hp = Math.round(b.hp * 1.5); } },
  thistle: { name: 'Long Thistles', cost: 10, blurb: 'Bites back twice as hard.', apply: (b) => { b.spike = Math.round(b.spike * 2); } },
  thorn: { name: 'Twin Thorns', cost: 10, blurb: 'Fires twice as often.', apply: (b) => { b.rate *= 0.5; } },
  ember: { name: 'Deep Embers', cost: 10, blurb: 'Wider, and it hurts more.', apply: (b) => { b.radius = 2.1; b.damage += 10; } },
  bell: { name: 'Great Bell', cost: 10, blurb: 'Slows to a third.', apply: (b) => { b.slow = 0.32; } },
  owl: { name: 'Night Eyes', cost: 12, blurb: 'Half again the damage.', apply: (b) => { b.damage = Math.round(b.damage * 1.5); } },
  hive: { name: 'Second Hive', cost: 12, blurb: 'Two bees at a time.', apply: (b) => { b.twin = true; } },
  maul: { name: 'Long Horn', cost: 12, blurb: 'Half again the damage, and faster.', apply: (b) => { b.damage = 40; b.rate = 0.8; } },
  tide: { name: 'Spring Tide', cost: 12, blurb: 'Shoves twice as far.', apply: (b) => { b.knock = 1.7; b.radius = 1.6; } },
  reed: { name: 'Broad Reed', cost: 6, blurb: 'Tougher, and free to plant.', apply: (b) => { b.hp = 90; b.cost = 0; } },
};

/**
 * A beast, resolved against the run's upgrades.
 *
 * The definitions above are frozen data; this hands back a mutable copy with the run's
 * upgrades applied, so nothing anywhere can accidentally tune the table for every future
 * run in the same session.
 */
export function resolveBeast(id, bought) {
  const def = BEAST_BY_ID[id];
  if (!def) return null;
  const out = Object.assign({}, def);
  if (bought && bought.indexOf(id) >= 0 && UPGRADES[id]) {
    UPGRADES[id].apply(out);
    out.upgraded = true;
    out.name = UPGRADES[id].name;
  }
  return out;
}

export function costText(b) { return `${b.cost} clay`; }

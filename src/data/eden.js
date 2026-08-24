// THE GARDEN OF EDEN — the shop.
//
// Between blinds the ark ties up at the last dry ground in the world, and everything on
// it wants paying. Four traders, and each one is a different KIND of transaction:
//
//   THE SERPENT sells apples. An apple is not an animal, it is a LURE and a rarity
//   table: you buy the odds, plant it, and something comes out of the bush. Six kinds,
//   from a 3-coin windfall apple that only ever draws hedgerow commons up to an
//   enchanted one that nothing common will go near, plus two that are cheap because
//   they cost you something other than money.
//
//   ADAM and EVE give tools and relics -- the permanent engine pieces -- and they are
//   the only trader whose stock is free to LOOK at: every ability is printed on the
//   card, because a relic you cannot read is a relic you cannot build around.
//
//   THE CHERUBIM at the gate trade blessings drawn from the tarot. A blessing lasts
//   exactly ONE ROUND. They are deliberately large -- doubling a mult, refunding a
//   shot, freezing the flood -- because a one-round effect that is merely useful is
//   not worth the walk over.
//
// The feeding fee is the shop's real economy. Animals do not come out of a bush because
// you own an apple; they come out because the apple is food and they are hungry. So the
// apple is the entry price and the LURE is a second, per-reveal cost that scales with
// what came out. A legendary knows what it is worth.

import { rollAnimal, ANIMAL_BY_ID, RARITY_ORDER } from './animals.js';
import { HABITAT_BY_ID } from './habitats.js';

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

/* ------------------------------------------------------------------ apples */

/**
 * Six apples. `odds` is a rarity table over RARITY_ORDER and must sum to 1; `lure` is
 * the multiplier on the feeding fee charged when you actually take the animal.
 *
 * Balance: a common animal costs 3 at a normal trader, a legendary 9-10. A plain apple
 * plus its lure lands around 4-5 for a common, so buying blind is slightly worse than
 * buying a known animal -- which is correct, you are paying for the CHANCE. The golden
 * and enchanted apples are priced above their expected animal, and are still worth it,
 * because three choices out of a rare-weighted table is how you actually find the piece
 * your engine is missing.
 */
export const APPLES = [
  {
    id: 'plain',
    name: 'Common Apple',
    short: 'COMMON',
    price: 3,
    lure: 1,
    color: 'red2',
    icon: 'heart',
    odds: { common: 0.72, uncommon: 0.23, rare: 0.05, legendary: 0 },
    desc: 'Whatever is in the hedgerow. Nothing rare comes to a common apple.',
    flavor: 'It is an apple. He is very insistent that it is just an apple.',
  },
  {
    id: 'golden',
    name: 'Golden Apple',
    short: 'GOLDEN',
    price: 9,
    lure: 1.4,
    color: 'gold',
    icon: 'star',
    odds: { common: 0.14, uncommon: 0.34, rare: 0.38, legendary: 0.14 },
    desc: 'The good stock. Rare and legendary both become likely.',
    flavor: 'Heavier than it looks, and warm.',
  },
  {
    id: 'enchanted',
    name: 'Enchanted Apple',
    short: 'ENCHANT',
    price: 13,
    lure: 1.6,
    color: 'purple1',
    icon: 'gem',
    odds: { common: 0, uncommon: 0.18, rare: 0.48, legendary: 0.34 },
    desc: 'Nothing common will go near it. Legendaries often will.',
    flavor: 'It hums, and the hum is in a key that does not exist.',
    glint: true,
  },
  {
    id: 'cursed',
    name: 'Cursed Apple',
    short: 'CURSED',
    price: 4,
    lure: 1,
    color: 'purple0',
    icon: 'skull',
    odds: { common: 0.08, uncommon: 0.24, rare: 0.42, legendary: 0.26 },
    curse: true,
    desc: 'Rare odds for a pittance. What comes out is CURSED: −1 Mult, forever.',
    flavor: 'The serpent will not touch this one himself. He uses a stick.',
  },
  {
    id: 'poison',
    name: 'Poison Apple',
    short: 'POISON',
    price: 2,
    lure: 0.6,
    color: 'green0',
    icon: 'drop',
    odds: { common: 0.36, uncommon: 0.34, rare: 0.22, legendary: 0.08 },
    poison: true,
    desc: 'Cheap, and cheap to lure. One animal already aboard does not survive it.',
    flavor: 'Two of everything, he points out. You can spare one of something.',
  },
  {
    id: 'blessed',
    name: 'Blessed Apple',
    short: 'BLESSED',
    price: 14,
    lure: 1.5,
    color: 'ice',
    icon: 'feather',
    odds: { common: 0.08, uncommon: 0.28, rare: 0.42, legendary: 0.22 },
    blessed: true,
    desc: 'What comes out arrives already fed: +30 Chips and +1 Mult, permanently.',
    flavor: 'He is furious that he has to stock it at all.',
  },
];

export const APPLE_BY_ID = Object.freeze(
  APPLES.reduce((acc, a) => { acc[a.id] = a; return acc; }, {}),
);

/** The feeding fee for taking a particular animal out of a particular bush. */
export function lureCost(apple, animal) {
  if (!animal) return 0;
  const base = { common: 2, uncommon: 3, rare: 5, legendary: 7 }[animal.rarity] || 2;
  return Math.max(1, Math.round(base * num(apple && apple.lure, 1)));
}

/**
 * Plant an apple: roll the rarity off its table, then draw THREE animals of that
 * rarity for the player to choose one of.
 *
 * The rarity is rolled once for the whole bush rather than per animal, because that is
 * what makes the reveal work: the bush shakes, the eye opens, and the eye's colour has
 * already told you what tier you are choosing from before you see any of the three.
 */
export function rollBush(rng, appleId, o = {}) {
  const apple = APPLE_BY_ID[appleId] || APPLES[0];
  const table = [];
  for (const r of RARITY_ORDER) {
    const w = num(apple.odds[r], 0);
    if (w > 0) table.push([r, w]);
  }
  const rarity = table.length && rng && rng.weighted ? rng.weighted(table) : 'common';

  const exclude = (o.exclude || []).slice();
  const picks = [];
  for (let i = 0; i < 3; i++) {
    const a = rollAnimal(rng, { rarity, exclude: exclude.concat(picks.map((p) => p.id)) });
    if (a) picks.push(a);
  }
  // A pool can run dry at legendary; rather than show two cards, fall down a tier so
  // the player always gets the same three-way choice.
  let fallback = RARITY_ORDER.indexOf(rarity);
  while (picks.length < 3 && fallback > 0) {
    fallback--;
    const a = rollAnimal(rng, {
      rarity: RARITY_ORDER[fallback],
      exclude: exclude.concat(picks.map((p) => p.id)),
    });
    if (a) picks.push(a); else break;
  }
  return { apple, rarity, choices: picks };
}

/** Colour and label for a rarity, shared by the eye, the burst and the cards. */
export const RARITY_LOOK = Object.freeze({
  common: { color: 'grey2', glow: 'white', label: 'COMMON', stars: 1 },
  uncommon: { color: 'green1', glow: 'foam', label: 'UNCOMMON', stars: 2 },
  rare: { color: 'sky', glow: 'ice', label: 'RARE', stars: 3 },
  legendary: { color: 'gold', glow: 'white', label: 'LEGENDARY', stars: 4 },
});

/* -------------------------------------------------------------- blessings */

// The Cherubim keep the gate with a flaming sword, and they are bored. A blessing is a
// major-arcana card that lasts ONE ROUND -- the next blind and no further. That is the
// whole design constraint: because it expires, it is allowed to be enormous.
//
// `apply(run)` mutates the blind's effect or the run's tunables for one blind. run.js
// clears run.blessing at the end of the blind, so nothing here has to undo itself.
const B = (id, name, card, color, icon, price, desc, apply) => ({
  id, name, card, color, icon, price, desc, apply,
});

export const BLESSINGS = [
  B('fool', 'The Fool', '0', 'foam', 'dice', 4,
    'One extra shot, and the flood climbs slower to match.',
    (run) => { run.shotsLeft += 1; run.floodPerShot *= 0.8; }),
  B('magician', 'The Magician', 'I', 'purple1', 'gem', 5,
    'x1.5 Mult on every animal for the whole round.',
    (run) => { run.blessXMult = (run.blessXMult || 1) * 1.5; }),
  B('empress', 'The Empress', 'III', 'green1', 'leaf', 5,
    '+40 Chips for every animal, wherever it lands.',
    (run) => { run.blessChips = (run.blessChips || 0) + 40; }),
  B('hierophant', 'The Hierophant', 'V', 'brass3', 'scroll', 4,
    'Every berth counts as a FAVOURITE, however badly it fits.',
    (run) => { run.blessAllHome = true; }),
  B('lovers', 'The Lovers', 'VI', 'pink', 'heart', 4,
    'Interactions between your animals pay double.',
    (run) => { run.blessInteract = (run.blessInteract || 1) * 2; }),
  B('chariot', 'The Chariot', 'VII', 'sky', 'wheel', 3,
    'Two extra re-racks.',
    (run) => { run.reracksLeft += 2; }),
  B('strength', 'Strength', 'VIII', 'red2', 'paw', 5,
    'Every shot strikes at full power, whatever the gauge said.',
    (run) => { run.blessFullPower = true; }),
  B('hermit', 'The Hermit', 'IX', 'ice', 'moon', 4,
    'Money doubles at the end of the round.',
    (run) => { run.blessDoubleMoney = true; }),
  B('wheel', 'Wheel of Fortune', 'X', 'gold', 'dice', 4,
    'One random animal aboard becomes LEGENDARY for the round.',
    (run) => { run.blessGild = true; }),
  B('hanged', 'The Hanged Man', 'XII', 'water3', 'anchor', 3,
    'The flood does not rise at all on your first two shots.',
    (run) => { run.blessFloodGrace = 2; }),
  B('death', 'Death', 'XIII', 'purple0', 'skull', 6,
    'Sacrifice one animal aboard. Everything else gets x2 Mult.',
    (run) => { run.blessDeath = true; }),
  B('temperance', 'Temperance', 'XIV', 'teal', 'drop', 4,
    'No surge pools form on the felt this round.',
    (run) => { run.blessNoPools = true; }),
  B('tower', 'The Tower', 'XVI', 'orange', 'bolt', 5,
    'The first shot of the round scores three times.',
    (run) => { run.blessTripleFirst = true; }),
  B('star', 'The Star', 'XVII', 'white', 'star', 4,
    '+3 Mult for every rail the ball touched before it went in.',
    (run) => { run.blessRailMult = (run.blessRailMult || 0) + 3; }),
  B('moon', 'The Moon', 'XVIII', 'night', 'moon', 3,
    'Berths you cannot see still score: closed gates pay full.',
    (run) => { run.blessClosedPay = true; }),
  B('sun', 'The Sun', 'XIX', 'gold', 'sun', 6,
    '+$1 for every animal potted, and +100 Chips on the last shot.',
    (run) => { run.blessSunCoin = true; }),
  B('judgement', 'Judgement', 'XX', 'brass2', 'bell', 5,
    'Beat the target and the overflow is paid out as money.',
    (run) => { run.blessOverflowPay = true; }),
  B('world', 'The World', 'XXI', 'foam', 'compass', 7,
    'Every animal is CONTENT everywhere, and the target drops a tenth.',
    (run) => { run.blessAllHome = true; run.target = Math.round(run.target * 0.9); }),
];

export const BLESSING_BY_ID = Object.freeze(
  BLESSINGS.reduce((acc, b) => { acc[b.id] = b; return acc; }, {}),
);

/** Three blessings on offer, never the same card twice in one visit. */
export function rollBlessings(rng, n = 3, exclude = []) {
  const pool = BLESSINGS.filter((b) => exclude.indexOf(b.id) < 0);
  if (!rng || !rng.sample) return pool.slice(0, n);
  return rng.sample(pool, Math.min(n, pool.length));
}

/* --------------------------------------------------------------- the stalls */

/**
 * What the garden is offering this visit. Everything is rolled from one forked rng so
 * the same run at the same ante always sees the same garden -- rerolls are paid for and
 * advance the seed, they are not a free re-look.
 */
export function rollGarden(rng, o = {}) {
  const owned = o.ownedRelics || [];
  return {
    // the serpent's barrow: four of the six apples, always including one cheap one so
    // a broke player is never locked out of the bush entirely
    apples: pickApples(rng),
    blessings: rollBlessings(rng, 3, o.seenBlessings || []),
    relicIds: owned.slice(),
  };
}

function pickApples(rng) {
  const cheap = APPLES.filter((a) => a.price <= 4);
  const rest = APPLES.filter((a) => a.price > 4);
  if (!rng || !rng.sample) return APPLES.slice(0, 4);
  const out = rng.sample(cheap, 1).concat(rng.sample(rest, 2));
  const spare = APPLES.filter((a) => out.indexOf(a) < 0);
  if (spare.length) out.push(rng.pick(spare));
  return out;
}

/** For the poison apple: which animal aboard the serpent takes. */
export function poisonVictim(rng, run) {
  const list = (run && run.caravan) || [];
  if (!list.length) return null;
  // it takes something you would miss, but never your last animal
  if (list.length <= 1) return null;
  const ranked = list.slice().sort((a, b) => {
    const A = ANIMAL_BY_ID[a], Bv = ANIMAL_BY_ID[b];
    return (Bv ? Bv.chips : 0) - (A ? A.chips : 0);
  });
  // the second-best, so it stings without gutting the run
  const pick = ranked[Math.min(1, ranked.length - 1)];
  void rng;
  return pick;
}

void HABITAT_BY_ID;

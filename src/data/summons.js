// THE SUMMONS. What a boatload of ordinary animals adds up to.
//
// Every other reward in the game is one-for-one: tame a thing, learn its shape. These are
// the only rewards that need a COLLECTION -- five different birds, six different small
// things, five different swimmers -- and they are the reason to rescue a duck when you
// already have a duck's cousin. A summon is not stronger than what you have; it is stronger
// than anything you can get any other way, and it takes half a voyage to earn.
//
// EVERY ONE IS A REAL MYTH FROM A REAL PLACE, and they are named and credited as such,
// because "generic fantasy dragon" is what happens when nobody looks anything up:
//
//   QILIN         China            a hoofed thing that will not tread on a living blade
//   THUNDERBIRD   Plains Nations   the storm has wings and it is the wings that make it
//   BAKUNAWA      Philippines      the serpent that swallows the moon, and gives it back
//   ANANSI        Akan / Ghana     the spider who is smarter than everyone in the story
//   SLEIPNIR      Norse            eight legs, because four was not enough for Odin
//   SIMURGH       Persia           old enough to have seen the world end three times
//   KITSUNE       Japan            a fox with too many tails and a sense of humour
//
// HOW THE REQUIREMENT WORKS. Each one wants N DISTINCT SPECIES carrying one tag, counted
// across everything you have saved this run -- on the boat and in the garden both, because
// a rescue you banked is still a rescue. Distinct is the whole point: two lions are two
// lions, and this is the only system in the game that asks for VARIETY instead of quantity.

import { ANIMAL_BY_ID } from './animals.js';

export const SUMMONS = [
  {
    id: 'qilin', name: 'QILIN', culture: 'CHINA',
    beast: 'qilin_beast',
    tag: 'herbivore', need: 5,
    call: 'FIVE KINDS OF GRAZING ANIMAL',
    lore: 'It walks on grass without bending it. Where it stands, the ground gives.',
  },
  {
    id: 'thunderbird', name: 'THUNDERBIRD', culture: 'THE PLAINS NATIONS',
    beast: 'thunder_beast',
    tag: 'bird', need: 5,
    call: 'FIVE KINDS OF BIRD',
    lore: 'The storm is not weather. The storm has wings, and it is looking down.',
  },
  {
    id: 'bakunawa', name: 'BAKUNAWA', culture: 'THE PHILIPPINES',
    beast: 'bakunawa_beast',
    tag: 'swimming', need: 5,
    call: 'FIVE KINDS OF SWIMMER',
    lore: 'It swallowed six moons. They talked it into giving one back.',
  },
  {
    id: 'anansi', name: 'ANANSI', culture: 'THE AKAN, GHANA',
    beast: 'anansi_beast',
    tag: 'small', need: 6,
    call: 'SIX SMALL ANIMALS, ALL DIFFERENT',
    lore: 'Not the strongest thing in any story he is in. Wins anyway.',
  },
  {
    id: 'sleipnir', name: 'SLEIPNIR', culture: 'THE NORSE',
    beast: 'sleipnir_beast',
    tag: 'fast', need: 5,
    call: 'FIVE FAST ANIMALS, ALL DIFFERENT',
    lore: 'Eight legs. Odin was in a hurry and four was not going to do it.',
  },
  {
    id: 'simurgh', name: 'SIMURGH', culture: 'PERSIA',
    beast: 'simurgh_beast',
    tag: 'majestic', need: 4,
    call: 'FOUR ANIMALS WORTH LOOKING AT TWICE',
    lore: 'Has watched the world end three times. Is not especially worried.',
  },
  {
    id: 'kitsune', name: 'KITSUNE', culture: 'JAPAN',
    beast: 'kitsune_beast',
    tag: 'predator', need: 5,
    call: 'FIVE KINDS OF HUNTER',
    lore: 'One tail for every hundred years, and it is not counting out loud.',
  },
];

export const SUMMON_BY_ID = Object.freeze(
  SUMMONS.reduce((m, s) => { m[s.id] = s; return m; }, Object.create(null)),
);

/** Everything this voyage has saved: on the boat and banked in the garden. */
export function saved(v) {
  const out = [];
  for (const id of (v.aboard || [])) out.push(id);
  for (const id of (v.eden || [])) out.push(id);
  return out;
}

/**
 * How far along one summon is: the DISTINCT species you have that carry its tag.
 *
 * Returns the ids, not a count, because the panel lists them -- "you have a duck, a heron
 * and a penguin; you need two more kinds of swimmer" is a readable goal, and "3/5" is not.
 */
export function progressFor(v, s) {
  const seen = [];
  for (const id of saved(v)) {
    if (seen.indexOf(id) >= 0) continue;
    const a = ANIMAL_BY_ID[id];
    if (!a || !a.tags || a.tags.indexOf(s.tag) < 0) continue;
    seen.push(id);
  }
  return seen;
}

export function isCalled(v, s) {
  return ((v.summonsCalled || []).indexOf(s.id) >= 0);
}

/**
 * Anything newly earned, marked as called, and handed back so the caller can announce it.
 *
 * CALLED ONCE AND KEPT. The beast goes into the run's roster like a tamed shape does, so
 * from then on it is simply another card in the tray -- an expensive one.
 */
export function checkSummons(v) {
  const out = [];
  v.summonsCalled = v.summonsCalled || [];
  for (const s of SUMMONS) {
    if (isCalled(v, s)) continue;
    if (progressFor(v, s).length < s.need) continue;
    v.summonsCalled.push(s.id);
    v.beasts = v.beasts || [];
    if (v.beasts.indexOf(s.beast) < 0) v.beasts.push(s.beast);
    out.push(s);
  }
  return out;
}

/** The one closest to being earned, for a progress line that is worth reading. */
export function nextSummon(v) {
  let best = null, bestLeft = 1e9;
  for (const s of SUMMONS) {
    if (isCalled(v, s)) continue;
    const left = s.need - progressFor(v, s).length;
    if (left < bestLeft) { bestLeft = left; best = s; }
  }
  return best ? { summon: best, left: Math.max(0, bestLeft) } : null;
}

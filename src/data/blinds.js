// The ante ladder and the boss blinds.
//
// The curve is the classic escalator: each ante has a base score, and the three blinds
// of that ante ask for 1x, 1.5x and 2x of it. Note that it is deliberately NOT globally
// monotonic — ante 6's small blind (20,000) is easier than ante 5's boss (22,000). That
// dip is the reward for surviving a boss, and it is what makes the run breathe.
//
// A boss's `effect` may only use the fourteen keys in neutralEffect(). The engine reads
// exactly those and silently ignores anything else, so a boss built on an invented key
// would be a boss that does nothing. The test suite fails the build on a stray key.

import { P } from '../core/palette.js';

export const ANTES = 8;

/** Score to beat at each ante's SMALL blind. Index 0 is unused. */
export const ANTE_BASE = [0, 300, 800, 2000, 5000, 11000, 20000, 35000, 50000];

export const BLIND_KINDS = [
  { key: 'small', name: 'Small Blind', mult: 1.0, reward: 3, color: 'sky' },
  { key: 'big', name: 'Big Blind', mult: 1.5, reward: 4, color: 'gold' },
  { key: 'boss', name: 'Boss Blind', mult: 2.0, reward: 6, color: 'red2' },
];
const KIND_BY_KEY = {};
for (const k of BLIND_KINDS) KIND_BY_KEY[k.key] = k;

export function blindTarget(ante, kind) {
  const a = Math.max(1, Math.min(ANTES, Math.round(ante) || 1));
  const info = KIND_BY_KEY[kind] || BLIND_KINDS[0];
  const raw = ANTE_BASE[a] * info.mult;
  // round to something a player can read at a glance
  const step = raw >= 10000 ? 500 : raw >= 1000 ? 50 : 10;
  return Math.round(raw / step) * step;
}

export function blindLabel(ante, kind, boss) {
  const info = KIND_BY_KEY[kind] || BLIND_KINDS[0];
  return boss ? `${boss.name} — ante ${ante}` : `${info.name} — ante ${ante}`;
}

/** Payouts for clearing a blind at this ante, before shot bonuses and interest. */
export function anteRewards(ante) {
  const a = Math.max(1, Math.min(ANTES, Math.round(ante) || 1));
  return {
    money: 3 + Math.floor(a / 2),
    crates: a >= 6 ? 4 : 3,
    rerollBase: 3 + Math.floor(a / 3),
  };
}

/**
 * A fresh effect object with every key at its neutral value.
 * THIS LIST IS THE CONTRACT. Nothing outside it is read by the engine.
 */
export function neutralEffect() {
  return {
    closeHabitats: [],          // habitat ids whose gates are sealed
    shots: 0,                   // delta on run.shots
    reracks: 0,                 // delta on run.reracks
    friction: 1,                // cloth friction multiplier (<1 = slick)
    gravityDrift: 0,            // the deck leans; balls creep
    noInteractions: false,      // animals stop noticing each other
    hideLabels: false,          // gate names hidden
    chipsMul: 1,                // multiplier on chips, per animal
    multMul: 1,                 // multiplier on mult, per animal
    scoreFloorPerShot: 0,       // <=1 = fraction of target; a weak shot costs a shot
    onceScoringPerHabitat: false, // a habitat only pays in full once per blind
    decoy: false,               // one animal in the rack is a mimic
    shrinkGates: 0,             // 0..1 fraction taken off every gate radius
    rotateGates: false,         // gates shuffle a seat between shots
  };
}

function boss(id, name, desc, color, icon, minAnte, effect) {
  return { id, name, desc, color, icon, minAnte, effect };
}

export const BOSSES = [
  boss('drought', 'The Drought', 'The water gates are sealed', 'orange', 'sun', 1,
    { closeHabitats: ['ocean', 'wetland'] }),

  boss('blizzard', 'The Blizzard', 'The cloth is ice — nothing stops', 'ice', 'snowflake', 1,
    { friction: 0.42 }),

  boss('fog', 'The Fog', 'You cannot read the gates', 'grey2', 'cloud', 1,
    { hideLabels: true }),

  boss('narrows', 'The Narrows', 'Every gate closes to a slot', 'grey1', 'minus', 2,
    { shrinkGates: 0.34 }),

  boss('stampede', 'The Stampede', 'One shot fewer, and they bolt', 'red2', 'paw', 2,
    { shots: -1, friction: 0.82 }),

  boss('tide', 'The Tide', 'The deck leans with the swell', 'water3', 'wave', 2,
    { gravityDrift: 1.1 }),

  boss('manifest', 'The Manifest', 'No re-racks. Take what you are dealt', 'wood3', 'scroll', 2,
    { reracks: -99 }),

  boss('quarantine', 'The Quarantine', 'The animals ignore each other', 'teal', 'lock', 3,
    { noInteractions: true }),

  boss('inspector', 'The Inspector', 'Each gate is only counted once', 'brass2', 'eye', 3,
    { onceScoringPerHabitat: true }),

  boss('carousel', 'The Carousel', 'The gates turn after every shot', 'pink', 'wheel', 3,
    { rotateGates: true }),

  boss('poacher', 'The Poacher', 'Chips are cut to three fifths', 'red1', 'sword', 3,
    { chipsMul: 0.6 }),

  boss('mimic', 'The Mimic', 'Something in the rack is not an animal', 'purple1', 'skull', 4,
    { decoy: true, hideLabels: true }),

  boss('tithe', 'The Tithe', 'A weak shot costs you a shot', 'gold', 'coin', 4,
    { scoreFloorPerShot: 0.14 }),

  boss('famine', 'The Famine', 'Every multiplier is halved', 'rust', 'bone', 5,
    { multMul: 0.5 }),

  boss('sealed_hold', 'The Sealed Hold', 'Three gates are nailed shut', 'night', 'peak', 5,
    { closeHabitats: ['arctic', 'mountain', 'forest'] }),

  boss('long_night', 'The Long Night', 'Slick cloth, blind gates, one less shot', 'purple0', 'moon', 6,
    { friction: 0.6, hideLabels: true, shots: -1 }),
];

export const BOSS_BY_ID = {};
for (const b of BOSSES) BOSS_BY_ID[b.id] = b;

/**
 * Pick a boss for this ante that the run has not met yet. Falls back to re-using the
 * pool once it is exhausted rather than returning null, because a boss blind with no
 * boss is a bug the player would read as a missing feature.
 */
export function rollBoss(rng, ante, seen) {
  const a = Math.max(1, Math.round(ante) || 1);
  const met = new Set(seen || []);
  const eligible = BOSSES.filter((b) => (b.minAnte || 1) <= a);
  if (!eligible.length) return BOSSES[0];
  const fresh = eligible.filter((b) => !met.has(b.id));
  const pool = fresh.length ? fresh : eligible;
  // nastier bosses drift later: weight toward the ones whose minAnte is closest to now
  const weighted = pool.map((b) => [b, 1 + Math.max(0, 3 - (a - (b.minAnte || 1))) * 0.35]);
  return rng && rng.weighted ? rng.weighted(weighted) : pool[0];
}

/** Sanity-check a boss's effect against the contract. Used by the test suite. */
export function effectKeysAreLegal(effect) {
  const legal = new Set(Object.keys(neutralEffect()));
  return Object.keys(effect || {}).every((k) => legal.has(k));
}

void P;

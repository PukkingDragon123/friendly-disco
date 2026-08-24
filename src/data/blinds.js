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
    floodRate: 1,               // multiplier on how fast the water climbs per shot
  };
}

function boss(o) {
  return {
    id: o.id, name: o.name, desc: o.desc, myth: o.myth, disaster: o.disaster,
    color: o.color, icon: o.icon, minAnte: o.minAnte || 1, effect: o.effect || {},
  };
}

/**
 * Each boss is a named disaster out of somebody's flood myth, and each one is composed
 * only from the legal effect keys. `myth` is the pantheon it comes from and `disaster`
 * is the one-line threat the cutscene falls back to if it has no scripted dialogue.
 */
export const BOSSES = [
  boss({
    id: 'deluge', name: 'The Deluge', myth: 'Hebrew',
    desc: 'The water climbs twice as fast', disaster: 'I am the forty days',
    color: 'water3', icon: 'drop', minAnte: 1,
    effect: { floodRate: 2 },
  }),
  boss({
    id: 'fimbulwinter', name: 'Fimbulwinter', myth: 'Norse',
    desc: 'Three winters, no summer — the felt is ice', disaster: 'No summer comes between',
    color: 'ice', icon: 'snowflake', minAnte: 1,
    effect: { friction: 0.4 },
  }),
  boss({
    id: 'plagues', name: 'The Ten Plagues', myth: 'Egyptian',
    desc: 'Everything you count counts for less', disaster: 'I have brought a list',
    color: 'green0', icon: 'bolt', minAnte: 1,
    effect: { chipsMul: 0.6 },
  }),
  boss({
    id: 'poseidon', name: "Poseidon's Wrath", myth: 'Greek',
    desc: 'He is tilting the sea', disaster: 'The sea is mine',
    color: 'teal', icon: 'wave', minAnte: 2,
    effect: { gravityDrift: 1.2 },
  }),
  boss({
    id: 'leviathan', name: 'Leviathan', myth: 'Hebrew',
    desc: 'One creature aboard is not a creature', disaster: 'Which one? Yes',
    color: 'purple1', icon: 'skull', minAnte: 2,
    effect: { decoy: true },
  }),
  boss({
    id: 'fenrir', name: 'Fenrir', myth: 'Norse',
    desc: 'The wolf eats a shot', disaster: 'I ate the sun',
    color: 'grey2', icon: 'paw', minAnte: 2,
    effect: { shots: -1, floodRate: 1.2 },
  }),
  boss({
    id: 'typhon', name: 'Typhon', myth: 'Greek',
    desc: 'A hundred heads lean on the gates', disaster: 'Every head is leaning',
    color: 'rust', icon: 'minus', minAnte: 2,
    effect: { shrinkGates: 0.34 },
  }),
  boss({
    id: 'jormungandr', name: 'Jormungandr', myth: 'Norse',
    desc: 'The gates turn after every shot', disaster: 'I circle the world',
    color: 'moss', icon: 'wheel', minAnte: 3,
    effect: { rotateGates: true },
  }),
  boss({
    id: 'duat', name: 'The Duat', myth: 'Egyptian',
    desc: 'You cannot read the gates', disaster: 'Tell me which door is which',
    color: 'purple0', icon: 'moon', minAnte: 3,
    effect: { hideLabels: true },
  }),
  boss({
    id: 'tiamat', name: 'Tiamat', myth: 'Babylonian',
    desc: 'Every multiplier is halved', disaster: 'I halve what you multiply',
    color: 'red1', icon: 'fish', minAnte: 3,
    effect: { multMul: 0.5 },
  }),
  boss({
    id: 'vritra', name: 'Vritra', myth: 'Hindu',
    desc: 'The serpent has swallowed the rivers', disaster: 'Drink from my coils',
    color: 'orange', icon: 'sun', minAnte: 3,
    effect: { closeHabitats: ['briny', 'soaked'] },
  }),
  boss({
    id: 'amaterasu', name: "Amaterasu's Absence", myth: 'Japanese',
    desc: 'She took the light into the cave', disaster: 'The light has gone with her',
    color: 'night', icon: 'eye', minAnte: 4,
    effect: { hideLabels: true, friction: 0.62 },
  }),
  boss({
    id: 'charybdis', name: 'Charybdis', myth: 'Greek',
    desc: 'Everything goes down, and down here', disaster: 'Down. Everything goes down',
    color: 'water2', icon: 'drop', minAnte: 4,
    effect: { gravityDrift: 0.9, floodRate: 1.6 },
  }),
  boss({
    id: 'maat', name: "Ma'at's Scale", myth: 'Egyptian',
    desc: 'A weak shot costs you a shot', disaster: 'Weighed against a feather',
    color: 'gold', icon: 'feather', minAnte: 4,
    effect: { scoreFloorPerShot: 0.14 },
  }),
  boss({
    id: 'eden', name: 'The Sealing of Eden', myth: 'Hebrew',
    desc: 'Three gates shut, a sword at each', disaster: 'The flaming sword is at each',
    color: 'red2', icon: 'sword', minAnte: 5,
    effect: { closeHabitats: ['frozen', 'lofty', 'bushy'] },
  }),
  boss({
    id: 'ragnarok', name: 'Ragnarok', myth: 'Norse',
    desc: 'The last one. It brought everything', disaster: 'I have brought everything',
    color: 'red2', icon: 'flame', minAnte: 7,
    effect: { friction: 0.62, hideLabels: true, shots: -1, floodRate: 1.4 },
  }),
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

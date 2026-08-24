// The voyage: the whole run, in one object.
//
// This replaces the old blind/ante machinery. The shape of a run is now:
//
//     ocean  ->  pick one of three islands  ->  rescue  ->  ocean  ->  ...
//                                           \-> Cherubim Rock -> EDEN (hub)
//
// and the pressure is the FLOOD, which advances every time you sail. It is not a timer
// you can see ticking so much as a tide mark on the map: islands behind it are gone, and
// the animals still on them are gone with them.
//
// Three places an animal can be, and the difference is the entire economy:
//
//     ABOARD    on the boat. Usable in rescues. Lost if the boat is lost.
//     EDEN      in the garden. Permanently safe. Not usable. Sellable.
//     LOST      it did not make it.
//
// Boat capacity is the binding constraint on all of it, which is why Noah's first
// upgrade is the one that matters most.

import { makeRng, randomSeedString } from '../core/rng.js';
import { ANIMAL_BY_ID, STARTER_STOCK } from '../data/animals.js';
import { rollLeg, ISLAND_BY_ID, CHERUBIM } from '../data/islands.js';

export const LEGS_PER_CHAPTER = 4;
export const CHAPTERS = 4;

/* ---------------------------------------------------------------- boat tiers

Each upgrade is FIVE steps, and every step of capacity and hull is visible on the boat
itself (render/boat.js reads these numbers). An upgrade you cannot see is an upgrade the
player has to take on trust.
*/
export const BOAT_UPGRADES = {
  capacity: {
    name: 'Pens', icon: 'crate', color: 'wood3',
    desc: 'Another berth below deck. More animals aboard at once.',
    steps: [6, 8, 10, 12, 15],
    cost: [0, 14, 26, 44, 70],
  },
  speed: {
    name: 'Sail', icon: 'boat', color: 'cream',
    desc: 'A bigger sail. The flood gains less ground every time you cross.',
    steps: [1, 0.86, 0.74, 0.63, 0.52],
    cost: [0, 12, 22, 38, 60],
  },
  hull: {
    name: 'Hull', icon: 'shield', color: 'brass2',
    desc: 'Pitched and braced. The sea takes fewer animals off your deck.',
    steps: [3, 4, 6, 8, 11],
    cost: [0, 10, 20, 34, 55],
  },
  hold: {
    name: 'Hold', icon: 'key', color: 'brass3',
    desc: 'Room for apples and gear. More you can carry into a rescue.',
    steps: [2, 3, 4, 5, 6],
    cost: [0, 9, 18, 30, 48],
  },
  garden: {
    name: 'Garden', icon: 'leaf', color: 'leaf3',
    desc: 'More beds in Eden. Animals kept there are safe for good.',
    steps: [10, 16, 24, 34, 48],
    cost: [0, 11, 21, 36, 56],
  },
};

export const UPGRADE_IDS = Object.keys(BOAT_UPGRADES);

/** The current value of one upgrade line. */
export function tierValue(v, id) {
  const u = BOAT_UPGRADES[id];
  if (!u) return 0;
  const lvl = Math.max(0, Math.min(u.steps.length - 1, (v.tiers && v.tiers[id]) || 0));
  return u.steps[lvl];
}

/** What the next step costs, or null if it is already maxed. */
export function tierCost(v, id) {
  const u = BOAT_UPGRADES[id];
  if (!u) return null;
  const lvl = ((v.tiers && v.tiers[id]) || 0) + 1;
  if (lvl >= u.steps.length) return null;
  return u.cost[lvl];
}

export function capacity(v) { return tierValue(v, 'capacity'); }
export function holdSize(v) { return tierValue(v, 'hold'); }
export function gardenSize(v) { return tierValue(v, 'garden'); }
export function hullMax(v) { return tierValue(v, 'hull'); }
/**
 * How much ground the flood gains per crossing.
 *
 * 0.062 is chosen so that an UNUPGRADED boat runs out of ocean at leg 16 -- exactly the
 * length of the voyage. That is the knife edge on purpose: finish with the sail you
 * started with and you arrive on the last leg with the water at your heels, and every
 * point of Sail you buy is the difference between that and a margin.
 */
export function floodPerLeg(v) { return 0.062 * tierValue(v, 'speed'); }

/**
 * Deal `n` animals off a grouped list, one kind at a time, so a small boat gets VARIETY
 * rather than the front of the list.
 */
export function spreadStock(list, n) {
  const kinds = [];
  const byKind = new Map();
  for (const id of list) {
    if (!byKind.has(id)) { byKind.set(id, 0); kinds.push(id); }
    byKind.set(id, byKind.get(id) + 1);
  }
  const out = [];
  let pass = 0;
  while (out.length < n && pass < 24) {
    let took = false;
    for (const id of kinds) {
      if (out.length >= n) break;
      if (byKind.get(id) > pass) { out.push(id); took = true; }
    }
    if (!took) break;
    pass++;
  }
  return out;
}

/* -------------------------------------------------------------------- state */

export function newVoyage(seed) {
  const s = seed || randomSeedString('voyage');
  const v = {
    seed: s,
    rng: makeRng(s + '/voyage'),

    // --- where we are
    chapter: 1,
    leg: 1,
    at: null,               // the island we are currently on, or null while at sea
    choices: [],            // the three destinations on offer
    lastWasCherubim: false,
    visited: [],

    // --- the tide
    flood: 0,               // 0..1. At 1 the ocean is closed and the voyage ends.

    // --- the boat
    tiers: { capacity: 0, speed: 0, hull: 0, hold: 0, garden: 0 },
    hull: 3,                // current, out of hullMax
    aboard: [],             // animal ids on the deck
    hold: [],               // apple / item ids
    loyal: [],              // animal ids that always survive and are always usable

    // --- the garden
    eden: [],               // animal ids kept safe forever
    gates: [],              // NPC ids the Cherubim have opened
    summoned: [],           // NPCs currently in Eden

    // --- the golem
    slots: { hold: null, wear: null, consume: null },

    // --- the ledger
    money: 12,
    lost: [],
    quests: [],
    flags: {},              // set by choices; read by later events
    log: [],

    stats: {
      rescued: 0, drowned: 0, sold: 0, islands: 0, legs: 0,
      obstaclesCleared: 0, applesUsed: 0, bestRescue: 0,
    },
    over: false,
    won: false,
  };
  v.hull = hullMax(v);
  // You start with your own farm animals on deck -- but SPREAD, not the first six off
  // the list. STARTER_STOCK is grouped by kind, so slicing it handed the player five
  // chickens and a pig: a deck with one ability on it, which makes the whole route
  // decision on the map meaningless before the run has started. Round-robin over the
  // kinds instead, so six berths are six different animals and therefore six tools.
  v.stock = STARTER_STOCK.slice();
  v.aboard = spreadStock(STARTER_STOCK, capacity(v));
  rollChoices(v);
  return v;
}

export function say(v, text, color) {
  v.log.push({ text: String(text).slice(0, 64), color: color || 'bone' });
  if (v.log.length > 60) v.log.shift();
  return v;
}

/* ------------------------------------------------------------------- sailing */

/** Roll the three destinations for the current leg. */
export function rollChoices(v) {
  const rng = v.rng.fork(`leg/${v.chapter}/${v.leg}`);
  v.choices = rollLeg(rng, {
    leg: v.leg + (v.chapter - 1) * LEGS_PER_CHAPTER,
    exclude: v.visited.slice(-3),
    lastWasCherubim: v.lastWasCherubim,
  });
  return v.choices;
}

/**
 * Sail to one of the offered islands.
 *
 * The flood advances HERE, on the crossing, not on the island -- so the cost of a
 * destination is paid before you see what is on it, and a bigger sail is worth real
 * ground. Cherubim Rock is close in and costs a third as much.
 */
export function sailTo(v, island) {
  if (!island || v.over) return null;
  const isGate = island.id === CHERUBIM.id;
  v.flood = Math.min(1, v.flood + floodPerLeg(v) * (isGate ? 0.34 : 1));
  v.at = island;
  v.lastWasCherubim = isGate;
  v.visited.push(island.id);
  v.stats.legs++;
  if (!isGate) v.stats.islands++;
  say(v, `Made ${island.name}.`, 'foam');
  if (v.flood >= 1) endVoyage(v, false, 'The ocean closed over the last of it.');
  return island;
}

/** Leave the current island and set up the next set of choices. */
export function departIsland(v) {
  v.at = null;
  v.leg++;
  if (v.leg > LEGS_PER_CHAPTER) {
    v.leg = 1;
    v.chapter++;
    if (v.chapter > CHAPTERS) { endVoyage(v, true, 'Land, and every animal you saved on it.'); return v; }
    say(v, `Chapter ${v.chapter}. The water is higher.`, 'water3');
  }
  rollChoices(v);
  return v;
}

export function endVoyage(v, won, why) {
  v.over = true;
  v.won = !!won;
  say(v, why || (won ? 'Landfall.' : 'The voyage ends here.'), won ? 'gold' : 'red2');
  return v;
}

/* ------------------------------------------------------------- the manifest */

export function aboardCount(v) { return v.aboard.length; }
export function berthsFree(v) { return Math.max(0, capacity(v) - v.aboard.length); }
export function isLoyal(v, id) { return v.loyal.indexOf(id) >= 0; }

/** Take an animal aboard. Fails, loudly, when the pens are full. */
export function takeAboard(v, id) {
  if (!ANIMAL_BY_ID[id]) return false;
  if (berthsFree(v) <= 0) return false;
  v.aboard.push(id);
  v.stats.rescued++;
  return true;
}

/** Move an animal from the deck into Eden, where nothing can reach it. */
export function stow(v, id) {
  const ix = v.aboard.indexOf(id);
  if (ix < 0) return false;
  if (v.eden.length >= gardenSize(v)) return false;
  v.aboard.splice(ix, 1);
  v.eden.push(id);
  return true;
}

/** And back out again, if there is a berth for it. */
export function unstow(v, id) {
  const ix = v.eden.indexOf(id);
  if (ix < 0) return false;
  if (berthsFree(v) <= 0) return false;
  v.eden.splice(ix, 1);
  v.aboard.push(id);
  return true;
}

/** What an animal fetches in the garden. Rarity, plus a premium if it is loyal. */
export function sellPrice(v, id) {
  const a = ANIMAL_BY_ID[id];
  if (!a) return 0;
  const base = { common: 3, uncommon: 5, rare: 9, legendary: 16 }[a.rarity] || 3;
  return base + (isLoyal(v, id) ? 3 : 0);
}

export function sell(v, id, from = 'eden') {
  const list = from === 'eden' ? v.eden : v.aboard;
  const ix = list.indexOf(id);
  if (ix < 0) return 0;
  const price = sellPrice(v, id);
  list.splice(ix, 1);
  v.money += price;
  v.stats.sold++;
  const a = ANIMAL_BY_ID[id];
  say(v, `Sold ${a ? a.name : id} for $${price}.`, 'brass3');
  return price;
}

/** An animal the flood took. Loyal animals never appear here. */
export function lose(v, id, why) {
  const ix = v.aboard.indexOf(id);
  if (ix >= 0) v.aboard.splice(ix, 1);
  v.lost.push(id);
  v.stats.drowned++;
  const a = ANIMAL_BY_ID[id];
  say(v, `${a ? a.name : id} — ${why || 'lost'}.`, 'red2');
  return true;
}

/** The sea takes a bite out of the hull, and past zero it takes animals. */
export function damageHull(v, n = 1) {
  v.hull = Math.max(0, v.hull - n);
  if (v.hull > 0) { say(v, 'The hull takes a beating.', 'rust'); return false; }
  // a breach: the deck loses one animal, and never a loyal one
  const pool = v.aboard.filter((id) => !isLoyal(v, id));
  if (pool.length) {
    lose(v, pool[pool.length - 1], 'washed off a breached deck');
    v.hull = 1;
    return true;
  }
  endVoyage(v, false, 'The hull went, and there was nothing left to save.');
  return true;
}

export function repairHull(v, n = 1) {
  v.hull = Math.min(hullMax(v), v.hull + n);
  return v.hull;
}

/* ----------------------------------------------------------------- upgrades */

export function buyUpgrade(v, id) {
  const cost = tierCost(v, id);
  if (cost === null) return false;
  if (v.money < cost) return false;
  v.money -= cost;
  v.tiers[id] = (v.tiers[id] || 0) + 1;
  if (id === 'hull') v.hull = hullMax(v);
  const u = BOAT_UPGRADES[id];
  say(v, `${u.name} improved.`, u.color);
  return true;
}

/* -------------------------------------------------------------- the hold */

export function addItem(v, id) {
  if (v.hold.length >= holdSize(v)) return false;
  v.hold.push(id);
  return true;
}

export function useItem(v, id) {
  const ix = v.hold.indexOf(id);
  if (ix < 0) return false;
  v.hold.splice(ix, 1);
  return true;
}

/** Make an animal loyal: always usable, and the flood never gets it. */
export function makeLoyal(v, id) {
  if (!ANIMAL_BY_ID[id]) return false;
  if (v.loyal.indexOf(id) >= 0) return false;
  v.loyal.push(id);
  const a = ANIMAL_BY_ID[id];
  say(v, `${a ? a.name : id} will follow you anywhere now.`, 'gold');
  return true;
}

/* ------------------------------------------------------------------ relics */

/** Equip a relic into its own slot type, returning whatever it displaced. */
export function equip(v, relic) {
  if (!relic || !relic.slot) return null;
  const prev = v.slots[relic.slot] || null;
  v.slots[relic.slot] = relic;
  say(v, `${relic.name} equipped.`, relic.color || 'brass3');
  return prev;
}

export function equipped(v) {
  return ['hold', 'wear', 'consume'].map((k) => v.slots[k]).filter(Boolean);
}

/** Sum a numeric bonus across the three slots. */
export function relicBonus(v, key) {
  let n = 0;
  for (const r of equipped(v)) if (r.bonus && typeof r.bonus[key] === 'number') n += r.bonus[key];
  return n;
}

export function relicFlag(v, key) {
  for (const r of equipped(v)) if (r.bonus && r.bonus[key]) return true;
  return false;
}

/* ------------------------------------------------------------------ helpers */

/** A short read of how the voyage is going, for the HUD and the summary. */
export function status(v) {
  return {
    chapter: v.chapter,
    leg: v.leg,
    flood: v.flood,
    aboard: v.aboard.length,
    capacity: capacity(v),
    eden: v.eden.length,
    garden: gardenSize(v),
    hull: v.hull,
    hullMax: hullMax(v),
    money: v.money,
    lost: v.lost.length,
    where: v.at ? v.at.name : 'at sea',
  };
}

export { ISLAND_BY_ID, CHERUBIM };

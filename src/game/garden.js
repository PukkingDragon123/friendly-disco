// EDEN, as rules.
//
// The garden is the only safe place in the game. An animal in a bed here is out of the
// story: nothing reaches it, it cannot be used, and it can be sold. That is the whole
// economy -- the boat is where animals are useful and in danger, the garden is where
// they are safe and worth money, and every animal you own is sitting in one of those two
// answers.
//
// THE GATES. The Cherubim will open one of three, free, and whoever comes through stays
// for the rest of the run. So the choice is not "can I afford this" but "which of these
// three do I want standing in my garden for the next twelve legs" -- and because a
// summoned NPC is never offered again, the pool narrows every time you come back.
//
// A DEAL is one to three things on a blanket, rolled once per visit from the voyage seed.

import { ITEM_BY_ID, itemsFrom } from '../data/items.js';
import { GEAR_BY_ID, gearFrom } from '../data/gear.js';
import { NPC_BY_ID, rollGates, dealSize } from '../data/npcs.js';
import { DOLLS, DOLL_BY_ID, costText } from '../data/dolls.js';
import { BOAT_UPGRADES, UPGRADE_IDS, tierCost, buyUpgrade, addItem, equip, say, learnRecipe,
} from './voyage.js';
import { QUESTS, currentQuest, questDone, progressOf } from '../data/quests.js';
import { priceMod, gatesOpen } from './choices.js';

/** How many times you have to sit with an animal before it will not leave you. */
export const PETS_FOR_LOYALTY = 3;

/* ------------------------------------------------------------------- arriving */

/**
 * Set the garden up for this visit: which three gates are on offer, and what everybody
 * already summoned has on their blanket today. Rolled from the seed and the visit number
 * so a reload cannot reroll a bad shop.
 */
export function enterGarden(v) {
  v.visits = (v.visits || 0) + 1;
  const rng = v.rng.fork(`eden/${v.visits}`);
  v.gateOffer = rollGates(rng, v, gatesOpen(v)).map((n) => n.id);
  v.deals = {};
  for (const id of v.summoned) v.deals[id] = rollDeal(v, rng.fork(id), NPC_BY_ID[id]);
  v.pets = v.pets || {};
  return v;
}

/** Free, once per visit. Whoever comes through stays for the rest of the run. */
export function openGate(v, npcId) {
  if (!npcId || v.summoned.indexOf(npcId) >= 0) return false;
  if (!v.gateOffer || v.gateOffer.indexOf(npcId) < 0) return false;
  const npc = NPC_BY_ID[npcId];
  if (!npc) return false;
  v.summoned.push(npcId);
  v.gates.push(npcId);
  v.gateOffer = [];                      // one gate a visit: that is the whole decision
  const rng = v.rng.fork(`deal/${npcId}/${v.visits}`);
  v.deals = v.deals || {};
  v.deals[npcId] = rollDeal(v, rng, npc);
  say(v, `${npc.name} came through the gate.`, npc.color);
  return true;
}

/* ---------------------------------------------------------------------- deals */

/**
 * One to three things on a blanket.
 *
 * Nothing you already own is offered again, which matters most for relics: an NPC whose
 * whole stock you have bought lays out nothing and says so, rather than selling you a
 * second identical apron.
 */
/** What a thing costs YOU, which is not always what it costs. */
export function priceOf(v, base) {
  return Math.max(1, Math.round(base + priceMod(v)));
}

export function rollDeal(v, rng, npc) {
  if (!npc) return [];
  const n = dealSize(rng, npc);
  let stock = [];
  if (npc.sells === 'items') {
    stock = itemsFrom(npc.id).map((it) => ({ kind: 'item', id: it.id, price: priceOf(v, it.price) }));
  } else if (npc.sells === 'gear') {
    const owned = ownedGear(v);
    stock = gearFrom(npc.id)
      .filter((r) => owned.indexOf(r.id) < 0)
      .map((r) => ({ kind: 'gear', id: r.id, price: priceOf(v, r.price) }));
  } else if (npc.sells === 'upgrades') {
    stock = UPGRADE_IDS
      .filter((u) => tierCost(v, u) !== null)
      .map((u) => ({ kind: 'upgrade', id: u, price: priceOf(v, tierCost(v, u)) }));
    // NOAH ALSO TEACHES SHAPES. He is the only one who knows how the other dolls are
    // made, which is what makes finding him worth a leg of the voyage rather than just
    // another shop. A recipe is cheap in coin and enormous in what it opens up, so it is
    // priced like a favour and not like a relic.
    for (const d of DOLLS) {
      if (!d.unlock || v.recipes.indexOf(d.id) >= 0) continue;
      stock.push({ kind: 'recipe', id: d.id, price: priceOf(v, 6) });
    }
  }
  const out = [];
  const rest = stock.slice();
  // ONE RECIPE, GUARANTEED, whenever he has one left to teach. Rolled fairly against ten
  // upgrades a recipe turned up about a fifth of the time, which made the doll box a matter
  // of luck rather than a thing you sail toward. Noah is the only source of shapes, so the
  // trip to him has to be worth taking.
  const recipeIx = rest.findIndex((o) => o.kind === 'recipe');
  if (recipeIx >= 0) {
    out.push(rest[recipeIx]);
    rest.splice(recipeIx, 1);
  }
  while (out.length < n && rest.length) {
    const i = rng.int(rest.length);
    out.push(rest[i]);
    rest.splice(i, 1);
  }
  return out;
}

function ownedGear(v) {
  const out = [];
  for (const k of ['hold', 'wear', 'consume']) if (v.slots[k]) out.push(v.slots[k].id);
  for (const id of v.shelf || []) out.push(id);
  return out;
}

/** What one offer actually is, resolved for the panel. */
export function describeOffer(offer) {
  if (!offer) return null;
  if (offer.kind === 'item') {
    const it = ITEM_BY_ID[offer.id];
    return it && {
      name: it.name, blurb: it.blurb, sub: it.use, color: it.color,
      icon: 'leaf', kind: 'item', tag: 'FOR THE BASKET',
    };
  }
  if (offer.kind === 'gear') {
    const r = GEAR_BY_ID[offer.id];
    return r && {
      name: r.name, blurb: r.blurb, sub: null, color: r.color,
      icon: r.icon, kind: 'gear', slot: r.slot, tag: r.slot.toUpperCase(),
    };
  }
  if (offer.kind === 'upgrade') {
    const u = BOAT_UPGRADES[offer.id];
    return u && {
      name: u.name, blurb: u.desc, sub: null, color: u.color,
      icon: u.icon, kind: 'upgrade', tag: 'THE BOAT',
    };
  }
  if (offer.kind === 'recipe') {
    const d = DOLL_BY_ID[offer.id];
    return d && {
      name: d.name, blurb: d.rule, sub: `MADE FROM ${costText(d).toUpperCase()}`,
      color: d.mark, icon: 'shell', kind: 'recipe', tag: 'A SHAPE HE KNOWS',
    };
  }
  return null;
}

/**
 * Buy it. Returns null on a refusal, and the reason is always one of two: no money, or
 * nowhere to put it -- both of which the panel says out loud rather than beeping.
 */
export function buyOffer(v, npcId, offer) {
  if (!offer) return null;
  if (v.money < offer.price) return null;
  let ok = false;
  let displaced = null;
  if (offer.kind === 'item') ok = addItem(v, offer.id);
  else if (offer.kind === 'recipe') ok = learnRecipe(v, offer.id);
  else if (offer.kind === 'gear') {
    const relic = GEAR_BY_ID[offer.id];
    if (relic) { displaced = equip(v, relic); ok = true; }
  } else if (offer.kind === 'upgrade') {
    // buyUpgrade takes the TIER price out of the purse; the blanket's price may be
    // marked up or down by your reputation, so settle the difference here
    const tier = tierCost(v, offer.id);
    ok = buyUpgrade(v, offer.id);
    if (ok) {
      v.money = Math.max(0, v.money - (offer.price - (tier || 0)));
      const deal = (v.deals && v.deals[npcId]) || [];
      const ix = deal.indexOf(offer);
      if (ix >= 0) deal.splice(ix, 1);
      return { offer, displaced: null };
    }
  }
  if (!ok) return null;
  v.money -= offer.price;
  const deal = (v.deals && v.deals[npcId]) || [];
  const ix = deal.indexOf(offer);
  if (ix >= 0) deal.splice(ix, 1);
  return { offer, displaced };
}

/* --------------------------------------------------------------------- quests */

/** Noah's current job, with its progress attached. */
export function questNow(v) {
  const q = currentQuest(v);
  if (!q) return null;
  return { quest: q, at: progressOf(v, q), goal: q.goal, done: questDone(v, q) };
}

/** Hand it in. Pays out, and moves him on to the next one. */
export function claimQuest(v) {
  const now = questNow(v);
  if (!now || !now.done) return null;
  const q = now.quest;
  v.quests.push(q.id);
  const rw = q.reward || {};
  if (rw.money) v.money += rw.money;
  if (rw.item) addItem(v, rw.item);
  if (rw.gear && GEAR_BY_ID[rw.gear]) equip(v, GEAR_BY_ID[rw.gear]);
  if (rw.upgrade) {
    // a free step: pay for it out of thin air rather than out of the purse
    const cost = tierCost(v, rw.upgrade);
    if (cost !== null) { v.money += cost; buyUpgrade(v, rw.upgrade); }
  }
  say(v, q.done, 'gold');
  return q;
}

/* ------------------------------------------------------------------ the beds */

/**
 * Sit with an animal.
 *
 * Three visits and it will not leave you -- the free, slow road to loyalty that the
 * snake charges seven for. It is the one thing in the game you get by being kind and
 * patient instead of by spending, which is why it takes three trips to Eden and not one.
 */
export function pet(v, id) {
  v.pets = v.pets || {};
  if (v.loyal.indexOf(id) >= 0) return { count: PETS_FOR_LOYALTY, loyal: true, already: true };
  const n = (v.pets[id] || 0) + 1;
  v.pets[id] = n;
  if (n >= PETS_FOR_LOYALTY) {
    v.loyal.push(id);
    return { count: n, loyal: true };
  }
  return { count: n, loyal: false };
}

export function petsOf(v, id) { return (v.pets && v.pets[id]) || 0; }

export { QUESTS };

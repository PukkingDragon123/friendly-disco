// Applying a choice, and the flags it leaves behind.
//
// The data (data/choices.js) says what an option DOES in a closed vocabulary; this file
// is the only thing that can carry it out. That separation is the whole point: an
// encounter cannot reach into the voyage and do something the rest of the game has not
// been told about, and every effect an encounter can have is testable from a list.
//
// The flags are the interesting half. An option is rarely worth taking for what it pays
// now -- it is worth taking for what it makes true later -- so this file also owns the
// three readers that the rest of the game asks:
//
//   priceMod(v)   what your reputation costs you at every blanket in the garden
//   tideMod(v)    the dove, flying ahead of you
//   dangerMod(v)  the charts, making the water readable
//   spareMod(v)   the whale, pulling one animal a rescue back out of the deep
//
// Anything else a flag does, it does by being named in an encounter's `needs`.

import { ANIMAL_BY_ID, ANIMALS } from '../data/animals.js';
import { CHOICES, CHOICE_BY_ID, FLAGS } from '../data/choices.js';
import { GEAR_BY_ID } from '../data/gear.js';
import {
  takeAboard, berthsFree, isLoyal, makeLoyal, addItem, equip, lose, say,
  damageHull, repairHull, floodPerLeg,
} from './voyage.js';

/* ------------------------------------------------------------------ readers */

/** Reputation, in coins. Everybody who sells to you has heard. */
export function priceMod(v) {
  let n = 0;
  if (v.flags.robbed) n += 2;
  if (v.flags.kind) n -= 1;
  return n;
}

/** The dove flies ahead: the flood gains less on every crossing. */
export function tideMod(v) { return v.flags.dove ? 0.85 : 1; }

/** The charts: an island reads one step less dangerous than it is. */
export function dangerMod(v) { return v.flags.charted ? -1 : 0; }

/** The whale: one animal a rescue is pulled back out of deep water. */
export function spareMod(v) { return v.flags.whale ? 1 : 0; }

/** Whether the Cherubim will open a fourth door. */
export function gatesOpen(v) { return v.flags.sworn ? 4 : 3; }

/** The gold you took: the garden is slower to grow for it. */
export function bedMod(v) { return (v.bonusBeds || 0) - (v.flags.greedy ? 4 : 0); }

/* ------------------------------------------------------------------ rolling */

/**
 * Is there something on the way in?
 *
 * Not every leg -- roughly every other one, never twice running, never the same twice in
 * a voyage, and gated on flags so the follow-ups can only appear after their setup. The
 * follow-ups are weighted UP: an encounter that pays off an earlier decision is the whole
 * reason the earlier decision mattered, so when one is available it usually happens.
 */
export function rollEncounter(v, island) {
  if (!island || island.teleport) return null;
  if (v.lastEncounter && v.stats.legs - v.lastEncounter < 2) return null;
  const seen = v.seenChoices || [];
  const rng = v.rng.fork(`enc/${v.chapter}/${v.leg}`);
  const pool = [];
  for (const c of CHOICES) {
    if (seen.indexOf(c.id) >= 0) continue;
    if (c.needs && !v.flags[c.needs]) continue;
    const w = c.needs ? c.weight * 3 : c.weight;
    for (let i = 0; i < w; i++) pool.push(c);
  }
  if (!pool.length) return null;
  if (!rng.chance(0.62)) return null;
  return rng.pick(pool);
}

export function markEncounter(v, enc) {
  v.seenChoices = v.seenChoices || [];
  if (v.seenChoices.indexOf(enc.id) < 0) v.seenChoices.push(enc.id);
  v.lastEncounter = v.stats.legs;
  return v;
}

/* ----------------------------------------------------------------- applying */

/**
 * Carry out one option.
 *
 * Returns a list of plain lines describing what actually happened -- not what the data
 * said would happen. A `+1 animal` that found no berth reports itself as a berth it did
 * not have, because a choice that silently does nothing is a choice the player will
 * never trust again.
 */
export function applyOption(v, enc, ix) {
  const e = typeof enc === 'string' ? CHOICE_BY_ID[enc] : enc;
  if (!e) return [];
  const opt = e.options[ix];
  if (!opt) return [];
  const told = [];
  const rng = v.rng.fork(`optn/${e.id}/${ix}`);

  for (const step of opt.effects || []) {
    for (const key of Object.keys(step)) {
      const val = step[key];
      switch (key) {
        case 'money': {
          const before = v.money;
          v.money = Math.max(0, v.money + val);
          const moved = v.money - before;
          if (moved) told.push(moved > 0 ? `+$${moved}` : `-$${-moved}`);
          break;
        }
        case 'hull':
          if (val >= 0) { repairHull(v, val); told.push(`hull +${val}`); }
          else { damageHull(v, -val); told.push(`hull ${val}`); }
          break;
        case 'tide': {
          const step2 = floodPerLeg(v) * val;
          v.flood = Math.max(0, Math.min(1, v.flood + step2));
          told.push(val > 0 ? `the water gains a crossing` : `the water loses a crossing`);
          break;
        }
        case 'item':
          told.push(addItem(v, val) ? 'into the basket' : 'no room in the basket');
          break;
        case 'gear': {
          const relic = GEAR_BY_ID[val];
          if (!relic) break;
          const prev = equip(v, relic);
          told.push(prev ? `${relic.name} (it displaced ${prev.name})` : relic.name);
          break;
        }
        case 'animal': {
          const id = val === 'wild' ? rng.pick(ANIMALS).id : val;
          const a = ANIMAL_BY_ID[id];
          if (!a) break;
          if (berthsFree(v) <= 0) { told.push(`no berth for the ${a.name.toLowerCase()}`); break; }
          takeAboard(v, id);
          told.push(`${a.name} aboard`);
          break;
        }
        case 'lose': {
          for (let i = 0; i < val; i++) {
            const pool = v.aboard.filter((id) => !isLoyal(v, id));
            if (!pool.length) { told.push('nothing left to give'); break; }
            const id = pool[pool.length - 1];
            const a = ANIMAL_BY_ID[id];
            lose(v, id, `given up at ${e.title.toLowerCase()}`);
            told.push(`${a ? a.name : id} lost`);
          }
          break;
        }
        case 'loyal': {
          let n = 0;
          for (const id of v.aboard) {
            if (n >= val) break;
            if (isLoyal(v, id)) continue;
            makeLoyal(v, id);
            n++;
          }
          if (n) told.push(`${n} will not leave you`);
          break;
        }
        case 'beds':
          v.bonusBeds = (v.bonusBeds || 0) + val;
          told.push(`+${val} beds`);
          break;
        case 'berths':
          v.bonusBerths = (v.bonusBerths || 0) + val;
          told.push(`+${val} pens`);
          break;
        case 'stat':
          for (const k of Object.keys(val)) v.stats[k] = (v.stats[k] || 0) + val[k];
          break;
        case 'flag':
          v.flags[val] = true;
          told.push(FLAGS[val] || val);
          break;
        default: break;
      }
    }
  }
  markEncounter(v, e);
  say(v, `${e.title}: ${opt.label.toLowerCase()}.`, 'parch');
  return told;
}

/** Every flag currently true, with what it means, for the HUD and the summary. */
export function activeFlags(v) {
  return Object.keys(FLAGS).filter((k) => v.flags[k]).map((k) => ({ id: k, text: FLAGS[k] }));
}

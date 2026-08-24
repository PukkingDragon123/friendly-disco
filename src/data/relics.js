// The relic layer: 47 joker-slot artefacts, each one a little patch on the scoring
// pipeline (DESIGN 9.5).
//
// WHY THE HOOKS LOOK SO PARANOID
// A relic is called from four different places, and each of them hands over a slightly
// different context object:
//   * scoring.js  makeRelicCtx()  -> full ctx, residents/potted/table/deck hold ANIMAL
//                                    OBJECTS, rng may be undefined (previewPot)
//   * run.js      relicCtx()      -> residents is run.vitrine, i.e. arrays of animal IDS,
//                                    and `potted` is always empty
//   * table.js    onPot           -> ctx is only { run, relic, log }: no addMoney, no rng
//   * tests/run.mjs               -> fuzzes every hook with random junk, no habitatId
// So every hook reads through the small normalisers below instead of trusting a shape,
// and every number goes through num(). A relic that throws is a relic that eats a run.
//
// WHAT A HOOK MAY TOUCH
//   res.chips / res.mult / res.xmult / res.money / res.consumed   (the animal being scored)
//   ctx.relic.state                                              (per-run, deep cloned)
//   ctx.log(text, colorKey) / ctx.addMoney(n) / ctx.consumeAnimal(id)
//   run tunables, from modifyRun() only: shots reracks gateScale guideLen railChips
//                 crateSlots handSize relicSlots rerollCost interest sellBonus crateDiscount
// Nothing else. No DOM, no scene imports, no Math.random, no Date.now.
//
// STATE AND PREVIEWS
// scoring.previewPot() runs the whole pipeline for the aim tooltip against the REAL run,
// so onScoreAnimal must never grow a counter — a preview would inflate it. Counters live
// in onPot / onShotEnd / onBlindStart (only ever called for real events), and per-shot
// memory is keyed on ctx.shotIndex and reset when the animal being scored is the first of
// its shot. See tally_stick and mockingbird_quill.
//
// BALANCE (DESIGN section 10: exact pot = chips x3, mult +2)
// A common animal sunk at home is ~330 score. Commons here are worth +5..25% of that,
// uncommons ~+40%, rares change how you aim, legendaries change how you build. Prices:
// common 3-5, uncommon 5-6, rare 7-8, legendary 9-10.

import { HABITATS, HABITAT_BY_ID, affinity } from './habitats.js';
import { ANIMAL_BY_ID } from './animals.js';

/* ------------------------------------------------------------------ helpers */

const EMPTY = [];
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

/** Tags of the animal being scored, whichever way `res` was built. */
function tagsOf(res) {
  if (!res) return EMPTY;
  if (Array.isArray(res.tags)) return res.tags;
  if (res.animal && Array.isArray(res.animal.tags)) return res.animal.tags;
  return EMPTY;
}
function isA(res, tag) { return tagsOf(res).indexOf(tag) >= 0; }

/** ctx lists arrive as animal objects (scoring) or as animal ids (run.vitrine). */
function asAnimals(list) {
  if (!Array.isArray(list) || !list.length) return EMPTY;
  const out = [];
  for (const e of list) {
    if (!e) continue;
    if (typeof e === 'string') { const a = ANIMAL_BY_ID[e]; if (a) out.push(a); }
    else if (e.id) out.push(e);
  }
  return out;
}
function countTag(list, tag) {
  let n = 0;
  for (const a of asAnimals(list)) if (a.tags && a.tags.indexOf(tag) >= 0) n++;
  return n;
}
function residentsOf(ctx, habitatId) {
  if (!ctx || !ctx.residents || !habitatId) return EMPTY;
  return asAnimals(ctx.residents[habitatId]);
}
/** relic.state is always a per-run clone; make one if a caller forgot. */
function stateOf(ctx) {
  const r = ctx && ctx.relic;
  if (!r) return {};
  if (!r.state || typeof r.state !== 'object') r.state = {};
  return r.state;
}
function say(ctx, txt, color) {
  if (ctx && typeof ctx.log === 'function') ctx.log(txt, color || 'brass3');
}
function pay(ctx, n) {
  if (ctx && typeof ctx.addMoney === 'function') ctx.addMoney(num(n));
}
/** Two ctx list entries (or a res.animal) pointing at the same roster row. */
function sameAnimal(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const ai = typeof a === 'string' ? a : a.id;
  const bi = typeof b === 'string' ? b : b.id;
  return !!ai && ai === bi;
}
/** True when `res` is the first animal sunk in its shot (so combos read left to right). */
function firstOfShot(res, ctx) {
  const p = ctx && ctx.potted;
  if (!Array.isArray(p) || !p.length || !res || !res.animal) return false;
  return sameAnimal(p[0], res.animal);
}
/** The habitats actually open this blind, falling back to the canonical nine. */
function openHabitats(ctx) {
  const a = ctx && ctx.run && ctx.run.assignment;
  if (a && typeof a === 'object') {
    const ids = [];
    for (const k of Object.keys(a)) {
      const id = a[k];
      if (typeof id === 'string' && HABITAT_BY_ID[id] && ids.indexOf(id) < 0) ids.push(id);
    }
    if (ids.length) return ids;
  }
  return HABITATS.map((h) => h.id);
}
function habName(id) { return (HABITAT_BY_ID[id] && HABITAT_BY_ID[id].name) || String(id || '???'); }

/* ------------------------------------------------------------------ relics */

export const RELICS = [

  /* ==================================================== COMMON — flat scorers */
  {
    id: 'salt_lick', name: 'Salt Lick',
    rarity: 'common', price: 3,
    desc: '+15 Chips for every animal you pot, wherever it lands',
    art: { icon: 'hay', bg: 'wood2', fg: 'sand' },
    tags: ['scoring'],
    hooks: {
      onScoreAnimal(res) { res.chips += 15; },
    },
  },
  {
    id: 'zookeeper_whistle', name: "Zookeeper's Whistle",
    rarity: 'common', price: 5,
    desc: '+2 Mult for each animal sunk into its true habitat',
    art: { icon: 'whistle', bg: 'brass1', fg: 'brass3' },
    tags: ['scoring'],
    hooks: {
      onScoreAnimal(res, ctx) {
        if (res.match === 'exact') { res.mult += 2; say(ctx, 'Good animal!', 'gold'); }
      },
    },
  },
  {
    id: 'wrong_way_charm', name: 'Wrong-Way Charm',
    rarity: 'common', price: 4,
    desc: 'Wrong-habitat pots lose no Chips or Mult, and gain x1.5 Mult',
    art: { icon: 'arrow_l', bg: 'deep', fg: 'purple1' },
    tags: ['scoring'],
    hooks: {
      onScoreAnimal(res, ctx) {
        // step 3 charged a wrong pot chips x0.25 and -1 Mult; hand both back, then tip.
        // Refunding is the whole point: x1.5 on a quartered pot is worth nothing.
        if (res.match === 'wrong') {
          res.chips += num(res.animal && res.animal.chips, 10) * 0.75;
          res.mult += 1;
          res.xmult *= 1.5;
          say(ctx, 'Lost, not wasted', 'purple1');
        }
      },
    },
  },

  /* ============================================== COMMON — tag-conditional */
  {
    id: 'hunters_horn', name: "Hunter's Horn",
    rarity: 'common', price: 4,
    desc: '+30 Chips when the animal potted is a predator',
    art: { icon: 'horn', bg: 'wood1', fg: 'bone' },
    tags: ['scoring', 'tag'],
    hooks: {
      onScoreAnimal(res) { if (isA(res, 'predator')) res.chips += 30; },
    },
  },
  {
    id: 'feather_charm', name: 'Feather Charm',
    rarity: 'common', price: 4,
    desc: '+3 Mult when the animal potted is a bird',
    art: { icon: 'feather', bg: 'sky', fg: 'white' },
    tags: ['scoring', 'tag'],
    hooks: {
      onScoreAnimal(res) { if (isA(res, 'bird')) res.mult += 3; },
    },
  },
  {
    id: 'brine_flask', name: 'Brine Flask',
    rarity: 'common', price: 4,
    desc: '+40 Chips when the animal potted is aquatic',
    art: { icon: 'drop', bg: 'water0', fg: 'foam' },
    tags: ['scoring', 'tag'],
    hooks: {
      onScoreAnimal(res) { if (isA(res, 'aquatic')) res.chips += 40; },
    },
  },
  {
    id: 'thimble_hutch', name: 'Thimble Hutch',
    rarity: 'common', price: 3,
    desc: '+4 Mult when the animal potted is tiny',
    art: { icon: 'egg', bg: 'bone', fg: 'wood2' },
    tags: ['scoring', 'tag'],
    hooks: {
      onScoreAnimal(res) { if (isA(res, 'tiny')) res.mult += 4; },
    },
  },
  {
    id: 'heavy_yoke', name: 'Heavy Yoke',
    rarity: 'common', price: 4,
    desc: '+55 Chips when the animal potted is big',
    art: { icon: 'anchor', bg: 'grey0', fg: 'grey2' },
    tags: ['scoring', 'tag'],
    hooks: {
      onScoreAnimal(res) { if (isA(res, 'big')) res.chips += 55; },
    },
  },
  {
    id: 'barn_key', name: 'Barn Key',
    rarity: 'common', price: 3,
    desc: '+25 Chips and +1 Mult for every domestic animal potted',
    art: { icon: 'barn', bg: 'red0', fg: 'red2' },
    tags: ['scoring', 'tag'],
    hooks: {
      onScoreAnimal(res) { if (isA(res, 'domestic')) { res.chips += 25; res.mult += 1; } },
    },
  },
  {
    id: 'herd_bell', name: 'Herd Bell',
    rarity: 'common', price: 4,
    desc: '+8 Chips for each herd animal potted in the same shot',
    art: { icon: 'bell', bg: 'brass0', fg: 'brass2' },
    tags: ['scoring', 'tag'],
    hooks: {
      onScoreAnimal(res, ctx) {
        const n = countTag(ctx && ctx.potted, 'herd');
        if (n > 0) res.chips += 8 * n;
      },
    },
  },
  {
    id: 'night_lantern', name: 'Night Lantern',
    rarity: 'common', price: 3,
    desc: '+35 Chips when the animal potted is nocturnal',
    art: { icon: 'moon', bg: 'night', fg: 'ice' },
    tags: ['scoring', 'tag'],
    hooks: {
      onScoreAnimal(res) { if (isA(res, 'nocturnal')) res.chips += 35; },
    },
  },

  /* ================================================= COMMON — habitat + physics */
  {
    id: 'frozen_compass', name: 'Frozen Compass',
    rarity: 'common', price: 4,
    desc: '+45 Chips for every animal potted into the Arctic gate',
    art: { icon: 'snowflake', bg: 'water0', fg: 'ice' },
    tags: ['scoring', 'habitat'],
    hooks: {
      onScoreAnimal(res) { if (res.habitatId === 'frozen') res.chips += 45; },
    },
  },
  {
    id: 'bank_shot_ledger', name: 'Bank-Shot Ledger',
    rarity: 'common', price: 5,
    desc: '+12 Chips for each rail this animal bounced off before sinking',
    art: { icon: 'arrow_r', bg: 'wood1', fg: 'brass2' },
    tags: ['scoring', 'physics'],
    hooks: {
      onScoreAnimal(res, ctx) {
        const b = num(res.ball && res.ball.bounces);
        if (b > 0) { res.chips += 12 * b; say(ctx, b + ' banked', 'brass3'); }
      },
    },
  },
  {
    id: 'opening_break', name: 'Opening Break',
    rarity: 'common', price: 5,
    desc: 'The first animal potted in a shot gets x1.5 Mult',
    art: { icon: 'bolt', bg: 'deep', fg: 'gold' },
    tags: ['scoring', 'physics'],
    hooks: {
      onScoreAnimal(res, ctx) {
        if (firstOfShot(res, ctx)) { res.xmult *= 1.5; say(ctx, 'First blood', 'gold'); }
      },
    },
  },

  /* ==================================================== COMMON — economy + kit */
  {
    id: 'tip_jar', name: 'Tip Jar',
    rarity: 'common', price: 3,
    desc: 'Every animal you pot tips you $1',
    art: { icon: 'coin', bg: 'brass0', fg: 'gold' },
    tags: ['economy'],
    hooks: {
      onScoreAnimal(res) { res.money += 1; },
    },
  },
  {
    id: 'harbour_gossip', name: 'Harbour Gossip',
    rarity: 'common', price: 4,
    desc: 'Rerolling the dock manifest costs $2 less, never below $1',
    art: { icon: 'dice', bg: 'wood2', fg: 'bone' },
    tags: ['economy', 'shop'],
    hooks: {
      modifyRun(run) { if (run) run.rerollCost = Math.max(1, num(run.rerollCost, 3) - 2); },
    },
  },
  {
    id: 'pawnbrokers_lens', name: "Pawnbroker's Lens",
    rarity: 'common', price: 4,
    desc: 'Selling a relic pays $2 more',
    art: { icon: 'eye', bg: 'purple0', fg: 'ice' },
    tags: ['economy', 'shop'],
    hooks: {
      modifyRun(run) { if (run) run.sellBonus = num(run.sellBonus, 0) + 2; },
    },
  },
  {
    id: 'rack_ratchet', name: 'Rack Ratchet',
    rarity: 'common', price: 4,
    desc: '+1 rerack in every blind',
    art: { icon: 'gear', bg: 'grey0', fg: 'brass2' },
    tags: ['structure'],
    hooks: {
      modifyRun(run) { if (run) run.reracks = num(run.reracks, 3) + 1; },
    },
  },
  {
    id: 'long_chalk', name: 'Long Chalk',
    rarity: 'common', price: 3,
    desc: 'The aim guide reaches much further down the felt',
    art: { icon: 'chalk', bg: 'cloth0', fg: 'white' },
    tags: ['structure'],
    hooks: {
      modifyRun(run) { if (run) run.guideLen = num(run.guideLen, 46) + 30; },
    },
  },
  {
    id: 'cushion_wax', name: 'Cushion Wax',
    rarity: 'common', price: 4,
    desc: 'Every rail cushion is worth 3 more Chips when scoring',
    art: { icon: 'wave', bg: 'wood1', fg: 'wood4' },
    tags: ['structure', 'physics'],
    hooks: {
      modifyRun(run) { if (run) run.railChips = num(run.railChips, 4) + 3; },
    },
  },

  /* ================================================= UNCOMMON — tag + habitat */
  {
    id: 'gilded_crown', name: 'Gilded Crown',
    rarity: 'uncommon', price: 5,
    desc: 'x1.4 Mult when the animal potted is majestic',
    art: { icon: 'star', bg: 'brass1', fg: 'gold' },
    tags: ['scoring', 'tag'],
    hooks: {
      onScoreAnimal(res, ctx) {
        if (isA(res, 'majestic')) { res.xmult *= 1.4; say(ctx, 'Regal', 'gold'); }
      },
    },
  },
  {
    id: 'venom_vial', name: 'Venom Vial',
    rarity: 'uncommon', price: 5,
    desc: 'x1.6 Mult when the animal potted is venomous',
    art: { icon: 'skull', bg: 'moss', fg: 'green1' },
    tags: ['scoring', 'tag'],
    hooks: {
      onScoreAnimal(res, ctx) {
        if (isA(res, 'venomous')) { res.xmult *= 1.6; say(ctx, 'Envenomed', 'green1'); }
      },
    },
  },
  {
    id: 'jungle_idol', name: 'Jungle Idol',
    rarity: 'uncommon', price: 5,
    desc: 'x1.5 Mult for every animal potted into the Jungle gate',
    art: { icon: 'leaf', bg: 'moss', fg: 'green1' },
    tags: ['scoring', 'habitat'],
    hooks: {
      onScoreAnimal(res, ctx) {
        if (res.habitatId === 'bushy') { res.xmult *= 1.5; say(ctx, 'The idol wakes', 'green1'); }
      },
    },
  },
  {
    id: 'shepherds_crook', name: "Shepherd's Crook",
    rarity: 'uncommon', price: 6,
    desc: '+1 Mult per animal already living in that gate, up to +6',
    art: { icon: 'sheep', bg: 'cloth1', fg: 'bone' },
    tags: ['scoring', 'habitat'],
    hooks: {
      onScoreAnimal(res, ctx) {
        const n = Math.min(6, residentsOf(ctx, res.habitatId).length);
        if (n > 0) { res.mult += n; say(ctx, 'Flock of ' + n, 'sky'); }
      },
    },
  },

  /* =============================================== UNCOMMON — interactions */
  {
    id: 'mercy_muzzle', name: 'Mercy Muzzle',
    rarity: 'uncommon', price: 6,
    desc: 'Eaten animals survive; the eater still gains +30 Chips each',
    art: { icon: 'heart', bg: 'red0', fg: 'pink' },
    tags: ['interaction'],
    hooks: {
      onScoreAnimal(res, ctx) {
        const eaten = Array.isArray(res.consumed) ? res.consumed.length : 0;
        if (eaten > 0) {
          res.chips += 30 * eaten;
          res.consumed.length = 0;            // spared: run.js never removes them
          say(ctx, 'Spared ' + eaten, 'pink');
        }
      },
    },
  },
  {
    id: 'gluttons_bib', name: "Glutton's Bib",
    rarity: 'uncommon', price: 6,
    desc: 'An animal that devours doubles its interaction Chips',
    art: { icon: 'fishbone', bg: 'wood1', fg: 'bone' },
    tags: ['interaction'],
    hooks: {
      onScoreAnimal(res, ctx) {
        const eaten = Array.isArray(res.consumed) ? res.consumed.length : 0;
        const gained = Math.max(0, num(res.interChips));
        if (eaten > 0 && gained > 0) { res.chips += gained; say(ctx, 'Second helping', 'red2'); }
      },
    },
  },

  /* ================================================== UNCOMMON — economy */
  {
    id: 'usurers_abacus', name: "Usurer's Abacus",
    rarity: 'uncommon', price: 5,
    desc: 'Interest paid when you beat a blind is doubled',
    art: { icon: 'gem', bg: 'purple0', fg: 'purple1' },
    tags: ['economy'],
    hooks: {
      modifyRun(run) { if (run) run.interest = num(run.interest, 1) + 1; },
    },
  },
  {
    id: 'dockside_discount', name: 'Dockside Discount',
    rarity: 'uncommon', price: 5,
    desc: 'Every crate on the dock manifest costs $2 less',
    art: { icon: 'minus', bg: 'wood2', fg: 'green1' },
    tags: ['economy', 'shop'],
    hooks: {
      // cargo.js cratePrice() reads run.crateDiscount (see the report in DESIGN 9.7)
      modifyRun(run) { if (run) run.crateDiscount = num(run.crateDiscount, 0) + 2; },
    },
  },
  {
    id: 'manifest_clipboard', name: 'Manifest Clipboard',
    rarity: 'uncommon', price: 6,
    desc: '+1 extra crate offered on every dock manifest',
    art: { icon: 'crate', bg: 'wood2', fg: 'wood4' },
    tags: ['economy', 'shop'],
    hooks: {
      modifyRun(run) { if (run) run.crateSlots = num(run.crateSlots, 3) + 1; },
    },
  },
  {
    id: 'curio_shelf', name: 'Curio Shelf',
    rarity: 'uncommon', price: 6,
    desc: '+1 relic slot on the ribbon',
    art: { icon: 'shell', bg: 'deep', fg: 'ice' },
    tags: ['structure', 'shop'],
    hooks: {
      modifyRun(run) { if (run) run.relicSlots = num(run.relicSlots, 5) + 1; },
    },
  },

  /* ================================================= UNCOMMON — structure */
  {
    id: 'spare_cue', name: 'Spare Cue',
    rarity: 'uncommon', price: 6,
    desc: '+1 shot in every blind',
    art: { icon: 'cue', bg: 'wood1', fg: 'wood4' },
    tags: ['structure'],
    hooks: {
      modifyRun(run) { if (run) run.shots = num(run.shots, 4) + 1; },
    },
  },
  {
    id: 'harbour_dredge', name: 'Harbour Dredge',
    rarity: 'uncommon', price: 5,
    desc: 'Every habitat gate is 15% wider for the rest of the run',
    art: { icon: 'net', bg: 'water0', fg: 'teal' },
    tags: ['structure'],
    hooks: {
      modifyRun(run) { if (run) run.gateScale = num(run.gateScale, 1) * 1.15; },
    },
  },
  {
    id: 'feed_sack', name: 'Feed Sack',
    rarity: 'uncommon', price: 5,
    desc: '+2 more animals are racked on the felt each blind',
    art: { icon: 'carrot', bg: 'wood2', fg: 'orange' },
    tags: ['structure'],
    hooks: {
      modifyRun(run) { if (run) run.handSize = num(run.handSize, 9) + 2; },
    },
  },
  {
    id: 'iron_ration', name: 'Iron Ration',
    rarity: 'uncommon', price: 6,
    desc: '+60 Chips on every pot, but pots pay no money at all',
    art: { icon: 'lock', bg: 'grey0', fg: 'grey2' },
    tags: ['scoring', 'risky'],
    hooks: {
      onScoreAnimal(res, ctx) {
        res.chips += 60;
        if (num(res.money) !== 0) { res.money = 0; say(ctx, 'No coin, only meat', 'grey2'); }
      },
    },
  },

  /* ================================================= RARE — habitat rotation */
  {
    id: 'weathervane', name: 'Brass Weathervane',
    rarity: 'rare', price: 7,
    desc: 'Each blind favours a new open gate: x1.6 Mult potting into it',
    art: { icon: 'wheel', bg: 'brass1', fg: 'brass3' },
    tags: ['scoring', 'habitat'],
    state: { counter: 0, habitat: 'warm' },
    hooks: {
      onBlindStart(ctx) {
        const st = stateOf(ctx);
        st.counter = num(st.counter) + 1;
        const open = openHabitats(ctx);
        st.habitat = open[st.counter % open.length];
        say(ctx, 'Wind turns: ' + habName(st.habitat), 'sky');
      },
      onScoreAnimal(res, ctx) {
        const st = stateOf(ctx);
        if (res.habitatId && res.habitatId === st.habitat) {
          res.xmult *= 1.6;
          say(ctx, 'Downwind bonus', 'sky');
        }
      },
    },
  },

  /* =================================================== RARE — interactions */
  {
    id: 'inverted_ledger', name: 'Inverted Ledger',
    rarity: 'rare', price: 7,
    desc: 'Interaction penalties are flipped into bonuses of equal size',
    art: { icon: 'scroll', bg: 'deep', fg: 'green1' },
    tags: ['interaction'],
    hooks: {
      onScoreAnimal(res, ctx) {
        const c = num(res.interChips), m = num(res.interMult);
        if (c < 0) res.chips += -2 * c;        // -60 becomes +60
        if (m < 0) res.mult += -2 * m;
        if (c < 0 || m < 0) say(ctx, 'Spite into spirit', 'green1');
      },
    },
  },
  {
    id: 'mockingbird_quill', name: 'Mockingbird Quill',
    rarity: 'rare', price: 8,
    desc: 'Each animal repeats the interaction gains of the one before it',
    art: { icon: 'chicken', bg: 'purple0', fg: 'purple1' },
    tags: ['interaction'],
    state: { shot: -1, ix: 0, chips: 0, mult: 0 },
    hooks: {
      onScoreAnimal(res, ctx) {
        const st = stateOf(ctx);
        const p = Array.isArray(ctx && ctx.potted) ? ctx.potted : EMPTY;
        const si = num(ctx && ctx.shotIndex, -1);
        // Walk the shot by POSITION, and restart the walk whenever the animal handed
        // over is not the one we expect next: a new shot, a one-animal pass (which is
        // exactly what an aim preview looks like), or a replay. Position beats identity
        // here because a shot can hold two of the same species.
        if (st.shot !== si || p.length <= 1 || !sameAnimal(p[num(st.ix)], res.animal)) {
          st.shot = si; st.ix = 0; st.chips = 0; st.mult = 0;
        }
        if (num(st.ix) > 0) {
          const c = num(st.chips), m = num(st.mult);
          if (c || m) { res.chips += c; res.mult += m; say(ctx, 'Mockingbird', 'purple1'); }
        }
        st.chips = num(res.interChips);
        st.mult = num(res.interMult);
        st.ix = num(st.ix) + 1;
      },
      onShotEnd(ctx) {
        const st = stateOf(ctx);
        st.shot = -1; st.ix = 0; st.chips = 0; st.mult = 0;
      },
    },
  },

  /* ====================================================== RARE — the felt */
  {
    id: 'clean_sweep_bounty', name: 'Clean Sweep Bounty',
    rarity: 'rare', price: 7,
    desc: 'A shot that clears the felt: x2 Mult on each animal, then +$5',
    art: { icon: 'check', bg: 'cloth1', fg: 'gold' },
    tags: ['scoring', 'physics', 'economy'],
    hooks: {
      onScoreAnimal(res, ctx) {
        // scoring snapshots tableAnimals AFTER the balls settle, so empty == swept
        const left = ctx && ctx.tableAnimals;
        if (Array.isArray(left) && left.length === 0) {
          res.xmult *= 2;
          say(ctx, 'Clean felt!', 'gold');
        }
      },
      onShotEnd(ctx) {
        const left = ctx && ctx.tableAnimals;
        if (Array.isArray(left) && left.length === 0) { pay(ctx, 5); say(ctx, 'Sweep bounty +$5', 'gold'); }
      },
    },
  },
  {
    id: 'smugglers_net', name: "Smuggler's Net",
    rarity: 'rare', price: 7,
    desc: 'Pot 3 or more animals in one shot: +90 Chips for each of them',
    art: { icon: 'boat', bg: 'wood1', fg: 'teal' },
    tags: ['scoring', 'physics'],
    hooks: {
      onScoreAnimal(res, ctx) {
        const n = Array.isArray(ctx && ctx.potted) ? ctx.potted.length : 0;
        if (n >= 3) { res.chips += 90; say(ctx, 'Full net x' + n, 'teal'); }
      },
    },
  },

  /* ================================================ RARE — grow and decay */
  {
    id: 'tally_stick', name: 'Notched Tally Stick',
    rarity: 'rare', price: 8,
    desc: '+0.5 Mult per animal sent home this run, up to +10',
    art: { icon: 'plus', bg: 'wood1', fg: 'sand' },
    tags: ['scoring', 'growth'],
    state: { counter: 0 },
    hooks: {
      // counted in onPot, which only ever fires for a real ball — an aim preview
      // must not be able to carve a notch
      onPot(pot, ctx) {
        const st = stateOf(ctx);
        const a = pot && pot.animal, g = pot && pot.gate;
        if (!a || !g) return;
        const home = a.id === 'chameleon' || a.home === g.habitatId;
        if (home) st.counter = Math.min(20, num(st.counter) + 1);
      },
      onScoreAnimal(res, ctx) {
        const n = Math.min(20, Math.max(0, num(stateOf(ctx).counter)));
        if (n > 0) res.mult += n * 0.5;
      },
    },
  },
  {
    id: 'rotten_apple', name: 'Rotten Apple',
    rarity: 'rare', price: 7,
    desc: 'x2 Mult on every pot, fading by 0.1 a blind, never past x1',
    art: { icon: 'clock', bg: 'moss', fg: 'rust' },
    tags: ['scoring', 'growth', 'risky'],
    state: { mult: 2 },
    hooks: {
      onScoreAnimal(res, ctx) {
        const m = Math.max(1, num(stateOf(ctx).mult, 1));
        if (m > 1) { res.xmult *= m; say(ctx, 'Sweet rot x' + m.toFixed(1), 'rust'); }
      },
      onBlindEnd(ctx) {
        const st = stateOf(ctx);
        st.mult = Math.max(1, Math.round((num(st.mult, 2) - 0.1) * 100) / 100);
      },
    },
  },

  /* ========================================================= RARE — risky */
  {
    id: 'poachers_wager', name: "Poacher's Wager",
    rarity: 'rare', price: 7,
    desc: 'x3 Mult on every pot, but a wrong-habitat pot scores nothing',
    art: { icon: 'sword', bg: 'red0', fg: 'red2' },
    tags: ['scoring', 'risky'],
    hooks: {
      onScoreAnimal(res, ctx) {
        if (res.match === 'wrong') {
          res.chips = 0;
          say(ctx, 'Wager lost', 'red2');
        } else { res.xmult *= 3; say(ctx, 'Wager paid', 'gold'); }
      },
    },
  },
  {
    id: 'dynamite_cue', name: 'Dynamite Cue',
    rarity: 'rare', price: 8,
    desc: 'x2.5 Mult on every pot, but one fewer shot in every blind',
    art: { icon: 'flame', bg: 'red0', fg: 'orange' },
    tags: ['scoring', 'risky', 'structure'],
    hooks: {
      modifyRun(run) { if (run) run.shots = Math.max(1, num(run.shots, 4) - 1); },
      onScoreAnimal(res) { res.xmult *= 2.5; },
    },
  },
  {
    id: 'blood_price', name: 'Blood Price',
    rarity: 'rare', price: 8,
    desc: 'x1.3 Mult on all pots; a caravan animal is lost each blind',
    art: { icon: 'bone', bg: 'red0', fg: 'bone' },
    tags: ['scoring', 'risky'],
    hooks: {
      onScoreAnimal(res) { res.xmult *= 1.3; },
      onBlindEnd(ctx) {
        const run = ctx && ctx.run;
        if (!run || !Array.isArray(run.caravan)) return;
        if (run.caravan.length <= 8) { say(ctx, 'The debt waits', 'grey2'); return; }
        const rng = ctx.rng;
        const id = (rng && typeof rng.pick === 'function') ? rng.pick(run.caravan)
          : run.caravan[run.caravan.length - 1];
        if (id && typeof ctx.consumeAnimal === 'function') {
          ctx.consumeAnimal(id);
          say(ctx, 'Blood price: ' + id, 'red2');
        }
      },
    },
  },

  /* ==================================================== LEGENDARY — reshapers */
  {
    id: 'ark_covenant', name: 'The Ark Covenant',
    rarity: 'legendary', price: 10,
    desc: 'Partial and wrong pots pay exactly as if the animal were home',
    art: { icon: 'key', bg: 'brass1', fg: 'brass3' },
    tags: ['scoring', 'legendary'],
    hooks: {
      onScoreAnimal(res, ctx) {
        // undo step 3 and re-pay it at the exact-match rate (chips x3, mult +2)
        const base = num(res.animal && res.animal.chips, 10);
        if (res.match === 'wrong') {
          res.chips += base * 2.75;
          res.mult += 3;
          say(ctx, 'Every gate is home', 'gold');
        } else if (res.match === 'partial') {
          const a = res.animal ? affinity(res.animal.home, res.habitatId) : 0;
          res.chips += base * (2 - Math.max(0, Math.min(1, a)));
          res.mult += 1;
          say(ctx, 'Every gate is home', 'gold');
        }
      },
    },
  },
  {
    id: 'midas_trough', name: 'Midas Trough',
    rarity: 'legendary', price: 9,
    desc: 'Every pot pays $2 and gains +1 Mult per $5 you are holding',
    art: { icon: 'pig', bg: 'brass1', fg: 'gold' },
    tags: ['economy', 'legendary'],
    hooks: {
      onScoreAnimal(res, ctx) {
        res.money += 2;
        const held = Math.min(15, Math.floor(num(ctx && ctx.run && ctx.run.money) / 5));
        if (held > 0) { res.mult += held; say(ctx, 'Fat purse +' + held, 'gold'); }
      },
    },
  },
  {
    id: 'perpetual_ark', name: 'The Perpetual Ark',
    rarity: 'legendary', price: 10,
    desc: '+1 shot, and +0.15 Mult per animal you have potted this run',
    art: { icon: 'compass', bg: 'deep', fg: 'ice' },
    tags: ['scoring', 'growth', 'legendary'],
    hooks: {
      modifyRun(run) { if (run) run.shots = num(run.shots, 4) + 1; },
      onScoreAnimal(res, ctx) {
        // run.stats.potted only advances in applyShot, so previews cannot inflate it
        const p = num(ctx && ctx.run && ctx.run.stats && ctx.run.stats.potted);
        const add = Math.min(30, p * 0.15);
        if (add > 0) { res.mult += add; say(ctx, 'The ark remembers', 'ice'); }
      },
    },
  },
];

/* --------------------------------------------------------------- lookups */

export const RELIC_BY_ID = Object.freeze(
  RELICS.reduce((m, r) => { m[r.id] = r; return m; }, {}),
);

/** Shop weighting per rarity, before o.rarityBoost tilts it. */
export const RELIC_RARITY_WEIGHT = { common: 100, uncommon: 44, rare: 15, legendary: 3 };
const RARITY_TIER = { common: 0, uncommon: 1, rare: 2, legendary: 3 };

/** Every relic of a rarity — handy for crate contents in cargo.js. */
export function relicsByRarity(rarity) { return RELICS.filter((r) => r.rarity === rarity); }
/** Every relic carrying a tag ('scoring' 'economy' 'structure' 'interaction' ...). */
export function relicsByTag(tag) { return RELICS.filter((r) => (r.tags || []).indexOf(tag) >= 0); }

/**
 * Offer n relics.
 *   rollRelics(rng, 3, { owned:['tip_jar'], rarityBoost:0.5, rarity:'rare', tag:'economy' })
 * `owned` takes ids or relic objects (run.relics works as-is). Never returns a duplicate
 * and never returns something already owned; returns fewer than n if the pool runs dry.
 * rarityBoost multiplies each step up the rarity ladder, so 1 makes rares twice as likely
 * as normal and legendaries eight times.
 */
export function rollRelics(rng, n = 1, o = {}) {
  const opts = o || {};
  const owned = new Set();
  for (const e of opts.owned || []) {
    if (typeof e === 'string') owned.add(e);
    else if (e && e.id) owned.add(e.id);
  }
  const boost = Math.max(0, num(opts.rarityBoost, 0));
  let pool = RELICS.filter((r) => !owned.has(r.id));
  if (opts.rarity) pool = pool.filter((r) => r.rarity === opts.rarity);
  if (opts.tag) pool = pool.filter((r) => (r.tags || []).indexOf(opts.tag) >= 0);
  if (opts.maxPrice) pool = pool.filter((r) => num(r.price, 99) <= num(opts.maxPrice, 99));

  const want = Math.max(0, Math.min(Math.floor(num(n, 1)), pool.length));
  const pairs = pool.map((r) => [
    r,
    Math.max(0.001, num(RELIC_RARITY_WEIGHT[r.rarity], 10) * Math.pow(1 + boost, num(RARITY_TIER[r.rarity]))),
  ]);

  const out = [];
  while (out.length < want && pairs.length) {
    let pick;
    if (rng && typeof rng.weighted === 'function') pick = rng.weighted(pairs);
    else if (rng && typeof rng.int === 'function') pick = pairs[rng.int(pairs.length)][0];
    else pick = pairs[0][0];
    const ix = pairs.findIndex((p) => p[0] === pick);
    if (ix < 0) break;                        // rng handed back something not in the pool
    pairs.splice(ix, 1);
    out.push(pick);
  }
  return out;
}

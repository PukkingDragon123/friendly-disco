// Run state: the roguelike wrapper around the pool table.
//
// A run is 8 antes x 3 blinds. Between blinds you visit the dock and a boat brings you
// one crate. Everything a scene needs to know lives on the `run` object, and every
// mutation goes through a function here so relics/vouchers/upgrades have one place to hook.

import { makeRng, randomSeedString } from '../core/rng.js';
import { ANIMAL_BY_ID, STARTER_STOCK, DRAFT_SIZE } from '../data/animals.js';
import { HABITATS, HABITAT_BY_ID, GATE_LAYOUT } from '../data/habitats.js';
import { RELIC_BY_ID } from '../data/relics.js';
import { ANTES, BLIND_KINDS, blindTarget, rollBoss, neutralEffect } from '../data/blinds.js';
import { CUE_UPGRADES, FEEDS, VOUCHERS, applyHabitatUpgrade } from '../data/cargo.js';

export const BLIND_ORDER = ['small', 'big', 'boss'];

/** Baseline run stats. Cue upgrades and vouchers mutate these. */
function baseRun(seed) {
  return {
    seed,
    rng: makeRng(seed + '/run'),
    ante: 1,
    blindIx: 0,                 // index into BLIND_ORDER
    money: 6,
    won: false,
    dead: false,

    // --- the flock you own, and the eight you chose to bring
    //
    // STOCK is everything on the farm: five chickens, three pigs, three cows, two
    // sheep. CARAVAN is the eight head you actually walked up the ramp, chosen in the
    // draft, and it is what a blind racks. The other five stay behind and drown,
    // which is the first real decision of the run and is not a nice one.
    stock: STARTER_STOCK.slice(),
    caravan: [],
    drafted: false,
    hand: [],                   // animal ids currently racked
    stash: [],                  // caravan ids not yet drawn this blind
    vitrine: {},                // habitatId -> [animal ids] delivered this blind

    // --- loadout
    relics: [],
    // the Cherubim's card, armed for the next blind only. The bless* fields are
    // initialised HERE as well as in clearBlessing() so a fresh run and a run that has
    // just finished a round have the identical shape -- otherwise "did the blessing
    // leak" is not a question you can answer by comparing two runs.
    blessing: null,
    seenBlessings: [],
    blessXMult: 1,
    blessChips: 0,
    blessInteract: 1,
    blessRailMult: 0,
    blessFloodGrace: 0,
    blessAllHome: false,
    blessFullPower: false,
    blessDoubleMoney: false,
    blessGild: false,
    blessDeath: false,
    blessNoPools: false,
    blessTripleFirst: false,
    blessClosedPay: false,
    blessSunCoin: false,
    blessOverflowPay: false,
    feeds: [],
    vouchers: [],
    cueUpgrades: [],
    habitatLevels: {},

    // --- tunables (cargo.js documents that it mutates exactly these)
    power: 1,
    spin: 0.6,
    guideLen: 46,
    guideBounces: 1,
    railChips: 4,
    shots: 4,
    reracks: 3,
    gateScale: 1,
    crateSlots: 3,
    rerollCost: 3,
    interest: 1,
    crateDiscount: 0,     // flat $ off every crate (relics/vouchers raise it)
    sellBonus: 0,
    handSize: 9,
    relicSlots: 5,
    breakBonus: 0,
    spinDrift: 1,

    // --- per-blind
    feedChips: {},        // animalId -> chips granted by a feed this blind
    feedMult: {},         // animalId -> mult granted by a feed this blind
    flood: 0,             // 0 = dry rail, 1 = the water has the deck
    floodPerShot: 0.25,   // how much of the hull the water claims per shot
    shotsLeft: 4,
    reracksLeft: 3,
    score: 0,
    target: 0,
    blind: null,
    pendingBoss: null,
    seenBosses: [],
    seenScripts: [],       // story beats already played, so nothing repeats on a re-run
    scoredHabitatsThisBlind: [],
    assignment: {},

    stats: {
      shotsTaken: 0, potted: 0, exact: 0, wrong: 0, eaten: 0,
      bestShot: 0, moneyEarned: 0, blindsCleared: 0, cratesBought: 0,
    },
    log: [],
  };
}

export function newRun(seed) {
  const s = seed || randomSeedString('boot');
  const run = baseRun(s);
  return run;
}

/* ------------------------------------------------------------- habitat gates */

/**
 * Pick which 6 of the 9 habitats are open this blind.
 * Weighted by what is actually in your caravan, so a run never becomes unplayable —
 * but always seeded with one wildcard so you must adapt.
 */
export function rollAssignment(run, rng, closed = []) {
  const counts = {};
  for (const id of run.caravan) {
    const a = ANIMAL_BY_ID[id];
    if (a) counts[a.home] = (counts[a.home] || 0) + 1;
  }
  const pool = HABITATS.filter((h) => !closed.includes(h.id));
  const weighted = pool.map((h) => [h.id, 1 + (counts[h.id] || 0) * 2.2 + (run.habitatLevels[h.id] || 0) * 3]);

  const picked = [];
  const take = Math.min(6, pool.length);
  // guarantee the two best-represented habitats so there is always somewhere to score
  const ranked = weighted.slice().sort((a, b) => b[1] - a[1]);
  for (const r of ranked.slice(0, 2)) picked.push(r[0]);
  while (picked.length < take) {
    const cand = weighted.filter((w) => !picked.includes(w[0]));
    if (!cand.length) break;
    picked.push(rng.weighted(cand));
  }
  // one wildcard swap keeps blinds from feeling samey
  if (picked.length === 6 && pool.length > 6 && rng.chance(0.55)) {
    const outsider = pool.find((h) => !picked.includes(h.id));
    if (outsider) picked[4 + rng.int(2)] = outsider.id;
  }

  const shuffled = rng.shuffle(picked);
  const assignment = {};
  GATE_LAYOUT.forEach((slot, i) => { assignment[slot] = shuffled[i % shuffled.length]; });
  return assignment;
}

/* -------------------------------------------------------------- blessings */

// Every field a blessing may set. Listed once, in one place, because the whole
// one-round guarantee rests on this list being complete.
const BLESS_FIELDS = [
  'blessXMult', 'blessChips', 'blessAllHome', 'blessInteract', 'blessFullPower',
  'blessDoubleMoney', 'blessGild', 'blessFloodGrace', 'blessDeath', 'blessNoPools',
  'blessTripleFirst', 'blessRailMult', 'blessClosedPay', 'blessSunCoin',
  'blessOverflowPay',
];

/** Wipe last round's blessing effects. Called at the top of every blind. */
export function clearBlessing(run) {
  run.blessXMult = 1;
  run.blessChips = 0;
  run.blessInteract = 1;
  run.blessRailMult = 0;
  run.blessFloodGrace = 0;
  for (const k of BLESS_FIELDS) {
    if (typeof run[k] === 'boolean' || run[k] === undefined) run[k] = false;
  }
  run.blessXMult = 1;
  run.blessChips = 0;
  run.blessInteract = 1;
  run.blessRailMult = 0;
  run.blessFloodGrace = 0;
}

/** Take a blessing from the Cherubim. It arms for the NEXT blind and then expires. */
export function takeBlessing(run, blessing) {
  run.blessing = blessing || null;
  if (blessing) run.seenBlessings = (run.seenBlessings || []).concat([blessing.id]);
  return run.blessing;
}

/* ------------------------------------------------------------------ draft */

/**
 * What the draft screen needs to show.
 *
 * The berths for the first blind are rolled HERE, from the stock rather than from the
 * (still empty) caravan, and cached on the run. That is what turns the draft from a
 * blind guess into a decision: you can see the six conditions the deck is going to
 * offer before you pick which eight animals to walk up the ramp.
 */
export function beginDraft(run) {
  if (!run.draftAssignment) {
    const rng = run.rng.fork('draft');
    // roll against the stock, since the caravan does not exist yet
    const saved = run.caravan;
    run.caravan = run.stock.slice();
    run.draftAssignment = rollAssignment(run, rng, []);
    run.caravan = saved;
  }
  return {
    stock: run.stock.slice(),
    size: DRAFT_SIZE,
    assignment: run.draftAssignment,
  };
}

/**
 * Commit a set of stock INDICES as the caravan. Indices rather than ids because the
 * stock has duplicates -- five chickens are five separate animals you can choose
 * between, not one entry with a count.
 */
export function commitDraft(run, indices) {
  const picked = [];
  const seen = new Set();
  for (const i of indices || []) {
    if (seen.has(i)) continue;
    const id = run.stock[i];
    if (!id) continue;
    seen.add(i);
    picked.push(id);
    if (picked.length >= DRAFT_SIZE) break;
  }
  // A short draft is legal -- if a harness or an impatient player boards with six, the
  // run must still work -- but it is never padded behind their back.
  run.caravan = picked;
  run.left = run.stock.filter((_, i) => !seen.has(i));
  run.drafted = true;
  run.log.push({ text: `${picked.length} aboard, ${run.left.length} left on the bank.`, color: 'brass2' });
  return run.caravan;
}

/** How many the ramp still has room for. */
export function draftRoom(run) {
  return Math.max(0, DRAFT_SIZE - run.caravan.length);
}

/* ----------------------------------------------------------------- blinds */

export function currentKind(run) { return BLIND_ORDER[run.blindIx] || 'small'; }

/**
 * The boss for the upcoming blind, rolled early and stashed.
 * The router needs the boss's identity to play its entrance BEFORE the deck scene
 * exists, and startBlind() must then use the same one rather than rolling again.
 */
export function peekBoss(run) {
  if (currentKind(run) !== 'boss') return null;
  if (run.pendingBoss && run.pendingBoss.ante === run.ante) return run.pendingBoss.boss;
  const rng = run.rng.fork(`boss/${run.ante}`);
  const boss = rollBoss(rng, run.ante, run.seenBosses);
  run.pendingBoss = { ante: run.ante, boss };
  return boss;
}

export function startBlind(run) {
  // A run that reaches a blind without going up the ramp would rack nothing and be
  // unplayable. The router always routes through the draft, but a harness, a console
  // poke or a future save/load might not, so board the best of the stock rather than
  // present an empty deck.
  if (!run.caravan.length && run.stock && run.stock.length) {
    commitDraft(run, run.stock.map((_, i) => i).slice(0, DRAFT_SIZE));
    run.log.push({ text: 'Boarded without choosing — the ramp filled itself.', color: 'grey2' });
  }
  const kind = currentKind(run);
  const rng = run.rng.fork(`blind/${run.ante}/${kind}`);
  const info = BLIND_KINDS.find((b) => b.key === kind) || BLIND_KINDS[0];

  let boss = null;
  let effect = neutralEffect();
  if (kind === 'boss') {
    boss = peekBoss(run);
    run.pendingBoss = null;
    if (boss) {
      run.seenBosses.push(boss.id);
      effect = Object.assign(neutralEffect(), boss.effect || {});
    }
  }

  const blind = {
    ante: run.ante,
    kind,
    name: boss ? boss.name : info.name,
    desc: boss ? boss.desc : '',
    color: boss ? boss.color : info.color,
    icon: boss ? boss.icon : null,
    boss,
    effect,
    reward: info.reward,
    target: blindTarget(run.ante, kind),
    rng,
  };

  run.blind = blind;
  run.target = blind.target;
  run.score = 0;
  run.shotsLeft = Math.max(1, run.shots + (effect.shots || 0));
  run.reracksLeft = Math.max(0, run.reracks + (effect.reracks || 0));
  // The water climbs to the rail over exactly the shots you are given, so at the
  // default rate the flood and the shot counter run out together — and a boss that
  // doubles the rate genuinely drowns you in half the time.
  run.flood = 0;
  run.floodPerShot = (1 / run.shotsLeft) * Math.max(0.1, effect.floodRate || 1);
  run.scoredHabitatsThisBlind = [];
  run.vitrine = {};
  run.feedChips = {};
  run.feedMult = {};

  // --- the Cherubim's blessing: one round, then gone
  //
  // Every bless* field is cleared here and re-applied from the card, so a blessing can
  // never leak into a second round and nothing in the card's apply() has to undo
  // itself. That is what lets the blessings be as large as they are.
  clearBlessing(run);
  if (run.blessing && typeof run.blessing.apply === 'function') {
    try {
      run.blessing.apply(run);
      run.log.push({ text: `${run.blessing.name} is upon you.`, color: run.blessing.color || 'ice' });
    } catch (e) {
      run.log.push({ text: 'The blessing does not take.', color: 'red2' });
      void e;
    }
  }
  run.assignment = rollAssignment(run, rng, effect.closeHabitats || []);

  // caravan -> stash, then draw the opening hand
  run.stash = rng.shuffle(run.caravan);
  run.hand = [];
  drawHand(run);

  for (const relic of run.relics) {
    if (relic.hooks && relic.hooks.onBlindStart) {
      try { relic.hooks.onBlindStart(relicCtx(run, relic)); } catch (e) { warn(relic, e); }
    }
  }
  return blind;
}

/** Fill the felt back up to handSize from the stash. */
export function drawHand(run) {
  const want = Math.max(1, run.handSize);
  const added = [];
  while (run.hand.length < want && run.stash.length) {
    const id = run.stash.shift();
    run.hand.push(id);
    added.push(id);
  }
  return added;
}

export function rerack(run) {
  if (run.reracksLeft <= 0) return false;
  // a re-rack costs time, and time is water — but only a third of a shot's worth
  run.flood = Math.min(0.999, run.flood + (run.floodPerShot || 0.25) * 0.34);
  run.reracksLeft--;
  // unpotted animals go back under the stash, then redraw
  run.stash = run.stash.concat(run.hand);
  run.hand = [];
  drawHand(run);
  return true;
}

export function blindCleared(run) { return run.score >= run.target; }

/** Shots you can still take before the water is over the rail. */
export function movesLeft(run) {
  const per = Math.max(1e-6, run.floodPerShot || 0.25);
  return Math.max(0, Math.min(run.shotsLeft, Math.ceil((1 - run.flood - 1e-9) / per)));
}

export function blindFailed(run) {
  if (run.score >= run.target) return false;
  return run.flood >= 1 - 1e-6 || run.shotsLeft <= 0;
}

/** Commit a resolved shot to the run. Returns a summary for the scene. */
export function applyShot(run, resolved, potted) {
  run.score += resolved.totalScore;
  run.money += resolved.totalMoney;
  run.stats.shotsTaken++;
  run.stats.potted += potted.length;
  run.stats.moneyEarned += resolved.totalMoney;
  run.stats.bestShot = Math.max(run.stats.bestShot, resolved.totalScore);
  run.scoredHabitatsThisBlind = resolved.scoredHabitats || run.scoredHabitatsThisBlind;

  for (const e of resolved.entries) {
    if (e.match === 'exact') run.stats.exact++;
    else if (e.match === 'wrong') run.stats.wrong++;
    if (e.habitatId) {
      if (!run.vitrine[e.habitatId]) run.vitrine[e.habitatId] = [];
      run.vitrine[e.habitatId].push(e.animal.id);
    }
  }

  // devoured animals leave the habitat display and the felt
  for (const id of resolved.consumed || []) {
    run.stats.eaten++;
    for (const hid of Object.keys(run.vitrine)) {
      const ix = run.vitrine[hid].indexOf(id);
      if (ix >= 0) run.vitrine[hid].splice(ix, 1);
    }
  }

  // Sunk animals are spent for this blind — except the ones whose skill sends them
  // back (the dove always, the phoenix when it lands in the wrong gate).
  const returning = new Set(resolved.returned || []);
  for (const p of potted) {
    const ix = run.hand.indexOf(p.animalId);
    if (ix >= 0) run.hand.splice(ix, 1);
    if (returning.has(p.animalId)) run.stash.push(p.animalId);
  }

  run.shotsLeft--;
  // Three things can stop the water for one shot: the Ziz's wings, the Hanged Man's
  // blessing, and nothing else. Checked in that order because the Ziz is a permanent
  // animal skill and the blessing is a consumable -- spending the consumable while a
  // free hold was already available would be a bad trade made on the player's behalf.
  const held = Math.max(0, resolved.floodHeld || 0);
  if (held > 0) {
    run.log.push({ text: 'The Ziz holds the water', color: 'foam' });
  } else if (run.blessFloodGrace > 0) {
    run.blessFloodGrace -= 1;
    run.log.push({ text: 'The Hanged Man: the water waits.', color: 'water3' });
  } else {
    run.flood = Math.min(1, run.flood + (run.floodPerShot || 0.25));
  }

  // The Tithe: a shot that scores too little costs you another one.
  // A value <= 1 is read as a FRACTION of the blind target per shot, so the boss keeps
  // biting at ante 8 instead of becoming trivial against a five-figure target.
  const rawFloor = (run.blind && run.blind.effect && run.blind.effect.scoreFloorPerShot) || 0;
  const floor = rawFloor > 0 && rawFloor <= 1
    ? Math.round((run.target || 0) * rawFloor)
    : rawFloor;
  let tithed = false;
  if (floor > 0 && resolved.totalScore < floor && run.shotsLeft > 0) {
    run.shotsLeft--;
    run.flood = Math.min(1, run.flood + (run.floodPerShot || 0.25));
    tithed = true;
  }

  for (const relic of run.relics) {
    if (relic.hooks && relic.hooks.onShotEnd) {
      try { relic.hooks.onShotEnd(relicCtx(run, relic)); } catch (e) { warn(relic, e); }
    }
  }

  return { tithed, cleared: blindCleared(run), failed: blindFailed(run) };
}

/** Money and bookkeeping when a blind is beaten. */
export function endBlind(run) {
  const info = BLIND_KINDS.find((b) => b.key === currentKind(run)) || BLIND_KINDS[0];
  const shotBonus = Math.max(0, run.shotsLeft);
  const interest = Math.min(5, Math.floor(run.money / 5)) * Math.max(0, run.interest);
  let reward = info.reward + shotBonus + interest;

  // Judgement pays out everything you scored past the target; the Hermit doubles the
  // lot. Both are one-round blessings, so they only ever fire on the round they were
  // bought for.
  let overflow = 0;
  if (run.blessOverflowPay) {
    overflow = Math.max(0, Math.floor((run.score - run.target) / 250));
    reward += overflow;
  }
  if (run.blessDoubleMoney) reward *= 2;

  run.money += reward;
  run.stats.blindsCleared++;
  run.stats.moneyEarned += reward;

  for (const relic of run.relics) {
    if (relic.hooks && relic.hooks.onBlindEnd) {
      try { relic.hooks.onBlindEnd(relicCtx(run, relic)); } catch (e) { warn(relic, e); }
    }
  }

  // the card is spent: it burns whether you cleared or not
  if (run.blessing) {
    run.log.push({ text: `${run.blessing.name} fades.`, color: 'grey2' });
    run.blessing = null;
  }
  clearBlessing(run);

  return { base: info.reward, shotBonus, interest, overflow, total: reward };
}

export function advance(run) {
  run.blindIx++;
  if (run.blindIx >= BLIND_ORDER.length) {
    run.blindIx = 0;
    run.ante++;
    if (run.ante > ANTES) { run.won = true; }
  }
  return run;
}

/* ---------------------------------------------------------------- purchases */

export function addAnimal(run, animalId) {
  if (!ANIMAL_BY_ID[animalId]) return false;
  run.caravan.push(animalId);
  return true;
}

export function removeAnimal(run, animalId) {
  const ix = run.caravan.indexOf(animalId);
  if (ix < 0) return false;
  run.caravan.splice(ix, 1);
  return true;
}

export function addRelic(run, relicId) {
  const def = RELIC_BY_ID[relicId];
  if (!def) return false;
  if (run.relics.some((r) => r.id === relicId)) return false;
  if (run.relics.length >= run.relicSlots) return false;
  const inst = Object.assign({}, def, { state: JSON.parse(JSON.stringify(def.state || {})) });
  run.relics.push(inst);
  if (inst.hooks && inst.hooks.modifyRun) {
    try { inst.hooks.modifyRun(run); } catch (e) { warn(inst, e); }
  }
  return true;
}

export function sellRelic(run, relicId) {
  const ix = run.relics.findIndex((r) => r.id === relicId);
  if (ix < 0) return 0;
  const r = run.relics[ix];
  const value = Math.max(1, Math.floor((r.price || 4) / 2) + (run.sellBonus || 0));
  run.relics.splice(ix, 1);
  run.money += value;
  return value;
}

export function addFeed(run, feedId) {
  const def = FEEDS.find((f) => f.id === feedId);
  if (!def) return false;
  if (run.feeds.length >= 2) return false;
  run.feeds.push(Object.assign({}, def, { charges: def.charges || 1 }));
  return true;
}

export function addCue(run, cueId) {
  const def = CUE_UPGRADES.find((c) => c.id === cueId);
  if (!def) return false;
  run.cueUpgrades.push(def.id);
  if (def.apply) { try { def.apply(run); } catch (e) { warn(def, e); } }
  return true;
}

export function addVoucher(run, voucherId) {
  const def = VOUCHERS.find((v) => v.id === voucherId);
  if (!def) return false;
  if (run.vouchers.includes(voucherId)) return false;
  run.vouchers.push(voucherId);
  if (def.apply) { try { def.apply(run); } catch (e) { warn(def, e); } }
  return true;
}

/** Apply everything inside a delivered crate. Returns display lines for the unload anim. */
export function deliverCrate(run, crate) {
  const got = [];
  for (const item of crate.contents || []) {
    const qty = Math.max(1, item.qty || 1);
    for (let i = 0; i < qty; i++) {
      switch (item.kind) {
        case 'animal':
          if (addAnimal(run, item.ref)) got.push({ kind: 'animal', ref: item.ref, name: (ANIMAL_BY_ID[item.ref] || {}).name || item.ref });
          break;
        case 'relic':
          if (addRelic(run, item.ref)) got.push({ kind: 'relic', ref: item.ref, name: (RELIC_BY_ID[item.ref] || {}).name || item.ref });
          break;
        case 'habitat_up':
          applyHabitatUpgrade(run, item.ref);
          got.push({ kind: 'habitat_up', ref: item.ref, name: ((HABITAT_BY_ID[item.ref] || {}).name || item.ref) + ' +1' });
          break;
        case 'cue':
          if (addCue(run, item.ref)) got.push({ kind: 'cue', ref: item.ref, name: (CUE_UPGRADES.find((c) => c.id === item.ref) || {}).name || item.ref });
          break;
        case 'feed':
          if (addFeed(run, item.ref)) got.push({ kind: 'feed', ref: item.ref, name: (FEEDS.find((f) => f.id === item.ref) || {}).name || item.ref });
          break;
        case 'voucher':
          if (addVoucher(run, item.ref)) got.push({ kind: 'voucher', ref: item.ref, name: (VOUCHERS.find((v) => v.id === item.ref) || {}).name || item.ref });
          break;
        case 'money':
          run.money += qty;
          got.push({ kind: 'money', ref: String(qty), name: '$' + qty });
          i = qty; // money is granted in one lump
          break;
        default:
          break;
      }
    }
  }
  run.stats.cratesBought++;
  return got;
}

export function canAfford(run, price) { return run.money >= price; }
export function spend(run, price) {
  if (run.money < price) return false;
  run.money -= price;
  return true;
}

/* ------------------------------------------------------------------ helpers */

export function relicCtx(run, relic) {
  return {
    run, relic,
    blind: run.blind,
    shot: run.stats.shotsTaken,
    shotIndex: run.stats.shotsTaken,
    potted: [],
    residents: run.vitrine,
    tableAnimals: run.hand.map((id) => ANIMAL_BY_ID[id]).filter(Boolean),
    deck: run.stash.map((id) => ANIMAL_BY_ID[id]).filter(Boolean),
    rng: run.rng,
    log: (t, c) => { run.log.push({ text: String(t).slice(0, 48), color: c || 'brass3', relic: relic && relic.id }); if (run.log.length > 40) run.log.shift(); },
    addMoney: (n) => { run.money += Math.round(n) || 0; },
    consumeAnimal: (id) => { removeAnimal(run, id); },
  };
}

function warn(def, e) {
  if (typeof console !== 'undefined') console.warn('run hook failed:', def && def.id, e);
}

/** Deck stats for the caravan panel. */
export function caravanBreakdown(run) {
  const byHome = {};
  for (const id of run.caravan) {
    const a = ANIMAL_BY_ID[id];
    if (!a) continue;
    byHome[a.home] = (byHome[a.home] || 0) + 1;
  }
  return {
    total: run.caravan.length,
    byHome,
    rarities: run.caravan.reduce((acc, id) => {
      const a = ANIMAL_BY_ID[id];
      if (a) acc[a.rarity] = (acc[a.rarity] || 0) + 1;
      return acc;
    }, {}),
  };
}

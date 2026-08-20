// The chips x mult pipeline.
//
// resolveShot() is PURE with respect to rendering: it takes a snapshot of the world and
// returns a SCRIPT — an ordered list of entries, each with an ordered list of steps. The
// table scene plays that script back one step at a time, which is what makes the readout
// slam together like a Balatro hand instead of a number appearing from nowhere.
//
// Pipeline order (DESIGN.md section 10):
//   1 habitat match       2 base chips/mult        3 match modifier
//   4 interactions (shot, habitat, table, deck)    5 relic onScoreAnimal
//   6 rail bounces        7 combo xmult            8 boss multipliers
//   9 commit: score += floor(chips * mult * xmult)

import { ANIMAL_BY_ID } from '../data/animals.js';
import { affinity, HABITAT_BY_ID } from '../data/habitats.js';
import { INTERACTIONS } from '../data/interactions.js';
import { habitatLevel } from '../data/cargo.js';

export const MATCH = { EXACT: 'exact', PARTIAL: 'partial', WRONG: 'wrong' };

const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);

/* --------------------------------------------------------------- selectors */

function selMatches(sel, animal) {
  if (!sel || !animal) return false;
  if (sel.any) return true;
  if (sel.id) return animal.id === sel.id;
  if (sel.tag) return !!(animal.tags && animal.tags.includes(sel.tag));
  if (sel.home) return animal.home === sel.home;
  if (sel.rarity) return animal.rarity === sel.rarity;
  return false;
}

/** The candidate pool an interaction scope looks at, excluding the animal being scored. */
function poolFor(scope, s, selfRef) {
  switch (scope) {
    case 'habitat': return (s.residents[s.habitatId] || []).filter((a) => a !== selfRef);
    case 'shot': return s.shotAnimals.filter((a) => a !== selfRef);
    case 'table': return s.tableAnimals.filter((a) => a !== selfRef);
    case 'deck': return s.deckAnimals.filter((a) => a !== selfRef);
    default: return [];
  }
}

/* --------------------------------------------------------------- interactions */

function runInteractions(res, s, entry) {
  const self = res.animal;
  const immune = INTERACTIONS.some((r) => r.id === `immune_${self.id}`)
    || (self.tags || []).includes('immune');

  for (const rule of INTERACTIONS) {
    if (rule.id && rule.id.startsWith('immune_')) continue;   // marker rules, not effects

    const pool = poolFor(rule.scope || 'habitat', s, self);

    // set bonus: every named id must be present (self counts)
    if (rule.requireAll && rule.requireAll.length) {
      const have = new Set(pool.map((a) => a.id));
      have.add(self.id);
      if (!rule.requireAll.every((id) => have.has(id))) continue;
      if (!rule.requireAll.includes(self.id)) continue;       // only the members score it
      applyGain(res, rule, 1, entry, null, s);
      continue;
    }

    if (!selMatches(rule.self, self)) continue;

    const matches = pool.filter((a) => selMatches(rule.other, a));
    if (!matches.length) continue;

    const per = rule.perOther !== false;
    const cap = num(rule.maxStacks, 4);
    const stacks = per ? Math.min(matches.length, cap) : 1;

    // honey-badger style immunity: negative gains simply do not land
    const g = rule.gain || {};
    const negative = num(g.chips) < 0 || num(g.mult) < 0 || num(g.xmult, 1) < 1;
    if (immune && negative) {
      entry.steps.push({
        kind: 'immune', label: `${self.name} does not care`, color: 'brass2',
        chips: 0, mult: 0, xmult: 1, ruleId: rule.id,
      });
      continue;
    }

    applyGain(res, rule, stacks, entry, matches, s);

    // devouring: the other animal is removed from the habitat and never scores again
    if (rule.onOther && rule.onOther.consume) {
      for (let i = 0; i < stacks && i < matches.length; i++) {
        res.consumed.push(matches[i]);
        const list = s.residents[s.habitatId];
        if (list) {
          const ix = list.indexOf(matches[i]);
          if (ix >= 0) list.splice(ix, 1);
        }
      }
    } else if (rule.onOther) {
      for (let i = 0; i < stacks && i < matches.length; i++) {
        res.otherEffects.push({ animal: matches[i], chips: num(rule.onOther.chips), mult: num(rule.onOther.mult) });
      }
    }
  }
}

function applyGain(res, rule, stacks, entry, matches, s) {
  const g = rule.gain || {};
  const chips = num(g.chips) * stacks;
  const mult = num(g.mult) * stacks;
  const xm = Math.pow(num(g.xmult, 1), stacks);
  const money = num(g.money) * stacks;
  if (!chips && !mult && xm === 1 && !money) return;

  res.chips += chips;
  res.mult += mult;
  res.xmult *= xm;
  res.money += money;
  res.interChips += chips;
  res.interMult += mult;

  const kindColor = {
    eat: 'red2', buff: 'green1', debuff: 'red1', flock: 'sky',
    set: 'gold', combo: 'purple1',
  }[rule.kind] || 'white';

  entry.steps.push({
    kind: rule.kind || 'buff',
    label: rule.name + (stacks > 1 ? ` x${stacks}` : ''),
    flavor: rule.flavor,
    color: kindColor,
    chips, mult, xmult: xm, money,
    ruleId: rule.id,
    others: matches ? matches.slice(0, stacks).map((a) => a.id) : (rule.requireAll || []),
  });
}

/* ------------------------------------------------------------------ relics */

function runRelics(res, s, entry, run) {
  for (const relic of run.relics || []) {
    if (!relic.hooks || !relic.hooks.onScoreAnimal) continue;
    const before = { chips: res.chips, mult: res.mult, xmult: res.xmult, money: res.money };
    const logs = [];
    const ctx = makeRelicCtx(s, run, relic, logs);
    try {
      relic.hooks.onScoreAnimal(res, ctx);
    } catch (e) {
      // A broken relic must never take the run down with it.
      if (typeof console !== 'undefined') console.warn('relic onScoreAnimal failed:', relic.id, e);
      res.chips = before.chips; res.mult = before.mult; res.xmult = before.xmult; res.money = before.money;
      continue;
    }
    sanitize(res, before);
    const d = {
      chips: res.chips - before.chips,
      mult: res.mult - before.mult,
      xmult: before.xmult === 0 ? 1 : res.xmult / before.xmult,
      money: res.money - before.money,
    };
    if (d.chips || d.mult || Math.abs(d.xmult - 1) > 1e-9 || d.money || logs.length) {
      entry.steps.push({
        kind: 'relic', label: logs[0] ? logs[0].text : relic.name, color: logs[0] ? logs[0].color : 'brass3',
        chips: d.chips, mult: d.mult, xmult: d.xmult, money: d.money, relicId: relic.id,
      });
    }
  }
}

function makeRelicCtx(s, run, relic, logs) {
  return {
    run, relic,
    blind: s.blind,
    shot: s.shotIndex,
    shotIndex: s.shotIndex,
    potted: s.shotAnimals,
    residents: s.residents,
    tableAnimals: s.tableAnimals,
    deck: s.deckAnimals,
    rng: s.rng,
    habitatId: s.habitatId,
    log: (txt, color) => { if (txt) logs.push({ text: String(txt).slice(0, 40), color: color || 'brass3' }); },
    addMoney: (n) => { s.pendingMoney += num(n); },
    consumeAnimal: (id) => { s.pendingConsume.push(id); },
  };
}

function sanitize(res, before) {
  if (!isFinite(res.chips)) res.chips = before.chips;
  if (!isFinite(res.mult)) res.mult = before.mult;
  if (!isFinite(res.xmult) || res.xmult <= 0) res.xmult = before.xmult;
  if (!isFinite(res.money)) res.money = before.money;
  res.chips = Math.max(-99999, Math.min(9999999, res.chips));
  res.mult = Math.max(-999, Math.min(99999, res.mult));
  res.xmult = Math.max(0.01, Math.min(9999, res.xmult));
}

/* ------------------------------------------------------------------- main */

/**
 * @param s snapshot:
 *   { run, blind, shotIndex, potted:[{ball, animalId, gate}],
 *     residents:{habitatId:[animal]}, tableAnimals:[animal], deckAnimals:[animal], rng }
 * @returns { entries, totalScore, totalMoney, perfect }
 */
export function resolveShot(s) {
  const run = s.run;
  const eff = (s.blind && s.blind.effect) || {};
  const shotAnimals = s.potted.map((p) => ANIMAL_BY_ID[p.animalId]).filter(Boolean);

  const state = {
    run, blind: s.blind, shotIndex: s.shotIndex || 0, rng: s.rng,
    residents: s.residents || {},
    tableAnimals: s.tableAnimals || [],
    deckAnimals: s.deckAnimals || [],
    shotAnimals,
    habitatId: null,
    pendingMoney: 0,
    pendingConsume: [],
  };

  const entries = [];
  let total = 0;
  let allExact = s.potted.length > 0;
  const scoredHabitats = new Set(run.scoredHabitatsThisBlind || []);
  let prevInter = { chips: 0, mult: 0 };

  s.potted.forEach((pot, i) => {
    const animal = ANIMAL_BY_ID[pot.animalId];
    if (!animal) return;
    const gate = pot.gate;
    const habitatId = gate ? gate.habitatId : null;
    state.habitatId = habitatId;

    // --- 1: habitat match. The chameleon is always at home.
    const isChameleon = animal.id === 'chameleon';
    const aff = isChameleon ? 1 : (habitatId ? affinity(animal.home, habitatId) : 0);
    const match = aff >= 0.999 ? MATCH.EXACT : aff > 0 ? MATCH.PARTIAL : MATCH.WRONG;
    if (match !== MATCH.EXACT) allExact = false;

    const res = {
      animal, habitatId, match, ball: pot.ball,
      chips: 0, mult: 0, xmult: 1, money: 0,
      interChips: 0, interMult: 0,
      tags: animal.tags || [],
      consumed: [], otherEffects: [], logs: [],
    };
    const entry = {
      animal, habitatId, gate, match, index: i, steps: [],
      chips: 0, mult: 0, xmult: 1, score: 0, money: 0, res,
    };

    // --- 2: base
    res.chips = num(animal.chips, 10);
    res.mult = num(animal.mult, 1);
    entry.steps.push({
      kind: 'base', label: animal.name, color: 'white',
      chips: res.chips, mult: res.mult, xmult: 1,
    });

    // --- 2b: feed bonuses bought at the dock and spent this blind
    const fedC = (run.feedChips && run.feedChips[animal.id]) || 0;
    const fedM = (run.feedMult && run.feedMult[animal.id]) || 0;
    if (fedC || fedM) {
      res.chips += fedC;
      res.mult += fedM;
      entry.steps.push({
        kind: 'buff', label: 'Well fed', color: 'green1',
        chips: fedC, mult: fedM, xmult: 1,
      });
    }

    // --- 3: match modifier (+ habitat upgrade level)
    const lvl = habitatId ? habitatLevel(run, habitatId) : 0;
    if (match === MATCH.EXACT) {
      const factor = 3 + lvl * 0.75;
      const add = res.chips * (factor - 1);
      res.chips += add;
      res.mult += 2 + lvl * 0.5;
      entry.steps.push({
        kind: 'match',
        label: isChameleon ? 'Perfect Camouflage' : `${HABITAT_BY_ID[habitatId] ? HABITAT_BY_ID[habitatId].name : '???'} — HOME!`,
        color: 'gold', chips: add, mult: 2 + lvl * 0.5, xmult: 1,
      });
      res.money += 1;
    } else if (match === MATCH.PARTIAL) {
      const add = res.chips * aff;
      res.chips += add;
      res.mult += 1;
      entry.steps.push({
        kind: 'match', label: 'Close enough…', color: 'sky',
        chips: add, mult: 1, xmult: 1,
      });
    } else {
      const lost = -res.chips * 0.75;
      res.chips += lost;
      res.mult -= 1;
      entry.steps.push({
        kind: 'match', label: 'Wrong habitat!', color: 'red2',
        chips: lost, mult: -1, xmult: 1,
      });
    }

    // decoy (boss: The Mimic)
    if (pot.ball && pot.ball.decoy) {
      const lost = -res.chips * 1.5;
      res.chips += lost;
      entry.steps.push({ kind: 'debuff', label: 'A MIMIC!', color: 'purple1', chips: lost, mult: 0, xmult: 1 });
    }

    // --- 4: interactions
    if (!eff.noInteractions) {
      runInteractions(res, state, entry);
      // the turtle is paid for its patience
      if (animal.id === 'seaturtle' && pot.ball && pot.ball.shotsSurvived) {
        const add = pot.ball.shotsSurvived * 14;
        res.chips += add;
        entry.steps.push({ kind: 'buff', label: `Patience x${pot.ball.shotsSurvived}`, color: 'green1', chips: add, mult: 0, xmult: 1 });
      }
      // the octopus mimics whatever the last animal pulled off
      if (animal.id === 'octopus' && (prevInter.chips || prevInter.mult)) {
        res.chips += prevInter.chips;
        res.mult += prevInter.mult;
        entry.steps.push({
          kind: 'combo', label: 'Mimicry', color: 'purple1',
          chips: prevInter.chips, mult: prevInter.mult, xmult: 1,
        });
      }
    } else {
      entry.steps.push({ kind: 'blocked', label: 'QUARANTINED', color: 'grey2', chips: 0, mult: 0, xmult: 1 });
    }
    prevInter = { chips: res.interChips, mult: res.interMult };

    // --- 5: relics. Skipped in preview mode: relic hooks own mutable state
    // (counters, per-blind flags), so running them for a hover would corrupt the run.
    if (!s.preview) runRelics(res, state, entry, run);

    // --- 6: rail bounces
    const bounces = pot.ball ? num(pot.ball.bounces) : 0;
    if (bounces > 0 && num(run.railChips) > 0) {
      const add = bounces * num(run.railChips);
      res.chips += add;
      entry.steps.push({ kind: 'buff', label: `${bounces} cushion${bounces > 1 ? 's' : ''}`, color: 'brass3', chips: add, mult: 0, xmult: 1 });
    }

    // --- 7: combo (every extra animal in the same shot compounds)
    if (i > 0) {
      const xm = 1 + 0.35 * i;
      res.xmult *= xm;
      entry.steps.push({ kind: 'combo', label: `COMBO x${i + 1}`, color: 'purple1', chips: 0, mult: 0, xmult: xm });
    }

    // --- 8: boss squeeze
    if (num(eff.chipsMul, 1) !== 1) {
      const add = res.chips * (num(eff.chipsMul, 1) - 1);
      res.chips += add;
      entry.steps.push({ kind: 'boss', label: 'BOSS', color: 'red2', chips: add, mult: 0, xmult: 1 });
    }
    if (num(eff.multMul, 1) !== 1) {
      const before = res.mult;
      res.mult *= num(eff.multMul, 1);
      entry.steps.push({ kind: 'boss', label: 'BOSS', color: 'red2', chips: 0, mult: res.mult - before, xmult: 1 });
    }
    if (eff.onceScoringPerHabitat && habitatId && scoredHabitats.has(habitatId)) {
      const lost = -res.chips * 0.8;
      res.chips += lost;
      res.mult = Math.max(0.1, res.mult * 0.5);
      entry.steps.push({ kind: 'boss', label: 'ALREADY INSPECTED', color: 'red2', chips: lost, mult: 0, xmult: 1 });
    }
    if (habitatId) scoredHabitats.add(habitatId);

    // --- 9: commit
    const finalChips = Math.max(0, Math.round(res.chips));
    const finalMult = Math.max(0.1, res.mult);
    const finalX = Math.max(0.01, res.xmult);
    entry.chips = finalChips;
    entry.mult = finalMult;
    entry.xmult = finalX;
    entry.score = Math.floor(finalChips * finalMult * finalX);
    entry.money = Math.max(0, Math.round(res.money));
    entry.consumed = res.consumed.map((a) => a.id);
    total += entry.score;
    entries.push(entry);
  });

  const perfect = allExact && s.potted.length >= 2;
  let money = entries.reduce((a, e) => a + e.money, 0) + state.pendingMoney;
  if (perfect) money += 2;

  return {
    entries,
    totalScore: total,
    totalMoney: money,
    perfect,
    scoredHabitats: Array.from(scoredHabitats),
    consumed: entries.flatMap((e) => e.consumed).concat(state.pendingConsume),
  };
}

/** Preview a single pot without committing anything — used by the aim tooltip. */
export function previewPot(run, blind, animalId, habitatId, s = {}) {
  const animal = ANIMAL_BY_ID[animalId];
  if (!animal) return null;
  const snap = {
    run, blind, shotIndex: 0, rng: s.rng, preview: true,
    potted: [{ ball: { bounces: 0 }, animalId, gate: { habitatId } }],
    residents: s.residents || {},
    tableAnimals: s.tableAnimals || [],
    deckAnimals: s.deckAnimals || [],
  };
  const r = resolveShot(snap);
  return r.entries[0] || null;
}

/** Flatten a resolved shot into the running total the HUD counts up to. */
export function shotTotals(resolved) {
  let chips = 0, mult = 0;
  for (const e of resolved.entries) { chips += e.chips; mult += e.mult * e.xmult; }
  return { chips, mult, score: resolved.totalScore };
}

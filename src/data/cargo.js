// The dock. You do not buy cards here — you pick one CRATE off the manifest and a boat
// brings it in, so every purchase is a bundle with a stencil, a rarity and a hull class.
//
// A template describes a SHAPE, never a fixed inventory: contents are rolled from the
// live ANIMALS / RELICS tables at manifest time. Hardcoding ids here would rot the moment
// the roster changed, and it would also let the same crate offer a relic you already own.
//
// RUN FIELDS MUTATED BY THIS MODULE (and nothing else):
//   power  spin  spinDrift  bearing  railMarks  railChips  shots  reracks
//   gateScale  crateSlots  rerollCost  interest  sellBonus  handSize  relicSlots
//   breakBonus  crateDiscount  habitatLevels
//
// FEED ctx (supplied by src/scenes/table.js useFeed):
//   { run, world, balls, hand, rng, selected, gates,
//     log(text), stopAll(), addChips(animalId, n), addMult(animalId, n),
//     teleport(ball, gate), grantRerack() }

import { ANIMALS, ANIMAL_BY_ID, rollAnimal } from './animals.js';
import { RELICS, RELIC_BY_ID, rollRelics } from './relics.js';
import { HABITATS, HABITAT_BY_ID } from './habitats.js';

/* -------------------------------------------------------------- boat classes */

export const BOAT_CLASS = {
  skiff: { name: 'skiff', capacity: 2, speed: 1.35, label: 'a single-sail skiff' },
  barge: { name: 'barge', capacity: 4, speed: 1.0, label: 'a low barge' },
  freighter: { name: 'freighter', capacity: 7, speed: 0.72, label: 'a coastal freighter' },
  zeppelin: { name: 'zeppelin', capacity: 3, speed: 0.9, label: 'a cargo airship' },
};

/* ------------------------------------------------------------- cue upgrades */

export const CUE_UPGRADES = [
  { id: 'ash_shaft', name: 'Ash Shaft', desc: 'Break 12% harder', price: 4, icon: 'cue', apply: (r) => { r.power += 0.12; } },
  { id: 'leather_tip', name: 'Leather Tip', desc: 'English drifts far less', price: 4, icon: 'chalk', apply: (r) => { r.spinDrift = Math.max(0.25, r.spinDrift * 0.68); } },
  { id: 'chalked_cue', name: 'Chalked Cue', desc: '+40% english on every shot', price: 5, icon: 'chalk', apply: (r) => { r.spin += 0.4; } },
  // There is no aiming line, so the chandler does not sell a better one. What it sells
  // is REFERENCE: a bearing you can note down and repeat, and marks on the rail to aim
  // off. Both make you better at shooting blind without shooting for you.
  { id: 'brass_compass', name: 'Brass Compass', desc: 'Shows the cue\'s bearing in degrees', price: 4, icon: 'compass', apply: (r) => { r.bearing = true; } },
  { id: 'rail_sight', name: 'Rail Sight', desc: 'Diamonds on every rail, to aim off', price: 6, icon: 'eye', apply: (r) => { r.railMarks = true; } },
  { id: 'ivory_ferrule', name: 'Ivory Ferrule', desc: '+3 chips for every cushion struck', price: 5, icon: 'gem', apply: (r) => { r.railChips += 3; } },
  { id: 'break_cue', name: 'Break Cue', desc: 'The first shot of a blind hits harder', price: 5, icon: 'bolt', apply: (r) => { r.breakBonus += 0.25; } },
  { id: 'spare_cue', name: 'Spare Cue', desc: '+1 shot every blind', price: 9, icon: 'plus', apply: (r) => { r.shots += 1; } },
  { id: 'chalk_block', name: 'Chalk Block', desc: '+1 re-rack every blind', price: 6, icon: 'dice', apply: (r) => { r.reracks += 1; } },
  { id: 'jumbo_tip', name: 'Jumbo Tip', desc: 'Every gate opens 8% wider', price: 7, icon: 'wheel', apply: (r) => { r.gateScale += 0.08; } },
];
const CUE_BY_ID = {};
for (const c of CUE_UPGRADES) CUE_BY_ID[c.id] = c;

/* --------------------------------------------------------------------- feeds */

const hasTag = (a, t) => !!(a && a.tags && a.tags.includes(t));
function pickOnFelt(ctx, test) {
  const ids = (ctx.hand || []).filter((id) => test(ANIMAL_BY_ID[id]));
  if (ids.length) return ids;
  return (ctx.balls || []).map((b) => b.animalId).filter((id) => test(ANIMAL_BY_ID[id]));
}

export const FEEDS = [
  {
    id: 'hay', name: 'Bale of Hay', desc: 'Every herbivore on the felt: +45 chips',
    price: 3, icon: 'hay', charges: 1,
    use(ctx) {
      const ids = pickOnFelt(ctx, (a) => hasTag(a, 'herbivore') || hasTag(a, 'herd'));
      for (const id of new Set(ids)) ctx.addChips(id, 45);
      ctx.log(ids.length ? `${new Set(ids).size} grazers fed` : 'nothing here eats hay');
    },
  },
  {
    id: 'meat', name: 'Slab of Meat', desc: 'Every predator on the felt: +2 Mult',
    price: 4, icon: 'bone', charges: 1,
    use(ctx) {
      const ids = pickOnFelt(ctx, (a) => hasTag(a, 'predator') || hasTag(a, 'carnivore'));
      for (const id of new Set(ids)) ctx.addMult(id, 2);
      ctx.log(ids.length ? 'the hunters are fed' : 'no takers');
    },
  },
  {
    id: 'fish', name: 'Bucket of Fish', desc: 'Every swimmer on the felt: +60 chips',
    price: 4, icon: 'fish', charges: 1,
    use(ctx) {
      const ids = pickOnFelt(ctx, (a) => hasTag(a, 'aquatic') || hasTag(a, 'swimming'));
      for (const id of new Set(ids)) ctx.addChips(id, 60);
      ctx.log(ids.length ? 'the swimmers are fed' : 'no swimmers aboard');
    },
  },
  {
    id: 'nectar', name: 'Jar of Nectar', desc: 'Every tiny animal on the felt: +1 Mult',
    price: 3, icon: 'drop', charges: 1,
    use(ctx) {
      const ids = pickOnFelt(ctx, (a) => hasTag(a, 'tiny') || hasTag(a, 'small'));
      for (const id of new Set(ids)) ctx.addMult(id, 1);
      ctx.log('the little ones perk up');
    },
  },
  {
    id: 'salt', name: 'Salt Lick', desc: 'Every herd animal on the felt: +25 chips',
    price: 3, icon: 'cow', charges: 2,
    use(ctx) {
      const ids = pickOnFelt(ctx, (a) => hasTag(a, 'herd') || hasTag(a, 'bovine') || hasTag(a, 'equine'));
      for (const id of new Set(ids)) ctx.addChips(id, 25);
      ctx.log('the herd settles');
    },
  },
  {
    id: 'tranq', name: 'Tranquilliser', desc: 'Stops every animal on the felt at once',
    price: 5, icon: 'drop', charges: 1,
    use(ctx) { ctx.stopAll(); ctx.log('everything goes still'); },
  },
  {
    id: 'net', name: "Keeper's Net", desc: 'Drops the chosen animal into its home gate',
    price: 6, icon: 'net', charges: 1,
    use(ctx) {
      const ball = ctx.selected || (ctx.balls || []).find((b) => !b.sunk);
      if (!ball) { ctx.log('nothing to net'); return; }
      const a = ANIMAL_BY_ID[ball.animalId];
      const gates = ctx.gates || [];
      const home = gates.find((gt) => a && gt.habitatId === a.home) || gates[0];
      if (!home) { ctx.log('no gate to net into'); return; }
      ctx.teleport(ball, home);
      ctx.log(`${a ? a.name : 'it'} is carried to the gate`);
    },
  },
  {
    id: 'whistle', name: 'Tin Whistle', desc: 'Grants one extra re-rack',
    price: 3, icon: 'whistle', charges: 1,
    use(ctx) { ctx.grantRerack(); ctx.log('the keeper whistles them back'); },
  },
];
const FEED_BY_ID = {};
for (const f of FEEDS) FEED_BY_ID[f.id] = f;

/* ------------------------------------------------------------------ vouchers */

export const VOUCHERS = [
  { id: 'gate_widening', name: 'Gate Widening', desc: 'Every gate opens 15% wider, permanently', price: 10, icon: 'wheel', apply: (r) => { r.gateScale += 0.15; } },
  { id: 'extra_berth', name: 'Extra Berth', desc: 'One more crate on every manifest', price: 11, icon: 'crate', apply: (r) => { r.crateSlots += 1; } },
  { id: 'harbour_discount', name: 'Harbour Discount', desc: 'Rerolls cost $1 less, and crates $1 less', price: 8, icon: 'coin', apply: (r) => { r.rerollCost = Math.max(1, r.rerollCost - 1); r.crateDiscount += 1; } },
  { id: 'keepers_ledger', name: "Keeper's Ledger", desc: 'Interest pays double at every dock', price: 10, icon: 'scroll', apply: (r) => { r.interest += 1; } },
  { id: 'wider_rack', name: 'Wider Rack', desc: '+1 animal racked on the felt', price: 9, icon: 'plus', apply: (r) => { r.handSize += 1; } },
  { id: 'relic_shelf', name: 'Relic Shelf', desc: '+1 relic slot', price: 12, icon: 'gem', apply: (r) => { r.relicSlots += 1; } },
  { id: 'broker', name: 'The Broker', desc: 'Relics sell back for $2 more', price: 7, icon: 'key', apply: (r) => { r.sellBonus += 2; } },
  { id: 'bulk_rate', name: 'Bulk Rate', desc: 'Every crate costs $2 less', price: 9, icon: 'anchor', apply: (r) => { r.crateDiscount += 2; } },
];
const VOUCHER_BY_ID = {};
for (const v of VOUCHERS) VOUCHER_BY_ID[v.id] = v;

/* ------------------------------------------------------------ habitat works */

export const HABITAT_MAX_LEVEL = 3;

export const HABITAT_UPGRADES = HABITATS.map((h) => ({
  id: 'hab_' + h.id,
  habitat: h.id,
  name: h.name + ' Fittings',
  desc: `Animals sent home to ${h.name} pay more`,
  price: 7,
  level: 1,
  icon: h.icon,
}));
const HAB_UP_BY_HABITAT = {};
for (const h of HABITAT_UPGRADES) HAB_UP_BY_HABITAT[h.habitat] = h;

export function habitatLevel(run, habitatId) {
  if (!run || !run.habitatLevels) return 0;
  const v = run.habitatLevels[habitatId];
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(HABITAT_MAX_LEVEL, v)) : 0;
}

export function applyHabitatUpgrade(run, habitatId) {
  if (!run || !HABITAT_BY_ID[habitatId]) return 0;
  if (!run.habitatLevels) run.habitatLevels = {};
  const next = Math.min(HABITAT_MAX_LEVEL, habitatLevel(run, habitatId) + 1);
  run.habitatLevels[habitatId] = next;
  return next;
}

/* ----------------------------------------------------------------- helpers */

const owns = (run, relicId) => !!(run && run.relics && run.relics.some((r) => r.id === relicId));

function relicOffer(rng, run, rarity) {
  const owned = (run && run.relics ? run.relics.map((r) => r.id) : []);
  const got = rollRelics(rng, 1, { owned, rarity, rarityBoost: rarity === 'legendary' ? 3 : rarity === 'rare' ? 1.5 : 0 }) || [];
  let pick = got[0];
  // rollRelics honours rarityBoost rather than a hard rarity filter, so narrow it here
  if (rarity) {
    const exact = RELICS.filter((r) => r.rarity === rarity && !owned.includes(r.id));
    if (exact.length) pick = rng.pick(exact);
  }
  if (!pick) {
    const any = RELICS.filter((r) => !owned.includes(r.id));
    pick = any.length ? rng.pick(any) : null;
  }
  return pick;
}

function animalOffer(rng, run, opts) {
  const a = rollAnimal(rng, opts || {});
  // rollAnimal returns the RECORD, not an id
  return a && a.id ? a : rng.pick(ANIMALS);
}

const CONTENT_VALUE = {
  animal: (ref) => (ANIMAL_BY_ID[ref] ? ANIMAL_BY_ID[ref].cost || 4 : 4),
  relic: (ref) => (RELIC_BY_ID[ref] ? RELIC_BY_ID[ref].price || 5 : 5),
  cue: (ref) => (CUE_BY_ID[ref] ? CUE_BY_ID[ref].price : 5),
  feed: (ref) => (FEED_BY_ID[ref] ? FEED_BY_ID[ref].price : 3),
  voucher: (ref) => (VOUCHER_BY_ID[ref] ? VOUCHER_BY_ID[ref].price : 9),
  habitat_up: () => 7,
  money: () => 0,
};

/* --------------------------------------------------------------- templates */

function T(o) { return o; }

export const CRATE_TEMPLATES = [
  T({
    id: 'pen_common', kind: 'livestock', name: 'Livestock Pen', rarity: 'common',
    boat: 'skiff', base: 1, weight: 10, minAnte: 1,
    art: { crate: 'wood2', band: 'brass2', stencil: 'sheep' },
    blurb: 'Three head of common stock, one biome.',
    build(rng, run) {
      const homes = HABITATS.map((h) => h.id);
      const home = rng.pick(homes);
      const out = [];
      for (let i = 0; i < 3; i++) {
        out.push({ kind: 'animal', ref: animalOffer(rng, run, { habitat: home, rarity: 'common' }).id, qty: 1 });
      }
      return out;
    },
  }),
  T({
    id: 'pen_mixed', kind: 'livestock', name: 'Mixed Stock', rarity: 'uncommon',
    boat: 'barge', base: 2, weight: 8, minAnte: 1,
    art: { crate: 'wood3', band: 'brass1', stencil: 'cow' },
    blurb: 'Two uncommon beasts from different shores.',
    build(rng, run) {
      const a = animalOffer(rng, run, { rarity: 'uncommon' });
      const b = animalOffer(rng, run, { rarity: 'uncommon', exclude: [a.id] });
      return [{ kind: 'animal', ref: a.id, qty: 1 }, { kind: 'animal', ref: b.id, qty: 1 }];
    },
  }),
  T({
    id: 'rare_beast', kind: 'livestock', name: 'Crated Rarity', rarity: 'rare',
    boat: 'barge', base: 2, weight: 6, minAnte: 2,
    art: { crate: 'wood1', band: 'brass3', stencil: 'paw' },
    blurb: 'Something the manifest would not name.',
    build(rng, run) {
      const owned = new Set(run && run.caravan ? run.caravan : []);
      const fresh = ANIMALS.filter((a) => a.rarity === 'rare' && !owned.has(a.id));
      const a = fresh.length ? rng.pick(fresh) : animalOffer(rng, run, { rarity: 'rare' });
      return [{ kind: 'animal', ref: a.id, qty: 1 }];
    },
  }),
  T({
    id: 'legend_hold', kind: 'livestock', name: 'Sealed Hold', rarity: 'legendary',
    boat: 'freighter', base: 4, weight: 2, minAnte: 4,
    art: { crate: 'wood0', band: 'gold', stencil: 'star' },
    blurb: 'Something enormous is breathing in there.',
    build(rng, run) {
      const a = animalOffer(rng, run, { rarity: 'legendary' });
      return [{ kind: 'animal', ref: a.id, qty: 1 }, { kind: 'money', qty: 2 }];
    },
  }),
  T({
    id: 'curio_box', kind: 'relic', name: 'Curio Box', rarity: 'common',
    boat: 'skiff', base: 1, weight: 10, minAnte: 1,
    art: { crate: 'wood2', band: 'brass2', stencil: 'gem' },
    blurb: 'Dockside oddments. One of them works.',
    build(rng, run) {
      const r = relicOffer(rng, run, rng.chance(0.6) ? 'common' : 'uncommon');
      return r ? [{ kind: 'relic', ref: r.id, qty: 1 }] : [{ kind: 'money', qty: 4 }];
    },
  }),
  T({
    id: 'reliquary', kind: 'relic', name: 'Reliquary', rarity: 'rare',
    boat: 'barge', base: 2, weight: 6, minAnte: 2,
    art: { crate: 'purple0', band: 'brass3', stencil: 'scroll' },
    blurb: 'Sealed with wax and somebody’s signet.',
    build(rng, run) {
      const r = relicOffer(rng, run, 'rare');
      return (r ? [{ kind: 'relic', ref: r.id, qty: 1 }] : []).concat([{ kind: 'money', qty: 2 }]);
    },
  }),
  T({
    id: 'ark_reliquary', kind: 'relic', name: 'Ark Reliquary', rarity: 'legendary',
    boat: 'zeppelin', base: 5, weight: 2, minAnte: 5,
    art: { crate: 'ink', band: 'gold', stencil: 'heart' },
    blurb: 'It came down out of the clouds.',
    build(rng, run) {
      const r = relicOffer(rng, run, 'legendary') || relicOffer(rng, run, 'rare');
      return r ? [{ kind: 'relic', ref: r.id, qty: 1 }] : [{ kind: 'money', qty: 8 }];
    },
  }),
  T({
    id: 'gate_fittings', kind: 'habitat', name: 'Gate Fittings', rarity: 'uncommon',
    boat: 'barge', base: 2, weight: 7, minAnte: 1,
    art: { crate: 'moss', band: 'brass1', stencil: 'gear' },
    blurb: 'Brass, hinges, and a biome to spend them on.',
    build(rng, run) {
      const room = HABITATS.filter((h) => habitatLevel(run, h.id) < HABITAT_MAX_LEVEL);
      const h = (room.length ? rng.pick(room) : rng.pick(HABITATS));
      return [{ kind: 'habitat_up', ref: h.id, qty: 1 }];
    },
  }),
  T({
    id: 'cue_case', kind: 'cue', name: 'Cue Case', rarity: 'uncommon',
    boat: 'skiff', base: 1, weight: 8, minAnte: 1,
    art: { crate: 'wood1', band: 'brass2', stencil: 'cue' },
    blurb: 'Felt-lined, and someone left the chalk in.',
    build(rng, run) {
      const have = new Set(run && run.cueUpgrades ? run.cueUpgrades : []);
      const pool = CUE_UPGRADES.filter((c) => !have.has(c.id));
      const c = pool.length ? rng.pick(pool) : rng.pick(CUE_UPGRADES);
      return [{ kind: 'cue', ref: c.id, qty: 1 }];
    },
  }),
  T({
    id: 'feed_sacks', kind: 'feed', name: 'Feed Sacks', rarity: 'common',
    boat: 'skiff', base: 0, weight: 8, minAnte: 1,
    art: { crate: 'sand', band: 'moss', stencil: 'hay' },
    blurb: 'Hay, meat, and something that smells of fish.',
    build(rng) {
      const picks = rng.sample(FEEDS, 2);
      return picks.map((f) => ({ kind: 'feed', ref: f.id, qty: 1 }));
    },
  }),
  T({
    id: 'harbour_papers', kind: 'voucher', name: 'Harbour Papers', rarity: 'rare',
    boat: 'barge', base: 3, weight: 5, minAnte: 2,
    art: { crate: 'bone', band: 'brass1', stencil: 'scroll' },
    blurb: 'Stamped, sealed, and good forever.',
    build(rng, run) {
      const have = new Set(run && run.vouchers ? run.vouchers : []);
      const pool = VOUCHERS.filter((v) => !have.has(v.id));
      if (!pool.length) return [{ kind: 'money', qty: 9 }];
      return [{ kind: 'voucher', ref: rng.pick(pool).id, qty: 1 }];
    },
  }),
  T({
    id: 'freighter_haul', kind: 'livestock', name: 'Freighter Haul', rarity: 'rare',
    boat: 'freighter', base: 3, weight: 5, minAnte: 3,
    art: { crate: 'wood3', band: 'brass3', stencil: 'boat' },
    blurb: 'A whole deck of it, coming alongside.',
    build(rng, run) {
      const out = [];
      const a = animalOffer(rng, run, { rarity: 'uncommon' });
      const b = animalOffer(rng, run, { rarity: 'rare', exclude: [a.id] });
      out.push({ kind: 'animal', ref: a.id, qty: 1 });
      out.push({ kind: 'animal', ref: b.id, qty: 1 });
      const r = relicOffer(rng, run, 'uncommon');
      if (r) out.push({ kind: 'relic', ref: r.id, qty: 1 });
      out.push({ kind: 'money', qty: 3 });
      return out;
    },
  }),
  T({
    id: 'zeppelin_drop', kind: 'relic', name: 'Airship Drop', rarity: 'legendary',
    boat: 'zeppelin', base: 5, weight: 3, minAnte: 4,
    art: { crate: 'night', band: 'foam', stencil: 'cloud' },
    blurb: 'Parachuted in, still swinging.',
    build(rng, run) {
      const out = [];
      const r = relicOffer(rng, run, 'rare');
      if (r) out.push({ kind: 'relic', ref: r.id, qty: 1 });
      out.push({ kind: 'animal', ref: animalOffer(rng, run, { rarity: 'rare' }).id, qty: 1 });
      const room = HABITATS.filter((h) => habitatLevel(run, h.id) < HABITAT_MAX_LEVEL);
      if (room.length) out.push({ kind: 'habitat_up', ref: rng.pick(room).id, qty: 1 });
      return out;
    },
  }),
  T({
    id: 'bullion_chest', kind: 'livestock', name: 'Bullion Chest', rarity: 'uncommon',
    boat: 'barge', base: 0, weight: 5, minAnte: 2,
    art: { crate: 'brass0', band: 'gold', stencil: 'coin' },
    blurb: 'Heavy for its size. Pays for itself and then some.',
    build(rng, run) {
      const qty = 9 + rng.int(7) + Math.floor((run && run.ante ? run.ante : 1) / 2);
      return [{ kind: 'money', qty }];
    },
  }),
  T({
    id: 'unmarked', kind: 'livestock', name: 'Unmarked Crate', rarity: 'common',
    boat: 'skiff', base: 0, weight: 7, minAnte: 1, hidden: true, fixedPrice: 4,
    art: { crate: 'grey0', band: 'grey2', stencil: 'cross' },
    blurb: 'No stencil, no manifest, no refunds.',
    build(rng, run) {
      const roll = rng();
      if (roll < 0.3) {
        const r = relicOffer(rng, run, rng.chance(0.25) ? 'rare' : 'uncommon');
        return r ? [{ kind: 'relic', ref: r.id, qty: 1 }] : [{ kind: 'money', qty: 6 }];
      }
      if (roll < 0.55) return [{ kind: 'animal', ref: animalOffer(rng, run, { rarity: 'rare' }).id, qty: 1 }];
      if (roll < 0.7) return [{ kind: 'money', qty: 12 }];
      if (roll < 0.86) {
        return rng.sample(FEEDS, 2).map((f) => ({ kind: 'feed', ref: f.id, qty: 1 }));
      }
      return [{ kind: 'animal', ref: animalOffer(rng, run, { rarity: 'common' }).id, qty: 1 }];
    },
  }),
];

/* ----------------------------------------------------------------- pricing */

/**
 * Price is derived from the contents, so a crate can never be mispriced relative to what
 * is inside it. Pure and stable: the shop calls this every frame.
 */
export function cratePrice(crate, run) {
  if (!crate) return 1;
  if (crate.fixedPrice) {
    return Math.max(1, Math.round(crate.fixedPrice - (run ? run.crateDiscount || 0 : 0)));
  }
  let value = crate.base || 0;
  for (const item of crate.contents || []) {
    const fn = CONTENT_VALUE[item.kind];
    const qty = Math.max(1, item.qty || 1);
    if (item.kind === 'money') value += Math.round(qty * 0.55);
    else if (fn) value += fn(item.ref) * (item.kind === 'animal' ? qty : 1);
  }
  // bundles are cheaper per item than buying the pieces, which is the point of a crate
  const disc = 1 - Math.min(0.3, Math.max(0, (crate.contents || []).length - 1) * 0.08);
  const price = Math.round(value * disc) - (run ? run.crateDiscount || 0 : 0);
  return Math.max(1, price);
}

/** Short display lines for a crate card. */
export function crateSummary(crate) {
  if (!crate) return ['(empty)'];
  if (crate.hidden) return ['contents unlisted', 'no refunds'];
  const lines = [];
  const animals = [];
  for (const item of crate.contents || []) {
    const qty = Math.max(1, item.qty || 1);
    switch (item.kind) {
      case 'animal': {
        const a = ANIMAL_BY_ID[item.ref];
        animals.push(a ? a.name : item.ref);
        break;
      }
      case 'relic': {
        const r = RELIC_BY_ID[item.ref];
        lines.push(`relic: ${r ? r.name : item.ref}`);
        break;
      }
      case 'habitat_up': {
        const h = HABITAT_BY_ID[item.ref];
        lines.push(`${h ? h.name : item.ref} gate +1`);
        break;
      }
      case 'cue': {
        const c = CUE_BY_ID[item.ref];
        lines.push(`cue: ${c ? c.name : item.ref}`);
        break;
      }
      case 'feed': {
        const f = FEED_BY_ID[item.ref];
        lines.push(`feed: ${f ? f.name : item.ref}`);
        break;
      }
      case 'voucher': {
        const v = VOUCHER_BY_ID[item.ref];
        lines.push(`voucher: ${v ? v.name : item.ref}`);
        break;
      }
      case 'money':
        lines.push(`$${qty} in coin`);
        break;
      default:
        break;
    }
  }
  if (animals.length) lines.unshift(animals.length > 2 ? `${animals.length} animals` : animals.join(', '));
  return lines.length ? lines : ['(empty)'];
}

/* ---------------------------------------------------------------- manifest */

/**
 * Roll `n` distinct crates. Always tries to leave at least one the player can afford,
 * because a manifest you can only look at is not a shop.
 */
export function rollManifest(rng, run, n = 3) {
  const ante = run && run.ante ? run.ante : 1;
  const want = Math.max(1, Math.min(6, n));
  const eligible = CRATE_TEMPLATES.filter((t) => (t.minAnte || 1) <= ante);
  const pool = eligible.length ? eligible : CRATE_TEMPLATES;

  const chosen = [];
  const used = new Set();
  let guard = 0;
  while (chosen.length < want && guard++ < 60) {
    const weighted = pool
      .filter((t) => !used.has(t.id))
      .map((t) => {
        // late antes lean toward the bigger hauls; early antes toward the cheap ones
        const tilt = t.rarity === 'legendary' ? ante * 0.5
          : t.rarity === 'rare' ? ante * 0.28
            : t.rarity === 'uncommon' ? 2
              : Math.max(1, 8 - ante);
        return [t, (t.weight || 5) * 0.4 + tilt];
      });
    if (!weighted.length) break;
    const t = rng.weighted(weighted);
    if (!t) break;
    used.add(t.id);
    chosen.push(t);
  }

  const crates = chosen.map((t, i) => {
    const sub = rng.fork(`crate/${t.id}/${i}`);
    let contents = [];
    try { contents = t.build(sub, run) || []; } catch (e) { contents = [{ kind: 'money', qty: 4 }]; }
    contents = contents.filter((c) => c && c.kind && (c.kind === 'money' || c.ref));
    if (!contents.length) contents = [{ kind: 'money', qty: 4 }];
    const crate = {
      id: `${t.id}#${i}`,
      templateId: t.id,
      kind: t.kind,
      name: t.name,
      rarity: t.rarity,
      boat: t.boat,
      art: t.art,
      blurb: t.blurb,
      hidden: !!t.hidden,
      base: t.base || 0,
      fixedPrice: t.fixedPrice,
      contents,
    };
    crate.price = cratePrice(crate, run);
    return crate;
  });

  // a manifest with nothing affordable is a dead end — swap the dearest for a cheap one
  const money = run && Number.isFinite(run.money) ? run.money : 0;
  if (crates.length && money >= 3 && !crates.some((c) => c.price <= money)) {
    const cheapTemplates = pool
      .filter((t) => (t.base || 0) <= 1 && !t.hidden)
      .concat(pool.filter((t) => t.hidden));
    const t = cheapTemplates.length ? cheapTemplates[0] : pool[0];
    const sub = rng.fork('rescue/' + t.id);
    let contents = [];
    try { contents = t.build(sub, run) || []; } catch (e) { contents = [{ kind: 'money', qty: 4 }]; }
    const dearest = crates.reduce((a, b) => (b.price > a.price ? b : a), crates[0]);
    const ix = crates.indexOf(dearest);
    const crate = {
      id: `${t.id}#rescue`, templateId: t.id, kind: t.kind, name: t.name, rarity: t.rarity,
      boat: t.boat, art: t.art, blurb: t.blurb, hidden: !!t.hidden,
      base: t.base || 0, fixedPrice: t.fixedPrice || 3,
      contents: contents.length ? contents : [{ kind: 'money', qty: 4 }],
    };
    crate.price = Math.max(1, Math.min(money, cratePrice(crate, run)));
    crates[ix] = crate;
  }

  return crates;
}

/** Lookup helpers the scenes use. */
export function cueById(id) { return CUE_BY_ID[id] || null; }
export function feedById(id) { return FEED_BY_ID[id] || null; }
export function voucherById(id) { return VOUCHER_BY_ID[id] || null; }
export function habitatUpgradeFor(id) { return HAB_UP_BY_HABITAT[id] || null; }

void owns;

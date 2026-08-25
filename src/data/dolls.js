// THE CLAY DOLLS. The whole island game is these.
//
// The golem cannot herd an animal. He is slow, he is enormous, and a stranded goat runs
// from him -- so pushing him round a field would be a chore rather than a game. What he
// CAN do is what he is: pinch a figure out of his own body and stand it in the mud. Each
// doll is a small rule that applies to a circle of ground, and a stage is solved by
// choosing which rules to spend and where to stand them.
//
// A doll is deliberately NOT a unit. It does not move, it does not fight, and it cannot be
// picked back up. Placing one is a decision you live with, which is what makes a field of
// them a plan rather than a swarm.
//
// `cost` is the material bill. `radius` is in TILES. `charges` is how many of that doll a
// single stage allows even when you own more, so a stack of six herders cannot trivialise
// a map. `unlock` names the Noah conversation that teaches the recipe; the two starting
// dolls have none.

export const DOLLS = [
  {
    id: 'herd', name: 'Herder Doll', glyph: 'crook',
    blurb: 'Animals nearby remember the way home and start walking it.',
    rule: 'Every animal within 4 tiles walks toward the ark.',
    body: ['clay1', 'clay2', 'clay3'], mark: 'gold',
    radius: 4, charges: 4, cost: { clay: 2 }, unlock: null,
    effect: 'lead',
  },
  {
    id: 'bridge', name: 'Bridge Doll', glyph: 'plank',
    blurb: 'Lies down across the shallows so the others can walk over.',
    rule: 'Water within 1 tile becomes crossable.',
    body: ['wood1', 'wood2', 'wood3'], mark: 'brass2',
    radius: 1, charges: 3, cost: { clay: 1, hide: 1 }, unlock: null,
    effect: 'span',
  },
  {
    id: 'wolf', name: 'Wolf Doll', glyph: 'fang',
    blurb: 'Everything that hunts here recognises a bigger predator and settles.',
    rule: 'Animals within 3 tiles stop bolting; hostiles within 3 tiles go quiet.',
    body: ['grey0', 'grey1', 'grey2'], mark: 'red2',
    radius: 3, charges: 2, cost: { hide: 2, fang: 1 }, unlock: 'noah_wolf',
    effect: 'calm',
  },
  {
    id: 'lamp', name: 'Lantern Doll', glyph: 'flame',
    blurb: 'Holds a coal up. Nothing that lives in the dark will cross the light.',
    rule: 'Hostiles will not enter 3 tiles; animals inside walk a little faster.',
    body: ['brass1', 'brass2', 'brass3'], mark: 'orange',
    radius: 3, charges: 2, cost: { clay: 1, wax: 2 }, unlock: 'noah_lamp',
    effect: 'ward',
  },
  {
    id: 'ram', name: 'Ram Doll', glyph: 'horn',
    blurb: 'Puts its head down once, and whatever was in the way is not any more.',
    rule: 'Breaks rock, briar and deadfall within 1 tile into open ground.',
    body: ['stone1', 'stone2', 'stone3'], mark: 'bone',
    radius: 1, charges: 3, cost: { clay: 2, scale: 1 }, unlock: 'noah_ram',
    effect: 'break',
  },
  {
    id: 'cairn', name: 'Cairn Doll', glyph: 'stack',
    blurb: 'Stands in a gap so nothing wanders into what is behind it.',
    rule: 'Its own tile becomes impassable, and animals path around it.',
    body: ['stone0', 'stone1', 'stone2'], mark: 'moss',
    radius: 0, charges: 4, cost: { clay: 1 }, unlock: 'noah_cairn',
    effect: 'block',
  },
  {
    id: 'beacon', name: 'Beacon Doll', glyph: 'star',
    blurb: 'Sings once, very loudly, and half the island hears it.',
    rule: 'Leads every animal within 9 tiles -- but only for eight seconds.',
    body: ['magic0', 'magic1', 'magic2'], mark: 'white',
    radius: 9, charges: 1, cost: { wool: 2, feather: 2, wax: 1 }, unlock: 'noah_beacon',
    effect: 'lead', life: 8,
  },
];

export const DOLL_BY_ID = Object.freeze(
  DOLLS.reduce((m, d) => { m[d.id] = d; return m; }, Object.create(null)),
);

export const DOLL_IDS = DOLLS.map((d) => d.id);

/** The two you can always make. Everything else waits on Noah. */
export const STARTER_DOLLS = DOLLS.filter((d) => !d.unlock).map((d) => d.id);

/** Can this doll be crafted from these materials? */
export function canCraft(doll, mats) {
  const d = typeof doll === 'string' ? DOLL_BY_ID[doll] : doll;
  if (!d) return false;
  return Object.keys(d.cost).every((k) => (mats[k] || 0) >= d.cost[k]);
}

/** Spend the bill. Returns false and changes nothing if it cannot be paid. */
export function payFor(doll, mats) {
  const d = typeof doll === 'string' ? DOLL_BY_ID[doll] : doll;
  if (!d || !canCraft(d, mats)) return false;
  for (const k of Object.keys(d.cost)) mats[k] -= d.cost[k];
  return true;
}

export function costText(doll) {
  const d = typeof doll === 'string' ? DOLL_BY_ID[doll] : doll;
  if (!d) return '';
  return Object.keys(d.cost).map((k) => `${d.cost[k]} ${k}`).join(' · ');
}

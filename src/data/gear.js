// RELICS — the three things the golem can carry at once.
//
// He has exactly three slots, and they are not interchangeable:
//
//   HOLD     in his hands. Tools: the wand's reach, the tide's patience, a lantern.
//   WEAR     on his body. Conditions: more pens, a stronger hull, a bigger garden.
//   CONSUME  in his chest. One use, spent when you decide, and then the slot is empty.
//
// Three slots and three kinds means a build is a shape rather than a pile: you can have
// one of each and never two of a kind, so every relic you buy displaces a relic of its
// own sort and the question is always "instead of what".
//
// THE BONUS VOCABULARY IS CLOSED. Every key here is read somewhere real:
//
//   berths      +pens            game/voyage.js capacity()
//   sail        -tide per leg    game/voyage.js floodPerLeg()
//   hull        +hull points     game/voyage.js hullMax()
//   basket      +item slots      game/voyage.js holdSize()
//   beds        +garden slots    game/voyage.js gardenSize()
//   coin        +$ per sale      game/voyage.js sellPrice()
//   reach       every beast's range and radius grows                   game/lane.js
//   patience    waves take longer to arrive                            game/lane.js
//   dry         the ark survives one extra breach                      game/lane.js
//   sure        one thing that reaches the ark is turned back           game/lane.js
//
// A relic whose bonus key is not in that list does nothing, and the tests fail on it.

export const SLOTS = ['hold', 'wear', 'consume'];

export const SLOT_INFO = {
  hold: { name: 'In Hand', icon: 'cue', color: 'wood4', blurb: 'A tool. Changes how a rescue plays.' },
  wear: { name: 'Worn', icon: 'shield', color: 'brass2', blurb: 'A condition. Changes what the boat is.' },
  consume: { name: 'In the Chest', icon: 'heart', color: 'red2', blurb: 'One use, whenever you choose it.' },
};

export const BONUS_KEYS = [
  'berths', 'sail', 'hull', 'basket', 'beds', 'coin', 'reach', 'patience', 'dry', 'sure',
];

const R = (id, o) => Object.assign({ id, price: 8, rarity: 'common' }, o);

export const GEAR = [
  /* ------------------------------------------------------------------ hold */
  R('long_crook', {
    name: 'The Long Crook', slot: 'hold', icon: 'cue', color: 'wood4', price: 9,
    bonus: { reach: 0.3 },
    blurb: 'Adam cut it from an olive that outlived the garden. Your flicks carry half again as far.',
    seller: 'adam', rarity: 'uncommon',
  }),
  R('still_stone', {
    name: 'Stillstone', slot: 'hold', icon: 'gem', color: 'magic1', price: 11,
    bonus: { patience: 0.02 },
    blurb: 'Cold to hold. The water takes its time while you are holding it.',
    seller: 'eve', rarity: 'rare',
  }),
  R('dowsing_rod', {
    name: 'Dowsing Rod', slot: 'hold', icon: 'compass', color: 'brass3', price: 7,
    bonus: { dry: true },
    blurb: 'It finds the shallow way. An animal that stops in deep water washes back ashore.',
    seller: 'adam',
  }),
  R('shepherds_bell', {
    name: "Shepherd's Bell", slot: 'hold', icon: 'bell', color: 'gold', price: 8,
    bonus: { reach: 0.15, patience: 0.008 },
    blurb: 'They come a little further, a little sooner, for a sound they know.',
    seller: 'eve', rarity: 'uncommon',
  }),

  /* ------------------------------------------------------------------ wear */
  R('rope_harness', {
    name: 'Rope Harness', slot: 'wear', icon: 'net', color: 'wood3', price: 8,
    bonus: { berths: 2 },
    blurb: 'Two more slung along the rail. Not comfortable. Not drowning either.',
    seller: 'noah',
  }),
  R('pitched_apron', {
    name: 'Pitched Apron', slot: 'wear', icon: 'shield', color: 'brass1', price: 8,
    bonus: { hull: 3 },
    blurb: 'Tar, sailcloth and stubbornness. The sea gets three fewer bites.',
    seller: 'noah',
  }),
  R('seed_satchel', {
    name: 'Seed Satchel', slot: 'wear', icon: 'leaf', color: 'leaf3', price: 9,
    bonus: { beds: 8, coin: 1 },
    blurb: 'Eight more beds in the garden, and everything you raise there sells better.',
    seller: 'eve', rarity: 'uncommon',
  }),
  R('fig_belt', {
    name: 'Fig-Leaf Belt', slot: 'wear', icon: 'leaf', color: 'leaf2', price: 6,
    bonus: { basket: 2 },
    blurb: 'Eve made two more pockets in it. Two more apples in the basket.',
    seller: 'eve',
  }),
  R('doves_favour', {
    name: "Dove's Favour", slot: 'wear', icon: 'feather', color: 'cream', price: 12,
    bonus: { sail: 0.12, sure: true },
    blurb: 'The flood gains less on you, and the first one you lose on an island is not lost.',
    seller: 'noah', rarity: 'rare',
  }),
  R('clay_plates', {
    name: 'Fired Clay Plates', slot: 'wear', icon: 'gear', color: 'clay3', price: 10,
    bonus: { hull: 2, berths: 1 },
    blurb: 'He fired part of his own back into armour. It is not comfortable being him.',
    seller: 'adam', rarity: 'uncommon',
  }),

  /* --------------------------------------------------------------- consume */
  R('rib_of_adam', {
    name: 'Rib of Adam', slot: 'consume', icon: 'bone', color: 'bone', price: 10,
    bonus: {}, use: 'berth', power: 3,
    blurb: 'He can spare it. Break it for three more pens, for the rest of the voyage.',
    seller: 'adam', rarity: 'rare',
  }),
  R('cup_of_rain', {
    name: 'Cup of Rain', slot: 'consume', icon: 'drop', color: 'water3', price: 7,
    bonus: {}, use: 'tide', power: 4,
    blurb: 'Pour it out and the water forgets itself. Four moves back, once.',
    seller: 'eve',
  }),
  R('pitch_heart', {
    name: 'Heart of Pitch', slot: 'consume', icon: 'flame', color: 'lava1', price: 7,
    bonus: {}, use: 'mend', power: 99,
    blurb: 'Burn it in the furnace and the hull is whole again. All of it.',
    seller: 'noah',
  }),
  R('breath_of_life', {
    name: 'Breath of Life', slot: 'consume', icon: 'star', color: 'magic2', price: 14,
    bonus: {}, use: 'revive', power: 1,
    blurb: 'One of them comes back. You choose which, and you live with choosing.',
    seller: 'cherub', rarity: 'legendary',
  }),
];

export const GEAR_BY_ID = Object.freeze(
  GEAR.reduce((m, r) => { m[r.id] = r; return m; }, {}),
);

/** What one of the cast has on their blanket. */
export function gearFrom(who) { return GEAR.filter((r) => r.seller === who); }

export function gearInSlot(slot) { return GEAR.filter((r) => r.slot === slot); }

/** A short line for the slot panel: what this relic is actually doing right now. */
export function bonusText(relic) {
  if (!relic) return '';
  if (relic.use) return `ONE USE — ${String(relic.use).toUpperCase()}`;
  const parts = [];
  const b = relic.bonus || {};
  if (b.berths) parts.push(`+${b.berths} pens`);
  if (b.hull) parts.push(`+${b.hull} hull`);
  if (b.basket) parts.push(`+${b.basket} basket`);
  if (b.beds) parts.push(`+${b.beds} beds`);
  if (b.coin) parts.push(`+$${b.coin} a sale`);
  if (b.sail) parts.push(`${Math.round(b.sail * 100)}% less tide at sea`);
  if (b.reach) parts.push(`+${Math.round(b.reach * 100)}% reach`);
  if (b.patience) parts.push('the water waits');
  if (b.dry) parts.push('deep water washes back');
  if (b.sure) parts.push('the first loss is spared');
  return parts.join(' · ');
}

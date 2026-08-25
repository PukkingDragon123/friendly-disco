// The basket.
//
// Small things you carry INTO a rescue and spend there. They are the only way to buy
// your way out of a level going wrong, which is why the boat's hold starts at two slots
// and why the snake charges what he charges.
//
// Every item is one line of effect in game/field.js, and the effect ids are closed:
//
//   loyal   the animal it hits is never lost again -- on this island or any other
//   tide    pushes the water back, and the water is the clock
//   call    the animal walks itself toward the boat, and it is free
//   free    the next flick costs no tide
//   mend    a plank on the hull, spendable anywhere
//
// Prices are what the snake asks; he is not a charity.

const I = (id, o) => Object.assign({ id, price: 4, stack: 1 }, o);

export const ITEMS = [
  I('loyal_apple', {
    name: 'Loyal Apple', short: 'LOYAL', effect: 'loyal',
    color: 'red1', light: 'red2', leaf: 'leaf2', price: 7,
    blurb: 'Throw it at an animal. It follows you after that, and the flood never gets it.',
    use: 'Pick an animal to keep for good.',
    seller: 'snake',
  }),
  I('green_apple', {
    name: 'Green Apple', short: 'TIDE', effect: 'tide', power: 2,
    color: 'leaf2', light: 'leaf4', leaf: 'leaf1', price: 5,
    blurb: 'Bitter enough to make the sea think twice. Pushes the water back two moves.',
    use: 'Buy yourself two more moves.',
    seller: 'snake',
  }),
  I('honey_apple', {
    name: 'Honey Apple', short: 'CALL', effect: 'call',
    color: 'amber', light: 'gold', leaf: 'leaf2', price: 4,
    blurb: 'Roll it and they come to it. One animal walks itself home, and it is free.',
    use: 'Send one animal toward the boat for nothing.',
    seller: 'snake',
  }),
  I('crab_apple', {
    name: 'Crab Apple', short: 'FREE', effect: 'free',
    color: 'coral0', light: 'coral1', leaf: 'leaf1', price: 4,
    blurb: 'Sharp. The next flick you make happens between one wave and the next.',
    use: 'Your next flick costs no tide.',
    seller: 'snake',
  }),
  I('pitch_pot', {
    name: 'Pot of Pitch', short: 'MEND', effect: 'mend', power: 2,
    color: 'wood0', light: 'wood2', leaf: null, price: 5,
    blurb: 'Two planks and a bad smell. Puts the hull back together at sea.',
    use: 'Repair the hull.',
    seller: 'noah',
  }),
];

export const ITEM_BY_ID = Object.freeze(
  ITEMS.reduce((m, i) => { m[i.id] = i; return m; }, {}),
);

/** What one seller stocks. */
export function itemsFrom(who) { return ITEMS.filter((i) => i.seller === who); }

/** Items that are spent DURING a rescue (everything but the ones you use at sea). */
export function rescueItems() { return ITEMS.filter((i) => i.effect !== 'mend'); }

// THE CAST, and what each of them is for.
//
// Five, and no two of them sell the same kind of thing, because the whole point of the
// three gates is that opening one is a choice with a shape:
//
//   SNAKE    apples. Consumables spent inside a rescue. Cheap, immediate, tactical.
//   ADAM     tools and armour. Relics for the hand and the body.
//   EVE      the garden and the patience. Relics that change the run's arithmetic.
//   NOAH     the boat itself, and the only one who gives you work to do.
//   CHERUB   opens the gates, and sells nothing but the one thing nobody else has.
//
// A DEAL is one to three things on a blanket, rolled from that seller's stock against
// the voyage seed, so which two apples the snake has today is fixed for the run and
// choosing a gate is choosing an offer you can plan around.

export const NPCS = [
  {
    id: 'snake', name: 'The Snake', folk: 'snake',
    title: 'sells apples', color: 'leaf3', icon: 'leaf',
    sells: 'items', deal: [1, 2],
    greet: 'Ssssomething for the basket? Nothing in it bites. Much.',
    idle: [
      'The little red one makes them love you. Nobody asked me to be fair.',
      'You have that look. The look of a man with two empty pockets in a basket.',
      'I only ever offered. That is all I have ever done.',
    ],
    buy: 'Enjoy it. They always do.',
    broke: 'Come back with coin. I will still be here. I am always still here.',
  },
  {
    id: 'adam', name: 'Adam', folk: 'adam',
    title: 'sells what he made', color: 'clay3', icon: 'cue',
    sells: 'gear', deal: [1, 2],
    greet: 'I made these. With my hands. Nobody made them for me.',
    idle: [
      'The crook is olive. It will outlast the water and probably me.',
      'Take the plates. I fired them off my own back, and I would do it again.',
      'She named the animals. I only ever built the fences.',
    ],
    buy: 'Use it properly.',
    broke: 'Then earn it. That is what I did.',
  },
  {
    id: 'eve', name: 'Eve', folk: 'eve',
    title: 'sells the long view', color: 'pink', icon: 'leaf',
    sells: 'gear', deal: [1, 3],
    greet: 'You are in a hurry. Everything you are carrying is in a hurry. Sit down.',
    idle: [
      'The stillstone slows the water. Not much. Enough.',
      'Eight more beds. Things that grow somewhere safe are worth more.',
      'I knew the names of all of them. I still do.',
    ],
    buy: 'Plant it somewhere it can be found again.',
    broke: 'Then come back when the garden has paid you.',
  },
  {
    id: 'noah', name: 'Noah', folk: 'noah',
    title: 'works on the boat', color: 'wood4', icon: 'boat',
    sells: 'upgrades', deal: [1, 2],
    greet: 'Right. Let us look at her properly.',
    idle: [
      'Pens first. Everything else is decoration until you have somewhere to put them.',
      'A bigger sail is not speed. It is ocean. There is a difference and you will learn it.',
      'I built one of these before. It went better than people say.',
    ],
    buy: 'She will thank you for it.',
    broke: 'Money first, lad. I am a shipwright, not a charity.',
  },
  {
    id: 'cherub', name: 'The Cherubim', folk: 'cherub',
    title: 'keeps the gate', color: 'magic1', icon: 'star',
    sells: 'gear', deal: [1, 1],
    greet: 'Three gates. One opens. Choose, and do not ask me which.',
    idle: [
      'What is behind them is not a secret. It is only not yours yet.',
      'I have stood here since the beginning. You are not the first to want in.',
      'Breath is expensive. It always was.',
    ],
    buy: 'It is done.',
    broke: 'Not for coin you do not have.',
  },
];

export const NPC_BY_ID = Object.freeze(
  NPCS.reduce((m, n) => { m[n.id] = n; return m; }, {}),
);

/**
 * The doors the Cherubim will open for you now. Never one already standing in the garden,
 * so the pool narrows every visit and the choice sharpens as the run goes on.
 *
 * `n` is normally three. Swearing at the gate opens a fourth, which -- since there are
 * only four people who can come through -- means seeing the whole field at once.
 */
export function rollGates(rng, v, n = 3) {
  const pool = NPCS.filter((x) => x.id !== 'cherub' && v.summoned.indexOf(x.id) < 0);
  if (pool.length <= n) return pool.slice();
  const out = [];
  const rest = pool.slice();
  while (out.length < n && rest.length) {
    const i = rng.int(rest.length);
    out.push(rest[i]);
    rest.splice(i, 1);
  }
  return out;
}

/** How many things this seller lays out today. */
export function dealSize(rng, npc) {
  const [lo, hi] = npc.deal || [1, 2];
  return lo + rng.int(hi - lo + 1);
}

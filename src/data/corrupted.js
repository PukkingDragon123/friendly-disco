// THE CORRUPTED. What the flood does to an animal that has been in the water too long.
//
// They are not monsters and that is the whole design. Every one of them is an ANIMAL --
// the same sprite, the same body plan, tinted toward the deep and walking the wrong way --
// and the moment you take one down it stands there dazed and ordinary again. Throw an
// apple and it is yours: on the boat, and available as a blessed clay beast next island.
//
// So killing is not the point. The point is that everything walking at you is something
// you want, which makes every wave a shopping list you have to survive.
//
// `gives` names the blessed clay beast that taming one teaches you, and the animal you get
// aboard is its `base`. So an otter hands you the reed lily, a crow hands you the owl, and
// the loop is legible: what walked at you last island is what holds the line on the next.
//
// `walk` is tiles a second. `hit` is damage a second against whatever is in the way.
// `armour` subtracts flat damage per hit, which is what makes the shelled ones a puzzle
// rather than a bigger number. `kind` is the trick it brings:
//
//   plain   walks, and hits what is in front of it
//   quick   walks fast, low health
//   armour  slow, shrugs off small hits
//   leap    jumps over the FIRST beast in its way, once
//   swim    crosses water rows as if they were ground
//   flock   arrives in threes
//   caller  heals the corrupted around it
//   digger  passes UNDER the first two beasts in its way

export const CORRUPTED = [
  {
    id: 'c_boar', name: 'Drowned Boar', base: 'boar', kind: 'plain',
    hp: 90, walk: 0.42, hit: 14, armour: 0, weight: 5, tier: 1,
    gives: 'boar',
    blurb: 'It has forgotten which way the shore is.',
  },
  {
    id: 'c_hound', name: 'Sunken Hound', base: 'wolf', kind: 'quick',
    hp: 55, walk: 0.86, hit: 12, armour: 0, weight: 4, tier: 1,
    gives: 'well',
    blurb: 'Faster than it has any right to be, this wet.',
  },
  {
    id: 'c_ox', name: 'Silt Ox', base: 'ox', kind: 'armour',
    hp: 160, walk: 0.26, hit: 22, armour: 6, weight: 3, tier: 1,
    gives: 'thorn',
    blurb: 'Caked to the shoulder. Small hits do nothing.',
  },
  {
    id: 'c_stag', name: 'Pale Stag', base: 'deer', kind: 'leap',
    hp: 80, walk: 0.5, hit: 14, armour: 0, weight: 3, tier: 2,
    gives: 'bell',
    blurb: 'It will go over the first thing you put in front of it.',
  },
  {
    id: 'c_otter', name: 'Black Otter', base: 'otter', kind: 'swim',
    hp: 70, walk: 0.58, hit: 12, armour: 0, weight: 3, tier: 2,
    gives: 'ember',
    blurb: 'The water is not an obstacle to it. It is a road.',
  },
  {
    id: 'c_crow', name: 'Drowned Flock', base: 'raven', kind: 'flock',
    hp: 34, walk: 0.68, hit: 8, armour: 0, weight: 3, tier: 2,
    gives: 'owl',
    blurb: 'Never one of them.',
  },
  {
    id: 'c_mole', name: 'Deep Badger', base: 'badger', kind: 'digger',
    hp: 90, walk: 0.44, hit: 16, armour: 0, weight: 2, tier: 3,
    gives: 'thistle',
    blurb: 'Goes under. Comes up somewhere you did not want it.',
  },
  {
    id: 'c_bull', name: 'The Bellower', base: 'yak', kind: 'caller',
    hp: 260, walk: 0.22, hit: 26, armour: 5, weight: 1, tier: 3,
    gives: 'hive',
    blurb: 'Everything around it stops bleeding when it calls.',
  },
];

export const CORRUPT_BY_ID = Object.freeze(
  CORRUPTED.reduce((m, c) => { m[c.id] = c; return m; }, Object.create(null)),
);

/**
 * Which of them can turn up, by the island's danger AND by how far into the fight it is.
 *
 * The wave index matters as much as the danger. Rolled freely from the whole table, wave
 * one on a dangerous island could open with two Sunken Hounds -- which arrive in eleven
 * seconds, eat a row guard and breach before the player has paid for a second plant. Wave
 * one is always the slow ones; the tricks arrive once there is a board to play them
 * against.
 */
export function tableFor(island, waveIx = 99, waveCount = 5) {
  const d = island.danger || 1;
  const f = waveCount > 1 ? waveIx / (waveCount - 1) : 1;
  const capByWave = waveIx <= 0 ? 1 : waveIx === 1 ? 2 : 9;
  const cap = Math.min(d + 1, capByWave);
  const out = [];
  for (const c of CORRUPTED) {
    if (c.tier > cap) continue;
    // and the first wave is the slow ones, whatever their tier
    if (waveIx <= 0 && c.walk > 0.5) continue;
    const w = c.weight + (c.tier === d ? 2 : 0) + (c.tier > 1 && f > 0.5 ? 2 : 0);
    for (let i = 0; i < w; i++) out.push(c);
  }
  return out.length ? out : [CORRUPTED[0]];
}

/**
 * THE WAVE TABLE.
 *
 * Four waves plus a last one that is twice everything, and a long breather in front of the
 * last so you can spend what the earlier waves paid you. The counts scale with danger and
 * nothing else -- an island's difficulty is a single number the player read off the map
 * before they sailed, and it should mean what it says.
 */
export function wavesFor(island, rng) {
  const d = island.danger || 1;
  const n = 4;
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = (i + 1) / n;
    out.push({
      count: Math.round((2 + d * 0.8) * (0.7 + f * 1.5)),
      gap: Math.max(0.7, 2.3 - f * 0.9 - d * 0.1),
      // A TOWER DEFENCE NEEDS TIME TO BUILD IN. At an eight-second lead the whole island
      // was over in fifty-five seconds and there was never a board worth looking at -- a
      // competent opening cannot even be paid for that fast. Fourteen to eighteen puts a
      // stage at a minute and a half, which is where the decisions live.
      lead: i === 0 ? 20 : 14 + rng.range(0, 4),
      big: false,
    });
  }
  out.push({
    count: Math.round((2 + d * 0.8) * 3),
    gap: Math.max(0.45, 1.2 - d * 0.08),
    lead: 22,                          // the longest breather, right before the worst wave
    big: true,
  });
  return out;
}

/* --------------------------------------------------------------------- events

Something that happens to the FIELD rather than to a beast. They are the reason a stage
cannot be solved with one memorised opening: the same island with a squall in wave three is
a different problem.
*/

export const EVENTS = [
  {
    id: 'squall', name: 'A SQUALL', color: 'water3',
    blurb: 'Rain across the whole field. Everything of yours fires slower.',
    dur: 14,
  },
  {
    id: 'rot', name: 'THE ROT', color: 'moss',
    blurb: 'One row of your beasts is dying. Anything planted there loses health.',
    dur: 12,
  },
  {
    id: 'drought', name: 'A DRY SPELL', color: 'sand',
    blurb: 'The wells run slow. Clay comes half as fast.',
    dur: 16,
  },
  {
    id: 'harvest', name: 'THE TREES GIVE', color: 'red2',
    blurb: 'Every apple tree ripens at once.',
    dur: 1,
  },
  {
    id: 'stampede', name: 'A STAMPEDE', color: 'rust',
    blurb: 'The next wave comes all at once, in every row.',
    dur: 1,
  },
];

export const EVENT_BY_ID = Object.freeze(
  EVENTS.reduce((m, e) => { m[e.id] = e; return m; }, Object.create(null)),
);

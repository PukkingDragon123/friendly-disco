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
//   shield  wears a crust that soaks damage until it is broken off
//   hurler  stops short and throws silt at your beast from two tiles away
//
// AND EVERY ONE OF THEM ENRAGES. Under a third of its health anything walking speeds up
// and hits harder, which is the single change that made the fights good: a wave you have
// nearly beaten is the most dangerous moment in it, and "nearly dead" stops being safe.

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
    id: 'c_pang', name: 'Crusted Pangolin', base: 'pangolin', kind: 'shield',
    hp: 70, walk: 0.3, hit: 18, armour: 4, shell: 130, weight: 3, tier: 2,
    gives: 'maul',
    blurb: 'The crust takes everything until it does not.',
  },
  {
    id: 'c_croc', name: 'Mudjaw', base: 'crocodile', kind: 'hurler',
    hp: 120, walk: 0.36, hit: 20, armour: 2, reach: 2.6, weight: 2, tier: 3,
    gives: 'tide',
    blurb: 'Never comes close enough to be chewed on. Throws instead.',
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

/* ------------------------------------------------------------------ champions

THE LAST WAVE HAS SOMETHING IN IT WITH A NAME.

An island used to end the way it began -- the same table, more of it -- and a stage whose
last thirty seconds are its first thirty seconds louder has no ending, only a stop. So the
final wave walks a champion in behind it: one animal, named, four hundred to a thousand
health, with an AURA that changes what the rest of the wave is doing while it lives.

THREE RULES, and all three are there to make it a fight rather than a wall.
  A guard does not stop it. It breaks, the champion keeps walking, and you have to answer.
  It is the same size as everything else. The art is one resolution -- a champion two
    pixels wide is a lie about the game -- so its presence is a standard, a shadow, a ring
    of motes and a health bar over the field, not a bigger sprite.
  Taming it teaches a beast you almost certainly do not have, so a boss is the one place
    the roster jumps rather than creeps.

Auras:
  haste   everything else in the wave walks a third faster
  heal    everything else in the wave mends while it lives
  crust   everything else in the wave gains armour
*/

export const CHAMPIONS = [
  {
    id: 'ch_sow', name: 'THE SOW THAT LED THEM', base: 'rhino', kind: 'plain',
    hp: 520, walk: 0.28, hit: 30, armour: 4, aura: 'haste', boss: true, tier: 1,
    gives: 'maul',
    blurb: 'She walked the herd into the water and she is still walking.',
  },
  {
    id: 'ch_sire', name: 'THE DROWNED SIRE', base: 'gorilla', kind: 'armour',
    hp: 700, walk: 0.24, hit: 34, armour: 9, aura: 'crust', boss: true, tier: 2,
    gives: 'tide',
    blurb: 'Silt to the shoulders, and it has stopped noticing.',
  },
  {
    id: 'ch_king', name: 'THE BELLOWING KING', base: 'behemoth', kind: 'caller',
    hp: 880, walk: 0.22, hit: 38, armour: 7, aura: 'heal', boss: true, tier: 3,
    gives: 'hive',
    blurb: 'It calls, and nothing in the field is allowed to finish dying.',
  },
  {
    id: 'ch_deep', name: 'THE THING FROM THE DEEP', base: 'kraken', kind: 'swim',
    hp: 1100, walk: 0.26, hit: 42, armour: 11, aura: 'haste', boss: true, tier: 3,
    gives: 'owl',
    blurb: 'It does not know the water ended. It has not looked down.',
  },
];

export const CHAMPION_BY_ID = Object.freeze(
  CHAMPIONS.reduce((m, c) => { m[c.id] = c; return m; }, Object.create(null)),
);

/** The champion this island ends with. One number in, one boss out. */
export function championFor(island) {
  const d = island.danger || 0;
  return CHAMPIONS[Math.min(CHAMPIONS.length - 1, Math.max(0, Math.round(d) - (d >= 1 ? 1 : 0)))];
}

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
  // ONE TIER HIGHER, LATE. Past the halfway mark a dangerous island reaches above its own
  // number, which is what makes the back half of a stage feel like the back half.
  const cap = Math.min(d + 1 + (f > 0.55 ? 1 : 0), capByWave);
  const out = [];
  for (const c of CORRUPTED) {
    if (c.tier > cap) continue;
    // and the first wave is the slow ones, whatever their tier
    if (waveIx <= 0 && c.walk > 0.5) continue;
    let w = c.weight + (c.tier === d ? 2 : 0) + (c.tier > 1 && f > 0.5 ? 3 : 0);
    // the tricks crowd out the plain ones as the fight goes on: by the last wave a stage
    // is mostly things that do something, which is the difference between pressure and
    // paperwork.
    if (c.kind === 'plain' && f > 0.6) w = Math.max(1, w - 3);
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
  // MORE WAVES WHERE THE MAP SAID SO. Four everywhere was four everywhere: the danger
  // number changed how thick a wave was and never how long you had to hold.
  const n = 4 + (d >= 3 ? 1 : 0) + (d >= 5 ? 1 : 0);
  const out = [];
  for (let i = 0; i < n; i++) {
    const f = (i + 1) / n;
    out.push({
      count: Math.round((2 + d * 0.9) * (0.7 + f * 1.65)),
      gap: Math.max(0.5, 2.2 - f * 0.95 - d * 0.12),
      // A TOWER DEFENCE NEEDS TIME TO BUILD IN. At an eight-second lead the whole island
      // was over in fifty-five seconds and there was never a board worth looking at -- a
      // competent opening cannot even be paid for that fast. Twenty to open, and then the
      // breathers shorten as the stage goes on: you get less and less time to answer what
      // the last wave taught you, and the clay you did not spend is the reason you can.
      lead: i === 0 ? 20 : Math.max(8, 15 - d * 0.5 - f * 4) + rng.range(0, 3),
      big: false,
    });
  }
  out.push({
    count: Math.round((2 + d * 0.95) * 3.1),
    gap: Math.max(0.4, 1.15 - d * 0.08),
    lead: 22,                          // the longest breather, right before the worst wave
    big: true,
    champion: true,                    // and it has a name in it
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
    id: 'howl', name: 'A HOWL GOES UP', color: 'purple0',
    blurb: 'Everything out there walks faster while it lasts.',
    dur: 12,
  },
  {
    id: 'give', name: 'THE CLAY GIVES', color: 'clay4',
    blurb: 'The ground throws up clay. Grab it before it sinks back.',
    dur: 2,
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

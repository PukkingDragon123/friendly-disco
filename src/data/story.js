// The story, as dialogue scripts.
//
// A script is a background, a track, and a list of lines. Each line names a speaker, its
// text, and optionally an effect the cutscene scene fires as the line lands. Keeping it
// as data means the scene is dumb and the writing can be edited without touching code.
//
// Line lengths are tuned to wrap into at most three rows of FONT7 at 470px.

export const SPEAKERS = {
  god: { name: 'THE VOICE', portrait: 'god', color: 'gold', tint: 'brass3' },
  noah: { name: 'NOAH', portrait: 'noah', color: 'brass3', tint: 'sand' },
  // You. A golem does not have a voice, so its lines are actions in brackets, and
  // the one word on its brow is the only thing it ever says.
  golem: { name: 'THE GOLEM', portrait: 'golem', color: 'orange', tint: 'amber' },
  shepherd: { name: 'THE SHEPHERD', portrait: 'shepherd', color: 'ice', tint: 'sky' },
  angel: { name: 'THE MESSENGER', portrait: 'angel', color: 'foam', tint: 'white' },
  cherub: { name: 'THE CHERUBIM', portrait: 'cupid', color: 'pink', tint: 'red2' },
  snake: { name: 'THE SERPENT', portrait: 'snake', color: 'green1', tint: 'foam' },
  adam: { name: 'ADAM', portrait: 'adam', color: 'sand', tint: 'gold' },
  eve: { name: 'EVE', portrait: 'eve', color: 'pink', tint: 'gold' },
  dove: { name: 'THE DOVE', portrait: 'dove', color: 'white', tint: 'green1' },
  disaster: { name: 'THE DISASTER', portrait: 'disaster', color: 'red2', tint: 'orange' },
};

const L = (who, text, fx) => ({ who, text, fx });

/* --------------------------------------------------------------- the arc */

export const PROLOGUE = {
  id: 'prologue',
  bg: { timeOfDay: 0.5, storm: 0.35 },
  music: 'harbour',
  title: 'THE ARK IS FINISHED. THE ANIMALS ARE NOT.',
  lines: [
    L('noah', 'The ark is done. Three decks, a door, and pitch inside and out.', null),
    L('noah', 'It took me a hundred years. It took the animals four days to ruin it.', 'shake'),
    L('god', 'What is the trouble.', 'rays'),
    L('noah', 'They will not GO IN. The ostrich is on the roof. The pigs are under the hull.',
      null),
    L('noah', 'Two of everything, and every one of them has an opinion about where it sleeps.', null),
    L('god', 'Then you need hands that do not get tired and do not get argued with.', 'flash'),
    L('noah', '(a hundredweight of river clay stands up)', 'shake'),
    L('golem', '(it has no face to speak with. There is a word driven into its brow.)', 'rays'),
    L('god', 'It is made of the riverbank and it will last exactly as long as the word does.', null),
    L('noah', 'What is it FOR.', null),
    L('god', 'Pushing. Every creature on that deck goes to a berth it can live in — and it',
      null),
    L('god', 'will push them there one at a time until the water is over the rail.', 'wave'),
    L('noah', 'And if it misses?', null),
    L('golem', '(the light behind its eyes does not change. It waits.)', null),
    L('god', 'Then it is clay again, and I will make another one. Begin.', 'lightning'),
  ],
};

export const TUTORIAL = {
  id: 'tutorial',
  bg: { timeOfDay: 0.28, storm: 0.12 },
  music: 'deck',
  title: 'HOW TO MOVE AN ANIMAL',
  lines: [
    L('noah', 'Right. You shove them. Any of them, whichever one you like — they all shove.', null),
    L('noah', 'The six mouths round the rail are BERTHS. Each one offers a condition.',
      'rays'),
    L('noah', 'Warm. Bushy. Soaked. That sort of thing. Read the plate on the rail.', null),
    L('noah', 'Every animal wants two or three conditions, in order. Its FAVOURITE pays triple.',
      'flash'),
    L('noah', 'Second or third choice still pays — it is content, not delighted. Give it',
      null),
    L('noah', 'something it hates and it will cost you more than leaving it on the deck.',
      null),
    L('noah', 'They notice each other too. A fox berthed next to a rabbit will not stay hungry.',
      null),
    L('golem', '(it looks at the fox. The fox stops looking back.)', null),
    L('noah', 'One more thing, and I am sorry about it. There is no aiming line.', 'shake'),
    L('noah', 'You get the power gauge and your own eye. I did not build a protractor.', null),
    L('noah', 'The water climbs one mark per shove. Count before you swing.', 'wave'),
  ],
};

// One beat per ante: the flood eats the world while you work.
export const ANTE_LINES = {
  1: [L('god', 'The first rain. For now, it is only rain.', 'rain')],
  2: [L('god', 'The rivers have turned around and begun climbing their own banks.', 'wave')],
  3: [L('god', 'The low countries are under. Do not go looking for them.', 'rain'),
    L('noah', 'There were people in the low countries.', null),
    L('god', 'Keep shoving.', 'lightning')],
  4: [L('god', 'Half the world is water. The other half is arguing about whose fault it is.', null)],
  5: [L('god', 'The mountains are islands now. The islands are a rumour.', 'wave')],
  6: [L('noah', 'There is nothing on the horizon in any direction.', 'rain'),
    L('god', 'There is the deck. There is what you saved. That was always the whole list.', 'rays')],
  7: [L('god', 'Forty days was the promise. This is the thirty-ninth.', 'lightning')],
  8: [L('god', 'One more. Then I will let the sun back in and we will never speak of it.', 'rays')],
};

export const EPILOGUE_WIN = {
  id: 'epilogue_win',
  bg: { timeOfDay: 0.06, storm: 0 },
  music: 'victory',
  title: 'LANDFALL',
  lines: [
    L('dove', '(returns, and drops an olive sprig on the felt)', 'rays'),
    L('noah', 'Land.', null),
    L('god', 'Land. Open the door and let them off.', 'flash'),
    L('noah', 'Every one of them in a berth it could live in. Every single one.', null),
    L('golem', '(it sets down the last animal. Then it stands where it was put.)', null),
    L('noah', 'You can stop now. Nobody is going to argue with you again.', null),
    L('god', 'Keep the word. It has earned the word.', 'rays'),
    L('god', 'And I will hang a bow in the clouds, so I remember not to do that again.', 'rays'),
    L('cherub', '(they are already fighting over who carries the bow)', null),
  ],
};

export const EPILOGUE_LOSE = {
  id: 'epilogue_lose',
  bg: { timeOfDay: 0.78, storm: 0.95 },
  music: 'gameover',
  title: 'THE WATER TAKES THE DECK',
  lines: [
    L('god', 'The water has the deck.', 'wave'),
    L('noah', 'It needed one more shove.', null),
    L('golem', '(the light behind its eyes goes out. The word is only scratches now.)', 'shake'),
    L('god', 'Everyone needs one more. Dig up the bank; I have nothing but time.', 'rain'),
  ],
};

/* --------------------------------------------------------- boss disasters */

// Keyed by boss id. The disaster itself speaks, in its own register.
export const BOSS_LINES = {
  deluge: [L('disaster', 'I AM THE FORTY DAYS. I DO NOT NEGOTIATE, I ONLY ARRIVE.', 'wave'),
    L('god', 'It rises twice as fast while this one is on the water. Be quick.', null)],
  fimbulwinter: [L('disaster', 'THREE WINTERS AND NO SUMMER BETWEEN THEM.', 'flash'),
    L('noah', 'The deck has frozen. Nothing you push is going to stop rolling.', null)],
  plagues: [L('disaster', 'LOCUSTS. FROGS. BOILS. I HAVE BROUGHT A LIST.', 'rain'),
    L('god', 'Everything you count will count for less. Count more of it.', null)],
  poseidon: [L('disaster', 'THE SEA IS MINE AND I AM TILTING IT.', 'wave')],
  leviathan: [L('disaster', 'ONE OF THE CREATURES ON YOUR DECK IS NOT A CREATURE.', 'lightning'),
    L('noah', 'Which one?', null),
    L('disaster', 'YES.', null)],
  fenrir: [L('disaster', 'I ATE THE SUN. A SHOT IS NOTHING.', 'lightning')],
  typhon: [L('disaster', 'A HUNDRED HEADS, AND EVERY ONE OF THEM IS LEANING ON YOUR GATES.', 'shake')],
  jormungandr: [L('disaster', 'I CIRCLE THE WORLD. WATCH THE GATES GO ROUND WITH ME.', 'wave')],
  duat: [L('disaster', 'STEP INTO THE DARK AND TELL ME WHICH DOOR IS WHICH.', 'flash')],
  tiamat: [L('disaster', 'I AM THE SALT MOTHER. I HALVE WHAT YOU MULTIPLY.', 'shake')],
  vritra: [L('disaster', 'I HAVE SWALLOWED THE RIVERS. DRINK FROM MY COILS.', 'rain')],
  amaterasu: [L('disaster', 'SHE HAS GONE INTO THE CAVE AND TAKEN THE LIGHT WITH HER.', 'flash')],
  charybdis: [L('disaster', 'DOWN. EVERYTHING GOES DOWN, AND IT GOES DOWN HERE.', 'wave')],
  maat: [L('disaster', 'YOUR SHOT WILL BE WEIGHED AGAINST A FEATHER.', 'rays'),
    L('god', 'A weak shot costs you a shot. Do not be light.', null)],
  eden: [L('disaster', 'THREE GATES ARE SHUT AND THE FLAMING SWORD IS AT EACH.', 'flash')],
  ragnarok: [L('disaster', 'THIS IS THE LAST ONE. I HAVE BROUGHT EVERYTHING.', 'lightning'),
    L('god', 'So have you. Go on.', 'rays')],
};

/* -------------------------------------------------------------- accessors */

export const SCRIPTS = {
  prologue: PROLOGUE,
  tutorial: TUTORIAL,
  epilogue_win: EPILOGUE_WIN,
  epilogue_lose: EPILOGUE_LOSE,
};

export function getScript(id) { return SCRIPTS[id] || null; }

/** The short beat that opens an ante. */
export function anteScript(ante) {
  const lines = ANTE_LINES[Math.max(1, Math.min(8, ante | 0))];
  if (!lines || !lines.length) return null;
  const storm = Math.min(0.9, 0.08 + ante * 0.1);
  return {
    id: 'ante' + ante,
    bg: { timeOfDay: ante >= 7 ? 0.72 : ante >= 4 ? 0.5 : 0.28, storm },
    music: ante >= 6 ? 'deck_tense' : 'deck',
    title: 'DAY ' + (ante * 5),
    lines,
  };
}

/** The disaster's entrance. `boss` is the record from data/blinds.js. */
export function bossScript(boss) {
  if (!boss) return null;
  const lines = BOSS_LINES[boss.id]
    || [{ who: 'disaster', text: (boss.disaster || boss.desc || 'I HAVE COME FOR THE DECK.').toUpperCase(), fx: 'lightning' }];
  return {
    id: 'boss_' + boss.id,
    bg: { timeOfDay: 0.72, storm: 0.85 },
    music: 'boss',
    title: String(boss.name).toUpperCase(),
    boss,
    lines,
  };
}

/** Contextual coaching, shown once each. The scene decides when to ask. */
export const HINTS = {
  first_wrong: 'That gate was not its home. Wrong gates keep a quarter of the chips.',
  first_eat: 'It ate the other one. Predators feed on prey already in the gate.',
  flood_high: 'The water is at the rail. One more shot and the deck is gone.',
  first_combo: 'Two in one shot. Every extra animal compounds the multiplier.',
  last_shot: 'Last shot. Make it count or the water finishes the job.',
};

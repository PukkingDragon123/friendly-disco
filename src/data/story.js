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
  title: 'THE WORLD IS BEING TAKEN BACK',
  lines: [
    L('god', 'I made it in six days and I have been watching it for a long time.', 'wrath'),
    L('god', 'I am not going to argue about it. I am going to wash it.', null),
    L('noah', 'All of it?', null),
    L('god', 'All of it. The water started an hour ago.', null),
    L('noah', 'The rivers came up over the road before we had the barley in.', 'flood'),
    L('noah', 'Then the sea stood up and walked inland and there was no road.', null),
    L('god', 'Every living thing is on high ground now, and the high ground is shrinking.', null),
    L('noah', 'I built the boat. Three decks, a door, pitch inside and out.', null),
    L('noah', 'I am ninety. I cannot go and fetch a bear.', null),
    L('god', 'Then you need hands that do not get tired. Go down to the river.', 'forge'),
    L('golem', '(a hundredweight of riverbank stands up. There is a word cut into its brow.)', null),
    L('god', 'It is made of the bank and it lasts exactly as long as the word does.', null),
    L('noah', 'What is it FOR.', null),
    L('god', 'Rescue. Everything out there is cornered, and something has got at them.', null),
    L('noah', 'Got at them how?', null),
    L('god', 'You will see it when you land. It was a deer this morning.', 'lightning'),
    L('god', 'Beat the corruption out of a beast and it comes back to itself.',  'rays'),
    L('god', 'Then give it an apple, and it will follow you onto that boat.', 'flash'),
    L('noah', 'And the ones we cannot reach?', null),
    L('god', 'That is the arithmetic. Go. Take the clay with you.', 'lightning'),
  ],
};

export const TUTORIAL = {
  id: 'tutorial',
  bg: { timeOfDay: 0.28, storm: 0.12 },
  music: 'deck',
  title: 'HOW AN ISLAND GOES',
  lines: [
    L('noah', 'Right. Five rows of ground, the sea behind you, and the ark at your back.', null),
    L('noah', 'The corrupted come along the rows. Every row they finish is a row we lose.', null),
    L('golem', '(it opens its hands. Wet clay, and not very much of it.)', null),
    L('noah', 'CLAY is what you spend. It drips in on its own, and a WELL makes more.',  'rays'),
    L('noah', 'Put the cheap ones down first. You cannot fight on an empty bank.', null),
    L('noah', 'A REED floats. Water rows need one before anything else will stand there.', 'wave'),
    L('noah', 'Knock a beast down and it stops being corrupted. It lies there, stunned.', 'shake'),
    L('noah', 'Then THROW AN APPLE at it. That is the rescue. That is the whole game.', 'flash'),
    L('noah', 'A tamed beast is yours: blessed clay, and it will stand a row for you after.', 'rays'),
    L('noah', 'Trees on the field carry apples. Shake them when they are ripe.', null),
    L('golem', '(it looks at the rows, and then at the two apples in its hand)', null),
    L('noah', 'Every row has one guard plank. After that they are chewing on the ark.', null),
    L('noah', 'So it is never how many you can save. It is which ones, and in what order.', null),
  ],
};

export const EPILOGUE_WIN = {
  id: 'epilogue_win',
  bg: { timeOfDay: 0.06, storm: 0 },
  music: 'victory',
  title: 'LANDFALL',
  lines: [
    L('dove', '(returns, and drops an olive sprig on the deck)', 'rays'),
    L('noah', 'Land.', null),
    L('god', 'Land. Open the door and let them off.', 'flash'),
    L('noah', 'Every one of them out of the mud and onto the grass. Every single one.', null),
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
    L('god', 'The water has the deck.', 'flood'),
    L('noah', 'It needed one more apple.', null),
    L('golem', '(the light behind its eyes goes out. The word is only scratches now.)', 'shake'),
    L('god', 'Everyone needs one more. Dig up the bank; I have nothing but time.', 'rain'),
  ],
};

/* ---------------------------------------------------------- the chapters

Four beats, one per chapter, and every one of them is about the same thing getting
worse. Kept to three lines each: a chapter opener that outstays its welcome is a chapter
opener the player skips, and then the one that matters gets skipped too.
*/
export const CHAPTER_LINES = {
  2: [
    L('noah', 'The low islands are gone. Not flooded. GONE.', 'wave'),
    L('golem', '(it looks at the deck, and then at the pens still standing empty)', null),
    L('noah', 'Whatever you were leaving room for, this is it.', null),
  ],
  3: [
    L('noah', 'The corruption is thicker out here. They come four rows at a time now.', 'shake'),
    L('god', 'The mountains are next, and there are big things living on mountains.', 'rays'),
    L('noah', 'Then we go where the mountains are, and we take every apple we have.', null),
  ],
  4: [
    L('god', 'There is nowhere left above the water but one ridge.', 'lightning'),
    L('noah', 'Everything alive is standing on it. So is everything that got at them.', null),
    L('golem', '(a hundred and fifty days of carrying. It does not put anything down.)', null),
  ],
};

/** The short beat that opens a chapter. Null for chapter one -- the prologue is that. */
export function chapterScript(n) {
  const lines = CHAPTER_LINES[n];
  if (!lines || !lines.length) return null;
  return {
    id: 'chapter' + n,
    bg: { timeOfDay: n >= 4 ? 0.74 : n >= 3 ? 0.52 : 0.3, storm: Math.min(0.9, 0.12 + n * 0.2) },
    music: n >= 3 ? 'deck_tense' : 'deck',
    title: 'CHAPTER ' + n,
    lines,
  };
}

/* -------------------------------------------------------------- accessors */

export const SCRIPTS = {
  prologue: PROLOGUE,
  tutorial: TUTORIAL,
  epilogue_win: EPILOGUE_WIN,
  epilogue_lose: EPILOGUE_LOSE,
};

export function getScript(id) {
  if (SCRIPTS[id]) return SCRIPTS[id];
  // chapter2 .. chapter4 are built rather than listed, so the router can ask for a beat
  // by name without knowing whether one exists
  const m = /^chapter(\d+)$/.exec(String(id || ''));
  if (m) return chapterScript(Number(m[1]));
  return null;
}

/* ------------------------------------------------------------------ heaven

What he says when you report in. He is dead, he is not in a hurry, and he can see the
ledger -- so these read the run rather than the plot: how many are aboard, how many are
in the garden, and how many got there before you.

Kept short. A man who has finished does not make speeches.
*/
export function heavenLines(v, kind) {
  const saved = (v && v.eden ? v.eden.length : 0) + (v && v.aboard ? v.aboard.length : 0);
  const lost = v && v.lost ? v.lost.length : 0;
  const money = v && v.money ? v.money : 0;
  const out = [];
  if (kind === 'win') {
    out.push('Land. You found land. I can see it from here, which is not the same as standing on it.');
    out.push(`${saved} of them off the boat and onto the grass. I counted every one with you.`);
    if (lost) out.push(`And ${lost} here with me. They are not angry. They were never going to be.`);
    out.push('Sit down. You do not get tired, but sit down anyway. That is what the seat is for.');
    return out;
  }
  if (kind === 'lose') {
    out.push('The water took her. I felt it go.');
    out.push(lost ? `${lost} of them are here, and they came in talking about you.`
      : 'And you brought nobody here but yourself, which is its own kind of arithmetic.');
    out.push('It was never how many. It was that somebody went out at all. Go again.');
    return out;
  }
  // a chapter break: he is checking in, and he is specific about it
  out.push([
    'You are further out than I ever got. How is she riding?',
    'Halfway. The water is not going to get bored before you do.',
    'I can see the ridge from here. Everything left alive is standing on it.',
  ][Math.max(0, Math.min(2, (v ? v.chapter : 2) - 2))]);
  out.push(`${saved} carried, ${lost} lost, ${money} coins in the tin. I am not going to tell you which of those matters.`);
  if (lost > saved) out.push('More here than there. I am not blaming you. I am telling you the number.');
  else if (lost === 0) out.push('Nobody here yet. Do not get proud about it, it is early.');
  else out.push('They sit where they like and they wait for the rest. Go on, then.');
  return out;
}

export function heavenTitle(kind) {
  return kind === 'win' ? 'LANDFALL, AND A SEAT BY HIM'
    : kind === 'lose' ? 'HE KEPT THE SEAT ANYWAY'
      : 'A SEAT BY HIM';
}

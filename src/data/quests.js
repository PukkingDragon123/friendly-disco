// NOAH'S LIST.
//
// He is the only one on the island who thinks in terms of what happens next, so he is the
// one who hands out work. Every quest is a GOAL READ OFF THE LEDGER -- voyage.stats and
// nothing else -- which means no quest needs its own bookkeeping, no quest can desync
// from what actually happened, and a quest handed out late still counts the animals you
// saved before he asked.
//
// They come in order, one at a time, because a list of nine open objectives is a chore
// list and one is a conversation.

const Q = (id, o) => Object.assign({ id, goal: 1 }, o);

export const QUESTS = [
  Q('first_haul', {
    name: 'A Start', goal: 4, stat: 'rescued',
    ask: 'Four aboard. Any four. I want to see you can do it before I spend on you.',
    done: 'Four. Good. Now do it again with the water higher.',
    reward: { money: 8 },
  }),
  Q('clear_the_way', {
    name: 'Use What You Have', goal: 3, stat: 'obstaclesCleared',
    ask: 'Put three of them down on three things in the way. They are not luggage, lad.',
    done: 'Now you see it. An animal is a tool with legs.',
    reward: { money: 10, item: 'honey_apple' },
  }),
  Q('the_garden', {
    name: 'Somewhere Safe', goal: 6, stat: 'gardened',
    ask: 'Six in the garden. Aboard is not safe. Aboard is just not drowned yet.',
    done: 'Six that nothing can reach. That is the first real thing you have done.',
    reward: { money: 14, gear: 'seed_satchel' },
  }),
  Q('a_full_deck', {
    name: 'A Full Deck', goal: 10, stat: 'rescued',
    ask: 'Ten saved, all told. I will pay for the pens myself if you get there.',
    done: 'Ten. The pens are on me.',
    reward: { money: 12, upgrade: 'capacity' },
  }),
  Q('the_islands', {
    name: 'Go And Look', goal: 5, stat: 'islands',
    ask: 'Five islands. Not the rock with the gate on it -- real ones, with weather.',
    done: 'You have seen more of it than I have now.',
    reward: { money: 16 },
  }),
  Q('a_loyal_one', {
    name: 'One That Stays', goal: 2, stat: 'applesUsed',
    ask: 'Two apples spent. I do not care which. The snake needs the custom and you need the friends.',
    done: 'Two that will not leave. Keep them close.',
    reward: { money: 12, gear: 'rope_harness' },
  }),
  Q('the_hard_ones', {
    name: 'The Hard Ones', goal: 9, stat: 'obstaclesCleared',
    ask: 'Nine things moved out of the way. I want the hull tested, not the deck.',
    done: 'Nine. I will pitch her myself.',
    reward: { money: 14, upgrade: 'hull' },
  }),
  Q('a_good_island', {
    name: 'A Good Island', goal: 6, stat: 'bestRescue',
    ask: 'Six off one island in one go. It can be done. I have seen it done.',
    done: 'Six in one go. That is the whole trick of it.',
    reward: { money: 24, gear: 'doves_favour' },
  }),
  Q('the_whole_voyage', {
    name: 'Everything', goal: 30, stat: 'rescued',
    ask: 'Thirty. Then we are talking about a new world and not about a boat.',
    done: 'Thirty saved. Whatever is on the other side of this, you built it.',
    reward: { money: 40 },
  }),
];

export const QUEST_BY_ID = Object.freeze(
  QUESTS.reduce((m, q) => { m[q.id] = q; return m; }, {}),
);

/** Where a quest's number comes from. `gardened` is not a counter, it is a look. */
export function progressOf(v, quest) {
  if (!quest) return 0;
  if (quest.stat === 'gardened') return v.eden.length;
  return (v.stats && v.stats[quest.stat]) || 0;
}

/** The quest Noah is currently on about, or null when the list is done. */
export function currentQuest(v) {
  for (const q of QUESTS) {
    if (v.quests.indexOf(q.id) >= 0) continue;
    return q;
  }
  return null;
}

export function questDone(v, quest) {
  return !!quest && progressOf(v, quest) >= quest.goal;
}

/** A one-line summary of the reward, for the panel. */
export function rewardText(reward) {
  if (!reward) return '';
  const bits = [];
  if (reward.money) bits.push(`$${reward.money}`);
  if (reward.item) bits.push('an apple');
  if (reward.gear) bits.push('a relic');
  if (reward.upgrade) bits.push('a free upgrade');
  return bits.join(' + ');
}

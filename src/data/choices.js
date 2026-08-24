// THINGS THAT HAPPEN ON THE WAY IN.
//
// Between choosing an island and working it, something asks you for a decision. Not a
// dialogue tree -- two or three lines and two or three options, and every option costs
// something real. The rule the whole file is written to:
//
//     NO OPTION IS FREE, AND NO OPTION IS OBVIOUSLY RIGHT.
//
// If one choice is strictly better it is not a choice, it is a prize with extra reading.
// So the shape is nearly always: take the sure thing now, or spend something for a
// FLAG -- and the flags are what make a run have a history. A shepherd you helped comes
// back. A boat you stripped is remembered by everybody who sells to you.
//
// EFFECTS ARE DATA, not functions. The vocabulary is closed and game/choices.js is the
// only thing that can apply it, which means an encounter can never quietly do something
// the rest of the game does not know about:
//
//   money   n         coins, positive or negative
//   hull    n         planks, positive or negative
//   tide    n         legs of flood, positive (worse) or negative (better)
//   item    id        into the basket
//   gear    id        equipped, displacing its slot
//   animal  id|'wild' onto the deck if there is a berth
//   lose    n         n off the deck, never a loyal one
//   loyal   n         n aboard become loyal
//   beds    n         more beds in the garden, permanently
//   berths  n         more pens, permanently
//   stat    {k:n}     nudges the ledger the quests read
//   flag    name      sets a flag other content reads

const C = (id, o) => Object.assign({ id, weight: 10 }, o);

/** Every flag any option can set, and what reads it. Tested against the content. */
export const FLAGS = {
  kind: 'Word gets round. Everyone who sells to you knocks a coin off.',
  robbed: 'Word gets round. Everyone who sells to you puts two coins on.',
  whale: 'The whale shadows you. One animal a rescue is pulled out of deep water.',
  dove: 'The dove flies ahead. The flood gains less on every crossing.',
  shepherd: 'The old shepherd owes you. He turns up when it is worst.',
  charted: 'You have his charts. Islands read one step less dangerous.',
  sworn: 'You swore at the gate. The Cherubim opens a fourth door.',
  greedy: 'You took the gold. The garden grows slower for it.',
};

export const CHOICES = [
  C('raft', {
    title: 'A RAFT, LOW IN THE WATER',
    who: 'noah',
    lines: [
      'Somebody lashed four doors together and it nearly worked.',
      'There is a man on it, a goat, and a sack he will not let go of.',
    ],
    options: [
      {
        label: 'TAKE THEM BOTH ABOARD',
        blurb: 'A berth for the goat, and the man walks the deck.',
        cost: 'a pen',
        effects: [{ animal: 'goat' }, { flag: 'kind' }, { stat: { rescued: 1 } }],
        outcome: 'He gives you the sack. It is seed. He says the goat is called Margaret.',
      },
      {
        label: 'THE SACK ONLY',
        blurb: 'You cannot feed everybody. You can carry a sack.',
        cost: 'their opinion of you',
        effects: [{ money: 9 }, { flag: 'robbed' }],
        outcome: 'He does not shout. That is somehow worse.',
      },
      {
        label: 'TOW THE RAFT',
        blurb: 'Slower going. Everybody lives.',
        cost: 'a crossing of tide',
        effects: [{ tide: 1 }, { flag: 'kind' }, { beds: 4 }],
        outcome: 'You lose half a day and gain four beds worth of hands in the garden.',
      },
    ],
  }),

  C('whale', {
    title: 'SOMETHING UNDER THE HULL',
    who: 'golem',
    lines: [
      'It is longer than the boat and it has been there since dawn.',
      'There is a harpoon in the locker. There is also a lot of nothing to eat.',
    ],
    options: [
      {
        label: 'PUT THE HARPOON DOWN',
        blurb: 'It has done nothing to you.',
        cost: 'a hungry week',
        effects: [{ flag: 'whale' }, { money: -3 }],
        outcome: 'It surfaces once, level with your eye, and then swims ahead of you.',
      },
      {
        label: 'TAKE IT',
        blurb: 'Meat, oil, and a month of not worrying.',
        cost: 'whatever that is worth',
        effects: [{ money: 16 }, { flag: 'robbed' }, { hull: -1 }],
        outcome: 'It takes a plank with it going down. You eat for a month.',
      },
    ],
  }),

  C('dove', {
    title: 'A BIRD IN THE RIGGING',
    who: 'noah',
    lines: [
      'A dove. Exhausted, and it has come a long way to get here.',
      'It will not last another night out in it.',
    ],
    options: [
      {
        label: 'A CAGE AND A HANDFUL OF GRAIN',
        blurb: 'Keep it safe. Keep it yours.',
        cost: 'nothing at all',
        effects: [{ animal: 'dove' }],
        outcome: 'It sleeps in the lantern housing and will not leave the boat.',
      },
      {
        label: 'LET IT GO IN THE MORNING',
        blurb: 'It knows where land is. You do not.',
        cost: 'a berth you could have filled',
        effects: [{ flag: 'dove' }],
        outcome: 'It goes east at first light. After that the water is always a little behind you.',
      },
    ],
  }),

  C('shepherd', {
    title: 'A MAN ON A ROOF',
    who: 'shepherd',
    lines: [
      'He is standing on the last tiles of somebody\'s house with eleven sheep.',
      'The boat will take four of them. He knows that. He is doing the arithmetic.',
    ],
    options: [
      {
        label: 'FOUR SHEEP, AND HIM',
        blurb: 'He picks which four. You do not want to watch.',
        cost: 'the pens',
        effects: [{ animal: 'sheep' }, { animal: 'sheep' }, { flag: 'shepherd' }],
        outcome: 'He picks the four youngest without looking at the others. Then he is quiet.',
      },
      {
        label: 'HIM ONLY. HE CAN WORK.',
        blurb: 'A pair of hands is worth more than a pair of sheep.',
        cost: 'eleven sheep',
        effects: [{ flag: 'shepherd' }, { beds: 6 }, { money: 4 }],
        outcome: 'He does not speak for two days. Then he starts digging beds.',
      },
      {
        label: 'THROW HIM A ROPE AND GO',
        blurb: 'You have your own to think about.',
        cost: 'nothing you can see yet',
        effects: [{ money: 6 }, { flag: 'robbed' }, { stat: { drowned: 2 } }],
        outcome: 'He does not take the rope.',
      },
    ],
  }),

  C('chartroom', {
    title: 'A WRECK, STILL FLOATING',
    who: 'golem',
    lines: [
      'A trader, holed and empty. The crew went into the water days ago.',
      'The chart table is dry. So is the strongbox.',
    ],
    options: [
      {
        label: 'THE CHARTS',
        blurb: 'Every reef and channel from here to the mountains.',
        cost: 'the gold you can see',
        effects: [{ flag: 'charted' }],
        outcome: 'Somebody spent a life drawing these. You can read the water now.',
      },
      {
        label: 'THE STRONGBOX',
        blurb: 'Heavy. You know exactly what it is worth.',
        cost: 'knowing where you are going',
        effects: [{ money: 22 }, { flag: 'greedy' }],
        outcome: 'Twenty-two coins and a compass that does not work.',
      },
      {
        label: 'BOTH, AND BURN HER',
        blurb: 'Nobody else is having either.',
        cost: 'a plank and your name',
        effects: [{ money: 14 }, { flag: 'charted' }, { flag: 'robbed' }, { hull: -2 }],
        outcome: 'The smoke is visible for a day. People ask about it later.',
      },
    ],
  }),

  C('gate_oath', {
    title: 'THE GATE ASKS SOMETHING',
    who: 'cherub',
    lines: [
      'The rock is behind you and the voice is not.',
      'IT ASKS WHAT YOU WILL DO WITH WHAT YOU HAVE SAVED.',
    ],
    options: [
      {
        label: 'SWEAR TO LET THEM ALL GO',
        blurb: 'Every animal, on the far shore, free.',
        cost: 'everything you might have sold',
        effects: [{ flag: 'sworn' }, { loyal: 2 }],
        outcome: 'Two of them come and stand by you while you say it.',
      },
      {
        label: 'SAY NOTHING',
        blurb: 'You are not a man who makes promises at sea.',
        cost: 'nothing. That is the point.',
        effects: [{ money: 5 }],
        outcome: 'The voice does not ask twice.',
      },
    ],
  }),

  C('pens_broken', {
    title: 'THE PENS ARE COMING APART',
    who: 'noah',
    lines: [
      'Two of the rails have gone and the third is not going to hold weather.',
      'There is enough timber for the pens OR the hull. Not both.',
    ],
    options: [
      {
        label: 'FIX THE PENS',
        blurb: 'More room, thinner boat.',
        cost: 'two planks off the hull',
        effects: [{ berths: 2 }, { hull: -2 }],
        outcome: 'Two more pens and a boat you should not test.',
      },
      {
        label: 'FIX THE HULL',
        blurb: 'Fewer aboard, and all of them still afloat.',
        cost: 'a pen',
        effects: [{ hull: 3 }, { lose: 1 }],
        outcome: 'One goes over the side to make room for the bracing. It is quick.',
      },
    ],
  }),

  C('shepherd_returns', {
    title: 'HE COMES BACK',
    who: 'shepherd',
    needs: 'shepherd',
    lines: [
      'The old shepherd has been up all night with the ones you could not reach.',
      'He has something for you. He has clearly been carrying it a while.',
    ],
    options: [
      {
        label: 'TAKE IT',
        blurb: 'A crook cut from an olive that outlived the garden.',
        cost: 'nothing. He insists.',
        effects: [{ gear: 'long_crook' }, { stat: { rescued: 1 } }],
        outcome: 'He shows you how to hold it and then goes back to the rail.',
      },
      {
        label: 'TELL HIM TO KEEP IT',
        blurb: 'He has less than you do.',
        cost: 'a relic',
        effects: [{ money: 8 }, { loyal: 1 }, { flag: 'kind' }],
        outcome: 'He keeps it, and gives you the coins he was saving to buy one back.',
      },
    ],
  }),

  C('the_debt', {
    title: 'SOMEBODY REMEMBERS YOU',
    who: 'snake',
    needs: 'robbed',
    lines: [
      'A boat comes alongside and nobody on it is smiling.',
      'They know what you took off the raft. Everybody knows.',
    ],
    options: [
      {
        label: 'PAY THEM OFF',
        blurb: 'Coins are cheaper than a boarding.',
        cost: 'most of the purse',
        effects: [{ money: -12 }],
        outcome: 'They take it and go. Word does not travel any further today.',
      },
      {
        label: 'LET THEM TRY',
        blurb: 'You are made of a riverbank.',
        cost: 'the hull, and one of them',
        effects: [{ hull: -2 }, { lose: 1 }, { money: 6 }],
        outcome: 'They do not board twice. Something went over the side in the middle of it.',
      },
    ],
  }),

  C('the_kind_word', {
    title: 'THEY HEARD ABOUT YOU',
    who: 'eve',
    needs: 'kind',
    lines: [
      'Three boats have found each other and made a raft of themselves.',
      'They heard what you did on the water. They have set aside a share.',
    ],
    options: [
      {
        label: 'TAKE THE SHARE',
        blurb: 'Seed, rope and two apples.',
        cost: 'nothing',
        effects: [{ money: 10 }, { item: 'green_apple' }],
        outcome: 'They will not take anything back for it, either.',
      },
      {
        label: 'LEAVE IT WITH THEM',
        blurb: 'They have further to go than you.',
        cost: 'the share',
        effects: [{ beds: 6 }, { loyal: 1 }, { flag: 'kind' }],
        outcome: 'Six of them come with you instead, and they can dig.',
      },
    ],
  }),
];

export const CHOICE_BY_ID = Object.freeze(
  CHOICES.reduce((m, c) => { m[c.id] = c; return m; }, {}),
);

/** Every effect key any option may use. game/choices.js implements exactly these. */
export const EFFECT_KEYS = [
  'money', 'hull', 'tide', 'item', 'gear', 'animal', 'lose', 'loyal', 'beds', 'berths',
  'stat', 'flag',
];

// The signature mechanic: what happens when animals meet.
//
// Pure declarative data — not one function lives inside a rule. `src/game/scoring.js`
// (runInteractions) walks INTERACTIONS in ARRAY ORDER for every animal being scored,
// so the order of this file is part of the design:
//
//   1  the immunity markers        (never applied, only looked up)
//   2  combos   scope 'shot'       — everything sunk together this shot
//   3  flocks   same-species stacking
//   4  sets     requireAll trios and pairs
//   5  buffs    the good neighbours
//   6  table / deck scope          — who is still on the felt, who is still in the hold
//   7  debuffs  the bad neighbours
//   8  eats     LAST, on purpose
//
// Why eats last: `onOther.consume` splices the victim out of the residents list for the
// rest of the shot. If the fox ate the rabbit before the Burrow set was counted, the
// player would be punished for owning a predator. Peaceful rules count the room first,
// then dinner is served.
//
// BALANCE (against the section-10 pipeline: exact pot = chips*3, mult+2)
//   eat     40..90 chips, occasionally +1 mult   — a meal is worth about one extra pot
//   buff    +1..+3 mult  or  +20..50 chips       — id-keyed buffs pay more than tag glue
//   debuff  -20..-60 chips  or  -1..-2 mult      — enough to make you re-aim, never fatal
//   flock   +1 mult or +15 chips per extra head, maxStacks 3..5
//   set     +3..+6 mult                          — the reason to hoard a habitat
//   combo   xmult 1.2..1.6                       — the reason to sink two at once
//
// Tag-keyed rules exist so that an animal bought in the dock five antes from now is
// already wired into the deck the player owns. Id-keyed rules exist so that specific
// pairs feel authored. Most animals sit in three to six rules.
//
// Ids and tags are the frozen roster + closed TAG VOCAB (DESIGN Appendix A / 9.2).

export const INTERACTIONS = [

  /* ==================================================================== 1
   * IMMUNITY MARKERS — engine-recognised, never applied as an effect.
   *
   * scoring.js does:   INTERACTIONS.some(r => r.id === `immune_${self.id}`)
   * and then:          if (rule.id.startsWith('immune_')) continue;
   *
   * So this row is a FLAG, not a rule: its presence makes the honey badger shrug off
   * every negative interaction gain in the game (chips < 0, mult < 0 or xmult < 1),
   * which is why it can safely sit in the middle of a pit of predators and still be
   * the best-mult common-habitat body in the roster. The gain below is deliberately
   * all zeroes — it is never applied. Do not rename this id.
   */
  {
    id: 'immune_honeybadger',
    name: 'Honey Badger Does Not Care',
    scope: 'habitat',
    self: { id: 'honeybadger' }, other: { any: true },
    perOther: false, maxStacks: 1,
    gain: { chips: 0, mult: 0, xmult: 1, money: 0 },
    kind: 'buff',
    flavor: 'Negative interactions simply bounce off.',
  },

  /* ==================================================================== 2
   * COMBOS — scope 'shot'. Sunk together in one stroke.
   * Almost all are perOther:false, because xmult compounds as pow(xmult, stacks)
   * and two stacks of 1.5 is already a 2.25x swing.
   */
  {
    id: 'combo_pack_hunt',
    name: 'Coordinated Kill',
    scope: 'shot',
    self: { tag: 'pack' }, other: { tag: 'pack' },
    perOther: false, maxStacks: 1,
    gain: { xmult: 1.35 },
    kind: 'combo',
    flavor: 'They planned this on the way down.',
  },
  {
    id: 'combo_chase',
    name: 'The Chase',
    scope: 'shot',
    self: { tag: 'predator' }, other: { tag: 'prey' },
    perOther: false, maxStacks: 1,
    gain: { xmult: 1.3 },
    kind: 'combo',
    flavor: 'One of them was running. It did not help.',
  },
  {
    id: 'combo_v_formation',
    name: 'V Formation',
    scope: 'shot',
    self: { tag: 'flying' }, other: { tag: 'flying' },
    perOther: true, maxStacks: 2,
    gain: { xmult: 1.2 },
    kind: 'combo',
    flavor: 'Somebody has to take the point.',
  },
  {
    id: 'combo_pod_surfaces',
    name: 'Pod Surfaces',
    scope: 'shot',
    self: { tag: 'aquatic' }, other: { tag: 'aquatic' },
    perOther: false, maxStacks: 1,
    gain: { xmult: 1.25 },
    kind: 'combo',
    flavor: 'Two blowholes, one breath.',
  },
  {
    id: 'combo_icebreaker',
    name: 'Icebreaker Convoy',
    scope: 'shot',
    self: { tag: 'polar' }, other: { tag: 'polar' },
    perOther: false, maxStacks: 1,
    gain: { xmult: 1.3 },
    kind: 'combo',
    flavor: 'Follow the wide one through the floes.',
  },
  {
    id: 'combo_hay_wagon',
    name: 'Hay Wagon',
    scope: 'shot',
    self: { tag: 'domestic' }, other: { tag: 'domestic' },
    perOther: false, maxStacks: 1,
    gain: { xmult: 1.25 },
    kind: 'combo',
    flavor: 'Loaded two at a time since the flood.',
  },
  {
    id: 'combo_coattails',
    name: 'Coattails',
    scope: 'shot',
    self: { tag: 'tiny' }, other: { tag: 'big' },
    perOther: false, maxStacks: 1,
    gain: { xmult: 1.5 },
    kind: 'combo',
    flavor: 'Rode the big one in and took the credit.',
  },
  {
    id: 'combo_committee',
    name: 'The Committee',
    scope: 'shot',
    self: { tag: 'smart' }, other: { tag: 'smart' },
    perOther: false, maxStacks: 1,
    gain: { xmult: 1.4 },
    kind: 'combo',
    flavor: 'They worked out the angle before you did.',
  },
  {
    id: 'combo_cats_cahoots',
    name: 'Cats in Cahoots',
    scope: 'shot',
    self: { tag: 'cat' }, other: { tag: 'cat' },
    perOther: false, maxStacks: 1,
    gain: { xmult: 1.45 },
    kind: 'combo',
    flavor: 'Neither will admit the other helped.',
  },
  {
    id: 'combo_stampede',
    name: 'Stampede',
    scope: 'shot',
    self: { tag: 'herd' }, other: { tag: 'herd' },
    perOther: true, maxStacks: 2,
    gain: { xmult: 1.2 },
    kind: 'combo',
    flavor: 'Nobody decided to run. Everybody ran.',
  },
  {
    id: 'combo_leftovers',
    name: 'First in Line',
    scope: 'shot',
    self: { tag: 'scavenger' }, other: { tag: 'predator' },
    perOther: false, maxStacks: 1,
    gain: { xmult: 1.4 },
    kind: 'combo',
    flavor: 'Waits politely. Eats enormously.',
  },
  {
    id: 'combo_royal_procession',
    name: 'Royal Procession',
    scope: 'shot',
    self: { tag: 'majestic' }, other: { tag: 'majestic' },
    perOther: false, maxStacks: 1,
    gain: { xmult: 1.3 },
    kind: 'combo',
    flavor: 'Neither yields the gate. Both go in.',
  },
  {
    id: 'combo_rare_cargo',
    name: 'Rare Cargo',
    scope: 'shot',
    self: { tag: 'exotic' }, other: { tag: 'exotic' },
    perOther: false, maxStacks: 1,
    gain: { xmult: 1.5 },
    kind: 'combo',
    flavor: 'The manifest gets a second gold star.',
  },
  {
    id: 'combo_rolling_fortress',
    name: 'Rolling Fortress',
    scope: 'shot',
    self: { tag: 'armored' }, other: { tag: 'armored' },
    perOther: false, maxStacks: 1,
    gain: { xmult: 1.3 },
    kind: 'combo',
    flavor: 'Two tanks and a felt full of dents.',
  },
  {
    id: 'combo_night_raid',
    name: 'Night Raid',
    scope: 'shot',
    self: { tag: 'nocturnal' }, other: { tag: 'nocturnal' },
    perOther: false, maxStacks: 1,
    gain: { xmult: 1.35 },
    kind: 'combo',
    flavor: 'Lights out. Everybody works.',
  },

  /* ==================================================================== 3
   * FLOCKS — same species stacking. self.id === other.id, perOther true.
   * The cap is the whole design: a fifth penguin is worth nothing, so the shop
   * tempts you with breadth instead of a tenth sheep.
   *
   * INTEGRATOR NOTE: see the header comment at the bottom of this file about
   * poolFor() and shared ANIMAL_BY_ID references.
   */
  {
    id: 'flock_flamingo',
    name: 'Pink Parade',
    scope: 'habitat',
    self: { id: 'flamingo' }, other: { id: 'flamingo' },
    perOther: true, maxStacks: 4,
    gain: { mult: 1 },
    kind: 'flock',
    flavor: 'One leg each, perfectly synchronised.',
  },
  {
    id: 'flock_penguin',
    name: 'Rookery',
    scope: 'habitat',
    self: { id: 'penguin' }, other: { id: 'penguin' },
    perOther: true, maxStacks: 5,
    gain: { chips: 15 },
    kind: 'flock',
    flavor: 'Nobody can tell whose egg is whose.',
  },
  {
    id: 'flock_meerkat',
    name: 'Sentry Ring',
    scope: 'habitat',
    self: { id: 'meerkat' }, other: { id: 'meerkat' },
    perOther: true, maxStacks: 4,
    gain: { mult: 1 },
    kind: 'flock',
    flavor: 'Every horizon has somebody on it.',
  },
  {
    id: 'flock_dolphin',
    name: 'Pod',
    scope: 'habitat',
    self: { id: 'dolphin' }, other: { id: 'dolphin' },
    perOther: true, maxStacks: 3,
    gain: { mult: 1 },
    kind: 'flock',
    flavor: 'Clicking about you behind your back.',
  },
  {
    id: 'flock_sheep',
    name: 'Woolgathering',
    scope: 'habitat',
    self: { id: 'sheep' }, other: { id: 'sheep' },
    perOther: true, maxStacks: 5,
    gain: { chips: 15 },
    kind: 'flock',
    flavor: 'A flock is just one sheep, repeated.',
  },
  {
    id: 'flock_zebra',
    name: 'Dazzle',
    scope: 'habitat',
    self: { id: 'zebra' }, other: { id: 'zebra' },
    perOther: true, maxStacks: 4,
    gain: { chips: 15 },
    kind: 'flock',
    flavor: 'Where does one stop and the next start?',
  },
  {
    id: 'flock_condor',
    name: 'Kettle of Condors',
    scope: 'habitat',
    self: { id: 'condor' }, other: { id: 'condor' },
    perOther: true, maxStacks: 3,
    gain: { mult: 1 },
    kind: 'flock',
    flavor: 'Circling something you cannot see.',
  },
  {
    id: 'flock_clownfish',
    name: 'Shoal',
    scope: 'habitat',
    self: { id: 'clownfish' }, other: { id: 'clownfish' },
    perOther: true, maxStacks: 5,
    gain: { chips: 15 },
    kind: 'flock',
    flavor: 'Safety in orange numbers.',
  },
  {
    id: 'flock_wolf',
    name: 'Pack Howl',
    scope: 'habitat',
    self: { id: 'wolf' }, other: { id: 'wolf' },
    perOther: true, maxStacks: 3,
    gain: { mult: 1 },
    kind: 'flock',
    flavor: 'The chorus carries for miles.',
  },
  {
    id: 'flock_chicken',
    name: 'The Brood',
    scope: 'habitat',
    self: { id: 'chicken' }, other: { id: 'chicken' },
    perOther: true, maxStacks: 5,
    gain: { chips: 15 },
    kind: 'flock',
    flavor: 'A committee that has never agreed once.',
  },
  {
    id: 'flock_marmot',
    name: 'Whistle Chain',
    scope: 'habitat',
    self: { id: 'marmot' }, other: { id: 'marmot' },
    perOther: true, maxStacks: 4,
    gain: { chips: 15 },
    kind: 'flock',
    flavor: 'The alarm crosses the scree in a second.',
  },
  {
    id: 'flock_penguin_hold',
    name: 'More Below Deck',
    scope: 'deck',
    self: { id: 'penguin' }, other: { id: 'penguin' },
    perOther: true, maxStacks: 4,
    gain: { chips: 15 },
    kind: 'flock',
    flavor: 'The hold is standing room only.',
  },

  /* ==================================================================== 4
   * SETS — requireAll. Ignore self/other entirely; every named member must be in the
   * pool (self counts), and only members score it. Habitat-scope sets accumulate over
   * a whole blind because the vitrine persists between shots, so a set is a PLAN.
   */
  {
    id: 'set_barnyard',
    name: 'Barnyard Trio',
    scope: 'habitat',
    requireAll: ['cow', 'pig', 'chicken'],
    gain: { mult: 4 },
    kind: 'set',
    flavor: 'Moo, oink, and an opinion.',
  },
  {
    id: 'set_big_five',
    name: 'The Big Five',
    scope: 'habitat',
    requireAll: ['lion', 'elephant', 'rhino', 'giraffe', 'zebra'],
    gain: { mult: 6 },
    kind: 'set',
    flavor: 'Every postcard on the ark, in one gate.',
  },
  {
    id: 'set_polar_trio',
    name: 'Polar Trio',
    scope: 'habitat',
    requireAll: ['polarbear', 'penguin', 'seal'],
    gain: { mult: 5 },
    kind: 'set',
    flavor: 'An unstable arrangement. Score it fast.',
  },
  {
    id: 'set_reef',
    name: 'The Reef',
    scope: 'habitat',
    requireAll: ['clownfish', 'octopus', 'seaturtle'],
    gain: { mult: 4 },
    kind: 'set',
    flavor: 'Everyone has a hole to be in.',
  },
  {
    id: 'set_pack',
    name: 'The Pack',
    scope: 'habitat',
    requireAll: ['wolf', 'fox', 'hyena'],
    gain: { mult: 5 },
    kind: 'set',
    flavor: 'Three grins and no plan for sharing.',
  },
  {
    id: 'set_nile_bank',
    name: 'The Nile Bank',
    scope: 'habitat',
    requireAll: ['crocodile', 'heron', 'flamingo'],
    gain: { mult: 4 },
    kind: 'set',
    flavor: 'Two birds standing very, very still.',
  },
  {
    id: 'set_summit',
    name: 'The Summit',
    scope: 'habitat',
    requireAll: ['eagle', 'snowleopard', 'yak'],
    gain: { mult: 5 },
    kind: 'set',
    flavor: 'Thin air, thick coats, no witnesses.',
  },
  {
    id: 'set_canopy',
    name: 'The Canopy',
    scope: 'habitat',
    requireAll: ['monkey', 'parrot', 'sloth'],
    gain: { mult: 4 },
    kind: 'set',
    flavor: 'Two of them are shouting. Guess which.',
  },
  {
    id: 'set_burrow',
    name: 'The Burrow',
    scope: 'habitat',
    requireAll: ['rabbit', 'badger', 'hedgehog'],
    gain: { mult: 4 },
    kind: 'set',
    flavor: 'Three tenants, one very long tunnel.',
  },
  {
    id: 'set_dust_devils',
    name: 'Dust Devils',
    scope: 'habitat',
    requireAll: ['scorpion', 'rattlesnake', 'roadrunner'],
    gain: { mult: 5 },
    kind: 'set',
    flavor: 'Everything here is pointed or venomous.',
  },
  {
    id: 'set_cryptid_ledger',
    name: 'The Cryptid Ledger',
    scope: 'habitat',
    requireAll: ['platypus', 'axolotl', 'chameleon'],
    gain: { mult: 6 },
    kind: 'set',
    flavor: 'The taxonomist has stopped taking calls.',
  },
  {
    id: 'set_deep_song',
    name: 'The Deep Song',
    scope: 'habitat',
    requireAll: ['whale', 'narwhal'],
    gain: { mult: 6 },
    kind: 'set',
    flavor: 'Two notes the whole ocean can hear.',
  },
  {
    id: 'set_savanna_sweep',
    name: 'Savanna Sweep',
    scope: 'shot',
    requireAll: ['zebra', 'ostrich', 'giraffe'],
    gain: { mult: 5 },
    kind: 'set',
    flavor: 'Stripes, legs and neck, all in one stroke.',
  },
  {
    id: 'set_two_bears',
    name: 'Two Bears, One Boat',
    scope: 'shot',
    requireAll: ['polarbear', 'brownbear'],
    gain: { mult: 4 },
    kind: 'set',
    flavor: 'They have agreed to ignore each other.',
  },
  {
    id: 'set_farmyard_dawn',
    name: 'Farmyard Dawn',
    scope: 'shot',
    requireAll: ['chicken', 'sheepdog'],
    gain: { mult: 3 },
    kind: 'set',
    flavor: 'The rooster is up. So is the dog.',
  },

  /* ==================================================================== 5
   * BUFFS — the good neighbours, scope 'habitat'.
   * Id-keyed buffs (a specific animal already in the gate) pay a mult; broad tag glue
   * pays small chips, so a wide deck always feels a little connected without the
   * numbers running away.
   */
  {
    id: 'buff_dragonfly_bloom',
    name: 'Wings Over the Meadow',
    scope: 'habitat',
    self: { id: 'dragonfly' }, other: { tag: 'herbivore' },
    perOther: true, maxStacks: 3,
    gain: { chips: 25 },
    onOther: { chips: 10, mult: 0 },
    kind: 'buff',
    flavor: 'Everything green does better for the visit.',
  },
  {
    id: 'buff_sheepdog_rally',
    name: 'Rally the Herd',
    scope: 'habitat',
    self: { id: 'sheepdog' }, other: { tag: 'herd' },
    perOther: true, maxStacks: 4,
    gain: { mult: 1 },
    kind: 'buff',
    flavor: 'One dog. Absolute authority.',
  },
  {
    id: 'buff_meerkat_sentry',
    name: 'Sentry on Duty',
    scope: 'habitat',
    self: { tag: 'small' }, other: { id: 'meerkat' },
    perOther: true, maxStacks: 2,
    gain: { chips: 20 },
    kind: 'buff',
    flavor: 'Somebody else is watching the sky for once.',
  },
  {
    id: 'buff_dolphin_escort',
    name: 'Escort to the Surface',
    scope: 'habitat',
    self: { tag: 'swimming' }, other: { id: 'dolphin' },
    perOther: true, maxStacks: 2,
    gain: { chips: 25 },
    kind: 'buff',
    flavor: 'Nudged upward by something kind.',
  },
  {
    id: 'buff_otter_play',
    name: 'Otterly Delighted',
    scope: 'habitat',
    self: { tag: 'cute' }, other: { id: 'otter' },
    perOther: true, maxStacks: 3,
    gain: { mult: 1 },
    kind: 'buff',
    flavor: 'Work stops. Play is mandatory.',
  },
  {
    id: 'buff_elephant_matriarch',
    name: 'The Matriarch Remembers',
    scope: 'habitat',
    self: { tag: 'herd' }, other: { id: 'elephant' },
    perOther: false, maxStacks: 1,
    gain: { mult: 2 },
    kind: 'buff',
    flavor: 'She knows the way to the water.',
  },
  {
    id: 'buff_honeybadger_fearless',
    name: 'Nothing Impresses Him',
    scope: 'habitat',
    self: { id: 'honeybadger' }, other: { tag: 'predator' },
    perOther: true, maxStacks: 3,
    gain: { chips: 30 },
    kind: 'buff',
    flavor: 'The more teeth in the gate, the better.',
  },
  {
    id: 'buff_redpanda_charm',
    name: 'Small Red Diplomat',
    scope: 'habitat',
    self: { any: true }, other: { id: 'redpanda' },
    perOther: true, maxStacks: 2,
    gain: { chips: 20 },
    kind: 'buff',
    flavor: 'Nobody argues in front of the red panda.',
  },
  {
    id: 'buff_peacock_display',
    name: 'Full Display',
    scope: 'habitat',
    self: { id: 'peacock' }, other: { tag: 'bird' },
    perOther: true, maxStacks: 4,
    gain: { mult: 1 },
    kind: 'buff',
    flavor: 'An audience of birds is the only audience.',
  },
  {
    id: 'buff_beaver_dam',
    name: 'The Dam Holds',
    scope: 'habitat',
    self: { tag: 'swimming' }, other: { id: 'beaver' },
    perOther: true, maxStacks: 3,
    gain: { chips: 25 },
    kind: 'buff',
    flavor: 'Still water, engineered on purpose.',
  },
  {
    id: 'buff_troop_bond',
    name: 'Troop Bond',
    scope: 'habitat',
    self: { tag: 'primate' }, other: { tag: 'primate' },
    perOther: true, maxStacks: 3,
    gain: { mult: 1 },
    kind: 'buff',
    flavor: 'Grooming is a form of accounting.',
  },
  {
    id: 'buff_silverback',
    name: "Silverback's Blessing",
    scope: 'habitat',
    self: { tag: 'social' }, other: { id: 'gorilla' },
    perOther: false, maxStacks: 1,
    gain: { mult: 1 },
    kind: 'buff',
    flavor: 'He nodded. That counts as a contract.',
  },
  {
    id: 'buff_night_shift',
    name: 'Night Shift',
    scope: 'habitat',
    self: { tag: 'nocturnal' }, other: { tag: 'nocturnal' },
    perOther: true, maxStacks: 3,
    gain: { chips: 18 },
    kind: 'buff',
    flavor: 'The whole gate keeps the same odd hours.',
  },
  {
    id: 'buff_parrot_interpreter',
    name: 'Polly Speaks For You',
    scope: 'habitat',
    self: { tag: 'exotic' }, other: { id: 'parrot' },
    perOther: true, maxStacks: 2,
    gain: { mult: 1 },
    kind: 'buff',
    flavor: 'Finally, somebody who can translate.',
  },
  {
    id: 'buff_draught_power',
    name: 'Draught Power',
    scope: 'habitat',
    self: { tag: 'domestic' }, other: { id: 'horse' },
    perOther: true, maxStacks: 3,
    gain: { chips: 25 },
    kind: 'buff',
    flavor: 'Whatever needs pulling, he pulls.',
  },
  {
    id: 'buff_whale_song',
    name: 'Whalesong Carries',
    scope: 'habitat',
    self: { tag: 'aquatic' }, other: { id: 'whale' },
    perOther: false, maxStacks: 1,
    gain: { mult: 2 },
    kind: 'buff',
    flavor: 'You feel it in your ribs before your ears.',
  },
  {
    id: 'buff_narwhal_omen',
    name: 'The Sea Unicorn',
    scope: 'habitat',
    self: { tag: 'polar' }, other: { id: 'narwhal' },
    perOther: false, maxStacks: 1,
    gain: { mult: 2 },
    kind: 'buff',
    flavor: 'Good luck, and a hole in the ice.',
  },
  {
    id: 'buff_sloth_calm',
    name: 'No Rush At All',
    scope: 'habitat',
    self: { tag: 'slow' }, other: { id: 'sloth' },
    perOther: true, maxStacks: 2,
    gain: { chips: 20 },
    kind: 'buff',
    flavor: 'Being late together is barely being late.',
  },
  {
    id: 'buff_plate_formation',
    name: 'Plate Formation',
    scope: 'habitat',
    self: { tag: 'armored' }, other: { tag: 'armored' },
    perOther: true, maxStacks: 3,
    gain: { chips: 18 },
    kind: 'buff',
    flavor: 'Shell to shell, nothing gets in.',
  },
  {
    id: 'buff_evening_chorus',
    name: 'Evening Chorus',
    scope: 'habitat',
    self: { tag: 'amphibian' }, other: { tag: 'tropical' },
    perOther: true, maxStacks: 3,
    gain: { chips: 20 },
    kind: 'buff',
    flavor: 'Everybody sings. Nobody harmonises.',
  },
  {
    id: 'buff_familiar_faces',
    name: 'Familiar Faces',
    scope: 'habitat',
    self: { tag: 'social' }, other: { tag: 'social' },
    perOther: true, maxStacks: 3,
    gain: { chips: 10 },
    kind: 'buff',
    flavor: 'Not friends exactly. Not strangers either.',
  },
  {
    id: 'buff_arctic_huddle',
    name: 'Huddle for Warmth',
    scope: 'habitat',
    self: { home: 'arctic' }, other: { home: 'arctic' },
    perOther: true, maxStacks: 4,
    gain: { chips: 15 },
    kind: 'buff',
    flavor: 'Rotate. The outside shift is brutal.',
  },
  {
    id: 'buff_canopy_shade',
    name: 'Canopy Shade',
    scope: 'habitat',
    self: { home: 'jungle' }, other: { home: 'jungle' },
    perOther: true, maxStacks: 4,
    gain: { chips: 12 },
    kind: 'buff',
    flavor: 'Green light, wet air, home.',
  },
  {
    id: 'buff_water_carrier',
    name: 'The Water Carrier',
    scope: 'habitat',
    self: { tag: 'herd' }, other: { id: 'camel' },
    perOther: true, maxStacks: 2,
    gain: { chips: 20 },
    kind: 'buff',
    flavor: 'He brought enough. He always brings enough.',
  },
  {
    id: 'buff_sanitation_crew',
    name: 'The Sanitation Crew',
    scope: 'habitat',
    self: { any: true }, other: { id: 'crab' },
    perOther: true, maxStacks: 2,
    gain: { chips: 15 },
    kind: 'buff',
    flavor: 'Spotless gate. Nobody asks how.',
  },
  {
    id: 'buff_windbreak',
    name: 'Windbreak',
    scope: 'habitat',
    self: { tag: 'small' }, other: { id: 'yak' },
    perOther: true, maxStacks: 2,
    gain: { chips: 22 },
    kind: 'buff',
    flavor: 'Stand behind the yak. That is the whole trick.',
  },
  {
    id: 'buff_pangolin_lesson',
    name: 'Roll Up Like This',
    scope: 'habitat',
    self: { tag: 'digging' }, other: { id: 'pangolin' },
    perOther: true, maxStacks: 2,
    gain: { chips: 20 },
    kind: 'buff',
    flavor: 'A masterclass in becoming a pinecone.',
  },
  {
    id: 'buff_hedgehog_bristle',
    name: 'Bristle Up',
    scope: 'habitat',
    self: { tag: 'prey' }, other: { id: 'hedgehog' },
    perOther: true, maxStacks: 2,
    gain: { chips: 15 },
    kind: 'buff',
    flavor: 'Courage, delivered in spine form.',
  },
  {
    id: 'buff_seaturtle_ancient',
    name: 'The Ancient Mariner',
    scope: 'habitat',
    self: { tag: 'aquatic' }, other: { id: 'seaturtle' },
    perOther: false, maxStacks: 1,
    gain: { mult: 1 },
    kind: 'buff',
    flavor: 'It has seen every current. Twice.',
  },
  {
    id: 'buff_eagle_updraft',
    name: 'Found the Updraft',
    scope: 'habitat',
    self: { tag: 'flying' }, other: { id: 'eagle' },
    perOther: false, maxStacks: 1,
    gain: { mult: 1 },
    kind: 'buff',
    flavor: 'Follow the professional. Save your wings.',
  },
  {
    id: 'buff_platypus_curio',
    name: 'Impossible Animal',
    scope: 'habitat',
    self: { tag: 'weird' }, other: { id: 'platypus' },
    perOther: true, maxStacks: 2,
    gain: { chips: 25 },
    kind: 'buff',
    flavor: 'It out-weirds you and you respect that.',
  },

  /* ==================================================================== 6
   * TABLE and DECK scope.
   * 'table' = animals still loose on the felt: a predator out there is a threat, a
   * guard dog out there is comfort. This is what makes shot ORDER matter — clear the
   * wolf first and the whole flock scores clean.
   * 'deck' = the caravan still in the hold: knowing your own kind is aboard.
   */
  {
    id: 'table_dog_is_watching',
    name: 'The Dog Is Watching',
    scope: 'table',
    self: { tag: 'herd' }, other: { id: 'sheepdog' },
    perOther: false, maxStacks: 1,
    gain: { chips: 30 },
    kind: 'buff',
    flavor: 'Nothing crosses the felt while he is up.',
  },
  {
    id: 'table_lookout',
    name: 'Someone Has the Sky',
    scope: 'table',
    self: { tag: 'prey' }, other: { id: 'meerkat' },
    perOther: false, maxStacks: 1,
    gain: { chips: 20 },
    kind: 'buff',
    flavor: 'The little periscope is still up.',
  },
  {
    id: 'table_eyes_in_treeline',
    name: 'Eyes in the Treeline',
    scope: 'table',
    self: { tag: 'prey' }, other: { id: 'wolf' },
    perOther: false, maxStacks: 1,
    gain: { chips: -30 },
    kind: 'debuff',
    flavor: 'Still out there. Still hungry.',
  },
  {
    id: 'table_grey_ghost',
    name: 'The Grey Ghost',
    scope: 'table',
    self: { tag: 'prey' }, other: { id: 'snowleopard' },
    perOther: false, maxStacks: 1,
    gain: { chips: -35 },
    kind: 'debuff',
    flavor: 'You never see it. That is the point.',
  },
  {
    id: 'table_still_stalked',
    name: 'Still Being Stalked',
    scope: 'table',
    self: { tag: 'prey' }, other: { tag: 'predator' },
    perOther: true, maxStacks: 3,
    gain: { chips: -12 },
    kind: 'debuff',
    flavor: 'Hard to pose for the scorer like this.',
  },
  {
    id: 'table_shadow_overhead',
    name: 'Shadow Overhead',
    scope: 'table',
    self: { tag: 'small' }, other: { tag: 'flying' },
    perOther: true, maxStacks: 2,
    gain: { chips: -14 },
    kind: 'debuff',
    flavor: 'Something crossed the sun. Twice.',
  },
  {
    id: 'table_shark_circling',
    name: 'Still Circling',
    scope: 'table',
    self: { tag: 'swimming' }, other: { id: 'shark' },
    perOther: false, maxStacks: 1,
    gain: { chips: -28 },
    kind: 'debuff',
    flavor: 'Nobody wants to be last in the water.',
  },
  {
    id: 'deck_kin_aboard',
    name: 'Kin Still Aboard',
    scope: 'deck',
    self: { tag: 'social' }, other: { tag: 'social' },
    perOther: true, maxStacks: 3,
    gain: { chips: 10 },
    kind: 'buff',
    flavor: 'You can hear them through the hull.',
  },
  {
    id: 'deck_manifest_promises',
    name: 'The Manifest Promises More',
    scope: 'deck',
    self: { tag: 'exotic' }, other: { tag: 'exotic' },
    perOther: true, maxStacks: 2,
    gain: { chips: 25 },
    kind: 'buff',
    flavor: 'Two crates down, one strange friend to go.',
  },
  {
    id: 'deck_room_below',
    name: 'Room Enough Below',
    scope: 'deck',
    self: { tag: 'solitary' }, other: { tag: 'solitary' },
    perOther: true, maxStacks: 3,
    gain: { chips: 12 },
    kind: 'buff',
    flavor: 'Separate stalls. Everyone is content.',
  },
  {
    id: 'deck_song_across_water',
    name: 'Song Across the Water',
    scope: 'deck',
    self: { id: 'narwhal' }, other: { id: 'whale' },
    perOther: false, maxStacks: 1,
    gain: { mult: 2 },
    kind: 'buff',
    flavor: 'Its mate answers from the hold.',
  },
  {
    id: 'deck_no_room_to_turn',
    name: 'No Room to Turn Around',
    scope: 'deck',
    self: { tag: 'big' }, other: { tag: 'big' },
    perOther: true, maxStacks: 3,
    gain: { chips: -15 },
    kind: 'debuff',
    flavor: 'The hold was not designed for this.',
  },

  /* ==================================================================== 7
   * DEBUFFS — the bad neighbours, scope 'habitat'.
   * These are the reason you think before every shot. None of them can take a pot
   * below zero (scoring clamps chips at 0 and mult at 0.1) but any two of them
   * together will cost you the blind.
   */
  {
    id: 'debuff_wrong_pole',
    name: 'Wrong Bear, Wrong Pole',
    scope: 'habitat',
    self: { id: 'penguin' }, other: { id: 'polarbear' },
    perOther: false, maxStacks: 1,
    gain: { chips: -45 },
    kind: 'debuff',
    flavor: 'Geography was the only thing protecting it.',
  },
  {
    id: 'debuff_sheep_nerves',
    name: 'Nerves',
    scope: 'habitat',
    self: { id: 'sheep' }, other: { id: 'wolf' },
    perOther: false, maxStacks: 1,
    gain: { mult: -1 },
    kind: 'debuff',
    flavor: 'It has forgotten how to be a sheep.',
  },
  {
    id: 'debuff_mouse',
    name: 'MOUSE!',
    scope: 'habitat',
    self: { id: 'elephant' }, other: { tag: 'rodent' },
    perOther: true, maxStacks: 2,
    gain: { chips: -40 },
    kind: 'debuff',
    flavor: 'Six tonnes of dignity, gone in a second.',
  },
  {
    id: 'debuff_blood_in_water',
    name: 'Blood in the Water',
    scope: 'habitat',
    self: { tag: 'prey' }, other: { id: 'shark' },
    perOther: false, maxStacks: 1,
    gain: { chips: -35 },
    kind: 'debuff',
    flavor: 'The gate has gone very quiet.',
  },
  {
    id: 'debuff_sting_season',
    name: 'Sting Season',
    scope: 'habitat',
    self: { tag: 'swimming' }, other: { id: 'jellyfish' },
    perOther: true, maxStacks: 2,
    gain: { chips: -25 },
    kind: 'debuff',
    flavor: 'Beautiful. Do not touch. Touched it.',
  },
  {
    id: 'debuff_rototiller',
    name: 'Rototiller of Doom',
    scope: 'habitat',
    self: { tag: 'domestic' }, other: { id: 'boar' },
    perOther: true, maxStacks: 2,
    gain: { chips: -30 },
    kind: 'debuff',
    flavor: 'The vegetable patch is a memory.',
  },
  {
    id: 'debuff_who_said_that',
    name: 'Who Said That?',
    scope: 'habitat',
    self: { any: true }, other: { id: 'chameleon' },
    perOther: false, maxStacks: 1,
    gain: { mult: -1 },
    kind: 'debuff',
    flavor: 'There is definitely somebody else in here.',
  },
  {
    id: 'debuff_check_your_boots',
    name: 'Check Your Boots',
    scope: 'habitat',
    self: { tag: 'small' }, other: { id: 'scorpion' },
    perOther: true, maxStacks: 2,
    gain: { chips: -25 },
    kind: 'debuff',
    flavor: 'It was in there. Of course it was in there.',
  },
  {
    id: 'debuff_that_sound',
    name: 'That Sound',
    scope: 'habitat',
    self: { tag: 'prey' }, other: { id: 'rattlesnake' },
    perOther: false, maxStacks: 1,
    gain: { mult: -1 },
    kind: 'debuff',
    flavor: 'Nobody has to be taught what it means.',
  },
  {
    id: 'debuff_cackling',
    name: 'Cackling in the Dark',
    scope: 'habitat',
    self: { tag: 'predator' }, other: { id: 'hyena' },
    perOther: true, maxStacks: 2,
    gain: { chips: -30 },
    kind: 'debuff',
    flavor: 'You cannot eat and be laughed at.',
  },
  {
    id: 'debuff_territory',
    name: 'Territory Dispute',
    scope: 'habitat',
    self: { tag: 'solitary' }, other: { tag: 'solitary' },
    perOther: true, maxStacks: 3,
    gain: { chips: -20 },
    kind: 'debuff',
    flavor: 'This gate was big enough for exactly one.',
  },
  {
    id: 'debuff_venom_in_straw',
    name: 'Venom in the Straw',
    scope: 'habitat',
    self: { tag: 'prey' }, other: { tag: 'venomous' },
    perOther: true, maxStacks: 2,
    gain: { chips: -18 },
    kind: 'debuff',
    flavor: 'Nobody is lying down tonight.',
  },
  {
    id: 'debuff_logs_that_blink',
    name: 'Logs That Blink',
    scope: 'habitat',
    self: { tag: 'swimming' }, other: { id: 'crocodile' },
    perOther: false, maxStacks: 1,
    gain: { chips: -40 },
    kind: 'debuff',
    flavor: 'Count the logs. Count them again.',
  },
  {
    id: 'debuff_underfoot',
    name: 'Underfoot',
    scope: 'habitat',
    self: { tag: 'tiny' }, other: { tag: 'big' },
    perOther: true, maxStacks: 3,
    gain: { chips: -20 },
    kind: 'debuff',
    flavor: 'Nobody meant it. It happened anyway.',
  },
  {
    id: 'debuff_ink_everywhere',
    name: 'Ink Everywhere',
    scope: 'habitat',
    self: { any: true }, other: { id: 'octopus' },
    perOther: false, maxStacks: 1,
    gain: { chips: -20 },
    kind: 'debuff',
    flavor: 'The scorer cannot read the gate.',
  },
  {
    id: 'debuff_farm_meets_feral',
    name: 'Farm Meets Feral',
    scope: 'habitat',
    self: { tag: 'domestic' }, other: { tag: 'wild' },
    perOther: true, maxStacks: 3,
    gain: { chips: -15 },
    kind: 'debuff',
    flavor: 'One of them has never seen a fence.',
  },
  {
    id: 'debuff_not_a_drop',
    name: 'Not a Drop',
    scope: 'habitat',
    self: { home: 'wetland' }, other: { home: 'desert' },
    perOther: true, maxStacks: 2,
    gain: { chips: -25 },
    kind: 'debuff',
    flavor: 'Wetland animal. Desert company. Drying out.',
  },
  {
    id: 'debuff_owl_at_noon',
    name: 'Owl at Noon',
    scope: 'habitat',
    self: { tag: 'nocturnal' }, other: { tag: 'majestic' },
    perOther: false, maxStacks: 1,
    gain: { chips: -20 },
    kind: 'debuff',
    flavor: 'Mobbed by something with better hours.',
  },
  {
    id: 'debuff_walrus_crowding',
    name: 'Haul-Out Crush',
    scope: 'habitat',
    self: { tag: 'small' }, other: { id: 'walrus' },
    perOther: true, maxStacks: 2,
    gain: { chips: -22 },
    kind: 'debuff',
    flavor: 'A tonne of neighbour just rolled over.',
  },
  {
    id: 'debuff_goat_eats_manifest',
    name: 'The Goat Ate the Manifest',
    scope: 'habitat',
    self: { any: true }, other: { id: 'goat' },
    perOther: false, maxStacks: 1,
    gain: { chips: -18 },
    kind: 'debuff',
    flavor: 'Chewing. Unrepentant. Chewing.',
  },

  /* ==================================================================== 8
   * EATS — LAST in the file so nothing peaceful gets eaten before it is counted.
   * onOther.consume removes the victim from the gate for good (run.js drops it from
   * the vitrine), so every meal is a trade: chips now, one fewer set member forever.
   * Specific pairs first; the generic hunt is the very last rule in the game.
   */
  {
    id: 'eat_fox_rabbit',
    name: 'Supper in the Ferns',
    scope: 'habitat',
    self: { id: 'fox' }, other: { id: 'rabbit' },
    perOther: true, maxStacks: 2,
    gain: { chips: 55 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'The fox eats well tonight.',
  },
  {
    id: 'eat_wolf_sheep',
    name: 'Mutton by Moonlight',
    scope: 'habitat',
    self: { id: 'wolf' }, other: { id: 'sheep' },
    perOther: true, maxStacks: 2,
    gain: { chips: 65, mult: 1 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'It was always going to end like this.',
  },
  {
    id: 'eat_shark_clownfish',
    name: 'One Gulp',
    scope: 'habitat',
    self: { id: 'shark' }, other: { id: 'clownfish' },
    perOther: true, maxStacks: 3,
    gain: { chips: 45 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'Barely worth the swim over.',
  },
  {
    id: 'eat_crocodile_duck',
    name: 'The Log Blinked',
    scope: 'habitat',
    self: { id: 'crocodile' }, other: { id: 'duck' },
    perOther: true, maxStacks: 2,
    gain: { chips: 70 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'One quack, cut short.',
  },
  {
    id: 'eat_owl_squirrel',
    name: 'Silent Wings',
    scope: 'habitat',
    self: { id: 'owl' }, other: { id: 'squirrel' },
    perOther: true, maxStacks: 2,
    gain: { chips: 50 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'It never heard a thing.',
  },
  {
    id: 'eat_snowyowl_marmot',
    name: 'Snow Angel, Briefly',
    scope: 'habitat',
    self: { id: 'snowyowl' }, other: { id: 'marmot' },
    perOther: true, maxStacks: 2,
    gain: { chips: 55 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'The whistle chain started one whistle late.',
  },
  {
    id: 'eat_polarbear_seal',
    name: 'The Long Wait Pays',
    scope: 'habitat',
    self: { id: 'polarbear' }, other: { id: 'seal' },
    perOther: true, maxStacks: 2,
    gain: { chips: 85 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'Six hours at a breathing hole. Worth it.',
  },
  {
    id: 'eat_heron_axolotl',
    name: 'Spear Fishing',
    scope: 'habitat',
    self: { id: 'heron' }, other: { id: 'axolotl' },
    perOther: true, maxStacks: 2,
    gain: { chips: 45 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'Stood still for an hour to earn that.',
  },
  {
    id: 'eat_tiger_tapir',
    name: 'Ambush at the Waterhole',
    scope: 'habitat',
    self: { id: 'tiger' }, other: { id: 'tapir' },
    perOther: true, maxStacks: 2,
    gain: { chips: 80 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'The stripes were the last thing it read.',
  },
  {
    id: 'eat_jaguar_monkey',
    name: 'Down From the Canopy',
    scope: 'habitat',
    self: { id: 'jaguar' }, other: { id: 'monkey' },
    perOther: true, maxStacks: 2,
    gain: { chips: 70 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'Cats climb too. Nobody tells them that.',
  },
  {
    id: 'eat_lion_zebra',
    name: 'The Pride Dines',
    scope: 'habitat',
    self: { id: 'lion' }, other: { id: 'zebra' },
    perOther: true, maxStacks: 2,
    gain: { chips: 80 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'The dazzle was one zebra too small.',
  },
  {
    id: 'eat_eagle_rodent',
    name: 'Talon Drop',
    scope: 'habitat',
    self: { id: 'eagle' }, other: { tag: 'rodent' },
    perOther: true, maxStacks: 2,
    gain: { chips: 55 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'Straight down, no negotiation.',
  },
  {
    id: 'eat_rattlesnake_rodent',
    name: 'Warm-Blooded Snack',
    scope: 'habitat',
    self: { id: 'rattlesnake' }, other: { tag: 'rodent' },
    perOther: true, maxStacks: 2,
    gain: { chips: 50 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'It saw the heat before it saw the animal.',
  },
  {
    id: 'eat_fennecfox_scorpion',
    name: 'Crunchy',
    scope: 'habitat',
    self: { id: 'fennecfox' }, other: { id: 'scorpion' },
    perOther: true, maxStacks: 2,
    gain: { chips: 45 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'Bites the sting off first. Every time.',
  },
  {
    id: 'eat_brownbear_fish',
    name: 'Salmon Run',
    scope: 'habitat',
    self: { id: 'brownbear' }, other: { tag: 'fish' },
    perOther: true, maxStacks: 2,
    gain: { chips: 60 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'Stands in the river. Waits. Wins.',
  },
  {
    id: 'eat_octopus_crab',
    name: 'Eight Arms, One Crab',
    scope: 'habitat',
    self: { id: 'octopus' }, other: { id: 'crab' },
    perOther: true, maxStacks: 2,
    gain: { chips: 50 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'Armour is a suggestion, not a rule.',
  },
  {
    id: 'eat_arcticfox_chicken',
    name: 'Henhouse Raid',
    scope: 'habitat',
    self: { id: 'arcticfox' }, other: { id: 'chicken' },
    perOther: true, maxStacks: 3,
    gain: { chips: 40 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'White fur, guilty face, feathers everywhere.',
  },
  {
    id: 'eat_generic_hunt',
    name: 'Nature Takes Its Course',
    scope: 'habitat',
    self: { tag: 'predator' }, other: { tag: 'prey' },
    perOther: false, maxStacks: 1,
    gain: { chips: 40 },
    onOther: { consume: true, chips: 0, mult: 0 },
    kind: 'eat',
    flavor: 'Somebody in this gate was food.',
  },
];

/* --------------------------------------------------------------- lookups */

export const INTERACTIONS_BY_ID = Object.freeze(
  INTERACTIONS.reduce((acc, r) => { acc[r.id] = r; return acc; }, {}),
);

/**
 * Cheap prefilter: every rule that COULD fire for this animal, by `self` alone.
 * Set bonuses have no `self`, so they match on membership in `requireAll` — which is
 * exactly how scoring.js decides who is allowed to score a set. Marker rules
 * (immune_*) are included, because the vitrine tooltip wants to show the badge.
 *
 * Accepts an animal object or a bare id.
 */
export function interactionsFor(animal) {
  if (!animal) return [];
  const id = typeof animal === 'string' ? animal : animal.id;
  const tags = (typeof animal === 'string' ? null : animal.tags) || [];
  const home = typeof animal === 'string' ? null : animal.home;

  return INTERACTIONS.filter((r) => {
    if (r.requireAll && r.requireAll.length) return r.requireAll.includes(id);
    const s = r.self;
    if (!s) return false;
    if (s.any) return true;
    if (s.id) return s.id === id;
    if (s.tag) return tags.includes(s.tag);
    if (s.home) return s.home === home;
    if (s.rarity) return false;   // no rarity-keyed rules ship today
    return false;
  });
}

/* Frozen so a relic hook or a scene can never rewrite the rulebook mid-run. */
for (const r of INTERACTIONS) {
  if (r.gain) Object.freeze(r.gain);
  if (r.onOther) Object.freeze(r.onOther);
  if (r.self) Object.freeze(r.self);
  if (r.other) Object.freeze(r.other);
  if (r.requireAll) Object.freeze(r.requireAll);
  Object.freeze(r);
}
Object.freeze(INTERACTIONS);

/* ---------------------------------------------------------------------------
 * INTEGRATOR NOTE — poolFor() and shared animal objects
 *
 * scoring.js builds its candidate pools with `.filter(a => a !== selfRef)`, and
 * scenes/table.js maps ids through ANIMAL_BY_ID, so two sheep in one gate are the
 * SAME frozen object. The identity filter therefore removes *every* copy of the
 * animal being scored, which means any rule whose `self.id === other.id` — i.e. all
 * twelve `flock` rules — can never see its own kind.
 *
 * The data here is written to the 9.4 contract (same-species stacking, perOther true)
 * and will light up the moment poolFor drops ONE occurrence instead of all of them:
 *
 *   const drop1 = (list, ref) => {
 *     const ix = list.indexOf(ref);
 *     return ix < 0 ? list.slice() : list.slice(0, ix).concat(list.slice(ix + 1));
 *   };
 *
 * Nothing else in this file depends on that change.
 * ------------------------------------------------------------------------- */

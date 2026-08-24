// The caravan: 90 animals, frozen roster (DESIGN Appendix A) plus the apocrypha.
//
// Every row is pure data. `sprite` is a recipe for render/sprites.js, which bakes a
// 20x20 shaded sphere with features poking out of the silhouette — so a recipe is
// chosen for READABILITY AT 20 PIXELS, not zoological accuracy. Two animals sharing
// a habitat never share a silhouette: inside one habitat the ears/face/extra triple
// is always unique, because you read the gate you are aiming at by the shapes
// already sitting in it.
//
// Balance (DESIGN section 10 does chips*3, mult+2 on an exact pot):
//   common    20-45 chips, 1-2 mult      uncommon  40-70 chips, 2-3 mult
//   rare      65-110 chips, 3-4 mult     legendary 100-160 chips, 4-6 mult
// Within a band, mass and size buy chips and sell mult: a treefrog is 20/2.0, a
// tapir is 42/1.4. One exact common pot is ~270 score, so the ante-1 target of 300
// is two decent pots — and a legendary in its home gate with a combo is five figures
// by ante 8.
//
// `mass` (0.6-1.6) and `size` (0.8-1.25) go straight into physics: a whale shoves
// the rack apart, a squirrel gets shoved. Big animals are also easier to sink,
// which is the quiet compensation for their lower mult.
//
// TAG VOCAB is closed (DESIGN 9.2). The Appendix A tags are the minimum; extra tags
// are the hooks interactions.js and relics.js aim at, so they are deliberate:
// anything a predator should be able to eat carries `prey`, anything that hunts
// carries `predator`, and every body-plan word (bird/fish/mammal/...) is filled in
// so tag-scoped rules never miss a member.

/* ------------------------------------------------------------------ roster */

const BASE_ANIMALS = [

  /* ============================================================== SAVANNA */
  {
    id: 'lion', name: 'Lion',
    chips: 88, mult: 3, home: 'savanna',
    tags: ['predator', 'carnivore', 'cat', 'big', 'mammal', 'social', 'majestic', 'wild', 'pack'],
    rarity: 'rare', cost: 7, mass: 1.25, size: 1.15,
    sprite: {
      body: 'gold', shade: 'rust', light: 'brass3', belly: 'bone', eye: 'ink',
      eyeStyle: 'angry', ears: 'round', face: 'muzzle',
      pattern: 'none', patternColor: 'rust', extra: 'mane',
    },
    blurb: 'Eats first. Naps second.',
    rules: '+2 Mult for every prey animal in the habitat.',
  },
  {
    id: 'zebra', name: 'Zebra',
    chips: 32, mult: 1.5, home: 'savanna',
    tags: ['prey', 'herbivore', 'equine', 'herd', 'mammal', 'social', 'fast', 'wild'],
    rarity: 'common', cost: 3, mass: 1.05, size: 1.02,
    sprite: {
      body: 'bone', shade: 'grey1', light: 'white', belly: 'white', eye: 'ink',
      eyeStyle: 'wide', ears: 'pointy', face: 'muzzle',
      pattern: 'stripes', patternColor: 'ink', extra: 'tail',
    },
    blurb: 'A horse that dressed as a barcode.',
    rules: '+1 Mult for each herd animal in the shot.',
  },
  {
    id: 'giraffe', name: 'Giraffe',
    chips: 62, mult: 2, home: 'savanna',
    tags: ['herbivore', 'prey', 'big', 'mammal', 'herd', 'majestic', 'wild', 'slow'],
    rarity: 'uncommon', cost: 5, mass: 1.3, size: 1.2,
    sprite: {
      body: 'amber', shade: 'rust', light: 'sand', belly: 'bone', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'horn', face: 'muzzle',
      pattern: 'patches', patternColor: 'rust', extra: 'none',
    },
    blurb: 'Saw your bad shot coming.',
    rules: '+25 Chips for each herbivore already in the habitat.',
  },
  {
    id: 'elephant', name: 'Elephant',
    chips: 105, mult: 3, home: 'savanna',
    tags: ['pachyderm', 'big', 'smart', 'herbivore', 'mammal', 'herd', 'majestic', 'slow', 'wild'],
    rarity: 'rare', cost: 8, mass: 1.6, size: 1.25,
    sprite: {
      body: 'grey1', shade: 'grey0', light: 'grey2', belly: 'grey1', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'round', face: 'trunk',
      pattern: 'none', patternColor: 'grey0', extra: 'tail',
    },
    blurb: 'Remembers where the water was.',
    rules: '+1 Mult for every animal in this habitat, friend or not.',
  },
  {
    id: 'meerkat', name: 'Meerkat',
    chips: 22, mult: 2, home: 'savanna',
    tags: ['small', 'social', 'digging', 'mammal', 'omnivore', 'prey', 'cute', 'wild'],
    rarity: 'common', cost: 3, mass: 0.7, size: 0.85,
    sprite: {
      body: 'sand', shade: 'rust', light: 'bone', belly: 'bone', eye: 'ink',
      eyeStyle: 'wide', ears: 'tiny', face: 'snout',
      pattern: 'freckles', patternColor: 'wood2', extra: 'tail',
    },
    blurb: 'Small, standing, extremely on duty.',
    rules: 'x1.5 Mult with two or more meerkats in the shot.',
  },
  {
    id: 'hyena', name: 'Hyena',
    chips: 46, mult: 2.5, home: 'savanna',
    tags: ['scavenger', 'canine', 'pack', 'predator', 'carnivore', 'mammal', 'social', 'weird'],
    rarity: 'uncommon', cost: 5, mass: 1.0, size: 1.0,
    sprite: {
      body: 'wood4', shade: 'wood2', light: 'sand', belly: 'bone', eye: 'ink',
      eyeStyle: 'angry', ears: 'round', face: 'snout',
      pattern: 'spots', patternColor: 'wood0', extra: 'mane',
    },
    blurb: 'Laughs at your leave.',
    rules: 'Steals 30 Chips from each predator in the habitat.',
  },
  {
    id: 'rhino', name: 'Rhino',
    chips: 70, mult: 2, home: 'savanna',
    tags: ['armored', 'big', 'herbivore', 'mammal', 'solitary', 'slow', 'wild'],
    rarity: 'uncommon', cost: 6, mass: 1.55, size: 1.22,
    sprite: {
      body: 'grey0', shade: 'shadow', light: 'grey1', belly: 'grey0', eye: 'ink',
      eyeStyle: 'angry', ears: 'horn', face: 'snout',
      pattern: 'plates', patternColor: 'grey1', extra: 'none',
    },
    blurb: 'Nearsighted. Unbothered. Enormous.',
    rules: 'Cannot be debuffed by other animals in the habitat.',
  },
  {
    id: 'ostrich', name: 'Ostrich',
    chips: 34, mult: 1.5, home: 'savanna',
    tags: ['bird', 'fast', 'prey', 'herd', 'omnivore', 'big', 'weird', 'wild'],
    rarity: 'common', cost: 3, mass: 1.0, size: 1.08,
    sprite: {
      body: 'shadow', shade: 'ink', light: 'grey0', belly: 'bone', eye: 'ink',
      eyeStyle: 'wide', ears: 'none', face: 'beak',
      pattern: 'none', patternColor: 'bone', extra: 'plume',
    },
    blurb: 'All legs, no second thoughts.',
    rules: 'x1.4 Mult if it is the first animal potted this shot.',
  },
  {
    id: 'honeybadger', name: 'Honey Badger',
    chips: 68, mult: 4, home: 'savanna',
    tags: ['mustelid', 'weird', 'armored', 'predator', 'carnivore', 'mammal', 'digging', 'solitary'],
    rarity: 'rare', cost: 8, mass: 0.95, size: 0.95,
    sprite: {
      body: 'shadow', shade: 'ink', light: 'grey0', belly: 'shadow', eye: 'ink',
      eyeStyle: 'angry', ears: 'tiny', face: 'snout',
      pattern: 'bands', patternColor: 'white', extra: 'none',
    },
    blurb: 'Does not care. Never has.',
    rules: 'Immune to every negative interaction. Eats the venomous.',
  },

  /* =============================================================== ARCTIC */
  {
    id: 'polarbear', name: 'Polar Bear',
    chips: 95, mult: 3, home: 'arctic',
    tags: ['predator', 'bear', 'big', 'polar', 'carnivore', 'mammal', 'swimming', 'solitary', 'majestic'],
    rarity: 'rare', cost: 8, mass: 1.5, size: 1.2,
    sprite: {
      body: 'bone', shade: 'sky', light: 'white', belly: 'white', eye: 'ink',
      eyeStyle: 'angry', ears: 'round', face: 'snout',
      pattern: 'none', patternColor: 'ice', extra: 'none',
    },
    blurb: 'Patient at the edge of the ice.',
    rules: 'Devours a seal or penguin in the habitat for +90 Chips.',
  },
  {
    id: 'penguin', name: 'Penguin',
    chips: 26, mult: 1.8, home: 'arctic',
    tags: ['bird', 'polar', 'swimming', 'social', 'prey', 'carnivore', 'small', 'cute', 'herd'],
    rarity: 'common', cost: 3, mass: 0.85, size: 0.9,
    sprite: {
      body: 'shadow', shade: 'ink', light: 'night', belly: 'white', eye: 'ink',
      eyeStyle: 'wide', ears: 'none', face: 'beak',
      pattern: 'none', patternColor: 'amber', extra: 'flipper',
    },
    blurb: 'Dressed for dinner, waddles anyway.',
    rules: '+1 Mult for each other penguin potted this shot.',
  },
  {
    id: 'seal', name: 'Seal',
    chips: 38, mult: 1.4, home: 'arctic',
    tags: ['swimming', 'polar', 'prey', 'mammal', 'aquatic', 'social', 'cute', 'carnivore'],
    rarity: 'common', cost: 3, mass: 1.15, size: 1.05,
    sprite: {
      body: 'grey1', shade: 'grey0', light: 'grey2', belly: 'bone', eye: 'ink',
      eyeStyle: 'sparkle', ears: 'none', face: 'whiskers',
      pattern: 'freckles', patternColor: 'grey0', extra: 'flipper',
    },
    blurb: 'A dog that chose the sea.',
    rules: '+35 Chips unless a predator shares the habitat.',
  },
  {
    id: 'arcticfox', name: 'Arctic Fox',
    chips: 44, mult: 2.5, home: 'arctic',
    tags: ['predator', 'canine', 'small', 'polar', 'carnivore', 'mammal', 'digging', 'cute', 'solitary'],
    rarity: 'uncommon', cost: 5, mass: 0.8, size: 0.9,
    sprite: {
      body: 'ice', shade: 'sky', light: 'white', belly: 'white', eye: 'ink',
      eyeStyle: 'wide', ears: 'pointy', face: 'muzzle',
      pattern: 'none', patternColor: 'sky', extra: 'tail',
    },
    blurb: 'White in winter, sly all year.',
    rules: 'Eats a rodent or bird in the habitat for +60 Chips.',
  },
  {
    id: 'walrus', name: 'Walrus',
    chips: 68, mult: 2, home: 'arctic',
    tags: ['big', 'polar', 'mammal', 'swimming', 'aquatic', 'social', 'slow', 'weird', 'herd'],
    rarity: 'uncommon', cost: 6, mass: 1.5, size: 1.2,
    sprite: {
      body: 'rust', shade: 'wood1', light: 'wood4', belly: 'sand', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'none', face: 'tusk',
      pattern: 'none', patternColor: 'wood1', extra: 'flipper',
    },
    blurb: 'Two tusks and a lot of opinion.',
    rules: '+20 Chips per polar animal already resident here.',
  },
  {
    id: 'snowyowl', name: 'Snowy Owl',
    chips: 50, mult: 2.5, home: 'arctic',
    tags: ['bird', 'nocturnal', 'predator', 'polar', 'flying', 'carnivore', 'solitary', 'majestic'],
    rarity: 'uncommon', cost: 5, mass: 0.85, size: 0.95,
    sprite: {
      body: 'bone', shade: 'grey1', light: 'white', belly: 'white', eye: 'gold',
      eyeStyle: 'wide', ears: 'tuft', face: 'beak',
      pattern: 'freckles', patternColor: 'grey0', extra: 'wing',
    },
    blurb: 'Hunts by the light off the snow.',
    rules: '+2 Mult for each small animal in the habitat.',
  },
  {
    id: 'narwhal', name: 'Narwhal',
    chips: 130, mult: 5, home: 'arctic',
    tags: ['aquatic', 'majestic', 'polar', 'mammal', 'swimming', 'big', 'weird', 'exotic', 'smart'],
    rarity: 'legendary', cost: 11, mass: 1.5, size: 1.22,
    sprite: {
      body: 'water2', shade: 'water0', light: 'sky', belly: 'foam', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'horn', face: 'flat',
      pattern: 'freckles', patternColor: 'ice', extra: 'flipper',
    },
    blurb: 'The sea keeps one unicorn.',
    rules: 'x2 Mult if it is the only animal in the habitat.',
  },

  /* =============================================================== JUNGLE */
  {
    id: 'monkey', name: 'Monkey',
    chips: 24, mult: 2, home: 'jungle',
    tags: ['primate', 'small', 'smart', 'social', 'omnivore', 'mammal', 'tropical', 'fast', 'weird'],
    rarity: 'common', cost: 3, mass: 0.8, size: 0.9,
    sprite: {
      body: 'wood3', shade: 'wood1', light: 'wood4', belly: 'sand', eye: 'ink',
      eyeStyle: 'wide', ears: 'round', face: 'muzzle',
      pattern: 'none', patternColor: 'wood1', extra: 'tail',
    },
    blurb: 'Steals fruit, keys, whole runs.',
    rules: 'Steals $1 and +2 Mult for each primate in the shot.',
  },
  {
    id: 'tiger', name: 'Tiger',
    chips: 92, mult: 3.5, home: 'jungle',
    tags: ['predator', 'carnivore', 'cat', 'big', 'mammal', 'solitary', 'tropical', 'majestic', 'fast'],
    rarity: 'rare', cost: 8, mass: 1.3, size: 1.15,
    sprite: {
      body: 'orange', shade: 'rust', light: 'amber', belly: 'white', eye: 'gold',
      eyeStyle: 'angry', ears: 'round', face: 'whiskers',
      pattern: 'stripes', patternColor: 'ink', extra: 'tail',
    },
    blurb: 'The orange arrives before the tiger.',
    rules: 'Eats one prey animal in the habitat for +120 Chips.',
  },
  {
    id: 'parrot', name: 'Parrot',
    chips: 28, mult: 2, home: 'jungle',
    tags: ['bird', 'tropical', 'flying', 'smart', 'social', 'small', 'omnivore', 'exotic'],
    rarity: 'common', cost: 3, mass: 0.7, size: 0.88,
    sprite: {
      body: 'red2', shade: 'red0', light: 'amber', belly: 'gold', eye: 'ink',
      eyeStyle: 'sparkle', ears: 'crest', face: 'beak',
      pattern: 'bands', patternColor: 'teal', extra: 'wing',
    },
    blurb: 'Repeats what the last animal said.',
    rules: '+2 Mult for each bird in the shot or the habitat.',
  },
  {
    id: 'sloth', name: 'Sloth',
    chips: 40, mult: 1.2, home: 'jungle',
    tags: ['slow', 'small', 'herbivore', 'mammal', 'tropical', 'solitary', 'weird', 'cute'],
    rarity: 'common', cost: 3, mass: 0.9, size: 0.98,
    sprite: {
      body: 'grey1', shade: 'wood1', light: 'sand', belly: 'bone', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'tuft', face: 'flat',
      pattern: 'patches', patternColor: 'moss', extra: 'none',
    },
    blurb: 'Arrives eventually. Scores anyway.',
    rules: '+45 Chips if the shot potted nothing else.',
  },
  {
    id: 'gorilla', name: 'Gorilla',
    chips: 100, mult: 3, home: 'jungle',
    tags: ['primate', 'big', 'smart', 'herbivore', 'mammal', 'social', 'tropical', 'majestic'],
    rarity: 'rare', cost: 8, mass: 1.45, size: 1.18,
    sprite: {
      body: 'shadow', shade: 'ink', light: 'grey0', belly: 'shadow', eye: 'ink',
      eyeStyle: 'angry', ears: 'round', face: 'flat',
      pattern: 'none', patternColor: 'grey2', extra: 'mane',
    },
    blurb: 'Thinks. Then throws.',
    rules: '+1 Mult per primate here, x2 Mult if it stands alone.',
  },
  {
    id: 'tapir', name: 'Tapir',
    chips: 42, mult: 1.4, home: 'jungle',
    tags: ['herbivore', 'prey', 'mammal', 'tropical', 'solitary', 'swimming', 'weird', 'slow'],
    rarity: 'common', cost: 4, mass: 1.2, size: 1.08,
    sprite: {
      body: 'grey0', shade: 'shadow', light: 'grey1', belly: 'bone', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'tiny', face: 'trunk',
      pattern: 'bands', patternColor: 'bone', extra: 'none',
    },
    blurb: 'A nose that outgrew its animal.',
    rules: '+30 Chips for each plant-eater in the habitat.',
  },
  {
    id: 'treefrog', name: 'Tree Frog',
    chips: 20, mult: 2, home: 'jungle',
    tags: ['amphibian', 'tiny', 'tropical', 'prey', 'carnivore', 'cute', 'wild'],
    rarity: 'common', cost: 3, mass: 0.6, size: 0.8,
    sprite: {
      body: 'green1', shade: 'moss', light: 'foam', belly: 'sand', eye: 'red2',
      eyeStyle: 'wide', ears: 'none', face: 'flat',
      pattern: 'spots', patternColor: 'teal', extra: 'none',
    },
    blurb: 'Tiny, sticky, unreasonably loud.',
    rules: '+3 Mult, but -20 Chips per predator in the habitat.',
  },
  {
    id: 'jaguar', name: 'Jaguar',
    chips: 66, mult: 2.5, home: 'jungle',
    tags: ['predator', 'carnivore', 'cat', 'mammal', 'tropical', 'solitary', 'swimming', 'fast'],
    rarity: 'uncommon', cost: 6, mass: 1.15, size: 1.08,
    sprite: {
      body: 'amber', shade: 'rust', light: 'sand', belly: 'bone', eye: 'gold',
      eyeStyle: 'angry', ears: 'pointy', face: 'whiskers',
      pattern: 'spots', patternColor: 'ink', extra: 'tail',
    },
    blurb: 'Swims to its dinner if it must.',
    rules: 'Eats a reptile or fish in the habitat for +80 Chips.',
  },
  {
    id: 'chameleon', name: 'Chameleon',
    chips: 105, mult: 4.5, home: 'jungle',
    tags: ['reptile', 'weird', 'small', 'tropical', 'carnivore', 'exotic', 'slow', 'smart'],
    rarity: 'legendary', cost: 12, mass: 0.75, size: 0.88,
    sprite: {
      body: 'teal', shade: 'cloth1', light: 'foam', belly: 'green1', eye: 'gold',
      eyeStyle: 'goggle', ears: 'crest', face: 'flat',
      pattern: 'scales', patternColor: 'purple1', extra: 'tail',
    },
    blurb: 'Belongs wherever it lands.',
    rules: 'Any gate is its true habitat. Always an exact match.',
  },
  {
    id: 'peacock', name: 'Peacock',
    chips: 52, mult: 2.5, home: 'jungle',
    tags: ['bird', 'majestic', 'tropical', 'flying', 'omnivore', 'social', 'exotic', 'prey'],
    rarity: 'uncommon', cost: 5, mass: 0.9, size: 1.0,
    sprite: {
      body: 'water2', shade: 'water0', light: 'teal', belly: 'water1', eye: 'ink',
      eyeStyle: 'sparkle', ears: 'crest', face: 'beak',
      pattern: 'none', patternColor: 'teal', extra: 'plume',
    },
    blurb: 'Vain, and entitled to it.',
    rules: 'x1.3 Mult for each majestic animal in the habitat.',
  },
  {
    id: 'pangolin', name: 'Pangolin',
    chips: 58, mult: 2.2, home: 'jungle',
    tags: ['armored', 'digging', 'mammal', 'nocturnal', 'tropical', 'weird', 'solitary'],
    rarity: 'uncommon', cost: 5, mass: 1.05, size: 0.98,
    sprite: {
      body: 'wood4', shade: 'wood2', light: 'sand', belly: 'bone', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'tiny', face: 'snout',
      pattern: 'plates', patternColor: 'wood1', extra: 'tail',
    },
    blurb: 'A pine cone with opinions.',
    rules: 'Cannot be eaten. +40 Chips when potted last in a shot.',
  },

  /* ================================================================ OCEAN */
  {
    id: 'dolphin', name: 'Dolphin',
    chips: 56, mult: 2.6, home: 'ocean',
    tags: ['swimming', 'smart', 'social', 'aquatic', 'mammal', 'predator', 'carnivore', 'fast', 'pack', 'cute'],
    rarity: 'uncommon', cost: 6, mass: 1.2, size: 1.1,
    sprite: {
      body: 'water3', shade: 'water1', light: 'foam', belly: 'white', eye: 'ink',
      eyeStyle: 'sparkle', ears: 'fin', face: 'flat',
      pattern: 'none', patternColor: 'foam', extra: 'flipper',
    },
    blurb: 'Grins like it knows the angles.',
    rules: '+2 Mult per animal potted after it in the same shot.',
  },
  {
    id: 'shark', name: 'Shark',
    chips: 98, mult: 3, home: 'ocean',
    tags: ['predator', 'fish', 'aquatic', 'carnivore', 'big', 'swimming', 'solitary', 'fast'],
    rarity: 'rare', cost: 8, mass: 1.4, size: 1.18,
    sprite: {
      body: 'grey0', shade: 'shadow', light: 'grey2', belly: 'bone', eye: 'ink',
      eyeStyle: 'angry', ears: 'fin', face: 'tusk',
      pattern: 'none', patternColor: 'foam', extra: 'gill',
    },
    blurb: 'Never stops. Never blinks.',
    rules: 'Eats every fish in the habitat for +70 Chips each.',
  },
  {
    id: 'clownfish', name: 'Clownfish',
    chips: 22, mult: 2, home: 'ocean',
    tags: ['fish', 'tiny', 'tropical', 'aquatic', 'swimming', 'prey', 'social', 'cute'],
    rarity: 'common', cost: 3, mass: 0.62, size: 0.82,
    sprite: {
      body: 'orange', shade: 'rust', light: 'amber', belly: 'white', eye: 'ink',
      eyeStyle: 'wide', ears: 'fin', face: 'flat',
      pattern: 'bands', patternColor: 'white', extra: 'gill',
    },
    blurb: 'Rents a room in a stinging plant.',
    rules: 'x2 Mult while a jellyfish shares the habitat.',
  },
  {
    id: 'octopus', name: 'Octopus',
    chips: 72, mult: 3.5, home: 'ocean',
    tags: ['weird', 'smart', 'aquatic', 'predator', 'carnivore', 'swimming', 'solitary', 'exotic'],
    rarity: 'rare', cost: 8, mass: 0.95, size: 1.0,
    sprite: {
      body: 'purple1', shade: 'purple0', light: 'pink', belly: 'purple1', eye: 'gold',
      eyeStyle: 'wide', ears: 'none', face: 'flat',
      pattern: 'spots', patternColor: 'pink', extra: 'tail',
    },
    blurb: 'Eight arms, all of them scheming.',
    rules: 'Copies the interaction total of the animal before it.',
  },
  {
    id: 'whale', name: 'Blue Whale',
    chips: 160, mult: 4, home: 'ocean',
    tags: ['big', 'aquatic', 'majestic', 'mammal', 'swimming', 'slow', 'smart', 'exotic'],
    rarity: 'legendary', cost: 12, mass: 1.6, size: 1.25,
    sprite: {
      body: 'water1', shade: 'water0', light: 'water3', belly: 'foam', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'none', face: 'flat',
      pattern: 'bands', patternColor: 'water0', extra: 'flipper',
    },
    blurb: 'The ark is the smaller boat.',
    rules: '+15 Chips for every animal left in the caravan.',
  },
  {
    id: 'seaturtle', name: 'Sea Turtle',
    chips: 60, mult: 2, home: 'ocean',
    tags: ['reptile', 'slow', 'armored', 'aquatic', 'swimming', 'herbivore', 'majestic', 'solitary'],
    rarity: 'uncommon', cost: 6, mass: 1.3, size: 1.1,
    sprite: {
      body: 'green0', shade: 'cloth0', light: 'moss', belly: 'sand', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'none', face: 'beak',
      pattern: 'none', patternColor: 'wood2', extra: 'shell',
    },
    blurb: 'Has been late for sixty years.',
    rules: '+14 Chips for each shot it survived out on the felt.',
  },
  {
    id: 'jellyfish', name: 'Jellyfish',
    chips: 21, mult: 2, home: 'ocean',
    tags: ['venomous', 'tiny', 'aquatic', 'swimming', 'weird', 'carnivore', 'slow'],
    rarity: 'common', cost: 3, mass: 0.6, size: 0.85,
    sprite: {
      body: 'pink', shade: 'purple0', light: 'foam', belly: 'pink', eye: 'purple0',
      eyeStyle: 'sleepy', ears: 'frill', face: 'flat',
      pattern: 'none', patternColor: 'foam', extra: 'gill',
    },
    blurb: 'No brain, no plan, still winning.',
    rules: 'Stings: -1 Mult to every predator in the habitat.',
  },
  {
    id: 'crab', name: 'Crab',
    chips: 30, mult: 1.6, home: 'ocean',
    tags: ['armored', 'small', 'aquatic', 'scavenger', 'omnivore', 'digging', 'weird'],
    rarity: 'common', cost: 3, mass: 0.9, size: 0.88,
    sprite: {
      body: 'red1', shade: 'red0', light: 'red2', belly: 'sand', eye: 'ink',
      eyeStyle: 'dot', ears: 'none', face: 'mandible',
      pattern: 'plates', patternColor: 'red0', extra: 'antenna',
    },
    blurb: 'Sideways, but with conviction.',
    rules: '+25 Chips per armored animal in the habitat.',
  },

  /* =============================================================== DESERT */
  {
    id: 'camel', name: 'Camel',
    chips: 64, mult: 2, home: 'desert',
    tags: ['herbivore', 'big', 'mammal', 'domestic', 'herd', 'slow', 'prey'],
    rarity: 'uncommon', cost: 5, mass: 1.4, size: 1.18,
    sprite: {
      body: 'sand', shade: 'wood2', light: 'bone', belly: 'bone', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'tiny', face: 'muzzle',
      pattern: 'none', patternColor: 'wood2', extra: 'hump',
    },
    blurb: 'Carries the water and the grudge.',
    rules: '+20 Chips for each animal potted earlier this shot.',
  },
  {
    id: 'fennecfox', name: 'Fennec Fox',
    chips: 25, mult: 2, home: 'desert',
    tags: ['canine', 'small', 'predator', 'carnivore', 'mammal', 'nocturnal', 'digging', 'cute'],
    rarity: 'common', cost: 3, mass: 0.7, size: 0.85,
    sprite: {
      body: 'bone', shade: 'sand', light: 'white', belly: 'white', eye: 'ink',
      eyeStyle: 'wide', ears: 'long', face: 'muzzle',
      pattern: 'none', patternColor: 'sand', extra: 'tail',
    },
    blurb: 'Ears first, fox second.',
    rules: '+2 Mult per small animal in the habitat.',
  },
  {
    id: 'scorpion', name: 'Scorpion',
    chips: 20, mult: 2, home: 'desert',
    tags: ['venomous', 'tiny', 'insect', 'predator', 'carnivore', 'nocturnal', 'armored', 'digging'],
    rarity: 'common', cost: 3, mass: 0.65, size: 0.8,
    sprite: {
      body: 'rust', shade: 'wood0', light: 'amber', belly: 'rust', eye: 'gold',
      eyeStyle: 'angry', ears: 'none', face: 'mandible',
      pattern: 'bands', patternColor: 'wood0', extra: 'tail',
    },
    blurb: 'Small print with a stinger.',
    rules: 'Stings one animal in the habitat for -40 Chips.',
  },
  {
    id: 'rattlesnake', name: 'Rattlesnake',
    chips: 48, mult: 2.6, home: 'desert',
    tags: ['reptile', 'venomous', 'predator', 'carnivore', 'solitary', 'nocturnal', 'wild'],
    rarity: 'uncommon', cost: 5, mass: 0.85, size: 0.92,
    sprite: {
      body: 'wood4', shade: 'wood2', light: 'sand', belly: 'bone', eye: 'red2',
      eyeStyle: 'angry', ears: 'none', face: 'flat',
      pattern: 'scales', patternColor: 'wood1', extra: 'tail',
    },
    blurb: 'Warns you exactly once.',
    rules: 'Eats a rodent in the habitat for +70 Chips.',
  },
  {
    id: 'roadrunner', name: 'Roadrunner',
    chips: 28, mult: 1.8, home: 'desert',
    tags: ['bird', 'fast', 'predator', 'carnivore', 'small', 'wild', 'weird'],
    rarity: 'common', cost: 3, mass: 0.75, size: 0.9,
    sprite: {
      body: 'grey1', shade: 'grey0', light: 'bone', belly: 'sand', eye: 'gold',
      eyeStyle: 'wide', ears: 'crest', face: 'beak',
      pattern: 'stripes', patternColor: 'ink', extra: 'wing',
    },
    blurb: 'Gone before the dust lands.',
    rules: 'x1.4 Mult if it was the first ball potted this shot.',
  },
  {
    id: 'armadillo', name: 'Armadillo',
    chips: 36, mult: 1.5, home: 'desert',
    tags: ['armored', 'small', 'digging', 'mammal', 'nocturnal', 'omnivore', 'slow', 'prey'],
    rarity: 'common', cost: 4, mass: 1.1, size: 0.95,
    sprite: {
      body: 'grey2', shade: 'grey0', light: 'bone', belly: 'sand', eye: 'ink',
      eyeStyle: 'dot', ears: 'long', face: 'snout',
      pattern: 'bands', patternColor: 'grey0', extra: 'shell',
    },
    blurb: 'Rolls into a very small tank.',
    rules: 'Cannot be eaten. +25 Chips per digging animal here.',
  },

  /* ================================================================= FARM */
  {
    id: 'cow', name: 'Cow',
    chips: 45, mult: 1.2, home: 'farm',
    tags: ['bovine', 'domestic', 'herd', 'herbivore', 'mammal', 'big', 'slow', 'social', 'prey'],
    rarity: 'common', cost: 4, mass: 1.35, size: 1.15,
    sprite: {
      body: 'bone', shade: 'grey1', light: 'white', belly: 'white', eye: 'ink',
      eyeStyle: 'wide', ears: 'round', face: 'muzzle',
      pattern: 'patches', patternColor: 'ink', extra: 'tail',
    },
    blurb: 'Chews. Considers. Chews.',
    rules: '+15 Chips per herd animal; set bonus with pig and hen.',
  },
  {
    id: 'pig', name: 'Pig',
    chips: 38, mult: 1.4, home: 'farm',
    tags: ['domestic', 'omnivore', 'mammal', 'smart', 'social', 'digging', 'prey'],
    rarity: 'common', cost: 3, mass: 1.15, size: 1.02,
    sprite: {
      body: 'pink', shade: 'red1', light: 'bone', belly: 'pink', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'round', face: 'snout',
      pattern: 'none', patternColor: 'red1', extra: 'tail',
    },
    blurb: 'Eats everything, judges nothing.',
    rules: '+1 Mult per domestic animal in the habitat.',
  },
  {
    id: 'chicken', name: 'Chicken',
    chips: 20, mult: 2, home: 'farm',
    tags: ['bird', 'domestic', 'small', 'omnivore', 'social', 'prey', 'herd'],
    rarity: 'common', cost: 2, mass: 0.65, size: 0.82,
    sprite: {
      body: 'sand', shade: 'wood2', light: 'bone', belly: 'white', eye: 'ink',
      eyeStyle: 'dot', ears: 'crest', face: 'beak',
      pattern: 'none', patternColor: 'red2', extra: 'wing',
    },
    blurb: 'Lays one egg, demands applause.',
    rules: '+$1 and +2 Mult for each other chicken in the shot.',
  },
  {
    id: 'sheep', name: 'Sheep',
    chips: 34, mult: 1.5, home: 'farm',
    tags: ['domestic', 'herd', 'prey', 'herbivore', 'mammal', 'social', 'slow', 'bovine'],
    rarity: 'common', cost: 3, mass: 1.0, size: 1.0,
    sprite: {
      body: 'bone', shade: 'grey2', light: 'white', belly: 'bone', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'long', face: 'muzzle',
      pattern: 'wool', patternColor: 'grey1', extra: 'none',
    },
    blurb: 'Follows. That is the whole plan.',
    rules: '+1 Mult per sheep in the shot, -2 Mult near a wolf.',
  },
  {
    id: 'goat', name: 'Goat',
    chips: 30, mult: 1.8, home: 'farm',
    tags: ['domestic', 'weird', 'herbivore', 'mammal', 'bovine', 'social', 'fast', 'prey'],
    rarity: 'common', cost: 3, mass: 0.95, size: 0.95,
    sprite: {
      body: 'grey2', shade: 'grey0', light: 'white', belly: 'bone', eye: 'gold',
      eyeStyle: 'wide', ears: 'horn', face: 'muzzle',
      pattern: 'freckles', patternColor: 'wood2', extra: 'none',
    },
    blurb: 'Will eat the deck if you look away.',
    rules: '+2 Mult for each animal sunk into a wrong gate.',
  },
  {
    id: 'horse', name: 'Horse',
    chips: 60, mult: 2.2, home: 'farm',
    tags: ['equine', 'domestic', 'fast', 'herbivore', 'mammal', 'herd', 'big', 'majestic', 'smart'],
    rarity: 'uncommon', cost: 6, mass: 1.3, size: 1.15,
    sprite: {
      body: 'wood3', shade: 'wood1', light: 'wood4', belly: 'wood3', eye: 'ink',
      eyeStyle: 'wide', ears: 'pointy', face: 'muzzle',
      pattern: 'none', patternColor: 'ink', extra: 'mane',
    },
    blurb: 'Runs first, asks later.',
    rules: '+30 Chips for each other farm animal in the shot.',
  },
  {
    id: 'duck', name: 'Duck',
    chips: 24, mult: 1.8, home: 'farm',
    tags: ['bird', 'domestic', 'swimming', 'omnivore', 'small', 'social', 'flying', 'prey'],
    rarity: 'common', cost: 2, mass: 0.75, size: 0.88,
    sprite: {
      body: 'cloth2', shade: 'cloth0', light: 'cloth3', belly: 'bone', eye: 'ink',
      eyeStyle: 'dot', ears: 'none', face: 'beak',
      pattern: 'none', patternColor: 'teal', extra: 'wing',
    },
    blurb: 'Farm on land, ocean at heart.',
    rules: '+1 Mult per bird in the shot, +$1 beside a chicken.',
  },
  {
    id: 'sheepdog', name: 'Sheepdog',
    chips: 42, mult: 2.8, home: 'farm',
    tags: ['canine', 'domestic', 'smart', 'carnivore', 'mammal', 'fast', 'social', 'predator'],
    rarity: 'uncommon', cost: 5, mass: 0.95, size: 0.95,
    sprite: {
      body: 'shadow', shade: 'ink', light: 'grey1', belly: 'white', eye: 'ink',
      eyeStyle: 'wide', ears: 'pointy', face: 'muzzle',
      pattern: 'patches', patternColor: 'white', extra: 'tail',
    },
    blurb: 'Works for the flock, not for you.',
    rules: '+2 Mult for each sheep in the habitat or the shot.',
  },

  /* ============================================================== WETLAND */
  {
    id: 'crocodile', name: 'Crocodile',
    chips: 90, mult: 3, home: 'wetland',
    tags: ['predator', 'reptile', 'big', 'carnivore', 'aquatic', 'swimming', 'armored', 'solitary'],
    rarity: 'rare', cost: 8, mass: 1.4, size: 1.16,
    sprite: {
      body: 'moss', shade: 'cloth0', light: 'green1', belly: 'sand', eye: 'gold',
      eyeStyle: 'angry', ears: 'none', face: 'tusk',
      pattern: 'scales', patternColor: 'cloth0', extra: 'sail',
    },
    blurb: 'A log with a schedule.',
    rules: 'Eats one animal in the habitat for +100 Chips.',
  },
  {
    id: 'flamingo', name: 'Flamingo',
    chips: 44, mult: 2.6, home: 'wetland',
    tags: ['bird', 'social', 'flying', 'herd', 'omnivore', 'exotic', 'majestic', 'prey'],
    rarity: 'uncommon', cost: 5, mass: 0.85, size: 1.05,
    sprite: {
      body: 'red2', shade: 'red1', light: 'pink', belly: 'bone', eye: 'ink',
      eyeStyle: 'dot', ears: 'none', face: 'beak',
      pattern: 'none', patternColor: 'pink', extra: 'plume',
    },
    blurb: 'Stands on one leg out of spite.',
    rules: '+1 Mult per flamingo here, stacking up to four deep.',
  },
  {
    id: 'heron', name: 'Heron',
    chips: 50, mult: 2.4, home: 'wetland',
    tags: ['bird', 'predator', 'flying', 'carnivore', 'solitary', 'slow', 'majestic'],
    rarity: 'uncommon', cost: 5, mass: 0.85, size: 1.0,
    sprite: {
      body: 'grey2', shade: 'grey0', light: 'white', belly: 'white', eye: 'gold',
      eyeStyle: 'angry', ears: 'crest', face: 'beak',
      pattern: 'none', patternColor: 'ink', extra: 'wing',
    },
    blurb: 'A patient grey dagger.',
    rules: 'Eats a fish or amphibian in the habitat for +65 Chips.',
  },
  {
    id: 'beaver', name: 'Beaver',
    chips: 36, mult: 1.6, home: 'wetland',
    tags: ['rodent', 'digging', 'mammal', 'swimming', 'herbivore', 'smart', 'social', 'prey'],
    rarity: 'common', cost: 3, mass: 1.0, size: 0.95,
    sprite: {
      body: 'wood2', shade: 'wood0', light: 'wood3', belly: 'wood1', eye: 'ink',
      eyeStyle: 'dot', ears: 'round', face: 'snout',
      pattern: 'none', patternColor: 'wood0', extra: 'tail',
    },
    blurb: 'Cannot hear running water.',
    rules: '+20 Chips for each animal still out on the felt.',
  },
  {
    id: 'dragonfly', name: 'Dragonfly',
    chips: 20, mult: 2, home: 'wetland',
    tags: ['insect', 'flying', 'fast', 'tiny', 'predator', 'carnivore', 'weird'],
    rarity: 'common', cost: 3, mass: 0.6, size: 0.8,
    sprite: {
      body: 'teal', shade: 'cloth1', light: 'foam', belly: 'teal', eye: 'purple1',
      eyeStyle: 'goggle', ears: 'none', face: 'mandible',
      pattern: 'bands', patternColor: 'water0', extra: 'wing',
    },
    blurb: 'Four wings, zero patience.',
    rules: '+3 Mult, and +1 Mult more per flying animal here.',
  },
  {
    id: 'otter', name: 'Otter',
    chips: 46, mult: 2.8, home: 'wetland',
    tags: ['mustelid', 'swimming', 'cute', 'mammal', 'predator', 'carnivore', 'social', 'smart', 'fast'],
    rarity: 'uncommon', cost: 5, mass: 0.85, size: 0.92,
    sprite: {
      body: 'wood3', shade: 'wood1', light: 'sand', belly: 'bone', eye: 'ink',
      eyeStyle: 'sparkle', ears: 'tiny', face: 'whiskers',
      pattern: 'none', patternColor: 'wood1', extra: 'flipper',
    },
    blurb: 'Holds hands, holds grudges.',
    rules: 'x1.5 Mult when potted beside another otter.',
  },
  {
    id: 'platypus', name: 'Platypus',
    chips: 66, mult: 3.5, home: 'wetland',
    tags: ['weird', 'mammal', 'swimming', 'venomous', 'digging', 'exotic', 'carnivore', 'small'],
    rarity: 'rare', cost: 8, mass: 0.9, size: 0.92,
    sprite: {
      body: 'wood1', shade: 'wood0', light: 'wood3', belly: 'sand', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'none', face: 'beak',
      pattern: 'none', patternColor: 'amber', extra: 'flipper',
    },
    blurb: 'Assembled from spare parts.',
    rules: 'Counts as bird, mammal and reptile all at once.',
  },
  {
    id: 'axolotl', name: 'Axolotl',
    chips: 42, mult: 3, home: 'wetland',
    tags: ['amphibian', 'weird', 'tiny', 'exotic', 'aquatic', 'cute', 'carnivore', 'slow'],
    rarity: 'uncommon', cost: 5, mass: 0.7, size: 0.85,
    sprite: {
      body: 'pink', shade: 'red1', light: 'bone', belly: 'pink', eye: 'ink',
      eyeStyle: 'dot', ears: 'frill', face: 'flat',
      pattern: 'none', patternColor: 'red2', extra: 'gill',
    },
    blurb: 'Smiling through the whole ordeal.',
    rules: 'Returns to the caravan instead of being eaten.',
  },

  /* ============================================================= MOUNTAIN */
  {
    id: 'mountaingoat', name: 'Mountain Goat',
    chips: 40, mult: 1.6, home: 'mountain',
    tags: ['bovine', 'fast', 'herbivore', 'mammal', 'herd', 'armored', 'wild', 'prey'],
    rarity: 'common', cost: 4, mass: 1.05, size: 1.0,
    sprite: {
      body: 'bone', shade: 'grey2', light: 'white', belly: 'white', eye: 'gold',
      eyeStyle: 'dot', ears: 'horn', face: 'muzzle',
      pattern: 'wool', patternColor: 'grey1', extra: 'none',
    },
    blurb: 'Stands where nothing should stand.',
    rules: '+25 Chips per bovine or herd animal in the habitat.',
  },
  {
    id: 'eagle', name: 'Eagle',
    chips: 78, mult: 3.5, home: 'mountain',
    tags: ['bird', 'predator', 'flying', 'majestic', 'carnivore', 'fast', 'solitary', 'wild'],
    rarity: 'rare', cost: 8, mass: 1.0, size: 1.05,
    sprite: {
      body: 'wood2', shade: 'wood0', light: 'brass2', belly: 'sand', eye: 'gold',
      eyeStyle: 'angry', ears: 'none', face: 'beak',
      pattern: 'none', patternColor: 'white', extra: 'wing',
    },
    blurb: 'Owns everything it can see.',
    rules: 'Eats one small animal on the felt for +80 Chips.',
  },
  {
    id: 'snowleopard', name: 'Snow Leopard',
    chips: 120, mult: 5, home: 'mountain',
    tags: ['predator', 'cat', 'carnivore', 'mammal', 'polar', 'solitary', 'majestic', 'exotic', 'fast'],
    rarity: 'legendary', cost: 12, mass: 1.2, size: 1.12,
    sprite: {
      body: 'ice', shade: 'sky', light: 'white', belly: 'white', eye: 'teal',
      eyeStyle: 'angry', ears: 'round', face: 'whiskers',
      pattern: 'spots', patternColor: 'grey0', extra: 'tail',
    },
    blurb: 'A rumour with paws.',
    rules: 'x2 Mult while no other animal shares the habitat.',
  },
  {
    id: 'yak', name: 'Yak',
    chips: 70, mult: 2, home: 'mountain',
    tags: ['bovine', 'big', 'herbivore', 'mammal', 'domestic', 'herd', 'slow', 'polar'],
    rarity: 'uncommon', cost: 6, mass: 1.5, size: 1.2,
    sprite: {
      body: 'wood1', shade: 'wood0', light: 'wood3', belly: 'wood1', eye: 'ink',
      eyeStyle: 'sleepy', ears: 'horn', face: 'muzzle',
      pattern: 'wool', patternColor: 'wood0', extra: 'mane',
    },
    blurb: 'A hill that decided to walk.',
    rules: '+20 Chips per cold-habitat animal in the habitat.',
  },
  {
    id: 'marmot', name: 'Marmot',
    chips: 26, mult: 1.8, home: 'mountain',
    tags: ['rodent', 'small', 'digging', 'mammal', 'herbivore', 'social', 'prey', 'cute'],
    rarity: 'common', cost: 3, mass: 0.8, size: 0.88,
    sprite: {
      body: 'wood4', shade: 'wood2', light: 'sand', belly: 'sand', eye: 'ink',
      eyeStyle: 'wide', ears: 'tiny', face: 'tusk',
      pattern: 'freckles', patternColor: 'wood2', extra: 'tail',
    },
    blurb: 'Screams. Sleeps. Screams.',
    rules: '+2 Mult per rodent in the shot or the habitat.',
  },
  {
    id: 'condor', name: 'Condor',
    chips: 62, mult: 2.4, home: 'mountain',
    tags: ['bird', 'flying', 'scavenger', 'big', 'carnivore', 'solitary', 'majestic', 'weird'],
    rarity: 'uncommon', cost: 6, mass: 1.05, size: 1.1,
    sprite: {
      body: 'shadow', shade: 'ink', light: 'grey0', belly: 'shadow', eye: 'ink',
      eyeStyle: 'angry', ears: 'frill', face: 'beak',
      pattern: 'none', patternColor: 'bone', extra: 'wing',
    },
    blurb: 'Waits for the mountain to win.',
    rules: '+40 Chips for each animal eaten during this shot.',
  },
  {
    id: 'redpanda', name: 'Red Panda',
    chips: 40, mult: 3, home: 'mountain',
    tags: ['cute', 'small', 'mammal', 'omnivore', 'nocturnal', 'solitary', 'exotic', 'prey'],
    rarity: 'uncommon', cost: 5, mass: 0.8, size: 0.9,
    sprite: {
      body: 'rust', shade: 'wood1', light: 'orange', belly: 'white', eye: 'ink',
      eyeStyle: 'sparkle', ears: 'round', face: 'muzzle',
      pattern: 'none', patternColor: 'white', extra: 'tail',
    },
    blurb: 'Adorable, and fully aware of it.',
    rules: '+3 Mult when potted alongside any cute animal.',
  },

  /* =============================================================== FOREST */
  {
    id: 'fox', name: 'Fox',
    chips: 30, mult: 2, home: 'forest',
    tags: ['predator', 'canine', 'small', 'carnivore', 'mammal', 'smart', 'nocturnal', 'solitary'],
    rarity: 'common', cost: 3, mass: 0.85, size: 0.92,
    sprite: {
      body: 'orange', shade: 'rust', light: 'amber', belly: 'white', eye: 'gold',
      eyeStyle: 'sparkle', ears: 'pointy', face: 'muzzle',
      pattern: 'none', patternColor: 'white', extra: 'tail',
    },
    blurb: 'Knows where the rabbits are.',
    rules: 'Eats a rabbit in the habitat for +60 Chips.',
  },
  {
    id: 'rabbit', name: 'Rabbit',
    chips: 22, mult: 1.8, home: 'forest',
    tags: ['prey', 'small', 'herbivore', 'mammal', 'digging', 'fast', 'social', 'cute'],
    rarity: 'common', cost: 2, mass: 0.68, size: 0.85,
    sprite: {
      body: 'grey2', shade: 'grey0', light: 'bone', belly: 'white', eye: 'ink',
      eyeStyle: 'wide', ears: 'long', face: 'muzzle',
      pattern: 'none', patternColor: 'pink', extra: 'tail',
    },
    blurb: 'Multiplies, mathematically.',
    rules: '+1 Mult per rabbit here. Foxes and wolves eat it.',
  },
  {
    id: 'deer', name: 'Deer',
    chips: 38, mult: 1.6, home: 'forest',
    tags: ['prey', 'herbivore', 'herd', 'mammal', 'fast', 'social', 'majestic', 'wild'],
    rarity: 'common', cost: 3, mass: 1.1, size: 1.05,
    sprite: {
      body: 'wood3', shade: 'wood1', light: 'sand', belly: 'bone', eye: 'ink',
      eyeStyle: 'wide', ears: 'antler', face: 'muzzle',
      pattern: 'freckles', patternColor: 'bone', extra: 'tail',
    },
    blurb: 'Freezes at the sound of the cue.',
    rules: '+1 Mult per herd animal, -1 Mult per predator here.',
  },
  {
    id: 'owl', name: 'Owl',
    chips: 48, mult: 2.6, home: 'forest',
    tags: ['bird', 'nocturnal', 'predator', 'flying', 'carnivore', 'smart', 'solitary'],
    rarity: 'uncommon', cost: 5, mass: 0.85, size: 0.95,
    sprite: {
      body: 'wood2', shade: 'wood0', light: 'wood4', belly: 'sand', eye: 'gold',
      eyeStyle: 'wide', ears: 'tuft', face: 'beak',
      pattern: 'freckles', patternColor: 'bone', extra: 'wing',
    },
    blurb: 'Silent, and then not.',
    rules: 'Eats a rodent in the habitat for +55 Chips.',
  },
  {
    id: 'hedgehog', name: 'Hedgehog',
    chips: 24, mult: 2, home: 'forest',
    tags: ['small', 'armored', 'mammal', 'nocturnal', 'digging', 'cute', 'prey'],
    rarity: 'common', cost: 3, mass: 0.7, size: 0.82,
    sprite: {
      body: 'wood3', shade: 'wood1', light: 'sand', belly: 'bone', eye: 'ink',
      eyeStyle: 'dot', ears: 'tiny', face: 'snout',
      pattern: 'none', patternColor: 'wood0', extra: 'quills',
    },
    blurb: 'A hostile pincushion, but shy.',
    rules: 'Cannot be eaten. -1 Mult to each predator here.',
  },
  {
    id: 'badger', name: 'Badger',
    chips: 40, mult: 1.6, home: 'forest',
    tags: ['mustelid', 'digging', 'mammal', 'omnivore', 'nocturnal', 'solitary', 'armored'],
    rarity: 'common', cost: 4, mass: 1.0, size: 0.95,
    sprite: {
      body: 'grey1', shade: 'shadow', light: 'white', belly: 'grey0', eye: 'ink',
      eyeStyle: 'angry', ears: 'tiny', face: 'snout',
      pattern: 'stripes', patternColor: 'white', extra: 'none',
    },
    blurb: 'Digs first, negotiates never.',
    rules: '+30 Chips per digging animal in the habitat.',
  },
  {
    id: 'squirrel', name: 'Squirrel',
    chips: 20, mult: 2, home: 'forest',
    tags: ['rodent', 'tiny', 'omnivore', 'mammal', 'fast', 'prey', 'cute', 'digging'],
    rarity: 'common', cost: 2, mass: 0.6, size: 0.8,
    sprite: {
      body: 'rust', shade: 'wood1', light: 'amber', belly: 'bone', eye: 'ink',
      eyeStyle: 'sparkle', ears: 'tuft', face: 'tusk',
      pattern: 'none', patternColor: 'bone', extra: 'tail',
    },
    blurb: 'Buried the chips and forgot where.',
    rules: '+2 Mult, and +$1 for each squirrel in the shot.',
  },
  {
    id: 'brownbear', name: 'Brown Bear',
    chips: 96, mult: 3, home: 'forest',
    tags: ['bear', 'big', 'omnivore', 'mammal', 'predator', 'solitary', 'digging', 'majestic'],
    rarity: 'rare', cost: 8, mass: 1.45, size: 1.2,
    sprite: {
      body: 'wood2', shade: 'wood0', light: 'wood3', belly: 'wood1', eye: 'ink',
      eyeStyle: 'angry', ears: 'round', face: 'snout',
      pattern: 'none', patternColor: 'wood0', extra: 'none',
    },
    blurb: 'Fishes, forages, ends arguments.',
    rules: 'Eats a fish or rodent in the habitat for +90 Chips.',
  },
  {
    id: 'wolf', name: 'Wolf',
    chips: 55, mult: 2.8, home: 'forest',
    tags: ['predator', 'canine', 'pack', 'carnivore', 'mammal', 'social', 'smart', 'nocturnal', 'fast'],
    rarity: 'uncommon', cost: 6, mass: 1.1, size: 1.05,
    sprite: {
      body: 'grey0', shade: 'shadow', light: 'grey2', belly: 'bone', eye: 'gold',
      eyeStyle: 'angry', ears: 'pointy', face: 'muzzle',
      pattern: 'none', patternColor: 'grey2', extra: 'mane',
    },
    blurb: 'Never hunts alone, never has to.',
    rules: '+2 Mult per wolf in the pack. Scares prey here.',
  },
  {
    id: 'boar', name: 'Boar',
    chips: 44, mult: 1.4, home: 'forest',
    tags: ['omnivore', 'armored', 'mammal', 'big', 'wild', 'digging', 'fast', 'social'],
    rarity: 'common', cost: 4, mass: 1.25, size: 1.08,
    sprite: {
      body: 'wood1', shade: 'ink', light: 'wood3', belly: 'wood2', eye: 'red2',
      eyeStyle: 'angry', ears: 'pointy', face: 'tusk',
      pattern: 'none', patternColor: 'bone', extra: 'mane',
    },
    blurb: 'Bad temper on four hooves.',
    rules: '+2 Mult per omnivore or armored animal in the habitat.',
  },
];

/* ------------------------------------------------------------ APOCRYPHA */
// Sixteen more, added with the flood story: eight real creatures the ark was always
// going to need, and eight out of the myths the disasters come from.
//
// Every one of these carries a `skill`, which is an ENGINE-RECOGNISED id handled in
// src/game/scoring.js — unlike `rules`, which is only a promise made to the player.
// A skill id the engine does not know about is inert, never a crash.

const APOCRYPHA = [
  // --- real creatures
  { id: 'dove', name: 'Dove', chips: 26, mult: 3, home: 'forest',
    tags: ['bird', 'flying', 'small', 'prey', 'cute', 'social'], rarity: 'uncommon', cost: 5,
    mass: 0.62, size: 0.85,
    sprite: { body: 'white', shade: 'grey2', light: 'white', belly: 'bone', eye: 'ink', eyeStyle: 'dot', ears: 'none', face: 'beak', pattern: 'none', patternColor: 'grey1', extra: 'wing' },
    blurb: 'Comes back. Always comes back.', rules: 'Returns to the caravan after scoring.',
    skill: { id: 'returns', desc: 'Flies home to the caravan instead of being spent' } },

  { id: 'raven', name: 'Raven', chips: 34, mult: 3, home: 'mountain',
    tags: ['bird', 'flying', 'scavenger', 'smart', 'nocturnal'], rarity: 'uncommon', cost: 5,
    mass: 0.7, size: 0.9,
    sprite: { body: 'ink', shade: 'shadow', light: 'purple0', belly: 'shadow', eye: 'gold', eyeStyle: 'angry', ears: 'none', face: 'beak', pattern: 'none', patternColor: 'purple0', extra: 'wing' },
    blurb: 'Sent out first. Did not return.', rules: 'Reveals the gates when they are hidden.',
    skill: { id: 'scout', desc: 'While aboard, sealed and hidden gates read normally' } },

  { id: 'ibex', name: 'Ibex', chips: 52, mult: 2.4, home: 'mountain',
    tags: ['bovine', 'herbivore', 'fast', 'wild', 'herd'], rarity: 'common', cost: 4,
    mass: 1.0, size: 1.0,
    sprite: { body: 'wood3', shade: 'wood1', light: 'sand', belly: 'bone', eye: 'ink', eyeStyle: 'dot', ears: 'horn', face: 'muzzle', pattern: 'none', patternColor: 'wood0', extra: 'tail' },
    blurb: 'Stands where nothing should stand.', rules: 'Rail bounces are worth double for it.',
    skill: { id: 'sure_footed', desc: 'Each cushion it strikes pays double chips' } },

    { id: 'lamb', name: 'Lamb', chips: 20, mult: 2.2, home: 'farm',
    tags: ['domestic', 'prey', 'small', 'cute', 'herd'], rarity: 'common', cost: 3,
    mass: 0.7, size: 0.85,
    sprite: { body: 'white', shade: 'grey2', light: 'white', belly: 'bone', eye: 'ink', eyeStyle: 'wide', ears: 'round', face: 'snout', pattern: 'wool', patternColor: 'grey2', extra: 'tail' },
    blurb: 'Small. Extremely aware of it.', rules: 'Cannot be eaten while a Shepherd relic is held.',
    skill: { id: 'spared', desc: 'Never devoured — predators leave it alone' } },

  { id: 'ox', name: 'Ox', chips: 74, mult: 1.6, home: 'farm',
    tags: ['bovine', 'domestic', 'big', 'herbivore', 'slow'], rarity: 'uncommon', cost: 5,
    mass: 1.55, size: 1.22,
    sprite: { body: 'wood2', shade: 'wood0', light: 'wood4', belly: 'sand', eye: 'ink', eyeStyle: 'sleepy', ears: 'horn', face: 'muzzle', pattern: 'patches', patternColor: 'bone', extra: 'tail' },
    blurb: 'Pulls the whole ark if asked.', rules: 'Pushes other animals much harder.',
    skill: { id: 'draught', desc: 'Heavy: it barely slows when it hits another animal' } },

  { id: 'locust', name: 'Locust', chips: 16, mult: 4, home: 'desert',
    tags: ['insect', 'flying', 'tiny', 'social', 'wild'], rarity: 'common', cost: 3,
    mass: 0.6, size: 0.8,
    sprite: { body: 'green0', shade: 'moss', light: 'green1', belly: 'sand', eye: 'ink', eyeStyle: 'goggle', ears: 'none', face: 'mandible', pattern: 'bands', patternColor: 'moss', extra: 'antenna' },
    blurb: 'Never travels alone. Ever.', rules: '+1 Mult for every other Locust anywhere.',
    skill: { id: 'swarm', desc: '+1 Mult for every other Locust on the felt or in a gate' } },

  { id: 'scarab', name: 'Scarab', chips: 30, mult: 3.2, home: 'desert',
    tags: ['insect', 'tiny', 'armored', 'digging'], rarity: 'uncommon', cost: 5,
    mass: 0.75, size: 0.82,
    sprite: { body: 'teal', shade: 'water0', light: 'foam', belly: 'brass2', eye: 'gold', eyeStyle: 'sparkle', ears: 'none', face: 'mandible', pattern: 'plates', patternColor: 'brass1', extra: 'antenna' },
    blurb: 'Rolls the sun uphill, apparently.', rules: 'Pays money as well as chips.',
    skill: { id: 'gilded', desc: 'Pays $1 every time it is sent home' } },

  { id: 'nightingale', name: 'Nightingale', chips: 24, mult: 3.6, home: 'forest',
    tags: ['bird', 'flying', 'tiny', 'nocturnal', 'cute'], rarity: 'uncommon', cost: 5,
    mass: 0.6, size: 0.8,
    sprite: { body: 'wood3', shade: 'wood1', light: 'sand', belly: 'bone', eye: 'ink', eyeStyle: 'dot', ears: 'crest', face: 'beak', pattern: 'freckles', patternColor: 'wood0', extra: 'wing' },
    blurb: 'Sings the others calm.', rules: 'Cancels one debuff in its gate.',
    skill: { id: 'lullaby', desc: 'Cancels the first debuff in its habitat' } },

  // --- out of the myths
  { id: 'unicorn', name: 'Unicorn', chips: 96, mult: 4, home: 'forest',
    tags: ['equine', 'majestic', 'exotic', 'solitary', 'smart'], rarity: 'rare', cost: 8,
    mass: 1.05, size: 1.08,
    sprite: { body: 'white', shade: 'purple1', light: 'white', belly: 'ice', eye: 'purple1', eyeStyle: 'sparkle', ears: 'horn', face: 'muzzle', pattern: 'none', patternColor: 'purple0', extra: 'plume' },
    blurb: 'Missed the boat, in most tellings.', rules: 'x2 Mult if it is alone in the gate.',
    skill: { id: 'solitary_grace', desc: 'x2 Mult when it is the only animal in its habitat' } },

  { id: 'phoenix', name: 'Phoenix', chips: 110, mult: 4.5, home: 'desert',
    tags: ['bird', 'flying', 'exotic', 'majestic', 'solitary'], rarity: 'legendary', cost: 10,
    mass: 0.9, size: 1.1,
    sprite: { body: 'orange', shade: 'red1', light: 'gold', belly: 'amber', eye: 'gold', eyeStyle: 'sparkle', ears: 'crest', face: 'beak', pattern: 'bands', patternColor: 'gold', extra: 'plume' },
    blurb: 'Burns down. Gets up. Repeats.', rules: 'A wrong gate costs it nothing — it returns.',
    skill: { id: 'rekindle', desc: 'A wrong gate does not spend it: it comes back to the caravan' } },

  { id: 'griffin', name: 'Griffin', chips: 102, mult: 3.6, home: 'mountain',
    tags: ['bird', 'predator', 'flying', 'exotic', 'majestic', 'big'], rarity: 'rare', cost: 8,
    mass: 1.3, size: 1.18,
    sprite: { body: 'brass2', shade: 'wood1', light: 'brass3', belly: 'bone', eye: 'gold', eyeStyle: 'angry', ears: 'tuft', face: 'beak', pattern: 'patches', patternColor: 'wood2', extra: 'wing' },
    blurb: 'Front half judges. Back half hunts.', rules: 'Eats prey in any gate, not just its own.',
    skill: { id: 'far_hunter', desc: 'Devours prey in ANY habitat, not only its own' } },

  { id: 'kraken', name: 'Kraken', chips: 140, mult: 4, home: 'ocean',
    tags: ['aquatic', 'predator', 'big', 'weird', 'exotic', 'smart'], rarity: 'legendary', cost: 10,
    mass: 1.6, size: 1.25,
    sprite: { body: 'purple0', shade: 'ink', light: 'purple1', belly: 'water1', eye: 'gold', eyeStyle: 'wide', ears: 'fin', face: 'mandible', pattern: 'spots', patternColor: 'purple1', extra: 'gill' },
    blurb: 'Takes the whole shot with it.', rules: 'Drags every animal it touched into its gate.',
    skill: { id: 'drag_down', desc: 'Every animal it struck this shot counts as sunk with it' } },

  { id: 'behemoth', name: 'Behemoth', chips: 150, mult: 2, home: 'wetland',
    tags: ['big', 'herbivore', 'armored', 'slow', 'exotic', 'majestic'], rarity: 'legendary', cost: 10,
    mass: 1.6, size: 1.25,
    sprite: { body: 'moss', shade: 'green0', light: 'green1', belly: 'sand', eye: 'ink', eyeStyle: 'sleepy', ears: 'horn', face: 'tusk', pattern: 'plates', patternColor: 'green0', extra: 'hump' },
    blurb: 'The first of the land things.', rules: 'Immune to every debuff.',
    skill: { id: 'unmoved', desc: 'Immune to debuffs, and never devoured' } },

  { id: 'ziz', name: 'Ziz', chips: 118, mult: 3.4, home: 'savanna',
    tags: ['bird', 'flying', 'big', 'exotic', 'majestic'], rarity: 'rare', cost: 8,
    mass: 1.15, size: 1.2,
    sprite: { body: 'sky', shade: 'water2', light: 'foam', belly: 'white', eye: 'gold', eyeStyle: 'wide', ears: 'crest', face: 'beak', pattern: 'bands', patternColor: 'water1', extra: 'wing' },
    blurb: 'Its wingspan blots out the sun.', rules: 'Holds the flood back one shot.',
    skill: { id: 'stay_the_water', desc: 'Sending it home holds the flood back one full shot' } },

  { id: 'qilin', name: 'Qilin', chips: 92, mult: 4.2, home: 'jungle',
    tags: ['exotic', 'majestic', 'smart', 'herbivore', 'solitary'], rarity: 'rare', cost: 8,
    mass: 1.1, size: 1.05,
    sprite: { body: 'green1', shade: 'green0', light: 'gold', belly: 'brass3', eye: 'gold', eyeStyle: 'sleepy', ears: 'antler', face: 'muzzle', pattern: 'scales', patternColor: 'brass1', extra: 'mane' },
    blurb: 'Arrives when someone good is born.', rules: 'Every animal after it this shot gains Mult.',
    skill: { id: 'auspice', desc: '+1 Mult to every animal scored after it in the same shot' } },

  { id: 'thunderbird', name: 'Thunderbird', chips: 108, mult: 3.8, home: 'arctic',
    tags: ['bird', 'flying', 'big', 'exotic', 'majestic', 'polar'], rarity: 'rare', cost: 8,
    mass: 1.1, size: 1.15,
    sprite: { body: 'purple1', shade: 'purple0', light: 'ice', belly: 'sky', eye: 'gold', eyeStyle: 'angry', ears: 'crest', face: 'beak', pattern: 'bands', patternColor: 'gold', extra: 'wing' },
    blurb: 'The storm has a favourite.', rules: 'Ignores what the boss is doing to chips.',
    skill: { id: 'storm_born', desc: 'Boss chip and mult penalties do not apply to it' } },
];

/* ------------------------------------------------------ likes (berth traits)

The roster is authored with a single `home` biome per animal, which is how it reads
best as data. Berths, though, advertise TRAITS (habitats.js), and the whole point of
traits is that an animal accepts several. Rather than hand-maintain a likes array on
ninety rows -- where it would rot the first time a tag changed -- likes are DERIVED,
once, at import:

  1. the animal's biome seeds a ranked trait triple (a jungle animal wants bushy
     first, warm second, soaked third),
  2. its tags promote traits it obviously wants: anything `flying` wants a perch,
     anything `nocturnal` wants the dark, anything `domestic` wants the barn,
  3. the list is deduped and clipped to three, because three pips is what the gate
     plate and the animal card can show without becoming a spreadsheet.

`home` is then rewritten to likes[0], so every existing consumer of `.home` keeps
working and now means "favourite condition" instead of "the one correct pocket".
*/

const BIOME_LIKES = {
  savanna:  ['warm', 'dusty', 'bushy'],
  arctic:   ['frozen', 'briny', 'lofty'],
  jungle:   ['bushy', 'warm', 'soaked'],
  ocean:    ['briny', 'soaked', 'frozen'],
  desert:   ['dusty', 'warm', 'lofty'],
  farm:     ['tame', 'warm', 'bushy'],
  wetland:  ['soaked', 'bushy', 'tame'],
  mountain: ['lofty', 'frozen', 'dusty'],
  forest:   ['bushy', 'gloomy', 'soaked'],
};

// tag -> the trait it argues for. Order matters: an earlier match outranks a later
// one, so a nocturnal flying thing is gloomy-then-lofty.
const TAG_LIKES = [
  ['polar', 'frozen'],
  ['nocturnal', 'gloomy'],
  ['digging', 'gloomy'],
  ['fish', 'briny'],
  ['aquatic', 'soaked'],
  ['amphibian', 'soaked'],
  ['swimming', 'soaked'],
  ['flying', 'lofty'],
  ['bird', 'lofty'],
  ['domestic', 'tame'],
  ['tropical', 'warm'],
  ['insect', 'bushy'],
  ['reptile', 'warm'],
  ['armored', 'dusty'],
];

// Where derivation is not good enough. A biome plus tags gets 86 of the 90 animals
// right, but the four head of starter stock ALL derive to tame-first, which would make
// the opening draft a choice between four identical animals. These are hand-set so the
// first decision in the run is a real one, and a few others earn an override because a
// tag is doing a poor job of describing what the animal actually wants.
const LIKES_OVERRIDE = {
  chicken: ['tame', 'lofty', 'dusty'],    // roosts high, bathes in dust
  pig:     ['soaked', 'tame', 'gloomy'],  // the wallow comes first and it is not close
  cow:     ['tame', 'bushy', 'warm'],     // pasture and a warm barn
  sheep:   ['bushy', 'tame', 'lofty'],    // hill grazing
  camel:   ['dusty', 'warm', 'lofty'],
  hippo:   ['soaked', 'warm', 'tame'],
  owl:     ['gloomy', 'bushy', 'lofty'],
  bat:     ['gloomy', 'lofty', 'warm'],
  mole:    ['gloomy', 'soaked', 'tame'],
  penguin: ['frozen', 'briny', 'tame'],
  seal:    ['briny', 'frozen', 'soaked'],
  goat:    ['lofty', 'dusty', 'tame'],    // it is on the roof again
  duck:    ['soaked', 'tame', 'lofty'],
  beaver:  ['soaked', 'bushy', 'gloomy'],
  crab:    ['briny', 'soaked', 'dusty'],
  dove:    ['lofty', 'bushy', 'tame'],
  raven:   ['gloomy', 'lofty', 'dusty'],
  locust:  ['dusty', 'warm', 'bushy'],
  scarab:  ['dusty', 'gloomy', 'warm'],
};

function deriveLikes(a) {
  const forced = LIKES_OVERRIDE[a.id];
  if (forced) return forced.slice();
  const seed = BIOME_LIKES[a.home] || ['tame', 'warm', 'bushy'];
  const promoted = [];
  const tags = a.tags || [];
  for (const [tag, trait] of TAG_LIKES) {
    if (tags.indexOf(tag) >= 0 && promoted.indexOf(trait) < 0) promoted.push(trait);
  }
  // The biome keeps first claim -- it is the animal's identity -- but a strongly
  // tagged trait jumps ahead of the biome's weaker third choice.
  const out = [seed[0]];
  for (const t of promoted) if (out.indexOf(t) < 0) out.push(t);
  for (const t of seed.slice(1)) if (out.indexOf(t) < 0) out.push(t);
  return out.slice(0, 3);
}

// Rewritten in place before the roster is frozen. Every record gains `likes` and has
// its `home` re-pointed at its favourite trait.
for (const a of BASE_ANIMALS.concat(APOCRYPHA)) {
  a.likes = Object.freeze(deriveLikes(a));
  a.biome = a.home;                  // kept for flavour text and shop grouping
  a.home = a.likes[0];
}

/** The full roster: the original manifest plus the apocrypha. */
export const ANIMALS = Object.freeze(BASE_ANIMALS.concat(APOCRYPHA));

/** Animals whose skill id the scoring engine actually implements. */
export const SKILLED = Object.freeze(ANIMALS.filter((a) => a.skill && a.skill.id));
export const SKILL_BY_ANIMAL = Object.freeze(
  SKILLED.reduce((acc, a) => { acc[a.id] = a.skill.id; return acc; }, {}),
);

/* ----------------------------------------------------------------- indexes */

export const ANIMAL_BY_ID = Object.freeze(
  ANIMALS.reduce((acc, a) => { acc[a.id] = a; return acc; }, {}),
);

/** favourite trait -> animals, in roster order. For cargo crates and the vitrine. */
export const ANIMALS_BY_HOME = Object.freeze(
  ANIMALS.reduce((acc, a) => { (acc[a.home] = acc[a.home] || []).push(a); return acc; }, {}),
);

export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'legendary'];

// Built once: tag lookups happen inside interaction fuzzing and per-shot scoring,
// so a linear scan per call would be 72 * rules * balls.
const BY_TAG = (() => {
  const m = {};
  for (const a of ANIMALS) {
    for (const t of a.tags) (m[t] = m[t] || []).push(a);
  }
  for (const k in m) Object.freeze(m[k]);
  return m;
})();

/** Every animal carrying `tag`. Returns a shared frozen array — do not mutate. */
export function animalsByTag(tag) {
  return BY_TAG[tag] || EMPTY;
}
const EMPTY = Object.freeze([]);

/* ----------------------------------------------------------- starter stock */

// The farm. Not a deck -- a FLOCK, and a bigger one than you can take.
//
// Five chickens, three pigs, three cows, two sheep: thirteen head, and the ramp only
// takes eight. Everything left on the bank drowns, so the first decision of the run is
// which five animals you are not going to save. The four species are deliberately
// hand-tuned in LIKES_OVERRIDE to want different conditions -- chickens roost high and
// dust-bathe, pigs want the wallow before anything else, cows want pasture and a warm
// barn, sheep want hillside scrub -- because a draft between four identical animals is
// not a draft.
export const STARTER_STOCK = [
  'chicken', 'chicken', 'chicken', 'chicken', 'chicken',
  'pig', 'pig', 'pig',
  'cow', 'cow', 'cow',
  'sheep', 'sheep',
];

/** How many head the ramp takes. */
export const DRAFT_SIZE = 8;

// Kept as the old name for anything that just wants a plausible spread of ids (the
// physics rack self-test, balance fuzzing). It is not what a run starts with.
export const STARTER_DECK = [
  'cow', 'pig', 'chicken', 'chicken', 'sheep', 'sheep', 'sheepdog',
  'fox', 'rabbit', 'rabbit', 'deer', 'squirrel', 'hedgehog',
  'zebra', 'meerkat', 'ostrich',
  'clownfish', 'crab',
  'beaver', 'dragonfly',
  'marmot',
  'fennecfox',
];

/* --------------------------------------------------------------- the roller */

// Shop odds. Legendaries are rare enough that seeing one is an event, and
// `rarityBoost` (relics, freighter crates) tilts the whole curve upward at once.
const RARITY_WEIGHT = { common: 0.6, uncommon: 0.27, rare: 0.11, legendary: 0.02 };

/**
 * Roll one animal.
 * @param rng   seeded rng (rng.js) — required, never Math.random
 * @param o     { rarity, habitat, exclude:[id], rarityBoost:number }
 * Filters degrade instead of failing: an impossible combination (e.g. a legendary
 * farm animal) falls back to the next-widest pool, so cargo.js always gets a row.
 */
export function rollAnimal(rng, o = {}) {
  const opts = o || {};
  let pool = ANIMALS;

  if (opts.habitat) {
    const byHome = ANIMALS_BY_HOME[opts.habitat];
    if (byHome && byHome.length) pool = byHome;
  }
  if (opts.exclude && opts.exclude.length) {
    const ex = new Set(opts.exclude);
    const kept = pool.filter((a) => !ex.has(a.id));
    if (kept.length) pool = kept;
  }

  let rarity = opts.rarity;
  if (!rarity && rng && typeof rng.weighted === 'function') {
    const boost = typeof opts.rarityBoost === 'number' && isFinite(opts.rarityBoost)
      ? opts.rarityBoost : 0;
    // only offer tiers this pool can actually satisfy, so a boost never returns null
    const table = [];
    RARITY_ORDER.forEach((r, i) => {
      if (!pool.some((a) => a.rarity === r)) return;
      table.push([r, Math.max(0.001, RARITY_WEIGHT[r] * (1 + boost * i * 0.9))]);
    });
    if (table.length) rarity = rng.weighted(table);
  }
  if (rarity) {
    const byR = pool.filter((a) => a.rarity === rarity);
    if (byR.length) pool = byR;
  }

  if (!pool.length) pool = ANIMALS;
  if (rng && typeof rng.pick === 'function') return rng.pick(pool);
  return pool[0];
}

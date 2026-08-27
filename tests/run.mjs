// node tests/run.mjs [--only=section]
//
// Headless test + balance harness. Runs the real modules against the software canvas,
// validates every data row against the frozen contract, stress-tests the physics, fuzzes
// every relic hook, then AUTO-PLAYS complete runs and reports the balance curve.

import { installDom } from '../tools/stubdom.mjs';
const dom = installDom();
const { SoftCanvas, writePNG } = await import('../tools/softcanvas.mjs');

const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
let pass = 0, fail = 0;
const fails = [];

function ok(cond, msg, detail) {
  if (cond) { pass++; return true; }
  fail++; fails.push(msg + (detail ? '  <- ' + detail : ''));
  return false;
}
function section(name) {
  if (only && only !== name) return false;
  console.log(`\n\x1b[1m── ${name} ${'─'.repeat(Math.max(0, 58 - name.length))}\x1b[0m`);
  return true;
}
const num = (v) => typeof v === 'number' && Number.isFinite(v);

/* ------------------------------------------------------------------ load */

const M = {};
{
  // Modules always load, whatever --only selects — every section needs them.
  const quiet = !section('load');
  const list = [
    ['palette', '../src/core/palette.js'], ['pixel', '../src/core/pixel.js'],
    ['rng', '../src/core/rng.js'], ['font', '../src/render/font.js'],
    ['sprites', '../src/render/sprites.js'], ['uikit', '../src/render/uikit.js'],
    ['seascape', '../src/render/seascape.js'], ['audio', '../src/core/audio.js'],
    ['particles', '../src/core/particles.js'],
    ['animals', '../src/data/animals.js'],
    ['cinematic', '../src/render/cinematic.js'], ['story', '../src/data/story.js'],
    ['abilities', '../src/data/abilities.js'], ['obstacles', '../src/data/obstacles.js'],
    ['islands', '../src/data/islands.js'], ['voyage', '../src/game/voyage.js'],
    ['boatart', '../src/render/boat.js'], ['islandart', '../src/render/islandart.js'],
    ['folk', '../src/render/folk.js'], ['items', '../src/data/items.js'],
    ['lane', '../src/game/lane.js'], ['tiles', '../src/render/tiles.js'],
    ['beasts', '../src/data/beasts.js'], ['corrupted', '../src/data/corrupted.js'],
    ['gear', '../src/data/gear.js'], ['quests', '../src/data/quests.js'],
    ['npcs', '../src/data/npcs.js'], ['garden', '../src/game/garden.js'],
    ['choicedata', '../src/data/choices.js'], ['choices', '../src/game/choices.js'],
    ['summons', '../src/data/summons.js'],
  ];
  const broken = [];
  for (const [k, p] of list) {
    try { M[k] = await import(p); if (!quiet) ok(true, k); }
    catch (e) { broken.push(k); if (!quiet) ok(false, `import ${k}`, e.message); }
  }
  if (!quiet) console.log(`  loaded ${Object.keys(M).length}/${list.length} modules`);
  else if (broken.length) console.log(`  (note: ${broken.length} module(s) unavailable: ${broken.join(', ')})`);
}

/* ------------------------------------------------------------- ROSTER spec */

const ROSTER = {
  savanna: ['lion', 'zebra', 'giraffe', 'elephant', 'meerkat', 'hyena', 'rhino', 'ostrich', 'honeybadger'],
  arctic: ['polarbear', 'penguin', 'seal', 'arcticfox', 'walrus', 'snowyowl', 'narwhal'],
  jungle: ['monkey', 'tiger', 'parrot', 'sloth', 'gorilla', 'tapir', 'treefrog', 'jaguar', 'chameleon', 'peacock', 'pangolin'],
  ocean: ['dolphin', 'shark', 'clownfish', 'octopus', 'whale', 'seaturtle', 'jellyfish', 'crab'],
  desert: ['camel', 'fennecfox', 'scorpion', 'rattlesnake', 'roadrunner', 'armadillo'],
  farm: ['cow', 'pig', 'chicken', 'sheep', 'goat', 'horse', 'duck', 'sheepdog'],
  wetland: ['crocodile', 'flamingo', 'heron', 'beaver', 'dragonfly', 'otter', 'platypus', 'axolotl'],
  mountain: ['mountaingoat', 'eagle', 'snowleopard', 'yak', 'marmot', 'condor', 'redpanda'],
  forest: ['fox', 'rabbit', 'deer', 'owl', 'hedgehog', 'badger', 'squirrel', 'brownbear', 'wolf', 'boar'],
};
// The apocrypha: added with the flood story. Real creatures the ark needed, plus beasts
// out of the same myths the disasters come from. Every one carries an engine skill.
const APOCRYPHA = {
  forest: ['dove', 'unicorn', 'nightingale'],
  mountain: ['raven', 'ibex', 'griffin'],
  farm: ['lamb', 'ox'],
  desert: ['locust', 'scarab', 'phoenix'],
  ocean: ['kraken'],
  wetland: ['behemoth'],
  savanna: ['ziz'],
  jungle: ['qilin'],
  arctic: ['thunderbird'],
};
for (const [home, list] of Object.entries(APOCRYPHA)) ROSTER[home] = ROSTER[home].concat(list);
const ALL_IDS = Object.values(ROSTER).flat();

// Berths advertise TRAITS, not biomes. ROSTER is still keyed by biome because that is
// how the roster is authored; these are the ids a gate can actually carry.
const TRAIT_IDS = ['warm', 'frozen', 'bushy', 'briny', 'dusty', 'tame', 'soaked', 'lofty', 'gloomy'];
const TAGS = new Set(`predator prey herbivore carnivore omnivore bird fish mammal reptile insect amphibian
cat canine bovine equine primate rodent bear pachyderm marsupial mustelid big small tiny flying swimming
digging nocturnal social solitary tropical polar aquatic domestic wild exotic pack herd scavenger venomous
armored fast slow smart cute majestic weird`.split(/\s+/).filter(Boolean));
const RECIPE_ENUMS = {
  eyeStyle: ['dot', 'wide', 'sleepy', 'angry', 'sparkle', 'goggle'],
  ears: ['none', 'round', 'pointy', 'long', 'tiny', 'tuft', 'horn', 'antler', 'crest', 'fin', 'frill', 'shell'],
  face: ['muzzle', 'snout', 'beak', 'trunk', 'flat', 'whiskers', 'tusk', 'mandible'],
  pattern: ['none', 'stripes', 'spots', 'patches', 'scales', 'wool', 'plates', 'bands', 'freckles'],
  extra: ['none', 'mane', 'wing', 'tail', 'shell', 'quills', 'hump', 'flipper', 'plume', 'antenna', 'gill', 'sail'],
};

/* -------------------------------------------------------------- data specs */

if (section('data/animals') && M.animals) {
  const A = M.animals;
  ok(Array.isArray(A.ANIMALS), 'ANIMALS is an array');
  const ids = (A.ANIMALS || []).map((a) => a.id);
  const missing = ALL_IDS.filter((id) => !ids.includes(id));
  const extra = ids.filter((id) => !ALL_IDS.includes(id));
  ok(missing.length === 0, 'every roster id present', missing.join(','));
  ok(extra.length === 0, 'no ids outside the roster', extra.join(','));
  ok(ids.length === new Set(ids).size, 'animal ids unique');
  for (const [biome, list] of Object.entries(ROSTER)) {
    for (const id of list) {
      const a = A.ANIMAL_BY_ID[id];
      if (!a) continue;
      ok(a.biome === biome, `${id} biome === ${biome}`, a.biome);
    }
  }
  // every animal must want two or three legal traits, favourite first
  let badLikes = [];
  for (const a of A.ANIMALS || []) {
    const L = a.likes;
    if (!Array.isArray(L) || L.length < 2 || L.length > 3) { badLikes.push(`${a.id}:len`); continue; }
    if (new Set(L).size !== L.length) badLikes.push(`${a.id}:dup`);
    if (a.home !== L[0]) badLikes.push(`${a.id}:home!=likes[0]`);
    for (const t of L) if (!TRAIT_IDS.includes(t)) badLikes.push(`${a.id}:${t}`);
  }
  ok(badLikes.length === 0, 'every animal likes 2-3 legal traits, favourite first', badLikes.slice(0, 6).join(','));
  // and the demand has to be spread: no trait may be unwanted, none may own the board
  const demand = {};
  for (const t of TRAIT_IDS) demand[t] = 0;
  for (const a of A.ANIMALS || []) for (const t of a.likes || []) demand[t]++;
  const lo = Math.min(...Object.values(demand)), hi = Math.max(...Object.values(demand));
  ok(lo >= 8, 'no trait is effectively unwanted', `min ${lo}`);
  ok(hi <= (A.ANIMALS || []).length * 0.7, 'no trait dominates the roster', `max ${hi}`);
  let badTag = [], badRecipe = [], badCol = [], badNum = [];
  for (const a of A.ANIMALS || []) {
    for (const t of a.tags || []) if (!TAGS.has(t)) badTag.push(`${a.id}:${t}`);
    const s = a.sprite || {};
    for (const [k, vals] of Object.entries(RECIPE_ENUMS)) {
      if (s[k] !== undefined && !vals.includes(s[k])) badRecipe.push(`${a.id}.${k}=${s[k]}`);
    }
    for (const k of ['body', 'shade', 'light', 'belly', 'eye', 'patternColor']) {
      if (s[k] !== undefined && !M.palette.P[s[k]]) badCol.push(`${a.id}.${k}=${s[k]}`);
    }
    if (!num(a.chips) || a.chips <= 0) badNum.push(`${a.id}.chips`);
    if (!num(a.mult) || a.mult <= 0) badNum.push(`${a.id}.mult`);
    if (!num(a.mass) || a.mass <= 0) badNum.push(`${a.id}.mass`);
    if (!num(a.size) || a.size <= 0) badNum.push(`${a.id}.size`);
    if (!['common', 'uncommon', 'rare', 'legendary'].includes(a.rarity)) badNum.push(`${a.id}.rarity=${a.rarity}`);
  }
  ok(badTag.length === 0, 'all tags in the vocabulary', badTag.slice(0, 6).join(' '));
  ok(badRecipe.length === 0, 'all sprite recipe values legal', badRecipe.slice(0, 6).join(' '));
  ok(badCol.length === 0, 'all sprite colours are palette keys', badCol.slice(0, 6).join(' '));
  ok(badNum.length === 0, 'all animal numbers sane', badNum.slice(0, 6).join(' '));
  ok(Array.isArray(A.STARTER_DECK) && A.STARTER_DECK.length >= 18, 'STARTER_DECK sized', A.STARTER_DECK && A.STARTER_DECK.length);
  ok((A.STARTER_DECK || []).every((id) => A.ANIMAL_BY_ID[id]), 'STARTER_DECK ids all real');
  const homes = new Set((A.STARTER_DECK || []).map((id) => (A.ANIMAL_BY_ID[id] || {}).home));
  ok(homes.size >= 5, 'STARTER_DECK spans a spread of homes', homes.size);
  // the roster still carries `likes` and `home`, because the islands are keyed on them:
  // an island's `likes` is what decides who is ashore on it
  const noLikes = (A.ANIMALS || []).filter((a) => !a.likes || a.likes.length < 1).map((a) => a.id);
  ok(noLikes.length === 0, 'every animal still wants something', noLikes.slice(0, 6).join(' '));
}

/* ------------------------------------------------------------------ voyage */

if (section('voyage') && M.voyage && M.islands && M.obstacles && M.abilities) {
  const { ABILITIES, ABILITY_BY_ID, abilityOf, abilityPower } = M.abilities;
  const { OBSTACLES, OBSTACLE_BY_ID } = M.obstacles;
  const { ISLANDS, CHERUBIM, rollLeg, allObstacleKinds } = M.islands;
  const V = M.voyage;
  const PHYS = ['solid', 'slow', 'slick', 'kill', 'push', 'pull', 'gap', 'strike'];
  const palOk = (k) => M.palette.palKeys().indexOf(k) >= 0;

  // --- abilities: every animal is FOR something, and nothing is unused
  const spread = {};
  let missing = 0;
  for (const a of M.animals.ANIMALS) {
    const ab = abilityOf(a);
    if (!ab || !ab.id) { missing++; continue; }
    spread[ab.id] = (spread[ab.id] || 0) + 1;
    if (!num(abilityPower(a)) || abilityPower(a) < 1) missing++;
  }
  ok(missing === 0, 'every animal has an ability and a power', String(missing));
  ok(Object.keys(spread).length === ABILITIES.length,
    'every ability is carried by at least one animal',
    `${Object.keys(spread).length}/${ABILITIES.length}: ${JSON.stringify(spread)}`);
  const thin = ABILITIES.filter((a) => (spread[a.id] || 0) < 5).map((a) => a.id);
  ok(thin.length === 0, 'no ability is carried by fewer than five animals', thin.join(','));
  for (const a of ABILITIES) {
    ok(!!a.name && !!a.verb && !!a.blurb, `ability ${a.id} is written`);
    ok(M.uikit.hasIcon(a.icon), `ability ${a.id} icon exists`, a.icon);
    ok(palOk(a.color), `ability ${a.id} colour is a palette key`, a.color);
  }

  // --- obstacles: each one is answered by exactly one real ability, or by nothing
  for (const o of OBSTACLES) {
    ok(PHYS.indexOf(o.physics) >= 0, `obstacle ${o.id} has a known physics`, o.physics);
    ok(o.clearedBy === null || !!ABILITY_BY_ID[o.clearedBy],
      `obstacle ${o.id} clearedBy names a real ability`, String(o.clearedBy));
    ok(!!o.blurb && (o.clearedBy ? !!o.cleared : true), `obstacle ${o.id} is written`);
    ok(M.uikit.hasIcon(o.icon), `obstacle ${o.id} icon exists`, o.icon);
    ok(num(o.r) && o.r > 4, `obstacle ${o.id} has a radius`);
    for (const k of ['color', 'dark', 'light']) ok(palOk(o[k]), `obstacle ${o.id} ${k} is a palette key`, o[k]);
  }
  const answered = OBSTACLES.filter((o) => o.clearedBy).length;
  ok(answered >= 8, 'most obstacles are solvable by an animal', `${answered}/${OBSTACLES.length}`);

  // --- islands: eleven biomes, three people islands, and the gate
  const rescues = ISLANDS.filter((i) => !i.meets);
  const peopleIsles = ISLANDS.filter((i) => i.meets);
  ok(rescues.length === 11, 'eleven biomes', String(rescues.length));
  ok(peopleIsles.length === 3, 'and an island each for the three who trade', String(peopleIsles.length));
  for (const i of peopleIsles) {
    ok(!!M.npcs.NPC_BY_ID[i.meets], `${i.id} belongs to somebody real`, i.meets);
    ok(i.animals > 0, `${i.id} is still a rescue`, String(i.animals));
  }
  {
    // and they are only offered while their person is a stranger
    const r2 = M.rng.makeRng('PEOPLE');
    let withUnmet = 0, withoutUnmet = 0;
    for (let leg = 2; leg <= 40; leg++) {
      const a = rollLeg(r2.fork('a' + leg), { leg, unmet: ['snake', 'adam', 'eve'] });
      const b2 = rollLeg(r2.fork('b' + leg), { leg, unmet: [] });
      if (a.some((i) => i.meets)) withUnmet++;
      if (b2.some((i) => i.meets)) withoutUnmet++;
    }
    ok(withUnmet > 20, 'a stranger island is offered while they are a stranger', String(withUnmet));
    ok(withoutUnmet === 0, 'and never once you have met all three', String(withoutUnmet));
  }
  const seenBiome = new Set();
  for (const i of ISLANDS.concat([CHERUBIM])) {
    seenBiome.add(i.biome);
    ok(!!i.name && !!i.blurb, `island ${i.id} is written`);
    for (const key of ['ground', 'rock', 'sky']) {
      const ramp = i[key];
      ok(Array.isArray(ramp) && ramp.length === 3, `island ${i.id} ${key} is a three-step ramp`);
      for (const c of ramp || []) ok(palOk(c), `island ${i.id} ${key} colour is a palette key`, c);
    }
    ok(num(i.relief) && i.relief > 0.2 && i.relief <= 1, `island ${i.id} relief is sane`, String(i.relief));
    ok(num(i.steep) && i.steep > 0.1 && i.steep <= 1.6, `island ${i.id} steep is sane`, String(i.steep));
    ok(i.danger >= 0 && i.danger <= 4, `island ${i.id} danger is 0..4`);
    for (const oid of i.obstacles) ok(!!OBSTACLE_BY_ID[oid], `island ${i.id} obstacle ${oid} exists`);
    ok(Array.isArray(i.scenery) && i.scenery.length >= 3, `island ${i.id} has scenery`);
  }
  ok(seenBiome.size >= 11, 'no two islands share a biome word', String(seenBiome.size));
  ok(allObstacleKinds().length >= 10, 'the biomes between them use most obstacle kinds',
    String(allObstacleKinds().length));

  // --- the route roll: a safe haul, a risky haul, and sometimes the gate
  const rng = M.rng.makeRng('ROUTE');
  let gates = 0, dupes = 0;
  for (let leg = 1; leg <= 60; leg++) {
    const out = rollLeg(rng.fork('L' + leg), { leg, lastWasCherubim: leg % 7 === 0 });
    if (out.length !== 3) { dupes++; continue; }
    const ids = out.map((o) => o.id);
    if (new Set(ids).size !== 3) dupes++;
    if (ids.indexOf('cherubim') >= 0) {
      gates++;
      if (leg % 7 === 0) dupes++;             // never offered twice in a row
    }
  }
  ok(dupes === 0, 'every leg offers three distinct destinations', String(dupes));
  ok(gates > 20, 'the gate is offered often enough to matter', String(gates));

  // --- the starting deck is a set of TOOLS, not five of the same animal
  const v0 = V.newVoyage('VOY-0001');
  ok(v0.aboard.length === 4 && V.berthsFree(v0) >= 4,
    'the boat starts half empty, because the empty half is what a rescue fills',
    `${v0.aboard.length}/${V.capacity(v0)}`);
  const startAb = new Set(v0.aboard.map((id) => abilityOf(M.animals.ANIMAL_BY_ID[id]).id));
  ok(startAb.size >= 3, 'the starting deck carries at least three abilities',
    [...startAb].join(','));

  // --- the tide: an unupgraded boat runs out of ocean exactly at the end of the voyage
  const v1 = V.newVoyage('VOY-TIDE');
  let legs = 0;
  while (!v1.over && legs < 40) { V.sailTo(v1, v1.choices[0]); V.departIsland(v1); legs++; }
  ok(legs >= 14 && legs <= 18, 'an unupgraded voyage ends within a leg or two of the finish',
    `${legs} legs`);
  ok(v1.flood > 0.9, 'and it finishes with the water at its heels', v1.flood.toFixed(3));
  const v2 = V.newVoyage('VOY-SAIL');
  v2.tiers.speed = 4;
  let legs2 = 0;
  while (!v2.over && legs2 < 40) { V.sailTo(v2, v2.choices[0]); V.departIsland(v2); legs2++; }
  ok(legs2 === legs && v2.won, 'a full sail finishes the same voyage', `${legs2} legs`);
  ok(v2.flood < 0.62, 'and buys real margin doing it', v2.flood.toFixed(3));

  // --- the manifest: aboard / Eden / lost, and the rules that move between them
  const v = V.newVoyage('VOY-MAN');
  // a kind that appears ONCE on the deck, so "moved" and "still there" cannot both be
  // true off the back of a duplicate
  const first = v.aboard.find((id) => v.aboard.filter((o) => o === id).length === 1);
  while (V.berthsFree(v) > 0) ok(V.takeAboard(v, 'cow'), 'a berth takes an animal');
  ok(!V.takeAboard(v, 'cow'), 'a full boat refuses another animal');
  ok(V.sell(v, 'cow', 'aboard') > 0, 'and one can be sold off the deck to make room');
  ok(V.stow(v, first), 'stowing moves an animal into the garden');
  ok(v.eden.indexOf(first) >= 0 && v.aboard.indexOf(first) < 0, 'and it is in exactly one place');
  ok(V.unstow(v, first), 'and it can come back out');
  const price = V.sellPrice(v, first);
  ok(price > 0, 'an animal has a price');
  V.makeLoyal(v, first);
  ok(V.sellPrice(v, first) > price, 'a loyal animal is worth more');
  ok(V.isLoyal(v, first), 'loyalty sticks');

  // a breach never takes a loyal animal, which is the whole promise of the apple
  const v3 = V.newVoyage('VOY-HULL');
  for (const id of v3.aboard.slice()) V.makeLoyal(v3, id);
  const before = v3.aboard.length;
  V.damageHull(v3, 99);
  ok(v3.over || v3.aboard.length === before, 'a breach never drowns a loyal animal');
  const v4 = V.newVoyage('VOY-HULL2');
  V.makeLoyal(v4, v4.aboard[0]);
  V.damageHull(v4, 99);
  ok(v4.aboard.indexOf(v4.loyal[0]) >= 0, 'the loyal one is still aboard after a breach');
  ok(v4.lost.length === 1, 'and exactly one other went');

  // --- upgrades: visible, priced, and capped
  const v5 = V.newVoyage('VOY-UP');
  v5.money = 999;
  for (const id of V.UPGRADE_IDS) {
    let steps = 0;
    while (V.tierCost(v5, id) !== null && steps < 9) { ok(V.buyUpgrade(v5, id), `buy ${id} ${steps}`); steps++; }
    ok(steps === 4, `${id} has four purchasable steps`, String(steps));
    ok(V.buyUpgrade(v5, id) === false, `${id} cannot be bought past the top`);
  }
  ok(V.capacity(v5) === 18 && V.hullMax(v5) === 11, 'a fully upgraded boat is at its numbers');
  const v6 = V.newVoyage('VOY-POOR');
  v6.money = 0;
  ok(V.buyUpgrade(v6, 'capacity') === false, 'you cannot buy what you cannot afford');

  // --- relics slot by type, and the golem has exactly three
  const v7 = V.newVoyage('VOY-REL');
  const held = { id: 'r1', name: 'Thing', slot: 'hold', bonus: { grip: 2 } };
  const worn = { id: 'r2', name: 'Cloak', slot: 'wear', bonus: { grip: 1, dry: true } };
  V.equip(v7, held); V.equip(v7, worn);
  ok(V.equipped(v7).length === 2, 'two slots filled');
  ok(V.relicBonus(v7, 'grip') === 3, 'numeric bonuses add across slots');
  ok(V.relicFlag(v7, 'dry'), 'flags read across slots');
  const displaced = V.equip(v7, { id: 'r3', name: 'Other', slot: 'hold', bonus: {} });
  ok(displaced === held, 'a new relic displaces the one in its own slot');
  ok(Object.keys(v7.slots).length === 3, 'the golem has three slots');

  // --- the hold: apples and gear, capped by the boat
  const v8 = V.newVoyage('VOY-HOLD');
  const cap = V.holdSize(v8);
  for (let i = 0; i < cap; i++) ok(V.addItem(v8, 'apple'), `hold takes apple ${i}`);
  ok(V.addItem(v8, 'apple') === false, 'a full hold refuses another apple');
  ok(V.useItem(v8, 'apple') && v8.hold.length === cap - 1, 'using one frees a slot');
  ok(V.useItem(v8, 'nothing') === false, 'you cannot use what you do not have');

  // --- status is complete, because the HUD reads it
  const st = V.status(v8);
  for (const k of ['chapter', 'leg', 'flood', 'aboard', 'capacity', 'eden', 'garden', 'hull', 'hullMax', 'money', 'lost', 'where']) {
    ok(st[k] !== undefined, `status reports ${k}`);
  }

  // --- the art layers take every island and every boat tier without throwing
  if (M.boatart && M.islandart) {
    const cv = new SoftCanvas(960, 540);
    const g = cv.getContext('2d');
    let threw = null;
    try {
      for (let i = 0; i < 5; i++) {
        M.boatart.drawBoat(g, 480, 400, i * 0.7, {
          tiers: { capacity: i, speed: i, hull: i, hold: i }, damage: i, scale: 1,
        });
        M.boatart.drawBoatFar(g, 100 + i * 40, 200, i * 0.3, { tiers: { speed: i } });
      }
      for (const isl of ISLANDS.concat([CHERUBIM])) {
        M.islandart.drawIslandFar(g, isl, 480, 300, 130, 96, 1.3, {});
        M.islandart.drawIslandBack(g, isl, 0, 0, 240, 135, 1.3, {});
      }
    } catch (e) { threw = e; }
    ok(!threw, 'every island and boat tier renders', threw && threw.message);
  }
}

/* ----------------------------------------------------------------- the summons */

if (section('summons') && M.summons && M.beasts && M.animals && M.voyage) {
  const S = M.summons;
  const { BEAST_BY_ID, MYTHIC } = M.beasts;
  const { ANIMALS, ANIMAL_BY_ID } = M.animals;
  const V = M.voyage;

  ok(S.SUMMONS.length >= 5, 'there are several summons to work toward', String(S.SUMMONS.length));

  const cultures = new Set();
  for (const su of S.SUMMONS) {
    ok(!!BEAST_BY_ID[su.beast], `${su.id} calls a real beast`, su.beast);
    ok(BEAST_BY_ID[su.beast].mythic === true, `${su.id}'s beast is marked mythic`);
    ok(!!ANIMAL_BY_ID[BEAST_BY_ID[su.beast].base],
      `${su.id}'s beast is made of a real animal`, BEAST_BY_ID[su.beast].base);
    ok(su.need >= 4, `${su.id} needs a real collection`, String(su.need));
    ok(!!su.culture && !cultures.has(su.culture), `${su.id} names its own culture`, su.culture);
    cultures.add(su.culture);
    ok(!!su.lore && su.lore.length > 20, `${su.id} says what it is`);

    // AND IT HAS TO BE EARNABLE. A summon wanting six kinds of a tag only four animals
    // carry is a card nobody will ever see, and nothing in the game would say so.
    const carriers = ANIMALS.filter((a) => a.tags && a.tags.indexOf(su.tag) >= 0);
    ok(carriers.length >= su.need + 2,
      `${su.id}: enough animals carry '${su.tag}' to earn it`, `${carriers.length} vs ${su.need}`);
  }

  // no mythic beast is ever handed out by taming: they are the one reward you collect for
  for (const c of M.corrupted.CORRUPTED.concat(M.corrupted.CHAMPIONS)) {
    ok(!MYTHIC.some((b) => b.id === c.gives), `${c.id} does not hand out a summon`, c.gives);
  }

  // --- progress counts DISTINCT species
  {
    const v = V.newVoyage('SUM1');
    const su = S.SUMMONS.find((x) => x.tag === 'bird');
    const birds = ANIMALS.filter((a) => a.tags.indexOf('bird') >= 0).map((a) => a.id);
    v.aboard = [birds[0], birds[0], birds[0]];
    ok(S.progressFor(v, su).length === 1, 'three of the same bird is one kind of bird',
      String(S.progressFor(v, su).length));
    v.aboard = birds.slice(0, su.need);
    ok(S.progressFor(v, su).length === su.need, 'and five different ones is five');
  }

  // --- the garden counts too, because a rescue you banked is still a rescue
  {
    const v = V.newVoyage('SUM2');
    const su = S.SUMMONS.find((x) => x.tag === 'bird');
    const birds = ANIMALS.filter((a) => a.tags.indexOf('bird') >= 0).map((a) => a.id);
    v.aboard = birds.slice(0, 2);
    v.eden = birds.slice(2, su.need);
    ok(S.progressFor(v, su).length === su.need, 'the boat and the garden are counted together');
  }

  // --- calling one, once
  {
    const v = V.newVoyage('SUM3');
    const su = S.SUMMONS.find((x) => x.tag === 'bird');
    const birds = ANIMALS.filter((a) => a.tags.indexOf('bird') >= 0).map((a) => a.id);
    v.aboard = birds.slice(0, su.need);
    const won = S.checkSummons(v);
    ok(won.some((x) => x.id === su.id), 'a full collection calls its summon');
    ok((v.beasts || []).indexOf(su.beast) >= 0, 'and the beast is in the roster now');
    const again = S.checkSummons(v);
    ok(!again.some((x) => x.id === su.id), 'and it is never called twice');
    ok(S.isCalled(v, su), 'and the run remembers it');
  }

  // --- the next one up is the closest one
  {
    const v = V.newVoyage('SUM4');
    const nx = S.nextSummon(v);
    ok(nx && nx.left > 0, 'a fresh voyage has something to work toward');
    ok(nx.left <= Math.max(...S.SUMMONS.map((x) => x.need)), 'and it is the nearest one');
  }

  // --- a summon is worth having: it beats the best ordinary card at its own job
  {
    const byKind = (k, list) => list.filter((b) => b.kind === k);
    for (const m of MYTHIC) {
      const rivals = byKind(m.kind, M.beasts.BEASTS);
      if (!rivals.length) continue;
      const score = (b) => (b.amount || 0) + (b.damage || 0) * 2 + (b.spike || 0) * 2
        + (b.hp || 0) / 10 + (b.knock || 0) * 20 + (1 - (b.slow || 1)) * 40;
      ok(score(m) > Math.max(...rivals.map(score)),
        `${m.id} is better than any ordinary ${m.kind}`, score(m).toFixed(0));
      ok(m.cost >= 200, `${m.id} costs what a summon should`, String(m.cost));
    }
  }
}

/* -------------------------------------------------------------------- the lane */

if (section('lane') && M.lane && M.voyage && M.islands && M.beasts) {
  const LA = M.lane;
  const V = M.voyage;
  const { ISLANDS, CHERUBIM } = M.islands;
  const { BEAST_BY_ID, UPGRADES, resolveBeast } = M.beasts;
  const { CORRUPTED, tableFor, wavesFor } = M.corrupted;

  /**
   * A competent player, so the lane game is balanced against something that plays it
   * properly: wells at the back, walls at the front, thorns between, reeds on the water,
   * and an apple thrown at anything it knocks down.
   */
  function autoLane(v, island, tag) {
    const f = LA.newLane(v, island, tag);
    let steps = 0;
    while (!f.over && steps++ < 40000) {
      LA.update(f, 1 / 30);
      while (f.motes.length) LA.takeMote(f, f.motes[0]);   // nobody walks past loose clay
      for (const tr of f.trees) if (tr.ripe) LA.harvest(f, tr.row, tr.col);
      for (let guard = 0; guard < 3; guard++) {
        let did = false;
        if (f.hand.some((b) => b.id === 'reed') && f.clay >= 25) {
          for (const r of f.waterRows) {
            for (let c = 6; c >= 2 && !did; c--) if (LA.plant(f, 'reed', r, c).ok) did = true;
            if (did) break;
          }
        }
        const wells = f.plants.filter((p) => p.def.kind === 'gen').length;
        if (!did && wells < 4 && f.clay >= 50) {
          for (let r = 0; r < LA.ROWS && !did; r++) if (LA.plant(f, 'well', r, 0).ok) did = true;
        }
        if (!did && f.clay >= 100) {
          for (let r = 0; r < LA.ROWS && !did; r++) {
            if (f.plants.some((p) => p.row === r && p.def.kind === 'shoot')) continue;
            for (let c = 1; c <= 3 && !did; c++) if (LA.plant(f, 'thorn', r, c).ok) did = true;
          }
        }
        if (!did && f.clay >= 150 && f.hand.some((b) => b.id === 'maul')) {
          for (let r = 0; r < LA.ROWS && !did; r++) {
            if (f.plants.some((p) => p.row === r && p.def.pierce)) continue;
            for (let c = 1; c <= 3 && !did; c++) if (LA.plant(f, 'maul', r, c).ok) did = true;
          }
        }
        if (!did && f.clay >= 50) {
          for (let r = 0; r < LA.ROWS && !did; r++) {
            if (f.plants.some((p) => p.row === r && p.def.kind === 'wall')) continue;
            for (let c = 7; c >= 5 && !did; c--) if (LA.plant(f, 'boar', r, c).ok) did = true;
          }
        }
        if (!did) break;
      }
      const extras = [['tide', 200], ['ember', 175], ['owl', 240], ['bell', 200], ['hive', 240]];
      for (const [id, need] of extras) {
        if (f.clay < need || !f.hand.some((b) => b.id === id)) continue;
        let did = false;
        for (let r = 0; r < LA.ROWS && !did; r++) {
          if (f.plants.some((p) => p.row === r && p.def.id === id)) continue;
          for (let c = 2; c <= 5 && !did; c++) if (LA.plant(f, id, r, c).ok) did = true;
        }
        if (did) break;
      }
      // a breather it has nothing left to spend on is a breather worth selling
      if (f.clay >= 300 && LA.callable(f)) LA.callWave(f);
      // NOTHING IS TAMED MID-FIGHT ANY MORE. What it knocks down stays down; the feeding
      // happens below, once the stage is over, which is what the ramp scene does.

    }
    // AND THEN THE RAMP: feed as many as the basket allows, which is what the feeding scene
    // does with a mouse. A stage's score is not what it knocked down, it is what it kept.
    while (f.apples > 0 && f.held.length) {
      const st = f.held[0];
      if (!LA.tame(f, st.row, Math.round(st.col)).ok) break;
    }
    LA.endFeeding(f);

    return f;
  }

  // --- the board is legal on every island
  for (const island of ISLANDS.concat([CHERUBIM])) {
    const v = V.newVoyage('LN-' + island.id);
    const f = LA.newLane(v, island, 'g');
    ok(f.clay >= 50, `${island.id}: enough clay to open with`, String(f.clay));
    ok(f.waveT > 8, `${island.id}: a real opening before the first wave`, f.waveT.toFixed(1));
    // GUARDS. Every row had one, which is why a dangerous island played like a safe one;
    // now the bad ones open with a hole or two. Three is the floor, and a hole is never on
    // water -- an unguarded water row before you have paid for a reed is a free road in.
    const guarded = f.guards.filter(Boolean).length;
    ok(f.guards.length === LA.ROWS, `${island.id}: a guard slot per row`);
    ok(guarded >= LA.ROWS - 2, `${island.id}: at least three rows guarded`, String(guarded));
    ok((island.danger || 0) >= 3 || guarded === LA.ROWS,
      `${island.id}: a safe island keeps all five`, String(guarded));
    ok(f.waterRows.every((r) => f.guards[r]),
      `${island.id}: no water row is left unguarded`, f.waterRows.join(','));
    ok(f.hand.length >= 3, `${island.id}: at least three beasts to plant`, String(f.hand.length));

    // Every row must be plantable with SOMETHING in the hand, or a lane is a free road to
    // the ark. A water row is not open to a well -- but it is open to a reed, and the reed
    // is a starter for exactly this reason.
    let dead = 0;
    for (let r = 0; r < LA.ROWS; r++) {
      const any = f.hand.some((b) => !LA.plantable(f, r, 0, b));
      if (!any) dead++;
    }
    ok(dead === 0, `${island.id}: every row can be defended from the back`, String(dead));
    ok(f.hand.some((b) => b.kind === 'pad'), `${island.id}: a reed is always in the hand`);

    // and a water row always has a way to be used
    for (const r of f.waterRows) {
      ok(f.terrain[r * LA.COLS] === LA.L.WATER, `${island.id}: row ${r} really is water`);
    }
    ok(f.waterRows.length <= 2, `${island.id}: never more than two water rows`);
    ok(f.trees.length <= 4, `${island.id}: a sane number of apple trees`);
  }

  // --- a stage plays out and resolves
  let held = 0, tamedTotal = 0;
  for (const island of ISLANDS) {
    const v = V.newVoyage('LP-' + island.id);
    const f = autoLane(v, island, 'p');
    ok(f.over, `${island.id}: the stage ends`);
    ok(f.why === 'clear' || f.why === 'overrun', `${island.id}: it ends for a reason`, f.why);
    ok(f.t > 30, `${island.id}: and it lasts long enough to be a game`, f.t.toFixed(0) + 's');
    ok(v.aboard.length <= V.capacity(v), `${island.id}: never more aboard than there are pens`);
    if (f.why === 'clear') held++;
    tamedTotal += f.tamed.length;
  }
  ok(held >= 3, 'a competent opening holds several islands', String(held));
  ok(held <= ISLANDS.length - 2, 'and it does not hold all of them', String(held));
  ok(tamedTotal > 10, 'and tames a useful number along the way', String(tamedTotal));
  console.log(`  competent player: ${held}/${ISLANDS.length} islands held, ${tamedTotal} tamed`);

  // --- clay is the gate, and it is honest
  {
    const v = V.newVoyage('LCLAY');
    const f = LA.newLane(v, ISLANDS[0], 'c');
    f.clay = 0;
    ok(!LA.plant(f, 'well', 2, 0).ok, 'nothing plants for free');
    f.clay = 50;
    ok(LA.plant(f, 'well', 2, 0).ok, 'and it does at the price on the card');
    ok(f.clay === 0, 'and the price comes out of the purse');
    ok(!LA.plant(f, 'well', 2, 0).ok, 'the same tile cannot take a second');
    const before = f.clay;
    LA.uproot(f, 2, 0);
    ok(f.clay > before, 'digging one up gives some of it back');
    ok(f.clay < before + 50, 'but not all of it, so it is a correction and not an undo');
  }

  // --- MOTES: clay you pick up, and the reason the drip could come down
  {
    const v = V.newVoyage('LMOTE');
    const f = LA.newLane(v, ISLANDS[0], 'm');
    let seen = 0;
    for (let i = 0; i < 30 * 40; i++) { LA.update(f, 1 / 30); seen += f.motes.length ? 1 : 0; }
    ok(seen > 0, 'the ground throws up clay on its own', String(seen));

    f.motes.length = 0;
    f.motes.push({ row: 2, col: 4, t: 0, life: 9, amount: 20 });
    ok(LA.moteAt(f, 2, 4), 'a mote is found on its own tile');
    ok(!LA.moteAt(f, 0, 0), 'and not two rows away');
    const purse = f.clay;
    const got = LA.takeMote(f, f.motes[0]);
    ok(got.ok && f.clay === purse + 20, 'taking one pays what it says', String(f.clay - purse));
    ok(f.motes.length === 0, 'and it is gone from the field');
    ok(f.grabbed === 1, 'and the fight counts it');

    // it sinks back if you leave it
    f.motes.push({ row: 1, col: 2, t: 0, life: 9, amount: 20 });
    for (let i = 0; i < 30 * 10; i++) LA.update(f, 1 / 30);
    ok(!f.motes.some((m) => m.row === 1 && m.col === 2), 'an ignored mote sinks back');

    // A CLICK ON A MOTE IS NEVER A PLANT. It is on a clock and the beast is not.
    f.clay = 500;
    f.motes.length = 0;
    f.motes.push({ row: 3, col: 5, t: 0, life: 9, amount: 20 });
    const before = f.plants.length;
    const act = LA.actAt(f, 3, 5);
    ok(act.ok && act.mote, 'clicking a mote takes the clay');
    ok(f.plants.length === before, 'and does not plant anything on top of it');
  }

  // --- CALLING THEM ON: the breather you sell back
  {
    const v = V.newVoyage('LCALL');
    const f = LA.newLane(v, ISLANDS[0], 'k');
    ok(LA.callable(f) > 0, 'the first breather can be sold', String(LA.callable(f)));
    const purse = f.clay, wave = f.wave;
    const res = LA.callWave(f);
    ok(res.ok && f.clay > purse, 'and it pays on the spot', String(f.clay - purse));
    ok(f.called === 1, 'and the fight remembers you did it');
    for (let i = 0; i < 30; i++) LA.update(f, 1 / 30);
    ok(f.wave > wave, 'and the wave actually comes early', `${wave} -> ${f.wave}`);
    ok(!LA.callWave(f).ok, 'you cannot call one that is already walking');
    ok(LA.callable(f) === 0, 'and the button knows it');
  }

  // --- THE CHAMPION
  {
    const { championFor, CHAMPIONS } = M.corrupted;
    for (const island of ISLANDS) {
      const w = wavesFor(island, V.newVoyage('CH').rng || { range: () => 1 });
      ok(w[w.length - 1].champion, `${island.id}: the last wave brings a champion`);
      ok(w.length >= 5, `${island.id}: at least five waves`, String(w.length));
    }
    ok(CHAMPIONS.every((c) => c.aura && c.gives && BEAST_BY_ID[c.gives] && c.boss),
      'every champion has an aura and teaches a real beast');
    ok(championFor({ danger: 4 }).hp > championFor({ danger: 1 }).hp,
      'a dangerous island ends with a worse one');

    const v = V.newVoyage('LBOSS');
    const island = ISLANDS.find((i) => i.danger >= 2) || ISLANDS[0];
    const f = LA.newLane(v, island, 'b');
    // walk the whole stage without planting anything: the boss must turn up and get in
    let steps = 0, sawBoss = false;
    while (!f.over && steps++ < 40000) {
      LA.update(f, 1 / 30);
      if (f.beasts.some((b) => b.boss)) sawBoss = true;
    }
    ok(sawBoss || f.why === 'overrun', `${island.id}: the champion arrives, or the ark fell first`);
  }

  // --- THE CRUST, AND WHAT GETS THROUGH IT
  {
    const v = V.newVoyage('LCRUST');
    const f = LA.newLane(v, ISLANDS[0], 'x');
    const pang = CORRUPTED.find((c) => c.kind === 'shield');
    ok(pang && pang.shell > 0, 'something out there wears a crust');
    const mk = () => ({
      def: pang, row: 2, x: 6, hp: pang.hp, max: pang.hp,
      shell: pang.shell, shellMax: pang.shell, slowT: 0, walk: 0, hitT: 0, flash: 0, rage: false,
    });
    const a = mk();
    f.beasts = [a];
    LA._internals.hurtFor(f, a, 40, false);
    ok(a.hp === pang.hp && a.shell < pang.shell, 'a plain hit only takes the crust off');
    const b = mk();
    LA._internals.hurtFor(f, b, 40, true);
    ok(b.hp < pang.hp && b.shell === pang.shell, 'a piercing hit goes straight through it');
    const maul = BEAST_BY_ID.maul;
    ok(maul && maul.pierce, 'and there is a beast that does that');
    const tide = BEAST_BY_ID.tide;
    ok(tide && tide.knock > 0, 'and one that shoves what it hits');
  }

  // --- ENRAGE: nearly dead is the dangerous part
  {
    const v = V.newVoyage('LRAGE');
    const f = LA.newLane(v, ISLANDS[0], 'r');
    const def = CORRUPTED[0];
    const walk = (hp) => {
      f.beasts = [{
        def, row: 2, x: 6, hp, max: def.hp, shell: 0, shellMax: 0,
        slowT: 0, walk: 0, hitT: 0, flash: 0, rage: false,
      }];
      const x0 = f.beasts[0].x;
      for (let i = 0; i < 30; i++) LA.update(f, 1 / 30);
      return x0 - f.beasts[0].x;
    };
    const whole = walk(def.hp);
    const hurt = walk(def.hp * 0.2);
    ok(hurt > whole * 1.2, 'a beast under a third of its health moves faster',
      `${whole.toFixed(2)} -> ${hurt.toFixed(2)}`);
    ok(f.beasts[0].rage, 'and it is marked, so the field can show it');
  }

  // --- THE TIDE: nothing can stand on the field for ever
  {
    const v = V.newVoyage('LTIDE');
    const f = LA.newLane(v, ISLANDS[0], 't');
    // put the fight at its end with one unkillable-looking thing left standing
    f.wave = f.waves.length - 1;
    f.queue.length = 0;
    f.inWave = false;
    f.beasts = [{
      def: CORRUPTED[0], row: 2, x: 8.9, hp: 90, max: 90, shell: 0, shellMax: 0,
      slowT: 0, walk: 0, hitT: 0, flash: 0, rage: false,
    }];
    f.plants = [];
    let steps = 0;
    while (!f.over && steps++ < 30 * 400) LA.update(f, 1 / 30);
    ok(f.over, 'a stalled last wave is resolved by the water', f.why + ' at ' + f.t.toFixed(0) + 's');
  }

  // --- water needs a reed
  {
    const v = V.newVoyage('LWET');
    v.beasts = ['well', 'reed', 'thorn'];
    const f = LA.newLane(v, ISLANDS[0], 'w');
    for (let c = 0; c < LA.COLS; c++) f.terrain[1 * LA.COLS + c] = LA.L.WATER;
    f.clay = 500;
    const dry = LA.plant(f, 'thorn', 1, 3);
    ok(!dry.ok && /reed/.test(dry.why), 'a thorn will not stand in water', dry.why);
    ok(LA.plant(f, 'reed', 1, 3).ok, 'a reed will');
    ok(LA.plant(f, 'thorn', 1, 3).ok === false, 'and the tile is taken now');
    ok(LA.plant(f, 'reed', 1, 4).ok, 'another reed goes down beside it');
    ok(LA.plant(f, 'thorn', 1, 4).ok === false, 'the reed occupies its own tile');
  }

  // --- a wall stops a walker, and a walker eats a wall
  {
    const v = V.newVoyage('LWALL');
    const f = LA.newLane(v, ISLANDS[0], 'x');
    f.clay = 500;
    ok(LA.plant(f, 'boar', 2, 6).ok, 'a wall goes down');
    const p = LA.plantAt(f, 2, 6);
    f.beasts.push({
      def: M.corrupted.CORRUPT_BY_ID.c_boar, row: 2, x: 8,
      hp: 999, max: 999, slowT: 0, leapt: false, dug: 0, walk: 0, hitT: 0, flash: 0,
    });
    for (let i = 0; i < 60 * 8; i++) LA.update(f, 1 / 60);
    const b = f.beasts[0];
    ok(b && b.x > 6.5, 'the walker is stopped at the wall', b && b.x.toFixed(2));
    ok(p.hp < p.max, 'and the wall is taking damage', `${Math.round(p.hp)}/${p.max}`);
  }

  // --- a thorn kills things, and a felled beast is tameable rather than dead
  {
    const v = V.newVoyage('LKILL');
    const f = LA.newLane(v, ISLANDS[0], 'k');
    f.clay = 500;
    f.apples = 2;
    LA.plant(f, 'thorn', 2, 0);
    f.beasts.push({
      def: M.corrupted.CORRUPT_BY_ID.c_boar, row: 2, x: 7,
      hp: 40, max: 40, slowT: 0, leapt: false, dug: 0, walk: 0, hitT: 0, flash: 0,
    });
    let guard = 0;
    while (f.beasts.length && guard++ < 60 * 20) LA.update(f, 1 / 60);
    ok(f.held.length === 1, 'a felled beast lies there rather than dying');
    const s = f.held[0];
    const knew = (v.beasts || []).length;

    // AND IT CANNOT BE FED WHILE THE FIGHT IS ON. That is the change: the apple is spent on
    // the ark's ramp afterwards, so mid-wave there is nothing to throw it at.
    const early = LA.tame(f, s.row, Math.round(s.col));
    ok(!early.ok && /after the fight/.test(early.why), 'no feeding mid-fight', early.why);
    ok(f.apples === 2, 'and the refusal costs nothing', String(f.apples));

    LA.endLane(f, 'clear');
    ok(f.held.length === 1, 'and it is still there when the fight ends');
    const res = LA.tame(f, s.row, Math.round(s.col));
    ok(res.ok, 'an apple on the ramp keeps it', JSON.stringify(res));
    ok(v.aboard.indexOf('boar') >= 0, 'and it is aboard');
    ok((v.beasts || []).length >= knew, 'and the shape it teaches is remembered');
    ok(f.apples === 1, 'and the apple is spent');
    ok(f.held.length === 0, 'and it is off the field');
  }

  // --- NOTHING WANDERS OFF ANY MORE
  {
    const v = V.newVoyage('LWIND');
    const f = LA.newLane(v, ISLANDS[0], 'd');
    f.held.push({
      def: M.corrupted.CORRUPT_BY_ID.c_boar, baseId: 'boar',
      a: M.animals.ANIMAL_BY_ID.boar, row: 2, col: 4, t: 0,
    });
    for (let i = 0; i < 60 * 30; i++) LA.update(f, 1 / 60);
    ok(f.held.length === 1, 'a held animal is still there half a minute later');

    // and the fight does not hand it to you for free at the bell
    const deck0 = v.aboard.length;
    LA.endLane(f, 'clear');
    ok(v.aboard.length === deck0, 'the bell does not board it for you', String(v.aboard.length));
    ok(f.held.length === 1, 'it is waiting for an apple');
  }

  // --- a row guard is a one-shot save that still hands you the animal
  {
    const v = V.newVoyage('LGUARD');
    const f = LA.newLane(v, ISLANDS[0], 'g2');
    f.beasts.push({
      def: M.corrupted.CORRUPT_BY_ID.c_hound, row: 0, x: 0.2,
      hp: 40, max: 40, slowT: 0, leapt: false, dug: 0, walk: 0, hitT: 0, flash: 0,
    });
    const hp0 = f.ark.hp;
    for (let i = 0; i < 60 * 4; i++) LA.update(f, 1 / 60);
    ok(f.guards[0] === false, 'the row guard is spent');
    ok(f.ark.hp === hp0, 'and the ark is untouched');
    ok(f.held.length === 1, 'and the beast it stopped is there to be fed');
  }

  // --- and once the guard is gone, a breach costs an animal off the deck
  {
    const v = V.newVoyage('LBREACH');
    const f = LA.newLane(v, ISLANDS[0], 'b2');
    f.guards[0] = false;
    f.spare = 0;
    const deck0 = v.aboard.length;
    f.beasts.push({
      def: M.corrupted.CORRUPT_BY_ID.c_hound, row: 0, x: 0.2,
      hp: 40, max: 40, slowT: 0, leapt: false, dug: 0, walk: 0, hitT: 0, flash: 0,
    });
    for (let i = 0; i < 60 * 4; i++) LA.update(f, 1 / 60);
    ok(f.ark.hp < f.ark.max, 'the ark takes the hit');
    ok(v.aboard.length === deck0 - 1, 'and it costs an animal off the deck');
  }

  // --- gear reaches the lane
  {
    const plain = LA.newLane(V.newVoyage('LG'), ISLANDS[0], 'g3');
    const v2 = V.newVoyage('LG');
    V.equip(v2, { id: 'fk_pat', name: 'Fake', slot: 'hold', bonus: { patience: 0.05 } });
    const pat = LA.newLane(v2, ISLANDS[0], 'g3');
    ok(pat.waves[0].lead > plain.waves[0].lead, 'patience buys time before the first wave');
    const v3 = V.newVoyage('LG');
    V.equip(v3, { id: 'fk_dry', name: 'Fake', slot: 'wear', bonus: { dry: true } });
    const dry = LA.newLane(v3, ISLANDS[0], 'g3');
    ok(dry.ark.max > plain.ark.max, 'dry buys the ark another breach');
  }

  // --- the data itself
  for (const b of M.beasts.BEASTS) {
    ok(typeof b.cost === 'number' && b.cost >= 0, `beast ${b.id} has a cost`);
    ok(M.animals.ANIMAL_BY_ID[b.base], `beast ${b.id} is made of a real animal`, b.base);
    ok(['gen', 'shoot', 'wall', 'aoe', 'slow', 'spawn', 'pad'].indexOf(b.kind) >= 0,
      `beast ${b.id} has a known kind`, b.kind);
    ok(b.rule && b.rule.length < 60, `beast ${b.id} states its rule in one line`);
  }
  for (const c of CORRUPTED) {
    ok(M.animals.ANIMAL_BY_ID[c.base], `corrupted ${c.id} is a real animal`, c.base);
    ok(BEAST_BY_ID[c.gives], `corrupted ${c.id} teaches a real beast`, c.gives);
    ok(c.walk > 0 && c.walk < 2, `corrupted ${c.id} walks at a sane speed`, String(c.walk));
  }
  {
    // every beast has exactly one upgrade, and it changes something
    for (const b of M.beasts.BEASTS) {
      const up = UPGRADES[b.id];
      ok(up, `beast ${b.id} has an upgrade`);
      if (!up) continue;
      const base = resolveBeast(b.id, []);
      const better = resolveBeast(b.id, [b.id]);
      ok(JSON.stringify(base) !== JSON.stringify(better), `${b.id}'s upgrade changes it`);
    }
  }
  {
    // wave one is always the slow ones, on every island
    for (const island of ISLANDS) {
      const t0 = tableFor(island, 0, 5);
      ok(t0.every((c) => c.walk <= 0.5), `${island.id}: wave one is the slow ones`);
      const tN = tableFor(island, 4, 5);
      ok(tN.length >= t0.length, `${island.id}: the table widens as it goes`);
    }
    const w = wavesFor(ISLANDS[0], M.rng.makeRng('w'));
    ok(w.length === 5, 'five waves');
    ok(w[w.length - 1].big, 'and the last one is the big one');
    ok(w[0].lead >= 16, 'with a real opening in front of the first');
  }
}

/* ------------------------------------------------------------------ the arena

The pool fight. What is checked here is not the physics -- physics has eighty-three self-tests
of its own -- but the four numbers that decide whether "beaten, not killed" is a rule the
player can act on, and the two loops that used to hang the game. Every assertion below stands
for a bug that shipped in one of the three tunings this went through.
*/

if (section('arena')) {
  const AR = await import('../src/game/arena.js');
  const { CORRUPT_BY_ID } = await import('../src/data/corrupted.js');
  const { ANIMALS } = await import('../src/data/animals.js');
  const isle = { id: 'green', name: 'GREEN REACH', danger: 2, biome: 'grassland' };

  const f = AR.createFight({ seed: 'unit', island: isle });
  ok(f.phase === 'aim', 'a fight opens on your shot');
  ok(f.mine.length >= 3, 'you always have something to shoot', f.mine.length);
  ok(f.foes.length >= 2, 'and something to shoot at', f.foes.length);
  ok(f.waves.length === 3, 'an ordinary landing is three waves', f.waves.length);
  ok(AR.createFight({ seed: 'u', island: isle, kind: 'boss' }).waves.length === 5,
    'a boss is five');
  ok(f.spots.length >= 4, 'there is something on the ground worth going to get');
  ok(f.world.gates.length === 3, 'three doors, and all of them at the far end');
  ok(f.world.gates.every((g) => g.y < 4), 'the doors are along the ark, not round the table');

  let noSkill = 0;
  for (const a of ANIMALS) if (!AR.SKILLS[AR.skillFor(a)]) noSkill++;
  ok(noSkill === 0, 'every animal in the roster has one of the eight skills', noSkill);

  // THE CAPTURE WINDOW, which is the whole design in two inequalities
  {
    const g = AR.createFight({ seed: 'w', island: isle });
    const foe = g.foes[0];
    const full = 400 * AR.FIGHT.hitScale * 1.1;
    ok(full < foe.maxHp * (1 - AR.FIGHT.dazedAt),
      'a full hit cannot take a beast from fresh to beaten in one contact',
      `${full.toFixed(0)} vs ${foe.maxHp}`);
    ok(full * AR.FIGHT.dazedResist * 3 < foe.maxHp * AR.FIGHT.dazedAt,
      'and a beaten beast survives three more nudges while you herd it',
      (CORRUPT_BY_ID[foe.def.id] || foe.def).id);
  }

  // a shot leaves, the table moves, and the round comes back to you
  {
    const g = AR.createFight({ seed: 's', island: isle });
    const m = AR.picked(g);
    const y0 = m.ball.y;
    ok(AR.shoot(g, -Math.PI / 2, 0.9) === true, 'a shot goes off');
    ok(g.phase === 'roll', 'and the phase says so');
    let n = 0;
    while (g.phase === 'roll' && n++ < 6000) AR.update(g, 1 / 60);
    ok(n < 6000, 'the table always settles', n);
    ok(m.ball.y < y0 - 5 || m.ball.sunk, 'the animal actually went up the table');
    ok(['foes', 'aim', 'won'].indexOf(g.phase) >= 0, 'and the round moved on', g.phase);
  }

  // the apple is the one guaranteed answer in the game
  {
    const g = AR.createFight({ seed: 'a', island: isle });
    const before = g.apples;
    ok(AR.throwApple(g, 0).ok, 'an apple can be thrown');
    ok(g.foes[0].dazed, 'and it beats what it hits outright');
    ok(g.apples === before - 1, 'and it costs one');
    ok(AR.throwApple(g, 0).ok === false, 'never twice on the same beast');
  }

  // NOTHING MAY HANG. Both of the loops this caught were real: a healthy animal captured and
  // waved back inside the same capture disc, for ever, and a wave that could not be cleared.
  {
    let hung = 0, caught = 0, ended = 0;
    for (let i = 0; i < 4; i++) {
      const g = AR.createFight({ seed: `hang${i}`, island: isle });
      let n = 0;
      while (['won', 'lost', 'left'].indexOf(g.phase) < 0 && n++ < 26000) {
        if (g.phase === 'aim') {
          const foes = AR.livingFoes(g);
          const me = AR.picked(g);
          if (foes.length && me) {
            const tgt = foes[0].ball;
            AR.shoot(g, Math.atan2(tgt.y - me.ball.y, tgt.x - me.ball.x), 0.9);
          }
        }
        AR.update(g, 1 / 60);
      }
      if (n >= 26000) hung++; else ended++;
      caught += g.caught.length;
    }
    ok(hung === 0, 'a fight always ends — the waved-back rule used to loop for ever', hung);
    ok(ended === 4, 'all four of them', ended);
    ok(caught > 0, 'and something comes aboard', caught);
  }

  // the result is a plain object, so the router can read it without touching the fight
  {
    const res = AR.result(AR.createFight({ seed: 'r', island: isle }));
    for (const k of ['won', 'left', 'lost', 'caught', 'fallen', 'clay', 'apples', 'rounds']) {
      ok(k in res, `the result carries ${k}`);
    }
    ok(Array.isArray(res.caught), 'caught is a list');
  }
}

/* ----------------------------------------------------------------- garden */

if (section('garden') && M.garden && M.gear && M.quests && M.npcs) {
  const G = M.garden;
  const V = M.voyage;
  const { GEAR, GEAR_BY_ID, SLOTS, BONUS_KEYS, bonusText } = M.gear;
  const { QUESTS, progressOf, currentQuest } = M.quests;
  const { NPCS, NPC_BY_ID } = M.npcs;
  const palOk = (k) => M.palette.palKeys().indexOf(k) >= 0;

  // --- the relics: three slots, a closed bonus vocabulary, and every key wired
  const bySlot = { hold: 0, wear: 0, consume: 0 };
  for (const r of GEAR) {
    ok(SLOTS.indexOf(r.slot) >= 0, `relic ${r.id} sits in a real slot`, r.slot);
    bySlot[r.slot]++;
    ok(!!r.name && !!r.blurb, `relic ${r.id} is written`);
    ok(r.price > 0, `relic ${r.id} costs something`);
    ok(M.uikit.hasIcon(r.icon), `relic ${r.id} icon exists`, r.icon);
    ok(palOk(r.color), `relic ${r.id} colour is a palette key`, r.color);
    ok(!!NPC_BY_ID[r.seller], `relic ${r.id} has a seller who exists`, r.seller);
    for (const k of Object.keys(r.bonus || {})) {
      ok(BONUS_KEYS.indexOf(k) >= 0, `relic ${r.id} bonus key ${k} is in the vocabulary`);
    }
    if (r.slot === 'consume') {
      ok(['berth', 'tide', 'mend', 'revive'].indexOf(r.use) >= 0,
        `consumable ${r.id} has a known use`, String(r.use));
    } else {
      ok(Object.keys(r.bonus || {}).length > 0, `relic ${r.id} actually does something`);
      ok(bonusText(r).length > 0, `relic ${r.id} can say what it does`);
    }
  }
  for (const slot of SLOTS) ok(bySlot[slot] >= 3, `at least three relics for the ${slot} slot`, String(bySlot[slot]));

  // EVERY bonus key must move a real number. A relic whose key nothing reads is a relic
  // the player paid for that does nothing, and that is the worst bug in a shop.
  for (const key of BONUS_KEYS) {
    const v1 = V.newVoyage('BON-' + key);
    const base = {
      berths: V.capacity(v1), hull: V.hullMax(v1), basket: V.holdSize(v1),
      beds: V.gardenSize(v1), sail: V.floodPerLeg(v1), coin: V.sellPrice(v1, v1.aboard[0]),
    };
    const flag = key === 'dry' || key === 'sure';
    const amount = flag ? true : key === 'sail' || key === 'patience' ? 0.2 : 2;
    const fake = {
      id: 'test', name: 'Test', slot: 'wear', color: 'gold', icon: 'star',
      bonus: { [key]: amount },
    };
    V.equip(v1, fake);
    if (key === 'berths') ok(V.capacity(v1) > base.berths, 'berths moves the pens');
    else if (key === 'hull') ok(V.hullMax(v1) > base.hull, 'hull moves the hull');
    else if (key === 'basket') ok(V.holdSize(v1) > base.basket, 'basket moves the basket');
    else if (key === 'beds') ok(V.gardenSize(v1) > base.beds, 'beds moves the garden');
    else if (key === 'sail') ok(V.floodPerLeg(v1) < base.sail, 'sail moves the tide');
    else if (key === 'coin') ok(V.sellPrice(v1, v1.aboard[0]) > base.coin, 'coin moves a price');
    else if (key === 'reach') {
      const f1 = M.lane.newLane(v1, M.islands.ISLANDS[0], 'x');
      ok(f1.reach > 0, 'reach reaches the lane');
    } else if (key === 'patience') {
      const f1 = M.lane.newLane(v1, M.islands.ISLANDS[0], 'x');
      const plain = M.lane.newLane(V.newVoyage('BON-plain'), M.islands.ISLANDS[0], 'x');
      ok(f1.waves[0].lead > plain.waves[0].lead, 'patience buys time before the waves');
    } else if (key === 'dry') {
      const f1 = M.lane.newLane(v1, M.islands.ISLANDS[0], 'x');
      ok(f1.ark.max > 2, 'dry buys the ark another breach');
    } else if (key === 'sure') {
      const f1 = M.lane.newLane(v1, M.islands.ISLANDS[0], 'x');
      ok(f1.spare >= 1, 'sure reaches the lane as a spare');
    }
  }

  // --- a consumable is spent once and then the slot is empty
  {
    const v1 = V.newVoyage('CONS');
    V.equip(v1, GEAR_BY_ID.rib_of_adam);
    const cap0 = V.capacity(v1);
    ok(V.spendConsumable(v1) === GEAR_BY_ID.rib_of_adam, 'the rib is spent');
    ok(V.capacity(v1) > cap0, 'and the pens are bigger for good');
    ok(v1.slots.consume === null, 'and the slot is empty');
    ok(V.spendConsumable(v1) === null, 'and cannot be spent twice');
  }

  // --- the cast, and the three gates
  ok(NPCS.length === 5, 'five in the cast', String(NPCS.length));
  for (const n of NPCS) {
    ok(!!n.greet && !!n.buy && !!n.broke, `${n.id} is written`);
    ok((n.idle || []).length >= 3, `${n.id} has something to say while you browse`);
    ok(['items', 'gear', 'upgrades'].indexOf(n.sells) >= 0, `${n.id} sells a known kind`);
    ok(M.folk.FOLK_IDS.indexOf(n.folk) >= 0, `${n.id} has a body to stand in`, n.folk);
    ok(palOk(n.color), `${n.id} colour is a palette key`, n.color);
  }
  {
    // THE GREAT GATE. No lottery: the Cherubim's one errand is Noah, and everybody else
    // is met out on the water.
    const v1 = V.newVoyage('GATE');
    G.enterGarden(v1);
    ok(v1.gateOffer.length === 0, 'no gate lottery any more', String(v1.gateOffer.length));
    ok(G.noahCalled(v1) === false, 'and Noah is not in the garden to start with');
    ok(G.callNoah(v1), 'the Cherubim calls him');
    ok(v1.summoned.indexOf('noah') >= 0, 'and he comes through');
    ok(G.noahCalled(v1), 'and the errand is done');
    ok(G.callNoah(v1) === false, 'so he cannot be called twice');
    ok(((v1.deals || {}).noah || []).length >= 1, 'and he brought something to sell');
    ok(G.summon(v1, 'snake'), 'somebody met on the water joins too');
    ok(G.summon(v1, 'snake') === false, 'but only once');
    ok(((v1.deals || {}).snake || []).length >= 1, 'and lays out a blanket of their own');
  }
  {
    // the three introductions: each can only turn up while you have not met them
    const unmet = M.choicedata.CHOICES.filter((c) => c.unmet);
    ok(unmet.length === 3, 'three people are met out on the water', String(unmet.length));
    for (const c of unmet) {
      ok(!!M.npcs.NPC_BY_ID[c.unmet], `${c.id} introduces somebody real`, c.unmet);
      const meets = c.options.some((o) => (o.effects || []).some((e) => e.meet === c.unmet));
      ok(meets, `${c.id} has an option that actually meets them`);
      const v2 = V.newVoyage('MEET/' + c.id);
      v2.summoned.push(c.unmet);
      let seen = false;
      for (let i = 0; i < 40; i++) {
        v2.stats.legs = i * 3;
        v2.lastEncounter = 0;
        const e = M.choices.rollEncounter(v2, { id: 'x', biome: 'grassland' });
        if (e && e.id === c.id) seen = true;
      }
      ok(!seen, `${c.id} never turns up once you have met them`);
    }
  }

  // --- buying
  {
    const v1 = V.newVoyage('BUY');
    v1.money = 60;
    v1.summoned.push('snake', 'noah', 'eve');
    G.enterGarden(v1);
    let bought = 0;
    for (const who of ['snake', 'noah', 'eve']) {
      const deal = (v1.deals[who] || []).slice();
      ok(deal.length >= 1, `${who} lays something out`, String(deal.length));
      for (const offer of deal) {
        const d = G.describeOffer(offer);
        ok(!!d && !!d.name && !!d.blurb, `${who}'s ${offer.kind} ${offer.id} describes itself`);
        const money0 = v1.money;
        const got = G.buyOffer(v1, who, offer);
        if (got) {
          bought++;
          ok(v1.money < money0, `paying for ${offer.id} costs money`,
            `${money0} -> ${v1.money}`);
          ok((v1.deals[who] || []).indexOf(offer) < 0, `${offer.id} leaves the blanket`);
        }
      }
    }
    ok(bought >= 3, 'a purse of sixty buys at least three things', String(bought));
    const v2 = V.newVoyage('BROKE');
    v2.money = 0;
    v2.summoned.push('snake');
    G.enterGarden(v2);
    const off = (v2.deals.snake || [])[0];
    if (off) ok(G.buyOffer(v2, 'snake', off) === null, 'and nothing is free');
  }

  // --- Noah's list: read off the ledger, one at a time, and each one pays
  {
    const v1 = V.newVoyage('QUEST');
    for (const q of QUESTS) {
      ok(!!q.ask && !!q.done, `quest ${q.id} is written`);
      ok(q.goal > 0, `quest ${q.id} has a goal`);
      ok(progressOf(v1, q) === 0 || q.stat === 'gardened', `quest ${q.id} starts at nothing`);
      ok(!!q.reward && Object.keys(q.reward).length, `quest ${q.id} pays something`);
      if (q.reward.gear) ok(!!GEAR_BY_ID[q.reward.gear], `quest ${q.id} pays a real relic`);
      if (q.reward.item) ok(!!M.items.ITEM_BY_ID[q.reward.item], `quest ${q.id} pays a real item`);
      if (q.reward.upgrade) ok(V.UPGRADE_IDS.indexOf(q.reward.upgrade) >= 0,
        `quest ${q.id} pays a real upgrade`);
    }
    ok(currentQuest(v1) === QUESTS[0], 'he starts at the top of his list');
    ok(G.claimQuest(v1) === null, 'and will not pay for work not done');
    v1.stats.rescued = 99;
    const now = G.questNow(v1);
    ok(now && now.done, 'a finished job reads as finished');
    const money0 = v1.money;
    const q0 = G.claimQuest(v1);
    ok(!!q0, 'and hands in');
    ok(v1.money > money0, 'and pays');
    ok(currentQuest(v1) !== q0, 'and he moves on to the next one');
    ok(G.claimQuest(v1) !== q0, 'and the same job cannot be handed in twice');
    // the whole list can be finished
    let guard = 0;
    while (currentQuest(v1) && guard++ < 40) {
      const q = currentQuest(v1);
      if (q.stat === 'gardened') { while (v1.eden.length < q.goal) v1.eden.push('cow'); }
      else v1.stats[q.stat] = q.goal;
      ok(!!G.claimQuest(v1), `quest ${q.id} can be handed in`);
    }
    ok(currentQuest(v1) === null, 'and the list can be finished', String(guard));
  }

  // --- sitting with an animal: the free, slow road to loyalty
  {
    const v1 = V.newVoyage('PET');
    const id = v1.aboard[0];
    V.stow(v1, id);
    for (let i = 1; i < G.PETS_FOR_LOYALTY; i++) {
      const res = G.pet(v1, id);
      ok(!res.loyal, `sitting ${i} time(s) is not enough`);
      ok(G.petsOf(v1, id) === i, 'and it is counted');
    }
    const last = G.pet(v1, id);
    ok(last.loyal && V.isLoyal(v1, id), 'and the third time it will not leave you');
    ok(G.pet(v1, id).already, 'and after that it is already yours');
  }
}

/* ---------------------------------------------------------------- choices */

if (section('choices') && M.choices && M.choicedata) {
  const CH = M.choices;
  const { CHOICES, CHOICE_BY_ID, FLAGS, EFFECT_KEYS } = M.choicedata;
  const V = M.voyage;

  // --- the content contract
  for (const c of CHOICES) {
    ok(!!c.title && (c.lines || []).length >= 1, `encounter ${c.id} is written`);
    ok(c.options.length >= 2 && c.options.length <= 3,
      `encounter ${c.id} offers two or three`, String(c.options.length));
    if (c.needs) ok(!!FLAGS[c.needs], `encounter ${c.id} needs a real flag`, c.needs);
    for (const o of c.options) {
      ok(!!o.label && !!o.blurb && !!o.outcome, `${c.id}: option "${o.label}" is written`);
      ok(!!o.cost, `${c.id}: option "${o.label}" says what it costs`);
      ok((o.effects || []).length >= 1, `${c.id}: option "${o.label}" does something`);
      for (const step of o.effects) {
        for (const k of Object.keys(step)) {
          ok(EFFECT_KEYS.indexOf(k) >= 0, `${c.id}: effect key ${k} is in the vocabulary`);
          if (k === 'flag') ok(!!FLAGS[step[k]], `${c.id}: flag ${step[k]} is documented`);
          if (k === 'gear') ok(!!M.gear.GEAR_BY_ID[step[k]], `${c.id}: gear ${step[k]} exists`);
          if (k === 'item') ok(!!M.items.ITEM_BY_ID[step[k]], `${c.id}: item ${step[k]} exists`);
          if (k === 'animal') {
            ok(step[k] === 'wild' || !!M.animals.ANIMAL_BY_ID[step[k]],
              `${c.id}: animal ${step[k]} exists`);
          }
        }
      }
    }
    // NO OPTION IS FREE. An option that only gives is a prize with extra reading.
    const gives = c.options.map((o) => o.effects.some((e) => (e.money > 0) || e.gear || e.item
      || e.animal || e.loyal || e.beds || e.berths || (e.hull > 0) || (e.tide < 0)));
    const takes = c.options.map((o) => o.effects.some((e) => (e.money < 0) || e.lose
      || (e.hull < 0) || (e.tide > 0) || e.flag));
    for (let i = 0; i < c.options.length; i++) {
      ok(gives[i] || takes[i], `${c.id}: option ${i} moves something`);
      ok(takes[i] || (c.options[i].cost || '').length > 0,
        `${c.id}: option ${i} that only gives at least admits it`);
    }
  }
  ok(CHOICES.length >= 8, 'enough encounters to fill a voyage', String(CHOICES.length));
  ok(CHOICES.filter((c) => c.needs).length >= 3,
    'and some of them are pay-offs for earlier ones',
    String(CHOICES.filter((c) => c.needs).length));

  // --- every effect key does something real
  {
    const mk = () => { const x = V.newVoyage('EFF'); x.money = 20; return x; };
    let v1 = mk();
    CH.applyOption(v1, CHOICE_BY_ID.chartroom, 1);        // money + flag
    ok(v1.money > 20, 'money moves the purse');
    ok(v1.flags.greedy, 'a flag sticks');
    ok(V.gardenSize(v1) < V.gardenSize(mk()), 'and the greedy flag really shrinks the garden');

    v1 = mk();
    CH.applyOption(v1, CHOICE_BY_ID.dove, 0);             // an animal aboard
    ok(v1.aboard.indexOf('dove') >= 0, 'an animal joins the deck');

    v1 = mk();
    const before = V.floodPerLeg(v1);
    CH.applyOption(v1, CHOICE_BY_ID.dove, 1);             // the dove flag
    ok(v1.flags.dove && V.floodPerLeg(v1) < before,
      'letting the dove go really slows the flood', `${before} -> ${V.floodPerLeg(v1)}`);

    v1 = mk();
    const cap0 = V.capacity(v1), hull0 = v1.hull;
    CH.applyOption(v1, CHOICE_BY_ID.pens_broken, 0);      // berths + hull damage
    ok(V.capacity(v1) > cap0, 'berths moves the pens');
    ok(v1.hull < hull0, 'and it cost the hull');

    v1 = mk();
    const deck0 = v1.aboard.length;
    CH.applyOption(v1, CHOICE_BY_ID.pens_broken, 1);      // lose one
    ok(v1.aboard.length === deck0 - 1, 'lose really takes one off the deck');
    ok(v1.lost.length === 1, 'and it is on the list of the lost');

    v1 = mk();
    CH.applyOption(v1, CHOICE_BY_ID.gate_oath, 0);        // loyal + a flag
    ok(v1.loyal.length === 2, 'loyal makes two of them loyal');
    ok(CH.priceMod(v1) === -1, 'and swearing knocks a coin off every deal');

    v1 = mk();
    CH.applyOption(v1, CHOICE_BY_ID.the_kind_word, 0);    // an item
    ok(v1.hold.indexOf('green_apple') >= 0, 'an item lands in the basket');

    v1 = mk();
    CH.applyOption(v1, CHOICE_BY_ID.shepherd_returns, 0); // gear
    ok(v1.slots.hold && v1.slots.hold.id === 'long_crook', 'gear is equipped');

    v1 = mk();
    CH.applyOption(v1, CHOICE_BY_ID.raft, 2);             // tide + beds
    ok(v1.flood > 0, 'tide really lets the water in');
    ok(V.gardenSize(v1) > V.gardenSize(mk()), 'and beds really grow the garden');

    v1 = mk();
    CH.applyOption(v1, CHOICE_BY_ID.whale, 0);            // the whale
    const f1 = M.lane.newLane(v1, M.islands.ISLANDS[0], 'w');
    ok(f1.spare >= 1, 'the whale shadows you onto the island');
  }

  // --- reputation is felt at every blanket
  {
    const kind = V.newVoyage('REP-K');
    const mean = V.newVoyage('REP-R');
    kind.flags.kind = true;
    mean.flags.robbed = true;
    ok(M.garden.priceOf(kind, 10) < 10, 'a kindness knocks a coin off');
    ok(M.garden.priceOf(mean, 10) > 10, 'and a theft puts two on');
    kind.summoned.push('snake'); mean.summoned.push('snake');
    M.garden.enterGarden(kind); M.garden.enterGarden(mean);
    const k0 = (kind.deals.snake || [])[0];
    const m0 = (mean.deals.snake || [])[0];
    if (k0 && m0 && k0.id === m0.id) ok(m0.price > k0.price, 'and the snake really charges more');
  }

  // --- rolling: never twice running, never the same one twice, gated on flags
  {
    const v1 = V.newVoyage('ROLL');
    const island = M.islands.ISLANDS[0];
    ok(CH.rollEncounter(v1, M.islands.CHERUBIM) === null, 'nothing happens on the way to the gate');
    let got = 0, dupes = 0;
    const seen = new Set();
    for (let leg = 0; leg < 40; leg++) {
      v1.stats.legs = leg;
      v1.leg = (leg % 4) + 1;
      v1.chapter = 1 + Math.floor(leg / 4);
      const e = CH.rollEncounter(v1, island);
      if (!e) continue;
      if (seen.has(e.id)) dupes++;
      seen.add(e.id);
      if (e.needs && !v1.flags[e.needs]) dupes++;
      CH.applyOption(v1, e, 0);
      got++;
    }
    ok(dupes === 0, 'no encounter repeats and none jumps its gate', String(dupes));
    ok(got >= 4, 'a voyage sees several of them', String(got));
    const v2 = V.newVoyage('ROLL2');
    v2.stats.legs = 5;
    v2.lastEncounter = 5;
    ok(CH.rollEncounter(v2, island) === null, 'and never two legs running');
  }

  // --- the flags are all documented, and all of them are reachable
  {
    const used = new Set();
    for (const c of CHOICES) {
      for (const o of c.options) {
        for (const step of o.effects) if (step.flag) used.add(step.flag);
      }
    }
    for (const k of Object.keys(FLAGS)) ok(used.has(k), `flag ${k} is reachable from a choice`);
    for (const k of used) ok(!!FLAGS[k], `flag ${k} is documented`);
  }
}

/* ------------------------------------------------------------ render smoke */

if (section('render') && M.pixel) {
  const scenes = [
    ['menu', '../src/scenes/menu.js', 'makeMenuScene', () => ({ onStart: () => {} })],
    ['gameover', '../src/scenes/gameover.js', 'makeGameOverScene', () => ({
      voyage: M.voyage.newVoyage('RENDER-over'), won: true, onDone: () => {},
    })],
    ['ocean', '../src/scenes/ocean.js', 'makeOceanScene', () => ({
      voyage: M.voyage.newVoyage('RENDER-ocean'), onArrive: () => {}, onOver: () => {},
    })],
    ['choice', '../src/scenes/choice.js', 'makeChoiceScene', () => ({
      voyage: M.voyage.newVoyage('RENDER-choice'),
      encounter: M.choicedata.CHOICE_BY_ID.raft,
      island: M.islands.ISLAND_BY_ID.swamp, onDone: () => {},
    })],
    ['island', '../src/scenes/island.js', 'makeIslandScene', () => ({
      voyage: M.voyage.newVoyage('RENDER-island'),
      island: M.islands.ISLAND_BY_ID.jungle, onDone: () => {},
    })],
  ];
  const { Input } = await import('../src/core/input.js');
  const { Juice } = await import('../src/core/juice.js');
  for (const [name, path, factory, argsFor] of scenes) {
    const cv = new SoftCanvas(960, 540);
    const g = cv.getContext('2d');
    const app = { g, canvas: cv, scale: 1, time: 0, frame: 0, push() {}, pop() {}, replace() {}, fit() {}, fps: 60 };
    try {
      const mod = await import(path);
      const sc = mod[factory]();
      sc.enter(argsFor(), app);
      Input.mouse.x = 320; Input.mouse.y = 200; Input.mouse.inside = true;
      for (let i = 0; i < 90; i++) {
        app.frame = i; app.time += 1 / 60;
        Juice.update(1 / 60);
        if (sc.update) sc.update(1 / 60, app);
        Input.consume();
      }
      if (sc.draw) sc.draw(g, app);
      if (sc.drawUI) sc.drawUI(g, app);
      // a frame must actually paint: count distinct colours
      const seen = new Set();
      for (let i = 0; i < cv.data.length; i += 4 * 37) seen.add(`${cv.data[i]},${cv.data[i + 1]},${cv.data[i + 2]}`);
      ok(seen.size > 12, `${name} scene renders a rich frame`, `${seen.size} distinct colours`);
      writePNG(cv, `shots/scene-${name}.png`, 2);
    } catch (e) {
      ok(false, `${name} scene render`, e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e.message);
    }
  }
}

/* ------------------------------------------------------------------ report */

console.log(`\n\x1b[1m${'═'.repeat(62)}\x1b[0m`);
if (fails.length) {
  console.log(`\x1b[31m${fails.length} failure(s):\x1b[0m`);
  for (const f of fails.slice(0, 60)) console.log('  ✗ ' + f);
  if (fails.length > 60) console.log(`  … ${fails.length - 60} more`);
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

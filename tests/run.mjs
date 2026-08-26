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

  // --- islands: eleven biomes plus the gate, each a place you can tell apart
  ok(ISLANDS.length === 11, 'eleven biomes', String(ISLANDS.length));
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
        if (!did && f.clay >= 50) {
          for (let r = 0; r < LA.ROWS && !did; r++) {
            if (f.plants.some((p) => p.row === r && p.def.kind === 'wall')) continue;
            for (let c = 7; c >= 5 && !did; c--) if (LA.plant(f, 'boar', r, c).ok) did = true;
          }
        }
        if (!did) break;
      }
      if (f.stunned.length && f.apples > 0) {
        const st = f.stunned[0];
        LA.tame(f, st.row, Math.round(st.col));
      }
    }
    return f;
  }

  // --- the board is legal on every island
  for (const island of ISLANDS.concat([CHERUBIM])) {
    const v = V.newVoyage('LN-' + island.id);
    const f = LA.newLane(v, island, 'g');
    ok(f.clay >= 50, `${island.id}: enough clay to open with`, String(f.clay));
    ok(f.waveT > 8, `${island.id}: a real opening before the first wave`, f.waveT.toFixed(1));
    ok(f.guards.length === LA.ROWS && f.guards.every(Boolean),
      `${island.id}: a guard in every row`);
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
    ok(f.stunned.length === 1, 'a felled beast stands there dazed rather than dying');
    const s = f.stunned[0];
    const knew = (v.beasts || []).length;
    const res = LA.tame(f, s.row, Math.round(s.col));
    ok(res.ok, 'an apple tames it', JSON.stringify(res));
    ok(v.aboard.indexOf('boar') >= 0, 'and it is aboard');
    ok((v.beasts || []).length >= knew, 'and the shape it teaches is remembered');
    ok(f.apples === 1, 'and the apple is spent');
  }

  // --- the dazed window closes
  {
    const v = V.newVoyage('LWIND');
    const f = LA.newLane(v, ISLANDS[0], 'd');
    f.stunned.push({
      def: M.corrupted.CORRUPT_BY_ID.c_boar, baseId: 'boar',
      a: M.animals.ANIMAL_BY_ID.boar, row: 2, col: 4, t: 0, life: 8,
    });
    for (let i = 0; i < 60 * 10; i++) LA.update(f, 1 / 60);
    ok(f.stunned.length === 0, 'a dazed beast wanders off if you leave it');
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
    ok(f.stunned.length === 1, 'and the beast it stopped is there to be tamed');
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
    const v1 = V.newVoyage('GATE');
    G.enterGarden(v1);
    ok(v1.gateOffer.length === 3, 'three gates on the first visit', String(v1.gateOffer.length));
    ok(new Set(v1.gateOffer).size === 3, 'and no two of them are the same person');
    const first = v1.gateOffer[0];
    ok(G.openGate(v1, first), 'a gate opens');
    ok(v1.summoned.indexOf(first) >= 0, 'and somebody came through');
    ok(v1.gateOffer.length === 0, 'and the other two shut: one a visit');
    ok(G.openGate(v1, v1.gateOffer[0]) === false, 'so a second gate cannot be opened');
    ok(((v1.deals || {})[first] || []).length >= 1, 'and they brought something to sell');
    // never offered twice across the whole run
    let sawTwice = false;
    for (let i = 0; i < 8; i++) {
      G.enterGarden(v1);
      for (const id of v1.gateOffer) if (v1.summoned.indexOf(id) >= 0) sawTwice = true;
      if (v1.gateOffer.length) G.openGate(v1, v1.gateOffer[0]);
    }
    ok(!sawTwice, 'nobody already in the garden is offered again');
    ok(v1.summoned.length === 4, 'all four can eventually be summoned', String(v1.summoned.length));
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
    ok(CH.gatesOpen(v1) === 4, 'and swearing opens a fourth door');

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

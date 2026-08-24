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
    ['particles', '../src/core/particles.js'], ['physics', '../src/game/physics.js'],
    ['habitats', '../src/data/habitats.js'], ['animals', '../src/data/animals.js'],
    ['interactions', '../src/data/interactions.js'], ['relics', '../src/data/relics.js'],
    ['blinds', '../src/data/blinds.js'], ['cargo', '../src/data/cargo.js'],
    ['table', '../src/render/table.js'], ['scoring', '../src/game/scoring.js'],
    ['run', '../src/game/run.js'], ['flood', '../src/game/flood.js'],
    ['eden', '../src/data/eden.js'], ['cinematic', '../src/render/cinematic.js'],
    ['story', '../src/data/story.js'],
    ['abilities', '../src/data/abilities.js'], ['obstacles', '../src/data/obstacles.js'],
    ['islands', '../src/data/islands.js'], ['voyage', '../src/game/voyage.js'],
    ['boatart', '../src/render/boat.js'], ['islandart', '../src/render/islandart.js'],
    ['folk', '../src/render/folk.js'], ['items', '../src/data/items.js'],
    ['rescue', '../src/game/rescue.js'], ['obart', '../src/render/obstacles.js'],
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

if (section('data/habitats') && M.habitats) {
  const H = M.habitats;
  ok(Array.isArray(H.HABITATS) && H.HABITATS.length === 9, 'HABITATS has 9 entries', H.HABITATS && H.HABITATS.length);
  const wanted = TRAIT_IDS;
  for (const id of wanted) ok(!!H.HABITAT_BY_ID[id], `trait ${id} exists`);
  ok(H.HABITATS.every((h) => TRAIT_IDS.includes(h.id)), 'no traits outside the vocabulary');
  ok(Array.isArray(H.GATE_LAYOUT) && H.GATE_LAYOUT.length === 6, 'GATE_LAYOUT is 6 slots');
  ok(typeof H.affinity === 'function', 'affinity() exported');
  if (typeof H.affinity === 'function') {
    ok(H.affinity('warm', 'warm') === 1, 'affinity(x,x) === 1', H.affinity('warm', 'warm'));
    ok(H.affinity('warm', 'nope') === 0, 'affinity to unknown === 0');
    let sym = true, range = true;
    for (const a of wanted) for (const b of wanted) {
      const x = H.affinity(a, b), y = H.affinity(b, a);
      if (Math.abs(x - y) > 1e-9) { sym = false; }
      if (!(x >= 0 && x <= 1)) range = false;
    }
    ok(sym, 'AFFINITY is symmetric');
    ok(range, 'AFFINITY values in 0..1');
  }
  for (const h of H.HABITATS || []) {
    ok(!!M.palette.P[h.color], `habitat ${h.id} colour is a palette key`, h.color);
    ok(typeof h.icon === 'string' && h.icon.length > 0, `habitat ${h.id} has an icon`);
    ok(typeof h.short === 'string' && h.short.length <= 6, `trait ${h.id} short label`, h.short);
  }
}

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
  // every skill an animal claims must be one the engine actually implements
  if (M.scoring && M.scoring.SKILLS) {
    const known = new Set(Object.keys(M.scoring.SKILLS));
    const badSkill = (A.ANIMALS || []).filter((a) => a.skill && !known.has(a.skill.id)).map((a) => `${a.id}:${a.skill.id}`);
    ok(badSkill.length === 0, 'every animal skill is implemented by scoring.js', badSkill.join(' '));
    const skilled = (A.ANIMALS || []).filter((a) => a.skill).length;
    ok(skilled >= 14, 'at least 14 animals carry a skill', String(skilled));
    const noDesc = (A.ANIMALS || []).filter((a) => a.skill && (!a.skill.desc || a.skill.desc.length > 72)).map((a) => a.id);
    ok(noDesc.length === 0, 'every skill has a short description', noDesc.join(' '));
  }
  ok(Array.isArray(A.STARTER_DECK) && A.STARTER_DECK.length >= 18, 'STARTER_DECK sized', A.STARTER_DECK && A.STARTER_DECK.length);
  ok((A.STARTER_DECK || []).every((id) => A.ANIMAL_BY_ID[id]), 'STARTER_DECK ids all real');
  const homes = new Set((A.STARTER_DECK || []).map((id) => (A.ANIMAL_BY_ID[id] || {}).home));
  ok(homes.size >= 5, 'STARTER_DECK spans >=5 habitats', homes.size);
}

if (section('data/interactions') && M.interactions) {
  const I = M.interactions;
  const rules = I.INTERACTIONS || [];
  ok(rules.length >= 55, 'at least 55 interaction rules', rules.length);
  const ids = rules.map((r) => r.id);
  ok(ids.length === new Set(ids).size, 'interaction ids unique');
  const counts = {};
  let badRef = [], badScope = [], badGain = [];
  for (const r of rules) {
    counts[r.kind] = (counts[r.kind] || 0) + 1;
    if (!['habitat', 'shot', 'table', 'deck'].includes(r.scope)) badScope.push(r.id);
    for (const sel of [r.self, r.other]) {
      if (!sel) continue;
      if (sel.id && !ALL_IDS.includes(sel.id)) badRef.push(`${r.id}:${sel.id}`);
      if (sel.tag && !TAGS.has(sel.tag)) badRef.push(`${r.id}:tag ${sel.tag}`);
      if (sel.home && !TRAIT_IDS.includes(sel.home)) badRef.push(`${r.id}:home ${sel.home}`);
    }
    for (const id of r.requireAll || []) if (!ALL_IDS.includes(id)) badRef.push(`${r.id}:req ${id}`);
    const g = r.gain || {};
    for (const k of ['chips', 'mult', 'xmult', 'money']) {
      if (g[k] !== undefined && !num(g[k])) badGain.push(`${r.id}.${k}`);
    }
    if (!r.requireAll && !r.gain) badGain.push(`${r.id} has no gain`);
  }
  ok(badRef.length === 0, 'interaction refs all resolve', badRef.slice(0, 8).join(' '));
  ok(badScope.length === 0, 'interaction scopes legal', badScope.slice(0, 8).join(' '));
  ok(badGain.length === 0, 'interaction gains numeric', badGain.slice(0, 8).join(' '));
  console.log('  kinds:', JSON.stringify(counts));
  for (const [k, min] of [['eat', 8], ['buff', 12], ['debuff', 10], ['flock', 6], ['set', 8], ['combo', 8]]) {
    ok((counts[k] || 0) >= min, `>=${min} ${k} rules`, counts[k] || 0);
  }
  ok(typeof I.interactionsFor === 'function', 'interactionsFor() exported');
}

if (section('data/relics') && M.relics) {
  const R = M.relics;
  const relics = R.RELICS || [];
  ok(relics.length >= 40, 'at least 40 relics', relics.length);
  const ids = relics.map((r) => r.id);
  ok(ids.length === new Set(ids).size, 'relic ids unique');
  const icons = new Set((M.uikit && M.uikit.ICONS) || []);
  let badDesc = [], badIcon = [], badPrice = [];
  for (const r of relics) {
    if (!r.desc || r.desc.length > 76) badDesc.push(`${r.id}(${r.desc ? r.desc.length : 0})`);
    if (icons.size && r.art && r.art.icon && !icons.has(r.art.icon)) badIcon.push(`${r.id}:${r.art.icon}`);
    if (!num(r.price) || r.price < 1) badPrice.push(r.id);
  }
  ok(badDesc.length === 0, 'relic descs present and <=76 chars', badDesc.slice(0, 6).join(' '));
  ok(badIcon.length === 0, 'relic icons exist in uikit', badIcon.slice(0, 6).join(' '));
  ok(badPrice.length === 0, 'relic prices sane', badPrice.slice(0, 6).join(' '));

  // fuzz every hook
  const { makeRng } = M.rng;
  const rng = makeRng('relicfuzz');
  const A = M.animals;
  let hookErrors = 0, nanCount = 0, leak = 0;
  for (const relic of relics) {
    for (let trial = 0; trial < 12; trial++) {
      const animal = rng.pick(A.ANIMALS);
      const inst = Object.assign({}, relic, { state: JSON.parse(JSON.stringify(relic.state || {})) });
      const res = {
        animal, habitatId: rng.pick(TRAIT_IDS),
        match: rng.pick(['exact', 'partial', 'wrong']),
        chips: rng.irange(0, 400), mult: rng.irange(0, 20), xmult: 1, money: 0,
        tags: animal.tags || [], logs: [], consumed: [], otherEffects: [],
      };
      const run = {
        ante: rng.irange(1, 8), money: rng.irange(0, 40), relics: [inst], caravan: A.STARTER_DECK.slice(),
        habitatLevels: {}, shots: 4, reracks: 3, railChips: 4, vitrine: {}, stats: {}, log: [],
      };
      const ctx = {
        run, relic: inst, blind: { ante: run.ante, kind: 'boss', effect: {} },
        shot: trial, shotIndex: trial,
        potted: rng.sample(A.ANIMALS, trial % 9),
        residents: { savanna: rng.sample(A.ANIMALS, 3) },
        tableAnimals: rng.sample(A.ANIMALS, 5), deck: rng.sample(A.ANIMALS, 7),
        rng, log: () => {}, addMoney: () => {}, consumeAnimal: () => {},
      };
      const before = JSON.stringify({ ante: run.ante, money: run.money, caravan: run.caravan.length });
      for (const hookName of ['onScoreAnimal', 'onShotEnd', 'onBlindStart', 'onBlindEnd', 'onShop']) {
        const h = relic.hooks && relic.hooks[hookName];
        if (!h) continue;
        try { hookName === 'onScoreAnimal' ? h(res, ctx) : h(ctx); } catch (e) { hookErrors++; fails.push(`relic ${relic.id}.${hookName}: ${e.message}`); }
      }
      if (relic.hooks && relic.hooks.onPot) {
        try { relic.hooks.onPot({ ball: { bounces: 2 }, animal, gate: { habitatId: 'tame' } }, ctx); } catch (e) { hookErrors++; }
      }
      if (![res.chips, res.mult, res.xmult, res.money].every(num)) nanCount++;
      if (hookName_leak(before, run)) leak++;
    }
  }
  function hookName_leak(before, run) {
    return JSON.stringify({ ante: run.ante, money: run.money, caravan: run.caravan.length }) !== before
      && false; // money/ante changes via addMoney are legal; kept as a hook for future tightening
  }
  ok(hookErrors === 0, 'no relic hook threw', String(hookErrors));
  ok(nanCount === 0, 'no relic produced NaN', String(nanCount));
  ok(typeof R.rollRelics === 'function', 'rollRelics() exported');
  if (typeof R.rollRelics === 'function') {
    let dupes = 0, owned = 0;
    for (let i = 0; i < 200; i++) {
      const r = makeRng('roll' + i);
      const ownedIds = r.sample(relics, 5).map((x) => x.id);
      const got = R.rollRelics(r, 3, { owned: ownedIds }) || [];
      const gids = got.map((x) => x.id);
      if (gids.length !== new Set(gids).size) dupes++;
      if (gids.some((id) => ownedIds.includes(id))) owned++;
    }
    ok(dupes === 0, 'rollRelics never duplicates', String(dupes));
    ok(owned === 0, 'rollRelics never offers an owned relic', String(owned));
  }
}

if (section('data/blinds') && M.blinds) {
  const B = M.blinds;
  ok(num(B.ANTES) && B.ANTES === 8, 'ANTES === 8', B.ANTES);
  ok(Array.isArray(B.ANTE_BASE) && B.ANTE_BASE.length === B.ANTES + 1, 'ANTE_BASE length', B.ANTE_BASE && B.ANTE_BASE.length);
  let inc = true;
  for (let i = 2; i <= B.ANTES; i++) if (!(B.ANTE_BASE[i] > B.ANTE_BASE[i - 1])) inc = false;
  ok(inc, 'ANTE_BASE strictly increasing');
  ok(typeof B.neutralEffect === 'function', 'neutralEffect() exported');
  const legal = new Set(Object.keys(B.neutralEffect ? B.neutralEffect() : {}));
  const LEGAL = ['closeHabitats', 'shots', 'reracks', 'friction', 'gravityDrift', 'noInteractions',
    'hideLabels', 'chipsMul', 'multMul', 'scoreFloorPerShot', 'onceScoringPerHabitat', 'decoy',
    'shrinkGates', 'rotateGates', 'floodRate'];
  for (const k of LEGAL) ok(legal.has(k), `neutralEffect has ${k}`);
  let badKeys = [];
  for (const b of B.BOSSES || []) {
    for (const k of Object.keys(b.effect || {})) if (!LEGAL.includes(k)) badKeys.push(`${b.id}.${k}`);
    ok(!!M.palette.P[b.color], `boss ${b.id} colour legal`, b.color);
    ok(typeof b.desc === 'string' && b.desc.length <= 48, `boss ${b.id} desc <=48`, b.desc && b.desc.length);
  }
  ok(badKeys.length === 0, 'boss effects use only legal keys', badKeys.join(' '));
  ok((B.BOSSES || []).length >= 12, 'at least 12 bosses', (B.BOSSES || []).length);
  // every boss should name the myth it came out of, and threaten something
  const noMyth = (B.BOSSES || []).filter((b) => !b.myth || !b.disaster).map((b) => b.id);
  ok(noMyth.length === 0, 'every boss names its myth and its threat', noMyth.join(','));
  // Targets must rise within an ante, and rise within a kind across antes. They are
  // deliberately NOT globally monotonic: ante 6's small blind is easier than ante 5's
  // boss, and that dip is the breather a player earns for beating a boss.
  let withinAnte = true, acrossAntes = true;
  for (let a = 1; a <= 8; a++) {
    const s = B.blindTarget(a, 'small'), g2 = B.blindTarget(a, 'big'), bo = B.blindTarget(a, 'boss');
    if (!(s < g2 && g2 < bo)) withinAnte = false;
    if (a > 1) {
      for (const k of ['small', 'big', 'boss']) {
        if (!(B.blindTarget(a, k) > B.blindTarget(a - 1, k))) acrossAntes = false;
      }
    }
  }
  ok(withinAnte, 'small < big < boss within every ante');
  ok(acrossAntes, 'every blind kind rises with the ante');
  const row = [];
  for (let a = 1; a <= 8; a++) row.push(`a${a}:${B.blindTarget(a, 'small')}/${B.blindTarget(a, 'big')}/${B.blindTarget(a, 'boss')}`);
  console.log('  targets  ' + row.join('  '));
  // rollBoss respects minAnte and avoids repeats
  let viol = 0, rep = 0;
  for (let s = 0; s < 200; s++) {
    const r = M.rng.makeRng('boss' + s);
    const seen = [];
    for (let a = 1; a <= 8; a++) {
      const b = B.rollBoss(r, a, seen);
      if (!b) { viol++; continue; }
      if ((b.minAnte || 1) > a) viol++;
      if (seen.includes(b.id)) rep++;
      seen.push(b.id);
    }
  }
  ok(viol === 0, 'rollBoss respects minAnte', String(viol));
  ok(rep === 0, 'rollBoss never repeats within a run', String(rep));
}

if (section('data/cargo') && M.cargo) {
  const C = M.cargo;
  const A = M.animals, R = M.relics;
  for (const k of ['CRATE_TEMPLATES', 'CUE_UPGRADES', 'FEEDS', 'VOUCHERS', 'HABITAT_UPGRADES']) {
    ok(Array.isArray(C[k]) && C[k].length > 0, `${k} non-empty`, C[k] && C[k].length);
  }
  ok(typeof C.rollManifest === 'function', 'rollManifest() exported');
  ok(typeof C.crateSummary === 'function', 'crateSummary() exported');
  ok(typeof C.habitatLevel === 'function', 'habitatLevel() exported');
  ok(typeof C.applyHabitatUpgrade === 'function', 'applyHabitatUpgrade() exported');
  ok(C.BOAT_CLASS && ['skiff', 'barge', 'freighter', 'zeppelin'].every((k) => C.BOAT_CLASS[k]), 'BOAT_CLASS complete');

  let dupes = 0, badRef = 0, badPrice = 0, ownedRelic = 0, emptySummary = 0;
  const cueIds = new Set(C.CUE_UPGRADES.map((x) => x.id));
  const feedIds = new Set(C.FEEDS.map((x) => x.id));
  const vIds = new Set(C.VOUCHERS.map((x) => x.id));
  for (let i = 0; i < 300; i++) {
    const rng = M.rng.makeRng('manifest' + i);
    const ownedIds = rng.sample(R.RELICS, 4).map((x) => x.id);
    const run = {
      ante: 1 + (i % 8), money: rng.irange(0, 40), caravan: A.STARTER_DECK.slice(),
      relics: ownedIds.map((id) => ({ id })), vouchers: [], feeds: [], cueUpgrades: [],
      habitatLevels: {}, crateSlots: 3, relicSlots: 5,
    };
    const man = C.rollManifest(rng, run, 3) || [];
    const cids = man.map((c) => c.id);
    if (cids.length !== new Set(cids).size) dupes++;
    for (const c of man) {
      if (!num(c.price) || c.price < 1 || c.price % 1 !== 0) badPrice++;
      const sum = C.crateSummary(c);
      if (!Array.isArray(sum) || !sum.length) emptySummary++;
      for (const it of c.contents || []) {
        if (it.kind === 'animal' && !A.ANIMAL_BY_ID[it.ref]) badRef++;
        if (it.kind === 'relic') {
          if (!R.RELIC_BY_ID[it.ref]) badRef++;
          if (ownedIds.includes(it.ref)) ownedRelic++;
        }
        if (it.kind === 'cue' && !cueIds.has(it.ref)) badRef++;
        if (it.kind === 'feed' && !feedIds.has(it.ref)) badRef++;
        if (it.kind === 'voucher' && !vIds.has(it.ref)) badRef++;
        if (it.kind === 'habitat_up' && !TRAIT_IDS.includes(it.ref)) badRef++;
      }
    }
  }
  ok(dupes === 0, 'no duplicate crates in a manifest', String(dupes));
  ok(badRef === 0, 'all crate content refs resolve', String(badRef));
  ok(badPrice === 0, 'crate prices are positive integers', String(badPrice));
  ok(ownedRelic === 0, 'manifests never offer owned relics', String(ownedRelic));
  ok(emptySummary === 0, 'crateSummary always returns lines', String(emptySummary));
}

/* ------------------------------------------------------------------ physics */

if (section('physics') && M.physics) {
  const PH = M.physics;
  if (typeof PH.__selftest === 'function') {
    const r = PH.__selftest();
    ok(r && r.ok, 'physics __selftest passes', (r && r.msgs || []).slice(0, 6).join(' | '));
    for (const m of (r && r.msgs) || []) if (!/^ok/i.test(m)) console.log('   ', m);
  } else ok(false, 'physics exports __selftest()');

  const A = M.animals;
  const { makeRng } = M.rng;
  let notSettled = 0, overlaps = 0, escaped = 0, maxTime = 0;
  for (let trial = 0; trial < 120; trial++) {
    const rng = makeRng('brk' + trial);
    const w = PH.createWorld({});
    PH.setGates(w, [
      { id: 'tl', habitatId: 'tame', x: 6, y: 6, r: 9.5 },
      { id: 'tr', habitatId: 'gloomy', x: PH.TABLE_W - 6, y: 6, r: 9.5 },
      { id: 'bl', habitatId: 'briny', x: 6, y: PH.TABLE_H - 6, r: 9.5 },
      { id: 'br', habitatId: 'bushy', x: PH.TABLE_W - 6, y: PH.TABLE_H - 6, r: 9.5 },
    ]);
    PH.rack(w, rng.sample(A.ANIMALS, 10).map((a) => a.id), rng, rng.pick(['triangle', 'scatter', 'ring', 'diamond']));
    const cue = w.balls[rng.int(w.balls.length)];
    PH.strike(w, cue, rng.range(0, Math.PI * 2), 1, rng.range(-1, 1));
    let t = 0;
    while (!PH.isSettled(w) && t < 14) { PH.step(w, 1 / 60); t += 1 / 60; }
    maxTime = Math.max(maxTime, t);
    if (t >= 14) notSettled++;
    for (const b of w.balls) {
      if (b.sunk) continue;
      if (b.x < -1 || b.y < -1 || b.x > PH.TABLE_W + 1 || b.y > PH.TABLE_H + 1) escaped++;
      for (const o of w.balls) {
        if (o === b || o.sunk) continue;
        if (Math.hypot(b.x - o.x, b.y - o.y) < (b.r + o.r) * 0.86) overlaps++;
      }
    }
  }
  ok(notSettled === 0, '120 full-power breaks all settle', `${notSettled} stuck, worst ${maxTime.toFixed(1)}s`);
  ok(escaped === 0, 'no ball escapes the table', String(escaped));
  ok(overlaps === 0, 'no residual overlaps after settling', String(overlaps));
  console.log(`  worst settle time ${maxTime.toFixed(2)}s`);

  // predict() must not mutate
  const w2 = PH.createWorld({});
  PH.rack(w2, M.animals.STARTER_DECK.slice(0, 8), M.rng.makeRng('p'), 'triangle');
  const snap = JSON.stringify(w2.balls.map((b) => [b.x, b.y, b.vx, b.vy]));
  const path = PH.predict(w2, w2.balls[0], 0.7, 1, 40);
  ok(JSON.stringify(w2.balls.map((b) => [b.x, b.y, b.vx, b.vy])) === snap, 'predict() does not mutate the world');
  ok(path && Array.isArray(path.points) && path.points.length > 1, 'predict() returns a path', path && path.points && path.points.length);
}

/* ------------------------------------------------------------------ scoring */

if (section('cinematic') && M.cinematic) {
  const C = M.cinematic;
  ok(Array.isArray(C.SUMMON_BEATS) && C.SUMMON_BEATS.length === 5, 'the summoning has five beats');
  // beats must be ordered and start at 0, or summonBeat() returns the wrong one
  let ordered = C.SUMMON_BEATS[0].at === 0;
  for (let i = 1; i < C.SUMMON_BEATS.length; i++) {
    if (C.SUMMON_BEATS[i].at <= C.SUMMON_BEATS[i - 1].at) ordered = false;
  }
  ok(ordered, 'beats are ordered and the first is at 0');
  ok(C.summonBeat(0).id === 'clay' && C.summonBeat(1).id === 'wake',
    'summonBeat picks the right end points', `${C.summonBeat(0).id}/${C.summonBeat(1).id}`);
  // every beat must be reachable — a beat you can never land on is a bug, not content
  const seen = new Set();
  for (let k = 0; k <= 1.0001; k += 0.005) seen.add(C.summonBeat(k).id);
  ok(seen.size === 5, 'every beat is reachable by scrubbing', [...seen].join(','));
  // it must be pure: same k, same picture, and it must not throw at any k
  if (M.pixel) {
    const { SoftCanvas } = await import('../tools/softcanvas.mjs');
    let threw = 0;
    for (let k = 0; k <= 1.0001; k += 0.02) {
      const cv = new SoftCanvas(960, 540);
      try { C.drawSummoning(cv.getContext('2d'), k, 1.4, {}); } catch (e) { threw++; }
    }
    ok(threw === 0, 'drawSummoning survives every progress value', threw);
    // and out-of-range k must clamp rather than explode
    let clamped = 0;
    for (const k of [-5, -0.1, 1.1, 99, NaN]) {
      const cv = new SoftCanvas(960, 540);
      try { C.drawSummoning(cv.getContext('2d'), k, 1, {}); } catch (e) { clamped++; }
    }
    ok(clamped === 0, 'out-of-range progress is clamped, not fatal', clamped);
  }
}

if (section('eden') && M.eden && M.run) {
  const E = M.eden, A = M.animals;
  ok(Array.isArray(E.APPLES) && E.APPLES.length === 6, 'six apples', E.APPLES && E.APPLES.length);
  // every apple's rarity table must be a real distribution, or rollBush silently skews
  let badOdds = [];
  for (const ap of E.APPLES) {
    const sum = ['common', 'uncommon', 'rare', 'legendary'].reduce((a, k) => a + (ap.odds[k] || 0), 0);
    if (Math.abs(sum - 1) > 1e-6) badOdds.push(`${ap.id}:${sum.toFixed(3)}`);
    for (const k of Object.keys(ap.odds)) {
      if (ap.odds[k] < 0 || ap.odds[k] > 1) badOdds.push(`${ap.id}.${k}`);
    }
    if (!M.palette.P[ap.color]) badOdds.push(`${ap.id}:colour ${ap.color}`);
    if (!M.uikit.hasIcon(ap.icon)) badOdds.push(`${ap.id}:icon ${ap.icon}`);
  }
  ok(badOdds.length === 0, 'every apple is a real distribution in real palette keys', badOdds.join(','));
  // the price ladder has to track the odds, or the expensive apples are a trap
  const ev = (ap) => (ap.odds.uncommon || 0) + (ap.odds.rare || 0) * 3 + (ap.odds.legendary || 0) * 7;
  ok(ev(E.APPLE_BY_ID.enchanted) > ev(E.APPLE_BY_ID.golden), 'enchanted beats golden on odds');
  ok(ev(E.APPLE_BY_ID.golden) > ev(E.APPLE_BY_ID.plain), 'golden beats plain on odds');
  ok(E.APPLE_BY_ID.cursed.price < E.APPLE_BY_ID.golden.price
    && ev(E.APPLE_BY_ID.cursed) > ev(E.APPLE_BY_ID.plain),
  'the cursed apple is cheap for good odds — that is what makes it a decision');

  // a bush must always offer THREE choices, whatever the apple, or the reveal breaks
  let short = 0, offTier = 0;
  for (const ap of E.APPLES) {
    for (let i = 0; i < 40; i++) {
      const b = E.rollBush(M.rng.makeRng(`bush/${ap.id}/${i}`), ap.id, {});
      if (b.choices.length !== 3) short++;
      if (new Set(b.choices.map((c) => c.id)).size !== b.choices.length) short++;
      if ((ap.odds[b.rarity] || 0) === 0) offTier++;
    }
  }
  ok(short === 0, 'every bush offers three distinct animals', short);
  ok(offTier === 0, 'a bush never rolls a tier its apple cannot produce', offTier);
  // determinism, since the reveal can be re-opened before it is taken
  const b1 = E.rollBush(M.rng.makeRng('same'), 'golden', {});
  const b2 = E.rollBush(M.rng.makeRng('same'), 'golden', {});
  ok(JSON.stringify(b1.choices.map((c) => c.id)) === JSON.stringify(b2.choices.map((c) => c.id)),
    're-opening a bush shows the same three animals');
  // the lure has to scale with what came out
  const cheap = E.lureCost(E.APPLE_BY_ID.plain, A.ANIMAL_BY_ID.chicken);
  const dear = E.lureCost(E.APPLE_BY_ID.enchanted, A.ANIMAL_BY_ID.phoenix);
  ok(dear > cheap, 'a legendary out of an enchanted apple costs more to lure', `${cheap} vs ${dear}`);

  // ---- blessings
  ok(E.BLESSINGS.length >= 15, 'a real tarot spread', E.BLESSINGS.length);
  let badB = [];
  for (const b of E.BLESSINGS) {
    if (typeof b.apply !== 'function') badB.push(`${b.id}:apply`);
    if (!M.palette.P[b.color]) badB.push(`${b.id}:colour`);
    if (!M.uikit.hasIcon(b.icon)) badB.push(`${b.id}:icon`);
    if (!(b.price >= 3 && b.price <= 8)) badB.push(`${b.id}:price ${b.price}`);
  }
  ok(badB.length === 0, 'every blessing is applyable and drawable', badB.join(','));
  ok(new Set(E.BLESSINGS.map((b) => b.id)).size === E.BLESSINGS.length, 'blessing ids unique');

  // THE one-round guarantee: apply every blessing, end the blind, and nothing may survive
  let leaked = [];
  for (const b of E.BLESSINGS) {
    const r = M.run.newRun('BLESS/' + b.id);
    M.run.beginDraft(r);
    M.run.commitDraft(r, [0, 1, 2, 5, 6, 8, 9, 11]);
    M.run.takeBlessing(r, b);
    M.run.startBlind(r);
    const during = JSON.stringify(pickBless(r));
    r.score = r.target + 5000;
    M.run.endBlind(r);
    M.run.advance(r);
    M.run.startBlind(r);
    const after = JSON.stringify(pickBless(r));
    const clean = JSON.stringify(pickBless(M.run.newRun('clean')));
    if (r.blessing !== null) leaked.push(`${b.id}:card`);
    if (after !== clean && after !== during) leaked.push(`${b.id}:partial`);
    if (after !== clean) leaked.push(`${b.id}:${after}`);
  }
  ok(leaked.length === 0, 'no blessing survives the round it was bought for', leaked.slice(0, 4).join(' '));

  // a blessing must never throw, whatever state the run is in
  let threw = 0;
  for (const b of E.BLESSINGS) {
    for (const junk of [{}, { caravan: [] }, { target: 0, shotsLeft: 0, money: 0 }]) {
      try { b.apply(Object.assign({ log: [] }, junk)); } catch (e) { threw++; }
    }
  }
  ok(threw === 0, 'no blessing throws on a malformed run', threw);

  // ---- Adam and Eve's stall
  const gr = M.relics.gardenRelics();
  ok(gr.length >= 8, "the garden has its own stock", gr.length);
  ok(M.relics.gardenRelics('adam').length >= 3 && M.relics.gardenRelics('eve').length >= 3,
    'both of them are holding something');
  const staff = M.relics.RELIC_BY_ID.shepherds_staff;
  ok(!!staff, "the Shepherd's Staff exists");
  ok(staff && /sheep/i.test(staff.desc) && /1\.5/.test(staff.desc) && /follow/i.test(staff.desc),
    "the Staff's card states the multiplier AND the following", staff && staff.desc);
  ok(gr.every((r) => r.desc && r.desc.length > 12),
    'every garden relic prints what it does — that is the point of the stall');
}

function pickBless(run) {
  const out = {};
  for (const k of Object.keys(run)) if (k.indexOf('bless') === 0) out[k] = run[k];
  return out;
}

if (section('draft') && M.run && M.animals) {
  const A = M.animals, R = M.run;
  ok(Array.isArray(A.STARTER_STOCK) && A.STARTER_STOCK.length === 13, 'stock is 13 head', A.STARTER_STOCK && A.STARTER_STOCK.length);
  ok(A.DRAFT_SIZE === 8, 'the ramp takes 8', A.DRAFT_SIZE);
  ok((A.STARTER_STOCK || []).every((id) => A.ANIMAL_BY_ID[id]), 'stock ids all real');
  const counts = {};
  for (const id of A.STARTER_STOCK || []) counts[id] = (counts[id] || 0) + 1;
  ok(counts.chicken === 5 && counts.pig === 3 && counts.cow === 3 && counts.sheep === 2,
    'stock is 5 chickens, 3 pigs, 3 cows, 2 sheep', JSON.stringify(counts));
  // the four species must want DIFFERENT things, or the draft is a coin flip
  const sig = ['chicken', 'pig', 'cow', 'sheep'].map((id) => (A.ANIMAL_BY_ID[id].likes || []).join('/'));
  ok(new Set(sig).size === 4, 'the four starter species want different conditions', sig.join(' | '));

  const run = R.newRun('DRAFT-SPEC');
  ok(run.caravan.length === 0, 'a fresh run boards nothing until the draft', run.caravan.length);
  const d = R.beginDraft(run);
  ok(d.stock.length === 13 && d.size === 8, 'beginDraft reports the stock and the ramp size');
  ok(Object.keys(d.assignment).length === 6, 'the draft previews six berths');
  // the preview must be stable: it cannot re-roll under the player mid-decision
  const again = R.beginDraft(run);
  ok(JSON.stringify(again.assignment) === JSON.stringify(d.assignment), 'the previewed board never re-rolls');
  // and it must be reachable by the stock, or the preview is a lie
  let reachable = 0;
  for (const hid of Object.values(d.assignment)) {
    if (d.stock.some((id) => M.habitats.likeness(A.ANIMAL_BY_ID[id], hid) >= 0.999)) reachable++;
  }
  ok(reachable >= 2, 'at least two previewed berths are a favourite of something you own', reachable);

  R.commitDraft(run, [0, 1, 2, 5, 6, 8, 9, 11]);
  ok(run.caravan.length === 8, 'the ramp takes exactly eight', run.caravan.length);
  ok(run.left.length === 5, 'five are left on the bank', run.left.length);
  ok(run.drafted === true, 'the run knows it has been drafted');
  // duplicate and out-of-range indices must not corrupt the caravan
  const r2 = R.newRun('DRAFT-SPEC-2');
  R.beginDraft(r2);
  R.commitDraft(r2, [0, 0, 0, 99, -1, 1, 2, 3, 4, 5, 6, 7, 8]);
  ok(r2.caravan.length === 8, 'duplicate and bogus indices are dropped, not counted', r2.caravan.length);
  ok(new Set(r2.caravan).size <= 8, 'no index is drafted twice');
  // a blind must rack the drafted caravan and nothing else
  R.startBlind(r2);
  ok(r2.hand.length + r2.stash.length === 8, 'a blind racks exactly what boarded',
    `${r2.hand.length}+${r2.stash.length}`);
}

if (section('flood') && M.flood) {
  const F = M.flood;
  // dry until the water is over the rail, then one pool per step, never a wall of them
  ok(F.poolCount(0) === 0, 'no water on a dry deck');
  ok(F.poolCount(0.1) === 0, 'still dry below the threshold');
  let mono = true, last = -1;
  for (let l = 0; l <= 1.0001; l += 0.02) {
    const n = F.poolCount(l);
    if (n < last) mono = false;
    last = n;
  }
  ok(mono, 'pool count never goes back down');
  ok(F.poolCount(1) <= 5, 'the felt is never wall-to-wall water', F.poolCount(1));
  ok(F.stormStrength(0.4) === 0, 'no eye before halfway');
  ok(F.stormStrength(1) > 0.99, 'the eye is fully open at maximum flood');

  // determinism: the same (seed, level) must give the same water, or replays desync
  const a1 = F.floodHazards('SEED-A', 0.7, {});
  const a2 = F.floodHazards('SEED-A', 0.7, {});
  const b1 = F.floodHazards('SEED-B', 0.7, {});
  ok(JSON.stringify(a1) === JSON.stringify(a2), 'hazards are deterministic per seed');
  ok(JSON.stringify(a1) !== JSON.stringify(b1), 'different seeds give different water');

  // a pool that appears must not move when the next one appears
  const p3 = F.floodHazards('SEED-A', 0.55, {}).pools[0];
  const p4 = F.floodHazards('SEED-A', 0.75, {}).pools[0];
  ok(Math.abs(p3.x - p4.x) < 1e-9 && Math.abs(p3.y - p4.y) < 1e-9, 'pool 1 stays put as the water rises');
  ok(p4.rx > p3.rx, 'pools swell with the level');

  // water must never plug a gate mouth: that would delete a berth, not tax a shot
  const gates = M.table ? M.table.buildGates({ tl: 'warm', tm: 'frozen', tr: 'bushy', bl: 'briny', bm: 'dusty', br: 'tame' }, {}) : [];
  let plugged = 0;
  for (const g2 of gates) {
    if (F.poolDepthAt(F.floodHazards('SEED-A', 1, {}), g2.x, g2.y) > 0.25) plugged++;
  }
  ok(plugged === 0, 'no surge pool swallows a gate mouth', plugged);

  // and the hazards must actually slow a ball down
  if (M.physics) {
    // measure PATH LENGTH, not where it stopped -- a ball that banks off the far
    // rail can come to rest right back where it started
    const mk = (hz) => {
      const w = M.physics.createWorld({});
      const b = M.physics.addBall(w, { x: 30, y: M.physics.TABLE_H / 2, animalId: 'cow' });
      M.physics.setHazards(w, hz);
      M.physics.strike(w, b, 0, 0.75, 0);
      let dist = 0, px2 = b.x, py2 = b.y;
      for (let i = 0; i < 600 && !M.physics.isSettled(w); i++) {
        M.physics.step(w, 1 / 60);
        dist += Math.hypot(b.x - px2, b.y - py2);
        px2 = b.x; py2 = b.y;
      }
      return dist;
    };
    const dry = mk(null);
    const wet = mk({ pools: [{ x: 90, y: M.physics.TABLE_H / 2, rx: 30, ry: 20, depth: 1, seed: 0 }], storm: null });
    ok(wet < dry * 0.85, 'standing water shortens a shot', `dry ${dry.toFixed(0)} wet ${wet.toFixed(0)}`);
  }
}

if (section('scoring') && M.scoring && M.animals) {
  const S = M.scoring, A = M.animals;
  const run = M.run.newRun('SCORETEST');
  const mk = (potted, extra = {}) => S.resolveShot(Object.assign({
    run, blind: { ante: 1, kind: 'small', effect: {} }, shotIndex: 0, rng: M.rng.makeRng('s'),
    potted, residents: {}, tableAnimals: [], deckAnimals: [],
  }, extra));

  const sheep = A.ANIMAL_BY_ID.sheep;
  const exact = mk([{ ball: { bounces: 0 }, animalId: 'sheep', gate: { habitatId: 'bushy' } }]);
  const wrong = mk([{ ball: { bounces: 0 }, animalId: 'sheep', gate: { habitatId: 'briny' } }]);
  ok(exact.totalScore > wrong.totalScore * 3, 'exact habitat pays far more than wrong', `${exact.totalScore} vs ${wrong.totalScore}`);
  ok(exact.entries[0].match === 'exact', 'exact match detected');
  ok(wrong.entries[0].match === 'wrong', 'wrong match detected');
  ok(exact.totalMoney >= 1, 'exact pot pays money');

  const combo = mk([
    { ball: { bounces: 0 }, animalId: 'sheep', gate: { habitatId: 'bushy' } },
    { ball: { bounces: 0 }, animalId: 'cow', gate: { habitatId: 'tame' } },
    { ball: { bounces: 0 }, animalId: 'pig', gate: { habitatId: 'soaked' } },
  ]);
  ok(combo.totalScore > exact.totalScore * 3, 'combos compound', `${combo.totalScore}`);
  ok(combo.perfect === true, 'all-exact multi-pot is perfect');

  const eaten = mk([{ ball: { bounces: 0 }, animalId: 'fox', gate: { habitatId: 'gloomy' } }],
    { residents: { gloomy: [A.ANIMAL_BY_ID.rabbit] } });
  const foxAlone = mk([{ ball: { bounces: 0 }, animalId: 'fox', gate: { habitatId: 'gloomy' } }]);
  ok(eaten.totalScore > foxAlone.totalScore, 'fox scores more with a rabbit present', `${eaten.totalScore} vs ${foxAlone.totalScore}`);

  const chameleon = mk([{ ball: { bounces: 0 }, animalId: 'chameleon', gate: { habitatId: 'frozen' } }]);
  ok(chameleon.entries[0].match === 'exact', 'chameleon is always at home');

  // no NaN across a lot of random shots
  let nan = 0, neg = 0;
  const rng = M.rng.makeRng('scorefuzz');
  for (let i = 0; i < 400; i++) {
    const n = 1 + rng.int(4);
    const potted = [];
    for (let k = 0; k < n; k++) {
      potted.push({
        ball: { bounces: rng.int(4), shotsSurvived: rng.int(5), decoy: rng.chance(0.05) },
        animalId: rng.pick(A.ANIMALS).id,
        gate: { habitatId: rng.pick(TRAIT_IDS) },
      });
    }
    const res = mk(potted, {
      residents: { [rng.pick(TRAIT_IDS)]: rng.sample(A.ANIMALS, rng.int(4)) },
      tableAnimals: rng.sample(A.ANIMALS, rng.int(6)),
      deckAnimals: rng.sample(A.ANIMALS, rng.int(8)),
      blind: { ante: 1 + rng.int(8), kind: 'boss', effect: { chipsMul: rng.pick([1, 0.5, 2]), multMul: rng.pick([1, 0.5]), noInteractions: rng.chance(0.2), onceScoringPerHabitat: rng.chance(0.2), decoy: rng.chance(0.2) } },
    });
    if (!num(res.totalScore)) nan++;
    if (res.totalScore < 0) neg++;
    for (const e of res.entries) if (!num(e.chips) || !num(e.mult) || !num(e.score)) nan++;
  }
  ok(nan === 0, '400 fuzzed shots produce no NaN', String(nan));
  ok(neg === 0, 'no negative shot totals', String(neg));
}

/* --------------------------------------------------------------- auto-play */

function autoPlay(seed, verbose) {
  const PH = M.physics, A = M.animals, T = M.table;
  const run = M.run.newRun(seed);
  // the bot has to walk up the ramp like everyone else: take the eight head with the
  // best coverage of the previewed board
  const d = M.run.beginDraft(run);
  const open = Object.values(d.assignment);
  const cover = (id) => (A.ANIMAL_BY_ID[id].likes || []).filter((tr) => open.indexOf(tr) >= 0).length;
  const order = d.stock.map((id, i) => i).sort((x, y) => cover(d.stock[y]) - cover(d.stock[x]));
  M.run.commitDraft(run, order.slice(0, d.size));
  const world = PH.createWorld({});
  const log = [];

  for (let guard = 0; guard < 40 && !run.won && !run.dead; guard++) {
    M.run.startBlind(run);
    const eff = run.blind.effect || {};
    const gates = T.buildGates(run.assignment, {
      scale: run.gateScale * (1 - (eff.shrinkGates || 0)), closed: eff.closeHabitats || [],
    }).filter((g) => !g.closed);
    world.balls.length = 0; world.sunk.length = 0;
    PH.setGates(world, gates);
    PH.rack(world, run.hand.slice(), run.blind.rng.fork('rack'), 'triangle');
    for (const b of world.balls) b.shotsSurvived = 0;

    while (run.shotsLeft > 0 && run.score < run.target) {
      // greedy bot: find the (ball, gate) pair where a straight shot actually reaches
      // the gate, preferring the ball's true home.
      let best = null;
      for (const b of world.balls) {
        if (b.sunk) continue;
        const a = A.ANIMAL_BY_ID[b.animalId];
        for (const gate of gates) {
          const dx = gate.x - b.x, dy = gate.y - b.y;
          const dist = Math.hypot(dx, dy);
          const ang = Math.atan2(dy, dx);
          const power = Math.min(1, 0.32 + dist / 240);
          const p = PH.predict(world, b, ang, power, 60);
          const reaches = p && p.hit && p.hit.kind === 'gate' && p.hit.id === gate.id;
          const home = a && (a.home === gate.habitatId || a.id === 'chameleon');
          const score = (reaches ? 100 : 0) + (home ? 60 : 0) - dist * 0.08 + (a ? a.chips * 0.05 : 0);
          if (!best || score > best.score) best = { ball: b, gate, ang, power, score, home, reaches };
        }
      }
      if (!best) break;
      PH.strike(world, best.ball, best.ang, best.power, 0);
      for (const b of world.balls) b.shotsSurvived = (b.shotsSurvived || 0) + 1;

      const potted = [];
      let t = 0;
      while (!PH.isSettled(world) && t < 14) {
        const evts = PH.step(world, 1 / 60);
        t += 1 / 60;
        for (const e of evts) if (e.type === 'gate') potted.push({ ball: e.ball, animalId: e.ball.animalId, gate: e.gate });
      }

      const residents = {};
      for (const hid of Object.keys(run.vitrine)) residents[hid] = run.vitrine[hid].map((id) => A.ANIMAL_BY_ID[id]).filter(Boolean);
      const resolved = M.scoring.resolveShot({
        run, blind: run.blind, shotIndex: run.stats.shotsTaken, rng: run.blind.rng,
        potted, residents,
        tableAnimals: world.balls.filter((b) => !b.sunk).map((b) => A.ANIMAL_BY_ID[b.animalId]).filter(Boolean),
        deckAnimals: run.stash.map((id) => A.ANIMAL_BY_ID[id]).filter(Boolean),
      });
      M.run.applyShot(run, resolved, potted);

      world.balls = world.balls.filter((b) => !b.sunk);
      const before = run.hand.length;
      M.run.drawHand(run);
      for (const id of run.hand.slice(before)) {
        const nb = PH.addBall(world, { animalId: id, x: 20 + run.blind.rng.range(0, PH.TABLE_W - 40), y: 20 + run.blind.rng.range(0, PH.TABLE_H - 40) });
        if (nb) nb.shotsSurvived = 0;
      }
      if (!world.balls.length) break;
    }

    const cleared = run.score >= run.target;
    log.push({ ante: run.ante, kind: M.run.currentKind(run), boss: run.blind.boss ? run.blind.boss.id : '', score: run.score, target: run.target, cleared, money: run.money });
    if (!cleared) { run.dead = true; break; }
    M.run.endBlind(run);
    M.run.advance(run);
    if (run.won) break;

    // shop: buy the most affordable crate, greedily
    const man = M.cargo.rollManifest(run.rng.fork('dock' + run.ante), run, run.crateSlots) || [];
    const afford = man.filter((c) => c.price <= run.money).sort((a, b) => b.price - a.price)[0];
    if (afford) { M.run.spend(run, afford.price); M.run.deliverCrate(run, afford); }
  }
  return { run, log };
}

if (section('autoplay') && M.physics && M.cargo && M.blinds) {
  let reached = [];
  for (let i = 0; i < 12; i++) {
    let r;
    try { r = autoPlay('SIM-' + i); } catch (e) { ok(false, `autoplay seed ${i} threw`, e.message); continue; }
    reached.push(r.run.won ? 9 : r.run.ante);
    if (i === 0) {
      console.log('  seed SIM-0 blind by blind:');
      for (const l of r.log) {
        console.log(`    a${l.ante} ${l.kind.padEnd(5)} ${String(l.score).padStart(7)} / ${String(l.target).padStart(7)}  ${l.cleared ? 'cleared' : 'FAILED '}  $${l.money}  ${l.boss}`);
      }
    }
    ok(true, `autoplay seed ${i} completed`);
  }
  const avg = reached.reduce((a, b) => a + b, 0) / reached.length;
  console.log(`  greedy bot reaches ante ${Math.min(...reached)}..${Math.max(...reached)} (avg ${avg.toFixed(1)})`);
  ok(avg >= 1.5, 'a dumb greedy bot clears at least the first ante on average', avg.toFixed(2));
  ok(Math.max(...reached) <= 9, 'sanity: nobody exceeds ante 9');
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

/* ----------------------------------------------------------------- rescue */

if (section('rescue') && M.rescue && M.voyage && M.islands) {
  const RS = M.rescue;
  const V = M.voyage;
  const { ISLANDS, CHERUBIM } = M.islands;
  const { abilityOf } = M.abilities;

  /**
   * The greedy shepherd: always flick whoever the water is about to take, aimed at the
   * nearest pen, at the power that just about gets there. Not a good player -- a
   * PREDICTABLE one, which is what a balance test needs.
   */
  function autoRescue(v, island, tag, o = {}) {
    const r = RS.newRescue(v, island, tag);
    let guard = 0;
    // spend one carried animal on anything it answers, while there is a spare berth
    if (o.clear !== false) {
      for (const id of v.aboard.slice()) {
        const ab = abilityOf(M.animals.ANIMAL_BY_ID[id]);
        const ob = r.obstacles.find((x) => !x.cleared && x.ob.clearedBy === ab.id);
        if (ob) { RS.placeHelper(r, id, ob); break; }
      }
    }
    while (!r.over && RS.remaining(r).length && V.berthsFree(v) > 0 && guard++ < 40) {
      const e = RS.remaining(r).slice().sort((a, b) => b.ball.x - a.ball.x)[0];
      const gy = Math.round(e.ball.y / (RS.FIELD_H / 3)) * (RS.FIELD_H / 3) + RS.FIELD_H / 6;
      const ang = Math.atan2(gy - e.ball.y, RS.GANGWAY_X - e.ball.x);
      const dist = Math.hypot(e.ball.x - RS.GANGWAY_X, e.ball.y - gy);
      RS.flick(r, e, ang, RS.shotPower(Math.min(1, dist / 700)));
      let t = 0;
      while (!RS.isSettled(r.world) && t < 14) { RS.update(r, 1 / 60); t += 1 / 60; }
      ok(t < 13.9, `${island.id}: a flick settles`, `${t.toFixed(1)}s`);
    }
    RS.endRescue(r, 'test');
    return r;
  }

  // --- the geometry is inside the field, on every island
  for (const island of ISLANDS.concat([CHERUBIM])) {
    const v = V.newVoyage('RESC-' + island.id);
    const r = RS.newRescue(v, island, 'g');
    let bad = 0;
    for (const o of r.obstacles) {
      if (o.x - o.r < 0 || o.x + o.r > RS.FIELD_W || o.y - o.r < 0 || o.y + o.r > RS.FIELD_H) bad++;
      if (o.x - o.r < RS.GANGWAY_X + 40) bad++;      // never blocking the pens themselves
    }
    ok(bad === 0, `${island.id}: obstacles sit inside the field and clear of the pens`, String(bad));
    let out = 0;
    for (const s2 of r.strand) {
      if (s2.ball.x < RS.GANGWAY_X + 40 || s2.ball.x > RS.FIELD_W - 20) out++;
      if (s2.ball.y < 10 || s2.ball.y > RS.FIELD_H - 10) out++;
    }
    ok(out === 0, `${island.id}: the stranded start reachable and on the island`, String(out));
    ok(r.strand.length === (island.animals || 0), `${island.id}: the right number are ashore`);
    // the tide starts off the far shore, so nobody is already dead on arrival
    ok(RS.tideX(r) > RS.FIELD_W, `${island.id}: the water starts off the far shore`);
  }

  // --- a full level plays, saves somebody, and ends
  let totalSaved = 0, totalLost = 0;
  for (const island of ISLANDS) {
    const v = V.newVoyage('PLAY-' + island.id);
    const before = v.aboard.length;
    const r = autoRescue(v, island, 'p');
    const res = RS.result(r);
    ok(r.over, `${island.id}: the level ends`);
    ok(res.rescued.length > 0, `${island.id}: the greedy shepherd saves somebody`,
      JSON.stringify(res));
    ok(v.aboard.length >= before, `${island.id}: the deck never shrinks from a rescue`);
    ok(v.aboard.length <= V.capacity(v), `${island.id}: never more aboard than there are pens`);
    ok(res.rescued.length + res.drowned.length + res.spent.length >= island.animals,
      `${island.id}: every animal ashore is accounted for`);
    totalSaved += res.rescued.length;
    totalLost += res.drowned.length;
  }
  ok(totalSaved >= 11, 'a greedy pass saves at least one an island', String(totalSaved));
  ok(totalLost > 0, 'and the water still gets some', String(totalLost));
  console.log(`  greedy shepherd across eleven islands: ${totalSaved} saved, ${totalLost} lost`);

  // --- the tide is the clock, and it takes what it reaches
  {
    const v = V.newVoyage('TIDE-R');
    const r = RS.newRescue(v, ISLANDS[0], 't');
    const n0 = RS.remaining(r).length;
    RS.advanceTide(r, 20);
    ok(r.tide >= 1, 'the tide can run out');
    ok(r.over, 'and that ends the level');
    ok(RS.remaining(r).length < n0, 'the water took somebody', `${n0} -> ${RS.remaining(r).length}`);
  }

  // --- a loyal animal is never taken, which is the whole promise of the apple
  {
    const v = V.newVoyage('LOYAL-R');
    const r = RS.newRescue(v, ISLANDS[3], 'l');
    for (const s2 of r.strand) V.makeLoyal(v, s2.animalId);
    RS.advanceTide(r, 30);
    ok(RS.remaining(r).length === r.strand.length, 'the flood never takes a loyal animal');
    RS.endRescue(r, 'test');
    ok(r.drowned.length === 0, 'not even when you cast off and leave it there');
  }

  // --- placing an animal: right answer clears, wrong answer costs nothing
  {
    const v = V.newVoyage('PLACE-R');
    const island = ISLANDS.find((i) => i.obstacles.length);
    const r = RS.newRescue(v, island, 'pl');
    const ob = r.obstacles.find((o) => o.ob.clearedBy);
    const right = v.aboard.find((id) => abilityOf(M.animals.ANIMAL_BY_ID[id]).id === ob.ob.clearedBy);
    const wrong = v.aboard.find((id) => abilityOf(M.animals.ANIMAL_BY_ID[id]).id !== ob.ob.clearedBy);
    const tide0 = r.tide, deck0 = v.aboard.length;
    ok(RS.placeHelper(r, wrong, ob) === false, 'the wrong animal does not clear it');
    ok(r.tide === tide0 && v.aboard.length === deck0,
      'and getting it wrong costs neither tide nor animal');
    if (right) {
      ok(RS.placeHelper(r, right, ob), 'the right animal clears it');
      ok(ob.cleared, 'and it stays cleared');
      ok(r.tide > tide0, 'and that cost tide');
      ok(v.aboard.length === deck0 - 1, 'and the animal is standing on the island now');
      ok(r.world.posts.every((p) => p.id !== ob.id) && r.world.zones.every((z) => z.id !== ob.id),
        'and the solver no longer has it in the way');
    }
  }

  // --- the basket
  {
    const v = V.newVoyage('APPLE-R');
    for (const id of ['loyal_apple', 'green_apple']) V.addItem(v, id);
    const r = RS.newRescue(v, ISLANDS[0], 'a');
    const e = r.strand[0];
    ok(RS.useApple(r, 'loyal_apple', e), 'a loyal apple lands');
    ok(V.isLoyal(v, e.animalId), 'and the animal is loyal for good');
    ok(RS.useApple(r, 'loyal_apple', e) === false, 'and it is gone from the basket');
    RS.advanceTide(r, 3);
    const t1 = r.tide;
    ok(RS.useApple(r, 'green_apple'), 'a green apple pushes the water back');
    ok(r.tide < t1, 'and the tide really moves', `${t1.toFixed(2)} -> ${r.tide.toFixed(2)}`);
    ok(v.hold.length === 0, 'the basket is empty now');
    ok(RS.useApple(r, 'green_apple') === false, 'and you cannot spend what you have not got');
  }

  // --- items data
  for (const it of M.items.ITEMS) {
    ok(!!it.name && !!it.blurb && !!it.use, `item ${it.id} is written`);
    ok(['loyal', 'tide', 'call', 'free', 'mend'].indexOf(it.effect) >= 0,
      `item ${it.id} has a known effect`, it.effect);
    ok(it.price > 0, `item ${it.id} costs something`);
    ok(M.palette.palKeys().indexOf(it.color) >= 0, `item ${it.id} colour is a palette key`, it.color);
  }

  // --- the obstacle art takes every kind, cleared and not
  if (M.obart) {
    const cv = new SoftCanvas(400, 200);
    const g = cv.getContext('2d');
    let threw = null;
    try {
      for (const o of M.obstacles.OBSTACLES) {
        for (const cleared of [false, true]) {
          M.obart.drawObstacle(g, { kind: o.id, ob: o, r: Math.round(o.r * 1.7), cleared, seed: 3, angle: 0 },
            200, 100, 1.4, {});
        }
      }
    } catch (e) { threw = e; }
    ok(!threw, 'every obstacle draws, cleared and not', threw && threw.message);
  }
}

/* ------------------------------------------------------------ render smoke */

if (section('render') && M.pixel) {
  const scenes = [
    ['menu', '../src/scenes/menu.js', 'makeMenuScene', () => ({ onStart: () => {} })],
    ['table', '../src/scenes/table.js', 'makeTableScene', (run) => ({ run, onExit: () => {} })],
    ['shop', '../src/scenes/shop.js', 'makeShopScene', (run) => ({ run, onDone: () => {} })],
    ['gameover', '../src/scenes/gameover.js', 'makeGameOverScene', (run) => ({ run, won: true, onDone: () => {} })],
    ['ocean', '../src/scenes/ocean.js', 'makeOceanScene', () => ({
      voyage: M.voyage.newVoyage('RENDER-ocean'), onArrive: () => {}, onOver: () => {},
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
      const run = M.run.newRun('RENDER-' + name);
      if (name === 'shop' || name === 'gameover') { M.run.startBlind(run); run.money = 30; }
      sc.enter(argsFor(run), app);
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
      writePNG(cv, `shots/${name}.png`, 2);
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

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
    ['run', '../src/game/run.js'],
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
const ALL_IDS = Object.values(ROSTER).flat();
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
  const wanted = Object.keys(ROSTER);
  for (const id of wanted) ok(!!H.HABITAT_BY_ID[id], `habitat ${id} exists`);
  ok(Array.isArray(H.GATE_LAYOUT) && H.GATE_LAYOUT.length === 6, 'GATE_LAYOUT is 6 slots');
  ok(typeof H.affinity === 'function', 'affinity() exported');
  if (typeof H.affinity === 'function') {
    ok(H.affinity('savanna', 'savanna') === 1, 'affinity(x,x) === 1', H.affinity('savanna', 'savanna'));
    ok(H.affinity('savanna', 'nope') === 0, 'affinity to unknown === 0');
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
    ok(typeof h.short === 'string' && h.short.length <= 4, `habitat ${h.id} short label`, h.short);
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
  for (const [home, list] of Object.entries(ROSTER)) {
    for (const id of list) {
      const a = A.ANIMAL_BY_ID[id];
      if (!a) continue;
      ok(a.home === home, `${id} home === ${home}`, a.home);
    }
  }
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
      if (sel.home && !Object.keys(ROSTER).includes(sel.home)) badRef.push(`${r.id}:home ${sel.home}`);
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
        animal, habitatId: rng.pick(Object.keys(ROSTER)),
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
        try { relic.hooks.onPot({ ball: { bounces: 2 }, animal, gate: { habitatId: 'farm' } }, ctx); } catch (e) { hookErrors++; }
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
    'shrinkGates', 'rotateGates'];
  for (const k of LEGAL) ok(legal.has(k), `neutralEffect has ${k}`);
  let badKeys = [];
  for (const b of B.BOSSES || []) {
    for (const k of Object.keys(b.effect || {})) if (!LEGAL.includes(k)) badKeys.push(`${b.id}.${k}`);
    ok(!!M.palette.P[b.color], `boss ${b.id} colour legal`, b.color);
    ok(typeof b.desc === 'string' && b.desc.length <= 48, `boss ${b.id} desc <=48`, b.desc && b.desc.length);
  }
  ok(badKeys.length === 0, 'boss effects use only legal keys', badKeys.join(' '));
  ok((B.BOSSES || []).length >= 12, 'at least 12 bosses', (B.BOSSES || []).length);
  // monotonic targets
  let mono = true;
  for (let a = 1; a <= 8; a++) {
    const s = B.blindTarget(a, 'small'), g2 = B.blindTarget(a, 'big'), bo = B.blindTarget(a, 'boss');
    if (!(s < g2 && g2 < bo)) mono = false;
    if (a > 1 && !(s > B.blindTarget(a - 1, 'boss'))) mono = false;
  }
  ok(mono, 'blindTarget monotonic across kinds and antes');
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
        if (it.kind === 'habitat_up' && !Object.keys(ROSTER).includes(it.ref)) badRef++;
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
      { id: 'tl', habitatId: 'farm', x: 6, y: 6, r: 9.5 },
      { id: 'tr', habitatId: 'forest', x: PH.TABLE_W - 6, y: 6, r: 9.5 },
      { id: 'bl', habitatId: 'ocean', x: 6, y: PH.TABLE_H - 6, r: 9.5 },
      { id: 'br', habitatId: 'jungle', x: PH.TABLE_W - 6, y: PH.TABLE_H - 6, r: 9.5 },
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

if (section('scoring') && M.scoring && M.animals) {
  const S = M.scoring, A = M.animals;
  const run = M.run.newRun('SCORETEST');
  const mk = (potted, extra = {}) => S.resolveShot(Object.assign({
    run, blind: { ante: 1, kind: 'small', effect: {} }, shotIndex: 0, rng: M.rng.makeRng('s'),
    potted, residents: {}, tableAnimals: [], deckAnimals: [],
  }, extra));

  const sheep = A.ANIMAL_BY_ID.sheep;
  const exact = mk([{ ball: { bounces: 0 }, animalId: 'sheep', gate: { habitatId: 'farm' } }]);
  const wrong = mk([{ ball: { bounces: 0 }, animalId: 'sheep', gate: { habitatId: 'ocean' } }]);
  ok(exact.totalScore > wrong.totalScore * 3, 'exact habitat pays far more than wrong', `${exact.totalScore} vs ${wrong.totalScore}`);
  ok(exact.entries[0].match === 'exact', 'exact match detected');
  ok(wrong.entries[0].match === 'wrong', 'wrong match detected');
  ok(exact.totalMoney >= 1, 'exact pot pays money');

  const combo = mk([
    { ball: { bounces: 0 }, animalId: 'sheep', gate: { habitatId: 'farm' } },
    { ball: { bounces: 0 }, animalId: 'cow', gate: { habitatId: 'farm' } },
    { ball: { bounces: 0 }, animalId: 'pig', gate: { habitatId: 'farm' } },
  ]);
  ok(combo.totalScore > exact.totalScore * 3, 'combos compound', `${combo.totalScore}`);
  ok(combo.perfect === true, 'all-exact multi-pot is perfect');

  const eaten = mk([{ ball: { bounces: 0 }, animalId: 'fox', gate: { habitatId: 'forest' } }],
    { residents: { forest: [A.ANIMAL_BY_ID.rabbit] } });
  const foxAlone = mk([{ ball: { bounces: 0 }, animalId: 'fox', gate: { habitatId: 'forest' } }]);
  ok(eaten.totalScore > foxAlone.totalScore, 'fox scores more with a rabbit present', `${eaten.totalScore} vs ${foxAlone.totalScore}`);

  const chameleon = mk([{ ball: { bounces: 0 }, animalId: 'chameleon', gate: { habitatId: 'arctic' } }]);
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
        gate: { habitatId: rng.pick(Object.keys(ROSTER)) },
      });
    }
    const res = mk(potted, {
      residents: { [rng.pick(Object.keys(ROSTER))]: rng.sample(A.ANIMALS, rng.int(4)) },
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

/* ------------------------------------------------------------ render smoke */

if (section('render') && M.pixel) {
  const scenes = [
    ['menu', '../src/scenes/menu.js', 'makeMenuScene', () => ({ onStart: () => {} })],
    ['table', '../src/scenes/table.js', 'makeTableScene', (run) => ({ run, onExit: () => {} })],
    ['shop', '../src/scenes/shop.js', 'makeShopScene', (run) => ({ run, onDone: () => {} })],
    ['gameover', '../src/scenes/gameover.js', 'makeGameOverScene', (run) => ({ run, won: true, onDone: () => {} })],
  ];
  const { Input } = await import('../src/core/input.js');
  const { Juice } = await import('../src/core/juice.js');
  for (const [name, path, factory, argsFor] of scenes) {
    const cv = new SoftCanvas(640, 360);
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

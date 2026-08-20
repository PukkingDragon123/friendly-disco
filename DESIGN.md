# ARK & ANVIL — "Habitat Break"
### A 2.5D pixel-art roguelike pool game

You are the Keeper of a floating ark. Animals are racked on a tilted felt deck.
Sink each animal into the **habitat** where it belongs. Animals **interact** —
a fox that lands beside a rabbit eats well; a sheep beside a wolf loses its nerve.
Beat escalating **blinds** (Balatro-style Chips × Mult), then pick a **cargo crate**
from the manifest and watch the supply boat sail in and unload it.

---

## 0. NON-NEGOTIABLE TECH CONTRACT

* **Vanilla ES modules. Canvas2D. Zero dependencies. No build step.**
* Internal resolution is **640 × 360**, integer-scaled (`imageSmoothingEnabled = false`).
  Everything is drawn on integer pixel coordinates. **Never** use `ctx.arc`, gradients,
  `filter`, or sub-pixel coords for game art — use the helpers in `src/core/pixel.js`.
* No external assets. **All art is procedurally drawn pixel art.** All audio is
  procedurally synthesised WebAudio.
* Colours come **only** from `src/core/palette.js` (import `P` and use `P.gold`, or pass
  palette *keys* as strings to helpers). Never hardcode a hex string in a module.
* Every module is an ES module with named exports. No globals except `window.__ARK` (debug).
* Determinism: anything random takes an **explicit `rng`** argument (see `src/core/rng.js`).
  Never call `Math.random()`. Never call `Date.now()` inside pure logic.
* Code style: 2-space indent, semicolons, `const`/`let`, no classes required but allowed.
  Small focused functions. Comment the *why*, not the *what*.
* Must run in Chrome/Firefox/Safari from `python3 -m http.server` at repo root.

### Frame contract
Every scene gets `update(dt, ctx)` and `draw(g)` where
`dt` is seconds (clamped ≤ 1/30), `g` is the 640×360 CanvasRenderingContext2D.

---

## 1. SCREEN LAYOUT (640 × 360)

```
+---------------------------------------------------------------+
| HUD RAIL (x 0..148)          |  DECK / TABLE VIEW (x 148..640) |
|  blind banner + target       |                                 |
|  CHIPS x MULT readout        |     tilted 2.5D felt deck       |
|  score bar                   |     6 habitat gates             |
|  shots / reracks             |     animals as shaded orbs      |
|  money / ante / relics row   |                                 |
|  habitat vitrine (residents) |     power + spin widget (bottom) |
+---------------------------------------------------------------+
```
Relic ribbon runs along the very top (y 0..14) across the full width.

---

## 2. THE 2.5D PROJECTION

Physics happens in flat **table units**: the playfield is `TABLE_W = 232` by
`TABLE_H = 116` units, origin at its top-left corner.

Projection is an **orthographic tilt** (not isometric — we want a tilted rectangle,
not a diamond), defined once in `src/render/table.js`:

```js
export const VIEW = { ox: 158, oy: 96, tilt: 0.62, zScale: 1.0 };
// screenX = ox + tx
// screenY = oy + ty * tilt - tz
```

Consequences every module must respect:
* Depth sort by `ty` ascending — far animals draw first.
* Each animal casts a **flattened ellipse shadow** on the felt at `(sx, oy + ty*tilt)`,
  and the body is lifted by its radius so it reads as a sphere resting on cloth.
* The deck has physical thickness: a back rail (thin, lit), side rails (trapezoids),
  a front rail with ~11px of visible wood, and an apron below with plank shading.
  The whole deck is a barge floating on animated water.

---

## 3. FILE MAP  (owner in brackets)

```
index.html                    shell + loader + canvas scaling         [SPINE]
serve.mjs                     zero-dep static server                  [SPINE]
src/main.js                   bootstrap, scene manager wiring         [SPINE]
src/core/palette.js           the 40-colour palette                   [SPINE]
src/core/pixel.js             pixel drawing primitives + text         [SPINE]
src/core/rng.js               seeded RNG                              [SPINE]
src/core/input.js             mouse/key state                         [SPINE]
src/core/loop.js              fixed-step loop + scene stack           [SPINE]
src/core/juice.js             shake, timescale, flash, tweens         [SPINE]
src/core/audio.js             procedural SFX + music                  [AGENT audio]
src/core/particles.js         particle system                         [AGENT particles]
src/render/font.js            5x7 + 3x5 bitmap fonts                  [AGENT font]
src/render/sprites.js         procedural animal sprite factory        [AGENT sprites]
src/render/uikit.js           panels, buttons, cards, bars, icons     [AGENT uikit]
src/render/seascape.js        animated sky/water/parallax backdrop    [AGENT seascape]
src/render/table.js           2.5D deck + habitat gates renderer      [SPINE]
src/data/habitats.js          9 habitats + affinity matrix            [AGENT content-animals]
src/data/animals.js           ~48 animals w/ sprite recipes           [AGENT content-animals]
src/data/interactions.js      ~55 interaction rules                   [AGENT content-inter]
src/data/relics.js            ~44 relics with hooks                   [AGENT content-relics]
src/data/blinds.js            ante curve + ~14 boss blinds            [AGENT content-blinds]
src/data/cargo.js             crate types + manifest roller           [AGENT content-cargo]
src/game/physics.js           deterministic ball physics              [AGENT physics]
src/game/scoring.js           chips x mult resolution pipeline        [SPINE]
src/game/run.js               run state machine                       [SPINE]
src/scenes/menu.js            title screen                            [SPINE]
src/scenes/table.js           gameplay scene (the heart)              [SPINE]
src/scenes/shop.js            cargo manifest + boat delivery          [AGENT shop]
src/scenes/gameover.js        run summary                             [SPINE]
tests/*.mjs                   headless node tests                     [AGENT tests]
```

**Agents: only write the file(s) assigned to you.** Do not edit `[SPINE]` files or
another agent's file. If you need something from a SPINE file, read it — it already exists.

---

## 4. PALETTE KEYS (from `src/core/palette.js`)

```
ink shadow deep night           dark structural
water0 water1 water2 water3 foam
wood0 wood1 wood2 wood3 wood4   hull / rails / crates
brass0 brass1 brass2 brass3     metal, gold trim
cloth0 cloth1 cloth2 cloth3     felt greens
white bone grey0 grey1 grey2
red0 red1 red2  orange  gold  amber
green0 green1  teal  sky  ice
purple0 purple1  pink  sand  rust  moss
```
`P.<key>` -> hex string. `palKeys()` -> array of keys. Helpers accept a key **or** a hex.

---

## 5. `src/core/pixel.js` API (already written — use it)

```js
px(g,x,y,c) rect(g,x,y,w,h,c) frame(g,x,y,w,h,c) line(g,x0,y0,x1,y1,c)
disc(g,cx,cy,r,c) ring(g,cx,cy,r,c) ellipse(g,cx,cy,rx,ry,c) ringEllipse(...)
tri(g,x0,y0,x1,y1,x2,y2,c) vgrad(g,x,y,w,h,keys) dither(g,x,y,w,h,cA,cB,level)
shadeDisc(g,cx,cy,r,{base,light,dark,rim})           // shaded sphere
text(g,str,x,y,c,{font:5|3, spacing, shadow, center, right, maxW, wave, t})
textW(str,{font,spacing}) -> width
wrap(str,maxW,{font}) -> [lines]
clip(g,x,y,w,h,fn)  // scissor helper
```

## 6. `src/core/rng.js` API
```js
makeRng(seed) -> rng
rng()            // float [0,1)
rng.int(n)       // 0..n-1
rng.range(a,b)   // float
rng.pick(arr)
rng.shuffle(arr) // returns NEW shuffled array
rng.chance(p)
rng.weighted([[item,w],...])
rng.fork()       // independent child rng
rng.state / rng.setState(s)
```

## 7. `src/core/juice.js` API
```js
Juice.shake(mag, dur) Juice.flash(colorKey, dur, alpha) Juice.slow(scale, dur)
Juice.pop(text, x, y, {color,size,vy,life})   // floating text
Juice.chromatic(mag,dur) Juice.update(dt) Juice.applyCamera(g) Juice.restore(g)
Juice.drawOverlay(g)  Juice.timeScale -> number
tween(from,to,dur,ease,onUpdate) -> handle ; Ease.{linear,inQuad,outQuad,inOutQuad,outCubic,outBack,outElastic,outBounce}
```

## 8. `src/core/input.js` API
```js
Input.attach(canvas, getScale)
Input.mouse = {x,y,down,pressed,released,rightPressed,wheel}
Input.key(code) Input.pressed(code) Input.anyPressed()
Input.consume()   // called once per frame by loop, at END of frame
```

---

## 9. DATA CONTRACTS  (agents: match these EXACTLY)

### 9.1 Habitat  (`src/data/habitats.js`)
```js
{ id:'savanna', name:'Savanna', short:'SAV',
  color:'gold', accent:'sand', dark:'rust',       // palette keys
  biome:'land'|'water'|'cold'|'human',
  icon:'acacia',                                  // uikit icon name
  blurb:'Golden grass and long horizons.' }
```
Exports:
```js
export const HABITATS = [ ...9 entries... ];   // savanna arctic jungle ocean desert farm wetland mountain forest
export const HABITAT_BY_ID = {...};
export const AFFINITY = { savanna: { desert:0.6, farm:0.35, forest:0.25, ... }, ... };
// AFFINITY[a][b] in 0..1 = partial credit when an animal from a is potted into b.
// Symmetric. Missing pair = 0. AFFINITY[a][a] is implicitly 1.
export function affinity(homeId, potId) -> number  // 1 for exact, else AFFINITY lookup or 0
export const GATE_LAYOUT = ['tl','tm','tr','bl','bm','br'];  // 6 pocket slots
```

### 9.2 Animal  (`src/data/animals.js`)
```js
{ id:'lion', name:'Lion',
  chips:70,            // base chips
  mult:2,              // base mult contribution
  home:'savanna',      // habitat id
  tags:['predator','cat','big','mammal'],   // see TAG VOCAB below
  rarity:'common'|'uncommon'|'rare'|'legendary',
  cost:4,              // shop value
  mass:1.2,            // physics mass (0.6 .. 1.6)
  size:1.15,           // radius multiplier (0.8 .. 1.25)
  sprite:{ /* recipe, see 9.3 */ },
  blurb:'King of the plains.',                 // <= 40 chars flavour
  rules:'+2 Mult for each prey in the habitat.'// <= 64 chars, mechanical summary
}
```
Exports: `ANIMALS` (array, ~48), `ANIMAL_BY_ID`, `animalsByTag(tag)`,
`STARTER_DECK` (array of ~22 animal ids for the starting caravan — mostly common,
covering at least 5 habitats), `rollAnimal(rng, {rarity, habitat})`.

**TAG VOCAB** (use only these): `predator prey herbivore carnivore omnivore
bird fish mammal reptile insect amphibian
cat canine bovine equine primate rodent bear pachyderm marsupial mustelid
big small tiny flying swimming digging nocturnal social solitary
tropical polar aquatic domestic wild exotic pack herd
scavenger venomous armored fast slow smart cute majestic weird`

### 9.3 Sprite recipe (consumed by `src/render/sprites.js`)
```js
sprite:{
  body:'gold', shade:'rust', light:'sand', belly:'bone',   // palette keys
  eye:'ink', eyeStyle:'dot'|'wide'|'sleepy'|'angry'|'sparkle'|'goggle',
  ears:'none'|'round'|'pointy'|'long'|'tiny'|'tuft'|'horn'|'antler'|'crest'|'fin'|'frill'|'shell',
  face:'muzzle'|'snout'|'beak'|'trunk'|'flat'|'whiskers'|'tusk'|'mandible',
  pattern:'none'|'stripes'|'spots'|'patches'|'scales'|'wool'|'plates'|'bands'|'freckles',
  patternColor:'ink',
  extra:'none'|'mane'|'wing'|'tail'|'shell'|'quills'|'hump'|'flipper'|'plume'|'antenna'|'gill'|'sail'
}
```
Only these enum values. `sprites.js` must render *something* legible for every combination.

### 9.4 Interaction  (`src/data/interactions.js`)
Pure declarative data — **no functions**.
```js
{ id:'fox_rabbit',
  name:'Fox Hunts Rabbit',
  scope:'habitat'|'shot'|'table'|'deck',
  // 'habitat' = animals already resident in the gate being scored
  // 'shot'    = other animals potted in the SAME shot
  // 'table'   = animals still on the felt
  // 'deck'    = animals remaining in the caravan
  self:  { id:'fox' }  |  { tag:'predator' }  |  { any:true },
  other: { id:'rabbit' } | { tag:'prey' } | { home:'ocean' } | { any:true },
  perOther:true,            // apply once per matching other (default true)
  maxStacks:3,              // cap (default 4)
  gain:  { chips:60, mult:1, xmult:1, money:0 },  // applied to the animal being scored
  onOther:{ consume:true, chips:0, mult:0 },      // optional; consume = other is devoured
  kind:'eat'|'buff'|'debuff'|'flock'|'set'|'combo',
  flavor:'The fox eats well tonight.',
  requireAll:['cow','pig','chicken']   // optional; set-bonus form, ignores self/other/perOther
}
```
`gain.chips`/`gain.mult` may be negative. `gain.xmult` defaults to 1 and multiplies.
Exports: `INTERACTIONS` (array ~55), `INTERACTIONS_BY_ID`,
`interactionsFor(animal)` -> array (cheap prefilter by `self`).

Content requirements: at least 8 `eat`, 10 `buff`, 8 `debuff`, 5 `flock`
(same-species stacking), 6 `set` (requireAll trios/pairs), 6 `combo`
(scope `shot`), and a few exotic ones (chameleon counts as any home,
honey badger immune to debuffs — encode immunity as `kind:'buff'` with a
special id `immune_*` that `scoring.js` looks for by prefix; document it).

### 9.5 Relic  (`src/data/relics.js`)
Relics DO have code hooks.
```js
{ id:'zookeeper_whistle', name:"Zookeeper's Whistle",
  rarity:'common'|'uncommon'|'rare'|'legendary',
  price:5,
  desc:'+2 Mult for each animal sunk into its true habitat',   // <= 72 chars
  art:{ icon:'whistle', bg:'brass1', fg:'brass3' },
  tags:['scoring'],
  hooks:{
    onScoreAnimal(res, ctx) {},   // mutate res.chips/res.mult/res.xmult/res.money; ctx.log(txt,colorKey)
    onShotEnd(ctx) {},            // after all balls settle
    onBlindStart(ctx) {},
    onBlindEnd(ctx) {},
    onPot(potInfo, ctx) {},       // per ball sunk, before scoring
    onShop(ctx) {},
    modifyRun(run) {}             // one-shot when acquired (e.g. +1 shot)
  },
  state:{ counter:0 }             // optional; deep-cloned per run
}
```
`res` = `{ animal, habitatId, match:'exact'|'partial'|'wrong', chips, mult, xmult, money, tags, logs }`
`ctx` = `{ run, blind, shot, shotIndex, potted, residents, tableAnimals, deck, rng, log(text,colorKey), relic, addMoney(n), consumeAnimal(id) }`
Only mutate `res` and `relic.state`. Never touch the DOM. Never import scenes.
Exports: `RELICS`, `RELIC_BY_ID`, `rollRelics(rng, n, {owned, rarityBoost})`.

### 9.6 Blinds  (`src/data/blinds.js`)
```js
export const ANTES = 8;
export const ANTE_BASE = [0,300,800,2000,5000,11000,20000,35000,50000]; // index by ante
export const BLIND_KINDS = [
  { key:'small', name:'Small Blind', mult:1.0,  reward:3, color:'sky'  },
  { key:'big',   name:'Big Blind',   mult:1.5,  reward:4, color:'gold' },
  { key:'boss',  name:'Boss Blind',  mult:2.0,  reward:6, color:'red2' },
];
export function blindTarget(ante, kind) -> number
export const BOSSES = [ {
  id:'drought', name:'The Drought', desc:'Ocean & Wetland gates are sealed',
  color:'orange', icon:'sun', minAnte:1,
  effect:{                    // declarative where possible
    closeHabitats:['ocean','wetland'],
    shots:0, reracks:0,        // deltas
    friction:1, gravityDrift:0,
    noInteractions:false, hideLabels:false,
    chipsMul:1, multMul:1, scoreFloorPerShot:0,
    onceScoringPerHabitat:false, decoy:false, shrinkGates:0, rotateGates:false
  }
} ...~14 ];
export function rollBoss(rng, ante, seen) -> boss
```
`effect` keys above are the ONLY ones the engine reads — do not invent new keys;
compose bosses out of them. All numeric fields default to the neutral value.

### 9.7 Cargo  (`src/data/cargo.js`)
```js
crate = { id, kind:'livestock'|'relic'|'habitat'|'cue'|'feed'|'voucher',
  name:'Livestock Pen', price:6, rarity, boat:'skiff'|'barge'|'freighter'|'zeppelin',
  art:{ crate:'wood2', band:'brass2', stencil:'sheep' },
  blurb:'Three head of common stock.',
  contents:[ {kind:'animal', ref:'sheep', qty:1}, {kind:'relic', ref:'...'},
             {kind:'habitat_up', ref:'savanna'}, {kind:'cue', ref:'power'},
             {kind:'feed', ref:'hay'}, {kind:'voucher', ref:'wider_gates'},
             {kind:'money', qty:4} ] }
```
Exports: `CRATE_TEMPLATES`, `CUE_UPGRADES`, `FEEDS`, `VOUCHERS`,
`rollManifest(rng, run, n=3)`, `cratePrice(crate, run)`.
`CUE_UPGRADES` entries: `{id,name,desc,price,apply(run)}`.
`FEEDS` (consumables): `{id,name,desc,price,use(ctx)}` — max 2 held.
`VOUCHERS`: `{id,name,desc,price,apply(run)}` permanent.

### 9.8 Physics  (`src/game/physics.js`)
```js
export const TABLE_W = 232, TABLE_H = 116, BALL_R = 5.2;
export function createWorld(opts) -> world
// world = { w,h, balls:[], gates:[], friction, restitution, railRestitution, sunk:[] }
// ball  = { id, animalId, x,y, vx,vy, r, mass, spin, sunk:false, resting:true,
//           bounces:0, lastHit:null, squash:0, angle:0 }
export function addBall(world, spec) -> ball
export function setGates(world, gates)
//   gate = { id, habitatId, x, y, r, slot:'tl'|'tm'|... }  (table units)
export function step(world, dt) -> events[]
//   events: {type:'ball',a,b,speed,x,y} {type:'rail',ball,speed,x,y,side}
//           {type:'gate',ball,gate,speed,x,y} {type:'stop',ball}
export function isSettled(world) -> bool
export function strike(world, ball, angle, power, spin)
export function rack(world, animalIds, rng, mode='triangle'|'scatter'|'ring')
export function predict(world, ball, angle, power, steps) -> [{x,y}] // aim preview, non-mutating
export function nudge(world, dx, dy)  // boss drift
```
Requirements: fixed sub-steps (`dt` split into <=1/240 chunks), elastic circle-circle
with mass, rail bounce with `railRestitution`, rolling friction that actually stops
balls (`resting` when speed < 0.6), gate capture when ball centre within `gate.r*0.72`,
no tunnelling at power 1.0, no jitter/overlap explosions when 16 balls are racked
tight. Include `tests/physics.test.mjs`-style self-check in your file's bottom
`if (import.meta.main)`-free form — no, instead export `__selftest()` that returns
`{ok, msgs}` and I will call it from the test harness.

---

## 10. SCORING PIPELINE (`src/game/scoring.js`, SPINE — for reference)

For each ball sunk, in the order they were sunk during a shot:
1. `match = affinity(animal.home, gate.habitatId)` -> `exact` (1), `partial` (>0), `wrong` (0)
2. base `chips = animal.chips`, `mult = animal.mult`, `xmult = 1`
3. match modifier: exact -> `chips *= 3, mult += 2`; partial -> `chips *= 1 + a`,
   `mult += 1`; wrong -> `chips *= 0.25, mult -= 1` (floor 0.1 total mult)
4. interactions, in scope order `shot`, `habitat`, `table`, `deck`
5. relic `onScoreAnimal` hooks in owned order
6. bounce bonus: `chips += ball.bounces * run.railChips`
7. combo: `xmult *= 1 + 0.35 * (indexInShot)`
8. boss `chipsMul` / `multMul`
9. `score += floor(chips * max(0.1, mult) * xmult)`
Every step pushes a log line, and the table scene animates the readout per step.

---

## 11. AGENT DELIVERY RULES

1. Write ONLY your assigned file(s). Create them fresh.
2. **Verify before you finish**: run `node --input-type=module -e "import('./src/...')"`
   style syntax checks, and where practical a headless smoke test with a stub
   canvas. `node tools/checksyntax.mjs <file>` exists — use it.
3. Every exported symbol in your contract must exist with the right shape.
4. Content agents: be generous and specific. Flavour text with personality.
   Balance matters — read section 10 and make numbers that produce
   ~300 score in ante 1 and ~50k by ante 8 with good play.
5. Return a short report: what you exported, anything you deviated on, and
   anything the spine must do to wire you in.

---

## APPENDIX A — THE CANONICAL ROSTER (frozen)

`src/data/animals.js` must define **exactly** these ids, with exactly these `home`
values. Other agents (interactions, cargo) reference these ids, so no additions,
no renames, no removals. The listed tags are the **minimum** — add more from the
TAG VOCAB as fits.

```
SAVANNA   lion(predator,cat,big) zebra(prey,equine,herd) giraffe(herbivore,big)
          elephant(pachyderm,big,smart) meerkat(small,social,digging)
          hyena(scavenger,canine,pack) rhino(armored,big) ostrich(bird,fast,prey)
          honeybadger(mustelid,weird,armored)
ARCTIC    polarbear(predator,bear,big,polar) penguin(bird,polar,swimming,social)
          seal(swimming,polar,prey) arcticfox(predator,canine,small,polar)
          walrus(big,polar) snowyowl(bird,nocturnal,predator,polar)
          narwhal(aquatic,majestic,polar)
JUNGLE    monkey(primate,small,smart,social) tiger(predator,cat,big)
          parrot(bird,tropical,flying) sloth(slow,small) gorilla(primate,big)
          tapir(herbivore) treefrog(amphibian,tiny,tropical) jaguar(predator,cat)
          chameleon(reptile,weird) peacock(bird,majestic) pangolin(armored,digging)
OCEAN     dolphin(swimming,smart,social,aquatic) shark(predator,fish,aquatic)
          clownfish(fish,tiny,tropical) octopus(weird,smart,aquatic)
          whale(big,aquatic,majestic) seaturtle(reptile,slow,armored,aquatic)
          jellyfish(venomous,tiny,aquatic) crab(armored,small,aquatic)
DESERT    camel(herbivore,big) fennecfox(canine,small,predator)
          scorpion(venomous,tiny,insect) rattlesnake(reptile,venomous,predator)
          roadrunner(bird,fast) armadillo(armored,small,digging)
FARM      cow(bovine,domestic,herd) pig(domestic,omnivore) chicken(bird,domestic,small)
          sheep(domestic,herd,prey) goat(domestic,weird) horse(equine,domestic,fast)
          duck(bird,domestic,swimming) sheepdog(canine,domestic,smart)
WETLAND   crocodile(predator,reptile,big) flamingo(bird,social) heron(bird,predator)
          beaver(rodent,digging) dragonfly(insect,flying,fast)
          otter(mustelid,swimming,cute) platypus(weird,mammal,swimming)
          axolotl(amphibian,weird)
MOUNTAIN  mountaingoat(bovine,fast) eagle(bird,predator,flying,majestic)
          snowleopard(predator,cat) yak(bovine,big) marmot(rodent,small)
          condor(bird,flying,scavenger) redpanda(cute,small)
FOREST    fox(predator,canine,small) rabbit(prey,small) deer(prey,herbivore,herd)
          owl(bird,nocturnal,predator) hedgehog(small,armored)
          badger(mustelid,digging) squirrel(rodent,tiny)
          brownbear(bear,big,omnivore) wolf(predator,canine,pack) boar(omnivore,armored)
```

74 animals. Rarity spread target: ~34 common, ~22 uncommon, ~12 rare, ~4 legendary
(legendary suggestions: whale, narwhal, snowleopard, chameleon).
`chips` scales with rarity roughly: common 20-45, uncommon 40-70, rare 65-110,
legendary 100-160. `mult` 1-2 common, 2-3 uncommon, 3-4 rare, 4-6 legendary.
Tiny animals get low chips but high mult; big animals the reverse.

### Special-cased ids the engine knows about
* `chameleon` — `scoring.js` treats its home as whatever gate it enters (always exact).
* `honeybadger` — immune to negative interaction gains.
* `seaturtle` — gains chips for every shot it survived on the felt.
* `octopus` — copies the previous animal's interaction total in the same shot.
Content agents: still give these normal data; the engine layers the special rule on top.

---

## APPENDIX B — THE DOCK SCENE CONTRACT (`src/scenes/shop.js`)

The spine is finished; read it before writing the scene. `src/scenes/table.js`,
`src/scenes/menu.js` and `src/scenes/gameover.js` are working reference scenes —
match their structure and visual density.

```js
export function makeShopScene()   // -> scene object
scene.enter({ run, onDone }, app) // onDone() when the player casts off
scene.update(dt, app)
scene.draw(g, app)
scene.exit()
```

### What the dock does
1. Roll a manifest with `rollManifest(run.rng.fork('dock/'+run.ante), run, run.crateSlots)`.
2. Show the crates as cards on a dockside board — stencil, rarity stars, price, and the
   contents summary from `crateSummary(crate)`. Hidden-contents crates show `?` boxes.
3. Buying a crate (`spend(run, price)` then `deliverCrate(run, crate)` from
   `src/game/run.js`) triggers the **delivery sequence**, which is the centrepiece:
   * a boat of `crate.boat` class sails in from off-screen right, engine + horn sfx
   * it moors at the dock, a crane swings out, the crate lifts and lands with a thud
   * the lid bursts, light spills out, and each delivered item flies up into its slot
     (animal -> caravan, relic -> the top ribbon, cue/voucher -> the loadout board)
   * particles: splash on arrival, dust and shards on landing, stars and coins on open
   Use `createSeascape` + `drawBoat` from `src/render/seascape.js` — it already draws all
   four boat classes and its `sea.boats` list has writable x/y so you can sail one in.
4. Side stalls, always available while money lasts:
   * **Chandler** — 2 rolling `CUE_UPGRADES` offers
   * **Feed store** — 2 `FEEDS` offers (max 2 held, `run.feeds`)
   * **Harbourmaster** — 1 `VOUCHERS` offer
   * **Habitat works** — upgrade one habitat (`applyHabitatUpgrade`)
   * **Reroll** the manifest for `run.rerollCost` (cost climbs by 1 each use this visit)
   * **Sell a relic** by clicking it in the top ribbon (`sellRelic`)
5. A **CAST OFF** button ends the visit -> `onDone()`.

### Rules for the scene
* Runs at 640x360. HUD conventions from `src/scenes/table.js`: relic ribbon along y 0..15,
  money pill, `uikit` panels, `pixel.text` for every word.
* Never mutate `run` except through the exported helpers in `src/game/run.js`
  (`spend`, `deliverCrate`, `addCue`, `addFeed`, `addVoucher`, `sellRelic`,
  `applyHabitatUpgrade` from cargo.js).
* Must be robust when the player is broke, when `rollManifest` returns fewer crates than
  asked, when a relic list is full (`run.relicSlots`), and when feeds are at 2.
* Show the upcoming blind ("NEXT: Ante 3 · Small Blind · target 2,000") so purchases have
  context, plus the run's current caravan census.
* `Audio.sfx` names available: crate_open crate_land crane boat_horn boat_engine splash
  wave gull coin cash click hover back error upgrade sparkle levelup whoosh lock unlock.
  `Audio.music('dock')` on enter.

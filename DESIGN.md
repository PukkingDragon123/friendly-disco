# POCKET ARK
### A cozy pixel-art rescue roguelike

**The pitch.** The water is still rising, the boat is not getting bigger, and every island
has more animals on it than you have room for. You are a golem of river clay with a
shepherd's crook. You go out, you bring back what you can carry, and the game makes you
look at what you left.

**The design in one paragraph.** Everything in the game is one constraint wearing
different clothes: THE BOAT IS TOO SMALL. Berths are the currency, not coins. An animal
aboard is useful and in danger; an animal in a bed in Eden is safe and worth money and
useless; an animal you could not reach is a name in the summary. Every system — the tide,
the abilities, the relics, the gates, the encounters — exists to make that one trade
sharper.

**What the player actually does.**

```
   menu -> prologue -> OCEAN ---> pick one of three ---> [a decision] -> ISLAND (rescue)
                         ^                                                       |
                         |                        \--> CHERUBIM ROCK -> EDEN     |
                         \-------------------------------------------------------/
                            four chapters of four legs, and then the manifest
```

---

## 0. NON-NEGOTIABLE TECH CONTRACT

* **Vanilla ES modules. Canvas2D. Zero dependencies. No build step.**
* Internal resolution is **960 × 540**, integer-scaled where it fits
  (`imageSmoothingEnabled = false`). ×2 lands exactly on 1920×1080. Everything is drawn on
  integer pixel coordinates. **Never** use `ctx.arc`, gradients, `filter`, or sub-pixel
  coords for game art — use the helpers in `src/core/pixel.js`.
* No external assets. **All art is procedurally drawn pixel art.** All audio is
  procedurally synthesised WebAudio.
* Colours come **only** from `src/core/palette.js` (import `P` and use `P.gold`, or pass
  palette *keys* as strings to helpers). Never hardcode a hex string in another module.
* Every module is an ES module with named exports. No globals except `window.__ARK`.
* Determinism: anything random takes an **explicit `rng`** argument (see
  `src/core/rng.js`). Never call `Math.random()`. Never call `Date.now()` in pure logic.
* Comment the *why*, not the *what*.

### Frame contract
Every scene gets `update(dt, ctx)` and `draw(g)`, where `dt` is seconds (clamped ≤ 1/30)
and `g` is the 960×540 context. Scenes also expose `debug()` — every harness and every bot
navigates through it, so a scene without one cannot be tested.

**Clickable rects are built during `draw()`.** Anything that clicks must paint first. This
is not elegant but it is the single source of truth for layout, and the alternative (a
layout pass that can disagree with the renderer) has been tried and is worse.

### Performance contract
**A frame is a call budget, not a pixel budget.** Canvas2D costs per call, so anything
static is baked into an offscreen canvas once and blitted. What is cached:

| what | where | keyed by |
|---|---|---|
| text runs | `core/pixel.js` `cachedRun` | string, font, scale, colour, shadow/outline |
| panels | `render/uikit.js` `bakedPanel` | style, size, flags, title |
| the seascape | `render/seascape.js` | rendered at HALF resolution, blitted at 2× |
| animal sprites | `render/sprites.js` | three layers: back / spinning body / upright face |
| the cast | `render/folk.js` | id, pose, mouth, blink |
| the boat | `render/boat.js` | tier signature + damage |
| island silhouettes | `render/islandart.js` | island id + size |
| island backdrops | `render/islandart.js` | island id + size + horizon |
| obstacles | `render/obstacles.js` | kind, radius, cleared, variant |
| the ocean backdrop | `scenes/ocean.js` | screen size |
| the garden | `scenes/eden.js` | once |

Splitting a sprite **by what moves** is the trick that pays most: an animal's body spins
and its face does not, so rolling, squashing, blinking, getting wet and standing in rain
all cost zero bakes at the call site.

Soft edges are drawn as **spans, not pixels**: a foam band eight pixels wide is three
`rect`s, not eight `wash`es per row per side.

`node tools/profile.mjs` reports canvas calls per frame per scene. **Target: under 10,000
a frame.** Current: menu 788, cutscene 694, choice 1,259, garden 3,576, island 4,791,
ocean 5,176. Do not read the tool's millisecond column as a frame rate — the software
rasterizer takes ~20ms to paint anything at all; `tests/browser.mjs` measures real
`scene.draw()` time in Chromium instead (every scene is currently about 1ms).

---

## 1. THE SCENES (960 × 540)

### The ocean (`src/scenes/ocean.js`)
The map, and the only real route decision in the game.

```
 0            HUD: chapter · leg · THE FLOOD gauge · on deck · hull · purse        44
 44  sky, sun, clouds, gulls .................................................... 206
     ---- horizon ----   [ island ]      [ island ]      [ island ]
 226 [ destination card ]  [ destination card ]  [ destination card ] ........... 376
     open water: the tide edge, its label, drifting flotsam
 426 the boat + the golem at the tiller  |  ON DECK: who you carry, and what for   540
```

Two comparisons the card layout exists to make, and nothing else:

* **EASY** — what is in the way there, against who is standing on my deck right now. Every
  obstacle chip is ticked green when an animal aboard can clear it and crossed red when
  nothing can, read live off the manifest along the bottom. That is the route decision,
  drawn.
* **HONEST** — what the crossing costs. Every card carries its own tide cost, so taking the
  far island is visibly choosing to lose ocean, and Cherubim Rock is visibly the cheap one.

### The island (`src/scenes/island.js`)
Where a rescue is played. The field is **880 × 306 pixels at 1:1** — one world unit is one
screen pixel, so there is no projection to get wrong.

```
 0    HUD: island · danger · THE WATER gauge · saved/lost · berths · basket · CAST OFF
 176  ┌── the moored hull, three open pens ──┬─ the field ─────────────┬── the flood ──┐
      │ animals already saved peer out       │  obstacles, the         │ shallows,     │
      │ PENS FULL when there is no room      │  stranded, the animals  │ then deep     │
 482  └── the golem, with the crook ─────────┴─────────────────────────┴───────────────┘
 490  THE RAIL: who you carry, what each of them opens
```

The boat is drawn as the **side of a hull with three pens in it** rather than as a goal
line, because "get it into the pen" needs no explaining. The water comes in from the far
shore and the field's ground is the island's own baked backdrop, so a swamp and a snowfield
are not the same level with different colours.

### Eden (`src/scenes/eden.js`)
The hub, and the only safe ground. Deliberately **not panelled**: three big wooden boxes
covered the whole garden and turned the one warm place in the game into a filing cabinet,
so the beds sit on the actual grass, the gates stand in the actual arch, and the chrome is
pushed to the edges.

### The decision (`src/scenes/choice.js`)
Still and quiet on purpose. The island you have already committed to sits in the top-left
corner, the options are cards with their **costs printed**, and the outcome says what
actually happened rather than what the option promised.

### The manifest (`src/scenes/gameover.js`)
Three columns of NAMES — in the garden, still aboard, taken by the flood — because a run of
this game is remembered as "I lost the elephant on the volcano", not as a score. The
numbers are along the bottom, where they matter less. It ends with WHAT IS TRUE OF YOU: the
flags the run left behind.

---

## 2. FILE MAP

```
src/core/      palette  pixel  rng  input  loop  juice  audio  particles  transition
src/render/    font  sprites (ball animals)  folk (the cast + the wand)  portraits
               uikit  seascape  boat  islandart  obstacles  deal  cinematic
src/data/      animals  abilities  obstacles  islands  items  gear  quests  npcs
               choices  story
src/game/      physics  voyage  rescue  garden  choices  router
src/scenes/    menu  cutscene  ocean  choice  island  eden  gameover
tests/         run.mjs (contracts + balance)  play.mjs (voyages by clicking)
               browser.mjs (real Chromium)  mobile.mjs (real touch)
tools/         checksyntax  softcanvas (+PNG)  shot  profile  stubdom
```

Ownership, so two modules never answer the same question:

| question | the only place it is answered |
|---|---|
| how many pens do I have | `voyage.capacity()` — tier **plus** relics **plus** choices |
| how much does the flood gain | `voyage.floodPerLeg()` |
| what does this animal do | `abilities.abilityOf()` |
| what opens this obstacle | `obstacles.clearedBy()` |
| what does this cost me | `garden.priceOf()` — base **plus** reputation |
| did we lose this animal | `rescue.claim()` — the one place loyalty, the dove and the rod are checked |

---

## 3. PALETTE (`src/core/palette.js`, 84 keys)

Two rules the whole look depends on:

* **Nothing is pure white or blue-black.** `white` is cream, `ink` is a warm near-black. A
  cold outline over warm art is the fastest way to make pixel art look like a UI mockup
  instead of a place.
* **Every material gets its own ramp.** Sharing one grey across a cliff, a golem and a
  person is what makes pixel art look flat.

```
ink shadow deep night              warm structural darks
water0..3 foam                     the sea
wood0..4                           timber: the widest ramp, because most surfaces are planks
brass0..3                          metal
clay0..4                           river clay: the golem, and mud
leaf0..4                           foliage, lit from above
skin0..4  hair0..3                 the cast
stone0..4                          cliffs, ruins, rocks
snow0 snow1 ice  lava0..2  ash  bark  coral0 coral1
parch parch1 parch0 cream          parchment UI
magic0..2                          the crook's light
white bone grey0..2  sand rust moss gold amber orange red0..2 green0/1 teal sky
purple0/1 pink
```

---

## 4. CORE APIs

### `src/core/pixel.js` API (already written — use it)

```js
px(g,x,y,c) rect(g,x,y,w,h,c) frame(g,x,y,w,h,c) line(g,x0,y0,x1,y1,c)
disc(g,cx,cy,r,c) ring(g,cx,cy,r,c) ellipse(g,cx,cy,rx,ry,c) ellipseFrame(...)
tri(g,x0,y0,x1,y1,x2,y2,c) vgrad(g,x,y,w,h,keys) dither(g,x,y,w,h,cA,cB,level)
box(g,x,y,w,h,c,r) boxFrame(...) dashLine(...) scan(...) noiseFill(...) wash(g,x,y,w,h,c,a)
shadeDisc(g,cx,cy,r,{base,light,dark,rim})           // shaded sphere
text(g,str,x,y,c,{font:7|5|3, scale, spacing, shadow, outline, center, right, alpha, wave, t})
textW(str,{font,spacing,scale}) -> width
textH({font,scale}) -> line height
wrap(str,maxW,{font}) -> [lines]
clip(g,x,y,w,h,fn)  // scissor helper
makeCanvas(w,h) -> {canvas,g} | null      // offscreen, for baking
blit(g,src,x,y)
clearTextCache() textCacheSize()          // the run cache; see the perf contract
```

`font: 7` is the body and heading face, `5` is for dense labels, `3` for the smallest
captions. Anything drawn through `text()` is **cached as a baked run**, so a string
costs one blit; `wave` opts out because it moves each glyph independently.

### `src/core/rng.js` API
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

### `src/core/juice.js` API
```js
Juice.shake(mag, dur) Juice.flash(colorKey, dur, alpha) Juice.slow(scale, dur)
Juice.pop(text, x, y, {color,size,vy,life})   // floating text
Juice.chromatic(mag,dur) Juice.update(dt) Juice.applyCamera(g) Juice.restore(g)
Juice.drawOverlay(g)  Juice.timeScale -> number
tween(from,to,dur,ease,onUpdate) -> handle ; Ease.{linear,inQuad,outQuad,inOutQuad,outCubic,outBack,outElastic,outBounce}
```

### `src/core/input.js` API
```js
Input.attach(canvas, getScale)
Input.mouse = {x,y,down,pressed,released,rightPressed,wheel}
Input.key(code) Input.pressed(code) Input.anyPressed()
Input.consume()   // called once per frame by loop, at END of frame
```

---

## 5. DATA CONTRACTS

Every one of these is validated by `tests/run.mjs` against a **closed vocabulary**. A row
that uses a word the engine does not implement fails the build; that is the whole point.

### 5.1 Animal (`src/data/animals.js`) — 90 rows, frozen ids

```js
{
  id, name,
  chips, mult,            // kept from the scoring era: still the sell-value spine
  home,                   // = likes[0], derived
  likes: [trait, ...],    // DERIVED from tags, ranked. Islands are keyed on these.
  tags: [...],            // closed vocabulary
  rarity: 'common'|'uncommon'|'rare'|'legendary',
  mass: 0.6..1.6,         // goes straight into the rescue physics: a whale shoves
  size: 0.8..1.25,
  sprite: { body, shade, light, belly, eye, eyeStyle, ears, face, pattern,
            patternColor, extra },      // a RECIPE, not a bitmap
  blurb,
}
```

The sprite recipe is chosen for **readability at 32 pixels**, not zoological accuracy. Two
animals sharing an island never share a silhouette.

### 5.2 Ability (`src/data/abilities.js`) — 8

```js
{ id, name, icon, color, verb, blurb }
```

`abilityOf(animal)` is **derived from tags**, read most-specific-first, with an `OVERRIDE`
table for the animals the player reasons about most. Everybody knows a goat climbs and a
mole digs, and getting that wrong once costs more trust than getting forty obscure ones
right earns. Distribution is tested: no ability may be carried by fewer than five animals.

`smash ferry tunnel lift climb graze rally warm`

### 5.3 Obstacle (`src/data/obstacles.js`) — 14

```js
{ id, name, physics, clearedBy, r, hard, color, dark, light, icon, blurb, cleared }
```

`physics` is the only field the solver reads, and the words are closed:

| word | what it does |
|---|---|
| `solid` | a post: bounces animals off it |
| `slow` | heavy drag — you cross, and arrive with nothing left |
| `slick` | almost no friction — you do not stop where you meant to |
| `kill` | an animal that comes to REST in it is lost |
| `push` | a steady shove along an angle: a current, a gale |
| `pull` | dragged toward a middle that keeps what it gets |
| `gap` | open air: an animal that enters is gone at once |
| `strike` | lightning keeps coming back to this patch of ground |

`clearedBy` names exactly one ability, or `null` — and the `null` ones are **route
problems, not walls**. Cleared obstacles are drawn as cleared, never deleted.

### 5.4 Island (`src/data/islands.js`) — 11 biomes + Cherubim Rock

```js
{
  id, name, biome, blurb,
  ground: [3 keys],       // what a rescue is played ON
  rock:   [3 keys],       // the SILHOUETTE on the map, bottom to summit
  relief, steep,          // how tall it stands, and 0.2 mesa .. 1.1 peak
  sky:    [3 keys],
  scenery: [names],       // a small vocabulary the renderer knows
  weather: 'clear'|'rain'|'storm'|'snow'|'ash'|'fog'|'heat'|'wind'|'holy',
  obstacles: [ids],       // two or three kinds — this is what makes an island a puzzle
  likes: [traits],        // decides WHO is stranded there
  animals, danger, reward,
}
```

`rock` is kept apart from `ground` because the two answer different questions: for the
coral shallows the ground is ankle-deep water, and drawn as a mountain that gave us a pink
circus tent on the horizon.

### 5.5 Item (`src/data/items.js`) — the basket

```js
{ id, name, short, effect, color, light, leaf, price, blurb, use, seller }
```

`effect` ∈ `loyal | tide | call | free | mend`, one line of implementation each in
`game/rescue.js`. The boat's hold starts at **two** slots.

### 5.6 Relic (`src/data/gear.js`) — three slots

```js
{ id, name, slot: 'hold'|'wear'|'consume', icon, color, price, rarity,
  bonus: { key: n }, use?, power?, blurb, seller }
```

The bonus vocabulary is **closed at ten keys**, and every one is read somewhere real:

```
berths -> capacity()     sail -> floodPerLeg()   hull -> hullMax()
basket -> holdSize()     beds -> gardenSize()    coin -> sellPrice()
reach  -> rescue world friction                  patience -> tidePerAction()
dry    -> deep water washes back                 sure -> the first loss is spared
```

There is a test that equips a fake relic for **every key** and checks a real number moved.
A relic whose key nothing reads is a relic the player paid for that does nothing, which is
the worst bug a shop can have.

### 5.7 Quest (`src/data/quests.js`) — Noah's list, 9

```js
{ id, name, goal, stat, ask, done, reward: { money?, item?, gear?, upgrade? } }
```

Every goal is **read off the ledger** (`voyage.stats`, or `eden.length` for `gardened`), so
no quest keeps its own books, no quest can desync from what happened, and a job handed out
late still counts what you did before he asked. One at a time.

### 5.8 The cast (`src/data/npcs.js`) — 5

```js
{ id, name, folk, title, color, icon, sells: 'items'|'gear'|'upgrades',
  deal: [min,max], greet, idle: [...], buy, broke }
```

No two of them sell the same kind of thing, because the whole point of the three gates is
that opening one is a choice with a shape.

### 5.9 Encounter (`src/data/choices.js`) — 10

```js
{ id, title, who, needs?, weight, lines: [...],
  options: [{ label, blurb, cost, outcome, effects: [{key: value}, ...] }] }
```

Effects are **data, not functions**: a closed twelve-key vocabulary
(`money hull tide item gear animal lose loyal beds berths stat flag`) that
`game/choices.js` is the only thing allowed to carry out. An encounter can never quietly
do something the rest of the game has not been told about.

The rule the file is written to: **no option is free, and no option is obviously right.**
If one choice is strictly better it is not a choice, it is a prize with extra reading.

### 5.10 Physics (`src/game/physics.js`)

```js
createWorld({w, h, friction, restitution, railRestitution, lookup})
addBall(world, {animalId, x, y, r, mass})
setGates(world, gates)     // capture discs: the boat's pens
setPosts(world, posts)     // static circles: boulders, trunks, columns
setZones(world, zones)     // ground that changes the rules inside a circle
strike(world, ball, angle, power)
step(world, dt) -> events  // 'ball' 'rail' 'post' 'zone' 'gate' 'stop'
isSettled(world)
```

A post is **a ball of infinite mass** — the same normal, the same separation, no impulse
shared back. That is eleven lines, not a second solver, and it is why a boulder behaves
exactly like a cushion the player can walk round.

Fixed 1/240 sub-step with an adaptive guard: nobody crosses more than `travelCap` radii in
one sub-step, so nothing tunnels. De-overlap is positional only — the solver removes
penetration, it does not invent energy, which is why a crowded island unpacks quietly
instead of detonating.

---

## 6. THE RULES, AS NUMBERS

### The voyage (`src/game/voyage.js`)
4 chapters × 4 legs = **16 crossings**. Upgrades are five steps each and every step of
capacity, sail, hull and hold is **visible on the boat** — an upgrade you cannot see is an
upgrade the player takes on trust, and trust is expensive.

```
Pens    8  10  12  15  18      Sail   1  .86  .74  .63  .52
Hull    3   4   6   8  11      Hold   2   3   4   5   6
Garden 10  16  24  34  48
```

`floodPerLeg = 0.062 × sailTier × (1 − relics) × (dove ? 0.85 : 1)`

**0.062 is a knife edge on purpose.** An unupgraded boat arrives at leg 16 with the flood
at 0.99: finish with the sail you started with and you arrive on the last leg with the
water at your heels, and every point of Sail you buy is the difference between that and a
margin. Cherubim Rock costs a third of a crossing. Both ends of that are tested.

The boat starts **half empty** — four farm animals, one of each kind, four abilities. Every
berth an animal occupies is a berth a rescue cannot fill, and arriving at the first island
with the pens full meant the first thing the game did was refuse to let you play it.

### A rescue (`src/game/rescue.js`)
```
field           880 × 306 px      ball radius     13 px (the sprite's own radius)
world friction  1.5 / (1 + reach) shot power      0.28 + p × 1.32   (max 1.6)
tide per action 0.075 + danger × 0.012 − patience
obstacle radius data r × 1.7      full-power flick ≈ 800 px in 3.5 s
```

The stranded spawn in a **band**, not against the far shore, and the tide starts just off
it: spawning them at the edge drowned somebody in the first two moves of every level, which
reads as the game cheating rather than as the water winning.

Balance, from the greedy bot across all eleven islands: **36 saved, 19 lost.** You save most
of them and the water still gets some, which is the number this whole design exists to
produce.

### The garden (`src/game/garden.js`)
One gate a visit, free, never the same person twice, so the pool narrows and the choice
sharpens. Deals are one to three things rolled once per visit, and nothing you already own
is offered again. Sitting with an animal three times makes it loyal — the free, slow road to
what the snake charges seven for, and the one thing in the game you get by being patient
instead of by spending.

---

## 7. THE CAST AND THE STORY

God narrates. Noah builds. The golem carries, and never speaks — its lines are actions in
brackets and the word on its brow is the only thing it ever says.

* **prologue** — the ark is finished, the animals are not, and God makes something that can
  decide who gets on it.
* **tutorial** — the two verbs, taught after the first route is chosen rather than before,
  because the lesson is about ground you have now committed to.
* **chapters 2–4** — three lines each. A chapter opener that outstays its welcome is one
  the player skips, and then the one that matters gets skipped too.
* **encounters** — ten of them, three gated on flags set by earlier ones.

One art system serves the cast twice: `render/folk.js` draws both the walk-around sprite
and the dialogue portrait from the same bake, which is why they can never drift apart.

---

## 8. TESTING CONTRACT

Four harnesses, and none of them is decoration.

```sh
node tools/checksyntax.mjs      # every module imports under a stubbed DOM
node tests/run.mjs              # 1,300+ assertions: contracts, physics, balance
node tests/play.mjs 4           # four whole voyages, played BY CLICKING
node tools/profile.mjs          # canvas calls per frame per scene
node tests/browser.mjs          # real Chromium: console errors, real draw time
node tests/mobile.mjs           # phone viewports, real touch gestures
node tools/shot.mjs <scene> out.png    # look at it
```

Rules that have paid for themselves:

* **Review art by looking at it.** `tools/softcanvas.mjs` is a software Canvas2D plus a PNG
  encoder. Every art stage in this project was screenshotted and inspected, which is what
  caught a sea turtle's shell painting over its own face, a cast with no arms, a golem whose
  nose read as a mask, twelve islands sharing one dome, a fallen trunk that looked like a
  crate, and water that looked like stacked UI panels.
* **If the bot can finish a voyage with a mouse, so can a person.** `tests/play.mjs` clicks
  everything a player clicks. It found a deal you could not get out of, and a keypress left
  over from skipping a cutscene that chose your route for you.
* **Every closed vocabulary gets a test that the engine implements it.** Bonus keys, effect
  keys, physics words, ability coverage, palette keys, icon names.
* **Balance is printed, not asserted.** The greedy bot's saved/lost line is in the output of
  every run, so a tuning change that breaks the game is visible in one number.

## APPENDIX — THE ROSTER (frozen ids)

`src/data/animals.js` defines exactly these ids. `abilities.js`, `islands.js` and the
encounters all reference them, so no additions, no renames, no removals. The listed tags
are the minimum; `likes` and `home` are derived from them.

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

Plus the apocrypha (the mythological tail of the roster) to 90 rows. Rarity spread:
~34 common, ~22 uncommon, ~12 rare, ~4 legendary. `chips` and `mult` survive from the
scoring era as the sell-value spine: rarity sets the price, and a loyal animal is worth
three more.

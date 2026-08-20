# POCKET ARK

**A 2.5D pixel-art habitat pool roguelike.**

Animals are racked on the tilted felt deck of a floating ark. Six gates ring the deck,
each one opening onto a habitat. Sink every animal into the biome it calls home — and
watch out, because the animals notice each other. A fox that lands beside a rabbit eats
well. Sheep panic near wolves. Penguins would rather not meet a polar bear.

Beat the blind, sail to the dock, pick one crate off the manifest, and let the boat bring
it in.

```
                 ╭──────────────────────────────────────────╮
   SAV  ●        │                                          │        ● ARC
                 │        ~ the felt, tilted 0.62 ~          │
   OCE  ●        │                                          │        ● JUN
                 ╰──────────────────────────────────────────╯
                      DES ●                      ● FARM
```

## Play it

ES modules need a real HTTP origin, so serve the folder:

```sh
node serve.mjs            # -> http://localhost:8000
# or
python3 -m http.server 8000
```

Then open <http://localhost:8000/> and click to board.

## Controls

| | |
|---|---|
| **Click an animal** | take it as your cue ball |
| **Hold left mouse** | charge the shot — release to break |
| **A / D** or **wheel** | put english (side spin) on the ball |
| **S** | zero the english |
| **R** | re-rack the felt (costs a re-rack) |
| **1 / 2** | use a feed from your satchel |
| **M** / **F** | mute · fullscreen |
| **Right click** | cancel a charging shot |

## The rules

**Scoring** is chips × mult, resolved animal by animal.

* **Home gate** — ×3 chips and +2 mult. This is where the run lives.
* **Neighbouring biome** — partial credit, scaled by how close the biomes are
  (savanna/desert are cousins; arctic/ocean less so).
* **Wrong gate** — the animal keeps a quarter of its chips and costs you a mult.
* **Combo** — every extra animal sunk in the same shot compounds the multiplier.
* **Cushions** — rail bounces before the drop pay chips, and there are relics that care.

**Interactions** fire when an animal lands next to the right neighbour. Predators eat prey
already in the gate (the prey is *gone*), herds buff each other, flocks stack, and a few
pairings are simply a mistake. Same-shot combos, animals still on the felt, and even the
animals still in your caravan can all trigger rules.

**Structure** — 8 antes × 3 blinds (small, big, boss). Boss blinds seal gates, kill your
interactions, slick the felt, hide the labels, or plant a mimic in the rack.

**The dock** — one crate per visit. Crates carry animals for your caravan, relics, cue
work, feed, habitat upgrades and vouchers. Bigger hauls arrive on bigger boats.

## Tests

```sh
node tools/checksyntax.mjs src     # import-check every module under a stubbed DOM
node tests/run.mjs                 # data contracts, physics stress, scoring fuzz, balance
node tests/play.mjs 4              # play four complete runs end to end through the scenes
node tools/shot.mjs table out.png  # headless screenshot of any scene
node serve.mjs 8099 & node tests/browser.mjs   # real Chromium, real audio, real fps
```

`tests/run.mjs` validates every data row against the frozen contract (roster, tag
vocabulary, sprite-recipe enums, legal boss-effect keys, content quotas), fuzzes every
relic hook, fires 120 randomised full-power breaks checking for tunnelling and stuck
balls, fuzzes 400 scored shots for NaN, then auto-plays runs with a greedy bot and prints
the balance curve. `tests/play.mjs` drives the actual scenes with synthetic mouse input —
menu, deck, dock, summary — and fails if anything throws out of a frame.

There is a software Canvas2D in `tools/softcanvas.mjs` (fillRect / drawImage / clip /
alpha, plus a PNG encoder) so the renderer can be reviewed by looking at real frames from
node instead of guessing.

## Build

There is no build. No dependencies, no bundler, no assets — every sprite is drawn from a
procedural recipe at load time and every sound is synthesised in WebAudio.

```
index.html            shell, click-gate, canvas scaling
serve.mjs             zero-dep static server
DESIGN.md             the full design + module contract
src/core/             palette, pixel primitives, rng, input, loop, juice, audio, particles
src/render/           bitmap fonts, sprite factory, ui kit, seascape, the 2.5D deck
src/data/             habitats, 74 animals, interactions, relics, blinds, cargo
src/game/             physics, scoring pipeline, run state
src/scenes/           menu, table, dock, summary
tests/                headless suites: run.mjs, play.mjs, browser.mjs
tools/                checksyntax, softcanvas + PNG encoder, shot.mjs, stubdom
```

Internal resolution is a fixed **640×360**, integer-scaled to the window, with
`imageSmoothingEnabled = false`. Physics runs in flat table units and the view applies an
orthographic tilt (`screenY = oy + ty*1.24 - tz*2`) — a tilted rectangle, not an isometric
diamond, so the rails stay readable and the aim geometry stays intuitive.

## Debug

`window.__ARK` exposes `app`, `run`, `Audio` and `Juice` in the console.

```js
__ARK.run.money = 999        // fund a shopping spree
__ARK.run.shotsLeft = 99     // never miss
__ARK.goDock()               // jump straight to the dock
```

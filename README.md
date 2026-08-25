# POCKET ARK

**A cozy pixel-art rescue roguelike. The water is still rising, the boat is not getting
bigger, and every island has more animals on it than you have room for.**

> *"So you want me to build a boat."*
> *"I want you to build something that can decide who gets on it."*

You are a golem of river clay. Three islands stand on the horizon and you can see what
each one is before you commit: its weather, what is ashore, what is in the way, and what
the crossing costs you in tide. Pick one. Get the animals off it before the water arrives.
Take what you can carry, and know exactly what you left.

You cannot herd anything yourself — you are enormous and slow and they run from you. So
you pinch small figures out of your own back and stand them in the mud, and each one is a
rule that applies to a circle of ground.

```
        ~ the map ~                          ~ an island, twenty-nine tiles wide ~

   ╭────────╮  ╭────────╮  ╭────────╮   ▓▓│ ,, ▲  o  ,,   ≈≈ ,,   o  ▲   ,,│≈≈≈≈≈
   │ MEADOW │  │ RUINS  │  │CHERUBIM│   ▓▓│ o   ,, ((h))  ≈≈  o  ,,   ((w))│≈≈≈≈≈
   │ 6 ▲ ×1 │  │ 5 ▲ ×3 │  │  gate  │   ▓▓│ ,,  o →  →  ≈≈≈ ,, o    ✦    o │≈≈≈≈≈
   │ ✓ rock │  │ ✗ gap  │  │ +2% ~  │   ▓▓│ @   ,,  ▲   ≈≈≈  o   ,,  ▲  ,, │≈≈≈≈≈
   ╰────────╯  ╰────────╯  ╰────────╯   ▓▓│ ,, o   ,,  ≈≈≈≈  ,,   o     o  │≈≈≈≈≈
                                        ark  @ you  o animal  ▲ rock  ,, briar
                                        (h) herder doll  (w) wolf doll  ✦ strike
                                        ≈ a river          the flood, eating leftward
```

## Play it

ES modules need a real HTTP origin, so serve the folder:

```sh
node serve.mjs            # -> http://localhost:8000
```

Then open <http://localhost:8000/> and click to board.

## Controls

| | |
|---|---|
| **Click a doll in the tray, then click a tile** | the whole game. It works on everything inside its circle |
| **Click an animal you carry, then a tile** | it uses its ability there, then walks home on its own |
| **Click a basket slot, then a tile** | throw an apple |
| **1 … 7** | pick a doll |
| **W** | the workshop, at sea: make dolls out of what the deck produced |
| **1 / 2 / 3** | pick a destination, or an option on a decision |
| **Esc** or right-click | put down what you are holding, skip a cutscene |
| **Space** | cast off, whoever is still ashore |
| **M** / **F** | mute · fullscreen |

Plays on a phone: landscape, fullscreen on the boarding tap, and two taps do the whole
rescue.

## The rules

**The boat is the whole game.** Every berth an animal occupies is a berth a rescue cannot
fill, so you start with four farm animals and half a boat empty. Three places an animal
can be, and the difference between them is the entire economy:

* **Aboard** — useful and in danger. Usable in a rescue, lost if the boat is lost.
* **In a bed in Eden** — safe for good. Nothing reaches it, it cannot be used, it sells.
* **Lost** — it did not make it, and the summary says its name.

**An island is a tile field and the animals walk on it.** They wander when nothing is
happening, they bolt from whatever the storm has just dropped, and they will not go home
on their own. Seven clay dolls, and each is one rule inside one circle:

| | |
|---|---|
| **Herder** | animals nearby remember the way home and start walking it |
| **Bridge** | lies down across the shallows so the others can walk over |
| **Wolf** | everything that hunts here recognises a bigger predator and settles |
| **Lantern** | holds a coal up; nothing that lives in the dark will cross the light |
| **Ram** | puts its head down once, and whatever was in the way is not any more |
| **Cairn** | stands in a gap so nothing wanders into what is behind it |
| **Beacon** | half the island hears it — for eight seconds |

A doll cannot be moved or picked back up, so where it goes is the whole decision. You can
also PUT DOWN an animal you already carry: it uses its ability on the spot — the ox shifts
rock, the pig digs, the duck holds a channel, the eagle carries one home — and then walks
back to the boat on its own feet, which means it has to survive the walk like everything
else.

**The flood is the clock and the storm is the pressure.** The water eats the island from
the far side, one strip at a time, and anything it reaches is gone. Lightning keeps
landing, and what it leaves cannot hurt you — the locust of the eighth plague, the raven
that never came back, Leviathan and Behemoth, the Nephilim, the giant. They frighten
animals, which is worse: a frightened animal forgets the way home and has to be shown
again.

**The workshop closes the loop.** Animals on the ark produce on every crossing — wool from
a sheep, milk from a cow, a feather from a bird, and clay off your own back. Dolls are made
out of that, at sea, with W. So the animals you saved on the last island are literally
what you herd the next one with, and a berth spent on a llama rather than a lizard is a
decision. Noah is the only one who knows the other five shapes.

**Eleven islands**, each a place before it is a level: grassland, jungle, desert, swamp,
snow, volcano, drowned city, coral shallows, storm rock, mountain, and one quiet island
with no weather at all. You can read every one of them off the map before you sail.

**Eden** is the hub and the only safe ground. Put animals in beds, sell them, or sit with
one three times until it will not leave you — the free, slow road to the loyalty the snake
charges seven coins for. Ask the Cherubim and one of three gates opens, free, and whoever
comes through stays for the rest of the run: the snake with his apples, Adam with what he
made, Eve with the long view, Noah with the boat and a list of jobs. Nobody already in the
garden is offered again, so the choice sharpens every visit.

**Three relic slots** and they are not interchangeable — in hand, worn, in the chest — so a
build is a shape rather than a pile and every relic displaces one of its own kind.

**Choices, and the flags they leave.** Something asks you for a decision on most crossings
in. No option is free and none is obviously right, because the point is rarely what it
pays now: let the dove go and it flies ahead of the water for the rest of the run; put the
harpoon down and the whale pulls one animal a rescue out of the deep; take the strongbox
instead of the charts and the garden grows slower for it, and everybody who sells to you
has heard about the raft.

**Four chapters of four legs**, and the tide is tuned to a knife edge: an unupgraded boat
arrives at the last leg with the flood at 0.99. Every point of Sail you buy is the
difference between that and a margin.

## Tests

```sh
node tools/checksyntax.mjs           # import-check every module under a stubbed DOM
node tests/run.mjs                   # data contracts, field simulation, balance
node tests/play.mjs 4                # four complete voyages, played by clicking
node tools/shot.mjs island out.png   # headless screenshot of any scene
node tools/profile.mjs               # canvas calls per frame, per scene
node serve.mjs 8099 & node tests/browser.mjs   # real Chromium, real audio, real draw time
node serve.mjs 8099 & node tests/mobile.mjs    # phone viewports, real touch gestures
```

The suites are load-bearing, not decoration:

* `tests/run.mjs` validates every data row against a closed contract — tag vocabulary,
  sprite-recipe enums, palette keys, ability coverage, doll and material ids, effect
  vocabularies. It equips a fake relic for **every bonus key** and checks a real number
  moved, because a relic whose key nothing reads is a relic the player paid for that does
  nothing. It plays a greedy rescue on all eleven islands and reports the balance.
* `tests/play.mjs` drives whole voyages **by clicking** — title screen, cutscenes, route
  cards, placing dolls from the tray, putting an animal down to use it, stowing, opening a gate,
  buying, casting off. If the bot can finish a voyage with a mouse, so can a person. It has
  already caught a deal you could not get out of and a keypress that chose your route.
* `tools/softcanvas.mjs` is a software Canvas2D plus a PNG encoder, so the renderer is
  reviewed by looking at real frames from node instead of guessing.

## Build

There is no build. No dependencies, no bundler, no assets — every sprite is drawn from a
procedural recipe at load time and every sound is synthesised in WebAudio.

```
index.html            shell, click-gate, canvas scaling
serve.mjs             zero-dep static server
DESIGN.md             the full design + module contract
src/core/             palette, pixel primitives, rng, input, loop, juice, audio,
                      particles, scene transitions
src/render/           three bitmap fonts, ball-animal sprite factory, the cast, ui kit,
                      seascape, island art, obstacles, the boat, deal panel
src/data/             90 animals, abilities, obstacles, islands, items, relics, quests,
                      the cast, encounters, story
src/game/             field rules, voyage state, garden rules, choices, router
src/scenes/           menu, cutscene, ocean, choice, island, eden, summary
tests/                headless suites: run.mjs, play.mjs, browser.mjs, mobile.mjs
tools/                checksyntax, softcanvas + PNG encoder, shot.mjs, profile.mjs
```

Internal resolution is a fixed **960×540**, integer-scaled to the window, with
`imageSmoothingEnabled = false`.

**A frame is a call budget, not a pixel budget.** Everything static is baked to an
offscreen canvas once and blitted: text runs, UI panels, the seascape (at half
resolution), island silhouettes and backdrops, boats per upgrade signature, obstacles per
kind, animal sprites split by what MOVES so rolling, squashing, blinking and standing in
rain are free at the call site. `tools/profile.mjs` reports the number that matters —
canvas calls per frame — and the whole game sits between 700 and 5,200 against a ceiling
of 10,000. Real Chromium draws every scene in about a millisecond.

## Debug

`window.__ARK` exposes `app`, `voyage`, `router`, `Audio` and `Juice` in the console.

```js
__ARK.voyage.money = 999        // fund a shopping spree
__ARK.voyage.flood = 0          // hold the water back
__ARK.eden()                    // straight to the garden
__ARK.island('volcano')         // straight to a rescue on any island
```

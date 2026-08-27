// The shape of a run, in one file.
//
//   menu -> THE FILM     rivers -> wrath -> flood -> chaos, captions only, no dialogue box
//        -> THE CELLAR   build the golem, the lion comes in, the apple, his last words
//        -> THE FILM     passing: the hand, the lantern, and what stood up out of it
//        -> THE CAUSEWAY walk the ruins with his soul ahead of you, to the boat
//        -> THE FILM     setsail
//        -> OCEAN -> pick one of three -> ISLAND (a rescue)  -> OCEAN ...
//                                     \-> CHERUBIM -> EDEN -> OCEAN ...
//        -> HEAVEN at the end of every chapter, and once more at the end
//        -> THE MANIFEST
//
// THE OPENING IS A FILM WITH ONE PLAYABLE ROOM IN THE MIDDLE OF IT. It used to be twenty
// lines of typed dialogue with the set-pieces playing behind the text box; now the reels
// carry it, the cellar is the one place you touch anything, and there is no dialogue box in
// the whole prologue.
//
// Kept out of main.js so a headless harness can drive the whole game without a DOM
// bootstrap or a requestAnimationFrame loop. main.js is then just the browser shell.
//
// The router owns exactly one piece of state -- the voyage -- and every scene is handed
// it plus a single callback. No scene knows what comes after it, which is what lets the
// order of the run change here without touching a scene.

import { newVoyage, departIsland, endVoyage, CHAPTERS } from './voyage.js';
import { makeMenuScene } from '../scenes/menu.js';
import { makeOceanScene } from '../scenes/ocean.js';
import { makeIslandScene } from '../scenes/island.js';
import { makeChoiceScene } from '../scenes/choice.js';
import { makeEdenScene } from '../scenes/eden.js';
import { makeGameOverScene } from '../scenes/gameover.js';
import { makeCutscene } from '../scenes/cutscene.js';
import { makeFilmScene } from '../scenes/film.js';
import { makeBasementScene } from '../scenes/basement.js';
import { makeWalkScene } from '../scenes/walk.js';
import { makeHeavenScene } from '../scenes/heaven.js';
import { getScript, heavenLines, heavenTitle } from '../data/story.js';
import { rollEncounter } from './choices.js';

/**
 * createRouter(app, o)
 *  app — the object returned by createGame(), or any {replace(scene,args)} shim
 *  o.onRun(voyage) — optional; called when a voyage starts
 */
export function createRouter(app, o = {}) {
  let voyage = null;

  // Which wipe suits which destination. Water taking the screen for a crossing, holy
  // light for the garden, timber slats for a shore, a closing porthole for the summary.
  const go = (scene, args, kind) => (app.go ? app.go(scene, args, kind) : app.replace(scene, args));

  const R = {
    get voyage() { return voyage; },
    set voyage(x) { voyage = x; },
    // kept as the old name: the console, the harnesses and window.__ARK all reach for it
    get run() { return voyage; },
    set run(x) { voyage = x; },

    menu() {
      app.replace(makeMenuScene(), { onStart: (seed) => R.startRun(seed) });
    },

    startRun(seed) {
      voyage = newVoyage(seed);
      if (o.onRun) o.onRun(voyage);
      // THE WHOLE OPENING, in order. Every step of it can be clicked through faster, and
      // Escape leaves any one of them, but none of them can be skipped INTO the map: the
      // cellar is where the apple is explained, by being used.
      R.film([
        { card: 'THEY HAD A RIVER|AND THEY PUT EVERYTHING IN IT' },
        'rivers', 'wrath', 'flood', 'chaos',
      ], () => R.cellar());
    },

    /** A reel, or several. Captions on the bar, no dialogue box. */
    film(reels, then) {
      go(makeFilmScene(), { reels, onDone: then }, 'clouds');
    },

    /** Where you were made. The one interactive room in the prologue. */
    cellar() {
      go(makeBasementScene(), {
        voyage,
        onDone: () => R.film(['passing'], () => R.causeway()),
      }, 'curtain');
    },

    /** The only scene you can walk in, and the reason the rest of the run matters. */
    causeway() {
      go(makeWalkScene(), {
        voyage,
        onDone: () => R.film(['setsail'], () => R.ocean()),
      }, 'curtain');
    },

    /** Reporting in. `kind` is 'chapter', 'win' or 'lose'. */
    heaven(kind, then) {
      go(makeHeavenScene(), {
        voyage,
        title: heavenTitle(kind),
        lines: heavenLines(voyage, kind),
        onDone: then,
      }, 'light');
    },

    /** Play a dialogue script, then continue. A null or already-seen script just continues. */
    play(script, then) {
      if (!script || !script.lines || !script.lines.length) { then(); return; }
      if (voyage && script.id) {
        voyage.seenScripts = voyage.seenScripts || [];
        if (voyage.seenScripts.indexOf(script.id) >= 0) { then(); return; }
        voyage.seenScripts.push(script.id);
      }
      go(makeCutscene(), { script, onDone: then }, script.boss ? 'clouds' : 'light');
    },

    /** The map: three islands on the horizon and a tide that is not waiting. */
    ocean() {
      if (voyage.over) { R.summary(voyage.won); return; }
      go(makeOceanScene(), {
        voyage,
        onArrive: (island) => (island && island.teleport ? R.eden() : R.island(island)),
        onOver: () => R.summary(false),
      }, 'wave');
    },

    /**
     * A rescue. The two verbs get explained once, before the first one -- after the map,
     * not before it, because the lesson is about ground you have now chosen to stand on.
     */
    island(island) {
      R.play(getScript('tutorial'), () => {
        // something on the way in, about every other leg. It happens AFTER the crossing
        // is committed, so a decision can never be dodged by choosing a different
        // island -- you are already going there.
        const enc = rollEncounter(voyage, island);
        if (enc) {
          go(makeChoiceScene(), {
            voyage, island, encounter: enc,
            onDone: () => R.rescue(island),
          }, 'light');
          return;
        }
        R.rescue(island);
      });
    },

    /** The rescue itself. Split out so an encounter can hand straight through to it. */
    rescue(island) {
      go(makeIslandScene(), {
        voyage, island,
        onDone: () => R.afterStop(),
      }, 'curtain');
    },

    /** The garden: the only safe ground, and the only place anything is bought. */
    eden() {
      go(makeEdenScene(), { voyage, onDone: () => R.afterStop() }, 'light');
    },

    /**
     * Leaving a stop. The leg advances here and nowhere else, so an island and a trip to
     * the garden cost exactly the same amount of voyage -- which is the whole reason
     * banking what you have carries a price.
     */
    afterStop() {
      const wasChapter = voyage.chapter;
      departIsland(voyage);
      if (voyage.over) { R.summary(voyage.won); return; }
      if (voyage.chapter > wasChapter) {
        // a chapter ends by going to see him, and then the beat that opens the next one
        R.heaven('chapter', () => R.play(getScript(`chapter${voyage.chapter}`), () => R.ocean()));
        return;
      }
      R.ocean();
    },

    summary(won) {
      if (!voyage.over) endVoyage(voyage, won, null);
      // he gets the last word before the ledger does
      R.heaven(won ? 'win' : 'lose', () => {
        go(makeGameOverScene(), { voyage, won, onDone: () => R.menu() }, 'iris');
      });
    },
  };

  void CHAPTERS;
  return R;
}

/**
 * Wrap a scene so an exception inside update/draw is reported once instead of
 * killing every subsequent frame. Used by both the browser shell and the tests.
 */
export function guardScene(scene, onError) {
  for (const name of ['enter', 'update', 'draw', 'drawUI', 'exit']) {
    const orig = scene[name];
    if (typeof orig !== 'function') continue;
    scene[name] = function (...args) {
      try { return orig.apply(scene, args); } catch (e) { onError(e, name); return undefined; }
    };
  }
  return scene;
}

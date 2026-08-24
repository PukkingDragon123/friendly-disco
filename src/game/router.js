// The shape of a run, in one file.
//
//     menu -> prologue -> OCEAN -> pick one of three -> ISLAND (a rescue)  -> OCEAN ...
//                                                    \-> CHERUBIM -> EDEN -> OCEAN ...
//                         and when the chapters run out, or the flood does: THE MANIFEST
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
import { makeEdenScene } from '../scenes/eden.js';
import { makeGameOverScene } from '../scenes/gameover.js';
import { makeCutscene } from '../scenes/cutscene.js';
import { getScript } from '../data/story.js';

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
      R.play(getScript('prologue'), () => R.ocean());
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
        go(makeIslandScene(), {
          voyage, island,
          onDone: () => R.afterStop(),
        }, 'curtain');
      });
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
        R.play(getScript(`chapter${voyage.chapter}`), () => R.ocean());
        return;
      }
      R.ocean();
    },

    summary(won) {
      if (!voyage.over) endVoyage(voyage, won, null);
      go(makeGameOverScene(), { voyage, won, onDone: () => R.menu() }, 'iris');
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

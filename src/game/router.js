// Scene routing for a run: menu -> deck -> dock -> deck -> ... -> summary.
//
// Kept out of main.js so a headless harness can drive the whole game without a DOM
// bootstrap or a requestAnimationFrame loop. main.js is then just the browser shell.

import { newRun, advance } from './run.js';
import { makeMenuScene } from '../scenes/menu.js';
import { makeTableScene } from '../scenes/table.js';
import { makeShopScene } from '../scenes/shop.js';
import { makeGameOverScene } from '../scenes/gameover.js';

/**
 * createRouter(app, o)
 *  app — the object returned by createGame(), or any {replace(scene,args)} shim
 *  o.onError(err, where) — optional; called instead of throwing out of a frame
 */
export function createRouter(app, o = {}) {
  let run = null;

  const R = {
    get run() { return run; },
    set run(v) { run = v; },

    menu() {
      app.replace(makeMenuScene(), { onStart: (seed) => R.startRun(seed) });
    },

    startRun(seed) {
      run = newRun(seed);
      if (o.onRun) o.onRun(run);
      R.deck();
    },

    deck() {
      app.replace(makeTableScene(), {
        run,
        onExit: (result) => (result === 'cleared' ? R.afterBlind() : R.summary(false)),
      });
    },

    afterBlind() {
      advance(run);
      if (run.won) { R.summary(true); return; }
      R.dock();
    },

    dock() {
      app.replace(makeShopScene(), { run, onDone: () => R.deck() });
    },

    summary(won) {
      app.replace(makeGameOverScene(), { run, won, onDone: () => R.menu() });
    },
  };

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

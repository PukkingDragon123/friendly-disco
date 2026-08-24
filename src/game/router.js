// Scene routing for a run: menu -> ramp -> deck -> Eden -> deck -> ... -> summary.
//
// Kept out of main.js so a headless harness can drive the whole game without a DOM
// bootstrap or a requestAnimationFrame loop. main.js is then just the browser shell.

import { newRun, advance, currentKind, peekBoss } from './run.js';
import { makeMenuScene } from '../scenes/menu.js';
import { makeTableScene } from '../scenes/table.js';
import { makeEdenScene } from '../scenes/eden.js';
import { makeShopScene } from '../scenes/shop.js';
import { makeGameOverScene } from '../scenes/gameover.js';
import { makeCutscene } from '../scenes/cutscene.js';
import { makeDraftScene } from '../scenes/draft.js';
import { getScript, anteScript, bossScript } from '../data/story.js';

/**
 * createRouter(app, o)
 *  app — the object returned by createGame(), or any {replace(scene,args)} shim
 *  o.onError(err, where) — optional; called instead of throwing out of a frame
 */
export function createRouter(app, o = {}) {
  let run = null;

  // Which wipe suits which destination. The water taking the screen is the default
  // because the whole game is about that; holy light for the divine beats; timber slats
  // for the dock; a closing porthole for the summary.
  const go = (scene, args, kind) => (app.go ? app.go(scene, args, kind) : app.replace(scene, args));

  const R = {
    get run() { return run; },
    set run(v) { run = v; },

    menu() {
      app.replace(makeMenuScene(), { onStart: (seed) => R.startRun(seed) });
    },

    startRun(seed) {
      run = newRun(seed);
      if (o.onRun) o.onRun(run);
      // Noah's problem, then the ramp (pick eight of thirteen), then the lesson, then
      // the deck. The draft sits BEFORE the tutorial on purpose: the tutorial explains
      // berth traits, and you have just spent a minute reading them off a board.
      R.play(getScript('prologue'), () => R.draft());
    },

    /** The ramp: choose which eight head of stock board the ark. */
    draft() {
      go(makeDraftScene(), {
        run,
        onDone: () => R.play(getScript('tutorial'), () => R.deck()),
      }, 'curtain');
    },

    /** Play a dialogue script, then continue. A null script just continues. */
    play(script, then) {
      if (!script || !script.lines || !script.lines.length) { then(); return; }
      if (run && script.id) {
        if (run.seenScripts.includes(script.id)) { then(); return; }
        run.seenScripts.push(script.id);
      }
      go(makeCutscene(), { script, onDone: then }, script.boss ? 'clouds' : 'light');
    },

    /** Whatever story beat is owed before this blind, then the deck. */
    intoBlind() {
      const kind = currentKind(run);
      if (kind === 'boss') {
        const boss = peekBoss(run);
        R.play(bossScript(boss), () => R.deck());
        return;
      }
      if (kind === 'small') { R.play(anteScript(run.ante), () => R.deck()); return; }
      R.deck();
    },

    deck() {
      go(makeTableScene(), {
        run,
        onExit: (result) => (result === 'cleared'
          ? R.afterBlind()
          : R.play(getScript('epilogue_lose'), () => R.summary(false))),
      }, 'wave');
    },

    afterBlind() {
      // Which stop you get depends on what you just beat. Small and big blinds tie up
      // at Eden; clearing a BOSS earns the ante's supply run as well, so the freighter
      // comes out to you with a crate before you go ashore. Two shops with different
      // jobs: Eden sells choices, the freighter sells equipment.
      const beat = currentKind(run);
      advance(run);
      if (run.won) { R.play(getScript('epilogue_win'), () => R.summary(true)); return; }
      if (beat === 'boss') { R.freighter(); return; }
      R.eden();
    },

    /** The supply run: a boat brings a crate out to the ark. Earned by beating a boss. */
    freighter() {
      go(makeShopScene(), { run, onDone: () => R.eden() }, 'curtain');
    },

    /** The Garden of Eden: the last dry ground, and every stall on it wants paying. */
    eden() {
      go(makeEdenScene(), { run, onDone: () => R.intoBlind() }, 'curtain');
    },

    summary(won) {
      go(makeGameOverScene(), { run, won, onDone: () => R.menu() }, 'iris');
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

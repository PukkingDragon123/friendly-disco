// Bootstrap. Wires the scene graph: menu -> table -> dock -> table -> ... -> summary.

import { createGame } from './core/loop.js';
import { Input } from './core/input.js';
import { Juice } from './core/juice.js';
import { Audio } from './core/audio.js';
import { newRun, advance, currentKind } from './game/run.js';
import { makeMenuScene } from './scenes/menu.js';
import { makeTableScene } from './scenes/table.js';
import { makeShopScene } from './scenes/shop.js';
import { makeGameOverScene } from './scenes/gameover.js';
import { text, rect, wash, wrap } from './core/pixel.js';

const canvas = document.getElementById('game');
const app = createGame(canvas);
let run = null;

/* ---------------------------------------------------------------- routing */

function goMenu() {
  app.replace(makeMenuScene(), { onStart: (seed) => startRun(seed) });
}

function startRun(seed) {
  run = newRun(seed);
  window.__ARK.run = run;
  goTable();
}

function goTable() {
  app.replace(makeTableScene(), {
    run,
    onExit: (result) => {
      if (result === 'cleared') afterBlind();
      else goSummary(false);
    },
  });
}

function afterBlind() {
  advance(run);
  if (run.won) { goSummary(true); return; }
  goDock();
}

function goDock() {
  app.replace(makeShopScene(), { run, onDone: () => goTable() });
}

function goSummary(won) {
  app.replace(makeGameOverScene(), { run, won, onDone: goMenu });
}

/* ------------------------------------------------------------ error guard */

// A thrown frame should show something legible instead of a frozen canvas.
let crash = null;
const errorScene = {
  update() {
    if (Input.pressed('KeyEnter') || Input.pressed('Enter') || Input.mouse.pressed) {
      crash = null;
      goMenu();
    }
  },
  draw(g) {
    rect(g, 0, 0, 640, 360, 'ink');
    text(g, 'THE ARK STRUCK A ROCK', 320, 40, 'red2', { center: true });
    text(g, 'an error escaped a frame — details in the console', 320, 56, 'grey2', { font: 3, center: true });
    const lines = wrap(String(crash && (crash.stack || crash.message || crash)), 580, { font: 3 }).slice(0, 18);
    lines.forEach((l, i) => text(g, l, 30, 80 + i * 8, 'grey1', { font: 3 }));
    text(g, 'CLICK TO RETURN TO THE HARBOUR', 320, 330, 'bone', { font: 3, center: true });
  },
};

function guard(scene) {
  const wrapFn = (name) => {
    const orig = scene[name];
    if (typeof orig !== 'function') return;
    scene[name] = function (...args) {
      try { return orig.apply(scene, args); } catch (e) {
        console.error('[pocket-ark]', name, e);
        crash = e;
        app.replace(errorScene, {});
      }
    };
  };
  wrapFn('update'); wrapFn('draw'); wrapFn('drawUI'); wrapFn('enter');
  return scene;
}
const rawReplace = app.replace;
app.replace = (scene, args) => rawReplace(guard(scene), args);
const rawPush = app.push;
app.push = (scene, args) => rawPush(guard(scene), args);

/* ------------------------------------------------------------------- boot */

window.__ARK = { app, Audio, Juice, get run() { return run; }, set run(v) { run = v; }, goMenu, startRun, goDock, goTable };

// WebAudio needs a gesture. The overlay in index.html hands us that gesture.
function unlock() {
  Audio.init();
  Audio.unlock();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
}
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

// Global key handling that should work in every scene.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') Audio.toggleMute();
  if (e.code === 'KeyF') {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }
});

const boot = document.getElementById('boot');
if (boot) boot.remove();
document.body.classList.add('ready');

goMenu();
app.start();

// tiny console greeting so the debug hooks are discoverable
console.log('%cPOCKET ARK', 'color:#ffcb52;font-weight:bold', '— window.__ARK exposes app / run / Audio / Juice');

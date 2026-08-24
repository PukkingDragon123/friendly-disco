// Browser bootstrap. All the routing lives in src/game/router.js so the same wiring can
// be driven headlessly by tests/play.mjs.

import { createGame } from './core/loop.js';
import { Input } from './core/input.js';
import { Juice } from './core/juice.js';
import { Audio } from './core/audio.js';
import { createRouter, guardScene } from './game/router.js';
import * as Table from './render/table.js';
import { text, rect, wrap } from './core/pixel.js';

const canvas = document.getElementById('game');
const app = createGame(canvas);

/* ------------------------------------------------------------ error guard */

let crash = null;
const errorScene = {
  update() {
    if (Input.mouse.pressed || Input.pressed('Enter')) { crash = null; router.menu(); }
  },
  draw(g) {
    rect(g, 0, 0, 640, 360, 'ink');
    text(g, 'THE ARK STRUCK A ROCK', 320, 36, 'red2', { center: true, scale: 2, shadow: 'wood0' });
    text(g, 'an error escaped a frame — the full trace is in the console', 320, 62, 'grey2', { font: 3, center: true });
    const lines = wrap(String((crash && (crash.stack || crash.message)) || crash), 580, { font: 3 }).slice(0, 22);
    lines.forEach((l, i) => text(g, l, 30, 82 + i * 8, 'grey1', { font: 3 }));
    text(g, 'CLICK TO RETURN TO THE HARBOUR', 320, 336, 'bone', { font: 3, center: true });
  },
};

function onError(e, where) {
  console.error('[pocket-ark]', where, e);
  crash = e;
  rawReplace(errorScene, {});
}

const rawReplace = app.replace;
app.replace = (scene, args) => rawReplace(guardScene(scene, onError), args);
const rawPush = app.push;
app.push = (scene, args) => rawPush(guardScene(scene, onError), args);
const rawGo = app.go;
app.go = (scene, args, kind, dur) => rawGo(guardScene(scene, onError), args, kind, dur);

const router = createRouter(app, { onRun: (r) => { window.__ARK.run = r; } });

/* ------------------------------------------------------------------- boot */

window.__ARK = {
  app, Audio, Juice, router,
  // The real projection, exposed so a test harness can aim at a gate through the SAME
  // maths the renderer uses. tests/browser.mjs used to reimplement it from the VIEW
  // constants and silently aimed at the wrong pixel the moment the deck was retuned.
  Table,
  get run() { return router.run; },
  set run(v) { router.run = v; },
  menu: () => router.menu(),
  eden: () => router.eden(),
  freighter: () => router.freighter(),
  draft: () => router.draft(),
  // kept as the old name: harnesses and the console both reach for `dock`
  dock: () => router.eden(),
  deck: () => router.deck(),
  startRun: (seed) => router.startRun(seed),
};

// WebAudio needs a user gesture; the click-gate in index.html provides it.
function unlock() {
  Audio.init();
  Audio.unlock();
  window.removeEventListener('pointerdown', unlock);
  window.removeEventListener('keydown', unlock);
}
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

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

router.menu();
app.start();

console.log('%cPOCKET ARK', 'color:#ffcb52;font-weight:bold',
  '— window.__ARK exposes app / run / router / Audio / Juice');

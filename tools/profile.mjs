// Frame profiler.  node tools/profile.mjs [scene...]
//
// Wraps every method on the software canvas context in a counter, ticks each scene for
// a while, and reports the call count per op and the wall time per frame. A pixel-art
// renderer dies of call COUNT, not of clever maths, so this is the number that matters.
import { installDom } from './stubdom.mjs';
const dom = installDom();
const { SoftCanvas } = await import('./softcanvas.mjs');
const { W, H } = await import('../src/core/pixel.js');

const which = process.argv.slice(2);
const SCENES = which.length ? which : ['menu', 'cut', 'ocean', 'choice', 'island', 'garden'];

const { Input } = await import('../src/core/input.js');
const { Juice } = await import('../src/core/juice.js');

function counted(ctx) {
  const counts = {};
  const raw = {};
  for (const k of Object.keys(ctx).concat(Object.getOwnPropertyNames(Object.getPrototypeOf(ctx) || {}))) {
    if (typeof ctx[k] !== 'function') continue;
    if (raw[k]) continue;
    raw[k] = ctx[k].bind(ctx);
    counts[k] = 0;
    ctx[k] = (...a) => { counts[k]++; return raw[k](...a); };
  }
  return counts;
}

const rows = [];
for (const name of SCENES) {
  const cv = new SoftCanvas(W, H);
  const g = cv.getContext('2d');
  const app = {
    g, canvas: cv, scale: 1, time: 0, frame: 0, depth: 1, fps: 60,
    push() {}, pop() {}, replace() {}, swap() {}, fit() {},
  };
  let scene = null;
  if (name === 'menu') {
    const { makeMenuScene } = await import('../src/scenes/menu.js');
    scene = makeMenuScene(); scene.enter({ onStart() {} }, app);
  } else if (name === 'cut') {
    const { makeCutscene } = await import('../src/scenes/cutscene.js');
    const { getScript } = await import('../src/data/story.js');
    scene = makeCutscene(); scene.enter({ script: getScript('prologue'), onDone() {} }, app);
  } else if (name === 'choice') {
    const V = await import('../src/game/voyage.js');
    const D = await import('../src/data/choices.js');
    const I = await import('../src/data/islands.js');
    const { makeChoiceScene } = await import('../src/scenes/choice.js');
    const voyage = V.newVoyage('PROF-0001');
    scene = makeChoiceScene();
    scene.enter({
      voyage, encounter: D.CHOICE_BY_ID.shepherd,
      island: I.ISLAND_BY_ID.swamp, onDone() {},
    }, app);
  } else if (name === 'sea') {
    const { createSeascape } = await import('../src/render/seascape.js');
    const sea = createSeascape('prof/sea', {});
    scene = {
      update(dt) { sea.update(dt); },
      draw() {
        sea.draw(g, {
          x: 0, y: 0, w: W, h: H, horizonY: 150, timeOfDay: 0.4, storm: 0.2,
          parallax: 0.5, reflect: true,
        });
      },
    };
  } else if (name === 'ocean') {
    const V = await import('../src/game/voyage.js');
    const { makeOceanScene } = await import('../src/scenes/ocean.js');
    const voyage = V.newVoyage('PROF-0001');
    voyage.leg = 3; voyage.flood = 0.4;
    for (const k of V.UPGRADE_IDS) voyage.tiers[k] = 4;
    voyage.aboard = V.spreadStock(voyage.stock, V.capacity(voyage));
    V.rollChoices(voyage);
    scene = makeOceanScene(); scene.enter({ voyage, onArrive() {}, onOver() {} }, app);
  } else if (name === 'garden') {
    const V = await import('../src/game/voyage.js');
    const { makeEdenScene } = await import('../src/scenes/eden.js');
    const voyage = V.newVoyage('PROF-0001');
    voyage.money = 40;
    for (const k of V.UPGRADE_IDS) voyage.tiers[k] = 2;
    for (const id of voyage.stock.slice(0, 12)) voyage.eden.push(id);
    voyage.summoned.push('snake', 'noah');
    scene = makeEdenScene(); scene.enter({ voyage, onDone() {} }, app);
  } else if (name === 'island') {
    const V = await import('../src/game/voyage.js');
    const I = await import('../src/data/islands.js');
    const { makeIslandScene } = await import('../src/scenes/island.js');
    const voyage = V.newVoyage('PROF-0001');
    for (const k of V.UPGRADE_IDS) voyage.tiers[k] = 3;
    const island = I.ISLAND_BY_ID.jungle;
    scene = makeIslandScene(); scene.enter({ voyage, island, onDone() {} }, app);
    scene.debug().advance(4);
  }
  if (!scene) {
    console.error('unknown scene', name);
    continue;
  }

  // warm up (bakes happen on the first frame and must not be counted)
  scene.draw(g, app);
  if (scene.drawUI) scene.drawUI(g, app);

  const counts = counted(g);

  // Per-layer attribution used to wrap the deck's own layer methods. The deck is gone;
  // the scenes that replaced it are each under half its budget, so the flat count is a
  // diagnosis on its own again.
  const layers = {};
  const FRAMES = 30;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < FRAMES; i++) {
    app.frame = i; app.time += 1 / 60;
    Juice.update(1 / 60);
    if (scene.update) scene.update(1 / 60, app);
    Input.consume();
    scene.draw(g, app);
    if (scene.drawUI) scene.drawUI(g, app);
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / FRAMES;
  const byLayer = Object.entries(layers).filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round(v / FRAMES)}`);
  const top = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k, v]) => `${k} ${Math.round(v / FRAMES)}`);
  const total = Object.values(counts).reduce((a, b) => a + b, 0) / FRAMES;
  rows.push({ name, ms, total, top, byLayer });
}

console.log('scene       soft ms   calls/frame   busiest ops');
for (const r of rows) {
  // The budget is CALLS, not milliseconds. The software rasterizer takes ~20ms to paint
  // any full frame whatever is on it -- it flagged a 694-call cutscene as over budget --
  // so the millisecond column is only ever useful next to another run of this tool.
  const flag = r.calls > 10000 ? ' \x1b[31m<-- over budget\x1b[0m'
    : r.calls > 6500 ? ' \x1b[33m<-- tight\x1b[0m' : '';
  console.log(`${r.name.padEnd(12)} ${r.ms.toFixed(2).padStart(7)}   ${String(Math.round(r.total)).padStart(9)}   ${r.top.join(', ')}${flag}`);
  if (r.byLayer && r.byLayer.length) console.log(`             deck layers: ${r.byLayer.join(', ')}`);
}
void dom;

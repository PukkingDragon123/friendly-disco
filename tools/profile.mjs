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
const SCENES = which.length ? which : ['menu', 'deck-dry', 'deck-flood', 'eden', 'draft', 'dock', 'cut', 'ocean', 'island'];

const { Input } = await import('../src/core/input.js');
const { Juice } = await import('../src/core/juice.js');
const R = await import('../src/game/run.js');

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
  const run = R.newRun('PROF-0001');
  R.beginDraft(run);
  let scene = null;
  if (name === 'menu') {
    const { makeMenuScene } = await import('../src/scenes/menu.js');
    scene = makeMenuScene(); scene.enter({ onStart() {} }, app);
  } else if (name === 'draft') {
    const { makeDraftScene } = await import('../src/scenes/draft.js');
    scene = makeDraftScene(); scene.enter({ run, onDone() {} }, app);
  } else if (name === 'cut') {
    const { makeCutscene } = await import('../src/scenes/cutscene.js');
    const { getScript } = await import('../src/data/story.js');
    scene = makeCutscene(); scene.enter({ script: getScript('prologue'), onDone() {} }, app);
  } else if (name === 'ocean') {
    const V = await import('../src/game/voyage.js');
    const { makeOceanScene } = await import('../src/scenes/ocean.js');
    const voyage = V.newVoyage('PROF-0001');
    voyage.leg = 3; voyage.flood = 0.4;
    for (const k of V.UPGRADE_IDS) voyage.tiers[k] = 4;
    voyage.aboard = voyage.stock.slice(0, V.capacity(voyage));
    V.rollChoices(voyage);
    scene = makeOceanScene(); scene.enter({ voyage, onArrive() {}, onOver() {} }, app);
  } else if (name === 'island') {
    const V = await import('../src/game/voyage.js');
    const I = await import('../src/data/islands.js');
    const { makeIslandScene } = await import('../src/scenes/island.js');
    const voyage = V.newVoyage('PROF-0001');
    for (const k of V.UPGRADE_IDS) voyage.tiers[k] = 3;
    const island = I.ISLAND_BY_ID.jungle;
    scene = makeIslandScene(); scene.enter({ voyage, island, onDone() {} }, app);
    scene.debug().advance(4);
  } else if (name === 'sea') {
    const { createSeascape } = await import('../src/render/seascape.js');
    const sea = createSeascape('prof/sea', {});
    scene = {
      update(dt) { sea.update(dt); },
      draw() { sea.draw(g, { x: 0, y: 0, w: W, h: H, horizonY: 150, timeOfDay: 0.4, storm: 0.2, parallax: 0.5, reflect: true }); },
    };
  } else {
    R.commitDraft(run, [0, 1, 2, 5, 6, 8, 9, 11]);
    if (name === 'eden') {
      R.startBlind(run); run.money = 30; R.advance(run);
      const { makeEdenScene } = await import('../src/scenes/eden.js');
      scene = makeEdenScene(); scene.enter({ run, onDone() {} }, app);
    } else if (name === 'dock') {
      R.startBlind(run); run.money = 30; R.advance(run);
      const { makeShopScene } = await import('../src/scenes/shop.js');
      scene = makeShopScene(); scene.enter({ run, onDone() {} }, app);
    } else {
      const { makeTableScene } = await import('../src/scenes/table.js');
      scene = makeTableScene(); scene.enter({ run, onExit() {} }, app);
      const d = scene.debug();
      if (name === 'deck-flood') { d.run.flood = 0.85; d.syncHazards(); }
      // get past the blind intro so the real deck is what we measure
      for (let i = 0; i < 120; i++) { scene.update(1 / 60, app); Input.consume(); }
    }
  }

  // warm up (bakes happen on the first frame and must not be counted)
  scene.draw(g, app);
  if (scene.drawUI) scene.drawUI(g, app);

  const counts = counted(g);

  // Per-layer attribution: wrap the deck's own layer methods so a call made inside one
  // is credited to it. Without this the report says "9000 fillRects" and nothing about
  // WHERE, which is not a diagnosis.
  const layers = {};
  let cur = 'other';
  const before = () => Object.values(counts).reduce((a, b) => a + b, 0);
  const dbg = scene.debug ? scene.debug() : null;
  if (dbg && dbg.deck) {
    for (const k of ['drawBase', 'drawGates', 'drawAnimals', 'drawFlood', 'drawLight', 'drawRailMarks']) {
      const orig = dbg.deck[k];
      if (typeof orig !== 'function') continue;
      layers[k] = 0;
      dbg.deck[k] = (...a) => {
        const b0 = before();
        const r = orig.apply(dbg.deck, a);
        layers[k] += before() - b0;
        return r;
      };
    }
  }
  void cur;
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

console.log('scene        ms/frame   calls/frame   busiest ops');
for (const r of rows) {
  const flag = r.ms > 16.6 ? ' \x1b[31m<-- over budget\x1b[0m' : r.ms > 11 ? ' \x1b[33m<-- tight\x1b[0m' : '';
  console.log(`${r.name.padEnd(12)} ${r.ms.toFixed(2).padStart(7)}   ${String(Math.round(r.total)).padStart(9)}   ${r.top.join(', ')}${flag}`);
  if (r.byLayer && r.byLayer.length) console.log(`             deck layers: ${r.byLayer.join(', ')}`);
}
void dom;

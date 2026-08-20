// Headless screenshotter.
//   node tools/shot.mjs <scene> [outfile] [frames] [scale]
// scene: menu | table | shop | over | sprites | ui | sea | font
//
// Boots the real scene against the software canvas, ticks it, and writes a PNG. This is
// how the renderer gets reviewed — by looking at it.
import { installDom } from './stubdom.mjs';
const dom = installDom();
const { SoftCanvas, writePNG, toAscii } = await import('./softcanvas.mjs');

const which = process.argv[2] || 'menu';
const out = process.argv[3] || `/tmp/shot-${which}.png`;
const frames = Number(process.argv[4] || 40);
const scale = Number(process.argv[5] || 2);

const cv = new SoftCanvas(640, 360);
const g = cv.getContext('2d');

const { Input } = await import('../src/core/input.js');
const { Juice } = await import('../src/core/juice.js');

// run.js pulls in every data module, so only load it for the scenes that need it
const NEEDS_RUN = ['table', 'shop', 'over'];
void NEEDS_RUN;
let newRun = () => ({}), startBlind = () => {}, advance = () => {};
if (NEEDS_RUN.includes(which)) {
  const R = await import('../src/game/run.js');
  newRun = R.newRun; startBlind = R.startBlind; advance = R.advance;
}

const app = {
  g, canvas: cv, scale: 1, time: 0, frame: 0, depth: 1,
  push() {}, pop() {}, replace() {}, swap() {}, fit() {}, fps: 60,
};

function mouse(x, y) { Input.mouse.x = x; Input.mouse.y = y; Input.mouse.inside = true; }

let scene = null;
const seed = process.env.SEED || 'ARK-DEMO-0001';
const run = newRun(seed);

switch (which) {
  case 'menu': {
    const { makeMenuScene } = await import('../src/scenes/menu.js');
    scene = makeMenuScene();
    scene.enter({ onStart: () => {} }, app);
    mouse(320, 224);
    break;
  }
  case 'table': {
    const { makeTableScene } = await import('../src/scenes/table.js');
    scene = makeTableScene();
    scene.enter({ run, onExit: () => {} }, app);
    // FLOOD=0..1 forces the waterline for a screenshot without playing the shots
    if (process.env.FLOOD) {
      const d = scene.debug();
      d.run.flood = Number(process.env.FLOOD);
    }
    mouse(560, 130);
    break;
  }
  case 'shop': {
    const { makeShopScene } = await import('../src/scenes/shop.js');
    startBlind(run); run.money = 24; advance(run);
    scene = makeShopScene();
    scene.enter({ run, onDone: () => {} }, app);
    mouse(320, 200);
    break;
  }
  case 'over': {
    const { makeGameOverScene } = await import('../src/scenes/gameover.js');
    startBlind(run);
    run.stats.blindsCleared = 11; run.stats.exact = 44; run.stats.bestShot = 8210;
    scene = makeGameOverScene();
    scene.enter({ run, won: process.env.WON === '1', onDone: () => {} }, app);
    break;
  }
  case 'deck': {
    // The 2.5D deck on its own — needs only physics + table + animals, so it can be
    // reviewed before the data layer is finished.
    const PH = await import('../src/game/physics.js');
    const T = await import('../src/render/table.js');
    const { ANIMAL_BY_ID, STARTER_DECK } = await import('../src/data/animals.js');
    const { createSeascape } = await import('../src/render/seascape.js');
    const { makeRng } = await import('../src/core/rng.js');
    const { createParticles } = await import('../src/core/particles.js');
    const rng = makeRng(process.env.SEED || 'deck');
    const world = PH.createWorld({});
    const assignment = { tl: 'savanna', tm: 'arctic', tr: 'jungle', bl: 'ocean', bm: 'desert', br: 'farm' };
    const deck = T.createDeck({ seed: 1337, assignment });
    PH.setGates(world, T.buildGates(assignment, {}));
    PH.rack(world, STARTER_DECK.slice(0, 10), rng, process.env.RACK || 'triangle');
    const sea2 = createSeascape('deckdemo', {});
    const ps = createParticles({ limit: 300, seed: 'd' });
    if (process.env.BREAK === '1') {
      // put a striker behind the rack and drive it into the pack, like a real break
      const cueBall = PH.addBall(world, { animalId: STARTER_DECK[0], x: PH.TABLE_W * 0.2, y: PH.TABLE_H * 0.5 });
      const pack = world.balls[0];
      PH.strike(world, cueBall, Math.atan2(pack.y - cueBall.y, pack.x - cueBall.x), 1, 0.15);
      for (let i = 0; i < Number(process.env.BREAKFRAMES || 90); i++) PH.step(world, 1 / 60);
    }
    const sel = world.balls.find((b) => !b.sunk);
    const aim = sel ? PH.predict(world, sel, Number(process.env.AIM || -0.5), 0.8, 46) : null;
    scene = {
      update(dt) { sea2.update(dt); deck.update(dt); ps.update(dt); },
      draw() {
        sea2.draw(g, { x: 0, y: 0, w: 640, h: 360, horizonY: 96, timeOfDay: 0.3, storm: 0.1, parallax: 0.4, reflect: true });
        deck.drawBase(g);
        deck.drawGates(g, { highlight: 'farm' });
        if (aim) deck.drawAim(g, aim, { r: sel.r });
        deck.drawAnimals(g, world, { lookup: (id) => ANIMAL_BY_ID[id], selected: sel });
        deck.drawLight(g);
        ps.draw(g);
      },
    };
    break;
  }
  case 'cut': {
    const { makeCutscene } = await import('../src/scenes/cutscene.js');
    const S = await import('../src/data/story.js');
    const B = await import('../src/data/blinds.js');
    const which = process.env.SCRIPT || 'prologue';
    const script = which.startsWith('boss:')
      ? S.bossScript(B.BOSS_BY_ID[which.slice(5)] || B.BOSSES[0])
      : which.startsWith('ante')
        ? S.anteScript(Number(which.slice(4)) || 1)
        : S.getScript(which);
    scene = makeCutscene();
    scene.enter({ script, onDone: () => {} }, app);
    const skip = Number(process.env.LINE || 0);
    for (let i = 0; i < skip; i++) {
      // advance past earlier lines so a later beat can be captured
      Input.mouse.pressed = true; scene.update(1 / 60, app); Input.consume();
      for (let k = 0; k < 4; k++) { Input.mouse.pressed = true; scene.update(1 / 60, app); Input.consume(); }
    }
    break;
  }
  case 'portraits': {
    const { drawPortrait, PORTRAIT_IDS } = await import('../src/render/portraits.js');
    const { rect, text } = await import('../src/core/pixel.js');
    scene = {
      update() {},
      draw() {
        rect(g, 0, 0, 640, 360, 'ink');
        PORTRAIT_IDS.forEach((id, i) => {
          const x = 24 + i * 100, y = 60;
          drawPortrait(g, id, x, y, 84, 120, 1.4 + i * 0.7, { color: 'red2', icon: 'skull' });
          text(g, id, x + 42, y + 128, 'bone', { font: 3, center: true });
        });
        text(g, 'SPEAKERS', 320, 24, 'brass3', { font: 7, center: true });
      },
    };
    break;
  }
  case 'sprites': {
    const { ANIMALS } = await import('../src/data/animals.js');
    const { drawAnimal } = await import('../src/render/sprites.js');
    const { rect, text } = await import('../src/core/pixel.js');
    const { HABITAT_BY_ID } = await import('../src/data/habitats.js');
    scene = {
      draw() {
        rect(g, 0, 0, 640, 360, 'deep');
        ANIMALS.forEach((a, i) => {
          const x = 22 + (i % 16) * 39, y = 30 + Math.floor(i / 16) * 44;
          const hab = HABITAT_BY_ID[a.home];
          rect(g, x - 18, y - 16, 36, 40, 'shadow');
          rect(g, x - 18, y - 16, 36, 1, hab ? hab.color : 'grey0');
          drawAnimal(g, a, x, y, { scale: 1 });
          text(g, a.name.slice(0, 9), x, y + 14, 'bone', { font: 3, center: true });
        });
        text(g, `${ANIMALS.length} ANIMALS`, 320, 8, 'gold', { center: true });
      },
      update() {},
    };
    break;
  }
  case 'ui': {
    const UI = await import('../src/render/uikit.js');
    const { rect, text } = await import('../src/core/pixel.js');
    scene = {
      draw() {
        rect(g, 0, 0, 640, 360, 'deep');
        ['wood', 'brass', 'slate', 'paper', 'glass'].forEach((s, i) => {
          UI.panel(g, 8 + i * 126, 8, 118, 64, { style: s, title: s.toUpperCase(), shadow: true });
        });
        ['idle', 'hover', 'down', 'disabled'].forEach((st, i) => {
          UI.button(g, UI.rectOf(8 + i * 100, 84, 92, 22), st.toUpperCase(), { state: st, icon: 'boat' });
        });
        UI.card(g, 8, 116, 92, 110, { title: 'Relic', lines: ['+2 mult per', 'exact match'], rarity: 'rare', icon: 'whistle', price: 6 });
        UI.card(g, 108, 116, 92, 110, { title: 'Crate', lines: ['3 animals'], rarity: 'legendary', icon: 'crate', price: 9 });
        UI.bar(g, 210, 120, 180, 10, 0.62, { fill: 'gold', frame: 'brass1', ticks: 6 });
        UI.segBar(g, 210, 136, 180, 8, 6, 4, { fill: 'sky' });
        UI.chipPill(g, 210, 150, 4210, {}); UI.multPill(g, 280, 150, 12, {}); UI.moneyPill(g, 340, 150, 27, {});
        UI.ribbon(g, 210, 168, 180, 'BOSS BLIND', { color: 'red2' });
        UI.starRow(g, 210, 186, 4, {});
        UI.tooltip(g, 410, 116, { title: 'Tooltip', lines: ['clamped inside', 'the 640x360 frame'], color: 'teal', w: 130 });
        (UI.ICONS || []).forEach((n, i) => {
          UI.icon(g, n, 10 + (i % 40) * 15, 240 + Math.floor(i / 40) * 15, { color: 'brass3' });
        });
        text(g, `${(UI.ICONS || []).length} ICONS`, 320, 350, 'grey2', { font: 3, center: true });
      },
      update() {},
    };
    break;
  }
  case 'sea': {
    const { createSeascape } = await import('../src/render/seascape.js');
    const seas = [0, 0.25, 0.5, 0.75].map((tod) => {
      const s = createSeascape('demo' + tod, {});
      s.setTimeOfDay(tod);
      return s;
    });
    scene = {
      update(dt) { seas.forEach((s) => s.update(dt)); },
      draw() {
        seas.forEach((s, i) => {
          const x = (i % 2) * 320, y = Math.floor(i / 2) * 180;
          g.save(); g.beginPath(); g.rect(x, y, 320, 180); g.clip();
          s.draw(g, { x, y, w: 320, h: 180, horizonY: y + 74, timeOfDay: i * 0.25, storm: i === 3 ? 0.7 : 0.1, parallax: 1, reflect: true });
          g.restore();
        });
      },
    };
    break;
  }
  case 'font': {
    const { text, rect } = await import('../src/core/pixel.js');
    const { FONT5, FONT3, FONT7 } = await import('../src/render/font.js');
    scene = {
      update() {},
      draw() {
        rect(g, 0, 0, 640, 360, 'ink');
        const rows = [
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz',
          '0123456789 !"#$%&\'()*+,-./',
          ':;<=>?@[\\]^_{|}~ × → ← ↑ ↓',
          '♥ ★ • ▲ ▼ · ° ¢',
          'The quick brown fox jumps',
          'over 13 lazy dogs! $27 ×3',
          'ANTE 4/8  BOSS BLIND  50K',
        ];
        rows.slice(0, 5).forEach((r, i) => text(g, r, 8, 6 + i * 12, 'white', { font: 7 }));
        rows.forEach((r, i) => text(g, r, 8, 74 + i * 10, 'bone'));
        rows.forEach((r, i) => text(g, r.toUpperCase(), 8, 164 + i * 8, 'gold', { font: 3 }));
        text(g, `FONT7 ${Object.keys(FONT7.glyphs).length} · FONT5 ${Object.keys(FONT5.glyphs).length} · FONT3 ${Object.keys(FONT3.glyphs).length} glyphs`, 8, 232, 'teal', { font: 3 });
        text(g, 'ANTE 4/8   BOSS BLIND   50K', 8, 244, 'gold', { font: 7, shadow: 'ink' });
        text(g, 'The Deluge rises', 8, 262, 'ice', { font: 7 });
        text(g, 'shadowed', 10, 256, 'white', { shadow: 'ink' });
        text(g, 'outlined', 90, 256, 'gold', { outline: 'ink' });
        text(g, 'centered', 320, 274, 'sky', { center: true });
        text(g, 'right', 630, 274, 'red2', { right: true });
      },
    };
    break;
  }
  default:
    console.error('unknown scene', which);
    process.exit(2);
}

for (let i = 0; i < frames; i++) {
  app.frame = i;
  app.time += 1 / 60;
  Juice.update(1 / 60);
  if (scene.update) scene.update(1 / 60, app);
  Input.consume();
}
if (scene.draw) scene.draw(g, app);
if (scene.drawUI) scene.drawUI(g, app);

const r = writePNG(cv, out, scale);
console.log(`wrote ${r.path}  ${r.w}x${r.h}  ${(r.bytes / 1024).toFixed(1)}kb`);
if (process.env.ASCII) console.log(toAscii(cv, 158));

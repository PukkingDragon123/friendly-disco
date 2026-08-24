// Headless screenshotter.
//   node tools/shot.mjs <scene> [outfile] [frames] [scale]
// scene: menu | table | shop | over | draft | eden | sprites | anim | icons | folk
//        | boat | isles | ocean | ui | sea | font
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

const { W: SW, H: SH } = await import('../src/core/pixel.js');
const cv = new SoftCanvas(SW, SH);
const g = cv.getContext('2d');

const { Input } = await import('../src/core/input.js');
const { Juice } = await import('../src/core/juice.js');

// run.js pulls in every data module, so only load it for the scenes that need it
const NEEDS_RUN = ['table', 'shop', 'over', 'draft'];
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
    const RD = await import('../src/game/run.js');
    RD.beginDraft(run);
    RD.commitDraft(run, [0, 1, 2, 5, 6, 8, 9, 11]);
    if (process.env.AIDS) { RD.addCue(run, 'brass_compass'); RD.addCue(run, 'rail_sight'); }
    scene = makeTableScene();
    scene.enter({ run, onExit: () => {} }, app);
    // FLOOD=0..1 forces the waterline for a screenshot without playing the shots
    if (process.env.FLOOD) {
      const d = scene.debug();
      d.run.flood = Number(process.env.FLOOD);
      if (d.syncHazards) d.syncHazards();
    }
    mouse(560, 130);
    break;
  }
  case 'draft': {
    const { makeDraftScene } = await import('../src/scenes/draft.js');
    scene = makeDraftScene();
    scene.enter({ run, onDone: () => {} }, app);
    if (process.env.PICK) {
      const d = scene.debug();
      for (const i of process.env.PICK.split(',')) d.toggle(Number(i));
    }
    mouse(480, 300);
    break;
  }
  case 'eden': {
    const V = await import('../src/game/voyage.js');
    const { makeEdenScene } = await import('../src/scenes/eden.js');
    const voyage = V.newVoyage(seed);
    voyage.money = Number(process.env.MONEY || 30);
    if (process.env.TIER) {
      const n = Number(process.env.TIER);
      for (const k of V.UPGRADE_IDS) voyage.tiers[k] = n;
    }
    if (process.env.EDEN) {
      for (const id of voyage.stock.slice(0, Number(process.env.EDEN))) voyage.eden.push(id);
    }
    if (process.env.SUMMON) for (const id of process.env.SUMMON.split(',')) voyage.summoned.push(id);
    scene = makeEdenScene();
    scene.enter({ voyage, onDone: () => {} }, app);
    if (process.env.TALK) scene.debug().talk(process.env.TALK);
    mouse(Number(process.env.MX || 480), Number(process.env.MY || 300));
    break;
  }
  case 'choice': {
    const V = await import('../src/game/voyage.js');
    const I = await import('../src/data/islands.js');
    const D = await import('../src/data/choices.js');
    const { makeChoiceScene } = await import('../src/scenes/choice.js');
    const voyage = V.newVoyage(seed);
    voyage.money = 20;
    const enc = D.CHOICE_BY_ID[process.env.ENC || 'shepherd'] || D.CHOICES[0];
    scene = makeChoiceScene();
    scene.enter({
      voyage, encounter: enc,
      island: I.ISLAND_BY_ID[process.env.ISLE || 'swamp'],
      onDone: () => {},
    }, app);
    if (process.env.PICK) scene.debug().pick(Number(process.env.PICK));
    mouse(Number(process.env.MX || 480), Number(process.env.MY || 240));
    break;
  }
  case 'island': {
    const V = await import('../src/game/voyage.js');
    const I = await import('../src/data/islands.js');
    const { makeIslandScene } = await import('../src/scenes/island.js');
    const voyage = V.newVoyage(seed);
    if (process.env.TIER) {
      const n = Number(process.env.TIER);
      for (const k of V.UPGRADE_IDS) voyage.tiers[k] = n;
      voyage.hull = V.hullMax(voyage);
      voyage.aboard = V.spreadStock(voyage.stock, V.capacity(voyage));
    }
    if (process.env.APPLES) for (const id of process.env.APPLES.split(',')) V.addItem(voyage, id);
    const island = I.ISLAND_BY_ID[process.env.ISLE || 'meadow'] || I.ISLANDS[0];
    voyage.at = island;
    scene = makeIslandScene();
    scene.enter({ voyage, island, onDone: () => {} }, app);
    const d = scene.debug();
    if (process.env.TIDE) d.advance(Number(process.env.TIDE));
    if (process.env.PLACE) {
      const [id, ix] = process.env.PLACE.split(',');
      d.place(id, Number(ix));
    }
    if (process.env.SHOOT) {
      const [ix, ang, pow] = process.env.SHOOT.split(',');
      d.aimAt(Number(ix), Number(ang), Number(pow));
    }
    mouse(Number(process.env.MX || 700), Number(process.env.MY || 300));
    break;
  }
  case 'ocean': {
    const V = await import('../src/game/voyage.js');
    const { makeOceanScene } = await import('../src/scenes/ocean.js');
    const voyage = V.newVoyage(seed);
    if (process.env.FLOOD) voyage.flood = Number(process.env.FLOOD);
    if (process.env.TIER) {
      const n = Number(process.env.TIER);
      for (const k of V.UPGRADE_IDS) voyage.tiers[k] = n;
      voyage.hull = V.hullMax(voyage);
      voyage.aboard = voyage.stock.slice(0, V.capacity(voyage));
    }
    if (process.env.LEG) {
      voyage.leg = Number(process.env.LEG);
      V.rollChoices(voyage);
    }
    scene = makeOceanScene();
    scene.enter({ voyage, onArrive: () => {}, onOver: () => {} }, app);
    if (process.env.SAIL) scene.debug().choose(Number(process.env.SAIL));
    mouse(Number(process.env.MX || 480), Number(process.env.MY || 280));
    break;
  }
  case 'boat': {
    const B = await import('../src/render/boat.js');
    const { rect, text } = await import('../src/core/pixel.js');
    scene = {
      update() {},
      draw() {
        rect(g, 0, 0, SW, SH, 'water1');
        for (let y = 0; y < SH; y++) rect(g, 0, y, SW, 1, y < SH * 0.4 ? 'sky' : 'water1');
        text(g, 'BOAT TIERS — every upgrade is visible', SW / 2, 8, 'gold', { center: true, font: 7 });
        // five tiers of everything, left to right
        for (let i = 0; i < 5; i++) {
          const x = 110 + i * 190, y = 150;
          const tiers = { capacity: i, speed: i, hull: i, hold: i };
          B.drawBoat(g, x, y, 1.4 + i * 0.3, { tiers, scale: 1, speed: 0.5 });
          text(g, 'TIER ' + i, x, y + 22, 'cream', { center: true, font: 5 });
        }
        // damage states
        for (let i = 0; i < 5; i++) {
          const x = 110 + i * 190, y = 330;
          B.drawBoat(g, x, y, 2.1 + i, { tiers: { capacity: 2, speed: 2, hull: 3, hold: 1 }, damage: i, scale: 1 });
          text(g, 'DAMAGE ' + i, x, y + 22, 'red2', { center: true, font: 5 });
        }
        // and the far-off map version
        text(g, 'ON THE MAP', SW / 2, 400, 'brass3', { center: true, font: 5 });
        for (let i = 0; i < 5; i++) {
          B.drawBoatFar(g, 300 + i * 90, 450, 1.2 + i, { tiers: { speed: i }, scale: 1 + (i > 2 ? 1 : 0) });
        }
      },
    };
    break;
  }
  case 'folk': {
    const F = await import('../src/render/folk.js');
    const { rect, text } = await import('../src/core/pixel.js');
    scene = {
      update() {},
      draw() {
        rect(g, 0, 0, SW, SH, 'deep');
        text(g, 'THE CAST — sprites at 1x/2x/3x, then poses, then portraits',
          SW / 2, 8, 'gold', { center: true, font: 7 });
        F.FOLK_IDS.forEach((id, i) => {
          const x = 70 + i * 150;
          // three scales, so the silhouette can be judged small and large
          rect(g, x - 62, 30, 138, 128, 'shadow');
          F.drawFolk(g, id, x - 40, 150, 1.2, { scale: 1 });
          F.drawFolk(g, id, x, 150, 1.2, { scale: 2, mud: id === 'golem' ? 1 : 0,
            sparkle: id === 'cherub' ? 1 : 0 });
          text(g, id.toUpperCase(), x, 162, 'brass3', { font: 5, center: true });
          // the four poses at 2x
          F.POSES.forEach((pose, j) => {
            const py = 200 + j * 80;
            rect(g, x - 62, py - 68, 138, 76, j % 2 ? 'shadow' : 'ink');
            F.drawFolk(g, id, x, py, 1.2 + j, { scale: 2, pose, talking: pose === 'talk' });
            text(g, pose, x + 46, py - 12, 'grey2', { font: 3, right: true });
          });
        });
        // portraits along the bottom
        F.FOLK_IDS.forEach((id, i) => {
          F.drawFolkPortrait(g, id, 24 + i * 150, 344, 120, 176, 1.4 + i,
            { talking: i === 1, mud: id === 'golem' ? 1 : 0, sparkle: id === 'cherub' ? 1 : 0 });
        });
      },
    };
    break;
  }
  case 'portraits': {
    const { drawPortrait, PORTRAIT_IDS } = await import('../src/render/portraits.js');
    const { rect, text } = await import('../src/core/pixel.js');
    scene = {
      update() {},
      draw() {
        rect(g, 0, 0, SW, SH, 'ink');
        PORTRAIT_IDS.forEach((id, i) => {
          const x = 26 + (i % 6) * 155, y = 50 + Math.floor(i / 6) * 250;
          drawPortrait(g, id, x, y, 132, 200, 1.4 + i * 0.7, { color: 'red2', icon: 'skull' });
          text(g, id.toUpperCase(), x + 66, y + 208, 'bone', { font: 5, center: true });
        });
        text(g, 'SPEAKERS', SW / 2, 20, 'brass3', { font: 7, center: true });
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
        rect(g, 0, 0, SW, SH, 'deep');
        const COLS = 18, CW = 52, CH = 62;
        ANIMALS.forEach((a, i) => {
          const x = 30 + (i % COLS) * CW, y = 46 + Math.floor(i / COLS) * CH;
          const hab = HABITAT_BY_ID[a.home];
          rect(g, x - 25, y - 26, 50, 58, 'shadow');
          rect(g, x - 25, y - 26, 50, 2, hab ? hab.color : 'grey0');
          drawAnimal(g, a, x, y, { scale: 1 });
          text(g, a.name.slice(0, 11), x, y + 22, 'bone', { font: 3, center: true });
        });
        text(g, `${ANIMALS.length} ANIMALS`, SW / 2, 10, 'gold', { center: true, font: 7 });
      },
      update() {},
    };
    break;
  }
  case 'anim': {
    // one animal across every axis: roll phase, mood, wet, squash
    const { ANIMAL_BY_ID } = await import('../src/data/animals.js');
    const { drawAnimal, drawAnimalShadow } = await import('../src/render/sprites.js');
    const { rect, text } = await import('../src/core/pixel.js');
    const who = (process.env.WHO || 'cow,zebra,sheep,lion').split(',');
    scene = {
      update() {},
      draw() {
        rect(g, 0, 0, SW, SH, 'deep');
        text(g, 'ROLL PHASES  ·  MOODS  ·  WET  ·  SQUASH', SW / 2, 8, 'gold', { center: true, font: 7 });
        who.forEach((id, row) => {
          const a = ANIMAL_BY_ID[id];
          if (!a) return;
          const y = 46 + row * 118;
          text(g, a.name, 8, y - 12, 'bone', { font: 5 });
          // eight roll phases
          for (let i = 0; i < 8; i++) {
            const x = 60 + i * 46;
            drawAnimalShadow(g, x, y + 34, 13);
            drawAnimal(g, a, x, y + 20, { scale: 1, roll: (i / 8) * Math.PI * 2 });
          }
          text(g, 'roll', 60 - 44, y + 20, 'grey2', { font: 3 });
          // moods
          ['idle', 'blink', 'happy', 'scared', 'sleepy'].forEach((m, i) => {
            const x = 470 + i * 46;
            drawAnimal(g, a, x, y + 20, { scale: 1, mood: m });
            text(g, m, x, y + 40, 'grey2', { font: 3, center: true });
          });
          // wet + rain, at 2x so the drips are visible
          drawAnimal(g, a, 736, y + 24, { scale: 2, wet: 1, t: 1.3 });
          text(g, 'wet', 736, y + 62, 'sky', { font: 3, center: true });
          drawAnimal(g, a, 810, y + 24, { scale: 2, rain: 1, t: 0.42 });
          text(g, 'rain', 810, y + 62, 'sky', { font: 3, center: true });
          // squash
          drawAnimal(g, a, 884, y + 28, { scale: 2, squash: 0.42 });
          text(g, 'squash', 884, y + 62, 'sky', { font: 3, center: true });
        });
      },
    };
    break;
  }
  case 'icons': {
    const { ANIMALS } = await import('../src/data/animals.js');
    const { drawAnimalIcon } = await import('../src/render/sprites.js');
    const { rect, text } = await import('../src/core/pixel.js');
    scene = {
      update() {},
      draw() {
        rect(g, 0, 0, SW, SH, 'deep');
        const COLS = 24;
        ANIMALS.forEach((a, i) => {
          const x = 22 + (i % COLS) * 39, y = 40 + Math.floor(i / COLS) * 46;
          rect(g, x - 12, y - 12, 26, 26, 'shadow');
          drawAnimalIcon(g, a, x, y, { scale: 1 });
          text(g, a.name.slice(0, 8), x, y + 16, 'bone', { font: 3, center: true });
        });
        text(g, 'ICON BADGES @16px', SW / 2, 12, 'gold', { center: true, font: 7 });
      },
    };
    break;
  }
  case 'ui': {
    const UI = await import('../src/render/uikit.js');
    const { rect, text } = await import('../src/core/pixel.js');
    scene = {
      draw() {
        rect(g, 0, 0, SW, SH, 'deep');
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
        UI.tooltip(g, 410, 116, { title: 'Tooltip', lines: ['clamped inside', `the ${SW}x${SH} frame`], color: 'teal', w: 130 });
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
  case 'summon': {
    const { drawSummoning } = await import('../src/render/cinematic.js');
    const { rect, text } = await import('../src/core/pixel.js');
    const K = process.env.K !== undefined ? Number(process.env.K) : 0.5;
    if (process.env.STRIP) {
      // the whole sequence as a contact sheet, so the beats can be judged together
      const cols = 3, rows = 2, cw = Math.floor(SW / cols), ch = Math.floor(SH / rows);
      scene = {
        update() {},
        draw() {
          rect(g, 0, 0, SW, SH, 'ink');
          for (let i = 0; i < cols * rows; i++) {
            const kk = i / (cols * rows - 1);
            const ox = (i % cols) * cw, oy = Math.floor(i / cols) * ch;
            g.save(); g.beginPath(); g.rect(ox, oy, cw - 2, ch - 2); g.clip();
            g.translate(ox - (SW - cw) / 2, oy - (SH - ch) / 2);
            drawSummoning(g, kk, 1.2 + i * 0.4, {});
            g.restore();
            text(g, 'k=' + kk.toFixed(2), ox + 6, oy + 6, 'gold', { font: 5 });
          }
        },
      };
    } else {
      scene = { update() {}, draw() { rect(g, 0, 0, SW, SH, 'ink'); drawSummoning(g, K, 1.4, {}); } };
    }
    break;
  }
  case 'font': {
    const { text, rect } = await import('../src/core/pixel.js');
    const { FONT5, FONT3, FONT7 } = await import('../src/render/font.js');
    scene = {
      update() {},
      draw() {
        rect(g, 0, 0, SW, SH, 'ink');
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

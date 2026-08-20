// Run summary — win or loss. Reads like a ship's log.

import { rect, frame, text, textW, wash, clamp, lerp } from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import { createSeascape } from '../render/seascape.js';
import * as UI from '../render/uikit.js';
import { drawAnimalIcon } from '../render/sprites.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { HABITAT_BY_ID } from '../data/habitats.js';
import { caravanBreakdown } from '../game/run.js';

export function makeGameOverScene() {
  let run = null, won = false, onDone = null;
  let sea = null, parts = null, t = 0, kk = 0;
  const again = UI.rectOf(226, 288, 188, 26);

  function draw(g) {
    sea.draw(g, {
      x: 0, y: 0, w: 640, h: 360, horizonY: 150,
      timeOfDay: won ? 0.2 : 0.78, storm: won ? 0 : 0.7, parallax: 0.6, reflect: true,
    });
    wash(g, 0, 0, 640, 360, won ? 'gold' : 'ink', won ? 0.06 : 0.42);
    parts.draw(g, 'back');

    const k = Ease.outBack(clamp(kk, 0, 1));
    const yy = Math.round(lerp(-70, 34, k));
    const s2 = run.stats;

    // --- headline
    const title = won ? 'THE ARK MAKES LANDFALL' : 'THE ARK IS LOST';
    // a scrim behind the headline: gold on a pale morning sky has no contrast
    const tw = textW(title, { scale: 2 }) + 24;
    wash(g, 320 - tw / 2, yy + 10, tw, 22, 'ink', 0.55);
    text(g, title, 320, yy + 18, 'ink', { center: true, scale: 2 });
    text(g, title, 320, yy + 16, won ? 'gold' : 'red2', { center: true, scale: 2, shadow: 'ink' });
    text(g, won ? 'every habitat filled, every ante survived'
      : `the water took you on ante ${Math.max(1, run.ante)}`,
      320, yy + 38, 'bone', { font: 3, center: true });

    // --- the log: dark plates, because pale text on brass cannot be read
    const antes = won ? 8 : Math.max(0, run.ante - 1);
    const rows = [
      ['Antes survived', `${antes} / 8`, antes >= 8 ? 'gold' : 'white'],
      ['Blinds cleared', String(s2.blindsCleared), 'white'],
      ['Animals rehomed', String(s2.exact), 'green1'],
      ['Wrong gates', String(s2.wrong), s2.wrong > s2.exact ? 'red2' : 'grey2'],
      ['Animals devoured', String(s2.eaten), 'red2'],
      ['Best single shot', String(s2.bestShot), 'gold'],
      ['Shots taken', String(s2.shotsTaken), 'white'],
      ['Money earned', '$' + s2.moneyEarned, 'brass3'],
      ['Crates unloaded', String(s2.cratesBought), 'sky'],
    ];
    UI.panel(g, 34, yy + 52, 262, 124, { style: 'slate', shadow: true, title: "SHIP'S LOG" });
    rows.forEach((r, i) => {
      const ry = yy + 62 + i * 12;
      if (i % 2 === 0) rect(g, 38, ry - 1, 254, 11, 'deep');
      text(g, r[0], 44, ry + 1, 'grey2', { font: 3 });
      text(g, r[1], 288, ry, r[2], { right: true, font: 3 });
    });

    // --- census
    UI.panel(g, 306, yy + 52, 300, 124, { style: 'slate', shadow: true, title: 'FINAL CARAVAN' });
    const cb = caravanBreakdown(run);
    const homes = Object.keys(cb.byHome).sort((a, b) => cb.byHome[b] - cb.byHome[a]);
    homes.slice(0, 9).forEach((hid, i) => {
      const hab = HABITAT_BY_ID[hid];
      if (!hab) return;
      const cxx = 314 + (i % 2) * 148;
      const cyy = yy + 62 + Math.floor(i / 2) * 12;
      rect(g, cxx, cyy - 1, 142, 11, i % 4 < 2 ? 'deep' : 'shadow');
      rect(g, cxx, cyy - 1, 2, 11, hab.color);
      UI.icon(g, hab.icon, cxx + 4, cyy, { color: hab.accent || hab.color });
      text(g, hab.name, cxx + 16, cyy + 1, 'bone', { font: 3 });
      text(g, 'x' + cb.byHome[hid], cxx + 138, cyy + 1, 'white', { font: 3, right: true });
    });
    text(g, `${cb.total} animals aboard`, 596, yy + 164, 'brass2', { font: 3, right: true });

    // --- relics
    UI.panel(g, 34, yy + 182, 262, 46, { style: 'slate', shadow: true, corners: false });
    text(g, 'RELICS CARRIED', 40, yy + 186, 'brass2', { font: 3 });
    if (run.relics.length) {
      run.relics.forEach((r, i) => {
        const rx = 40 + i * 16, ry = yy + 196;
        rect(g, rx, ry, 14, 14, 'ink');
        frame(g, rx, ry, 14, 14, UI.RARITY_COLOR[r.rarity] || 'grey2');
        UI.icon(g, (r.art && r.art.icon) || 'gem', rx + 3, ry + 3, { color: (r.art && r.art.fg) || 'brass3' });
      });
    } else {
      text(g, 'none — you played it bare', 40, yy + 200, 'grey1', { font: 3 });
    }

    // --- the animals you saved
    UI.panel(g, 306, yy + 182, 300, 46, { style: 'slate', shadow: true, corners: false });
    text(g, 'ABOARD', 312, yy + 186, 'brass2', { font: 3 });
    const uniq = Array.from(new Set(run.caravan)).slice(0, 46);
    uniq.forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (!a) return;
      drawAnimalIcon(g, a, 318 + (i % 23) * 12, yy + 202 + Math.floor(i / 23) * 12, { scale: 1 });
    });

    const sw = textW('SEED  ' + run.seed, { font: 3 }) + 12;
    wash(g, 320 - sw / 2, yy + 232, sw, 9, 'ink', 0.5);
    text(g, 'SEED  ' + run.seed, 320, yy + 234, 'foam', { font: 3, center: true });
    UI.button(g, again, 'BACK TO THE HARBOUR', {
      state: UI.hover(again, Input.mouse) ? 'hover' : 'idle', color: won ? 'brass1' : 'wood2',
    });
    parts.draw(g, 'front');
  }

  function update(dt) {
    t += dt;
    kk = approach(kk, 1, 3.4, dt);
    sea.update(dt);
    parts.update(dt);
    if (won && t % 0.5 < dt) parts.emit('confetti', 60 + ((t * 137) % 520), -6, { count: 6, speed: 40, life: 3 });
    if ((Input.mouse.pressed && UI.hover(again, Input.mouse)) || Input.pressed('Enter')) {
      Audio.sfx('click');
      if (onDone) onDone();
    }
  }

  return {
    enter(args) {
      run = args.run; won = !!args.won; onDone = args.onDone;
      sea = createSeascape(run.seed + '/end', {});
      parts = createParticles({ limit: 400, seed: run.seed + '/end' });
      t = 0; kk = 0;
      Audio.music(won ? 'victory' : 'gameover');
      Audio.sfx(won ? 'fanfare' : 'fail');
    },
    exit() { Audio.stopMusic(0.5); },
    update, draw,
    debug() { return { rects: { again }, run, won }; },
  };
}

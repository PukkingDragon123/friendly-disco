// Run summary — win or loss. Reads like a ship's log.

import { rect, frame, text, textW, wash, clamp, lerp, W, H } from '../core/pixel.js';
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
  const again = UI.rectOf(W / 2 - 140, H - 52, 280, 34);

  function draw(g) {
    sea.draw(g, {
      x: 0, y: 0, w: W, h: H, horizonY: 224,
      timeOfDay: won ? 0.2 : 0.78, storm: won ? 0 : 0.7, parallax: 0.6, reflect: true,
    });
    wash(g, 0, 0, W, H, won ? 'gold' : 'ink', won ? 0.06 : 0.42);
    parts.draw(g, 'back');

    const k = Ease.outBack(clamp(kk, 0, 1));
    const yy = Math.round(lerp(-100, 24, k));
    const s2 = run.stats;

    // --- headline
    const title = won ? 'THE ARK MAKES LANDFALL' : 'THE ARK IS LOST';
    // a scrim behind the headline: gold on a pale morning sky has no contrast
    const sub = won ? 'every animal in a berth it could live in, every ante survived'
      : `the water took the deck on ante ${Math.max(1, run.ante)}`;
    const tw = Math.max(textW(title, { scale: 3, font: 7 }), textW(sub, { font: 5 })) + 40;
    // one scrim covering headline AND subtitle: the subtitle sits over pale morning
    // sky on a win, and dark type on that has no contrast at all
    wash(g, W / 2 - tw / 2, yy + 8, tw, 60, 'ink', 0.62);
    rect(g, W / 2 - tw / 2, yy + 8, tw, 1, won ? 'brass1' : 'red0');
    rect(g, W / 2 - tw / 2, yy + 67, tw, 1, won ? 'brass1' : 'red0');
    text(g, title, W / 2, yy + 18, 'ink', { center: true, scale: 3, font: 7 });
    text(g, title, W / 2, yy + 15, won ? 'gold' : 'red2', { center: true, scale: 3, font: 7, shadow: 'ink' });
    text(g, sub, W / 2, yy + 52, 'bone', { font: 5, center: true, shadow: 'ink' });

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
    const LOG_X = 46, LOG_W = 400;
    UI.panel(g, LOG_X, yy + 74, LOG_W, 190, { style: 'slate', shadow: true, title: "SHIP'S LOG" });
    rows.forEach((r, i) => {
      const ry = yy + 90 + i * 19;
      if (i % 2 === 0) rect(g, LOG_X + 4, ry - 2, LOG_W - 8, 18, 'deep');
      text(g, r[0], LOG_X + 12, ry + 2, 'grey2', { font: 5 });
      text(g, r[1], LOG_X + LOG_W - 12, ry, r[2], { right: true, font: 7 });
    });

    // --- census
    const CEN_X = 460, CEN_W = W - CEN_X - 46;
    UI.panel(g, CEN_X, yy + 74, CEN_W, 190, { style: 'slate', shadow: true, title: 'WHAT THEY WANTED' });
    const cb = caravanBreakdown(run);
    const homes = Object.keys(cb.byHome).sort((a, b) => cb.byHome[b] - cb.byHome[a]);
    const maxN = Math.max(1, ...homes.map((h) => cb.byHome[h]));
    homes.slice(0, 9).forEach((hid, i) => {
      const hab = HABITAT_BY_ID[hid];
      if (!hab) return;
      const cxx = CEN_X + 8;
      const cyy = yy + 90 + i * 19;
      const rw = CEN_W - 16;
      rect(g, cxx, cyy - 2, rw, 18, i % 2 ? 'deep' : 'shadow');
      rect(g, cxx, cyy - 2, 3, 18, hab.color);
      UI.icon(g, hab.icon, cxx + 8, cyy + 1, { color: hab.accent || hab.color });
      text(g, hab.name, cxx + 22, cyy + 2, 'bone', { font: 5 });
      // a bar, so the shape of the caravan is legible at a glance
      const bw = Math.round((rw - 150) * (cb.byHome[hid] / maxN));
      rect(g, cxx + 96, cyy + 3, bw, 9, hab.color);
      rect(g, cxx + 96, cyy + 3, bw, 2, 'white');
      text(g, 'x' + cb.byHome[hid], cxx + rw - 8, cyy, 'white', { font: 7, right: true });
    });
    text(g, `${cb.total} animals aboard`, CEN_X + CEN_W - 8, yy + 250, 'brass2', { font: 5, right: true });

    // --- relics
    UI.panel(g, LOG_X, yy + 272, LOG_W, 72, { style: 'slate', shadow: true, corners: false });
    text(g, 'RELICS CARRIED', LOG_X + 10, yy + 278, 'brass2', { font: 5 });
    if (run.relics.length) {
      run.relics.forEach((r, i) => {
        const rx = LOG_X + 10 + (i % 12) * 32, ry = yy + 296 + Math.floor(i / 12) * 26;
        rect(g, rx, ry, 26, 26, 'ink');
        frame(g, rx, ry, 26, 26, UI.RARITY_COLOR[r.rarity] || 'grey2');
        UI.icon(g, (r.art && r.art.icon) || 'gem', rx + 5, ry + 5, { color: (r.art && r.art.fg) || 'brass3', scale: 2 });
      });
    } else {
      text(g, 'none — you played it bare', LOG_X + 10, yy + 302, 'grey1', { font: 5 });
    }

    // --- the animals you saved
    UI.panel(g, CEN_X, yy + 272, CEN_W, 72, { style: 'slate', shadow: true, corners: false });
    text(g, 'ABOARD', CEN_X + 10, yy + 278, 'brass2', { font: 5 });
    const uniq = Array.from(new Set(run.caravan)).slice(0, 60);
    uniq.forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (!a) return;
      drawAnimalIcon(g, a, CEN_X + 18 + (i % 20) * 20, yy + 300 + Math.floor(i / 20) * 20, { scale: 1 });
    });

    const sw = textW('SEED  ' + run.seed, { font: 5 }) + 20;
    wash(g, W / 2 - sw / 2, H - 82, sw, 15, 'ink', 0.5);
    text(g, 'SEED  ' + run.seed, W / 2, H - 79, 'foam', { font: 5, center: true });
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
    if (won && t % 0.5 < dt) parts.emit('confetti', 60 + ((t * 137) % (W - 120)), -6, { count: 8, speed: 40, life: 3 });
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

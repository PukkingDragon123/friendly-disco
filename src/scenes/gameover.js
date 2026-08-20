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
  let sea = null, parts = null, t = 0, k = 0;
  const again = UI.rectOf(230, 306, 180, 22);

  function draw(g) {
    sea.draw(g, {
      x: 0, y: 0, w: 640, h: 360, horizonY: 150,
      timeOfDay: won ? 0.2 : 0.78, storm: won ? 0 : 0.7, parallax: 0.6, reflect: true,
    });
    wash(g, 0, 0, 640, 360, won ? 'gold' : 'ink', won ? 0.08 : 0.4);
    parts.draw(g, 'back');

    const yy = lerp(-40, 20, Ease.outBack(clamp(k, 0, 1)));
    UI.panel(g, 90, yy, 460, 276, { style: won ? 'brass' : 'slate', shadow: true });
    text(g, won ? 'THE ARK MAKES LANDFALL' : 'THE ARK IS LOST', 320, yy + 8, won ? 'gold' : 'red2', { center: true, outline: 'ink' });
    text(g, won ? 'every habitat filled, every ante survived' : `you went down on ante ${run.ante}`, 320, yy + 22, 'bone', { font: 3, center: true });

    const s = run.stats;
    const rows = [
      ['Antes survived', `${Math.max(0, run.ante - (won ? 0 : 1))} / 8`],
      ['Blinds cleared', String(s.blindsCleared)],
      ['Animals rehomed', String(s.exact)],
      ['Wrong gates', String(s.wrong)],
      ['Animals devoured', String(s.eaten)],
      ['Best single shot', String(s.bestShot)],
      ['Shots taken', String(s.shotsTaken)],
      ['Money earned', '$' + s.moneyEarned],
      ['Crates unloaded', String(s.cratesBought)],
    ];
    rows.forEach((r, i) => {
      const ry = yy + 40 + i * 11;
      text(g, r[0], 108, ry, 'grey2', { font: 3 });
      text(g, r[1], 300, ry, 'white', { font: 3, right: true });
    });

    // caravan census on the right
    text(g, 'FINAL CARAVAN', 318, yy + 38, 'brass2', { font: 3 });
    const cb = caravanBreakdown(run);
    let cy = yy + 48;
    for (const hid of Object.keys(cb.byHome)) {
      const hab = HABITAT_BY_ID[hid];
      if (!hab) continue;
      UI.icon(g, hab.icon, 318, cy, { color: hab.color });
      text(g, `${hab.name} x${cb.byHome[hid]}`, 330, cy + 2, 'bone', { font: 3 });
      cy += 10;
    }

    // relic row
    text(g, 'RELICS CARRIED', 318, yy + 152, 'brass2', { font: 3 });
    run.relics.forEach((r, i) => {
      const rx = 318 + (i % 6) * 16, ry = yy + 162 + Math.floor(i / 6) * 16;
      rect(g, rx, ry, 14, 14, 'ink');
      frame(g, rx, ry, 14, 14, UI.RARITY_COLOR[r.rarity] || 'grey2');
      UI.icon(g, (r.art && r.art.icon) || 'gem', rx + 3, ry + 3, { color: (r.art && r.art.fg) || 'brass3' });
    });

    // a parade of the animals you saved
    text(g, 'ABOARD', 108, yy + 152, 'brass2', { font: 3 });
    const uniq = Array.from(new Set(run.caravan)).slice(0, 40);
    uniq.forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (!a) return;
      drawAnimalIcon(g, a, 112 + (i % 16) * 12, yy + 168 + Math.floor(i / 16) * 12, { scale: 1 });
    });

    text(g, 'SEED  ' + run.seed, 320, yy + 244, 'grey1', { font: 3, center: true });
    UI.button(g, again, 'BACK TO THE HARBOUR', {
      state: UI.hover(again, Input.mouse) ? 'hover' : 'idle', color: won ? 'brass1' : 'wood2',
    });
    parts.draw(g, 'front');
  }

  function update(dt) {
    t += dt;
    k = approach(k, 1, 3.4, dt);
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
      t = 0; k = 0;
      Audio.music(won ? 'victory' : 'gameover');
      Audio.sfx(won ? 'fanfare' : 'fail');
    },
    exit() { Audio.stopMusic(0.5); },
    update, draw,
  };
}

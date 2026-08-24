// THE MANIFEST — what the voyage came to.
//
// Not a score. A LIST OF NAMES, in three columns: who is in the garden, who is still on
// the deck, and who the water took. The numbers are along the bottom because they matter
// less: a run of this game is remembered as "I lost the elephant on the volcano", and the
// summary should be able to say that back.

import { rect, frame, px, text, textW, wrap, wash, clamp, lerp, W, H } from '../core/pixel.js';
import { P, mix } from '../core/palette.js';
import { Input } from '../core/input.js';
import { Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import { createSeascape } from '../render/seascape.js';
import * as UI from '../render/uikit.js';
import { drawAnimal } from '../render/sprites.js';
import { drawFolk } from '../render/folk.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { CHAPTERS, LEGS_PER_CHAPTER, capacity, gardenSize } from '../game/voyage.js';
import { activeFlags } from '../game/choices.js';

export function makeGameOverScene() {
  let v = null, won = false, onDone = null;
  let sea = null, parts = null, t = 0, kk = 0;
  const again = UI.rectOf(W / 2 - 150, H - 46, 300, 32);

  /** One column of names, with the animals themselves in it. */
  function column(g, x, y, w, h, title, ids, colour, o = {}) {
    UI.panel(g, x, y, w, h, { style: 'slate', shadow: true });
    UI.panelTitle(g, x, y + 6, w, title, { color: colour });
    text(g, o.sub || `${ids.length}`, x + w / 2, y + 22, colour, { font: 5, center: true });
    const cols = Math.max(1, Math.floor((w - 16) / 30));
    const rows = Math.floor((h - 44) / 30);
    ids.slice(0, cols * rows).forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (!a) return;
      const ax = x + 8 + 15 + (i % cols) * 30;
      const ay = y + 40 + 14 + Math.floor(i / cols) * 30;
      drawAnimal(g, a, ax, ay, {
        scale: 1,
        alpha: o.faded ? 0.5 : 1,
        mood: o.faded ? 'blink' : 'happy',
      });
      if (o.faded) {
        // a waterline through each one, because that is what happened to them
        for (let k = 0; k < 3; k++) rect(g, ax - 12, ay + 6 + k * 3, 24, 1, 'water2');
      }
    });
    if (ids.length > cols * rows) {
      text(g, `+${ids.length - cols * rows} more`, x + w / 2, y + h - 14, 'grey2',
        { font: 3, center: true });
    }
    if (!ids.length) {
      text(g, o.empty || 'nobody', x + w / 2, y + h / 2, 'grey1', { font: 3, center: true });
    }
  }

  function draw(g) {
    sea.draw(g, {
      x: 0, y: 0, w: W, h: H, horizonY: 210,
      timeOfDay: won ? 0.18 : 0.74, storm: won ? 0 : 0.7, parallax: 0.6, reflect: true,
    });
    wash(g, 0, 0, W, H, won ? 'gold' : 'ink', won ? 0.06 : 0.44);
    parts.draw(g, 'back');

    const k = Ease.outBack(clamp(kk, 0, 1));
    const yy = Math.round(lerp(-90, 16, k));
    const s = v.stats;
    const saved = v.eden.length + v.aboard.length;

    // --- the headline
    const title = won ? 'LANDFALL' : 'THE WATER WON';
    const sub = won
      ? `${saved} animal${saved === 1 ? '' : 's'} came through it with you`
      : `the ocean closed on chapter ${v.chapter}, leg ${v.leg}`;
    const tw = Math.max(textW(title, { scale: 3, font: 7 }), textW(sub, { font: 5 })) + 44;
    wash(g, W / 2 - tw / 2, yy + 6, tw, 58, 'ink', 0.66);
    rect(g, W / 2 - tw / 2, yy + 6, tw, 1, won ? 'brass1' : 'red0');
    rect(g, W / 2 - tw / 2, yy + 63, tw, 1, won ? 'brass1' : 'red0');
    text(g, title, W / 2, yy + 16, 'ink', { center: true, scale: 3, font: 7 });
    text(g, title, W / 2, yy + 13, won ? 'gold' : 'red2',
      { center: true, scale: 3, font: 7, shadow: 'ink' });
    text(g, sub, W / 2, yy + 48, 'cream', { font: 5, center: true, shadow: 'ink' });

    // --- the three columns of names
    const cy = 96, ch = 250;
    const cw = 292;
    column(g, 20, cy, cw, ch, 'IN THE GARDEN', v.eden, 'leaf4',
      { sub: `${v.eden.length} / ${gardenSize(v)} safe for good`, empty: 'you never stowed one' });
    column(g, 20 + cw + 18, cy, cw, ch, 'STILL ABOARD', v.aboard, 'cream',
      { sub: `${v.aboard.length} / ${capacity(v)} on the deck`, empty: 'the deck is bare' });
    column(g, 20 + (cw + 18) * 2, cy, cw, ch, 'TAKEN BY THE FLOOD', v.lost.concat([]), 'red2',
      { faded: true, sub: `${s.drowned} lost in all`, empty: 'not one. remarkable.' });

    // --- the golem, and the numbers
    drawFolk(g, 'golem', 60, H - 60, t, { scale: 2, pose: won ? 'happy' : 'idle', mud: 0.4 });

    const rows = [
      ['Chapters', `${Math.min(v.chapter, CHAPTERS)} / ${CHAPTERS}`, 'cream'],
      ['Crossings', String(s.legs), 'cream'],
      ['Islands worked', String(s.islands), 'leaf4'],
      ['Saved', String(s.rescued), 'leaf4'],
      ['Lost', String(s.drowned), s.drowned > s.rescued ? 'red2' : 'parch1'],
      ['Best island', String(s.bestRescue), 'gold'],
      ['Paths opened', String(s.obstaclesCleared), 'brass3'],
      ['Apples spent', String(s.applesUsed), 'red2'],
      ['Sold on', String(s.sold), 'brass3'],
      ['Purse', '$' + v.money, 'brass3'],
    ];
    const LX = 130, LW = 700;
    UI.panel(g, LX, cy + ch + 12, LW, 62, { style: 'wood', shadow: true });
    rows.forEach((r, i) => {
      const rx = LX + 12 + (i % 5) * 138;
      const ry = cy + ch + 20 + Math.floor(i / 5) * 24;
      text(g, r[0].toUpperCase(), rx, ry, 'parch1', { font: 3 });
      text(g, r[1], rx, ry + 9, r[2], { font: 7 });
    });

    // the loyal ones get a line of their own: they are the run's friendships
    if (v.loyal.length) {
      const msg = `${v.loyal.length} would not leave you`;
      text(g, msg, W - 20, cy + ch + 82, 'gold', { font: 5, right: true, shadow: 'ink' });
    }

    // WHAT IS TRUE OF YOU. The flags a run leaves behind are the only part of a summary
    // that is about the player rather than about the numbers, so they go in plain words.
    const flags = activeFlags(v);
    if (flags.length) {
      text(g, 'WHAT IS TRUE OF YOU', 22, cy + ch + 82, 'parch1', { font: 3, shadow: 'ink' });
      let fx = 22;
      for (const f of flags.slice(0, 4)) {
        const label = f.text.split('.')[0];
        const fw = textW(label, { font: 3 }) + 12;
        if (fx + fw > W - 260) break;
        wash(g, fx, cy + ch + 92, fw, 12, 'ink', 0.7);
        rect(g, fx, cy + ch + 92, 2, 12, f.id === 'robbed' || f.id === 'greedy' ? 'red2' : 'leaf3');
        text(g, label, fx + 7, cy + ch + 95, 'cream', { font: 3 });
        fx += fw + 5;
      }
    }

    const sw = textW('SEED  ' + v.seed, { font: 5 }) + 20;
    wash(g, W / 2 - sw / 2, H - 74, sw, 12, 'ink', 0.6);
    text(g, 'SEED  ' + v.seed, W / 2, H - 72, 'foam', { font: 5, center: true });

    UI.button(g, again, 'ANOTHER VOYAGE', {
      state: UI.hover(again, Input.mouse) ? 'hover' : 'idle',
      color: won ? 'green0' : 'wood2', icon: 'boat',
    });
    parts.draw(g, 'front');
    void px; void frame; void mix; void P; void wrap; void LEGS_PER_CHAPTER;
  }

  function update(dt) {
    t += dt;
    kk = approach(kk, 1, 2.2, dt);
    sea.update(dt);
    parts.update(dt);
    if (won && Math.floor(t * 2) !== Math.floor((t - dt) * 2)) {
      parts.emit('confetti', W / 2 + Math.sin(t) * 200, 40, { count: 4, speed: 70, color: 'gold' });
    }
    const m = Input.mouse;
    if ((m.pressed && UI.hover(again, m)) || Input.pressed('Enter')) {
      Audio.sfx('click');
      if (onDone) onDone();
    }
  }

  return {
    enter(args, api) {
      void api;
      v = args.voyage || args.run;
      won = !!args.won;
      onDone = args.onDone;
      t = 0; kk = 0;
      sea = createSeascape(v.seed + '/end', {});
      parts = createParticles({ limit: 300, seed: v.seed + '/end' });
      Audio.music(won ? 'harbour' : 'gameover');
      Audio.sfx(won ? 'fanfare' : 'fail');
    },
    exit() { Audio.stopMusic(0.5); },
    update, draw,
    debug() { return { voyage: v, won, rects: { again } }; },
  };
}

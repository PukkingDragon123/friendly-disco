// HEAVEN, which in this game is a room you report to.
//
// The walk scene ends with a man dying and handing you an errand. Everything after it is
// that errand, and an errand needs somebody to hand the work back to -- so at the end of
// every chapter, and at the end of the run, you come here and Noah tells you what he
// makes of it. He is whole again, he is not in a hurry any more, and the animals you did
// NOT manage to carry are sitting around him.
//
// That last part is the whole reason this scene exists. A lost animal in a roguelike is
// a number in a summary; a lost animal standing in the grass behind the man you promised
// is the same number and it costs something to look at.

import { P, col, mix } from '../core/palette.js';
import {
  rect, px, disc, ellipse, tri, text, textW, wrap, wash, clamp, lerp, W, H,
} from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import * as UI from '../render/uikit.js';
import { drawFolk } from '../render/folk.js';
import { drawAnimal } from '../render/sprites.js';
import { drawPlant } from '../render/flora.js';
import { ANIMAL_BY_ID } from '../data/animals.js';

const GY = 428;                      // the cloud floor
const NOAH_X = 566;
const HERO_X = 320;

function h(n) { const v = Math.sin(n * 51.13 + 7.77) * 43758.5453; return v - Math.floor(v); }

export function makeHeavenScene() {
  let v = null, onDone = null, lines = [], title = '';
  let parts = null;
  let t = 0, intro = 0, outT = -1;
  let ix = 0, typed = 0;
  let goRect = UI.rectOf(0, 0, 0, 0);

  function cur() { return lines[ix] || null; }
  function full() { const l = cur(); return !l || typed >= l.length; }

  function advance() {
    if (!full()) { typed = cur().length; Audio.sfx('click'); return; }
    if (ix >= lines.length - 1) { outT = 0; Audio.sfx('sparkle'); return; }
    ix++; typed = 0;
    Audio.sfx('deal', { vol: 0.4 });
  }

  /* ------------------------------------------------------------------- draw */

  function drawSky(g) {
    for (let y = 0; y < GY + 40; y++) {
      const f = y / (GY + 40);
      rect(g, 0, y, W, 1, f < 0.3 ? mix(P.cream, P.sky, 0.35 - f)
        : f < 0.62 ? mix(P.cream, P.gold, (f - 0.3) * 1.4) : mix(P.gold, P.brass2, (f - 0.62) * 1.1));
    }
    // the light everything here comes from: high, and behind him
    const sx = NOAH_X + 40, sy = 120;
    for (let i = 13; i >= 1; i--) {
      wash(g, sx - 30 * i, sy - 22 * i, 60 * i, 44 * i, 'white', 0.02);
    }
    disc(g, sx, sy, 40, 'cream');
    disc(g, sx, sy, 32, 'white');
    // rays, turning very slowly
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + t * 0.06;
      const len = 300 + Math.sin(t * 0.4 + i) * 40;
      g.globalAlpha = 0.05;
      tri(g, sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len,
        sx + Math.cos(a + 0.09) * len, sy + Math.sin(a + 0.09) * len, 'white');
      g.globalAlpha = 1;
    }
    // cloud banks, drifting
    for (let i = 0; i < 11; i++) {
      const cx = ((h(i) * (W + 300)) + t * (3 + h(i * 3) * 5)) % (W + 300) - 150;
      const cy = 90 + h(i * 5) * 220;
      const cw = 60 + h(i * 7) * 110;
      for (let k = 0; k < 4; k++) {
        const f = k / 3 - 0.5;
        ellipse(g, cx + f * cw, cy + Math.abs(f) * 14, cw * 0.4, 16 + h(i + k) * 10, 'white');
      }
      ellipse(g, cx, cy + 12, cw * 0.5, 12, 'cream');
    }
  }

  /** The floor: cloud, packed hard enough to stand on, with grass growing out of it. */
  function drawGround(g) {
    for (let x = -40; x < W + 40; x += 22) {
      const r = 26 + h(x * 1.3) * 22;
      disc(g, x, GY + 18, r, 'white');
      disc(g, x + 8, GY + 26, r * 0.8, 'cream');
    }
    rect(g, 0, GY + 28, W, H - GY - 28, 'cream');
    rect(g, 0, GY + 28, W, 3, 'white');
    for (let y = GY + 40; y < H; y += 6) {
      rect(g, 0, y, W, 2, mix(P.cream, P.parch1, (y - GY - 40) / 100));
    }
    // grass, because he would have planted some
    for (let i = 0; i < 46; i++) {
      const x = h(i * 9) * W;
      drawPlant(g, x, GY + 34 + (i % 3) * 10, i % 5 === 0 ? 'flower' : 'tuft',
        { biome: 'sacred', v: i % 4, t });
    }
    // and a bench, with room on it
    const bx = NOAH_X + 62;
    rect(g, bx, GY - 14, 96, 8, 'wood2');
    rect(g, bx, GY - 14, 96, 3, 'wood3');
    rect(g, bx + 4, GY - 6, 8, 22, 'wood1');
    rect(g, bx + 84, GY - 6, 8, 22, 'wood1');
    rect(g, bx, GY - 34, 96, 6, 'wood2');
    rect(g, bx + 2, GY - 30, 4, 18, 'wood1');
  }

  /**
   * The ones who did not make it, on a shelf of cloud behind him.
   *
   * ON A SHELF, and high enough to clear the sheet he talks on: they are the point of the
   * scene, and the first cut had the dialogue box sitting on top of every one of them.
   */
  function drawLost(g) {
    const lost = (v && v.lost ? v.lost : []).slice(0, 8);
    const sx = NOAH_X + 168, sy = GY - 74;
    for (let x = sx; x < W + 40; x += 20) {
      disc(g, x, sy + 16, 24, 'white');
      disc(g, x + 6, sy + 22, 18, 'cream');
    }
    rect(g, sx - 20, sy + 20, W - sx + 60, 12, 'cream');
    lost.forEach((rec, i) => {
      const id = typeof rec === 'string' ? rec : (rec && rec.id);
      const a = ANIMAL_BY_ID[id];
      if (!a) return;
      const x = sx + 30 + (i % 4) * 66 - (i % 2) * 14;
      const y = sy + 18 - Math.floor(i / 4) * 40;
      drawAnimal(g, a, x, y, { scale: 0.5, flip: i % 2 === 0, t, mood: 'idle' });
    });
    if (lost.length) {
      const cap = `${lost.length} GOT HERE BEFORE YOU`;
      const cw = textW(cap, { font: 3 }) + 12;
      rect(g, sx + 10, sy + 34, cw, 12, 'wood0');
      text(g, cap, sx + 16, sy + 37, 'parch1', { font: 3 });
    }
  }

  function draw(g) {
    drawSky(g);
    drawGround(g);
    drawLost(g);

    // Noah, whole, and in no hurry at all
    // He is a man and it is a hundredweight of riverbank: the same two sizes as the
    // causeway, so the reunion reads as the same two people.
    drawFolk(g, 'noah', NOAH_X, GY, t, {
      scale: 1, pose: full() ? 'happy' : 'talk', talking: !full(),
    });
    // the golem, still made of a riverbank, still standing where it is put
    drawFolk(g, 'golem', HERO_X, GY, t, { scale: 2, pose: 'idle', mud: 0.2, sparkle: 0.5 });
    parts.draw(g, 'front');

    // doves
    for (let i = 0; i < 5; i++) {
      const x = ((h(i * 13) * W) + t * (18 + i * 6)) % (W + 80) - 40;
      const y = 150 + h(i * 17) * 180 + Math.sin(t * 2 + i) * 8;
      const fl = Math.sin(t * 8 + i) * 4;
      disc(g, x, y, 4, 'white');
      tri(g, x - 3, y, x - 14, y - 5 + fl, x - 2, y + 4, 'white');
      tri(g, x + 3, y, x + 14, y - 5 - fl, x + 2, y + 4, 'cream');
    }

    if (title) {
      const tw = textW(title, { font: 7 }) + 44;
      rect(g, (W - tw) / 2, 22, tw, 30, 'wood0');
      rect(g, (W - tw) / 2 + 3, 25, tw - 6, 24, mix(col('brass1'), P.ink, 0.5));
      text(g, title, W / 2, 31, 'cream', { font: 7, center: true, shadow: 'ink' });
    }

    // what he has to say about it
    const l = cur();
    if (l) {
      const bw = W - 300, bh = 104, bx = 70, by = H - bh - 18;
      UI.panel(g, bx, by, bw, bh, { style: 'paper', shadow: true });
      const nw = textW('NOAH', { font: 7 }) + 34;
      rect(g, bx + 26, by - 13, nw, 26, 'wood0');
      rect(g, bx + 29, by - 10, nw - 6, 20, mix(col('brass3'), P.ink, 0.6));
      rect(g, bx + 29, by - 10, nw - 6, 3, 'brass3');
      text(g, 'NOAH', bx + 26 + nw / 2, by - 6, 'brass3', { font: 7, center: true, shadow: 'ink' });
      wrap(l.slice(0, Math.floor(typed)), bw - 60, { font: 7 }).slice(0, 3).forEach((r, i) => {
        text(g, r, bx + 30, by + 26 + i * 24, 'wood0', { font: 7 });
      });
      for (let i = 0; i < lines.length; i++) {
        rect(g, bx + 30 + i * 12, by + bh - 16, 8, 5,
          i < ix ? 'parch1' : i === ix ? 'brass2' : 'parch0');
      }
      if (full()) {
        goRect = UI.rectOf(bx + bw - 190, by + bh - 40, 170, 28);
        UI.button(g, goRect, ix >= lines.length - 1 ? 'BACK TO THE BOAT' : 'GO ON', {
          state: UI.hover(goRect, Input.mouse) ? 'hover' : 'idle', color: 'wood2', font: 5,
        });
      }
    }

    if (outT >= 0) wash(g, 0, 0, W, H, 'white', Ease.inQuad(clamp(outT / 0.8, 0, 1)));
    else if (intro < 1) wash(g, 0, 0, W, H, 'white', (1 - Ease.outCubic(clamp(intro, 0, 1))));
  }

  /* ----------------------------------------------------------------- update */

  function update(dt) {
    t += dt;
    intro = approach(intro, 1, 1.6, dt);
    parts.update(dt);
    if (outT >= 0) {
      outT += dt;
      if (outT > 0.8 && onDone) { const f = onDone; onDone = null; f(); }
      return;
    }
    const l = cur();
    if (l && typed < l.length) {
      const prev = typed;
      typed = Math.min(l.length, typed + dt * 46);
      if (Math.floor(typed / 3) !== Math.floor(prev / 3)) Audio.sfx('tick', { vol: 0.18, rate: 1.1 });
    }
    if (Input.mouse.pressed || Input.pressed('Space') || Input.pressed('Enter')) advance();
    if (Input.pressed('Escape')) { outT = 0; }
  }

  return {
    enter(args) {
      v = args.voyage || args.run || null;
      onDone = args.onDone;
      lines = (args.lines || []).slice();
      title = args.title || 'A SEAT BY HIM';
      t = 0; intro = 0; outT = -1; ix = 0; typed = 0;
      parts = createParticles({ limit: 90, seed: 'heaven' });
      Audio.music('victory');
    },
    exit() { Audio.stopMusic(0.6); },
    update,
    draw,
    debug() {
      return {
        heaven: true, ix, lines: lines.length, title,
        rects: { go: goRect },
        skip() { outT = 0; },
      };
    },
  };
}

// A DECISION, on the way in.
//
// Two or three options and no right answer. The scene is deliberately still and quiet --
// the island sits on the horizon behind it, the water moves, and nothing else does --
// because the whole job of this screen is to make somebody read three sentences and then
// pick one, and animation is the enemy of that.
//
// The costs are printed. Every option says what it takes as well as what it gives,
// because a choice where you can only see the upside is not a choice.

import { P, col, mix } from '../core/palette.js';
import {
  rect, frame, px, text, textW, wrap, wash, disc, clamp, W, H,
} from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import * as UI from '../render/uikit.js';
import { drawFolkPortrait, FOLK_IDS } from '../render/folk.js';
import { drawIslandFar } from '../render/islandart.js';
import { drawBoat } from '../render/boat.js';
import { drawFolk } from '../render/folk.js';
import { applyOption } from '../game/choices.js';

const FOLK_FOR = { shepherd: 'noah', god: 'cherub', angel: 'cherub' };

export function makeChoiceScene() {
  let v = null, enc = null, island = null, onDone = null;
  let parts = null;
  let t = 0, intro = 0;
  let hover = -1, taken = -1, told = [], outT = 0;
  let cardRects = [];
  let goRect = UI.rectOf(0, 0, 0, 0);

  function pick(i) {
    if (taken >= 0) return;
    const opt = enc.options[i];
    if (!opt) return;
    taken = i;
    told = applyOption(v, enc, i);
    outT = 0;
    Audio.sfx('deal');
    Juice.flash('parch', 0.22, 0.25);
    parts.emit('dust', W / 2, H / 2, { count: 10, speed: 60, color: 'parch1' });
  }

  /* ------------------------------------------------------------------- draw */

  function draw(g) {
    // a quiet sea, and the island you have already committed to on the horizon
    for (let y = 0; y < H; y++) {
      const f = y / H;
      rect(g, 0, y, W, 1, f < 0.36 ? mix(P.night, P.water0, f * 2.4)
        : f < 0.44 ? mix(P.water0, P.water1, (f - 0.36) * 8) : mix(P.water1, P.water0, (f - 0.44) * 1.4));
    }
    // the island you have already committed to, in the one corner nothing else uses --
    // it was behind the third option card, which is the same as not drawing it
    if (island) {
      drawIslandFar(g, island, 88, 134, 168, 92, t, { weatherAmt: 0.5 });
      const nm = island.name.toUpperCase();
      wash(g, 8, 138, 160, 20, 'ink', 0.6);
      text(g, 'MAKING FOR', 88, 140, 'parch1', { font: 3, center: true });
      text(g, nm, 88, 148, 'cream', { font: 5, center: true });
    }
    for (let i = 0; i < 26; i++) {
      const y = 220 + ((i * 37) % (H - 240));
      const x = ((i * 191) + Math.floor(t * 14 * (1 + (i % 3)))) % W;
      rect(g, x, y, 3 + (i % 4), 1, i % 3 ? 'water2' : 'foam');
    }
    wash(g, 0, 0, W, H, 'ink', 0.3);

    const k = Ease.outCubic(clamp(intro, 0, 1));

    // the situation, on a sheet of parchment
    const pw = 620, ph = 96;
    const pxx = Math.round((W - pw) / 2), pyy = Math.round(28 + (1 - k) * -20);
    UI.panel(g, pxx, pyy, pw, ph, { style: 'paper', shadow: true });
    text(g, enc.title, pxx + pw / 2, pyy + 10, 'wood0', { font: 7, center: true, scale: 2 });
    (enc.lines || []).slice(0, 3).forEach((l, i) => {
      wrap(l, pw - 32, { font: 5 }).slice(0, 1).forEach((row) => {
        text(g, row, pxx + pw / 2, pyy + 44 + i * 16, 'wood1', { font: 5, center: true });
      });
    });

    // whoever is telling you about it
    const who = FOLK_FOR[enc.who] || enc.who;
    if (FOLK_IDS.indexOf(who) >= 0) {
      drawFolkPortrait(g, who, 20, 150, 150, 196, t, {});
      text(g, String(enc.who).toUpperCase(), 95, 352, 'parch1', { font: 5, center: true });
    }

    // the options
    cardRects = [];
    const n = enc.options.length;
    const cw = Math.min(252, Math.floor((W - 220) / n) - 12);
    const ch = 218;
    const totalW = n * cw + (n - 1) * 14;
    const startX = 190 + Math.round((W - 200 - totalW) / 2);
    const cy = 148;
    enc.options.forEach((opt, i) => {
      const cx = startX + i * (cw + 14);
      const lift = Math.round((1 - Ease.outCubic(clamp(intro * 1.5 - i * 0.12, 0, 1))) * 26);
      const r = UI.rectOf(cx, cy + lift, cw, ch);
      cardRects[i] = r;
      const hot = hover === i && taken < 0;
      const chosen = taken === i;
      const dim = taken >= 0 && !chosen;

      // the taken card stays PAPER with a gold frame: brushed brass under body text is
      // a card you cannot read, and the one you chose is the one you most want to re-read
      UI.panel(g, r.x, r.y, cw, ch, { style: 'paper', shadow: true });
      if (chosen) {
        frame(g, r.x - 2, r.y - 2, cw + 4, ch + 4, 'gold');
        frame(g, r.x - 1, r.y - 1, cw + 2, ch + 2, 'brass2');
      } else if (hot) frame(g, r.x - 1, r.y - 1, cw + 2, ch + 2, 'gold');
      wrap(opt.label, cw - 16, { font: 7 }).slice(0, 2).forEach((l, j) => {
        text(g, l, r.x + cw / 2, r.y + 10 + j * 11, chosen ? 'wood0' : 'wood0',
          { font: 7, center: true });
      });
      UI.divider(g, r.x + 8, r.y + 36, cw - 16, { color: 'parch0', light: 'cream' });
      wrap(opt.blurb, cw - 24, { font: 5 }).slice(0, 5).forEach((l, j) => {
        text(g, l, r.x + 12, r.y + 46 + j * 13, 'wood1', { font: 5 });
      });
      // the cost, said out loud, on its own rule at the foot of the card
      rect(g, r.x + 10, r.y + ch - 52, cw - 20, 1, 'parch0');
      text(g, 'IT COSTS', r.x + 12, r.y + ch - 46, 'red0', { font: 3 });
      wrap(opt.cost || 'nothing', cw - 24, { font: 7 }).slice(0, 2).forEach((l, j) => {
        text(g, l, r.x + 12, r.y + ch - 36 + j * 14, 'rust', { font: 7 });
      });
      if (dim) wash(g, r.x, r.y, cw, ch, 'ink', 0.55);
      if (chosen) {
        UI.ribbon(g, r.x + 8, r.y + ch - 14, cw - 16, 'TAKEN', { color: 'gold', font: 5, h: 13 });
      }
    });

    // THE FOREGROUND. The bottom third of this screen was open water with nothing on it,
    // which reads as a screen somebody stopped laying out. It is the deck you are standing
    // on: the ark on the right, the golem at the rail, and a swell in front of both.
    const SWELL = 388;                       // where the open water starts
    for (let i = 0; i < 90; i++) {
      const f = (i % 12) / 11;
      const sy = SWELL + f * f * (H - SWELL - 6);
      const sx = ((i * 149) + Math.floor(t * (7 + f * 26))) % (W + 80) - 40;
      const len = 5 + Math.round(f * 16);
      rect(g, sx, sy, len, 1 + Math.round(f), f < 0.4 ? 'water2' : 'foam');
      if (i % 4 === 0) rect(g, sx + len, sy + 1 + Math.round(f), 3, 1, 'water3');
    }
    wash(g, 0, SWELL, W, H - SWELL, 'water0', 0.2);
    rect(g, 0, SWELL, W, 2, 'water3');
    drawBoat(g, 786, H + 4, t, {
      tiers: v.tiers, damage: 0, scale: 2, speed: 0.2, wake: false,
    });
    // on the deck, not beside it: the deck of a 3x boat is twenty-four pixels up
    drawFolk(g, 'golem', 786 - 74, H - 20, t, { scale: 1, mud: 0.4, sparkle: 0.2 });

    // what actually happened
    if (taken >= 0) {
      const ow = 600, oh = 62;
      const ox = 40, oy = H - oh - 68;
      const ok = Ease.outCubic(clamp(outT * 2.2, 0, 1));
      wash(g, ox, oy, ow, oh, 'ink', 0.8 * ok);
      frame(g, ox, oy, ow, oh, 'brass1');
      const line = enc.options[taken].outcome || '';
      wrap(line, ow - 24, { font: 5 }).slice(0, 2).forEach((l, i) => {
        text(g, l, ox + 12, oy + 8 + i * 13, 'cream', { font: 5 });
      });
      let tx = ox + 12;
      told.slice(0, 5).forEach((bit) => {
        const bw = textW(bit, { font: 3 }) + 10;
        if (tx + bw > ox + ow - 12) return;
        rect(g, tx, oy + oh - 16, bw, 12, mix(P.brass0, P.ink, 0.3));
        text(g, bit, tx + 5, oy + oh - 13, 'brass3', { font: 3 });
        tx += bw + 4;
      });
      goRect = UI.rectOf(W / 2 - 100, H - 40, 200, 30);
      UI.button(g, goRect, 'GO ASHORE', {
        state: UI.hover(goRect, Input.mouse) ? 'hover' : 'idle', color: 'wood2',
        icon: 'boat', font: 5,
      });
    } else {
      text(g, 'no option here is free, and none of them is the right one',
        W / 2, H - 30, 'parch1', { font: 3, center: true, shadow: 'ink' });
    }

    parts.draw(g, 'front');
    if (intro < 1) wash(g, 0, 0, W, H, 'ink', (1 - k) * 0.9);
    void px; void disc; void col;
  }

  function update(dt) {
    t += dt;
    intro = approach(intro, 1, 2.6, dt);
    parts.update(dt);
    if (taken >= 0) outT += dt;

    const m = Input.mouse;
    hover = -1;
    if (taken < 0) {
      for (let i = 0; i < cardRects.length; i++) {
        if (cardRects[i] && UI.hover(cardRects[i], m)) { hover = i; break; }
      }
    }
    if (m.pressed) {
      if (taken >= 0) {
        if (UI.hover(goRect, m) && onDone) onDone();
      } else if (hover >= 0) pick(hover);
    }
    for (let i = 0; i < 3; i++) if (Input.pressed('Digit' + (i + 1))) pick(i);
    if (taken >= 0 && outT > 0.4 && (Input.pressed('Enter') || Input.pressed('Space'))) {
      if (onDone) onDone();
    }
  }

  return {
    enter(args, api) {
      void api;
      v = args.voyage;
      enc = args.encounter;
      island = args.island || null;
      onDone = args.onDone;
      t = 0; intro = 0; hover = -1; taken = -1; told = []; outT = 0;
      parts = createParticles({ limit: 120, seed: v.seed + '/choice' });
      Audio.music('harbour');
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,
    debug() {
      return {
        voyage: v, encounter: enc, get taken() { return taken; }, told,
        pick, rects: { cards: cardRects, go: goRect },
      };
    },
  };
}

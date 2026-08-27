// Title screen. The ark drifts, animals bob on the deck, the sun goes down behind it.

import {
  rect, frame, box, px, line, disc, ring, ellipse, text, textW, wrap, wash, clamp, lerp, W, H,
} from '../core/pixel.js';
import { P, mix } from '../core/palette.js';
import { Input } from '../core/input.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import { createSeascape } from '../render/seascape.js';
import * as UI from '../render/uikit.js';
import { drawBoat as drawArkSprite } from '../render/boat.js';
import { drawAnimal } from '../render/sprites.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { randomSeedString, makeRng } from '../core/rng.js';

const CAST = ['lion', 'penguin', 'flamingo', 'fox', 'dolphin', 'elephant', 'sheep', 'redpanda'];

export function makeMenuScene() {
  let sea = null, parts = null, onStart = null;
  let t = 0;
  let seed = randomSeedString('title');
  let editing = false;
  let showHelp = false;
  let logoK = 0;

  const btn = {
    start: UI.rectOf(370, 366, 220, 38),
    seed: UI.rectOf(370, 410, 220, 24),
    help: UI.rectOf(370, 440, 106, 24),
    mute: UI.rectOf(484, 440, 106, 24),
  };

  function draw(g) {
    // sky + sea, sun low and warm
    sea.draw(g, { x: 0, y: 0, w: W, h: H, horizonY: 198, timeOfDay: 0.44, storm: 0.05, parallax: 1, reflect: true });

    // --- the ark, drifting
    const bob = Math.sin(t * 0.7) * 2;
    const roll = Math.sin(t * 0.5 + 1) * 0.6;
    drawArk(g, W / 2, 262 + bob, roll);

    parts.draw(g, 'back');

    // --- logo
    const k = Ease.outBack(clamp(logoK, 0, 1));
    const ly = lerp(-90, 62, k);
    drawLogo(g, W / 2, ly);

    // --- menu plate
    UI.panel(g, 358, 352, 244, 128, { style: 'wood', shadow: true });

    const m = Input.mouse;
    UI.button(g, btn.start, 'NEW RUN', {
      state: UI.hover(btn.start, m) ? 'hover' : 'idle', color: 'green0', icon: 'boat',
    });
    UI.button(g, btn.seed, editing ? seed + '_' : 'SEED  ' + seed, {
      state: editing ? 'down' : UI.hover(btn.seed, m) ? 'hover' : 'idle', color: 'wood2',
    });
    UI.button(g, btn.help, 'HOW TO', { state: UI.hover(btn.help, m) ? 'hover' : 'idle', color: 'wood2' });
    UI.button(g, btn.mute, Audio.muted ? 'SOUND OFF' : 'SOUND ON', {
      state: UI.hover(btn.mute, m) ? 'hover' : 'idle', color: Audio.muted ? 'grey0' : 'wood2',
    });

    // ON A PLATE. Two lines of pale type straight onto the water were unreadable the moment
    // the sea got any structure in it: the strapline is the last thing anybody reads before
    // they press New Run, so it gets a board to sit on.
    const s1 = 'a cozy pixel-art rescue roguelike';
    const s2 = 'Noah built the ark. Somebody has to decide who gets on it. You are the golem.';
    const bw = Math.max(textW(s1, { font: 5 }), textW(s2, { font: 5 })) + 28;
    UI.roundRect(g, W / 2 - bw / 2, 484, bw, 40, 6, 'ink');
    UI.roundRect(g, W / 2 - bw / 2 + 1, 485, bw - 2, 38, 5, mix(P.wood0, P.ink, 0.35));
    text(g, s1, W / 2, 490, 'brass3', { font: 5, center: true });
    text(g, s2, W / 2, 506, 'parch1', { font: 5, center: true });

    parts.draw(g, 'front');
    if (showHelp) drawHelp(g);
  }

  function drawLogo(g, cx, y) {
    const w = 420, h = 124;
    const x = cx - w / 2;
    UI.panel(g, x, y, w, h, { style: 'wood', shadow: true, rivets: true });
    // brass sign plate inside the timber
    UI.panel(g, x + 8, y + 6, w - 16, h - 14, { style: 'brass', inset: true, corners: false });

    // stacked wordmark: engraved dark, then the face, so it reads as struck metal
    text(g, 'POCKET', cx, y + 18, 'wood0', { center: true, scale: 3, font: 7 });
    text(g, 'POCKET', cx, y + 16, 'brass3', { center: true, scale: 3, font: 7, shadow: 'wood1' });
    text(g, 'ARK', cx, y + 50, 'wood0', { center: true, scale: 6 });
    text(g, 'ARK', cx, y + 47, 'white', { center: true, scale: 6, shadow: 'brass1' });

    // a dark strip behind the strapline — engraved brass on brass is unreadable
    const strap = 'ONE BOAT · FOUR SEAS · NO ROOM';
    const sw = textW(strap, { font: 5 }) + 22;
    rect(g, cx - sw / 2, y + h - 26, sw, 15, 'wood0');
    rect(g, cx - sw / 2, y + h - 26, sw, 1, 'brass1');
    text(g, strap, cx, y + h - 23, 'brass3', { font: 5, center: true });

    // a cue and a ball, crossed like a crest, on the timber shoulders
    for (const side of [-1, 1]) {
      const sx = cx + side * (w / 2 - 8);
      for (let i = 0; i < 20; i++) px(g, sx - side * i, y + 24 + i, 'wood0');
      disc(g, sx - side * 20, y + 46, 5, 'bone');
      px(g, sx - side * 22, y + 44, 'white');
    }

    // two animals peeking over the top edge of the sign
    ['penguin', 'fox'].forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (!a) return;
      const ax = i === 0 ? cx - w / 2 + 26 : cx + w / 2 - 26;
      drawAnimal(g, a, ax, y + 22 + Math.round(Math.sin(t * 2 + i * 2) * 2), { scale: 1, flip: i === 1 });
    });
  }

  /**
   * The ark on the title screen, and it is the SAME ark the game draws everywhere else.
   * This used to be a bespoke hull with a strip of green felt down the deck -- a pool
   * table riding on a boat, left over from the game this one used to be.
   */
  function drawArk(g, cx, cy, roll) {
    const SC = 2;                     // the ark's art is half-size: 2x is its real size
    const wl = Math.round(cy + 34);
    drawArkSprite(g, cx, wl, t, { tiers: { capacity: 2, speed: 2, hull: 1, hold: 1 }, scale: SC, speed: 0.3 });
    // animals along the foredeck, in front of the house
    const deckY = wl - 8 * SC + Math.round(Math.sin(t * 1.15) * 1.6) * SC;
    CAST.forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (!a) return;
      const ax = cx + 30 + i * 30;
      if (ax > cx + 30 * SC + 40) return;
      const ay = deckY + Math.round(Math.sin(t * 2.2 + i * 0.8) * 1.2) + Math.round(roll * (i - 3.5) * 0.4);
      drawAnimal(g, a, ax, ay, { scale: 0.5, flip: i % 2 === 1, blink: ((t * 1.3 + i) % 5) < 0.12 ? 1 : 0 });
    });
    // and a couple looking out of the house windows
    for (let i = 0; i < 2; i++) {
      const a = ANIMAL_BY_ID[CAST[(i + 3) % CAST.length]];
      if (!a) continue;
      drawAnimal(g, a, cx - 60 + i * 44, deckY - 26, { scale: 0.5, flip: i === 1 });
    }
  }

  function drawHelp(g) {
    wash(g, 0, 0, W, H, 'ink', 0.72);
    // sized to the TEXT: at font 3 these lines run about 310px, and a 660-wide sheet
    // left three hundred pixels of blank parchment down one side
    const hx = 246, hw = 468;
    UI.panel(g, hx, 24, hw, 356, { style: 'paper', shadow: true, title: "THE KEEPER'S MANUAL" });
    const lines = [
      ['THE JOB', 'rust'],
      ['The water is still rising and the boat is not getting bigger. Every island has', 'ink'],
      ['more animals on it than you have room for. Go out, bring back what you can', 'ink'],
      ['carry, and know exactly what you left.', 'ink'],
      ['', 'ink'],
      ['THE DOLLS', 'rust'],
      ['You cannot herd anything yourself. You are enormous and slow and they run from', 'ink'],
      ['you. So pinch a figure out of your own back and stand it in the mud: pick one', 'ink'],
      ['from the tray, click a tile, and it works on everything inside its circle.', 'ink'],
      ['A HERDER sets them walking home. A BRIDGE lies down across the shallows.', 'ink'],
      ['A WOLF settles whatever is hunting. A RAM breaks what is in the way.', 'ink'],
      ['You cannot pick one back up, so where it goes is the whole game.', 'ink'],
      ['', 'ink'],
      ['PUTTING ONE DOWN', 'rust'],
      ['Click an animal you already carry, then click a tile. It uses its ability there', 'ink'],
      ['-- the ox shifts rock, the pig digs, the duck holds a channel, the eagle carries', 'ink'],
      ['one home -- and then walks back to the boat on its own two feet. Which means it', 'ink'],
      ['has to survive the walk, like everything else.', 'ink'],
      ['', 'ink'],
      ['THE WATER, AND WHAT COMES DOWN IN IT', 'rust'],
      ['The flood eats the island from the far side, one strip at a time, and anything', 'ink'],
      ['it reaches is gone. Lightning keeps landing, and what it leaves behind cannot', 'ink'],
      ['hurt you -- it frightens animals, which is worse, because a frightened animal', 'ink'],
      ['forgets the way home and has to be shown again.', 'ink'],
      ['', 'ink'],
      ['THE WORKSHOP AND THE GARDEN', 'rust'],
      ['Animals on the ark produce on every crossing. Wool, milk, a feather, and clay', 'ink'],
      ['off your own back. Dolls are made out of that, at sea, in the workshop -- so', 'ink'],
      ['what you saved last island is what you herd the next one with. Noah knows the', 'ink'],
      ['shapes you do not. Cherubim Rock steps through to Eden, where a bed is safe for', 'ink'],
      ['good, and one of three gates opens free.', 'ink'],
      ['', 'ink'],
      ['Four chapters. Sixteen crossings. The tide does not wait for either of us.', 'red1'],
    ];
    lines.forEach((l, i) => {
      text(g, l[0], hx + 16, 46 + i * 11, l[1], { font: l[1] === 'rust' ? 5 : 3 });
    });
    text(g, 'CLICK ANYWHERE TO CLOSE', hx + hw / 2, 364, 'wood1', { font: 5, center: true });
  }

  function update(dt) {
    t += dt;
    logoK = approach(logoK, 1, 3, dt);
    sea.update(dt);
    parts.update(dt);
    if (t % 1.4 < dt) parts.emit('gullish' in parts ? 'feather' : 'feather', 40 + (t * 30) % 560, 60, { count: 1, life: 4 });

    const m = Input.mouse;
    if (showHelp) { if (m.pressed || Input.anyPressed()) { showHelp = false; Audio.sfx('back'); } return; }

    if (editing) {
      const typed = Input.typed();
      if (typed) seed = (seed + typed.toUpperCase()).slice(0, 20);
      if (Input.pressed('Backspace')) seed = seed.slice(0, -1);
      if (Input.pressed('Enter') || Input.pressed('Escape')) { editing = false; if (!seed) seed = randomSeedString('t'); }
      return;
    }

    if (m.pressed) {
      if (UI.hover(btn.start, m)) {
        Audio.sfx('boat_horn');
        Juice.flash('white', 0.25, 0.4);
        if (onStart) onStart(seed);
      } else if (UI.hover(btn.seed, m)) { editing = true; seed = ''; Audio.sfx('click'); }
      else if (UI.hover(btn.help, m)) { showHelp = true; Audio.sfx('click'); }
      else if (UI.hover(btn.mute, m)) { Audio.toggleMute(); Audio.sfx('click'); }
    }
    if (Input.pressed('Enter') && onStart) onStart(seed);
  }

  return {
    enter(args) {
      onStart = args && args.onStart;
      sea = createSeascape('title/sea', {});
      parts = createParticles({ limit: 300, seed: 'title/parts' });
      t = 0; logoK = 0; showHelp = false; editing = false;
      Audio.music('harbour');
    },
    exit() {},
    update, draw,
    debug() {
      return {
        rects: btn, showHelp, seed,
        help: (on) => { showHelp = on !== false; },
      };
    },
  };
}

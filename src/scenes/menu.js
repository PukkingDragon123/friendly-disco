// Title screen. The ark drifts, animals bob on the deck, the sun goes down behind it.

import { rect, frame, box, px, line, disc, ring, ellipse, text, textW, wrap, wash, clamp, lerp } from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import { createSeascape, drawBoat } from '../render/seascape.js';
import * as UI from '../render/uikit.js';
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
    start: UI.rectOf(238, 214, 164, 26),
    seed: UI.rectOf(238, 246, 164, 16),
    help: UI.rectOf(238, 266, 78, 16),
    mute: UI.rectOf(324, 266, 78, 16),
  };

  function draw(g) {
    // sky + sea, sun low and warm
    sea.draw(g, { x: 0, y: 0, w: 640, h: 360, horizonY: 132, timeOfDay: 0.44, storm: 0.05, parallax: 1, reflect: true });

    // --- the ark, drifting
    const bob = Math.sin(t * 0.7) * 2;
    const roll = Math.sin(t * 0.5 + 1) * 0.6;
    drawArk(g, 320, 196 + bob, roll);

    parts.draw(g, 'back');

    // --- logo
    const k = Ease.outBack(clamp(logoK, 0, 1));
    const ly = lerp(-46, 46, k);
    drawLogo(g, 320, ly);

    // --- menu plate
    UI.panel(g, 230, 206, 180, 82, { style: 'wood', shadow: true });

    const m = Input.mouse;
    UI.button(g, btn.start, 'NEW RUN', {
      state: UI.hover(btn.start, m) ? 'hover' : 'idle', color: 'green0', icon: 'boat',
    });
    UI.button(g, btn.seed, editing ? seed + '_' : 'SEED  ' + seed, {
      state: editing ? 'down' : UI.hover(btn.seed, m) ? 'hover' : 'idle', color: 'wood2', small: true,
    });
    UI.button(g, btn.help, 'HOW TO', { state: UI.hover(btn.help, m) ? 'hover' : 'idle', color: 'wood2', small: true });
    UI.button(g, btn.mute, Audio.muted ? 'SOUND OFF' : 'SOUND ON', {
      state: UI.hover(btn.mute, m) ? 'hover' : 'idle', color: Audio.muted ? 'grey0' : 'wood2', small: true,
    });

    text(g, 'a 2.5D habitat pool roguelike', 320, 298, 'foam', { font: 3, center: true });
    text(g, 'sink every animal into the biome it calls home', 320, 306, 'water3', { font: 3, center: true });

    parts.draw(g, 'front');
    if (showHelp) drawHelp(g);
  }

  function drawLogo(g, cx, y) {
    // POCKET ARK, engraved brass on a timber board
    const w = 236, h = 54;
    UI.panel(g, cx - w / 2, y, w, h, { style: 'brass', shadow: true, rivets: true });
    // big title with a chunky drop
    text(g, 'POCKET', cx - 2, y + 10, 'wood0', { center: true });
    text(g, 'POCKET', cx - 3, y + 9, 'brass3', { center: true });
    // scale the second word up by drawing it twice offset — cheap faux-bold
    text(g, 'A R K', cx + 1, y + 25, 'wood0', { center: true });
    text(g, 'A R K', cx, y + 24, 'white', { center: true });
    UI.divider(g, cx - w / 2 + 10, y + 36, w - 20, { color: 'brass1' });
    text(g, 'SIX GATES · EIGHT ANTES · ONE ARK', cx, y + 41, 'brass1', { font: 3, center: true });
    // corner animals peeking over the board
    const peek = ['penguin', 'fox'];
    peek.forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (!a) return;
      const ax = i === 0 ? cx - w / 2 + 12 : cx + w / 2 - 12;
      drawAnimal(g, a, ax, y + 4 + Math.round(Math.sin(t * 2 + i) * 1), { scale: 1, flip: i === 1 });
    });
  }

  function drawArk(g, cx, cy, roll) {
    const w = 250, h = 26;
    const y = Math.round(cy);
    // hull
    for (let i = 0; i < h; i++) {
      const inset = Math.round((i / h) ** 1.7 * 34);
      const c = i < 4 ? 'wood3' : i < 10 ? 'wood2' : i < 18 ? 'wood1' : 'wood0';
      rect(g, cx - w / 2 + inset, y + i, w - inset * 2, 1, c);
    }
    // deck rail + felt strip: the pool table riding on top
    rect(g, cx - w / 2 + 6, y - 8, w - 12, 8, 'wood2');
    rect(g, cx - w / 2 + 10, y - 6, w - 20, 5, 'cloth1');
    rect(g, cx - w / 2 + 10, y - 6, w - 20, 1, 'cloth2');
    for (let i = 0; i < 6; i++) {
      const gx = cx - w / 2 + 16 + i * ((w - 32) / 5);
      ellipse(g, gx, y - 4, 3, 2, 'ink');
    }
    // gunwale highlight
    rect(g, cx - w / 2 + 6, y - 9, w - 12, 1, 'wood4');
    // mast + sail
    line(g, cx + 60, y - 8, cx + 60, y - 62, 'wood2');
    for (let i = 0; i < 34; i++) {
      const bulge = Math.round(Math.sin((i / 34) * Math.PI) * 12);
      rect(g, cx + 60 - bulge - 2, y - 60 + i, bulge + 2, 1, i % 7 < 4 ? 'bone' : 'white');
    }
    line(g, cx + 60, y - 62, cx + 60, y - 66, 'wood3');
    // pennant
    const fl = Math.round(Math.sin(t * 4) * 2);
    rect(g, cx + 61, y - 66, 9, 4, 'red2');
    rect(g, cx + 61, y - 66 + fl, 9, 1, 'red1');
    // animals on deck
    CAST.forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (!a) return;
      const ax = cx - 104 + i * 26;
      const ay = y - 12 + Math.round(Math.sin(t * 2.2 + i * 0.8) * 1.2) + Math.round(roll * (i - 3.5) * 0.4);
      drawAnimal(g, a, ax, ay, { scale: 1, flip: i % 2 === 1, blink: ((t * 1.3 + i) % 5) < 0.12 ? 1 : 0 });
    });
    // waterline foam
    for (let i = 0; i < 3; i++) {
      const ww = w - 40 - i * 18;
      rect(g, cx - ww / 2, y + h - 2 + i, ww, 1, i === 0 ? 'foam' : 'water3');
    }
  }

  function drawHelp(g) {
    wash(g, 0, 0, 640, 360, 'ink', 0.72);
    UI.panel(g, 60, 30, 520, 300, { style: 'paper', shadow: true, title: 'THE KEEPER\'S MANUAL' });
    const lines = [
      ['THE JOB', 'brass3'],
      ['Animals are racked on the felt. Six gates ring the deck, each opening onto a', 'ink'],
      ['habitat. Sink an animal into its TRUE habitat for x3 chips and +2 mult. Wrong', 'ink'],
      ['gate and it loses almost everything. Adjacent biomes pay partial credit.', 'ink'],
      ['', 'ink'],
      ['THE SHOT', 'brass3'],
      ['Click an animal to take it as your cue. Point, HOLD to charge, release to break.', 'ink'],
      ['A / D or the mouse wheel puts english on the ball. R re-racks the felt.', 'ink'],
      ['Sink several animals in one shot and every extra one compounds the mult.', 'ink'],
      ['', 'ink'],
      ['INTERACTIONS', 'brass3'],
      ['Animals notice each other. A fox that lands beside a rabbit eats it for a fat', 'ink'],
      ['pile of chips. Sheep panic near wolves. Flamingos flock. Penguins do not want', 'ink'],
      ['to meet a polar bear. Read the gate before you shoot into it.', 'ink'],
      ['', 'ink'],
      ['THE DOCK', 'brass3'],
      ['Beat a blind and you sail to the dock. Pick ONE crate from the manifest; a boat', 'ink'],
      ['brings it in and unloads. Crates hold animals, relics, cue work and vouchers.', 'ink'],
      ['', 'ink'],
      ['Eight antes. Three blinds each. The last one always bites back.', 'red1'],
    ];
    lines.forEach((l, i) => text(g, l[0], 76, 52 + i * 12, l[1], { font: l[1] === 'brass3' ? 5 : 3 }));
    text(g, 'CLICK ANYWHERE TO CLOSE', 320, 314, 'grey0', { font: 3, center: true });
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
  };
}

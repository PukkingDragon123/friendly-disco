// THE RAMP. What the fighting was for.
//
// The line held, the field is quiet, and everything you knocked down is lying out there
// waiting. So the camera comes down to ground level at the ark's ramp, the light goes warm,
// and the whole scene is: a basket of apples, a queue of animals that were monsters ten
// minutes ago, and one click each.
//
// THIS IS THE PAYOFF SCENE AND IT IS DELIBERATELY SLOW. Every other screen in the game is
// arithmetic under pressure -- clay, waves, berths, a tide that is not waiting. This one has
// no clock, no fail state and nothing to optimise. You feed them in whatever order you like
// until the apples run out, and then you cast off. A game about how many you cannot save
// needs one place where you look at the ones you did.
//
// WHAT MAKES IT WORK, in order of how much it matters:
//   THE ANIMAL CHANGES. Corrupted going in, its own colours coming out, and it walks up the
//     ramp on its own legs. That transformation IS the reward; the ledger is a footnote.
//   YOU RUN OUT. The apples are the limit and they are visible from the first frame, so the
//     order you choose is a real choice and the ones left over are on you.
//   NOBODY IS SCOLDED. What you cannot feed goes back into the water, and the line for that
//     is 'IT GOES BACK TO THE WATER' -- not a penalty, not a red number.

import {
  W, H, rect, text, textW, wash, disc, ellipse, tri, clamp, lerp, makeCanvas,
} from '../core/pixel.js';
import { P, mix } from '../core/palette.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { createParticles } from '../core/particles.js';
import * as UI from '../render/uikit.js';
import { drawFolk } from '../render/folk.js';
import { drawAnimal, drawAnimalShadow, drawAnimalIcon } from '../render/sprites.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { feed, endFeeding } from '../game/lane.js';
import { berthsFree } from '../game/voyage.js';

const BAR = 38;
const GROUND = 430;             // the sand they are lying on
const RAMP_X = 726;             // where the ramp starts
const GOLEM_X = 250;
const QUEUE_X = 316;           // the first animal in the queue
const QUEUE_GAP = 80;          // six across, clear of the ramp at 726
const QUEUE_ROW = 6;

export function makeFeedScene() {
  let v = null, f = null, island = null, onDone = null;
  let t = 0, intro = 0, outT = -1;
  let parts = null;
  let bakeCv = null;
  let queue = [];                // {held, x, y, k(0..1 fed), up(0..1 walked aboard)}
  let aboard = [];               // finished ones, standing on the deck
  let hover = -1;
  let castRect = UI.rectOf(0, 0, 0, 0);
  let flash = 0;
  let note = '';
  let noteT = 0;
  let fedCount = 0;

  /* --------------------------------------------------------------- the backdrop */

  function bake() {
    if (!bakeCv) bakeCv = makeCanvas(W, H);
    if (!bakeCv) return;
    const g = bakeCv.g;
    g.clearRect(0, 0, W, H);

    // A DUSK SKY IN HARD BANDS, and the water behind everything
    const sky = ['purple0', 'rust', 'orange', 'brass2', 'gold'];
    for (let i = 0; i < sky.length; i++) {
      const y0 = Math.round(Math.pow(i / sky.length, 1.4) * 300);
      const y1 = Math.round(Math.pow((i + 1) / sky.length, 1.4) * 300);
      rect(g, 0, y0, W, Math.max(4, y1 - y0), sky[i]);
    }
    // the sun, low, sitting on the water
    disc(g, 150, 268, 56, 'cream');
    disc(g, 150, 268, 40, 'white');
    // the sea
    for (let y = 300; y < GROUND; y++) {
      const fk = (y - 300) / (GROUND - 300);
      rect(g, 0, y, W, 1, mix(P.water1, P.deep, 0.2 + fk * 0.5));
    }
    for (let y = 306; y < GROUND; y += 12) {
      const off = Math.sin(y * 0.3) * 20;
      rect(g, off, y, W, 4, mix(P.water3, P.water1, 0.4));
      rect(g, 60 + off, y, 200, 4, mix(P.gold, P.water2, 0.5));
    }
    // the beach: wet sand, then dry
    for (let y = GROUND; y < H; y++) {
      const fk = (y - GROUND) / (H - GROUND);
      rect(g, 0, y, W, 1, fk < 0.14 ? mix(P.sand, P.water1, 0.35)
        : fk < 0.5 ? 'sand' : mix(P.sand, P.wood1, 0.25));
    }
    rect(g, 0, GROUND, W, 4, 'ink');
    for (let i = 0; i < 40; i++) {
      const sx = (i * 137) % W, sy = GROUND + 12 + ((i * 53) % 80);
      rect(g, sx, sy, 8 + (i % 3) * 6, 4, mix(P.sand, P.wood1, 0.4));
    }

    // THE ARK, filling the right of the frame, with the ramp down onto the sand
    const bx = 900, by = 250;
    rect(g, RAMP_X - 20, by - 20, W - RAMP_X + 40, 260, 'ink');
    for (let i = 0; i < 24; i++) {
      const inset = Math.round(Math.pow(i / 24, 1.6) * 60);
      rect(g, RAMP_X - 12 + inset, by + i * 10, W - RAMP_X + 24 - inset, 10,
        i < 2 ? 'wood3' : i < 7 ? 'wood2' : i < 16 ? 'wood1' : 'wood0');
    }
    // the hull's rail and the door in her side, open
    rect(g, RAMP_X - 16, by - 32, W - RAMP_X + 32, 16, 'wood2');
    rect(g, RAMP_X - 16, by - 36, W - RAMP_X + 32, 8, 'ink');
    rect(g, 800, by + 30, 120, 130, 'ink');
    rect(g, 808, by + 38, 104, 122, mix(P.wood0, P.ink, 0.4));
    // and the ramp itself, down to the sand
    const rx0 = RAMP_X, ry0 = by + 160, rx1 = RAMP_X - 200, ry1 = GROUND + 30;
    for (let i = 0; i <= 24; i++) {
      const fk = i / 24;
      const px0 = lerp(rx0, rx1, fk), py0 = lerp(ry0, ry1, fk);
      rect(g, px0 - 8, py0 - 8, 84, 24, 'ink');
      rect(g, px0 - 4, py0 - 4, 76, 16, i % 3 === 0 ? 'wood2' : 'wood1');
    }
    void bx;
  }

  /* ------------------------------------------------------------------- the queue */

  function layout() {
    // FIVE ACROSS, and the rows go DOWN the beach toward the camera, so the near row
    // overlaps the far one and a dozen animals still read as a dozen animals.
    queue = (f.held || []).map((held, i) => ({
      held,
      x: QUEUE_X + (i % QUEUE_ROW) * QUEUE_GAP,
      y: GROUND - 16 + Math.floor(i / QUEUE_ROW) * 36,
      k: 0,
      up: 0,
    }));
  }

  function hitAt(mx, my) {
    for (let i = 0; i < queue.length; i++) {
      const q = queue[i];
      if (q.k > 0) continue;
      if (Math.abs(q.x - mx) < 48 && Math.abs(q.y - 34 - my) < 60) return i;
    }
    return -1;
  }

  function give(i) {
    const q = queue[i];
    if (!q || q.k > 0) return;
    if (f.apples <= 0) {
      note = 'THE BASKET IS EMPTY';
      noteT = 2;
      Audio.sfx('error');
      return;
    }
    const res = feed(f, q.held);
    if (!res.ok) { Audio.sfx('error'); note = (res.why || '').toUpperCase(); noteT = 2; return; }
    q.k = 0.001;
    q.res = res;
    fedCount++;
    flash = 0.35;
    Audio.sfx(res.learned ? 'levelup' : 'coin');
    Juice.flash('gold', 0.18, 0.3);
    parts.emit('star', q.x, q.y - 30, { count: 14, speed: 70, color: 'gold', life: 1 });
    note = res.learned ? `${res.animal ? res.animal.toUpperCase() : 'IT'} TEACHES YOU SOMETHING NEW`
      : res.boarded ? 'ABOARD' : 'NO BERTH LEFT — IT STAYS ASHORE';
    noteT = 2.4;
  }

  function done() {
    if (outT >= 0) return;
    endFeeding(f);
    outT = 0;
    Audio.sfx('boat_horn');
  }

  /* ------------------------------------------------------------------- update */

  function update(dt) {
    t += dt;
    intro = approach(intro, 1, 2.4, dt);
    if (flash > 0) flash -= dt * 2;
    if (noteT > 0) noteT -= dt;
    parts.update(dt);

    for (const q of queue) {
      if (q.k > 0 && q.k < 1) q.k = Math.min(1, q.k + dt * 1.6);
      else if (q.k >= 1 && q.up < 1) {
        q.up = Math.min(1, q.up + dt * 0.55);
        if (q.up >= 1 && !q.done) {
          q.done = true;
          aboard.push(q.held);
          Audio.sfx('crate_open', { vol: 0.4 });
        }
      }
    }

    if (outT >= 0) {
      outT += dt;
      if (outT > 0.6 && onDone) { const fn = onDone; onDone = null; fn(); }
      return;
    }

    const m = Input.mouse;
    hover = hitAt(m.x, m.y);
    if (m.pressed) {
      if (UI.hover(castRect, m)) { done(); return; }
      if (hover >= 0) { give(hover); return; }
    }
    // the keyboard feeds the next one along, so this is playable without a mouse
    if (Input.pressed('Space') || Input.pressed('Enter')) {
      const i = queue.findIndex((q) => q.k <= 0);
      if (i >= 0 && f.apples > 0) give(i);
      else done();
    }
    if (Input.pressed('Escape')) done();
    // and when there is nothing left to do, say so rather than waiting
    if (!queue.some((q) => q.k <= 0) && !queue.some((q) => q.up < 1)) {
      if (noteT <= 0) { note = 'THAT IS ALL OF THEM'; noteT = 1.5; }
    }
  }

  /* --------------------------------------------------------------------- draw */

  /** One animal in the queue: corrupted, then its own colours, then up the ramp. */
  function drawOne(g, q, i) {
    const a = q.held.a || ANIMAL_BY_ID[q.held.baseId];
    if (!a) return;
    // the walk up the ramp: a straight line from the sand to the door
    const rx = lerp(q.x, 880, Ease.inOutCubic(q.up));
    const ry = lerp(q.y, 300, Ease.inOutCubic(q.up));
    const lift = q.up > 0 ? 1 : 0;
    const fed = q.k > 0;
    const kk = q.k;

    drawAnimalShadow(g, rx, ry, 1);
    if (!fed) {
      // still corrupted, and lying down: the mood does the lying-down, the ring does the
      // "this one is yours"
      drawAnimal(g, a, rx, ry, { scale: 1, flip: true, t, material: 'corrupt', mood: 'blink' });
      const pulse = 0.5 + 0.5 * Math.sin(t * 2 + i);
      const on = hover === i;
      for (let k = 0; k < 14; k++) {
        const ang = (k / 14) * Math.PI * 2 + t * 0.4;
        rect(g, rx + Math.cos(ang) * (on ? 40 : 34) - 3, ry - 20 + Math.sin(ang) * 24 - 3, 6, 6,
          on ? 'cream' : pulse > 0.7 ? 'brass3' : 'brass1');
      }
      if (on) {
        const bob = Math.round(Math.sin(t * 5) * 4);
        disc(g, rx, ry - 76 + bob, 14, 'ink');
        disc(g, rx, ry - 76 + bob, 10, 'red2');
        disc(g, rx - 3, ry - 79 + bob, 4, 'red1');
        rect(g, rx - 2, ry - 92 + bob, 6, 10, 'wood1');
        text(g, 'FEED', rx, ry - 108 + bob, 'cream', { font: 3, center: true });
      }
      return;
    }
    // FED. Its own colours come back over half a second, and then it gets up.
    if (kk < 1) {
      drawAnimal(g, a, rx, ry, {
        scale: 1, flip: true, t, material: kk < 0.5 ? 'corrupt' : null, mood: 'happy',
      });
      const rr = 20 + kk * 90;
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        rect(g, rx + Math.cos(ang) * rr - 4, ry - 24 + Math.sin(ang) * rr * 0.7 - 4, 8, 8,
          k % 2 ? 'gold' : 'cream');
      }
      return;
    }
    drawAnimal(g, a, rx, ry, {
      scale: 1, flip: q.up < 1, t, mood: 'happy', blessed: q.res && q.res.learned,
      walk: q.up > 0 && q.up < 1 ? (t * 2) % 1 : 0,
    });
    void lift;
  }

  function drawGolem(g) {
    drawFolk(g, 'golem', GOLEM_X, GROUND + 78, t, {
      scale: 2, pose: hover >= 0 ? 'react' : 'happy', mud: 0.35, sparkle: 0.2,
    });
    // THE BASKET, on his arm, with what is left in it. This is the only counter that
    // matters in the scene, so it is a physical object and not a number in a corner.
    const bx = GOLEM_X + 54, by = GROUND + 30;
    rect(g, bx - 34, by - 6, 68, 40, 'ink');
    rect(g, bx - 30, by - 2, 60, 32, 'wood1');
    rect(g, bx - 30, by - 2, 60, 6, 'wood2');
    for (let i = 0; i < Math.min(6, f.apples); i++) {
      const ax = bx - 20 + (i % 3) * 20, ay = by - 10 - Math.floor(i / 3) * 12;
      disc(g, ax, ay, 10, 'ink');
      disc(g, ax, ay, 7, 'red2');
      disc(g, ax - 2, ay - 2, 3, 'red1');
    }
    if (f.apples > 6) {
      text(g, `+${f.apples - 6}`, bx + 30, by - 16, 'cream', { font: 3 });
    }
    if (f.apples <= 0) text(g, 'EMPTY', bx, by + 8, 'grey1', { font: 3, center: true });
  }

  function drawCaption(g) {
    rect(g, 0, 0, W, BAR, 'ink');
    rect(g, 0, H - BAR, W, BAR, 'ink');
    rect(g, 0, BAR, W, 4, 'wood0');
    rect(g, 0, H - BAR - 4, W, 4, 'wood0');

    const left = queue.filter((q) => q.k <= 0).length;
    const free = v ? berthsFree(v) : 0;
    const title = !left ? 'THAT IS ALL OF THEM'
      : !free ? `${left} STILL LYING THERE  ·  THE PENS ARE FULL`
        : `${left} STILL LYING THERE  ·  ${f.apples} APPLES  ·  ${free} BERTHS`;
    text(g, title, 26, 14, 'brass3', { font: 7 });
    text(g, island ? island.name.toUpperCase() : '', W - 26, 8, 'wood2', { font: 3, right: true });

    if (noteT > 0 && note) {
      const a = clamp(noteT, 0, 1);
      const prev = g.globalAlpha;
      g.globalAlpha = a;
      text(g, note, 26, H - 26, 'gold', { font: 5 });
      g.globalAlpha = prev;
    } else {
      text(g, 'CLICK ONE TO GIVE IT AN APPLE', 26, H - 26, 'wood2', { font: 3 });
    }
  }

  function draw(g) {
    if (!bakeCv) bake();
    rect(g, 0, 0, W, H, 'ink');
    if (bakeCv) g.drawImage(bakeCv.canvas, 0, 0);

    // gulls, and the light going
    for (let i = 0; i < 5; i++) {
      const gx = ((i * 210 + t * 16) % (W + 80)) - 40;
      const gy = 120 + (i % 3) * 30 + Math.sin(t + i) * 6;
      const flap = Math.sin(t * 6 + i) > 0 ? 0 : 4;
      rect(g, gx, gy, 12, 4, 'ink');
      rect(g, gx - 10, gy - flap, 12, 4, 'ink');
      rect(g, gx + 10, gy - flap, 12, 4, 'ink');
    }

    // the ones already aboard, standing at the rail looking down at the queue
    aboard.slice(0, 8).forEach((s, i) => {
      const a = ANIMAL_BY_ID[s.baseId];
      if (!a) return;
      drawAnimal(g, a, 800 + (i % 4) * 40, 254 + Math.floor(i / 4) * 26, {
        scale: 1, t, mood: 'happy', flip: true,
      });
    });

    drawGolem(g);
    // back to front, so the near row overlaps the far one properly
    const order = queue.map((q, i) => i).sort((x, y) => queue[x].y - queue[y].y);
    for (const i of order) drawOne(g, queue[i], i);
    parts.draw(g);

    if (flash > 0) wash(g, 0, 0, W, H, 'gold', clamp(flash, 0, 1) * 0.2);

    // CAST OFF, bottom right, and it says what it costs you if you leave them
    const left = queue.filter((q) => q.k <= 0).length;
    // TOP RIGHT, under the bar: at the foot of the frame it sat on top of the back row of
    // the queue, and the one button in the scene must never be behind an animal.
    castRect = UI.rectOf(W - 250, BAR + 16, 220, 46);
    UI.button(g, castRect, left ? 'CAST OFF ANYWAY' : 'CAST OFF', {
      hot: UI.hover(castRect, Input.mouse), color: left ? 'rust' : 'wood2', font: 5,
      sub: left ? `${left} GO BACK TO THE WATER` : `${fedCount} FED`,
    });

    // and the berths, so a full ark is visible before you spend the apple
    const free = v ? berthsFree(v) : 0;
    text(g, `${free} BERTHS LEFT`, 26, H - BAR - 30, free ? 'parch1' : 'red2', { font: 3 });
    if (v) {
      v.aboard.slice(0, 14).forEach((id, i) => {
        const a = ANIMAL_BY_ID[id];
        if (a) drawAnimalIcon(g, a, 30 + i * 26, H - BAR - 58, { size: 22 });
      });
    }

    drawCaption(g);
    if (outT >= 0) wash(g, 0, 0, W, H, 'ink', Ease.inQuad(clamp(outT / 0.6, 0, 1)));
    else if (intro < 1) wash(g, 0, 0, W, H, 'ink', (1 - Ease.outCubic(clamp(intro, 0, 1))) * 0.9);
  }

  return {
    enter(args) {
      v = args.voyage || args.run;
      f = args.field || args.lane;
      island = args.island || (f && f.island) || null;
      onDone = args.onDone;
      t = 0; intro = 0; outT = -1; hover = -1; flash = 0; note = ''; noteT = 0; fedCount = 0;
      aboard = [];
      bakeCv = null;
      parts = createParticles({ limit: 220, seed: 'feed/' + (island ? island.id : 'x') });
      layout();
      Audio.music('deck');
      Audio.sfx('fanfare', { vol: 0.5 });
    },
    exit() { Audio.stopMusic(0.5); },
    update, draw,
    debug() {
      return {
        feeding: true, voyage: v, field: f, island,
        get apples() { return f.apples; },
        get left() { return queue.filter((q) => q.k <= 0).length; },
        get fed() { return fedCount; },
        queue: () => queue.map((q, i) => ({ i, x: q.x, y: q.y - 34, fed: q.k > 0 })),
        give: (i) => give(i),
        rects: { cast: castRect },
        cast: () => done(),
      };
    },
  };
}

// THE GARDEN OF EDEN — the hub, and the only safe ground in the game.
//
// Three things happen here and the layout is three columns because of it:
//
//   THE BEDS     left. Animals put in a bed here are out of the story: nothing reaches
//                them, they cannot be used, and they can be sold. Sitting with one three
//                times makes it loyal, which is the free and slow road to the thing the
//                snake charges seven for.
//   THE DECK     middle. Who is still on the boat. Every one of them is useful and in
//                danger, and moving one left is choosing safety over usefulness.
//   THE GATE     right. The Cherubim will open one of three, free, and whoever comes
//                through stays for the rest of the run. Talk to them for a deal.
//
// The whole scene is that one sentence: aboard is useful and in danger, a bed is safe and
// worth money, and you only ever have so many of either.

import { P, col, mix } from '../core/palette.js';
import {
  makeCanvas, rect, frame, px, line, disc, ring, ellipse, tri, text, textW, wrap, wash,
  clamp, W, H,
} from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import * as UI from '../render/uikit.js';
import { drawAnimal } from '../render/sprites.js';
import { drawFolk, drawSparkle } from '../render/folk.js';
import { drawDeal, dealBox } from '../render/deal.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { abilityOf } from '../data/abilities.js';
import { NPC_BY_ID } from '../data/npcs.js';
import { activeFlags, priceMod } from '../game/choices.js';
import { SLOT_INFO, bonusText } from '../data/gear.js';
import {
  capacity, gardenSize, berthsFree, isLoyal, stow, unstow, sell, sellPrice, holdSize,
} from '../game/voyage.js';
import {
  enterGarden, openGate, buyOffer, questNow, claimQuest, pet, petsOf, PETS_FOR_LOYALTY,
} from '../game/garden.js';

const HUD_H = 40;

// The garden is DRAWN, not panelled. Three big wooden boxes covered the whole backdrop
// and turned the one warm place in the game into a filing cabinet, so the beds sit on
// the actual grass, the gates stand in the actual arch, and the chrome is pushed to the
// edges where chrome belongs.
const BED_X = 26, BED_Y = 226, BED_COLS = 11, BED_CELL = 44;
const GATE_X = 664, GATE_Y = 96;            // the three doors, in the wall
const NPC_Y = 300;                          // where whoever came through stands
const DECK = { x: 12, y: 426, w: 396, h: 106 };
const BASKET = { x: 416, y: 426, w: 146, h: 106 };
const SLOTS_Y = 426;
const SLOT_X = 570;

/* ----------------------------------------------------------------- backdrop

A walled garden at the end of the afternoon: gold sky, a wall with an arch in it, four
big trees, a river, and grass with more flowers in it than anywhere else in the game.
Baked once -- it is the biggest static thing on screen and none of it moves.
*/
let bg = null;

function backdrop() {
  if (bg) return bg;
  const mk = makeCanvas(W, H);
  if (!mk) return null;
  const b = mk.g;
  const HOR = 150;                 // the top of the grass
  const WALL_TOP = 104;

  // sky: gold at the horizon, because this is the one place in the game that is warm
  for (let y = 0; y < HOR; y++) {
    const f = y / HOR;
    rect(b, 0, y, W, 1, f < 0.5 ? mix(P.sky, P.cream, f * 2) : mix(P.cream, P.gold, (f - 0.5) * 1.6));
  }
  for (let r = 44; r > 18; r -= 6) wash(b, 286 - r, 62 - r, r * 2, r * 2, 'gold', 0.08);
  disc(b, 286, 62, 18, 'cream');
  disc(b, 286, 62, 13, 'white');

  // THE TREES GO BEHIND THE WALL. Drawn after it, their trunks stood ON the stone and
  // the whole garden read as a row of lollipops planted in a kerb -- what you actually
  // see over a garden wall is canopy and nothing else.
  const far = [[92, 34], [188, 26], [432, 36], [560, 28], [688, 22], [844, 32]];
  for (const [tx, th] of far) {
    rect(b, tx - 3, WALL_TOP - th, 6, th, 'bark');
    for (let i = 0; i < 5; i++) {
      const a = -0.5 - i * 0.48;
      const r0 = 20 + (i % 2) * 9;
      ellipse(b, tx + Math.cos(a) * r0 * 0.75, WALL_TOP - th - 6 + Math.sin(a) * r0 * 0.45,
        21 + (i % 3) * 7, 13 + (i % 2) * 5, i % 2 ? 'leaf1' : 'leaf2');
    }
    ellipse(b, tx, WALL_TOP - th - 14, 24, 13, 'leaf3');
    for (let i = 0; i < 6; i++) px(b, tx - 16 + i * 7, WALL_TOP - th - 24 + (i % 3) * 4, 'leaf4');
  }

  // the wall: warm stone, laid in courses with staggered joints, capped, with ivy on it
  for (let y = WALL_TOP; y < HOR + 8; y++) {
    const f = (y - WALL_TOP) / (HOR + 8 - WALL_TOP);
    rect(b, 0, y, W, 1, f < 0.16 ? 'stone3' : f < 0.62 ? 'stone2' : 'stone1');
  }
  const CO = 8;                                   // one course
  for (let row = 0; (WALL_TOP + row * CO) < HOR + 8; row++) {
    const y = WALL_TOP + row * CO;
    rect(b, 0, y, W, 1, mix(P.stone1, P.ink, 0.25));
    rect(b, 0, y + 1, W, 1, mix(P.stone3, P.white, 0.1));
    for (let x = (row % 2) * 21; x < W; x += 42) rect(b, x, y, 1, CO, mix(P.stone1, P.ink, 0.2));
  }
  // the capstones
  for (let x = 0; x < W; x += 30) {
    rect(b, x, WALL_TOP - 6, 28, 6, 'stone3');
    rect(b, x, WALL_TOP - 6, 28, 1, 'stone4');
    rect(b, x + 28, WALL_TOP - 6, 2, 6, 'stone1');
  }
  // ivy, spilling over in three places
  for (const ix of [56, 380, 902]) {
    for (let i = 0; i < 42; i++) {
      const x = ix + ((i * 13) % 34) - 17;
      const y = WALL_TOP - 4 + ((i * 7) % 40);
      px(b, x, y, i % 3 ? 'leaf1' : 'leaf2');
      if (i % 5 === 0) px(b, x + 1, y + 1, 'leaf3');
    }
  }

  // the arch the three gates stand in, centred on them
  const ax = 738, aw = 254;
  for (let y = 0; y < 74; y++) {
    const f = y / 74;
    const hw = Math.round((aw / 2 + 8) * Math.sqrt(Math.max(0, 1 - f * f * 0.22)));
    for (let sgn = -1; sgn <= 1; sgn += 2) {
      rect(b, ax + sgn * hw - 4, HOR + 6 - y, 5, 1, y % 6 === 0 ? 'stone4' : 'stone3');
    }
  }
  for (let y = 60; y < 74; y++) {
    const f = y / 74;
    const hw = Math.round((aw / 2 + 8) * Math.sqrt(Math.max(0, 1 - f * f * 0.22)));
    rect(b, ax - hw, HOR + 6 - y, hw * 2, 1, 'stone3');
  }

  // the ground: rich grass, in bands
  for (let y = HOR + 4; y < H; y++) {
    const f = (y - HOR - 4) / (H - HOR - 4);
    rect(b, 0, y, W, 1, f < 0.35 ? mix(P.leaf2, P.leaf1, f * 2)
      : f < 0.75 ? mix(P.leaf1, P.moss, (f - 0.35) * 2) : mix(P.moss, P.leaf0, (f - 0.75) * 2));
  }

  // one of the four rivers, with banks. A one-pixel blue stripe under the wall read as a
  // ruled line; what makes a river is the wet earth either side of it.
  const rivY = HOR + 12;
  rect(b, 0, rivY - 4, W, 4, 'clay2');
  rect(b, 0, rivY - 4, W, 1, 'clay3');
  for (let y = 0; y < 20; y++) {
    rect(b, 0, rivY + y, W, 1,
      y < 2 ? 'foam' : y < 7 ? 'water3' : y < 14 ? 'water2' : y < 18 ? 'water1' : 'water0');
  }
  rect(b, 0, rivY + 20, W, 4, 'clay2');
  rect(b, 0, rivY + 23, W, 1, 'clay1');
  for (let i = 0; i < 140; i++) px(b, (i * 71) % W, rivY + 3 + ((i * 13) % 15), 'foam');
  // reeds along both banks, and stepping stones
  for (let i = 0; i < 90; i++) {
    const x = (i * 107) % W;
    const h2 = 4 + ((i * 17) % 7);
    const y0 = (i % 2) ? rivY - 4 : rivY + 22;
    for (let k = 0; k < h2; k++) px(b, x + (k % 2), y0 - k, k > h2 - 3 ? 'leaf3' : 'leaf1');
  }
  for (let i = 0; i < 5; i++) {
    ellipse(b, 470 + ((i % 2) * 7), rivY + 2 + i * 4, 7, 3, 'stone2');
    ellipse(b, 470 + ((i % 2) * 7), rivY + 1 + i * 4, 6, 2, 'stone3');
  }

  // flowers and tufts, thicker than any island
  for (let i = 0; i < 760; i++) {
    const x = (i * 137) % W;
    const y = rivY + 30 + ((i * 89) % (H - rivY - 34));
    const k = (i * 29) % 12;
    if (k < 6) {
      for (let j = 0; j < 3; j++) {
        rect(b, x + j, y - (j === 1 ? 3 : 2), 1, j === 1 ? 3 : 2, k < 3 ? 'leaf3' : 'leaf2');
      }
    } else if (k < 9) {
      px(b, x, y, 'leaf4');
    } else {
      const c = k === 9 ? 'pink' : k === 10 ? 'gold' : 'white';
      px(b, x, y - 2, c); px(b, x - 1, y - 1, c); px(b, x + 1, y - 1, c);
      px(b, x, y, 'leaf2');
    }
  }

  // a hedge along the foot of the wall, and bushes about the grass. A tree IN FRONT
  // needed a canopy the size of a bed and ended up a mushroom on a pole every time;
  // a bush gives the same depth for a tenth of the room.
  for (let x = 0; x < W; x += 5) {
    const h2 = 16 + ((x * 7) % 9);
    for (let y = 0; y < h2; y++) {
      const f = y / h2;
      px(b, x + ((y * 3) % 4), HOR + 8 - y, f > 0.78 ? 'leaf3' : f > 0.4 ? 'leaf2' : 'leaf0');
      px(b, x + 2 + ((y * 5) % 3), HOR + 8 - y, f > 0.86 ? 'leaf4' : f > 0.3 ? 'leaf1' : 'leaf0');
    }
  }

  /** A bush: three overlapping domes, dark at the base, sun on the crown. */
  const bush = (bx2, by2, br) => {
    ellipse(b, bx2, by2, Math.round(br * 1.1), Math.round(br * 0.3), mix(P.leaf0, P.ink, 0.3));
    for (const [ox, oy, rr] of [[-br * 0.55, 2, br * 0.7], [br * 0.55, 3, br * 0.62], [0, -br * 0.3, br * 0.86]]) {
      const cx2 = bx2 + ox, cy2 = by2 + oy - rr * 0.5;
      for (let y = -rr; y <= rr * 0.6; y++) {
        const w2 = Math.round(Math.sqrt(Math.max(0, rr * rr - y * y)));
        if (w2 < 1) continue;
        const f = (y + rr) / (rr * 1.6);
        rect(b, Math.round(cx2 - w2), Math.round(cy2 + y), w2 * 2, 1,
          f < 0.28 ? 'leaf3' : f < 0.6 ? 'leaf2' : f < 0.85 ? 'leaf1' : 'leaf0');
      }
      for (let i = 0; i < 5; i++) {
        px(b, cx2 - rr * 0.5 + i * rr * 0.25, cy2 - rr * 0.7 + (i % 3), 'leaf4');
      }
    }
    for (let i = 0; i < 6; i++) {
      px(b, bx2 - br * 0.7 + i * br * 0.28, by2 - br * 0.8 + (i % 4) * 4, i % 2 ? 'pink' : 'gold');
    }
  };
  for (const [bx2, by2, br] of [
    [598, 276, 22], [936, 330, 26], [516, 396, 17], [872, 412, 20], [744, 372, 15],
  ]) bush(bx2, by2, br);

  bg = mk.canvas;
  return bg;
}

export function clearEdenCache() { bg = null; }

/* -------------------------------------------------------------------- scene */

export function makeEdenScene() {
  let v = null, onDone = null;
  let parts = null;
  let t = 0, intro = 0;
  let mode = 'garden';                  // 'garden' | 'talk'
  let talking = null;                   // npc id
  let line = null;                      // what they last said
  let selBed = -1, selDeck = -1;
  let hoverBed = -1, hoverDeck = -1, hoverGate = -1, hoverNpc = -1, hoverCard = -1;
  let bedRects = [], deckRects = [], gateRects = [], npcRects = [], slotRects = [];
  let dealHit = { cards: [], quest: null };
  let sailRect = UI.rectOf(0, 0, 0, 0), backRect = UI.rectOf(0, 0, 0, 0);
  let dealRect = UI.rectOf(0, 0, 0, 0);
  let actRects = {};

  /* ---------------------------------------------------------------- drawing */

  /** One bed: a ring of turned earth with something asleep in it. */
  function drawBed(g, x, y, id, hot, sel) {
    ellipse(g, x, y + 9, 15, 6, mix(P.clay1, P.ink, 0.2));
    ellipse(g, x, y + 8, 14, 5, 'clay2');
    for (let i = 0; i < 5; i++) px(g, x - 10 + i * 5, y + 7 + (i % 2), 'clay3');
    if (!id) {
      // an empty bed still says something: it is room you paid for. A bare dark ellipse
      // read as a hole in the lawn, so it gets turned earth and a stake.
      ellipse(g, x, y + 7, 10, 3, mix(P.clay1, P.ink, 0.2));
      for (let i = 0; i < 4; i++) px(g, x - 6 + i * 4, y + 6 + (i % 2), 'clay3');
      rect(g, x + 8, y - 2, 1, 9, 'wood2');
      rect(g, x + 5, y - 3, 7, 3, 'parch');
      rect(g, x + 5, y - 3, 7, 1, 'cream');
      return;
    }
    const a = ANIMAL_BY_ID[id];
    if (!a) return;
    const bob = Math.round(Math.sin(t * 1.4 + x * 0.07) * 1);
    drawAnimal(g, a, x, y - 2 + bob, { scale: 1, mood: 'happy' });
    if (isLoyal(v, id)) UI.icon(g, 'heart', x + 8, y - 16, { color: 'gold' });
    else {
      const n = petsOf(v, id);
      for (let i = 0; i < PETS_FOR_LOYALTY; i++) {
        px(g, x - 6 + i * 5, y - 16, i < n ? 'pink' : mix(P.pink, P.ink, 0.6));
      }
    }
    if (sel) ring(g, x, y - 2, 18, 'gold', 1);
    else if (hot) ring(g, x, y - 2, 18, 'white', 1);
  }

  function drawBeds(g) {
    // a hand-lettered sign, not a title bar
    UI.ribbon(g, BED_X, BED_Y - 30, 176, 'THE BEDS', { color: 'leaf4', font: 7, h: 15 });
    text(g, `${v.eden.length} of ${gardenSize(v)} safe for good`, BED_X + 186, BED_Y - 27,
      v.eden.length >= gardenSize(v) ? 'amber' : 'cream', { font: 5, shadow: 'ink' });

    bedRects = [];
    const total = gardenSize(v);
    const maxRows = Math.floor((DECK.y - BED_Y - 10) / BED_CELL);
    const shown = Math.min(total, BED_COLS * maxRows);
    for (let i = 0; i < shown; i++) {
      const bx = BED_X + 20 + (i % BED_COLS) * BED_CELL;
      const by = BED_Y + 14 + Math.floor(i / BED_COLS) * BED_CELL;
      const id = v.eden[i] || null;
      if (id) bedRects.push({ rect: UI.rectOf(bx - 20, by - 22, 40, 42), id, index: i });
      drawBed(g, bx, by, id, hoverBed === bedRects.length - 1 && !!id, selBed === i);
    }
    if (total > shown) {
      text(g, `+${total - shown} more beds up the hill`, BED_X + 20, DECK.y - 14,
        'cream', { font: 3, shadow: 'ink' });
    }

    // The selection reads as a little card pinned beside the animal, not as a panel
    // bolted to the frame -- so the eye never has to leave the garden.
    actRects = {};
    const id = v.eden[selBed];
    if (!id) return;
    const cw = 208, ch = 82;
    const cx = BED_X - 4;
    const cy = DECK.y - ch - 10;                 // always in the same place, never over a bed
    UI.panel(g, cx, cy, cw, ch, { style: 'paper', shadow: true });
    const a = ANIMAL_BY_ID[id];
    const ab = abilityOf(a);
    text(g, a.name.toUpperCase(), cx + 8, cy + 6, 'wood0', { font: 7 });
    UI.icon(g, ab.icon, cx + 8, cy + 18, { color: ab.color });
    text(g, ab.verb, cx + 20, cy + 19, mix(col(ab.color), P.ink, 0.4), { font: 3 });
    text(g, isLoyal(v, id) ? 'LOYAL — it will never leave' : `sat with ${petsOf(v, id)}/${PETS_FOR_LOYALTY}`,
      cx + 8, cy + 30, isLoyal(v, id) ? 'brass0' : 'wood1', { font: 3 });

    const bw = 62, bh = 18, byy = cy + ch - bh - 6;
    actRects.pet = UI.rectOf(cx + 6, byy, bw, bh);
    UI.button(g, actRects.pet, isLoyal(v, id) ? 'SIT' : 'SIT WITH', {
      state: UI.hover(actRects.pet, Input.mouse) ? 'hover' : 'idle', color: 'leaf1',
      icon: 'heart', font: 3, small: true,
    });
    actRects.take = UI.rectOf(cx + 6 + bw + 5, byy, bw, bh);
    UI.button(g, actRects.take, 'ABOARD', {
      state: berthsFree(v) <= 0 ? 'disabled'
        : UI.hover(actRects.take, Input.mouse) ? 'hover' : 'idle',
      color: 'wood2', icon: 'boat', font: 3, small: true,
    });
    actRects.sell = UI.rectOf(cx + 6 + (bw + 5) * 2, byy, bw, bh);
    UI.button(g, actRects.sell, `$${sellPrice(v, id)}`, {
      state: UI.hover(actRects.sell, Input.mouse) ? 'hover' : 'idle', color: 'brass0',
      icon: 'coin', font: 3, small: true,
    });
  }

  function drawDeck(g) {
    UI.panel(g, DECK.x, DECK.y, DECK.w, DECK.h, { style: 'wood', shadow: true, rivets: true });
    UI.panelTitle(g, DECK.x, DECK.y + 6, DECK.w, 'STILL ABOARD', { color: 'cream' });
    text(g, `${v.aboard.length} / ${capacity(v)}`, DECK.x + DECK.w - 12, DECK.y + 20,
      berthsFree(v) ? 'parch1' : 'amber', { font: 5, right: true });

    deckRects = [];
    const cell = 38;
    const cols = Math.floor((DECK.w - 30) / cell);
    v.aboard.forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (!a) return;
      const bx = DECK.x + 26 + (i % cols) * cell;
      const by = DECK.y + 40 + Math.floor(i / cols) * cell;
      if (by > DECK.y + DECK.h - 16) return;
      deckRects.push({ rect: UI.rectOf(bx - 17, by - 17, 34, 34), id, index: i });
      const ab = abilityOf(a);
      rect(g, bx - 17, by - 17, 34, 34, mix(col(ab.color), P.wood0, 0.62));
      rect(g, bx - 17, by - 17, 34, 1, mix(col(ab.color), P.white, 0.3));
      drawAnimal(g, a, bx, by - 4, { scale: 1 });
      UI.icon(g, ab.icon, bx - 4, by + 8, { color: ab.color });
      if (isLoyal(v, id)) px(g, bx + 14, by - 15, 'gold');
      if (selDeck === i) frame(g, bx - 17, by - 17, 34, 34, 'gold');
      else if (hoverDeck === deckRects.length - 1) frame(g, bx - 17, by - 17, 34, 34, 'white');
    });
    if (!v.aboard.length) {
      text(g, 'The deck is empty. Everything you own is in a bed.',
        DECK.x + 14, DECK.y + 44, 'parch1', { font: 3 });
    }

    // the two things you can do with the selected one, right under the row
    const id = v.aboard[selDeck];
    if (!id) {
      text(g, 'Aboard is useful and in danger. A bed is safe and worth money.',
        DECK.x + 14, DECK.y + DECK.h - 14, 'parch1', { font: 3 });
      return;
    }
    const a = ANIMAL_BY_ID[id];
    text(g, a.name.toUpperCase(), DECK.x + 14, DECK.y + DECK.h - 26, 'cream', { font: 5 });
    const bw = 100, bh = 17;
    actRects.stow = UI.rectOf(DECK.x + DECK.w - bw * 2 - 18, DECK.y + DECK.h - 24, bw, bh);
    UI.button(g, actRects.stow, 'PUT IN A BED', {
      state: v.eden.length >= gardenSize(v) ? 'disabled'
        : UI.hover(actRects.stow, Input.mouse) ? 'hover' : 'idle',
      color: 'leaf1', icon: 'leaf', font: 3, small: true,
    });
    actRects.sellDeck = UI.rectOf(DECK.x + DECK.w - bw - 10, DECK.y + DECK.h - 24, bw, bh);
    UI.button(g, actRects.sellDeck, `SELL $${sellPrice(v, id)}`, {
      state: UI.hover(actRects.sellDeck, Input.mouse) ? 'hover' : 'idle',
      color: 'brass0', icon: 'coin', font: 3, small: true,
    });
  }

  /** The Cherubim, the three gates in the wall, and whoever has already come through. */
  function drawGate(g) {
    const offer = v.gateOffer || [];

    // the guardian, standing under the arch on the backdrop
    drawFolk(g, 'cherub', 902, 258, t, { scale: 2, sparkle: 0.6 });

    gateRects = [];
    if (offer.length) {
      UI.ribbon(g, GATE_X - 6, GATE_Y - 22, 210, 'THREE GATES — ONE OPENS',
        { color: 'magic2', font: 5, h: 14 });
      offer.forEach((npcId, i) => {
        const npc = NPC_BY_ID[npcId];
        if (!npc) return;
        const gx = GATE_X + i * 74;
        const gy = GATE_Y;
        const gw = 62, gh = 96;
        gateRects.push({ rect: UI.rectOf(gx, gy, gw, gh), id: npcId });
        const hot = hoverGate === i;
        // a door in the wall with light behind it: you can see there is somebody, not who
        rect(g, gx - 2, gy - 2, gw + 4, gh + 4, 'stone1');
        rect(g, gx - 2, gy - 2, gw + 4, 2, 'stone3');
        for (let y = 0; y < gh; y++) {
          const f = y / gh;
          const hw = Math.round((gw / 2) * Math.sqrt(Math.max(0, 1 - f * f * 0.36)));
          rect(g, gx + gw / 2 - hw, gy + gh - 1 - y, hw * 2, 1,
            mix(P.magic0, P.magic2, f * 0.65 + (hot ? 0.25 : 0)));
        }
        drawSparkle(g, gx + gw / 2, gy + gh * 0.55, 1, t + i, hot ? 1 : 0.4);
        UI.icon(g, npc.icon, gx + gw / 2 - 8, gy + gh * 0.34, { color: npc.color, scale: 2 });
        rect(g, gx, gy + gh - 16, gw, 15, 'ink');
        text(g, `GATE ${i + 1}`, gx + gw / 2, gy + gh - 13, hot ? 'gold' : 'parch1',
          { font: 5, center: true });
        if (hot) {
          const tip = npc.title.toUpperCase();
          const tw = textW(tip, { font: 3 }) + 8;
          wash(g, gx + gw / 2 - tw / 2, gy + gh + 4, tw, 10, 'ink', 0.8);
          text(g, tip, gx + gw / 2, gy + gh + 6, 'cream', { font: 3, center: true });
        }
      });
      text(g, 'free, and only one of them', GATE_X + 2, GATE_Y + 112, 'gold',
        { font: 3, shadow: 'ink' });
    }

    // whoever is already here, standing about on the grass
    npcRects = [];
    v.summoned.forEach((npcId, i) => {
      const npc = NPC_BY_ID[npcId];
      if (!npc) return;
      const nx = 640 + (i % 4) * 78;
      const ny = NPC_Y + (i % 2) * 22;
      npcRects.push({ rect: UI.rectOf(nx - 26, ny - 62, 52, 70), id: npcId });
      const hot = hoverNpc === i;
      drawFolk(g, npc.folk, nx, ny, t + i * 0.7, {
        scale: 1, pose: hot ? 'happy' : 'idle', talking: hot,
      });
      const nm = npc.name.toUpperCase();
      const nw = textW(nm, { font: 3 }) + 8;
      wash(g, nx - nw / 2, ny + 3, nw, 10, 'ink', hot ? 0.85 : 0.55);
      text(g, nm, nx, ny + 5, hot ? 'white' : 'parch1', { font: 3, center: true });
      // a little pip per thing on their blanket, so you can see who has something
      const deal = (v.deals && v.deals[npcId]) || [];
      for (let k = 0; k < deal.length; k++) {
        disc(g, nx - 6 + k * 6, ny - 66, 2, 'gold');
      }
      if (hot) {
        text(g, 'CLICK TO TALK', nx, ny + 15, 'gold', { font: 3, center: true, shadow: 'ink' });
      }
    });
    if (!v.summoned.length && !offer.length) {
      text(g, 'Nobody here yet.', 660, NPC_Y, 'cream', { font: 5, shadow: 'ink' });
    }
  }

  /** The golem's three slots, along the bottom. */
  function drawSlots(g) {
    UI.panel(g, SLOT_X, SLOTS_Y, W - SLOT_X - 12, H - SLOTS_Y - 8,
      { style: 'wood', shadow: true, rivets: true });
    drawFolk(g, 'golem', SLOT_X + 30, H - 14, t, { scale: 1, mud: 0.3 });
    text(g, 'WHAT YOU CARRY', SLOT_X + 10, SLOTS_Y + 6, 'parch1', { font: 3 });

    slotRects = [];
    ['hold', 'wear', 'consume'].forEach((slot, i) => {
      const info = SLOT_INFO[slot];
      const x = SLOT_X + 54 + i * 110;
      const rct = UI.rectOf(x, SLOTS_Y + 18, 106, 76);
      slotRects.push({ rect: rct, slot });
      const rel = v.slots[slot];
      UI.panel(g, rct.x, rct.y, rct.w, rct.h, { style: rel ? 'slate' : 'slate', inset: !rel });
      UI.icon(g, rel ? rel.icon : info.icon, rct.x + 6, rct.y + 6,
        { color: rel ? rel.color : 'grey0' });
      text(g, info.name.toUpperCase(), rct.x + 20, rct.y + 6, rel ? 'cream' : 'grey1', { font: 3 });
      if (rel) {
        wrap(rel.name, rct.w - 12, { font: 5 }).slice(0, 2).forEach((l, j) => {
          text(g, l, rct.x + 6, rct.y + 18 + j * 10, rel.color, { font: 5 });
        });
        wrap(bonusText(rel), rct.w - 12, { font: 3 }).slice(0, 4).forEach((l, j) => {
          text(g, l, rct.x + 6, rct.y + 40 + j * 8, 'parch1', { font: 3 });
        });
      } else {
        wrap(info.blurb, rct.w - 12, { font: 3 }).slice(0, 3).forEach((l, j) => {
          text(g, l, rct.x + 6, rct.y + 20 + j * 8, 'grey1', { font: 3 });
        });
        text(g, 'empty', rct.x + 6, rct.y + 56, 'grey0', { font: 3 });
      }
    });

    // the basket, so the player can see what they are taking into the next island
    UI.panel(g, BASKET.x, BASKET.y, BASKET.w, BASKET.h, { style: 'wood', shadow: true });
    text(g, 'THE BASKET', BASKET.x + 10, BASKET.y + 6, 'parch1', { font: 3 });
    text(g, `${v.hold.length}/${holdSize(v)}`, BASKET.x + BASKET.w - 10, BASKET.y + 6,
      'cream', { font: 3, right: true });
    for (let i = 0; i < holdSize(v); i++) {
      const ix = BASKET.x + 12 + (i % 5) * 25;
      const iy = BASKET.y + 20 + Math.floor(i / 5) * 25;
      const has = !!v.hold[i];
      rect(g, ix, iy, 20, 20, has ? 'wood2' : 'wood0');
      frame(g, ix, iy, 20, 20, 'wood3');
      if (has) { disc(g, ix + 10, iy + 11, 6, 'red1'); px(g, ix + 8, iy + 8, 'white'); }
    }
  }

  function drawHud(g) {
    UI.panel(g, 0, 0, W, HUD_H, { style: 'wood', shadow: true, corners: false });
    text(g, 'THE GARDEN OF EDEN', 12, 5, 'leaf4', { font: 7, shadow: 'ink' });
    // your reputation, where you are about to go shopping with it
    const flags = activeFlags(v);
    const rep = priceMod(v);
    const repLine = flags.length
      ? flags.slice(0, 2).map((f) => f.id.toUpperCase()).join(' · ')
        + (rep ? `  (prices ${rep > 0 ? '+' : ''}${rep})` : '')
      : 'the last dry ground, and the only safe one';
    text(g, repLine, 12, 24, rep > 0 ? 'red2' : rep < 0 ? 'leaf4' : 'parch1', { font: 3 });
    UI.moneyPill(g, 330, 10, v.money, { font: 7, h: 16 });
    text(g, `CHAPTER ${v.chapter} · LEG ${v.leg}`, 420, 6, 'parch1', { font: 3 });
    text(g, `${v.lost.length} lost so far`, 420, 20, v.lost.length ? 'red2' : 'parch1', { font: 3 });
    text(g, 'THE FLOOD', 560, 5, 'parch1', { font: 3 });
    UI.bar(g, 560, 15, 180, 12, v.flood, {
      fill: v.flood > 0.72 ? 'red2' : 'water2', bg: 'wood0', frame: 'wood0',
    });

    sailRect = UI.rectOf(W - 150, 6, 140, 28);
    UI.button(g, sailRect, 'BACK TO SEA', {
      state: UI.hover(sailRect, Input.mouse) ? 'hover' : 'idle',
      color: 'wood2', icon: 'boat', font: 5,
    });
  }

  function draw(g) {
    const b = backdrop();
    if (b) g.drawImage(b, 0, 0);
    else rect(g, 0, 0, W, H, 'leaf1');

    if (mode === 'talk') {
      const npc = NPC_BY_ID[talking];
      drawBeds(g);
      wash(g, 0, 0, W, H, 'ink', 0.42);
      const ctx = {
        npc,
        offers: (v.deals && v.deals[talking]) || [],
        money: v.money, t, hover: hoverCard, line,
        quest: talking === 'noah' ? questNow(v) : null,
      };
      const box = dealBox(ctx);
      const dw = box.w, dh = box.h;
      const dx = Math.round((W - dw) / 2), dy = Math.round((H - dh) / 2 - 12);
      dealRect = UI.rectOf(dx, dy, dw, dh);
      dealHit = drawDeal(g, dx, dy, dw, dh, ctx);
      backRect = UI.rectOf(dx + dw - 116, dy + dh + 8, 108, 24);
      UI.button(g, backRect, 'THAT IS ALL', {
        state: UI.hover(backRect, Input.mouse) ? 'hover' : 'idle', color: 'wood2', font: 5,
      });
    } else {
      drawBeds(g);
      drawDeck(g);
      drawGate(g);
      drawSlots(g);
    }
    drawHud(g);
    parts.draw(g, 'front');
    if (intro < 1) wash(g, 0, 0, W, H, 'ink', (1 - Ease.outCubic(clamp(intro, 0, 1))) * 0.85);
  }

  /* ----------------------------------------------------------------- input */

  function say(npcId, which) {
    const npc = NPC_BY_ID[npcId];
    if (!npc) return;
    const pool = npc.idle || [];
    line = which || (pool.length ? pool[(v.visits + v.money) % pool.length] : npc.greet);
  }

  function onPress(m) {
    if (mode === 'talk') {
      const leave = () => { mode = 'garden'; talking = null; line = null; Audio.sfx('back'); };
      // BACK TO SEA works from inside a deal too. It was drawn and inert, which is worse
      // than not drawing it: a button you can see and cannot press reads as a bug.
      if (UI.hover(sailRect, m)) { leave(); if (onDone) onDone(); return; }
      if (UI.hover(backRect, m)) { leave(); return; }
      const offers = (v.deals && v.deals[talking]) || [];
      for (let i = 0; i < dealHit.cards.length; i++) {
        if (!dealHit.cards[i] || !UI.hover(dealHit.cards[i], m)) continue;
        const got = buyOffer(v, talking, offers[i]);
        if (got) {
          Audio.sfx('cash');
          parts.emit('coin', m.x, m.y, { count: 8, speed: 80, color: 'brass3' });
          line = NPC_BY_ID[talking].buy;
          if (got.displaced) line += `  (${got.displaced.name} went back in the crate.)`;
        } else {
          Audio.sfx('error');
          line = v.money < offers[i].price ? NPC_BY_ID[talking].broke : 'No room for it.';
        }
        return;
      }
      // a click on the garden behind the blanket puts it away, which is what everybody
      // tries first
      if (!UI.hover(dealRect, m) && !UI.hover(backRect, m)) { leave(); return; }
      if (dealHit.quest && UI.hover(dealHit.quest, m)) {
        const q = claimQuest(v);
        if (q) {
          Audio.sfx('fanfare');
          Juice.flash('gold', 0.3, 0.3);
          parts.emit('star', m.x, m.y, { count: 14, speed: 90, color: 'gold' });
          line = q.done;
        }
        return;
      }
      return;
    }

    if (UI.hover(sailRect, m)) { if (onDone) onDone(); return; }

    // the beds
    for (let i = 0; i < bedRects.length; i++) {
      if (!UI.hover(bedRects[i].rect, m)) continue;
      selBed = bedRects[i].index;
      Audio.sfx('click');
      return;
    }
    for (let i = 0; i < deckRects.length; i++) {
      if (!UI.hover(deckRects[i].rect, m)) continue;
      selDeck = deckRects[i].index;
      Audio.sfx('click');
      return;
    }

    // the buttons on the two selection panels
    const bedId = v.eden[selBed];
    if (bedId) {
      if (UI.hover(actRects.pet, m)) {
        const res = pet(v, bedId);
        Audio.sfx(res.loyal && !res.already ? 'levelup' : 'chirp');
        parts.emit('heart', actRects.pet.x + 40, actRects.pet.y, {
          count: res.loyal ? 8 : 3, speed: 40, color: res.loyal ? 'gold' : 'pink',
        });
        return;
      }
      if (UI.hover(actRects.take, m)) {
        if (unstow(v, bedId)) { Audio.sfx('deal'); selBed = Math.max(0, selBed - 1); }
        else Audio.sfx('error');
        return;
      }
      if (UI.hover(actRects.sell, m)) {
        const got = sell(v, bedId, 'eden');
        if (got) {
          Audio.sfx('cash');
          parts.emit('coin', actRects.sell.x + 40, actRects.sell.y, { count: 6, speed: 70, color: 'brass3' });
          selBed = Math.max(0, selBed - 1);
        }
        return;
      }
    }
    const deckId = v.aboard[selDeck];
    if (deckId) {
      if (actRects.stow && UI.hover(actRects.stow, m)) {
        if (stow(v, deckId)) {
          Audio.sfx('deal');
          parts.emit('leaf', DECK.x + 40, DECK.y + 200, { count: 6, speed: 40, color: 'leaf3' });
          selDeck = Math.max(0, selDeck - 1);
        } else Audio.sfx('error');
        return;
      }
      if (actRects.sellDeck && UI.hover(actRects.sellDeck, m)) {
        if (sell(v, deckId, 'aboard')) {
          Audio.sfx('cash');
          selDeck = Math.max(0, selDeck - 1);
        }
        return;
      }
    }

    // the gates
    for (let i = 0; i < gateRects.length; i++) {
      if (!UI.hover(gateRects[i].rect, m)) continue;
      if (openGate(v, gateRects[i].id)) {
        Audio.sfx('unlock');
        Juice.flash('magic2', 0.35, 0.4);
        parts.emit('star', gateRects[i].rect.x + 37, gateRects[i].rect.y + 50,
          { count: 18, speed: 90, color: 'magic2' });
        mode = 'talk';
        talking = gateRects[i].id;
        line = NPC_BY_ID[talking].greet;
      } else Audio.sfx('error');
      return;
    }
    // and whoever is already here
    for (let i = 0; i < npcRects.length; i++) {
      if (!UI.hover(npcRects[i].rect, m)) continue;
      mode = 'talk';
      talking = npcRects[i].id;
      say(talking, NPC_BY_ID[talking].greet);
      Audio.sfx('click');
      return;
    }
  }

  function update(dt) {
    t += dt;
    intro = approach(intro, 1, 2.6, dt);
    parts.update(dt);
    const m = Input.mouse;

    hoverBed = -1; hoverDeck = -1; hoverGate = -1; hoverNpc = -1; hoverCard = -1;
    if (mode === 'talk') {
      for (let i = 0; i < dealHit.cards.length; i++) {
        if (dealHit.cards[i] && UI.hover(dealHit.cards[i], m)) { hoverCard = i; break; }
      }
      if (dealHit.quest && UI.hover(dealHit.quest, m)) hoverCard = 'quest';
      if (Input.pressed('Escape')) { mode = 'garden'; talking = null; }
    } else {
      for (let i = 0; i < bedRects.length; i++) if (UI.hover(bedRects[i].rect, m)) { hoverBed = i; break; }
      for (let i = 0; i < deckRects.length; i++) if (UI.hover(deckRects[i].rect, m)) { hoverDeck = i; break; }
      for (let i = 0; i < gateRects.length; i++) if (UI.hover(gateRects[i].rect, m)) { hoverGate = i; break; }
      for (let i = 0; i < npcRects.length; i++) if (UI.hover(npcRects[i].rect, m)) { hoverNpc = i; break; }
    }
    if (m.pressed) onPress(m);
    if (Input.pressed('Enter') && mode === 'garden' && onDone) onDone();
  }

  return {
    enter(args, api) {
      void api;
      v = args.voyage || args.run;
      onDone = args.onDone;
      enterGarden(v);
      t = 0; intro = 0;
      mode = 'garden'; talking = null; line = null;
      selBed = 0; selDeck = 0;
      parts = createParticles({ limit: 200, seed: v.seed + '/eden' });
      Audio.music('dock');
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,
    debug() {
      return {
        voyage: v, get mode() { return mode; },
        talk: (id) => { mode = 'talk'; talking = id; line = NPC_BY_ID[id] && NPC_BY_ID[id].greet; },
        rects: {
          beds: bedRects, deck: deckRects, gates: gateRects, npcs: npcRects,
          sail: sailRect, back: backRect, act: actRects, deal: dealHit,
          panel: dealRect,
        },
        onPress,
      };
    },
  };
}

void tri; void line; void textW;

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
import { drawPlant, bendAt } from '../render/flora.js';
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
  enterGarden, callNoah, noahCalled, buyOffer, questNow, claimQuest, pet, petsOf, PETS_FOR_LOYALTY,
} from '../game/garden.js';

const HUD_H = 40;

// The garden is DRAWN, not panelled. Three big wooden boxes covered the whole backdrop
// and turned the one warm place in the game into a filing cabinet, so the beds sit on
// the actual grass, the gate stands in the actual wall, and the chrome is pushed to the
// edges where chrome belongs.
const HOR = 176;                            // where the grass starts
const WALL_TOP = 96;
// THE GREAT GATE. It is the way out, so it is the biggest thing in the garden, it is in
// the middle of the frame, and its towers stand PROUD OF THE WALL -- a gate that fits
// inside a low wall can only be an arch as wide as it is tall, which reads as a dome on
// a stub rather than as a door.
const GATE_CX = 480, GATE_W = 190;
const GATE_TOP = 64;                        // the crown of the arch, clear of the HUD
const GATE_BASE = 250;                      // the sill, standing proud of the wall
const GATE_SPRING = GATE_TOP + GATE_W / 2;  // where the jambs stop and the arch starts
const RIV_Y = 262;
const BED_X = 22, BED_Y = 312, BED_COLS = 6, BED_CELL = 52;
const CHERUB = { x: 480, y: 330 };          // on the near end of the bridge, in the way
const NPC_Y = 344;                          // where whoever you have met stands
const DECK = { x: 12, y: 426, w: 396, h: 106 };
const BASKET = { x: 416, y: 426, w: 146, h: 106 };
const SLOTS_Y = 426;
const SLOT_X = 570;

/* ----------------------------------------------------------------- backdrop

A walled garden at the end of the afternoon, with THE GATE in the middle of it: the way
out, and the only door in the world that is not underwater. Baked once -- it is the
biggest static thing on screen and none of it moves except the plants, and those are
blitted live over the top.
*/
let bg = null;

function backdrop() {
  if (bg) return bg;
  const mk = makeCanvas(W, H);
  if (!mk) return null;
  const b = mk.g;

  // sky: gold at the horizon, because this is the one place in the game that is warm
  for (let y = 0; y < HOR; y++) {
    const f = y / HOR;
    rect(b, 0, y, W, 1, f < 0.5 ? mix(P.sky, P.cream, f * 2) : mix(P.cream, P.gold, (f - 0.5) * 1.6));
  }
  for (let r = 46; r > 18; r -= 6) wash(b, 168 - r, 58 - r, r * 2, r * 2, 'gold', 0.08);
  disc(b, 168, 58, 18, 'cream');
  disc(b, 168, 58, 13, 'white');

  // THE TREES GO BEHIND THE WALL. Drawn in front, their trunks stood ON the stone and
  // the garden read as a row of lollipops planted in a kerb -- what you see over a
  // garden wall is canopy and nothing else.
  const far = [[64, 34], [188, 26], [286, 30], [700, 24], [812, 34], [908, 26]];
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
  for (let x = 0; x < W; x += 30) {               // the capstones
    rect(b, x, WALL_TOP - 6, 28, 6, 'stone3');
    rect(b, x, WALL_TOP - 6, 28, 1, 'stone4');
    rect(b, x + 28, WALL_TOP - 6, 2, 6, 'stone1');
  }
  for (const ix of [56, 292, 902]) {              // ivy, spilling over
    for (let i = 0; i < 46; i++) {
      const x = ix + ((i * 13) % 34) - 17;
      const y = WALL_TOP - 4 + ((i * 7) % 44);
      px(b, x, y, i % 3 ? 'leaf1' : 'leaf2');
      if (i % 5 === 0) px(b, x + 1, y + 1, 'leaf3');
    }
  }

  // the ground: rich grass, in bands
  for (let y = HOR + 4; y < H; y++) {
    const f = (y - HOR - 4) / (H - HOR - 4);
    rect(b, 0, y, W, 1, f < 0.35 ? mix(P.leaf2, P.leaf1, f * 2)
      : f < 0.75 ? mix(P.leaf1, P.moss, (f - 0.35) * 2) : mix(P.moss, P.leaf0, (f - 0.75) * 2));
  }

  /* ------------------------------------------------------------ THE GATE

  Two towers standing proud of the wall, a semicircular arch of voussoirs with a
  keystone, a pair of bronze leaves standing open against the jambs -- and THROUGH the
  opening, the sea. That last part is the whole trick: the thing you can see through the
  door is where the door goes.
  */
  const gx0 = GATE_CX - GATE_W / 2, gx1 = GATE_CX + GATE_W / 2;
  const spring = GATE_SPRING;
  const openHW = (y) => {
    if (y >= spring) return GATE_W / 2;
    const k = (spring - y) / (GATE_W / 2);
    return (GATE_W / 2) * Math.sqrt(Math.max(0, 1 - k * k));
  };
  // what is out there: sky, a horizon, water, and the boat waiting on it
  const seaY = GATE_BASE - 54;
  for (let y = GATE_TOP; y < GATE_BASE; y++) {
    const hw = openHW(y);
    if (hw < 1) continue;
    const c = y < seaY
      ? mix(P.cream, P.sky, (y - GATE_TOP) / Math.max(1, seaY - GATE_TOP) * 0.7)
      : mix(P.water2, P.water0, (y - seaY) / Math.max(1, GATE_BASE - seaY));
    rect(b, GATE_CX - hw, y, hw * 2, 1, c);
  }
  rect(b, GATE_CX - openHW(seaY), seaY, openHW(seaY) * 2, 2, 'foam');
  for (let i = 0; i < 22; i++) {                    // glitter on the water out there
    const yy = seaY + 4 + (i % 7) * 6;
    const hw = openHW(yy) - 6;
    if (hw < 4) continue;
    rect(b, GATE_CX - hw + ((i * 37) % (hw * 2)), yy, 3 + (i % 3), 1, 'foam');
  }
  // the light of it, pouring in and lying on the ground in front of the arch
  for (let i = 0; i < 7; i++) {
    wash(b, GATE_CX - 26 * (i + 1), GATE_TOP + 10, 52 * (i + 1), GATE_BASE - GATE_TOP, 'gold', 0.02);
  }
  for (let y = 0; y < 40; y++) {
    const w2 = GATE_W * 0.5 + y * 3;
    wash(b, GATE_CX - w2, GATE_BASE + y, w2 * 2, 1, 'gold', 0.05 * (1 - y / 40));
  }
  // voussoirs round the arch, and a keystone at the crown
  for (let a = 0; a <= 40; a++) {
    const ang = Math.PI * (a / 40);
    const rr = GATE_W / 2 + 11;
    const vx = GATE_CX - Math.cos(ang) * rr;
    const vy = spring - Math.sin(ang) * rr;
    rect(b, vx - 9, vy - 9, 18, 18, a % 2 ? 'stone3' : 'stone2');
    rect(b, vx - 9, vy - 9, 18, 3, 'stone4');
    rect(b, vx - 9, vy + 6, 18, 3, mix(P.stone1, P.ink, 0.3));
  }
  rect(b, GATE_CX - 16, GATE_TOP - 22, 32, 34, 'stone4');
  rect(b, GATE_CX - 16, GATE_TOP - 22, 32, 4, 'cream');
  rect(b, GATE_CX - 16, GATE_TOP + 8, 32, 4, mix(P.stone1, P.ink, 0.3));
  // the towers: they run from above the arch all the way to the ground
  for (const tx of [gx0 - 42, gx1 + 2]) {
    for (let y = GATE_TOP + 6; y < GATE_BASE + 4; y++) {
      const f = (y - GATE_TOP) / (GATE_BASE - GATE_TOP);
      rect(b, tx, y, 40, 1, f < 0.1 ? 'stone3' : y % 9 < 4 ? 'stone2' : 'stone1');
    }
    for (let y = GATE_TOP + 12; y < GATE_BASE; y += 9) rect(b, tx, y, 40, 1, mix(P.stone1, P.ink, 0.28));
    rect(b, tx, GATE_TOP + 6, 8, GATE_BASE - GATE_TOP - 2, 'stone3');
    rect(b, tx + 34, GATE_TOP + 6, 6, GATE_BASE - GATE_TOP - 2, mix(P.stone1, P.ink, 0.2));
    // battlements on top, and an arrow slit
    for (let i = 0; i < 4; i++) rect(b, tx + i * 11, GATE_TOP - 12, 8, 18, 'stone3');
    rect(b, tx - 3, GATE_TOP + 4, 46, 6, 'stone4');
    rect(b, tx + 17, GATE_TOP + 30, 6, 22, 'ink');
    rect(b, tx + 18, GATE_TOP + 31, 4, 20, mix(P.night, P.ink, 0.5));
    rect(b, tx - 4, GATE_BASE - 6, 48, 10, 'stone3');
    rect(b, tx - 4, GATE_BASE - 6, 48, 2, 'stone4');
  }
  // the two leaves, standing open against the jambs: bronze, banded, studded
  for (const [lx, dir] of [[gx0 + 3, 1], [gx1 - 33, -1]]) {
    for (let y = GATE_BASE - 4; y > spring - 60; y -= 1) {
      const hw = openHW(y);
      if (hw < 34) continue;
      const w = 30;
      rect(b, dir > 0 ? lx : lx + 30 - w, y, w, 1, y % 12 < 6 ? 'brass1' : 'brass0');
      rect(b, dir > 0 ? lx : lx + 30 - 3, y, 3, 1, 'brass2');
    }
    for (let y = spring - 50; y < GATE_BASE - 8; y += 24) {
      if (openHW(y) < 34) continue;
      rect(b, lx, y, 30, 4, 'brass2');
      px(b, lx + 4, y + 1, 'gold'); px(b, lx + 24, y + 1, 'gold');
    }
  }
  // a flaming sword hung IN the archway, because somebody has to keep it and there is
  // no room above the crown -- the HUD owns the top forty pixels of the world
  const swy = GATE_TOP + 24;
  rect(b, GATE_CX - 2, swy, 4, 40, 'ice');
  rect(b, GATE_CX - 1, swy, 2, 40, 'white');
  rect(b, GATE_CX - 12, swy + 38, 24, 5, 'brass2');
  rect(b, GATE_CX - 3, swy + 43, 6, 8, 'brass1');
  for (let i = 0; i < 18; i++) {
    const fy = swy - 3 - i * 2;
    const fw = Math.max(1, 9 - i * 0.5);
    rect(b, GATE_CX - fw / 2, fy, fw, 2, i < 4 ? 'white' : i < 9 ? 'gold' : 'orange');
  }


  // one of the four rivers, with banks, and a bridge on the way to the gate
  rect(b, 0, RIV_Y - 4, W, 4, 'clay2');
  rect(b, 0, RIV_Y - 4, W, 1, 'clay3');
  for (let y = 0; y < 22; y++) {
    rect(b, 0, RIV_Y + y, W, 1,
      y < 2 ? 'foam' : y < 8 ? 'water3' : y < 15 ? 'water2' : y < 19 ? 'water1' : 'water0');
  }
  rect(b, 0, RIV_Y + 22, W, 4, 'clay2');
  rect(b, 0, RIV_Y + 25, W, 1, 'clay1');
  for (let i = 0; i < 160; i++) px(b, (i * 71) % W, RIV_Y + 3 + ((i * 13) % 17), 'foam');
  // the bridge: three stones, a parapet either side
  rect(b, GATE_CX - 46, RIV_Y - 6, 92, 36, 'stone2');
  rect(b, GATE_CX - 46, RIV_Y - 6, 92, 4, 'stone3');
  rect(b, GATE_CX - 46, RIV_Y + 26, 92, 4, 'stone1');
  for (let i = 0; i < 5; i++) rect(b, GATE_CX - 46 + i * 19, RIV_Y - 6, 2, 36, 'stone1');
  for (const py of [RIV_Y - 12, RIV_Y + 28]) {
    rect(b, GATE_CX - 50, py, 100, 7, 'stone3');
    rect(b, GATE_CX - 50, py, 100, 2, 'stone4');
  }

  // the path: straight up the middle from the beds to the gate, because the gate is the
  // one place you are ever going
  for (let y = RIV_Y + 30; y < H; y++) {
    const f = (y - RIV_Y - 30) / (H - RIV_Y - 30);
    const cx2 = GATE_CX + Math.sin(f * 2.2) * 10;
    const half = 16 + f * 22;
    for (let dx = -half; dx <= half; dx++) {
      const tt = Math.abs(dx) / half;
      px(b, Math.round(cx2 + dx), y,
        tt > 0.82 ? mix(P.leaf1, P.clay1, 0.4) : tt > 0.4 ? mix(P.clay1, P.moss, 0.55) : mix(P.clay1, P.clay2, 0.4));
    }
    if (y % 6 === 0) px(b, Math.round(cx2 - half), y, 'leaf3');
    if (y % 7 === 2) px(b, Math.round(cx2 + half), y, 'leaf2');
  }

  // GRASS STROKES first, in quantity: the layer that stops a lawn reading as felt.
  for (let i = 0; i < 3000; i++) {
    const x = (i * 149) % W;
    const y = RIV_Y + 28 + ((i * 97) % (H - RIV_Y - 32));
    const k = ((i * 31) % 100) / 100;
    const base = y < H * 0.72 ? P.leaf1 : P.moss;
    rect(b, x, y, 1 + Math.round(k * 3), 1, mix(base, k < 0.5 ? P.ink : P.leaf3, 0.08 + k * 0.07));
  }

  // a hedge along the foot of the wall, either side of the gate
  for (let x = 0; x < W; x += 5) {
    if (x > GATE_CX - GATE_W / 2 - 40 && x < GATE_CX + GATE_W / 2 + 40) continue;
    const h2 = 18 + ((x * 7) % 10);
    for (let y = 0; y < h2; y++) {
      const f = y / h2;
      px(b, x + ((y * 3) % 4), HOR + 8 - y, f > 0.78 ? 'leaf3' : f > 0.4 ? 'leaf2' : 'leaf0');
      px(b, x + 2 + ((y * 5) % 3), HOR + 8 - y, f > 0.86 ? 'leaf4' : f > 0.3 ? 'leaf1' : 'leaf0');
    }
  }

  // TWO BIG TREES, in front of the wall, framing the gate. Trunks on the actual grass.
  for (const [tx, sc] of [[92, 1], [880, -1]]) {
    const by = HOR + 46;
    for (let y = 0; y < 84; y++) {
      const w2 = 16 - Math.round((y / 84) * 5);
      rect(b, tx - w2 / 2 + sc * Math.round(Math.sin(y * 0.05) * 3), by - y, w2, 1,
        y % 9 < 4 ? 'bark' : 'wood1');
      if (y % 11 === 0) rect(b, tx - w2 / 2, by - y, 3, 1, 'wood2');
    }
    for (let i = 0; i < 5; i++) {                    // roots
      rect(b, tx - 18 + i * 8, by - 2, 7, 4, 'bark');
    }
    for (let i = 0; i < 11; i++) {                   // canopy
      const a = -0.2 - i * 0.3;
      const rr = 26 + (i % 3) * 12;
      ellipse(b, tx + Math.cos(a) * rr * 0.9, by - 84 + Math.sin(a) * rr * 0.5,
        rr, rr * 0.62, i % 3 === 0 ? 'leaf1' : i % 3 === 1 ? 'leaf2' : 'leaf0');
    }
    ellipse(b, tx, by - 116, 40, 22, 'leaf3');
    for (let i = 0; i < 14; i++) {
      px(b, tx - 34 + i * 5, by - 130 + ((i * 7) % 16), 'leaf4');
      if (i % 3 === 0) px(b, tx - 30 + i * 5, by - 116 + ((i * 5) % 20), 'pink');
    }
  }

  // AND THE UNDERGROWTH. Two hundred plants, baked: ferns and flowers under the wall,
  // grass everywhere the path and the beds are not, reeds along the river.
  const spots = [];
  // the strip between the wall and the river first: it is the deepest part of the garden
  // and a flat green band there makes the whole place read as a lawn with a fence on it
  for (let i = 0; i < 90; i++) {
    const x = Math.round(EH(i * 19 + 5) * W);
    const y = Math.round(HOR + 16 + EH(i * 23) * (RIV_Y - HOR - 22));
    if (Math.abs(x - GATE_CX) < GATE_W / 2 + 50 && y < GATE_BASE + 6) continue;
    const k = EH(i * 29);
    spots.push([x, y, k < 0.45 ? 'grass' : k < 0.62 ? 'tuft' : k < 0.78 ? 'flower' : k < 0.9 ? 'fern' : 'bush',
      Math.floor(EH(i * 31) * 4)]);
  }
  for (let i = 0; i < 240; i++) {
    const x = Math.round(EH(i * 3) * W);
    const y = Math.round(RIV_Y + 30 + Math.pow(EH(i * 7), 0.8) * (H - RIV_Y - 44));
    if (Math.abs(x - (GATE_CX + Math.sin(((y - RIV_Y - 30) / (H - RIV_Y - 30)) * 2.2) * 10))
      < 18 + ((y - RIV_Y - 30) / (H - RIV_Y - 30)) * 24) continue;      // keep the path clear
    if (y > 420 && x < 580) continue;                                    // keep the panels clear
    if (y > BED_Y - 26 && y < BED_Y + 22 && x < BED_X + BED_COLS * BED_CELL) continue;
    const k = EH(i * 11);
    const kind = k < 0.5 ? 'grass' : k < 0.66 ? 'tuft' : k < 0.8 ? 'flower' : k < 0.9 ? 'fern' : 'bush';
    spots.push([x, y, kind, Math.floor(EH(i * 13) * 4)]);
  }
  for (let i = 0; i < 40; i++) {                     // reeds and lilies at the water
    const x = Math.round(EH(i * 17) * W);
    if (Math.abs(x - GATE_CX) < 60) continue;
    spots.push([x, RIV_Y - 2 + (i % 2 ? 0 : 26), i % 3 ? 'reed' : 'cattail', i % 4]);
  }
  spots.sort((a, c) => a[1] - c[1]);
  for (const [x, y, kind, vv] of spots) drawPlant(b, x, y, kind, { biome: 'eden', v: vv, bend: 0 });

  bg = mk.canvas;
  return bg;
}

/** A hash for the garden's furniture, so it is in the same place every visit. */
function EH(n) { const v = Math.sin(n * 91.7 + 13.1) * 43758.5453; return v - Math.floor(v); }

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
  let callRect = null;
  let actRects = {};

  /** Where the keeper is standing. One definition, used by the hit test and the harness. */
  function cherubRect() { return UI.rectOf(CHERUB.x - 30, CHERUB.y - 76, 60, 84); }

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
    // scale 0.5 draws the 32-pixel art at 1:1, and the sprite anchors on its FEET now
    drawAnimal(g, a, x, y + 13 + bob, { scale: 0.5, mood: 'happy' });
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
    UI.ribbon(g, BED_X, BED_Y - 26, 176, 'THE BEDS', { color: 'leaf4', font: 7, h: 15 });
    text(g, `${v.eden.length} of ${gardenSize(v)} safe for good`, BED_X + 186, BED_Y - 23,
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
      text(g, `+${total - shown} more beds up the hill`, BED_X + 186, BED_Y - 16,
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
      drawAnimal(g, a, bx, by + 11, { scale: 0.5 });
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
  /**
   * THE GATE, THE KEEPER, AND WHOEVER YOU HAVE MET.
   *
   * The gate is the way out, so it is the button that leaves: click the arch and you
   * sail. The Cherubim stands beside it with one errand -- he will call Noah, once, for
   * nothing -- and everybody else in the garden was met out on the water.
   */
  function drawGate(g) {
    // the light of the outside world, breathing in the arch
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
    const gateHot = hoverGate === 0;
    for (let i = 5; i >= 1; i--) {
      wash(g, GATE_CX - 34 * i, GATE_TOP + 20 - 18 * i, 68 * i, 60 * i, 'gold',
        0.02 + (gateHot ? 0.02 : 0) + pulse * 0.008);
    }
    // motes going out through it, because that is the direction everything is going
    for (let i = 0; i < 14; i++) {
      const f = ((t * 0.24 + i / 14) % 1);
      const mx = GATE_CX + (EH(i) - 0.5) * GATE_W * 0.7 * (1 - f * 0.5);
      const my = GATE_BASE - f * (GATE_BASE - GATE_TOP - 10);
      px(g, mx, my, i % 3 ? 'gold' : 'cream');
      if (i % 4 === 0) px(g, mx + 1, my + 1, 'brass3');
    }
    gateRects = [{ rect: UI.rectOf(GATE_CX - GATE_W / 2, GATE_TOP, GATE_W, GATE_BASE - GATE_TOP), id: 'out' }];
    // the sign over it, and what happens if you walk through
    const lbl = gateHot ? 'THROUGH THE GATE AND BACK TO SEA' : 'THE GATE';
    const lw = textW(lbl, { font: 5 }) + 18;
    rect(g, GATE_CX - lw / 2, GATE_BASE + 4, lw, 15, gateHot ? 'brass1' : 'wood0');
    UI.boxEdge(g, GATE_CX - lw / 2, GATE_BASE + 4, lw, 15, gateHot ? 'gold' : 'ink');
    text(g, lbl, GATE_CX, GATE_BASE + 8, gateHot ? 'wood0' : 'parch1', { font: 5, center: true });

    // THE KEEPER
    const cherHot = hoverNpc === -2;
    drawFolk(g, 'cherub', CHERUB.x, CHERUB.y, t, {
      scale: 2, sparkle: 0.7, pose: cherHot ? 'happy' : 'idle', talking: cherHot,
    });
    drawSparkle(g, CHERUB.x, CHERUB.y - 60, 2, t, cherHot ? 1 : 0.5);
    const ctag = noahCalled(v) ? 'THE CHERUBIM' : 'THE CHERUBIM · WILL CALL NOAH';
    const cw = textW(ctag, { font: 3 }) + 10;
    wash(g, CHERUB.x - cw / 2, CHERUB.y + 6, cw, 11, 'ink', cherHot ? 0.85 : 0.6);
    text(g, ctag, CHERUB.x, CHERUB.y + 8, cherHot ? 'white' : 'magic2', { font: 3, center: true });
    if (cherHot) text(g, 'CLICK TO TALK', CHERUB.x, CHERUB.y + 20, 'gold', { font: 3, center: true, shadow: 'ink' });

    // whoever you have met, standing about on the grass to the right of the path
    npcRects = [];
    v.summoned.forEach((npcId, i) => {
      const npc = NPC_BY_ID[npcId];
      if (!npc) return;
      const nx = 636 + (i % 3) * 92;
      const ny = NPC_Y + (i % 2) * 26 + Math.floor(i / 3) * 44;
      npcRects.push({ rect: UI.rectOf(nx - 26, ny - 62, 52, 70), id: npcId });
      const hot = hoverNpc === i;
      drawFolk(g, npc.folk, nx, ny, t + i * 0.7, {
        scale: 1, pose: hot ? 'happy' : 'idle', talking: hot,
      });
      const nm = npc.name.toUpperCase();
      const nw = textW(nm, { font: 3 }) + 8;
      wash(g, nx - nw / 2, ny + 3, nw, 10, 'ink', hot ? 0.85 : 0.55);
      text(g, nm, nx, ny + 5, hot ? 'white' : 'parch1', { font: 3, center: true });
      const deal = (v.deals && v.deals[npcId]) || [];
      for (let k = 0; k < deal.length; k++) disc(g, nx - 6 + k * 6, ny - 66, 2, 'gold');
      if (hot) text(g, 'CLICK TO TALK', nx, ny + 15, 'gold', { font: 3, center: true, shadow: 'ink' });
    });
    if (!v.summoned.length) {
      wrap('Nobody here yet. Ask the Cherubim for Noah. You will meet the rest out there.',
        260, { font: 3 }).forEach((l, i) => {
        text(g, l, 640, NPC_Y - 34 + i * 9, 'cream', { font: 3, shadow: 'ink' });
      });
    }

    // and the plants that move, over the baked ones
    for (let i = 0; i < 44; i++) {
      const x = Math.round(EH(i * 29) * W);
      const y = Math.round(RIV_Y + 34 + Math.pow(EH(i * 31), 0.8) * (H - RIV_Y - 50));
      if (y > 420 && x < 580) continue;
      if (Math.abs(x - GATE_CX) < 30) continue;
      drawPlant(g, x, y, i % 5 === 0 ? 'tuft' : 'grass', { biome: 'eden', v: i % 4, t });
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
      // THE KEEPER'S ONE ERRAND. It is a button and not a card because it costs nothing
      // and he will only ever do it once -- a price tag on it would be a lie.
      callRect = null;
      if (talking === 'cherub') {
        callRect = UI.rectOf(dx, dy + dh + 8, 210, 24);
        const done = noahCalled(v);
        UI.button(g, callRect, done ? 'NOAH IS ALREADY IN' : 'CALL UPON NOAH', {
          state: done ? 'disabled' : UI.hover(callRect, Input.mouse) ? 'hover' : 'idle',
          color: 'magic0', icon: 'boat', font: 5,
        });
      }
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
      if (callRect && UI.hover(callRect, m)) {
        if (callNoah(v)) {
          Audio.sfx('unlock');
          Juice.flash('magic2', 0.35, 0.4);
          parts.emit('star', GATE_CX, GATE_BASE - 50, { count: 22, speed: 100, color: 'magic2' });
          say('cherub', 'He is coming up the path now. He will want to look at your boat.');
        } else Audio.sfx('error');
        return;
      }
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

    // THE KEEPER, first: he stands in front of the gate and a click on him must not
    // also walk you through it
    if (UI.hover(cherubRect(), m)) {
      mode = 'talk';
      talking = 'cherub';
      say('cherub', noahCalled(v)
        ? 'He is already in. Mind the beds, he is particular about the beds.'
        : NPC_BY_ID.cherub.greet);
      Audio.sfx('click');
      return;
    }
    // THE GATE: the way out
    for (let i = 0; i < gateRects.length; i++) {
      if (!UI.hover(gateRects[i].rect, m)) continue;
      Audio.sfx('unlock');
      Juice.flash('gold', 0.3, 0.35);
      parts.emit('star', GATE_CX, GATE_BASE - 40, { count: 20, speed: 90, color: 'gold' });
      if (onDone) onDone();
      return;
    }
    // and whoever you have met
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
      if (UI.hover(cherubRect(), m)) hoverNpc = -2;
      else for (let i = 0; i < gateRects.length; i++) if (UI.hover(gateRects[i].rect, m)) { hoverGate = i; break; }
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
          cherub: cherubRect(), call: callRect,
          panel: dealRect,
        },
        onPress,
      };
    },
  };
}

void tri; void line; void textW;

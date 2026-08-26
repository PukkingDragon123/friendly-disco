// THE OCEAN — the map, and the only real route decision in the game.
//
// Three islands stand on the horizon. You can see what each one IS before you commit:
// its weather, its scenery, how many animals are ashore, what is in the way, and what
// the crossing costs you in tide. Then you pick one, and the flood takes the rest.
//
// The whole scene is built to make one comparison easy and one comparison honest:
//
//   EASY     what is in the way there, against who is standing on my deck right now.
//            Every obstacle chip on a card is ticked green if an animal aboard can
//            clear it and crossed red if nothing can, read live off the manifest at
//            the bottom of the screen. That is the route decision, drawn.
//
//   HONEST   what the crossing costs. Every card shows its own tide cost, so choosing
//            the far island is visibly choosing to lose ocean, and Cherubim Rock is
//            visibly the cheap one.
//
// Performance: the sky, the sea ramp and the far headlands are ONE baked canvas keyed
// on nothing but its size, and the three islands are baked by render/islandart.js.
// Live per frame: clouds, crests, gulls, the tide edge, the boat, and the text. That
// is a few hundred canvas calls for a scene that fills 960x540 with weather.

import { P, col, mix } from '../core/palette.js';
import {
  makeCanvas, rect, px, dashLine, disc, ellipse, tri, text, textW, wrap, wash,
  dither, vgrad, clamp, lerp, W, H,
} from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import * as UI from '../render/uikit.js';
import { drawBoat } from '../render/boat.js';
import { drawIslandFar, FLORA_BIOME } from '../render/islandart.js';
import { drawPlant } from '../render/flora.js';
import { drawAnimal } from '../render/sprites.js';
import { drawFolk } from '../render/folk.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { BEAST_BY_ID, UPGRADES as BEAST_UPGRADES } from '../data/beasts.js';
import { abilityOf, ABILITY_BY_ID } from '../data/abilities.js';
import { OBSTACLE_BY_ID } from '../data/obstacles.js';
import {
  sailTo, capacity, hullMax, floodPerLeg, isLoyal,
  LEGS_PER_CHAPTER, CHAPTERS, beastBox, buyBeastUpgrade, say,
} from '../game/voyage.js';

const HUD_H = 46;
const LADDER_Y = HUD_H + 2, LADDER_H = 22;
const HORIZON = 214;              // where sky meets sea
// THREE BIG ISLANDS. They used to be 208x104 with a 254-wide card parked in front of
// each one, which meant the thing you were choosing between was a paragraph and the
// island behind it was decoration. Now the island IS the button: three of them, three
// hundred pixels wide, and the writing only appears for the one under the cursor.
const ISLE_X = [162, 480, 798];
const ISLE_W = 306, ISLE_H = 120;
const ISLE_BASE = HORIZON + 18;   // the waterline they stand on
const PIN_Y = 80;                 // the marker plaque above each island
const PLAQUE_W = 320, PLAQUE_H = 104, PLAQUE_Y = ISLE_BASE + 30;
const DECK_X = 398, DECK_Y = 430, DECK_W = W - DECK_X - 14, DECK_H = 98;
const BOAT_X = 196, BOAT_WL = 486;
const BOAT_SCALE = 3;
const FLOTSAM_Y = 360;            // the open-water lane between the islands and the boat
const SUN_X = 700;                // where the afternoon sun sits, for the glitter path

/* ---------------------------------------------------------------- the backdrop

Sky, sea and the three ranks of far headlands, baked once. Nothing in here moves, and
it is the single biggest static thing on screen: dithering the sea per frame is about
a hundred thousand fillRects and it measured under 25fps.
*/
let bakeCv = null, bakeKey = '';

function hash(n) {
  let x = Math.imul(n + 374761393, 1274126177);
  x = Math.imul(x ^ (x >>> 15), 2246822507);
  return ((x ^ (x >>> 13)) >>> 0) / 4294967296;
}

function backdrop() {
  const key = `${W}/${H}/${HORIZON}`;
  if (key === bakeKey && bakeCv) return bakeCv;
  const mk = makeCanvas(W, H);
  if (!mk) return null;
  const b = mk.g;

  // A warm afternoon sky. Cream at the horizon so the islands have something bright to
  // stand against, and the blue kept muted -- a saturated sky makes everything under it
  // look like a screenshot of a different game.
  vgrad(b, 0, 0, W, HORIZON, ['sky', 'ice', 'cream', 'sand'], 3);

  // sea: a depth ramp toward the viewer, dithered one row at a time
  const seaH = H - HORIZON;
  const ramp = ['water3', 'water2', 'water1', 'water0'];
  for (let i = 0; i < seaH; i++) {
    const k = Math.pow(i / seaH, 0.72) * (ramp.length - 1);
    const i0 = Math.min(ramp.length - 1, Math.floor(k));
    const i1 = Math.min(ramp.length - 1, i0 + 1);
    dither(b, 0, HORIZON + i, W, 1, ramp[i0], ramp[i1], Math.round((k - i0) * 16));
  }
  rect(b, 0, HORIZON - 1, W, 1, mix(P.cream, P.water3, 0.5));

  // far headlands: three ranks, each paler and lower, which is the whole illusion of a
  // world that carries on past the three islands you are being offered.
  for (let rank = 0; rank < 3; rank++) {
    const tint = 0.62 - rank * 0.2;
    const hh = 10 + rank * 7;
    for (let i = -1; i < 8; i++) {
      const hx = i * W * 0.15 + hash(rank * 31 + i * 7) * W * 0.1;
      const hw = W * (0.05 + hash(rank * 13 + i) * 0.05);
      for (let y = 0; y < hh; y++) {
        const f = 1 - y / hh;
        const ww = Math.round(hw * Math.pow(f, 0.45));
        if (ww < 1) continue;
        rect(b, Math.round(hx - ww), HORIZON - 1 - y - rank, ww * 2, 1,
          mix(P.moss, P.cream, tint));
      }
    }
  }
  bakeKey = key;
  bakeCv = mk.canvas;
  return bakeCv;
}

export function clearOceanCache() { bakeCv = null; bakeKey = ''; }

/* ------------------------------------------------------------------- the scene */

export function makeOceanScene() {
  let v = null, onArrive = null, onOver = null;
  let parts = null;
  let t = 0, intro = 0;
  let hover = -1;
  let isles = [];
  let shop = false;          // the deck panel flips to the workshop
  let craftRects = [];
  let shopTab = null;
  let state = 'choose';
  let sailT = 0, picked = -1;
  let boatX = BOAT_X, boatY = BOAT_WL;

  // deterministic furniture
  const clouds = [];
  for (let i = 0; i < 7; i++) {
    clouds.push({
      x: hash(i * 3 + 1) * W, y: 20 + hash(i * 5 + 2) * 110,
      w: 22 + hash(i * 7 + 3) * 40, h: 6 + hash(i * 11 + 4) * 7,
      sp: 3 + hash(i * 13 + 5) * 7, lumps: 2 + Math.floor(hash(i * 17 + 6) * 3),
    });
  }
  const flotsam = [];
  for (let i = 0; i < 5; i++) {
    flotsam.push({
      x: hash(i * 19 + 11) * W, y: FLOTSAM_Y + hash(i * 23 + 12) * 30,
      sp: 5 + hash(i * 29 + 13) * 9, ph: hash(i * 31 + 14) * 6,
      kind: Math.floor(hash(i * 37 + 15) * 3),
    });
  }
  const gulls = [];
  for (let i = 0; i < 4; i++) {
    gulls.push({ x: hash(i + 40) * W, y: 60 + hash(i + 50) * 80, sp: 12 + hash(i + 60) * 16, ph: hash(i + 70) * 6 });
  }

  /* ------------------------------------------------------ what my deck can do */

  /** Every ability standing on the boat right now, with a count. */
  function aboardAbilities() {
    const out = {};
    for (const id of v.aboard) {
      const a = ANIMAL_BY_ID[id];
      if (!a) continue;
      const ab = abilityOf(a).id;
      out[ab] = (out[ab] || 0) + 1;
    }
    return out;
  }

  /**
   * How this island reads against my deck: which of its obstacles I can open, which I
   * cannot, and which nothing ever can. The last group is the interesting one -- an
   * island with a whirlpool is not unwinnable, it is a route problem.
   */
  function readIsland(island, have) {
    const rows = [];
    for (const oid of island.obstacles || []) {
      const ob = OBSTACLE_BY_ID[oid];
      if (!ob) continue;
      const need = ob.clearedBy;
      rows.push({
        ob,
        need,
        ok: need ? (have[need] || 0) > 0 : false,
        never: !need,
      });
    }
    return rows;
  }

  function tideCost(island) {
    return floodPerLeg(v) * (island.teleport ? 0.34 : 1);
  }

  /* ------------------------------------------------------------------ choosing */

  function choose(i) {
    if (state !== 'choose') return;
    const island = v.choices[i];
    if (!island) return;
    picked = i;
    state = 'sail';
    sailT = 0;
    sailTo(v, island);
    Audio.sfx('boat_horn');
    Juice.shake(2, 0.2);
    parts.emit('splash', boatX, boatY, { count: 10, speed: 90, color: 'foam' });
  }

  function finishSail() {
    const island = v.choices[picked];
    if (v.over && onOver) { onOver(); return; }
    if (onArrive) onArrive(island);
  }

  /* ---------------------------------------------------------------------- draw */

  function drawSky(g) {
    // the sun: a soft disc with two haloes, which is four calls and sets the whole
    // time of day
    for (let r = 40; r > 16; r -= 6) wash(g, SUN_X - r, 76 - r, r * 2, r * 2, 'sand', 0.1);
    disc(g, SUN_X, 76, 17, 'cream');
    disc(g, SUN_X, 76, 13, 'white');
    // clouds: three lumps each, so seven clouds is twenty-one ellipses
    for (const c of clouds) {
      const cx = ((c.x + t * c.sp) % (W + 160)) - 80;
      for (let i = 0; i < c.lumps; i++) {
        const f = i / Math.max(1, c.lumps - 1) - 0.5;
        ellipse(g, cx + f * c.w, c.y + Math.abs(f) * c.h * 0.7, c.w * 0.42, c.h, 'white');
      }
      ellipse(g, cx, c.y + c.h * 0.6, c.w * 0.5, c.h * 0.5, 'cream');
    }
    for (const b of gulls) {
      const gx = ((b.x + t * b.sp) % (W + 60)) - 30;
      const flap = Math.sin(t * 6 + b.ph) > 0 ? 1 : 0;
      px(g, gx, b.y, 'grey0'); px(g, gx - 2, b.y - flap, 'grey1'); px(g, gx + 2, b.y - flap, 'grey1');
    }
  }

  /**
   * A compass rose on the water. The lower half of the map is open sea by design -- it
   * is where the ark is and where the courses run -- but open sea with nothing in it
   * reads as an unfinished screen. A chart mark costs about forty calls and makes the
   * emptiness look intended.
   */
  function drawRose(g, cx, cy, r) {
    g.globalAlpha = 0.16;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const len = i % 2 === 0 ? r : r * 0.52;
      tri(g, cx + Math.cos(a) * len, cy + Math.sin(a) * len * 0.6,
        cx + Math.cos(a + 0.22) * len * 0.2, cy + Math.sin(a + 0.22) * len * 0.12,
        cx + Math.cos(a - 0.22) * len * 0.2, cy + Math.sin(a - 0.22) * len * 0.12,
        i % 2 === 0 ? 'foam' : 'water3');
    }
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      rect(g, cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.5, 2, 1, 'foam');
    }
    g.globalAlpha = 1;
  }

  function drawSea(g) {
    // crests: sparse dashes that get longer and further apart as they come at you
    for (let row = 0; row < 16; row++) {
      const f = row / 15;
      const y = Math.round(HORIZON + 6 + Math.pow(f, 1.7) * (H - HORIZON - 10));
      const step = 20 + f * 44;
      const drift = (t * (6 + f * 26)) % step;
      const len = 2 + Math.round(f * 7);
      for (let x = -step; x < W + step; x += step) {
        const wx = Math.round(x + drift + Math.sin(t * 0.8 + row) * 6);
        rect(g, wx, y, len, 1, f < 0.4 ? 'water3' : 'foam');
        if (f > 0.6) px(g, wx + len, y + 1, 'water3');
      }
    }
    // the sun's glitter path, which is the one thing that makes flat water look wet
    for (let i = 0; i < 22; i++) {
      const f = i / 21;
      const y = Math.round(HORIZON + 4 + Math.pow(f, 1.8) * (H - HORIZON - 8));
      const spread = 6 + f * 60;
      const jx = Math.sin(t * 2.1 + i * 2.3) * spread;
      rect(g, Math.round(SUN_X + jx), y, 1 + Math.round(f * 3), 1, i % 3 ? 'foam' : 'white');
    }
    // flotsam: somebody's roof, somebody's barrel. The world is drowning offscreen and
    // this is the only place the map says so without words.
    for (const fl of flotsam) {
      const fx = ((fl.x + t * fl.sp) % (W + 120)) - 60;
      const fy = fl.y + Math.round(Math.sin(t * 1.6 + fl.ph) * 1.4);
      if (fl.kind === 0) {                       // a plank
        rect(g, fx, fy, 14, 2, 'wood2');
        rect(g, fx, fy, 14, 1, 'wood3');
        px(g, fx + 4, fy - 1, 'wood1');
      } else if (fl.kind === 1) {                // a barrel, rolling
        rect(g, fx, fy - 3, 8, 6, 'wood2');
        rect(g, fx, fy - 3, 8, 1, 'wood3');
        rect(g, fx + 3, fy - 3, 1, 6, 'brass1');
      } else {                                   // a crate corner, mostly under
        rect(g, fx, fy - 4, 9, 5, 'wood1');
        rect(g, fx, fy - 4, 9, 1, 'wood3');
        rect(g, fx + 1, fy - 2, 7, 1, 'wood0');
      }
      rect(g, fx - 2, fy + 2, 14, 1, 'foam');
    }
  }

  /** The tide: how much of the ocean the flood has already taken. */
  function drawTide(g) {
    const f = clamp(v.flood, 0, 1);
    const band = Math.round((H - HORIZON) * f);
    if (band <= 0) return;
    wash(g, 0, HORIZON, W, band, 'ink', 0.3 + f * 0.16);
    const edge = HORIZON + band;
    dashLine(g, 0, edge, W, edge, 'foam', 5, 4, Math.floor(t * 9));
    rect(g, 0, edge + 1, W, 1, mix(P.water0, P.ink, 0.4));
    // The label rides below the edge, and is pushed clear of the destination cards --
    // it printed itself neatly underneath the first card and read as "THE FLOO".
    const label = f > 0.86 ? 'THE FLOOD IS ON YOU' : 'THE FLOOD';
    const lw = textW(label, { font: 5 }) + 12;
    const ly = Math.min(H - 130, Math.max(edge + 3, ISLE_BASE + 26));
    wash(g, 8, ly, lw, 11, 'ink', 0.7);
    rect(g, 8, ly, 2, 11, f > 0.72 ? 'red2' : 'foam');
    text(g, label, 15, ly + 2, f > 0.72 ? 'red2' : 'foam', { font: 5 });
    // and a tick on the edge line itself, so the label and the water are joined up
    for (let y = ly; y > edge && y > ly - 40; y -= 3) px(g, 9, y, 'foam');
  }

  function drawHud(g) {
    UI.panel(g, 0, 0, W, HUD_H, { style: 'wood', shadow: true, rivets: true, corners: false });
    const leg = `CHAPTER ${v.chapter} · LEG ${v.leg} OF ${LEGS_PER_CHAPTER}`;
    text(g, leg, 14, 8, 'cream', { font: 7, shadow: 'ink' });
    text(g, `voyage ${(v.chapter - 1) * LEGS_PER_CHAPTER + v.leg} of ${CHAPTERS * LEGS_PER_CHAPTER}`,
      14, 26, 'parch1', { font: 3 });

    // the tide gauge, the one number the whole run is about
    const gx = 226, gw = 300;
    text(g, 'THE FLOOD', gx, 6, 'parch1', { font: 3 });
    UI.bar(g, gx, 15, gw, 12, v.flood, {
      fill: v.flood > 0.75 ? 'red2' : v.flood > 0.45 ? 'amber' : 'water2',
      bg: 'wood0', frame: 'wood0', ticks: CHAPTERS, stripe: v.flood > 0.75,
    });
    const legsLeft = Math.max(0, Math.ceil((1 - v.flood) / Math.max(0.001, floodPerLeg(v))));
    text(g, `${legsLeft} crossing${legsLeft === 1 ? '' : 's'} of ocean left`, gx, 30, 'parch1', { font: 3 });

    // deck, hull, purse
    const rx = 566;
    text(g, 'ON DECK', rx, 6, 'parch1', { font: 3 });
    text(g, `${v.aboard.length}/${capacity(v)}`, rx, 16, v.aboard.length >= capacity(v) ? 'amber' : 'cream',
      { font: 7, shadow: 'ink' });
    text(g, 'IN EDEN', rx, 32, 'parch1', { font: 3 });
    text(g, String(v.eden.length), rx + 52, 32, 'leaf4', { font: 5 });

    text(g, 'HULL', rx + 96, 6, 'parch1', { font: 3 });
    UI.segBar(g, rx + 96, 16, 84, 9, hullMax(v), v.hull, { fill: v.hull > 2 ? 'brass2' : 'red2' });
    text(g, `${v.hull}/${hullMax(v)}`, rx + 96, 30, 'parch1', { font: 3 });

    UI.moneyPill(g, W - 92, 10, v.money, { font: 7, h: 15 });
    text(g, `${v.lost.length} lost`, W - 16, 30, v.lost.length ? 'red2' : 'parch1', { font: 3, right: true });
  }

  /* --------------------------------------------------------------- the islands

  One island is one button. The marker above it carries the name and the danger, a
  single line under it carries the two numbers you compare, and the paragraph only
  appears for the island the cursor is on. Everything else is sea.
  */

  /**
   * Where an island's hit box is. Computed from the constants, NOT recorded during draw:
   * hit-testing that depends on having drawn a frame first means the first click of a
   * scene lands on nothing, and a mouse that has not moved since is never seen at all.
   */
  function isleRect(i) {
    if (!v.choices[i]) return null;
    const lift = Math.round((1 - Ease.outCubic(clamp(intro * 1.6 - i * 0.14, 0, 1))) * 26);
    return UI.rectOf(ISLE_X[i] - ISLE_W / 2 + 20, PIN_Y + lift,
      ISLE_W - 40, ISLE_BASE + 22 - PIN_Y);
  }

  /** The signpost over an island: a post, a plaque, a pennant, and danger skulls. */
  function drawMarker(g, i, island, hot) {
    const cx = ISLE_X[i];
    const top = ISLE_BASE - ISLE_H;
    const label = island.name.toUpperCase();
    const tw = Math.max(96, textW(label, { font: 7 }) + 26);
    const py = PIN_Y - (hot ? 3 : 0);
    // the post, down to the island's crown
    rect(g, cx - 2, py + 26, 4, top - py - 22, hot ? 'wood3' : 'wood2');
    rect(g, cx - 2, py + 26, 1, top - py - 22, 'wood4');
    // the plaque
    const x = Math.round(cx - tw / 2);
    UI.panel(g, x, py, tw, 26, { style: hot ? 'brass' : 'wood', corners: false });
    text(g, label, cx, py + 8, hot ? 'wood0' : 'cream', { font: 7, center: true, shadow: hot ? null : 'ink' });
    // danger, as skulls on the rail under the plaque
    for (let s = 0; s < 4; s++) {
      UI.icon(g, 'skull', cx - 16 + s * 9, py + 27,
        { color: s < island.danger ? 'red2' : 'wood1' });
    }
    // a pennant that snaps in the wind, so the chosen one is alive
    const fl = Math.round(Math.sin(t * 3 + i) * 2);
    tri(g, cx + tw / 2 - 2, py - 12, cx + tw / 2 - 2, py + 2, cx + tw / 2 + 16 + fl, py - 5,
      hot ? 'gold' : 'red1');
    rect(g, cx + tw / 2 - 3, py - 14, 2, 18, 'wood2');
    // and the bouncing arrow that says THIS ONE
    if (hot) {
      const bob = Math.round(Math.abs(Math.sin(t * 4)) * 5);
      UI.icon(g, 'arrow_d', cx - 4, py + 40 - bob, { color: 'gold', scale: 2 });
    }
  }

  /** The one line of numbers under an island. */
  function drawStat(g, i, island, hot) {
    const cx = ISLE_X[i];
    const y = ISLE_BASE + 6;
    const line = island.teleport ? 'THE GARDEN · SAFE GROUND'
      : `${island.animals} ASHORE · ×${island.reward}`;
    const w = textW(line, { font: 5 }) + 16;
    rect(g, cx - w / 2, y, w, 15, hot ? 'wood2' : 'wood0');
    UI.boxEdge(g, cx - w / 2, y, w, 15, hot ? 'brass2' : 'ink');
    text(g, line, cx, y + 4, hot ? 'cream' : 'parch1', { font: 5, center: true });
  }

  /**
   * The paragraph, only for the island under the cursor: what is in the way ticked
   * against the deck, the blurb, and what the crossing costs.
   */
  function drawPlaque(g, i, island, have) {
    const x = Math.round(clamp(ISLE_X[i] - PLAQUE_W / 2, 8, W - PLAQUE_W - 8));
    const y = PLAQUE_Y;
    UI.panel(g, x, y, PLAQUE_W, PLAQUE_H, { style: 'paper', shadow: true });
    const rows = readIsland(island, have);
    let oy = y + 12;
    text(g, island.biome.toUpperCase(), x + 14, oy, 'wood1', { font: 3 });
    const cost = Math.round(tideCost(island) * 100);
    text(g, `TIDE +${cost}%`, x + PLAQUE_W - 14, oy - 1, cost <= 3 ? 'water1' : 'rust',
      { font: 5, right: true });
    oy += 12;
    if (!rows.length) {
      text(g, island.teleport ? 'A gate, and nothing trying to kill you.' : 'Nothing in the way. Walk it.',
        x + 14, oy, 'leaf1', { font: 5 });
      oy += 13;
    }
    for (const row of rows.slice(0, 3)) {
      const c = row.never ? 'rust' : row.ok ? 'leaf1' : 'red1';
      UI.icon(g, row.ob.icon, x + 14, oy - 1, { color: row.ob.color });
      text(g, row.ob.name.toUpperCase(), x + 26, oy, 'wood0', { font: 3 });
      UI.icon(g, row.never ? 'minus' : row.ok ? 'check' : 'cross', x + PLAQUE_W - 26, oy - 1, { color: c });
      text(g, row.never ? 'GO ROUND' : row.ok ? 'COVERED' : 'NO ANSWER',
        x + PLAQUE_W - 30, oy, c, { font: 3, right: true });
      oy += 12;
    }
    wrap(island.blurb, PLAQUE_W - 28, { font: 3 }).slice(0, 2).forEach((l, j) => {
      text(g, l, x + 14, y + PLAQUE_H - 38 + j * 9, 'wood1', { font: 3 });
    });
    rect(g, x + 10, y + PLAQUE_H - 20, PLAQUE_W - 20, 1, 'parch0');
    text(g, island.teleport ? 'CLICK TO GO THROUGH' : 'CLICK TO SET A COURSE',
      x + PLAQUE_W / 2, y + PLAQUE_H - 16, 'wood0', { font: 5, center: true });
  }

  /**
   * THE ROUTE. A ladder of legs across the top and three lines fanning out of the boat
   * to the three markers: where you have been, where you are, and the only three places
   * you can go. That fan is the whole map, and it is drawn rather than described.
   */
  function drawLadder(g) {
    rect(g, 0, LADDER_Y, W, LADDER_H, 'wood0');
    rect(g, 0, LADDER_Y, W, 1, 'wood1');
    rect(g, 0, LADDER_Y + LADDER_H - 1, W, 1, 'ink');
    const total = CHAPTERS * LEGS_PER_CHAPTER;
    const done = (v.chapter - 1) * LEGS_PER_CHAPTER + v.leg - 1;
    const x0 = 120, x1 = W - 120;
    rect(g, x0, LADDER_Y + 11, x1 - x0, 3, 'ink');
    rect(g, x0, LADDER_Y + 11, x1 - x0, 1, 'wood1');
    for (let i = 0; i < total; i++) {
      const nx = Math.round(x0 + ((x1 - x0) * i) / (total - 1));
      const past = i < done, now = i === done;
      const boss = (i + 1) % LEGS_PER_CHAPTER === 0;
      if (past) rect(g, x0, LADDER_Y + 11, nx - x0, 3, 'brass1');
      const r = boss ? 6 : 4;
      rect(g, nx - r, LADDER_Y + 12 - r, r * 2, r * 2, now ? 'gold' : past ? 'brass2' : 'wood2');
      UI.boxEdge(g, nx - r, LADDER_Y + 12 - r, r * 2, r * 2, 'ink');
      if (boss) rect(g, nx - 2, LADDER_Y + 10, 4, 4, now ? 'white' : 'red1');
      if (now) {
        const bob = Math.round(Math.abs(Math.sin(t * 3)) * 2);
        UI.icon(g, 'boat', nx - 4, LADDER_Y - 8 - bob, { color: 'cream' });
      }
    }
    text(g, `CHAPTER ${v.chapter}`, 14, LADDER_Y + 7, 'parch1', { font: 3 });
    text(g, `LEG ${v.leg} OF ${LEGS_PER_CHAPTER}`, W - 14, LADDER_Y + 7, 'parch1',
      { font: 3, right: true });
  }

  /** The three courses out of the bow, dashed, the hovered one bright. */
  function drawCourses(g) {
    const bx = boatX + 40, by = boatY - 30;
    for (let i = 0; i < 3; i++) {
      if (!v.choices[i]) continue;
      const hot = hover === i || (state === 'sail' && picked === i);
      const tx = ISLE_X[i], ty = ISLE_BASE + 24;
      const n = 26;
      for (let j = 2; j < n; j++) {
        const f = j / n;
        const cx2 = lerp(bx, tx, f);
        const cy2 = lerp(by, ty, f) - Math.sin(f * Math.PI) * 26;
        if ((j + Math.floor(t * (hot ? 8 : 3))) % 3 === 0) continue;
        const sz = hot ? 5 : 3;
        rect(g, cx2 - 1, cy2 - 1, sz + 2, sz + 2, 'ink');
        rect(g, cx2, cy2, sz, sz, hot ? 'gold' : 'water3');
      }
    }
  }

  /**
   * THE BENCH. Where Noah's work on your beasts is paid for.
   *
   * It shares the deck panel rather than getting its own, and flips with one click. Two
   * panels side by side would each be half the size, and both of them are lists you read
   * rather than pictures you glance at -- so they take turns.
   *
   * One upgrade per beast, and only for beasts you have TAMED, which is the whole point:
   * the tower side of the run is built out of what walked at you and lost.
   */
  function drawWorkshop(g) {
    UI.panel(g, DECK_X, DECK_Y, DECK_W, DECK_H, { style: 'wood', shadow: true, rivets: true });
    UI.panelTitle(g, DECK_X, DECK_Y + 4, DECK_W, 'THE BENCH', { color: 'clay4' });
    craftRects = [];

    const box = beastBox(v);
    if (!box.length) {
      text(g, 'Nothing tamed yet. Knock one down on an island and throw an apple.',
        DECK_X + 12, DECK_Y + 28, 'parch1', { font: 3 });
      return;
    }
    const cw = Math.floor((DECK_W - 24) / Math.max(1, Math.min(4, box.length)));
    box.slice(0, 4).forEach((row, i) => {
      const def = BEAST_BY_ID[row.id];
      if (!def) return;
      const r0 = UI.rectOf(DECK_X + 12 + i * cw, DECK_Y + 24, cw - 6, DECK_H - 34);
      const able = row.up && !row.bought && v.money >= row.up.cost;
      const hot = UI.hover(r0, Input.mouse);
      rect(g, r0.x, r0.y, r0.w, r0.h, row.bought ? 'wood0' : able ? (hot ? 'wood2' : 'wood1') : 'wood0');
      UI.boxEdge(g, r0.x, r0.y, r0.w, r0.h, row.bought ? 'clay4' : able && hot ? 'brass3' : 'wood0');
      rect(g, r0.x + 3, r0.y + 3, 30, 30, 'parch0');
      const a = ANIMAL_BY_ID[def.base];
      if (a) drawAnimalIcon(g, a, r0.x + 18, r0.y + 18, { size: 28 });
      text(g, def.name.toUpperCase(), r0.x + 38, r0.y + 4, 'cream', { font: 3 });
      if (!row.up) { text(g, 'NOTHING TO DO', r0.x + 38, r0.y + 18, 'grey1', { font: 3 }); return; }
      text(g, row.up.name.toUpperCase(), r0.x + 38, r0.y + 17, row.bought ? 'clay4' : 'brass3', { font: 3 });
      text(g, row.bought ? 'DONE' : `$${row.up.cost}`, r0.x + 38, r0.y + 30,
        row.bought ? 'leaf4' : able ? 'gold' : 'red2', { font: 5 });
      text(g, row.up.blurb, r0.x + 5, r0.y + 46, 'parch1', { font: 3 });
      if (!row.bought) craftRects.push({ rect: r0, id: row.id, able });
    });
  }

  /** The manifest: who is on the boat, and what each of them is for. */
  function drawDeck(g) {
    UI.panel(g, DECK_X, DECK_Y, DECK_W, DECK_H, { style: 'wood', shadow: true, rivets: true });
    UI.panelTitle(g, DECK_X, DECK_Y + 4, DECK_W, 'ON DECK', { color: 'cream' });
    const have = aboardAbilities();

    if (!v.aboard.length) {
      text(g, 'Empty. Everything you own is either in the garden or in the water.',
        DECK_X + 12, DECK_Y + 24, 'parch1', { font: 3 });
    }

    // The animals themselves, not icons: at 32 pixels a ball animal has a face, and a
    // face is how you tell a cow from a chicken across a dark room. The plate behind it
    // is the ABILITY colour, which is what turns the manifest into a set of tools.
    const cell = 38;
    const maxShow = Math.min(v.aboard.length, Math.floor((DECK_W - 30) / cell));
    v.aboard.slice(0, maxShow).forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (!a) return;
      const ax = DECK_X + 22 + i * cell;
      const ay = DECK_Y + 48;
      const ab = abilityOf(a);
      const plate = mix(col(ab.color), P.wood0, 0.55);
      rect(g, ax - 17, ay - 18, 34, 36, plate);
      rect(g, ax - 17, ay - 18, 34, 1, mix(col(ab.color), P.white, 0.35));
      rect(g, ax - 17, ay + 17, 34, 1, 'wood0');
      // a bob, so the deck is a pen full of animals rather than a row of stamps
      const bob = Math.round(Math.sin(t * 1.7 + i * 0.9) * 1);
      drawAnimal(g, a, ax, ay + 13 + bob, { scale: 0.5 });
      UI.icon(g, ab.icon, ax - 4, ay + 9, { color: ab.color });
      if (isLoyal(v, id)) UI.icon(g, 'heart', ax + 8, ay - 17, { color: 'gold' });
    });
    if (v.aboard.length > maxShow) {
      text(g, `+${v.aboard.length - maxShow}`, DECK_X + DECK_W - 26, DECK_Y + 44, 'cream',
        { font: 7, right: true });
    }

    // the abilities, tallied -- the line you actually read the cards against
    const tally = Object.keys(have).sort((a, b) => have[b] - have[a]);
    let tx = DECK_X + 12;
    const ty = DECK_Y + DECK_H - 16;
    text(g, 'CAN DO', tx, ty + 2, 'parch1', { font: 3 });
    tx += 34;
    for (const id of tally) {
      const A = ABILITY_BY_ID[id];
      if (!A) continue;
      const label = `${A.verb} ${have[id]}`;
      const w = textW(label, { font: 3 }) + 14;
      if (tx + w > DECK_X + DECK_W - 12) break;
      rect(g, tx, ty - 2, w, 12, mix(col(A.color), P.wood0, 0.55));
      rect(g, tx, ty - 2, w, 1, mix(col(A.color), P.white, 0.3));
      UI.icon(g, A.icon, tx + 2, ty, { color: A.color });
      text(g, label, tx + 12, ty + 2, 'cream', { font: 3 });
      tx += w + 3;
    }
  }

  function draw(g) {
    const bg = backdrop();
    if (bg) g.drawImage(bg, 0, 0);
    else rect(g, 0, 0, W, H, 'water1');
    drawSky(g);

    // THE THREE ISLANDS, standing on the sea, big enough to be the thing you look at
    const have = aboardAbilities();
    isles = [];
    v.choices.forEach((island, i) => {
      if (!island) return;
      const hot = (hover === i && state === 'choose') || (state === 'sail' && picked === i);
      const dim = state === 'sail' && picked !== i ? 0.35 : 1;
      const lift = Math.round((1 - Ease.outCubic(clamp(intro * 1.6 - i * 0.14, 0, 1))) * 26)
        - (hot ? 2 : 0);
      const prev = g.globalAlpha;
      if (dim < 1) g.globalAlpha = dim;
      drawIslandFar(g, island, ISLE_X[i], ISLE_BASE + lift, ISLE_W, ISLE_H, t, { weatherAmt: dim });
      g.globalAlpha = prev;
      // a reflection, cheap: fading bars under the island
      for (let k = 0; k < 4; k++) {
        wash(g, ISLE_X[i] - ISLE_W / 2 + k * 8, ISLE_BASE + lift + 1 + k * 3, ISLE_W - k * 16, 3,
          'foam', 0.1 - k * 0.02);
      }
      // a dozen LIVE plants over the baked ones, so the island moves in the wind
      for (let j = 0; j < 12; j++) {
        const fx = ISLE_X[i] - ISLE_W / 2 + 30 + hash(i * 31 + j * 7) * (ISLE_W - 60);
        const fy = ISLE_BASE + lift - hash(i * 17 + j * 5) * ISLE_H * 0.3;
        drawPlant(g, fx, fy, hash(i + j) > 0.6 ? 'tuft' : 'grass',
          { biome: FLORA_BIOME[island.biome] || 'grassland', v: j % 4, t });
      }
      isles[i] = isleRect(i);
    });

    drawSea(g);
    drawRose(g, 700, 372, 74);
    drawTide(g);
    parts.draw(g, 'back');
    drawCourses(g);

    // the markers and the one line of numbers under each island
    v.choices.forEach((island, i) => {
      if (!island) return;
      const hot = (hover === i && state === 'choose') || (state === 'sail' && picked === i);
      drawMarker(g, i, island, hot);
      drawStat(g, i, island, hot);
    });

    // THE ARK, and the golem standing on its deck. The golem is drawn at 1x against a
    // boat drawn at 3x on purpose: he used to be as tall as the hull was long, which is
    // most of why the boat did not read as a boat.
    drawBoat(g, boatX, boatY, t, {
      tiers: v.tiers,
      damage: hullMax(v) - v.hull,
      scale: BOAT_SCALE,
      speed: state === 'sail' ? 1 : 0.25,
    });
    const deckY = boatY - 8 * BOAT_SCALE + Math.round(Math.sin(t * 1.15) * 1.6) * BOAT_SCALE;
    drawFolk(g, 'golem', boatX + 26 * BOAT_SCALE, deckY, t, {
      scale: 1,
      pose: state === 'sail' ? 'react' : 'idle',
      mud: 0.5,
      sparkle: 0.25,
    });

    if (shop) drawWorkshop(g); else drawDeck(g);
    // the tab that flips between them, top-right of whichever panel is up
    shopTab = UI.rectOf(DECK_X + DECK_W - 108, DECK_Y + 2, 100, 18);
    const tabHot = UI.hover(shopTab, Input.mouse);
    rect(g, shopTab.x, shopTab.y, shopTab.w, shopTab.h, tabHot ? 'wood2' : 'wood0');
    UI.boxEdge(g, shopTab.x, shopTab.y, shopTab.w, shopTab.h, tabHot ? 'brass3' : 'wood1');
    text(g, shop ? 'ON DECK  [W]' : 'THE BENCH  [W]', shopTab.x + shopTab.w / 2, shopTab.y + 4,
      tabHot ? 'gold' : 'parch1', { font: 3, center: true });

    // the paragraph, for the one island the cursor is on and no others
    if (hover >= 0 && v.choices[hover] && state === 'choose') drawPlaque(g, hover, v.choices[hover], have);

    drawHud(g);
    drawLadder(g);
    parts.draw(g, 'front');

    if (state === 'sail') {
      const k = Ease.inCubic(clamp(sailT * 1.35 - 0.35, 0, 1));
      wash(g, 0, 0, W, H, 'foam', k * 0.9);
    }
    if (intro < 1) wash(g, 0, 0, W, H, 'ink', (1 - Ease.outCubic(clamp(intro, 0, 1))) * 0.85);
  }

  /* -------------------------------------------------------------------- update */

  function update(dt) {
    t += dt;
    intro = approach(intro, 1, 2.4, dt);
    parts.update(dt);

    if (state === 'choose') {
      const m = Input.mouse;
      const was = hover;
      hover = -1;
      for (let i = 0; i < 3; i++) {
        const r = isleRect(i);
        if (r && UI.hover(r, m)) { hover = i; break; }
      }
      if (hover >= 0 && hover !== was) Audio.sfx('hover');
      // the workshop tab, and crafting inside it. Checked BEFORE the island cards, or a
      // click that lands on the panel would also set a course.
      if (Input.pressed('KeyW')) { shop = !shop; Audio.sfx('click'); }
      if (m.pressed && shopTab && UI.hover(shopTab, m)) { shop = !shop; Audio.sfx('click'); return; }
      if (m.pressed && shop) {
        for (const cr of craftRects) {
          if (!UI.hover(cr.rect, m)) continue;
          const res = buyBeastUpgrade(v, cr.id);
          Audio.sfx(res.ok ? 'upgrade' : 'error');
          return;
        }
      }
      if (m.pressed && hover >= 0) choose(hover);
      for (let i = 0; i < 3; i++) if (Input.pressed('Digit' + (i + 1))) choose(i);
      // Enter commits the card the cursor is ON, and nothing else does. It used to sail
      // to the first destination on any Space or Enter, which meant a stray keypress --
      // one left over from skipping a cutscene, say -- chose your route for you.
      if (Input.pressed('Enter') && hover >= 0) choose(hover);
      // the boat idles along, because a boat parked in the middle of the ocean is dead
      boatX = BOAT_X + Math.sin(t * 0.35) * 10;
      boatY = BOAT_WL;
      return;
    }

    // --- sailing
    sailT += dt * 0.72;
    const k = Ease.inOutCubic(clamp(sailT, 0, 1));
    boatX = lerp(BOAT_X, ISLE_X[picked], k);
    boatY = lerp(BOAT_WL, ISLE_BASE + 10, k);
    if (sailT > 0.2 && sailT < 0.9 && Math.floor(sailT * 24) % 4 === 0) {
      parts.emit('splash', boatX - 20, boatY + 4, { count: 1, speed: 40, color: 'foam', life: 0.4 });
    }
    if (sailT >= 1) { state = 'done'; finishSail(); }
  }

  return {
    enter(args, api) {
      void api;
      v = args.voyage || args.run;
      onArrive = args.onArrive; onOver = args.onOver;
      t = 0; intro = 0; hover = -1; isles = [];
      state = 'choose'; sailT = 0; picked = -1;
      boatX = BOAT_X; boatY = BOAT_WL;
      parts = createParticles({ limit: 160, seed: v.seed + '/ocean' });
      Audio.music('harbour');
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,
    debug() {
      return {
        voyage: v, cards: isles, isles, choose, state,
        rects: { cards: isles, isles, craft: craftRects, tab: shopTab },
        get shop() { return shop; },
        workshop: (on) => { shop = on === undefined ? !shop : !!on; },
        at: { horizon: HORIZON, isles: ISLE_X.slice(), base: ISLE_BASE },
      };
    },
  };
}

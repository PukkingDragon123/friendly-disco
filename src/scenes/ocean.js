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
  makeCanvas, rect, px, dashLine, disc, ellipse, text, textW, wrap, wash,
  dither, vgrad, clamp, lerp, W, H,
} from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import * as UI from '../render/uikit.js';
import { drawBoat } from '../render/boat.js';
import { drawIslandFar } from '../render/islandart.js';
import { drawAnimal } from '../render/sprites.js';
import { drawFolk } from '../render/folk.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { DOLL_BY_ID, costText, canCraft } from '../data/dolls.js';
import { MATERIAL_IDS, MATERIAL_BY_ID } from '../data/materials.js';
import { drawDoll } from '../render/dollart.js';
import { abilityOf, ABILITY_BY_ID } from '../data/abilities.js';
import { OBSTACLE_BY_ID } from '../data/obstacles.js';
import {
  sailTo, capacity, hullMax, floodPerLeg, isLoyal,
  LEGS_PER_CHAPTER, CHAPTERS, dollBox, craftDoll, say,
} from '../game/voyage.js';

const HUD_H = 46;
const HORIZON = 206;              // where sky meets sea
const ISLE_X = [186, 480, 774];
const ISLE_W = 208, ISLE_H = 104;
const CARD_W = 254, CARD_H = 150, CARD_Y = 226;
const DECK_X = 322, DECK_Y = 426, DECK_W = W - DECK_X - 14, DECK_H = 102;
const BOAT_X = 166, BOAT_WL = 512;
const BOAT_SCALE = 3;
const FLOTSAM_Y = 388;            // the open-water lane between the cards and the deck
const SUN_X = 712;                // where the afternoon sun sits, for the glitter path

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
  let cards = [];
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
    const ly = Math.min(H - 120, Math.max(edge + 3, CARD_Y + CARD_H + 6));
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

  /** One destination card. Returns its rect. */
  function drawCard(g, i, island, have) {
    const cx = ISLE_X[i];
    const x = Math.round(cx - CARD_W / 2);
    const lift = Math.round((1 - Ease.outCubic(clamp(intro * 1.6 - i * 0.14, 0, 1))) * 30);
    const y = CARD_Y + lift;
    const hot = hover === i && state === 'choose';
    const r = UI.rectOf(x, y, CARD_W, CARD_H);

    UI.panel(g, x, y, CARD_W, CARD_H, { style: 'paper', shadow: true, corners: true });
    if (hot) UI.panel(g, x - 2, y - 2, CARD_W + 4, CARD_H + 4, { style: 'brass', corners: true });
    if (hot) UI.panel(g, x, y, CARD_W, CARD_H, { style: 'paper', corners: true });
    UI.panelTitle(g, x, y + 4, CARD_W, island.name.toUpperCase(), { color: 'cream' });

    // biome, danger, spoils — the three numbers you compare across the three cards
    const rowY = y + 20;
    text(g, island.biome.toUpperCase(), x + 8, rowY, 'wood1', { font: 3 });
    for (let s = 0; s < 4; s++) {
      UI.icon(g, 'skull', x + CARD_W - 40 + s * 8, rowY - 2,
        { color: s < island.danger ? 'red1' : mix(P.parch0, P.parch, 0.5) });
    }
    const spoil = island.teleport ? 'THE GARDEN'
      : `${island.animals} ASHORE · ×${island.reward} SPOILS`;
    text(g, spoil, x + 8, rowY + 10, 'wood0', { font: 5 });

    UI.divider(g, x + 6, y + 42, CARD_W - 12, { color: 'parch0', light: 'cream' });

    // what is in the way, ticked against the deck
    const rows = readIsland(island, have);
    let oy = y + 48;
    if (!rows.length) {
      const line = island.teleport ? 'A gate, and nothing trying to kill you.'
        : 'Nothing in the way. Walk it.';
      text(g, line, x + 8, oy + 2, 'leaf1', { font: 3 });
      oy += 14;
    }
    for (const row of rows.slice(0, 3)) {
      const c = row.never ? 'amber' : row.ok ? 'leaf1' : 'red1';
      UI.icon(g, row.ob.icon, x + 8, oy, { color: row.ob.color });
      text(g, row.ob.name.toUpperCase(), x + 20, oy + 1, 'wood0', { font: 3 });
      UI.icon(g, row.never ? 'minus' : row.ok ? 'check' : 'cross', x + CARD_W - 20, oy, { color: c });
      const tag = row.never ? 'GO ROUND' : row.ok ? 'COVERED' : 'NO ANSWER';
      text(g, tag, x + CARD_W - 24, oy + 1, c, { font: 3, right: true });
      oy += 11;
    }

    // the blurb, which is the only place the island gets to have a voice
    wrap(island.blurb, CARD_W - 16, { font: 3 }).slice(0, 2).forEach((l, j) => {
      text(g, l, x + 8, y + 96 + j * 8, 'wood1', { font: 3 });
    });

    // the cost of getting there, and the button
    const cost = Math.round(tideCost(island) * 100);
    text(g, `TIDE +${cost}%`, x + 8, y + CARD_H - 34, cost <= 3 ? 'water2' : 'rust', { font: 5 });
    if (island.teleport) text(g, 'the short hop', x + CARD_W - 8, y + CARD_H - 33, 'water2', { font: 3, right: true });
    UI.button(g, UI.rectOf(x + 6, y + CARD_H - 24, CARD_W - 12, 19),
      state === 'sail' && picked === i ? 'UNDER WAY' : island.teleport ? 'THROUGH THE GATE' : 'SET A COURSE', {
        state: state === 'sail' ? (picked === i ? 'down' : 'disabled') : hot ? 'hover' : 'idle',
        color: island.teleport ? 'purple0' : 'wood2',
        icon: island.teleport ? 'star' : 'boat',
        font: 5,
      });
    return r;
  }

/**
   * THE WORKSHOP. Where the animals you saved become the dolls you herd with.
   *
   * It shares the deck panel rather than getting its own, and flips with one click. Two
   * panels side by side would each be half the size, and both of them are lists you read
   * rather than pictures you glance at -- so they take turns.
   */
  function drawWorkshop(g) {
    UI.panel(g, DECK_X, DECK_Y, DECK_W, DECK_H, { style: 'wood', shadow: true, rivets: true });
    UI.panelTitle(g, DECK_X, DECK_Y + 4, DECK_W, 'THE WORKSHOP', { color: 'clay4' });
    craftRects = [];

    // what the crossings have produced
    let mx = DECK_X + 12;
    const my = DECK_Y + 24;
    for (const k of MATERIAL_IDS) {
      const n = v.mats[k] || 0;
      if (!n) continue;
      const M2 = MATERIAL_BY_ID[k];
      const label = `${n}`;
      const w = textW(label, { font: 5 }) + 22;
      if (mx + w > DECK_X + DECK_W - 12) break;
      UI.icon(g, M2.icon, mx, my + 1, { color: M2.color });
      text(g, label, mx + 13, my, 'cream', { font: 5 });
      mx += w;
    }
    if (mx === DECK_X + 12) text(g, 'Nothing yet. A crossing with animals aboard pays.', mx, my, 'parch1', { font: 3 });

    // and what can be made from it
    const box = dollBox(v);
    const cw = Math.floor((DECK_W - 24) / Math.max(1, Math.min(4, box.length)));
    box.slice(0, 4).forEach((row, i) => {
      const r0 = UI.rectOf(DECK_X + 12 + i * cw, DECK_Y + 44, cw - 6, 46);
      const able = canCraft(row.def, v.mats);
      const hot = UI.hover(r0, Input.mouse);
      rect(g, r0.x, r0.y, r0.w, r0.h, able ? (hot ? 'wood2' : 'wood1') : 'wood0');
      UI.boxEdge(g, r0.x, r0.y, r0.w, r0.h, able ? (hot ? row.def.mark : 'wood0') : 'shadow');
      rect(g, r0.x + 3, r0.y + 3, 22, r0.h - 6, able ? 'parch0' : 'shadow');
      drawDoll(g, row.def, r0.x + 14, r0.y + r0.h - 4, t, { lit: able && hot, tile: 32 });
      text(g, row.def.name.replace(' Doll', '').toUpperCase(), r0.x + 30, r0.y + 5,
        able ? 'cream' : 'grey1', { font: 3 });
      text(g, `HAVE ${row.have}`, r0.x + 30, r0.y + 17, 'brass3', { font: 3 });
      text(g, costText(row.def), r0.x + 30, r0.y + 29, able ? 'leaf3' : 'red2', { font: 3 });
      craftRects.push({ rect: r0, id: row.id, able });
    });
    if (!box.length) {
      text(g, 'You know no shapes yet. Noah knows all of them.', DECK_X + 12, DECK_Y + 52,
        'parch1', { font: 3 });
    }
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

    // the three islands, standing on the horizon
    const have = aboardAbilities();
    v.choices.forEach((island, i) => {
      if (!island) return;
      const dim = state === 'sail' && picked !== i ? 0.35 : 1;
      const prev = g.globalAlpha;
      if (dim < 1) g.globalAlpha = dim;
      drawIslandFar(g, island, ISLE_X[i], HORIZON + 8, ISLE_W, ISLE_H, t, {
        weatherAmt: dim,
      });
      g.globalAlpha = prev;
      // a reflection, cheap: three fading bars under the island
      for (let k = 0; k < 3; k++) {
        wash(g, ISLE_X[i] - ISLE_W / 2 + k * 6, HORIZON + 9 + k * 3, ISLE_W - k * 12, 2,
          'foam', 0.1 - k * 0.02);
      }
    });

    drawSea(g);
    drawTide(g);
    parts.draw(g, 'back');

    // the boat, and the golem standing at the tiller. He is the player, so he is on
    // screen wherever the player is -- and the mud coming off him is the cheapest
    // reminder of what he is made of.
    drawBoat(g, boatX, boatY, t, {
      tiers: v.tiers,
      damage: hullMax(v) - v.hull,
      scale: BOAT_SCALE,
      speed: state === 'sail' ? 1 : 0.25,
    });
    const deckY = boatY - 8 * BOAT_SCALE + Math.round(Math.sin(t * 1.15) * 1.6) * BOAT_SCALE;
    drawFolk(g, 'golem', boatX + 56, deckY, t, {
      scale: 2,
      pose: state === 'sail' ? 'react' : 'idle',
      mud: 0.5,
      sparkle: 0.25,
    });

    cards = [];
    v.choices.forEach((island, i) => {
      if (!island) return;
      cards[i] = drawCard(g, i, island, have);
    });
    if (shop) drawWorkshop(g); else drawDeck(g);
    // the tab that flips between them, top-right of whichever panel is up
    shopTab = UI.rectOf(DECK_X + DECK_W - 108, DECK_Y + 2, 100, 18);
    const tabHot = UI.hover(shopTab, Input.mouse);
    rect(g, shopTab.x, shopTab.y, shopTab.w, shopTab.h, tabHot ? 'wood2' : 'wood0');
    UI.boxEdge(g, shopTab.x, shopTab.y, shopTab.w, shopTab.h, tabHot ? 'brass3' : 'wood1');
    text(g, shop ? 'ON DECK  [W]' : 'WORKSHOP  [W]', shopTab.x + shopTab.w / 2, shopTab.y + 4,
      tabHot ? 'gold' : 'parch1', { font: 3, center: true });
    drawHud(g);
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
      for (let i = 0; i < cards.length; i++) {
        if (cards[i] && UI.hover(cards[i], m)) { hover = i; break; }
      }
      if (hover >= 0 && hover !== was) Audio.sfx('hover');
      // the workshop tab, and crafting inside it. Checked BEFORE the island cards, or a
      // click that lands on the panel would also set a course.
      if (Input.pressed('KeyW')) { shop = !shop; Audio.sfx('click'); }
      if (m.pressed && shopTab && UI.hover(shopTab, m)) { shop = !shop; Audio.sfx('click'); return; }
      if (m.pressed && shop) {
        for (const cr of craftRects) {
          if (!UI.hover(cr.rect, m)) continue;
          const res = craftDoll(v, cr.id);
          Audio.sfx(res.ok ? 'crate_open' : 'error');
          if (res.ok) say(v, `${res.doll.name} made.`, res.doll.mark);
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
    boatY = lerp(BOAT_WL, HORIZON + 46, k);
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
      t = 0; intro = 0; hover = -1; cards = [];
      state = 'choose'; sailT = 0; picked = -1;
      boatX = BOAT_X; boatY = BOAT_WL;
      parts = createParticles({ limit: 160, seed: v.seed + '/ocean' });
      Audio.music('harbour');
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,
    debug() {
      return {
        voyage: v, cards, choose, state,
        rects: { cards, craft: craftRects, tab: shopTab },
        get shop() { return shop; },
        workshop: (on) => { shop = on === undefined ? !shop : !!on; },
        at: { horizon: HORIZON, isles: ISLE_X.slice() },
      };
    },
  };
}

// THE CHART SCENE. The map, drawn on the water.
//
// Eleven rows of stops going away from you, edges between them, and you may only move UP and
// to a column next to your own. What the drawing has to do is make the ROUTE legible, not the
// stops -- because the decision is never "which of these three", it is "which of these three
// given what is four rows above it", and that is a decision about lines.
//
// So the lines are the loudest thing on the screen after the stops themselves: bright and solid
// where you can go, dim and dotted where you cannot, and the ones behind you drawn as a wake
// you can trace back. The stop under the cursor lights its whole subtree faintly, which is the
// one affordance that turns a lattice from a puzzle into a plan.
//
// AND THE SEA IS STILL THERE. It would be easier to draw this on a dark panel with a grid, and
// it would also be a different game: the map is the middle of the ocean at dusk with your boat
// on it, so the stops are islands and lights on the water rather than nodes in a graph.

import {
  W, H, rect, text, textW, wrap, wash, disc, ellipse, ellipseFrame, tri, line, dashLine,
  clamp, lerp, makeCanvas,
} from '../core/pixel.js';
import { P, mix } from '../core/palette.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Juice, Ease } from '../core/juice.js';
import * as UI from '../render/uikit.js';
import { drawBoatFar } from '../render/boat.js';
import { drawSea, drawSky, drawWake } from '../render/ocean.js';
import { drawAnimalIcon } from '../render/sprites.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { ISLANDS } from '../data/islands.js';
import {
  KINDS, reachable, canGo, travelTo, currentNode, nodeById, totalRows,
} from '../game/chart.js';
import {
  berthsFree, capacity, hullMax, CHAPTERS, LEGS_PER_CHAPTER,
} from '../game/voyage.js';

const TOP = 58;                    // under the bar
const BOT = H - 96;                // above the ledger
const LEFT = 234;                  // clear of the ledger panel
const RIGHT = W - 262;             // and of the stop card

export function makeChartScene() {
  let v = null, chart = null, onPick = null;
  let t = 0, intro = 0, outT = -1;
  let bake = null;
  let hover = null;
  let sailing = null, sailT = 0;
  let nodeRects = [];
  let restNote = 0;

  /* ------------------------------------------------------------------ layout */

  /**
   * Where a stop sits.
   *
   * THE SPAN NARROWS WITH THE ROW'S WIDTH, and that is the whole layout. Spreading every row
   * across the full width meant a two-wide row put its stops at the far left and far right,
   * so the edges up to a four-wide row above it were enormous diagonals crossing half the
   * frame -- and the "only to an adjacent column" rule, which is the rule the player has to
   * hold in their head, was invisible. A narrow row is a narrow row: it sits in the middle,
   * its edges are short, and adjacency looks like adjacency.
   */
  function posOf(n) {
    const rows = totalRows();
    const y = BOT - (n.row / (rows - 1)) * (BOT - TOP);
    const full = RIGHT - LEFT;
    const span = full * (0.3 + 0.7 * ((n.of - 1) / 3));
    const x0 = LEFT + (full - span) / 2;
    const x = n.of === 1 ? LEFT + full / 2 : x0 + (n.col / (n.of - 1)) * span;
    return { x: Math.round(x), y: Math.round(y) };
  }

  /* ------------------------------------------------------------------- the sea */

  function bakeSea() {
    const cv = makeCanvas(W, H);
    if (!cv) return null;
    const g = cv.g;
    // dusk, because a map is a thing you read in the evening after a fight -- and it is the
    // SHARED sky and the SHARED sea now. This scene used to draw its own: a gradient with
    // twelve one-pixel dashes on it, which is the fault the ocean renderer exists to fix.
    drawSky(g, 0, 138, 'dusk', 0, { sun: { x: Math.round(W * 0.78), y: 118 }, cx: 300 });
    drawSea(g, { top: 138, bottom: H, layer: 'base', calm: 0.5, tint: 'gold' });
    return cv.canvas;
  }

  /* --------------------------------------------------------------------- nodes */

  /**
   * A STOP IS AN ISLAND, and it is the cutest thing on the screen for a reason.
   *
   * These were flat discs with a five-pixel emblem stamped in the middle: at a glance the map
   * was fourteen dark buttons, and the player has to be able to tell a shop from an elite
   * across the width of the frame. So each stop is a little island -- sand, grass, a shadow on
   * the water, a ring of surf -- with the KIND on a rounded signpost plate above it at
   * eighteen pixels, which is twice the size the emblem used to be.
   */
  const KIND_ICON = {
    fight: 'paw', elite: 'skull', shop: 'coin', event: 'compass', rest: 'flame', boss: 'eye',
  };

  function drawIslandBody(g, x, y, r, kind, tone, dim) {
    // THE ISLAND IS THE BIG SHAPE and the signpost is the small one. The first cut had it the
    // other way round -- a thirty-pixel plate on a fourteen-pixel base -- and every stop read
    // as a lollipop stuck in the sea.
    const acc = P[tone] || P.leaf2;
    const grass = dim ? mix(mix(P.leaf1, acc, 0.3), P.ink, 0.42) : mix(P.leaf2, acc, 0.35);
    const sand = dim ? mix(P.sand, P.ink, 0.5) : P.sand;
    const sw = r * 1.55, sh = r * 0.58;
    // the shadow it casts on the water, and a ring of surf round the beach
    ellipse(g, x, y + sh * 0.75, sw * 1.1, sh * 0.6, mix(P.water0, P.ink, 0.35));
    ellipseFrame(g, x, y + sh * 0.5, sw * 1.14, sh * 0.78,
      dim ? mix(P.foam, P.water0, 0.55) : mix(P.foam, P.water3, 0.2));
    ellipseFrame(g, x, y + sh * 0.5, sw * 1.2, sh * 0.86,
      dim ? mix(P.foam, P.water0, 0.75) : mix(P.foam, P.water3, 0.45));
    // sand, then grass on top of it, so there is a beach
    ellipse(g, x, y + sh * 0.32, sw, sh, 'ink');
    ellipse(g, x, y + sh * 0.28, sw - 2, sh - 2, sand);
    ellipse(g, x, y + sh * 0.12, sw * 0.82, sh * 0.7, mix(sand, P.white, 0.22));
    ellipse(g, x, y, sw * 0.82, sh * 0.86, 'ink');
    ellipse(g, x, y - 1, sw * 0.78, sh * 0.8, grass);
    ellipse(g, x - sw * 0.2, y - sh * 0.3, sw * 0.4, sh * 0.34, mix(grass, P.white, 0.18));
    // what grows on it: palms out at the ends, clear of the signpost, and the boss gets rock
    if (kind === 'boss') {
      for (let i = 0; i < 3; i++) {
        const px2 = x - r * 0.9 + i * r * 0.9;
        tri(g, px2 - 7, y - 2, px2 + 7, y - 2, px2, y - 18 - i * 5, 'ink');
        tri(g, px2 - 5, y - 3, px2 + 5, y - 3, px2, y - 16 - i * 5,
          dim ? mix(P.purple0, P.ink, 0.35) : 'purple0');
      }
    } else {
      for (const sx2 of [-1, 1]) {
        const tx = x + sw * 0.66 * sx2, ty = y - 2;
        const th = r * 0.9;
        rect(g, tx - 2, ty - th, 3, th, 'ink');
        rect(g, tx - 1, ty - th, 2, th, dim ? mix(P.wood1, P.ink, 0.45) : 'wood2');
        for (let k2 = 0; k2 < 3; k2++) {
          const a2 = -0.5 + k2 * 0.5;
          const fx = tx + Math.cos(a2) * r * 0.5 * sx2;
          const fy = ty - th - 2 + Math.sin(a2) * r * 0.2;
          ellipse(g, fx, fy, r * 0.34, r * 0.14, 'ink');
          ellipse(g, fx, fy - 1, r * 0.3, r * 0.11,
            dim ? mix(P.leaf1, P.ink, 0.45) : k2 === 1 ? 'leaf3' : 'leaf2');
        }
      }
    }
  }

  function drawNode(g, n, state) {
    const p = posOf(n);
    const K = KINDS[n.kind] || KINDS.fight;
    const big = n.kind === 'boss';
    const r = big ? 24 : 17;
    const done = state === 'done';
    const on = state === 'open' || state === 'hover';
    const dim = !on;
    drawIslandBody(g, p.x, p.y + (big ? 4 : 2), r, n.kind, K.color, dim);

    // THE SIGNPOST: a rounded plate with the kind on it, big enough to read across the map
    const ps = big ? 30 : 24;
    const py = p.y - (big ? 16 : 12) - ps;
    const plate = done ? mix(P.stone0, P.ink, 0.3)
      : on ? P[K.color] || P.leaf2 : mix(P[K.color] || P.leaf2, P.deep, 0.55);
    UI.roundRect(g, p.x - ps / 2 - 2, py - 2, ps + 4, ps + 4, 6, 'ink');
    UI.roundRect(g, p.x - ps / 2, py, ps, ps, 5, plate);
    rect(g, p.x - ps / 2 + 4, py + 1, ps - 8, 2, mix(plate, P.white, 0.35));
    // the little peg it stands on
    rect(g, p.x - 3, py + ps, 5, (big ? 18 : 14), 'ink');
    rect(g, p.x - 2, py + ps, 3, (big ? 18 : 14), done ? 'grey0' : 'wood2');
    const sc = big ? 3 : 2;
    const name = KIND_ICON[n.kind] || 'paw';
    UI.icon(g, name, p.x - (9 * sc) / 2, py + Math.round((ps - 9 * sc) / 2), {
      color: done ? 'grey1' : on ? 'ink' : mix(P.ink, P[K.color] || P.leaf2, 0.4),
      scale: sc,
    });

    if (done) {
      // a stop you have used cannot be mistaken for one you cannot reach: it gets a tick
      UI.icon(g, 'check', p.x + ps / 2 - 8, py + ps - 10, { color: 'leaf3', scale: 1 });
      wash(g, p.x - r * 1.4, p.y - r * 1.6, r * 2.8, r * 2.6, 'ink', 0.28);
      return;
    }
    if (on) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + n.row);
      ellipseFrame(g, p.x, p.y + r * 0.5, r * 1.4 + pulse * 3, r * 0.48 + pulse, 'gold');
      if (state === 'hover') {
        ellipseFrame(g, p.x, p.y + r * 0.5, r * 1.6, r * 0.56, 'white');
        UI.roundRect(g, p.x - ps / 2 - 4, py - 4, ps + 8, ps + 8, 7, 'gold');
        UI.roundRect(g, p.x - ps / 2 - 2, py - 2, ps + 4, ps + 4, 6, 'ink');
        UI.roundRect(g, p.x - ps / 2, py, ps, ps, 5, plate);
        UI.icon(g, name, p.x - (9 * sc) / 2, py + Math.round((ps - 9 * sc) / 2),
          { color: 'ink', scale: sc });
      }
    }
    if (big) {
      // UNDER it when it is up against the bar, which on a six-row chart is always
      const ly = py - 16 < 62 ? p.y + r * 1.5 : py - 16;
      text(g, 'THE DEEP', p.x, ly, on ? 'purple1' : 'grey1',
        { font: 5, center: true, shadow: 'ink' });
    }
    // the danger, as pips: a number you read on the map has to be the number you get
    if (n.kind !== 'shop' && n.kind !== 'rest') {
      const nd = Math.min(6, n.danger);
      for (let i = 0; i < nd; i++) {
        const px2 = p.x - nd * 4 + i * 8;
        const py2 = p.y + r * 0.86;
        rect(g, px2 - 1, py2 - 1, 8, 8, 'ink');
        rect(g, px2, py2, 6, 6, on ? (i > 3 ? 'red2' : 'gold') : mix(P.wood1, P.ink, 0.35));
        if (on) rect(g, px2, py2, 6, 2, mix(i > 3 ? P.red2 : P.gold, P.white, 0.4));
      }
    }
  }

  /* --------------------------------------------------------------------- draw */

  function drawEdges(g) {
    const openIds = reachable(chart).map((n) => n.id);
    const cur = currentNode(chart);
    for (const row of chart.rows) {
      for (const n of row) {
        const a = posOf(n);
        for (const id of n.links) {
          const m = nodeById(chart, id);
          if (!m) continue;
          const b = posOf(m);
          const isNext = (cur ? n.id === cur.id : n.row === 0 && false) && openIds.includes(id);
          const walked = chart.path.includes(n.id) && chart.path.includes(id);
          const lit = isNext || (hover && hover.id === id && openIds.includes(id));
          if (walked) {
            // the wake: a solid pale line you can trace back
            line(g, a.x, a.y, b.x, b.y, 'foam');
            line(g, a.x, a.y - 1, b.x, b.y - 1, mix(P.foam, P.water3, 0.5));
          } else if (lit) {
            line(g, a.x, a.y, b.x, b.y, 'gold');
            dashLine(g, a.x, a.y - 2, b.x, b.y - 2, 'brass3', 5, 4);
          } else {
            // A ROUTE YOU CANNOT SEE IS NOT A ROUTE. The dim edges were water3 mixed most of
            // the way into deep, on deep water: correct as a value relationship and invisible
            // as a line. They are pale and dotted now -- present, quiet, traceable.
            dashLine(g, a.x, a.y + 1, b.x, b.y + 1, 'ink', 4, 5);
            dashLine(g, a.x, a.y, b.x, b.y, mix(P.foam, P.water1, 0.45), 4, 5);
          }
        }
      }
    }
  }

  /**
   * THE LEDGER on the left and THE STOP CARD on the right, and both are the cute set now.
   *
   * The ledger was five rows of five-pixel label with a seven-pixel value right-aligned
   * against the panel edge, and the crew as bare icons on the wood. Same information: each
   * value is twice its label's height, the crew sit on rounded plates so they read as
   * portraits, and the stop card gets a coloured header with its kind's own colour in it.
   */
  function drawSide(g) {
    UI.softPanel(g, 12, TOP + 8, 196, 252, { style: 'wood', r: 7, shadow: true });
    text(g, 'THE BOAT', 110, TOP + 16, 'brass3', { font: 7, center: true, shadow: 'ink' });
    rect(g, 26, TOP + 30, 168, 2, mix(P.wood0, P.brass1, 0.4));
    const rows = [
      ['ON DECK', `${(v.aboard || []).length}/${capacity(v)}`, 'boat'],
      ['HULL', `${v.hull}/${hullMax(v)}`, 'shield'],
      ['APPLES', `${v.apples}`, 'drop'],
      ['COIN', `$${v.money}`, 'coin'],
    ];
    let y = TOP + 38;
    for (const [k, val, ic] of rows) {
      UI.roundRect(g, 24, y, 24, 24, 4, mix(P.wood0, P.ink, 0.3));
      UI.icon(g, ic, 27, y + 3, { color: 'brass2', scale: 2 });
      text(g, k, 54, y + 1, 'parch0', { font: 3 });
      text(g, val, 192, y + 8, 'brass3', { font: 7, right: true });
      y += 30;
    }
    // and the faces, because a list of names is not a crew
    (v.aboard || []).slice(0, 8).forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      const px2 = 26 + (i % 4) * 44, py2 = y + 4 + Math.floor(i / 4) * 40;
      UI.roundRect(g, px2, py2, 38, 36, 5, 'ink');
      UI.roundRect(g, px2 + 1, py2 + 1, 36, 34, 4, mix(P.parch1, P.wood2, 0.25));
      if (a) drawAnimalIcon(g, a, px2 + 19, py2 + 19, { size: 30 });
    });
    if ((v.eden || []).length) {
      text(g, `${(v.eden || []).length} STOWED IN EDEN`, 110, TOP + 244, 'parch0',
        { font: 3, center: true });
    }

    // THE STOP UNDER THE CURSOR, down the right
    const n = hover || currentNode(chart);
    if (!n) return;
    const K = KINDS[n.kind] || KINDS.fight;
    const px0 = W - 240, pw = 228;
    UI.softPanel(g, px0, TOP + 8, pw, 216, { style: 'paper', r: 7, shadow: true });
    UI.roundRect(g, px0, TOP + 8, pw, 30, 7, K.color);
    rect(g, px0, TOP + 34, pw, 4, mix(P[K.color], P.ink, 0.4));
    text(g, K.name, px0 + pw / 2, TOP + 16, 'ink', { font: 7, center: true });
    const lines = wrap(K.blurb, pw - 26, { font: 3 });
    lines.slice(0, 4).forEach((l, i) => {
      text(g, l, px0 + 13, TOP + 50 + i * 16, 'wood0', { font: 3 });
    });
    let yy = TOP + 50 + Math.min(4, lines.length) * 16 + 8;
    if (n.kind !== 'shop' && n.kind !== 'rest') {
      // the danger, big, with its pips beside it: it is the number the choice turns on
      text(g, 'DANGER', px0 + 14, yy + 4, 'wood1', { font: 3 });
      text(g, `${n.danger}`, px0 + 66, yy, n.danger > 4 ? 'red2' : 'rust',
        { font: 7, scale: 2 });
      const nd = Math.min(6, n.danger);
      for (let i = 0; i < nd; i++) {
        rect(g, px0 + 104 + i * 10, yy + 4, 8, 12, 'ink');
        rect(g, px0 + 105 + i * 10, yy + 5, 6, 10, i > 3 ? 'red2' : 'gold');
      }
      yy += 30;
    }
    text(g, `ROW ${n.row + 1} OF ${totalRows()}`, px0 + 14, yy, 'wood1', { font: 3 });
    yy += 20;
    if (canGo(chart, n.id)) {
      UI.tag(g, px0 + 14, yy, 'CLICK TO SAIL', { tone: 'leaf2', color: 'ink', font: 5 });
    } else if (n.done) {
      UI.tag(g, px0 + 14, yy, 'BEHIND YOU', { tone: 'grey0', font: 3 });
    } else {
      UI.tag(g, px0 + 14, yy, 'NOT FROM HERE', { tone: 'grey0', font: 3 });
    }
  }

  function drawBoat(g) {
    const cur = currentNode(chart);
    let p;
    if (sailing) {
      const from = sailing.from ? posOf(sailing.from) : { x: W / 2, y: BOT + 40 };
      const to = posOf(sailing.to);
      const k = Ease.inOutCubic(clamp(sailT / 0.75, 0, 1));
      p = { x: lerp(from.x, to.x, k), y: lerp(from.y, to.y, k) };
    } else if (cur) {
      p = posOf(cur);
    } else {
      p = { x: W / 2, y: BOT + 40 };
    }
    const bob = Math.sin(t * 2) * 2;
    drawWake(g, p.x - 6, p.y + 32 + bob, 46, t, { spread: 0.3 });
    drawBoatFar(g, p.x, p.y + 22 + bob, t, { scale: 1 });
  }

  /**
   * THE TOP BAR: the chapter, the flood, and what the boat is carrying, as badges.
   *
   * The flood clock was a grey slab with a percentage beside it in five-pixel type -- the one
   * number on this screen that is not a choice, and the hardest one to read. It is a fat
   * rounded gauge now with its own tick marks, and it goes red from the inside.
   */
  function drawHud(g) {
    UI.panel(g, 0, 0, W, 52, { style: 'wood', shadow: false });
    rect(g, 0, 50, W, 2, mix(P.wood0, P.ink, 0.4));
    text(g, `CHAPTER ${v.chapter}`, 14, 8, 'brass3', { font: 7, scale: 2 });
    // THE CROSSINGS LEFT, counted properly. `v.legs` has never existed, so this read
    // "15 CROSSINGS LEFT" on leg one of a twenty-four leg voyage.
    const doneLegs = (v.chapter - 1) * LEGS_PER_CHAPTER + (v.leg - 1);
    const left = Math.max(0, CHAPTERS * LEGS_PER_CHAPTER - doneLegs);
    text(g, `LEG ${v.leg} OF ${LEGS_PER_CHAPTER} - ${left} CROSSINGS LEFT`, 16, 34, 'parch1',
      { font: 3 });

    // the flood, as a gauge
    const fk = clamp((v.flood || 0) / 100, 0, 1);
    const gx = 360, gw = 300;
    text(g, 'THE FLOOD', gx, 6, 'parch0', { font: 3 });
    UI.roundRect(g, gx - 2, 18, gw + 4, 22, 6, 'ink');
    UI.roundRect(g, gx, 20, gw, 18, 5, mix(P.wood0, P.ink, 0.35));
    const tone = fk > 0.75 ? 'red2' : fk > 0.45 ? 'gold' : 'water3';
    if (fk > 0.01) {
      UI.roundRect(g, gx, 20, Math.max(6, gw * fk), 18, 5, tone);
      rect(g, gx + 3, 22, Math.max(2, gw * fk - 6), 2, mix(P[tone], P.white, 0.45));
    }
    for (let i = 1; i < 4; i++) rect(g, gx + (gw / 4) * i, 22, 1, 14, mix(P.ink, P.wood0, 0.5));
    text(g, `${Math.round(fk * 100)}%`, gx + gw - 8, 25, 'white',
      { font: 7, right: true, shadow: 'ink' });

    UI.statBadge(g, W - 250, 7, {
      icon: 'boat', label: 'BERTHS', value: berthsFree(v), tone: 'wood2',
    });
    UI.statBadge(g, W - 124, 7, {
      icon: 'bone', label: 'LOST', value: (v.lost || []).length, tone: 'wood2',
      valueColor: (v.lost || []).length ? 'red2' : 'parch1',
    });
  }

  function draw(g) {
    if (!bake) bake = bakeSea();
    if (bake) g.drawImage(bake, 0, 0);
    // THE LIVING SEA, but only down the OUTSIDE of the frame. A map's background has to
    // recede: swells at full contrast across the middle third turn the dotted route lines and
    // the dark stops into a field of stripes, which is exactly what happened the first time
    // this screen had weather on it. Two narrow strips, calm, and the route sails clear.
    drawSea(g, { x: 0, w: LEFT - 16, top: 140, bottom: H, layer: 'swell', t, calm: 0.5 });
    drawSea(g, {
      x: RIGHT + 16, w: W - RIGHT - 16, top: 140, bottom: H, layer: 'swell',
      t: t * 1.1, calm: 0.5,
    });
    // and the middle, at a whisper: dead flat water under the lattice reads as a table cloth
    const prevA = g.globalAlpha;
    g.globalAlpha = 0.35;
    drawSea(g, {
      x: LEFT - 16, w: RIGHT - LEFT + 32, top: 140, bottom: H, layer: 'swell',
      t: t * 0.9, calm: 1,
    });
    g.globalAlpha = prevA;

    drawEdges(g);
    const openIds = reachable(chart).map((n) => n.id);
    nodeRects = [];
    for (const row of chart.rows) {
      for (const n of row) {
        const state = n.done ? 'done'
          : (hover && hover.id === n.id && openIds.includes(n.id)) ? 'hover'
            : openIds.includes(n.id) ? 'open' : 'shut';
        drawNode(g, n, state);
        const p = posOf(n);
        const r = n.kind === 'boss' ? 24 : 17;
        nodeRects.push({ id: n.id, rect: UI.rectOf(p.x - r, p.y - r, r * 2, r * 2) });
      }
    }
    drawBoat(g);
    drawHud(g);
    drawSide(g);
    if (restNote > 0) {
      const a = clamp(restNote / 0.6, 0, 1);
      const msg = 'A QUIET COVE - THE HULL IS MENDED AND THE BASKET IS FULL';
      const prevA = g.globalAlpha;
      g.globalAlpha = a;
      UI.banner(g, H - 116, msg, { tone: 'moss2', color: 'cream', font: 5 });
      g.globalAlpha = prevA;
    }
    UI.banner(g, H - 20, 'PICK A STOP - ONLY UP, AND ONLY ALONG A LINE YOU ARE ON',
      { tone: 'wood0', color: 'parch1', font: 3 });
    if (intro < 1) wash(g, 0, 0, W, H, 'ink', (1 - Ease.outCubic(intro)) * 0.95);
    if (outT >= 0) wash(g, 0, 0, W, H, 'ink', Ease.inQuad(clamp(outT / 0.5, 0, 1)));
  }

  /* ------------------------------------------------------------------- update */

  function update(dt) {
    t += dt;
    intro = Math.min(1, intro + dt * 2);
    if (restNote > 0) restNote -= dt;

    if (outT >= 0) {
      outT += dt;
      if (outT > 0.5 && onPick) {
        const cb = onPick; onPick = null;
        cb(currentNode(chart));
      }
      return;
    }
    if (sailing) {
      sailT += dt;
      if (sailT > 0.78) {
        const n = sailing.to;
        sailing = null;
        if (n.kind === 'rest') {
          // A COVE IS NOT A SCENE. Two lines of effect and a note on the map is more honest
          // than a screen with nothing on it: it mends the hull, it fills the basket, and it
          // marks itself done so the row is spent.
          v.hull = Math.min(hullMax(v), v.hull + 1);
          v.apples = Math.max(v.apples, 3);
          n.done = true;
          restNote = 2.6;
          Audio.sfx('levelup');
          return;
        }
        outT = 0;
        return;
      }
      return;
    }

    const m = Input.mouse;
    hover = null;
    for (const nr of nodeRects) {
      if (!UI.hover(nr.rect, m)) continue;
      hover = nodeById(chart, nr.id);
    }
    if (m.released && hover && canGo(chart, hover.id)) {
      const from = currentNode(chart);
      travelTo(chart, hover.id);
      sailing = { from, to: hover };
      sailT = 0;
      Audio.sfx('whoosh');
      Juice.shake(2, 0.2);
    }
    // and the keyboard, because a map you can only use with a mouse is a map you cannot use
    const open = reachable(chart);
    for (let i = 0; i < Math.min(9, open.length); i++) {
      if (Input.pressed(`Digit${i + 1}`)) {
        const from = currentNode(chart);
        travelTo(chart, open[i].id);
        sailing = { from, to: open[i] };
        sailT = 0;
        Audio.sfx('whoosh');
      }
    }
  }

  /* -------------------------------------------------------------------- scene */

  return {
    enter(args) {
      v = args.voyage || args.run;
      chart = args.chart;
      onPick = args.onPick;
      t = 0; intro = 0; outT = -1; sailing = null; hover = null;
      Audio.music('harbour');
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,
    debug() {
      return {
        chart: true,
        get at() { return chart.at; },
        // LEAVING, so a harness can tell "nowhere to go" from "already going". The map is
        // legitimately empty for the half second between committing to the last stop and the
        // fade finishing, and a bot that cannot see the difference reports a broken map.
        get leaving() { return outT >= 0 || !!sailing; },
        get rows() { return chart.rows.length; },
        open: () => reachable(chart).map((n) => ({ id: n.id, kind: n.kind, danger: n.danger })),
        get rects() {
          return {
            cards: nodeRects.map((nr) => nr.rect),
            nodes: nodeRects,
          };
        },
        posOf: (id) => posOf(nodeById(chart, id)),
        go: (id) => {
          if (!canGo(chart, id)) return false;
          const from = currentNode(chart);
          travelTo(chart, id);
          sailing = { from, to: nodeById(chart, id) };
          sailT = 0;
          return true;
        },
        // the harnesses want one call that just gets on with it
        goFirst: () => {
          const open = reachable(chart);
          if (!open.length) return false;
          const from = currentNode(chart);
          travelTo(chart, open[0].id);
          sailing = { from, to: open[0] };
          sailT = 0;
          return open[0].kind;
        },
      };
    },
  };
}

/** Which island a stop lands you on. Deterministic in the node, and it matches its danger. */
export function islandFor(node, seed = '') {
  const want = node ? node.danger : 1;
  let best = ISLANDS[0], bd = 99;
  const h = String(`${seed}${node ? node.id : ''}`)
    .split('').reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9973, 7);
  const order = ISLANDS.slice().sort((a, b) => ((h + ISLANDS.indexOf(a) * 7) % 13)
    - ((h + ISLANDS.indexOf(b) * 7) % 13));
  for (const isle of order) {
    const d = Math.abs((isle.danger || 1) - want);
    if (d < bd) { bd = d; best = isle; }
  }
  return Object.assign({}, best, { danger: want, boss: node && node.kind === 'boss',
    elite: node && node.kind === 'elite' });
}

void ellipse; void dashLine;

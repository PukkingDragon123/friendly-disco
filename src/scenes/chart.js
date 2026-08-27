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
    // dusk, because a map is a thing you read in the evening after a fight
    for (let y = 0; y < 96; y++) {
      const f = y / 96;
      rect(g, 0, y, W, 1, mix(P.purple0, P.rust, Math.pow(f, 0.7)));
    }
    for (let y = 96; y < 132; y++) {
      const f = (y - 96) / 36;
      rect(g, 0, y, W, 1, mix(P.rust, P.gold, f));
    }
    disc(g, W * 0.78, 126, 34, 'gold');
    disc(g, W * 0.78, 126, 26, 'cream');
    // and the water, dark at the bottom, with the sun broken across it
    for (let y = 132; y < H; y++) {
      const f = (y - 132) / (H - 132);
      rect(g, 0, y, W, 1, mix(P.water1, P.deep, Math.pow(f, 0.6)));
    }
    // A MAP'S BACKGROUND HAS TO RECEDE. Thirty swells at full contrast across the whole frame
    // is a beautiful sea and an unreadable map: the dotted route lines and the dark stops both
    // disappeared into a field of horizontal stripes. Twelve swells, low contrast, and none of
    // them in the middle third where the lattice lives.
    for (let i = 0; i < 12; i++) {
      const f = i / 11;
      const y = 138 + Math.round(Math.pow(f, 1.4) * (H - 150));
      const amp = 1 + f * 4;
      for (let x = 0; x < W; x += 4) {
        // the route runs up the middle, so the swells fade out of it
        const edge = clamp(Math.abs(x - W / 2) / (W * 0.42), 0, 1);
        if (edge < 0.35 && f > 0.1) continue;
        const wy = y + Math.round(Math.sin(x * 0.015 + i * 1.6) * amp);
        rect(g, x, wy, 5, 1, mix(P.water1, P.foam, 0.12 + edge * 0.16));
      }
      const rw = 10 + i * 12;
      rect(g, Math.round(W * 0.78) - rw / 2, y, rw, 1, mix(P.water3, P.gold, 0.25));
    }
    return cv.canvas;
  }

  /* --------------------------------------------------------------------- nodes */

  /** The little emblem inside a stop. One shape each, and none of them is a letter. */
  function emblem(g, kind, x, y, tone) {
    if (kind === 'fight') {
      for (let i = 0; i < 3; i++) rect(g, x - 6 + i * 5, y - 3, 3, 4, tone);
      rect(g, x - 4, y + 2, 9, 4, tone);
    } else if (kind === 'elite') {
      rect(g, x - 6, y - 5, 12, 8, tone);
      rect(g, x - 4, y + 3, 8, 3, tone);
      rect(g, x - 4, y - 3, 3, 3, 'ink');
      rect(g, x + 1, y - 3, 3, 3, 'ink');
    } else if (kind === 'shop') {
      disc(g, x, y, 7, tone);
      disc(g, x, y, 4, mix(P[tone] || P.gold, P.ink, 0.4));
      rect(g, x - 1, y - 5, 2, 10, tone);
    } else if (kind === 'event') {
      rect(g, x - 2, y - 7, 5, 9, tone);
      rect(g, x - 2, y + 4, 5, 4, tone);
    } else if (kind === 'rest') {
      tri(g, x - 6, y + 5, x + 6, y + 5, x, y - 6, tone);
      rect(g, x - 2, y + 1, 5, 4, 'gold');
    } else {
      // the boss: a crown
      rect(g, x - 8, y + 2, 17, 4, tone);
      for (let i = 0; i < 3; i++) tri(g, x - 8 + i * 6, y + 2, x - 3 + i * 6, y + 2,
        x - 6 + i * 6, y - 6, tone);
    }
  }

  function drawNode(g, n, state) {
    const p = posOf(n);
    const K = KINDS[n.kind] || KINDS.fight;
    const big = n.kind === 'boss';
    const r = big ? 22 : 15;
    // the island it sits on: a dark disc with a lit rim, so a stop is ground and not a dot
    ellipse(g, p.x, p.y + r * 0.7, r * 1.25, r * 0.42, mix(P.ink, P.deep, 0.4));
    disc(g, p.x, p.y, r + 2, 'ink');
    if (state === 'done') {
      disc(g, p.x, p.y, r, mix(P.grey0, P.ink, 0.4));
      emblem(g, n.kind, p.x, p.y, mix(P.grey1, P.ink, 0.3));
      // a struck-through mark, so a stop you have used cannot be mistaken for one you cannot
      line(g, p.x - r * 0.7, p.y - r * 0.7, p.x + r * 0.7, p.y + r * 0.7, 'grey1');
      return;
    }
    const on = state === 'open' || state === 'hover';
    const bodyTone = on ? K.color : mix(P[K.color], P.deep, 0.62);
    disc(g, p.x, p.y, r, bodyTone);
    disc(g, p.x, p.y - r * 0.3, r * 0.8, mix(P[K.color] || P.leaf2, P.white, on ? 0.2 : 0.02));
    emblem(g, n.kind, p.x, p.y, on ? 'ink' : mix(P.ink, P[K.color], 0.35));
    if (on) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4 + n.row);
      ellipseFrame(g, p.x, p.y, r + 4 + pulse * 2, r + 4 + pulse * 2, 'gold');
      if (state === 'hover') ellipseFrame(g, p.x, p.y, r + 8, r + 8, 'white');
    }
    if (big) {
      text(g, 'THE DEEP', p.x, p.y - r - 16, 'purple1', { font: 5, center: true });
    }
    // the danger, as pips: a number you read on the map has to be the number you get
    if (n.kind !== 'shop' && n.kind !== 'rest') {
      for (let i = 0; i < Math.min(6, n.danger); i++) {
        rect(g, p.x - Math.min(6, n.danger) * 3 + i * 6, p.y + r + 3, 4, 4,
          on ? (i > 3 ? 'red2' : 'gold') : mix(P.wood1, P.ink, 0.3));
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

  function drawSide(g) {
    // the ledger, down the left: what you are carrying into whatever you pick
    UI.panel(g, 12, TOP, 190, 206, { style: 'wood', title: 'THE BOAT', shadow: true });
    let y = TOP + 34;
    const rows = [
      ['ON DECK', `${(v.aboard || []).length} / ${capacity(v)}`],
      ['IN EDEN', `${(v.eden || []).length}`],
      ['HULL', `${v.hull} / ${hullMax(v)}`],
      ['APPLES', `${v.apples}`],
      ['COIN', `$${v.money}`],
    ];
    for (const [k, val] of rows) {
      text(g, k, 24, y, 'parch0', { font: 3 });
      text(g, val, 190 - textW(val, { font: 5 }), y - 2, 'brass3', { font: 5 });
      y += 22;
    }
    // and the faces, because a list of names is not a crew
    y += 6;
    (v.aboard || []).slice(0, 12).forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (a) drawAnimalIcon(g, a, 34 + (i % 4) * 44, y + 18 + Math.floor(i / 4) * 42,
        { size: 30 });
    });

    // the stop under the cursor, down the right
    const n = hover || currentNode(chart);
    if (!n) return;
    const K = KINDS[n.kind] || KINDS.fight;
    UI.panel(g, W - 236, TOP, 224, 210, { style: 'paper', shadow: true });
    rect(g, W - 236, TOP, 224, 6, K.color);
    text(g, K.name, W - 224, TOP + 16, 'ink', { font: 5 });
    const lines = wrap(K.blurb, 202, { font: 3 });
    lines.slice(0, 4).forEach((l, i) => {
      text(g, l, W - 224, TOP + 42 + i * 16, 'wood0', { font: 3 });
    });
    let yy = TOP + 42 + Math.min(4, lines.length) * 16 + 10;
    if (n.kind !== 'shop' && n.kind !== 'rest') {
      text(g, `DANGER ${n.danger}`, W - 224, yy, n.danger > 4 ? 'red2' : 'rust', { font: 5 });
      yy += 22;
    }
    text(g, `ROW ${n.row + 1} OF ${totalRows()}`, W - 224, yy, 'wood1', { font: 3 });
    yy += 18;
    if (canGo(chart, n.id)) {
      text(g, 'CLICK TO SAIL', W - 224, yy, 'leaf0', { font: 5 });
    } else if (n.done) {
      text(g, 'BEHIND YOU', W - 224, yy, 'grey0', { font: 3 });
    } else {
      text(g, 'NOT FROM HERE', W - 224, yy, 'grey0', { font: 3 });
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
    drawBoatFar(g, p.x, p.y + 22 + bob, t, { scale: 1 });
    // the wake behind it
    for (let i = 0; i < 4; i++) {
      rect(g, p.x - 18 + i * 4, p.y + 30 + bob + i, 8 - i, 2, 'foam');
      rect(g, p.x + 12 - i * 4, p.y + 30 + bob + i, 8 - i, 2, 'foam');
    }
  }

  function drawHud(g) {
    UI.panel(g, 0, 0, W, 46, { style: 'wood', shadow: false });
    text(g, `CHAPTER ${v.chapter}`, 14, 8, 'brass3', { font: 7 });
    // THE CROSSINGS LEFT, counted properly. `v.legs` has never existed, so this read
    // "15 CROSSINGS LEFT" on leg one of a twenty-four leg voyage -- a number off by nine on
    // the one screen whose whole job is telling you how much ocean you have left.
    const doneLegs = (v.chapter - 1) * LEGS_PER_CHAPTER + (v.leg - 1);
    const left = Math.max(0, CHAPTERS * LEGS_PER_CHAPTER - doneLegs);
    text(g, `LEG ${v.leg} OF ${LEGS_PER_CHAPTER} — ${left} CROSSINGS LEFT`, 14, 28, 'parch1',
      { font: 3 });
    // the flood clock, which is the only thing on this screen that is not a choice
    const fk = clamp((v.flood || 0) / 100, 0, 1);
    text(g, 'THE FLOOD', 380, 6, 'parch0', { font: 3 });
    rect(g, 380, 20, 300, 16, 'ink');
    rect(g, 382, 22, 296 * fk, 12, fk > 0.75 ? 'red2' : fk > 0.45 ? 'gold' : 'water3');
    text(g, `${Math.round(fk * 100)}%`, 690, 20, 'parch1', { font: 3 });
    text(g, `${berthsFree(v)} BERTHS`, W - 130, 9, 'brass3', { font: 5 });
    text(g, `${(v.lost || []).length} LOST`, W - 130, 28, 'parch1', { font: 3 });
  }

  function draw(g) {
    if (!bake) bake = bakeSea();
    if (bake) g.drawImage(bake, 0, 0);
    // living glints, and only out at the edges where they cannot fight the route
    for (let i = 0; i < 14; i++) {
      const y = 150 + ((i * 37) % (H - 170));
      const side = i % 2 ? 1 : -1;
      const x = ((t * (10 + (i % 4) * 4) + i * 61) % (W * 0.34)) + (side > 0 ? W * 0.66 : 0);
      rect(g, x, y, 8 + (i % 3) * 5, 1, i % 3 ? 'water3' : 'foam');
    }

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
      const msg = 'A QUIET COVE — THE HULL IS MENDED AND THE BASKET IS FULL';
      const wpx = textW(msg, { font: 5 }) + 30;
      rect(g, W / 2 - wpx / 2, H - 130, wpx, 28, 'ink');
      rect(g, W / 2 - wpx / 2, H - 130, wpx, 2, 'moss2');
      text(g, msg, W / 2, H - 123, 'cream', { font: 5, center: true, alpha: a });
    }
    const tip = 'PICK A STOP — ONLY UP, AND ONLY ALONG A LINE YOU ARE ON';
    const tw = textW(tip, { font: 3 }) + 24;
    rect(g, W / 2 - tw / 2, H - 28, tw, 18, 'ink');
    text(g, tip, W / 2, H - 23, 'parch1', { font: 3, center: true });
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

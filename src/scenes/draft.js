// THE RAMP — the run's opening decision.
//
// Thirteen head of stock stand on the bank. The ramp takes eight. Everything you leave
// behind drowns, and the game says so out loud, because a roguelike's first choice
// should cost something.
//
// What makes it a decision rather than a coin flip is the BERTH BOARD along the top:
// the six conditions the first blind is actually going to offer, rolled before you pick
// (run.beginDraft) and cached so it cannot change under you. So the question is not
// "which animals are best" but "which eight of these thirteen fit the deck I can see".
// A pig is worthless if nothing is SOAKED and excellent if two berths are.
//
// Every animal card shows its ranked wants as trait pips and, against the rolled board,
// a live verdict: FAVOURITE, CONTENT, SETTLES, or a red HATES IT.

import { P, col, mix } from '../core/palette.js';
import {
  rect, frame, box, boxFrame, px, line, disc, ellipse, text, textW, wrap, wash,
  clamp, lerp, W, H,
} from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import { createSeascape } from '../render/seascape.js';
import { drawPortrait } from '../render/portraits.js';
import * as UI from '../render/uikit.js';
import { drawAnimal, drawAnimalIcon } from '../render/sprites.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { HABITAT_BY_ID, likeness, likeRank } from '../data/habitats.js';
import { beginDraft, commitDraft, draftRoom } from '../game/run.js';

const BOARD_Y = 62;          // the berth board
const CARD_W = 104, CARD_H = 150;
const GRID_Y = 176;

export function makeDraftScene() {
  let run = null, onDone = null;
  let sea = null, parts = null;
  let t = 0, intro = 0;
  let stock = [], assignment = {}, size = 8;
  let chosen = [];             // indices into stock
  let hover = -1;
  let boardRect = UI.rectOf(0, 0, 0, 0);
  let cardRects = [];

  /**
   * How well this animal fits the rolled board.
   *
   * The first version of this said FAVOURITE for anything whose top want was open --
   * which, with six of nine berths open, was every animal on the bank. Useless. What
   * actually differentiates them is COVERAGE: how many of the three conditions it asks
   * for this deck can offer, because an animal with all three covered can be routed
   * anywhere as the board fills up, and an animal with one is a single-berth
   * specialist you will be fighting to place on the last shot.
   */
  function verdictFor(animal) {
    const open = Object.values(assignment);
    let covered = 0, best = 0, bestId = null, favOpen = false;
    animal.likes.forEach((tid, i) => {
      if (open.indexOf(tid) >= 0) {
        covered++;
        if (i === 0) favOpen = true;
      }
    });
    for (const hid of open) {
      const v = likeness(animal, hid);
      if (v > best) { best = v; bestId = hid; }
    }
    if (covered === 0) {
      // nothing it asked for is open; it can still settle for a relative
      if (best > 0) return { label: 'SETTLES ONLY', color: 'sky', hid: bestId, v: best, covered };
      return { label: 'HATES ALL SIX', color: 'red2', hid: null, v: 0, covered };
    }
    const label = `${covered}/3 BERTHS` + (favOpen ? ' ★' : '');
    const color = covered === 3 ? 'gold' : covered === 2 ? 'green1' : 'amber';
    return { label, color, hid: bestId, v: best + covered, covered };
  }

  function toggle(i) {
    const at = chosen.indexOf(i);
    if (at >= 0) {
      chosen.splice(at, 1);
      Audio.sfx('click');
      return;
    }
    if (chosen.length >= size) { Audio.sfx('error'); return; }
    chosen.push(i);
    Audio.sfx('deal');
    const r = cardRects[i];
    if (r) parts.emit('dust', r.x + r.w / 2, r.y + r.h / 2, { count: 6, speed: 40, color: 'wood3', life: 0.4 });
  }

  function board() {
    // fill from what is left, favourite-first, so a hurried player still boards well
    const rest = stock.map((id, i) => i).filter((i) => chosen.indexOf(i) < 0);
    rest.sort((a, b) => verdictFor(ANIMAL_BY_ID[stock[b]]).v - verdictFor(ANIMAL_BY_ID[stock[a]]).v);
    while (chosen.length < size && rest.length) chosen.push(rest.shift());
    commitDraft(run, chosen);
    Audio.sfx('fanfare');
    Juice.flash('brass3', 0.3, 0.35);
    if (onDone) onDone();
  }

  /* ----------------------------------------------------------------- draw */

  function draw(g) {
    sea.draw(g, {
      x: 0, y: 0, w: W, h: H, horizonY: 150,
      timeOfDay: 0.42, storm: 0.28, parallax: 0.5, reflect: true,
    });
    parts.draw(g, 'back');

    const k = Ease.outCubic(clamp(intro, 0, 1));

    // --- title
    const title = 'THE RAMP';
    const sub = `the ramp takes ${size} — everything you leave on the bank drowns`;
    const tw = Math.max(textW(title, { font: 7, scale: 2 }), textW(sub, { font: 5 })) + 40;
    wash(g, W / 2 - tw / 2, 2, tw, 50, 'ink', 0.62);
    rect(g, W / 2 - tw / 2, 51, tw, 1, 'brass1');
    text(g, title, W / 2, 10, 'ink', { center: true, font: 7, scale: 2 });
    text(g, title, W / 2, 8, 'brass3', { center: true, font: 7, scale: 2, shadow: 'ink' });
    text(g, sub, W / 2, 36, 'bone', { center: true, font: 5, shadow: 'ink' });

    // --- the berth board: what the first deck will offer
    const bw = 704, bx = Math.round((W - bw) / 2);
    boardRect = UI.rectOf(bx, BOARD_Y, bw, 100);
    UI.panel(g, bx, BOARD_Y, bw, 100, { style: 'slate', shadow: true });
    text(g, 'THE FIRST DECK WILL OFFER', bx + 10, BOARD_Y + 6, 'brass2', { font: 3 });
    text(g, 'pick eight that fit it', bx + bw - 10, BOARD_Y + 6, 'grey1', { font: 3, right: true });
    const slots = Object.keys(assignment);
    slots.forEach((slot, i) => {
      const hab = HABITAT_BY_ID[assignment[slot]];
      if (!hab) return;
      const cw = Math.floor((bw - 20) / slots.length);
      const cx = bx + 10 + i * cw;
      const cy = BOARD_Y + 20;
      // how many of the animals you have CHOSEN want this condition
      let want = 0;
      for (const ix of chosen) {
        const a = ANIMAL_BY_ID[stock[ix]];
        if (a && likeness(a, hab.id) >= 0.999) want++;
      }
      rect(g, cx, cy, cw - 4, 70, mix(col(hab.color), P.ink, want ? 0.66 : 0.86));
      boxFrame(g, cx, cy, cw - 4, 70, want ? hab.color : mix(col(hab.color), P.ink, 0.5), 1);
      UI.icon(g, hab.icon, cx + (cw - 4) / 2 - 8, cy + 6, { color: hab.color, scale: 2 });
      text(g, hab.short, cx + (cw - 4) / 2, cy + 28, want ? 'white' : hab.color, { font: 7, center: true });
      wrap(hab.blurb, cw - 12, { font: 3 }).slice(0, 2).forEach((l, j) => {
        text(g, l, cx + (cw - 4) / 2, cy + 44 + j * 7, 'grey2', { font: 3, center: true });
      });
      // a tally of the animals you have picked that call this their favourite
      if (want) {
        rect(g, cx + 2, cy + 62, cw - 8, 6, 'ink');
        for (let j = 0; j < Math.min(6, want); j++) rect(g, cx + 4 + j * 6, cy + 63, 4, 4, hab.color);
      }
    });

    // --- Noah, waiting at the top of the ramp
    drawPortrait(g, 'noah', 14, GRID_Y + 4, 118, 168, t, {});
    text(g, 'NOAH', 73, GRID_Y + 176, 'brass3', { font: 5, center: true });
    const nag = chosen.length >= size ? 'That is the lot. Shut the door.'
      : chosen.length === 0 ? 'Well? Pick some.'
        : `${draftRoomNow()} more. I am not waiting on the weather.`;
    wrap(nag, 122, { font: 3 }).slice(0, 4).forEach((l, i) => {
      text(g, l, 73, GRID_Y + 190 + i * 9, 'bone', { font: 3, center: true, shadow: 'ink' });
    });

    // --- the stock, as cards on the bank
    cardRects = [];
    const cols = 7;
    const gx = 150;
    stock.forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      const cxx = gx + (i % cols) * (CARD_W + 6);
      const rowY = GRID_Y + Math.floor(i / cols) * (CARD_H + 6);
      // stagger the entrance so the bank fills left to right
      const lift = Math.round((1 - Ease.outCubic(clamp(intro * 2 - i * 0.06, 0, 1))) * 40);
      const cyy = rowY + lift;
      const r = UI.rectOf(cxx, cyy, CARD_W, CARD_H);
      cardRects[i] = r;
      if (!a) return;
      const picked = chosen.indexOf(i) >= 0;
      const hot = hover === i;
      const v = verdictFor(a);

      // the card
      UI.panel(g, cxx, cyy, CARD_W, CARD_H, {
        style: picked ? 'brass' : 'slate', shadow: true, inset: !picked,
      });
      if (picked) boxFrame(g, cxx - 1, cyy - 1, CARD_W + 2, CARD_H + 2, 'gold', 1);
      else if (hot) boxFrame(g, cxx - 1, cyy - 1, CARD_W + 2, CARD_H + 2, 'white', 1);

      // the animal, big
      drawAnimal(g, a, cxx + CARD_W / 2, cyy + 34, { scale: 1 });
      text(g, a.name, cxx + CARD_W / 2, cyy + 52, picked ? 'wood0' : 'white',
        { font: 7, center: true, shadow: picked ? 'brass3' : 'ink' });
      text(g, `${a.chips} × ${a.mult}`, cxx + CARD_W / 2, cyy + 68, picked ? 'wood1' : 'sky',
        { font: 5, center: true });

      // ranked wants, as pips
      a.likes.forEach((tid, j) => {
        const hb = HABITAT_BY_ID[tid];
        if (!hb) return;
        const sz = j === 0 ? 16 : 13;
        const pxx = cxx + 8 + j * 19;
        const pyy = cyy + 82 + (j === 0 ? 0 : 2);
        // a berth on the board that answers this want gets a lit pip
        const open = Object.values(assignment).indexOf(tid) >= 0;
        rect(g, pxx, pyy, sz, sz, open ? mix(col(hb.color), P.ink, 0.5) : 'ink');
        frame(g, pxx, pyy, sz, sz, open ? hb.color : mix(col(hb.color), P.ink, 0.55));
        UI.icon(g, hb.icon, pxx + (sz - 8) / 2, pyy + (sz - 8) / 2,
          { color: open ? hb.color : mix(col(hb.color), P.grey1, 0.5) });
        if (open) px(g, pxx + 1, pyy + 1, 'white');
      });
      // and the verdict against the rolled board
      rect(g, cxx + 5, cyy + 102, CARD_W - 10, 16, mix(col(v.color), P.ink, 0.7));
      boxFrame(g, cxx + 5, cyy + 102, CARD_W - 10, 16, v.color, 1);
      text(g, v.label, cxx + CARD_W / 2, cyy + 106, v.color, { font: 5, center: true });

      // the rule it brings, or its blurb
      wrap(a.rules || a.blurb || '', CARD_W - 12, { font: 3 }).slice(0, 3).forEach((l, j) => {
        text(g, l, cxx + 6, cyy + 122 + j * 8, picked ? 'wood1' : 'grey2', { font: 3 });
      });

      // ABOARD stamp
      if (picked) {
        const ord = chosen.indexOf(i) + 1;
        disc(g, cxx + CARD_W - 11, cyy + 11, 9, 'green0');
        disc(g, cxx + CARD_W - 11, cyy + 11, 7, 'green1');
        text(g, String(ord), cxx + CARD_W - 11, cyy + 7, 'white', { font: 7, center: true });
      } else if (chosen.length >= size) {
        // the ones that are going to drown, greyed with a waterline across them
        wash(g, cxx, cyy, CARD_W, CARD_H, 'water0', 0.34);
        for (let y2 = cyy + CARD_H - 26; y2 < cyy + CARD_H; y2 += 3) {
          rect(g, cxx + 2, y2, CARD_W - 4, 1, 'water2');
        }
      }
    });

    // --- the ramp button
    const bwid = 280;
    const br = UI.rectOf(W - bwid - 20, H - 46, bwid, 36);
    boardRect = br;
    const full = chosen.length >= size;
    UI.button(g, br, full ? 'SHUT THE DOOR' : `WALK ${chosen.length}/${size} UP THE RAMP`, {
      state: UI.hover(br, Input.mouse) ? 'hover' : 'idle',
      color: full ? 'green0' : 'wood2', icon: 'boat',
      sub: full ? null : 'the rest fill themselves',
    });

    // --- what you are leaving, counted plainly
    const left = stock.length - chosen.length;
    const rest = stock.map((_, j) => j).filter((j) => chosen.indexOf(j) < 0);
    UI.panel(g, 14, H - 46, W - bwid - 44, 36, { style: 'slate', inset: true });
    text(g, `${left} LEFT ON THE BANK`, 22, H - 40, left > stock.length - size ? 'grey1' : 'red2',
      { font: 5 });
    rest.slice(0, 13).forEach((ix, i) => {
      const a = ANIMAL_BY_ID[stock[ix]];
      if (!a) return;
      const ax = 190 + i * 22;
      drawAnimalIcon(g, a, ax, H - 28, { scale: 1 });
      // a waterline under each one, so what "left on the bank" means is not abstract
      for (let y2 = H - 20; y2 < H - 14; y2 += 2) rect(g, ax - 9, y2, 18, 1, 'water2');
    });

    parts.draw(g, 'front');
    if (intro < 1) wash(g, 0, 0, W, H, 'ink', (1 - k) * 0.8);
  }

  function draftRoomNow() { return Math.max(0, size - chosen.length); }

  /* --------------------------------------------------------------- update */

  function update(dt) {
    t += dt;
    intro = approach(intro, 1, 2.2, dt);
    sea.update(dt);
    parts.update(dt);

    const m = Input.mouse;
    hover = -1;
    for (let i = 0; i < cardRects.length; i++) {
      if (cardRects[i] && UI.hover(cardRects[i], m)) { hover = i; break; }
    }
    if (m.pressed) {
      if (hover >= 0) toggle(hover);
      else if (UI.hover(boardRect, m)) board();
    }
    // number keys 1..9 toggle the first nine, Enter boards
    for (let i = 0; i < 9; i++) {
      if (Input.pressed('Digit' + (i + 1))) toggle(i);
    }
    if (Input.pressed('Enter') || Input.pressed('Space')) board();
  }

  return {
    enter(args, api) {
      run = args.run; onDone = args.onDone;
      void api;
      const d = beginDraft(run);
      stock = d.stock; assignment = d.assignment; size = d.size;
      chosen = [];
      t = 0; intro = 0;
      sea = createSeascape(run.seed + '/ramp', {});
      parts = createParticles({ limit: 300, seed: run.seed + '/ramp' });
      Audio.music('harbour');
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,
    debug() {
      return { run, stock, chosen, assignment, size, rects: { cards: cardRects, board: boardRect }, board, toggle };
    },
  };
}

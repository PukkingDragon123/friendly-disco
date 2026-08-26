// THE ISLAND. Five rows, nine columns, and everything the flood ruined walking down them.
//
// THE READ IS THE WHOLE JOB. A lane defence lives or dies on whether the player can answer
// four questions without thinking: how much clay have I got, what is coming, what is in
// each row, and which of those things is nearly down. So:
//
//   CLAY is the biggest number on the screen, top left, where the eye starts.
//   ROWS are banded in alternating tone, so a beast's row is never in doubt.
//   HEALTH sits over anything damaged, and only over things that are damaged.
//   THE DAZED get a ring and a bouncing apple prompt, because that window is the game.
//
// The floor is baked once into a single canvas -- lawn, water, rocks, trees, the ark's hull
// -- and blitted as one call. Everything that moves is a blit of something that was baked.

import { W, H, rect, text, textW, wash, clamp, disc, makeCanvas } from '../core/pixel.js';
import { P, mix } from '../core/palette.js';
import { Input } from '../core/input.js';
import { approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import * as UI from '../render/uikit.js';
import { drawAnimal, drawAnimalIcon, drawAnimalShadow } from '../render/sprites.js';
import { drawFolk, drawWand } from '../render/folk.js';
import { drawScatter, drawPatches } from '../render/tiles.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { berthsFree } from '../game/voyage.js';
import {
  newLane, update as tickLane, actAt, select, uproot, plantable, plantAt, canAfford,
  endLane, result, waveText, COLS, ROWS, L,
} from '../game/lane.js';

/* -------------------------------------------------------------------- layout */

const HUD_H = 72;
const TW = 96, TH = 66;                     // one tile
const FX = 48, FY = 78;                     // the field's top-left
const FW = COLS * TW, FH = ROWS * TH;       // 864 x 330
const BAR_Y = FY + FH + 4;                  // the tray

// corrupted, blessed and dazed are the SAME sprite in three tints. That is the point: the
// lion walking at you is visibly the lion you will plant next island.
// The state REPLACES the material and keeps only the shape (see render/sprites.js). A
// blessed beast is clay with a gold eye, a corrupted one is bruised dark with a red one,
// and both are the same animal you will recognise when you tame it.
const CORRUPT_TINT = { material: 'corrupt' };
const BLESSED_TINT = { material: 'clay' };

export function makeIslandScene() {
  let v = null, island = null, onDone = null;
  let f = null;
  let t = 0, intro = 0, outro = -1;
  let parts = null;
  let hoverTile = null;
  let flash = 0, shake = 0;
  let cardRects = [], appleRect = null, castRect = null;
  let floorCv = null;

  /* ------------------------------------------------------------- the floor bake */

  function bakeFloor() {
    if (!floorCv) floorCv = makeCanvas(FW, FH);
    if (!floorCv) return;
    const g = floorCv.g;
    const G = groundTones();
    g.clearRect(0, 0, FW, FH);
    for (let r = 0; r < ROWS; r++) {
      const water = f.terrain[r * COLS] === L.WATER;
      for (let c = 0; c < COLS; c++) {
        const x = c * TW, y = r * TH;
        // BANDED ROWS, and banded by row rather than checkered by tile. A checkerboard
        // tells you which tile you are over; a band tells you which ROW something is in,
        // and the row is the only thing that matters in a lane game.
        const base = water ? (r % 2 ? 'water1' : 'water0')
          : (r % 2 ? G.dark : G.mid);
        rect(g, x, y, TW, TH, base);
        // a lit lip along the top of each band and a dark one along the bottom. Subtler
        // than this and the rows do not separate, and a row you cannot see is a lane game
        // you cannot play.
        if (!water) {
          rect(g, x, y, TW, 3, mix(P[G.light], P[base], 0.35));
          rect(g, x, y + TH - 3, TW, 3, mix(P.ink, P[base], 0.65));
        }
      }
      if (water) {
        for (let i = 0; i < 26; i++) {
          rect(g, (i * 37) % FW, r * TH + 8 + (i % 6) * 9, 12, 2, i % 3 ? 'water3' : 'foam');
        }
      }
    }
    // texture, off world position so nothing lines up with the 96-pixel grid
    const dry = (c, r) => f.terrain[r * COLS + c] !== L.WATER;
    drawPatches(g, 0, 0, Math.ceil(FW / 32), Math.ceil(FH / 32), island.biome,
      (c, r) => dry(Math.min(COLS - 1, (c * 32 / TW) | 0), Math.min(ROWS - 1, (r * 32 / TH) | 0)));
    drawScatter(g, 0, 0, Math.ceil(FW / 32), Math.ceil(FH / 32), island.biome,
      (c, r) => dry(Math.min(COLS - 1, (c * 32 / TW) | 0), Math.min(ROWS - 1, (r * 32 / TH) | 0)), 420);
    // the grid, faint. Enough to plant against, not enough to look at.
    for (let c = 1; c < COLS; c++) rect(g, c * TW, 0, 1, FH, mix(P.ink, P[G.mid], 0.72));
    for (let r = 1; r < ROWS; r++) rect(g, 0, r * TH, FW, 1, mix(P.ink, P[G.mid], 0.72));
    // rocks and trees, which are part of the floor because they never move
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const k = f.terrain[r * COLS + c];
        if (k === L.ROCK) drawRock(g, c * TW + TW / 2, r * TH + TH - 6);
        if (k === L.TREE) drawTrunk(g, c * TW + TW / 2, r * TH + TH - 4);
      }
    }
  }

  function groundTones() {
    const b = island.biome;
    if (b === 'desert' || b === 'coral') return { dark: 'wood1', mid: 'sand', light: 'cream' };
    if (b === 'snow' || b === 'tundra' || b === 'peak') return { dark: 'snow0', mid: 'snow1', light: 'white' };
    if (b === 'volcano') return { dark: 'ink', mid: 'ash', light: 'stone1' };
    if (b === 'swamp') return { dark: 'deep', mid: 'green0', light: 'moss' };
    if (b === 'ruins' || b === 'mountain') return { dark: 'stone1', mid: 'stone2', light: 'stone3' };
    return { dark: 'green0', mid: 'leaf2', light: 'leaf3' };
  }

  /** A boulder: a faceted lump, wide at the foot. */
  function drawRock(g, cx, by) {
    const prof = [16, 16, 15, 14, 12, 10, 8, 5];
    for (let i = 0; i < prof.length; i++) {
      const hw = prof[i], y = by - i * 3;
      rect(g, cx - hw, y, hw * 2, 3, i > 5 ? 'stone3' : i > 2 ? 'stone2' : 'stone1');
      rect(g, cx + Math.round(hw * 0.3), y, hw - Math.round(hw * 0.3), 3, 'stone0');
    }
    rect(g, cx - 18, by + 2, 36, 3, mix(P.ink, P.shadow, 0.4));
    rect(g, cx - 8, by - 22, 8, 3, 'stone4');
  }

  /** An apple tree's trunk and canopy. The fruit is live, because it ripens. */
  function drawTrunk(g, cx, by) {
    for (let i = 0; i < 9; i++) rect(g, cx - 4, by - i * 4, 8, 4, i % 3 === 0 ? 'wood0' : 'bark');
    rect(g, cx - 4, by - 34, 3, 34, 'wood2');
    for (const [dx, dy, r] of [[0, -50, 22], [-16, -40, 15], [16, -40, 15], [-8, -60, 14], [9, -58, 14]]) {
      disc(g, cx + dx, by + dy, r, 'leaf1');
    }
    for (const [dx, dy, r] of [[-6, -56, 12], [10, -50, 9]]) disc(g, cx + dx, by + dy, r, 'leaf2');
    for (let i = 0; i < 9; i++) rect(g, cx - 20 + i * 5, by - 66 + (i % 3) * 3, 4, 3, 'leaf3');
  }

  const tx = (c) => FX + c * TW;
  const ty = (r) => FY + r * TH;
  const cxOf = (c) => FX + c * TW + TW / 2;
  const cyOf = (r) => FY + r * TH + TH - 8;

  function tileAtPoint(x, y) {
    const c = Math.floor((x - FX) / TW);
    const r = Math.floor((y - FY) / TH);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
    return { c, r };
  }

  /* ------------------------------------------------------------------ update */

  function finish() {
    if (outro >= 0) return;
    endLane(f, f.ark.hp <= 0 ? 'overrun' : 'clear');
    outro = 0;
    Audio.sfx(f.saved.length ? 'fanfare' : 'fail');
  }

  function pickBeast(id) {
    const def = f.hand.find((b) => b.id === id);
    if (!def) return;
    if (!canAfford(f, def)) { Audio.sfx('error'); return; }
    select(f, { kind: 'beast', id });
    Audio.sfx('click');
  }

  function update(dt) {
    t += dt;
    intro = approach(intro, 1, 2.6, dt);
    if (flash > 0) flash -= dt;
    if (shake > 0) shake -= dt;
    parts.update(dt);

    const m = Input.mouse;
    if (outro >= 0) {
      outro += dt;
      if (outro > 0.5 && (m.pressed || Input.pressed('Enter') || Input.pressed('Space'))) {
        if (onDone) onDone(result(f));
      }
      return;
    }

    const guardsBefore = f.guards.filter(Boolean).length;
    const arkBefore = f.ark.hp;
    tickLane(f, dt);
    if (f.guards.filter(Boolean).length < guardsBefore) { shake = 0.25; Audio.sfx('crate_land'); }
    if (f.ark.hp < arkBefore) { shake = 0.45; Audio.sfx('boss_sting'); }
    if (f.over) { finish(); return; }

    hoverTile = tileAtPoint(m.x, m.y);

    for (let i = 0; i < Math.min(9, f.hand.length); i++) {
      if (Input.pressed('Digit' + (i + 1))) pickBeast(f.hand[i].id);
    }
    if (Input.pressed('KeyA')) { select(f, { kind: 'apple' }); Audio.sfx('click'); }
    if (Input.pressed('Escape')) select(f, null);
    if (Input.pressed('Space') || Input.pressed('Enter')) { finish(); return; }

    // right-click digs one back up, which is the only way to correct a mistake
    if (m.rightPressed && hoverTile) {
      const res = uproot(f, hoverTile.r, hoverTile.c);
      Audio.sfx(res.ok ? 'crate_open' : 'error');
      return;
    }
    if (!m.pressed) return;

    for (const cr of cardRects) if (UI.hover(cr.rect, m)) { pickBeast(cr.id); return; }
    if (appleRect && UI.hover(appleRect, m)) {
      if (f.apples > 0) { select(f, { kind: 'apple' }); Audio.sfx('click'); }
      else Audio.sfx('error');
      return;
    }
    if (castRect && UI.hover(castRect, m)) { finish(); return; }

    if (hoverTile) {
      const res = actAt(f, hoverTile.r, hoverTile.c);
      lastAct = { r: hoverTile.r, c: hoverTile.c, res };
      if (res.ok) {
        flash = 0.3;
        Audio.sfx('crate_land');
        parts.burst('dust', cxOf(hoverTile.c), cyOf(hoverTile.r), { count: 8 });
      } else if (res.why && res.why !== 'pick something first') {
        Audio.sfx('error');
        note(res.why);
      }
    }
  }

  let hint = null, hintT = 0;
  let lastAct = null;
  function note(why) { hint = why.toUpperCase(); hintT = 1.6; }

  /* -------------------------------------------------------------------- draw */

  /** The sky and the far shore above the field, so the fight is happening somewhere. */
  function drawBackdrop(g) {
    const sky = (island.sky && island.sky[0]) || 'sky';
    rect(g, 0, HUD_H, W, FY - HUD_H + 6, sky);
    // THE FAR SHORE. The field is 864 of 960 wide, and the strip beyond its right edge was
    // showing the page background -- a black band exactly where the enemy walks in from.
    // It is the water they are wading out of, which is also the right answer thematically.
    for (let x = FX + FW; x < W; x++) {
      const fr = (x - FX - FW) / (W - FX - FW);
      rect(g, x, FY, 1, FH, fr < 0.3 ? 'water0' : fr < 0.7 ? 'deep' : 'night');
    }
    for (let i = 0; i < 18; i++) {
      const wy = FY + ((t * 22 + i * 23) % FH);
      rect(g, FX + FW + 4 + (i % 4) * 9, wy, 10, 2, i % 3 ? 'water3' : 'foam');
    }
    rect(g, 0, FY - 8, W, 8, mix(P.water1, P[sky], 0.4));
    for (let i = 0; i < 26; i++) {
      const wx = (i * 41 + Math.round(t * 8)) % (W + 40) - 20;
      rect(g, wx, FY - 7 + (i % 3) * 3, 9, 2, 'water3');
    }
  }

  /**
   * The ark's side, down the left edge, with a guard block per row.
   *
   * The guards are the most important thing on this strip: five one-shot saves, and the
   * player has to be able to count them at a glance while something is walking.
   */
  function drawArk(g) {
    for (let x = 0; x < FX; x++) {
      const fr = x / FX;
      rect(g, x, FY, 1, FH, fr < 0.25 ? 'wood0' : fr < 0.6 ? 'wood1' : 'wood2');
    }
    for (let y = FY; y < FY + FH; y += 9) rect(g, 0, y, FX, 1, 'wood0');
    rect(g, FX - 3, FY, 3, FH, 'wood3');
    for (let r = 0; r < ROWS; r++) {
      const y = ty(r);
      if (f.guards[r]) {
        // a plug of clay in the gap: lit, alive, and obviously about to be spent
        const bob = Math.round(Math.sin(t * 2 + r) * 1);
        rect(g, FX - 16, y + 10 + bob, 20, TH - 22, 'clay2');
        rect(g, FX - 16, y + 10 + bob, 20, 3, 'clay4');
        rect(g, FX - 16, y + TH - 15 + bob, 20, 3, 'clay0');
        UI.icon(g, 'shield', FX - 12, y + TH / 2 - 6 + bob, { color: 'gold' });
      } else {
        rect(g, FX - 16, y + 10, 20, TH - 22, mix(P.ink, P.wood0, 0.5));
        for (let i = 0; i < 3; i++) rect(g, FX - 14 + i * 6, y + 16 + i * 6, 4, 4, 'clay0');
      }
    }
  }

  /** A ripe apple hanging in a tree, and a hand cursor over it. */
  function drawTrees(g) {
    for (const tr of f.trees) {
      const cx = cxOf(tr.col), by = cyOf(tr.row);
      if (!tr.ripe) {
        // a bud, so a tree that is coming back is visibly coming back
        const k = clamp(tr.t / 24, 0, 1);
        rect(g, cx + 8, by - 52, 4, 4, mix(P.leaf0, P.red2, k));
        continue;
      }
      const bob = Math.round(Math.sin(t * 2.4) * 2);
      disc(g, cx + 10, by - 50 + bob, 7, 'red2');
      disc(g, cx + 8, by - 52 + bob, 3, 'red1');
      rect(g, cx + 9, by - 58 + bob, 2, 5, 'wood1');
      rect(g, cx + 11, by - 59 + bob, 4, 2, 'leaf3');
      // a ring, because a ripe apple is a thing you must be told to click
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + t * 1.4;
        rect(g, cx + 10 + Math.cos(a) * 14 - 1, by - 50 + Math.sin(a) * 14 - 1 + bob, 2, 2, 'gold');
      }
    }
  }

  /** Everything alive, back to front by row. */
  function drawLive(g) {
    // plants first: they are behind the walkers that come at them
    for (const p of f.plants) {
      const cx = cxOf(p.col), by = cyOf(p.row);
      const a = ANIMAL_BY_ID[p.def.base];
      if (p.def.kind === 'pad') {
        // a reed is a raft, drawn flat rather than as an animal standing on water
        for (let i = 0; i < 3; i++) rect(g, cx - 30 + i * 22, by - 6, 18, 8, i % 2 ? 'leaf1' : 'leaf2');
        rect(g, cx - 32, by - 8, 64, 3, 'leaf3');
      }
      if (a) {
        drawAnimalShadow(g, cx, by, 1);
        drawAnimal(g, a, cx, by, Object.assign({
          scale: 1, blessed: true, t,
          mood: p.flash > 0 ? 'scared' : 'happy',
          step: p.def.rate ? Math.floor((f.t / Math.max(0.2, p.def.rate)) * 2) % 4 : 0,
        }, BLESSED_TINT));
      }
      if (p.hp < p.max) hpBar(g, cx, by - 62, p.hp / p.max, 'leaf3');
      if (p.flash > 0) wash(g, cx - 30, by - 60, 60, 62, 'red2', p.flash * 0.5);
    }

    // the dazed: ordinary animals again, ringed, with an apple prompt
    for (const s of f.stunned) {
      const cx = cxOf(s.col), by = cyOf(s.row);
      const left = 1 - s.t / s.life;
      drawAnimalShadow(g, cx, by, 1);
      drawAnimal(g, s.a, cx, by, { scale: 1, mood: 'blink', flip: true, t });
      // the ring counts the window down, which is the clearest clock in the game
      const steps = 22;
      for (let i = 0; i < steps; i++) {
        if (i / steps > left) continue;
        const ang = -Math.PI / 2 + (i / steps) * Math.PI * 2;
        rect(g, cx + Math.cos(ang) * 34 - 2, by - 24 + Math.sin(ang) * 26 - 2, 4, 4,
          left > 0.35 ? 'gold' : 'red2');
      }
      const bob = Math.round(Math.sin(t * 5) * 3);
      disc(g, cx, by - 68 + bob, 8, 'red2');
      rect(g, cx - 1, by - 76 + bob, 2, 5, 'wood1');
      text(g, 'CLICK', cx, by - 90 + bob, 'cream', { font: 3, center: true });
    }

    // the corrupted, walking
    for (const b of f.beasts) {
      const cx = FX + (b.x - 0.5) * TW, by = cyOf(b.row);
      const a = ANIMAL_BY_ID[b.def.base];
      if (!a) continue;
      drawAnimalShadow(g, cx, by, 1);
      drawAnimal(g, a, cx, by, Object.assign({
        scale: 1, flip: true, walk: b.walk, t,
        mood: b.flash > 0 ? 'scared' : 'angry',
        rain: f.rain > 0.6 ? f.rain : 0,
      }, CORRUPT_TINT));
      // the corruption: a few dark motes coming off it
      for (let i = 0; i < 3; i++) {
        const k = ((t * 0.8 + i * 0.33) % 1);
        rect(g, cx - 10 + i * 9, by - 40 - k * 18, 3, 3, i % 2 ? 'purple0' : 'night');
      }
      if (b.hp < b.max) hpBar(g, cx, by - 62, b.hp / b.max, 'red2');
      if (b.slowT > 0) UI.icon(g, 'wave', cx - 6, by - 74, { color: 'ice' });
      if (b.def.armour) UI.icon(g, 'shield', cx + 10, by - 74, { color: 'stone3' });
    }

    // shots
    for (const s of f.shots) {
      const y = cyOf(s.row) - 26;
      if (s.tracer) {
        const x0 = FX + s.x * TW, x1 = FX + (s.to - 0.5) * TW;
        for (let x = Math.min(x0, x1); x < Math.max(x0, x1); x += 10) rect(g, x, y, 6, 3, 'ice');
        continue;
      }
      if (s.burst) {
        const rr = s.burst * TW * (0.5 + s.t * 3);
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          rect(g, FX + (s.x + 0.5) * TW + Math.cos(a) * rr - 3, y + Math.sin(a) * rr * 0.6 - 3,
            6, 6, i % 2 ? 'orange' : 'gold');
        }
        continue;
      }
      if (s.ring) {
        for (let i = 0; i < COLS; i++) rect(g, FX + i * TW + 20, y, 10, 3, 'ice');
        continue;
      }
      rect(g, FX + s.x * TW, y, 10, 5, 'leaf3');
      rect(g, FX + s.x * TW + 8, y + 1, 4, 3, 'moss');
    }
    for (const bee of f.bees) {
      const cx = FX + bee.x * TW, cy = cyOf(bee.row) - 30;
      rect(g, cx - 3, cy - 3, 7, 6, 'gold');
      rect(g, cx - 1, cy - 3, 3, 6, 'ink');
      rect(g, cx - 5, cy - 6 + (Math.floor(t * 30) % 2), 4, 3, 'ice');
    }
    for (const p of f.puffs) {
      const k = p.t / 0.7;
      const a = (p.i / 7) * Math.PI * 2;
      const c = p.kind === 'clay' ? 'clay4' : p.kind === 'bless' ? 'gold'
        : p.kind === 'guard' ? 'clay2' : p.kind === 'free' ? 'white' : 'clay3';
      rect(g, cxOf(p.c) + Math.cos(a) * k * 30 - 3, cyOf(p.r) - 20 + Math.sin(a) * k * 22 - 3,
        6, 6, k > 0.6 ? mix(P[c], P.ink, 0.4) : c);
    }
  }

  function hpBar(g, cx, y, k, c) {
    rect(g, cx - 22, y, 44, 7, 'ink');
    rect(g, cx - 20, y + 1, 40, 5, mix(P.ink, P.shadow, 0.4));
    rect(g, cx - 20, y + 1, Math.round(40 * clamp(k, 0, 1)), 5, k < 0.3 ? 'red2' : c);
  }

  /** Rain, which is what the sky does on every island in this game. */
  function drawRain(g) {
    const n = Math.round(24 + f.rain * 90);
    for (let i = 0; i < n; i++) {
      const sp = 300 + (i % 5) * 110;
      const x = ((i * 149 + Math.round(t * 100)) % (FW + 140)) - 70;
      const y = ((i * 71 + Math.round(t * sp)) % (FH + 40)) - 20;
      rect(g, FX + x, FY + y, 2, 8, i % 6 === 0 ? 'white' : 'ice');
    }
  }

  /** The golem, on his own deck, pointing at whatever you are about to do. */
  function drawKeeper(g) {
    const gx = 22, gy = FY + FH + 4;
    const wet = f.rain > 0.5;
    drawFolk(g, 'golem', gx, gy, t, {
      scale: 2, pose: f.sel ? 'react' : 'idle', mud: wet ? 0.9 : 0.4, wet: wet ? 1 : 0,
    });
    const hx = gx + 22, hy = gy - 52;
    let ang = -0.4;
    if (hoverTile) ang = Math.atan2(cyOf(hoverTile.r) - 20 - hy, cxOf(hoverTile.c) - hx);
    drawWand(g, hx, hy, ang, f.sel ? 0.7 + Math.sin(t * 7) * 0.3 : 0, t, { scale: 2 });
  }

  /* --------------------------------------------------------------------- HUD */

  /**
   * The top bar.
   *
   * CLAY IS THE BIGGEST THING ON IT. Every decision in the game is "can I afford that yet",
   * so the number goes top left at heading weight, where the eye starts and where it can be
   * read out of the corner of your vision while something is walking at you.
   */
  function drawTopBar(g) {
    UI.panel(g, 0, 0, W, HUD_H, { style: 'wood', flat: true });

    // clay
    const dripping = f.event && f.event.id === 'drought';
    disc(g, 32, 30, 15, 'clay2');
    disc(g, 29, 26, 8, 'clay4');
    UI.boxEdge(g, 16, 14, 32, 32, 'clay0');
    text(g, String(f.clay), 58, 12, dripping ? 'rust' : 'cream', { font: 7 });
    text(g, dripping ? 'CLAY · RUNNING SLOW' : 'CLAY', 58, 36, dripping ? 'rust' : 'parch1', { font: 3 });

    // apples
    const ax = 190;
    disc(g, ax + 12, 28, 11, f.apples ? 'red2' : mix(P.red0, P.ink, 0.5));
    rect(g, ax + 11, 15, 3, 5, 'wood1');
    text(g, String(f.apples), ax + 30, 14, f.apples ? 'cream' : 'grey1', { font: 7 });
    text(g, 'APPLES', ax + 30, 36, 'parch1', { font: 3 });

    // the wave
    text(g, waveText(f), 320, 10, f.inWave ? 'gold' : 'parch1', { font: 5 });
    const w = f.waves[Math.max(0, f.wave)];
    if (w) {
      const totalLeft = f.queue.length + f.beasts.length;
      rect(g, 320, 32, 240, 12, 'deep');
      const done = w.count ? 1 - f.queue.length / w.count : 1;
      rect(g, 320, 32, Math.round(240 * clamp(done, 0, 1)), 12, 'rust');
      UI.boxEdge(g, 318, 30, 244, 16, 'wood0');
      text(g, `${totalLeft} STILL COMING`, 572, 32, 'parch1', { font: 3 });
    }

    // the guards and the ark
    let gx = 700;
    for (let r = 0; r < ROWS; r++) {
      rect(g, gx + r * 14, 16, 11, 14, f.guards[r] ? 'clay3' : mix(P.ink, P.wood0, 0.5));
      if (f.guards[r]) rect(g, gx + r * 14, 16, 11, 3, 'clay4');
    }
    text(g, 'ROW GUARDS', gx, 34, 'parch1', { font: 3 });
    gx += 88;
    for (let i = 0; i < f.ark.max; i++) {
      UI.icon(g, 'heart', gx + i * 16, 16, { color: i < f.ark.hp ? 'red2' : 'shadow' });
    }
    text(g, 'THE ARK', gx, 34, f.ark.hp > 1 ? 'parch1' : 'red2', { font: 3 });

    // the deck
    const free = berthsFree(v);
    text(g, `${v.aboard.length}/${v.aboard.length + free}`, W - 12, 10,
      free ? 'brass3' : 'red2', { font: 7, right: true });
    text(g, 'BERTHS', W - 12, 34, free ? 'parch1' : 'red2', { font: 3, right: true });

    text(g, island.name.toUpperCase(), 320, 52, 'cream', { font: 3 });
    if (f.event) {
      const ew = textW(f.event.name, { font: 5 }) + 16;
      rect(g, 470, 48, ew, 18, mix(P[f.event.color], P.ink, 0.45));
      UI.boxEdge(g, 470, 48, ew, 18, f.event.color);
      text(g, f.event.name, 478, 50, 'cream', { font: 5 });
      text(g, f.event.blurb, 478 + ew, 52, f.event.color, { font: 3 });
    }
  }

  /**
   * The tray: one card per beast you know.
   *
   * The RULE is on the card, not in a tooltip. The whole game is choosing between rules, and
   * a rule you have to hover to read is a rule you will not factor in while a wave is
   * walking. The cost is the second-biggest thing on the card, greyed the moment you cannot
   * pay it, so the affordable set is readable without arithmetic.
   */
  function drawTray(g) {
    const by = BAR_Y;
    UI.panel(g, 0, by, W, H - by, { style: 'wood' });
    cardRects = [];

    const cw = 118, ch = 78;
    for (let i = 0; i < f.hand.length; i++) {
      const def = f.hand[i];
      const bx = 10 + i * (cw + 5);
      if (bx + cw > W - 206) break;
      const r0 = UI.rectOf(bx, by + 8, cw, ch);
      const able = canAfford(f, def);
      const on = f.sel && f.sel.kind === 'beast' && f.sel.id === def.id;
      const hot = UI.hover(r0, Input.mouse);
      rect(g, r0.x, r0.y, r0.w, r0.h, on ? 'clay1' : able ? (hot ? 'wood2' : 'wood1') : 'wood0');
      UI.boxEdge(g, r0.x, r0.y, r0.w, r0.h, on ? 'clay4' : hot && able ? 'brass3' : 'wood0');
      // the animal it is made of, on a pale niche so it reads against dark wood
      rect(g, r0.x + 4, r0.y + 4, 34, 34, able ? 'parch0' : 'shadow');
      const a = ANIMAL_BY_ID[def.base];
      if (a) drawAnimalIcon(g, a, r0.x + 21, r0.y + 21, { size: 32, alpha: able ? 1 : 0.4 });
      text(g, def.name.toUpperCase(), r0.x + 42, r0.y + 6, able ? 'cream' : 'grey1', { font: 3 });
      text(g, String(def.cost), r0.x + 42, r0.y + 18, able ? 'clay4' : 'red2', { font: 7 });
      text(g, 'CLAY', r0.x + 42 + textW(String(def.cost), { font: 7 }) + 4, r0.y + 26,
        able ? 'parch1' : 'red2', { font: 3 });
      // the rule, wrapped to two short lines
      const words = def.rule.split(' ');
      let line = '', ly = r0.y + 42;
      for (const wd of words) {
        const nxt = line ? `${line} ${wd}` : wd;
        if (textW(nxt, { font: 3 }) > cw - 12) { text(g, line, r0.x + 6, ly, 'parch1', { font: 3 }); line = wd; ly += 11; }
        else line = nxt;
        if (ly > r0.y + ch - 12) break;
      }
      if (line && ly <= r0.y + ch - 12) text(g, line, r0.x + 6, ly, 'parch1', { font: 3 });
      text(g, String(i + 1), r0.x + r0.w - 8, r0.y + 5, 'parch1', { font: 3, right: true });
      cardRects.push({ rect: r0, id: def.id });
    }

    // the apple, which is its own verb
    appleRect = UI.rectOf(W - 200, by + 8, 78, 74);
    const appleOn = f.sel && f.sel.kind === 'apple';
    rect(g, appleRect.x, appleRect.y, appleRect.w, appleRect.h,
      appleOn ? mix(P.red1, P.ink, 0.35) : f.apples ? 'wood1' : 'wood0');
    UI.boxEdge(g, appleRect.x, appleRect.y, appleRect.w, appleRect.h,
      appleOn ? 'red2' : f.apples ? 'wood0' : 'shadow');
    disc(g, appleRect.x + 39, appleRect.y + 30, 16, f.apples ? 'red2' : mix(P.red0, P.ink, 0.5));
    disc(g, appleRect.x + 34, appleRect.y + 25, 6, f.apples ? 'red1' : 'shadow');
    rect(g, appleRect.x + 38, appleRect.y + 10, 3, 7, 'wood1');
    rect(g, appleRect.x + 41, appleRect.y + 9, 6, 3, 'leaf3');
    text(g, `x${f.apples}`, appleRect.x + 39, appleRect.y + 52, f.apples ? 'cream' : 'grey1',
      { font: 5, center: true });
    text(g, 'TAME  [A]', appleRect.x + 39, appleRect.y + 66, 'parch1', { font: 3, center: true });

    castRect = UI.rectOf(W - 116, by + 8, 106, 34);
    UI.button(g, castRect, 'CAST OFF', { hot: UI.hover(castRect, Input.mouse), color: 'rust', font: 5 });

    // what is selected, explained, and the last thing that happened
    if (f.sel) {
      const def = f.sel.kind === 'beast' ? f.hand.find((b) => b.id === f.sel.id) : null;
      const label = def ? `${def.name.toUpperCase()} — CLICK A TILE`
        : 'AN APPLE — CLICK SOMETHING YOU HAVE KNOCKED DOWN';
      text(g, label, 10, H - 26, 'gold', { font: 3 });
      text(g, 'ESC TO CHANGE YOUR MIND  ·  RIGHT-CLICK A PLANT TO DIG IT UP', 10, H - 14,
        'parch1', { font: 3 });
    } else {
      text(g, 'PICK A BEAST OR AN APPLE  ·  RIGHT-CLICK A PLANT TO DIG IT UP', 10, H - 14,
        'parch1', { font: 3 });
    }
    // the last few things that happened, down the right, clear of the apple and the button
    for (let i = 0; i < f.notes.length; i++) {
      const n = f.notes[i];
      const a = clamp(1.7 - n.t * 0.55, 0, 1);
      if (a <= 0) continue;
      const prev = g.globalAlpha;
      g.globalAlpha = a;
      text(g, n.text, W - 10, by + 88 + i * 11, n.color, { font: 3, right: true });
      g.globalAlpha = prev;
    }
  }

  /** What the cursor is about to do, drawn on the tile. */
  function drawGhost(g) {
    if (!hoverTile) return;
    const { c, r } = hoverTile;
    const x = tx(c), y = ty(r);
    if (!f.sel) {
      // a ripe tree or a dazed beast is clickable with nothing selected, so say so
      const tree = f.trees.find((z) => z.row === r && z.col === c);
      const daze = f.stunned.some((s) => s.row === r && Math.abs(s.col - c) < 1.2);
      if (tree && tree.ripe) UI.boxEdge(g, x, y, TW, TH, 'gold');
      else if (daze) UI.boxEdge(g, x, y, TW, TH, 'red2');
      return;
    }
    if (f.sel.kind === 'apple') {
      UI.boxEdge(g, x, y, TW, TH, 'red2');
      return;
    }
    const def = f.hand.find((b) => b.id === f.sel.id);
    if (!def) return;
    const bad = plantable(f, r, c, def) || (canAfford(f, def) ? null : `${def.cost} clay`);
    rect(g, x + 2, y + 2, TW - 4, TH - 4, bad ? mix(P.red1, P.ink, 0.55) : mix(P.clay3, P.ink, 0.6));
    UI.boxEdge(g, x, y, TW, TH, bad ? 'red2' : 'clay4');
    const a = ANIMAL_BY_ID[def.base];
    if (a) {
      const prev = g.globalAlpha;
      g.globalAlpha = 0.6;
      drawAnimal(g, a, cxOf(c), cyOf(r), Object.assign({ scale: 1, t }, BLESSED_TINT));
      g.globalAlpha = prev;
    }
    if (bad) {
      const lw = textW(bad.toUpperCase(), { font: 3 }) + 10;
      wash(g, x + TW / 2 - lw / 2, y - 4, lw, 13, 'ink', 0.85);
      text(g, bad.toUpperCase(), x + TW / 2, y - 2, 'red2', { font: 3, center: true });
    }
  }

  function drawOutro(g) {
    wash(g, 0, 0, W, H, 'ink', clamp(outro * 1.6, 0, 0.8));
    const pw = 520, ph = 236;
    const px = (W - pw) / 2, py = (H - ph) / 2;
    UI.panel(g, px, py, pw, ph, { style: 'paper' });
    UI.panelTitle(g, px, py, pw, f.why === 'clear' ? 'THE LINE HELD' : 'THEY GOT ABOARD');
    text(g, `${f.saved.length} TAMED`, px + 24, py + 52, 'leaf4', { font: 7 });
    text(g, `${f.lost.length} TAKEN`, px + 24, py + 82, f.lost.length ? 'red2' : 'grey2', { font: 7 });
    text(g, `${f.wave + 1} OF ${f.waves.length} WAVES`, px + 240, py + 52, 'wood0', { font: 5 });
    text(g, `${f.tamed.length} APPLES SPENT WELL`, px + 240, py + 74, 'wood0', { font: 3 });
    f.saved.slice(0, 12).forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (a) drawAnimalIcon(g, a, px + 34 + (i % 12) * 38, py + 132, { size: 32 });
    });
    text(g, 'CLICK TO SAIL', px + pw / 2, py + ph - 30, 'rust', { font: 7, center: true });
  }

  function draw(g) {
    const sh = shake > 0 ? Math.round(Math.sin(t * 55) * 3) : 0;
    if (!floorCv) bakeFloor();

    rect(g, 0, 0, W, H, 'deep');
    drawBackdrop(g);

    g.save();
    g.beginPath();
    g.rect(0, FY, W, FH);
    g.clip();
    g.translate(sh, 0);
    if (floorCv) g.drawImage(floorCv.canvas, FX, FY);
    drawArk(g);
    // the rot, if it is happening, over its own row
    if (f.event && f.event.id === 'rot') wash(g, FX, ty(f.eventRow), FW, TH, 'moss', 0.28);
    drawGhost(g);
    drawTrees(g);
    drawLive(g);
    parts.draw(g);
    if (f.event && f.event.id === 'squall') wash(g, FX, FY, FW, FH, 'water0', 0.18);
    drawRain(g);
    g.restore();

    drawKeeper(g);
    UI.boxEdge(g, FX - 2, FY - 2, FW + 4, FH + 4, 'wood0');
    if (flash > 0) wash(g, FX, FY, FW, FH, 'white', flash * 0.15);

    drawTopBar(g);
    drawTray(g);
    if (hintT > 0) {
      hintT -= 1 / 60;
      const hw = textW(hint, { font: 5 }) + 20;
      wash(g, (W - hw) / 2, FY + FH - 30, hw, 20, 'ink', 0.85);
      text(g, hint, W / 2, FY + FH - 26, 'red2', { font: 5, center: true });
    }
    if (intro < 1) wash(g, 0, 0, W, H, 'ink', 1 - intro);
    if (outro >= 0) drawOutro(g);
  }

  return {
    enter(args) {
      v = args.voyage || args.run;
      island = args.island || (v && v.at);
      onDone = args.onDone;
      f = newLane(v, island, args.tag);
      t = 0; intro = 0; outro = -1;
      hoverTile = null; flash = 0; shake = 0; hint = null; hintT = 0;
      floorCv = null;
      parts = createParticles({ limit: 240, seed: v.seed + '/lane' });
      Audio.music(island.danger >= 3 ? 'deck_tense' : 'deck');
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,
    debug() {
      return {
        voyage: v, island, lane: f, field: f,
        get sel() { return f && f.sel; },
        get hover() { return hoverTile; },
        get lastAct() { return lastAct; },
        finish,
        pick: (id) => pickBeast(id),
        put: (r, c) => actAt(f, r, c),
        at: (r, c) => ({ x: cxOf(c), y: cyOf(r) - 20 }),
        tileAt: (x, y) => tileAtPoint(x, y),
        rects: { cards: cardRects, apple: appleRect, cast: castRect, dolls: cardRects },
      };
    },
  };
}

void plantAt; void drawScatter;

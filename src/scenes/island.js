// THE ISLAND. A tile stage, a rising flood, and a box of clay dolls.
//
// The whole scene is three layers and a HUD:
//
//   THE FLOOR, baked. Twenty-nine by eleven tiles plus every rock, briar and tree standing
//   on them, composited into one canvas and blitted as a single drawImage. It is re-baked
//   only when the terrain actually changes -- a bridge goes down, a ram breaks something,
//   the flood takes a column -- which is a few times a stage. Drawing it live would be
//   three hundred and nineteen tiles of work every frame for a floor that does not move.
//
//   THE LIVE FIELD: animals, monsters, dolls, lightning, the water's edge. Everything here
//   moves, so nothing here is baked; but everything is a blit of something that was.
//
//   THE WEATHER: rain over the lot, at whatever the island's sky is doing.
//
// The HUD's job is one number -- how long until the water arrives -- and one question:
// which doll, and where. Both are as big as they can be without eating the field.

import { W, H, rect, text, textW, wash, clamp, lerp, disc, makeCanvas, line } from '../core/pixel.js';
import { P, mix } from '../core/palette.js';
import { Input } from '../core/input.js';
import { approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import * as UI from '../render/uikit.js';
import { drawAnimal, drawAnimalShadow, drawAnimalIcon } from '../render/sprites.js';
import { drawFolk, drawWand } from '../render/folk.js';
import { drawDoll, drawMonster, drawStrike, DOLL_W } from '../render/dollart.js';
import {
  TILE, T, drawTile, drawProp, drawScatter, drawPatches, walkable, PROP_HEIGHT,
} from '../render/tiles.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { abilityOf } from '../data/abilities.js';
import { DOLL_BY_ID } from '../data/dolls.js';
import { berthsFree, dollBox } from '../game/voyage.js';
import {
  newField, update as tickField, placeAt, select, dollCharges, canPlaceDoll, radiusOf,
  basket, endField, result, remaining, secondsLeft, COLS, ROWS, ARK_COLS,
} from '../game/field.js';
import { ITEM_BY_ID } from '../data/items.js';

/* ------------------------------------------------------------------- layout */

const FX = 16;                       // the field's left edge
const FY = 58;                       // and its top
const FW = COLS * TILE;              // 928
const FH = ROWS * TILE;              // 352
const BAR_Y = FY + FH + 4;           // the tray
const HUD_H = 54;

export function makeIslandScene() {
  let v = null, island = null, onDone = null;
  let f = null;
  let t = 0, intro = 0, outro = -1;
  let parts = null;
  let hoverTile = null;
  let flash = 0, shake = 0;
  let dollRects = [], deckRects = [], appleRects = [], castRect = null;
  let floorCv = null, floorRev = -1;

  /* ----------------------------------------------------------- the floor bake */

  /**
   * Bake the whole floor, props included.
   *
   * Props are drawn back to front by row: a tree is one and a half tiles tall so it hangs
   * up over the row behind it, and drawing them in grid order would put the far one in
   * front of the near one.
   */
  function bakeFloor() {
    if (!floorCv) floorCv = makeCanvas(FW, FH + PROP_HEIGHT);
    if (!floorCv) return;
    const g = floorCv.g;
    g.clearRect(0, 0, FW, FH + PROP_HEIGHT);
    const off = PROP_HEIGHT;              // props can stick up above row 0
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const k = f.grid[r * COLS + c];
        drawTile(g, c * TILE, off + r * TILE, k, island.biome, f.vari[r * COLS + c]);
      }
    }
    // broad tonal patches first, then the small stuff on top of them
    const open = (c, r) => {
      const k = f.grid[r * COLS + c];
      return k === T.GRASS || k === T.SAND || k === T.MUD;
    };
    drawPatches(g, 0, off, COLS, ROWS, island.biome, open);
    drawScatter(g, 0, off, COLS, ROWS, island.biome,
      (c, r) => walkable(f.grid[r * COLS + c]) && f.grid[r * COLS + c] !== T.DECK);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const k = f.grid[r * COLS + c];
        if (k === T.ROCK || k === T.BUSH || k === T.TREE || k === T.CLIFF) {
          drawProp(g, c * TILE, off + r * TILE, k, island.biome, f.vari[r * COLS + c]);
        }
      }
    }
    floorRev = f.rev || 0;
  }

  /** Tile under a screen point, or null. */
  function tileAtPoint(x, y) {
    const c = Math.floor((x - FX) / TILE);
    const r = Math.floor((y - FY) / TILE);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
    return { c, r };
  }
  const tx = (c) => FX + c * TILE;
  const ty = (r) => FY + r * TILE;

  /* ------------------------------------------------------------------ update */

  function finish() {
    if (outro >= 0) return;
    endField(f, f.floodCols >= COLS - ARK_COLS - 1 ? 'flood' : 'cast off');
    outro = 0;
    Audio.sfx(f.saved.length ? 'fanfare' : 'fail');
  }

  function pickDoll(id) {
    if (dollCharges(f, id) <= 0) { Audio.sfx('error'); return; }
    select(f, { kind: 'doll', id });
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

    const before = f.strikes.length;
    tickField(f, dt);
    if (f.strikes.length > before) { shake = 0.3; Audio.sfx('boss_sting'); }
    if (f.over) { finish(); return; }

    hoverTile = tileAtPoint(m.x, m.y);

    // --- keys: a number picks a doll, escape drops the selection
    const box = dollBox(v);
    for (let i = 0; i < Math.min(9, box.length); i++) {
      if (Input.pressed('Digit' + (i + 1))) pickDoll(box[i].id);
    }
    if (Input.pressed('Escape') || m.rightPressed) select(f, null);
    if (Input.pressed('Space') || Input.pressed('Enter')) { finish(); return; }

    if (!m.pressed) return;

    // --- the tray
    for (const dr of dollRects) {
      if (!UI.hover(dr.rect, m)) continue;
      pickDoll(dr.id);
      return;
    }
    for (const ar of deckRects) {
      if (!UI.hover(ar.rect, m)) continue;
      select(f, { kind: 'animal', id: ar.id });
      Audio.sfx('click');
      return;
    }
    for (const ar of appleRects) {
      if (!UI.hover(ar.rect, m)) continue;
      select(f, { kind: 'apple', id: ar.id });
      Audio.sfx('click');
      return;
    }
    if (castRect && UI.hover(castRect, m)) { finish(); return; }

    // --- the field
    if (hoverTile && f.sel) {
      const res = placeAt(f, hoverTile.c, hoverTile.r);
      if (res.ok) {
        flash = 0.35;
        Audio.sfx('crate_land');
        parts.burst('dust', tx(hoverTile.c) + TILE / 2, ty(hoverTile.r) + TILE / 2, { count: 8 });
      } else {
        Audio.sfx('error');
      }
    }
  }

  /* -------------------------------------------------------------------- draw */

  /** The sky and the far shore above the field, so the stage is somewhere. */
  function drawBackdrop(g) {
    const sky = (island.sky && island.sky[0]) || 'sky';
    rect(g, 0, 0, W, FY + 8, sky);
    rect(g, 0, FY - 14, W, 14, mix(P.water1, P[sky], 0.35));
    for (let i = 0; i < 22; i++) {
      const wx = (i * 47 + Math.round(t * 9)) % (W + 40) - 20;
      rect(g, wx, FY - 12 + (i % 3) * 4, 8, 2, 'water3');
    }
  }

  /** The water that is already over the field, plus the edge that is coming. */
  function drawFlood(g) {
    const edge = COLS - Math.floor(f.floodCols);
    if (edge >= COLS) return;
    const x0 = tx(Math.max(0, edge));
    // the surface: chunky moving dashes, because still water reads as a blue rectangle
    for (let r = 0; r < ROWS; r++) {
      const yy = ty(r);
      for (let i = 0; i < 8; i++) {
        const dx = ((t * 22 + i * 31 + r * 17) % (FX + FW - x0));
        rect(g, x0 + dx, yy + 6 + (i % 4) * 7, 10, 2, i % 3 ? 'water3' : 'foam');
      }
    }
    // THE EDGE ITSELF, bright and busy. It is the only thing on screen that is a deadline,
    // so it gets a hard white lip and a row of spray.
    rect(g, x0 - 2, FY, 4, FH, 'foam');
    for (let i = 0; i < 24; i++) {
      const yy = FY + ((t * 40 + i * 19) % FH);
      rect(g, x0 - 6 - (i % 3) * 3, yy, 4, 3, i % 2 ? 'white' : 'foam');
    }
  }

  /** A doll's ghost under the cursor, and whether it can go there. */
  function drawGhost(g) {
    if (!f.sel || !hoverTile) return;
    const { c, r } = hoverTile;
    if (f.sel.kind === 'doll') {
      const d = DOLL_BY_ID[f.sel.id];
      if (!d) return;
      const bad = canPlaceDoll(f, d, c, r);
      const cx = tx(c) + TILE / 2, cy = ty(r) + TILE - 2;
      // the radius FIRST, because that is the thing being decided
      const rr = radiusOf(f, d);
      if (rr > 0) {
        const rad = rr * TILE;
        const steps = Math.max(20, Math.round(rad / 3));
        for (let i = 0; i < steps; i++) {
          if (i % 3 === 2) continue;
          const a = (i / steps) * Math.PI * 2 + t * 0.6;
          rect(g, cx + Math.cos(a) * rad - 1, cy + Math.sin(a) * rad * 0.52 - 1, 2, 2,
            bad ? 'red1' : d.mark);
        }
      }
      rect(g, tx(c), ty(r), TILE, TILE, bad ? mix(P.red1, P.ink, 0.4) : mix(P[d.mark], P.ink, 0.55));
      tileFrame(g, tx(c), ty(r), bad ? 'red2' : d.mark);
      const prev = g.globalAlpha;
      g.globalAlpha = 0.7;
      drawDoll(g, d, cx, cy, t, { lit: !bad, tile: TILE });
      g.globalAlpha = prev;
      if (bad) {
        const lw = textW(bad.toUpperCase(), { font: 3 }) + 8;
        wash(g, cx - lw / 2, ty(r) - 14, lw, 12, 'ink', 0.85);
        text(g, bad.toUpperCase(), cx, ty(r) - 12, 'red2', { font: 3, center: true });
      }
    } else {
      const a = ANIMAL_BY_ID[f.sel.id];
      if (!a) return;
      const ab = abilityOf(a);
      rect(g, tx(c), ty(r), TILE, TILE, mix(P[ab.color], P.ink, 0.5));
      tileFrame(g, tx(c), ty(r), ab.color);
      const prev = g.globalAlpha;
      g.globalAlpha = 0.72;
      drawAnimal(g, a, tx(c) + TILE / 2, ty(r) + TILE - 3, { scale: 1 });
      g.globalAlpha = prev;
      text(g, ab.verb, tx(c) + TILE / 2, ty(r) - 12, ab.color, { font: 3, center: true });
    }
  }

  /** Everything that lives on the field, in back-to-front order by row. */
  function drawLive(g) {
    // dolls first: they are furniture, and animals walk in front of them
    for (const d of f.dolls) {
      drawDoll(g, d.d, tx(d.c - 0.5) + TILE / 2, ty(d.r - 0.5) + TILE - 2, t,
        { lit: d.lit, ring: true, tile: TILE });
    }
    // one sorted pass so a near animal covers a far one
    const bodies = [];
    for (const cr of f.animals) {
      if (cr.state === 'safe' || cr.state === 'lost') continue;
      bodies.push({ kind: 'a', r: cr.r, e: cr });
    }
    for (const m of f.monsters) bodies.push({ kind: 'm', r: m.r, e: m });
    bodies.sort((p, q) => p.r - q.r);
    for (const b of bodies) {
      const e = b.e;
      const x = FX + e.c * TILE, y = FY + e.r * TILE;
      if (b.kind === 'a') {
        drawAnimalShadow(g, x, y + 10, 1, { color: 'shadow' });
        drawAnimal(g, e.a, x, y, {
          scale: 1,
          walk: e.state === 'wander' ? 0 : e.walk,
          step: e.state === 'wander' ? 0 : undefined,
          flip: e.face < 0,
          mood: e.state === 'flee' ? 'scared' : e.led > 0 ? 'happy' : 'idle',
          blink: (e.blink % 4) < 0.12 ? 1 : 0,
          wet: e.wet > 0.4 ? e.wet : 0,
          rain: f.rain > 0.6 ? f.rain : 0,
          t,
        });
        // led animals get a chevron: the one bit of state you must be able to read at a
        // glance, because it tells you whether a doll you spent is doing anything
        if (e.led > 0 || e.state === 'lead') {
          for (let i = 0; i < 2; i++) {
            const k = ((t * 1.6 + i * 0.5) % 1);
            rect(g, x - 10 - k * 8, y - 20 + i * 3, 5, 2, 'gold');
          }
        }
        if (e.loyal) rect(g, x + 8, y - 16, 4, 4, 'red2');
      } else {
        drawMonster(g, e.def, x, y + 12, t, {
          size: e.def.size, flip: e.face < 0, scare: true, tile: TILE, calm: e.calm,
        });
      }
    }
    for (const s of f.strikes) drawStrike(g, tx(s.c) + TILE / 2, ty(s.r) + TILE - 4, s.t / 0.34);
    for (const p of f.puffs) {
      const k = p.t / 0.6;
      const a = (p.i / 6) * Math.PI * 2;
      rect(g, FX + p.c * TILE + Math.cos(a) * k * 18 - 2, FY + p.r * TILE + Math.sin(a) * k * 12 - 2,
        4, 4, k > 0.6 ? 'clay1' : 'clay3');
    }
  }

  /** Rain. Lots of it, which is the whole mood of the game. */
  function drawRain(g) {
    const n = Math.round(30 + f.rain * 110);
    for (let i = 0; i < n; i++) {
      const sp = 260 + (i % 5) * 90;
      const x = ((i * 137 + Math.round(t * 90)) % (FW + 120)) - 60;
      const y = ((i * 71 + Math.round(t * sp)) % (FH + 40)) - 20;
      rect(g, FX + x, FY + y, 2, 7, i % 6 === 0 ? 'white' : 'ice');
    }
    // and splashes where it lands
    for (let i = 0; i < Math.round(f.rain * 26); i++) {
      const x = (i * 211 + Math.round(t * 40)) % FW;
      const y = (i * 97 + Math.round(t * 13)) % FH;
      if (((t * 3 + i) % 1) > 0.3) continue;
      rect(g, FX + x, FY + y, 6, 2, 'foam');
    }
  }

  /** The golem, on his own deck, pointing. */
  function drawKeeper(g) {
    const gx = FX + TILE, gy = FY + FH - 8;
    const wet = f.rain > 0.5;
    const pose = f.sel ? 'react' : f.dolls.length ? 'happy' : 'idle';
    drawFolk(g, 'golem', gx, gy, t, {
      scale: 2, pose, mud: wet ? 0.9 : 0.4, wet: wet ? 1 : 0,
    });
    // the wand, pointed at whatever the cursor is over
    const hx = gx + 22, hy = gy - 52;
    let ang = -0.4;
    if (hoverTile) ang = Math.atan2(ty(hoverTile.r) + TILE / 2 - hy, tx(hoverTile.c) + TILE / 2 - hx);
    drawWand(g, hx, hy, ang, f.sel ? 0.7 + Math.sin(t * 7) * 0.3 : 0, t, { scale: 2 });
  }

  /* --------------------------------------------------------------------- HUD */

  /** A two-pixel frame round one tile. Used for the placement cursor. */
  function tileFrame(g, x, y, c) {
    rect(g, x, y, TILE, 2, c); rect(g, x, y + TILE - 2, TILE, 2, c);
    rect(g, x, y, 2, TILE, c); rect(g, x + TILE - 2, y, 2, TILE, c);
  }

  /**
   * The top bar. Its whole job is ONE NUMBER -- seconds until the water is here -- so that
   * number is the biggest thing on screen after the field itself.
   */
  function drawTopBar(g) {
    UI.panel(g, 0, 0, W, HUD_H, { style: 'wood', flat: true });
    text(g, island.name.toUpperCase(), 10, 6, 'cream', { font: 7 });
    text(g, `${island.biome} · danger ${island.danger}`, 10, 32, 'parch1', { font: 3 });

    // THE CLOCK, and it is the biggest thing up here on purpose. Everything else in this
    // bar is a score; this is a deadline, and it is the only number the player has to
    // arithmetic against while deciding where a doll goes.
    const left = secondsLeft(f);
    const frac = clamp(1 - left / f.limit, 0, 1);
    const bx = 206, bw = 286;
    text(g, 'THE WATER IS COMING', bx, 4, 'parch1', { font: 3 });
    rect(g, bx, 16, bw, 16, 'deep');
    rect(g, bx, 16, Math.round(bw * frac), 16, frac > 0.72 ? 'red1' : 'water2');
    // a chunky lip on the leading edge, the same read as the flood edge on the field
    rect(g, bx + Math.round(bw * frac) - 2, 16, 4, 16, 'foam');
    for (let i = 0; i < 6; i++) {
      const wx = bx + ((Math.round(t * 26) + i * 48) % Math.max(1, Math.round(bw * frac)));
      rect(g, wx, 20 + (i % 3) * 4, 8, 2, 'water3');
    }
    UI.boxEdge(g, bx - 2, 14, bw + 4, 20, 'wood0');
    const secs = Math.ceil(left);
    text(g, `${secs}s`, bx + bw + 12, 12, secs <= 12 ? 'red2' : 'cream',
      { font: 7, wave: secs <= 12 ? 1 : 0, t });

    // the ledger, three columns that do not touch
    const cols = [
      { x: 566, icon: 'leaf', n: f.saved.length, label: 'SAVED', c: 'leaf4' },
      { x: 646, icon: 'wave', n: f.lost.length, label: 'LOST', c: f.lost.length ? 'red2' : 'grey2' },
    ];
    for (const c of cols) {
      UI.icon(g, c.icon, c.x, 14, { color: c.c });
      text(g, String(c.n), c.x + 22, 10, c.c, { font: 7 });
      text(g, c.label, c.x, 34, 'parch1', { font: 3 });
    }
    const free = berthsFree(v);
    text(g, `${v.aboard.length}/${v.aboard.length + free}`, 722, 10, free ? 'brass3' : 'red2', { font: 7 });
    text(g, 'BERTHS', 722, 34, free ? 'parch1' : 'red2', { font: 3 });

    const rem = remaining(f);
    text(g, String(rem), W - 12, 10, rem ? 'gold' : 'leaf4', { font: 7, right: true });
    text(g, 'STILL ASHORE', W - 12, 34, 'parch1', { font: 3, right: true });
  }

  /**
   * The tray: the doll box, the deck, and the way out.
   *
   * Each doll shows its emblem, its name, its rule in one line, and how many charges are
   * left this stage. The rule is on the button rather than in a tooltip on purpose -- the
   * game is choosing between rules, and a rule you have to hover to read is a rule you will
   * not factor in.
   */
  function drawTray(g) {
    const by = BAR_Y;
    const bh = H - by;
    UI.panel(g, 0, by, W, bh, { style: 'wood' });
    dollRects = [];
    deckRects = [];

    const box = dollBox(v);
    const bw = 128, bhh = 46;
    text(g, 'CLAY DOLLS', 10, by + 5, 'parch1', { font: 3 });
    for (let i = 0; i < box.length; i++) {
      const bx = 10 + i * (bw + 4);
      if (bx + bw > W - 150) break;
      const r0 = UI.rectOf(bx, by + 18, bw, bhh);
      const left = dollCharges(f, box[i].id);
      const on = f.sel && f.sel.kind === 'doll' && f.sel.id === box[i].id;
      const hot = UI.hover(r0, Input.mouse);
      const d = box[i].def;
      rect(g, r0.x, r0.y, r0.w, r0.h, on ? mix(P[d.mark], P.ink, 0.55) : left ? 'wood1' : 'wood0');
      UI.boxEdge(g, r0.x, r0.y, r0.w, r0.h, on ? d.mark : hot ? 'brass3' : 'wood0');
      // a pale niche for the figure to stand in. A clay doll on dark wood at 20x28 is a
      // smudge; against parchment it is a doll.
      rect(g, r0.x + 4, r0.y + 4, 26, r0.h - 8, left ? 'parch0' : 'shadow');
      drawDoll(g, d, r0.x + 17, r0.y + r0.h - 5, t, { lit: on || hot, tile: TILE });
      text(g, d.name.replace(' Doll', '').toUpperCase(), r0.x + 34, r0.y + 6,
        left ? 'cream' : 'grey1', { font: 5 });
      text(g, `${i + 1}`, r0.x + r0.w - 8, r0.y + 5, 'parch1', { font: 3, right: true });
      // the charges, as pips: a number you count is slower than pips you see
      for (let k = 0; k < Math.min(6, d.charges); k++) {
        rect(g, r0.x + 34 + k * 7, r0.y + 24, 5, 5, k < left ? d.mark : mix(P.ink, P.wood1, 0.4));
      }
      text(g, left ? `x${left}` : 'NONE LEFT', r0.x + 34, r0.y + 33, left ? 'parch1' : 'red2', { font: 3 });
      dollRects.push({ rect: r0, id: box[i].id });
    }

    // the deck: an animal you can put down to use its ability
    text(g, 'ON DECK · PUT ONE DOWN TO USE IT', 10, by + 70, 'parch1', { font: 3 });
    const held = v.aboard || [];
    for (let i = 0; i < held.length; i++) {
      const a = ANIMAL_BY_ID[held[i]];
      if (!a) continue;
      const bx = 10 + i * 46;
      if (bx > W - 200) break;
      const r0 = UI.rectOf(bx, by + 82, 42, 40);
      const on = f.sel && f.sel.kind === 'animal' && f.sel.id === held[i];
      const ab = abilityOf(a);
      rect(g, r0.x, r0.y, r0.w, r0.h, on ? mix(P[ab.color], P.ink, 0.5) : 'wood1');
      UI.boxEdge(g, r0.x, r0.y, r0.w, r0.h, on ? ab.color : 'wood0');
      drawAnimalIcon(g, a, r0.x + 21, r0.y + 15, { size: 16 });
      text(g, ab.verb.slice(0, 5), r0.x + 21, r0.y + 27, ab.color, { font: 3, center: true });
      deckRects.push({ rect: r0, id: held[i] });
    }

    // THE BASKET. Two apples, three at most, and each one is a whole decision -- so they
    // get their own row rather than being buried in a menu.
    appleRects = [];
    const apples = basket(f);
    const ax0 = 230;
    text(g, 'BASKET', ax0, by + 70, 'parch1', { font: 3 });
    for (let i = 0; i < Math.max(2, apples.length); i++) {
      const r0 = UI.rectOf(ax0 + i * 46, by + 82, 42, 40);
      const id = apples[i];
      const it = id && ITEM_BY_ID[id];
      const on = it && f.sel && f.sel.kind === 'apple' && f.sel.id === id;
      rect(g, r0.x, r0.y, r0.w, r0.h, on ? mix(P.red1, P.ink, 0.4) : it ? 'wood1' : mix(P.wood0, P.wood1, 0.5));
      UI.boxEdge(g, r0.x, r0.y, r0.w, r0.h, on ? 'red2' : it ? 'wood0' : 'wood0');
      if (it) {
        disc(g, r0.x + 21, r0.y + 15, 8, it.color || 'red2');
        rect(g, r0.x + 20, r0.y + 5, 2, 4, 'leaf1');
        text(g, it.short, r0.x + 21, r0.y + 27, 'cream', { font: 3, center: true });
        appleRects.push({ rect: r0, id });
      } else {
        text(g, 'EMPTY', r0.x + 21, r0.y + 16, 'wood2', { font: 3, center: true });
      }
    }

    // whatever is selected, explained. The rule is the game; it does not belong in a
    // tooltip you have to hover to find.
    if (f.sel) {
      const sx0 = 430, sy0 = by + 70;
      let title = '', rule = '', c = 'cream';
      if (f.sel.kind === 'doll') {
        const d = DOLL_BY_ID[f.sel.id];
        title = d.name.toUpperCase(); rule = d.rule; c = d.mark;
      } else if (f.sel.kind === 'apple') {
        const it = ITEM_BY_ID[f.sel.id];
        title = it.name.toUpperCase(); rule = it.blurb || ''; c = it.color || 'red2';
      } else {
        const a = ANIMAL_BY_ID[f.sel.id];
        const ab = abilityOf(a);
        title = `${a.name.toUpperCase()} — ${ab.verb}`; rule = ab.blurb; c = ab.color;
      }
      text(g, title, sx0, sy0, c, { font: 5 });
      text(g, rule, sx0, sy0 + 16, 'parch1', { font: 3 });
      text(g, 'CLICK THE FIELD TO PUT IT DOWN  ·  ESC TO CHANGE YOUR MIND', sx0, sy0 + 30,
        'brass2', { font: 3 });
    }

    // the way out
    castRect = UI.rectOf(W - 176, by + 18, 166, 46);
    UI.button(g, castRect, 'CAST OFF', {
      hot: UI.hover(castRect, Input.mouse), color: 'rust', font: 7,
    });
    text(g, remaining(f) ? `${remaining(f)} LEFT BEHIND` : 'ALL ABOARD', W - 93, by + 68,
      remaining(f) ? 'red2' : 'leaf4', { font: 3, center: true });

    // the last few things that happened
    for (let i = 0; i < f.notes.length; i++) {
      const n = f.notes[i];
      const a = clamp(1.6 - n.t * 0.5, 0, 1);
      if (a <= 0) continue;
      const prev = g.globalAlpha;
      g.globalAlpha = a;
      text(g, n.text, W - 190, by + 82 + i * 12, n.color, { font: 3, right: true });
      g.globalAlpha = prev;
    }
  }

  /** The end card. */
  function drawOutro(g) {
    wash(g, 0, 0, W, H, 'ink', clamp(outro * 1.6, 0, 0.78));
    const pw = 470, ph = 210;
    const px = (W - pw) / 2, py = (H - ph) / 2;
    UI.panel(g, px, py, pw, ph, { style: 'paper' });
    UI.panelTitle(g, px, py, pw, f.why === 'clear' ? 'THE ISLAND IS EMPTY' : 'THE WATER CAME');
    text(g, `${f.saved.length} ABOARD`, px + 24, py + 54, 'leaf4', { font: 7 });
    text(g, `${f.lost.length} LOST`, px + 24, py + 82, f.lost.length ? 'red2' : 'grey2', { font: 7 });
    let yy = py + 118;
    for (const id of f.saved.slice(0, 8)) {
      const a = ANIMAL_BY_ID[id];
      if (a) drawAnimalIcon(g, a, px + 30 + (f.saved.indexOf(id) % 8) * 24, yy, { size: 16 });
    }
    yy += 30;
    text(g, 'CLICK TO SAIL', px + pw / 2, py + ph - 26, 'rust', { font: 7, center: true });
  }

  function draw(g) {
    const sh = shake > 0 ? Math.round(Math.sin(t * 60) * 3) : 0;
    if (!floorCv || floorRev !== (f.rev || 0)) bakeFloor();

    rect(g, 0, 0, W, H, 'deep');
    drawBackdrop(g);

    g.save();
    g.beginPath();
    g.rect(FX, FY, FW, FH);
    g.clip();
    g.translate(sh, 0);
    if (floorCv) g.drawImage(floorCv.canvas, FX, FY - PROP_HEIGHT);
    drawFlood(g);
    drawGhost(g);
    drawLive(g);
    parts.draw(g);
    drawRain(g);
    drawKeeper(g);
    g.restore();

    // a two-pixel border, so the field is a place and not a hole in the UI
    UI.boxEdge(g, FX - 2, FY - 2, FW + 4, FH + 4, 'wood0');

    if (flash > 0) wash(g, FX, FY, FW, FH, 'white', flash * 0.18);
    drawTopBar(g);
    drawTray(g);
    if (intro < 1) wash(g, 0, 0, W, H, 'ink', 1 - intro);
    if (outro >= 0) drawOutro(g);
  }

  return {
    enter(args) {
      v = args.voyage || args.run;
      island = args.island || (v && v.at);
      onDone = args.onDone;
      f = newField(v, island, args.tag);
      t = 0; intro = 0; outro = -1;
      hoverTile = null; flash = 0; shake = 0;
      floorCv = null; floorRev = -1;
      parts = createParticles({ limit: 220, seed: v.seed + '/field' });
      Audio.music(island.danger >= 3 ? 'deck_tense' : 'deck');
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,
    debug() {
      return {
        voyage: v, island, field: f,
        get sel() { return f && f.sel; },
        get hover() { return hoverTile; },
        finish,
        pick: (id) => pickDoll(id),
        put: (c, r) => placeAt(f, c, r),
        tileAt: (x, y) => tileAtPoint(x, y),
        at: (c, r) => ({ x: tx(c) + TILE / 2, y: ty(r) + TILE / 2 }),
        rects: { dolls: dollRects, deck: deckRects, basket: appleRects, cast: castRect },
      };
    },
  };
}

void lerp; void disc; void line; void walkable; void ARK_COLS;

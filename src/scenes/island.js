// THE ISLAND — where a rescue is played.
//
// Layout, and every part of it is doing a job:
//
//   the backdrop      the island's own sky, sea and shoreline, baked once. You should
//                     know which biome you are on before you read a word.
//   the moored hull    down the left edge, three open pens. That is home, and it is
//                     drawn as the boat's side rather than as a goal line because
//                     "get it into the pen" needs no explaining.
//   the field          the last of the island, with the animals and what is in the way.
//   the water          coming in from the right. Everything behind that line is gone.
//   the rail           along the bottom: who you are carrying, and what each one opens.
//
// The golem stands on the hull with the shepherd wand. Aim by dragging BACK from an
// animal -- pull the crook away and let it go, which is the same gesture as a catapult
// and needs no tutorial -- and the wand's light winds up as you pull.

import { P, col, mix } from '../core/palette.js';
import {
  rect, frame, px, line, disc, ring, ellipse, text, textW, wrap, wash, dashLine,
  clamp, lerp, W, H,
} from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import * as UI from '../render/uikit.js';
import { drawAnimal, drawAnimalShadow } from '../render/sprites.js';
import { drawFolk, drawWand } from '../render/folk.js';
import { drawIslandBack } from '../render/islandart.js';
import { drawObstacle } from '../render/obstacles.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { abilityOf, ABILITY_BY_ID } from '../data/abilities.js';
import { ITEM_BY_ID } from '../data/items.js';
import { berthsFree, capacity, isLoyal, holdSize } from '../game/voyage.js';
import {
  newRescue, update as tickRescue, flick, placeHelper, useApple, endRescue, result,
  advanceTide, tideX, remaining, isSettled, shotPower, note,
  FIELD_W, FIELD_H, GANGWAY_X, BALL_R,
} from '../game/rescue.js';

const HUD_H = 40;
const FX = 40, FY = 176;                  // the field's top-left on screen
const RAIL_Y = 490, RAIL_H = 46;
const MAX_PULL = 210;                     // drag distance for full power

const sx = (x) => FX + x;
const sy = (y) => FY + y;

export function makeIslandScene() {
  let v = null, island = null, onDone = null;
  let r = null, parts = null;
  let t = 0, intro = 0, outro = -1;
  let aim = null;                          // {entry, angle, power}
  let held = null;                         // an animal picked off the rail
  let holdingApple = null;                 // an item id picked out of the basket
  let hoverOb = -1, hoverStrand = -1, hoverRail = -1;
  let railRects = [], appleRects = [], castRect = UI.rectOf(0, 0, 0, 0);
  let shake = 0;

  /* ------------------------------------------------------------------ helpers */

  function ballAt(mx, my) {
    let best = -1, bd = 22 * 22;
    r.strand.forEach((s, i) => {
      if (s.state !== 'ashore' || s.ball.sunk) return;
      const dx = sx(s.ball.x) - mx, dy = sy(s.ball.y) - my;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function obAt(mx, my) {
    let best = -1, bd = Infinity;
    r.obstacles.forEach((o, i) => {
      const dx = sx(o.x) - mx, dy = sy(o.y) - my;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < o.r + 8 && d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /** The animals aboard that can be put down, in a stable order. */
  function carried() {
    return v.aboard.map((id) => ({ id, a: ANIMAL_BY_ID[id] })).filter((e) => e.a);
  }

  function finish() {
    if (outro >= 0) return;
    endRescue(r, r.tide >= 1 ? 'the water closed over the last of it' : 'cast off');
    outro = 0;
    Audio.sfx(r.rescued.length ? 'fanfare' : 'fail');
  }

  /* --------------------------------------------------------------------- draw */

  /** The boat's side, down the left edge: planks, a rail, and three open pens. */
  function drawHull(g) {
    const x0 = sx(0), x1 = sx(GANGWAY_X);
    const full = berthsFree(v) <= 0;
    // water the hull sits in
    for (let y = FY; y < FY + FIELD_H; y++) {
      const f = (y - FY) / FIELD_H;
      rect(g, x0 - 22, y, 22, 1, f % 0.2 < 0.1 ? 'water1' : 'water0');
    }
    for (let i = 0; i < 14; i++) {
      const wy = FY + ((t * 16 + i * 24) % FIELD_H);
      rect(g, x0 - 20, Math.round(wy), 6, 1, 'water3');
    }
    // the hull: vertical planking, dark, with a lit rail on the field side
    for (let x = x0 - 8; x < x1; x++) {
      const f = (x - (x0 - 8)) / (x1 - x0 + 8);
      rect(g, x, FY, 1, FIELD_H, f < 0.2 ? 'wood0' : f < 0.6 ? 'wood1' : 'wood2');
    }
    for (let y = FY; y < FY + FIELD_H; y += 7) rect(g, x0 - 8, y, x1 - x0 + 8, 1, 'wood0');
    rect(g, x1 - 3, FY, 3, FIELD_H, 'wood3');
    rect(g, x1 - 1, FY, 1, FIELD_H, 'wood4');

    // three pens, which are the capture mouths
    for (let i = 0; i < 3; i++) {
      const cy = sy((i + 0.5) * (FIELD_H / 3));
      const h2 = 40;
      rect(g, x1 - 26, cy - h2, 26, h2 * 2, full ? 'wood1' : 'wood2');
      rect(g, x1 - 26, cy - h2, 26, 1, 'wood3');
      rect(g, x1 - 26, cy + h2 - 1, 26, 1, 'wood0');
      // the gate posts, open or barred
      for (let k = -1; k <= 1; k += 2) {
        rect(g, x1 - 4, cy + k * h2 - 3, 6, 6, 'wood3');
      }
      if (full) {
        for (let k = 0; k < 4; k++) rect(g, x1 - 3, cy - h2 + 8 + k * 20, 5, 3, 'red0');
      } else {
        // an inviting slope of straw at the mouth
        for (let k = 0; k < 5; k++) {
          rect(g, x1, cy - 12 + k * 6, 5 - k, 2, 'hay' in P ? 'hay' : 'sand');
        }
        ring(g, x1 + 2, cy, 14 + Math.round(Math.sin(t * 2 + i) * 2), 'brass2', 1);
      }
      // whoever is already in there, peering out
      const pen = v.aboard.slice(i * 3, i * 3 + 2);
      pen.forEach((id, k) => {
        const a = ANIMAL_BY_ID[id];
        if (!a) return;
        drawAnimal(g, a, x1 - 16, cy - 12 + k * 22, { scale: 1, mood: 'happy' });
      });
    }
    if (full) {
      const msg = 'PENS FULL';
      wash(g, x0 - 6, FY + FIELD_H / 2 - 8, 46, 14, 'ink', 0.8);
      text(g, msg, x0 - 2, FY + FIELD_H / 2 - 5, 'red2', { font: 3 });
    }
  }

  /** The water coming in from the right, and everything it has already taken. */
  function drawWater(g) {
    const line0 = tideX(r);
    const px0 = Math.round(sx(line0));
    const right = sx(FIELD_W);
    if (px0 >= right) return;
    const left = Math.max(sx(0), px0);

    // A SHORELINE, not a wall. The first forty pixels are the ground seen through
    // shallow water -- a wash, so the tufts and stones you were just playing on are
    // still there under it -- and only past that does it go opaque and deep. Flat
    // vertical bands of blue read as a colour swatch sliding across the screen.
    const shallow = Math.min(right, px0 + 40);
    for (let x = left; x < shallow; x++) {
      wash(g, x, FY, 1, FIELD_H, 'water2', 0.22 + ((x - px0) / 40) * 0.5);
    }
    // past the shallows the water is painted in ROWS, not columns. Columns of three
    // tones read as a gradient swatch sliding in from the edge; rows read as a surface,
    // because a surface is a thing you see along.
    if (shallow < right) {
      // One flat base, then a field of SHORT DASHES placed by a hash. Long smooth
      // offsets per row made snaking marble; whole rows in three tones made a stack of
      // panels; whole columns made a gradient swatch. Scattered dashes are what pixel
      // water actually is, and it is three hundred calls.
      const dw = right - shallow;
      rect(g, shallow, FY, dw, FIELD_H, 'water1');
      const drift = Math.floor(t * 9);
      for (let i = 0; i < 300; i++) {
        const hy = FY + ((i * 47 + ((i * 13) % 7)) % FIELD_H);
        const hx = shallow + ((i * 197 + drift * (1 + (i % 3))) % Math.max(1, dw - 10));
        const k = (i * 29) % 10;
        const len = 2 + (k % 4);
        if (k < 4) rect(g, hx, hy, len + 2, 1, 'water2');
        else if (k < 7) rect(g, hx, hy, len, 1, 'water0');
        else px(g, hx, hy, 'water3');
      }
      // the far edge goes dark: the ocean this island is disappearing into
      for (let x = right - 44; x < right; x++) {
        wash(g, x, FY, 1, FIELD_H, 'ink', ((x - (right - 44)) / 44) * 0.34);
      }
    }
    // crests running with the tide, thicker further out
    for (let i = 0; i < 22; i++) {
      const ph = (t * 0.3 + i / 22) % 1;
      const x = px0 + 8 + ph * (right - px0 - 12);
      const y = FY + 6 + ((i * 53) % (FIELD_H - 12));
      rect(g, Math.round(x), y, 4 + Math.round(ph * 5), 1, ph < 0.3 ? 'water3' : 'foam');
    }
    // the edge itself: a lace of foam that moves, not a straight line
    for (let y = FY; y < FY + FIELD_H; y++) {
      const wob = Math.round(Math.sin(y * 0.13 + t * 2.1) * 3 + Math.sin(y * 0.41 - t * 1.3) * 2);
      const ex = px0 + wob;
      rect(g, ex, y, 3, 1, 'foam');
      px(g, ex - 1, y, 'white');
      if ((y + Math.floor(t * 6)) % 9 === 0) px(g, ex - 3, y, 'foam');
    }
    // wet sand just ahead of it
    wash(g, px0 - 16, FY, 16, FIELD_H, 'wood1', 0.2);
  }

  function drawField(g) {
    const wetWeather = island.weather === 'rain' || island.weather === 'storm';
    // the ground the level is played on comes from the baked backdrop; all this adds is
    // the boundary, so a flick that bounces has something visible to bounce off
    frame(g, FX - 1, FY - 1, FIELD_W + 2, FIELD_H + 2, 'wood0');
    rect(g, FX, FY + FIELD_H, FIELD_W, 2, mix(P.wood0, P.ink, 0.4));

    // obstacles first: they are the terrain
    r.obstacles.forEach((o, i) => {
      drawObstacle(g, o, sx(o.x), sy(o.y), t, {});
      if (i === hoverOb) ring(g, sx(o.x), sy(o.y), o.r + 4, o.cleared ? 'leaf3' : 'white', 1);
    });

    // the animals you put down, standing where they opened something
    for (const hp of r.helpers) {
      const a = ANIMAL_BY_ID[hp.animalId];
      if (!a) continue;
      const ab = ABILITY_BY_ID[hp.ability];
      drawAnimalShadow(g, sx(hp.x), sy(hp.y) + 12, 1);
      drawAnimal(g, a, sx(hp.x), sy(hp.y), {
        scale: 1, mood: 'happy',
        wet: wetWeather ? 0.6 : 0,
        rain: wetWeather ? 0.5 : 0,
        t,
      });
      if (ab) UI.icon(g, ab.icon, sx(hp.x) - 4, sy(hp.y) + 14, { color: ab.color });
    }

    // the stranded
    r.strand.forEach((s, i) => {
      if (s.state === 'aboard') return;
      const b = s.ball;
      if (s.state === 'drowned') {
        // a ring of bubbles where it went, for one beat
        ring(g, sx(b.x), sy(b.y), 6, 'water3', 1);
        return;
      }
      const a = ANIMAL_BY_ID[s.animalId];
      if (!a) return;
      const moving = !b.resting;
      drawAnimalShadow(g, sx(b.x), sy(b.y) + 11, 1);
      drawAnimal(g, a, sx(b.x), sy(b.y), {
        scale: 1,
        roll: moving ? b.angle : 0,
        squash: b.squash,
        mood: moving ? 'scared' : 'idle',
        wet: s.wet || 0,                 // decays after it leaves the water, so it drips
        rain: wetWeather ? 0.7 : 0,
        t,
      });
      if (isLoyal(v, s.animalId)) UI.icon(g, 'heart', sx(b.x) + 8, sy(b.y) - 16, { color: 'gold' });
      else {
        // whoever the water reaches next gets a warning, because "in what order" is the
        // only question the level asks and the answer must be visible
        const togo = (b.x - tideX(r)) / -1;
        if (togo < 90 && togo > -999) {
          const pulse = 0.5 + Math.sin(t * 6) * 0.5;
          ring(g, sx(b.x), sy(b.y), 19 + Math.round(pulse * 2), togo < 40 ? 'red2' : 'amber', 1);
          if (togo < 40) UI.icon(g, 'wave', sx(b.x) - 4, sy(b.y) - 26, { color: 'red2' });
        }
      }
      if (i === hoverStrand && isSettled(r.world)) {
        ring(g, sx(b.x), sy(b.y), 17 + Math.round(Math.sin(t * 5) * 1), 'white', 1);
        const nm = a.name;
        const w = textW(nm, { font: 3 }) + 6;
        wash(g, sx(b.x) - w / 2, sy(b.y) - 30, w, 10, 'ink', 0.72);
        text(g, nm, sx(b.x), sy(b.y) - 28, 'cream', { font: 3, center: true });
      }
    });
  }

  /** The golem on the hull, and the crook he is pointing with. */
  function drawShepherd(g) {
    const gx = sx(GANGWAY_X) + 6;
    const gy = FY + FIELD_H - 4;
    const pose = aim ? 'react' : r.over ? 'happy' : 'idle';
    // in the rain he is a wet riverbank, which is the whole joke of him
    const wetWeather = island.weather === 'rain' || island.weather === 'storm';
    drawFolk(g, 'golem', gx, gy, t, {
      scale: 2, pose, mud: wetWeather ? 0.9 : 0.4, wet: wetWeather ? 1 : 0,
    });
    // the hand, and the wand in it
    const hx = gx + 22, hy = gy - 52;
    let ang = -0.5, ch = 0;
    if (aim) {
      ang = aim.angle;
      ch = aim.power;
    } else if (hoverStrand >= 0) {
      const s = r.strand[hoverStrand];
      ang = Math.atan2(sy(s.ball.y) - hy, sx(s.ball.x) - hx);
    }
    drawWand(g, hx, hy, ang, ch, t, { scale: 2 });
  }

  /** The aim: a short dotted lead and a power ring on the animal itself. */
  function drawAim(g) {
    if (!aim) return;
    const s = aim.entry;
    const bx = sx(s.ball.x), by = sy(s.ball.y);
    const len = 26 + aim.power * 54;
    const tx = bx + Math.cos(aim.angle) * len;
    const ty = by + Math.sin(aim.angle) * len;
    dashLine(g, bx, by, tx, ty, 'magic2', 3, 3, Math.floor(t * 12));
    // the arrowhead
    for (let k = -1; k <= 1; k += 2) {
      const a2 = aim.angle + Math.PI + k * 0.45;
      line(g, tx, ty, tx + Math.cos(a2) * 7, ty + Math.sin(a2) * 7, 'magic1');
    }
    // power, drawn on the animal so the eye never has to leave it
    ring(g, bx, by, 19, 'ink', 1);
    const seg = Math.round(aim.power * 16);
    for (let i = 0; i < seg; i++) {
      const a2 = -Math.PI / 2 + (i / 16) * Math.PI * 2;
      px(g, bx + Math.cos(a2) * 19, by + Math.sin(a2) * 19,
        aim.power > 0.8 ? 'red2' : aim.power > 0.45 ? 'gold' : 'magic1');
    }
    text(g, `${Math.round(aim.power * 100)}%`, bx, by + 24, 'cream',
      { font: 3, center: true, shadow: 'ink' });
  }

  function drawHud(g) {
    UI.panel(g, 0, 0, W, HUD_H, { style: 'wood', shadow: true, corners: false });
    text(g, island.name.toUpperCase(), 12, 5, 'cream', { font: 7, shadow: 'ink' });
    text(g, `${island.biome} · danger ${island.danger}`, 12, 24, 'parch1', { font: 3 });

    // the tide, which is the clock
    const gx = 250, gw = 250;
    text(g, 'THE WATER', gx, 4, 'parch1', { font: 3 });
    UI.bar(g, gx, 13, gw, 12, r.tide, {
      fill: r.tide > 0.72 ? 'red2' : r.tide > 0.44 ? 'amber' : 'water2',
      bg: 'wood0', frame: 'wood0', stripe: r.tide > 0.72,
    });
    const moves = Math.max(0, Math.ceil((1 - r.tide) / r.step));
    text(g, `${moves} move${moves === 1 ? '' : 's'} before it is over you`, gx, 27, 'parch1', { font: 3 });

    // the tally
    let x = 528;
    UI.icon(g, 'heart', x, 12, { color: 'leaf3' });
    text(g, String(r.rescued.length), x + 12, 12, 'leaf4', { font: 7 });
    UI.icon(g, 'skull', x + 40, 12, { color: 'red1' });
    text(g, String(r.drowned.length), x + 52, 12, 'red2', { font: 7 });
    text(g, 'SAVED', x, 26, 'parch1', { font: 3 });
    text(g, 'LOST', x + 40, 26, 'parch1', { font: 3 });

    // berths
    x = 636;
    text(g, 'BERTHS', x, 4, 'parch1', { font: 3 });
    UI.segBar(g, x, 13, 78, 10, Math.min(14, capacity(v)), Math.min(14, v.aboard.length),
      { fill: berthsFree(v) ? 'brass2' : 'red2' });
    text(g, `${v.aboard.length}/${capacity(v)}`, x, 26, 'parch1', { font: 3 });

    // the apple basket, two slots as the user asked for -- the hold grows it later
    appleRects = [];
    const bx = 730;
    text(g, 'BASKET', bx, 4, 'parch1', { font: 3 });
    // as many slots as the hold actually HAS, not as many as happen to be full: the
    // basket is where the player checks what they can still spend
    const slots = Math.max(2, Math.min(6, holdSize(v)));
    for (let i = 0; i < slots; i++) {
      const rct = UI.rectOf(bx + i * 22, 12, 20, 20);
      appleRects[i] = rct;
      const id = v.hold[i];
      const item = id ? ITEM_BY_ID[id] : null;
      rect(g, rct.x, rct.y, rct.w, rct.h, id ? 'wood2' : 'wood0');
      frame(g, rct.x, rct.y, rct.w, rct.h, holdingApple === id && id ? 'gold' : 'wood3');
      if (item) {
        disc(g, rct.x + 10, rct.y + 11, 6, item.color || 'red1');
        px(g, rct.x + 8, rct.y + 8, 'white');
        rect(g, rct.x + 10, rct.y + 4, 1, 3, 'wood1');
        px(g, rct.x + 12, rct.y + 4, 'leaf2');
      } else {
        // the empty weave of the basket
        for (let k = 2; k < 18; k += 4) rect(g, rct.x + 2, rct.y + k, 16, 1, 'wood1');
      }
    }

    // when the pens fill, the rest of the island is lost and the game says so once,
    // loudly, instead of letting the player keep flicking animals at a shut door
    const rem = remaining(r).length;
    if (berthsFree(v) <= 0 && rem && !r.over) {
      const msg = 'NO ROOM LEFT — CAST OFF';
      const mw = textW(msg, { font: 7 }) + 24;
      const mx = Math.round((W - mw) / 2);
      wash(g, mx, HUD_H + 6, mw, 18, 'ink', 0.8);
      frame(g, mx, HUD_H + 6, mw, 18, 'red1');
      text(g, msg, W / 2, HUD_H + 11, Math.sin(t * 5) > 0 ? 'red2' : 'amber',
        { font: 7, center: true, shadow: 'ink' });
    }

    castRect = UI.rectOf(W - 150, 6, 140, 28);
    UI.button(g, castRect, r.over ? 'SAIL ON' : 'CAST OFF', {
      state: UI.hover(castRect, Input.mouse) ? 'hover' : 'idle',
      color: berthsFree(v) <= 0 && rem ? 'green0' : rem && !r.over ? 'rust' : 'green0',
      icon: 'boat', font: 5,
      sub: r.over ? null : rem ? `${rem} still ashore` : 'nobody left',
    });
  }

  /** The rail: who you are carrying, and what each of them opens. */
  function drawRail(g) {
    UI.panel(g, 0, RAIL_Y - 4, W, RAIL_H + 8, { style: 'wood', corners: false });
    const list = carried();
    railRects = [];
    text(g, held ? 'PUT IT ON WHAT IT OPENS' : 'ON DECK — CLICK ONE TO PUT IT DOWN',
      10, RAIL_Y + 2, held ? 'gold' : 'parch1', { font: 3 });
    const cell = 40;
    const maxShow = Math.min(list.length, Math.floor((W - 300) / cell));
    list.slice(0, maxShow).forEach((e, i) => {
      const x = 12 + i * cell;
      const y = RAIL_Y + 14;
      const rct = UI.rectOf(x, y - 2, cell - 4, 32);
      railRects[i] = { rect: rct, id: e.id };
      const ab = abilityOf(e.a);
      const on = held === e.id;
      const hot = hoverRail === i;
      rect(g, rct.x, rct.y, rct.w, rct.h, mix(col(ab.color), P.wood0, on ? 0.2 : 0.6));
      frame(g, rct.x, rct.y, rct.w, rct.h, on ? 'gold' : hot ? 'cream' : 'wood0');
      drawAnimal(g, e.a, x + 17, y + 10, { scale: 1 });
      UI.icon(g, ab.icon, x + 13, y + 22, { color: ab.color });
      if (isLoyal(v, e.id)) px(g, rct.x + rct.w - 2, rct.y + 1, 'gold');
    });
    if (list.length > maxShow) {
      text(g, `+${list.length - maxShow}`, 12 + maxShow * cell + 4, RAIL_Y + 22, 'cream', { font: 5 });
    }
    if (!list.length) {
      text(g, 'Nothing left to put down. Everything aboard is somebody you saved.',
        12, RAIL_Y + 20, 'parch1', { font: 3 });
    }

    // what the held animal answers, spelled out
    if (held) {
      const a = ANIMAL_BY_ID[held];
      const ab = abilityOf(a);
      const msg = `${a.name}: ${ab.verb} — ${ab.blurb}`;
      wrap(msg, 330, { font: 3 }).slice(0, 2).forEach((l, i) => {
        text(g, l, W - 342, RAIL_Y + 8 + i * 9, 'cream', { font: 3 });
      });
    } else if (r.note) {
      wrap(r.note.text, 330, { font: 3 }).slice(0, 2).forEach((l, i) => {
        text(g, l, W - 342, RAIL_Y + 8 + i * 9, r.note.color, { font: 3 });
      });
    }
  }

  /** The end-of-level card. */
  function drawOutro(g) {
    const k = Ease.outCubic(clamp(outro * 1.6, 0, 1));
    wash(g, 0, 0, W, H, 'ink', k * 0.72);
    const pw = 520, ph = 232;
    const x = Math.round((W - pw) / 2), y = Math.round((H - ph) / 2 - 10 + (1 - k) * 24);
    UI.panel(g, x, y, pw, ph, { style: 'paper', shadow: true });
    UI.panelTitle(g, x, y + 6, pw, island.name.toUpperCase(), { color: 'cream' });
    text(g, r.why || '', x + pw / 2, y + 26, 'wood1', { font: 3, center: true });

    const rows = [
      ['SAVED', r.rescued, 'leaf1'],
      ['LOST TO THE WATER', r.drowned, 'red1'],
      ['LEFT BEHIND', r.spent, 'rust'],
    ];
    let ry = y + 44;
    for (const [label, list, colr] of rows) {
      text(g, `${label} ${list.length}`, x + 16, ry, colr, { font: 5 });
      list.slice(0, 12).forEach((id, i) => {
        const a = ANIMAL_BY_ID[id];
        if (!a) return;
        drawAnimal(g, a, x + 200 + i * 24, ry + 6, {
          scale: 1, alpha: label === 'SAVED' ? 1 : 0.45, mood: label === 'SAVED' ? 'happy' : 'blink',
        });
      });
      ry += 44;
    }
    text(g, `${r.cleared} obstacle${r.cleared === 1 ? '' : 's'} opened · ${r.shots} flick${r.shots === 1 ? '' : 's'}`,
      x + 16, ry + 2, 'wood1', { font: 3 });
    const btn = UI.rectOf(x + pw / 2 - 90, y + ph - 34, 180, 26);
    UI.button(g, btn, 'BACK TO THE OCEAN', {
      state: UI.hover(btn, Input.mouse) ? 'hover' : 'idle', color: 'wood2', icon: 'boat', font: 5,
    });
    castRect = btn;
  }

  function draw(g) {
    drawIslandBack(g, island, 0, 0, W, H, t, { horizon: 86, weatherAmt: 0.8 });
    drawField(g);
    drawWater(g);
    drawHull(g);
    parts.draw(g, 'back');
    drawShepherd(g);
    drawAim(g);
    parts.draw(g, 'front');
    drawRail(g);
    drawHud(g);
    if (outro >= 0) drawOutro(g);
    if (intro < 1) wash(g, 0, 0, W, H, 'ink', (1 - Ease.outCubic(clamp(intro, 0, 1))) * 0.85);
  }

  /* -------------------------------------------------------------------- input */

  function onPress(m) {
    if (outro >= 0) {
      if (UI.hover(castRect, m) && onDone) onDone(result(r));
      return;
    }
    if (UI.hover(castRect, m)) { finish(); return; }

    // the basket: pick an apple up, or put it back
    for (let i = 0; i < appleRects.length; i++) {
      if (!UI.hover(appleRects[i], m)) continue;
      const id = v.hold[i];
      if (!id) { Audio.sfx('error'); return; }
      holdingApple = holdingApple === id ? null : id;
      held = null;
      Audio.sfx('click');
      return;
    }

    // the rail: pick an animal up to put down
    for (let i = 0; i < railRects.length; i++) {
      if (!UI.hover(railRects[i].rect, m)) continue;
      held = held === railRects[i].id ? null : railRects[i].id;
      holdingApple = null;
      Audio.sfx('click');
      return;
    }

    if (m.y < HUD_H || m.y > RAIL_Y - 8) return;

    // holding an animal: it goes on an obstacle
    if (held) {
      const oi = obAt(m.x, m.y);
      if (oi < 0) { note(r, 'Put it on the thing in the way.', 'parch1'); return; }
      const ob = r.obstacles[oi];
      const before = ob.cleared;
      if (placeHelper(r, held, ob)) {
        Audio.sfx('pot_good');
        parts.emit('dust', sx(ob.x), sy(ob.y), { count: 12, speed: 60, color: ob.ob.color });
        Juice.flash('leaf4', 0.2, 0.2);
        held = null;
      } else if (!before) {
        Audio.sfx('error');
        shake = 0.2;
      }
      return;
    }

    // holding something out of the basket: most of them want an animal to aim at
    if (holdingApple) {
      const si = ballAt(m.x, m.y);
      const entry = si >= 0 ? r.strand[si] : null;
      if (useApple(r, holdingApple, entry)) {
        Audio.sfx('sparkle');
        const px0 = entry ? sx(entry.ball.x) : m.x;
        const py0 = entry ? sy(entry.ball.y) : m.y;
        parts.emit('heart', px0, py0, { count: 8, speed: 40, color: 'gold' });
        holdingApple = null;
      } else Audio.sfx('error');
      return;
    }

    // otherwise: aim
    if (!isSettled(r.world)) return;
    const si = ballAt(m.x, m.y);
    if (si < 0) return;
    aim = { entry: r.strand[si], angle: Math.PI, power: 0 };
    Audio.sfx('chalk');
  }

  function onRelease() {
    if (!aim) return;
    const a = aim;
    aim = null;
    if (a.power < 0.06) return;
    if (flick(r, a.entry, a.angle, shotPower(a.power))) {
      Audio.sfx('ball_click');
      parts.emit('dust', sx(a.entry.ball.x), sy(a.entry.ball.y),
        { count: 5, speed: 40, color: 'magic1' });
      Juice.shake(1 + a.power * 2, 0.12);
    }
  }

  function update(dt) {
    t += dt;
    intro = approach(intro, 1, 2.6, dt);
    if (shake > 0) shake -= dt;
    parts.update(dt);
    if (outro >= 0) {
      outro += dt;
      const m = Input.mouse;
      if (m.pressed || Input.pressed('Enter') || Input.pressed('Space')) onPress(m);
      return;
    }

    const events = tickRescue(r, dt);
    for (const e of events) {
      if (e.kind === 'rescued') {
        Audio.sfx('pot_good');
        parts.emit('star', sx(e.x), sy(e.y), { count: 10, speed: 70, color: 'gold' });
      } else if (e.kind === 'lost') {
        Audio.sfx('splash');
        parts.emit('splash', sx(e.x), sy(e.y), { count: 12, speed: 90, color: 'water3' });
        Juice.flash('water0', 0.22, 0.2);
      } else if (e.kind === 'saved') {
        Audio.sfx('sparkle');
        parts.emit('heart', sx(e.x), sy(e.y), { count: 5, speed: 40, color: 'gold' });
      } else if (e.type === 'post') {
        if (e.speed > 60) Audio.sfx('rail', { pan: 0 });
      } else if (e.type === 'zone') {
        if (e.zone.physics === 'slow') Audio.sfx('munch');
      }
    }

    const m = Input.mouse;
    hoverOb = -1; hoverStrand = -1; hoverRail = -1;
    if (m.y > HUD_H && m.y < RAIL_Y - 8) {
      hoverStrand = ballAt(m.x, m.y);
      hoverOb = obAt(m.x, m.y);
    } else if (m.y >= RAIL_Y - 8) {
      for (let i = 0; i < railRects.length; i++) {
        if (UI.hover(railRects[i].rect, m)) { hoverRail = i; break; }
      }
    }

    if (m.pressed) onPress(m);
    if (aim) {
      // drag BACK from the animal: the flick goes the other way, like a catapult
      const b = aim.entry.ball;
      const dx = sx(b.x) - m.x, dy = sy(b.y) - m.y;
      const d = Math.hypot(dx, dy);
      if (d > 3) aim.angle = Math.atan2(dy, dx);
      aim.power = clamp(d / MAX_PULL, 0, 1);
      if (!m.down) onRelease();
    }
    if (Input.pressed('Escape')) { aim = null; held = null; holdingApple = null; }

    // the level ends itself when there is nobody left to reach or no water left to wait in
    if (!r.over && (r.tide >= 1 || (!remaining(r).length && isSettled(r.world)))) finish();
    if (r.over && outro < 0) { outro = 0; }
  }

  return {
    enter(args, api) {
      void api;
      v = args.voyage || args.run;
      island = args.island || (v && v.at);
      onDone = args.onDone;
      r = newRescue(v, island, args.tag);
      t = 0; intro = 0; outro = -1;
      aim = null; held = null; holdingApple = null;
      parts = createParticles({ limit: 220, seed: v.seed + '/rescue' });
      Audio.music(island.danger >= 3 ? 'deck_tense' : 'deck');
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,
    debug() {
      return {
        voyage: v, island, rescue: r,
        get aim() { return aim; },
        get held() { return held; },
        finish, advance: (n) => advanceTide(r, n),
        aimAt: (i, ang, pow) => flick(r, r.strand[i], ang, shotPower(pow)),
        place: (id, i) => placeHelper(r, id, r.obstacles[i]),
        at: (x, y) => ({ x: sx(x), y: sy(y) }),
        rects: { cast: castRect, rail: railRects, basket: appleRects },
      };
    },
  };
}

void lerp; void Juice;

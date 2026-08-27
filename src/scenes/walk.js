// THE WALK OUT: the ruins of the street he lived on, and a dead man showing you the way.
//
// This is the only scene in the game you can WALK in, and that is the point. Everything
// before it happens TO you -- a reel of the poisoned river, a hand through the cloud, a
// lion in the cellar -- and then the camera lets go and you are standing in a drowned
// street with nothing to do but go and look. Walking establishes the whole game: the water
// is winning, there were people here, the animals that turned have been through it, and
// the boat is at the far end.
//
// AND HE IS STILL WITH YOU. He died in the cellar; what walks the causeway with you is a
// pale shape a little way ahead that stops when you stop and waits at the gangway. That is
// the promise the rest of the run is made of -- you can go and tell him -- and it costs a
// translucent sprite and eight motes.
//
// NO DIALOGUE BOARD IN HERE EITHER. What he says arrives as captions on a bar at the foot
// of the frame, the way the film reels do it, so the walk out and the reels either side of
// it are one continuous piece of storytelling rather than a game with cutscenes in it.
//
// HOW IT IS BUILT. Two long strips are baked once -- the drowned skyline and the causeway
// you walk on -- and blitted at their own parallax. Everything else is live: rain, the
// water line, the corrupted on the far roofs, the plants in the wind, the soul, and the
// captions. One scroll, two blits, no tiles.

import { P, col, mix } from '../core/palette.js';
import {
  makeCanvas, rect, px, line, disc, ellipse, tri, text, textW, wrap, wash, clamp, lerp, W, H,
} from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import * as UI from '../render/uikit.js';
import { drawFolk } from '../render/folk.js';
import { drawBoat } from '../render/boat.js';
import { drawPlant } from '../render/flora.js';
import { drawSea } from '../render/ocean.js';

const WORLD = 2820;                  // how far the causeway runs
const GY = 468;                      // the road: where feet land
const HZ = 236;                      // where the sky stops
const WATER_Y = 342;                 // the flood, behind the road
const NOAH_X = 2320;
const ARK_X = 2660;
const SPEED = 152;                   // pixels a second: fifteen seconds of road, not twenty-five

/** Deterministic furniture: the same ruin in the same place on every machine. */
function h(n) { const v = Math.sin(n * 78.233 + 12.9898) * 43758.5453; return v - Math.floor(v); }

/**
 * What there is to see, and what the golem makes of it. Order matters: they are read in
 * the order you walk past them, and they get worse.
 */
const SIGHTS = [
  { x: 270, kind: 'door', line: 'A front door, floating. Still locked.' },
  { x: 540, kind: 'cart', line: 'A cart, and the traces cut. Whatever was in them let itself out.' },
  { x: 810, kind: 'shoe', line: 'A shoe, this big. No child.' },
  { x: 1080, kind: 'arrows', line: 'Claw marks in a wall, at the height of a chest.' },
  { x: 1350, kind: 'post', line: 'A rope, a post, and a dog that could not reach the roof.' },
  { x: 1620, kind: 'shrine', line: 'A shrine, and the offering still on it. Nobody came back for it.' },
  { x: 1900, kind: 'house', line: 'The water is at the upstairs windows, and it is still coming.' },
  { x: 2120, kind: 'wreck', line: 'A pipe, running into the water. It is why any of this happened.' },
];

// WHAT HE SAYS AT THE GANGWAY, as captions. Short, because they are read on a bar and not
// in a box -- and because he has already said the important part in the cellar.
const LINES = [
  '(the pale shape at the gangway waits for you to catch up)',
  '"THREE DECKS, A DOOR, PITCH INSIDE AND OUT. A HUNDRED YEARS."',
  '"EVERY LIVING THING WAS TO GO ON HER. THAT WAS THE ARRANGEMENT."',
  '"I CANNOT LIFT ANYTHING ANY MORE. YOU DO NOT GET TIRED."',
  '"SO TAKE HER, AND TAKE THE ARRANGEMENT WITH HER."',
  '"AND WHEN IT IS DONE, COME AND TELL ME. I WILL KEEP A SEAT."',
];


export function makeWalkScene() {
  let v = null, onDone = null;
  let parts = null;
  let t = 0, intro = 0, outT = -1;
  let heroX = 90, camX = 0, facing = 1, walkT = 0, moving = false;
  let phase = 'walk';                // walk -> talk -> give -> out
  let ix = 0, typed = 0;
  let seen = [], noteT = 0, noteLine = '';
  let deadT = -1;
  let skyCv = null, roadCv = null;
  let lightning = 0, thunderIn = 3;

  /* ------------------------------------------------------------------ bakes */

  /** The drowned city, and the storm behind it. One strip, parallaxed at a quarter. */
  function bakeSky() {
    const w = Math.ceil(WORLD * 0.32) + W;
    const mk = makeCanvas(w, WATER_Y + 30);
    if (!mk) return null;
    const b = mk.g;
    for (let y = 0; y < HZ; y++) {
      const f = y / HZ;
      rect(b, 0, y, w, 1, f < 0.45 ? mix(P.ink, P.night, f * 2.2)
        : f < 0.8 ? mix(P.night, P.deep, (f - 0.45) * 2.8) : mix(P.deep, P.wood0, (f - 0.8) * 5));
    }
    // the cloud ceiling, lumpy, with its lit underside
    for (let x = -20; x < w + 20; x += 11) {
      const r = 14 + h(x * 1.7) * 30;
      const yy = HZ - 40 - r * 0.3 + Math.sin(x * 0.013) * 8;
      disc(b, x + h(x) * 6, yy, r, mix(P.ink, P.night, 0.4));
      disc(b, x - r * 0.3, yy + r * 0.55, Math.max(3, r * 0.4), mix(P.night, P.purple0, 0.4));
    }
    // THE CITY, going under: towers, roofs, a dome, all of it cut off by the water
    let x = 40;
    while (x < w - 60) {
      const kind = Math.floor(h(x * 3.1) * 4);
      const hh = 40 + h(x * 5.3) * 120;
      const bw = 30 + h(x * 7.7) * 70;
      const top = WATER_Y - hh;
      const c = mix(P.shadow, P.night, 0.35 + h(x) * 0.3);
      rect(b, x, top, bw, hh, c);
      rect(b, x, top, bw, 3, mix(c, P.wood1, 0.35));
      // windows: a few lit, most not
      for (let wy = top + 10; wy < WATER_Y - 8; wy += 14) {
        for (let wx = x + 6; wx < x + bw - 8; wx += 12) {
          const lit = h(wx * 13 + wy) > 0.86;
          rect(b, wx, wy, 5, 7, lit ? 'amber' : mix(P.ink, c, 0.4));
        }
      }
      if (kind === 0) {                                  // a pitched roof
        tri(b, x - 5, top, x + bw + 5, top, x + bw / 2, top - 26, mix(c, P.red0, 0.3));
      } else if (kind === 1) {                           // a dome
        ellipse(b, x + bw / 2, top, bw * 0.6, 22, mix(c, P.brass0, 0.35));
        rect(b, x + bw / 2 - 2, top - 34, 4, 14, mix(c, P.brass1, 0.4));
      } else if (kind === 2) {                           // a broken tower
        for (let i = 0; i < 5; i++) rect(b, x + 4 + i * 7, top - 8 - (i % 2) * 8, 6, 12, c);
      }
      x += bw + 14 + h(x) * 40;
    }
    // and the water they are standing in, with the city upside down in it
    for (let y = WATER_Y; y < WATER_Y + 30; y++) {
      const f = (y - WATER_Y) / 30;
      rect(b, 0, y, w, 1, mix(P.water0, P.deep, f));
    }
    return mk.canvas;
  }

  /** The causeway, its rubble, and everything there is to look at. */
  function bakeRoad() {
    const mk = makeCanvas(WORLD + W, H - WATER_Y + 40);
    if (!mk) return null;
    const b = mk.g;
    const off = WATER_Y - 20;                            // strip-space y = world y - off
    const gy = GY - off;
    // THE STRIP LEAVES ITS WATER TRANSPARENT. It used to fill every row of itself with a flat
    // ramp of water before drawing the road on top, and the strip is blitted AFTER the live
    // water -- so the animated flood and everything floating past on it were painted and then
    // covered over, every frame, invisibly. The first water in the game was a baked slab.
    // Rows above the kerb are left clear now and the live sea shows through them.
    for (let y = gy - 16; y < mk.canvas.height; y++) {
      const f = (y - gy + 16) / (mk.canvas.height - gy + 16);
      // wet stone: warm where the last of the light lies on it, cold in the seams
      rect(b, 0, y, WORLD + W, 1, f < 0.1 ? mix(P.stone3, P.wood2, 0.3)
        : f < 0.34 ? mix(P.stone2, P.wood1, 0.25)
          : f < 0.62 ? 'stone1' : f < 0.82 ? mix(P.stone0, P.wood0, 0.4) : 'shadow');
    }
    rect(b, 0, gy - 18, WORLD + W, 3, 'stone3');         // the kerb, catching the light
    // paving, cracks and puddles
    for (let x = 0; x < WORLD + W; x += 34) {
      rect(b, x, gy - 15, 2, mk.canvas.height - gy + 15, mix(P.stone0, P.ink, 0.5));
      if (h(x) > 0.6) {
        for (let i = 0; i < 4; i++) rect(b, x + 6 + i * 5, gy - 12 + i * 6, 3 + i, 2, mix(P.ink, P.stone0, 0.4));
      }
      if (h(x * 3) > 0.72) {
        const pw = 30 + h(x * 5) * 60;
        ellipse(b, x + 16, gy + 12 + h(x * 7) * 24, pw / 2, 5, 'water0');
        ellipse(b, x + 14, gy + 11 + h(x * 7) * 24, pw / 2 - 6, 3, 'water1');
      }
      if (h(x * 11) > 0.8) rect(b, x + 8, gy - 20, 6 + h(x) * 10, 5, 'stone2');   // rubble
    }
    // THE SEA WALL along the back of the road, broken in places. In six-pixel segments on
    // the world grid it came out as a picket fence for two thousand pixels; in
    // twenty-four-pixel blocks with the odd one missing it is a wall that has been hit.
    for (let x = 0; x < WORLD + W; x += 24) {
      if (h(x * 0.7) > 0.86) continue;                   // a gap where it has gone
      const hh = 24 + Math.round(h(x * 1.3) * 12);
      rect(b, x, gy - 18 - hh, 24, hh, 'ink');
      rect(b, x + 2, gy - 16 - hh, 20, hh - 2, 'stone1');
      rect(b, x + 2, gy - 16 - hh, 20, 4, 'stone3');
      if (h(x * 5) > 0.6) rect(b, x + 2, gy - 16 - hh + 12, 20, 4, mix(P.stone0, P.ink, 0.3));
    }
    // THE END OF THE ROAD: the stones give out and the ark is moored in the gap
    for (let x = ARK_X - 60; x < WORLD + W; x += 1) {
      const f = clamp((x - (ARK_X - 60)) / 90, 0, 1);
      const top = gy - 18 + Math.round(f * 26);
      for (let y = top; y < mk.canvas.height; y++) {
        const d = (y - top) / Math.max(1, mk.canvas.height - top);
        rect(b, x, y, 1, 1, d < 0.1 ? 'water2' : d < 0.4 ? 'water1' : d < 0.75 ? 'water0' : 'deep');
      }
    }
    // a jetty out over it, and a bollard with her line round it
    for (let x = ARK_X - 70; x < ARK_X + 40; x += 8) {
      rect(b, x, gy - 20, 7, 5, 'wood1');
      rect(b, x, gy - 20, 7, 2, 'wood2');
      rect(b, x + 2, gy - 15, 3, 16, 'wood0');
    }
    rect(b, ARK_X - 88, gy - 34, 8, 20, 'wood2');
    rect(b, ARK_X - 88, gy - 34, 8, 3, 'wood3');
    for (let i = 0; i < 16; i++) px(b, ARK_X - 82 + i * 3, gy - 30 + Math.sin(i * 0.5) * 3, 'cloth1');

    for (const s of SIGHTS) prop(b, s.x, gy, s.kind);
    // THE HOUSE HE LIVED IN, at the end of the road, with the cellar door open at the foot
    // of it. You came out of there ten minutes ago, and the frame says so: this is the last
    // building on the causeway and every other one is behind you.
    const nx = NOAH_X;
    rect(b, nx - 60, gy - 150, 150, 150, 'ink');
    rect(b, nx - 54, gy - 144, 138, 144, 'stone1');
    rect(b, nx - 54, gy - 144, 138, 6, 'stone3');
    for (let y = gy - 132; y < gy; y += 18) rect(b, nx - 54, y, 138, 4, mix(P.stone0, P.ink, 0.35));
    // the cellar doorway, open, black
    rect(b, nx - 6, gy - 60, 54, 60, 'ink');
    rect(b, nx - 10, gy - 64, 62, 8, 'wood1');
    // and the door itself, off its hinges and lying in the road: the lion did that
    rect(b, nx - 130, gy - 16, 90, 16, 'ink');
    rect(b, nx - 126, gy - 12, 82, 8, 'wood1');
    // claw marks up the doorframe
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < 3; k++) {
        rect(b, nx - 18 + k * 8, gy - 70 - i * 22, 5, 26, mix(P.ink, P.stone0, 0.2));
      }
    }
    return mk.canvas;
  }

  /** One arrow, stuck where it landed. */
  function arrow(b, x, y, ang) {
    const dx = Math.cos(ang) * 16, dy = Math.sin(ang) * 16;
    for (let i = 0; i < 9; i++) {
      px(b, x + (dx * i) / 9, y + (dy * i) / 9, i < 2 ? 'grey2' : 'wood1');
    }
    for (let i = 0; i < 3; i++) {
      px(b, x + dx * (0.8 + i * 0.06), y + dy * (0.8 + i * 0.06) - 2, 'bone');
      px(b, x + dx * (0.8 + i * 0.06), y + dy * (0.8 + i * 0.06) + 2, 'bone');
    }
  }

  /** One thing to look at, drawn into the road strip. */
  function prop(b, x, gy, kind) {
    if (kind === 'door') {
      rect(b, x, gy - 40, 26, 44, 'wood1');
      rect(b, x, gy - 40, 26, 3, 'wood2');
      for (let i = 0; i < 3; i++) rect(b, x + 3 + i * 8, gy - 36, 6, 36, 'wood0');
      rect(b, x + 20, gy - 22, 4, 4, 'brass2');
    } else if (kind === 'cart') {
      rect(b, x, gy - 26, 54, 20, 'wood1');
      rect(b, x, gy - 26, 54, 3, 'wood2');
      rect(b, x - 16, gy - 20, 18, 4, 'wood1');
      disc(b, x + 10, gy - 4, 11, 'wood0'); disc(b, x + 10, gy - 4, 7, 'wood2'); disc(b, x + 10, gy - 4, 2, 'wood0');
      disc(b, x + 42, gy - 4, 11, 'wood0'); disc(b, x + 42, gy - 4, 7, 'wood2');
    } else if (kind === 'shoe') {
      rect(b, x, gy - 8, 14, 8, 'bark');
      rect(b, x, gy - 12, 8, 6, 'bark');
      rect(b, x + 1, gy - 11, 5, 2, 'wood2');
    } else if (kind === 'arrows') {
      rect(b, x - 6, gy - 74, 56, 74, 'stone1');
      rect(b, x - 6, gy - 74, 56, 4, 'stone3');
      for (let i = 0; i < 6; i++) arrow(b, x + 4 + (i % 3) * 16, gy - 56 + Math.floor(i / 3) * 14, 0.2);
    } else if (kind === 'post') {
      rect(b, x, gy - 44, 7, 46, 'wood1');
      rect(b, x, gy - 44, 7, 3, 'wood2');
      for (let i = 0; i < 14; i++) px(b, x + 4 + i * 2, gy - 38 + Math.sin(i * 0.6) * 5, 'cloth1');
      ellipse(b, x + 34, gy - 3, 13, 5, mix(P.wood0, P.ink, 0.4));
    } else if (kind === 'shrine') {
      rect(b, x, gy - 34, 40, 34, 'stone2');
      rect(b, x, gy - 34, 40, 4, 'stone3');
      rect(b, x - 4, gy - 40, 48, 7, 'stone1');
      ellipse(b, x + 20, gy - 42, 9, 4, 'brass1');
      rect(b, x + 18, gy - 52, 4, 10, 'cream');
      rect(b, x + 19, gy - 55, 2, 4, 'amber');
    } else if (kind === 'house') {
      rect(b, x - 20, gy - 120, 110, 120, 'stone1');
      rect(b, x - 20, gy - 120, 110, 4, 'stone3');
      tri(b, x - 30, gy - 120, x + 100, gy - 120, x + 35, gy - 158, 'red0');
      for (let wy = gy - 104; wy < gy - 10; wy += 26) {
        for (let wx = x - 8; wx < x + 80; wx += 30) {
          rect(b, wx, wy, 18, 20, 'ink');
          rect(b, wx + 2, wy + 2, 14, 16, mix(P.water0, P.ink, 0.35));
          rect(b, wx + 8, wy, 2, 20, 'stone2');
        }
      }
    } else if (kind === 'wreck') {
      for (let i = 0; i < 14; i++) {
        const f = i / 13;
        rect(b, x + i * 5, gy - 20 + Math.round(f * f * 18), 6, 20 - Math.round(f * 14),
          i % 3 === 0 ? 'wood0' : 'wood1');
      }
      rect(b, x + 20, gy - 40, 3, 22, 'wood2');
      for (let i = 0; i < 6; i++) px(b, x + 24 + i, gy - 38 + i, 'bone');
    }
  }

  /* ------------------------------------------------------------------- draw */

  function drawSky(g) {
    const w = skyCv ? skyCv.width : 0;
    if (skyCv) {
      const sx = Math.round(camX * 0.32);
      g.drawImage(skyCv, Math.max(0, Math.min(w - W, sx)), 0, W, WATER_Y + 30, 0, 0, W, WATER_Y + 30);
    } else rect(g, 0, 0, W, WATER_Y, 'deep');
    // rain, and the odd flash behind the cloud
    for (let i = 0; i < 230; i++) {
      const x = (h(i) * W * 1.2 + t * 90) % (W + 40) - 20;
      const y = (h(i * 3) * H + t * 620) % H;
      rect(g, x, y, 1, 5, i % 7 === 0 ? 'water3' : 'water2');
    }
    if (lightning > 0) {
      const k = lightning / 0.4;
      wash(g, 0, 0, W, WATER_Y, 'white', 0.22 * k);
      const seed = Math.floor(t * 14);
      let bx = 120 + (seed * 97) % 700, by = 8;
      for (let i = 0; i < 16 && by < HZ; i++) {
        const nx = bx + ((seed + i) * 131) % 26 - 13;
        const ny = by + 10 + ((seed + i) % 6);
        line(g, bx, by, nx, ny, 'white');
        bx = nx; by = ny;
      }
    }
  }

  /** The flood between the city and the road, and the road's own reflection in it. */
  function drawWater(g) {
    // THE FLOODED CITY, in the shared water at night tones. It was a dark slab with sixty
    // two-pixel dashes drifting across it -- which is the fault this art pass exists to fix,
    // and this is the first water the player ever sees.
    drawSea(g, {
      top: WATER_Y + 24, bottom: GY - 14, t, calm: 0.4,
      shallow: mix(P.water1, P.night, 0.4), deep: mix(P.deep, P.ink, 0.4), foam: 'water3',
    });
    // things going past on the current
    for (let i = 0; i < 7; i++) {
      const x = ((i * 421) - camX * 0.6 + t * 12) % (W + 120) - 60;
      const y = WATER_Y + 34 + h(i) * (GY - 62 - WATER_Y);
      rect(g, x, y, 16 + h(i * 3) * 20, 3, 'wood1');
      rect(g, x, y, 16 + h(i * 3) * 20, 1, 'wood2');
    }
  }

  /** The men who shot him, leaving. Silhouettes on a roof, and they do not stay. */
  /**
   * THE CORRUPTED, on the far rooftops, watching you go past.
   *
   * It used to be men with bows -- the story had raiders in it, who shot Noah for the boat.
   * The story does not have raiders in it any more: what came for him came on four legs and
   * used to eat out of his hand. So they are silhouettes with red eyes now, on the roofs
   * across the water, and they do not follow. They are just there, in numbers, and that
   * tells you what every island after this is going to be.
   */
  function drawRaiders(g) {
    for (let i = 0; i < 9; i++) {
      const rx = 300 + i * 340 - camX * 0.72;
      if (rx < -60 || rx > W + 60) continue;
      const ry = 250 + (i % 3) * 22;
      const sc = 1 + (i % 2) * 0.4;
      g.globalAlpha = 0.85;
      // body, head, ears: one dark mass, because that is all you can see at this distance
      rect(g, rx - 20 * sc, ry - 16 * sc, 44 * sc, 18 * sc, 'ink');
      for (let l = 0; l < 4; l++) rect(g, rx - 16 * sc + l * 11 * sc, ry + 2 * sc, 5 * sc, 14 * sc, 'ink');
      disc(g, rx + 26 * sc, ry - 22 * sc, 11 * sc, 'ink');
      tri(g, rx + 18 * sc, ry - 30 * sc, rx + 30 * sc, ry - 30 * sc, rx + 22 * sc, ry - 44 * sc, 'ink');
      // and the eyes, which are the only thing about them you can make out
      const pulse = 0.6 + 0.4 * Math.sin(t * 5 + i);
      for (const dx of [20, 30]) {
        rect(g, rx + dx * sc, ry - 24 * sc, 4 * sc, 4 * sc, pulse > 0.75 ? 'red2' : 'red1');
      }
      g.globalAlpha = 1;
    }
  }

  /**
   * HIM, AFTERWARDS. A pale shape that keeps a little way ahead of you and waits.
   *
   * It is the same folk sprite as the living man, drawn translucent with a fringe of motes
   * coming off it, because the recognition is the whole point: the thing walking you to the
   * boat is visibly the man who built it. He hangs a body's length ahead while you walk,
   * and stands at the gangway once you are talking.
   */
  function drawSoul(g) {
    const talking = phase === 'talk' || phase === 'give';
    const sx = talking ? NOAH_X + 40 - camX : heroX + 170 - camX;
    if (sx < -160 || sx > W + 160) return;
    const float = Math.sin(t * 1.6) * 8;
    const sy = GY - 26 + float;
    const prev = g.globalAlpha;
    // the light he stands in. DISCS, not a wash: an alpha rectangle at this grid is a pale
    // box with hard corners round him, which reads as a bug rather than as a glow.
    const gl = 0.06 + 0.03 * Math.sin(t * 2);
    for (let i = 3; i >= 1; i--) {
      g.globalAlpha = gl * i;
      disc(g, sx, sy - 60, 40 + i * 26, 'ice');
      g.globalAlpha = 1;
    }
    g.globalAlpha = 0.42 + 0.16 * Math.sin(t * 2.2);
    drawFolk(g, 'noah', sx, sy, t, {
      scale: 2, pose: talking ? 'talk' : 'idle', talking: talking && !fullyTyped(),
    });
    g.globalAlpha = prev;
    // motes going up off him
    for (let i = 0; i < 12; i++) {
      const k = ((t * 0.35 + i / 12) % 1);
      const mx = sx - 40 + ((i * 37) % 84);
      rect(g, mx, sy - 40 - k * 170, 6, 6, k > 0.6 ? 'white' : 'ice');
    }
    // and he keeps the hat, because he would
    if (!talking) {
      const bob = Math.sin(t * 1.6 + 1) * 3;
      rect(g, sx - 26, sy - 120 + bob, 52, 6, 'ice');
    }
  }

  function fullyTyped() { return typed >= (LINES[ix] ? LINES[ix].length : 0); }

  /**
   * HIS WORDS, ON A BAR. Not in a box: a timber sheet with a portrait plate on it would put
   * a piece of furniture between the player and the two figures the scene is about, and the
   * reels either side of this scene do not have one.
   */
  function drawCaptions(g) {
    const l = LINES[ix];
    if (!l) return;
    const bh = 76;
    rect(g, 0, H - bh, W, bh, 'ink');
    rect(g, 0, H - bh, W, 4, 'wood0');
    const shown = l.slice(0, Math.floor(typed));
    wrap(shown, W - 120, { font: 7 }).slice(0, 2).forEach((r, i) => {
      text(g, r, 60, H - bh + 18 + i * 24, l[0] === '(' ? 'parch1' : 'brass3', { font: 7 });
    });
    if (fullyTyped() && Math.floor(t * 2) % 2 === 0) {
      text(g, ix >= LINES.length - 1 ? 'TAKE HER ▶' : 'NEXT ▶', W - 40, H - 34,
        'wood2', { font: 5, right: true });
    }
    for (let i = 0; i < LINES.length; i++) {
      rect(g, 60 + i * 16, H - 18, 10, 6, i < ix ? 'wood2' : i === ix ? 'brass3' : 'wood0');
    }
  }

  function draw(g) {
    rect(g, 0, 0, W, H, 'ink');
    drawSky(g);
    drawWater(g);
    drawRaiders(g);
    if (roadCv) {
      const sy = WATER_Y - 20;
      g.drawImage(roadCv, Math.round(camX), 0, W, roadCv.height, 0, sy, W, roadCv.height);
    }
    // weeds and reeds along the kerb, moving in the wind
    for (let i = 0; i < 40; i++) {
      const wx = (i * 97 + 40);
      const sx = wx - camX * 1.06;
      if (sx < -20 || sx > W + 20) continue;
      drawPlant(g, sx, GY + 6 + (i % 3) * 8, i % 4 === 0 ? 'reed' : i % 3 === 0 ? 'cattail' : 'tuft',
        { biome: 'storm', v: i % 4, t });
    }
    drawSoul(g);
    // THE ARK, moored at the end of the causeway, waiting for somebody to work her rudder
    const ax = ARK_X - camX;
    if (ax > -260 && ax < W + 260) {
      drawBoat(g, ax, GY + 16, t, { tiers: v ? v.tiers : {}, damage: 0, scale: 2, speed: 0.1, wake: false });
      if (phase === 'give') {
        const bob = Math.round(Math.abs(Math.sin(t * 3)) * 5);
        UI.icon(g, 'arrow_d', ax - 4, GY - 150 - bob, { color: 'gold', scale: 2 });
        text(g, 'SHE IS YOURS', ax, GY - 122, 'gold', { font: 7, center: true, shadow: 'ink' });
      }
    }
    // the golem
    // THE GOLEM IS DRAWN AT 2x AND EVERY MAN IN THIS GAME AT 1x. It is a hundredweight
    // of riverbank that stood up: if it is the same height as the man it is carrying the
    // boat for, none of the rest of the story lands.
    drawFolk(g, 'golem', heroX - camX, GY + 4, t, {
      scale: 2, pose: moving ? 'react' : 'idle', flip: facing < 0,
      mud: 0.5, sparkle: 0.2, phase: walkT * 6,
    });
    parts.draw(g, 'front');

    // the sight you are looking at
    if (noteT > 0 && phase === 'walk') {
      const a = Math.min(1, noteT * 2);
      const bw = Math.min(720, textW(noteLine, { font: 7 }) + 56);
      const bx = Math.round((W - bw) / 2), by = H - 50;
      g.globalAlpha = a;
      UI.panel(g, bx, by, bw, 42, { style: 'paper', shadow: true, corners: false });
      text(g, noteLine, bx + bw / 2, by + 15, 'wood0', { font: 7, center: true });
      g.globalAlpha = 1;
    }
    if (phase === 'talk') drawCaptions(g);
    if (phase === 'walk' && heroX < 240) {
      const a = 0.6 + 0.4 * Math.sin(t * 3);
      g.globalAlpha = a;
      text(g, Input.touch ? 'TAP AND HOLD THE RIGHT SIDE TO WALK' : 'D OR → TO WALK',
        W / 2, 78, 'cream', { font: 7, center: true, shadow: 'ink' });
      g.globalAlpha = 1;
    }
    // how far along the road you are, which is also how much of this there is left
    const pw = 260;
    rect(g, (W - pw) / 2 - 8, 14, pw + 16, 26, 'ink');
    rect(g, (W - pw) / 2 - 6, 16, pw + 12, 22, 'wood0');
    rect(g, (W - pw) / 2, 20, pw, 6, 'shadow');
    rect(g, (W - pw) / 2, 20, Math.round(pw * clamp(heroX / ARK_X, 0, 1)), 6, 'brass2');
    text(g, 'THE CAUSEWAY', W / 2, 28, 'parch1', { font: 3, center: true });

    if (outT >= 0) wash(g, 0, 0, W, H, 'ink', Ease.inQuad(clamp(outT / 0.7, 0, 1)));
    else if (intro < 1) wash(g, 0, 0, W, H, 'ink', (1 - Ease.outCubic(clamp(intro, 0, 1))) * 0.95);
  }

  /* ----------------------------------------------------------------- update */

  function advance() {
    if (!fullyTyped()) { typed = LINES[ix].length; Audio.sfx('click'); return; }
    if (ix >= LINES.length - 1) {
      phase = 'give';
      deadT = 0;
      Audio.sfx('whoosh');
      Juice.flash('white', 0.2, 0.5);
      return;
    }
    ix++; typed = 0;
    Audio.sfx('deal', { vol: 0.45 });
  }

  function update(dt) {
    t += dt;
    intro = approach(intro, 1, 2.2, dt);
    parts.update(dt);
    if (noteT > 0) noteT -= dt;
    if (lightning > 0) lightning -= dt;
    if (deadT >= 0) deadT += dt;
    thunderIn -= dt;
    if (thunderIn <= 0) {
      thunderIn = 6 + h(Math.floor(t * 7)) * 9;
      lightning = 0.4;
      Audio.sfx('boss_sting', { vol: 0.35 });
    }

    if (outT >= 0) {
      outT += dt;
      if (outT > 0.7 && onDone) { const f = onDone; onDone = null; f(); }
      return;
    }

    if (phase === 'talk') {
      // hold the two of them in the right-hand third, clear of the sheet
      camX = approach(camX, clamp(NOAH_X - 754, 0, WORLD - W + 240), 3, dt);
      const len = LINES[ix] ? LINES[ix].length : 0;
      if (typed < len) {
        const prev = typed;
        typed = Math.min(len, typed + dt * 44);
        if (Math.floor(typed / 3) !== Math.floor(prev / 3)) {
          Audio.sfx('tick', { vol: 0.22, rate: 0.95 });
        }
      }
      if (Input.mouse.pressed || Input.pressed('Space') || Input.pressed('Enter')) advance();
      if (Input.pressed('Escape')) { phase = 'give'; deadT = 0; }
      moving = false;
      return;
    }

    // --- walking
    const m = Input.mouse;
    let dir = 0;
    if (Input.key('ArrowRight') || Input.key('KeyD')) dir += 1;
    if (Input.key('ArrowLeft') || Input.key('KeyA')) dir -= 1;
    if (!dir && m.down) dir = m.x > W * 0.54 ? 1 : m.x < W * 0.46 ? -1 : 0;
    moving = dir !== 0;
    if (dir) {
      facing = dir;
      heroX = clamp(heroX + dir * SPEED * dt, 40, ARK_X + 10);
      walkT += dt;
      if (Math.floor(walkT * 3.4) !== Math.floor((walkT - dt) * 3.4)) {
        Audio.sfx('crate_land', { vol: 0.16, rate: 1.5 + (Math.floor(walkT * 3) % 3) * 0.08 });
        parts.emit('splash', heroX - camX - facing * 8, GY, { count: 2, speed: 26, color: 'water2', life: 0.4 });
      }
    }
    camX = clamp(heroX - W * 0.42, 0, WORLD - W + 240);


    // something to look at
    for (const s of SIGHTS) {
      if (seen.indexOf(s.x) >= 0) continue;
      if (Math.abs(heroX - s.x) < 64) {
        seen.push(s.x);
        noteLine = s.line;
        noteT = 5.5;
        Audio.sfx('hover', { vol: 0.4 });
      }
    }
    // Noah, and then the boat
    // he stops a body's length short: a dying man and the thing looming over him need to
    // be two silhouettes, not one
    if (phase === 'walk' && heroX > NOAH_X - 152) {
      heroX = NOAH_X - 152;
      phase = 'talk'; ix = 0; typed = 0;
      Audio.stopMusic(0.6);
      Audio.sfx('fail', { vol: 0.5 });
      return;
    }
    if (phase === 'give' && heroX > ARK_X - 74) {
      outT = 0;
      Audio.sfx('boat_horn');
    }
    if (phase !== 'talk' && Input.pressed('Escape')) { outT = 0; }
  }

  return {
    enter(args) {
      v = args.voyage || args.run || null;
      onDone = args.onDone;
      t = 0; intro = 0; outT = -1;
      heroX = 90; camX = 0; facing = 1; walkT = 0; moving = false;
      phase = 'walk'; ix = 0; typed = 0; seen = []; noteT = 0; deadT = -1;
      lightning = 0; thunderIn = 3;
      parts = createParticles({ limit: 120, seed: 'walk' });
      if (!skyCv) skyCv = bakeSky();
      if (!roadCv) roadCv = bakeRoad();
      Audio.music('harbour');
    },
    exit() { Audio.stopMusic(0.5); },
    update,
    draw,
    debug() {
      return {
        phase, heroX: Math.round(heroX), ix, seen: seen.length, sights: SIGHTS.length,
        lines: LINES.length, dead: deadT >= 0,
        walkTo(x) { heroX = clamp(x, 40, ARK_X + 10); },
        // SKIP MEANS LEAVE. This used to set the phase and park the hero eighty pixels short
        // of the ark -- and the scene exits at seventy-four, so anything that called skip()
        // and did not then hold a key down walked nowhere and sat in the causeway for ever.
        // The mobile harness did exactly that and reported it as "never reached the map",
        // which is a broken-game message for a one-pixel arithmetic bug in a debug hook.
        skip() { phase = 'give'; deadT = 0; heroX = ARK_X - 70; outT = 0; },
      talk() { heroX = NOAH_X - 152; phase = 'talk'; ix = 0; typed = 0; },
      };
    },
  };
}

// THE FIRST HOUR: a walk through what is left, and a man dying at the end of it.
//
// This is the only scene in the game you can WALK in, and that is the point. The flood
// happens to you in a set-piece -- a hand comes through the cloud, a wave stands up, a
// word is cut into your brow -- and then the camera lets go and you are standing in a
// drowned street with nothing to do but go and look. Everything the game is about is
// established by walking: the water is winning, there were people here, somebody has
// been shooting at somebody, and one old man is still alive at the end of the road.
//
// He gives you the ark and the arithmetic, and then he dies, and the whole run after
// this is an errand for a dead man. That framing is cheap to build and it is what turns
// a tower-defence island into a thing you care about losing.
//
// HOW IT IS BUILT. Two long strips are baked once -- the drowned skyline and the
// causeway you walk on -- and blitted at their own parallax. Everything else is live:
// rain, the water line, the raiders on the far roof, the plants in the wind, Noah, and
// the board his last words are printed on. One scroll, two blits, no tiles.

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
  { x: 540, kind: 'cart', line: 'A cart. The wheel is still turning and the traces are empty.' },
  { x: 810, kind: 'shoe', line: 'A shoe, this big. No child.' },
  { x: 1080, kind: 'arrows', line: 'Arrows in a wall, six of them, at the height of a chest.' },
  { x: 1350, kind: 'post', line: 'A rope, a post, and a dog that could not reach the roof.' },
  { x: 1620, kind: 'shrine', line: 'A shrine with the offering still on it. Nobody came back for it.' },
  { x: 1900, kind: 'house', line: 'The water is at the upstairs windows, and it is still coming.' },
  { x: 2120, kind: 'wreck', line: "Somebody's boat, stove in on the stones. They tried." },
];

const LINES = [
  { who: null, text: '(he is propped against the wall with three arrows in him. He is smiling.)' },
  { who: 'NOAH', text: 'There. I knew something would come. I had hoped for a son.' },
  { who: 'NOAH', text: 'Men came for the boat. They shot me from the water and rowed off.' },
  { who: 'NOAH', text: 'They could not work her rudder. That is the only funny part.' },
  { who: 'NOAH', text: 'A hundred years I built her. Three decks, a door, pitch inside and out.' },
  { who: 'NOAH', text: 'Every living thing was to go on her. That was the whole arrangement.' },
  { who: 'NOAH', text: 'I cannot stand up. You do not get tired. You see the arithmetic.' },
  { who: null, text: '(the word cut into its brow is the only thing it ever says)' },
  { who: 'NOAH', text: 'Then take her. Take the dream with her: two of everything, nothing left.' },
  { who: 'NOAH', text: 'And when it is done, come and tell me. I will keep a seat by me.' },
  { who: null, text: '(he shuts his eyes. The lantern beside him goes out.)' },
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
    // the water either side of the road, then the road itself
    for (let y = 0; y < mk.canvas.height; y++) {
      const f = y / mk.canvas.height;
      rect(b, 0, y, WORLD + W, 1, mix(P.water0, P.ink, f * 0.8));
    }
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
    // the sea wall along the back of the road, broken in places
    for (let x = 0; x < WORLD + W; x += 6) {
      if (h(x * 0.7) > 0.82) continue;                   // a gap where it has gone
      const hh = 22 + Math.round(h(x * 1.3) * 8);
      rect(b, x, gy - 18 - hh, 6, hh, 'stone1');
      rect(b, x, gy - 18 - hh, 6, 3, 'stone3');
      rect(b, x + 5, gy - 18 - hh, 1, hh, mix(P.stone0, P.ink, 0.4));
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
    // and the wall Noah is propped against
    const nx = NOAH_X;
    rect(b, nx - 40, gy - 96, 96, 96, 'stone1');
    rect(b, nx - 40, gy - 96, 96, 4, 'stone3');
    for (let y = gy - 92; y < gy; y += 12) rect(b, nx - 40, y, 96, 2, mix(P.stone0, P.ink, 0.35));
    for (let i = 0; i < 5; i++) rect(b, nx + 20 + i * 7, gy - 96 - (i % 3) * 9, 6, 12, 'stone1');
    // arrows in that wall, and in the stones around him: they shot at him for a while
    for (let i = 0; i < 7; i++) {
      const ax = nx - 30 + h(i * 3) * 90, ay = gy - 84 + h(i * 5) * 70;
      arrow(b, ax, ay, -0.5 - h(i) * 0.4);
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
    for (let y = WATER_Y + 26; y < GY - 18; y++) {
      const f = (y - WATER_Y - 26) / Math.max(1, GY - 18 - WATER_Y - 26);
      rect(g, 0, y, W, 1, mix(P.water0, P.deep, 0.3 + f * 0.5));
    }
    for (let i = 0; i < 60; i++) {
      const f = (i % 10) / 9;
      const y = WATER_Y + 28 + f * (GY - 52 - WATER_Y);
      const x = ((i * 137) - camX * 0.6 + t * (6 + f * 14)) % (W + 60) - 30;
      rect(g, x, y, 6 + Math.round(f * 14), 2, f < 0.4 ? 'water1' : 'water2');
    }
    // things going past on the current
    for (let i = 0; i < 7; i++) {
      const x = ((i * 421) - camX * 0.6 + t * 12) % (W + 120) - 60;
      const y = WATER_Y + 34 + h(i) * (GY - 62 - WATER_Y);
      rect(g, x, y, 16 + h(i * 3) * 20, 3, 'wood1');
      rect(g, x, y, 16 + h(i * 3) * 20, 1, 'wood2');
    }
  }

  /** The men who shot him, leaving. Silhouettes on a roof, and they do not stay. */
  function drawRaiders(g) {
    const gone = clamp((heroX - 1500) / 600, 0, 1);
    if (gone >= 1) return;
    const rx = 1820 - camX, ry = GY - 150;
    if (rx < -200 || rx > W + 200) return;
    g.globalAlpha = 1 - gone;
    rect(g, rx - 60, ry, 190, 8, 'shadow');
    for (let i = 0; i < 3; i++) {
      const x = rx + i * 46 + Math.round(Math.sin(t * 2 + i) * 1);
      rect(g, x, ry - 34, 12, 34, 'ink');
      disc(g, x + 6, ry - 40, 7, 'ink');
      rect(g, x - 2, ry - 44, 16, 5, 'ink');            // a hood
      // the bow, held down: they are done shooting
      line(g, x + 12, ry - 26, x + 18, ry - 6, 'ink');
      line(g, x + 12, ry - 26, x + 17, ry - 30, 'ink');
    }
    g.globalAlpha = 1;
  }

  /** Noah, with three arrows in him, and the lantern that goes out. */
  function drawNoah(g) {
    const nx = NOAH_X - camX;
    if (nx < -160 || nx > W + 160) return;
    const dead = deadT >= 0;
    const dk = dead ? clamp(deadT / 1.6, 0, 1) : 0;
    // the rubble he is sitting against, drawn before him so his legs are behind it
    // his body, sat down: the sprite is dropped so only chest and head clear the stones
    drawFolk(g, 'noah', nx, GY + 6, dead ? 0 : t, {
      scale: 1, pose: phase === 'talk' && !dead ? 'talk' : 'idle',
      talking: phase === 'talk' && !dead && !fullyTyped(),
      alpha: 1,
    });
    // the stones across his legs, so he reads as sat down and not as standing behind a box
    rect(g, nx - 34, GY - 10, 70, 22, 'stone2');
    rect(g, nx - 34, GY - 10, 70, 3, 'stone3');
    rect(g, nx - 34, GY + 9, 70, 3, 'stone0');
    // three arrows in him, and the dark stain under them
    wash(g, nx - 14, GY - 38, 26, 22, 'red0', 0.45);
    for (const [ax, ay, aa] of [[-10, -36, -0.7], [2, -28, -0.35], [10, -40, -0.9]]) {
      const dx = Math.cos(aa) * 20, dy = Math.sin(aa) * 20;
      for (let i = 2; i < 10; i++) px(g, nx + ax + (dx * i) / 10, GY + ay + (dy * i) / 10, i < 4 ? 'wood1' : 'wood0');
      for (let i = 0; i < 3; i++) {
        px(g, nx + ax + dx * (0.86 + i * 0.05), GY + ay + dy * (0.86 + i * 0.05) - 2, 'bone');
        px(g, nx + ax + dx * (0.86 + i * 0.05), GY + ay + dy * (0.86 + i * 0.05) + 2, 'bone');
      }
    }
    // the lantern: lit, then not
    const lx = nx + 46;
    if (dk < 1) {
      g.globalAlpha = 1 - dk;
      for (let i = 7; i >= 1; i--) wash(g, lx - 9 * i, GY - 16 - 8 * i, 18 * i, 16 * i, 'amber', 0.03);
      g.globalAlpha = 1;
    }
    rect(g, lx - 7, GY - 16, 14, 18, 'brass1');
    rect(g, lx - 5, GY - 13, 10, 12, dk < 1 ? 'amber' : 'ink');
    if (dk < 0.6) rect(g, lx - 2, GY - 9, 4, 6, 'gold');
    rect(g, lx - 8, GY - 19, 16, 4, 'brass2');
    // the chart, rolled, under his hand
    rect(g, nx + 18, GY - 14, 24, 8, 'parch');
    rect(g, nx + 18, GY - 14, 24, 2, 'cream');
    rect(g, nx + 18, GY - 14, 3, 8, 'parch0');
    if (dead) {
      // a dove goes up out of him, which is the only thing in this game that is a symbol
      const fy = GY - 70 - dk * 230;
      const flap = Math.sin(deadT * 9) * 4;
      disc(g, nx, fy, 5, 'white');
      disc(g, nx + 4, fy - 3, 3, 'white');
      tri(g, nx - 4, fy, nx - 16, fy - 6 + flap, nx - 2, fy + 5, 'white');
      tri(g, nx + 4, fy, nx + 16, fy - 6 - flap, nx + 2, fy + 5, 'bone');
      px(g, nx + 7, fy - 4, 'ink');
    }
  }

  function fullyTyped() { return typed >= (LINES[ix] ? LINES[ix].text.length : 0); }

  /**
   * His last words. THE SHEET IS ON THE LEFT, not across the bottom: a board at the foot
   * of the screen covered the two people it was about -- a dying man and the thing that
   * came for him are the only picture this scene has.
   */
  function drawBoard(g) {
    const l = LINES[ix];
    if (!l) return;
    const bx = 34, bw = 470, by = 132, bh = 286;
    UI.panel(g, bx, by, bw, bh, { style: 'paper', shadow: true });
    if (l.who) {
      const nw = textW(l.who, { font: 7 }) + 34;
      rect(g, bx + 26, by - 13, nw, 26, 'wood0');
      rect(g, bx + 29, by - 10, nw - 6, 20, mix(col('brass3'), P.ink, 0.62));
      rect(g, bx + 29, by - 10, nw - 6, 3, 'brass3');
      text(g, l.who, bx + 26 + nw / 2, by - 6, 'brass3', { font: 7, center: true, shadow: 'ink' });
    }
    wrap(l.text.slice(0, Math.floor(typed)), bw - 56, { font: 7 }).slice(0, 7).forEach((r, i) => {
      text(g, r, bx + 28, by + 34 + i * 26, 'wood0', { font: 7 });
    });
    if (fullyTyped() && Math.floor(t * 2) % 2 === 0) {
      text(g, ix >= LINES.length - 1 ? 'TAKE THE BOAT ▶' : 'NEXT ▶', bx + bw - 28, by + bh - 40,
        'wood1', { font: 7, right: true });
    }
    for (let i = 0; i < LINES.length; i++) {
      rect(g, bx + 28 + i * 12, by + bh - 20, 8, 5, i < ix ? 'parch1' : i === ix ? 'brass2' : 'parch0');
    }
    text(g, 'ESC SKIPS', bx + bw - 28, by + bh - 18, 'parch0', { font: 3, right: true });
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
    drawNoah(g);
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
    if (phase === 'talk') drawBoard(g);
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
    if (!fullyTyped()) { typed = LINES[ix].text.length; Audio.sfx('click'); return; }
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
      const len = LINES[ix] ? LINES[ix].text.length : 0;
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
        skip() { phase = 'give'; deadT = 0; heroX = ARK_X - 80; },
      talk() { heroX = NOAH_X - 152; phase = 'talk'; ix = 0; typed = 0; },
      };
    },
  };
}

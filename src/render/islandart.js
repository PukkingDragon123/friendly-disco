// Island art, for two distances.
//
//   drawIslandFar    a whole island in 60-140px, for the ocean map
//   drawIslandBack   the same island as a full-width backdrop, for a rescue
//
// One file, because they have to look like the same place. The biome's `ground`, `sky`
// and `scenery` (data/islands.js) drive both, so a new biome is a data row and not a new
// renderer -- which is the only way eleven of them stay affordable.
//
// SCENERY VOCABULARY. Each name is a small routine that knows how to draw one kind of
// thing at any scale: hills, wall, tree, bigtrees, vines, waterfall, dunes, mesa, cactus,
// bones, deadtrees, reeds, lilies, bergs, pines, drifts, cone, lavafall, obsidian,
// columns, arch, statue, coralheads, palms, sandbar, spires, surf, ridges, snowcap,
// eyrie, gate, olives, stillwater, mist, fog, clouds, aurora, embers, rainsheet,
// rubblefield, shoals, anvilcloud, flowers.

import { P, col, mix } from '../core/palette.js';
import { makeCanvas, rect, px, line, disc, ellipse, tri, wash, clamp } from '../core/pixel.js';

const H2 = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

/* ------------------------------------------------------------------ far view */

const farCache = new Map();

/**
 * A whole island as a silhouette-with-detail, baked. On the map there are three of these
 * plus your boat, so they are drawn dozens of times a second and must cost one blit.
 */
function bakeFar(island, w, h) {
  const mk = makeCanvas(w, h);
  if (!mk) return null;
  const b = mk.g;
  const G = island.ground || ['moss', 'leaf2', 'leaf1'];
  const R = island.rock || G;
  const cx = w / 2, base = h - 6;

  // THE SILHOUETTE. Every island used to share one dome, and twelve identical outlines
  // is twelve islands the player cannot tell apart on the map. Three numbers give each
  // one its own profile -- how tall it stands, how steeply it rises, and how far it
  // leans -- and the data sets the first two where the biome demands it (a coral cay is
  // a low flat bar, a volcano is a cone) and hashes them off the id where it does not.
  let seedN = 0;
  for (let i = 0; i < island.id.length; i++) seedN += island.id.charCodeAt(i) * (i + 3);
  const relief = island.relief !== undefined ? island.relief : 0.55 + H2(seedN + 7) * 0.45;
  const steep = island.steep !== undefined ? island.steep : 0.42 + H2(seedN) * 0.55;
  const lean = (H2(seedN + 11) - 0.5) * 0.5;         // pushes the summit off-centre
  const bumpy = 0.5 + H2(seedN + 23) * 2.4;          // ridge roughness
  const top = Math.max(6, Math.round((h - 6) * relief));

  const profile = (y) => {
    const f = 1 - y / top;
    if (f <= 0) return 0;
    const ridge = 1 + Math.sin(f * bumpy * 6 + seedN) * 0.07 * (1 - f);
    return Math.round((w / 2 - 4) * Math.pow(f, steep) * ridge);
  };
  // The body is lit from the TOP: rock[0] at the waterline, rock[2] at the summit. That
  // one gradient is most of what makes a shape read as a landmass rather than a cutout.
  for (let y = 0; y < top; y++) {
    const hw = profile(y);
    if (hw <= 0) continue;
    const yy = base - y;
    const off = Math.round(lean * (top - y) * 0.5);
    const f = y / top;
    const c = f < 0.5 ? mix(P[R[0]], P[R[1]], f * 2) : mix(P[R[1]], P[R[2]], (f - 0.5) * 2);
    rect(b, cx - hw + off, yy, hw * 2, 1, c);
    px(b, cx - hw + off, yy, 'ink');
    px(b, cx + hw + off - 1, yy, 'ink');
    // a rim of sunlight along the windward shoulder, two pixels wide
    rect(b, cx - hw + off + 1, yy, 2, 1, mix(c, P.white, 0.3));
  }
  // and the leeward third in shadow, which is the cheapest volume there is
  for (let y = 0; y < top; y++) {
    const hw = profile(y);
    if (hw <= 2) continue;
    const off = Math.round(lean * (top - y) * 0.5);
    const sw = Math.round(hw * 0.6);
    wash(b, cx + off + hw - sw - 1, base - y, sw, 1, 'ink', 0.16);
  }
  // a cliff face on the leeward side: the detail that makes an island read as land
  const cliffSide = H2(seedN + 41) > 0.5 ? 1 : -1;
  for (let y = 0; y < Math.round(top * 0.45); y++) {
    const hw = profile(y);
    const off = Math.round(lean * (top - y) * 0.5);
    const cxx = cx + off + cliffSide * hw;
    rect(b, cxx - (cliffSide > 0 ? 6 : 0), base - y, 6, 1, y % 3 === 0 ? 'stone1' : 'stone0');
    if (y % 4 === 0) px(b, cxx - (cliffSide > 0 ? 5 : -1), base - y, 'stone3');
  }
  // a beach and its surf
  ellipse(b, cx, base + 1, Math.round(w / 2 - 2), 3, 'sand');
  ellipse(b, cx, base + 3, Math.round(w / 2), 2, 'foam');

  scenery(b, island, cx, base, w, top, 1);
  return mk.canvas;
}

export function drawIslandFar(g, island, x, y, w, h, t = 0, o = {}) {
  const k = `${island.id}/${w}/${h}`;
  let cv = farCache.get(k);
  if (cv === undefined) {
    cv = bakeFar(island, w, h);
    if (farCache.size > 40) farCache.clear();
    farCache.set(k, cv);
  }
  const bob = Math.round(Math.sin(t * 0.9 + x * 0.03) * 1);
  if (cv) g.drawImage(cv, Math.round(x - w / 2), Math.round(y - h) + bob);
  // live weather over the top, which is what makes a map island feel alive
  weather(g, island, x, y - h, w, h, t, o.weatherAmt !== undefined ? o.weatherAmt : 1);
}

/* --------------------------------------------------------------- the scenery */

function scenery(b, island, cx, base, w, h, sc) {
  const names = island.scenery || [];
  const G = island.ground || ['moss', 'leaf2', 'leaf1'];
  for (let n = 0; n < names.length; n++) {
    const name = names[n];
    const seed = n * 31 + island.id.length * 7;
    switch (name) {
      case 'hills':
        for (let i = 0; i < 3; i++) {
          const hx = cx + (H2(seed + i) - 0.5) * w * 0.6;
          ellipse(b, hx, base - h * 0.35, w * 0.16, h * 0.16, mix(P[G[1]], P.ink, 0.15));
        }
        break;
      case 'wall': {
        // a dry stone wall running across the slope: one course of stones with a
        // capstone line. The old version was seven tall posts, which read as a fence
        // grid laid over the hill rather than a wall standing on it.
        const wy = Math.round(base - h * 0.22);
        const ww = Math.round(w * 0.62), wx = Math.round(cx - ww / 2);
        rect(b, wx, wy, ww, 3 * sc, 'stone1');
        rect(b, wx, wy, ww, 1, 'stone3');
        for (let i = 0; i < Math.round(ww / 5); i++) {
          px(b, wx + 2 + i * 5, wy + 1 + (i % 2), 'stone0');
          px(b, wx + 4 + i * 5, wy + 2, 'stone2');
        }
        rect(b, wx, wy + 3 * sc, ww, 1, mix(P[G[0]], P.ink, 0.35));
        break;
      }
      case 'tree': case 'olives':
        for (let i = 0; i < 4; i++) {
          const tx = cx + (H2(seed + i * 3) - 0.5) * w * 0.7;
          const ty = base - h * (0.2 + H2(seed + i) * 0.3);
          rect(b, tx, ty, Math.max(1, sc), h * 0.14, 'bark');
          for (let j = 0; j < 6; j++) {
            ellipse(b, tx + (H2(seed + i * 9 + j) - 0.5) * w * 0.1, ty - h * 0.04 * j * 0.6,
              w * 0.06, h * 0.05, j < 2 ? 'leaf1' : j < 4 ? 'leaf2' : 'leaf3');
          }
        }
        break;
      case 'bigtrees': case 'pines': case 'deadtrees': {
        const dead = name === 'deadtrees';
        const pine = name === 'pines';
        for (let i = 0; i < 5; i++) {
          const tx = cx + (H2(seed + i * 5) - 0.5) * w * 0.8;
          const th = h * (0.4 + H2(seed + i) * 0.35);
          rect(b, tx, base - th, Math.max(1, sc * 2), th, dead ? 'wood1' : 'bark');
          if (dead) {
            for (const s2 of [-1, 1]) line(b, tx, base - th + 3, tx + s2 * w * 0.05, base - th - 3, 'wood1');
          } else if (pine) {
            for (let j = 0; j < 4; j++) {
              const cw = w * (0.11 - j * 0.02);
              tri(b, tx - cw, base - th + j * th * 0.24 + th * 0.2, tx + cw,
                base - th + j * th * 0.24 + th * 0.2, tx, base - th + j * th * 0.24 - th * 0.02,
                j % 2 ? 'leaf1' : 'cloth1');
            }
          } else {
            for (let j = 0; j < 7; j++) {
              ellipse(b, tx + (H2(seed + i * 7 + j) - 0.5) * w * 0.14, base - th - h * 0.02 + j * -h * 0.03,
                w * 0.09, h * 0.06, j < 2 ? 'leaf0' : j < 5 ? 'leaf1' : 'leaf2');
            }
          }
        }
        break;
      }
      case 'cactus':
        for (let i = 0; i < 4; i++) {
          const tx = cx + (H2(seed + i * 4) - 0.5) * w * 0.7;
          const th = h * 0.16;
          rect(b, tx, base - th, Math.max(2, sc * 2), th, 'green0');
          rect(b, tx - w * 0.03, base - th * 0.7, w * 0.03, Math.max(1, sc), 'green0');
        }
        break;
      case 'dunes':
        for (let i = 0; i < 4; i++) {
          ellipse(b, cx + (H2(seed + i) - 0.5) * w * 0.8, base - h * 0.1 - i * h * 0.05,
            w * 0.2, h * 0.07, i % 2 ? 'sand' : mix(P.sand, P.rust, 0.2));
        }
        break;
      case 'mesa':
        // a flat-topped butte: a slab with a lit top and a shadowed flank
        for (let i = 0; i < 2; i++) {
          const mx = cx + (i * 2 - 1) * w * 0.22;
          const mh = h * (0.3 + H2(seed + i) * 0.22);
          const mw = w * 0.12;
          rect(b, mx - mw, base - mh, mw * 2, mh, 'stone1');
          rect(b, mx - mw, base - mh, mw, mh, 'stone2');
          rect(b, mx - mw, base - mh, mw * 2, Math.max(1, sc), 'stone3');
          rect(b, mx - mw, base - mh * 0.5, mw * 2, 1, 'stone0');
        }
        break;
      case 'spires': case 'ridges':
        // spurs, not boxes. A mountain's shoulders are triangles; the rectangles this
        // used to draw read as concrete buildings parked on the hillside.
        for (let i = 0; i < 3; i++) {
          const mx = cx + (i - 1) * w * (name === 'spires' ? 0.26 : 0.2);
          const mh = h * (0.34 + H2(seed + i) * 0.34);
          const mw = w * (name === 'spires' ? 0.045 : 0.1);
          tri(b, mx - mw, base, mx + mw, base, mx + mw * 0.3, base - mh, 'stone1');
          tri(b, mx - mw, base, mx, base, mx + mw * 0.1, base - mh * 0.9, 'stone2');
          px(b, mx + mw * 0.3, base - mh, 'stone3');
        }
        break;
      case 'cone':
        tri(b, cx - w * 0.3, base, cx + w * 0.3, base, cx, base - h * 0.75, 'ash');
        tri(b, cx - w * 0.2, base, cx + w * 0.05, base, cx - w * 0.02, base - h * 0.7, 'stone0');
        for (let i = 0; i < 5; i++) px(b, cx + (H2(seed + i) - 0.5) * w * 0.1, base - h * 0.74, 'lava2');
        break;
      case 'lavafall': case 'waterfall': {
        const lava = name === 'lavafall';
        const fx = cx + w * 0.18;
        for (let y = 0; y < h * 0.5; y++) {
          rect(b, fx, base - h * 0.6 + y, Math.max(2, sc * 2), 1,
            lava ? (y % 4 < 2 ? 'lava1' : 'lava2') : (y % 4 < 2 ? 'foam' : 'water3'));
        }
        ellipse(b, fx + 1, base - h * 0.1, w * 0.06, h * 0.03, lava ? 'lava1' : 'foam');
        break;
      }
      case 'columns': case 'gate': case 'arch':
        for (let i = 0; i < (name === 'columns' ? 5 : 2); i++) {
          const px2 = cx + (i - (name === 'columns' ? 2 : 0.5)) * w * 0.16;
          const ph = h * 0.5;
          rect(b, px2, base - ph, Math.max(2, sc * 3), ph, 'stone2');
          rect(b, px2, base - ph, Math.max(1, sc), ph, 'stone4');
          rect(b, px2 - 1, base - ph - 2, Math.max(4, sc * 5), 2, 'stone3');
        }
        if (name !== 'columns') {
          rect(b, cx - w * 0.1, base - h * 0.52, w * 0.28, Math.max(2, sc * 2), 'stone3');
        }
        break;
      case 'statue':
        rect(b, cx - w * 0.05, base - h * 0.4, w * 0.1, h * 0.4, 'stone1');
        disc(b, cx, base - h * 0.44, w * 0.06, 'stone3');
        break;
      case 'snowcap': {
        // snow ON THE SUMMIT, which is where snow is. Scattered along the shore with the
        // bergs it just looked like four tents.
        const capH = Math.max(4, Math.round(h * 0.24));
        for (let y = 0; y < capH; y++) {
          const f = y / capH;                      // 0 at the summit, 1 at the snowline
          const ww = Math.round(w * 0.11 * Math.pow(f, 0.8) + 1);
          rect(b, cx - ww, base - h + y, ww * 2, 1,
            y < 2 ? 'white' : y % 4 === 0 ? 'snow0' : 'snow1');
        }
        // a couple of snow fingers running down the gullies below the line
        for (let i = 0; i < 3; i++) {
          const fx = cx + (i - 1) * w * 0.06;
          for (let y = 0; y < h * 0.12; y++) px(b, fx, base - h + capH + y, y % 3 ? 'snow1' : 'snow0');
        }
        break;
      }
      case 'bergs': case 'drifts':
        for (let i = 0; i < 4; i++) {
          const bx = cx + (H2(seed + i * 2) - 0.5) * w * 0.8;
          const bh = h * (0.12 + H2(seed + i) * 0.2);
          tri(b, bx - w * 0.09, base - h * 0.05, bx + w * 0.09, base - h * 0.05, bx, base - bh, 'snow1');
          tri(b, bx, base - h * 0.05, bx + w * 0.09, base - h * 0.05, bx + w * 0.03, base - bh * 0.7, 'snow0');
        }
        break;
      case 'coralheads':
        for (let i = 0; i < 6; i++) {
          const bx = cx + (H2(seed + i * 3) - 0.5) * w * 0.85;
          disc(b, bx, base - h * 0.06, Math.max(2, w * 0.05), i % 2 ? 'coral0' : 'coral1');
        }
        break;
      case 'palms':
        for (let i = 0; i < 3; i++) {
          const tx = cx + (i - 1) * w * 0.28;
          const th = h * 0.4;
          for (let y = 0; y < th; y++) px(b, tx + Math.round(Math.sin(y * 0.1) * 2), base - y, 'bark');
          for (let a = -2; a <= 2; a++) {
            line(b, tx, base - th, tx + a * w * 0.09, base - th + Math.abs(a) * h * 0.04 - h * 0.04, 'leaf2');
          }
        }
        break;
      case 'reeds': case 'flowers': {
        const flower = name === 'flowers';
        for (let i = 0; i < 16; i++) {
          const rx = cx + (H2(seed + i) - 0.5) * w * 0.9;
          const rh = h * (0.05 + H2(seed + i * 2) * 0.07);
          rect(b, rx, base - rh, Math.max(1, sc), rh, flower ? 'leaf2' : 'moss');
          if (flower) px(b, rx, base - rh - 1, i % 3 === 0 ? 'pink' : i % 3 === 1 ? 'gold' : 'white');
        }
        break;
      }
      case 'lilies': case 'stillwater': case 'sandbar': case 'shoals':
        for (let i = 0; i < 5; i++) {
          ellipse(b, cx + (H2(seed + i) - 0.5) * w * 0.8, base - h * 0.04,
            w * 0.07, Math.max(1, h * 0.02), name === 'lilies' ? 'leaf2' : 'foam');
        }
        break;
      case 'obsidian': case 'rubblefield': case 'bones':
        for (let i = 0; i < 9; i++) {
          const rx = cx + (H2(seed + i * 5) - 0.5) * w * 0.9;
          const c = name === 'bones' ? 'bone' : name === 'obsidian' ? 'ink' : 'stone1';
          rect(b, rx, base - h * 0.05 - (i % 2) * 2, Math.max(2, w * 0.04), Math.max(2, h * 0.03), c);
        }
        break;
      case 'vines':
        for (let i = 0; i < 7; i++) {
          const vx = cx + (H2(seed + i * 4) - 0.5) * w * 0.8;
          for (let y = 0; y < h * 0.3; y++) px(b, vx + Math.round(Math.sin(y * 0.3 + i) * 2), base - h * 0.6 + y, 'leaf1');
        }
        break;
      case 'eyrie': {
        // a stick nest on a ledge, with something white sitting in it
        const ex = cx + w * 0.2, ey = base - h * 0.5;
        rect(b, ex - w * 0.07, ey, w * 0.14, 2, 'stone2');
        for (let i = 0; i < 5; i++) {
          const a = -0.4 - i * 0.32;
          line(b, ex, ey - 1, ex + Math.cos(a) * w * 0.07, ey - 1 + Math.sin(a) * 4, 'bark');
        }
        px(b, ex, ey - 3, 'white');
        px(b, ex + 1, ey - 3, 'bone');
        break;
      }
      default: break;
    }
  }
}

/* ---------------------------------------------------------------- weather */

/**
 * Live weather. Everything here is a handful of pixels driven by `t`, because weather is
 * the cheapest possible way to make a static backdrop feel like it is happening.
 */
export function weather(g, island, x, y, w, h, t, amt = 1) {
  const a = clamp(amt, 0, 1);
  if (a <= 0.02) return;
  switch (island.weather) {
    case 'rain': case 'storm': {
      const n = Math.round((island.weather === 'storm' ? 34 : 20) * a);
      for (let i = 0; i < n; i++) {
        const rx = x + ((i * 61 + Math.floor(t * 420)) % w);
        const ry = y + ((i * 37 + Math.floor(t * 760)) % h);
        line(g, rx, ry, rx - 2, ry + 6, i % 4 ? 'water3' : 'foam');
      }
      break;
    }
    case 'snow': {
      const n = Math.round(20 * a);
      for (let i = 0; i < n; i++) {
        const sx = x + ((i * 71 + Math.floor(t * 40 + Math.sin(t + i) * 12)) % w);
        const sy = y + ((i * 43 + Math.floor(t * 90)) % h);
        px(g, sx, sy, i % 3 ? 'white' : 'snow1');
      }
      break;
    }
    case 'ash': {
      const n = Math.round(16 * a);
      for (let i = 0; i < n; i++) {
        const sx = x + ((i * 53 + Math.floor(t * 26)) % w);
        const sy = y + ((i * 29 + Math.floor(t * 70)) % h);
        px(g, sx, sy, i % 4 === 0 ? 'lava2' : 'ash');
      }
      break;
    }
    case 'fog': case 'mist':
      for (let i = 0; i < 4; i++) {
        const fy = y + h * (0.4 + i * 0.14) + Math.sin(t * 0.4 + i) * 2;
        wash(g, x, fy, w, Math.max(2, h * 0.06), 'bone', 0.09 * a);
      }
      break;
    case 'heat':
      for (let i = 0; i < 5; i++) {
        wash(g, x, y + h * (0.7 + i * 0.05) + Math.sin(t * 2 + i) * 1, w, 1, 'amber', 0.1 * a);
      }
      break;
    case 'wind':
      for (let i = 0; i < 8; i++) {
        const wy = y + ((i * 37 + Math.floor(t * 60)) % h);
        const wx = x + ((i * 91 + Math.floor(t * 300)) % w);
        rect(g, wx, wy, 5, 1, 'white');
      }
      break;
    case 'holy':
      for (let i = 0; i < 7; i++) {
        const a2 = (i / 7) * Math.PI * 2 + t * 0.4;
        px(g, x + w / 2 + Math.cos(a2) * w * 0.32, y + h * 0.4 + Math.sin(a2) * h * 0.3,
          i % 2 ? 'gold' : 'cream');
      }
      break;
    default: break;
  }
  // storms flash
  if (island.weather === 'storm' && ((t * 1.7) % 3) < 0.09) {
    wash(g, x, y, w, h, 'white', 0.32 * a);
  }
}

/* --------------------------------------------------------------- back view */

const backCache = new Map();

/**
 * The island as a full-width backdrop for a rescue: sky, horizon, distant headlands, then
 * the near ground the level is played on. Baked, because it is the single biggest static
 * thing on screen and it never changes during a level.
 */
export function drawIslandBack(g, island, x, y, w, h, t = 0, o = {}) {
  const k = `${island.id}/${w}/${h}/${o.horizon || 0}`;
  let cv = backCache.get(k);
  if (cv === undefined) {
    cv = bakeBack(island, w, h, o.horizon || Math.round(h * 0.32));
    if (backCache.size > 12) backCache.clear();
    backCache.set(k, cv);
  }
  if (cv) g.drawImage(cv, x, y);
  weather(g, island, x, y, w, h, t, o.weatherAmt !== undefined ? o.weatherAmt : 1);
}

function bakeBack(island, w, h, horizon) {
  const mk = makeCanvas(w, h);
  if (!mk) return null;
  const b = mk.g;
  const S = island.sky || ['sky', 'ice', 'cream'];
  const G = island.ground || ['moss', 'leaf2', 'leaf1'];

  // sky
  for (let y = 0; y < horizon; y++) {
    const f = y / horizon;
    const i = Math.min(S.length - 2, Math.floor(f * (S.length - 1)));
    rect(b, 0, y, w, 1, mix(P[S[i]], P[S[i + 1]], f * (S.length - 1) - i));
  }
  // a band of sea between the sky and the land
  const seaH = Math.round(h * 0.1);
  for (let y = 0; y < seaH; y++) {
    rect(b, 0, horizon + y, w, 1, y < 2 ? 'water3' : y < seaH * 0.6 ? 'water2' : 'water1');
    if (y % 3 === 1) for (let i = 0; i < w; i += 17) px(b, i + ((y * 7) % 13), horizon + y, 'foam');
  }
  // distant headlands: three layers, each paler, which is the whole illusion of distance
  for (let layer = 0; layer < 3; layer++) {
    const tint = 0.5 - layer * 0.18;
    const hh = Math.round(h * (0.06 + layer * 0.03));
    for (let i = -1; i < 5; i++) {
      const hx = i * w * 0.26 + H2(layer * 9 + i) * w * 0.18;
      const hw = w * (0.14 + H2(layer + i * 3) * 0.1);
      for (let yy = 0; yy < hh; yy++) {
        const f = 1 - yy / hh;
        const ww = Math.round(hw * Math.pow(f, 0.5));
        rect(b, hx - ww, horizon + seaH - yy - layer * 2, ww * 2, 1,
          mix(P[G[2]], P[S[0]], tint));
      }
    }
  }
  // the near ground, where the level happens
  const groundY = horizon + seaH;
  for (let y = groundY; y < h; y++) {
    const f = (y - groundY) / Math.max(1, h - groundY);
    const i = Math.min(G.length - 2, Math.floor(f * (G.length - 1)));
    rect(b, 0, y, w, 1, mix(P[G[i]], P[G[i + 1]], f * (G.length - 1) - i));
    if (y % 7 === 3) rect(b, 0, y, w, 1, mix(P[G[i]], P.white, 0.05));
  }
  // scenery along the shoreline, at backdrop scale
  scenery(b, island, w * 0.22, groundY + 6, w * 0.5, h * 0.4, 2);
  scenery(b, island, w * 0.78, groundY + 4, w * 0.45, h * 0.35, 2);
  return mk.canvas;
}

export function clearIslandCache() { farCache.clear(); backCache.clear(); }
void col;

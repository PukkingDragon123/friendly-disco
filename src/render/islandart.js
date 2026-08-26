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
import {
  makeBuf, bset, bget, brect, bline, btri, orb, blob, limb, orbShade, outline, flush,
} from './pixbuf.js';
import { drawPlant } from './flora.js';

const H2 = (n) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

// Which flora palette an island's biome plants itself with, and what grows there.
export const FLORA_BIOME = {
  grassland: 'grassland', jungle: 'jungle', desert: 'desert', swamp: 'swamp',
  snow: 'snow', tundra: 'tundra', volcano: 'volcano', ruins: 'ruins', coral: 'coral',
  storm: 'storm', mountain: 'mountain', peak: 'peak', sacred: 'sacred',
};
export const FLORA_KINDS = {
  default: ['grass', 'grass', 'grass', 'tuft', 'flower', 'bush'],
  grassland: ['grass', 'grass', 'grass', 'tuft', 'flower', 'bush'],
  jungle: ['grass', 'fern', 'fern', 'palm', 'bush', 'grass'],
  desert: ['grass', 'grass', 'tuft', 'palm', 'flower'],
  swamp: ['grass', 'reed', 'cattail', 'fern', 'bush'],
  snow: ['grass', 'grass', 'tuft', 'sapling'],
  tundra: ['grass', 'grass', 'tuft', 'bush'],
  volcano: ['grass', 'tuft', 'tuft'],
  ruins: ['grass', 'grass', 'fern', 'flower', 'bush'],
  coral: ['grass', 'grass', 'palm', 'flower', 'tuft'],
  storm: ['grass', 'reed', 'grass', 'fern'],
  mountain: ['grass', 'grass', 'tuft', 'sapling'],
  peak: ['grass', 'tuft', 'tuft'],
  sacred: ['grass', 'flower', 'flower', 'tuft', 'sapling'],
};

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

  // UNDERGROWTH. An island silhouette with four tree blobs on it reads as a logo; the
  // thing that makes it read as somewhere you could land is the fifty small plants
  // between the trees. Baked at bend 0 -- the scene draws a dozen live ones over the top
  // for movement, and a dozen moving plants against fifty still ones is plenty of wind.
  const fbio = FLORA_BIOME[island.biome] || island.biome || 'grassland';
  const kinds = FLORA_KINDS[island.biome] || FLORA_KINDS.default;
  const spots = [];
  for (let i = 0; i < 34; i++) {
    // biased LOW: undergrowth belongs round the skirts of a hill, and a crown buried in
    // bushes loses the silhouette that tells the three islands apart at a glance
    const fy = Math.round(Math.pow(H2(seedN + i * 5), 1.7) * top * 0.9);
    const hw = profile(fy);
    if (hw <= 6) continue;
    const off = Math.round(lean * (top - fy) * 0.5);
    const fx = cx + off + Math.round((H2(seedN + i * 7) - 0.5) * (hw * 2 - 10));
    spots.push([fx, base - fy, kinds[Math.floor(H2(seedN + i * 11) * kinds.length)],
      Math.floor(H2(seedN + i * 13) * 4)]);
  }
  spots.sort((a, c) => a[1] - c[1]);
  for (const [fx, fy, kind, vv] of spots) {
    drawPlant(b, fx, fy, kind, { biome: fbio, v: vv, bend: 0 });
  }
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
  if (cv) g.drawImage(cv, Math.round((x - w / 2) / 2) * 2, Math.round(((y - h) + bob) / 2) * 2);
  // live weather over the top, which is what makes a map island feel alive
  weather(g, island, x, y - h, w, h, t, o.weatherAmt !== undefined ? o.weatherAmt : 1);
}

/* --------------------------------------------------------------- stamps

Scenery items are painted into a small pixbuf at HALF RESOLUTION, outlined, and blitted at
2x. Same treatment as the animals and the cast, for the same two reasons: every tree and
rock gets a two-pixel dark contour, which is what makes a piece of scenery read as an
object rather than as a smudge of a similar colour, and no detail can be finer than a 2x2
block, which forces each thing to be a SHAPE.

The shape is the whole problem. The first pass built every tree from overlapping shaded
spheres, and five spheres of one colour with one outline round the lot is an ellipse on a
stick -- a lollipop. A tree reads because its silhouette is LUMPY and because the canopy
has a lit top and a dark underside. Both of those are now explicit.
*/

/**
 * Paint into a half-size buffer and blit it at 2x.
 *
 * `w` and `h` are SCREEN pixels; `paint` receives the buffer and its own half-space
 * dimensions, so everything inside is authored in art pixels.
 */
function stamp(g, x, y, w, h, paint) {
  const bw = Math.max(1, Math.ceil(w / 2)), bh = Math.max(1, Math.ceil(h / 2));
  const buf = makeBuf(bw, bh);
  paint(buf, bw, bh);
  outline(buf, 'ink');
  flush(buf, g, Math.round(x), Math.round(y), 2);
}

/** Three tones off a fake normal — the same shader the sprites use, for the same reason. */
function shade3(ramp) {
  const dk = ramp[0], md = ramp[1], lt = ramp[2] || ramp[1];
  return (nx, ny) => {
    const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
    const lam = nx * -0.52 + ny * -0.66 + nz * 0.54;
    return lam > 0.55 ? lt : lam > -0.1 ? md : dk;
  };
}

/** A shaded disc in half-space, shaded as part of a bigger mass centred on (mx,my). */
function clump(b, cx, cy, r, mx, my, mr, sh) {
  for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
    for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
      if (x * x + y * y > r * r) continue;
      // the normal comes from the position within the WHOLE mass, not within this disc:
      // shading each disc separately is what made a canopy look like a pile of balls
      bset(b, cx + x, cy + y, sh((cx + x - mx) / mr, (cy + y - my) / mr));
    }
  }
}

/**
 * A canopy: one lumpy mass, lit as a single form, with notches cut out of its rim.
 *
 * The notches are the trick. Without them the union of five discs is a smooth blob and the
 * contour pass wraps it into an ellipse; three or four single-pixel bites out of the edge
 * and the same mass reads as foliage.
 */
function canopy(b, cx, cy, r, ramp, seed = 0) {
  const sh = shade3(ramp);
  const pts = [
    [0, 0, 1.0], [-r * 0.78, r * 0.3, 0.76], [r * 0.78, r * 0.28, 0.76],
    [-r * 0.42, -r * 0.62, 0.62], [r * 0.46, -r * 0.56, 0.6],
  ];
  for (const [dx, dy, s] of pts) clump(b, Math.round(cx + dx), Math.round(cy + dy), r * s, cx, cy, r * 1.6, sh);
  // notches, at fixed angles off the seed so a stand of trees is not five identical trees
  for (let i = 0; i < 4; i++) {
    const a = ((seed * 37 + i * 91) % 360) * Math.PI / 180;
    const bx = Math.round(cx + Math.cos(a) * r * 1.5), by = Math.round(cy + Math.sin(a) * r * 1.1);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) bset(b, bx + dx, by + dy, null);
  }
  // and one bright row along the crown, so the mass has a top
  for (let i = -Math.round(r * 0.7); i <= Math.round(r * 0.4); i++) {
    bset(b, cx + i, Math.round(cy - r * 0.95 + Math.abs(i) * 0.35), ramp[ramp.length - 1]);
  }
}

/** A trunk: flared at the foot, two-toned, with roots. A straight bar is a post. */
function trunk(b, cx, by, h, w, lean = 0) {
  for (let i = 0; i < h; i++) {
    const f = i / Math.max(1, h);
    const ww = Math.max(2, Math.round(w * (1 + (1 - f) * 0.7)));
    const x0 = cx - (ww >> 1) + Math.round(lean * f * f);
    brect(b, x0, by - i, ww, 1, 'bark');
    bset(b, x0, by - i, 'wood2');
    if (i % 4 === 2) bset(b, x0 + ww - 1, by - i, 'wood0');
  }
  brect(b, cx - w - 1, by, 2, 1, 'bark');
  brect(b, cx + w, by, 2, 1, 'bark');
}

function treeStamp(g, x, base, th, tw, ramp, o = {}) {
  const W = Math.round(tw * 2.6 + 12), H = Math.round(th + tw * 1.4 + 14);
  stamp(g, x - W / 2, base - H + 4, W, H, (b, bw, bh) => {
    const cx = bw >> 1, by = bh - 2;
    const hh = Math.round(th / 2), hr = Math.max(3, Math.round(tw / 2));
    trunk(b, cx, by, hh, Math.max(1, Math.round(tw * 0.09)), (o.lean || 0) / 2);
    canopy(b, cx + Math.round((o.lean || 0) / 2), by - hh - Math.round(hr * 0.3), hr, ramp, o.seed || 0);
  });
}

/** A bush: a low canopy with no trunk. */
function bushStamp(g, x, base, r, ramp) {
  const W = Math.round(r * 3.6), H = Math.round(r * 3);
  stamp(g, x - W / 2, base - H + 3, W, H, (b, bw, bh) => {
    canopy(b, bw >> 1, bh - Math.round(r * 0.55) - 2, Math.max(2, Math.round(r * 0.45)), ramp, r | 0);
  });
}

/**
 * A rock: FACETS, not a sphere.
 *
 * A shaded sphere in grey is a ball bearing. A stone reads because it has flat planes
 * meeting at hard edges -- a lit top, a mid-tone left face, a dark right face -- and
 * because its outline has corners in it.
 */
function rockStamp(g, x, base, r, ramp) {
  const W = Math.round(r * 2.8), H = Math.round(r * 2.4);
  stamp(g, x - W / 2, base - H + 3, W, H, (b, bw, bh) => {
    const cx = bw >> 1, by = bh - 2;
    const hr = Math.max(2, Math.round(r / 2));
    const lo = ramp[0], md = ramp[1], hi = ramp[2] || ramp[1];
    // the body: a squat hexagon, widest one row above the foot
    for (let i = 0; i <= hr * 1.6; i++) {
      const f = i / (hr * 1.6);
      const ww = Math.round(hr * (0.45 + (1 - Math.abs(f - 0.75) / 0.75) * 0.55));
      brect(b, cx - ww, by - i, ww * 2 + 1, 1, md);
    }
    // the top facet, lit
    for (let i = 0; i <= hr * 0.55; i++) {
      const ww = Math.round(hr * (0.5 - i / (hr * 1.4)));
      brect(b, cx - ww - 1, by - Math.round(hr * 1.6) + i, ww * 2 + 1, 1, i === 0 ? hi : md);
    }
    // the right face, in shadow, and one crack
    for (let i = 0; i <= hr * 1.4; i++) {
      const f = i / (hr * 1.4);
      const ww = Math.round(hr * (0.9 - f * 0.5));
      brect(b, cx + Math.round(hr * 0.25), by - i, Math.max(1, ww - Math.round(hr * 0.25)), 1, lo);
    }
    bline(b, cx - Math.round(hr * 0.5), by - Math.round(hr * 1.3), cx + Math.round(hr * 0.2), by - Math.round(hr * 0.4), lo);
  });
}

/** A pine: stacked tiers, which is the only conifer shape that reads at this size. */
function pineStamp(g, x, base, th, tw) {
  const W = Math.round(tw * 2.4 + 10), H = Math.round(th + 12);
  stamp(g, x - W / 2, base - H + 3, W, H, (b, bw, bh) => {
    const cx = bw >> 1, by = bh - 2;
    const hh = Math.round(th / 2), hw = Math.max(2, Math.round(tw / 2));
    trunk(b, cx, by, Math.round(hh * 0.22), 1, 0);
    const tiers = 4;
    for (let k = 0; k < tiers; k++) {
      const f = k / (tiers - 1);
      const ty = by - Math.round(hh * (0.18 + f * 0.78));
      const wid = Math.max(1, Math.round(hw * (1 - f * 0.72)));
      const dep = Math.max(2, Math.round(hh * 0.2));
      for (let dx = -wid; dx <= wid; dx++) {
        const hgt = Math.round((1 - Math.abs(dx) / (wid + 1)) * dep) + 1;
        for (let j = 0; j < hgt; j++) {
          bset(b, cx + dx, ty - j, dx < -wid * 0.3 ? 'leaf2' : dx < wid * 0.35 ? 'leaf1' : 'leaf0');
        }
      }
      // a lit edge along each tier's upper left, so the tiers separate
      for (let dx = -wid; dx < 0; dx++) bset(b, cx + dx, ty - Math.round((1 - Math.abs(dx) / (wid + 1)) * dep), 'leaf3');
    }
    bset(b, cx, by - hh - 1, 'leaf3');
  });
}

/**
 * A mountain: a ridge, a lit face and a shaded face.
 *
 * Three shaded domes on a horizon are three stains -- and if the width comes from
 * sqrt(1-f^2) with f running top-down, they are three UPSIDE-DOWN domes, which read as a
 * row of satellite dishes. A mountain has a peak that is off centre, a straight lit flank,
 * a straight dark flank, and a hard line where they meet.
 */
function mountainStamp(g, x, base, w, h, ramp, o = {}) {
  const W = Math.round(w), H = Math.round(h + 6);
  stamp(g, x - W / 2, base - H, W, H, (b, bw, bh) => {
    const by = bh - 1;
    const peak = Math.round(bw * (o.peak !== undefined ? o.peak : 0.42));
    const top = 1;
    const lo = ramp[0], md = ramp[1], hi = ramp[2] || ramp[1];
    for (let y = top; y <= by; y++) {
      const f = (y - top) / Math.max(1, by - top);
      // the two flanks have different slopes, which is what stops it being a triangle
      const lw = Math.round(peak * f);
      const rw = Math.round((bw - peak) * Math.pow(f, 0.86));
      for (let x2 = peak - lw; x2 <= peak + rw; x2++) {
        const across = (x2 - (peak - lw)) / Math.max(1, lw + rw);
        bset(b, x2, y, across < 0.42 ? md : across < 0.52 ? lo : lo);
      }
      // the lit flank
      for (let x2 = peak - lw; x2 < peak - lw + Math.max(1, Math.round(lw * 0.5)); x2++) bset(b, x2, y, md);
      for (let x2 = peak - lw; x2 < peak - lw + 2; x2++) bset(b, x2, y, hi);
    }
    // a snow cap or a bare crown
    if (o.snow) {
      for (let y = top; y < top + Math.max(2, Math.round(bh * 0.22)); y++) {
        const f = (y - top) / Math.max(1, Math.round(bh * 0.22));
        const lw = Math.round(peak * f * 0.5), rw = Math.round((bw - peak) * f * 0.4);
        for (let x2 = peak - lw; x2 <= peak + rw; x2++) bset(b, x2, y, x2 < peak ? 'white' : 'ice');
      }
    }
    // two gullies down the dark flank, so the face is not flat
    for (let k = 0; k < 2; k++) {
      const sx = peak + Math.round((bw - peak) * (0.3 + k * 0.35));
      for (let y = Math.round(bh * 0.3); y <= by; y++) {
        if (bget(b, sx + Math.round((y - bh * 0.3) * 0.2), y) !== null) {
          bset(b, sx + Math.round((y - bh * 0.3) * 0.2), y, lo);
        }
      }
    }
  });
}

/* --------------------------------------------------------------- the scenery */

function scenery(b, island, cx, base, w, h, sc) {
  const names = island.scenery || [];
  const G = island.ground || ['moss', 'leaf2', 'leaf1'];
  for (let n = 0; n < names.length; n++) {
    const name = names[n];
    const seed = n * 31 + island.id.length * 7;
    switch (name) {
      case 'hills': {
        // three mountains, near to far, each with its own peak offset so the ridge line
        // is not a repeat
        for (let i = 0; i < 3; i++) {
          const hx = cx + (H2(seed + i) - 0.5) * w * 0.66;
          const hw = w * (0.3 + H2(seed + i * 3) * 0.16);
          const hh = h * (0.2 + H2(seed + i * 5) * 0.14);
          const shaded = mix(P[G[1]], P.ink, 0.3);
          mountainStamp(b, hx, base - h * 0.24, hw, hh,
            [shaded, P[G[1]], mix(P[G[1]], P.white, 0.16)],
            { peak: 0.3 + H2(seed + i * 7) * 0.4, snow: island.biome === 'tundra' || island.biome === 'peak' });
        }
        break;
      }
      case 'wall': {
        // a dry stone wall running across the slope: one course of stones with a
        // capstone line. The old version was seven tall posts, which read as a fence
        // grid laid over the hill rather than a wall standing on it.
        // built out of STONES, in two courses, with capstones and a shadow at its foot.
        // One grey bar with speckles on it read as a kerb.
        // ON THE GROUND. At base - h*0.24 this sat up level with the hilltops, a grey
        // brick strip floating across the sky that read as a railway viaduct.
        const wy = Math.round(base - h * 0.06);
        const ww = Math.round(w * 0.62), wx = Math.round(cx - ww / 2);
        const wh = Math.max(5, 4 * sc);
        stamp(b, wx, wy - 2, ww, wh + 4, (bb) => {
          for (let course = 0; course < 2; course++) {
            const cy2 = 2 + course * Math.round(wh / 2);
            for (let i = 0; i < Math.round(ww / 6); i++) {
              const sx2 = (course % 2 ? 3 : 0) + i * 6;
              const sw = 5 + (i % 2);
              const sh = Math.max(2, Math.round(wh / 2) - 1);
              for (let yy = 0; yy < sh; yy++) {
                for (let xx = 0; xx < sw; xx++) {
                  const t = yy / sh;
                  bset(bb, sx2 + xx, cy2 + yy,
                    t < 0.3 ? 'stone3' : t < 0.7 ? 'stone2' : 'stone1');
                }
              }
              bset(bb, sx2, cy2, 'stone4');
            }
          }
          for (let i = 0; i < ww; i += 4) brect(bb, i, 0, 3, 2, 'stone3');
        });
        rect(b, wx, wy + wh + 2, ww, 1, mix(P[G[0]], P.ink, 0.4));
        break;
      }
      case 'tree': case 'olives': {
        const olive = name === 'olives';
        for (let i = 0; i < 4; i++) {
          const tx = cx + (H2(seed + i * 3) - 0.5) * w * 0.72;
          const th = h * (0.17 + H2(seed + i) * 0.13);
          treeStamp(b, tx, base - h * 0.04, th, Math.max(5, w * 0.075),
            olive ? ['leaf0', 'leaf1', 'moss', 'leaf3'] : ['leaf0', 'leaf1', 'leaf2', 'leaf3'],
            { lean: (H2(seed + i * 7) - 0.5) * 4, lobes: olive ? 4 : 5 });
        }
        break;
      }
      case 'bigtrees': case 'pines': case 'deadtrees': {
        for (let i = 0; i < 5; i++) {
          const tx = cx + (H2(seed + i * 5) - 0.5) * w * 0.82;
          const th = h * (0.3 + H2(seed + i) * 0.28);
          if (name === 'pines') {
            pineStamp(b, tx, base - h * 0.03, th, Math.max(4, w * 0.06));
          } else if (name === 'deadtrees') {
            // bare: a leaning trunk and three broken limbs. No canopy, so the SHAPE has
            // to carry it, and a straight pole carries nothing.
            const bw = Math.round(w * 0.16), bh = Math.round(th + 10);
            stamp(b, tx - bw / 2, base - bh, bw, bh, (bb) => {
              const bcx = Math.round(bw / 2), bby = bh - 3;
              const lean = (H2(seed + i * 11) - 0.5) * 5;
              for (let k = 0; k < th; k++) {
                const f = k / th;
                brect(bb, bcx + Math.round(lean * f * f), bby - k, 2, 1, k % 6 === 0 ? 'wood0' : 'wood1');
              }
              for (let k = 0; k < 3; k++) {
                const f = 0.45 + k * 0.2;
                const sgn = k % 2 ? 1 : -1;
                limb(bb, bcx + lean * f * f, bby - th * f,
                  bcx + lean + sgn * bw * 0.4, bby - th * f - 6 - k * 2,
                  1.4, 0.8, ['wood0', 'wood1', 'wood2']);
              }
            });
          } else {
            treeStamp(b, tx, base - h * 0.03, th, Math.max(7, w * 0.1),
              ['cloth0', 'leaf0', 'leaf1', 'leaf3'],
              { lean: (H2(seed + i * 13) - 0.5) * 6, lobes: 5 });
          }
        }
        break;
      }
      case 'cactus':
        for (let i = 0; i < 4; i++) {
          const tx = cx + (H2(seed + i * 4) - 0.5) * w * 0.72;
          const th = Math.max(10, h * 0.2);
          const cw = Math.round(w * 0.11), chh = Math.round(th + 8);
          stamp(b, tx - cw / 2, base - chh, cw, chh, (bb) => {
            const bcx = Math.round(cw / 2), bby = chh - 3;
            limb(bb, bcx, bby, bcx, bby - th, 2.6, 2.2, ['green0', 'moss', 'leaf2']);
            orb(bb, bcx, bby - th, 2.4, orbShade(['green0', 'moss', 'leaf2']));
            // one arm up, one out: a bare column is a post
            limb(bb, bcx, bby - th * 0.6, bcx - cw * 0.28, bby - th * 0.6, 1.8, 1.5,
              ['green0', 'moss', 'leaf2']);
            limb(bb, bcx - cw * 0.28, bby - th * 0.6, bcx - cw * 0.28, bby - th * 0.85,
              1.6, 1.3, ['green0', 'moss', 'leaf2']);
            for (let k = 0; k < th; k += 3) bset(bb, bcx - 1, bby - k, 'leaf2');
            for (let k = 2; k < th; k += 5) bset(bb, bcx + 1, bby - k, 'green0');
          });
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
      case 'rocks':
        for (let i = 0; i < 5; i++) {
          rockStamp(b, cx + (H2(seed + i * 3) - 0.5) * w * 0.9, base - h * 0.02,
            Math.max(2, w * (0.02 + H2(seed + i) * 0.03)), ['stone0', 'stone1', 'stone2', 'stone3']);
        }
        break;
      case 'scrub':
        for (let i = 0; i < 6; i++) {
          bushStamp(b, cx + (H2(seed + i * 5) - 0.5) * w * 0.9, base - h * 0.02,
            Math.max(2, w * (0.018 + H2(seed + i) * 0.022)), ['leaf0', 'leaf1', 'leaf2', 'leaf3']);
        }
        break;
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
  if (cv) g.drawImage(cv, Math.round(x / 2) * 2, Math.round(y / 2) * 2);
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
  groundDetail(b, island, groundY, w, h);
  // scenery along the shoreline, at backdrop scale
  scenery(b, island, w * 0.22, groundY + 6, w * 0.5, h * 0.4, 2);
  scenery(b, island, w * 0.78, groundY + 4, w * 0.45, h * 0.35, 2);
  return mk.canvas;
}

/* ------------------------------------------------------------- ground detail

A rescue is played on this, so it cannot be a painted rectangle: a flat field makes the
animals look like counters on a board. It is all baked into the backdrop, so the texture
is free at run time -- a few hundred pixels of tuft, pebble, crack and ripple, chosen by
biome and placed by a hash so the same island always looks like itself.
*/
function groundDetail(b, island, y0, w, h) {
  const G = island.ground || ['moss', 'leaf2', 'leaf1'];
  const band = h - y0;
  if (band < 8) return;
  let seedN = 7;
  for (let i = 0; i < island.id.length; i++) seedN += island.id.charCodeAt(i) * (i + 5);

  // 1. BROAD PATCHES. Faint on purpose -- any stronger and a patch reads as a stain or a
  // shadow cast by nothing, which is worse than a flat field.
  for (let i = 0; i < 22; i++) {
    const px2 = H2(seedN + i * 3) * w;
    const py2 = y0 + H2(seedN + i * 5) * band;
    const rw = 26 + H2(seedN + i * 7) * 90;
    const rh = 4 + H2(seedN + i * 11) * 11;
    const tone = mix(P[G[i % G.length]], i % 3 ? P.ink : P.white, 0.045 + H2(seedN + i) * 0.04);
    ellipse(b, px2, py2, rw, rh, tone);
  }

  // 2. GRASS STROKES. The layer that actually kills the billiard-cloth look: hundreds of
  // one and two pixel horizontal marks, a shade either side of the ground tone. A field
  // with only tufts on it is a flat colour with confetti.
  const strokes = Math.round((w * band) / 190);
  for (let i = 0; i < strokes; i++) {
    const x = Math.round(H2(seedN + i * 13) * w);
    const y = Math.round(y0 + H2(seedN + i * 17) * band);
    const k = H2(seedN + i * 19);
    const len = 1 + Math.round(k * 3);
    const base = P[G[Math.min(G.length - 1, Math.floor((y - y0) / band * G.length))]];
    rect(b, x, y, len, 1, mix(base, k < 0.5 ? P.ink : P.white, 0.07 + k * 0.06));
  }

  // 3. A WORN PATH from the shore inland, so the field has a direction and a landmark
  {
    const py = y0 + band * 0.55;
    for (let x = 0; x < w; x++) {
      const wob = Math.sin(x * 0.012 + seedN) * band * 0.14 + Math.sin(x * 0.05) * 2;
      // narrow, muted, and with grass breaking through it. At six pixels of saturated
      // clay it read as a racetrack painted across the field.
      const half = 3 + Math.sin(x * 0.02 + 1) * 1.4;
      for (let dy = -half; dy <= half; dy++) {
        const t = Math.abs(dy) / half;
        if (t > 1) continue;
        const c = t > 0.7 ? mix(P[G[0]], P.clay1, 0.45)
          : t > 0.35 ? mix(P.clay1, P[G[0]], 0.35) : mix(P.clay2, P[G[0]], 0.2);
        px(b, x, Math.round(py + wob + dy), c);
      }
      if (x % 13 === 0) px(b, x, Math.round(py + wob), mix(P.clay3, P[G[0]], 0.3));
      if (x % 5 === 2) px(b, x, Math.round(py + wob - half), P[G[0]]);
      if (x % 9 === 4) px(b, x, Math.round(py + wob + half), P[G[1]]);
    }
  }

  // 4. THE BIOME'S OWN LITTER, in quantity
  const biome = island.biome;
  const n = Math.round((w * band) / 420);
  for (let i = 0; i < n; i++) {
    const x = Math.round(H2(seedN + i * 23) * w);
    const y = Math.round(y0 + 4 + H2(seedN + i * 29) * (band - 6));
    const k = H2(seedN + i * 31);
    switch (biome) {
      case 'grassland': case 'jungle': case 'sacred':
        for (let j = 0; j < 3; j++) {
          rect(b, x + j, y - (j === 1 ? 4 : 2), 1, j === 1 ? 4 : 2, k < 0.5 ? 'leaf3' : 'leaf1');
        }
        if (k > 0.9) {
          const c = k > 0.97 ? 'white' : k > 0.94 ? 'gold' : 'pink';
          px(b, x + 1, y - 5, c); px(b, x, y - 4, c); px(b, x + 2, y - 4, c);
          px(b, x + 1, y - 3, 'gold');
        }
        break;
      case 'desert':
        rect(b, x, y, 5 + Math.round(k * 9), 1, mix(P.sand, P.ink, 0.12));
        if (k > 0.88) { px(b, x, y - 1, 'stone2'); px(b, x + 1, y - 1, 'stone1'); px(b, x, y, 'stone0'); }
        break;
      case 'swamp':
        if (k > 0.55) {
          ellipse(b, x, y, 4, 2, 'water0');
          ellipse(b, x, y - 1, 3, 1, 'water1');
          px(b, x, y - 1, 'leaf2');
        } else {
          for (let j = 0; j < 5; j++) px(b, x + (j % 2), y - j, j > 2 ? 'leaf2' : 'moss');
        }
        break;
      case 'snow':
        if (k > 0.7) { rect(b, x, y, 5, 1, 'white'); rect(b, x + 1, y + 1, 3, 1, 'snow0'); }
        else if (k > 0.3) px(b, x, y, 'ice');
        else { px(b, x, y, 'snow0'); px(b, x + 1, y, 'white'); }
        break;
      case 'volcano':
        if (k > 0.9) { px(b, x, y, 'lava1'); px(b, x + 1, y, 'lava0'); px(b, x, y - 1, 'lava2'); }
        else { rect(b, x, y, 2 + Math.round(k * 4), 1, 'ash'); px(b, x, y, 'stone0'); }
        break;
      case 'ruins':
        if (k > 0.6) {
          rect(b, x, y, 11, 7, mix(P.stone2, P.ink, 0.1));
          rect(b, x, y, 11, 1, 'stone3');
          rect(b, x, y + 6, 11, 1, 'stone0');
          rect(b, x + 10, y, 1, 7, 'stone0');
          if (k > 0.85) px(b, x + 3, y + 3, 'moss');
        } else { px(b, x, y, 'moss'); px(b, x + 1, y + 1, 'leaf1'); }
        break;
      case 'coral':
        if (k > 0.72) {
          ellipse(b, x, y, 3, 2, 'coral0');
          px(b, x, y - 1, 'coral1'); px(b, x - 1, y, 'coral1');
        } else rect(b, x, y, 6, 1, 'foam');
        break;
      case 'storm':
        rect(b, x, y, 3 + Math.round(k * 5), 1, k > 0.5 ? 'stone1' : 'ash');
        if (k > 0.9) { px(b, x, y - 1, 'water3'); px(b, x + 1, y, 'water2'); }
        break;
      case 'mountain':
        if (k > 0.7) { px(b, x, y, 'stone3'); px(b, x + 1, y + 1, 'stone1'); px(b, x - 1, y + 1, 'stone2'); }
        else rect(b, x, y, 4, 1, mix(P.stone2, P.ink, 0.18));
        break;
      default:
        px(b, x, y, mix(P[G[0]], P.white, 0.1));
        break;
    }
  }

  // 5. A FEW REAL OBJECTS, so the eye has something to land on
  const objs = Math.max(3, Math.round(w / 150));
  for (let i = 0; i < objs; i++) {
    const x = 30 + H2(seedN + i * 37) * (w - 60);
    const y = y0 + band * (0.18 + H2(seedN + i * 41) * 0.7);
    const k = H2(seedN + i * 43);
    if (biome === 'desert' || biome === 'mountain' || biome === 'volcano' || biome === 'storm') {
      rockStamp(b, x, y, 3 + k * 4, ['stone0', 'stone1', 'stone2', 'stone3']);
    } else if (biome === 'snow') {
      rockStamp(b, x, y, 3 + k * 3, ['snow0', 'snow1', 'white', 'white']);
    } else if (biome === 'coral') {
      rockStamp(b, x, y, 2 + k * 3, ['coral0', 'coral1', 'pink', 'white']);
    } else {
      bushStamp(b, x, y, 3 + k * 4, ['leaf0', 'leaf1', 'leaf2', 'leaf3']);
    }
  }

  // 6. and a lip of wet sand along the very bottom, so the field has an edge
  for (let y = h - 4; y < h; y++) {
    rect(b, 0, y, w, 1, y === h - 4 ? 'sand' : mix(P.sand, P.ink, 0.3));
  }
}

export function clearIslandCache() { farCache.clear(); backCache.clear(); }
void col;

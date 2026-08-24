// A tiny sprite rasterizer, shared by every character and every animal.
//
// WHY THIS EXISTS. Pixel art reads at small sizes because of two things the old sprite
// code did not have:
//
//   A CONTOUR. Every figure needs a one-pixel dark line all the way round its
//   silhouette. Without it the shape bleeds into whatever is behind it and a 32-pixel
//   animal on grass turns to mush. You cannot draw that contour as you go -- you do not
//   know where the silhouette IS until the last shape is down -- so drawing happens into
//   a buffer and the outline is one pass at the end.
//
//   A CURVED TERMINATOR. A ball shaded by a straight diagonal split looks like a ball cut
//   in half. Real roundness comes from bands that follow the surface, a dark rim on the
//   shadow side, and a bounce light UNDER the shadow where the ground throws light back.
//
// So: draw into a buffer of palette KEYS, then flush. The buffer costs a few kilobytes
// and one pass, and everything drawn through it is baked once and blitted forever, so
// this is bake-time work that never shows up in a frame.

import { P, mix } from '../core/palette.js';
import { px } from '../core/pixel.js';

/* -------------------------------------------------------------------- buffer */

export function makeBuf(w, h) {
  return { w, h, c: new Array(w * h).fill(null) };
}

export function bset(b, x, y, key) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= b.w || y >= b.h || !key) return;
  b.c[y * b.w + x] = key;
}

export function bget(b, x, y) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= b.w || y >= b.h) return null;
  return b.c[y * b.w + x];
}

export function bclear(b, x, y) { bset(b, x, y, null); }

/** Is this pixel inside the drawn silhouette? */
export function bfilled(b, x, y) { return bget(b, x, y) !== null; }

/** Mirror-write about a vertical axis, which is how a face stays symmetrical. */
export function bmir(b, axis, x, y, key) {
  bset(b, x, y, key);
  bset(b, 2 * axis - x - 1, y, key);
}

/* ------------------------------------------------------------------- shading

A shade function takes the surface normal and the height fraction and returns a palette
key. `orbShade` is the one almost everything uses: five bands, a rim on the dark side and
a bounce light below it.
*/

const LX = -0.52, LY = -0.66, LZ = 0.54;      // key light: above and to the left

/**
 * orbShade(ramp) -> (nx, ny, nz) => key
 *
 * `ramp` runs DARK to LIGHT and wants four or five entries. The bands are deliberately
 * uneven: the lit side gets most of the surface and the terminator is narrow, which is
 * what a real sphere does and what a linear ramp gets wrong.
 */
export function orbShade(ramp, o = {}) {
  const n = ramp.length;
  const dark = ramp[0];
  const rim = o.rim || mix(P[ramp[Math.min(n - 1, 2)]], P.white, 0.25);
  const bounce = o.bounce !== undefined ? o.bounce : 0.5;
  return (nx, ny, nz) => {
    const lam = nx * LX + ny * LY + nz * LZ;
    // the ground throws a little light back up under the shadow side
    const back = Math.max(0, -ny * 0.55 + nz * 0.2) * bounce;
    const v = lam + back;
    if (v > 0.86) return ramp[n - 1];
    if (v > 0.62) return ramp[Math.min(n - 1, n - 2)];
    if (v > 0.32) return ramp[Math.max(0, n - 3)];
    if (v > 0.02) return ramp[Math.max(0, n - 4)];
    // the shadow edge: a rim of reflected light keeps the silhouette from going flat
    if (lam < -0.62 && nz < 0.42) return rim;
    return dark;
  };
}

/* ---------------------------------------------------------------- primitives */

/**
 * A shaded sphere.
 *
 * `o.edge` draws the shape ONE PIXEL BIGGER in that colour first, so the part gets its
 * own contour even where it overlaps something already drawn. That matters more than any
 * shading trick: the outline pass at the end can only find the outside of the whole
 * figure, so without this an arm laid over a chest of the same material simply vanishes,
 * and the whole cast reads as a stack of slabs.
 */
export function orb(b, cx, cy, r, shade, o = {}) {
  const fn = typeof shade === 'function' ? shade
    : Array.isArray(shade) ? orbShade(shade) : () => shade;
  const sq = o.squashY || 1;
  if (o.edge) {
    const er = r + 1;
    for (let y = -er; y <= er; y++) {
      const yy = y / sq;
      if (yy * yy > er * er) continue;
      const span = Math.sqrt(er * er - yy * yy);
      for (let x = -Math.ceil(span); x <= Math.ceil(span); x++) {
        if (x * x + yy * yy > er * er) continue;
        bset(b, cx + x, cy + y, o.edge);
      }
    }
  }
  for (let y = -r; y <= r; y++) {
    const yy = y / sq;
    if (yy * yy > r * r) continue;
    const span = Math.sqrt(r * r - yy * yy);
    for (let x = -Math.ceil(span); x <= Math.ceil(span); x++) {
      if (x * x + yy * yy > r * r) continue;
      const nx = x / r, ny = yy / r;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      bset(b, cx + x, cy + y, fn(nx, ny, nz));
    }
  }
}

/** A shaded ellipse — heads that are not quite round, bellies, snouts. */
export function blob(b, cx, cy, rx, ry, shade, o = {}) {
  const fn = typeof shade === 'function' ? shade
    : Array.isArray(shade) ? orbShade(shade) : () => shade;
  if (o.edge) {
    for (let y = -ry - 1; y <= ry + 1; y++) {
      const t = y / (ry + 1);
      if (t * t > 1) continue;
      const span = (rx + 1) * Math.sqrt(1 - t * t);
      for (let x = -Math.ceil(span); x <= Math.ceil(span); x++) {
        if ((x * x) / ((rx + 1) * (rx + 1)) + t * t > 1) continue;
        bset(b, cx + x, cy + y, o.edge);
      }
    }
  }
  for (let y = -ry; y <= ry; y++) {
    const t = y / ry;
    if (t * t > 1) continue;
    const span = rx * Math.sqrt(1 - t * t);
    for (let x = -Math.ceil(span); x <= Math.ceil(span); x++) {
      if ((x * x) / (rx * rx) + t * t > 1) continue;
      const nx = x / rx, ny = t;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      bset(b, cx + x, cy + y, fn(nx, ny, nz));
    }
  }
}

/** A tapering shaded limb from (x0,y0) to (x1,y1). `o.edge` gives it its own contour. */
export function limb(b, x0, y0, x1, y1, r0, r1, ramp, o = {}) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)) * 2);
  const lo = ramp[0], mid = ramp[1] || ramp[0], hi = ramp[2] || mid;
  if (o.edge) {
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const cx = x0 + (x1 - x0) * f, cy = y0 + (y1 - y0) * f;
      const r = r0 + (r1 - r0) * f + 1;
      for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
        for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
          if (x * x + y * y > r * r) continue;
          bset(b, cx + x, cy + y, o.edge);
        }
      }
    }
  }
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const cx = x0 + (x1 - x0) * f;
    const cy = y0 + (y1 - y0) * f;
    const r = r0 + (r1 - r0) * f;
    for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
      for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
        if (x * x + y * y > r * r) continue;
        bset(b, cx + x, cy + y, x < 0 ? hi : x > r * 0.35 ? lo : mid);
      }
    }
  }
}

/** A flat filled rect, in buffer space. */
export function brect(b, x, y, w, h, key) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) bset(b, x + i, y + j, key);
}

/** A one-pixel line. */
export function bline(b, x0, y0, x1, y1, key) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  for (;;) {
    bset(b, x0, y0, key);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

/* ------------------------------------------------------------------- outline

The pass that makes all of it read. Every empty pixel with a filled neighbour becomes
contour. `soft` darkens the INSIDE edge as well, which rounds a silhouette off without
growing it -- worth it on faces, too heavy on small details.
*/
export function outline(b, key = 'ink', o = {}) {
  const add = [];
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      if (bfilled(b, x, y)) continue;
      if (bfilled(b, x - 1, y) || bfilled(b, x + 1, y)
        || bfilled(b, x, y - 1) || bfilled(b, x, y + 1)) add.push(x, y);
    }
  }
  for (let i = 0; i < add.length; i += 2) bset(b, add[i], add[i + 1], key);
  if (!o.soft) return b;
  // and one step of inner darkening, mixed rather than replaced so it reads as form
  const dim = [];
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const c = bget(b, x, y);
      if (c === null || c === key) continue;
      if (bget(b, x - 1, y) === key || bget(b, x + 1, y) === key
        || bget(b, x, y - 1) === key || bget(b, x, y + 1) === key) dim.push(x, y, c);
    }
  }
  for (let i = 0; i < dim.length; i += 3) {
    bset(b, dim[i], dim[i + 1], mix(P[dim[i + 2]] || dim[i + 2], P.ink, 0.3));
  }
  return b;
}

/** Copy the buffer onto a real context. */
export function flush(b, g, ox = 0, oy = 0) {
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const c = b.c[y * b.w + x];
      if (c !== null) px(g, ox + x, oy + y, c);
    }
  }
  return b;
}

/** Keep only what is inside a circle — used to trim hair to a skull. */
export function bmaskCircle(b, cx, cy, r) {
  for (let y = 0; y < b.h; y++) {
    for (let x = 0; x < b.w; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r * r) bclear(b, x, y);
    }
  }
  return b;
}

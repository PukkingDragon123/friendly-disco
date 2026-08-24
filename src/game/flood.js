// What the flood actually DOES.
//
// The old flood was a waterline that climbed up the screen until it covered the felt
// and you lost. It was a progress bar wearing a costume: it never changed a single
// shot, it just eventually ended the blind, and on the way there it hid the game
// behind a wall of blue.
//
// Now the water comes ABOARD instead of over the camera. Two hazards, both living in
// TABLE units on the felt itself, both derived deterministically from the seed and
// the flood level so a replay of the same run sees the same water:
//
//   SURGE POOLS -- standing water broken over the rail. A ball crossing one bogs
//   down (the drag inside is several times the felt's) and gets pulled toward the
//   middle of it, so a pool both shortens your shots and swallows the ones that die
//   in it. An animal that comes to REST in a pool is swamped: washed back down into
//   the hold, costing you the tempo but not the animal.
//
//   THE HURRICANE -- past the halfway mark an eye opens on the felt and everything
//   near it is dragged around the spiral, with a shove outward at the very centre so
//   nothing parks in the middle forever. It is the reason a clean line stops being a
//   clean line late in a blind.
//
// The gauge in the console stays the clock. This module is what makes the clock hurt.

import { TABLE_W, TABLE_H } from './physics.js';
import { makeRng } from '../core/rng.js';

/** Below this the sea is still outside the hull and the felt is dry. */
export const DRY_BELOW = 0.18;

/** How many pools are on the felt at a given level. Steps, so each one is an event. */
export function poolCount(level) {
  if (level < DRY_BELOW) return 0;
  if (level < 0.36) return 1;
  if (level < 0.54) return 2;
  if (level < 0.72) return 3;
  if (level < 0.88) return 4;
  return 5;
}

/** The eye opens at the halfway mark and tightens from there. */
export function stormStrength(level) {
  if (level < 0.5) return 0;
  return (level - 0.5) / 0.5;
}

// Pool anchors, in fractions of the table. Deliberately NOT near the six gate mouths:
// water that plugged a pocket would just delete a berth, which is a different and much
// worse mechanic than water that makes reaching it harder. They also start away from
// the rack so the first pool never appears underneath the opening break.
const ANCHORS = [
  [0.30, 0.32], [0.70, 0.66], [0.50, 0.46], [0.22, 0.70], [0.78, 0.30],
  [0.40, 0.78], [0.60, 0.20],
];

/**
 * The hazards on the felt right now.
 *
 * Pure: same (seed, level) always gives the same water. `rate` (from a boss's
 * floodRate) makes the pools bigger rather than more numerous -- five puddles you can
 * thread is a puzzle, nine is a wall.
 */
export function floodHazards(seed, level, o = {}) {
  const lv = Math.max(0, Math.min(1, level || 0));
  const rate = o.rate || 1;
  const n = poolCount(lv);
  const rng = makeRng(String(seed) + '/flood');
  const pools = [];
  for (let i = 0; i < n; i++) {
    const [fx, fy] = ANCHORS[i % ANCHORS.length];
    // jitter is drawn per index so pool 1 never moves when pool 2 appears
    const jx = (rng() - 0.5) * 0.10;
    const jy = (rng() - 0.5) * 0.10;
    // A pool arrives small and swells for the rest of the blind. `grow` is how far
    // past its own threshold the level has climbed.
    const born = i === 0 ? DRY_BELOW : [0, 0.36, 0.54, 0.72, 0.88][i] || 0.88;
    // a pool keeps swelling for most of the rest of the blind, not just one step
    const grow = Math.min(1, Math.max(0, lv - born) / 0.55);
    const scale = (0.45 + grow * 0.55) * rate;
    pools.push({
      x: (fx + jx) * TABLE_W,
      y: (fy + jy) * TABLE_H,
      rx: (16 + i * 1.5) * scale,
      ry: (11 + i) * scale,
      depth: 0.4 + grow * 0.6,
      seed: i,
    });
  }
  const ss = stormStrength(lv);
  const storm = ss <= 0 ? null : {
    x: TABLE_W * (0.5 + (rng() - 0.5) * 0.18),
    y: TABLE_H * (0.5 + (rng() - 0.5) * 0.22),
    r: 26 + ss * 30,
    spin: rng() < 0.5 ? -1 : 1,
    pull: ss * 210 * rate,
  };
  return { level: lv, pools, storm };
}

/** 0..1 how deep inside a pool a point is. 0 outside, 1 dead centre. */
export function poolDepthAt(hazards, x, y) {
  if (!hazards || !hazards.pools) return 0;
  let best = 0;
  for (const p of hazards.pools) {
    const dx = (x - p.x) / p.rx, dy = (y - p.y) / p.ry;
    const d2 = dx * dx + dy * dy;
    if (d2 >= 1) continue;
    const v = (1 - Math.sqrt(d2)) * p.depth;
    if (v > best) best = v;
  }
  return best;
}

/** True if a point is standing in water at all -- what "swamped" is decided on. */
export function inWater(hazards, x, y) {
  return poolDepthAt(hazards, x, y) > 0.08;
}

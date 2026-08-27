// Deterministic ball physics for the felt deck.
//
// Everything here happens in flat TABLE UNITS (232 x 116). The renderer tilts the plane;
// nothing in this file knows about screens, sprites or colour. Two properties matter far
// more than realism:
//
//  1. DETERMINISM — the same seed and the same inputs produce the same table, every time.
//     No Math.random, no wall clock. That is also what makes predict() trustworthy: it
//     re-uses the very same integrator, so the dotted guide lands on the same ball the
//     real shot will hit.
//
//  2. IT ALWAYS SETTLES — rolling friction carries a CONSTANT term, so speed reaches
//     exactly zero in finite time instead of decaying forever, and every energy exchange
//     is lossy. isSettled() is what ends a shot, so "nearly stopped" is not good enough:
//     below STOP_SPEED the velocity is zeroed outright and the ball is parked.
//
// Sub-stepping is fixed at 1/240 s, and a chunk is subdivided further whenever the fastest
// ball could cross more than a third of a radius inside it. That one rule is what makes
// tunnelling impossible at ANY power: no ball can leap over another, and rails are enforced
// as a position clamp (not a crossing test), so a cushion is solid by construction.

import { makeRng } from '../core/rng.js';

/* ------------------------------------------------------------------ geometry */

export const TABLE_W = 232;
export const TABLE_H = 116;
export const BALL_R = 5.2;

/* ------------------------------------------------------------------- tuning */
// One table of numbers decides how the game feels. Exported so a designer can read them,
// but every one of them can also be overridden per-world through createWorld().

export const TUNING = {
  shotSpeed: 460,      // units/s at power 1.0 — about three table lengths unobstructed
  maxPower: 1.6,       // cue upgrades push past 1.0; this is the hard ceiling
  rollA: 22,           // constant rolling deceleration (units/s^2) — the "it stops" term
  dragK: 0.5,          // linear drag (1/s) — takes the sting out of a big break
  waterDrag: 5.2,      // extra drag multiplier at the deepest point of a surge pool
  waterPull: 26,       // inward acceleration toward a pool's centre (units/s^2)
  stopSpeed: 0.6,      // below this a ball is parked (contract: resting when speed < 0.6)
  ballE: 0.94,         // ball-ball restitution (nearly elastic, still lossy)
  railE: 0.74,         // cushion restitution
  subStep: 1 / 240,    // fixed sub-step
  maxFrame: 1 / 15,    // a tab-switch must not spawn a thousand sub-steps
  travelCap: 0.34,     // max fraction of the smallest radius crossed per sub-step
  slop: 0.02,          // allowed overlap — a little slop kills contact jitter
  corr: 0.55,          // positional correction per contact
  relaxIters: 4,       // de-overlap passes: a tight rack unpacks instead of exploding
  capture: 0.72,       // gate capture radius as a fraction of gate.r (contract)
  sinkTime: 0.42,      // seconds for sinkT to run 0 -> 1
  spinAcc: 92,         // lateral acceleration from full english at full speed
  spinDecay: 1.45,     // english bleeds off (1/s)
  spinRailKick: 20,    // tangential kick english steals from a cushion (units/s)
  spinPass: 0.22,      // english bled between two balls on contact
  railTanDamp: 0.955,  // cushions scrub sideways motion
  squashMax: 0.55,
  squashDecay: 7,
  ballEventMin: 2.0,   // below this a contact is silent (no sfx spam in a settling rack)
  railEventMin: 2.0,
  railCountMin: 3.0,   // a "bounce" for scoring has to be an actual thump
  predictDt: 1 / 50,   // simulated seconds per predict() sample point
};

/* ------------------------------------------------------------------ helpers */

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const hyp = Math.hypot;

/** Analytic stopping distance for a ball launched at v0 — used to cull predict() work. */
function travelDistance(v0, frictionMul) {
  const mul = Math.max(0.05, num(frictionMul, 1));
  const A = TUNING.rollA * mul, K = TUNING.dragK * mul;
  if (v0 <= 0) return 0;
  return v0 / K - (A / (K * K)) * Math.log(1 + (K * v0) / A);
}

/* -------------------------------------------------------------------- world */

/**
 * createWorld({ w, h, friction, restitution, railRestitution, spinDrift, lookup })
 *  - `friction` is a MULTIPLIER (1 = normal) so a boss blind can grease or gum the cloth.
 *  - `lookup(animalId)` may return { mass, size } so heavier animals shove lighter ones.
 *    Optional: with no lookup every ball is mass 1 / radius BALL_R, which is what the
 *    spine currently passes.
 */
export function createWorld(opts = {}) {
  const o = opts || {};
  return {
    w: Math.max(40, num(o.w, TABLE_W)),
    h: Math.max(40, num(o.h, TABLE_H)),
    balls: [],
    gates: [],
    sunk: [],
    friction: Math.max(0.05, num(o.friction, 1)),
    restitution: clamp(num(o.restitution, TUNING.ballE), 0, 1),
    railRestitution: clamp(num(o.railRestitution, TUNING.railE), 0, 1),
    spinDrift: num(o.spinDrift, 1),
    driftX: num(o.driftX, 0),          // boss "the deck lists to starboard" acceleration
    driftY: num(o.driftY, 0),
    cue: null,                          // optional: this game has no dedicated cue ball
    hazards: null,                      // {pools, storm} from game/flood.js, or null
    posts: [],                          // static circles: boulders, trunks, columns
    zones: [],                          // ground that changes the rules: mud, ice, current
    time: 0,
    shotId: 0,
    nextId: 1,
    lookup: typeof o.lookup === 'function' ? o.lookup : null,
  };
}

/** True when (x,y) can hold a ball of radius r: inside the cushions, clear of gates+balls. */
function fits(world, x, y, r, ignore) {
  if (x < r || y < r || x > world.w - r || y > world.h - r) return false;
  for (const g of world.gates) {
    if (hyp(g.x - x, g.y - y) < num(g.r, 9.5) + r * 1.15) return false;
  }
  for (const b of world.balls) {
    if (b === ignore || b.sunk) continue;
    if (hyp(b.x - x, b.y - y) < (b.r + r) * 1.04) return false;
  }
  return true;
}

/** Nearest legal spot to (x,y). Deterministic golden-angle spiral — no rng needed. */
function findSpot(world, x, y, r, ignore) {
  const cx = clamp(num(x, world.w * 0.5), r, world.w - r);
  const cy = clamp(num(y, world.h * 0.5), r, world.h - r);
  if (fits(world, cx, cy, r, ignore)) return { x: cx, y: cy };
  const GA = 2.39996323;
  for (let i = 1; i <= 400; i++) {
    const rad = Math.sqrt(i) * r * 0.72;
    const a = i * GA;
    const px = clamp(cx + Math.cos(a) * rad, r, world.w - r);
    const py = clamp(cy + Math.sin(a) * rad, r, world.h - r);
    if (fits(world, px, py, r, ignore)) return { x: px, y: py };
  }
  return { x: cx, y: cy };   // hopeless crush: let the de-overlap pass sort it out
}

/**
 * addBall(world, { animalId, x, y, r, mass, size, spin })
 * Returns the new ball. The requested position is honoured when it is legal and otherwise
 * slid to the nearest free patch of felt, so a caller that deals a fresh animal onto a
 * crowded table can never wedge two balls into one another.
 */
export function addBall(world, spec = {}) {
  if (!world || !world.balls) return null;
  const s = spec || {};
  const stat = world.lookup ? world.lookup(s.animalId) || null : null;
  const size = clamp(num(s.size, stat ? num(stat.size, 1) : 1), 0.5, 2);
  const r = clamp(num(s.r, BALL_R * size), 1.5, 14);
  const mass = clamp(num(s.mass, stat ? num(stat.mass, 1) : 1), 0.3, 5);
  const spot = findSpot(world, num(s.x, world.w * 0.5), num(s.y, world.h * 0.5), r);
  const ball = {
    id: world.nextId++,
    animalId: s.animalId != null ? s.animalId : null,
    x: spot.x, y: spot.y,
    vx: 0, vy: 0,
    r, mass,
    spin: clamp(num(s.spin, 0), -1, 1),
    sunk: false,
    resting: true,
    bounces: 0,
    lastHit: null,
    squash: 0,
    angle: num(s.angle, 0),   // rolling orientation, accumulated from distance travelled
    sinkT: 0,                 // 0..1 drop animation, driven by step() after capture
    gate: null,
    gateId: null,
  };
  world.balls.push(ball);
  return ball;
}

/**
 * setGates(world, gates) — gate = { id, habitatId, x, y, r, slot }. Gates are copied so
 * later edits to the render-side list cannot teleport a pocket mid-shot. Closed gates
 * (boss blinds seal habitats) are dropped: a sealed mouth must not swallow anything.
 */
/**
 * Install the flood's hazards. Null clears them. Kept as a setter so the caller
 * cannot leave a half-built hazard object where the integrator will read it.
 */
export function setHazards(world, hazards) {
  if (!world) return null;
  world.hazards = hazards && (hazards.pools || hazards.storm) ? hazards : null;
  return world.hazards;
}

/**
 * Static circles the balls bounce off: a boulder, a fallen trunk, a broken column.
 *
 * A post is a ball of infinite mass, which is why this is eleven lines rather than a
 * second solver -- the same normal, the same separation, no impulse shared back. `e` is
 * per post because a mossy trunk should not throw an animal the way bare rock does.
 */
export function setPosts(world, posts) {
  if (!world) return [];
  const out = [];
  for (const p of posts || []) {
    if (!p || p.gone) continue;
    out.push({
      id: p.id != null ? p.id : `p${out.length}`,
      x: num(p.x, 0), y: num(p.y, 0), r: Math.max(1, num(p.r, 10)),
      e: clamp(num(p.e, 0.62), 0, 1), kind: p.kind || 'rock', data: p.data || null,
    });
  }
  world.posts = out;
  return out;
}

/**
 * Ground that changes the rules inside a circle. `physics` is one of the words in
 * data/obstacles.js and each one is a couple of lines in rollStep:
 *
 *   slow    heavy drag: you cross, and arrive with nothing left
 *   slick   almost no friction: you do not stop where you meant to
 *   push    a steady shove along `angle` -- a current, a gale
 *   pull    dragged toward the middle, and the middle keeps what it gets
 *   kill    an animal that comes to rest in it is lost
 *   gap     open air: an animal that enters it is gone at once
 *   strike  lightning comes back to this patch of ground
 *
 * The last three do nothing to the motion. They emit a `zone` event on entry and the
 * scene decides what that costs, because "lost" is a game rule, not a physics one.
 */
export function setZones(world, zones) {
  if (!world) return [];
  const out = [];
  for (const z of zones || []) {
    if (!z || z.gone) continue;
    out.push({
      id: z.id != null ? z.id : `z${out.length}`,
      x: num(z.x, 0), y: num(z.y, 0), r: Math.max(1, num(z.r, 12)),
      physics: z.physics || 'slow',
      strength: num(z.strength, 1),
      angle: num(z.angle, 0),
      kind: z.kind || null, data: z.data || null,
    });
  }
  world.zones = out;
  return out;
}

export function setGates(world, gates) {
  if (!world) return [];
  const out = [];
  for (const g of gates || []) {
    if (!g || g.closed) continue;
    out.push(Object.assign({}, g, {
      id: g.id != null ? g.id : `g${out.length}`,
      x: num(g.x, 0), y: num(g.y, 0),
      r: Math.max(1, num(g.r, 9.5)),
    }));
  }
  world.gates = out;
  return out;
}

/** Optional convenience: mark one ball as "the cue" for renderers that care. */
export function setCue(world, ball) {
  if (!world) return null;
  world.cue = ball && !ball.sunk ? ball : null;
  return world.cue;
}

/* ------------------------------------------------------------------- motion */

/**
 * How much the ground under this ball scales the friction. Mud multiplies it, ice
 * divides it, and everywhere else is 1 -- which is the common case and costs one loop
 * over a list that is usually three long.
 */
function zoneFriction(world, b) {
  const zs = world.zones;
  if (!zs || !zs.length) return 1;
  let f = 1;
  for (const z of zs) {
    if (z.physics !== 'slow' && z.physics !== 'slick') continue;
    const dx = b.x - z.x, dy = b.y - z.y;
    if (dx * dx + dy * dy > z.r * z.r) continue;
    f *= z.physics === 'slow' ? (1 + 5.5 * z.strength) : (0.12 / Math.max(0.2, z.strength));
  }
  return f;
}

/** The currents: a steady shove one way, or a drag toward a middle that keeps things. */
function zoneForce(world, b, h, out) {
  const zs = world.zones;
  out.x = 0; out.y = 0;
  if (!zs || !zs.length) return out;
  for (const z of zs) {
    if (z.physics !== 'push' && z.physics !== 'pull') continue;
    const dx = b.x - z.x, dy = b.y - z.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > z.r * z.r) continue;
    const fall = 1 - Math.sqrt(d2) / z.r;
    if (z.physics === 'push') {
      const f = TUNING.waterPull * 1.6 * z.strength * fall * h;
      out.x += Math.cos(z.angle) * f;
      out.y += Math.sin(z.angle) * f;
    } else {
      const d = Math.sqrt(d2);
      if (d < 0.01) continue;
      const f = TUNING.waterPull * 2.2 * z.strength * fall * h;
      out.x -= (dx / d) * f;
      out.y -= (dy / d) * f;
    }
  }
  return out;
}

const ZF = { x: 0, y: 0 };

/** One sub-step of pure motion for one ball: english, friction, drift, translate. */
function rollStep(b, h, world) {
  let vx = b.vx, vy = b.vy;
  const sp = hyp(vx, vy);
  if (sp > 1e-9) {
    // English curves the path: a lateral acceleration, scaled by speed (a stationary ball
    // does not swerve) and decaying, so the curve is a gentle arc rather than a spiral.
    const spin = num(b.spin, 0);
    if (spin !== 0) {
      const drift = TUNING.spinAcc * spin * (sp / TUNING.shotSpeed) * num(world.spinDrift, 1) * h;
      const nx = -vy / sp, ny = vx / sp;
      vx += nx * drift;
      vy += ny * drift;
    }
    // Rolling friction: constant term + linear drag. The constant term is the important
    // one — it is what lets a ball reach exactly zero instead of asymptotically crawling.
    const sp2 = hyp(vx, vy);
    const dec = (TUNING.rollA + TUNING.dragK * sp2)
      * Math.max(0.05, num(world.friction, 1)) * zoneFriction(world, b) * h;
    if (sp2 <= dec) { vx = 0; vy = 0; } else { const f = (sp2 - dec) / sp2; vx *= f; vy *= f; }
    b.spin = spin * (1 - TUNING.spinDecay * h);
  }
  vx += num(world.driftX, 0) * h;
  vy += num(world.driftY, 0) * h;
  zoneForce(world, b, h, ZF);
  vx += ZF.x; vy += ZF.y;

  // --- standing water and the hurricane (game/flood.js supplies world.hazards)
  const hz = world.hazards;
  if (hz) {
    // Inside a pool the felt might as well be mud: several times the drag, plus a
    // gentle pull toward the middle, so a ball that dies in water dies IN the water.
    if (hz.pools && hz.pools.length) {
      for (const p of hz.pools) {
        const dx = (b.x - p.x) / p.rx, dy = (b.y - p.y) / p.ry;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;
        const deep = (1 - Math.sqrt(d2)) * p.depth;
        const bog = 1 - Math.min(0.9, TUNING.waterDrag * deep * h);
        vx *= bog; vy *= bog;
        const ox = p.x - b.x, oy = p.y - b.y;
        const od = hyp(ox, oy);
        if (od > 0.01) {
          const pull = TUNING.waterPull * deep * h;
          vx += (ox / od) * pull;
          vy += (oy / od) * pull;
        }
        break;                       // one pool's worth of misery per sub-step
      }
    }
    // The eye drags everything near it around the spiral, and shoves outward at the
    // very centre so nothing parks in the middle of the storm forever.
    const st = hz.storm;
    if (st && st.pull > 0) {
      const dx = b.x - st.x, dy = b.y - st.y;
      const d = hyp(dx, dy);
      if (d < st.r && d > 0.01) {
        const fall = 1 - d / st.r;
        const tx = (-dy / d) * st.spin, ty = (dx / d) * st.spin;
        const f = st.pull * fall * fall * h;
        vx += tx * f; vy += ty * f;
        const out = (1 - Math.min(1, d / (st.r * 0.28))) * st.pull * 0.4 * h;
        if (out > 0) { vx += (dx / d) * out; vy += (dy / d) * out; }
        if (hyp(vx, vy) >= TUNING.stopSpeed) b.resting = false;
      }
    }
  }

  b.vx = vx; b.vy = vy;
  b.x += vx * h;
  b.y += vy * h;
  b.angle = num(b.angle, 0) + (hyp(vx, vy) * h) / Math.max(0.5, b.r);
}

/** Keep a ball's centre inside the cushions without touching its velocity. */
function confine(b, world) {
  if (b.x < b.r) b.x = b.r;
  else if (b.x > world.w - b.r) b.x = world.w - b.r;
  if (b.y < b.r) b.y = b.r;
  else if (b.y > world.h - b.r) b.y = world.h - b.r;
}

function railHit(world, b, side, nx, ny, depth, events) {
  b.x += nx * depth; b.y += ny * depth;              // clamped back inside the cushion
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return;                                // resting against it / already leaving
  const speed = -vn;
  const e = clamp(num(world.railRestitution, TUNING.railE), 0, 1);
  b.vx -= (1 + e) * vn * nx;
  b.vy -= (1 + e) * vn * ny;
  // english is spent on the cushion: it throws the ball sideways and comes back reversed
  const tx = -ny, ty = nx;
  const vt = b.vx * tx + b.vy * ty;
  const kick = clamp(num(b.spin, 0), -1, 1) * TUNING.spinRailKick * Math.min(1, speed / 180);
  const nvt = vt * TUNING.railTanDamp + kick;
  b.vx += (nvt - vt) * tx;
  b.vy += (nvt - vt) * ty;
  b.spin = -num(b.spin, 0) * 0.55;
  b.squash = Math.min(TUNING.squashMax, num(b.squash, 0) + speed / 380);
  b.lastHit = { kind: 'rail', id: side };
  if (speed >= TUNING.railCountMin) b.bounces = num(b.bounces, 0) + 1;
  if (hyp(b.vx, b.vy) >= TUNING.stopSpeed) b.resting = false;
  if (speed >= TUNING.railEventMin && events) {
    events.push({ type: 'rail', ball: b, speed, x: b.x, y: b.y, side });
  }
}

/** Which cushion (if any) the centre currently violates. */
function railSide(world, b) {
  if (b.x < b.r) return 'left';
  if (b.x > world.w - b.r) return 'right';
  if (b.y < b.r) return 'top';
  if (b.y > world.h - b.r) return 'bottom';
  return null;
}

function rails(world, b, events) {
  if (b.x < b.r) railHit(world, b, 'left', 1, 0, b.r - b.x, events);
  else if (b.x > world.w - b.r) railHit(world, b, 'right', -1, 0, b.x - (world.w - b.r), events);
  if (b.y < b.r) railHit(world, b, 'top', 0, 1, b.r - b.y, events);
  else if (b.y > world.h - b.r) railHit(world, b, 'bottom', 0, -1, b.y - (world.h - b.r), events);
}

/**
 * A ball against a post. Same maths as a cushion: separate along the normal, reflect the
 * normal component, leave the tangent alone. The post never moves, so there is no
 * impulse to share back -- which is the whole reason a boulder is a post and not a very
 * heavy ball.
 */
function posts(world, b, events) {
  const ps = world.posts;
  if (!ps || !ps.length) return;
  for (const p of ps) {
    const dx = b.x - p.x, dy = b.y - p.y;
    const rr = b.r + p.r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const d = Math.sqrt(d2) || 0.0001;
    const nx = dx / d, ny = dy / d;
    b.x = p.x + nx * rr;
    b.y = p.y + ny * rr;
    const vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) continue;
    const speed = -vn;
    b.vx -= (1 + p.e) * vn * nx;
    b.vy -= (1 + p.e) * vn * ny;
    b.spin = num(b.spin, 0) * 0.6;
    b.squash = Math.min(TUNING.squashMax, num(b.squash, 0) + speed / 380);
    b.lastHit = { kind: 'post', id: p.id };
    if (speed >= TUNING.railCountMin) b.bounces = num(b.bounces, 0) + 1;
    if (hyp(b.vx, b.vy) >= TUNING.stopSpeed) b.resting = false;
    if (speed >= TUNING.railEventMin && events) {
      events.push({ type: 'post', ball: b, post: p, speed, x: b.x, y: b.y });
    }
  }
}

/**
 * Which zone a ball is standing in, and an event the FIRST sub-step it arrives. Only on
 * change, because "entered the deep water" is one thing that happened and reporting it
 * sixty times a second is not.
 */
function zoneEnter(world, b, events) {
  const zs = world.zones;
  if (!zs || !zs.length) { b.zone = null; return; }
  let now = null;
  for (const z of zs) {
    const dx = b.x - z.x, dy = b.y - z.y;
    if (dx * dx + dy * dy <= z.r * z.r) { now = z; break; }
  }
  const was = b.zone || null;
  b.zone = now;
  if (now && now !== was && events) {
    events.push({ type: 'zone', ball: b, zone: now, x: b.x, y: b.y, speed: hyp(b.vx, b.vy) });
  }
}

/* -------------------------------------------------------------------- gates */

/**
 * Where a gate's capture disc actually sits for a ball of radius r.
 *
 * GATE_LAYOUT hangs the two mid-rail mouths OUTSIDE the cushions (tm at y=-1, bm at
 * y=TABLE_H+1) — they are holes cut in the rail, drawn half off the felt. A ball centre
 * can never get nearer than r to the cushion, so measuring 0.72r from the printed centre
 * leaves a capture window under 3 units wide and half of the shots aimed dead at the mouth
 * clang off the rail instead. So the disc is projected onto the felt the ball can reach.
 * Corner mouths are already inside the cushions and are untouched, and because the disc
 * always lies fully on the felt, a pocketed ball is captured BEFORE it could leave the
 * table — the cushions stay solid and nothing can slip out through a mouth.
 */
function captureCentre(g, r, world) {
  return {
    x: clamp(g.x, r, world.w - r),
    y: clamp(g.y, r, world.h - r),
  };
}

/**
 * Closest gate whose mouth the swept centre segment (px,py)->(b.x,b.y) enters.
 * Sweeping instead of point-testing means a screamer can never skip over a pocket.
 */
function gateAlong(world, b, px, py) {
  const sx = b.x - px, sy = b.y - py;
  const len2 = sx * sx + sy * sy;
  let best = null, bestD = Infinity;
  for (const g of world.gates) {
    const cr = num(g.r, 9.5) * TUNING.capture;
    const c = captureCentre(g, b.r, world);
    let t = 0;
    if (len2 > 1e-12) t = clamp(((c.x - px) * sx + (c.y - py) * sy) / len2, 0, 1);
    const cx = px + sx * t, cy = py + sy * t;
    const dx = c.x - cx, dy = c.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 <= cr * cr && d2 < bestD) { bestD = d2; best = { gate: g, x: cx, y: cy }; }
  }
  return best;
}

function sinkBall(world, b, at, events) {
  b.x = at.x; b.y = at.y;
  const speed = hyp(b.vx, b.vy);
  b.sunk = true;
  b.sinkT = 0;
  b.resting = false;
  b.gate = at.gate;
  b.gateId = at.gate.id;
  b.vx *= 0.35; b.vy *= 0.35;
  b.squash = Math.min(TUNING.squashMax, num(b.squash, 0) + 0.18);
  b.lastHit = { kind: 'gate', id: at.gate.id };
  world.sunk.push(b);
  if (world.cue === b) world.cue = null;
  if (events) events.push({ type: 'gate', ball: b, gate: at.gate, speed, x: b.x, y: b.y });
}

/* --------------------------------------------------------------- collisions */

/** Mass-weighted elastic impulse along the contact normal + positional separation. */
function collide(world, events) {
  const balls = world.balls;
  const e = clamp(num(world.restitution, TUNING.ballE), 0, 1);
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (a.sunk) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (b.sunk) continue;
      let dx = b.x - a.x, dy = b.y - a.y;
      const rr = a.r + b.r;
      let d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-6) { dx = (a.id + b.id) % 2 ? 0 : 1; dy = dx ? 0 : 1; d = 1e-6; }
      const nx = dx / d, ny = dy / d;
      const ima = 1 / a.mass, imb = 1 / b.mass, tot = ima + imb;

      // separate first, so the impulse below is computed at a sane contact
      const over = rr - d;
      if (over > TUNING.slop) {
        const push = (over - TUNING.slop) * TUNING.corr;
        a.x -= nx * push * (ima / tot); a.y -= ny * push * (ima / tot);
        b.x += nx * push * (imb / tot); b.y += ny * push * (imb / tot);
      }

      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn >= 0) continue;                      // separating: no impulse, no click
      const jimp = (-(1 + e) * vn) / tot;
      a.vx -= jimp * nx * ima; a.vy -= jimp * ny * ima;
      b.vx += jimp * nx * imb; b.vy += jimp * ny * imb;

      // a little english bleeds across the contact — small enough never to pump the table
      const sa = num(a.spin, 0), sb = num(b.spin, 0);
      a.spin = sa * (1 - TUNING.spinPass) + sb * TUNING.spinPass * 0.5;
      b.spin = sb * (1 - TUNING.spinPass) + sa * TUNING.spinPass * 0.5;

      const speed = -vn;
      a.squash = Math.min(TUNING.squashMax, num(a.squash, 0) + speed / 420);
      b.squash = Math.min(TUNING.squashMax, num(b.squash, 0) + speed / 420);
      a.lastHit = { kind: 'ball', id: b.id };
      b.lastHit = { kind: 'ball', id: a.id };
      if (hyp(a.vx, a.vy) >= TUNING.stopSpeed) a.resting = false;
      if (hyp(b.vx, b.vy) >= TUNING.stopSpeed) b.resting = false;
      if (speed >= TUNING.ballEventMin && events) {
        events.push({ type: 'ball', a, b, speed, x: a.x + nx * a.r, y: a.y + ny * a.r });
      }
    }
  }
}

/**
 * Iterative positional de-overlap. Velocity is never touched here, which is exactly why a
 * 16-ball rack unpacks quietly instead of detonating: the solver removes penetration,
 * it does not invent energy.
 */
function relax(world) {
  const balls = world.balls;
  for (let it = 0; it < TUNING.relaxIters; it++) {
    let worst = 0;
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.sunk) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.sunk) continue;
        let dx = b.x - a.x, dy = b.y - a.y;
        const rr = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        let d = Math.sqrt(d2);
        if (d < 1e-6) { dx = (a.id + b.id) % 2 ? 0 : 1; dy = dx ? 0 : 1; d = 1e-6; }
        const over = rr - d;
        if (over <= TUNING.slop) continue;
        if (over > worst) worst = over;
        const nx = dx / d, ny = dy / d;
        const ima = 1 / a.mass, imb = 1 / b.mass, tot = ima + imb;
        const push = (over - TUNING.slop) * 0.5;
        a.x -= nx * push * (ima / tot); a.y -= ny * push * (ima / tot);
        b.x += nx * push * (imb / tot); b.y += ny * push * (imb / tot);
      }
    }
    for (const b of balls) if (!b.sunk) confine(b, world);
    if (worst <= TUNING.slop * 1.5) break;
  }
}

/* ---------------------------------------------------------------- integrate */

function settleAndDecay(world, h, events) {
  const stop2 = TUNING.stopSpeed * TUNING.stopSpeed;
  for (const b of world.balls) {
    if (b.sunk) {
      if (b.sinkT < 1) {
        b.sinkT = Math.min(1, num(b.sinkT, 0) + h / TUNING.sinkTime);
        const g = b.gate;
        if (g) {                                   // slide down into the mouth
          const k = Math.min(1, h * 7);
          b.x += (g.x - b.x) * k;
          b.y += (g.y - b.y) * k;
        }
        b.vx *= 0.9; b.vy *= 0.9;
      }
      b.squash = Math.max(0, num(b.squash, 0) * (1 - TUNING.squashDecay * h));
      continue;
    }
    b.squash = Math.max(0, num(b.squash, 0) * (1 - TUNING.squashDecay * h));
    if (b.squash < 0.002) b.squash = 0;
    if (b.vx * b.vx + b.vy * b.vy < stop2) {
      b.vx = 0; b.vy = 0;
      b.spin = num(b.spin, 0) * (1 - TUNING.spinDecay * h);
      if (!b.resting) {
        b.resting = true;
        if (events) events.push({ type: 'stop', ball: b });
      }
    } else b.resting = false;
  }
}

function integrate(world, h, events) {
  const balls = world.balls;
  // 1. motion, then the swept gate test, then cushions — per ball, so a fast ball is
  //    pocketed by the mouth it flew through rather than by the rail behind it.
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.sunk || b.resting) continue;
    const px = b.x, py = b.y;
    rollStep(b, h, world);
    const g = gateAlong(world, b, px, py);
    if (g) { sinkBall(world, b, g, events); continue; }
    posts(world, b, events);
    rails(world, b, events);
    zoneEnter(world, b, events);
  }
  // 2. contacts and 3. de-overlap
  collide(world, events);
  relax(world);
  // 4. a de-overlap shove can push a parked ball over a mouth — contract's literal rule
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b.sunk) continue;
    const g = gateAlong(world, b, b.x, b.y);
    if (g) sinkBall(world, b, g, events);
  }
  // 5. park what has stopped, decay squash / english, advance drops
  settleAndDecay(world, h, events);
}

/**
 * step(world, dt) -> events[]
 * events: {type:'ball',a,b,speed,x,y} {type:'rail',ball,speed,x,y,side}
 *         {type:'gate',ball,gate,speed,x,y} {type:'stop',ball}
 */
export function step(world, dt) {
  const events = [];
  if (!world || !world.balls) return events;
  let d = num(dt, 0);
  if (d <= 0) return events;
  if (d > TUNING.maxFrame) d = TUNING.maxFrame;
  const chunks = Math.max(1, Math.ceil(d / TUNING.subStep - 1e-9));
  const h = d / chunks;
  for (let c = 0; c < chunks; c++) {
    // adaptive guard: nobody crosses more than travelCap radii inside one sub-step
    let vmax2 = 0, rmin = Infinity;
    for (const b of world.balls) {
      if (b.sunk) continue;
      const s2 = b.vx * b.vx + b.vy * b.vy;
      if (s2 > vmax2) vmax2 = s2;
      if (b.r < rmin) rmin = b.r;
    }
    if (!Number.isFinite(rmin)) rmin = BALL_R;
    const vmax = Math.sqrt(vmax2);
    let k = 1;
    if (vmax > 1e-6) k = clamp(Math.ceil((vmax * h) / (rmin * TUNING.travelCap)), 1, 12);
    const hh = h / k;
    for (let i = 0; i < k; i++) integrate(world, hh, events);
  }
  world.time = num(world.time, 0) + d;
  return events;
}

/** Every ball is either pocketed or parked. This is what ends a shot. */
export function isSettled(world) {
  if (!world || !world.balls) return true;
  for (const b of world.balls) {
    if (b.sunk) continue;
    if (!b.resting) return false;
  }
  return true;
}

/**
 * strike(world, ball, angle, power, spin)
 * Any ball on the felt is fair game — this game has no dedicated cue ball. `power` is
 * 0..1 nominal (cue upgrades may exceed 1, clamped at TUNING.maxPower) and `spin` is
 * -1..1 english. Rail counters reset for the whole table because scoring reads
 * ball.bounces "since the strike" for every ball potted by this shot.
 */
export function strike(world, ball, angle, power, spin) {
  if (!world || !ball || ball.sunk) return null;
  const p = clamp(num(power, 0), 0, TUNING.maxPower);
  const a = num(angle, 0);
  const sp = TUNING.shotSpeed * p;
  for (const b of world.balls) {
    if (b.sunk) continue;
    b.bounces = 0;
    b.lastHit = null;
  }
  ball.vx = Math.cos(a) * sp;
  ball.vy = Math.sin(a) * sp;
  ball.spin = clamp(num(spin, 0), -1, 1);
  ball.squash = Math.min(TUNING.squashMax, 0.12 + p * 0.3);
  ball.resting = sp < TUNING.stopSpeed;
  world.shotId = num(world.shotId, 0) + 1;
  return ball;
}

/** Boss drift: shove the whole table. Never wakes a ball that is still below stop speed. */
export function nudge(world, dx, dy) {
  if (!world || !world.balls) return;
  const ax = num(dx, 0), ay = num(dy, 0);
  for (const b of world.balls) {
    if (b.sunk) continue;
    b.vx += ax; b.vy += ay;
    if (hyp(b.vx, b.vy) >= TUNING.stopSpeed) b.resting = false;
    else { b.vx = 0; b.vy = 0; }
  }
}

/* --------------------------------------------------------------------- rack */

function layoutPoints(mode, n, world, rng, r) {
  const d = r * 2 * 1.1;                    // centre spacing: touching, with a hair of air
  const pts = [];
  if (mode === 'scatter') {
    const m = r + 4;
    for (let i = 0; i < n; i++) {
      let best = null;
      for (let tries = 0; tries < 240; tries++) {
        const x = rng.range(m, world.w - m);
        const y = rng.range(m, world.h - m);
        let okHere = true;
        for (const p of pts) if (hyp(p.x - x, p.y - y) < d * 1.15) { okHere = false; break; }
        if (okHere) {
          for (const g of world.gates) {
            if (hyp(g.x - x, g.y - y) < num(g.r, 9.5) + r * 1.6) { okHere = false; break; }
          }
        }
        if (okHere) { best = { x, y }; break; }
      }
      pts.push(best || { x: rng.range(m, world.w - m), y: rng.range(m, world.h - m) });
    }
    return pts;
  }
  if (mode === 'ring') {
    const cx = world.w * 0.5, cy = world.h * 0.5;
    const want = (n * d) / (2 * Math.PI) + 2;
    const lim = Math.min(world.h * 0.5 - r - 14, world.w * 0.5 - r - 14);
    const R = clamp(want, d * 1.2, Math.max(d * 1.2, lim));
    const phase = rng.range(0, Math.PI * 2);
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2;
      pts.push({ x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R });
    }
    return pts;
  }
  const cx = world.w * (mode === 'diamond' ? 0.56 : 0.62), cy = world.h * 0.5;
  const rowGap = d * 0.87;
  if (mode === 'diamond') {
    let k = 1;
    while (k * k < n) k++;
    const cols = 2 * k - 1;
    const x0 = cx - ((cols - 1) * rowGap) / 2;
    for (let m = 0; m < cols; m++) {
      const size = m < k ? m + 1 : cols - m;
      for (let j = 0; j < size; j++) {
        pts.push({ x: x0 + m * rowGap, y: cy + (j - (size - 1) / 2) * d });
      }
    }
    return pts.slice(0, n);
  }
  // triangle (default): apex to the left, opening away from the shooter
  let rows = 1;
  while ((rows * (rows + 1)) / 2 < n) rows++;
  const x0 = cx - ((rows - 1) * rowGap) / 2;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j <= i; j++) {
      pts.push({ x: x0 + i * rowGap, y: cy + (j - i / 2) * d });
    }
  }
  return pts.slice(0, n);
}

/**
 * rack(world, animalIds, rng, mode) -> balls
 * mode: 'triangle' | 'scatter' | 'ring' | 'diamond'.
 * Ideal lattice positions come from the mode; addBall() then slides anything that would
 * overlap, sit in a gate mouth, or hang over a cushion. Callers clear world.balls first;
 * racking onto an occupied table is legal and simply packs around what is already there.
 */
export function rack(world, animalIds, rng, mode = 'triangle') {
  const out = [];
  if (!world || !world.balls) return out;
  const ids = Array.isArray(animalIds) ? animalIds.filter((v) => v != null) : [];
  if (!ids.length) return out;
  const r = world.lookup ? BALL_R * 1.1 : BALL_R;      // pad the lattice if sizes vary
  const g = rng && typeof rng.range === 'function' ? rng : makeRng('rack');
  const m = ['triangle', 'scatter', 'ring', 'diamond'].includes(mode) ? mode : 'triangle';
  const pts = layoutPoints(m, ids.length, world, g, r);
  for (let i = 0; i < ids.length; i++) {
    const p = pts[i] || { x: world.w * 0.5, y: world.h * 0.5 };
    const b = addBall(world, { animalId: ids[i], x: p.x, y: p.y });
    if (b) out.push(b);
  }
  return out;
}

/* ------------------------------------------------------------------ predict */

/**
 * predict(world, ball, angle, power, steps) -> { points:[{x,y}], hit }
 * hit = { kind:'ball'|'rail'|'gate', id, x, y, normal:{x,y} } or null.
 *
 * NON-MUTATING: the struck ball is copied into a scratch object and every other ball is
 * read only. Because the scratch runs through the same rollStep/rails/gate code as step(),
 * the guide, the ghost ball and the autoplay bot all see the trajectory the shot will
 * actually take (exact up to the first contact, since the rest of the table is parked).
 *
 * `steps` counts sample points (TUNING.predictDt seconds apart). The path stops at the
 * first ball contact or gate capture; rails only bend it (up to 4 cushions) so a bank
 * shot still reports the pocket it finds. English is read from ball.spin — set it before
 * calling if you want the curve previewed.
 */
export function predict(world, ball, angle, power, steps) {
  const points = [];
  const out = { points, hit: null };
  if (!world || !ball) return out;
  const n = clamp(Math.round(num(steps, 48)), 2, 600);
  const p = clamp(num(power, 0.6), 0, TUNING.maxPower);
  const a = num(angle, 0);
  const sp0 = TUNING.shotSpeed * p;
  const r = num(ball.r, BALL_R);
  const s = {
    id: -1, animalId: null,
    x: num(ball.x, 0), y: num(ball.y, 0),
    vx: Math.cos(a) * sp0, vy: Math.sin(a) * sp0,
    r, mass: num(ball.mass, 1),
    spin: clamp(num(ball.spin, 0), -1, 1),
    sunk: false, resting: false, bounces: 0, lastHit: null, squash: 0, angle: 0, sinkT: 0,
  };
  points.push({ x: s.x, y: s.y });

  // only balls within reach can ever be hit — keeps the aim preview cheap enough to run
  // every frame (and cheap enough for a bot that probes every ball against every gate)
  const reach = travelDistance(sp0, world.friction) + 4;
  const obstacles = [];
  for (const b of world.balls) {
    if (b === ball || b.sunk) continue;
    if (hyp(b.x - s.x, b.y - s.y) > reach + b.r + r) continue;
    obstacles.push(b);
  }

  const trash = [];
  let firstRail = null, railCount = 0, done = false;
  for (let i = 0; i < n && !done; i++) {
    let rem = TUNING.predictDt, guard = 0;
    while (rem > 1e-9 && guard++ < 24 && !done) {
      const spd = hyp(s.vx, s.vy);
      const cap = spd > 1e-6
        ? Math.min(TUNING.subStep, (r * TUNING.travelCap) / spd)
        : TUNING.subStep;
      const h = Math.min(rem, cap);
      rem -= h;
      const px = s.x, py = s.y;
      rollStep(s, h, world);

      const g = gateAlong(world, s, px, py);
      if (g) {
        const dx = g.gate.x - g.x, dy = g.gate.y - g.y, dl = hyp(dx, dy) || 1;
        out.hit = { kind: 'gate', id: g.gate.id, x: g.x, y: g.y, normal: { x: dx / dl, y: dy / dl } };
        s.x = g.x; s.y = g.y;
        done = true;
        break;
      }

      const side = railSide(world, s);
      if (side) {
        trash.length = 0;
        rails(world, s, trash);
        railCount++;
        if (!firstRail) {
          const sl = hyp(s.vx, s.vy) || 1;
          firstRail = {
            kind: 'rail', id: side, x: s.x, y: s.y,
            normal: { x: s.vx / sl, y: s.vy / sl },   // where it goes next, not the wall
          };
        }
        if (railCount > 4) { done = true; break; }
      }

      for (let k = 0; k < obstacles.length; k++) {
        const o = obstacles[k];
        const dx = o.x - s.x, dy = o.y - s.y;
        const rr = o.r + s.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr) continue;
        const dl = Math.sqrt(d2) || 1;
        out.hit = { kind: 'ball', id: o.id, x: s.x, y: s.y, normal: { x: dx / dl, y: dy / dl } };
        done = true;
        break;
      }
      if (done) break;
      if (hyp(s.vx, s.vy) < TUNING.stopSpeed) { done = true; break; }
    }
    points.push({ x: s.x, y: s.y });
  }
  if (!out.hit && firstRail) out.hit = firstRail;
  if (points.length < 2) points.push({ x: s.x, y: s.y });
  return out;
}

/* ----------------------------------------------------------------- selftest */

function sim(world, maxT, dt = 1 / 60) {
  let t = 0;
  const evts = [];
  while (!isSettled(world) && t < maxT) {
    const e = step(world, dt);
    for (const x of e) evts.push(x);
    t += dt;
  }
  return { t, evts };
}

// Mirrors GATE_LAYOUT/GATE_POS as src/render/table.js lays it out: corner mouths tucked
// against the cushions and two mid-rail mouths hanging outside the felt entirely.
function testGates(world) {
  return setGates(world, [
    { id: 'tl', habitatId: 'tame', x: 7, y: 5, r: 10, slot: 'tl' },
    { id: 'tm', habitatId: 'briny', x: TABLE_W / 2, y: -1.5, r: 10, slot: 'tm' },
    { id: 'tr', habitatId: 'bushy', x: TABLE_W - 7, y: 5, r: 10, slot: 'tr' },
    { id: 'bl', habitatId: 'frozen', x: 7, y: TABLE_H - 5, r: 10, slot: 'bl' },
    { id: 'bm', habitatId: 'dusty', x: TABLE_W / 2, y: TABLE_H + 1.5, r: 10, slot: 'bm' },
    { id: 'br', habitatId: 'gloomy', x: TABLE_W - 7, y: TABLE_H - 5, r: 10, slot: 'br' },
  ]);
}

const snapshot = (w) => JSON.stringify(w.balls.map((b) => [b.x, b.y, b.vx, b.vy, b.spin, b.bounces, b.sunk]));

/** Self-check called by tests/run.mjs — returns { ok, msgs }. */
export function __selftest() {
  const msgs = [];
  let ok = true;
  const t = (cond, label, detail) => {
    if (cond) msgs.push('ok ' + label);
    else { ok = false; msgs.push('FAIL ' + label + (detail !== undefined ? ' <- ' + detail : '')); }
  };
  const finite = (v) => typeof v === 'number' && Number.isFinite(v);

  // --- contract constants and shapes
  t(TABLE_W === 232 && TABLE_H === 116 && Math.abs(BALL_R - 5.2) < 1e-9, 'table constants');
  {
    const w = createWorld({});
    t(w.w === TABLE_W && w.h === TABLE_H && Array.isArray(w.balls) && Array.isArray(w.gates)
      && Array.isArray(w.sunk) && finite(w.friction) && finite(w.restitution)
      && finite(w.railRestitution), 'world shape');
    const b = addBall(w, { animalId: 'lion', x: 50, y: 50 });
    const keys = ['id', 'animalId', 'x', 'y', 'vx', 'vy', 'r', 'mass', 'spin', 'sunk',
      'resting', 'bounces', 'lastHit', 'squash', 'angle', 'sinkT'];
    t(keys.every((k) => k in b), 'ball shape', keys.filter((k) => !(k in b)).join(','));
    t(typeof b.id === 'number' && b.resting === true && b.sunk === false, 'ball defaults');
    t(w.cue === null && setCue(w, b) === b && w.cue === b, 'setCue is optional plumbing');
  }

  // --- rails: bounce, stay inside, count bounces, then stop
  {
    const w = createWorld({});
    const b = addBall(w, { animalId: 'x', x: 40, y: 58 });
    strike(w, b, Math.PI, 1, 0);
    let inside = true;
    let tt = 0;
    while (!isSettled(w) && tt < 14) {
      step(w, 1 / 60); tt += 1 / 60;
      if (b.x < b.r - 1e-6 || b.x > TABLE_W - b.r + 1e-6 || b.y < b.r - 1e-6 || b.y > TABLE_H - b.r + 1e-6) inside = false;
    }
    t(inside, 'a full-power ball never leaves the cushions');
    t(b.bounces >= 1, 'rail bounces are counted', b.bounces);
    t(b.resting && b.vx === 0 && b.vy === 0, 'friction parks the ball exactly at zero');
    t(isSettled(w) && tt < 12, 'single-ball shot settles', tt.toFixed(2));
  }

  // --- no tunnelling through a ball, even above power 1
  {
    const w = createWorld({});
    const a = addBall(w, { animalId: 'a', x: 20, y: 58 });
    const b = addBall(w, { animalId: 'b', x: 210, y: 58 });
    strike(w, a, 0, TUNING.maxPower, 0);
    let passed = false, hit = false;
    for (let i = 0; i < 900 && !isSettled(w); i++) {
      const e = step(w, 1 / 60);
      for (const ev of e) if (ev.type === 'ball') hit = true;
      if (a.x > b.x) passed = true;
    }
    t(hit, 'max-power ball registers the contact');
    t(!passed, 'no tunnelling through a ball at max power');
    t(b.x > 20, 'the struck ball is driven down the table', b.x.toFixed(1));
  }

  // --- 16 racked tight, full-power break: settles, no overlap, nothing escapes
  {
    const rng = makeRng('selftest/break');
    const w = createWorld({});
    testGates(w);
    const ids = [];
    for (let i = 0; i < 16; i++) ids.push('a' + i);
    rack(w, ids, rng, 'triangle');
    let minGap = Infinity;
    for (let i = 0; i < w.balls.length; i++) {
      for (let j = i + 1; j < w.balls.length; j++) {
        minGap = Math.min(minGap, hyp(w.balls[i].x - w.balls[j].x, w.balls[i].y - w.balls[j].y) - w.balls[i].r - w.balls[j].r);
      }
    }
    t(minGap > -1e-9, 'a fresh triangle rack has no overlap', minGap.toFixed(3));
    strike(w, w.balls[0], 0.35, 1, 0.4);
    const r1 = sim(w, 14);
    t(isSettled(w) && r1.t < 12, 'full-power 16-ball break settles inside 12s', r1.t.toFixed(2));
    let bad = 0, out = 0, nan = 0;
    for (const b of w.balls) {
      if (!finite(b.x) || !finite(b.y) || !finite(b.vx) || !finite(b.vy) || !finite(b.spin) || !finite(b.squash)) nan++;
      if (b.sunk) continue;
      if (b.x < -1 || b.y < -1 || b.x > TABLE_W + 1 || b.y > TABLE_H + 1) out++;
      for (const o of w.balls) {
        if (o === b || o.sunk) continue;
        if (hyp(b.x - o.x, b.y - o.y) < (b.r + o.r) * 0.9) bad++;
      }
    }
    t(nan === 0, 'no NaN after a break', nan);
    t(out === 0, 'no escapes after a break', out);
    t(bad === 0, 'no residual overlap after a break', bad);
    t(w.balls.every((b) => b.sunk || (b.vx === 0 && b.vy === 0 && b.resting)), 'every parked ball is truly stopped');
  }

  // --- gate capture: once per ball, sinkT animates, event carries the gate
  {
    const w = createWorld({});
    testGates(w);
    const b = addBall(w, { animalId: 'z', x: 60, y: 60 });
    const ang = Math.atan2(6 - b.y, 6 - b.x);
    strike(w, b, ang, 0.55, 0);
    let gateEvents = 0, seenGate = null, midSink = false;
    for (let i = 0; i < 600; i++) {
      const e = step(w, 1 / 60);
      for (const ev of e) if (ev.type === 'gate' && ev.ball === b) { gateEvents++; seenGate = ev.gate; }
      if (b.sunk && b.sinkT > 0.05 && b.sinkT < 0.95) midSink = true;
      if (b.sunk && b.sinkT >= 1) break;
    }
    t(b.sunk, 'a ball aimed at a gate is captured');
    t(gateEvents === 1, 'the gate event fires exactly once per ball', gateEvents);
    t(seenGate && seenGate.id === 'tl' && seenGate.habitatId === 'tame', 'the event carries the gate');
    t(midSink && b.sinkT >= 1, 'sinkT animates 0..1 for the renderer', b.sinkT);
    t(w.sunk.length === 1 && w.sunk[0] === b, 'world.sunk records the drop');
    t(isSettled(w), 'a table of nothing but sunk balls is settled');
  }

  // --- capture radius honours gate.r * 0.72
  {
    const w = createWorld({});
    setGates(w, [{ id: 'g', habitatId: 'tame', x: 100, y: 58, r: 10 }]);
    // placed by hand: addBall deliberately refuses to spawn a ball on a mouth
    const inn = addBall(w, { animalId: 'i', x: 60, y: 58 });
    inn.x = 100 + 10 * 0.6; inn.y = 58;
    step(w, 1 / 60);
    t(inn.sunk, 'inside 0.72r is captured');
    const outt = addBall(w, { animalId: 'o', x: 60, y: 58 });
    outt.x = 100 + 10 * 0.9; outt.y = 58;
    step(w, 1 / 60);
    t(!outt.sunk, 'outside 0.72r is not captured');
  }

  // --- every mouth in GATE_LAYOUT must swallow a straight shot, mid-rail ones included
  {
    const w0 = createWorld({});
    const gl = testGates(w0);
    let worstSlot = null, worstRate = 1;
    for (const g of gl) {
      let got = 0, tries = 0;
      const rng = makeRng('selftest/pot/' + g.id);
      for (let k = 0; k < 12; k++) {
        const w = createWorld({});
        testGates(w);
        const b = addBall(w, { animalId: 'p', x: rng.range(30, 200), y: rng.range(22, 94) });
        const dist = hyp(g.x - b.x, g.y - b.y);
        strike(w, b, Math.atan2(g.y - b.y, g.x - b.x), Math.min(1, 0.32 + dist / 240), 0);
        tries++;
        let sunkIn = null, tt = 0;
        while (!isSettled(w) && tt < 14) {
          for (const ev of step(w, 1 / 60)) if (ev.type === 'gate') sunkIn = ev.gate.id;
          tt += 1 / 60;
        }
        if (sunkIn === g.id) got++;
      }
      const rate = got / tries;
      if (rate < worstRate) { worstRate = rate; worstSlot = g.id; }
    }
    t(worstRate >= 0.95, 'every gate slot swallows a dead-straight shot', `${worstSlot} ${(worstRate * 100).toFixed(0)}%`);
  }
  {
    // a ball rolling along a cushion drops into the mouth cut into it
    const w = createWorld({});
    testGates(w);
    const b = addBall(w, { animalId: 'q', x: 40, y: 30 });
    b.y = BALL_R;                       // hugging the top rail, aimed along it
    strike(w, b, 0, 0.75, 0);
    let sunkIn = null, tt = 0;
    while (!isSettled(w) && tt < 14) {
      for (const ev of step(w, 1 / 60)) if (ev.type === 'gate') sunkIn = ev.gate.id;
      tt += 1 / 60;
    }
    t(sunkIn === 'tm', 'a rail-hugging roll finds the mid-rail mouth', String(sunkIn));
  }

  // --- predict(): non-mutating, and it agrees with the real shot
  {
    const w = createWorld({});
    testGates(w);
    rack(w, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], makeRng('selftest/predict'), 'triangle');
    const before = snapshot(w);
    const path = predict(w, w.balls[0], 0.7, 1, 40);
    t(snapshot(w) === before, 'predict() does not mutate the world');
    t(Array.isArray(path.points) && path.points.length > 1, 'predict() returns a path', path.points.length);
    t(path.points.every((p) => finite(p.x) && finite(p.y)), 'predict() points are finite');
  }
  {
    // ball-vs-ball agreement
    const w = createWorld({});
    const a = addBall(w, { animalId: 'a', x: 30, y: 58 });
    const b = addBall(w, { animalId: 'b', x: 150, y: 58 });
    const path = predict(w, a, 0, 0.8, 90);
    t(path.hit && path.hit.kind === 'ball' && path.hit.id === b.id, 'predict names the ball it will hit',
      path.hit && `${path.hit.kind}:${path.hit.id}`);
    const ghostX = path.hit ? path.hit.x : 0;
    strike(w, a, 0, 0.8, 0);
    let contactX = null;
    for (let i = 0; i < 600 && contactX === null; i++) {
      const e = step(w, 1 / 60);
      for (const ev of e) if (ev.type === 'ball') contactX = a.x;
    }
    t(contactX !== null && Math.abs(contactX - ghostX) < 2.5, 'the ghost ball lands where the shot does',
      contactX === null ? 'no contact' : Math.abs(contactX - ghostX).toFixed(2));
  }
  {
    // gate agreement — this is the path the autoplay bot leans on
    const w = createWorld({});
    testGates(w);
    const b = addBall(w, { animalId: 'a', x: 120, y: 70 });
    const gate = w.gates.find((g) => g.id === 'tl');
    const ang = Math.atan2(gate.y - b.y, gate.x - b.x);
    const path = predict(w, b, ang, 1, 60);
    t(path.hit && path.hit.kind === 'gate' && path.hit.id === 'tl', 'predict calls the pot',
      path.hit && `${path.hit.kind}:${path.hit.id}`);
    strike(w, b, ang, 1, 0);
    let sunkIn = null;
    for (let i = 0; i < 900 && !sunkIn; i++) {
      const e = step(w, 1 / 60);
      for (const ev of e) if (ev.type === 'gate') sunkIn = ev.gate.id;
    }
    t(sunkIn === 'tl', 'the shot really does drop where predict said', String(sunkIn));
  }
  {
    // long straight shots must be visible inside the step budget the spine uses
    const w = createWorld({});
    testGates(w);
    const b = addBall(w, { animalId: 'a', x: TABLE_W - 20, y: TABLE_H - 20 });
    const g = w.gates.find((x) => x.id === 'tl');
    const ang = Math.atan2(g.y - b.y, g.x - b.x);
    const path = predict(w, b, ang, 1, 60);
    t(path.hit && path.hit.kind === 'gate' && path.hit.id === 'tl', 'a corner-to-corner pot is predicted in 60 steps',
      path.hit && path.hit.kind);
  }

  // --- english: curves the path, transfers on a cushion, stays subtle and stable
  {
    const mk = (spin) => {
      const w = createWorld({});
      const b = addBall(w, { animalId: 'a', x: 20, y: 58 });
      strike(w, b, 0, 0.55, spin);
      const r = sim(w, 14);
      return { y: b.y, x: b.x, tt: r.t, w, b };
    };
    const zero = mk(0), left = mk(-1), right = mk(1);
    t(Math.abs(zero.y - 58) < 0.001, 'no english = dead straight', (zero.y - 58).toFixed(4));
    const dev = Math.abs(right.y - 58);
    t(dev > 1.5 && dev < 45, 'english curves the path, subtly', dev.toFixed(2));
    t(Math.sign(right.y - 58) === -Math.sign(left.y - 58), 'english is signed');
    t(right.tt < 12 && left.tt < 12, 'a spun ball still settles', right.tt.toFixed(2));
  }
  {
    const w = createWorld({});
    const b = addBall(w, { animalId: 'a', x: 40, y: 58 });
    strike(w, b, Math.PI, 0.6, 1);          // straight into the left cushion, full english
    let vt = 0;
    for (let i = 0; i < 400; i++) {
      const e = step(w, 1 / 60);
      if (e.some((ev) => ev.type === 'rail')) { vt = b.vy; break; }
    }
    t(Math.abs(vt) > 1, 'english transfers on rail contact', vt.toFixed(2));
  }

  // --- squash rises on impact, decays away
  {
    const w = createWorld({});
    const a = addBall(w, { animalId: 'a', x: 40, y: 58 });
    addBall(w, { animalId: 'b', x: 120, y: 58 });
    strike(w, a, 0, 0.8, 0);
    let peak = 0;
    for (let i = 0; i < 900 && !isSettled(w); i++) {
      step(w, 1 / 60);
      peak = Math.max(peak, a.squash);
    }
    t(peak > 0.12, 'squash rises on impact', peak.toFixed(3));
    t(a.squash < 0.02, 'squash decays back to rest', a.squash.toFixed(4));
  }

  // --- bounces reset on strike, and any ball may be struck
  {
    const w = createWorld({});
    const a = addBall(w, { animalId: 'a', x: 40, y: 30 });
    const b = addBall(w, { animalId: 'b', x: 190, y: 90 });
    strike(w, a, Math.PI, 1, 0);
    sim(w, 14);
    t(a.bounces > 0, 'bounces accumulate', a.bounces);
    const r = strike(w, b, 0, 0.5, 0);
    t(r === b && !b.resting, 'strike works on any ball on the felt');
    t(a.bounces === 0 && b.bounces === 0, 'strike resets the rail counters for the whole table');
  }

  // --- rack modes: legal placement in every mode
  {
    for (const mode of ['triangle', 'scatter', 'ring', 'diamond']) {
      const w = createWorld({});
      testGates(w);
      const ids = [];
      for (let i = 0; i < 14; i++) ids.push('r' + i);
      const balls = rack(w, ids, makeRng('selftest/rack/' + mode), mode);
      let overlap = 0, outside = 0, inGate = 0;
      for (const b of balls) {
        if (b.x < b.r - 1e-9 || b.y < b.r - 1e-9 || b.x > TABLE_W - b.r + 1e-9 || b.y > TABLE_H - b.r + 1e-9) outside++;
        for (const g of w.gates) if (hyp(g.x - b.x, g.y - b.y) < g.r * TUNING.capture + 0.5) inGate++;
        for (const o of balls) {
          if (o === b) continue;
          if (hyp(b.x - o.x, b.y - o.y) < b.r + o.r - 1e-6) overlap++;
        }
      }
      t(balls.length === 14, `${mode} racks every animal`, balls.length);
      t(overlap === 0, `${mode} rack never overlaps`, overlap);
      t(outside === 0, `${mode} rack stays inside the cushions`, outside);
      t(inGate === 0, `${mode} rack never starts inside a gate`, inGate);
      step(w, 1 / 60);
      t(w.sunk.length === 0 && isSettled(w), `${mode} rack is at rest on frame 1`);
    }
  }

  // --- determinism and the fuzz sweep
  {
    const run = () => {
      const w = createWorld({});
      testGates(w);
      const ids = [];
      for (let i = 0; i < 12; i++) ids.push('d' + i);
      rack(w, ids, makeRng('determinism'), 'triangle');
      strike(w, w.balls[3], 1.1, 1, -0.7);
      sim(w, 14);
      return snapshot(w);
    };
    t(run() === run(), 'identical inputs produce an identical table');
  }
  {
    const rng = makeRng('selftest/fuzz');
    let nan = 0, stuck = 0, esc = 0, over = 0, worst = 0;
    for (let trial = 0; trial < 24; trial++) {
      const w = createWorld({ friction: rng.range(0.8, 1.3) });
      testGates(w);
      const n = 4 + rng.int(12);
      const ids = [];
      for (let i = 0; i < n; i++) ids.push('f' + i);
      rack(w, ids, rng, rng.pick(['triangle', 'scatter', 'ring', 'diamond']));
      for (let shot = 0; shot < 3; shot++) {
        const live = w.balls.filter((b) => !b.sunk);
        if (!live.length) break;
        strike(w, live[rng.int(live.length)], rng.range(0, Math.PI * 2), rng.range(0.05, 1.35), rng.range(-1, 1));
        const r = sim(w, 14);
        worst = Math.max(worst, r.t);
        if (!isSettled(w)) stuck++;
        for (const b of w.balls) {
          if (!finite(b.x) || !finite(b.y) || !finite(b.vx) || !finite(b.vy) || !finite(b.spin)
            || !finite(b.squash) || !finite(b.bounces) || !finite(b.sinkT) || !finite(b.angle)) nan++;
          if (b.sunk) continue;
          if (b.x < -1 || b.y < -1 || b.x > TABLE_W + 1 || b.y > TABLE_H + 1) esc++;
          for (const o of w.balls) {
            if (o === b || o.sunk) continue;
            if (hyp(b.x - o.x, b.y - o.y) < (b.r + o.r) * 0.9) over++;
          }
        }
      }
    }
    t(nan === 0, 'fuzz: no NaN anywhere', nan);
    t(stuck === 0, 'fuzz: every shot settles', stuck);
    t(esc === 0, 'fuzz: nothing escapes', esc);
    t(over === 0, 'fuzz: no residual overlap', over);
    t(worst < 12, 'fuzz: worst settle time under 12s', worst.toFixed(2));
  }

  // --- energy is never created (a break must not become a perpetual motion machine)
  {
    const w = createWorld({});
    const ids = [];
    for (let i = 0; i < 10; i++) ids.push('e' + i);
    rack(w, ids, makeRng('energy'), 'diamond');
    strike(w, w.balls[0], 0.4, 1, 0);
    const ke = () => w.balls.reduce((s, b) => s + (b.sunk ? 0 : 0.5 * b.mass * (b.vx * b.vx + b.vy * b.vy)), 0);
    let prev = ke(), rises = 0;
    for (let i = 0; i < 800 && !isSettled(w); i++) {
      step(w, 1 / 60);
      const now = ke();
      if (now > prev + 1e-6) rises++;
      prev = now;
    }
    t(rises === 0, 'kinetic energy never increases', rises);
  }

  // --- nudge (boss drift) wakes the table without breaking settling
  {
    const w = createWorld({});
    const b = addBall(w, { animalId: 'a', x: 100, y: 58 });
    t(isSettled(w), 'a fresh table is settled');
    nudge(w, 0.1, 0);
    t(isSettled(w) && b.vx === 0, 'a nudge below stop speed leaves the table asleep');
    nudge(w, 60, 0);
    t(!isSettled(w), 'a real nudge wakes the table');
    const r = sim(w, 14);
    t(isSettled(w) && r.t < 12, 'a nudged table settles again', r.t.toFixed(2));
  }

  // --- degenerate inputs must not explode
  {
    const w = createWorld({});
    testGates(w);
    addBall(w, {});
    addBall(w, { x: NaN, y: NaN });
    addBall(w, { x: -900, y: 900 });
    t(w.balls.every((b) => finite(b.x) && finite(b.y) && b.x >= b.r - 1e-9 && b.y >= b.r - 1e-9), 'garbage spawn positions are repaired');
    step(w, NaN); step(w, -1); step(w, 0); step(w, 99);
    t(w.balls.every((b) => finite(b.x) && finite(b.y)), 'garbage dt cannot corrupt the table');
    strike(w, w.balls[0], NaN, NaN, NaN);
    step(w, 1 / 60);
    t(w.balls.every((b) => finite(b.x) && finite(b.vx)), 'garbage strike arguments cannot corrupt the table');
    t(rack(w, null, null, 'nonsense').length === 0, 'rack tolerates an empty list');
    t(predict(w, null, 0, 1, 10).points.length === 0, 'predict tolerates a missing ball');
    const p = predict(w, w.balls[0], NaN, NaN, NaN);
    t(p.points.length > 1 && p.points.every((q) => finite(q.x)), 'predict tolerates garbage arguments');
  }

  return { ok, msgs };
}

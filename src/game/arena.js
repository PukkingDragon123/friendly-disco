// THE FIGHT. Pool, as combat.
//
// One sentence: YOU HIT YOUR OWN ANIMALS AT THEIRS, AND THE ONES YOU BEAT GO ON THE BOAT.
//
// That is the whole loop and every rule below exists to make it a decision rather than a
// reflex. The ones that matter, in the order they matter:
//
//   YOUR ANIMALS ARE THE AMMUNITION AND THE PRIZE. There is no cue ball. You pick one of
//   your own, aim it, and fire it into the mess -- so a shot spends the position of
//   something you care about. A cue ball costs nothing to lose, which is exactly why a game
//   with one has no positional tension.
//
//   THE POCKETS ARE ALL AT THE FAR END. They are the ark's three loading doors. Everything
//   you want to keep has to end up going AWAY from you, which is the hard direction, and
//   that asymmetry is the tactical shape of the whole game.
//
//   BEATEN, NOT KILLED. Under a third of its health a corrupted animal stops fighting and
//   stands there dazed and ordinary again. THAT is when it can be loaded. Keep hitting it
//   and it dies and you get nothing -- so the skill is knowing when to stop hitting and
//   start herding, which is a completely different shot.
//
//   AND AN UNDAZED ONE THAT REACHES A DOOR IS GONE. It is too wild to load: it goes
//   through the hull and into the water and you have lost it. So the doors are not a free
//   win condition; they are a hazard for anything you have not weakened yet.
//
//   THE CHAIN IS THE POINT. Damage scales with impact speed, and a ball your shot set
//   moving carries the shot's heat with it at a decay. One good angle into a cluster is
//   worth four flat hits, which is what makes this pool and not whack-a-mole.
//
// PHASES. aim -> roll -> foes -> aim ... and it is not a strict turn game: the rolling is
// real, physical and watchable, and the enemy turn is a VOLLEY -- everything that can still
// fight charges at once -- so the table is in motion about half the time.
//
// Nothing in here draws. Nothing in here reads the clock or the mouse. The scene owns all of
// that; this file owns what is true.

import { makeRng } from '../core/rng.js';
import {
  createWorld, addBall, setGates, setPosts, setZones, step, strike, isSettled, TUNING,
} from './physics.js';
import { AW, AH, buildGates } from '../render/arena.js';
import { ANIMAL_BY_ID, ANIMALS } from '../data/animals.js';
import {
  CORRUPTED, CORRUPT_BY_ID, CHAMPION_BY_ID, championFor, tableFor,
} from '../data/corrupted.js';

/* ------------------------------------------------------------------- tuning */

// THE FOUR NUMBERS THAT ARE THE GAME, and they were all wrong twice before they were right.
//
// A full-power direct hit has to take about THIRTY PER CENT of a basic beast's health, the
// daze has to land at about FORTY-FIVE per cent, and a dazed beast has to take about a THIRD
// of normal damage. Work it through: two solid hits beat one, and then it survives four more
// nudges while you walk it up the table. That is the shape the whole design describes.
//
// At the first set of numbers a hit did more damage than a beast had health, so nothing was
// ever dazed and every fight was an execution. At the second, health went up threefold and
// nothing ever died -- twelve rounds to clear three waves, which is a different failure with
// the same cause: the window between BEATEN and GONE was set by accident both times.
export const FIGHT = {
  hitScale: 0.085,      // damage per unit of impact speed
  chainDecay: 0.75,     // heat a ball passes on when it sets another one moving
  dazedResist: 0.3,     // damage a beaten beast takes, so there is time to herd it
  dazedMass: 0.55,      // and it goes limp, so a nudge carries it further
  minImpact: 26,        // below this a contact is a nudge and does nothing
  dazedAt: 0.45,        // fraction of max health at which a foe gives up
  foePower: 0.82,       // how hard a charging foe hits, as a shot power
  foeReach: 999,        // a foe will charge from anywhere on the table
  healFruit: 26,
  clayPer: 14,
  tideFrom: 16,         // the round the water starts coming up
  tideStep: 3.2,        // units of near shore lost per round after that
  waveGap: 1.1,         // seconds between a wave clearing and the next arriving
  maxOnTable: 7,        // yours, on the felt at once
};

/* -------------------------------------------------------------------- skills

ONE ACTIVE SKILL PER ANIMAL, and every one of them changes the SHOT rather than adding a
number to it. That is the whole rule: a skill you can describe as "+15% damage" is a stat,
and a stat does not change where you aim. These change where you aim.

Read off tags, so a new animal in the roster has a skill the moment its tags are right and
nothing rots when a tag changes.
*/

export const SKILLS = {
  heavy: {
    name: 'BARGE', blurb: 'Hits like a wall and does not stop.',
    rule: 'Half again the damage, and it keeps rolling through.',
  },
  pierce: {
    name: 'GORE', blurb: 'Goes through the first thing it meets.',
    rule: 'Loses no speed on the first beast it hits.',
  },
  split: {
    name: 'SCATTER', blurb: 'Two more of it, at an angle.',
    rule: 'Fires two lighter echoes either side of the shot.',
  },
  bomb: {
    name: 'BURST', blurb: 'Arrives, and then arrives again.',
    rule: 'The first beast it hits takes a blast, and so does everything near it.',
  },
  bounce: {
    name: 'CAROM', blurb: 'Faster off the rocks than into them.',
    rule: 'Gains speed off each shore it touches, three times.',
  },
  hook: {
    name: 'STOOP', blurb: 'It does not miss the way you do.',
    rule: 'Curves toward the nearest beast for the first moment of the roll.',
  },
  pull: {
    name: 'HAUL', blurb: 'Takes what it hits with it.',
    rule: 'Shoves whatever it hits toward the nearest door.',
  },
  guard: {
    name: 'ANCHOR', blurb: 'Will not be moved. Has never once been moved.',
    rule: 'Instead of a shot: plants, and everything charges IT this round.',
  },
};

export const SKILL_IDS = Object.keys(SKILLS);

const SKILL_TAGS = [
  ['pachyderm', 'heavy'], ['armored', 'heavy'], ['bovine', 'heavy'],
  ['insect', 'split'], ['rodent', 'split'], ['swarm', 'split'],
  ['bird', 'hook'], ['flying', 'hook'],
  ['cat', 'pierce'], ['predator', 'pierce'],
  ['fish', 'pull'], ['swimming', 'pull'], ['aquatic', 'pull'],
  ['fast', 'bounce'], ['equine', 'bounce'],
  ['big', 'guard'], ['slow', 'guard'],
  ['weird', 'bomb'], ['venomous', 'bomb'], ['legendary', 'bomb'],
];

/** Which skill an animal brings. Most specific tag wins, and there is always an answer. */
export function skillFor(a) {
  if (!a) return 'heavy';
  if (a.skillId && SKILLS[a.skillId]) return a.skillId;
  const tags = a.tags || [];
  for (const [tag, sk] of SKILL_TAGS) if (tags.includes(tag)) return sk;
  return 'heavy';
}

/** How hard this animal hits, from its own mass and size. 1 is average. */
export function powerOf(a) {
  const m = (a && a.mass) || 1;
  const s = (a && a.size) || 1;
  return 0.62 + m * 0.26 + s * 0.16;
}

/** How much punishment it can take. */
export function healthOf(a) {
  const m = (a && a.mass) || 1;
  const s = (a && a.size) || 1;
  return Math.round(52 + m * 30 + s * 18);
}

/* ------------------------------------------------------------------- the fight */

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function pickRoster(voyage, rng) {
  // whatever is aboard, and a couple of ordinary animals if the boat is empty
  const ids = ((voyage && voyage.aboard) || []).slice(0, FIGHT.maxOnTable);
  while (ids.length < 3) {
    const a = ANIMALS[Math.floor(rng() * ANIMALS.length)];
    if (a && !ids.includes(a.id)) ids.push(a.id);
  }
  return ids;
}

/**
 * The waves. Three for an ordinary landing, four for an elite, five and a champion for a
 * boss -- because a fight that outlasts its own idea is the commonest way a good loop goes
 * bad, and three rounds of shooting per wave is about as long as one idea lasts.
 */
function buildWaves(island, kind, rng) {
  const d = island.danger || 1;
  const n = kind === 'boss' ? 5 : kind === 'elite' ? 4 : 3;
  const out = [];
  for (let i = 0; i < n; i++) {
    const table = tableFor(island, i, n);
    const count = clamp(Math.round(1.6 + d * 0.35 + i * 0.6), 2, 5);
    const foes = [];
    for (let k = 0; k < count; k++) {
      foes.push(table[Math.floor(rng() * table.length)].id);
    }
    out.push({ foes, champion: null });
  }
  if (kind === 'boss') out[out.length - 1].champion = championFor(island).id;
  else if (kind === 'elite') {
    // an elite is not a boss: it is one tier-two animal with a lot of health, in the last wave
    const hard = CORRUPTED.filter((c) => c.tier >= 2);
    if (hard.length) out[out.length - 1].elite = hard[Math.floor(rng() * hard.length)].id;
  }
  return out;
}

/**
 * The spots. Fruit, clay and the odd apple, scattered where they are worth going to get.
 *
 * NEVER IN THE MIDDLE OF THE OPEN. A pick-up in the centre of the table is a pick-up you
 * collect by accident on the way to something else; the ones that make you plan a shot are
 * the ones tucked behind a rock or hard against a rail, where reaching them costs you the
 * position you wanted next.
 */
function buildSpots(island, posts, rng) {
  const out = [];
  const kinds = ['fruit', 'fruit', 'clay', 'clay', 'apple'];
  const n = 4 + Math.round(rng() * 2);
  for (let i = 0; i < n; i++) {
    const kind = kinds[Math.floor(rng() * kinds.length)];
    // behind a rock, or against a rail
    let x, y;
    if (posts.length && rng() < 0.5) {
      const p = posts[Math.floor(rng() * posts.length)];
      const a = rng() * Math.PI * 2;
      x = clamp(p.x + Math.cos(a) * (p.r + 9), 9, AW - 9);
      y = clamp(p.y + Math.sin(a) * (p.r + 9), 9, AH - 9);
    } else {
      const side = Math.floor(rng() * 3);
      x = side === 0 ? 9 + rng() * 8 : side === 1 ? AW - 9 - rng() * 8
        : 20 + rng() * (AW - 40);
      y = side === 2 ? AH - 10 - rng() * 6 : 14 + rng() * (AH - 28);
    }
    out.push({ id: `s${i}`, kind, x, y, r: 7, taken: false });
  }
  return out;
}

function buildPosts(island, rng) {
  const n = 2 + Math.round(rng() * 2);
  const out = [];
  for (let i = 0; i < n; i++) {
    // never in the mouth of a door, and never in the near band where you are aiming from
    const x = 26 + rng() * (AW - 52);
    const y = 22 + rng() * (AH - 46);
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 26)) continue;
    out.push({ id: `p${i}`, x, y, r: 6 + rng() * 4, e: 0.62, kind: 'rock' });
  }
  return out;
}

export function createFight(o = {}) {
  const island = o.island || { id: 'green', name: 'GREEN REACH', danger: 1, biome: 'grassland' };
  const kind = o.kind || 'fight';
  const rng = makeRng(`${o.seed || 'arena'}:${island.id}:${kind}`);
  // FRICTION IS THE PACE OF THE GAME, and it is set here rather than in physics because
  // physics is shared and self-tested against its own defaults. At the default a full-power
  // shot on this table travelled two table lengths and took THREE AND A QUARTER SECONDS to
  // stop -- which is correct for snooker and unplayable for a fight, because a round is your
  // shot plus their charge and both of them have to settle. At 2.6 a hard shot crosses the
  // table about once and stops in a second and a half: long enough to bank off a shore and
  // mean it, short enough that a round is under three seconds.
  const world = createWorld({
    w: AW, h: AH, friction: 2.6, lookup: (id) => ANIMAL_BY_ID[id] || null,
  });
  const posts = buildPosts(island, rng);
  setPosts(world, posts);
  setGates(world, buildGates());
  setZones(world, []);

  const f = {
    island, kind, seed: o.seed || 'arena', rng, world,
    mine: [], foes: [],
    spots: buildSpots(island, posts, rng),
    waves: buildWaves(island, kind, rng),
    waveIx: -1,
    phase: 'deal',        // deal -> aim -> roll -> foes -> aim ... -> won | lost
    round: 0,
    picked: 0,
    hot: new Map(),       // ballId -> heat, for the round in flight
    clay: 0,
    apples: (o.voyage && o.voyage.apples) || 2,
    caught: [],
    lostToWater: [],
    fallen: [],
    tide: 0,
    log: [],
    notes: [],
    t: 0,
    settleFor: 0,
    voyage: o.voyage || null,
    shots: 0,
  };

  // your animals, in a line along the near shore
  const ids = pickRoster(o.voyage, rng);
  ids.forEach((id, i) => {
    const a = ANIMAL_BY_ID[id] || ANIMALS[0];
    const span = AW - 44;
    const x = 22 + (ids.length === 1 ? span / 2 : (i / (ids.length - 1)) * span);
    const ball = addBall(world, { animalId: a.id, x, y: AH - 11 });
    f.mine.push({
      ball, animalId: a.id, a,
      hp: healthOf(a), maxHp: healthOf(a),
      skill: skillFor(a), power: powerOf(a),
      out: false, aboard: false, planted: 0,
    });
  });

  nextWave(f);
  return f;
}

/* --------------------------------------------------------------------- waves */

export function nextWave(f) {
  f.waveIx++;
  if (f.waveIx >= f.waves.length) { f.phase = 'won'; return; }
  const w = f.waves[f.waveIx];
  const ids = w.foes.slice();
  if (w.champion) ids.push(w.champion);
  if (w.elite) ids.push(w.elite);
  ids.forEach((cid, i) => {
    const def = CORRUPT_BY_ID[cid] || CHAMPION_BY_ID[cid];
    if (!def) return;
    const boss = !!def.boss || (w.elite === cid);
    // HEALTH IS THE CAPTURE WINDOW, and this number is the whole difference between the
    // game the design describes and the game it was. At 0.55 a drowned boar had fifty health
    // and a full-power hit did fifty-nine: every beast in the roster died to one contact and
    // was NEVER dazed, so "beaten, not killed" was a rule the player could not reach. At 1.5
    // it takes three hits to beat one and two or three more gentle knocks to herd it aboard,
    // which is a shape you can plan against.
    const hp = Math.round(def.hp * (boss ? 0.85 : 1.25));
    // CLUSTERED, NOT SPREAD. Spaced evenly across the far shore, every beast was its own
    // separate shot and the chain -- the thing that makes this pool -- never happened. Two
    // loose knots with a gap between them means the good shot is always available and always
    // has to be found.
    const knot = i % 2;
    const kx = AW * (knot ? 0.62 : 0.34) + (f.rng() - 0.5) * 8;
    const x = clamp(kx + (f.rng() - 0.5) * 26, 14, AW - 14);
    const y = 13 + f.rng() * 16 + (boss ? 4 : 0);
    const ball = addBall(f.world, { animalId: def.base, x, y, size: boss ? 1.25 : 1 });
    f.foes.push({
      ball, def, cid, boss,
      a: ANIMAL_BY_ID[def.base] || ANIMALS[0],
      hp, maxHp: hp,
      dazed: false, caught: false, dead: false, lost: false,
      flash: 0,
    });
  });
  f.phase = 'aim';
  f.notes.push(w.champion ? 'SOMETHING WITH A NAME CAME ASHORE'
    : f.waveIx === 0 ? 'THEY ARE ALREADY HERE' : 'MORE OF THEM');
}

/* ---------------------------------------------------------------------- shots */

export function pickable(f) {
  return f.mine.filter((m) => !m.out && !m.aboard);
}

export function pick(f, ix) {
  const list = f.mine;
  if (ix < 0 || ix >= list.length) return false;
  const m = list[ix];
  if (m.out || m.aboard) return false;
  f.picked = ix;
  return true;
}

export function picked(f) {
  const m = f.mine[f.picked];
  return m && !m.out && !m.aboard ? m : pickable(f)[0] || null;
}

/**
 * shoot(f, angle, power) -> true if the shot went off.
 *
 * `power` is 0..1 nominal. The skill is applied HERE rather than in the integrator, which
 * is deliberate: physics stays a pure solver that knows about circles, and every special
 * case in the game is one branch in one function you can read top to bottom.
 */
export function shoot(f, angle, power) {
  if (f.phase !== 'aim') return false;
  const m = picked(f);
  if (!m) return false;
  const sk = m.skill;
  f.hot = new Map();
  f.ghosts = [];
  f.shots++;

  if (sk === 'guard') {
    // ANCHOR does not take a shot. It plants, and it is what everything charges at.
    m.planted = 2;
    f.notes.push(`${m.a.name.toUpperCase()} DUG IN`);
    f.phase = 'foes';
    f.settleFor = 0;
    volley(f);
    return true;
  }

  let p = clamp(power, 0.06, 1) * (1 + (m.power - 1) * 0.5);
  if (sk === 'heavy') p *= 1.12;
  if (sk === 'bounce') p *= 0.94;
  strike(f.world, m.ball, angle, p, 0);
  f.hot.set(m.ball.id, 1);
  m.ball.skill = sk;
  m.ball.skillLeft = sk === 'bounce' ? 3 : sk === 'pierce' ? 1 : sk === 'bomb' ? 1 : 0;
  m.ball.hookLeft = sk === 'hook' ? 0.42 : 0;

  if (sk === 'split') {
    // two lighter echoes, and they are REAL balls: a ghost that cannot be hit is a lie
    for (const s of [-1, 1]) {
      const gb = addBall(f.world, {
        animalId: m.animalId, x: m.ball.x - Math.cos(angle) * 11,
        y: m.ball.y - Math.sin(angle) * 11, size: 0.8,
      });
      if (!gb) continue;
      strike(f.world, gb, angle + s * 0.42, p * 0.66, 0);
      gb.ghost = true;
      gb.owner = m.animalId;
      f.hot.set(gb.id, 0.7);
      f.ghosts.push(gb);
    }
  }

  f.phase = 'roll';
  f.settleFor = 0;
  return true;
}

/** The apple: thrown at a foe, it dazes it outright. The one guaranteed answer in the game. */
export function throwApple(f, foeIx) {
  if (f.apples <= 0) return { ok: false, why: 'no apples' };
  const foe = f.foes[foeIx];
  if (!foe || foe.dead || foe.caught || foe.lost) return { ok: false, why: 'not there' };
  if (foe.dazed) return { ok: false, why: 'already down' };
  f.apples--;
  foe.hp = Math.min(foe.hp, Math.round(foe.maxHp * FIGHT.dazedAt) - 1);
  foe.dazed = true;
  foe.flash = 1;
  f.notes.push(`${foe.def.name.toUpperCase()} IS TAME`);
  return { ok: true, foe };
}

/* --------------------------------------------------------------------- damage */

function foeOf(f, ball) { return f.foes.find((x) => x.ball === ball) || null; }
function mineOf(f, ball) { return f.mine.find((x) => x.ball === ball) || null; }

function hurtFoe(f, foe, dmg) {
  // A BEATEN BEAST IS HARD TO FINISH, and that is the most important number in the file.
  // Without it, the shot that dazes something is usually also the shot that kills it: the
  // window between "it stops fighting" and "it is gone" was about one contact wide, so
  // "beaten, not killed" was a rule the game stated and never let you act on. At forty per
  // cent damage taken, a dazed animal survives two or three more knocks -- which is exactly
  // enough to herd it up the table without being careful, and not enough to ignore.
  const soft = foe.dazed ? FIGHT.dazedResist : 1;
  const d = Math.max(1, Math.round(dmg * soft - (foe.def.armour || 0)));
  foe.hp -= d;
  foe.flash = 1;
  if (!foe.dazed && foe.hp <= foe.maxHp * FIGHT.dazedAt) {
    foe.dazed = true;
    // AND IT GOES LIMP. A beaten animal you have to herd across the table wants to be light:
    // at full mass a gentle nudge moved it four units and a hard one killed it, so there was
    // no shot that both moved it and spared it.
    foe.ball.mass *= FIGHT.dazedMass;
    f.notes.push(`${foe.def.name.toUpperCase()} IS BEATEN — PUT IT ON THE BOAT`);
  }
  if (foe.hp <= 0) {
    foe.dead = true;
    foe.ball.sunk = true;
    f.fallen.push(foe.cid);
    f.notes.push(`${foe.def.name.toUpperCase()} DID NOT MAKE IT`);
  }
  return d;
}

function hurtMine(f, m, dmg) {
  m.hp -= Math.max(1, Math.round(dmg));
  m.flash = 1;
  if (m.hp <= 0) {
    m.out = true;
    m.ball.sunk = true;
    f.notes.push(`${m.a.name.toUpperCase()} IS DOWN`);
  }
}

/**
 * A contact. Who gets hurt depends on WHOSE ROUND IT IS, and that is the only asymmetry in
 * the whole model: on your shot, heat flows out from the ball you struck; on their volley,
 * heat flows out from theirs. A ball with no heat is just furniture, which is what lets you
 * use your own animals as a wall without them beating each other up.
 */
function contact(f, ev) {
  if (ev.speed < FIGHT.minImpact) return;
  const ha = f.hot.get(ev.a.id) || 0;
  const hb = f.hot.get(ev.b.id) || 0;
  const hot = ha >= hb ? ev.a : ev.b;
  const cold = ha >= hb ? ev.b : ev.a;
  const heat = Math.max(ha, hb);
  if (heat <= 0.02) return;
  // the chain: whatever this contact set moving carries the heat on, at a decay
  f.hot.set(cold.id, Math.max(f.hot.get(cold.id) || 0, heat * FIGHT.chainDecay));

  const dmg = ev.speed * FIGHT.hitScale * heat;
  const foe = foeOf(f, cold);
  const mine = mineOf(f, cold);
  const hotMine = mineOf(f, hot);
  if (foe && !foe.dead) {
    const mult = hotMine ? (hotMine.skill === 'heavy' ? 1.5 : 1) * hotMine.power : 1;
    hurtFoe(f, foe, dmg * mult);
    if (hotMine && hotMine.skill === 'bomb' && hot.skillLeft > 0) {
      hot.skillLeft = 0;
      blast(f, cold.x, cold.y, dmg * 0.85);
    }
    if (hotMine && hotMine.skill === 'pull') haulToGate(f, cold);
    if (hotMine && hotMine.skill === 'pierce' && hot.skillLeft > 0) {
      hot.skillLeft = 0;
      // no speed lost on the first beast: put back what the impulse took
      const sp = Math.hypot(hot.vx, hot.vy);
      if (sp > 1) {
        const k = Math.min(2.2, (ev.speed * 0.82) / sp);
        hot.vx *= k; hot.vy *= k;
        hot.resting = false;
      }
    }
  } else if (mine && !mine.out) {
    if (f.phase === 'foes') hurtMine(f, mine, dmg * 0.9);
  }
}

function blast(f, x, y, dmg) {
  f.bursts = f.bursts || [];
  f.bursts.push({ x, y, k: 0 });
  for (const foe of f.foes) {
    if (foe.dead || foe.caught || foe.lost) continue;
    const d = Math.hypot(foe.ball.x - x, foe.ball.y - y);
    if (d > 20 || d < 0.001) continue;
    hurtFoe(f, foe, dmg * (1 - d / 20));
    const a = Math.atan2(foe.ball.y - y, foe.ball.x - x);
    foe.ball.vx += Math.cos(a) * 130;
    foe.ball.vy += Math.sin(a) * 130;
    foe.ball.resting = false;
  }
}

function haulToGate(f, ball) {
  let best = null, bd = 1e9;
  for (const g of f.world.gates) {
    const d = Math.hypot(g.x - ball.x, g.y - ball.y);
    if (d < bd) { bd = d; best = g; }
  }
  if (!best) return;
  const a = Math.atan2(best.y - ball.y, best.x - ball.x);
  ball.vx += Math.cos(a) * 150;
  ball.vy += Math.sin(a) * 150;
  ball.resting = false;
}

/* ---------------------------------------------------------------- their round */

/**
 * The volley. Everything that can still fight charges the nearest of yours, all at once.
 *
 * ALL AT ONCE, and not one at a time, for one reason: a table with eight things moving on it
 * is a spectacle, and a table with one thing moving on it eight times is a queue. It also
 * makes your own animals useful as cover, because two of theirs converging on one of yours
 * will hit each other on the way.
 */
export function volley(f) {
  f.hot = new Map();
  const targets = f.mine.filter((m) => !m.out && !m.aboard);
  const anchor = targets.find((m) => m.planted > 0);
  let any = false;
  for (const foe of f.foes) {
    if (foe.dead || foe.caught || foe.lost || foe.dazed) continue;
    const tgt = anchor || nearest(targets, foe.ball);
    if (!tgt) continue;
    const a = Math.atan2(tgt.ball.y - foe.ball.y, tgt.ball.x - foe.ball.x);
    const enraged = foe.hp < foe.maxHp * 0.5;
    const p = FIGHT.foePower * (foe.def.walk > 0.6 ? 1.18 : 1) * (enraged ? 1.22 : 1);
    strike(f.world, foe.ball, a + (f.rng() - 0.5) * 0.12, p, 0);
    f.hot.set(foe.ball.id, (foe.def.hit || 12) / 10);
    any = true;
  }
  f.phase = 'roll';
  f.after = 'aim';
  f.settleFor = 0;
  if (!any) {
    // nothing left that will fight: straight back to you
    f.phase = 'aim';
    f.after = null;
    advanceRound(f);
  }
  return any;
}

function nearest(list, ball) {
  let best = null, bd = 1e9;
  for (const m of list) {
    const d = Math.hypot(m.ball.x - ball.x, m.ball.y - ball.y);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

function advanceRound(f) {
  f.round++;
  for (const m of f.mine) if (m.planted > 0) m.planted--;
  // THE TIDE. It starts late and it only ever takes the near band, which is where you are
  // standing: the pressure is on the safest place on the table, so camping stops working
  // before it stops being tempting.
  if (f.round >= FIGHT.tideFrom) {
    f.tide = (f.round - FIGHT.tideFrom + 1) * FIGHT.tideStep;
    const line = AH - f.tide;
    for (const m of f.mine) {
      if (m.out || m.aboard) continue;
      if (m.ball.y > line) {
        m.out = true; m.ball.sunk = true;
        f.lostToWater.push(m.animalId);
        f.notes.push(`${m.a.name.toUpperCase()} WAS TAKEN BY THE WATER`);
      }
    }
    for (const foe of f.foes) {
      if (foe.dead || foe.caught || foe.lost) continue;
      if (foe.ball.y > line) { foe.lost = true; foe.ball.sunk = true; }
    }
  }
}

/* ---------------------------------------------------------------------- gates */

function throughGate(f, ball, gate) {
  const foe = foeOf(f, ball);
  if (foe) {
    if (foe.dazed) {
      foe.caught = true;
      f.caught.push(foe.def.gives ? { beast: foe.def.gives, animal: foe.def.base } : null);
      f.notes.push(`${foe.def.name.toUpperCase()} IS ABOARD`);
    } else {
      // too wild to load: it goes through and into the water
      foe.lost = true;
      f.notes.push(`${foe.def.name.toUpperCase()} GOT PAST YOU`);
    }
    return;
  }
  const m = mineOf(f, ball);
  if (m) {
    // THE CREW ONLY TAKE A WOUNDED ONE. The doors are at the far rail and so are the beasts,
    // so a hard shot into a cluster ends up in a doorway about a third of the time -- and
    // when anything of yours that touched one went aboard for good, the winning strategy was
    // to fire your whole team through the hull on turn one and the fight ended 'lost' with
    // three animals safe. Retreating a hurt animal is a real decision; retreating a healthy
    // one is a bug with a story attached.
    if (m.hp > m.maxHp * 0.45) {
      // AND IT HAS TO BE PUT DOWN CLEAR OF THE MOUTH. Physics projects a gate's capture disc
      // onto the felt the ball can actually reach, so a door hanging two units off the far
      // rail captures anything whose centre comes within about fifteen units of it. Setting
      // the ball down nine units below its own radius put it back INSIDE that disc, so it was
      // captured, waved back, captured, waved back, for ever: the first version of this rule
      // hung the game on about eight landings in ten. Out by the capture reach plus a
      // diameter, computed from the gate rather than guessed.
      const reach = (gate ? gate.r : 14) * 0.72 + ball.r * 2 + 3;
      const cy = clamp(gate ? gate.y : 0, ball.r, AH - ball.r);
      ball.sunk = false;
      ball.sinkT = 0;
      ball.gate = null;
      ball.gateId = null;
      const ix = f.world.sunk.indexOf(ball);
      if (ix >= 0) f.world.sunk.splice(ix, 1);
      ball.x = clamp(ball.x, ball.r + 1, AW - ball.r - 1);
      ball.y = clamp(cy + reach, ball.r + 1, AH - ball.r - 1);
      ball.vx *= -0.15;
      ball.vy = Math.abs(ball.vy) * 0.3 + 55;
      ball.resting = false;
      m.wavedBack = 1;
      f.notes.push(`THEY WAVED ${m.a.name.toUpperCase()} BACK OUT`);
      return;
    }
    m.aboard = true;
    f.notes.push(`${m.a.name.toUpperCase()} IS SAFE ABOARD`);
  }
}

/* ---------------------------------------------------------------------- spots */

function collectSpots(f) {
  for (const s of f.spots) {
    if (s.taken) continue;
    for (const m of f.mine) {
      if (m.out || m.aboard) continue;
      if (Math.hypot(m.ball.x - s.x, m.ball.y - s.y) > s.r + m.ball.r) continue;
      s.taken = true;
      s.tookT = 0;
      if (s.kind === 'fruit') {
        m.hp = Math.min(m.maxHp, m.hp + FIGHT.healFruit);
        f.notes.push(`${m.a.name.toUpperCase()} ATE — ${FIGHT.healFruit} BACK`);
      } else if (s.kind === 'clay') {
        f.clay += FIGHT.clayPer;
        f.notes.push(`+${FIGHT.clayPer} CLAY`);
      } else if (s.kind === 'apple') {
        f.apples++;
        f.notes.push('A HOLY APPLE');
      }
      break;
    }
  }
}

/* --------------------------------------------------------------------- update */

export function update(f, dt) {
  f.t += dt;
  for (const foe of f.foes) if (foe.flash > 0) foe.flash = Math.max(0, foe.flash - dt * 3);
  for (const m of f.mine) if (m.flash > 0) m.flash = Math.max(0, m.flash - dt * 3);
  for (const b of f.bursts || []) b.k += dt * 3.4;
  if (f.bursts) f.bursts = f.bursts.filter((b) => b.k < 1);

  if (f.phase === 'won' || f.phase === 'lost' || f.phase === 'left') return;

  if (f.phase === 'roll') {
    // hook: a bird's shot bends toward the nearest beast for the first moment
    for (const m of f.mine) {
      const b = m.ball;
      if (!b || b.sunk || !b.hookLeft || b.hookLeft <= 0) continue;
      b.hookLeft -= dt;
      const tgt = nearestFoeBall(f, b);
      if (!tgt) continue;
      const want = Math.atan2(tgt.y - b.y, tgt.x - b.x);
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 12) continue;
      const cur = Math.atan2(b.vy, b.vx);
      let d = want - cur;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      const turn = clamp(d, -3.2 * dt, 3.2 * dt);
      const na = cur + turn;
      b.vx = Math.cos(na) * sp;
      b.vy = Math.sin(na) * sp;
    }

    const events = step(f.world, dt);
    for (const ev of events) {
      if (ev.type === 'ball') contact(f, ev);
      else if (ev.type === 'gate') throughGate(f, ev.ball, ev.gate);
      else if (ev.type === 'rail') {
        const m = mineOf(f, ev.ball);
        if (m && m.skill === 'bounce' && ev.ball.skillLeft > 0 && (f.hot.get(ev.ball.id) || 0) > 0.1) {
          ev.ball.skillLeft--;
          const sp = Math.hypot(ev.ball.vx, ev.ball.vy);
          if (sp > 1) {
            const k = 1.28;
            ev.ball.vx *= k; ev.ball.vy *= k;
            ev.ball.resting = false;
          }
        }
      }
    }
    collectSpots(f);

    if (isSettled(f.world)) {
      f.settleFor += dt;
      if (f.settleFor > 0.28) {
        // the split echoes go away once the table is still
        for (const gb of f.ghosts || []) gb.sunk = true;
        f.ghosts = [];
        if (f.after === 'aim') {
          f.after = null;
          advanceRound(f);
          f.phase = checkOver(f) || 'aim';
        } else {
          f.phase = checkOver(f) || 'foes';
          if (f.phase === 'foes') volley(f);
        }
      }
    } else {
      f.settleFor = 0;
    }
    return;
  }

  if (f.phase === 'aim') {
    const over = checkOver(f);
    if (over) f.phase = over;
  }
}

function nearestFoeBall(f, ball) {
  let best = null, bd = 1e9;
  for (const foe of f.foes) {
    if (foe.dead || foe.caught || foe.lost) continue;
    const d = Math.hypot(foe.ball.x - ball.x, foe.ball.y - ball.y);
    if (d > 1 && d < bd) { bd = d; best = foe.ball; }
  }
  return best;
}

export function livingFoes(f) {
  return f.foes.filter((x) => !x.dead && !x.caught && !x.lost);
}

function checkOver(f) {
  const mine = f.mine.filter((m) => !m.out && !m.aboard);
  // NOTHING LEFT ON THE TABLE. If some of them walked up a ramp that is a WITHDRAWAL and you
  // keep what you caught; if they were all knocked down it is a loss. Reporting a retreat as
  // a defeat is the kind of small lie that makes a player distrust every other number.
  if (!mine.length) return f.mine.some((m) => m.aboard) ? 'left' : 'lost';
  if (!livingFoes(f).length) {
    if (f.waveIx >= f.waves.length - 1) return 'won';
    nextWave(f);
    return null;
  }
  return null;
}

/* --------------------------------------------------------------------- result */

export function result(f) {
  return {
    won: f.phase === 'won',
    left: f.phase === 'left',
    lost: f.phase === 'lost',
    island: f.island,
    caught: f.caught.filter(Boolean),
    fallen: f.fallen.slice(),
    lostToWater: f.lostToWater.slice(),
    clay: f.clay,
    apples: f.apples,
    rounds: f.round,
    shots: f.shots,
    aboardSafe: f.mine.filter((m) => m.aboard).map((m) => m.animalId),
    stillUp: f.mine.filter((m) => !m.out && !m.aboard).map((m) => m.animalId),
    downed: f.mine.filter((m) => m.out).map((m) => m.animalId),
  };
}

export { TUNING };

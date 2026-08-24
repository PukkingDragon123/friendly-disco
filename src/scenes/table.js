// The gameplay scene.
//
// Flow:  AIM -> CHARGE -> ROLL -> SCORE -> (AIM | CLEARED | FAILED)
// Aim by pointing at an animal you have selected; hold to charge; release to break.
// When everything settles, any animal that fell into a gate is resolved through
// scoring.resolveShot() and the resulting SCRIPT is played back step by step so the
// chips x mult readout assembles itself in front of you.

import { P, col, mix } from '../core/palette.js';
import {
  rect, frame, box, boxFrame, px, line, dashLine, disc, ring, ellipse, ellipseFrame, tri,
  dither, vgrad, text, textW, wrap, wash, clip, clamp, lerp, W, H,
} from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Juice, Ease, tween, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import { createSeascape } from '../render/seascape.js';
import * as UI from '../render/uikit.js';
import { drawAnimal, drawAnimalIcon } from '../render/sprites.js';
import { drawCherub } from '../render/portraits.js';
import {
  createDeck, DECK, VIEW, toScreen, toTable, buildGates, gateScreen, ballPixelRadius, aimAngle,
} from '../render/table.js';
import * as PH from '../game/physics.js';
import { floodHazards, inWater } from '../game/flood.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { HABITAT_BY_ID, likeness, likeRank } from '../data/habitats.js';
import { resolveShot, previewPot } from '../game/scoring.js';
import {
  startBlind, applyShot, endBlind, rerack, drawHand, blindCleared, blindFailed, currentKind,
  movesLeft,
} from '../game/run.js';
import { BLIND_KINDS } from '../data/blinds.js';

/* ---------------------------------------------------------------- layout

960x540, laid out as a ship's console rather than as a scaled-up 640x360:

    y   0.. 18   relic ribbon, full width
    y  20..102   the CHIPS x MULT readout, aligned to the deck's own width
    y 106..390   the deck (DECK.x..DECK.x+w, from render/table.js)
    y 394..536   the controls band: power, english, re-rack, feeds, animal card

    x   0..152   the left console: score, flood, shots, berths, log
    x 155..885   the deck and the readout above it, sharing an edge
    x 888..960   the far rail: blessings, stacked vertically

The console never overlaps the felt. At 640x360 it had to, and the left corner
pockets sat under a drop shadow.
*/
const HUD_X = 4;
const HUD_W = 144;
const RAIL_X = 890;
const RAIL_W = 66;
const RIBBON_H = 18;
const READOUT_Y = 20;
const READOUT_H = 82;
const CTRL_Y = 394;
const CTRL_H = H - CTRL_Y - 4;

export function makeTableScene() {
  let run = null, app = null, onExit = null;
  let world = null, deck = null, sea = null, parts = null;
  let hazards = null;          // {pools, storm} from game/flood.js
  let stormSeen = false;
  let phase = 'intro';
  let t = 0, phaseT = 0;

  // aim / charge
  let selected = null;
  let hoverBall = null;
  let charge = 0, charging = false;
  let touchSelect = null;
  let angle = 0;
  let spin = 0;
  // No trajectory, no target preview. `handValue` is what the SELECTED ANIMAL is
  // worth before the berth is known -- information about your hand, not about the
  // shot you have not taken yet.
  let handValue = null;
  let handValueKey = '';

  // shot bookkeeping
  const pottedThisShot = [];
  let settleGrace = 0;

  // score playback
  let script = null, entryIx = 0, stepIx = 0, stepT = 0;
  let liveChips = 0, liveMult = 0, liveXm = 1;
  let dispChips = 0, dispMult = 0, dispScore = 0;
  let bannerT = 0, bannerText = '', bannerColor = 'white';
  let shotScore = 0;
  let tithed = false;
  let msg = '', msgT = 0;
  // Cherubim that physically carry a scored number up to the ledger. Requested, and it
  // turns out to be the clearest possible "this number went into your total".
  const carriers = [];

  const STEP_TIME = 0.34;

  /* ------------------------------------------------------------- helpers */

  function say(s, dur = 2.2) { msg = s; msgT = dur; }

  function lookup(id) { return ANIMAL_BY_ID[id]; }

  /** Boss effects that live on the physics world rather than in scoring. */
  function applyWorldEffects() {
    const eff = (run.blind && run.blind.effect) || {};
    world.friction = Math.max(0.2, eff.friction || 1);
    world.spinDrift = run.spinDrift || 1;
    syncHazards();
  }

  /**
   * Re-derive the water on the felt from the flood clock. Called whenever the level
   * moves, so a pool appearing is always tied to a shot you took.
   */
  function syncHazards() {
    const eff = (run.blind && run.blind.effect) || {};
    const before = hazards ? hazards.pools.length : 0;
    hazards = floodHazards(run.seed + '/' + run.ante + currentKind(run), run.flood || 0,
      { rate: Math.max(0.6, eff.floodRate || 1) });
    PH.setHazards(world, hazards);
    if (hazards.pools.length > before) {
      Audio.sfx('splash');
      Juice.shake(3, 0.3);
      say(hazards.pools.length === 1 ? 'Water breaks over the rail!' : 'Another surge floods the deck!', 2);
    }
    if (hazards.storm && !stormSeen) {
      stormSeen = true;
      Audio.sfx('boss_sting');
      Juice.shake(6, 0.6);
      Juice.flash('water3', 0.35, 0.4);
      say('A hurricane opens on the deck!', 2.6);
    }
  }

  /**
   * Any animal left standing in water when the shot settles is washed back down into
   * the hold. You keep the animal -- the flood costs you the tempo, which at four
   * shots a blind is expensive enough.
   */
  function washSwamped() {
    if (!hazards || !hazards.pools.length) return;
    let n = 0;
    for (const b of world.balls) {
      if (b.sunk || b.swamped) continue;
      if (!inWater(hazards, b.x, b.y)) continue;
      b.swamped = true;
      b.sunk = true;
      b.sinkT = 1;
      if (b.animalId) run.stash.push(b.animalId);
      const ss = toScreen(b.x, b.y);
      parts.emit('splash', ss.x, ss.y, { count: 16, speed: 90, color: 'water3', life: 0.7 });
      parts.emit('ring', ss.x, ss.y, { count: 2, speed: 30, color: 'foam', life: 0.5 });
      n++;
    }
    if (n > 0) {
      Audio.sfx('splash');
      Juice.shake(4, 0.35);
      say(n === 1 ? 'Swept off the deck — back to the hold!' : `${n} washed back below deck!`, 2.4);
    }
  }

  /** The Carousel: the gates shuffle round one seat between shots. */
  function rotateAssignment() {
    const ring = ['tl', 'tm', 'tr', 'br', 'bm', 'bl'];   // clockwise
    const vals = ring.map((sl) => run.assignment[sl]);
    vals.unshift(vals.pop());
    ring.forEach((sl, i) => { run.assignment[sl] = vals[i]; });
    deck.setAssignment(run.assignment);
    syncGates();
    Audio.sfx('whoosh');
    say('The gates turn!', 1.8);
  }

  function syncGates() {
    const eff = (run.blind && run.blind.effect) || {};
    const gates = buildGates(run.assignment, {
      scale: run.gateScale * (1 - (eff.shrinkGates || 0)),
      closed: eff.closeHabitats || [],
    });
    deck.closed = eff.closeHabitats || [];
    PH.setGates(world, gates.filter((g) => !g.closed));
    return gates;
  }

  function rackHand(mode) {
    world.balls.length = 0;
    world.sunk.length = 0;
    PH.rack(world, run.hand.slice(), run.blind.rng.fork('rack'), mode || 'triangle');
    // The Mimic plants a decoy among the animals.
    const eff = (run.blind && run.blind.effect) || {};
    if (eff.decoy && world.balls.length) {
      const ix = run.blind.rng.int(world.balls.length);
      world.balls[ix].decoy = true;
    }
    for (const b of world.balls) b.shotsSurvived = 0;
    selected = pickShooter();
    Audio.sfx('shuffle');
  }

  /**
   * The ball a player would naturally shoot with: the one with the most room around it,
   * biased toward the near rail. Defaulting to balls[0] hands them the rack apex, which
   * is boxed in on every side and makes the aim guide look broken.
   */
  function pickShooter() {
    let best = null, bestScore = -Infinity;
    for (const b of world.balls) {
      if (b.sunk) continue;
      let nearest = Infinity;
      for (const o of world.balls) {
        if (o === b || o.sunk) continue;
        nearest = Math.min(nearest, Math.hypot(o.x - b.x, o.y - b.y));
      }
      if (nearest === Infinity) nearest = 60;
      const score = Math.min(nearest, 40) + b.y * 0.25;   // clearance, then nearness to the player
      if (score > bestScore) { bestScore = score; best = b; }
    }
    return best || world.balls[0] || null;
  }

  function habitatResidents() {
    const res = {};
    for (const hid of Object.keys(run.vitrine)) {
      res[hid] = run.vitrine[hid].map((id) => ANIMAL_BY_ID[id]).filter(Boolean);
    }
    return res;
  }

  function liveAnimals(exclude) {
    return world.balls
      .filter((b) => !b.sunk && b !== exclude)
      .map((b) => ANIMAL_BY_ID[b.animalId])
      .filter(Boolean);
  }

  /** Drop a freshly drawn animal onto an empty patch of felt. */
  function placeFree(animalId) {
    const rng = run.blind.rng;
    const r = PH.BALL_R;
    for (let tries = 0; tries < 220; tries++) {
      const x = rng.range(r + 2, PH.TABLE_W - r - 2);
      const y = rng.range(r + 2, PH.TABLE_H - r - 2);
      let ok = true;
      for (const b of world.balls) {
        if (Math.hypot(b.x - x, b.y - y) < r * 2.3) { ok = false; break; }
      }
      if (ok) {
        for (const gate of world.gates || []) {
          if (Math.hypot(gate.x - x, gate.y - y) < gate.r + r * 1.6) { ok = false; break; }
        }
      }
      if (ok) {
        const b = PH.addBall(world, { animalId, x, y });
        if (b) { b.shotsSurvived = 0; }
        return b;
      }
    }
    return PH.addBall(world, { animalId, x: PH.TABLE_W * 0.5, y: PH.TABLE_H * 0.5 });
  }

  /* ---------------------------------------------------------------- shot */

  function fire() {
    if (!selected || selected.sunk) return;
    const power = clamp(charge, 0.06, 1) * run.power;
    const bonus = run.stats.shotsTaken === 0 ? (run.breakBonus || 0) : 0;
    PH.strike(world, selected, angle, Math.min(1.35, power + bonus), spin * (run.spin || 0));
    pottedThisShot.length = 0;
    for (const b of world.balls) b.shotsSurvived = (b.shotsSurvived || 0) + 1;
    charging = false; charge = 0;
    phase = 'roll'; phaseT = 0; settleGrace = 0.25;
    Audio.sfx('cue', { vol: 0.6 + power * 0.4, rate: 1 - power * 0.12 });
    Juice.shake(1.2 + power * 2.6, 0.16);
    const s = toScreen(selected.x, selected.y);
    parts.emit('dust', s.x, s.y, { count: 8, speed: 26, color: 'cloth3', life: 0.5 });
    parts.emit('spark', s.x, s.y, { count: 5, angle, spread: 0.5, speed: 90, color: 'brass3' });
  }

  function handleEvents(evts) {
    for (const e of evts) {
      if (e.type === 'ball') {
        const s = toScreen(e.x, e.y);
        Audio.sfx(e.speed > 40 ? 'ball_click' : 'ball_soft', { vol: clamp(e.speed / 120, 0.12, 1) });
        parts.emit('spark', s.x, s.y, { count: e.speed > 60 ? 4 : 2, speed: 40, color: 'white', life: 0.2 });
        if (e.speed > 90) Juice.shake(1.1, 0.09);
      } else if (e.type === 'rail') {
        const s = toScreen(e.x, e.y);
        Audio.sfx('rail', { vol: clamp(e.speed / 140, 0.1, 0.8) });
        parts.emit('dust', s.x, s.y, { count: 3, speed: 22, color: 'wood4', life: 0.35 });
      } else if (e.type === 'gate') {
        onPot(e);
      }
    }
  }

  function onPot(e) {
    const gate = e.gate;
    const animal = ANIMAL_BY_ID[e.ball.animalId];
    pottedThisShot.push({ ball: e.ball, animalId: e.ball.animalId, gate });
    const s = gateScreen(gate);
    const hab = HABITAT_BY_ID[gate.habitatId];
    const exact = animal && (likeness(animal, gate.habitatId) >= 0.999 || animal.id === 'chameleon');

    Audio.sfx('pocket_drop');
    Audio.sfx(exact ? 'pot_perfect' : 'pot_good', { delay: 0.06 });
    Juice.shake(exact ? 3.4 : 2, 0.2);
    if (exact) {
      Juice.flash(hab ? hab.color : 'white', 0.14, 0.32);
      parts.emit('star', s.x, s.y, { count: 10, speed: 60, color: hab ? hab.color : 'gold' });
      parts.emit('ring', s.x, s.y, { count: 2, color: hab ? hab.accent : 'gold' });
      Juice.pop('HOME!', s.x, s.y - 14, { color: 'gold', outline: 'ink' });
    } else {
      parts.emit('dust', s.x, s.y, { count: 8, speed: 34, color: 'grey1' });
    }
    for (const relic of run.relics) {
      if (relic.hooks && relic.hooks.onPot) {
        try { relic.hooks.onPot({ ball: e.ball, animal, gate }, { run, relic, log: () => {} }); } catch (err) { /* isolated */ }
      }
    }
    flockFollows(animal, gate);
  }

  /**
   * The Shepherd's Staff, made real.
   *
   * The card promises that when a sheep goes in another one follows, and a relic hook
   * cannot deliver that -- hooks may only touch the numbers on the animal being scored,
   * never the felt. So the staff sets a counter and the SCENE does the physical part:
   * find another sheep still on the deck and walk it into the same berth, which lands
   * it in this same shot's ledger and compounds with everything else in it.
   */
  function flockFollows(animal, gate) {
    if (!animal || (animal.id !== 'sheep' && animal.id !== 'lamb')) return;
    if (!run.relics.some((r) => r.id === 'shepherds_staff')) return;
    const next = world.balls.find((b) => !b.sunk
      && (b.animalId === 'sheep' || b.animalId === 'lamb'));
    if (!next) return;
    // walk it in: mark it sunk into the same gate and register the pot, so scoring sees
    // two sheep in one shot and the flock rules fire on both
    next.sunk = true;
    next.sinkT = 0;
    next.bounces = num0(next.bounces);
    pottedThisShot.push({ ball: next, animalId: next.animalId, gate });
    const gs = gateScreen(gate);
    const ns = toScreen(next.x, next.y);
    parts.emit('star', ns.x, ns.y, { count: 8, speed: 50, color: 'bone' });
    parts.emit('feather', gs.x, gs.y, { count: 6, speed: 40, color: 'white' });
    Juice.pop('AND ANOTHER!', gs.x, gs.y - 26, { color: 'bone', outline: 'ink' });
    Audio.sfx('pot_good', { delay: 0.12 });
    say("The flock follows the staff.", 2);
  }

  function num0(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

  function beginScoring() {
    const snapshot = {
      run, blind: run.blind, shotIndex: run.stats.shotsTaken, rng: run.blind.rng,
      potted: pottedThisShot.slice(),
      residents: habitatResidents(),
      tableAnimals: liveAnimals(),
      deckAnimals: run.stash.map((id) => ANIMAL_BY_ID[id]).filter(Boolean),
    };
    script = resolveShot(snapshot);
    entryIx = 0; stepIx = 0; stepT = 0;
    liveChips = 0; liveMult = 0; liveXm = 1;
    shotScore = 0;
    phase = 'score'; phaseT = 0;
    if (!script.entries.length) {
      finishScoring();
      return;
    }
    Audio.duck(0.4, 0.6);
  }

  function finishScoring() {
    const res = script || { entries: [], totalScore: 0, totalMoney: 0, consumed: [] };
    const out = applyShot(run, res, pottedThisShot.slice());
    tithed = out.tithed;
    if (out.tithed) { say('THE TITHE takes a shot!', 2.6); Audio.sfx('error'); }

    // clear sunk balls off the felt, top the hand back up, keep the rest where they lie
    world.balls = world.balls.filter((b) => !b.sunk);
    const before = run.hand.length;
    drawHand(run);
    const added = run.hand.slice(before);
    for (const id of added) {
      placeFree(id);
    }
    if (added.length) Audio.sfx('deal');

    if (!world.balls.length && run.stash.length === 0 && !blindCleared(run)) {
      // nothing left to shoot — the blind is over
      run.shotsLeft = 0;
    }
    if (!selected || selected.sunk || !world.balls.includes(selected)) selected = pickShooter();

    pottedThisShot.length = 0;
    script = null;

    if (blindCleared(run)) {
      phase = 'cleared'; phaseT = 0;
      Audio.music('victory', { once: true });
      Audio.sfx('fanfare');
      Juice.flash('gold', 0.4, 0.5);
      for (let i = 0; i < 5; i++) {
        parts.emit('confetti', 100 + i * 110, 30, { count: 18, speed: 120, life: 2.4 });
      }
      endBlind(run);
    } else if (blindFailed(run)) {
      phase = 'failed'; phaseT = 0;
      Audio.sfx('fail');
      Audio.stopMusic(0.6);
      Juice.flash('red1', 0.5, 0.5);
    } else {
      phase = 'aim'; phaseT = 0;
      // the flood advanced inside applyShot, so the water on the felt moves with it
      syncHazards();
      if ((run.blind.effect || {}).rotateGates) rotateAssignment();
      if (movesLeft(run) <= 1) Audio.music('deck_tense');
    }
  }

  function stepScore(dt) {
    stepT += dt;
    if (stepT < STEP_TIME) return;
    stepT = 0;
    const entry = script.entries[entryIx];
    if (!entry) { finishScoring(); return; }

    if (stepIx < entry.steps.length) {
      const st = entry.steps[stepIx];
      liveChips += st.chips || 0;
      liveMult += st.mult || 0;
      liveXm *= st.xmult || 1;
      bannerText = st.label; bannerColor = st.color || 'white'; bannerT = 0.55;

      const gs = entry.gate ? gateScreen(entry.gate) : { x: 400, y: 170 };
      if (st.chips) {
        parts.emit('chip', gs.x, gs.y, { count: Math.min(8, 1 + Math.abs(st.chips) / 20 | 0), target: { x: 300, y: 40 }, color: st.chips > 0 ? 'sky' : 'red2' });
      }
      if (st.kind === 'eat') { Audio.sfx('chomp'); Juice.shake(2.4, 0.18); parts.emit('hunger', gs.x, gs.y, { count: 1 }); }
      else if (st.kind === 'relic') { Audio.sfx('sparkle'); }
      else if (st.kind === 'set') { Audio.sfx('levelup'); }
      else if (st.kind === 'boss') { Audio.sfx('boss_sting'); }
      else Audio.sfx('score_tick', { rate: 1 + stepIx * 0.06 });

      if (st.mult) Juice.pop((st.mult > 0 ? '+' : '') + fmt(st.mult) + ' MULT', 470, 52, { color: st.mult > 0 ? 'red2' : 'grey2' });
      stepIx++;
      return;
    }

    // entry complete: slam it into the score
    shotScore += entry.score;
    run.log.push({ text: `${entry.animal.name} ${entry.score}`, color: 'white' });
    Audio.sfx('score_slam');
    Juice.shake(3.2, 0.22);
    Juice.chromatic(3, 0.25);
    const gs0 = entry.gate ? gateScreen(entry.gate) : { x: 400, y: 200 };
    carriers.push({
      x: gs0.x, y: gs0.y - 18, t: 0,
      life: 1.5, text: '+' + entry.score,
      tx: 74, ty: 62,                 // the score plate in the ledger
      color: entry.match === 'exact' ? 'gold' : entry.match === 'partial' ? 'sky' : 'grey2',
    });
    if (carriers.length > 6) carriers.shift();
    Audio.sfx('sparkle', { delay: 0.08 });
    liveChips = 0; liveMult = 0; liveXm = 1;
    entryIx++; stepIx = 0;
    if (entryIx >= script.entries.length) {
      if (script.perfect) { Juice.pop('PERFECT ARK  +$2', W / 2, 150, { color: 'teal', outline: 'ink' }); Audio.sfx('cash'); }
      phaseT = 0;
      stepT = -0.35;                 // small beat before handing control back
      script.__done = true;
    }
  }

  /* --------------------------------------------------------------- update */

  function update(dt, api) {
    t += dt; phaseT += dt;
    if (msgT > 0) msgT -= dt;
    if (bannerT > 0) bannerT -= dt;
    sea.update(dt);
    deck.update(dt);
    parts.update(dt);

    for (let i = carriers.length - 1; i >= 0; i--) {
      const c = carriers[i];
      c.t += dt;
      const k = clamp(c.t / c.life, 0, 1);
      const e = Ease.inOutCubic(k);
      c.cx = lerp(c.x, c.tx, e);
      c.cy = lerp(c.y, c.ty, e) - Math.sin(e * Math.PI) * 26;
      if (k >= 1) { carriers.splice(i, 1); Audio.sfx('coin', { vol: 0.5 }); }
    }

    dispScore = approach(dispScore, run.score, 9, dt);
    dispChips = approach(dispChips, liveChips, 16, dt);
    dispMult = approach(dispMult, liveMult, 16, dt);

    const m = Input.mouse;

    if (phase === 'intro') {
      if (phaseT > 1.05 || m.pressed || Input.anyPressed()) { phase = 'aim'; phaseT = 0; }
      return;
    }

    if (phase === 'aim') {
      // hover / select
      // Pick radius follows the ball's ON-SCREEN size rather than a constant: at
      // xs=3 an animal is 32 pixels tall, and a 15px grab radius made the near rail
      // feel sticky and the far rail feel unclickable.
      hoverBall = null;
      let bestD = Infinity;
      for (const b of world.balls) {
        if (b.sunk) continue;
        const s = toScreen(b.x, b.y);
        const pr = ballPixelRadius(b.r, b.y);
        const d = Math.hypot(m.x - s.x, m.y - (s.y - pr * 0.55));
        if (d < pr * 1.35 && d < bestD) { bestD = d; hoverBall = b; }
      }

      const onFelt = m.y < CTRL_Y - 4 && m.x > HUD_X + HUD_W;

      if (Input.touch) {
        // --- touchscreen: one gesture does everything. Pull away from the animal to
        // load power, swing your thumb to aim, lift to break. A short still tap
        // instead just selects, so the two never fight.
        if (m.pressed && hoverBall) touchSelect = hoverBall;
        if (m.down && selected && !selected.sunk && onFelt) {
          const s = toScreen(selected.x, selected.y);
          const d = Math.hypot(m.x - s.x, m.y - s.y);
          charge = clamp((d - 18) / 210, 0.12, 1);
          charging = m.holdT > 0.1 && d > 24;
        }
        if (m.released) {
          if (m.tapped && touchSelect) {
            selected = touchSelect;
            Audio.sfx('click');
            const s = toScreen(selected.x, selected.y);
            parts.emit('ring', s.x, s.y, { count: 1, color: 'white' });
          } else if (charging) {
            fire();
          }
          touchSelect = null;
          if (phase === 'aim') { charging = false; charge = 0; }
        }
      } else {
        if (m.pressed && hoverBall && hoverBall !== selected) {
          selected = hoverBall;
          Audio.sfx('click');
          const s = toScreen(selected.x, selected.y);
          parts.emit('ring', s.x, s.y, { count: 1, color: 'white' });
        } else if (m.pressed && onFelt) {
          charging = true; charge = 0;
          Audio.sfx('chalk');
        }
        if (charging) {
          charge = Math.min(1, charge + dt / 0.85);
          if (m.released) fire();
          if (m.rightPressed) { charging = false; charge = 0; Audio.sfx('back'); }
        }
      }

      if (selected && !selected.sunk) {
        angle = aimAngle(selected, m.x, m.y);
        refreshHandValue();
        if (Input.key('KeyA')) spin = clamp(spin - dt * 2, -1, 1);
        if (Input.key('KeyD')) spin = clamp(spin + dt * 2, -1, 1);
        if (m.wheel) spin = clamp(spin + m.wheel * 0.12, -1, 1);
        if (Input.pressed('KeyS')) spin = 0;
      }

      // rerack
      if (Input.pressed('KeyR') || (m.pressed && UI.hover(rerackRect, m))) {
        if (run.reracksLeft > 0) {
          rerack(run);
          rackHand('scatter');
          Audio.sfx('shuffle');
          say('Re-racked.');
          Juice.shake(2, 0.2);
        } else { Audio.sfx('error'); say('No re-racks left!'); }
      }
      // feeds
      for (let i = 0; i < 2; i++) {
        if (m.pressed && UI.hover(feedRect(i), m) && run.feeds[i]) useFeed(i);
        if (Input.pressed(i === 0 ? 'Digit1' : 'Digit2') && run.feeds[i]) useFeed(i);
      }
      return;
    }

    if (phase === 'roll') {
      // The Tide: the whole deck leans, and everything creeps with it
      const drift = (run.blind && run.blind.effect && run.blind.effect.gravityDrift) || 0;
      if (drift && PH.nudge) {
        PH.nudge(world, Math.sin(t * 0.55) * drift * dt * 26, Math.cos(t * 0.4) * drift * dt * 12);
      }
      const evts = PH.step(world, dt);
      handleEvents(evts);
      // ball trails, sampled off the frame counter so they stay deterministic-ish
      if ((api.frame & 1) === 0) {
        for (const b of world.balls) {
          const sp = Math.hypot(b.vx, b.vy);
          if (!b.sunk && sp > 30) {
            const s = toScreen(b.x, b.y);
            parts.emit('trail', s.x, s.y - ballPixelRadius(b.r) * 0.5, { count: 1, color: 'cloth3', life: 0.22, layer: 'back' });
          }
        }
      }
      if (PH.isSettled(world)) {
        settleGrace -= dt;
        // the water takes its share before the ledger opens
        if (settleGrace <= 0) { washSwamped(); beginScoring(); }
      } else settleGrace = 0.25;
      if (phaseT > 18) beginScoring();     // safety valve
      return;
    }

    if (phase === 'score') {
      PH.step(world, dt);                  // let sinking animations finish
      if (script && script.__done) {
        stepT += dt;
        if (stepT > 0.5) finishScoring();
      } else if (script) {
        stepScore(dt);
      } else finishScoring();
      return;
    }

    if (phase === 'cleared') {
      if (phaseT > 0.7 && (m.pressed || Input.anyPressed())) {
        if (onExit) onExit('cleared');
      }
      return;
    }

    if (phase === 'failed') {
      if (phaseT > 0.9 && (m.pressed || Input.anyPressed())) {
        if (onExit) onExit('failed');
      }
    }
  }

  function useFeed(i) {
    const feed = run.feeds[i];
    if (!feed || !feed.use) return;
    const ctx = {
      run, world, balls: world.balls, hand: run.hand, rng: run.blind.rng,
      selected, gates: world.gates,
      log: (s) => say(String(s)),
      stopAll: () => { for (const b of world.balls) { b.vx = 0; b.vy = 0; b.resting = true; } },
      addChips: (id, n) => { if (ANIMAL_BY_ID[id]) run.feedChips[id] = (run.feedChips[id] || 0) + (n || 0); },
      addMult: (id, n) => { if (ANIMAL_BY_ID[id]) run.feedMult[id] = (run.feedMult[id] || 0) + (n || 0); },
      teleport: (ball, gate) => { if (ball && gate) { ball.x = gate.x; ball.y = gate.y; ball.vx = 0; ball.vy = 0; } },
      grantRerack: () => { run.reracksLeft++; },
    };
    try { feed.use(ctx); } catch (e) { /* a bad feed must not kill the run */ }
    feed.charges = (feed.charges || 1) - 1;
    if (feed.charges <= 0) run.feeds.splice(i, 1);
    Audio.sfx('upgrade');
    Juice.flash('green1', 0.16, 0.25);
    say(feed.name + ' used!');
  }

  /**
   * What the selected animal is worth on its own: its printed chips and mult with
   * feeds and relic-independent buffs already folded in, scored against its FAVOURITE
   * trait. It is a floor, not a promise -- the berth you actually hit decides the
   * rest. Recomputed only when the pairing changes, and with relics OFF so that
   * merely selecting an animal cannot advance a relic's counter.
   */
  function refreshHandValue() {
    const a = selected ? ANIMAL_BY_ID[selected.animalId] : null;
    if (!a) { handValue = null; handValueKey = ''; return; }
    const key = a.id + '/' + run.stats.shotsTaken;
    if (key === handValueKey) return;
    handValueKey = key;
    handValue = previewPot(run, run.blind, a.id, a.home, {
      rng: run.blind.rng,
      residents: habitatResidents(),
      tableAnimals: liveAnimals(selected),
      deckAnimals: run.stash.map((id) => ANIMAL_BY_ID[id]).filter(Boolean),
    });
  }

  /* ----------------------------------------------------------------- draw */

  let rerackRect = UI.rectOf(0, 0, 0, 0);
  const feedRects = [UI.rectOf(0, 0, 0, 0), UI.rectOf(0, 0, 0, 0)];
  function feedRect(i) { return feedRects[i]; }

  function draw(g) {
    const eff = (run.blind && run.blind.effect) || {};

    // ---------- backdrop
    rect(g, 0, 0, W, H, 'deep');
    // The sea gets angrier as the water climbs — the backdrop is the timer.
    const fl = clamp(run.flood || 0, 0, 1);
    sea.draw(g, {
      x: 0, y: 0, w: W, h: H, horizonY: 104,
      timeOfDay: run.blind && run.blind.kind === 'boss' ? 0.62 : 0.3,
      storm: clamp((run.blind && run.blind.kind === 'boss' ? 0.45 : 0.08) + fl * 0.55, 0, 1),
      parallax: 0.4, reflect: true,
    });

    // ---------- deck
    deck.drawBase(g);
    parts.draw(g, 'back');
    deck.drawGates(g, { highlight: hoverHabitat(), hideLabels: eff.hideLabels });
    drawAimLayer(g);
    deck.drawAnimals(g, world, { lookup, selected, still: phase === 'score' });
    deck.drawLight(g);
    deck.drawFlood(g, fl, { hazards });
    parts.draw(g, 'front');
    drawGateFronts(g, eff);

    // ---------- HUD
    drawReadout(g);
    drawHud(g);
    drawRail(g);
    drawCarriers(g);
    drawRelicRibbon(g);
    drawControls(g);

    if (phase === 'intro') drawIntro(g);
    if (phase === 'cleared') drawCleared(g);
    if (phase === 'failed') drawFailed(g);

    if (msgT > 0) {
      const a = Math.min(1, msgT);
      const w = textW(msg) + 12;
      rect(g, W / 2 - w / 2 - 4, 356, w + 8, 15, 'ink');
      frame(g, W / 2 - w / 2 - 4, 356, w + 8, 15, 'brass1');
      text(g, msg, W / 2, 360, 'bone', { center: true, font: 5 });
      void a;
    }
  }

  /** Which berth to highlight in the vitrine: the selected animal's favourite. */
  function hoverHabitat() {
    if (!selected) return null;
    const a = ANIMAL_BY_ID[selected.animalId];
    return a ? a.home : null;
  }

  /**
   * The cue, the selection ring, and NOTHING ELSE.
   *
   * There used to be a projected trajectory here and a "~748 IF IT GOES HOME" plate
   * over the target gate. Both are gone on purpose: with the line drawn, every shot
   * was arithmetic, and the only difficulty left was whether you could drag a mouse
   * along a dotted path. You now judge the angle by eye and the strength by the
   * gauge, so a bank shot off two rails is a read rather than a readout.
   */
  function drawAimLayer(g) {
    if (phase !== 'aim' || !selected || selected.sunk) return;
    const s = toScreen(selected.x, selected.y);
    const pr = ballPixelRadius(selected.r);

    // selection ring on the cloth
    ellipseFrame(g, s.x, s.y, pr + 3, Math.round(pr * 0.62) + 2, 'white');
    ellipseFrame(g, s.x, s.y, pr + 6, Math.round(pr * 0.62) + 4, 'cloth3');

    // A short lick of direction right at the ball -- three pixels' worth, enough to
    // confirm which way the cue is pointing, far too short to aim a bank with.
    const nose = pr + 4;
    for (let i = 0; i < 3; i++) {
      const d = nose + i * 4;
      px(g, s.x + Math.cos(angle) * d, s.y + Math.sin(angle) * d * (VIEW.tilt / VIEW.xs),
        i === 0 ? 'white' : i === 1 ? 'bone' : 'grey2');
    }

    // the cue itself, pulled back proportional to charge
    const back = 22 + charge * 40;
    const cx = s.x - Math.cos(angle) * back;
    const cy = s.y - Math.sin(angle) * back * (VIEW.tilt / VIEW.xs) - pr * 0.55;
    const tx = s.x - Math.cos(angle) * (pr + 4);
    const ty = s.y - Math.sin(angle) * (pr + 4) * (VIEW.tilt / VIEW.xs) - pr * 0.55;
    const bx = cx - Math.cos(angle) * 58, by = cy - Math.sin(angle) * 58 * (VIEW.tilt / VIEW.xs);
    line(g, bx, by, tx, ty, 'wood3');
    line(g, bx, by + 1, tx, ty + 1, 'wood1');
    line(g, bx + 1, by - 1, tx, ty - 1, 'wood4');
    // brass ferrule and chalked tip, so the business end is legible against the felt
    line(g, tx + Math.cos(angle) * 4, ty + Math.sin(angle) * 4 * (VIEW.tilt / VIEW.xs), tx, ty, 'brass2');
    px(g, tx, ty, 'ice');
  }

  function drawGateFronts(g, eff) {
    // bottom-row gate labels sit in front of the animals so they never get hidden
    void eff;
  }

  /**
   * A row of trait pips: the ranked conditions an animal is asking for, favourite
   * first and largest. This is the whole trait system's user interface -- you read
   * these three icons off the animal and look for a berth wearing one of them.
   */
  function drawLikes(g, animal, x, y, o = {}) {
    if (!animal || !animal.likes) return 0;
    const big = o.big !== false;
    const step = big ? 20 : 13;
    animal.likes.forEach((tid, i) => {
      const hab = HABITAT_BY_ID[tid];
      if (!hab) return;
      const px0 = x + i * step;
      const sz = big ? (i === 0 ? 16 : 13) : 11;
      const dy = big ? (i === 0 ? 0 : 2) : 0;
      // favourite gets a lit plate, second and third get plain ones
      rect(g, px0, y + dy, sz, sz, i === 0 ? mix(col(hab.color), P.ink, 0.55) : 'ink');
      frame(g, px0, y + dy, sz, sz, i === 0 ? hab.color : mix(col(hab.color), P.ink, 0.45));
      UI.icon(g, hab.icon, px0 + (sz - 8) / 2, y + dy + (sz - 8) / 2, {
        color: i === 0 ? hab.color : mix(col(hab.color), P.grey1, 0.4),
      });
      if (i === 0) px(g, px0 + 1, y + dy + 1, 'white');
    });
    return animal.likes.length * step;
  }

  /** The big CHIPS x MULT slab, aligned to the deck's own width. Focal point. */
  function drawReadout(g) {
    const x = DECK.x, y = READOUT_Y, w = DECK.w, h = READOUT_H;
    UI.panel(g, x, y, w, h, { style: 'slate', shadow: true, rivets: false });

    const blind = run.blind;
    const kindInfo = BLIND_KINDS.find((b) => b.key === currentKind(run)) || BLIND_KINDS[0];
    const bc = blind ? blind.color : kindInfo.color;

    // --- left column: which blind this is, what it does to you, and the target
    const LC = 214;
    UI.ribbon(g, x + 6, y + 6, LC - 24, blind ? blind.name : kindInfo.name, { color: bc, font: 5 });
    if (blind && blind.icon) UI.icon(g, blind.icon, x + LC - 14, y + 8, { color: bc });
    if (blind && blind.desc) {
      wrap(blind.desc, LC - 12, { font: 3 }).slice(0, 2)
        .forEach((l, i) => text(g, l, x + 7, y + 24 + i * 8, 'grey2', { font: 3 }));
    }
    text(g, 'TARGET', x + 7, y + 46, 'grey1', { font: 3 });
    text(g, fmtBig(run.target), x + 52, y + 42, 'gold', { shadow: 'ink', font: 7, scale: 1 });
    const prog = run.target ? clamp(run.score / run.target, 0, 1) : 0;
    UI.bar(g, x + 7, y + 62, LC - 14, 11, prog, {
      fill: prog >= 1 ? 'green1' : prog > 0.66 ? 'amber' : 'gold',
      bg: 'ink', frame: 'grey0', ticks: 4, glow: prog >= 1, stripe: prog > 0 && prog < 1,
    });
    UI.divider(g, x + LC, y + 6, 0, {});
    rect(g, x + LC, y + 6, 1, h - 12, 'grey0');

    // --- centre: chips x mult, at a size you can read from across the room
    const cx = x + LC + Math.round((w - LC) * 0.42);
    const bw = 150, bh = 42;
    const liveMultTotal = Math.max(0, dispMult) * (liveXm || 1);

    // A cherub to each side, holding the plates on ribbons. They beat faster while a
    // shot is being counted.
    const beat = phase === 'score' ? 2.4 : 1;
    const lift = Math.round(Math.sin(t * beat * 2.2) * 2);
    drawCherub(g, cx - bw - 34, y + 40 + lift, t * beat, { scale: 2, arms: true });
    drawCherub(g, cx + bw + 34, y + 40 - lift, t * beat + 1.9, { scale: 2, arms: true });
    line(g, cx - bw - 24, y + 38 + lift, cx - bw - 14, y + 18, 'brass2');
    line(g, cx - bw - 23, y + 39 + lift, cx - bw - 13, y + 19, 'brass0');
    line(g, cx + bw + 24, y + 38 - lift, cx + bw + 14, y + 18, 'brass2');
    line(g, cx + bw + 23, y + 39 - lift, cx + bw + 13, y + 19, 'brass0');

    UI.panel(g, cx - bw - 14, y + 14, bw, bh, { style: 'brass', inset: true, corners: false });
    text(g, String(Math.round(dispChips)), cx - 14 - bw / 2, y + 20, 'ice',
      { center: true, scale: 3, font: 7, shadow: 'ink' });
    text(g, 'CHIPS', cx - 14 - bw / 2, y + 60, 'sky', { font: 3, center: true });

    text(g, '×', cx - 5, y + 24, 'white', { center: true, scale: 3, font: 7, shadow: 'ink' });

    UI.panel(g, cx + 14, y + 14, bw, bh, { style: 'brass', inset: true, corners: false });
    text(g, fmt(liveMultTotal), cx + 14 + bw / 2, y + 20, 'red2',
      { center: true, scale: 3, font: 7, shadow: 'ink' });
    text(g, 'MULT', cx + 14 + bw / 2, y + 60, 'red1', { font: 3, center: true });

    // --- right: this shot's bank, or WHO IS LOADED and what it is asking for. Never
    // what the shot would score -- that number was the game playing itself.
    const rx = x + w - 8;
    if (shotScore > 0) {
      text(g, '+' + shotScore, rx, y + 14, 'gold', { right: true, scale: 3, font: 7, shadow: 'ink' });
      text(g, 'THIS SHOT', rx, y + 50, 'brass2', { font: 3, right: true });
    } else {
      const a = selected ? ANIMAL_BY_ID[selected.animalId] : null;
      if (a) {
        text(g, 'LOADED', rx, y + 8, 'grey1', { font: 3, right: true });
        text(g, a.name, rx, y + 15, 'white', { right: true, font: 7, shadow: 'ink' });
        const base = handValue ? handValue.chips : a.chips;
        const bm = handValue ? handValue.mult * handValue.xmult : a.mult;
        text(g, `${Math.round(base)} × ${fmt(bm)}`, rx, y + 32, 'sky', { right: true, font: 5 });
        text(g, 'WANTS', rx - 62, y + 48, 'grey1', { font: 3, right: true });
        drawLikes(g, a, rx - 58, y + 44);
      } else {
        text(g, 'NOTHING LOADED', rx, y + 20, 'grey1', { font: 5, right: true });
        text(g, 'pick an animal on the deck', rx, y + 34, 'grey0', { font: 3, right: true });
      }
    }

    // --- the step banner: what just fired, in the colour of what kind of thing it was
    if (bannerT > 0 && bannerText) {
      const bw2 = textW(bannerText, { font: 7 }) + 20;
      const bcx = clamp(cx, x + bw2 / 2 + 4, x + w - bw2 / 2 - 4);
      const by = y + h - 6;
      box(g, bcx - bw2 / 2, by, bw2, 17, 'ink', 1);
      boxFrame(g, bcx - bw2 / 2, by, bw2, 17, bannerColor, 1);
      text(g, bannerText, bcx, by + 4, bannerColor, { center: true, font: 7 });
    }
  }

  /** Two cherubim to a plate, hauling a scored number up to the ledger. */
  function drawCarriers(g) {
    for (const c of carriers) {
      if (c.cx === undefined) continue;
      const k = clamp(c.t / c.life, 0, 1);
      if (k > 0.9 && Math.floor(c.t * 26) % 2 === 0) continue;
      const w = textW(c.text) + 12;
      const x = Math.round(c.cx), y = Math.round(c.cy);
      // the plate they are carrying
      box(g, x - w / 2, y - 6, w, 13, 'ink', 2);
      box(g, x - w / 2 + 1, y - 5, w - 2, 11, mix(col(c.color), P.ink, 0.5), 2);
      rect(g, x - w / 2 + 2, y - 4, w - 4, 1, c.color);
      text(g, c.text, x, y - 3, c.color, { center: true, shadow: 'ink' });
      // the pair holding it, and the slings
      drawCherub(g, x - w / 2 - 7, y - 4, t * 1.6 + c.t * 3, { scale: 1, arms: true });
      drawCherub(g, x + w / 2 + 7, y - 4, t * 1.6 + c.t * 3 + 1.6, { scale: 1, arms: true, flip: true });
      line(g, x - w / 2 - 5, y - 3, x - w / 2, y - 4, 'bone');
      line(g, x + w / 2 + 5, y - 3, x + w / 2, y - 4, 'bone');
    }
  }

  /** The left console: score, the flood clock, stock, the berth vitrine, the log. */
  function drawHud(g) {
    const x = HUD_X, y = READOUT_Y, w = HUD_W;
    UI.panel(g, x, y, w, H - y - 4, { style: 'wood', shadow: true });

    let cy = y + 7;
    text(g, `ANTE ${run.ante}/8`, x + 7, cy, 'brass3', { font: 7, shadow: 'ink' });
    cy += 14;
    text(g, currentKind(run).toUpperCase(), x + 7, cy, run.blind ? run.blind.color : 'white', { font: 3 });
    cy += 10;

    // score / target
    UI.panel(g, x + 4, cy, w - 8, 40, { style: 'slate', inset: true });
    text(g, 'SCORE', x + 9, cy + 4, 'grey2', { font: 3 });
    text(g, String(Math.round(dispScore)), x + w - 9, cy + 11, 'gold', { right: true, shadow: 'ink', font: 7, scale: 2 });
    const prog = run.target ? clamp(run.score / run.target, 0, 1) : 0;
    UI.bar(g, x + 9, cy + 29, w - 18, 7, prog, {
      fill: prog >= 1 ? 'green1' : 'gold', bg: 'shadow', frame: 'brass1', glow: prog >= 1,
    });
    cy += 44;
    text(g, 'NEED ' + fmtBig(run.target), x + 7, cy, 'grey2', { font: 3 });
    cy += 12;

    // --- the flood gauge: the real clock, so it gets the space
    const moves = movesLeft(run);
    const floodK = clamp(run.flood || 0, 0, 1);
    UI.panel(g, x + 4, cy, w - 8, 36, { style: 'slate', inset: true });
    text(g, 'FLOOD', x + 9, cy + 4, moves <= 1 ? 'red2' : 'foam', { font: 3 });
    text(g, moves + (moves === 1 ? ' MOVE' : ' MOVES'), x + w - 9, cy + 10, moves <= 1 ? 'red2' : 'ice',
      { right: true, font: 7, shadow: 'ink' });
    UI.bar(g, x + 9, cy + 24, w - 18, 9, floodK, {
      fill: floodK > 0.75 ? 'red2' : floodK > 0.5 ? 'water3' : 'water2',
      bg: 'ink', frame: 'brass1', ticks: Math.max(run.shots, run.shotsLeft),
      stripe: true, glow: floodK > 0.75,
    });
    cy += 41;

    text(g, 'SHOTS', x + 7, cy, 'bone', { font: 3 });
    UI.segBar(g, x + 52, cy - 1, w - 60, 8, Math.max(run.shots, run.shotsLeft), run.shotsLeft,
      { fill: run.shotsLeft <= 1 ? 'red2' : 'sky' });
    cy += 12;
    text(g, 'RACKS', x + 7, cy, 'bone', { font: 3 });
    UI.segBar(g, x + 52, cy - 1, w - 60, 8, Math.max(run.reracks, run.reracksLeft), run.reracksLeft, { fill: 'green1' });
    cy += 16;

    UI.moneyPill(g, x + 7, cy, run.money, {});
    text(g, `${run.caravan.length} aboard`, x + w - 7, cy + 3, 'grey2', { font: 3, right: true });
    cy += 20;

    UI.divider(g, x + 4, cy, w - 8, {});
    cy += 5;

    // --- the berth vitrine: which condition each pocket offers, and who is in it
    text(g, 'BERTHS', x + 7, cy, 'brass2', { font: 3 });
    cy += 9;
    const hov = hoverHabitat();
    for (const gate of deck.gates) {
      const hab = HABITAT_BY_ID[gate.habitatId];
      if (!hab) continue;
      const residents = run.vitrine[gate.habitatId] || [];
      const lit = hab.id === hov && !gate.closed;
      rect(g, x + 4, cy, w - 8, 20, gate.closed ? 'shadow' : lit ? mix(col(hab.color), P.ink, 0.72) : 'ink');
      rect(g, x + 4, cy, 3, 20, gate.closed ? 'grey0' : hab.color);
      if (lit) boxFrame(g, x + 4, cy, w - 8, 20, hab.color, 1);
      UI.icon(g, hab.icon, x + 10, cy + 2, { color: gate.closed ? 'grey0' : hab.accent || hab.color });
      text(g, hab.short, x + 21, cy + 3, gate.closed ? 'grey0' : lit ? 'white' : 'bone', { font: 5 });
      for (let i = 0; i < Math.min(5, residents.length); i++) {
        const a = ANIMAL_BY_ID[residents[i]];
        if (a) drawAnimalIcon(g, a, x + 20 + i * 13, cy + 14, { scale: 1 });
      }
      if (residents.length > 5) text(g, '+' + (residents.length - 5), x + w - 9, cy + 12, 'grey2', { font: 3, right: true });
      if (gate.closed) UI.icon(g, 'lock', x + w - 18, cy + 2, { color: 'grey1' });
      cy += 21;
    }

    cy += 3;
    UI.divider(g, x + 4, cy, w - 8, {});
    cy += 5;
    text(g, 'LOG', x + 7, cy, 'brass2', { font: 3 });
    cy += 9;
    const room = Math.max(0, Math.floor((H - 10 - cy) / 8));
    for (const l of run.log.slice(-room)) {
      text(g, l.text.slice(0, 30), x + 7, cy, l.color || 'grey2', { font: 3 });
      cy += 8;
    }
  }

  /** The far-right rail: relics stacked vertically, one plate each. */
  function drawRail(g) {
    const x = RAIL_X, y = READOUT_Y, w = RAIL_W;
    UI.panel(g, x, y, w, H - y - 4, { style: 'wood', shadow: true });
    text(g, 'RELICS', x + w / 2, y + 6, 'brass2', { font: 3, center: true });
    let cy = y + 16;
    const slots = Math.max(run.relicSlots, run.relics.length);
    for (let i = 0; i < slots; i++) {
      const relic = run.relics[i];
      const r = UI.rectOf(x + 5, cy, w - 10, 30);
      if (!relic) {
        rect(g, r.x, r.y, r.w, r.h, 'shadow');
        boxFrame(g, r.x, r.y, r.w, r.h, 'wood0', 1);
      } else {
        const rc = UI.RARITY_COLOR[relic.rarity] || 'grey2';
        rect(g, r.x, r.y, r.w, r.h, mix(col(rc), P.ink, 0.75));
        boxFrame(g, r.x, r.y, r.w, r.h, rc, 1);
        UI.icon(g, (relic.art && relic.art.icon) || 'gem', r.x + (r.w - 16) / 2, r.y + 6,
          { color: (relic.art && relic.art.fg) || rc, scale: 2 });
        if (UI.hover(r, Input.mouse)) {
          // opens to the LEFT so it never leaves the frame
          UI.tooltip(g, r.x - 194, r.y, {
            title: relic.name, lines: wrap(relic.desc, 176, { font: 3 }), color: rc, w: 186,
          });
        }
      }
      cy += 33;
      if (cy > H - 40) break;
    }
  }

  /** A thin title bar: the ark's name, the blessing in force, and the seed. */
  function drawRelicRibbon(g) {
    rect(g, 0, 0, W, RIBBON_H - 1, 'wood1');
    rect(g, 0, RIBBON_H - 1, W, 1, 'wood0');
    rect(g, 0, 0, W, 1, 'wood3');
    text(g, 'THE ARK', 6, 4, 'brass3', { font: 7 });
    const bless = run.blessing;
    if (bless) {
      const bw = textW(bless.name, { font: 5 }) + 26;
      const bx = Math.round((W - bw) / 2);
      rect(g, bx, 2, bw, RIBBON_H - 5, mix(col(bless.color || 'gold'), P.ink, 0.6));
      boxFrame(g, bx, 2, bw, RIBBON_H - 5, bless.color || 'gold', 1);
      UI.icon(g, bless.icon || 'star', bx + 4, 4, { color: bless.color || 'gold' });
      text(g, bless.name, bx + 16, 5, bless.color || 'gold', { font: 5 });
      if (UI.hover(UI.rectOf(bx, 2, bw, RIBBON_H - 5), Input.mouse)) {
        UI.tooltip(g, bx, RIBBON_H + 2, {
          title: bless.name, lines: wrap(bless.desc || '', 200, { font: 3 }),
          color: bless.color || 'gold', w: 210,
        });
      }
    }
    text(g, run.seed, W - 6, 6, 'wood3', { font: 3, right: true });
  }

  /**
   * The controls band. With the guide line gone, the POWER gauge is the only
   * instrument you have, so it gets the left third of the band and a real scale:
   * tick marks, a needle, and a hard red zone at the top where the cue ball starts
   * jumping the rack apart instead of driving through it.
   */
  function drawControls(g) {
    const x = DECK.x, y = CTRL_Y, w = DECK.w, h = CTRL_H;
    UI.panel(g, x, y, w, h, { style: 'wood', shadow: true });

    // --- power gauge
    const pw = 236;
    text(g, 'POWER', x + 10, y + 7, 'brass2', { font: 5 });
    text(g, charging ? Math.round(charge * 100) + '%' : '—', x + pw + 2, y + 7,
      charging ? (charge > 0.85 ? 'red2' : 'white') : 'grey1', { font: 7, right: true });
    UI.bar(g, x + 10, y + 22, pw - 8, 18, charging ? charge : 0, {
      fill: charge > 0.85 ? 'red2' : charge > 0.5 ? 'amber' : 'green1',
      bg: 'shadow', frame: 'brass1', ticks: 10, stripe: charging, glow: charge > 0.85,
    });
    // the red zone: past here the break scatters wildly and control is gone
    rect(g, x + 10 + Math.round((pw - 8) * 0.85), y + 22, Math.round((pw - 8) * 0.15), 2, 'red2');
    text(g, 'WILD', x + 10 + pw - 8, y + 44, 'red2', { font: 5, right: true });
    text(g, charging ? 'RELEASE TO STRIKE' : 'HOLD TO CHARGE', x + 10, y + 44,
      charging ? 'white' : 'brass3', { font: 5 });
    // no line, no ghost ball, and it says so once where it matters
    text(g, 'NO GUIDE — SHOOT BY EYE', x + 10, y + 58, 'brass2', { font: 5 });

    // --- spin widget (a little cue ball you can click)
    const sx = x + pw + 46, sy = y + 28;
    disc(g, sx, sy, 17, 'bone');
    disc(g, sx - 5, sy - 6, 6, 'white');
    ring(g, sx, sy, 17, 'grey1');
    const dotX = sx + Math.round(spin * 11);
    disc(g, dotX, sy, 3, 'red2');
    px(g, dotX, sy - 2, 'white');
    text(g, 'ENGLISH', sx, y + 50, 'brass2', { font: 3, center: true });
    if (UI.hover(UI.rectOf(sx - 18, sy - 18, 36, 36), Input.mouse) && Input.mouse.down && phase === 'aim' && !charging) {
      spin = clamp((Input.mouse.x - sx) / 12, -1, 1);
    }

    // --- buttons
    rerackRect = UI.rectOf(x + pw + 76, y + 12, 104, 26);
    UI.button(g, rerackRect, 'RE-RACK', {
      state: run.reracksLeft > 0 && phase === 'aim' ? (UI.hover(rerackRect, Input.mouse) ? 'hover' : 'idle') : 'disabled',
      color: 'green0', icon: 'dice', sub: run.reracksLeft + ' left',
    });

    // --- feed slots
    for (let i = 0; i < 2; i++) {
      const fr = UI.rectOf(x + pw + 190 + i * 44, y + 10, 40, 40);
      feedRects[i] = fr;
      const feed = run.feeds[i];
      UI.panel(g, fr.x, fr.y, fr.w, fr.h, { style: 'slate', inset: true });
      if (feed) {
        UI.icon(g, feed.icon || 'hay', fr.x + 12, fr.y + 10, { color: 'green1', scale: 2 });
        text(g, String(i + 1), fr.x + 3, fr.y + 2, 'brass3', { font: 3 });
        if (UI.hover(fr, Input.mouse)) {
          UI.tooltip(g, fr.x, fr.y - 46, { title: feed.name, lines: wrap(feed.desc, 150, { font: 3 }), color: 'green1', w: 160 });
        }
      } else {
        text(g, '—', fr.x + fr.w / 2, fr.y + 15, 'grey0', { center: true, font: 5 });
      }
    }

    // --- the queue: what is still waiting below deck. With the guide line gone you
    // plan two shots ahead instead of one, so knowing who is next actually matters.
    const qy = y + 76;
    text(g, 'STILL BELOW DECK', x + 10, qy, 'brass2', { font: 3 });
    const queue = run.stash.slice(0, 14);
    if (queue.length === 0) {
      text(g, 'the hold is empty', x + 10, qy + 12, 'wood3', { font: 3 });
    }
    queue.forEach((id, i) => {
      const qa = ANIMAL_BY_ID[id];
      if (!qa) return;
      const qx = x + 12 + (i % 14) * 27;
      const qyy = qy + 12;
      rect(g, qx - 2, qyy - 2, 24, 28, 'shadow');
      const fav = HABITAT_BY_ID[qa.home];
      if (fav) rect(g, qx - 2, qyy - 2, 24, 2, fav.color);
      drawAnimalIcon(g, qa, qx + 10, qyy + 10, { scale: 1 });
      if (UI.hover(UI.rectOf(qx - 2, qyy - 2, 24, 28), Input.mouse)) {
        UI.tooltip(g, qx, qyy - 60, {
          title: qa.name, w: 170, color: fav ? fav.color : 'white',
          lines: [`${qa.chips} chips  ×${qa.mult}`, 'wants: ' + qa.likes.map((t) => (HABITAT_BY_ID[t] || {}).name || t).join(', ')],
        });
      }
    });
    if (run.stash.length > 14) {
      text(g, '+' + (run.stash.length - 14), x + 12 + 14 * 27, qy + 20, 'wood3', { font: 3 });
    }

    // --- selected animal card: who is loaded, and exactly what it is asking for
    const a = selected ? ANIMAL_BY_ID[selected.animalId] : null;
    const cw = 300, cxx = x + w - cw - 6;
    UI.panel(g, cxx, y + 6, cw, h - 12, { style: 'slate', inset: true });
    if (a) {
      drawAnimal(g, a, cxx + 26, y + 30, { scale: 1 });
      text(g, a.name, cxx + 50, y + 9, 'white', { font: 7, shadow: 'ink' });
      text(g, `${a.chips} chips  ×${a.mult}`, cxx + 50, y + 24, 'sky', { font: 5 });
      const rc = UI.RARITY_COLOR[a.rarity] || 'grey2';
      text(g, (a.rarity || '').toUpperCase(), cxx + cw - 8, y + 9, rc, { font: 3, right: true });
      // the ranked traits, plus what each is worth right now given the open berths
      text(g, 'WANTS', cxx + 50, y + 38, 'grey1', { font: 3 });
      drawLikes(g, a, cxx + 84, y + 34);
      const rl = wrap(a.rules || a.blurb || '', cw - 14, { font: 3 });
      rl.slice(0, 3).forEach((l, i) => text(g, l, cxx + 7, y + 56 + i * 8, 'grey2', { font: 3 }));
      // and which OPEN berth is the best home for it, by name -- routing help that
      // still leaves the shot itself entirely up to you
      let best = null, bestV = 0;
      for (const gate of deck.gates) {
        if (gate.closed) continue;
        const v = likeness(a, gate.habitatId);
        if (v > bestV) { bestV = v; best = gate; }
      }
      if (best) {
        const hb = HABITAT_BY_ID[best.habitatId];
        const rank = likeRank(a, best.habitatId);
        const lbl = rank === 0 ? 'FAVOURITE' : rank > 0 ? 'CONTENT' : 'WILL SETTLE';
        text(g, 'BEST OPEN BERTH', cxx + cw - 8, y + 24, 'grey1', { font: 3, right: true });
        text(g, hb ? hb.name.toUpperCase() : '?', cxx + cw - 8, y + 32, hb ? hb.color : 'white',
          { font: 7, right: true, shadow: 'ink' });
        text(g, lbl, cxx + cw - 8, y + 48, rank === 0 ? 'gold' : rank > 0 ? 'green1' : 'sky', { font: 3, right: true });
      }
    } else {
      text(g, 'NO ANIMAL LOADED', cxx + cw / 2, y + 16, 'grey1', { font: 7, center: true });
      text(g, Input.touch ? 'tap one on the deck' : 'click one on the deck',
        cxx + cw / 2, y + 32, 'grey0', { font: 3, center: true });
    }

    // hint line
    const hint = phase !== 'aim'
      ? (phase === 'roll' ? 'rolling…' : phase === 'score' ? 'scoring…' : '')
      : Input.touch
        ? 'TAP an animal · DRAG away to aim and load · LIFT to break'
        : 'CLICK an animal · HOLD to charge · A/D or wheel = english · R = re-rack';
    text(g, hint, x + 10, y + h - 12, 'wood3', { font: 3 });
  }

  /** The blind card, slammed down on entry. Bigger frame, bigger slam. */
  function drawIntro(g) {
    const k = clamp(phaseT / 0.35, 0, 1);
    wash(g, 0, 0, W, H, 'ink', 0.55 * (1 - clamp((phaseT - 0.6) / 0.4, 0, 1)));
    const blind = run.blind;
    const w = 460, cx = W / 2;
    const yy = lerp(-70, 200, Ease.outBack(k));
    UI.panel(g, cx - w / 2, yy, w, 116, { style: 'brass', shadow: true, rivets: true });
    UI.ribbon(g, cx - 214, yy + 7, 428, blind ? blind.name : 'BLIND', { color: blind ? blind.color : 'gold', font: 5 });
    text(g, fmtBig(run.target), cx, yy + 32, 'wood0', { center: true, scale: 3, font: 7 });
    text(g, fmtBig(run.target), cx, yy + 30, 'white', { center: true, scale: 3, font: 7, shadow: 'wood1' });
    text(g, 'TO BEAT', cx, yy + 66, 'wood0', { font: 5, center: true });
    // small print gets its own dark strip — engraved brass on brass is unreadable
    const sub = `ANTE ${run.ante}  ·  ${run.shotsLeft} SHOTS  ·  ${run.reracksLeft} RE-RACKS`;
    const sw = Math.max(textW(sub, { font: 5 }), blind && blind.desc ? textW(blind.desc, { font: 5 }) : 0) + 24;
    const sh = blind && blind.desc ? 32 : 18;
    rect(g, cx - sw / 2, yy + 80, sw, sh, 'wood0');
    rect(g, cx - sw / 2, yy + 80, sw, 1, 'brass1');
    if (blind && blind.desc) {
      text(g, blind.desc, cx, yy + 84, blind.color || 'bone', { font: 5, center: true });
      text(g, sub, cx, yy + 98, 'brass2', { font: 5, center: true });
    } else {
      text(g, sub, cx, yy + 84, 'brass2', { font: 5, center: true });
    }
  }

  function drawCleared(g) {
    wash(g, 0, 0, W, H, 'ink', 0.5);
    const k = clamp(phaseT / 0.4, 0, 1);
    const cx = W / 2, w = 440;
    const yy = lerp(-50, 170, Ease.outBack(k));
    UI.panel(g, cx - w / 2, yy, w, 148, { style: 'brass', shadow: true });
    text(g, 'BLIND CLEARED', cx, yy + 12, 'gold', { center: true, font: 7, scale: 2, outline: 'ink' });
    text(g, `${run.score} / ${run.target}`, cx, yy + 46, 'white', { center: true, font: 7, scale: 2, shadow: 'ink' });
    text(g, `shots left  +$${Math.max(0, run.shotsLeft)}`, cx, yy + 76, 'green1', { font: 5, center: true });
    text(g, `interest  +$${Math.min(5, Math.floor(run.money / 5))}`, cx, yy + 90, 'green1', { font: 5, center: true });
    text(g, `$${run.money} in hand`, cx, yy + 106, 'brass3', { center: true, font: 7 });
    if (phaseT > 0.8 && Math.floor(t * 2) % 2 === 0) {
      text(g, 'CLICK TO SAIL FOR EDEN', cx, yy + 128, 'bone', { font: 5, center: true });
    }
  }

  function drawFailed(g) {
    wash(g, 0, 0, W, H, 'red0', 0.45);
    const k = clamp(phaseT / 0.4, 0, 1);
    const cx = W / 2, w = 420;
    const yy = lerp(-50, 178, Ease.outQuad(k));
    UI.panel(g, cx - w / 2, yy, w, 120, { style: 'slate', shadow: true });
    const drowned = (run.flood || 0) >= 1 - 1e-6;
    text(g, drowned ? 'THE WATER TAKES THE DECK' : 'OUT OF SHOTS', cx, yy + 10, 'red2',
      { center: true, font: 7, scale: 2, shadow: 'ink' });
    text(g, `${run.score} / ${run.target}`, cx, yy + 44, 'white', { center: true, font: 7, scale: 2, shadow: 'ink' });
    text(g, drowned ? 'the flood reached the felt' : 'not enough animals found a berth',
      cx, yy + 78, 'grey2', { font: 5, center: true });
    if (phaseT > 0.9 && Math.floor(t * 2) % 2 === 0) {
      text(g, 'CLICK TO CONTINUE', cx, yy + 98, 'bone', { font: 5, center: true });
    }
  }

  /* ---------------------------------------------------------------- scene */

  return {
    enter(args, api) {
      run = args.run; app = api; onExit = args.onExit;
      world = PH.createWorld({});
      deck = createDeck({ seed: 1337, assignment: run.assignment, gateScale: run.gateScale });
      sea = createSeascape(run.seed + '/sea', {});
      parts = createParticles({ limit: 900, seed: run.seed + '/parts' });

      startBlind(run);
      deck.setAssignment(run.assignment);
      syncGates();
      applyWorldEffects();
      rackHand('triangle');

      phase = 'intro'; phaseT = 0;
      dispScore = 0; shotScore = 0;
      Audio.music(run.blind.kind === 'boss' ? 'boss' : 'deck');
      Audio.sfx('blind_start');
      if (run.blind.boss) Audio.sfx('boss_sting', { delay: 0.25 });
      Juice.flash(run.blind.color || 'white', 0.3, 0.3);
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,

    /** Testing + console seam. Read-only by convention. */
    debug() {
      return {
        phase, charge, angle, spin, shotScore,
        run, world, deck, selected, handValue,
        rects: { rerack: rerackRect, feeds: feedRects },
        hazards,
        syncHazards,          // harnesses set run.flood directly, then re-derive the water
      };
    },
  };
}

function fmt(n) {
  if (!isFinite(n)) return '0';
  return Math.abs(n % 1) < 0.05 ? String(Math.round(n)) : n.toFixed(1);
}
function fmtBig(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 10000) return Math.round(n / 1000) + 'K';
  return String(n);
}

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
  dither, vgrad, text, textW, wrap, wash, clip, clamp, lerp,
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
import { ANIMAL_BY_ID } from '../data/animals.js';
import { HABITAT_BY_ID } from '../data/habitats.js';
import { resolveShot, previewPot } from '../game/scoring.js';
import {
  startBlind, applyShot, endBlind, rerack, drawHand, blindCleared, blindFailed, currentKind,
  movesLeft,
} from '../game/run.js';
import { BLIND_KINDS } from '../data/blinds.js';

const HUD_W = 150;
const CTRL_Y = 274;
const READOUT_Y = 18;

export function makeTableScene() {
  let run = null, app = null, onExit = null;
  let world = null, deck = null, sea = null, parts = null;
  let phase = 'intro';
  let t = 0, phaseT = 0;

  // aim / charge
  let selected = null;
  let hoverBall = null;
  let charge = 0, charging = false;
  let touchSelect = null;
  let angle = 0;
  let spin = 0;
  let aimPath = null;
  let aimPreview = null;
  let projected = null;        // cached score preview for the current (animal, gate)
  let projectedKey = '';

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
    const exact = animal && (animal.home === gate.habitatId || animal.id === 'chameleon');

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
  }

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
      if (script.perfect) { Juice.pop('PERFECT ARK  +$2', 320, 96, { color: 'teal', outline: 'ink' }); Audio.sfx('cash'); }
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
      hoverBall = null;
      let bestD = 15;
      for (const b of world.balls) {
        if (b.sunk) continue;
        const s = toScreen(b.x, b.y);
        const d = Math.hypot(m.x - s.x, m.y - (s.y - ballPixelRadius(b.r) * 0.55));
        if (d < bestD) { bestD = d; hoverBall = b; }
      }

      const onFelt = m.y < CTRL_Y - 4 && m.x > HUD_W;

      if (Input.touch) {
        // --- touchscreen: one gesture does everything. Pull away from the animal to
        // load power, swing your thumb to aim, lift to break. A short still tap
        // instead just selects, so the two never fight.
        if (m.pressed && hoverBall) touchSelect = hoverBall;
        if (m.down && selected && !selected.sunk && onFelt) {
          const s = toScreen(selected.x, selected.y);
          const d = Math.hypot(m.x - s.x, m.y - s.y);
          charge = clamp((d - 12) / 140, 0.12, 1);
          charging = m.holdT > 0.1 && d > 16;
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
        refreshProjection();
        if (Input.key('KeyA')) spin = clamp(spin - dt * 2, -1, 1);
        if (Input.key('KeyD')) spin = clamp(spin + dt * 2, -1, 1);
        if (m.wheel) spin = clamp(spin + m.wheel * 0.12, -1, 1);
        if (Input.pressed('KeyS')) spin = 0;

        aimPath = PH.predict(world, selected, angle, Math.max(0.35, charge || 0.6), Math.round(run.guideLen));
        aimPreview = previewFor(aimPath);
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
        if (settleGrace <= 0) beginScoring();
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
   * What would this animal score if it went in? Recomputed only when the pairing
   * changes — resolveShot walks every interaction rule, and the preview deliberately
   * runs with relics OFF so a hover cannot advance a relic's counter.
   */
  function refreshProjection() {
    const a = selected ? ANIMAL_BY_ID[selected.animalId] : null;
    if (!a) { projected = null; projectedKey = ''; return; }
    const gateId = aimPreview ? aimPreview.gate.habitatId : a.home;
    const key = a.id + '/' + gateId + '/' + run.stats.shotsTaken;
    if (key === projectedKey) return;
    projectedKey = key;
    projected = previewPot(run, run.blind, a.id, gateId, {
      rng: run.blind.rng,
      residents: habitatResidents(),
      tableAnimals: liveAnimals(selected),
      deckAnimals: run.stash.map((id) => ANIMAL_BY_ID[id]).filter(Boolean),
    });
  }

  function previewFor(path) {
    if (!path || !path.hit || path.hit.kind !== 'gate') return null;
    const gate = (world.gates || []).find((g) => g.id === path.hit.id);
    if (!gate || !selected) return null;
    const animal = ANIMAL_BY_ID[selected.animalId];
    const hab = HABITAT_BY_ID[gate.habitatId];
    if (!animal || !hab) return null;
    const exact = animal.home === gate.habitatId || animal.id === 'chameleon';
    return { gate, hab, exact };
  }

  /* ----------------------------------------------------------------- draw */

  let rerackRect = UI.rectOf(0, 0, 0, 0);
  const feedRects = [UI.rectOf(0, 0, 0, 0), UI.rectOf(0, 0, 0, 0)];
  function feedRect(i) { return feedRects[i]; }

  function draw(g) {
    const eff = (run.blind && run.blind.effect) || {};

    // ---------- backdrop
    rect(g, 0, 0, 640, 360, 'deep');
    // The sea gets angrier as the water climbs — the backdrop is the timer.
    const fl = clamp(run.flood || 0, 0, 1);
    sea.draw(g, {
      x: 0, y: 0, w: 640, h: 360, horizonY: 96,
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
    deck.drawFlood(g, fl);
    parts.draw(g, 'front');
    drawGateFronts(g, eff);

    // ---------- HUD
    drawReadout(g);
    drawHud(g);
    drawCarriers(g);
    drawRelicRibbon(g);
    drawControls(g);

    if (phase === 'intro') drawIntro(g);
    if (phase === 'cleared') drawCleared(g);
    if (phase === 'failed') drawFailed(g);

    if (msgT > 0) {
      const a = Math.min(1, msgT);
      const w = textW(msg) + 12;
      rect(g, 320 - w / 2, 254, w, 11, 'ink');
      frame(g, 320 - w / 2, 254, w, 11, 'brass1');
      text(g, msg, 320, 257, 'bone', { center: true });
      void a;
    }
  }

  function hoverHabitat() {
    if (aimPreview) return aimPreview.gate.habitatId;
    if (!selected) return null;
    const a = ANIMAL_BY_ID[selected.animalId];
    return a ? a.home : null;
  }

  function drawAimLayer(g) {
    if (phase !== 'aim' || !selected || selected.sunk) return;
    const s = toScreen(selected.x, selected.y);
    const pr = ballPixelRadius(selected.r);

    // selection ring on the cloth
    ellipseFrame(g, s.x, s.y, pr + 2, Math.round(pr * 0.62) + 1, 'white');
    ellipseFrame(g, s.x, s.y, pr + 4, Math.round(pr * 0.62) + 2, 'cloth3');

    if (aimPath) deck.drawAim(g, aimPath, { r: selected.r, color: charging ? 'gold' : 'white' });

    // the cue itself, pulled back proportional to charge
    const back = 16 + charge * 26;
    const cx = s.x - Math.cos(angle) * back;
    const cy = s.y - Math.sin(angle) * back * (VIEW.tilt / VIEW.xs) - pr * 0.55;
    const tx = s.x - Math.cos(angle) * (pr + 3);
    const ty = s.y - Math.sin(angle) * (pr + 3) * (VIEW.tilt / VIEW.xs) - pr * 0.55;
    line(g, cx - Math.cos(angle) * 40, cy - Math.sin(angle) * 40 * (VIEW.tilt / VIEW.xs), tx, ty, 'wood3');
    line(g, cx - Math.cos(angle) * 40 + 1, cy - Math.sin(angle) * 40 * (VIEW.tilt / VIEW.xs) + 1, tx, ty + 1, 'wood1');
    px(g, tx, ty, 'ice');

    // habitat preview tooltip
    if (aimPreview) {
      const gs = gateScreen(aimPreview.gate);
      const a = ANIMAL_BY_ID[selected.animalId];
      const lines = [aimPreview.exact ? 'HOME  x3 chips  +2 mult' : `${aimPreview.hab.name}: mismatch`];
      UI.tooltip(g, gs.x + 12, gs.y - 26, {
        title: a ? a.name + ' -> ' + aimPreview.hab.short : aimPreview.hab.name,
        lines, color: aimPreview.exact ? 'gold' : 'red2', w: 108,
      });
    }
  }

  function drawGateFronts(g, eff) {
    // bottom-row gate labels sit in front of the animals so they never get hidden
    void eff;
  }

  /** The big centred CHIPS x MULT slab — the focal point of the whole screen. */
  function drawReadout(g) {
    const x = 168, y = READOUT_Y, w = 464, h = 66;
    UI.panel(g, x, y, w, h, { style: 'slate', shadow: true, rivets: false });

    const blind = run.blind;
    const kindInfo = BLIND_KINDS.find((b) => b.key === currentKind(run)) || BLIND_KINDS[0];
    const bc = blind ? blind.color : kindInfo.color;

    // --- left: which blind this is, and what it does to you
    UI.ribbon(g, x + 5, y + 5, 138, blind ? blind.name : kindInfo.name, { color: bc, font: 3 });
    if (blind && blind.icon) UI.icon(g, blind.icon, x + 147, y + 6, { color: bc });
    if (blind && blind.desc) {
      wrap(blind.desc, 152, { font: 3 }).slice(0, 2)
        .forEach((l, i) => text(g, l, x + 6, y + 20 + i * 7, 'grey2', { font: 3 }));
    }
    text(g, 'TARGET', x + 6, y + 40, 'grey1', { font: 3 });
    text(g, fmtBig(run.target), x + 40, y + 37, 'gold', { shadow: 'ink', font: 7 });
    const prog = run.target ? clamp(run.score / run.target, 0, 1) : 0;
    UI.bar(g, x + 6, y + 50, 152, 8, prog, {
      fill: prog >= 1 ? 'green1' : prog > 0.66 ? 'amber' : 'gold',
      bg: 'ink', frame: 'grey0', ticks: 4, glow: prog >= 1, stripe: prog > 0 && prog < 1,
    });

    // --- centre: chips x mult, at a size you can read from across the room
    const cx = x + Math.round(w * 0.5) + 12;
    const bw = 104, bh = 30;
    // While aiming, the readout previews the shot instead of sitting on zero — a dead
    // 0 x 0 tells the player nothing, and this is the number they are aiming at.
    const previewing = phase === 'aim' && liveChips === 0 && projected;
    const showChips = previewing ? projected.chips : Math.round(dispChips);
    const liveMultTotal = previewing
      ? projected.mult * projected.xmult
      : Math.max(0, dispMult) * (liveXm || 1);

    // A cherub to each side of the readout, holding the plates on ribbons. They beat
    // faster while a shot is being counted.
    const beat = phase === 'score' ? 2.4 : 1;
    const lift = Math.round(Math.sin(t * beat * 2.2) * 1.5);
    drawCherub(g, cx - bw - 26, y + 28 + lift, t * beat, { scale: 2, arms: true });
    drawCherub(g, cx + bw + 26, y + 28 - lift, t * beat + 1.9, { scale: 2, arms: true });
    // ribbons from their hands to the plate corners
    line(g, cx - bw - 18, y + 28 + lift, cx - bw - 11, y + 14, 'brass2');
    line(g, cx - bw - 18, y + 29 + lift, cx - bw - 11, y + 15, 'brass0');
    line(g, cx + bw + 18, y + 28 - lift, cx + bw + 11, y + 14, 'brass2');
    line(g, cx + bw + 18, y + 29 - lift, cx + bw + 11, y + 15, 'brass0');

    UI.panel(g, cx - bw - 12, y + 12, bw, bh, { style: 'brass', inset: true, corners: false });
    text(g, String(showChips), cx - 12 - bw / 2, y + 16, previewing ? 'sky' : 'ice',
      { center: true, scale: 2, font: 7, shadow: 'ink' });
    text(g, 'CHIPS', cx - 12 - bw / 2, y + 44, 'sky', { font: 3, center: true });

    text(g, '×', cx - 4, y + 18, 'white', { center: true, scale: 2, font: 7, shadow: 'ink' });

    UI.panel(g, cx + 12, y + 12, bw, bh, { style: 'brass', inset: true, corners: false });
    text(g, fmt(liveMultTotal), cx + 12 + bw / 2, y + 16, previewing ? 'red1' : 'red2',
      { center: true, scale: 2, font: 7, shadow: 'ink' });
    text(g, 'MULT', cx + 12 + bw / 2, y + 44, 'red1', { font: 3, center: true });

    // --- right: what this shot has banked so far, or what the aimed shot is worth
    if (previewing) {
      text(g, '~' + projected.score, x + w - 8, y + 14, 'grey2', { right: true, scale: 2, font: 7, shadow: 'ink' });
      text(g, projected.match === 'exact' ? 'IF IT GOES HOME' : projected.match === 'partial' ? 'IF IT GOES CLOSE' : 'IF IT GOES WRONG',
        x + w - 8, y + 36, projected.match === 'exact' ? 'gold' : projected.match === 'partial' ? 'sky' : 'red2',
        { font: 3, right: true });
    } else if (shotScore > 0) {
      text(g, '+' + shotScore, x + w - 8, y + 14, 'gold', { right: true, scale: 2, font: 7, shadow: 'ink' });
      text(g, 'THIS SHOT', x + w - 8, y + 36, 'brass2', { font: 3, right: true });
    }

    // --- the step banner: what just fired, in the colour of what kind of thing it was
    if (bannerT > 0 && bannerText) {
      const bw2 = textW(bannerText, { font: 7 }) + 16;
      const bcx = clamp(cx, x + bw2 / 2 + 4, x + w - bw2 / 2 - 4);
      const by = y + h - 4;
      box(g, bcx - bw2 / 2, by, bw2, 13, 'ink', 1);
      boxFrame(g, bcx - bw2 / 2, by, bw2, 13, bannerColor, 1);
      text(g, bannerText, bcx, by + 2, bannerColor, { center: true, font: 7 });
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

  function drawHud(g) {
    const x = 4, y = 18, w = HUD_W - 8;
    UI.panel(g, x, y, w, 336, { style: 'wood', shadow: true });

    let cy = y + 6;
    // ante + blind
    text(g, `ANTE ${run.ante}/8`, x + 6, cy, 'brass3', { font: 7, shadow: 'ink' });
    text(g, currentKind(run).toUpperCase(), x + w - 6, cy, run.blind ? run.blind.color : 'white', { font: 3, right: true });
    cy += 12;

    // score / target
    UI.panel(g, x + 4, cy, w - 8, 30, { style: 'slate', inset: true });
    text(g, 'SCORE', x + 8, cy + 3, 'grey2', { font: 3 });
    text(g, String(Math.round(dispScore)), x + w - 8, cy + 1, 'gold', { right: true, shadow: 'ink', font: 7 });
    const prog = run.target ? clamp(run.score / run.target, 0, 1) : 0;
    UI.bar(g, x + 8, cy + 16, w - 16, 6, prog, { fill: prog >= 1 ? 'green1' : 'gold', bg: 'shadow', frame: 'brass1', glow: prog >= 1 });
    text(g, 'NEED ' + fmtBig(run.target), x + 8, cy + 24, 'grey2', { font: 3 });
    cy += 36;

    // --- the flood gauge: the real clock, so it gets the space
    const moves = movesLeft(run);
    const floodK = clamp(run.flood || 0, 0, 1);
    UI.panel(g, x + 4, cy, w - 8, 26, { style: 'slate', inset: true });
    text(g, 'FLOOD', x + 8, cy + 3, moves <= 1 ? 'red2' : 'foam', { font: 3 });
    text(g, moves + (moves === 1 ? ' MOVE' : ' MOVES'), x + w - 8, cy + 1, moves <= 1 ? 'red2' : 'ice',
      { right: true, font: 7, shadow: 'ink' });
    // the gauge fills with water and the hull marks show how much rail is left
    UI.bar(g, x + 8, cy + 13, w - 16, 9, floodK, {
      fill: floodK > 0.75 ? 'red2' : floodK > 0.5 ? 'water3' : 'water2',
      bg: 'ink', frame: 'brass1', ticks: Math.max(run.shots, run.shotsLeft),
      stripe: true, glow: floodK > 0.75,
    });
    cy += 30;
    text(g, 'SHOTS', x + 6, cy, 'bone', { font: 3 });
    UI.segBar(g, x + 44, cy - 1, w - 52, 7, Math.max(run.shots, run.shotsLeft), run.shotsLeft, { fill: run.shotsLeft <= 1 ? 'red2' : 'sky' });
    cy += 10;
    text(g, 'RACKS', x + 6, cy, 'bone', { font: 3 });
    UI.segBar(g, x + 44, cy - 1, w - 52, 7, Math.max(run.reracks, run.reracksLeft), run.reracksLeft, { fill: 'green1' });
    cy += 14;

    // money
    UI.moneyPill(g, x + 6, cy, run.money, {});
    text(g, `${run.caravan.length} in caravan`, x + w - 6, cy + 2, 'grey2', { font: 3, right: true });
    cy += 16;

    UI.divider(g, x + 4, cy, w - 8, {});
    cy += 4;

    // habitat vitrine — who lives where, this blind
    text(g, 'HABITATS', x + 6, cy, 'brass2', { font: 3 });
    cy += 8;
    const gates = deck.gates;
    for (const gate of gates) {
      const hab = HABITAT_BY_ID[gate.habitatId];
      if (!hab) continue;
      const residents = run.vitrine[gate.habitatId] || [];
      rect(g, x + 4, cy, w - 8, 13, gate.closed ? 'shadow' : 'ink');
      rect(g, x + 4, cy, 2, 13, hab.color);
      UI.icon(g, hab.icon, x + 8, cy + 2, { color: gate.closed ? 'grey0' : hab.accent || hab.color });
      text(g, hab.short, x + 19, cy + 4, gate.closed ? 'grey0' : 'bone', { font: 3 });
      for (let i = 0; i < Math.min(6, residents.length); i++) {
        const a = ANIMAL_BY_ID[residents[i]];
        if (a) drawAnimalIcon(g, a, x + 40 + i * 11, cy + 6, { scale: 1 });
      }
      if (residents.length > 6) text(g, '+' + (residents.length - 6), x + w - 8, cy + 4, 'grey2', { font: 3, right: true });
      if (gate.closed) UI.icon(g, 'lock', x + w - 16, cy + 2, { color: 'grey1' });
      cy += 14;
    }

    cy += 2;
    UI.divider(g, x + 4, cy, w - 8, {});
    cy += 4;
    // recent log
    text(g, 'LOG', x + 6, cy, 'brass2', { font: 3 });
    cy += 7;
    const logs = run.log.slice(-6);
    for (const l of logs) {
      text(g, l.text.slice(0, 26), x + 6, cy, l.color || 'grey2', { font: 3 });
      cy += 6;
    }
  }

  function drawRelicRibbon(g) {
    rect(g, 0, 0, 640, 15, 'wood1');
    rect(g, 0, 14, 640, 1, 'wood0');
    rect(g, 0, 0, 640, 1, 'wood3');
    text(g, 'RELICS', 4, 4, 'brass2', { font: 3 });
    let x = 34;
    for (const relic of run.relics) {
      const rc = UI.RARITY_COLOR[relic.rarity] || 'grey2';
      rect(g, x, 2, 12, 11, 'ink');
      frame(g, x, 2, 12, 11, rc);
      UI.icon(g, (relic.art && relic.art.icon) || 'gem', x + 2, 3, { color: (relic.art && relic.art.fg) || rc });
      if (UI.hover(UI.rectOf(x, 2, 12, 11), Input.mouse)) {
        UI.tooltip(g, x, 16, { title: relic.name, lines: wrap(relic.desc, 130, { font: 3 }), color: rc, w: 140 });
      }
      x += 14;
    }
    for (let i = run.relics.length; i < run.relicSlots; i++) {
      rect(g, x, 2, 12, 11, 'shadow');
      boxFrame(g, x, 2, 12, 11, 'wood0');
      x += 14;
    }
    // seed + fps, right side
    text(g, run.seed, 636, 4, 'wood3', { font: 3, right: true });
  }

  function drawControls(g) {
    const y = CTRL_Y, x = HUD_W + 4, w = 640 - x - 4, h = 360 - y - 4;
    UI.panel(g, x, y, w, h, { style: 'wood', shadow: true });

    // --- power gauge
    text(g, 'POWER', x + 8, y + 6, 'brass2', { font: 3 });
    const pw = 150;
    UI.bar(g, x + 8, y + 14, pw, 10, charging ? charge : 0, {
      fill: charge > 0.85 ? 'red2' : charge > 0.5 ? 'amber' : 'green1',
      bg: 'shadow', frame: 'brass1', ticks: 5, stripe: charging,
    });
    text(g, charging ? Math.round(charge * 100) + '%' : 'HOLD CLICK', x + 8, y + 27, charging ? 'white' : 'grey1', { font: 3 });

    // --- spin widget (a little cue ball you can click)
    const sx = x + 176, sy = y + 20;
    disc(g, sx, sy, 11, 'bone');
    disc(g, sx - 3, sy - 4, 4, 'white');
    ring(g, sx, sy, 11, 'grey1');
    const dotX = sx + Math.round(spin * 7);
    disc(g, dotX, sy, 2, 'red2');
    px(g, dotX, sy - 1, 'white');
    text(g, 'ENGLISH', sx - 12, y + 34, 'brass2', { font: 3 });
    if (UI.hover(UI.rectOf(sx - 12, sy - 12, 24, 24), Input.mouse) && Input.mouse.down && phase === 'aim' && !charging) {
      spin = clamp((Input.mouse.x - sx) / 8, -1, 1);
    }

    // --- buttons
    rerackRect = UI.rectOf(x + 214, y + 10, 74, 18);
    UI.button(g, rerackRect, 'RE-RACK', {
      state: run.reracksLeft > 0 && phase === 'aim' ? (UI.hover(rerackRect, Input.mouse) ? 'hover' : 'idle') : 'disabled',
      color: 'green0', icon: 'dice', sub: run.reracksLeft + ' left', small: true,
    });

    // --- feed slots
    for (let i = 0; i < 2; i++) {
      const fr = UI.rectOf(x + 296 + i * 34, y + 10, 30, 30);
      feedRects[i] = fr;
      const feed = run.feeds[i];
      UI.panel(g, fr.x, fr.y, fr.w, fr.h, { style: 'slate', inset: true });
      if (feed) {
        UI.icon(g, feed.icon || 'hay', fr.x + 10, fr.y + 6, { color: 'green1' });
        text(g, String(i + 1), fr.x + 2, fr.y + 2, 'brass3', { font: 3 });
        if (UI.hover(fr, Input.mouse)) {
          UI.tooltip(g, fr.x, fr.y - 30, { title: feed.name, lines: wrap(feed.desc, 120, { font: 3 }), color: 'green1', w: 130 });
        }
      } else {
        text(g, '-', fr.x + fr.w / 2, fr.y + 11, 'grey0', { center: true });
      }
    }

    // --- selected animal card
    const a = selected ? ANIMAL_BY_ID[selected.animalId] : null;
    if (a) {
      const cw = 150, cxx = x + w - cw - 4;
      UI.panel(g, cxx, y + 6, cw, h - 12, { style: 'slate', inset: true });
      drawAnimal(g, a, cxx + 16, y + 24, { scale: 1 });
      text(g, a.name, cxx + 32, y + 9, 'white', { font: 7, shadow: 'ink' });
      const hab = HABITAT_BY_ID[a.home];
      if (hab) {
        UI.icon(g, hab.icon, cxx + 32, y + 19, { color: hab.color });
        text(g, hab.name, cxx + 43, y + 21, hab.accent || hab.color, { font: 3 });
      }
      text(g, `${a.chips} chips  ×${a.mult}`, cxx + 32, y + 30, 'sky', { font: 3 });
      const rl = wrap(a.rules || a.blurb || '', cw - 12, { font: 3 });
      rl.slice(0, 2).forEach((l, i) => text(g, l, cxx + 6, y + 42 + i * 6, 'grey2', { font: 3 }));
    }

    // hint line
    const hint = phase !== 'aim'
      ? (phase === 'roll' ? 'rolling…' : phase === 'score' ? 'scoring…' : '')
      : Input.touch
        ? 'TAP an animal to pick it · DRAG away to aim and load · LIFT to break'
        : 'CLICK an animal to select · HOLD to charge · A/D or wheel = english · R = re-rack';
    text(g, hint, x + 8, y + h - 11, 'wood3', { font: 3 });
  }

  function drawIntro(g) {
    const k = clamp(phaseT / 0.35, 0, 1);
    wash(g, 0, 0, 640, 360, 'ink', 0.55 * (1 - clamp((phaseT - 0.6) / 0.4, 0, 1)));
    const blind = run.blind;
    const yy = lerp(-40, 150, Ease.outBack(k));
    const w = 300;
    UI.panel(g, 320 - w / 2, yy, w, 74, { style: 'brass', shadow: true, rivets: true });
    UI.ribbon(g, 320 - 140, yy + 5, 280, blind ? blind.name : 'BLIND', { color: blind ? blind.color : 'gold' });
    text(g, fmtBig(run.target), 320, yy + 22, 'wood0', { center: true, scale: 2 });
    text(g, fmtBig(run.target), 320, yy + 21, 'white', { center: true, scale: 2, shadow: 'wood1' });
    text(g, 'TO BEAT', 320, yy + 38, 'wood0', { font: 3, center: true });
    // small print gets its own dark strip — engraved brass on brass is unreadable
    const sub = `ANTE ${run.ante}  ·  ${run.shotsLeft} SHOTS  ·  ${run.reracksLeft} RE-RACKS`;
    const sw = Math.max(textW(sub, { font: 3 }), blind && blind.desc ? textW(blind.desc, { font: 3 }) : 0) + 14;
    rect(g, 320 - sw / 2, yy + 46, sw, blind && blind.desc ? 20 : 12, 'wood0');
    rect(g, 320 - sw / 2, yy + 46, sw, 1, 'brass1');
    if (blind && blind.desc) {
      text(g, blind.desc, 320, yy + 49, blind.color || 'bone', { font: 3, center: true });
      text(g, sub, 320, yy + 58, 'brass2', { font: 3, center: true });
    } else {
      text(g, sub, 320, yy + 49, 'brass2', { font: 3, center: true });
    }
  }

  function drawCleared(g) {
    wash(g, 0, 0, 640, 360, 'ink', 0.5);
    const k = clamp(phaseT / 0.4, 0, 1);
    const yy = lerp(-30, 128, Ease.outBack(k));
    UI.panel(g, 170, yy, 300, 92, { style: 'brass', shadow: true });
    text(g, 'BLIND CLEARED', 320, yy + 10, 'gold', { center: true, outline: 'ink' });
    text(g, `${run.score} / ${run.target}`, 320, yy + 26, 'white', { center: true });
    text(g, `shots left  +$${Math.max(0, run.shotsLeft)}`, 320, yy + 42, 'green1', { font: 3, center: true });
    text(g, `interest  +$${Math.min(5, Math.floor(run.money / 5))}`, 320, yy + 50, 'green1', { font: 3, center: true });
    text(g, `$${run.money} in hand`, 320, yy + 62, 'brass3', { center: true });
    if (phaseT > 0.8 && Math.floor(t * 2) % 2 === 0) {
      text(g, 'CLICK TO SAIL TO THE DOCK', 320, yy + 78, 'bone', { font: 3, center: true });
    }
  }

  function drawFailed(g) {
    wash(g, 0, 0, 640, 360, 'red0', 0.45);
    const k = clamp(phaseT / 0.4, 0, 1);
    const yy = lerp(-30, 132, Ease.outQuad(k));
    UI.panel(g, 180, yy, 280, 76, { style: 'slate', shadow: true });
    const drowned = (run.flood || 0) >= 1 - 1e-6;
    text(g, drowned ? 'THE WATER TAKES THE DECK' : 'OUT OF SHOTS', 320, yy + 8, 'red2',
      { center: true, font: 7, shadow: 'ink' });
    text(g, `${run.score} / ${run.target}`, 320, yy + 26, 'white', { center: true, scale: 2, shadow: 'ink' });
    text(g, drowned ? 'the flood reached the felt' : 'not enough animals found a home',
      320, yy + 46, 'grey2', { font: 3, center: true });
    if (phaseT > 0.9 && Math.floor(t * 2) % 2 === 0) text(g, 'CLICK TO CONTINUE', 320, yy + 58, 'bone', { font: 3, center: true });
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
        run, world, deck, selected, aimPath, projected,
        rects: { rerack: rerackRect, feeds: feedRects },
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

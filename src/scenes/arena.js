// THE ARENA SCENE. Where you actually play.
//
// The model in game/arena.js decides what is true. This decides what you SEE and what a
// pointer means, and it has exactly one job beyond that: make a shot feel like hitting
// something. Which comes down to four things and nothing else.
//
//   AIM AND POWER IN ONE GESTURE. Press on the arena and drag: the line from your animal to
//   the pointer is the direction, and how far you drag is the power. No timing bar, no
//   oscillating meter, no second click. You can see both halves of the decision at once and
//   change either without letting go, which is the difference between aiming and gambling.
//
//   THE GHOST BALL. While you drag, the game draws where your animal will be when it TOUCHES
//   whatever is in the way, and an arrow showing which way that thing will go. That is the
//   one piece of information a pool player actually uses, and it is not a prediction line --
//   it does not tell you what will happen, it tells you the geometry you are already
//   looking at. Herding a beaten animal into a door is unplayable without it and trivial
//   with it, and unplayable-without is not difficulty.
//
//   IMPACT. Hit-stop, a shake scaled to the blow, a white flash on the thing that got hit,
//   the number that came off it, and dust. Six frames of hitch on a big contact is worth
//   more than any amount of damage tuning.
//
//   AND YOU CAN ALWAYS SEE WHOSE TURN IT IS. The tray dims and a banner crosses the frame
//   when they charge, because a table that starts moving on its own with no warning reads as
//   a bug.

import {
  W, H, rect, text, textW, wrap, wash, disc, ellipse, ellipseFrame, tri, line,
  clamp, lerp, makeCanvas,
} from '../core/pixel.js';
import { P, mix } from '../core/palette.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { createParticles } from '../core/particles.js';
import * as UI from '../render/uikit.js';
import {
  AW, AH, GROUND, VIEW, toScreen, toArena, bakeArena, drawArenaFoliage, drawArenaGrass,
  drawArenaWater, drawBall, drawPost, drawZone, drawGate, drawAim, drawCharge, ballPixelRadius,
} from '../render/arena.js';
import { drawAnimalIcon, drawAnimalShadow, drawAnimal } from '../render/sprites.js';
import { drawFolk } from '../render/folk.js';
import {
  makeCam, camKick, camTick, camWrap, speedLines, shockRing, dust as cineDust,
} from '../render/cine.js';
import {
  createFight, update as updateFight, shoot, picked, pick, pickable, livingFoes,
  throwApple, result, SKILLS, FIGHT,
} from '../game/arena.js';

const TRAY_Y = 436;
const MAX_DRAG = 190;             // pixels of drag for a full-power shot

export function makeArenaScene() {
  let f = null;
  let onDone = null;
  let bake = null;
  let parts = null;
  let t = 0, intro = 0, outT = -1;
  let dragging = false;
  let aim = 0, power = 0;
  let hitStop = 0;
  // THE COMBAT CAMERA. Hit-stop and a shake are the floor, not the ceiling: a shot that
  // lands hard should also PUSH IN on what it hit, and a capture should be a moment rather
  // than a particle burst. `punch` is extra zoom that decays, `look` is what it leans towards,
  // and both are forced back to nothing while you are aiming -- the drag reads the mouse in
  // screen space, so an aiming camera would put the ghost ball somewhere the shot will not go.
  const cam = makeCam();
  let punch = 0;
  let look = { x: W / 2, y: GROUND.farY + 60 };
  let banner = null, bannerT = 0;
  let floaters = [];
  let hoverFoe = -1, hoverCard = -1;
  let appleMode = false;
  let lastNote = '';
  let noteT = 0;
  let captureFx = [];
  let cardRects = [];
  let appleRect = UI.rectOf(0, 0, 0, 0);
  let doneRect = UI.rectOf(0, 0, 0, 0);
  let shownNotes = 0;

  /* ------------------------------------------------------------------ helpers */

  function say(s, life = 2.2) { lastNote = s; noteT = life; }

  function drainNotes() {
    while (shownNotes < f.notes.length) {
      const n = f.notes[shownNotes++];
      say(n);
      if (/ABOARD/.test(n)) Audio.sfx('levelup');
      else if (/BEATEN/.test(n)) Audio.sfx('coin');
      else if (/DID NOT MAKE IT|IS DOWN|TAKEN BY/.test(n)) Audio.sfx('fail');
    }
  }

  function foeAt(mx, my) {
    let best = -1, bd = 1e9;
    f.foes.forEach((foe, i) => {
      if (foe.dead || foe.caught || foe.lost) return;
      const s = toScreen(foe.ball.x, foe.ball.y, 0);
      const pr = ballPixelRadius(foe.ball.r, foe.ball.y);
      const d = Math.hypot(s.x - mx, s.y - my - pr * 0.4);
      if (d < pr * 1.35 && d < bd) { bd = d; best = i; }
    });
    return best;
  }

  function mineAt(mx, my) {
    let best = -1, bd = 1e9;
    f.mine.forEach((m, i) => {
      if (m.out || m.aboard) return;
      const s = toScreen(m.ball.x, m.ball.y, 0);
      const pr = ballPixelRadius(m.ball.r, m.ball.y);
      const d = Math.hypot(s.x - mx, s.y - my - pr * 0.4);
      if (d < pr * 1.4 && d < bd) { bd = d; best = i; }
    });
    return best;
  }

  /**
   * THE GHOST BALL. Walk the aim line forward in arena units until the shot's circle would
   * touch something, and report where it stopped and what it touched.
   *
   * It is a straight-line march and not a physics prediction on purpose: physics knows about
   * rails and spin and would give an answer the player cannot check by looking. A straight
   * line to first contact is exactly what a person sees when they squint down a cue.
   */
  function ghost(ball, angle) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const others = f.world.balls.filter((b) => b !== ball && !b.sunk);
    let bestD = 1e9, hit = null;
    for (const o of others) {
      const rr = ball.r + o.r;
      // distance along the ray to the closest approach, then back off to the touch point
      const dx = o.x - ball.x, dy = o.y - ball.y;
      const along = dx * ca + dy * sa;
      if (along <= 0) continue;
      const perp = Math.abs(-dx * sa + dy * ca);
      if (perp > rr) continue;
      const d = along - Math.sqrt(rr * rr - perp * perp);
      if (d < 0 || d > bestD) continue;
      bestD = d; hit = o;
    }
    // and the rails, so the ghost stops somewhere real even with a clear table
    let railD = 1e9;
    const lim = (v, dv, lo, hi) => {
      if (dv > 1e-6) return (hi - v) / dv;
      if (dv < -1e-6) return (lo - v) / dv;
      return 1e9;
    };
    railD = Math.min(lim(ball.x, ca, ball.r, AW - ball.r), lim(ball.y, sa, ball.r, AH - ball.r));
    const d = Math.min(bestD, railD);
    return {
      x: ball.x + ca * d, y: ball.y + sa * d,
      hit: bestD <= railD ? hit : null,
      dist: d,
    };
  }

  /* -------------------------------------------------------------------- input */

  function handleInput(dt) {
    const m = Input.mouse;
    hoverFoe = f.phase === 'aim' ? foeAt(m.x, m.y) : -1;
    hoverCard = -1;
    cardRects.forEach((r, i) => { if (UI.hover(r, m)) hoverCard = i; });

    if (f.phase === 'won' || f.phase === 'lost' || f.phase === 'left') {
      if ((m.released && UI.hover(doneRect, m)) || Input.pressed('Space') || Input.pressed('Enter')) {
        leave();
      }
      return;
    }

    if (Input.pressed('KeyA')) appleMode = !appleMode;
    if (Input.pressed('Escape')) appleMode = false;

    // pick with the number keys, because a keyboard is faster than a tray
    for (let i = 0; i < 9; i++) {
      if (Input.pressed(`Digit${i + 1}`)) pick(f, i);
    }
    if (Input.pressed('Tab')) {
      const list = pickable(f);
      if (list.length) {
        const ix = list.indexOf(picked(f));
        pick(f, f.mine.indexOf(list[(ix + 1) % list.length]));
      }
    }

    if (f.phase !== 'aim') { dragging = false; return; }

    // the tray picks
    if (m.released && hoverCard >= 0) { pick(f, hoverCard); Audio.sfx('click'); return; }

    // the apple
    if (m.released && UI.hover(appleRect, m)) { appleMode = !appleMode; Audio.sfx('click'); return; }
    if (appleMode) {
      if (m.released && hoverFoe >= 0) {
        const r = throwApple(f, hoverFoe);
        if (r.ok) { Audio.sfx('levelup'); Juice.flash('gold', 0.2, 0.4); appleMode = false; }
        else Audio.sfx('error');
      }
      return;
    }

    // clicking one of yours on the table picks it
    if (m.pressed) {
      const mi = mineAt(m.x, m.y);
      if (mi >= 0 && mi !== f.picked) { pick(f, mi); Audio.sfx('click'); return; }
    }

    const me = picked(f);
    if (!me) return;
    const s = toScreen(me.ball.x, me.ball.y, 0);
    const pr = ballPixelRadius(me.ball.r, me.ball.y);

    if (m.pressed && m.y < TRAY_Y - 6) { dragging = true; }
    // A FLICK COUNTS. On a fast pointer -- a touch swipe, or a test driving the real mouse --
    // the press, the move and the release can all land inside one frame, and a gesture that
    // only fires when it spans two frames is a gesture that works on a slow machine and drops
    // shots on a quick one. If a release arrives with no drag on record but its own press
    // started on the arena and moved, that is a shot.
    if (!dragging && m.released && m.downY < TRAY_Y - 6 && m.dragDist > 14) dragging = true;
    if (dragging) {
      const dx = m.x - s.x, dy = m.y - (s.y + pr * 0.4);
      const dist = Math.hypot(dx, dy);
      if (dist > 6) aim = Math.atan2((m.y - (s.y + pr * 0.4)) / VIEW.tilt * 1, (m.x - s.x) / VIEW.xs);
      power = clamp((dist - 10) / MAX_DRAG, 0.05, 1);
      if (m.released) {
        dragging = false;
        if (dist > 16) {
          shoot(f, aim, power);
          Audio.sfx('shot');
          Juice.shake(1.5 + power * 3.5, 0.16);
          parts.burst(s.x, s.y + pr * 0.6, 8, { kind: 'dust', speed: 60 + power * 90 });
        }
      }
    }
    void dt;
  }

  function leave() {
    if (outT >= 0) return;
    outT = 0;
    Audio.sfx('whoosh');
  }

  /* ------------------------------------------------------------------- update */

  function update(dt) {
    t += dt;
    intro = Math.min(1, intro + dt * 1.6);
    if (noteT > 0) noteT -= dt;
    if (bannerT > 0) bannerT -= dt;
    for (const fl of floaters) { fl.t += dt; fl.y -= dt * 26; }
    floaters = floaters.filter((fl) => fl.t < 1.1);
    for (const c of captureFx) c.k += dt * 1.6;
    captureFx = captureFx.filter((c) => c.k < 1);
    parts.update(dt);

    if (outT >= 0) {
      outT += dt;
      if (outT > 0.55 && onDone) { const cb = onDone; onDone = null; cb(result(f)); }
      return;
    }

    handleInput(dt);

    // the camera, and it is the only stateful thing in the draw path: it decays towards
    // nothing every frame and is HELD at nothing while the player is aiming
    camTick(cam, dt);
    // approach(cur, target, RATE, DT) -- four arguments. Passing dt where the rate goes left
    // dt undefined inside, so the decay was exp(-rate * undefined) = NaN: the camera's zoom
    // went to NaN on the first frame and every draw inside the transform landed nowhere. The
    // entire island rendered as an empty black frame, which is the worst possible failure for
    // a one-line mistake, so camWrap now refuses a camera that is not a finite number.
    punch = approach(punch, 0, f.phase === 'aim' ? 9 : 2.6, dt);
    if (punch < 0.004) punch = 0;
    const lean = punch * 1.7;
    cam.zoom = 1 + punch;
    cam.x = (look.x - W / 2) * lean;
    cam.y = (look.y - H / 2) * lean;

    // HIT-STOP. The single cheapest thing that makes a collision feel like one, and it has
    // to be applied to the SIMULATION rather than to the drawing or the ball keeps moving
    // behind a frozen frame and arrives somewhere else.
    if (hitStop > 0) { hitStop -= dt; return; }

    const before = new Map();
    for (const foe of f.foes) before.set(foe, foe.hp);
    const wasPhase = f.phase;
    const wasWave = f.waveIx;
    const caughtBefore = f.caught.length;

    updateFight(f, dt);

    // whatever changed, say it
    for (const foe of f.foes) {
      const b4 = before.get(foe);
      if (b4 === undefined || foe.hp >= b4) continue;
      const d = b4 - foe.hp;
      const s = toScreen(foe.ball.x, foe.ball.y, 0);
      const pr = ballPixelRadius(foe.ball.r, foe.ball.y);
      floaters.push({ x: s.x, y: s.y - pr * 0.6, txt: `${Math.round(d)}`, t: 0,
        big: d > 30, col: d > 30 ? 'gold' : 'cream' });
      hitStop = Math.max(hitStop, clamp(d / 260, 0.02, 0.1));
      Juice.shake(clamp(d / 9, 1, 7), 0.18);
      if (d > 14) {
        punch = Math.max(punch, clamp(d / 150, 0.05, 0.2));
        look = { x: s.x, y: s.y };
        camKick(cam, clamp(d / 14, 1, 6), 0.2);
      }
      Audio.sfx(d > 30 ? 'thud' : 'tick');
      parts.burst(s.x, s.y, 6 + Math.round(d / 10), { kind: 'dust', speed: 70 });
    }
    if (f.caught.length > caughtBefore) {
      Juice.flash('gold', 0.24, 0.42);
      for (const foe of f.foes) {
        if (!foe.caught || foe.fxDone) continue;
        foe.fxDone = true;
        const s = toScreen(foe.ball.x, foe.ball.y, 0);
        captureFx.push({ x: s.x, y: s.y, k: 0, name: foe.def.name });
        // THE HERO MOMENT: the game stops for an eighth of a second and the camera goes in
        // on the door it went through. A capture is the whole point of the fight and it used
        // to be a puff of dust.
        hitStop = Math.max(hitStop, 0.13);
        punch = Math.max(punch, 0.26);
        look = { x: s.x, y: s.y };
        camKick(cam, 5, 0.3);
      }
    }
    if (f.waveIx !== wasWave && f.phase !== 'won') {
      banner = f.waves[f.waveIx] && f.waves[f.waveIx].champion
        ? 'SOMETHING WITH A NAME' : `WAVE ${f.waveIx + 1} OF ${f.waves.length}`;
      bannerT = 1.9;
      Juice.shake(4, 0.4);
      Audio.sfx('blind_start');
    }
    if (wasPhase !== 'foes' && f.phase === 'foes') { banner = 'THEY COME'; bannerT = 1.1; }
    if (wasPhase !== f.phase && (f.phase === 'won' || f.phase === 'lost' || f.phase === 'left')) {
      Audio.sfx(f.phase === 'won' ? 'levelup' : 'fail');
      Juice.flash(f.phase === 'won' ? 'gold' : 'red2', 0.4, 0.4);
    }
    drainNotes();
  }

  /* --------------------------------------------------------------------- draw */

  /**
   * THE TOP BAR, and it is a row of BADGES rather than a paragraph.
   *
   * What was here was eleven pieces of five-pixel text on a flat brown strip: the island's
   * name, the wave, two lists of faces, the clay, the round and a button, all at the same
   * weight. Every value was the same size as its own label, which means at a glance the
   * player reads none of it. Now: an icon to find each thing by, a small label to name it,
   * and the number at twice the label's height.
   */
  function drawHud(g) {
    const foes = livingFoes(f);
    const wild = foes.filter((x) => !x.dazed);
    const beaten = foes.filter((x) => x.dazed);
    UI.panel(g, 0, 0, W, 52, { style: 'wood', shadow: false });
    rect(g, 0, 50, W, 2, mix(P.wood0, P.ink, 0.4));

    // the place, top left, big -- it is the one label that is a title
    text(g, `${f.island.name.toUpperCase()}`, 14, 8, 'brass3', { font: 7, scale: 2 });
    text(g, `WAVE ${Math.min(f.waveIx + 1, f.waves.length)} OF ${f.waves.length}`,
      16, 34, 'parch1', { font: 3 });

    // WHO IS LEFT, as faces on a plate. A count is a number; a row of faces is a threat.
    const facePlate = (x, label, list, tone, mark) => {
      const n = Math.min(7, list.length);
      const w = 30 + n * 24;
      UI.roundRect(g, x - 2, 6, w + 4, 42, 6, 'ink');
      UI.roundRect(g, x, 8, w, 38, 5, mix(P[tone], P.ink, 0.35));
      text(g, label, x + 6, 10, 'parch1', { font: 3 });
      list.slice(0, n).forEach((foe, i) => {
        drawAnimalIcon(g, foe.a, x + 18 + i * 24, 32, { size: 22 });
        if (mark) rect(g, x + 8 + i * 24, 42, 20, 2, 'gold');
      });
      if (list.length > n) text(g, `+${list.length - n}`, x + w - 14, 34, 'brass3', { font: 3 });
      return w;
    };
    let fx = 250;
    if (wild.length) fx += facePlate(fx, 'STILL WILD', wild, 'red0', false) + 10;
    if (beaten.length) facePlate(fx, 'BEATEN - HERD THEM', beaten, 'brass0', true);

    // the counters and the apple, top right
    const ar = UI.statBadge(g, W - 146, 7, {
      icon: 'drop', label: 'APPLES', value: f.apples, tone: appleMode ? 'red1' : 'brass1',
      valueColor: 'cream', glow: appleMode || UI.hover(UI.rectOf(W - 146, 7, 132, 38), Input.mouse)
        ? 'gold' : null,
    });
    appleRect = ar;
    UI.statBadge(g, W - 290, 7, { icon: 'gem', label: 'CLAY', value: f.clay, tone: 'wood2' });
    UI.statBadge(g, W - 400, 7, {
      icon: 'clock', label: 'ROUND', value: f.round, tone: 'wood2', valueColor: 'parch1',
    });
    if (appleMode) {
      text(g, 'PICK A BEAST', W - 140, 46, 'red2', { font: 3 });
    }

    // THE TIDE, and it is only on the bar when it is actually coming
    if (f.round >= FIGHT.tideFrom - 3) {
      const away = FIGHT.tideFrom - f.round;
      UI.banner(g, 72, away > 0 ? `THE TIDE IN ${away}` : 'THE TIDE IS IN', {
        tone: away > 0 ? 'wood1' : 'red1', color: away > 0 ? 'brass3' : 'white',
      });
    }
  }

  /**
   * THE TRAY: one card per animal, and the card is the readable unit.
   *
   * The old card was a flat cream rectangle with the name in ink, the skill in five-pixel
   * rust, a green rect for health and the health NUMBER underneath it in grey. The number the
   * player needs most was the least visible thing on it. Now the portrait sits on a sunken
   * plate, the skill is a pill, and the health is a bar with its own number ON it.
   */
  function drawTray(g) {
    UI.panel(g, 0, TRAY_Y, W, H - TRAY_Y, { style: 'wood', shadow: false });
    const dim = f.phase !== 'aim';
    const list = f.mine;
    const cw = 158, ch = 76, gap = 8;
    const total = list.length * cw + (list.length - 1) * gap;
    let x = Math.max(8, (W - total) / 2);
    cardRects = [];
    list.forEach((m, i) => {
      const r = UI.rectOf(x, TRAY_Y + 8, cw, ch);
      cardRects.push(r);
      const on = i === f.picked && !m.out && !m.aboard;
      const gone = m.out || m.aboard;
      const sk = SKILLS[m.skill];
      UI.critterCard(g, r.x, r.y, cw, ch, {
        name: m.a.name,
        skill: sk ? sk.name : '',
        hp: m.hp, maxHp: m.maxHp, index: i + 1,
        state: gone ? 'spent' : on ? 'picked' : 'ready',
        spentLabel: m.aboard ? 'ABOARD' : 'DOWN',
        draw: (cx, cy, size) => drawAnimalIcon(g, m.a, cx, cy, {
          size: Math.round(size * 0.92), alpha: gone ? 0.35 : 1,
        }),
      });
      const lift = on ? -6 : 0;
      if (m.flash > 0) wash(g, r.x, r.y + lift, r.w, r.h, 'red2', m.flash * 0.5);
      // the mark for an animal that has already been played this round
      if (m.planted > 0) UI.roundRect(g, r.x + 6, r.y + lift - 4, 10, 10, 3, 'brass3');
      x += cw + gap;
    });
    if (dim) wash(g, 0, TRAY_Y, W, H - TRAY_Y, 'ink', 0.34);

    // ONE LINE OF INSTRUCTION, centred under the cards, and it changes with what you are
    // doing. It used to be two lines pinned to opposite corners of the frame, both of them
    // five pixels tall, and the right-hand one ran under the last card.
    const me = picked(f);
    const sk = me && SKILLS[me.skill];
    const hint = f.phase !== 'aim' ? 'WATCH'
      : appleMode ? 'CLICK A BEAST TO THROW THE APPLE'
        : me ? `DRAG FROM ${me.a.name.toUpperCase()} - FAR IS HARD` : '';
    const rule = sk && f.phase === 'aim' ? `${sk.name}: ${sk.rule}` : '';
    const y = H - 13;
    text(g, hint, 14, y, appleMode ? 'red2' : 'parch1', { font: 3 });
    if (rule) {
      let line2 = rule;
      const room = W - 40 - textW(hint, { font: 3 });
      while (textW(line2, { font: 3 }) > room && line2.length > 12) {
        line2 = `${line2.slice(0, -5)}...`;
      }
      text(g, line2, W - 14, y, 'brass3', { font: 3, right: true });
    }
  }

  function drawTable(g) {
    if (bake) g.drawImage(bake, 0, 0);
    drawArenaWater(g, t);
    drawArenaGrass(g, f.island, t, 3);

    // the tide, as water creeping up the near shore
    if (f.tide > 0) {
      const y0 = toScreen(0, AH - f.tide, 0).y;
      for (let y = y0; y < GROUND.nearY + 3; y++) {
        const k = (y - y0) / Math.max(1, GROUND.nearY + 3 - y0);
        rect(g, 0, y, W, 1, mix(P.water1, P.water3, k * 0.6));
      }
      for (let x = 0; x < W; x += 3) {
        rect(g, x, y0 + Math.round(Math.sin(x * 0.05 + t * 2) * 2), 3, 2, 'foam');
      }
    }

    for (const p of f.world.posts) drawPost(g, p, f.island);
    for (const z of f.world.zones) drawZone(g, z, t);

    // the spots
    for (const s of f.spots) {
      if (s.taken) continue;
      const p = toScreen(s.x, s.y, 0);
      const bob = Math.sin(t * 3 + s.x) * 3;
      ellipse(g, p.x, p.y + 4, 9, 4, mix(P.ink, P.shadow, 0.4));
      if (s.kind === 'fruit') {
        disc(g, p.x, p.y - 6 + bob, 8, 'ink');
        disc(g, p.x, p.y - 6 + bob, 6, 'red2');
        disc(g, p.x - 2, p.y - 8 + bob, 2, 'red1');
        rect(g, p.x - 1, p.y - 15 + bob, 2, 5, 'wood1');
        rect(g, p.x + 1, p.y - 15 + bob, 5, 3, 'leaf2');
      } else if (s.kind === 'clay') {
        rect(g, p.x - 8, p.y - 12 + bob, 16, 12, 'ink');
        rect(g, p.x - 6, p.y - 10 + bob, 12, 8, 'clay2');
        rect(g, p.x - 6, p.y - 10 + bob, 12, 2, 'clay4');
      } else {
        disc(g, p.x, p.y - 7 + bob, 9, 'ink');
        disc(g, p.x, p.y - 7 + bob, 7, 'gold');
        disc(g, p.x - 2, p.y - 9 + bob, 3, 'brass3');
        for (let i = 0; i < 6; i++) {
          const a = t * 2 + (i / 6) * Math.PI * 2;
          rect(g, p.x + Math.cos(a) * 13 - 1, p.y - 7 + bob + Math.sin(a) * 8 - 1, 3, 3,
            'brass3');
        }
      }
    }

    // the doors, lit by what they will take
    const anyBeaten = livingFoes(f).some((x) => x.dazed);
    for (const gp of f.world.gates) drawGate(g, gp, t, anyBeaten ? 'open' : 'shut');

    // everything on the table, sorted by depth so the near things overlap the far ones
    const all = [];
    for (const foe of f.foes) {
      if (foe.dead || foe.caught || foe.lost) continue;
      all.push({ y: foe.ball.y, kind: 'foe', foe });
    }
    for (const m of f.mine) {
      if (m.out || m.aboard) continue;
      all.push({ y: m.ball.y, kind: 'mine', m });
    }
    for (const gb of f.ghosts || []) {
      if (gb.sunk) continue;
      all.push({ y: gb.y, kind: 'ghost', gb });
    }
    all.sort((a, b) => a.y - b.y);

    const me = picked(f);
    // SPEED LINES behind anything travelling, drawn before the balls so they trail rather
    // than cover. A ball rolling across a table at four hundred pixels a second with nothing
    // behind it reads as a slow ball; this is the cheapest possible motion cue and it is the
    // difference between a physics demo and a fight.
    for (const it of all) {
      const b = it.kind === 'foe' ? it.foe.ball : it.kind === 'mine' ? it.m.ball : null;
      if (!b) continue;
      const sp = Math.hypot(b.vx || 0, b.vy || 0);
      // only while it is genuinely travelling, or every ball drifting into place wears a pair
      // of antennae -- which is exactly what three-pixel lines above a ball look like
      if (sp < 70) continue;
      const sc = toScreen(b.x, b.y, 0);
      const pr = ballPixelRadius(b.r, b.y);
      const dx = -(b.vx || 0) / sp, dy = -((b.vy || 0) * VIEW.tilt) / sp;
      speedLines(g, sc.x + dx * pr * 0.9, sc.y - pr + dy * pr * 0.9, 3,
        clamp(sp * 0.3, 12, 40), Math.atan2(dy, dx), mix(P.foam, P.water3, 0.55),
        Math.round(pr * 1.1));
    }
    for (const it of all) {
      if (it.kind === 'foe') {
        const foe = it.foe;
        drawBall(g, foe.ball, foe.a, {
          t, material: 'corrupt', mood: foe.dazed ? 'blink' : 'angry',
        });
        const s = toScreen(foe.ball.x, foe.ball.y, 0);
        const pr = ballPixelRadius(foe.ball.r, foe.ball.y);
        // health, over the head, and only while it is worth reading
        if (foe.hp < foe.maxHp) {
          const bw = Math.round(pr * 1.7);
          rect(g, s.x - bw / 2, s.y - pr * 2 - 8, bw, 6, 'ink');
          rect(g, s.x - bw / 2 + 1, s.y - pr * 2 - 7, (bw - 2) * clamp(foe.hp / foe.maxHp, 0, 1),
            4, foe.dazed ? 'gold' : 'red2');
        }
        if (foe.dazed) {
          const pulse = 0.5 + 0.5 * Math.sin(t * 5 + foe.ball.x);
          for (let i = 0; i < 5; i++) {
            const a = t * 1.2 + (i / 5) * Math.PI * 2;
            rect(g, s.x + Math.cos(a) * pr * 1.3 - 2, s.y + Math.sin(a) * pr * 0.5 - 2, 4, 4,
              pulse > 0.5 ? 'gold' : 'brass3');
          }
        }
        if (foe.boss) {
          text(g, foe.def.name, s.x, s.y - pr * 2 - 24, 'red2',
            { font: 3, center: true });
        }
        if (foe.flash > 0) {
          wash(g, s.x - pr, s.y - pr * 2, pr * 2, pr * 2, 'white', foe.flash * 0.6);
        }
        if (hoverFoe === f.foes.indexOf(foe)) {
          ellipseFrame(g, s.x, s.y + pr * 0.9, pr * 1.15, pr * 0.4,
            appleMode ? 'gold' : 'cream');
        }
      } else if (it.kind === 'mine') {
        const m = it.m;
        const on = m === me;
        drawBall(g, m.ball, m.a, { t, mood: m.hp < m.maxHp * 0.35 ? 'scared' : 'idle' });
        const s = toScreen(m.ball.x, m.ball.y, 0);
        const pr = ballPixelRadius(m.ball.r, m.ball.y);
        if (m.hp < m.maxHp) {
          const bw = Math.round(pr * 1.5);
          rect(g, s.x - bw / 2, s.y - pr * 2 - 7, bw, 5, 'ink');
          rect(g, s.x - bw / 2 + 1, s.y - pr * 2 - 6, (bw - 2) * clamp(m.hp / m.maxHp, 0, 1),
            3, 'leaf2');
        }
        if (m.planted > 0) {
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            rect(g, s.x + Math.cos(a) * pr * 1.2 - 2, s.y + pr * 0.6 + Math.sin(a) * pr * 0.4 - 2,
              4, 4, 'brass2');
          }
        }
        if (on && f.phase === 'aim') {
          const pulse = 0.5 + 0.5 * Math.sin(t * 5);
          ellipseFrame(g, s.x, s.y + pr * 0.95, pr * (1.12 + pulse * 0.08), pr * 0.42, 'gold');
        }
        if (m.flash > 0) {
          wash(g, s.x - pr, s.y - pr * 2, pr * 2, pr * 2, 'red2', m.flash * 0.55);
        }
      } else {
        drawBall(g, it.gb, f.mine[f.picked] ? f.mine[f.picked].a : f.mine[0].a,
          { t, alpha: 0.55 });
      }
    }

    // the aim, on top of the table but under the chrome
    if (f.phase === 'aim' && me && dragging) {
      const gh = ghost(me.ball, aim);
      drawAim(g, me.ball, aim, power * 1.6, t);
      drawCharge(g, me.ball, power * 1.6, t);
      // the ghost ball: where yours will be when it touches
      const gp = toScreen(gh.x, gh.y, 0);
      const gr = ballPixelRadius(me.ball.r, gh.y);
      ellipseFrame(g, gp.x, gp.y + gr * 0.9, gr, gr * 0.36, 'cream');
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        rect(g, gp.x + Math.cos(a) * gr - 1, gp.y + Math.sin(a) * gr - 1, 2, 2,
          i % 2 ? 'white' : 'cream');
      }
      // and which way the thing it touches will go
      if (gh.hit) {
        const hs = toScreen(gh.hit.x, gh.hit.y, 0);
        const out = Math.atan2(gh.hit.y - gh.y, gh.hit.x - gh.x);
        for (let i = 1; i <= 4; i++) {
          const p = toScreen(gh.hit.x + Math.cos(out) * i * 5, gh.hit.y + Math.sin(out) * i * 5, 0);
          rect(g, p.x - 2, p.y - 2, 4, 4, i > 2 ? 'brass2' : 'gold');
        }
        void hs;
      }
    }
    if (f.phase === 'aim' && me && !dragging) {
      const s = toScreen(me.ball.x, me.ball.y, 0);
      const pr = ballPixelRadius(me.ball.r, me.ball.y);
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      ellipseFrame(g, s.x, s.y + pr * 0.95, pr * (1.2 + pulse * 0.12), pr * 0.46, 'brass3');
    }
  }

  function drawBursts(g) {
    for (const b of f.bursts || []) {
      const p = toScreen(b.x, b.y, 0);
      const k = clamp(b.k, 0, 1);
      const r = 20 + k * 70;
      ellipseFrame(g, p.x, p.y, r, r * 0.4, k < 0.5 ? 'gold' : 'brass2');
      ellipseFrame(g, p.x, p.y, r * 0.7, r * 0.28, 'white');
    }
    // A CAPTURE IS THE POINT OF THE FIGHT, so it gets a shock ring, a ring of sparks, dust
    // off the door and a stamp with the animal's name on it -- not a puff and a word.
    for (const c of captureFx) {
      const k = clamp(c.k, 0, 1);
      const y = c.y - k * 40;
      if (k < 0.55) shockRing(g, c.x, c.y, k / 0.55, 'gold');
      cineDust(g, c.x, c.y + 6, k, 'brass3');
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + k * 2;
        const rr = 12 + k * 56;
        rect(g, c.x + Math.cos(a) * rr - 2, y + Math.sin(a) * rr * 0.45 - 2,
          i % 3 ? 5 : 7, i % 3 ? 5 : 7, i % 2 ? 'gold' : 'white');
      }
      const nm = (c.name || '').toUpperCase();
      const prevA = g.globalAlpha;
      g.globalAlpha = clamp(1 - (k - 0.4) / 0.6, 0, 1);
      const bw = Math.max(96, textW(nm, { font: 7 }) + 28);
      UI.roundRect(g, c.x - bw / 2, y - 44, bw, 38, 6, 'ink');
      UI.roundRect(g, c.x - bw / 2 + 2, y - 42, bw - 4, 34, 5, 'brass1');
      text(g, 'CAUGHT', c.x, y - 39, 'brass3', { font: 3, center: true });
      text(g, nm, c.x, y - 30, 'white', { font: 7, center: true, shadow: 'ink' });
      g.globalAlpha = prevA;
    }
    for (const fl of floaters) {
      const k = fl.t / 1.1;
      text(g, fl.txt, fl.x, fl.y - k * 12, fl.col,
        { font: fl.big ? 7 : 5, center: true, alpha: 1 - k });
    }
  }

  /**
   * The banner. A SLIM PLATE, LOW, AND IT LEAVES.
   *
   * The first cut was a forty-six pixel bar of solid timber across the middle of the frame at
   * full opacity for two seconds -- which is exactly where the beasts arrive, so the one
   * moment the banner exists to announce was the one moment you could not see. It sits under
   * the arena's far shore now, it is thin, it fades, and it slides out of its own accord.
   */
  function drawBanner(g) {
    if (bannerT <= 0 || !banner) return;
    // the same in-and-out envelope as before -- a banner that pops in reads as a bug -- on
    // the shared rounded banner, so the arena's callouts match the map's and the shop's
    const k = 1 - bannerT / 1.9;
    const inK = Ease.outCubic(clamp(k * 4, 0, 1));
    const outK = Ease.inCubic(clamp((k - 0.62) / 0.38, 0, 1));
    const a = clamp(inK - outK, 0, 1);
    if (a <= 0.01) return;
    const prev = g.globalAlpha;
    g.globalAlpha = a;
    UI.banner(g, GROUND.nearY - 62 - Math.round(inK * 6), banner,
      { tone: 'wood0', color: 'gold', scale: 2 });
    g.globalAlpha = prev;
  }



  function drawOver(g) {
    if (f.phase !== 'won' && f.phase !== 'lost' && f.phase !== 'left') return;
    wash(g, 0, 0, W, H, 'ink', 0.62);
    const pw = 560, ph = 250;
    const px0 = (W - pw) / 2, py0 = 120;
    UI.panel(g, px0, py0, pw, ph, { style: 'wood', shadow: true });
    const title = f.phase === 'won' ? 'THE SHORE IS CLEAR'
      : f.phase === 'left' ? 'YOU PULLED BACK' : 'THEY TOOK THE SHORE';
    text(g, title, W / 2, py0 + 18, f.phase === 'won' ? 'gold' : 'red2',
      { font: 7, center: true, scale: 2 });
    const res = result(f);
    const lines = [
      `${res.caught.length} ABOARD`,
      `${res.fallen.length} LOST TO THE HITTING`,
      `${res.clay} CLAY  ·  ${res.apples} APPLES LEFT`,
      `${res.rounds} ROUNDS  ·  ${res.shots} SHOTS`,
    ];
    lines.forEach((l, i) => {
      text(g, l, W / 2, py0 + 66 + i * 26, i === 0 ? 'brass3' : 'parch1',
        { font: 5, center: true });
    });
    // who came aboard, as faces
    const got = f.foes.filter((x) => x.caught);
    got.slice(0, 8).forEach((foe, i) => {
      drawAnimalIcon(g, foe.a, px0 + 60 + i * 44, py0 + 190, { size: 36 });
    });
    doneRect = UI.rectOf(W / 2 - 90, py0 + ph - 46, 180, 40);
    UI.button(g, doneRect, 'SET SAIL', {
      hot: UI.hover(doneRect, Input.mouse), color: 'brass', font: 7,
    });
  }

  function draw(g) {
    rect(g, 0, 0, W, H, 'ink');
    // THE WORLD IS PHOTOGRAPHED; THE INTERFACE IS NOT. Everything on the island goes through
    // the combat camera -- whole pixels and whole eighths of zoom, so a push-in stays as crisp
    // as a still -- and the bar, the tray and the banners are drawn flat over the top of it,
    // because a HUD that zooms with the action is a HUD nobody can hit.
    camWrap(g, cam, () => {
      drawTable(g);
      drawArenaFoliage(g, f.island, t, 3);
      parts.draw(g);
      drawBursts(g);
    });
    drawHud(g);
    drawTray(g);
    drawBanner(g);
    if (noteT > 0 && lastNote) {
      const wpx = textW(lastNote, { font: 5 }) + 24;
      const a = clamp(noteT / 0.5, 0, 1);
      rect(g, W / 2 - wpx / 2, TRAY_Y - 34, wpx, 24, 'ink');
      rect(g, W / 2 - wpx / 2, TRAY_Y - 34, wpx, 2, 'gold');
      text(g, lastNote, W / 2, TRAY_Y - 28, 'cream', { font: 5, center: true, alpha: a });
    }
    drawOver(g);
    if (intro < 1) wash(g, 0, 0, W, H, 'ink', (1 - Ease.outCubic(intro)) * 0.95);
    if (outT >= 0) wash(g, 0, 0, W, H, 'ink', Ease.inQuad(clamp(outT / 0.55, 0, 1)));
  }

  /* -------------------------------------------------------------------- scene */

  return {
    enter(args) {
      f = createFight({
        voyage: args.voyage || args.run || null,
        island: args.island,
        kind: args.kind || 'fight',
        seed: args.seed || (args.voyage && args.voyage.seed) || 'arena',
      });
      onDone = args.onDone;
      bake = bakeArena(f.island, 3);
      parts = createParticles({ limit: 300, seed: 'arena' });
      t = 0; intro = 0; outT = -1;
      dragging = false; power = 0; aim = -Math.PI / 2;
      floaters = []; captureFx = []; shownNotes = 0;
      banner = f.waves.length ? `WAVE 1 OF ${f.waves.length}` : null;
      bannerT = 1.9;
      Audio.music('island');
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,
    debug() {
      return {
        arena: true,
        get phase() { return f.phase; },
        get round() { return f.round; },
        get wave() { return f.waveIx; },
        get clay() { return f.clay; },
        get apples() { return f.apples; },
        get caught() { return f.caught.length; },
        mine: () => f.mine.map((m, i) => {
          const s = toScreen(m.ball.x, m.ball.y, 0);
          return { i, id: m.animalId, hp: m.hp, out: m.out, aboard: m.aboard,
            skill: m.skill, x: Math.round(s.x), y: Math.round(s.y) };
        }),
        foes: () => f.foes.filter((x) => !x.dead && !x.caught && !x.lost).map((x) => {
          const s = toScreen(x.ball.x, x.ball.y, 0);
          return { id: x.def.id, hp: x.hp, dazed: x.dazed,
            x: Math.round(s.x), y: Math.round(s.y) };
        }),
        get rects() { return { apple: appleRect, done: doneRect, cards: cardRects }; },
        pick: (i) => pick(f, i),
        fire: (angle, p) => shoot(f, angle, p),
        aimAt: (sx, sy) => {
          const m = picked(f);
          if (!m) return false;
          const a = toArena(sx, sy);
          return shoot(f, Math.atan2(a.y - m.ball.y, a.x - m.ball.x), 0.9);
        },
        // the i-th LIVING beast, not the i-th slot: f.foes keeps its dead, so index 0 is
        // usually a corpse by round two and a harness that asks for it gets a refusal
        apple: (i) => {
          const live = f.foes.filter((x) => !x.dead && !x.caught && !x.lost);
          const foe = live[i || 0];
          return foe ? throwApple(f, f.foes.indexOf(foe)) : { ok: false, why: 'none there' };
        },
        leave,
        result: () => result(f),
      };
    },
  };
}

void wrap; void tri; void line; void lerp; void makeCanvas; void approach;
void drawAnimalShadow; void drawAnimal; void drawFolk; void GROUND;

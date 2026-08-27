// THE CELLAR. Where you were made, and where he died.
//
// This is the one scene in the game that is only ever played once, and it is the reason
// the rest of the game means anything: an old man in a flooded cellar builds a thing out of
// river clay, and then a corrupted lion comes down the stairs after him.
//
// IT IS INTERACTIVE ON PURPOSE, and only just. A cutscene of somebody building a golem is
// a cutscene; five clicks to pack the clay, three to set the ribs and three to cut the word
// is the difference between watching your own construction and DOING it. The same applies
// at the other end: the apple is not thrown for you. You take it, and you throw it, and
// that is the first time the game's only verb is used -- on the animal that just killed the
// only other person in the world.
//
// PHASES, in order, and each one only ends when the thing it is about has happened:
//
//   intro   he bars the hatch. The water is already under the door.
//   build   PACK THE CLAY, SET THE RIBS, CUT THE WORD -- eleven clicks in all
//   wake    it stands up
//   lion    the hatch breaks; he puts himself between it and you; it puts him down
//   apple   TAKE THE APPLE / THROW IT -- the two clicks the whole game is made of
//   tame    the corruption comes off it, and what is underneath is yours
//   last    his last words, on the bar, with no box in front of them
//   still   he stops. The death itself is the PASSING reel, which follows: three close-ups
//           do more with it than a wide shot of the room can, and the room has had its
//           turn.
//
// NOBODY GETS A DIALOGUE BOX. Every word in here is a caption on the letterbox bar, in the
// same voice as the film reels either side of it, because a timber board with a portrait in
// it would put a piece of furniture between the player and the only death in the story.

import {
  W, H, rect, text, textW, wash, disc, ellipse, tri, clamp, lerp, makeCanvas,
} from '../core/pixel.js';
import { P, mix } from '../core/palette.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { createParticles } from '../core/particles.js';
import { drawFolk } from '../render/folk.js';
import { drawAnimal, drawAnimalShadow } from '../render/sprites.js';
import { ANIMAL_BY_ID } from '../data/animals.js';

const BAR = 38;                     // the same letterbox the film reels use
const FLOOR = 452;                  // where everything stands
const PILE_X = 560;                 // where the clay is, and where you are built
const NOAH_X = 330;
const APPLE_X = 836, APPLE_Y = 232; // on the shelf, over the bench
const LANT_X = 214, LANT_Y = 150;

/* --------------------------------------------------------------- the build steps

Eleven clicks, in three groups. Each target is a point on the golem-to-be and a shape that
appears when it is hit, so the thing assembles in the order a person would actually build
it: the mass first, then the frame inside it, then the word that makes it get up.
*/
const STEPS = [
  {
    id: 'clay',
    label: 'PACK THE CLAY',
    hint: 'CLICK THE FIVE MARKS',
    spots: [
      { x: PILE_X, y: FLOOR - 26, r: 30 },
      { x: PILE_X - 30, y: FLOOR - 62, r: 26 },
      { x: PILE_X + 30, y: FLOOR - 62, r: 26 },
      { x: PILE_X, y: FLOOR - 96, r: 26 },
      { x: PILE_X, y: FLOOR - 128, r: 24 },
    ],
  },
  {
    id: 'ribs',
    label: 'SET THE RIBS',
    hint: 'THREE OF THEM, BOTTOM TO TOP',
    spots: [
      { x: PILE_X, y: FLOOR - 48, r: 30 },
      { x: PILE_X, y: FLOOR - 84, r: 30 },
      { x: PILE_X, y: FLOOR - 116, r: 30 },
    ],
  },
  {
    id: 'word',
    label: 'CUT THE WORD',
    hint: 'THREE STROKES ACROSS THE BROW',
    spots: [
      { x: PILE_X - 18, y: FLOOR - 150, r: 22 },
      { x: PILE_X, y: FLOOR - 150, r: 22 },
      { x: PILE_X + 18, y: FLOOR - 150, r: 22 },
    ],
  },
];

/* ------------------------------------------------------------------ the words */

// Captions. One line at a time, on the bar, advanced by a click -- the film's grammar,
// not a dialogue box's.
const LINES = {
  intro: [
    'THE WATER WAS ALREADY UNDER THE DOOR',
    'HE HAD BUILT THE BOAT. HE COULD NOT CARRY A BEAR.',
    'SO HE WENT DOWN AND GOT SOMETHING THAT COULD',
  ],
  // one per build step, so the top bar is never empty while you are working
  clay: ['HE PACKED THE RIVERBANK ONTO THE FLOOR OF HIS OWN CELLAR'],
  ribs: ['AND SPLIT WOOD INTO IT, SO IT WOULD HOLD ITS OWN WEIGHT'],
  word: ['AND CUT ONE WORD ACROSS THE BROW. THAT IS THE WHOLE SECRET.'],
  wake: [
    'A HUNDREDWEIGHT OF RIVERBANK, AND A WORD IN IT',
    '"YOU ARE NOT ALIVE. YOU ARE WILLING. IT IS ENOUGH."',
  ],
  lion: [
    'AND THEN THE DOOR CAME IN',
    'IT HAD BEEN A LION THIS MORNING',
    'HE PUT HIMSELF BETWEEN IT AND YOU',
  ],
  apple: [
    '"THE APPLE — ON THE SHELF — TAKE IT"',
  ],
  tame: [
    'THE FLOOD CAME OFF IT LIKE SILT OFF A STONE',
    'AND WHAT WAS UNDERNEATH LAY DOWN AT YOUR FEET',
  ],
  last: [
    '"THERE. THAT IS THE WHOLE JOB."',
    '"KNOCK IT DOWN. GIVE IT AN APPLE. PUT IT ON THE BOAT."',
    '"THE PENS ARE NOT BIG ENOUGH. THEY WERE NEVER GOING TO BE."',
    '"SAVE THE ONES YOU CAN REACH. DO NOT ARGUE WITH ME."',
    '"IT IS A GOOD BOAT. SHE IS CALLED WHATEVER YOU LIKE."',
  ],
  still: [
    'HE STOPPED',
    'AND DID NOT SAY ANYTHING ELSE',
  ],
};

export function makeBasementScene() {
  let onDone = null;
  let v = null;
  let t = 0;
  let phase = 'intro';
  let pt = 0;                 // time in phase
  let ix = 0;                 // which caption
  let stepIx = 0;             // which build step
  let hit = [];               // hit flags for the current step's spots
  let built = { clay: 0, ribs: 0, word: 0 };
  let parts = null;
  let roomCv = null;
  let flash = 0;
  let holding = false;        // the apple is in your hand
  let thrown = -1;            // >=0 once the apple is in the air
  let lionHp = 2;             // two exchanges with Noah, then he is down
  let lionX = 700, lionTarget = 700;
  let noahDown = false;
  let tamed = false;
  let soulK = 0;
  let waterK = 0;
  let outT = -1;

  /* ------------------------------------------------------------------ the room */

  function bakeRoom() {
    if (!roomCv) roomCv = makeCanvas(W, H);
    if (!roomCv) return;
    const g = roomCv.g;
    g.clearRect(0, 0, W, H);
    rect(g, 0, 0, W, H, 'ink');

    // stone courses, lit from the lantern side
    for (let y = BAR; y < FLOOR; y += 36) {
      for (let x = -40; x < W; x += 84) {
        const bx = x + ((y / 36) % 2) * 42;
        const lit = clamp(1 - Math.abs(bx - LANT_X) / 900, 0, 1);
        rect(g, bx, y, 78, 30, mix(P.stone0, P.ink, 0.62 - lit * 0.22));
        rect(g, bx, y, 78, 4, mix(P.stone1, P.ink, 0.55 - lit * 0.2));
      }
    }
    // the floor: flags, and a drain
    rect(g, 0, FLOOR, W, H - FLOOR, mix(P.stone1, P.ink, 0.45));
    rect(g, 0, FLOOR, W, 6, 'ink');
    for (let x = -20; x < W; x += 96) {
      rect(g, x, FLOOR + 6, 4, H - FLOOR, mix(P.stone0, P.ink, 0.6));
    }
    for (let y = FLOOR + 40; y < H; y += 44) rect(g, 0, y, W, 4, mix(P.stone0, P.ink, 0.6));

    // THE STAIRS AND THE HATCH, top left. This is where the lion comes from, so it has to
    // be established in the first frame of the scene.
    rect(g, 40, BAR, 210, 12, 'ink');
    for (let i = 0; i < 6; i++) {
      const sx = 44 + i * 30, sy = BAR + 12 + i * 40;
      rect(g, sx - 4, sy - 4, 130, 40, 'ink');
      rect(g, sx, sy, 122, 32, 'wood1');
      rect(g, sx, sy, 122, 6, 'wood2');
    }
    // the hatch itself, shut, with light around its edge
    rect(g, 60, BAR, 200, 14, 'wood0');
    rect(g, 60, BAR, 200, 4, 'brass1');

    // THE BENCH, right. Tools, a jar or two, and the shelf the apple is on.
    rect(g, 660, 300, 280, 20, 'ink');
    rect(g, 664, 304, 272, 12, 'wood2');
    rect(g, 676, 316, 20, FLOOR - 316, 'ink');
    rect(g, 680, 316, 12, FLOOR - 316, 'wood1');
    rect(g, 900, 316, 20, FLOOR - 316, 'ink');
    rect(g, 904, 316, 12, FLOOR - 316, 'wood1');
    // the shelf over it
    rect(g, 700, APPLE_Y + 26, 250, 16, 'ink');
    rect(g, 704, APPLE_Y + 30, 242, 8, 'wood2');
    // jars on the shelf
    for (let i = 0; i < 3; i++) {
      const jx = 712 + i * 40;
      rect(g, jx - 4, APPLE_Y - 22, 32, 52, 'ink');
      rect(g, jx, APPLE_Y - 18, 24, 44, i === 1 ? 'moss' : 'teal');
      rect(g, jx, APPLE_Y - 18, 24, 6, 'ice');
    }
    // tools hanging over the bench
    for (let i = 0; i < 4; i++) {
      const hx = 690 + i * 56;
      rect(g, hx, 320, 8, 44 + (i % 2) * 20, 'ink');
      rect(g, hx + 2, 322, 4, 40 + (i % 2) * 20, 'wood2');
      rect(g, hx - 8, 320 + 44 + (i % 2) * 20, 24, 12, 'ink');
      rect(g, hx - 6, 322 + 44 + (i % 2) * 20, 20, 8, i % 2 ? 'stone3' : 'brass1');
    }
    // barrels and a sack, left of the pile
    rect(g, 400, FLOOR - 90, 84, 90, 'ink');
    rect(g, 404, FLOOR - 86, 76, 82, 'wood1');
    rect(g, 404, FLOOR - 86, 76, 8, 'wood2');
    rect(g, 404, FLOOR - 56, 76, 8, 'brass0');
    rect(g, 404, FLOOR - 26, 76, 8, 'brass0');
    // the sack lives over by the stairs: at 250 it was exactly where he falls, and his
    // body and a sack of grain in the same eighty pixels is one pale heap
    rect(g, 110, FLOOR - 52, 96, 52, 'ink');
    ellipse(g, 158, FLOOR - 26, 44, 26, 'parch0');
    ellipse(g, 158, FLOOR - 34, 34, 18, 'parch1');
  }

  /* --------------------------------------------------------------- the golem parts

  Drawn as inked lumps in the order they are packed on, so the thing on the floor is
  visibly UNFINISHED until the word goes in and it becomes a sprite.
  */
  function drawBuild(g) {
    const lump = (x, y, w, hh, fill, lit) => {
      rect(g, x - w / 2 - 4, y - hh - 4, w + 8, hh + 8, 'ink');
      rect(g, x - w / 2, y - hh, w, hh, fill);
      if (lit) rect(g, x - w / 2, y - hh, w, 6, lit);
    };
    // the wet heap you start from is always there
    ellipse(g, PILE_X, FLOOR - 4, 96, 26, 'ink');
    ellipse(g, PILE_X, FLOOR - 8, 88, 22, 'clay1');
    ellipse(g, PILE_X - 20, FLOOR - 14, 40, 12, 'clay2');

    if (built.clay > 0) lump(PILE_X, FLOOR - 4, 108, 44, 'clay1', 'clay2');       // hips
    if (built.clay > 1) lump(PILE_X - 34, FLOOR - 40, 44, 46, 'clay1', 'clay2');  // arm
    if (built.clay > 2) lump(PILE_X + 34, FLOOR - 40, 44, 46, 'clay1', 'clay2');  // arm
    if (built.clay > 3) lump(PILE_X, FLOOR - 44, 110, 56, 'clay2', 'clay3');      // chest
    if (built.clay > 4) lump(PILE_X, FLOOR - 100, 76, 48, 'clay2', 'clay3');      // head

    // THE RIBS: a frame of split wood, packed into the clay. Drawn OVER the mass, because
    // that is how it looks while it is being built -- you can still see the frame.
    for (let i = 0; i < built.ribs; i++) {
      const ry = FLOOR - 40 - i * 34;
      rect(g, PILE_X - 62, ry - 6, 124, 14, 'ink');
      rect(g, PILE_X - 58, ry - 2, 116, 6, 'wood2');
      rect(g, PILE_X - 12, ry - 20, 24, 30, 'ink');
      rect(g, PILE_X - 8, ry - 16, 16, 24, 'wood1');
    }

    // THE WORD, cut into the brow: three strokes of gold light
    if (built.clay > 4) {
      for (let i = 0; i < built.word; i++) {
        const wx = PILE_X - 20 + i * 20;
        rect(g, wx - 6, FLOOR - 118, 12, 6, 'brass1');
        rect(g, wx - 4, FLOOR - 116, 8, 2, 'gold');
        if (built.word > i) {
          rect(g, wx - 4, FLOOR - 130, 8, 16, i % 2 ? 'gold' : 'brass2');
        }
      }
    }
  }

  /** The lion, corrupted or blessed, wherever it is standing. */
  function drawLion(g) {
    const a = ANIMAL_BY_ID.lion;
    if (!a) return;
    const lx = lionX;
    const ly = FLOOR - 6;
    // SCALE 2, which is four screen pixels a sprite pixel -- the same grid the room is
    // drawn on. A lion at island scale is eighty pixels tall and reads as a house cat in a
    // cellar this size; this one is a head taller than the golem, which is the point.
    const SC = 2;
    drawAnimalShadow(g, lx, ly, SC * 1.2);
    if (tamed) {
      drawAnimal(g, a, lx, ly, {
        scale: SC, flip: true, t, blessed: true, material: 'clay', mood: 'happy',
      });
      // A MAGIC BEAST: a mane of light, and it is the only bright thing in the cellar.
      for (let i = 0; i < 18; i++) {
        const ang = (i / 18) * Math.PI * 2 + t * 0.7;
        const rr = 92 + Math.sin(t * 3 + i) * 10;
        rect(g, lx + Math.cos(ang) * rr - 4, ly - 90 + Math.sin(ang) * rr * 0.7 - 4, 8, 8,
          i % 3 ? 'gold' : 'brass3');
      }
      for (let i = 0; i < 8; i++) {
        const k = ((t * 0.5 + i / 8) % 1);
        rect(g, lx - 60 + i * 18, ly - 150 - k * 90, 8, 8, k > 0.6 ? 'cream' : 'gold');
      }
    } else {
      // A BRUISE OF LIGHT BEHIND IT. The corrupt material is nearly black and the cellar
      // wall is nearly black, so without this the biggest thing in the shot is a hole.
      wash(g, lx - 120, ly - 210, 240, 220, 'purple0', 0.3);
      wash(g, lx - 80, ly - 150, 160, 150, 'red0', 0.2);
      drawAnimal(g, a, lx, ly, {
        scale: SC, flip: true, t, material: 'corrupt', mood: 'angry',
        walk: (t * 2) % 1,
      });
      for (let i = 0; i < 5; i++) {
        const k = ((t * 0.9 + i * 0.2) % 1);
        rect(g, lx - 40 + i * 22, ly - 130 - k * 50, 8, 8, i % 2 ? 'purple0' : 'night');
      }
    }
  }

  /* ------------------------------------------------------------------- phases */

  function say(list) { return LINES[list] || []; }

  function toPhase(p) {
    phase = p;
    pt = 0;
    ix = 0;
    if (p === 'lion') { Audio.sfx('boss_sting'); Juice.shake(7, 0.6); lionX = 120; lionTarget = 620; }
    if (p === 'wake') { Audio.sfx('levelup'); Juice.flash('gold', 0.4, 0.5); flash = 0.5; }
    if (p === 'tame') { Audio.sfx('fanfare'); Juice.flash('white', 0.3, 0.7); flash = 0.9; }
    if (p === 'still') { Audio.sfx('sparkle'); Audio.stopMusic(1.2); }
    if (p === 'done') {
      outT = 0;
      Audio.sfx('whoosh');
    }
  }

  /** One click, wherever we are. Every phase answers it differently. */
  function click(mx, my) {
    if (outT >= 0) return;
    if (phase === 'build') {
      const step = STEPS[stepIx];
      for (let i = 0; i < step.spots.length; i++) {
        if (hit[i]) continue;
        const s = step.spots[i];
        if (Math.hypot(s.x - mx, s.y - my) > s.r + 18) continue;
        hit[i] = true;
        built[step.id] = hit.filter(Boolean).length;
        Audio.sfx(step.id === 'word' ? 'sparkle' : 'crate_land', { vol: 0.7 });
        Juice.shake(step.id === 'word' ? 1 : 2, 0.2);
        parts.emit('dust', s.x, s.y, { count: 8, speed: 60, color: 'clay3' });
        if (hit.every(Boolean)) {
          if (stepIx >= STEPS.length - 1) { toPhase('wake'); return; }
          stepIx++;
          hit = new Array(STEPS[stepIx].spots.length).fill(false);
          Audio.sfx('crate_open');
        }
        return;
      }
      return;
    }
    if (phase === 'apple') {
      if (!holding) {
        if (Math.hypot(APPLE_X - mx, APPLE_Y - my) < 60) {
          holding = true;
          Audio.sfx('coin');
          parts.emit('spark', APPLE_X, APPLE_Y, { count: 10, color: 'gold' });
        } else Audio.sfx('error');
        return;
      }
      // thrown at the lion: anywhere near it counts, because this is not a test of aim.
      // ONCE, THOUGH: a second click while it is in the air reset the throw and the apple
      // hung in mid-flight for as long as anybody kept clicking.
      if (thrown >= 0) return;
      if (Math.abs(lionX - mx) < 150 && my > 200) {
        thrown = 0;
        Audio.sfx('whoosh');
      } else Audio.sfx('error');
      return;
    }
    // every other phase is a caption: a click takes the next line
    const list = say(phase);
    if (ix < list.length - 1) { ix++; Audio.sfx('click', { vol: 0.4 }); return; }
    if (phase === 'intro') { toPhase('build'); return; }
    if (phase === 'wake') { toPhase('lion'); return; }
    if (phase === 'lion') { return; }        // the lion phase ends on its own clock
    if (phase === 'tame') { toPhase('last'); return; }
    if (phase === 'last') { toPhase('still'); return; }
    if (phase === 'still') { toPhase('done'); return; }
  }

  function update(dt) {
    t += dt;
    pt += dt;
    if (flash > 0) flash -= dt * 1.6;
    parts.update(dt);
    waterK = approach(waterK, phase === 'intro' ? 0.2 : phase === 'still' ? 1 : 0.55, 0.15, dt);

    if (outT >= 0) {
      outT += dt;
      if (outT > 0.5 && onDone) { const f = onDone; onDone = null; f(); }
      return;
    }

    // the lion beat runs on its own clock: it comes down the stairs, and it goes through him
    if (phase === 'lion') {
      lionX = approach(lionX, lionTarget, 2.2, dt);
      if (pt > 1.4 && ix < 1) ix = 1;
      if (pt > 2.8 && ix < 2) ix = 2;
      if (pt > 3.2 && lionHp === 2) {
        lionHp = 1;
        lionTarget = 520;
        Juice.shake(6, 0.4);
        Audio.sfx('crate_land');
        parts.emit('dust', 470, FLOOR - 40, { count: 14, speed: 90, color: 'stone2' });
      }
      if (pt > 5.0 && !noahDown) {
        noahDown = true;
        lionTarget = 470;
        Juice.shake(9, 0.7);
        Juice.flash('red2', 0.2, 0.4);
        Audio.sfx('boss_sting');
        parts.emit('dust', NOAH_X + 40, FLOOR - 30, { count: 18, speed: 110, color: 'parch0' });
      }
      if (pt > 6.4) toPhase('apple');
    }

    // the apple in the air, and what it does when it lands
    if (thrown >= 0 && !tamed) {
      thrown += dt;
      if (thrown > 0.55) {
        tamed = true;
        toPhase('tame');
        parts.emit('star', lionX, FLOOR - 50, { count: 26, speed: 120, color: 'gold', life: 1.2 });
      }
    }

    if (phase === 'tame' && pt > 1.2 && ix < 1) ix = 1;
    if (phase === 'still') soulK = approach(soulK, 1, 1.2, dt);
    if (phase === 'still' && pt > 2.4 && ix < 1) ix = 1;

    const m = Input.mouse;
    if (m.pressed) click(m.x, m.y);
    else if (Input.pressed('Space') || Input.pressed('Enter')) {
      // the keyboard advances captions, and in the interactive phases it takes the next
      // thing that needs doing -- so the whole scene is playable without a mouse
      if (phase === 'build') {
        const step = STEPS[stepIx];
        const i = hit.indexOf(false);
        if (i >= 0) click(step.spots[i].x, step.spots[i].y);
      } else if (phase === 'apple') {
        if (!holding) click(APPLE_X, APPLE_Y);
        else click(lionX, FLOOR - 60);
      } else click(-1, -1);
    }
    if (Input.pressed('Escape') && phase !== 'done') {
      // skip out of the whole scene, but never out of the two clicks that matter
      if (phase === 'intro' || phase === 'build') { built = { clay: 5, ribs: 3, word: 3 }; toPhase('wake'); }
      else if (phase === 'lion') toPhase('apple');
      else if (phase === 'last' || phase === 'still') toPhase('done');
    }
  }

  /* --------------------------------------------------------------------- draw */

  function drawTargets(g) {
    if (phase !== 'build') return;
    const step = STEPS[stepIx];
    const next = hit.indexOf(false);
    for (let i = 0; i < step.spots.length; i++) {
      if (hit[i]) continue;
      const s = step.spots[i];
      // ONLY THE NEXT ONE IS LOUD. Five bright rings of the same weight stacked up the
      // same body is one bright blob, and the player cannot tell which to click.
      const near = i === next;
      const pulse = 0.6 + 0.4 * Math.sin(t * 5 + i);
      const rr = near ? s.r * 0.7 : s.r * 0.55;
      for (let k = 0; k < (near ? 10 : 6); k++) {
        const ang = (k / (near ? 10 : 6)) * Math.PI * 2 + t * 1.2;
        rect(g, s.x + Math.cos(ang) * rr - 3, s.y + Math.sin(ang) * rr - 3, 6, 6,
          near ? (pulse > 0.75 ? 'cream' : 'gold') : 'brass0');
      }
      if (near) {
        // the NEXT one gets a chevron over it, so there is never a hunt for what to click
        const by = s.y - s.r - 22 + Math.sin(t * 4) * 4;
        tri(g, s.x - 12, by, s.x + 12, by, s.x, by + 16, 'gold');
      }
    }
  }

  function drawApple(g) {
    // on the shelf, or in your hand, or in the air
    let ax = APPLE_X, ay = APPLE_Y;
    if (holding) { ax = PILE_X + 46; ay = FLOOR - 120; }
    if (thrown >= 0) {
      const k = clamp(thrown / 0.55, 0, 1);
      ax = lerp(PILE_X + 46, lionX, k);
      ay = lerp(FLOOR - 120, FLOOR - 60, k) - Math.sin(k * Math.PI) * 90;
    }
    if (tamed) return;
    const glow = 0.6 + 0.4 * Math.sin(t * 4);
    if (!holding && thrown < 0) {
      for (let i = 0; i < 10; i++) {
        const ang = (i / 10) * Math.PI * 2 + t * 1.6;
        rect(g, ax + Math.cos(ang) * 26 - 3, ay + Math.sin(ang) * 26 - 3, 6, 6,
          glow > 0.8 ? 'cream' : 'gold');
      }
    }
    disc(g, ax, ay, 18, 'ink');
    disc(g, ax, ay, 14, 'red2');
    disc(g, ax - 4, ay - 4, 6, 'red1');
    rect(g, ax - 2, ay - 22, 6, 10, 'wood1');
    rect(g, ax + 2, ay - 24, 10, 6, 'leaf3');
    wash(g, ax - 40, ay - 40, 80, 80, 'gold', 0.12 * glow);
  }

  function drawNoah(g) {
    if (phase === 'still') {
      // THE SAME BODY, AND THE HAND DOWN. Nothing rises here -- the soul is the first shot
      // of the reel that follows, where it can be a close-up instead of a small pale thing
      // at the back of a room.
      rect(g, 170, FLOOR - 16, 150, 14, 'ink');
      rect(g, 174, FLOOR - 12, 142, 6, 'wood2');
      rect(g, NOAH_X + 30, FLOOR - 30, 76, 26, 'ink');
      rect(g, NOAH_X + 34, FLOOR - 26, 68, 18, 'parch1');
      rect(g, NOAH_X - 50, FLOOR - 44, 90, 40, 'ink');
      rect(g, NOAH_X - 46, FLOOR - 40, 82, 32, 'parch0');
      rect(g, NOAH_X - 46, FLOOR - 40, 82, 6, 'cream');
      disc(g, NOAH_X - 70, FLOOR - 44, 22, 'ink');
      disc(g, NOAH_X - 70, FLOOR - 44, 18, 'sand');
      rect(g, NOAH_X - 84, FLOOR - 58, 30, 10, 'ink');
      rect(g, NOAH_X - 82, FLOOR - 56, 26, 6, 'cream');
      rect(g, NOAH_X - 116, FLOOR - 30, 48, 14, 'ink');
      rect(g, NOAH_X - 112, FLOOR - 26, 40, 6, 'wood1');
      // the arm, down now, and the golem's own hand resting on his chest
      rect(g, NOAH_X + 2, FLOOR - 30, 30, 14, 'ink');
      rect(g, NOAH_X + 6, FLOOR - 26, 22, 8, 'sand');
      const glow = 0.4 + 0.3 * Math.sin(t * 2);
      wash(g, NOAH_X - 120, FLOOR - 80, 240, 90, 'brass1', 0.08 * glow * soulK);
      return;
    }
    if (noahDown) {
      // FLAT OUT, drawn as a figure rather than a heap: legs, robe, chest, a head with the
      // hat still on it, and one hand up. The staff is across the floor where it fell.
      rect(g, 170, FLOOR - 16, 150, 14, 'ink');
      rect(g, 174, FLOOR - 12, 142, 6, 'wood2');           // the staff, out of reach
      // legs
      rect(g, NOAH_X + 30, FLOOR - 30, 76, 26, 'ink');
      rect(g, NOAH_X + 34, FLOOR - 26, 68, 18, 'parch1');
      // robe and chest
      rect(g, NOAH_X - 50, FLOOR - 44, 90, 40, 'ink');
      rect(g, NOAH_X - 46, FLOOR - 40, 82, 32, 'parch0');
      rect(g, NOAH_X - 46, FLOOR - 40, 82, 6, 'cream');
      rect(g, NOAH_X - 46, FLOOR - 20, 82, 6, 'wood2');    // his belt
      // head, turned up, with the hat beside it
      disc(g, NOAH_X - 70, FLOOR - 44, 22, 'ink');
      disc(g, NOAH_X - 70, FLOOR - 44, 18, 'sand');
      rect(g, NOAH_X - 84, FLOOR - 58, 30, 10, 'ink');     // beard
      rect(g, NOAH_X - 82, FLOOR - 56, 26, 6, 'cream');
      rect(g, NOAH_X - 116, FLOOR - 30, 48, 14, 'ink');    // the hat, off
      rect(g, NOAH_X - 112, FLOOR - 26, 40, 6, 'wood1');
      // and the hand, up, which is the only part of him that moves
      const lift = Math.sin(t * 1.6) * 8;
      rect(g, NOAH_X + 6, FLOOR - 96 + lift, 20, 56, 'ink');
      rect(g, NOAH_X + 10, FLOOR - 92 + lift, 12, 48, 'parch0');
      rect(g, NOAH_X + 4, FLOOR - 104 + lift, 24, 18, 'ink');
      rect(g, NOAH_X + 8, FLOOR - 100 + lift, 16, 12, 'sand');
      return;
    }
    const pose = phase === 'lion' ? 'react' : phase === 'build' ? 'talk' : 'idle';
    drawFolk(g, 'noah', NOAH_X, FLOOR, t, {
      scale: 2, pose, talking: phase === 'intro' || phase === 'build',
    });
    // his staff, held out at the lion
    if (phase === 'lion') {
      const sw = Math.sin(t * 8) * 10;
      rect(g, NOAH_X + 20, FLOOR - 120 + sw, 12, 130, 'ink');
      rect(g, NOAH_X + 22, FLOOR - 116 + sw, 8, 124, 'wood2');
      rect(g, NOAH_X + 12, FLOOR - 128 + sw, 28, 14, 'ink');
      rect(g, NOAH_X + 14, FLOOR - 126 + sw, 24, 10, 'brass1');
    }
  }

  function drawGolem(g) {
    if (phase === 'intro' || phase === 'build') { drawBuild(g); return; }
    // AND FROM HERE IT IS THE REAL SPRITE. The same golem the rest of the game draws, so
    // the thing you assembled and the thing you play are visibly one object.
    const rise = phase === 'wake' ? Ease.outCubic(clamp(pt / 1.1, 0, 1)) : 1;
    const y = FLOOR + (1 - rise) * 40;
    const prev = g.globalAlpha;
    if (rise < 1) g.globalAlpha = 0.4 + rise * 0.6;
    drawFolk(g, 'golem', PILE_X, y, t, {
      scale: 2, pose: phase === 'tame' ? 'happy' : 'idle',
      mud: 0.5, sparkle: phase === 'wake' ? 1 : 0,
    });
    g.globalAlpha = prev;
    if (phase === 'wake' && rise < 1) {
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        const rr = 40 + rise * 120;
        rect(g, PILE_X + Math.cos(ang) * rr - 4, FLOOR - 60 + Math.sin(ang) * rr * 0.6 - 4,
          8, 8, i % 2 ? 'gold' : 'brass3');
      }
    }
  }

  /** The caption bar: the film's grammar, so this scene sits between two reels. */
  function drawCaption(g) {
    rect(g, 0, 0, W, BAR, 'ink');
    rect(g, 0, H - BAR, W, BAR, 'ink');
    rect(g, 0, BAR, W, 4, 'wood0');
    rect(g, 0, H - BAR - 4, W, 4, 'wood0');

    const list = phase === 'build' ? say(STEPS[stepIx].id) : say(phase);
    const line = list[Math.min(ix, list.length - 1)] || '';
    if (line) text(g, line, 26, 14, 'brass3', { font: 7 });

    // and what to do, bottom right, in the same place the film puts it
    let hint = 'CLICK TO GO ON';
    if (phase === 'build') hint = `${STEPS[stepIx].label}  ·  ${STEPS[stepIx].hint}`;
    if (phase === 'apple') hint = holding ? 'NOW THROW IT AT THE LION' : 'CLICK THE APPLE ON THE SHELF';
    if (phase === 'lion') hint = '';
    if (hint) {
      const loud = phase === 'apple' || phase === 'build';
      text(g, hint, W - 26, H - 26, loud ? 'gold' : 'wood2', { font: loud ? 5 : 3, right: true });
    }
    if (phase === 'build') {
      // eleven little pips, so the job has a visible end
      let done = 0, total = 0;
      for (let s = 0; s < STEPS.length; s++) {
        total += STEPS[s].spots.length;
        done += s < stepIx ? STEPS[s].spots.length : s === stepIx ? hit.filter(Boolean).length : 0;
      }
      for (let i = 0; i < total; i++) {
        rect(g, 26 + i * 16, H - 22, 10, 8, i < done ? 'gold' : 'wood0');
      }
    }
  }

  function draw(g) {
    if (!roomCv) bakeRoom();
    rect(g, 0, 0, W, H, 'ink');
    if (roomCv) g.drawImage(roomCv.canvas, 0, 0);

    // the lantern, flickering, and the pool of light it throws
    const flick = 0.7 + 0.3 * Math.sin(t * 9);
    wash(g, LANT_X - 220, LANT_Y - 60, 440, 420, 'brass1', 0.1 * flick);
    rect(g, LANT_X - 6, BAR + 14, 12, LANT_Y - BAR - 40, 'ink');
    rect(g, LANT_X - 26, LANT_Y - 26, 52, 66, 'ink');
    rect(g, LANT_X - 20, LANT_Y - 20, 40, 54, 'brass0');
    rect(g, LANT_X - 14, LANT_Y - 10, 28, 38, flick > 0.8 ? 'gold' : 'brass2');
    disc(g, LANT_X, LANT_Y + 10, 10 + flick * 5, 'gold');

    // water coming in under the stairs
    const wy = H - BAR - 16 - waterK * 40;
    rect(g, 0, wy, W, H - wy, mix(P.water0, P.ink, 0.45));
    rect(g, 0, wy, W, 6, 'water2');
    for (let i = 0; i < 12; i++) {
      rect(g, ((i * 97 + t * 20) % W), wy + 8 + (i % 3) * 8, 30 + (i % 4) * 20, 4, 'water3');
    }

    drawNoah(g);
    drawGolem(g);
    if (phase === 'lion' || phase === 'apple' || phase === 'tame' || phase === 'last'
      || phase === 'still' || phase === 'done') drawLion(g);
    drawApple(g);
    drawTargets(g);
    parts.draw(g);

    if (flash > 0) wash(g, 0, 0, W, H, 'white', clamp(flash, 0, 1) * 0.5);

    // THE UNLOCK PLATE. The one moment in the game that gets a card of its own.
    if (tamed && (phase === 'tame' || phase === 'last')) {
      const k = Ease.outCubic(clamp(pt / 0.5, 0, 1));
      const pw = 520, ph = 96;
      const px0 = (W - pw) / 2, py0 = 96 - (1 - k) * 40;
      rect(g, px0 + 8, py0 + 8, pw, ph, 'ink');
      rect(g, px0, py0, pw, ph, 'wood1');
      rect(g, px0, py0, pw, 8, 'gold');
      rect(g, px0, py0, 8, ph, 'brass2');
      text(g, 'TAMED — THE LION', px0 + pw / 2, py0 + 16, 'gold', { font: 7, center: true });
      text(g, 'A BLESSED CLAY BEAST. IT WILL HOLD A ROW FOR YOU.',
        px0 + pw / 2, py0 + 44, 'parch1', { font: 3, center: true });
      text(g, 'KNOCK THEM DOWN  ·  FEED THEM  ·  PUT THEM ON THE BOAT',
        px0 + pw / 2, py0 + 62, 'brass3', { font: 3, center: true });
    }

    drawCaption(g);
    if (outT >= 0) wash(g, 0, 0, W, H, 'ink', Ease.inQuad(clamp(outT / 0.5, 0, 1)));
    if (pt < 0.6 && phase === 'intro') wash(g, 0, 0, W, H, 'ink', 1 - pt / 0.6);
  }

  return {
    enter(args) {
      v = args.voyage || args.run || null;
      onDone = args.onDone;
      t = 0; pt = 0; ix = 0; phase = 'intro'; stepIx = 0;
      hit = new Array(STEPS[0].spots.length).fill(false);
      built = { clay: 0, ribs: 0, word: 0 };
      flash = 0; holding = false; thrown = -1; lionHp = 2; noahDown = false;
      tamed = false; soulK = 0; waterK = 0; outT = -1;
      lionX = 120; lionTarget = 620;
      roomCv = null;
      parts = createParticles({ limit: 240, seed: 'cellar' });
      Audio.music('deck_tense');
      Audio.sfx('blind_start');
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,
    debug() {
      return {
        basement: true, voyage: v,
        get phase() { return phase; },
        get step() { return STEPS[stepIx].id; },
        get built() { return Object.assign({}, built); },
        get holding() { return holding; },
        get tamed() { return tamed; },
        get line() { return (say(phase)[ix] || ''); },
        targets: () => (phase === 'build'
          ? STEPS[stepIx].spots.map((s, i) => ({ x: s.x, y: s.y, hit: !!hit[i] }))
          : []),
        apple: { x: APPLE_X, y: APPLE_Y },
        lion: () => ({ x: lionX, y: FLOOR - 60 }),
        click: (x, y) => click(x, y),
        next: () => click(-1, -1),
        skip: () => { built = { clay: 5, ribs: 3, word: 3 }; toPhase('done'); },
      };
    },
  };
}

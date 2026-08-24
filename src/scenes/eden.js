// THE GARDEN OF EDEN — the shop.
//
// The last dry ground in the world, and every stall on it wants paying. Three traders
// across the top, the bushes along the bottom, and one modal that the whole scene is
// really built around.
//
//   THE SERPENT sells apples. An apple is odds, not an animal: you pay for a rarity
//   table, and the animal is still hiding.
//   ADAM AND EVE hold out tools and relics -- the permanent pieces -- with every
//   ability printed on the card.
//   THE CHERUBIM at the gate deal tarot. One round each, and enormous because of it.
//
// THE BUSH: plant an apple in a bush and the reveal takes over the screen. The bush
// shakes, harder and harder, until an EYE opens in it -- and the eye is already the
// colour of the rarity you are about to get, which is the whole trick: you know how
// good it is before you know what it is. Click the eye and it bursts; three animals fan
// out of it and you take exactly one. The other two go back into the leaves.
//
// The feeding fee is charged at the moment you take one, not when you buy the apple,
// and it scales with what came out. A legendary knows what it is worth.

import { P, col, mix } from '../core/palette.js';
import {
  rect, frame, box, boxFrame, px, line, disc, ring, ellipse, ellipseFrame, tri,
  dither, vgrad, text, textW, wrap, wash, clamp, lerp, makeCanvas, W, H,
} from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import { drawPortrait, drawCherub } from '../render/portraits.js';
import * as UI from '../render/uikit.js';
import { drawAnimal, drawAnimalIcon } from '../render/sprites.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { HABITAT_BY_ID } from '../data/habitats.js';
import {
  APPLES, APPLE_BY_ID, lureCost, rollBush, RARITY_LOOK, rollGarden, rollBlessings,
  poisonVictim,
} from '../data/eden.js';
import { gardenRelics, RELIC_BY_ID } from '../data/relics.js';
import { addAnimal, addRelic, takeBlessing, spend, canAfford } from '../game/run.js';

const STALL_Y = 46, STALL_H = 236;
const BUSH_Y = 300;

export function makeEdenScene() {
  let run = null, onDone = null;
  let parts = null;
  let t = 0, intro = 0;
  let gardenBake = null;      // the static garden, painted once (see bakeGarden)
  const bushBake = new Map(); // clump art per (index, apple) -- see drawBush

  // stock
  let apples = [];             // the serpent's four
  let tools = [];              // Adam and Eve's three relics
  let cards = [];              // the Cherubim's three blessings
  let basket = [];             // apple ids bought and not yet planted
  let bushes = [null, null, null];   // apple id planted in each bush, or null
  let sold = { tools: [], cards: [] };

  // the reveal modal
  let reveal = null;
  // { phase:'shake'|'eye'|'burst'|'choose'|'done', bush, apple, rarity, choices, k, pick }

  let msg = '', msgT = 0;
  let appleRects = [], toolRects = [], cardRects = [], bushRects = [], choiceRects = [];
  let sailRect = UI.rectOf(0, 0, 0, 0);
  let leaveRect = UI.rectOf(0, 0, 0, 0);

  function say(txt, dur = 2) { msg = txt; msgT = dur; }

  /* ------------------------------------------------------------- purchases */

  function buyApple(i) {
    const ap = apples[i];
    if (!ap) return;
    if (!canAfford(run, ap.price)) { Audio.sfx('error'); say('Not enough. He does not do credit.'); return; }
    spend(run, ap.price);
    basket.push(ap.id);
    Audio.sfx('cash');
    say(`${ap.name} — plant it in a bush.`);
  }

  function plant(bi) {
    if (bushes[bi]) { openBush(bi); return; }
    if (!basket.length) { Audio.sfx('error'); say('Buy an apple first.'); return; }
    bushes[bi] = basket.shift();
    run.bushes = bushes;
    Audio.sfx('deal');
    const r = bushRects[bi];
    if (r) parts.emit('dust', r.x + r.w / 2, r.y + r.h - 10, { count: 8, speed: 30, color: 'moss', life: 0.5 });
    say('Something in there has noticed.');
    openBush(bi);
  }

  /** Start the reveal. The rarity is decided NOW, so the eye can be its colour. */
  function openBush(bi) {
    const appleId = bushes[bi];
    if (!appleId || reveal) return;
    const rng = run.rng.fork(`eden/bush/${run.ante}/${run.blindIx}/${bi}/${appleId}`);
    const rolled = rollBush(rng, appleId, { exclude: run.caravan });
    reveal = {
      phase: 'shake', bush: bi, apple: rolled.apple, rarity: rolled.rarity,
      choices: rolled.choices, k: 0, pick: -1, eyeBlink: 0,
    };
    Audio.sfx('shuffle');
  }

  function takeChoice(ci) {
    if (!reveal || reveal.phase !== 'choose') return;
    const a = reveal.choices[ci];
    if (!a) return;
    const fee = lureCost(reveal.apple, a);
    if (!canAfford(run, fee)) { Audio.sfx('error'); say(`The lure costs $${fee}. It will not come for less.`); return; }
    spend(run, fee);
    if (!addAnimal(run, a.id)) { Audio.sfx('error'); say('No room aboard.'); return; }

    // the apple's own consequence, applied once, at the moment the animal boards
    const ap = reveal.apple;
    if (ap.blessed) {
      run.feedChips[a.id] = (run.feedChips[a.id] || 0) + 30;
      run.feedMult[a.id] = (run.feedMult[a.id] || 0) + 1;
      run.permFeed = run.permFeed || {};
      run.permFeed[a.id] = { chips: 30, mult: 1 };
      say(`${a.name} boards already fed.`, 2.6);
    } else if (ap.curse) {
      run.cursed = (run.cursed || []).concat([a.id]);
      run.feedMult[a.id] = (run.feedMult[a.id] || 0) - 1;
      say(`${a.name} boards cursed. −1 Mult, and it is hungry.`, 2.8);
    } else if (ap.poison) {
      const victim = poisonVictim(run.rng, run);
      if (victim) {
        const ix = run.caravan.indexOf(victim);
        if (ix >= 0) run.caravan.splice(ix, 1);
        const vn = (ANIMAL_BY_ID[victim] || {}).name || victim;
        say(`${a.name} boards. ${vn} does not.`, 3);
        Juice.flash('green0', 0.3, 0.4);
      }
    } else {
      say(`${a.name} walks up the ramp.`, 2.2);
    }

    reveal.pick = ci;
    reveal.phase = 'done';
    reveal.k = 0;
    bushes[reveal.bush] = null;
    run.bushes = bushes;
    const look = RARITY_LOOK[reveal.rarity] || RARITY_LOOK.common;
    Audio.sfx('fanfare');
    Juice.flash(look.glow, 0.3, 0.4);
    parts.emit('star', W / 2, H / 2, { count: 26, speed: 140, color: look.color, life: 1.2 });
  }

  /** Walk away from a reveal. The apple stays in the bush for next time. */
  function leaveIt() {
    if (!reveal) return;
    reveal = null;
    Audio.sfx('click');
    say('You leave it. The apple keeps until you can afford the lure.', 3);
  }

  function buyTool(i) {
    const rel = tools[i];
    if (!rel || sold.tools.indexOf(i) >= 0) return;
    if (!canAfford(run, rel.price)) { Audio.sfx('error'); say('Not enough for that one.'); return; }
    spend(run, rel.price);
    if (!addRelic(run, rel.id)) { run.money += rel.price; Audio.sfx('error'); say('No relic slots left.'); return; }
    sold.tools.push(i);
    Audio.sfx('cash');
    Juice.flash('gold', 0.2, 0.3);
    say(`${rel.name}. ${rel.desc}`, 3.4);
  }

  function buyCard(i) {
    const b = cards[i];
    if (!b || sold.cards.indexOf(i) >= 0) return;
    if (run.blessing) { Audio.sfx('error'); say('You already carry a blessing. One at a time.'); return; }
    if (!canAfford(run, b.price)) { Audio.sfx('error'); say('The Cherubim do not haggle.'); return; }
    spend(run, b.price);
    takeBlessing(run, b);
    sold.cards.push(i);
    Audio.sfx('cash');
    Juice.flash(b.color || 'ice', 0.28, 0.4);
    say(`${b.name}: ${b.desc}`, 3.6);
  }

  /* ------------------------------------------------------------------ draw */

  /**
   * The garden, baked.
   *
   * The sky ramp, the floor ramp, four hundred blades of grass and the tree of
   * knowledge are all completely static, and drawing them per frame cost twenty-eight
   * thousand canvas calls -- more than every other scene in the game put together.
   * They are painted once into an offscreen and blitted after that.
   *
   * The rivers stay live because they move, and they are the only thing here that
   * does.
   */
  function bakeGarden() {
    const mk = makeCanvas(W, H);
    if (!mk) return null;
    const bg = mk.g;
    const HZ = 214;
    for (let y = 0; y < HZ; y++) {
      const f = y / HZ;
      const c = f < 0.30 ? mix(P.purple0, P.pink, f / 0.30)
        : f < 0.58 ? mix(P.pink, P.rust, (f - 0.30) / 0.28)
          : f < 0.82 ? mix(P.rust, P.brass3, (f - 0.58) / 0.24)
            : mix(P.brass3, P.sand, (f - 0.82) / 0.18);
      rect(bg, 0, y, W, 1, c);
      // one dither row every few lines keeps the ramp from looking photographic
      if (y % 5 === 2) dither(bg, 0, y, W, 1, c, mix(c, P.white, 0.25), 3);
    }
    // the sun rises BEHIND the market: the stalls own y 46..282, so only its top shows
    const sunX = 700, sunY = 38;
    for (let i = 0; i < 34; i++) {
      const a2 = (i / 34) * Math.PI * 2;
      for (let r = 38; r < 70; r += 2) {
        px(bg, sunX + Math.cos(a2) * r, sunY + Math.sin(a2) * r * 0.9, r < 46 ? 'gold' : 'brass2');
      }
    }
    disc(bg, sunX, sunY, 36, 'brass3');
    disc(bg, sunX, sunY, 30, 'gold');
    disc(bg, sunX - 8, sunY - 8, 12, 'white');

    // --- the garden floor, receding
    for (let y = HZ; y < H; y++) {
      const f = (y - HZ) / (H - HZ);
      rect(bg, 0, y, W, 1, f < 0.2 ? mix(P.moss, P.green0, f / 0.2)
        : f < 0.6 ? mix(P.green0, P.green1, (f - 0.2) / 0.4)
          : mix(P.green1, P.moss, (f - 0.6) / 0.4));
    }
    // grass, denser and taller toward the camera
    for (let i = 0; i < 420; i++) {
      const gx = (i * 71 + ((i * 13) % 7)) % W;
      const gy = HZ + ((i * 37) % (H - HZ));
      const depth = (gy - HZ) / (H - HZ);
      const gh = 2 + Math.round(depth * 6) + ((i * 13) % 3);
      rect(bg, gx, gy, 1, gh, i % 3 ? 'green1' : 'moss');
      if (depth > 0.5 && i % 7 === 0) px(bg, gx, gy - 1, 'foam');
    }
    // --- the tree of knowledge, rooted where there is room for it
    const tx = 130, tby = 500, tcy = 400;
    rect(bg, tx - 9, tcy, 18, tby - tcy, 'wood1');
    rect(bg, tx - 9, tcy, 6, tby - tcy, 'wood2');
    rect(bg, tx + 6, tcy, 3, tby - tcy, 'wood0');
    for (const dx of [-1, 1]) {
      line(bg, tx, tcy + 20, tx + dx * 26, tcy - 14, 'wood1');
      line(bg, tx, tcy + 21, tx + dx * 26, tcy - 13, 'wood0');
      line(bg, tx + dx * 8, tby, tx + dx * 26, tby + 8, 'wood1');
    }
    const th = (n) => { const v = Math.sin(n * 91.7) * 4371.3; return v - Math.floor(v); };
    for (let i = 0; i < 90; i++) {
      const a2 = th(i) * Math.PI * 2;
      const rad = Math.sqrt(th(i + 50));
      const lx = tx + Math.cos(a2) * 62 * rad;
      const ly = tcy - 24 + Math.sin(a2) * 46 * rad;
      const up = 1 - (ly - (tcy - 70)) / 92;
      ellipse(bg, lx, ly, 8, 5, up > 0.7 ? 'green1' : up > 0.42 ? 'green0' : 'moss');
      if (up > 0.8 && i % 6 === 0) px(bg, lx - 1, ly - 2, 'foam');
    }
    for (let i = 0; i < 7; i++) {
      const a2 = i * 0.92 + 0.4;
      const ax = tx + Math.cos(a2) * 44, ay = tcy - 24 + Math.sin(a2) * 32;
      disc(bg, ax, ay, 5, 'ink');
      disc(bg, ax, ay, 4, 'red2');
      px(bg, ax - 1, ay - 1, 'red1');
      px(bg, ax, ay - 5, 'wood2');
    }
    return mk.canvas;
  }

  function drawGarden(g) {
    if (!gardenBake) gardenBake = bakeGarden();
    if (gardenBake) g.drawImage(gardenBake, 0, 0);

    // the two rivers, which are the only thing in the garden that moves. Drawn as one
    // span per row rather than three, since the highlight either side is a single pixel.
    const HZ = 214;
    for (let i = 0; i < 2; i++) {
      const rx = 250 + i * 470;
      for (let y = HZ + 4; y < H; y++) {
        const depth = (y - HZ) / (H - HZ);
        const wob = Math.round(Math.sin(y * 0.05 + t * 1.1 + i * 2) * (2 + depth * 5));
        const rw = 4 + Math.round(depth * 14);
        const x0 = rx + wob - (rw >> 1);
        rect(g, x0, y, rw, 1, 'water2');
        px(g, x0, y, 'water3');
        px(g, x0 + rw - 1, y, 'water1');
        if ((y + Math.floor(t * 12)) % 11 === 0) rect(g, x0 + 1, y, Math.min(4, rw - 2), 1, 'foam');
      }
    }
  }

  /**
   * One of the three bushes.
   *
   * Two failed attempts are worth recording. Flat ellipses read as lily pads. Flat
   * ellipses STACKED, with a bright cap on top and a ragged horizontal rim, read
   * unmistakably as a flying saucer -- the bright cap becomes a cockpit and the rim
   * becomes the hull.
   *
   * What works is treating it as a CLUMP: scatter sixty small leaf-ellipses inside a
   * roughly circular region with a deterministic hash for position, and pick each
   * leaf's colour from its HEIGHT in the clump so the light reads as coming from
   * above. No single silhouette, no rim, no cap -- just foliage.
   */
  function drawBush(g, i, r) {
    const planted = bushes[i];
    const ap = planted ? APPLE_BY_ID[planted] : null;
    const shakeMe = reveal && reveal.bush === i && reveal.phase === 'shake';
    const sh = shakeMe ? Math.round(Math.sin(t * 34) * (1 + reveal.k * 5)) : 0;
    const cx = r.x + r.w / 2 + sh;
    const gy = r.y + r.h - 26;              // ground line
    const RX = 46, RY = 40;                 // the clump's radii
    const cy = gy - RY + 6;

    // cast shadow on the grass
    ellipse(g, cx + 5, gy + 2, RX * 0.9, 7, 'moss');
    wash(g, cx - RX, gy - 2, RX * 2, 7, 'ink', 0.2);

    // trunk and twigs, drawn first so the foliage buries their tops
    rect(g, cx - 2, gy - 22, 4, 22, 'wood1');
    rect(g, cx - 2, gy - 22, 1, 22, 'wood2');
    for (const dx of [-14, -7, 7, 14]) line(g, cx, gy - 12, cx + dx, gy - 30, 'wood1');

    // The clump is BAKED per (bush, apple): it never changes shape, and seventy-four
    // leaf ellipses is nine hundred canvas calls a bush. `hash` keeps it identical
    // frame to frame anyway -- a bush that reshuffles every frame boils.
    const bkey = i + '/' + (planted || '-');
    let bk = bushBake.get(bkey);
    if (bk === undefined) {
      const mk = makeCanvas(RX * 2 + 8, RY * 2 + 8);
      bk = mk ? mk.canvas : null;
      if (mk) {
        const bg = mk.g;
        const ox = RX + 4, oy = RY + 4;
        const hash = (n) => {
          const x2 = Math.sin(n * 12.9898 + i * 78.233) * 43758.5453;
          return x2 - Math.floor(x2);
        };
        for (let k2 = 0; k2 < 74; k2++) {
          const a2 = hash(k2) * Math.PI * 2;
          const rad = Math.sqrt(hash(k2 + 100)) * 0.94;      // sqrt = even area fill
          const lx = ox + Math.cos(a2) * RX * rad;
          const ly = oy + Math.sin(a2) * RY * rad;
          // height in the clump decides the tone: lit on top, deep underneath
          const up = 1 - (ly - (oy - RY)) / (RY * 2);
          const c = up > 0.72 ? 'green1' : up > 0.46 ? 'green0' : up > 0.24 ? 'moss' : 'cloth0';
          const lw2 = 5 + Math.round(hash(k2 + 200) * 3);
          ellipse(bg, lx, ly, lw2, Math.round(lw2 * 0.66), c);
          if (up > 0.78 && k2 % 5 === 0) px(bg, lx - 1, ly - 2, 'foam');
          if (up < 0.3 && k2 % 7 === 0) px(bg, lx, ly, 'ink');
        }
      }
      bushBake.set(bkey, bk);
    }
    if (bk) g.drawImage(bk, Math.round(cx - RX - 4), Math.round(cy - RY - 4));

    // the apple, nested in the leaves rather than sitting on them
    if (ap) {
      const ay = cy + 2 + Math.round(Math.sin(t * 2 + i) * 2);
      disc(g, cx, ay, 9, 'ink');
      disc(g, cx, ay, 7, ap.color);
      disc(g, cx - 2, ay - 2, 3, 'white');
      rect(g, cx, ay - 11, 2, 5, 'wood2');
      ellipse(g, cx + 4, ay - 11, 3, 2, 'green1');
      // a couple of leaves back over the front of it, so it is IN the bush
      ellipse(g, cx - 8, ay + 4, 6, 4, 'green0');
      ellipse(g, cx + 9, ay + 2, 5, 4, 'moss');
      if (ap.glint) {
        for (let k3 = 0; k3 < 6; k3++) {
          const a2 = t * 3 + k3 * 1.05;
          px(g, cx + Math.cos(a2) * 15, ay + Math.sin(a2) * 13, 'purple1');
        }
      }
      // something looking out from underneath
      if (((t * 1.2 + i) % 3) < 1.1) {
        for (const side of [-1, 1]) {
          rect(g, cx + side * 13 - 1, cy + 16, 2, 2, 'amber');
          px(g, cx + side * 13, cy + 17, 'ink');
        }
      }
    }

    // the label plate, planted in the grass in front
    const lbl = ap ? ap.short : basket.length ? 'PLANT ONE' : 'EMPTY';
    const lw = textW(lbl, { font: 5 }) + 18;
    box(g, cx - lw / 2, gy + 8, lw, 18, 'ink', 1);
    boxFrame(g, cx - lw / 2, gy + 8, lw, 18, ap ? ap.color : basket.length ? 'brass3' : 'wood0', 1);
    text(g, lbl, cx, gy + 13, ap ? ap.color : basket.length ? 'brass3' : 'grey1', { font: 5, center: true });
    if (UI.hover(r, Input.mouse) && !reveal) {
      ellipseFrame(g, cx, cy, RX + 3, RY + 3, 'white');
      if (basket.length || ap) {
        text(g, ap ? 'LOOK' : 'PLANT', cx, cy - RY - 18, 'white', { font: 5, center: true, shadow: 'ink' });
      }
    }
  }

  function draw(g) {
    drawGarden(g);
    parts.draw(g, 'back');

    const k = Ease.outCubic(clamp(intro, 0, 1));
    const slide = Math.round((1 - k) * 50);

    // ---------------------------------------------------------- the stalls
    const cw = 296, gap = 12;
    const x0 = Math.round((W - (cw * 3 + gap * 2)) / 2);

    // --- 1: the serpent
    let sx = x0;
    UI.panel(g, sx, STALL_Y - slide, cw, STALL_H, { style: 'wood', shadow: true });
    drawPortrait(g, 'snake', sx + 8, STALL_Y + 20 - slide, 78, 110, t, {});
    text(g, 'THE SERPENT', sx + 92, STALL_Y + 8 - slide, 'green1', { font: 7, shadow: 'ink' });
    text(g, 'apples. odds, not animals.', sx + 92, STALL_Y + 24 - slide, 'foam', { font: 3 });
    appleRects = [];
    apples.forEach((ap, i) => {
      const ax = sx + 92 + (i % 2) * 100;
      const ay = STALL_Y + 36 + Math.floor(i / 2) * 68 - slide;
      const r = UI.rectOf(ax, ay, 96, 64);
      appleRects[i] = r;
      const afford = canAfford(run, ap.price);
      const hot = UI.hover(r, Input.mouse);
      rect(g, r.x, r.y, r.w, r.h, mix(col(ap.color), P.ink, afford ? 0.7 : 0.86));
      boxFrame(g, r.x, r.y, r.w, r.h, hot && afford ? 'white' : ap.color, 1);
      // the apple itself
      disc(g, r.x + 16, r.y + 20, 9, ap.color);
      disc(g, r.x + 13, r.y + 17, 3, 'white');
      rect(g, r.x + 16, r.y + 9, 1, 4, 'wood2');
      ellipse(g, r.x + 19, r.y + 9, 3, 2, 'green1');
      if (ap.glint) {
        for (let j = 0; j < 4; j++) {
          const a = t * 3.4 + j * 1.6;
          px(g, r.x + 16 + Math.cos(a) * 14, r.y + 20 + Math.sin(a) * 12, 'purple1');
        }
      }
      // name on its own row, price hard right on the row below -- at 96px wide the
      // two collided ("ENCHANT$13") the moment a name got long
      // name and price share the top row at font 5 -- at font 7 the price was wide
      // enough to land on top of BLESSED, and moving it down landed it on the odds bar
      text(g, ap.short, r.x + 30, r.y + 5, afford ? 'white' : 'grey1', { font: 5 });
      text(g, '$' + ap.price, r.x + r.w - 4, r.y + 5, afford ? 'brass3' : 'red2',
        { font: 5, right: true });
      // the odds, as four bars — this is literally what you are buying
      let bx2 = r.x + 30;
      for (const rr of ['common', 'uncommon', 'rare', 'legendary']) {
        const wpx = Math.round((ap.odds[rr] || 0) * 40);
        const look = RARITY_LOOK[rr];
        if (wpx > 0) { rect(g, bx2, r.y + 16, wpx, 5, look.color); px(g, bx2, r.y + 16, look.glow); }
        bx2 += wpx;
      }
      wrap(ap.desc, r.w - 8, { font: 3 }).slice(0, 4).forEach((l, j) => {
        text(g, l, r.x + 4, r.y + 26 + j * 8, 'grey2', { font: 3 });
      });
      if (hot) {
        UI.tooltip(g, r.x, r.y + r.h + 4, {
          title: ap.name, lines: wrap(ap.flavor, 220, { font: 3 }), color: ap.color, w: 232,
        });
      }
    });
    // the basket: what you have bought and not yet planted
    if (basket.length) {
      text(g, 'IN HAND', sx + 8, STALL_Y + 140 - slide, 'brass2', { font: 3 });
      basket.forEach((id, i) => {
        const ap = APPLE_BY_ID[id];
        if (!ap) return;
        disc(g, sx + 16 + i * 16, STALL_Y + 156 - slide, 6, ap.color);
        px(g, sx + 14 + i * 16, STALL_Y + 154 - slide, 'white');
      });
    }

    // --- 2: Adam and Eve
    sx = x0 + cw + gap;
    UI.panel(g, sx, STALL_Y - slide, cw, STALL_H, { style: 'wood', shadow: true });
    drawPortrait(g, 'adam', sx + 6, STALL_Y + 20 - slide, 62, 92, t, {});
    drawPortrait(g, 'eve', sx + 6, STALL_Y + 122 - slide, 62, 92, t + 1.4, {});
    text(g, 'ADAM & EVE', sx + 74, STALL_Y + 8 - slide, 'sand', { font: 7, shadow: 'ink' });
    text(g, 'tools. every ability printed.', sx + 74, STALL_Y + 24 - slide, 'gold', { font: 3 });
    toolRects = [];
    tools.forEach((rel, i) => {
      const r = UI.rectOf(sx + 74, STALL_Y + 36 + i * 66 - slide, cw - 82, 62);
      toolRects[i] = r;
      const done = sold.tools.indexOf(i) >= 0;
      const afford = canAfford(run, rel.price);
      const rc = UI.RARITY_COLOR[rel.rarity] || 'grey2';
      const hot = UI.hover(r, Input.mouse) && !done;
      rect(g, r.x, r.y, r.w, r.h, done ? 'shadow' : mix(col(rc), P.ink, afford ? 0.74 : 0.88));
      boxFrame(g, r.x, r.y, r.w, r.h, done ? 'wood0' : hot ? 'white' : rc, 1);
      UI.icon(g, (rel.art && rel.art.icon) || 'gem', r.x + 6, r.y + 8,
        { color: done ? 'grey0' : (rel.art && rel.art.fg) || rc, scale: 2 });
      text(g, rel.name, r.x + 28, r.y + 5, done ? 'grey0' : 'white', { font: 5 });
      text(g, done ? 'TAKEN' : '$' + rel.price, r.x + r.w - 5, r.y + 5,
        done ? 'grey0' : afford ? 'brass3' : 'red2', { font: 7, right: true });
      UI.starRow(g, r.x + 28, r.y + 18, UI.RARITY_STARS[rel.rarity] || 1, { color: rc });
      wrap(rel.desc, r.w - 34, { font: 3 }).slice(0, 4).forEach((l, j) => {
        text(g, l, r.x + 28, r.y + 28 + j * 8, done ? 'grey0' : 'bone', { font: 3 });
      });
    });

    // --- 3: the Cherubim
    sx = x0 + (cw + gap) * 2;
    UI.panel(g, sx, STALL_Y - slide, cw, STALL_H, { style: 'wood', shadow: true });
    text(g, 'THE CHERUBIM', sx + 8, STALL_Y + 8 - slide, 'pink', { font: 7, shadow: 'ink' });
    text(g, 'tarot. one round each.', sx + 8, STALL_Y + 24 - slide, 'foam', { font: 3 });
    // the pair, hovering over the stall with the flaming sword between them
    drawCherubPair(g, sx + cw - 54, STALL_Y + 24 - slide);
    cardRects = [];
    cards.forEach((b, i) => {
      const r = UI.rectOf(sx + 8, STALL_Y + 38 + i * 64 - slide, cw - 16, 60);
      cardRects[i] = r;
      const done = sold.cards.indexOf(i) >= 0;
      const afford = canAfford(run, b.price) && !run.blessing;
      const hot = UI.hover(r, Input.mouse) && !done;
      // a tarot card: dark ground, a bright border, the numeral top-left
      rect(g, r.x, r.y, r.w, r.h, done ? 'shadow' : mix(col(b.color), P.ink, 0.78));
      boxFrame(g, r.x, r.y, r.w, r.h, done ? 'wood0' : hot ? 'white' : b.color, 1);
      boxFrame(g, r.x + 2, r.y + 2, r.w - 4, r.h - 4, done ? 'wood0' : mix(col(b.color), P.ink, 0.4), 0);
      text(g, b.card, r.x + 6, r.y + 5, done ? 'grey0' : b.color, { font: 5 });
      UI.icon(g, b.icon, r.x + r.w - 44, r.y + 6, { color: done ? 'grey0' : b.color, scale: 2 });
      text(g, b.name, r.x + 6, r.y + 17, done ? 'grey0' : 'white', { font: 7 });
      text(g, done ? 'TAKEN' : '$' + b.price, r.x + r.w - 6, r.y + 5,
        done ? 'grey0' : afford ? 'brass3' : 'red2', { font: 7, right: true });
      wrap(b.desc, r.w - 14, { font: 3 }).slice(0, 3).forEach((l, j) => {
        text(g, l, r.x + 6, r.y + 33 + j * 8, done ? 'grey0' : 'ice', { font: 3 });
      });
    });
    if (run.blessing) {
      text(g, `CARRYING: ${run.blessing.name}`, sx + cw / 2, STALL_Y + STALL_H - 14 - slide,
        run.blessing.color || 'ice', { font: 5, center: true });
    }

    // ---------------------------------------------------------- the bushes
    const bh0 = textW('PLANT AN APPLE', { font: 7 }) + 24;
    wash(g, 16, BUSH_Y - 20, bh0, 34, 'ink', 0.5);
    text(g, 'PLANT AN APPLE', 28, BUSH_Y - 16, 'brass3', { font: 7, shadow: 'ink' });
    text(g, 'something is always watching from the leaves', 28, BUSH_Y + 2, 'foam',
      { font: 3, shadow: 'ink' });
    bushRects = [];
    for (let i = 0; i < 3; i++) {
      const r = UI.rectOf(300 + i * 210, BUSH_Y - 6, 180, 150);
      bushRects[i] = r;
      drawBush(g, i, r);
    }

    // ---------------------------------------------------------- the footer
    UI.panel(g, 14, H - 46, 300, 36, { style: 'slate', inset: true });
    UI.moneyPill(g, 24, H - 38, run.money, {});
    text(g, `${run.caravan.length} aboard`, 100, H - 34, 'bone', { font: 5 });
    text(g, `${run.relics.length}/${run.relicSlots} relics`, 200, H - 34, 'grey2', { font: 5 });

    sailRect = UI.rectOf(W - 300, H - 46, 286, 36);
    UI.button(g, sailRect, 'CAST OFF', {
      state: UI.hover(sailRect, Input.mouse) ? 'hover' : 'idle', color: 'green0', icon: 'boat',
      sub: 'the water is not waiting',
    });

    if (msgT > 0) {
      const mw = Math.min(W - 40, textW(msg, { font: 5 }) + 24);
      box(g, W / 2 - mw / 2, H - 78, mw, 24, 'ink', 2);
      boxFrame(g, W / 2 - mw / 2, H - 78, mw, 24, 'brass1', 2);
      text(g, msg, W / 2, H - 71, 'bone', { font: 5, center: true });
    }

    parts.draw(g, 'front');
    if (reveal) drawReveal(g);
    if (intro < 1) wash(g, 0, 0, W, H, 'ink', (1 - k) * 0.85);
  }

  function drawCherubPair(g, x, y) {
    // two of them, and the sword they are supposed to be guarding the gate with
    const lift = Math.round(Math.sin(t * 2) * 2);
    drawCherub(g, x, y + 14 + lift, t, { scale: 2, arms: true });
    drawCherub(g, x + 34, y + 14 - lift, t + 1.7, { scale: 2, arms: true, flip: true });
    const swx = x + 17;
    rect(g, swx, y + 2, 2, 26, 'grey2');
    for (let i = 0; i < 8; i++) {
      const fx = swx + Math.round(Math.sin(t * 8 + i) * 2);
      px(g, fx, y + 2 - i, i < 3 ? 'white' : i < 6 ? 'gold' : 'orange');
      px(g, fx + 1, y + 2 - i, i < 4 ? 'amber' : 'orange');
    }
    rect(g, swx - 4, y + 26, 10, 2, 'brass2');
  }

  /**
   * The reveal. Four beats, and the important one is the third: the eye's colour is
   * the rarity, so the payoff lands BEFORE the animals are visible.
   */
  function drawReveal(g) {
    const look = RARITY_LOOK[reveal.rarity] || RARITY_LOOK.common;
    const cx = W / 2, cy = 250;
    wash(g, 0, 0, W, H, 'ink', 0.82);

    if (reveal.phase === 'shake' || reveal.phase === 'eye') {
      // The big bush is built the same way as the small ones -- a scattered clump with
      // colour by height -- because the stacked-ellipse version read as a saucer at
      // 150px and reads as one even harder at 400.
      const sh = reveal.phase === 'shake' ? Math.round(Math.sin(t * 40) * (2 + reveal.k * 9)) : 0;
      const bx = cx + sh;
      const RX = 240, RY = 150;
      // a lamp of the rarity's colour behind the whole thing, so the tier is already
      // bleeding through the leaves before the eye opens
      if (reveal.phase === 'eye') {
        for (let i = 10; i >= 0; i--) {
          const f = i / 10;
          wash(g, bx - RX * f, cy - RY * f, RX * 2 * f, RY * 2 * f, look.color, 0.045);
        }
      }
      const hash = (n) => {
        const x = Math.sin(n * 12.9898 + reveal.bush * 78.233) * 43758.5453;
        return x - Math.floor(x);
      };
      for (let k2 = 0; k2 < 300; k2++) {
        const a2 = hash(k2) * Math.PI * 2;
        const rad = Math.sqrt(hash(k2 + 400)) * 0.98;
        const lx = bx + Math.cos(a2) * RX * rad;
        const ly = cy + Math.sin(a2) * RY * rad;
        const up = 1 - (ly - (cy - RY)) / (RY * 2);
        const c = up > 0.74 ? 'green1' : up > 0.5 ? 'green0' : up > 0.26 ? 'moss' : 'cloth0';
        const lw2 = 9 + Math.round(hash(k2 + 700) * 6);
        ellipse(g, lx, ly, lw2, Math.round(lw2 * 0.68), c);
        if (up > 0.8 && k2 % 9 === 0) px(g, lx - 2, ly - 3, 'foam');
        if (up < 0.28 && k2 % 11 === 0) px(g, lx, ly, 'ink');
      }
      // leaves shaken loose, falling past the camera
      for (let i = 0; i < 22; i++) {
        const p = (t * 0.55 + i * 0.09) % 1;
        ellipse(g, bx + Math.sin(i * 2.1 + t) * (RX * 0.9), cy - RY + p * (RY * 2.6), 6, 4,
          i % 3 === 0 ? 'green1' : i % 3 === 1 ? 'moss' : 'green0');
      }

      if (reveal.phase === 'eye') {
        // THE EYE. Its colour has already told you the tier.
        const open = Math.min(1, reveal.k * 2.4);
        const erx = 62, ery = Math.max(2, Math.round(56 * open));
        // socket
        ellipse(g, bx, cy, erx + 8, ery + 6, 'ink');
        ellipse(g, bx, cy, erx, ery, 'white');
        ellipse(g, bx, cy, Math.round(erx * 0.9), Math.round(ery * 0.9), 'bone');
        // iris: saturated, ringed, and unmistakably the rarity colour
        const irx = Math.round(erx * 0.46), iry = Math.round(ery * 0.86);
        ellipse(g, bx, cy, irx, iry, look.color);
        ellipse(g, bx, cy, Math.round(irx * 0.72), Math.round(iry * 0.76), mix(col(look.color), P.white, 0.35));
        ellipseFrame(g, bx, cy, irx, iry, look.glow);
        ellipseFrame(g, bx, cy, irx + 2, iry + 2, mix(col(look.color), P.ink, 0.4));
        // radial fibres in the iris
        for (let i = 0; i < 22; i++) {
          const a2 = (i / 22) * Math.PI * 2;
          line(g, bx + Math.cos(a2) * irx * 0.4, cy + Math.sin(a2) * iry * 0.4,
            bx + Math.cos(a2) * irx * 0.92, cy + Math.sin(a2) * iry * 0.92,
            i % 2 ? look.glow : look.color);
        }
        disc(g, bx, cy, Math.max(3, Math.round(iry * 0.42)), 'ink');
        disc(g, bx - Math.round(irx * 0.3), cy - Math.round(iry * 0.34), 4, 'white');
        px(g, bx + 6, cy + 8, 'white');
        ellipseFrame(g, bx, cy, erx + 2, ery + 2, look.glow);
        ellipseFrame(g, bx, cy, erx + 5, ery + 4, look.color);
        // lashes
        for (let i = -5; i <= 5; i++) {
          const lxx = bx + i * 11;
          line(g, lxx, cy - ery - 3, lxx + i, cy - ery - 16, look.color);
          line(g, lxx, cy + ery + 3, lxx + i, cy + ery + 14, mix(col(look.color), P.ink, 0.3));
        }
        // and a corona of the rarity colour
        for (let i = 0; i < 56; i++) {
          const a2 = (i / 56) * Math.PI * 2 + t * 0.5;
          const rr = 96 + Math.abs(Math.sin(t * 2 + i * 0.6)) * 34;
          px(g, bx + Math.cos(a2) * rr, cy + Math.sin(a2) * rr * 0.82, i % 2 ? look.color : look.glow);
        }
        UI.starRow(g, bx - look.stars * 11, cy + ery + 26, look.stars, { color: look.color, scale: 2 });
        if (Math.floor(t * 2) % 2 === 0) {
          const cw2 = textW('CLICK THE EYE', { font: 7 }) + 28;
          wash(g, bx - cw2 / 2, cy + ery + 52, cw2, 20, 'ink', 0.7);
          text(g, 'CLICK THE EYE', bx, cy + ery + 56, 'white', { font: 7, center: true, shadow: 'ink' });
        }
      } else if (Math.floor(t * 3) % 2 === 0) {
        const cw2 = textW('IT IS COMING', { font: 7 }) + 28;
        wash(g, bx - cw2 / 2, cy + RY + 16, cw2, 20, 'ink', 0.7);
        text(g, 'IT IS COMING', bx, cy + RY + 20, 'bone', { font: 7, center: true, shadow: 'ink' });
      }
      return;
    }

    if (reveal.phase === 'burst') {
      // the rarity blows out of the bush
      const kk = clamp(reveal.k / 0.5, 0, 1);
      const rr = 40 + kk * 460;
      ringBurst(g, cx, cy, rr, look);
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * Math.PI * 2;
        const d = rr * (0.6 + ((i * 7) % 5) / 10);
        px(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, i % 2 ? look.color : look.glow);
      }
      text(g, look.label, cx, cy - 20, look.color, { font: 7, center: true, scale: 3, shadow: 'ink' });
      UI.starRow(g, cx - look.stars * 11, cy + 26, look.stars, { color: look.color, scale: 3 });
      return;
    }

    // --- choose one of three
    const banner = `${look.label}  ·  TAKE ONE`;
    const sub = 'the other two go back into the leaves';
    const bwid2 = Math.max(textW(banner, { font: 7, scale: 2 }), textW(sub, { font: 5 })) + 56;
    wash(g, cx - bwid2 / 2, 56, bwid2, 66, 'ink', 0.8);
    boxFrame(g, cx - bwid2 / 2, 56, bwid2, 66, look.color, 1);
    text(g, banner, cx, 70, look.color, { font: 7, center: true, scale: 2, shadow: 'ink' });
    text(g, sub, cx, 102, 'grey2', { font: 5, center: true });
    // LEAVE IT, and it says what leaving costs you: nothing
    leaveRect = UI.rectOf(cx - 150, H - 44, 300, 32);
    UI.button(g, leaveRect, 'LEAVE IT IN THE BUSH', {
      state: UI.hover(leaveRect, Input.mouse) ? 'hover' : 'idle', color: 'wood2',
      sub: 'the apple keeps — come back when you can pay',
    });

    choiceRects = [];
    const cwid = 220, cgap = 22;
    const startX = Math.round((W - (cwid * reveal.choices.length + cgap * (reveal.choices.length - 1))) / 2);
    reveal.choices.forEach((a, i) => {
      const kk = Ease.outBack(clamp(reveal.k * 2 - i * 0.16, 0, 1));
      const cyy = Math.round(lerp(H, 140, kk));
      const r = UI.rectOf(startX + i * (cwid + cgap), cyy, cwid, 250);
      choiceRects[i] = r;
      const hot = UI.hover(r, Input.mouse);
      const fee = lureCost(reveal.apple, a);
      const afford = canAfford(run, fee);

      UI.panel(g, r.x, r.y, r.w, r.h, { style: 'slate', shadow: true });
      boxFrame(g, r.x - 1, r.y - 1, r.w + 2, r.h + 2, hot ? 'white' : look.color, 1);
      // a shaft of rarity light behind the animal: widest at the top, fading down, so
      // it reads as light coming in rather than as a grey band painted on
      for (let j = 0; j < 100; j++) {
        const f = j / 100;
        const ww = Math.round(96 * (0.45 + f * 0.55));
        wash(g, r.x + r.w / 2 - ww / 2, r.y + 12 + j, ww, 1, look.glow, 0.055 * (1 - f * 0.7));
      }
      drawAnimal(g, a, r.x + r.w / 2, r.y + 66, { scale: 2 });
      text(g, a.name, r.x + r.w / 2, r.y + 100, 'white', { font: 7, center: true, scale: 2, shadow: 'ink' });
      text(g, `${a.chips} CHIPS   ×${a.mult} MULT`, r.x + r.w / 2, r.y + 128, 'sky',
        { font: 5, center: true });
      // its ranked wants
      text(g, 'WANTS', r.x + 10, r.y + 148, 'grey1', { font: 3 });
      a.likes.forEach((tid, j) => {
        const hb = HABITAT_BY_ID[tid];
        if (!hb) return;
        const sz = j === 0 ? 18 : 14;
        const pxx = r.x + 52 + j * 22;
        rect(g, pxx, r.y + 144 + (j ? 2 : 0), sz, sz, mix(col(hb.color), P.ink, 0.5));
        frame(g, pxx, r.y + 144 + (j ? 2 : 0), sz, sz, hb.color);
        UI.icon(g, hb.icon, pxx + (sz - 8) / 2, r.y + 144 + (j ? 2 : 0) + (sz - 8) / 2, { color: hb.color });
      });
      wrap(a.rules || a.blurb || '', r.w - 20, { font: 3 }).slice(0, 3).forEach((l, j) => {
        text(g, l, r.x + 10, r.y + 172 + j * 9, 'grey2', { font: 3 });
      });
      if (a.skill) {
        text(g, 'SKILL', r.x + 10, r.y + 202, 'gold', { font: 3 });
        wrap(a.skill.desc || '', r.w - 20, { font: 3 }).slice(0, 2).forEach((l, j) => {
          text(g, l, r.x + 10, r.y + 212 + j * 9, 'brass3', { font: 3 });
        });
      }
      // the feeding fee
      const fr = { x: r.x + 8, y: r.y + r.h - 26, w: r.w - 16, h: 18 };
      rect(g, fr.x, fr.y, fr.w, fr.h, afford ? mix(col('green0'), P.ink, 0.5) : mix(col('red0'), P.ink, 0.5));
      boxFrame(g, fr.x, fr.y, fr.w, fr.h, afford ? 'green1' : 'red2', 1);
      text(g, `LURE  $${fee}`, fr.x + fr.w / 2, fr.y + 4, afford ? 'white' : 'red2',
        { font: 5, center: true });
    });
  }

  function ringBurst(g, cx, cy, r, look) {
    ellipseFrame(g, cx, cy, r, r * 0.8, look.glow);
    ellipseFrame(g, cx, cy, r - 3, (r - 3) * 0.8, look.color);
    ellipseFrame(g, cx, cy, r * 0.6, r * 0.48, look.color);
  }

  /* --------------------------------------------------------------- update */

  function update(dt) {
    t += dt;
    intro = approach(intro, 1, 2.4, dt);
    if (msgT > 0) msgT -= dt;
    parts.update(dt);

    if (reveal) {
      reveal.k += dt;
      const m = Input.mouse;
      if (reveal.phase === 'shake') {
        if (reveal.k > 1.1 || m.pressed) { reveal.phase = 'eye'; reveal.k = 0; Audio.sfx('boss_sting'); }
      } else if (reveal.phase === 'eye') {
        // the eye has to be OPEN before the click counts, or the payoff is skippable
        if (m.pressed && reveal.k > 0.45) {
          reveal.phase = 'burst'; reveal.k = 0;
          Audio.sfx('fanfare');
          Juice.shake(6, 0.4);
          const look = RARITY_LOOK[reveal.rarity] || RARITY_LOOK.common;
          Juice.flash(look.glow, 0.45, 0.5);
          parts.emit('star', W / 2, 250, { count: 40, speed: 200, color: look.color, life: 1.4 });
        }
      } else if (reveal.phase === 'burst') {
        if (reveal.k > 0.55) { reveal.phase = 'choose'; reveal.k = 0; }
      } else if (reveal.phase === 'choose') {
        if (m.pressed) {
          if (UI.hover(leaveRect, m)) { leaveIt(); return; }
          for (let i = 0; i < choiceRects.length; i++) {
            if (choiceRects[i] && UI.hover(choiceRects[i], m)) { takeChoice(i); break; }
          }
        }
        if (Input.pressed('Escape')) { leaveIt(); return; }
      } else if (reveal.phase === 'done') {
        if (reveal.k > 0.5) reveal = null;
      }
      return;                      // the modal owns the input while it is up
    }

    const m = Input.mouse;
    if (m.pressed) {
      for (let i = 0; i < appleRects.length; i++) {
        if (appleRects[i] && UI.hover(appleRects[i], m)) { buyApple(i); return; }
      }
      for (let i = 0; i < toolRects.length; i++) {
        if (toolRects[i] && UI.hover(toolRects[i], m)) { buyTool(i); return; }
      }
      for (let i = 0; i < cardRects.length; i++) {
        if (cardRects[i] && UI.hover(cardRects[i], m)) { buyCard(i); return; }
      }
      for (let i = 0; i < bushRects.length; i++) {
        if (bushRects[i] && UI.hover(bushRects[i], m)) { plant(i); return; }
      }
      if (UI.hover(sailRect, m)) { Audio.sfx('click'); if (onDone) onDone(); }
    }
    if (Input.pressed('Escape') || Input.pressed('Enter')) { if (onDone) onDone(); }
  }

  return {
    enter(args, api) {
      run = args.run; onDone = args.onDone;
      void api;
      t = 0; intro = 0;
      // Bushes persist on the RUN, not the scene. If you plant an apple and cannot
      // afford any of the three lures, you can walk away and it is still growing when
      // you come back richer -- which is the only thing that stops "buy an apple, be
      // too poor to take anything" from being a pure loss.
      run.bushes = Array.isArray(run.bushes) && run.bushes.length === 3
        ? run.bushes : [null, null, null];
      run.basket = Array.isArray(run.basket) ? run.basket : [];
      bushes = run.bushes;
      basket = run.basket;
      sold = { tools: [], cards: [] };
      reveal = null;
      parts = createParticles({ limit: 500, seed: run.seed + '/eden' });

      const rng = run.rng.fork(`eden/${run.ante}/${run.blindIx}`);
      const garden = rollGarden(rng, { seenBlessings: run.seenBlessings || [] });
      apples = garden.apples;
      cards = garden.blessings;
      // three tools you do not already own, from Adam's and Eve's own stock
      const ownedIds = run.relics.map((r) => r.id);
      const pool = gardenRelics().filter((r) => ownedIds.indexOf(r.id) < 0);
      tools = rng.sample(pool, Math.min(3, pool.length));

      Audio.music('dock');
      say('Everything here wants paying.', 2.6);
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,
    debug() {
      return {
        run, apples, tools, cards, basket, bushes, reveal,
        rects: {
          apples: appleRects, tools: toolRects, cards: cardRects,
          bushes: bushRects, choices: choiceRects, sail: sailRect, leave: leaveRect,
        },
        buyApple, plant, openBush, takeChoice, buyTool, buyCard, leaveIt,
        rectsLeave: leaveRect,
      };
    },
  };
}

void RELIC_BY_ID;
void rollBlessings;
void APPLES;
void drawAnimalIcon;
void dither;
void tri;
void ring;
void line;

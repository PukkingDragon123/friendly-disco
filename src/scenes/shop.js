// THE DOCK.
//
// You do not buy cards here. You pick one crate off the manifest, and a boat brings it.
// Browsing is a quiet dockside board; the moment you buy, the scene hands the screen over
// to the delivery — boat in, crane out, crate down, lid off, contents flying to your
// loadout — because that is the payoff the whole blind was paying for.

import { P, col, mix } from '../core/palette.js';
import {
  rect, frame, box, boxFrame, px, line, dashLine, disc, ring, ellipse, tri,
  dither, vgrad, text, textW, wrap, wash, clip, clamp, lerp,
} from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import { createSeascape, drawBoat } from '../render/seascape.js';
import * as UI from '../render/uikit.js';
import { drawAnimal, drawAnimalIcon } from '../render/sprites.js';
import { ANIMAL_BY_ID } from '../data/animals.js';
import { HABITATS, HABITAT_BY_ID } from '../data/habitats.js';
import { RELIC_BY_ID } from '../data/relics.js';
import {
  rollManifest, cratePrice, crateSummary, CUE_UPGRADES, FEEDS, VOUCHERS,
  HABITAT_UPGRADES, applyHabitatUpgrade, habitatLevel, BOAT_CLASS,
} from '../data/cargo.js';
import { blindTarget, BLIND_KINDS } from '../data/blinds.js';
import {
  spend, canAfford, deliverCrate, addCue, addFeed, addVoucher, sellRelic,
  currentKind, caravanBreakdown,
} from '../game/run.js';

const HORIZON = 96;
// Where the sea meets the dock. Everything below this is decking you are standing on —
// the earlier layout put more water UNDER the pier, which made it read as a bridge.
const PIER_Y = 232;
const LAND_X = 154;              // where the crate is set down


export function makeShopScene() {
  let run = null, onDone = null, app = null;
  let sea = null, parts = null;
  let t = 0;

  let manifest = [];
  let cueOffers = [], feedOffers = [], voucherOffer = null, habitatOffer = null;
  let rerollCost = 3;
  let msg = '', msgT = 0;
  let sold = new Set();

  // delivery sequence
  let mode = 'browse';
  let seqT = 0;
  let boat = null;
  let crate = null;
  let gotItems = [];
  let revealIx = 0;
  let cratePos = { x: 0, y: 0 };
  let craneAngle = 0;
  let landProg = 0;       // 0..1 through the crane swing; linear so it always lands
  let landed = false;
  let opened = false;
  let speedUp = 1;        // a click fast-forwards the delivery; you do this 24 times a run

  // hit rects
  const crateRects = [];
  const cueRects = [];
  const feedRects = [];
  let voucherRect = UI.rectOf(0, 0, 0, 0);
  let habitatRect = UI.rectOf(0, 0, 0, 0);
  let rerollRect = UI.rectOf(0, 0, 0, 0);
  let castRect = UI.rectOf(0, 0, 0, 0);
  const relicRects = [];

  /* ------------------------------------------------------------- helpers */

  function say(s2, d = 2.4) { msg = s2; msgT = d; }

  function reroll(free) {
    const rng = run.rng.fork('dock/' + run.ante + '/' + rerollCost + (free ? '/f' : ''));
    manifest = (rollManifest(rng, run, Math.max(1, run.crateSlots)) || []).slice(0, 4);
    cueOffers = pickOffers(CUE_UPGRADES, rng, 2, (c) => !run.cueUpgrades.includes(c.id));
    feedOffers = pickOffers(FEEDS, rng, 2, () => true);
    const vs = VOUCHERS.filter((v) => !run.vouchers.includes(v.id));
    voucherOffer = vs.length ? rng.pick(vs) : null;
    const hs = HABITAT_UPGRADES.filter((h) => habitatLevel(run, h.habitat) < 3);
    habitatOffer = hs.length ? rng.pick(hs) : null;
  }

  function pickOffers(list, rng, n, ok) {
    const pool = (list || []).filter(ok);
    return rng.sample(pool, Math.min(n, pool.length));
  }

  function nextBlindLabel() {
    const kind = currentKind(run);
    const info = BLIND_KINDS.find((b) => b.key === kind) || BLIND_KINDS[0];
    return { kind, name: info.name, color: info.color, target: blindTarget(run.ante, kind) };
  }

  function buyCrate(ix) {
    const c = manifest[ix];
    if (!c) return;
    const price = cratePrice(c, run);
    if (!canAfford(run, price)) { Audio.sfx('error'); say('Not enough coin for that haul.'); return; }
    spend(run, price);
    manifest.splice(ix, 1);
    startDelivery(c);
  }

  function startDelivery(c) {
    crate = c;
    mode = 'deliver';
    seqT = 0;
    landed = false;
    opened = false;
    speedUp = 1;
    landProg = 0;
    revealIx = 0;
    gotItems = [];
    craneAngle = -0.9;
    const cls = BOAT_CLASS[c.boat] || BOAT_CLASS.skiff || { speed: 1 };
    // Scale 2 so the hull is a hero element and a bigger haul visibly needs a bigger
    // boat; the zeppelin flies in above the mast instead of mooring.
    boat = sea.addBoat({
      kind: c.boat || 'skiff', x: 760,
      y: c.boat === 'zeppelin' ? PIER_Y - 96 : PIER_Y - 10,
      scale: 2, flip: true,
    });
    boat.__speed = 260 * (cls.speed || 1);
    cratePos = { x: 0, y: 0 };
    Audio.music('dock');
    Audio.sfx('boat_horn');
    Audio.sfx('boat_engine', { delay: 0.3 });
  }

  function finishDelivery() {
    if (boat) { sea.removeBoat(boat); boat = null; }
    mode = 'browse';
    crate = null;
    Audio.sfx('whoosh');
  }

  /* -------------------------------------------------------------- update */

  function update(dt) {
    t += dt;
    if (msgT > 0) msgT -= dt;
    sea.update(dt);
    parts.update(dt);
    const m = Input.mouse;

    if (mode === 'deliver') { updateDelivery(dt); return; }

    // --- browse interactions
    if (m.pressed) {
      for (let i = 0; i < crateRects.length; i++) {
        if (UI.hover(crateRects[i], m)) { buyCrate(i); return; }
      }
      for (let i = 0; i < cueRects.length; i++) {
        if (UI.hover(cueRects[i], m) && cueOffers[i]) {
          const c = cueOffers[i];
          if (!canAfford(run, c.price)) { Audio.sfx('error'); say('Too dear.'); return; }
          spend(run, c.price); addCue(run, c.id);
          cueOffers.splice(i, 1);
          Audio.sfx('upgrade'); Juice.flash('brass3', 0.18, 0.3);
          parts.emit('star', m.x, m.y, { count: 8, color: 'brass3' });
          say(c.name + ' fitted to the cue.');
          return;
        }
      }
      for (let i = 0; i < feedRects.length; i++) {
        if (UI.hover(feedRects[i], m) && feedOffers[i]) {
          const f = feedOffers[i];
          if (run.feeds.length >= 2) { Audio.sfx('error'); say('Satchel is full (2 max).'); return; }
          if (!canAfford(run, f.price)) { Audio.sfx('error'); say('Too dear.'); return; }
          spend(run, f.price); addFeed(run, f.id);
          feedOffers.splice(i, 1);
          Audio.sfx('coin'); say(f.name + ' stowed.');
          return;
        }
      }
      if (voucherOffer && UI.hover(voucherRect, m)) {
        if (!canAfford(run, voucherOffer.price)) { Audio.sfx('error'); say('Too dear.'); return; }
        spend(run, voucherOffer.price); addVoucher(run, voucherOffer.id);
        Audio.sfx('levelup'); Juice.flash('gold', 0.22, 0.35);
        say(voucherOffer.name + ' signed.');
        voucherOffer = null;
        return;
      }
      if (habitatOffer && UI.hover(habitatRect, m)) {
        if (!canAfford(run, habitatOffer.price)) { Audio.sfx('error'); say('Too dear.'); return; }
        spend(run, habitatOffer.price);
        applyHabitatUpgrade(run, habitatOffer.habitat);
        const hab = HABITAT_BY_ID[habitatOffer.habitat];
        Audio.sfx('levelup');
        parts.emit('star', habitatRect.x + habitatRect.w / 2, habitatRect.y, { count: 10, color: hab ? hab.color : 'gold' });
        say((hab ? hab.name : 'Habitat') + ' improved.');
        habitatOffer = null;
        return;
      }
      if (UI.hover(rerollRect, m)) {
        if (!canAfford(run, rerollCost)) { Audio.sfx('error'); say('No coin for a new manifest.'); return; }
        spend(run, rerollCost);
        rerollCost += 1;
        reroll();
        Audio.sfx('reroll');
        say('New manifest posted.');
        return;
      }
      if (UI.hover(castRect, m)) {
        Audio.sfx('boat_horn');
        if (onDone) onDone();
        return;
      }
    }

    // sell a relic with right-click on the ribbon
    if (m.rightPressed) {
      for (let i = 0; i < relicRects.length; i++) {
        if (UI.hover(relicRects[i], m) && run.relics[i]) {
          const id = run.relics[i].id;
          const v = sellRelic(run, id);
          if (v > 0) {
            sold.add(id);
            Audio.sfx('cash');
            parts.emit('coin', m.x, m.y, { count: 4 });
            say('Sold for $' + v + '.');
          }
          return;
        }
      }
    }

    if (Input.pressed('Escape') || Input.pressed('Enter')) { if (onDone) onDone(); }
  }

  function updateDelivery(dt) {
    // A click anywhere fast-forwards. The delivery is a reward, not a toll booth, and
    // the player sees it two dozen times in a run.
    if (Input.mouse.pressed || Input.pressed('Space') || Input.pressed('Enter')) speedUp = 5;
    dt *= speedUp;
    seqT += dt;
    const dockX = 330;

    // 1. sail in
    if (boat) {
      if (boat.x > dockX) {
        boat.x = Math.max(dockX, boat.x - (boat.__speed || 260) * dt * (boat.x - dockX > 120 ? 1 : 0.7));
        if (seqT % 0.5 < dt) sea.splash(boat.x - 30, boat.y + 6, 0.6);
      } else if (!landed) {
        // 2. crane swings, crate rides the cable down onto the pier. Linear progress
        //    rather than an exponential approach, so it lands at a known time instead
        //    of creeping asymptotically toward the last half-degree.
        landProg = Math.min(1, landProg + dt * 1.7);
        const kk = Ease.inOutQuad(landProg);
        craneAngle = lerp(-0.9, 0.55, kk);
        cratePos.x = lerp(boat.x - 20, LAND_X, kk);
        cratePos.y = lerp(boat.y - 46, PIER_Y + 6, Ease.inQuad(landProg));
        if (seqT % 0.42 < dt) Audio.sfx('crane');
        if (landProg >= 1) {
          landed = true;
          Audio.sfx('crate_land');
          Juice.shake(4, 0.3);
          parts.emit('dust', cratePos.x, cratePos.y + 20, { count: 18, speed: 70, color: 'wood4', spread: Math.PI, angle: Math.PI });
          parts.emit('shard', cratePos.x, cratePos.y + 18, { count: 7, color: 'wood2', floorY: PIER_Y + 26 });
        }
      }
    }

    // 3. burst open, then reveal the contents one at a time
    if (landed && !opened && seqT > 0) {
      opened = true;
      gotItems = deliverCrate(run, crate) || [];
      Audio.sfx('crate_open');
      Juice.flash('white', 0.25, 0.45);
      Juice.chromatic(4, 0.35);
      parts.emit('star', cratePos.x, cratePos.y + 6, { count: 20, speed: 90, color: 'gold' });
      parts.emit('ring', cratePos.x, cratePos.y + 6, { count: 2, color: 'brass3' });
      parts.emit('smoke', cratePos.x, cratePos.y + 8, { count: 4, color: 'grey2', size: 2, speed: 22 });
      seqT = 0;
    }

    if (opened) {
      const per = 0.3;
      const want = Math.min(gotItems.length, Math.floor(seqT / per));
      while (revealIx < want) {
        const it = gotItems[revealIx];
        const tx = it.kind === 'relic' ? 60 + run.relics.length * 14 : 320;
        parts.emit(it.kind === 'money' ? 'coin' : 'chip', cratePos.x, cratePos.y, {
          count: 6, target: { x: tx, y: it.kind === 'relic' ? 8 : 40 },
          color: it.kind === 'money' ? 'brass3' : 'sky',
        });
        parts.emit('score', cratePos.x, cratePos.y - 16 - revealIx * 4, { count: 1, text: it.name, font: 5, color: 'white' });
        Audio.sfx(it.kind === 'money' ? 'coin' : it.kind === 'relic' ? 'sparkle' : 'deal');
        revealIx++;
      }
      if (revealIx >= gotItems.length && seqT > gotItems.length * per + 0.45) {
        if (Input.mouse.pressed || Input.anyPressed() || seqT > gotItems.length * per + 2.4) finishDelivery();
      }
    }
  }

  /* ---------------------------------------------------------------- draw */

  function draw(g) {
    sea.draw(g, { x: 0, y: 0, w: 640, h: 360, horizonY: HORIZON, timeOfDay: 0.5, storm: 0.08, parallax: 0.7, reflect: true });
    drawPier(g);
    parts.draw(g, 'back');

    if (mode === 'deliver') { drawDelivery(g); }
    else { drawBrowse(g); }

    drawRelicRibbon(g);
    parts.draw(g, 'front');

    if (msgT > 0) {
      const w = textW(msg) + 14;
      rect(g, 320 - w / 2, 340, w, 12, 'ink');
      frame(g, 320 - w / 2, 340, w, 12, 'brass1');
      text(g, msg, 320, 343, 'bone', { center: true });
    }
  }

  function drawPier(g) {
    // Decking in the foreground: plank seams spread apart toward the viewer, which is
    // the cheapest honest perspective cue there is.
    const bottom = 360;
    for (let y = PIER_Y; y < bottom; y++) {
      const k = (y - PIER_Y) / (bottom - PIER_Y);
      const c = k < 0.04 ? 'wood4' : k < 0.12 ? 'wood3' : k < 0.55 ? 'wood2' : 'wood1';
      rect(g, 0, y, 640, 1, c);
    }
    // board seams: spacing grows with depth
    let seam = PIER_Y + 6;
    let gap = 5;
    while (seam < bottom) {
      rect(g, 0, Math.round(seam), 640, 1, 'wood1');
      rect(g, 0, Math.round(seam) + 1, 640, 1, 'wood3');
      gap *= 1.32;
      seam += gap;
    }
    // plank ends, also spreading
    for (let x = -40; x < 700; x += 1) {
      // vertical butt joints on a coarse grid, offset per band
      if (((x + 7) % 46) !== 0) continue;
      line(g, x, PIER_Y, x - 26, bottom, 'wood1');
    }
    // the water's edge: a lip, a foam line, and shadow under the boards
    rect(g, 0, PIER_Y, 640, 1, 'wood4');
    rect(g, 0, PIER_Y - 1, 640, 1, 'foam');
    for (let i = 0; i < 4; i++) dither(g, 0, PIER_Y - 2 - i, 640, 1, 'rgba(0,0,0,0)', 'foam', 6 - i * 2);

    // bollards along the edge, with a rope swagged between them
    for (let x = 60; x < 640; x += 150) {
      rect(g, x, PIER_Y - 9, 7, 10, 'grey0');
      rect(g, x, PIER_Y - 10, 7, 2, 'grey1');
      rect(g, x + 1, PIER_Y - 9, 1, 9, 'grey2');
      rect(g, x, PIER_Y - 1, 7, 1, 'ink');
    }
    for (let x = 60; x < 500; x += 150) {
      for (let i = 0; i <= 150; i += 2) {
        const u = i / 150;
        const sag = Math.sin(u * Math.PI) * 7;
        px(g, x + 4 + i, Math.round(PIER_Y - 8 + sag), 'wood3');
      }
    }
    // a crate and a barrel left on the dock, for scale
    rect(g, 470, PIER_Y + 10, 26, 22, 'wood2');
    rect(g, 470, PIER_Y + 10, 26, 2, 'wood4');
    rect(g, 470, PIER_Y + 18, 26, 2, 'brass1');
    boxFrame(g, 470, PIER_Y + 10, 26, 22, 'wood0', 1);
    ellipse(g, 528, PIER_Y + 32, 11, 4, 'wood0');
    rect(g, 518, PIER_Y + 10, 21, 22, 'wood1');
    rect(g, 518, PIER_Y + 14, 21, 2, 'brass1');
    rect(g, 518, PIER_Y + 26, 21, 2, 'brass1');
    ellipse(g, 528, PIER_Y + 10, 11, 4, 'wood3');

    drawCrane(g, 208, mode === 'deliver' ? craneAngle : -0.9);
  }

  function drawCrane(g, bx, ang) {
    const topY = PIER_Y - 104;
    const baseY = PIER_Y + 16;
    // lattice mast
    rect(g, bx - 4, topY, 9, baseY - topY, 'grey0');
    rect(g, bx - 4, topY, 1, baseY - topY, 'grey2');
    rect(g, bx + 4, topY, 1, baseY - topY, 'ink');
    for (let i = 0; i < baseY - topY - 8; i += 9) {
      line(g, bx - 3, topY + i, bx + 4, topY + i + 9, 'grey1');
      line(g, bx + 4, topY + i, bx - 3, topY + i + 9, 'grey1');
    }
    // footing bolted to the deck
    rect(g, bx - 11, baseY - 4, 23, 5, 'grey0');
    rect(g, bx - 11, baseY - 5, 23, 1, 'grey2');
    for (let i = 0; i < 5; i++) px(g, bx - 8 + i * 4, baseY - 3, 'brass2');

    // jib
    const len = 112;
    const ex = Math.round(bx + Math.cos(ang) * len);
    const ey = Math.round(topY + 6 + Math.sin(ang) * len * 0.3);
    line(g, bx, topY + 5, ex, ey, 'grey2');
    line(g, bx, topY + 7, ex, ey + 2, 'grey0');
    for (let i = 1; i < 9; i++) {
      const u = i / 9;
      line(g, Math.round(lerp(bx, ex, u)), Math.round(lerp(topY + 6, ey + 1, u)),
        Math.round(lerp(bx, ex, u - 0.06)), Math.round(lerp(topY + 8, ey + 3, u - 0.06)), 'grey1');
    }
    // stay wire back to the mast head and a counterweight
    line(g, bx, topY - 4, ex, ey - 1, 'grey0');
    rect(g, Math.round(bx - Math.cos(ang) * 20) - 4, Math.round(topY + 2 - Math.sin(ang) * 6), 9, 10, 'grey0');
    rect(g, Math.round(bx - Math.cos(ang) * 20) - 4, Math.round(topY + 2 - Math.sin(ang) * 6), 9, 1, 'grey1');
    // warning stripe at the head
    px(g, bx, topY - 2, 'red2'); px(g, bx + 1, topY - 3, 'gold');

    // cable + hook, while the crate is still in the air
    if (mode === 'deliver' && !opened && cratePos.x) {
      dashLine(g, ex, ey, Math.round(cratePos.x), Math.round(cratePos.y) - 12, 'grey2', 2, 1);
      rect(g, Math.round(cratePos.x) - 3, Math.round(cratePos.y) - 14, 7, 4, 'grey1');
      rect(g, Math.round(cratePos.x) - 3, Math.round(cratePos.y) - 14, 7, 1, 'grey2');
    }
  }

  /* --------------------------------------------------------------- browse */

  function drawBrowse(g) {
    const m = Input.mouse;
    const nb = nextBlindLabel();

    // header
    UI.panel(g, 4, 18, 632, 22, { style: 'wood', shadow: true, rivets: true });
    text(g, 'THE DOCK', 12, 22, 'brass3', { shadow: 'ink', font: 7 });
    UI.divider(g, 74, 23, 2, { pip: false });
    text(g, `NEXT — ANTE ${run.ante} ${nb.name.toUpperCase()}`, 92, 22, nb.color, { font: 3 });
    text(g, `target ${nb.target}`, 92, 30, 'grey2', { font: 3 });
    UI.moneyPill(g, 240, 23, run.money, {});
    const cb = caravanBreakdown(run);
    text(g, `${cb.total} animals aboard`, 320, 22, 'bone', { font: 3 });
    text(g, `${run.relics.length}/${run.relicSlots} relics · ${run.feeds.length}/2 feed`, 320, 30, 'grey2', { font: 3 });
    text(g, run.seed, 630, 26, 'wood3', { font: 3, right: true });

    // ---- manifest board
    UI.panel(g, 132, 46, 376, 12, { style: 'brass', corners: false });
    text(g, 'CARGO MANIFEST — CHOOSE ONE', 320, 48, 'wood0', { font: 3, center: true });

    crateRects.length = 0;
    const cw = 120, gap = 8;
    const startX = 320 - ((manifest.length * cw + (manifest.length - 1) * gap) / 2);
    manifest.forEach((c, i) => {
      const x = Math.round(startX + i * (cw + gap));
      const y = 62;
      const r = UI.rectOf(x, y, cw, 168);
      crateRects.push(r);
      const hov = UI.hover(r, m);
      const price = cratePrice(c, run);
      const afford = canAfford(run, price);
      drawCrateCard(g, x, y, cw, 168, c, price, hov, afford);
      if (hov) {
        UI.tooltip(g, x + cw + 4, y + 40, {
          title: c.name, w: 130, color: UI.RARITY_COLOR[c.rarity] || 'grey2',
          lines: (crateSummary(c) || []).concat([`arrives by ${(BOAT_CLASS[c.boat] || {}).name || c.boat}`]),
        });
      }
    });
    if (!manifest.length) {
      text(g, 'the board is bare — reroll or cast off', 320, 140, 'grey1', { font: 3, center: true });
    }

    // ---- left stalls: chandler + feed
    UI.panel(g, 4, 46, 122, 184, { style: 'wood', shadow: true, title: 'CHANDLER' });
    cueRects.length = 0;
    cueOffers.forEach((c, i) => {
      const r = UI.rectOf(10, 62 + i * 52, 110, 46);
      cueRects.push(r);
      const hov = UI.hover(r, m);
      UI.card(g, r.x, r.y, r.w, r.h, {
        title: c.name, lines: [c.desc], icon: c.icon || 'cue', price: c.price,
        rarity: 'uncommon', hover: hov, color: canAfford(run, c.price) ? 'brass2' : 'grey0',
      });
      if (hov) {
        UI.tooltip(g, r.x + r.w + 4, r.y, {
          title: c.name, w: 150, color: 'brass3',
          lines: wrap(c.desc, 142, { font: 3 }).concat([`$${c.price}`]),
        });
      }
    });
    UI.divider(g, 8, 160, 114, {});
    text(g, 'FEED STORE', 12, 164, 'brass2', { font: 3 });
    feedRects.length = 0;
    feedOffers.forEach((f, i) => {
      const r = UI.rectOf(10, 174 + i * 27, 110, 24);
      feedRects.push(r);
      const hov = UI.hover(r, m);
      rect(g, r.x, r.y, r.w, r.h, hov ? 'deep' : 'shadow');
      boxFrame(g, r.x, r.y, r.w, r.h, hov ? 'green1' : 'ink', 1);
      UI.icon(g, f.icon || 'hay', r.x + 3, r.y + 3, { color: 'green1' });
      text(g, f.name, r.x + 15, r.y + 3, 'bone', { font: 3 });
      text(g, '$' + f.price, r.x + r.w - 4, r.y + 3, canAfford(run, f.price) ? 'brass3' : 'red2', { font: 3, right: true });
      text(g, String(f.desc).slice(0, 26), r.x + 15, r.y + 12, 'grey2', { font: 3 });
      if (hov) {
        UI.tooltip(g, r.x + r.w + 4, r.y - 8, {
          title: f.name, w: 140, color: 'green1',
          lines: wrap(f.desc, 132, { font: 3 }).concat([`$${f.price}` + (f.charges > 1 ? ` · ${f.charges} uses` : '')]),
        });
      }
    });

    // ---- right stalls: harbourmaster + habitat works + census
    UI.panel(g, 514, 46, 122, 184, { style: 'wood', shadow: true, title: 'HARBOUR' });
    if (voucherOffer) {
      voucherRect = UI.rectOf(520, 62, 110, 52);
      const hov = UI.hover(voucherRect, m);
      UI.card(g, voucherRect.x, voucherRect.y, voucherRect.w, voucherRect.h, {
        title: voucherOffer.name, lines: [voucherOffer.desc], icon: voucherOffer.icon || 'scroll',
        price: voucherOffer.price, rarity: 'rare', hover: hov,
      });
    } else {
      voucherRect = UI.rectOf(0, 0, 0, 0);
      text(g, 'no papers today', 575, 76, 'grey1', { font: 3, center: true });
    }

    UI.divider(g, 518, 118, 114, {});
    text(g, 'HABITAT WORKS', 522, 122, 'brass2', { font: 3 });
    if (habitatOffer) {
      habitatRect = UI.rectOf(520, 130, 110, 40);
      const hov = UI.hover(habitatRect, m);
      const hab = HABITAT_BY_ID[habitatOffer.habitat];
      rect(g, habitatRect.x, habitatRect.y, habitatRect.w, habitatRect.h, hov ? 'deep' : 'shadow');
      boxFrame(g, habitatRect.x, habitatRect.y, habitatRect.w, habitatRect.h, hov ? (hab ? hab.color : 'gold') : 'ink', 1);
      if (hab) UI.icon(g, hab.icon, habitatRect.x + 4, habitatRect.y + 4, { color: hab.color });
      text(g, habitatOffer.name, habitatRect.x + 16, habitatRect.y + 4, 'bone', { font: 3 });
      wrap(habitatOffer.desc, 100, { font: 3 }).slice(0, 2).forEach((l, i) => text(g, l, habitatRect.x + 4, habitatRect.y + 15 + i * 6, 'grey2', { font: 3 }));
      text(g, '$' + habitatOffer.price, habitatRect.x + habitatRect.w - 4, habitatRect.y + 4, canAfford(run, habitatOffer.price) ? 'brass3' : 'red2', { font: 3, right: true });
    } else habitatRect = UI.rectOf(0, 0, 0, 0);

    // habitat levels strip
    let hy = 176;
    text(g, 'GATE LEVELS', 522, hy, 'brass2', { font: 3 });
    hy += 8;
    HABITATS.forEach((h, i) => {
      const lx = 520 + (i % 3) * 38, ly = hy + Math.floor(i / 3) * 12;
      const lvl = habitatLevel(run, h.id);
      UI.icon(g, h.icon, lx, ly, { color: lvl > 0 ? h.color : 'grey0' });
      text(g, lvl > 0 ? '+' + lvl : '·', lx + 11, ly + 2, lvl > 0 ? 'brass3' : 'grey0', { font: 3 });
    });

    // ---- bottom bar
    UI.panel(g, 4, 300, 632, 34, { style: 'wood', shadow: true });
    rerollRect = UI.rectOf(12, 306, 100, 22);
    UI.button(g, rerollRect, 'REROLL', {
      state: canAfford(run, rerollCost) ? (UI.hover(rerollRect, m) ? 'hover' : 'idle') : 'disabled',
      color: 'wood2', icon: 'dice', sub: '$' + rerollCost, small: true,
    });
    castRect = UI.rectOf(520, 306, 108, 22);
    UI.button(g, castRect, 'CAST OFF', {
      state: UI.hover(castRect, m) ? 'hover' : 'idle', color: 'green0', icon: 'anchor',
    });
    text(g, 'click a crate to buy it · right-click a relic to sell it · ENTER to cast off',
      320, 314, 'wood3', { font: 3, center: true });

    // A single row of the caravan, clear of the pier decking — it is what the crates
    // are for, so it belongs on screen while you are choosing one.
    const uniq = Array.from(new Set(run.caravan)).slice(0, 38);
    text(g, 'ABOARD', 136, 234, 'brass2', { font: 3 });
    uniq.slice(0, 36).forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (!a) return;
      drawAnimalIcon(g, a, 182 + i * 12, 241, { scale: 1 });
    });
  }

  function drawCrateCard(g, x, y, w, h, c, price, hov, afford) {
    const rc = UI.RARITY_COLOR[c.rarity] || 'grey2';
    if (hov) wash(g, x - 2, y - 2, w + 4, h + 4, rc, 0.25);
    UI.panel(g, x, y, w, h, { style: 'slate', shadow: true, corners: false });
    rect(g, x + 2, y + 2, w - 4, 2, rc);

    // the crate itself, stencilled
    const cx = x + w / 2, cy = y + 46;
    const cs = 30;
    drawCrateArt(g, cx - cs, cy - cs / 2, cs * 2, cs, c, hov ? Math.round(Math.sin(t * 6) * 1) : 0);

    text(g, c.name, cx, y + 74, 'white', { center: true, shadow: 'ink', font: 7 });
    UI.starRow(g, cx - (UI.RARITY_STARS[c.rarity] || 1) * 4, y + 86, UI.RARITY_STARS[c.rarity] || 1, { color: rc });

    const lines = crateSummary(c) || [];
    let ly = y + 100;
    for (const l of lines) {
      for (const seg of wrap(String(l), w - 12, { font: 3 })) {
        if (ly > y + h - 30) break;
        text(g, '· ' + seg, x + 6, ly, 'grey2', { font: 3 });
        ly += 7;
      }
    }
    if (c.blurb) {
      wrap(c.blurb, w - 12, { font: 3 }).slice(0, 2).forEach((l, i) => text(g, l, x + 6, y + h - 28 + i * 6, 'grey1', { font: 3 }));
    }

    UI.moneyPill(g, x + 5, y + h - 15, price, {});
    const bc = (BOAT_CLASS[c.boat] || {});
    UI.icon(g, c.boat === 'zeppelin' ? 'cloud' : 'boat', x + w - 14, y + h - 14, { color: afford ? 'sky' : 'grey0' });
    void bc;
    boxFrame(g, x, y, w, h, hov ? rc : 'ink', 2);
    if (!afford) {
      // a diagonal "beyond your means" hatch, not a grey-out — you can still read it
      for (let i = 0; i < h; i += 4) dither(g, x + 2, y + i, w - 4, 1, 'rgba(0,0,0,0)', 'ink', 8);
      text(g, 'TOO DEAR', cx, y + h / 2 - 4, 'red2', { center: true, outline: 'ink' });
    }
  }

  function drawCrateArt(g, x, y, w, h, c, bob) {
    y += bob;
    const bodyC = (c.art && c.art.crate) || 'wood2';
    const bandC = (c.art && c.art.band) || 'brass2';
    rect(g, x, y, w, h, bodyC);
    rect(g, x, y, w, 2, mix(col(bodyC), P.white, 0.35));
    rect(g, x, y + h - 2, w, 2, mix(col(bodyC), P.ink, 0.4));
    // plank seams + diagonal bracing
    for (let i = 6; i < w; i += 9) rect(g, x + i, y, 1, h, mix(col(bodyC), P.ink, 0.3));
    line(g, x + 2, y + h - 3, x + w - 3, y + 2, mix(col(bodyC), P.white, 0.18));
    // steel bands
    rect(g, x, y + 3, w, 2, bandC);
    rect(g, x, y + h - 6, w, 2, bandC);
    for (let i = 2; i < w; i += 12) { px(g, x + i, y + 3, 'brass3'); px(g, x + i, y + h - 6, 'brass3'); }
    boxFrame(g, x, y, w, h, 'wood0', 1);
    // stencil
    const st = (c.art && c.art.stencil) || 'crate';
    const s = 2;
    UI.icon(g, UI.hasIcon(st) ? st : 'crate', Math.round(x + w / 2 - 9), Math.round(y + h / 2 - 9), { color: 'bone', scale: s });
  }

  /* ------------------------------------------------------------- delivery */

  function drawDelivery(g) {
    // dim the dockside furniture so the eye goes to the boat
    wash(g, 0, 16, 640, 30, 'ink', 0.5);
    text(g, 'INBOUND', 320, 20, 'brass3', { center: true, outline: 'ink', font: 7 });
    text(g, crate ? crate.name : '', 320, 34, 'bone', { font: 3, center: true });

    if (boat) drawBoat(g, boat, t);

    if (crate && !opened && cratePos.x) {
      drawCrateArt(g, Math.round(cratePos.x) - 22, Math.round(cratePos.y) - 14, 44, 28, crate, 0);
    }

    if (opened && crate) {
      // burst-open crate: lid tilted off, light spilling upward
      const bx = Math.round(cratePos.x), by = Math.round(cratePos.y);
      // A narrow beam that widens a little and thins out fast. A wide solid column
      // reads as a tan pyramid sitting on the deck, not as light.
      for (let i = 0; i < 34; i++) {
        const ww = 14 + Math.round(i * 0.55);
        const lvl = Math.max(0, 7 - Math.round(i / 4));
        if (lvl <= 0) break;
        dither(g, bx - Math.round(ww / 2), by - 14 - i, ww, 1, 'rgba(0,0,0,0)',
          i < 10 ? 'white' : 'brass3', lvl);
      }
      drawCrateArt(g, bx - 22, by - 8, 44, 22, crate, 0);
      // the lid, knocked clear and leaning on the deck
      rect(g, bx + 12, by - 18, 30, 5, 'wood3');
      rect(g, bx + 12, by - 18, 30, 1, 'wood4');
      rect(g, bx + 12, by - 13, 30, 1, 'wood0');

      // the manifest of what you actually got
      const panelH = 24 + Math.min(gotItems.length, 6) * 11;
      UI.panel(g, 396, 118, 210, panelH, { style: 'brass', shadow: true, title: 'UNLOADED' });
      gotItems.slice(0, 6).forEach((it, i) => {
        if (i >= revealIx) return;
        const iy = 136 + i * 11;
        const ic = it.kind === 'relic' ? 'gem' : it.kind === 'animal' ? 'paw'
          : it.kind === 'money' ? 'coin' : it.kind === 'cue' ? 'cue'
            : it.kind === 'feed' ? 'hay' : it.kind === 'voucher' ? 'scroll' : 'plus';
        UI.icon(g, ic, 404, iy, { color: 'wood0' });
        if (it.kind === 'animal' && ANIMAL_BY_ID[it.ref]) drawAnimalIcon(g, ANIMAL_BY_ID[it.ref], 420, iy + 4, { scale: 1 });
        text(g, it.name, it.kind === 'animal' ? 428 : 416, iy + 1, 'wood0', { font: 3 });
      });
      if (gotItems.length > 6) text(g, `+${gotItems.length - 6} more`, 596, 122 + panelH - 12, 'wood0', { font: 3, right: true });
      if (revealIx >= gotItems.length && Math.floor(t * 2) % 2 === 0) {
        text(g, 'CLICK TO CONTINUE', 501, 122 + panelH + 6, 'white', { font: 3, center: true, outline: 'ink' });
      }
    } else if (crate) {
      if (Math.floor(t * 3) % 2 === 0) text(g, 'CLICK TO HURRY', 320, 336, 'foam', { font: 3, center: true, outline: 'ink' });
    }
  }

  /* ------------------------------------------------------------- ribbon */

  function drawRelicRibbon(g) {
    rect(g, 0, 0, 640, 15, 'wood1');
    rect(g, 0, 14, 640, 1, 'wood0');
    rect(g, 0, 0, 640, 1, 'wood3');
    text(g, 'RELICS', 4, 4, 'brass2', { font: 3 });
    relicRects.length = 0;
    let x = 34;
    for (const relic of run.relics) {
      const rc = UI.RARITY_COLOR[relic.rarity] || 'grey2';
      const r = UI.rectOf(x, 2, 12, 11);
      relicRects.push(r);
      rect(g, x, 2, 12, 11, 'ink');
      frame(g, x, 2, 12, 11, rc);
      UI.icon(g, (relic.art && relic.art.icon) || 'gem', x + 2, 3, { color: (relic.art && relic.art.fg) || rc });
      if (UI.hover(r, Input.mouse)) {
        UI.tooltip(g, x, 16, {
          title: relic.name, color: rc, w: 150,
          lines: wrap(relic.desc, 140, { font: 3 }).concat([`right-click to sell for $${Math.max(1, Math.floor((relic.price || 4) / 2) + (run.sellBonus || 0))}`]),
        });
      }
      x += 14;
    }
    for (let i = run.relics.length; i < run.relicSlots; i++) {
      rect(g, x, 2, 12, 11, 'shadow');
      boxFrame(g, x, 2, 12, 11, 'wood0', 0);
      x += 14;
    }
  }

  /* --------------------------------------------------------------- scene */

  return {
    enter(args, api) {
      run = args.run; onDone = args.onDone; app = api;
      sea = createSeascape(run.seed + '/dock', {});
      parts = createParticles({ limit: 700, seed: run.seed + '/dockparts' });
      t = 0; mode = 'browse'; sold = new Set();
      rerollCost = Math.max(1, run.rerollCost || 3);
      reroll(true);
      Audio.music('dock');
      Audio.sfx('gull');
      void app;
    },
    exit() { Audio.stopMusic(0.4); },
    update, draw,

    /** Testing + console seam. */
    debug() {
      return {
        mode, seqT, revealIx, gotItems, run, manifest,
        rects: { crates: crateRects, cast: castRect, reroll: rerollRect, cues: cueRects, feeds: feedRects },
      };
    },
  };
}

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
const PIER_Y = 250;

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
  let landed = false;
  let opened = false;

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
    revealIx = 0;
    gotItems = [];
    craneAngle = -0.9;
    const cls = BOAT_CLASS[c.boat] || BOAT_CLASS.skiff || { speed: 1 };
    boat = sea.addBoat({ kind: c.boat || 'skiff', x: 720, y: c.boat === 'zeppelin' ? 150 : 214, scale: 1, flip: true });
    boat.__speed = 120 * (cls.speed || 1);
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
    seqT += dt;
    const dockX = 220;

    // 1. sail in
    if (boat) {
      if (boat.x > dockX) {
        boat.x = Math.max(dockX, boat.x - (boat.__speed || 120) * dt * (boat.x - dockX > 120 ? 1 : 0.45));
        if (seqT % 0.5 < dt) sea.splash(boat.x - 30, boat.y + 6, 0.6);
      } else if (!landed) {
        // 2. crane swings, crate rides the cable down onto the pier
        craneAngle = approach(craneAngle, 0.55, 2.4, dt);
        const kk = clamp((craneAngle + 0.9) / 1.45, 0, 1);
        cratePos.x = lerp(boat.x - 6, dockX - 84, Ease.inOutQuad(kk));
        cratePos.y = lerp(boat.y - 26, PIER_Y - 26, Ease.inQuad(kk));
        if (seqT > 1.1 && seqT % 0.42 < dt) Audio.sfx('crane');
        if (kk > 0.985) {
          landed = true;
          Audio.sfx('crate_land');
          Juice.shake(4, 0.3);
          parts.emit('dust', cratePos.x, cratePos.y + 24, { count: 16, speed: 60, color: 'wood4', spread: Math.PI, angle: Math.PI });
          parts.emit('shard', cratePos.x, cratePos.y + 22, { count: 6, color: 'wood2', floorY: PIER_Y });
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
      parts.emit('smoke', cratePos.x, cratePos.y + 10, { count: 8, color: 'bone' });
      seqT = 0;
    }

    if (opened) {
      const per = 0.42;
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
      if (revealIx >= gotItems.length && seqT > gotItems.length * per + 0.6) {
        if (Input.mouse.pressed || Input.anyPressed() || seqT > gotItems.length * per + 6) finishDelivery();
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
    // decking
    for (let i = 0; i < 22; i++) {
      const y = PIER_Y + i;
      rect(g, 0, y, 640, 1, i < 2 ? 'wood4' : i < 6 ? 'wood3' : i < 14 ? 'wood2' : 'wood1');
    }
    for (let x = 0; x < 640; x += 14) rect(g, x, PIER_Y, 1, 22, 'wood1');
    rect(g, 0, PIER_Y, 640, 1, 'wood4');
    // pilings dropping into the water
    for (let x = 26; x < 640; x += 96) {
      rect(g, x, PIER_Y + 22, 5, 40, 'wood1');
      rect(g, x, PIER_Y + 22, 1, 40, 'wood2');
      dither(g, x - 1, PIER_Y + 46, 7, 6, 'rgba(0,0,0,0)', 'water0', 8);
    }
    // bollards + rope
    for (let x = 70; x < 640; x += 180) {
      rect(g, x, PIER_Y - 8, 6, 8, 'grey0');
      rect(g, x, PIER_Y - 9, 6, 2, 'grey1');
      rect(g, x + 1, PIER_Y - 8, 1, 8, 'grey2');
    }
    for (let x = 70; x < 460; x += 180) {
      for (let i = 0; i <= 180; i += 3) {
        const u = i / 180;
        const sag = Math.sin(u * Math.PI) * 6;
        px(g, x + 3 + i, PIER_Y - 7 + sag, 'wood3');
      }
    }
    // crane gantry at the delivery point
    drawCrane(g, 220, mode === 'deliver' ? craneAngle : -0.9);
  }

  function drawCrane(g, bx, ang) {
    const topY = PIER_Y - 76;
    rect(g, bx - 3, topY, 7, 76, 'grey0');
    rect(g, bx - 3, topY, 1, 76, 'grey2');
    rect(g, bx - 8, PIER_Y - 6, 17, 6, 'grey0');
    for (let i = 0; i < 6; i++) px(g, bx - 6 + i * 3, PIER_Y - 4, 'brass2');
    // lattice
    for (let i = 0; i < 70; i += 8) {
      line(g, bx - 3, topY + i, bx + 3, topY + i + 8, 'grey1');
      line(g, bx + 3, topY + i, bx - 3, topY + i + 8, 'grey1');
    }
    // jib
    const len = 96;
    const ex = Math.round(bx + Math.cos(ang) * len);
    const ey = Math.round(topY + 4 + Math.sin(ang) * len * 0.34);
    line(g, bx, topY + 4, ex, ey, 'grey2');
    line(g, bx, topY + 6, ex, ey + 2, 'grey0');
    for (let i = 0; i < 8; i++) {
      const u = i / 8;
      px(g, Math.round(lerp(bx, ex, u)), Math.round(lerp(topY + 5, ey + 1, u)), 'grey1');
    }
    // counterweight
    rect(g, Math.round(bx - Math.cos(ang) * 16) - 3, Math.round(topY + 2 - Math.sin(ang) * 5), 7, 8, 'grey0');
    // cable to the crate while it is in flight
    if (mode === 'deliver' && !opened && cratePos.x) {
      dashLine(g, ex, ey, Math.round(cratePos.x), Math.round(cratePos.y) - 10, 'grey2', 2, 1);
      rect(g, Math.round(cratePos.x) - 2, Math.round(cratePos.y) - 12, 5, 3, 'grey1');
    }
  }

  /* --------------------------------------------------------------- browse */

  function drawBrowse(g) {
    const m = Input.mouse;
    const nb = nextBlindLabel();

    // header
    UI.panel(g, 4, 18, 632, 22, { style: 'wood', shadow: true, rivets: true });
    text(g, 'THE DOCK', 12, 24, 'brass3', { shadow: 'ink' });
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
      const r = UI.rectOf(x, y, cw, 180);
      crateRects.push(r);
      const hov = UI.hover(r, m);
      const price = cratePrice(c, run);
      const afford = canAfford(run, price);
      drawCrateCard(g, x, y, cw, 180, c, price, hov, afford);
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
    UI.panel(g, 4, 46, 122, 196, { style: 'wood', shadow: true, title: 'CHANDLER' });
    cueRects.length = 0;
    cueOffers.forEach((c, i) => {
      const r = UI.rectOf(10, 62 + i * 52, 110, 46);
      cueRects.push(r);
      const hov = UI.hover(r, m);
      UI.card(g, r.x, r.y, r.w, r.h, {
        title: c.name, lines: [c.desc], icon: c.icon || 'cue', price: c.price,
        rarity: 'uncommon', hover: hov, color: canAfford(run, c.price) ? 'brass2' : 'grey0',
      });
    });
    UI.divider(g, 8, 168, 114, {});
    text(g, 'FEED STORE', 12, 172, 'brass2', { font: 3 });
    feedRects.length = 0;
    feedOffers.forEach((f, i) => {
      const r = UI.rectOf(10, 182 + i * 28, 110, 24);
      feedRects.push(r);
      const hov = UI.hover(r, m);
      rect(g, r.x, r.y, r.w, r.h, hov ? 'deep' : 'shadow');
      boxFrame(g, r.x, r.y, r.w, r.h, hov ? 'green1' : 'ink', 1);
      UI.icon(g, f.icon || 'hay', r.x + 3, r.y + 3, { color: 'green1' });
      text(g, f.name, r.x + 15, r.y + 3, 'bone', { font: 3 });
      text(g, '$' + f.price, r.x + r.w - 4, r.y + 3, canAfford(run, f.price) ? 'brass3' : 'red2', { font: 3, right: true });
      text(g, String(f.desc).slice(0, 26), r.x + 15, r.y + 12, 'grey2', { font: 3 });
    });

    // ---- right stalls: harbourmaster + habitat works + census
    UI.panel(g, 514, 46, 122, 196, { style: 'wood', shadow: true, title: 'HARBOUR' });
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

    UI.divider(g, 518, 120, 114, {});
    text(g, 'HABITAT WORKS', 522, 124, 'brass2', { font: 3 });
    if (habitatOffer) {
      habitatRect = UI.rectOf(520, 134, 110, 40);
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
    let hy = 180;
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

    // caravan strip so purchases feel like they land somewhere
    const uniq = Array.from(new Set(run.caravan)).slice(0, 44);
    uniq.forEach((id, i) => {
      const a = ANIMAL_BY_ID[id];
      if (!a) return;
      drawAnimalIcon(g, a, 130 + (i % 30) * 12, 246 + Math.floor(i / 30) * 12, { scale: 1 });
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

    text(g, c.name, cx, y + 76, 'white', { center: true, shadow: 'ink' });
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
    text(g, 'INBOUND', 320, 22, 'brass3', { center: true, outline: 'ink' });
    text(g, crate ? crate.name : '', 320, 34, 'bone', { font: 3, center: true });

    if (boat) drawBoat(g, boat, t);

    if (crate && !opened && cratePos.x) {
      drawCrateArt(g, Math.round(cratePos.x) - 16, Math.round(cratePos.y) - 10, 32, 20, crate, 0);
    }

    if (opened && crate) {
      // burst-open crate: lid tilted off, light spilling upward
      const bx = Math.round(cratePos.x), by = Math.round(cratePos.y);
      for (let i = 0; i < 26; i++) {
        const ww = 30 - i;
        if (ww <= 0) break;
        dither(g, bx - Math.round(ww / 2), by - 12 - i, ww, 1, 'rgba(0,0,0,0)', 'brass3', Math.max(0, 11 - Math.round(i / 2)));
      }
      drawCrateArt(g, bx - 16, by - 6, 32, 16, crate, 0);
      rect(g, bx + 8, by - 14, 22, 4, 'wood3');
      rect(g, bx + 8, by - 14, 22, 1, 'wood4');

      // the manifest of what you actually got
      const panelH = 24 + Math.min(gotItems.length, 6) * 11;
      UI.panel(g, 380, 96, 200, panelH, { style: 'brass', shadow: true, title: 'UNLOADED' });
      gotItems.slice(0, 6).forEach((it, i) => {
        if (i >= revealIx) return;
        const iy = 114 + i * 11;
        const ic = it.kind === 'relic' ? 'gem' : it.kind === 'animal' ? 'paw'
          : it.kind === 'money' ? 'coin' : it.kind === 'cue' ? 'cue'
            : it.kind === 'feed' ? 'hay' : it.kind === 'voucher' ? 'scroll' : 'plus';
        UI.icon(g, ic, 388, iy, { color: 'wood0' });
        if (it.kind === 'animal' && ANIMAL_BY_ID[it.ref]) drawAnimalIcon(g, ANIMAL_BY_ID[it.ref], 404, iy + 4, { scale: 1 });
        text(g, it.name, it.kind === 'animal' ? 412 : 400, iy + 1, 'wood0', { font: 3 });
      });
      if (gotItems.length > 6) text(g, `+${gotItems.length - 6} more`, 570, 100 + panelH - 12, 'wood0', { font: 3, right: true });
      if (revealIx >= gotItems.length) {
        if (Math.floor(t * 2) % 2 === 0) text(g, 'CLICK TO CONTINUE', 480, 96 + panelH + 6, 'white', { font: 3, center: true, outline: 'ink' });
      }
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
  };
}

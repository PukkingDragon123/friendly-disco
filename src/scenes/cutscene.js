// Dialogue and cutscenes.
//
// One scene plays any script from src/data/story.js: a seascape behind, a live portrait
// beside a timber dialogue board, text typed out a character at a time, and a per-line
// effect (lightning, rain, a wave, a burst of rays). Click, tap, space or enter advances;
// on a line still typing it finishes the line first, which is the interaction every
// dialogue box in every game has trained players to expect.

import { P, col, mix } from '../core/palette.js';
import {
  rect, frame, box, boxFrame, px, line, disc, ring, ellipse, tri,
  dither, vgrad, text, textW, wrap, wash, clamp, lerp, W, H,
} from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Juice, Ease, approach } from '../core/juice.js';
import { Audio } from '../core/audio.js';
import { createParticles } from '../core/particles.js';
import { createSeascape } from '../render/seascape.js';
import { drawPortrait, drawCherub } from '../render/portraits.js';
import * as UI from '../render/uikit.js';
import { SPEAKERS } from '../data/story.js';

const CPS = 46;              // characters per second
// 960x540: the portrait gets a real 176x252 frame on the left and the board takes the
// rest of the width. At 640 the portrait was 104x132 and the faces were mush.
const PORT_X = 34, PORT_Y = 126, PORT_W = 176, PORT_H = 252;
const BOX_X = 228, BOX_W = W - BOX_X - 30;

export function makeCutscene() {
  let script = null, onDone = null;
  let sea = null, parts = null;
  let t = 0;
  let ix = 0;
  let typed = 0;
  let lineT = 0;
  let done = false;
  let fade = 0;              // 0 in, 1 fully visible
  let outT = -1;             // >=0 once we are leaving
  let storm = 0, tod = 0.3;
  let shownFx = -1;
  let lightning = 0;

  function cur() { return script && script.lines ? script.lines[ix] : null; }
  function speaker(who) {
    const s = SPEAKERS[who] || SPEAKERS.god;
    if (who === 'disaster' && script && script.boss) {
      return { name: script.boss.name.toUpperCase(), portrait: 'disaster', color: script.boss.color || s.color, tint: 'white' };
    }
    return s;
  }
  function lineText() { const l = cur(); return l ? String(l.text) : ''; }
  function fullyTyped() { return typed >= lineText().length; }

  function fireFx(l) {
    if (!l || !l.fx) return;
    switch (l.fx) {
      case 'lightning':
        lightning = 0.5;
        Juice.flash('white', 0.12, 0.75);
        Juice.shake(3.5, 0.35);
        Audio.sfx('boss_sting');
        break;
      case 'flash':
        Juice.flash('brass3', 0.3, 0.4);
        Audio.sfx('sparkle');
        break;
      case 'shake':
        Juice.shake(4, 0.5);
        Audio.sfx('crate_land');
        break;
      case 'rain':
        storm = Math.min(1, storm + 0.3);
        Audio.sfx('wave');
        break;
      case 'wave':
        storm = Math.min(1, storm + 0.2);
        sea.splash(120 + (t * 90) % 400, 250, 1.4);
        Audio.sfx('splash');
        break;
      case 'rays':
        for (let i = 0; i < 14; i++) {
          parts.emit('star', 40 + i * 42, 40 + (i % 3) * 26, { count: 1, color: 'gold', life: 1.4 });
        }
        Audio.sfx('levelup');
        break;
      default: break;
    }
  }

  function advance() {
    if (!fullyTyped()) { typed = lineText().length; Audio.sfx('click'); return; }
    if (ix >= script.lines.length - 1) { leave(); return; }
    ix++; typed = 0; lineT = 0; shownFx = -1;
    Audio.sfx('deal', { vol: 0.5 });
  }

  function leave() {
    if (outT >= 0) return;
    outT = 0;
    Audio.sfx('whoosh');
  }

  function update(dt) {
    t += dt;
    lineT += dt;
    sea.update(dt);
    parts.update(dt);
    fade = approach(fade, 1, 5, dt);
    if (lightning > 0) lightning -= dt;

    if (outT >= 0) {
      outT += dt;
      if (outT > 0.42) { done = true; if (onDone) { const f = onDone; onDone = null; f(); } }
      return;
    }

    const l = cur();
    if (l && shownFx !== ix) { shownFx = ix; fireFx(l); }

    const len = lineText().length;
    if (typed < len) {
      const prev = typed;
      typed = Math.min(len, typed + dt * CPS);
      // one soft blip every few characters, skipping spaces
      if (Math.floor(typed / 3) !== Math.floor(prev / 3)) {
        const ch = lineText()[Math.floor(typed) - 1];
        if (ch && ch !== ' ') Audio.sfx('tick', { vol: 0.28, rate: 0.9 + (Math.floor(typed) % 5) * 0.05 });
      }
    }

    const m = Input.mouse;
    if (m.pressed || Input.pressed('Space') || Input.pressed('Enter') || Input.pressed('KeyZ')) advance();
    if (Input.pressed('Escape')) leave();
  }

  /* ----------------------------------------------------------------- draw */

  function draw(g) {
    sea.draw(g, {
      x: 0, y: 0, w: W, h: H, horizonY: 196,
      timeOfDay: tod, storm, parallax: 0.5, reflect: true,
    });

    // the ark, small and far off, so the dialogue has somewhere to be about
    drawFarArk(g, 700, 290 + Math.round(Math.sin(t * 0.8) * 2));

    if (lightning > 0) {
      const k = lightning / 0.5;
      wash(g, 0, 0, W, 196, 'white', 0.25 * k);
      // a forked bolt, redrawn on a coarse time step so it flickers rather than crawls
      const seed = Math.floor(t * 12);
      let bx = 130 + (seed * 97) % 700, by = 10;
      for (let i = 0; i < 22 && by < 194; i++) {
        const nx = bx + (((seed + i) * 131) % 27) - 13;
        const ny = by + 8 + ((seed + i) % 5);
        line(g, bx, by, nx, ny, 'white');
        line(g, bx + 1, by, nx + 1, ny, 'ice');
        bx = nx; by = ny;
      }
    }

    parts.draw(g, 'back');

    const l = cur();
    const sp = speaker(l ? l.who : 'god');
    const inK = Ease.outCubic(clamp(fade, 0, 1));
    const outK = outT >= 0 ? Ease.inQuad(clamp(outT / 0.42, 0, 1)) : 0;
    const slide = Math.round((1 - inK) * 40 + outK * 40);

    // --- title banner
    if (script.title) {
      const tw = Math.min(W - 40, textW(script.title, { font: 7 }) + 40);
      const ty = 20 - Math.round(outK * 42);
      wash(g, W / 2 - tw / 2, ty - 4, tw, 26, 'ink', 0.68);
      boxFrame(g, W / 2 - tw / 2, ty - 4, tw, 26, 'brass1', 1);
      rect(g, W / 2 - tw / 2 + 2, ty - 2, tw - 4, 1, 'brass3');
      text(g, script.title, W / 2, ty + 2, 'brass3', { font: 7, center: true, shadow: 'ink' });
    }

    // --- portrait
    const pw = PORT_W, ph = PORT_H;
    const pxx = PORT_X - slide * 2;
    const pyy = PORT_Y;
    drawPortrait(g, sp.portrait, pxx, pyy, pw, ph, t, {
      color: script.boss ? script.boss.color : sp.color,
      icon: script.boss ? script.boss.icon : null,
    });

    // --- dialogue board. Fixed height so the box does not jump between a one-line and
    // a three-line beat, but sized to three rows of FONT7 and no more.
    const bh = 118;
    const by = H - bh - 22 + slide;
    UI.panel(g, BOX_X, by, BOX_W, bh, { style: 'wood', shadow: true, rivets: true });
    // an inner slate so the type has contrast whatever the sky is doing
    UI.panel(g, BOX_X + 8, by + 18, BOX_W - 16, bh - 34, { style: 'slate', inset: true, corners: false });

    // nameplate straddling the top edge
    const nw = textW(sp.name, { font: 7 }) + 30;
    const nx = BOX_X + 20;
    box(g, nx, by - 8, nw, 23, 'ink', 2);
    box(g, nx + 1, by - 7, nw - 2, 21, mix(col(sp.color), P.ink, 0.55), 2);
    rect(g, nx + 2, by - 6, nw - 4, 2, sp.color);
    text(g, sp.name, nx + nw / 2, by - 3, sp.color, { font: 7, center: true, shadow: 'ink' });

    // the line, typed out
    const shown = lineText().slice(0, Math.floor(typed));
    const rows = wrap(shown, BOX_W - 46, { font: 7 });
    rows.slice(0, 3).forEach((r, i) => {
      text(g, r, BOX_X + 22, by + 28 + i * 22, 'bone', { font: 7, scale: 1, shadow: 'ink' });
    });

    // advance prompt, inside the slate where it has contrast
    if (fullyTyped() && outT < 0 && Math.floor(t * 2) % 2 === 0) {
      const label = ix >= script.lines.length - 1 ? 'CONTINUE ▶' : 'NEXT ▶';
      text(g, label, BOX_X + BOX_W - 24, by + bh - 32, 'brass3', { font: 5, right: true });
    }
    // progress pips ride the wood strip UNDER the slate, where they are not covered
    for (let i = 0; i < script.lines.length; i++) {
      const dx = BOX_X + 22 + i * 10;
      if (dx > BOX_X + BOX_W - 120) break;
      rect(g, dx, by + bh - 10, 7, 4, i < ix ? sp.color : i === ix ? 'white' : 'wood0');
      px(g, dx, by + bh - 10, i <= ix ? 'white' : 'wood1');
    }
    if (outT < 0) text(g, 'ESC SKIPS', BOX_X + BOX_W - 24, by + bh - 12, 'brass1', { font: 3, right: true });

    // cherubs perched on the board corners — the god UI the brief asked for
    drawCherub(g, BOX_X + BOX_W - 34, by - 12, t, { scale: 2, arms: true });
    drawCherub(g, BOX_X - 10, by + 40, t + 2.1, { scale: 2 });

    parts.draw(g, 'front');

    if (outT >= 0) wash(g, 0, 0, W, H, 'ink', outK * 0.9);
    else if (fade < 1) wash(g, 0, 0, W, H, 'ink', (1 - fade) * 0.9);
  }

  function drawFarArk(g, cx, cy) {
    const w = 76;
    for (let i = 0; i < 10; i++) {
      const inset = Math.round((i / 10) ** 1.6 * 14);
      rect(g, cx - w / 2 + inset, cy + i, w - inset * 2, 1, i < 2 ? 'wood3' : i < 5 ? 'wood2' : 'wood1');
    }
    rect(g, cx - w / 2 + 4, cy - 4, w - 8, 4, 'wood2');
    rect(g, cx - w / 2 + 6, cy - 3, w - 12, 2, 'cloth1');
    rect(g, cx + 16, cy - 30, 2, 26, 'wood2');
    for (let i = 0; i < 20; i++) {
      const b = Math.round(Math.sin((i / 20) * Math.PI) * 11) + 1;
      rect(g, cx + 16 - b, cy - 28 + i, b, 1, i % 6 < 3 ? 'white' : 'bone');
    }
    rect(g, cx - w / 2 + 8, cy + 10, w - 16, 1, 'foam');
  }

  return {
    enter(args) {
      script = args.script;
      onDone = args.onDone;
      sea = createSeascape('cut/' + (script.id || 'x'), {});
      parts = createParticles({ limit: 260, seed: 'cut/' + (script.id || 'x') });
      t = 0; ix = 0; typed = 0; lineT = 0; done = false; fade = 0; outT = -1; shownFx = -1;
      storm = (script.bg && script.bg.storm) || 0;
      tod = (script.bg && script.bg.timeOfDay) !== undefined ? script.bg.timeOfDay : 0.3;
      if (script.music) Audio.music(script.music);
      Audio.sfx('blind_start');
    },
    exit() {},
    update, draw,
    debug() { return { scriptId: script && script.id, ix, lines: script ? script.lines.length : 0, typed: Math.floor(typed), done, outT }; },
  };
}

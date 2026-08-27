// THE FILM. Set-pieces, one after another, and nobody says a word.
//
// WHAT THIS REPLACED. The prologue used to be the dialogue scene: a portrait on the left, a
// timber board across the bottom, and twenty lines of typed-out talk with the set-pieces
// playing BEHIND the board as decoration. So the best-drawn thing in the game was a
// backdrop for a text box, and the story arrived as a transcript of two people discussing
// it. You could read the whole flood in eleven sentences without ever looking at it.
//
// So: no box, no portrait, no typing, no speaker names. A film reel plays -- hard cuts,
// letterbox bars, one caption on the bar per shot -- and the picture carries it. The rules
// that fall out of that are the good kind of constraint:
//
//   IF IT MATTERS, IT HAS TO BE DRAWN. There is nowhere to explain anything, so a shot
//     either communicates or gets cut.
//   ONE LINE PER SHOT, on the bar, in the shot's own words. A caption is a title card,
//     not a sentence: 'THE ANIMALS TURNED FIRST', not 'the animals turned first, and
//     Noah realised that the water was only half of it'.
//   THE READER SETS THE PACE. A click cuts to the next shot, so somebody who is reading
//     fast is never held, and somebody who is looking is never rushed.
//
// A CARD is a black frame with one line on it, for the two or three places the story needs
// a beat with no picture in it at all.

import { W, H, rect, text, textW, wash, clamp } from '../core/pixel.js';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Juice, Ease } from '../core/juice.js';
import { SEQUENCES, drawSequence, shotIndex, nextCut } from '../render/setpieces.js';
import { REELS } from '../render/reels.js';

const ALL = Object.assign({}, SEQUENCES, REELS);

const BAR = 38;             // must match the letterbox in drawSequence
const GAP = 0.5;            // seconds of black between reels
const CARD = 2.6;           // seconds a title card holds

/**
 * makeFilmScene()
 *   enter({ reel: 'rivers' })                       one reel
 *   enter({ reels: ['rivers', 'wrath', 'chaos'] })  several, back to back
 *   enter({ reels: [{ card: 'BEFORE THE WATER' }, 'rivers'] })
 */
export function makeFilmScene() {
  let items = [];
  let onDone = null;
  let ix = 0;               // which item
  let it = 0;              // time inside this item
  let t = 0;               // wall time, for idle motion
  let shot = -1;
  let gap = 0;             // >0 while cutting to black between items
  let outT = -1;
  let fade = 0;

  const cur = () => items[ix];
  const seqOf = (item) => (item && item.seq) || null;
  const durOf = (item) => (item ? (item.card ? CARD : item.seq.dur) : 0);

  function leave() {
    if (outT >= 0) return;
    outT = 0;
    Audio.sfx('whoosh');
  }

  /** Straight to the next item, black-framing on the way. */
  function nextItem() {
    if (ix >= items.length - 1) { leave(); return; }
    ix++;
    it = 0;
    shot = -1;
    gap = GAP;
    Audio.sfx('shuffle', { vol: 0.5 });
  }

  /**
   * A CLICK IS A CUT. Inside a reel it jumps to the next shot; on the last shot of a reel
   * it moves the reel on. Nothing is ever skipped invisibly -- you always see the frame
   * you asked for.
   */
  function advance() {
    const item = cur();
    if (!item) { leave(); return; }
    if (item.card) { nextItem(); return; }
    const k = clamp(it / item.seq.dur, 0, 1);
    const cut = nextCut(item.seq, k);
    if (cut >= 1) { nextItem(); return; }
    it = cut * item.seq.dur + 0.001;
    Audio.sfx('click', { vol: 0.5 });
  }

  function update(dt) {
    t += dt;
    fade = Math.min(1, fade + dt * 4);
    if (outT >= 0) {
      outT += dt;
      if (outT > 0.45 && onDone) { const f = onDone; onDone = null; f(); }
      return;
    }
    if (gap > 0) { gap -= dt; return; }

    const item = cur();
    if (!item) { leave(); return; }
    it += dt;

    // punctuate each cut: a shake and a sound, taken from the shot itself
    if (!item.card) {
      const k = clamp(it / item.seq.dur, 0, 1);
      const i = shotIndex(item.seq, k);
      if (i !== shot) {
        shot = i;
        const sh = item.seq.shots[i];
        if (sh.shake) Juice.shake(sh.shake, 0.5);
        Audio.sfx(i === 0 ? 'whoosh' : sh.shake >= 5 ? 'crate_land' : 'shuffle', { vol: 0.7 });
      }
    }
    if (it >= durOf(item)) nextItem();

    const m = Input.mouse;
    if (m.pressed || Input.pressed('Space') || Input.pressed('Enter') || Input.pressed('KeyZ')) advance();
    if (Input.pressed('Escape')) leave();
  }

  function drawCard(g, item) {
    rect(g, 0, 0, W, H, 'ink');
    const k = Ease.outCubic(clamp(it / 0.6, 0, 1)) * (1 - Ease.inQuad(clamp((it - (CARD - 0.5)) / 0.5, 0, 1)));
    const lines = String(item.card).split('|');
    lines.forEach((l, i) => {
      const y = H / 2 - (lines.length - 1) * 18 + i * 36 - 8;
      const prev = g.globalAlpha;
      g.globalAlpha = k;
      text(g, l, W / 2, y, i === 0 ? 'brass3' : 'parch1', { font: 7, center: true });
      g.globalAlpha = prev;
    });
  }

  function draw(g) {
    rect(g, 0, 0, W, H, 'ink');
    const item = cur();
    if (item && gap <= 0) {
      if (item.card) drawCard(g, item);
      else drawSequence(g, item.seq, clamp(it / item.seq.dur, 0, 1), t, {});
    }

    // the one piece of chrome: how to get out, on the bottom bar where the caption is not
    if (gap <= 0 && outT < 0 && item && !item.card) {
      const hint = 'CLICK TO CUT   ·   ESC SKIPS';
      text(g, hint, W - 26, H - 24, 'wood2', { font: 3, right: true });
      // and a reel counter, so a long prologue has a visible end
      if (items.length > 1) {
        for (let i = 0; i < items.length; i++) {
          rect(g, 26 + i * 16, H - 22, 10, 6, i === ix ? 'brass3' : i < ix ? 'wood2' : 'wood0');
        }
      }
    }

    if (gap > 0) wash(g, 0, 0, W, H, 'ink', clamp(gap / GAP, 0, 1));
    if (outT >= 0) wash(g, 0, 0, W, H, 'ink', Ease.inQuad(clamp(outT / 0.45, 0, 1)));
    else if (fade < 1) wash(g, 0, 0, W, H, 'ink', 1 - fade);
    void BAR;
  }

  return {
    enter(args) {
      const list = args.reels || [args.reel];
      items = [];
      for (const entry of list) {
        if (!entry) continue;
        if (typeof entry === 'string') {
          const seq = ALL[entry];
          if (seq) items.push({ seq });
          continue;
        }
        if (entry.card) { items.push({ card: entry.card }); continue; }
        if (entry.seq && ALL[entry.seq]) items.push({ seq: ALL[entry.seq] });
      }
      onDone = args.onDone;
      ix = 0; it = 0; t = 0; shot = -1; gap = 0; outT = -1; fade = 0;
      if (args.music) Audio.music(args.music);
      Audio.sfx('blind_start');
      if (!items.length) leave();
    },
    exit() {},
    update, draw,
    debug() {
      const item = cur();
      return {
        film: true,
        reels: items.map((i) => (i.card ? 'card' : i.seq.id)),
        ix,
        reel: item ? (item.card ? 'card' : item.seq.id) : null,
        shot,
        k: item && !item.card ? clamp(it / item.seq.dur, 0, 1) : 0,
        done: outT >= 0,
        cut: () => advance(),
        skip: () => leave(),
      };
    },
  };
}

// A DEAL — one to three things on a blanket, and the person selling them.
//
// Every seller in the garden uses this one panel, which is what makes them comparable:
// the same portrait box in the same corner, the same card shape, the same price in the
// same place. A shop that reformats itself per shopkeeper makes the player relearn where
// to look every time a gate opens.
//
// Noah gets one extra thing -- the job he is on about -- because he is the only one who
// asks for something rather than selling it.

import { P, col, mix } from '../core/palette.js';
import { rect, frame, px, text, textW, wrap, wash, clamp } from '../core/pixel.js';
import * as UI from '../render/uikit.js';
import { drawFolkPortrait } from './folk.js';
import { describeOffer } from '../game/garden.js';
import { rewardText } from '../data/quests.js';

const CARD_W = 148, CARD_H = 136;
const PORTRAIT_W = 116, PORTRAIT_H = 152;

/**
 * How big this deal needs to be.
 *
 * Sized to its CONTENT, not to the screen. A fixed 700x396 panel holding one apple was
 * an acre of empty wood with a card in the corner, and a shop that looks empty reads as
 * a shop with nothing in it.
 */
export function dealBox(ctx) {
  const n = Math.max(1, ((ctx.offers || []).length));
  const w = Math.max(430, PORTRAIT_W + 36 + n * CARD_W + (n - 1) * 8);
  let h = 30 + 46 + CARD_H + 16;
  if (ctx.quest) h += 70;
  h = Math.max(h, PORTRAIT_H + 60);
  return { w, h };
}

/**
 * drawDeal(g, x, y, w, h, ctx)
 *   ctx { npc, offers, money, t, hover, line, quest, slots }
 * Returns { cards: [rect], quest: rect|null } so the scene can hit-test.
 */
export function drawDeal(g, x, y, w, h, ctx) {
  const npc = ctx.npc;
  const t = ctx.t || 0;
  UI.panel(g, x, y, w, h, { style: 'wood', shadow: true, rivets: true });
  UI.panelTitle(g, x, y + 6, w, npc.name.toUpperCase(), { color: 'cream' });

  // --- the seller, and whatever they are saying
  const pw = PORTRAIT_W, ph = PORTRAIT_H;
  drawFolkPortrait(g, npc.folk, x + 12, y + 22, pw, ph, t, {});
  text(g, npc.title, x + 12 + pw / 2, y + 26 + ph, 'parch1', { font: 3, center: true });

  const bubX = x + pw + 22, bubW = w - pw - 34;
  const said = ctx.line || npc.greet;
  const lines = wrap(said, bubW - 16, { font: 5 }).slice(0, 2);
  rect(g, bubX, y + 24, bubW, 12 + lines.length * 11, 'parch');
  frame(g, bubX, y + 24, bubW, 12 + lines.length * 11, 'wood0');
  rect(g, bubX + 1, y + 25, bubW - 2, 1, 'cream');
  lines.forEach((l, i) => text(g, l, bubX + 8, y + 30 + i * 11, 'wood0', { font: 5 }));

  // --- the blanket
  const cards = [];
  const topY = y + 24 + 12 + lines.length * 11 + 10;
  const n = Math.max(1, (ctx.offers || []).length);
  const gap = 8;
  const totalW = n * CARD_W + (n - 1) * gap;
  const startX = bubX + Math.round((bubW - totalW) / 2);

  if (!ctx.offers || !ctx.offers.length) {
    text(g, 'Nothing on the blanket today.', bubX + 8, topY + 10, 'parch1', { font: 5 });
    text(g, 'Come back when you have been somewhere.', bubX + 8, topY + 24, 'grey1', { font: 3 });
  }

  (ctx.offers || []).forEach((offer, i) => {
    const d = describeOffer(offer);
    if (!d) return;
    const cx = startX + i * (CARD_W + gap);
    const r = UI.rectOf(cx, topY, CARD_W, CARD_H);
    cards[i] = r;
    const hot = ctx.hover === i;
    const afford = (ctx.money || 0) >= offer.price;

    UI.panel(g, cx, topY, CARD_W, CARD_H, { style: 'paper', shadow: true });
    if (hot) frame(g, cx - 1, topY - 1, CARD_W + 2, CARD_H + 2, afford ? 'gold' : 'red1');

    // what kind of thing it is, said plainly, in its own colour
    rect(g, cx + 4, topY + 4, CARD_W - 8, 11, mix(col(d.color), P.parch, 0.55));
    text(g, d.tag, cx + CARD_W / 2, topY + 6, 'wood0', { font: 3, center: true });

    // the thing itself
    UI.iconPlate(g, cx + CARD_W / 2 - 14, topY + 19, 28, d.icon, { color: d.color });
    wrap(d.name, CARD_W - 12, { font: 7 }).slice(0, 2).forEach((l, j) => {
      text(g, l, cx + CARD_W / 2, topY + 52 + j * 10, 'wood0', { font: 7, center: true });
    });
    wrap(d.blurb, CARD_W - 12, { font: 3 }).slice(0, 4).forEach((l, j) => {
      text(g, l, cx + 6, topY + 74 + j * 8, 'wood1', { font: 3 });
    });

    // the price, and whether you can
    const bh = 18;
    const by = topY + CARD_H - bh - 4;
    UI.button(g, UI.rectOf(cx + 5, by, CARD_W - 10, bh), `$${offer.price}`, {
      state: !afford ? 'disabled' : hot ? 'hover' : 'idle',
      color: afford ? 'green0' : 'grey0', icon: 'coin', font: 5,
    });
  });

  // --- the job, for the only one who hands them out
  let questRect = null;
  if (ctx.quest) {
    const q = ctx.quest;
    const qh = 62;
    const qy = y + h - qh - 8;
    UI.panel(g, x + 12, qy, w - 24, qh, { style: 'slate', inset: true });
    text(g, 'THE JOB', x + 22, qy + 5, 'brass2', { font: 3 });
    text(g, q.quest.name.toUpperCase(), x + 60, qy + 4, 'cream', { font: 7 });
    const askW = w - 250;
    wrap(q.quest.ask, askW, { font: 3 }).slice(0, 2).forEach((l, i) => {
      text(g, l, x + 22, qy + 20 + i * 9, 'parch1', { font: 3 });
    });
    text(g, `PAYS ${rewardText(q.quest.reward)}`, x + 22, qy + 42, 'gold', { font: 3 });

    // progress and the hand-in, stacked down the right so neither sits on the other
    const bw = 168;
    const bx = x + w - bw - 22;
    UI.bar(g, bx, qy + 6, bw, 13, clamp(q.at / Math.max(1, q.goal), 0, 1), {
      fill: q.done ? 'leaf3' : 'brass2', bg: 'ink', frame: 'wood0',
    });
    text(g, `${Math.min(q.at, q.goal)} of ${q.goal}`, bx + bw / 2, qy + 8, 'white',
      { font: 3, center: true });
    questRect = UI.rectOf(bx, qy + 24, bw, 18);
    UI.button(g, questRect, q.done ? 'HAND IT IN' : 'NOT YET', {
      state: q.done ? (ctx.hover === 'quest' ? 'hover' : 'idle') : 'disabled',
      color: 'green0', font: 3, small: true,
    });
    if (!q.done) questRect = null;
  }

  void px; void wash; void textW;
  return { cards, quest: questRect };
}

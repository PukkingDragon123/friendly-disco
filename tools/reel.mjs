// A strip of one reel: six frames across its running time, so a cut can be judged as a cut.
import { installDom } from './stubdom.mjs';
installDom();
import { writePNG } from './softcanvas.mjs';
const { makeCanvas, rect, text } = await import('../src/core/pixel.js');
const { SEQUENCES, drawSequence } = await import('../src/render/setpieces.js');
const { REELS } = await import('../src/render/reels.js');
const ALL = Object.assign({}, SEQUENCES, REELS);
const id = process.env.REEL || 'chaos';
const seq = ALL[id];
if (!seq) { console.log('reels:', Object.keys(ALL).join(' ')); process.exit(1); }
const ks = (process.env.KS || '0.06,0.2,0.34,0.44,0.53,0.62,0.72,0.88').split(',').map(Number);
const cols = 2, SW = 960, SH = 540, sc = 0.62;
const cw = Math.round(SW * sc), ch = Math.round(SH * sc);
const rows = Math.ceil(ks.length / cols);
const out = makeCanvas(cols * cw, rows * ch);
const frame = makeCanvas(SW, SH);
ks.forEach((k, i) => {
  frame.g.clearRect(0, 0, SW, SH);
  rect(frame.g, 0, 0, SW, SH, 'ink');
  drawSequence(frame.g, seq, k, Number(process.env.T || 2.35) + i * 0.083);
  const x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
  out.g.drawImage(frame.canvas, 0, 0, SW, SH, x, y, cw, ch);
  rect(out.g, x, y, 74, 18, 'ink');
  text(out.g, `k=${k}`, x + 4, y + 5, 'gold', { font: 3 });
});
writePNG(out.canvas, process.argv[2] || 'reel.png');
console.log('wrote', process.argv[2], id, seq.shots.length, 'shots');

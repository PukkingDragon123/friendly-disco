// Print one baked character as ASCII, one character per ART pixel.
import { installDom } from './stubdom.mjs';
installDom();
const { makeCanvas } = await import('../src/core/pixel.js');
const F = await import('../src/render/folk.js');
const id = process.env.WHO || 'golem';
const c = makeCanvas(40, 56);
F.drawFolk(c.g, id, 20, 56, Number(process.env.T || 1.3), { scale: 1, pose: process.env.POSE || 'idle' });
const d = c.canvas.getContext('2d').getImageData(0, 0, 40, 56).data;
const seen = new Map();
const rows = [];
for (let y = 0; y < 56; y += 2) {
  let r = '';
  for (let x = 0; x < 40; x += 2) {
    const i = (y * 40 + x) * 4;
    if (d[i + 3] === 0) { r += '.'; continue; }
    const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
    if (!seen.has(k)) seen.set(k, '0123456789abcdefghijklmn'[seen.size] || '?');
    r += seen.get(k);
  }
  rows.push(String(y / 2).padStart(2) + ' ' + r);
}
console.log(id, process.env.POSE || 'idle');
console.log('   01234567890123456789');
console.log(rows.join('\n'));
const { P } = await import('../src/core/palette.js');
const byRgb = new Map();
for (const [k, v] of Object.entries(P)) {
  const m = /^#(..)(..)(..)$/.exec(v);
  if (m) byRgb.set([parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)].join(','), k);
}
for (const [k, v] of seen) console.log(v, 'rgb(' + k + ')', byRgb.get(k) || '');

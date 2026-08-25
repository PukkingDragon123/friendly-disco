// Print one baked animal as ASCII, one character per ART pixel.
//
// A PNG at 4x tells you the sprite looks wrong. Sixteen characters a row tell you WHICH
// PIXEL is wrong, which is the only question worth asking about a 16-pixel drawing.
import { installDom } from './stubdom.mjs';
installDom();
const { ANIMAL_BY_ID } = await import('../src/data/animals.js');
const { makeCanvas } = await import('../src/core/pixel.js');
const S = await import('../src/render/sprites.js');

const id = process.env.AN || 'cow';
const step = Number(process.env.STEP || 0);
const a = ANIMAL_BY_ID[id];
// the real thing: all three layers composited exactly as the game does it
const c = makeCanvas(32, 32);
// anchor so the 32x32 sprite lands on the 32x32 canvas: drawAnimal centres on art row
// CY, so sy = 32 * (CY + 0.5) / 16 = 13
S.drawAnimal(c.g, a, 16, 15, { scale: 1, step, mood: process.env.MOOD || 'idle' });
const d = c.canvas.getContext('2d').getImageData(0, 0, 32, 32).data;
const seen = new Map();
const rows = [];
for (let y = 0; y < 32; y += 2) {
  let r = '';
  for (let x = 0; x < 32; x += 2) {
    const i = (y * 32 + x) * 4;
    if (d[i + 3] === 0) { r += '.'; continue; }
    const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
    if (!seen.has(k)) seen.set(k, '0123456789abcdefghij'[seen.size] || '?');
    r += seen.get(k);
  }
  rows.push(String(y / 2).padStart(2) + ' ' + r);
}
console.log(id, 'step', step, JSON.stringify(a.sprite));
console.log('   0123456789012345');
console.log(rows.join('\n'));
for (const [k, v] of seen) console.log(v, 'rgb(' + k + ')');

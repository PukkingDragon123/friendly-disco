// One animal, enormous, on a mid-tone ground. The only view in which you can say for
// certain whether a one-pixel feature reads.
import { installDom } from './stubdom.mjs';
installDom();
import { writePNG } from './softcanvas.mjs';
const { ANIMAL_BY_ID } = await import('../src/data/animals.js');
const { makeCanvas, rect, text } = await import('../src/core/pixel.js');
const S = await import('../src/render/sprites.js');
const ids = (process.env.AN || 'cow').split(',');
const Z = Number(process.env.Z || 0) || 14;
const c = makeCanvas(ids.length * 34 * Z / 2, 20 * Z);
for (let i = 0; i < ids.length; i++) {
  const a = ANIMAL_BY_ID[ids[i]];
  const x0 = i * 34 * Z / 2;
  rect(c.g, x0, 0, 34 * Z / 2, 20 * Z, i % 2 ? 'leaf2' : 'sand');
  S.drawAnimalShadow(c.g, x0 + 16 * Z / 2 + 4 * Z, 15 * Z, Z / 2);
  S.drawAnimal(c.g, a, x0 + 16 * Z / 2 + 4 * Z, 8 * Z, { scale: Z / 2, mood: process.env.MOOD || 'idle' });
  text(c.g, a.name.toUpperCase(), x0 + 8, 4, 'ink', { font: 5 });
}
writePNG(c.canvas, process.argv[2] || 'big.png');
console.log('wrote', process.argv[2]);

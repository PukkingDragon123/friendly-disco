// A row of animals, enormous, on a mid-tone ground. The only view in which you can say for
// certain whether a body plan reads.
import { installDom } from './stubdom.mjs';
installDom();
import { writePNG } from './softcanvas.mjs';
const { ANIMAL_BY_ID, ANIMALS } = await import('../src/data/animals.js');
const { makeCanvas, rect, text } = await import('../src/core/pixel.js');
const S = await import('../src/render/sprites.js');
const ids = (process.env.AN || 'cow,horse,lion,chicken').split(',');
const Z = Number(process.env.Z || 3);
const CELL = 64 * Z + 12;
const c = makeCanvas(ids.length * CELL, 64 * Z + 40);
for (let i = 0; i < ids.length; i++) {
  const a = ANIMAL_BY_ID[ids[i]] || ANIMALS[i];
  if (!a) continue;
  const x0 = i * CELL;
  rect(c.g, x0, 0, CELL, 64 * Z + 40, i % 2 ? 'leaf2' : 'sand');
  const fy = 64 * Z + 4;
  S.drawAnimalShadow(c.g, x0 + CELL / 2, fy, Z);
  S.drawAnimal(c.g, a, x0 + CELL / 2, fy, {
    scale: Z, step: Number(process.env.STEP || 0), mood: process.env.MOOD || 'idle',
  });
  text(c.g, `${a.name.toUpperCase()} · ${S.planFor(a)}`, x0 + 6, 64 * Z + 22, 'ink', { font: 3 });
}
writePNG(c.canvas, process.argv[2] || 'big.png');
console.log('wrote', process.argv[2]);

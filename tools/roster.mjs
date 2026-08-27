// THE WHOLE ROSTER ON ONE SHEET, big enough to judge. `big.mjs` shows four animals at any
// size you like and is where you fix one of them; this is where you find out that the fix
// broke eleven others. PAGE=0..n picks a sheet, Z the zoom, COLS the width.
import { installDom } from './stubdom.mjs';
installDom();
import { writePNG } from './softcanvas.mjs';
const { ANIMALS } = await import('../src/data/animals.js');
const { makeCanvas, rect, text } = await import('../src/core/pixel.js');
const S = await import('../src/render/sprites.js');

const Z = Number(process.env.Z || 3);
const COLS = Number(process.env.COLS || 8);
const ROWS = Number(process.env.ROWS || 6);
const PAGE = Number(process.env.PAGE || 0);
const MAT = process.env.MAT || '';
const CELL = S.SPRITE_SIZE * Z + 8;
const CELL_H = S.SPRITE_H * Z + 20;
const per = COLS * ROWS;
const list = ANIMALS.slice(PAGE * per, PAGE * per + per);
const c = makeCanvas(COLS * CELL, Math.ceil(list.length / COLS) * CELL_H);
rect(c.g, 0, 0, c.canvas.width, c.canvas.height, 'shadow');
list.forEach((a, i) => {
  const col = i % COLS, row = Math.floor(i / COLS);
  const x0 = col * CELL, y0 = row * CELL_H;
  rect(c.g, x0, y0, CELL, CELL_H, (col + row) % 2 ? 'leaf1' : 'sand');
  const fy = y0 + CELL_H - 16;
  S.drawAnimalShadow(c.g, x0 + CELL / 2, fy, Z);
  S.drawAnimal(c.g, a, x0 + CELL / 2, fy, {
    scale: Z, step: Number(process.env.STEP || 0), material: MAT || undefined,
  });
  text(c.g, a.name.toUpperCase().slice(0, 12), x0 + 4, y0 + CELL_H - 12, 'ink', { font: 3 });
});
writePNG(c.canvas, process.argv[2] || 'roster.png');
console.log('wrote', process.argv[2], list.length, 'of', ANIMALS.length);

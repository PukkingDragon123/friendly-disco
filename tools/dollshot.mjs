// Every doll and every monster, big, on a mid-tone ground.
import { installDom } from './stubdom.mjs';
installDom();
import { writePNG } from './softcanvas.mjs';
const { makeCanvas, rect, text } = await import('../src/core/pixel.js');
const D = await import('../src/render/dollart.js');
const { DOLLS } = await import('../src/data/dolls.js');
const { MONSTERS } = await import('../src/data/monsters.js');
const Z = 5;
const c = makeCanvas(1000, 420);
rect(c.g, 0, 0, 1000, 210, 'leaf2');
rect(c.g, 0, 210, 1000, 210, 'sand');
DOLLS.forEach((d, i) => {
  const x = 70 + i * 132, y = 170;
  c.g.save(); c.g.translate(x, y); c.g.scale(Z, Z); c.g.translate(-x / Z, -y / Z);
  D.drawDoll(c.g, d, x / Z, y / Z, 1.2, { lit: true, tile: 32 });
  c.g.restore();
  text(c.g, d.name.replace(' Doll', '').toUpperCase(), x, 182, 'ink', { font: 3, center: true });
});
MONSTERS.forEach((m, i) => {
  const x = 70 + i * 132, y = 390;
  c.g.save(); c.g.translate(x, y); c.g.scale(3, 3); c.g.translate(-x / 3, -y / 3);
  D.drawMonster(c.g, m, x / 3, y / 3, 1.2, { size: 1, tile: 32 });
  c.g.restore();
  text(c.g, m.name.toUpperCase(), x, 400, 'ink', { font: 3, center: true });
});
writePNG(c.canvas, process.argv[2] || 'dolls.png', 2);
console.log('wrote', process.argv[2]);

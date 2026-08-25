// The seascape alone, at four moments, so swell and the pod can be judged without the
// island cards sitting on top of the water.
import { installDom } from './stubdom.mjs';
installDom();
import { writePNG } from './softcanvas.mjs';
const { makeCanvas, rect, text } = await import('../src/core/pixel.js');
const { createSeascape } = await import('../src/render/seascape.js');
const c = makeCanvas(960, 540);
const sea = createSeascape('shot');
const times = (process.env.T || '2,6,10,14').split(',').map(Number);
for (let i = 0; i < 4; i++) {
  const y = i * 135;
  sea.update(i === 0 ? times[0] : times[i] - times[i - 1]);
  sea.draw(c.g, { x: 0, y, w: 960, h: 135, horizonY: y + 34 });
  rect(c.g, 0, y, 60, 12, 'ink');
  text(c.g, 't=' + times[i], 4, y + 3, 'gold', { font: 3 });
}
writePNG(c.canvas, process.argv[2] || 'sea.png', 2);
console.log('wrote', process.argv[2]);

// A contact sheet of the cinematic rigs, one row per frame of the cycle. The only view in
// which you can say whether a run cycle has weight or a wingbeat has a downstroke.
import { installDom } from './stubdom.mjs';
installDom();
import { writePNG } from './softcanvas.mjs';
const { makeCanvas, rect, text } = await import('../src/core/pixel.js');
const C = await import('../src/render/cine.js');

const cols = 6, cw = 200, chh = 190;
const c = makeCanvas(cols * cw, chh * 3);
const g = c.g;
for (let f = 0; f < cols; f++) {
  rect(g, f * cw, 0, cw, chh, f % 2 ? 'wood0' : 'deep');
  C.drawFigure(g, f * cw + cw / 2, chh - 24, 2, f, { run: true, wide: f === 0 });
  text(g, `run ${f}`, f * cw + 8, chh - 14, 'parch1', { font: 3 });

  rect(g, f * cw, chh, cw, chh, f % 2 ? 'deep' : 'wood0');
  C.drawBeast(g, f * cw + cw / 2, chh * 2 - 20, 1.2, f, { kind: 'elephant' });
  text(g, `eleph ${f}`, f * cw + 8, chh * 2 - 14, 'parch1', { font: 3 });

  rect(g, f * cw, chh * 2, cw, chh, f % 2 ? 'wood0' : 'deep');
  if (f < 4) C.drawBird(g, f * cw + cw / 2, chh * 2 + chh / 2, 1.6, f, { talons: f === 1 });
  else C.drawBeast(g, f * cw + cw / 2, chh * 3 - 20, 1.1, f, { kind: 'lion' });
  text(g, f < 4 ? `bird ${f}` : `lion ${f}`, f * cw + 8, chh * 3 - 14, 'parch1', { font: 3 });
}
writePNG(c.canvas, process.argv[2] || 'cine.png');
console.log('wrote', process.argv[2]);

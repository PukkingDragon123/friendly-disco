// Every plant, every bend phase, on a mid-tone ground. FLORA=grassland,jungle,...
import { installDom } from './stubdom.mjs';
installDom();
import { writePNG } from './softcanvas.mjs';
const { makeCanvas, rect, text } = await import('../src/core/pixel.js');
const F = await import('../src/render/flora.js');

const kinds = Object.keys(F.PLANTS);
const biomes = (process.env.FLORA || 'grassland,jungle,desert,snow').split(',');
const CW = 96, CH = 130;
const c = makeCanvas(kinds.length * CW, biomes.length * CH + 30);
for (let bi = 0; bi < biomes.length; bi++) {
  for (let ki = 0; ki < kinds.length; ki++) {
    const x0 = ki * CW, y0 = bi * CH;
    rect(c.g, x0, y0, CW, CH, (ki + bi) % 2 ? 'green0' : 'moss');
    // five bend phases across, so the sway is judged as a strip
    for (let b = -2; b <= 2; b++) {
      F.drawPlant(c.g, x0 + 16 + (b + 2) * 16, y0 + CH - 18, kinds[ki],
        { biome: biomes[bi], v: (b + 2) % 4, bend: b });
    }
    text(c.g, kinds[ki].toUpperCase(), x0 + 4, y0 + CH - 12, 'ink', { font: 3 });
    if (ki === 0) text(c.g, biomes[bi].toUpperCase(), x0 + 4, y0 + 4, 'cream', { font: 3 });
  }
}
text(c.g, 'PLANTS x BEND PHASES', 8, biomes.length * CH + 8, 'gold', { font: 5 });
writePNG(c.canvas, process.argv[2] || 'flora.png', Number(process.env.Z || 2));
console.log('wrote', process.argv[2]);

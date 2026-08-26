// Every panel surface, big, on a mid-tone ground. The only view in which you can say
// whether the chrome reads as built furniture or as a UI rectangle.
import { installDom } from './stubdom.mjs';
installDom();
import { writePNG } from './softcanvas.mjs';
const { makeCanvas, rect, text, wrap } = await import('../src/core/pixel.js');
const UI = await import('../src/render/uikit.js');

const W = 960, H = 540;
const c = makeCanvas(W, H);
const g = c.g;
rect(g, 0, 0, W, H, 'leaf1');

const styles = ['wood', 'brass', 'slate', 'paper', 'glass'];
styles.forEach((s, i) => {
  const x = 16 + (i % 3) * 180, y = 16 + Math.floor(i / 3) * 120;
  UI.panel(g, x, y, 168, 104, { style: s, title: s.toUpperCase(), shadow: true, rivets: s === 'wood' });
});
// an inset plate inside a wood panel, the commonest pairing in the game
UI.panel(g, 556, 16, 388, 104, { style: 'wood', title: 'INSET INSIDE WOOD', shadow: true });
UI.panel(g, 572, 44, 356, 62, { style: 'slate', inset: true, corners: false });
text(g, 'a slate plate inside a timber frame', 750, 68, 'parch1', { font: 5, center: true });

// THE DIALOGUE BOX, at the size it actually appears
const bx = 16, by = 268, bw = 928, bh = 152;
UI.panel(g, bx, by, bw, bh, { style: 'paper', shadow: true, title: 'NOAH' });
wrap('Every plank of her is cedar and pitch, and every beast that breathes will stand on it before the rain comes. Read this at arm’s length: if it is not comfortable, it is not finished.', bw - 56, { font: 7 })
  .slice(0, 4).forEach((l, i) => text(g, l, bx + 28, by + 32 + i * 20, 'wood0', { font: 7 }));
text(g, 'NEXT ▶ — pitch and cedar', bx + bw - 28, by + bh - 26, 'wood1', { font: 5, right: true });

UI.button(g, UI.rectOf(16, 440, 150, 34), 'SET SAIL', { state: 'idle', icon: 'boat' });
UI.button(g, UI.rectOf(180, 440, 150, 34), 'SET SAIL', { state: 'hover', icon: 'boat' });
UI.card(g, 350, 432, 130, 96, { title: 'Shepherd Wand', lines: ['+2 reach on', 'every throw'], rarity: 'rare', icon: 'whistle', price: 6 });
UI.tooltip(g, 500, 436, { title: 'Tooltip', lines: ['clamped inside the frame'], color: 'teal', w: 180 });
UI.panel(g, 700, 432, 244, 96, { style: 'paper', inset: true });
wrap('An inset paper plate: this is what a list or a readout sits on.', 220, { font: 5 })
  .forEach((l, i) => text(g, l, 712, 444 + i * 12, 'wood0', { font: 5 }));

writePNG(c.canvas, process.argv[2] || 'panels.png', Number(process.env.Z || 2));
console.log('wrote', process.argv[2]);

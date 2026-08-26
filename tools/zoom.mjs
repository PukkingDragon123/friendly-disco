// CROP A SCENE AND BLOW IT UP, because a clay mote is nine pixels across and a champion's
// crown is four, and a review of the whole 960x540 screen cannot see either of them.
//
//   CROP=x,y,w,h node tools/zoom.mjs <scene> [outfile] [zoom]
//
// x,y,w,h are in GAME pixels. It runs tools/shot.mjs for the scene -- same fixtures, same
// env switches (BOSS=1, ALLB=1, ISLE=, SECS=, MX/MY) -- and then reads the canvas that
// shot.mjs publishes on globalThis and rescales the window you asked for.
import { installDom } from './stubdom.mjs';
installDom();
const { SoftCanvas, writePNG } = await import('./softcanvas.mjs');

const scene = process.argv[2] || 'island';
const out = process.argv[3] || '/tmp/zoom.png';
const zoom = Number(process.argv[4] || 6);
const [cx, cy, cw, ch] = (process.env.CROP || '0,0,320,200').split(',').map(Number);

process.argv[2] = scene;
process.argv[3] = '/tmp/.zoom-src.png';
await import('./shot.mjs');

const src = globalThis.__shotCanvas;
if (!src) {
  console.error('shot.mjs drew nothing this tool can read');
  process.exit(1);
}
const dst = new SoftCanvas(cw * zoom, ch * zoom);
const g = dst.getContext('2d');
for (let y = 0; y < ch; y++) {
  for (let x = 0; x < cw; x++) {
    const i = ((cy + y) * src.width + (cx + x)) * 4;
    g.fillStyle = `rgb(${src.data[i]},${src.data[i + 1]},${src.data[i + 2]})`;
    g.fillRect(x * zoom, y * zoom, zoom, zoom);
  }
}
writePNG(dst, out, 1);
console.log('wrote', out, `${dst.width}x${dst.height}`, 'from', cx, cy, cw, ch, `at ${zoom}x`);

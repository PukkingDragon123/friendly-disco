// node tools/checksyntax.mjs [files...]
// Import-checks modules in isolation. Browser-only globals are stubbed just
// enough that top-level module bodies can execute.
import { pathToFileURL } from 'node:url';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const g = globalThis;
if (!g.window) {
  const noop = () => {};
  const mkCanvasCtx = () => new Proxy({
    canvas: { width: 1, height: 1 },
    measureText: () => ({ width: 0 }),
    getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }),
    createLinearGradient: () => ({ addColorStop: noop }),
    createPattern: () => null,
  }, { get: (t, k) => (k in t ? t[k] : noop), set: () => true });
  const mkCanvas = (w = 1, h = 1) => ({
    width: w, height: h, style: {},
    getContext: () => mkCanvasCtx(),
    toDataURL: () => '', addEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
  });
  g.document = {
    createElement: (t) => (t === 'canvas' ? mkCanvas() : { style: {}, addEventListener: noop, appendChild: noop, classList: { add: noop, remove: noop } }),
    getElementById: () => null,
    querySelector: () => null,
    addEventListener: noop, body: { appendChild: noop, style: {} },
  };
  g.window = { addEventListener: noop, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720, requestAnimationFrame: noop, localStorage: null };
  g.requestAnimationFrame = noop;
  g.OffscreenCanvas = function (w, h) { return mkCanvas(w, h); };
  g.HTMLCanvasElement = function () {};
  g.AudioContext = function () { return new Proxy({}, { get: () => noop }); };
  g.performance = g.performance || { now: () => 0 };
  g.__MK_CANVAS__ = mkCanvas;
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) { if (e !== 'node_modules' && e !== '.git') walk(p, out); }
    else if (e.endsWith('.js') || e.endsWith('.mjs')) out.push(p);
  }
  return out;
}

const args = process.argv.slice(2);
const files = args.length ? args.flatMap(a => (statSync(a).isDirectory() ? walk(a) : [a])) : walk('src');
let fails = 0;
for (const f of files) {
  try {
    const m = await import(pathToFileURL(resolve(f)).href);
    const n = Object.keys(m).length;
    console.log(`ok    ${f}  (${n} export${n === 1 ? '' : 's'})`);
  } catch (e) {
    fails++;
    console.log(`FAIL  ${f}\n      ${e && e.message ? e.message.split('\n')[0] : e}`);
  }
}
console.log(fails ? `\n${fails} module(s) failed to load.` : `\nAll ${files.length} module(s) loaded.`);
process.exit(fails ? 1 : 0);

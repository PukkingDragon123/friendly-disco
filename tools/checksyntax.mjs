// node tools/checksyntax.mjs [files|dirs...]
// Import-checks modules under the software-canvas DOM stub.
import { pathToFileURL } from 'node:url';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { installDom } from './stubdom.mjs';

installDom();

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
const files = args.length ? args.flatMap((a) => (statSync(a).isDirectory() ? walk(a) : [a])) : walk('src');
let fails = 0;
for (const f of files) {
  try {
    const m = await import(pathToFileURL(resolve(f)).href);
    const n = Object.keys(m).length;
    console.log(`ok    ${f}  (${n} export${n === 1 ? '' : 's'})`);
  } catch (e) {
    fails++;
    console.log(`FAIL  ${f}\n      ${e && e.message ? String(e.message).split('\n')[0] : e}`);
  }
}
console.log(fails ? `\n${fails} module(s) failed to load.` : `\nAll ${files.length} module(s) loaded.`);
process.exit(fails ? 1 : 0);

// ONE FILE. The whole game, inlined, for anywhere that cannot serve a directory of modules.
//
//   node tools/bundle.mjs [out.html]
//
// WHY NOT JUST SHIP index.html. Because it loads sixty-three ES modules by relative path, and
// a relative path needs a server. Opened from a file:// URL, or pasted into a sandbox that
// hands you one document and no origin to fetch from, every import fails and the page shows
// its own "RUN AGROUND" panel. So: read the module graph, evaluate it in dependency order
// inside one script, and write a single self-contained document.
//
// HOW THE MODULES ARE JOINED, and the choice matters. Concatenating module bodies into one
// scope would collide immediately -- eleven files declare `h`, nine declare `t`, and both
// palette.js and pixel.js export a `col`. Instead every module keeps its own scope: it becomes
// an IIFE that returns its exports, stored in a registry under its path, and its imports
// become destructuring reads from that registry. Nothing is renamed, so nothing can collide,
// and the transform only ever touches `import` and `export` STATEMENTS -- never the code.
//
// LIVE BINDINGS ARE PRESERVED. `export let GRID` in core/pixel.js is reassigned at runtime by
// fine() and living(), and a plain destructure would snapshot it at load. Modules that export
// a `let` return a getter for it, and importers of that name read it through the registry
// object rather than binding a copy. There is exactly one such export today; the mechanism is
// general so the next one does not silently break.
//
// The bundle is not minified. It is a game whose source is meant to be read, the whole thing
// gzips to about a fifth of its size over the wire, and a stack trace from a minified bundle
// is worth nothing.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = 'src/main.js';

/* --------------------------------------------------------------- the graph */

const IMPORT_RE =
  /^import\s+(?:\*\s*as\s+([\w$]+)|\{([\s\S]*?)\})\s*from\s*['"]([^'"]+)['"];?[ \t]*$/gm;
const BARE_IMPORT_RE = /^import\s*['"]([^'"]+)['"];?[ \t]*$/gm;

const read = (id) => readFileSync(join(ROOT, id), 'utf8');
const idOf = (fromId, spec) => relative(ROOT, resolve(dirname(join(ROOT, fromId)), spec))
  .split('\\').join('/');

/** Every module reachable from the entry, in the order they must be evaluated. */
function walk(entry) {
  const seen = new Map();          // id -> { src, deps }
  const order = [];
  const state = new Map();         // id -> 'open' | 'done'
  const stack = [];

  const visit = (id) => {
    if (state.get(id) === 'done') return;
    if (state.get(id) === 'open') {
      const cycle = [...stack.slice(stack.indexOf(id)), id].join(' -> ');
      throw new Error(`import cycle, which this bundler cannot order:\n  ${cycle}`);
    }
    state.set(id, 'open');
    stack.push(id);
    const src = read(id);
    const deps = [];
    for (const m of src.matchAll(IMPORT_RE)) deps.push(idOf(id, m[3]));
    for (const m of src.matchAll(BARE_IMPORT_RE)) deps.push(idOf(id, m[1]));
    for (const d of deps) visit(d);
    stack.pop();
    state.set(id, 'done');
    seen.set(id, { src, deps });
    order.push(id);
  };

  visit(entry);
  return { order, seen };
}

/* ---------------------------------------------------------- the transforms */

/**
 * Strip the `export` keywords off a module and report what it exported.
 *
 * Only statements that START A LINE are touched, which is the whole codebase's style and
 * keeps the transform away from anything inside a string or an expression.
 */
function stripExports(src, id) {
  const names = new Set();
  const live = new Set();
  let out = src;

  out = out.replace(/^export\s+(async\s+)?function\s*(\*?)\s*([\w$]+)/gm, (_, a, star, n) => {
    names.add(n);
    return `${a || ''}function${star ? '*' : ''} ${n}`;
  });
  out = out.replace(/^export\s+class\s+([\w$]+)/gm, (_, n) => { names.add(n); return `class ${n}`; });
  out = out.replace(/^export\s+(const|let|var)\s+([\w$]+)/gm, (_, kind, n) => {
    names.add(n);
    if (kind === 'let' || kind === 'var') live.add(n);
    return `${kind} ${n}`;
  });
  // `export { a, b as c };` -- a list, and it may rename on the way out
  out = out.replace(/^export\s*\{([\s\S]*?)\};?[ \t]*$/gm, (_, list) => {
    const parts = [];
    for (const raw of list.split(',')) {
      const bit = raw.trim();
      if (!bit) continue;
      const m = bit.match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
      if (!m) throw new Error(`${id}: cannot read export list entry "${bit}"`);
      names.add(m[2] || m[1]);
      parts.push(m[2] ? `${m[2]}: ${m[1]}` : m[1]);
    }
    // keep them as an object fragment for the return statement rather than a statement here
    return `/* exported: ${parts.join(', ')} */`;
  });

  return { out, names, live };
}

/** Rewrite this module's imports into reads from the registry. */
function rewriteImports(src, id, liveOf) {
  const liveUses = [];             // [localName, holder, exportedName]
  let holder = 0;

  let out = src.replace(IMPORT_RE, (_, ns, list, spec) => {
    const dep = idOf(id, spec);
    if (ns) return `const ${ns} = __M[${JSON.stringify(dep)}];`;
    const liveNames = liveOf.get(dep) || new Set();
    const plain = [];
    let h = null;
    for (const raw of list.split(',')) {
      const bit = raw.trim();
      if (!bit) continue;
      const m = bit.match(/^([\w$]+)(?:\s+as\s+([\w$]+))?$/);
      if (!m) throw new Error(`${id}: cannot read import entry "${bit}"`);
      const [, exported, local] = m;
      if (liveNames.has(exported)) {
        if (!h) h = `__live${holder++}`;
        liveUses.push([local || exported, h, exported]);
      } else {
        plain.push(local ? `${exported}: ${local}` : exported);
      }
    }
    const lines = [];
    if (plain.length) lines.push(`const { ${plain.join(', ')} } = __M[${JSON.stringify(dep)}];`);
    if (h) lines.push(`const ${h} = __M[${JSON.stringify(dep)}];   // live bindings`);
    return lines.join('\n');
  });

  out = out.replace(BARE_IMPORT_RE, (_, spec) => `__M[${JSON.stringify(idOf(id, spec))}];`);

  // LIVE BINDINGS, at every use site. A destructure would copy the value once; these read it
  // off the registry object each time, which is what `import { GRID }` actually means when the
  // exporting module reassigns GRID halfway through a frame.
  for (const [local, h, exported] of liveUses) {
    out = out.replace(new RegExp(`(^|[^\\w$.])${local}\\b`, 'g'), `$1${h}.${exported}`);
  }
  return out;
}

/* ------------------------------------------------------------------ build */

export function bundle() {
  const { order, seen } = walk(ENTRY);

  // first pass: what does each module export, and which of those are live?
  const liveOf = new Map();
  const stripped = new Map();
  for (const id of order) {
    const { out, names, live } = stripExports(seen.get(id).src, id);
    stripped.set(id, { out, names, live });
    liveOf.set(id, live);
  }

  // CROSS-CHECK, and it is the only thing standing between a regex transform and a bundle
  // that is quietly missing a binding. Every name any module imports must be in the exporting
  // module's collected export set; if the `export` stripper ever misses a form -- a
  // multi-declarator line, a syntax nobody has written yet -- this says exactly which name
  // from which file, instead of the page dying at run time on `undefined is not a function`.
  const missing = [];
  for (const id of order) {
    for (const m of seen.get(id).src.matchAll(IMPORT_RE)) {
      if (!m[2]) continue;                       // namespace import: nothing to check
      const dep = idOf(id, m[3]);
      const have = stripped.get(dep).names;
      for (const raw of m[2].split(',')) {
        const bit = raw.trim();
        if (!bit) continue;
        const name = bit.split(/\s+as\s+/)[0].trim();
        if (!have.has(name)) missing.push(`${id} imports "${name}" from ${dep}, which does not export it`);
      }
    }
  }
  if (missing.length) throw new Error(`bundle is incomplete:\n  ${missing.join('\n  ')}`);

  // second pass: rewrite imports (now that the live sets are known) and wrap
  const chunks = [];
  for (const id of order) {
    const { out, names, live } = stripped.get(id);
    const body = rewriteImports(out, id, liveOf);
    const ret = [...names].map((n) => (live.has(n) ? `get ${n}() { return ${n}; }` : n));
    chunks.push(
      `/* ${'='.repeat(72)}\n   ${id}\n   ${'='.repeat(72)} */\n`
      + `__M[${JSON.stringify(id)}] = (function () {\n${body}\n`
      + `return { ${ret.join(', ')} };\n})();\n`,
    );
  }

  // hand the registry to the debug handle, so a test can ask whether every module actually
  // evaluated and whether a live binding is still live
  chunks.push('if (window.__ARK) window.__ARK.modules = __M;\n');
  return { code: chunks.join('\n'), order };
}

/* -------------------------------------------------------------- the page */

const PAGE = readFileSync(join(ROOT, 'tools/page.html'), 'utf8');

const out = process.argv[2] || 'dist/pocket-ark.html';
const { code, order } = bundle();
const script = `'use strict';\nconst __M = Object.create(null);\n\n${code}\n`;
const html = PAGE.replace('/*__BUNDLE__*/', () => script);
mkdirSync(dirname(join(ROOT, out)), { recursive: true });
writeFileSync(join(ROOT, out), html);
const kb = (n) => `${(n / 1024).toFixed(0)}kb`;
console.log(`wrote ${out}  ${order.length} modules  ${kb(html.length)}`);

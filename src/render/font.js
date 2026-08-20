// Bitmap fonts — every word in the game is drawn from these two grids.
//
// Why hand-authored bitmaps instead of ctx.font: canvas text is anti-aliased and
// hinted at sub-pixel positions, which produces half-lit pixels that break the
// 1x pixel-art read the instant the frame is scaled up. These glyphs are pure
// on/off pixels, so a label stays crisp at any integer scale.
//
// The art is authored as ASCII ('#' lit, '.' off, rows separated by '/') and
// compiled once at module load into the exact row-bitmask shape pixel.js wants:
//
//   glyphs[ch][row]  — column c is lit when (row & (1 << (w - 1 - c)))   // MSB = leftmost
//
// FONT5 (w 5, h 7) vertical metrics          FONT3 (w 3, h 5)
//   row 0..4  caps, digits, ascenders          row 0..4  caps + digits only,
//   row 1..4  lowercase x-height                         no descender band
//   row 4     BASELINE
//   row 5..6  descenders: g j p q y J-tail, comma/semicolon tail, _
//
// Consequences for callers:
//  * A line with no descenders is 5px tall (rows 0..4), so a 5px-tall FONT5 cap
//    row lines up with a FONT3 line drawn at the same y.
//  * Use a line height of h + 2 (9 for FONT5, 7 for FONT3). h + 1 also works when
//    the following line has no ascenders, but 9 keeps descenders clear of caps.
//  * Widths are proportional: pixel.js trims empty right-hand columns, so caps
//    advance 5-6px, lowercase 4-5px, and the narrow glyphs listed in `widths`
//    advance 1-3px. Never assume a fixed cell width — call textW().

const LIT = '#';
const OFF = '.';

/**
 * Compile ASCII art into { w, h, gap, spaceW, widths, glyphs }.
 * Validation throws at import time: a mis-typed row is a silently ugly glyph
 * otherwise, and a `widths` entry shorter than the ink would overlap neighbours.
 */
function compile(w, h, spaceW, widths, art) {
  const glyphs = {};
  const errs = [];
  for (const ch of Object.keys(art)) {
    const rows = String(art[ch]).split('/');
    if (rows.length > h) errs.push(`'${ch}' has ${rows.length} rows > h ${h}`);
    const bits = new Array(h).fill(0);
    for (let r = 0; r < rows.length && r < h; r++) {
      const s = rows[r];
      if (s.length > w) errs.push(`'${ch}' row ${r} is ${s.length} wide > w ${w}`);
      for (let c = 0; c < s.length && c < w; c++) {
        if (s[c] === LIT) bits[r] |= 1 << (w - 1 - c);
        else if (s[c] !== OFF) errs.push(`'${ch}' row ${r} has bad pixel '${s[c]}'`);
      }
    }
    glyphs[ch] = bits;
  }
  for (const ch of Object.keys(glyphs)) {
    let used = 0;
    let leftLit = false;
    for (const row of glyphs[ch]) {
      for (let c = 0; c < w; c++) {
        if (row & (1 << (w - 1 - c))) { used = c + 1 > used ? c + 1 : used; if (c === 0) leftLit = true; }
      }
    }
    const wd = widths[ch];
    if (wd !== undefined && wd < used) errs.push(`'${ch}' width ${wd} < ink ${used}`);
    // Empty column 0 with no explicit width means pixel.js' right-trim leaves a
    // stray left bearing — always intentional, so it must be declared.
    if (wd === undefined && used > 0 && !leftLit) errs.push(`'${ch}' has a left bearing but no explicit width`);
  }
  if (errs.length) throw new Error('font.js art error: ' + errs.join('; '));
  return { w, h, gap: 1, spaceW, widths, glyphs };
}

/* ------------------------------------------------------------------ FONT5 5x7 */

// Caps are 5 rows tall and flat-topped; lowercase shares a 4-row x-height with
// real 2-row descenders. Stroke weight is 1px everywhere.
const ART5 = {
  ' ': '.....',

  A: '.###./#...#/#####/#...#/#...#',
  B: '####./#...#/####./#...#/####.',
  C: '.####/#..../#..../#..../.####',
  D: '####./#...#/#...#/#...#/####.',
  E: '#####/#..../####./#..../#####',
  F: '#####/#..../####./#..../#....',
  G: '.####/#..../#..##/#...#/.###.',
  H: '#...#/#...#/#####/#...#/#...#',
  I: '###../.#.../.#.../.#.../###..',
  J: '.###./...#./...#./#..#./.##..',
  K: '#...#/#..#./###../#..#./#...#',
  L: '#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#...#/#...#',
  N: '#...#/##..#/#.#.#/#..##/#...#',
  O: '.###./#...#/#...#/#...#/.###.',
  P: '####./#...#/####./#..../#....',
  Q: '.###./#...#/#...#/#..#./.##.#',
  R: '####./#...#/####./#..#./#...#',
  S: '.####/#..../.###./....#/####.',
  T: '#####/..#../..#../..#../..#..',
  U: '#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/.#.#./..#..',
  W: '#...#/#...#/#.#.#/##.##/#...#',
  X: '#...#/.#.#./..#../.#.#./#...#',
  Y: '#...#/#...#/.#.#./..#../..#..',
  Z: '#####/...#./..#../.#.../#####',

  a: './.##./#.##/#..#/.###',
  b: '#.../###./#..#/#..#/###.',
  c: './.###/#.../#.../.###',
  d: '...#/.###/#..#/#..#/.###',
  e: './.##./####/#.../.###',
  f: '.##./.#../###./.#../.#..',
  g: './.###/#..#/#..#/.###/...#/###.',
  h: '#.../###./#..#/#..#/#..#',
  i: '#..././#.../#.../#...',
  j: '..#././..#./..#./..#./..#./##..',
  k: '#.../#.#./##../#.#./#..#',
  l: '#.../#.../#.../#.../##..',
  m: './##.##/#.#.#/#.#.#/#.#.#',
  n: './###./#..#/#..#/#..#',
  o: './.##./#..#/#..#/.##.',
  p: './###./#..#/#..#/###./#.../#...',
  q: './.###/#..#/#..#/.###/...#/...#',
  r: './#.##/##../#.../#...',
  s: './.###/##../..##/###.',
  t: '.#../###./.#../.#../.###',
  u: './#..#/#..#/#..#/.###',
  v: './#...#/#...#/.#.#./..#..',
  w: './#...#/#.#.#/#.#.#/.#.#.',
  x: './#..#/.##./.##./#..#',
  y: './#..#/#..#/#..#/.###/...#/..#.',
  z: './####/..#./.#../####',

  0: '.###./#..##/#.#.#/##..#/.###.',
  1: '.#.../##.../.#.../.#.../###..',
  2: '.###./#...#/..##./.#.../#####',
  3: '####./....#/.###./....#/####.',
  4: '#..#./#..#./#####/...#./...#.',
  5: '#####/#..../####./....#/####.',
  6: '.###./#..../####./#...#/.###.',
  7: '#####/....#/...#./..#../..#..',
  8: '.###./#...#/.###./#...#/.###.',
  9: '.###./#...#/.####/....#/.###.',

  '!': '#/#/#/./#',
  '"': '#.#/#.#',
  '#': '.#.#./#####/.#.#./#####/.#.#.',
  '$': '..#../.####/#.#../.###./..#.#/####.',
  '%': '##..#/##.#./..#../.#.##/#..##',
  '&': '.##../#..#./.##../#..#./.##.#',
  "'": '#/#',
  '(': '.#/#./#./#./.#',
  ')': '#./.#/.#/.#/#.',
  '*': '#.#/.#./#.#',
  '+': './.#./###/.#.',
  ',': '././././.#/#.',
  '-': '././###',
  '.': '././././#',
  '/': '..#/..#/.#./#../#..',
  ':': '././#/./#',
  ';': '././.#/./.#/#.',
  '<': '..#/.#./#../.#./..#',
  '=': './###/./###',
  '>': '#../.#./..#/.#./#..',
  '?': '.##./#..#/..#././..#.',
  '@': '.###./#...#/#.###/#..#./.###.',
  '[': '##/#./#./#./##',
  '\\': '#../#../.#./..#/..#',
  ']': '##/.#/.#/.#/##',
  '^': '.#./#.#',
  '_': '././././././#####',
  '{': '.##/.#./#../.#./.##',
  '|': '#/#/#/#/#',
  '}': '##./.#./..#/.#./##.',
  '~': './.##../#..##',

  '×': './#.#/.#./#.#',        // × multiply
  '→': './...#./#####/...#.',  // →
  '←': './.#.../#####/.#...',  // ←
  '↑': '..#../.###./..#../..#../..#..', // ↑
  '↓': '..#../..#../..#../.###./..#..', // ↓
  '♥': '.#.#./#####/#####/.###./..#..', // ♥
  '★': '..#../#####/.###./.#.#.',        // ★
  '•': '././##/##',            // •
  '▲': '././..#../.###./#####', // ▲
  '▼': '././#####/.###./..#..', // ▼
  '·': '././#',                // ·
  '°': '.#./#.#/.#.',          // °
  '¢': '..#./.###/#.#./#.#./.###/..#.', // ¢
};

// Narrow glyphs get an explicit advance so words kern tightly instead of
// floating in a 5px cell. ↑ / ↓ are declared because their ink is centred.
const WIDTHS5 = {
  i: 1, l: 2, 1: 3, '.': 1, ',': 2, '!': 1, "'": 1, ':': 1, ';': 2, '|': 1,
  '↑': 5, '↓': 5,
};

export const FONT5 = compile(5, 7, 2, WIDTHS5, ART5);

/* ------------------------------------------------------------------ FONT3 3x5 */

// Uppercase-only micro font for gate tags, tiny counters and dense lists.
// pixel.js falls back to the uppercase glyph when handed lowercase, so mixed
// case input still renders.
const ART3 = {
  ' ': '...',

  A: '.#./#.#/###/#.#/#.#',
  B: '##./#.#/##./#.#/##.',
  C: '.##/#../#../#../.##',
  D: '##./#.#/#.#/#.#/##.',
  E: '###/#../##./#../###',
  F: '###/#../##./#../#..',
  G: '.##/#../#.#/#.#/.##',
  H: '#.#/#.#/###/#.#/#.#',
  I: '###/.#./.#./.#./###',
  J: '..#/..#/..#/#.#/.#.',
  K: '#.#/##./#../##./#.#',
  L: '#../#../#../#../###',
  M: '###/###/#.#/#.#/#.#',
  N: '#.#/###/#.#/#.#/#.#',
  O: '.#./#.#/#.#/#.#/.#.',
  P: '##./#.#/##./#../#..',
  Q: '.#./#.#/#.#/.#./..#',
  R: '##./#.#/##./#.#/#.#',
  S: '.##/#../.#./..#/##.',
  T: '###/.#./.#./.#./.#.',
  U: '#.#/#.#/#.#/#.#/###',
  V: '#.#/#.#/#.#/#.#/.#.',
  W: '#.#/#.#/###/###/#.#',
  X: '#.#/#.#/.#./#.#/#.#',
  Y: '#.#/#.#/.#./.#./.#.',
  Z: '###/..#/.#./#../###',

  0: '###/#.#/#.#/#.#/###',
  1: '.#./##./.#./.#./##.',
  2: '###/..#/###/#../###',
  3: '###/..#/.##/..#/###',
  4: '#.#/#.#/###/..#/..#',
  5: '###/#../###/..#/###',
  6: '.##/#../###/#.#/###',
  7: '###/..#/.#./.#./.#.',
  8: '###/#.#/###/#.#/###',
  9: '###/#.#/###/..#/##.',

  '.': '././././#',
  ',': './././.#/#.',
  ':': './#/./#',
  '-': '././###',
  '+': './.#./###/.#.',
  '/': '..#/..#/.#./#../#..',
  '%': '#.#/..#/.#./#../#.#',
  '$': '.##/##./.#./.##/##.',
  '!': '#/#/#/./#',
  '?': '##./..#/.#././.#.',
  '(': '.#/#./#./#./.#',
  ')': '#./.#/.#/.#/#.',
  '×': './#.#/.#./#.#', // ×
};

const WIDTHS3 = { 1: 2, '.': 1, ',': 2, ':': 1, '!': 1, '(': 2, ')': 2 };

export const FONT3 = compile(3, 5, 2, WIDTHS3, ART3);

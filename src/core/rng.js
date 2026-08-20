// Seeded RNG. Every random draw in the game flows through one of these so a run
// is reproducible from its seed string — which also makes the tests meaningful.
//
// sfc32 core: fast, tiny, passes PractRand well past anything a pool game needs.

function hashSeed(str) {
  let h = 1779033703 ^ String(str).length;
  for (let i = 0; i < String(str).length; i++) {
    h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

export function makeRng(seed = 'ark') {
  const s = hashSeed(seed);
  let a = s(), b = s(), c = s(), d = s();
  // burn in so short seeds don't correlate
  for (let i = 0; i < 12; i++) core();

  function core() {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  }

  const rng = () => core();

  rng.seed = String(seed);
  rng.int = (n) => Math.floor(core() * n);
  rng.range = (lo, hi) => lo + core() * (hi - lo);
  rng.irange = (lo, hi) => lo + Math.floor(core() * (hi - lo + 1));
  rng.chance = (p) => core() < p;
  rng.sign = () => (core() < 0.5 ? -1 : 1);

  rng.pick = (arr) => (arr && arr.length ? arr[Math.floor(core() * arr.length)] : undefined);

  rng.shuffle = (arr) => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(core() * (i + 1));
      const t = out[i]; out[i] = out[j]; out[j] = t;
    }
    return out;
  };

  /** Draw n distinct entries (or fewer if the pool is small). */
  rng.sample = (arr, n) => rng.shuffle(arr).slice(0, n);

  /** rng.weighted([[item, w], ...]) */
  rng.weighted = (pairs) => {
    let total = 0;
    for (const p of pairs) total += Math.max(0, p[1]);
    if (total <= 0) return pairs.length ? pairs[0][0] : undefined;
    let r = core() * total;
    for (const p of pairs) { r -= Math.max(0, p[1]); if (r <= 0) return p[0]; }
    return pairs[pairs.length - 1][0];
  };

  /** Gaussian-ish, clamped. Good for scatter offsets. */
  rng.gauss = (mean = 0, sd = 1) => {
    const u = Math.max(1e-9, core());
    const v = core();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return mean + Math.max(-3, Math.min(3, z)) * sd;
  };

  /** Independent child stream — use so adding a draw in one system doesn't
   *  reshuffle every other system's sequence. */
  rng.fork = (tag = '') => makeRng(`${seed}/${tag}/${rng.int(1e9)}`);

  Object.defineProperty(rng, 'state', {
    get: () => [a, b, c, d],
    set: (v) => { a = v[0] | 0; b = v[1] | 0; c = v[2] | 0; d = v[3] | 0; },
  });
  rng.setState = (v) => { rng.state = v; };

  return rng;
}

/** Human-friendly run seeds: ARK-4F2K-9QX1 */
export function randomSeedString(entropy) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const src = makeRng(String(entropy ?? 'boot'));
  let out = 'ARK-';
  for (let i = 0; i < 8; i++) {
    if (i === 4) out += '-';
    out += chars[src.int(chars.length)];
  }
  return out;
}

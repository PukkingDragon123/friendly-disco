// Procedural audio. WebAudio only — not one sample byte ships with the game.
//
// Shape:
//   voices -> [dry + reverb send] -> sfxBus/musicBus -> master -> compressor -> out
//
// Three rules keep it from becoming noise:
//  * every voice is scheduled on AudioContext time and tears itself down on `ended`,
//    with a hard cap on concurrency, so a six-ball break cannot clip the master;
//  * identical sfx fired inside COALESCE seconds are merged, and every repeat is pitched
//    slightly differently, which is the difference between a break and a machine gun;
//  * the music sequencer runs a lookahead loop (schedule the next 150ms, sleep 25ms)
//    rather than a timer per note, so it never drifts and never stutters under GC.
//
// Everything is a safe no-op before unlock() or when WebAudio is missing.

import { makeRng } from './rng.js';

const COALESCE = 0.02;       // identical sfx inside this window merge
const MAX_VOICES = 26;
const AHEAD = 0.15;          // sequencer lookahead, seconds
const TICK = 25;             // sequencer wake interval, ms

let ctx = null;
let master = null, comp = null, sfxBus = null, musicBus = null, verb = null, verbSend = null;
let noiseBuf = null;
let ready = false;
let failed = false;
let voices = 0;
let muted = false;
let volMaster = 0.85, volSfx = 0.9, volMusic = 0.5;
const lastFired = Object.create(null);

/* ------------------------------------------------------------------- setup */

function ac() {
  return typeof AudioContext !== 'undefined' ? AudioContext
    : (typeof webkitAudioContext !== 'undefined' ? webkitAudioContext : null);
}

function init() {
  if (ctx || failed) return ctx;
  const Ctor = ac();
  if (!Ctor) { failed = true; return null; }
  try {
    ctx = new Ctor();
    comp = ctx.createDynamicsCompressor();
    setP(comp.threshold, -14);
    setP(comp.knee, 24);
    setP(comp.ratio, 8);
    setP(comp.attack, 0.004);
    setP(comp.release, 0.18);
    master = ctx.createGain();
    setP(master.gain, muted ? 0 : volMaster);
    sfxBus = ctx.createGain();
    setP(sfxBus.gain, volSfx);
    musicBus = ctx.createGain();
    setP(musicBus.gain, volMusic);

    // reverb from a decaying noise impulse — a small stone harbour
    verb = ctx.createConvolver();
    verb.buffer = impulse(1.9, 2.6);
    verbSend = ctx.createGain();
    setP(verbSend.gain, 0.5);
    verbSend.connect(verb);
    verb.connect(master);

    sfxBus.connect(master);
    musicBus.connect(master);
    master.connect(comp);
    comp.connect(ctx.destination);

    noiseBuf = whiteNoise(2);
    ready = true;
  } catch (e) {
    failed = true;
    ctx = null;
  }
  return ctx;
}

function setP(param, v, when) {
  if (!param) return;
  const val = Number.isFinite(v) ? v : 0;
  try {
    if (param.setValueAtTime && when !== undefined && Number.isFinite(when)) param.setValueAtTime(val, when);
    else param.value = val;
  } catch (e) { /* a stubbed param is fine */ }
}

function whiteNoise(sec) {
  if (!ctx) return null;
  const n = Math.max(1, Math.floor(ctx.sampleRate * sec));
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  const rng = makeRng('noise');
  for (let i = 0; i < n; i++) d[i] = rng() * 2 - 1;
  return b;
}

function impulse(sec, decay) {
  if (!ctx) return null;
  const n = Math.max(1, Math.floor(ctx.sampleRate * sec));
  const b = ctx.createBuffer(2, n, ctx.sampleRate);
  const rng = makeRng('verb');
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < n; i++) {
      const env = Math.pow(1 - i / n, decay);
      // a couple of early reflections make it read as a room, not a wash
      const early = (i > n * 0.012 && i < n * 0.02) ? 1.7 : 1;
      d[i] = (rng() * 2 - 1) * env * early * 0.55;
    }
  }
  return b;
}

const now = () => (ctx ? ctx.currentTime : 0);

/* ------------------------------------------------------------------ voices */

function bus(kind) { return kind === 'music' ? musicBus : sfxBus; }

/**
 * Release a voice slot exactly once. `onended` is the primary signal, but a missed
 * event would permanently starve the pool, so a timer backs it up.
 */
function retire(node, endTime) {
  let done = false;
  const free = () => {
    if (done) return;
    done = true;
    voices = Math.max(0, voices - 1);
    try { node.disconnect(); } catch (e) { /* already gone */ }
  };
  node.onended = free;
  if (typeof setTimeout === 'function') {
    const ms = Math.max(40, (endTime - now()) * 1000 + 120);
    const h = setTimeout(free, Math.min(30000, ms));
    if (h && typeof h.unref === 'function') h.unref();
  }
  return free;
}


/** ADSR-ish envelope on a gain node, returning the time it finishes. */
function env(gain, t0, o) {
  const peak = Math.max(0.0001, o.vol);
  const a = Math.max(0.001, o.attack || 0.004);
  const d = Math.max(0.001, o.decay || 0.08);
  const s = Math.max(0, o.sustain !== undefined ? o.sustain : 0);
  const hold = Math.max(0, o.hold || 0);
  const r = Math.max(0.008, o.release || 0.08);
  try {
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + a);
    if (s > 0) {
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * s), t0 + a + d);
      gain.gain.setValueAtTime(Math.max(0.0001, peak * s), t0 + a + d + hold);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d + hold + r);
    } else {
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    }
  } catch (e) { /* stub */ }
  return t0 + a + d + hold + (s > 0 ? r : 0);
}

function chain(src, o, t0, end, kind) {
  const g = ctx.createGain();
  let node = src;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter;
    setP(f.frequency, o.cutoff || 1200, t0);
    setP(f.Q, o.q !== undefined ? o.q : 1);
    if (o.sweepTo) {
      try { f.frequency.exponentialRampToValueAtTime(Math.max(20, o.sweepTo), end); } catch (e) { /* stub */ }
    }
    node.connect(f);
    node = f;
  }
  node.connect(g);
  if (o.pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    setP(p.pan, Math.max(-1, Math.min(1, o.pan)));
    g.connect(p);
    p.connect(bus(kind));
    if (o.reverb && verbSend) p.connect(verbSend);
  } else {
    g.connect(bus(kind));
    if (o.reverb && verbSend) g.connect(verbSend);
  }
  return g;
}

function tone(o, kind) {
  if (!ready || voices >= MAX_VOICES) return;
  const t0 = Math.max(now(), o.at !== undefined ? o.at : now());
  const osc = ctx.createOscillator();
  osc.type = o.type || 'triangle';
  const f0 = Math.max(16, o.freq || 440);
  setP(osc.frequency, f0, t0);
  if (o.detune) setP(osc.detune, o.detune);
  const g = chain(osc, o, t0, t0 + (o.attack || 0.004) + (o.decay || 0.08) + (o.hold || 0) + (o.release || 0.08), kind);
  const end = env(g, t0, o);
  if (o.slide) {
    try { osc.frequency.exponentialRampToValueAtTime(Math.max(16, f0 * o.slide), end); } catch (e) { /* stub */ }
  }
  if (o.vibrato) {
    const lfo = ctx.createOscillator();
    const amt = ctx.createGain();
    setP(lfo.frequency, o.vibrato);
    setP(amt.gain, o.vibratoAmt || 6);
    lfo.connect(amt); amt.connect(osc.frequency);
    lfo.start(t0); lfo.stop(end + 0.02);
  }
  voices++;
  const free = retire(osc, end + 0.02);
  try { osc.start(t0); osc.stop(end + 0.02); } catch (e) { free(); }
}

function noise(o, kind) {
  if (!ready || !noiseBuf || voices >= MAX_VOICES) return;
  const t0 = Math.max(now(), o.at !== undefined ? o.at : now());
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  if (o.rate) setP(src.playbackRate, Math.max(0.05, o.rate));
  const g = chain(src, o, t0, t0 + (o.attack || 0.002) + (o.decay || 0.1) + (o.hold || 0), kind);
  const end = env(g, t0, o);
  voices++;
  const free = retire(src, end + 0.02);
  try { src.start(t0); src.stop(end + 0.02); } catch (e) { free(); }
}

/* -------------------------------------------------------------------- sfx */

// Each entry gets (o, r) where o is the caller's options and r is a 0..1 variation.
const SFX = {
  // --- cue and balls
  cue: (o, r) => {
    noise({ vol: 0.5 * o.v, attack: 0.001, decay: 0.045, filter: 'bandpass', cutoff: 2200 + r * 500, q: 1.6, pan: o.pan, reverb: 1, at: o.at });
    tone({ type: 'triangle', freq: 180 + r * 40, vol: 0.28 * o.v, attack: 0.001, decay: 0.09, slide: 0.5, at: o.at });
  },
  chalk: (o, r) => noise({ vol: 0.16 * o.v, attack: 0.004, decay: 0.09, filter: 'highpass', cutoff: 3800 + r * 900, q: 0.7, at: o.at }),
  ball_click: (o, r) => {
    tone({ type: 'sine', freq: 900 + r * 380, vol: 0.34 * o.v, attack: 0.0008, decay: 0.035, slide: 0.55, pan: o.pan, at: o.at });
    noise({ vol: 0.12 * o.v, attack: 0.0006, decay: 0.02, filter: 'highpass', cutoff: 4200, at: o.at });
  },
  ball_soft: (o, r) => tone({ type: 'sine', freq: 520 + r * 160, vol: 0.16 * o.v, attack: 0.001, decay: 0.05, slide: 0.6, pan: o.pan, at: o.at }),
  rail: (o, r) => {
    tone({ type: 'triangle', freq: 150 + r * 60, vol: 0.24 * o.v, attack: 0.001, decay: 0.11, slide: 0.42, pan: o.pan, at: o.at });
    noise({ vol: 0.1 * o.v, attack: 0.001, decay: 0.05, filter: 'lowpass', cutoff: 900, at: o.at });
  },
  // --- pockets
  pocket_drop: (o, r) => {
    tone({ type: 'sine', freq: 300 + r * 40, vol: 0.3 * o.v, attack: 0.002, decay: 0.24, slide: 0.28, reverb: 1, at: o.at });
    noise({ vol: 0.14 * o.v, attack: 0.002, decay: 0.16, filter: 'lowpass', cutoff: 1400, sweepTo: 300, at: o.at });
  },
  pot_good: (o) => arp(o, [0, 4, 7], 'triangle', 0.09, 0.26),
  pot_perfect: (o) => arp(o, [0, 4, 7, 12, 16], 'square', 0.075, 0.24, 523.25),
  pot_wrong: (o) => arp(o, [0, -1, -3], 'sawtooth', 0.11, 0.2, 220),
  // --- scoring
  score_tick: (o, r) => tone({ type: 'square', freq: 660 * (1 + r * 0.5), vol: 0.13 * o.v, attack: 0.001, decay: 0.05, at: o.at }),
  score_slam: (o) => {
    tone({ type: 'square', freq: 130, vol: 0.34, attack: 0.002, decay: 0.3, slide: 0.6, at: o.at });
    tone({ type: 'triangle', freq: 523, vol: 0.22, attack: 0.002, decay: 0.34, reverb: 1, at: o.at });
    noise({ vol: 0.2, attack: 0.001, decay: 0.22, filter: 'bandpass', cutoff: 1800, q: 0.9, at: o.at });
  },
  chips: (o, r) => tone({ type: 'sine', freq: 1180 + r * 260, vol: 0.12 * o.v, attack: 0.001, decay: 0.06, at: o.at }),
  mult: (o, r) => tone({ type: 'sawtooth', freq: 300 + r * 90, vol: 0.16 * o.v, attack: 0.002, decay: 0.14, slide: 1.6, filter: 'lowpass', cutoff: 2400, at: o.at }),
  // --- money and UI
  coin: (o, r) => {
    tone({ type: 'square', freq: 1046, vol: 0.14 * o.v, attack: 0.001, decay: 0.05, at: o.at });
    tone({ type: 'square', freq: 1568 + r * 60, vol: 0.12 * o.v, attack: 0.001, decay: 0.14, at: (o.at || now()) + 0.045 });
  },
  cash: (o) => arp(o, [0, 5, 9, 12], 'square', 0.06, 0.16, 784),
  click: (o, r) => tone({ type: 'square', freq: 760 + r * 90, vol: 0.11 * o.v, attack: 0.001, decay: 0.032, at: o.at }),
  hover: (o, r) => tone({ type: 'sine', freq: 1300 + r * 200, vol: 0.045 * o.v, attack: 0.001, decay: 0.03, at: o.at }),
  back: (o) => arp(o, [4, 0], 'triangle', 0.06, 0.14, 440),
  error: (o) => arp(o, [0, -2], 'sawtooth', 0.09, 0.2, 196),
  // --- dock
  crate_open: (o) => {
    noise({ vol: 0.3, attack: 0.001, decay: 0.2, filter: 'bandpass', cutoff: 1500, q: 0.8, sweepTo: 4500, reverb: 1, at: o.at });
    arp(o, [0, 7, 12, 19], 'triangle', 0.055, 0.2, 659.25);
  },
  crate_land: (o) => {
    tone({ type: 'triangle', freq: 82, vol: 0.42, attack: 0.002, decay: 0.34, slide: 0.5, at: o.at });
    noise({ vol: 0.3, attack: 0.001, decay: 0.26, filter: 'lowpass', cutoff: 700, reverb: 1, at: o.at });
  },
  crane: (o, r) => noise({ vol: 0.1, attack: 0.02, decay: 0.3, filter: 'bandpass', cutoff: 480 + r * 200, q: 5, at: o.at }),
  boat_horn: (o) => {
    const t0 = o.at !== undefined ? o.at : now();
    tone({ type: 'sawtooth', freq: 116, vol: 0.3, attack: 0.09, decay: 0.2, sustain: 0.8, hold: 0.55, release: 0.4, filter: 'lowpass', cutoff: 900, reverb: 1, at: t0 });
    tone({ type: 'sawtooth', freq: 174, vol: 0.2, attack: 0.11, decay: 0.2, sustain: 0.8, hold: 0.5, release: 0.4, filter: 'lowpass', cutoff: 1100, reverb: 1, at: t0 + 0.02 });
  },
  boat_engine: (o) => noise({ vol: 0.09, attack: 0.3, decay: 0.4, sustain: 0.7, hold: 1.6, release: 0.9, filter: 'lowpass', cutoff: 240, q: 3, at: o.at }),
  splash: (o, r) => {
    noise({ vol: 0.26, attack: 0.001, decay: 0.22, filter: 'highpass', cutoff: 700 + r * 400, sweepTo: 5000, reverb: 1, at: o.at });
    tone({ type: 'sine', freq: 420, vol: 0.1, attack: 0.002, decay: 0.16, slide: 2.2, at: o.at });
  },
  wave: (o) => noise({ vol: 0.09, attack: 0.4, decay: 0.7, filter: 'lowpass', cutoff: 620, at: o.at }),
  gull: (o, r) => {
    const t0 = o.at !== undefined ? o.at : now();
    for (let i = 0; i < 3; i++) {
      tone({ type: 'sawtooth', freq: 1500 + r * 300 - i * 120, vol: 0.06, attack: 0.01, decay: 0.12, slide: 0.7, filter: 'bandpass', cutoff: 2400, q: 3, reverb: 1, at: t0 + i * 0.17 });
    }
  },
  // --- animals
  chomp: (o, r) => {
    noise({ vol: 0.3, attack: 0.001, decay: 0.07, filter: 'lowpass', cutoff: 1100 + r * 400, at: o.at });
    tone({ type: 'square', freq: 150, vol: 0.2, attack: 0.001, decay: 0.09, slide: 0.4, at: o.at });
    noise({ vol: 0.2, attack: 0.001, decay: 0.06, filter: 'lowpass', cutoff: 900, at: (o.at || now()) + 0.075 });
  },
  munch: (o, r) => noise({ vol: 0.16, attack: 0.002, decay: 0.1, filter: 'bandpass', cutoff: 800 + r * 300, q: 2, at: o.at }),
  growl: (o, r) => tone({ type: 'sawtooth', freq: 90 + r * 20, vol: 0.2, attack: 0.03, decay: 0.3, sustain: 0.5, hold: 0.15, release: 0.2, filter: 'lowpass', cutoff: 420, vibrato: 22, vibratoAmt: 10, at: o.at }),
  chirp: (o, r) => tone({ type: 'sine', freq: 2100 + r * 500, vol: 0.09, attack: 0.002, decay: 0.06, slide: 1.5, at: o.at }),
  moo: (o, r) => tone({ type: 'sawtooth', freq: 150 + r * 20, vol: 0.2, attack: 0.06, decay: 0.3, sustain: 0.6, hold: 0.2, release: 0.25, filter: 'lowpass', cutoff: 700, slide: 0.75, at: o.at }),
  baa: (o, r) => tone({ type: 'sawtooth', freq: 430 + r * 60, vol: 0.15, attack: 0.02, decay: 0.22, filter: 'lowpass', cutoff: 1500, vibrato: 17, vibratoAmt: 26, at: o.at }),
  oink: (o, r) => tone({ type: 'square', freq: 260 + r * 60, vol: 0.15, attack: 0.004, decay: 0.09, slide: 1.7, filter: 'lowpass', cutoff: 1200, at: o.at }),
  squeak: (o, r) => tone({ type: 'sine', freq: 1750 + r * 600, vol: 0.09, attack: 0.002, decay: 0.05, slide: 1.7, at: o.at }),
  roar: (o) => {
    const t0 = o.at !== undefined ? o.at : now();
    tone({ type: 'sawtooth', freq: 96, vol: 0.34, attack: 0.05, decay: 0.35, sustain: 0.6, hold: 0.3, release: 0.35, filter: 'lowpass', cutoff: 620, sweepTo: 260, vibrato: 13, vibratoAmt: 16, reverb: 1, at: t0 });
    noise({ vol: 0.14, attack: 0.06, decay: 0.5, filter: 'lowpass', cutoff: 400, at: t0 });
  },
  // --- misc UI / flow
  shuffle: (o) => {
    const t0 = o.at !== undefined ? o.at : now();
    for (let i = 0; i < 7; i++) noise({ vol: 0.1, attack: 0.001, decay: 0.045, filter: 'highpass', cutoff: 2600, at: t0 + i * 0.035 });
  },
  deal: (o, r) => noise({ vol: 0.12, attack: 0.001, decay: 0.06, filter: 'bandpass', cutoff: 2000 + r * 700, q: 1.2, at: o.at }),
  whoosh: (o) => noise({ vol: 0.16, attack: 0.03, decay: 0.24, filter: 'bandpass', cutoff: 500, q: 0.7, sweepTo: 3600, at: o.at }),
  sparkle: (o, r) => {
    const t0 = o.at !== undefined ? o.at : now();
    for (let i = 0; i < 4; i++) tone({ type: 'sine', freq: 1400 + i * 420 + r * 200, vol: 0.07, attack: 0.001, decay: 0.11, at: t0 + i * 0.035 });
  },
  levelup: (o) => arp(o, [0, 4, 7, 12], 'square', 0.075, 0.2, 523.25),
  fanfare: (o) => {
    const t0 = o.at !== undefined ? o.at : now();
    const seq = [[0, 0], [4, 0.11], [7, 0.22], [12, 0.33], [12, 0.5], [16, 0.62], [19, 0.74]];
    for (const [semi, dt] of seq) {
      tone({ type: 'square', freq: 523.25 * Math.pow(2, semi / 12), vol: 0.17, attack: 0.004, decay: 0.22, reverb: 1, at: t0 + dt });
      tone({ type: 'triangle', freq: 261.63 * Math.pow(2, semi / 12), vol: 0.12, attack: 0.004, decay: 0.26, at: t0 + dt });
    }
  },
  fail: (o) => {
    const t0 = o.at !== undefined ? o.at : now();
    [0, -3, -7, -12].forEach((s, i) => tone({
      type: 'sawtooth', freq: 330 * Math.pow(2, s / 12), vol: 0.18, attack: 0.008, decay: 0.3,
      filter: 'lowpass', cutoff: 1400, reverb: 1, at: t0 + i * 0.15,
    }));
  },
  heartbeat: (o) => {
    const t0 = o.at !== undefined ? o.at : now();
    tone({ type: 'sine', freq: 62, vol: 0.3, attack: 0.005, decay: 0.13, at: t0 });
    tone({ type: 'sine', freq: 54, vol: 0.22, attack: 0.005, decay: 0.16, at: t0 + 0.19 });
  },
  tick: (o, r) => tone({ type: 'square', freq: 1500 + r * 100, vol: 0.05, attack: 0.001, decay: 0.02, at: o.at }),
  lock: (o) => { tone({ type: 'square', freq: 220, vol: 0.14, attack: 0.001, decay: 0.06, at: o.at }); noise({ vol: 0.1, attack: 0.001, decay: 0.05, filter: 'bandpass', cutoff: 1200, q: 4, at: o.at }); },
  unlock: (o) => arp(o, [0, 7], 'square', 0.05, 0.14, 587.33),
  blind_start: (o) => {
    const t0 = o.at !== undefined ? o.at : now();
    tone({ type: 'triangle', freq: 174.61, vol: 0.24, attack: 0.02, decay: 0.4, sustain: 0.5, hold: 0.2, release: 0.4, reverb: 1, at: t0 });
    tone({ type: 'triangle', freq: 261.63, vol: 0.2, attack: 0.02, decay: 0.4, sustain: 0.5, hold: 0.2, release: 0.4, reverb: 1, at: t0 + 0.06 });
    noise({ vol: 0.14, attack: 0.05, decay: 0.5, filter: 'lowpass', cutoff: 900, at: t0 });
  },
  boss_sting: (o) => {
    const t0 = o.at !== undefined ? o.at : now();
    [0, 1, 6].forEach((s, i) => tone({
      type: 'sawtooth', freq: 116.54 * Math.pow(2, s / 12), vol: 0.26, attack: 0.006, decay: 0.55,
      filter: 'lowpass', cutoff: 800, reverb: 1, at: t0 + i * 0.02,
    }));
    noise({ vol: 0.2, attack: 0.002, decay: 0.6, filter: 'bandpass', cutoff: 300, q: 1.4, at: t0 });
  },
  reroll: (o) => {
    const t0 = o.at !== undefined ? o.at : now();
    for (let i = 0; i < 5; i++) tone({ type: 'square', freq: 500 + i * 130, vol: 0.08, attack: 0.001, decay: 0.05, at: t0 + i * 0.04 });
  },
  upgrade: (o) => arp(o, [0, 5, 12], 'triangle', 0.07, 0.2, 698.46),
};

function arp(o, semis, type, step, vol, root) {
  const t0 = o.at !== undefined ? o.at : now();
  const base = root || 392;
  semis.forEach((s, i) => tone({
    type, freq: base * Math.pow(2, s / 12), vol: vol * o.v,
    attack: 0.002, decay: step * 2.2, reverb: 1, at: t0 + i * step,
  }));
}

const SFX_NAMES = Object.keys(SFX);

/* ------------------------------------------------------------------ music */

// Tracks are described, not sequenced by hand: a progression plus per-voice patterns,
// and the melody is drawn from the current chord's scale with a seeded rng. That gives
// every loop a bit of variation without ever leaving the key.
const SCALE_MAJ = [0, 2, 4, 5, 7, 9, 11];
const SCALE_MIN = [0, 2, 3, 5, 7, 8, 10];

const TRACKS = {
  harbour: {
    bpm: 96, beats: 6, root: 220, scale: SCALE_MAJ, wave: 'triangle', bassWave: 'sine',
    prog: [[0, 'maj'], [5, 'maj'], [3, 'min'], [7, 'maj']],
    drums: 'waltz', density: 0.5, octave: 1, vol: 0.9, pad: true,
  },
  deck: {
    bpm: 104, beats: 8, root: 196, scale: SCALE_MAJ, wave: 'square', bassWave: 'triangle',
    prog: [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']],
    drums: 'groove', density: 0.55, octave: 1, vol: 0.8, pad: true,
  },
  deck_tense: {
    bpm: 126, beats: 8, root: 196, scale: SCALE_MIN, wave: 'square', bassWave: 'sawtooth',
    prog: [[0, 'min'], [0, 'min'], [8, 'maj'], [7, 'maj']],
    drums: 'drive', density: 0.75, octave: 1, vol: 0.85, pad: false,
  },
  boss: {
    bpm: 138, beats: 8, root: 146.83, scale: SCALE_MIN, wave: 'sawtooth', bassWave: 'sawtooth',
    prog: [[0, 'min'], [1, 'maj'], [0, 'min'], [10, 'maj']],
    drums: 'drive', density: 0.85, octave: 1, vol: 0.9, pad: false,
  },
  dock: {
    bpm: 112, beats: 6, root: 233.08, scale: SCALE_MAJ, wave: 'triangle', bassWave: 'sine',
    prog: [[0, 'maj'], [7, 'maj'], [5, 'maj'], [2, 'min']],
    drums: 'shanty', density: 0.6, octave: 1, vol: 0.85, pad: true,
  },
  gameover: {
    bpm: 62, beats: 4, root: 174.61, scale: SCALE_MIN, wave: 'triangle', bassWave: 'sine',
    prog: [[0, 'min'], [8, 'maj'], [3, 'min'], [0, 'min']],
    drums: 'none', density: 0.3, octave: 0, vol: 0.8, pad: true,
  },
  victory: {
    bpm: 120, beats: 8, root: 261.63, scale: SCALE_MAJ, wave: 'square', bassWave: 'triangle',
    prog: [[0, 'maj'], [5, 'maj'], [7, 'maj'], [0, 'maj']],
    drums: 'groove', density: 0.8, octave: 1, vol: 0.9, pad: true,
  },
};
const TRACK_NAMES = Object.keys(TRACKS);
const CHORD = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6] };

let cur = null;             // {name, def, gain, nextTime, bar, beat, rng, once, ended}
let timer = null;

function startTrack(name, o = {}) {
  const def = TRACKS[name];
  if (!ready || !def) return;
  const g = ctx.createGain();
  setP(g.gain, 0.0001);
  g.connect(musicBus);
  try {
    g.gain.cancelScheduledValues(now());
    g.gain.setValueAtTime(0.0001, now());
    g.gain.linearRampToValueAtTime(def.vol, now() + (o.fade !== undefined ? o.fade : 0.7));
  } catch (e) { /* stub */ }
  cur = {
    name, def, gain: g, nextTime: now() + 0.08, bar: 0, beat: 0,
    rng: makeRng('music/' + name), once: !!o.once, ended: false,
  };
  pump();
  if (timer === null && typeof setInterval === 'function') {
    timer = setInterval(pump, TICK);
    // harmless in a browser; lets a headless node harness exit instead of hanging
    if (timer && typeof timer.unref === 'function') timer.unref();
  }
}

function fadeOut(track, fade) {
  if (!track || !track.gain) return;
  const t0 = now();
  try {
    track.gain.gain.cancelScheduledValues(t0);
    track.gain.gain.setValueAtTime(Math.max(0.0001, track.gain.gain.value || 0.2), t0);
    track.gain.gain.linearRampToValueAtTime(0.0001, t0 + Math.max(0.05, fade));
  } catch (e) { /* stub */ }
  const kill = () => { try { track.gain.disconnect(); } catch (e) { /* stub */ } };
  if (typeof setTimeout === 'function') {
    const h = setTimeout(kill, Math.max(60, fade * 1000 + 80));
    if (h && typeof h.unref === 'function') h.unref();
  }
  track.ended = true;
}

/** Lookahead scheduler: fill the next AHEAD seconds, then go back to sleep. */
function pump() {
  if (!ready || !cur || cur.ended) return;
  const def = cur.def;
  const spb = 60 / def.bpm;
  let guard = 0;
  while (cur.nextTime < now() + AHEAD && guard++ < 64) {
    scheduleBeat(cur, cur.nextTime, spb);
    cur.nextTime += spb / 2;                  // eighth-note grid
    cur.beat += 0.5;
    if (cur.beat >= def.beats) {
      cur.beat = 0;
      cur.bar++;
      if (cur.once && cur.bar >= def.prog.length) { fadeOut(cur, 1.2); return; }
    }
  }
}

function scheduleBeat(track, at, spb) {
  const def = track.def;
  const r = track.rng;
  const chordIx = track.bar % def.prog.length;
  const [degree, quality] = def.prog[chordIx];
  const rootF = def.root * Math.pow(2, degree / 12);
  const chord = CHORD[quality] || CHORD.maj;
  const onBeat = Math.abs(track.beat % 1) < 0.01;
  const beatI = Math.floor(track.beat);
  const g = track.gain;

  const play = (o) => {
    if (!ready || voices >= MAX_VOICES) return;
    const osc = ctx.createOscillator();
    osc.type = o.type;
    setP(osc.frequency, Math.max(20, o.freq), at);
    const gg = ctx.createGain();
    let node = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter;
      setP(f.frequency, o.cutoff || 1800, at);
      setP(f.Q, o.q || 1);
      node.connect(f); node = f;
    }
    node.connect(gg);
    gg.connect(g);
    if (o.reverb && verbSend) gg.connect(verbSend);
    const end = env(gg, at, { vol: o.vol, attack: o.attack || 0.006, decay: o.decay || 0.2, sustain: o.sustain || 0, hold: o.hold || 0, release: o.release || 0.1 });
    voices++;
    const free = retire(osc, end + 0.02);
    try { osc.start(at); osc.stop(end + 0.02); } catch (e) { free(); }
  };

  const hit = (o) => {
    if (!ready || !noiseBuf || voices >= MAX_VOICES) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    setP(f.frequency, o.cutoff || 2400, at);
    setP(f.Q, o.q || 1);
    const gg = ctx.createGain();
    src.connect(f); f.connect(gg); gg.connect(g);
    const end = env(gg, at, { vol: o.vol, attack: 0.001, decay: o.decay || 0.06 });
    voices++;
    const free = retire(src, end + 0.02);
    try { src.start(at); src.stop(end + 0.02); } catch (e) { free(); }
  };

  // --- bass on the downbeat and the half bar
  if (onBeat && (beatI === 0 || beatI === Math.floor(def.beats / 2))) {
    play({ type: def.bassWave, freq: rootF / 2, vol: 0.3, attack: 0.008, decay: 0.28, sustain: 0.4, hold: spb * 0.4, release: 0.16, filter: 'lowpass', cutoff: 620 });
  } else if (onBeat && def.density > 0.6) {
    play({ type: def.bassWave, freq: rootF / 2 * Math.pow(2, chord[r.int(chord.length)] / 12), vol: 0.16, attack: 0.006, decay: 0.16, filter: 'lowpass', cutoff: 560 });
  }

  // --- pad / chord stab
  if (def.pad && onBeat && beatI % 2 === 0) {
    for (const semi of chord) {
      play({ type: 'triangle', freq: rootF * Math.pow(2, semi / 12), vol: 0.075, attack: 0.05, decay: 0.4, sustain: 0.5, hold: spb * 0.8, release: 0.4, reverb: 1, filter: 'lowpass', cutoff: 1500 });
    }
  } else if (!def.pad && onBeat && beatI % 4 === 2) {
    for (const semi of chord) {
      play({ type: 'sawtooth', freq: rootF * Math.pow(2, semi / 12), vol: 0.06, attack: 0.004, decay: 0.14, filter: 'lowpass', cutoff: 1100 });
    }
  }

  // --- melody, drawn from the chord scale
  if (r.chance(def.density)) {
    const scale = def.scale;
    const semi = scale[r.int(scale.length)] + (r.chance(0.3) ? 12 : 0) + degree;
    play({
      type: def.wave, freq: rootF * 2 * Math.pow(2, semi / 12) * (def.octave ? 1 : 0.5),
      vol: 0.09, attack: 0.004, decay: spb * 0.55, reverb: 1, filter: 'lowpass', cutoff: 2600,
    });
  }

  // --- drums
  const dk = def.drums;
  if (dk === 'none') return;
  if (dk === 'waltz') {
    if (onBeat && beatI % 3 === 0) hit({ vol: 0.2, filter: 'lowpass', cutoff: 160, decay: 0.1 });
    else if (onBeat) hit({ vol: 0.07, filter: 'highpass', cutoff: 5200, decay: 0.05 });
  } else if (dk === 'shanty') {
    if (onBeat && beatI % 3 === 0) hit({ vol: 0.2, filter: 'lowpass', cutoff: 170, decay: 0.1 });
    if (onBeat && beatI % 3 === 2) hit({ vol: 0.12, filter: 'bandpass', cutoff: 1800, q: 0.8, decay: 0.09 });
    if (!onBeat) hit({ vol: 0.05, filter: 'highpass', cutoff: 6000, decay: 0.03 });
  } else if (dk === 'groove') {
    if (onBeat && beatI % 4 === 0) hit({ vol: 0.24, filter: 'lowpass', cutoff: 150, decay: 0.11 });
    if (onBeat && beatI % 4 === 2) hit({ vol: 0.15, filter: 'bandpass', cutoff: 1700, q: 0.7, decay: 0.09 });
    if (!onBeat) hit({ vol: 0.055, filter: 'highpass', cutoff: 6200, decay: 0.035 });
  } else if (dk === 'drive') {
    if (onBeat) hit({ vol: 0.22, filter: 'lowpass', cutoff: 145, decay: 0.09 });
    if (onBeat && beatI % 4 === 2) hit({ vol: 0.16, filter: 'bandpass', cutoff: 1900, q: 0.7, decay: 0.08 });
    hit({ vol: 0.06, filter: 'highpass', cutoff: 6800, decay: 0.03 });
  }
}

/* ------------------------------------------------------------------- API */

export const Audio = {
  init,

  unlock() {
    init();
    if (!ctx) return;
    try { if (ctx.state === 'suspended' && ctx.resume) ctx.resume(); } catch (e) { /* stub */ }
  },

  suspend() { try { if (ctx && ctx.suspend) ctx.suspend(); } catch (e) { /* stub */ } },
  resume() { try { if (ctx && ctx.resume) ctx.resume(); } catch (e) { /* stub */ } },

  isReady() { return ready; },
  get muted() { return muted; },

  toggleMute() {
    muted = !muted;
    if (master) setP(master.gain, muted ? 0 : volMaster);
    return muted;
  },

  setMaster(v) { volMaster = clamp01(v); if (master && !muted) setP(master.gain, volMaster); },
  setSfx(v) { volSfx = clamp01(v); if (sfxBus) setP(sfxBus.gain, volSfx); },
  setMusic(v) { volMusic = clamp01(v); if (musicBus) setP(musicBus.gain, volMusic); },

  listSfx() { return SFX_NAMES.slice(); },
  listTracks() { return TRACK_NAMES.slice(); },

  /** sfx(name, {vol, rate, pan, detune, delay}) */
  sfx(name, o = {}) {
    const fn = SFX[name];
    if (!fn) return;
    if (!ready) { init(); if (!ready) return; }
    const t = now();
    const prev = lastFired[name];
    // Merge machine-gun repeats, but let the merged one through with a new pitch so a
    // break still sounds like many balls rather than one.
    let variation = 0.5;
    if (prev !== undefined && t - prev < COALESCE) return;
    lastFired[name] = t;
    if (prev !== undefined) variation = ((t - prev) * 37) % 1;
    const at = t + Math.max(0, o.delay || 0);
    try {
      fn({
        v: o.vol !== undefined ? clamp01(o.vol) : 1,
        pan: o.pan,
        at,
        rate: o.rate,
      }, variation);
    } catch (e) { /* one bad sound must never take a frame down */ }
  },

  /** music(track, {fade, once}) — crossfades from whatever is playing. */
  music(name, o = {}) {
    if (!TRACKS[name]) return;
    if (!ready) { init(); if (!ready) return; }
    if (cur && cur.name === name && !cur.ended) return;
    if (cur) fadeOut(cur, o.fade !== undefined ? o.fade : 0.6);
    startTrack(name, o);
  },

  stopMusic(fade = 0.5) {
    if (cur) fadeOut(cur, fade);
    cur = null;
    if (timer !== null && typeof clearInterval === 'function') { clearInterval(timer); timer = null; }
  },

  /** Temporarily pull the music down so a score readout can be heard over it. */
  duck(amount = 0.4, dur = 0.5) {
    if (!ready || !musicBus) return;
    const t0 = now();
    try {
      musicBus.gain.cancelScheduledValues(t0);
      musicBus.gain.setValueAtTime(Math.max(0.0001, volMusic), t0);
      musicBus.gain.linearRampToValueAtTime(Math.max(0.0001, volMusic * (1 - clamp01(amount))), t0 + 0.05);
      musicBus.gain.linearRampToValueAtTime(Math.max(0.0001, volMusic), t0 + Math.max(0.1, dur));
    } catch (e) { /* stub */ }
  },

  /** Diagnostics for the test harness. */
  debug() { return { ready, failed, voices, muted, track: cur ? cur.name : null }; },
};

function clamp01(v) { return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0; }

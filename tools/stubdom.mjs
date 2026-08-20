// Install a browser-ish global environment backed by the software canvas, so the whole
// game (renderers included) can run under plain node.
import { SoftCanvas } from './softcanvas.mjs';

export function installDom(o = {}) {
  const g = globalThis;
  if (g.__ARK_DOM__) return g.__ARK_DOM__;
  const noop = () => {};
  const listeners = Object.create(null);
  const made = [];

  const mkCanvas = (w = 1, h = 1) => {
    const c = new SoftCanvas(Math.max(1, w | 0), Math.max(1, h | 0));
    made.push(c);
    return c;
  };

  const classList = () => {
    const set = new Set();
    return {
      add: (...c) => c.forEach((x) => set.add(x)),
      remove: (...c) => c.forEach((x) => set.delete(x)),
      toggle: (c, on) => { const want = on === undefined ? !set.has(c) : !!on; if (want) set.add(c); else set.delete(c); return want; },
      contains: (c) => set.has(c),
    };
  };

  const el = () => ({
    style: {}, classList: classList(),
    addEventListener: noop, removeEventListener: noop, appendChild: noop, remove: noop,
    querySelector: () => null, textContent: '', innerHTML: '', hidden: false,
  });

  const main = mkCanvas(o.w || 640, o.h || 360);

  g.document = {
    createElement: (t) => (t === 'canvas' ? mkCanvas() : el()),
    getElementById: (id) => (id === 'game' ? main : null),
    querySelector: () => null,
    addEventListener: noop, removeEventListener: noop,
    body: Object.assign(el(), { appendChild: noop, classList: classList() }),
    documentElement: Object.assign(el(), { requestFullscreen: () => Promise.resolve() }),
    fullscreenElement: null,
    exitFullscreen: () => Promise.resolve(),
  };

  g.window = {
    innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    addEventListener: (n, f) => { (listeners[n] = listeners[n] || []).push(f); },
    removeEventListener: noop,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: noop,
    localStorage: null,
    location: { href: 'http://localhost/' },
  };
  g.addEventListener = g.window.addEventListener;
  g.removeEventListener = noop;
  g.requestAnimationFrame = () => 0;
  g.cancelAnimationFrame = noop;
  g.performance = g.performance || { now: () => 0 };
  g.OffscreenCanvas = function (w, h) { return mkCanvas(w, h); };
  g.HTMLCanvasElement = SoftCanvas;
  g.Image = function () { return mkCanvas(1, 1); };

  // AudioContext that records instead of playing.
  const rec = { nodes: 0, connects: 0, params: 0, starts: 0, stops: 0, errors: [] };
  function param(v = 0) {
    return {
      value: v,
      setValueAtTime: (x, t) => { rec.params++; check(x, t); return this; },
      linearRampToValueAtTime: (x, t) => { rec.params++; check(x, t); },
      exponentialRampToValueAtTime: (x, t) => { rec.params++; check(x, t); },
      setTargetAtTime: (x, t) => { rec.params++; check(x, t); },
      cancelScheduledValues: () => {},
      setValueCurveAtTime: () => { rec.params++; },
    };
  }
  function check(x, t) {
    if (!Number.isFinite(x) || !Number.isFinite(t)) rec.errors.push(`non-finite audio param ${x} @ ${t}`);
  }
  function node(extra = {}) {
    rec.nodes++;
    return Object.assign({
      connect: () => { rec.connects++; return node(); },
      disconnect: noop,
      start: () => { rec.starts++; },
      stop: () => { rec.stops++; },
      gain: param(1), frequency: param(440), detune: param(0), Q: param(1),
      playbackRate: param(1), pan: param(0),
      threshold: param(-20), knee: param(30), ratio: param(12), attack: param(0), release: param(0.25),
      type: 'sine', buffer: null, loop: false, curve: null, oversample: 'none',
      onended: null,
    }, extra);
  }
  g.AudioContext = function () {
    return {
      currentTime: 0, sampleRate: 48000, state: 'running',
      destination: node(),
      resume: () => Promise.resolve(), suspend: () => Promise.resolve(), close: () => Promise.resolve(),
      createOscillator: () => node(), createGain: () => node(), createBiquadFilter: () => node(),
      createBufferSource: () => node(), createConvolver: () => node(), createDynamicsCompressor: () => node(),
      createStereoPanner: () => node(), createWaveShaper: () => node(), createDelay: () => node(),
      createAnalyser: () => node({ fftSize: 2048 }), createChannelMerger: () => node(), createPanner: () => node(),
      createBuffer: (ch, len, sr) => ({
        numberOfChannels: ch, length: len, sampleRate: sr, duration: len / sr,
        getChannelData: () => new Float32Array(len),
      }),
      createPeriodicWave: () => ({}),
      audioWorklet: { addModule: () => Promise.resolve() },
    };
  };
  g.webkitAudioContext = g.AudioContext;

  const dom = { canvas: main, canvases: made, audio: rec, fire(n, e) { (listeners[n] || []).forEach((f) => f(e || {})); } };
  g.__ARK_DOM__ = dom;
  return dom;
}

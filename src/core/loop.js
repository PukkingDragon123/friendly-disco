// Fixed-timestep-ish game loop and a scene stack.
//
// Scenes are plain objects: { enter(args), exit(), update(dt), draw(g), event(name,data) }
// All are optional. Scenes are pushed/popped/replaced; only the top scene updates, but
// scenes below it can opt into being drawn (scene.drawBelow = true on the TOP scene).

import { Input } from './input.js';
import { Juice } from './juice.js';
import { W, H } from './pixel.js';

export function createGame(canvas) {
  const g = canvas.getContext('2d', { alpha: false });
  g.imageSmoothingEnabled = false;

  const stack = [];
  let scale = 1;
  let raf = 0;
  let last = 0;
  let acc = 0;
  let running = false;
  const fpsRing = new Array(30).fill(16);
  let fpsI = 0;

  function fit() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const raw = Math.min(vw / W, vh / H);
    // Desktop snaps to an integer scale so every game pixel is a clean square. Phones
    // rarely offer an integer fit, and letterboxing a 640x360 game down to 1x on a
    // 390pt screen wastes most of the display, so below 2x we take the fractional scale
    // and let `image-rendering: pixelated` keep the edges hard.
    scale = raw >= 2 ? Math.floor(raw) : Math.max(0.5, raw);
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = Math.round(W * scale) + 'px';
    canvas.style.height = Math.round(H * scale) + 'px';
    g.imageSmoothingEnabled = false;
    api.portrait = vh > vw;
    api.touch = ('ontouchstart' in window) || (navigator && navigator.maxTouchPoints > 0);
    if (document.body && document.body.classList) {
      document.body.classList.toggle('portrait', api.portrait && api.touch);
    }
  }

  const api = {
    g,
    canvas,
    get scale() { return scale; },
    get scene() { return stack[stack.length - 1]; },
    get depth() { return stack.length; },
    get fps() { return Math.round(1000 / (fpsRing.reduce((a, b) => a + b, 0) / fpsRing.length)); },
    time: 0,
    frame: 0,
    portrait: false,
    touch: false,

    /** Fullscreen is the difference between a playable phone game and a toy. */
    async fullscreen(on) {
      const el = document.documentElement;
      try {
        if (on === false || document.fullscreenElement) {
          if (document.exitFullscreen) await document.exitFullscreen();
        } else if (el.requestFullscreen) {
          await el.requestFullscreen({ navigationUI: 'hide' });
        }
      } catch (e) { /* refused; the game is still playable windowed */ }
      if (screen && screen.orientation && screen.orientation.lock) {
        try { await screen.orientation.lock('landscape'); } catch (e) { /* not supported */ }
      }
      fit();
    },

    push(scene, args) {
      const prev = api.scene;
      if (prev && prev.pause) prev.pause();
      stack.push(scene);
      if (scene.enter) scene.enter(args, api);
      return scene;
    },

    pop(result) {
      const s = stack.pop();
      if (s && s.exit) s.exit(result);
      const now = api.scene;
      if (now && now.resume) now.resume(result);
      return s;
    },

    replace(scene, args) {
      while (stack.length) { const s = stack.pop(); if (s && s.exit) s.exit(); }
      Juice.reset();
      return api.push(scene, args);
    },

    /** Swap the top scene, leaving anything beneath intact. */
    swap(scene, args) {
      const s = stack.pop();
      if (s && s.exit) s.exit();
      return api.push(scene, args);
    },

    fit,

    start() {
      if (running) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(step);
    },

    stop() { running = false; cancelAnimationFrame(raf); },
  };

  function step(now) {
    if (!running) return;
    raf = requestAnimationFrame(step);
    const rawMs = Math.min(100, now - last);
    last = now;
    fpsRing[fpsI = (fpsI + 1) % fpsRing.length] = Math.max(1, rawMs);

    // clamp so a tab-switch never teleports the physics
    let dt = Math.min(1 / 30, rawMs / 1000);
    api.time += dt;
    api.frame++;

    const ts = Juice.timeScale;
    Juice.update(dt);

    const top = api.scene;
    if (top && top.update) top.update(dt * ts, api, dt);

    // --- draw ---
    g.imageSmoothingEnabled = false;
    if (top && top.drawBelow && stack.length > 1) {
      const below = stack[stack.length - 2];
      if (below && below.draw) { Juice.applyCamera(g); below.draw(g, api); Juice.restore(g); }
    }
    Juice.applyCamera(g);
    if (top && top.draw) top.draw(g, api);
    Juice.restore(g);
    Juice.drawPops(g);
    if (top && top.drawUI) top.drawUI(g, api);
    Juice.drawOverlay(g);

    Input.consume(dt);
  }

  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', () => setTimeout(fit, 120));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', () => setTimeout(fit, 60));
  fit();
  Input.attach(canvas, () => scale);

  return api;
}

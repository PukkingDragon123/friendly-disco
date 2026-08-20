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
    const pad = 0;
    const s = Math.max(1, Math.floor(Math.min(
      (window.innerWidth - pad) / W,
      (window.innerHeight - pad) / H,
    )));
    scale = s;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W * s + 'px';
    canvas.style.height = H * s + 'px';
    g.imageSmoothingEnabled = false;
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

    Input.consume();
  }

  window.addEventListener('resize', fit);
  fit();
  Input.attach(canvas, () => scale);

  return api;
}

// Mouse + keyboard state, in game-space (640x360) coordinates.
//
// The canvas is integer-scaled to the window, so raw client coords are divided by the
// current scale. `getScale` is a callback because the scale changes on resize.

export const Input = {
  mouse: { x: 320, y: 180, px: 320, py: 180, dx: 0, dy: 0, down: false, pressed: false, released: false, rightDown: false, rightPressed: false, wheel: 0, inside: false, downX: 0, downY: 0, dragDist: 0 },
  keys: Object.create(null),
  _pressed: Object.create(null),
  _released: Object.create(null),
  _anyPressed: false,
  _typed: '',
  touch: false,

  attach(canvas, getScale) {
    const map = (e) => {
      const r = canvas.getBoundingClientRect();
      const s = getScale ? getScale() : 1;
      const m = this.mouse;
      m.x = Math.max(0, Math.min(639, (e.clientX - r.left) / s));
      m.y = Math.max(0, Math.min(359, (e.clientY - r.top) / s));
    };

    canvas.addEventListener('mousemove', (e) => { map(e); this.mouse.inside = true; });
    canvas.addEventListener('mouseenter', () => { this.mouse.inside = true; });
    canvas.addEventListener('mouseleave', () => { this.mouse.inside = false; });

    canvas.addEventListener('mousedown', (e) => {
      map(e);
      const m = this.mouse;
      if (e.button === 2) { m.rightDown = true; m.rightPressed = true; }
      else { m.down = true; m.pressed = true; m.downX = m.x; m.downY = m.y; m.dragDist = 0; }
      e.preventDefault();
    });

    window.addEventListener('mouseup', (e) => {
      const m = this.mouse;
      if (e.button === 2) m.rightDown = false;
      else if (m.down) { m.down = false; m.released = true; }
    });

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });

    // Touch: treat as a single mouse pointer so the game is playable on a tablet.
    const tmap = (e) => {
      const t = e.touches[0] || e.changedTouches[0];
      if (!t) return;
      const r = canvas.getBoundingClientRect();
      const s = getScale ? getScale() : 1;
      const m = this.mouse;
      m.x = Math.max(0, Math.min(639, (t.clientX - r.left) / s));
      m.y = Math.max(0, Math.min(359, (t.clientY - r.top) / s));
    };
    canvas.addEventListener('touchstart', (e) => {
      this.touch = true; tmap(e);
      const m = this.mouse;
      m.down = true; m.pressed = true; m.inside = true; m.downX = m.x; m.downY = m.y; m.dragDist = 0;
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => { tmap(e); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      tmap(e);
      const m = this.mouse;
      if (m.down) { m.down = false; m.released = true; }
      e.preventDefault();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (!this.keys[e.code]) this._pressed[e.code] = true;
      this.keys[e.code] = true;
      this._anyPressed = true;
      if (e.key && e.key.length === 1) this._typed += e.key;
      // don't swallow devtools / reload
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this._released[e.code] = true;
    });
    window.addEventListener('blur', () => {
      this.keys = Object.create(null);
      this.mouse.down = false;
      this.mouse.rightDown = false;
    });
  },

  key(code) { return !!this.keys[code]; },
  pressed(code) { return !!this._pressed[code]; },
  releasedKey(code) { return !!this._released[code]; },
  anyPressed() { return this._anyPressed || this.mouse.pressed; },
  typed() { return this._typed; },

  /** Advance per-frame edge state. Called by the loop AFTER update+draw. */
  consume() {
    const m = this.mouse;
    m.dx = m.x - m.px; m.dy = m.y - m.py;
    if (m.down) m.dragDist += Math.hypot(m.dx, m.dy);
    m.px = m.x; m.py = m.y;
    m.pressed = false; m.released = false; m.rightPressed = false; m.wheel = 0;
    this._pressed = Object.create(null);
    this._released = Object.create(null);
    this._anyPressed = false;
    this._typed = '';
  },
};

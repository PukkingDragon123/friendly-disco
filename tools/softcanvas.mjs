// A tiny software Canvas2D, enough to run this game's renderer headlessly and dump a PNG.
//
// The game only ever uses fillRect / drawImage / save / restore / translate / scale /
// clip(rect) / globalAlpha — deliberately, because that is also the subset that keeps
// pixel art crisp. So a 200-line rasterizer can reproduce a frame exactly, which means
// we can actually LOOK at the game from a node test instead of hoping.

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

const NAMED = { white: [247, 244, 232], black: [0, 0, 0], transparent: [0, 0, 0, 0] };

export function parseColor(s) {
  if (typeof s !== 'string') return [255, 0, 255, 1];
  const t = s.trim();
  if (t[0] === '#') {
    if (t.length === 7) return [parseInt(t.slice(1, 3), 16), parseInt(t.slice(3, 5), 16), parseInt(t.slice(5, 7), 16), 1];
    if (t.length === 4) return [parseInt(t[1] + t[1], 16), parseInt(t[2] + t[2], 16), parseInt(t[3] + t[3], 16), 1];
    if (t.length === 9) return [parseInt(t.slice(1, 3), 16), parseInt(t.slice(3, 5), 16), parseInt(t.slice(5, 7), 16), parseInt(t.slice(7, 9), 16) / 255];
  }
  let m = /^rgba?\(([^)]+)\)$/.exec(t);
  if (m) {
    const p = m[1].split(',').map((x) => parseFloat(x));
    return [clamp255(p[0]), clamp255(p[1]), clamp255(p[2]), p.length > 3 ? p[3] : 1];
  }
  if (NAMED[t]) { const n = NAMED[t]; return [n[0], n[1], n[2], n.length > 3 ? n[3] : 1]; }
  return [255, 0, 255, 1];
}

class Ctx {
  constructor(cv) {
    this.canvas = cv;
    this._st = [];
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.globalAlpha = 1;
    this.imageSmoothingEnabled = false;
    this.lineWidth = 1;
    this.tx = 0; this.ty = 0; this.sx = 1; this.sy = 1;
    this.clipX = 0; this.clipY = 0; this.clipW = cv.width; this.clipH = cv.height;
    this._path = null;
  }

  save() {
    this._st.push({
      fillStyle: this.fillStyle, globalAlpha: this.globalAlpha,
      tx: this.tx, ty: this.ty, sx: this.sx, sy: this.sy,
      clipX: this.clipX, clipY: this.clipY, clipW: this.clipW, clipH: this.clipH,
    });
  }

  restore() {
    const s = this._st.pop();
    if (!s) return;
    Object.assign(this, s);
  }

  translate(x, y) { this.tx += x * this.sx; this.ty += y * this.sy; }
  scale(x, y) { this.sx *= x; this.sy *= y; }
  setTransform(a, b, c, d, e, f) { this.sx = a; this.sy = d; this.tx = e; this.ty = f; }
  rotate() { /* the game never rotates the context */ }

  beginPath() { this._path = null; }
  rect(x, y, w, h) { this._path = { x, y, w, h }; }
  clip() {
    if (!this._path) return;
    const x0 = this.tx + this._path.x * this.sx, y0 = this.ty + this._path.y * this.sy;
    const x1 = x0 + this._path.w * this.sx, y1 = y0 + this._path.h * this.sy;
    const nx = Math.max(this.clipX, Math.min(x0, x1));
    const ny = Math.max(this.clipY, Math.min(y0, y1));
    const nx2 = Math.min(this.clipX + this.clipW, Math.max(x0, x1));
    const ny2 = Math.min(this.clipY + this.clipH, Math.max(y0, y1));
    this.clipX = nx; this.clipY = ny;
    this.clipW = Math.max(0, nx2 - nx); this.clipH = Math.max(0, ny2 - ny);
  }
  closePath() {}
  fill() { if (this._path) this.fillRect(this._path.x, this._path.y, this._path.w, this._path.h); }
  stroke() {}
  moveTo() {} lineTo() {} arc() {} ellipse() {} quadraticCurveTo() {} bezierCurveTo() {}
  createLinearGradient() { return { addColorStop() {} }; }
  createPattern() { return null; }
  measureText(s) { return { width: String(s).length * 6 }; }
  fillText() {} strokeText() {}
  setLineDash() {}
  clearRect(x, y, w, h) { const f = this.fillStyle; this.fillStyle = 'rgba(0,0,0,0)'; this._raw(x, y, w, h, [0, 0, 0, 0], true); this.fillStyle = f; }

  fillRect(x, y, w, h) {
    const c = parseColor(this.fillStyle);
    const a = c[3] * this.globalAlpha;
    if (a <= 0) return;
    this._raw(x, y, w, h, [c[0], c[1], c[2], a], false);
  }

  _raw(x, y, w, h, rgba, replace) {
    const cv = this.canvas;
    let x0 = Math.round(this.tx + x * this.sx);
    let y0 = Math.round(this.ty + y * this.sy);
    let x1 = Math.round(this.tx + (x + w) * this.sx);
    let y1 = Math.round(this.ty + (y + h) * this.sy);
    if (x1 < x0) { const t = x0; x0 = x1; x1 = t; }
    if (y1 < y0) { const t = y0; y0 = y1; y1 = t; }
    x0 = Math.max(x0, Math.ceil(this.clipX), 0);
    y0 = Math.max(y0, Math.ceil(this.clipY), 0);
    x1 = Math.min(x1, Math.floor(this.clipX + this.clipW), cv.width);
    y1 = Math.min(y1, Math.floor(this.clipY + this.clipH), cv.height);
    const d = cv.data;
    const [r, g, b, a] = rgba;
    for (let py = y0; py < y1; py++) {
      let i = (py * cv.width + x0) * 4;
      for (let pxx = x0; pxx < x1; pxx++, i += 4) {
        if (replace || a >= 1) { d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = replace ? a * 255 : 255; }
        else {
          d[i] = d[i] + (r - d[i]) * a;
          d[i + 1] = d[i + 1] + (g - d[i + 1]) * a;
          d[i + 2] = d[i + 2] + (b - d[i + 2]) * a;
          d[i + 3] = Math.max(d[i + 3], a * 255);
        }
      }
    }
  }

  /** Supports all three signatures: (src,dx,dy), (src,dx,dy,dw,dh) and
   *  (src,sx,sy,sw,sh,dx,dy,dw,dh). Nearest-neighbour, like the real thing with
   *  imageSmoothingEnabled = false. */
  drawImage(src, a1, a2, a3, a4, a5, a6, a7, a8) {
    if (!src || !src.data) return;
    let sx0 = 0, sy0 = 0, sw = src.width, sh = src.height, dx, dy, dw, dh;
    if (a5 !== undefined) {
      sx0 = a1; sy0 = a2; sw = a3; sh = a4; dx = a5; dy = a6;
      dw = a7 !== undefined ? a7 : sw; dh = a8 !== undefined ? a8 : sh;
    } else {
      dx = a1; dy = a2;
      dw = a3 !== undefined ? a3 : sw; dh = a4 !== undefined ? a4 : sh;
    }
    if (sw <= 0 || sh <= 0 || dw === 0 || dh === 0) return;

    const cv = this.canvas;
    const X0 = this.tx + dx * this.sx, Y0 = this.ty + dy * this.sy;
    const W = dw * this.sx, H = dh * this.sy;
    const flipX = W < 0, flipY = H < 0;
    const aW = Math.abs(W), aH = Math.abs(H);
    const left = Math.min(X0, X0 + W), top = Math.min(Y0, Y0 + H);
    const ix0 = Math.max(Math.round(left), Math.ceil(this.clipX), 0);
    const iy0 = Math.max(Math.round(top), Math.ceil(this.clipY), 0);
    const ix1 = Math.min(Math.round(left + aW), Math.floor(this.clipX + this.clipW), cv.width);
    const iy1 = Math.min(Math.round(top + aH), Math.floor(this.clipY + this.clipH), cv.height);
    const ga = this.globalAlpha;
    const d = cv.data;
    for (let py = iy0; py < iy1; py++) {
      let v = (py + 0.5 - top) / aH;
      if (flipY) v = 1 - v;
      const syy = Math.min(src.height - 1, Math.max(0, sy0 + Math.floor(v * sh)));
      for (let pxx = ix0; pxx < ix1; pxx++) {
        let u = (pxx + 0.5 - left) / aW;
        if (flipX) u = 1 - u;
        const sxx = Math.min(src.width - 1, Math.max(0, sx0 + Math.floor(u * sw)));
        const si = (syy * src.width + sxx) * 4;
        const sa = (src.data[si + 3] / 255) * ga;
        if (sa <= 0) continue;
        const di = (py * cv.width + pxx) * 4;
        if (sa >= 1) { d[di] = src.data[si]; d[di + 1] = src.data[si + 1]; d[di + 2] = src.data[si + 2]; d[di + 3] = 255; }
        else {
          d[di] += (src.data[si] - d[di]) * sa;
          d[di + 1] += (src.data[si + 1] - d[di + 1]) * sa;
          d[di + 2] += (src.data[si + 2] - d[di + 2]) * sa;
          d[di + 3] = Math.max(d[di + 3], sa * 255);
        }
      }
    }
  }

  getImageData(x, y, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const s = ((y + j) * this.canvas.width + (x + i)) * 4;
        const d = (j * w + i) * 4;
        for (let k = 0; k < 4; k++) out[d + k] = this.canvas.data[s + k];
      }
    }
    return { data: out, width: w, height: h };
  }
  putImageData() {}
  createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h }; }
}

export class SoftCanvas {
  constructor(w, h) {
    this._w = Math.max(1, w | 0); this._h = Math.max(1, h | 0);
    this.data = new Uint8ClampedArray(this._w * this._h * 4);
    this.style = {};
    this._ctx = null;
  }

  // Real canvases reallocate (and clear) their backing store when width/height are
  // assigned. pixel.makeCanvas() relies on exactly that, so mirror it.
  get width() { return this._w; }
  set width(v) {
    const n = Math.max(1, v | 0);
    if (n === this._w) return;
    this._w = n;
    this.data = new Uint8ClampedArray(this._w * this._h * 4);
    if (this._ctx) this._ctx = null;
  }
  get height() { return this._h; }
  set height(v) {
    const n = Math.max(1, v | 0);
    if (n === this._h) return;
    this._h = n;
    this.data = new Uint8ClampedArray(this._w * this._h * 4);
    if (this._ctx) this._ctx = null;
  }
  getContext() { if (!this._ctx) this._ctx = new Ctx(this); return this._ctx; }
  addEventListener() {}
  removeEventListener() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: this.width, height: this.height }; }
  toDataURL() { return ''; }
}

/* ------------------------------------------------------------------- PNG */

const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

/** Write a SoftCanvas to a PNG, nearest-neighbour scaled by `scale`. */
export function writePNG(canvas, path, scale = 1) {
  const w = canvas.width * scale, h = canvas.height * scale;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  let o = 0;
  for (let y = 0; y < h; y++) {
    raw[o++] = 0;
    const sy = Math.floor(y / scale);
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(x / scale);
      const i = (sy * canvas.width + sx) * 4;
      raw[o++] = canvas.data[i];
      raw[o++] = canvas.data[i + 1];
      raw[o++] = canvas.data[i + 2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  return { path, w, h, bytes: png.length };
}

/** ASCII dump for quick eyeballing in a terminal. */
export function toAscii(canvas, cols = 120) {
  const ramp = ' .:-=+*#%@';
  const step = Math.max(1, Math.floor(canvas.width / cols));
  let out = '';
  for (let y = 0; y < canvas.height; y += step * 2) {
    for (let x = 0; x < canvas.width; x += step) {
      const i = (y * canvas.width + x) * 4;
      const l = (canvas.data[i] * 0.3 + canvas.data[i + 1] * 0.59 + canvas.data[i + 2] * 0.11) / 255;
      out += ramp[Math.min(ramp.length - 1, Math.floor(l * ramp.length))];
    }
    out += '\n';
  }
  return out;
}

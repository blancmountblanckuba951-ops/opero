'use strict';
/* Minimalne DOMMatrix i Path2D dla pdf.js w procesie glownym Electrona.
   Program NIE rysuje stron w procesie glownym – czyta tekst i wyciaga obrazy
   skanow. pdf.js tworzy jednak te obiekty przy wczytaniu modulu. */
if (typeof globalThis.DOMMatrix === 'undefined') {
  class DOMMatrix {
    constructor(init) { const m = Array.isArray(init) && init.length >= 6 ? init : [1, 0, 0, 1, 0, 0]; [this.a, this.b, this.c, this.d, this.e, this.f] = m.map(Number); this.is2D = true; }
    get isIdentity() { return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0; }
    multiplySelf(o) { const m = o instanceof DOMMatrix ? o : new DOMMatrix(o && [o.a, o.b, o.c, o.d, o.e, o.f]); const { a, b, c, d, e, f } = this;
      this.a = a * m.a + c * m.b; this.b = b * m.a + d * m.b; this.c = a * m.c + c * m.d; this.d = b * m.c + d * m.d; this.e = a * m.e + c * m.f + e; this.f = b * m.e + d * m.f + f; return this; }
    preMultiplySelf(o) { const m = new DOMMatrix([o.a, o.b, o.c, o.d, o.e, o.f]); m.multiplySelf(this); Object.assign(this, { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f }); return this; }
    multiply(o) { return new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).multiplySelf(o); }
    translateSelf(x = 0, y = 0) { return this.multiplySelf(new DOMMatrix([1, 0, 0, 1, x, y])); }
    translate(x, y) { return new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).translateSelf(x, y); }
    scaleSelf(sx = 1, sy = sx) { return this.multiplySelf(new DOMMatrix([sx, 0, 0, sy, 0, 0])); }
    scale(sx, sy) { return new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).scaleSelf(sx, sy); }
    invertSelf() { const { a, b, c, d, e, f } = this, det = a * d - b * c; if (!det) { [this.a, this.b, this.c, this.d, this.e, this.f] = [NaN, NaN, NaN, NaN, NaN, NaN]; return this; }
      this.a = d / det; this.b = -b / det; this.c = -c / det; this.d = a / det; this.e = (c * f - d * e) / det; this.f = (b * e - a * f) / det; return this; }
    inverse() { return new DOMMatrix([this.a, this.b, this.c, this.d, this.e, this.f]).invertSelf(); }
    transformPoint(p = {}) { const x = p.x || 0, y = p.y || 0; return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 }; }
  }
  globalThis.DOMMatrix = DOMMatrix;
}
if (typeof globalThis.Path2D === 'undefined') globalThis.Path2D = class Path2D { addPath() {} moveTo() {} lineTo() {} bezierCurveTo() {} quadraticCurveTo() {} closePath() {} rect() {} };
if (typeof globalThis.ImageData === 'undefined') globalThis.ImageData = class ImageData { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };

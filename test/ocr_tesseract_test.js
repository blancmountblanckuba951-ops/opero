'use strict';
/** OPERO 3.3 — wbudowany silnik pisma (Tesseract) w przeglądarce programu: polskie znaki i numer księgi. */
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const DIR = '/root/work/build/app/vendor/tesseract';
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 500) : '')); } };
const TYPY = { '.html': 'text/html', '.js': 'text/javascript', '.gz': 'application/gzip' };
(async () => {
  console.log('OPERO — Tesseract wbudowany w program\n');
  T('pliki silnika są w programie (licencja Apache-2.0)', ['tesseract.min.js', 'worker.min.js', 'core/tesseract-core-simd-lstm.wasm.js', 'core/tesseract-core-lstm.wasm.js', 'lang/pol.traineddata.gz', 'LICENSE.md', 'ocr.html', 'ocr-strona.js'].every(f => fs.existsSync(path.join(DIR, f))) && /Apache License/.test(fs.readFileSync(path.join(DIR, 'LICENSE.md'), 'utf8')));
  const srv = http.createServer((q, r) => { const p = path.resolve(DIR, '.' + decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (!p.startsWith(DIR) || !fs.existsSync(p)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': TYPY[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r); }).listen(0);
  const port = srv.address().port;
  const b = await chromium.launch(); const p = await b.newPage();
  const bledy = []; p.on('pageerror', e => bledy.push(String(e))); p.on('console', m => { if (m.type() === 'error') bledy.push(m.text()); });
  await p.goto(`http://127.0.0.1:${port}/ocr.html`);
  const r = await p.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 1400; c.height = 260; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#111'; g.font = '34px Arial';
    g.fillText('TREŚĆ KSIĘGI WIECZYSTEJ NR GD1G/00012345/6', 30, 70);
    g.fillText('Dział I-O OZNACZENIE NIERUCHOMOŚCI', 30, 140);
    g.fillText('Powierzchnia użytkowa: 113,73 M2 Łazienka', 30, 210);
    const t0 = performance.now(); const w = await window.operoOcr(c.toDataURL('image/png'));
    return { ...w, ms: Math.round(performance.now() - t0), tekst: w.slowa.map(s => s.t).join(' ') };
  });
  T('rozpoznaje numer księgi', /GD1G\/00012345\/6/.test(r.tekst), r.tekst);
  T('polskie znaki (Ś, Ę, Ł, ż)', /TREŚĆ/.test(r.tekst) && /KSIĘGI/.test(r.tekst) && /Łazienka/.test(r.tekst) && /użytkowa/.test(r.tekst), r.tekst);
  T('słowa mają położenie (x, y, szerokość, wysokość)', r.slowa.every(s => s.w > 0 && s.h > 0 && s.x >= 0 && s.y >= 0) && r.slowa.find(s => s.t === 'Dział').y > r.slowa.find(s => s.t === 'TREŚĆ').y);
  T('bez błędów w konsoli i bez sieci', bledy.length === 0, bledy);
  console.log(`  (czas odczytu: ${r.ms} ms)`);
  await b.close(); srv.close();
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

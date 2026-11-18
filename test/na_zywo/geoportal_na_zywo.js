'use strict';
/** NA ŻYWO: Agent Geoportalu — ULDK, mapy WMS, legendy, opis szczegółowy (prawdziwy kod z main.js). */
const W = require('./wspolne'), fs = require('fs'), path = require('path');
const geoAgent = require(W.APP + '/renderer/geoportal-agent.js');
const kod = 'const geoCapCache = new Map();\n' + W.wytnij('async function geoPobierz(') + W.wytnij('async function geoWarstwy(') + W.wytnij('async function geoportalDzialka(zapytanie) {');
const nativeImage = { createFromBuffer: () => ({ isEmpty: () => false, getSize: () => ({ width: 200, height: 120 }) }) };
const geoportalDzialka = new Function('geoAgent', 'fetchWithTimeout', 'logToFile', 'nativeImage', 'ocrDwaPrzebiegi', kod + '\nreturn geoportalDzialka;')(geoAgent, W.fetchWithTimeout, W.logToFile, nativeImage, async () => ({ ok: false }));
const WYJ = process.argv[2] || '/tmp/geoportal-na-zywo';
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 700) : '')); } };
(async () => {
  console.log('OPERO — Agent Geoportalu na żywo (226101_1.0003.743, Gdańsk Klukowo)\n');
  fs.mkdirSync(WYJ, { recursive: true });
  const r = await geoportalDzialka({ id: '226101_1.0003.743' });
  T('działka z ULDK: numer, obręb, gmina', r.ok && r.dzialka.numer === '743' && /Klukowo/.test(r.dzialka.obreb), r.dzialka || r);
  T('obrys działki leży w środku kadru', (r.obrys || [])[0]?.every(([x, y]) => x > 300 && x < 900 && y > 300 && y < 900), r.obrys);
  for (const id of ['orto', 'egib', 'mpzp', 'uzbrojenie']){
    const m = (r.mapy || []).find(x => x.id === id);
    T(`mapa ${id}: obraz ${m ? Math.round(m.dataUrl.length * 0.75 / 1024) + ' kB' : 'BRAK'}`, !!m && m.dataUrl.length > 4000, (r.bledy || []).filter(b => b.includes(geoAgent.usluga(id).tytul)));
    if (m) fs.writeFileSync(path.join(WYJ, `${id}.${m.dataUrl.startsWith('data:image/jpeg') ? 'jpg' : 'png'}`), Buffer.from(m.dataUrl.split(',')[1], 'base64'));
  }
  T('legendy pobrane', (r.legendy || []).length >= 1, (r.legendy || []).map(l => l.tytul));
  (r.legendy || []).forEach((l, i) => fs.writeFileSync(path.join(WYJ, `legenda-${i + 1}-${l.usluga}.png`), Buffer.from(l.dataUrl.split(',')[1], 'base64')));
  const egib = (r.info || []).find(i => i.usluga === 'egib'), mpzp = (r.info || []).find(i => i.usluga === 'mpzp');
  T('opis szczegółowy z ewidencji', !!egib && egib.tekst.length > 20, r.bledy);
  console.log('\n--- opis EGiB ---\n' + (egib?.tekst || '').slice(0, 1500) + '\n--- pola ---\n' + JSON.stringify(egib?.pola || {}));
  console.log('\n--- opis MPZP ---\n' + (mpzp?.tekst || '(brak)').slice(0, 1500) + '\n--- pola ---\n' + JSON.stringify(mpzp?.pola || {}));
  console.log('\nbłędy usług:', JSON.stringify(r.bledy));
  fs.writeFileSync(path.join(WYJ, 'odpowiedz.json'), JSON.stringify({ ...r, mapy: (r.mapy || []).map(m => ({ ...m, dataUrl: m.dataUrl.length })), legendy: (r.legendy || []).map(l => ({ ...l, dataUrl: l.dataUrl.length })) }, null, 1));
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

'use strict';
/** NA ŻYWO: Rejestr Cen Nieruchomości (GUGiK WFS) — prawdziwy kod z main.js, prawdziwa usługa. */
const W = require('./wspolne');
const rcnGeo = require(W.APP + '/renderer/rcn-geoportal.js');
const zrodlaKontrola = require(W.APP + '/renderer/zrodla-kontrola.js');
const kod = ['const RCN_LIMIT_STRON', 'function rcnPoliczObiekty', 'function rcnBezPowtorzen'].map(x => W.wytnij(x, x.startsWith('const') ? ';' : '\n}\n')).join('\n')
  + '\nlet rcnOsOdwrotna = null;\n' + W.wytnij('async function rcnZapytanie(zapytanie) {');
const rcnZapytanie = new Function('rcnGeo', 'zrodlaKontrola', 'fetchWithTimeout', 'logToFile', kod + '\nreturn rcnZapytanie;')(rcnGeo, zrodlaKontrola, W.fetchWithTimeout, W.logToFile);
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 600) : '')); } };
(async () => {
  console.log('OPERO — RCN na żywo (Gdańsk, Ikara 97)\n');
  const t0 = Date.now();
  const r = await rcnZapytanie({ x: 466840.81, y: 724906.5, promien: 2000, typy: ['lokale'], teryt: '2261', powiat: 'Gdańsk', maks: 6000, odDaty: '2023-11-18' });
  const ms = Date.now() - t0;
  T('rejestr odpowiada i oddaje transakcje', r.ok && r.transakcje.length > 0, { ok: r.ok, n: r.transakcje.length, powod: r.powod, kom: r.komunikat });
  T('kolejność osi ustalona tak, że transakcje są z powiatu 2261', !r.uwagaOsi, r.uwagaOsi);
  T('filtr daty po stronie usługi: wszystkie od 2023-11-18', r.transakcje.every(t => t.data >= '2023-11-18'), r.transakcje.filter(t => t.data < '2023-11-18').slice(0, 2));
  T('adresy czytelne (ul. … , Gdańsk), miejscowość wydzielona', r.transakcje.filter(t => /^ul\. .+, Gdańsk$/.test(t.adres) && t.miejscowosc === 'Gdańsk').length > r.transakcje.length * 0.7, r.transakcje.slice(0, 2).map(t => [t.adres, t.miejscowosc, t.ulica]));
  T('kondygnacja odczytana (pole LOK_NR_KOND)', r.transakcje.some(t => t.pietro != null));
  T('każda transakcja ma źródło: nr aktu lub id transakcji i id lokalu', r.transakcje.every(t => (t.akt || t.idTransakcji) && t.idObiektu), r.transakcje.find(t => !(t.akt || t.idTransakcji) || !t.idObiektu));
  const odrz = {}; let dobre = 0;
  for (const t of r.transakcje) { const p = rcnGeo.przydatnosc(t, 'mieszkanie'); if (p) { const k = p.replace(/\(.*\)|\d+\/\d+/g, '').trim(); odrz[k] = (odrz[k] || 0) + 1; } else dobre++; }
  T('odsianie: zostają porównywalne mieszkania z wolnego rynku', dobre > 10, { dobre, odrz });
  const lata = {}; r.transakcje.forEach(t => { const y = t.data.slice(0, 4); lata[y] = (lata[y] || 0) + 1; });
  console.log(`\n  Wynik: ${r.transakcje.length} transakcji lokali w promieniu 2 km od 18.11.2023, porównywalnych: ${dobre}; odsiane: ${JSON.stringify(odrz)}; lata: ${JSON.stringify(lata)}; czas ${Math.round(ms / 1000)} s`);
  const dobreL = r.transakcje.filter(t => !rcnGeo.przydatnosc(t, 'mieszkanie')).map(t => t.jednostkowa).sort((a, b) => a - b);
  if (dobreL.length) console.log(`  Ceny 1 m² (porównywalne): min ${Math.round(dobreL[0])}, mediana ${Math.round(dobreL[dobreL.length >> 1])}, max ${Math.round(dobreL[dobreL.length - 1])} zł`);
  const r2 = await rcnZapytanie({ x: 466840.81, y: 724906.5, promien: 3000, typy: ['budynki', 'dzialki'], teryt: '2261', powiat: 'Gdańsk', maks: 2000, odDaty: '2021-11-18' });
  const domy = r2.transakcje.filter(t => !rcnGeo.przydatnosc(t, 'dom') && t.rodzajObiektu === 'budynki');
  T('budynki i działki: rejestr odpowiada; domy z gruntem odróżnione od budynków z transakcji lokali', r2.ok && r2.transakcje.length > 0, { n: r2.transakcje.length, domy: domy.length, powod: r2.powod });
  console.log(`  Budynki/działki od 2021: ${r2.transakcje.length}, domy (gruntowa zabudowana, mieszkalne): ${domy.length}`);
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

'use strict';
// Paczka zrodel trzyma program w app\\, repozytorium robocze w build\\app\\.
// Testy musza dzialac w obu ukladach, inaczej build na GitHubie wywala sie
// na samych testach, zanim w ogole dojdzie do instalatora.
const APP_DIR = (() => {
  const f = require('node:fs'), p = require('node:path');
  const a = p.join(__dirname, '..', 'build', 'app');
  return f.existsSync(a) ? a : p.join(__dirname, '..', 'app');
})();
// Opiniowanie merytoryczne: cechy (czy roznicuja ceny, ktora pracuje najmocniej,
// czy przedmiot nie wychodzi poza rynek), lancuch dat i parametry pozostalych
// podejsc. Sprawdzamy takze, czy program nie wypowiada sie tam, gdzie nie ma danych.
const K = require(APP_DIR + '/renderer/kontrola.js');

let ok = 0, zle = 0;
const T = (n, w) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n); } };
const znajdz = (w, frag) => w.pozycje.find(x => x.tytul.includes(frag));
const ma = (w, frag) => !!znajdz(w, frag);

console.log('Opiniowanie merytoryczne operatu\n');

/* ================= skala ocen ================= */
const cecha3 = { id: 'c1', name: 'standard', scaleMin: 'słaby', scaleAvg: 'przeciętny', scaleMax: 'dobry', weight: 0.3 };
T('ocena opisowa zamieniana na pozycje w skali',
  K.rangaOceny(cecha3, 'słaby', 'three') === 0 && K.rangaOceny(cecha3, 'przeciętny', 'three') === 0.5 &&
  K.rangaOceny(cecha3, 'dobry', 'three') === 1);
T('wielkosc liter nie ma znaczenia', K.rangaOceny(cecha3, 'DOBRY', 'three') === 1);
T('liczba zamiast opisu tez jest rozumiana', K.rangaOceny(cecha3, '2', 'three') === 0.5);
T('pusta ocena to brak, a nie zero', K.rangaOceny(cecha3, '', 'three') === null);
T('ocena spoza skali nie jest zgadywana', K.rangaOceny(cecha3, 'rewelacyjny', 'three') === null);

/* ================= korelacja ================= */
T('idealna zaleznosc rosnaca daje r = 1',
  Math.abs(K.korelacja([0, 0.5, 1], [100, 200, 300]).r - 1) < 1e-9);
T('idealna zaleznosc malejaca daje r = -1',
  Math.abs(K.korelacja([0, 0.5, 1], [300, 200, 100]).r + 1) < 1e-9);
T('bez zroznicowania nie ma korelacji', K.korelacja([1, 1, 1], [100, 200, 300]) === null);
T('dwie obserwacje to za malo', K.korelacja([0, 1], [100, 200]) === null);

/* ================= cechy ================= */
function operat(cechy, transakcje, dodatki) {
  return Object.assign({
    property: { usableArea: 54 },
    valuation: { valuationDate: '2026-06-01', inspectionDate: '2026-05-20' },
    market: { ratingMode: 'three', features: cechy, transactions: transakcje },
  }, dodatki || {});
}
const SKALA = { scaleMin: 'słaby', scaleAvg: 'przeciętny', scaleMax: 'dobry' };
const tx = (oceny, cena) => ({ address: 'a', date: '2026-03-01', area: 50, priceUnit: cena, featureRatings: oceny });

/* cecha, ktora nic nie roznicuje */
const w1 = K.ocen(operat(
  [{ id: 'f1', name: 'lokalizacja', weight: 0.5, rating: 'dobry', ...SKALA },
   { id: 'f2', name: 'standard', weight: 0.5, rating: 'dobry', ...SKALA }],
  [tx({ f1: 'dobry', f2: 'słaby' }, 9000), tx({ f1: 'dobry', f2: 'przeciętny' }, 10000),
   tx({ f1: 'dobry', f2: 'dobry' }, 11000), tx({ f1: 'dobry', f2: 'dobry' }, 11200)]
), { weightSum: 1 }, {}, {});
T('cecha o jednakowej ocenie wszedzie jest zglaszana', ma(w1, 'ma wszędzie tę samą ocenę'));
T('program tlumaczy, czemu taka cecha nic nie wnosi',
  /nie wnosi/.test(znajdz(w1, 'ma wszędzie tę samą ocenę').szczegol));

/* cecha bez zwiazku z cena, ale z duza waga */
const w2 = K.ocen(operat(
  [{ id: 'f1', name: 'kondygnacja', weight: 0.6, rating: 'przeciętny', ...SKALA },
   { id: 'f2', name: 'standard', weight: 0.4, rating: 'dobry', ...SKALA }],
  [tx({ f1: 'słaby', f2: 'słaby' }, 9000), tx({ f1: 'dobry', f2: 'przeciętny' }, 9050),
   tx({ f1: 'słaby', f2: 'dobry' }, 11000), tx({ f1: 'dobry', f2: 'dobry' }, 11050),
   tx({ f1: 'przeciętny', f2: 'słaby' }, 9020)]
), { weightSum: 1 }, {}, {});
T('cecha bez zwiazku z cena, a z duza waga, jest zglaszana', ma(w2, 'nie różnicuje cen, a ma istotną wagę'));
T('zarzut poparty jest liczba, nie wrazeniem',
  /r = /.test(znajdz(w2, 'nie różnicuje cen, a ma istotną wagę').szczegol));

/* cecha silnie roznicujaca, a z niska waga */
const w3 = K.ocen(operat(
  [{ id: 'f1', name: 'standard', weight: 0.05, rating: 'dobry', ...SKALA },
   { id: 'f2', name: 'inne', weight: 0.95, rating: 'dobry', ...SKALA }],
  [tx({ f1: 'słaby', f2: 'słaby' }, 8000), tx({ f1: 'przeciętny', f2: 'przeciętny' }, 10000),
   tx({ f1: 'dobry', f2: 'dobry' }, 12000), tx({ f1: 'dobry', f2: 'słaby' }, 11800)]
), { weightSum: 1 }, {}, {});
T('cecha mocno roznicujaca z niska waga jest zglaszana', ma(w3, 'mocno różnicuje ceny, a ma niską wagę'));

/* skala odwrocona */
const w4 = K.ocen(operat(
  [{ id: 'f1', name: 'hałas', weight: 0.5, rating: 'dobry', ...SKALA },
   { id: 'f2', name: 'inne', weight: 0.5, rating: 'dobry', ...SKALA }],
  [tx({ f1: 'słaby', f2: 'dobry' }, 12000), tx({ f1: 'przeciętny', f2: 'dobry' }, 10000),
   tx({ f1: 'dobry', f2: 'dobry' }, 8000), tx({ f1: 'dobry', f2: 'dobry' }, 8200)]
), { weightSum: 1 }, {}, {});
T('odwrocona skala jest rozpoznana', ma(w4, 'działa odwrotnie, niż sugeruje skala'));

/* ranking cech */
const w5 = K.ocen(operat(
  [{ id: 'f1', name: 'lokalizacja', weight: 0.6, rating: 'dobry', ...SKALA },
   { id: 'f2', name: 'kondygnacja', weight: 0.1, rating: 'przeciętny', ...SKALA },
   { id: 'f3', name: 'metraż', weight: 0.3, rating: 'dobry', ...SKALA }],
  [tx({ f1: 'słaby', f2: 'słaby', f3: 'słaby' }, 8000),
   tx({ f1: 'przeciętny', f2: 'przeciętny', f3: 'przeciętny' }, 10000),
   tx({ f1: 'dobry', f2: 'dobry', f3: 'dobry' }, 12000)]
), { weightSum: 1 }, {}, {});
const rank = znajdz(w5, 'najmocniej wpływają na wynik');
T('program wskazuje, ktore cechy najmocniej wplywaja na wynik', !!rank && rank.stan === 'ok');
T('ranking zaczyna sie od cechy o najwiekszym wplywie', /1\. lokalizacja/.test(rank.szczegol));
T('ranking nazywa tez cechę o najmniejszym wplywie', /Najmniejszy wpływ: kondygnacja/.test(rank.szczegol));
T('ranking tlumaczy, czym jest wplyw', /waga × rozpiętość/.test(rank.szczegol));
T('liczby podane sa po polsku, z przecinkiem', /waga 0,60/.test(rank.szczegol) && !/waga 0\.60/.test(rank.szczegol));

/* przedmiot poza zakresem rynku */
const w6 = K.ocen(operat(
  [{ id: 'f1', name: 'standard', weight: 1, rating: 'dobry', ...SKALA }],
  [tx({ f1: 'słaby' }, 8000), tx({ f1: 'słaby' }, 8200), tx({ f1: 'przeciętny' }, 9000)]
), { weightSum: 1 }, {}, {});
T('ocena przedmiotu poza zbiorem porownawczym jest zglaszana', ma(w6, 'wykracza poza zbiór porównawczy'));
T('program tlumaczy, czemu to grozne',
  /poza rynek/.test(znajdz(w6, 'wykracza poza zbiór porównawczy').szczegol));

/* liczba cech */
T('za malo cech to uwaga',
  ma(K.ocen(operat([{ id: 'f1', name: 'a', weight: 1, ...SKALA }], []), {}, {}, {}), 'cecha rynkowe') ||
  ma(K.ocen(operat([{ id: 'f1', name: 'a', weight: 1, ...SKALA }], []), {}, {}, {}), 'cechy rynkowe'));
const duzo = Array.from({ length: 9 }, (_, i) => ({ id: 'f' + i, name: 'c' + i, weight: 0.11, ...SKALA }));
T('duzo cech przy malej liczbie transakcji to uwaga',
  ma(K.ocen(operat(duzo, [tx({}, 9000), tx({}, 9500), tx({}, 10000)]), {}, {}, {}), 'Dużo cech jak na'));

/* cechy o tym samym znaczeniu */
T('dwie cechy o tym samym znaczeniu sa zglaszane',
  ma(K.ocen(operat([{ id: 'f1', name: 'lokalizacja', weight: 0.5, ...SKALA },
                     { id: 'f2', name: 'położenie przy parku', weight: 0.5, ...SKALA }], []), {}, {}, {}),
     'mogą opisywać to samo'));

/* kompletna macierz ocen */
T('kompletna macierz ocen jest odnotowana jako zrobiona dobrze',
  znajdz(w5, 'Macierz ocen cech jest kompletna')?.stan === 'ok');

/* ================= daty ================= */
const dat = (v) => K.ocen({ valuation: Object.assign({ valuationDate: '2026-06-01', inspectionDate: '2026-05-20' }, v),
  market: { transactions: [] } }, {}, {}, {});
T('operat sporzadzony przed data wyceny to blad',
  znajdz(dat({ reportDate: '2026-05-01' }), 'Operat sporządzony przed datą wyceny')?.stan === 'blad');
T('operat sporzadzony po dacie wyceny jest w porzadku',
  znajdz(dat({ reportDate: '2026-06-10' }), 'Operat sporządzony po dacie wyceny')?.stan === 'ok');
T('ponad rok od daty wyceny to uwaga o aktualnosci',
  /potwierdzenia aktualności/.test(znajdz(dat({ reportDate: '2027-08-01' }), 'minął ponad rok')?.szczegol || ''));
T('stan nieruchomosci sprzed ogledzin jest zglaszany',
  ma(dat({ propertyStateDate: '2026-04-01' }), 'wcześniejszą niż oględziny'));
const w7 = K.ocen({ valuation: { valuationDate: '2026-06-01', priceLevelDate: '2026-03-01' },
  market: { transactions: [{ address: 'a', date: '2026-05-01', area: 50, priceUnit: 9000 }] } }, {}, {}, {});
T('transakcja pozniejsza niz poziom cen jest zglaszana', ma(w7, 'późniejsza niż przyjęty poziom cen'));

/* ================= pozostale podejscia ================= */
const mod = (kod, m, extra) => K.ocen(Object.assign({ modul: m, market: { transactions: [] }, valuation: {} }, extra || {}),
  {}, {}, { modul: kod });

T('stopa kapitalizacji poza zakresem to uwaga',
  ma(K.ocen({ income: { stopaKapitalizacji: 25 }, market: { transactions: [] }, valuation: {} }, {}, {}, { modul: 'income' }),
     'poza typowym zakresem'));
T('stopa kapitalizacji w zakresie jest odnotowana jako poprawna',
  znajdz(K.ocen({ income: { stopaKapitalizacji: 7, pustostany: 5 }, market: { transactions: [] }, valuation: {} }, {}, {}, { modul: 'income' }),
    'Stopa kapitalizacji w typowym zakresie')?.stan === 'ok');
T('zerowe pustostany to uwaga',
  ma(K.ocen({ income: { stopaKapitalizacji: 7, pustostany: 0 }, market: { transactions: [] }, valuation: {} }, {}, {}, { modul: 'income' }),
     'Pustostany przyjęte na poziomie 0%'));
T('niedodatni NOI to blad',
  znajdz(K.ocen({ income: { noi: -100 }, market: { transactions: [] }, valuation: {} }, {}, {}, { modul: 'income' }),
    'Dochód operacyjny netto')?.stan === 'blad');

T('zuzycie 85% i wiecej to uwaga o wyborze podejscia',
  ma(mod('cost', { zuzycieLaczne: 90 }), 'bliski końca okresu użytkowania'));
T('zerowe zuzycie to uwaga', ma(mod('cost', { zuzycieLaczne: 0 }), 'Zużycie przyjęte jako zerowe'));
T('udzialy elementow niesumujace sie do 100% to blad',
  znajdz(mod('cost', { elementy: [{ udzial: 60 }, { udzial: 30 }] }), 'sumują się do')?.stan === 'blad');
T('poprawne udzialy sa odnotowane jako zrobione dobrze',
  znajdz(mod('cost', { elementy: [{ udzial: 60 }, { udzial: 40 }] }), 'sumują się do 100%')?.stan === 'ok');

T('stawka opłaty ponad limit ustawowy to blad',
  znajdz(mod('fees', { stawka: 60 }), 'przekracza ustawowy limit')?.stan === 'blad');
T('limit planistyczny jest nizszy niz adiacencki',
  ma(mod('fees', { stawka: 40, rodzaj: 'planistyczna' }), 'przekracza ustawowy limit 30%'));
T('stawka w granicy jest odnotowana jako poprawna',
  znajdz(mod('fees', { stawka: 25 }), 'mieści się w granicy ustawowej')?.stan === 'ok');
T('brak wzrostu wartosci to uwaga', ma(mod('fees', { stawka: 25, delta: 0 }), 'Brak wzrostu wartości'));

T('powiekszenie ponad 50% przy wywlaszczeniu to blad',
  znajdz(mod('expropriation', { powiekszenie: 70 }), 'przekracza dopuszczalne 50%')?.stan === 'blad');

T('metoda sluzebnosci bez uzasadnienia to uwaga',
  ma(mod('easement', { metoda: 'wskaznikowa' }), 'przyjęta bez uzasadnienia'));
T('wspolczynnik S poza zakresem to blad',
  znajdz(mod('easement', { metoda: 'x', uzasadnienieMetody: 'bo tak', wspolczynnikS: 150 }), 'Współczynnik S poza zakresem')?.stan === 'blad');

T('cena drewna bez zrodla to blad',
  znajdz(mod('agri_forest', { cenaDrewna: 200 }), 'Cena drewna bez wskazanego źródła')?.stan === 'blad');
T('wskaznik szacunkowy bez zrodla to blad',
  znajdz(mod('agri_forest', { wskaznikN: 0.5 }), 'Wskaźnik szacunkowy bez wskazanego źródła')?.stan === 'blad');

/* ================= powsciagliwosc ================= */
const pusty = K.ocen({}, {}, {}, {});
T('bez danych program nie opiniuje cech',
  !pusty.pozycje.some(x => /różnicuje|wpływają na wynik|wykracza poza zbiór/.test(x.tytul)));
T('bez danych program nie opiniuje modulow',
  !pusty.pozycje.some(x => /Stopa kapitalizacji|Zużycie|Stawka/.test(x.tytul)));
T('opinia nie wywraca kontroli przy dziwnych danych',
  (() => { try { K.ocen({ market: { features: [null], transactions: [null] } }, null, null, {}); return true; } catch { return false; } })());

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

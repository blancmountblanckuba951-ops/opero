'use strict';
// Paczka zrodel trzyma program w app\\, repozytorium robocze w build\\app\\.
// Testy musza dzialac w obu ukladach, inaczej build na GitHubie wywala sie
// na samych testach, zanim w ogole dojdzie do instalatora.
const APP_DIR = (() => {
  const f = require('node:fs'), p = require('node:path');
  const a = p.join(__dirname, '..', 'build', 'app');
  return f.existsSync(a) ? a : p.join(__dirname, '..', 'app');
})();
// Import RCiWN i dobor transakcji: rozpoznanie kolumn, odczyt liczb i dat,
// odrzucenia z podaniem powodu, punktacja podobienstwa.
const R = require(APP_DIR + '/renderer/rcn.js');

let ok = 0, zle = 0;
const T = (n, w) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n); } };

console.log('Import RCiWN i dobor transakcji\n');

/* --- liczby z wyciagu --- */
T('cena z separatorem tysiecy i przecinkiem', R.liczba('1 250 000,50') === 1250000.5);
T('cena z kropka jako tysiacami', R.liczba('1.250.000') === 1250000);
T('cena z jednostka w komorce', R.liczba('6 400,00 zł') === 6400);
T('powierzchnia z m2', R.liczba('54,30 m²') === 54.3);
T('spacja nierozdzielajaca nie psuje liczby', R.liczba('1 250,00') === 1250);
T('pusta komorka to brak liczby, a nie zero', R.liczba('') === null && R.liczba('   ') === null);
T('tekst nie udaje liczby', R.liczba('brak danych') === null);

/* --- daty --- */
T('data ISO', R.data('2026-01-31') === '2026-01-31');
T('data polska z kropkami', R.data('31.01.2026') === '2026-01-31');
T('data z ukosnikami', R.data('5/3/2026') === '2026-03-05');
T('bledna data to null', R.data('kwiecien') === null);

/* --- rozpoznanie kolumn --- */
const naglowek = ['Lp.', 'Data transakcji', 'Adres', 'Obręb', 'Nr działki', 'Cena transakcyjna',
  'Powierzchnia użytkowa', 'Cena za m2', 'Rodzaj prawa', 'Rodzaj transakcji', 'Nr aktu', 'Uwagi'];
const mapa = R.rozpoznajKolumny(naglowek);
T('rozpoznana data', mapa.data === 1);
T('rozpoznany adres i obreb', mapa.adres === 2 && mapa.obreb === 3);
T('cena i cena jednostkowa to dwie rozne kolumny', mapa.cena === 5 && mapa.cenaJednostkowa === 7);
T('rozpoznana powierzchnia', mapa.powierzchnia === 6);
T('rozpoznane prawo, rodzaj i akt', mapa.prawo === 8 && mapa.rodzaj === 9 && mapa.akt === 10);

/* --- naglowek znajdowany w arkuszu z tytulem --- */
const arkusz = [
  ['Wyciąg z rejestru cen i wartości nieruchomości'],
  ['Starostwo Powiatowe', '', 'stan na 2026-09-30'],
  [],
  naglowek,
  ['1', '2026-05-10', 'Gdańsk, Armii Krajowej 10', 'Chełm', '12/3', '540 000,00', '54,00', '10 000,00', 'własność', 'sprzedaż', 'A 123/2026', ''],
];
T('naglowek odnaleziony mimo tytulu arkusza', R.znajdzNaglowek(arkusz) === 3);
T('wiersz tytulowy nie jest brany za naglowek', R.znajdzNaglowek([['Wyciąg'], ['x']]) === -1);

/* --- wczytanie --- */
const wiersze = [
  naglowek,
  ['1', '2026-05-10', 'Gdańsk, Armii Krajowej 10', 'Chełm', '12/3', '540 000,00', '54,00', '', 'własność', 'sprzedaż', 'A 1/2026', ''],
  ['2', '2026-04-02', 'Gdańsk, Jabłoniowa 5',      'Chełm', '14/1', '600 000,00', '60,00', '', 'własność', 'sprzedaż', 'A 2/2026', ''],
  ['3', '2026-03-11', 'Gdańsk, Cienista 2',        'Chełm', '9/2',  '480 000,00', '48,00', '', 'własność', 'sprzedaż', 'A 3/2026', ''],
  ['4', '2026-02-20', 'Gdańsk, Kolonia 7',         'Chełm', '7/7',  '520 000,00', '52,00', '', 'własność', 'sprzedaż', 'A 4/2026', ''],
  ['5', '2026-05-10', 'Gdańsk, Armii Krajowej 10', 'Chełm', '12/3', '540 000,00', '54,00', '', 'własność', 'sprzedaż', 'A 1/2026', 'kopia'],
  ['6', '2026-01-15', 'Gdańsk, Darowizna 1',       'Chełm', '3/1',  '1,00',       '50,00', '', 'własność', 'darowizna', 'A 6/2026', ''],
  ['7', '2026-01-20', 'Gdańsk, Wieczyste 3',       'Chełm', '5/1',  '500 000,00', '50,00', '', 'użytkowanie wieczyste', 'sprzedaż', 'A 7/2026', ''],
  ['8', '2026-04-05', 'Gdańsk, Bez ceny 4',        'Chełm', '6/1',  '',           '50,00', '', 'własność', 'sprzedaż', 'A 8/2026', ''],
  ['9', '2026-04-06', 'Gdańsk, Bez powierzchni 5', 'Chełm', '6/2',  '500 000,00', '',      '', 'własność', 'sprzedaż', 'A 9/2026', ''],
  ['10','2022-04-06', 'Gdańsk, Stara 6',           'Chełm', '6/3',  '300 000,00', '50,00', '', 'własność', 'sprzedaż', 'A 10/2026', ''],
  ['11','2026-04-07', 'Gdańsk, Pałac 7',           'Chełm', '6/4',  '9 000 000,00','50,00','', 'własność', 'sprzedaż', 'A 11/2026', ''],
];
const t = R.wczytaj(wiersze, mapa, 1);
T('wczytano wszystkie wiersze danych', t.length === 11);
T('numer wiersza zrodlowego zostaje przy transakcji', t[0].zrodloWiersz === 2);
T('cena i powierzchnia odczytane jako liczby', t[0].cena === 540000 && t[0].powierzchnia === 54);

/* --- ocena --- */
const w = R.ocen(t, { powierzchnia: 55, dataWyceny: '2026-06-01', miejscowosc: 'Gdańsk', obreb: 'Chełm', prawo: 'własność', okresMiesiecy: 24 });
const powod = (wiersz) => w.wszystkie.find(x => x.zrodloWiersz === wiersz)?.powod || '';

T('duplikat po numerze aktu jest odrzucany', /duplikat/.test(powod(6)));
T('darowizna nie jest sprzedaza rynkowa', /nie jest sprzedaż rynkowa/.test(powod(7)));
T('inne prawo niz przedmiot wyceny jest odrzucane', /inne prawo/.test(powod(8)));
T('brak ceny jest odrzuceniem z nazwy powodu', powod(9) === 'brak ceny');
T('brak powierzchni jest odrzuceniem z nazwy powodu', powod(10) === 'brak powierzchni');
T('transakcja spoza okresu badania rynku odpada', /poza przyjętym okresem/.test(powod(11)));
T('cena razaco odstajaca odpada z podaniem mediany', /rażąco odstaje/.test(powod(12)));
T('zdrowe transakcje zostaja', w.przyjete.length === 4);
T('nic nie ginie — kazdy wiersz ma werdykt',
  w.wszystkie.length === 11 && w.wszystkie.every(x => x.powod || x.punkty > 0));
T('odrzucone zawsze maja powod', w.odrzucone.every(x => typeof x.powod === 'string' && x.powod.length > 5));

/* --- punktacja --- */
const naj = w.przyjete[0];
T('najblizsza powierzchnia dostaje najwiecej punktow', Math.abs(naj.powierzchnia - 55) <= 2);
T('punkty mieszcza sie w skali 0-100', w.przyjete.every(x => x.punkty >= 0 && x.punkty <= 100));
T('statystyka podaje mediane i rozpietosc',
  w.statystyka.mediana === 10000 && w.statystyka.min === 10000 && w.statystyka.max === 10000);
T('statystyka liczy wczytane, przyjete i odrzucone',
  w.statystyka.wczytane === 11 && w.statystyka.przyjete === 4 && w.statystyka.odrzucone === 7);

/* --- transakcja po dacie wyceny --- */
const przyszla = R.ocen([{ zrodloWiersz: 1, cena: 500000, powierzchnia: 50, data: '2026-12-01' }],
  { dataWyceny: '2026-06-01' });
T('transakcja po dacie wyceny jest odrzucana', /po dacie wyceny/.test(przyszla.wszystkie[0].powod || ''));

/* --- uwagi zamiast odrzucenia --- */
const uwagi = R.ocen([
  { zrodloWiersz: 1, cena: 1000000, powierzchnia: 200, data: '2026-05-01', adres: 'A' },
], { powierzchnia: 50, dataWyceny: '2026-06-01' });
T('nietypowa powierzchnia to uwaga, a nie odrzucenie',
  !uwagi.wszystkie[0].powod && uwagi.wszystkie[0].uwagi.some(x => /powierzchnia odbiega/.test(x)));
T('brak adresu jest zglaszany jako uwaga',
  R.ocen([{ zrodloWiersz: 1, cena: 500000, powierzchnia: 50, data: '2026-05-01' }], { dataWyceny: '2026-06-01' })
    .wszystkie[0].uwagi.some(x => /brak adresu/.test(x)));

/* --- przekazanie do silnika --- */
const doSilnika = R.doOperatu(w.przyjete);
T('transakcje maja pola, ktorych oczekuje silnik',
  doSilnika.every(x => Number(x.priceUnit) > 0 && Number(x.area) > 0 && !!x.date && !!x.address));
T('cena jednostkowa wyliczona z ceny i powierzchni', doSilnika[0].priceUnit === 10000);
T('okres do daty wyceny liczy silnik, nie import',
  doSilnika.every(x => x.autoMonthsToValuation === true && x.monthsToValuation === 0));
T('przy kazdej transakcji zostaje slad pochodzenia',
  doSilnika.every(x => x.zrodlo && Number(x.zrodlo.wiersz) > 0));
T('identyfikatory sa kolejne i zaczynaja sie od podanego',
  R.doOperatu(w.przyjete, 5).map(x => x.id).join(',') === '5,6,7,8');


/* --- prawdziwy plik XLSX (zapisany przez openpyxl, nie przez nas) --- */
const path = require('node:path');
const fs = require('node:fs');
const plik = path.join(__dirname, 'dane', 'wyciag-rcn.xlsx');
if (fs.existsSync(plik)) {
  const X = require(APP_DIR + '/xlsx-czytnik.js');
  const arkusze = X.czytaj(plik);
  T('czytnik XLSX widzi oba arkusze i ich nazwy',
    arkusze.length === 2 && arkusze[0].nazwa === 'Wyciąg RCiWN');
  const ws = arkusze[0].wiersze;
  T('puste wiersze nie przesuwaja numeracji', (ws[2] || []).length === 0 && String(ws[3][0]) === 'Lp.');
  T('polskie znaki wracaja bez uszczerbku', ws[3][3] === 'Obręb' && /Jabłoniowa/.test(String(ws[5][2])));
  const h = R.znajdzNaglowek(ws);
  T('naglowek znaleziony w prawdziwym pliku', h === 3);
  const m2 = R.rozpoznajKolumny(ws[h]);
  const t2 = R.wczytaj(ws, m2, h + 1);
  T('data z Excela (liczba dni) przeliczona na date', t2[0].data === '2026-05-10');
  T('kwoty i powierzchnie odczytane z arkusza', t2[0].cena === 540000 && t2[0].powierzchnia === 54);
  const w2 = R.ocen(t2, { powierzchnia: 55, dataWyceny: '2026-06-01', prawo: 'własność', okresMiesiecy: 24 });
  T('z prawdziwego wyciagu zostaja cztery transakcje', w2.przyjete.length === 4);
  T('wieczyste, darowizna i duplikat odpadaja z prawdziwego pliku',
    w2.odrzucone.length === 3 && w2.odrzucone.every(x => /inne prawo|sprzedaż rynkowa|duplikat/.test(x.powod)));
} else {
  T('plik testowy XLSX istnieje', false);
}

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

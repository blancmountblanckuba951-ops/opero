'use strict';
/**
 * OPERO — DOBOR NIERUCHOMOSCI PODOBNYCH
 *
 * Rzeczoznawca nie szuka "mieszkan o zblizonym metrazu". Szuka nieruchomosci
 * podobnych z TEGO SAMEGO RYNKU LOKALNEGO: mieszkanie w Osowej porownuje sie
 * z mieszkaniami w Osowej i w sasiedztwie, a nie ze Stogami — nawet przy
 * identycznym metrazu. Te testy pilnuja, zeby program tak wlasnie dobieral.
 */
const P = require('../build/app/renderer/podobienstwo.js');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };

// Wyceniany lokal: Osowa, Siedleckiego, 68 m², 3 pokoje, 2. piętro, własność.
const OSOWA = { x: 462000, y: 726000 };
const K = P.kryteria({
  miejscowosc: 'Gdańsk', dzielnica: 'Osowa', ulica: 'Siedleckiego',
  x: OSOWA.x, y: OSOWA.y, powierzchnia: 68, pokoje: 3, pietro: 2,
  prawo: 'własność odrębna lokalu', dataWyceny: '2026-11-05',
  okresMiesiecy: 24, tolPowPct: 20, tolPokoi: 1, tolPieter: 2, promienM: 1500, zapasPct: 25,
});
const lok = (o) => ({ miejscowosc: 'Gdańsk', prawo: 'własność', rodzaj: 'sprzedaż', ...o });

console.log('\n--- 1. Polozenie wazy najwiecej, bo to ono tworzy rynek ---');
const sasiad = P.ocen(lok({ adres: 'ul. Siedleckiego 9', ulica: 'Siedleckiego', x: 462080, y: 726040,
  powierzchnia: 66, pokoje: 3, pietro: 2, data: '2026-08-10' }), K);
T('lokal zza rogu, ten sam metraż i układ — wzorcowy', sasiad.poziom === 'wzorcowa', [sasiad.poziom, sasiad.punkty]);
T('program podaje odległość w metrach, a nie „blisko"', sasiad.odlegloscM === 89, sasiad.odlegloscM);
T('i mówi, że to ta sama ulica', /ta sama ulica/.test(sasiad.zdanie), sasiad.zdanie);

const drugiKoniecMiasta = P.ocen(lok({ adres: 'ul. Stogi 4', ulica: 'Stogi', x: 478000, y: 722000,
  powierzchnia: 68, pokoje: 3, pietro: 2, data: '2026-09-10' }), K);
T('IDENTYCZNY lokal z drugiego końca miasta jest ODRZUCONY',
  drugiKoniecMiasta.odrzucona === true, [drugiKoniecMiasta.poziom, drugiKoniecMiasta.punkty]);
T('i program mówi, ile to kilometrów', /16,\d km/.test(drugiKoniecMiasta.zdanie), drugiKoniecMiasta.zdanie);

const sasiedniaDzielnica = P.ocen(lok({ adres: 'ul. Barniewicka 12', ulica: 'Barniewicka', x: 462900, y: 725400,
  powierzchnia: 70, pokoje: 3, pietro: 2, data: '2026-07-10' }), K);
T('lokal z sąsiedztwa (1,1 km) wchodzi do zbioru', sasiedniaDzielnica.doZbioru === true,
  [sasiedniaDzielnica.poziom, sasiedniaDzielnica.punkty]);

console.log('\n--- 2. Brak nazwy dzielnicy to NIE jest „inna dzielnica" ---');
T('adres bez nazwy dzielnicy nie przesądza niczego',
  P.taSamaDzielnica({ adres: 'ul. Barniewicka 12, Gdańsk' }, K) === null);
T('wpisana ta sama dzielnica jest rozpoznana',
  P.taSamaDzielnica({ dzielnica: 'Osowa' }, K) === true);
T('wpisana inna dzielnica też', P.taSamaDzielnica({ dzielnica: 'Wrzeszcz' }, K) === false);
T('nazwa dzielnicy w adresie wystarczy',
  P.taSamaDzielnica({ adres: 'Osowa, ul. Nowa 1' }, K) === true);

console.log('\n--- 3. Ulica po rdzeniu nazwy, nie po calym napisie ---');
T('„Chrzanowskiego" to ta sama ulica co „Bernarda Chrzanowskiego"',
  P.taSamaUlica('Chrzanowskiego', 'Bernarda Chrzanowskiego'));
T('„Siedleckiego" i „Barniewicka" to dwie różne ulice',
  !P.taSamaUlica('Siedleckiego', 'Barniewicka'));
T('wielkość liter i ogonki nie mają znaczenia',
  P.taSamaUlica('JAŚKOWA DOLINA', 'Jaskowa Dolina'));

console.log('\n--- 4. Warunki twarde: zadne punkty ich nie przegłosuja ---');
const inneDnia = P.ocen(lok({ adres: 'ul. Siedleckiego 3', ulica: 'Siedleckiego', x: 462010, y: 726010,
  powierzchnia: 68, pokoje: 3, pietro: 2, data: '2026-12-01' }), K);
T('transakcja PO dacie wyceny jest odrzucona mimo kompletu zgodności', inneDnia.odrzucona === true);
T('i program mówi dlaczego', /PO dacie wyceny/.test(inneDnia.zdanie), inneDnia.zdanie);

const innePrawo = P.ocen(lok({ adres: 'ul. Siedleckiego 5', ulica: 'Siedleckiego', x: 462010, y: 726010,
  powierzchnia: 68, pokoje: 3, pietro: 2, data: '2026-10-01', prawo: 'spółdzielcze własnościowe' }), K);
T('lokal spółdzielczy nie trafia do zbioru przy wycenie własności', innePrawo.odrzucona === true);
T('z wyjaśnieniem, że tych praw nie porównuje się wprost',
  /nie są porównywalne wprost/.test(innePrawo.zdanie), innePrawo.zdanie);

const darowizna = P.ocen(lok({ adres: 'ul. Siedleckiego 7', ulica: 'Siedleckiego', x: 462010, y: 726010,
  powierzchnia: 68, pokoje: 3, pietro: 2, data: '2026-10-01', rodzaj: 'darowizna' }), K);
T('darowizna nie jest ceną rynkową', darowizna.odrzucona === true);
const licytacja = P.ocen(lok({ adres: 'ul. Siedleckiego 8', ulica: 'Siedleckiego', x: 462010, y: 726010,
  powierzchnia: 68, pokoje: 3, pietro: 2, data: '2026-10-01', rodzaj: 'sprzedaż licytacyjna' }), K);
T('sprzedaż licytacyjna też nie', licytacja.odrzucona === true);
const inneMiasto = P.ocen(lok({ adres: 'ul. Morska 1, Gdynia', miejscowosc: 'Gdynia',
  powierzchnia: 68, pokoje: 3, pietro: 2, data: '2026-10-01' }), K);
T('inna miejscowość odpada', inneMiasto.odrzucona === true);

console.log('\n--- 5. Tolerancje rzeczoznawcy sa granica samodzielnosci programu ---');
const oWlos = P.ocen(lok({ adres: 'ul. Siedleckiego 11', ulica: 'Siedleckiego', x: 462050, y: 726050,
  powierzchnia: 84, pokoje: 3, pietro: 2, data: '2026-09-01' }), K);
T('lokal o włos poza ±20% NIE wchodzi sam — idzie do decyzji', oWlos.doDecyzji === true,
  [oWlos.poziom, oWlos.punkty]);
T('program mówi dokładnie, ile metrów poza zakresem',
  /m² poza zakresem/.test(oWlos.zdanie), oWlos.zdanie);
T('ale ocena zostaje wysoka — to nadal sąsiad z tej samej ulicy',
  oWlos.punkty >= 50, oWlos.punkty);
T('i jest wypisana jako wyjście poza kryteria', oWlos.pozaKryteriami.length === 1, oWlos.pozaKryteriami);

const czteryPokoje = P.ocen(lok({ adres: 'ul. Siedleckiego 13', ulica: 'Siedleckiego', x: 462050, y: 726050,
  powierzchnia: 70, pokoje: 5, pietro: 2, data: '2026-09-01' }), K);
T('pięć pokoi przy wzorcu 3 ±1 to decyzja człowieka', czteryPokoje.doDecyzji === true, czteryPokoje.poziom);

const parter = P.ocen(lok({ adres: 'ul. Siedleckiego 15', ulica: 'Siedleckiego', x: 462050, y: 726050,
  powierzchnia: 68, pokoje: 3, pietro: 0, data: '2026-09-01' }), K);
T('parter dostaje mniej punktów za kondygnację, bo ma własny rynek',
  parter.skladniki.find(c => c.id === 'pietro').punkty <= P.WAGI.pietro * 0.4);
T('i program tak to nazywa', /parter ma własny rynek/.test(parter.zdanie), parter.zdanie);

console.log('\n--- 6. Braki w rejestrze nie moga karac dobrej transakcji ---');
const bezIzb = P.ocen(lok({ adres: 'ul. Siedleckiego 17', ulica: 'Siedleckiego', x: 462050, y: 726050,
  powierzchnia: 67, data: '2026-09-01' }), K);
T('brak liczby pokoi i piętra nie zabiera punktów', bezIzb.doZbioru === true, [bezIzb.poziom, bezIzb.punkty]);
T('ale program wypisuje, czego nie sprawdził',
  /liczba pokoi/.test(bezIzb.brakiOpis) && /kondygnacja/.test(bezIzb.brakiOpis), bezIzb.brakiOpis);
T('i liczy, ile pozycji zostało niesprawdzonych', bezIzb.nieznanych === 2, bezIzb.nieznanych);

const samaPowierzchnia = P.ocen(lok({ adres: 'ul. Nowa 1', powierzchnia: 68, data: '2026-09-01' }), K);
T('bez współrzędnych program mówi wprost, że położenia nie sprawdził',
  /nie podał położenia/.test(samaPowierzchnia.zdanie), samaPowierzchnia.zdanie);

console.log('\n--- 7. Dobor calego zbioru i kolejnosc ---');
const zbior = P.dobierz([
  lok({ adres: 'ul. Stogi 4', x: 478000, y: 722000, powierzchnia: 68, pokoje: 3, pietro: 2, data: '2026-09-10' }),
  lok({ adres: 'ul. Siedleckiego 9', ulica: 'Siedleckiego', x: 462080, y: 726040, powierzchnia: 66, pokoje: 3, pietro: 2, data: '2026-08-10' }),
  lok({ adres: 'ul. Barniewicka 12', ulica: 'Barniewicka', x: 462900, y: 725400, powierzchnia: 70, pokoje: 3, pietro: 2, data: '2026-07-10' }),
  lok({ adres: 'ul. Siedleckiego 11', ulica: 'Siedleckiego', x: 462050, y: 726050, powierzchnia: 84, pokoje: 3, pietro: 2, data: '2026-09-01' }),
], K);
T('do zbioru weszły dwie najbliższe', zbior.doZbioru.length === 2, zbior.doZbioru.map(x => x.adres));
T('najwyżej stoi lokal z tej samej ulicy',
  /Siedleckiego 9/.test(zbior.doZbioru[0].adres), zbior.doZbioru[0].adres);
T('jedna poszła do decyzji', zbior.doDecyzji.length === 1, zbior.doDecyzji.map(x => x.adres));
T('Stogi odpadły', zbior.odrzucone.length === 1 && /Stogi/.test(zbior.odrzucone[0].adres));
T('lista do pokazania to zbiór plus decyzje', zbior.doPokazania.length === 3);

const opis = P.opisDoboru(zbior, K);
T('zdanie nad listą mówi, czego i ile', /2 nieruchomości podobne/.test(opis), opis);
T('i że reszta czeka na decyzję', /1 do Twojej decyzji/.test(opis), opis);
T('i w jakiej dzielnicy szukał', /dzielnicy Osowa/.test(opis), opis);

console.log('\n--- 8. Zdanie do operatu o sposobie doboru ---');
const uzas = P.uzasadnienie(K, 3);
T('uzasadnienie podaje dzielnicę i sąsiedztwo', /Osowa i w jej bezpośrednim sąsiedztwie/.test(uzas), uzas);
T('promień w metrach', /promieniu 1500 m/.test(uzas));
T('przedział powierzchni z przecinkiem dziesiętnym', /54,4–81,6 m²/.test(uzas), uzas);
T('liczbę pokoi i kondygnację z tolerancją', /3 ±1/.test(uzas) && /2\. piętro ±2/.test(uzas));
T('okres', /24 miesięcy przed datą wyceny/.test(uzas));
T('i wprost, co pominięto', /darowizny, zamiany/.test(uzas) && /innego prawa/.test(uzas));

console.log('\n--- 9. Liczby, ktore musza sie zgadzac ---');
T('odległość liczona w metrach układu PUWG 1992',
  P.odleglosc({ x: 0, y: 0 }, { x: 300, y: 400 }) === 500);
T('brak współrzędnej daje null, a nie zero',
  P.odleglosc({ x: 1, y: 2 }, { x: null, y: 2 }) === null);
T('prawo sprowadzone do rodzaju', P.prawo('spółdzielcze własnościowe prawo do lokalu') === 'spoldzielcze'
  && P.prawo('własność odrębna lokalu') === 'wlasnosc');
T('parter nazywa się parterem', P.nazwaPietra(0) === 'parter' && P.nazwaPietra(3) === '3. piętro');
T('wagi składowych sumują się do 100',
  Object.values(P.WAGI).reduce((a, b) => a + b, 0) === 100, P.WAGI);
T('odchyłka nie schodzi poniżej 5%', P.kryteria({ powierzchnia: 50, tolPowPct: 0 }).tolPowPct === 5);

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

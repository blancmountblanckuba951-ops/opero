'use strict';
/** OPERO — czytanie treści księgi wieczystej skopiowanej z EKW. */
const path = require('path');
const E = require(path.join(__dirname, '..', 'build', 'app', 'renderer', 'ekw-tresc.js'));
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
console.log('OPERO — treść księgi wieczystej z EKW\n');

const NAGL = `TREŚĆ KSIĘGI WIECZYSTEJ NR GD1G/00380276/5, STAN Z DNIA 2026-11-13 18:57
prowadzonej przez SĄD REJONOWY GDAŃSK-PÓŁNOC W GDAŃSKU, III WYDZIAŁ KSIĄG WIECZYSTYCH - GD1G
LOKAL STANOWIĄCY ODRĘBNĄ NIERUCHOMOŚĆ
Dział I-O\tDział I-Sp\tDział II\tDział III\tDział IV
`;
const IO = NAGL + `DZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI
\tNr podstawy wpisu
Numer bieżący nieruchomości\t1\t2, 3
Lokal
\tNr podstawy wpisu
Położenie (numer porządkowy / województwo, powiat, gmina, miejscowość)\tLp. 1.\t1\tPOMORSKIE, M. GDAŃSK, GDAŃSK M., GDAŃSK\t2, 3
Ulica\tNumer budynku\tNumer lokalu\tIKARA\t97\t2
Identyfikator lokalu\t226101_1.0003.1172_BUD.2_LOK
Przeznaczenie lokalu\tLOKAL MIESZKALNY
Opis lokalu (rodzaj izby - liczba)\tPOKÓJ Z ANEKSEM KUCHENNYM - 1, WC - 1, POMIESZCZENIE GOSPODARCZE - 1, GARAŻ - 1, PRZEDSIONEK - 1, HOL - 2, ŁAZIENKA - 2, POKÓJ - 3
Kondygnacja\t1
Przyłączenie - numer księgi wieczystej (nieruchomość, z której wyodrębniono lokal)\tLp. 1.\tGD1G / 00374430 / 8
Odrębność (lokal stanowi odrębną nieruchomość)\tTAK
Pole powierzchni użytkowej lokalu wraz z powierzchnią pomieszczeń przynależnych\t113,7300 M2
DOKUMENTY BĘDĄCE PODSTAWĄ WPISU / DANE O WNIOSKU
Nr podstawy wpisu
2\tUMOWA USTANOWIENIA ODRĘBNEJ WŁASNOŚCI LOKALU I PRZENIESIENIA WŁASNOŚCI ORAZ UMOWA SPRZEDAŻY REP. A 677/2025, 2025-01-30, NOTARIUSZ ŁUKASZ GANCZEWSKI, GDAŃSK; 2-8
`;
const ISP = NAGL + `DZIAŁ I-SP - SPIS PRAW ZWIĄZANYCH Z WŁASNOŚCIĄ
\tNr podstawy wpisu
Numer bieżący nieruchomości\t1\t2
Wielkość udziału w nieruchomości wspólnej, którą stanowi grunt oraz części budynku i urządzenia, które nie służą wyłącznie do użytku właścicieli lokali\tLp. 1.\t11373/276845\t2
Rodzaj prawa\tWŁASNOŚĆ
`;
const II = NAGL + `DZIAŁ II - WŁASNOŚĆ
Właściciele
Lp. 1.\t1\tNr podstawy wpisu
Udział (numer udziału w prawie/ wielkość udziału/ rodzaj wspólności)\t1\t1 / 1\tWSPÓLNOŚĆ USTAWOWA MAJĄTKOWA MAŁŻEŃSKA\t2
Osoba fizyczna (Imię pierwsze, imię drugie, nazwisko / drugi człon nazwiska złożonego, imię ojca, imię matki, PESEL)\tLp. 1.\tJAN, ADAM, KOWALSKI, STANISŁAW, MARIA, 80010112345\t2
Osoba fizyczna (Imię pierwsze, imię drugie, nazwisko / drugi człon nazwiska złożonego, imię ojca, imię matki, PESEL)\tLp. 2.\tANNA, ---, KOWALSKA, JÓZEF, HELENA, 82020254321\t2
DOKUMENTY BĘDĄCE PODSTAWĄ WPISU / DANE O WNIOSKU
2\tUMOWA SPRZEDAŻY REP. A 677/2025, 2025-01-30, NOTARIUSZ ŁUKASZ GANCZEWSKI, GDAŃSK
`;
const III = NAGL + `DZIAŁ III - PRAWA, ROSZCZENIA I OGRANICZENIA
BRAK WPISÓW
`;
const IV = NAGL + `DZIAŁ IV - HIPOTEKA
Numer hipoteki (roszczenia)\t1
Rodzaj hipoteki (roszczenia)\tHIPOTEKA UMOWNA
Suma (słownie), waluta\t750000,00\t(SIEDEMSET PIĘĆDZIESIĄT TYSIĘCY)\tPLN
Wierzyciel hipoteczny\tBANK PRZYKŁADOWY SPÓŁKA AKCYJNA, WARSZAWA, 000000000
`;

/* ============== 1. NAGŁÓWEK */
const n = E.naglowek(IO);
T('numer księgi z nagłówka', n.kw === 'GD1G/00380276/5', n.kw);
T('data i godzina stanu', n.stanZDnia === '2026-11-13' && n.stanGodzina === '18:57', n);
T('sąd bez kodu wydziału na końcu', n.sad === 'Sąd Rejonowy Gdańsk-Północ w Gdańsku, III Wydział Ksiąg Wieczystych', n.sad);
T('rodzaj: lokal', n.rodzaj === 'lokal');
T('numer księgi ze spacjami jest normalizowany', E.numerKw('GD1G / 00374430 / 8') === 'GD1G/00374430/8');
T('ciąg, który nie jest numerem księgi, daje pusty wynik', E.numerKw('226101_1.0003.1172') === '');

/* ============== 2. PODZIAŁ NA DZIAŁY */
const samIO = E.podziel(IO);
T('pasek zakładek nie jest brany za działy', Object.keys(samIO).length === 1 && !!samIO.IO, Object.keys(samIO));
const wszystko = E.czytaj([IO, ISP, II, III, IV].join('\n'));
T('pięć stron wklejonych naraz daje pięć działów', wszystko.rozpoznane.join(',') === 'I-O,I-Sp,II,III,IV' && wszystko.brakuje.length === 0, wszystko.rozpoznane);
T('przy jednym dziale program wie, których brakuje', E.czytaj(IO).brakuje.join(',') === 'I-Sp,II,III,IV');
T('ten sam dział wklejony dwa razy liczy się raz', E.czytaj(IO + IO).rozpoznane.length === 1);
T('tekst, który nie jest księgą, nie jest rozpoznany', E.czytaj('Dzień dobry, przesyłam zdjęcia mieszkania.').ok === false);

/* ============== 3. DZIAŁ I-O */
const io = wszystko.io;
T('położenie: województwo, powiat, gmina, miejscowość', io.wojewodztwo === 'pomorskie' && io.powiat === 'M. Gdańsk' && io.miejscowosc === 'Gdańsk', io);
T('ulica, numer budynku i lokalu z etykiet stojących obok siebie', io.ulica === 'Ikara' && io.numerBudynku === '97' && io.numerLokalu === '2', [io.ulica, io.numerBudynku, io.numerLokalu]);
T('identyfikator i przeznaczenie lokalu', io.identyfikatorLokalu === '226101_1.0003.1172_BUD.2_LOK' && io.przeznaczenie === 'lokal mieszkalny', [io.identyfikatorLokalu, io.przeznaczenie]);
T('liczba pokoi = pokoje + pokój z aneksem', io.pokoje === 4, io.pokoje);
T('opis izb jest czytelny', /^pokój z aneksem kuchennym – 1, wc – 1/.test(io.izby) && /pokój – 3$/.test(io.izby), io.izby);
T('łazienka i hol nie są liczone jako pokoje', io.listaIzb.find(x => x.nazwa === 'łazienka').ile === 2 && io.pokoje === 4);
T('kondygnacja', io.kondygnacja === '1');
T('księga macierzysta', io.kwMacierzysta === 'GD1G/00374430/8', io.kwMacierzysta);
T('powierzchnia jako liczba', io.powierzchnia === 113.73, io.powierzchnia);
T('numery podstaw wpisu („2, 3") nie trafiają do danych', !JSON.stringify(io).includes('"2, 3"'));
const wiersze = E.dzialIO(E.podziel(IO.replace(/\t/g, '\n')).IO);
T('ten sam wynik, gdy komórki rozdziela nowy wiersz zamiast tabulatora', JSON.stringify(wiersze) === JSON.stringify(io));
const osobno = E.dzialIO('DZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI\nUlica\tDŁUGA\nNumer budynku\t12A\nNumer lokalu\t7\nKondygnacja\t3');
T('etykiety w osobnych wierszach też są czytane', osobno.ulica === 'Długa' && osobno.numerBudynku === '12A' && osobno.numerLokalu === '7', osobno);
const bezUlicy = E.dzialIO('DZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI\nUlica\tNumer budynku\tNumer lokalu\t15\t3\nKondygnacja\t1');
T('miejscowość bez ulic: numer nie zostaje wzięty za ulicę', !bezUlicy.ulica && bezUlicy.numerBudynku === '15' && bezUlicy.numerLokalu === '3', bezUlicy);
const grunt = E.dzialIO('DZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI\nDziałka ewidencyjna\nIdentyfikator działki\t226101_1.0010.123/4\nNumer działki\t123/4\nObręb ewidencyjny (numer, nazwa)\t0010, OSOWA\nSposób korzystania\tB - TERENY MIESZKANIOWE\nObszar całej nieruchomości\t0,0850 HA');
T('księga gruntowa: działka, obręb, obszar', grunt.numerDzialki === '123/4' && grunt.obreb === 'Osowa' && grunt.obszar === 0.085 && grunt.obszarJednostka === 'ha', grunt);

/* ============== 4. DZIAŁY I-Sp, II, III, IV */
T('udział w nieruchomości wspólnej', wszystko.isp.udzial === '11373/276845', wszystko.isp);
T('rodzaj prawa z I-Sp', wszystko.isp.rodzajPrawa === 'własność');
T('dwoje właścicieli, imię i nazwisko', wszystko.ii.wlasciciele.join('|') === 'Jan Adam Kowalski|Anna Kowalska', wszystko.ii.wlasciciele);
T('PESEL i imiona rodziców NIE są przepisywane', !/80010112345|82020254321|Stanisław|Helena|Józef|Maria/.test(JSON.stringify(wszystko.ii)));
T('wspólność małżeńska', /wspólność ustawowa majątkowa małżeńska/.test(wszystko.ii.wspolnosc || ''), wszystko.ii.wspolnosc);
T('podstawa nabycia', /^UMOWA SPRZEDAŻY REP\. A 677\/2025/.test(wszystko.ii.podstawaNabycia || ''), wszystko.ii.podstawaNabycia);
T('dział III: brak wpisów', wszystko.iii.brakWpisow === true && wszystko.iii.tekst === 'Brak wpisów.');
T('dział IV: treść hipoteki jest zachowana', wszystko.iv.brakWpisow === false && /HIPOTEKA UMOWNA/.test(wszystko.iv.tekst) && /750000,00/.test(wszystko.iv.tekst));
T('dział IV: hipoteka rozpoznana z kwotą i walutą', wszystko.hipoteki.length === 1 && wszystko.hipoteki[0].suma === '750000,00' && wszystko.hipoteki[0].waluta === 'PLN', wszystko.hipoteki);
T('osoba prawna jako właściciel', E.dzialII('DZIAŁ II - WŁASNOŚĆ\nInna osoba prawna lub jednostka organizacyjna niebędąca osobą prawną (Nazwa, siedziba, REGON)\tLp. 1.\tSPÓŁDZIELNIA MIESZKANIOWA „MORENA", GDAŃSK, 000123456').wlasciciele[0] === 'Spółdzielnia Mieszkaniowa „Morena"');
T('PESEL w dziale III jest wycinany', !/80010112345/.test(E.dzialObciazen('DZIAŁ III - PRAWA\nSłużebność osobista\tJAN KOWALSKI, 80010112345').tekst));

/* ============== 5. DO OPERATU */
const pola = E.doOperatu(wszystko);
const m = Object.fromEntries(pola.map(p => [p.sciezka, p.wartosc]));
T('numer księgi, sąd i data badania', m['legal.kwLocal'] === 'GD1G/00380276/5' && /Gdańsk-Północ/.test(m['legal.court']) && m['valuation.legalStateDate'] === '2026-11-13 18:57', [m['legal.kwLocal'], m['valuation.legalStateDate']]);
T('adres trafia do danych nieruchomości', m['property.city'] === 'Gdańsk' && m['property.street'] === 'Ikara' && m['property.buildingNo'] === '97' && m['property.localNo'] === '2');
T('pokoje, kondygnacja i powierzchnia według księgi', m['property.rooms'] === 4 && m['property.floor'] === '1' && m['property.kwArea'] === 113.73);
T('księga wspólna, udział, właściciele', m['legal.kwCommon'] === 'GD1G/00374430/8' && m['legal.commonShare'] === '11373/276845' && m['legal.ownerNames'] === 'Jan Adam Kowalski, Anna Kowalska');
T('działy III i IV', m['legal.sectionIII'] === 'Brak wpisów.' && /HIPOTEKA/.test(m['legal.sectionIV']));
T('każde pole ma nazwę do pokazania człowiekowi', pola.every(p => p.nazwa && p.sciezka));
T('pustych wartości nie ma na liście', pola.every(p => String(p.wartosc).trim() !== ''));
T('sam dział I-O nie wpisuje pustego działu III', !E.doOperatu(E.czytaj(IO)).some(p => p.sciezka === 'legal.sectionIII'));

/* ============== 6. SITO: ŚMIECI NIE WCHODZĄ DO OPERATU */
const czyste = E.przesiej(pola);
T('poprawny odczyt przechodzi sito w całości', czyste.odrzucone.length === 0 && czyste.pewne.length === pola.length, czyste.odrzucone);
const smieci = E.przesiej([
  { sciezka: 'property.floor', wartosc: 'EHNNNNNNNENNNN KENEM', nazwa: 'kondygnacja' },
  { sciezka: 'property.floor', wartosc: '(III', nazwa: 'kondygnacja' },
  { sciezka: 'property.buildingNo', wartosc: 'C PA', nazwa: 'numer budynku' },
  { sciezka: 'property.kwArea', wartosc: 0.7, nazwa: 'powierzchnia' },
  { sciezka: 'legal.kwLocal', wartosc: 'GD1G/0038027/5', nazwa: 'numer księgi' },
  { sciezka: 'legal.commonShare', wartosc: '276845/11373', nazwa: 'udział' },
  { sciezka: 'property.city', wartosc: '[77 WNN', nazwa: 'miejscowość' },
  { sciezka: 'legal.court', wartosc: 'Sąd |[[|[| Rejonowy', nazwa: 'sąd' },
  { sciezka: 'valuation.legalStateDate', wartosc: '2026-1I-13', nazwa: 'data' },
  { sciezka: 'egib.plotId', wartosc: '226101 1.0010 123', nazwa: 'identyfikator działki' },
]);
T('śmieci z rozpoznawania pisma są odrzucane co do jednego', smieci.pewne.length === 0 && smieci.odrzucone.length === 10, smieci.pewne);
T('udział większy od całości jest odrzucany', E.przesiej([{ sciezka: 'legal.commonShare', wartosc: '5/3', nazwa: 'u' }]).odrzucone.length === 1);
T('poprawne wartości graniczne przechodzą', E.przesiej([
  { sciezka: 'property.floor', wartosc: '-1', nazwa: 'k' }, { sciezka: 'property.floor', wartosc: 'parter', nazwa: 'k' },
  { sciezka: 'property.buildingNo', wartosc: '12A/3', nazwa: 'b' }, { sciezka: 'property.street', wartosc: 'Aleja Grunwaldzka', nazwa: 'u' },
  { sciezka: 'property.street', wartosc: '3 Maja', nazwa: 'u' }, { sciezka: 'legal.commonShare', wartosc: '1/1', nazwa: 'u' },
]).odrzucone.length === 0);
T('pole bez wzorca (treść działu) przechodzi bez zmian', E.przesiej([{ sciezka: 'legal.sectionIII', wartosc: 'Brak wpisów.', nazwa: 'III' }]).pewne.length === 1);

/* ============== 7. TEKST ZE ZRZUTU EKRANU: SŁOWA → WIERSZE I KOMÓRKI */
const O = require(path.join(__dirname, '..', 'build', 'app', 'renderer', 'ocr-uklad.js'));
const sl = (t, x, y, w = t.length * 9, h = 16) => ({ t, x, y, w, h });
const slowa = [
  sl('Numer', 150, 41), sl('budynku', 205, 40), sl('Ulica', 10, 40), sl('Numer', 420, 42), sl('lokalu', 475, 41),
  sl('IKARA', 760, 40), sl('97', 1180, 41), sl('2', 1350, 40),
  sl('Kondygnacja', 10, 80), sl('1', 760, 81),
  sl('DZIAŁ', 600, 5), sl('I-O', 660, 5), sl('-', 695, 5), sl('OZNACZENIE', 710, 6), sl('NIERUCHOMOŚCI', 815, 5),
];
const tekst = O.tekst(slowa);
T('słowa układają się w wiersze od góry', tekst.split('\n').length === 3 && /^DZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI$/.test(tekst.split('\n')[0]), tekst);
T('słowa w wierszu idą od lewej, bez względu na kolejność z silnika', tekst.split('\n')[1].startsWith('Ulica'));
T('mały odstęp to spacja, duży to granica komórki', tekst.split('\n')[1] === 'Ulica\tNumer budynku\tNumer lokalu\tIKARA\t97\t2', tekst.split('\n')[1]);
T('drobne różnice wysokości nie rozbijają wiersza', tekst.split('\n')[2] === 'Kondygnacja\t1');
const zZrzutu = E.dzialIO(tekst);
T('tekst złożony ze słów czyta się tak samo jak wklejony', zZrzutu.ulica === 'Ikara' && zZrzutu.numerBudynku === '97' && zZrzutu.numerLokalu === '2' && zZrzutu.kondygnacja === '1', zZrzutu);
T('ten sam układ w dwukrotnie większej rozdzielczości daje ten sam tekst', O.tekst(slowa.map(w => ({ t: w.t, x: w.x * 2, y: w.y * 2, w: w.w * 2, h: w.h * 2 }))) === tekst);
T('puste i zepsute słowa są pomijane', O.tekst([{ t: '', x: 1, y: 1, w: 5, h: 5 }, { t: 'A', x: 'x', y: 1, w: 5, h: 5 }, null && {}, sl('OK', 5, 5)].filter(Boolean)) === 'OK');
T('brak słów daje pusty tekst', O.tekst([]) === '' && O.tekst(null) === '');
T('nagłówek działu z pomyloną literą jest naprawiany', O.naprawEkw('DZIAL I-0 — OZNACZENIE NIERUCHOMOSCI') === 'DZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI', O.naprawEkw('DZIAL I-0 — OZNACZENIE NIERUCHOMOSCI'));
T('nagłówki pozostałych działów też', O.naprawEkw('DZIAL II - WLASNOSC') === 'DZIAŁ II - WŁASNOŚĆ' && O.naprawEkw('DZIAL lll - PRAWA') === 'DZIAŁ III - PRAWA' && O.naprawEkw('DZIAL IV - HIPOTEKA') === 'DZIAŁ IV - HIPOTEKA');
T('naprawa nie rusza danych nieruchomości', O.naprawEkw('IKARA\t97\t2\tGD1G/00380276/5') === 'IKARA\t97\t2\tGD1G/00380276/5');
T('kilka zrzutów składa się w jeden tekst', O.zrzutyNaTekst([{ slowa: [sl('DZIAL', 5, 5), sl('II', 60, 5), sl('-', 85, 5), sl('WLASNOSC', 100, 5)] }, { slowa: [sl('BRAK', 5, 5), sl('WPISÓW', 50, 5)] }, { slowa: [] }]) === 'DZIAŁ II - WŁASNOŚĆ\nBRAK WPISÓW');
const main = require('fs').readFileSync(path.join(__dirname, '..', 'build', 'app', 'main.js'), 'utf8');
T('silnik rozpoznawania wbudowany (TextDetector + Tesseract w programie), bez usług OCR z sieci', /new TextDetector\(\)/.test(main) && /opero-ocr:\/\/app\/ocr.html/.test(main) && !/ocr\.space|vision\.googleapis|api\.ocr/i.test(main));
T('obraz idzie do odizolowanego okna jako dane, bez uruchamiania PowerShella', /createImageBitmap/.test(main) && !/EncodedCommand/.test(main));
T('brak polskiego pakietu rozpoznawania daje instrukcję, co zrobić', /Optyczne rozpoznawanie znaków/.test(main));

console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

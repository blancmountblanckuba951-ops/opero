'use strict';
/**
 * OPERO — ceny ofertowe deweloperów z dane.gov.pl.
 *
 * Test pilnuje trzech rzeczy, z których każda pojedynczo wystarczyłaby, żeby
 * zepsuć operat:
 *   1. OFERTA NIE JEST TRANSAKCJĄ. Każdy wiersz wychodzi stąd oznaczony i
 *      z `doZbioru: false`.
 *   2. ADRES INWESTYCJI TO NIE ADRES BIURA. Wzorzec ma kolumny adresowe dwa
 *      razy; wzięcie siedziby dewelopera dałoby operat o innym mieście.
 *   3. POWIERZCHNIA WYLICZONA TO NIE POWIERZCHNIA Z PLIKU. Program dzieli
 *      cenę przez cenę metra, gdy musi, ale to podpisuje.
 *
 * Układ pliku sprawdzony na realnym cenniku (Modera, 2025-09-11): 29 kolumn,
 * separator średnik, „X" to „nie dotyczy".
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const O = require(path.join(APP, 'renderer', 'oferty-dane-gov.js'));

console.log('OPERO — ceny ofertowe z dane.gov.pl\n');

/* --- 1. Adresy zapytań --- */
const uInst = O.urlInstytucje({});
T('katalog pyta o deweloperów', uInst.includes('institution_type=developer'));
T('katalog idzie do api.dane.gov.pl', uInst.startsWith('https://api.dane.gov.pl/1.4/institutions'));
T('katalog nie prosi o więcej niż 100 na stronę', /per_page=100/.test(O.urlInstytucje({ ile: 500 })));
T('strona nie bywa zerowa', /page=1\b/.test(O.urlInstytucje({ strona: 0 })));
const uZb = O.urlZbiory({ miasto: 'Gdańsk' });
T('zbiory szukane po frazie i mieście', /q=ceny\+ofertowe\+Gda/.test(uZb) || /q=ceny%20ofertowe%20Gda/.test(uZb), uZb);
T('zbiory sortowane od najnowszych', /sort=-created/.test(uZb));
T('plik ma adres pobrania', O.urlPliku('abc123') === 'https://api.dane.gov.pl/resources/abc123/file');
T('bez numeru zasobu program nie udaje, że ma adres', (() => { try { O.urlPliku(''); return false; } catch { return true; } })());
T('zasoby pobierane po numerze zbioru', O.urlZasoby('77').includes('/datasets/77/resources'));

/* --- 2. Czytanie katalogu --- */
const katalog = {
  data: [
    { id: '101', attributes: { title: 'MODERA DEWELOPER sp. z o.o.', city: 'Iława', datasets_count: 1, website: 'www.modera.com.pl' } },
    { id: '102', attributes: { title: 'ARMA DEWELOPER', city: 'Gdańsk', datasets_count: 2 } },
  ],
};
const inst = O.zInstytucji(katalog);
T('katalog czyta się na listę deweloperów', inst.length === 2);
T('deweloper ma numer, nazwę i miasto', inst[0].id === '101' && /MODERA/.test(inst[0].nazwa) && inst[0].miasto === 'Iława');
T('katalog przyjmuje też tekst JSON', O.zInstytucji(JSON.stringify(katalog)).length === 2);
T('śmieci zamiast JSON-a nie wywracają programu', O.zInstytucji('to nie json').length === 0);

const zbiory = O.zZbiorow({
  data: [{ id: '55', attributes: { title: 'Ceny ofertowe lokali dewelopera Modera', notes: '<p>art. 19b</p>', modified: '2025-09-11T06:47:19Z', resources_count: 3 } }],
});
T('zbiór ma tytuł i datę', zbiory[0].tytul.includes('Ceny ofertowe') && zbiory[0].aktualizacja === '2025-09-11');
T('opis zbioru bez znaczników HTML', zbiory[0].opis === 'art. 19b');

const zasoby = O.zZasobow({
  data: [
    { id: 'r1', attributes: { title: 'Cennik XLSX', format: 'XLSX', data_date: '2025-09-11' } },
    { id: 'r2', attributes: { title: 'Cennik CSV', format: 'csv', data_date: '2025-09-11' } },
    { id: 'r3', attributes: { title: 'Cennik stary', format: 'csv', data_date: '2024-01-02' } },
    { id: 'r4', attributes: { title: 'Opis', format: 'pdf', data_date: '2025-09-11' } },
  ],
});
T('zasoby czytają się z formatem i datą', zasoby.length === 4 && zasoby[1].format === 'csv');
T('zasób bez adresu dostaje adres z numeru', zasoby[0].url === 'https://api.dane.gov.pl/resources/r1/file');
const wybrany = O.wybierzZasob(zasoby);
T('program bierze najświeższy plik, a CSV przed XLSX', wybrany.id === 'r2', wybrany && wybrany.id);
T('PDF nie jest cennikiem do wczytania', O.wybierzZasob([zasoby[3]]) === null);

/* --- 3. Rozkład CSV --- */
T('separator rozpoznany jako średnik', O.separator('a;b;c') === ';');
T('przecinek w cudzysłowie nie przesądza separatora', O.separator('a;"x, y";c') === ';');
T('plik przecinkowy też się czyta', O.separator('a,b,c') === ',');
const csv = O.csv('a;b\n1;"x;y"\n2;"on powiedzial ""tak"""');
T('pole z separatorem w cudzysłowie zostaje jednym polem', csv.wiersze[1][1] === 'x;y');
T('podwójny cudzysłów to jeden cudzysłów', csv.wiersze[2][1] === 'on powiedzial "tak"');
T('BOM na początku pliku nie psuje pierwszego nagłówka', O.csv('﻿ID;Cena\n1;2').wiersze[0][0] === 'ID');
T('końce linii w stylu Windows czytają się tak samo', O.csv('a;b\r\n1;2\r\n').wiersze.length === 2);

/* --- 4. Rozpoznawanie kolumn wzorca z 2025 r. --- */
const NAGLOWKI = ['ID', 'Oznaczenie lokalu', 'Cena [PLN]', 'Cena za m² [PLN]', 'Data aktualizacji',
  'Cena przed zmianą [PLN]', 'Cena za m² przed zmianą [PLN]', 'Nazwa dewelopera', 'Forma prawna dewelopera',
  'Nr KRS', 'Nr NIP', 'Nr REGON', 'Nr telefonu', 'Adres poczty elektronicznej', 'Adres strony internetowej dewelopera',
  'Województwo adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Powiat adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Gmina adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Miejscowość adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Nr nieruchomości adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Kod pocztowy adresu siedziby/głównego miejsca wykonywania działalności gospodarczej dewelopera',
  'Województwo adresu lokalu, w którym prowadzona jest sprzedaż',
  'Powiat adresu lokalu, w którym prowadzona jest sprzedaż',
  'Gmina adresu lokalu, w którym prowadzona jest sprzedaż',
  'Miejscowość adresu lokalu, w którym prowadzona jest sprzedaż',
  'Nr nieruchomości adresu lokalu, w którym prowadzona jest sprzedaż',
  'Kod pocztowy adresu lokalu, w którym prowadzona jest sprzedaż',
  'Dodatkowe lokalizacje, w których prowadzona jest sprzedaż',
  'Sposób kontaktu nabywcy z deweloperem'];
T('wzorzec z 2025 r. ma 29 kolumn', NAGLOWKI.length === 29);
const kol = O.rozpoznajKolumny(NAGLOWKI);
T('cena rozpoznana', kol.cena === 2);
T('cena za metr rozpoznana', kol.cenaM2 === 3);
T('oznaczenie lokalu rozpoznane', kol.lokal === 1);
T('data aktualizacji rozpoznana', kol.dataAktualizacji === 4);
T('nazwa dewelopera rozpoznana', kol.deweloper === 7);
T('miejscowość to miejscowość LOKALU, nie siedziby dewelopera', kol.miejscowosc === 24, String(kol.miejscowosc));
T('powiat też z adresu lokalu', kol.powiat === 22, String(kol.powiat));
T('gmina też z adresu lokalu', kol.gmina === 23, String(kol.gmina));
T('kod pocztowy z adresu lokalu', kol.kod === 26, String(kol.kod));
T('kolumny powierzchni we wzorcu z 2025 r. nie ma', kol.powierzchnia == null);
T('żadna kolumna nie jest przypisana dwa razy',
  (() => { const v = Object.values(kol); return new Set(v).size === v.length; })());

/* --- 5. Prawdziwy wiersz z cennika Modery --- */
const WIERSZ = '1891;XXII-B;639000.00;8324.65;"2025-09-11 06:47:19";X;X;"MODERA DEWELOPER SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ";'
  + '"SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ";0000925819;7441828217;52013719100000;510687666;BIURO@MODERA.COM.PL;www.modera.com.pl;'
  + 'WARMIŃSKO-MAZURSKIE;IŁAWSKI;IŁAWA;"KAMIEŃ DUŻY";1C;14-200;'
  + 'WARMIŃSKO-MAZURSKIE;IŁAWSKI;IŁAWA;"KAMIEŃ DUŻY";1C;14-200;'
  + '"ul. Generała Władysława Andersa 12/10, 14-200 Iława";"OSOBISTY, TELEFONICZNY, E-MAILOWY"';
const WIERSZ2 = WIERSZ.replace('1891;XXII-B;639000.00;8324.65', '1871;XII-B;699000.00;6078.26');
const PLIK_MODERA = `${NAGLOWKI.join(';')}\n${WIERSZ}\n${WIERSZ2}\n`;

const w = O.zCsv(PLIK_MODERA, { zrodlo: 'dane.gov.pl / Modera' });
T('cennik wczytał się', w.ok, w.powod);
T('obie oferty wczytane', w.oferty.length === 2, String(w.oferty.length));
const of1 = w.oferty[0];
T('cena wzięta z pliku', of1.cena === 639000);
T('cena za metr wzięta z pliku, nie przeliczona', of1.jednostkowa === 8324.65);
T('oznaczenie lokalu zachowane', of1.lokal === 'XXII-B');
T('data aktualizacji przeczytana z godziną w polu', of1.data === '2025-09-11', of1.data);
T('deweloper zapisany', /MODERA/.test(of1.deweloper));
T('powierzchnia wyliczona z ceny i ceny metra', Math.abs(of1.powierzchnia - 76.76) < 0.05, String(of1.powierzchnia));
T('program mówi, że powierzchnia to jego dzielenie, a nie dana', of1.powierzchniaWyliczona === true);
T('uwaga o wyliczonej powierzchni trafia do wiersza', /wyliczona z ceny/.test(of1.uwagiZrodla));
T('„X" w cenie przed zmianą znaczy „nie dotyczy", a nie zero', of1.cenaPrzed === null);
T('miejscowość to KAMIEŃ DUŻY (lokal), nie IŁAWA (siedziba)', of1.miejscowosc === 'KAMIEŃ DUŻY', of1.miejscowosc);
T('adres niesie numer i kod pocztowy', /1C/.test(of1.adres) && /14-200/.test(of1.adres), of1.adres);
T('powiat z adresu lokalu', of1.powiat === 'IŁAWSKI');

/* --- 6. Oferta to nie transakcja --- */
T('każdy wiersz oznaczony jako oferta', w.oferty.every(o => o.rodzajDanych === 'oferta'));
T('żadnego wiersza nie wolno wziąć do zbioru porównawczego', w.oferty.every(o => o.doZbioru === false));
T('każdy wiersz niesie o tym zdanie', w.oferty.every(o => /OFERTOWA/.test(o.uwagiZrodla)));
T('wiersz nie udaje aktu notarialnego', w.oferty.every(o => o.akt === '' && o.kw === ''));

/* --- 7. Filtr miasta --- */
const tylkoIlawa = O.zCsv(PLIK_MODERA, { miasto: 'Kamień Duży' });
T('filtr miasta działa bez względu na wielkość litery i ogonki', tylkoIlawa.oferty.length === 2, String(tylkoIlawa.oferty.length));
const obce = O.zCsv(PLIK_MODERA, { miasto: 'Kraków' });
T('cennik z innego miasta nie wchodzi', obce.oferty.length === 0);
T('program mówi, ile wierszy odrzucił przez miasto', obce.pozaMiastem === 2);

/* --- 8. Nowy wzorzec (57 pól) — czytanie po nazwie, nie po pozycji --- */
const NOWY = 'Firma;Rodzaj nieruchomości;Numer lokalu;Powierzchnia użytkowa lokalu;Cena 1 m2 lokalu;Cena lokalu;'
  + 'Data obowiązywania ceny;Województwo lokalu;Miejscowość lokalu;Ulica lokalu;Nr nieruchomości lokalu;Kod pocztowy lokalu\n'
  + '"ARMA DEWELOPER";"lokal mieszkalny";A12;54,30;12000,00;651600,00;2026-11-11;POMORSKIE;GDAŃSK;"Kartuska";201;80-125';
const nw = O.zCsv(NOWY);
T('nowy wzorzec wczytuje się bez zmiany w programie', nw.ok && nw.oferty.length === 1, nw.powod);
T('powierzchnia wzięta z pliku, gdy plik ją ma', nw.oferty[0].powierzchnia === 54.3);
T('i nie jest wtedy podpisana jako wyliczona', nw.oferty[0].powierzchniaWyliczona === false);
T('przecinek dziesiętny czytany poprawnie', nw.oferty[0].cena === 651600 && nw.oferty[0].jednostkowa === 12000);
T('ulica z nowego wzorca trafia do adresu', /Kartuska 201/.test(nw.oferty[0].adres), nw.oferty[0].adres);
T('rodzaj nieruchomości przeczytany', nw.oferty[0].rodzaj === 'lokal mieszkalny');
T('data obowiązywania ceny przeczytana', nw.oferty[0].data === '2026-11-11');


/* --- 8b. Kolumna ceny metra NIE MOŻE udawać ceny lokalu --- */
/* Nagłówek „Cena 1 m2 lokalu" zawiera i „cena", i „lokalu". Bez wykluczeń
   program wziąłby cenę metra za cenę mieszkania: pokazałby lokal za 12 tysięcy
   złotych i powierzchnię 220 m². Taki wiersz w analizie rynku jest groźniejszy
   niż brak wiersza, bo wygląda wiarygodnie. */
const kNowy = O.rozpoznajKolumny(['Cena 1 m2 lokalu', 'Cena lokalu', 'Cena za m2 przed zmianą', 'Cena lokalu przed zmianą']);
T('cena metra rozpoznana osobno', kNowy.cenaM2 === 0, String(kNowy.cenaM2));
T('cena lokalu nie wzięła kolumny z metrem', kNowy.cena === 1, String(kNowy.cena));
T('cena przed zmianą nie wzięła kolumny z metrem', kNowy.cenaPrzed === 3, String(kNowy.cenaPrzed));
T('cena metra przed zmianą rozpoznana', kNowy.cenaM2Przed === 2, String(kNowy.cenaM2Przed));
T('cena obecna nie wzięła kolumny „przed zmianą"', kNowy.cena !== 3);
const kOdwrotnie = O.rozpoznajKolumny(['Cena lokalu', 'Cena 1 m2 lokalu']);
T('kolejność kolumn w pliku nie zmienia rozpoznania', kOdwrotnie.cena === 0 && kOdwrotnie.cenaM2 === 1);
T('„Powierzchnia" nie bierze kolumny z ceną za metr',
  O.rozpoznajKolumny(['Cena za m2', 'Powierzchnia użytkowa']).powierzchnia === 1);
T('nazwa dewelopera to nie forma prawna ani adres strony',
  (() => { const k = O.rozpoznajKolumny(['Forma prawna dewelopera', 'Adres strony internetowej dewelopera', 'Nazwa dewelopera']); return k.deweloper === 2; })());

/* --- 9. Liczby --- */
T('1 234,56 to 1234.56', O.liczba('1 234,56') === 1234.56);
T('1.234,56 to 1234.56', O.liczba('1.234,56') === 1234.56);
T('1,234.56 to 1234.56', O.liczba('1,234.56') === 1234.56);
T('639000.00 to 639000', O.liczba('639000.00') === 639000);
T('„450 000 zł" to 450000', O.liczba('450 000 zł') === 450000);
T('„X" to brak wartości, nie zero', O.liczba('X') === null);
T('pusty tekst to brak wartości, nie zero', O.liczba('') === null);
T('tekst to brak wartości', O.liczba('brak danych') === null);

/* --- 10. Plik bez ceny --- */
const bezCeny = O.zCsv('ID;Oznaczenie lokalu;Metraz\n1;A1;54');
T('plik bez kolumny ceny jest odrzucony, a nie wczytany pusty', bezCeny.ok === false);
T('program pokazuje nagłówki, których nie zrozumiał', /Oznaczenie lokalu/.test(bezCeny.powod), bezCeny.powod);
T('pusty plik nie udaje wczytanego', O.zCsv('').ok === false);

/* --- 11. Etapy szukania --- */
T('etapów jest kilka i każdy ma nazwę', O.ETAPY.length >= 5 && O.ETAPY.every(e => e.id && e.nazwa));
T('etap katalogu mówi, czego dotyczy', /Gdańsk/.test(O.etapOpis('katalog', { miasto: 'Gdańsk' })));
T('etap zbiorów podaje liczbę', /7 zbiorów/.test(O.etapOpis('zbiory', { ile: 7 })));
/* Odmiana nie jest ozdobnikiem: „znalazłem 3 zbiorów" wygląda jak program
   tłumaczony automatem, a ten program ma stać w jednym rzędzie z operatem,
   który rzeczoznawca podpisuje własnym nazwiskiem. */
T('jeden zbiór odmienia się poprawnie', /1 zbiór\b/.test(O.etapOpis('zbiory', { ile: 1 })));
T('trzy zbiory, a nie „3 zbiorów"', /3 zbiory\b/.test(O.etapOpis('zbiory', { ile: 3 })), O.etapOpis('zbiory', { ile: 3 }));
T('pięć zbiorów', /5 zbiorów/.test(O.etapOpis('zbiory', { ile: 5 })));
T('dwanaście to znów „zbiorów", nie „zbiory"', /12 zbiorów/.test(O.etapOpis('zbiory', { ile: 12 })));
T('dwadzieścia dwa to znów „zbiory"', /22 zbiory\b/.test(O.etapOpis('zbiory', { ile: 22 })));
T('odmiana działa też dla ofert', /2 oferty\b/.test(O.etapOpis('czytanie', { ile: 2 })), O.etapOpis('czytanie', { ile: 2 }));
T('i dla cenników w podsumowaniu', /2 cenników/.test(O.komunikat({ ile: 3, zbiorow: 2 })));
T('etap pobierania nazywa plik', /Cennik CSV/.test(O.etapOpis('plik', { nazwa: 'Cennik CSV', format: 'csv' })));
T('etap czytania podaje liczbę ofert', /wczytałem 12 ofert/.test(O.etapOpis('czytanie', { ile: 12 })));

/* --- 12. Komunikat i opis źródła --- */
const kPusty = O.komunikat({ ile: 0 });
T('pusty wynik nie znaczy „nie ma rynku"', /nie znaczy/.test(kPusty) && /rynku wtórnym/.test(kPusty), kPusty);
const kPelny = O.komunikat({ ile: 40, zbiorow: 3 });
T('komunikat podaje liczbę ofert i cenników', /40 ofert/.test(kPelny) && /3 cenników/.test(kPelny));
T('komunikat zawsze przypomina, że to oferty', /OFERTOWE/.test(kPelny) && /nie wchodzą/.test(kPelny));

const opis = O.opisZrodla({ deweloper: 'Modera', zbior: 'Ceny ofertowe', url: 'https://api.dane.gov.pl/resources/r2/file', dataDanych: '2025-09-11', pobrano: '2026-11-03' });
T('opis źródła podaje podstawę prawną', /art. 19b ust. 1/.test(opis));
T('opis źródła podaje dewelopera, plik i obie daty',
  /Modera/.test(opis) && /resources\/r2\/file/.test(opis) && /2025-09-11/.test(opis) && /2026-11-03/.test(opis), opis);

/* --- 13. Statystyka rynku ofertowego --- */
const st = O.statystyka([{ jednostkowa: 8000 }, { jednostkowa: 12000 }, { jednostkowa: 10000 }, { jednostkowa: null }]);
T('statystyka liczy medianę, nie średnią', st.mediana === 10000, String(st.mediana));
T('statystyka pomija wiersze bez ceny metra', st.ile === 3);
T('statystyka podaje widełki', st.min === 8000 && st.max === 12000);
T('bez danych statystyka nie udaje liczby', O.statystyka([]).mediana === null);


/* --- 13b. XLSX chodzi tą samą drogą co CSV --- */
/* Cennik w XLSX czytamy na wiersze innym modułem, ale rozkładamy DOKŁADNIE
   tą samą funkcją. Inaczej dwie drogi rozjechałyby się przy pierwszej
   zmianie wzorca, a jedna z nich cicho zaczęłaby brać złe kolumny. */
const wXlsx = O.zWierszy([
  ['Oznaczenie lokalu', 'Cena [PLN]', 'Cena za m² [PLN]', 'Miejscowość lokalu'],
  ['A1', 450000, 9000, 'Gdańsk'],
  ['A2', '', '', 'Gdańsk'],
], { zrodlo: 'cennik.xlsx' });
T('cennik z arkusza wczytuje się tak samo', wXlsx.ok && wXlsx.oferty.length === 1);
T('liczby z arkusza (nie tekst) czytane poprawnie', wXlsx.oferty[0].cena === 450000 && wXlsx.oferty[0].powierzchnia === 50);
T('wiersz bez ceny jest pominięty i policzony', wXlsx.pominieto === 1);
T('oferta z arkusza też nie wchodzi do zbioru', wXlsx.oferty[0].doZbioru === false);
T('puste wiersze arkusza nie są wierszami', O.zWierszy([['Cena'], ['', ''], [1000]]).oferty.length === 1);

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

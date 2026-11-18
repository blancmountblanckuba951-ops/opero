'use strict';
/**
 * OPERO — skąd wziąć ceny, gdy nie ma wyciągu.
 *
 * Jedna rzecz jest tu ważniejsza od wszystkich pozostałych: OFERTA TO NIE
 * TRANSAKCJA. Cena, po której ktoś chce sprzedać, nie może trafić do zbioru
 * porównawczego — a program, który by na to pozwolił, wyprodukowałby operat
 * nie do obrony. Test pilnuje tego podziału na każdym kroku.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const Z = require(path.join(APP, 'renderer', 'zrodla-cen.js'));

console.log('OPERO — źródła cen\n');

/* --- 1. Lista źródeł --- */
T('program zna kilka źródeł, nie jedno', Z.ZRODLA.length >= 6);
T('każde źródło ma nazwę, opis i zastrzeżenie',
  Z.ZRODLA.every(z => z.nazwa && String(z.opis).length > 30 && String(z.zastrzezenie).length > 20));
T('każde źródło jest oznaczone: transakcje czy oferty',
  Z.ZRODLA.every(z => [Z.RODZAJ.TRANSAKCJE, Z.RODZAJ.OFERTY, Z.RODZAJ.RECZNIE].includes(z.rodzaj)));
T('RCN z Geoportalu jest pierwszy', Z.ZRODLA.slice().sort((a, b) => a.kolejnosc - b.kolejnosc)[0].id === 'rcn-geoportal');
T('własna baza jest zaraz po nim',
  Z.ZRODLA.slice().sort((a, b) => a.kolejnosc - b.kolejnosc)[1].id === 'wlasna-baza');
T('ręczne wpisanie jest ostatnie',
  Z.ZRODLA.slice().sort((a, b) => a.kolejnosc - b.kolejnosc).pop().id === 'recznie');
T('źródła transakcyjne to RCN, własna baza i wyciąg ze starostwa',
  Z.transakcyjne().map(z => z.id).includes('rcn-geoportal')
  && Z.transakcyjne().map(z => z.id).includes('wyciag-starostwo'));

/* --- 2. Oferta to nie transakcja --- */
T('deweloperuch jest oznaczony jako oferty, nie transakcje',
  Z.zrodlo('deweloperuch').rodzaj === Z.RODZAJ.OFERTY);
T('dane.gov.pl to też oferty', Z.zrodlo('dane-gov').rodzaj === Z.RODZAJ.OFERTY);
T('NBP to dane zagregowane, nie zbiór porównawczy',
  /zagregowane|pojedynczych transakcji tam nie ma/i.test(Z.zrodlo('nbp').zastrzezenie));

const zRcn = Z.woloDoZbioru('rcn-geoportal');
T('transakcje z RCN wolno wstawić do zbioru', zRcn.wolno === true);
const zOfert = Z.woloDoZbioru('deweloperuch');
T('ofert do zbioru porównawczego wstawić NIE wolno', zOfert.wolno === false);
T('i program tłumaczy dlaczego',
  /ofertowe/.test(zOfert.powod) && /analizie rynku/.test(zOfert.powod), zOfert.powod);
T('nieznane źródło też jest odrzucone', Z.woloDoZbioru('cokolwiek').wolno === false);

// Program NIE pobiera danych z cudzych serwisow - bierze je u zrodla.
T('przy deweloperuchu program mówi wprost, że stamtąd nie pobiera',
  /nie pobiera/i.test(Z.zrodlo('deweloperuch').zastrzezenie), Z.zrodlo('deweloperuch').zastrzezenie);
T('i wyjaśnia, że transakcje bierze wprost z RCN',
  /wprost z RCN/i.test(Z.zrodlo('deweloperuch').zastrzezenie));

/* --- 3. Adresy stron składane z miejscowości --- */
T('adres deweloperucha składa się z miejscowości',
  Z.zrodlo('deweloperuch').url({ miasto: 'Gdańsk' }) === 'https://deweloperuch.pl/ceny-transakcyjne/gdansk/mieszkania');
T('polskie znaki w adresie są zamieniane', Z.doAdresu('Świnoujście') === 'swinoujscie');
T('dwuczłonowa nazwa dostaje myślnik', Z.doAdresu('Nowy Sącz') === 'nowy-sacz');
T('bez miejscowości otwiera się mapa całej Polski',
  /polska\/mapa/.test(Z.zrodlo('deweloperuch').url({})));
T('dane.gov.pl dostaje zapytanie z miastem',
  /ceny%20lokali%20Gda/.test(Z.zrodlo('dane-gov').url({ miasto: 'Gdańsk' })));

/* --- 4. Plan szukania --- */
const pusty = Z.planSzukania({ maTransakcji: 0, potrzeba: 3, miasto: 'Gdańsk' });
T('bez transakcji program wie, ilu brakuje', pusty.brakuje === 3 && pusty.wystarczy === false);
T('następnym krokiem jest źródło TRANSAKCYJNE, nie ofertowe',
  pusty.nastepny.rodzaj === Z.RODZAJ.TRANSAKCJE, pusty.nastepny.id);
T('pierwszym krokiem jest RCN z Geoportalu', pusty.nastepny.id === 'rcn-geoportal');
T('plan pokazuje całą drogę, nie tylko następny krok', pusty.kroki.length === Z.ZRODLA.length);
T('kroki z adresem mają gotowy link z miastem',
  pusty.kroki.find(k => k.id === 'deweloperuch').url.includes('gdansk'));

const poRcn = Z.planSzukania({ maTransakcji: 1, potrzeba: 3, sprawdzone: ['rcn-geoportal', 'wlasna-baza'] });
T('sprawdzone źródła są oznaczone',
  poRcn.kroki.find(k => k.id === 'rcn-geoportal').sprawdzone === true);
T('program przechodzi do kolejnego źródła transakcyjnego',
  poRcn.nastepny.id === 'wyciag-starostwo', poRcn.nastepny.id);

const wszystkoSprawdzone = Z.planSzukania({ maTransakcji: 2, potrzeba: 3, sprawdzone: Z.ZRODLA.map(z => z.id) });
T('gdy wszystko sprawdzone, program mówi o wpisaniu ręcznym',
  /ręcznie/i.test(Z.komunikat(wszystkoSprawdzone)), Z.komunikat(wszystkoSprawdzone));

const dosc = Z.planSzukania({ maTransakcji: 12, potrzeba: 3 });
T('gdy transakcji wystarczy, program to mówi', dosc.wystarczy === true && /wystarczy/.test(Z.komunikat(dosc)));
T('ale przypomina, że dobór należy do rzeczoznawcy', /należy do Ciebie/.test(Z.komunikat(dosc)));

const komunikatPusty = Z.komunikat(pusty);
T('komunikat mówi ile mam, ile potrzeba i co dalej',
  /ani jednej transakcji/.test(komunikatPusty) && /Następny krok/.test(komunikatPusty), komunikatPusty);

/* --- 5. Zdanie o źródłach do operatu --- */
const opis = Z.opisZrodel(['rcn-geoportal', 'deweloperuch'], '2026-11-03');
T('opis rozdziela dane transakcyjne od ofertowych',
  /Dane transakcyjne:/.test(opis) && /Dane ofertowe wykorzystane wyłącznie w analizie rynku:/.test(opis), opis);
T('opis niesie datę', opis.includes('2026-11-03'));
T('bez użytych źródeł nie ma co pisać', Z.opisZrodel([]) === '');

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

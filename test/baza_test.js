'use strict';
/**
 * OPERO — własna baza transakcji.
 *
 * To jest dorobek rzeczoznawcy zbierany latami, więc test pilnuje przede
 * wszystkim trzech rzeczy, których złamanie kosztowałoby go naprawdę:
 *   1. nic się nie dubluje — ten sam wyciąg wczytany dwa razy nie robi
 *      z jednej transakcji dwóch, bo mediana i trend policzone z duplikatów
 *      są nieprawdziwe w sposób niewidoczny na pierwszy rzut oka,
 *   2. nic się nie gubi — przy każdej transakcji zostaje ślad źródła,
 *   3. program NIE dobiera transakcji za człowieka — podpowiada i uzasadnia.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const B = require(path.join(APP, 'renderer', 'baza.js'));

console.log('OPERO — własna baza transakcji\n');

/* --- wiersze takie, jakie wychodzą z oceny wyciągu RCiWN --- */
function wiersz(n, nad = {}) {
  return {
    zrodloWiersz: n, adres: `ul. Testowa ${n}`, miejscowosc: 'Gdańsk',
    data: `2026-0${(n % 9) + 1}-10`, cena: 450000 + n * 1000, powierzchnia: 50,
    jednostkowa: (450000 + n * 1000) / 50, prawo: 'własność', rodzaj: 'sprzedaż',
    akt: `A ${n}/2026`, kw: '', uwagi: [], ...nad,
  };
}

/* --- 1. Wczytanie wyciągu do postaci bazy --- */
const nowe = B.zWyciagu([wiersz(1), wiersz(2)], { plik: 'C:/wyciagi/gdansk.xlsx' });
T('transakcje z wyciągu wchodzą do bazy', nowe.length === 2);
T('zostaje ślad pliku źródłowego', nowe[0].zrodlo.plik === 'C:/wyciagi/gdansk.xlsx');
T('zostaje numer wiersza wyciągu', nowe[0].zrodlo.wiersz === 1);
T('zostaje data dodania', /^\d{4}-\d{2}-\d{2}/.test(nowe[0].dodano));
T('cena jednostkowa jest policzona, gdy wyciąg jej nie podał',
  B.zWyciagu([wiersz(3, { jednostkowa: null })])[0].jednostkowa === (450000 + 3000) / 50);
T('wiersz bez daty albo bez ceny nie wchodzi do bazy',
  B.zWyciagu([wiersz(4, { data: '' }), wiersz(5, { jednostkowa: null, cena: null })]).length === 0);

/* --- 2. Nic się nie dubluje --- */
let baza = [];
let w = B.scal(baza, B.zWyciagu([wiersz(1), wiersz(2), wiersz(3)], { plik: 'a.xlsx' }));
T('pierwszy wyciąg wchodzi w całości', w.dodane === 3 && w.wpisy.length === 3);

w = B.scal(w.wpisy, B.zWyciagu([wiersz(1), wiersz(2), wiersz(3)], { plik: 'a.xlsx' }));
T('ten sam wyciąg wczytany drugi raz nic nie dokłada', w.dodane === 0 && w.pominiete === 3);
T('i baza nie urosła', w.wpisy.length === 3);

w = B.scal(w.wpisy, B.zWyciagu([wiersz(3), wiersz(4), wiersz(5)], { plik: 'b.xlsx' }));
T('kolejny wyciąg dokłada tylko to, czego jeszcze nie było', w.dodane === 2 && w.pominiete === 1);

// Ten sam akt notarialny to ta sama czynnosc - nawet jesli ktos inaczej zapisal adres.
const inaczejZapisany = B.zWyciagu([wiersz(1, { adres: 'Testowa 1 (lok. 2)', miejscowosc: 'GDAŃSK' })]);
T('ten sam akt notarialny rozpoznajemy mimo innego zapisu adresu',
  B.scal(w.wpisy, inaczejZapisany).dodane === 0);

// Bez aktu musi wystarczyc reszta - ale NIE sam adres: pod jednym adresem
// sprzedaje sie kilkanascie mieszkan i zlanie ich w jedno byloby zguba danych.
const bezAktu = B.zWyciagu([
  wiersz(7, { akt: '', powierzchnia: 50, cena: 500000, jednostkowa: 10000 }),
  wiersz(7, { akt: '', powierzchnia: 70, cena: 630000, jednostkowa: 9000 }),
]);
const bezAktuWynik = B.scal([], bezAktu);
T('bez aktu dwie różne transakcje pod tym samym adresem zostają dwiema', bezAktuWynik.dodane === 2);
T('ale identyczny wiersz bez aktu nie dubluje się',
  B.scal(bezAktuWynik.wpisy, B.zWyciagu([wiersz(7, { akt: '', powierzchnia: 50, cena: 500000, jednostkowa: 10000 })])).dodane === 0);
T('każdy wpis dostaje własny identyfikator',
  new Set(w.wpisy.map(x => x.id)).size === w.wpisy.length);

/* --- 3. Szukanie --- */
const duza = B.scal([], B.zWyciagu([
  wiersz(10, { miejscowosc: 'Gdańsk', powierzchnia: 40, data: '2025-03-10' }),
  wiersz(11, { miejscowosc: 'Gdynia', powierzchnia: 60, data: '2026-05-10' }),
  wiersz(12, { miejscowosc: 'Gdańsk', powierzchnia: 80, data: '2026-08-10', prawo: 'spółdzielcze własnościowe' }),
], { plik: 'c.xlsx' })).wpisy;

T('filtr po miejscowości', B.filtruj(duza, { miejscowosc: 'Gdańsk' }).length === 2);
T('miejscowość bez ogonków też trafia', B.filtruj(duza, { miejscowosc: 'gdansk' }).length === 2);
T('filtr po dacie od', B.filtruj(duza, { odData: '2026-01-01' }).length === 2);
T('filtr po powierzchni', B.filtruj(duza, { powOd: 50, powDo: 70 }).length === 1);
T('filtr po prawie', B.filtruj(duza, { prawo: 'spółdzielcze' }).length === 1);
T('szukanie w treści obejmuje akt', B.filtruj(duza, { tekst: 'A 11/2026' }).length === 1);
T('pusty filtr zwraca wszystko', B.filtruj(duza, {}).length === 3);

/* --- 4. Co jest w bazie --- */
const st = B.statystyki(duza);
T('statystyka liczy transakcje', st.ile === 3);
T('statystyka podaje zakres dat', st.odData === '2025-03-10' && st.doData === '2026-08-10');
T('statystyka podaje medianę ceny jednostkowej', st.mediana != null && st.mediana > 0);
T('statystyka pokazuje, gdzie jest najwięcej danych',
  st.miejscowosci[0].nazwa === 'Gdańsk' && st.miejscowosci[0].ile === 2);
T('pusta baza nie wywraca statystyki', B.statystyki([]).ile === 0 && B.statystyki(null).mediana === null);

/* --- 5. Podpowiedzi do konkretnej wyceny --- */
const dopasowane = B.dopasuj(duza, { miejscowosc: 'Gdańsk', powierzchnia: 50, dataWyceny: '2026-09-01' });
T('podpowiadamy tylko transakcje z tego rynku',
  dopasowane.every(t => t.miejscowosc === 'Gdańsk'), JSON.stringify(dopasowane.map(t => t.miejscowosc)));
T('transakcja sprzed ponad dwóch lat odpada',
  !dopasowane.some(t => t.data === '2025-03-10') || dopasowane.find(t => t.data === '2025-03-10').wiek <= 24);
T('każdy kandydat ma napisane, dlaczego jest podpowiadany',
  dopasowane.every(t => (t.powody || []).length >= 1 && /mies\./.test(t.powody[0])));
T('kandydat zna swój wiek w miesiącach i odchylenie powierzchni',
  dopasowane.every(t => Number.isFinite(t.wiek) && (t.odchylenie === null || Number.isFinite(t.odchylenie))));

// Powierzchnia za daleka od wycenianej nie jest „podobna" - 40 m2 przy 200 m2
// to inny produkt rynkowy, a nie ta sama nieruchomosc trzy razy mniejsza.
T('powierzchnia odbiegająca o ponad połowę odpada',
  B.dopasuj(duza, { miejscowosc: 'Gdańsk', powierzchnia: 200, dataWyceny: '2026-09-01' }).length === 0);
T('spółdzielcze własnościowe to NIE to samo co własność',
  B.rodzajPrawa('spółdzielcze własnościowe prawo do lokalu') !== B.rodzajPrawa('własność'));
T('użytkowanie wieczyste też jest osobnym prawem',
  B.rodzajPrawa('użytkowanie wieczyste') === 'uzytkowanie wieczyste');
T('„prawo własności” i „własność” to jedno i to samo',
  B.rodzajPrawa('prawo własności') === B.rodzajPrawa('własność'));
T('inne prawo jest podpowiedziane, ale z ostrzeżeniem', (() => {
  const d = B.dopasuj(duza, { miejscowosc: 'Gdańsk', powierzchnia: 70, dataWyceny: '2026-09-01', prawo: 'własność' });
  const spoldzielcze = d.find(t => /spółdzielcze/.test(t.prawo));
  return spoldzielcze && spoldzielcze.powody.some(x => /UWAGA/.test(x));
})());
T('świeższa transakcja stoi wyżej', (() => {
  const d = B.dopasuj(duza, { miejscowosc: 'Gdańsk', powierzchnia: 60, dataWyceny: '2026-09-01' });
  return d.length < 2 || d[0].data >= d[d.length - 1].data;
})());
T('transakcja PO dacie wyceny nie jest podpowiadana',
  B.dopasuj(duza, { miejscowosc: 'Gdańsk', powierzchnia: 80, dataWyceny: '2026-06-01' })
    .every(t => t.data <= '2026-06-01'));

/* --- 6. Przeniesienie do operatu --- */
const szersze = B.dopasuj(duza, { miejscowosc: 'Gdańsk', powierzchnia: 60, dataWyceny: '2026-09-01' });
const doOperatu = B.doOperatu(szersze.slice(0, 2), 1);
T('transakcje wchodzą do operatu z numeracją od 1', doOperatu[0].id === 1 && doOperatu[1].id === 2);
T('w operacie są adres, data, powierzchnia i cena jednostkowa',
  doOperatu.every(t => t.address && t.date && t.area > 0 && t.priceUnit > 0));
T('Δt policzy silnik z dat, a nie baza', doOperatu.every(t => t.autoMonthsToValuation === true));
T('oceny cech nie są zgadywane', doOperatu.every(t => Object.keys(t.featureRatings).length === 0));
T('ślad pochodzenia idzie razem z transakcją',
  doOperatu.every(t => t.zrodlo && t.zrodlo.akt && (t.zrodlo.uwagi || []).some(u => /bazy/i.test(u))));

/* --- 7. Eksport: baza jest Twoja i ma dać się wynieść --- */
const csv = B.doCsv(duza);
T('eksport ma nagłówek i wiersze', csv.split('\r\n').filter(Boolean).length === 4);
T('eksport otwiera się w polskim Excelu (BOM i średniki)',
  csv.charCodeAt(0) === 0xFEFF && csv.split('\r\n')[0].split(';').length === 11);
T('średnik w treści nie rozwala kolumn', (() => {
  const z = B.doCsv([{ data: '2026-01-01', adres: 'ul. A; lok. 2', miejscowosc: 'Gdańsk', powierzchnia: 50,
    cena: 1, jednostkowa: 1, prawo: '', rodzaj: '', akt: '', kw: '', zrodlo: {} }]);
  return /"ul\. A; lok\. 2"/.test(z);
})());

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

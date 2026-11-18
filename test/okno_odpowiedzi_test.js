'use strict';
/**
 * OPERO — okno odpowiedzi.
 *
 * Rzecz, której ten test pilnuje najmocniej: ODPOWIEDŹ PROGRAMU NIE MOŻE SIĘ
 * ZGUBIĆ. Jeżeli przy przepełnieniu zniknęłoby to, co najnowsze, albo jeżeli
 * dwadzieścia etapów szukania zasypałoby pytanie, na które człowiek czeka —
 * okno byłoby gorsze niż jego brak, bo dawałoby złudzenie, że wszystko widać.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const O = require(path.join(APP, 'renderer', 'okno-odpowiedzi.js'));

console.log('OPERO — okno odpowiedzi\n');

/* --- 1. Dopisywanie --- */
let s = O.nowe();
T('nowe okno jest puste', s.wpisy.length === 0 && s.nastepnyId === 1);
const w1 = O.dodaj(s, { rodzaj: 'odpowiedz', tekst: 'Pobrano 12 transakcji.', grupa: 'Szukanie transakcji' });
T('komunikat dopisany', s.wpisy.length === 1 && w1.id === 1);
T('komunikat zna swój rodzaj i zadanie', w1.rodzaj === 'odpowiedz' && w1.grupa === 'Szukanie transakcji');
T('komunikat ma godzinę', /^\d{4}-\d{2}-\d{2}T/.test(w1.kiedy));
T('nowy komunikat jest nieprzeczytany', w1.przeczytane === false);
T('pusty tekst nie tworzy wiersza', O.dodaj(s, { tekst: '   ' }) === null && s.wpisy.length === 1);
T('nieznany rodzaj staje się informacją', O.dodaj(s, { tekst: 'cokolwiek', rodzaj: 'wymyslony' }).rodzaj === 'info');
T('bez zadania komunikat trafia do „Program"', O.dodaj(s, { tekst: 'bez grupy' }).grupa === 'Program');
T('brak stanu to błąd, nie cicha zguba',
  (() => { try { O.dodaj(null, { tekst: 'x' }); return false; } catch { return true; } })());

/* --- 2. Powtórzenia się zlicza --- */
s = O.nowe();
for (let i = 0; i < 20; i++) O.dodaj(s, { rodzaj: 'etap', tekst: 'Pobieram cennik.', grupa: 'Oferty' });
T('dwadzieścia razy to samo to jeden wiersz', s.wpisy.length === 1, String(s.wpisy.length));
T('ale z licznikiem', s.wpisy[0].powtorzenia === 20);
T('powtórzenie znów jest nieprzeczytane', s.wpisy[0].przeczytane === false);
T('licznik widać w skrócie', /×20/.test(O.skrot(s)), O.skrot(s));
O.dodaj(s, { rodzaj: 'etap', tekst: 'Pobieram cennik.', grupa: 'Transakcje' });
T('to samo zdanie w innym zadaniu to osobny wiersz', s.wpisy.length === 2);

/* --- 3. Etap zastępuje etap, ale historia zostaje --- */
s = O.nowe();
O.dodaj(s, { rodzaj: 'etap', tekst: 'Pytam katalog dane.gov.pl.', grupa: 'Oferty' });
O.dodaj(s, { rodzaj: 'etap', tekst: 'Pobieram cennik Modery.', grupa: 'Oferty' });
O.dodaj(s, { rodzaj: 'etap', tekst: 'Czytam cennik.', grupa: 'Oferty' });
T('historia etapów zostaje w oknie', s.wpisy.length === 3);
T('ale w toku jest tylko jeden — ten bieżący', O.wToku(s).length === 1);
T('i jest to etap najnowszy', O.wToku(s)[0].tekst === 'Czytam cennik.');
O.dodaj(s, { rodzaj: 'etap', tekst: 'Inne zadanie.', grupa: 'Transakcje' });
T('etap jednego zadania nie kończy etapu drugiego', O.wToku(s).length === 2);
T('po zadaniu da się zapytać osobno', O.wToku(s, 'Oferty').length === 1);
O.zakonczEtapy(s, 'Oferty');
T('zakończenie etapów zamyka kółeczko', O.wToku(s, 'Oferty').length === 0);
T('i nie rusza drugiego zadania', O.wToku(s, 'Transakcje').length === 1);
T('zakończone etapy nadal są w historii', s.wpisy.length === 4);

/* --- 4. Nieprzeczytane: pilne osobno --- */
s = O.nowe();
O.dodaj(s, { rodzaj: 'info', tekst: 'Zapisano projekt.' });
O.dodaj(s, { rodzaj: 'odpowiedz', tekst: 'Pobrano 12 transakcji.' });
O.dodaj(s, { rodzaj: 'pytanie', tekst: 'Podaj powierzchnię użytkową lokalu.' });
O.dodaj(s, { rodzaj: 'blad', tekst: 'Nie udało się pobrać cennika.' });
const n = O.nieprzeczytane(s);
T('licznik liczy wszystkie nieprzeczytane', n.razem === 4);
T('pytania i błędy liczone osobno jako pilne', n.pilne === 2, String(n.pilne));
O.oznaczPrzeczytane(s, 3);
T('jeden komunikat da się oznaczyć jako przeczytany', O.nieprzeczytane(s).razem === 3);
T('i to był właśnie ten wskazany', O.nieprzeczytane(s).pilne === 1);
O.oznaczPrzeczytane(s);
T('da się oznaczyć wszystkie', O.nieprzeczytane(s).razem === 0);

/* --- 5. Przepełnienie: giną najstarsze --- */
s = O.nowe();
for (let i = 1; i <= O.MAKS + 30; i++) O.dodaj(s, { rodzaj: 'info', tekst: `komunikat ${i}` });
T('okno nie rośnie bez końca', s.wpisy.length === O.MAKS);
T('NAJNOWSZY komunikat został', s.wpisy[s.wpisy.length - 1].tekst === `komunikat ${O.MAKS + 30}`);
T('zniknęły najstarsze, nie najnowsze', s.wpisy[0].tekst === 'komunikat 31');
T('okno mówi, ile komunikatów ubyło', s.usunietych === 30);
T('informacja o ubytku trafia do zapisu tekstowego', /najstarszych 30/.test(O.doTekstu(s)));

/* --- 6. Filtr --- */
s = O.nowe();
O.dodaj(s, { rodzaj: 'pytanie', tekst: 'Dołóż zdjęcia lokalu.', grupa: 'Express' });
O.dodaj(s, { rodzaj: 'odpowiedz', tekst: 'Pobrano 12 transakcji z Gdańska.', grupa: 'Transakcje' });
O.dodaj(s, { rodzaj: 'blad', tekst: 'Usługa Geoportalu nie odpowiedziała.', grupa: 'Transakcje' });
T('filtr po rodzaju', O.filtruj(s, { rodzaj: 'pytanie' }).length === 1);
T('filtr po treści', O.filtruj(s, { fraza: 'gdansk' }).length === 1);
T('filtr nie przejmuje się ogonkami', O.filtruj(s, { fraza: 'GDAŃSK' }).length === 1);
T('filtr po nazwie zadania', O.filtruj(s, { fraza: 'transakcje' }).length === 2);
T('oba filtry razem', O.filtruj(s, { rodzaj: 'blad', fraza: 'geoportal' }).length === 1);
T('pusty filtr pokazuje wszystko', O.filtruj(s, {}).length === 3);

/* --- 7. Zadania --- */
const g = O.grupy(s);
T('zadania rozdzielone', g.length === 2);
T('najnowsze zadanie na górze', g[0].grupa === 'Transakcje', g[0].grupa);
T('zadanie liczy swoje nieprzeczytane', g[0].nieprzeczytane === 2);
T('zadanie trzyma swoje komunikaty po kolei', g[0].wpisy[0].tekst.includes('Pobrano'));

/* --- 8. Skrót i ostatni --- */
T('skrót to ostatnie zdanie programu', O.skrot(s).includes('Geoportalu'));
T('skrót niesie znak rodzaju', O.skrot(s).startsWith('!'));
T('da się zapytać o ostatnie zdanie danego rodzaju', O.ostatni(s, 'pytanie').tekst.includes('zdjęcia'));
T('w pustym oknie skrót jest pusty', O.skrot(O.nowe()) === '');
T('w pustym oknie nie ma ostatniego', O.ostatni(O.nowe()) === null);

/* --- 9. Szczegóły, źródło i działanie --- */
s = O.nowe();
const z = O.dodaj(s, {
  rodzaj: 'odpowiedz', tekst: 'Pobrano 40 ofert.', grupa: 'Oferty',
  szczegoly: 'Mediana 11 200 zł/m², widełki 8 900–15 400.',
  zrodlo: 'dane.gov.pl, cennik z 2026-10-30',
  dzialanie: { id: 'pokaz-oferty', napis: 'Pokaż oferty' },
});
T('komunikat niesie szczegóły', z.szczegoly.includes('Mediana'));
T('komunikat niesie źródło', z.zrodlo.includes('dane.gov.pl'));
T('komunikat może mieć przycisk', z.dzialanie.id === 'pokaz-oferty' && z.dzialanie.napis === 'Pokaż oferty');
T('przycisk bez numeru jest pomijany', O.dodaj(s, { tekst: 'x', dzialanie: { napis: 'Klik' } }).dzialanie === null);

/* --- 10. Zapis tekstowy --- */
const tekst = O.doTekstu(s);
T('zapis zawiera nazwę zadania', /\[Oferty\]/.test(tekst));
T('zapis zawiera treść', tekst.includes('Pobrano 40 ofert.'));
T('zapis zawiera szczegóły i źródło', tekst.includes('Mediana') && tekst.includes('Źródło: dane.gov.pl'));
T('zapis zawiera godziny', /\d{2}:\d{2}:\d{2}/.test(tekst));
T('puste okno zapisuje się uczciwie', /nie powiedział jeszcze nic/.test(O.doTekstu(O.nowe())));

/* --- 11. Czyszczenie --- */
O.wyczysc(s);
T('czyszczenie opróżnia okno', s.wpisy.length === 0);
T('po czyszczeniu licznik ubytków wraca do zera', s.usunietych === 0);
T('numeracja po czyszczeniu idzie dalej, nie od nowa', O.dodaj(s, { tekst: 'nowy' }).id > 1);

/* --- 12. Rodzaje mają opisy --- */
T('każdy rodzaj ma znak i nazwę',
  Object.values(O.RODZAJE).every(r => O.OPISY[r] && O.OPISY[r].znak && O.OPISY[r].nazwa));
T('pytanie waży więcej niż informacja', O.OPISY.pytanie.waga > O.OPISY.info.waga);
T('błąd waży więcej niż etap', O.OPISY.blad.waga > O.OPISY.etap.waga);

/* --- 13. Godzina --- */
T('godzina ma dwie cyfry na każdej pozycji', /^\d{2}:\d{2}:\d{2}$/.test(O.godzina('2026-11-03T07:05:09Z')));
T('bzdura zamiast daty nie daje „NaN:NaN"', O.godzina('nie data') === '');


/* --- 13b. Co trafia na pasek u góry ---
   Pasek pokazuje JEDNO zdanie, więc wybór tego zdania jest całą rzeczą.
   Reguła, która ma tu największe znaczenie: komunikat tła (kontrola operatu
   licząca się sama, autozapis) NIE MOŻE przykryć odpowiedzi, o którą człowiek
   właśnie poprosił. Bez niej program odpowiada na pytanie i sam natychmiast
   zasłania własną odpowiedź. */
s = O.nowe();
T('w pustym oknie pasek nie ma co pokazać', O.naPasek(s) === null);
O.dodaj(s, { rodzaj: 'odpowiedz', tekst: 'Pobrano 12 transakcji.', grupa: 'Transakcje' });
T('pasek pokazuje ostatnią odpowiedź', O.naPasek(s).tekst === 'Pobrano 12 transakcji.');
O.dodaj(s, { rodzaj: 'blad', tekst: 'Kontrola operatu: brakuje 45 ocen.', grupa: 'Rynek', tlo: true });
T('komunikat tła NIE przykrywa nieprzeczytanej odpowiedzi',
  O.naPasek(s).tekst === 'Pobrano 12 transakcji.', O.naPasek(s).tekst);
O.oznaczPrzeczytane(s);
T('ale po przeczytaniu odpowiedzi tło może się pokazać',
  /Kontrola operatu/.test(O.naPasek(s).tekst), O.naPasek(s).tekst);
/* Świeżość, a nie samo „nieprzeczytane": gdyby decydowało drugie, pasek
   zamarłby na jednej odpowiedzi do czasu, aż ktoś otworzy okno. */
{
  const stary = O.nowe();
  O.dodaj(stary, { rodzaj: 'odpowiedz', tekst: 'Stara odpowiedź.', kiedy: new Date(Date.now() - 10 * 60000) });
  O.dodaj(stary, { rodzaj: 'info', tekst: 'Autozapis.', tlo: true });
  T('odpowiedź sprzed dziesięciu minut nie blokuje paska na zawsze',
    O.naPasek(stary).tekst === 'Autozapis.', O.naPasek(stary).tekst);
  const swiezy = O.nowe();
  O.dodaj(swiezy, { rodzaj: 'odpowiedz', tekst: 'Świeża odpowiedź.' });
  O.dodaj(swiezy, { rodzaj: 'info', tekst: 'Autozapis.', tlo: true });
  T('ale sprzed sekundy — owszem', O.naPasek(swiezy).tekst === 'Świeża odpowiedź.');
}
O.dodaj(s, { rodzaj: 'etap', tekst: 'Pobieram cennik.', grupa: 'Oferty' });
T('to, co TRWA, ma pierwszeństwo przed wszystkim', O.naPasek(s).tekst === 'Pobieram cennik.');
O.zakonczEtapy(s);
O.dodaj(s, { rodzaj: 'pytanie', tekst: 'Którą miejscowość?', grupa: 'Adres' });
T('po zakończeniu etapu wraca pytanie do człowieka', O.naPasek(s).tekst === 'Którą miejscowość?');
O.dodaj(s, { rodzaj: 'info', tekst: 'Zapisano projekt.', grupa: 'Program', tlo: true });
T('tło nie przykrywa też nieprzeczytanego pytania',
  O.naPasek(s).tekst === 'Którą miejscowość?', O.naPasek(s).tekst);
T('komunikat tła jest oznaczony w oknie', s.wpisy[s.wpisy.length - 1].tlo === true);
T('komunikat wywołany przez człowieka nie jest tłem',
  s.wpisy.find(w => w.tekst === 'Którą miejscowość?').tlo === false);

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

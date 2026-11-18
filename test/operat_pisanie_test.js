'use strict';
/**
 * OPERO — Express pisze cały operat modelem lokalnym.
 *
 * Ten test pilnuje jednej rzeczy ponad wszystkie inne: MODEL NIE MOŻE WNIEŚĆ
 * DO OPERATU LICZBY, KTÓREJ NIKT NIE PODAŁ. Model językowy napisze „ceny
 * wzrosły o 8% w ciągu roku" tak samo gładko, jak napisze prawdę — a wymyślona
 * liczba w operacie szacunkowym to podstawa odpowiedzialności zawodowej
 * rzeczoznawcy, nie literówka.
 *
 * Dlatego sprawdzamy nie to, czy program pisze ładnie (tego test nie oceni),
 * ale to, czy UMIE WYŁAPAĆ wymyśloną wartość i pokazać ją człowiekowi.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const P = require(path.join(APP, 'renderer', 'operat-pisanie.js'));

console.log('OPERO — Express pisze operat\n');

const PROJEKT = {
  property: { city: 'Gdańsk', district: 'Siedlce', street: 'Kartuska', buildingNo: '201', localNo: '3',
    usableArea: 54.3, postcode: '80-125', commune: 'Gdańsk', county: 'Gdańsk', voivodeship: 'POMORSKIE' },
  valuation: { valuationDate: '2026-11-03', inspectionDate: '2026-10-28', purpose: 'sprzedaż', legalStateDate: '2026-10-30' },
  legal: { kwLocal: 'GD1G/00012345/0' },
  local: { rooms: 3, floor: '2', standardLevel: 'dobry' },
  building: { year: 1998, technology: 'murowana' },
  market: { transactions: [
    { date: '2026-01-02', area: 50, priceUnit: 9000, address: 'Kartuska 100' },
    { date: '2026-05-05', area: 60, priceUnit: 11000, address: 'Kartuska 150' },
    { date: '2026-07-07', area: 55, priceUnit: 10000, address: 'Kartuska 180' },
  ] },
  author: { name: 'Jan Kowalski', licenseNo: '1234' },
  client: { name: 'Anna Nowak' },
};
const CALC = { cmin: 9000, cmax: 11000, cavg: 10000, valueRounded: 580000, value: 579_990, unitValue: 10681, totalCorrection: 1.07 };

/* --- 1. Rozdziały --- */
T('program pisze wszystkie rozdziały opisowe', P.ROZDZIALY.length >= 10);
T('każdy rozdział ma podstawę prawną i cel',
  P.ROZDZIALY.every(r => r.podstawa && String(r.cel).length > 30));
T('każdy rozdział ma odnośnik do podręcznika', P.ROZDZIALY.every(r => r.podrecznik));
T('kolejność rozdziałów jest ustalona',
  P.ROZDZIALY.every((r, i, a) => i === 0 || a[i - 1].kolejnosc < r.kolejnosc));
/* Klucze MUSZĄ być te, których czyta generator operatu — inaczej program
   napisałby rozdziały, których nikt nigdy nie zobaczy w gotowym pliku. */
const zrodloRaportu = fs.readFileSync(path.join(APP, 'renderer', 'report.bundle.js'), 'utf8');
T('każdy rozdział trafia do generatora operatu',
  P.ROZDZIALY.every(r => zrodloRaportu.includes(`narratives.${r.id}`)),
  P.ROZDZIALY.filter(r => !zrodloRaportu.includes(`narratives.${r.id}`)).map(r => r.id).join(','));
T('rynek i wynik są wśród rozdziałów', P.ROZDZIALY.some(r => r.id === 'market') && P.ROZDZIALY.some(r => r.id === 'result'));
T('rozdziały najbardziej narażone na wymyślanie mają osobne ostrzeżenie',
  ['market', 'planning', 'result', 'legal'].every(id => P.ROZDZIALY.find(r => r.id === id).ostroznie));

/* --- 2. Fakty: jedyny materiał --- */
const F = P.fakty(PROJEKT, CALC, { zrodla: ['Rejestr Cen Nieruchomości, pobrano 2026-11-03'] });
const mapa = new Map(F.map(f => [f.nazwa, f.wartosc]));
T('adres zebrany w jeden fakt', /Kartuska 201/.test(mapa.get('adres')) && /Gdańsk/.test(mapa.get('adres')));
T('powierzchnia jest faktem z jednostką', mapa.get('powierzchnia') === '54.3 m²');
T('data wyceny jest faktem', mapa.get('data wyceny') === '2026-11-03');
T('liczba transakcji policzona, nie przepisana', mapa.get('liczba transakcji') === '3');
T('wartość rynkowa pochodzi z silnika obliczeń', /580/.test(mapa.get('wartość rynkowa')));
T('ceny skrajne są faktami', mapa.has('cena minimalna w zbiorze') && mapa.has('cena maksymalna w zbiorze'));
T('rozpiętość cen podana wprost', /od .* do .*za m²/.test(mapa.get('rozpiętość cen')), mapa.get('rozpiętość cen'));
T('daty skrajne transakcji wyliczone ze zbioru',
  mapa.get('najstarsza transakcja w zbiorze') === '2026-01-02' && mapa.get('najnowsza transakcja w zbiorze') === '2026-07-07');
T('powierzchnie skrajne w zbiorze wyliczone', mapa.get('najmniejsza powierzchnia w zbiorze') === '50 m²');
T('źródła cen są faktem', /Rejestr Cen/.test(mapa.get('źródła danych o cenach')));
T('pustych faktów na liście nie ma', F.every(f => f.wartosc && f.nazwa));
T('fakt liczbowy niesie liczbę do sprawdzania', F.find(f => f.nazwa === 'powierzchnia').liczba === 54.3);
T('pusty projekt nie produkuje wymyślonych faktów', P.fakty({}, {}).every(f => f.wartosc));

/* --- 3. Polecenie dla modelu --- */
const pol = P.polecenie(P.ROZDZIALY.find(r => r.id === 'market'), F, { podrecznikOdnosnik: 'Rozdział 7, s. 112' });
T('polecenie nazywa rozdział', /ROZDZIAŁ: Charakterystyka rynku/.test(pol));
T('polecenie podaje podstawę prawną', /PODSTAWA PRAWNA/.test(pol));
T('polecenie zakazuje liczb spoza faktów', /NIE PODAWAJ ŻADNEJ LICZBY/.test(pol));
T('polecenie zakazuje wiedzy ogólnej o rynku', /wiedzę ogólną o rynku/.test(pol));
T('polecenie zakazuje przeliczania', /Nie przeliczaj/.test(pol));
T('polecenie mówi, że brak danej to poprawna odpowiedź', /jest poprawna odpowiedź/.test(pol));
T('polecenie zawiera listę faktów', /FAKTY \(jedyny dopuszczalny materiał\)/.test(pol) && /liczba transakcji: 3/.test(pol));
T('polecenie niesie odnośnik do podręcznika', /Rozdział 7, s. 112/.test(pol));
T('polecenie dla rynku niesie szczególne ostrzeżenie', /SZCZEGÓLNA OSTROŻNOŚĆ/.test(pol));
T('bez rozdziału program nie składa polecenia',
  (() => { try { P.polecenie(null, F); return false; } catch { return true; } })());

/* --- 4. Braki: program woli spytać, niż pozwolić wypełnić --- */
T('brak powierzchni jest wykryty',
  P.braki(P.ROZDZIALY.find(r => r.id === 'subject'), P.fakty({ property: { city: 'Gdańsk', street: 'Długa' } }, {})).includes('powierzchnia'));
T('przy pełnych danych braków nie ma',
  P.braki(P.ROZDZIALY.find(r => r.id === 'subject'), F).length === 0);
const polBrak = P.polecenie(P.ROZDZIALY.find(r => r.id === 'result'), P.fakty({}, {}));
T('polecenie mówi modelowi, czego nie ma', /tych danych NIE MA: wartość rynkowa/.test(polBrak), polBrak.slice(-200));
T('i każe oznaczyć to jako [DO UZUPEŁNIENIA]', /DO UZUPEŁNIENIA/.test(polBrak));

/* --- 5. SPRAWDZANIE NAPISANEGO — rzecz najważniejsza --- */
const dobry = 'Przedmiotem wyceny jest lokal mieszkalny nr 3 przy ul. Kartuska 201 w Gdańsku, '
  + 'o powierzchni użytkowej 54,30 m². Wartość rynkowa określona w operacie wynosi 580 000 zł. '
  + 'Zbiór porównawczy liczy 3 transakcje z okresu od 2026-01-02 do 2026-07-07, o cenach jednostkowych '
  + 'od 9000 zł do 11 000 zł za m². Zgodnie z art. 156 ust. 1 ugn oraz § 26 rozporządzenia.';
const kDobry = P.sprawdzTekst(dobry, F);
T('tekst oparty wyłącznie na faktach przechodzi', kDobry.ok, JSON.stringify(kDobry.obce));
T('numery artykułów i paragrafów nie są zgłaszane', !kDobry.obce.some(o => [156, 1, 26].includes(o.wartosc)));

const wymyslony = 'Ceny w tej dzielnicy wzrosły o 8% w ciągu ostatniego roku, a mediana wynosi 11 200 zł/m². '
  + 'Czas ekspozycji wynosi średnio 47 dni.';
const kZly = P.sprawdzTekst(wymyslony, F);
T('wymyślona mediana jest zgłoszona', !kZly.ok && kZly.obce.some(o => o.wartosc === 11200));
T('wymyślony procent jest zgłoszony, choć to mała liczba', kZly.obce.some(o => o.wartosc === 8), JSON.stringify(kZly.obce));
T('wymyślony czas ekspozycji jest zgłoszony', kZly.obce.some(o => o.wartosc === 47));
T('ostrzeżenie mówi, co się stało i co z tym zrobić',
  /nie podałeś programowi/.test(kZly.ostrzezenie) && /sprawdź każdą albo usuń/.test(kZly.ostrzezenie), kZly.ostrzezenie);
T('ostrzeżenie wymienia konkretne wartości', /11 200/.test(kZly.ostrzezenie));

T('liczebniki w zdaniu nie są zgłaszane',
  P.sprawdzTekst('Lokal składa się z trzech pokoi, 2 łazienek i 1 balkonu.', F).ok);
T('ale kwota w złotych jest sprawdzana nawet gdy mała',
  !P.sprawdzTekst('Koszt remontu oszacowano na 9 zł za m².', F).ok);
T('wymyślona data jest zgłoszona',
  P.sprawdzTekst('Oględziny przeprowadzono 2026-02-14.', F).obce.some(o => o.rodzaj === 'data'));
T('data z faktów nie jest zgłaszana',
  !P.sprawdzTekst('Oględziny przeprowadzono 2026-10-28.', F).obce.some(o => o.rodzaj === 'data'));
T('data w zapisie polskim też jest rozpoznawana',
  !P.sprawdzTekst('Oględziny przeprowadzono 28.10.2026 r.', F).obce.some(o => o.rodzaj === 'data'));
T('miejsca [DO UZUPEŁNIENIA] są policzone',
  P.sprawdzTekst('Przeznaczenia nie ustalono [DO UZUPEŁNIENIA]. Stanu prawnego nie badano [DO UZUPEŁNIENIA].', F).doUzupelnienia === 2);
T('ta sama wymyślona liczba zgłaszana raz, nie przy każdym wystąpieniu',
  P.sprawdzTekst('Mediana 11 200 zł/m², a więc 11 200 zł/m² w całym zbiorze.', F).obce.filter(o => o.wartosc === 11200).length === 1);
T('pusty tekst nie udaje sprawdzonego', P.sprawdzTekst('', F).dlugosc === 0);

/* --- 6. Znacznik: program nie udaje, że to gotowy operat --- */
const zn = P.znacznik('2026-11-03');
T('znacznik mówi, że to projekt', /Projekt rozdziału/.test(zn));
T('znacznik mówi, kto to napisał', /model lokalny PER/.test(zn));
T('znacznik mówi, że wymaga zatwierdzenia', /Wymaga przejrzenia i zatwierdzenia/.test(zn));
T('znacznik wskazuje, kto odpowiada za treść', /odpowiada za treść osoba podpisująca operat/.test(zn));
T('znacznik niesie datę', zn.includes('2026-11-03'));

/* --- 7. Podsumowanie --- */
const pods = P.podsumowanie([
  { id: 'subject', tekst: 'coś', kontrola: { ok: true, doUzupelnienia: 0 } },
  { id: 'market', tekst: 'coś', kontrola: { ok: false, doUzupelnienia: 1 } },
  { id: 'result', tekst: '', kontrola: null },
]);
T('podsumowanie liczy napisane', pods.napisane === 2);
T('podsumowanie liczy nieudane', pods.nieudane === 1);
T('podsumowanie liczy rozdziały ze zgłoszeniami', pods.zeZgloszeniami === 1);
T('podsumowanie liczy miejsca do uzupełnienia', pods.doUzupelnienia === 1);
T('komunikat ostrzega o wartościach spoza danych', /nie podałeś/.test(pods.komunikat), pods.komunikat);
T('komunikat zawsze mówi, że to projekt do przeczytania', /To projekt operatu/.test(pods.komunikat));
const czysty = P.podsumowanie([{ id: 'subject', tekst: 'coś', kontrola: { ok: true, doUzupelnienia: 0 } }]);
T('gdy wszystko czyste, program to mówi wprost', /W żadnym nie ma liczby spoza danych/.test(czysty.komunikat));
T('bez napisanych rozdziałów program nie udaje sukcesu',
  /Nie udało się napisać/.test(P.podsumowanie([]).komunikat));

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

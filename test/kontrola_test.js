'use strict';
// Paczka zrodel trzyma program w app\\, repozytorium robocze w build\\app\\.
// Testy musza dzialac w obu ukladach, inaczej build na GitHubie wywala sie
// na samych testach, zanim w ogole dojdzie do instalatora.
const APP_DIR = (() => {
  const f = require('node:fs'), p = require('node:path');
  const a = p.join(__dirname, '..', 'build', 'app');
  return f.existsSync(a) ? a : p.join(__dirname, '..', 'app');
})();
// Kontrola operatu: czy nazywa po imieniu to, co zrobione dobrze, co budzi
// watpliwosc i co jest bledem — oraz czy niczego nie zmyśla.
const K = require(APP_DIR + '/renderer/kontrola.js');

let ok = 0, zle = 0;
const T = (n, w) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n); } };
const znajdz = (w, frag) => w.pozycje.find(x => x.tytul.includes(frag));
const stan = (w, frag) => znajdz(w, frag)?.stan || null;

console.log('Kontrola operatu\n');

/* --- operat zdrowy --- */
const dobry = {
  property: { usableArea: 54, kwArea: 54, basementArea: 0,
    roadAccess: 'bezposredni', usableAreaSource: 'akt' },
  author: { independence: true },
  building: { energyClass: 'C', energyEP: 112 },
  egib: { extractDate: '2026-03-10' },
  valuation: { purpose: 'zabezpieczenie wierzytelności', approachDescription: 'porównawcze, metoda korygowania ceny średniej',
    valuationDate: '2026-06-01', inspectionDate: '2026-05-20', legalStateDate: '2026-05-18', priceLevelDate: '2026-06-01' },
  legal: { kwLocal: 'GD1G/00012345/6', sectionIII: 'brak wpisów', sectionIV: 'hipoteka umowna' },
  market: { marketDescription: 'rynek lokalny Gdańska', weightJustification: 'analiza par',
    features: [{ name: 'lokalizacja', weight: 0.3 }, { name: 'standard', weight: 0.4 }, { name: 'kondygnacja', weight: 0.3 }],
    transactions: Array.from({ length: 12 }, (_, i) => ({
      address: `ul. Testowa ${i + 1}`, date: `2026-0${(i % 5) + 1}-10`, area: 50 + i, priceUnit: 9800 + i * 20 })) },
  legalBases: ['UGN', 'rozporządzenie'], sources: ['RCiWN'], clauses: 'klauzule', photos: [{ id: 1 }],
};
const calcDobry = { cmin: 9000, cmax: 11000, deltaC: 2000, weightSum: 1, unitRaw: 10000, valueRounded: 540000, unitAfterRound: 10000, sumUi: 120 };
const w = K.ocen(dobry, calcDobry, {}, { parowy: false });

T('powierzchnia przedmiotu zgłoszona jako zrobiona dobrze', stan(w, 'Powierzchnia przedmiotu') === 'ok');
T('cel wyceny zgłoszony jako zrobiony dobrze', stan(w, 'Cel wyceny') === 'ok');
T('kolejnosc ogledzin i daty wyceny sprawdzona', stan(w, 'Oględziny przed datą wyceny') === 'ok');
T('stan prawny na date nie pozniejsza niz wycena', stan(w, 'Stan prawny zbadany') === 'ok');
T('powierzchnia z ksiegi zgodna z lokalem', stan(w, 'Powierzchnia z księgi') === 'ok');
T('minimum transakcji spelnione', stan(w, 'spełnia wymagane minimum') === 'ok');
T('suma wag rowna 1 zgloszona jako poprawna', stan(w, 'Suma wag cech wynosi') === 'ok');
T('cena jednostkowa w przedziale rynkowym', stan(w, 'mieści się w przedziale') === 'ok');
T('wartosc rynkowa policzona', stan(w, 'Wartość rynkowa policzona') === 'ok');
T('zdrowy operat nie ma bledow', w.podsumowanie.bledy === 0 && w.podsumowanie.gotowyDoPDF === true);
T('gotowosc zdrowego operatu jest wysoka', w.podsumowanie.gotowosc >= 90);
T('kazda pozycja wskazuje krok, w ktorym sie ja naprawia',
  w.pozycje.every(x => typeof x.krok === 'string' && x.krok.length > 2));
T('aspekty maja wlasne liczniki', w.aspekty.length === 8 && w.aspekty.every(a => Number.isInteger(a.ok)));

/* --- bledy --- */
const zly = JSON.parse(JSON.stringify(dobry));
zly.valuation.inspectionDate = '2026-07-10';          // ogledziny po dacie wyceny
zly.valuation.legalStateDate = '2026-07-05';          // stan prawny po dacie wyceny
zly.market.transactions[0].date = '2026-12-01';       // transakcja po dacie wyceny
const w2 = K.ocen(zly, { ...calcDobry, weightSum: 0.9, unitRaw: 12000 }, {}, {});
T('ogledziny po dacie wyceny to blad', stan(w2, 'Oględziny po dacie wyceny') === 'blad');
T('badanie stanu prawnego po dacie wyceny to blad', stan(w2, 'Badanie stanu prawnego po dacie') === 'blad');
T('transakcja po dacie wyceny to blad', stan(w2, 'Transakcja po dacie wyceny') === 'blad');
T('suma wag rozna od 1 to blad', stan(w2, 'Suma wag cech różna') === 'blad');
T('wynik poza przedzialem Cmin-Cmax to blad', stan(w2, 'poza przedziałem') === 'blad');
T('blad blokuje PDF', w2.podsumowanie.gotowyDoPDF === false && w2.podsumowanie.bledy >= 5);
T('blad mowi, co konkretnie jest nie tak',
  /2026-07-10/.test(znajdz(w2, 'Oględziny po dacie wyceny').szczegol) &&
  /12 000|12000/.test(znajdz(w2, 'poza przedziałem').szczegol.replace(/ /g, ' ')));

/* --- uwagi, ktore nie blokuja --- */
const uw = JSON.parse(JSON.stringify(dobry));
uw.valuation.inspectionDate = '2025-09-01';            // ponad pol roku przed wycena
uw.valuation.priceLevelDate = '2026-05-01';            // inny poziom cen
uw.market.features = [{ name: 'lokalizacja', weight: 0.7 }, { name: 'standard', weight: 0.3 }];
uw.photos = [];
const w3 = K.ocen(uw, { ...calcDobry, cmin: 4000, cmax: 12000 }, {}, {});
T('stare ogledziny to uwaga, nie blad', stan(w3, 'Oględziny sprzed ponad pół roku') === 'uwaga');
T('inny poziom cen to uwaga', stan(w3, 'Data poziomu cen inna') === 'uwaga');
T('cecha wazaca ponad polowe to uwaga', stan(w3, 'waży ponad połowę') === 'uwaga');
T('bardzo szeroki przedzial cen to uwaga', stan(w3, 'szeroki przedział cen') === 'uwaga');
T('brak zdjec to uwaga, nie blad', stan(w3, 'Brak zdjęć') === 'uwaga');
T('same uwagi nie blokuja PDF', w3.podsumowanie.gotowyDoPDF === true && w3.podsumowanie.uwagi >= 5);
T('uwaga tlumaczy, dlaczego to wazne',
  znajdz(w3, 'waży ponad połowę').szczegol.length > 40 &&
  /wykazane/.test(znajdz(w3, 'waży ponad połowę').szczegol));

/* --- braki z kreatora --- */
const w4 = K.ocen(dobry, calcDobry, { legal: ['numer księgi wieczystej'], market: ['charakterystyka rynku lokalnego'] }, {});
T('braki z kreatora trafiaja do wlasciwych aspektow',
  w4.aspekty.find(a => a.kod === 'prawny').bledy >= 1 && w4.aspekty.find(a => a.kod === 'rynek').bledy >= 1);
T('brak z kreatora nazywa sie tym, czego brakuje, a nie slowem „brak”',
  w4.pozycje.some(x => x.tytul === 'Numer księgi wieczystej') &&
  !w4.pozycje.some(x => x.tytul === 'Brak wymaganej danej'));
T('przy braku stoi, dlaczego blokuje',
  /nie wygeneruje PDF/.test(w4.pozycje.find(x => x.tytul === 'Numer księgi wieczystej').szczegol));
T('w aspekcie najpierw bledy, potem uwagi, na koncu zrobione',
  w4.aspekty.every(a => {
    const w = { blad: 0, uwaga: 1, ok: 2 };
    return a.pozycje.every((x, i, t) => i === 0 || w[t[i - 1].stan] <= w[x.stan]);
  }));

/* --- pusty operat --- */
const w5 = K.ocen({}, {}, {}, {});
T('pusty operat nie wywraca kontroli', Array.isArray(w5.pozycje) && w5.aspekty.length === 8);
T('pusty operat nie udaje gotowego', w5.podsumowanie.gotowosc < 60);
T('kontrola niczego nie zmysla przy braku danych',
  !w5.pozycje.some(x => x.stan === 'ok' && /Wartość rynkowa|przedziale rynkowym/.test(x.tytul)));

/* --- odwrocony przedzial --- */
const w6 = K.ocen(dobry, { ...calcDobry, cmin: 11000, cmax: 9000 }, {}, {});
T('Cmax mniejsze od Cmin to blad', stan(w6, 'Cmax mniejsze od Cmin') === 'blad');

/* --- zaokraglenie --- */
const w7 = K.ocen(dobry, { ...calcDobry, unitRaw: 10000, unitAfterRound: 10500 }, {}, {});
T('zaokraglenie zmieniajace wynik o ponad 2% to uwaga', stan(w7, 'Zaokrąglenie zmienia wynik') === 'uwaga');


/* --- 1.18.0: wymagania weryfikatora operatu --- */
{
  const bezDrogi = JSON.parse(JSON.stringify(dobry));
  bezDrogi.property.roadAccess = '';
  const r = K.ocen(bezDrogi, calcDobry, {}, { parowy: false });
  T('brak dostepu do drogi to uwaga',
    r.pozycje.some(x => x.stan === 'uwaga' && /drogi publicznej/i.test(x.tytul)));

  const bezZrodlaPow = JSON.parse(JSON.stringify(dobry));
  bezZrodlaPow.property.usableAreaSource = '';
  T('powierzchnia bez zrodla to uwaga',
    K.ocen(bezZrodlaPow, calcDobry, {}, {}).pozycje.some(x => /bez wskazanego źródła/i.test(x.tytul)));

  const staryWypis = JSON.parse(JSON.stringify(dobry));
  staryWypis.egib.extractDate = '2025-01-02';
  T('wypis EGiB starszy niz pol roku to uwaga',
    K.ocen(staryWypis, calcDobry, {}, {}).pozycje.some(x => /EGiB starszy/i.test(x.tytul)));

  const bezOswiadczenia = JSON.parse(JSON.stringify(dobry));
  bezOswiadczenia.author.independence = false;
  T('operat bankowy bez oswiadczenia o niezaleznosci to blad',
    K.ocen(bezOswiadczenia, calcDobry, {}, {}).pozycje.some(x => x.stan === 'blad' && /konflikt/i.test(x.tytul)));

  const ulomnaBaza = JSON.parse(JSON.stringify(dobry));
  ulomnaBaza.market.transactions[0].date = '';
  ulomnaBaza.market.transactions[1].area = null;
  T('niekompletna baza transakcji to blad',
    K.ocen(ulomnaBaza, calcDobry, {}, {}).pozycje.some(x => x.stan === 'blad' && /Baza transakcji/i.test(x.tytul)));

  const bezCeny = JSON.parse(JSON.stringify(dobry));
  T('cena jednostkowa wystarczy — nie wymagamy ceny calkowitej',
    !K.ocen(bezCeny, calcDobry, {}, {}).pozycje.some(x => /bez ceny/i.test(x.szczegol || '')));
}

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

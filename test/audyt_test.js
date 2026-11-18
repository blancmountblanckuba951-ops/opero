'use strict';
/**
 * OPERO — AUDYT OPERATU PRZED PODPISEM
 *
 * Kontrola przed PDF pilnuje BRAKOW. Audyt pilnuje SPOJNOSCI: czy liczby
 * w tekscie zgadzaja sie z tabelami, czy wagi sumuja sie do jednosci, czy
 * daty ukladaja sie sensownie, czy kazda transakcja ma zrodlo i czy wynik
 * ma uzasadnienie. To sa pytania weryfikatora, a nie generatora PDF.
 */
const A = require('../build/app/renderer/audyt.js');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
const ma = (wynik, fragment) => wynik.pozycje.some(x => new RegExp(fragment, 'i').test(x.tytul + ' ' + x.szczegol));
const stan = (wynik, fragment) => (wynik.pozycje.find(x => new RegExp(fragment, 'i').test(x.tytul)) || {}).stan;

/* Operat kompletny — punkt odniesienia dla wszystkich prob nizej. */
function dobryOperat() {
  return {
    valuation: {
      valuationDate: '2026-10-01', reportDate: '2026-10-10',
      inspectionDate: '2026-09-20', priceLevelDate: '2026-10-01',
      purpose: 'sprzedaż', approachDescription: 'podejście porównawcze, metoda korygowania ceny średniej',
      resultJustification: 'Wynik wyprowadzono z ceny średniej skorygowanej ocenami cech.',
    },
    legal: { kwNumber: 'GD1G/00012345/6' },
    property: { city: 'Gdańsk', street: 'Siedleckiego', usableArea: 68, kwArea: 68, rightType: 'własność',
      technicalCondition: 'Budynek po remoncie, instalacje wymienione.' },
    market: {
      marketDescription: 'Rynek lokali w Osowej, 24 miesiące, 18 transakcji.',
      weightMethod: 'pairs',
      trendJustification: 'Trend z analizy par z badanego zbioru.',
      features: [
        { id: 1, name: 'Lokalizacja', weight: 0.4, ratingNote: 'Osiedle o dobrej opinii.' },
        { id: 2, name: 'Standard', weight: 0.6, ratingNote: 'Po remoncie w 2024 r.' },
      ],
      transactions: [
        { id: 1, address: 'Siedleckiego 9', date: '2026-08-10', area: 66, priceUnit: 10454,
          zrodlo: { wiersz: 1 }, featureRatings: { 1: 'Korzystna', 2: 'Przeciętna' } },
        { id: 2, address: 'Barniewicka 12', date: '2026-07-10', area: 70, priceUnit: 10285,
          zrodlo: { wiersz: 2 }, featureRatings: { 1: 'Przeciętna', 2: 'Przeciętna' } },
        { id: 3, address: 'Kielnieńska 8', date: '2026-05-01', area: 72, priceUnit: 10100,
          zrodlo: { wiersz: 3 }, featureRatings: { 1: 'Przeciętna', 2: 'Korzystna' } },
      ],
    },
    narratives: { result: 'Wartość 700 000 zł wynika z ceny średniej 10 280 zł/m².', market: 'Opis rynku w Gdańsku.' },
    files: [{ nazwa: 'Wypis z rejestru gruntów' }],
    photos: [{ nazwa: 'Zdjęcie elewacji' }],
  };
}
const CALC = { valueRounded: 700000, value: 699200, cavg: 10280, unitAfterRound: 10294, trendMode: 'pairs' };

console.log('\n--- 1. Operat kompletny przechodzi audyt ---');
const dobry = A.audyt(dobryOperat(), CALC);
T('kompletny operat nie ma błędów', dobry.podsumowanie.bledy === 0,
  dobry.pozycje.filter(x => x.stan === 'blad').map(x => x.tytul));
T('i nadaje się do podpisu', dobry.podsumowanie.doPodpisu === true);
T('audyt ma osiem działów', dobry.dzialy.length === 8, dobry.dzialy.length);
T('każdy dział coś sprawdził', dobry.dzialy.every(d => d.pozycje.length > 0),
  dobry.dzialy.filter(d => !d.pozycje.length).map(d => d.nazwa));
T('a decyzję o podpisie zostawia człowiekowi',
  /Decyzję o podpisie podejmujesz Ty/.test(dobry.podsumowanie.tekst), dobry.podsumowanie.tekst);

console.log('\n--- 2. Daty ---');
let p = dobryOperat(); p.valuation.inspectionDate = '2026-10-20';
T('oględziny po dacie wyceny to błąd', stan(A.audyt(p, CALC), 'Oględziny po dacie wyceny') === 'blad');
p = dobryOperat(); p.valuation.reportDate = '2026-09-01';
T('operat sporządzony przed datą wyceny to błąd',
  stan(A.audyt(p, CALC), 'sporządzony przed datą wyceny') === 'blad');
p = dobryOperat(); p.valuation.reportDate = '2028-01-01';
T('ponad rok od daty wyceny to uwaga o aktualności',
  ma(A.audyt(p, CALC), 'potwierdzeniu aktualności'));
p = dobryOperat(); delete p.valuation.priceLevelDate;
T('brak którejkolwiek z czterech dat to błąd', stan(A.audyt(p, CALC), 'Brakuje daty') === 'blad');
p = dobryOperat(); delete p.legal;
T('brak księgi wieczystej to uwaga, a nie błąd',
  stan(A.audyt(p, CALC), 'księgi wieczystej') === 'uwaga');

console.log('\n--- 3. Opis nieruchomosci ---');
p = dobryOperat(); p.property.kwArea = 80;
T('rozbieżność powierzchni z KW jest wyłapana',
  ma(A.audyt(p, CALC), 'różni się od powierzchni z księgi'));
p = dobryOperat(); delete p.property.rightType;
T('brak rodzaju prawa to błąd identyfikacji', stan(A.audyt(p, CALC), 'niepełny') === 'blad');

console.log('\n--- 4. Tabela transakcyjna ---');
p = dobryOperat(); p.market.transactions = [];
T('pusta tabela to błąd', stan(A.audyt(p, CALC), 'pusta') === 'blad');
p = dobryOperat(); delete p.market.transactions[1].date;
T('wiersz bez daty jest wyłapany', ma(A.audyt(p, CALC), 'bez daty'));
p = dobryOperat(); delete p.market.transactions[1].zrodlo;
T('wiersz bez źródła to uwaga', ma(A.audyt(p, CALC), 'bez wskazanego źródła'));
p = dobryOperat(); p.market.transactions[2].featureRatings = {};
T('luki w macierzy ocen to błąd', ma(A.audyt(p, CALC), 'brakuje 2 ocen'));
p = dobryOperat();
p.market.transactions.push({ ...p.market.transactions[0], id: 9 });
T('powtórzona transakcja jest wyłapana — zawyża wagę w średniej',
  ma(A.audyt(p, CALC), 'powtarza się'));

console.log('\n--- 5. Arkusz obliczen ---');
p = dobryOperat(); p.market.features[0].weight = 0.5;
T('wagi niesumujące się do 100% to błąd', ma(A.audyt(p, CALC), 'sumują się do 110'));
p = dobryOperat(); p.market.features[0].weight = 0;
T('cecha z wagą zero to uwaga', ma(A.audyt(p, CALC), 'wagę zero'));
p = dobryOperat(); delete p.market.features[0].ratingNote;
T('ocena bez uzasadnienia to uwaga', ma(A.audyt(p, CALC), 'bez uzasadnienia'));
p = dobryOperat(); p.market.weightMethod = 'manual';
T('wagi bez wskazanej metody wyprowadzenia to uwaga',
  ma(A.audyt(p, CALC), 'bez wskazania metody'));
T('zaokrąglenie zmieniające wynik o ponad 5% jest wyłapane',
  ma(A.audyt(dobryOperat(), { ...CALC, value: 600000 }), 'Zaokrąglenie zmienia wynik'));
T('cena jednostkowa daleko od średniej jest wyłapana',
  ma(A.audyt(dobryOperat(), { ...CALC, unitAfterRound: 20000 }), 'odbiega od średniej'));

console.log('\n--- 6. Wynik ---');
T('brak wyniku to błąd', stan(A.audyt(dobryOperat(), {}), 'Brak wyniku') === 'blad');
p = dobryOperat(); p.narratives = {}; delete p.valuation.resultJustification;
T('wynik bez uzasadnienia to błąd', stan(A.audyt(p, CALC), 'bez uzasadnienia') === 'blad');

console.log('\n--- 7. Zgodnosc tekstu z tabelami ---');
p = dobryOperat();
p.narratives.result = 'Wartość 912 500 zł przy cenie 13 400 zł/m².';
const obce = A.audyt(p, CALC);
T('liczba z tekstu bez pokrycia w danych jest wyłapana',
  ma(obce, 'nie ma pokrycia') || ma(obce, 'nie mają pokrycia'), obce.pozycje.filter(x => x.dzial === 'tekst').map(x => x.tytul));
T('a liczby zgodne z tabelami nie są zgłaszane',
  !ma(A.audyt(dobryOperat(), CALC), 'pokrycia w danych operatu') ||
  stan(A.audyt(dobryOperat(), CALC), 'mają pokrycie') === 'ok');
p = dobryOperat();
p.narratives.market = 'Tutaj [DO UZUPEŁNIENIA — opis rynku].';
T('znacznik [DO UZUPEŁNIENIA] blokuje podpis',
  stan(A.audyt(p, CALC), 'DO UZUPEŁNIENIA') === 'blad');
p = dobryOperat();
p.narratives.market = 'Rynek lokali w Sopocie, 24 miesiące.';
p.narratives.result = 'Wartość 700 000 zł.';
T('tekst o innej miejscowości niż tabele to uwaga — ślad po poprzednim operacie',
  ma(A.audyt(p, CALC), 'nie pada nazwa miejscowości'));

T('z tekstu wyciągane są liczby znaczące, a nie numery paragrafów',
  A.liczbyZTekstu('art. 175 ust. 2, cena 10 280 zł/m², pow. 68,50 m²')
    .join('|') === '175|10280|68.5', A.liczbyZTekstu('art. 175 ust. 2, cena 10 280 zł/m², pow. 68,50 m²'));

console.log('\n--- 8. Zalaczniki ---');
p = dobryOperat(); p.files = []; p.photos = [];
T('brak załączników to uwaga z wyjaśnieniem', ma(A.audyt(p, CALC), 'Zwykle dołącza się'));

console.log('\n--- 9. Polecenie dla PER ---');
const polecenie = A.polecenieDlaPER(A.audyt(dobryOperat(), { ...CALC, valueRounded: 0 }), dobryOperat());
T('PER dostaje rolę weryfikatora, który nie zna wyniku',
  /nie zna oczekiwanego wyniku/.test(polecenie.zadanie));
T('i zakaz dopisywania czegokolwiek do operatu',
  /niczego nie dopisuj/.test(polecenie.zadanie));
T('w kontekście dostaje to, co znalazły reguły',
  /BŁĄD/.test(polecenie.kontekst), polecenie.kontekst.slice(0, 120));

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

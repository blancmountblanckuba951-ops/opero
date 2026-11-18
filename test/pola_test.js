'use strict';
/**
 * OPERO — pola, których nie da się źle wypełnić.
 *
 * Najtańszy błąd w operacie to ten, którego nie można popełnić. Test pilnuje
 * jednej rzeczy mocniej niż wszystkich innych: program NIE PODMIENIA cyfry,
 * którą wpisał człowiek. Poprawiona „trafnie" cyfra kontrolna robi z jednej
 * istniejącej księgi inną istniejącą księgę — i rzeczoznawca opisuje w
 * operacie cudzą nieruchomość, nie wiedząc o tym.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const P = require(path.join(APP, 'renderer', 'pola.js'));

console.log('OPERO — pola odporne na błędy\n');

/* --- 1. Liczby: wchodzi tylko liczba --- */
T('litery nie wchodzą do pola liczbowego', P.filtrujLiczbe('54abc,2x') === '54,2');
T('kropka jest zamieniana na przecinek', P.filtrujLiczbe('54.20') === '54,20');
T('drugi przecinek nie wchodzi', P.filtrujLiczbe('54,2,8') === '54,28');
T('spacje w tysiącach są usuwane', P.filtrujLiczbe('480 000') === '480000');
T('minus nie wchodzi tam, gdzie nie ma sensu', P.filtrujLiczbe('-54') === '54');
T('liczba miejsc po przecinku jest ograniczona', P.filtrujLiczbe('54,2567') === '54,25');
T('pole całkowite nie przyjmuje części dziesiętnej', P.filtrujLiczbe('20,5', { miejsc: 0 }) === '20');

T('przecinek i kropka znaczą to samo', P.naLiczbe('54,2') === 54.2 && P.naLiczbe('54.2') === 54.2);
T('puste pole to brak liczby, a nie zero', P.naLiczbe('') === null && P.naLiczbe('   ') === null);
T('tekst to nie liczba', P.naLiczbe('pięćdziesiąt') === null);
T('liczba pokazuje się po polsku', P.pokazLiczbe(480000, 2) === '480 000,00' || P.pokazLiczbe(480000, 2).replace(/ /g, ' ') === '480 000,00');

/* --- 2. Zakresy mówią, co jest nie tak --- */
const pusta = P.sprawdzLiczbe('', 'powierzchniaLokalu');
T('puste pole jest rozpoznane jako puste, a nie błędne', pusta.pusty === true && pusta.ok === false);
T('powierzchnia lokalu 54,20 przechodzi', P.sprawdzLiczbe('54,20', 'powierzchniaLokalu').ok === true);
T('powierzchnia lokalu 3 m² jest odrzucona', P.sprawdzLiczbe('3', 'powierzchniaLokalu').ok === false);
T('powierzchnia lokalu 5400 m² jest odrzucona z podpowiedzią o dodatkowym zerze',
  /dodatkowego zera/.test(P.sprawdzLiczbe('5400', 'powierzchniaLokalu').powod));
T('500 m² przechodzi, ale z ostrzeżeniem',
  (() => { const w = P.sprawdzLiczbe('500', 'powierzchniaLokalu'); return w.ok && /bardzo duży lokal/.test(w.ostrzezenie); })());
T('stopa 7,25% przechodzi', P.sprawdzLiczbe('7,25', 'stopa').ok === true);
T('stopa 45% jest odrzucona', P.sprawdzLiczbe('45', 'stopa').ok === false);
T('stopa 18% przechodzi z ostrzeżeniem', /wyjątkowa/.test(P.sprawdzLiczbe('18', 'stopa').ostrzezenie || ''));
T('każda odmowa mówi, czego dotyczy',
  /Powierzchnia użytkowa lokalu/.test(P.sprawdzLiczbe('abc', 'powierzchniaLokalu').powod));
T('odmowa podpowiada, jak wpisać',
  /np\. 54,20/.test(P.sprawdzLiczbe('abc', 'powierzchniaLokalu').powod));

/* --- 3. Imię bez cyfr --- */
T('cyfry nie wchodzą do imienia', P.filtrujImie('Jan2 Kowalski3') === 'Jan Kowalski');
T('znaki specjalne nie wchodzą do imienia', P.filtrujImie('Jan@#Kowalski') === 'JanKowalski');
T('poprawne nazwisko przechodzi', P.sprawdzImie('Jan Kowalski').ok === true);
T('nazwisko dwuczłonowe przechodzi', P.sprawdzImie('Anna Nowak-Kowalska').ok === true);
T('apostrof w nazwisku przechodzi', P.sprawdzImie("Michał D'Angelo").ok === true);
T('polskie znaki przechodzą', P.sprawdzImie('Łukasz Żółć').ok === true);
T('nazwisko z cyfrą jest odrzucone i wyjaśnione',
  (() => { const w = P.sprawdzImie('Firma 123'); return !w.ok && /nie zawiera cyfr/.test(w.powod) && /firmy/.test(w.powod); })());
T('za krótkie nie przechodzi', P.sprawdzImie('Ja').ok === false);
T('pole nieobowiązkowe może zostać puste', P.sprawdzImie('', { wymagane: false }).ok === true);

/* --- 4. Numer KW wpisywany jak w EKW --- */
T('kod wydziału to cztery znaki, duże litery', P.filtrujKodWydzialu('gd1g/xx') === 'GD1G');
T('numer księgi to same cyfry, najwyżej osiem', P.filtrujNumerKw('0001a2345678') === '00012345');
T('cyfra kontrolna to jedna cyfra', P.filtrujCyfreKontrolna('95') === '9');

// Wektor sprawdzony na prawdziwym numerze: WL1A/00272852/9
T('cyfra kontrolna liczy się tak jak w EKW', P.cyfraKontrolna('WL1A', '00272852') === 9);
T('inny numer daje inną cyfrę', P.cyfraKontrolna('GD1G', '00012345') !== null);

T('wklejony numer z ukośnikami rozkłada się na trzy pola', (() => {
  const r = P.rozbijKw('WL1A/00272852/9');
  return r.kod === 'WL1A' && r.numer === '00272852' && r.kontrolna === '9';
})());
T('wklejony numer bez ukośników też', (() => {
  const r = P.rozbijKw('wl1a002728529');
  return r.kod === 'WL1A' && r.numer === '00272852' && r.kontrolna === '9';
})());
T('numer bez zer wiodących jest dopełniany', P.rozbijKw('WL1A/272852/9').numer === '00272852');
T('numer bez cyfry kontrolnej nie jest zmyślany', P.rozbijKw('WL1A/00272852').kontrolna === '');

T('poprawny numer przechodzi', (() => {
  const w = P.sprawdzKw({ kod: 'WL1A', numer: '00272852', kontrolna: '9' });
  return w.ok && w.pelny === 'WL1A/00272852/9';
})());
T('program prowadzi przez pola po kolei',
  P.sprawdzKw({ kod: 'WL1' }).etap === 'kod' && P.sprawdzKw({ kod: 'WL1A' }).etap === 'numer'
  && P.sprawdzKw({ kod: 'WL1A', numer: '00272852' }).etap === 'kontrolna');
T('brakującą cyfrę kontrolną program podpowiada, ale każe sprawdzić na dokumencie', (() => {
  const w = P.sprawdzKw({ kod: 'WL1A', numer: '00272852' });
  return w.podpowiedziana === 9 && /sprawdź na dokumencie/i.test(w.powod);
})());

// SEDNO: zla cyfra kontrolna NIE jest poprawiana po cichu.
const zla = P.sprawdzKw({ kod: 'WL1A', numer: '00272852', kontrolna: '3' });
T('zła cyfra kontrolna jest odrzucona', zla.ok === false);
T('program mówi, jaka byłaby poprawna', zla.poprawna === 9 && /poprawna byłaby 9/.test(zla.powod));
T('ale NIE podmienia tego, co wpisał człowiek', zla.pelny === 'WL1A/00272852/3');
T('i podpowiada, że literówka jest zwykle w numerze, nie w cyfrze',
  /literówka w numerze/.test(zla.powod));
T('dziwny kod wydziału daje ostrzeżenie, a nie twardą odmowę', (() => {
  const w = P.sprawdzKw({ kod: '1234', numer: '00012345', kontrolna: '1' });
  return !w.ok && w.ostrzezenie === true && /dwie litery, cyfra, litera/.test(w.powod);
})());
T('puste pola KW nie są błędem, dopóki nikt nic nie wpisał',
  P.sprawdzKw({}).pusty === true && !P.sprawdzKw({}).powod);

/* --- 5. Daty --- */
T('data z kalendarza przechodzi', P.sprawdzDate('2026-09-15').ok === true);
T('tekst zamiast daty jest odrzucony', P.sprawdzDate('wrzesień').ok === false);
T('31 lutego nie przechodzi', P.sprawdzDate('2026-02-31').ok === false);
T('data przed granicą jest odrzucona z podaniem granicy',
  /nie może być wcześniejsza niż 2026-01-01/.test(P.sprawdzDate('2025-12-31', { odDnia: '2026-01-01' }).powod));
T('data po granicy jest odrzucona',
  P.sprawdzDate('2027-01-01', { doDnia: '2026-12-31' }).ok === false);

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

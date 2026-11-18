'use strict';
/**
 * OPERO — jedna rubryka na adres.
 *
 * Najgroźniejszy błąd, jaki ten moduł mógłby popełnić, nie jest widoczny
 * w operacie: podstawienie numeru albo miejscowości, która wygląda dobrze.
 * „Długa 1" i „Długa 12" to dwie różne nieruchomości; „Kartuska" jest
 * w kilkunastu miastach. Dlatego test sprawdza nie tylko to, czy program
 * trafia, ale przede wszystkim to, czy UMIE SIĘ WSTRZYMAĆ I SPYTAĆ.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const A = require(path.join(APP, 'renderer', 'adres-jedno.js'));

console.log('OPERO — jedna rubryka na adres\n');

/* --- 1. Rozbiór tego, co człowiek wpisał --- */
const r = t => A.rozbij(t);
T('sama ulica', (() => { const x = r('Kartuska'); return x.ulica === 'Kartuska' && !x.numer; })());
T('przedrostek „ul." nie wchodzi do nazwy', r('ul. Kartuska').ulica === 'Kartuska');
T('„al." też nie', r('al. Grunwaldzka').ulica === 'Grunwaldzka');
T('„pl." też nie', r('pl. Zbawiciela').ulica === 'Zbawiciela');
T('ulica i numer', (() => { const x = r('ul. Kartuska 201'); return x.ulica === 'Kartuska' && x.numer === '201'; })());
T('numer z literą', r('Kamień Duży 1C').numer === '1C');
T('numer z ukośnikiem', r('Grunwaldzka 12/3').numer === '12/3');
T('numer z mieszkaniem zostaje jednym numerem', (() => { const x = r('Długa 1 m 5'); return x.ulica === 'Długa' && x.numer === '1 m 5'; })());
T('pełny adres z kodem i miastem', (() => {
  const x = r('Kartuska 201, 80-125 Gdańsk');
  return x.ulica === 'Kartuska' && x.numer === '201' && x.kod === '80-125' && x.miasto === 'Gdańsk';
})());
T('miasto z przodu też się czyta', (() => { const x = r('Gdańsk, Kartuska 201'); return x.miasto === 'Gdańsk' && x.ulica === 'Kartuska'; })());
T('kod stoi przed miastem, więc miasto to „Gdańsk", nie „Kartuska"', (() => {
  const x = r('80-125 Gdańsk, Kartuska');
  return x.miasto === 'Gdańsk' && x.ulica === 'Kartuska';
})(), JSON.stringify(r('80-125 Gdańsk, Kartuska')));
T('ulica z cyfrą w nazwie nie traci nazwy', (() => { const x = r('12 Lutego 5'); return x.ulica === '12 Lutego' && x.numer === '5'; })());
T('ulica zaczynająca się od cyfry bez numeru zostaje całością', r('12 Lutego').ulica === '12 Lutego');
T('pusty wpis nie daje śmieci', (() => { const x = r('   '); return !x.ulica && !x.numer && !x.miasto; })());
T('nadmiar spacji nie przeszkadza', r('  ul.   Kartuska    201  ').numer === '201');
T('wpisane zostaje zapamiętane w całości', r('ul. Kartuska 201').surowe === 'ul. Kartuska 201');
/* Bez przecinka „Kartuska 201 Gdańsk" jest NIEROZSTRZYGALNE tekstem: tak samo
   wygląda „Kamień Duży 1C", gdzie przód to miejscowość. Program nie zgaduje —
   oddaje całość usłudze geokodowania, która to rozstrzyga rejestrem. */
T('bez przecinka program nie zgaduje, co jest miastem', r('Kartuska 201 Gdańsk').miasto === '');

/* --- 2. Numer i kod --- */
T('„201" to numer', A.czyNumer('201'));
T('„1C" to numer', A.czyNumer('1C'));
T('„12/3" to numer', A.czyNumer('12/3'));
T('„Nowa" to nie numer', !A.czyNumer('Nowa'));
T('pusty tekst to nie numer', !A.czyNumer(''));
T('„80-125" to kod pocztowy', A.czyKod('80-125'));
T('„80125" to nie kod', !A.czyKod('80125'));

/* --- 3. Zapytanie do usługi --- */
T('za krótka nazwa nie idzie do usługi', A.zapytanie({ ulica: 'Ka' }) === null);
T('trzy znaki wystarczą', A.zapytanie({ ulica: 'Kar' }) !== null);
const u = A.zapytanie({ ulica: 'ul. Kartuska', numer: '201', miasto: 'Gdańsk' });
T('zapytanie idzie do państwowej usługi geokodowania', u.startsWith('https://services.gugik.gov.pl/uug/'));
T('zapytanie niesie miasto, ulicę i numer', /Gda%C5%84sk%2C%20Kartuska%20201/.test(u) || /Gda%C5%84sk,\+Kartuska\+201/.test(u), u);
T('przedrostek nie idzie do usługi', !/ul\./.test(decodeURIComponent(u)));
T('bez numeru zapytanie też się składa', /Kartuska$/.test(decodeURIComponent(A.zapytanie({ ulica: 'Kartuska' }))));

/* --- 4. Czytanie odpowiedzi --- */
const ODP = {
  results: {
    1: { city: 'Gdańsk', street: 'Kartuska', number: '201', district: 'Siedlce', code: '80-125', commune: 'Gdańsk', county: 'Gdańsk', voivodeship: 'POMORSKIE', x: 472000, y: 720000 },
    2: { city: 'Gdańsk', street: 'ul. Kartuska', number: '202', district: 'Siedlce', code: '80-125', commune: 'Gdańsk', county: 'Gdańsk', voivodeship: 'POMORSKIE' },
    3: { city: 'Kartuzy', street: 'Kartuska', number: '201', code: '83-300', commune: 'Kartuzy', county: 'kartuski', voivodeship: 'POMORSKIE' },
  },
};
const k = A.zOdpowiedzi(ODP);
T('odpowiedź w postaci obiektu z kluczami „1","2" też się czyta', k.length === 3);
T('tekst JSON też', A.zOdpowiedzi(JSON.stringify(ODP)).length === 3);
T('bzdura nie wywraca programu', A.zOdpowiedzi('nie json').length === 0);
T('dzielnica przeczytana', k[0].dzielnica === 'Siedlce');
T('gmina, powiat i województwo przeczytane', k[0].gmina === 'Gdańsk' && k[0].powiat === 'Gdańsk' && k[0].wojewodztwo === 'POMORSKIE');
T('kod pocztowy przeczytany', k[0].kod === '80-125');
T('współrzędne przeczytane', k[0].x === 472000 && k[0].y === 720000);
T('przedrostek z odpowiedzi usługi też jest ucinany', k[1].ulica === 'Kartuska');

/* --- 5. Numer MUSI się zgadzać co do znaku --- */
T('ten sam numer pasuje', A.pasujeNumer({ numer: '201' }, '201'));
T('„1" NIE pasuje do „12"', !A.pasujeNumer({ numer: '12' }, '1'));
T('„12" NIE pasuje do „1"', !A.pasujeNumer({ numer: '1' }, '12'));
T('wielkość litery w numerze nie ma znaczenia', A.pasujeNumer({ numer: '1c' }, '1C'));
T('spacja w numerze nie ma znaczenia', A.pasujeNumer({ numer: '12 / 3' }, '12/3'));
T('bez podanego numeru wszystko pasuje', A.pasujeNumer({ numer: '7' }, ''));

/* --- 6. Jedna ulica w kilku miastach to PYTANIE --- */
const wiele = A.rozstrzygnij(k, { ulica: 'Kartuska', numer: '201' });
T('dwa miasta to stan „wybor"', wiele.stan === 'wybor', wiele.stan);
T('program NIE wybiera za człowieka', wiele.wybrane === null);
T('pytanie wymienia miejsca', /Gdańsk/.test(wiele.pytanie) && /Kartuzy/.test(wiele.pytanie));
T('pytanie mówi, czym grozi zły wybór', /obca miejscowość/.test(wiele.pytanie));
T('miejsca są policzone', wiele.miejsca.length === 2);
T('miejsce z większą liczbą punktów adresowych jest pierwsze', wiele.miejsca[0].miasto === 'Gdańsk');
T('opis miejsca niesie dzielnicę i województwo',
  /dzielnica Siedlce/.test(A.opisMiejsca(wiele.miejsca[0])) && /woj\. pomorskie/.test(A.opisMiejsca(wiele.miejsca[0])),
  A.opisMiejsca(wiele.miejsca[0]));

/* --- 7. Jedno miejsce — program wypełnia i mówi, co wypełnił --- */
const jedno = A.rozstrzygnij(k.filter(x => x.miasto === 'Gdańsk'), { ulica: 'Kartuska', numer: '201' });
T('jedno miasto to stan „jedno"', jedno.stan === 'jedno');
T('wybrany jest punkt o DOKŁADNIE tym numerze', jedno.wybrane.numer === '201');
T('wybrany punkt niesie dzielnicę', jedno.wybrane.dzielnica === 'Siedlce');
const kom = A.komunikat(jedno, { numer: '201' });
T('komunikat mówi, co znalazł', /Gdańsk/.test(kom) && /Siedlce/.test(kom));
T('komunikat mówi, że numer jest w rejestrze', /Numer 201 jest w rejestrze/.test(kom), kom);
T('komunikat prosi o sprawdzenie dopisanych pól', /sprawdź/i.test(kom));

/* --- 8. Numeru nie ma w rejestrze — program tego nie ukrywa --- */
const zlyNumer = A.rozstrzygnij(k.filter(x => x.miasto === 'Gdańsk'), { ulica: 'Kartuska', numer: '999' });
T('ulica znaleziona, więc stan to „jedno"', zlyNumer.stan === 'jedno');
T('ale program mówi wprost, że numeru nie ma', zlyNumer.numerNieZnaleziony === true);
T('i ostrzega, dlaczego go nie podmieni', /inny numer to inna nieruchomość/.test(zlyNumer.pytanie), zlyNumer.pytanie);
T('program NIE podstawia numeru z rejestru w miejsce podanego', zlyNumer.wybrane.numer !== '999' ? true : false);
T('ostrzeżenie trafia też do komunikatu', /numeru 999 w rejestrze pod nią nie ma/.test(A.komunikat(zlyNumer, { numer: '999' })),
  A.komunikat(zlyNumer, { numer: '999' }));

/* --- 9. Nic nie znaleziono --- */
const brak = A.rozstrzygnij([], { ulica: 'Niemazachtakiej' });
T('brak wyniku to stan „brak"', brak.stan === 'brak');
T('program nie udaje, że coś ma', brak.wybrane === null && brak.miejsca.length === 0);
T('i mówi, co z tym zrobić', /wpisz miejscowość i ulicę osobno/.test(brak.pytanie), brak.pytanie);
T('bez ulicy program prosi o ulicę', /Wpisz nazwę ulicy/.test(A.rozstrzygnij([], {}).pytanie));

/* --- 10. Adres do operatu --- */
const pelny = A.pelny({ ulica: 'Kartuska', numer: '201', kod: '80-125', miasto: 'Gdańsk', dzielnica: 'Siedlce' });
T('adres do operatu jest w polskiej postaci', pelny === 'ul. Kartuska 201, 80-125 Gdańsk, dzielnica Siedlce', pelny);
T('dzielnica równa miastu nie jest dopisywana',
  A.pelny({ ulica: 'Długa', numer: '1', miasto: 'Kartuzy', dzielnica: 'Kartuzy' }) === 'ul. Długa 1, Kartuzy');
T('brakujące części nie zostawiają przecinków', A.pelny({ ulica: 'Długa', numer: '1' }) === 'ul. Długa 1');
T('pusty adres to pusty tekst', A.pelny({}) === '');

/* --- 11. Które pola dopisał program --- */
const dopisane = A.uzupelnione({ ulica: 'Kartuska', numer: '201' }, { ulica: 'Kartuska', numer: '201', miasto: 'Gdańsk', dzielnica: 'Siedlce', gmina: 'Gdańsk', powiat: 'Gdańsk', wojewodztwo: 'POMORSKIE', kod: '80-125' });
T('program wie, co dopisał', dopisane.includes('miasto') && dopisane.includes('dzielnica') && dopisane.includes('wojewodztwo'));
T('tego, co wpisał człowiek, nie przypisuje sobie', !dopisane.includes('ulica') && !dopisane.includes('numer'));
T('bez zmian lista jest pusta', A.uzupelnione({ miasto: 'Gdańsk' }, { miasto: 'Gdańsk' }).length === 0);


/* --- 11b. Lista prawdziwych ulic z miastami ---
   Człowiek wpisuje kawałek nazwy, a usługa oddaje kilka RÓŻNYCH ulic.
   Ma zobaczyć je wszystkie z miastami i wskazać swoją — zamiast zgadywać,
   którą z nich program sobie wybrał i wpisał do operatu. */
const KAWALEK = A.zOdpowiedzi({ results: [
  { city: 'Gdańsk', street: 'Kartuska', number: '201', district: 'Siedlce', code: '80-125' },
  { city: 'Gdańsk', street: 'Kartuska', number: '205', district: 'Siedlce', code: '80-125' },
  { city: 'Gdańsk', street: 'Kartuzka', number: '2', district: 'Wrzeszcz', code: '80-300' },
  { city: 'Kartuzy', street: 'Kartuska', number: '201', code: '83-300' },
] });
const miejscaKawalka = A.miejsca(KAWALEK);
T('różne ulice to różne pozycje na liście', miejscaKawalka.length === 3, String(miejscaKawalka.length));
T('pozycja niesie nazwę ulicy z rejestru', miejscaKawalka.every(m => m.ulica));
T('dwa punkty tej samej ulicy to jedna pozycja z licznikiem',
  miejscaKawalka.find(m => m.ulica === 'Kartuska' && m.miasto === 'Gdańsk').ile === 2);
T('opis pozycji umie pokazać ulicę razem z miastem',
  /^ul\. Kartuska, Gdańsk/.test(A.opisMiejsca(miejscaKawalka[0], { zUlica: true })),
  A.opisMiejsca(miejscaKawalka[0], { zUlica: true }));
T('bez ulicy opis zostaje taki jak był', !/^ul\./.test(A.opisMiejsca(miejscaKawalka[0])));
const kawalekW = A.rozstrzygnij(KAWALEK, { ulica: 'Kartu' });
T('przy kilku ulicach program pyta, a nie wybiera', kawalekW.stan === 'wybor' && kawalekW.wybrane === null);
T('pytanie wymienia ulice z miastami',
  /Kartuska, Gdańsk/.test(kawalekW.pytanie) && /Kartuzka/.test(kawalekW.pytanie), kawalekW.pytanie);
/* Nazwa ulicy w operacie pochodzi Z REJESTRU, a nie z tego, co człowiek
   zdążył wpisać. Wpisał „Kartu", a ulica nazywa się „Kartuska". */
const jednaUlica = A.rozstrzygnij(KAWALEK.filter(k => k.miasto === 'Kartuzy'), { ulica: 'Kartu' });
T('nazwa ulicy do operatu jest z rejestru, nie z pola',
  jednaUlica.wybrane.ulica === 'Kartuska', jednaUlica.wybrane.ulica);


/* --- 12. NAZWISKO ZAMIAST PEŁNEJ NAZWY ULICY ---
   Rzeczoznawca pisze „chrzanowskiego", a ulica nazywa się „Bernarda
   Chrzanowskiego". Program, który odpowiada wtedy „w rejestrze nie ma takiej
   ulicy", mówi nieprawdę — i mówi ją stanowczo. To najgorszy rodzaj
   odpowiedzi, bo człowiek jej wierzy i zaczyna szukać błędu u siebie. */
const CHRZANOWSKI = [
  { ulica: 'Bernarda Chrzanowskiego', miasto: 'Gdańsk', dzielnica: 'Wrzeszcz', numer: '5', kod: '80-278' },
  { ulica: 'Bernarda Chrzanowskiego', miasto: 'Gdańsk', dzielnica: 'Wrzeszcz', numer: '7', kod: '80-278' },
  { ulica: 'Chrzanowskiego', miasto: 'Sopot', numer: '5', kod: '81-700' },
  { ulica: 'Grunwaldzka', miasto: 'Gdańsk', dzielnica: 'Wrzeszcz', numer: '5', kod: '80-244' },
];
T('samo nazwisko pasuje do pełnej nazwy ulicy',
  A.pasujeDoFrazy({ ulica: 'Bernarda Chrzanowskiego' }, 'chrzanowskiego'));
T('pełna nazwa pasuje do skróconej', A.pasujeDoFrazy({ ulica: 'Chrzanowskiego' }, 'bernarda chrzanowskiego'));
T('wielkość liter i ogonki nie mają znaczenia',
  A.pasujeDoFrazy({ ulica: 'Bernarda Chrzanowskiego' }, 'CHRZANOWSKIEGO'));
T('inna ulica nie pasuje', !A.pasujeDoFrazy({ ulica: 'Grunwaldzka' }, 'chrzanowskiego'));
T('odmiana nie przeszkadza', A.pasujeDoFrazy({ ulica: 'Jana Matejki' }, 'matejko'));
const odsiane = A.odsiejDoFrazy(CHRZANOWSKI, 'chrzanowskiego');
T('odsiew zostawia obie ulice Chrzanowskiego', odsiane.length === 3, String(odsiane.length));
T('i wyrzuca Grunwaldzką', !odsiane.some(k => k.ulica === 'Grunwaldzka'));
/* Gdy NIC nie pasuje, oddajemy wszystko: lepiej pokazać człowiekowi, co
   usługa zwróciła, niż powiedzieć mu, że nie ma nic. */
T('gdy nic nie pasuje, program pokazuje, co usługa zwróciła',
  A.odsiejDoFrazy(CHRZANOWSKI, 'niemazachtakiej').length === CHRZANOWSKI.length);

const chrz = A.rozstrzygnij(CHRZANOWSKI, { ulica: 'chrzanowskiego' });
T('po samym nazwisku program ma co pokazać', chrz.stan === 'wybor', chrz.stan);
T('pokazuje PEŁNĄ nazwę ulicy z rejestru',
  chrz.miejsca.some(m => m.ulica === 'Bernarda Chrzanowskiego'), JSON.stringify(chrz.miejsca.map(m => m.ulica)));
T('razem z miastem i dzielnicą',
  /ul\. Bernarda Chrzanowskiego, Gdańsk, dzielnica Wrzeszcz/.test(A.opisMiejsca(chrz.miejsca[0], { zUlica: true })),
  A.opisMiejsca(chrz.miejsca[0], { zUlica: true }));
T('i tę samą ulicę w innym mieście', chrz.miejsca.some(m => m.miasto === 'Sopot'));
T('dwa punkty tej samej ulicy to jedna pozycja', chrz.miejsca.find(m => m.miasto === 'Gdańsk').ile === 2);
T('Grunwaldzka nie trafia na listę', !chrz.miejsca.some(m => m.ulica === 'Grunwaldzka'));

/* --- 13. Kilka zapytań zamiast jednego --- */
const proby = A.zapytania({ ulica: 'chrzanowskiego', znaneMiasta: ['Gdańsk', 'Sopot', 'Gdynia'] });
T('bez miejscowości program pyta na kilka sposobów', proby.length >= 3, String(proby.length));
T('pierwsze zapytanie jest takie, jak wpisał człowiek', /wpisałeś/.test(proby[0].opis), proby[0].opis);
T('kolejne dokładają miasta, w których rzeczoznawca pracuje',
  proby.some(x => x.opis === 'Gdańsk') && proby.some(x => x.opis === 'Sopot'));
T('miasto trafia do adresu zapytania',
  /Gda%C5%84sk/.test(proby.find(x => x.opis === 'Gdańsk').url));
T('program nie pyta o więcej miast niż trzeba',
  A.zapytania({ ulica: 'chrzanowskiego', znaneMiasta: ['a', 'b', 'c', 'd', 'e', 'f'] }).length <= A.MAKS_MIAST + 1);
T('z podaną miejscowością wystarczy jedno zapytanie',
  A.zapytania({ ulica: 'chrzanowskiego', miasto: 'Gdańsk' }).length === 1);
T('miejscowość wpisana w tę samą rubrykę też wystarczy',
  A.zapytania({ ulica: 'chrzanowskiego, Gdańsk' }).length === 1);
T('za krótka nazwa nie idzie do usługi wcale', A.zapytania({ ulica: 'ch' }).length === 0);
T('każde zapytanie ma opis, co właśnie sprawdza', proby.every(x => x.opis && x.url));
T('zapytania się nie powtarzają', new Set(proby.map(x => x.url)).size === proby.length);

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

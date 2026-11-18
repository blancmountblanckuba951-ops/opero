'use strict';
/**
 * OPERO — podpowiedzi adresów.
 *
 * Adres wpisany raz jako „ul. Długa", raz jako „Dluga" rozjeżdża się z
 * wypisem, z wyciągiem i z własną bazą. Podpowiedzi mają sprawić, że adres
 * będzie za każdym razem ten sam — a nie wpisać go za człowieka.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const P = require(path.join(APP, 'renderer', 'podpowiedzi.js'));

console.log('OPERO — podpowiedzi adresów\n');

/* --- 1. Z własnych danych --- */
const transakcje = [
  { miejscowosc: 'Gdańsk', adres: 'ul. Długa 12' },
  { miejscowosc: 'Gdańsk', adres: 'Długa 14/2' },
  { miejscowosc: 'Gdynia', adres: 'al. Zwycięstwa 10' },
];
const historia = [{ title: 'Gdańsk Krótka 4 — lokal' }];
const klienci = [{ address: 'ul. Rynek 1, 80-831 Gdańsk' }];

const miasta = P.zWlasnych({ transakcje, historia, klienci, rodzaj: 'miejscowosc' });
T('miejscowości wyciągnięte z własnych danych', miasta.length >= 2, JSON.stringify(miasta.map(x => x.etykieta)));
T('najczęstsza miejscowość jest pierwsza', miasta[0].etykieta === 'Gdańsk', miasta[0].etykieta);
T('program pokazuje, ile razy widział ten adres', /^\d+× w Twoich danych$/.test(miasta[0].opis), miasta[0].opis);
T('własne podpowiedzi są oznaczone jako własne', miasta.every(x => x.wlasne === true));

const ulice = P.zWlasnych({ transakcje, rodzaj: 'ulica' });
T('ulice są wyciągane bez numeru domu',
  ulice.some(x => x.etykieta === 'Długa'), JSON.stringify(ulice.map(x => x.etykieta)));
T('„ul." i „al." nie wchodzą do nazwy ulicy',
  ulice.every(x => !/^(ul|al)\.?\s/i.test(x.etykieta)));
T('ta sama ulica z dwóch transakcji to jedna podpowiedź',
  ulice.filter(x => x.etykieta.toLowerCase() === 'długa').length === 1);
T('numer z mieszkaniem też jest odcinany', P.ulicaZAdresu('Długa 14/2') === 'Długa');
T('adres z miastem po przecinku nie gubi ulicy', P.ulicaZAdresu('ul. Rynek 1, Gdańsk') === 'Rynek');

/* --- 2. Zawężanie bez sieci --- */
const lista = [{ etykieta: 'Gdańsk' }, { etykieta: 'Gdynia' }, { etykieta: 'Starogard Gdański' }];
T('wpisanie „gda" pokazuje pasujące', P.filtruj(lista, 'gda').length === 2);
T('to, co zaczyna się od wpisanego tekstu, idzie na górę',
  P.filtruj(lista, 'gda')[0].etykieta === 'Gdańsk');
T('szukanie działa bez polskich znaków', P.filtruj([{ etykieta: 'Łódź' }], 'lodz').length === 1);
T('pusta fraza nie filtruje', P.filtruj(lista, '').length === 3);

/* --- 3. Zapytanie do usługi GUGiK --- */
T('poniżej trzech znaków nie pytamy usługi', P.zapytanie('Gd') === null);
const url = P.zapytanie('Długa 12', { miasto: 'Gdańsk' });
T('zapytanie idzie do państwowej usługi geokodowania',
  url.startsWith('https://services.gugik.gov.pl/uug/?request=GetAddress'), url);
T('miasto jest doklejane, żeby nie szukać po całej Polsce',
  /Gda%C5%84sk%2C%20D%C5%82uga%2012/.test(url), url);
T('miasto nie jest doklejane dwa razy',
  !/Gda%C5%84sk.*Gda%C5%84sk/.test(P.zapytanie('Gdańsk, Długa', { miasto: 'Gdańsk' })));

/* --- 4. Odpowiedź usługi --- */
const odp = JSON.stringify({ results: {
  1: { city: 'Gdańsk', street: 'Długa', number: '12', code: '80-831', x: 724000, y: 470000 },
  2: { city: 'Gdańsk', street: 'Długa', number: '14', code: '80-831', x: 724010, y: 470010 },
} });
const zUslugi = P.zOdpowiedzi(odp, 'adres');
T('podpowiedzi z usługi są odczytane', zUslugi.length === 2);
T('etykieta to ulica z numerem', zUslugi[0].etykieta === 'Długa 12');
T('opis niesie miejscowość i kod pocztowy', /Gdańsk/.test(zUslugi[0].opis) && /80-831/.test(zUslugi[0].opis));
T('współrzędne idą razem z podpowiedzią', zUslugi[0].x === 724000 && zUslugi[0].y === 470000);
T('odpowiedź jako lista też się rozłoży',
  P.zOdpowiedzi({ results: [{ city: 'Sopot', street: 'Monte Cassino', number: '1' }] }).length === 1);
T('śmieci zamiast odpowiedzi nie wywracają pola',
  P.zOdpowiedzi('to nie jest json').length === 0 && P.zOdpowiedzi(null).length === 0);
T('tryb miejscowości pokazuje samo miasto',
  P.zOdpowiedzi(odp, 'miejscowosc')[0].etykieta === 'Gdańsk');
T('powtórzone miejscowości są zwijane do jednej',
  P.zOdpowiedzi(odp, 'miejscowosc').length === 1);

/* --- 5. Własne przed państwowymi --- */
const scalone = P.scal([{ etykieta: 'Długa', wlasne: true }], [{ etykieta: 'Długa 12' }, { etykieta: 'długa', wlasne: false }]);
T('własne podpowiedzi idą pierwsze', scalone[0].wlasne === true);
T('ta sama nazwa nie pojawia się dwa razy',
  scalone.filter(x => P.uprosc(x.etykieta) === 'dluga').length === 1);
T('liczba podpowiedzi jest ograniczona',
  P.scal(Array.from({ length: 30 }, (_, i) => ({ etykieta: `Ulica ${i}` })), []).length <= P.MAKS_PODPOWIEDZI);

/* --- 6. Moduł nie zna żadnego obcego adresu --- */
const kod = fs.readFileSync(path.join(APP, 'renderer', 'podpowiedzi.js'), 'utf8');
const adresy = (kod.match(/https?:\/\/[a-z0-9.\-]+/gi) || []).map(a => a.toLowerCase());
T('podpowiedzi pyta wyłącznie usługi GUGiK',
  adresy.every(a => /gugik\.gov\.pl/.test(a)), adresy.join(', '));
T('program czeka, aż człowiek skończy pisać', P.ZWLOKA_MS >= 200);

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

'use strict';
/**
 * OPERO — skrypty budowy.
 *
 * Dwie rzeczy, które już raz zepsuły prawdziwą instalację u klienta i nie mogą
 * wrócić po cichu:
 *   1. Windows PowerShell przy zapisie UTF-8 dopisuje niewidoczny znacznik BOM,
 *      na którym przewraca się każdy odczyt JSON-a — także w programie, u klienta.
 *   2. Instalator zamykał tylko OPERO.exe. Serwer modelu llama-server.exe to
 *      osobny proces: zostawał w pamięci, trzymał własny plik otwarty i
 *      instalator nie mógł go nadpisać („Przerwij / Ponów próbę / Ignoruj").
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

// Narzędzia leżą obok testów w paczce do budowy; w repozytorium roboczym ich nie ma.
const NARZ = [
  path.join(__dirname, '..', 'narzedzia'),
  path.join(__dirname, '..', '..', 'narzedzia'),
].find(p => fs.existsSync(path.join(p, 'buduj.ps1')));

if (!NARZ) {
  console.log('OPERO — skrypty budowy\n\n  Pomijam: nie ma folderu narzedzia\\ (to nie jest paczka do budowy).');
  process.exit(0);
}
const C = n => fs.readFileSync(path.join(NARZ, n), 'utf8');
console.log('OPERO — skrypty budowy\n');

const buduj = C('buduj.ps1'), silnik = C('pobierz-silnik.ps1'), nsi = C('opero.nsi');

/* --- 1. Żaden plik tekstowy nie powstaje ze znacznikiem BOM --- */
for (const [nazwa, tresc] of [['buduj.ps1', buduj], ['pobierz-silnik.ps1', silnik]]) {
  // Szukamy po LINIACH, bo wzmianka w komentarzu („tak sie NIE pisze") to nie
  // to samo, co prawdziwy zapis - a wczesniej test liczyl jedno i drugie.
  const zle_ = tresc.split('\n')
    .filter(l => !l.trim().startsWith('#') && /Set-Content[^\n]*-Encoding UTF8/.test(l))
    .map(l => l.trim());
  T(`${nazwa} nie zapisuje plikow przez Set-Content UTF8`, zle_.length === 0, zle_.join(' | '));
  T(`${nazwa} ma wlasny zapis bez znacznika BOM`, /UTF8Encoding \$false/.test(tresc));
}
T('zapis idzie przez jedna funkcje, a nie przez kopiowany kod',
  /function ZapiszTekst/.test(buduj) && /function ZapiszTekst/.test(silnik));

/* --- 2. Same skrypty też nie mogą mieć BOM-u --- */
for (const n of ['buduj.ps1', 'pobierz-silnik.ps1', 'zapisz-manifest.js', 'opero.nsi']) {
  const b = fs.readFileSync(path.join(NARZ, n));
  T(`${n} sam nie zaczyna sie od znacznika BOM`,
    !(b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF));
}

/* --- 3. Odczyt zamka znosi BOM z plików zapisanych wcześniej --- */
T('zapisz-manifest.js czyta ZAMEK.json takze ze znacznikiem BOM',
  /0xFEFF/.test(C('zapisz-manifest.js')));

/* --- 4. Instalator zamyka wszystko, co trzyma pliki --- */
T('instalator zamyka serwer modelu, nie tylko program',
  /taskkill[^\n]*llama-server\.exe/.test(nsi), 'brak llama-server.exe w opero.nsi');
T('zamykanie jest w JEDNYM miejscu, uzywanym przy instalacji i odinstalowaniu',
  /!macro ZamknijOPERO/.test(nsi) && (nsi.match(/!insertmacro ZamknijOPERO/g) || []).length >= 2);
T('instalator czeka, az system zwolni plik', /Sleep\s+\d{3,}/.test(nsi));
// Nazw plikow silnika nie wyliczamy - jest ich kilkanascie i zmieniaja sie
// z wersja na wersje. Instalator zwalnia KAZDY plik w folderze silnika, a gdy
// system trzyma ktorys mimo wszystko, odklada go na po restarcie zamiast
// zatrzymywac cala instalacje pytaniem „Przerwij / Ponow / Ignoruj".
T('zablokowany plik silnika nie zatrzymuje calej instalacji',
  /!macro ZwolnijPlik/.test(nsi) && /\/REBOOTOK/.test(nsi)
  && /Function ZwolnijSilnik/.test(nsi) && /resources\\silnik/.test(nsi));
T('budowa tez zamyka serwer modelu przed instalacja',
  /llama-server/.test(buduj) && /Get-Process/.test(buduj));

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

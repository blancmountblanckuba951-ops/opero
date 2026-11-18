'use strict';
/**
 * OPERO — manifest modelu dla programu (silnik\model.json).
 *
 * Program musi wiedziec DWIE rzeczy, zanim cokolwiek pobierze: co ma pobrac
 * i czym to sprawdzic. Ten plik mu to mowi i jedzie W INSTALATORZE, wiec
 * rzeczoznawca nie musi nic wpisywac, a Ty nie musisz niczego nigdzie wrzucac.
 *
 * Zrodlem jest Hugging Face, czyli to samo miejsce, z ktorego model bierze
 * budowa. Adres jest publiczny i staly, a serwer obsluguje wznawianie, wiec
 * przerwane pobieranie 6 GB nie zaczyna sie od zera.
 *
 * Wszystkie dane bierzemy z silnik\ZAMEK.json, ktory powstal przy pobieraniu
 * modelu - w tym sume SHA-256 policzona na TYM pliku, ktory sam sprawdziles.
 *
 * Uzycie: node zapisz-manifest.js <folder silnika>
 */
const fs = require('node:fs');
const path = require('node:path');

const folder = process.argv[2];
if (!folder) { console.error('uzycie: node zapisz-manifest.js <folder silnika>'); process.exit(2); }

const plikZamka = path.join(folder, 'ZAMEK.json');
if (!fs.existsSync(plikZamka)) {
  console.error(`    Nie ma ${plikZamka} - manifest modelu nie powstanie.`);
  process.exit(1);
}

let zamek;
try {
  // Windows PowerShell przy zapisie UTF-8 dopisuje na poczatku pliku trzy
  // niewidoczne bajty (BOM). `JSON.parse` przewraca sie na nich komunikatem
  // „Unexpected token", ktory o niczym nie mowi - i wlasnie tak przepadal tu
  // manifest modelu. Budowa pisze juz pliki bez znacznika, ale zamki zapisane
  // wczesniej wciaz go maja, wiec odczyt musi sobie z nim radzic.
  const tekst = fs.readFileSync(plikZamka, 'utf8');
  zamek = JSON.parse(tekst.charCodeAt(0) === 0xFEFF ? tekst.slice(1) : tekst);
} catch (e) { console.error(`    ZAMEK.json jest uszkodzony: ${e.message}`); process.exit(1); }

const m = zamek?.model || {};

// Nazwa pliku jest zapisana w adresie, wiec gdy brakuje jej w zamku, bierzemy
// ja stamtad zamiast przerywac budowe. Tylko adres i suma sa naprawde nie do
// zastapienia - bez nich nie ma czego pobrac ani czym tego sprawdzic.
if (!m.plik && m.url) {
  try {
    const sciezka = new URL(String(m.url)).pathname;
    m.plik = decodeURIComponent(sciezka.split('/').filter(Boolean).pop() || '');
    if (m.plik) console.log(`    nazwa pliku modelu wzieta z adresu: ${m.plik}`);
  } catch { /* zostanie zgloszone ponizej */ }
}

// Gdy czegos brakuje, mowimy DOKLADNIE czego i gdzie - zamiast jednego zdania
// „brakuje danych", po ktorym nie wiadomo, co poprawic. Najczestsza przyczyna:
// ZAMEK.json powstal w starszej wersji budowy i nie ma wszystkich pol, a nowy
// sie nie robi, bo model juz lezy na dysku (pobierz-silnik.ps1 konczy wtedy
// prace od razu). Lekarstwo jest jedno i je podajemy.
const brakuje = [];
if (!m.plik) brakuje.push('model.plik (nazwa pliku .gguf)');
if (!m.url)  brakuje.push('model.url (adres do pobrania)');
if (!m.suma) brakuje.push('model.suma (SHA-256)');
if (brakuje.length) {
  console.error(`    W ${plikZamka} brakuje: ${brakuje.join(', ')}.`);
  console.error(`    Jest tam: ${Object.keys(m).join(', ') || '(nic - brak sekcji \"model\")'}.`);
  console.error('    Napraw tak: usun silnik\\ZAMEK.json albo uruchom');
  console.error('    narzedzia\\pobierz-silnik.ps1 -Odswiez - zamek powstanie w nowym formacie.');
  process.exit(1);
}

const manifest = {
  nazwa: m.plik,
  rozmiar: Number(m.rozmiar) || 0,
  suma: String(m.suma).toLowerCase(),
  url: m.url,                       // pelny adres pliku .gguf u zrodla
  repo: m.repo || '',               // z niego sprawdzamy, czy jest nowsza wersja
  licencja: m.licencja || '',
  autor: m.autor || '',
  opis: `Model ${m.plik}${m.licencja ? ` (${m.licencja}, ${m.autor || 'autor nieznany'})` : ''}.`,
  czesci: [],                       // z Hugging Face bierzemy jednym plikiem
};

const cel = path.join(folder, 'model.json');
fs.writeFileSync(cel, JSON.stringify(manifest, null, 2), 'utf8');
const gb = manifest.rozmiar ? (manifest.rozmiar / 1024 ** 3).toFixed(2) : '?';
console.log(`    manifest modelu: ${manifest.nazwa} (${gb} GB) -> ${path.basename(cel)}`);

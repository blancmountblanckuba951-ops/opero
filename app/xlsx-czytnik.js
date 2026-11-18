'use strict';
/**
 * OPERO 1.10.0 — czytnik XLSX bez Excela i bez bibliotek z npm.
 *
 * Do tej pory OPERO otwierało arkusze przez automatyzację Microsoft Excela
 * zainstalowanego na komputerze. Działa to u tych, którzy mają Office'a, i nie
 * działa u nikogo innego — a wyciąg z RCiWN bywa jedynym plikiem, od którego
 * zaczyna się operat. Importu nie można uzależniać od cudzego programu.
 *
 * XLSX to zwykły ZIP z plikami XML. Node ma w sobie `zlib`, więc wystarczy
 * przeczytać katalog archiwum, rozpakować dwa pliki i wyłuskać wartości komórek.
 * Celowo NIE piszemy tu pełnej obsługi formatu: nie interesują nas style, wykresy
 * ani formuły — tylko wartości, bo to one trafiają do operatu.
 */
const fs = require('node:fs');
const zlib = require('node:zlib');

/* ------------------------------ ZIP ------------------------------ */

function katalogZip(buf) {
  // Stopka ZIP (EOCD) stoi na końcu pliku, ale może mieć za sobą komentarz,
  // więc szukamy jej od tyłu.
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('To nie jest plik ZIP/XLSX (brak stopki archiwum).');
  const ile = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const wpisy = new Map();
  for (let i = 0; i < ile; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const metoda = buf.readUInt16LE(p + 10);
    const spakowany = buf.readUInt32LE(p + 20);
    const dlNazwy = buf.readUInt16LE(p + 28);
    const dlExtra = buf.readUInt16LE(p + 30);
    const dlKom = buf.readUInt16LE(p + 32);
    const offset = buf.readUInt32LE(p + 42);
    const nazwa = buf.slice(p + 46, p + 46 + dlNazwy).toString('utf8');
    wpisy.set(nazwa, { metoda, spakowany, offset });
    p += 46 + dlNazwy + dlExtra + dlKom;
  }
  return wpisy;
}

function rozpakuj(buf, wpis) {
  if (!wpis) return null;
  const o = wpis.offset;
  if (buf.readUInt32LE(o) !== 0x04034b50) throw new Error('Uszkodzony wpis w archiwum XLSX.');
  const dlNazwy = buf.readUInt16LE(o + 26), dlExtra = buf.readUInt16LE(o + 28);
  const start = o + 30 + dlNazwy + dlExtra;
  const dane = buf.slice(start, start + wpis.spakowany);
  if (wpis.metoda === 0) return dane;                    // bez kompresji
  if (wpis.metoda === 8) return zlib.inflateRawSync(dane); // deflate
  throw new Error(`Nieobsługiwana metoda kompresji w XLSX (${wpis.metoda}).`);
}

/* ------------------------------ XML ------------------------------ */

const ENCJE = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
function odkoduj(s) {
  return String(s).replace(/&(amp|lt|gt|quot|apos);/g, m => ENCJE[m])
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function tekstyWspolne(xml) {
  if (!xml) return [];
  const out = [];
  // Jeden <si> to jeden napis, ale bywa posiekany na kilka <t> (różne formatowanie
  // w jednej komórce) — sklejamy je, inaczej adres „Armii Krajowej" wróciłby ucięty.
  for (const m of xml.matchAll(/<si[^>]*>([\s\S]*?)<\/si>/g)) {
    const czesci = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => odkoduj(x[1]));
    out.push(czesci.join(''));
  }
  return out;
}

function kolumnaNaIndeks(ref) {
  const m = String(ref || '').match(/^([A-Z]+)/);
  if (!m) return null;
  let n = 0;
  for (const z of m[1]) n = n * 26 + (z.charCodeAt(0) - 64);
  return n - 1;
}

function wierszeArkusza(xml, wspolne) {
  const out = [];
  for (const w of xml.matchAll(/<row([^>]*)>([\s\S]*?)<\/row>/g)) {
    // Excel nie zapisuje pustych wierszy. Gdybyśmy czytali je po kolei, wyciąg
    // z pustą linią pod tytułem przesunąłby wszystkie numery wierszy i „pozycja 7"
    // w operacie wskazywałaby inny wiersz niż w arkuszu starostwa.
    const nrWiersza = Number((w[1].match(/r="(\d+)"/) || [])[1] || 0);
    if (nrWiersza > 0) while (out.length < nrWiersza - 1) out.push([]);
    const wiersz = [];
    for (const c of w[2].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const atr = c[1], tresc = c[2];
      const ref = (atr.match(/r="([A-Z]+\d+)"/) || [])[1];
      const typ = (atr.match(/t="([^"]+)"/) || [])[1];
      let v = null;
      if (typ === 'inlineStr') {
        v = [...tresc.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => odkoduj(x[1])).join('');
      } else {
        const m = tresc.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        if (m) v = typ === 's' ? (wspolne[Number(m[1])] ?? '') : odkoduj(m[1]);
      }
      const i = kolumnaNaIndeks(ref);
      if (i == null) wiersz.push(v ?? '');
      else { while (wiersz.length < i) wiersz.push(''); wiersz[i] = v ?? ''; }
    }
    // Komórki puste na końcu wiersza Excel pomija — zostawiamy wiersz tak, jak jest.
    out.push(wiersz);
  }
  return out;
}

/* ------------------------------ wejscie ------------------------------ */

/** Czyta wszystkie arkusze pliku XLSX. Zwraca [{ nazwa, wiersze }]. */
function czytaj(sciezka) {
  const buf = fs.readFileSync(sciezka);
  const zip = katalogZip(buf);
  const wspolne = tekstyWspolne(rozpakuj(buf, zip.get('xl/sharedStrings.xml'))?.toString('utf8'));

  // Nazwy arkuszy i ich kolejność biorą się z workbook.xml; gdyby go zabrakło,
  // czytamy po prostu wszystkie pliki arkuszy w kolejności z archiwum.
  const nazwy = [];
  const wb = rozpakuj(buf, zip.get('xl/workbook.xml'))?.toString('utf8');
  if (wb) for (const m of wb.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*>/g)) nazwy.push(odkoduj(m[1]));

  const pliki = [...zip.keys()].filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))
    .sort((a, b) => Number(a.match(/(\d+)/)[1]) - Number(b.match(/(\d+)/)[1]));
  if (!pliki.length) throw new Error('W pliku XLSX nie znaleziono żadnego arkusza.');

  return pliki.map((p, i) => ({
    nazwa: nazwy[i] || `Arkusz ${i + 1}`,
    wiersze: wierszeArkusza(rozpakuj(buf, zip.get(p)).toString('utf8'), wspolne),
  }));
}

module.exports = { czytaj, katalogZip, rozpakuj, tekstyWspolne, kolumnaNaIndeks, wierszeArkusza };

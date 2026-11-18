'use strict';
/**
 * Pakowanie i rozpakowywanie app.asar bez bibliotek z npm.
 *
 * Format jest prosty, ale ma jedna pulapke, ktora kosztowala mnie juz jedna
 * pomylke: dane plikow zaczynaja sie DOKLADNIE pod 16+dlugosc_JSON, bez
 * dorownywania do czterech bajtow. Dlatego JSON dopelniamy spacjami tutaj, a nie
 * liczymy wyrownania przy odczycie — inaczej kazdy plik wychodzi przesuniety
 * o dwa bajty i program nie startuje.
 */
const fs = require('node:fs');
const path = require('node:path');

function zbierz(katalog, prefiks = '') {
  const out = [];
  for (const e of fs.readdirSync(katalog, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const p = path.join(katalog, e.name);
    if (e.isDirectory()) out.push(...zbierz(p, prefiks + e.name + '/'));
    else out.push({ nazwa: prefiks + e.name, sciezka: p, rozmiar: fs.statSync(p).size });
  }
  return out;
}

function pakuj(katalog, cel) {
  const pliki = zbierz(katalog);
  const naglowek = { files: {} };
  let offset = 0;
  for (const f of pliki) {
    let wezel = naglowek;
    const czesci = f.nazwa.split('/');
    for (const kat of czesci.slice(0, -1)) {
      wezel.files[kat] = wezel.files[kat] || { files: {} };
      wezel = wezel.files[kat];
    }
    wezel.files[czesci[czesci.length - 1]] = { size: f.rozmiar, offset: String(offset) };
    offset += f.rozmiar;
  }
  let json = JSON.stringify(naglowek);
  while (json.length % 4) json += ' ';          // dopelnienie, zeby dane zaczynaly sie rowno
  const dl = Buffer.byteLength(json, 'utf8');
  if (dl !== json.length) throw new Error('Naglowek asar musi byc czystym ASCII.');
  const czolo = Buffer.alloc(16);
  czolo.writeUInt32LE(4, 0); czolo.writeUInt32LE(dl + 8, 4);
  czolo.writeUInt32LE(dl + 4, 8); czolo.writeUInt32LE(dl, 12);
  const strum = fs.createWriteStream(cel);
  strum.write(czolo); strum.write(json, 'utf8');
  for (const f of pliki) strum.write(fs.readFileSync(f.sciezka));
  return new Promise((ok, zle) => strum.end(err => err ? zle(err) : ok({ pliki: pliki.length, naglowek: dl })));
}

function rozpakuj(plik, cel) {
  const b = fs.readFileSync(plik);
  const dl = b.readUInt32LE(12);
  const d = JSON.parse(b.slice(16, 16 + dl).toString('utf8'));
  const baza = 16 + dl;
  (function chodz(w, p) {
    for (const [k, v] of Object.entries(w.files || {})) {
      if (v.files) chodz(v, path.join(p, k));
      else {
        fs.mkdirSync(p, { recursive: true });
        const o = Number(v.offset), s = Number(v.size);
        fs.writeFileSync(path.join(p, k), b.slice(baza + o, baza + o + s));
      }
    }
  })(d, cel);
}

if (require.main === module) {
  const [tryb, a, c] = process.argv.slice(2);
  if (tryb === 'pack') pakuj(a, c).then(r => console.log(`spakowano ${r.pliki} plikow, naglowek ${r.naglowek} B`));
  else if (tryb === 'unpack') { rozpakuj(a, c); console.log('rozpakowano'); }
  else { console.error('uzycie: asar_tool.js pack <katalog> <plik> | unpack <plik> <katalog>'); process.exit(2); }
}
module.exports = { pakuj, rozpakuj };

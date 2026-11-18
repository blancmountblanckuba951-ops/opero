'use strict';
/**
 * OPERO — eksport operatu do .docx.
 *
 * Plik Worda, którego Word nie otworzy, jest gorszy niż brak eksportu: wychodzi
 * na jaw dopiero u klienta. Dlatego test nie kończy się na „coś się zapisało" —
 * rozpakowuje paczkę, sprawdza sumy kontrolne ZIP-a, strukturę pakietu OOXML
 * i to, czy treść operatu naprawdę w nim jest.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const D = require(path.join(APP, 'docx-operat.js'));

console.log('OPERO — eksport do Worda\n');

/* --- 1. ZIP, który da się rozpakować --- */
const paczka = D.zip([
  { nazwa: 'a.txt', dane: 'pierwszy' },
  { nazwa: 'katalog/b.txt', dane: 'drugi, dłuższy tekst '.repeat(50) },
]);
T('paczka zaczyna się sygnaturą ZIP', paczka.slice(0, 4).toString('hex') === '504b0304');
T('paczka kończy się rekordem katalogu', paczka.includes(Buffer.from('504b0506', 'hex')));
T('suma kontrolna liczy się jak CRC-32', D.crc32(Buffer.from('123456789')) === 0xCBF43926);

const katalog = fs.mkdtempSync(path.join(os.tmpdir(), 'opero-docx-'));
const plikZip = path.join(katalog, 'proba.zip');
fs.writeFileSync(plikZip, paczka);
let rozpakowane = '';
try { rozpakowane = execFileSync('unzip', ['-p', plikZip, 'katalog/b.txt'], { encoding: 'utf8' }); } catch (e) { rozpakowane = `BLAD ${e.message}`; }
T('systemowy unzip rozpakowuje paczkę i treść się zgadza',
  rozpakowane.startsWith('drugi, dłuższy tekst'), rozpakowane.slice(0, 40));

/* --- 2. Dokument z prawdziwej treści operatu --- */
const obrazek = fs.readFileSync(path.join(APP, 'assets', 'icon.png'));
const html = `<html><head><style>body{color:red}</style></head><body>
  <h1>OPERAT SZACUNKOWY</h1>
  <p>Wartość rynkowa <b>390&nbsp;000 zł</b> &amp; znaki &lt;specjalne&gt;.</p>
  <h2>1. OKREŚLENIE PRZEDMIOTU I ZAKRESU WYCENY</h2>
  <p>Lokal mieszkalny przy ul. Długiej 12/3 w Gdańsku.</p>
  <ul><li>powierzchnia 54,20 m²</li><li>księga wieczysta GD1G/00012345/0</li></ul>
  <table><tr><th>Cecha rynkowa</th><th>Waga</th></tr>
  <tr><td>Lokalizacja szczegółowa</td><td>21%</td></tr>
  <tr><td>Standard lokalu</td><td>28%</td></tr></table>
  <h3>Dokumentacja fotograficzna</h3>
  <p><img src="data:image/png;base64,${obrazek.toString('base64')}" alt="widok"></p>
  <script>alert('nie powinno tu trafić')</script>
</body></html>`;

const wynik = D.zHtml(html, { tytul: 'Operat — Gdańsk, Długa 12/3', autor: 'Jan Kowalski' });
const plikDocx = path.join(katalog, 'operat.docx');
fs.writeFileSync(plikDocx, wynik.plik);
T('dokument powstaje i ma rozsądny rozmiar', wynik.plik.length > 2000, String(wynik.plik.length));
T('program liczy, co w nim umieścił', wynik.statystyka.akapitow > 5 && wynik.statystyka.obrazow === 1,
  JSON.stringify(wynik.statystyka));

const lista = execFileSync('unzip', ['-Z1', plikDocx], { encoding: 'utf8' }).split('\n').filter(Boolean);
for (const wymagany of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml',
                        'word/_rels/document.xml.rels', 'docProps/core.xml']) {
  T(`pakiet zawiera ${wymagany}`, lista.includes(wymagany));
}
T('obraz leży w word/media', lista.some(n => n.startsWith('word/media/')));

const dokument = execFileSync('unzip', ['-p', plikDocx, 'word/document.xml'], { encoding: 'utf8' });
T('nagłówek operatu jest w dokumencie', dokument.includes('OPERAT SZACUNKOWY'));
T('nagłówki mają styl Worda, więc da się z nich zrobić spis treści',
  /w:pStyle w:val="Heading1"/.test(dokument) && /w:pStyle w:val="Heading2"/.test(dokument));
T('akapit z treścią jest przeniesiony', dokument.includes('Lokal mieszkalny przy ul. Długiej 12/3'));
T('lista punktowana jest przeniesiona', dokument.includes('powierzchnia 54,20 m²'));
T('tabela jest tabelą Worda, a nie tekstem',
  dokument.includes('<w:tbl>') && dokument.includes('Lokalizacja szczegółowa'));
T('obraz jest osadzony', dokument.includes('<w:drawing>') && dokument.includes('r:embed="rId101"'));

// Encje i znaki specjalne to najczestsza przyczyna „pliku uszkodzonego".
T('twarda spacja nie zostaje jako &nbsp;', !dokument.includes('&nbsp;') && dokument.includes('390'));
T('ampersand i ostre nawiasy są poprawnie zapisane',
  dokument.includes('&amp;') && dokument.includes('&lt;specjalne&gt;'));
T('kod ze strony NIE trafia do dokumentu', !dokument.includes('alert('));
T('styl ze strony nie wycieka do treści', !dokument.includes('color:red'));

const rels = execFileSync('unzip', ['-p', plikDocx, 'word/_rels/document.xml.rels'], { encoding: 'utf8' });
T('relacja obrazu wskazuje na istniejący plik',
  /Target="media\/obraz1\.png"/.test(rels) && lista.includes('word/media/obraz1.png'));
const wlasciwosci = execFileSync('unzip', ['-p', plikDocx, 'docProps/core.xml'], { encoding: 'utf8' });
T('w właściwościach dokumentu stoi autor i tytuł',
  wlasciwosci.includes('Jan Kowalski') && wlasciwosci.includes('Gdańsk'));

/* --- 3. Czego robić nie wolno --- */
let odmowil = false;
try { D.zHtml('<html><body></body></html>', {}); } catch { odmowil = true; }
T('pusty dokument nie jest zapisywany po cichu', odmowil);
T('obraz w formacie, którego Word nie zna, jest pomijany, a nie psuje pliku', (() => {
  const w = D.zHtml('<html><body><p>treść</p><img src="data:image/webp;base64,AAAA"></body></html>', {});
  return w.statystyka.obrazow === 0 && w.plik.length > 1000;
})());
T('rozmiar PNG czytany jest z nagłówka pliku', (() => {
  const r = D.rozmiarObrazu(obrazek, 'png');
  return r.w > 0 && r.h > 0;
})());
// Znak sterujacy w XML-u 1.0 jest zakazany: Word odmawia otwarcia pliku bez
// slowa wyjasnienia. Sprawdzamy sam document.xml, nie spakowana paczke -
// skompresowane bajty moga przypadkiem zawierac dowolna wartosc.
T('znaki sterujące nie trafiają do XML-a', (() => {
  const kat = fs.mkdtempSync(path.join(os.tmpdir(), 'opero-docx2-'));
  const plik = path.join(kat, 'x.docx');
  fs.writeFileSync(plik, D.zHtml('<html><body><p>tekst\u0001z\u0007kontrolnymi</p></body></html>', {}).plik);
  const xmlDok = execFileSync('unzip', ['-p', plik, 'word/document.xml'], { encoding: 'utf8' });
  fs.rmSync(kat, { recursive: true, force: true });
  return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(xmlDok) && xmlDok.includes('tekstzkontrolnymi');
})());

fs.rmSync(katalog, { recursive: true, force: true });

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

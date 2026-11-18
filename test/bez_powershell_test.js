'use strict';
/** OPERO 3.2 — program nie uruchamia PowerShella (antywirusy blokują powershell.exe), OCR wewnątrz programu, rozpakowanie ZIP we własnym kodzie, zbieracz rynku. */
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const APP = '/root/work/build/app';
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
console.log('OPERO 3.2 — bez PowerShella\n');
const pliki = ['main.js', 'silnik-per.js', 'per-service.js', 'docx-operat.js', 'licencja-offline.js', 'biblia-lokalna.js', 'xlsx-czytnik.js', 'preload.js'];
const kod = Object.fromEntries(pliki.filter(f => fs.existsSync(path.join(APP, f))).map(f => [f, fs.readFileSync(path.join(APP, f), 'utf8')]));
const bezKomentarzy = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
for (const [f, t] of Object.entries(kod)) T(`${f}: nie uruchamia powershell.exe`, !/['"`]powershell(\.exe)?['"`]/i.test(bezKomentarzy(t)) && !/EncodedCommand|ExecutionPolicy/.test(bezKomentarzy(t)));
const renderer = fs.readdirSync(path.join(APP, 'renderer')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(path.join(APP, 'renderer', f), 'utf8')).join('\n');
T('renderer: brak wywołań PowerShella', !/['"`]powershell(\.exe)?['"`]/i.test(bezKomentarzy(renderer)));
const main = kod['main.js'];
T('OCR: silnik w ukrytym, odizolowanym oknie (TextDetector), bez procesu zewnętrznego', /new TextDetector\(\)/.test(main) && /experimentalFeatures: true/.test(main) && /sandbox: true, contextIsolation: true, nodeIntegration: false, experimentalFeatures: true/.test(main));
T('OCR: gdy brak silnika — model w chmurze tylko gdy aktywny', /async function ocrPrzezChmure[\s\S]{0,80}if \(!chmuraAktywna\(\)\) return null;/.test(main));
// linie -> slowa
const m = main.match(/function ocrLinieNaSlowa[\s\S]*?\n}\n/)[0];
const ocrLinieNaSlowa = new Function(m + '; return ocrLinieNaSlowa;')();
const sl = ocrLinieNaSlowa([{ t: 'DZIAŁ I-O  OZNACZENIE', x: 100, y: 50, w: 210, h: 20 }, { t: '', x: 0, y: 0, w: 0, h: 0 }]);
T('OCR: linia rozbita na słowa z położeniem w kolejności', sl.length === 3 && sl[0].t === 'DZIAŁ' && sl[1].t === 'I-O' && sl[0].x === 100 && sl[1].x > sl[0].x && sl[2].x > sl[1].x && sl.every(w => w.y === 50 && w.h === 20), sl);
T('Excel: arkusze czyta własny czytnik, nie Excel przez PowerShell', /async function readExcelWithCom\(file\) \{\s*if \(path\.extname\(file\)\.toLowerCase\(\) !== '\.xlsx'\)/.test(main));
// rozpakowanie ZIP
const sp = kod['silnik-per.js'];
const f = sp.match(/const zipWlasny = \{[\s\S]*?\n};\n/)[0] + sp.match(/function rozpakujZip[\s\S]*?\n}\n/)[0];
const zipCzytnik = require(path.join(APP, 'xlsx-czytnik.js'));
const rozpakujZip = new Function('fs', 'path', 'require', f + '; return rozpakujZip;')(fs, path, require);
// minimalny ZIP z dwoma plikami (deflate i bez kompresji) + próba wyjścia poza katalog
function zip(wpisy){
  const lok = [], cent = []; let off = 0;
  for (const [nazwa, dane, metoda] of wpisy){
    const n = Buffer.from(nazwa), d = metoda === 8 ? zlib.deflateRawSync(dane) : dane;
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(metoda, 8); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(dane.length, 22); h.writeUInt16LE(n.length, 26);
    lok.push(h, n, d);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(metoda, 10); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(dane.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    cent.push(c, n); off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(cent), e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(wpisy.length, 8); e.writeUInt16LE(wpisy.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...lok, cd, e]);
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opero-zip-'));
try {
  fs.writeFileSync(path.join(tmp, 'a.zip'), zip([['llama/llama-server.exe', Buffer.from('X'.repeat(5000)), 8], ['llama/ggml.dll', Buffer.from('dll'), 0]]));
  rozpakujZip(path.join(tmp, 'a.zip'), path.join(tmp, 'out'));
  T('ZIP: rozpakowany własnym kodem (deflate i bez kompresji)', fs.readFileSync(path.join(tmp, 'out/llama/llama-server.exe'), 'utf8') === 'X'.repeat(5000) && fs.readFileSync(path.join(tmp, 'out/llama/ggml.dll'), 'utf8') === 'dll');
  fs.writeFileSync(path.join(tmp, 'b.zip'), zip([['../poza.txt', Buffer.from('zle'), 0]]));
  let blad = ''; try { rozpakujZip(path.join(tmp, 'b.zip'), path.join(tmp, 'out2')); } catch (e) { blad = e.message; }
  T('ZIP: plik z „../" nie wychodzi poza katalog', /Niebezpieczna/.test(blad) && !fs.existsSync(path.join(tmp, 'poza.txt')), blad);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
// zbieracz
T('zbieracz: każda odpowiedź rejestru trafia do bazy i zapamiętuje obszar', /const b = bazaDolozRcn\(r\.transakcje\); r\.bazaDodane = b\.dodane; zbieraczZapamietaj\(zapytanie, r\);/.test(main));
T('zbieracz: pracuje w tle co 6 godzin, tylko z aktywną licencją, można wyłączyć', /ZBIERACZ_CO_MS = 6 \* 3600 \* 1000/.test(main) && /zbieraczPrzebieg[\s\S]{0,300}requireActiveLicense/.test(main) && /wlaczony: z\.wlaczony !== false/.test(main));
T('zbieracz: tylko publiczny rejestr GUGiK (bez portali ofert)', !/otodom|olx|morizon|gratka|domiporta/i.test(main.slice(main.indexOf('BAZA RYNKU, KTORA BUDUJE SIE SAMA'), main.indexOf("ipcMain.handle('zbieracz:ustaw'"))));
const pre = kod['preload.js'];
T('preload: zbieraczStan, zbieraczTeraz, zbieraczUstaw, onZbieraczKoniec', ['zbieraczStan', 'zbieraczTeraz', 'zbieraczUstaw', 'onZbieraczKoniec'].every(x => pre.includes(x)));
console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

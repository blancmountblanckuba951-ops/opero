'use strict';
/**
 * OPERO — skad program bierze model, gdy nikt mu nic nie wpisal.
 *
 * To nie jest test „czy w pliku jest takie slowo". Uruchamiamy prawdziwa
 * funkcje na prawdziwych plikach, bo wlasnie na tym sie przejechalem: budowa
 * zapisala zrodlo modelu, log wygladal dobrze, a program i tak nie wiedzial,
 * co pobrac — brakowalo jednego pola, ktorego nikt nie sprawdzal.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

let zaliczone = 0, niezaliczone = 0;
function T(nazwa, warunek) {
  if (warunek) { zaliczone++; console.log(`  OK   ${nazwa}`); }
  else { niezaliczone++; console.log(`  ZLE  ${nazwa}`); }
}

// Ten sam test dziala i w repozytorium roboczym (build\app), i w paczce do
// budowy (OPERO\app) - szukamy pliku tam, gdzie akurat lezy.
const ZRODLO = [
  path.join(__dirname, '..', 'build', 'app', 'silnik-per.js'),
  path.join(__dirname, '..', 'app', 'silnik-per.js'),
].find(p => fs.existsSync(p));
if (!ZRODLO) { console.error('  Nie znalazlem silnik-per.js - nie mam czego sprawdzac.'); process.exit(2); }

/** Stawia maly, osobny swiat: app\silnik-per.js + silnik\ + podstawiony electron. */
function swiat(modelDomyslny) {
  const baza = fs.mkdtempSync(path.join(os.tmpdir(), 'opero-zrodlo-'));
  const app = path.join(baza, 'app');
  const silnik = path.join(baza, 'silnik');
  const elektron = path.join(app, 'node_modules', 'electron');
  fs.mkdirSync(elektron, { recursive: true });
  fs.mkdirSync(silnik, { recursive: true });
  fs.writeFileSync(path.join(elektron, 'package.json'), '{"name":"electron","main":"index.js"}');
  fs.writeFileSync(path.join(elektron, 'index.js'),
    `module.exports = { app: { getPath: () => ${JSON.stringify(path.join(baza, 'dane'))} } };`);
  fs.copyFileSync(ZRODLO, path.join(app, 'silnik-per.js'));
  if (modelDomyslny === 'Z_BOM') {
    // Dokladnie to, co pisze Windows PowerShell: trzy niewidoczne bajty przed
    // nawiasem. Plik wyglada poprawnie w notatniku i w kazdym podgladzie.
    fs.writeFileSync(path.join(silnik, 'model-domyslny.json'),
      '\uFEFF' + JSON.stringify({ nazwa: 'Bielik.Q4_K_M.gguf', rozmiar: 6724051552,
        suma: 'abcdef', url: ADRES_BOM, repoHf: 'speakleash/Bielik-11B-v2.5-Instruct-GGUF' }), 'utf8');
  } else if (modelDomyslny === 'USZKODZONY') {
    fs.writeFileSync(path.join(silnik, 'model-domyslny.json'), '{ to nie jest json');
  } else if (modelDomyslny !== null) {
    fs.writeFileSync(path.join(silnik, 'model-domyslny.json'), JSON.stringify(modelDomyslny, null, 2));
  }
  return require(path.join(app, 'silnik-per.js'));
}

const ADRES = 'https://huggingface.co/speakleash/Bielik-11B-v2.5-Instruct-GGUF/resolve/main/'
  + 'Bielik-11B-v2.5-Instruct.Q4_K_M.gguf?download=true';
const ADRES_BOM = ADRES;

// 1. Komplet danych — tak wyglada udana budowa.
{
  const s = swiat({ nazwa: 'Bielik-11B-v2.5-Instruct.Q4_K_M.gguf', rozmiar: 6724051552,
    suma: 'ABCDEF', url: ADRES, repoHf: 'speakleash/Bielik-11B-v2.5-Instruct-GGUF' });
  const z = s.zrodloWbudowane();
  T('pelne zrodlo jest czytane', !!z);
  T('nazwa, adres i rozmiar sa przepisane',
    z.nazwa === 'Bielik-11B-v2.5-Instruct.Q4_K_M.gguf' && z.url === ADRES && z.rozmiar === 6724051552);
  T('suma jest zapisana malymi literami', z.suma === 'abcdef');
  T('repozytorium do sprawdzania nowszych wersji jest znane',
    z.repo === 'speakleash/Bielik-11B-v2.5-Instruct-GGUF');
}

// 2. Brak nazwy pliku — dokladnie to, co wyszlo u klienta. Nazwa stoi w adresie,
//    wiec jej brak NIE MOZE unieruchamiac pobierania.
{
  const s = swiat({ rozmiar: 6724051552, suma: 'abcdef', url: ADRES,
    repoHf: 'speakleash/Bielik-11B-v2.5-Instruct-GGUF' });
  const z = s.zrodloWbudowane();
  T('brak nazwy pliku nie zatrzymuje programu', !!z);
  T('nazwa jest wyciagnieta z adresu, bez ?download=true',
    z && z.nazwa === 'Bielik-11B-v2.5-Instruct.Q4_K_M.gguf');
}

// 2b. Plik z niewidocznym znacznikiem BOM — tak zapisuje go Windows PowerShell.
//     To nie teoria: na tym wywrocil sie manifest modelu przy prawdziwej budowie,
//     a ten sam znacznik siedzial w pliku, ktory program czyta u klienta.
{
  const s = swiat('Z_BOM');
  const z = s.zrodloWbudowane();
  T('plik ze znacznikiem BOM jest czytany normalnie', !!z);
  T('dane z pliku z BOM-em sa kompletne',
    z && z.nazwa === 'Bielik.Q4_K_M.gguf' && z.url === ADRES_BOM && z.suma === 'abcdef');
}

// 3. Brak adresu — tego nie da sie niczym zastapic, wiec zrodla nie ma.
{
  const s = swiat({ nazwa: 'model.gguf', suma: 'abcdef' });
  T('bez adresu nie udajemy, ze zrodlo jest', s.zrodloWbudowane() === null);
}

// 4. Adres nie przez HTTPS — model pobierany po sieci musi isc szyfrowanym kanalem.
{
  const s = swiat({ nazwa: 'model.gguf', suma: 'abcdef', url: 'http://gdzies/model.gguf' });
  T('adres bez HTTPS jest odrzucany', s.zrodloWbudowane() === null);
}

// 5. Nie ma pliku ze zrodlem — brak nie moze wywalac programu.
{
  const s = swiat(null);
  T('brak pliku zrodla nie wywala programu', s.zrodloWbudowane() === null);
}

// 6. Uszkodzony plik — rzeczoznawca nie moze zobaczyc wyjatku.
{
  const s = swiat('USZKODZONY');
  T('uszkodzony plik zrodla nie wywala programu', s.zrodloWbudowane() === null);
}

/* ------------------------------------------------------------------------
   Wlasny model wskazany z dysku.

   Po to istnieje: kto ma juz plik .gguf nie musi pobierac tych samych szesciu
   gigabajtow drugi raz. Ale „wskaz dowolny plik" to prosta droga do tego, zeby
   asystent przestal wstawac bez slowa wyjasnienia - wiec plik sprawdzamy ZANIM
   go przyjmiemy, a nie dopiero przy pierwszym pytaniu.
   ------------------------------------------------------------------------ */
{
  const baza = fs.mkdtempSync(path.join(os.tmpdir(), 'opero-wlasny-'));
  // Test zostawial po sobie ~340 MB przy kazdym uruchomieniu - sprzatamy przy wyjsciu.
  process.on('exit', () => { try { fs.rmSync(baza, { recursive: true, force: true }); } catch {} });
  const s = swiat(null);

  /** Robi plik o podanym rozszerzeniu, naglowku i rozmiarze. */
  function plik(nazwa, naglowek, mb) {
    const p = path.join(baza, nazwa);
    const buf = Buffer.alloc(mb * 1024 * 1024);
    buf.write(naglowek, 0, 'latin1');
    fs.writeFileSync(p, buf);
    return p;
  }

  T('nieistniejacy plik jest odrzucony',
    s.ustawWlasnyModel(path.join(baza, 'nie-ma-mnie.gguf')).ok === false);

  const zly = plik('dokument.txt', 'GGUF', 101);
  const r1 = s.ustawWlasnyModel(zly);
  T('plik bez rozszerzenia .gguf jest odrzucony', r1.ok === false && /gguf/i.test(r1.blad));

  const maly = plik('maly.gguf', 'GGUF', 2);
  const r2 = s.ustawWlasnyModel(maly);
  T('plik za maly jak na model jest odrzucony', r2.ok === false && /ma[łl]y/i.test(r2.blad));

  const podszywa = plik('podszywa.gguf', 'ZIP!', 120);
  const r3 = s.ustawWlasnyModel(podszywa);
  T('plik .gguf, ktory w srodku nie jest modelem, jest odrzucony',
    r3.ok === false && /GGUF/.test(r3.blad));

  const dobry = plik('moj-model.gguf', 'GGUF', 120);
  const r4 = s.ustawWlasnyModel(dobry);
  T('prawdziwy model GGUF jest przyjety', r4.ok === true && r4.nazwa === 'moj-model.gguf');

  const w = s.wybierzModel();
  T('wskazany model wygrywa ze wszystkim innym', w && w.zrodlo === 'wlasny' && w.plik === dobry);
  T('wlasny model nie jest kopiowany, tylko wskazywany', w.plik === dobry);

  // Plik przeniesiony albo skasowany po wskazaniu nie moze wywalac programu.
  fs.unlinkSync(dobry);
  T('zniknięty plik cicho oddaje miejsce modelowi OPERO', s.wlasnyModel() === null);

  s.ustawWlasnyModel(plik('drugi.gguf', 'GGUF', 120));
  s.zapomnijWlasnyModel();
  T('„Wróć do modelu OPERO" kasuje wskazanie', s.wlasnyModel() === null);
}

/* ------------------------------------------------------------------------
   Silnik rozpakowywany z paczki.

   Po to istnieje: instalator nie moze nadpisac pliku .exe, ktory jest w uzyciu
   albo ktory system trzyma jeszcze chwile po zamknieciu. Przez to wracalo
   okienko „Blad otwarcia pliku do zapisu ... llama-server.exe". Lekarstwem nie
   jest lepsze zamykanie procesow, tylko zabranie instalatorowi tego pliku:
   w instalatorze jedzie PACZKA, a program rozpakowuje ja sobie sam.
   ------------------------------------------------------------------------ */
/** Minimalny ZIP (deflate) z plikow jednego folderu — bez zewnetrznych programow. */
function zipZPlikow(folder) {
  const zlib = require('node:zlib');
  const crcTab = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcTab[(c ^ x) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const lok = [], cent = []; let off = 0, ile = 0;
  for (const nazwa of fs.readdirSync(folder)) {
    const dane = fs.readFileSync(path.join(folder, nazwa)), d = zlib.deflateRawSync(dane), n = Buffer.from(nazwa), crc = crc32(dane);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(dane.length, 22); h.writeUInt16LE(n.length, 26);
    const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16); c.writeUInt32LE(d.length, 20); c.writeUInt32LE(dane.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    lok.push(h, n, d); cent.push(c, n); off += 30 + n.length + d.length; ile++;
  }
  const cd = Buffer.concat(cent), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(ile, 8); e.writeUInt16LE(ile, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...lok, cd, e]);
}

(async () => {
  const baza = fs.mkdtempSync(path.join(os.tmpdir(), 'opero-silnik-'));
  const app = path.join(baza, 'app');
  const zasoby = path.join(baza, 'zasoby');
  const dane = path.join(baza, 'dane');
  const elektron = path.join(app, 'node_modules', 'electron');
  fs.mkdirSync(elektron, { recursive: true });
  fs.mkdirSync(zasoby, { recursive: true });
  fs.writeFileSync(path.join(elektron, 'package.json'), '{"name":"electron","main":"index.js"}');
  fs.writeFileSync(path.join(elektron, 'index.js'),
    `module.exports = { app: { getPath: () => ${JSON.stringify(dane)} } };`);
  fs.copyFileSync(ZRODLO, path.join(app, 'silnik-per.js'));

  // Paczka taka, jaka sklada budowa: serwer, biblioteka i pliki opisowe.
  const skladniki = path.join(baza, 'skladniki');
  fs.mkdirSync(skladniki, { recursive: true });
  const nazwaSerwera = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  fs.writeFileSync(path.join(skladniki, nazwaSerwera), 'to udaje serwer modelu');
  fs.writeFileSync(path.join(skladniki, 'biblioteka.dll'), 'to udaje biblioteke');
  fs.writeFileSync(path.join(skladniki, 'LICENCJE-MODELU.txt'), 'licencja');
  // Archiwum skladamy we wlasnym kodzie (deflate z zlib) — na Windows (CI GitHuba)
  // nie ma programu `zip`, a test ma dzialac tak samo na kazdym systemie.
  fs.writeFileSync(path.join(zasoby, 'silnik.zip'), zipZPlikow(skladniki));

  process.resourcesPath = zasoby;
  const s = require(path.join(app, 'silnik-per.js'));

  T('paczka silnika jest znaleziona w zasobach programu', !!s.paczkaSilnika());
  T('przed rozpakowaniem nie ma czego uruchomic', s.plikSerwera() === null);

  const wynik = await s.rozpakujSilnik();
  T('paczka rozpakowuje sie do danych uzytkownika', wynik?.ok === true, JSON.stringify(wynik));
  T('silnik laduje POZA folderem programu', !!wynik?.folder && wynik.folder.startsWith(dane));
  T('po rozpakowaniu jest co uruchomic', !!s.plikSerwera());
  T('biblioteki tez sa na miejscu', fs.existsSync(path.join(s.folderSilnika(), 'biblioteka.dll')));
  T('pliki opisowe sa znajdowane takze w folderze programu',
    (() => { fs.mkdirSync(path.join(zasoby, 'silnik'), { recursive: true });
      fs.writeFileSync(path.join(zasoby, 'silnik', 'model.json'), '{}');
      return !!s.znajdzPlikSilnika('model.json'); })());

  const drugi = await s.rozpakujSilnik();
  T('ponowne rozpakowanie nie robi nic, gdy silnik juz jest', drugi?.juzByl === true);
  T('po rozpakowaniu nie zostaje folder tymczasowy',
    !fs.existsSync(`${s.folderSilnikaUzytkownika()}.rozpakowywanie`));

  console.log(`\n  Zaliczone: ${zaliczone}  Niezaliczone: ${niezaliczone}`);
  process.exit(niezaliczone ? 1 : 0);
})().catch(e => { console.error('BLAD testu:', e.message); process.exit(2); });

'use strict';
/**
 * OPERO 1.19.0 — silnik PER: model językowy w folderze programu.
 *
 * Co się zmieniło względem 1.17: nie ma już Ollamy. Rzeczoznawca niczego nie
 * instaluje, niczego nie pobiera i nie klika „krok 1, krok 2”. Instalator niesie
 * w sobie serwer modelu (llama-server) i sam model (plik .gguf), a program
 * uruchamia go po cichu przy starcie i gasi razem z sobą.
 *
 * Gdzie co leży:
 *   <folder programu>\resources\silnik\llama-server.exe   — serwer modelu
 *   <folder programu>\resources\silnik\model\*.gguf        — model z instalatora
 *   <dane użytkownika>\modele\*.gguf                       — nowszy model z aktualizacji
 *
 * Model z folderu danych ma pierwszeństwo: aktualizacja nie wymaga ponownej
 * instalacji programu, a odinstalowanie programu nie kasuje pobranej wersji.
 *
 * Serwer słucha WYŁĄCZNIE na 127.0.0.1 i nie wychodzi do sieci. Rozmowa z
 * modelem nie opuszcza komputera — to jest cała idea tego rozwiązania.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

/* Minimalny czytnik ZIP (katalog centralny + deflate/bez kompresji) — bez zaleznosci. */
const zipWlasny = {
  katalogZip(buf) {
    let eocd = -1;
    for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) { if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('To nie jest archiwum ZIP.');
    const ile = buf.readUInt16LE(eocd + 10); let p = buf.readUInt32LE(eocd + 16);
    const wpisy = new Map();
    for (let i = 0; i < ile; i++) {
      if (buf.readUInt32LE(p) !== 0x02014b50) break;
      const metoda = buf.readUInt16LE(p + 10), spakowany = buf.readUInt32LE(p + 20), dlN = buf.readUInt16LE(p + 28), dlE = buf.readUInt16LE(p + 30), dlK = buf.readUInt16LE(p + 32), offset = buf.readUInt32LE(p + 42);
      wpisy.set(buf.slice(p + 46, p + 46 + dlN).toString('utf8'), { metoda, spakowany, offset });
      p += 46 + dlN + dlE + dlK;
    }
    return wpisy;
  },
  rozpakuj(buf, w) {
    const o = w.offset;
    if (buf.readUInt32LE(o) !== 0x04034b50) throw new Error('Uszkodzony wpis w archiwum.');
    const start = o + 30 + buf.readUInt16LE(o + 26) + buf.readUInt16LE(o + 28);
    const dane = buf.slice(start, start + w.spakowany);
    if (w.metoda === 0) return dane;
    if (w.metoda === 8) return require('node:zlib').inflateRawSync(dane);
    throw new Error(`Nieobsługiwana metoda kompresji (${w.metoda}).`);
  },
};

function rozpakujZip(paczka, cel) {
  const zipCzytnik = zipWlasny;
  const buf = fs.readFileSync(paczka);
  const wpisy = zipCzytnik.katalogZip(buf);
  const korzen = path.resolve(cel);
  for (const [nazwa, wpis] of wpisy) {
    const docelowa = path.resolve(korzen, nazwa.replace(/\\/g, '/'));
    if (docelowa !== korzen && !docelowa.startsWith(korzen + path.sep)) throw new Error(`Niebezpieczna ścieżka w archiwum: ${nazwa}`);
    if (nazwa.endsWith('/')) { fs.mkdirSync(docelowa, { recursive: true }); continue; }
    fs.mkdirSync(path.dirname(docelowa), { recursive: true });
    fs.writeFileSync(docelowa, zipCzytnik.rozpakuj(buf, wpis));
  }
}
const { app } = require('electron');

const PORT = 11436;
const HOST = `127.0.0.1:${PORT}`;
const BAZA = `http://${HOST}`;
const CZAS_STARTU_MS = 180000;      // duży model wczytuje się nawet 2-3 minuty
const KONTEKST = 8192;

let serwer = null;
let startTrwa = null;
let pobieranieTrwa = false;
let przerwijPobieranie = null;      // ustawiane na czas pobierania
let ostatniPostep = null;           // zeby panel wiedzial, co sie dzieje

/* ---------------------------------------------------------------- ścieżki */

/**
 * SILNIK MIESZKA W DANYCH UZYTKOWNIKA, A NIE W FOLDERZE PROGRAMU.
 *
 * Powod jest jeden i konkretny: instalator nie moze nadpisac pliku .exe, ktory
 * jest wlasnie uruchomiony albo ktory system trzyma jeszcze przez chwile po
 * zamknieciu (robi tak antywirus i indeksator). Konczylo sie to za kazdym razem
 * okienkiem „Blad otwarcia pliku do zapisu ... llama-server.exe" i pytaniem
 * „Przerwij / Ponow probe / Ignoruj".
 *
 * Zadne zamykanie procesow tego nie rozwiazuje na pewno - rozwiazuje to dopiero
 * ZABRANIE INSTALATOROWI tego pliku. Instalator wklada do programu paczke
 * `silnik.zip`, czyli zwykly plik danych, ktorego nikt nigdy nie uruchamia.
 * Program rozpakowuje ja do swojego folderu danych przy pierwszym uruchomieniu.
 * Tam nie siega zaden instalator, wiec ten blad nie ma juz gdzie powstac.
 */
function folderSilnikaUzytkownika() {
  try { return path.join(app.getPath('userData'), 'silnik'); } catch { return ''; }
}

/** Paczka z silnikiem, przygotowana przy budowie i wlozona do instalatora. */
function paczkaSilnika() {
  const kandydaci = [
    path.join(process.resourcesPath || '', 'silnik.zip'),
    path.join(__dirname, '..', 'silnik.zip'),
    path.join(__dirname, '..', '..', 'silnik.zip'),
  ];
  for (const k of kandydaci) { try { if (k && fs.existsSync(k)) return k; } catch {} }
  return null;
}

function maSerwer(folder) {
  if (!folder) return false;
  const nazwa = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  try { return fs.existsSync(path.join(folder, nazwa)); } catch { return false; }
}

/** Folder z silnikiem: najpierw dane uzytkownika, potem folder programu. */
function folderSilnika() {
  const wlasny = folderSilnikaUzytkownika();
  if (maSerwer(wlasny)) return wlasny;
  const kandydaci = [
    path.join(process.resourcesPath || '', 'silnik'),
    path.join(__dirname, '..', 'silnik'),
    path.join(__dirname, '..', '..', 'silnik'),
  ];
  for (const k of kandydaci) { try { if (k && maSerwer(k)) return k; } catch {} }
  // Nic nie ma? Wskazujemy miejsce, w ktorym silnik ma sie znalezc - to tam
  // rozpakuje go `rozpakujSilnik()`.
  return wlasny || kandydaci[0];
}

/**
 * Rozpakowuje `silnik.zip` do folderu danych. Wolane przy starcie i przez
 * narzedzie naprawcze, wiec musi byc tanie, gdy wszystko juz jest.
 *
 * Rozpakowujemy OBOK, do folderu tymczasowego, i dopiero kompletna zawartosc
 * przenosimy na miejsce. Przerwane rozpakowywanie nie zostawia wtedy polowy
 * silnika, ktora wygladalaby na dzialajaca.
 */
async function rozpakujSilnik(logToFile) {
  const cel = folderSilnikaUzytkownika();
  if (!cel) return { ok: false, powod: 'BRAK_FOLDERU' };
  if (maSerwer(cel)) return { ok: true, juzByl: true, folder: cel };

  const paczka = paczkaSilnika();
  if (!paczka) return { ok: false, powod: 'BRAK_PACZKI' };

  const tymczasowy = `${cel}.rozpakowywanie`;
  try { fs.rmSync(tymczasowy, { recursive: true, force: true }); } catch {}
  fs.mkdirSync(tymczasowy, { recursive: true });

  logToFile?.('INFO', `Rozpakowuje silnik PER z ${paczka}`);
  // 3.2: rozpakowanie we wlasnym kodzie (bez PowerShella — antywirusy blokuja
  // powershell.exe uruchamiany przez programy). Sciezki w archiwum sa pilnowane:
  // zaden plik nie moze wyjsc poza katalog docelowy.
  rozpakujZip(paczka, tymczasowy);


  if (!maSerwer(tymczasowy)) {
    try { fs.rmSync(tymczasowy, { recursive: true, force: true }); } catch {}
    return { ok: false, powod: 'PACZKA_BEZ_SERWERA' };
  }
  try { fs.rmSync(cel, { recursive: true, force: true }); } catch {}
  fs.renameSync(tymczasowy, cel);
  logToFile?.('INFO', `Silnik PER gotowy w ${cel}`);
  return { ok: true, folder: cel };
}

function folderModeliUzytkownika() { return path.join(app.getPath('userData'), 'modele'); }

function plikSerwera() {
  const nazwa = process.platform === 'win32' ? 'llama-server.exe' : 'llama-server';
  const p = path.join(folderSilnika(), nazwa);
  try { return fs.existsSync(p) ? p : null; } catch { return null; }
}

/** Największy plik .gguf w folderze; przy kilku wygrywa nowszy. */
function najlepszyGguf(folder) {
  try {
    const pliki = fs.readdirSync(folder)
      .filter(n => n.toLowerCase().endsWith('.gguf'))
      .map(n => { const p = path.join(folder, n); const s = fs.statSync(p); return { nazwa: n, plik: p, rozmiar: s.size, zmieniony: s.mtimeMs }; })
      .filter(x => x.rozmiar > 1024 * 1024);
    if (!pliki.length) return null;
    pliki.sort((a, b) => b.zmieniony - a.zmieniony || b.rozmiar - a.rozmiar);
    return pliki[0];
  } catch { return null; }
}

/* --------------------------------------------------- model spoza programu */
/**
 * Wskazany recznie model .gguf.
 *
 * Po co: ktos moze juz miec model na dysku - sciagnal go do innego programu
 * albo dostal na pendrivie - i nie ma powodu, zeby pobieral te same szesc
 * gigabajtow drugi raz. Albo po prostu woli wiekszy model, bo ma mocny komputer.
 *
 * Zapisujemy SCIEZKE, a nie kopie pliku. Kopiowanie 6 GB w tle to kwadrans
 * czekania i drugie tyle miejsca na dysku - za to, zeby miec plik dwa razy.
 */
function plikWlasnegoModelu() { return path.join(folderModeliUzytkownika(), 'wlasny-model.json'); }

/** Czy plik naprawde jest modelem GGUF: cztery pierwsze bajty to „GGUF". */
function toJestGguf(sciezka) {
  let fd = null;
  try {
    fd = fs.openSync(sciezka, 'r');
    const b = Buffer.alloc(4);
    fs.readSync(fd, b, 0, 4, 0);
    return b.toString('latin1') === 'GGUF';
  } catch { return false; }
  finally { if (fd !== null) { try { fs.closeSync(fd); } catch {} } }
}

function wlasnyModel() {
  try {
    const p = plikWlasnegoModelu();
    if (!fs.existsSync(p)) return null;
    const w = czytajJson(p);
    const plik = String(w?.plik || '');
    // Plik mogl zostac przeniesiony albo skasowany po tym, jak go wskazano.
    // Wtedy po prostu go nie ma - i program wraca do swojego modelu, zamiast
    // probowac uruchomic serwer na nieistniejacej sciezce.
    if (!plik || !fs.existsSync(plik)) return null;
    const s = fs.statSync(plik);
    return { nazwa: path.basename(plik), plik, rozmiar: s.size, zmieniony: s.mtimeMs };
  } catch { return null; }
}

/** Zapisuje wskazanie na model uzytkownika. Zwraca `{ok}` albo powod odmowy. */
function ustawWlasnyModel(sciezka) {
  const p = String(sciezka || '');
  if (!p || !fs.existsSync(p)) return { ok: false, blad: 'Nie ma takiego pliku.' };
  let rozmiar = 0;
  try { rozmiar = fs.statSync(p).size; } catch { return { ok: false, blad: 'Nie udało się odczytać pliku.' }; }
  if (!/\.gguf$/i.test(p)) return { ok: false, blad: 'To nie jest plik .gguf — model dla PER-a ma takie rozszerzenie.' };
  if (rozmiar < 100 * 1024 * 1024) return { ok: false, blad: 'Plik jest za mały jak na model językowy (poniżej 100 MB).' };
  if (!toJestGguf(p)) return { ok: false, blad: 'Plik ma rozszerzenie .gguf, ale w środku nie jest modelem GGUF.' };
  fs.mkdirSync(folderModeliUzytkownika(), { recursive: true });
  fs.writeFileSync(plikWlasnegoModelu(),
    JSON.stringify({ plik: p, rozmiar, wskazano: new Date().toISOString() }, null, 2), 'utf8');
  return { ok: true, nazwa: path.basename(p), plik: p, rozmiar };
}

/** Kasuje wskazanie. Sam plik uzytkownika zostaje nietkniety - nie jest nasz. */
function zapomnijWlasnyModel() {
  try { fs.unlinkSync(plikWlasnegoModelu()); } catch {}
  return { ok: true };
}

/**
 * Model do uruchomienia. Kolejnosc jest wyborem, nie przypadkiem: recznie
 * wskazany model wygrywa ze wszystkim, bo to swiadoma decyzja czlowieka.
 */
function wybierzModel() {
  const wlasny = wlasnyModel();
  if (wlasny) return { ...wlasny, zrodlo: 'wlasny' };
  const zAktualizacji = najlepszyGguf(folderModeliUzytkownika());
  if (zAktualizacji) return { ...zAktualizacji, zrodlo: 'aktualizacja' };
  const zInstalatora = najlepszyGguf(path.join(folderSilnika(), 'model'));
  if (zInstalatora) return { ...zInstalatora, zrodlo: 'instalator' };
  return null;
}

/** Ile wątków dać modelowi: zostawiamy rdzenie na program i system. */
function watki() {
  const n = Math.max(1, os.cpus()?.length || 4);
  return Math.max(2, Math.min(8, n - 2));
}

/* ------------------------------------------------------------- uruchomienie */

async function serwerOdpowiada(ms = 2500) {
  const c = new AbortController(); const t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(`${BAZA}/health`, { signal: c.signal }); return r.ok; }
  catch { return false; }
  finally { clearTimeout(t); }
}

function czekaj(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Uruchamia serwer modelu. Wołane przy starcie programu i przed każdym pytaniem —
 * dlatego musi być idempotentne i tanie, gdy serwer już stoi.
 */
async function uruchom(logToFile) {
  if (await serwerOdpowiada(1200)) return { ok: true, juzDzialal: true, port: PORT };
  if (startTrwa) return startTrwa;

  startTrwa = (async () => {
    // Silnik rozpakowuje sie przy pierwszym uruchomieniu po instalacji. Robimy
    // to tutaj, a nie w instalatorze, zeby instalator nigdy nie dotykal pliku
    // .exe, ktory moze byc akurat w uzyciu.
    if (!plikSerwera()) { try { await rozpakujSilnik(logToFile); } catch (e) { logToFile?.('ERROR', 'Rozpakowanie silnika', String(e?.message || e)); } }
    const exe = plikSerwera();
    const model = wybierzModel();
    if (!exe) return { ok: false, powod: 'BRAK_SILNIKA' };
    if (!model) return { ok: false, powod: 'BRAK_MODELU' };

    const args = [
      '--model', model.plik,
      '--host', '127.0.0.1',
      '--port', String(PORT),
      '--ctx-size', String(KONTEKST),
      '--threads', String(watki()),
      '--no-webui',
    ];
    try {
      serwer = spawn(exe, args, { cwd: path.dirname(exe), stdio: 'ignore', windowsHide: true });
      serwer.on('exit', (kod) => { if (logToFile) logToFile('INFO', `Silnik PER zakonczyl sie (${kod}).`); serwer = null; });
      serwer.on('error', (e) => { if (logToFile) logToFile('ERROR', 'Silnik PER', String(e?.message || e)); serwer = null; });
    } catch (e) {
      return { ok: false, powod: 'URUCHOMIENIE', blad: String(e?.message || e) };
    }

    const koniec = Date.now() + CZAS_STARTU_MS;
    while (Date.now() < koniec) {
      if (await serwerOdpowiada(2000)) {
        if (logToFile) logToFile('INFO', `Silnik PER gotowy: ${model.nazwa} (${model.zrodlo}).`);
        return { ok: true, port: PORT, model: model.nazwa };
      }
      if (!serwer) return { ok: false, powod: 'SERWER_PADL' };
      await czekaj(1500);
    }
    return { ok: false, powod: 'TIMEOUT' };
  })().finally(() => { startTrwa = null; });

  return startTrwa;
}

function zatrzymaj() {
  if (!serwer) return;
  try { serwer.kill(); } catch {}
  serwer = null;
}

/* ------------------------------------------------------------------ status */

async function status() {
  const exe = plikSerwera();
  const model = wybierzModel();
  const dziala = await serwerOdpowiada(1200);
  return {
    jest: !!exe && !!model,
    silnik: !!exe,
    model: model ? { nazwa: model.nazwa, rozmiar: model.rozmiar, zrodlo: model.zrodlo, zmieniony: model.zmieniony, plik: model.plik } : null,
    serwerDziala: dziala,
    port: PORT,
    baza: BAZA,
    folderModeli: folderModeliUzytkownika(),
    pobieranieTrwa,
    postep: ostatniPostep,
  };
}

/**
 * Wbudowane zrodlo modelu — plik model-domyslny.json lezy obok silnika i
 * powstaje przy budowie z tych samych danych, z ktorych pobrano model.
 *
 * Po to istnieje: swiezo zainstalowany program ma pobrac model SAM, bez
 * pytania kogokolwiek o adres. Wczesniej program nie wiedzial, skad go wziac,
 * i mowil „nie wskazano, skad go pobrac" — czyli byl bezuzyteczny do czasu, az
 * ktos recznie wpisal adres.
 */
/**
 * Czyta plik JSON odporny na ZNACZNIK KOLEJNOSCI BAJTOW (BOM).
 *
 * Windows PowerShell przy zapisie UTF-8 dopisuje na poczatku pliku trzy
 * niewidoczne bajty. Czlowiek ich nie widzi, a `JSON.parse` przewraca sie na
 * nich komunikatem „Unexpected token". Pliki opisujace model powstaja wlasnie
 * w PowerShellu i jada do klienta, wiec program musi je przeczytac takze
 * wtedy, gdy ten znacznik tam jest - inaczej asystent milczy bez powodu,
 * ktorego da sie domyslic.
 */
function czytajJson(sciezka) {
  const tekst = fs.readFileSync(sciezka, 'utf8');
  return JSON.parse(tekst.charCodeAt(0) === 0xFEFF ? tekst.slice(1) : tekst);
}

/** Nazwa pliku wyciagnieta z adresu - bez parametrow po znaku zapytania. */
function nazwaZAdresu(url) {
  try {
    const sciezka = new URL(url).pathname;
    return decodeURIComponent(sciezka.split('/').filter(Boolean).pop() || '');
  } catch { return ''; }
}

/**
 * Szuka pliku opisowego silnika. Pliki .json jada w instalatorze LUZEM, obok
 * paczki: to zwykly tekst, ktorego nikt nie uruchamia, a dzieki temu program
 * wie, skad pobrac model, jeszcze zanim cokolwiek rozpakuje.
 */
function znajdzPlikSilnika(nazwa) {
  const miejsca = [
    folderSilnikaUzytkownika(),
    path.join(process.resourcesPath || '', 'silnik'),
    path.join(__dirname, '..', 'silnik'),
    path.join(__dirname, '..', '..', 'silnik'),
  ];
  for (const m of miejsca) {
    if (!m) continue;
    const p = path.join(m, nazwa);
    try { if (fs.existsSync(p)) return p; } catch {}
  }
  return null;
}

function zrodloWbudowane() {
  try {
    const p = znajdzPlikSilnika('model-domyslny.json');
    if (!p) return null;
    const m = czytajJson(p);
    const url = String(m?.url || '');
    if (!/^https:\/\//i.test(url)) return null;
    // Nazwa pliku jest w adresie, wiec brak pola `nazwa` nie moze unieruchamiac
    // pobierania: wyciagamy ja z adresu. (Zdarzylo sie to przy starszym
    // ZAMEK.json bez nazwy pliku - program milczal, choc adres znal.)
    const nazwa = String(m?.nazwa || '') || nazwaZAdresu(url);
    if (!nazwa) return null;
    return {
      nazwa, rozmiar: Number(m.rozmiar) || 0,
      suma: String(m.suma || '').toLowerCase(), opis: String(m.opis || ''),
      url: String(m.url),
      // `repo` czyta sprawdzanie nowszych wersji u zrodla, `repoHf` zostaje dla
      // czytelnosci pliku — to ta sama wartosc.
      repo: String(m.repoHf || m.repo || ''), repoHf: String(m.repoHf || m.repo || ''),
      czesci: [],
    };
  } catch { return null; }
}

/* ------------------------------------------------------------- aktualizacja */

/** SHA-256 duzego pliku strumieniem — kilku gigabajtow nie wczytujemy do pamieci. */
function sumaPliku(sciezka) {
  return new Promise((ok, zle) => {
    const h = crypto.createHash('sha256');
    const we = fs.createReadStream(sciezka);
    we.on('data', c => h.update(c));
    we.on('error', zle);
    we.on('end', () => ok(h.digest('hex')));
  });
}


/**
 * Pobiera nowszy model do folderu danych. Plik ląduje najpierw jako `.czesc`,
 * a dopiero kompletny dostaje właściwą nazwę — przerwane pobieranie nigdy nie
 * podmieni działającego modelu na połowę pliku.
 */
/**
 * Pobranie modelu — w jednym kawalku albo w czesciach.
 *
 * Dlaczego w czesciach: pojedynczy zalacznik wydania na GitHubie moze miec
 * najwyzej 2 GB, a model wazy ponad 6. Budowa dzieli go wiec na pliki po
 * ok. 1,8 GB. Tutaj sciagamy je po kolei i skladamy z powrotem w jeden plik.
 *
 * `zrodlo` to albo adres pojedynczego pliku .gguf, albo lista czesci:
 *   { nazwa, suma, czesci: [{ url, rozmiar, suma }] }
 *
 * Kazda czesc jest sprawdzana suma kontrolna OSOBNO, a gotowy model jeszcze raz
 * w calosci. Dzieki temu urwane pobieranie nigdy nie podmieni dzialajacego
 * modelu na polowe pliku, a przerwana wczesniej praca nie zaczyna sie od zera:
 * czesci, ktore juz leza na dysku i maja zgodna sume, pomijamy.
 */
async function pobierzModel(zrodlo, naPostep, logToFile, oczekiwanaSuma = '') {
  if (pobieranieTrwa) return { ok: false, powod: 'JUZ_TRWA' };

  // Jeden adres czy lista czesci — sprowadzamy oba przypadki do jednej postaci.
  let nazwa = '', czesci = [], sumaCalosci = String(oczekiwanaSuma || '').toLowerCase();
  if (zrodlo && typeof zrodlo === 'object' && Array.isArray(zrodlo.czesci) && zrodlo.czesci.length) {
    nazwa = String(zrodlo.nazwa || '').trim();
    sumaCalosci = String(zrodlo.suma || sumaCalosci || '').toLowerCase();
    czesci = zrodlo.czesci.map(c => ({ url: String(c?.url || ''), suma: String(c?.suma || '').toLowerCase(), rozmiar: Number(c?.rozmiar) || 0 }));
    if (!czesci.every(c => /^https:\/\//i.test(c.url))) return { ok: false, powod: 'ZLY_ADRES' };
  } else {
    const adres = String(zrodlo || '').trim();
    if (!/^https:\/\//i.test(adres)) return { ok: false, powod: 'ZLY_ADRES' };
    nazwa = (adres.split('/').pop() || 'model.gguf').split('?')[0];
    czesci = [{ url: adres, suma: sumaCalosci, rozmiar: 0 }];
  }
  if (!nazwa.toLowerCase().endsWith('.gguf')) return { ok: false, powod: 'NIE_GGUF' };

  pobieranieTrwa = true;
  const folder = folderModeliUzytkownika();
  const cel = path.join(folder, nazwa);
  const roboczy = path.join(folder, `${nazwa}.czesci`);
  const t = setTimeout(() => {}, 0); clearTimeout(t);
  try {
    fs.mkdirSync(roboczy, { recursive: true });
    const razemBajtow = czesci.reduce((a, c) => a + c.rozmiar, 0);
    let juzPobrane = 0;
    const pliki = [];

    for (let i = 0; i < czesci.length; i++) {
      const cz = czesci[i];
      const plikCzesci = path.join(roboczy, `${nazwa}.${String(i + 1).padStart(3, '0')}`);
      pliki.push(plikCzesci);

      // Co juz lezy na dysku? Trzy przypadki, bo kazdy znaczy co innego:
      //   plik CALY i zgodny     -> pomijamy, nie sciagamy drugi raz,
      //   plik CALY i niezgodny  -> kasujemy, bo jest uszkodzony,
      //   plik NIEPELNY          -> ZOSTAWIAMY i dociagamy reszte (Range).
      // Wczesniej kasowalem tez niepelny i kazde zerwane lacze zaczynalo
      // 6 GB od poczatku. Przy takim pliku to roznica miedzy „chwila" a „dzien".
      if (fs.existsSync(plikCzesci)) {
        const naDysku = fs.statSync(plikCzesci).size;
        const wyglądaNaCala = cz.rozmiar ? naDysku >= cz.rozmiar : true;
        if (cz.suma && wyglądaNaCala) {
          if (naPostep) naPostep({ etap: 'sprawdzanie', czesc: i + 1, czesci: czesci.length, pobrane: juzPobrane, razem: razemBajtow });
          if (await sumaPliku(plikCzesci) === cz.suma) {
            juzPobrane += cz.rozmiar || naDysku;
            if (logToFile) logToFile('INFO', `Czesc ${i + 1}/${czesci.length} juz byla pobrana.`);
            continue;
          }
          try { fs.unlinkSync(plikCzesci); } catch {}
        }
      }

      const przerwij = new AbortController();
      przerwijPobieranie = () => { try { przerwij.abort(); } catch {} };
      const limit = setTimeout(() => przerwij.abort(), 6 * 60 * 60 * 1000);
      try {
        // Wznawianie. Przy pliku 6 GB zerwane lacze nie moze oznaczac „od nowa",
        // wiec mowimy serwerowi, od ktorego bajtu ma wysylac dalej, i dopisujemy
        // do tego, co juz lezy na dysku. Gdy serwer tego nie potrafi (odpowiada
        // 200 zamiast 206), zaczynamy plik od poczatku — ale swiadomie, a nie
        // przez pomylke dopisujac do polowy.
        let juzNaDysku = 0;
        try { if (fs.existsSync(plikCzesci)) juzNaDysku = fs.statSync(plikCzesci).size; } catch {}
        const naglowki = juzNaDysku > 0 ? { Range: `bytes=${juzNaDysku}-` } : undefined;
        const r = await fetch(cz.url, { signal: przerwij.signal, redirect: 'follow', headers: naglowki });
        if (!r.ok || !r.body) throw new Error(`HTTP ${r.status}`);
        const wznowione = juzNaDysku > 0 && r.status === 206;
        if (juzNaDysku > 0 && !wznowione) juzNaDysku = 0;     // serwer nie umie — od poczatku
        if (wznowione && logToFile) logToFile('INFO', `Wznawiam pobieranie od ${Math.round(juzNaDysku / 1048576)} MB.`);
        const tejCzesci = Number(r.headers.get('content-length') || 0) + juzNaDysku || cz.rozmiar || 0;
        const strumien = fs.createWriteStream(plikCzesci, wznowione ? { flags: 'a' } : {});
        let wTejCzesci = juzNaDysku, ostatni = 0;
        for await (const kawalek of r.body) {
          strumien.write(Buffer.from(kawalek));
          wTejCzesci += kawalek.length;
          const teraz = Date.now();
          if (naPostep && teraz - ostatni > 400) {
            ostatni = teraz;
            ostatniPostep = { etap: 'model', czesc: i + 1, czesci: czesci.length,
              pobrane: juzPobrane + wTejCzesci, razem: razemBajtow || (tejCzesci * czesci.length) };
            naPostep(ostatniPostep);
          }
        }
        await new Promise((ok2, zle2) => { strumien.end(err => err ? zle2(err) : ok2()); });
        if (tejCzesci && wTejCzesci < tejCzesci) throw new Error(`Pobieranie urwalo sie w polowie (${Math.round(wTejCzesci / 1048576)} z ${Math.round(tejCzesci / 1048576)} MB).`);
        if (cz.suma) {
          if (naPostep) naPostep({ etap: 'sprawdzanie', czesc: i + 1, czesci: czesci.length, pobrane: juzPobrane + wTejCzesci, razem: razemBajtow });
          if (await sumaPliku(plikCzesci) !== cz.suma) throw new Error(`Czesc ${i + 1} ma inna sume kontrolna niz zapowiadal manifest.`);
        }
        juzPobrane += wTejCzesci;
      } finally { clearTimeout(limit); przerwijPobieranie = null; }
    }

    // Skladanie. Piszemy do pliku z innym rozszerzeniem — dopiero gotowy i
    // sprawdzony dostaje wlasciwa nazwe, wiec program nigdy nie zobaczy polowy.
    const skladany = `${cel}.sklejanie`;
    if (naPostep) naPostep({ etap: 'skladanie', pobrane: juzPobrane, razem: razemBajtow });
    await new Promise((gotowe, zle2) => {
      const wy = fs.createWriteStream(skladany);
      wy.on('error', zle2);
      wy.on('close', gotowe);
      (function dalej(i) {
        if (i >= pliki.length) return wy.end();
        const we = fs.createReadStream(pliki[i]);
        we.on('error', zle2);
        we.on('end', () => dalej(i + 1));
        we.pipe(wy, { end: false });
      })(0);
    });

    if (sumaCalosci) {
      if (naPostep) naPostep({ etap: 'sprawdzanie', pobrane: juzPobrane, razem: razemBajtow });
      const policzona = await sumaPliku(skladany);
      if (policzona !== sumaCalosci) {
        try { fs.unlinkSync(skladany); } catch {}
        throw new Error('Zlozony model ma inna sume kontrolna niz zapowiadal manifest.');
      }
      if (logToFile) logToFile('INFO', `Suma modelu zgodna: ${policzona}.`);
    }

    try { if (fs.existsSync(cel)) fs.unlinkSync(cel); } catch {}
    fs.renameSync(skladany, cel);
    const rozmiar = fs.statSync(cel).size;
    // Czesci juz niepotrzebne — model wazy swoje, nie trzymamy go dwa razy.
    try { fs.rmSync(roboczy, { recursive: true, force: true }); } catch {}
    if (logToFile) logToFile('INFO', `Nowy model PER: ${nazwa} (${Math.round(rozmiar / 1048576)} MB, czesci: ${czesci.length}).`);
    // Od tej chwili ma odpowiadać nowy model, więc stary serwer musi zgasnąć.
    zatrzymaj();
    return { ok: true, plik: cel, nazwa, rozmiar };
  } catch (e) {
    // Czesci ZOSTAJA na dysku: przy kolejnej probie pobieranie ruszy od miejsca,
    // w ktorym stanelo, zamiast sciagac 6 GB od nowa.
    return { ok: false, powod: 'POBIERANIE', blad: String(e?.message || e) };
  } finally { pobieranieTrwa = false; przerwijPobieranie = null; ostatniPostep = null; }
}

/** Zatrzymanie pobierania. Czesci zostaja, wiec mozna wrocic do tego pozniej. */
function zatrzymajPobieranie() {
  if (!pobieranieTrwa) return { ok: false, powod: 'NIC_NIE_TRWA' };
  try { przerwijPobieranie?.(); } catch {}
  return { ok: true };
}

/** Kasuje model pobrany przez aktualizację — program wraca do tego z instalatora. */
function usunAktualizacje() {
  const folder = folderModeliUzytkownika();
  let usuniete = 0;
  try {
    for (const n of fs.readdirSync(folder)) {
      const maly = n.toLowerCase();
      const pelna = path.join(folder, n);
      // Kasujemy takze niedokonczone pobrania: folder z czesciami i plik w
      // trakcie skladania. Inaczej zostawalyby po nich gigabajty.
      if (maly.endsWith('.czesci')) {
        try { fs.rmSync(pelna, { recursive: true, force: true }); usuniete++; } catch {}
      } else if (maly.endsWith('.gguf') || maly.endsWith('.gguf.czesc') || maly.endsWith('.sklejanie')) {
        try { fs.unlinkSync(pelna); usuniete++; } catch {}
      }
    }
  } catch {}
  if (usuniete) zatrzymaj();
  return { ok: true, usuniete };
}

module.exports = {
  PORT, BAZA,
  uruchom, zatrzymaj, status,
  pobierzModel, zatrzymajPobieranie, usunAktualizacje,
  folderSilnika, folderSilnikaUzytkownika, paczkaSilnika, rozpakujSilnik, znajdzPlikSilnika, plikSerwera,
  folderModeliUzytkownika, wybierzModel, zrodloWbudowane,
  ustawWlasnyModel, zapomnijWlasnyModel, wlasnyModel,
};

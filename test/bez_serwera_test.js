'use strict';
// Paczka zrodel trzyma program w app\\, repozytorium robocze w build\\app\\.
// Testy musza dzialac w obu ukladach, inaczej build na GitHubie wywala sie
// na samych testach, zanim w ogole dojdzie do instalatora.
const APP_DIR = (() => {
  const f = require('node:fs'), p = require('node:path');
  const a = p.join(__dirname, '..', 'build', 'app');
  return f.existsSync(a) ? a : p.join(__dirname, '..', 'app');
})();
// OPERO 1.14.0 — program ma stać o własnych siłach. Ten test pilnuje jednej
// rzeczy, której nie widać w interfejsie: czy gdziekolwiek został adres cudzego
// serwera i czy licencja nadal da się sprawdzić bez sieci.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const APP = APP_DIR;
const K = (...p) => fs.readFileSync(path.join(APP, ...p), 'utf8');
// Pliki budowy (buduj.ps1, narzedzia\) leza obok folderu programu — raz w
// paczce zrodel, raz w repozytorium roboczym. Gdy ich nie ma, zwracamy pusty
// tekst, zeby test nie wywracal sie na ukladzie katalogow.
const K2 = (wzgledna) => {
  for (const baza of [path.join(APP, '..'), path.join(APP, '..', '..'), path.join(__dirname, '..')]) {
    const pelna = path.join(baza, wzgledna);
    try { if (fs.existsSync(pelna)) return fs.readFileSync(pelna, 'utf8'); } catch {}
  }
  return '';
};

let ok = 0, zle = 0;
const T = (n, w) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n); } };

const pliki = [];
(function zbierz(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') zbierz(p); }
    else if (/\.(js|json|html|css)$/.test(e.name)) pliki.push(p);
  }
})(APP);

const main = K('main.js'), preload = K('preload.js'), app = K('renderer', 'app.js');
const html = K('renderer', 'index.html'), style = K('renderer', 'styles.css'), cfg = JSON.parse(K('config.production.json'));
const usluga = K('per-service.js'), biblia = K('biblia-lokalna.js');
const pkg = JSON.parse(K('package.json'));

console.log('OPERO bez serwera\n');

/* --- wersja --- */
T(`program i konfiguracja maja ten sam numer wersji (${pkg.version})`,
  /^\d+\.\d+\.\d+$/.test(String(pkg.version || '')) && pkg.version === cfg.productVersion);

/* --- zero adresow Supabase --- */
const zSupabase = pliki.filter(p => {
  // Zamrożone paczki silnika zostają nietknięte — i tak nie wołają sieci.
  if (/calc\.bundle\.js|report\.bundle\.js/.test(p)) return false;
  return /supabase\.co|supabase\.com/i.test(fs.readFileSync(p, 'utf8'));
});
// Od 1.25 program NIE MA serwera licencji. Zaden adres dostawcy chmury nie ma
// prawa zostac w zrodlach - ani w kodzie, ani w konfiguracji produkcyjnej.
T('program nie ma wpisanego zadnego adresu Supabase',
  zSupabase.length === 0
  || (console.log('   \u2192', zSupabase.join(', ')), false));
T('konfiguracja nie ma juz pola adresu aktywacji',
  !('aktywacjaUrl' in cfg));
// Komentarze pomijamy - w nich stara nazwa pola pada przy okazji wyjasnienia,
// nie wywolania.
const bezKomentarzy = (t) => t.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
T('w kodzie nie zostala wymiana kodu na licencje', (() => {
  const kod = bezKomentarzy(main);
  return !/wymienKod/.test(kod) && !/aktywacjaUrl/.test(kod)
    || (console.log('   \u2192 zostal slad po serwerze aktywacji'), false);
})());

// Program ma prawo siegnac do sieci tylko w trzech sprawach i zadna z nich nie
// wysyla danych operatu: jednorazowa aktywacja licencji, sprawdzenie nowszej
// wersji programu oraz pliki wskazane w ustawieniach (nowszy model). Adres
// ksiag wieczystych otwiera sie w przegladarce uzytkownika - program niczego
// tam nie wysyla. Kazdy inny adres wpisany na sztywno to powod do alarmu.
T('poza licencja program nie ma wpisanych zadnych innych uslug', (() => {
  // huggingface.co doszlo w 1.23.0, registry.ollama.ai w 1.24.0: to DWIE drogi
  // po ten sam plik modelu, bo jedno zrodlo to jeden punkt, w ktorym wszystko
  // sie zatrzymuje. Zadne dane operatu tam nie ida — program pyta o spis plikow
  // i pobiera plik .gguf.
  const DOZWOLONE = [/supabase\.co/, /api\.github\.com/, /huggingface\.co/,
    /registry\.ollama\.ai/, /ekw\.ms\.gov\.pl/, /^https:\/\/\.\.\./];
  const adresy = (bezKomentarzy(main).match(/https:\/\/[^'"`\s)]+/g) || []);
  const obce = adresy.filter(a => !DOZWOLONE.some(d => d.test(a)));
  return obce.length === 0 || (console.log('   → obce adresy:', obce.join(', ')), false);
})());
T('po aktywacji sprawdzenie jest lokalne, bez pytania serwera',
  /async function verifyCurrentLicense\(\) \{ return stanLicencji\(true\); \}/.test(main));
T('konfiguracja nie zna serwera licencyjnego ani Biblii',
  !('licenseGatewayUrl' in cfg) && !('knowledgeGatewayUrl' in cfg) && !('licensePurchaseUrl' in cfg) && !('licenseRecoveryUrl' in cfg));
T('program nie wysyła już klucza do potwierdzenia',
  !/\/verify|\/activate|licenseGatewayUrl/.test(main));
T('zniknął okres łaski offline — nie ma czego odwieszać',
  !/licenseOfflineGraceHours/.test(main) && !/72 godzin/.test(html));

/* --- licencja na miejscu --- */
const L = require(APP_DIR + '/licencja-offline.js');
T('jest moduł licencji offline', typeof L.sprawdz === 'function' && typeof L.wydaj === 'function');
T('główny proces sprawdza klucz tym modułem',
  /require\('\.\/licencja-offline\.js'\)/.test(main) && /licencja\.sprawdz\(/.test(main));
T('program nie nosi klucza prywatnego',
  !pliki.some(p => /PRIVATE KEY/.test(fs.readFileSync(p, 'utf8'))));
T('klucz publiczny jest prawdziwy i daje się wczytać', (() => {
  try { crypto.createPublicKey({ key: Buffer.from(L.KLUCZ_PUBLICZNY, 'base64'), format: 'der', type: 'spki' }); }
  catch { return false; }
  return !/PLACEHOLDER/.test(L.KLUCZ_PUBLICZNY);
})());
T('stary krótki kod jest rozpoznawany i wytłumaczony',
  /\^OPERO-\[A-Z2-9\]\{4\}/.test(main) && /stary kod aktywacyjny/.test(main));
T('program mówi wprost, że klucz działa bez internetu',
  /działa bez internetu/.test(main) && /kod tego urządzenia/.test(main));
T('cofnięty zegar jest zauważany', /clock_error/.test(main) && /zegar/i.test(main));

/* --- Biblia w instalatorze --- */
T('Biblia jedzie w programie, a nie z serwera',
  /zasoby', 'biblia\.json'/.test(main) && /function bibliaZasiej/.test(main));
T('moduł Biblii nie umie już „pobierać” z sieci',
  /wgrajZProgramu/.test(biblia) && !/knowledgeRequest/.test(biblia));
T('Agrafek odpowiada z Biblii na dysku', /odpowiedzZBiblii/.test(main) && !/knowledgeRequest/.test(usluga));
T('egzamin liczy się na tym komputerze', /egzaminPrzyjmij/.test(main) && /lokalny: true/.test(main));

/* --- aktualizacje z GitHuba --- */
T('program szuka nowej wersji w wydaniach GitHuba',
  /api\.github\.com\/repos\/\$\{repo\}\/releases\/latest/.test(main));
T('pobranie prowadzi wyłącznie na GitHuba, nie gdziekolwiek',
  main.includes('(github\\.com|objects\\.githubusercontent\\.com)'));
T('mostek wystawia sprawdzanie aktualizacji', /sprawdzAktualizacje/.test(preload));

/* --- panel Agrafka jak w EPilot --- */
T('panel pokazuje kontekst pracy', /id="agrafekKontekst"/.test(html) && /agrafekKontekstOpis/.test(app));
T('są trzy tryby odpowiedzi', ['szybki', 'standard', 'gleboki'].every(x => html.includes(`data-agrafek-tryb="${x}"`)));
T('tryb szybki i brak modelu idą do samej Biblii', /agrafekTryb==='szybki' \|\| !agrafekStatus\?\.active\) return askPiorekKnowledge/.test(app));
T('tryb głęboki prosi o wgląd w operat', /glebokie:agrafekTryb==='gleboki'/.test(app));
T('na dole widać, czym Agrafek myśli', /id="agrafekPasekModelu"/.test(html) && /agrafekOdswiezPasekModelu/.test(app));
T('brak modelu tłumaczy się sam, zamiast milczeć', /Tryb wbudowany — bez modelu/.test(app));

/* --- samouczek --- */
// 1.19.0: samouczek przestal byc reflektorem po zywym programie i jest osobnym
// ekranem. Dlatego nie pytamy juz o liczbe „krokow z celem" ani o zdanie
// „Patrz na glowne okno" - pytamy o to, czym samouczek jest teraz.
T('samouczek to osobny ekran, nie reflektor po programie',
  /id="tutorScreen"/.test(html) && !/coach-?spotlight|tutorialOverlay/i.test(html + app));
T('tematow jest tyle, ile program ma do wytlumaczenia',
  (app.match(/\{dzial:'/g) || []).length >= 15);
T('kazdy temat ma rozwiniety opis, a nie jedno zdanie',
  (app.match(/akapity:\[/g) || []).length === (app.match(/\{dzial:'/g) || []).length);
T('tematy sa pogrupowane w dzialy', new Set((app.match(/\{dzial:'[^']+'/g) || [])).size >= 4);
T('widać numer kroku', /KROK \$\{krokPrzewodnika\+1\} Z/.test(app));
T('samouczek mówi, gdzie w oknie tego szukac',
  /TUTOR_OBSZARY/.test(app) && /id="tutorMapaOpis"/.test(html) && /id="tutorialGdzie"/.test(html));
T('da się wyłączyć pokazywanie przy starcie', /id="tutorialPrzyStarcie"/.test(html) && /setTutorialDone\(!e\.target\.checked\)/.test(app));
T('strzałki i Escape obsługiwane', /ArrowRight'\)\{ e\.preventDefault\(\); ruchPrzewodnika\(1\)/.test(app));

/* --- model pobiera sie TYLKO z przycisku --- */
// Program zna adres modelu od razu po instalacji (silnik\model.json), ale nie
// siega po 6 GB sam z siebie. Decyduje czlowiek, klikajac w panelu PER - bo to
// on wie, czy siedzi na swiatlowodzie, czy na telefonie w terenie.
T('program wie, skad wziac model, bez pytania sieci o adres',
  /function manifestZInstalatora/.test(main) && /znajdzPlikSilnika\('model\.json'\)/.test(main));
T('program NIE pobiera modelu sam z siebie',
  !/zadbajOModelWTle/.test(main) && !/pobieranieModeluAuto/.test(main));
T('przy starcie wstaje tylko silnik, nic sie nie pobiera', (() => {
  const i = main.lastIndexOf('app.whenReady');
  const blok = main.slice(i, i + 600);
  return /silnikPer\.uruchom/.test(blok) && !/pobierzModel/.test(blok);
})());
T('pobieranie 6 GB wznawia sie, zamiast zaczynac od zera', (() => {
  const silnik = K('silnik-per.js');
  return /Range: `bytes=\$\{juzNaDysku\}-`/.test(silnik) && /flags: 'a'/.test(silnik);
})());
T('niepelny plik zostaje na dysku, zamiast byc kasowany', (() => {
  const silnik = K('silnik-per.js');
  // Kasujemy TYLKO plik, ktory wyglada na caly i ma zla sume.
  return /wyglądaNaCala/.test(silnik) && /if \(cz\.suma && wyglądaNaCala\)/.test(silnik);
})());
T('pobieranie da sie zatrzymac', /function zatrzymajPobieranie/.test(K('silnik-per.js'))
  && /per:zatrzymaj-pobieranie/.test(main) && /perZatrzymajPobieranie/.test(preload));
T('program sprawdza u zrodla, czy jest nowszy model',
  /function nowszyUZrodla/.test(main) && /api\/models\/\$\{repo\}\/tree\/main/.test(main));
T('nowszy model tez ma sume kontrolna do sprawdzenia',
  /lfs\?\.oid/.test(main) && /replace\(\/\^sha256:\/, ''\)/.test(main));
T('panel pokazuje pobieranie w toku, a nie „modelu nie ma"',
  /pobieranieTrwa/.test(app) && /Pobieram model…/.test(app) && /data-stan="pobieranie"/.test(style));

/* --- 1.23.0: model pobiera sie SAM, bez zadnej konfiguracji --- */
// Program mowil „nie wskazano, skad go pobrac" i stal bezczynnie. To nie byl
// drobiazg tylko blad w pomysle: swiezo zainstalowany OPERO musi wiedziec, skad
// wziac model, NIE PYTAJAC o nic. Adres jest znany juz przy budowie — stamtad
// model zostal sciagniety — wiec jedzie z programem jako zrodlo wbudowane.
T('silnik umie odczytac zrodlo wbudowane', /function zrodloWbudowane/.test(K('silnik-per.js')));
T('wbudowane zrodlo jest ostatnia deska ratunku, a nie pierwsza', (() => {
  const i = main.indexOf('async function skadPobracModel');
  const blok = main.slice(i, i + 900);
  return blok.indexOf('adresManifestuModelu') < blok.indexOf('manifestZInstalatora')
      && blok.indexOf('manifestZInstalatora') < blok.indexOf('zrodloWbudowane');
})());
// Zrodlo modelu nie moze zalezec WYLACZNIE od pliku zrobionego przy budowie.
// Gdy tamtego zabraknie, program ma znalezc model sam - inaczej rzeczoznawca
// zostaje z komunikatem i bez przycisku.
T('gdy zabraknie wszystkich plikow, program pyta zrodla wprost',
  /async function modelZHuggingFace/.test(main) && /MODELE_ZAPASOWE/.test(main)
  && /return \(await modelZHuggingFace\(\)\) \|\| \(await modelZOllama\(\)\);/.test(main));
T('zapasowe zrodla maja tylko licencje, ktore wolno sprzedawac', (() => {
  const i = main.indexOf('const MODELE_ZAPASOWE');
  const blok = main.slice(i, main.indexOf('];', i));
  return /Bielik/.test(blok) && /Qwen/.test(blok) && !/[Ll]lama-/.test(blok);
})());
T('bez sumy kontrolnej nie pobieramy nic', (() => {
  const i = main.indexOf('async function modelZHuggingFace');
  const blok = main.slice(i, i + 1200);
  return /if \(!suma\) continue;/.test(blok);
})());
/* --- 1.24.0: ustawienia, profil, wlasny model --- */
T('w ustawieniach nie ma juz kupowania czasu ani wczytywania pliku',
  !/settingsBuyLicense/.test(html) && !/settingsImportLicense/.test(html));
T('jest profil rzeczoznawcy zapisywany poza operatem',
  /ipcMain\.handle\('profil:zapisz'/.test(main) && /profilRzeczoznawcy/.test(main));
T('nowy operat dostaje dane autora z profilu',
  /wstawProfilDoNowego\(\);renderAll\(\)/.test(app) && /function wstawProfilDoNowego/.test(app));
T('profil nie nadpisuje tego, co juz wpisane', (() => {
  const i = app.indexOf('function wstawProfilDoNowego');
  const blok = app.slice(i, i + 600);
  return /if\(!a\.name && profilCache\.name\)/.test(blok);
})());
T('da sie wskazac wlasny model .gguf',
  /ipcMain\.handle\('per:wskaz-wlasny-model'/.test(main) && /function ustawWlasnyModel/.test(K('silnik-per.js')));
T('wskazany plik jest sprawdzany, zanim program na nim stanie', (() => {
  const i = K('silnik-per.js').indexOf('function ustawWlasnyModel');
  const blok = K('silnik-per.js').slice(i, i + 900);
  return /\.gguf\$/.test(blok) && /toJestGguf/.test(blok) && /100 \* 1024 \* 1024/.test(blok);
})());
T('wlasny model jest wskazywany, a nie kopiowany',
  !/copyFileSync/.test(K('silnik-per.js')) && /plikWlasnegoModelu/.test(K('silnik-per.js')));
T('ksiazka klientow ma wlasny wyglad, a nie goly dokument',
  /\.klient-karta\{/.test(style) && /\.klienci-pusto\{/.test(style));
T('kazda fala tla ma przypisany kolor', (() => {
  const css = style;
  const ile = (html.match(/tlo-fala-\d/g) || []).length;
  for (let i = 1; i <= ile; i++) if (!new RegExp(`\\.tlo-fala-${i}\\{fill:`).test(css)) return false;
  return ile >= 4;
})());

// BOM: trzy niewidoczne bajty, ktore Windows PowerShell dopisuje na poczatku
// pliku UTF-8. Wywrocily manifest modelu przy prawdziwej budowie. Program czyta
// te same pliki u klienta, wiec musi je przezyc po obu stronach.
T('odczyt ustawien znosi niewidoczny znacznik BOM',
  /charCodeAt\(0\) === 0xFEFF/.test(main));
T('odczyt zrodla modelu znosi niewidoczny znacznik BOM',
  /charCodeAt\(0\) === 0xFEFF/.test(K('silnik-per.js')));
T('odczyt ksiazki klientow znosi niewidoczny znacznik BOM', (() => {
  const i = main.indexOf('const rows = JSON.parse');
  return /0xFEFF/.test(main.slice(i, i + 160));
})());

/* --- silnik poza folderem programu + narzedzie naprawcze --- */
// Instalator nie moze nadpisac pliku .exe, ktory jest w uzyciu. Dlatego silnik
// NIE JEDZIE w instalatorze jako gotowy plik, tylko jako paczka danych, ktora
// program rozpakowuje sobie sam - do folderu, ktorego instalator nie dotyka.
T('silnik rozpakowuje sie z paczki do danych uzytkownika',
  /function rozpakujSilnik/.test(K('silnik-per.js'))
  && /function folderSilnikaUzytkownika/.test(K('silnik-per.js'))
  && /silnik\.zip/.test(K('silnik-per.js')));
T('silnik wstaje z danych uzytkownika, zanim poszukamy go w programie', (() => {
  const t = K('silnik-per.js');
  const i = t.indexOf('function folderSilnika()');
  const blok = t.slice(i, i + 420);
  return blok.indexOf('folderSilnikaUzytkownika') < blok.indexOf('process.resourcesPath');
})());
T('rozpakowanie idzie przez folder tymczasowy, zeby nie zostawic polowy silnika', (() => {
  const t = K('silnik-per.js');
  const i = t.indexOf('async function rozpakujSilnik');
  const blok = t.slice(i, i + 1800);
  return /rozpakowywanie/.test(blok) && /renameSync/.test(blok);
})());
T('program sam rozpakowuje silnik przy starcie',
  /if \(!plikSerwera\(\)\) \{ try \{ await rozpakujSilnik/.test(K('silnik-per.js')));
T('jest narzedzie naprawcze: silnik, model, uruchomienie',
  /ipcMain\.handle\('per:napraw'/.test(main)
  && /Silnik asystenta/.test(main) && /Uruchomienie/.test(main));
T('naprawa melduje, co bylo popsute i co zrobila', (() => {
  const i = main.indexOf("ipcMain.handle('per:napraw'");
  const blok = main.slice(i, i + 3000);
  return /'naprawione'/.test(blok) && /'blad'/.test(blok) && /kroki/.test(blok);
})());
T('przycisk naprawy jest przy czerwonej i pomaranczowej lampce',
  /stan==='brak' \|\| stan==='nowszy'/.test(app) && /perStanNapraw/.test(html));
T('pliki opisowe jada luzem, poza paczka',
  /function znajdzPlikSilnika/.test(K('silnik-per.js')) && /znajdzPlikSilnika\('model\.json'\)/.test(main));

// Jedno zrodlo to jeden punkt, w ktorym wszystko sie zatrzymuje. Rejestr Ollamy
// jest druga, niezalezna droga po ten sam plik GGUF - bez konta i bez adresow,
// ktore wygasaja.
T('model da sie pobrac takze z rejestru Ollamy',
  /async function modelZOllama/.test(main) && /registry\.ollama\.ai/.test(main));
T('Ollama jest drugą drogą, nie pierwszą', (() => {
  const i = main.indexOf('async function skadPobracModel');
  const blok = main.slice(i, i + 1400);
  return blok.indexOf('modelZHuggingFace') < blok.indexOf('modelZOllama');
})());
T('z rejestru Ollamy bierzemy tez sume kontrolna', (() => {
  const i = main.indexOf('async function modelZOllama');
  const blok = main.slice(i, i + 1600);
  return /digest/.test(blok) && /if \(!suma\) continue;/.test(blok);
})());
T('bez sumy kontrolnej nie pobieramy z Ollamy nic',
  /image\.model/.test(main));
T('jest instrukcja recznego wgrania krok po kroku',
  /instrukcja-reczna/.test(html) && /Wgranie ręczne/.test(html));
T('instrukcja mowi, co zrobic, gdy antywirus skasowal silnik',
  /antywirusowy/.test(html) && /wyjątków/.test(html));
T('da sie otworzyc folder asystenta, zeby wlozyc pliki recznie',
  /ipcMain\.handle\('per:otworz-folder'/.test(main) && /settingsOtworzSilnik/.test(html));
T('naprawa mowi wprost, gdy silnik zniknal mimo obecnego modelu',
  /sprawdź program antywirusowy/.test(main));

/* --- 1.25.0: asystent KW i Operat Express --- */
// Program NIE ma bazy ksiag wieczystych i nie wolno mu udawac, ze ma. To nie
// jest brak funkcji, tylko granica: ministerstwo takiej uslugi nie daje.
T('program nie udaje, ze przeszukuje ksiegi wieczyste',
  /nie przeszukuje ksiąg/i.test(app) || /NIE ma bazy ksiąg/i.test(K('renderer/kw.js')));
T('cyfra kontrolna liczona jest wedlug jawnego algorytmu', (() => {
  const kw = K('renderer/kw.js');
  return /WAGI_KW = \[1, 3, 7\]/.test(kw) && /suma % 10/.test(kw) && /X: 10, A: 11/.test(kw);
})());
T('program wylapuje literowke, ale nie zgaduje numeru', (() => {
  const kw = K('renderer/kw.js');
  return /innychMozliwosci/.test(kw) && /Numeru księgi się nie zgaduje/.test(kw);
})());
T('Express odmawia liczenia, gdy brakuje danych', (() => {
  const e = K('renderer/express.js');
  return /function sprawdzWsad/.test(e) && /potrzeba co najmniej 3/.test(e);
})());
T('Express przyjmuje wartosci NEUTRALNE, nie wymyslone', (() => {
  const e = K('renderer/express.js');
  return /PROGRAM NICZEGO NIE ZMYŚLA/.test(e) && /Przeciętna/.test(e);
})());
T('kazde przyjecie Expressu ma pole, wartosc i powod',
  /function zalozenie\(pole, co, wartosc, dlaczego/.test(K('renderer/express.js')));
T('Express nie pisze opisow za rzeczoznawce',
  /Opisów do operatu Express NIE PISZE/.test(K('renderer/express.js')));
T('PDF jest zablokowany, zanim rzeczoznawca przejrzy przyjecia', (() => {
  const e = K('renderer/express.js');
  return /wolnoPdf: !!potwierdzone/.test(e) && /powodBlokady/.test(e);
})());
T('oba moduly sa wczytywane przez strone',
  /src="kw\.js"/.test(html) && /src="express\.js"/.test(html));

T('przycisk pobierania pokazuje sie takze bez znanego adresu',
  /stan==='brak' && perStanModelu\?\.powod!=='BRAK_SILNIKA'/.test(K('renderer/app.js')));
T('pobieranie modelu zaczyna sie z przycisku w panelu PER',
  /#perStanPobierz/.test(K('renderer/app.js')) && /perAktualizujModel/.test(K('renderer/app.js')));
T('w ustawieniach nie ma juz przelacznika automatu',
  !/pobieranieModeluAuto/.test(JSON.stringify(cfg)));
T('przerwane pobieranie wznawia sie od miejsca, w ktorym stanelo',
  /Range: `bytes=\$\{juzNaDysku\}-`/.test(K('silnik-per.js')) && /status === 206/.test(K('silnik-per.js')));
T('program sam sprawdza, czy u zrodla nie ma nowszego modelu',
  /async function nowszyUZrodla/.test(main) && /api\/models\/.*tree\/main/.test(main));
T('nowszy model tez ma sume kontrolna ze zrodla',
  /lfs\?\.oid/.test(main) && /replace\(\/\^sha256:/.test(main));

/* --- 1.22.2: silnik PER jedzie W instalatorze --- */
// Po rezygnacji z wielkiej paczki silnik (llama-server.exe, kilkadziesiat MB)
// wypadl z instalatora RAZEM z modelem - i program u klienta nie mial czego
// uruchomic. Osobno pobiera sie TYLKO model.
if (typeof K2 === 'function' && K2('narzedzia/buduj.ps1')) {
  const buduj2 = K2('narzedzia/buduj.ps1'), nsi = K2('narzedzia/opero.nsi');
  T('budowa wklada silnik PER do instalatora jako paczke danych',
    /resources/.test(buduj2) && /silnik\.zip/.test(buduj2) && /Compress-Archive/.test(buduj2));
  T('instalator nie wyklucza juz folderu silnika',
    /File \/r "@ZRODLO@/.test(nsi) && !/\/x silnik/.test(nsi));
  // Sedno bledu, ktory wracal przy kazdej instalacji: Windows nie pozwala
  // nadpisac uruchomionego .exe. Instalator nie ma wiec prawa niesc
  // llama-server.exe luzem - niesie paczke danych, ktorej nikt nie uruchamia.
  T('instalator nie niesie luzem pliku .exe silnika',
    !/Copy-Item[^\n]*llama-server\.exe/.test(buduj2));
  T('program rozpakowuje silnik sam, u siebie',
    /rozpakujSilnik/.test(K2('app/silnik-per.js')) && /folderSilnikaUzytkownika/.test(K2('app/silnik-per.js')));
  T('sam model nadal nie wchodzi do instalatora',
    /OPROCZ folderu model/.test(buduj2));
  T('budowa wklada do programu adres, z ktorego sciagnac model',
    /model-domyslny\.json/.test(buduj2) && /ZAMEK\.json/.test(buduj2));
  T('budowa zapisuje manifest modelu do instalatora',
    /zapisz-manifest\.js/.test(buduj2) && K2('narzedzia/zapisz-manifest.js').length > 500);
}

/* --- 1.22.0: model pobierany w czesciach --- */
// Windows nie uruchamia plikow .exe wiekszych niz ~4 GB, wiec modelu (prawie
// 7 GB) nie da sie wlozyc do instalatora. Jedzie osobno, w czesciach po 1,8 GB,
// bo tyle moze miec najwiekszy zalacznik wydania na GitHubie.
T('program umie pobrac model w czesciach', (() => {
  const silnik = K('silnik-per.js');
  return /Array\.isArray\(zrodlo\.czesci\)/.test(silnik) && /sklejanie/.test(silnik);
})());
T('kazda czesc jest sprawdzana osobno, a calosc jeszcze raz', (() => {
  const silnik = K('silnik-per.js');
  const osobno = /ma inna sume kontrolna niz zapowiadal manifest/.test(silnik);
  const calosc = /Zlozony model ma inna sume kontrolna/.test(silnik);
  return osobno && calosc;
})());
T('przerwane pobieranie wznawia sie, zamiast zaczynac od zera',
  /juz byla pobrana/.test(K('silnik-per.js')));
T('model trafia pod wlasciwa nazwe dopiero po sprawdzeniu', (() => {
  const silnik = K('silnik-per.js');
  const i = silnik.indexOf('Zlozony model ma inna sume');
  const j = silnik.indexOf('fs.renameSync(skladany, cel)');
  return i > 0 && j > i;
})());
T('niedokonczone pobrania daja sie posprzatac',
  /\.czesci'\)/.test(K('silnik-per.js')) || /endsWith\('\.czesci'\)/.test(K('silnik-per.js')));

/* --- 1.21.0: jeden plik do klikniecia --- */
// W glownym folderze paczki ma stac DOKLADNIE jeden skrypt. Wczesniej byly trzy
// (ZAINSTALUJ, POBIERZ_INSTALATOR, ZBUDUJ-I-ZAINSTALUJ) i nie bylo wiadomo,
// ktory jest tym wlasciwym.
(() => {
  const korzen = path.join(APP, '..');
  let pliki = [];
  try { pliki = fs.readdirSync(korzen); } catch {}
  // W repozytorium roboczym (build\app\) nie ma plikow paczki - sprawdzamy to
  // tylko tam, gdzie paczka naprawde stoi.
  if (!fs.existsSync(path.join(korzen, 'narzedzia', 'buduj.ps1'))) {
    console.log('  ---  pominieto 3 sprawdzenia ukladu paczki (to repozytorium robocze)');
    return;
  }
  const klikalne = pliki.filter(n => /\.(cmd|bat)$/i.test(n));
  T('w glownym folderze stoi dokladnie jeden plik do klikniecia',
    klikalne.length === 1 || (console.log('   →', klikalne.join(', ')), false));
  T('tym plikiem jest budowa instalatora', /^ZBUDUJ OPERO\.cmd$/i.test(klikalne[0] || ''));
  T('rzeczy robocze siedza w narzedzia\\',
    ['buduj.ps1','asar_tool.js','opero.nsi'].every(n => fs.existsSync(path.join(korzen, 'narzedzia', n))));
  const buduj = K2('narzedzia/buduj.ps1');
  T('budowa nie probuje juz zlozyc pliku .exe wiekszego niz Windows uruchomi',
    !/pelny\.exe/.test(buduj) && !/\.sfx/i.test(buduj));
  // Model nie jedzie juz w wydaniu - ani w calosci, ani w czesciach. Pobiera
  // go SAM PROGRAM, przyciskiem w asystencie PER. Nie ma wiec czego ciac,
  // skladac ani sprawdzac przy budowie, a w paczce nie ma prawa zostac zaden
  // slad po tamtej drodze.
  T('budowa nie tnie juz modelu na czesci',
    !fs.existsSync(path.join(korzen, 'narzedzia', 'przygotuj-wydanie.js'))
    && !/przygotuj-wydanie\.js/.test(buduj));
  T('w wydaniu nie ma czesci modelu',
    !/sumaCzesci|razemWCzesciach|model\.part/i.test(buduj));
  T('model pobiera sam program, a budowa tylko podaje adres',
    /model-domyslny\.json/.test(buduj) && /ZAMEK\.json/.test(buduj));
  // Komentarze pomijamy — w nich stary, bledny zapis jest przytoczony celowo,
  // zeby bylo wiadomo, czego NIE robic.
  T('w skryptach budowy nie ma juz arytmetyki na rozmiarach w PowerShellu', (() => {
    const kod = buduj.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
    return !/\[math\]::(Min|Max)\(/.test(kod) && !/\d+MB\s*,/.test(kod);
  })());
})();

/* --- 1.20.2: /releases/latest pomija wydania wstepne --- */
// Na tym polegla budowa u uzytkownika: llama.cpp wypuszcza binaria WYLACZNIE
// jako wydania wstepne, a /releases/latest je pomija i zwraca stare wydanie bez
// plikow. Program i skrypt budowy musza przegladac LISTE wydan.
T('sprawdzanie modelu nie polega na samym /releases/latest',
  /releases\?per_page=/.test(main));

/* --- 1.20.1: brak modelu tlumaczy sie konkretnie --- */
// „Modelu nie ma albo nie chce wstac" bylo bezuzyteczne: nie wiadomo bylo, czy
// to wersja lekka, czy cos sie popsulo. Program rozroznia teraz przypadki.
T('program rozroznia brak silnika od braku modelu',
  /BRAK_SILNIKA/.test(main) && /BRAK_MODELU/.test(main));
T('przy braku modelu panel proponuje pobranie, a nie sam komunikat',
  /stan==='brak' && perStanModelu\?\.powod!=='BRAK_SILNIKA'/.test(app) && /Pobierz model/.test(app));
T('brak silnika mowi wprost, co zrobic', /Brakuje silnika asystenta\. Zainstaluj OPERO jeszcze raz/.test(app));

/* --- 1.20.1: panel PER jest podpiety niezaleznie od miejsca w dokumencie --- */
// Tu byl blad, przez ktory asystent „nie reagowal": panel lezal w dokumencie
// nizej niz <script>, wiec przy podpinaniu jeszcze nie istnial.
T('dzialania panelu ida przez delegacje na dokumencie',
  /function hookPanelPeraDelegacja/.test(app) && /data-piorek-action/.test(app));
T('panel stoi w dokumencie PRZED skryptem programu', (() => {
  const skrypt = html.indexOf('<script src="app.js">');
  const panel = html.indexOf('id="piorekPanel"');
  return skrypt > 0 && panel > 0 && panel < skrypt;
})());
T('klikniecie wewnatrz panelu go nie zamyka',
  /closest\('#piorekPanel'\)[^)]*\)\)closePiorekPanel\(\)|!e\.target\.closest\('#piorekPanel'\)/.test(app));
T('„Pokaz mi gdzie" dziala takze w trybie Ekspert',
  /guideCurrentStep\(scroll=true, naZadanie=false\)/.test(app) && /uiPrefs\.mode==='expert'&&!naZadanie/.test(app));

/* --- 1.20.0: skad program wie o nowszym modelu --- */
// Adresu nie trzeba juz nigdzie wpisywac recznie: program bierze zalacznik
// model.json z najnowszego wydania wlasnego repozytorium — tego samego, ktore
// i tak sluzy do sprawdzania nowszej wersji programu.
T('adres manifestu ustala sie sam z repozytorium wydan',
  /function adresManifestuModelu/.test(main) && /releases\/latest/.test(main) && /model\\.json/.test(main));
T('recznie wpisany adres ma pierwszenstwo', /modelManifestUrl/.test(main) && /if \(\/\^https:\\\/\\\/\/i\.test\(wprost\)\) return wprost/.test(main));
T('pytanie o nowszy model idzie tylko do GitHuba albo do zrodla modelu',
  !/fetch\(['"`]https:\/\/(?!api\.github\.com|huggingface\.co)/.test(main));
T('do zrodla modelu program pyta WYLACZNIE o spis plikow', (() => {
  // Zaden adres huggingface.co w kodzie nie moze wysylac niczego poza prosba
  // o liste plikow w repozytorium modelu.
  const adresy = (main.match(/https:\/\/huggingface\.co[^'"`\s)]*/g) || []);
  return adresy.every(a => /\/api\/models\/.*\/tree\/main/.test(a) || /\/resolve\/main\//.test(a));
})());
T('pobrany model jest sprawdzany suma kontrolna przed podmiana', (() => {
  const silnik = K('silnik-per.js');
  const i = silnik.indexOf('sumaCalosci');
  const j = silnik.indexOf('fs.renameSync(skladany, cel)');
  // Sprawdzenie MUSI stac przed nadaniem wlasciwej nazwy — inaczej program
  // moglby wstac na polowie pliku.
  return i > 0 && j > i && /createHash\('sha256'\)/.test(silnik);
})());
// Te dwa sprawdzenia dotycza plikow BUDOWY, ktorych nie ma w repozytorium
// roboczym — leza tylko w paczce zrodel. Gdy ich nie widac, mowimy o tym
// wprost zamiast udawac, ze przeszly.
const silnikPs = K2('narzedzia/pobierz-silnik.ps1'), budujPs = K2('narzedzia/buduj.ps1');
if (!silnikPs || !budujPs) {
  console.log('  ---  pominieto 2 sprawdzenia plikow budowy (nie ma ich w tym ukladzie katalogow)');
} else {
  T('plik manifestu powstaje przy budowie, a nie recznie',
    /model\.json/.test(silnikPs) && /suma\s*=\s*\$model\.suma/.test(silnikPs));
  T('budowa sama wpisuje repozytorium aktualizacji',
    /aktualizacjeRepo/.test(budujPs) && /remote get-url origin/.test(budujPs));
  T('szukanie silnika llama.cpp przeglada liste wydan, nie samo /latest',
    /releases\?per_page=/.test(silnikPs) && !/releases\/latest['"]/.test(silnikPs));
  T('gdy nazwy plikow sie zmienia, skrypt wypisuje, co zastal',
    /Pliki w nim/.test(silnikPs));
}

/* --- model lokalny --- */
T('model da sie zaktualizowac bez konsoli',
  /id="settingsPerAktualizuj"/.test(html) && /perAktualizujModel:/.test(preload) && /pobierzModel/.test(K('silnik-per.js')));
T('aktualizacja nie podmienia dzialajacego modelu polowa pliku',
  /\.czesc/.test(K('silnik-per.js')) && /renameSync/.test(K('silnik-per.js')));
T('widac, co leży na dysku', /id="settingsPerModel"/.test(html) && /perRysujSilnik/.test(app));

/* --- niezmiennosc silnika --- */
const suma = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(APP, 'renderer', f))).digest('hex');
T('silnik obliczen nie zostal ruszony', suma('calc.bundle.js') === '2da9919caa7863f9a6f342851a2c5e3d52d8370d175760a26ee7f00c10c3fec2');
T('generator operatow nie zostal ruszony', suma('report.bundle.js') === '43751b2ac3ce33d2dd1e2fb1b4769a475da14f2a7683d784f71c3a85d8a4fce7');

/* --- 1.17.1: asystent bez instrukcji obslugi --- */
T('panel ma jeden pasek stanu asystenta', /id="asystentPasek"/.test(html) && /id="asystentPasekTekst"/.test(html));
T('szczegoly wgranych rzeczy sa schowane', /class="agrafek-zaawansowane hidden"/.test(html) && /id="agrafekZaawansowaneBtn"/.test(html));
T('asystent przygotowuje sie sam przy starcie', /asystentStart\(\)/.test(app) && /asystentZadbajOBiblie/.test(app) && /asystentZadbajOModel/.test(app));
T('pasek mowi tylko, czy asystent jest aktywny', /Asystent aktywny/.test(app) && /Asystent nieaktywny/.test(app));
T('bez modelu nie pokazujemy bledu polaczenia', !/Nie mogę połączyć się z lokalnym modelem/.test(app));

/* --- 1.18.0: PER, model w instalatorze, koniec z ChatGPT --- */
T('nie ma juz przejscia do ChatGPT', [html, app, main, preload, style].every(t =>
  !/chatgpt\.com/i.test(t) && !/openChatGPT/i.test(t) && !/chatgpt:open/i.test(t) &&
  !/chatgpt-inline|chatgpt-field|chatgpt-target|chatgpt-task|chatgptHelpBtn|settingsOpenChatGPT/i.test(t)));
// Ollama wrocila w 1.24.0, ale w zupelnie innej roli: NIE jako program, ktory
// uruchamia model (tego nie chcemy - PER ma wlasny silnik i nie wymaga od
// rzeczoznawcy instalowania czegokolwiek), tylko jako REJESTR, z ktorego da sie
// pobrac sam plik .gguf, gdy Hugging Face zawiedzie.
T('PER nie uruchamia modelu przez Ollame ani nie pyta OpenAI',
  !/localhost:11434|127\.0\.0\.1:11434|ollama serve|ollamaUrl/i.test(main)
  && !/ollama/i.test(preload) && !/api\.openai\.com/.test(usluga));
T('Ollama wystepuje wylacznie jako adres do pobrania pliku modelu', (() => {
  const wiersze = bezKomentarzy(main).split('\n').filter(w => /ollama/i.test(w));
  return wiersze.length > 0 && wiersze.every(w =>
    /registry\.ollama\.ai|OLLAMA_BAZA|MODELE_OLLAMA|modelZOllama|zrodlo: 'ollama'|image\.model/.test(w));
})());
T('redakcja tekstu idzie do modelu lokalnego', /per:redaguj/.test(main) && /perRedaguj/.test(preload) && /per-inline/.test(html));
T('redakcja pokazuje propozycje obok oryginalu, nic nie podmienia sama', /perPolePodglad/.test(app) && /Wstaw propozycje/.test(app));
T('model nie dostaje danych operatu przy redakcji', /PROMPT_REDAKCJA/.test(usluga) && /Nie wolno Ci dopisa/i.test(usluga) && /DO UZUPE/i.test(usluga));
T('silnik slucha tylko na tym komputerze', /127\.0\.0\.1/.test(K('silnik-per.js')) && !/0\.0\.0\.0/.test(K('silnik-per.js')));
T('model z aktualizacji ma pierwszenstwo przed tym z instalatora', /aktualizacja/.test(K('silnik-per.js')) && /instalator/.test(K('silnik-per.js')));
T('serwer modelu gasnie razem z programem', /before-quit/.test(main) && /zatrzymaj/.test(main));

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

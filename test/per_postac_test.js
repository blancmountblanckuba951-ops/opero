'use strict';
// Paczka zrodel trzyma program w app\\, repozytorium robocze w build\\app\\.
// Testy musza dzialac w obu ukladach, inaczej build na GitHubie wywala sie
// na samych testach, zanim w ogole dojdzie do instalatora.
const APP_DIR = (() => {
  const f = require('node:fs'), p = require('node:path');
  const a = p.join(__dirname, '..', 'build', 'app');
  return f.existsSync(a) ? a : p.join(__dirname, '..', 'app');
})();

// egzamin liczony partiami i brak podpowiedzi „wpisz polecenie w konsoli".
// Na koncu kontrola niezmiennosci silnika obliczen i generatora operatow.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const APP = APP_DIR;
const K = (...p) => fs.readFileSync(path.join(APP, ...p), 'utf8');

let ok = 0, zle = 0;
const T = (n, w) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n); } };

const app = K('renderer', 'app.js');
const html = K('renderer', 'index.html');
const css = K('renderer', 'styles.css');
const preload = K('preload.js');
const main = K('main.js');
const usluga = K('per-service.js');
const pkg = JSON.parse(K('package.json'));

console.log('PER — postac, Biblia na dysku, egzamin partiami\n');

/* --- wersja --- */
const WERSJA = String(pkg.version || '');
T(`numer wersji jest spojny wszedzie (${WERSJA})`,
  /^\d+\.\d+\.\d+$/.test(WERSJA) && html.includes(WERSJA) && app.includes(WERSJA));
T('interfejs nie pokazuje juz starego numeru wersji', !/OPERO 1\.9\.5|Wersja 1\.9\.5/.test(html));

/* --- postac --- */
T('postac stoi takze w naglowku panelu PER', /id="panelPiorek"/.test(html));
T('naglowek panelu ma podpis nastroju', /id="agrafekNastroj"/.test(html));
T('wzrok chodzi za kursorem przez zmienna CSS, nie przez przerysowanie SVG',
  /--wzrok-x/.test(css) && /--wzrok-x/.test(app) && /pointermove/.test(app));
T('ruch myszy jest ograniczony do jednej klatki', /requestAnimationFrame/.test(app) && /agrafekRamka/.test(app));
T('wzrok wraca na wprost po wyjsciu kursora z okna', /window\.addEventListener\('blur'/.test(app));
T('sa cztery miny dobierane do pracy',
  ['mina-czyta', 'mina-liczy', 'mina-znalazl', 'mina-ostrzega'].every(x => css.includes(`.piorek-character.${x}`)));
T('mina ustawia sie z jednego miejsca', /function agrafekStan\(/.test(app));
T('doszly dwa nowe gesty bezczynnosci', /gest-rozglada/.test(css) && /gest-iskra/.test(css) && /gest-rozglada/.test(app));
T('gest wykonuja obie widoczne kopie postaci', /\[\$\('#dockPiorek'\),\$\('#panelPiorek'\)\]/.test(app));
T('miny milkna przy ograniczonych animacjach',
  /motion-reduced .piorek-character\[class\*="mina-"\]/.test(css) && /prefers-reduced-motion/.test(css));

/* --- Biblia na dysku --- */
T('jest modul Biblii lokalnej', fs.existsSync(path.join(APP, 'biblia-lokalna.js')));
T('program udostepnia stan i pobranie Biblii', /biblia:stan/.test(main) && /biblia:pobierz/.test(main));
T('mostek preload wystawia obie funkcje', /bibliaStan/.test(preload) && /bibliaPobierz/.test(preload));
T('panel pokazuje stan Biblii na dysku', /id="bibliaDot"/.test(html) && /id="bibliaMeta"/.test(html));
T('jest przycisk pobrania Biblii do folderu programu', /id="bibliaPobierz"/.test(html) && /bibliaPobierzUI/.test(app));
T('PER pyta wylacznie Biblie z dysku — serwera juz nie ma',
  /biblia\.szukaj\(rootUserData\(\)/.test(usluga) && !/knowledgeRequest/.test(usluga));
T('zrodla danych tez czytane sa najpierw lokalnie', /biblia\.zrodla\(rootUserData\(\)/.test(usluga));
T('Biblia rozpakowuje sie sama przy starcie i nie psuje go, gdy czegos brak',
  /bibliaZasiej\(\)/.test(main) && /catch \(e\) \{ logToFile\('WARN', 'Biblia z programu', e\); return false; \}/.test(main));
T('status PER mowi tez o Biblii', /biblia: kb/.test(usluga));

/* --- egzamin --- */
T('egzamin liczony jest partiami', /runPiorekExamPartiami/.test(app) && !/runPiorekExamUI/.test(app));
T('partia ma rozmiar i przesuniecie', /offset/.test(app) && /limit:25/.test(app));
T('postep egzaminu jest widoczny', /id="piorekExamProgress"/.test(html) && /piorekExamPasek/.test(app));
T('progi zaliczenia pozostaly te same', /wynik>=95/.test(app) && /wynikEksp>=90/.test(app) && /krytyczne===0/.test(app));
T('egzamin chodzi partiami na tym komputerze',
  /knowledge:exam/.test(main) && /nextOffset/.test(main) && /lokalny: true/.test(main));

/* --- koniec z poleceniami w konsoli --- */
// Chodzi o to, zeby PER NIE kazal rzeczoznawcy instalowac osobnego programu
// ani wklepywac polecen w konsoli. Nazwa Ollamy moze sie pojawic wylacznie jako
// ADRES, z ktorego da sie pobrac plik modelu - to zwykle pobranie z przegladarki.
T('PER nie kaze nikomu niczego instalowac', (() => {
  if (/ollama/i.test(usluga)) return false;
  const wiersze = html.split('\n').filter(w => /ollama/i.test(w));
  const zleceniaInstalacji = /zainstaluj|ollama (run|pull|serve)|cmd|wiersz polece/i;
  return wiersze.every(w => /ollama\.com/i.test(w) && !zleceniaInstalacji.test(w));
})());
T('model jedzie w instalatorze, a nie z panelu', /resources/.test(K('silnik-per.js')) && /id="settingsPerAktualizuj"/.test(html));

/* --- pytania na skroty --- */
T('szybkich pytan jest wiecej niz cztery', (html.match(/data-piorek-question=/g) || []).length >= 8);

/* --- niezmiennosc silnika --- */
const suma = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(APP, 'renderer', f))).digest('hex');
T('silnik obliczen nie zostal ruszony', suma('calc.bundle.js') === '2da9919caa7863f9a6f342851a2c5e3d52d8370d175760a26ee7f00c10c3fec2');
T('generator operatow nie zostal ruszony', suma('report.bundle.js') === '43751b2ac3ce33d2dd1e2fb1b4769a475da14f2a7683d784f71c3a85d8a4fce7');

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

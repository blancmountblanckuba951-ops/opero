'use strict';
// Paczka zrodel trzyma program w app\\, repozytorium robocze w build\\app\\.
// Testy musza dzialac w obu ukladach, inaczej build na GitHubie wywala sie
// na samych testach, zanim w ogole dojdzie do instalatora.
const APP_DIR = (() => {
  const f = require('node:fs'), p = require('node:path');
  const a = p.join(__dirname, '..', 'build', 'app');
  return f.existsSync(a) ? a : p.join(__dirname, '..', 'app');
})();
// Biblia OPERO w folderze programu: czy snapshot sie wczytuje, czy ranking
// wybiera regule z wlasciwego rodzaju wyceny i czy pytanie „jak policzyc"
// wyciaga regule ZE WZOREM, a nie definicje.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const B = require(APP_DIR + '/biblia-lokalna.js');

let ok = 0, zle = 0;
const T = (n, w) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n); } };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opero-biblia-'));
const TYP_LOKAL = 't-lokal', TYP_LAS = 't-las';
const snapshot = {
  version: { code: 'KB-TEST-1', name: 'Test', status: 'active', legalStateDate: '2026-09-01' },
  generatedAt: new Date().toISOString(),
  types: [
    { id: TYP_LOKAL, code: 'local_ownership_kcm', name: 'Lokal mieszkalny - prawo własności' },
    { id: TYP_LAS, code: 'forest_indicators', name: 'Nieruchomość leśna - wskaźniki szacunkowe' },
  ],
  sources: [{ id: 's1', source_key: 'ksiega-1', title: 'Podręcznik wyceny', original_filename: 'podrecznik.pdf' }],
  links: [{ id: 'l1', title: 'RCiWN', authority: 'Starostwo', url: 'https://example.test/rcn', cautions: 'Sprawdź datę.' }],
  topics: [{ topic_code: 'transaction_prices', source_link_id: 'l1', trust_tier: 'primary_official',
    preferred_order: 1, what_to_find: 'Ceny transakcyjne', verification_steps: 'Porównaj z aktem.',
    requires_human_verification: true, valuation_type_id: null }],
  routes: [
    { route_code: 'calculation_trace', title: 'Tok obliczeń', answer_policy: 'Pokaż wzór.', fallback_instruction: 'Bez danych nie licz.' },
    { route_code: 'where_find_data', title: 'Gdzie szukać', answer_policy: 'Wskaż źródło.', fallback_instruction: '' },
    { route_code: 'definition_explain', title: 'Wyjaśnienie', answer_policy: '', fallback_instruction: '' },
  ],
  rules: [
    { id: 'r1', rule_code: 'LOK-WZOR', valuation_type_id: TYP_LOKAL, source_id: 's1', category: 'calculation',
      title: 'Wartość lokalu z ceny jednostkowej', content: 'Wartość lokalu wyznacza się z powierzchni i ceny jednostkowej.',
      formula: 'W = P * C', source_page_from: 10, source_page_to: 12, priority: 50 },
    { id: 'r2', rule_code: 'LOK-DEF', valuation_type_id: TYP_LOKAL, source_id: 's1', category: 'definition',
      title: 'Definicja wartości lokalu', content: 'Wartość lokalu to najbardziej prawdopodobna cena.',
      formula: null, source_page_from: 3, source_page_to: 3, priority: 90 },
    { id: 'r3', rule_code: 'LAS-WZOR', valuation_type_id: TYP_LAS, source_id: 's1', category: 'calculation',
      title: 'Wartość gruntu leśnego', content: 'Wartość lokalu leśnego wyznacza się ze wskaźnika i ceny drewna.',
      formula: 'W = N * ha * C', source_page_from: 80, source_page_to: 81, priority: 95 },
  ],
};
fs.writeFileSync(path.join(root, 'biblia-lokalna.json'), JSON.stringify(snapshot), 'utf8');

console.log('Biblia OPERO w folderze programu\n');

const s = B.stan(root);
T('snapshot w folderze programu jest rozpoznawany', s.jest === true && s.kod === 'KB-TEST-1');
T('stan podaje liczbę reguł i książek', s.regul === 3 && s.ksiazek === 1);
T('brak snapshotu zgłaszany jest wprost, a nie pustą odpowiedzią',
  B.stan(path.join(root, 'pusto')).jest === false);

const w1 = B.szukaj(root, { pytanie: 'Jak policzyć wartość lokalu?', valuationTypeCode: 'local_ownership_kcm' });
T('pytanie „jak policzyć" trafia w ścieżkę toku obliczeń', w1.trasa === 'calculation_trace');
T('pierwsza reguła ma wzór, a nie samą definicję', w1.reguly[0]?.oznaczenie === 'LOK-WZOR' && !!w1.reguly[0]?.wzor);
T('reguła z innego rodzaju wyceny jest odrzucana, a nie tylko odsuwana',
  !w1.reguly.some(r => r.oznaczenie === 'LAS-WZOR'));
T('reguła niesie oznaczenie, strony i książkę źródłową',
  w1.reguly[0]?.strony === '10–12' && /Podręcznik/.test(String(w1.reguly[0]?.zrodlo)));
T('odpowiedź zna swój snapshot i wie, że jest lokalna',
  w1.snapshot?.kod === 'KB-TEST-1' && w1.snapshot?.lokalna === true);

const w2 = B.szukaj(root, { pytanie: 'Nieruchomość leśna — jak liczyć wskaźnik?' });
T('rodzaj wyceny rozpoznawany z samego pytania', w2.rodzajWyceny?.kod === 'forest_indicators');

const w3 = B.szukaj(root, { pytanie: 'Skąd wziąć ceny transakcyjne?' });
T('pytanie o dane trafia w ścieżkę źródeł', w3.trasa === 'where_find_data');
T('źródło ma adres i sposób weryfikacji',
  w3.zrodla[0]?.url === 'https://example.test/rcn' && /akt/i.test(String(w3.zrodla[0]?.verification)));
T('źródła wymagają potwierdzenia przez człowieka', w3.zrodla[0]?.requiresHumanVerification === true);

const z = B.zrodla(root, { temat: 'ceny transakcyjne' });
T('osobne narzędzie źródeł zwraca tę samą mapę', z.zrodla?.[0]?.topicCode === 'transaction_prices');

T('inna wersja Biblii wymusza odświeżenie', B.wymagaOdswiezenia(root, 'KB-INNA') === true);
T('ta sama, świeżo pobrana wersja nie wymusza odświeżenia', B.wymagaOdswiezenia(root, 'KB-TEST-1') === false);
T('brak pliku zawsze wymaga pobrania', B.wymagaOdswiezenia(path.join(root, 'pusto'), 'KB-TEST-1') === true);

fs.writeFileSync(path.join(root, 'biblia-lokalna.json'), '{ to nie jest json', 'utf8');
T('uszkodzony plik nie wywraca programu, tylko zgłasza brak Biblii',
  B.stan(root).jest === false && B.szukaj(root, { pytanie: 'cokolwiek' }).error === 'BRAK_BIBLII');

try { fs.rmSync(root, { recursive: true, force: true }); } catch {}

/* --- 1.17.1: Biblia jedzie w instalatorze --- */
{
  const plikBiblii = require('node:path').join(APP_DIR, 'zasoby', 'biblia.json');
  const jest = fs.existsSync(plikBiblii);
  T('Biblia OPERO lezy w folderze programu (zasoby/biblia.json)', jest);
  if (jest) {
    const s = JSON.parse(fs.readFileSync(plikBiblii, 'utf8'));
    T('snapshot ma komplet regul i rodzajow wyceny',
      Array.isArray(s.rules) && s.rules.length >= 375 && Array.isArray(s.types) && s.types.length >= 51);
    T('snapshot zna swoj kod i stan prawny',
      s.version && s.version.code === 'KB-2026.09.01-v1' && s.version.legalStateDate === '2026-09-01');
    T('kazda regula ma kod, tytul i tresc',
      s.rules.every(r => r && r.id && r.rule_code && r.title && r.content));
    T('zrodla i trasy odpowiedzi sa komplete',
      Array.isArray(s.sources) && s.sources.length >= 7
      && Array.isArray(s.routes) && s.routes.length >= 16
      && Array.isArray(s.links) && s.links.length >= 36
      && Array.isArray(s.topics) && s.topics.length >= 41);
  }
}

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

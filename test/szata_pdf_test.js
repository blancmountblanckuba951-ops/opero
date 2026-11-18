'use strict';
/**
 * OPERO — trzy szaty dokumentu.
 *
 * Styl PDF-a to nie ozdoba: to jedyna rzecz, którą klient ogląda, zanim
 * przeczyta choć jedną liczbę. Sprawdzamy więc trzy rzeczy, które naprawdę
 * mogą zaboleć:
 *   1. czy style są SOBĄ NAWZAJEM różne (trzy kafelki, które wyglądają tak
 *      samo, to trzy razy ta sama obietnica),
 *   2. czy wszystkie wartości trafiają w to, co zamrożony generator raportu
 *      potrafi przyjąć (poza zakresem po cichu wraca domyślna — i człowiek
 *      widzi co innego, niż wybrał),
 *   3. czy wybór stylu nie rusza ani jednej liczby operatu.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')]
  .find(p => fs.existsSync(p));
const S = require(path.join(APP, 'renderer', 'szata-pdf.js'));
const raport = fs.readFileSync(path.join(APP, 'renderer', 'report.bundle.js'), 'utf8');

console.log('OPERO — trzy szaty dokumentu\n');

/* --- 1. Są dokładnie trzy i każdy ma komplet --- */
T('style są trzy', S.STYLE.length === 3);
T('każdy styl ma nazwę, opis i wskazanie, do czego jest',
  S.STYLE.every(s => s.id && s.nazwa && s.opis && s.dla));
T('każdy styl podaje komplet ustawień, a nie łatkę',
  S.STYLE.every(s => S.KLUCZE.every(k => s.szata[k] !== undefined)));

/* --- 2. Style naprawdę się od siebie różnią --- */
const rozny = (k) => new Set(S.STYLE.map(s => String(s.szata[k]))).size;
T('trzy różne kroje pisma', rozny('fontFamily') === 3);
T('trzy różne kolory akcentu', rozny('accent') === 3);
T('trzy różne okładki', rozny('coverStyle') === 3);
T('trzy różne sposoby prowadzenia nagłówków', rozny('headingStyle') === 3);
T('trzy różne gęstości tabel', rozny('tableDensity') === 3);

/* --- 3. Wartości mieszczą się w tym, co przyjmuje zamrożony generator ---
   buildCSS obcina wartości spoza zakresu do domyślnych. Styl, który w nie
   trafia, pokazywałby na kafelku co innego, niż wyjdzie w PDF. */
const zakresy = { bodyFontSize: [8, 13], lineHeight: [1.15, 1.8], pageMarginMm: [10, 30], photoColumns: [1, 3] };
for (const [pole, [min, max]] of Object.entries(zakresy)) {
  T(`${pole} mieści się w zakresie generatora (${min}–${max})`,
    S.STYLE.every(s => { const v = Number(s.szata[pole]); return v >= min && v <= max; }));
}
T('motywy istnieją w zamrożonym generatorze',
  S.STYLE.every(s => new RegExp(`\\b${s.szata.theme}\\s*:\\s*\\{`).test(raport)));
T('style okładek są znane generatorowi',
  S.STYLE.every(s => ['classic', 'minimal', 'photo'].includes(s.szata.coverStyle)));
T('style nagłówków są znane generatorowi',
  S.STYLE.every(s => ['line', 'band', 'minimal'].includes(s.szata.headingStyle)));
T('gęstości tabel są znane generatorowi',
  S.STYLE.every(s => ['compact', 'normal', 'comfortable'].includes(s.szata.tableDensity)));

/* --- 4. Zastosowanie stylu --- */
function projekt() {
  return {
    appearance: { headerText: 'Mój nagłówek', footerText: 'Moja stopka', bodyFontSize: 12 },
    market: { transactions: [{ priceUnit: 9000 }] },
    property: { usableArea: 54 },
  };
}
const p1 = projekt();
S.zastosuj(p1, 'nowoczesny');
T('styl wpisuje wszystkie swoje wartości',
  S.KLUCZE.every(k => String(p1.appearance[k]) === String(S.styl('nowoczesny').szata[k])));
T('styl NIE kasuje nagłówka i stopki rzeczoznawcy',
  p1.appearance.headerText === 'Mój nagłówek' && p1.appearance.footerText === 'Moja stopka');
T('styl nie rusza danych operatu',
  p1.market.transactions[0].priceUnit === 9000 && p1.property.usableArea === 54);
T('program pamięta, od którego stylu zaczęto', p1.appearance.stylPdf === 'nowoczesny');

let odmowil = false;
try { S.zastosuj(projekt(), 'nie-ma-takiego'); } catch { odmowil = true; }
T('nieznany styl jest odrzucany, a nie przyjmowany po cichu', odmowil);

/* --- 5. Rozpoznawanie, co jest ustawione --- */
T('program rozpoznaje wybrany styl', S.rozpoznaj(p1) === 'nowoczesny');
T('nazwa wybranego stylu jest czytelna', S.nazwaBiezacego(p1) === 'Nowoczesny czysty');
p1.appearance.bodyFontSize = 11.4;
T('po dostrojeniu to już nie jest czysty styl', S.rozpoznaj(p1) === null);
T('ale wiadomo, z czego wyszedł', S.nazwaBiezacego(p1) === 'Nowoczesny czysty (dostrojony)');
T('zupełnie obcy układ też ma nazwę', S.nazwaBiezacego({ appearance: {} }) === 'Własny układ');

/* przejście między stylami nie zostawia resztek poprzedniego */
const p2 = projekt();
S.zastosuj(p2, 'prestizowy');
S.zastosuj(p2, 'urzedowy');
T('przejście na inny styl nie zostawia resztek poprzedniego', S.rozpoznaj(p2) === 'urzedowy');

/* --- 6. Miniatury: trzy różne obrazki, bez wstrzykniętego kodu --- */
const mini = S.STYLE.map(s => S.miniatura(s));
T('każdy styl ma miniaturę', mini.every(m => m.length > 200));
T('miniatury są od siebie różne', new Set(mini).size === 3);
T('miniatura niesie kolor akcentu stylu',
  S.STYLE.every((s, i) => mini[i].includes(s.szata.accent)));
T('miniatura stoi w <button>, więc używa wyłącznie treści frazowej',
  mini.every(m => !/<div|<table|<p[ >]/.test(m)));
T('miniatura bieżącego dostrojenia też się rysuje', S.miniatura(p1.appearance).length > 200);
T('miniatura bez żadnych ustawień nie wywraca programu', S.miniatura({}).length > 200);

// Napisy na miniaturze maja 5-7 px. Zloty akcent, ktory na papierze czyta sie
// dobrze, w takich literach jest szary mamrotem - dlatego pismo miniatury
// idzie ciemniejszym wariantem, a akcent zostaje na liniach i tabeli.
T('pismo miniatury jest ciemniejsze od samego akcentu', (() => {
  const jasnosc = (h) => { const n = parseInt(h.slice(1), 16); return ((n >> 16 & 255) * .299 + (n >> 8 & 255) * .587 + (n & 255) * .114); };
  return S.STYLE.every(st => jasnosc(S.przyciemnij(st.szata.accent)) < jasnosc(st.szata.accent) - 20);
})());
T('miniatura nadal niesie prawdziwy akcent w liniach',
  S.STYLE.every((st, i) => mini[i].includes(st.szata.accent)));
T('bezsensowny kolor nie wywraca przyciemniania', /^#[0-9a-f]{6}$/i.test(S.przyciemnij('niebieskawy')));
T('miniatura jest obrazkiem, nie trescia do czytania na glos',
  mini.every(m => m.includes('aria-hidden="true"')));

const zlosliwy = S.miniatura({ accent: '"><img src=x onerror=alert(1)>', fontFamily: '"><script>x</script>' });
T('wartości z projektu nie wstrzykną kodu do miniatury',
  !/<img|<script/i.test(zlosliwy));

/* --- 7. Pola dostrojenia pokrywają to, o co prosi rzeczoznawca --- */
const sciezki = S.POLA.map(x => x.sciezka);
for (const musi of ['appearance.fontFamily', 'appearance.bodyFontSize', 'appearance.lineHeight',
                    'appearance.pageMarginMm', 'appearance.accent', 'appearance.headingStyle',
                    'appearance.coverStyle', 'appearance.tableDensity']) {
  T(`można dostroić ${musi.split('.')[1]}`, sciezki.includes(musi));
}
T('każde pole dostrojenia ma nazwę i typ',
  S.POLA.every(x => x.nazwa && ['wybor', 'liczba', 'kolor', 'haczyk'].includes(x.typ)));
T('pola wyboru mają opcje', S.POLA.filter(x => x.typ === 'wybor').every(x => (x.opcje || []).length >= 2));
T('pola liczbowe mają zakres',
  S.POLA.filter(x => x.typ === 'liczba').every(x => Number.isFinite(x.min) && Number.isFinite(x.max) && x.max > x.min));
// Zakresy pól muszą być tym samym, co przyjmuje generator — inaczej suwak
// pozwala ustawić wartość, którą PDF po cichu zignoruje.
T('zakresy pól zgadzają się z generatorem', S.POLA.filter(x => x.typ === 'liczba').every(x => {
  const z = zakresy[x.sciezka.split('.')[1]];
  return !z || (x.min >= z[0] && x.max <= z[1]);
}));

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

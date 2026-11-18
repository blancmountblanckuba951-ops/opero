'use strict';
/* ============================================================================
   OPERO — TRZY SZATY DOKUMENTU
   ----------------------------------------------------------------------------
   Rzeczoznawca nie składa operatu od zera — wybiera, jak ma wyglądać, i
   poprawia szczegóły. Dlatego zamiast kilkunastu suwaków na wejściu dajemy
   TRZY gotowe dokumenty do obejrzenia obok siebie, a dopiero po wyborze —
   pełną regulację czcionek, linii, marginesów i reszty.

   Czego ten moduł NIE robi: nie dotyka `report.bundle.js`. Zamrożony generator
   raportu od zawsze czyta `project.appearance` i sam z niego składa CSS. Styl
   to więc nic więcej niż komplet wartości wpisanych w to jedno miejsce —
   żadnego podmieniania HTML po fakcie, żadnej drugiej drogi do PDF-a, która
   mogłaby się rozjechać z pierwszą.

   Miniatury rysujemy tu, z tych samych wartości, którymi pojedzie dokument.
   Gdyby rysował je ktoś inny, prędzej czy później pokazywałyby co innego, niż
   wychodzi z drukarki — a to gorsze niż brak podglądu.
   ========================================================================= */

/** Pełny komplet ustawień wyglądu. Każdy styl podaje WSZYSTKIE pola — żeby
 *  przejście z jednego na drugi nie zostawiało po sobie resztek poprzedniego. */
const STYLE = [
  {
    id: 'urzedowy',
    nazwa: 'Urzędowy klasyczny',
    opis: 'Szeryfowa Georgia, złoty akcent, pełny spis treści i spis tabel. Tak wygląda operat, którego oczekują banki, sądy i komornicy.',
    dla: 'Do banku, sądu, egzekucji',
    szata: {
      theme: 'gold', accent: '#c99a2e', fontFamily: "Georgia, 'Times New Roman', serif",
      headingStyle: 'line', coverStyle: 'classic',
      bodyFontSize: 10.2, lineHeight: 1.38, pageMarginMm: 15,
      tableDensity: 'normal', photoColumns: 2,
      showToc: true, showIndexes: true, showHeaderFooter: true,
    },
  },
  {
    id: 'nowoczesny',
    nazwa: 'Nowoczesny czysty',
    opis: 'Bezszeryfowa Calibri, grafitowy akcent, nagłówki bez linii i szerokie marginesy. Dokument czyta się z ekranu, a nie tylko z papieru.',
    dla: 'Dla klienta prywatnego, do czytania na ekranie',
    szata: {
      theme: 'graphite', accent: '#343a40', fontFamily: 'Calibri, Arial, sans-serif',
      headingStyle: 'minimal', coverStyle: 'minimal',
      bodyFontSize: 10.6, lineHeight: 1.52, pageMarginMm: 19,
      tableDensity: 'comfortable', photoColumns: 2,
      showToc: true, showIndexes: false, showHeaderFooter: true,
    },
  },
  {
    id: 'prestizowy',
    nazwa: 'Prestiżowy granat',
    opis: 'Cambria, granatowe pasy nagłówków, okładka na zdjęciu i gęste tabele. Dokument wygląda poważnie i mieści się na mniejszej liczbie stron.',
    dla: 'Do dewelopera, inwestora, na prezentację',
    szata: {
      theme: 'navy', accent: '#173a63', fontFamily: 'Cambria, Georgia, serif',
      headingStyle: 'band', coverStyle: 'photo',
      bodyFontSize: 10.1, lineHeight: 1.34, pageMarginMm: 14,
      tableDensity: 'compact', photoColumns: 3,
      showToc: true, showIndexes: true, showHeaderFooter: true,
    },
  },
];

/** Pola regulacji po wyborze stylu. Opisy mówią, co się stanie z dokumentem —
 *  nie powtarzają nazwy pola. */
const POLA = [
  { sciezka: 'appearance.fontFamily', nazwa: 'Krój pisma', typ: 'wybor', opcje: [
      { wartosc: "Georgia, 'Times New Roman', serif", etykieta: 'Georgia (szeryfowa)' },
      { wartosc: "'Times New Roman', serif", etykieta: 'Times New Roman' },
      { wartosc: 'Cambria, Georgia, serif', etykieta: 'Cambria' },
      { wartosc: 'Arial, sans-serif', etykieta: 'Arial (bezszeryfowa)' },
      { wartosc: 'Calibri, Arial, sans-serif', etykieta: 'Calibri' },
      { wartosc: 'Verdana, sans-serif', etykieta: 'Verdana' },
    ] },
  { sciezka: 'appearance.bodyFontSize', nazwa: 'Wielkość tekstu [pt]', typ: 'liczba', min: 8, max: 13, krok: 0.1 },
  { sciezka: 'appearance.lineHeight', nazwa: 'Interlinia', typ: 'liczba', min: 1.15, max: 1.8, krok: 0.02 },
  { sciezka: 'appearance.pageMarginMm', nazwa: 'Margines [mm]', typ: 'liczba', min: 10, max: 30, krok: 1 },
  { sciezka: 'appearance.accent', nazwa: 'Kolor akcentu', typ: 'kolor' },
  { sciezka: 'appearance.headingStyle', nazwa: 'Nagłówki i linie', typ: 'wybor', opcje: [
      { wartosc: 'line', etykieta: 'Linia pod nagłówkiem' },
      { wartosc: 'band', etykieta: 'Pełny pas koloru' },
      { wartosc: 'minimal', etykieta: 'Bez linii i pasa' },
    ] },
  { sciezka: 'appearance.coverStyle', nazwa: 'Okładka', typ: 'wybor', opcje: [
      { wartosc: 'classic', etykieta: 'Klasyczna' },
      { wartosc: 'minimal', etykieta: 'Minimalistyczna' },
      { wartosc: 'photo', etykieta: 'Na zdjęciu' },
    ] },
  { sciezka: 'appearance.tableDensity', nazwa: 'Gęstość tabel', typ: 'wybor', opcje: [
      { wartosc: 'compact', etykieta: 'Kompaktowa' },
      { wartosc: 'normal', etykieta: 'Normalna' },
      { wartosc: 'comfortable', etykieta: 'Luźna' },
    ] },
  { sciezka: 'appearance.photoColumns', nazwa: 'Zdjęcia w wierszu', typ: 'wybor', opcje: [
      { wartosc: '1', etykieta: '1' }, { wartosc: '2', etykieta: '2' }, { wartosc: '3', etykieta: '3' },
    ] },
  { sciezka: 'appearance.showToc', nazwa: 'Spis treści', typ: 'haczyk' },
  { sciezka: 'appearance.showIndexes', nazwa: 'Spis tabel i rysunków', typ: 'haczyk' },
  { sciezka: 'appearance.showHeaderFooter', nazwa: 'Nagłówek i stopka stron', typ: 'haczyk' },
];

const KLUCZE = Object.keys(STYLE[0].szata);

function styl(id) { return STYLE.find(s => s.id === id) || null; }

/**
 * Wpisuje styl do projektu. Nagłówka i stopki (teksty) NIE ruszamy — to dane
 * konkretnego operatu, nie element szaty; nadpisanie ich wyglądem skasowałoby
 * rzeczoznawcy jego własny podpis na każdej stronie.
 */
function zastosuj(project, id) {
  const s = styl(id);
  if (!s) throw new Error(`Nie znam stylu „${id}”.`);
  if (!project || typeof project !== 'object') throw new Error('Brak projektu.');
  project.appearance = Object.assign({}, project.appearance, s.szata, { stylPdf: s.id });
  return project.appearance;
}

/** Który styl jest teraz ustawiony — albo `null`, gdy człowiek go dostroił. */
function rozpoznaj(project) {
  const a = (project && project.appearance) || {};
  for (const s of STYLE) {
    const zgodne = KLUCZE.every(k => {
      const w = a[k], e = s.szata[k];
      if (typeof e === 'number') return Math.abs(Number(w) - e) < 0.001;
      if (typeof e === 'boolean') return !!w === e;
      return String(w ?? '').toLowerCase() === String(e).toLowerCase();
    });
    if (zgodne) return s.id;
  }
  return null;
}

/** Nazwa pod przyciskiem „zapisz PDF” — żeby było wiadomo, co się zapisze. */
function nazwaBiezacego(project) {
  const id = rozpoznaj(project);
  const s = styl(id);
  if (s) return s.nazwa;
  const bazowy = styl((project && project.appearance && project.appearance.stylPdf) || '');
  return bazowy ? `${bazowy.nazwa} (dostrojony)` : 'Własny układ';
}

/* ----------------------------------------------------------------- miniatura */
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * Mała strona A4 rysowana z TYCH SAMYCH wartości, którymi pojedzie dokument.
 * `szata` może być stylem z listy albo bieżącym `project.appearance` — dzięki
 * temu ten sam kod rysuje kafelek wyboru i podgląd po dostrojeniu.
 */
/**
 * Ciemniejszy wariant koloru — wyłącznie do mikroskopijnych napisów na
 * miniaturze. Złoty akcent ma na papierze 14 punktów i czyta się dobrze; ten
 * sam złoty w literach wysokich na siedem pikseli jest nieczytelny. Linie,
 * pasy i tabela na miniaturze zostają w prawdziwym kolorze akcentu — bo to
 * one niosą informację, jak dokument wygląda.
 */
function przyciemnij(hex, ile = 0.55) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#3a3a3a';
  const n = parseInt(m[1], 16);
  const kanal = (p) => Math.round(((n >> p) & 255) * (1 - ile)).toString(16).padStart(2, '0');
  return `#${kanal(16)}${kanal(8)}${kanal(0)}`;
}

function miniatura(szata) {
  const a = szata && szata.szata ? szata.szata : (szata || {});
  const akcent = esc(a.accent || '#c99a2e');
  const akcentPisma = esc(przyciemnij(a.accent || '#c99a2e'));
  const font = esc(a.fontFamily || "Georgia, 'Times New Roman', serif");
  const naglowek = ['line', 'band', 'minimal'].includes(a.headingStyle) ? a.headingStyle : 'line';
  const okladka = ['classic', 'minimal', 'photo'].includes(a.coverStyle) ? a.coverStyle : 'classic';
  const gestosc = ['compact', 'normal', 'comfortable'].includes(a.tableDensity) ? a.tableDensity : 'normal';
  const margines = Math.min(30, Math.max(10, Number(a.pageMarginMm) || 15));
  const interlinia = Math.min(1.8, Math.max(1.15, Number(a.lineHeight) || 1.38));
  const pad = Math.round(margines * 0.52);
  const odstep = (gestosc === 'compact' ? 3.1 : gestosc === 'comfortable' ? 6.2 : 4.5) * interlinia / 1.38;

  const tytul = okladka === 'photo'
    ? `<span class="mini-foto" style="border-color:${akcent}"></span>
       <span class="mini-tytul" style="color:${akcentPisma};font-family:${font}">OPERAT SZACUNKOWY</span>`
    : okladka === 'minimal'
      ? `<span class="mini-tytul mini-tytul-lewo" style="color:${akcentPisma};font-family:${font}">OPERAT SZACUNKOWY</span>
         <span class="mini-podtytul">nieruchomość lokalowa</span>`
      : `<span class="mini-kreska" style="background:${akcent}"></span>
         <span class="mini-tytul" style="color:${akcentPisma};font-family:${font}">OPERAT SZACUNKOWY</span>
         <span class="mini-podtytul">nieruchomość lokalowa</span>`;

  const naglowekRozdzialu = naglowek === 'band'
    ? `<span class="mini-h mini-h-pas" style="background:${akcent}"></span>`
    : naglowek === 'minimal'
      ? `<span class="mini-h mini-h-goly" style="background:${akcent};opacity:.55"></span>`
      : `<span class="mini-h mini-h-linia" style="background:${akcent};box-shadow:0 3px 0 -1px ${akcent}"></span>`;

  const wiersze = Array.from({ length: gestosc === 'compact' ? 7 : gestosc === 'comfortable' ? 4 : 5 })
    .map((_, i) => `<span class="mini-wiersz" style="margin-bottom:${odstep}px;width:${i % 3 === 2 ? 62 : 100}%"></span>`).join('');

  const tabela = Array.from({ length: 3 })
    .map((_, i) => `<span class="mini-td" style="background:${i % 2 ? '#fff' : akcent + '22'}"></span>`).join('');

  // Same <span>-y: miniatura stoi wewnatrz <button>, a tam wolno umiescic
  // wylacznie tresc frazowa. <div> przegladarki wprawdzie zniosa, ale uklad
  // potrafi sie po cichu rozjechac.
  return `<span class="mini-strona" aria-hidden="true" style="padding:${pad}px">
    <span class="mini-okladka">${tytul}</span>
    <span class="mini-tresc">${naglowekRozdzialu}${wiersze}<span class="mini-tabela" style="border-color:${akcent}66">${tabela}</span></span>
  </span>`;
}

const API_SZATA = { STYLE, POLA, KLUCZE, styl, zastosuj, rozpoznaj, nazwaBiezacego, miniatura, przyciemnij };
if (typeof module !== 'undefined' && module.exports) module.exports = API_SZATA;
if (typeof window !== 'undefined') window.OperoSzata = API_SZATA;

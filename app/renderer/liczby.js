'use strict';
/* ============================================================================
   OPERO — WSPOMAGANIE PRZY LICZBACH
   ----------------------------------------------------------------------------
   Rzeczoznawca wpisuje te same liczby setki razy: metraze, ceny, liczbe pokoi,
   kondygnacje, stawki procentowe. Klawiatura numeryczna to najwolniejsza
   droga, jaka mu mozna dac — zwlaszcza gdy trzeba poprawic 54,30 na 54,40
   albo 680 000 na 700 000.
   Dlatego kazde pole liczbowe dostaje trzy rzeczy:

     SUWAK          — zgrubne ustawienie jednym ruchem, w sensownym zakresie
     − i +          — poprawka o jeden krok, bez celowania w cyfre
     SZYBKIE        — wartosci, ktore w tym polu padaja najczesciej

   CZEGO TU NIE MA

   Zadnej wartosci nie wpisujemy za czlowieka. Suwak rusza sie dopiero, gdy go
   zlapie, a szybkie wartosci to PROPOZYCJE — pole zostaje zwyklym polem
   tekstowym, w ktore mozna wpisac cokolwiek, takze liczbe spoza zakresu.
   Zakres suwaka ma byc wygodny, a nie obowiazkowy.

   PRZECINEK, NIE KROPKA

   Polski zapis dziesietny to przecinek. Pola licznikowe programu sa typu
   `text` wlasnie dlatego, ze `type="number"` odrzuca przecinek i rzeczoznawca
   widzi puste pole po wpisaniu „54,30". Tu obowiazuje ta sama zasada.
   ========================================================================= */

/** Rozpoznanie rodzaju pola po jego kluczu. Jedno miejsce, bo klucze powtarzaja
 *  sie miedzy Expressem (data-ex-pole) a pelnym operatem (data-path). */
const LICZ_RODZAJE = [
  {
    id: 'malaPowierzchnia',
    klucz: /(^|\.)(balconyArea|basementArea)$/i, nazwa: /^(balkon|pow\. pom|piwnica|komorka)/,
    jednostka: 'm²', krok: 0.1, duzyKrok: 1, min: 0, max: 40, dokladnosc: 2,
    szybkie: [3, 5, 8, 12, 20],
    opis: 'Powierzchnia balkonu albo pomieszczenia przynależnego — nie wlicza się do powierzchni użytkowej lokalu.',
  },
  {
    id: 'dzialka',
    klucz: /(^|\.)(landArea|plotArea)$/i, nazwa: /^powierzchnia dzialki\b/,
    jednostka: 'm²', krok: 1, duzyKrok: 50, min: 100, max: 3000, dokladnosc: 0,
    szybkie: [300, 500, 800, 1000, 1500, 2000],
    opis: 'Powierzchnia działki z ewidencji gruntów.',
  },
  {
    id: 'powierzchnia',
    klucz: /(^|\.)(usableArea|kwArea|area|powierzchnia|szukPow)$/i, nazwa: /\b(powierzchnia|pow\.)|\[m2\]/,
    jednostka: 'm²', krok: 0.1, duzyKrok: 1, min: 10, max: 200, dokladnosc: 2,
    szybkie: [25, 35, 45, 55, 65, 75, 90],
    opis: 'Powierzchnia z dokumentu — suwak służy do zgrubnego ustawienia, dokładną wartość wpisz z ręki.',
  },
  {
    id: 'cena',
    klucz: /(^|\.)(price|cena|kwota)$/i, nazwa: /^(cena|kwota)\b/,
    jednostka: 'zł', krok: 1000, duzyKrok: 10000, min: 100000, max: 2000000, dokladnosc: 0,
    szybkie: [300000, 400000, 500000, 650000, 800000, 1000000],
    opis: 'Kwota z aktu albo z wyciągu.',
  },
  {
    id: 'cenaMetr',
    klucz: /(^|\.)(unitPrice|priceUnit|jednostkowa|zlM2)$/i, nazwa: /\[zl\/m2\]|cena 1 m2|cena jednostkowa/,
    jednostka: 'zł/m²', krok: 50, duzyKrok: 500, min: 2000, max: 25000, dokladnosc: 0,
    szybkie: [6000, 8000, 10000, 12000, 15000],
    opis: 'Cena jednostkowa — program policzy ją sam z ceny i powierzchni, jeżeli obie podasz.',
  },
  {
    id: 'pokoje',
    klucz: /(^|\.)(rooms|pokoje|izby|szukPokoje)$/i, nazwa: /^liczba (pokoi|izb)\b|^pokoje$/,
    jednostka: '', krok: 1, duzyKrok: 1, min: 1, max: 8, dokladnosc: 0,
    szybkie: [1, 2, 3, 4, 5],
    opis: 'Liczba pokoi bez kuchni, łazienki i przedpokoju.',
  },
  {
    id: 'pietro',
    klucz: /(^|\.)(floor|pietro|szukPietro)$/i, nazwa: /^pietro\b/,
    jednostka: '', krok: 1, duzyKrok: 1, min: -1, max: 20, dokladnosc: 0,
    szybkie: [0, 1, 2, 3, 4, 5],
    etykiety: { '-1': 'piwnica', 0: 'parter' },
    opis: 'Parter to 0. Program traktuje go osobno, bo ma własny rynek.',
  },
  {
    id: 'procent',
    klucz: /(^|\.)(pct|procent)$/i, nazwa: /\[%\]/,
    jednostka: '%', krok: 0.5, duzyKrok: 5, min: 0, max: 100, dokladnosc: 2,
    szybkie: [5, 10, 15, 20, 25, 30],
    opis: '',
  },
  {
    id: 'miesiace',
    klucz: /(^|\.)(months|okresMiesiecy|szukOkres)$/i, nazwa: /\[mies\.?\]/,
    jednostka: 'mies.', krok: 1, duzyKrok: 6, min: 1, max: 60, dokladnosc: 0,
    szybkie: [12, 18, 24, 36],
    opis: 'Okres, z którego bierzesz transakcje porównawcze.',
  },
  {
    id: 'promien',
    klucz: /(^|\.)(radius|promien|szukPromien)$/i, nazwa: /^promien\b/,
    jednostka: 'm', krok: 100, duzyKrok: 500, min: 200, max: 10000, dokladnosc: 0,
    szybkie: [500, 1000, 1500, 2500, 5000],
    opis: 'Promień wokół wycenianej nieruchomości.',
  },
  {
    id: 'rok',
    klucz: /(^|\.)(year|buildYear|yearBuilt)$/i, nazwa: /^rok budowy\b/,
    jednostka: '', krok: 1, duzyKrok: 10, min: 1850, max: 2030, dokladnosc: 0,
    szybkie: [1960, 1975, 1990, 2005, 2015, 2022],
    opis: '',
  },
];

/**
 * Rodzaj pola liczbowego — po KLUCZU pola albo po jego NAZWIE.
 *
 * Wzorce sa waskie celowo. Luzne dopasowanie („cena" gdziekolwiek
 * w tekscie) trafialo w „oCENA", „mies" w „poMIESzczenie", a „wartosc"
 * w pozycje listy rodzajow prawa — i pole slowne dostawalo suwak z cenami,
 * ktory wpisywal w nie 400 000 zl. Lepiej, zeby pole liczbowe nie dostalo
 * wspomagania, niz zeby pole slowne dostalo cudze.
 */
function liczUprosc(t) {
  return String(t || '').toLowerCase().replace(/ł/g, 'l').replace(/²/g, '2')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}
function liczRodzaj(klucz, etykieta = '') {
  const k = String(klucz || '');
  const n = liczUprosc(etykieta);
  // Kolejnosc ma znaczenie: „cena 1 m2" musi trafic w cenaMetr, a nie w cena.
  const po = ['cenaMetr', 'malaPowierzchnia', 'dzialka', 'powierzchnia', 'cena', 'pokoje', 'pietro', 'promien', 'miesiace', 'procent', 'rok'];
  for (const id of po) {
    const r = LICZ_RODZAJE.find(x => x.id === id);
    if (r && k && r.klucz.test(k)) return r;
  }
  for (const id of po) {
    const r = LICZ_RODZAJE.find(x => x.id === id);
    if (r && n && r.nazwa.test(n)) return r;
  }
  return null;
}

/** Liczba z pola — po polsku, z przecinkiem i spacjami tysiecy. */
function liczZPola(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).replace(/\s| /g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Liczba do pola — przecinek dziesietny, bez ogona zer. */
function liczDoPola(n, dokladnosc = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '';
  return x.toLocaleString('pl-PL', { maximumFractionDigits: dokladnosc, useGrouping: false });
}

/** Napis pod suwakiem: „2 500 zł/m²", „parter", „3 pokoje". */
function liczOpisWartosci(n, rodzaj) {
  const r = rodzaj || {};
  if (n == null) return '—';
  if (r.etykiety && r.etykiety[String(n)]) return r.etykiety[String(n)];
  const liczba = Number(n).toLocaleString('pl-PL', { maximumFractionDigits: r.dokladnosc ?? 2 });
  return r.jednostka ? `${liczba} ${r.jednostka}` : liczba;
}

/**
 * Zakres suwaka dopasowany do tego, co juz stoi w polu.
 *
 * Sztywny zakres jest bezuzyteczny przy wartosciach spoza niego: kto wycenia
 * lokal za 3 mln, nie moze miec suwaka konczacego sie na 2 mln. Zakres
 * rozszerza sie wiec wokol wpisanej wartosci, zamiast ja obcinac.
 */
function liczZakres(wartosc, rodzaj) {
  const r = rodzaj || {};
  let min = Number(r.min) || 0, max = Number(r.max) || 100;
  const w = liczZPola(wartosc);
  if (w != null) {
    if (w < min) min = Math.floor(w - (max - min) * 0.1);
    if (w > max) max = Math.ceil(w + (max - min) * 0.1);
  }
  if (max <= min) max = min + (Number(r.krok) || 1) * 10;
  return { min, max };
}

/** Krok suwaka: na tyle drobny, zeby dalo sie trafic, i nie drobniejszy. */
function liczKrokSuwaka(rodzaj, zakres) {
  const r = rodzaj || {};
  const rozpietosc = Math.max(1, zakres.max - zakres.min);
  const krok = Number(r.krok) || 1;
  // Przy 200 krokach suwak jest nieporeczny; przy 2000 — nie do trafienia.
  const ile = rozpietosc / krok;
  if (ile <= 400) return krok;
  return Math.pow(10, Math.ceil(Math.log10(rozpietosc / 400)));
}

const API_LICZBY = {
  RODZAJE: LICZ_RODZAJE,
  rodzaj: liczRodzaj, zPola: liczZPola, doPola: liczDoPola,
  opisWartosci: liczOpisWartosci, zakres: liczZakres, krokSuwaka: liczKrokSuwaka,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_LICZBY;
if (typeof window !== 'undefined') window.OperoLiczby = API_LICZBY;

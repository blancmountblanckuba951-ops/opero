'use strict';
/* ============================================================================
   OPERO — NUMER KSIĘGI WIECZYSTEJ
   ----------------------------------------------------------------------------
   Czego ten moduł NIE robi i dlaczego: nie wyszukuje księgi po adresie.
   Ministerstwo Sprawiedliwości nie udostępnia takiej usługi, a EKW wymaga
   znajomości numeru i broni się przed automatami. Serwisy, które wyszukują po
   adresie, mają własne bazy budowane latami — i jest to ich osobny biznes.
   Udawanie, że program to potrafi, skończyłoby się tym, że rzeczoznawca
   czekałby na wynik, który nigdy nie przyjdzie.

   Co robi naprawdę, i co jest realnie przydatne przy operacie:
     * składa numer z kodu wydziału i numeru księgi,
     * liczy cyfrę kontrolną i sprawdza, czy podany numer jest poprawny,
     * wskazuje najbardziej prawdopodobną literówkę, gdy numer się nie zgadza,
     * przygotowuje komplet danych do wklejenia w EKW albo w wyszukiwarkę.

   Algorytm cyfry kontrolnej jest jawny i deterministyczny: każdy znak ma swoją
   wartość, wagi 1-3-7 powtarzają się cyklicznie, a cyfrą kontrolną jest reszta
   z dzielenia sumy iloczynów przez 10.
   ============================================================================ */

/** Wartości znaków. Litery zaczynają się od X=10 — tak, jak w algorytmie. */
const WARTOSCI_KW = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  X: 10, A: 11, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19, J: 20,
  K: 21, L: 22, M: 23, N: 24, O: 25, P: 26, R: 27, S: 28, T: 29, U: 30, W: 31,
  Y: 32, Z: 33,
};
const WAGI_KW = [1, 3, 7];

/** Zostawia tylko znaki, które mogą być częścią numeru. */
function oczyscKW(tekst) {
  return String(tekst == null ? '' : tekst).toUpperCase().replace(/[^0-9A-Z]/g, '');
}

/**
 * Rozbiera dowolny zapis numeru na części. Przyjmuje „GD1G/00012345/7”,
 * „gd1g 12345 7”, a także sam kod i sam numer — rzeczoznawca przepisuje numer
 * z dokumentu albo wkleja go ze strony, i jedno i drugie ma zadziałać.
 */
function rozbijKW(tekst) {
  const surowy = String(tekst == null ? '' : tekst);

  // Gdy ktoś wpisał ukośniki, to on mówi nam, gdzie kończy się która część —
  // i to jest pewniejsze niż jakiekolwiek zgadywanie po długości. Bez tego
  // „WL1A/272852/9" dałoby się odczytać na dwa sposoby i jeden z nich byłby zły.
  const czesci = surowy.split('/').map(oczyscKW).filter(Boolean);
  if (czesci.length >= 2) {
    const kod = czesci[0].slice(0, 4);
    const numer = czesci[1].slice(0, 8).padStart(8, '0');
    const kontrolna = czesci.length >= 3 ? czesci[2].slice(0, 1) : '';
    return { kod, numer, kontrolna };
  }

  const czyste = oczyscKW(surowy);
  if (czyste.length < 4) return { kod: czyste, numer: '', kontrolna: '' };
  const kod = czyste.slice(0, 4);
  const reszta = czyste.slice(4);
  // Bez ukośników: dziewięć znaków to numer i cyfra kontrolna, osiem to sam
  // numer, a krótszy zapis dopełniamy zerami — EKW pisze 00012345, ludzie 12345.
  if (reszta.length >= 9) return { kod, numer: reszta.slice(0, 8), kontrolna: reszta.slice(8, 9) };
  if (reszta.length === 8) return { kod, numer: reszta, kontrolna: '' };
  return { kod, numer: reszta.padStart(8, '0'), kontrolna: '' };
}

/**
 * Cyfra kontrolna dla kodu wydziału i ośmiocyfrowego numeru.
 * Zwraca null, gdy danych nie da się policzyć — nie zgadujemy.
 */
function cyfraKontrolnaKW(kod, numer) {
  const znaki = `${oczyscKW(kod)}${oczyscKW(numer).padStart(8, '0')}`;
  if (znaki.length !== 12) return null;
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const w = WARTOSCI_KW[znaki[i]];
    if (w === undefined) return null;
    suma += w * WAGI_KW[i % 3];
  }
  return suma % 10;
}

/** Numer w postaci urzędowej: KOD/NUMER/CYFRA. */
function formatujKW(kod, numer, kontrolna) {
  const k = oczyscKW(kod), n = oczyscKW(numer).padStart(8, '0');
  const c = kontrolna === '' || kontrolna == null ? cyfraKontrolnaKW(k, n) : kontrolna;
  return c == null ? `${k}/${n}` : `${k}/${n}/${c}`;
}

/** Czy kod wydziału ma właściwy kształt: dwie litery, cyfra, litera. */
function kodWydzialuPoprawny(kod) {
  return /^[A-Z]{2}[0-9][A-Z]$/.test(oczyscKW(kod));
}

/**
 * Sprawdza numer i mówi, co z nim jest nie tak.
 *
 * Przy błędnej cyfrze kontrolnej szukamy JEDNEJ przestawionej albo pomylonej
 * litery lub cyfry — bo tak właśnie wygląda przepisanie numeru z dokumentu.
 * Podpowiedź jest podpowiedzią, nie wyrokiem: zawsze mówimy, że trzeba
 * sprawdzić w dokumencie.
 */
function sprawdzKW(tekst) {
  const { kod, numer, kontrolna } = rozbijKW(tekst);
  const czyste = oczyscKW(tekst);

  if (!czyste) return { ok: false, powod: 'PUSTE', opis: 'Nie podano numeru księgi wieczystej.' };
  // O „za krótkim" numerze mówimy wtedy, gdy po kodzie wydziału nie ma ANI JEDNEJ
  // cyfry. Pominięte zera wiodące to nie jest błąd — tak numer zapisuje większość
  // ludzi i program ma to po prostu uzupełnić.
  if (!numer || !/[1-9]/.test(numer)) {
    return { ok: false, powod: 'ZA_KROTKI', kod, numer,
      opis: 'Numer jest za krótki. Pełny numer to kod wydziału, osiem cyfr i cyfra kontrolna.' };
  }
  if (!kodWydzialuPoprawny(kod)) {
    return { ok: false, powod: 'ZLY_KOD', kod, numer,
      opis: `„${kod}" nie wygląda na kod wydziału. Kod to dwie litery, cyfra i litera — na przykład GD1G.` };
  }
  if (!/^[0-9]{8}$/.test(numer)) {
    return { ok: false, powod: 'ZLY_NUMER', kod, numer,
      opis: 'Środkowa część numeru musi mieć osiem cyfr.' };
  }

  const policzona = cyfraKontrolnaKW(kod, numer);
  const pelny = formatujKW(kod, numer, policzona);

  if (kontrolna === '') {
    return { ok: true, uzupelniona: true, kod, numer, kontrolna: String(policzona), pelny,
      opis: `Dopisałem cyfrę kontrolną: ${policzona}.` };
  }
  if (String(policzona) === String(kontrolna)) {
    return { ok: true, kod, numer, kontrolna: String(kontrolna), pelny, opis: 'Numer jest poprawny.' };
  }

  return {
    ok: false, powod: 'ZLA_KONTROLNA', kod, numer, kontrolna: String(kontrolna),
    poprawnaKontrolna: String(policzona), pelny,
    // Propozycja: ten sam numer z policzoną cyfrą kontrolną.
    propozycja: pelny,
    innychMozliwosci: mozliwePoprawki(kod, numer, kontrolna),
    opis: `Cyfra kontrolna się nie zgadza: podano ${kontrolna}, a z tych dwunastu znaków wychodzi ${policzona}.`,
  };
}

/**
 * Co zrobić z numerem, który nie przechodzi kontroli.
 *
 * Pierwsza i prawie zawsze słuszna odpowiedź: to cyfra kontrolna jest przepisana
 * źle, bo stoi na końcu i jest jedna. Dlatego podajemy numer z policzoną cyfrą
 * jako propozycję.
 *
 * Ale uczciwość wymaga dopowiedzenia drugiej połowy: przy tym algorytmie
 * pomyłka w KAŻDYM z ośmiu znaków daje się „naprawić" jedną inną cyfrą, więc
 * wariantów jest tyle samo co znaków. Liczymy je i mówimy ile ich jest —
 * zamiast wskazywać jeden i udawać, że to on. Numeru księgi się nie zgaduje.
 */
function mozliwePoprawki(kod, numer, kontrolna) {
  const znaki = `${kod}${numer}`.split('');
  const warianty = new Set();
  for (let i = 4; i < 12; i++) {
    for (let c = 0; c <= 9; c++) {
      if (String(c) === znaki[i]) continue;
      const proba = znaki.slice(); proba[i] = String(c);
      const k = proba.slice(0, 4).join(''), n = proba.slice(4).join('');
      if (String(cyfraKontrolnaKW(k, n)) === String(kontrolna)) warianty.add(formatujKW(k, n, kontrolna));
    }
  }
  return warianty.size;
}

/* ------------------------------------------------------- wyszukiwanie treści */

/**
 * Składa dane do wyszukiwarki treści ksiąg wieczystych.
 *
 * Program NIE przeszukuje ksiąg — przygotowuje komplet danych i otwiera serwis,
 * który to potrafi. Dzięki temu nie trzeba przepisywać adresu drugi raz, a
 * rzeczoznawca widzi dokładnie to, co zostanie użyte do szukania.
 */
const TYPY_KW = [
  { id: 'dzialki', nazwa: 'Działki' },
  { id: 'budynki', nazwa: 'Budynki / domy' },
  { id: 'lokale', nazwa: 'Lokale' },
];

function zapytanieKW(dane) {
  const d = dane || {};
  const adres = [
    d.ulica ? String(d.ulica).trim() : '',
    d.numer ? String(d.numer).trim() : '',
    d.lokal ? `/${String(d.lokal).trim()}` : '',
  ].join(' ').replace(/\s+\//, '/').trim();
  const typ = TYPY_KW.find(t => t.id === d.typ) || TYPY_KW[2];
  return {
    typ: typ.id,
    typNazwa: typ.nazwa,
    kodWydzialu: oczyscKW(d.kodWydzialu),
    wojewodztwo: String(d.wojewodztwo || '').trim(),
    sad: String(d.sad || '').trim(),
    adres,
    lokalizacja: String(d.lokalizacja || '').trim(),
    // Do schowka: jedno zdanie, które da się wkleić w dowolną wyszukiwarkę.
    doSchowka: [adres, String(d.lokalizacja || '').trim()].filter(Boolean).join(', '),
    gotowe: !!(adres || String(d.lokalizacja || '').trim()),
  };
}

/**
 * Wyciąga kody wydziałów z numerów KW, które rzeczoznawca już kiedyś wpisał.
 * Lista podpowiedzi rośnie więc razem z jego pracą, zamiast udawać kompletny
 * wykaz sądów, którego nie mamy skąd wziąć w sposób pewny.
 */
function kodyZHistorii(numery) {
  const licznik = new Map();
  for (const n of numery || []) {
    const { kod } = rozbijKW(n);
    if (!kodWydzialuPoprawny(kod)) continue;
    licznik.set(kod, (licznik.get(kod) || 0) + 1);
  }
  return [...licznik.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([kod, ile]) => ({ kod, ile }));
}

const API_KW = {
  oczysc: oczyscKW, rozbij: rozbijKW, cyfraKontrolna: cyfraKontrolnaKW,
  formatuj: formatujKW, kodPoprawny: kodWydzialuPoprawny, sprawdz: sprawdzKW,
  zapytanie: zapytanieKW, kodyZHistorii, mozliwePoprawki, TYPY: TYPY_KW,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_KW;
if (typeof window !== 'undefined') window.OperoKW = API_KW;

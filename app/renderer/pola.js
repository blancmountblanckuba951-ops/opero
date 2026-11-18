'use strict';
/* ============================================================================
   OPERO — POLA, KTÓRE NIE DAJĄ SIĘ ŹLE WYPEŁNIĆ
   ----------------------------------------------------------------------------
   Najtańszy błąd w operacie to ten, którego nie da się popełnić. Literówka
   w powierzchni albo przecinek w złym miejscu przechodzi przez cały dokument
   aż do wartości końcowej i wychodzi dopiero przy weryfikacji — albo nie
   wychodzi wcale.

   Trzy zasady, od których nie ma tu odstępstwa:

   1. POLE PRZYJMUJE TYLKO TO, CO MA SENS. W powierzchnię nie da się wpisać
      litery, w imię — cyfry, w numer księgi — znaku, którego księgi nie mają.

   2. PROGRAM NIE PODMIENIA WARTOŚCI PO CICHU. Formatowanie w locie (spacje
      w tysiącach, wielkie litery w kodzie wydziału) jest widoczne i odwracalne.
      Nigdy nie poprawiamy CYFRY — poprawiony „3" na „8", nawet trafnie, to
      cudza liczba w cudzym operacie.

   3. KAŻDA ODMOWA MA POWÓD NAPISANY PO LUDZKU. „Nieprawidłowa wartość" nie
      mówi nic. „Powierzchnia użytkowa lokalu nie bywa większa niż 1000 m² —
      sprawdź, czy to nie pomyłka" mówi wszystko.

   Numer księgi wieczystej wpisuje się DOKŁADNIE tak jak w EKW: cztery znaki
   kodu wydziału, osiem cyfr numeru i jedna cyfra kontrolna, w trzech polach,
   z automatycznym przeskokiem między nimi.
   ========================================================================= */

/* ------------------------------------------------------------------ liczby */

/** Zamiana tego, co człowiek wpisał, na liczbę. Przecinek i kropka równoważne. */
function polaNaLiczbe(tekst) {
  const t = String(tekst ?? '').replace(/\s| /g, '').replace(',', '.');
  if (t === '' || t === '-' || t === '.') return null;
  if (!/^-?\d*\.?\d*$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Liczba w zapisie polskim: spacje w tysiącach, przecinek dziesiętny. */
function polaPokazLiczbe(n, miejsc = 2) {
  if (n === null || n === undefined || !Number.isFinite(Number(n))) return '';
  return Number(n).toLocaleString('pl-PL', { minimumFractionDigits: miejsc, maximumFractionDigits: miejsc });
}

/**
 * Przepuszczamy tylko znaki, które mogą należeć do liczby — i tylko w miejscu,
 * w którym mają sens. Drugi przecinek nie wejdzie, minus w środku też nie.
 */
function polaFiltrujLiczbe(tekst, { ujemne = false, miejsc = 2 } = {}) {
  let t = String(tekst ?? '').replace(/[^0-9,.\- ]/g, '').replace(/\./g, ',').replace(/\s| /g, '');
  if (!ujemne) t = t.replace(/-/g, '');
  else t = (t.startsWith('-') ? '-' : '') + t.replace(/-/g, '');
  const znak = t.startsWith('-') ? '-' : '';
  const reszta = znak ? t.slice(1) : t;
  const czesci = reszta.split(',');
  let wynik = czesci.shift() || '';
  // Pole calkowite nie ma czesci dziesietnej - wiszacy przecinek tez nie.
  if (czesci.length && miejsc > 0) wynik += ',' + czesci.join('').slice(0, miejsc);
  return znak + wynik;
}

/** Jedna definicja pola liczbowego: zakres, liczba miejsc i zdanie o błędzie. */
const POLA_LICZBOWE = {
  powierzchnia: { nazwa: 'Powierzchnia', min: 0.1, max: 100000, miejsc: 2, jednostka: 'm²',
    podpowiedz: 'Powierzchnia w metrach kwadratowych, np. 54,20.' },
  powierzchniaLokalu: { nazwa: 'Powierzchnia użytkowa lokalu', min: 5, max: 1000, miejsc: 2, jednostka: 'm²',
    podpowiedz: 'Z rzutu albo z wypisu, np. 54,20.',
    ostrzezenie: (v) => (v > 400 ? 'To bardzo duży lokal — sprawdź, czy nie chodzi o powierzchnię budynku.' : '') },
  powierzchniaDzialki: { nazwa: 'Powierzchnia działki', min: 1, max: 10000000, miejsc: 0, jednostka: 'm²',
    podpowiedz: 'Z wypisu z ewidencji, w metrach kwadratowych.' },
  cena: { nazwa: 'Cena', min: 1, max: 1000000000, miejsc: 2, jednostka: 'zł',
    podpowiedz: 'Kwota w złotych, np. 480 000.' },
  cenaM2: { nazwa: 'Cena jednostkowa', min: 1, max: 200000, miejsc: 2, jednostka: 'zł/m²',
    podpowiedz: 'Cena za metr kwadratowy.' },
  procent: { nazwa: 'Wartość procentowa', min: 0, max: 100, miejsc: 2, jednostka: '%',
    podpowiedz: 'Liczba od 0 do 100.' },
  stopa: { nazwa: 'Stopa', min: 0.1, max: 30, miejsc: 2, jednostka: '%',
    podpowiedz: 'Stopa roczna w procentach, np. 7,25.',
    ostrzezenie: (v) => (v > 15 ? 'Stopa powyżej 15% jest na polskim rynku wyjątkowa — sprawdź, czy to nie pomyłka.' : '') },
  lata: { nazwa: 'Liczba lat', min: 0, max: 200, miejsc: 0, jednostka: 'lat',
    podpowiedz: 'Pełne lata.' },
  sztuki: { nazwa: 'Liczba', min: 0, max: 10000, miejsc: 0, jednostka: '',
    podpowiedz: 'Liczba całkowita.' },
};

function polaSprawdzLiczbe(wartosc, rodzaj = 'powierzchnia') {
  const d = POLA_LICZBOWE[rodzaj] || POLA_LICZBOWE.powierzchnia;
  const surowy = String(wartosc ?? '').trim();
  if (!surowy) return { ok: false, pusty: true, powod: `${d.nazwa}: pole jest puste.`, wartosc: null };
  const n = polaNaLiczbe(surowy);
  if (n === null) {
    return { ok: false, powod: `${d.nazwa}: to nie jest liczba. ${d.podpowiedz}`, wartosc: null };
  }
  if (n < d.min) return { ok: false, powod: `${d.nazwa}: wartość mniejsza niż ${polaPokazLiczbe(d.min, d.miejsc)} ${d.jednostka}.`.trim(), wartosc: n };
  if (n > d.max) return { ok: false, powod: `${d.nazwa}: wartość większa niż ${polaPokazLiczbe(d.max, d.miejsc)} ${d.jednostka}. Sprawdź, czy nie ma dodatkowego zera.`.trim(), wartosc: n };
  const ostrzezenie = typeof d.ostrzezenie === 'function' ? d.ostrzezenie(n) : '';
  return { ok: true, powod: '', wartosc: n, ostrzezenie, pokaz: polaPokazLiczbe(n, d.miejsc) };
}

/* ------------------------------------------------------------------ nazwiska */

// Nazwiska bywaja dwuczlonowe, z apostrofem i ze spacja - ale NIGDY z cyfra.
const POLA_ZNAKI_IMIENIA = /^[\p{L}][\p{L}\s'’.\-]*$/u;

function polaFiltrujImie(tekst) {
  return String(tekst ?? '').replace(/[0-9_@#$%^&*+=<>{}[\]()\\/|~`]/g, '');
}

function polaSprawdzImie(wartosc, { nazwa = 'Imię i nazwisko', wymagane = true } = {}) {
  const t = String(wartosc ?? '').trim().replace(/\s{2,}/g, ' ');
  if (!t) return { ok: !wymagane, pusty: true, powod: wymagane ? `${nazwa}: pole jest puste.` : '', wartosc: '' };
  if (/\d/.test(t)) return { ok: false, powod: `${nazwa}: nie zawiera cyfr. Jeśli to oznaczenie firmy z numerem, wpisz je w polu firmy.`, wartosc: t };
  if (!POLA_ZNAKI_IMIENIA.test(t)) return { ok: false, powod: `${nazwa}: dopuszczalne są litery, spacja, myślnik i apostrof.`, wartosc: t };
  if (t.length < 3) return { ok: false, powod: `${nazwa}: to za krótkie, żeby było imieniem i nazwiskiem.`, wartosc: t };
  return { ok: true, powod: '', wartosc: t };
}

/* ------------------------------------------- numer księgi wieczystej (EKW) */

// Wartosci znakow w numerze ksiegi: cyfry to one same, X to 10, a litery ida
// od 11 w KOLEJNOSCI UZYWANEJ W NUMERACH KSIAG - bez Q i bez V. Pomylka w tej
// jednej tablicy sprawia, ze program odrzuca prawdziwe numery i przyjmuje
// zmyslone, a wyglada przy tym na pewny siebie.
const POLA_LITERY_KW = 'ABCDEFGHIJKLMNOPRSTUWYZ';
const WARTOSCI_ZNAKU_KW = { X: 10 };
for (let i = 0; i < 10; i++) WARTOSCI_ZNAKU_KW[String(i)] = i;
POLA_LITERY_KW.split('').forEach((l, i) => { WARTOSCI_ZNAKU_KW[l] = i + 11; });
const WAGI_POZYCJI_KW = [1, 3, 7];

/** Cyfra kontrolna liczona tak, jak liczy ją EKW. */
function polaCyfraKontrolna(kod, numer) {
  const ciag = `${String(kod || '').toUpperCase()}${String(numer || '')}`;
  if (ciag.length !== 12) return null;
  let suma = 0;
  for (let i = 0; i < 12; i++) {
    const w = WARTOSCI_ZNAKU_KW[ciag[i]];
    if (w === undefined) return null;
    suma += w * WAGI_POZYCJI_KW[i % 3];
  }
  return suma % 10;
}

/**
 * Trzy pola, dokładnie jak w EKW: KOD / NUMER / CYFRA.
 * Program sprawdza cyfrę kontrolną, ale jej NIE POPRAWIA — podmiana ostatniej
 * cyfry robi z jednej istniejącej księgi inną istniejącą księgę.
 */
function polaFiltrujKod(tekst) {
  return String(tekst ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 4);
}
function polaFiltrujNumerKw(tekst) {
  return String(tekst ?? '').replace(/\D/g, '').slice(0, 8);
}
function polaFiltrujCyfre(tekst) {
  return String(tekst ?? '').replace(/\D/g, '').slice(0, 1);
}

/** Wklejony numer w dowolnym zapisie rozbijamy na trzy pola. */
function polaRozbijKw(tekst) {
  const t = String(tekst ?? '').toUpperCase().replace(/\s| /g, '');
  const zUkosnikami = /^([0-9A-Z]{4})\/(\d{1,8})\/(\d)$/.exec(t);
  if (zUkosnikami) return { kod: zUkosnikami[1], numer: zUkosnikami[2].padStart(8, '0'), kontrolna: zUkosnikami[3] };
  const ciagiem = /^([0-9A-Z]{4})(\d{8})(\d)$/.exec(t.replace(/\//g, ''));
  if (ciagiem) return { kod: ciagiem[1], numer: ciagiem[2], kontrolna: ciagiem[3] };
  const bezKontrolnej = /^([0-9A-Z]{4})\/?(\d{1,8})$/.exec(t);
  if (bezKontrolnej) return { kod: bezKontrolnej[1], numer: bezKontrolnej[2].padStart(8, '0'), kontrolna: '' };
  return { kod: polaFiltrujKod(t.slice(0, 4)), numer: '', kontrolna: '' };
}

function polaSprawdzKw({ kod, numer, kontrolna } = {}) {
  const k = polaFiltrujKod(kod);
  const n = String(numer ?? '').replace(/\D/g, '');
  const c = polaFiltrujCyfre(kontrolna);
  const pelny = `${k}/${n.padStart(8, '0')}/${c}`;

  if (!k && !n && !c) return { ok: false, pusty: true, powod: '', etap: 'kod' };
  if (k.length < 4) return { ok: false, powod: 'Kod wydziału ma cztery znaki, np. GD1G.', etap: 'kod' };
  if (!/^[A-Z]{2}\d[A-Z]$/.test(k)) {
    return { ok: false, powod: `Kod wydziału wygląda inaczej niż zwykle (dwie litery, cyfra, litera — np. GD1G). Sprawdź „${k}”.`, etap: 'kod', ostrzezenie: true };
  }
  if (!n) return { ok: false, powod: 'Wpisz numer księgi — osiem cyfr, zera z przodu możesz pominąć.', etap: 'numer' };
  if (!c) {
    const policzona = polaCyfraKontrolna(k, n.padStart(8, '0'));
    return { ok: false, powod: policzona === null
      ? 'Wpisz cyfrę kontrolną — ostatnią cyfrę numeru księgi.'
      : `Wpisz cyfrę kontrolną. Dla tego numeru poprawna jest ${policzona} — sprawdź na dokumencie, zanim ją wpiszesz.`,
      etap: 'kontrolna', podpowiedziana: policzona };
  }
  const policzona = polaCyfraKontrolna(k, n.padStart(8, '0'));
  if (policzona === null) return { ok: false, powod: 'Tego numeru nie da się sprawdzić — upewnij się, że kod wydziału jest poprawny.', etap: 'kod' };
  if (String(policzona) !== c) {
    // NIE podmieniamy cyfry. Mowimy, co nie gra, i zostawiamy decyzje czlowiekowi.
    return { ok: false, etap: 'kontrolna',
      powod: `Cyfra kontrolna nie zgadza się z numerem. Dla ${k}/${n.padStart(8, '0')} poprawna byłaby ${policzona}, a wpisano ${c}. `
        + 'To zwykle literówka w numerze, nie w cyfrze — porównaj z dokumentem.',
      poprawna: policzona, pelny };
  }
  return { ok: true, powod: 'Numer jest poprawny.', pelny, kod: k, numer: n.padStart(8, '0'), kontrolna: c };
}

/* ---------------------------------------------------------------- daty */

function polaSprawdzDate(wartosc, { nazwa = 'Data', odDnia = '', doDnia = '', wymagane = true } = {}) {
  const t = String(wartosc ?? '').trim();
  if (!t) return { ok: !wymagane, pusty: true, powod: wymagane ? `${nazwa}: pole jest puste.` : '', wartosc: '' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return { ok: false, powod: `${nazwa}: wybierz datę z kalendarza.`, wartosc: t };
  // Date.parse('2026-02-31') NIE jest bledem - przeglada sie na 3 marca.
  // Dlatego sprawdzamy, czy data wrocila taka sama, jaka weszla.
  const d = new Date(`${t}T00:00:00Z`);
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== t) {
    return { ok: false, powod: `${nazwa}: takiej daty nie ma w kalendarzu.`, wartosc: t };
  }
  if (odDnia && t < odDnia) return { ok: false, powod: `${nazwa}: nie może być wcześniejsza niż ${odDnia}.`, wartosc: t };
  if (doDnia && t > doDnia) return { ok: false, powod: `${nazwa}: nie może być późniejsza niż ${doDnia}.`, wartosc: t };
  return { ok: true, powod: '', wartosc: t };
}

/* ------------------------------------------------------------- podpięcie */

/**
 * Podpięcie pod pole w interfejsie. Filtr działa przy pisaniu (źle się nie da
 * wpisać), sprawdzenie przy wyjściu z pola (dopiero wtedy wiadomo, czy człowiek
 * skończył). Komunikat ląduje pod polem, a nie w okienku, bo okienko trzeba
 * zamknąć, zanim się poprawi.
 */
function polaPodepnij(pole, { rodzaj = 'powierzchnia', nazwa = '', wymagane = false, przyZmianie } = {}) {
  if (!pole || pole.dataset.operoPole) return;
  pole.dataset.operoPole = rodzaj;
  pole.setAttribute('inputmode', rodzaj === 'imie' ? 'text' : 'decimal');
  pole.setAttribute('autocomplete', 'off');

  const komunikat = () => {
    let el = pole.parentElement?.querySelector(':scope > .pole-blad');
    if (!el) {
      el = document.createElement('span');
      el.className = 'pole-blad';
      pole.parentElement?.appendChild(el);
    }
    return el;
  };
  const pokazBlad = (tekst, rodzajBledu = 'blad') => {
    const el = komunikat();
    el.textContent = tekst || '';
    el.dataset.rodzaj = rodzajBledu;
    pole.classList.toggle('pole-niepoprawne', !!tekst && rodzajBledu === 'blad');
    pole.setAttribute('aria-invalid', tekst && rodzajBledu === 'blad' ? 'true' : 'false');
  };

  pole.addEventListener('input', () => {
    const przed = pole.value;
    const po = rodzaj === 'imie' ? polaFiltrujImie(przed) : polaFiltrujLiczbe(przed, { miejsc: (POLA_LICZBOWE[rodzaj] || {}).miejsc ?? 2 });
    if (po !== przed) {
      const pozycja = Math.max(0, (pole.selectionStart || po.length) - (przed.length - po.length));
      pole.value = po;
      try { pole.setSelectionRange(pozycja, pozycja); } catch {}
    }
    if (pole.classList.contains('pole-niepoprawne')) pokazBlad('');
  });

  pole.addEventListener('blur', () => {
    const w = rodzaj === 'imie'
      ? polaSprawdzImie(pole.value, { nazwa: nazwa || 'To pole', wymagane })
      : polaSprawdzLiczbe(pole.value, rodzaj);
    if (w.pusty && !wymagane) { pokazBlad(''); return; }
    if (!w.ok) { pokazBlad(w.powod); return; }
    pokazBlad(w.ostrzezenie || '', 'uwaga');
    if (typeof przyZmianie === 'function') przyZmianie(w.wartosc);
  });
}

// Nazwy wewnatrz pliku musza byc unikalne w calej stronie (wszystkie skrypty
// renderera dziela jeden zakres globalny), ale NA ZEWNATRZ modul wystawia
// nazwy krotkie i czytelne.
const API_POLA = {
  LICZBOWE: POLA_LICZBOWE,
  naLiczbe: polaNaLiczbe, pokazLiczbe: polaPokazLiczbe,
  filtrujLiczbe: polaFiltrujLiczbe, sprawdzLiczbe: polaSprawdzLiczbe,
  filtrujImie: polaFiltrujImie, sprawdzImie: polaSprawdzImie,
  cyfraKontrolna: polaCyfraKontrolna, filtrujKodWydzialu: polaFiltrujKod,
  filtrujNumerKw: polaFiltrujNumerKw, filtrujCyfreKontrolna: polaFiltrujCyfre,
  rozbijKw: polaRozbijKw, sprawdzKw: polaSprawdzKw,
  sprawdzDate: polaSprawdzDate, podepnij: polaPodepnij,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_POLA;
if (typeof window !== 'undefined') window.OperoPola = API_POLA;

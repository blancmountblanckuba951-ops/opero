'use strict';
/* ============================================================================
   OPERO — OKNO ODPOWIEDZI
   ----------------------------------------------------------------------------
   Program mówi do rzeczoznawcy dużo: ile transakcji pobrał, czego mu brakuje,
   który dokument trzeba dołożyć, na którym etapie szukania jest. Dotąd te
   zdania pojawiały się tam, gdzie akurat było miejsce — i trzeba było
   przewijać stronę do góry, żeby sprawdzić, co program właściwie powiedział.

   To jest błąd w obsłudze, nie drobiazg. Rzeczoznawca pracuje nad wyceną, a
   nie nad szukaniem komunikatów: jeżeli odpowiedź programu da się przegapić,
   to znaczy, że program jej nie udzielił.

   Dlatego KAŻDA odpowiedź programu idzie w jedno miejsce: okno odpowiedzi.
   Okno zostaje otwarte obok pracy, zbiera wszystko po kolei, liczy to, czego
   nie przeczytano, i pozwala wrócić do zdania sprzed godziny.

   Zasady, które ten moduł pilnuje:

   1. NIC SIĘ NIE GUBI. Dopóki okno nie zostanie wyczyszczone ręcznie, każdy
      komunikat w nim jest. Przy przepełnieniu znikają NAJSTARSZE, nigdy
      najnowsze, i okno mówi, ile ich ubyło.

   2. KOMUNIKAT MA RODZAJ. Pytanie do człowieka wygląda inaczej niż etap
      szukania, a błąd inaczej niż powodzenie — bo inaczej się na nie reaguje.

   3. POWTÓRZENIA SIĘ ZLICZA, A NIE MNOŻY. Dwadzieścia razy „pobieram cennik"
      to jeden wiersz z licznikiem; inaczej okno przewijałoby się samo i
      zasypałoby zdanie, na które człowiek czeka.

   4. ETAP ZASTĘPUJE ETAP. Przy szukaniu liczy się to, gdzie program jest
      TERAZ. Poprzednie etapy zostają w historii, ale na wierzchu jest bieżący.

   5. DA SIĘ TO WYNIEŚĆ. Cała rozmowa z programem zapisuje się tekstem — do
      notatek do sprawy albo do zgłoszenia, gdy coś nie działa.
   ========================================================================= */

const OKNO_RODZAJE = {
  PYTANIE: 'pytanie',       // program czegoś potrzebuje od człowieka
  ODPOWIEDZ: 'odpowiedz',   // program odpowiada na to, o co go poproszono
  ETAP: 'etap',             // trwa praca: który krok, w którym źródle
  SUKCES: 'sukces',
  OSTRZEZENIE: 'ostrzezenie',
  BLAD: 'blad',
  INFO: 'info',
};

const OKNO_OPISY = {
  pytanie: { znak: '?', nazwa: 'Pytanie', waga: 5 },
  blad: { znak: '!', nazwa: 'Błąd', waga: 4 },
  ostrzezenie: { znak: '△', nazwa: 'Ostrzeżenie', waga: 3 },
  odpowiedz: { znak: '→', nazwa: 'Odpowiedź', waga: 2 },
  sukces: { znak: '✓', nazwa: 'Gotowe', waga: 2 },
  etap: { znak: '◌', nazwa: 'W toku', waga: 1 },
  info: { znak: '·', nazwa: 'Informacja', waga: 0 },
};

/** Ile wpisów trzymamy. Setki, bo sesja pracy nad operatem trwa godzinami. */
const OKNO_MAKS = 500;
/** Jak długo odpowiedź jest „świeża" i nie wolno jej przykryć komunikatem tła. */
const OKNO_SWIEZE_MS = 20000;

function oknoNowe() {
  return { wpisy: [], nastepnyId: 1, usunietych: 0, otwarte: false, filtr: '', filtrRodzaj: '' };
}

function oknoTekst(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }

function oknoRodzajPoprawny(r) {
  const t = oknoTekst(r).toLowerCase();
  return Object.values(OKNO_RODZAJE).includes(t) ? t : OKNO_RODZAJE.INFO;
}

/**
 * Dopisanie komunikatu. Zwracamy wpis, bo wołający często chce go od razu
 * pokazać albo podmienić (etap szukania).
 *
 * `grupa` to nazwa zadania: „Szukanie transakcji", „Operat Express", „Import
 * wyciągu". Dzięki niej okno da się czytać jako kilka rozmów, a nie jedną
 * taśmę, na której wszystko się przeplata.
 */
function oknoDodaj(stan, wpis = {}) {
  if (!stan || !Array.isArray(stan.wpisy)) throw new Error('Brak stanu okna odpowiedzi.');
  const tekst = oknoTekst(wpis.tekst);
  if (!tekst) return null;
  const rodzaj = oknoRodzajPoprawny(wpis.rodzaj);
  const grupa = oknoTekst(wpis.grupa) || 'Program';
  const kiedy = wpis.kiedy ? new Date(wpis.kiedy) : new Date();

  const poprzedni = stan.wpisy[stan.wpisy.length - 1];

  // Ten sam komunikat dwa razy pod rząd to licznik, nie dwa wiersze.
  if (poprzedni && poprzedni.tekst === tekst && poprzedni.rodzaj === rodzaj && poprzedni.grupa === grupa) {
    poprzedni.powtorzenia += 1;
    poprzedni.kiedy = kiedy.toISOString();
    poprzedni.przeczytane = false;
    return poprzedni;
  }

  // Etap zastępuje poprzedni etap tego samego zadania: na wierzchu ma być to,
  // co trwa TERAZ. Historia zostaje - ale jako historia, nie jako wynik.
  if (rodzaj === OKNO_RODZAJE.ETAP) {
    for (const w of stan.wpisy) {
      if (w.rodzaj === OKNO_RODZAJE.ETAP && w.grupa === grupa && !w.zakonczony) w.zakonczony = true;
    }
  }

  const nowy = {
    id: stan.nastepnyId++,
    rodzaj, grupa, tekst,
    szczegoly: oknoTekst(wpis.szczegoly),
    zrodlo: oknoTekst(wpis.zrodlo),
    etap: oknoTekst(wpis.etap),
    kiedy: kiedy.toISOString(),
    powtorzenia: 1,
    przeczytane: false,
    zakonczony: false,
    // Komunikat tla to taki, ktorego czlowiek nie wywolal: kontrola operatu
    // liczaca sie w tle, autozapis, podpowiedz. Zostaje w oknie, ale nie
    // przykrywa na pasku odpowiedzi na to, o co czlowiek wlasnie poprosil.
    tlo: Boolean(wpis.tlo),
    dzialanie: wpis.dzialanie && wpis.dzialanie.id
      ? { id: oknoTekst(wpis.dzialanie.id), napis: oknoTekst(wpis.dzialanie.napis) || 'Pokaż' }
      : null,
  };
  stan.wpisy.push(nowy);

  // Przepelnienie: znikaja NAJSTARSZE i okno o tym mowi. Zrzucenie najnowszych
  // byloby gorsze niz brak okna - czlowiek czekalby na zdanie, ktorego nie ma.
  if (stan.wpisy.length > OKNO_MAKS) {
    stan.usunietych += stan.wpisy.length - OKNO_MAKS;
    stan.wpisy.splice(0, stan.wpisy.length - OKNO_MAKS);
  }
  return nowy;
}

/** Skrót do paska: jedno zdanie o tym, co program powiedział ostatnio. */
function oknoSkrot(stan) {
  const w = oknoOstatni(stan);
  if (!w) return '';
  const znak = (OKNO_OPISY[w.rodzaj] || OKNO_OPISY.info).znak;
  const ile = w.powtorzenia > 1 ? ` (×${w.powtorzenia})` : '';
  return `${znak} ${w.tekst}${ile}`;
}

function oknoOstatni(stan, rodzaj = '') {
  const lista = stan?.wpisy || [];
  for (let i = lista.length - 1; i >= 0; i--) {
    if (!rodzaj || lista[i].rodzaj === rodzaj) return lista[i];
  }
  return null;
}

/**
 * Co pokazać na pasku u góry. Kolejność nie jest dowolna:
 *
 *   1. to, co TRWA — człowiek, który czeka, chce wiedzieć na co,
 *   2. pytanie albo błąd — to one blokują pracę i nie wolno ich przegapić,
 *   3. ostatnia odpowiedź na to, o co człowiek poprosił,
 *   4. dopiero na końcu komunikat tła.
 *
 * Punkt czwarty jest tu po to, żeby kontrola operatu licząca się w tle nie
 * przykrywała zdania, na które człowiek właśnie czekał. Bez tego program
 * odpowiada na pytanie i natychmiast zasłania własną odpowiedź.
 */
function oknoNaPasek(stan) {
  const lista = stan?.wpisy || [];
  if (!lista.length) return null;

  // 1. To, co TRWA.
  const wToku = oknoWToku(stan);
  if (wToku.length) return wToku[wToku.length - 1];

  const ostatni = lista[lista.length - 1];

  // 2. Komunikat tła nie przykrywa ŚWIEŻEJ, nieprzeczytanej odpowiedzi na to,
  //    o co człowiek poprosił. Bez tej reguły program odpowiada na pytanie
  //    i sam natychmiast zasłania własną odpowiedź kontrolą liczącą się w tle.
  //
  //    Liczy się świeżość, a nie samo „nieprzeczytane": gdyby decydowało to
  //    drugie, pasek zamarłby na jednej odpowiedzi do czasu, aż ktoś otworzy
  //    okno — a przez ten czas nie pokazałby już nic nowego.
  if (ostatni.tlo) {
    const teraz = Date.now();
    for (let i = lista.length - 1; i >= 0; i--) {
      const w = lista[i];
      if (w.tlo || w.przeczytane) continue;
      const wiek = teraz - Date.parse(w.kiedy);
      if (Number.isFinite(wiek) && wiek <= OKNO_SWIEZE_MS) return w;
      break;
    }
  }
  return ostatni;
}

/**
 * Ile nieprzeczytanych — i co z tego jest naprawdę ważne. Pytanie do człowieka
 * i błąd to inna kategoria niż „pobrano 12 transakcji": to pierwsze blokuje
 * pracę, więc licznik podaje je osobno.
 */
function oknoNieprzeczytane(stan) {
  const n = (stan?.wpisy || []).filter(w => !w.przeczytane);
  const pilne = n.filter(w => w.rodzaj === OKNO_RODZAJE.PYTANIE || w.rodzaj === OKNO_RODZAJE.BLAD);
  return { razem: n.length, pilne: pilne.length, wpisy: n };
}

function oknoOznaczPrzeczytane(stan, id = null) {
  for (const w of (stan?.wpisy || [])) {
    if (id == null || w.id === id) w.przeczytane = true;
  }
  return stan;
}

function oknoWyczysc(stan) {
  if (!stan) return stan;
  stan.wpisy = [];
  stan.usunietych = 0;
  return stan;
}

/** Filtr: po rodzaju i po treści. Ogonki nie mają znaczenia. */
function oknoFiltruj(stan, { rodzaj = '', fraza = '' } = {}) {
  const f = oknoTekst(fraza).toLowerCase()
    .replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const bez = t => String(t || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '');
  return (stan?.wpisy || []).filter(w => {
    if (rodzaj && w.rodzaj !== rodzaj) return false;
    if (!f) return true;
    return bez(w.tekst).includes(f) || bez(w.szczegoly).includes(f) || bez(w.grupa).includes(f);
  });
}

/**
 * Zadania: osobna rozmowa dla każdego, najnowsze na górze.
 *
 * O kolejności rozstrzyga numer ostatniego wpisu, a NIE jego godzina. Program
 * potrafi dopisać kilka komunikatów w tej samej milisekundzie, a wtedy
 * porównywanie znaczników czasu nie rozstrzyga nic i na wierzch wychodzi
 * zadanie sprzed godziny. Numer rośnie zawsze.
 */
function oknoGrupy(stan) {
  const mapa = new Map();
  for (const w of (stan?.wpisy || [])) {
    if (!mapa.has(w.grupa)) mapa.set(w.grupa, { grupa: w.grupa, wpisy: [], nieprzeczytane: 0, odKiedy: w.kiedy, doKiedy: w.kiedy, ostatniId: w.id });
    const g = mapa.get(w.grupa);
    g.wpisy.push(w);
    if (!w.przeczytane) g.nieprzeczytane++;
    g.doKiedy = w.kiedy;
    if (w.id > g.ostatniId) g.ostatniId = w.id;
  }
  return [...mapa.values()].sort((a, b) => b.ostatniId - a.ostatniId);
}

/**
 * Na czym program stoi w danym zadaniu. Pusty wynik znaczy „nic nie trwa" —
 * i tak to trzeba pokazać, bo kręcące się kółeczko bez końca jest gorsze niż
 * brak kółeczka.
 */
function oknoWToku(stan, grupa = '') {
  return (stan?.wpisy || []).filter(w =>
    w.rodzaj === OKNO_RODZAJE.ETAP && !w.zakonczony && (!grupa || w.grupa === grupa));
}

function oknoZakonczEtapy(stan, grupa = '') {
  for (const w of (stan?.wpisy || [])) {
    if (w.rodzaj === OKNO_RODZAJE.ETAP && (!grupa || w.grupa === grupa)) w.zakonczony = true;
  }
  return stan;
}

function oknoGodzina(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dwa = n => String(n).padStart(2, '0');
  return `${dwa(d.getHours())}:${dwa(d.getMinutes())}:${dwa(d.getSeconds())}`;
}

/** Cała rozmowa tekstem — do notatek do sprawy albo do zgłoszenia błędu. */
function oknoDoTekstu(stan, { naglowek = 'OPERO — odpowiedzi programu' } = {}) {
  const linie = [naglowek, ''.padEnd(naglowek.length, '='), ''];
  if (stan?.usunietych) linie.push(`(najstarszych ${stan.usunietych} komunikatów już nie ma — okno trzyma ostatnie ${OKNO_MAKS})`, '');
  for (const g of oknoGrupy(stan).slice().reverse()) {
    linie.push(`[${g.grupa}]`);
    for (const w of g.wpisy) {
      const o = OKNO_OPISY[w.rodzaj] || OKNO_OPISY.info;
      const ile = w.powtorzenia > 1 ? ` (×${w.powtorzenia})` : '';
      linie.push(`  ${oknoGodzina(w.kiedy)}  ${o.nazwa.padEnd(12)} ${w.tekst}${ile}`);
      if (w.szczegoly) linie.push(`${' '.repeat(26)}${w.szczegoly}`);
      if (w.zrodlo) linie.push(`${' '.repeat(26)}Źródło: ${w.zrodlo}`);
    }
    linie.push('');
  }
  if (!(stan?.wpisy || []).length) linie.push('Program nie powiedział jeszcze nic.');
  return linie.join('\n');
}

const API_OKNO = {
  RODZAJE: OKNO_RODZAJE, OPISY: OKNO_OPISY, MAKS: OKNO_MAKS, SWIEZE_MS: OKNO_SWIEZE_MS,
  nowe: oknoNowe, dodaj: oknoDodaj, skrot: oknoSkrot, ostatni: oknoOstatni,
  nieprzeczytane: oknoNieprzeczytane, naPasek: oknoNaPasek, oznaczPrzeczytane: oknoOznaczPrzeczytane,
  wyczysc: oknoWyczysc, filtruj: oknoFiltruj, grupy: oknoGrupy, wToku: oknoWToku,
  zakonczEtapy: oknoZakonczEtapy, doTekstu: oknoDoTekstu, godzina: oknoGodzina,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_OKNO;
if (typeof window !== 'undefined') window.OperoOkno = API_OKNO;

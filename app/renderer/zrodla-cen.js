'use strict';
/* ============================================================================
   OPERO — SKĄD WZIĄĆ CENY, GDY NIE MA WYCIĄGU
   ----------------------------------------------------------------------------
   Rzeczoznawca nie zawsze ma pod ręką wyciąg ze starostwa. Program ma wtedy
   szukać dalej sam — ale po kolei i mówiąc, czym jest to, co znalazł.

   Kolejność nie jest dowolna. Wynika z tego, co wolno wstawić do zbioru
   porównawczego:

     1. TRANSAKCJE — ceny z aktów notarialnych. Tylko one mogą stanowić
        podstawę wyceny porównawczej.
          • Rejestr Cen Nieruchomości z usługi GUGiK (automatycznie),
          • Twoja własna baza z wcześniejszych operatów (automatycznie),
          • wyciąg ze starostwa (wczytanie pliku).

     2. OFERTY — ceny, po których ktoś CHCE sprzedać. To nie są transakcje
        i nie wolno ich mieszać ze zbiorem porównawczym. Przydają się do
        analizy rynku, do wnioskowania o popycie i o czasie ekspozycji, a przy
        rynku pierwotnym bywają jedynym dostępnym materiałem.

   Dlaczego program nie pobiera danych z serwisów typu deweloperuch.pl,
   choć je zna: te serwisy same deklarują, że biorą transakcje z RCN, a oferty
   z dane.gov.pl. Pobieranie od nich znaczyłoby branie TYCH SAMYCH danych
   z drugiej ręki — starszych, bez możliwości wskazania źródła w operacie i
   wbrew regulaminom cudzych serwisów. Program otwiera je więc rzeczoznawcy
   z gotowym zapytaniem, zamiast podbierać im bazę.

   Zasada, której nie wolno złamać: KAŻDA liczba, która trafia do operatu,
   musi mieć źródło dające się wskazać z nazwy i daty.
   ========================================================================= */

const ZRODLA_RODZAJ = { TRANSAKCJE: 'transakcje', OFERTY: 'oferty', RECZNIE: 'recznie' };

function zrodlaCzysty(t) { return String(t ?? '').trim(); }
function zrodlaKodowane(t) { return encodeURIComponent(zrodlaCzysty(t)); }

/** Miejscowość w postaci, której używają adresy stron: małe litery, myślniki. */
function zrodlaDoAdresu(tekst) {
  return String(tekst || '')
    .toLowerCase()
    .replace(/ą/g, 'a').replace(/ć/g, 'c').replace(/ę/g, 'e').replace(/ł/g, 'l').replace(/ń/g, 'n')
    .replace(/ó/g, 'o').replace(/ś/g, 's').replace(/ż/g, 'z').replace(/ź/g, 'z')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Lista źródeł w kolejności, w jakiej program ich próbuje.
 * `sposob: 'program'` — program pobiera sam.
 * `sposob: 'otworz'` — program otwiera stronę z gotowym zapytaniem; dane
 *                      przepisuje albo wczytuje człowiek.
 * `sposob: 'plik'`    — człowiek wczytuje plik.
 */
const ZRODLA = [
  {
    id: 'rcn-geoportal', nazwa: 'Rejestr Cen Nieruchomości (Geoportal GUGiK)',
    rodzaj: ZRODLA_RODZAJ.TRANSAKCJE, sposob: 'program', kolejnosc: 1,
    opis: 'Ceny z aktów notarialnych, prosto z rejestru prowadzonego przez starostów. Bezpłatnie, bez logowania.',
    zastrzezenie: 'Obejmuje tylko powiaty, które przesłały dane — w 2026 r. około 320 z 380.',
  },
  {
    id: 'wlasna-baza', nazwa: 'Twoja własna baza rynku',
    rodzaj: ZRODLA_RODZAJ.TRANSAKCJE, sposob: 'program', kolejnosc: 2,
    opis: 'Transakcje z wyciągów, które już kiedyś wczytałeś. Natychmiast i bez sieci.',
    zastrzezenie: 'Sprawdź daty — transakcje sprzed lat wymagają aktualizacji cen w czasie.',
  },
  {
    id: 'wyciag-starostwo', nazwa: 'Wyciąg z RCiWN ze starostwa',
    rodzaj: ZRODLA_RODZAJ.TRANSAKCJE, sposob: 'plik', kolejnosc: 3,
    opis: 'Pełne dane z powiatu, także z tych, których nie ma jeszcze w Geoportalu. Rzeczoznawcy przysługuje dostęp.',
    zastrzezenie: 'Wniosek do starosty — program umie go wypełnić w rubryce Księgi wieczyste.',
  },
  {
    id: 'geoportal-powiatowy', nazwa: 'Geoportal powiatowy',
    rodzaj: ZRODLA_RODZAJ.TRANSAKCJE, sposob: 'otworz', kolejnosc: 4,
    opis: 'Część powiatów prowadzi własny moduł RCN, czasem szerszy niż to, co trafia do Geoportalu krajowego.',
    zastrzezenie: 'Zakres i sposób dostępu różnią się powiat po powiecie.',
    url: () => 'https://www.geoportal.gov.pl/pl/dane/portale-powiatowe/',
  },
  {
    id: 'deweloperuch', nazwa: 'Deweloperuch.pl — ceny transakcyjne i ofertowe',
    rodzaj: ZRODLA_RODZAJ.OFERTY, sposob: 'otworz', kolejnosc: 5,
    opis: 'Serwis pokazuje transakcje z RCN oraz ceny ofertowe deweloperów z dane.gov.pl, z podziałem na adresy.',
    zastrzezenie: 'Program stąd nie pobiera, bo nie musi: transakcje bierze wprost z RCN, a cenniki deweloperów '
      + 'wprost z dane.gov.pl — czyli z tych samych źródeł, z których bierze je ten serwis, tylko świeższe i z możliwością '
      + 'wskazania pliku w operacie. Tu zaglądasz, żeby zobaczyć rynek własnymi oczami albo znaleźć adresy do dalszego szukania.',
    url: ({ miasto } = {}) => (zrodlaCzysty(miasto)
      ? `https://deweloperuch.pl/ceny-transakcyjne/${zrodlaDoAdresu(miasto)}/mieszkania`
      : 'https://deweloperuch.pl/ceny-transakcyjne/polska/mapa'),
  },
  {
    id: 'dane-gov', nazwa: 'dane.gov.pl — cenniki deweloperów',
    rodzaj: ZRODLA_RODZAJ.OFERTY, sposob: 'program', kolejnosc: 6,
    opis: 'Od września 2025 deweloperzy mają obowiązek publikować ceny lokali jako dane otwarte (art. 19b ust. 1 ustawy '
      + 'deweloperskiej). Program pobiera te cenniki sam, wprost ze źródła, i podaje przy każdym nazwę dewelopera, adres pliku i datę.',
    zastrzezenie: 'To ceny OFERTOWE. Do zbioru porównawczego nie wchodzą — służą analizie rynku pierwotnego '
      + 'i ocenie, czy ceny drgnęły od czasu ostatnich transakcji.',
    url: ({ miasto } = {}) => `https://dane.gov.pl/pl/dataset?q=${zrodlaKodowane(['ceny', 'lokali', zrodlaCzysty(miasto)].filter(Boolean).join(' '))}`,
  },
  {
    id: 'nbp', nazwa: 'Baza cen nieruchomości NBP',
    rodzaj: ZRODLA_RODZAJ.OFERTY, sposob: 'otworz', kolejnosc: 7,
    opis: 'Kwartalne średnie ceny transakcyjne i ofertowe dla największych miast. Materiał do analizy rynku, nie do zbioru.',
    zastrzezenie: 'Dane zagregowane — pojedynczych transakcji tam nie ma.',
    url: () => 'https://nbp.pl/publikacje/cykliczne-materialy-analityczne-nbp/rynek-nieruchomosci/baza-cen-nieruchomosci-mieszkaniowych/',
  },
  {
    id: 'recznie', nazwa: 'Wpisanie transakcji ręcznie',
    rodzaj: ZRODLA_RODZAJ.RECZNIE, sposob: 'program', kolejnosc: 8,
    opis: 'Z aktu notarialnego, z własnych notatek z oględzin albo z danych od pośrednika.',
    zastrzezenie: 'Przy każdej pozycji zapisz źródło i datę — bez tego transakcja jest nie do obrony.',
  },
];

function zrodlaZrodlo(id) { return ZRODLA.find(z => z.id === id) || null; }
function zrodlaTransakcyjne() { return ZRODLA.filter(z => z.rodzaj === ZRODLA_RODZAJ.TRANSAKCJE); }

/**
 * Co program ma zrobić dalej, wiedząc, ile już ma transakcji i co zawiodło.
 * Zwracamy KROKI, nie komunikat — człowiek ma widzieć całą drogę, a nie
 * kolejne „nie znaleziono".
 */
function zrodlaPlan({ maTransakcji = 0, potrzeba = 3, sprawdzone = [], miasto = '' } = {}) {
  const juz = new Set(sprawdzone);
  const brakuje = Math.max(0, potrzeba - maTransakcji);
  const kroki = ZRODLA
    .slice()
    .sort((a, b) => a.kolejnosc - b.kolejnosc)
    .map(z => ({
      id: z.id, nazwa: z.nazwa, rodzaj: z.rodzaj, sposob: z.sposob,
      opis: z.opis, zastrzezenie: z.zastrzezenie,
      url: typeof z.url === 'function' ? z.url({ miasto }) : '',
      sprawdzone: juz.has(z.id),
    }));
  return {
    brakuje, maTransakcji, potrzeba,
    wystarczy: brakuje === 0,
    kroki,
    nastepny: kroki.find(k => !k.sprawdzone && k.rodzaj === ZRODLA_RODZAJ.TRANSAKCJE) || kroki.find(k => !k.sprawdzone) || null,
  };
}

/**
 * Zdanie, które program mówi człowiekowi. Musi odpowiadać na trzy pytania:
 * ile mam, ile potrzeba i co robimy dalej — w tej kolejności.
 */
function zrodlaKomunikat(plan) {
  if (plan.wystarczy) {
    return `Masz ${plan.maTransakcji} ${plan.maTransakcji === 1 ? 'transakcję' : 'transakcji'} — to wystarczy do wyceny porównawczej. `
      + 'Dobór nieruchomości podobnych i tak należy do Ciebie.';
  }
  const n = plan.nastepny;
  const ile = plan.maTransakcji === 0
    ? 'Nie mam jeszcze ani jednej transakcji'
    : `Mam ${plan.maTransakcji} ${plan.maTransakcji === 1 ? 'transakcję' : 'transakcji'}, a potrzeba co najmniej ${plan.potrzeba}`;
  if (!n) {
    return `${ile}. Sprawdziłem wszystkie źródła, które znam. Zostaje wpisanie transakcji ręcznie — `
      + 'z aktu notarialnego albo z danych od pośrednika, z zapisaniem źródła przy każdej pozycji.';
  }
  return `${ile}. Następny krok: ${n.nazwa}. ${n.opis}`;
}

/**
 * Zdanie do operatu o pochodzeniu danych. Rzeczoznawca musi umieć wskazać,
 * skąd wzięła się każda liczba — także ta sprzed pół roku.
 */
function zrodlaOpis(uzyte = [], data = new Date()) {
  const d = new Date(data).toISOString().slice(0, 10);
  const nazwy = (uzyte || []).map(id => zrodlaZrodlo(id)).filter(Boolean);
  if (!nazwy.length) return '';
  const transakcje = nazwy.filter(z => z.rodzaj === ZRODLA_RODZAJ.TRANSAKCJE).map(z => z.nazwa);
  const oferty = nazwy.filter(z => z.rodzaj === ZRODLA_RODZAJ.OFERTY).map(z => z.nazwa);
  const czesci = [];
  if (transakcje.length) czesci.push(`Dane transakcyjne: ${transakcje.join('; ')}.`);
  if (oferty.length) czesci.push(`Dane ofertowe wykorzystane wyłącznie w analizie rynku: ${oferty.join('; ')}.`);
  czesci.push(`Stan na ${d}.`);
  return czesci.join(' ');
}

/** Czy wolno wstawić dane z tego źródła do zbioru porównawczego. */
function zrodlaWolnoDoZbioru(idZrodla) {
  const z = zrodlaZrodlo(idZrodla);
  if (!z) return { wolno: false, powod: 'Nieznane źródło.' };
  if (z.rodzaj === ZRODLA_RODZAJ.OFERTY) {
    return { wolno: false, powod: `${z.nazwa}: to ceny ofertowe, a nie transakcyjne. Do zbioru porównawczego nie wchodzą — `
      + 'możesz ich użyć w analizie rynku, opisując je jako oferty.' };
  }
  return { wolno: true, powod: '' };
}

const API_ZRODLA = {
  RODZAJ: ZRODLA_RODZAJ, ZRODLA,
  zrodlo: zrodlaZrodlo, transakcyjne: zrodlaTransakcyjne, planSzukania: zrodlaPlan,
  komunikat: zrodlaKomunikat, opisZrodel: zrodlaOpis, woloDoZbioru: zrodlaWolnoDoZbioru, doAdresu: zrodlaDoAdresu,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_ZRODLA;
if (typeof window !== 'undefined') window.OperoZrodla = API_ZRODLA;

'use strict';
/* ============================================================================
   OPERO — EXPRESS PISZE CAŁY OPERAT (model lokalny PER)
   ----------------------------------------------------------------------------
   W Expressie rzeczoznawca podaje najważniejsze dane, a program ma zrobić
   resztę: policzyć wartość i NAPISAĆ operat — wszystkie rozdziały opisowe,
   do ostatecznego przejrzenia i podpisu.

   Pisze model, który chodzi na tym komputerze. Nic nie wychodzi do sieci.

   JAK TO MOŻE BYĆ BEZPIECZNE

   Model językowy nie liczy i nie wie. Zapytany o rynek w Iławie napisze coś
   gładkiego i może to wymyślić — a wymyślona liczba w operacie szacunkowym to
   nie literówka, to podstawa odpowiedzialności zawodowej rzeczoznawcy.
   Dlatego ten moduł trzyma model na trzech smyczach:

   1. MODEL DOSTAJE WYŁĄCZNIE FAKTY Z OPERATU. Nie ma dostępu do sieci, do
      innych operatów ani do „wiedzy ogólnej o rynku". Lista faktów (`fakty`)
      jest jedynym materiałem: dane z pól Expressu, wynik silnika obliczeń,
      transakcje przyjęte do zbioru i źródła, z których pochodzą.

   2. MODEL NIE LICZY. Każda liczba w operacie pochodzi z silnika obliczeń,
      a model ma ją tylko opisać. Polecenie mówi to wprost.

   3. KAŻDY NAPISANY AKAPIT JEST SPRAWDZANY (`sprawdzTekst`). Program wyszukuje
      w tekście liczby i porównuje je z listą faktów. Liczba, której nie ma
      w faktach, jest ZGŁASZANA rzeczoznawcy przy tym akapicie — bo to
      najczęstszy sposób, w jaki model psuje dokument: dopisuje wiarygodnie
      wyglądającą wartość, której nikt nie podał.

   I jedna rzecz, której ten moduł nie udaje: to jest PROJEKT operatu. Każdy
   rozdział wychodzi stąd oznaczony jako napisany przez model i wymagający
   przejrzenia. Pod operatem podpisuje się rzeczoznawca majątkowy i to on
   odpowiada za każde zdanie — program ma mu oszczędzić pisania, a nie
   odpowiedzialności.
   ========================================================================= */

/**
 * Rozdziały opisowe, które program pisze. Klucze są te same, których czyta
 * generator operatu (`project.narratives`) — jedna lista zamiast dwóch, które
 * by się rozjechały.
 *
 * `wymaga` to fakty, bez których tego rozdziału nie ma po co pisać: lepiej
 * poprosić człowieka o daną niż pozwolić modelowi ją wypełnić.
 */
const PISZ_ROZDZIALY = [
  {
    id: 'subject', nazwa: 'Przedmiot wyceny', kolejnosc: 1,
    podstawa: 'art. 156 ust. 1 ugn; § 56 rozporządzenia w sprawie wycen',
    cel: 'Jednoznacznie zidentyfikować nieruchomość: co jest wyceniane, gdzie leży i jakie prawo podlega wycenie.',
    wymaga: ['adres', 'powierzchnia'],
    podrecznik: 'Przedmiot i zakres wyceny',
  },
  {
    id: 'scope', nazwa: 'Zakres wyceny', kolejnosc: 2,
    podstawa: 'art. 156 ust. 1 ugn',
    cel: 'Powiedzieć, co wchodzi w zakres opracowania, a co z niego wyłączono i dlaczego.',
    wymaga: ['cel wyceny'],
    podrecznik: 'Przedmiot i zakres wyceny',
  },
  {
    id: 'legal', nazwa: 'Stan prawny nieruchomości', kolejnosc: 3,
    podstawa: 'art. 155 ust. 1 ugn',
    cel: 'Opisać prawo będące przedmiotem wyceny i źródło, z którego ustalono stan prawny, z datą badania.',
    wymaga: [],
    podrecznik: 'Stan prawny nieruchomości',
    ostroznie: 'Nie wolno opisywać wpisów w księdze wieczystej, których nie ma w faktach. Brak danej to zdanie o tym, '
      + 'że danej nie ustalono, a nie zdanie opisujące stan, którego nikt nie sprawdził.',
  },
  {
    id: 'egib', nazwa: 'Dane z ewidencji gruntów i budynków', kolejnosc: 4,
    podstawa: 'art. 155 ust. 1 pkt 1 ugn',
    cel: 'Przedstawić dane ewidencyjne i wskazać ich źródło oraz datę.',
    wymaga: [],
    podrecznik: 'Ewidencja gruntów i budynków',
  },
  {
    id: 'planning', nazwa: 'Przeznaczenie w planie miejscowym', kolejnosc: 5,
    podstawa: 'art. 154 ugn',
    cel: 'Opisać przeznaczenie nieruchomości i dokument, z którego je ustalono.',
    wymaga: [],
    podrecznik: 'Przeznaczenie nieruchomości',
    ostroznie: 'Przeznaczenia NIE WOLNO wywnioskować z adresu ani z otoczenia. Bez uchwały albo zaświadczenia w faktach '
      + 'rozdział mówi, że przeznaczenia nie ustalono.',
  },
  {
    id: 'location', nazwa: 'Lokalizacja i otoczenie', kolejnosc: 6,
    podstawa: '§ 4 rozporządzenia w sprawie wycen',
    cel: 'Opisać położenie i otoczenie w zakresie, w jakim wpływa na wartość.',
    wymaga: ['adres'],
    podrecznik: 'Opis nieruchomości',
  },
  {
    id: 'building', nazwa: 'Opis budynku', kolejnosc: 7,
    podstawa: '§ 4 rozporządzenia w sprawie wycen',
    cel: 'Opisać budynek: rok budowy, technologię, stan, wyposażenie — wyłącznie z danych z oględzin i dokumentów.',
    wymaga: [],
    podrecznik: 'Opis nieruchomości',
  },
  {
    id: 'local', nazwa: 'Opis lokalu', kolejnosc: 8,
    podstawa: '§ 4 rozporządzenia w sprawie wycen',
    cel: 'Opisać lokal: układ, standard, stan techniczny, instalacje, pomieszczenia przynależne.',
    wymaga: ['powierzchnia'],
    podrecznik: 'Opis nieruchomości',
  },
  {
    id: 'market', nazwa: 'Charakterystyka rynku lokalnego', kolejnosc: 9,
    podstawa: '§ 4 ust. 2 i § 26 rozporządzenia w sprawie wycen',
    cel: 'Opisać rynek, z którego pochodzą transakcje: obszar, okres badania, rodzaj nieruchomości, liczbę transakcji, '
      + 'rozpiętość cen i tendencję — wyłącznie z liczb policzonych przez program.',
    wymaga: ['liczba transakcji'],
    podrecznik: 'Analiza rynku nieruchomości',
    ostroznie: 'To rozdział, w którym model najchętniej wymyśla. Nie wolno podać ANI JEDNEJ liczby, procentu ani tendencji, '
      + 'której nie ma w faktach. Wiedza „ogólna" o polskim rynku mieszkaniowym jest tu zakazana.',
  },
  {
    id: 'extremeMax', nazwa: 'Nieruchomość o cenie maksymalnej', kolejnosc: 10,
    podstawa: '§ 26 rozporządzenia w sprawie wycen',
    cel: 'Wyjaśnić, czym ta nieruchomość różni się od przedmiotu wyceny i dlaczego wyznacza górną granicę przedziału.',
    wymaga: ['cena maksymalna'],
    podrecznik: 'Metoda korygowania ceny średniej',
  },
  {
    id: 'extremeMin', nazwa: 'Nieruchomość o cenie minimalnej', kolejnosc: 11,
    podstawa: '§ 26 rozporządzenia w sprawie wycen',
    cel: 'Wyjaśnić, czym ta nieruchomość różni się od przedmiotu wyceny i dlaczego wyznacza dolną granicę przedziału.',
    wymaga: ['cena minimalna'],
    podrecznik: 'Metoda korygowania ceny średniej',
  },
  {
    id: 'result', nazwa: 'Wynik końcowy z uzasadnieniem', kolejnosc: 12,
    podstawa: 'art. 156 ust. 1 ugn; § 56 rozporządzenia w sprawie wycen',
    cel: 'Podać wartość, wyjaśnić drogę dojścia do niej i wskazać, co ją ogranicza.',
    wymaga: ['wartość rynkowa'],
    podrecznik: 'Wynik końcowy wyceny',
    ostroznie: 'Wartość pochodzi WYŁĄCZNIE z silnika obliczeń. Modelowi nie wolno jej przeliczyć, zaokrąglić ani poprawić.',
  },
];

function piszTekst(v) { return String(v ?? '').trim(); }
function piszLiczba(v) {
  if (v === null || v === undefined || piszTekst(v) === '') return null;
  const n = Number(String(v).replace(/\s| /g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function piszZl(v) {
  const n = piszLiczba(v);
  return n == null ? '' : `${n.toLocaleString('pl-PL', { maximumFractionDigits: 2 })} zł`;
}

/**
 * Fakty — JEDYNY materiał, z którego model może pisać.
 *
 * Każdy fakt ma nazwę i wartość. Nazwa idzie do polecenia, a wartość służy
 * potem do sprawdzenia, czy model nie dopisał liczby spoza tej listy.
 */
function piszFakty(project = {}, calc = {}, dodatkowe = {}) {
  const p = project.property || {};
  const v = project.valuation || {};
  const m = project.market || {};
  const transakcje = (m.transactions || []);
  const fakty = [];
  const dodaj = (nazwa, wartosc, { liczba = null } = {}) => {
    const t = piszTekst(wartosc);
    if (!t) return;
    fakty.push({ nazwa, wartosc: t, liczba: liczba != null ? liczba : piszLiczba(wartosc) });
  };

  /* --- przedmiot --- */
  const adres = [p.street && `ul. ${p.street}`, p.buildingNo, p.localNo && `lok. ${p.localNo}`]
    .filter(Boolean).join(' ');
  dodaj('adres', [adres, p.postcode, p.city].filter(Boolean).join(', '));
  dodaj('miejscowość', p.city);
  dodaj('dzielnica', p.district);
  dodaj('gmina', p.commune);
  dodaj('powiat', p.county);
  dodaj('województwo', p.voivodeship);
  dodaj('numer lokalu', p.localNo);
  dodaj('powierzchnia', p.usableArea != null && Number(p.usableArea) > 0 ? `${p.usableArea} m²` : '', { liczba: piszLiczba(p.usableArea) });
  dodaj('powierzchnia działki', Number(p.landArea) > 0 ? `${p.landArea} m²` : '', { liczba: piszLiczba(p.landArea) });
  dodaj('powierzchnia pomieszczenia przynależnego', Number(p.basementArea) > 0 ? `${p.basementArea} m²` : '', { liczba: piszLiczba(p.basementArea) });
  dodaj('rodzaj prawa', p.rightType || project.legal?.rightType);
  dodaj('numer księgi wieczystej', project.legal?.kwLocal);
  dodaj('data badania księgi', v.legalStateDate);
  dodaj('numer działki', project.egib?.plotNo);
  dodaj('obręb', project.egib?.precinct);
  dodaj('przeznaczenie w planie', project.planning?.purpose || project.planning?.description);
  dodaj('dokument planistyczny', project.planning?.document);
  dodaj('rok budowy', project.building?.year, { liczba: piszLiczba(project.building?.year) });
  dodaj('technologia budowy', project.building?.technology);
  dodaj('liczba kondygnacji', project.building?.floors, { liczba: piszLiczba(project.building?.floors) });
  dodaj('stan techniczny budynku', project.building?.condition);
  dodaj('piętro lokalu', project.local?.floor);
  dodaj('liczba pokoi', project.local?.rooms, { liczba: piszLiczba(project.local?.rooms) });
  dodaj('standard lokalu', project.local?.standardLevel);
  dodaj('stan techniczny lokalu', project.local?.technicalCondition);
  dodaj('instalacje', project.local?.installations);

  /* --- daty i cel --- */
  dodaj('data wyceny', v.valuationDate);
  dodaj('data oględzin', v.inspectionDate);
  dodaj('data poziomu cen', v.priceLevelDate);
  dodaj('cel wyceny', v.purpose);
  dodaj('rodzaj określanej wartości', v.valueType || 'wartość rynkowa');
  dodaj('podejście i metoda', v.approach || dodatkowe.metoda);

  /* --- rynek --- */
  dodaj('liczba transakcji', transakcje.length ? String(transakcje.length) : '', { liczba: transakcje.length || null });
  dodaj('obszar badania rynku', m.area || m.marketArea);
  dodaj('okres badania rynku', m.period || m.marketPeriod);
  dodaj('rodzaj nieruchomości na rynku', m.propertyType);
  if (transakcje.length) {
    const daty = transakcje.map(t => piszTekst(t.date)).filter(Boolean).sort();
    if (daty.length) {
      dodaj('najstarsza transakcja w zbiorze', daty[0]);
      dodaj('najnowsza transakcja w zbiorze', daty[daty.length - 1]);
    }
    const pow = transakcje.map(t => piszLiczba(t.area)).filter(x => x > 0);
    if (pow.length) {
      dodaj('najmniejsza powierzchnia w zbiorze', `${Math.min(...pow)} m²`, { liczba: Math.min(...pow) });
      dodaj('największa powierzchnia w zbiorze', `${Math.max(...pow)} m²`, { liczba: Math.max(...pow) });
    }
  }

  /* --- wynik z silnika obliczen. Model tych liczb NIE przelicza. --- */
  dodaj('cena minimalna w zbiorze', piszZl(calc.cmin), { liczba: piszLiczba(calc.cmin) });
  dodaj('cena maksymalna w zbiorze', piszZl(calc.cmax), { liczba: piszLiczba(calc.cmax) });
  dodaj('cena średnia w zbiorze', piszZl(calc.cavg ?? calc.cSr), { liczba: piszLiczba(calc.cavg ?? calc.cSr) });
  dodaj('rozpiętość cen', calc.cmin != null && calc.cmax != null ? `od ${piszZl(calc.cmin)} do ${piszZl(calc.cmax)} za m²` : '');
  dodaj('współczynnik korygujący', calc.totalCorrection ?? calc.wspolczynnik, { liczba: piszLiczba(calc.totalCorrection ?? calc.wspolczynnik) });
  dodaj('cena jednostkowa nieruchomości wycenianej', piszZl(calc.unitValue ?? calc.cenaJednostkowa), { liczba: piszLiczba(calc.unitValue ?? calc.cenaJednostkowa) });
  dodaj('wartość rynkowa', piszZl(calc.valueRounded ?? calc.value), { liczba: piszLiczba(calc.valueRounded ?? calc.value) });
  dodaj('wartość przed zaokrągleniem', piszZl(calc.value), { liczba: piszLiczba(calc.value) });
  dodaj('trend czasowy', calc.trend != null ? `${calc.trend}` : '', { liczba: piszLiczba(calc.trend) });

  /* --- zrodla --- */
  dodaj('źródła danych o cenach', (dodatkowe.zrodla || []).join('; '));
  dodaj('dane ofertowe (analiza rynku)', dodatkowe.oferty || '');
  dodaj('autor operatu', project.author?.name);
  dodaj('numer uprawnień', project.author?.licenseNo);
  dodaj('zleceniodawca', project.client?.name);

  return fakty;
}

/** Fakty jako tekst do polecenia — nazwa: wartość, po jednym w wierszu. */
function piszFaktyTekst(fakty = []) {
  return fakty.map(f => `- ${f.nazwa}: ${f.wartosc}`).join('\n');
}

/**
 * Czego brakuje, żeby rozdział miał z czego powstać. Program woli spytać
 * człowieka, niż pozwolić modelowi wypełnić lukę.
 */
function piszBraki(rozdzial, fakty = []) {
  const mam = new Set(fakty.map(f => f.nazwa));
  return (rozdzial?.wymaga || []).filter(w => !mam.has(w));
}

const PISZ_ZASADY = [
  'Piszesz fragment operatu szacunkowego dla rzeczoznawcy majątkowego. Język: polski, urzędowy, bezosobowy, rzeczowy.',
  'WOLNO CI UŻYĆ WYŁĄCZNIE FAKTÓW Z LISTY PONIŻEJ. Nie masz dostępu do żadnych innych danych.',
  'NIE PODAWAJ ŻADNEJ LICZBY, DATY, PROCENTU ANI KWOTY, której nie ma na liście faktów. Nie przeliczaj, nie zaokrąglaj, nie sumuj.',
  'Nie powołuj się na wiedzę ogólną o rynku, na statystyki, na raporty ani na „obserwowane tendencje" — jeżeli nie ma ich w faktach, nie istnieją.',
  'Jeżeli brakuje danej, napisz wprost, że jej nie ustalono, i zostaw oznaczenie [DO UZUPEŁNIENIA]. To jest poprawna odpowiedź, a nie porażka.',
  'Nie dodawaj nagłówków, numeracji rozdziałów, list wypunktowanych ani komentarzy o sobie. Zwróć wyłącznie tekst akapitów.',
  'Nie oceniaj i nie doradzaj. Opisujesz stan i wyjaśniasz drogę rozumowania, której liczby podał program.',
];

/** Polecenie dla modelu — jeden rozdział, jedno polecenie. */
function piszPolecenie(rozdzial, fakty = [], { podrecznikOdnosnik = '' } = {}) {
  if (!rozdzial) throw new Error('Nie wskazano rozdziału do napisania.');
  const czesci = [
    `ROZDZIAŁ: ${rozdzial.nazwa}`,
    `PODSTAWA PRAWNA: ${rozdzial.podstawa}`,
    `CO TEN ROZDZIAŁ MA ZROBIĆ: ${rozdzial.cel}`,
  ];
  if (rozdzial.ostroznie) czesci.push(`SZCZEGÓLNA OSTROŻNOŚĆ: ${rozdzial.ostroznie}`);
  if (podrecznikOdnosnik) czesci.push(`UKŁAD WEDŁUG PODRĘCZNIKA: ${podrecznikOdnosnik}`);
  czesci.push('', 'ZASADY:', PISZ_ZASADY.map((z, i) => `${i + 1}. ${z}`).join('\n'));
  czesci.push('', 'FAKTY (jedyny dopuszczalny materiał):', piszFaktyTekst(fakty) || '- brak danych');
  const braki = piszBraki(rozdzial, fakty);
  if (braki.length) {
    czesci.push('', `UWAGA — tych danych NIE MA: ${braki.join(', ')}. `
      + 'Napisz rozdział bez nich, zaznaczając [DO UZUPEŁNIENIA] w miejscach, gdzie są potrzebne.');
  }
  return czesci.join('\n');
}

/* ------------------------------------------------- sprawdzanie napisanego */

/**
 * Wszystkie liczby, które model podał w tekście — razem z tym, co stoi za
 * nimi. Jednostka ma znaczenie: „8" w zdaniu bywa liczebnikiem, ale „8%"
 * i „8 000 zł" są zawsze twierdzeniem o rzeczywistości i muszą mieć źródło.
 */
function piszLiczbyZTekstu(tekst) {
  const out = [];
  const t = String(tekst || '');
  // Daty w postaci RRRR-MM-DD i DD.MM.RRRR traktujemy osobno - to nie liczby.
  const bezDat = t.replace(/\d{4}-\d{2}-\d{2}/g, ' ').replace(/\d{1,2}[.\-/]\d{1,2}[.\-/]\d{4}/g, ' ');
  for (const m of bezDat.matchAll(/(\d[\d\s\u00a0]*(?:[.,]\d+)?)\s*(%|proc\.|procent\w*|zł|złotych|zl\b|PLN\b|m²|m2\b|mkw\b)?/gi)) {
    const n = piszLiczba(String(m[1]).replace(/[\s\u00a0]/g, ''));
    if (n == null) continue;
    const jednostka = (m[2] || '').trim();
    out.push({ zapis: `${m[1].trim()}${jednostka ? ` ${jednostka}` : ''}`, wartosc: n, jednostka, zJednostka: Boolean(jednostka) });
  }
  return out;
}

function piszDatyZTekstu(tekst) {
  const t = String(tekst || '');
  const out = [];
  for (const m of t.matchAll(/\d{4}-\d{2}-\d{2}/g)) out.push(m[0]);
  for (const m of t.matchAll(/(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/g)) {
    out.push(`${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`);
  }
  return [...new Set(out)];
}

/**
 * Sprawdzenie napisanego akapitu.
 *
 * To jest ta smycz, bez której cała reszta nie ma znaczenia. Model potrafi
 * napisać „ceny w tej dzielnicy wzrosły o 8% w ciągu roku" — zdanie gładkie,
 * wiarygodne i wzięte z niczego. Program wyciąga z tekstu wszystkie liczby
 * i daty i porównuje je z faktami; czego w faktach nie ma, ląduje na liście
 * do sprawdzenia przez człowieka.
 *
 * Dopuszczamy liczebniki występujące w zdaniach bez znaczenia rachunkowego
 * (jeden, dwa, 1, 2) oraz numery artykułów i paragrafów — reszta idzie
 * do zgłoszenia. Wolimy zgłosić za dużo niż przepuścić wymyśloną kwotę.
 */
function piszSprawdzTekst(tekst, fakty = []) {
  const t = String(tekst || '');
  const znane = new Set();
  const znaneDaty = new Set();
  for (const f of fakty) {
    if (f.liczba != null) {
      znane.add(Math.round(f.liczba * 100) / 100);
      znane.add(Math.round(f.liczba));
    }
    // Liczby wplecione w wartosc tekstowa (np. „od 8 000 zl do 12 000 zl").
    for (const l of piszLiczbyZTekstu(f.wartosc)) {
      znane.add(Math.round(l.wartosc * 100) / 100);
      znane.add(Math.round(l.wartosc));
    }
    for (const d of piszDatyZTekstu(f.wartosc)) znaneDaty.add(d);
  }

  const obce = [];
  const widziane = new Set();
  // Numery przepisow nie sa danymi o nieruchomosci - „art. 156", „§ 26".
  const bezPrzepisow = t
    .replace(/(?:art\.|ust\.|pkt|§|poz\.|nr)\s*\d+[a-z]?(?:\s*ust\.\s*\d+)?(?:\s*pkt\s*\d+)?/gi, ' ')
    .replace(/\br\.\s*\d{4}\b/g, ' ');
  for (const l of piszLiczbyZTekstu(bezPrzepisow)) {
    const zaokr = Math.round(l.wartosc * 100) / 100;
    if (znane.has(zaokr) || znane.has(Math.round(l.wartosc))) continue;
    // Male liczby calkowite BEZ jednostki to liczebniki w zdaniu („dwa pokoje",
    // „3 kondygnacje"). Ale „8%" albo „8 000 zl" to zawsze twierdzenie o
    // rzeczywistosci i musi miec zrodlo, nawet gdy liczba jest mala.
    if (!l.zJednostka && l.wartosc <= 12 && Number.isInteger(l.wartosc)) continue;
    if (widziane.has(zaokr)) continue;
    widziane.add(zaokr);
    obce.push({ rodzaj: 'liczba', zapis: l.zapis, wartosc: l.wartosc });
  }
  for (const d of piszDatyZTekstu(t)) {
    if (znaneDaty.has(d)) continue;
    obce.push({ rodzaj: 'data', zapis: d, wartosc: d });
  }

  const doUzupelnienia = (t.match(/\[DO UZUPEŁNIENIA[^\]]*\]/gi) || []).length;
  return {
    ok: obce.length === 0,
    obce,
    doUzupelnienia,
    dlugosc: t.trim().length,
    ostrzezenie: obce.length
      ? `W tym rozdziale jest ${obce.length} ${obce.length === 1 ? 'wartość' : 'wartości'}, której nie podałeś programowi: `
        + `${obce.slice(0, 6).map(o => o.zapis).join(', ')}${obce.length > 6 ? ' i dalsze' : ''}. `
        + 'Model mógł ją wymyślić — sprawdź każdą albo usuń. Program nie zna jej źródła, więc nie może jej obronić.'
      : '',
  };
}

/** Jedno zdanie o tym, czym jest ten tekst — idzie do operatu razem z nim. */
function piszZnacznik(data = new Date()) {
  const d = new Date(data).toISOString().slice(0, 10);
  return `[Projekt rozdziału napisany ${d} przez model lokalny PER na podstawie danych z operatu. `
    + 'Wymaga przejrzenia i zatwierdzenia przez rzeczoznawcę majątkowego — odpowiada za treść osoba podpisująca operat.]';
}

/** Ile rozdziałów, ile zgłoszeń, czy można to pokazać jako gotowe. */
function piszPodsumowanie(wyniki = []) {
  const napisane = wyniki.filter(w => w.tekst);
  const zeZgloszeniami = napisane.filter(w => w.kontrola && !w.kontrola.ok);
  const doUzupelnienia = napisane.reduce((s, w) => s + (w.kontrola?.doUzupelnienia || 0), 0);
  return {
    rozdzialow: PISZ_ROZDZIALY.length,
    napisane: napisane.length,
    nieudane: wyniki.length - napisane.length,
    zeZgloszeniami: zeZgloszeniami.length,
    doUzupelnienia,
    komunikat: napisane.length
      ? `Napisałem ${napisane.length} z ${PISZ_ROZDZIALY.length} rozdziałów opisowych.`
        + (zeZgloszeniami.length
          ? ` W ${zeZgloszeniami.length} ${zeZgloszeniami.length === 1 ? 'rozdziale' : 'rozdziałach'} są wartości, których nie podałeś — `
            + 'program je zaznaczył, przejrzyj je przed podpisem.'
          : ' W żadnym nie ma liczby spoza danych, które podałeś.')
        + (doUzupelnienia ? ` Miejsc [DO UZUPEŁNIENIA]: ${doUzupelnienia}.` : '')
        + ' To projekt operatu — przeczytaj go w całości, zanim podpiszesz.'
      : 'Nie udało się napisać żadnego rozdziału.',
  };
}

const API_PISZ = {
  ROZDZIALY: PISZ_ROZDZIALY, ZASADY: PISZ_ZASADY,
  fakty: piszFakty, faktyTekst: piszFaktyTekst, braki: piszBraki,
  polecenie: piszPolecenie, sprawdzTekst: piszSprawdzTekst,
  liczbyZTekstu: piszLiczbyZTekstu, datyZTekstu: piszDatyZTekstu,
  znacznik: piszZnacznik, podsumowanie: piszPodsumowanie,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_PISZ;
if (typeof window !== 'undefined') window.OperoPisanie = API_PISZ;

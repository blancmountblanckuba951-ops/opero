'use strict';
/* ============================================================================
   OPERO — OPERAT EXPRESS
   ----------------------------------------------------------------------------
   Pomysł jest prosty: rzeczoznawca podaje cztery rzeczy i wyciąg z RCiWN,
   a program wypełnia całą resztę tak, jak zrobiłby to sam — i MÓWI, co zrobił.

   Dwie zasady, od których nie ma odstępstwa, bo operat to dokument, pod którym
   ktoś się podpisuje:

   1. PROGRAM NICZEGO NIE ZMYŚLA. Powierzchnia, data wyceny, cel i transakcje
      pochodzą od człowieka albo z wyciągu. Tam, gdzie program musi coś przyjąć
      (wagi cech, oceny nieruchomości, trend), przyjmuje wartość NEUTRALNĄ —
      taką, która nie przechyla wyniku w żadną stronę.

   2. KAŻDE PRZYJĘCIE JEST ZAPISANE. Wynikiem nie jest sam operat, tylko operat
      PLUS lista tego, co program przyjął za rzeczoznawcę, z powodem. Lista jest
      po to, żeby ją przejrzeć i poprawić — a nie żeby uśpić czujność.

   Express nie jest jednym formularzem dla wszystkiego. Najpierw wybierasz
   RODZAJ operatu, a program pyta tylko o to, czego ten rodzaj naprawdę
   wymaga — i o nic więcej. Pytanie o stopę kapitalizacji przy wycenie lokalu
   byłoby stratą czasu, a pytanie o wyciąg RCiWN przy podejściu kosztowym
   kazałoby szukać danych, których ta metoda w ogóle nie używa.

   Części rodzajów Express NIE ROBI i mówi o tym wprost. Wywłaszczenie,
   opłata adiacencka, służebność i wycena rolna wiszą na rozstrzygnięciach
   prawnych — na dacie stanu, na przeznaczeniu w planie, na zakresie pasa
   służebności. Program, który przyjąłby je za rzeczoznawcę, nie oszczędziłby
   mu godziny, tylko podstawił mu pod podpis cudze rozstrzygnięcie.

   Opisów do operatu Express NIE PISZE. Charakterystyka rynku i uzasadnienie wag
   to wywód rzeczoznawcy; wygenerowany tekst wyglądałby jak gotowy i właśnie
   dlatego byłby groźny.
   ============================================================================ */


/* ------------------------------------------------------------------ rodzaje */
/**
 * Co Express potrafi zrobić szybko, a czego nie tknie — i dlaczego.
 * `pola` to jedyne źródło prawdy o tym, o co program pyta: z tej listy
 * powstaje formularz, z niej biorą się sprawdzenia braków i z niej opis
 * w gotowym operacie. Jedna lista zamiast trzech, które się rozjadą.
 */
const POLE = (klucz, nazwa, typ, opcje = {}) => ({ klucz, nazwa, typ, ...opcje });

/**
 * Adres: JEDNA rubryka na ulicę i osobne pole na numer.
 *
 * Miejscowości, dzielnicy, gminy, powiatu i województwa nie wpisuje już
 * człowiek — program znajduje je w państwowym rejestrze punktów adresowych
 * po nazwie ulicy. Sześć pól przy każdym operacie to sześć okazji, żeby
 * jedno zostało z poprzedniej sprawy.
 *
 * Numer zostaje OSOBNO i wpisuje go człowiek. Program go nie podstawi i nie
 * poprawi: „Długa 1" i „Długa 12" to dwie różne nieruchomości, dwie księgi
 * wieczyste i dwóch właścicieli. Pola oznaczone `zRejestru` program wypełnia
 * sam, ale zostawia je do poprawienia i mówi, że to jego wpis — bo pod
 * operatem podpisuje się rzeczoznawca, a nie rejestr.
 */
const WSPOLNE_ADRES = [
  POLE('ulica', 'Adres — wpisz ulicę', 'adres', {
    wymagane: true, szeroko: true,
    ph: 'np. Kartuska — albo cały adres: „Kartuska 201, 80-125 Gdańsk"',
    pomoc: 'Wpisz samą ulicę. Miejscowość, dzielnicę, gminę, powiat i województwo program znajdzie '
      + 'w państwowym rejestrze punktów adresowych. Gdy ta ulica jest w kilku miastach — spyta, '
      + 'bo obca miejscowość w operacie to błąd, którego nie widać.',
  }),
  POLE('numer', 'Nr budynku', 'tekst', { ph: 'np. 201', pomoc: 'Numer podajesz Ty. Program go nie podmieni — inny numer to inna nieruchomość.' }),
  POLE('miasto', 'Miejscowość', 'tekst', { wymagane: true, zRejestru: true, ph: 'z rejestru adresów' }),
  POLE('dzielnica', 'Dzielnica', 'tekst', { zRejestru: true, ph: 'z rejestru adresów' }),
];
const WSPOLNE_DATY = [
  POLE('dataWyceny', 'Data wyceny', 'data', { wymagane: true }),
  POLE('dataOgledzin', 'Data oględzin', 'data', { pomoc: 'Bez niej program wpisze datę wyceny i oznaczy to do poprawienia.' }),
  POLE('cel', 'Cel wyceny', 'tekst', { wymagane: true, szeroko: true, ph: 'np. Określenie wartości rynkowej dla potrzeb sprzedaży' }),
];

const TYPY = [
  {
    id: 'local_kcm', nazwa: 'Lokal mieszkalny', ikona: '🏢',
    metoda: 'Porównawcze — korygowanie ceny średniej',
    opis: 'Mieszkanie albo spółdzielcze własnościowe prawo do lokalu. Program policzy trend, przyjmie neutralne wagi i oceny, a Ty je poprawisz.',
    express: true, wymagaRcn: true, droga: 'porownawczy',
    pola: [...WSPOLNE_ADRES,
      POLE('lokal', 'Nr lokalu', 'tekst', { ph: 'np. 3' }),
      POLE('powierzchnia', 'Powierzchnia użytkowa [m²]', 'liczba', { wymagane: true, krok: '0.01', ph: 'np. 54,20' }),
      ...WSPOLNE_DATY,
      POLE('kw', 'Numer księgi wieczystej', 'tekst', { szeroko: true, ph: 'np. GD1G/00012345/0' }),
    ],
  },
  {
    id: 'developed_pairs', nazwa: 'Nieruchomość zabudowana', ikona: '🏠',
    metoda: 'Porównawcze — porównywanie parami',
    opis: 'Dom albo grunt z zabudową. Potrzeba co najmniej trzech nieruchomości podobnych, z którymi program porówna wycenianą bezpośrednio.',
    express: true, wymagaRcn: true, droga: 'porownawczy',
    pola: [...WSPOLNE_ADRES,
      POLE('powierzchnia', 'Powierzchnia użytkowa budynku [m²]', 'liczba', { wymagane: true, krok: '0.01' }),
      POLE('powierzchniaDzialki', 'Powierzchnia działki [m²]', 'liczba', { krok: '0.01' }),
      ...WSPOLNE_DATY,
      POLE('kw', 'Numer księgi wieczystej', 'tekst', { szeroko: true }),
    ],
  },
  {
    id: 'income', nazwa: 'Nieruchomość dochodowa', ikona: '💰',
    metoda: 'Dochodowe — kapitalizacja prosta',
    opis: 'Lokal albo budynek na wynajem. Wartość z dochodu operacyjnego netto i stopy kapitalizacji. Wyciąg RCiWN nie jest potrzebny.',
    express: true, wymagaRcn: false, droga: 'dochodowy',
    pola: [...WSPOLNE_ADRES,
      POLE('powierzchnia', 'Powierzchnia do wynajęcia [m²]', 'liczba', { wymagane: true, krok: '0.01' }),
      POLE('czynszM2', 'Czynsz miesięczny [zł/m²]', 'liczba', { wymagane: true, krok: '0.01',
        pomoc: 'Stawka rynkowa albo z obowiązującej umowy. To ona niesie cały wynik, więc musi mieć źródło.' }),
      POLE('pustostan', 'Pustostan i nieściągalność [%]', 'liczba', { krok: '0.1',
        pomoc: 'Nie podasz — program przyjmie 0% i wypisze to do sprawdzenia.' }),
      POLE('kosztyPct', 'Koszty operacyjne właściciela [% przychodu]', 'liczba', { krok: '0.1',
        pomoc: 'Podatek od nieruchomości, ubezpieczenie, zarządzanie, remonty bieżące.' }),
      POLE('stopaKap', 'Stopa kapitalizacji [%]', 'liczba', { wymagane: true, krok: '0.01',
        pomoc: 'Z transakcji na rynku lokalnym. Przyjęta „z głowy” unieważnia cały operat.' }),
      POLE('zrodloStopy', 'Skąd stopa kapitalizacji', 'tekst', { szeroko: true,
        ph: 'np. 4 transakcje lokalami usługowymi w Gdańsku, 2025–2026' }),
      ...WSPOLNE_DATY,
    ],
  },
  {
    id: 'cost', nazwa: 'Budynek lub budowla', ikona: '🏗️',
    metoda: 'Kosztowe — koszt odtworzenia pomniejszony o zużycie',
    opis: 'Obiekt, dla którego nie ma rynku porównawczego. Koszt w stanie nowym minus zużycie. Wyciąg RCiWN nie jest potrzebny.',
    express: true, wymagaRcn: false, droga: 'kosztowy',
    pola: [...WSPOLNE_ADRES,
      POLE('rodzajObiektu', 'Rodzaj obiektu', 'tekst', { wymagane: true, szeroko: true, ph: 'np. budynek gospodarczy murowany' }),
      POLE('jednostka', 'Jednostka odniesienia', 'wybor', { wymagane: true,
        opcje: [['m2', 'Powierzchnia [m²]'], ['m3', 'Kubatura [m³]']] }),
      POLE('ilosc', 'Ilość jednostek', 'liczba', { wymagane: true, krok: '0.01' }),
      POLE('cenaJednostkowa', 'Koszt jednostkowy w stanie nowym [zł]', 'liczba', { wymagane: true, krok: '0.01' }),
      POLE('zrodloCeny', 'Źródło kosztu jednostkowego', 'tekst', { wymagane: true, szeroko: true, ph: 'np. Sekocenbud, wydanie i tabela' }),
      POLE('wiek', 'Wiek obiektu [lata]', 'liczba', { wymagane: true, krok: '1' }),
      POLE('trwalosc', 'Przewidywana trwałość [lata]', 'liczba', { wymagane: true, krok: '1',
        pomoc: 'Z wieku i trwałości program policzy zużycie techniczne metodą czasową.' }),
      POLE('zuzycieFunkcjonalne', 'Zużycie funkcjonalne [%]', 'liczba', { krok: '0.1' }),
      POLE('wartoscGruntu', 'Wartość gruntu [zł]', 'liczba', { krok: '0.01',
        pomoc: 'Zostaw 0, jeśli wyceniasz sam obiekt bez gruntu.' }),
      ...WSPOLNE_DATY,
    ],
  },
  { id: 'expropriation', nazwa: 'Wywłaszczenie', ikona: '🛣️', express: false,
    metoda: 'Ustalenie odszkodowania',
    powod: 'Wynik wisi na dacie stanu, przeznaczeniu w planie i celu publicznym. Tych rozstrzygnięć program nie przyjmie za Ciebie.' },
  { id: 'fees', nazwa: 'Opłata adiacencka lub planistyczna', ikona: '📐', express: false,
    metoda: 'Wartość przed i po',
    powod: 'Trzeba wycenić dwa stany tej samej nieruchomości i uzasadnić różnicę. To dwie wyceny, nie skrót.' },
  { id: 'easement', nazwa: 'Służebność', ikona: '⚡', express: false,
    metoda: 'Wynagrodzenie za ustanowienie',
    powod: 'Zakres pasa, sposób korzystania i współczynniki są ustalane dla konkretnej sprawy, często na podstawie dokumentacji technicznej.' },
  { id: 'agri_forest', nazwa: 'Nieruchomość rolna lub leśna', ikona: '🌲', express: false,
    metoda: 'Moduł rolny i leśny',
    powod: 'Klasy bonitacyjne, użytki i drzewostan czyta się z dokumentów, a nie z adresu.' },
];

function typ(id) { return TYPY.find(t => t.id === id) || null; }
function typyExpress() { return TYPY.filter(t => t.express); }

/** Pola wymagane przez ten rodzaj, których człowiek nie wypełnił. */
/**
 * Liczby z pól Expressu przychodzą TAK, JAK JE PISZE CZŁOWIEK: „54,30".
 *
 * Pola liczbowe są polami tekstowymi z klawiaturą numeryczną, a nie
 * `type="number"` — bo przeglądarka odrzuca w nich przecinek, a po polsku
 * części dziesiętne pisze się właśnie przecinkiem. Skutek: zanim cokolwiek
 * policzymy, przecinek musi zostać zamieniony na kropkę. Bez tego
 * `Number('54,30')` to NaN, a program melduje „brakuje powierzchni" nad polem,
 * w którym powierzchnia stoi wpisana — najbardziej irytujący rodzaj błędu,
 * bo człowiek widzi swoją daną i nie wie, czego program od niego chce.
 */
function naLiczbePl(v) {
  const t = String(v ?? '').replace(/\s|\u00a0/g, '').replace(',', '.');
  return t === '' ? '' : t;
}

/** Kopia danych, w której pola liczbowe są w postaci zrozumiałej dla Number(). */
function znormalizuj(idTypu, dane) {
  const t = typ(idTypu);
  const d = { ...(dane || {}) };
  for (const pole of (t?.pola || [])) {
    if (pole.typ === 'liczba' && d[pole.klucz] !== undefined) d[pole.klucz] = naLiczbePl(d[pole.klucz]);
  }
  return d;
}

function brakiPol(idTypu, dane) {
  const t = typ(idTypu);
  if (!t || !t.express) return ['rodzaj operatu obsługiwany przez Express'];
  const d = znormalizuj(idTypu, dane);
  return (t.pola || []).filter(p => {
    if (!p.wymagane) return false;
    const v = d[p.klucz];
    if (p.typ === 'liczba') return !(Number(v) > 0);
    return !String(v ?? '').trim();
  }).map(p => p.nazwa.toLowerCase());
}

/** Jedna pozycja listy: co program przyjął, jaka wartość i dlaczego. */
function zalozenie(pole, co, wartosc, dlaczego, waga = 'sprawdz') {
  return { pole, co, wartosc: String(wartosc), dlaczego, waga };
}

/**
 * Minimum, bez którego nie ma czego liczyć — zależne od rodzaju operatu.
 * Mówimy wprost, czego brakuje, zamiast odmawiać bez powodu.
 */
function sprawdzWsad(dane, transakcje, idTypu = 'local_kcm') {
  const t = typ(idTypu);
  const braki = brakiPol(idTypu, dane);
  if (t && t.wymagaRcn) {
    const ile = (transakcje || []).length;
    if (ile < 3) braki.push(`transakcje porównawcze (jest ${ile}, potrzeba co najmniej 3)`);
  }
  return braki;
}

/**
 * Trend czasowy. Bierzemy go z regresji tylko wtedy, gdy regresja ma sens:
 * dość transakcji i dopasowanie, które cokolwiek tłumaczy. W przeciwnym razie
 * trend wynosi zero — bo „niewiarygodny trend" jest gorszy niż jego brak, a
 * rzeczoznawca dostaje to wprost napisane.
 */
function wybierzTrend(regresja, zalozenia) {
  const r = regresja || {};
  const dosc = r.valid && Number(r.count) >= 5;
  const tlumaczy = Number(r.r2) >= 0.2;
  if (dosc && tlumaczy) {
    zalozenia.push(zalozenie('market.trendSourceMode', 'Trend czasowy',
      `regresja, ${Number(r.monthlyRate).toFixed(3)} %/mies.`,
      `Policzony z ${r.count} transakcji; dopasowanie R² = ${Number(r.r2).toFixed(2)}.`, 'info'));
    return 'regression';
  }
  zalozenia.push(zalozenie('market.trendSourceMode', 'Trend czasowy', 'brak (0 %/mies.)',
    !r.valid || !dosc
      ? `Za mało transakcji z datami (${r.count || 0}), żeby liczyć trend. Przyjęto brak trendu — zweryfikuj analizą rynku.`
      : `Regresja niemal nic nie tłumaczy (R² = ${Number(r.r2).toFixed(2)}). Przyjęto brak trendu — zweryfikuj analizą rynku.`));
  return 'none';
}

/**
 * Wagi cech. Gdy transakcje mają oceny cech — da się policzyć korelację i to
 * jest uczciwy punkt wyjścia. Gdy nie mają (a wyciąg z RCiWN ich nie zawiera),
 * zostają wagi RÓWNE. To świadomy wybór: równe wagi nie faworyzują żadnej cechy,
 * czyli nie wnoszą do operatu tezy, której nikt nie postawił.
 */
function wybierzWagi(cechy, transakcje, zalozenia) {
  const majaOceny = (transakcje || []).some(t => Object.keys(t.featureRatings || {}).length > 0);
  const n = (cechy || []).length || 1;
  if (majaOceny) {
    zalozenia.push(zalozenie('market.weightMethod', 'Sposób ustalenia wag', 'analiza korelacji',
      'Transakcje mają oceny cech, więc wagi można policzyć z korelacji. Sugestię trzeba zatwierdzić.'));
    return { weightMethod: 'correlation', wagi: null };
  }
  const rowna = Number((1 / n).toFixed(4));
  zalozenia.push(zalozenie('market.features[].weight', 'Wagi cech rynkowych',
    `po ${(rowna * 100).toFixed(1)} % na każdą z ${n}`,
    'Wyciąg z RCiWN nie zawiera ocen cech, więc nie ma z czego liczyć korelacji. Równe wagi niczego nie przesądzają — ustal je analizą rynku i uzasadnij.'));
  return { weightMethod: 'manual', wagi: rowna };
}

/**
 * Składa kompletny projekt operatu z minimalnego wsadu.
 *
 * `bazowy`  — świeży projekt z OPERO (stamtąd biorą się wszystkie domyślne pola),
 * `dane`    — to, co podał człowiek,
 * `transakcje` — gotowe pozycje w formacie silnika (z modułu RCN),
 * `regresja`   — wynik regresji trendu z silnika obliczeń,
 * `profil`     — dane rzeczoznawcy z ustawień.
 */
function przygotuj({ bazowy, dane: daneSurowe, transakcje, regresja, profil, klient, typ: idTypu = 'local_kcm' } = {}) {
  const rodzaj = typ(idTypu);
  if (!rodzaj || !rodzaj.express) {
    return { ok: false, braki: [`Express nie robi tego rodzaju operatu${rodzaj ? `: ${rodzaj.powod}` : '.'}`], zalozenia: [], projekt: null };
  }
  // Przecinek dziesietny zamieniamy RAZ, tutaj. Dalej wszystkie drogi liczace
  // widza juz liczbe w postaci, ktora Number() rozumie.
  const dane = znormalizuj(idTypu, daneSurowe);
  if (rodzaj.droga === 'dochodowy') return przygotujDochodowy({ bazowy, dane, profil, klient, rodzaj });
  if (rodzaj.droga === 'kosztowy') return przygotujKosztowy({ bazowy, dane, profil, klient, rodzaj });
  return przygotujPorownawczy({ bazowy, dane, transakcje, regresja, profil, klient, rodzaj });
}

/** Wspólny początek każdej drogi: adres, daty, autor, zleceniodawca. */
function wspolnyPoczatek(p, d, profil, klient, zalozenia) {
  p.property.city = String(d.miasto || '').trim();
  p.property.district = String(d.dzielnica || '').trim();
  p.property.street = String(d.ulica || '').trim();
  p.property.buildingNo = String(d.numer || '').trim();
  p.property.localNo = String(d.lokal || '').trim();
  if (Number(d.powierzchniaDzialki) > 0) p.property.landArea = Number(d.powierzchniaDzialki);
  p.valuation.valuationDate = String(d.dataWyceny);
  p.valuation.priceLevelDate = String(d.dataWyceny);
  p.valuation.purpose = String(d.cel || '').trim();
  if (String(d.kw || '').trim()) p.legal.kwLocal = String(d.kw).trim();
  if (profil && (profil.name || profil.licenseNo || profil.company)) {
    p.author = { ...p.author, name: profil.name || '', licenseNo: profil.licenseNo || '', company: profil.company || '' };
  }
  if (klient && (klient.name || klient.company)) p.client = { ...p.client, ...klient };
  p.valuation.reportDate = String(d.dataSporzadzenia || d.dataWyceny);
  p.valuation.inspectionDate = String(d.dataOgledzin || d.dataWyceny);
  if (!d.dataOgledzin) {
    zalozenia.push(zalozenie('valuation.inspectionDate', 'Data oględzin', p.valuation.inspectionDate,
      'Nie podano daty oględzin — wpisano datę wyceny. Wpisz rzeczywistą datę, bo widnieje w operacie.'));
  }
  return p;
}

/** Czego Express nie napisze za rzeczoznawcę — wspólna lista opisowa. */
function brakujaceOpisy(p, dodatkowe = []) {
  const podstawowe = [
    ['narratives.subject', 'Opis przedmiotu wyceny'],
    ['narratives.legal', 'Opis stanu prawnego'],
  ];
  return [...dodatkowe, ...podstawowe].filter(([sciezka]) => {
    const [a, b] = sciezka.split('.');
    return !String((p[a] || {})[b.replace(/\[\]$/, '')] || '').trim();
  }).map(([pole, co]) => ({ pole, co }));
}

function przygotujPorownawczy({ bazowy, dane, transakcje, regresja, profil, klient, rodzaj } = {}) {
  const d = dane || {};
  const tx = Array.isArray(transakcje) ? transakcje : [];
  const braki = sprawdzWsad(d, tx, rodzaj.id);
  if (braki.length) return { ok: false, braki, zalozenia: [], projekt: null };

  const p = JSON.parse(JSON.stringify(bazowy));
  const zalozenia = [];
  p.module = { code: rodzaj.id };
  wspolnyPoczatek(p, d, profil, klient, zalozenia);
  p.property.usableArea = Number(d.powierzchnia);

  /* --- transakcje --- */
  p.market.transactions = tx.map(t => ({ ...t, featureRatings: { ...(t.featureRatings || {}) } }));
  zalozenia.push(zalozenie('market.transactions', 'Zbiór porównawczy', `${tx.length} transakcji`,
    'Przyjęte z wyciągu RCiWN po odrzuceniu pozycji, które nie są sprzedażą rynkową, duplikatów i cen rażąco odstających. Zbiór zatwierdza rzeczoznawca.', 'info'));

  /* --- trend --- */
  p.market.trendSourceMode = wybierzTrend(regresja, zalozenia);
  if (p.market.trendSourceMode === 'none') p.market.manualTrendRate = 0;

  /* --- cechy, wagi i oceny --- */
  const { weightMethod, wagi } = wybierzWagi(p.market.features, tx, zalozenia);
  p.market.weightMethod = weightMethod;
  if (wagi != null) p.market.features.forEach(f => { f.weight = wagi; });

  // Ocena nieruchomości: przeciętna wszędzie. To wartość neutralna — przy niej
  // wynik to po prostu cena średnia skorygowana trendem. Każda inna ocena
  // byłaby twierdzeniem o nieruchomości, którego program nie ma na czym oprzeć.
  p.market.features.forEach(f => { f.rating = 'Przeciętna'; });
  zalozenia.push(zalozenie('market.features[].rating', 'Ocena nieruchomości dla każdej cechy', 'przeciętna',
    `Program nie był na oględzinach. Ocena przeciętna nie przechyla wyniku; po obejrzeniu nieruchomości popraw ${p.market.features.length} ocen.`));

  /* --- czego Express nie zrobi za rzeczoznawcę --- */
  const doNapisania = brakujaceOpisy(p, [
    ['narratives.market', 'Charakterystyka rynku'],
    ['market.weightJustification', 'Uzasadnienie wag cech'],
  ]);

  return { ok: true, projekt: p, zalozenia, braki: [], doNapisania, typ: rodzaj.id };
}

/* ----------------------------------------------------------- dochodowy */
/**
 * Kapitalizacja prosta: wartość = dochód operacyjny netto / stopa kapitalizacji.
 * Express liczy tu NAPRAWDĘ niewiele — i o to chodzi. Cały ciężar niesie czynsz
 * i stopa, a jedno i drugie podaje człowiek, bo program nie ma skąd ich wziąć.
 * To, czego nie podał (pustostan, koszty operacyjne), przyjmujemy jako ZERO i
 * mówimy wprost, że zero zawyża wynik — bo milczące zero byłoby tu kłamstwem
 * korzystnym dla zleceniodawcy.
 */
function przygotujDochodowy({ bazowy, dane, profil, klient, rodzaj } = {}) {
  const d = dane || {};
  const braki = sprawdzWsad(d, [], rodzaj.id);
  if (braki.length) return { ok: false, braki, zalozenia: [], projekt: null };

  const p = JSON.parse(JSON.stringify(bazowy));
  const zalozenia = [];
  p.module = { code: rodzaj.id };
  wspolnyPoczatek(p, d, profil, klient, zalozenia);
  p.property.usableArea = Number(d.powierzchnia);

  const powierzchnia = Number(d.powierzchnia);
  const czynszRoczny = Math.round(powierzchnia * Number(d.czynszM2) * 12 * 100) / 100;

  // Pozycje skladamy DOKLADNIE w ksztalcie, ktorego oczekuje silnik dochodowy
  // i tabele w kreatorze: stawka za metr miesiecznie w `baseRent`/`effectiveRent`,
  // a nie gotowa kwota roczna. Inaczej rzeczoznawca otwiera kreator i widzi
  // puste tabele przy niezerowym wyniku - a to najgorsza z mozliwych kombinacji.
  p.income = { ...p.income, technique: 'cap', areaLettable: powierzchnia,
    otherIncome: 0,
    vacancyPct: Number(d.pustostan) || 0, collectionPct: 0,
    capRate: Number(d.stopaKap), discountRate: 0, terminalRate: 0,
    leases: [{ tenant: '[do uzupełnienia]', area: powierzchnia, start: String(d.dataWyceny), end: '',
      baseRent: Number(d.czynszM2), effectiveRent: Number(d.czynszM2),
      terms: 'Pozycja z danych Express — podstaw rzeczywistą umowę albo stawkę rynkową.', source: 'Express' }],
    rentEvidence: [{ source: 'Dane podane w Express', location: [d.ulica, d.numer, d.miasto].filter(Boolean).join(' '),
      cls: '', date: String(d.dataWyceny), rent: Number(d.czynszM2), conditions: '',
      evidenceType: 'transakcja', accepted: true, reason: 'Stawka podana przy tworzeniu operatu Express.' }],
    rateEvidence: String(d.zrodloStopy || '').trim()
      ? [{ source: String(d.zrodloStopy).trim(), market: '', date: String(d.dataWyceny),
           rate: Number(d.stopaKap), incomeDef: 'NOI', risk: '', adjustment: 0, adopted: true }]
      : [],
    opex: [], techniqueJustification: '' };
  zalozenia.push(zalozenie('income.leases', 'Przychód potencjalny (PGI)',
    `${czynszRoczny.toLocaleString('pl-PL')} zł rocznie`,
    `Z podanej stawki ${Number(d.czynszM2)} zł/m² miesięcznie przy ${powierzchnia} m². Sprawdź, czy stawka odpowiada umowie albo rynkowi — to ona niesie cały wynik.`, 'sprawdz'));

  const kosztyPct = Number(d.kosztyPct) || 0;
  if (kosztyPct > 0) {
    p.income.opex = [{ name: 'Koszty operacyjne właściciela', bearer: 'właściciel',
      amount: Math.round(czynszRoczny * kosztyPct) / 100,
      source: `Przyjęte jako ${kosztyPct}% przychodu potencjalnego — do rozpisania na pozycje.` }];
    zalozenia.push(zalozenie('income.opex', 'Koszty operacyjne',
      `${kosztyPct}% przychodu`, 'Jedna pozycja zbiorcza. Przed podpisem rozpisz ją na podatek, ubezpieczenie, zarządzanie i remonty.', 'sprawdz'));
  } else {
    zalozenia.push(zalozenie('income.opex', 'Koszty operacyjne', 'nie podano (0 zł)',
      'Brak kosztów operacyjnych ZAWYŻA wartość. Rozpisz je albo podaj udział procentowy i przelicz ponownie.', 'sprawdz'));
  }
  if (!(Number(d.pustostan) > 0)) {
    zalozenia.push(zalozenie('income.vacancyPct', 'Pustostan i nieściągalność', '0 %',
      'Pełne wynajęcie przez cały rok jest założeniem skrajnie korzystnym. Podaj udział pustostanów właściwy dla tego rynku.', 'sprawdz'));
  }
  zalozenia.push(zalozenie('income.capRate', 'Stopa kapitalizacji', `${Number(d.stopaKap)} %`,
    String(d.zrodloStopy || '').trim()
      ? `Podana przez Ciebie, źródło: ${String(d.zrodloStopy).trim()}.`
      : 'Podana przez Ciebie, bez wskazania źródła. Stopa bez dowodu z rynku unieważnia operat — dopisz, skąd pochodzi.',
    String(d.zrodloStopy || '').trim() ? 'info' : 'sprawdz'));
  zalozenia.push(zalozenie('income.technique', 'Technika', 'kapitalizacja prosta',
    'Express liczy wyłącznie kapitalizacją prostą. Jeśli dochód będzie się zmieniał w czasie, przejdź na DCF w kreatorze.', 'info'));

  const doNapisania = brakujaceOpisy(p, [
    ['income.techniqueJustification', 'Uzasadnienie wyboru techniki'],
    ['narratives.market', 'Charakterystyka rynku najmu'],
  ]);
  return { ok: true, projekt: p, zalozenia, braki: [], doNapisania, typ: rodzaj.id };
}

/* ------------------------------------------------------------ kosztowy */
/**
 * Koszt odtworzenia minus zużycie. Zużycie techniczne liczymy metodą czasową —
 * z wieku i przewidywanej trwałości — bo to jedyna metoda, którą da się policzyć
 * bez oglądania każdego elementu budynku z osobna. Program zapisuje, że tak
 * zrobił; metoda elementów scalonych zostaje w kreatorze dla tych wycen,
 * w których różnica ma znaczenie.
 */
function przygotujKosztowy({ bazowy, dane, profil, klient, rodzaj } = {}) {
  const d = dane || {};
  const braki = sprawdzWsad(d, [], rodzaj.id);
  if (braki.length) return { ok: false, braki, zalozenia: [], projekt: null };

  const p = JSON.parse(JSON.stringify(bazowy));
  const zalozenia = [];
  p.module = { code: rodzaj.id };
  wspolnyPoczatek(p, d, profil, klient, zalozenia);
  if (d.jednostka === 'm2') p.property.usableArea = Number(d.ilosc);

  const wiek = Number(d.wiek), trwalosc = Number(d.trwalosc);
  const zuzycieCzasowe = trwalosc > 0 ? Math.min(100, Math.round(wiek / trwalosc * 10000) / 100) : 0;

  p.modul = { ...(p.modul || {}),
    technika: 'odtworzenie', rodzajObiektu: String(d.rodzajObiektu).trim(),
    jednostka: d.jednostka === 'm3' ? 'm3' : 'm2',
    ilosc: Number(d.ilosc), cenaJednostkowa: Number(d.cenaJednostkowa),
    zrodloCeny: String(d.zrodloCeny).trim(), uzasadnienieTechniki: '',
    sposobZuzycia: 'wiek', wiek, trwalosc, zuzycieReczne: 0,
    zuzycieFunkcjonalne: Number(d.zuzycieFunkcjonalne) || 0, zuzycieSrodowiskowe: 0,
    uzasadnienieZuzycia: '', elementy: [],
    wliczGrunt: Number(d.wartoscGruntu) > 0 ? 'tak' : 'nie',
    wartoscGruntu: Number(d.wartoscGruntu) || 0, zrodloGruntu: '' };

  zalozenia.push(zalozenie('modul.technika', 'Technika', 'koszt odtworzenia',
    'Express przyjmuje odtworzenie. Jeśli wyceniasz obiekt, którego nikt dziś tak nie buduje, przestaw na koszt zastąpienia w kreatorze.', 'sprawdz'));
  zalozenia.push(zalozenie('modul.sposobZuzycia', 'Zużycie techniczne',
    `${zuzycieCzasowe} % (metoda czasowa)`,
    `Policzone z wieku ${wiek} lat i trwałości ${trwalosc} lat. Jeśli obiekt był remontowany albo poszczególne elementy są w różnym stanie, policz zużycie metodą elementów scalonych.`, 'sprawdz'));
  if (!(Number(d.zuzycieFunkcjonalne) > 0)) {
    zalozenia.push(zalozenie('modul.zuzycieFunkcjonalne', 'Zużycie funkcjonalne', '0 %',
      'Nie podano. Przy starszych obiektach układ i rozwiązania techniczne zwykle odbiegają od dzisiejszych wymagań — sprawdź, czy zero jest prawdziwe.', 'sprawdz'));
  }
  if (!(Number(d.wartoscGruntu) > 0)) {
    zalozenia.push(zalozenie('modul.wliczGrunt', 'Grunt', 'nie wliczony',
      'Wyceniany jest sam obiekt budowlany. Jeśli przedmiotem wyceny jest nieruchomość razem z gruntem, podaj wartość gruntu.', 'info'));
  }

  const doNapisania = brakujaceOpisy(p, [
    ['modul.uzasadnienieTechniki', 'Uzasadnienie wyboru techniki'],
    ['modul.uzasadnienieZuzycia', 'Uzasadnienie przyjętego zużycia'],
  ]);
  return { ok: true, projekt: p, zalozenia, braki: [], doNapisania, typ: rodzaj.id };
}

/**
 * Podsumowanie dla ekranu przeglądu: ile rzeczy program przyjął sam, ile
 * wymaga sprawdzenia i czy wolno już generować PDF.
 *
 * PDF jest zablokowany, dopóki rzeczoznawca nie potwierdzi, że przejrzał
 * założenia. Nie jest to formalność: podpisuje się pod każdą z tych liczb.
 */
function podsumowanie(wynik, potwierdzone = false) {
  const z = (wynik && wynik.zalozenia) || [];
  const doSprawdzenia = z.filter(x => x.waga === 'sprawdz');
  const doNapisania = (wynik && wynik.doNapisania) || [];
  return {
    przyjetych: z.length,
    doSprawdzenia: doSprawdzenia.length,
    doNapisania: doNapisania.length,
    wolnoPdf: !!potwierdzone && doNapisania.length === 0,
    powodBlokady: !potwierdzone
      ? 'Przejrzyj listę przyjęć i potwierdź, że je przyjmujesz.'
      : doNapisania.length
        ? `Do napisania zostało: ${doNapisania.map(x => x.co.toLowerCase()).join(', ')}.`
        : '',
  };
}

const API_EXPRESS = {
  naLiczbePl, znormalizuj, przygotuj, podsumowanie, sprawdzWsad, wybierzTrend, wybierzWagi,
  TYPY, typ, typyExpress, brakiPol, przygotujPorownawczy, przygotujDochodowy, przygotujKosztowy };
if (typeof module !== 'undefined' && module.exports) module.exports = API_EXPRESS;
if (typeof window !== 'undefined') window.OperoExpress = API_EXPRESS;

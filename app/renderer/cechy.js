'use strict';
/* ============================================================================
   OPERO — CECHY RYNKOWE: KTORE WZIAC, JAKA DAC WAGE, JAK OCENIC
   ----------------------------------------------------------------------------
   To jest miejsce, w ktorym operat porownawczy najczesciej sie sypie —
   i miejsce, ktoremu weryfikator przyglada sie najuwazniej. Trzy decyzje:

     1. KTORE CECHY. Zbior cech ma odpowiadac temu, co rzeczywiscie rozniocuje
        ceny na tym rynku. Cecha, ktora na rynku nie dziala, rozmywa wynik;
        cecha pominieta, a istotna - wypacza go.
     2. JAKA WAGA. Suma wag musi wynosic 1,0 (100%). Waga ma byc UZASADNIONA,
        a nie przyjeta „bo tak" - § 4 ust. 2 rozporzadzenia w sprawie wycen
        kaze okreslic ceche i jej wplyw na cene.
     3. JAKA OCENA. Trzystopniowa skala (niekorzystna - przecietna -
        korzystna) jest w praktyce najczesciej stosowana, bo da sie ja
        obronic: przy pieciu stopniach rzeczoznawca zwykle nie umie wskazac,
        czym rozni sie „korzystna" od „bardzo korzystnej".

   CZEGO TEN MODUL NIE ROBI

   Nie wybiera cech za rzeczoznawce i nie ustala wag. PODPOWIADA: pokazuje
   zestaw, ktory na danym rynku stosuje sie najczesciej, typowe przedzialy
   wag z praktyki i - przy kazdym stopniu skali - zdanie, co ten stopien
   znaczy dla TEJ cechy. Decyzja i uzasadnienie naleza do czlowieka, bo to
   on podpisuje operat.

   Liczby wag podane nizej to PRZEDZIALY SPOTYKANE W PRAKTYCE, a nie norma.
   Zadne rozporzadzenie nie ustala wag; ustala je rzeczoznawca na podstawie
   analizy rynku. Program mowi o tym wprost przy kazdej podpowiedzi.
   ========================================================================= */

/** Trzy stopnie. Nazwy MUSZA byc takie, jak rozumie silnik obliczen. */
const CECHY_STOPNIE = ['Niekorzystna', 'Przeciętna', 'Korzystna'];

const C = (id, nazwa, { opis, wagaOd, wagaDo, skala, uwaga = '' }) =>
  ({ id, nazwa, opis, wagaOd, wagaDo, uwaga, skala });

/* ------------------------------------------------- lokal mieszkalny */
const CECHY_LOKAL = [
  C('lokalizacja', 'Lokalizacja szczegółowa', {
    opis: 'Położenie w obrębie miasta i dzielnicy: prestiż adresu, odległość od centrum, sąsiedztwo.',
    wagaOd: 20, wagaDo: 35,
    uwaga: 'Na większości rynków mieszkaniowych to cecha o największej wadze.',
    skala: [
      'Peryferia, sąsiedztwo uciążliwe (droga tranzytowa, tory, zakład przemysłowy), zła opinia adresu.',
      'Typowa dzielnica mieszkaniowa, sąsiedztwo bez wad i bez wyróżników.',
      'Adres ceniony na rynku: centrum, strefa nadmorska, osiedle o dobrej opinii, sąsiedztwo zieleni.',
    ],
  }),
  C('standard', 'Standard wykończenia lokalu', {
    opis: 'Stan i jakość wykończenia wnętrza: podłogi, stolarka, łazienka, kuchnia, instalacje.',
    wagaOd: 15, wagaDo: 30,
    skala: [
      'Do remontu: wykończenie zużyte, instalacje do wymiany, konieczny nakład przed zamieszkaniem.',
      'Stan dobry, wykończenie typowe dla rynku, nadaje się do zamieszkania bez nakładów.',
      'Wysoki standard: wykończenie z materiałów podwyższonej jakości, po niedawnym remoncie.',
    ],
  }),
  C('powierzchnia', 'Powierzchnia użytkowa', {
    opis: 'Wpływ wielkości lokalu na cenę jednostkową — mieszkania małe mają zwykle wyższą cenę za metr.',
    wagaOd: 5, wagaDo: 15,
    uwaga: 'Sprawdź kierunek na swoim rynku: zależność bywa odwrotna niż w skali kraju.',
    skala: [
      'Powierzchnia nietypowa dla segmentu — trudniej zbywalna, niższa cena za metr.',
      'Powierzchnia typowa dla segmentu i liczby pokoi.',
      'Powierzchnia najbardziej poszukiwana na tym rynku.',
    ],
  }),
  C('kondygnacja', 'Kondygnacja i winda', {
    opis: 'Piętro położenia lokalu w powiązaniu z obecnością windy.',
    wagaOd: 5, wagaDo: 15,
    skala: [
      'Parter przy ruchliwej ulicy albo wysokie piętro bez windy.',
      'Piętro pośrednie w budynku z windą albo niskie piętro bez windy.',
      'Piętro poszukiwane: wyższe z windą i widokiem, ostatnie z tarasem.',
    ],
  }),
  C('stanBudynku', 'Stan techniczny i wiek budynku', {
    opis: 'Stan części wspólnych, docieplenie, wymiana instalacji, rok budowy i technologia.',
    wagaOd: 10, wagaDo: 25,
    skala: [
      'Budynek przed remontem: brak docieplenia, instalacje pierwotne, zaniedbane części wspólne.',
      'Budynek utrzymany, po części remontów, bez widocznych wad.',
      'Budynek nowy albo po kompleksowej termomodernizacji, zadbane części wspólne.',
    ],
  }),
  C('otoczenie', 'Otoczenie i infrastruktura', {
    opis: 'Dostęp do komunikacji, szkół, handlu i usług, tereny zielone, miejsca postojowe.',
    wagaOd: 5, wagaDo: 20,
    skala: [
      'Słaby dostęp do komunikacji i usług, brak miejsc postojowych.',
      'Infrastruktura typowa dla dzielnicy, przystanek w zasięgu dojścia pieszego.',
      'Pełna infrastruktura w zasięgu pieszym, dobra komunikacja, zieleń, miejsca postojowe.',
    ],
  }),
  C('pomieszczenia', 'Pomieszczenia przynależne i balkon', {
    opis: 'Piwnica, komórka lokatorska, garaż, miejsce postojowe, balkon, taras, ogródek.',
    wagaOd: 3, wagaDo: 12,
    skala: [
      'Brak pomieszczeń przynależnych i brak balkonu.',
      'Piwnica albo komórka, balkon o typowej wielkości.',
      'Garaż albo miejsce postojowe w cenie, duży taras lub ogródek.',
    ],
  }),
];

/* ---------------------------------------- nieruchomosc zabudowana */
const CECHY_DOM = [
  C('lokalizacja', 'Lokalizacja', {
    opis: 'Położenie działki: odległość od miasta, prestiż okolicy, sąsiedztwo, widok.',
    wagaOd: 20, wagaDo: 35,
    skala: [
      'Sąsiedztwo uciążliwe, duża odległość od miasta i usług.',
      'Typowa okolica mieszkaniowa jednorodzinna.',
      'Okolica ceniona: cisza, zieleń, dobry dojazd, prestiż adresu.',
    ],
  }),
  C('powierzchniaDzialki', 'Powierzchnia i kształt działki', {
    opis: 'Wielkość działki, proporcje, możliwość zagospodarowania, ekspozycja.',
    wagaOd: 10, wagaDo: 25,
    skala: [
      'Działka za mała albo o kształcie utrudniającym zagospodarowanie.',
      'Działka o typowej wielkości i regularnym kształcie.',
      'Działka duża, regularna, dobrze wyeksponowana.',
    ],
  }),
  C('stanBudynku', 'Stan techniczny budynku', {
    opis: 'Stan konstrukcji, dachu, elewacji, instalacji; zakres koniecznych nakładów.',
    wagaOd: 15, wagaDo: 30,
    skala: [
      'Budynek wymaga remontu kapitalnego albo elementów konstrukcyjnych.',
      'Budynek w stanie dobrym, bez pilnych nakładów.',
      'Budynek nowy albo po gruntownym remoncie.',
    ],
  }),
  C('standard', 'Standard wykończenia', {
    opis: 'Jakość wykończenia wnętrz i wyposażenia instalacyjnego.',
    wagaOd: 10, wagaDo: 25,
    skala: [
      'Stan surowy albo wykończenie zużyte.',
      'Wykończenie typowe, w dobrym stanie.',
      'Wysoki standard wykończenia i wyposażenia.',
    ],
  }),
  C('uzbrojenie', 'Uzbrojenie i dostęp do drogi', {
    opis: 'Przyłącza (woda, kanalizacja, gaz, prąd) i sposób dostępu do drogi publicznej.',
    wagaOd: 5, wagaDo: 20,
    skala: [
      'Brak części przyłączy albo dostęp do drogi bez ustanowionego prawa.',
      'Pełne uzbrojenie, dostęp przez drogę wewnętrzną z ustanowioną służebnością.',
      'Pełne uzbrojenie i bezpośredni dostęp z drogi publicznej.',
    ],
  }),
  C('otoczenie', 'Otoczenie i infrastruktura', {
    opis: 'Dostęp do usług, szkół, komunikacji; charakter zabudowy sąsiedniej.',
    wagaOd: 5, wagaDo: 20,
    skala: [
      'Brak usług i komunikacji w pobliżu.',
      'Infrastruktura typowa dla okolicy.',
      'Pełna infrastruktura i dobra komunikacja.',
    ],
  }),
];

/* ---------------------------------------------- dzialka niezabudowana */
const CECHY_DZIALKA = [
  C('lokalizacja', 'Lokalizacja', {
    opis: 'Położenie względem miasta, dróg i usług; prestiż i sąsiedztwo.',
    wagaOd: 25, wagaDo: 40,
    skala: [
      'Peryferia, słaby dojazd, sąsiedztwo uciążliwe.',
      'Typowe położenie dla tego rodzaju terenów.',
      'Położenie poszukiwane: blisko miasta, dobry dojazd, atrakcyjne sąsiedztwo.',
    ],
  }),
  C('przeznaczenie', 'Przeznaczenie w planie', {
    opis: 'Zapis miejscowego planu albo decyzji: co i w jakim zakresie wolno tu wybudować.',
    wagaOd: 15, wagaDo: 35,
    uwaga: 'Przy działkach to zwykle druga co do wagi cecha — przeznaczenie przesądza o sposobie użycia.',
    skala: [
      'Przeznaczenie ograniczające zabudowę albo brak planu i decyzji.',
      'Przeznaczenie typowe dla segmentu, parametry przeciętne.',
      'Przeznaczenie korzystne: wysoki wskaźnik zabudowy, szerokie dopuszczenia.',
    ],
  }),
  C('powierzchniaDzialki', 'Powierzchnia i kształt', {
    opis: 'Wielkość, proporcje boków, możliwość podziału i zagospodarowania.',
    wagaOd: 10, wagaDo: 25,
    skala: [
      'Kształt utrudniający zabudowę albo powierzchnia nietypowa dla segmentu.',
      'Powierzchnia i kształt typowe.',
      'Powierzchnia poszukiwana, kształt regularny, możliwość podziału.',
    ],
  }),
  C('uzbrojenie', 'Uzbrojenie terenu', {
    opis: 'Przyłącza dostępne w granicy albo w drodze; koszt doprowadzenia mediów.',
    wagaOd: 10, wagaDo: 25,
    skala: [
      'Brak uzbrojenia, konieczne kosztowne przyłącza.',
      'Uzbrojenie częściowe albo w drodze przy działce.',
      'Pełne uzbrojenie w granicy działki.',
    ],
  }),
  C('dostep', 'Dostęp do drogi publicznej', {
    opis: 'Sposób i pewność prawna dostępu; szerokość i nawierzchnia drogi.',
    wagaOd: 10, wagaDo: 25,
    skala: [
      'Brak ustanowionego dostępu albo dojazd drogą gruntową bez prawa.',
      'Dostęp przez drogę wewnętrzną z ustanowioną służebnością.',
      'Bezpośredni dostęp z utwardzonej drogi publicznej.',
    ],
  }),
];

/* ------------------------------------------------------ lokal uzytkowy */
const CECHY_UZYTKOWY = [
  C('lokalizacja', 'Lokalizacja i ekspozycja', {
    opis: 'Natężenie ruchu pieszego, widoczność witryny, prestiż ulicy.',
    wagaOd: 25, wagaDo: 40,
    skala: [
      'Boczna ulica, brak ruchu pieszego, lokal niewidoczny.',
      'Położenie typowe dla usług w tej okolicy.',
      'Ulica handlowa, duży ruch pieszy, witryna dobrze wyeksponowana.',
    ],
  }),
  C('funkcjonalnosc', 'Funkcjonalność i układ', {
    opis: 'Podział na pomieszczenia, wysokość, zaplecze, możliwość adaptacji.',
    wagaOd: 15, wagaDo: 30,
    skala: [
      'Układ utrudniający prowadzenie działalności, brak zaplecza.',
      'Układ typowy, da się zaadaptować bez większych nakładów.',
      'Układ otwarty, wysokie pomieszczenia, pełne zaplecze.',
    ],
  }),
  C('standard', 'Standard wykończenia', {
    opis: 'Stan wykończenia i wyposażenia instalacyjnego lokalu.',
    wagaOd: 10, wagaDo: 25,
    skala: [
      'Lokal do remontu: wykończenie zużyte, instalacje wymagają wymiany przed otwarciem działalności.',
      'Wykończenie typowe dla lokali usługowych w tej okolicy, w stanie dobrym.',
      'Wysoki standard wykończenia, po niedawnym remoncie, gotowy do wprowadzenia najemcy.',
    ],
  }),
  C('dostepnosc', 'Dostępność i parking', {
    opis: 'Dojazd, miejsca postojowe dla klientów, dostęp dla dostaw.',
    wagaOd: 10, wagaDo: 25,
    skala: [
      'Brak miejsc postojowych i utrudniony dojazd dostaw.',
      'Parkowanie w okolicy, dojazd możliwy.',
      'Własne miejsca postojowe, wygodny dojazd i dostawy.',
    ],
  }),
  C('stanBudynku', 'Stan budynku', {
    opis: 'Stan techniczny i prestiż budynku, w którym znajduje się lokal.',
    wagaOd: 5, wagaDo: 20,
    skala: [
      'Budynek zaniedbany: elewacja i części wspólne obniżają odbiór lokalu przez klientów.',
      'Budynek utrzymany, części wspólne w stanie dobrym, bez wyróżników.',
      'Budynek nowy albo prestiżowy — sam adres podnosi wartość lokalu usługowego.',
    ],
  }),
];

/* Lokal w budynku jednorodzinnym (bliźniak, szereg) – rynek domów, a nie
   mieszkań w blokach: liczy się garaż, ogródek, wiek budynku; nie liczy się winda. */
const CECHY_SEGMENT = [
  C('lokalizacja', 'Lokalizacja szczegółowa', {
    opis: 'Położenie w dzielnicy: dojazd, komunikacja, sąsiedztwo, uciążliwości (hałas lotniczy i drogowy).',
    wagaOd: 20, wagaDo: 32,
    uwaga: 'Na rynku domów i segmentów zwykle cecha o największej wadze.',
    skala: [
      'Peryferia, słaby dojazd albo uciążliwe sąsiedztwo (hałas lotniczy lub drogowy, przemysł).',
      'Typowa dzielnica zabudowy jednorodzinnej, sąsiedztwo bez wad i bez wyróżników.',
      'Adres ceniony: bliskość zieleni lub centrum, dobra komunikacja, spokojne sąsiedztwo.',
    ],
  }),
  C('standard', 'Standard wykończenia', {
    opis: 'Jakość i stan wykończenia wnętrz: podłogi, stolarka, łazienki, kuchnia, zabudowy.',
    wagaOd: 15, wagaDo: 28,
    skala: [
      'Stan deweloperski albo wykończenie zużyte, wymagające nakładów.',
      'Wykończenie typowe, do zamieszkania bez nakładów.',
      'Wysoki standard: materiały podwyższonej jakości, wykończenie niedawne, zabudowy na wymiar.',
    ],
  }),
  C('stan', 'Stan techniczny i wiek budynku', {
    opis: 'Wiek, technologia, energooszczędność i stan elementów budynku.',
    wagaOd: 12, wagaDo: 25,
    skala: [
      'Budynek starszy, wymagający remontu elementów konstrukcyjnych lub instalacji.',
      'Stan dobry, budynek bez pilnych potrzeb remontowych.',
      'Budynek nowy lub po kompleksowej modernizacji, rozwiązania energooszczędne.',
    ],
  }),
  C('powierzchnia', 'Powierzchnia użytkowa', {
    opis: 'Wpływ wielkości lokalu na cenę jednostkową.',
    wagaOd: 5, wagaDo: 15,
    uwaga: 'Lokale większe mają zwykle niższą cenę za metr.',
    skala: [
      'Powierzchnia odbiegająca od typowej dla segmentu (wyraźnie większa), niższa cena jednostkowa.',
      'Powierzchnia typowa dla segmentu.',
      'Powierzchnia mniejsza od typowej, poszukiwana – wyższa cena jednostkowa.',
    ],
  }),
  C('garaz', 'Garaż i miejsca postojowe', {
    opis: 'Garaż w bryle budynku, miejsca postojowe na działce.',
    wagaOd: 5, wagaDo: 15,
    skala: ['Brak garażu i miejsca na działce.', 'Miejsce postojowe na działce, bez garażu.', 'Garaż w bryle budynku i miejsce na działce.'],
  }),
  C('ogrodek', 'Ogródek i teren do wyłącznego korzystania', {
    opis: 'Wielkość i zagospodarowanie części działki przypisanej do lokalu.',
    wagaOd: 5, wagaDo: 15,
    skala: ['Brak ogródka albo bardzo mały.', 'Ogródek typowy dla zabudowy bliźniaczej.', 'Ogródek duży, zagospodarowany, dobrze nasłoneczniony.'],
  }),
  C('otoczenie', 'Otoczenie i infrastruktura', {
    opis: 'Sklepy, szkoły, usługi i zieleń w zasięgu spaceru.',
    wagaOd: 5, wagaDo: 15,
    skala: ['Usługi i szkoły daleko, potrzebny samochód.', 'Podstawowe usługi w zasięgu spaceru.', 'Pełna infrastruktura i zieleń w bliskim sąsiedztwie.'],
  }),
];

const CECHY_ZESTAWY = {
  segment: { nazwa: 'Lokal w zabudowie bliźniaczej lub szeregowej', cechy: CECHY_SEGMENT },
  lokal: { nazwa: 'Lokal mieszkalny', cechy: CECHY_LOKAL },
  dom: { nazwa: 'Nieruchomość gruntowa zabudowana', cechy: CECHY_DOM },
  dzialka: { nazwa: 'Działka niezabudowana', cechy: CECHY_DZIALKA },
  uzytkowy: { nazwa: 'Lokal użytkowy', cechy: CECHY_UZYTKOWY },
};

/** Z kodu modułu operatu na zestaw cech. */
function cechyRodzaj(kodModulu = '', { zabudowana = false, segment = false } = {}) {
  const k = String(kodModulu || '').toLowerCase();
  if (segment && !zabudowana && !k.includes('pair') && !k.includes('developed')) return 'segment';
  if (zabudowana || k.includes('pair') || k.includes('developed') || k.includes('building')) return 'dom';
  if (k.includes('land') || k.includes('plot') || k.includes('dzialk') || k.includes('agri')) return 'dzialka';
  if (k.includes('commercial') || k.includes('uzytk') || k.includes('income')) return 'uzytkowy';
  return 'lokal';
}

function cechyZestaw(rodzaj) {
  return CECHY_ZESTAWY[rodzaj] || CECHY_ZESTAWY.lokal;
}

/** Środek typowego przedziału wagi — punkt wyjścia, nie norma. */
function cechySrodekWagi(c) { return Math.round((c.wagaOd + c.wagaDo) / 2); }

/**
 * Podpowiedź zestawu cech razem z wagami.
 *
 * Wagi skalujemy tak, żeby sumowały się do 100% — bo suma różna od 100%
 * to najczęstszy błąd w tej tabeli i silnik liczy wtedy wartość, która
 * wygląda poprawnie, a nią nie jest.
 */
function cechySugeruj(rodzaj, { ile = 0 } = {}) {
  const zestaw = cechyZestaw(rodzaj);
  let wybrane = zestaw.cechy.slice();
  if (ile > 0 && ile < wybrane.length) {
    // Przy mniejszej liczbie cech zostawiamy te o najwyzszej typowej wadze -
    // to one rozdzielaja ceny na rynku najmocniej.
    wybrane = wybrane.slice().sort((a, b) => cechySrodekWagi(b) - cechySrodekWagi(a)).slice(0, ile);
  }
  const surowe = wybrane.map(c => cechySrodekWagi(c));
  const suma = surowe.reduce((s, x) => s + x, 0) || 1;
  const wagi = surowe.map(x => Math.round(x / suma * 1000) / 10);
  // Zaokraglenia potrafia dac 99,9 albo 100,1 - roznice doklejamy do cechy
  // o najwiekszej wadze, zeby suma byla dokladnie 100.
  const roznica = Math.round((100 - wagi.reduce((s, x) => s + x, 0)) * 10) / 10;
  if (roznica !== 0) {
    const i = wagi.indexOf(Math.max(...wagi));
    wagi[i] = Math.round((wagi[i] + roznica) * 10) / 10;
  }
  return wybrane.map((c, i) => ({
    id: c.id, nazwa: c.nazwa, opis: c.opis, uwaga: c.uwaga,
    waga: wagi[i], wagaOd: c.wagaOd, wagaDo: c.wagaDo,
    skala: cechySkala(c),
  }));
}

/** Trzy stopnie z opisem, co każdy z nich znaczy DLA TEJ cechy. */
function cechySkala(cecha) {
  const c = typeof cecha === 'string' ? cechySzukaj(cecha) : cecha;
  const opisy = (c && c.skala) || ['', '', ''];
  return CECHY_STOPNIE.map((ocena, i) => ({ ocena, opis: opisy[i] || '' }));
}

/** Cecha po identyfikatorze albo po nazwie — w dowolnym zestawie. */
function cechySzukaj(idAlboNazwa) {
  const szukane = String(idAlboNazwa || '').trim().toLowerCase();
  if (!szukane) return null;
  for (const zestaw of Object.values(CECHY_ZESTAWY)) {
    const trafiona = zestaw.cechy.find(c =>
      c.id.toLowerCase() === szukane || c.nazwa.toLowerCase() === szukane);
    if (trafiona) return trafiona;
  }
  return null;
}

/**
 * Odmiana liczebnika po polsku: 1 / 2-4 / 5+ z wyjatkiem 12-14.
 * Liczba ulamkowa zawsze bierze forme dopelniacza liczby pojedynczej
 * ("0,5 punktu procentowego"), tak jak mowi sie o czesciach calosci.
 */
function cechyOdmien(n, jeden, dwa, piec) {
  const x = Math.abs(Number(n) || 0);
  if (!Number.isInteger(x)) return jeden;
  if (x === 1) return jeden;
  const reszta100 = x % 100;
  if (reszta100 >= 12 && reszta100 <= 14) return piec;
  const reszta10 = x % 10;
  return (reszta10 >= 2 && reszta10 <= 4) ? dwa : piec;
}

/**
 * Sprawdzenie wag. Nie blokuje — mówi, co jest nie tak i jak to poprawić.
 *
 * Suma różna od 100% jest tu najgroźniejsza, bo nic się nie psuje widocznie:
 * silnik policzy wartość, operat wyjdzie, a wynik będzie zaniżony albo
 * zawyżony proporcjonalnie do błędu sumy.
 */
function cechySprawdzWagi(cechy = []) {
  const lista = (cechy || []).map(c => ({ ...c, waga: Number(c.waga) || 0 }));
  const suma = Math.round(lista.reduce((s, c) => s + c.waga, 0) * 10) / 10;
  const uwagi = [];
  if (!lista.length) {
    return { suma: 0, ok: false, waga: 'blad',
      uwagi: ['Nie ma ani jednej cechy rynkowej. Bez nich metoda korygowania ceny średniej nie ma czego korygować.'] };
  }
  if (Math.abs(suma - 100) > 0.11) {
    const roznica = Math.abs(Math.round((100 - suma) * 10) / 10);
    // "Brakuje" rzadzi dopelniaczem, wiec kazda liczba poza jedynka idzie w "punktow".
    // "Nadmiar wynosi" rzadzi biernikiem, wiec 2-4 ma wlasna forme "punkty".
    const nazwaPunktu = suma < 100
      ? cechyOdmien(roznica, 'punktu procentowego', 'punktów procentowych', 'punktów procentowych')
      : cechyOdmien(roznica, 'punkt procentowy', 'punkty procentowe', 'punktów procentowych');
    uwagi.push(`Wagi sumują się do ${suma.toLocaleString('pl-PL')}%, a muszą do 100%. `
      + `${suma < 100 ? 'Brakuje' : 'Nadmiar wynosi'} ${roznica.toLocaleString('pl-PL')} ${nazwaPunktu}. `
      + 'Przy złej sumie silnik policzy wartość, która wygląda poprawnie, a jest zaniżona albo zawyżona.');
  }
  const zerowe = lista.filter(c => c.waga <= 0);
  if (zerowe.length) {
    const zdanieZero = cechyOdmien(zerowe.length, 'cecha ma wagę zero', 'cechy mają wagę zero', 'cech ma wagę zero');
    uwagi.push(`${zerowe.length} ${zdanieZero}: `
      + `${zerowe.map(c => c.nazwa || c.id).join(', ')}. Cecha z wagą zero nie wpływa na wynik — `
      + 'albo nadaj jej wagę, albo usuń ją z tabeli, żeby nie sugerowała, że była brana pod uwagę.');
  }
  const dominujace = lista.filter(c => c.waga > 50);
  if (dominujace.length) {
    uwagi.push(`${dominujace.map(c => c.nazwa || c.id).join(', ')}: waga powyżej 50% znaczy, że ta jedna cecha `
      + 'decyduje o wyniku bardziej niż wszystkie pozostałe razem. To bywa prawdą, ale wymaga wyraźnego uzasadnienia w operacie.');
  }
  if (lista.length < 3) {
    uwagi.push('Mniej niż trzy cechy to zwykle za mało, żeby opisać rynek. Weryfikatorzy pytają o to najczęściej.');
  }
  if (lista.length > 8) {
    uwagi.push(`${lista.length} cech to dużo — przy tylu cechach wagi pojedynczych schodzą do kilku procent `
      + 'i przestają mieć znaczenie dla wyniku, a każdą trzeba uzasadnić.');
  }
  return {
    suma, ok: uwagi.length === 0,
    waga: Math.abs(suma - 100) > 0.11 || zerowe.length ? 'blad' : (uwagi.length ? 'uwaga' : 'ok'),
    uwagi,
  };
}

/** Wyrównanie wag do 100% z zachowaniem proporcji. */
function cechyWyrownaj(cechy = []) {
  const lista = (cechy || []).map(c => ({ ...c, waga: Number(c.waga) || 0 }));
  const suma = lista.reduce((s, c) => s + c.waga, 0);
  if (!suma) {
    const rowna = Math.round(100 / lista.length * 10) / 10;
    return lista.map((c, i) => ({ ...c, waga: i === 0 ? Math.round((100 - rowna * (lista.length - 1)) * 10) / 10 : rowna }));
  }
  const wagi = lista.map(c => Math.round(c.waga / suma * 1000) / 10);
  const roznica = Math.round((100 - wagi.reduce((s, x) => s + x, 0)) * 10) / 10;
  if (roznica !== 0) {
    const i = wagi.indexOf(Math.max(...wagi));
    wagi[i] = Math.round((wagi[i] + roznica) * 10) / 10;
  }
  return lista.map((c, i) => ({ ...c, waga: wagi[i] }));
}

/* ------------------------------------------- trzy scenariusze (Express) */

const CECHY_SCENARIUSZE = [
  {
    id: 'najgorszy', nazwa: 'Wariant najniższy', ocena: 'Niekorzystna', znak: '▼',
    opis: 'Wszystkie cechy ocenione najniżej w przyjętej skali.',
    kiedy: 'Dolna granica tego, co metoda może dać przy tym zbiorze transakcji i tych wagach.',
  },
  {
    id: 'sredni', nazwa: 'Wariant przeciętny', ocena: 'Przeciętna', znak: '●',
    opis: 'Wszystkie cechy ocenione przeciętnie.',
    kiedy: 'Punkt odniesienia: nieruchomość niczym nie odstaje od rynku porównawczego.',
  },
  {
    id: 'najlepszy', nazwa: 'Wariant najwyższy', ocena: 'Korzystna', znak: '▲',
    opis: 'Wszystkie cechy ocenione najwyżej w przyjętej skali.',
    kiedy: 'Górna granica tego, co metoda może dać przy tym zbiorze transakcji i tych wagach.',
  },
];

/**
 * Trzy komplety ocen dla Expressu.
 *
 * To NIE SĄ trzy wyceny. To są WIDEŁKI METODY: ile wyjdzie, gdy wszystkie
 * cechy ocenić najniżej, przeciętnie i najwyżej. Rzeczoznawca dostaje od
 * razu przedział, w którym na pewno znajdzie się wynik, i widzi, jak
 * czuła jest wycena na oceny — a potem ocenia nieruchomość naprawdę.
 *
 * Operat może zawierać JEDNĄ wartość, z ocenami odpowiadającymi stanowi
 * nieruchomości z oględzin. Program to powtarza i nie pozwala o tym zapomnieć.
 */
function cechyScenariusze(cechy = []) {
  return CECHY_SCENARIUSZE.map(s => ({
    ...s,
    oceny: Object.fromEntries((cechy || []).map(c => [c.id, s.ocena])),
    cechy: (cechy || []).map(c => ({ ...c, rating: s.ocena })),
  }));
}

/** Co powiedzieć o trzech wynikach, gdy już są policzone. */
function cechyOpisWidelek(wyniki = []) {
  const kwoty = wyniki.map(w => Number(w.wartosc) || 0).filter(x => x > 0);
  if (kwoty.length < 2) return '';
  const min = Math.min(...kwoty), max = Math.max(...kwoty);
  const rozpietosc = min > 0 ? Math.round((max / min - 1) * 1000) / 10 : 0;
  return `Przy tych transakcjach i tych wagach metoda daje od ${Math.round(min).toLocaleString('pl-PL')} zł `
    + `do ${Math.round(max).toLocaleString('pl-PL')} zł — rozpiętość ${rozpietosc.toLocaleString('pl-PL')}%. `
    + 'To są widełki METODY, a nie trzy wyceny: operat zawiera jedną wartość, z ocenami odpowiadającymi '
    + 'stanowi nieruchomości stwierdzonemu podczas oględzin.';
}

/** Zdanie do operatu o sposobie ustalenia wag. */
function cechyUzasadnienieWag(metoda, { ile = 0 } = {}) {
  // "przyjeto" rzadzi biernikiem: 1 ceche rynkowa, 2-4 cechy rynkowe, 5+ cech rynkowych.
  const nazwaCech = cechyOdmien(ile,
    'cechę rynkową różnicującą', 'cechy rynkowe różnicujące', 'cech rynkowych różnicujących');
  const wstep = ile
    ? `Dla potrzeb wyceny przyjęto ${ile} ${nazwaCech} ceny na badanym rynku. `
    : 'Dla potrzeb wyceny przyjęto cechy rynkowe różnicujące ceny na badanym rynku. ';
  switch (String(metoda || '')) {
    case 'pairs':
      return wstep + 'Wagi cech ustalono metodą analizy porównawczej par nieruchomości podobnych, '
        + 'różniących się oceną jednej cechy, na podstawie transakcji z badanego zbioru.';
    case 'correlation':
      return wstep + 'Wagi cech ustalono na podstawie analizy statystycznej zbioru transakcji — '
        + 'siły związku między oceną cechy a skorygowaną ceną jednostkową.';
    case 'expert':
      return wstep + 'Wagi cech przyjęto na podstawie oceny eksperckiej rzeczoznawcy, popartej znajomością '
        + 'badanego rynku i analizą zachowań jego uczestników. [DO UZUPEŁNIENIA — wskaż przesłanki oceny]';
    default:
      return wstep + 'Wagi cech przyjął rzeczoznawca. [DO UZUPEŁNIENIA — wskaż, na jakiej podstawie: '
        + 'analiza par, analiza statystyczna, badanie preferencji nabywców czy ocena ekspercka]';
  }
}

const API_CECHY = {
  STOPNIE: CECHY_STOPNIE, ZESTAWY: CECHY_ZESTAWY, SCENARIUSZE: CECHY_SCENARIUSZE,
  rodzaj: cechyRodzaj, zestaw: cechyZestaw, sugeruj: cechySugeruj, skala: cechySkala,
  szukaj: cechySzukaj, sprawdzWagi: cechySprawdzWagi, wyrownaj: cechyWyrownaj,
  srodekWagi: cechySrodekWagi, scenariusze: cechyScenariusze,
  opisWidelek: cechyOpisWidelek, uzasadnienieWag: cechyUzasadnienieWag,
  odmien: cechyOdmien,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_CECHY;
if (typeof window !== 'undefined') window.OperoCechy = API_CECHY;

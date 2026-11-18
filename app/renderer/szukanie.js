'use strict';
/* ============================================================================
   OPERO — SZUKANIE TRANSAKCJI: JEDNO OKNO, KTORE PRZELACZA ETAPY
   ----------------------------------------------------------------------------
   Rzeczoznawca naciska jeden przycisk. Program przechodzi zrodla po kolei
   i w KAZDEJ chwili widac, w ktorym jest, co w nim znalazl i dlaczego z niego
   zeszedl. Nie cztery okna i nie cisza z kreccym sie kolkiem - jedno okno,
   w ktorym kolejne etapy zapalaja sie i gasna.

   KOLEJNOSC I DLACZEGO AKURAT TAKA

     1. Rejestr Cen Nieruchomosci (GUGiK)  - transakcje z aktow notarialnych,
        u zrodla. Jedyne dane, ktore bez zastrzezen wchodza do zbioru
        porownawczego.
     2. Twoja wlasna baza rynku            - transakcje z wyciagow, ktore juz
        kiedys wczytales. Czesto lepsze niz rejestr: maja adres, numer aktu
        i Twoje notatki z ogledzin.
     3. dane.gov.pl - cenniki deweloperow  - CENY OFERTOWE rynku pierwotnego,
        publikowane z mocy art. 19b ust. 1 ustawy deweloperskiej.
     4. Deweloperuch.pl i podobne serwisy  - program OTWIERA je z gotowym
        zapytaniem i przyjmuje wklejone wiersze.

   DLACZEGO PROGRAM NIE POBIERA Z DEWELOPERUCH SAM

   Bo ten serwis sam podaje, skad bierze dane: transakcje z RCN, oferty
   z dane.gov.pl. To sa DOKLADNIE te same zrodla, z ktorych program czerpie
   w krokach 1 i 3 - tyle ze u zrodla, swiezsze i z adresem pliku, ktory da
   sie wskazac w operacie. Pobieranie od posrednika daloby dane starsze,
   bez mozliwosci wskazania zrodla i wbrew regulaminowi cudzego serwisu.

   Co program robi zamiast tego: otwiera serwis z wpisanymi juz kryteriami
   i przyjmuje to, co rzeczoznawca stamtad wklei. Wklejone wiersze rozklada,
   sprawdza tak samo jak wyciag ze starostwa i podpisuje zrodlem „dane
   przepisane przez rzeczoznawce z serwisu X w dniu Y". Taki wpis da sie
   obronic; pobrany po cichu - nie.

   ZASADA, KTORA ZMIENIA WSZYSTKO W UZYCIU

   Jezeli program znajdzie CHOCBY JEDNA transakcje, musi dac ja dodac.
   Wczesniej blokada „potrzebne sa co najmniej dwie" odbierala rzeczoznawcy
   to, co wlasnie znalazl - a on sam wie najlepiej, czy jedna transakcja
   z sasiedniej klatki jest warta wiecej niz piec z drugiego konca miasta.
   Program ma ostrzegac, a nie odmawiac.
   ========================================================================= */

const SZUK_STAN = {
  CZEKA: 'czeka',       // jeszcze nie ruszyl
  TRWA: 'trwa',         // wlasnie w nim jestesmy
  ZNALAZL: 'znalazl',
  PUSTO: 'pusto',       // odpowiedzial, ale nic nie mial
  BLAD: 'blad',
  POMINIETY: 'pominiety',
  // Etap recznyodhaczony przez czlowieka: sprawdzil serwis i albo cos stamtad
  // wzial, albo swiadomie nic. Jedno i drugie to ZAMKNIETY etap, a nie
  // wieczne "sprawdzam...", ktore wyglada jak zawieszony program.
  SPRAWDZONY: 'sprawdzony',
};

/**
 * Etapy. `rodzaj` rozstrzyga, czy to, co stamtad przyjdzie, wolno wstawic
 * do zbioru porownawczego — i tego nie zmienia zadne ustawienie.
 */
const SZUK_ETAPY = [
  {
    id: 'deweloperuch', nr: 1,
    nazwa: 'Deweloperuch.pl',
    skrot: 'Deweloperuch',
    rodzaj: 'przepisane',
    opis: 'Program otwiera serwis z wpisanymi kryteriami i przyjmuje wiersze, które stamtąd wkleisz.',
    gdyPusto: 'Nic stamtąd nie wklejono.',
    automat: false,
    serwis: 'deweloperuch.pl',
    dlaczegoRecznie: 'Serwis bierze transakcje z RCN, a oferty z dane.gov.pl — czyli z tych samych źródeł, '
      + 'które program sprawdza sam, tylko starsze i bez możliwości wskazania pliku w operacie. '
      + 'Dlatego program go otwiera, zamiast podbierać mu bazę: to, co stamtąd weźmiesz, wchodzi do operatu '
      + 'jako dane przepisane przez Ciebie, z datą i nazwą serwisu.',
  },

  {
    id: 'rcn-geoportal', nr: 2,
    nazwa: 'Rejestr Cen Nieruchomości',
    skrot: 'GUGiK',
    rodzaj: 'transakcje',
    opis: 'Ceny z aktów notarialnych, prosto z rejestru prowadzonego przez starostów. Bezpłatnie, bez logowania.',
    gdyPusto: 'Rejestr obejmuje tylko powiaty, które przesłały dane — w 2026 r. około 320 z 380. '
      + 'Pusty wynik nie znaczy, że transakcji nie było.',
    automat: true,
  },
  {
    id: 'wlasna-baza', nr: 3,
    nazwa: 'Twoja własna baza rynku',
    skrot: 'Twoja baza',
    rodzaj: 'transakcje',
    opis: 'Transakcje z wyciągów, które już kiedyś wczytałeś — z adresem, numerem aktu i Twoimi notatkami.',
    gdyPusto: 'W Twojej bazie nie ma jeszcze transakcji pasujących do tych kryteriów.',
    automat: true,
  },
  {
    id: 'dane-gov', nr: 4,
    nazwa: 'dane.gov.pl — cenniki deweloperów',
    skrot: 'dane.gov.pl',
    rodzaj: 'oferty',
    opis: 'Ceny ofertowe rynku pierwotnego, publikowane z mocy art. 19b ust. 1 ustawy deweloperskiej.',
    gdyPusto: 'Żaden deweloper nie opublikował cennika dla tego miejsca. Przy rynku wtórnym cenników po prostu nie ma.',
    automat: true,
  },
  {
    id: 'inne-portale', nr: 5,
    nazwa: 'Inne portale ogłoszeniowe',
    skrot: 'Inne portale',
    rodzaj: 'przepisane',
    opis: 'Ostateczność — gdy rejestr, Twoja baza i Deweloperuch nie dały dość transakcji.',
    gdyPusto: 'Nie korzystałeś z innych portali.',
    automat: false,
    ostatecznosc: true,
    dlaczegoRecznie: 'To są CENY OFERTOWE z ogłoszeń, a nie ceny transakcyjne: różnica między ceną wywoławczą '
      + 'a ceną z aktu bywa kilkunastoprocentowa i zmienia się w czasie. Do zbioru porównawczego wchodzą '
      + 'tylko po korekcie, którą musisz uzasadnić w operacie. Sięgaj po nie, gdy rejestr i własna baza '
      + 'nie dały dość transakcji — i zapisz w operacie, dlaczego było to konieczne.',
  }
];

function szukTekst(v) { return String(v ?? '').trim(); }
function szukLiczba(v) {
  if (v === null || v === undefined || szukTekst(v) === '') return null;
  const n = Number(String(v).replace(/\s| /g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
/** 1 wiersz, 2–4 wiersze, 5 wierszy — a od 12 do 14 znów „wierszy". */
function szukOdmien(n, jeden, dwa, piec) {
  const i = Math.abs(Math.trunc(Number(n) || 0));
  if (i === 1) return jeden;
  const ost = i % 10, dwaOst = i % 100;
  return (ost >= 2 && ost <= 4 && (dwaOst < 12 || dwaOst > 14)) ? dwa : piec;
}

function szukUprosc(t) {
  return String(t || '').toLowerCase().replace(/ł/g, 'l')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Kryteria doboru. Nie sa sztywne: rzeczoznawca ma prawo rozszerzyc obszar
 * albo okres i wziac na siebie uzasadnienie. Program trzyma domysly, ktore
 * wynikaja z metodyki, i mowi, gdy ktos od nich odchodzi.
 */
function szukKryteria({ miejscowosc = '', dzielnica = '', ulica = '', x = null, y = null,
  powierzchnia = 0, pokoje = null, pietro = null, odchylkaPowPct = 30,
  tolPokoi = 1, tolPieter = 2,
  okresMiesiecy = 24, dataWyceny = '', promienM = 1000, prawo = '', zapasPct = 25 } = {}) {
  // Kryteria doboru sa JEDNE dla calego programu — liczy je modul
  // podobienstwa, a tu tylko dokladamy nazwy pol, ktorych uzywa okno.
  const P = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./podobienstwo.js')
    : (typeof window !== 'undefined' ? window.OperoPodobienstwo : null);
  const k = P ? P.kryteria({
    miejscowosc, dzielnica, ulica, x, y,
    powierzchnia, pokoje, pietro, prawo,
    dataWyceny, okresMiesiecy,
    tolPowPct: odchylkaPowPct, tolPokoi, tolPieter,
    promienM, zapasPct,
  }) : {};
  return {
    ...k,
    // Nazwy, ktorych uzywa reszta okna. Zostaja, zeby nie przepisywac
    // calego widoku przy kazdej zmianie w module doboru.
    odchylkaPowPct: k.tolPowPct,
    odchylkaPowZapasPct: Math.min(100, Math.round(k.tolPowPct * (1 + (k.zapasPct || 0) / 100))),
  };
}

/**
 * Kryteria do ZAPYTANIA, czyli te z zapasem. Zrodla odpytujemy szerzej niz
 * trzeba, bo drugie zapytanie kosztuje kolejne sekundy czekania, a odsianie
 * nadmiaru u siebie jest darmowe.
 */
function szukKryteriaZapytania(k) {
  const x = k || {};
  return {
    miejscowosc: x.miejscowosc || '',
    powierzchnia: x.powierzchnia || 0,
    powOd: x.powOdZapas != null ? x.powOdZapas : x.powOd,
    powDo: x.powDoZapas != null ? x.powDoZapas : x.powDo,
    okresMiesiecy: x.okresMiesiecyZapas || x.okresMiesiecy || 24,
    promienM: x.promienMZapas || x.promienM || 1000,
    dataWyceny: x.dataWyceny || '',
    prawo: x.prawo || '',
  };
}

/** Liczba po polsku: przecinek dziesietny, bez ogona zer. */
function szukLiczbaPl(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('pl-PL', { maximumFractionDigits: 2 });
}

function szukOpisKryteriow(k) {
  const czesci = [];
  // Polozenie idzie PIERWSZE, bo to ono tworzy rynek lokalny. Metraz
  // roznicuje ceny dopiero wewnatrz tego rynku.
  if (k.dzielnica) czesci.push(`${k.dzielnica} i sąsiedztwo`);
  else if (k.miejscowosc) czesci.push(k.miejscowosc);
  if (k.punkt) czesci.push(`promień ${k.promienM} m`);
  if (k.powOd != null) czesci.push(`powierzchnia ${szukLiczbaPl(k.powOd)}–${szukLiczbaPl(k.powDo)} m² (±${k.tolPowPct}%)`);
  if (k.pokoje != null) czesci.push(`${k.pokoje} ${szukOdmien(k.pokoje, 'pokój', 'pokoje', 'pokoi')} ±${k.tolPokoi}`);
  if (k.pietro != null) czesci.push(`${k.pietro === 0 ? 'parter' : `${k.pietro}. piętro`} ±${k.tolPieter}`);
  czesci.push(`ostatnie ${k.okresMiesiecy} mies.`);
  const opis = czesci.join(', ');
  // Zapas musi byc widoczny w opisie, bo inaczej rzeczoznawca zobaczy wiersz
  // spoza swoich kryteriow i uzna, ze program zle filtruje.
  return k.zapasPct ? `${opis}; zapas ±${k.zapasPct}% (pytam źródła szerzej)` : opis;
}

function szukMiesiecy(od, do_) {
  const a = Date.parse(od), b = Date.parse(do_);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24 * 30.44));
}

/**
 * Czy pozycja pasuje do kryteriow — i jezeli nie, to dlaczego.
 *
 * Powod jest wazniejszy od samego „nie": rzeczoznawca, ktory widzi
 * „powierzchnia 120 m² poza zakresem 38–70", wie, ze ma rozszerzyc kryterium,
 * a nie ze program nie dziala.
 */
function szukPasuje(pozycja, kryteria, { zZapasem = false } = {}) {
  const p = pozycja || {}, k = kryteria || {};
  const powody = [];
  // Przy sprawdzaniu „z zapasem" bierzemy pas szerszy; gdy go nie ma
  // (stare kryteria bez zapasu), schodzimy do zwyklych granic.
  const powOd = zZapasem && k.powOdZapas != null ? k.powOdZapas : k.powOd;
  const powDo = zZapasem && k.powDoZapas != null ? k.powDoZapas : k.powDo;
  const okres = zZapasem && k.okresMiesiecyZapas ? k.okresMiesiecyZapas : k.okresMiesiecy;
  const pow = szukLiczba(p.powierzchnia);
  if (powOd != null && pow != null && (pow < powOd || pow > powDo)) {
    powody.push(`powierzchnia ${szukLiczbaPl(pow)} m² poza zakresem ${szukLiczbaPl(powOd)}–${szukLiczbaPl(powDo)} m²`);
  }
  if (k.miejscowosc && szukTekst(p.miejscowosc)) {
    const a = szukUprosc(k.miejscowosc), b = szukUprosc(p.miejscowosc);
    if (a !== b && !szukUprosc(`${p.adres || ''}`).includes(a)) powody.push(`inna miejscowość (${p.miejscowosc})`);
  }
  if (k.dataWyceny && szukTekst(p.data)) {
    const mies = szukMiesiecy(p.data, k.dataWyceny);
    // Transakcja PO dacie wyceny nie jest kwestia zapasu, tylko bledem
    // merytorycznym - zadne rozszerzenie kryteriow jej nie usprawiedliwi.
    if (mies != null && mies < 0) powody.push('transakcja po dacie wyceny');
    else if (mies != null && mies > okres) powody.push(`starsza niż ${okres} mies. (${mies} mies.)`);
  }
  return { pasuje: powody.length === 0, powody, powod: powody.join('; ') };
}

/**
 * Czym dokladnie ta pozycja wychodzi poza wpisane kryteria — zdanie, ktore
 * stoi przy wierszu „z zapasu". Rzeczoznawca ma od razu widziec, CO odpuszcza,
 * przyjmujac ten wiersz do zbioru.
 */
function szukOpisZapasu(pozycja, kryteria) {
  const p = pozycja || {}, k = kryteria || {};
  const czesci = [];
  const pow = szukLiczba(p.powierzchnia);
  if (k.powOd != null && pow != null && (pow < k.powOd || pow > k.powDo)) {
    const poza = pow < k.powOd ? k.powOd - pow : pow - k.powDo;
    const pct = k.powierzchnia > 0 ? Math.round(Math.abs(pow - k.powierzchnia) / k.powierzchnia * 100) : 0;
    czesci.push(`powierzchnia ${szukLiczbaPl(pow)} m² — ${szukLiczbaPl(Math.round(poza * 10) / 10)} m² poza zakresem (${pct}% od wzorca)`);
  }
  if (k.dataWyceny && szukTekst(p.data)) {
    const mies = szukMiesiecy(p.data, k.dataWyceny);
    if (mies != null && mies > k.okresMiesiecy) czesci.push(`${mies} mies. przed datą wyceny, a okres to ${k.okresMiesiecy} mies.`);
  }
  return czesci.join('; ');
}

/**
 * Przefiltrowanie listy na TRZY kupki, bo tyle ich naprawde jest:
 *   pasujace  — mieszcza sie w tym, co rzeczoznawca wpisal,
 *   zZapasu   — wpadly dopiero dzieki zapasowi; do zaakceptowania recznie,
 *   niepasujace — poza zapasem, zostaja do obejrzenia z podanym powodem.
 */
/**
 * DUPLIKATY. Rejestr potrafi oddac te sama transakcje dwa razy — raz jako
 * wpis powiatu, raz jako pozycje zbiorcza — a wklejenie z serwisu dokłada
 * trzeci egzemplarz. W zbiorze porownawczym ta sama transakcja policzona
 * dwa razy ZAWYZA swoja wage w sredniej i nikt tego potem nie wylapie.
 *
 * Za te sama uznajemy pozycje o tej samej dacie, cenie i powierzchni.
 * Adres pomijamy celowo: rejestr podaje raz ulice, raz „Lokale — 1426",
 * wiec roznica w adresie nie dowodzi, ze to inna nieruchomosc.
 */
function szukKlucz(p) {
  const x = p || {};
  const liczba = (v) => { const n = szukLiczba(v); return n == null ? '' : Math.round(n * 100) / 100; };
  return [szukTekst(x.data), liczba(x.cena), liczba(x.powierzchnia)].join('|');
}
function szukOdsiejDuplikaty(pozycje = []) {
  const widziane = new Map();
  const unikalne = [], duplikaty = [];
  for (const p of pozycje) {
    const k = szukKlucz(p);
    // Duplikat uznajemy TYLKO wtedy, gdy mamy czym go dowiesc: date, cene
    // i powierzchnie naraz. Bez ceny dwie rozne transakcje o tej samej
    // powierzchni z tego samego dnia wygladaja identycznie, a nie sa nia.
    if (szukLiczba(p && p.cena) == null || !szukTekst(p && p.data)) { unikalne.push(p); continue; }
    if (widziane.has(k)) { duplikaty.push({ ...p, duplikatOf: widziane.get(k) }); continue; }
    widziane.set(k, p);
    unikalne.push(p);
  }
  return { unikalne, duplikaty, usunieto: duplikaty.length };
}

/** Jak daleko pozycja odstaje od wzorca — liczy modul doboru. */
function szukOdleglosc(pozycja, kryteria) {
  const P = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./podobienstwo.js')
    : (typeof window !== 'undefined' ? window.OperoPodobienstwo : null);
  if (!P) return 0;
  // Im wyzsza ocena podobienstwa, tym MNIEJSZA odleglosc od wzorca.
  return Math.round((100 - P.ocen(pozycja, kryteria).punkty) * 10) / 10;
}

/** Od najlepiej dopasowanej. Przy rownej ocenie wyzej stoi swiezsza. */
function szukPoDopasowaniu(pozycje = [], kryteria) {
  return pozycje.slice().sort((a, b) => {
    const r = szukOdleglosc(a, kryteria) - szukOdleglosc(b, kryteria);
    if (r !== 0) return r;
    return String(b.data || '').localeCompare(String(a.data || ''));
  });
}

function szukDopasuj(pozycje = [], kryteria) {
  const P = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./podobienstwo.js')
    : (typeof window !== 'undefined' ? window.OperoPodobienstwo : null);
  const odsiane = szukOdsiejDuplikaty(pozycje);
  if (!P) {
    // Bez modulu doboru nie udajemy, ze cos dobralismy.
    return { pasujace: [], zZapasu: [], niepasujace: odsiane.unikalne, duplikaty: odsiane.duplikaty,
      usunietoDuplikatow: odsiane.usunieto, razem: (pozycje || []).length, doPokazania: [] };
  }
  const w = P.dobierz(odsiane.unikalne, kryteria);
  // `zZapasu` to pozycje do DECYZJI czlowieka — program ich nie zaznacza.
  const zZapasu = w.doDecyzji.map(x => ({
    ...x, zZapasu: true,
    opisZapasu: x.dobor.zdanie,
    powodNiedopasowania: x.dobor.zdanie,
  }));
  const niepasujace = w.odrzucone.map(x => ({ ...x, powodNiedopasowania: x.dobor.zdanie }));
  return {
    pasujace: w.doZbioru, zZapasu, niepasujace,
    duplikaty: odsiane.duplikaty, usunietoDuplikatow: odsiane.usunieto,
    razem: (pozycje || []).length,
    doPokazania: w.doZbioru.concat(zZapasu),
  };
}

/** Zdanie o tym, co program dobral — jedno dla calego programu. */
function szukOpisDopasowania(d, kryteria) {
  const P = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./podobienstwo.js')
    : (typeof window !== 'undefined' ? window.OperoPodobienstwo : null);
  if (!d || !P) return '';
  return P.opisDoboru({ doZbioru: d.pasujace, doDecyzji: d.zZapasu, odrzucone: d.niepasujace }, kryteria);
}

/* ------------------------------------------------------------- przebieg */

function szukNowy(kryteria) {
  return {
    kryteria: kryteria || szukKryteria({}),
    etapy: SZUK_ETAPY.map(e => ({ ...e, stan: SZUK_STAN.CZEKA, ile: 0, powod: '', zrodlo: '' })),
    biezacy: null,
    znalezione: [],
    zaczeto: new Date().toISOString(),
    skonczono: '',
  };
}

function szukEtap(przebieg, id) { return (przebieg?.etapy || []).find(e => e.id === id) || null; }

function szukZacznij(przebieg, id) {
  const e = szukEtap(przebieg, id);
  if (!e) return null;
  e.stan = SZUK_STAN.TRWA;
  przebieg.biezacy = id;
  return e;
}

/**
 * Zamkniecie etapu. `ile` to liczba pozycji, ktore PRZESZLY kryteria —
 * bo tylko one cokolwiek znacza dla rzeczoznawcy.
 */
function szukZakoncz(przebieg, id, { ile = 0, powod = '', zrodlo = '', blad = false, pozycje = [] } = {}) {
  const e = szukEtap(przebieg, id);
  if (!e) return null;
  e.ile = Math.max(0, Number(ile) || 0);
  e.powod = szukTekst(powod);
  e.zrodlo = szukTekst(zrodlo);
  e.stan = blad ? SZUK_STAN.BLAD : (e.ile > 0 ? SZUK_STAN.ZNALAZL : SZUK_STAN.PUSTO);
  // Etap zamkniety drugi raz ZASTEPUJE swoj poprzedni wynik, a nie dokłada
  // sie do niego. Inaczej poprawione wklejenie podwaja wiersze, a czlowiek
  // dostaje kazda transakcje dwa razy i nie wie, ktora jest ta prawdziwa.
  przebieg.znalezione = (przebieg.znalezione || []).filter(p => p.zEtapu !== id);
  for (const p of pozycje) przebieg.znalezione.push({ ...p, zEtapu: id, rodzajZrodla: e.rodzaj });
  if (przebieg.biezacy === id) przebieg.biezacy = null;
  return e;
}

function szukPomin(przebieg, id, powod = '') {
  const e = szukEtap(przebieg, id);
  if (!e) return null;
  e.stan = SZUK_STAN.POMINIETY;
  e.powod = szukTekst(powod);
  return e;
}

function szukKoniec(przebieg) {
  przebieg.skonczono = new Date().toISOString();
  przebieg.biezacy = null;
  return przebieg;
}

/** Ile transakcji (nie ofert) zebrano — tylko one wchodzą do zbioru. */
function szukTransakcje(przebieg) {
  return (przebieg?.znalezione || []).filter(p => p.rodzajZrodla === 'transakcje' || p.rodzajZrodla === 'przepisane');
}
function szukOferty(przebieg) {
  return (przebieg?.znalezione || []).filter(p => p.rodzajZrodla === 'oferty');
}

/**
 * Zdanie podsumowujace. Musi odpowiedziec na trzy pytania naraz: ile mam,
 * skad to jest i co moge z tym zrobic.
 *
 * Nie ma tu progu „co najmniej trzy". Jedna transakcja to malo, ale to
 * rzeczoznawca rozstrzyga, czy jedna z sasiedniej klatki jest warta wiecej
 * niz piec z drugiego konca miasta. Program mowi, co ma, i ostrzega.
 */
function szukPodsumowanie(przebieg) {
  const t = szukTransakcje(przebieg), o = szukOferty(przebieg);
  const zrodla = (przebieg?.etapy || []).filter(e => e.stan === SZUK_STAN.ZNALAZL);
  const puste = (przebieg?.etapy || []).filter(e => e.stan === SZUK_STAN.PUSTO);
  const bledy = (przebieg?.etapy || []).filter(e => e.stan === SZUK_STAN.BLAD);

  if (!t.length && !o.length) {
    return {
      transakcji: 0, ofert: 0, zrodel: 0, mozeDodac: false,
      waga: 'ostrzezenie',
      tekst: 'Nie znalazłem nic w żadnym ze źródeł. To nie znaczy, że transakcji nie było: '
        + 'Rejestr Cen Nieruchomości obejmuje tylko powiaty, które przesłały dane. '
        + 'Zostaje wyciąg ze starostwa albo wpisanie transakcji ręcznie — przy każdej pozycji zapisz źródło i datę.',
      bledow: bledy.length,
    };
  }
  const czesci = [];
  if (t.length) czesci.push(`${t.length} ${szukOdmien(t.length, 'transakcję', 'transakcje', 'transakcji')}`);
  if (o.length) czesci.push(`${o.length} ${szukOdmien(o.length, 'ofertę', 'oferty', 'ofert')} (nie do zbioru)`);
  const ostrzezenie = t.length === 1
    ? ' Jedna transakcja to mało na wycenę porównawczą — ale to Ty rozstrzygasz, czy ta jedna z sąsiedniej klatki '
      + 'jest warta więcej niż pięć z drugiego końca miasta. Możesz ją dodać i dobrać resztę sam.'
    : t.length === 2
      ? ' Dwie transakcje to minimum, przy którym da się cokolwiek porównać. Rozważ rozszerzenie obszaru albo okresu.'
      : '';
  // Zapas musi byc policzony TU, a nie tylko w pasku u gory: stopka okna jest
  // tym, na co rzeczoznawca patrzy, zanim nacisnie "Dodaj do operatu".
  const zZapasu = (przebieg?.znalezione || []).filter(x => x.zZapasu).length;
  const zdanieZapasu = zZapasu
    ? ` ${zZapasu} ${szukOdmien(zZapasu, 'pozycja wychodzi', 'pozycje wychodzą', 'pozycji wychodzi')} poza Twoje kryteria `
      + `i ${szukOdmien(zZapasu, 'czeka', 'czekają', 'czeka')} na Twoją decyzję — program ${szukOdmien(zZapasu, 'jej nie zaznaczył', 'ich nie zaznaczył', 'ich nie zaznaczył')}.`
    : '';
  return {
    transakcji: t.length, ofert: o.length, zrodel: zrodla.length, zZapasu,
    mozeDodac: t.length > 0,
    waga: t.length >= 3 ? 'sukces' : (t.length ? 'ostrzezenie' : 'info'),
    tekst: `Znalazłem ${czesci.join(' i ')} w ${zrodla.length} ${zrodla.length === 1 ? 'źródle' : 'źródłach'}.`
      + (puste.length ? ` Pustych źródeł: ${puste.length}.` : '')
      + (bledy.length ? ` Źródeł, które nie odpowiedziały: ${bledy.length}.` : '')
      + zdanieZapasu
      + ostrzezenie,
    bledow: bledy.length,
  };
}

/** Zdanie o jednym etapie — to, co stoi przy nim w oknie. */
function szukOpisEtapu(etap) {
  if (!etap) return '';
  switch (etap.stan) {
    case SZUK_STAN.CZEKA: return 'czeka na swoją kolej';
    case SZUK_STAN.TRWA: return 'sprawdzam…';
    case SZUK_STAN.ZNALAZL: return `znalazłem ${etap.ile} ${szukOdmien(etap.ile, 'pozycję', 'pozycje', 'pozycji')}`;
    case SZUK_STAN.PUSTO: return etap.powod || etap.gdyPusto || 'nic nie znalazłem';
    case SZUK_STAN.BLAD: return etap.powod || 'źródło nie odpowiedziało';
    case SZUK_STAN.POMINIETY: return etap.powod || 'pominięty';
    case SZUK_STAN.SPRAWDZONY: return etap.powod || 'sprawdzony — nic stamtąd nie brałeś';
    default: return '';
  }
}

/* ------------------------------------------ wklejenie z cudzego serwisu */

/**
 * Rozklad wklejonego tekstu na transakcje.
 *
 * Czlowiek zaznacza tabelke w serwisie i wkleja. Przychodzi to jako wiersze
 * rozdzielone tabulatorem albo kilkoma spacjami, w roznej kolejnosci kolumn.
 * Rozpoznajemy po KSZTALCIE wartosci, nie po pozycji: data wyglada jak data,
 * cena jest najwieksza liczba, powierzchnia ma jedno-trzy cyfry przed
 * przecinkiem, a reszta to adres.
 *
 * Zgadujemy tylko to, co da sie rozpoznac bez watpliwosci. Wiersz, w ktorym
 * czegos brakuje, wraca z powodem — zeby czlowiek poprawil go sam, zamiast
 * dostac transakcje z podstawiona liczba.
 */
function szukZWklejenia(tekst, { zrodlo = '', dataPrzepisania = '' } = {}) {
  const linie = String(tekst || '').replace(/\r\n?/g, '\n').split('\n')
    .map(x => x.trim()).filter(Boolean);
  const wiersze = [], odrzucone = [];
  const dzien = szukTekst(dataPrzepisania) || new Date().toISOString().slice(0, 10);

  for (const linia of linie) {
    const pola = linia.includes('\t') ? linia.split('\t') : linia.split(/\s{2,}|\s*\|\s*|\s*;\s*/);
    const czyste = pola.map(x => x.trim()).filter(Boolean);
    if (czyste.length < 2) continue;

    let data = '', cena = null, powierzchnia = null, cenaM2 = null;
    const reszta = [];
    for (const p of czyste) {
      const dm = /(\d{4})-(\d{2})-(\d{2})/.exec(p) || null;
      const dpl = /(\d{2})[.\-/](\d{2})[.\-/](\d{4})/.exec(p);
      if (!data && dm) { data = `${dm[1]}-${dm[2]}-${dm[3]}`; continue; }
      if (!data && dpl) { data = `${dpl[3]}-${dpl[2]}-${dpl[1]}`; continue; }
      // Jednostka bywa sklejona: „650 000 zl", „11 971 zl/m2", „54,30 m2".
      // Rozpoznajemy ja osobno, bo to wlasnie ona mowi, czym jest ta liczba:
      // bez tego „9500 zl/m2" wygladaloby jak cena calego lokalu, a lokal
      // za 9,5 tysiaca w zbiorze porownawczym przesuwa cala wycene.
      const zaMetr = /(z[łl]|pln)\s*\/\s*(m²|m2|mkw)/i.test(p);
      const metry = !zaMetr && /(m²|m2|mkw)/i.test(p);
      const czysta = p.replace(/[\s\u00a0]/g, '').replace(/(z[łl]|pln|m²|m2|mkw|\/)/gi, '');
      const n = szukLiczba(czysta);
      if (n != null && /^[\d\s\u00a0.,]+\s*((z[łl]|pln)\s*(\/\s*(m²|m2|mkw))?|(m²|m2|mkw))?$/i.test(p.trim())) {
        if (zaMetr) { if (cenaM2 == null) { cenaM2 = n; continue; } }
        else if (metry) { if (powierzchnia == null) { powierzchnia = n; continue; } }
        if (n > 5 && n < 400 && powierzchnia == null && n < (cena ?? Infinity) / 100) { powierzchnia = n; continue; }
        if (n >= 10000) { if (cena == null || n > cena) { if (cena != null) cenaM2 = Math.min(cena, n); cena = n; continue; } }
        if (n >= 1000 && n < 100000) { if (cenaM2 == null) { cenaM2 = n; continue; } }
        if (powierzchnia == null && n > 5 && n < 400) { powierzchnia = n; continue; }
      }
      reszta.push(p);
    }
    if (powierzchnia == null && cena != null && cenaM2 != null && cenaM2 > 0) {
      powierzchnia = Math.round(cena / cenaM2 * 100) / 100;
    }
    if (cena == null && cenaM2 != null && powierzchnia != null) {
      cena = Math.round(cenaM2 * powierzchnia * 100) / 100;
    }
    const adres = reszta.join(', ');
    const braki = [];
    if (!data) braki.push('data');
    if (cena == null) braki.push('cena');
    if (!(powierzchnia > 0)) braki.push('powierzchnia');
    if (braki.length) {
      odrzucone.push({ linia, powod: `nie rozpoznałem: ${braki.join(', ')}` });
      continue;
    }
    wiersze.push({
      zrodloWiersz: wiersze.length + 1,
      adres: adres || '[adres do uzupełnienia]',
      miejscowosc: '',
      data, cena, powierzchnia,
      jednostkowa: cenaM2 != null ? cenaM2 : Math.round(cena / powierzchnia * 100) / 100,
      prawo: '', rodzaj: 'sprzedaż', akt: '', kw: '',
      przepisane: true,
      zrodloNazwa: szukTekst(zrodlo),
      uwagi: [`Dane przepisane przez rzeczoznawcę z serwisu ${szukTekst(zrodlo) || '[nazwa serwisu]'} w dniu ${dzien}.`],
      uwagiZrodla: `Dane przepisane przez rzeczoznawcę z serwisu ${szukTekst(zrodlo) || '[nazwa serwisu]'} w dniu ${dzien}. `
        + 'Nie pochodzą z rejestru u źródła — przed użyciem w operacie sprawdź je w akcie albo w wyciągu.',
    });
  }
  return {
    ok: wiersze.length > 0,
    wiersze, odrzucone,
    komunikat: wiersze.length
      ? `Rozpoznałem ${wiersze.length} ${szukOdmien(wiersze.length, 'wiersz', 'wiersze', 'wierszy')}`
        + `${odrzucone.length ? `, a ${odrzucone.length} nie — przy każdym z nich jest powód` : ''}.`
      : 'Nie rozpoznałem ani jednego wiersza. Zaznacz w serwisie tabelę razem z nagłówkami i wklej jeszcze raz.',
  };
}

/** Zdanie do operatu o danych przepisanych z cudzego serwisu. */
function szukOpisPrzepisanych(zrodlo, data = new Date()) {
  const d = new Date(data).toISOString().slice(0, 10);
  return `Dane przepisane przez rzeczoznawcę z serwisu ${szukTekst(zrodlo) || '[nazwa serwisu]'}, stan na ${d}. `
    + 'Serwis podaje, że transakcje pochodzą z Rejestru Cen Nieruchomości, a ceny ofertowe z dane.gov.pl. '
    + 'Dane wtórne — przed oparciem na nich wyceny należy je zweryfikować w wyciągu z RCiWN albo w akcie notarialnym.';
}

const API_SZUK = {
  STAN: SZUK_STAN, ETAPY: SZUK_ETAPY,
  kryteria: szukKryteria, opisKryteriow: szukOpisKryteriow,
  pasuje: szukPasuje, dopasuj: szukDopasuj,
  odsiejDuplikaty: szukOdsiejDuplikaty, odleglosc: szukOdleglosc,
  poDopasowaniu: szukPoDopasowaniu, klucz: szukKlucz,
  kryteriaZapytania: szukKryteriaZapytania,
  opisZapasu: szukOpisZapasu, opisDopasowania: szukOpisDopasowania,
  nowy: szukNowy, etap: szukEtap, zacznij: szukZacznij, zakoncz: szukZakoncz,
  pomin: szukPomin, koniec: szukKoniec,
  transakcje: szukTransakcje, oferty: szukOferty,
  podsumowanie: szukPodsumowanie, opisEtapu: szukOpisEtapu,
  zWklejenia: szukZWklejenia, opisPrzepisanych: szukOpisPrzepisanych,
  liczba: szukLiczba, liczbaPl: szukLiczbaPl, uprosc: szukUprosc, odmien: szukOdmien,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_SZUK;
if (typeof window !== 'undefined') window.OperoSzukanie = API_SZUK;

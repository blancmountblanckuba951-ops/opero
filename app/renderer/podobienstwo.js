'use strict';
/* ============================================================================
   OPERO — DOBOR NIERUCHOMOSCI PODOBNYCH
   ----------------------------------------------------------------------------
   Jedno miejsce w calym programie, ktore rozstrzyga, czy transakcja nadaje sie
   do porownania z wycenianym lokalem. Uzywa go okno szukania, wlasna baza
   rynku, import z rejestru i Express — zeby wszedzie znaczylo to samo.

   CO TO ZNACZY "PODOBNA"

   Nie "o zblizonym metrazu". Rzeczoznawca dobiera nieruchomosci podobne
   z TEGO SAMEGO RYNKU LOKALNEGO: mieszkanie w Osowej porownuje sie
   z mieszkaniami w Osowej i w dzielnicach sasiednich, a nie z Sopotem ani
   ze Stogami — nawet jesli metraz zgadza sie co do decymetra. Polozenie jest
   najwazniejsze, bo to ono tworzy rynek; metraz, liczba pokoi i pietro
   roznicuja ceny WEWNATRZ tego rynku.

   Dlatego punkty rozlozone sa tak:

     POLOZENIE          40   ta sama ulica / odleglosc / ta sama dzielnica
     POWIERZCHNIA       25   roznica w procentach wzorca
     LICZBA POKOI       10   przy tym samym metrazu dwa pokoje to inny towar
     PIETRO             10   parter i ostatnie pietro maja wlasne ceny
     CZAS               15   swiezsza transakcja lepiej opisuje dzisiejszy rynek

   PROGI, A NIE WIDELKI

     wzorcowa   >= 75 pkt   wchodzi do operatu od razu
     dobra      >= 55 pkt   wchodzi do operatu od razu
     z zapasu   >= 35 pkt   iada do akceptacji, z podanym powodem
     odrzucona  < 35 pkt albo zlamany warunek twardy

   WARUNKI TWARDE — zadne punkty ich nie przegłosuja:
     - transakcja PO dacie wyceny,
     - inna miejscowosc (chyba ze rzeczoznawca sam wpisal szerszy obszar),
     - inne prawo do nieruchomosci (wlasnosc vs spoldzielcze),
     - darowizna, zamiana, licytacja — to nie sa ceny rynkowe.

   CZEGO PROGRAM NIE ROBI

   Nie zgaduje brakujacych danych. Rejestr czesto nie podaje liczby izb ani
   kondygnacji; wtedy ta skladowa dostaje polowe punktow i program pisze przy
   wierszu "liczba pokoi nieznana" — zeby rzeczoznawca wiedzial, czego nie
   sprawdzil, zamiast wierzyc w dopasowanie, ktorego nie bylo.
   ========================================================================= */

const POD_WAGI = { polozenie: 40, powierzchnia: 25, pokoje: 10, pietro: 10, czas: 15 };
const POD_PROGI = { wzorcowa: 75, dobra: 55, zapas: 35 };

/** Rodzaje transakcji, ktore nie sa cena rynkowa i nie wchodza do zbioru. */
const POD_NIERYNKOWE = /darowizn|zamian|licytac|przetarg|egzekucyj|komornicz|wywłaszcz|aport|nieodpłatn|dział\s*spadku|zniesieni|dożywoc/i;

function podTekst(v) { return String(v ?? '').trim(); }
function podLiczba(v) {
  if (v === null || v === undefined || podTekst(v) === '') return null;
  const n = Number(String(v).replace(/\s| /g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function podUprosc(t) {
  return String(t || '').toLowerCase().replace(/ł/g, 'l')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
function podOdmien(n, jeden, dwa, piec) {
  const i = Math.abs(Math.trunc(Number(n) || 0));
  if (i === 1) return jeden;
  const ost = i % 10, dwaOst = i % 100;
  return (ost >= 2 && ost <= 4 && (dwaOst < 12 || dwaOst > 14)) ? dwa : piec;
}
function podMiesiecy(od, do_) {
  const a = Date.parse(od), b = Date.parse(do_);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / (1000 * 60 * 60 * 24 * 30.44));
}

/**
 * Odleglosc w metrach miedzy dwoma punktami w ukladzie PUWG 1992.
 * To uklad metryczny, wiec zwykly Pitagoras daje metry — bez przeliczania
 * stopni i bez bledu rosnacego z szerokoscia geograficzna.
 */
function podOdleglosc(a, b) {
  const ax = podLiczba(a && a.x), ay = podLiczba(a && a.y);
  const bx = podLiczba(b && b.x), by = podLiczba(b && b.y);
  if (ax == null || ay == null || bx == null || by == null) return null;
  return Math.round(Math.hypot(ax - bx, ay - by));
}

/** Prawo do nieruchomosci sprowadzone do dwoch rodzajow, ktore sie nie mieszaja. */
function podPrawo(v) {
  const t = podUprosc(v);
  if (!t) return '';
  if (/spoldziel/.test(t)) return 'spoldzielcze';
  if (/uzytkowanie wieczyste|wieczyst/.test(t)) return 'wieczyste';
  if (/wlasnosc|odrebna/.test(t)) return 'wlasnosc';
  return '';
}

/** Czy to ta sama ulica — po rdzeniu nazwy, zeby "Chrzanowskiego" trafilo w "Bernarda Chrzanowskiego". */
function podTaSamaUlica(a, b) {
  const x = podUprosc(a), y = podUprosc(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const slowa = (t) => t.split(' ').filter(w => w.length >= 5);
  const sx = slowa(x), sy = slowa(y);
  if (!sx.length || !sy.length) return false;
  return sx.some(w => sy.includes(w));
}

/**
 * Czy dzielnica transakcji zgadza sie z dzielnica wycenianego lokalu.
 *
 * Zwraca `true`, `false` albo `null` — i to `null` jest tu najwazniejsze.
 * Rejestr Cen prawie nigdy nie podaje dzielnicy: adres brzmi "ul. Barniewicka
 * 12, Gdansk" i nie ma w nim slowa "Osowa", chociaz Barniewicka lezy
 * w Osowej. Gdyby brak nazwy znaczyl "inna dzielnica", program odrzucalby
 * sasiadow zza rogu i zostawialby rzeczoznawce bez zbioru.
 *
 * Dlatego: `false` tylko wtedy, gdy pozycja MA wpisana dzielnice i jest ona
 * inna. Sam adres bez nazwy dzielnicy to "nie wiem" — a wtedy rozstrzyga
 * odleglosc, ktora jest dowodem, a nie etykieta.
 */
function podTaSamaDzielnica(pozycja, kryteria) {
  const d = podUprosc(kryteria && kryteria.dzielnica);
  if (!d) return null;
  const p = pozycja || {};
  const wlasna = podUprosc(p.dzielnica);
  if (wlasna) return wlasna.includes(d) || d.includes(wlasna);
  const gdzie = podUprosc(`${p.adres || ''} ${p.miejscowosc || ''}`);
  if (gdzie && gdzie.includes(d)) return true;
  return null;
}

/* ------------------------------------------------------------- kryteria */

/**
 * Kryteria doboru. Wszystko, czego program potrzebuje, zeby ocenic
 * podobienstwo — plus tolerancje, ktore rzeczoznawca moze zmienic.
 */
function podKryteria({
  miejscowosc = '', dzielnica = '', ulica = '', x = null, y = null,
  powierzchnia = 0, pokoje = null, pietro = null, prawo = '',
  dataWyceny = '', okresMiesiecy = 24,
  tolPowPct = 20, tolPokoi = 1, tolPieter = 2,
  promienM = 1500, zapasPct = 25,
} = {}) {
  const albo = (v, d) => { const n = podLiczba(v); return n == null ? d : n; };
  const pow = albo(powierzchnia, 0) || 0;
  // Ponizej 5% odchylki zbior porownawczy przestaje istniec - metr w metr
  // trafiaja sie lokale w tym samym bloku i nic poza nim.
  const tol = Math.max(5, Math.min(100, albo(tolPowPct, 20)));
  const zapas = Math.max(0, Math.min(200, albo(zapasPct, 25)));
  const promien = Math.max(100, albo(promienM, 1500));
  const okres = Math.max(1, albo(okresMiesiecy, 24));
  const mn = 1 + zapas / 100;
  return {
    miejscowosc: podTekst(miejscowosc),
    dzielnica: podTekst(dzielnica),
    ulica: podTekst(ulica),
    punkt: (podLiczba(x) != null && podLiczba(y) != null) ? { x: podLiczba(x), y: podLiczba(y) } : null,
    powierzchnia: pow,
    pokoje: podLiczba(pokoje),
    pietro: podLiczba(pietro),
    prawo: podTekst(prawo),
    dataWyceny: podTekst(dataWyceny),
    okresMiesiecy: okres,
    tolPowPct: tol,
    tolPokoi: Math.max(0, albo(tolPokoi, 1)),
    tolPieter: Math.max(0, albo(tolPieter, 2)),
    promienM: promien,
    zapasPct: zapas,
    // Pas z zapasem — o tyle szerzej PYTAMY zrodla, zeby nie wracac z pustymi rekami.
    powOd: pow > 0 ? Math.round(pow * (1 - tol / 100) * 100) / 100 : null,
    powDo: pow > 0 ? Math.round(pow * (1 + tol / 100) * 100) / 100 : null,
    powOdZapas: pow > 0 ? Math.round(pow * (1 - tol * mn / 100) * 100) / 100 : null,
    powDoZapas: pow > 0 ? Math.round(pow * (1 + tol * mn / 100) * 100) / 100 : null,
    promienMZapas: Math.round(promien * mn),
    okresMiesiecyZapas: Math.round(okres * mn),
  };
}

/* --------------------------------------------------------- warunki twarde */

function podWarunkiTwarde(pozycja, k) {
  const p = pozycja || {}, powody = [];

  if (k.dataWyceny && podTekst(p.data)) {
    const mies = podMiesiecy(p.data, k.dataWyceny);
    if (mies != null && mies < 0) powody.push('transakcja zawarta PO dacie wyceny');
  }
  if (POD_NIERYNKOWE.test(podTekst(p.rodzaj))) {
    powody.push(`${p.rodzaj} — to nie jest cena rynkowa`);
  }
  if (k.miejscowosc && podTekst(p.miejscowosc)) {
    const a = podUprosc(k.miejscowosc), b = podUprosc(p.miejscowosc);
    if (a !== b && !podUprosc(p.adres || '').includes(a)) powody.push(`inna miejscowość (${p.miejscowosc})`);
  }
  const prawoK = podPrawo(k.prawo), prawoP = podPrawo(p.prawo);
  if (prawoK && prawoP && prawoK !== prawoP) {
    powody.push(`inne prawo do nieruchomości (${p.prawo}) — ceny tych praw nie są porównywalne wprost`);
  }
  const pow = podLiczba(p.powierzchnia);
  if (k.powOdZapas != null && pow != null && (pow < k.powOdZapas || pow > k.powDoZapas)) {
    powody.push(`powierzchnia ${pow} m² poza zakresem nawet z zapasem (${k.powOdZapas}–${k.powDoZapas} m²)`);
  }
  if (k.dataWyceny && podTekst(p.data)) {
    const mies = podMiesiecy(p.data, k.dataWyceny);
    if (mies != null && mies > k.okresMiesiecyZapas) {
      powody.push(`starsza niż ${k.okresMiesiecyZapas} mies. (${mies} mies.)`);
    }
  }
  const d = podOdleglosc(k.punkt, p);
  if (d != null && d > k.promienMZapas) {
    powody.push(`${(d / 1000).toFixed(1).replace('.', ',')} km od wycenianego lokalu — poza obszarem nawet z zapasem`);
  }
  return powody;
}

/* ------------------------------------------------------------- skladowe */

/**
 * Krzywa oceny jednej skladowej.
 *
 * Pelnia punktow przy zerowej roznicy, POLOWA dokladnie na granicy, ktora
 * wpisal rzeczoznawca, zero dopiero na granicy z zapasem.
 *
 * Tak trzeba, bo granica kryterium nie jest przepascia. Lokal wiekszy o 21%
 * przy tolerancji 20% nie jest „niepodobny" — jest o wlos za granica i ma
 * trafic do decyzji czlowieka z sensowna ocena, a nie wyleciec ze zbioru
 * z zerem punktow tylko dlatego, ze minal prog o jeden punkt procentowy.
 */
function podKrzywa(wartosc, granica, granicaZapasu) {
  const w = Math.max(0, Number(wartosc) || 0);
  const g = Math.max(1e-9, Number(granica) || 0);
  const gz = Math.max(g, Number(granicaZapasu) || g);
  if (w <= g) return 1 - 0.5 * (w / g);
  if (gz <= g) return 0;
  return 0.5 * Math.max(0, 1 - (w - g) / (gz - g));
}

function podPunktyPolozenia(p, k) {
  const maks = POD_WAGI.polozenie;
  const d = podOdleglosc(k.punkt, p);
  const taUlica = podTaSamaUlica(k.ulica, p.ulica || p.adres);
  const taDzielnica = podTaSamaDzielnica(p, k);

  // Odleglosc jest dowodem, nazwa dzielnicy tylko etykieta. Gdy mamy punkt,
  // liczymy metry; nazwy uzywamy do zdania, ktore czlowiek przeczyta.
  if (d != null) {
    // 0–300 m to pelnia punktow: to jest to samo osiedle, czesto ten sam kwartal.
    const udzial = d <= 300 ? 1
      : podKrzywa(d - 300, Math.max(1, k.promienM - 300), Math.max(1, k.promienMZapas - 300));
    let pkt = Math.round(maks * udzial);
    if (taUlica) pkt = Math.min(maks, pkt + 4);
    const km = d >= 1000 ? `${(d / 1000).toFixed(1).replace('.', ',')} km` : `${d} m`;
    const opis = taUlica ? `ta sama ulica, ${km} od wycenianego lokalu`
      : taDzielnica === true ? `ta sama dzielnica (${k.dzielnica}), ${km}`
        : taDzielnica === false ? `inna dzielnica, ${km} od wycenianego lokalu`
          : `${km} od wycenianego lokalu`;
    return { punkty: pkt, maks, opis, znane: true, odlegloscM: d };
  }

  // Bez wspolrzednych zostaje nazwa. Mowimy wprost, ze to slabszy dowod.
  if (taUlica) return { punkty: Math.round(maks * 0.9), maks, opis: `ta sama ulica (${p.ulica || k.ulica})`, znane: true, odlegloscM: null };
  if (taDzielnica === true) return { punkty: Math.round(maks * 0.8), maks, opis: `ta sama dzielnica (${k.dzielnica})`, znane: true, odlegloscM: null };
  if (taDzielnica === false) return { punkty: Math.round(maks * 0.35), maks, opis: 'inna dzielnica tego miasta', znane: true, odlegloscM: null };
  return { punkty: 0, maks, opis: 'rejestr nie podał położenia — sprawdź sam, czy to ten sam rynek lokalny', znane: false, odlegloscM: null };
}

function podPunktyPowierzchni(p, k) {
  const maks = POD_WAGI.powierzchnia;
  const pow = podLiczba(p.powierzchnia);
  if (!(k.powierzchnia > 0) || pow == null) {
    return { punkty: 0, maks, opis: 'powierzchnia nieznana — nie sprawdzone', znane: false };
  }
  const roznicaPct = Math.abs(pow - k.powierzchnia) / k.powierzchnia * 100;
  const udzial = podKrzywa(roznicaPct, k.tolPowPct, k.tolPowPct * (1 + (k.zapasPct || 0) / 100));
  const znak = pow > k.powierzchnia ? '+' : pow < k.powierzchnia ? '−' : '';
  return {
    punkty: Math.round(maks * udzial), maks, znane: true, roznicaPct: Math.round(roznicaPct),
    opis: roznicaPct < 0.5 ? `${pow} m² — tyle samo` : `${pow} m² (${znak}${Math.round(roznicaPct)}%)`,
  };
}

function podPunktyPokoi(p, k) {
  const maks = POD_WAGI.pokoje;
  const ile = podLiczba(p.pokoje);
  if (k.pokoje == null || ile == null) {
    return { punkty: 0, maks, znane: false,
      opis: ile == null ? 'liczba pokoi nieznana — nie sprawdzone' : `${ile} ${podOdmien(ile, 'pokój', 'pokoje', 'pokoi')}` };
  }
  const roznica = Math.abs(ile - k.pokoje);
  const udzial = roznica === 0 ? 1 : Math.max(0, 1 - roznica / Math.max(1, k.tolPokoi + 1));
  return { punkty: Math.round(maks * udzial), maks, znane: true, roznica,
    opis: roznica === 0 ? `${ile} ${podOdmien(ile, 'pokój', 'pokoje', 'pokoi')} — tyle samo`
      : `${ile} ${podOdmien(ile, 'pokój', 'pokoje', 'pokoi')} zamiast ${k.pokoje}` };
}

function podPunktyPietra(p, k) {
  const maks = POD_WAGI.pietro;
  const pietro = podLiczba(p.pietro);
  if (k.pietro == null || pietro == null) {
    return { punkty: 0, maks, znane: false,
      opis: pietro == null ? 'kondygnacja nieznana — nie sprawdzone' : podNazwaPietra(pietro) };
  }
  const roznica = Math.abs(pietro - k.pietro);
  let udzial = roznica === 0 ? 1 : Math.max(0, 1 - roznica / Math.max(1, k.tolPieter + 1));
  // Parter rzadzi sie wlasna cena: ma ogrodek albo halas i witryne, a nie
  // "o jedno pietro mniej". To samo dotyczy porownania parteru z pietrem.
  const parterowosc = (pietro === 0) !== (k.pietro === 0);
  if (parterowosc) udzial = Math.min(udzial, 0.4);
  return { punkty: Math.round(maks * udzial), maks, znane: true, roznica,
    opis: roznica === 0 ? `${podNazwaPietra(pietro)} — tak samo`
      : parterowosc ? `${podNazwaPietra(pietro)} — parter ma własny rynek`
        : `${podNazwaPietra(pietro)} zamiast ${podNazwaPietra(k.pietro)}` };
}

function podNazwaPietra(n) {
  const i = Math.trunc(Number(n) || 0);
  if (i === 0) return 'parter';
  if (i < 0) return 'poniżej parteru';
  return `${i}. piętro`;
}

function podPunktyCzasu(p, k) {
  const maks = POD_WAGI.czas;
  if (!k.dataWyceny || !podTekst(p.data)) {
    return { punkty: 0, maks, znane: false, opis: 'data transakcji nieznana — nie sprawdzone' };
  }
  const mies = podMiesiecy(p.data, k.dataWyceny);
  if (mies == null) return { punkty: 0, maks, znane: false, opis: 'nieczytelna data' };
  const udzial = podKrzywa(Math.max(0, mies), k.okresMiesiecy, k.okresMiesiecyZapas);
  return { punkty: Math.round(maks * udzial), maks, znane: true, miesiecy: mies,
    opis: mies <= 0 ? 'z dnia wyceny' : `${mies} ${podOdmien(mies, 'miesiąc', 'miesiące', 'miesięcy')} przed datą wyceny` };
}

/**
 * Czym pozycja WYCHODZI POZA kryteria, ktore rzeczoznawca wpisal sam.
 *
 * To nie to samo co punkty. Punkty ustawiaja KOLEJNOSC, a tolerancje
 * rozstrzygaja, czy program ma prawo wstawic cos do operatu bez pytania.
 * Lokal o 23% wiekszy moze dostac wysoka ocene (ta sama ulica, swiezy,
 * tyle samo pokoi) — ale rzeczoznawca wpisal ±20% i to jest jego decyzja,
 * a nie sugestia. Takie pozycje ida do akceptacji, nie do zbioru.
 */
function podPozaKryteriami(pozycja, k) {
  const p = pozycja || {}, poza = [];
  const pl = (n) => Number(n).toLocaleString('pl-PL', { maximumFractionDigits: 2 });

  const pow = podLiczba(p.powierzchnia);
  if (k.powOd != null && pow != null && (pow < k.powOd || pow > k.powDo)) {
    const ile = pow < k.powOd ? k.powOd - pow : pow - k.powDo;
    const pct = k.powierzchnia > 0 ? Math.round(Math.abs(pow - k.powierzchnia) / k.powierzchnia * 100) : 0;
    poza.push(`powierzchnia ${pl(pow)} m² — ${pl(Math.round(ile * 10) / 10)} m² poza zakresem ${pl(k.powOd)}–${pl(k.powDo)} m² (${pct}% od wzorca)`);
  }
  if (k.dataWyceny && podTekst(p.data)) {
    const mies = podMiesiecy(p.data, k.dataWyceny);
    if (mies != null && mies > k.okresMiesiecy) {
      poza.push(`${mies} ${podOdmien(mies, 'miesiąc', 'miesiące', 'miesięcy')} przed datą wyceny, a okres to ${k.okresMiesiecy}`);
    }
  }
  const d = podOdleglosc(k.punkt, p);
  if (d != null && d > k.promienM) {
    poza.push(`${d >= 1000 ? `${(d / 1000).toFixed(1).replace('.', ',')} km` : `${d} m`} od wycenianego lokalu, a promień to ${k.promienM} m`);
  }
  const pokoi = podLiczba(p.pokoje);
  if (k.pokoje != null && pokoi != null && Math.abs(pokoi - k.pokoje) > k.tolPokoi) {
    poza.push(`${pokoi} ${podOdmien(pokoi, 'pokój', 'pokoje', 'pokoi')} przy wzorcu ${k.pokoje} ±${k.tolPokoi}`);
  }
  const pietro = podLiczba(p.pietro);
  if (k.pietro != null && pietro != null && Math.abs(pietro - k.pietro) > k.tolPieter) {
    poza.push(`${podNazwaPietra(pietro)} przy wzorcu ${podNazwaPietra(k.pietro)} ±${k.tolPieter}`);
  }
  return poza;
}

/* --------------------------------------------------------------- ocena */

/**
 * Pelna ocena jednej pozycji. Zwraca punkty, poziom, rozbicie na skladowe
 * i jedno zdanie, ktore mozna przeczytac bez tlumaczenia.
 */
function podOcen(pozycja, kryteria) {
  const p = pozycja || {}, k = kryteria || podKryteria({});
  const odrzucenia = podWarunkiTwarde(p, k);

  const skladniki = [
    { id: 'polozenie', nazwa: 'Położenie', ...podPunktyPolozenia(p, k) },
    { id: 'powierzchnia', nazwa: 'Powierzchnia', ...podPunktyPowierzchni(p, k) },
    { id: 'pokoje', nazwa: 'Liczba pokoi', ...podPunktyPokoi(p, k) },
    { id: 'pietro', nazwa: 'Kondygnacja', ...podPunktyPietra(p, k) },
    { id: 'czas', nazwa: 'Czas', ...podPunktyCzasu(p, k) },
  ];
  // Oceniamy TYLKO to, co da sie sprawdzic.
  //
  // Rejestr Cen nagminnie nie podaje liczby izb, kondygnacji, a bywa ze
  // i polozenia. Gdyby brak danych odejmowal punkty, transakcja z sasiedniej
  // klatki — bez wpisanej liczby pokoi — wypadalaby gorzej niz lokal
  // z drugiego konca miasta, ktory ma komplet rubryk. Program ocenialby
  // wtedy staranność urzednika, a nie podobienstwo nieruchomosci.
  //
  // Dlatego skladowe nieznane wypadaja z licznika i z mianownika, a to,
  // czego nie sprawdzono, idzie do rzeczoznawcy osobnym zdaniem.
  const znane = skladniki.filter(c => c.znane !== false);
  const maksZnanych = znane.reduce((s, c) => s + c.maks, 0);
  const punkty = maksZnanych > 0
    ? Math.max(0, Math.min(100, Math.round(znane.reduce((s, c) => s + c.punkty, 0) / maksZnanych * 100)))
    : 0;

  // Tolerancje wpisane przez rzeczoznawce sa GRANICA SAMODZIELNOSCI programu:
  // cokolwiek je przekracza, idzie do jego akceptacji, choćby miało komplet
  // punktow. Punkty ustawiaja kolejnosc, nie prawo wstepu do operatu.
  const poza = odrzucenia.length ? [] : podPozaKryteriami(p, k);

  let poziom;
  if (odrzucenia.length) poziom = 'odrzucona';
  else if (punkty < POD_PROGI.zapas) poziom = 'odrzucona';
  else if (poza.length) poziom = 'zapas';
  else if (punkty >= POD_PROGI.wzorcowa) poziom = 'wzorcowa';
  else if (punkty >= POD_PROGI.dobra) poziom = 'dobra';
  else poziom = 'zapas';

  const nieznane = skladniki.filter(c => c.znane === false);
  return {
    punkty, poziom,
    doZbioru: poziom === 'wzorcowa' || poziom === 'dobra',
    doDecyzji: poziom === 'zapas',
    odrzucona: poziom === 'odrzucona',
    powodyOdrzucenia: odrzucenia,
    pozaKryteriami: poza,
    skladniki,
    nieznanych: nieznane.length,
    odlegloscM: skladniki[0].odlegloscM != null ? skladniki[0].odlegloscM : null,
    // Zdanie zaczyna sie od tego, co rzeczoznawce interesuje najbardziej:
    // czym ta pozycja wychodzi poza JEGO kryteria. Reszta opisu idzie dalej.
    zdanie: odrzucenia.length
      ? odrzucenia.join('; ')
      : (poza.length ? `${poza.join('; ')} · ` : '') + skladniki.map(c => c.opis).join(' · '),
    brakiOpis: nieznane.length
      ? `Rejestr nie podał: ${nieznane.map(c => c.nazwa.toLowerCase()).join(', ')} — sprawdź przed użyciem w operacie.`
      : '',
  };
}

/**
 * Dobor calego zbioru. Zwraca trzy kupki w kolejnosci od najlepiej
 * dopasowanej, bo tak czlowiek je czyta i tak podejmuje decyzje.
 */
function podDobierz(pozycje = [], kryteria) {
  const k = kryteria || podKryteria({});
  const ocenione = (pozycje || []).map(p => ({ ...p, dobor: podOcen(p, k) }));
  const wgPunktow = (a, b) => b.dobor.punkty - a.dobor.punkty
    || String(b.data || '').localeCompare(String(a.data || ''));
  const doZbioru = ocenione.filter(x => x.dobor.doZbioru).sort(wgPunktow);
  const doDecyzji = ocenione.filter(x => x.dobor.doDecyzji).sort(wgPunktow);
  const odrzucone = ocenione.filter(x => x.dobor.odrzucona).sort(wgPunktow);
  return {
    doZbioru, doDecyzji, odrzucone,
    doPokazania: doZbioru.concat(doDecyzji),
    razem: ocenione.length,
  };
}

/** Zdanie nad lista: co program dobral i czego nie. */
function podOpisDoboru(w, k) {
  if (!w) return '';
  const cz = [];
  // "Dobralem" rzadzi biernikiem: 1 nieruchomosc podobna, 2 nieruchomosci
  // podobne, 5 nieruchomosci podobnych.
  if (w.doZbioru.length) cz.push(`${w.doZbioru.length} ${podOdmien(w.doZbioru.length, 'nieruchomość podobną', 'nieruchomości podobne', 'nieruchomości podobnych')}`);
  if (w.doDecyzji.length) cz.push(`${w.doDecyzji.length} do Twojej decyzji (do zaznaczenia ręcznie)`);
  if (w.odrzucone.length) cz.push(`${w.odrzucone.length} ${podOdmien(w.odrzucone.length, 'odrzuconą', 'odrzucone', 'odrzuconych')}`);
  if (!cz.length) return 'Nic nie przeszło doboru.';
  const gdzie = (k && k.dzielnica) ? ` w dzielnicy ${k.dzielnica} i w jej sąsiedztwie` : '';
  return `Dobrałem ${cz.join(', ')}${gdzie}.`;
}

/** Zdanie do operatu o sposobie doboru — to trafia do uzasadnienia. */
function podUzasadnienie(k, ile) {
  const x = k || {};
  const cz = [];
  if (x.dzielnica) cz.push(`w dzielnicy ${x.dzielnica} i w jej bezpośrednim sąsiedztwie`);
  else if (x.miejscowosc) cz.push(`na terenie miejscowości ${x.miejscowosc}`);
  if (x.punkt) cz.push(`w promieniu ${x.promienM} m od wycenianej nieruchomości`);
  const pl = (n) => Number(n).toLocaleString('pl-PL', { maximumFractionDigits: 2 });
  if (x.powierzchnia > 0) cz.push(`o powierzchni ${pl(x.powOd)}–${pl(x.powDo)} m² (±${x.tolPowPct}% powierzchni wycenianego lokalu)`);
  if (x.pokoje != null) cz.push(`o zbliżonej liczbie pokoi (${x.pokoje} ±${x.tolPokoi})`);
  if (x.pietro != null) cz.push(`na zbliżonej kondygnacji (${podNazwaPietra(x.pietro)} ±${x.tolPieter})`);
  cz.push(`z okresu ostatnich ${x.okresMiesiecy} ${podOdmien(x.okresMiesiecy, 'miesiąca', 'miesięcy', 'miesięcy')} przed datą wyceny`);
  return `Za nieruchomości podobne przyjęto ${ile || 'wybrane'} ${podOdmien(ile || 0, 'transakcję', 'transakcje', 'transakcji')} `
    + `lokalami mieszkalnymi położonymi ${cz.join(', ')}. `
    + 'Pominięto transakcje nierynkowe (darowizny, zamiany, sprzedaż egzekucyjną) oraz dotyczące innego prawa do nieruchomości.';
}

const API_POD = {
  WAGI: POD_WAGI, PROGI: POD_PROGI,
  kryteria: podKryteria, ocen: podOcen, dobierz: podDobierz,
  pozaKryteriami: podPozaKryteriami,
  opisDoboru: podOpisDoboru, uzasadnienie: podUzasadnienie,
  odleglosc: podOdleglosc, taSamaUlica: podTaSamaUlica, taSamaDzielnica: podTaSamaDzielnica,
  prawo: podPrawo, nazwaPietra: podNazwaPietra, uprosc: podUprosc,
  liczba: podLiczba, odmien: podOdmien, miesiecy: podMiesiecy,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_POD;
if (typeof window !== 'undefined') window.OperoPodobienstwo = API_POD;

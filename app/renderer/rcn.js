'use strict';
/**
 * OPERO 1.10.0 — import RCiWN i dobór transakcji porównawczych.
 *
 * Wyciąg ze starostwa to arkusz z kilkudziesięcioma wierszami, z których większość
 * nie nadaje się do porównania: inne prawo, inny okres, lokale z garażem w cenie,
 * darowizny wpisane jako sprzedaż, te same akty wpisane dwa razy. Przepisywanie
 * tego ręcznie zabiera godzinę i to w niej powstaje większość błędów.
 *
 * Ten moduł robi trzy rzeczy i żadnej z nich nie robi po cichu:
 *   1. rozpoznaje kolumny wyciągu (nagłówki bywają różne w każdym powiecie),
 *   2. czyści dane i ODRZUCA to, co ewidentnie nie jest materiałem porównawczym,
 *   3. punktuje podobieństwo do przedmiotu wyceny i proponuje zbiór.
 *
 * Przy każdym wierszu zostaje powód: dlaczego odrzucony albo co w nim budzi
 * wątpliwość. Dobór zatwierdza rzeczoznawca — program niczego nie przyjmuje za
 * niego, bo to jego podpis stoi pod operatem. Zasada z całego OPERO obowiązuje i
 * tutaj: nic się nie domyśla. Brak ceny albo powierzchni to odrzucenie z nazwy
 * powodu, nigdy podstawienie wartości domyślnej.
 */

/* ============================== rozpoznawanie kolumn ============================== */

function bezOgonkow(v) {
  // „ł" nie jest literą z kreską w sensie Unicode — nie rozkłada się przy NFD jak
  // ą, ę czy ś, więc trzeba je podmienić osobno. Bez tego „Nr działki" nigdy nie
  // trafi we wzorzec „nr dzialki", a „własność" nie zostanie rozpoznana jako prawo
  // własności i wyciąg przejdzie przez kontrolę, której wcale nie przeszedł.
  return String(v ?? '').toLowerCase().replace(/ł/g, 'l')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').trim();
}

// Kolejnosc ma znaczenie: pierwszy trafiony wzorzec wygrywa, wiec wzorce dokladniejsze
// stoja wyzej. „cena za m2" musi byc rozpoznana zanim samo „cena" zabierze te kolumne.
const WZORCE = [
  ['cenaJednostkowa', ['cena jedn', 'cena za m2', 'cena za m²', 'zl/m2', 'zl/m²', 'cena 1 m2', 'wartosc jedn']],
  ['cena',            ['cena transakcyjna', 'cena sprzedazy', 'cena', 'kwota transakcji', 'wartosc transakcji']],
  ['powierzchnia',    ['powierzchnia uzytkowa', 'pow. uzytkowa', 'powierzchnia lokalu', 'powierzchnia dzialki', 'powierzchnia', 'pow.', 'pow ', 'metraz']],
  ['data',            ['data transakcji', 'data zawarcia', 'data aktu', 'data sprzedazy', 'data']],
  ['adres',           ['adres', 'polozenie', 'ulica', 'lokalizacja']],
  ['miejscowosc',     ['miejscowosc', 'miasto', 'gmina']],
  ['obreb',           ['obreb', 'obreb ewidencyjny']],
  ['dzialka',         ['nr dzialki', 'numer dzialki', 'dzialka', 'identyfikator dzialki']],
  ['prawo',           ['rodzaj prawa', 'prawo', 'tytul prawny', 'forma wladania']],
  ['rodzaj',          ['rodzaj nieruchomosci', 'rodzaj transakcji', 'typ nieruchomosci', 'przedmiot']],
  ['akt',             ['nr aktu', 'numer aktu', 'repertorium', 'akt notarialny', 'sygnatura']],
  ['kw',              ['ksiega wieczysta', 'nr kw', 'kw']],
  ['uwagi',           ['uwagi', 'opis', 'komentarz']],
];

/** Dopasowuje naglowki arkusza do pol OPERO. Zwraca mape pole -> indeks kolumny. */
function rozpoznajKolumny(naglowki) {
  const h = (naglowki || []).map(bezOgonkow);
  const mapa = {};
  const zajete = new Set();
  for (const [pole, wzorce] of WZORCE) {
    for (const w of wzorce) {
      const i = h.findIndex((x, idx) => !zajete.has(idx) && x.includes(bezOgonkow(w)));
      if (i >= 0) { mapa[pole] = i; zajete.add(i); break; }
    }
  }
  return mapa;
}

/** Czy wiersz wyglada na naglowek tabeli (a nie na tytul arkusza albo pusta linie). */
function znajdzNaglowek(wiersze) {
  const limit = Math.min(30, (wiersze || []).length);
  let najlepszy = -1, najwiecej = 0;
  for (let i = 0; i < limit; i++) {
    const mapa = rozpoznajKolumny(wiersze[i] || []);
    const ile = Object.keys(mapa).length;
    // Naglowek musi dac przynajmniej date albo cene — inaczej to przypadkowy tekst.
    const sensowny = ile >= 3 && (mapa.cena !== undefined || mapa.cenaJednostkowa !== undefined);
    if (sensowny && ile > najwiecej) { najwiecej = ile; najlepszy = i; }
  }
  return najlepszy;
}

/* ============================== odczyt wartosci ============================== */

/** Liczba z komorki wyciagu: spacje nierozdzielajace, przecinek dziesietny, „zl", „m2". */
function liczba(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let t = String(v ?? '').replace(/ /g, ' ').trim();
  if (!t) return null;
  t = t.replace(/(zl|zł|pln|m2|m²|szt\.?)/gi, '').replace(/\s/g, '');
  // Tysiace bywaja kropka ("1.250,00"), a dziesietne przecinkiem. Gdy sa oba znaki,
  // ten stojacy blizej konca jest separatorem dziesietnym.
  const kropka = t.lastIndexOf('.'), przecinek = t.lastIndexOf(',');
  if (kropka >= 0 && przecinek >= 0) {
    if (przecinek > kropka) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (przecinek >= 0) {
    t = t.replace(',', '.');
  } else if ((t.match(/\./g) || []).length > 1) {
    // Kilka kropek to zapis tysiecy („1.250.000"), nigdy ulamek. Pojedyncza kropka
    // zostaje separatorem dziesietnym, bo „54.30" to powierzchnia, a nie 5430.
    t = t.replace(/\./g, '');
  }
  t = t.replace(/[^0-9.\-]/g, '');
  // Komorka bez ani jednej cyfry („brak danych", „-") to brak wartosci. Bez tego
  // Number('') zwrocilby zero i wyciag udawalby cene zerowa zamiast luki.
  if (!/[0-9]/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Data w formatach spotykanych w wyciagach: 2026-01-31, 31.01.2026, 31/01/2026. */
function data(v) {
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const t = String(v ?? '').trim();
  if (!t) return null;
  // Excel trzyma daty jako liczbę dni od 30.12.1899. Taka komórka wraca z arkusza
  // jako „46152" i bez przeliczenia data transakcji byłaby pusta. Zakres zawężamy
  // do lat 1950–2079, żeby zwykła liczba w kolumnie nie udawała daty.
  if (/^\d{4,5}(\.\d+)?$/.test(t)) {
    const n = Number(t);
    if (n >= 18264 && n <= 65380) {
      const ms = Math.round((n - 25569) * 86400000);
      const d = new Date(ms);
      if (!isNaN(d)) return d.toISOString().slice(0, 10);
    }
  }
  let m = t.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = t.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
  if (m) return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  return null;
}

const PRAWA_WLASNOSC = ['wlasnosc', 'prawo wlasnosci', 'odrebna wlasnosc'];
const PRAWA_INNE = ['uzytkowanie wieczyste', 'wieczyste', 'spoldzielcze', 'sluzebnosc', 'najem', 'dzierzawa', 'trwaly zarzad'];
const NIE_SPRZEDAZ = ['darowizna', 'spadek', 'dzial spadku', 'zniesienie wspolwlasnosci', 'zamiana', 'aport', 'licytacja', 'egzekucyj', 'przetarg ograniczony',
  // 3.3: kody z Rejestru Cen (usługa WFS) — sprzedaże poza wolnym rynkiem
  'bezprzetarg', 'bonifikat', 'cel publiczny', 'celpubliczny'];

/* ============================== wczytanie wierszy ============================== */

/**
 * Zamienia surowe wiersze arkusza na transakcje OPERO.
 * `mapowanie` moze pochodzic z rozpoznania albo z poprawek uzytkownika.
 */
function wczytaj(wiersze, mapowanie, odWiersza) {
  const out = [];
  const m = mapowanie || {};
  const start = Number.isInteger(odWiersza) ? odWiersza : 0;
  for (let r = start; r < (wiersze || []).length; r++) {
    const w = wiersze[r] || [];
    const kom = (pole) => (m[pole] === undefined ? '' : w[m[pole]]);
    const cena = liczba(kom('cena'));
    const jedn = liczba(kom('cenaJednostkowa'));
    const pow = liczba(kom('powierzchnia'));
    const dt = data(kom('data'));
    const adres = String(kom('adres') ?? '').trim();
    const miejsc = String(kom('miejscowosc') ?? '').trim();
    // Pusty wiersz pomijamy bez slowa; wiersz z choc jedna wartoscia idzie dalej,
    // zeby uzytkownik zobaczyl, dlaczego nie da sie go uzyc.
    if (cena == null && jedn == null && pow == null && !dt && !adres) continue;
    out.push({
      zrodloWiersz: r + 1,
      cena, cenaJednostkowa: jedn, powierzchnia: pow, data: dt,
      adres: adres || miejsc,
      miejscowosc: miejsc,
      obreb: String(kom('obreb') ?? '').trim(),
      dzialka: String(kom('dzialka') ?? '').trim(),
      prawo: String(kom('prawo') ?? '').trim(),
      rodzaj: String(kom('rodzaj') ?? '').trim(),
      akt: String(kom('akt') ?? '').trim(),
      kw: String(kom('kw') ?? '').trim(),
      uwagiZrodla: String(kom('uwagi') ?? '').trim(),
    });
  }
  return out;
}

/* ============================== czyszczenie i dobor ============================== */

function mediana(xs) {
  const a = xs.filter(x => Number.isFinite(x)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const i = Math.floor(a.length / 2);
  return a.length % 2 ? a[i] : (a[i - 1] + a[i]) / 2;
}
function kwartyl(xs, q) {
  const a = xs.filter(x => Number.isFinite(x)).slice().sort((x, y) => x - y);
  if (!a.length) return null;
  const p = (a.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (p - lo);
}
function miesiacyMiedzy(a, b) {
  const d1 = new Date(a), d2 = new Date(b);
  if (isNaN(d1) || isNaN(d2)) return null;
  return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
}

/**
 * Ocenia zbiór: odrzuca to, co nie jest materiałem porównawczym, resztę punktuje
 * podobieństwem do przedmiotu wyceny. Niczego nie usuwa z listy — każdy wiersz
 * wraca z werdyktem i powodem, żeby dobór dało się obronić w operacie.
 *
 * `przedmiot`: { powierzchnia, dataWyceny, miejscowosc, obreb, prawo, okresMiesiecy }
 */
function ocen(transakcje, przedmiot) {
  const p = przedmiot || {};
  const okres = Number(p.okresMiesiecy) > 0 ? Number(p.okresMiesiecy) : 24;
  const dataWyceny = p.dataWyceny || null;
  const lista = (transakcje || []).map(t => ({ ...t, uwagi: [], powod: null, punkty: 0 }));

  // Cena jednostkowa: z kolumny albo z ceny i powierzchni. Nigdy nie zgadujemy
  // powierzchni, zeby „uratowac" wiersz — brak danych to brak transakcji.
  for (const t of lista) {
    if (Number.isFinite(t.cenaJednostkowa) && t.cenaJednostkowa > 0) t.jednostkowa = t.cenaJednostkowa;
    else if (Number.isFinite(t.cena) && Number.isFinite(t.powierzchnia) && t.powierzchnia > 0) {
      t.jednostkowa = t.cena / t.powierzchnia;
    } else t.jednostkowa = null;
  }

  /* --- odrzucenia twarde --- */
  const widziane = new Map();
  for (const t of lista) {
    if (t.powod) continue;
    if (!Number.isFinite(t.jednostkowa) || t.jednostkowa <= 0) {
      t.powod = !Number.isFinite(t.cena) && !Number.isFinite(t.cenaJednostkowa)
        ? 'brak ceny' : (!Number.isFinite(t.powierzchnia) || t.powierzchnia <= 0 ? 'brak powierzchni' : 'cena nie jest liczbą dodatnią');
      continue;
    }
    if (!t.data) { t.powod = 'brak daty transakcji'; continue; }

    const rodzaj = bezOgonkow(`${t.rodzaj} ${t.uwagiZrodla}`);
    const nieSprzedaz = NIE_SPRZEDAZ.find(x => rodzaj.includes(x));
    if (nieSprzedaz) { t.powod = `to nie jest sprzedaż rynkowa (${nieSprzedaz})`; continue; }
    if (t.czescUdzialowa) { t.powod = `transakcja dotyczy udziału (${t.udzial || 'część'}), nie całej nieruchomości`; continue; }
    if (t.funkcja && !/mieszk/.test(bezOgonkow(t.funkcja)) && !p.niemieszkalny) { t.powod = `lokal niemieszkalny (${t.funkcja})`; continue; }

    if (p.prawo) {
      const prawoT = bezOgonkow(t.prawo), prawoP = bezOgonkow(p.prawo);
      const wlasnoscP = PRAWA_WLASNOSC.some(x => prawoP.includes(x));
      const inneT = PRAWA_INNE.find(x => prawoT.includes(x));
      if (prawoT && wlasnoscP && inneT) { t.powod = `inne prawo niż przedmiot wyceny (${t.prawo})`; continue; }
    }

    if (dataWyceny) {
      const mies = miesiacyMiedzy(t.data, dataWyceny);
      t.miesiace = mies;
      if (mies != null && mies < 0) { t.powod = 'transakcja po dacie wyceny'; continue; }
      if (mies != null && mies > okres) { t.powod = `poza przyjętym okresem badania rynku (${mies} mies. > ${okres})`; continue; }
    }

    // Duplikat: ten sam akt, a gdy aktu brak — ta sama data, cena i powierzchnia.
    const klucz = t.idObiektu ? `obj:${t.idObiektu}|${t.data}|${Math.round(t.cena ?? 0)}` : t.akt ? `akt:${bezOgonkow(t.akt)}|p:${Math.round((t.powierzchnia ?? 0) * 100)}`
      : `d:${t.data}|c:${Math.round(t.cena ?? t.jednostkowa)}|p:${Math.round((t.powierzchnia ?? 0) * 100)}`;
    if (widziane.has(klucz)) { t.powod = `duplikat wiersza ${widziane.get(klucz)}`; continue; }
    widziane.set(klucz, t.zrodloWiersz);
  }

  /* --- odstepy razace --- */
  // Odrzucamy tylko wartosci skrajnie odstajace (3x rozstep cwiartkowy). Zwykle
  // odchylenia to material do analizy rynku, a nie smiec — ich usuniecie
  // zawezaloby rynek pod z gory przyjeta teze.
  const ceny = lista.filter(t => !t.powod).map(t => t.jednostkowa);
  const q1 = kwartyl(ceny, 0.25), q3 = kwartyl(ceny, 0.75);
  const med = mediana(ceny);
  if (q1 != null && q3 != null && ceny.length >= 5) {
    const iqr = q3 - q1, dol = q1 - 3 * iqr, gora = q3 + 3 * iqr;
    for (const t of lista) {
      if (t.powod) continue;
      if (t.jednostkowa < dol || t.jednostkowa > gora) {
        t.powod = `cena jednostkowa rażąco odstaje od rynku (${Math.round(t.jednostkowa)} zł/m² przy medianie ${Math.round(med)})`;
      }
    }
  }

  /* --- uwagi i punktacja --- */
  for (const t of lista) {
    if (t.powod) continue;
    if (!t.adres) t.uwagi.push('brak adresu — uzupełnij przed operatem');
    if (Number.isFinite(p.powierzchnia) && p.powierzchnia > 0 && Number.isFinite(t.powierzchnia) && t.powierzchnia > 0) {
      const iloraz = t.powierzchnia / p.powierzchnia;
      if (iloraz > 2 || iloraz < 0.5) t.uwagi.push(`powierzchnia odbiega od przedmiotu (${t.powierzchnia} m² wobec ${p.powierzchnia} m²)`);
    }
    if (t.miesiace != null && t.miesiace > 12) t.uwagi.push(`transakcja sprzed ${t.miesiace} mies. — rozważ korektę trendu`);
    if (med && (t.jednostkowa > med * 1.5 || t.jednostkowa < med * 0.66)) {
      t.uwagi.push('cena wyraźnie odbiega od mediany — sprawdź, czy w cenie nie ma garażu, udziału lub wyposażenia');
    }

    let s = 100;
    if (Number.isFinite(p.powierzchnia) && p.powierzchnia > 0 && Number.isFinite(t.powierzchnia) && t.powierzchnia > 0) {
      s -= Math.min(40, Math.abs(t.powierzchnia - p.powierzchnia) / p.powierzchnia * 60);
    }
    if (t.miesiace != null) s -= Math.min(25, t.miesiace * 1.2);
    const mT = bezOgonkow(t.miejscowosc || t.adres), mP = bezOgonkow(p.miejscowosc || '');
    if (mP && mT && mT.includes(mP)) s += 12;
    if (p.obreb && bezOgonkow(t.obreb) && bezOgonkow(t.obreb) === bezOgonkow(p.obreb)) s += 10;
    s -= t.uwagi.length * 4;
    t.punkty = Math.round(Math.max(0, Math.min(100, s)));
  }

  const przyjete = lista.filter(t => !t.powod).sort((a, b) => b.punkty - a.punkty);
  const odrzucone = lista.filter(t => t.powod);
  return {
    wszystkie: lista, przyjete, odrzucone,
    statystyka: {
      wczytane: lista.length, przyjete: przyjete.length, odrzucone: odrzucone.length,
      mediana: med != null ? Math.round(med) : null,
      min: przyjete.length ? Math.round(Math.min(...przyjete.map(t => t.jednostkowa))) : null,
      max: przyjete.length ? Math.round(Math.max(...przyjete.map(t => t.jednostkowa))) : null,
      okresMiesiecy: okres,
    },
  };
}

/** Zamienia przyjete pozycje na transakcje w formacie silnika OPERO. */
function doOperatu(przyjete, zaczynajOdId = 1) {
  return (przyjete || []).map((t, i) => ({
    id: zaczynajOdId + i,
    address: t.adres || t.miejscowosc || `pozycja ${t.zrodloWiersz}`,
    date: t.data,
    area: Number.isFinite(t.powierzchnia) ? Number(t.powierzchnia.toFixed(2)) : 0,
    roomsFloor: [t.pokoje ? `${t.pokoje} ${t.pokoje === 1 ? 'izba' : t.pokoje < 5 ? 'izby' : 'izb'}` : '', t.pietro != null ? (Number(t.pietro) === 0 ? 'parter' : `kond. ${t.pietro}`) : ''].filter(Boolean).join(' / '),
    priceUnit: Number(t.jednostkowa.toFixed(2)),
    monthsToValuation: 0,
    autoMonthsToValuation: true,
    featureRatings: {},
    // Slad pochodzenia zostaje przy transakcji — w operacie trzeba umiec wskazac,
    // z ktorego wiersza wyciagu wzieta jest kazda liczba.
    zrodlo: { wiersz: t.zrodloWiersz, akt: t.akt || null, kw: t.kw || null, uwagi: (t.uwagi || []).slice(),
      // 3.3: dane z rejestru potrzebne agentom do ocen cech (rynek, położenie, kondygnacja, izby).
      rynek: t.rynek || '', idObiektu: t.idObiektu || '', idTransakcji: t.idTransakcji || '', x: t.x ?? null, y: t.y ?? null,
      pokoje: t.pokoje ?? null, pietro: t.pietro ?? null, funkcja: t.funkcja || '', rejestr: t.idObiektu ? 'Rejestr Cen Nieruchomości (GUGiK)' : '' },
  }));
}

// Kazdy plik renderera dziala we wspolnym zakresie globalnym strony, wiec
// nazwa „API" w dwoch modulach to blad skladni calej strony i polowa programu
// przestaje sie inicjalizowac. Nazwy eksportow musza byc rozlaczne.
const API_RCN = { rozpoznajKolumny, znajdzNaglowek, wczytaj, ocen, doOperatu, liczba, data, bezOgonkow };
if (typeof module !== 'undefined' && module.exports) module.exports = API_RCN;
if (typeof window !== 'undefined') window.OperoRCN = API_RCN;

'use strict';
/* ============================================================================
   OPERO — CENY OFERTOWE DEWELOPERÓW Z dane.gov.pl
   ----------------------------------------------------------------------------
   Od 11 września 2025 art. 19b ust. 1 ustawy deweloperskiej nakazuje każdemu
   deweloperowi publikować ceny lokali jako dane otwarte na dane.gov.pl.
   To znaczy, że cenniki rynku pierwotnego są dostępne u ŹRÓDŁA: bezpłatnie,
   bez logowania, na licencji pozwalającej na dowolne użycie.

        katalog:   https://api.dane.gov.pl/1.4/institutions?institution_type=developer
        zbiory:    https://api.dane.gov.pl/1.4/datasets?q=ceny+ofertowe
        plik:      https://api.dane.gov.pl/resources/<id>/file

   Dlatego program nie podbiera cenników serwisom, które je przetwarzają
   (deweloperuch.pl i podobnym): bierze je tam, gdzie deweloper ma obowiązek
   je położyć. Źródło da się wtedy wskazać w operacie z nazwy, adresu i daty.

   CZEGO TE DANE NIE SĄ
   --------------------
   To CENY OFERTOWE. Cena ofertowa to kwota, za którą ktoś CHCE sprzedać —
   nie kwota, za którą sprzedał. Do zbioru porównawczego nie wchodzi i ten
   moduł nie pozwala jej tam wstawić: każdy wiersz wychodzi stąd oznaczony
   `rodzajDanych: 'oferta'`, a `doZbioru` jest zawsze fałszem.

   Oferty służą trzem rzeczom, których transakcje nie załatwiają:
     • analizie rynku pierwotnego, gdzie transakcji w RCN bywa mało,
     • wnioskowaniu o relacji ceny ofertowej do transakcyjnej,
     • sprawdzeniu, czy rynek od czasu ostatnich transakcji drgnął.

   UKŁAD PLIKU
   -----------
   Rozporządzenie z 2025 r. dało wzorzec, który deweloperzy publikują jako
   CSV albo XLSX. Sprawdzony na pliku realnym (Modera, 2025-09-11): 29 kolumn,
   separator średnik, pola tekstowe w cudzysłowach, „X" oznacza „nie dotyczy".
   Kolumn POWIERZCHNI w tym wzorcu NIE MA — da się ją policzyć z ceny i ceny
   za metr, ale to wyliczenie, nie dana z pliku, i program tak to podpisuje.

   Projekt rozporządzenia z 23.09.2026 (RCL 12415103) rozszerza wzorzec do
   57 pól i dokłada m.in. powierzchnię oraz daty obowiązywania ceny. Nie jest
   jeszcze ogłoszony, więc program czyta kolumny PO NAZWIE, dopasowując po
   słowach kluczowych, a nie po pozycji. Gdy wzorzec się zmieni, pliki w nowym
   układzie wczytają się bez zmiany w programie.
   ========================================================================= */

const ODG_API = 'https://api.dane.gov.pl/1.4';
const ODG_PLIK = 'https://api.dane.gov.pl/resources';
/** Ile rekordów z jednego pliku bierzemy. Cennik dużego dewelopera to setki lokali. */
const ODG_MAKS_WIERSZY = 5000;

/* ----------------------------------------------------------------- adresy */

function odgEnc(t) { return encodeURIComponent(String(t ?? '').trim()); }

/** Katalog deweloperów — instytucje typu „developer". */
function odgUrlInstytucje({ strona = 1, ile = 100, fraza = '' } = {}) {
  const p = new URLSearchParams({
    institution_type: 'developer',
    page: String(Math.max(1, Number(strona) || 1)),
    per_page: String(Math.min(100, Math.max(1, Number(ile) || 100))),
  });
  if (String(fraza || '').trim()) p.set('q', String(fraza).trim());
  return `${ODG_API}/institutions?${p.toString()}`;
}

/** Zbiory danych z cennikami. Szukamy po frazie, bo tytuły są ustandaryzowane. */
function odgUrlZbiory({ fraza = 'ceny ofertowe', miasto = '', strona = 1, ile = 100 } = {}) {
  const szukaj = [String(fraza || '').trim(), String(miasto || '').trim()].filter(Boolean).join(' ');
  const p = new URLSearchParams({
    q: szukaj || 'ceny ofertowe',
    page: String(Math.max(1, Number(strona) || 1)),
    per_page: String(Math.min(100, Math.max(1, Number(ile) || 100))),
    sort: '-created',
  });
  return `${ODG_API}/datasets?${p.toString()}`;
}

/** Zbiory jednej instytucji — pewniejsze niż szukanie po frazie. */
function odgUrlZbioryInstytucji(idInstytucji, { ile = 50 } = {}) {
  if (!String(idInstytucji || '').trim()) throw new Error('Brak numeru instytucji.');
  return `${ODG_API}/institutions/${odgEnc(idInstytucji)}/datasets?per_page=${Math.min(100, Math.max(1, Number(ile) || 50))}`;
}

function odgUrlZasoby(idZbioru) {
  if (!String(idZbioru || '').trim()) throw new Error('Brak numeru zbioru.');
  return `${ODG_API}/datasets/${odgEnc(idZbioru)}/resources?per_page=100`;
}

/** Adres samego pliku. Ten adres idzie potem do operatu jako źródło. */
function odgUrlPliku(idZasobu) {
  if (!String(idZasobu || '').trim()) throw new Error('Brak numeru zasobu.');
  return `${ODG_PLIK}/${odgEnc(idZasobu)}/file`;
}

/* ------------------------------------------------------- czytanie katalogu */

function odgJson(tekst) {
  if (tekst && typeof tekst === 'object') return tekst;
  try { return JSON.parse(String(tekst || '')); } catch { return null; }
}

function odgAtr(o) { return (o && o.attributes) ? o.attributes : (o || {}); }

/** Instytucje: numer, nazwa, miasto siedziby. Miasto przyda się do filtra. */
function odgZInstytucji(wejscie) {
  const j = odgJson(wejscie);
  const dane = Array.isArray(j?.data) ? j.data : [];
  return dane.map(o => {
    const a = odgAtr(o);
    return {
      id: String(o.id ?? a.id ?? ''),
      nazwa: String(a.title || a.name || '').trim(),
      miasto: String(a.city || a.postal_city || '').trim(),
      zbiorow: Number(a.datasets_count ?? a.dataset_count ?? 0) || 0,
      strona: String(a.website || '').trim(),
    };
  }).filter(x => x.id && x.nazwa);
}

function odgZZbiorow(wejscie) {
  const j = odgJson(wejscie);
  const dane = Array.isArray(j?.data) ? j.data : [];
  return dane.map(o => {
    const a = odgAtr(o);
    const inst = a.institution || o.relationships?.institution?.data || {};
    return {
      id: String(o.id ?? a.id ?? ''),
      tytul: String(a.title || '').replace(/<\/?mark>/gi, '').trim(),
      opis: String(a.notes || '').replace(/<[^>]*>/g, '').trim(),
      instytucja: String(odgAtr(inst).title || inst.title || '').trim(),
      aktualizacja: odgDzien(a.modified || a.verified || a.created),
      zasobow: Number(a.resources_count ?? 0) || 0,
    };
  }).filter(x => x.id);
}

function odgZZasobow(wejscie) {
  const j = odgJson(wejscie);
  const dane = Array.isArray(j?.data) ? j.data : [];
  return dane.map(o => {
    const a = odgAtr(o);
    return {
      id: String(o.id ?? a.id ?? ''),
      tytul: String(a.title || '').replace(/<\/?mark>/gi, '').trim(),
      format: String(a.format || '').toLowerCase().trim(),
      url: String(a.file_url || a.download_url || a.link || '').trim() || (o.id ? odgUrlPliku(o.id) : ''),
      dataDanych: odgDzien(a.data_date || a.created),
      aktualizacja: odgDzien(a.modified || a.created),
    };
  }).filter(x => x.id);
}

function odgDzien(v) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

/**
 * Który plik wziąć. CSV przed XLSX, bo program czyta go bez żadnej biblioteki,
 * a przy równym formacie — najświeższy. Cennik sprzed roku to nie cennik.
 */
function odgWybierzZasob(zasoby = []) {
  const dobre = (zasoby || []).filter(z => ['csv', 'xlsx', 'xls'].includes(z.format));
  if (!dobre.length) return null;
  const waga = z => (z.format === 'csv' ? 2 : 1);
  return dobre.slice().sort((a, b) => {
    const d = String(b.dataDanych || b.aktualizacja || '').localeCompare(String(a.dataDanych || a.aktualizacja || ''));
    return d !== 0 ? d : waga(b) - waga(a);
  })[0];
}

/* ------------------------------------------------------------- czytanie CSV */

function odgBezOgonkow(v) {
  return String(v ?? '')
    .replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Separator zgadujemy z pierwszego wiersza — wzorzec nie przesądza go. */
function odgSeparator(pierwszyWiersz) {
  const t = String(pierwszyWiersz || '');
  const poza = (znak) => {
    let w = false, n = 0;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (c === '"') { w = !w; continue; }
      if (!w && c === znak) n++;
    }
    return n;
  };
  const kandydaci = [[';', poza(';')], [',', poza(',')], ['\t', poza('\t')], ['|', poza('|')]];
  kandydaci.sort((a, b) => b[1] - a[1]);
  return kandydaci[0][1] > 0 ? kandydaci[0][0] : ';';
}

/**
 * Rozkład CSV na wiersze. Cudzysłowy, podwójne cudzysłowy w środku i znaki
 * końca linii w polu — wszystko to w cennikach występuje (pole „Dodatkowe
 * lokalizacje" potrafi zawierać przecinki i łamanie wiersza).
 */
function odgCsv(tekst, separator = null) {
  const t = String(tekst || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  if (!t.trim()) return { sep: separator || ';', wiersze: [] };
  const sep = separator || odgSeparator(t.split('\n')[0]);
  const wiersze = [];
  let pole = '', wiersz = [], wCudzyslowie = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (wCudzyslowie) {
      if (c === '"') {
        if (t[i + 1] === '"') { pole += '"'; i++; } else wCudzyslowie = false;
      } else pole += c;
      continue;
    }
    if (c === '"') { wCudzyslowie = true; continue; }
    if (c === sep) { wiersz.push(pole); pole = ''; continue; }
    if (c === '\n') { wiersz.push(pole); wiersze.push(wiersz); wiersz = []; pole = ''; continue; }
    pole += c;
  }
  wiersz.push(pole);
  if (wiersz.length > 1 || wiersz[0] !== '') wiersze.push(wiersz);
  return { sep, wiersze: wiersze.map(w => w.map(x => x.trim())) };
}

/**
 * Nazwy kolumn, których szukamy — po słowach kluczowych, nie po pozycji.
 * Kolejność w tablicy to kolejność prób: pierwszy pasujący nagłówek wygrywa.
 */
/**
 * Nazwy kolumn, których szukamy — po słowach kluczowych, nie po pozycji.
 * `szukaj` to kolejność prób: pierwszy pasujący nagłówek wygrywa.
 * `wyklucz` to nagłówki, których ta kolumna NIE MOŻE wziąć.
 *
 * Wykluczenia nie są ozdobą. „Cena 1 m2 lokalu" zawiera i „cena", i „lokalu",
 * więc bez nich kolumna ceny lokalu wzięłaby cenę metra — i program pokazałby
 * mieszkanie za 12 tysięcy złotych albo powierzchnię 220 m². Tak samo „Cena
 * przed zmianą" nie może udawać ceny obecnej.
 *
 * KOLEJNOŚĆ KLUCZY MA ZNACZENIE: kolumny węższe (cena za metr, cena przed
 * zmianą) rozpoznajemy PRZED szerszymi (cena), bo raz zajętej kolumny już
 * nikt nie zabierze.
 */
const ODG_METR = /m2|m²|metr|1 m\b|za m\b/;
const ODG_KOLUMNY = {
  lokal: { szukaj: [['oznaczenie', 'lokal'], ['numer', 'lokal'], ['oznaczenie', 'nieruchomosc'], ['oznaczenie']], wyklucz: /cena|kod|nr nieruchomosci/ },
  cenaM2Przed: { szukaj: [['cena', 'przed'], ['cena', 'zmiana']], wymaga: ODG_METR },
  cenaM2: { szukaj: [['cena']], wymaga: ODG_METR, wyklucz: /przed/ },
  cenaPrzed: { szukaj: [['cena', 'przed'], ['cena', 'zmiana']], wyklucz: ODG_METR },
  cena: { szukaj: [['cena', 'lokalu'], ['cena', 'pln'], ['cena', 'brutto'], ['cena', 'lacznie'], ['cena']], wyklucz: /przed|m2|m²|metr|1 m\b|za m\b/ },
  powierzchnia: { szukaj: [['powierzchnia', 'uzytkowa'], ['powierzchnia'], ['metraz']], wyklucz: /cena|gruntu|dzialki/ },
  dataAktualizacji: { szukaj: [['data', 'aktualizacji'], ['data', 'obowiazywania'], ['data', 'ceny'], ['data', 'zmiany']] },
  deweloper: { szukaj: [['nazwa', 'dewelopera'], ['firma'], ['podmiot', 'obowiazany'], ['deweloper']], wyklucz: /forma prawna|strony internetowej|poczty/ },
  rodzaj: { szukaj: [['rodzaj', 'nieruchomosci'], ['rodzaj', 'lokalu'], ['rodzaj']], wyklucz: /forma prawna|rynku/ },
  wojewodztwo: { szukaj: [['wojewodztwo', 'lokalu'], ['wojewodztwo', 'inwestycji'], ['wojewodztwo', 'nieruchomosci'], ['wojewodztwo']] },
  powiat: { szukaj: [['powiat', 'lokalu'], ['powiat', 'inwestycji'], ['powiat', 'nieruchomosci'], ['powiat']] },
  gmina: { szukaj: [['gmina', 'lokalu'], ['gmina', 'inwestycji'], ['gmina', 'nieruchomosci'], ['gmina']] },
  miejscowosc: { szukaj: [['miejscowosc', 'lokalu'], ['miejscowosc', 'inwestycji'], ['miejscowosc', 'nieruchomosci'], ['miejscowosc']] },
  ulica: { szukaj: [['ulica', 'lokalu'], ['ulica', 'inwestycji'], ['ulica', 'nieruchomosci'], ['ulica']] },
  numerNieruchomosci: { szukaj: [['nr', 'nieruchomosci', 'lokalu'], ['numer', 'nieruchomosci'], ['nr', 'nieruchomosci']] },
  kod: { szukaj: [['kod', 'pocztowy', 'lokalu'], ['kod', 'pocztowy']] },
  dodatkowe: { szukaj: [['dodatkowe', 'lokalizacje']] },
  prospekt: { szukaj: [['prospekt'], ['adres', 'strony', 'prospekt']] },
};

function odgRozpoznajKolumny(naglowki = []) {
  const czyste = naglowki.map(h => odgBezOgonkow(h));
  const mapowanie = {};
  const zajete = new Set();
  for (const [klucz, regula] of Object.entries(ODG_KOLUMNY)) {
    const warianty = regula.szukaj || [];
    for (const slowa of warianty) {
      let trafiony = -1;
      for (let i = 0; i < czyste.length; i++) {
        if (zajete.has(i)) continue;
        const h = czyste[i];
        if (/siedzib|glownego miejsca/.test(h)) continue;
        if (regula.wymaga && !regula.wymaga.test(h)) continue;
        if (regula.wyklucz && regula.wyklucz.test(h)) continue;
        if (slowa.every(s => h.includes(s))) { trafiony = i; break; }
      }
      if (trafiony >= 0) { mapowanie[klucz] = trafiony; zajete.add(trafiony); break; }
    }
  }
  return mapowanie;
}

/** „X" to we wzorcu „nie dotyczy" — nie zero i nie pusty tekst. */
function odgPuste(v) {
  const t = String(v ?? '').trim();
  return t === '' || t === 'X' || t === 'x' || t === '-' || t === 'brak';
}

function odgLiczba(v) {
  if (odgPuste(v)) return null;
  let t = String(v).replace(/\s| /g, '').replace(/(zl|pln|zł)/gi, '');
  // 1.234,56 i 1,234.56 znaczą to samo — rozstrzyga ostatni separator.
  const ostatniPrzecinek = t.lastIndexOf(','), ostatniaKropka = t.lastIndexOf('.');
  if (ostatniPrzecinek >= 0 && ostatniaKropka >= 0) {
    t = ostatniPrzecinek > ostatniaKropka
      ? t.replace(/\./g, '').replace(',', '.')
      : t.replace(/,/g, '');
  } else if (ostatniPrzecinek >= 0) {
    t = t.replace(/,/g, '.');
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function odgTekst(v) { return odgPuste(v) ? '' : String(v).trim(); }

function odgData(v) {
  const t = odgTekst(v);
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const pl = /(\d{2})[.\-/](\d{2})[.\-/](\d{4})/.exec(t);
  return pl ? `${pl[3]}-${pl[2]}-${pl[1]}` : '';
}

/** Adres inwestycji z pól wzorca. Ulicy wzorzec z 2025 r. nie ma wprost. */
function odgAdres(wiersz, m) {
  const we = k => (m[k] != null ? odgTekst(wiersz[m[k]]) : '');
  const ulica = we('ulica'), numer = we('numerNieruchomosci');
  const miejscowosc = we('miejscowosc'), kod = we('kod');
  const czesci = [];
  if (ulica) czesci.push(numer ? `${ulica} ${numer}` : ulica);
  else if (numer) czesci.push(`nr ${numer}`);
  if (miejscowosc) czesci.push(kod ? `${kod} ${miejscowosc}` : miejscowosc);
  if (!czesci.length) {
    const dod = we('dodatkowe');
    if (dod) return dod.split(/[;\n]/)[0].trim();
  }
  return czesci.join(', ');
}

/**
 * Rozkład cennika na oferty. Kształt wiersza jest ten sam, co przy
 * transakcjach — ale z `rodzajDanych: 'oferta'` i `doZbioru: false`, żeby
 * żadną drogą nie dało się tego wsunąć do zbioru porównawczego.
 *
 * Powierzchnia: jeżeli pliku jej nie ma, liczymy ją z ceny i ceny za metr i
 * mówimy o tym wprost. Rzeczoznawca musi wiedzieć, która liczba jest daną,
 * a która jego własnym dzieleniem.
 */
function odgZCsv(tekst, opcje = {}) {
  const { sep, wiersze } = odgCsv(tekst);
  const wynik = odgZWierszy(wiersze, opcje);
  return { ...wynik, separator: sep };
}

/**
 * Rozkład cennika na oferty — z gotowych wierszy, więc ta sama droga obsługuje
 * CSV i XLSX. Kształt wiersza jest ten sam, co przy transakcjach, ale z
 * `rodzajDanych: 'oferta'` i `doZbioru: false`, żeby żadną drogą nie dało się
 * tego wsunąć do zbioru porównawczego.
 *
 * Powierzchnia: jeżeli pliku jej nie ma, liczymy ją z ceny i ceny za metr i
 * mówimy o tym wprost. Rzeczoznawca musi wiedzieć, która liczba jest daną,
 * a która jego własnym dzieleniem.
 */
function odgZWierszy(wiersze, { miasto = '', zrodlo = '', deweloper = '', maks = ODG_MAKS_WIERSZY } = {}) {
  const w0 = (wiersze || []).map(w => (Array.isArray(w) ? w.map(x => String(x ?? '').trim()) : []));
  const niepuste = w0.filter(w => w.length && !w.every(x => x === ''));
  if (!niepuste.length) return { ok: false, powod: 'Plik jest pusty.', oferty: [], razem: 0, pominieto: 0, kolumny: {}, naglowki: [] };
  const naglowki = niepuste[0];
  const m = odgRozpoznajKolumny(naglowki);
  if (m.cena == null && m.cenaM2 == null) {
    return {
      ok: false, kolumny: m, naglowki, oferty: [], razem: 0, pominieto: 0,
      powod: `W pliku nie ma kolumny z ceną. Nagłówki, które znalazłem: ${naglowki.slice(0, 8).join(' | ')}`
        + `${naglowki.length > 8 ? ' …' : ''}`,
    };
  }
  const szukaneMiasto = odgBezOgonkow(miasto);
  const oferty = [];
  let pominieto = 0, poza = 0;

  for (let i = 1; i < niepuste.length && oferty.length < maks; i++) {
    const w = niepuste[i];
    const we = k => (m[k] != null ? w[m[k]] : '');
    const cena = odgLiczba(we('cena'));
    const cenaM2 = odgLiczba(we('cenaM2'));
    let powierzchnia = odgLiczba(we('powierzchnia'));
    let powierzchniaWyliczona = false;
    if (!(powierzchnia > 0) && cena > 0 && cenaM2 > 0) {
      powierzchnia = Math.round(cena / cenaM2 * 100) / 100;
      powierzchniaWyliczona = true;
    }
    if (!(cena > 0) && !(cenaM2 > 0)) { pominieto++; continue; }

    const miejscowosc = odgTekst(we('miejscowosc'));
    if (szukaneMiasto && odgBezOgonkow(miejscowosc) !== szukaneMiasto
        && !odgBezOgonkow(odgAdres(w, m)).includes(szukaneMiasto)) { poza++; continue; }

    const uwagi = ['Cena OFERTOWA z cennika dewelopera — nie jest ceną transakcyjną.'];
    if (powierzchniaWyliczona) uwagi.push('Powierzchnia wyliczona z ceny i ceny za m², bo cennik jej nie podaje.');
    const przed = odgLiczba(we('cenaPrzed'));
    if (przed > 0 && cena > 0 && przed !== cena) {
      uwagi.push(`Cena zmieniona: przed ${Math.round(przed).toLocaleString('pl-PL')} zł, teraz ${Math.round(cena).toLocaleString('pl-PL')} zł.`);
    }

    oferty.push({
      zrodloWiersz: oferty.length + 1,
      rodzajDanych: 'oferta',
      doZbioru: false,
      lokal: odgTekst(we('lokal')),
      adres: odgAdres(w, m) || miejscowosc || odgTekst(we('gmina')),
      miejscowosc,
      gmina: odgTekst(we('gmina')),
      powiat: odgTekst(we('powiat')),
      wojewodztwo: odgTekst(we('wojewodztwo')),
      data: odgData(we('dataAktualizacji')),
      cena: cena != null ? cena : (cenaM2 != null && powierzchnia > 0 ? Math.round(cenaM2 * powierzchnia * 100) / 100 : null),
      powierzchnia: powierzchnia > 0 ? powierzchnia : null,
      powierzchniaWyliczona,
      jednostkowa: cenaM2 != null ? cenaM2
        : (cena > 0 && powierzchnia > 0 ? Math.round(cena / powierzchnia * 100) / 100 : null),
      cenaPrzed: przed,
      rodzaj: odgTekst(we('rodzaj')) || 'lokal mieszkalny',
      deweloper: odgTekst(we('deweloper')) || deweloper,
      prawo: '',
      akt: '',
      kw: '',
      zrodloNazwa: zrodlo,
      uwagiZrodla: uwagi.join(' '),
      uwagi,
    });
  }

  return { ok: true, powod: '', oferty, razem: niepuste.length - 1, pominieto, pozaMiastem: poza, kolumny: m, naglowki };
}

/* --------------------------------------------------------- etapy szukania */

/**
 * Rzeczoznawca ma widzieć, na czym program stoi. Nie „szukam…", a który
 * dokładnie krok, w którym źródle i z jakim wynikiem — bo szukanie potrafi
 * potrwać, a cisza w programie zawsze wygląda jak awaria.
 */
const ODG_ETAPY = [
  { id: 'katalog', nazwa: 'Katalog deweloperów na dane.gov.pl' },
  { id: 'zbiory', nazwa: 'Zbiory z cennikami' },
  { id: 'zasoby', nazwa: 'Pliki w zbiorach' },
  { id: 'plik', nazwa: 'Pobieranie cennika' },
  { id: 'czytanie', nazwa: 'Czytanie cennika' },
  { id: 'koniec', nazwa: 'Podsumowanie' },
];

/**
 * Odmiana po polsku: 1 zbiór, 2–4 zbiory, 5+ zbiorów — a od 12 do 14 znów
 * „zbiorów". Program, który pisze „znalazłem 3 zbiorów", wygląda jak
 * tłumaczony automatem, a ma stać w jednym rzędzie z operatem.
 */
function odgOdmien(n, jeden, dwa, piec) {
  const i = Math.abs(Math.trunc(Number(n) || 0));
  if (i === 1) return jeden;
  const ost = i % 10, dwaOst = i % 100;
  if (ost >= 2 && ost <= 4 && (dwaOst < 12 || dwaOst > 14)) return dwa;
  return piec;
}

function odgEtapOpis(id, dane = {}) {
  const d = dane || {};
  switch (id) {
    case 'katalog': return `Pytam katalog dane.gov.pl o deweloperów${d.miasto ? ` z okolic ${d.miasto}` : ''}.`;
    case 'zbiory': return d.ile != null
      ? `Znalazłem ${d.ile} ${odgOdmien(d.ile, 'zbiór', 'zbiory', 'zbiorów')} z cenami ofertowymi.`
      : 'Szukam zbiorów z cenami ofertowymi.';
    case 'zasoby': return d.nazwa
      ? `Sprawdzam pliki w zbiorze: ${d.nazwa}.`
      : 'Sprawdzam, jakie pliki są w zbiorach.';
    case 'plik': return `Pobieram cennik${d.nazwa ? `: ${d.nazwa}` : ''}${d.format ? ` (${d.format.toUpperCase()})` : ''}.`;
    case 'czytanie': return d.ile != null
      ? `Z cennika${d.nazwa ? ` „${d.nazwa}"` : ''} wczytałem ${d.ile} ${odgOdmien(d.ile, 'ofertę', 'oferty', 'ofert')}.`
      : 'Czytam cennik.';
    case 'koniec': return odgKomunikat(d);
    default: return String(d.opis || '');
  }
}

function odgKomunikat(wynik = {}) {
  const ile = Number(wynik.ile ?? (wynik.oferty || []).length) || 0;
  const zbiorow = Number(wynik.zbiorow ?? 0) || 0;
  if (!ile) {
    return 'Na dane.gov.pl nie znalazłem cennika pasującego do tego miejsca. '
      + 'To nie znaczy, że rynku pierwotnego tu nie ma: obowiązek publikacji dotyczy deweloperów, '
      + 'a przy rynku wtórnym cenników po prostu nie będzie. Zostaje wyciąg ze starostwa albo wpisanie danych ręcznie.';
  }
  return `Z dane.gov.pl wczytałem ${ile} ${odgOdmien(ile, 'ofertę', 'oferty', 'ofert')}`
    + `${zbiorow ? ` z ${zbiorow} ${odgOdmien(zbiorow, 'cennika', 'cenników', 'cenników')}` : ''}. `
    + 'To CENY OFERTOWE — do zbioru porównawczego nie wchodzą. '
    + 'Program użyje ich w analizie rynku pierwotnego i w ocenie, czy ceny drgnęły od ostatnich transakcji.';
}

/** Zdanie do operatu. Bez nazwy dewelopera, adresu pliku i daty jest bezwartościowe. */
function odgOpisZrodla({ deweloper = '', zbior = '', url = '', dataDanych = '', pobrano = new Date() } = {}) {
  const d = new Date(pobrano).toISOString().slice(0, 10);
  const czesci = ['Ceny ofertowe rynku pierwotnego — dane otwarte publikowane na podstawie art. 19b ust. 1 ustawy deweloperskiej'];
  if (deweloper) czesci.push(`przez ${deweloper}`);
  czesci.push('w serwisie dane.gov.pl');
  if (zbior) czesci.push(`(zbiór: ${zbior})`);
  if (url) czesci.push(`plik: ${url}`);
  if (dataDanych) czesci.push(`stan cennika na ${dataDanych}`);
  czesci.push(`pobrano ${d}`);
  return `${czesci.join(', ')}.`;
}

/**
 * Statystyka rynku ofertowego. Mediana, nie średnia: jeden penthouse w
 * cenniku przesuwa średnią tak, że liczba przestaje opisywać rynek.
 */
function odgStatystyka(oferty = []) {
  const ceny = (oferty || []).map(o => o.jednostkowa).filter(x => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (!ceny.length) return { ile: 0, mediana: null, min: null, max: null };
  const s = ceny.length % 2 ? ceny[(ceny.length - 1) / 2] : (ceny[ceny.length / 2 - 1] + ceny[ceny.length / 2]) / 2;
  return {
    ile: ceny.length,
    mediana: Math.round(s),
    min: Math.round(ceny[0]),
    max: Math.round(ceny[ceny.length - 1]),
  };
}

const API_ODG = {
  API: ODG_API, MAKS_WIERSZY: ODG_MAKS_WIERSZY, ETAPY: ODG_ETAPY, KOLUMNY: ODG_KOLUMNY,
  urlInstytucje: odgUrlInstytucje, urlZbiory: odgUrlZbiory, urlZbioryInstytucji: odgUrlZbioryInstytucji,
  urlZasoby: odgUrlZasoby, urlPliku: odgUrlPliku,
  zInstytucji: odgZInstytucji, zZbiorow: odgZZbiorow, zZasobow: odgZZasobow, wybierzZasob: odgWybierzZasob,
  csv: odgCsv, separator: odgSeparator, rozpoznajKolumny: odgRozpoznajKolumny, zCsv: odgZCsv, zWierszy: odgZWierszy,
  liczba: odgLiczba, data: odgData, puste: odgPuste, bezOgonkow: odgBezOgonkow, adres: odgAdres,
  etapOpis: odgEtapOpis, odmien: odgOdmien, komunikat: odgKomunikat, opisZrodla: odgOpisZrodla, statystyka: odgStatystyka,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_ODG;
if (typeof window !== 'undefined') window.OperoOferty = API_ODG;

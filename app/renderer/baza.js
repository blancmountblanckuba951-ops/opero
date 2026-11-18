'use strict';
/* ============================================================================
   OPERO — WŁASNA BAZA TRANSAKCJI
   ----------------------------------------------------------------------------
   Rzeczoznawca buduje swoją bazę rynku latami i to ona jest jego prawdziwym
   kapitałem. Do tej pory program tego nie widział: wyciąg z RCiWN wchodził do
   jednego operatu i znikał razem z nim. Przy następnej wycenie w tej samej
   dzielnicy wszystko zaczynało się od zera.

   Od teraz każda wczytana transakcja zostaje. Baza leży na TYM komputerze,
   w zwykłym pliku JSON obok reszty danych — nie w chmurze, nie u nas, nie
   u nikogo. Nikt jej nie wyłączy i nikt poza Tobą jej nie zobaczy.

   Trzy zasady, których ten moduł pilnuje:

   1. NIC SIĘ NIE DUBLUJE. Ten sam wyciąg wczytany drugi raz nie robi z jednej
      transakcji dwóch. Rozpoznajemy ją po akcie notarialnym, a gdy aktu nie
      ma — po dacie, adresie, cenie i powierzchni razem.

   2. NIC SIĘ NIE GUBI. Przy każdej transakcji zostaje ślad: z jakiego pliku,
      z którego wiersza i kiedy weszła. W operacie trzeba umieć wskazać źródło
      każdej liczby, także tej sprzed dwóch lat.

   3. PROGRAM NIE DOBIERA TRANSAKCJI ZA RZECZOZNAWCĘ. Podpowiada kandydatów —
      ten sam rynek, zbliżona powierzchnia, sensowny okres — i mówi, dlaczego
      kogoś podpowiada. Zaznacza człowiek.
   ========================================================================= */

/** Ile miesięcy wstecz sięgamy, podpowiadając transakcje do nowej wyceny. */
const OKRES_MIESIECY = 24;
/** O ile procent powierzchnia podobnej może odbiegać od wycenianej. */
const TOLERANCJA_POWIERZCHNI = 0.5;

function uprosc(tekst) {
  return String(tekst || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(ul|ulica|al|aleja|pl|plac|os|osiedle)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function liczba(v) {
  // Pustego pola NIE wolno zamienić w zero: Number(null) i Number('') dają 0,
  // a zero w cenie albo powierzchni to nie „zero złotych", tylko brak danych.
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function dzien(v) { const t = String(v || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : ''; }

/**
 * Odcisk transakcji — po nim poznajemy, że to ta sama pozycja.
 * Akt notarialny jest najpewniejszy: jeden akt to jedna czynność. Gdy go nie
 * ma (a w wyciągach bywa pusty), bierzemy datę, adres, cenę i powierzchnię
 * razem. Sam adres nie wystarczy — pod jednym adresem sprzedaje się
 * kilkanaście mieszkań.
 */
function odcisk(t) {
  const akt = uprosc(t && (t.akt || t.aktNotarialny));
  if (akt) return `akt:${akt}`;
  return ['d', dzien(t && t.data), uprosc(t && t.adres), Math.round(liczba(t && t.cena) || 0),
    Math.round((liczba(t && t.powierzchnia) || 0) * 100)].join('|');
}

/** Transakcje z wyciągu RCiWN w postaci, w jakiej mają leżeć w bazie. */
function zWyciagu(wiersze, meta = {}) {
  const plik = String(meta.plik || '').trim();
  const kiedy = String(meta.kiedy || new Date().toISOString());
  return (wiersze || []).map(t => {
    const powierzchnia = liczba(t.powierzchnia);
    const cena = liczba(t.cena);
    const jednostkowa = liczba(t.jednostkowa) ?? (powierzchnia > 0 && cena != null ? Math.round(cena / powierzchnia * 100) / 100 : null);
    return {
      adres: String(t.adres || '').trim(),
      miejscowosc: String(t.miejscowosc || '').trim(),
      obreb: String(t.obreb || '').trim(),
      data: dzien(t.data),
      cena, powierzchnia, jednostkowa,
      prawo: String(t.prawo || '').trim(),
      rodzaj: String(t.rodzaj || '').trim(),
      akt: String(t.akt || '').trim(),
      kw: String(t.kw || '').trim(),
      uwagi: Array.isArray(t.uwagi) ? t.uwagi.slice() : (t.uwagiZrodla ? [String(t.uwagiZrodla)] : []),
      zrodlo: { plik, wiersz: t.zrodloWiersz ?? null },
      dodano: kiedy,
    };
  }).filter(t => t.data && t.jednostkowa > 0);
}

/**
 * Dołożenie nowych transakcji do bazy. Zwracamy, ile faktycznie przybyło i ile
 * już tam było — bo „wczytano 120 transakcji", gdy 118 z nich już leżało w
 * bazie, jest informacją nieprawdziwą w sposób, który się później mści.
 */
function scal(baza, nowe) {
  const wpisy = Array.isArray(baza) ? baza.slice() : [];
  const znane = new Set(wpisy.map(odcisk));
  const dodane = [];
  const pominiete = [];
  for (const t of nowe || []) {
    const o = odcisk(t);
    if (znane.has(o)) { pominiete.push(t); continue; }
    znane.add(o);
    const wpis = { ...t, id: t.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` };
    wpisy.push(wpis);
    dodane.push(wpis);
  }
  return { wpisy, dodane: dodane.length, pominiete: pominiete.length };
}

/* ------------------------------------------------------------- szukanie */

function filtruj(wpisy, filtr = {}) {
  const q = uprosc(filtr.tekst);
  const miasto = uprosc(filtr.miejscowosc);
  const odData = dzien(filtr.odData), doData = dzien(filtr.doData);
  const powOd = liczba(filtr.powOd), powDo = liczba(filtr.powDo);
  const prawo = uprosc(filtr.prawo);
  return (wpisy || []).filter(t => {
    if (miasto && !uprosc(`${t.miejscowosc} ${t.adres}`).includes(miasto)) return false;
    if (q && !uprosc(`${t.adres} ${t.miejscowosc} ${t.akt} ${t.kw} ${t.prawo} ${(t.uwagi || []).join(' ')}`).includes(q)) return false;
    if (odData && String(t.data) < odData) return false;
    if (doData && String(t.data) > doData) return false;
    if (powOd != null && !(liczba(t.powierzchnia) >= powOd)) return false;
    if (powDo != null && !(liczba(t.powierzchnia) <= powDo)) return false;
    if (prawo && !uprosc(t.prawo).includes(prawo)) return false;
    return true;
  });
}

function mediana(liczby) {
  const l = (liczby || []).filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  if (!l.length) return null;
  const s = Math.floor(l.length / 2);
  return l.length % 2 ? l[s] : Math.round((l[s - 1] + l[s]) / 2 * 100) / 100;
}

/** Co właściwie jest w bazie — żeby było widać, czy jest z czego wyceniać. */
function statystyki(wpisy) {
  const l = Array.isArray(wpisy) ? wpisy : [];
  const daty = l.map(t => t.data).filter(Boolean).sort();
  const licznik = new Map();
  for (const t of l) {
    const m = String(t.miejscowosc || '—').trim() || '—';
    licznik.set(m, (licznik.get(m) || 0) + 1);
  }
  return {
    ile: l.length,
    odData: daty[0] || '', doData: daty[daty.length - 1] || '',
    mediana: mediana(l.map(t => liczba(t.jednostkowa))),
    miejscowosci: [...licznik.entries()].sort((a, b) => b[1] - a[1]).map(([nazwa, ile]) => ({ nazwa, ile })),
  };
}

/**
 * Rodzaj prawa sprowadzony do kategorii. Porównywanie napisów wprost nie
 * działa: „spółdzielcze własnościowe" ZAWIERA słowo „własnoś", więc proste
 * sprawdzenie uznałoby je za to samo co własność — a to dwa różne produkty
 * rynkowe, o różnych cenach, i pomylenie ich jest zarzutem do operatu.
 */
function rodzajPrawa(tekst) {
  const t = uprosc(tekst);
  if (!t) return '';
  if (t.includes('spoldziel')) return 'spoldzielcze';
  if (t.includes('uzytkowan') && t.includes('wieczyst')) return 'uzytkowanie wieczyste';
  if (t.includes('wlasnosc') || t.includes('wlasnosci')) return 'wlasnosc';
  return t;
}

/** Ile miesięcy wstecz od daty wyceny leży transakcja. */
function miesiecyWstecz(data, dataWyceny) {
  const a = Date.parse(dzien(data)), b = Date.parse(dzien(dataWyceny) || new Date().toISOString().slice(0, 10));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / (30.4375 * 86400000) * 10) / 10;
}

/**
 * Kandydaci do nowej wyceny. PROGRAM NIKOGO NIE WYBIERA — układa listę od
 * najbliższych i przy każdym pisze, dlaczego go podpowiada albo co budzi
 * wątpliwość. Zaznacza rzeczoznawca, bo to on odpowiada za dobór.
 */
function dopasuj(wpisy, przedmiot = {}) {
  const miasto = uprosc(przedmiot.miejscowosc);
  const powierzchnia = liczba(przedmiot.powierzchnia);
  const dataWyceny = dzien(przedmiot.dataWyceny) || new Date().toISOString().slice(0, 10);
  const okres = liczba(przedmiot.okresMiesiecy) || OKRES_MIESIECY;
  const out = [];
  for (const t of wpisy || []) {
    const wiek = miesiecyWstecz(t.data, dataWyceny);
    if (wiek == null || wiek < 0 || wiek > okres) continue;
    if (miasto && !uprosc(`${t.miejscowosc} ${t.adres}`).includes(miasto)) continue;
    let odchylenie = null;
    if (powierzchnia > 0 && liczba(t.powierzchnia) > 0) {
      odchylenie = Math.abs(t.powierzchnia - powierzchnia) / powierzchnia;
      // Gdy okno szukania poda WLASNY pas (z zapasem), rzadzi on, a nie
      // domyslna tolerancja tego modulu. Inaczej wlasna baza odsiewalaby
      // pozycje, ktore dobor nieruchomosci podobnych i tak chce obejrzec,
      // i zapas dzialalby tylko dla rejestru, a dla wlasnej bazy nie.
      const od = liczba(przedmiot.powOd), do_ = liczba(przedmiot.powDo);
      if (od != null && do_ != null) {
        if (t.powierzchnia < od || t.powierzchnia > do_) continue;
      } else if (odchylenie > TOLERANCJA_POWIERZCHNI) continue;
    }
    const powody = [`${wiek} mies. przed datą wyceny`];
    if (odchylenie != null) powody.push(`powierzchnia ${t.powierzchnia} m² (${odchylenie === 0 ? 'tyle samo' : `${Math.round(odchylenie * 100)}% różnicy`})`);
    if (przedmiot.prawo && rodzajPrawa(t.prawo) && rodzajPrawa(t.prawo) !== rodzajPrawa(przedmiot.prawo)) {
      powody.push(`UWAGA: inne prawo — ${t.prawo}`);
    }
    // Im swiezsza i blizsza powierzchnia, tym wyzej. Czas wazy mocniej:
    // transakcja sprzed dwoch lat jest trudniejsza do obrony niz o 20% wiekszy metraz.
    const punkty = Math.round((1 - wiek / okres) * 60 + (odchylenie == null ? 20 : (1 - odchylenie / TOLERANCJA_POWIERZCHNI) * 40));
    out.push({ ...t, wiek, odchylenie, powody, punkty });
  }
  return out.sort((a, b) => b.punkty - a.punkty);
}

/** Transakcje z bazy w postaci, której oczekuje operat. */
function doOperatu(wpisy, zaczynajOdId = 1) {
  return (wpisy || []).map((t, i) => ({
    id: zaczynajOdId + i,
    address: t.adres || t.miejscowosc || 'pozycja z bazy',
    date: t.data,
    area: Number(liczba(t.powierzchnia) || 0),
    roomsFloor: '',
    priceUnit: Number(liczba(t.jednostkowa) || 0),
    monthsToValuation: 0,
    autoMonthsToValuation: true,
    featureRatings: {},
    zrodlo: { wiersz: t.zrodlo?.wiersz ?? null, akt: t.akt || null, kw: t.kw || null,
      uwagi: [...(t.uwagi || []), t.zrodlo?.plik ? `Z własnej bazy transakcji (${t.zrodlo.plik}).` : 'Z własnej bazy transakcji.'] },
  }));
}

/** Eksport do arkusza. Baza jest Twoja — ma dać się z programu wynieść. */
function doCsv(wpisy) {
  const naglowek = ['data', 'adres', 'miejscowosc', 'powierzchnia', 'cena', 'cena jednostkowa', 'prawo', 'rodzaj', 'akt', 'kw', 'plik zrodlowy'];
  const pole = (v) => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const wiersze = (wpisy || []).map(t => [t.data, t.adres, t.miejscowosc, t.powierzchnia, t.cena,
    t.jednostkowa, t.prawo, t.rodzaj, t.akt, t.kw, t.zrodlo?.plik || ''].map(pole).join(';'));
  // Srednik i BOM, bo ten plik otwiera sie w polskim Excelu, a nie w edytorze.
  return '﻿' + [naglowek.join(';'), ...wiersze].join('\r\n') + '\r\n';
}

const API_BAZA = {
  OKRES_MIESIECY, TOLERANCJA_POWIERZCHNI,
  odcisk, zWyciagu, scal, filtruj, statystyki, dopasuj, doOperatu, doCsv, rodzajPrawa,
  mediana, miesiecyWstecz, uprosc,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_BAZA;
if (typeof window !== 'undefined') window.OperoBaza = API_BAZA;

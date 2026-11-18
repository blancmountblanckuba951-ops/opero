'use strict';
/* ============================================================================
   OPERO — ADRES Z DRUGIEGO ŹRÓDŁA (OpenStreetMap)
   ----------------------------------------------------------------------------
   Pierwszym źródłem adresów jest państwowy rejestr punktów adresowych (GUGiK).
   Bywa wyłączony i nie zna każdej nowej ulicy. Wtedy rzeczoznawca może jednym
   kliknięciem zapytać drugie, bezpłatne źródło — OpenStreetMap (Nominatim).

   DLACZEGO NIE GOOGLE
   Podpowiedzi adresów Google wymagają własnego klucza i konta rozliczeniowego
   z kartą u każdego użytkownika programu, a ponad miesięczny limit są płatne.
   Program sprzedawany wielu rzeczoznawcom nie może się na tym opierać.

   ZASADY, KTÓRYCH TEN MODUŁ PILNUJE (to są warunki usługi, nie uprzejmość)
   1. Pytamy TYLKO po kliknięciu przycisku. Publiczny Nominatim zabrania
      podpowiadania przy każdym naciśnięciu klawisza.
   2. Najwyżej jedno zapytanie na sekundę, a ta sama fraza nie idzie drugi raz.
   3. Program przedstawia się z nazwy i pokazuje, skąd są dane
      („© autorzy OpenStreetMap").
   ========================================================================= */

const OSM_USLUGA = 'https://nominatim.openstreetmap.org/search';
const OSM_ODSTEP_MS = 1100;
const OSM_MAKS = 15;
const OSM_PODPIS = '© autorzy OpenStreetMap';

function osmTekst(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }

/** Adres zapytania albo '' gdy nie ma o co pytać. */
function osmZapytanie({ ulica = '', numer = '', miasto = '' } = {}) {
  const u = osmTekst(ulica), n = osmTekst(numer), m = osmTekst(miasto);
  if (u.replace(/[^\p{L}\p{N}]/gu, '').length < 3) return '';
  const p = new URLSearchParams({
    format: 'jsonv2', addressdetails: '1', countrycodes: 'pl',
    limit: String(OSM_MAKS), 'accept-language': 'pl',
  });
  if (m) { p.set('street', n ? `${n} ${u}` : u); p.set('city', m); }
  else p.set('q', n ? `${u} ${n}` : u);
  return `${OSM_USLUGA}?${p.toString()}`;
}

function osmBezPrzedrostka(nazwa, przedrostek) {
  return osmTekst(String(nazwa || '').replace(przedrostek, ''));
}

/**
 * Odpowiedź Nominatim → pozycje w tym samym kształcie co z rejestru GUGiK,
 * żeby dalej szła jedna droga (ta sama lista, ten sam wybór, te same zasady
 * o numerze). Współrzędnych NIE przepisujemy: OSM podaje stopnie, a program
 * liczy odległości w metrach układu państwowego — punkt ustali potem rejestr.
 */
function osmZOdpowiedzi(odpowiedz) {
  let dane = odpowiedz;
  if (typeof odpowiedz === 'string') {
    try { dane = JSON.parse(odpowiedz.replace(/^﻿/, '')); } catch { return []; }
  }
  if (!Array.isArray(dane)) return [];
  const widziane = new Set();
  const out = [];
  for (const w of dane) {
    const a = w && w.address;
    if (!a || typeof a !== 'object') continue;
    if (a.country_code && String(a.country_code).toLowerCase() !== 'pl') continue;
    const ulica = osmBezPrzedrostka(a.road ?? a.pedestrian ?? a.residential ?? a.footway ?? a.square ?? '',
      /^(ulica|ul\.|aleja|al\.|plac|pl\.)\s+/i);
    const miasto = osmTekst(a.city ?? a.town ?? a.village ?? a.hamlet ?? a.municipality ?? '');
    if (!ulica && !miasto) continue;
    const k = {
      ulica, miasto,
      numer: osmTekst(a.house_number ?? ''),
      dzielnica: osmTekst(a.suburb ?? a.city_district ?? a.quarter ?? a.neighbourhood ?? ''),
      gmina: osmBezPrzedrostka(a.municipality ?? '', /^gmina\s+/i),
      powiat: osmBezPrzedrostka(a.county ?? '', /^powiat\s+/i),
      wojewodztwo: osmBezPrzedrostka(a.state ?? '', /^województwo\s+/i),
      kod: /^\d{2}-\d{3}$/.test(osmTekst(a.postcode)) ? osmTekst(a.postcode) : '',
      teryt: '', x: NaN, y: NaN,
      zrodlo: 'osm',
    };
    const klucz = `${k.ulica}|${k.numer}|${k.miasto}|${k.dzielnica}`.toLowerCase();
    if (widziane.has(klucz)) continue;
    widziane.add(klucz);
    out.push(k);
  }
  return out.slice(0, OSM_MAKS);
}

/** Położenie pierwszej polskiej pozycji z odpowiedzi — stopnie, nie metry. */
function osmPunkt(odpowiedz) {
  let dane = odpowiedz;
  if (typeof odpowiedz === 'string') { try { dane = JSON.parse(odpowiedz); } catch { return null; } }
  if (!Array.isArray(dane)) return null;
  for (const w of dane) {
    const kraj = w && w.address && w.address.country_code;
    if (kraj && String(kraj).toLowerCase() !== 'pl') continue;
    const lat = Number(w && w.lat), lon = Number(w && w.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && lat > 48.9 && lat < 55 && lon > 14 && lon < 24.3) {
      return { lat, lon, opis: String((w && w.display_name) || '').slice(0, 200), dokladny: !!(w.address && w.address.house_number) };
    }
  }
  return null;
}

/** Ile jeszcze czekać, żeby nie przekroczyć jednego zapytania na sekundę. */
function osmIleCzekac(ostatnieMs, terazMs = Date.now()) {
  if (!Number.isFinite(ostatnieMs) || ostatnieMs <= 0) return 0;
  return Math.max(0, OSM_ODSTEP_MS - (terazMs - ostatnieMs));
}

const API_OSM = {
  USLUGA: OSM_USLUGA, ODSTEP_MS: OSM_ODSTEP_MS, MAKS: OSM_MAKS, PODPIS: OSM_PODPIS,
  zapytanie: osmZapytanie, zOdpowiedzi: osmZOdpowiedzi, ileCzekac: osmIleCzekac, punkt: osmPunkt,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_OSM;
if (typeof window !== 'undefined') window.OperoAdresOsm = API_OSM;

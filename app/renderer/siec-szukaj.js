'use strict';
/* ============================================================================
   OPERO — PER SZUKA W INTERNECIE
   ----------------------------------------------------------------------------
   Przy każdym polu opisowym jest przycisk „Szukaj w internecie". Program
   układa zapytanie z adresu i tematu pola, pyta wyszukiwarkę i pokazuje
   wyniki ze źródłami. Rzeczoznawca zaznacza te, które uznaje za wiarygodne,
   a PER pisze z nich tekst — z listą źródeł.

   WYSZUKIWARKA
   Brave Search (oficjalne API). Wymaga klucza, który użytkownik zakłada na
   stronie Brave i wpisuje raz w Ustawieniach. Google wyłącza swoje API
   wyszukiwania 1 stycznia 2027 r. i nie przyjmuje nowych użytkowników,
   dlatego program się na nim nie opiera.

   DLACZEGO WYNIKI NIE WCHODZĄ SAME DO OPERATU
   Internet nie jest rejestrem. Forum, stare ogłoszenie i strona urzędu
   wyglądają w wynikach tak samo. Dlatego: program szuka i podaje, człowiek
   wybiera źródła, a tekst z internetu ZAWSZE idzie do podglądu przed
   wstawieniem i zawsze ma dopisane, skąd pochodzi.
   ========================================================================= */

const SIEC_USLUGA = 'https://api.search.brave.com/res/v1/web/search';
const SIEC_MAKS = 8;

function siecTekst(v) { return String(v ?? '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim(); }

/** Tematy zapytań dla części operatu. `{…}` to dane z operatu. */
const SIEC_TEMATY = [
  ['location.', '{dzielnica} {miasto} {ulica} okolica komunikacja infrastruktura'],
  ['planning.', 'miejscowy plan zagospodarowania przestrzennego {miasto} {dzielnica} {ulica} uchwała'],
  ['building.', '"{ulica} {numer}" {miasto} budynek inwestycja rok budowy'],
  ['local.', '"{ulica} {numer}" {miasto} mieszkania standard budynek'],
  ['market.', 'rynek mieszkań {miasto} {dzielnica} ceny transakcyjne {rok}'],
  ['narratives.market', 'rynek mieszkań {miasto} {dzielnica} ceny transakcyjne {rok}'],
  ['egib.', 'geoportal {miasto} obręb {obreb} działka {dzialka}'],
];

/** Zapytanie dla pola: temat + dane operatu, bez pustych miejsc. */
function siecZapytanie(cel, dane = {}) {
  const wzor = (SIEC_TEMATY.find(([p]) => String(cel || '').startsWith(p)) || [null, '{ulica} {numer} {miasto} {dzielnica}'])[1];
  const d = { rok: String(new Date().getFullYear()), ...dane };
  return wzor.replace(/\{(\w+)\}/g, (_, k) => siecTekst(d[k])).replace(/""/g, '').replace(/"\s+"/g, ' ').replace(/"\s*"/g, '').replace(/\s+/g, ' ').replace(/"\s/g, '" ').trim();
}

function siecUrl(zapytanie) {
  const q = siecTekst(zapytanie).slice(0, 300);
  if (q.replace(/[^\p{L}\p{N}]/gu, '').length < 4) return '';
  const p = new URLSearchParams({ q, country: 'pl', search_lang: 'pl', count: String(SIEC_MAKS), safesearch: 'moderate' });
  return `${SIEC_USLUGA}?${p.toString()}`;
}

/** Odpowiedź wyszukiwarki → wyniki: tytuł, opis, adres, domena. */
function siecZOdpowiedzi(odpowiedz) {
  let dane = odpowiedz;
  if (typeof odpowiedz === 'string') { try { dane = JSON.parse(odpowiedz); } catch { return { ok: false, powod: 'Wyszukiwarka odpowiedziała nieczytelnie.', wyniki: [] }; } }
  const lista = dane && dane.web && Array.isArray(dane.web.results) ? dane.web.results : null;
  if (!lista) return { ok: false, powod: siecTekst(dane && (dane.message || (dane.error && (dane.error.detail || dane.error.message)))) || 'Wyszukiwarka nie zwróciła wyników.', wyniki: [] };
  const wyniki = [];
  const widziane = new Set();
  for (const w of lista) {
    const adres = String((w && w.url) || '');
    let domena = '';
    try { const u = new URL(adres); if (u.protocol !== 'https:' && u.protocol !== 'http:') continue; domena = u.hostname.replace(/^www\./, ''); } catch { continue; }
    if (widziane.has(adres)) continue; widziane.add(adres);
    const opis = siecTekst(w.description).slice(0, 400);
    const tytul = siecTekst(w.title).slice(0, 160);
    if (!tytul && !opis) continue;
    wyniki.push({ tytul, opis, adres, domena, urzedowe: /\.gov\.pl$|(^|\.)bip\.|geoportal|\.sejm\.|stat\.gov|gugik/.test(domena) });
  }
  // Strony urzędowe na górę: są najbliżej tego, co wolno cytować w operacie.
  wyniki.sort((a, b) => Number(b.urzedowe) - Number(a.urzedowe));
  return { ok: true, powod: '', wyniki: wyniki.slice(0, SIEC_MAKS) };
}

/** Wybrane wyniki jako fakty dla PER — każdy ze źródłem. */
function siecFakty(wybrane) {
  return (wybrane || []).filter(w => w && (w.opis || w.tytul)).map(w => ({
    nazwa: `z internetu (${w.domena})`, wartosc: `${w.tytul ? `${w.tytul}. ` : ''}${w.opis}`.slice(0, 600), liczba: null,
  }));
}

/** Dopisek pod tekstem i pozycja do źródeł operatu. */
function siecZrodla(wybrane, dzien = '') {
  const d = dzien || new Date().toLocaleDateString('pl-PL');
  return (wybrane || []).map(w => `${w.domena} — ${w.tytul || 'strona'} (${w.adres}), dostęp ${d}`);
}

function siecKomunikatBledu(status) {
  if (status === 401 || status === 403) return 'Wyszukiwarka odrzuciła klucz. Sprawdź klucz Brave Search w Ustawieniach.';
  if (status === 429) return 'Limit zapytań wyszukiwarki na ten okres został wyczerpany.';
  if (status === 422) return 'Wyszukiwarka nie przyjęła zapytania — skróć je albo uprość.';
  return `Wyszukiwarka odpowiedziała błędem ${status}.`;
}

const API_SIEC = { USLUGA: SIEC_USLUGA, MAKS: SIEC_MAKS, TEMATY: SIEC_TEMATY, zapytanie: siecZapytanie, url: siecUrl, zOdpowiedzi: siecZOdpowiedzi, fakty: siecFakty, zrodla: siecZrodla, komunikatBledu: siecKomunikatBledu, tekst: siecTekst };
if (typeof module !== 'undefined' && module.exports) module.exports = API_SIEC;
if (typeof window !== 'undefined') window.OperoSiec = API_SIEC;

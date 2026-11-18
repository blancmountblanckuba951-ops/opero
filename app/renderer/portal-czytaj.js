'use strict';
/* ============================================================================
   OPERO — OKNO PORTALU: PROGRAM CZYTA STRONĘ, KTÓRĄ WIDZISZ
   ----------------------------------------------------------------------------
   Program sam układa wyszukiwanie według kryteriów operatu i otwiera portal
   we własnym oknie. Rzeczoznawca widzi stronę tak jak w przeglądarce. Jeden
   przycisk — „Wczytaj oferty z tej strony" — i program czyta tekst strony,
   wyciąga z niego oferty (cena, powierzchnia, pokoje, piętro, adres) i
   podaje je do decyzji. Bez zaznaczania, kopiowania i wklejania.

   CZYM TO JEST, A CZYM NIE
     * Program czyta TĘ JEDNĄ stronę, którą człowiek otworzył i ma przed
       oczami — tak jak czytałby wklejony tekst. Nie chodzi po portalu sam,
       nie pobiera stron w tle i nie przegląda kolejnych wyników bez kliknięcia.
     * To są CENY OFERTOWE. Każda pozycja idzie do decyzji rzeczoznawcy
       i nigdy sama do zbioru porównawczego.
   ========================================================================= */

/** Adresy wyszukiwania. `sposob: 'google'` = pytamy wyszukiwarkę o ten portal. */
const PC_PORTALE = [
  { id: 'otodom', nazwa: 'Otodom', rodzaj: 'oferty',
    url: ({ miasto, dzielnica, powOd, powDo, pokoje }) => {
      const q = encodeURIComponent(['mieszkanie sprzedaż', miasto, dzielnica, powOd && powDo ? `${powOd}-${powDo} m2` : '', pokoje ? `${pokoje} pokoje` : ''].filter(Boolean).join(' '));
      return `https://www.google.com/search?q=site%3Aotodom.pl+${q}`;
    } },
  { id: 'olx', nazwa: 'OLX', rodzaj: 'oferty',
    url: ({ miasto, dzielnica, pokoje }) => `https://www.olx.pl/nieruchomosci/mieszkania/sprzedaz/q-${encodeURIComponent([miasto, dzielnica, pokoje ? `${pokoje} pokoje` : ''].filter(Boolean).join(' '))}/` },
  { id: 'deweloperuch', nazwa: 'Deweloperuch', rodzaj: 'transakcje i oferty',
    url: () => 'https://deweloperuch.pl/' },
];

function pcTekst(v) { return String(v ?? '').replace(/[  ]/g, ' ').replace(/[ \t]+/g, ' ').trim(); }
function pcLiczba(t) { const n = Number(String(t || '').replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.')); return Number.isFinite(n) ? n : 0; }

function pcAdresPortalu(id, kryteria = {}) {
  const p = PC_PORTALE.find(x => x.id === id);
  return p ? p.url(kryteria || {}) : '';
}

/** Czy adres wolno otworzyć w oknie programu: tylko https i zwykła strona. */
function pcAdresDozwolony(url) {
  try { const u = new URL(String(url || '')); return u.protocol === 'https:' && !!u.hostname && !/^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname); }
  catch { return false; }
}

const PC_CENA = /(\d{1,3}(?:[ .]\d{3})+|\d{5,8})(?:,\d{2})?\s*(?:zł|PLN)(?!\s*\/\s*m)/i;
const PC_CENA_M2 = /(\d{1,3}(?:[ .]\d{3})*|\d{4,6})(?:,\d{1,2})?\s*zł\s*\/\s*m/i;
const PC_POW = /(\d{2,4}(?:[.,]\d{1,2})?)\s*m(?:²|2|\b)(?!\s*\/)/i;
const PC_POKOJE = /(\d{1,2})\s*(?:pok(?:oje|ój|oi|\.)|-?\s*pokojow)/i;
const PC_PIETRO = /(?:pi[ęe]tro\s*:?\s*(\d{1,2}|parter)|(\d{1,2})\s*(?:\/\s*\d{1,2}\s*)?pi[ęe]tro|\b(parter)\b)/i;

/**
 * Tekst strony → oferty. Kotwicą jest CENA: każda cena całkowita otwiera
 * nową ofertę, a jej dane to wiersze stojące najbliżej (do następnej ceny).
 * Oferta bez powierzchni jest pomijana — bez niej nie ma ceny za metr.
 */
function pcOfertyZTekstu(tekst, { miasto = '', zrodlo = '', dzien = '' } = {}) {
  const linie = String(tekst || '').replace(/\r/g, '').split('\n').map(pcTekst).filter(Boolean);
  const data = dzien || new Date().toISOString().slice(0, 10);
  const ceny = [];
  linie.forEach((l, i) => { const m = PC_CENA.exec(l); if (m) { const c = pcLiczba(m[1]); if (c >= 30000 && c <= 50000000) ceny.push({ i, cena: c }); } });
  const oferty = [], widziane = new Set(), pominiete = [], zajete = new Set();
  const m1 = pcTekst(miasto).toLowerCase();
  // Układ strony: czy metraż stoi ZA ceną, czy PRZED nią. Rozstrzyga ostatnia
  // oferta — za jej ceną nie ma już następnej, więc metraż tam znaczy „za".
  const ost = ceny[ceny.length - 1];
  const daneZaCena = !ost || PC_POW.test(linie.slice(ost.i, ost.i + 7).join(' · ').replace(PC_CENA_M2, ' '));
  ceny.forEach((c, n) => {
    const od = Math.max(n ? ceny[n - 1].i + 1 : 0, c.i - 4);
    const dol = Math.min(n + 1 < ceny.length ? ceny[n + 1].i - 1 : linie.length - 1, c.i + 6);
    // Dane oferty stoją ZA ceną albo PRZED nią — zależnie od portalu. Najpierw
    // szukamy za ceną; wiersze użyte przez poprzednią ofertę są już zajęte,
    // żeby jej metraż nie przeszedł na następną.
    const wolne = (i) => !zajete.has(i);
    const za = []; for (let i = c.i; i <= dol; i++) if (wolne(i)) za.push(i);
    const przed = []; for (let i = od; i < c.i; i++) if (wolne(i)) przed.push(i);
    const bezM2 = (ix) => ix.map(i => linie[i]).join(' · ').replace(PC_CENA_M2, ' ');
    let uzyte, pow;
    if (daneZaCena) { uzyte = za; pow = PC_POW.exec(bezM2(za)); if (!pow) { pow = PC_POW.exec(bezM2(przed)); uzyte = [...przed, c.i]; } }
    else { uzyte = [...przed, c.i]; pow = PC_POW.exec(bezM2(uzyte)); if (!pow) { pow = PC_POW.exec(bezM2(za)); uzyte = za; } }
    if (!pow) { pominiete.push({ cena: c.cena, powod: 'brak powierzchni przy cenie' }); return; }
    // Tytuł i adres mogą stać po drugiej stronie ceny niż metraż.
    const blokIx = (daneZaCena ? [...new Set([...przed, ...uzyte])] : uzyte).slice().sort((x, y) => x - y);
    const blok = blokIx.map(i => linie[i]);
    const calosc = uzyte.map(i => linie[i]).join(' · ');
    const powierzchnia = pcLiczba(pow[1]);
    if (powierzchnia < 10 || powierzchnia > 1000) { pominiete.push({ cena: c.cena, powod: 'powierzchnia poza zakresem' }); return; }
    const jednostkowa = Math.round(c.cena / powierzchnia);
    // Cena za metr poza rozsądnym zakresem = to nie cena mieszkania (czynsz, rata, kaucja).
    if (jednostkowa < 1500 || jednostkowa > 80000) { pominiete.push({ cena: c.cena, powod: 'cena za m² poza zakresem' }); return; }
    for (const i of blokIx) zajete.add(i);
    const klucz = `${c.cena}|${powierzchnia}`;
    if (widziane.has(klucz)) return;
    widziane.add(klucz);
    const pok = PC_POKOJE.exec(calosc), pie = PC_PIETRO.exec(calosc);
    const pietro = pie ? (pie[1] || pie[2] || pie[3] || '') : '';
    const adres = blok.find(l => (m1 && l.toLowerCase().includes(m1) && l.length < 120 && !PC_CENA.test(l)) || /^(ul\.|al\.|os\.|pl\.)\s/i.test(l)) || '';
    const tytul = blok.find(l => l.length > 12 && l.length < 140 && !PC_CENA.test(l) && !PC_POW.test(l) && l !== adres) || '';
    oferty.push({
      zrodloWiersz: oferty.length + 1,
      adres: adres || tytul || '[adres do uzupełnienia]', miejscowosc: pcTekst(miasto),
      data, cena: c.cena, powierzchnia, jednostkowa,
      pokoje: pok ? Number(pok[1]) : null,
      pietro: /parter/i.test(pietro) ? 0 : (pietro !== '' ? Number(pietro) : null),
      prawo: '', rodzaj: 'oferta sprzedaży', akt: '', kw: '',
      przepisane: true, rodzajZrodla: 'oferty', zrodloNazwa: pcTekst(zrodlo), tytul,
      uwagi: [`Cena OFERTOWA odczytana ze strony ${pcTekst(zrodlo) || 'portalu'} w dniu ${data}.`],
      uwagiZrodla: `Cena ofertowa odczytana przez program ze strony ${pcTekst(zrodlo) || 'portalu'} otwartej przez rzeczoznawcę w dniu ${data}. `
        + 'To nie jest cena transakcyjna — przed użyciem w operacie wymaga korekty i uzasadnienia.',
    });
  });
  const komunikat = oferty.length
    ? `Na stronie odczytałem ${oferty.length} ${oferty.length === 1 ? 'ofertę' : oferty.length < 5 ? 'oferty' : 'ofert'} z ceną i powierzchnią.`
    : (ceny.length ? 'Na stronie są ceny, ale przy żadnej nie znalazłem powierzchni mieszkania. Otwórz listę ogłoszeń albo jedno ogłoszenie.'
      : 'Na tej stronie nie widzę ofert z ceną. Przejdź do listy ogłoszeń i spróbuj ponownie.');
  return { ok: oferty.length > 0, oferty, pominiete, komunikat };
}

const API_PC = { PORTALE: PC_PORTALE, adresPortalu: pcAdresPortalu, adresDozwolony: pcAdresDozwolony, ofertyZTekstu: pcOfertyZTekstu, liczba: pcLiczba };
if (typeof module !== 'undefined' && module.exports) module.exports = API_PC;
if (typeof window !== 'undefined') window.OperoPortal = API_PC;

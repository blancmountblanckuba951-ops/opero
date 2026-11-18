'use strict';
/* ============================================================================
   OPERO — OD ADRESU DO DZIAŁKI, OD DZIAŁKI DO KSIĘGI WIECZYSTEJ
   ----------------------------------------------------------------------------
   Najpierw rzecz, którą trzeba powiedzieć wprost, bo oszczędzi tygodni złudzeń:

   DARMOWEGO, OFICJALNEGO WYSZUKIWANIA „ADRES → NUMER KW" NIE MA.

   Ministerstwo Sprawiedliwości udostępnia księgi wyłącznie po numerze księgi.
   GUGiK udostępnia dane katastralne, ale bez numerów ksiąg — numer KW jest w
   ewidencji gruntów daną chronioną i nie wychodzi do publicznych usług. Serwisy,
   które „znajdują KW po adresie", trzymają własne kopie bazy eKW zbudowane
   latami i biorą za jeden numer kilkadziesiąt złotych. Program, który obiecywałby
   to za darmo, musiałby albo kłamać, albo podbierać dane wbrew regulaminowi
   cudzego serwisu — a odpowiadałby za to rzeczoznawca swoim nazwiskiem.

   Co zatem robimy, i co naprawdę kończy się numerem KW w ręku:

     1. ADRES → PUNKT.  Uniwersalna Usługa Geokodowania GUGiK (UUG). Publiczna,
        nieodpłatna, bez klucza.
     2. PUNKT → DZIAŁKA.  Usługa Lokalizacji Działek Katastralnych (ULDK).
        Zwraca identyfikator działki, numer, obręb, gminę i powiat.
     3. DZIAŁKA → KSIĘGA.  Czterema drogami, w kolejności od najtańszej:
          a) Twoje własne źródła: wyciąg RCiWN, historia operatów, książka
             klientów. Numer KW bardzo często już tam leży — za darmo i od ręki.
          b) Geoportal powiatowy otwarty dokładnie na tej działce. Część
             powiatów pokazuje numer KW wprost.
          c) Wniosek do starosty. Rzeczoznawca ma do tych danych PRAWO —
             art. 155 ust. 3 ustawy o gospodarce nieruchomościami nakazuje
             organom udostępnić mu rejestry i dokumenty z ust. 1, a księgi
             wieczyste i kataster są wymienione w pkt 1 i 2. Program wypełnia
             wniosek za Ciebie; Ty go podpisujesz i wysyłasz.
          d) Masz numer — program sprawdza cyfrę kontrolną i otwiera eKW.

   Ten moduł nie łączy się z siecią. Składa adresy zapytań i rozkłada
   odpowiedzi na części — żeby dało się to sprawdzić testem, bez internetu.
   Sieć jest w procesie głównym, w jednym miejscu.
   ========================================================================= */

const UUG = 'https://services.gugik.gov.pl/uug/';
const ULDK = 'https://uldk.gugik.gov.pl/';
const GEOPORTAL = 'https://mapy.geoportal.gov.pl/imapnext/imap/';

/** Pola, o które pytamy ULDK — w tej samej kolejności wracają w odpowiedzi. */
const POLA_ULDK = ['id', 'teryt', 'parcel', 'region', 'commune', 'county', 'voivodeship'];

/* ------------------------------------------------------------------ adres */

/** Adres w postaci, której oczekuje UUG: „Miejscowość, Ulica Numer". */
function adresDoZapytania({ miasto, ulica, numer } = {}) {
  const m = String(miasto || '').trim();
  if (!m) throw new Error('Podaj przynajmniej miejscowość — bez niej nie ma czego szukać.');
  const u = String(ulica || '').trim().replace(/^(ul\.|ulica|al\.|aleja|pl\.|plac)\s+/i, '');
  const n = String(numer || '').trim();
  if (u && n) return `${m}, ${u} ${n}`;
  if (u) return `${m}, ${u}`;
  if (n) return `${m} ${n}`;
  return m;
}

function urlGeokodera(adres) {
  return `${UUG}?request=GetAddress&address=${encodeURIComponent(adres)}`;
}

/**
 * Odpowiedź UUG rozkładamy tolerancyjnie. Usługa jest państwowa i żywa — pola
 * potrafią przyjść raz jako lista, raz jako obiekt z kluczami „1", „2".
 * Program, który przewróciłby się na takiej drobnicy, byłby bezużyteczny
 * dokładnie w dniu, w którym GUGiK coś poprawi.
 */
function punktyZGeokodera(odpowiedz) {
  const dane = typeof odpowiedz === 'string' ? bezpiecznyJson(odpowiedz) : odpowiedz;
  const surowe = dane?.results ?? dane?.result ?? dane;
  const lista = Array.isArray(surowe) ? surowe
    : (surowe && typeof surowe === 'object') ? Object.values(surowe) : [];
  const out = [];
  for (const w of lista) {
    if (!w || typeof w !== 'object') continue;
    const x = Number(w.x ?? w.X ?? w.wspX);
    const y = Number(w.y ?? w.Y ?? w.wspY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push({
      x, y,
      miasto: String(w.city ?? w.miejscowosc ?? w.nazwa ?? '').trim(),
      ulica: String(w.street ?? w.ulica ?? '').trim(),
      numer: String(w.number ?? w.numer ?? '').trim(),
      kod: String(w.code ?? w.kod ?? w.pna ?? '').trim(),
      gmina: String(w.commune ?? w.gmina ?? '').trim(),
      powiat: String(w.county ?? w.powiat ?? '').trim(),
      wojewodztwo: String(w.voivodeship ?? w.wojewodztwo ?? '').trim(),
      teryt: String(w.teryt ?? w.terytGmina ?? '').trim(),
    });
  }
  return out;
}

function bezpiecznyJson(tekst) {
  const t = String(tekst || '').replace(/^﻿/, '').trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { return null; }
}

/**
 * Który z kilku punktów o tym samym adresie jest tym właściwym. „Stara Wieś"
 * jest w Polsce 435 razy, więc gdy rzeczoznawca poda województwo, bierzemy je
 * pod uwagę — ale nigdy nie wyrzucamy reszty po cichu. Wybór zostaje przy nim.
 */
function dopasujPunkty(punkty, { wojewodztwo, kod } = {}) {
  const w = String(wojewodztwo || '').trim().toLowerCase();
  const k = String(kod || '').replace(/\s+/g, '');
  const punkty2 = (punkty || []).map(p => {
    let pkt = 0;
    if (w && String(p.wojewodztwo || '').toLowerCase() === w) pkt += 2;
    if (k && String(p.kod || '').replace(/\s+/g, '') === k) pkt += 3;
    if (p.numer) pkt += 1;
    return { ...p, trafnosc: pkt };
  });
  return punkty2.sort((a, b) => b.trafnosc - a.trafnosc);
}

/* ----------------------------------------------------------------- działka */

function urlDzialkiPoXY(x, y) {
  const lx = Number(x), ly = Number(y);
  if (!Number.isFinite(lx) || !Number.isFinite(ly)) throw new Error('Brak współrzędnych punktu.');
  return `${ULDK}?request=GetParcelByXY&xy=${lx},${ly}&result=${POLA_ULDK.join(',')}`;
}

function urlDzialkiPoNumerze(obreb, numer) {
  const o = String(obreb || '').trim();
  const n = String(numer || '').trim();
  if (!o || !n) throw new Error('Podaj nazwę obrębu i numer działki.');
  return `${ULDK}?request=GetParcelByIdOrNr&id=${encodeURIComponent(`${o} ${n}`)}&result=${POLA_ULDK.join(',')}`;
}

function urlDzialkiPoId(id) {
  const i = String(id || '').trim();
  if (!i) throw new Error('Brak identyfikatora działki.');
  return `${ULDK}?request=GetParcelById&id=${encodeURIComponent(i)}&result=${POLA_ULDK.join(',')}`;
}

/**
 * ULDK odpowiada czystym tekstem: pierwsza linia to status (0 = znaleziono),
 * dalej po jednej działce w linii, pola rozdzielone kreską pionową.
 * Status różny od zera znaczy „nie znaleziono" — i tak to nazywamy, zamiast
 * udawać pustą listę.
 */
function dzialkiZOdpowiedzi(tekst) {
  const linie = String(tekst || '').replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!linie.length) return { ok: false, powod: 'Usługa działek nie odpowiedziała niczym.', dzialki: [] };
  const status = linie[0];
  if (!/^-?\d+$/.test(status)) return { ok: false, powod: 'Odpowiedź usługi działek jest nieczytelna.', dzialki: [] };
  if (Number(status) !== 0) {
    return { ok: false, powod: 'Pod tym punktem nie ma działki w bazie GUGiK.', dzialki: [] };
  }
  // Druga linia bywa liczbą znalezionych działek (tak odpowiada wyszukiwanie
  // po nazwie obrębu). Nie jest działką — pomijamy ją.
  const reszta = linie.slice(1).filter(l => !/^\d+$/.test(l));
  const dzialki = reszta.map(l => {
    const czesci = l.split('|').map(x => x.trim());
    const w = {};
    POLA_ULDK.forEach((pole, i) => { w[pole] = czesci[i] || ''; });
    return {
      id: w.id || w.teryt || '',
      numer: w.parcel || '',
      obreb: w.region || '',
      gmina: w.commune || '',
      powiat: w.county || '',
      wojewodztwo: w.voivodeship || '',
    };
  }).filter(d => d.id || d.numer);
  if (!dzialki.length) return { ok: false, powod: 'Usługa działek zwróciła pustą odpowiedź.', dzialki: [] };
  return { ok: true, powod: '', dzialki };
}

/** Link do Geoportalu otwartego dokładnie na tej działce. */
function urlGeoportalu(idDzialki) {
  const id = String(idDzialki || '').trim();
  if (!id) return GEOPORTAL;
  return `${GEOPORTAL}?identifyParcel=${encodeURIComponent(id)}`;
}

/* ------------------------------------------- numer KW z własnych zasobów */

function uprosc(tekst) {
  return String(tekst || '')
    .toLowerCase()
    // „ł" nie rozkłada się na literę i znak diakrytyczny, więc sam NFD zostawia
    // ją nietkniętą, a czyszczenie znaków zjada do pustego miejsca — i „Długa"
    // przestaje pasować do „Dluga" z wyciągu pisanego bez ogonków.
    .replace(/ł/g, 'l')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(ul|ulica|al|aleja|pl|plac|os|osiedle)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Szukanie numeru KW w tym, co rzeczoznawca ma już u siebie: w transakcjach z
 * wyciągu RCiWN, w historii operatów i w książce klientów. To jedyne źródło,
 * które jest i darmowe, i natychmiastowe, i w pełni legalne — bo to jego
 * własne dane. Zaskakująco często wystarcza: ten sam budynek wraca.
 */
/**
 * Czy dwa zapisy adresu mówią o tym samym budynku. Porównanie wprost nie
 * wystarczy: w wyciągu RCiWN stoi zwykle „ul. Długa 12" bez miejscowości, a w
 * historii „Gdańsk Długa 12 — lokal". Dlatego miejscowość jest dodatkiem, a
 * rozstrzyga ulica z numerem — przy czym numer musi zgadzać się CO DO ZNAKU.
 * Inaczej „Długa 1" podstawiłaby księgę spod „Długa 12", a rzeczoznawca
 * wpisałby do operatu cudzą nieruchomość.
 */
function pasujeAdres(szukanyAdres, znaleziony) {
  const ulica = uprosc(szukanyAdres.ulica || '');
  const numer = uprosc(String(szukanyAdres.numer || ''));
  const miasto = uprosc(szukanyAdres.miasto || '');
  const cel = uprosc(znaleziony);
  if (!cel) return false;
  const slowa = cel.split(' ').filter(Boolean);
  if (ulica) {
    const slowaUlicy = ulica.split(' ').filter(Boolean);
    if (!slowaUlicy.every(w => slowa.includes(w))) return false;
    if (numer && !slowa.includes(numer)) return false;
    return true;
  }
  if (miasto && numer) return slowa.includes(miasto) && slowa.includes(numer);
  return false;
}

function kwZWlasnychZrodel({ adres = {}, dzialka = null, transakcje = [], historia = [], ksiega = [] } = {}) {
  const idDzialki = String(dzialka?.id || '').trim();
  const out = [];
  const dodaj = (kw, skad, opis, pewnosc) => {
    const n = String(kw || '').trim().toUpperCase();
    if (!n || n.length < 6) return;
    if (out.some(x => x.kw === n && x.skad === skad)) return;
    out.push({ kw: n, skad, opis, pewnosc });
  };

  for (const w of ksiega || []) {
    if (idDzialki && String(w.dzialka || '').trim() === idDzialki) {
      dodaj(w.kw, 'ksiega', `Ustalone wcześniej dla działki ${idDzialki}${w.kiedy ? ` (${String(w.kiedy).slice(0, 10)})` : ''}.`, 'pewne');
    }
  }
  for (const t of transakcje || []) {
    if (!pasujeAdres(adres, t.address || t.adres || '')) continue;
    // Przy transakcji z wyciągu numer księgi leży w śladzie pochodzenia.
    dodaj(t.kw || t.kwNumber || t.ksiega || t.zrodlo?.kw, 'rcn', `Z wyciągu RCiWN: ${t.address || t.adres}.`, 'wysokie');
  }
  for (const h of historia || []) {
    if (!pasujeAdres(adres, h.title || h.adres || '')) continue;
    dodaj(h.kw, 'historia', `Z Twojego operatu: ${h.title || h.adres}.`, 'wysokie');
  }
  return out;
}

/* ------------------------------------------------------ wniosek do starosty */

/**
 * Wniosek, który kończy sprawę. Nie jest to prośba o grzeczność: art. 155
 * ust. 3 ustawy o gospodarce nieruchomościami nakłada na organy OBOWIĄZEK
 * udostępnienia rzeczoznawcy rejestrów i dokumentów wymienionych w ust. 1 —
 * a w ust. 1 pkt 1 i 2 stoją księgi wieczyste i kataster nieruchomości.
 * Dlatego we wniosku podajemy podstawę prawną, cel i numer uprawnień: to trzy
 * rzeczy, o które urząd i tak dopyta.
 */
function wniosekDoStarosty({ dzialka = {}, adres = {}, profil = {}, cel = '', data = '' } = {}) {
  const dzis = String(data || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const rzecz = String(profil.name || '').trim() || '[imię i nazwisko rzeczoznawcy]';
  const upr = String(profil.licenseNo || '').trim() || '[numer uprawnień zawodowych]';
  const firma = String(profil.company || '').trim();
  const kontakt = [String(profil.address || '').trim(), String(profil.phone || '').trim(), String(profil.email || '').trim()]
    .filter(Boolean).join(' · ');
  const polozenie = [adres.ulica && `${adres.ulica} ${adres.numer || ''}`.trim(), adres.miasto].filter(Boolean).join(', ');
  const celWyceny = String(cel || '').trim() || '[cel wyceny]';

  return [
    `${dzis}`,
    '',
    `${rzecz}`,
    `rzeczoznawca majątkowy, uprawnienia nr ${upr}`,
    firma,
    kontakt,
    '',
    `Starosta ${dzialka.powiat ? dzialka.powiat.replace(/^powiat\s+/i, '') : '[powiat]'}`,
    'Wydział Geodezji / Ośrodek Dokumentacji Geodezyjnej i Kartograficznej',
    '',
    'WNIOSEK',
    'o udostępnienie danych z ewidencji gruntów i budynków,',
    'w tym numeru księgi wieczystej',
    '',
    'Wnoszę o udostępnienie danych ewidencyjnych dotyczących nieruchomości:',
    `  • identyfikator działki: ${dzialka.id || '[identyfikator]'}`,
    `  • numer działki: ${dzialka.numer || '[numer]'}`,
    `  • obręb: ${dzialka.obreb || '[obręb]'}`,
    `  • gmina: ${dzialka.gmina || '[gmina]'}`,
    polozenie ? `  • położenie: ${polozenie}` : '',
    '',
    'w zakresie obejmującym numer księgi wieczystej prowadzonej dla tej',
    'nieruchomości oraz oznaczenie nieruchomości w ewidencji gruntów i budynków.',
    '',
    'Podstawa prawna wniosku:',
    '  • art. 155 ust. 1 pkt 1 i 2 oraz ust. 3 ustawy z dnia 21 sierpnia 1997 r.',
    '    o gospodarce nieruchomościami — organy prowadzące wskazane rejestry',
    '    są obowiązane udostępniać je rzeczoznawcy majątkowemu, z możliwością',
    '    sporządzania kopii,',
    '  • art. 24 ustawy z dnia 17 maja 1989 r. — Prawo geodezyjne i kartograficzne.',
    '',
    `Cel wykorzystania danych: sporządzenie operatu szacunkowego — ${celWyceny}.`,
    'Dane zostaną wykorzystane wyłącznie w tym celu i w zakresie niezbędnym',
    'do wyceny, zgodnie z przepisami o ochronie danych osobowych.',
    '',
    'Proszę o udostępnienie danych w postaci wypisu / informacji pisemnej',
    'albo w postaci elektronicznej na wskazany adres poczty elektronicznej.',
    '',
    '',
    '........................................',
    `${rzecz}, uprawnienia nr ${upr}`,
  ].filter(l => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');
}

/* ------------------------------------------------------------------- plan */

/**
 * Co program proponuje zrobić dalej — zawsze w tej samej kolejności: najpierw
 * to, co darmowe i natychmiastowe, na końcu to, co kosztuje czas albo pieniądze.
 */
function dalszeKroki({ dzialka = null, znalezioneKW = [] } = {}) {
  const kroki = [];
  if (znalezioneKW.length) {
    kroki.push({ id: 'wlasne', nazwa: 'Sprawdź numer z Twoich danych',
      opis: `Znaleziono ${znalezioneKW.length} ${znalezioneKW.length === 1 ? 'numer' : 'numery'} w Twoich źródłach. Sprawdź w eKW, czy to ta nieruchomość.`, koszt: 'za darmo, od ręki' });
  }
  if (dzialka) {
    kroki.push({ id: 'geoportal', nazwa: 'Otwórz działkę w Geoportalu',
      opis: 'Zobacz działkę na mapie i sprawdź, czy to na pewno ta nieruchomość. Część powiatów pokazuje numer KW w swoim geoportalu.', koszt: 'za darmo' });
    kroki.push({ id: 'wniosek', nazwa: 'Wniosek do starosty o numer KW',
      opis: 'Program wypełni wniosek danymi działki i podstawą prawną z art. 155 ust. 3 ugn. Ty podpisujesz i wysyłasz. Ta droga zawsze kończy się numerem.', koszt: 'za darmo, zwykle kilka dni' });
  }
  kroki.push({ id: 'platne', nazwa: 'Serwis komercyjny',
    opis: 'Prywatne bazy odpisów eKW sprzedają numer po adresie, zwykle kilkadziesiąt złotych za sztukę. Program ich nie obsługuje i nie pobiera z nich danych.', koszt: 'płatne' });
  return kroki;
}

const API_DZIALKA = {
  UUG, ULDK, GEOPORTAL, POLA_ULDK,
  adresDoZapytania, urlGeokodera, punktyZGeokodera, dopasujPunkty,
  urlDzialkiPoXY, urlDzialkiPoNumerze, urlDzialkiPoId, dzialkiZOdpowiedzi,
  urlGeoportalu, kwZWlasnychZrodel, wniosekDoStarosty, dalszeKroki, uprosc, pasujeAdres,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_DZIALKA;
if (typeof window !== 'undefined') window.OperoDzialka = API_DZIALKA;

'use strict';
/* ============================================================================
   OPERO — PODPOWIEDZI ADRESÓW
   ----------------------------------------------------------------------------
   Adres wpisuje się w operacie kilka razy i za każdym razem inaczej: raz
   „ul. Długa", raz „Długa", raz „Dluga". Potem nie zgadza się z wypisem,
   nie zgadza się z wyciągiem i nie da się po nim znaleźć transakcji we
   własnej bazie. Podpowiedzi są po to, żeby adres był ZA KAŻDYM RAZEM TEN SAM.

   Skąd podpowiedzi:
     1. Z TWOICH danych — miejscowości i ulice z własnej bazy transakcji,
        z operatów i z książki klientów. Bez sieci, natychmiast.
     2. Z Uniwersalnej Usługi Geokodowania GUGiK — państwowy rejestr punktów
        adresowych. Bezpłatny, bez klucza, ten sam, z którego korzysta
        szukanie działki.

   Czego ten moduł NIE robi:
     * nie wpisuje adresu sam z siebie — podpowiada, wybiera człowiek,
     * nie pyta usługi przy każdym uderzeniu w klawisz (to by znaczyło
       kilkadziesiąt zapytań na jedno pole i blokadę po stronie usługi),
     * nie wysyła nigdzie niczego poza tym, co człowiek właśnie wpisał
       w pole adresu.
   ========================================================================= */

const UUG_PODPOWIEDZI = 'https://services.gugik.gov.pl/uug/';
/** Od ilu znaków w ogóle warto pytać — krócej podpowiedzi są bez wartości. */
const PODP_OD_ZNAKOW = 3;
/** Ile milisekund czekamy, aż człowiek skończy pisać. */
const PODP_ZWLOKA_MS = 300;
const PODP_MAKS = 8;

function podpUprosc(tekst) {
  return String(tekst || '')
    .toLowerCase()
    .replace(/ł/g, 'l')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(ul|ulica|al|aleja|pl|plac|os|osiedle)\b\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/* ------------------------------------------------------------ z własnych */

/**
 * Podpowiedzi z tego, co rzeczoznawca ma już u siebie. To najlepsze źródło:
 * są natychmiastowe, nie wymagają sieci i są zapisane w jego własnej pisowni,
 * więc adres zgodzi się z tym, co już ma w bazie.
 */
function podpZWlasnych({ transakcje = [], historia = [], klienci = [], rodzaj = 'miejscowosc' } = {}) {
  const licznik = new Map();
  const dodaj = (wartosc, skad) => {
    const t = String(wartosc || '').trim();
    if (t.length < 2) return;
    const klucz = podpUprosc(t);
    if (!klucz) return;
    const stare = licznik.get(klucz);
    if (stare) { stare.ile++; return; }
    licznik.set(klucz, { etykieta: t, ile: 1, skad });
  };

  for (const t of transakcje) {
    if (rodzaj === 'miejscowosc') dodaj(t.miejscowosc, 'baza');
    else dodaj(podpUlicaZAdresu(t.adres || t.address), 'baza');
  }
  for (const h of historia) {
    const tytul = String(h.title || h.adres || '');
    if (rodzaj === 'miejscowosc') dodaj(podpPierwszeSlowoMiasta(tytul), 'operaty');
    else dodaj(podpUlicaZAdresu(tytul), 'operaty');
  }
  if (rodzaj === 'miejscowosc') for (const k of klienci) dodaj(podpMiastoKlienta(k.address || k.adres), 'klienci');

  return [...licznik.values()]
    .sort((a, b) => b.ile - a.ile || a.etykieta.localeCompare(b.etykieta, 'pl'))
    .map(x => ({ etykieta: x.etykieta, opis: `${x.ile}× w Twoich danych`, zrodlo: x.skad, wlasne: true }));
}

function podpUlicaZAdresu(adres) {
  const t = String(adres || '').trim();
  if (!t) return '';
  const bezMiasta = t.split(',')[0] || t;
  // Zdejmujemy numer z konca: „Dluga 12/3" -> „Dluga".
  return bezMiasta.replace(/^(ul\.|ulica|al\.|aleja|pl\.|plac|os\.|osiedle)\s+/i, '')
    .replace(/\s+\d+[a-zA-Z]?(\s*\/\s*\d+[a-zA-Z]?)?$/, '').trim();
}
function podpPierwszeSlowoMiasta(tytul) {
  const t = String(tytul || '').split(/[—–-]/)[0].trim();
  const czesci = t.split(/[\s,]+/).filter(Boolean);
  return czesci.length ? czesci[0] : '';
}
function podpMiastoKlienta(adres) {
  const czesci = String(adres || '').split(',').map(x => x.trim()).filter(Boolean);
  if (!czesci.length) return '';
  const ostatni = czesci[czesci.length - 1];
  return ostatni.replace(/^\d{2}-\d{3}\s*/, '').trim();
}

/** Zawężenie listy do tego, co człowiek wpisał — bez pytania usługi. */
function podpFiltruj(lista, fraza, limit = PODP_MAKS) {
  const q = podpUprosc(fraza);
  if (!q) return (lista || []).slice(0, limit);
  const trafione = (lista || []).filter(x => podpUprosc(x.etykieta).includes(q));
  // Te, ktore ZACZYNAJA sie od wpisanego tekstu, ida na gore - czlowiek
  // zwykle pisze poczatek nazwy, a nie jej srodek.
  return trafione
    .sort((a, b) => Number(podpUprosc(b.etykieta).startsWith(q)) - Number(podpUprosc(a.etykieta).startsWith(q)))
    .slice(0, limit);
}

/* -------------------------------------------------------------- z GUGiK */

function podpZapytanie(fraza, { miasto = '' } = {}) {
  const t = String(fraza || '').trim();
  if (t.length < PODP_OD_ZNAKOW) return null;
  const adres = miasto && !podpUprosc(t).includes(podpUprosc(miasto)) ? `${miasto}, ${t}` : t;
  return `${UUG_PODPOWIEDZI}?request=GetAddress&address=${encodeURIComponent(adres)}`;
}

/**
 * Odpowiedź usługi rozkładamy tolerancyjnie — raz przychodzi listą, raz
 * obiektem z kluczami „1", „2". Program, który przewróciłby się na takiej
 * drobnicy, byłby bezużyteczny w dniu, w którym GUGiK coś poprawi.
 */
function podpZOdpowiedzi(odpowiedz, rodzaj = 'adres') {
  let dane = odpowiedz;
  if (typeof odpowiedz === 'string') {
    try { dane = JSON.parse(odpowiedz.replace(/^﻿/, '')); } catch { return []; }
  }
  const surowe = dane?.results ?? dane?.result ?? dane;
  const lista = Array.isArray(surowe) ? surowe : (surowe && typeof surowe === 'object') ? Object.values(surowe) : [];
  const widziane = new Set();
  const out = [];
  for (const w of lista) {
    if (!w || typeof w !== 'object') continue;
    const miasto = String(w.city ?? w.miejscowosc ?? '').trim();
    const ulica = String(w.street ?? w.ulica ?? '').trim();
    const numer = String(w.number ?? w.numer ?? '').trim();
    const kod = String(w.code ?? w.kod ?? '').trim();
    const etykieta = rodzaj === 'miejscowosc'
      ? miasto
      : [ulica, numer].filter(Boolean).join(' ') || miasto;
    if (!etykieta) continue;
    const klucz = podpUprosc(`${etykieta}|${miasto}`);
    if (widziane.has(klucz)) continue;
    widziane.add(klucz);
    out.push({
      etykieta,
      opis: [miasto !== etykieta ? miasto : '', kod].filter(Boolean).join(' · ') || 'punkt adresowy GUGiK',
      zrodlo: 'gugik', wlasne: false,
      miasto, ulica, numer, kod,
      x: Number(w.x ?? w.X), y: Number(w.y ?? w.Y),
    });
  }
  return out.slice(0, PODP_MAKS);
}

/** Własne przed państwowymi — i bez powtórek. */
function podpScal(wlasne, zUslugi, limit = PODP_MAKS) {
  const out = [];
  const widziane = new Set();
  for (const x of [...(wlasne || []), ...(zUslugi || [])]) {
    const klucz = podpUprosc(x.etykieta);
    if (!klucz || widziane.has(klucz)) continue;
    widziane.add(klucz);
    out.push(x);
    if (out.length >= limit) break;
  }
  return out;
}

/* ------------------------------------------------------------- podpięcie */

/**
 * Lista podpowiedzi pod polem. Klawiatura działa tak, jak człowiek się
 * spodziewa: strzałki chodzą po liście, Enter wybiera, Escape zamyka.
 * Bez wyboru nic się nie wpisuje — podpowiedź nie jest decyzją.
 */
function podpPodepnij(pole, { wlasne = () => [], zdalne = null, rodzaj = 'adres', naWybor } = {}) {
  if (!pole || pole.dataset.operoPodpowiedzi) return () => {};
  pole.dataset.operoPodpowiedzi = rodzaj;
  pole.setAttribute('autocomplete', 'off');
  pole.setAttribute('role', 'combobox');
  pole.setAttribute('aria-expanded', 'false');

  const lista = document.createElement('div');
  lista.className = 'podpowiedzi hidden';
  lista.setAttribute('role', 'listbox');
  pole.parentElement?.appendChild(lista);

  let pozycje = [], wybrana = -1, zegar = null, ostatnieZapytanie = '';

  const zamknij = () => {
    lista.classList.add('hidden');
    lista.innerHTML = '';
    pozycje = []; wybrana = -1;
    pole.setAttribute('aria-expanded', 'false');
  };

  const rysuj = () => {
    if (!pozycje.length) { zamknij(); return; }
    lista.innerHTML = pozycje.map((p, i) => `
      <button type="button" class="podpowiedz${i === wybrana ? ' wybrana' : ''}" role="option"
        aria-selected="${i === wybrana}" data-i="${i}">
        <b>${podpEscape(p.etykieta)}</b><small>${podpEscape(p.opis || '')}</small>
        ${p.wlasne ? '<span class="podpowiedz-znak">Twoje dane</span>' : ''}
      </button>`).join('');
    lista.classList.remove('hidden');
    pole.setAttribute('aria-expanded', 'true');
    lista.querySelectorAll('[data-i]').forEach(b => b.addEventListener('mousedown', ev => {
      ev.preventDefault();
      wybierz(Number(b.dataset.i));
    }));
  };

  const wybierz = (i) => {
    const p = pozycje[i];
    if (!p) return;
    pole.value = p.etykieta;
    zamknij();
    pole.dispatchEvent(new Event('input', { bubbles: true }));
    pole.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof naWybor === 'function') naWybor(p);
  };

  const odswiez = async () => {
    const fraza = pole.value.trim();
    if (fraza.length < PODP_OD_ZNAKOW) { zamknij(); return; }
    const moje = podpFiltruj(wlasne() || [], fraza);
    pozycje = moje; wybrana = -1; rysuj();
    if (typeof zdalne !== 'function') return;
    // Usluge pytamy dopiero, gdy wlasne dane nie wystarczaja - zwykle
    // wystarczaja, bo rzeczoznawca wraca na te same rynki.
    if (moje.length >= 5) return;
    const to = fraza;
    ostatnieZapytanie = to;
    try {
      const zdalnie = await zdalne(to);
      if (ostatnieZapytanie !== to || pole.value.trim() !== to) return;   // człowiek pisze dalej
      pozycje = podpScal(moje, zdalnie || []);
      rysuj();
    } catch { /* brak sieci nie może zepsuć pisania */ }
  };

  pole.addEventListener('input', () => {
    clearTimeout(zegar);
    zegar = setTimeout(odswiez, PODP_ZWLOKA_MS);
  });
  pole.addEventListener('keydown', ev => {
    if (lista.classList.contains('hidden')) return;
    if (ev.key === 'ArrowDown') { ev.preventDefault(); wybrana = Math.min(pozycje.length - 1, wybrana + 1); rysuj(); }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); wybrana = Math.max(0, wybrana - 1); rysuj(); }
    else if (ev.key === 'Enter' && wybrana >= 0) { ev.preventDefault(); wybierz(wybrana); }
    else if (ev.key === 'Escape') { ev.preventDefault(); zamknij(); }
  });
  pole.addEventListener('blur', () => setTimeout(zamknij, 120));

  return zamknij;
}

function podpEscape(t) {
  return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const API_PODPOWIEDZI = {
  UUG: UUG_PODPOWIEDZI, OD_ZNAKOW: PODP_OD_ZNAKOW, ZWLOKA_MS: PODP_ZWLOKA_MS, MAKS_PODPOWIEDZI: PODP_MAKS,
  zWlasnych: podpZWlasnych, filtruj: podpFiltruj, zapytanie: podpZapytanie, zOdpowiedzi: podpZOdpowiedzi,
  scal: podpScal, podepnij: podpPodepnij, uprosc: podpUprosc, ulicaZAdresu: podpUlicaZAdresu,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_PODPOWIEDZI;
if (typeof window !== 'undefined') window.OperoPodpowiedzi = API_PODPOWIEDZI;

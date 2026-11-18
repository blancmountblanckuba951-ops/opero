/* OPERO 3.3 — Agent ocen transakcji: macierz ocen cech nieruchomości podobnych.
 *
 * Korygowanie ceny średniej wymaga oceny KAŻDEJ cechy dla KAŻDEJ transakcji.
 * Agent wystawia ocenę tylko z faktów, które ma przy transakcji (rejestr cen:
 * rynek pierwotny/wtórny, położenie, powierzchnia, kondygnacja), a gdy faktu
 * nie ma — ocenę przeciętną z adnotacją „brak danych w źródle". Każda ocena
 * ma uzasadnienie zapisane przy transakcji. Ocen wpisanych ręcznie nie zmienia.
 */
'use strict';

function otOdleglosc(a, b){
  if (!a || !b || ![a.x, a.y, b.x, b.y].every(v => Number.isFinite(Number(v)))) return null;
  const dx = Number(a.x) - Number(b.x), dy = Number(a.y) - Number(b.y);
  const d = Math.sqrt(dx * dx + dy * dy);
  // Rejestr i geokoder potrafią podać osie w odwrotnej kolejności — sprawdzamy oba warianty.
  const dx2 = Number(a.x) - Number(b.y), dy2 = Number(a.y) - Number(b.x);
  return Math.round(Math.min(d, Math.sqrt(dx2 * dx2 + dy2 * dy2)));
}

/** Rodzaj cechy z jej nazwy. */
function otRodzaj(nazwa){
  const n = String(nazwa || '').toLowerCase();
  if (/lokaliz|położen|polozen/.test(n)) return 'lokalizacja';
  if (/standard|wykończ|wykoncz/.test(n)) return 'standard';
  if (/stan techn|wiek|stan budynk/.test(n)) return 'stan';
  if (/powierzch/.test(n)) return 'powierzchnia';
  if (/kondygn|piętr|pietr/.test(n)) return 'pietro';
  return 'inne';
}

/**
 * Ocena jednej cechy jednej transakcji: { ocena, powod } albo null (brak skali 3/5).
 * `przedmiot`: { punkt:{x,y}, powierzchnia, oceny:{rodzaj:ocena} }
 */
function otOcena(t, cecha, przedmiot){
  const tryb = cecha.scaleMode || 'three';
  if (tryb === 'two') return null;
  const z = t.zrodlo || {}, rodzaj = otRodzaj(cecha.name), P = przedmiot || {};
  const rynek = String(z.rynek || (z.uwagi || []).join(' ')).toLowerCase();
  const pierwotny = /pierwotn/.test(rynek), wtorny = /wtórn|wtorn/.test(rynek);
  if (rodzaj === 'lokalizacja'){
    const d = otOdleglosc(P.punkt, z);
    if (d != null && d <= 500) return { ocena: cecha.rating || 'Przeciętna', powod: `${d} m od przedmiotu wyceny — to samo położenie` };
    if (d != null) return { ocena: 'Przeciętna', powod: `${d} m od przedmiotu wyceny — położenie typowe dla rynku lokalnego` };
    return { ocena: 'Przeciętna', powod: 'brak położenia w źródle — przyjęto przeciętną' };
  }
  if (rodzaj === 'standard'){
    if (pierwotny) return { ocena: 'Niekorzystna', powod: 'rynek pierwotny — lokal w stanie deweloperskim, do wykończenia' };
    if (wtorny) return { ocena: 'Przeciętna', powod: 'rynek wtórny — standard typowy, bez opisu w źródle' };
    return { ocena: 'Przeciętna', powod: 'brak danych o standardzie w źródle' };
  }
  if (rodzaj === 'stan'){
    if (pierwotny) return { ocena: 'Korzystna', powod: 'rynek pierwotny — budynek nowy' };
    if (wtorny) return { ocena: 'Przeciętna', powod: 'rynek wtórny — budynek użytkowany' };
    return { ocena: 'Przeciętna', powod: 'brak danych o budynku w źródle' };
  }
  if (rodzaj === 'powierzchnia'){
    const a = Number(t.area), b = Number(P.powierzchnia);
    if (a > 0 && b > 0){
      const r = (a - b) / b;
      if (r < -0.15) return { ocena: 'Korzystna', powod: `${String(a).replace('.', ',')} m² — wyraźnie mniejszy lokal (wyższa cena 1 m²)` };
      if (r > 0.15) return { ocena: 'Niekorzystna', powod: `${String(a).replace('.', ',')} m² — wyraźnie większy lokal (niższa cena 1 m²)` };
      return { ocena: cecha.rating || 'Przeciętna', powod: `${String(a).replace('.', ',')} m² — powierzchnia zbliżona do wycenianej` };
    }
    return { ocena: 'Przeciętna', powod: 'brak powierzchni' };
  }
  if (rodzaj === 'pietro'){
    if (z.pietro == null || z.pietro === '') return { ocena: 'Przeciętna', powod: 'brak kondygnacji w źródle' };
    const p = Number(z.pietro);
    if (p === 0) return { ocena: 'Niekorzystna', powod: 'parter' };
    if (p >= 1 && p <= 3) return { ocena: 'Korzystna', powod: `kondygnacja ${p}` };
    return { ocena: 'Przeciętna', powod: `kondygnacja ${p}` };
  }
  return { ocena: 'Przeciętna', powod: 'źródło nie opisuje tej cechy — przyjęto przeciętną' };
}

/** Uzupełnia brakujące oceny. Zwraca liczbę wpisanych ocen i ile było „z braku danych". */
function otUzupelnij(project, przedmiot){
  const cechy = project?.market?.features || [], tx = project?.market?.transactions || [];
  let wpisane = 0, zBraku = 0, pominiete = 0;
  for (const t of tx){
    t.featureRatings = t.featureRatings || {};
    t.ratingNotes = t.ratingNotes || {};
    for (const f of cechy){
      if (String(t.featureRatings[f.id] || '').trim()) continue;
      const o = otOcena(t, f, przedmiot);
      if (!o){ pominiete++; continue; }
      t.featureRatings[f.id] = o.ocena; t.ratingNotes[f.id] = o.powod; wpisane++;
      if (/brak|nie opisuje/.test(o.powod)) zBraku++;
    }
  }
  return { wpisane, zBraku, pominiete, transakcji: tx.length, cech: cechy.length };
}

const API_OCENY_TR = { odleglosc: otOdleglosc, rodzaj: otRodzaj, ocena: otOcena, uzupelnij: otUzupelnij };
if (typeof window !== 'undefined') window.OperoOcenyTransakcji = API_OCENY_TR;
if (typeof module !== 'undefined' && module.exports) module.exports = API_OCENY_TR;

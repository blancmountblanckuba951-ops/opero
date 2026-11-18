'use strict';
/* ============================================================================
   OPERO — WZORCE: WŁASNE UKŁADY DOKUMENTU, WŁASNE SZABLONY OPERATU,
   ZMIANA RODZAJU OPERATU BEZ UTRATY DANYCH
   ----------------------------------------------------------------------------
   Trzy rzeczy, które rzeczoznawca robi raz i chce mieć na zawsze:

   1. UKŁAD DOKUMENTU. Dostroił czcionkę, marginesy i okładkę pod swój bank —
      zapisuje to pod własną nazwą i wybiera jednym kliknięciem przy następnym
      operacie. Może wskazać układ domyślny dla nowych operatów.

   2. SZABLON OPERATU. Stałe elementy pracy: cel wyceny, podstawy prawne,
      źródła, klauzule, załączniki, zestaw cech rynkowych z wagami, układ
      dokumentu. Szablon NIGDY nie niesie danych konkretnej sprawy: adresu,
      klienta, księgi, transakcji, zdjęć ani dat.

   3. ZMIANA RODZAJU. Zaczął operat jako „lokal", a to dom — zmienia rodzaj
      i nie wpisuje drugi raz adresu, klienta, księgi i zdjęć. To, czego
      przenieść nie wolno (transakcje i cechy innego rynku, metoda), program
      wymienia z nazwy, zanim cokolwiek zrobi.

   Moduł jest czystą logiką — bez okna i bez dysku — żeby dało się go sprawdzić
   testem. Zapis robi program główny, do tego samego pliku co profil.
   ========================================================================= */

const WZ_MAKS_UKLADOW = 12;
const WZ_MAKS_SZABLONOW = 20;
const WZ_MAKS_NAZWA = 60;

/** Pola wyglądu, które tworzą układ — i dozwolone wartości każdego z nich. */
const WZ_POLA_UKLADU = {
  theme: { typ: 'wybor', opcje: ['gold', 'navy', 'graphite', 'forest'], domyslna: 'gold' },
  accent: { typ: 'kolor', domyslna: '#c99a2e' },
  fontFamily: { typ: 'tekst', maks: 80, domyslna: "Georgia, 'Times New Roman', serif" },
  headingStyle: { typ: 'wybor', opcje: ['line', 'band', 'minimal'], domyslna: 'line' },
  coverStyle: { typ: 'wybor', opcje: ['classic', 'minimal', 'photo'], domyslna: 'classic' },
  bodyFontSize: { typ: 'liczba', min: 8, max: 13, domyslna: 10.2 },
  lineHeight: { typ: 'liczba', min: 1.15, max: 1.8, domyslna: 1.38 },
  pageMarginMm: { typ: 'liczba', min: 10, max: 30, domyslna: 15 },
  tableDensity: { typ: 'wybor', opcje: ['compact', 'normal', 'comfortable'], domyslna: 'normal' },
  photoColumns: { typ: 'liczba', min: 1, max: 3, calkowita: true, domyslna: 2 },
  showToc: { typ: 'haczyk', domyslna: true },
  showIndexes: { typ: 'haczyk', domyslna: true },
  showHeaderFooter: { typ: 'haczyk', domyslna: true },
};
const WZ_KLUCZE_UKLADU = Object.keys(WZ_POLA_UKLADU);

function wzTekst(v, maks = 400) { return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, maks); }
function wzKopia(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function wzId(przedrostek) {
  return `${przedrostek}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
function wzUprosc(t) {
  return String(t || '').toLowerCase().replace(/ł/g, 'l').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Jedna wartość wyglądu sprowadzona do dozwolonej — żadna nie przejdzie „jak leci". */
function wzWartosc(klucz, v) {
  const p = WZ_POLA_UKLADU[klucz];
  if (!p) return undefined;
  if (p.typ === 'haczyk') return v === undefined || v === null ? p.domyslna : (v === true || v === 'true' || v === 1);
  if (p.typ === 'liczba') {
    let n = Number(String(v ?? '').replace(',', '.'));
    if (!Number.isFinite(n)) n = p.domyslna;
    n = Math.min(p.max, Math.max(p.min, n));
    return p.calkowita ? Math.round(n) : Math.round(n * 100) / 100;
  }
  if (p.typ === 'wybor') return p.opcje.includes(String(v)) ? String(v) : p.domyslna;
  if (p.typ === 'kolor') return /^#[0-9a-f]{6}$/i.test(String(v || '').trim()) ? String(v).trim().toLowerCase() : p.domyslna;
  const t = wzTekst(v, p.maks).replace(/[<>{};]/g, '');
  return t || p.domyslna;
}

function wzSzata(zrodlo) {
  const out = {};
  for (const k of WZ_KLUCZE_UKLADU) out[k] = wzWartosc(k, (zrodlo || {})[k]);
  return out;
}

/* ------------------------------------------------------------------ układy */

/** Bieżący wygląd operatu jako układ pod własną nazwą. */
function wzUkladZProjektu(project, nazwa) {
  const n = wzTekst(nazwa, WZ_MAKS_NAZWA);
  if (!n) throw new Error('Podaj nazwę układu — po niej rozpoznasz go na liście.');
  return { id: wzId('uklad'), nazwa: n, szata: wzSzata(project && project.appearance), utworzono: new Date().toISOString() };
}

/** Czyści układ wczytany z dysku. Zwraca null, gdy to nie jest układ. */
function wzUkladCzysty(u) {
  if (!u || typeof u !== 'object') return null;
  const nazwa = wzTekst(u.nazwa, WZ_MAKS_NAZWA);
  const id = wzTekst(u.id, 60);
  if (!nazwa || !/^uklad-[a-z0-9]+$/i.test(id)) return null;
  return { id, nazwa, szata: wzSzata(u.szata), utworzono: wzTekst(u.utworzono, 40) };
}

/**
 * Dopisuje układ do listy. Ta sama nazwa (bez względu na wielkość liter
 * i ogonki) NADPISUJE stary — „Bank PKO" zapisany drugi raz to poprawka,
 * a nie drugi kafelek o tej samej nazwie.
 */
function wzUkladDodaj(lista, uklad) {
  const czysty = wzUkladCzysty(uklad);
  if (!czysty) throw new Error('To nie jest poprawny układ.');
  const stare = (lista || []).map(wzUkladCzysty).filter(Boolean);
  const i = stare.findIndex(x => wzUprosc(x.nazwa) === wzUprosc(czysty.nazwa));
  if (i >= 0) { czysty.id = stare[i].id; stare[i] = czysty; return { lista: stare, nadpisano: true, uklad: czysty }; }
  if (stare.length >= WZ_MAKS_UKLADOW) throw new Error(`Możesz mieć najwyżej ${WZ_MAKS_UKLADOW} własnych układów. Usuń któryś, żeby zapisać nowy.`);
  return { lista: [...stare, czysty], nadpisano: false, uklad: czysty };
}

function wzUkladUsun(lista, id) { return (lista || []).filter(u => u && u.id !== id); }

function wzUkladZmienNazwe(lista, id, nazwa) {
  const n = wzTekst(nazwa, WZ_MAKS_NAZWA);
  if (!n) throw new Error('Nazwa nie może być pusta.');
  if ((lista || []).some(u => u.id !== id && wzUprosc(u.nazwa) === wzUprosc(n))) throw new Error(`Masz już układ o nazwie „${n}".`);
  return (lista || []).map(u => (u.id === id ? { ...u, nazwa: n } : u));
}

/** Wpisuje układ do operatu. Tekstów nagłówka i stopki nie rusza — to dane sprawy. */
function wzUkladZastosuj(project, uklad) {
  const czysty = wzUkladCzysty(uklad);
  if (!czysty) throw new Error('Nie znam tego układu.');
  if (!project || typeof project !== 'object') throw new Error('Brak operatu.');
  project.appearance = Object.assign({}, project.appearance, czysty.szata, { stylPdf: czysty.id });
  return project.appearance;
}

function wzSzataZgodna(a, szata) {
  return WZ_KLUCZE_UKLADU.every(k => {
    const w = wzWartosc(k, (a || {})[k]), e = szata[k];
    if (typeof e === 'number') return Math.abs(Number(w) - e) < 0.001;
    return String(w).toLowerCase() === String(e).toLowerCase();
  });
}

/** Który własny układ jest teraz ustawiony — albo null. */
function wzUkladRozpoznaj(project, lista) {
  const a = (project && project.appearance) || {};
  const pasujace = (lista || []).filter(u => u && u.szata && wzSzataZgodna(a, u.szata));
  if (!pasujace.length) return null;
  return (pasujace.find(u => u.id === a.stylPdf) || pasujace[0]).id;
}

/* ---------------------------------------------------------------- szablony */

/** Co szablon przenosi — opisane słowami, bo to samo czyta człowiek w oknie. */
const WZ_SZABLON_NIESIE = [
  'cel wyceny i opis podejścia', 'podstawa metodyczna', 'podstawy prawne', 'źródła informacji',
  'klauzule', 'lista załączników', 'cechy rynkowe ze skalami i wagami', 'ustawienia trendu i ocen',
  'układ dokumentu', 'stawki do kalkulacji wynagrodzenia',
];
const WZ_SZABLON_NIE_NIESIE = [
  'adres i opis nieruchomości', 'zleceniodawca', 'księga wieczysta i ewidencja', 'transakcje',
  'zdjęcia i dokumenty', 'daty', 'wynik wyceny',
];

function wzLista(v, maksPozycji = 60, maksZnakow = 600) {
  return (Array.isArray(v) ? v : []).map(x => String(x ?? '').trim().slice(0, maksZnakow)).filter(Boolean).slice(0, maksPozycji);
}

/** Cecha rynkowa bez śladu konkretnej sprawy: zostaje definicja, skala i waga. */
function wzCecha(c) {
  if (!c || typeof c !== 'object') return null;
  const nazwa = wzTekst(c.name, 160);
  if (!nazwa) return null;
  const out = {
    name: nazwa,
    scaleMode: ['two', 'three', 'five'].includes(c.scaleMode) ? c.scaleMode : 'three',
    weight: Number.isFinite(Number(c.weight)) ? Number(c.weight) : 0,
    scaleMin: wzTekst(c.scaleMin), scaleLow: wzTekst(c.scaleLow), scaleAvg: wzTekst(c.scaleAvg),
    scaleHigh: wzTekst(c.scaleHigh), scaleMax: wzTekst(c.scaleMax),
  };
  if (c.wzorzec) out.wzorzec = wzTekst(c.wzorzec, 60);
  return out;
}

function wzSzablonDane(project) {
  const p = project || {};
  const v = p.valuation || {}, m = p.market || {}, k = p.costing || {};
  return {
    valuation: {
      purpose: String(v.purpose || '').slice(0, 600),
      approachDescription: String(v.approachDescription || '').slice(0, 3000),
      roundTo: Number(v.roundTo) > 0 ? Number(v.roundTo) : 1000,
    },
    methodicalBasis: String(p.methodicalBasis || '').slice(0, 4000),
    legalBases: wzLista(p.legalBases),
    sources: wzLista(p.sources),
    attachments: wzLista(p.attachments),
    clauses: String(p.clauses || '').slice(0, 8000),
    market: {
      ratingMode: wzTekst(m.ratingMode, 20) || 'three',
      weightMethod: wzTekst(m.weightMethod, 30) || 'manual',
      weightJustification: String(m.weightJustification || '').slice(0, 3000),
      trendSourceMode: wzTekst(m.trendSourceMode, 20) || 'pairs',
      regressionBasis: wzTekst(m.regressionBasis, 20) || 'mean',
      trendPrecisionMode: wzTekst(m.trendPrecisionMode, 20) || 'rounded',
      trendRoundDigits: Number.isFinite(Number(m.trendRoundDigits)) ? Number(m.trendRoundDigits) : 4,
      features: (Array.isArray(m.features) ? m.features : []).map(wzCecha).filter(Boolean).slice(0, 30),
    },
    appearance: Object.assign(wzSzata(p.appearance), {
      headerText: wzTekst((p.appearance || {}).headerText, 200),
      footerText: wzTekst((p.appearance || {}).footerText, 200),
    }),
    costing: {
      hourlyRate: Number(k.hourlyRate) || 0, costPerKm: Number(k.costPerKm) || 0,
      vatRate: Number.isFinite(Number(k.vatRate)) ? Number(k.vatRate) : 23, vatExempt: !!k.vatExempt,
    },
  };
}

/** Bieżący operat jako szablon — bez żadnych danych sprawy. */
function wzSzablonZProjektu(project, nazwa) {
  const n = wzTekst(nazwa, WZ_MAKS_NAZWA);
  if (!n) throw new Error('Podaj nazwę szablonu — np. „Lokal dla banku" albo „Dom — podział majątku".');
  const modul = wzTekst(project && project.module && project.module.code, 40) || 'local_kcm';
  return { id: wzId('szablon'), nazwa: n, modul, dane: wzSzablonDane(project), utworzono: new Date().toISOString() };
}

function wzSzablonCzysty(s) {
  if (!s || typeof s !== 'object' || !s.dane || typeof s.dane !== 'object') return null;
  const nazwa = wzTekst(s.nazwa, WZ_MAKS_NAZWA), id = wzTekst(s.id, 60), modul = wzTekst(s.modul, 40);
  if (!nazwa || !modul || !/^szablon-[a-z0-9]+$/i.test(id)) return null;
  // Przepuszczamy dane przez ten sam filtr co przy tworzeniu — plik na dysku
  // mógł zostać zmieniony ręcznie, a jego zawartość idzie prosto do operatu.
  const dane = wzSzablonDane({
    valuation: s.dane.valuation, methodicalBasis: s.dane.methodicalBasis, legalBases: s.dane.legalBases,
    sources: s.dane.sources, attachments: s.dane.attachments, clauses: s.dane.clauses,
    market: s.dane.market, appearance: s.dane.appearance, costing: s.dane.costing,
  });
  return { id, nazwa, modul, dane, utworzono: wzTekst(s.utworzono, 40) };
}

function wzSzablonDodaj(lista, szablon) {
  const czysty = wzSzablonCzysty(szablon);
  if (!czysty) throw new Error('To nie jest poprawny szablon.');
  const stare = (lista || []).map(wzSzablonCzysty).filter(Boolean);
  const i = stare.findIndex(x => x.modul === czysty.modul && wzUprosc(x.nazwa) === wzUprosc(czysty.nazwa));
  if (i >= 0) { czysty.id = stare[i].id; stare[i] = czysty; return { lista: stare, nadpisano: true, szablon: czysty }; }
  if (stare.length >= WZ_MAKS_SZABLONOW) throw new Error(`Możesz mieć najwyżej ${WZ_MAKS_SZABLONOW} szablonów. Usuń któryś, żeby zapisać nowy.`);
  return { lista: [...stare, czysty], nadpisano: false, szablon: czysty };
}

function wzSzablonUsun(lista, id) { return (lista || []).filter(s => s && s.id !== id); }

/**
 * Wpisuje szablon do ŚWIEŻEGO operatu tego samego rodzaju.
 * `noweId` daje identyfikatory cech — program ma na to własną funkcję.
 */
function wzSzablonZastosuj(project, szablon, { noweId } = {}) {
  const s = wzSzablonCzysty(szablon);
  if (!s) throw new Error('Nie znam tego szablonu.');
  if (!project || typeof project !== 'object') throw new Error('Brak operatu.');
  const kod = (project.module && project.module.code) || 'local_kcm';
  if (kod !== s.modul) throw new Error('Szablon jest dla innego rodzaju operatu.');
  const d = s.dane;
  const id = typeof noweId === 'function' ? noweId : () => wzId('c');
  project.valuation = Object.assign({}, project.valuation, {
    purpose: d.valuation.purpose || (project.valuation || {}).purpose,
    approachDescription: d.valuation.approachDescription || (project.valuation || {}).approachDescription,
    roundTo: d.valuation.roundTo,
  });
  if (d.methodicalBasis) project.methodicalBasis = d.methodicalBasis;
  if (d.legalBases.length) project.legalBases = wzKopia(d.legalBases);
  if (d.sources.length) project.sources = wzKopia(d.sources);
  if (d.attachments.length) project.attachments = wzKopia(d.attachments);
  project.clauses = d.clauses;
  const cechy = d.market.features.map(c => Object.assign(
    { id: id(), rating: 'Przeciętna', ratingNote: '', pairs: [] }, wzKopia(c)));
  project.market = Object.assign({}, project.market, {
    ratingMode: d.market.ratingMode, weightMethod: d.market.weightMethod,
    weightJustification: d.market.weightJustification, trendSourceMode: d.market.trendSourceMode,
    regressionBasis: d.market.regressionBasis, trendPrecisionMode: d.market.trendPrecisionMode,
    trendRoundDigits: d.market.trendRoundDigits,
  }, cechy.length ? { features: cechy } : {});
  const naglowki = {};
  if (d.appearance.headerText) naglowki.headerText = d.appearance.headerText;
  if (d.appearance.footerText) naglowki.footerText = d.appearance.footerText;
  project.appearance = Object.assign({}, project.appearance, wzSzata(d.appearance), naglowki);
  project.costing = Object.assign({}, project.costing, d.costing);
  project.szablon = { id: s.id, nazwa: s.nazwa };
  return project;
}

/* ------------------------------------------------------------ zmiana rodzaju */

const WZ_PRZENOSZONE = [
  ['client', 'zleceniodawca'], ['author', 'autor operatu'], ['formalBasis', 'podstawa formalna'],
  ['legal', 'księga wieczysta i stan prawny'], ['egib', 'dane ewidencyjne'], ['planning', 'przeznaczenie w planie'],
  ['location', 'opis lokalizacji'], ['building', 'opis budynku'], ['local', 'opis lokalu'],
  ['photos', 'zdjęcia'], ['files', 'dokumenty'], ['costing', 'kalkulacja wynagrodzenia'], ['clauses', 'klauzule'],
];
const WZ_ADRES = ['city', 'district', 'street', 'buildingNo', 'localNo', 'staircase', 'commune', 'county',
  'voivodeship', 'postcode', 'punkt', 'usableArea', 'kwArea', 'rooms', 'floor', 'balconyArea', 'basementName',
  'basementArea', 'landArea', 'plotDescription', 'auxiliaryBuildings', 'builtUp'];
const WZ_DATY = ['reportDate', 'valuationDate', 'priceLevelDate', 'inspectionDate', 'legalStateDate', 'roundTo'];
const WZ_OPISY = ['legal', 'egib', 'planning', 'location', 'building', 'local'];

function wzPuste(v) {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return !v.trim();
  if (typeof v === 'number') return v === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v).every(wzPuste);
  return false;
}

/**
 * Co się stanie przy zmianie rodzaju — policzone ZANIM cokolwiek się zmieni,
 * żeby okno potwierdzenia mówiło prawdę o tym konkretnym operacie.
 */
function wzZmianaPlan(stary) {
  const s = stary || {};
  const zostaje = [], przepada = [];
  if (WZ_ADRES.some(k => !wzPuste((s.property || {})[k]))) zostaje.push('adres i powierzchnie nieruchomości');
  for (const [klucz, opis] of WZ_PRZENOSZONE) if (!wzPuste(s[klucz])) zostaje.push(opis);
  if (WZ_DATY.slice(0, 5).some(k => !wzPuste((s.valuation || {})[k]))) zostaje.push('daty operatu');
  zostaje.push('układ dokumentu');
  const tr = ((s.market || {}).transactions || []).length;
  if (tr) przepada.push(`${tr} ${tr === 1 ? 'transakcja' : tr < 5 ? 'transakcje' : 'transakcji'} — to dane innego rynku`);
  przepada.push('cechy rynkowe i wagi — nowy rodzaj ma własny zestaw');
  przepada.push('metoda, cel wyceny i podstawa metodyczna — zostaną ustawione dla nowego rodzaju');
  if (!wzPuste((s.narratives || {}).market) || !wzPuste((s.narratives || {}).result)) przepada.push('opis rynku i uzasadnienie wyniku');
  if (!wzPuste(s.income && s.income.leases)) przepada.push('umowy najmu i dane dochodowe');
  return { zostaje, przepada };
}

/**
 * Przenosi wspólne dane ze starego operatu do świeżego operatu nowego rodzaju.
 * `nowy` to wynik `freshProject(kod)` — funkcja go uzupełnia i zwraca.
 */
function wzZmienRodzaj(stary, nowy) {
  if (!stary || !nowy) throw new Error('Brak operatu.');
  const s = stary, n = nowy;
  for (const [klucz] of WZ_PRZENOSZONE) {
    if (wzPuste(s[klucz])) continue;
    if (Array.isArray(s[klucz]) || typeof s[klucz] !== 'object') n[klucz] = wzKopia(s[klucz]);
    else n[klucz] = Object.assign({}, n[klucz], wzKopia(s[klucz]));
  }
  n.property = n.property || {};
  for (const k of WZ_ADRES) if (!wzPuste((s.property || {})[k])) n.property[k] = wzKopia(s.property[k]);
  n.valuation = n.valuation || {};
  for (const k of WZ_DATY) if (!wzPuste((s.valuation || {})[k])) n.valuation[k] = s.valuation[k];
  // Opisy stanu faktycznego i prawnego zostają; opis rynku i wynik — nie.
  n.narratives = n.narratives || {};
  for (const k of WZ_OPISY) if (!wzPuste((s.narratives || {})[k])) n.narratives[k] = s.narratives[k];
  // Wygląd zostaje, ale tytuł w nagłówku stron musi nazywać NOWY rodzaj.
  const naglowek = (n.appearance || {}).headerText;
  n.appearance = Object.assign({}, n.appearance, wzKopia(s.appearance || {}));
  if (naglowek) n.appearance.headerText = naglowek;
  // To wciąż ten sam operat: zostaje jego identyfikator i data założenia.
  n.meta = Object.assign({}, n.meta, {
    id: (s.meta || {}).id || (n.meta || {}).id,
    createdAt: (s.meta || {}).createdAt || (n.meta || {}).createdAt,
    status: (s.meta || {}).status || 'Roboczy',
  });
  return n;
}

/* --------------------------------------------------------------- stan na dysku */

/** Cały zapis wzorców, oczyszczony. Tę funkcję woła program główny przed zapisem. */
function wzStanCzysty(stan) {
  const s = stan && typeof stan === 'object' ? stan : {};
  const uklady = (Array.isArray(s.uklady) ? s.uklady : []).map(wzUkladCzysty).filter(Boolean).slice(0, WZ_MAKS_UKLADOW);
  const szablony = (Array.isArray(s.szablony) ? s.szablony : []).map(wzSzablonCzysty).filter(Boolean).slice(0, WZ_MAKS_SZABLONOW);
  const d = wzTekst(s.domyslnyUklad, 60);
  return { uklady, szablony, domyslnyUklad: d };
}

const API_WZ = {
  MAKS_UKLADOW: WZ_MAKS_UKLADOW, MAKS_SZABLONOW: WZ_MAKS_SZABLONOW, KLUCZE_UKLADU: WZ_KLUCZE_UKLADU,
  SZABLON_NIESIE: WZ_SZABLON_NIESIE, SZABLON_NIE_NIESIE: WZ_SZABLON_NIE_NIESIE,
  szata: wzSzata, wartosc: wzWartosc,
  ukladZProjektu: wzUkladZProjektu, ukladDodaj: wzUkladDodaj, ukladUsun: wzUkladUsun,
  ukladZmienNazwe: wzUkladZmienNazwe, ukladZastosuj: wzUkladZastosuj, ukladRozpoznaj: wzUkladRozpoznaj,
  szablonZProjektu: wzSzablonZProjektu, szablonDodaj: wzSzablonDodaj, szablonUsun: wzSzablonUsun,
  szablonZastosuj: wzSzablonZastosuj,
  zmianaPlan: wzZmianaPlan, zmienRodzaj: wzZmienRodzaj, stanCzysty: wzStanCzysty,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_WZ;
if (typeof window !== 'undefined') window.OperoWzorce = API_WZ;

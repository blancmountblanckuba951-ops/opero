/* OPERO — pamiec wzorcow
 *
 * Rzeczoznawca wgrywa swoje wczesniejsze operaty. Program dzieli je na
 * rozdzialy i zapamietuje jako WZOR STYLU: jak autor zaczyna opis lokalizacji,
 * jak dlugie pisze akapity, jakim jezykiem opisuje budynek. Agent Redaktor
 * dostaje potem fragment takiego wzoru razem z poleceniem.
 *
 * Wzor uczy stylu, nie faktow. Dlatego przy zapamietywaniu:
 *  - liczby sa zastepowane znakiem „‹…›” – nie da sie ich przepisac
 *    do nowego operatu,
 *  - numery ksiag, PESEL, telefony i adresy e-mail sa usuwane,
 *  - tresc dzialow ksiegi wieczystej nie jest zapamietywana wcale.
 * Wzorce leza na tym komputerze, razem z ustawieniami programu.
 */
'use strict';

const PW_LIMIT_WZORCOW = 1000, PW_LIMIT_SEKCJI = 2500, PW_LIMIT_PLIKU = 400000;

/* Rozdzial operatu → klucz. Kolejnosc ma znaczenie: pierwszy pasujacy wygrywa. */
const PW_ROZDZIALY = [
  ['klauzule', 'Klauzule i zastrzeżenia', /klauzul|zastrze[żz]e|ogranicze\p{L}* odpowiedzialno/iu],
  ['wynik', 'Wynik i wnioski', /wynik\p{L}* wyceny|warto[śs][ćc] ko[ńn]cow|okre[śs]leni\p{L}* warto[śs]ci|wniosk|podsumowani|uzasadnieni\p{L}* wyniku/iu],
  ['rynek', 'Analiza rynku', /analiz\p{L}* (?:i charakterystyk\p{L}* )?rynku|charakterystyk\p{L}* rynku|rynek\p{L}* (?:lokaln|nieruchomo)|rynku nieruchomo/iu],
  ['cechy', 'Cechy rynkowe i wagi', /cech\p{L}* rynkow|wag\p{L}* cech|atrybut/iu],
  ['metoda', 'Podejście i metoda', /podej[śs]ci\p{L}*|metod\p{L}* wyceny|wyb[óo]r\p{L}* (?:podej|metod)|technik\p{L}* wyceny|procedur\p{L}* szacowania/iu],
  ['planowanie', 'Przeznaczenie planistyczne', /przeznaczeni|plan\p{L}* miejscow|planistyczn|studium|warunk\p{L}* zabudowy|plan og[óo]lny/iu],
  ['ewidencja', 'Dane ewidencyjne', /ewidencj|dane ewidencyjne|egib/iu],
  ['prawny', 'Stan prawny', /stan\p{L}* prawn|ksi[ęe]g\p{L}* wieczyst/iu],
  ['budynek', 'Opis budynku', /opis\p{L}* budynku|budynek|budynku|stan\p{L}* techniczn\p{L}* budynku/iu],
  ['lokal', 'Opis lokalu', /opis\p{L}* lokalu|lokal\p{L}* mieszkaln|opis\p{L}* mieszkania|standard\p{L}* lokalu/iu],
  ['lokalizacja', 'Lokalizacja i otoczenie', /lokalizacj|po[łl]o[żz]eni|otoczeni|s[ąa]siedztw/iu],
  ['przedmiot', 'Przedmiot i zakres wyceny', /przedmiot\p{L}*|zakres\p{L}* wyceny|cel\p{L}* wyceny|podstaw\p{L}* (?:formaln|opracowania)/iu],
  ['dzialka', 'Opis działki', /opis\p{L}* (?:dzia[łl]ki|gruntu|nieruchomo[śs]ci gruntow)|dzia[łl]k\p{L}* gruntu|zagospodarowani/iu],
];

/* Pole operatu → rozdzial wzorca. */
const PW_POLA = [
  [/^location\.|^narratives\.location/, 'lokalizacja'], [/^building\.|^narratives\.building/, 'budynek'], [/^local\.|^narratives\.local/, 'lokal'],
  [/^planning\.|^narratives\.planning/, 'planowanie'], [/^egib\.|^narratives\.egib/, 'ewidencja'], [/^narratives\.legal/, 'prawny'],
  [/^market\.weightJustification/, 'cechy'], [/^market\.|^narratives\.market|^narratives\.extreme/, 'rynek'],
  [/^valuation\.approachDescription|^methodicalBasis/, 'metoda'], [/^narratives\.result/, 'wynik'], [/^clauses/, 'klauzule'],
  [/^formalBasis|^narratives\.(subject|scope)|^valuation\.purpose/, 'przedmiot'], [/^property\.plotDescription/, 'dzialka'],
];

function pwRozdzialPola(sciezka){
  const s = String(sciezka || '');
  for (const [re, klucz] of PW_POLA) if (re.test(s)) return klucz;
  return '';
}

/** Usuwa dane, ktorych wzor nie potrzebuje, i zamienia liczby na „‹…›”. */
function pwOczysc(tekst){
  let t = String(tekst == null ? '' : tekst);
  t = t.replace(/\b[A-Z]{2}[0-9A-Z]{2}\s*\/\s*\d{8}\s*\/\s*\d\b/g, '‹nr księgi›');
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '‹e-mail›');
  t = t.replace(/\b\d{11}\b/g, '‹…›');
  t = t.replace(/(?:\+48[\s-]?)?\b\d{3}[\s-]\d{3}[\s-]\d{3}\b/g, '‹telefon›');
  // liczby (takze z odstepami tysiecy, przecinkiem i ulamkiem dzialki)
  t = t.replace(/\bm2\b/g, 'm²').replace(/\bm3\b/g, 'm³');
  t = t.replace(/\d+(?:[  .,/\-]\d+)*/g, '‹…›');
  return t.replace(/(‹…›\s*){2,}/g, '‹…› ').replace(/[ \t]{2,}/g, ' ').trim();
}

function pwCzyNaglowek(linia){
  const l = String(linia || '').trim();
  if (l.length < 4 || l.length > 110) return false;
  if (/[.;,:]$/.test(l) && !/^\d/.test(l) && !/:$/.test(l)) return false;
  const numer = /^(?:\d{1,2}(?:\.\d{1,2}){0,3}\.?|[IVXL]{1,5}\.|[A-Z]\.|§\s*\d+\.?)\s+\S/.test(l);
  const litery = l.replace(/[^\p{L}]/gu, '');
  const wielkie = litery.length >= 4 && litery === litery.toUpperCase();
  return numer || wielkie;
}

function pwKluczNaglowka(linia){
  const l = String(linia || '');
  for (const [klucz, , re] of PW_ROZDZIALY) if (re.test(l)) return klucz;
  return '';
}

/** Tekst calego operatu → rozdzialy. Rozdzialy bez rozpoznanego tytulu sa pomijane. */
function pwPodziel(tekst){
  const linie = String(tekst || '').replace(/\r/g, '').slice(0, PW_LIMIT_PLIKU).split('\n');
  const sekcje = {};
  let klucz = '', bufor = [];
  const zamknij = () => {
    const t = bufor.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (klucz && klucz !== 'prawny' && t.length >= 120){
      const czysty = pwOczysc(t).slice(0, PW_LIMIT_SEKCJI);
      // Rozdzial zlozony glownie z liczb i tabel nie uczy stylu.
      const litery = czysty.replace(/[^\p{L}]/gu, '').length;
      if (litery >= 100 && litery / czysty.length > 0.55) sekcje[klucz] = sekcje[klucz] ? (sekcje[klucz] + '\n\n' + czysty).slice(0, PW_LIMIT_SEKCJI) : czysty;
    }
    bufor = [];
  };
  for (const linia of linie){
    if (pwCzyNaglowek(linia)){
      zamknij();
      klucz = pwKluczNaglowka(linia);
      continue;
    }
    bufor.push(linia);
  }
  zamknij();
  return sekcje;
}

function pwId(){ return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

function pwZTekstu(nazwa, tekst, opcje){
  const o = opcje || {};
  const sekcje = pwPodziel(tekst);
  const klucze = Object.keys(sekcje);
  if (!klucze.length) return { ok: false, powod: String(tekst || '').trim().length < 400 ? 'Tekst jest za krótki — wklej albo wczytaj cały operat.' : 'Nie rozpoznałem w tekście rozdziałów operatu (np. „Opis lokalizacji", „Analiza rynku"). Sprawdź, czy tytuły rozdziałów stoją w osobnych liniach.' };
  return { ok: true, wzorzec: {
    id: String(o.id || pwId()), nazwa: String(nazwa || 'Operat').replace(/\.(docx|txt|md)$/i, '').slice(0, 90) || 'Operat',
    rodzaj: String(o.rodzaj || ''), kiedy: String(o.teraz || new Date().toISOString()), sekcje,
    znaki: klucze.reduce((s, k) => s + sekcje[k].length, 0),
  } };
}

function pwStanCzysty(stan){
  const lista = Array.isArray(stan?.wzorce) ? stan.wzorce : [];
  const dobre = [];
  for (const w of lista.slice(0, PW_LIMIT_WZORCOW)){
    if (!w || typeof w !== 'object' || !w.sekcje || typeof w.sekcje !== 'object') continue;
    const sekcje = {};
    for (const [klucz] of PW_ROZDZIALY){ const t = w.sekcje[klucz]; if (typeof t === 'string' && t.trim()) sekcje[klucz] = t.slice(0, PW_LIMIT_SEKCJI); }
    if (!Object.keys(sekcje).length) continue;
    dobre.push({ id: String(w.id || pwId()).slice(0, 40), nazwa: String(w.nazwa || 'Operat').slice(0, 90), rodzaj: String(w.rodzaj || '').slice(0, 40), kiedy: String(w.kiedy || '').slice(0, 30), sekcje, znaki: Object.values(sekcje).reduce((s, t) => s + t.length, 0) });
  }
  return { wzorce: dobre, uzywaj: stan?.uzywaj !== false, uczSie: stan?.uczSie !== false };
}

function pwDodaj(stan, wzorzec){
  const s = pwStanCzysty(stan);
  if (s.wzorce.length >= PW_LIMIT_WZORCOW) return { ok: false, powod: `W pamięci jest już ${PW_LIMIT_WZORCOW} operatów — usuń któryś, żeby dodać nowy.`, stan: s };
  s.wzorce.unshift(wzorzec);
  return { ok: true, stan: pwStanCzysty(s) };
}

/**
 * Wiele operatow naraz (import folderu). Jeden przebieg zamiast tysiaca
 * osobnych zapisow. Pomija operaty o tej samej nazwie i tej samej tresci.
 */
function pwDodajWiele(stan, pliki, opcje){
  const s = pwStanCzysty(stan), o = opcje || {};
  const znane = new Set(s.wzorce.map(w => `${w.nazwa}|${w.znaki}`));
  const dodane = [], odrzucone = [];
  let nowe = [];
  for (const pl of (pliki || [])){
    if (!pl || !pl.ok){ odrzucone.push({ nazwa: pl?.nazwa || 'plik', powod: pl?.powod || 'nie odczytano' }); continue; }
    if (s.wzorce.length + nowe.length >= PW_LIMIT_WZORCOW){ odrzucone.push({ nazwa: pl.nazwa, powod: `pamięć jest pełna (${PW_LIMIT_WZORCOW} operatów)` }); continue; }
    const r = pwZTekstu(pl.nazwa, pl.tekst, { rodzaj: o.rodzaj || '', teraz: o.teraz });
    if (!r.ok){ odrzucone.push({ nazwa: pl.nazwa, powod: r.powod }); continue; }
    const klucz = `${r.wzorzec.nazwa}|${r.wzorzec.znaki}`;
    if (znane.has(klucz)){ odrzucone.push({ nazwa: pl.nazwa, powod: 'ten operat jest już w pamięci' }); continue; }
    znane.add(klucz); nowe.push(r.wzorzec); dodane.push({ nazwa: r.wzorzec.nazwa, rozdzialow: Object.keys(r.wzorzec.sekcje).length });
  }
  s.wzorce = [...nowe, ...s.wzorce];
  return { stan: nowe.length ? pwStanCzysty(s) : s, dodane, odrzucone };
}

/**
 * Wzorzec z operatu zatwierdzonego w programie: program uczy sie na tym, co
 * rzeczoznawca sam zaakceptowal. `teksty`: [{sciezka, tekst}].
 */
function pwZProjektu(nazwa, teksty, opcje){
  const o = opcje || {}, sekcje = {};
  for (const t of (teksty || [])){
    const klucz = pwRozdzialPola(t.sciezka);
    if (!klucz || klucz === 'prawny') continue;
    const czysty = pwOczysc(t.tekst);
    if (czysty.replace(/[^\p{L}]/gu, '').length < 100) continue;
    sekcje[klucz] = (sekcje[klucz] ? sekcje[klucz] + '\n\n' + czysty : czysty).slice(0, PW_LIMIT_SEKCJI);
  }
  const klucze = Object.keys(sekcje);
  if (!klucze.length) return { ok: false, powod: 'W operacie nie ma jeszcze opisów, z których można się uczyć.' };
  return { ok: true, wzorzec: { id: String(o.id || pwId()), nazwa: String(nazwa || 'Operat').slice(0, 90), rodzaj: String(o.rodzaj || ''), kiedy: String(o.teraz || new Date().toISOString()), sekcje, znaki: klucze.reduce((x, k) => x + sekcje[k].length, 0), zProgramu: true } };
}

function pwUsun(stan, id){ const s = pwStanCzysty(stan); s.wzorce = s.wzorce.filter(w => w.id !== id); return s; }

/**
 * Fragmenty wzorca dla jednego pola. Pierwszenstwo maja operaty tego samego
 * rodzaju; z kazdego bierzemy poczatek rozdzialu, bo to tam widac styl.
 */
function pwDobierz(stan, sciezka, rodzaj, ile){
  const s = pwStanCzysty(stan);
  if (!s.uzywaj) return [];
  const klucz = pwRozdzialPola(sciezka); if (!klucz) return [];
  const kandydaci = s.wzorce.filter(w => w.sekcje[klucz]);
  kandydaci.sort((a, b) => (b.rodzaj === rodzaj) - (a.rodzaj === rodzaj));
  return kandydaci.slice(0, Math.max(1, Number(ile) || 2)).map(w => {
    let t = w.sekcje[klucz];
    if (t.length > 900){ const k = t.lastIndexOf('.', 900); t = t.slice(0, k > 400 ? k + 1 : 900); }
    return { zrodlo: w.nazwa, rozdzial: klucz, tekst: t };
  });
}

/** Dopisek do polecenia dla modelu. */
function pwDoPolecenia(probki){
  const l = (probki || []).filter(p => p && p.tekst);
  if (!l.length) return '';
  return ['', 'WZÓR STYLU — fragmenty wcześniejszych operatów autora (liczby zastąpiono znakiem ‹…›).',
    'Naśladuj układ, długość i ton. NIE przepisuj z wzoru żadnych nazw, miejsc ani faktów — fakty bierzesz wyłącznie z listy FAKTY.',
    ...l.map((p, i) => `--- wzór ${i + 1} ---\n${p.tekst}`), '--- koniec wzoru ---'].join('\n');
}

function pwPodsumowanie(stan){
  const s = pwStanCzysty(stan);
  const rozdzialy = {};
  for (const w of s.wzorce) for (const k of Object.keys(w.sekcje)) rozdzialy[k] = (rozdzialy[k] || 0) + 1;
  return { ile: s.wzorce.length, uzywaj: s.uzywaj, uczSie: s.uczSie, znaki: s.wzorce.reduce((x, w) => x + (w.znaki || 0), 0), rozdzialy: PW_ROZDZIALY.filter(r => rozdzialy[r[0]]).map(r => ({ klucz: r[0], nazwa: r[1], ile: rozdzialy[r[0]] })) };
}

/** Tekst z pliku Word (word/document.xml) – akapity w osobnych liniach. */
function pwTekstZDocx(xml){
  const x = String(xml || '');
  const akapity = x.split(/<\/w:p>/);
  const odk = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
  return akapity.map(a => {
    const czesci = [];
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\s*\/>|<w:br\s*\/>/g; let m;
    while ((m = re.exec(a))) czesci.push(m[1] != null ? odk(m[1]) : ' ');
    return czesci.join('').trim();
  }).filter(Boolean).join('\n');
}

const API_PAMIEC = {
  ROZDZIALY: PW_ROZDZIALY.map(r => ({ klucz: r[0], nazwa: r[1] })), LIMIT: PW_LIMIT_WZORCOW,
  oczysc: pwOczysc, czyNaglowek: pwCzyNaglowek, kluczNaglowka: pwKluczNaglowka, podziel: pwPodziel, zTekstu: pwZTekstu,
  stanCzysty: pwStanCzysty, dodaj: pwDodaj, dodajWiele: pwDodajWiele, zProjektu: pwZProjektu, usun: pwUsun, dobierz: pwDobierz, doPolecenia: pwDoPolecenia,
  podsumowanie: pwPodsumowanie, rozdzialPola: pwRozdzialPola, tekstZDocx: pwTekstZDocx,
};
if (typeof window !== 'undefined') window.OperoPamiec = API_PAMIEC;
if (typeof module !== 'undefined' && module.exports) module.exports = API_PAMIEC;

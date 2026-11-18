/* OPERO — Wiedza z podręcznika rzeczoznawcy (wiedza-podrecznik.js)
 *
 * Rzeczoznawca wgrywa SWÓJ podręcznik (PDF – także skan) i swoje wzory.
 * Program trzyma tekst stronami, wyłącznie na tym komputerze, i umie w nim
 * znaleźć fragmenty dotyczące danego kroku operatu („procedura korygowania
 * ceny średniej", „klauzule", „wagi cech").
 *
 * Agenci używają tych fragmentów jako ZASAD: model dostaje je z poleceniem
 * „stosuj, nie przepisuj”. Do operatu nie trafia tekst podręcznika, tylko
 * odwołanie do strony – tak jak rzeczoznawca powołuje się na literaturę.
 *
 * Moduł jest czysty (bez dostępu do dysku) – zapis robi proces główny.
 */
'use strict';

const PD_STOP = new Set('a aby ale albo ani bez bo by być był była było były czy dla do gdy gdzie go i ich im iż ja jak jako je jego jej jest jeszcze jeśli już każdy kiedy która które którego której który których ku lub ma mają może można na nad nie nich niż o od oraz po pod przez przy się są ta tak także te tego tej tem ten też to tu tylko tym w we według więc z za ze że zł m2 nr r'.split(' '));

function pdNorm(t){ return String(t || '').toLowerCase().replace(/[^\p{L}\d]+/gu, ' ').trim(); }
/** Bardzo prosty rdzeń: polskie końcówki fleksyjne odcinane do 6 liter. */
function pdRdzen(s){ return s.length <= 4 ? s : s.slice(0, Math.max(4, Math.min(6, s.length - 2))); }
function pdSlowa(t){ return pdNorm(t).split(' ').filter(x => x.length > 2 && !PD_STOP.has(x)).map(pdRdzen); }

function pdId(){ return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function pdStanCzysty(stan){
  const dok = Array.isArray(stan?.dokumenty) ? stan.dokumenty : [];
  return { dokumenty: dok.filter(d => d && Array.isArray(d.strony)).slice(0, 40).map(d => ({
    id: String(d.id || pdId()).slice(0, 40), nazwa: String(d.nazwa || 'Podręcznik').slice(0, 120), kiedy: String(d.kiedy || ''),
    zrodlo: d.zrodlo === 'ocr' ? 'ocr' : 'tekst',
    strony: d.strony.slice(0, 2000).map((s, i) => ({ nr: Number(s?.nr) || i + 1, tekst: String(s?.tekst || '').slice(0, 12000) })).filter(s => s.tekst.trim()),
  })).filter(d => d.strony.length) };
}

function pdDodaj(stan, dok){
  const s = pdStanCzysty(stan);
  const nowy = pdStanCzysty({ dokumenty: [{ ...dok, id: dok?.id || pdId(), kiedy: dok?.kiedy || new Date().toISOString() }] }).dokumenty[0];
  if (!nowy) return s;
  // Ten sam plik wgrany ponownie zastępuje poprzednią wersję.
  s.dokumenty = [nowy, ...s.dokumenty.filter(d => d.nazwa !== nowy.nazwa)];
  return s;
}
function pdUsun(stan, id){ const s = pdStanCzysty(stan); s.dokumenty = s.dokumenty.filter(d => d.id !== id); return s; }

function pdPodsumowanie(stan){
  const s = pdStanCzysty(stan);
  return { ile: s.dokumenty.length, stron: s.dokumenty.reduce((x, d) => x + d.strony.length, 0),
    dokumenty: s.dokumenty.map(d => ({ id: d.id, nazwa: d.nazwa, stron: d.strony.length, kiedy: d.kiedy, zrodlo: d.zrodlo })) };
}

/** Fragment strony wokół najgęstszego skupiska słów zapytania. */
function pdWycinek(tekst, rdzenie, dl){
  const t = String(tekst || ''), slowa = [...t.matchAll(/\p{L}[\p{L}\d]*/gu)];
  if (!slowa.length) return t.slice(0, dl);
  let najlepszy = 0, gdzie = 0;
  for (let i = 0; i < slowa.length; i++){
    let ile = 0; const od = slowa[i].index;
    for (let j = i; j < slowa.length && slowa[j].index - od < dl; j++) if (rdzenie.has(pdRdzen(slowa[j][0].toLowerCase()))) ile++;
    if (ile > najlepszy){ najlepszy = ile; gdzie = od; }
  }
  const start = Math.max(0, t.lastIndexOf('\n', gdzie - 1) + 1 > gdzie - 200 ? t.lastIndexOf('\n', gdzie - 1) + 1 : gdzie - 60);
  return t.slice(start, start + dl).replace(/-\n(\p{Ll})/gu, '$1').replace(/\s+/g, ' ').trim();
}

/** Wyszukiwanie: TF-IDF po rdzeniach, wynik – najlepsze strony z wycinkiem. */
function pdSzukaj(stan, zapytanie){
  const s = pdStanCzysty(stan), z = zapytanie || {};
  const q = pdSlowa(z.pytanie || '');
  if (!q.length || !s.dokumenty.length) return { wyniki: [] };
  const rdzenie = new Set(q);
  const strony = [];
  for (const d of s.dokumenty) for (const st of d.strony) strony.push({ d, st, slowa: pdSlowa(st.tekst) });
  const df = {}; for (const x of strony){ for (const r of new Set(x.slowa)) if (rdzenie.has(r)) df[r] = (df[r] || 0) + 1; }
  const N = strony.length;
  const wyniki = strony.map(x => {
    const tf = {}; for (const r of x.slowa) if (rdzenie.has(r)) tf[r] = (tf[r] || 0) + 1;
    let wynik = 0, trafione = 0;
    for (const r of rdzenie){ if (!tf[r]) continue; trafione++; wynik += (1 + Math.log(tf[r])) * Math.log(1 + N / (df[r] || 1)); }
    wynik *= trafione / rdzenie.size;
    return { x, wynik };
  }).filter(w => w.wynik > 0).sort((a, b) => b.wynik - a.wynik).slice(0, Math.min(8, Number(z.ile) || 3));
  return { wyniki: wyniki.map(w => ({ dokument: w.x.d.nazwa, strona: w.x.st.nr, wynik: Math.round(w.wynik * 100) / 100, wycinek: pdWycinek(w.x.st.tekst, rdzenie, Math.min(1500, Number(z.dlugosc) || 700)) })) };
}

/** Dopisek do polecenia dla modelu – zasady z podręcznika, z odwołaniem do strony. */
function pdDoPolecenia(wyniki){
  const l = (wyniki || []).filter(w => w && w.wycinek);
  if (!l.length) return '';
  return ['', 'ZASADY Z PODRĘCZNIKA RZECZOZNAWCY (stosuj je; NIE przepisuj tekstu podręcznika, pisz własnymi słowami o tej nieruchomości):',
    ...l.map(w => `--- ${w.dokument}, s. ${w.strona} ---\n${w.wycinek}`), '--- koniec zasad ---'].join('\n');
}

/** Czy dokument wygląda na podręcznik / opracowanie metodyczne (a nie na operat albo księgę). */
function pdCzyPodrecznik(strony){
  const t = (strony || []).slice(0, 40).map(s => s.tekst || '').join(' ');
  const n = (strony || []).length;
  const metod = (t.match(/podej[śs]ci|metod[ayę]|rzeczoznawc|wycen|operat|praktyk|ustaw[ay] o gospodarce/gi) || []).length;
  return n >= 12 && metod >= 25;
}

const API_PD = { stanCzysty: pdStanCzysty, dodaj: pdDodaj, usun: pdUsun, podsumowanie: pdPodsumowanie, szukaj: pdSzukaj, doPolecenia: pdDoPolecenia, czyPodrecznik: pdCzyPodrecznik, slowa: pdSlowa };
if (typeof window !== 'undefined') window.OperoWiedza = API_PD;
if (typeof module !== 'undefined' && module.exports) module.exports = API_PD;

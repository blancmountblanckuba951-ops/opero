'use strict';
/* ============================================================================
   OPERO — CZYTANIE TREŚCI KSIĘGI WIECZYSTEJ SKOPIOWANEJ Z EKW
   ----------------------------------------------------------------------------
   Rzeczoznawca otwiera księgę w ekw.ms.gov.pl, zaznacza całą stronę działu
   (Ctrl+A), kopiuje (Ctrl+C) i wkleja do programu — dział po dziale albo
   wszystko naraz. Program rozpoznaje, który to dział, i sam wyciąga dane.

   JAK ZBUDOWANA JEST STRONA EKW (i dlaczego prosty odczyt „etykieta: wartość"
   się na niej myli)

   Strona to tabele. Po skopiowaniu komórki rozdziela tabulator albo nowy
   wiersz — zależnie od przeglądarki. Bywa, że trzy etykiety stoją obok
   siebie, a wartości dopiero za nimi:

       Ulica | Numer budynku | Numer lokalu | IKARA | 97 | 2

   Dlatego tekst zamieniamy na ciąg KOMÓREK i szukamy wartości jako
   „następnych komórek, które same nie są etykietą".

   CZEGO TEN MODUŁ NIE ROBI
     * Nie przepisuje numerów PESEL ani imion rodziców — operat ich nie
       potrzebuje, a to dane, których nie wolno rozrzucać po plikach.
     * Nie zgaduje. Czego nie rozpoznał, tego nie zwraca — a lista
       `nierozpoznane` mówi człowiekowi, co ma sprawdzić sam.
   ========================================================================= */

const EKW_DZIALY = [
  { klucz: 'IO', nazwa: 'I-O', wzor: /DZIAŁ\s+I\s*-\s*O\s*[-–]\s*OZNACZENIE/ },
  { klucz: 'ISP', nazwa: 'I-Sp', wzor: /DZIAŁ\s+I\s*-\s*SP\s*[-–]\s*SPIS/ },
  { klucz: 'II', nazwa: 'II', wzor: /DZIAŁ\s+II\s*[-–]\s*WŁASNOŚĆ/ },
  { klucz: 'III', nazwa: 'III', wzor: /DZIAŁ\s+III\s*[-–]\s*PRAWA/ },
  { klucz: 'IV', nazwa: 'IV', wzor: /DZIAŁ\s+IV\s*[-–]\s*HIPOTEKA/ },
];

/** Etykiety, które rozpoznajemy jako „to nie jest wartość". */
const EKW_ETYKIETY = /^(ulica|numer budynku|numer lokalu|identyfikator (lokalu|działki|budynku)|przeznaczenie (lokalu|budynku)|opis lokalu|kondygnacja|przyłączenie|odrębność|pole powierzchni|położenie|numer działki|obręb ewidencyjny|sposób korzystania|obszar całej nieruchomości|numer bieżący nieruchomości|nr podstawy wpisu|lp\.?\s*\d*\.?$|działka ewidencyjna|wielkość udziału|rodzaj wspólności|udział \(|osoba fizyczna|inna osoba prawna|skarb państwa|jednostka samorządu|numer księgi|rodzaj prawa|nazwa ulicy|liczba kondygnacji|liczba samodzielnych lokali|powierzchnia użytkowa budynku|dokumenty będące podstawą wpisu)/i;

function ekwTekst(v) { return String(v ?? '').replace(/[ \t ]+/g, ' ').trim(); }

/** Tekst → komórki. Tabulator i nowy wiersz są granicą komórki. */
function ekwKomorki(tekst) {
  return String(tekst || '').replace(/\r/g, '').split(/[\t\n]+/).map(ekwTekst).filter(Boolean);
}

function ekwCzyEtykieta(k) { return EKW_ETYKIETY.test(k) || /^nr podstawy/i.test(k) || /^(lokal|budynek|działka|udział)$/i.test(k); }
/** Komórka z numerami podstaw wpisu („2, 3") albo samym „Lp. 1." — to nie dana. */
function ekwCzySzum(k) { return /^lp\.?\s*\d+\.?$/i.test(k) || /^nr podstawy/i.test(k); }

/**
 * Wartości stojące za etykietą: kolejne komórki aż do następnej etykiety.
 * `wzor` dopasowuje POCZĄTEK komórki-etykiety.
 */
function ekwPo(komorki, wzor, { ile = 1, od = 0 } = {}) {
  for (let i = od; i < komorki.length; i++) {
    if (!wzor.test(komorki[i])) continue;
    const out = [];
    for (let j = i + 1; j < komorki.length && out.length < ile; j++) {
      if (ekwCzySzum(komorki[j])) continue;
      if (ekwCzyEtykieta(komorki[j])) break;
      out.push(komorki[j]);
    }
    if (out.length) return { wartosci: out, indeks: i };
  }
  return { wartosci: [], indeks: -1 };
}
function ekwJedna(komorki, wzor) { return ekwPo(komorki, wzor).wartosci[0] || ''; }

function ekwNumerKw(tekst) {
  const m = String(tekst || '').toUpperCase().match(/\b([A-Z]{2}[0-9A-Z]{2})\s*\/\s*([0-9]{8})\s*\/\s*([0-9])\b/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : '';
}

function ekwLiczba(tekst) {
  const m = String(tekst || '').replace(/\s/g, '').match(/(\d+(?:[.,]\d+)?)/);
  return m ? Math.round(Number(m[1].replace(',', '.')) * 10000) / 10000 : 0;
}

/** „GDAŃSK-PÓŁNOC" → „Gdańsk-Północ"; skróty i liczebniki rzymskie zostają. */
function ekwLadnie(tekst) {
  return ekwTekst(tekst).toLowerCase().replace(/(^|[\s\-/.(„"])(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    .replace(/\b(W|We|Z|Na|I|Im|Ul|Al|Pl|Os|Do|Od|Pod|Nad|Przy)\b(?=\s)/g, m => m.toLowerCase())
    .replace(/\b(Ii|Iii|Iv|Vi|Vii|Viii|Ix|Xi|Xii)\b/g, m => m.toUpperCase())
    .replace(/^(\p{Ll})/u, m => m.toUpperCase());
}

/* ------------------------------------------------------------ podział na działy */

/** Nagłówek strony EKW: numer księgi, data stanu, sąd, rodzaj nieruchomości. */
function ekwNaglowek(tekst) {
  const t = String(tekst || '').replace(/\s+/g, ' ');
  const out = { kw: '', stanZDnia: '', stanGodzina: '', sad: '', rodzaj: '' };
  const m = t.match(/KSIĘGI\s+WIECZYSTEJ\s+NR\s+([A-Z0-9]{4}\s*\/\s*\d{8}\s*\/\s*\d)\s*,?\s*STAN\s+Z\s+DNIA\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?/i);
  if (m) { out.kw = ekwNumerKw(m[1]); out.stanZDnia = m[2]; out.stanGodzina = m[3] || ''; }
  const s = t.match(/prowadzonej\s+przez\s+(SĄD[^|]*?WYDZIAŁ\s+KSIĄG\s+WIECZYSTYCH)/i);
  if (s) out.sad = ekwLadnie(s[1]);
  if (/LOKAL\s+STANOWIĄCY\s+ODRĘBNĄ\s+NIERUCHOMOŚĆ/i.test(t)) out.rodzaj = 'lokal';
  else if (/SPÓŁDZIELCZE\s+WŁASNOŚCIOWE\s+PRAWO/i.test(t)) out.rodzaj = 'spoldzielcze';
  else if (/NIERUCHOMOŚĆ\s+GRUNTOWA|GRUNT\s+ODDANY\s+W\s+UŻYTKOWANIE/i.test(t)) out.rodzaj = 'grunt';
  return out;
}

/**
 * Dzieli wklejony tekst na działy. Pasek zakładek u góry strony („Dział I-O |
 * Dział I-Sp | …") NIE jest nagłówkiem działu — nagłówek to wersaliki
 * z myślnikiem i tytułem („DZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI").
 */
function ekwPodziel(tekst) {
  const t = String(tekst || '').replace(/\r/g, '');
  const znalezione = [];
  for (const d of EKW_DZIALY) {
    const re = new RegExp(d.wzor.source, 'g');
    let m;
    while ((m = re.exec(t))) znalezione.push({ klucz: d.klucz, i: m.index });
  }
  // Nagłówek strony („TREŚĆ KSIĘGI WIECZYSTEJ NR …") zamyka dział: przy kilku
  // zrzutach albo wklejeniach nagłówek następnej strony nie należy do działu.
  const granice = [];
  { const re = /TREŚĆ\s+KSIĘGI\s+WIECZYSTEJ\s+NR/g; let m; while ((m = re.exec(t))) granice.push(m.index); }
  znalezione.sort((a, b) => a.i - b.i);
  const dzialy = {};
  znalezione.forEach((z, n) => {
    const nastepny = n + 1 < znalezione.length ? znalezione[n + 1].i : t.length;
    const koniec = Math.min(nastepny, ...granice.filter(g => g > z.i));
    const kawalek = t.slice(z.i, koniec).trim();
    // Ten sam dział wklejony dwa razy: zostaje dłuższa (pełniejsza) wersja.
    if (!dzialy[z.klucz] || kawalek.length > dzialy[z.klucz].length) dzialy[z.klucz] = kawalek;
  });
  return dzialy;
}

/* ------------------------------------------------------------------ dział I-O */

/** „POKÓJ Z ANEKSEM KUCHENNYM - 1, WC - 1, POKÓJ - 3" → lista izb i liczba pokoi. */
function ekwIzby(opis) {
  const izby = [];
  for (const cz of String(opis || '').split(/,(?![^(]*\))/)) {
    const m = cz.match(/^\s*(.+?)\s*[-–]\s*(\d+)\s*$/);
    if (m) izby.push({ nazwa: ekwTekst(m[1]).toLowerCase(), ile: Number(m[2]) });
  }
  const pokoje = izby.filter(i => /^pok[oó]j/.test(i.nazwa)).reduce((s, i) => s + i.ile, 0);
  return { izby, pokoje, tekst: izby.map(i => `${i.nazwa} – ${i.ile}`).join(', ') };
}

function ekwDzialIO(tekst) {
  const k = ekwKomorki(tekst);
  const out = {};
  // Położenie: komórka „WOJEWÓDZTWO, POWIAT, GMINA, MIEJSCOWOŚĆ[, DZIELNICA]".
  const iPol = k.findIndex(x => /^położenie/i.test(x));
  if (iPol >= 0) {
    for (let j = iPol + 1; j < Math.min(k.length, iPol + 8); j++) {
      const cz = k[j].split(',').map(ekwTekst).filter(Boolean);
      if (cz.length >= 3 && !/^\d/.test(k[j]) && !ekwCzyEtykieta(k[j])) {
        // Odczyt ze zrzutu potrafi dokleić „Lp. 1." albo numer porządkowy przed województwem.
        out.wojewodztwo = cz[0].replace(/^.*?(?=\p{L}{4,})/u, '').toLowerCase();
        out.powiat = ekwLadnie(cz[1]); out.gmina = ekwLadnie(cz[2]);
        out.miejscowosc = ekwLadnie(cz[3] || cz[2]);
        if (cz[4]) out.dzielnica = ekwLadnie(cz[4]);
        break;
      }
    }
  }
  // Ulica / numer budynku / numer lokalu — obok siebie albo każde osobno.
  const iUl = k.findIndex(x => /^ulica$/i.test(x) || /^nazwa ulicy/i.test(x));
  if (iUl >= 0) {
    const obok = /^numer budynku/i.test(k[iUl + 1] || '') && /^numer lokalu/i.test(k[iUl + 2] || '');
    if (obok) {
      const w = [];
      for (let j = iUl + 3; j < k.length && w.length < 3; j++) { if (ekwCzySzum(k[j])) continue; if (ekwCzyEtykieta(k[j])) break; w.push(k[j]); }
      if (w.length === 3) [out.ulica, out.numerBudynku, out.numerLokalu] = w;
      else if (w.length === 2) { // brak nazwy ulicy (miejscowość bez ulic)
        if (/\d/.test(w[0])) [out.numerBudynku, out.numerLokalu] = w; else [out.ulica, out.numerBudynku] = w;
      } else if (w.length === 1) { if (/\d/.test(w[0])) out.numerBudynku = w[0]; else out.ulica = w[0]; }
    } else {
      out.ulica = ekwJedna(k, /^(ulica|nazwa ulicy)/i);
      out.numerBudynku = ekwJedna(k, /^numer budynku/i);
      out.numerLokalu = ekwJedna(k, /^numer lokalu/i);
    }
  }
  // Odczyt ze zrzutu: etykiety i wartości w jednym wierszu („Ulica Numer budynku
  // Numer lokalu IKARA 97 2"). Bierzemy to, co stoi za etykietą „lokalu".
  const zlaUlica = u => !u || !/^\p{Lu}[\p{Lu}\d .'\-]*$/u.test(String(u).trim()) || /\d{3,}/.test(u) || /numer|lokalu|budynku/i.test(u);
  if (zlaUlica(out.ulica)) {
    const wiersz = String(tekst || '').split('\n').find(l => /^\s*(ulica|nazwa ulicy)\b/i.test(l) && /lokalu/i.test(l));
    if (wiersz) {
      const za = wiersz.replace(/^.*?lokalu/i, '').split(/[\t ]+/).map(x => x.replace(/[^\p{L}\d\/.\-]/gu, '')).filter(Boolean);
      // Wartości w EKW są pisane wersalikami – słowo pisane mieszanie to błąd odczytu.
      const slowa = za.filter(x => /^\p{Lu}[\p{Lu}.\-]{2,}$/u.test(x)), liczby = za.filter(x => /^\d+[A-Za-z]?(?:[\/-]\d+[A-Za-z]?)?$/.test(x));
      if (slowa.length) out.ulica = slowa.join(' ');
      // Numer z samych zer to szum tła, nie numer budynku.
      const dobre = liczby.filter(x => !/^0+$/.test(x));
      if (dobre[0]) out.numerBudynku = dobre[0];
      if (dobre[1]) out.numerLokalu = dobre[1];
    }
  }
  // Wartość, która nie wygląda na swoje pole, to błąd odczytu — lepiej puste niż złe.
  if (out.ulica && zlaUlica(out.ulica)) delete out.ulica;
  if (out.numerBudynku && !/^[1-9]\d*[A-Za-z]?(?:[\/-]\d+[A-Za-z]?)?$/.test(out.numerBudynku.trim())) delete out.numerBudynku;
  if (out.numerLokalu && !/^[1-9]\d*[A-Za-z]?$/.test(out.numerLokalu.trim())) delete out.numerLokalu;
  if (out.ulica) out.ulica = ekwLadnie(out.ulica);
  out.identyfikatorLokalu = ekwJedna(k, /^identyfikator lokalu/i);
  out.przeznaczenie = ekwJedna(k, /^przeznaczenie lokalu/i).toLowerCase();
  let izby = ekwIzby(ekwJedna(k, /^opis lokalu/i));
  // Na zrzucie opis izb łamie się na dwa wiersze nad i pod etykietą. Zbieramy
  // wszystkie pary „NAZWA - liczba" z odcinka między przeznaczeniem a kondygnacją.
  {
    const t = String(tekst || '');
    const od = t.search(/przeznaczenie lokalu/i), doo = t.search(/kondygnacja|przyłączenie/i);
    if (od >= 0 && doo > od) {
      const odcinek = t.slice(od, doo).split('\n').filter(l => !/^\s*(przeznaczenie|opis)\b/i.test(l)).join(' ').replace(/[|\t]+/g, ' ').replace(/ŁĄZIENKA/g, 'ŁAZIENKA');
      // Myślnik bywa zgubiony przy odczycie („ŁAZIENKA 2") – dopuszczamy jego brak tylko przed przecinkiem albo końcem.
      const pary = [...odcinek.matchAll(/(\p{Lu}[\p{Lu} ]{1,60}?)\s*(?:[-–]\s*(\d{1,2})|\s(\d{1,2})(?=\s*(?:,|$)))(?=\s*(?:,|$|\s))/gu)].map(m => `${m[1].trim()} - ${m[2] || m[3]}`);
      const zebrane = ekwIzby(pary.join(', '));
      if (zebrane.izby.length > izby.izby.length) izby = zebrane;
    }
  }
  if (izby.izby.length) { out.izby = izby.tekst; out.pokoje = izby.pokoje; out.listaIzb = izby.izby; }
  out.kondygnacja = ekwJedna(k, /^kondygnacja/i);
  if (out.kondygnacja && !/^(-?\d{1,2}|[IVX]{1,4}|parter|piwnica|poddasze|suterena|antresola)$/i.test(out.kondygnacja.trim())) delete out.kondygnacja;
  out.kwMacierzysta = ekwNumerKw(ekwPo(k, /^przyłączenie/i, { ile: 2 }).wartosci.join(' '));
  out.powierzchnia = ekwLiczba(ekwJedna(k, /^pole powierzchni/i));
  // Księga gruntowa: działka, obręb, obszar.
  out.numerDzialki = ekwJedna(k, /^numer działki/i);
  out.identyfikatorDzialki = ekwJedna(k, /^identyfikator działki/i);
  const obr = ekwJedna(k, /^obręb ewidencyjny/i);
  if (obr) out.obreb = ekwLadnie(obr.replace(/^\s*[\d.]+\s*,\s*/, ''));
  out.sposobKorzystania = ekwJedna(k, /^sposób korzystania/i);
  const obszar = ekwJedna(k, /^obszar całej nieruchomości/i);
  if (obszar) { out.obszar = ekwLiczba(obszar); out.obszarJednostka = /HA/i.test(obszar) ? 'ha' : 'm²'; }
  for (const key of Object.keys(out)) if (out[key] === '' || out[key] === 0 || out[key] == null) delete out[key];
  return out;
}

/* ----------------------------------------------------------------- dział I-Sp */

function ekwDzialISp(tekst) {
  const k = ekwKomorki(tekst);
  const out = {};
  const calosc = k.join(' | ');
  const u = calosc.match(/wielkość udziału[^|]*\|(?:\s*(?:Lp\.?\s*\d*\.?|[\d, ]+)\s*\|)*\s*(\d+\s*\/\s*\d+)/i) || calosc.match(/\b(\d{1,9}\s*\/\s*\d{2,9})\b/);
  if (u) out.udzial = u[1].replace(/\s/g, '');
  const rp = ekwJedna(k, /^rodzaj prawa/i);
  if (rp) out.rodzajPrawa = rp.toLowerCase();
  for (const cell of k) { const kw = ekwNumerKw(cell); if (kw) { out.kwWspolna = kw; break; } }
  if (/BRAK\s+WPISÓW/i.test(calosc) && !out.udzial) out.brakWpisow = true;
  return out;
}

/* ------------------------------------------------------------------- dział II */

/** Z komórki z danymi osoby zostaje imię i nazwisko. PESEL i rodzice — nie. */
function ekwOsoba(komorka) {
  // Uklad EKW jest POZYCYJNY: imie pierwsze, imie drugie, nazwisko, imie ojca,
  // imie matki, PESEL. Puste miejsce to „---" i nie wolno go usunac przed
  // liczeniem pozycji, bo imie ojca wskoczyloby na miejsce nazwiska.
  const cz = String(komorka || '').split(',').map(ekwTekst);
  if (cz.length < 3) return '';
  // Nowy układ EKW: „IMIĘ NAZWISKO, IMIĘ OJCA, IMIĘ MATKI, PESEL" – imię i nazwisko
  // stoją razem w pierwszej części. Bez tego imiona rodziców trafiały do nazwiska.
  if (/^\d{11}$/.test(cz[cz.length - 1]) && cz.length <= 4) {
    const pierwsza = cz[0];
    return /^[\p{L}\- ]+$/u.test(pierwsza) && /\s/.test(pierwsza) ? ekwLadnie(pierwsza) : '';
  }
  const imiona = cz.slice(0, 3).filter(x => x && !/^-+$/.test(x) && /^[\p{L}\- ]+$/u.test(x));
  return ekwLadnie(imiona.join(' '));
}

function ekwDzialII(tekst) {
  const k = ekwKomorki(tekst);
  const out = { wlasciciele: [] };
  for (let i = 0; i < k.length; i++) {
    if (/^osoba fizyczna/i.test(k[i])) {
      for (let j = i + 1; j < Math.min(k.length, i + 5); j++) {
        if (ekwCzySzum(k[j])) continue;
        if (ekwCzyEtykieta(k[j])) break;
        const o = ekwOsoba(k[j]); if (o) { out.wlasciciele.push(o); break; }
      }
    } else if (/^(inna osoba prawna|skarb państwa|jednostka samorządu)/i.test(k[i])) {
      for (let j = i + 1; j < Math.min(k.length, i + 5); j++) {
        if (ekwCzySzum(k[j])) continue;
        if (ekwCzyEtykieta(k[j])) break;
        const nazwa = ekwTekst(k[j].split(',')[0]); if (nazwa && !/^\d+$/.test(nazwa)) { out.wlasciciele.push(ekwLadnie(nazwa)); break; }
      }
    }
  }
  out.wlasciciele = [...new Set(out.wlasciciele)];
  const calosc = k.join(' | ');
  const udzialy = [...calosc.matchAll(/\|\s*(\d+\s*\/\s*\d+)\s*\|/g)].map(m => m[1].replace(/\s/g, ''));
  if (udzialy.length) out.udzialy = udzialy;
  const wsp = calosc.match(/WSPÓLNOŚĆ\s+USTAWOWA\s+MAJĄTKOWA\s+MAŁŻEŃSKA|WSPÓLNOŚĆ\s+ŁĄCZNA[^|]*/i);
  if (wsp) out.wspolnosc = wsp[0].toLowerCase();
  const podstawa = calosc.match(/((?:UMOWA|AKT|POSTANOWIENIE|WYROK|ZAŚWIADCZENIE|OŚWIADCZENIE|PROTOKÓŁ|DECYZJA)[^|]{5,260})/);
  if (podstawa) out.podstawaNabycia = ekwTekst(podstawa[1]).slice(0, 300);
  return out;
}

/* ------------------------------------------------------------ działy III i IV */

function ekwDzialObciazen(tekst) {
  const k = ekwKomorki(tekst);
  const tresc = k.slice(1).filter(x => !ekwCzySzum(x)).join('\n');
  if (!tresc.trim() || /BRAK\s+WPISÓW/i.test(tresc)) return { brakWpisow: /BRAK\s+WPISÓW/i.test(tekst), tekst: /BRAK\s+WPISÓW/i.test(tekst) ? 'Brak wpisów.' : '' };
  // PESEL-e nie mają czego szukać w operacie.
  return { brakWpisow: false, tekst: tresc.replace(/\b\d{11}\b/g, '[PESEL pominięty]').slice(0, 6000) };
}

function ekwHipoteki(tekst) {
  const calosc = ekwKomorki(tekst).join(' | ');
  const out = [];
  const re = /(HIPOTEKA\s+[A-ZĄĆĘŁŃÓŚŹŻ ]{3,60})[\s\S]{0,400}?(\d[\d .]*,\d{2})\s*\|?\s*\(?[^|]{0,200}?\)?\s*\|?\s*(PLN|EUR|USD|CHF|GBP)\b/g;
  let m;
  while ((m = re.exec(calosc)) && out.length < 10) out.push({ rodzaj: ekwTekst(m[1]).toLowerCase(), suma: m[2].replace(/\s/g, ' ').trim(), waluta: m[3] });
  return out;
}

/* ------------------------------------------------------------------- całość */

/**
 * Cały wklejony tekst → dane do operatu.
 * Zwraca też `dzialy` (surowy tekst każdego rozpoznanego działu), listę
 * `rozpoznane` i `brakuje` — żeby program umiał powiedzieć: „mam I-O i II,
 * wklej jeszcze I-Sp, III i IV".
 */
function ekwCzytaj(tekst) {
  const surowy = String(tekst || '');
  const naglowek = ekwNaglowek(surowy);
  const dzialy = ekwPodziel(surowy);
  const io = dzialy.IO ? ekwDzialIO(dzialy.IO) : {};
  const isp = dzialy.ISP ? ekwDzialISp(dzialy.ISP) : {};
  const ii = dzialy.II ? ekwDzialII(dzialy.II) : { wlasciciele: [] };
  const iii = dzialy.III ? ekwDzialObciazen(dzialy.III) : null;
  const iv = dzialy.IV ? ekwDzialObciazen(dzialy.IV) : null;
  const rozpoznane = EKW_DZIALY.filter(d => dzialy[d.klucz]).map(d => d.nazwa);
  const brakuje = EKW_DZIALY.filter(d => !dzialy[d.klucz]).map(d => d.nazwa);
  return {
    ok: rozpoznane.length > 0 || !!naglowek.kw,
    naglowek, dzialy, io, isp, ii, iii, iv,
    hipoteki: dzialy.IV ? ekwHipoteki(dzialy.IV) : [],
    rozpoznane, brakuje,
  };
}

/**
 * Wynik czytania → pary „ścieżka w operacie : wartość". Jedna lista, z której
 * program wypełnia pola i z której test sprawdza, co dokładnie trafi do operatu.
 */
function ekwDoOperatu(w) {
  const pola = [];
  const dodaj = (sciezka, wartosc, nazwa) => { if (wartosc !== undefined && wartosc !== null && String(wartosc).trim() !== '' && wartosc !== 0) pola.push({ sciezka, wartosc, nazwa }); };
  const n = w.naglowek || {}, io = w.io || {}, isp = w.isp || {}, ii = w.ii || {};
  dodaj('legal.kwLocal', n.kw, 'numer księgi wieczystej');
  dodaj('legal.court', n.sad, 'sąd prowadzący księgę');
  dodaj('valuation.legalStateDate', n.stanZDnia ? `${n.stanZDnia}${n.stanGodzina ? ` ${n.stanGodzina}` : ''}` : '', 'data badania księgi');
  dodaj('property.city', io.miejscowosc, 'miejscowość');
  dodaj('property.district', io.dzielnica, 'dzielnica');
  dodaj('property.commune', io.gmina, 'gmina');
  dodaj('property.county', io.powiat, 'powiat');
  dodaj('property.voivodeship', io.wojewodztwo, 'województwo');
  dodaj('property.street', io.ulica, 'ulica');
  dodaj('property.buildingNo', io.numerBudynku, 'numer budynku');
  dodaj('property.localNo', io.numerLokalu, 'numer lokalu');
  dodaj('property.floor', io.kondygnacja, 'kondygnacja');
  dodaj('property.rooms', io.pokoje, 'liczba pokoi');
  dodaj('property.kwArea', io.powierzchnia, 'powierzchnia według księgi');
  dodaj('legal.ioRooms', io.izby, 'opis izb');
  dodaj('legal.kwCommon', io.kwMacierzysta || isp.kwWspolna, 'księga nieruchomości wspólnej');
  // Identyfikator lokalu zawiera identyfikator działki: „226101_1.0003.1172_BUD.2_LOK"
  // → jednostka 226101_1, obręb 0003, działka 1172. To dane z rejestru, nie z odczytu nazwy.
  const idDz = String(io.identyfikatorLokalu || '').replace(/\s+/g, '').match(/^(\d{6}_\d)\.(\d{4})\.([\d\/]+)(?:\.\d+)?_BUD/);
  if (idDz && !io.numerDzialki){
    dodaj('egib.plotId', `${idDz[1]}.${idDz[2]}.${idDz[3]}`, 'identyfikator działki (z identyfikatora lokalu)');
    dodaj('egib.plotNo', idDz[3], 'numer działki (z identyfikatora lokalu)');
    dodaj('egib.district', idDz[2], 'obręb (numer)');
    dodaj('egib.unit', idDz[1], 'jednostka ewidencyjna');
  }
  dodaj('egib.plotNo', io.numerDzialki, 'numer działki');
  dodaj('egib.plotId', io.identyfikatorDzialki, 'identyfikator działki');
  dodaj('egib.district', io.obreb, 'obręb');
  dodaj('legal.commonShare', isp.udzial, 'udział w nieruchomości wspólnej');
  dodaj('legal.ispRightType', isp.rodzajPrawa, 'rodzaj prawa (I-Sp)');
  dodaj('legal.ownerNames', (ii.wlasciciele || []).join(', '), 'właściciel');
  dodaj('legal.ownershipType', ii.wspolnosc || ((ii.udzialy || []).length ? `udział ${(ii.udzialy || []).join(', ')}` : ''), 'rodzaj wspólności / udział');
  dodaj('legal.currentEntryBasis', ii.podstawaNabycia, 'podstawa nabycia');
  if (w.iii) dodaj('legal.sectionIII', w.iii.tekst, 'dział III');
  if (w.iv) dodaj('legal.sectionIV', w.iv.tekst, 'dział IV');
  return pola;
}

/**
 * Czy odczytana wartość wygląda na to, czym ma być. Tekst wklejony ze strony
 * EKW przechodzi to zawsze; tekst ze zrzutu ekranu (rozpoznawanie pisma)
 * potrafi oddać śmieci — a śmieci nie mogą wejść do operatu jako dane.
 */
const EKW_WZORCE = {
  'legal.kwLocal': v => /^[A-Z]{2}[0-9A-Z]{2}\/\d{8}\/\d$/.test(v),
  'legal.kwCommon': v => /^[A-Z]{2}[0-9A-Z]{2}\/\d{8}\/\d$/.test(v),
  'valuation.legalStateDate': v => /^\d{4}-\d{2}-\d{2}( \d{1,2}:\d{2})?$/.test(v),
  'legal.court': v => /^Sąd\s/i.test(v) && v.length < 160 && !/[|\[\]{}_=]/.test(v),
  'property.city': v => /^[\p{L}][\p{L} .\-]{1,48}$/u.test(v),
  'property.district': v => /^[\p{L}][\p{L} .\-]{1,48}$/u.test(v),
  'property.commune': v => /^[\p{L}][\p{L} .\-]{1,58}$/u.test(v),
  'property.county': v => /^[\p{L}][\p{L} .\-]{1,58}$/u.test(v),
  'property.voivodeship': v => /^[\p{L}\-]{5,22}$/u.test(v),
  'property.street': v => /^[\p{L}\d][\p{L}\d .\-„"']{1,68}$/u.test(v) && /\p{L}{2}/u.test(v),
  'property.buildingNo': v => /^\d{1,4}[A-Za-z]?(\/\d{1,4}[A-Za-z]?)?$/.test(v),
  'property.localNo': v => /^[A-Za-z]?\d{1,4}[A-Za-z]?$/.test(v),
  'property.floor': v => /^-?\d{1,2}$/.test(v) || /^(parter|suterena|poddasze)$/i.test(v),
  'property.rooms': v => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 20,
  'property.kwArea': v => Number(v) >= 5 && Number(v) <= 5000,
  'legal.ioRooms': v => /^[\p{L} ]+ – \d+(, [\p{L} ]+ – \d+)*$/u.test(v),
  'legal.commonShare': v => { const m = /^(\d{1,12})\/(\d{1,12})$/.exec(v); return !!m && Number(m[2]) > 0 && Number(m[1]) <= Number(m[2]); },
  'legal.ownerNames': v => /^[\p{L}][\p{L} .,\-„"']{3,300}$/u.test(v),
  'egib.plotNo': v => /^\d{1,5}(\/\d{1,5})?$/.test(v),
  'egib.plotId': v => /^\d{6}_\d\.\d{4}\.[\w./\-]+$/.test(v),
  'egib.district': v => /^[\p{L}\d][\p{L}\d .\-]{1,58}$/u.test(v),
};

/** Dzieli listę pól na pewne i odrzucone (z nazwą i tym, co odczytano). */
function ekwPrzesiej(pola) {
  const pewne = [], odrzucone = [];
  for (const p of (pola || [])) {
    const wzor = EKW_WZORCE[p.sciezka];
    const v = typeof p.wartosc === 'string' ? p.wartosc.trim() : p.wartosc;
    if (!wzor || wzor(typeof v === 'string' ? v : String(v))) pewne.push(p); else odrzucone.push(p);
  }
  return { pewne, odrzucone };
}

const API_EKW = {
  przesiej: ekwPrzesiej,
  DZIALY: EKW_DZIALY, komorki: ekwKomorki, naglowek: ekwNaglowek, podziel: ekwPodziel,
  dzialIO: ekwDzialIO, dzialISp: ekwDzialISp, dzialII: ekwDzialII, dzialObciazen: ekwDzialObciazen,
  izby: ekwIzby, numerKw: ekwNumerKw, osoba: ekwOsoba, hipoteki: ekwHipoteki,
  czytaj: ekwCzytaj, doOperatu: ekwDoOperatu, ladnie: ekwLadnie,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_EKW;
if (typeof window !== 'undefined') window.OperoEkw = API_EKW;

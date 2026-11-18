/* OPERO — rzeczoznawca-weryfikator
 *
 * Ostatni agent. Czyta gotowy operat punkt po punkcie i sklada liste uwag.
 * Tam, gdzie poprawka jest jednoznaczna (zapis liczby, suma wag, podwojna
 * spacja), dolacza gotowa zmiane – ale NICZEGO nie zmienia sam. Zmiany
 * wchodza dopiero przez `zastosuj`, po akceptacji rzeczoznawcy, i kazda
 * da sie cofnac (`cofnij`).
 *
 * Ten modul nie powtarza audytu formalnego (audyt.js) – dostaje jego wynik
 * i doklada to, czego audyt nie sprawdza: zapis liczb, tabele, wagi, oceny,
 * wyglad wydruku.
 */
'use strict';

const WER_DZIALY = [
  { id: 'liczby', nazwa: 'Zapis liczb i jednostek' },
  { id: 'tekst', nazwa: 'Tekst operatu' },
  { id: 'tabele', nazwa: 'Tabele i transakcje' },
  { id: 'wagi', nazwa: 'Cechy, wagi i oceny' },
  { id: 'wynik', nazwa: 'Wynik' },
  { id: 'wyglad', nazwa: 'Wygląd i wydruk' },
  { id: 'formalne', nazwa: 'Kontrola formalna' },
];

/* Pola opisowe, ktore weryfikator czyta. Tresc ksiegi wieczystej (legal.*)
   jest cytatem ze zrodla – tam niczego nie poprawiamy. */
const WER_POLA = [
  ['formalBasis', 'Podstawa formalna'], ['methodicalBasis', 'Podstawa metodyczna'], ['valuation.approachDescription', 'Uzasadnienie podejścia'],
  ['valuation.purpose', 'Cel wyceny'], ['property.plotDescription', 'Opis działki'],
  ['planning.designation', 'Przeznaczenie w planie'], ['planning.parameters', 'Parametry planu'], ['planning.description', 'Opis planistyczny'],
  ['location.transport', 'Komunikacja'], ['location.services', 'Usługi'], ['location.recreation', 'Rekreacja'], ['location.surroundings', 'Otoczenie'], ['location.description', 'Opis lokalizacji'],
  ['building.description', 'Opis budynku'], ['building.surroundings', 'Otoczenie budynku'], ['building.installations', 'Instalacje budynku'],
  ['local.layout', 'Układ lokalu'], ['local.description', 'Opis lokalu'], ['local.installations', 'Instalacje lokalu'],
  ['market.segmentDescription', 'Segment rynku'], ['market.marketDescription', 'Opis rynku'], ['market.weightJustification', 'Uzasadnienie wag'],
  ['egib.notes', 'Uwagi do ewidencji'],
  ['narratives.subject', 'Przedmiot wyceny'], ['narratives.scope', 'Zakres wyceny'], ['narratives.egib', 'Opis ewidencyjny'], ['narratives.planning', 'Opis planistyczny (narracja)'],
  ['narratives.location', 'Lokalizacja (narracja)'], ['narratives.building', 'Budynek (narracja)'], ['narratives.local', 'Lokal (narracja)'],
  ['narratives.market', 'Rynek (narracja)'], ['narratives.extremes', 'Nieruchomości skrajne'], ['narratives.result', 'Wynik (narracja)'], ['clauses', 'Klauzule'],
];

function werWez(o, sciezka){ return String(sciezka).split('.').reduce((x, k) => (x == null ? undefined : x[k]), o); }
function werUstaw(o, sciezka, wartosc){
  const k = String(sciezka).split('.'); let x = o;
  for (let i = 0; i < k.length - 1; i++){ if (x[k[i]] == null || typeof x[k[i]] !== 'object') x[k[i]] = {}; x = x[k[i]]; }
  x[k[k.length - 1]] = wartosc;
}
function werTysiace(s){ return String(s).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); }
function werOdmien(n, a, b, c){ const k = Math.abs(n) % 100, j = k % 10; return n === 1 ? a : (j >= 2 && j <= 4 && !(k >= 12 && k <= 14)) ? b : c; }

function werTeksty(project){
  const w = [];
  for (const [sciezka, etykieta] of WER_POLA){
    const v = werWez(project, sciezka);
    if (typeof v === 'string' && v.trim()) w.push({ sciezka, etykieta, tekst: v });
  }
  return w;
}

/**
 * Polski zapis liczb w tekscie operatu. Zmienia TYLKO zapis – nigdy wartosc:
 *  650000 zł → 650 000 zł · 54.3 m2 → 54,3 m² · 9 500zł/m2 → 9 500 zł/m².
 * Numerow ksiag, dzialek, dat, kodow pocztowych i lat nie dotyka, bo poprawia
 * wylacznie liczby stojace bezposrednio przed jednostka.
 */
function werPoprawLiczby(tekst){
  let t = String(tekst == null ? '' : tekst);
  const J = '(zł|zl|PLN|m²|m2|mkw|ha|%)';
  // kropka dziesietna przed jednostka → przecinek
  t = t.replace(new RegExp('(\\d)\\.(\\d{1,2})(?=\\s*' + J + '(?![\\p{L}\\d]))', 'gu'), '$1,$2');
  // tysiace: 4+ cyfr przed jednostka pieniezna albo powierzchni
  t = t.replace(new RegExp('(?<![\\d.,/\\-])(\\d{4,})(?=(?:,\\d{1,2})?\\s*(?:zł|zl|PLN|m²|m2|mkw)(?![\\p{L}\\d]))', 'gu'), m => werTysiace(m));
  // jednostki
  t = t.replace(/(\d)\s*(?:m2|mkw)(?![\p{L}\d])/gu, '$1 m²').replace(/\/\s*(?:m2|mkw)(?![\p{L}\d])/gu, '/m²');
  t = t.replace(/(\d)\s*zl(?![\p{L}\d])/gu, '$1 zł').replace(/(\d)(zł|PLN)(?![\p{L}\d])/gu, '$1 $2').replace(/(\d)\s+m²/gu, '$1 m²');
  t = t.replace(/(\d)\s+%/g, '$1%');
  return t;
}

/** Drobna typografia: podwojne spacje, spacja przed znakiem, brak kropki na koncu akapitu. */
function werPoprawTypografie(tekst){
  let t = String(tekst == null ? '' : tekst);
  t = t.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+([,.;:!?])/g, '$1').replace(/([,;:])(?=[\p{L}])/gu, '$1 ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  // 1,5 i 12:30 musza zostac – cofamy spacje wstawiona miedzy cyfry (regula wyzej dotyczy tylko liter, to zabezpieczenie na przyszlosc)
  // Kropke na koncu dostaje tylko tekst zlozony ze zdan – nie haslo ani wyliczenie.
  if (t.length > 40 && /[.!?]\s+\p{Lu}/u.test(t) && /[\p{L}\d)%²]$/u.test(t)) t += '.';
  return t;
}

function werMediana(l){ const s = l.slice().sort((a, b) => a - b); if (!s.length) return 0; const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/**
 * Glowna funkcja. `audyt` – wynik audyt.js (opcjonalnie), `opcje.auto` – mapa
 * sciezek wpisanych przez program (project.autoWpisane), `opcje.znakWodny`.
 */
function werSprawdz(project, calc, audyt, opcje){
  const p = project || {}, c = calc || {}, o = opcje || {};
  const uwagi = [];
  let nr = 0;
  const dodaj = (dzial, waga, tytul, szczegol, poprawka, gdzie) => uwagi.push({ id: `w${++nr}`, dzial, waga, tytul, szczegol: szczegol || '', poprawka: poprawka || null, gdzie: gdzie || '' });

  // --- zapis liczb i typografia ---------------------------------------
  for (const pole of werTeksty(p)){
    const liczby = werPoprawLiczby(pole.tekst), calosc = werPoprawTypografie(liczby);
    // Jedna poprawka na pole: dwie osobne nadpisywalyby sie nawzajem.
    if (liczby !== pole.tekst){
      const przyklad = werRoznica(pole.tekst, liczby);
      dodaj('liczby', 'kosmetyka', `${pole.etykieta}: zapis liczb`, `Np. „${przyklad.bylo}" → „${przyklad.bedzie}". Wartości się nie zmieniają, tylko zapis.`,
        { opis: 'Popraw zapis liczb i jednostek', zmiany: [{ sciezka: pole.sciezka, wartosc: calosc }] }, pole.sciezka);
    } else if (calosc !== pole.tekst){
      dodaj('tekst', 'kosmetyka', `${pole.etykieta}: spacje i interpunkcja`, 'Podwójne spacje, spacja przed znakiem albo brak kropki na końcu.',
        { opis: 'Popraw spacje i interpunkcję', zmiany: [{ sciezka: pole.sciezka, wartosc: calosc }] }, pole.sciezka);
    }
    const dziury = (pole.tekst.match(/\[DO UZUPEŁNIENIA\]|\[[A-ZĄĆĘŁŃÓŚŹŻ ]{4,}\]|XXX+|\?\?\?+|\.\.\.\.\.+/g) || []).length;
    if (dziury) dodaj('tekst', 'blad', `${pole.etykieta}: ${dziury} ${werOdmien(dziury, 'miejsce', 'miejsca', 'miejsc')} do uzupełnienia`, 'W tekście zostało oznaczenie braku. Operat z takim miejscem nie może wyjść do klienta.', null, pole.sciezka);
    if (/\b(jako model|jako asystent|nie mam dostępu|nie mogę|przepraszam)\b/i.test(pole.tekst)) dodaj('tekst', 'blad', `${pole.etykieta}: zdanie od modelu`, 'W tekście jest zdanie, w którym model mówi o sobie. Usuń je.', null, pole.sciezka);
  }

  // --- wagi i oceny ----------------------------------------------------
  const cechy = Array.isArray(p.market?.features) ? p.market.features : [];
  if (cechy.length){
    const suma = cechy.reduce((s, f) => s + (Number(f.weight) || 0), 0);
    const proc = Math.round(suma * 10000) / 100;
    if (suma > 0 && Math.abs(proc - 100) > 0.005){
      const nowe = cechy.map(f => Math.round((Number(f.weight) || 0) / suma * 100) / 100);
      const roznica = Math.round((1 - nowe.reduce((s, x) => s + x, 0)) * 100) / 100;
      const naj = nowe.indexOf(Math.max(...nowe)); nowe[naj] = Math.round((nowe[naj] + roznica) * 100) / 100;
      dodaj('wagi', 'blad', `Wagi cech sumują się do ${String(proc).replace('.', ',')}%`, 'Suma wag musi wynosić dokładnie 100%.',
        { opis: 'Przelicz wagi proporcjonalnie do 100%', zmiany: nowe.map((w, i) => ({ sciezka: `market.features.${i}.weight`, wartosc: w })) }, 'market.features');
    }
    if (!(suma > 0)) dodaj('wagi', 'blad', 'Cechy nie mają wag', 'Bez wag nie ma wyniku.', null, 'market.features');
    const zera = cechy.filter(f => !(Number(f.weight) > 0));
    if (suma > 0 && zera.length) dodaj('wagi', 'uwaga', `${zera.length} ${werOdmien(zera.length, 'cecha ma', 'cechy mają', 'cech ma')} wagę 0%`, `${zera.map(f => f.name).join(', ')} — cecha bez wagi nie wpływa na wynik; usuń ją albo nadaj wagę.`, null, 'market.features');
    const przecietne = cechy.filter(f => /przeci[ęe]tn/i.test(String(f.rating || '')));
    if (cechy.length >= 3 && przecietne.length === cechy.length) dodaj('wagi', 'uwaga', 'Wszystkie cechy ocenione jako „przeciętna"', o.auto?.['market.features'] ? 'Program przyjął oceny wyjściowe. Ustaw je po oględzinach — od nich zależy wynik.' : 'Sprawdź, czy tak wynika z oględzin.', null, 'market.features');
    const bezUzas = cechy.filter(f => !/przeci[ęe]tn/i.test(String(f.rating || '')) && !String(f.ratingNote || '').trim());
    if (bezUzas.length) dodaj('wagi', 'uwaga', `${bezUzas.length} ${werOdmien(bezUzas.length, 'ocena', 'oceny', 'ocen')} bez uzasadnienia`, `${bezUzas.map(f => f.name).join(', ')} — ocena inna niż przeciętna wymaga zdania uzasadnienia.`, null, 'market.features');
    if (suma > 0 && !String(p.market?.weightJustification || '').trim()) dodaj('wagi', 'uwaga', 'Brak uzasadnienia wag', 'Napisz, skąd wynikają wagi (analiza rynku, preferencje nabywców).', null, 'market.weightJustification');
    const max = Math.max(...cechy.map(f => Number(f.weight) || 0));
    if (suma > 0 && max / suma > 0.6) dodaj('wagi', 'uwaga', 'Jedna cecha ma ponad 60% wagi', 'Taki rozkład wymaga mocnego uzasadnienia rynkowego.', null, 'market.features');
  }

  // --- tabele ----------------------------------------------------------
  const tr = Array.isArray(p.market?.transactions) ? p.market.transactions : [];
  if (tr.length){
    const pow = t => Number(t.area) || 0, cena = t => Number(t.price) || (Number(t.priceUnit) || 0) * pow(t);
    const bezDanych = tr.filter(t => !(cena(t) > 0) || !(pow(t) > 0) || !String(t.date || '').trim());
    if (bezDanych.length) dodaj('tabele', 'blad', `${bezDanych.length} ${werOdmien(bezDanych.length, 'transakcja', 'transakcje', 'transakcji')} bez ceny, powierzchni albo daty`, 'Wiersz tabeli z pustą komórką psuje rachunek i wygląd operatu.', null, 'market.transactions');
    const widziane = new Map(), duble = [];
    tr.forEach((t, i) => { const k = `${String(t.date || '')}|${Math.round(cena(t))}|${pow(t)}|${String(t.address || '').trim().toLowerCase()}`; if (cena(t) > 0 && widziane.has(k)) duble.push(i + 1); else widziane.set(k, i); });
    if (duble.length) dodaj('tabele', 'blad', `Powtórzona transakcja (wiersz ${duble.join(', ')})`, 'Ta sama data, cena, powierzchnia i adres co w innym wierszu.', null, 'market.transactions');
    const jedn = tr.filter(t => cena(t) > 0 && pow(t) > 0).map(t => cena(t) / pow(t));
    if (jedn.length >= 4){
      const med = werMediana(jedn);
      const odstajace = tr.map((t, i) => ({ i: i + 1, j: cena(t) > 0 && pow(t) > 0 ? cena(t) / pow(t) : 0 })).filter(x => x.j > 0 && (x.j > med * 1.6 || x.j < med * 0.6));
      if (odstajace.length) dodaj('tabele', 'uwaga', `${odstajace.length} ${werOdmien(odstajace.length, 'cena odstaje', 'ceny odstają', 'cen odstaje')} od mediany o ponad 40%`, `Wiersz ${odstajace.map(x => x.i).join(', ')}. Mediana ${werTysiace(Math.round(med))} zł/m². Sprawdź, czy to nieruchomości podobne.`, null, 'market.transactions');
    }
    const bezAdresu = tr.filter(t => !String(t.street || t.address || t.location || '').trim());
    if (bezAdresu.length === tr.length && tr.length) dodaj('tabele', 'uwaga', 'Transakcje bez położenia', 'W tabeli nie ma ulicy ani opisu położenia — czytelnik nie oceni podobieństwa.', null, 'market.transactions');
  }

  // --- wynik -----------------------------------------------------------
  const wartosc = Number(c.valueRounded) || 0, zaokr = Number(p.valuation?.roundTo) || 0;
  if (wartosc > 0 && zaokr > 0 && wartosc % zaokr !== 0) dodaj('wynik', 'blad', 'Wartość nie jest zaokrąglona zgodnie z ustawieniem', `Wartość ${werTysiace(wartosc)} zł, zaokrąglenie do ${werTysiace(zaokr)} zł.`, null, 'valuation.roundTo');
  const oferta = Number(p.property?.askingPrice) || 0;
  if (wartosc > 0 && oferta > 0){
    const r = (wartosc - oferta) / oferta;
    if (Math.abs(r) > 0.2) dodaj('wynik', 'uwaga', `Wartość różni się od ceny ofertowej o ${Math.round(Math.abs(r) * 100)}%`, `Wartość ${werTysiace(wartosc)} zł, oferta ${werTysiace(oferta)} zł. Cena ofertowa nie jest dowodem wartości, ale taka różnica wymaga komentarza.`, null, 'property.askingPrice');
  }
  const pu = Number(p.property?.usableArea) || 0, pk = Number(p.property?.kwArea) || 0;
  if (pu > 0 && pk > 0 && Math.abs(pu - pk) > 0.5) dodaj('wynik', 'uwaga', 'Powierzchnia w operacie inna niż w księdze', `Przyjęto ${String(pu).replace('.', ',')} m², w księdze ${String(pk).replace('.', ',')} m². Wyjaśnij różnicę.`, null, 'property.usableArea');

  // --- wyglad ----------------------------------------------------------
  if (!String(p.author?.name || '').trim() || !String(p.author?.licenseNo || '').trim()) dodaj('wyglad', 'blad', 'Brak autora albo numeru uprawnień', 'Strona tytułowa i podpis wymagają imienia, nazwiska i numeru uprawnień.', null, 'author.name');
  if (!(p.photos || []).length) dodaj('wyglad', 'uwaga', 'Brak dokumentacji fotograficznej', 'Operat bez zdjęć z oględzin wygląda na niedokończony.', null, 'photos');
  const a = p.appearance || {};
  if (a.showHeaderFooter !== false && !String(a.headerText || '').trim()) dodaj('wyglad', 'kosmetyka', 'Pusty nagłówek stron', 'Nagłówek jest włączony, ale nie ma tekstu.', null, 'appearance.headerText');
  if (Number(a.bodyFontSize) > 0 && (Number(a.bodyFontSize) < 9 || Number(a.bodyFontSize) > 12.5)) dodaj('wyglad', 'uwaga', 'Nietypowa wielkość pisma', `Ustawiono ${String(a.bodyFontSize).replace('.', ',')} pt. Czytelny operat to 9,5–12 pt.`, { opis: 'Ustaw 10,5 pt', zmiany: [{ sciezka: 'appearance.bodyFontSize', wartosc: 10.5 }] }, 'appearance.bodyFontSize');
  if (Number(a.pageMarginMm) > 0 && Number(a.pageMarginMm) < 12) dodaj('wyglad', 'uwaga', 'Wąskie marginesy', 'Przy marginesie poniżej 12 mm drukarka może uciąć tekst, a wpięty operat traci treść przy grzbiecie.', { opis: 'Ustaw margines 15 mm', zmiany: [{ sciezka: 'appearance.pageMarginMm', wartosc: 15 }] }, 'appearance.pageMarginMm');
  if (o.znakWodny) dodaj('wyglad', 'uwaga', `Na wydruku jest znak wodny „${o.znakWodny}"`, 'Zniknie, gdy zatwierdzisz operat w etapie końcowym. Do tego czasu każdy wydruk jest oznaczony jako projekt.', null, 'meta.zatwierdzono');

  // --- formalne (z audytu) --------------------------------------------
  for (const x of (audyt?.pozycje || [])){
    if (x.stan === 'ok') continue;
    dodaj('formalne', x.stan === 'blad' ? 'blad' : 'uwaga', x.tytul, x.szczegol, null, '');
  }

  const ile = w => uwagi.filter(u => u.waga === w).length;
  const bledy = ile('blad'), uw = ile('uwaga'), kosm = ile('kosmetyka'), doPoprawy = uwagi.filter(u => u.poprawka).length;
  return {
    uwagi, dzialy: WER_DZIALY.map(d => ({ ...d, uwagi: uwagi.filter(u => u.dzial === d.id) })).filter(d => d.uwagi.length),
    podsumowanie: {
      bledy, uwagi: uw, kosmetyka: kosm, doPoprawy,
      ocena: bledy ? 'do-poprawy' : uw ? 'z-uwagami' : 'czysty',
      tekst: bledy ? `Operat wymaga poprawek: ${bledy} ${werOdmien(bledy, 'błąd', 'błędy', 'błędów')}${uw ? `, ${uw} ${werOdmien(uw, 'uwaga', 'uwagi', 'uwag')}` : ''}.`
        : uw ? `Bez błędów. ${uw} ${werOdmien(uw, 'rzecz wymaga', 'rzeczy wymagają', 'rzeczy wymaga')} Twojej decyzji.`
        : kosm ? 'Bez błędów i uwag — zostały drobiazgi w zapisie.' : 'Nie znalazłem nic do poprawienia. Podpis należy do Ciebie.',
    },
  };
}

/** Pierwszy rozniacy sie fragment – do pokazania przykladu poprawki. */
function werRoznica(a, b){
  const x = String(a), y = String(b);
  let i = 0; while (i < x.length && i < y.length && x[i] === y[i]) i++;
  let ka = x.length, kb = y.length; while (ka > i && kb > i && x[ka - 1] === y[kb - 1]){ ka--; kb--; }
  const od = Math.max(0, x.lastIndexOf(' ', Math.max(0, i - 8)) + 1);
  const granica = (s, k) => { const n = s.indexOf(' ', Math.min(s.length, k + 4)); return n < 0 ? s.length : n; };
  return { bylo: x.slice(od, Math.min(granica(x, ka), od + 40)).trim(), bedzie: y.slice(od, Math.min(granica(y, kb), od + 42)).trim() };
}

/**
 * Wprowadza zaakceptowane poprawki. Zwraca liste zmian z poprzednimi
 * wartosciami – to jest zapis do cofniecia.
 */
function werZastosuj(project, wynik, wybrane){
  const ids = new Set(wybrane || []);
  const zrobione = [];
  for (const u of (wynik?.uwagi || [])){
    if (!u.poprawka || !ids.has(u.id)) continue;
    for (const z of u.poprawka.zmiany){
      const bylo = werWez(project, z.sciezka);
      if (bylo === z.wartosc) continue;
      werUstaw(project, z.sciezka, z.wartosc);
      zrobione.push({ id: u.id, tytul: u.tytul, sciezka: z.sciezka, bylo, jest: z.wartosc });
    }
  }
  return zrobione;
}

function werCofnij(project, zmiany){
  let ile = 0;
  for (const z of (zmiany || []).slice().reverse()){ werUstaw(project, z.sciezka, z.bylo); ile++; }
  return ile;
}

/** Polecenie dla modelu: czytanie operatu okiem doswiadczonego rzeczoznawcy. */
function werPolecenie(project, wynik){
  const teksty = werTeksty(project).filter(t => t.tekst.length > 60).slice(0, 14);
  const znalezione = (wynik?.uwagi || []).filter(u => u.waga !== 'kosmetyka').slice(0, 20).map(u => `- ${u.tytul}`).join('\n');
  return {
    rozdzial: 'weryfikacja',
    prompt: 'Jesteś doświadczonym rzeczoznawcą majątkowym, który weryfikuje cudzy operat szacunkowy przed podpisem. '
      + 'Przeczytaj poniższe fragmenty. Wypisz WYŁĄCZNIE konkretne usterki: sprzeczność między fragmentami, zdanie bez pokrycia w danych, '
      + 'ocenę bez uzasadnienia, niejasny tok rozumowania, błąd językowy. Każdą usterkę zapisz w osobnej linii w postaci:\n'
      + 'POLE: <nazwa fragmentu> | PROBLEM: <co jest nie tak> | POPRAWKA: <co zrobić>\n'
      + 'Niczego nie dopisuj do operatu, nie oceniaj kwoty, nie powtarzaj uwag z listy kontroli. Jeśli fragment jest poprawny, pomiń go. '
      + 'Jeśli nie ma usterek, napisz jedno słowo: BRAK.\n\n'
      + `KONTROLA AUTOMATYCZNA JUŻ ZNALAZŁA:\n${znalezione || '- nic'}\n\n`
      + 'FRAGMENTY OPERATU:\n' + teksty.map(t => `### ${t.etykieta}\n${t.tekst.slice(0, 1400)}`).join('\n\n'),
    etykiety: teksty.map(t => ({ etykieta: t.etykieta, sciezka: t.sciezka })),
  };
}

/** Odpowiedz modelu → lista uwag powiazanych z polami. */
function werZOpinii(tekst, etykiety){
  const t = String(tekst || '').trim();
  if (!t || /^\s*BRAK\.?\s*$/i.test(t)) return [];
  const w = [];
  const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\d]+/gu, ' ').trim();
  for (const linia of t.split(/\n+/)){
    const m = /POLE\s*:\s*(.+?)\s*\|\s*PROBLEM\s*:\s*(.+?)\s*(?:\|\s*POPRAWKA\s*:\s*(.+))?$/i.exec(linia.replace(/^[\s\-*\d.)]+/, ''));
    if (!m) continue;
    const pole = (etykiety || []).find(e => norm(e.etykieta) === norm(m[1])) || (etykiety || []).find(e => norm(m[1]).includes(norm(e.etykieta)) || norm(e.etykieta).includes(norm(m[1])));
    w.push({ id: `m${w.length + 1}`, dzial: 'tekst', waga: 'uwaga', zModelu: true, tytul: `${pole ? pole.etykieta : m[1].trim()}: ${m[2].trim()}`, szczegol: String(m[3] || '').trim(), gdzie: pole ? pole.sciezka : '', poprawka: null, polecenie: String(m[3] || m[2]).trim() });
    if (w.length >= 20) break;
  }
  return w;
}

/**
 * Znak wodny na kazdej stronie wydruku. Element o pozycji „fixed” przegladarka
 * powtarza na kazdej stronie PDF. Tekst jest wstawiany jako tresc CSS, wiec
 * nie trafia do spisu tresci ani do kopiowanego tekstu operatu.
 */
function werZnakWodny(html, tekst){
  const h = String(html || ''), t = String(tekst || '').replace(/["\\<>]/g, '').trim();
  if (!t || !/<\/body>/i.test(h) || h.includes('opero-znak-wodny')) return h;
  const styl = '<style id="opero-znak-wodny-styl">.opero-znak-wodny{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:9999}'
    + `.opero-znak-wodny::after{content:"${t}";font:700 54pt Arial,Helvetica,sans-serif;letter-spacing:.08em;color:rgba(120,20,20,.11);transform:rotate(-32deg);white-space:nowrap}</style>`;
  return h.replace(/<\/body>/i, `${styl}<div class="opero-znak-wodny" aria-hidden="true"></div></body>`);
}

const API_WER = {
  DZIALY: WER_DZIALY, POLA: WER_POLA, sprawdz: werSprawdz, zastosuj: werZastosuj, cofnij: werCofnij, teksty: werTeksty,
  poprawLiczby: werPoprawLiczby, poprawTypografie: werPoprawTypografie, polecenie: werPolecenie, zOpinii: werZOpinii,
  znakWodny: werZnakWodny, wez: werWez, ustaw: werUstaw, roznica: werRoznica,
};
if (typeof window !== 'undefined') window.OperoWeryfikator = API_WER;
if (typeof module !== 'undefined' && module.exports) module.exports = API_WER;

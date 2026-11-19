/* OPERO — „Opisz operat”
 *
 * Rzeczoznawca pisze wlasnymi slowami wszystko, co wie o zleceniu. Ten modul
 * wyciaga z tego tekstu fakty, ktore maja swoje rubryki w operacie: rodzaj
 * nieruchomosci, adres, numer ksiegi, dzialke, powierzchnie, cel wyceny.
 *
 * Zasady:
 *  - nic nie jest zgadywane: fakt trafia na liste tylko wtedy, gdy stoi
 *    w tekscie; czego nie ma, to trafia na liste brakow,
 *  - kazdy fakt niesie fragment zdania, z ktorego pochodzi (`skad`),
 *  - modul jest czysty: nie dotyka okna ani projektu, wiec da sie go sprawdzic
 *    testem bez uruchamiania programu.
 */
'use strict';

const OPIS_RODZAJE = [
  // [kod modulu, etykieta, wzorzec]
  ['lokal_mieszkalny', 'lokal mieszkalny', /\b(mieszkani\p{L}*|lokal\p{L}*\s+mieszkaln\p{L}*|kawalerk\p{L}*|apartament\p{L}*)/iu],
  ['lokal_uzytkowy', 'lokal użytkowy', /\b(lokal\p{L}*\s+(użytkow|uzytkow|usługow|uslugow|handlow|biurow)\p{L}*)/iu],
  ['dom', 'nieruchomość zabudowana domem', /(?<!lokal\p{L}*[^.]{0,40})(?:\b(dom\p{L}*\s+(jednorodzinn|wolnostoj|mieszkaln)\p{L}*|bliźniak\p{L}*|blizniak\p{L}*|szeregow\p{L}*|budyn\p{L}*\s+mieszkaln\p{L}*\s+jednorodzinn\p{L}*|zabudow\p{L}*\s+bli[źz]niacz\p{L}*)|(?:^|[.,;!?]\s*)(dom|domu|domem)\b)/iu],
  ['grunt', 'nieruchomość gruntowa', /\b(działk\p{L}*\s+(budowlan|roln|niezabudowan|inwestycyjn|rekreacyjn)\p{L}*|grunt\p{L}*\s+(roln|niezabudowan|budowlan)\p{L}*|nieruchomość\s+gruntow\p{L}*\s+niezabudowan\p{L}*)/iu],
  ['garaz', 'garaż / miejsce postojowe', /\b(garaż\p{L}*|garaz\p{L}*|miejsc\p{L}*\s+postojow\p{L}*)/iu],
];

const OPIS_CELE = [
  ['zabezpieczenie wierzytelności kredytodawcy', /\b(kredyt\p{L}*|hipotek\p{L}*|bank\p{L}*|zabezpieczeni\p{L}*)/iu],
  ['ustalenie ceny sprzedaży', /\b(sprzeda\p{L}*|kupn\p{L}*|transakcj\p{L}* sprzeda\p{L}*)/iu],
  ['podział majątku', /\b(podział\p{L}*\s+majątk\p{L}*|podzial\p{L}*\s+majatk\p{L}*|rozwod\p{L}*|rozwód)/iu],
  ['postępowanie spadkowe', /\b(spad\p{L}*|dział\p{L}*\s+spadk\p{L}*)/iu],
  ['cele podatkowe', /\b(podat\p{L}*|urz\p{L}*\s+skarbow\p{L}*|darowizn\p{L}*)/iu],
  ['postępowanie sądowe / egzekucyjne', /\b(komorni\p{L}*|egzekuc\p{L}*|sąd\p{L}*|licytacj\p{L}*)/iu],
  ['aktualizacja opłaty / przekształcenie', /\b(użytkowani\p{L}*\s+wieczyst\p{L}*|opłat\p{L}*\s+roczn\p{L}*|przekształceni\p{L}*)/iu],
];

function opisLiczba(s){
  const t = String(s == null ? '' : s).replace(/[\s ]/g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function opisFragment(tekst, indeks, dlugosc){
  const od = Math.max(0, indeks - 30), doo = Math.min(tekst.length, indeks + dlugosc + 30);
  return (od > 0 ? '…' : '') + tekst.slice(od, doo).replace(/\s+/g, ' ').trim() + (doo < tekst.length ? '…' : '');
}

/** Numer ksiegi wieczystej: 4 znaki sadu / 8 cyfr / cyfra kontrolna. */
function opisKw(tekst){
  const m = /\b([A-Z]{2}[0-9A-Z]{2})\s*[\/\\ ]\s*(\d{8})\s*[\/\\ ]\s*(\d)\b/.exec(String(tekst || '').toUpperCase());
  return m ? { wartosc: `${m[1]}/${m[2]}/${m[3]}`, indeks: m.index, dlugosc: m[0].length } : null;
}

/** Adres: „ul. Ikara 97/12, Gdańsk”, „przy ulicy Długiej 5 w Sopocie”. */
function opisAdres(tekst){
  const t = String(tekst || '');
  const w = {};
  const ul = /\b(ul\.|ulic[aye]|ulicy|al\.|alej[aei]|aleja|pl\.|plac|placu|os\.|osiedl[eua])\s+((?:\p{Lu}|\d)[\p{L}\d.\-]*(?:\s+(?!w\b|we\b|nr\b|numer\b)(?:\p{Lu}|\d)[\p{L}\d.\-]*){0,3}?)\s+(?:nr\s+|numer\s+)?(\d+[A-Za-z]?)(?:\s*(?:\/|m\.?|lok\.?|lokal)\s*(\d+[A-Za-z]?))?/u.exec(t);
  if (ul){
    const rodzaj = ul[1].toLowerCase();
    const przedrostek = /^al/.test(rodzaj) ? 'al. ' : /^pl/.test(rodzaj) ? 'pl. ' : /^os/.test(rodzaj) ? 'os. ' : '';
    w.street = { wartosc: przedrostek + ul[2].trim(), indeks: ul.index, dlugosc: ul[0].length };
    w.buildingNo = { wartosc: ul[3], indeks: ul.index, dlugosc: ul[0].length };
    if (ul[4]) w.unitNo = { wartosc: ul[4], indeks: ul.index, dlugosc: ul[0].length };
  }
  // Miejscowosc: po przecinku za adresem, po kodzie pocztowym albo po „w / we / miasto”.
  let miasto = null;
  const kod = /\b(\d{2}-\d{3})\s+(\p{Lu}[\p{L}\-]+(?:\s+\p{Lu}[\p{L}\-]+)?)/u.exec(t);
  if (kod){ miasto = { wartosc: kod[2], indeks: kod.index, dlugosc: kod[0].length }; w.postalCode = { wartosc: kod[1], indeks: kod.index, dlugosc: kod[0].length }; }
  if (!miasto && ul){
    const reszta = t.slice(ul.index + ul[0].length, ul.index + ul[0].length + 60);
    const po = /^\s*,\s*(\p{Lu}[\p{L}\-]+(?:\s+\p{Lu}[\p{L}\-]+)?)/u.exec(reszta);
    if (po) miasto = { wartosc: po[1], indeks: ul.index + ul[0].length, dlugosc: po[0].length };
  }
  if (!miasto){
    const m = /\b(?:[Mm]iejscowo[śs]\p{L}*|[Mm]iasto|[Mm]ie[śs]cie)\s*:?\s+(\p{Lu}[\p{L}\-]+(?:\s+\p{Lu}[\p{L}\-]+)?)/u.exec(t);
    if (m) miasto = { wartosc: m[1], indeks: m.index, dlugosc: m[0].length };
  }
  if (!miasto){
    // „w Gdańsku”, „we Wrocławiu” – forma odmieniona; zostawiamy ja do
    // potwierdzenia (pole `odmiana`), bo mianownika nie da sie pewnie odtworzyc.
    const m = /\b(?:w|we)\s+(\p{Lu}[\p{L}\-]{2,}(?:\s+\p{Lu}[\p{L}\-]+)?)/u.exec(t);
    if (m) miasto = { wartosc: opisMianownik(m[1]), indeks: m.index, dlugosc: m[0].length, odmiana: m[1] };
  }
  if (miasto) w.city = miasto;
  const dz = /\b(?:dzielnic[aey]|dzielnicy)\s+(\p{Lu}[\p{L}\-]+(?:\s+\p{Lu}[\p{L}\-]+)?)/u.exec(t);
  if (dz) w.district = { wartosc: dz[1], indeks: dz.index, dlugosc: dz[0].length };
  return w;
}

/** Najczestsze odmiany miejscownika. Gdy nie pasuje nic – zwraca slowo bez zmian. */
function opisMianownik(slowo){
  const s = String(slowo || '');
  const stale = { 'Gdańsku': 'Gdańsk', 'Gdyni': 'Gdynia', 'Sopocie': 'Sopot', 'Warszawie': 'Warszawa', 'Krakowie': 'Kraków', 'Wrocławiu': 'Wrocław', 'Poznaniu': 'Poznań', 'Łodzi': 'Łódź', 'Szczecinie': 'Szczecin', 'Lublinie': 'Lublin', 'Bydgoszczy': 'Bydgoszcz', 'Katowicach': 'Katowice', 'Białymstoku': 'Białystok', 'Toruniu': 'Toruń', 'Rzeszowie': 'Rzeszów', 'Olsztynie': 'Olsztyn', 'Kielcach': 'Kielce', 'Opolu': 'Opole', 'Gliwicach': 'Gliwice', 'Zielonej Górze': 'Zielona Góra', 'Gorzowie': 'Gorzów', 'Radomiu': 'Radom', 'Częstochowie': 'Częstochowa', 'Elblągu': 'Elbląg', 'Słupsku': 'Słupsk', 'Koszalinie': 'Koszalin', 'Tczewie': 'Tczew', 'Rumi': 'Rumia', 'Wejherowie': 'Wejherowo', 'Pruszczu Gdańskim': 'Pruszcz Gdański' };
  if (stale[s]) return stale[s];
  if (/owie$/.test(s)) return s.replace(/owie$/, 'ów');
  if (/sku$/.test(s)) return s.replace(/sku$/, 'sk');
  if (/cku$/.test(s)) return s.replace(/cku$/, 'ck');
  if (/inie$/.test(s)) return s.replace(/inie$/, 'in');
  if (/nie$/.test(s)) return s.replace(/nie$/, 'no');
  return s;
}

function opisDzialka(tekst){
  const t = String(tekst || '');
  const w = {};
  const d = /\bdzia[łl]k[aiąęe]\p{L}*\s+(?:ewidencyjn\p{L}*\s+)?(?:nr|numer|o\s+numerze)?\.?\s*(\d+(?:\/\d+)?)/iu.exec(t);
  if (d) w.plotNo = { wartosc: d[1], indeks: d.index, dlugosc: d[0].length };
  const o = /\bobr[ęe]b\p{L}*\s+(?:ewidencyjn\p{L}*\s+)?(?:nr\s+)?((?:\d{1,4})|(?:\p{Lu}[\p{L}\-]+(?:\s+\p{Lu}[\p{L}\-]+)?))/u.exec(t);
  if (o) w.district = { wartosc: o[1], indeks: o.index, dlugosc: o[0].length };
  return w;
}

function opisLiczby(tekst){
  const t = String(tekst || '');
  const w = {};
  const L = '(\\d{1,3}(?:[ \\u00a0]\\d{3})+|\\d+)(?:[.,](\\d{1,2}))?';
  // Powierzchnia dzialki – szukana PRZED powierzchnia uzytkowa, zeby „działka 800 m2” nie stala sie metrazem lokalu.
  const grunt = new RegExp('(?:dzia[łl]k\\p{L}*|grunt\\p{L}*)[^.\\n]{0,40}?' + L + '\\s*(m2|m²|mkw|m\\s*kw\\.?|ha|ar[óo]w|a\\b)', 'iu').exec(t);
  let gruntZakres = null;
  if (grunt){
    let n = opisLiczba(grunt[1] + (grunt[2] ? '.' + grunt[2] : ''));
    const j = grunt[3].toLowerCase();
    if (j === 'ha') n = n * 10000; else if (/^ar|^a$/.test(j)) n = n * 100;
    w.landArea = { wartosc: Math.round(n * 100) / 100, indeks: grunt.index, dlugosc: grunt[0].length };
    gruntZakres = [grunt.index, grunt.index + grunt[0].length];
  }
  const pow = new RegExp(L + '\\s*(?:m2|m²|mkw|m\\s*kw\\.?|metr[óo]w)', 'giu');
  let m;
  while ((m = pow.exec(t))){
    if (gruntZakres && m.index >= gruntZakres[0] && m.index < gruntZakres[1]) continue;
    const przed = t.slice(Math.max(0, m.index - 30), m.index).toLowerCase();
    if (/(balkon|taras|logg|piwnic|kom[óo]rk|ogr[óo]d)\p{L}*[^.]{0,12}$/u.test(przed)) continue;
    w.usableArea = { wartosc: opisLiczba(m[1] + (m[2] ? '.' + m[2] : '')), indeks: m.index, dlugosc: m[0].length };
    break;
  }
  const pok = /\b(\d{1,2})\s*[- ]?\s*(?:pokoj\p{L}*|pok\.|pokoi|pokoje)/iu.exec(t) || /\b(dwu|trzy|cztero|pięcio|piecio|jedno)pokojow\p{L}*/iu.exec(t);
  if (pok){
    const slownie = { jedno: 1, dwu: 2, trzy: 3, cztero: 4, 'pięcio': 5, piecio: 5 };
    const n = /^\d/.test(pok[1]) ? Number(pok[1]) : slownie[pok[1].toLowerCase()];
    if (n) w.rooms = { wartosc: n, indeks: pok.index, dlugosc: pok[0].length };
  }
  // Lokal dwupoziomowy („parter i piętro") nie ma jednego piętra – nie zgadujemy.
  const wielopoziomowy = /\b(dwu|wielo|trzy)(poziomow|kondygnacyjn)\p{L}*|\bparter\p{L}*\s+i\s+pi[ęe]tr|\bna\s+dw[óo]ch\s+(poziomach|kondygnacjach)/iu.test(t);
  const pietro = wielopoziomowy ? null : (/\b(?:na\s+)?(\d{1,2})\s*\.?\s*pi[ęe]tr\p{L}*/iu.exec(t) || /\bpi[ęe]tr\p{L}*\s*:?\s*(\d{1,2})\b/iu.exec(t));
  if (pietro) w.floor = { wartosc: Number(pietro[1]), indeks: pietro.index, dlugosc: pietro[0].length };
  else if (wielopoziomowy){ const m = /\b(dwu|wielo|trzy)(poziomow|kondygnacyjn)\p{L}*|\bparter\p{L}*\s+i\s+pi[ęe]tr\p{L}*/iu.exec(t); w.floor = { wartosc: 'lokal dwupoziomowy (parter i piętro)', indeks: m ? m.index : 0, dlugosc: m ? m[0].length : 0 }; }
  else if (!wielopoziomowy && /\bparter\p{L}*/iu.test(t)){ const p = /\bparter\p{L}*/iu.exec(t); w.floor = { wartosc: 0, indeks: p.index, dlugosc: p[0].length }; }
  // Data oględzin: „oględziny 1 listopada 2026", „oględziny: 01.11.2026", „oględziny 2026-11-01".
  const MIES = { stycz: 1, lut: 2, mar: 3, kwie: 4, maj: 5, czerw: 6, lip: 7, sierp: 8, wrze: 9, paź: 10, paz: 10, list: 11, grud: 12 };
  const og = /\bogl[ęe]dzin\p{L}*\s*(?:dnia|w\s+dniu|:)?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[.\/]\d{1,2}[.\/]\d{4}|\d{1,2}\s+\p{L}+\s+\d{4})/iu.exec(t);
  if (og){
    let d = og[1], iso = '';
    if (/^\d{4}-/.test(d)) iso = d;
    else if (/^\d{1,2}[.\/]/.test(d)){ const [dd, mm, rr] = d.split(/[.\/]/); iso = `${rr}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`; }
    else { const [dd, mies, rr] = d.split(/\s+/); const k = Object.keys(MIES).find(x => mies.toLowerCase().startsWith(x)); if (k) iso = `${rr}-${String(MIES[k]).padStart(2, '0')}-${dd.padStart(2, '0')}`; }
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) w.inspectionDate = { wartosc: iso, indeks: og.index, dlugosc: og[0].length };
  }
  const rok = /\b(?:rok\p{L}*\s+budowy|z\s+roku|wybudowan\p{L}*\s+w|oddan\p{L}*\s+do\s+u[żz]ytkowania\s+w|budyn\p{L}*\s+z)\s*:?\s*(?:roku\s+)?((?:18|19|20)\d{2})\b/iu.exec(t);
  if (rok) w.yearBuilt = { wartosc: Number(rok[1]), indeks: rok.index, dlugosc: rok[0].length };
  const cena = new RegExp('(?:cen\\p{L}*\\s+ofertow\\p{L}*|oferta|wystawion\\p{L}*\\s+za|za\\s+kwot[ęe])[^\\d\\n]{0,25}' + L + '\\s*(tys\\.?|mln|zł|zl|pln)?', 'iu').exec(t);
  if (cena){
    let n = opisLiczba(cena[1] + (cena[2] ? '.' + cena[2] : ''));
    const j = String(cena[3] || '').toLowerCase();
    if (/^tys/.test(j)) n *= 1000; else if (j === 'mln') n *= 1000000;
    if (n >= 1000) w.askingPrice = { wartosc: Math.round(n), indeks: cena.index, dlugosc: cena[0].length };
  }
  return w;
}

function opisRodzaj(tekst){
  const t = String(tekst || '');
  let najlepszy = null;
  for (const [kod, etykieta, re] of OPIS_RODZAJE){
    const m = re.exec(t);
    if (m && (!najlepszy || m.index < najlepszy.indeks)) najlepszy = { wartosc: kod, etykieta, indeks: m.index, dlugosc: m[0].length };
  }
  return najlepszy;
}

function opisCel(tekst){
  const t = String(tekst || '');
  const jawny = /\bcel\p{L}*\s+(?:wyceny|operatu|opracowania)\s*:?\s*([^.\n]{6,120})/iu.exec(t);
  if (jawny) return { wartosc: jawny[1].trim().replace(/[,;]$/, ''), indeks: jawny.index, dlugosc: jawny[0].length, jawny: true };
  for (const [cel, re] of OPIS_CELE){
    const m = re.exec(t);
    if (m) return { wartosc: cel, indeks: m.index, dlugosc: m[0].length };
  }
  return null;
}

function opisKlient(tekst){
  const t = String(tekst || '');
  const m = /(?:^|[^\p{L}])(?:[Zz]leceniodawc[aąy]\p{L}*|[Kk]lient\p{L}*|[Zz]amawiaj[ąa]c\p{L}*|dla\s+(?:[Pp]ana|[Pp]ani|[Pp]aństwa))\s*:?\s+((?:\p{Lu}[\p{L}\-]+)(?:[ \t]+\p{Lu}[\p{L}\-]+){0,3})/u.exec(t);
  return m ? { wartosc: m[1].trim(), indeks: m.index, dlugosc: m[0].length } : null;
}

/** Rodzaj z opisu → modul programu. `pewny: false` znaczy „do potwierdzenia”. */
const OPIS_MODULY = {
  lokal_mieszkalny: { modul: 'local_kcm', pewny: true }, lokal_uzytkowy: { modul: 'local_kcm', pewny: false },
  garaz: { modul: 'local_kcm', pewny: false }, dom: { modul: 'developed_pairs', pewny: true }, grunt: { modul: 'developed_pairs', pewny: false },
};
function opisModul(wynik, tekst){
  const r = (wynik?.fakty || []).find(x => x.klucz === 'rodzaj');
  if (!r) return null;
  if (r.wartosc === 'grunt' && /\b(roln|le[śs]n)\p{L}*/iu.test(String(tekst || ''))) return { modul: 'agri_forest', pewny: true };
  return OPIS_MODULY[r.wartosc] || null;
}

const OPIS_ETYKIETY = {
  rodzaj: 'Rodzaj nieruchomości', kw: 'Księga wieczysta', street: 'Ulica', buildingNo: 'Nr budynku', unitNo: 'Nr lokalu',
  city: 'Miejscowość', postalCode: 'Kod pocztowy', district: 'Dzielnica', plotNo: 'Działka', obreb: 'Obręb',
  usableArea: 'Powierzchnia użytkowa', landArea: 'Powierzchnia działki', rooms: 'Liczba pokoi', floor: 'Piętro',
  yearBuilt: 'Rok budowy', inspectionDate: 'Data oględzin', segment: 'Typ zabudowy', askingPrice: 'Cena ofertowa', cel: 'Cel wyceny', klient: 'Zleceniodawca',
};

/** Glowna funkcja: tekst → fakty, braki i podsumowanie. */
function opisCzytaj(tekst){
  const t = String(tekst || '').replace(/\r/g, '');
  const fakty = [];
  const dodaj = (klucz, f, pokaz) => {
    if (!f || f.wartosc === '' || f.wartosc == null) return;
    fakty.push({ klucz, etykieta: OPIS_ETYKIETY[klucz] || klucz, wartosc: f.wartosc, pokaz: pokaz != null ? pokaz : String(f.etykieta || f.wartosc), skad: opisFragment(t, f.indeks, f.dlugosc), doPotwierdzenia: !!f.odmiana });
  };
  const r = opisRodzaj(t); dodaj('rodzaj', r, r && r.etykieta);
  dodaj('kw', opisKw(t));
  const a = opisAdres(t);
  dodaj('street', a.street); dodaj('buildingNo', a.buildingNo); dodaj('unitNo', a.unitNo); dodaj('city', a.city); dodaj('postalCode', a.postalCode); dodaj('district', a.district);
  const d = opisDzialka(t); dodaj('plotNo', d.plotNo); dodaj('obreb', d.district);
  const l = opisLiczby(t);
  dodaj('usableArea', l.usableArea, l.usableArea && `${String(l.usableArea.wartosc).replace('.', ',')} m²`);
  dodaj('landArea', l.landArea, l.landArea && `${String(l.landArea.wartosc).replace('.', ',')} m²`);
  dodaj('rooms', l.rooms); dodaj('floor', l.floor, l.floor && (l.floor.wartosc === 0 ? 'parter' : String(l.floor.wartosc)));
  dodaj('yearBuilt', l.yearBuilt);
  dodaj('inspectionDate', l.inspectionDate);
  const seg = /\b(zabudow\p{L}*\s+bli[źz]niacz\p{L}*|bli[źz]niak\p{L}*|segment\p{L}*|zabudow\p{L}*\s+szeregow\p{L}*)/iu.exec(t);
  if (seg) dodaj('segment', { wartosc: true, indeks: seg.index, dlugosc: seg[0].length }, /szereg/i.test(seg[0]) ? 'zabudowa szeregowa' : 'zabudowa bliźniacza');
  dodaj('askingPrice', l.askingPrice, l.askingPrice && `${String(l.askingPrice.wartosc).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} zł`);
  dodaj('cel', opisCel(t)); dodaj('klient', opisKlient(t));
  const ma = k => fakty.some(f => f.klucz === k);
  const braki = [];
  if (!ma('rodzaj')) braki.push({ klucz: 'rodzaj', co: 'rodzaj nieruchomości', po: 'od niego zależy podejście i układ operatu' });
  if (!ma('city') || !ma('street')) braki.push({ klucz: 'adres', co: 'adres (miejscowość i ulica z numerem)', po: 'od adresu zaczyna się zbieranie danych z rejestrów i map' });
  if (!ma('kw')) braki.push({ klucz: 'kw', co: 'numer księgi wieczystej albo jej treść', po: 'stan prawny musi wynikać z księgi' });
  if (!ma('usableArea') && !ma('landArea')) braki.push({ klucz: 'powierzchnia', co: 'powierzchnia', po: 'bez niej nie da się policzyć wartości' });
  if (!ma('cel')) braki.push({ klucz: 'cel', co: 'cel wyceny', po: 'cel decyduje o rodzaju wartości i klauzulach' });
  return { fakty, braki, dlugosc: t.trim().length, wystarczy: ma('city') && ma('street') };
}

/**
 * Wpisanie faktow do projektu. Program wpisuje WYLACZNIE do pustych rubryk,
 * zeby opis nie nadpisal niczego, co rzeczoznawca wprowadzil recznie.
 * Zwraca liste tego, co wpisal, i tego, co pominal.
 */
function opisDoProjektu(project, wynik, opcje){
  const p = project || {};
  p.property = p.property || {}; p.legal = p.legal || {}; p.egib = p.egib || {}; p.valuation = p.valuation || {}; p.client = p.client || {};
  const wpisane = [], pominiete = [];
  const pusty = v => v == null || String(v).trim() === '' || v === 0;
  const wstaw = (obiekt, pole, f) => {
    if (!f) return;
    if (pusty(obiekt[pole])){ obiekt[pole] = f.wartosc; wpisane.push({ etykieta: f.etykieta, wartosc: f.pokaz }); }
    else if (String(obiekt[pole]) !== String(f.wartosc)) pominiete.push({ etykieta: f.etykieta, wartosc: f.pokaz, jest: String(obiekt[pole]) });
  };
  const f = k => (wynik?.fakty || []).find(x => x.klucz === k);
  wstaw(p.property, 'street', f('street')); wstaw(p.property, 'buildingNo', f('buildingNo')); wstaw(p.property, 'localNo', f('unitNo'));
  wstaw(p.property, 'city', f('city')); wstaw(p.property, 'postalCode', f('postalCode')); wstaw(p.property, 'district', f('district'));
  wstaw(p.property, 'usableArea', f('usableArea')); wstaw(p.property, 'landArea', f('landArea'));
  wstaw(p.property, 'rooms', f('rooms')); wstaw(p.property, 'floor', f('floor')); wstaw(p.property, 'askingPrice', f('askingPrice'));
  p.building = p.building || {}; wstaw(p.building, 'year', f('yearBuilt'));
  wstaw(p.legal, 'kwLocal', f('kw')); wstaw(p.egib, 'plotNo', f('plotNo')); wstaw(p.egib, 'district', f('obreb'));
  wstaw(p.client, 'name', f('klient'));
  wstaw(p.building, 'storeys', f('storeys')); wstaw(p.building, 'condition', f('condition')); wstaw(p.building, 'builtUpArea', f('builtUpArea'));
  wstaw(p.property, 'rightType', f('prawo'));
  const seg = f('segment');
  if (seg && !p.property.segmentType){ p.property.segmentType = seg.pokaz; wpisane.push({ etykieta: seg.etykieta, wartosc: seg.pokaz }); }
  // Data oględzin w nowym operacie jest dzisiejsza (domyślna) – opis ją zastępuje.
  const og = f('inspectionDate');
  if (og && (pusty(p.valuation.inspectionDate) || (opcje && opcje.dzis && p.valuation.inspectionDate === opcje.dzis))){ p.valuation.inspectionDate = og.wartosc; wpisane.push({ etykieta: og.etykieta, wartosc: og.pokaz }); }
  // Cel wyceny ma w nowym operacie tekst domyslny – wolno go zastapic tylko
  // wtedy, gdy nikt go jeszcze nie zmienil.
  const cel = f('cel');
  if (cel && (pusty(p.valuation.purpose) || (opcje && opcje.celDomyslny && p.valuation.purpose === opcje.celDomyslny))){
    const tekst = cel.wartosc && /^okre[śs]l/i.test(cel.wartosc) ? cel.wartosc : `Określenie wartości rynkowej nieruchomości — ${cel.wartosc}`;
    p.valuation.purpose = tekst; wpisane.push({ etykieta: cel.etykieta, wartosc: cel.pokaz });
  }
  return { wpisane, pominiete };
}

/* ---- 3.4.1: opis czyta Claude ----
 * Rzeczoznawca pisze jak do czatu — dowolnie, z wklejoną księgą albo bez. Claude zwraca
 * fakty w JSON; program dokłada je tam, gdzie wzorce nic nie znalazły (albo znalazły słabiej).
 * Zasada „nic nie zgadujemy” zostaje: pole bez źródła w tekście jest pomijane.
 */
const OPIS_CLAUDE_KLUCZE = ['rodzaj', 'kw', 'street', 'buildingNo', 'unitNo', 'city', 'postalCode', 'district', 'plotNo', 'obreb',
  'usableArea', 'landArea', 'builtUpArea', 'rooms', 'floor', 'storeys', 'yearBuilt', 'inspectionDate', 'segment', 'condition',
  'askingPrice', 'cel', 'klient', 'prawo'];
Object.assign(OPIS_ETYKIETY, { builtUpArea: 'Powierzchnia zabudowy', storeys: 'Kondygnacje', condition: 'Stan techniczny', prawo: 'Prawo do nieruchomości' });

function opisPolecenieClaude(tekst){
  return 'Poniżej jest opis zlecenia wyceny napisany przez rzeczoznawcę majątkowego własnymi słowami '
    + '(może zawierać literówki, skróty i wklejoną treść księgi wieczystej). Wyciągnij z niego fakty potrzebne do operatu.\n'
    + 'Odpowiedz WYŁĄCZNIE jednym obiektem JSON, bez komentarzy, z polami (pomiń pole, którego NIE ma w tekście — nic nie zgaduj):\n'
    + '{"rodzaj": "lokal_mieszkalny|lokal_uzytkowy|dom|grunt|garaz", "kw": "AAAA/00000000/0", "street": "nazwa ulicy bez „ul.”", '
    + '"buildingNo": "", "unitNo": "", "city": "", "postalCode": "00-000", "district": "dzielnica", "plotNo": "nr działki", "obreb": "", '
    + '"usableArea": liczba m2, "landArea": liczba m2 działki, "builtUpArea": liczba m2 zabudowy, "rooms": liczba, "floor": liczba (0 = parter), '
    + '"storeys": liczba kondygnacji, "yearBuilt": rok, "inspectionDate": "RRRR-MM-DD", "segment": "wolnostojąca|bliźniacza|szeregowa", '
    + '"condition": "krótko: stan i wykończenie", "askingPrice": liczba zł, "cel": "cel wyceny", "klient": "zleceniodawca", '
    + '"prawo": "własność|współwłasność|użytkowanie wieczyste|spółdzielcze własnościowe", '
    + '"skad": {"pole": "dosłowny fragment opisu, z którego pochodzi"}}\n'
    + 'Uwaga: „X/Y” po nazwie ulicy w adresie domu to zwykle numer budynku i lokalu. „Dom”, „bliźniak”, „segment” = rodzaj „dom”.\n\n'
    + 'OPIS:\n"""\n' + String(tekst || '').slice(0, 60000) + '\n"""';
}

function opisJson(odp){
  const t = String(odp || ''); const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

/** Odpowiedź Claude -> fakty w tym samym kształcie, co z opisCzytaj (z flagą zClaude). */
function opisZClaude(odp){
  const j = opisJson(odp); if (!j || typeof j !== 'object') return [];
  const skad = (j.skad && typeof j.skad === 'object') ? j.skad : {};
  const fakty = [];
  const rodzaje = Object.fromEntries(OPIS_RODZAJE.map(x => [x[0], x[1]]));
  for (const k of OPIS_CLAUDE_KLUCZE){
    let v = j[k]; if (v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) continue;
    let pokaz = String(v);
    if (['usableArea', 'landArea', 'builtUpArea', 'askingPrice'].includes(k) || ['rooms', 'floor', 'storeys', 'yearBuilt'].includes(k)){
      const n = typeof v === 'number' ? v : opisLiczba((/\d[\d\s\u00a0]*(?:[.,]\d+)?/.exec(String(v)) || [''])[0]); if (n == null || n < 0) continue; v = n;
      pokaz = ['usableArea', 'landArea', 'builtUpArea'].includes(k) ? `${String(n).replace('.', ',')} m²` : k === 'askingPrice' ? `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')} zł` : k === 'floor' && n === 0 ? 'parter' : String(n);
    }
    if (k === 'rodzaj'){ if (!rodzaje[v]) continue; pokaz = rodzaje[v]; }
    if (k === 'kw'){ const kw = opisKw(String(v)); if (!kw) continue; v = kw.wartosc; pokaz = v; }
    if (k === 'segment'){ pokaz = /szereg/i.test(v) ? 'zabudowa szeregowa' : /bli/i.test(v) ? 'zabudowa bliźniacza' : 'zabudowa wolnostojąca'; v = true; }
    if (k === 'inspectionDate' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) continue;
    fakty.push({ klucz: k, etykieta: OPIS_ETYKIETY[k] || k, wartosc: v, pokaz, skad: String(skad[k] || 'odczytane przez Claude z opisu').slice(0, 200), zClaude: true });
  }
  return fakty;
}

/** Łączy wynik wzorców z faktami Claude: Claude uzupełnia i poprawia, braki liczone od nowa. */
function opisPolacz(wynik, faktyClaude){
  const w = wynik || { fakty: [], braki: [] };
  if (!Array.isArray(faktyClaude) || !faktyClaude.length) return w;
  const mapa = new Map(w.fakty.map(f => [f.klucz, f]));
  for (const f of faktyClaude) mapa.set(f.klucz, f);
  const fakty = [...mapa.values()];
  const ma = k => mapa.has(k);
  const braki = w.braki.filter(b => !(b.klucz === 'adres' ? ma('city') && ma('street') : b.klucz === 'powierzchnia' ? ma('usableArea') || ma('landArea') : ma(b.klucz)));
  return { ...w, fakty, braki, wystarczy: ma('city') && ma('street'), claude: true };
}

const API_OPIS = {
  czytaj: opisCzytaj, doProjektu: opisDoProjektu, modul: opisModul, kw: opisKw, adres: opisAdres, dzialka: opisDzialka, liczby: opisLiczby,
  rodzaj: opisRodzaj, cel: opisCel, klient: opisKlient, polecenieClaude: opisPolecenieClaude, zClaude: opisZClaude, polacz: opisPolacz, mianownik: opisMianownik, RODZAJE: OPIS_RODZAJE.map(x => x[0]), ETYKIETY: OPIS_ETYKIETY,
};
if (typeof window !== 'undefined') window.OperoOpis = API_OPIS;
if (typeof module !== 'undefined' && module.exports) module.exports = API_OPIS;

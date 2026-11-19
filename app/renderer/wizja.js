/* OPERO 3.4 — WIZJA: Claude czyta dokumenty i zdjęcia.
 *
 * Moduł czysty: polecenia dla modelu i czytanie jego odpowiedzi (JSON).
 * Sieć jest w procesie głównym (chmura:wizja). Model widzi obrazy tak jak
 * rzeczoznawca: rozróżnia zrzut księgi, rzut, elewację domu, wnętrze, mapę
 * i dokument, przepisuje treść ksiąg i wskazuje zdjęcie na okładkę.
 */
'use strict';

const WZ_RODZAJE = ['kw', 'rzut', 'elewacja', 'wnetrze', 'otoczenie', 'mapa', 'dokument', 'inne'];

const WZ_SYSTEM = 'Jesteś doświadczonym rzeczoznawcą majątkowym w Polsce i asystentem do analizy dokumentów. '
  + 'Patrzysz na obrazy jak profesjonalista: rozpoznajesz treść elektronicznych ksiąg wieczystych (EKW), rzuty, zdjęcia budynków i wnętrz, mapy i dokumenty urzędowe. '
  + 'Niczego nie zgadujesz: jeśli czegoś nie widać albo nie da się odczytać, zostawiasz puste pole. Odpowiadasz wyłącznie poprawnym JSON, bez komentarzy.';

/** Polecenie: rozpoznaj rodzaj każdego obrazu. `nazwy`: nazwy plików w kolejności obrazów. */
function wzPolecenieKlasyfikacji(nazwy){
  const lista = (nazwy || []).map((n, i) => `${i + 1}. ${String(n || '').slice(0, 80)}`).join('\n');
  return 'Dostajesz obrazy wrzucone do operatu szacunkowego (w tej kolejności):\n' + lista + '\n\n'
    + 'Dla KAŻDEGO obrazu ustal:\n'
    + '- "rodzaj": jeden z: "kw" (zrzut/skan/wydruk księgi wieczystej — działy I-O, I-Sp, II, III, IV), "rzut" (rzut lub szkic lokalu/budynku z pomieszczeniami), '
    + '"elewacja" (zdjęcie budynku z zewnątrz — bryła, elewacja, wejście, dom), "wnetrze" (zdjęcie pomieszczenia), "otoczenie" (ulica, osiedle, teren, ogród, garaż z zewnątrz), '
    + '"mapa" (mapa, ortofotomapa, mapa ewidencyjna, plan), "dokument" (inny dokument tekstowy: umowa, wypis, decyzja, zaświadczenie), "inne".\n'
    + '- "pomieszczenie": dla wnętrz — salon, kuchnia, łazienka, sypialnia, pokój, korytarz, schody, garderoba, pomieszczenie gospodarcze itp.; inaczej "".\n'
    + '- "podpis": krótki podpis do dokumentacji fotograficznej operatu (np. "Budynek — elewacja frontowa", "Salon z aneksem kuchennym", "Łazienka na piętrze").\n'
    + '- "okladka": 0–10 — jak dobre jest to zdjęcie na stronę tytułową operatu (10 = wyraźne zdjęcie całego budynku z zewnątrz w dobrym świetle; wnętrza, dokumenty i mapy = 0).\n'
    + '- "uwagi": rzeczy ważne dla wyceny widoczne na obrazie (krótko, może być "").\n'
    + 'Odpowiedz JSON: {"obrazy":[{"nr":1,"rodzaj":"…","pomieszczenie":"…","podpis":"…","okladka":0,"uwagi":"…"}]}';
}

/** Polecenie: przepisz księgę wieczystą ze zrzutów / skanów i wypełnij pola. */
function wzPolecenieKsiegi(){
  return 'Obrazy to zrzuty ekranu albo skany elektronicznej księgi wieczystej (EKW). Zrób dwie rzeczy:\n'
    + '1) "tekst": przepisz DOKŁADNIE całą widoczną treść, dział po dziale, zachowując nagłówki tak jak w EKW, np. '
    + '"TREŚĆ KSIĘGI WIECZYSTEJ NR …", "DZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI", "DZIAŁ I-SP - SPIS PRAW ZWIĄZANYCH Z WŁASNOŚCIĄ", '
    + '"DZIAŁ II - WŁASNOŚĆ", "DZIAŁ III - PRAWA, ROSZCZENIA I OGRANICZENIA", "DZIAŁ IV - HIPOTEKA". Rubryki zapisuj jako „Nazwa rubryki: wartość”, każda w osobnej linii. '
    + 'Polskie znaki, liczby, ułamki udziałów, numery ksiąg i identyfikatory przepisuj znak w znak. Nie poprawiaj i nie dopisuj niczego.\n'
    + '2) "pola": wyciągnij wartości (puste, jeśli nie ma ich na obrazach):\n'
    + '{"numerKsiegi":"AAAA/00000000/0","sad":"","stanNa":"","wojewodztwo":"","powiat":"","gmina":"","miejscowosc":"","ulica":"","numerBudynku":"","numerLokalu":"",'
    + '"identyfikatorLokalu":"","przeznaczenie":"","opisIzb":"","liczbaIzb":"","kondygnacja":"","powierzchniaUzytkowa":"liczba w m2","ksiegaMacierzysta":"","udzial":"np. 11373/22745",'
    + '"rodzajPrawa":"","wlasciciele":["tylko imię i nazwisko albo nazwa"],"podstawaNabycia":"","dzialIII":"treść albo „brak wpisów”","dzialIV":"treść albo „brak wpisów”"}\n'
    + 'Odpowiedz JSON: {"tekst":"…","pola":{…}}';
}

/** Polecenie: rozpoznaj i przepisz dokument (strony PDF-a albo obrazy). */
function wzPolecenieDokumentu(nazwa){
  return `Załączony materiał to dokument „${String(nazwa || '').slice(0, 120)}” (cały PDF albo obrazy kolejnych stron). Ustal:\n`
    + '- "rodzaj": "kw" (księga wieczysta), "operat" (operat szacunkowy), "podrecznik" (podręcznik/literatura fachowa), "wypis_egib" (wypis/wyrys z ewidencji), '
    + '"wypis_mpzp" (wypis/wyrys z planu miejscowego, decyzja WZ), "akt" (akt notarialny, umowa), "rzut" (projekt, rzuty), "inne";\n'
    + '- "tytul": krótki tytuł dokumentu;\n'
    + '- "tekst": wierna transkrypcja całej treści (dla księgi — w układzie działów EKW, rubryki „Nazwa: wartość”);\n'
    + '- "streszczenie": 1–3 zdania, co z tego dokumentu jest ważne dla operatu;\n'
    + '- "fakty": tylko to, co stoi w dokumencie: {"dzialka":"nr","obreb":"","powierzchniaDzialki":liczba m2,"powierzchniaUzytkowa":liczba m2,'
    + '"przeznaczenieMpzp":"opis","symbolMpzp":"np. MN1","uzytek":"np. B, Bp","cena":liczba zł,"dataDokumentu":"RRRR-MM-DD","numerKw":"AAAA/00000000/0"}.\n'
    + 'Odpowiedz JSON: {"rodzaj":"…","tytul":"…","tekst":"…","streszczenie":"…","fakty":{…}}';
}

/** JSON z odpowiedzi modelu — także gdy jest owinięty tekstem albo blokiem kodu. */
function wzJson(tekst){
  const t = String(tekst || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

/** Klasyfikacja → lista w kolejności obrazów (brakujące = "inne"). */
function wzKlasyfikacja(tekst, ile){
  const j = wzJson(tekst), out = [];
  const lista = Array.isArray(j?.obrazy) ? j.obrazy : Array.isArray(j) ? j : [];
  for (let i = 0; i < ile; i++){
    const o = lista.find(x => Number(x?.nr) === i + 1) || lista[i] || {};
    const rodzaj = WZ_RODZAJE.includes(String(o.rodzaj || '').toLowerCase()) ? String(o.rodzaj).toLowerCase() : 'inne';
    const okladka = Math.max(0, Math.min(10, Number(o.okladka) || 0));
    out.push({ rodzaj, pomieszczenie: String(o.pomieszczenie || '').slice(0, 60), podpis: String(o.podpis || '').slice(0, 140), okladka: rodzaj === 'elewacja' || rodzaj === 'otoczenie' ? okladka : 0, uwagi: String(o.uwagi || '').slice(0, 300), zModelu: !!lista.length });
  }
  return out;
}

/** Kategoria zdjęcia w operacie (zgodna z generatorem raportu). */
function wzKategoria(rodzaj, zabudowana){
  if (rodzaj === 'elewacja') return 'Budynek';
  if (rodzaj === 'otoczenie') return 'Otoczenie';
  if (rodzaj === 'wnetrze') return zabudowana ? 'Wnętrze' : 'Lokal';
  if (rodzaj === 'mapa') return 'Załącznik';
  return 'Dokumenty';
}

/** Wybór okładki: najlepsza elewacja (a gdy jej brak — otoczenie). Zwraca indeks albo -1. */
function wzOkladka(klasy){
  let naj = -1, pkt = 0;
  (klasy || []).forEach((k, i) => {
    const p = (k.rodzaj === 'elewacja' ? 100 : k.rodzaj === 'otoczenie' ? 50 : 0) + (Number(k.okladka) || 0);
    if (p > pkt && (k.rodzaj === 'elewacja' || k.rodzaj === 'otoczenie')) { pkt = p; naj = i; }
  });
  return naj;
}

/** Księga: { tekst, pola } z odpowiedzi; numer księgi sprawdzony wzorcem. */
function wzKsiega(tekst){
  const j = wzJson(tekst) || {};
  const p = j.pola && typeof j.pola === 'object' ? j.pola : {};
  const t = String(j.tekst || '').trim();
  const numer = String(p.numerKsiegi || '').toUpperCase().replace(/\s+/g, '');
  const pola = {};
  for (const [k, v] of Object.entries(p)) pola[k] = Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : String(v ?? '').trim();
  pola.numerKsiegi = /^[A-Z0-9]{4}\/\d{8}\/\d$/.test(numer) ? numer : '';
  const pow = Number(String(p.powierzchniaUzytkowa || '').replace(/[^\d,.]/g, '').replace(',', '.'));
  pola.powierzchniaUzytkowa = pow > 0 && pow < 100000 ? Math.round(pow * 100) / 100 : '';
  return { ok: !!(t || pola.numerKsiegi), tekst: t, pola };
}

/**
 * Uzupełnia PUSTE pola operatu wartościami odczytanymi z księgi przez model.
 * Zwraca listę wpisanych pól (etykiety). Niczego nie nadpisuje.
 */
function wzKsiegaDoProjektu(project, pola){
  const p = pola || {}, wpisane = [];
  const ustaw = (sciezka, wartosc, etykieta) => {
    if (wartosc === '' || wartosc == null || (Array.isArray(wartosc) && !wartosc.length)) return;
    const cz = sciezka.split('.'); let o = project;
    for (let i = 0; i < cz.length - 1; i++) { o[cz[i]] = o[cz[i]] && typeof o[cz[i]] === 'object' ? o[cz[i]] : {}; o = o[cz[i]]; }
    const kl = cz[cz.length - 1];
    if (String(o[kl] ?? '').trim() !== '' && Number(o[kl]) !== 0) return;
    o[kl] = Array.isArray(wartosc) ? wartosc.join(', ') : wartosc;
    wpisane.push(etykieta);
    project.autoWpisane = project.autoWpisane || {};
    project.autoWpisane[sciezka] = { zrodlo: 'Claude ze zrzutu księgi — porównaj z księgą', kiedy: new Date().toISOString() };
  };
  ustaw('legal.kwLocal', p.numerKsiegi, 'numer księgi');
  ustaw('legal.court', p.sad, 'sąd');
  ustaw('legal.kwCommon', p.ksiegaMacierzysta, 'księga nieruchomości wspólnej');
  ustaw('legal.commonShare', p.udzial, 'udział w nieruchomości wspólnej');
  ustaw('legal.ispRightType', p.rodzajPrawa, 'rodzaj prawa');
  ustaw('legal.ownerNames', p.wlasciciele, 'właściciel');
  ustaw('legal.currentEntryBasis', p.podstawaNabycia, 'podstawa nabycia');
  ustaw('legal.sectionIII', p.dzialIII, 'dział III');
  ustaw('legal.sectionIV', p.dzialIV, 'dział IV');
  ustaw('legal.ioRooms', p.opisIzb, 'opis izb');
  ustaw('property.city', p.miejscowosc, 'miejscowość');
  ustaw('property.street', String(p.ulica || '').replace(/^(ul\.|ulica)\s*/i, ''), 'ulica');
  ustaw('property.buildingNo', p.numerBudynku, 'numer budynku');
  ustaw('property.localNo', p.numerLokalu, 'numer lokalu');
  ustaw('property.usableArea', p.powierzchniaUzytkowa, 'powierzchnia użytkowa (z księgi)');
  return wpisane;
}

/** Fakty z dokumentu (wypis, wyrys, akt, decyzja) -> puste pola operatu. Zwraca listę wpisanych. */
function wzFaktyDoProjektu(project, fakty, zrodlo){
  const p = project || {}, f = fakty && typeof fakty === 'object' ? fakty : {};
  p.property = p.property || {}; p.egib = p.egib || {}; p.planning = p.planning || {}; p.legal = p.legal || {};
  const wpisane = [];
  const liczba = v => { const m = typeof v === 'number' ? null : /\d[\d\s\u00a0]*(?:[.,]\d+)?/.exec(String(v || '')); const n = typeof v === 'number' ? v : m ? Number(m[0].replace(/[\s\u00a0]/g, '').replace(',', '.')) : NaN; return Number.isFinite(n) && n > 0 ? n : null; };
  const pusty = v => v == null || String(v).trim() === '' || v === 0;
  const wstaw = (o, k, v, et) => { if (v == null || v === '' || !pusty(o[k])) return; o[k] = k === 'notes' ? `Użytek: ${v}` : v; if (!/EGiB/.test(et)) wpisane.push(`${et}: ${v}`); };
  wstaw(p.egib, 'plotNo', String(f.dzialka || '').trim() || null, 'Działka');
  wstaw(p.egib, 'district', String(f.obreb || '').trim() || null, 'Obręb');
  wstaw(p.property, 'landArea', liczba(f.powierzchniaDzialki), 'Powierzchnia działki'); wstaw(p.egib, 'plotArea', liczba(f.powierzchniaDzialki), 'Pow. działki (EGiB)');
  wstaw(p.property, 'usableArea', liczba(f.powierzchniaUzytkowa), 'Powierzchnia użytkowa');
  wstaw(p.planning, 'zoneSymbol', String(f.symbolMpzp || '').trim() || null, 'Symbol planu');
  wstaw(p.planning, 'designation', String(f.przeznaczenieMpzp || '').trim() || null, 'Przeznaczenie w planie');
  wstaw(p.egib, 'notes', String(f.uzytek || '').trim() || null, 'Użytek');
  const kw = /^[A-Z0-9]{4}\/\d{8}\/\d$/.test(String(f.numerKw || '').toUpperCase().replace(/\s/g, '')) ? String(f.numerKw).toUpperCase().replace(/\s/g, '') : null;
  wstaw(p.legal, 'kwLocal', kw, 'Księga wieczysta');
  if (wpisane.length){ p.autoWpisane = Array.isArray(p.autoWpisane) ? p.autoWpisane : []; p.autoWpisane.push({ zrodlo: `Claude z dokumentu „${zrodlo || ''}” — sprawdź z oryginałem`, pola: wpisane.slice() }); }
  return wpisane;
}

const API_WIZJA = {
  RODZAJE: WZ_RODZAJE, SYSTEM: WZ_SYSTEM, polecenieKlasyfikacji: wzPolecenieKlasyfikacji, polecenieKsiegi: wzPolecenieKsiegi,
  polecenieDokumentu: wzPolecenieDokumentu, json: wzJson, klasyfikacja: wzKlasyfikacja, kategoria: wzKategoria, okladka: wzOkladka,
  ksiega: wzKsiega, ksiegaDoProjektu: wzKsiegaDoProjektu, faktyDoProjektu: wzFaktyDoProjektu,
};
if (typeof window !== 'undefined') window.OperoWizja = API_WIZJA;
if (typeof module !== 'undefined' && module.exports) module.exports = API_WIZJA;

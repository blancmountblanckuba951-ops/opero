/* OPERO 3.0 — „Wrzuć wszystko"
 *
 * Jedno pole na wszystkie dokumenty – jak w czacie. Rozpoznanie typu robi
 * proces główny (main.js: wsad), tu program decyduje, co z każdym plikiem
 * zrobić w operacie:
 *   księga (zrzuty)  → tekst do Agenta Ksiąg Wieczystych,
 *   rzut             → dokumentacja (rzut lokalu) i załącznik,
 *   zdjęcia          → dokumentacja fotograficzna,
 *   PDF              → podręcznik / wzór operatu / księga / załącznik,
 *   Word             → wzór operatu (pamięć wzorców) albo załącznik,
 *   Excel / CSV      → wyciąg z rejestru cen do Bazy rynku,
 *   tekst            → księga albo opis zlecenia.
 */
'use strict';

const WSAD_NAZWY = { kw: 'Księga wieczysta', rzut: 'Rzut', zdjecie: 'Zdjęcia', podrecznik: 'Podręcznik', wzor: 'Wzory operatów', rcn: 'Wyciąg z rejestru cen', zalacznik: 'Załączniki', opis: 'Opis', blad: 'Nie wczytano' };
const WSAD_ZNAKI = { kw: '⚖', rzut: '⌂', zdjecie: '◐', podrecznik: '❦', wzor: '✎', rcn: '▦', zalacznik: '▤', opis: '✦', blad: '!' };
let wsadTrwa = false;

function wsadStan(){ const s = studioStan(); s.wsad = s.wsad && typeof s.wsad === 'object' ? s.wsad : { pozycje: [] }; return s.wsad; }
function wsadDopisz(rodzaj, nazwa, opis){
  const w = wsadStan();
  w.pozycje = w.pozycje.filter(p => !(p.rodzaj === rodzaj && p.nazwa === nazwa));
  w.pozycje.push({ rodzaj, nazwa: String(nazwa || '').slice(0, 120), opis: String(opis || '').slice(0, 240), kiedy: new Date().toISOString() });
  if (w.pozycje.length > 400) w.pozycje.splice(0, w.pozycje.length - 400);
}

function wsadCzyKsiega(tekst){ return /KSI[ĘE]G[IA]\s+WIECZYST|DZIA[ŁL]\s+I+-?\s*(O|SP)\b|OZNACZENIE\s+NIERUCHOMO/i.test(String(tekst || '')); }
function wsadCzyOperat(tekst){
  const t = String(tekst || '');
  return /OPERAT\s+SZACUNKOWY/i.test(t) || (t.match(/\b(cel wyceny|podstawy formalne|stan prawny|analiza rynku|okre[śs]lenie warto[śs]ci|klauzul)/gi) || []).length >= 3;
}

/** KW ze zrzutów: tekst idzie do pola, które czyta Agent Ksiąg Wieczystych. */
function wsadDodajKsiege(tekst, zeZrzutu){
  const pole = $('#opisKwTekst'); if (!pole) return;
  pole.value = [pole.value.trim(), String(tekst || '').trim()].filter(Boolean).join('\n');
  if (zeZrzutu) studioStan().kwZeZrzutu = true;
  $('#opisKwPole')?.classList.remove('hidden');
  pole.dispatchEvent(new Event('input'));
}

function wsadDodajZdjecie(z, { kategoria, podpis, rodzajDokumentu } = {}){
  if (!z || !z.dataUrl) return false;
  project.photos = project.photos || [];
  if (project.photos.some(p => p.name === z.name && p.size === z.size)) return false;
  const pierwsze = !project.photos.some(p => p.cover);
  project.photos.push({ ...z, category: kategoria || (isPairModule() ? 'Budynek' : 'Lokal'), caption: podpis || z.name, rodzajDokumentu: rodzajDokumentu || 'zdjecia', cover: pierwsze && !rodzajDokumentu });
  return true;
}

/** Podpis zdjęcia z nazwy pliku – zgadujemy tylko tyle, ile mówi nazwa. */
function wsadPodpisZdjecia(nazwa){
  const n = String(nazwa || '').toLowerCase();
  const slownik = [[/elew|front|budyn|dom|zewn/, 'Budynek – widok zewnętrzny'], [/kuch|aneks/, 'Aneks kuchenny'], [/salon|pok[oó]j dzienny/, 'Pokój dzienny'], [/łaz|lazien|wc/, 'Łazienka'], [/sypial/, 'Sypialnia'], [/hol|koryt|przedpok/, 'Komunikacja'], [/gara[zż]/, 'Garaż'], [/ogr[oó]d|dzia[łl]k/, 'Ogród']];
  for (const [re, t] of slownik) if (re.test(n)) return t;
  return 'Dokumentacja fotograficzna';
}

async function wsadPdf(p, kom){
  if (!studioAPI('pdfCzytaj')) return { rodzaj: 'zalacznik', opis: 'PDF (bez odczytu)' };
  kom(`Czytam PDF: ${p.nazwa}…`);
  const r = await window.operatAPI.pdfCzytaj({ sciezka: p.sciezka }).catch(e => ({ ok: false, powod: cleanRemoteError(e) }));
  if (!r?.ok) return { rodzaj: 'blad', opis: r?.powod || 'nie udało się odczytać' };
  const strony = r.strony || [];
  const zObrazami = strony.filter(x => x.obraz);
  const calosc = strony.map(s => s.tekst).join('\n');
  const W0 = window.OperoWiedza, toPodrecznik = !!(W0 && W0.czyPodrecznik(strony));
  // 3.5: każdy PDF poza podręcznikiem (skan albo tekst) czyta Claude w całości — księgi, wypisy, decyzje, umowy.
  if (!toPodrecznik && strony.length <= 100 && studioAPI('chmuraWizja') && window.OperoWizja){
    const w = await wsadWizjaDokument(p, zObrazami, kom);
    if (w) return w;
  }
  const W = window.OperoWiedza;
  if (W && W.czyPodrecznik(strony)){
    await window.operatAPI.podrecznikDodaj({ nazwa: p.nazwa.replace(/\.pdf$/i, ''), strony, zrodlo: r.zOcr ? 'ocr' : 'tekst' });
    return { rodzaj: 'podrecznik', opis: `${strony.length} stron${r.zOcr ? `, w tym ${r.zOcr} odczytanych ze skanu` : ''} – agenci korzystają z niego jako wzoru` };
  }
  if (wsadCzyKsiega(calosc)){ wsadDodajKsiege(calosc, false); return { rodzaj: 'kw', opis: `wydruk księgi, ${strony.length} str.` }; }
  if (wsadCzyOperat(calosc) && window.OperoPamiec){
    await pamiecDodajTeksty([{ nazwa: p.nazwa, ok: true, tekst: calosc }]);
    return { rodzaj: 'wzor', opis: `operat jako wzór stylu (${strony.length} str.)` };
  }
  project.files = project.files || [];
  project.files.push({ id: newId(), name: p.nazwa, originalPath: p.sciezka, extension: 'pdf', mime: 'application/pdf', size: p.rozmiar, description: 'Dokument źródłowy', includeInPDF: false, tekst: calosc.slice(0, 20000) });
  return { rodzaj: 'zalacznik', opis: `dokument PDF, ${strony.length} str.` };
}

/** Wynik rozpoznania z procesu głównego → operat. */
async function wsadPrzyjmij(pliki){
  const O = window.OperoOcr;
  const kom = t => { const e = $('#wsadStan'); if (e) e.textContent = t; if (t && wsadProcesId) window.OperoProces?.krok(wsadProcesId, t); };
  const kw = [], obrazy = [];
  let zdjec = 0;
  for (const p of (pliki || [])){
    try {
      if (!p.ok){ wsadDopisz('blad', p.nazwa, p.powod); continue; }
      if (p.rodzaj === 'obraz'){ obrazy.push(p); continue; }
      if (p.rodzaj === 'kw'){ kw.push({ nazwa: p.nazwa, ok: true, ...p.ocr }); if (p.zdjecie) wsadDodajZdjecie(p.zdjecie, { kategoria: 'Dokumenty', podpis: `Zrzut księgi wieczystej — ${p.nazwa}`, rodzajDokumentu: 'kw' }); wsadDopisz('kw', p.nazwa, 'zrzut ekranu – odczyt pisma'); continue; }
      if (p.rodzaj === 'rzut'){
        wsadDodajZdjecie(p.zdjecie, { kategoria: 'Dokumenty', podpis: `Rzut lokalu — ${p.nazwa}`, rodzajDokumentu: 'rzut' });
        project.attachments = Array.isArray(project.attachments) ? project.attachments : [];
        if (!project.attachments.some(a => /rzut/i.test(a))) project.attachments.push('Rzut lokalu');
        studioStan().rzutTekst = [studioStan().rzutTekst || '', p.tekst || ''].join('\n').slice(0, 8000);
        wsadDopisz('rzut', p.nazwa, 'rzut – dołączony do dokumentacji'); continue;
      }
      if (p.rodzaj === 'zdjecie'){ if (wsadDodajZdjecie(p.zdjecie, { podpis: wsadPodpisZdjecia(p.nazwa) })) zdjec++; wsadDopisz('zdjecie', p.nazwa, 'zdjęcie'); continue; }
      if (p.rodzaj === 'dokument-obraz'){
        if (wsadCzyKsiega(p.tekst)){ wsadDodajKsiege(p.tekst, true); wsadDopisz('kw', p.nazwa, 'obraz dokumentu – księga'); }
        else { wsadDodajZdjecie(p.zdjecie, { kategoria: 'Dokumenty', podpis: p.nazwa, rodzajDokumentu: 'dokument' }); wsadDopisz('zalacznik', p.nazwa, 'obraz dokumentu'); }
        continue;
      }
      if (p.rodzaj === 'pdf'){ const w = await wsadPdf(p, kom); wsadDopisz(w.rodzaj, p.nazwa, w.opis); continue; }
      if (p.rodzaj === 'word'){
        if (wsadCzyOperat(p.tekst)){ await pamiecDodajTeksty([{ nazwa: p.nazwa, ok: true, tekst: p.tekst }]); wsadDopisz('wzor', p.nazwa, 'operat Word jako wzór stylu'); }
        else if (wsadCzyKsiega(p.tekst)){ wsadDodajKsiege(p.tekst, false); wsadDopisz('kw', p.nazwa, 'księga z dokumentu Word'); }
        else { project.files.push({ id: newId(), name: p.nazwa, originalPath: p.sciezka, extension: 'docx', size: p.rozmiar, description: 'Dokument źródłowy', includeInPDF: false, tekst: String(p.tekst || '').slice(0, 20000) }); wsadDopisz('zalacznik', p.nazwa, 'dokument Word'); }
        continue;
      }
      if (p.rodzaj === 'arkusz'){
        if (!studioAPI('bazaDodaj')){ wsadDopisz('zalacznik', p.nazwa, 'arkusz'); continue; }
        let dodane = 0, pominiete = 0;
        for (const a of (p.arkusze || [])){ const r = await window.operatAPI.bazaDodaj({ wiersze: a.wiersze, plik: p.nazwa }).catch(() => null); if (r){ dodane += r.dodane || 0; pominiete += r.pominiete || 0; } }
        wsadDopisz(dodane ? 'rcn' : 'blad', p.nazwa, dodane ? `${dodane} transakcji do Bazy rynku${pominiete ? ` (pominięto ${pominiete})` : ''}` : 'w arkuszu nie rozpoznałem transakcji z rejestru cen');
        continue;
      }
      if (p.rodzaj === 'tekst'){
        if (wsadCzyKsiega(p.tekst)){ wsadDodajKsiege(p.tekst, false); wsadDopisz('kw', p.nazwa, 'treść księgi (tekst)'); }
        else { const t = $('#opisTekst'); if (t){ t.value = [t.value.trim(), String(p.tekst).trim()].filter(Boolean).join('\n'); t.dispatchEvent(new Event('input')); } wsadDopisz('opis', p.nazwa, 'dopisany do opisu zlecenia'); }
        continue;
      }
      project.files = project.files || [];
      project.files.push({ id: newId(), name: p.nazwa, originalPath: p.sciezka, size: p.rozmiar, description: 'Załącznik', includeInPDF: false });
      wsadDopisz('zalacznik', p.nazwa, 'załącznik');
    } catch (e){ console.error(e); wsadDopisz('blad', p.nazwa, cleanRemoteError(e)); }
  }
  if (kw.length && O){ wsadDodajKsiege(O.zrzutyNaTekst(kw), true); }
  if (obrazy.length) zdjec += await wsadWizjaObrazy(obrazy, kom);
  changed({ fullDynamic: true }); renderPhotos(); renderFiles();
  studioPodpis = ''; studioRysuj(); wsadRysuj();
  const ile = (pliki || []).length;
  kom(ile ? `Wczytano ${ile} ${ile === 1 ? 'plik' : 'plików'}${zdjec ? `, w tym ${zdjec} zdjęć` : ''}. Możesz uruchomić zespół.` : '');
  if (typeof podrecznikOdswiez === 'function') await podrecznikOdswiez();
  wsadRysuj();
}

/* 3.4: Claude ogląda obrazy — rozpoznaje rodzaj, przepisuje księgę, wybiera okładkę. */
async function wsadWizjaObrazy(lista, kom){
  const V = window.OperoWizja, zabud = typeof isPairModule === 'function' && isPairModule();
  // 3.5: partie po 10 obrazów idą do Claude równolegle (po 3 naraz) — 40 zdjęć ≈ czas jednej partii.
  const partie = [];
  for (let i = 0; i < lista.length; i += 10) partie.push({ od: i, lista: lista.slice(i, i + 10) });
  let gotowe = 0;
  kom(`Claude ogląda ${lista.length} ${lista.length === 1 ? 'obraz' : 'obrazów'}…`);
  const jedna = async (pt) => {
    const r = await window.operatAPI.chmuraWizja({ obrazy: pt.lista.map(p => p.zdjecie?.dataUrl || p.sciezka), system: V.SYSTEM, polecenie: V.polecenieKlasyfikacji(pt.lista.map(p => p.nazwa)), krawedz: 1000, maks: 3000, tryb: 'szybki' }).catch(e => ({ ok: false, powod: cleanRemoteError(e) }));
    gotowe += pt.lista.length; kom(`Claude obejrzał ${gotowe} z ${lista.length} obrazów…`);
    if (window.OperoProces) window.OperoProces.postep(gotowe / lista.length * 0.8);
    if (!r?.ok) wsadDopisz('blad', `obrazy ${pt.od + 1}–${pt.od + pt.lista.length}`, `Claude nie obejrzał obrazów: ${r?.powod || 'błąd'} — dodałem je jako zdjęcia`);
    return V.klasyfikacja(r?.ok ? r.text : '', pt.lista.length).map(k => (r?.ok ? k : { ...k, rodzaj: 'inne', zModelu: false }));
  };
  const wyniki = new Array(partie.length);
  for (let i = 0; i < partie.length; i += 3) {
    const kawalek = partie.slice(i, i + 3);
    (await Promise.all(kawalek.map(jedna))).forEach((w, j) => { wyniki[i + j] = w; });
  }
  const klasy = [].concat(...wyniki);
  // Księga: wszystkie strony razem, w pełnej rozdzielczości.
  const kwy = lista.filter((_, i) => klasy[i]?.rodzaj === 'kw');
  if (kwy.length){
    kom(`Claude przepisuje księgę wieczystą (${kwy.length} ${kwy.length === 1 ? 'obraz' : 'obrazy'})…`);
    const r = await window.operatAPI.chmuraWizja({ obrazy: kwy.slice(0, 12).map(p => p.sciezka || p.zdjecie?.dataUrl), system: V.SYSTEM, polecenie: V.polecenieKsiegi(), krawedz: 1568, maks: 8000 }).catch(e => ({ ok: false, powod: cleanRemoteError(e) }));
    const k = r?.ok ? V.ksiega(r.text) : { ok: false };
    if (k.ok){
      if (k.tekst) wsadDodajKsiege(k.tekst, true);
      studioStan().kwZWizji = k.pola;
      kwy.forEach(p => wsadDopisz('kw', p.nazwa, `księga przepisana przez Claude${k.pola.numerKsiegi ? ` (${k.pola.numerKsiegi})` : ''}`));
    } else kwy.forEach(p => wsadDopisz('blad', p.nazwa, `księga nieodczytana: ${r?.powod || 'model nie zwrócił treści'}`));
  }
  let zdjec = 0;
  const dodane = [];
  lista.forEach((p, i) => {
    const k = klasy[i] || { rodzaj: 'inne' };
    if (!p.zdjecie) return;
    if (k.rodzaj === 'kw'){ wsadDodajZdjecie(p.zdjecie, { kategoria: 'Dokumenty', podpis: `Księga wieczysta — ${p.nazwa}`, rodzajDokumentu: 'kw' }); return; }
    if (k.rodzaj === 'rzut'){
      wsadDodajZdjecie(p.zdjecie, { kategoria: 'Dokumenty', podpis: k.podpis || `Rzut — ${p.nazwa}`, rodzajDokumentu: 'rzut' });
      project.attachments = Array.isArray(project.attachments) ? project.attachments : [];
      if (!project.attachments.some(a => /rzut/i.test(a))) project.attachments.push('Rzut lokalu');
      wsadDopisz('rzut', p.nazwa, 'rzut — rozpoznany przez Claude'); return;
    }
    if (k.rodzaj === 'mapa' || k.rodzaj === 'dokument'){
      wsadDodajZdjecie(p.zdjecie, { kategoria: k.rodzaj === 'mapa' ? 'Załącznik' : 'Dokumenty', podpis: k.podpis || p.nazwa, rodzajDokumentu: k.rodzaj === 'mapa' ? 'mapa' : 'dokument' });
      wsadDopisz('zalacznik', p.nazwa, k.rodzaj === 'mapa' ? 'mapa' : 'dokument'); return;
    }
    const kategoria = k.rodzaj === 'inne' ? (zabud ? 'Budynek' : 'Lokal') : V.kategoria(k.rodzaj, zabud);
    if (wsadDodajZdjecie(p.zdjecie, { kategoria, podpis: k.podpis || wsadPodpisZdjecia(p.nazwa) })){
      zdjec++; dodane.push({ p, k, foto: project.photos[project.photos.length - 1] });
      if (k.uwagi) studioStan().uwagiZeZdjec = [...(studioStan().uwagiZeZdjec || []), `${k.podpis || p.nazwa}: ${k.uwagi}`].slice(-40);
    }
    wsadDopisz('zdjecie', p.nazwa, k.zModelu ? `${k.rodzaj === 'elewacja' ? 'elewacja' : k.rodzaj === 'otoczenie' ? 'otoczenie' : k.rodzaj === 'wnetrze' ? `wnętrze${k.pomieszczenie ? ' — ' + k.pomieszczenie : ''}` : 'zdjęcie'}` : 'zdjęcie');
  });
  // Okładka: najlepsza elewacja wskazana przez Claude.
  const nr = V.okladka(dodane.map(d => d.k));
  if (nr >= 0){
    (project.photos || []).forEach(f => { f.cover = false; });
    dodane[nr].foto.cover = true;
    wsadDopisz('zdjecie', dodane[nr].p.nazwa, 'wybrane na okładkę operatu (elewacja)');
  }
  return zdjec;
}

/** Krótki skan PDF (księga, wypis, akt) — Claude rozpoznaje i przepisuje. */
async function wsadWizjaDokument(p, strony, kom){
  const V = window.OperoWizja;
  // 3.5: cały PDF trafia do Claude natywnie (tekst + obrazy stron, do 100 stron) — bez rasteryzacji.
  const natywnie = !!p.sciezka && (Number(p.rozmiar) || 0) <= 30 * 1024 * 1024;
  const zrodlo = natywnie ? { dokumenty: [{ sciezka: p.sciezka }] } : { obrazy: strony.slice(0, 12).map(s => s.obraz), krawedz: 1568 };
  kom(`Claude czyta „${p.nazwa}”${strony.length ? ` (${strony.length} str.)` : ''}…`);
  const r = await window.operatAPI.chmuraWizja({ ...zrodlo, system: V.SYSTEM, polecenie: V.polecenieDokumentu(p.nazwa), maks: 12000 }).catch(e => ({ ok: false, powod: cleanRemoteError(e) }));
  if (!r?.ok) return null;
  const j = V.json(r.text) || {};
  const tekst = String(j.tekst || '').trim(), rodzaj = String(j.rodzaj || '');
  if (rodzaj === 'kw' || wsadCzyKsiega(tekst)){
    kom(`Claude przepisuje księgę z „${p.nazwa}”…`);
    const k = await window.operatAPI.chmuraWizja({ ...zrodlo, system: V.SYSTEM, polecenie: V.polecenieKsiegi(), maks: 16000 }).catch(() => null);
    const kk = k?.ok ? V.ksiega(k.text) : { ok: false };
    wsadDodajKsiege(kk.ok && kk.tekst ? kk.tekst : tekst, true);
    if (kk.ok) studioStan().kwZWizji = kk.pola;
    return { rodzaj: 'kw', opis: `księga (skan PDF) przepisana przez Claude${kk.pola?.numerKsiegi ? ` — ${kk.pola.numerKsiegi}` : ''}` };
  }
  if (rodzaj === 'operat' && window.OperoPamiec){ await pamiecDodajTeksty([{ nazwa: p.nazwa, ok: true, tekst }]); return { rodzaj: 'wzor', opis: 'operat (skan) jako wzór stylu' }; }
  project.files = project.files || [];
  project.files.push({ id: newId(), name: p.nazwa, originalPath: p.sciezka, extension: 'pdf', mime: 'application/pdf', size: p.rozmiar, description: j.tytul || 'Dokument źródłowy', includeInPDF: false, tekst: tekst.slice(0, 30000), streszczenie: String(j.streszczenie || '').slice(0, 600), rodzajDokumentu: rodzaj });
  const wpisane = V.faktyDoProjektu ? V.faktyDoProjektu(project, j.fakty, p.nazwa) : [];
  if (wpisane.length) return { rodzaj: 'zalacznik', opis: `${j.tytul || 'dokument'} — przeczytany przez Claude; wpisane: ${wpisane.join(', ')}` };
  if (/wypis_mpzp/.test(rodzaj) && tekst){ project.planning = project.planning || {}; if (!String(project.planning.description || '').trim()) project.planning.description = String(j.streszczenie || '').slice(0, 1500); }
  return { rodzaj: 'zalacznik', opis: `${j.tytul || 'dokument'} — przeczytany przez Claude` };
}

let wsadProcesId = null;
function wsadProcesStart(ile){
  wsadProcesId = window.OperoProces?.start('Czytam Twoje dokumenty', { ikona: 'dok', opis: ile ? `${ile} ${ile === 1 ? 'plik' : 'plików'} — rozpoznaję formaty` : 'otwieram pliki…' }) || null;
  if (!wsadProcesStart.sluch && window.operatAPI?.onWsadPostep){
    wsadProcesStart.sluch = window.operatAPI.onWsadPostep(d => { if (!wsadProcesId || !d) return; if (d.krok && d.krok !== 'gotowe') window.OperoProces?.krok(wsadProcesId, d.krok); if (d.razem) window.OperoProces?.postep(wsadProcesId, d.zrobione / d.razem * 0.4); });
  }
}
function wsadProcesKoniec(blad){
  if (!wsadProcesId) return;
  const ile = (project.photos || []).length, pl = (project.files || []).length;
  window.OperoProces?.koniec(wsadProcesId, blad ? `Nie udało się: ${blad}` : `Gotowe — w operacie: ${ile} zdjęć, ${pl} dokumentów.`, !blad);
  wsadProcesId = null;
}
async function wsadZSciezek(sciezki){
  if (wsadTrwa || !sciezki.length || !studioAPI('wsadSciezki')) return;
  if (typeof studioZgodaMozg === 'function') await studioZgodaMozg();
  wsadTrwa = true; $('#wsadPole')?.classList.add('pracuje'); wsadProcesStart(sciezki.length);
  let blad = '';
  try { const r = await window.operatAPI.wsadSciezki(sciezki); await wsadPrzyjmij(r?.pliki || []); }
  catch (e){ blad = cleanRemoteError(e); const k = $('#wsadStan'); if (k) k.textContent = blad; }
  finally { wsadTrwa = false; $('#wsadPole')?.classList.remove('pracuje'); wsadProcesKoniec(blad); }
}

async function wsadWybierz(){
  if (wsadTrwa || !studioAPI('wsadWybierz')) return;
  if (typeof studioZgodaMozg === 'function') await studioZgodaMozg();
  wsadTrwa = true; $('#wsadPole')?.classList.add('pracuje');
  let blad = '';
  wsadProcesStart(0);
  try { const r = await window.operatAPI.wsadWybierz(); if (r?.canceled){ window.OperoProces?.koniec(wsadProcesId, 'Nic nie wybrano.'); wsadProcesId = null; } else { window.OperoProces?.krok(wsadProcesId, `Wczytano ${(r.pliki || []).length} plików — analizuję treść`); await wsadPrzyjmij(r.pliki || []); } }
  catch (e){ blad = cleanRemoteError(e); const k = $('#wsadStan'); if (k) k.textContent = blad; }
  finally { wsadTrwa = false; $('#wsadPole')?.classList.remove('pracuje'); wsadProcesKoniec(blad); }
}

function wsadRysuj(){
  const el = $('#wsadLista'); if (!el) return;
  const poz = wsadStan().pozycje;
  const grupy = {};
  for (const p of poz) (grupy[p.rodzaj] = grupy[p.rodzaj] || []).push(p);
  const kolejnosc = ['kw', 'rzut', 'zdjecie', 'podrecznik', 'wzor', 'rcn', 'opis', 'zalacznik', 'blad'];
  el.innerHTML = kolejnosc.filter(k => grupy[k]).map(k => {
    const l = grupy[k];
    const tytul = l.slice(0, 6).map(p => `${p.nazwa}${p.opis ? ` — ${p.opis}` : ''}`).join('\n') + (l.length > 6 ? `\n… i ${l.length - 6} więcej` : '');
    const opis = k === 'podrecznik' ? (typeof studioWiedzaStan !== 'undefined' && studioWiedzaStan.stron ? `${studioWiedzaStan.stron} stron w ${studioWiedzaStan.ile} ${studioWiedzaStan.ile === 1 ? 'pliku' : 'plikach'} – wzór dla agentów` : l[l.length - 1].opis) : (k === 'rcn' || k === 'blad') ? l[l.length - 1].opis : '';
    return `<span class="wsad-grupa" data-rodzaj="${k}" title="${escapeHTML(tytul)}"><i>${WSAD_ZNAKI[k]}</i><b>${WSAD_NAZWY[k]}</b><em>${l.length}</em>${opis ? `<small>${escapeHTML(opis).slice(0, 90)}</small>` : ''}</span>`;
  }).join('');
  el.classList.toggle('hidden', !poz.length);
}

function hookWsad(){
  const pole = $('#wsadPole'); if (!pole) return;
  const zone = $('#studio') || pole;
  let licznik = 0;
  zone.addEventListener('dragenter', e => { if (!e.dataTransfer?.types?.includes('Files')) return; e.preventDefault(); licznik++; pole.classList.add('nad'); });
  zone.addEventListener('dragleave', () => { licznik = Math.max(0, licznik - 1); if (!licznik) pole.classList.remove('nad'); });
  zone.addEventListener('dragover', e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); });
  zone.addEventListener('drop', e => {
    if (!e.dataTransfer?.files?.length) return;
    e.preventDefault(); licznik = 0; pole.classList.remove('nad');
    const sciezki = [...e.dataTransfer.files].map(f => window.operatAPI?.sciezkaPliku ? window.operatAPI.sciezkaPliku(f) : '').filter(Boolean);
    if (sciezki.length) wsadZSciezek(sciezki);
    else { const k = $('#wsadStan'); if (k) k.textContent = 'Nie udało się odczytać upuszczonych plików — użyj przycisku „Wybierz pliki".'; }
  });
  $('#wsadWybierz')?.addEventListener('click', wsadWybierz);
  if (studioAPI('onWsadPostep')) window.operatAPI.onWsadPostep(d => { const k = $('#wsadStan'); if (k && wsadTrwa) k.textContent = d.razem ? `${d.krok || ''} (${Math.min(d.zrobione + 1, d.razem)} z ${d.razem})` : (d.krok || ''); });
  wsadRysuj();
}
document.addEventListener('DOMContentLoaded', hookWsad);

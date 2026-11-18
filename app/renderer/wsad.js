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
  const strony = r.strony || [], calosc = strony.map(s => s.tekst).join('\n');
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
  const kom = t => { const e = $('#wsadStan'); if (e) e.textContent = t; };
  const kw = [];
  let zdjec = 0;
  for (const p of (pliki || [])){
    try {
      if (!p.ok){ wsadDopisz('blad', p.nazwa, p.powod); continue; }
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
  changed({ fullDynamic: true }); renderPhotos(); renderFiles();
  studioPodpis = ''; studioRysuj(); wsadRysuj();
  const ile = (pliki || []).length;
  kom(ile ? `Wczytano ${ile} ${ile === 1 ? 'plik' : 'plików'}${zdjec ? `, w tym ${zdjec} zdjęć` : ''}. Możesz uruchomić zespół.` : '');
  if (typeof podrecznikOdswiez === 'function') await podrecznikOdswiez();
  wsadRysuj();
}

async function wsadZSciezek(sciezki){
  if (wsadTrwa || !sciezki.length || !studioAPI('wsadSciezki')) return;
  wsadTrwa = true; $('#wsadPole')?.classList.add('pracuje');
  try { const r = await window.operatAPI.wsadSciezki(sciezki); await wsadPrzyjmij(r?.pliki || []); }
  catch (e){ const k = $('#wsadStan'); if (k) k.textContent = cleanRemoteError(e); }
  finally { wsadTrwa = false; $('#wsadPole')?.classList.remove('pracuje'); }
}

async function wsadWybierz(){
  if (wsadTrwa || !studioAPI('wsadWybierz')) return;
  wsadTrwa = true; $('#wsadPole')?.classList.add('pracuje');
  try { const r = await window.operatAPI.wsadWybierz(); if (!r?.canceled) await wsadPrzyjmij(r.pliki || []); }
  catch (e){ const k = $('#wsadStan'); if (k) k.textContent = cleanRemoteError(e); }
  finally { wsadTrwa = false; $('#wsadPole')?.classList.remove('pracuje'); }
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

'use strict';
/** OPERO 3.4 — w programie: Claude rozpoznaje wrzucone obrazy, przepisuje księgę, wybiera okładkę (elewację), czyta skan PDF. */
const { Przegladarka } = require('./przegladarka');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 900) : '')); } };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO 3.4 — wizja w programie (widok)\n');
  await p.pauza(1500);
  await p.ocen(`document.querySelector('#tutorialSkip')?.click(); document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=()=>true; uiPrefs.motion='off'; switchTab('dashboard'); return 1;`);
  const r = await p.ocen(`
    const zd = (n, i) => ({ nazwa: n, ok: true, rodzaj: 'obraz', sciezka: 'C:/x/' + n, zdjecie: { id: 'z' + i, name: n, size: 100 + i, dataUrl: '${PNG}' } });
    window.__wizjaOdp = (z) => {
      if (/Dla KAŻDEGO obrazu/.test(z.polecenie)) return { ok: true, text: JSON.stringify({ obrazy: [
        { nr: 1, rodzaj: 'kw', okladka: 0 }, { nr: 2, rodzaj: 'wnetrze', pomieszczenie: 'salon', podpis: 'Salon z aneksem', okladka: 0 },
        { nr: 3, rodzaj: 'elewacja', podpis: 'Budynek — elewacja frontowa', okladka: 9, uwagi: 'nowy budynek, ocieplony' }, { nr: 4, rodzaj: 'rzut', podpis: 'Rzut parteru' },
        { nr: 5, rodzaj: 'otoczenie', podpis: 'Ulica', okladka: 5 } ] }) };
      if (/elektronicznej księgi wieczystej/.test(z.polecenie)) return { ok: true, text: JSON.stringify({ tekst: 'TREŚĆ KSIĘGI WIECZYSTEJ NR GD1G/00012345/6\\nDZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI\\nDZIAŁ III - PRAWA, ROSZCZENIA I OGRANICZENIA\\nBrak wpisów', pola: { numerKsiegi: 'GD1G/00012345/6', powierzchniaUzytkowa: '113,73', udzial: '11373/22745' } }) };
      return { ok: false, powod: 'nieznane polecenie' };
    };
    window.__chmura = { wlaczony: true, zgoda: true, dostawca: 'opero' }; studioMozg = null;
    project.photos = []; document.querySelector('#opisKwTekst').value = '';
    await wsadPrzyjmij([zd('kw.png', 1), zd('IMG_2.jpg', 2), zd('IMG_3.jpg', 3), zd('rzut.png', 4), zd('IMG_5.jpg', 5)]);
    const ph = project.photos.map(x => ({ c: x.category, cap: x.caption, r: x.rodzajDokumentu || '', cover: !!x.cover }));
    const z = window.__wizjaZapytania || [];
    const html = zbudujRaportSurowy();
    return { ph, zap: z.map(q => ({ ile: q.obrazy.length, k: q.krawedz })), kw: document.querySelector('#opisKwTekst').value, wizji: studioStan().kwZWizji, uwagi: studioStan().uwagiZeZdjec || [],
      pierwszy: projektDoWydruku().photos[0]?.caption, lista: document.querySelector('#wsadLista').textContent, opisy: wsadStan().pozycje.map(x => x.opis).join(' | ') };`);
  T('jedno zapytanie o rodzaj wszystkich obrazów i jedno o księgę (pełna rozdzielczość)', r.zap.length === 2 && r.zap[0].ile === 5 && r.zap[0].k === 1000 && r.zap[1].ile === 1 && r.zap[1].k === 1568, r.zap);
  T('księga: zrzut w dokumentach, tekst trafia do Agenta Ksiąg, pola z wizji zapamiętane', r.ph.some(x => x.r === 'kw' && x.c === 'Dokumenty') && /DZIAŁ I-O/.test(r.kw) && r.wizji?.numerKsiegi === 'GD1G/00012345/6', r);
  T('zdjęcia: elewacja → Budynek, wnętrze → Lokal z podpisem od Claude, rzut → Dokumenty', r.ph.some(x => x.c === 'Budynek' && x.cap === 'Budynek — elewacja frontowa') && r.ph.some(x => x.c === 'Lokal' && x.cap === 'Salon z aneksem') && r.ph.some(x => x.r === 'rzut' && x.cap === 'Rzut parteru'), r.ph);
  T('okładka: elewacja domu (nie zrzut księgi, nie wnętrze)', r.ph.filter(x => x.cover).length === 1 && r.ph.find(x => x.cover).cap === 'Budynek — elewacja frontowa', r.ph);
  T('wydruk: pierwsze zdjęcie (okładka raportu) to elewacja', r.pierwszy === 'Budynek — elewacja frontowa', r.pierwszy);
  T('uwagi ze zdjęć zapamiętane dla agentów', r.uwagi.some(u => /ocieplony/.test(u)), r.uwagi);
  T('lista wczytanych: księga 1, rzut 1, zdjęcia 3 — z opisem, co rozpoznał Claude', /Księga wieczysta1/.test(r.lista) && /Rzut1/.test(r.lista) && /Zdjęcia3/.test(r.lista) && /okładkę/.test(r.opisy) && /wnętrze — salon/.test(r.opisy) && /przepisana przez Claude/.test(r.opisy), [r.lista, r.opisy]);
  // Skan PDF: Claude rozpoznaje wypis z planu
  const d = await p.ocen(`
    window.__wizjaOdp = (z) => /kolejne strony dokumentu/.test(z.polecenie) ? { ok: true, text: JSON.stringify({ rodzaj: 'wypis_mpzp', tytul: 'Wypis z planu miejscowego', tekst: 'Teren 12MN — zabudowa mieszkaniowa jednorodzinna', streszczenie: 'Działka w terenie 12MN.' }) } : { ok: false };
    window.__pdfOdp = { 'C:/x/wypis.pdf': { ok: true, stron: 1, strony: [{ nr: 1, tekst: '', zrodlo: 'obraz', obraz: '${PNG}' }] } };
    project.files = []; project.planning.description = '';
    const w = await wsadPdf({ nazwa: 'wypis.pdf', sciezka: 'C:/x/wypis.pdf', rozmiar: 10 }, () => {});
    return { w, plik: project.files[0], plan: project.planning.description };`);
  T('skan PDF: Claude rozpoznał wypis z planu, tekst w dokumentach, streszczenie w opisie planistycznym', d.w?.rodzaj === 'zalacznik' && /Wypis z planu/.test(d.plik?.description) && /12MN/.test(d.plik?.tekst) && /12MN/.test(d.plan), d);
  // Bez zgody — agenci pytają o zgodę na mózg AI
  const g = await p.ocen(`window.__chmura = { wlaczony: true, zgoda: false, dostawca: 'opero' }; studioMozg = null; window.confirm = () => false;
    const r = await agenciUruchom(); return { r, kom: document.querySelector('#agenciKomunikat').textContent };`);
  T('bez zgody na mózg AI agenci nie startują i mówią dlaczego', g.r === null && /zgody na mózg AI/.test(g.kom), g);
  await p.zamknij();
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

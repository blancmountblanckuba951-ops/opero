'use strict';
/** OPERO 3.1 — Studio: zlecenie jako jedyne dane ręczne, autor z Ustawień, Agent Geoportalu, rundy Agenta Rynku. */
const fs = require('fs');
const { Przegladarka } = require('./przegladarka');
const RYNEK = fs.readFileSync(__dirname + '/dane/studio-rynek.txt', 'utf8');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO 3.1/3.2 — Studio: zlecenie, geoportal, rynek, nadzór (widok)\n');
  await p.pauza(1800);
  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0, await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.__pytania=[]; window.confirm=(t)=>{window.__pytania.push(String(t));return true;}; document.body.classList.add('motion-reduced'); uiPrefs.mode='expert'; uiPrefs.motion='off';
    ${RYNEK}
    switchTab('dashboard'); return 1;`);
  const f = await p.ocen(`return {pola:['#zlecKto','#zlecNr','#zlecData','#zlecCel'].every(id=>!!document.querySelector(id)), naglowek:document.querySelector('.studio-krok h3').textContent,
    autor:document.querySelector('#zlecAutor').textContent, okno:document.querySelector('#geoOkno')?.checked, agentow:document.querySelectorAll('#agenciLista .agent').length,
    geo:[...document.querySelectorAll('#agenciLista .agent')].map(a=>a.textContent).some(t=>/Geoportal/.test(t))};`);
  T('Studio: pierwszy krok to „Zlecenie" z czterema polami', f.pola && f.naglowek === 'Zlecenie', f);
  T('Studio: autor podpisany z Ustawień', /Jan Kowalski/.test(f.autor) && /1234/.test(f.autor), f.autor);
  T('Studio: Agent Geoportalu w zespole, okno geoportalu włączone', f.geo && f.agentow === 16 && f.okno === true, f);

  const w = await p.ocen(`
    const v=(id,x)=>{const e=document.querySelector(id); e.value=x; e.dispatchEvent(new Event('input'));};
    v('#zlecKto','Bank Przykładowy S.A.'); v('#zlecNr','ZL/7/2026'); v('#zlecData','2026-11-12'); v('#zlecCel','zabezpieczenie wierzytelności kredytowej');
    document.querySelector('#opisTekst').value='Mieszkanie 3-pokojowe 68 m2 na 2 piętrze, ul. Siedleckiego 9/4, Gdańsk, dzielnica Osowa.';
    project.author={}; 
    window.__geoOdp={ok:true,kiedy:'2026-11-17T09:00:00Z',rozmiar:400,kadr:[0,0,1,1],obrys:[[[100,100],[300,100],[300,300],[100,300],[100,100]]],
      dzialka:{id:'226101_1.0010.123/4',numer:'123/4',obreb:'Osowa',gmina:'Gdańsk',powiat:'Gdańsk',wojewodztwo:'pomorskie'},
      mapy:[{id:'orto',tytul:'Ortofotomapa',dataUrl:'${PNG}',podpis:'Ortofotomapa — działka nr 123/4. Źródło: mapy.geoportal.gov.pl, pobrano 17.11.2026.'},
            {id:'egib',tytul:'Ewidencja',dataUrl:'${PNG}',przezroczysta:true,podpis:'Ewidencja gruntów i budynków (KIEG) — działka nr 123/4. Źródło: integracja.gugik.gov.pl, pobrano 17.11.2026.'},
            {id:'mpzp',tytul:'Plan',dataUrl:'${PNG}',przezroczysta:true,podpis:'Plan miejscowy (KIMPZP) — działka nr 123/4.'}],
      legendy:[{usluga:'mpzp',tytul:'Legenda: Plan miejscowy (KIMPZP) — Przeznaczenie',dataUrl:'${PNG}',tekst:'MN tereny zabudowy mieszkaniowej jednorodzinnej',zrodlo:'x'}],
      info:[{usluga:'egib',tytul:'Opis szczegółowy: Ewidencja',tekst:'Numer działki: 123/4\\nPole pow. w ewidencji [ha]: 0,0612',pola:{'egib.plotArea':'0,0612 ha'},zrodlo:'x'},
            {usluga:'mpzp',tytul:'Opis szczegółowy: Plan miejscowy (KIMPZP)',tekst:'Symbol przeznaczenia: 12MN',pola:{'planning.zoneSymbol':'12MN','planning.designation':'zabudowa mieszkaniowa jednorodzinna'},zrodlo:'x'}],bledy:[]};
    window.__geoOknoOdp={ok:true,dataUrl:'${PNG}',kiedy:'2026-11-17T09:01:00Z',url:'https://mapy.geoportal.gov.pl/imapnext/imap/?identifyParcel=x'};
    const r=await agenciUruchom(); await new Promise(r=>setTimeout(r,600));
    const pr=project.agenci.przebieg;
    const mapy=(project.photos||[]).filter(x=>x.category==='Załącznik');
    return {gotowy:r?.gotowy, stany:Object.fromEntries(Object.entries(pr.agenci).map(([k,v])=>[k,v.stan])),
      klient:project.client, cel:project.valuation.purpose, pf:project.formalBasis, autor:project.author,
      mapy:mapy.map(x=>({c:x.caption, r:x.rodzajDokumentu, cover:!!x.cover})), pliki:(project.files||[]).filter(x=>/geoportal/.test(x.kind||'')).map(x=>x.name),
      egib:project.egib, plan:project.planning, geoZap:window.__geoZapytania, okno:window.__geoOkno,
      zrobGeo:pr.agenci.geoportal.zrobione, brakGeo:pr.agenci.geoportal.braki, zrobRyn:pr.agenci.rynek.zrobione, brakRyn:pr.agenci.rynek.braki, tr:project.market.transactions.length,
      rcn:window.__rcnZapytanie, defRynku:project.market.definicjaRynku||'', narrRynku:project.narratives.market||'',
      pola:{r:document.querySelector('#szukPromien').value,o:document.querySelector('#szukOkres').value,d:document.querySelector('#szukOdchylka').value},
      oglednikZdjecia:(window.__chmuraZdjecia||[]).length};`);
  T('zespół dochodzi do końca', w.gotowy && Object.values(w.stany).every(s => ['gotowe', 'uwaga', 'pominiety'].includes(s)), w.stany);
  T('zlecenie: zleceniodawca, numer, data i cel w operacie', w.klient.name === 'Bank Przykładowy S.A.' && w.klient.contractNo === 'ZL/7/2026' && w.klient.contractDate === '2026-11-12' && w.cel === 'zabezpieczenie wierzytelności kredytowej', [w.klient, w.cel]);
  T('zlecenie: podstawa formalna ułożona bez luk', /na zlecenie: Bank Przykładowy S\.A\. \(zlecenie \/ umowa nr ZL\/7\/2026 z dnia 12\.11\.2026\)/.test(w.pf), w.pf);
  T('autor: z Ustawień (imię, nr uprawnień, e-mail)', w.autor.name === 'Jan Kowalski' && w.autor.licenseNo === '1234' && w.autor.email === 'jan@example.com', w.autor);
  T('geoportal: pytany o działkę z identyfikatorem', (w.geoZap || []).some(q => q.id === '226101_1.0010.123/4'), w.geoZap);
  T('geoportal: mapy (orto, ewidencja, plan), legenda i zrzut okna w załącznikach „Mapy"', w.mapy.length === 5 && w.mapy.some(m => /^Ewidencja.*Podkład: ortofotomapa/.test(m.c)) && w.mapy.some(m => /^Legenda/.test(m.c) && m.r === 'legenda') && w.mapy.some(m => /zrzut ekranu/.test(m.c)) && w.mapy.every(m => !m.cover), w.mapy);
  T('geoportal: okno otwarte na tej działce', w.okno && w.okno.id === '226101_1.0010.123/4', w.okno);
  T('geoportal: opis szczegółowy i odczyt legendy dołączone jako dokumenty', w.pliki.length === 3, w.pliki);
  T('geoportal: dane z opisu wpisane w puste pola (powierzchnia działki, symbol planu)', w.egib.plotArea === '0,0612 ha' && w.plan.zoneSymbol === '12MN', [w.egib.plotArea, w.plan.zoneSymbol]);
  T('geoportal: raport agenta mówi, co dołączył', w.zrobGeo.some(x => /Załączniki z geoportalu: 4/.test(x)) && w.zrobGeo.some(x => /Zrzut ekranu z geoportalu/.test(x)), w.zrobGeo);
  T('rynek: 9 transakcji < 12 — agent przeszedł wszystkie cztery rundy', w.zrobRyn.filter(x => /^Runda \d/.test(x)).length === 4 && w.pola.r === '8000' && w.pola.o === '120' && w.pola.d === '50', [w.zrobRyn, w.pola]);
  T('rynek: każda runda raportuje źródła', w.zrobRyn.filter(x => /^Runda/.test(x)).every(x => /Źródła — /.test(x)), w.zrobRyn);
  T('rynek: rejestr pytany o wszystkie strony wyników (maks)', w.rcn && w.rcn.maks === 6000 && w.rcn.promien >= 8000, w.rcn);
  T('rynek: mówi wprost, że to za mało i co zrobić', w.brakRyn.some(x => /potrzebuje ok\. 12/.test(x) && /starostwie/.test(x)), w.brakRyn);
  T('rynek: definicja rynku z faktycznego zakresu szukania', /8000 m/.test(w.defRynku) && /120 miesięcy/.test(w.defRynku), w.defRynku);

  // Gdy 12+ transakcji jest od razu — jedna runda wystarcza.
  const w2 = await p.ocen(`const ceny=Array.from({length:14},(_, i)=>9500+i*100);
    window.__rcnOdp={ok:true,pominieto:0,komunikat:'ok',zrodlo:'RCN',transakcje:ceny.map((c,i)=>({zrodloWiersz:i+1,adres:'ul. Kolejna '+(i+1)+', Gdańsk',miejscowosc:'Gdańsk',ulica:'Kolejna',data:'2026-0'+(1+i%9)+'-10',powierzchnia:66+(i%5),cena:Math.round(c*(66+(i%5))),jednostkowa:c,pokoje:3,pietro:2,x:470000+i*20,y:720000,prawo:'własność',rodzaj:'sprzedaż',uwagi:[],uwagiZrodla:'',akt:'Rep. A '+(100+i)+'/2026'}))};
    project.market.transactions=[]; ['#szukPromien','#szukOkres','#szukOdchylka'].forEach((id,i)=>document.querySelector(id).value=[1000,24,20][i]);
    const k={krok(){}}; const r=await AGENCI_PRACA.rynek(k); return {r, tr:project.market.transactions.length, pola:document.querySelector('#szukPromien').value};`);
  T('rynek: przy 12+ transakcjach kończy na pierwszej rundzie', w2.r.zrobione.filter(x => /^Runda/.test(x)).length === 1 && w2.tr >= 12 && w2.pola === '1000', w2);

  // ---- 3.2: zespół nadzoru, nawigacja, Wynik
  const n = await p.ocen(`const s=project.agenci; const pr=s.przebieg.agenci;
    switchTab('result'); await new Promise(r=>setTimeout(r,400));
    return {nav:[...document.querySelectorAll('#nav .nav-btn')].map(b=>b.dataset.tab), kor:pr.korektor, kier:pr.kierownik, werdykt:s.werdykt,
      word:!!document.querySelector('#wynikWord'), pdf:!!document.querySelector('#wynikPdf'), ramka:(document.querySelector('#wynikPodglad').srcdoc||'').length,
      werTekst:document.querySelector('#wynikWerdykt').textContent, szczegoly:!!document.querySelector('#tab-result details.wynik-szczegoly #audytKarta'),
      raportGuziki:[...document.querySelectorAll('#agenciRaport [data-studio]')].map(b=>b.dataset.studio)};`);
  T('nawigacja: tylko Nowy operat, Wynik, Express, Baza rynku, Klienci, Historia, Ustawienia', n.nav.join(',') === 'dashboard,result,express,baza,clients,history,settings', n.nav);
  T('Agent Korektor i Kierownik zespołu pracowali', ['gotowe', 'uwaga'].includes(n.kor.stan) && ['gotowe', 'uwaga'].includes(n.kier.stan) && n.kier.zrobione.some(x => /^Narada 1/.test(x)) && n.kier.zrobione.some(x => /^Werdykt/.test(x)), [n.kor, n.kier]);
  T('werdykt zespołu nadzoru zapisany i pokazany w Wyniku', n.werdykt && typeof n.werdykt.zatwierdzony === 'boolean' && n.werTekst === n.werdykt.tekst, [n.werdykt, n.werTekst]);
  T('Wynik: Pobierz Word i PDF oraz cały operat w podglądzie', n.word && n.pdf && n.ramka > 5000, n);
  T('Wynik: audyt i obliczenia schowane w „dla dociekliwych"', n.szczegoly);
  T('raport zespołu: bez „Popraw ręcznie" i „Sprawdź etapy", jest Word i PDF', n.raportGuziki.includes('word') && n.raportGuziki.includes('pdf') && !n.raportGuziki.includes('edycja') && !n.raportGuziki.includes('etapy'), n.raportGuziki);
  const kz = await p.ocen(`const s=studioStan(); s.weryfikacja={uwagi:[{id:'w1',dzial:'tekst',waga:'blad',tytul:'Test',poprawka:{zmiany:[{sciezka:'narratives.extremes',wartosc:'Poprawione przez korektora.'}]}}],podsumowanie:{bledy:1,uwagi:0,doPoprawy:1}};
    const r=await AGENCI_PRACA.korektor({krok(){}}); return {r, txt:project.narratives.extremes, zast:(s.zastosowane||[]).some(z=>z.id==='w1')};`);
  T('Korektor sam wprowadza poprawkę weryfikatora (z możliwością cofnięcia)', kz.txt === 'Poprawione przez korektora.' && kz.zast && kz.r.zrobione.some(x => /Wprowadziłem 1 poprawkę/.test(x)), kz);
  const zb = await p.ocen(`switchTab('baza'); await new Promise(r=>setTimeout(r,300)); return {karta:!!document.querySelector('#zbieraczKarta'), stan:document.querySelector('#zbieraczStan').textContent, wl:document.querySelector('#zbieraczWl').checked};`);
  T('Baza rynku: zbieracz widoczny, włączony, opisuje stan', zb.karta && zb.wl && /W bazie: 0 transakcji/.test(zb.stan), zb);

  const ekw = await p.ocen(`switchTab('dashboard'); document.querySelector('#opisTekst').value='Lokal, KW GD1G/00012345/6, Gdańsk'; document.querySelector('#opisKwTekst').value='';
    document.querySelector('#wsadEkw').click(); await new Promise(r=>setTimeout(r,200));
    window.__ekwCb({tekst:'TREŚĆ KSIĘGI WIECZYSTEJ NR GD1G/00012345/6\\nDZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI\\nLokal mieszkalny', url:'https://przegladarka-ekw.ms.gov.pl/x'});
    window.__ekwCb({tekst:'TREŚĆ KSIĘGI WIECZYSTEJ NR GD1G/00012345/6\\nDZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI\\nLokal mieszkalny', url:'https://przegladarka-ekw.ms.gov.pl/x'});
    window.__ekwCb({tekst:'TREŚĆ KSIĘGI WIECZYSTEJ NR GD1G/00012345/6\\nDZIAŁ III - PRAWA, ROSZCZENIA I OGRANICZENIA\\nBrak wpisów', url:'https://przegladarka-ekw.ms.gov.pl/y'});
    return {zap:window.__ekwOkno, tekst:document.querySelector('#opisKwTekst').value, kom:document.querySelector('#agenciKomunikat').textContent};`);
  T('Księga z EKW: okno z numerem księgi, każdy wyświetlony dział przepisany raz', ekw.zap && ekw.zap.kw === 'GD1G/00012345/6' && (ekw.tekst.match(/DZIAŁ I-O/g) || []).length === 1 && /DZIAŁ III/.test(ekw.tekst) && /dział III/.test(ekw.kom), ekw);
  const red = await p.ocen(`window.__edycjaReczna=false; switchTab('project'); const a=document.querySelector('.tab.active')?.id; switchTab('legal'); const b=document.querySelector('.tab.active')?.id; window.__edycjaReczna=true; switchTab('dashboard');
    return {a,b, reczne:document.querySelector('.studio-reszta').classList.contains('hidden'), nowy:!!document.querySelector('#studioNowyPusty')};`);
  T('tylko agenci: przejście do etapu kończy się w Wyniku, panel pracy ręcznej schowany', red.a === 'tab-result' && red.b === 'tab-result' && red.reczne && red.nowy, red);
  await p.zamknij();
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

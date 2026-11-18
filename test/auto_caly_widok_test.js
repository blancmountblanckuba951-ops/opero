'use strict';
/** OPERO — „Wypełnij cały operat automatycznie": ślad AUTO, banery etapów, przegląd i zatwierdzenie. */
const { Przegladarka } = require('./przegladarka');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — cały operat automatycznie (widok)\n');
  await p.pauza(1800);
  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0, await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.__pytania=[]; window.confirm=(t)=>{window.__pytania.push(String(t));return true;}; document.body.classList.add('motion-reduced'); uiPrefs.mode='expert';
    const ceny=[9800,10000,10100,10200,10300,10400,10500,10600,10800];
    window.__dzialkaOdp={ok:true,punkt:{x:470000,y:720000},punkty:[],dzialki:[{id:'226101_1.0010.123/4',numer:'123/4',obreb:'Osowa',gmina:'Gdańsk',powiat:'Gdańsk',wojewodztwo:'pomorskie'}]};
    window.__rcnOdp={ok:true,pominieto:0,komunikat:'ok',zrodlo:'RCN',transakcje:ceny.map((c,i)=>({zrodloWiersz:i+1,adres:'ul. Siedleckiego '+(i+1)+', Gdańsk',miejscowosc:'Gdańsk',ulica:'Siedleckiego',data:'2026-0'+(1+i%9)+'-15',powierzchnia:66+(i%5),cena:Math.round(c*(66+(i%5))),jednostkowa:c,pokoje:3,pietro:2,x:470000+i*20,y:720000,prawo:'własność',rodzaj:'sprzedaż',uwagi:[],uwagiZrodla:''}))};
    window.__otoOdp={ok:true,bledy:[],punkt:{lat:54.43,lon:18.47,skad:'OpenStreetMap',dokladny:true},otoczenie:{ok:true,ile:2,kategorie:{autobus:{id:'autobus',pole:'transport',jeden:'przystanek autobusowy',ile:1,najblizszy:{nazwa:'Osowa PKP',odl:222}},las:{id:'las',pole:'recreation',jeden:'las',ile:1,najblizszy:{nazwa:'',odl:900}}}},mpzp:{ok:true,jest:true,nazwa:'MPZP Osowa',uchwala:'Uchwała Nr XL/1234/2021',link:'https://bip.gdansk.pl/1',tekst:'x'}};
    window.__bazaKandydaci=[]; window.__perTeksty={}; window.__perBlad='';
    await createProjectFromModule('local_kcm'); await new Promise(r=>setTimeout(r,400)); return 1;`);

  const bezAdresu = await p.ocen(`document.querySelector('#szybkiCalyBtn').click(); await new Promise(r=>setTimeout(r,300));
    return {tekst:document.querySelector('#szybkiCalyWynik').textContent, tab:document.querySelector('.tab.active')?.id};`);
  T('przycisk jest w pierwszym etapie operatu', bezAdresu.tab === 'tab-project');
  T('bez adresu automat nie rusza i mówi, czego potrzebuje', /Najpierw adres/.test(bezAdresu.tekst), bezAdresu.tekst);

  const caly = await p.ocen(`Object.assign(project.property,{city:'Gdańsk',district:'Osowa',street:'Siedleckiego',buildingNo:'9',usableArea:68,rooms:3,floor:'2'});
    project.location.services='Sklep na parterze — z oględzin'; renderAll(); await new Promise(r=>setTimeout(r,300));
    const rap=await szybkiCaly(); await new Promise(r=>setTimeout(r,3200));
    const et=autoEtapy();
    return {rap, tab:document.querySelector('.tab.active')?.id, tr:project.market.transactions.length, wartosc:calc?.valueRounded,
      etapy:Object.fromEntries(Object.entries(et).map(([k,v])=>[k,v.length])), wagi:Math.round((project.market.features||[]).reduce((s,f)=>s+(Number(f.weight)||0),0)*100),
      okno:document.querySelector('#szukOverlay').classList.contains('hidden'), uslugi:project.location.services, autoUslugi:!!project.autoWpisane['location.services'],
      karta:!document.querySelector('#autoPrzegladKarta').classList.contains('hidden'), wiersze:document.querySelectorAll('#autoPrzeglad .auto-etap').length,
      czeka:document.querySelectorAll('#autoPrzeglad .auto-etap[data-stan="czeka"]').length, stan:document.querySelector('#autoPrzegladStan').textContent,
      rcn:window.__rcnZapytanie, raport:document.querySelector('#szybkiCalyWynik').textContent, guzik:document.querySelector('#szybkiCalyBtn').disabled};`);
  T('po zakończeniu program jest w etapie końcowym', caly.tab === 'tab-result', caly.tab);
  T('dane z rejestrów i mapy są wpisane', caly.rap.dane.includes('numer działki') && caly.rap.dane.includes('opis lokalizacji'), caly.rap.dane);
  T('transakcje wstawione bez otwierania okna szukania', caly.tr >= 5 && caly.okno === true && caly.rap.transakcje === caly.tr, [caly.tr, caly.okno]);
  T('rejestr dostaje kod powiatu nieruchomości', caly.rcn && caly.rcn.teryt === '2261', caly.rcn);
  T('przyjęty zestaw cech ma wagi sumujące się do 100%', caly.wagi === 100, caly.wagi);
  T('wartość jest policzona', Number(caly.wartosc) > 500000 && Number(caly.wartosc) < 900000, caly.wartosc);
  T('opisy są napisane', caly.rap.opisy >= 5, caly.rap.opisy);
  T('raport mówi wprost, że oceny cech są „przeciętne" i trzeba je ustawić', caly.rap.uwagi.some(x => /oceny wycenianej nieruchomości ustawiłem na „przeciętna"/.test(x)), caly.rap.uwagi);
  T('pola wpisanego przez człowieka automat nie rusza i nie oznacza', /z oględzin/.test(caly.uslugi) && caly.autoUslugi === false);
  T('przegląd końcowy pokazuje wszystkie etapy', caly.karta && caly.wiersze === 10, caly.wiersze);
  T('etapy z wpisami programu czekają na sprawdzenie', caly.czeka >= 5 && /Do sprawdzenia: \d+ etap/.test(caly.stan), [caly.czeka, caly.stan]);
  T('etapy rynku i cech są na liście', caly.etapy.market >= 1 && caly.etapy.features >= 1 && caly.etapy.egib >= 5, caly.etapy);
  T('po zakończeniu przycisk jest znów czynny', caly.guzik === false && /Gotowe — program wypełnił \d+ pozycji w \d+ etapach/.test(caly.raport), caly.raport.slice(0, 120));

  const etap = await p.ocen(`document.querySelector('[data-auto-idz="egib"]').click(); await new Promise(r=>setTimeout(r,500));
    const b=document.querySelector('#tab-egib > .auto-baner');
    const l=document.querySelector('[data-path="egib.plotNo"]').closest('label');
    const lu=document.querySelector('[data-path="location.services"]').closest('label');
    return {tab:document.querySelector('.tab.active')?.id, krok:wizardIndex, baner:b?.textContent||'', stan:b?.dataset.stan, auto:l.classList.contains('auto-wpisane'),
      znaczek:getComputedStyle(l.querySelector('.pole-naglowek-tresc')||l,'::after').content, reczne:lu.classList.contains('auto-wpisane'),
      banerowNaStronie:document.querySelectorAll('#tab-egib .auto-baner').length};`);
  T('„Sprawdź etap" prowadzi do etapu', etap.tab === 'tab-egib' && etap.krok === 2, etap);
  T('etap ma baner z listą tego, co wpisał program', /Program wypełnił ten etap/.test(etap.baner) && /Nr działki/.test(etap.baner) && etap.stan === 'czeka' && etap.banerowNaStronie === 1, etap.baner);
  T('pole programu ma znacznik AUTO, pole człowieka nie', etap.auto === true && /AUTO/.test(etap.znaczek) && etap.reczne === false, [etap.auto, etap.znaczek, etap.reczne]);

  const edycja = await p.ocen(`const pole=document.querySelector('[data-path="egib.plotNo"]'); pole.value='999/9';
    pole.dispatchEvent(new Event('input',{bubbles:true})); pole.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,700));
    return {auto:pole.closest('label').classList.contains('auto-wpisane'), wSladzie:!!project.autoWpisane['egib.plotNo'], wartosc:project.egib.plotNo};`);
  T('po poprawieniu pola znacznik AUTO znika', edycja.auto === false && edycja.wSladzie === false && edycja.wartosc === '999/9', edycja);

  const spr = await p.ocen(`renderAll(); await new Promise(r=>setTimeout(r,300));
    const ile=document.querySelectorAll('#tab-egib .auto-baner').length;
    document.querySelector('[data-auto-sprawdzone="egib"]').click(); await new Promise(r=>setTimeout(r,300));
    const b=document.querySelector('#tab-egib > .auto-baner');
    return {ile, stan:b.dataset.stan, tekst:b.textContent, wPrzegladzie:document.querySelector('#autoPrzeglad .auto-etap:nth-child(3)').dataset.stan};`);
  T('baner nie mnoży się po przerysowaniu', spr.ile === 1, spr.ile);
  T('„Sprawdziłem ten etap" zmienia stan etapu i przeglądu', spr.stan === 'sprawdzone' && /Etap sprawdzony/.test(spr.tekst) && spr.wPrzegladzie === 'ok', spr);

  const zaWczesnie = await p.ocen(`document.querySelector('[data-auto-koniec]').click(); await new Promise(r=>setTimeout(r,400));
    const tab=document.querySelector('.tab.active')?.id;
    document.querySelector('#autoZatwierdz').click(); await new Promise(r=>setTimeout(r,300));
    return {tab, status:document.querySelector('#statusBar').textContent, zatw:project.meta.zatwierdzono||''};`);
  T('„Do etapu końcowego" wraca do przeglądu', zaWczesnie.tab === 'tab-result');
  T('zatwierdzenie przed sprawdzeniem etapów jest odrzucane z listą etapów', /Najpierw sprawdź etapy/.test(zaWczesnie.status) && /Rynek i transakcje/.test(zaWczesnie.status) && !zaWczesnie.zatw, zaWczesnie.status);

  const zatw = await p.ocen(`for(const tab of Object.keys(autoEtapy())){ project.autoSprawdzone[tab]=new Date().toISOString(); } autoOznacz(); window.__pytania=[];
    document.querySelector('#autoZatwierdz').click(); await new Promise(r=>setTimeout(r,500));
    return {status:project.meta.status, zatw:!!project.meta.zatwierdzono, stan:document.querySelector('#autoPrzegladStan').textContent, pyt:(window.__pytania||[])[0]||''};`);
  T('po sprawdzeniu wszystkich etapów operat da się zatwierdzić', zatw.status === 'Zatwierdzony' && zatw.zatw && /Operat zatwierdzony/.test(zatw.stan), zatw);
  T('przy brakach kontroli program pyta przed zatwierdzeniem', zatw.pyt === '' || /Kontrola zgłasza jeszcze/.test(zatw.pyt), zatw.pyt.slice(0, 80));

  const nowy = await p.ocen(`await autoSledz(async()=>{ project.planning.zoneSymbol='MW1'; }, 'test'); autoOznacz();
    return {spr:!!project.autoSprawdzone.egib, wSladzie:!!project.autoWpisane['planning.zoneSymbol']};`);
  T('gdy program dopisze coś do sprawdzonego etapu, etap wraca do sprawdzenia', nowy.spr === false && nowy.wSladzie === true, nowy);

  const ksiega = await p.ocen(`await createProjectFromModule('local_kcm'); await new Promise(r=>setTimeout(r,400));
    const czysto={slad:Object.keys(project.autoWpisane||{}).length, karta:document.querySelector('#autoPrzegladKarta').classList.contains('hidden'), banery:document.querySelectorAll('.auto-baner').length};
    document.querySelector('#szybkiKwTekst').value='TREŚĆ KSIĘGI WIECZYSTEJ NR GD1G/00380276/5, STAN Z DNIA 2026-11-13 18:57\\nDZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI\\nUlica\\tNumer budynku\\tNumer lokalu\\tIKARA\\t97\\t2\\nKondygnacja\\t1';
    document.querySelector('#szybkiKwBtn').click(); await new Promise(r=>setTimeout(r,500));
    return {czysto, ulica:!!project.autoWpisane['property.street'], zrodlo:project.autoWpisane['property.street']?.zrodlo, znaczek:document.querySelector('[data-path="property.street"]').closest('label').classList.contains('auto-wpisane')};`);
  T('nowy operat zaczyna bez śladu poprzedniego', ksiega.czysto.slad === 0 && ksiega.czysto.karta === true && ksiega.czysto.banery === 0, ksiega.czysto);
  T('dane z księgi wieczystej też są oznaczone jako wpisane przez program', ksiega.ulica && ksiega.zrodlo === 'księga wieczysta' && ksiega.znaczek, ksiega);

  T('po całym przebiegu nie ma błędów strony', (await p.ocen('return (window.__bledy||[]).length;')) === 0, await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  await p.zamknij();
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

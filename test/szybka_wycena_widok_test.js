'use strict';
/** OPERO — Express: szybka wycena w uruchomionym programie. */
const { Przegladarka } = require('./przegladarka');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — Express: szybka wycena (widok)\n');
  await p.pauza(1800);
  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0, await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=()=>true; document.body.classList.add('motion-reduced');
    switchTab('express'); renderAll(); await new Promise(r=>setTimeout(r,500)); return 1;`);
  const uklad = await p.ocen(`const k=document.querySelector('#swKarta'), r=document.querySelector('#exRozszerzony');
    return {karta: k&&k.getBoundingClientRect().width>300, tytul:document.querySelector('#tab-express h2').textContent,
      rozszerzonyZwiniety: r&&r.open===false, policzWSrodku: !!r?.querySelector('#exPolicz'), pol: k.querySelectorAll('input,select').length,
      pierwsza: document.querySelector('#tab-express .card')?.id};`);
  T('Express otwiera się na szybkiej wycenie', uklad.karta && /szybka wycena/i.test(uklad.tytul) && uklad.pierwsza === 'swKarta', uklad);
  T('formularz ma dziewięć pól, nie pięć kroków', uklad.pol === 9, uklad.pol);
  T('operat skrócony jest zwinięty pod spodem i nadal dostępny', uklad.rozszerzonyZwiniety && uklad.policzWSrodku, uklad);

  const puste = await p.ocen(`document.querySelector('#swWycen').click(); await new Promise(r=>setTimeout(r,300));
    return document.querySelector('#swWynik').textContent;`);
  T('bez danych prosi o miejscowość i powierzchnię', /miejscowość/.test(puste) && /powierzchnię/.test(puste), puste);

  const wyc = await p.ocen(`const ceny=[9800,10000,10100,10200,10300,10400,10500,10600,10800];
    window.__dzialkaOdp={ok:true,punkt:{x:470000,y:720000},punkty:[],dzialki:[{id:'a',numer:'1',obreb:'Osowa',powiat:'Gdańsk'}]};
    window.__rcnOdp={ok:true,pominieto:0,komunikat:'ok',zrodlo:'RCN',transakcje:ceny.map((c,i)=>({zrodloWiersz:i+1,adres:'ul. Siedleckiego '+(i+1)+', Gdańsk',miejscowosc:'Gdańsk',dzielnica:'Osowa',
      data:'2026-0'+(1+i%9)+'-15',powierzchnia:66+(i%5),cena:Math.round(c*(66+(i%5))),jednostkowa:c,pokoje:3,pietro:2,x:470000+i*20,y:720000,prawo:'własność',rodzaj:'sprzedaż',uwagi:[]}))};
    window.__bazaKandydaci=[];
    const przed=JSON.stringify(project.property);
    const u=(id,v)=>{document.querySelector(id).value=v;};
    u('#swMiasto','Gdańsk'); u('#swDzielnica','Osowa'); u('#swUlica','Siedleckiego 9'); u('#swPow','68'); u('#swPokoje','3'); u('#swPietro','2'); u('#swOferta','800 000');
    document.querySelector('#swWycen').click();
    for(let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,150)); if(!document.querySelector('#swWycen').disabled && !document.querySelector('#swWynik').classList.contains('hidden')) break; }
    const box=document.querySelector('#swWynik');
    return {tekst:box.textContent, stan:box.dataset.stan, wartosc:box.querySelector('.szybka-wartosc b')?.textContent, przedzial:box.querySelector('.szybka-przedzial b')?.textContent,
      pewnosc:box.querySelector('.szybka-pewnosc b')?.textContent, wiersze:box.querySelectorAll('tbody tr').length, oferta:box.querySelector('.szybka-oferta')?.textContent||'',
      rcn:window.__rcnZapytanie, bezZmian:JSON.stringify(project.property)===przed, guzik:document.querySelector('#swWycen').disabled};`);
  T('wynik: wartość, przedział i pewność', wyc.stan === 'sukces' && /\d{3}[\s ]000 zł/.test(wyc.wartosc || '') && /–/.test(wyc.przedzial || '') && /wysoka|średnia|niska/.test(wyc.pewnosc || ''), wyc);
  T('wartość to mediana × powierzchnia (700 000 zł)', /^700[\s ]000 zł$/.test(wyc.wartosc || ''), wyc.wartosc);
  T('pod wynikiem widać transakcje, z których powstał', wyc.wiersze === 6 && /Rejestr Cen Nieruchomości/.test(wyc.tekst), wyc.wiersze);
  T('cena ofertowa jest porównana z szacunkiem', /Cena ofertowa 800[\s ]000 zł/.test(wyc.oferta) && /wyższa/.test(wyc.oferta), wyc.oferta);
  T('rejestr jest pytany o lokale wokół adresu', wyc.rcn && wyc.rcn.x === 470000 && wyc.rcn.promien === 1500 && wyc.rcn.typy.includes('lokale'), wyc.rcn);
  T('wynik mówi wprost, że to nie operat', /szacunek orientacyjny/.test(wyc.tekst) && /Nie jest operatem szacunkowym/.test(wyc.tekst));
  T('szybka wycena nie zmienia bieżącego operatu', wyc.bezZmian === true && wyc.guzik === false);

  const stan = await p.ocen(`const s=document.querySelector('#swStan'); s.value='wysoki'; s.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,900)); return document.querySelector('#swWynik .szybka-wartosc b')?.textContent;`);
  T('zmiana stanu lokalu od razu przelicza wynik (górny kwartyl)', /^714[\s ]000 zł$/.test(stan || ''), stan);

  const malo = await p.ocen(`window.__rcnOdp.transakcje=window.__rcnOdp.transakcje.slice(0,2);
    document.querySelector('#swWycen').click(); await new Promise(r=>setTimeout(r,1200));
    const box=document.querySelector('#swWynik'); return {tekst:box.textContent, stan:box.dataset.stan, liczba:!!box.querySelector('.szybka-wartosc')};`);
  T('przy dwóch transakcjach program nie podaje liczby', malo.liczba === false && /Nie podaję wartości/.test(malo.tekst) && /za mało/.test(malo.tekst) && malo.stan === 'uwaga', malo.tekst);

  const awaria = await p.ocen(`window.__rcnBlad='Geoportal nie odpowiada'; document.querySelector('#swWycen').click(); await new Promise(r=>setTimeout(r,1200)); window.__rcnBlad='';
    return {tekst:document.querySelector('#swWynik').textContent, guzik:document.querySelector('#swWycen').disabled, bledy:(window.__bledy||[]).length};`);
  T('gdy rejestr milczy, program mówi dlaczego nie ma wyniku', /Geoportal nie odpowiada/.test(awaria.tekst) && awaria.guzik === false && awaria.bledy === 0, awaria);

  const doOp = await p.ocen(`window.__rcnOdp.transakcje=[9800,10000,10100,10200,10300].map((c,i)=>({zrodloWiersz:i+1,adres:'ul. Siedleckiego '+(i+1)+', Gdańsk',miejscowosc:'Gdańsk',dzielnica:'Osowa',data:'2026-05-15',powierzchnia:66+i,cena:c*(66+i),jednostkowa:c,pokoje:3,pietro:2,x:470000,y:720000,prawo:'własność',rodzaj:'sprzedaż',uwagi:[]}));
    document.querySelector('#swStan').value='przecietny';
    document.querySelector('#swWycen').click(); await new Promise(r=>setTimeout(r,1300));
    document.querySelector('#swDoOperatu').click(); await new Promise(r=>setTimeout(r,900));
    const pr=project.property;
    return {karta:document.querySelector('.tab.active')?.id, miasto:pr.city, ulica:pr.street, nr:pr.buildingNo, pow:pr.usableArea, pokoje:pr.rooms, oferta:pr.askingPrice,
      tr:(project.market.transactions||[]).length, kartaDok:!!document.querySelector('#tab-project #szybkiKarta')};`);
  T('„Zrób z tego pełny operat" zakłada operat z tymi danymi', doOp.karta === 'tab-project' && doOp.miasto === 'Gdańsk' && doOp.ulica === 'Siedleckiego' && doOp.nr === '9' && Number(doOp.pow) === 68 && Number(doOp.pokoje) === 3 && doOp.oferta === 800000, doOp);
  T('pełny operat zaczyna od dokumentów, bez transakcji z szybkiej wyceny', doOp.kartaDok && doOp.tr === 0, doOp);

  const zOp = await p.ocen(`switchTab('express'); await new Promise(r=>setTimeout(r,300));
    ['#swMiasto','#swUlica','#swPow'].forEach(s=>document.querySelector(s).value='');
    document.querySelector('#swZOperatu').click(); await new Promise(r=>setTimeout(r,200));
    return {m:document.querySelector('#swMiasto').value, u:document.querySelector('#swUlica').value, p:document.querySelector('#swPow').value};`);
  T('„Weź dane z bieżącego operatu" wypełnia formularz', zOp.m === 'Gdańsk' && zOp.u === 'Siedleckiego 9' && zOp.p === '68', zOp);

  const rozw = await p.ocen(`const r=document.querySelector('#exRozszerzony'); r.open=false;
    document.querySelector('#swWycen').click(); await new Promise(r2=>setTimeout(r2,1300));
    document.querySelector('#swRozszerz').click(); await new Promise(r2=>setTimeout(r2,300));
    return {open:r.open, widac:document.querySelector('#exTypy').getBoundingClientRect().width>0};`);
  T('„Otwórz operat skrócony" rozwija dawny Express', rozw.open === true && rozw.widac, rozw);

  T('po całym przebiegu nie ma błędów strony', (await p.ocen('return (window.__bledy||[]).length;')) === 0, await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  await p.zamknij();
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

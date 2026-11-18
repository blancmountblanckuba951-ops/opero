'use strict';
/**
 * OPERO — cechy rynkowe w działającym programie.
 *
 *   PEŁNY OPERAT: program podpowiada zestaw cech, typowe przedziały wag
 *   i definicje trzech stopni — ale wybiera rzeczoznawca.
 *   EXPRESS: trzy warianty ocen (najniższy, przeciętny, najwyższy) i trzy
 *   wyniki, z wyraźnym zastrzeżeniem, że to NIE są trzy wyceny.
 *
 * Rzecz, której test pilnuje najmocniej: suma wag. Gdy wynosi 90% zamiast
 * 100%, silnik policzy wartość, PDF się wygeneruje, a wynik będzie zaniżony
 * o dziesięć procent i nikt tego nie zobaczy.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Przegladarka } = require('./przegladarka');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — cechy rynkowe, wagi i trzy warianty (widok)\n');
  await p.pauza(1800);

  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    JSON.stringify(await p.ocen('return (window.__bledy||[]).slice(0,3);')));
  T('moduł cech jest wpięty', await p.ocen('return Boolean(window.OperoCechy);'));

  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=()=>true; return 1;`);

  /* ===================================== 1. PEŁNY OPERAT: podpowiedź cech */
  const pomoc = await p.ocen(`
    switchTab('features'); renderAll(); await new Promise(r=>setTimeout(r,500));
    return {karta: Boolean(document.querySelector('#cechyPomoc')),
      suma: document.querySelector('#cechySuma')?.textContent||'',
      waga: document.querySelector('#cechySuma')?.dataset.waga||''};`);
  T('nad tabelą cech jest pomoc przy wagach', pomoc.karta === true);
  T('i widać sumę wag', /Suma wag/.test(pomoc.suma), pomoc.suma);
  /* Cechy startowe mają wagi 0 — program nie przyjmuje ich za rzeczoznawcę.
     Suma 0% musi świecić na czerwono, a nie wyglądać na poprawną. */
  T('suma zero jest oznaczona jako błąd', pomoc.waga === 'blad', pomoc.waga);

  const katalog = await p.ocen(`
    document.querySelector('#cechyPodpowiedz').click();
    await new Promise(r=>setTimeout(r,300));
    return {pozycji: document.querySelectorAll('#cechyWybor .cechy-pozycja').length,
      nazwy: [...document.querySelectorAll('#cechyWybor .cechy-pozycja b')].map(x=>x.textContent.replace(/\\d+–\\d+%/,'').trim()),
      widelki: [...document.querySelectorAll('#cechyWybor .cechy-pozycja b i')].map(x=>x.textContent),
      stopni: document.querySelectorAll('#cechyWybor .cechy-stopnie span').length,
      wstep: document.querySelector('.cechy-wybor-wstep')?.textContent||''};`);
  T('program podpowiada zestaw cech', katalog.pozycji >= 5, String(katalog.pozycji));
  T('dla lokalu mieszkalnego to lokalizacja, standard, stan budynku…',
    katalog.nazwy.some(n => /Lokalizacja/.test(n)) && katalog.nazwy.some(n => /Standard/.test(n)),
    JSON.stringify(katalog.nazwy));
  T('przy każdej cesze stoi typowy przedział wagi',
    katalog.widelki.length === katalog.pozycji && katalog.widelki.every(w => /\d+.\d+%/.test(w)),
    JSON.stringify(katalog.widelki));
  /* Przedziały to praktyka, nie norma — żaden przepis nie ustala wag.
     Program musi to powiedzieć, zanim ktoś potraktuje je jak obowiązek. */
  T('program mówi, że to praktyka, a nie norma',
    /nie norma/.test(katalog.wstep) && /żaden przepis nie ustala wag/.test(katalog.wstep), katalog.wstep.slice(0, 160));
  T('każda cecha ma rozpisane trzy stopnie', katalog.stopni === katalog.pozycji * 3, String(katalog.stopni));

  const poWstawieniu = await p.ocen(`
    document.querySelector('[data-cechy-wstaw]').click();
    await new Promise(r=>setTimeout(r,700));
    const f=project.market.features||[];
    return {cech: f.length,
      suma: Math.round(f.reduce((a,x)=>a+Number(x.weight||0),0)*1000)/1000,
      zeSkala: f.filter(x=>x.scaleMin&&x.scaleAvg&&x.scaleMax).length,
      trzystopniowe: f.filter(x=>x.scaleMode==='three').length,
      oceny: f.filter(x=>x.rating).length,
      tekstSumy: document.querySelector('#cechySuma')?.textContent||'',
      wagaSumy: document.querySelector('#cechySuma')?.dataset.waga||''};`);
  T('cechy wchodzą do tabeli operatu', poWstawieniu.cech >= 5, String(poWstawieniu.cech));
  T('WAGI SUMUJĄ SIĘ DOKŁADNIE DO 100%', poWstawieniu.suma === 1, String(poWstawieniu.suma));
  T('i program to potwierdza na zielono', poWstawieniu.wagaSumy === 'ok', poWstawieniu.tekstSumy);
  /* Bez definicji stopni ocena „korzystna" jest słowem bez treści,
     a weryfikator pyta właśnie o to. */
  T('każda cecha dostaje definicje trzech stopni', poWstawieniu.zeSkala === poWstawieniu.cech);
  T('wszystkie w skali trzystopniowej', poWstawieniu.trzystopniowe === poWstawieniu.cech);
  T('każda ma ustawioną ocenę wyjściową', poWstawieniu.oceny === poWstawieniu.cech);

  /* --- rozwijana lista ocen z opisem, co dany stopień znaczy --- */
  const ocena = await p.ocen(`
    const sel=document.querySelector('#featuresEditor .frating');
    const opcje=[...sel.options].map(o=>o.textContent.trim());
    sel.value='Korzystna'; sel.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,500));
    const box=document.querySelector('#featuresEditor .selected-rating-box');
    return {opcje, wybrana: project.market.features[0].rating,
      opis: box?.querySelector('p')?.textContent||''};`);
  T('ocena jest rozwijaną listą', ocena.opcje.length >= 3, JSON.stringify(ocena.opcje));
  T('z trzema stopniami', ocena.opcje.join(',').includes('Niekorzystna') && ocena.opcje.join(',').includes('Korzystna'));
  T('wybór zapisuje się w operacie', ocena.wybrana === 'Korzystna');
  T('program pokazuje, co ten stopień znaczy dla tej cechy',
    ocena.opis.length > 25 && !/Uzupełnij definicję/.test(ocena.opis), ocena.opis.slice(0, 90));

  /* --- wyrównanie wag --- */
  const wyrownanie = await p.ocen(`
    project.market.features[0].weight=0.5;
    project.market.features[1].weight=0.1;
    renderAll(); await new Promise(r=>setTimeout(r,400));
    const przed=document.querySelector('#cechySuma')?.dataset.waga;
    document.querySelector('#cechyWyrownaj').click();
    await new Promise(r=>setTimeout(r,600));
    const f=project.market.features;
    return {przed, po: document.querySelector('#cechySuma')?.dataset.waga,
      suma: Math.round(f.reduce((a,x)=>a+Number(x.weight||0),0)*1000)/1000,
      proporcja: f[0].weight > f[1].weight};`);
  T('zła suma jest zgłoszona', wyrownanie.przed === 'blad', wyrownanie.przed);
  T('„Wyrównaj wagi" naprawia sumę', wyrownanie.suma === 1, String(wyrownanie.suma));
  T('i mówi, że jest dobrze', wyrownanie.po === 'ok');
  T('proporcje między cechami zostają Twoje', wyrownanie.proporcja === true);


  /* --- OCENA „KORZYSTNA" NIE MOŻE ZNIKNĄĆ ---
     Program normalizował oceny przy każdym przerysowaniu ekranu i „Korzystna"
     wracała jako „Przeciętna" — rzeczoznawca ustawiał ocenę, a wartość
     operatu po cichu spadała. Błąd niewidoczny: nic się nie psuło, tylko
     wynik był inny niż ten, który człowiek zatwierdził. */
  const trwalosc = await p.ocen(`
    (project.market.features||[]).forEach(f=>{f.rating='Korzystna';});
    const poUstawieniu=(project.market.features||[]).map(f=>f.rating).join(',');
    renderAll(); await new Promise(r=>setTimeout(r,300));
    const poPrzerysowaniu=(project.market.features||[]).map(f=>f.rating).join(',');
    (project.market.features||[]).forEach(f=>{f.rating='Niekorzystna';});
    renderAll(); await new Promise(r=>setTimeout(r,300));
    return {poUstawieniu, poPrzerysowaniu,
      niekorzystna:(project.market.features||[]).map(f=>f.rating).join(',')};`);
  T('ocena „Korzystna" przeżywa przerysowanie ekranu',
    trwalosc.poPrzerysowaniu === trwalosc.poUstawieniu, trwalosc.poPrzerysowaniu);
  T('„Niekorzystna" też', /^Niekorzystna/.test(trwalosc.niekorzystna), trwalosc.niekorzystna);

  /* ================================ 2. EXPRESS: TRZY WARIANTY OCEN */
  const express = await p.ocen(`
    switchTab('express');
    document.querySelector('[data-ex-typ="local_kcm"]').click();
    await new Promise(r=>setTimeout(r,500));
    window.__dzialkaOdp={ok:true,dzialki:[{id:'x'}],punkty:[{x:472000,y:720000}],punkt:{x:472000,y:720000}};
    window.__rcnOdp={ok:true,pominieto:0,komunikat:'ok',zrodlo:'RCN',transakcje:Array.from({length:6},(_,i)=>({
      zrodloWiersz:i+1,adres:'ul. Testowa '+(i+1)+', Gdansk',miejscowosc:'Gdańsk',data:'2026-0'+((i%6)+1)+'-10',
      cena:600000+i*25000,powierzchnia:60,jednostkowa:(600000+i*25000)/60,prawo:'własność',rodzaj:'sprzedaż',
      akt:'Rep. A '+(i+1)+'/2026',kw:'',uwagi:[],uwagiZrodla:''}))};
    document.querySelector('#ex_ulica').value='Kartuska';
    document.querySelector('#ex_miasto').value='Gdańsk';
    document.querySelector('#ex_powierzchnia').value='60';
    document.querySelector('#ex_dataWyceny').value='2026-11-05';
    document.querySelector('#ex_cel').value='sprzedaż';
    project.property.city='Gdańsk'; project.property.usableArea=60;
    document.querySelector('#exZGeoportalu').click();
    await new Promise(r=>setTimeout(r,1500));
    document.querySelector('#rcnPrzenies')?.click();
    await new Promise(r=>setTimeout(r,700));
    rcnZamknij(); switchTab('express');
    document.querySelector('#exPolicz').click();
    await new Promise(r=>setTimeout(r,1000));
    const kwoty=[...document.querySelectorAll('#exWarianty .wariant strong')].map(x=>x.textContent.trim());
    return {wariantow: document.querySelectorAll('#exWarianty .wariant').length,
      nazwy: [...document.querySelectorAll('#exWarianty .wariant b')].map(x=>x.textContent.trim()),
      kwoty, liczby: expressWarianty.map(w=>w.wartosc),
      opis: document.querySelector('.warianty-opis')?.textContent||'',
      biezaca: document.querySelector('.warianty-biezaca')?.textContent||''};`);
  T('Express liczy TRZY warianty', express.wariantow === 3, String(express.wariantow));
  T('najniższy, przeciętny i najwyższy',
    express.nazwy.join(' ').includes('najniższy') && express.nazwy.join(' ').includes('najwyższy'),
    JSON.stringify(express.nazwy));
  T('każdy ma swoją kwotę', express.kwoty.every(k => /\d/.test(k)), JSON.stringify(express.kwoty));
  /* Wariant najniższy MUSI być najtańszy, a najwyższy najdroższy — inaczej
     cała ta tabela wprowadza w błąd. */
  T('najniższy wariant daje najmniej, najwyższy najwięcej',
    express.liczby[0] < express.liczby[1] && express.liczby[1] < express.liczby[2],
    JSON.stringify(express.liczby));
  T('program podaje rozpiętość widełek', /rozpiętość/.test(express.opis), express.opis.slice(0, 120));
  /* NAJWAŻNIEJSZE ZDANIE W TEJ TABELI. */
  T('program mówi wprost, że to NIE są trzy wyceny',
    /widełki METODY, a nie trzy wyceny/.test(express.opis), express.opis);
  T('i że operat zawiera jedną wartość z oględzin',
    /operat zawiera jedną wartość/.test(express.opis) && /oględzin/.test(express.opis));
  T('program mówi, co stoi w operacie teraz', /W operacie stoi teraz/.test(express.biezaca), express.biezaca.slice(0, 90));
  T('i że po oględzinach trzeba poprawić oceny', /po oględzinach popraw oceny/i.test(express.biezaca));

  const przyjecie = await p.ocen(`
    const przed=(calc||{}).valueRounded;
    document.querySelector('[data-wariant-przyjmij="najlepszy"]').click();
    await new Promise(r=>setTimeout(r,800));
    return {przed, po:(calc||{}).valueRounded,
      oceny: (project.market.features||[]).map(f=>f.rating),
      ostatnie: (oknoStan.wpisy||[]).map(w=>w.szczegoly||'').join(' | ')};`);
  T('da się przyjąć oceny wariantu jednym kliknięciem',
    przyjecie.oceny.every(o => o === 'Korzystna'), JSON.stringify(przyjecie.oceny));
  T('wartość w operacie przelicza się od razu', przyjecie.po > przyjecie.przed,
    `${przyjecie.przed} → ${przyjecie.po}`);
  T('ale program ostrzega, że to wariant skrajny, nie ocena z oględzin',
    /wariant skrajny, nie ocena z oględzin/.test(przyjecie.ostatnie), przyjecie.ostatnie.slice(-180));

  /* Dlugie zdania opisowe nie moga byc pisane wielkimi literami.
     Globalna regula label{text-transform:uppercase} dziedziczyla sie na caly wybor cech. */
  const kroj = await p.ocen(`
    switchTab('features');
    await new Promise(r=>setTimeout(r,300));
    if(!document.querySelector('#cechyWybor .cechy-pozycja')) document.querySelector('#cechyPodpowiedz').click();
    await new Promise(r=>setTimeout(r,300));
    const we=(s)=>{const el=document.querySelector(s); return el?getComputedStyle(el).textTransform:'brak';};
    const op=document.querySelector('#cechyWybor .cechy-pozycja p');
    return {pozycja:we('#cechyWybor .cechy-pozycja'), opis:we('#cechyWybor .cechy-pozycja p'),
      nazwa:we('#cechyWybor .cechy-pozycja b'), stopien:we('#cechyWybor .cechy-stopnie span'),
      wstep:we('.cechy-wybor-wstep'), uwaga:we('#cechyUwagi'),
      tekst: op ? op.textContent.trim() : ''};`);
  T('opis cechy nie krzyczy wielkimi literami', kroj.opis === 'none', kroj.opis);
  T('nazwa cechy też jest pisana normalnie', kroj.nazwa === 'none', kroj.nazwa);
  T('trzy stopnie oceny też', kroj.stopien === 'none', kroj.stopien);
  T('wstęp nad listą też', kroj.wstep === 'none', kroj.wstep);
  T('i uwagi o wagach też', kroj.uwaga === 'none', kroj.uwaga);
  T('cała pozycja dziedziczy już zwykły krój', kroj.pozycja === 'none', kroj.pozycja);
  T('a opis to nadal pełne zdanie, nie skrót',
    kroj.tekst.length > 30 && kroj.tekst !== kroj.tekst.toUpperCase(), kroj.tekst.slice(0, 70));

  T('po całej tej drodze strona nadal działa bez błędu',
    (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    JSON.stringify(await p.ocen('return (window.__bledy||[]).slice(0,3);')));

  await p.zamknij();
  console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error('BLAD TESTU', e); process.exit(1); });

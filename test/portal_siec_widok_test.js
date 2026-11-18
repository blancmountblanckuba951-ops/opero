'use strict';
/** OPERO — okno portalu i PER w internecie w uruchomionym programie. */
const { Przegladarka } = require('./przegladarka');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
const STRONA = 'Mieszkanie 3-pokojowe z balkonem, Osowa\n890 000 zł\nul. Siedleckiego, Osowa, Gdańsk\n3 pokoje\n68 m²\n13 088 zł/m²\n2 piętro\nMieszkanie na sprzedaż Gdańsk Osowa\n760 000 zł\nGdańsk, Osowa, Barniewicka\n64 m² · 3 pokoje · 1 piętro';

(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — okno portalu i PER w internecie (widok)\n');
  await p.pauza(1800);
  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0, await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=()=>true; document.body.classList.add('motion-reduced'); uiPrefs.mode='expert';
    Object.assign(project.property,{city:'Gdańsk',district:'Osowa',street:'Siedleckiego',buildingNo:'9',usableArea:68,rooms:3,floor:'2'});
    switchTab('project'); renderAll(); await new Promise(r=>setTimeout(r,500)); return 1;`);

  /* ============== 1. OKNO PORTALU */
  const okno = await p.ocen(`szukOtworz(); await new Promise(r=>setTimeout(r,500));
    document.querySelector('#szukPortale').open=true;
    document.querySelector('#szukPortalWybor').value='olx';
    document.querySelector('#szukPortalOkno').click(); await new Promise(r=>setTimeout(r,300));
    return {url:window.__portalUrl||'', guziki:['#szukPortalOkno','#szukPortalCzytaj','#szukSerwisOkno','#szukSerwisCzytaj'].every(s=>!!document.querySelector(s))};`);
  T('w oknie szukania są przyciski okna portalu', okno.guziki);
  T('portal otwiera się z kryteriami operatu', /^https:\/\/www\.olx\.pl\/nieruchomosci\/mieszkania\/sprzedaz\/q-/.test(okno.url) && /Osowa/.test(okno.url), okno.url);

  const zamkniete = await p.ocen(`window.__portalOdp=null; document.querySelector('#szukPortalCzytaj').click(); await new Promise(r=>setTimeout(r,300));
    return document.querySelector('#szukPortalStan').textContent;`);
  T('przy zamkniętym oknie program mówi, co zrobić', /Okno portalu jest zamknięte/.test(zamkniete), zamkniete);

  const czyt = await p.ocen(`const przed=(project.market.transactions||[]).length;
    window.__portalOdp={ok:true,url:'https://www.olx.pl/x',host:'olx.pl',tytul:'OLX',tekst:${JSON.stringify(STRONA)}};
    document.querySelector('#szukPortalCzytaj').click(); await new Promise(r=>setTimeout(r,700));
    const e=window.OperoSzukanie.etap(szukPrzebieg,'inne-portale');
    return {stan:document.querySelector('#szukPortalStan').textContent, ile:e?.ile, etapStan:e?.stan, powod:e?.powod||'',
      wOperacie:(project.market.transactions||[]).length-przed,
      kolejka:!document.querySelector('#szukKolejka')?.classList.contains('hidden'), kolejkaTekst:(document.querySelector('#szukKolejka')?.textContent||'')+' '+(document.querySelector('#szukOverlay')?.textContent||'')};`);
  T('program odczytał oferty ze strony i mówi, z której', /odczytałem 2 oferty/.test(czyt.stan) && /Strona: olx\.pl/.test(czyt.stan), czyt.stan);
  T('oferty trafiają do etapu „inne portale"', czyt.ile >= 1, [czyt.ile, czyt.powod]);
  T('żadna oferta NIE wchodzi sama do operatu', czyt.wOperacie === 0, czyt.wOperacie);
  T('oferty czekają na decyzję z dopiskiem o cenie ofertowej', czyt.kolejka && /ofertow/i.test(czyt.kolejkaTekst), czyt.kolejkaTekst.slice(0, 200));

  const pusta = await p.ocen(`window.__portalOdp={ok:true,url:'https://www.olx.pl/regulamin',host:'olx.pl',tytul:'Regulamin',tekst:'Regulamin serwisu. Polityka prywatności.'};
    document.querySelector('#szukPortalCzytaj').click(); await new Promise(r=>setTimeout(r,300));
    return {stan:document.querySelector('#szukPortalStan').textContent, waga:document.querySelector('#szukPortalStan').dataset.waga};`);
  T('strona bez ofert: komunikat zamiast pustej listy', /nie widzę ofert/.test(pusta.stan) && pusta.waga === 'blad', pusta);

  const serwis = await p.ocen(`document.querySelector('#szukSerwisOkno').click(); await new Promise(r=>setTimeout(r,200));
    const url=window.__portalUrl;
    window.__portalOdp={ok:true,url:'https://deweloperuch.pl/x',host:'deweloperuch.pl',tytul:'x',tekst:'Data\\tAdres\\tPowierzchnia\\tCena\\n2026-06-10\\tul. Siedleckiego 3, Gdańsk\\t66 m²\\t690 000 zł\\n2026-07-02\\tul. Barniewicka 12, Gdańsk\\t70 m²\\t720 000 zł'};
    document.querySelector('#szukSerwisCzytaj').click(); await new Promise(r=>setTimeout(r,600));
    return {url, pole:document.querySelector('#szukWklejenie').value.length, stan:document.querySelector('#szukWklejenieStan').textContent};`);
  T('Deweloperuch otwiera się w oknie programu', /^https:\/\/deweloperuch\.pl\//.test(serwis.url), serwis.url);
  T('tabela z otwartej strony idzie tą samą drogą co wklejona', serwis.pole > 50 && /\d/.test(serwis.stan), serwis.stan);
  await p.ocen(`szukZamknij(); return 1;`);

  /* ============== 2. PER W INTERNECIE */
  const guziki = await p.ocen(`switchTab('egib'); renderAll(); await new Promise(r=>setTimeout(r,400));
    const pf=[...document.querySelectorAll('.per-field')];
    return {pol:pf.length, zSiecia:pf.filter(f=>f.querySelector('.siec-guzik')).length, podwojne:pf.filter(f=>f.querySelectorAll('.siec-guzik').length>1).length,
      listy:[...document.querySelectorAll('[data-per-target="legalBases"],[data-per-target="sources"]')].filter(b=>b.closest('.per-field')?.querySelector('.siec-guzik')).length};`);
  T('przy polach opisowych jest „Szukaj w internecie" — raz, mimo przerysowań', guziki.zSiecia >= 10 && guziki.podwojne === 0, guziki);

  const bezKlucza = await p.ocen(`window.__siecKlucz=''; window.__siecZapytania=[];
    const pf=document.querySelector('[data-per-target="location.description"]').closest('.per-field');
    pf.querySelector('.siec-guzik').click(); await new Promise(r=>setTimeout(r,200));
    const q=pf.querySelector('.siec-zapytanie').value;
    pf.querySelector('.siec-szukaj').click(); await new Promise(r=>setTimeout(r,300));
    return {q, tekst:pf.querySelector('.siec-wyniki').textContent, doUstawien:!!pf.querySelector('.siec-do-ustawien')};`);
  T('zapytanie jest ułożone z adresu operatu i da się je poprawić', bezKlucza.q === 'Osowa Gdańsk Siedleckiego okolica komunikacja infrastruktura', bezKlucza.q);
  T('bez klucza program mówi, czego brakuje, i prowadzi do Ustawień', /Nie ma klucza wyszukiwarki/.test(bezKlucza.tekst) && bezKlucza.doUstawien, bezKlucza.tekst);

  const klucz = await p.ocen(`switchTab('settings'); await new Promise(r=>setTimeout(r,300));
    const k=document.querySelector('#siecKlucz'); k.value='za krótki'; document.querySelector('#siecZapisz').click(); await new Promise(r=>setTimeout(r,300));
    const zly={kom:document.querySelector('#siecKomunikat').textContent, stan:document.querySelector('#siecStan').textContent};
    k.value='BSA1234567890abcdefghij_KLUCZ'; document.querySelector('#siecZapisz').click(); await new Promise(r=>setTimeout(r,300));
    return {zly, kom:document.querySelector('#siecKomunikat').textContent, stan:document.querySelector('#siecStan').textContent, pole:k.value, typ:k.type};`);
  T('zły klucz jest odrzucany z wyjaśnieniem', /nie wygląda na klucz/.test(klucz.zly.kom) && /brak klucza/.test(klucz.zly.stan), klucz.zly);
  T('dobry klucz jest zapisywany, a pole czyszczone i zakryte', /Klucz zapisany/.test(klucz.kom) && /szukanie włączone/.test(klucz.stan) && klucz.pole === '' && klucz.typ === 'password', klucz);

  const szuk = await p.ocen(`switchTab('egib'); renderAll(); await new Promise(r=>setTimeout(r,400));
    window.__siecZapytania=[]; window.__perPolecenia=[]; window.__perBlad='';
    window.__siecOdp={ok:true,wyniki:[
      {tytul:'Rada Dzielnicy Osowa',opis:'Osowa jest dzielnicą Gdańska położoną przy obwodnicy Trójmiasta.',adres:'https://www.gdansk.pl/osowa',domena:'gdansk.pl',urzedowe:false},
      {tytul:'BIP — linie autobusowe',opis:'Dzielnicę obsługują linie autobusowe ZTM.',adres:'https://bip.gdansk.pl/ztm',domena:'bip.gdansk.pl',urzedowe:true},
      {tytul:'Forum mieszkańców',opis:'Podobno będzie tramwaj w 2031.',adres:'https://forum.example.pl/1',domena:'forum.example.pl',urzedowe:false}]};
    window.__perTeksty={'location.description':'Nieruchomość leży w dzielnicy Osowa, obsługiwanej przez linie autobusowe ZTM.'};
    project.location.description='';
    const pf=document.querySelector('[data-per-target="location.description"]').closest('.per-field');
    if(!pf.querySelector('.siec-panel')) pf.querySelector('.siec-guzik').click(); await new Promise(r=>setTimeout(r,200));
    pf.querySelector('.siec-szukaj').click(); await new Promise(r=>setTimeout(r,400));
    const wyniki=[...pf.querySelectorAll('.siec-wynik')];
    const stan={ile:wyniki.length, zazn:wyniki.map(x=>x.querySelector('input').checked), urzad:pf.querySelectorAll('.siec-urzad').length, domeny:wyniki.map(x=>x.querySelector('em').textContent),
      q:(window.__siecZapytania||[])[0]?.zapytanie};
    pf.querySelector('.siec-napisz').click(); await new Promise(r=>setTimeout(r,700));
    const okno=document.querySelector('#perRedakcja');
    stan.okno=!!okno; stan.wOperaciePrzed=project.location.description; stan.oknoTekst=okno?.textContent||'';
    stan.prompt=((window.__perPolecenia||[])[0]||{}).prompt||'';
    return stan;`);
  T('wyniki są pokazane ze źródłem przy każdym', szuk.ile === 3 && szuk.domeny.includes('bip.gdansk.pl') && szuk.q && /Osowa/.test(szuk.q), szuk);
  T('z góry zaznaczona jest tylko strona urzędowa', JSON.stringify(szuk.zazn) === '[false,true,false]' && szuk.urzad === 1, szuk.zazn);
  T('PER dostaje tylko zaznaczone źródła, każde z domeną', /z internetu \(bip\.gdansk\.pl\)/.test(szuk.prompt) && !/forum\.example\.pl/.test(szuk.prompt) && !/tramwaj/.test(szuk.prompt), szuk.prompt.slice(-400));
  T('tekst z internetu NIE wchodzi sam — najpierw podgląd', szuk.okno && szuk.wOperaciePrzed === '', szuk.wOperaciePrzed);
  T('w podglądzie tekst ma dopisane źródła i znacznik do potwierdzenia', /Źródła internetowe: bip\.gdansk\.pl \[DO POTWIERDZENIA\]/.test(szuk.oknoTekst), szuk.oknoTekst.slice(-300));

  const przyjete = await p.ocen(`const okno=document.querySelector('#perRedakcja');
    const b=[...okno.querySelectorAll('button')].find(x=>/wstaw|przyjmij|zast/i.test(x.textContent)); b?.click(); await new Promise(r=>setTimeout(r,500));
    return {jestGuzik:!!b, tekst:project.location.description, zrodla:(project.sources||[]).filter(x=>/bip\\.gdansk\\.pl/.test(x)), forum:(project.sources||[]).some(x=>/forum/.test(x)),
      panel:!!document.querySelector('.siec-panel'), status:document.querySelector('#statusBar').textContent};`);
  T('po przyjęciu tekst jest w operacie', przyjete.jestGuzik && /linie autobusowe ZTM/.test(przyjete.tekst) && /Źródła internetowe/.test(przyjete.tekst), przyjete);
  T('wybrane źródło trafia do źródeł operatu z adresem i datą dostępu', przyjete.zrodla.length === 1 && /https:\/\/bip\.gdansk\.pl\/ztm/.test(przyjete.zrodla[0]) && /dostęp/.test(przyjete.zrodla[0]) && !przyjete.forum, przyjete.zrodla);
  T('panel się zamyka, a program potwierdza', przyjete.panel === false && /źródeł internetowych dopisanych/.test(przyjete.status), przyjete.status);

  const nic = await p.ocen(`window.__perPolecenia=[];
    const pf=document.querySelector('[data-per-target="planning.description"]').closest('.per-field');
    pf.querySelector('.siec-guzik').click(); await new Promise(r=>setTimeout(r,200));
    pf.querySelector('.siec-szukaj').click(); await new Promise(r=>setTimeout(r,400));
    pf.querySelectorAll('.siec-wynik input').forEach(c=>c.checked=false);
    pf.querySelector('.siec-napisz').click(); await new Promise(r=>setTimeout(r,300));
    return {polecen:(window.__perPolecenia||[]).length, status:document.querySelector('#statusBar').textContent};`);
  T('bez zaznaczonego źródła PER nie pisze', nic.polecen === 0 && /Zaznacz przynajmniej jedno źródło/.test(nic.status), nic);

  T('po całym przebiegu nie ma błędów strony', (await p.ocen('return (window.__bledy||[]).length;')) === 0, await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  await p.zamknij();
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

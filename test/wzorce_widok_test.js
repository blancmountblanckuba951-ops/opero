'use strict';
/**
 * OPERO — wzorce w uruchomionym programie:
 *   1. Własne układy dokumentu: zapis, wybór, domyślny, cofnięcie zmian, usunięcie.
 *   2. Szablony operatu: zapis, nowy operat z szablonu.
 *   3. „Zmień rodzaj operatu" zmienia rodzaj i NIE kasuje wspólnych danych.
 *   4. Adres: gdy rejestr nic nie znajdzie, jest przycisk drugiego źródła,
 *      a program pyta je dopiero po kliknięciu.
 */
const { Przegladarka } = require('./przegladarka');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };

(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — układy, szablony, zmiana rodzaju, drugie źródło adresów (widok)\n');
  await p.pauza(1800);
  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=(t)=>{(window.__pytania=window.__pytania||[]).push(String(t));return true;};
    document.body.classList.add('motion-reduced');
    uiPrefs.mode='expert'; switchTab('result'); renderAll();
    await new Promise(r=>setTimeout(r,600)); return 1;`);
  T('moduł wzorców jest wpięty', await p.ocen('return Boolean(window.OperoWzorce && window.OperoAdresOsm);'));

  /* ============== 1. WŁASNE UKŁADY */
  const start = await p.ocen(`return {blok: !!document.querySelector('#ukladyWlasne'),
    pusto: document.querySelector('#ukladyLista')?.textContent||'',
    cofnij: document.querySelector('#ukladPrzywroc')?.disabled,
    domyslny: !!document.querySelector('#ukladDomyslny')};`);
  T('edytor raportu ma dział „Moje układy"', start.blok);
  T('pusta lista mówi, że układów jeszcze nie ma', /Nie masz jeszcze/.test(start.pusto), start.pusto);
  T('jest wybór układu dla nowych operatów', start.domyslny);
  T('„Cofnij moje zmiany" jest wyłączone, gdy nic nie zmieniono', start.cofnij === true);

  const bezNazwy = await p.ocen(`document.querySelector('#ukladNazwa').value='';
    document.querySelector('#ukladZapisz').click(); await new Promise(r=>setTimeout(r,200));
    return {stan: document.querySelector('#ukladyStan').textContent, ile: wzorceStan.uklady.length};`);
  T('zapis bez nazwy nie tworzy układu i mówi dlaczego', bezNazwy.ile === 0 && /nazwę/.test(bezNazwy.stan), bezNazwy);

  const zapis = await p.ocen(`project.appearance.pageMarginMm=22; project.appearance.accent='#225577'; bindStaticFields();
    document.querySelector('#ukladNazwa').value='Bank PKO';
    document.querySelector('#ukladZapisz').click(); await new Promise(r=>setTimeout(r,300));
    const k=document.querySelector('.uklad-kafelek');
    return {ile: wzorceStan.uklady.length, naDysku:(window.__wzorce?.uklady||[]).length,
      nazwa:k?.querySelector('b')?.textContent, wybrany:k?.classList.contains('wybrany'),
      mini: !!k?.querySelector('.mini-strona'), pole: document.querySelector('#ukladNazwa').value,
      stan: document.querySelector('#ukladyStan').textContent, styl: project.appearance.stylPdf===wzorceStan.uklady[0]?.id};`);
  T('zapisany układ pojawia się jako kafelek', zapis.ile === 1 && zapis.nazwa === 'Bank PKO', zapis);
  T('układ trafia do zapisu na dysku', zapis.naDysku === 1);
  T('kafelek ma miniaturę i jest oznaczony jako wybrany', zapis.mini && zapis.wybrany);
  T('pole nazwy czyści się po zapisie, a program potwierdza', zapis.pole === '' && /zapisany/.test(zapis.stan), zapis.stan);
  T('operat pamięta swój układ', zapis.styl);

  const dostrojony = await p.ocen(`const pole=document.querySelector('#tab-result [data-path="appearance.pageMarginMm"]');
    pole.value='14'; pole.dispatchEvent(new Event('input',{bubbles:true})); pole.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,300));
    const przed={margines:project.appearance.pageMarginMm, wybrany:document.querySelector('.uklad-kafelek').classList.contains('wybrany'), cofnij:document.querySelector('#ukladPrzywroc').disabled};
    document.querySelector('#ukladPrzywroc').click(); await new Promise(r=>setTimeout(r,300));
    return {przed, po:{margines:project.appearance.pageMarginMm, wybrany:document.querySelector('.uklad-kafelek').classList.contains('wybrany'), cofnij:document.querySelector('#ukladPrzywroc').disabled}};`);
  T('po zmianie marginesu kafelek przestaje być „wybrany"', Number(dostrojony.przed.margines) === 14 && dostrojony.przed.wybrany === false, dostrojony.przed);
  T('wtedy „Cofnij moje zmiany" jest czynne', dostrojony.przed.cofnij === false);
  T('cofnięcie wraca do zapisanego układu', Number(dostrojony.po.margines) === 22 && dostrojony.po.wybrany === true && dostrojony.po.cofnij === true, dostrojony.po);

  const wzorzec = await p.ocen(`document.querySelector('[data-styl="prestizowy"]').click(); await new Promise(r=>setTimeout(r,300));
    const a={akcent:project.appearance.accent, wybrany:document.querySelector('.uklad-kafelek').classList.contains('wybrany')};
    document.querySelector('[data-uklad-uzyj]').click(); await new Promise(r=>setTimeout(r,300));
    return {a, b:{akcent:project.appearance.accent, margines:project.appearance.pageMarginMm, wybrany:document.querySelector('.uklad-kafelek').classList.contains('wybrany'),
      wzorcowe:[...document.querySelectorAll('#szataKafelki .szata-kafelek.wybrany')].length}};`);
  T('wybór wzorca programu odznacza własny układ', wzorzec.a.akcent === '#173a63' && wzorzec.a.wybrany === false, wzorzec.a);
  T('kliknięcie kafelka wraca do własnego układu', wzorzec.b.akcent === '#225577' && Number(wzorzec.b.margines) === 22 && wzorzec.b.wybrany, wzorzec.b);
  T('wtedy żaden wzorzec programu nie udaje wybranego', wzorzec.b.wzorcowe === 0, wzorzec.b.wzorcowe);

  const domyslny = await p.ocen(`const s=document.querySelector('#ukladDomyslny'); s.value=wzorceStan.uklady[0].id;
    s.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,300));
    await createProjectFromModule('local_kcm'); await new Promise(r=>setTimeout(r,500));
    return {zapisany: window.__wzorce.domyslnyUklad===wzorceStan.uklady[0].id, akcent:project.appearance.accent, margines:project.appearance.pageMarginMm,
      naglowek: project.appearance.headerText, opis: document.querySelector('.uklad-nazwa small')?.textContent||''};`);
  T('układ domyślny jest zapisany', domyslny.zapisany);
  T('nowy operat startuje od układu domyślnego', domyslny.akcent === '#225577' && Number(domyslny.margines) === 22, domyslny);
  T('nagłówek stron nowego operatu zostaje właściwy dla rodzaju', /lokalowej/.test(domyslny.naglowek), domyslny.naglowek);
  T('kafelek pokazuje, że jest domyślny', /domyślny/.test(domyslny.opis), domyslny.opis);

  /* ============== 2. SZABLONY */
  const szablon = await p.ocen(`Object.assign(project.property,{city:'Gdańsk',district:'Osowa',street:'Siedleckiego',buildingNo:'9',usableArea:68});
    project.client.name='Anna Nowak'; project.legal.kwLocal='GD1G/00012345/6';
    project.clauses='Klauzula bankowa'; project.valuation.purpose='Zabezpieczenie kredytu';
    project.market.features[0].weight=0.35; project.market.features[0].ratingNote='uwaga o tej nieruchomości';
    project.market.transactions.push({id:'t1',address:'ul. X 1',priceUnit:10000,area:50,date:'2026-05-01'});
    project.photos.push({id:'f1',name:'foto.jpg',dataUrl:''});
    renderAll(); await new Promise(r=>setTimeout(r,300));
    document.querySelector('#chooseModuleBtn').click(); await new Promise(r=>setTimeout(r,300));
    const widac={blok:!document.querySelector('#szablonyBlok').classList.contains('hidden'), info:document.querySelector('#moduleZmianaInfo').classList.contains('hidden'),
      tytul:document.querySelector('#moduleSelectorOverlay h2').textContent};
    document.querySelector('#szablonNazwa').value='Lokal dla banku';
    document.querySelector('#szablonZapisz').click(); await new Promise(r=>setTimeout(r,300));
    const tekst=JSON.stringify(window.__wzorce.szablony);
    return {widac, ile:wzorceStan.szablony.length, kafelek:document.querySelector('.szablon-wybor b')?.textContent,
      adres:/Siedleckiego|Anna Nowak|GD1G|foto\\.jpg|uwaga o tej/.test(tekst), cel:/Zabezpieczenie kredytu/.test(tekst),
      stan:document.querySelector('#szablonyStan').textContent};`);
  T('„Nowy operat" otwiera okno wyboru z szablonami', szablon.widac.blok && szablon.widac.info && /rodzaj wyceny/.test(szablon.widac.tytul), szablon.widac);
  T('zapis szablonu tworzy kafelek', szablon.ile === 1 && szablon.kafelek === 'Lokal dla banku', szablon);
  T('szablon na dysku nie zawiera danych sprawy', szablon.adres === false);
  T('szablon na dysku zawiera cel wyceny', szablon.cel === true);
  T('program potwierdza zapis szablonu', /zapisany/.test(szablon.stan), szablon.stan);

  const zSzablonu = await p.ocen(`document.querySelector('[data-szablon-uzyj]').click(); await new Promise(r=>setTimeout(r,700));
    return {miasto:project.property.city, klient:project.client.name, kw:project.legal.kwLocal, tr:project.market.transactions.length, foto:project.photos.length,
      cel:project.valuation.purpose, klauzule:project.clauses, waga:project.market.features[0].weight, uwaga:project.market.features[0].ratingNote||'',
      okno:document.querySelector('#moduleSelectorOverlay').classList.contains('hidden'), karta:document.querySelector('.tab.active')?.id,
      autor:project.author.name};`);
  T('operat z szablonu jest pusty co do sprawy', zSzablonu.miasto === '' && zSzablonu.klient === '' && zSzablonu.kw === '' && zSzablonu.tr === 0 && zSzablonu.foto === 0, zSzablonu);
  T('operat z szablonu ma cel, klauzule i wagi', zSzablonu.cel === 'Zabezpieczenie kredytu' && zSzablonu.klauzule === 'Klauzula bankowa' && Number(zSzablonu.waga) === 0.35, zSzablonu);
  T('uwaga o tamtej nieruchomości nie przeszła', zSzablonu.uwaga === '');
  T('po wyborze szablonu okno się zamyka, a program otwiera operat', zSzablonu.okno && zSzablonu.karta === 'tab-project', zSzablonu);
  T('profil rzeczoznawcy trafia też do operatu z szablonu', zSzablonu.autor === 'Jan Kowalski', zSzablonu.autor);

  /* ============== 3. ZMIANA RODZAJU OPERATU */
  const zmiana = await p.ocen(`Object.assign(project.property,{city:'Gdańsk',district:'Osowa',street:'Siedleckiego',buildingNo:'9',usableArea:68});
    project.client.name='Anna Nowak'; project.legal.kwLocal='GD1G/00012345/6';
    project.market.transactions.push({id:'t1',address:'ul. X 1',priceUnit:10000,area:50,date:'2026-05-01'},{id:'t2',address:'ul. Y 2',priceUnit:11000,area:60,date:'2026-06-01'});
    project.photos.push({id:'f1',name:'foto.jpg',dataUrl:''});
    const idPrzed=project.meta.id; renderAll(); switchTab('dashboard'); await new Promise(r=>setTimeout(r,300));
    window.__pytania=[];
    document.querySelector('#changeModuleBtn').click(); await new Promise(r=>setTimeout(r,300));
    const okno={tytul:document.querySelector('#moduleSelectorOverlay h2').textContent,
      info:document.querySelector('#moduleZmianaInfo').textContent, infoWidac:!document.querySelector('#moduleZmianaInfo').classList.contains('hidden'),
      szablony:document.querySelector('#szablonyBlok').classList.contains('hidden'),
      obecny:document.querySelector('[data-module="local_kcm"]').disabled, obecnyNapis:document.querySelector('[data-module="local_kcm"] .module-status').textContent,
      nadalLokal: moduleCode()==='local_kcm'};
    document.querySelector('[data-module="developed_pairs"]').click(); await new Promise(r=>setTimeout(r,900));
    return {okno, pytanie:(window.__pytania||[])[0]||'', kod:moduleCode(), idTenSam:project.meta.id===idPrzed,
      miasto:project.property.city, ulica:project.property.street, pow:project.property.usableArea, klient:project.client.name, kw:project.legal.kwLocal,
      foto:project.photos.length, tr:project.market.transactions.length, metoda:project.valuation.methodCode, prawo:project.property.rightType,
      naglowek:project.appearance.headerText, akcent:project.appearance.accent,
      zamkniete:document.querySelector('#moduleSelectorOverlay').classList.contains('hidden')};`);
  T('„Zmień rodzaj operatu" otwiera okno ZMIANY, nie nowego operatu', /nowy rodzaj dla tego operatu/.test(zmiana.okno.tytul), zmiana.okno.tytul);
  T('okno mówi, co zostaje i co nie przejdzie', zmiana.okno.infoWidac && /Zostaje/.test(zmiana.okno.info) && /Nie przechodzi/.test(zmiana.okno.info) && /2 transakcje/.test(zmiana.okno.info), zmiana.okno.info);
  T('przy zmianie rodzaju szablony są schowane', zmiana.okno.szablony);
  T('obecny rodzaj jest oznaczony i nie da się go wybrać', zmiana.okno.obecny && /Obecny/.test(zmiana.okno.obecnyNapis), zmiana.okno.obecnyNapis);
  T('samo otwarcie okna niczego nie zmienia', zmiana.okno.nadalLokal);
  T('przed zmianą program pyta i wymienia skutki', /Zmienić rodzaj operatu/.test(zmiana.pytanie) && /ZOSTAJE/.test(zmiana.pytanie) && /NIE PRZECHODZI/.test(zmiana.pytanie), zmiana.pytanie.slice(0, 120));
  T('rodzaj operatu jest zmieniony', zmiana.kod === 'developed_pairs' && zmiana.metoda === 'pairs', zmiana.kod);
  T('to ten sam operat, nie nowy', zmiana.idTenSam);
  T('adres i powierzchnia zostały', zmiana.miasto === 'Gdańsk' && zmiana.ulica === 'Siedleckiego' && Number(zmiana.pow) === 68, zmiana);
  T('klient, księga i zdjęcia zostały', zmiana.klient === 'Anna Nowak' && zmiana.kw === 'GD1G/00012345/6' && zmiana.foto === 1, zmiana);
  T('transakcje innego rynku nie przeszły', zmiana.tr === 0, zmiana.tr);
  T('rodzaj prawa i nagłówek nazywają nowy rodzaj', /zabudowanej/.test(zmiana.prawo) && /zabudowanej/.test(zmiana.naglowek), [zmiana.prawo, zmiana.naglowek]);
  T('układ dokumentu został', zmiana.akcent === '#225577', zmiana.akcent);
  T('po zmianie okno jest zamknięte', zmiana.zamkniete);

  const odmowa = await p.ocen(`window.confirm=()=>false; const przed=moduleCode();
    await zmienRodzajOperatu('income'); await new Promise(r=>setTimeout(r,300));
    window.confirm=()=>true; return {przed, po:moduleCode(), miasto:project.property.city};`);
  T('odmowa w pytaniu zostawia operat bez zmian', odmowa.po === odmowa.przed && odmowa.miasto === 'Gdańsk', odmowa);

  const usun = await p.ocen(`switchTab('result'); await new Promise(r=>setTimeout(r,300));
    document.querySelector('[data-uklad-usun]').click(); await new Promise(r=>setTimeout(r,300));
    return {ile:wzorceStan.uklady.length, domyslny:wzorceStan.domyslnyUklad, akcent:project.appearance.accent};`);
  T('usunięcie układu zdejmuje go z listy i z „domyślnego"', usun.ile === 0 && usun.domyslny === '', usun);
  T('operat, który go używał, zachowuje swój wygląd', usun.akcent === '#225577');

  /* ============== 4. ADRES — DRUGIE ŹRÓDŁO TYLKO NA ŻĄDANIE */
  const adres = await p.ocen(`switchTab('project'); uiPrefs.mode='expert'; renderAll(); await new Promise(r=>setTimeout(r,400));
    bazaMiejscowosci=[]; window.__adresKandydaci=[]; window.__adresZapytania=[];
    window.__adresOsm=[{ulica:'Adolfa Siedleckiego',miasto:'Gdańsk',numer:'9',dzielnica:'Osowa',kod:'80-299',wojewodztwo:'pomorskie',x:NaN,y:NaN,zrodlo:'osm'}];
    project.property.city='Gdańsk'; project.property.district='';
    const ul=document.querySelector('[data-path="property.street"]');
    ul.value='Siedleckiego'; ul.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,1700));
    const w=document.getElementById(ul.id+'_wybor'); const b=w.querySelector('[data-adres-osm]');
    const przed={przycisk:!!b, napis:b?.textContent||'', widac:!w.classList.contains('hidden'),
      pytanOsm:(window.__adresZapytania||[]).filter(q=>q.zapas==='osm').length, stan:document.getElementById(ul.id+'_stan').textContent};
    b?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));
    await new Promise(r=>setTimeout(r,700));
    const q=(window.__adresZapytania||[]).filter(x=>x.zapas==='osm');
    return {przed, pytan:q.length, miastoWZapytaniu:q[0]?.miasto, stan:document.getElementById(ul.id+'_stan').textContent,
      opcje:[...w.querySelectorAll('.pole-adres-opcja b')].map(x=>x.textContent), dzielnica:project.property.district, kod:project.property.postcode||''};`);
  T('gdy rejestr nic nie zna, jest przycisk drugiego źródła', adres.przed.przycisk && adres.przed.widac && /OpenStreetMap/.test(adres.przed.napis), adres.przed);
  T('program NIE pyta OpenStreetMap sam z siebie', adres.przed.pytanOsm === 0, adres.przed.pytanOsm);
  T('po kliknięciu idzie jedno zapytanie do drugiego źródła', adres.pytan === 1, adres.pytan);
  T('zapytanie bierze miejscowość z operatu', adres.miastoWZapytaniu === 'Gdańsk', adres.miastoWZapytaniu);
  T('pokazuje ulicę znalezioną w drugim źródle', adres.opcje.some(x => /Adolfa Siedleckiego/.test(x)), adres.opcje);
  T('i mówi, skąd jest ten adres', /OpenStreetMap/.test(adres.stan), adres.stan);
  T('dzielnica i kod trafiają do operatu', adres.dzielnica === 'Osowa' && adres.kod === '80-299', adres);

  const pustyOsm = await p.ocen(`window.__adresOsm=[]; window.__adresZapytania=[];
    const ul=document.querySelector('[data-path="property.street"]');
    ul.value='Zupelnieniematakiej'; ul.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,1700));
    const w=document.getElementById(ul.id+'_wybor');
    w.querySelector('[data-adres-osm]')?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));
    await new Promise(r=>setTimeout(r,700));
    return {stan:document.getElementById(ul.id+'_stan').textContent, przycisk:!!w.querySelector('[data-adres-osm]'), wartosc:ul.value};`);
  T('gdy drugie źródło też nie zna ulicy, program mówi to wprost', /OpenStreetMap te[zż] nie zna/.test(pustyOsm.stan), pustyOsm.stan);
  T('i nie proponuje w kółko tego samego przycisku', pustyOsm.przycisk === false);
  T('to, co człowiek wpisał, zostaje w polu', pustyOsm.wartosc === 'Zupelnieniematakiej');

  T('po całym przebiegu nie ma błędów strony', (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    await p.ocen('return (window.__bledy||[]).slice(0,3);'));

  await p.zamknij();
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

'use strict';
/** OPERO — „Operat z dokumentów": księga → dane z rejestrów → transakcje → wynik i lista braków. */
const { Przegladarka } = require('./przegladarka');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };

const NAGL = 'TREŚĆ KSIĘGI WIECZYSTEJ NR GD1G/00380276/5, STAN Z DNIA 2026-11-13 18:57\nprowadzonej przez SĄD REJONOWY GDAŃSK-PÓŁNOC W GDAŃSKU, III WYDZIAŁ KSIĄG WIECZYSTYCH - GD1G\nLOKAL STANOWIĄCY ODRĘBNĄ NIERUCHOMOŚĆ\nDział I-O\tDział I-Sp\tDział II\tDział III\tDział IV\n';
const IO = NAGL + 'DZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI\nPołożenie (numer porządkowy / województwo, powiat, gmina, miejscowość)\tLp. 1.\t1\tPOMORSKIE, M. GDAŃSK, GDAŃSK M., GDAŃSK\t2, 3\nUlica\tNumer budynku\tNumer lokalu\tIKARA\t97\t2\nIdentyfikator lokalu\t226101_1.0003.1172_BUD.2_LOK\nPrzeznaczenie lokalu\tLOKAL MIESZKALNY\nOpis lokalu (rodzaj izby - liczba)\tPOKÓJ Z ANEKSEM KUCHENNYM - 1, ŁAZIENKA - 2, POKÓJ - 3\nKondygnacja\t1\nPrzyłączenie - numer księgi wieczystej (nieruchomość, z której wyodrębniono lokal)\tLp. 1.\tGD1G / 00374430 / 8\nPole powierzchni użytkowej lokalu wraz z powierzchnią pomieszczeń przynależnych\t113,7300 M2\n';
const RESZTA = NAGL + 'DZIAŁ I-SP - SPIS PRAW ZWIĄZANYCH Z WŁASNOŚCIĄ\nWielkość udziału w nieruchomości wspólnej, którą stanowi grunt oraz części budynku\tLp. 1.\t11373/276845\t2\n'
  + 'DZIAŁ II - WŁASNOŚĆ\nOsoba fizyczna (Imię pierwsze, imię drugie, nazwisko, imię ojca, imię matki, PESEL)\tLp. 1.\tJAN, ADAM, KOWALSKI, STANISŁAW, MARIA, 80010112345\t2\n'
  + 'DZIAŁ III - PRAWA, ROSZCZENIA I OGRANICZENIA\nBRAK WPISÓW\nDZIAŁ IV - HIPOTEKA\nBRAK WPISÓW\n';

(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — operat z dokumentów (widok)\n');
  await p.pauza(1800);
  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0, await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.__pytania=[]; window.confirm=(t)=>{window.__pytania.push(String(t));return true;}; document.body.classList.add('motion-reduced');
    uiPrefs.mode='expert'; switchTab('project'); renderAll(); await new Promise(r=>setTimeout(r,500)); return 1;`);
  const start = await p.ocen(`const k=document.querySelector('#szybkiKarta'); const r=k?.getBoundingClientRect();
    return {jest:!!k, widac:r&&r.width>300, kroki:document.querySelectorAll('.szybki-krok').length, modul:!!window.OperoEkw};`);
  T('pełny operat ZACZYNA SIĘ od karty „Operat z dokumentów" (cztery kroki)', start.jest && start.widac && start.kroki === 4 && start.modul, start);
  const miejsce = await p.ocen(`const k=document.querySelector('#szybkiKarta'), sek=document.querySelector('#tab-project');
    const pierwszePole=sek.querySelector('[data-path="author.name"]');
    await createProjectFromModule('local_kcm'); await new Promise(r=>setTimeout(r,500));
    return {wOperacie: sek.contains(k), naStarcie: !!document.querySelector('#tab-dashboard #szybkiKarta'),
      przedPolami: !!(k.compareDocumentPosition(pierwszePole) & Node.DOCUMENT_POSITION_FOLLOWING),
      poNowym: document.querySelector('.tab.active')?.id, krok: wizardIndex};`);
  T('karta stoi w pierwszym kroku operatu, przed polami, a nie na ekranie Start', miejsce.wOperacie && !miejsce.naStarcie && miejsce.przedPolami, miejsce);
  T('nowy operat otwiera się na tym kroku', miejsce.poNowym === 'tab-project' && miejsce.krok === 0, miejsce);

  /* ============== 1. KSIĘGA */
  const pusto = await p.ocen(`document.querySelector('#szybkiKwBtn').click(); await new Promise(r=>setTimeout(r,200));
    return {tekst:document.querySelector('#szybkiKwWynik').textContent, kw:project.legal.kwLocal};`);
  T('pusty przycisk mówi, jak skopiować księgę', /Ctrl\+A/.test(pusto.tekst) && !pusto.kw, pusto.tekst);
  const smieci = await p.ocen(`document.querySelector('#szybkiKwTekst').value='Dzień dobry, w załączeniu przesyłam zdjęcia mieszkania i proszę o wycenę.';
    document.querySelector('#szybkiKwBtn').click(); await new Promise(r=>setTimeout(r,200));
    return {tekst:document.querySelector('#szybkiKwWynik').textContent, kw:project.legal.kwLocal};`);
  T('tekst, który nie jest księgą, niczego nie wpisuje', /nie widzę księgi/.test(smieci.tekst) && !smieci.kw, smieci.tekst);

  const io = await p.ocen(`document.querySelector('#szybkiKwTekst').value=${JSON.stringify(IO)};
    document.querySelector('#szybkiKwBtn').click(); await new Promise(r=>setTimeout(r,500));
    const pr=project.property, l=project.legal;
    return {kw:l.kwLocal, sad:l.court, data:project.valuation.legalStateDate, miasto:pr.city, ulica:pr.street, bud:pr.buildingNo, lok:pr.localNo, pietro:pr.floor, pokoje:pr.rooms,
      kwArea:pr.kwArea, pow:pr.usableArea, wspolna:l.kwCommon, izby:l.ioRooms, woj:pr.voivodeship,
      tekst:document.querySelector('#szybkiKwWynik').textContent, stan:document.querySelector('#szybkiStanKw').textContent,
      chipy:[...document.querySelectorAll('#szybkiDzialy .ok')].length, pole:document.querySelector('#szybkiKwTekst').value,
      zrodlo:(project.sources||[])[0]||'', wPolu:document.querySelector('[data-path="property.street"]')?.value};`);
  T('numer księgi, sąd i data badania są w operacie', io.kw === 'GD1G/00380276/5' && /Gdańsk-Północ/.test(io.sad) && io.data === '2026-11-13 18:57', [io.kw, io.sad, io.data]);
  T('adres z działu I-O jest w operacie', io.miasto === 'Gdańsk' && io.ulica === 'Ikara' && io.bud === '97' && io.lok === '2' && io.woj === 'pomorskie', io);
  T('kondygnacja, pokoje i powierzchnia według księgi', String(io.pietro) === '1' && Number(io.pokoje) === 4 && Number(io.kwArea) === 113.73, [io.pietro, io.pokoje, io.kwArea]);
  T('powierzchnia użytkowa startuje od księgi, z zastrzeżeniem', Number(io.pow) === 113.73 && /potwierdź pomiarem/.test(io.tekst));
  T('księga nieruchomości wspólnej i opis izb', io.wspolna === 'GD1G/00374430/8' && /pokój – 3/.test(io.izby), [io.wspolna, io.izby]);
  T('program mówi, których działów brakuje', /Wklej jeszcze:\s*I-Sp, II, III, IV/.test(io.tekst) && /1 z 5/.test(io.stan) && io.chipy === 1, [io.stan, io.chipy]);
  T('pole do wklejania czyści się po odczycie', io.pole === '');
  T('EKW trafia do źródeł operatu z datą badania', /Elektroniczne Księgi Wieczyste/.test(io.zrodlo) && /2026-11-13/.test(io.zrodlo), io.zrodlo);
  T('dane widać w polach operatu', io.wPolu === 'Ikara', io.wPolu);

  const reszta = await p.ocen(`document.querySelector('#szybkiKwTekst').value=${JSON.stringify(RESZTA)};
    document.querySelector('#szybkiKwBtn').click(); await new Promise(r=>setTimeout(r,500));
    const l=project.legal;
    return {udzial:l.commonShare, wl:l.ownerNames, iii:l.sectionIII, iv:l.sectionIV, ulica:project.property.street,
      tekst:document.querySelector('#szybkiKwWynik').textContent, stan:document.querySelector('#szybkiStanKw').textContent,
      chipy:[...document.querySelectorAll('#szybkiDzialy .ok')].length, pesel:JSON.stringify(project.legal).includes('80010112345') && !JSON.stringify(project.legal.ekwImport).includes('x')};`);
  T('kolejne działy wklejone osobno dopełniają księgę', reszta.udzial === '11373/276845' && reszta.wl === 'Jan Adam Kowalski' && reszta.iii === 'Brak wpisów.' && reszta.iv === 'Brak wpisów.', reszta);
  T('dane z pierwszego wklejenia zostają', reszta.ulica === 'Ikara');
  T('komplet pięciu działów jest potwierdzony', /Mam wszystkie pięć działów/.test(reszta.tekst) && reszta.stan === 'komplet' && reszta.chipy === 5, [reszta.stan, reszta.chipy]);
  const pesel = await p.ocen(`const l=JSON.parse(JSON.stringify(project.legal)); delete l.ekwImport; return JSON.stringify(l).includes('80010112345');`);
  T('PESEL nie trafia do pól operatu', pesel === false);

  const reczne = await p.ocen(`project.property.buildingNo='97A'; renderAll();
    document.querySelector('#szybkiKwTekst').value=${JSON.stringify(IO)};
    document.querySelector('#szybkiKwBtn').click(); await new Promise(r=>setTimeout(r,400));
    return {bud:project.property.buildingNo, tekst:document.querySelector('#szybkiKwWynik').textContent};`);
  T('ręcznie zmienionego pola księga nie nadpisuje — program pokazuje różnicę', reczne.bud === '97A' && /nie nadpisałem/.test(reczne.tekst) && /numer budynku: w operacie „97A", w księdze „97"/.test(reczne.tekst), reczne.tekst.slice(0, 400));

  const inna = await p.ocen(`window.__pytania=[]; window.confirm=(t)=>{window.__pytania.push(String(t));return false;};
    document.querySelector('#szybkiKwTekst').value=${JSON.stringify(IO)}.replace('GD1G/00380276/5','GD1G/00999999/1');
    document.querySelector('#szybkiKwBtn').click(); await new Promise(r=>setTimeout(r,300));
    window.confirm=()=>true; return {pyt:(window.__pytania||[])[0]||'', kw:project.legal.kwLocal};`);
  T('treść innej księgi wymaga potwierdzenia i bez niego nic nie zmienia', /GD1G\/00380276\/5/.test(inna.pyt) && /GD1G\/00999999\/1/.test(inna.pyt) && inna.kw === 'GD1G/00380276/5', inna);

  /* ============== 1b. KSIĘGA ZE ZRZUTÓW EKRANU */
  const zrz = await p.ocen(`const s=(t,x,y,w,h)=>({t,x,y,w:w||t.length*9,h:h||16});
    const stan=JSON.stringify(project);
    project.legal.kwLocal=''; project.legal.kwCommon=''; project.property.street=''; project.property.buildingNo=''; project.property.localNo=''; project.property.floor=''; project.property.rooms=0; project.property.kwArea=0; project.property.usableArea=0;
    project.legal.ekwImport={rawText:'',sections:{IO:'',ISP:'',II:'',III:'',IV:''}};
    const fot=project.photos.length;
    window.__ocrOdp={canceled:false,zrzuty:[{nazwa:'kw-1.png',ok:true,jezyk:'pl',zdjecie:{name:'kw-1.png',dataUrl:'data:image/png;base64,AAAA',size:10,originalSize:10},slowa:[
      s('TREŚĆ',300,5),s('KSIĘGI',360,5),s('WIECZYSTEJ',425,5),s('NR',525,5),s('GD1G/00380276/5,',550,5),s('STAN',700,5),s('Z',745,5),s('DNIA',760,5),s('2026-11-13',805,5),s('18:57',905,5),
      s('DZIAL',600,45),s('I-0',660,45),s('-',695,45),s('OZNACZENIE',710,45),s('NIERUCHOMOSCI',815,45),
      s('Ulica',10,85),s('Numer',150,85),s('budynku',205,85),s('Numer',420,85),s('lokalu',475,85),s('IKARA',760,85),s('97',1180,85),s('2',1350,85),
      s('Opis',10,125),s('lokalu',50,125),s('POKÓJ',760,125),s('-',815,125),s('3',830,125),
      s('Kondygnacja',10,165),s('EHNNNNEN',760,165),
      s('Pole',10,205),s('powierzchni',50,205),s('użytkowej',160,205),s('113,7300',760,205),s('M2',840,205)]},
      {nazwa:'kw-2.png',ok:false,powod:'Zrzut jest za duży dla silnika rozpoznawania pisma.'}]};
    document.querySelector('#szybkiKwZrzuty').click(); await new Promise(r=>setTimeout(r,700));
    const w={kw:project.legal.kwLocal, ulica:project.property.street, bud:project.property.buildingNo, lok:project.property.localNo, pietro:project.property.floor,
      pokoje:project.property.rooms, kwArea:project.property.kwArea, pow:project.property.usableArea,
      tekst:document.querySelector('#szybkiKwWynik').textContent, zdj:project.photos.length-fot, rodzaj:project.photos[project.photos.length-1]?.rodzajDokumentu,
      guzik:document.querySelector('#szybkiKwZrzuty').disabled};
    return w;`);
  T('ze zrzutu wchodzą numer księgi (po kontroli cyfry) i adres', zrz.kw === 'GD1G/00380276/5' && zrz.ulica === 'Ikara' && zrz.bud === '97' && zrz.lok === '2', zrz);
  T('nieczytelna kondygnacja NIE wchodzi do operatu', !zrz.pietro, zrz.pietro);
  // 3.0: liczba ze zrzutu wchodzi tylko po kontroli postaci. Powierzchnia w zapisie EKW
  // („113,7300 M2") przechodzi; liczba pokoi z jednej pozycji opisu izb – nie.
  T('powierzchnia w zapisie EKW wchodzi, pokoje z niepełnego opisu izb nie', !Number(zrz.pokoje) && Number(zrz.kwArea) === 113.73, [zrz.pokoje, zrz.kwArea, zrz.pow]);
  T('raport wymienia to, czego nie wpisał, z odczytaną wartością', /NIE wpisałem sam/.test(zrz.tekst) && /(liczba pokoi|opis izb): odczytano/.test(zrz.tekst), zrz.tekst.slice(0, 700));
  T('raport ostrzega o pomyłkach rozpoznawania i potwierdza cyfrę kontrolną', /porównaj każdą liczbę z księgą/.test(zrz.tekst) && /przeszedł kontrolę cyfry kontrolnej/.test(zrz.tekst));
  T('zrzut, którego nie dało się odczytać, jest wymieniony z przyczyną', /kw-2\.png: Zrzut jest za duży/.test(zrz.tekst));
  T('odczytany tekst można obejrzeć', /Pokaż tekst odczytany ze zrzutów/.test(zrz.tekst));
  T('zrzut trafia do operatu jako dokument księgi', zrz.zdj === 1 && zrz.rodzaj === 'kw' && zrz.guzik === false, [zrz.zdj, zrz.rodzaj]);

  const zlaCyfra = await p.ocen(`const s=(t,x,y)=>({t,x,y,w:t.length*9,h:16});
    project.legal.kwLocal=''; project.legal.ekwImport={rawText:'',sections:{IO:'',ISP:'',II:'',III:'',IV:''}};
    window.__ocrOdp={canceled:false,zrzuty:[{nazwa:'kw.png',ok:true,slowa:[
      s('TREŚĆ',300,5),s('KSIĘGI',360,5),s('WIECZYSTEJ',425,5),s('NR',525,5),s('GD1G/00380278/5,',550,5),s('STAN',700,5),s('Z',745,5),s('DNIA',760,5),s('2026-11-13',805,5),
      s('DZIAŁ',600,45),s('I-O',660,45),s('-',695,45),s('OZNACZENIE',710,45),s('NIERUCHOMOŚCI',815,45),s('Kondygnacja',10,85),s('1',760,85)]}]};
    await szybkiKwZeZrzutow(); await new Promise(r=>setTimeout(r,400));
    return {kw:project.legal.kwLocal, tekst:document.querySelector('#szybkiKwWynik').textContent};`);
  T('numer księgi z pomyloną cyfrą NIE wchodzi do operatu', zlaCyfra.kw === '' && /nie przechodzi kontroli cyfry kontrolnej/.test(zlaCyfra.tekst), zlaCyfra);

  const brakSilnika = await p.ocen(`window.__ocrOdp={canceled:false,zrzuty:[{nazwa:'kw.png',ok:false,powod:'Windows nie ma zainstalowanego rozpoznawania pisma dla języka polskiego.'}]};
    await szybkiKwZeZrzutow(); await new Promise(r=>setTimeout(r,300));
    return document.querySelector('#szybkiKwWynik').textContent;`);
  T('brak silnika w systemie: program mówi, co zrobić, i podaje drugą drogę', /Nie odczytałem zrzutów/.test(brakSilnika) && /rozpoznawania pisma dla języka polskiego/.test(brakSilnika) && /Ctrl\+A/.test(brakSilnika), brakSilnika);
  await p.ocen(`window.__ocrOdp={canceled:true,zrzuty:[]};
    Object.assign(project.property,{street:'Ikara',buildingNo:'97',localNo:'2',floor:'1',rooms:4,kwArea:113.73,usableArea:113.73,city:'Gdańsk'});
    project.legal.kwLocal='GD1G/00380276/5'; renderAll(); return 1;`);

  /* ============== 2. CENA OFERTOWA */
  const cena = await p.ocen(`const c=document.querySelector('#szybkiCena'); c.value='1 250 000 zł'; c.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,200));
    return {cena:project.property.askingPrice, stan:document.querySelector('#szybkiStanDok').textContent, pole:c.value};`);
  T('cena ofertowa jest czytana z napisu z odstępami', cena.cena === 1250000 && /1[\s ]250[\s ]000 zł/.test(cena.stan), cena);

  /* ============== 3. AUTOMAT */
  const auto = await p.ocen(`project.property.buildingNo='97';
    window.__dzialkaOdp={ok:true,punkt:{x:470000,y:720000},punkty:[],dzialki:[{id:'226101_1.0003.55/7',numer:'55/7',obreb:'Osowa',gmina:'Gdańsk',powiat:'Gdańsk',wojewodztwo:'pomorskie'}]};
    window.__otoOdp={ok:true,bledy:[],punkt:{lat:54.4305,lon:18.4712,skad:'OpenStreetMap',dokladny:true},
      otoczenie:{ok:true,ile:2,kategorie:{autobus:{id:'autobus',pole:'transport',jeden:'przystanek autobusowy',ile:1,najblizszy:{nazwa:'Ikara',odl:180}},las:{id:'las',pole:'recreation',jeden:'las',ile:1,najblizszy:{nazwa:'',odl:600}}}},
      mpzp:{ok:true,jest:false,powod:'Krajowa integracja planów nie pokazuje planu pod tym punktem.'}};
    window.__otoZapytanie=null;
    document.querySelector('#szybkiAutoBtn').click(); await new Promise(r=>setTimeout(r,2500));
    const okno=document.querySelector('#szukOverlay');
    const wynik={q:window.__otoZapytanie, dz:project.egib.plotNo, obreb:project.egib.district, opis:project.location.description,
      tekst:document.querySelector('#szybkiAutoWynik').textContent, okno:okno&&!okno.classList.contains('hidden'),
      ulicaWSzukaniu:document.querySelector('#szukUlica')?.value, guzik:document.querySelector('#szybkiAutoBtn').disabled};
    szukZamknij(); await new Promise(r=>setTimeout(r,300));
    wynik.stanPo=document.querySelector('#szybkiStanAuto').textContent; return wynik;`);
  T('automat pyta o adres odczytany z księgi', auto.q && auto.q.ulica === 'Ikara' && auto.q.numer === '97' && auto.q.miasto === 'Gdańsk', auto.q);
  // Działkę daje już identyfikator lokalu z księgi – ewidencja jej nie nadpisuje.
  T('działka z identyfikatora lokalu w księdze zostaje, ewidencja jej nie nadpisuje', auto.dz === '1172' && !!auto.obreb, [auto.dz, auto.obreb]);
  T('opis lokalizacji jest napisany z mapy', /przystanek autobusowy „Ikara"/.test(auto.opis), auto.opis);
  T('raport mówi, co zebrano i czego nie udało się ustalić', /Zebrane i wpisane/.test(auto.tekst) && /Czego nie udało się ustalić/.test(auto.tekst) && /nie pokazuje planu/.test(auto.tekst), auto.tekst.slice(0, 500));
  T('po zebraniu danych otwiera się szukanie transakcji z kryteriami z księgi', auto.okno === true && auto.ulicaWSzukaniu === 'Ikara', [auto.okno, auto.ulicaWSzukaniu]);
  T('po zamknięciu okna krok 3 pokazuje stan transakcji', /transakcji|brak transakcji/.test(auto.stanPo) && auto.guzik === false, auto.stanPo);

  const bezAdresu = await p.ocen(`const stare={c:project.property.city,s:project.property.street}; project.property.city=''; project.property.street='';
    window.__otoZapytanie=null; await szybkiAutomat(); await new Promise(r=>setTimeout(r,200));
    const w={tekst:document.querySelector('#szybkiAutoWynik').textContent, pytano:window.__otoZapytanie};
    project.property.city=stare.c; project.property.street=stare.s; return w;`);
  T('bez adresu automat odsyła do księgi i nie pyta źródeł', /Nie znam jeszcze adresu/.test(bezAdresu.tekst) && bezAdresu.pytano === null, bezAdresu);

  /* ============== 4. FINAŁ */
  const fin = await p.ocen(`window.__perBlad=''; window.__perTeksty={};
    document.querySelector('#szybkiFinalBtn').click();
    for(let i=0;i<80;i++){ await new Promise(r=>setTimeout(r,150)); if(!document.querySelector('#szybkiFinalBtn').disabled) break; }
    await new Promise(r=>setTimeout(r,2600));
    const box=document.querySelector('#szybkiFinalWynik');
    return {tekst:box.textContent, stan:box.dataset.stan, chip:document.querySelector('#szybkiStanFinal').textContent,
      kafle:box.querySelectorAll('.szybki-liczby > div').length, braki:box.querySelectorAll('.automat-uwagi li').length,
      guzik:document.querySelector('#szybkiFinalBtn').disabled, bledy:(window.__bledy||[]).slice(0,3)};`);
  T('podsumowanie pokazuje wartość, transakcje, opisy i cenę ofertową', fin.kafle === 4 && /Wartość rynkowa/.test(fin.tekst) && /Cena ofertowa/.test(fin.tekst) && /1[\s ]250[\s ]000 zł/.test(fin.tekst), fin.tekst.slice(0, 300));
  T('bez transakcji program nie udaje wyniku — wskazuje braki', fin.braki > 0 && /Do uzupełnienia przed podpisem \(\d+\)/.test(fin.tekst) && fin.stan === 'uwaga' && /do uzupełnienia/.test(fin.chip), [fin.braki, fin.chip]);
  T('podsumowanie przypomina, że to projekt do poprawek i podpisu', /To jest projekt operatu/.test(fin.tekst) && /Podpisujesz go Ty/.test(fin.tekst));
  T('po zakończeniu przycisk jest czynny i nie ma błędów strony', fin.guzik === false && fin.bledy.length === 0, fin.bledy);

  const doOp = await p.ocen(`switchTab('result'); document.querySelector('#szybkiDoOperatu').click(); await new Promise(r=>setTimeout(r,300)); return document.querySelector('.tab.active')?.id;`);
  T('„Otwórz operat do poprawek" prowadzi do operatu', doOp === 'tab-project', doOp);

  await p.zamknij();
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

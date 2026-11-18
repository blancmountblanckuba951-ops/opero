'use strict';
/**
 * OPERO — automat w uruchomionym programie:
 *   1. „Zbierz dane automatycznie" wpisuje działkę, otoczenie, plan i opis.
 *   2. Nie nadpisuje tego, co człowiek wpisał sam, i mówi, czego nie znalazł.
 *   3. „Zredaguj (PER)" na pustym polu PISZE tekst z danych operatu.
 *   4. Poprawki z zrzutów: przycisk PER pod polem, komunikat cały w oknie.
 */
const { Przegladarka } = require('./przegladarka');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };

const OTO = { ok: true, kiedy: '2026-11-13T10:00:00Z', bledy: [],
  punkt: { lat: 54.4305, lon: 18.4712, skad: 'OpenStreetMap', dokladny: true },
  otoczenie: { ok: true, ile: 5, kategorie: {
    autobus: { id: 'autobus', pole: 'transport', jeden: 'przystanek autobusowy', ile: 2, najblizszy: { nazwa: 'Osowa PKP', odl: 222 } },
    kolej: { id: 'kolej', pole: 'transport', jeden: 'stacja kolejowa', ile: 1, najblizszy: { nazwa: 'Gdańsk Osowa', odl: 520 } },
    szkola: { id: 'szkola', pole: 'services', jeden: 'szkoła', ile: 1, najblizszy: { nazwa: 'Szkoła Podstawowa nr 81', odl: 340 } },
    sklep: { id: 'sklep', pole: 'services', jeden: 'sklep spożywczy', ile: 3, najblizszy: { nazwa: 'Biedronka', odl: 190 } },
    las: { id: 'las', pole: 'recreation', jeden: 'las', ile: 1, najblizszy: { nazwa: 'Trójmiejski Park Krajobrazowy', odl: 930 } },
  } },
  mpzp: { ok: true, jest: true, nazwa: 'MPZP Osowa rejon ulicy Siedleckiego', uchwala: 'Uchwała Nr XL/1234/2021 Rady Miasta Gdańska', link: 'https://bip.gdansk.pl/plany/1234', tekst: 'Tytuł | MPZP Osowa' } };
const DZIALKA = { ok: true, punkt: { x: 470000, y: 720000 }, punkty: [{ x: 470000, y: 720000 }],
  dzialki: [{ id: '226101_1.0010.123/4', numer: '123/4', obreb: 'Osowa', gmina: 'Gdańsk', powiat: 'Gdańsk', wojewodztwo: 'pomorskie' }] };

(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — automat i PER piszący pola (widok)\n');
  await p.pauza(1800);
  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0, await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=()=>true; document.body.classList.add('motion-reduced');
    uiPrefs.mode='expert'; switchTab('project'); renderAll(); await new Promise(r=>setTimeout(r,500)); return 1;`);
  T('moduł automatu jest wpięty', await p.ocen('return Boolean(window.OperoOtoczenie && document.querySelector("#automatBtn"));'));

  /* ============== 1. BEZ ADRESU */
  const bezAdresu = await p.ocen(`window.__otoZapytanie=null; await automatZbierz(); await new Promise(r=>setTimeout(r,200));
    return {tekst:document.querySelector('#automatWynik').textContent, pytano:window.__otoZapytanie};`);
  T('bez adresu automat prosi o miejscowość i ulicę', /miejscowość i ulicę/.test(bezAdresu.tekst), bezAdresu.tekst);
  T('i nie wysyła żadnego zapytania', bezAdresu.pytano === null);

  /* ============== 2. PEŁNY PRZEBIEG */
  const pelny = await p.ocen(`window.__otoOdp=${JSON.stringify(OTO)}; window.__dzialkaOdp=${JSON.stringify(DZIALKA)};
    Object.assign(project.property,{city:'Gdańsk',district:'Osowa',street:'Siedleckiego',buildingNo:'9'});
    project.location.services='Sklep osiedlowy na parterze — widziałem na oględzinach';
    renderAll(); await new Promise(r=>setTimeout(r,300));
    document.querySelector('#automatBtn').click(); await new Promise(r=>setTimeout(r,900));
    const w=document.querySelector('#automatWynik');
    return {q:window.__otoZapytanie, e:project.egib, l:{t:project.location.transport,s:project.location.services,r:project.location.recreation,d:project.location.description,lat:project.location.latitude,lon:project.location.longitude},
      pl:{n:project.planning.planName,u:project.planning.resolution,z:project.planning.sourceUrl,sym:project.planning.zoneSymbol||'',prz:project.planning.designation||''},
      powiat:project.property.county, punkt:project.property.punkt, tekst:w.textContent, stan:w.dataset.stan, widac:!w.classList.contains('hidden'),
      guzik:document.querySelector('#automatBtn').disabled, pole:document.querySelector('[data-path="location.description"]').value};`);
  T('zapytanie niesie tylko adres', pelny.q && pelny.q.miasto === 'Gdańsk' && pelny.q.ulica === 'Siedleckiego' && pelny.q.numer === '9' && Object.keys(pelny.q).every(k => ['ulica', 'numer', 'miasto', 'lat', 'lon'].includes(k)), pelny.q);
  T('numer i identyfikator działki są wpisane', pelny.e.plotNo === '123/4' && pelny.e.plotId === '226101_1.0010.123/4', pelny.e);
  T('obręb i jednostka ewidencyjna są wpisane', pelny.e.district === 'Osowa' && pelny.e.unit === 'Gdańsk', pelny.e);
  T('powiat i punkt do doboru transakcji są zapamiętane', pelny.powiat === 'Gdańsk' && pelny.punkt && pelny.punkt.x === 470000, [pelny.powiat, pelny.punkt]);
  T('komunikacja: przystanek i stacja z odległościami', /Osowa PKP" — ok\. 200 m/.test(pelny.l.t) && /Gdańsk Osowa" — ok\. 500 m/.test(pelny.l.t), pelny.l.t);
  T('zieleń: las z nazwą', /Trójmiejski Park Krajobrazowy/.test(pelny.l.r), pelny.l.r);
  T('tego, co człowiek wpisał sam, automat NIE nadpisał', /widziałem na oględzinach/.test(pelny.l.s) && !/Biedronka/.test(pelny.l.s), pelny.l.s);
  T('opis lokalizacji jest napisany i widać go w polu', /^Nieruchomość położona jest pod adresem: ul\. Siedleckiego 9/.test(pelny.l.d) && pelny.pole === pelny.l.d, pelny.l.d.slice(0, 90));
  T('opis podaje źródło i zastrzeżenie o linii prostej', /OpenStreetMap/.test(pelny.l.d) && /w linii prostej/.test(pelny.l.d));
  T('współrzędne trafiają do operatu', pelny.l.lat === '54.4305' && pelny.l.lon === '18.4712', [pelny.l.lat, pelny.l.lon]);
  T('nazwa planu, uchwała i źródło są wpisane', /MPZP Osowa/.test(pelny.pl.n) && /XL\/1234\/2021/.test(pelny.pl.u) && /bip\.gdansk/.test(pelny.pl.z), pelny.pl);
  T('symbol terenu i przeznaczenie zostają puste — program ich nie zgaduje', pelny.pl.sym === '' && pelny.pl.prz === '');
  T('raport mówi, co wpisał', pelny.widac && pelny.stan === 'sukces' && /Wpisałem do operatu \(\d+\)/.test(pelny.tekst) && /numer działki/.test(pelny.tekst), pelny.tekst.slice(0, 160));
  T('raport pokazuje, co jest w otoczeniu', /przystanek autobusowy „Osowa PKP"/.test(pelny.tekst));
  T('raport mówi, czego mapa nie pokazuje', /Mapa nie pokazuje w pobliżu:.*przystanek tramwajowy/.test(pelny.tekst));
  T('raport mówi, czego nie nadpisał', /Nie nadpisałem tego, co wpisałeś sam: usługi w otoczeniu/.test(pelny.tekst), pelny.tekst);
  T('raport każe odczytać symbol terenu z rysunku planu', /symbol terenu i przeznaczenie odczytaj/.test(pelny.tekst));
  T('raport podaje źródła', /Źródła:.*ULDK.*OpenStreetMap.*Krajowa Integracja/.test(pelny.tekst), pelny.tekst.slice(-420));
  T('raport mówi, czego program nie ustala z internetu', /dostępu do drogi publicznej, klasy energetycznej/.test(pelny.tekst));
  T('po zakończeniu przycisk jest znów czynny', pelny.guzik === false);

  /* ============== 3. DRUGI PRZEBIEG NICZEGO NIE PSUJE */
  const drugi = await p.ocen(`project.egib.plotNo='999/9'; const opis=project.location.description;
    await automatZbierz(); await new Promise(r=>setTimeout(r,300));
    return {nr:project.egib.plotNo, tenSam:project.location.description===opis, tekst:document.querySelector('#automatWynik').textContent};`);
  T('ręcznie poprawiony numer działki zostaje', drugi.nr === '999/9');
  T('opis nie jest dopisywany drugi raz', drugi.tenSam);
  T('raport mówi o nienadpisanym numerze', /Nie nadpisałem.*numer działki/.test(drugi.tekst), drugi.tekst.slice(0, 300));

  /* ============== 4. KILKA DZIAŁEK, BRAK PLANU, BŁĄD USŁUGI */
  const trudny = await p.ocen(`project.egib={unit:'',district:'',plotNo:'',plotId:'',plotArea:'',buildingId:'',notes:''};
    project.planning.planName=''; project.planning.resolution=''; project.planning.sourceUrl='';
    window.__dzialkaOdp={ok:true,punkty:[],dzialki:[{id:'a',numer:'10/1',obreb:'O'},{id:'b',numer:'10/2',obreb:'O'}]};
    window.__otoOdp={ok:true,bledy:['Mapa otoczenia nie odpowiedziala (przekroczono czas).'],punkt:{lat:54.43,lon:18.47,skad:'OpenStreetMap',dokladny:false},otoczenie:null,
      mpzp:{ok:true,jest:false,powod:'Krajowa integracja planów nie pokazuje planu pod tym punktem. To nie przesądza, że planu nie ma.'}};
    await automatZbierz(); await new Promise(r=>setTimeout(r,300));
    return {nr:project.egib.plotNo, plan:project.planning.planName, tekst:document.querySelector('#automatWynik').textContent};`);
  T('przy dwóch działkach numer NIE jest wpisywany', trudny.nr === '', trudny.nr);
  T('i program wymienia obie do wyboru', /2 działki \(10\/1, 10\/2\)/.test(trudny.tekst), trudny.tekst.slice(0, 400));
  T('błąd mapy jest pokazany, a nie przemilczany', /Mapa otoczenia nie odpowiedziala/.test(trudny.tekst));
  T('przybliżone położenie jest zgłoszone', /położenie przyjęto dla ulicy/.test(trudny.tekst));
  T('brak planu w usłudze nie jest podany jako „planu nie ma"', /nie przesądza/.test(trudny.tekst) && trudny.plan === '');

  const awaria = await p.ocen(`window.__otoBlad='Brak połączenia z internetem'; window.__dzialkaOdp={ok:false,dzialki:[],punkty:[],powod:'Geokoder GUGiK nie odpowiada'};
    await automatZbierz(); await new Promise(r=>setTimeout(r,300)); window.__otoBlad='';
    return {tekst:document.querySelector('#automatWynik').textContent, stan:document.querySelector('#automatWynik').dataset.stan, guzik:document.querySelector('#automatBtn').disabled,
      bledy:(window.__bledy||[]).length};`);
  T('gdy nic nie odpowiada, program mówi to i działa dalej', /Brak połączenia z internetem/.test(awaria.tekst) && /Geokoder GUGiK nie odpowiada/.test(awaria.tekst) && awaria.stan === 'uwaga' && !awaria.guzik && awaria.bledy === 0, awaria);

  /* ============== 5. PER PISZE PUSTE POLE */
  const per = await p.ocen(`window.__perPolecenia=[]; window.__perBlad='';
    window.__perTeksty={'planning.description':'Dla terenu obowiązuje plan MPZP Osowa rejon ulicy Siedleckiego, przyjęty uchwałą Nr XL/1234/2021.'};
    project.planning.planName='MPZP Osowa rejon ulicy Siedleckiego'; project.planning.resolution='Uchwała Nr XL/1234/2021 Rady Miasta Gdańska';
    project.planning.designation='zabudowa mieszkaniowa wielorodzinna'; project.planning.description=''; renderAll(); await new Promise(r=>setTimeout(r,300));
    const b=document.querySelector('[data-per-target="planning.description"]'); b.click(); await new Promise(r=>setTimeout(r,600));
    const pol=(window.__perPolecenia||[])[0]||{};
    return {ile:(window.__perPolecenia||[]).length, prompt:pol.prompt||'', rozdzial:pol.rozdzial, tekst:project.planning.description,
      pole:document.querySelector('[data-path="planning.description"]').value, status:document.querySelector('#statusBar').textContent, napis:b.textContent, czynny:!b.disabled};`);
  T('klik na pustym polu wysyła polecenie do modelu', per.ile === 1 && per.rozdzial === 'planning.description', per.ile);
  T('polecenie zawiera dane z rubryk tej części operatu', /Nazwa planu: MPZP Osowa/.test(per.prompt) && /Przeznaczenie terenu: zabudowa mieszkaniowa/.test(per.prompt) && /adres: ul\. Siedleckiego 9/.test(per.prompt), per.prompt.slice(-500));
  T('polecenie zabrania dopisywania czegokolwiek spoza faktów', /wyłącznie na podstawie FAKTÓW/.test(per.prompt) && /\[DO UZUPEŁNIENIA\]/.test(per.prompt));
  T('tekst trafia do operatu i do pola', /plan MPZP Osowa/.test(per.tekst) && per.pole === per.tekst, per.tekst);
  T('program mówi, z ilu danych napisał tekst', /PER napisał „Gotowy opis planistyczny do operatu" z \d+ danych/.test(per.status), per.status);
  T('przycisk wraca do zwykłego napisu', /Zredaguj/.test(per.napis) && per.czynny);

  const obca = await p.ocen(`window.__perPolecenia=[]; project.planning.description='';
    window.__perTeksty={'planning.description':'Plan dopuszcza zabudowę do 18 m wysokości i intensywność 1,45.'};
    renderAll(); await new Promise(r=>setTimeout(r,200));
    document.querySelector('[data-per-target="planning.description"]').click(); await new Promise(r=>setTimeout(r,600));
    const okno=document.querySelector('#perRedakcja');
    const wynik={wOperacie:project.planning.description, okno:!!okno, status:document.querySelector('#statusBar').textContent};
    okno?.querySelector('.pr-zamknij')?.click(); return wynik;`);
  T('tekst z liczbą spoza danych NIE wchodzi sam do operatu', obca.wOperacie === '', obca.wOperacie);
  T('idzie do porównania i decyzji', obca.okno && /wartości, których nie ma w danych operatu/.test(obca.status), obca.status);

  const bezModelu = await p.ocen(`window.__perBlad='Model PER nie jest uruchomiony'; project.location.description='';
    project.location.transport='przystanek autobusowy „Osowa PKP" — ok. 200 m'; project.location.recreation='las — ok. 950 m';
    renderAll(); await new Promise(r=>setTimeout(r,200));
    document.querySelector('[data-per-target="location.description"]').click(); await new Promise(r=>setTimeout(r,600));
    const a={tekst:project.location.description, status:document.querySelector('#statusBar').textContent};
    project.legal.sectionIII=''; renderAll(); await new Promise(r=>setTimeout(r,200));
    project.legal.kwLocal='GD1G/00012345/6'; project.legal.ownerNames='Anna Nowak'; project.legal.court='SR Gdańsk-Północ';
    document.querySelector('[data-per-target="legal.sectionIII"]').click(); await new Promise(r=>setTimeout(r,600));
    const b={tekst:project.legal.sectionIII, status:document.querySelector('#statusBar').textContent, klasa:document.querySelector('#statusBar').className};
    window.__perBlad=''; return {a,b};`);
  T('gdy model nie działa, opis lokalizacji powstaje jako szkic z danych', /Komunikacja: przystanek autobusowy „Osowa PKP"/.test(bezModelu.a.tekst) && /Zieleń i rekreacja: las/.test(bezModelu.a.tekst), bezModelu.a.tekst);
  T('i program mówi, że to szkic i dlaczego', /szkic z danych operatu/.test(bezModelu.a.status) && /Model PER nie jest uruchomiony/.test(bezModelu.a.status), bezModelu.a.status);
  T('pole bez gotowego wzoru zostaje puste i program podaje przyczynę', bezModelu.b.tekst === '' && /PER nie napisał tekstu: Model PER nie jest uruchomiony/.test(bezModelu.b.status) && /error/.test(bezModelu.b.klasa), bezModelu.b);

  const malo = await p.ocen(`window.__perPolecenia=[]; project.building={type:'',year:'',storeys:'',construction:'',lift:'',condition:'',roof:'',facade:'',commonAreas:'',parking:'',manager:'',surroundings:'',installations:'',description:''};
    project.property.street=''; project.property.buildingNo=''; project.property.district=''; project.property.city='';
    renderAll(); await new Promise(r=>setTimeout(r,200));
    const b=document.querySelector('[data-per-target="building.description"]'); if(!b) return {brak:true};
    b.click(); await new Promise(r=>setTimeout(r,400));
    return {ile:(window.__perPolecenia||[]).length, status:document.querySelector('#statusBar').textContent, tekst:project.building.description};`);
  T('bez danych PER nie pisze z niczego — mówi, co uzupełnić', malo.brak || (malo.ile === 0 && /Za mało danych/.test(malo.status) && malo.tekst === ''), malo);

  const niepuste = await p.ocen(`project.formalBasis='umowa z klientem z dnia 1 listopada, wycena dla banku'; renderAll(); await new Promise(r=>setTimeout(r,200));
    document.querySelector('[data-per-target="formalBasis"]').click(); await new Promise(r=>setTimeout(r,500));
    const okno=document.querySelector('#perRedakcja'); const jest=!!okno; okno?.querySelector('.pr-zamknij')?.click();
    return {okno:jest, tekst:project.formalBasis};`);
  T('na polu z tekstem PER nadal redaguje i pokazuje porównanie', niepuste.okno && /umowa z klientem/.test(niepuste.tekst), niepuste);

  /* ============== 6. POPRAWKI Z ZRZUTÓW */
  const wyglad = await p.ocen(`wizardIndex=2; switchTab('project'); renderAll(); await new Promise(r=>setTimeout(r,400));
    const pf=[...document.querySelectorAll('.per-field')].filter(x=>x.getBoundingClientRect().width>0);
    const zle=pf.filter(f=>{const t=f.querySelector('textarea'),b=f.querySelector('.per-inline'); if(!t||!b) return false;
      const rt=t.getBoundingClientRect(), rb=b.getBoundingClientRect(), rf=f.getBoundingClientRect();
      return rb.top < rt.bottom - 1 || rt.width < rf.width - 4;}).length;
    showStatus('Do poprawy doszło: Rynek i transakcje: zakres / segment rynku, charakterystyka rynku lokalnego, bardzo długa nazwa pozycji do poprawy. Razem do poprawy: 20.','error',0);
    await new Promise(r=>setTimeout(r,200));
    const s=document.querySelector('#statusBar').getBoundingClientRect();
    const st=document.querySelector('.lista-strzalka'); const rs=st?st.getBoundingClientRect():null;
    return {pol:pf.length, zle, lewo:s.left, prawo:s.right, szer:innerWidth, wys:s.height, strzalka:rs?rs.width:0};`);
  T('są widoczne pola z przyciskiem PER', wyglad.pol >= 2, wyglad.pol);
  T('przycisk PER stoi POD polem, a pole ma pełną szerokość', wyglad.zle === 0, wyglad.zle);
  T('komunikat programu mieści się cały w oknie', wyglad.lewo >= 0 && wyglad.prawo <= wyglad.szer, wyglad);
  T('długi komunikat zawija się, zamiast uciekać poza ekran', wyglad.wys > 30, wyglad.wys);
  T('strzałka listy rozwijanej ma czytelną wielkość', wyglad.strzalka >= 26 || wyglad.strzalka === 0, wyglad.strzalka);

  /* ============== 7. WSZYSTKIE PUSTE OPISY NARAZ */
  const wszystkie = await p.ocen(`window.__perBlad=''; window.__perPolecenia=[];
    window.__perTeksty={'planning.description':'Plan dopuszcza zabudowę do 18 m wysokości.'};
    Object.assign(project.property,{city:'Gdańsk',district:'Osowa',street:'Siedleckiego',buildingNo:'9'});
    project.planning.description=''; project.location.description=''; project.egib.notes='';
    project.formalBasis='Mój własny tekst podstawy formalnej, którego nikt nie rusza.';
    switchTab('result'); renderAll(); await new Promise(r=>setTimeout(r,300));
    const pusteP=[...document.querySelectorAll('.per-inline')].filter(b=>!['legalBases','sources'].includes(b.dataset.perTarget)&&String(getPath(project,b.dataset.perTarget)??'').trim().length<10).length;
    document.querySelector('#perWszystkieBtn').click();
    for(let i=0;i<60&&perWszystkieTrwa!==false;i++) await new Promise(r=>setTimeout(r,100));
    await new Promise(r=>setTimeout(r,2500));
    const box=document.querySelector('#perWszystkieWynik');
    return {pusteP, polecen:(window.__perPolecenia||[]).length, tekst:box.textContent, stan:box.dataset.stan,
      lok:project.location.description, plan:project.planning.description, formal:project.formalBasis,
      guzik:document.querySelector('#perWszystkieBtn').disabled, napis:document.querySelector('#perWszystkieBtn').textContent,
      status:document.querySelector('#statusBar').textContent};`);
  T('w „Wyniku" jest przycisk pisania wszystkich pustych opisów', /Napisz puste opisy/.test(wszystkie.napis) && wszystkie.guzik === false, wszystkie.napis);
  T('PER dostaje polecenia tylko dla pól, które mają dane', wszystkie.polecen > 0 && wszystkie.polecen <= wszystkie.pusteP, [wszystkie.polecen, wszystkie.pusteP]);
  T('opis lokalizacji został napisany', wszystkie.lok.length > 10, wszystkie.lok);
  T('pole wypełnione przez człowieka zostało nietknięte', /Mój własny tekst podstawy formalnej/.test(wszystkie.formal));
  T('tekst z wartością spoza danych NIE wszedł do operatu', wszystkie.plan === '', wszystkie.plan);
  T('raport wymienia go jako „do decyzji"', /Do Twojej decyzji/.test(wszystkie.tekst) && /Gotowy opis planistyczny/.test(wszystkie.tekst), wszystkie.tekst.slice(0, 500));
  T('raport wymienia napisane pola', /Napisane przez PER \(\d+\)/.test(wszystkie.tekst) && wszystkie.stan === 'sukces', wszystkie.tekst.slice(0, 200));
  T('raport wymienia pola, którym brakuje danych', /Za mało danych/.test(wszystkie.tekst));
  T('komunikat podsumowuje wynik liczbami', /PER: napisane \d+ z \d+ pustych pól/.test(wszystkie.status), wszystkie.status);

  const nicDoPisania = await p.ocen(`for(const b of document.querySelectorAll('.per-inline')){ if(!['legalBases','sources'].includes(b.dataset.perTarget)) setPath(project,b.dataset.perTarget,'Tekst wpisany ręcznie przez rzeczoznawcę.'); }
    window.__perPolecenia=[]; await perNapiszWszystkie(); await new Promise(r=>setTimeout(r,200));
    return {polecen:(window.__perPolecenia||[]).length, tekst:document.querySelector('#perWszystkieWynik').textContent};`);
  T('gdy wszystko jest wypełnione, PER niczego nie nadpisuje', nicDoPisania.polecen === 0 && /mają już tekst/.test(nicDoPisania.tekst), nicDoPisania);

  T('po całym przebiegu nie ma błędów strony', (await p.ocen('return (window.__bledy||[]).length;')) === 0, await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  await p.zamknij();
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

'use strict';
/** OPERO 2.0 — Studio operatu: opis, zespół agentów, raport, weryfikator, WhatsApp, ustawienia. */
const fs = require('fs');
const { Przegladarka } = require('./przegladarka');
const RYNEK = fs.readFileSync(__dirname + '/dane/studio-rynek.txt', 'utf8');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — Studio operatu (widok)\n');
  await p.pauza(1800);
  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0, await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.__pytania=[]; window.confirm=(t)=>{window.__pytania.push(String(t));return true;}; document.body.classList.add('motion-reduced'); uiPrefs.mode='expert'; uiPrefs.motion='off';
    ${RYNEK}
    switchTab('dashboard'); return 1;`);

  const start = await p.ocen(`return {studio:!!document.querySelector('#studio'), stan:document.querySelector('#studio').dataset.stan, agentow:document.querySelectorAll('#agenciLista .agent').length,
    reczne:!!document.querySelector('#chooseModuleBtn')&&!!document.querySelector('#startWizardBtn'), mozg:document.querySelector('#agenciMozg').textContent, wa:document.querySelector('#agenciWa').textContent,
    raport:document.querySelector('#agenciRaport').classList.contains('hidden'), guzik:document.querySelector('#agenciStart').textContent.trim()};`);
  T('ekran Start to Studio operatu z szesnastoma agentami', start.studio && start.stan === 'opis' && start.agentow === 16, start);
  T('praca ręczna zostaje pod ręką', start.reczne);
  T('domyślnie mózg AI czeka na zgodę, WhatsApp jednym kliknięciem', /Mózg AI: wyłączony/.test(start.mozg) && /jednym kliknięciem/.test(start.wa), [start.mozg, start.wa]);
  T('przed pracą nie ma raportu', start.raport && /Uruchom zespół agentów/.test(start.guzik));

  const pusty = await p.ocen(`const r=await agenciUruchom(); return {r, kom:document.querySelector('#agenciKomunikat').textContent, przebieg:!!project.agenci?.przebieg};`);
  T('bez adresu i księgi zespół nie rusza i mówi, czego potrzebuje', pusty.r === null && /adres/.test(pusty.kom) && !pusty.przebieg, pusty);

  const fakty = await p.ocen(`const t=document.querySelector('#opisTekst'); t.value='Mieszkanie 3-pokojowe 68 m2 na 2 piętrze, ul. Siedleckiego 9/4, Gdańsk, dzielnica Osowa. Wycena pod kredyt hipoteczny. Zleceniodawca: Jan Kowalski. Cena ofertowa 720 tys. zł.';
    t.dispatchEvent(new Event('input')); await new Promise(r=>setTimeout(r,350));
    return {zetony:[...document.querySelectorAll('#opisFakty .opis-zeton:not(.brak) b')].map(x=>x.textContent), braki:[...document.querySelectorAll('#opisFakty .opis-zeton.brak b')].map(x=>x.textContent)};`);
  T('opis na żywo zamienia się w rozpoznane fakty', fakty.zetony.includes('Gdańsk') && fakty.zetony.includes('Siedleckiego') && fakty.zetony.some(x => /720/.test(x)), fakty.zetony);
  T('program od razu pokazuje, czego w opisie brakuje', fakty.braki.some(x => /księgi/.test(x)), fakty.braki);

  const kw = await p.ocen(`document.querySelector('#opisKwWklej').click(); const k=document.querySelector('#opisKwTekst'); k.value='to nie jest księga wieczysta tylko zwykły tekst'; k.dispatchEvent(new Event('input'));
    return {pole:!document.querySelector('#opisKwPole').classList.contains('hidden'), stan:document.querySelector('#opisKwStan').textContent};`);
  T('okno na treść księgi rozpoznaje, że to nie księga', kw.pole && /nie widzę/.test(kw.stan), kw);
  await p.ocen(`const k=document.querySelector('#opisKwTekst'); k.value=''; k.dispatchEvent(new Event('input')); return 1;`);

  const w = await p.ocen(`window.__perTeksty={weryfikacja:'POLE: Opis lokalizacji | PROBLEM: zdanie bez pokrycia w danych | POPRAWKA: usuń ocenę atrakcyjności'};
    const r=await agenciUruchom(); await new Promise(r=>setTimeout(r,600));
    const pr=project.agenci.przebieg, s=project.agenci;
    return {r:{ileZrobione:r.ileZrobione,ileBrakow:r.ileBrakow,przebiegi:r.przebiegi,gotowy:r.gotowy}, stany:Object.fromEntries(Object.entries(pr.agenci).map(([k,v])=>[k,v.stan])), proby:Object.fromEntries(Object.entries(pr.agenci).map(([k,v])=>[k,v.proby])),
      tab:document.querySelector('.tab.active')?.id, studio:document.querySelector('#studio').dataset.stan, procent:document.querySelector('#agenciProcent').textContent,
      p:{city:project.property.city,street:project.property.street,nr:project.property.buildingNo,lok:project.property.localNo,pow:project.property.usableArea,oferta:project.property.askingPrice,klient:project.client.name,cel:project.valuation.purpose,modul:moduleCode()},
      dzialka:project.egib.plotNo, tr:project.market.transactions.length, wagi:Math.round((project.market.features||[]).reduce((x,f)=>x+(Number(f.weight)||0),0)*100), wartosc:calc?.valueRounded,
      opis:(project.location.description||'').length, auto:Object.keys(project.autoWpisane||{}).length,
      raport:!document.querySelector('#agenciRaport').classList.contains('hidden'), tekst:document.querySelector('#agenciRaport').textContent,
      wer:{ile:s.weryfikacja.uwagi.length, model:s.weryfikacja.uwagi.filter(u=>u.zModelu).length, poprawki:s.weryfikacja.uwagi.filter(u=>u.poprawka).length, ocena:s.weryfikacja.podsumowanie.ocena},
      zatw:!!project.meta.zatwierdzono, zast:(s.zastosowane||[]).length, werdykt:s.werdykt, opisZapisany:s.opis.length, braki:Object.fromEntries(Object.entries(pr.agenci).map(([k,v])=>[k,v.braki])), okno:document.querySelector('#szukOverlay').classList.contains('hidden'),
      pytania:window.__pytania.length, polecen:(window.__perPolecenia||[]).length};`);
  T('zespół dochodzi do końca i zostaje na ekranie Start', w.r.gotowy && w.tab === 'tab-dashboard' && w.studio === 'raport' && w.procent === '100%', [w.tab, w.studio, w.procent]);
  T('każdy agent skończył pracę', Object.values(w.stany).every(s => ['gotowe', 'uwaga', 'pominiety'].includes(s)), w.stany);
  T('Agent Zlecenia wpisał dane z opisu', w.p.city === 'Gdańsk' && w.p.street === 'Siedleckiego' && w.p.nr === '9' && w.p.lok === '4' && w.p.pow === 68 && w.p.oferta === 720000 && w.p.klient === 'Jan Kowalski', w.p);
  T('cel wyceny wynika z opisu', /kredytodawcy/.test(w.p.cel), w.p.cel);
  T('Agent Ksiąg mówi wprost, że nie dostał księgi', w.braki.kw.some(x => /Brak numeru księgi/.test(x)) && w.braki.kw.some(x => /Nie dostałem treści/.test(x)), w.braki.kw);
  T('Agent Lokalizacji ustalił działkę i napisał opis', w.dzialka === '123/4' && w.opis > 40, [w.dzialka, w.opis]);
  T('Agent Lokalizacji prosi o przeznaczenie z planu albo warunki zabudowy', w.braki.lokalizacja.some(x => /warunkach zabudowy/.test(x)), w.braki.lokalizacja);
  T('Agent Rynku wstawił transakcje bez otwierania okna', w.tr >= 5 && w.okno, [w.tr, w.okno]);
  T('Agent Obliczeń: wagi 100% i wartość', w.wagi === 100 && Number(w.wartosc) > 500000, [w.wagi, w.wartosc]);
  T('Agent Obliczeń ostrzega o ocenach „przeciętna"', w.braki.obliczenia.some(x => /przeciętna/.test(x)));
  T('wpisy agentów są oznaczone jako automatyczne', w.auto >= 10, w.auto);
  T('raport: „Co zrobiłem" i „Czego zabrakło"', w.raport && /Co zrobiłem/.test(w.tekst) && /Czego zabrakło/.test(w.tekst) && w.r.ileZrobione > 15 && w.r.ileBrakow > 3, w.r);
  T('raport pokazuje wartość i czas pracy', /zł/.test(w.tekst) && /czas pracy/.test(w.tekst));
  T('zespół nadzoru: Korektor sam wprowadził poprawkę modelu (do cofnięcia), Kierownik wydał werdykt', w.wer.ile > 5 && w.wer.model === 0 && w.zast >= 1 && w.werdykt && /WERDYKT ZESPOŁU NADZORU/.test(w.tekst), [w.wer, w.zast, w.werdykt]);
  T('operat nie jest zatwierdzony przez program', w.zatw === false);
  const tok = await p.ocen(`const r=project.agenci.rozumowanie, pr=project.agenci.przebieg;
    return {decyzji:r.decyzje.length, ocena:r.podsumowanie.ocena, krytyka:r.krytyka, karta:!!document.querySelector('#agenciRaport .tok-karta'), wiersze:document.querySelectorAll('#agenciRaport .tok-decyzja').length,
      otwarte:document.querySelectorAll('#agenciRaport .tok-decyzja[open]').length, metoda:r.decyzje.find(d=>d.id==='metoda'), analityk:pr.agenci.analityk.zrobione, metodyk:pr.agenci.metodyk, formalny:pr.agenci.formalny.braki, krytyk:pr.agenci.krytyk.braki,
      rynek:project.market.marketDescription, auto:!!project.autoWpisane['market.marketDescription'], podejscie:project.valuation.approachDescription.slice(0,40)};`);
  T('raport zawiera tok rozumowania: sześć decyzji', tok.decyzji === 6 && tok.karta && tok.wiersze === 6, [tok.decyzji, tok.wiersze]);
  T('słabe decyzje są od razu rozwinięte', tok.otwarte >= 1);
  T('Agent Analityk podaje statystykę zbioru', tok.analityk.some(x => /mediana/.test(x)) && tok.analityk.some(x => /9 transakcji/.test(x)), tok.analityk);
  T('Agent Metodyk: 9 transakcji to za mało dla metody – mówi to i proponuje wyjście', tok.metoda.pewnosc === 'niska' && tok.metodyk.braki.some(x => /za mały|Za mało/.test(x)) && tok.metoda.mozliwosci.length === 3, tok.metodyk.braki);
  T('Agent Metodyk napisał charakterystykę rynku z liczb, oznaczoną jako automatyczna', /9 transakcji/.test(tok.rynek) && /mediani/.test(tok.rynek) && tok.auto, tok.rynek);
  T('uzasadnienie podejścia wpisane przez człowieka albo domyślne zostaje', /Określono wartość rynkową/.test(tok.podejscie), tok.podejscie);
  // Formalny pracuje po Redaktorze: klauzule i podstawę formalną Redaktor już napisał.
  T('Agent Formalny wylicza braki formalne (daty); autora wziął z Ustawień', !tok.formalny.some(x => /autora/.test(x)) && tok.formalny.some(x => /Data oględzin|Brakuje dat/.test(x)) && !tok.formalny.some(x => /klauzul/.test(x)), tok.formalny);
  T('Agent Krytyk nazywa sprzeczności', tok.krytyk.some(x => /ocenach wyjściowych/.test(x)) && tok.krytyk.some(x => /nie obroni się/.test(x)), tok.krytyk);
  T('opis zlecenia jest zapisany w operacie', w.opisZapisany > 50);
  T('zespół zapytał tylko raz — o zgodę na mózg AI — i dalej nie pytał', w.pytania === 1, w.pytania);

  const sc = await p.ocen(`switchTab('result'); await new Promise(r=>setTimeout(r,300));
    const k=[...document.querySelectorAll('#wynikSciezka .sciezka-krok')].map(b=>({n:b.querySelector('b').textContent,stan:b.dataset.stan,t:b.querySelector('small').textContent}));
    switchTab('dashboard'); return k;`);
  T('ekran Wynik pokazuje drogę operatu w siedmiu krokach', sc.length === 7 && sc[0].n === 'Dane' && sc[6].n === 'PDF', sc.map(x => x.n));
  T('droga operatu: dane, transakcje i rachunek zaliczone, zatwierdzenie czeka', sc[0].stan === 'ok' && sc[1].stan === 'ok' && sc[2].stan === 'ok' && /zł/.test(sc[2].t) && sc[5].stan !== 'ok' && /czeka na Ciebie/.test(sc[5].t), sc);
  T('droga operatu wskazuje dokładnie jeden bieżący krok', sc.filter(x => x.stan === 'teraz').length === 1, sc.map(x => x.stan));

  const znak = await p.ocen(`const h=zbudujRaport(); return {jest:h.includes('opero-znak-wodny'), tekst:h.includes('DO WERYFIKACJI'), surowy:zbudujRaportSurowy().includes('opero-znak-wodny')};`);
  T('wydruk niezatwierdzonego operatu ma znak wodny', znak.jest && znak.tekst && !znak.surowy, znak);

  // poprawki po akceptacji
  const przed = await p.ocen(`project.agenci.zastosowane=[]; project.location.transport='Przystanek 222 m ,dworzec 5200 zł od centrum  i dalej. Druga część zdania'; project.market.features[0].weight=Math.round((project.market.features[0].weight-0.02)*100)/100;
    await studioWeryfikuj({zModelem:true}); studioPodpis=''; studioRysuj();
    const u=project.agenci.weryfikacja.uwagi;
    return {transport:project.location.transport, wagi:Math.round(project.market.features.reduce((x,f)=>x+f.weight,0)*100), zaznaczone:document.querySelectorAll('#agenciRaport [data-wer-id]:checked').length, pola:document.querySelectorAll('#agenciRaport [data-wer-id]').length,
      model:u.filter(x=>x.zModelu).length, wagiUwaga:u.some(x=>/98%/.test(x.tytul)&&x.poprawka)};`);
  T('ponowna kontrola zachowuje uwagi modelu i znajduje nowe usterki', przed.model === 1 && przed.wagiUwaga && przed.wagi === 98, przed);
  T('gotowe poprawki są zaznaczone, uwaga modelu czeka na decyzję', przed.zaznaczone >= 2 && przed.pola === przed.zaznaczone + 1, przed);

  const bez = await p.ocen(`document.querySelectorAll('#agenciRaport [data-wer-id]').forEach(b=>b.checked=false); await studioZastosuj();
    return {transport:project.location.transport, kom:document.querySelector('#werKomunikat').textContent, zast:(project.agenci.zastosowane||[]).length};`);
  T('bez zaznaczenia nic się nie zmienia', bez.transport === przed.transport && bez.zast === 0 && /Zaznacz/.test(bez.kom), bez);

  const po = await p.ocen(`studioPodpis=''; studioRysuj(); document.querySelectorAll('#agenciRaport [data-wer-id]').forEach(b=>{ const u=project.agenci.weryfikacja.uwagi.find(x=>x.id===b.dataset.werId); b.checked=!!u.poprawka; });
    await studioZastosuj(); await new Promise(r=>setTimeout(r,300));
    return {transport:project.location.transport, wagi:Math.round(project.market.features.reduce((x,f)=>x+f.weight,0)*100), zast:project.agenci.zastosowane.length,
      cofnij:!!document.querySelector('#agenciRaport [data-studio="cofnij"]'), wprow:document.querySelectorAll('#agenciRaport .wer-uwaga[data-zrobione]').length, wagiUwaga:project.agenci.weryfikacja.uwagi.some(x=>/98%/.test(x.tytul))};`);
  T('po akceptacji poprawki wchodzą: zapis liczb i wagi', po.transport.includes('5 200 zł') && !/ ,/.test(po.transport) && po.wagi === 100 && po.zast >= 2, po);
  T('usterka wag znika z listy, pojawia się „Cofnij"', !po.wagiUwaga && po.cofnij, po);

  const cof = await p.ocen(`await studioCofnij(); await new Promise(r=>setTimeout(r,300));
    return {transport:project.location.transport, wagi:Math.round(project.market.features.reduce((x,f)=>x+f.weight,0)*100), zast:project.agenci.zastosowane.length};`);
  T('cofnięcie przywraca tekst i wagi sprzed poprawek', cof.transport === przed.transport && cof.wagi === 98 && cof.zast === 0, cof);

  // uwaga modelu: redakcja pola, ale bez nowych liczb
  const mod = await p.ocen(`project.location.description='Lokal leży 300 m od przystanku. Okolica jest atrakcyjna.';
    project.agenci.weryfikacja.uwagi=project.agenci.weryfikacja.uwagi.filter(u=>!u.poprawka); studioPodpis=''; studioRysuj();
    const stare=window.operatAPI.perRedaguj; window.operatAPI.perRedaguj=async(z)=>{window.__red=z;return {text:'Lokal leży 300 m od przystanku i 150 m od szkoły.'};};
    document.querySelectorAll('#agenciRaport [data-wer-id]').forEach(b=>b.checked=true); await studioZastosuj();
    const a=project.location.description;
    project.agenci.weryfikacja.uwagi.push({id:'m9',dzial:'tekst',waga:'uwaga',zModelu:true,tytul:'Opis lokalizacji: ocena',szczegol:'',gdzie:'location.description',poprawka:null,polecenie:'usuń ocenę'}); studioPodpis=''; studioRysuj();
    window.operatAPI.perRedaguj=async(z)=>({text:'Lokal leży 300 m od przystanku.'});
    document.querySelectorAll('#agenciRaport [data-wer-id]').forEach(b=>b.checked=true); await studioZastosuj();
    window.operatAPI.perRedaguj=stare;
    return {a, b:project.location.description, zadanie:window.__red&&window.__red.task, zast:project.agenci.zastosowane.length};`);
  T('poprawka modelu z nową liczbą nie wchodzi do operatu', mod.a === 'Lokal leży 300 m od przystanku. Okolica jest atrakcyjna.', mod.a);
  T('poprawka modelu bez nowych faktów wchodzi i da się ją cofnąć', mod.b === 'Lokal leży 300 m od przystanku.' && mod.zast >= 1 && /nie dodając żadnych nowych faktów/.test(mod.zadanie), mod);

  // WhatsApp
  const wa1 = await p.ocen(`await studioWyslijWhatsApp(); return {otwarte:window.__waOtwarte||'', wyslane:(window.__waWyslane||[]).length};`);
  T('WhatsApp jednym kliknięciem: gotowa wiadomość z adresem i wartością', /Gdańsk, Siedleckiego 9\/4/.test(wa1.otwarte) && /Wartość/.test(wa1.otwarte) && wa1.wyslane === 0, wa1);
  T('w wiadomości nie ma zleceniodawcy', !/Kowalski/.test(wa1.otwarte));

  const ust = await p.ocen(`switchTab('settings');
    document.querySelector('#waOdbiorca').value='600 100 200'; document.querySelector('#waAutomat').checked=true; await waZapisz();
    const a={stan:document.querySelector('#waStan').textContent, kom:document.querySelector('#waKomunikat').textContent, otwarte:document.querySelector('#waWiecej').open};
    document.querySelector('#waIdNumeru').value='1234567890'; document.querySelector('#waToken').value='E'.repeat(60); await waZapisz();
    const b={stan:document.querySelector('#waStan').textContent, token:document.querySelector('#waToken').value, znaczek:document.querySelector('#agenciWa').textContent};
    document.querySelector('#waOdbiorca').value='12'; const zle=await waZapisz(); const c=document.querySelector('#waKomunikat').textContent; document.querySelector('#waOdbiorca').value='600 100 200';
    return {a,b,zle,c};`);
  T('WhatsApp: automat bez danych konta mówi, czego brakuje', /brakuje/.test(ust.a.kom) && /jednym kliknięciem/.test(ust.a.stan) && ust.a.otwarte, ust.a);
  T('WhatsApp: po wpisaniu danych wysyłka jest automatyczna, a token znika z pola', /automatycznie/.test(ust.b.stan) && ust.b.token === '' && /automatycznie/.test(ust.b.znaczek), ust.b);
  T('WhatsApp: zły numer odrzucony', ust.zle === false && /numer/.test(ust.c));

  const mozg = await p.ocen(`window.__chmura={}; await mozgOdswiez(); const sel=document.querySelector('#mozgDostawca'); sel.value='anthropic'; sel.dispatchEvent(new Event('change'));
    document.querySelector('#mozgZgoda').checked=false;
    const widac=!document.querySelector('#mozgKluczPole').classList.contains('hidden');
    document.querySelector('#mozgKlucz').value='sk-test-0123456789abcdef'; document.querySelector('#mozgModel').value='model-a';
    const bezZgody=await mozgZapisz(); const k1=document.querySelector('#mozgKomunikat').textContent;
    document.querySelector('#mozgZgoda').checked=true; const zeZgoda=await mozgZapisz();
    const a={stan:document.querySelector('#mozgStan').textContent, znaczek:document.querySelector('#agenciMozg').textContent, klucz:document.querySelector('#mozgKlucz').value, aktywny:studioMozg.gotowosc.aktywny};
    await mozgModele(); const lista=document.querySelectorAll('#mozgModeleLista option').length;
    await mozgProbuj(); const proba=document.querySelector('#mozgKomunikat').textContent;
    sel.value='opero'; sel.dispatchEvent(new Event('change')); await mozgZapisz();
    return {widac,bezZgody,k1,zeZgoda,a,lista,proba, wrocil:document.querySelector('#mozgStan').textContent, aktywny2:studioMozg.gotowosc.aktywny};`);
  T('model w chmurze: bez zgody nie da się włączyć', mozg.widac && mozg.bezZgody === false && /zgod/.test(mozg.k1), mozg.k1);
  T('własny klucz Anthropic: po zgodzie pracuje, klucz znika z pola', mozg.zeZgoda && mozg.a.aktywny && /Claude · model-a/.test(mozg.a.stan) && /Claude · model-a/.test(mozg.a.znaczek) && mozg.a.klucz === '', mozg.a);
  T('model w chmurze: lista modeli i próba połączenia', mozg.lista === 2 && /działa/.test(mozg.proba), [mozg.lista, mozg.proba]);
  T('powrót do Mózgu OPERO jednym wyborem (bez klucza)', /Mózg OPERO/.test(mozg.wrocil) && mozg.aktywny2 === true, mozg.wrocil);

  const pam = await p.ocen(`const naglowki='1. PRZEDMIOT WYCENY\\n'+'Przedmiotem wyceny jest lokal mieszkalny położony w budynku wielorodzinnym. '.repeat(4)+'\\n4. Opis lokalizacji\\n'+'Nieruchomość położona jest w dzielnicy o zabudowie wielorodzinnej, w odległości 350 m od przystanku. W sąsiedztwie znajdują się szkoła oraz sklepy. '.repeat(2);
    window.__pamiecPliki={canceled:false,pliki:[{nazwa:'Zaspa 2025.docx',ok:true,tekst:naglowki},{nazwa:'zly.docx',ok:false,powod:'to nie jest dokument Word (.docx)'}]};
    await pamiecWgraj();
    const a={stan:document.querySelector('#pamiecStan').textContent, wiersze:document.querySelectorAll('#pamiecLista .pamiec-wzor').length, kom:document.querySelector('#pamiecKomunikat').textContent, znaczek:document.querySelector('#agenciWzorce').textContent};
    window.__perPolecenia=[]; project.location.services=''; renderAll(); await new Promise(r=>setTimeout(r,200));
    const pole=document.querySelector('[data-path="location.services"]'), g=[...document.querySelectorAll('.per-inline')].find(b=>b.dataset.perTarget==='location.services');
    await perNapiszPole(null,'location.services',g?g.dataset.perTask:'Opisz usługi',pole,{cicho:true});
    const prompt=(window.__perPolecenia.slice(-1)[0]||{}).prompt||'';
    document.querySelector('#pamiecUzywaj').checked=false; document.querySelector('#pamiecUzywaj').dispatchEvent(new Event('change')); await new Promise(r=>setTimeout(r,150));
    const wyl=studioWzorDlaPola('location.services');
    document.querySelector('[data-pamiec-usun]').click(); await new Promise(r=>setTimeout(r,150));
    return {a, wzor:/WZÓR STYLU/.test(prompt), liczby:/350 m/.test(prompt), wyl, po:document.querySelectorAll('#pamiecLista .pamiec-wzor').length};`);
  T('pamięć wzorców: operat wczytany, zły plik nazwany', pam.a.wiersze === 1 && /1 operat/.test(pam.a.stan) && /Zapamiętane/.test(pam.a.kom) && /zly\.docx/.test(pam.a.kom) && /1 operat/.test(pam.a.znaczek), pam.a);
  T('Agent Redaktor dostaje wzór stylu bez liczb z dawnego operatu', pam.wzor && !pam.liczby, [pam.wzor, pam.liczby]);
  T('wyłączone wzorce nie trafiają do polecenia; usuwanie działa', pam.wyl === '' && pam.po === 0, pam);

  const fol = await p.ocen(`const tekst=(n)=>'1. PRZEDMIOT WYCENY\\n'+('Przedmiotem wyceny numer '+n+' jest lokal mieszkalny położony w budynku wielorodzinnym. ').repeat(4)+'\\n4. Opis lokalizacji\\n'+('Nieruchomość '+n+' położona jest w dzielnicy o zabudowie wielorodzinnej. W sąsiedztwie znajdują się szkoła oraz sklepy. ').repeat(2+n%3);
    const pliki=[]; for(let i=0;i<40;i++) pliki.push({nazwa:'Operat '+i+'.docx',ok:true,tekst:tekst(i)});
    window.operatAPI.pamiecWczytajFolder=async()=>{const w=window.OperoPamiec.dodajWiele(window.__pamiec||{},pliki.concat([{nazwa:'skan.docx',ok:true,tekst:'krótki'}]));window.__pamiec=w.stan;return {canceled:false,znaleziono:41,dodane:w.dodane,odrzucone:w.odrzucone,odrzuconych:w.odrzucone.length,stan:w.stan};};
    document.querySelector('#pamiecUzywaj').checked=true; studioPamiec.uzywaj=true;
    await pamiecWgrajFolder(); await new Promise(r=>setTimeout(r,200));
    return {ile:studioPamiec.wzorce.length, stan:document.querySelector('#pamiecStan').textContent, kom:document.querySelector('#pamiecKomunikat').textContent, widac:document.querySelectorAll('#pamiecLista .pamiec-wzor').length, reszta:document.querySelector('#pamiecLista .hint')?.textContent||''};`);
  T('pamięć wzorców: cały folder naraz (40 operatów)', fol.ile === 40 && /40 operatów/.test(fol.stan) && /Znalazłem 41/.test(fol.kom) && /Zapamiętane: 40/.test(fol.kom) && /Pominięte: 1/.test(fol.kom), fol);
  T('długa lista pokazuje najnowsze i mówi, ile jest reszty', fol.widac === 12 && /28 starszych/.test(fol.reszta), [fol.widac, fol.reszta]);

  // automat WhatsApp przy pracy zespołu + zatwierdzenie zdejmuje znak wodny
  const drugi = await p.ocen(`switchTab('dashboard'); window.__waWyslane=[]; window.__perTeksty={weryfikacja:'BRAK'};
    document.querySelector('#opisDokladnosc').value='1';
    const r=await agenciUruchom(); await new Promise(r=>setTimeout(r,500));
    const wys=(window.__waWyslane||[]).slice();
    const przedNauka=studioPamiec.wzorce.length; project.meta.zatwierdzono=new Date().toISOString(); const nauka=await studioUczSieZOperatu(); const nauka2=await studioUczSieZOperatu();
    window.__nauka={przed:przedNauka, po:studioPamiec.wzorce.length, nazwa:nauka&&nauka.nazwa, sekcje:nauka?Object.keys(nauka.sekcje):[], liczby:nauka?/\\d/.test(JSON.stringify(nauka.sekcje)):null};
    return {ile:wys.length, start:/zaczynam operat/.test(wys[0]||''), koniec:/gotowy do weryfikacji/.test(wys[wys.length-1]||''), kom:document.querySelector('#agenciKomunikat').textContent,
      tr:project.market.transactions.length, znak:zbudujRaport().includes('opero-znak-wodny'), kontroler:project.agenci.przebieg.agenci.kontroler.zrobione, pytania:window.__pytania.length, model:project.agenci.weryfikacja.uwagi.filter(u=>u.zModelu).length};`);
  T('WhatsApp automatycznie: wiadomość na start i na koniec', drugi.ile === 2 && drugi.start && drugi.koniec && /wysłany/.test(drugi.kom), drugi);
  T('ponowne uruchomienie dopisuje do tego samego operatu, bez nowego pytania (jedyne było o zgodę na mózg AI)', drugi.pytania === 1 && drugi.tr >= 5, [drugi.pytania, drugi.tr]);
  T('jeden przebieg: kontroler nie powtarza', drugi.kontroler.some(x => /Jeden przebieg/.test(x)), drugi.kontroler);
  T('odpowiedź modelu „BRAK" nie tworzy uwag', drugi.model === 0);
  T('po zatwierdzeniu znak wodny znika', drugi.znak === false);
  const nauka = await p.ocen('return window.__nauka;');
  T('zatwierdzony operat staje się wzorcem – raz, bez liczb', nauka.po === nauka.przed + 1 && /Gdańsk/.test(nauka.nazwa) && nauka.sekcje.length >= 1 && nauka.liczby === false, nauka);

  const inny = await p.ocen(`window.__pytania=[]; window.confirm=(t)=>{window.__pytania.push(String(t));return false;};
    const t=document.querySelector('#opisTekst'); t.value='Dom jednorodzinny, ul. Długa 5, Sopot.'; const id=project.meta.id;
    const r=await agenciUruchom(); return {r, pyt:window.__pytania[0]||'', id:project.meta.id===id, city:project.property.city};`);
  T('opis innej nieruchomości: program pyta, zanim zacznie nowy operat', inny.r === null && /innej nieruchomości/.test(inny.pyt) && inny.id && inny.city === 'Gdańsk', inny);

  const nowy = await p.ocen(`window.confirm=()=>true; const id=project.meta.id; window.__dzialkaOdp={ok:false,dzialki:[],punkty:[],powod:'usługa nie odpowiada'}; window.__otoBlad='brak połączenia z siecią'; window.__rcnOdp={ok:true,transakcje:[],pominieto:0,komunikat:'brak',zrodlo:'RCN'}; window.__perBlad='Model PER nie jest wczytany';
    document.querySelector('#opisDokladnosc').value='2';
    const r=await agenciUruchom(); await new Promise(r=>setTimeout(r,500)); const pr=project.agenci.przebieg;
    return {nowy:project.meta.id!==id, modul:moduleCode(), city:project.property.city, stany:Object.fromEntries(Object.entries(pr.agenci).map(([k,v])=>[k,v.stan])), proby:pr.agenci.rynek.proby, przebieg:pr.przebieg,
      wartosc:Number(calc?.valueRounded)||0, tekst:document.querySelector('#agenciRaport').textContent, gotowy:r.gotowy, bledy:(window.__bledy||[]).length, kontroler:pr.agenci.kontroler.zrobione};`);
  T('po zgodzie powstaje nowy operat właściwego rodzaju', nowy.nowy && nowy.modul === 'developed_pairs' && nowy.city === 'Sopot', [nowy.nowy, nowy.modul, nowy.city]);
  T('gdy sieć i model zawodzą, zespół i tak kończy i raportuje braki', nowy.gotowy && nowy.wartosc === 0 && /brak wyniku/.test(nowy.tekst) && /Nie znalazłem żadnej transakcji/.test(nowy.tekst), nowy.stany);
  T('kontroler wrócił do nieudanych agentów (drugi przebieg)', nowy.przebieg === 2 && nowy.proby === 2 && nowy.kontroler.some(x => /Przebieg 2/.test(x)), [nowy.przebieg, nowy.proby, nowy.kontroler]);
  T('cały scenariusz bez błędów skryptu', nowy.bledy === 0, await p.ocen('return (window.__bledy||[]).slice(0,3);'));

  const reczny = await p.ocen(`window.__perBlad=''; await createProjectFromModule('local_kcm'); await new Promise(r=>setTimeout(r,400));
    Object.assign(project.property,{city:'Gdynia',street:'Morska',buildingNo:'1',usableArea:50}); renderAll(); switchTab('result'); await new Promise(r=>setTimeout(r,300));
    const przed=document.querySelector('#wynikSciezka [data-sciezka-akcja="sprawdz"] small').textContent;
    document.querySelector('#wynikSciezka [data-sciezka-akcja="sprawdz"]').click(); await new Promise(r=>setTimeout(r,500));
    return {przed, tab:document.querySelector('.tab.active')?.id, wer:!!project.agenci.weryfikacja, karta:!!document.querySelector('#agenciRaport .wer-karta'), znak:zbudujRaport().includes('opero-znak-wodny'), city:project.property.city};`);
  T('operat ręczny: weryfikację uruchamia się z ekranu Wynik', /nie uruchomiono/.test(reczny.przed) && reczny.wer && reczny.karta && reczny.tab === 'tab-dashboard', reczny);
  T('operat ręczny nie dostaje znaku wodnego i nic w nim nie jest zmieniane', reczny.znak === false && reczny.city === 'Gdynia');

  const hist = await p.ocen(`document.querySelector('.nav-btn[data-tab="history"]').click(); await new Promise(r=>setTimeout(r,500));
    const pusto=!!document.querySelector('#historyList .historia-pusto'); document.querySelector('#historiaDoStartu')?.click(); await new Promise(r=>setTimeout(r,300));
    return {pusto, tab:document.querySelector('.tab.active')?.id};`);
  T('pusta Historia prowadzi do opisania pierwszego operatu', hist.pusto && hist.tab === 'tab-dashboard', hist);

  await p.zamknij();
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

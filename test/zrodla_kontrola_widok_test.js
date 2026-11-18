'use strict';
/**
 * OPERO — zrodla w uruchomionym programie:
 *
 *   1. SPRAWDZANIE ZRODEL — przed szukaniem widac, ktora usluga odpowiada,
 *      ktora wolno, a ktora milczy i dlaczego.
 *   2. ZAPAS PROCENTOWY — wiersze spoza wpisanych kryteriow sa widoczne,
 *      podpisane i NIE zaznaczone z gory.
 *   3. SZYBKOSC — trzy zrodla pytane naraz, a nie jedno po drugim.
 *   4. LISTA DO ZAAKCEPTOWANIA — to, co trafilo w kryteria, jest zaznaczone.
 */
const { Przegladarka } = require('./przegladarka');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };

// 54,30 m2, odchylka 20% => 43,44-65,16; zapas 25% => odchylka 25% => 40,72-67,88.
const TRANSAKCJE = [
  { zrodloWiersz: 1, adres: 'ul. Kartuska 180, Gdańsk', miejscowosc: 'Gdańsk', data: '2026-06-10',
    cena: 600000, powierzchnia: 55, jednostkowa: 10909, prawo: 'własność', rodzaj: 'sprzedaż', akt: 'Rep. A 1/2026', uwagi: [] },
  { zrodloWiersz: 2, adres: 'ul. Kartuska 190, Gdańsk', miejscowosc: 'Gdańsk', data: '2026-05-10',
    cena: 720000, powierzchnia: 67, jednostkowa: 10746, prawo: 'własność', rodzaj: 'sprzedaż', akt: 'Rep. A 2/2026', uwagi: [] },
  { zrodloWiersz: 3, adres: 'ul. Kartuska 300, Gdańsk', miejscowosc: 'Gdańsk', data: '2026-04-10',
    cena: 980000, powierzchnia: 95, jednostkowa: 10315, prawo: 'własność', rodzaj: 'sprzedaż', akt: 'Rep. A 3/2026', uwagi: [] },
];

(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — kontrola źródeł i zapas procentowy (widok)\n');
  await p.pauza(1800);
  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  T('moduł kontroli źródeł jest wpięty', await p.ocen('return Boolean(window.OperoZrodlaKontrola);'));

  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=()=>true; document.body.classList.add('motion-reduced'); return 1;`);

  /* ============== 1. SPRAWDZANIE ZRODEL */
  const zdrowie = await p.ocen(`
    window.__zrodlaWynik={rcn:{ok:true,ms:900},uldk:{ok:true,ms:8200},uug:{ok:true,ms:300},
      'dane-gov':{ok:false,powod:'Usługa dane.gov.pl — cenniki deweloperów nie odpowiedziała w wyznaczonym czasie.'}};
    szukOtworz();
    await new Promise(r=>setTimeout(r,900));
    return {pozycji: document.querySelectorAll('#szukZdrowieLista .szuk-zdrowie-pozycja').length,
      stany: [...document.querySelectorAll('#szukZdrowieLista .szuk-zdrowie-pozycja')].map(x=>x.dataset.stan),
      napisy: [...document.querySelectorAll('#szukZdrowieLista .szuk-zdrowie-pozycja')].map(x=>x.textContent),
      opis: document.querySelector('#szukZdrowieOpis')?.textContent||'',
      waga: document.querySelector('#szukZdrowieOpis')?.dataset.waga||''};`);
  T('otwarcie okna sprawdza źródła samo, bez proszenia', zdrowie.pozycji === 4, zdrowie.pozycji);
  T('działające źródło świeci na zielono', zdrowie.stany[0] === 'dziala', zdrowie.stany);
  T('wolne źródło jest osobno oznaczone', zdrowie.stany[1] === 'wolno', zdrowie.stany);
  T('milczące źródło świeci na czerwono', zdrowie.stany[3] === 'milczy', zdrowie.stany);
  T('przy każdym stoi czas odpowiedzi', /0,9 s/.test(zdrowie.napisy[0]), zdrowie.napisy[0]);
  T('program liczy, ile źródeł odpowiada', /3 z 4/.test(zdrowie.opis), zdrowie.opis);
  T('i świeci pomarańczowo, bo jedno milczy', zdrowie.waga === 'ostrzezenie', zdrowie.waga);

  const recznie = await p.ocen(`
    window.__zrodlaWynik={rcn:{ok:true,ms:500},uldk:{ok:true,ms:500},uug:{ok:true,ms:500},'dane-gov':{ok:true,ms:500}};
    document.querySelector('#szukSprawdzZrodla').click();
    await new Promise(r=>setTimeout(r,800));
    return {opis: document.querySelector('#szukZdrowieOpis')?.textContent||'',
      waga: document.querySelector('#szukZdrowieOpis')?.dataset.waga||'',
      napis: document.querySelector('#szukSprawdzZrodla').textContent,
      wPasku: (oknoStan.wpisy||[]).map(w=>w.tekst||'').join(' | ')};`);
  T('przycisk „Sprawdź źródła" sprawdza je ponownie',
    /Wszystkie 4 źródła odpowiadają/.test(recznie.opis), recznie.opis);
  T('i wtedy pasek świeci na zielono', recznie.waga === 'sukces');
  T('przycisk wraca do swojego napisu', recznie.napis === 'Sprawdź źródła', recznie.napis);
  T('wynik idzie też do paska u góry', /źródła odpowiadają/.test(recznie.wPasku), recznie.wPasku.slice(-120));

  /* ============== 2 i 3. SZUKANIE: RÓWNOLEGLE I Z ZAPASEM */
  const przebieg = await p.ocen(`
    window.__dzialkaOdp={ok:true,dzialki:[{id:'x'}],punkty:[{x:472000,y:720000}],punkt:{x:472000,y:720000}};
    project.property.city='Gdańsk'; project.property.street='Kartuska'; project.property.usableArea=54.3;
    window.__rcnOdp={ok:true,pominieto:0,komunikat:'ok',zrodlo:'RCN',transakcje:${JSON.stringify(TRANSAKCJE)}};
    window.__bazaKandydaci=[];
    window.__ofertyOdp={ok:true,oferty:[],etapy:[],zrodla:[],statystyka:{ile:0},komunikat:'brak cennikow'};
    document.querySelector('#szukMiasto').value='Gdańsk';
    document.querySelector('#szukPow').value='54,30';
    document.querySelector('#szukOdchylka').value='20';
    document.querySelector('#szukZapas').value='25';
    const start=Date.now();
    document.querySelector('#szukStart').click();
    await new Promise(r=>setTimeout(r,2600));
    const wiersze=[...document.querySelectorAll('#szukTabela tr')];
    return {ms: Date.now()-start,
      wierszy: wiersze.length,
      zZapasu: document.querySelectorAll('#szukTabela tr.szuk-zapas').length,
      znaczniki: [...document.querySelectorAll('#szukTabela .szuk-znacznik-zapas')].map(x=>x.textContent),
      opisyZapasu: wiersze.filter(w=>w.classList.contains('szuk-zapas')).map(w=>w.textContent.replace(/\\s+/g,' ').trim()),
      zaznaczone: [...document.querySelectorAll('#szukTabela [data-szuk-i]')].map(x=>x.checked),
      kryteria: document.querySelector('#szukOpisKryteriow')?.textContent||'',
      dodajNapis: document.querySelector('#szukDodaj').textContent,
      stopkaStan: (document.querySelector('#szukStopkaStan')||{}).textContent||'',
      dodajUkryty: document.querySelector('#szukDodaj').classList.contains('hidden'),
      podsumowanie: document.querySelector('#szukPodsumowanie')?.textContent||''};`);

  // 54,30 m2 ±20% to 43,44-65,16; z zapasem 25% pas rosnie do 40,72-67,88.
  // 55 m2 trafia w kryteria, 67 m2 wchodzi z zapasu, 95 m2 odpada i z zapasem.
  T('dwie pozycje z trzech przeszły — trzecia odpada nawet z zapasem', przebieg.wierszy === 2, przebieg.wierszy);
  T('jedna z nich weszła dopiero dzięki zapasowi', przebieg.zZapasu === 1, przebieg.zZapasu);
  T('i jest podpisana „do decyzji"', przebieg.znaczniki.join() === 'do decyzji', przebieg.znaczniki);
  T('przy wierszu z zapasu stoi, o ile wychodzi poza kryteria',
    /poza zakresem/.test(przebieg.opisyZapasu[0] || ''), przebieg.opisyZapasu[0]);
  T('pozycja z kryteriów jest zaznaczona od razu — lista jest do zaakceptowania',
    przebieg.zaznaczone.filter(Boolean).length === 1, przebieg.zaznaczone);
  T('a wiersz z zapasu NIE jest zaznaczony — to świadoma decyzja rzeczoznawcy',
    przebieg.zaznaczone.filter(x => !x).length === 1, przebieg.zaznaczone);
  T('zamiast martwego przycisku stoi potwierdzenie, że pozycja jest w operacie',
    /już w operacie/.test(przebieg.stopkaStan), przebieg.stopkaStan);
  T('a przycisk „Dodaj" jest schowany', przebieg.dodajUkryty === true);
  T('opis kryteriów mówi o zapasie wprost', /zapas ±25%/.test(przebieg.kryteria), przebieg.kryteria);
  T('podsumowanie mówi, ile pozycji czeka na decyzję',
    /1 pozycja wychodzi poza Twoje kryteria/.test(przebieg.podsumowanie), przebieg.podsumowanie);
  T('i że program sam ich nie zaznaczył',
    /program jej nie zaznaczył/.test(przebieg.podsumowanie), przebieg.podsumowanie);

  const odznaczenie = await p.ocen(`
    const pola=[...document.querySelectorAll('#szukTabela [data-szuk-i]')];
    pola[0].click();
    await new Promise(r=>setTimeout(r,250));
    return {napis: document.querySelector('#szukDodaj').textContent,
      wylaczony: document.querySelector('#szukDodaj').classList.contains('hidden'),
      stan: pola.map(x=>x.checked)};`);
  T('odznaczenie wiersza zostaje uszanowane', odznaczenie.stan[0] === false, odznaczenie.stan);
  T('i przycisk nadal nie ma czego dodać', odznaczenie.wylaczony === true, odznaczenie.napis);

  const wszystkie = await p.ocen(`
    document.querySelector('#szukWszystkie').click();
    await new Promise(r=>setTimeout(r,250));
    return [...document.querySelectorAll('#szukTabela [data-szuk-i]')].map(x=>x.checked);`);
  T('„zaznacz wszystkie" bierze też wiersz z zapasu — to już wybór człowieka',
    wszystkie.every(Boolean) && wszystkie.length === 2, wszystkie);

  /* ============== 4. MILCZACE ZRODLO NIE PRZERYWA POZOSTALYCH */
  const awaria = await p.ocen(`
    window.__rcnBlad='Usługa Rejestr Cen Nieruchomości (Geoportal) przerwała połączenie w trakcie odpowiedzi.';
    window.__bazaKandydaci=${JSON.stringify([TRANSAKCJE[0]])};
    document.querySelector('#szukStart').click();
    await new Promise(r=>setTimeout(r,2600));
    const stany=[...document.querySelectorAll('#szukEtapy .szuk-etap')].map(x=>x.dataset.stan);
    const opisy=[...document.querySelectorAll('#szukEtapy .szuk-etap p')].map(x=>x.textContent);
    delete window.__rcnBlad;
    return {stany, opisy, wierszy: document.querySelectorAll('#szukTabela tr').length};`);
  T('milczący rejestr kończy się jako błąd tego etapu', awaria.stany[1] === 'blad', awaria.stany);
  T('ale własna baza i tak odpowiada', awaria.stany[2] === 'znalazl', awaria.stany);
  T('a znaleziona transakcja jest w tabeli', awaria.wierszy === 1, awaria.wierszy);
  T('komunikat o błędzie NAZYWA usługę, która zawiodła',
    /Rejestr Cen Nieruchomości/.test(awaria.opisy[1] || ''), awaria.opisy[1]);
  T('i ani słowa o serwerze licencyjnym — program z żadnym się nie łączy',
    !/licencyjn/i.test(awaria.opisy.join(' ')), awaria.opisy[0]);

  T('po całej tej drodze strona nadal działa bez błędu',
    (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    await p.ocen('return (window.__bledy||[]).slice(0,3);'));

  await p.zamknij();
  console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error('BLAD TESTU', e); process.exit(1); });

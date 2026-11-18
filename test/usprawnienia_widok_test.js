'use strict';
/**
 * OPERO — usprawnienia, o które poprosił rzeczoznawca:
 *
 *   1. ROZWIJANE LISTY tam, gdzie się da — w Express i w pełnym operacie.
 *   2. ADRES: lista prawdziwych ulic z miastami, klikasz i wybierasz.
 *   3. SZUKANIE TRANSAKCJI w jednym oknie, które przełącza etapy; widać,
 *      w którym źródle program jest teraz.
 *   4. JEDNA ZNALEZIONA TRANSAKCJA WYSTARCZY, żeby ją dodać.
 *   5. OKIENKO STANU: trzy liczby i trzy kolory.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Przegladarka } = require('./przegladarka');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const KANDYDACI = [
  { ulica: 'Kartuska', miasto: 'Gdańsk', numer: '201', dzielnica: 'Siedlce', gmina: 'Gdańsk', powiat: 'Gdańsk', wojewodztwo: 'POMORSKIE', kod: '80-125', x: 472000, y: 720000 },
  { ulica: 'Kartuska', miasto: 'Gdańsk', numer: '205', dzielnica: 'Siedlce', kod: '80-125' },
  { ulica: 'Kartuzka', miasto: 'Gdańsk', numer: '2', dzielnica: 'Wrzeszcz', kod: '80-300' },
  { ulica: 'Kartuska', miasto: 'Kartuzy', numer: '201', gmina: 'Kartuzy', powiat: 'kartuski', wojewodztwo: 'POMORSKIE', kod: '83-300' },
];
const JEDNA_TRANSAKCJA = [{
  zrodloWiersz: 1, adres: 'ul. Kartuska 180, Gdańsk', miejscowosc: 'Gdańsk',
  data: '2026-06-10', cena: 600000, powierzchnia: 55, jednostkowa: 10909,
  prawo: 'własność', rodzaj: 'sprzedaż', akt: 'Rep. A 1/2026', kw: '', uwagi: [], uwagiZrodla: '',
}];

(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — listy, adres, szukanie, okienko stanu (widok)\n');
  await p.pauza(1800);

  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    JSON.stringify(await p.ocen('return (window.__bledy||[]).slice(0,3);')));
  T('moduł list i moduł szukania są wpięte',
    await p.ocen('return Boolean(window.OperoListy && window.OperoSzukanie);'));

  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=()=>true; return 1;`);

  /* ======================================= 1. LISTY W PEŁNYM OPERACIE */
  const listyOperat = await p.ocen(`
    switchTab('project'); await new Promise(r=>setTimeout(r,400));
    const cel=document.querySelector('[data-path="valuation.purpose"]');
    const ob=cel.closest('.lista-obudowa');
    ob.querySelector('.lista-strzalka').click();
    await new Promise(r=>setTimeout(r,250));
    const pozycje=[...ob.querySelectorAll('.lista-pozycja b')].map(x=>x.textContent);
    ob.querySelector('.lista-pozycja').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    await new Promise(r=>setTimeout(r,250));
    return {obudow: document.querySelectorAll('.lista-obudowa').length,
      pozycji: pozycje.length, pierwsza: pozycje[0],
      wartosc: cel.value, wProjekcie: project.valuation.purpose,
      opis: ob.parentNode.querySelector('.lista-opis')?.textContent||''};`);
  T('w pełnym operacie pola dostają rozwijane listy', listyOperat.obudow >= 10, String(listyOperat.obudow));
  T('cel wyceny ma listę gotowych celów', listyOperat.pozycji >= 10, String(listyOperat.pozycji));
  T('na liście są cele z ustawy, nie wymyślone',
    /Określenie wartości rynkowej dla potrzeb sprzedaży/.test(listyOperat.pierwsza), listyOperat.pierwsza);
  T('wybór z listy wchodzi do pola', /sprzedaży/.test(listyOperat.wartosc), listyOperat.wartosc);
  T('i do operatu', /sprzedaży/.test(listyOperat.wProjekcie || ''));
  T('program tłumaczy, kiedy użyć tej pozycji', listyOperat.opis.length > 10, listyOperat.opis);

  const listaSzuka = await p.ocen(`
    const cel=document.querySelector('[data-path="valuation.purpose"]');
    const ob=cel.closest('.lista-obudowa');
    cel.value='kredyt'; cel.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,250));
    return [...ob.querySelectorAll('.lista-pozycja b')].map(x=>x.textContent);`);
  T('pisanie samo otwiera i filtruje listę', listaSzuka.length === 1, String(listaSzuka.length));
  T('i znajduje po słowie ze środka zdania',
    /zabezpieczenia wierzytelności kredytodawcy/.test(listaSzuka[0] || ''), String(listaSzuka[0]));

  /* --- lista jest OTWARTA: wolno wpisać coś spoza niej --- */
  const wlasne = await p.ocen(`
    const cel=document.querySelector('[data-path="valuation.purpose"]');
    cel.value='Określenie wartości dla potrzeb mojego własnego przypadku';
    cel.dispatchEvent(new Event('input',{bubbles:true}));
    cel.dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,250));
    return {wartosc: cel.value, wProjekcie: project.valuation.purpose};`);
  T('wolno wpisać wartość spoza listy', /mojego własnego przypadku/.test(wlasne.wartosc));
  T('i trafia do operatu tak samo', /mojego własnego przypadku/.test(wlasne.wProjekcie || ''));

  /* ============================ 2. ADRES: PRAWDZIWE ULICE Z MIASTAMI */
  const adres = await p.ocen(`
    window.__adresKandydaci=${JSON.stringify(KANDYDACI)};
    const ul=document.querySelector('[data-path="property.street"]');
    ul.value='Kartu'; ul.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,1500));
    const w=document.getElementById(ul.id+'_wybor');
    return {opcje:[...w.querySelectorAll('.pole-adres-opcja b')].map(x=>x.textContent),
      miasta:[...w.querySelectorAll('.pole-adres-opcja span')].map(x=>x.textContent),
      punkty:[...w.querySelectorAll('.pole-adres-opcja i')].map(x=>x.textContent),
      widoczna: !w.classList.contains('hidden')};`);
  T('rubryka adresu działa też w pełnym operacie', adres.widoczna === true);
  T('pokazuje PRAWDZIWE nazwy ulic z rejestru',
    adres.opcje.includes('ul. Kartuska') && adres.opcje.includes('ul. Kartuzka'), JSON.stringify(adres.opcje));
  T('ta sama ulica w dwóch miastach to dwie pozycje', adres.opcje.filter(x => x === 'ul. Kartuska').length === 2);
  T('przy każdej stoi miasto', adres.miasta.some(x => /Gdańsk/.test(x)) && adres.miasta.some(x => /Kartuzy/.test(x)),
    JSON.stringify(adres.miasta));
  T('i dzielnica, gdy rejestr ją zna', adres.miasta.some(x => /Siedlce/.test(x)));
  /* Odmiana CALEGO wyrazenia: „1 punkt adresowych" to blad, ktory widac od
     razu i psuje zaufanie do reszty programu. */
  T('oraz ile punktów adresowych ma ta ulica',
    adres.punkty.some(x => /2 punkty adresowe\b/.test(x)), JSON.stringify(adres.punkty));
  T('przy jednym punkcie odmiana też się zgadza',
    adres.punkty.some(x => /1 punkt adresowy\b/.test(x)), JSON.stringify(adres.punkty));

  const poKliknieciu = await p.ocen(`
    const ul=document.querySelector('[data-path="property.street"]');
    const w=document.getElementById(ul.id+'_wybor');
    const kartuzy=[...w.querySelectorAll('.pole-adres-opcja')].find(b=>/Kartuzy/.test(b.textContent));
    kartuzy.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    await new Promise(r=>setTimeout(r,350));
    return {ulica: ul.value, miasto: document.querySelector('[data-path="property.city"]').value,
      powiat: project.property.county, kod: project.property.postcode};`);
  T('klikasz i wybierasz — ulica wpisuje się pełną nazwą', poKliknieciu.ulica === 'Kartuska', poKliknieciu.ulica);
  T('miasto wypełnia się samo', poKliknieciu.miasto === 'Kartuzy', poKliknieciu.miasto);
  T('razem z powiatem i kodem', poKliknieciu.powiat === 'kartuski' && poKliknieciu.kod === '83-300',
    `${poKliknieciu.powiat} / ${poKliknieciu.kod}`);

  /* ========================= 3. SZUKANIE: JEDNO OKNO, ETAPY PO KOLEI */
  const okno = await p.ocen(`
    switchTab('express');
    document.querySelector('[data-ex-typ="local_kcm"]').click();
    await new Promise(r=>setTimeout(r,400));
    document.querySelector('#ex_powierzchnia').value='54,30';
    document.querySelector('#exZrodla [data-zrodla-wszedzie]').click();
    await new Promise(r=>setTimeout(r,350));
    return {otwarte: !document.querySelector('#szukOverlay').classList.contains('hidden'),
      etapow: document.querySelectorAll('#szukEtapy .szuk-etap').length,
      nazwy: [...document.querySelectorAll('#szukEtapy .szuk-etap b')].map(x=>x.textContent.replace(/transakcje|oferty.*|przepisane.*/,'').trim()),
      stany: [...document.querySelectorAll('#szukEtapy .szuk-etap')].map(x=>x.dataset.stan),
      kryteria: document.querySelector('#szukOpisKryteriow')?.textContent||'',
      serwisyWidoczne: !document.querySelector('#szukSerwisy').classList.contains('hidden')};`);
  T('„Szukaj we wszystkich źródłach" otwiera JEDNO okno', okno.otwarte === true);
  // Piec krokow: Deweloperuch (recznie), rejestr, wlasna baza, dane.gov.pl
  // i — na samym koncu, jako ostatecznosc — inne portale ogloszeniowe.
  T('a w nim pięć etapów, nie pięć okien', okno.etapow === 5, String(okno.etapow));
  // Krok 1 to ten, ktory wymaga czlowieka - stoi pierwszy, zeby mogl go
  // zalatwic w czasie, gdy program pyta pozostale zrodla.
  T('pierwszy to krok z serwisami — ten, który wymaga człowieka', /Deweloperuch/.test(okno.nazwy[0]), okno.nazwy[0]);
  T('drugi to Rejestr Cen Nieruchomości', /Rejestr Cen Nieruchomości/.test(okno.nazwy[1]), okno.nazwy[1]);
  T('na początku wszystkie czekają', okno.stany.every(s => s === 'czeka'), JSON.stringify(okno.stany));
  T('program pokazuje, według jakich kryteriów szuka',
    /powierzchnia/.test(okno.kryteria) && /mies/.test(okno.kryteria), okno.kryteria);
  T('krok 4 jest ukryty, póki program do niego nie dojdzie', okno.serwisyWidoczne === false);

  const przebieg = await p.ocen(`
    window.__dzialkaOdp={ok:true,dzialki:[{id:'x',numer:'1',gmina:'Gdańsk',powiat:'Gdańsk'}],punkty:[{x:472000,y:720000}],punkt:{x:472000,y:720000}};
    window.__rcnOdp={ok:true,transakcje:[],pominieto:0,komunikat:'brak',zrodlo:'RCN'};
    window.__bazaKandydaci=${JSON.stringify(JEDNA_TRANSAKCJA)};
    window.__ofertyOdp={ok:true,oferty:[],etapy:[],zrodla:[],statystyka:{ile:0},komunikat:'brak cennikow'};
    document.querySelector('#szukMiasto').value='Gdańsk';
    document.querySelector('#szukPow').value='54,30';
    document.querySelector('#szukStart').click();
    await new Promise(r=>setTimeout(r,2600));
    return {stany: [...document.querySelectorAll('#szukEtapy .szuk-etap')].map(x=>x.dataset.stan),
      opisy: [...document.querySelectorAll('#szukEtapy .szuk-etap p')].map(x=>x.textContent),
      wierszy: document.querySelectorAll('#szukTabela tr').length,
      serwisyWidoczne: !document.querySelector('#szukSerwisy').classList.contains('hidden'),
      podsumowanie: document.querySelector('#szukPodsumowanie')?.textContent||'',
      waga: document.querySelector('#szukPodsumowanie')?.dataset.waga,
      dodajWylaczony: document.querySelector('#szukDodaj').disabled};`);
  T('pusty Rejestr Cen kończy się jako „pusto", nie jako błąd', przebieg.stany[1] === 'pusto', JSON.stringify(przebieg.stany));
  T('i program tłumaczy, co pusty wynik znaczy',
    /około 320 z 380/.test(przebieg.opisy[1]), przebieg.opisy[1]);
  T('własna baza odpowiada niezależnie i tam znajduje', przebieg.stany[2] === 'znalazl');
  T('mówiąc, ile znalazł', /znalazłem 1 pozycję/.test(przebieg.opisy[2]), przebieg.opisy[2]);
  T('cenniki deweloperów też dostają swoją odpowiedź', ['pusto', 'znalazl', 'blad'].includes(przebieg.stany[3]));
  T('a na końcu pokazuje krok z serwisami', przebieg.serwisyWidoczne === true);
  T('znaleziona transakcja jest w tabeli', przebieg.wierszy === 1, String(przebieg.wierszy));

  /* ============== 4. JEDNA TRANSAKCJA WYSTARCZY, ŻEBY JĄ DODAĆ */
  T('podsumowanie mówi, że jedna to mało…', /Jedna transakcja to mało/.test(przebieg.podsumowanie), przebieg.podsumowanie);
  T('…ale że decyduje rzeczoznawca', /to Ty rozstrzygasz/.test(przebieg.podsumowanie));
  T('podsumowanie świeci na pomarańczowo', przebieg.waga === 'ostrzezenie', przebieg.waga);

  // Lista ma byc DO ZAAKCEPTOWANIA: to, co trafilo w kryteria, jest zaznaczone
  // od razu, a rzeczoznawca tylko naciska "Dodaj do operatu".
  const dodanie = await p.ocen(`
    const pole=document.querySelector('#szukTabela [data-szuk-i]');
    const zaznaczoneOdRazu=!!(pole&&pole.checked);
    const napis=document.querySelector('#szukDodaj').textContent;
    const wylaczony=document.querySelector('#szukDodaj').disabled;
    document.querySelector('#szukDodaj').click();
    await new Promise(r=>setTimeout(r,600));
    const st=document.querySelector('#szukStopkaStan');
    return {napis, wylaczony, zaznaczoneOdRazu,
      stanNapis: st ? st.textContent : '',
      przyciskUkryty: document.querySelector('#szukDodaj').classList.contains('hidden'),
      wOperacie:(project.market.transactions||[]).length,
      adres:(project.market.transactions||[])[0]?.address||'',
      ostatni: (oknoStan.wpisy||[]).map(w=>w.szczegoly||'').join(' | ')};`);
  T('pozycja z kryteriów jest zaznaczona od razu, bez klikania po jednej',
    dodanie.zaznaczoneOdRazu === true);
  // Pozycja z kryteriow jest juz w operacie, bo program wstawil ja sam -
  // przycisk nie moze obiecywac pracy, ktorej nie ma do zrobienia.
  // Martwy przycisk to najgorsza odpowiedz programu: zamiast niego stoi
  // zielone potwierdzenie, a sam przycisk znika.
  T('zamiast martwego przycisku stoi potwierdzenie',
    /już w operacie/.test(dodanie.stanNapis), dodanie.stanNapis);
  T('a przycisk „Dodaj" jest schowany', dodanie.przyciskUkryty === true);
  // Pozycja mieszczaca sie w kryteriach weszla do operatu juz w trakcie
  // szukania. Powtorne "Dodaj" nie moze jej zdublowac.
  T('transakcja jest w operacie dokładnie raz', dodanie.wOperacie === 1, String(dodanie.wOperacie));
  T('razem z adresem', /Kartuska 180/.test(dodanie.adres), dodanie.adres);

  /* --- wklejenie z cudzego serwisu --- */
  const wklejone = await p.ocen(`
    document.querySelector('#szukWklejenie').value =
      'ul. Długa 5, Gdańsk\\t2026-05-12\\t56 m2\\t640 000 zł\\nul. Krótka 1, Gdańsk\\t2026-02-02\\t50 m2\\t11000 zł/m2';
    document.querySelector('#szukWczytajWklejone').click();
    await new Promise(r=>setTimeout(r,500));
    return {stan: document.querySelector('#szukWklejenieStan')?.textContent||'',
      waga: document.querySelector('#szukWklejenieStan')?.dataset.waga,
      etapSerwisy: [...document.querySelectorAll('#szukEtapy .szuk-etap')][0].dataset.stan,
      wierszy: document.querySelectorAll('#szukTabela tr').length,
      uwaga: [...document.querySelectorAll('#szukTabela tr')].map(x=>x.textContent).join(' ')};`);
  T('wklejone z serwisu wiersze rozkładają się', /Rozpoznałem 2 wiersze/.test(wklejone.stan), wklejone.stan);
  T('etap serwisów zamyka się jako sprawdzony', wklejone.etapSerwisy === 'sprawdzony', wklejone.etapSerwisy);
  T('wklejone wiersze dochodzą do wyników', wklejone.wierszy === 3, String(wklejone.wierszy));
  T('i są podpisane jako przepisane przez rzeczoznawcę',
    /przepisane przez rzeczoznawcę/.test(wklejone.uwaga));
  T('z ostrzeżeniem, że trzeba je sprawdzić w akcie',
    /sprawdź je w akcie albo w wyciągu/.test(wklejone.uwaga));

  /* =================================== 5. OKIENKO STANU: TRZY KOLORY */
  const stan = await p.ocen(`
    document.querySelector('#szukZamknij').click();
    kontrolaPrzelicz?.(); await new Promise(r=>setTimeout(r,400));
    renderNotifications();
    document.querySelector('#notificationBtn').click();
    await new Promise(r=>setTimeout(r,350));
    const st=stanProgramu();
    return {st, kropek: document.querySelectorAll('#notificationStan .stan-kropka').length,
      klasy: [...document.querySelectorAll('#notificationStan .stan-kropka')].map(x=>x.className.replace('stan-kropka ','')),
      tekst: document.querySelector('#notificationStan')?.textContent||'',
      opis: document.querySelector('#notificationOpis')?.textContent||'',
      badge: document.querySelector('#notificationBadge')?.textContent,
      badgeWaga: document.querySelector('#notificationBadge')?.dataset.waga};`);
  T('okienko pokazuje TRZY liczby', stan.kropek === 3, String(stan.kropek));
  T('w trzech kolorach: czerwonym, pomarańczowym, zielonym',
    stan.klasy[0].includes('stan-blad') && stan.klasy[1].includes('stan-uwaga') && stan.klasy[2].includes('stan-ok'),
    JSON.stringify(stan.klasy));
  T('liczby się zgadzają ze stanem operatu',
    stan.tekst.includes(String(stan.st.czerwone)) && stan.tekst.includes(String(stan.st.zielone)),
    stan.tekst);
  T('program tłumaczy, co znaczy każdy kolor', stan.opis.length > 20, stan.opis);
  T('cyfra w rogu ma kolor najpilniejszej rzeczy',
    ['blad', 'uwaga', 'ok'].includes(stan.badgeWaga), stan.badgeWaga);
  T('i pokazuje to, co najpilniejsze, a nie sumę wszystkiego',
    stan.badge === String(stan.st.czerwone || stan.st.pomaranczowe || 0), `${stan.badge} / ${JSON.stringify(stan.st.czerwone)}`);

  const zielono = await p.ocen(`
    kontrolaWynik={podsumowanie:{bledy:0,uwagi:0,ok:12,gotowosc:100}};
    window.OperoOkno.oznaczPrzeczytane(oknoStan);
    project.narrativesMeta=null;
    renderNotifications();
    const st=stanProgramu();
    return {st, waga: document.querySelector('#notificationStan')?.dataset.waga,
      opis: document.querySelector('#notificationOpis')?.textContent||'',
      badgeWaga: document.querySelector('#notificationBadge')?.dataset.waga};`);
  T('gdy nic nie zagraża, okienko jest zielone', zielono.waga === 'ok', zielono.waga);
  T('i mówi to wprost', /Nic groźnego/.test(zielono.opis), zielono.opis);
  T('cyfra w rogu też zielenieje', zielono.badgeWaga === 'ok');

  const pomarancz = await p.ocen(`
    kontrolaWynik={podsumowanie:{bledy:0,uwagi:4,ok:12,gotowosc:88}};
    renderNotifications();
    return {waga: document.querySelector('#notificationStan')?.dataset.waga,
      opis: document.querySelector('#notificationOpis')?.textContent||''};`);
  T('same uwagi dają pomarańcz, a nie czerwień', pomarancz.waga === 'uwaga', pomarancz.waga);
  T('z wyjaśnieniem, że to nie blokuje, ale podpisuje to człowiek',
    /nie blokuje/.test(pomarancz.opis) && /podpisujesz to Ty/.test(pomarancz.opis), pomarancz.opis);


  /* ============ 6. NAZWISKO ZAMIAST PEŁNEJ NAZWY ULICY + LICZBY W PASKU */
  const nazwisko = await p.ocen(`
    switchTab('project'); await new Promise(r=>setTimeout(r,300));
    // Stub zachowuje sie jak prawdziwy geokoder: bez miejscowosci nie oddaje nic.
    window.__adresWymagaMiasta=true;
    window.__adresKandydaci=[
      {ulica:'Bernarda Chrzanowskiego',miasto:'Gdańsk',dzielnica:'Wrzeszcz',numer:'5',kod:'80-278',gmina:'Gdańsk',powiat:'Gdańsk',wojewodztwo:'POMORSKIE'},
      {ulica:'Bernarda Chrzanowskiego',miasto:'Gdańsk',dzielnica:'Wrzeszcz',numer:'7',kod:'80-278'},
      {ulica:'Chrzanowskiego',miasto:'Sopot',numer:'5',kod:'81-700'},
      {ulica:'Grunwaldzka',miasto:'Gdańsk',dzielnica:'Wrzeszcz',numer:'5'}];
    bazaMiejscowosci=[{nazwa:'Gdańsk',ile:12},{nazwa:'Sopot',ile:3}];
    const ul=document.querySelector('[data-path="property.street"]');
    ul.value='chrzanowskiego'; ul.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,1600));
    const w=document.getElementById(ul.id+'_wybor');
    return {zapytanie: window.__adresZapytanie,
      opcje:[...w.querySelectorAll('.pole-adres-opcja b')].map(x=>x.textContent),
      miasta:[...w.querySelectorAll('.pole-adres-opcja span')].map(x=>x.textContent),
      widoczna: !w.classList.contains('hidden')};`);
  T('program dopytuje o miasta, w których rzeczoznawca pracuje',
    (nazwisko.zapytanie?.znaneMiasta || []).includes('Gdańsk'), JSON.stringify(nazwisko.zapytanie?.znaneMiasta));
  T('samo nazwisko „chrzanowskiego" coś znajduje', nazwisko.widoczna === true);
  T('i pokazuje PEŁNĄ nazwę: „ul. Bernarda Chrzanowskiego"',
    nazwisko.opcje.includes('ul. Bernarda Chrzanowskiego'), JSON.stringify(nazwisko.opcje));
  T('oraz tę samą ulicę w drugim mieście',
    nazwisko.miasta.some(x => /Sopot/.test(x)), JSON.stringify(nazwisko.miasta));
  T('z dzielnicą, gdy rejestr ją zna', nazwisko.miasta.some(x => /Wrzeszcz/.test(x)));
  T('Grunwaldzka nie trafia na listę', !nazwisko.opcje.some(x => /Grunwaldzka/.test(x)));

  const wybranoUlice = await p.ocen(`
    const ul=document.querySelector('[data-path="property.street"]');
    const w=document.getElementById(ul.id+'_wybor');
    [...w.querySelectorAll('.pole-adres-opcja')].find(b=>/Bernarda/.test(b.textContent))
      .dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    await new Promise(r=>setTimeout(r,350));
    return {ulica: ul.value, miasto: document.querySelector('[data-path="property.city"]').value,
      dzielnica: document.querySelector('[data-path="property.district"]').value};`);
  T('po kliknięciu w polu stoi pełna nazwa z rejestru',
    wybranoUlice.ulica === 'Bernarda Chrzanowskiego', wybranoUlice.ulica);
  T('miasto i dzielnica wypełniają się same',
    wybranoUlice.miasto === 'Gdańsk' && wybranoUlice.dzielnica === 'Wrzeszcz',
    `${wybranoUlice.miasto} / ${wybranoUlice.dzielnica}`);

  /* Gdy program naprawdę nic nie znajdzie, nie twierdzi, że ulicy nie ma —
     prosi o miasto i daje je kliknąć. */
  const bezMiasta = await p.ocen(`
    bazaMiejscowosci=[{nazwa:'Gdańsk',ile:12},{nazwa:'Sopot',ile:3}];
    window.__adresKandydaci=[];
    const ul=document.querySelector('[data-path="property.street"]');
    ul.value='niemazachtakiejulicy'; ul.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,1600));
    const w=document.getElementById(ul.id+'_wybor');
    return {stan: document.getElementById(ul.id+'_stan')?.textContent||'',
      miasta:[...w.querySelectorAll('[data-adres-miasto] b')].map(x=>x.textContent),
      widoczna: !w.classList.contains('hidden')};`);
  T('bez wyniku program prosi o miasto, zamiast twierdzić, że ulicy nie ma',
    /Bez miejscowości/.test(bezMiasta.stan), bezMiasta.stan);
  T('i daje miasta do jednego kliknięcia',
    bezMiasta.widoczna && bezMiasta.miasta.includes('Gdańsk'), JSON.stringify(bezMiasta.miasta));

  /* --- liczby w górnym pasku: w całości widoczne --- */
  const liczby = await p.ocen(`
    kontrolaWynik={podsumowanie:{bledy:33,uwagi:4,ok:6,gotowosc:18}};
    renderNotifications();
    await new Promise(r=>setTimeout(r,250));
    const badge=document.querySelector('#notificationBadge');
    const btn=document.querySelector('#notificationBtn');
    const napis=document.querySelector('#notificationNapis');
    const bb=badge.getBoundingClientRect(), pb=btn.getBoundingClientRect();
    const pasek=document.querySelector('.topbar').getBoundingClientRect();
    const widoczny = napis.offsetParent!==null ? napis.getBoundingClientRect() : bb;
    return {napis: napis.textContent,
      liczbaWSrodku: widoczny.top>=pb.top-0.5 && widoczny.bottom<=pb.bottom+0.5
        && widoczny.left>=pb.left-0.5 && widoczny.right<=pb.right+0.5,
      wPasku: widoczny.top>=pasek.top-0.5 && widoczny.bottom<=pasek.bottom+0.5,
      pozycja: getComputedStyle(badge).position};`);
  T('liczba stoi w środku przycisku, nie na jego krawędzi',
    liczby.liczbaWSrodku === true, JSON.stringify(liczby));
  T('i mieści się w górnym pasku w całości', liczby.wPasku === true);
  T('licznik nie jest już wiszącym kółkiem', liczby.pozycja === 'static', liczby.pozycja);
  T('napis mówi, czego jest tyle', /33 do poprawy/.test(liczby.napis), liczby.napis);


  /* ========== 7. OKNO SZUKANIA DAJE SIĘ POWIĘKSZYĆ, A LISTA Z SERWISU
     POKAZUJE SIĘ W PROGRAMIE DO ZAZNACZANIA */
  const okno2 = await p.ocen(`
    switchTab('express');
    document.querySelector('#exZrodla [data-zrodla-wszedzie]').click();
    await new Promise(r=>setTimeout(r,300));
    const o=document.querySelector('#szukOverlay .szuk-okno');
    const przed=Math.round(o.getBoundingClientRect().height);
    document.querySelector('#szukPelny').click();
    await new Promise(r=>setTimeout(r,250));
    const poPelnym=Math.round(o.getBoundingClientRect().height);
    const tabPrzed=Math.round(document.querySelector('.szuk-wyniki').getBoundingClientRect().height);
    document.querySelector('#szukZwin').click();
    await new Promise(r=>setTimeout(r,250));
    const tabPoZwinieciu=Math.round(document.querySelector('.szuk-wyniki').getBoundingClientRect().height);
    return {przed, poPelnym, tabPrzed, tabPoZwinieciu,
      pelnyNapis: document.querySelector('#szukPelny').textContent.trim(),
      uchwyt: Boolean(document.querySelector('#szukUchwyt')),
      resize: getComputedStyle(o).resize};`);
  T('okno szukania rozszerza się na cały ekran', okno2.poPelnym > okno2.przed,
    `${okno2.przed} → ${okno2.poPelnym}`);
  T('przycisk mówi, jak wrócić do zwykłego rozmiaru', /Zwykły rozmiar/.test(okno2.pelnyNapis), okno2.pelnyNapis);
  T('zwinięcie góry oddaje miejsce transakcjom', okno2.tabPoZwinieciu > okno2.tabPrzed,
    `${okno2.tabPrzed} → ${okno2.tabPoZwinieciu}`);
  T('okno da się też rozciągnąć ręcznie', okno2.uchwyt === true && okno2.resize !== 'none', okno2.resize);

  const zeSchowka = await p.ocen(`
    document.querySelector('#szukZwin').click();
    const TAB=String.fromCharCode(9), NL=String.fromCharCode(10);
    window.__schowek = [
      ['ul. Długa 5, Gdańsk','2026-05-12','56 m2','640 000 zł'].join(TAB),
      ['ul. Krótka 1, Gdańsk','2026-02-02','50 m2','11000 zł/m2'].join(TAB),
      ['ul. Szeroka 9, Gdańsk','2026-04-01','61 m2','700 000 zł'].join(TAB),
    ].join(NL);
    document.querySelector('#szukZeSchowka').click();
    await new Promise(r=>setTimeout(r,600));
    const tresc=[...document.querySelectorAll('#szukTabela tr')].map(x=>x.textContent).join(' | ');
    return {stan: document.querySelector('#szukWklejenieStan')?.textContent||'',
      wierszy: document.querySelectorAll('#szukTabela tr').length,
      okienek: document.querySelectorAll('#szukTabela [data-szuk-i]').length,
      zeSerwisu: (tresc.match(/przepisane przez rzeczoznawcę/g)||[]).length,
      tresc,
      naglowek: document.querySelector('#szukWynikiNaglowek')?.textContent||''};`);
  T('„Wczytaj ze schowka" czyta skopiowaną tabelę bez wklejania',
    /Rozpoznałem 3 wiersze/.test(zeSchowka.stan), zeSchowka.stan);
  T('lista z serwisu pokazuje się w programie', zeSchowka.zeSerwisu === 3, String(zeSchowka.zeSerwisu));
  T('razem z transakcją z własnej bazy', zeSchowka.wierszy === 4, String(zeSchowka.wierszy));
  T('i każdą pozycję da się zaznaczyć', zeSchowka.okienek === 4, String(zeSchowka.okienek));
  T('przy każdej z serwisu stoi, że jest przepisana',
    /Długa 5/.test(zeSchowka.tresc) && /Szeroka 9/.test(zeSchowka.tresc), zeSchowka.tresc.slice(0, 120));
  T('nagłówek mówi, ile czego znaleziono',
    /4 transakcje/.test(zeSchowka.naglowek), zeSchowka.naglowek);

  const pustySchowek = await p.ocen(`
    window.__schowek='';
    document.querySelector('#szukZeSchowka').click();
    await new Promise(r=>setTimeout(r,350));
    return document.querySelector('#szukWklejenieStan')?.textContent||'';`);
  T('pusty schowek daje radę, co zrobić, a nie cichy brak reakcji',
    /Zaznacz tabelę w serwisie/.test(pustySchowek), pustySchowek);

  /* Przy dwustu ofertach i jednej transakcji lista transakcji ginie. */
  const filtr = await p.ocen(`
    const S=window.OperoSzukanie;
    S.zakoncz(szukPrzebieg,'dane-gov',{ile:5,pozycje:Array.from({length:5},(_,i)=>({adres:'oferta '+i,cena:5e5,powierzchnia:50}))});
    szukRysuj(); await new Promise(r=>setTimeout(r,200));
    const zOfertami=document.querySelectorAll('#szukTabela tr').length;
    document.querySelector('#szukTylkoTransakcje').checked=true;
    document.querySelector('#szukTylkoTransakcje').dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    const bezOfert=document.querySelectorAll('#szukTabela tr').length;
    const pierwszaZaznaczalna=document.querySelector('#szukTabela [data-szuk-i]')?.dataset.szukI;
    return {zOfertami, bezOfert, naglowek:document.querySelector('#szukWynikiNaglowek')?.textContent||'',
      pierwszaZaznaczalna};`);
  T('oferty dochodzą do listy', filtr.zOfertami === 9, String(filtr.zOfertami));
  T('filtr ukrywa oferty i zostawia transakcje', filtr.bezOfert === 4, String(filtr.bezOfert));
  T('nagłówek rozdziela transakcje od ofert',
    /4 transakcje/.test(filtr.naglowek) && /5 ofert/.test(filtr.naglowek), filtr.naglowek);
  /* Numery pozycji musza wskazywac na pelna liste - inaczej po wlaczeniu
     filtra zaznaczenie przeskoczyloby na inny wiersz. */
  T('zaznaczenia nie przeskakują po włączeniu filtra', filtr.pierwszaZaznaczalna === '0',
    String(filtr.pierwszaZaznaczalna));

  T('po całej tej drodze strona nadal działa bez błędu',
    (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    JSON.stringify(await p.ocen('return (window.__bledy||[]).slice(0,3);')));

  await p.zamknij();
  console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error('BLAD TESTU', e); process.exit(1); });

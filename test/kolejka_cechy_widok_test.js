'use strict';
/**
 * OPERO — to, o co poprosił rzeczoznawca po obejrzeniu długiego szukania:
 *
 *   1. NAJLEPIEJ PASUJĄCE WCHODZĄ OD RAZU, bez klikania okienek.
 *   2. RESZTA IDZIE DO KOLEJKI — jedna pozycja, jedna decyzja, od najbliższej.
 *   3. DUPLIKATY nie wchodzą do zbioru dwa razy.
 *   4. KROK Z SERWISAMI JEST PIERWSZY i daje się zamknąć.
 *   5. EXPRESS MA CECHY I WAGI — bo to operat skrócony, a nie operat bez cech.
 */
const { Przegladarka } = require('./przegladarka');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };

// Wzorzec 54,30 m2 ±20% => 43,44-65,16; z zapasem 25% => 40,72-67,88.
const T_RCN = [
  { zrodloWiersz: 1, adres: 'ul. Kartuska 180, Gdańsk', miejscowosc: 'Gdańsk', data: '2026-06-10',
    cena: 600000, powierzchnia: 55, jednostkowa: 10909, prawo: 'własność', rodzaj: 'sprzedaż', akt: 'A1', uwagi: [] },
  { zrodloWiersz: 2, adres: 'ul. Kartuska 55, Gdańsk', miejscowosc: 'Gdańsk', data: '2026-03-02',
    cena: 520000, powierzchnia: 48, jednostkowa: 10833, prawo: 'własność', rodzaj: 'sprzedaż', akt: 'A2', uwagi: [] },
  // ten sam wiersz drugi raz — rejestr potrafi tak oddać
  { zrodloWiersz: 3, adres: 'Lokale — 1426', miejscowosc: 'Gdańsk', data: '2026-03-02',
    cena: 520000, powierzchnia: 48, jednostkowa: 10833, prawo: 'własność', rodzaj: 'sprzedaż', akt: 'A2', uwagi: [] },
  // z zapasu: 67 m2 wychodzi poza 65,16
  { zrodloWiersz: 4, adres: 'ul. Kartuska 190, Gdańsk', miejscowosc: 'Gdańsk', data: '2026-05-10',
    cena: 720000, powierzchnia: 67, jednostkowa: 10746, prawo: 'własność', rodzaj: 'sprzedaż', akt: 'A3', uwagi: [] },
  // z zapasu: 42 m2 też poza zakresem, ale bliżej niż 67 — ma iść w kolejce PIERWSZE
  { zrodloWiersz: 5, adres: 'ul. Kartuska 12, Gdańsk', miejscowosc: 'Gdańsk', data: '2026-07-01',
    cena: 470000, powierzchnia: 42, jednostkowa: 11190, prawo: 'własność', rodzaj: 'sprzedaż', akt: 'A4', uwagi: [] },
];

const PRZYGOTUJ = `
  document.querySelector('#tutorialSkip')?.click();
  document.querySelector('#app')?.classList.remove('hidden-until-auth');
  const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
  window.confirm=()=>true; document.body.classList.add('motion-reduced'); uiPrefs.mode='expert';`;

const SZUKAJ = `
  window.__dzialkaOdp={ok:true,dzialki:[{id:'x'}],punkty:[{x:472000,y:720000}],punkt:{x:472000,y:720000}};
  window.__rcnOdp={ok:true,pominieto:0,komunikat:'ok',zrodlo:'RCN',transakcje:${JSON.stringify(T_RCN)}};
  window.__bazaKandydaci=[];
  window.__ofertyOdp={ok:true,oferty:[],etapy:[],zrodla:[],statystyka:{ile:0},komunikat:'brak'};
  project.property.city='Gdańsk'; project.property.street='Kartuska'; project.property.usableArea=54.3;
  project.market.transactions=[];
  szukOtworz(); await new Promise(r=>setTimeout(r,800));
  document.querySelector('#szukMiasto').value='Gdańsk';
  document.querySelector('#szukPow').value='54,30';
  document.querySelector('#szukOdchylka').value='20';
  document.querySelector('#szukZapas').value='25';
  document.querySelector('#szukStart').click();
  await new Promise(r=>setTimeout(r,2800));`;

(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — od razu do operatu, kolejka decyzji, cechy w Expresie\n');
  await p.pauza(1800);
  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    await p.ocen('return (window.__bledy||[]).slice(0,3);'));
  await p.ocen(PRZYGOTUJ + ' return 1;');

  /* ============== 1. KOLEJNOSC ETAPOW: CZLOWIEK PIERWSZY */
  const etapy = await p.ocen(`
    szukOtworz(); await new Promise(r=>setTimeout(r,700));
    return {nazwy:[...document.querySelectorAll('#szukEtapy .szuk-etap b')].map(x=>x.textContent.split('transakcje')[0].split('oferty')[0].split('przepisane')[0].trim()),
      numery:[...document.querySelectorAll('#szukEtapy .szuk-etap-nr')].map(x=>x.textContent)};`);
  T('krok 1 to serwisy — ten, który wymaga człowieka', /Deweloperuch/.test(etapy.nazwy[0]), etapy.nazwy[0]);
  T('krok 2 to Rejestr Cen Nieruchomości', /Rejestr Cen/.test(etapy.nazwy[1]), etapy.nazwy[1]);
  T('program pyta pozostałe źródła sam, w tym samym czasie',
    /Twoja własna baza/.test(etapy.nazwy[2]) && /dane\.gov\.pl/.test(etapy.nazwy[3]), etapy.nazwy);

  const odhacz = await p.ocen(`
    document.querySelector('#szukSerwisNic').click();
    await new Promise(r=>setTimeout(r,250));
    return {stan: [...document.querySelectorAll('#szukEtapy .szuk-etap')][0].dataset.stan,
      opis: [...document.querySelectorAll('#szukEtapy .szuk-etap p')][0].textContent};`);
  T('da się odhaczyć, że nic stamtąd nie bierzesz', odhacz.stan === 'sprawdzony', odhacz.stan);
  T('i etap mówi wprost, że jest sprawdzony', /sprawdzony/.test(odhacz.opis), odhacz.opis);

  /* ============== 2. NAJLEPSZE OD RAZU, RESZTA DO KOLEJKI */
  const po = await p.ocen(SZUKAJ + `
    return {wOperacie:(project.market.transactions||[]).length,
      adresy:(project.market.transactions||[]).map(t=>t.address),
      przyjeteWidoczne: !document.querySelector('#szukPrzyjete').classList.contains('hidden'),
      przyjeteTytul: document.querySelector('#szukPrzyjeteTytul').textContent,
      kolejkaWidoczna: !document.querySelector('#szukKolejka').classList.contains('hidden'),
      licznik: document.querySelector('#szukKolejkaLicznik').textContent,
      pierwszaWKolejce: document.querySelector('#szukKolejkaTytul').textContent,
      powod: document.querySelector('#szukKolejkaPowod').textContent,
      wierszy: document.querySelectorAll('#szukTabela tr').length,
      bledy:(window.__bledy||[]).slice(0,3)};`);
  T('najlepiej pasujące weszły do operatu BEZ klikania', po.wOperacie === 2, po.wOperacie);
  T('i są to te z kryteriów, nie te z zapasu',
    po.adresy.join(' ').includes('Kartuska 180') && po.adresy.join(' ').includes('Kartuska 55'), po.adresy);
  T('program mówi, co wstawił sam', /2 transakcje weszły do operatu/.test(po.przyjeteTytul), po.przyjeteTytul);
  T('i daje to cofnąć', po.przyjeteWidoczne === true);

  T('duplikat z rejestru NIE wszedł drugi raz', po.wierszy === 4, po.wierszy);

  T('pozycje z zapasu czekają w kolejce decyzji', po.kolejkaWidoczna === true);
  T('po jednej, z licznikiem', /1 z 2 do decyzji/.test(po.licznik), po.licznik);
  T('pierwsza jest ta BLIŻSZA kryteriom (42 m², nie 67 m²)',
    /Kartuska 12/.test(po.pierwszaWKolejce), po.pierwszaWKolejce);
  T('przy każdej stoi, czym wychodzi poza kryteria',
    /poza zakresem/.test(po.powod), po.powod);

  /* ============== 3. DECYZJE */
  const decyzja = await p.ocen(`
    document.querySelector('#szukKolejkaPrzyjmij').click();
    await new Promise(r=>setTimeout(r,400));
    return {wOperacie:(project.market.transactions||[]).length,
      licznik: document.querySelector('#szukKolejkaLicznik').textContent,
      teraz: document.querySelector('#szukKolejkaTytul').textContent,
      ostrzezenie:(oknoStan.wpisy||[]).map(w=>(w.tekst||'')+' '+(w.szczegoly||'')).join(' | ')};`);
  T('przyjęta pozycja wchodzi do operatu', decyzja.wOperacie === 3, decyzja.wOperacie);
  T('kolejka przechodzi do następnej', /2 z 2 do decyzji/.test(decyzja.licznik), decyzja.licznik);
  T('a program przypomina, że to odejście od kryteriów trzeba uzasadnić',
    /uzasadnieniu doboru/.test(decyzja.ostrzezenie), decyzja.ostrzezenie.slice(-160));

  const odrzucenie = await p.ocen(`
    document.querySelector('#szukKolejkaOdrzuc').click();
    await new Promise(r=>setTimeout(r,400));
    return {wOperacie:(project.market.transactions||[]).length,
      kolejkaUkryta: document.querySelector('#szukKolejka').classList.contains('hidden')};`);
  T('odrzucona pozycja NIE wchodzi do operatu', odrzucenie.wOperacie === 3, odrzucenie.wOperacie);
  T('po ostatniej decyzji kolejka znika', odrzucenie.kolejkaUkryta === true);

  const cofniecie = await p.ocen(`
    document.querySelector('#szukCofnij').click();
    await new Promise(r=>setTimeout(r,500));
    return {wOperacie:(project.market.transactions||[]).length,
      przyjeteUkryte: document.querySelector('#szukPrzyjete').classList.contains('hidden')};`);
  T('„Cofnij dodanie" przywraca operat sprzed szukania', cofniecie.wOperacie === 0, cofniecie.wOperacie);
  T('i karta znika', cofniecie.przyjeteUkryte === true);

  /* ============== 4. EXPRESS: CECHY I WAGI */
  const express = await p.ocen(`
    szukZamknij();
    switchTab('express');
    document.querySelector('[data-ex-typ="local_kcm"]').click();
    await new Promise(r=>setTimeout(r,400));
    window.__rcnOdp={ok:true,pominieto:0,komunikat:'ok',zrodlo:'RCN',transakcje:Array.from({length:6},(_,i)=>({
      zrodloWiersz:i+1,adres:'ul. Testowa '+(i+1)+', Gdańsk',miejscowosc:'Gdańsk',data:'2026-0'+((i%6)+1)+'-10',
      cena:600000+i*25000,powierzchnia:60,jednostkowa:(600000+i*25000)/60,prawo:'własność',rodzaj:'sprzedaż',akt:'B'+i,uwagi:[],uwagiZrodla:''}))};
    document.querySelector('#ex_ulica').value='Kartuska';
    document.querySelector('#ex_miasto').value='Gdańsk';
    document.querySelector('#ex_powierzchnia').value='60';
    document.querySelector('#ex_dataWyceny').value='2026-11-05';
    document.querySelector('#ex_cel').value='Określenie wartości rynkowej dla potrzeb sprzedaży';
    project.property.city='Gdańsk'; project.property.usableArea=60;
    document.querySelector('#exZGeoportalu').click();
    await new Promise(r=>setTimeout(r,1600));
    document.querySelector('#rcnPrzenies')?.click();
    await new Promise(r=>setTimeout(r,700));
    rcnZamknij(); switchTab('express');
    document.querySelector('#exPolicz').click();
    await new Promise(r=>setTimeout(r,1500));
    return {widoczne: !document.querySelector('#exCechy').classList.contains('hidden'),
      cech: document.querySelectorAll('#exCechyLista .ex-cecha').length,
      nazwy: [...document.querySelectorAll('#exCechyLista .ex-cecha-nazwa b')].map(x=>x.textContent),
      wagi: [...document.querySelectorAll('[data-ex-cecha-waga]')].map(x=>x.value),
      opcjiNaCeche: document.querySelectorAll('[data-ex-cecha-ocena]:first-of-type option').length,
      stopnie: [...document.querySelectorAll('[data-ex-cecha-ocena]')][0] ? [...[...document.querySelectorAll('[data-ex-cecha-ocena]')][0].options].map(o=>o.value) : [],
      opisStopnia: document.querySelector('.ex-cecha-opis')?.textContent||'',
      widelki: [...document.querySelectorAll('#exCechyLista .ex-cecha-nazwa i')].map(x=>x.textContent),
      suma: document.querySelector('#exCechySuma')?.textContent||'',
      wagaSumy: document.querySelector('#exCechySuma')?.dataset.waga||'',
      stopka: document.querySelector('#exCechyStopka')?.textContent||'',
      wstep: document.querySelector('#exCechyWstep')?.textContent||'',
      warianty: document.querySelectorAll('#exWarianty [data-wariant-przyjmij]').length,
      bledy:(window.__bledy||[]).slice(0,3)};`);
  T('Express pokazuje cechy rynkowe — to operat skrócony, a nie bez cech', express.widoczne === true);
  T('zestaw jest skrócony: pięć cech, nie cały katalog', express.cech === 5, express.cech);
  T('i są to cechy z katalogu, a nie puste wiersze',
    /Lokalizacja/.test(express.nazwy[0] || ''), express.nazwy);
  T('wagi NIE są równymi po 20% — pochodzą z praktyki',
    new Set(express.wagi).size > 1, express.wagi);
  T('suma wag wychodzi na 100%', /100%/.test(express.suma), express.suma);
  T('i pasek świeci na zielono', express.wagaSumy === 'ok', express.wagaSumy);
  T('ocena jest rozwijaną listą trzech stopni',
    express.stopnie.join('|') === 'Niekorzystna|Przeciętna|Korzystna', express.stopnie);
  T('pod wybranym stopniem stoi jego definicja',
    express.opisStopnia.length > 30, express.opisStopnia.slice(0, 80));
  T('przy każdej cesze stoi przedział wagi z praktyki',
    express.widelki.length === 5 && /%/.test(express.widelki[0] || ''), express.widelki);
  T('program mówi, że to zestaw skrócony', /skrócony/.test(express.wstep), express.wstep);
  T('i że w pełnym operacie wagi trzeba wyprowadzić z analizy',
    /analizy par albo korelacji/.test(express.stopka), express.stopka.slice(-120));
  T('trzy warianty cenowe nadal działają', express.warianty === 3, express.warianty);

  const zmiana = await p.ocen(`
    const sel=[...document.querySelectorAll('[data-ex-cecha-ocena]')][0];
    const przed=(calc||{}).valueRounded;
    sel.value='Korzystna'; sel.dispatchEvent(new Event('change'));
    await new Promise(r=>setTimeout(r,800));
    return {przed, po:(calc||{}).valueRounded,
      ocena:(project.market.features||[])[0]?.rating,
      wListzie: [...document.querySelectorAll('[data-ex-cecha-ocena]')][0].value};`);
  T('zmiana oceny w Expresie przelicza wartość od razu', zmiana.po > zmiana.przed, [zmiana.przed, zmiana.po]);
  T('i zostaje zapamiętana, a nie cofa się przy przerysowaniu',
    zmiana.ocena === 'Korzystna' && zmiana.wListzie === 'Korzystna', [zmiana.ocena, zmiana.wListzie]);

  const wagi = await p.ocen(`
    const pole=[...document.querySelectorAll('[data-ex-cecha-waga]')][0];
    pole.value='60'; pole.dispatchEvent(new Event('change'));
    await new Promise(r=>setTimeout(r,700));
    const zla=document.querySelector('#exCechySuma')?.dataset.waga;
    document.querySelector('#exCechyWyrownaj').click();
    await new Promise(r=>setTimeout(r,700));
    return {zla, po:document.querySelector('#exCechySuma')?.dataset.waga,
      suma: document.querySelector('#exCechySuma')?.textContent||''};`);
  T('zła suma wag świeci ostrzeżeniem', wagi.zla !== 'ok', wagi.zla);
  T('„Wyrównaj do 100%" naprawia ją jednym kliknięciem', wagi.po === 'ok', wagi.suma);

  T('po całej tej drodze strona nadal działa bez błędu',
    (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    await p.ocen('return (window.__bledy||[]).slice(0,3);'));

  await p.zamknij();
  console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error('BLAD TESTU', e); process.exit(1); });

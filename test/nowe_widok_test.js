'use strict';
/**
 * OPERO — cztery rzeczy, o które poprosił rzeczoznawca, sprawdzone w działającym
 * programie:
 *
 *   1. JEDNA RUBRYKA NA ADRES — wpisujesz ulicę, program znajduje miejscowość
 *      i dzielnicę. Gdy ta ulica jest w kilku miastach, PYTA.
 *   2. OKNO ODPOWIEDZI — wszystko, co program mówi, jest w jednym miejscu
 *      i nie trzeba przewijać strony do góry.
 *   3. OFERTY Z dane.gov.pl — program szuka sam i widać, na którym etapie jest.
 *   4. ODRZUCONE TRANSAKCJE — widać je i można je przypisać samemu,
 *      ale tylko z uzasadnieniem, które pójdzie do operatu.
 *
 * Największą wagę ma tu to, czego program ROBIĆ NIE MOŻE: podstawić numeru,
 * wybrać miasta za człowieka, wsunąć ofert do zbioru porównawczego i przyjąć
 * odrzuconej transakcji po cichu.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Przegladarka } = require('./przegladarka');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const KANDYDACI_GDANSK = [
  { ulica: 'Kartuska', miasto: 'Gdańsk', numer: '201', dzielnica: 'Siedlce', gmina: 'Gdańsk', powiat: 'Gdańsk', wojewodztwo: 'POMORSKIE', kod: '80-125', x: 472000, y: 720000 },
  { ulica: 'Kartuska', miasto: 'Gdańsk', numer: '202', dzielnica: 'Siedlce', gmina: 'Gdańsk', powiat: 'Gdańsk', wojewodztwo: 'POMORSKIE', kod: '80-125' },
];
const KANDYDACI_DWA_MIASTA = [
  ...KANDYDACI_GDANSK,
  { ulica: 'Kartuska', miasto: 'Kartuzy', numer: '201', dzielnica: '', gmina: 'Kartuzy', powiat: 'kartuski', wojewodztwo: 'POMORSKIE', kod: '83-300' },
];
const OFERTY = Array.from({ length: 6 }, (_, i) => ({
  zrodloWiersz: i + 1, rodzajDanych: 'oferta', doZbioru: false,
  lokal: `A${i + 1}`, adres: `Kartuska ${200 + i}, 80-125 Gdańsk`, miejscowosc: 'Gdańsk',
  data: '2026-10-30', cena: 500000 + i * 20000, powierzchnia: 50, powierzchniaWyliczona: i % 2 === 0,
  jednostkowa: 10000 + i * 400, deweloper: 'ARMA DEWELOPER', cenaPrzed: null,
  uwagi: ['Cena OFERTOWA z cennika dewelopera — nie jest ceną transakcyjną.'],
  uwagiZrodla: 'Cena OFERTOWA z cennika dewelopera — nie jest ceną transakcyjną.',
}));
/* Zbior z wadami, ktore kontrola MUSI odrzucic: darowizna, duplikat i cena
   razaco odstajaca. To one maja sie pokazac rzeczoznawcy do oceny. */
const TRANSAKCJE = [
  ...Array.from({ length: 5 }, (_, i) => ({
    zrodloWiersz: i + 1, adres: `ul. Dobra ${i + 1}, Gdańsk`, miejscowosc: 'Gdańsk',
    data: `2026-0${i + 1}-10`, cena: 500000 + i * 10000, powierzchnia: 50,
    jednostkowa: (500000 + i * 10000) / 50, prawo: 'własność', rodzaj: 'sprzedaż',
    akt: `Rep. A ${i + 1}/2026`, kw: '', uwagi: [], uwagiZrodla: '',
  })),
  { zrodloWiersz: 6, adres: 'ul. Darowana 1, Gdańsk', miejscowosc: 'Gdańsk', data: '2026-03-01',
    cena: 400000, powierzchnia: 50, jednostkowa: 8000, prawo: 'własność', rodzaj: 'darowizna',
    akt: 'Rep. A 6/2026', kw: '', uwagi: [], uwagiZrodla: '' },
  { zrodloWiersz: 7, adres: 'ul. Dobra 1, Gdańsk', miejscowosc: 'Gdańsk', data: '2026-01-10',
    cena: 500000, powierzchnia: 50, jednostkowa: 10000, prawo: 'własność', rodzaj: 'sprzedaż',
    akt: 'Rep. A 1/2026', kw: '', uwagi: [], uwagiZrodla: '' },
  { zrodloWiersz: 8, adres: 'ul. Pałacowa 1, Gdańsk', miejscowosc: 'Gdańsk', data: '2026-04-10',
    cena: 5000000, powierzchnia: 50, jednostkowa: 100000, prawo: 'własność', rodzaj: 'sprzedaż',
    akt: 'Rep. A 8/2026', kw: '', uwagi: [], uwagiZrodla: '' },
];

(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — jedna rubryka, okno odpowiedzi, oferty, odrzucone (widok)\n');
  await p.pauza(1800);

  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    JSON.stringify(await p.ocen('return (window.__bledy||[]).slice(0,3);')));
  T('wszystkie nowe moduły są wpięte', await p.ocen(
    'return Boolean(window.OperoOkno && window.OperoAdres && window.OperoOferty && window.OperoPisanie);'));

  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=()=>true; switchTab('express');
    document.querySelector('[data-ex-typ="local_kcm"]').click();
    await new Promise(r=>setTimeout(r,500)); return 1;`);

  /* ================================================= 1. JEDNA RUBRYKA NA ADRES */
  const pola = await p.ocen(`return {
    adresowych: document.querySelectorAll('#exPola [data-adres-jedno]').length,
    zRejestru: [...document.querySelectorAll('#exPola [data-z-rejestru]')].map(x=>x.dataset.exPole),
    numer: Boolean(document.querySelector('#ex_numer')),
    numerZRejestru: Boolean(document.querySelector('#ex_numer')?.dataset.zRejestru),
    stan: document.querySelector('#ex_ulica_stan')?.textContent.trim()||'',
    znaczniki: document.querySelectorAll('#exPola .pole-znacznik').length};`);
  T('adres ma JEDNĄ rubrykę, nie sześć', pola.adresowych === 1, String(pola.adresowych));
  T('miejscowość i dzielnica są polami z rejestru',
    pola.zRejestru.includes('miasto') && pola.zRejestru.includes('dzielnica'), JSON.stringify(pola.zRejestru));
  T('numer budynku zostaje przy człowieku', pola.numer && !pola.numerZRejestru);
  T('pola wypełniane przez program są widocznie oznaczone', pola.znaczniki >= 2, String(pola.znaczniki));
  T('program od razu mówi, co zrobić z rubryką', /Wpisz ulicę/.test(pola.stan), pola.stan);

  // Jedno miasto: program wypelnia i mowi, co wypelnil.
  const jedno = await p.ocen(`
    window.__adresKandydaci=${JSON.stringify(KANDYDACI_GDANSK)};
    const pole=document.querySelector('#ex_ulica');
    document.querySelector('#ex_numer').value='201';
    pole.value='Kartuska'; pole.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,1400));
    return {zapytanie: window.__adresZapytanie,
      miasto: document.querySelector('#ex_miasto').value,
      dzielnica: document.querySelector('#ex_dzielnica')?.value||'',
      stan: document.querySelector('#ex_ulica_stan')?.textContent.trim()||'',
      wybor: !document.querySelector('#ex_ulica_wybor')?.classList.contains('hidden'),
      projekt: {gmina: project.property.commune, powiat: project.property.county,
        woj: project.property.voivodeship, kod: project.property.postcode, punkt: project.property.punkt}};`);
  T('program pyta rejestr o wpisaną ulicę i numer',
    jedno.zapytanie?.ulica === 'Kartuska' && jedno.zapytanie?.numer === '201', JSON.stringify(jedno.zapytanie));
  T('miejscowość wypełnia się sama', jedno.miasto === 'Gdańsk', jedno.miasto);
  T('dzielnica wypełnia się sama', jedno.dzielnica === 'Siedlce', jedno.dzielnica);
  T('gmina, powiat i województwo też — do operatu',
    jedno.projekt.gmina === 'Gdańsk' && jedno.projekt.powiat === 'Gdańsk' && /POMORSKIE/i.test(jedno.projekt.woj),
    JSON.stringify(jedno.projekt));
  T('kod pocztowy zapisany', jedno.projekt.kod === '80-125');
  T('współrzędne punktu zapamiętane do szukania transakcji',
    jedno.projekt.punkt?.x === 472000, JSON.stringify(jedno.projekt.punkt));
  T('program mówi, co znalazł i prosi o sprawdzenie',
    /Gdańsk/.test(jedno.stan) && /sprawdź/i.test(jedno.stan), jedno.stan);
  /* Lista pokazuje sie TAKZE przy jednym trafieniu. Czlowiek ma zobaczyc, CO
   program znalazl, zamiast dowiadywac sie tego z pol, ktore same sie
   wypelnily — to wlasnie te przypadki wchodza do operatu niesprawdzone. */
T('przy jednym trafieniu program też pokazuje, co znalazł', jedno.wybor === true);

  // Kilka miast: program PYTA i nie wybiera za czlowieka.
  const wiele = await p.ocen(`
    window.__adresKandydaci=${JSON.stringify(KANDYDACI_DWA_MIASTA)};
    document.querySelector('#ex_miasto').value=''; document.querySelector('#ex_dzielnica').value='';
    document.querySelector('#ex_numer').value='';
    project.property.city=''; project.property.district='';
    const pole=document.querySelector('#ex_ulica');
    pole.value='Kartuska'; pole.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,1400));
    return {wybor: !document.querySelector('#ex_ulica_wybor')?.classList.contains('hidden'),
      opcje: [...document.querySelectorAll('#ex_ulica_wybor .pole-adres-opcja')].map(x=>x.textContent.trim()),
      miasto: document.querySelector('#ex_miasto').value,
      stan: document.querySelector('#ex_ulica_stan')?.textContent.trim()||''};`);
  T('przy kilku miastach program PYTA', wiele.wybor === true);
  T('pokazuje wszystkie miejsca do wyboru', wiele.opcje.length === 2, JSON.stringify(wiele.opcje));
  T('wśród nich jest i Gdańsk, i Kartuzy',
    wiele.opcje.join(' ').includes('Gdańsk') && wiele.opcje.join(' ').includes('Kartuzy'));
  T('i NIE WYBIERA za człowieka', wiele.miasto === '', wiele.miasto);
  T('mówi wprost, że trzeba wskazać swoją', /wskaż swoją/i.test(wiele.stan), wiele.stan);

  const poWyborze = await p.ocen(`
    document.querySelectorAll('#ex_ulica_wybor .pole-adres-opcja')[1]
      .dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    await new Promise(r=>setTimeout(r,400));
    return {miasto: document.querySelector('#ex_miasto').value,
      powiat: project.property.county,
      zaznaczonych: document.querySelectorAll('#ex_ulica_wybor .pole-adres-opcja.wybrana').length,
      nadalWidoczna: !document.querySelector('#ex_ulica_wybor')?.classList.contains('hidden')};`);
  T('po wyborze program wypełnia to, co człowiek wskazał', poWyborze.miasto === 'Kartuzy', poWyborze.miasto);
  T('razem z powiatem tego miejsca', poWyborze.powiat === 'kartuski', poWyborze.powiat);
/* Lista zostaje po wyborze, z zaznaczona pozycja: czlowiek moze zmienic
   zdanie bez wpisywania ulicy od nowa. */
T('lista zostaje widoczna po wyborze', poWyborze.nadalWidoczna === true);
T('a wybrana pozycja jest zaznaczona', poWyborze.zaznaczonych === 1, String(poWyborze.zaznaczonych));

  // Numeru program NIE PODMIENIA.
  const zlyNumer = await p.ocen(`
    window.__adresKandydaci=${JSON.stringify(KANDYDACI_GDANSK)};
    document.querySelector('#ex_numer').value='999';
    const pole=document.querySelector('#ex_ulica');
    pole.value='Kartuska'; pole.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,1400));
    return {numer: document.querySelector('#ex_numer').value,
      stan: document.querySelector('#ex_ulica_stan')?.textContent.trim()||''};`);
  T('numeru wpisanego przez człowieka program NIE podmienia', zlyNumer.numer === '999', zlyNumer.numer);
  T('ale mówi wprost, że tego numeru w rejestrze nie ma',
    /numeru 999/.test(zlyNumer.stan) && /inna nieruchomość/.test(zlyNumer.stan), zlyNumer.stan);

  /* ===================================================== 2. OKNO ODPOWIEDZI */
  const okno = await p.ocen(`
    document.querySelector('#oknoOdpPrzycisk').click();
    await new Promise(r=>setTimeout(r,350));
    return {otwarte: !document.querySelector('#oknoOdp').classList.contains('hidden'),
      grupy: [...document.querySelectorAll('#oknoOdpLista .okno-grupa h5')].map(x=>x.textContent.trim()),
      wpisow: document.querySelectorAll('#oknoOdpLista .okno-wpis').length,
      skrot: document.querySelector('#oknoOdpSkrot').textContent.trim()};`);
  T('okno odpowiedzi otwiera się jednym kliknięciem', okno.otwarte === true);
  T('zbiera to, co program powiedział o adresie',
    okno.grupy.some(g => /Adres/.test(g)), JSON.stringify(okno.grupy));
  T('komunikatów jest w nim wiele, nie jeden', okno.wpisow >= 3, String(okno.wpisow));
  T('skrót ostatniej odpowiedzi widać bez otwierania okna', okno.skrot.length > 5, okno.skrot);

  const oknoFiltr = await p.ocen(`
    document.querySelector('#oknoOdpRodzaj').value='pytanie';
    document.querySelector('#oknoOdpRodzaj').dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,250));
    const tylkoPytania=document.querySelectorAll('#oknoOdpLista .okno-wpis').length;
    const niePytania=document.querySelectorAll('#oknoOdpLista .okno-wpis:not(.okno-pytanie)').length;
    document.querySelector('#oknoOdpRodzaj').value='';
    document.querySelector('#oknoOdpRodzaj').dispatchEvent(new Event('change',{bubbles:true}));
    await new Promise(r=>setTimeout(r,250));
    return {tylkoPytania, niePytania, wszystkie: document.querySelectorAll('#oknoOdpLista .okno-wpis').length};`);
  T('filtr po rodzaju działa', oknoFiltr.tylkoPytania >= 1 && oknoFiltr.niePytania === 0, JSON.stringify(oknoFiltr));
  T('po zdjęciu filtra wracają wszystkie', oknoFiltr.wszystkie > oknoFiltr.tylkoPytania);

  const oknoTekst = await p.ocen(`return window.OperoOkno.doTekstu(oknoStan);`);
  T('całą rozmowę z programem da się wynieść tekstem',
    /ODPOWIEDZI PROGRAMU|Adres nieruchomości/.test(oknoTekst) && oknoTekst.length > 100);
  const zamkniete = await p.ocen(`
    document.querySelector('#oknoOdpZamknij').click(); await new Promise(r=>setTimeout(r,250));
    return document.querySelector('#oknoOdp').classList.contains('hidden');`);
  T('okno zamyka się i nie zasłania pracy', zamkniete === true);

  /* ============================================ 3. OFERTY Z dane.gov.pl */
  const oferty = await p.ocen(`
    window.__ofertyEtapy=[
      {id:'katalog',nazwa:'Katalog deweloperów na dane.gov.pl',opis:'Pytam katalog dane.gov.pl o deweloperów z okolic Gdańsk.'},
      {id:'zbiory',nazwa:'Zbiory z cennikami',opis:'Znalazłem 3 zbiorów z cenami ofertowymi.'},
      {id:'plik',nazwa:'Pobieranie cennika',opis:'Pobieram cennik: Ceny ofertowe ARMA (CSV).'},
      {id:'czytanie',nazwa:'Czytanie cennika',opis:'Z cennika wczytałem 6 ofert.'}];
    window.__ofertyOdp={ok:true,oferty:${JSON.stringify(OFERTY)},etapy:window.__ofertyEtapy,
      zrodla:[{zbior:'Ceny ofertowe ARMA',deweloper:'ARMA DEWELOPER',url:'https://api.dane.gov.pl/resources/r2/file',
        format:'csv',dataDanych:'2026-10-30',
        opis:'Ceny ofertowe rynku pierwotnego — dane otwarte publikowane na podstawie art. 19b ust. 1 ustawy deweloperskiej przez ARMA DEWELOPER, w serwisie dane.gov.pl, plik: https://api.dane.gov.pl/resources/r2/file, stan cennika na 2026-10-30, pobrano 2026-11-03.'}],
      statystyka:{ile:6,mediana:11000,min:10000,max:12000},
      komunikat:'Z dane.gov.pl wczytałem 6 ofert z 1 cennika. To CENY OFERTOWE — do zbioru porównawczego nie wchodzą.'};
    const b=document.querySelector('#exZrodla [data-zrodlo-oferty]');
    b.click(); await new Promise(r=>setTimeout(r,1200));
    return {zapytanie: window.__ofertyZapytanie,
      etapow: document.querySelectorAll('#ofertyEtapy .oferty-etap').length,
      etapy: [...document.querySelectorAll('#ofertyEtapy .oferty-etap p')].map(x=>x.textContent.trim()),
      wierszy: document.querySelectorAll('#ofertyTabela tr').length,
      podsumowanie: document.querySelector('#ofertyPodsumowanie')?.textContent||'',
      zrodla: document.querySelector('#ofertyZrodla')?.textContent||'',
      wZbiorze: (project.market?.transactions||[]).length};`);
  T('program szuka cenników SAM, nie otwiera tylko strony', Boolean(oferty.zapytanie), JSON.stringify(oferty.zapytanie));
  T('szuka dla miasta z operatu', oferty.zapytanie?.miasto === 'Kartuzy' || oferty.zapytanie?.miasto === 'Gdańsk', JSON.stringify(oferty.zapytanie));
  T('widać KAŻDY etap szukania, nie samo kółeczko', oferty.etapow >= 4, String(oferty.etapow));
  T('etapy nazywają źródło i wynik',
    oferty.etapy.some(e => /katalog dane.gov.pl/.test(e)) && oferty.etapy.some(e => /wczytałem 6 ofert/.test(e)),
    JSON.stringify(oferty.etapy));
  T('oferty pokazują się w tabeli', oferty.wierszy === 6, String(oferty.wierszy));
  T('podsumowanie podaje medianę i widełki',
    /11.?000/.test(oferty.podsumowanie) && /10.?000/.test(oferty.podsumowanie), oferty.podsumowanie.slice(0, 200));
  T('program OSTRZEGA, że to oferty, a nie transakcje',
    /ceny ofertowe, nie transakcyjne/i.test(oferty.podsumowanie), oferty.podsumowanie.slice(0, 200));
  T('źródło da się wskazać w operacie: deweloper, plik, data',
    /ARMA DEWELOPER/.test(oferty.zrodla) && /resources\/r2\/file/.test(oferty.zrodla) && /2026-10-30/.test(oferty.zrodla),
    oferty.zrodla.slice(0, 160));
  T('powierzchnia wyliczona jest oznaczona jako wyliczona',
    (await p.ocen(`return document.querySelectorAll('#ofertyTabela .oferty-wyliczone').length;`)) >= 1);
  T('NIC z ofert nie weszło do zbioru porównawczego', oferty.wZbiorze === 0, String(oferty.wZbiorze));

  const ofertyDoOperatu = await p.ocen(`
    document.querySelector('#ofertyDoOperatu').click(); await new Promise(r=>setTimeout(r,500));
    return {analiza: project.market?.offerAnalysis||null,
      transakcji: (project.market?.transactions||[]).length};`);
  T('oferty wchodzą do operatu jako ANALIZA RYNKU',
    ofertyDoOperatu.analiza?.ile === 6 && ofertyDoOperatu.analiza?.rodzaj === 'oferty',
    JSON.stringify(ofertyDoOperatu.analiza));
  T('i nadal nie wchodzą do zbioru porównawczego', ofertyDoOperatu.transakcji === 0);
  T('analiza niesie źródła do wskazania',
    (ofertyDoOperatu.analiza?.zrodla || []).some(z => /art. 19b/.test(z)));

  /* ====================================== 4. ODRZUCONE TRANSAKCJE DO OCENY */
  const odrzucone = await p.ocen(`
    window.__dzialkaOdp={ok:true,dzialki:[{id:'x',numer:'1',gmina:'Gdańsk',powiat:'Gdańsk'}],punkty:[{x:472000,y:720000}],punkt:{x:472000,y:720000}};
    window.__rcnOdp={ok:true,transakcje:${JSON.stringify(TRANSAKCJE)},pominieto:0,
      komunikat:'Z Rejestru Cen Nieruchomości pobrano 8 transakcji.',zrodlo:'RCN GUGiK'};
    project.property.city='Gdańsk'; project.property.usableArea=50;
    project.valuation.valuationDate='2026-09-01';
    document.querySelector('#exZGeoportalu').click();
    await new Promise(r=>setTimeout(r,1500));
    return {pokazOdrzucone: document.querySelector('#rcnPokazOdrzucone')?.checked,
      wierszy: document.querySelectorAll('#rcnTabela tr').length,
      odrzuconych: document.querySelectorAll('#rcnTabela tr.rcn-odrzucona').length,
      przyciskow: document.querySelectorAll('#rcnTabela [data-rcn-mimo]').length,
      powody: [...document.querySelectorAll('#rcnTabela .rcn-powod')].map(x=>x.textContent.trim())};`);
  T('odrzucone są widoczne OD RAZU, bez szukania przełącznika', odrzucone.pokazOdrzucone === true);
  T('odrzucone wiersze są w tabeli', odrzucone.odrzuconych >= 3, String(odrzucone.odrzuconych));
  T('przy każdym odrzuconym jest powód', odrzucone.powody.length === odrzucone.odrzuconych, JSON.stringify(odrzucone.powody));
  T('powody są konkretne, nie „nie przeszło"',
    odrzucone.powody.some(x => /darowizna|sprzedaż rynkowa/i.test(x))
    && odrzucone.powody.some(x => /duplikat/i.test(x))
    && odrzucone.powody.some(x => /odstaje/i.test(x)), JSON.stringify(odrzucone.powody));
  T('każdy odrzucony ma przycisk „przypisz mimo to"',
    odrzucone.przyciskow === odrzucone.odrzuconych, `${odrzucone.przyciskow} / ${odrzucone.odrzuconych}`);

  // Bez uzasadnienia program odrzuconej transakcji NIE przyjmie.
  const bezUzasadnienia = await p.ocen(`
    window.prompt=()=>'';
    document.querySelector('#rcnTabela [data-rcn-mimo]').click();
    await new Promise(r=>setTimeout(r,350));
    return {przypisanych: rcnStan.przypisaneMimo.size,
      ostatnie: window.OperoOkno.skrot(oknoStan)};`);
  T('bez uzasadnienia odrzucona transakcja NIE jest przypisana', bezUzasadnienia.przypisanych === 0);
  T('i program mówi, dlaczego', /bez uzasadnienia/i.test(bezUzasadnienia.ostatnie), bezUzasadnienia.ostatnie);

  const zUzasadnieniem = await p.ocen(`
    window.prompt=()=>'Ta sama klatka schodowa i identyczny metraż — pasuje mimo przekroczenia okresu.';
    document.querySelector('#rcnTabela [data-rcn-mimo]').click();
    await new Promise(r=>setTimeout(r,400));
    return {przypisanych: rcnStan.przypisaneMimo.size,
      zaznaczonych: rcnStan.zaznaczone.size,
      info: document.querySelector('#rcnMimoInfo')?.textContent.trim()||'',
      uzasadnienieWTabeli: document.querySelector('#rcnTabela .rcn-uzasadnienie')?.textContent.trim()||'',
      powodZostal: document.querySelectorAll('#rcnTabela tr.rcn-przypisana-mimo .rcn-powod').length};`);
  T('z uzasadnieniem transakcja zostaje przypisana', zUzasadnieniem.przypisanych === 1);
  T('uzasadnienie widać przy wierszu',
    /klatka schodowa/.test(zUzasadnieniem.uzasadnienieWTabeli), zUzasadnieniem.uzasadnienieWTabeli);
  T('powód odrzucenia ZOSTAJE obok uzasadnienia', zUzasadnieniem.powodZostal === 1);
  T('program mówi, co z tego wynika dla weryfikatora',
    /weryfikator/.test(zUzasadnieniem.info), zUzasadnieniem.info);

  const doOperatu = await p.ocen(`
    document.querySelector('#rcnPrzenies')?.click();
    await new Promise(r=>setTimeout(r,800));
    const mimo=(project.market.transactions||[]).filter(t=>t.przypisanaMimoOdrzucenia);
    return {ile: (project.market.transactions||[]).length,
      mimo: mimo.length,
      powod: mimo[0]?.powodOdrzucenia||'',
      uzasadnienie: mimo[0]?.uzasadnienieRzeczoznawcy||''};`);
  T('przypisana odrzucona transakcja wchodzi do operatu', doOperatu.mimo === 1, JSON.stringify(doOperatu));
  T('razem z powodem odrzucenia', doOperatu.powod.length > 5, doOperatu.powod);
  T('i z uzasadnieniem rzeczoznawcy', /klatka schodowa/.test(doOperatu.uzasadnienie), doOperatu.uzasadnienie);
  T('pozostałe transakcje też są w operacie', doOperatu.ile >= 4, String(doOperatu.ile));

  /* ============================== 5. EXPRESS PISZE OPERAT (model lokalny) */
  const pisanie = await p.ocen(`
    switchTab('express');
    document.querySelector('#ex_ulica').value='Kartuska';
    document.querySelector('#ex_numer').value='201';
    document.querySelector('#ex_miasto').value='Gdańsk';
    document.querySelector('#ex_powierzchnia').value='54,30';
    document.querySelector('#ex_dataWyceny').value='2026-11-03';
    document.querySelector('#ex_cel').value='sprzedaż';
    document.querySelector('#exPolicz').click();
    await new Promise(r=>setTimeout(r,900));
    return {policzone: Boolean(expressWynik),
      braki: document.querySelector('#exBraki')?.textContent.trim()||'',
      dane: expressDane(),
      przycisk: Boolean(document.querySelector('#exNapiszBtn'))};`);
  T('Express liczy operat z danych w jednej rubryce adresu', pisanie.policzone === true,
    `${pisanie.braki} | ${JSON.stringify(pisanie.dane)}`);
  T('i oferuje napisanie całego operatu', pisanie.przycisk === true);

  const napisane = await p.ocen(`
    window.__perTeksty={
      market:'Rynek lokalny badano w Gdańsku. Zbiór porównawczy liczy 5 transakcji. Mediana wyniosła 14 700 zł/m² według danych GUS.',
    };
    document.querySelector('#exNapiszBtn').click();
    await new Promise(r=>setTimeout(r,2500));
    return {rozdzialow: document.querySelectorAll('#exNapisane .pisanie-rozdzial').length,
      polecen: (window.__perPolecenia||[]).length,
      pierwszePolecenie: (window.__perPolecenia||[])[0]?.prompt||'',
      doSprawdzenia: document.querySelectorAll('#exNapisane .pisanie-sprawdz').length,
      ostrzezenie: document.querySelector('#exNapisane .pisanie-ostrzezenie')?.textContent.trim()||'',
      znacznik: document.querySelector('#exNapisane .pisanie-znacznik')?.textContent.trim()||''};`);
  T('program pisze wszystkie rozdziały opisowe', napisane.rozdzialow >= 10, String(napisane.rozdzialow));
  T('każdy rozdział dostaje osobne polecenie', napisane.polecen >= 10, String(napisane.polecen));
  T('polecenie zabrania liczb spoza danych operatu',
    /NIE PODAWAJ ŻADNEJ LICZBY/.test(napisane.pierwszePolecenie));
  T('polecenie zawiera tylko fakty z operatu, bez internetu',
    /FAKTY \(jedyny dopuszczalny materiał\)/.test(napisane.pierwszePolecenie)
    && /Kartuska/.test(napisane.pierwszePolecenie), napisane.pierwszePolecenie.slice(0, 120));
  T('WYMYŚLONA przez model liczba jest wyłapana', napisane.doSprawdzenia >= 1, String(napisane.doSprawdzenia));
  T('program mówi, która wartość jest podejrzana',
    /14.?700/.test(napisane.ostrzezenie), napisane.ostrzezenie);
  T('program nie udaje, że to gotowy operat',
    /Projekt rozdziału/.test(napisane.znacznik) && /rzeczoznawcę/.test(napisane.znacznik), napisane.znacznik);

  const przyjete = await p.ocen(`
    window.confirm=()=>true;
    document.querySelector('#pisanieDoOperatu').click();
    await new Promise(r=>setTimeout(r,700));
    return {rozdzialow: Object.keys(project.narratives||{}).length,
      meta: project.narrativesMeta||null,
      rynek: (project.narratives||{}).market||''};`);
  T('napisane rozdziały wchodzą do operatu', przyjete.rozdzialow >= 10, String(przyjete.rozdzialow));
  T('operat pamięta, że napisał je model', /PER/.test(przyjete.meta?.przez || ''), JSON.stringify(przyjete.meta?.przez));
  T('i pamięta, co zostało do sprawdzenia',
    (przyjete.meta?.doSprawdzenia || []).some(x => x.rozdzial === 'market'), JSON.stringify(przyjete.meta?.doSprawdzenia));
  T('tekst rozdziału jest w operacie', /Rynek lokalny badano/.test(przyjete.rynek), przyjete.rynek.slice(0, 60));


  /* ========================== 6. PASEK ODPOWIEDZI W GÓRNYM PASKU
     Komunikat schowany pod ikoną to komunikat przegapiony. Rzeczoznawca
     patrzy w pole, które wypełnia — więc odpowiedź programu musi stać nad
     tym polem i jechać razem z przewijaniem. */
  const pasek = await p.ocen(`
    switchTab('express');
    return {jest: Boolean(document.querySelector('#pasekOdp')),
      widoczny: !document.querySelector('#pasekOdp').classList.contains('hidden'),
      tekst: document.querySelector('#pasekOdpTekst')?.textContent.trim()||'',
      grupa: document.querySelector('#pasekOdpGrupa')?.textContent.trim()||'',
      wGornymPasku: Boolean(document.querySelector('.topbar #pasekOdp')),
      przyklejony: getComputedStyle(document.querySelector('.topbar')).position};`);
  T('pasek odpowiedzi jest w programie', pasek.jest === true);
  T('i stoi w GÓRNYM pasku, nie na dole strony', pasek.wGornymPasku === true);
  T('górny pasek jest przyklejony, więc jedzie z przewijaniem',
    pasek.przyklejony === 'sticky', pasek.przyklejony);
  T('pasek pokazuje treść, a nie samą ikonę', pasek.tekst.length > 10, pasek.tekst);
  T('i mówi, którego zadania dotyczy', pasek.grupa.length > 2, pasek.grupa);

  // Pasek jest widoczny takze wtedy, gdy strona jest przewinieta na sam dol.
  const poPrzewinieciu = await p.ocen(`
    // Strona musi byc dluga, zeby bylo co przewijac: rozwijamy operat skrocony.
    const rozs=document.querySelector('#exRozszerzony'); if(rozs) rozs.open=true;
    await new Promise(r=>setTimeout(r,150));
    const main=document.querySelector('.main');
    // Przewija sie caly dokument, a nie kolumna - sprawdzamy to, zamiast
    // zakladac, bo od tego zalezy, czy sticky w ogole ma co trzymac.
    const przewijany = (main.scrollHeight - main.clientHeight > 40) ? main : document.scrollingElement;
    przewijany.scrollTo({top: przewijany.scrollHeight, behavior:'instant'});
    await new Promise(r=>setTimeout(r,300));
    const t=document.querySelector('.topbar').getBoundingClientRect();
    const pr=document.querySelector('#pasekOdp').getBoundingClientRect();
    return {gornyWidoczny: t.top >= -1 && t.bottom > 0,
      pasekWidoczny: pr.bottom > 0 && pr.top < window.innerHeight,
      przewiniete: przewijany.scrollTop};`);
  T('po przewinięciu na sam dół górny pasek nadal jest na ekranie',
    poPrzewinieciu.przewiniete > 100 && poPrzewinieciu.gornyWidoczny, JSON.stringify(poPrzewinieciu));
  T('i pasek odpowiedzi razem z nim', poPrzewinieciu.pasekWidoczny === true);

  // KAZDY komunikat programu trafia na pasek - takze te, ktore dotad gasly
  // na dole ekranu po kilku sekundach.
  const kazdy = await p.ocen(`
    window.OperoOkno.oznaczPrzeczytane(oknoStan);
    showStatus('Wybrano rodzaj operatu: lokal mieszkalny.', 'info', 3000);
    await new Promise(r=>setTimeout(r,250));
    return {pasek: document.querySelector('#pasekOdpTekst')?.textContent.trim()||'',
      wOknie: (oknoStan.wpisy||[]).some(w=>/Wybrano rodzaj operatu/.test(w.tekst)),
      grupa: document.querySelector('#pasekOdpGrupa')?.textContent.trim()||''};`);
  T('zwykły komunikat programu też trafia na pasek',
    /Wybrano rodzaj operatu/.test(kazdy.pasek), kazdy.pasek);
  T('i zostaje w oknie odpowiedzi, choć na dole już zgasł', kazdy.wOknie === true);
  T('program sam nazywa zadanie po rubryce, w której jesteś', kazdy.grupa === 'Express', kazdy.grupa);

  // Pytanie do czlowieka ma wlasny licznik - to ono blokuje prace.
  const pytanie = await p.ocen(`
    mowi('Podaj powierzchnię użytkową lokalu.', {rodzaj:'pytanie', grupa:'Express', pasek:false});
    await new Promise(r=>setTimeout(r,250));
    return {tekst: document.querySelector('#pasekOdpTekst')?.textContent.trim()||'',
      rodzaj: document.querySelector('#pasekOdp')?.dataset.rodzaj||'',
      pilne: document.querySelector('#pasekOdpPilne')?.textContent.trim()||'',
      pilneWidoczne: !document.querySelector('#pasekOdpPilne')?.classList.contains('hidden')};`);
  T('pytanie wychodzi na pasek', /powierzchnię użytkową/.test(pytanie.tekst), pytanie.tekst);
  T('pasek zmienia wygląd przy pytaniu', pytanie.rodzaj === 'pytanie', pytanie.rodzaj);
  T('i pokazuje licznik spraw do człowieka', pytanie.pilneWidoczne && /do Ciebie/.test(pytanie.pilne), pytanie.pilne);

  const zPaska = await p.ocen(`
    document.querySelector('#pasekOdpWiecej').click();
    await new Promise(r=>setTimeout(r,300));
    const otwarte = !document.querySelector('#oknoOdp').classList.contains('hidden');
    document.querySelector('#oknoOdpZamknij').click();
    return otwarte;`);
  T('z paska otwiera się pełne okno odpowiedzi', zPaska === true);

  T('po całej tej drodze strona nadal działa bez błędu',
    (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    JSON.stringify(await p.ocen('return (window.__bledy||[]).slice(0,3);')));

  await p.zamknij();
  console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error('BLAD TESTU', e); process.exit(1); });

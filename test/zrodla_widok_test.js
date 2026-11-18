'use strict';
/**
 * OPERO — szukanie cen i pola pilnowane, w działającym programie.
 *
 * Trzy rzeczy, których ten test pilnuje najmocniej, bo ich złamanie kosztuje
 * rzeczoznawcę operat:
 *   1. OFERTA TO NIE TRANSAKCJA — program nie może ich pomylić ani pozwolić
 *      pomylić człowiekowi,
 *   2. pusty wynik z rejestru NIE znaczy „nie było transakcji",
 *   3. cyfry wpisanej przez człowieka program nie podmienia — nawet trafnie.
 */
const fs = require('node:fs');
const path = require('node:path');
const { Przegladarka } = require('./przegladarka');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const DZIALKA = { id: '226101_1.0001.123/4', numer: '123/4', obreb: 'Śródmieście', gmina: 'Gdańsk', powiat: 'Gdańsk', wojewodztwo: 'pomorskie' };
const TRANSAKCJE = Array.from({ length: 9 }, (_, i) => ({
  zrodloWiersz: i + 1, adres: `ul. Testowa ${i + 1}, Gdańsk`, miejscowosc: 'Gdańsk',
  data: `2026-0${(i % 8) + 1}-10`, cena: 450000 + i * 9000, powierzchnia: 50,
  jednostkowa: (450000 + i * 9000) / 50, prawo: 'własność', rodzaj: 'sprzedaż',
  akt: `Rep. A ${i + 1}/2026`, kw: '', uwagi: [], uwagiZrodla: '',
}));

(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO — skąd wziąć ceny (widok)\n');
  await p.pauza(1800);

  T('strona wstaje bez bledu', (await p.ocen('return (window.__bledy||[]).length;')) === 0,
    JSON.stringify(await p.ocen('return (window.__bledy||[]).slice(0,3);')));

  await p.ocen(`document.querySelector('#tutorialSkip')?.click();
    document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=()=>true; switchTab('express');
    document.querySelector('[data-ex-typ="local_kcm"]').click();
    await new Promise(r=>setTimeout(r,500)); return 1;`);

  /* ================================= panel źródeł */
  const panel = await p.ocen(`return {
    ile: document.querySelectorAll('#exZrodla .zrodlo').length,
    nazwy: [...document.querySelectorAll('#exZrodla .zrodlo b')].map(x=>x.textContent.trim()),
    etykiety: [...document.querySelectorAll('#exZrodla .zrodlo-etykieta')].map(x=>x.textContent.trim()),
    glowa: document.querySelector('#exZrodla .zrodla-glowa')?.textContent.trim()||''};`);
  T('program pokazuje całą drogę szukania cen, nie jeden przycisk', panel.ile >= 6, String(panel.ile));
  T('pierwszy jest Rejestr Cen Nieruchomości', /Rejestr Cen/.test(panel.nazwy[0]), panel.nazwy[0]);
  T('każde źródło jest podpisane: transakcje czy oferty',
    panel.etykiety.filter(x => x === 'transakcje').length >= 3
    && panel.etykiety.filter(x => /oferty/.test(x)).length >= 2, JSON.stringify(panel.etykiety));
  T('oferty są wprost oznaczone jako NIE do zbioru',
    panel.etykiety.some(x => /nie do zbioru/i.test(x)), JSON.stringify(panel.etykiety));
  T('program mówi, ile ma transakcji i co robi dalej',
    /ani jednej transakcji/i.test(panel.glowa) && /Następny krok/i.test(panel.glowa), panel.glowa);

  /* ================================= pobranie z RCN */
  const zapytanie = await p.ocen(`
    window.__dzialkaOdp={ok:true,dzialki:[${JSON.stringify(DZIALKA)}],punkty:[{x:724000,y:470000}],punkt:{x:724000,y:470000}};
    window.__rcnOdp={ok:true,transakcje:${JSON.stringify(TRANSAKCJE)},pominieto:1,
      komunikat:'Z Rejestru Cen Nieruchomości pobrano 9 transakcji.',zrodlo:'RCN GUGiK'};
    document.querySelector('#ex_miasto').value='Gdańsk';
    document.querySelector('#ex_ulica').value='Długa';
    document.querySelector('#exZGeoportalu').click();
    await new Promise(r=>setTimeout(r,1400));
    return {zapytanie: window.__rcnZapytanie,
      oknoImportu: !document.querySelector('#rcnOverlay')?.classList.contains('hidden'),
      wierszy: document.querySelectorAll('#rcnTabela tr').length};`);
  T('program pyta usługę o obszar wokół nieruchomości',
    zapytanie.zapytanie && zapytanie.zapytanie.x === 724000 && zapytanie.zapytanie.promien >= 500,
    JSON.stringify(zapytanie.zapytanie));
  T('dla lokalu pyta o lokale', (zapytanie.zapytanie?.typy || []).includes('lokale'));
  T('pobrane transakcje trafiają do okna wyboru, a nie wprost do operatu',
    zapytanie.oknoImportu === true && zapytanie.wierszy > 0, JSON.stringify(zapytanie));

  // Sedno: dane z rejestru przechodza TE SAMA kontrole jakosci co wyciag z pliku.
  const kontrola = await p.ocen(`return {
    przyjete: rcnStan?.ocena?.przyjete?.length||0,
    odrzucone: rcnStan?.ocena?.odrzucone?.length||0,
    plik: rcnStan?.plik||'',
    powody: (rcnStan?.ocena?.odrzucone||[]).map(x=>x.powod).slice(0,3)};`);
  T('transakcje z rejestru przechodzą kontrolę jakości', kontrola.przyjete > 0, JSON.stringify(kontrola));
  T('w oknie widać, że źródłem jest Rejestr Cen Nieruchomości',
    /Rejestr Cen Nieruchomości/.test(kontrola.plik), kontrola.plik);

  const doOperatu = await p.ocen(`
    document.querySelector('#rcnPrzenies')?.click();
    await new Promise(r=>setTimeout(r,800));
    return {ile:(project.market.transactions||[]).length,
      zrodlo:(project.market.transactions||[])[0]?.zrodlo?.akt||''};`);
  T('wybrane transakcje wchodzą do operatu', doOperatu.ile >= 3, String(doOperatu.ile));
  T('numer aktu notarialnego idzie razem z transakcją', /Rep\. A/.test(doOperatu.zrodlo), doOperatu.zrodlo);

  const poPobraniu = await p.ocen(`
    expressRysujZrodla(); await new Promise(r=>setTimeout(r,250));
    return {glowa: document.querySelector('#exZrodla .zrodla-glowa')?.textContent.trim()||'',
      zwiniete: document.querySelectorAll('#exZrodla .zrodlo-linijka').length,
      kartTeraz: document.querySelectorAll('#exZrodla .zrodlo-teraz').length,
      etykietaKroku: document.querySelector('#exZrodla .zrodla-teraz-etykieta')?.textContent.trim()||''};`);
  T('po pobraniu program mówi, że transakcji wystarczy',
    /wystarczy/i.test(poPobraniu.glowa), poPobraniu.glowa);
/* Zrodla pokazuja sie PO JEDNYM. Sprawdzone zwijaja sie do linijki
   z wynikiem, a na wierzchu stoi to, w ktorym program jest teraz - osiem
   kart naraz czytalo sie jak spis tresci, a nie jak droga do przejscia. */
T('sprawdzone źródło zwija się do jednej linijki', poPobraniu.zwiniete >= 1, String(poPobraniu.zwiniete));
T('na wierzchu stoi dokładnie jedno źródło — to bieżące', poPobraniu.kartTeraz === 1, String(poPobraniu.kartTeraz));
T('i widać, który to krok z ilu', /Krok \d+ z \d+/.test(poPobraniu.etykietaKroku), poPobraniu.etykietaKroku);

  /* --- pusty wynik ma DWA znaczenia ---
     Sprawdzamy to tam, gdzie czlowiek naprawde czyta: w oknie odpowiedzi i w
     pasku na gorze. Pasek statusu na dole gasnie po kilku sekundach, wiec
     testowanie go znaczyloby testowanie powiadomienia, ktore i tak znika. */
  const pusto = await p.ocen(`
    window.__rcnOdp={ok:true,transakcje:[],pominieto:0,
      komunikat:'W tym obszarze usługa Geoportalu nie zwróciła żadnej transakcji. To nie znaczy, że ich nie było: rejestr obejmuje tylko powiaty, które przesłały dane (w 2026 r. około 320 z 380).',zrodlo:'RCN'};
    document.querySelector('#exZGeoportalu').click();
    await new Promise(r=>setTimeout(r,1300));
    return {okno: (oknoStan.wpisy||[]).map(w=>w.tekst),
      pasek: document.querySelector('#pasekOdpTekst')?.textContent||'',
      pasekWidoczny: !document.querySelector('#pasekOdp')?.classList.contains('hidden')};`);
  T('przy pustym wyniku program NIE twierdzi, że transakcji nie było',
    pusto.okno.some(t => /nie znaczy, że ich nie było/i.test(t)), JSON.stringify(pusto.okno).slice(0, 220));
  T('i mówi to w pasku na górze, a nie tylko w znikającym komunikacie',
    pusto.pasekWidoczny && /nie zwróciła żadnej transakcji/i.test(pusto.pasek), pusto.pasek);

  /* --- strona z ofertami otwiera się, ale program stamtąd nie pobiera --- */
  const oferty = await p.ocen(`
    window.__url=null; window.__st=[]; const s=showStatus; showStatus=(t,typ)=>{window.__st.push(String(t));return s(t,typ);};
    const b=[...document.querySelectorAll('#exZrodla [data-zrodlo-url]')].find(x=>x.dataset.zrodloId==='deweloperuch');
    b.click(); await new Promise(r=>setTimeout(r,400));
    showStatus=s; return {url:window.__url, statusy:window.__st};`);
  T('deweloperuch otwiera się z adresem dla właściwego miasta',
    /deweloperuch\.pl\/ceny-transakcyjne\/gdansk/.test(String(oferty.url)), String(oferty.url));
  T('program mówi wprost, że stamtąd nic nie pobiera',
    oferty.statusy.some(t => /nic nie pobiera/i.test(t)), JSON.stringify(oferty.statusy));

  /* ================================= pola pilnowane */
  const liczby = await p.ocen(`
    const pole=document.querySelector('#ex_powierzchnia');
    pole.value='54abc,2x'; pole.dispatchEvent(new Event('input',{bubbles:true}));
    const poFiltrze=pole.value;
    pole.value='5400'; pole.dispatchEvent(new Event('input',{bubbles:true}));
    pole.dispatchEvent(new Event('blur'));
    await new Promise(r=>setTimeout(r,200));
    const blad=pole.parentElement.querySelector('.pole-blad')?.textContent||'';
    pole.value='54,20'; pole.dispatchEvent(new Event('input',{bubbles:true})); pole.dispatchEvent(new Event('blur'));
    await new Promise(r=>setTimeout(r,200));
    return {poFiltrze, blad, poPoprawie:pole.parentElement.querySelector('.pole-blad')?.textContent||''};`);
  T('do powierzchni nie wchodzą litery', liczby.poFiltrze === '54,2', liczby.poFiltrze);
  T('zbyt duża powierzchnia jest zatrzymana z wyjaśnieniem',
    /dodatkowego zera/.test(liczby.blad), liczby.blad);
  T('po poprawieniu komunikat znika', liczby.poPoprawie === '');

  /* --- numer księgi jak w EKW --- */
  /* Pole numeru ksiegi jest teraz w DWOCH miejscach: w Express i w pelnym
     operacie. Celujemy w to z Expressu, bo tego dotyczy ten test. */
  const kw = await p.ocen(`
    const rozs=document.querySelector('#exRozszerzony'); if(rozs) rozs.open=true; await new Promise(r=>setTimeout(r,150));
    const trzy=document.querySelector('[data-ex-pole="kw"]').closest('label').querySelector('.kw-trzy');
    const kod=trzy.querySelector('.kw-kod'), nr=trzy.querySelector('.kw-numer'),
          c=trzy.querySelector('.kw-kontrolna');
    kod.value='gd1g'; kod.dispatchEvent(new Event('input',{bubbles:true}));
    const poKodzie={wartosc:kod.value, fokusNaNumerze:document.activeElement===nr};
    nr.value='00012345'; nr.dispatchEvent(new Event('input',{bubbles:true}));
    const fokusNaCyfrze=document.activeElement===c;
    c.value='9'; c.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,200));
    const werdykt=trzy.parentNode.querySelector('.kw-trzy-werdykt')||document.querySelector('.kw-trzy-werdykt');
    return {poKodzie, fokusNaCyfrze, stan:werdykt.dataset.stan, tekst:werdykt.textContent,
      wartoscPola:document.querySelector('[data-ex-pole="kw"]').value, cyfraNaEkranie:c.value};`);
  T('kod wydziału zamienia się na wielkie litery', kw.poKodzie.wartosc === 'GD1G');
  T('po czterech znakach kursor przeskakuje do numeru', kw.poKodzie.fokusNaNumerze === true);
  T('po ośmiu cyfrach przeskakuje do cyfry kontrolnej', kw.fokusNaCyfrze === true);
  T('zła cyfra kontrolna jest zatrzymana', kw.stan === 'zle', kw.tekst);
  T('program podaje, jaka byłaby poprawna', /poprawna byłaby/.test(kw.tekst), kw.tekst);
  T('ale NIE podmienia tego, co wpisał człowiek', kw.cyfraNaEkranie === '9');
  T('niepoprawny numer nie trafia do operatu', kw.wartoscPola === '');

  const kwDobry = await p.ocen(`
    const trzy=document.querySelector('[data-ex-pole="kw"]').closest('label').querySelector('.kw-trzy');
    const nr=trzy.querySelector('.kw-numer'), c=trzy.querySelector('.kw-kontrolna');
    nr.value='00272852'; nr.dispatchEvent(new Event('input',{bubbles:true}));
    trzy.querySelector('.kw-kod').value='WL1A';
    trzy.querySelector('.kw-kod').dispatchEvent(new Event('input',{bubbles:true}));
    c.value='9'; c.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,250));
    return {stan:trzy.parentNode.querySelector('.kw-trzy-werdykt').dataset.stan,
      wartosc:document.querySelector('[data-ex-pole="kw"]').value};`);
  T('poprawny numer jest przyjęty i złożony', kwDobry.stan === 'ok' && kwDobry.wartosc === 'WL1A/00272852/9',
    JSON.stringify(kwDobry));

  const wklejenie = await p.ocen(`
    const trzy=document.querySelector('[data-ex-pole="kw"]').closest('label').querySelector('.kw-trzy');
    const kod=trzy.querySelector('.kw-kod');
    const ev=new Event('paste',{bubbles:true,cancelable:true});
    ev.clipboardData={getData:()=>'GD1G/00012345/1'};
    kod.dispatchEvent(ev);
    await new Promise(r=>setTimeout(r,250));
    return {kod:kod.value, numer:trzy.querySelector('.kw-numer').value,
      cyfra:trzy.querySelector('.kw-kontrolna').value};`);
  T('wklejony cały numer rozkłada się na trzy pola',
    wklejenie.kod === 'GD1G' && wklejenie.numer === '00012345' && wklejenie.cyfra === '1',
    JSON.stringify(wklejenie));

  /* --- podpowiedzi adresów --- */
  const podpowiedzi = await p.ocen(`
    window.__baza=[{id:'1',miejscowosc:'Gdańsk',adres:'ul. Długa 12',data:'2026-01-10',powierzchnia:50,cena:450000,jednostkowa:9000}];
    window.__adresy=[{etykieta:'Długa 14',opis:'Gdańsk · 80-831',zrodlo:'gugik'}];
    await podpowiedziWczytajMiejscowosci();
    const pole=document.querySelector('#ex_miasto');
    pole.value='Gda'; pole.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,900));
    const lista=[...document.querySelectorAll('.podpowiedzi .podpowiedz b')].map(x=>x.textContent);
    const wlasne=document.querySelectorAll('.podpowiedzi .podpowiedz-znak').length;
    document.querySelector('.podpowiedzi .podpowiedz')?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
    await new Promise(r=>setTimeout(r,250));
    return {lista, wlasne, poWyborze:pole.value, zamkniete:document.querySelector('.podpowiedzi').classList.contains('hidden')};`);
  T('podpowiedzi pokazują się po wpisaniu trzech znaków', podpowiedzi.lista.length > 0, JSON.stringify(podpowiedzi.lista));
  T('podpowiedź z własnych danych jest oznaczona', podpowiedzi.wlasne >= 1);
  T('wybór podpowiedzi wpisuje ją do pola', podpowiedzi.poWyborze === 'Gdańsk', podpowiedzi.poWyborze);
  T('po wyborze lista się zamyka', podpowiedzi.zamkniete === true);

  const zrzuty = path.join(__dirname, '..', 'dist', 'zrzuty');
  fs.mkdirSync(zrzuty, { recursive: true });
  await p.ocen(`document.querySelector('#rcnZamknij')?.click();
    document.querySelector('#exZrodla').scrollIntoView({behavior:'instant',block:'center'}); return 1;`);
  await p.pauza(400);
  const r = await p.wyslij('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(zrzuty, 'zrodla-cen.png'), Buffer.from(r.data, 'base64'));

  p.zamknij();
  console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error('BLAD testu:', e.message); process.exit(2); });

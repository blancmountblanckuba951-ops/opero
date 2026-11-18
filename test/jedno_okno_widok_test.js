'use strict';
/** OPERO 3.0 — przypadek Ikara 97/2 w oknie: wrzucenie dokumentów → zespół → cały operat. */
const fs = require('fs'), path = require('path');
const { Przegladarka } = require('./przegladarka');
const D = p => path.join(__dirname, 'dane', p);
const KW = [1, 2, 3, 4, 5].map(i => JSON.parse(fs.readFileSync(D(`ikara-kw/kw${i}.json`), 'utf8')));
const OPIS = fs.readFileSync(D('ikara-opis.txt'), 'utf8'), OGL = fs.readFileSync(D('ikara-ogledziny.json'), 'utf8'), TEKSTY = fs.readFileSync(D('ikara-teksty.json'), 'utf8');
const JPG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
(async () => {
  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  console.log('OPERO 3.0 — jedno okno: Ikara 97/2 (widok)\n');
  await p.pauza(1800);
  T('strona wstaje bez błędu', (await p.ocen('return (window.__bledy||[]).length;')) === 0);
  const pliki = [
    ...KW.map((k, i) => ({ nazwa: `KW dział ${i + 1}.png`, ok: true, rodzaj: 'kw', ocr: { slowa: k.slowa, slowaOryginal: k.slowaOryginal }, zdjecie: { id: 'kw' + i, name: `KW dział ${i + 1}.png`, size: 100 + i, dataUrl: JPG } })),
    ...[1, 2].map(i => ({ nazwa: `rzut-${i}.jpg`, ok: true, rodzaj: 'rzut', tekst: 'SALON SYPIALNIA ŁAZIENKA 336,6', zdjecie: { id: 'r' + i, name: `rzut-${i}.jpg`, size: 200 + i, dataUrl: JPG } })),
    ...Array.from({ length: 12 }, (_, i) => ({ nazwa: `zdjecie-${i}.jpeg`, ok: true, rodzaj: 'zdjecie', zdjecie: { id: 'z' + i, name: `zdjecie-${i}.jpeg`, size: 300 + i, dataUrl: JPG } })),
    { nazwa: 'Podręcznik.pdf', ok: true, rodzaj: 'pdf', sciezka: 'C:/p.pdf', rozmiar: 1 },
    { nazwa: 'wzor-operatu.docx', ok: true, rodzaj: 'word', tekst: 'OPERAT SZACUNKOWY\n1. PRZEDMIOT WYCENY\n' + 'Przedmiotem wyceny jest lokal mieszkalny w budynku w zabudowie bliźniaczej położony w dzielnicy o zabudowie jednorodzinnej. '.repeat(3) + '\n4. Opis lokalizacji\n' + 'Nieruchomość położona jest w dzielnicy o zabudowie jednorodzinnej, w pobliżu terenów zielonych i przystanków komunikacji miejskiej. '.repeat(2) },
    { nazwa: 'stary.doc', ok: false, powod: 'stary format Word (.doc) – zapisz plik jako .docx' },
  ];
  const strony = Array.from({ length: 14 }, (_, i) => ({ nr: i + 1, tekst: i === 4 ? 'Procedura szacowania w podejściu porównawczym metodą korygowania ceny średniej: określenie rynku, aktualizacja cen, cechy rynkowe i wagi, cena średnia, współczynniki korygujące. Rzeczoznawca wycena operat metoda podejście.' : 'Rzeczoznawca majątkowy sporządza operat szacunkowy; wycena nieruchomości wymaga wyboru podejścia i metody zgodnie z ustawą o gospodarce nieruchomościami. Praktyka zawodowa, operat, wycena, metoda.' }));
  await p.ocen(`document.querySelector('#tutorialSkip')?.click(); document.querySelector('#app')?.classList.remove('hidden-until-auth');
    const a=document.querySelector('#authScreen')||document.querySelector('#authGate'); if(a)a.style.display='none';
    window.confirm=()=>true; document.body.classList.add('motion-reduced'); uiPrefs.mode='expert'; uiPrefs.motion='off';
    window.__wsadOdp={canceled:false,pliki:${JSON.stringify(pliki)}};
    window.__pdfOdp={'C:/p.pdf':{ok:true,stron:14,strony:${JSON.stringify(strony)},zOcr:14}};
    window.__perTeksty=${TEKSTY};
    window.__dzialkaOdp={ok:true,punkt:null,punkty:[],dzialki:[{id:'226101_1.0003.1172',numer:'1172',obreb:'0003',gmina:'Gdańsk',powiat:'Gdańsk',wojewodztwo:'pomorskie'}]};
    window.__otoBlad='brak sieci w teście'; window.__rcnOdp={ok:true,transakcje:[],pominieto:0,komunikat:'brak',zrodlo:'RCN'}; window.__bazaKandydaci=[];
    switchTab('dashboard'); const t=document.querySelector('#opisTekst'); t.value=${JSON.stringify(OPIS)}; t.dispatchEvent(new Event('input')); return 1;`);

  const ws = await p.ocen(`await wsadWybierz(); await new Promise(r=>setTimeout(r,300));
    const grupy=Object.fromEntries([...document.querySelectorAll('#wsadLista .wsad-grupa')].map(g=>[g.dataset.rodzaj, Number(g.querySelector('em').textContent)]));
    return {grupy, kw:document.querySelector('#opisKwTekst').value.length, foto:project.photos.length, rzut:project.photos.filter(x=>x.rodzajDokumentu==='rzut').length,
      zal:project.attachments.some(x=>/rzut/i.test(x)), okladka:project.photos.filter(x=>x.cover).length, okladkaKw:project.photos.find(x=>x.cover)?.rodzajDokumentu||'',
      wiedza:(window.__wiedza&&window.__wiedza.dokumenty||[]).length, wzorce:(studioPamiec.wzorce||[]).length, stan:document.querySelector('#wsadStan').textContent, znaczek:document.querySelector('#agenciPodrecznik').textContent};`);
  T('wrzucone pliki rozpoznane i pogrupowane', ws.grupy.kw === 5 && ws.grupy.rzut === 2 && ws.grupy.zdjecie === 12 && ws.grupy.podrecznik === 1 && ws.grupy.wzor === 1 && ws.grupy.blad === 1, ws.grupy);
  T('zrzuty księgi trafiły do Agenta Ksiąg jako tekst', ws.kw > 500, ws.kw);
  T('zdjęcia, rzuty i obrazy księgi w dokumentacji; okładką jest zdjęcie, nie zrzut', ws.foto === 19 && ws.rzut === 2 && ws.okladka === 1 && ws.okladkaKw === 'zdjecia', ws);
  T('rzut dopisany do wykazu załączników', ws.zal);
  T('podręcznik w PDF zapamiętany jako wiedza, operat Word jako wzór stylu', ws.wiedza === 1 && ws.wzorce === 1 && /14 stron/.test(ws.znaczek), [ws.wiedza, ws.wzorce, ws.znaczek]);

  const r = await p.ocen(`window.__zdjeciaOdp={ok:true,text:${JSON.stringify(OGL)},zdjec:12};
    window.__chmura={wlaczony:true,zgoda:true,dostawca:'anthropic',model:'model-test'}; window.__chmuraKlucz='klucz-testowy-0123456789'; await mozgOdswiez();
    const rap=await agenciUruchom(); await new Promise(r=>setTimeout(r,600));
    const p=project, pr=p.agenci.przebieg, std=(p.market.features||[]).find(f=>/Standard/.test(f.name));
    return {gotowy:rap.gotowy, kw:p.legal.kwLocal, pow:p.property.usableArea, kwArea:p.property.kwArea, pokoje:p.property.rooms, izby:p.legal.ioRooms, udzial:p.legal.commonShare, kwWsp:p.legal.kwCommon,
      dz:p.egib.plotNo, obreb:p.egib.district, wlasc:p.legal.ownerNames, iii:p.legal.sectionIII, adres:[p.property.city,p.property.street,p.property.buildingNo,p.property.localNo].join('|'),
      pietro:p.property.floor, og:p.valuation.inspectionDate, segment:p.property.segmentType, cechy:(p.market.features||[]).map(f=>f.name), std:std&&[std.rating,std.ratingNote.slice(0,30)],
      dach:p.building.roof, kuchnia:p.local.kitchenType, opisLokalu:(p.local.description||'').slice(0,40), zapytanieZdjec:(window.__zdjeciaZapytanie||{}).zdjecia?.length||0,
      metodyk:pr.agenci.metodyk.zrobione, decyzjePodr:(p.agenci.rozumowanie.decyzje||[]).filter(d=>(d.podrecznik||[]).length).length,
      podglad:(document.querySelector('#studioOperatPodglad')?.srcdoc||'').length, podgladIkara:/Ikara/i.test(document.querySelector('#studioOperatPodglad')?.srcdoc||''),
      wartosc:Number(calc?.valueRounded)||0, raport:document.querySelector('#agenciRaport').textContent, polecenia:(window.__perPolecenia||[]).map(x=>x.prompt).join('\\n'), bledy:(window.__bledy||[]).length};`);
  T('zespół doszedł do końca', r.gotowy, r);
  T('księga ze zrzutów: numer, powierzchnia, izby, udział, księga wspólna', r.kw === 'GD1G/00380276/5' && r.kwArea === 113.73 && r.pow === 113.73 && r.pokoje === 4 && /garaż/.test(r.izby) && r.udzial === '11373/22745' && r.kwWsp === 'GD1G/00374430/8', r);
  T('działka i obręb z identyfikatora lokalu', r.dz === '1172' && r.obreb === '0003', [r.dz, r.obreb]);
  T('stan prawny: właściciel bez PESEL, dział III „brak wpisów"', r.wlasc === 'Anna Nowak' && /Brak wpisów/.test(r.iii), [r.wlasc, r.iii]);
  T('adres z opisu, lokal dwupoziomowy, data oględzin z opisu', r.adres === 'Gdańsk|Ikara|97|2' && /dwupoziomowy/.test(r.pietro) && r.og === '2026-11-01', [r.adres, r.pietro, r.og]);
  T('zestaw cech dla zabudowy bliźniaczej (garaż, ogródek)', r.segment === 'zabudowa bliźniacza' && r.cechy.some(c => /Garaż/.test(c)) && r.cechy.some(c => /Ogródek/.test(c)), r.cechy);
  T('Agent Oględzin: standard „Korzystna" ze zdjęć z uzasadnieniem, tabele budynku i lokalu wypełnione', r.std && r.std[0] === 'Korzystna' && /Z oglądu zdjęć/.test(r.std[1]) && /dwuspadowy/.test(r.dach) && /aneks/.test(r.kuchnia) && /dwupoziomowy/i.test(r.opisLokalu) && r.zapytanieZdjec >= 8, r);
  T('Agent Metodyk powołuje się na strony podręcznika, tok rozumowania też', r.metodyk.some(x => /Podręcznik, s\. \d+/.test(x)) && r.decyzjePodr >= 1, r.metodyk);
  T('polecenia dla modelu niosą zasady z podręcznika i wzór stylu', /ZASADY Z PODRĘCZNIKA/.test(r.polecenia) && /WZÓR STYLU/.test(r.polecenia));
  T('bez transakcji nie ma wartości, a raport mówi dlaczego', r.wartosc === 0 && /Nie znalazłem żadnej transakcji/.test(r.raport), r.wartosc);
  T('na końcu cały operat w podglądzie', r.podglad > 20000 && r.podgladIkara, r.podglad);
  T('bez błędów skryptu', r.bledy === 0, await p.ocen('return (window.__bledy||[]).slice(0,3);'));

  const rcn = await p.ocen(`window.__wsadOdp={canceled:false,pliki:[{nazwa:'wyciag.xlsx',ok:true,rodzaj:'arkusz',arkusze:[{nazwa:'A',wiersze:[['x']]}]}]};
    const stary=window.operatAPI.bazaDodaj; window.operatAPI.bazaDodaj=async(l)=>{window.__bazaL=l;return {dodane:24,pominiete:2,razem:24};};
    await wsadWybierz(); window.operatAPI.bazaDodaj=stary; const g=document.querySelector('#wsadLista .wsad-grupa[data-rodzaj="rcn"]');
    return {plik:window.__bazaL&&window.__bazaL.plik, tekst:g&&g.textContent};`);
  T('wyciąg z rejestru cen (Excel) idzie prosto do Bazy rynku', rcn.plik === 'wyciag.xlsx' && /24 transakcji/.test(rcn.tekst), rcn);

  await p.zamknij();
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

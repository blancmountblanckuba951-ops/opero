'use strict';
/** OPERO 2.0 — moduły zespołu agentów: opis, przebieg, weryfikator, WhatsApp, model w chmurze, pamięć wzorców. */
const K = n => require('/root/work/build/app/renderer/' + n);
const O = K('opis-operatu.js'), A = K('agenci.js'), W = K('weryfikator.js'), WA = K('whatsapp.js'), C = K('model-chmura.js'), P = K('pamiec-wzorcow.js');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
console.log('OPERO — zespół agentów (logika)\n');

// ---- opis
const t1 = 'Mieszkanie 3-pokojowe 54,30 m2 na 2 piętrze, ul. Ikara 97/12, Gdańsk. KW GD1G/00012345/6. Wycena pod kredyt hipoteczny dla banku. Zleceniodawca: Jan Kowalski. Cena ofertowa 650 tys. zł. Budynek z roku 1978.';
const w1 = O.czytaj(t1), f = k => (w1.fakty.find(x => x.klucz === k) || {}).wartosc;
T('opis: rodzaj nieruchomości', f('rodzaj') === 'lokal_mieszkalny');
T('opis: numer księgi', f('kw') === 'GD1G/00012345/6');
T('opis: ulica, numer budynku i lokalu', f('street') === 'Ikara' && f('buildingNo') === '97' && f('unitNo') === '12', [f('street'), f('buildingNo'), f('unitNo')]);
T('opis: miejscowość po przecinku', f('city') === 'Gdańsk');
T('opis: powierzchnia z przecinkiem', f('usableArea') === 54.3);
T('opis: pokoje i piętro', f('rooms') === 3 && f('floor') === 2);
T('opis: cena ofertowa w tysiącach', f('askingPrice') === 650000);
T('opis: rok budowy', f('yearBuilt') === 1978);
T('opis: cel z kontekstu (kredyt)', /kredytodawcy/.test(f('cel')));
T('opis: zleceniodawca bez następnego zdania', f('klient') === 'Jan Kowalski', f('klient'));
T('opis: każdy fakt ma fragment źródłowy', w1.fakty.every(x => x.skad && x.skad.length > 3));
T('opis: komplet danych – brak braków', w1.braki.length === 0 && w1.wystarczy === true, w1.braki);
T('opis: moduł lokalowy', O.modul(w1, t1).modul === 'local_kcm' && O.modul(w1, t1).pewny);
const t2 = 'Dom jednorodzinny przy ulicy Długiej 5 w Sopocie, działka nr 123/4 obręb 0007, działka 800 m2, dom 140 m2. Sprawa spadkowa.';
const w2 = O.czytaj(t2), g = k => (w2.fakty.find(x => x.klucz === k) || {}).wartosc;
T('opis: dom → moduł nieruchomości zabudowanej', O.modul(w2, t2).modul === 'developed_pairs');
T('opis: działka i obręb', g('plotNo') === '123/4' && g('obreb') === '0007');
T('opis: powierzchnia działki nie staje się metrażem domu', g('landArea') === 800 && g('usableArea') === 140, [g('landArea'), g('usableArea')]);
T('opis: miejscownik „w Sopocie" → Sopot, do potwierdzenia', g('city') === 'Sopot' && w2.fakty.find(x => x.klucz === 'city').doPotwierdzenia === true);
T('opis: brak księgi jest na liście braków', w2.braki.some(b => b.klucz === 'kw'));
const w3 = O.czytaj('działka rolna 1,5 ha w miejscowości Kolbudy');
T('opis: hektary na metry', (w3.fakty.find(x => x.klucz === 'landArea') || {}).wartosc === 15000);
T('opis: grunt rolny → moduł rolny', O.modul(w3, 'działka rolna 1,5 ha').modul === 'agri_forest');
T('opis: pusty tekst – same braki, nic nie zgaduje', O.czytaj('').fakty.length === 0 && O.czytaj('').braki.length === 5);
T('opis: balkon 6 m2 nie jest powierzchnią lokalu', (O.czytaj('mieszkanie z balkonem 6 m2, lokal 48 m2').fakty.find(x => x.klucz === 'usableArea') || {}).wartosc === 48);
const pr = { property: { city: 'Sopot' }, valuation: { purpose: 'DOM' } };
const dp = O.doProjektu(pr, w1, { celDomyslny: 'DOM' });
T('opis → projekt: wpisuje do pustych rubryk', pr.property.street === 'Ikara' && pr.property.localNo === '12' && pr.legal.kwLocal === 'GD1G/00012345/6' && pr.building.year === 1978);
T('opis → projekt: nie nadpisuje wpisanego ręcznie', pr.property.city === 'Sopot' && dp.pominiete.some(x => x.etykieta === 'Miejscowość'));
T('opis → projekt: zastępuje tylko domyślny cel', /kredytodawcy/.test(pr.valuation.purpose));
const pr2 = { valuation: { purpose: 'Mój własny cel' } }; O.doProjektu(pr2, w1, { celDomyslny: 'DOM' });
T('opis → projekt: własny cel zostaje', pr2.valuation.purpose === 'Mój własny cel');

// ---- przebieg
let p = A.nowy({ dokladnosc: 2, teraz: '2026-01-01T10:00:00Z' });
T('przebieg: szesnastu agentów czeka', Object.keys(p.agenci).length === 16 && A.ZESPOL.length === 16 && A.postep(p) === 0);
T('zespół: każdy agent ma rolę, etap i kroki', A.ZESPOL.every(a => a.rola.length > 20 && a.etap && a.kroki.length >= 3) && new Set(A.ZESPOL.map(a => a.id)).size === 16);
T('przebieg: dokładność w granicach 1–3', A.nowy({ dokladnosc: 9 }).dokladnosc === 3 && A.nowy({ dokladnosc: 0 }).dokladnosc === 2);
A.zacznij(p, 'kw'); A.krok(p, 'kw', 'czytam');
T('przebieg: pracujący agent liczy się w połowie', p.agenci.kw.stan === 'pracuje' && A.postep(p) === Math.round(50 / A.ZESPOL.length), A.postep(p));
A.zakoncz(p, 'kw', { zrobione: ['dział II'], braki: ['brak IV'], powtorz: true });
T('przebieg: braki dają stan „uwaga"', p.agenci.kw.stan === 'uwaga');
A.zacznij(p, 'rynek'); A.zakoncz(p, 'rynek', { blad: 'sieć' });
T('przebieg: błąd daje stan „blad"', p.agenci.rynek.stan === 'blad');
T('przebieg: kontroler wraca do błędów i próśb o powtórkę', JSON.stringify(A.doPowtorki(p)) === '["kw","rynek"]', A.doPowtorki(p));
A.zacznij(p, 'rynek'); A.zakoncz(p, 'rynek', { zrobione: ['9 transakcji'] });
T('przebieg: udana powtórka czyści błąd', p.agenci.rynek.stan === 'gotowe' && p.agenci.rynek.proby === 2 && !A.doPowtorki(p).includes('rynek'));
A.zacznij(p, 'kw'); A.zakoncz(p, 'kw', { zrobione: ['dział IV'], braki: [], powtorz: true });
T('przebieg: limit prób = 1 + dokładność', p.agenci.kw.proby === 2 && A.doPowtorki(p).includes('kw'));
A.zacznij(p, 'kw'); A.zakoncz(p, 'kw', { powtorz: true });
T('przebieg: po wyczerpaniu prób agent nie wraca', !A.doPowtorki(p).includes('kw'));
const r = A.raport(p, '2026-01-01T11:12:05Z');
T('raport: zrobione zbiera wszystkie podejścia bez powtórzeń', r.zrobione.find(x => x.agent === 'kw').pozycje.length === 2);
T('raport: braki tylko z ostatniego podejścia', !r.braki.some(x => x.agent === 'kw'));
T('raport: czas po polsku', r.czasTekst === '1 godz. 12 min', r.czasTekst);
T('czas: sekundy i minuty', A.czasTekst(42000) === '42 s' && A.czasTekst(125000) === '2 min 5 s');
T('dziennik ma limit wpisów', (() => { const q = A.nowy(); for (let i = 0; i < 600; i++) A.zapisz(q, 'kw', 'x' + i); return q.dziennik.length === 400; })());
const s1 = A.ocenStanPrawny({ kwLocal: 'X', sectionIII: 'BRAK WPISÓW', sectionIV: 'Hipoteka umowna 300000 zł na rzecz banku' });
T('stan prawny: hipoteka umowna = obciążenie do opisania', s1.stan === 'obciazenia' && s1.uwagi[0].dzial === 'IV' && /300000/.test(s1.uwagi[0].cytat));
T('stan prawny: pusty dział III odnotowany jako czysty', s1.dobrze.some(x => /Dział III/.test(x)));
T('stan prawny: egzekucja = ryzyko', A.ocenStanPrawny({ sectionIII: 'Ostrzeżenie o wszczęciu egzekucji z nieruchomości', sectionIV: 'brak wpisów' }).stan === 'ryzyko');
T('stan prawny: hipoteka przymusowa = ryzyko', A.ocenStanPrawny({ sectionIII: '---', sectionIV: 'HIPOTEKA PRZYMUSOWA 40000 zł ZUS' }).stan === 'ryzyko');
T('stan prawny: służebność wykryta z cytatem', A.ocenStanPrawny({ sectionIII: 'Nieodpłatna służebność przesyłu na rzecz Energa', sectionIV: '' }).uwagi[0].co === 'służebność');
T('stan prawny: sam numer księgi to nie treść', A.ocenStanPrawny({ kwLocal: 'GD1G/00012345/6' }).stan === 'brak');
T('stan prawny: tekst bez rozpoznanych wpisów nie jest „czysty"', A.ocenStanPrawny({ sectionIII: 'Tekst opisowy bez konkretów.', sectionIV: 'Inny tekst.' }).stan === 'nieokreslony');
T('kontroler nie powtarza agentów analitycznych', (() => { const q = A.nowy(); A.zacznij(q, 'krytyk'); A.zakoncz(q, 'krytyk', { blad: 'x' }); return A.doPowtorki(q).length === 0; })());
T('stan prawny: oba działy puste = czysty', A.ocenStanPrawny({ sectionIII: 'brak wpisów', sectionIV: 'brak wpisów' }).stan === 'czysty');

// ---- weryfikator
const zapis = 'Lokal o pow. 54.3 m2 za 650000 zł, tj. 11971zł/m2. Rok 2024, KW GD1G/00012345/6, działka 1234/5, kod 80-299, udział 5000/100000, cena 9 500 zł/m2 i 12 %';
const popr = W.poprawLiczby(zapis);
T('liczby: tysiące i przecinek dziesiętny', popr.includes('54,3 m²') && popr.includes('650 000 zł') && popr.includes('11 971 zł/m²'), popr);
T('liczby: rok, księga, działka, kod i udział nietknięte', popr.includes('Rok 2024') && popr.includes('GD1G/00012345/6') && popr.includes('1234/5') && popr.includes('80-299') && popr.includes('5000/100000'));
T('liczby: procent bez spacji', popr.includes('12%'));
T('liczby: wartość się nie zmienia', popr.replace(/\D/g, '') === zapis.replace(/m2/g, 'm').replace(/\D/g, ''));
T('typografia: spacje i interpunkcja', W.poprawTypografie('Ala  ma kota ,a pies:tak. Cena 1,5 mln i godz. 12:30 oraz dom') === 'Ala ma kota, a pies: tak. Cena 1,5 mln i godz. 12:30 oraz dom.');
T('typografia: hasło bez kropki zostaje hasłem', W.poprawTypografie('Określenie wartości rynkowej nieruchomości dla potrzeb sprzedaży') === 'Określenie wartości rynkowej nieruchomości dla potrzeb sprzedaży');
const proj = () => ({ author: {}, appearance: { showHeaderFooter: true, headerText: 'Operat', bodyFontSize: 7, pageMarginMm: 8 }, legal: { sectionIII: 'cena 5000 zł' },
  market: { features: [{ name: 'A', weight: .5, rating: 'Przeciętna' }, { name: 'B', weight: .3, rating: 'Przeciętna' }, { name: 'C', weight: .19, rating: 'Przeciętna' }],
    transactions: [{ address: 'a', priceUnit: 10000, area: 50, date: '2025-01-01' }, { address: 'a', priceUnit: 10000, area: 50, date: '2025-01-01' }, { address: 'b', priceUnit: 0, area: 40, date: '' }] },
  location: { description: zapis, services: 'Sklep [DO UZUPEŁNIENIA] w pobliżu.' }, valuation: { roundTo: 1000 }, property: { askingPrice: 900000, usableArea: 54.3, kwArea: 56 } });
let pj = proj();
const wer = W.sprawdz(pj, { valueRounded: 650500 }, { pozycje: [{ stan: 'blad', tytul: 'Audyt X', szczegol: 's' }, { stan: 'ok', tytul: 'Y' }] }, { znakWodny: 'PROJEKT', auto: { 'market.features': {} } });
const ma = re => wer.uwagi.some(u => re.test(u.tytul));
T('weryfikator: zapis liczb z gotową poprawką', wer.uwagi.some(u => /zapis liczb/.test(u.tytul) && u.poprawka));
T('weryfikator: jedna poprawka na pole', wer.uwagi.filter(u => u.gdzie === 'location.description' && u.poprawka).length === 1);
T('weryfikator: miejsce do uzupełnienia jest błędem', wer.uwagi.some(u => /do uzupełnienia/.test(u.tytul) && u.waga === 'blad'));
T('weryfikator: suma wag 99% z poprawką', wer.uwagi.some(u => /99%/.test(u.tytul) && u.poprawka && u.poprawka.zmiany.length === 3));
T('weryfikator: wszystkie oceny przeciętne', ma(/przeciętna/));
T('weryfikator: powtórzona transakcja i pusta komórka', ma(/Powtórzona transakcja/) && ma(/bez ceny, powierzchni albo daty/));
T('weryfikator: zaokrąglenie wartości', ma(/nie jest zaokrąglona/));
T('weryfikator: różnica wobec ceny ofertowej', ma(/od ceny ofertowej o 28%/));
T('weryfikator: powierzchnia inna niż w księdze', ma(/inna niż w księdze/));
T('weryfikator: autor, zdjęcia, pismo, margines', ma(/Brak autora/) && ma(/fotograficznej/) && ma(/wielkość pisma/) && ma(/marginesy/));
T('weryfikator: znak wodny odnotowany', ma(/znak wodny/));
T('weryfikator: uwagi audytu przechodzą, „ok" nie', ma(/Audyt X/) && !ma(/^Y$/));
T('weryfikator: treści księgi nie poprawia', !wer.uwagi.some(u => /^legal\./.test(u.gdzie)));
T('weryfikator: sprawdzanie niczego nie zmienia', JSON.stringify(pj) === JSON.stringify(proj()));
const wszystkie = wer.uwagi.filter(u => u.poprawka).map(u => u.id);
const zm = W.zastosuj(pj, wer, wszystkie);
T('poprawki: wagi po akceptacji dają 100%', Math.round(pj.market.features.reduce((s, x) => s + x.weight, 0) * 100) === 100, pj.market.features.map(x => x.weight));
T('poprawki: tekst poprawiony', pj.location.description.includes('650 000 zł') && pj.appearance.pageMarginMm === 15);
T('poprawki: bez akceptacji nic nie wchodzi', (() => { const q = proj(); return W.zastosuj(q, wer, []).length === 0 && JSON.stringify(q) === JSON.stringify(proj()); })());
T('poprawki: cofnięcie przywraca operat co do znaku', W.cofnij(pj, zm) === zm.length && JSON.stringify(pj) === JSON.stringify(proj()));
const czysty = W.sprawdz({ author: { name: 'A', licenseNo: '1' }, photos: [{}], appearance: { headerText: 'x' }, market: { features: [{ name: 'A', weight: .6, rating: 'Dobra', ratingNote: 'bo' }, { name: 'B', weight: .4, rating: 'Przeciętna' }], weightJustification: 'analiza' } }, {}, null, {});
T('weryfikator: czysty operat bez uwag', czysty.uwagi.length === 0 && czysty.podsumowanie.ocena === 'czysty', czysty.uwagi.map(u => u.tytul));
const pol = W.polecenie({ location: { description: 'x'.repeat(80) }, legal: { sectionIII: 'y'.repeat(200) } }, wer);
T('polecenie dla modelu: mieści się w limicie i pomija księgę', pol.prompt.length < 12000 && pol.etykiety.length === 1 && !pol.prompt.includes('yyyy'));
const op = W.zOpinii('1. POLE: Opis lokalizacji | PROBLEM: sprzeczność | POPRAWKA: ujednolić\nluźne zdanie', [{ etykieta: 'Opis lokalizacji', sciezka: 'location.description' }]);
T('opinia modelu: linia w formacie → uwaga z polem', op.length === 1 && op[0].gdzie === 'location.description' && op[0].zModelu && op[0].poprawka === null);
T('opinia modelu: BRAK → pusto', W.zOpinii('BRAK.', []).length === 0);
const zn = W.znakWodny('<html><body>x</body></html>', 'PROJEKT "<b>"');
T('znak wodny: wstawiony raz, bez znaczników w treści', zn.includes('opero-znak-wodny') && !zn.includes('<b>"') && W.znakWodny(zn, 'PROJEKT') === zn);
T('znak wodny: pusty tekst nic nie zmienia', W.znakWodny('<body></body>', '') === '<body></body>');

// ---- WhatsApp
T('WhatsApp: numer polski dostaje 48', WA.numer('600 100 200') === '48600100200' && WA.numer('+48 600-100-200') === '48600100200' && WA.numer('0048600100200') === '48600100200');
T('WhatsApp: śmieci nie są numerem', WA.numer('12') === '' && WA.numer('abc') === '');
T('WhatsApp: adres jednym kliknięciem', WA.link('600100200', 'Cześć & ok') === 'https://wa.me/48600100200?text=Cze%C5%9B%C4%87%20%26%20ok' && WA.link('', 'a') === 'https://wa.me/?text=a');
const zt = WA.zadanie({ odbiorca: '600100200', idNumeru: '123456789' }, 'Hej\nok');
T('WhatsApp: zapytanie tekstowe do Meta', zt.url === 'https://graph.facebook.com/v23.0/123456789/messages' && zt.body.type === 'text' && zt.body.to === '48600100200' && zt.body.text.body === 'Hej\nok');
const zs = WA.zadanie({ odbiorca: '600100200', idNumeru: '1234', szablon: 'Opero_Status', jezyk: 'pl' }, 'Hej\nok');
T('WhatsApp: szablon – nazwa małymi literami, parametr bez nowej linii', zs.body.type === 'template' && zs.body.template.name === 'opero_status' && !/\n/.test(zs.body.template.components[0].parameters[0].text));
T('WhatsApp: w zapytaniu nie ma tokenu', !JSON.stringify(zt).toLowerCase().includes('bearer') && !('naglowki' in zt));
T('WhatsApp: bez numeru nadawcy nie ma zapytania', WA.zadanie({ odbiorca: '600100200' }, 'x') === null);
T('WhatsApp: odpowiedź z identyfikatorem', WA.zOdpowiedzi(200, '{"messages":[{"id":"wamid.X"}]}').ok === true);
T('WhatsApp: błąd okna 24 h wyjaśniony po polsku', /24 godziny/.test(WA.zOdpowiedzi(400, '{"error":{"code":131047}}').powod) && /Token/.test(WA.zOdpowiedzi(401, '{}').powod));
T('WhatsApp: gotowość automatu wylicza braki', WA.gotowosc({ odbiorca: '600100200', automat: true }, false).brak.length === 2 && WA.gotowosc({ odbiorca: '600100200', idNumeru: '1', automat: true }, true).automat === true);
T('WhatsApp: automat wyłączony mimo kompletu danych', WA.gotowosc({ odbiorca: '600100200', idNumeru: '1' }, true).automat === false);
const wk = WA.wiadomosc('koniec', { adres: 'Gdańsk, Ikara 97', wartosc: 650000, jednostkowa: 11971, ileZrobione: 42, ileBrakow: 3, czasTekst: '1 godz. 12 min', braki: ['oceny cech'] });
T('WhatsApp: treść końcowa – adres, wartość, braki', /Gdańsk, Ikara 97/.test(wk) && /650 000 zł/.test(wk) && /oceny cech/.test(wk) && /do uzupełnienia: 3/.test(wk));
T('WhatsApp: wersja interfejsu z ustawień albo domyślna', WA.ustawienia({ wersja: 'v25.0' }).wersja === 'v25.0' && WA.ustawienia({ wersja: 'x' }).wersja === WA.WERSJA);

// ---- model w chmurze
const u = { wlaczony: true, zgoda: true, dostawca: 'anthropic', model: 'model-x' };
T('chmura: aktywna tylko z kluczem, modelem i zgodą', C.gotowosc(u, true).aktywny === true && C.gotowosc(u, false).aktywny === false && C.gotowosc({ ...u, zgoda: false }, true).aktywny === false && C.gotowosc({ ...u, model: '' }, true).aktywny === false);
T('chmura (3.4): domyślnie Mózg OPERO, czeka tylko na zgodę', C.gotowosc({}, true).aktywny === false && C.ustawienia({}).wlaczony === true && C.ustawienia({}).dostawca === 'opero' && C.gotowosc({ zgoda: true }, false).aktywny === true);
const z1 = C.zadanie(u, 'KLUCZ', [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }]);
T('chmura: format Anthropic – system osobno, nagłówek x-api-key', z1.url === 'https://api.anthropic.com/v1/messages' && z1.body.system === 'S' && z1.body.messages.length === 1 && z1.naglowki['x-api-key'] === 'KLUCZ' && z1.naglowki['anthropic-version'] === '2023-06-01' && z1.body.max_tokens > 0);
const z2 = C.zadanie({ ...u, dostawca: 'zgodny', baza: 'https://api.example.com/v1/' }, 'K', [{ role: 'system', content: 'S' }, { role: 'user', content: 'U' }]);
T('chmura: format zgodny – chat/completions i Bearer', z2.url === 'https://api.example.com/v1/chat/completions' && z2.naglowki.authorization === 'Bearer K' && z2.body.messages.length === 2);
T('chmura: adres bez https albo z hasłem odrzucony', C.baza('zgodny', 'http://x.pl') === '' && C.baza('zgodny', 'https://a:b@x.pl') === '' && C.baza('anthropic', 'https://zly.pl') === 'https://api.anthropic.com');
T('chmura: bez klucza nie ma zapytania', C.zadanie(u, '', [{ role: 'user', content: 'U' }]) === null);
T('chmura: odpowiedź w obu formatach', C.zOdpowiedzi('anthropic', 200, '{"content":[{"type":"text","text":"Tekst."}]}').text === 'Tekst.' && C.zOdpowiedzi('zgodny', 200, '{"choices":[{"message":{"content":"T"}}]}').text === 'T');
T('chmura: błędy po polsku', /odrzucony/.test(C.zOdpowiedzi('anthropic', 401, '{}').powod) && /środki|ogranicza/.test(C.zOdpowiedzi('zgodny', 429, '{}').powod) && C.zOdpowiedzi('anthropic', 200, 'nie-json').ok === false);
T('chmura: lista modeli', C.zListy('{"data":[{"id":"m1","display_name":"M 1"},{"id":""}]}').length === 1 && C.zadanieListy(u, 'K').url.endsWith('/v1/models'));

// ---- pamięć wzorców
const operat = `OPERAT SZACUNKOWY
1. PRZEDMIOT I ZAKRES WYCENY
Przedmiotem wyceny jest lokal mieszkalny nr 12 położony w Gdańsku przy ul. Ikara 97, o powierzchni 54,30 m2, dla którego prowadzona jest księga GD1G/00012345/6. Zakres obejmuje określenie wartości rynkowej prawa własności. Kontakt: jan@example.com, tel. 600 100 200.
3. STAN PRAWNY
Właściciel Jan Kowalski PESEL 80010112345, hipoteka umowna 300 000 zł na rzecz banku. Tekst długi dostatecznie, żeby przekroczyć próg stu dwudziestu znaków w tej sekcji operatu.
4. Opis lokalizacji
Nieruchomość położona jest w dzielnicy Zaspa, w odległości 350 m od przystanku tramwajowego. Otoczenie stanowi zabudowa wielorodzinna z lat 70. W sąsiedztwie znajdują się szkoła, przychodnia oraz sklepy codziennej potrzeby.
5. ANALIZA RYNKU
1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 59 60 61 62 63 64 65 66 67
`;
const wz = P.zTekstu('Ikara.docx', operat, { rodzaj: 'local_kcm' });
T('pamięć: rozdziały rozpoznane po tytułach', wz.ok && JSON.stringify(Object.keys(wz.wzorzec.sekcje).sort()) === '["lokalizacja","przedmiot"]', wz.ok && Object.keys(wz.wzorzec.sekcje));
T('pamięć: stan prawny nie jest zapamiętywany', !('prawny' in wz.wzorzec.sekcje) && !JSON.stringify(wz.wzorzec).includes('Kowalski'));
T('pamięć: tabela z samych liczb nie uczy stylu', !('rynek' in wz.wzorzec.sekcje));
const cale = JSON.stringify(wz.wzorzec.sekcje);
T('pamięć: liczby, księga, e-mail i telefon usunięte', !/\d/.test(cale) && cale.includes('‹nr księgi›') && cale.includes('‹e-mail›') && !cale.includes('example.com'), cale.slice(0, 200));
T('pamięć: jednostka m² zachowana', cale.includes('‹…› m²'));
T('pamięć: nazwa bez rozszerzenia', wz.wzorzec.nazwa === 'Ikara');
T('pamięć: krótki albo nierozpoznany tekst odrzucony z powodem', P.zTekstu('x', 'krótko').ok === false && /rozdziałów/.test(P.zTekstu('x', 'a'.repeat(900)).powod));
let st = P.dodaj({}, wz.wzorzec).stan;
const db = P.dobierz(st, 'location.description', 'local_kcm');
T('pamięć: dobór wzoru do pola', db.length === 1 && db[0].rozdzial === 'lokalizacja' && P.dobierz(st, 'building.description').length === 0);
T('pamięć: dopisek do polecenia zabrania przepisywania faktów', /NIE przepisuj/.test(P.doPolecenia(db)) && P.doPolecenia([]) === '');
T('pamięć: wyłączona nie podaje wzorów', P.dobierz({ ...st, uzywaj: false }, 'location.description').length === 0);
T('pamięć: usuwanie', P.usun(st, wz.wzorzec.id).wzorce.length === 0);
T('pamięć: limit liczby operatów', (() => { let s = {}; for (let i = 0; i < P.LIMIT; i++) s = P.dodaj(s, { ...wz.wzorzec, id: 'w' + i }).stan; return P.dodaj(s, wz.wzorzec).ok === false; })());
T('pamięć: stan z zewnątrz jest filtrowany', P.stanCzysty({ wzorce: [{ sekcje: { zla: 'x', lokalizacja: 'ok' } }, null, { sekcje: {} }] }).wzorce.length === 1);
T('pamięć: tekst z Worda – akapity i encje', P.tekstZDocx('<w:p><w:r><w:t>Ala &amp; kot</w:t></w:r></w:p><w:p><w:r><w:t>Druga</w:t></w:r></w:p>') === 'Ala & kot\nDruga');

// ---- tok rozumowania
const R = K('rozumowanie.js');
const trans = [9800, 10000, 10100, 10200, 10300, 10400, 10500, 10600, 10800, 10250, 10350, 10450].map((c, i) => ({ priceUnit: c, area: 50 + i * 2, date: '2025-' + String(1 + i % 12).padStart(2, '0') + '-15', address: 'a' + i }));
const dobry = () => ({ module: { code: 'local_kcm' }, valuation: { purpose: 'Określenie wartości rynkowej — zabezpieczenie wierzytelności kredytodawcy', valuationDate: '2026-01-15', roundTo: 1000 },
  property: { city: 'Gdańsk', street: 'Ikara', buildingNo: '9', usableArea: 60, askingPrice: 650000 }, legal: { kwLocal: 'GD1G/1/2' },
  market: { transactions: trans, features: [{ name: 'Lokalizacja', weight: .4, rating: 'Dobra', ratingNote: 'blisko centrum' }, { name: 'Standard', weight: .6, rating: 'Przeciętna' }], weightJustification: 'analiza rynku' } });
const stt = R.statystyka(trans, '2026-01-15');
T('statystyka: liczba, zakres, mediana', stt.n === 12 && stt.min === 9800 && stt.max === 10800 && stt.mediana === 10325, [stt.n, stt.mediana]);
T('statystyka: zmienność i okres', stt.zmiennosc > 0.02 && stt.zmiennosc < 0.03 && stt.okresMies === 11);
T('statystyka: cena z ceny całkowitej i powierzchni', R.statystyka([{ price: 500000, area: 50 }]).min === 10000);
T('statystyka: odstająca wykryta, reszta nie', R.statystyka(trans.concat([{ priceUnit: 30000, area: 50, date: '2025-05-01' }])).odstajace.length === 1 && stt.odstajace.length === 0);
T('statystyka: pusty zbiór', R.statystyka([]).n === 0 && R.statystyka(null).n === 0);
const pjd = dobry(), kopia = JSON.stringify(pjd);
const my = R.mysl(pjd, { valueRounded: 620000, unitAfterRound: 10333 }, { stanPrawny: { stan: 'czysty', tekst: 'bez obciążeń', uwagi: [] } });
const dec = id => my.decyzje.find(x => x.id === id);
T('rozumowanie: sześć decyzji w stałej kolejności', my.decyzje.map(x => x.id).join() === 'cel,przedmiot,rynek,metoda,cechy,wynik');
T('rozumowanie: niczego nie zmienia w operacie', JSON.stringify(pjd) === kopia);
T('rozumowanie: cel kredytowy → wartość rynkowa + uwaga o wymaganiach banku', /wartość rynkowa/.test(dec('cel').rozstrzygniecie) && dec('cel').zastrzezenia.some(z => /Bank/.test(z)));
T('rozumowanie: metoda ma rozważone alternatywy z powodami', dec('metoda').mozliwosci.length === 3 && dec('metoda').mozliwosci.filter(m => m.wybrana).length === 1 && dec('metoda').mozliwosci.every(m => m.dlaczego.length > 10));
T('rozumowanie: wynik w zakresie cen i przy medianie', dec('wynik').pewnosc === 'wysoka' && dec('wynik').dane.some(x => /równa medianie/.test(x)));
T('rozumowanie: każda decyzja mówi, co by ją zmieniło', my.decyzje.every(x => x.zmieni.length >= 1 && x.pytanie.length > 10));
T('rozumowanie: dobry operat bez krytyki', my.krytyka.length === 0 && ['mocny', 'do-uzasadnienia'].includes(my.podsumowanie.ocena), my.podsumowanie);
const zlyP = dobry(); zlyP.market.transactions = trans.slice(0, 5); zlyP.market.features.forEach(x => { x.rating = 'Przeciętna'; }); zlyP.legal = {};
const zly = R.mysl(zlyP, { valueRounded: 900000, unitAfterRound: 15000 }, { auto: { 'market.features': {} } });
const dz = id => zly.decyzje.find(x => x.id === id);
T('rozumowanie: za mało transakcji dla metody – słaba decyzja i propozycja', dz('metoda').pewnosc === 'niska' && /porównywania parami/.test(dz('metoda').rozstrzygniecie));
T('rozumowanie: wynik poza zakresem cen = błąd', dz('wynik').pewnosc === 'niska' && dz('wynik').zastrzezenia.some(z => /POZA zakresem/.test(z)));
T('rozumowanie: oceny wyjściowe nazwane po imieniu', dz('cechy').zastrzezenia.some(z => /stan wyjściowy/.test(z)) && dz('cechy').zastrzezenia.some(z => /przyjął program/.test(z)));
T('rozumowanie: brak księgi obniża pewność przedmiotu', dz('przedmiot').pewnosc === 'niska');
T('krytyk: wynik bez podstaw w metodzie i przy ocenach wyjściowych', zly.krytyka.length >= 3 && zly.krytyka.some(x => /nie obroni się/.test(x)) && zly.krytyka.some(x => /typowej nieruchomości/.test(x)), zly.krytyka);
T('rozumowanie: wartość wyższa od oferty budzi zastrzeżenie', R.mysl(Object.assign(dobry(), { property: { city: 'G', street: 'x', usableArea: 60, askingPrice: 500000 } }), { valueRounded: 620000, unitAfterRound: 10333 }, {}).decyzje[5].zastrzezenia.some(z => /przewyższa cenę ofertową/.test(z)));
T('rozumowanie: pusty operat – łańcuch przerwany, bez wyjątku', R.mysl({}, {}, {}).podsumowanie.ocena === 'niepelny');
const uz = R.uzasadnienia(my, pjd);
T('uzasadnienia: metoda, rynek i wynik z liczb operatu', /korygowania ceny średniej/.test(uz['valuation.approachDescription']) && /12 transakcji/.test(uz['market.marketDescription']) && /620/.test(uz['narratives.result']));
T('uzasadnienia: każda liczba w opisie rynku pochodzi ze statystyki', ['9800', '10 800', '10 313', '10 325'].every(x => uz['market.marketDescription'].replace(/\u00a0/g, ' ').includes(x)), uz['market.marketDescription']);
T('uzasadnienia: przy słabej metodzie i wyniku program nie pisze ich uzasadnień', !('valuation.approachDescription' in R.uzasadnienia(zly, zlyP)) && !('narratives.result' in R.uzasadnienia(zly, zlyP)));
T('streszczenie zawiera decyzje i krytykę', /1\. Cel wyceny/.test(R.streszczenie(zly)) && /Krytyka:/.test(R.streszczenie(zly)));

// ---- pamięć: wiele operatów i uczenie na zatwierdzonych
const pliki = [1, 2, 3].map(i => ({ nazwa: `Operat ${i}.docx`, ok: true, tekst: operat + `\n6. OPIS BUDYNKU\nBudynek numer ${i} wzniesiono w technologii tradycyjnej, ściany murowane, stropy żelbetowe, dach płaski kryty papą. Stan techniczny dobry, elewacja ocieplona, klatki schodowe po remoncie.` }));
const wiele = P.dodajWiele({}, pliki.concat([{ nazwa: 'zly.docx', ok: false, powod: 'uszkodzony' }, { nazwa: 'krotki.txt', ok: true, tekst: 'za mało' }, pliki[0]]));
T('pamięć: import wielu naraz – dobre wchodzą, złe i powtórzone są nazwane', wiele.dodane.length === 3 && wiele.odrzucone.length === 3 && wiele.stan.wzorce.length === 3 && wiele.odrzucone.some(x => /już w pamięci/.test(x.powod)), wiele.odrzucone);
T('pamięć: pojemność na setki operatów', P.LIMIT >= 500);
const zProj = P.zProjektu('Gdańsk, Ikara 9', [{ sciezka: 'location.description', tekst: 'Nieruchomość leży 350 m od przystanku, w dzielnicy o zabudowie wielorodzinnej. W sąsiedztwie znajdują się szkoła, przychodnia oraz sklepy codziennej potrzeby i tereny zielone.' }, { sciezka: 'legal.sectionIII', tekst: 'Służebność na rzecz Jana Kowalskiego, treść długa na tyle, żeby przejść próg stu liter w tym polu operatu szacunkowego.' }, { sciezka: 'local.description', tekst: 'krótko' }], { rodzaj: 'local_kcm', id: 'pX' });
T('pamięć: wzorzec z zatwierdzonego operatu – bez liczb i bez stanu prawnego', zProj.ok && Object.keys(zProj.wzorzec.sekcje).join() === 'lokalizacja' && !/\d/.test(zProj.wzorzec.sekcje.lokalizacja) && !JSON.stringify(zProj.wzorzec).includes('Kowalski'), zProj);
T('pamięć: operat bez opisów nie staje się wzorcem', P.zProjektu('x', [{ sciezka: 'location.description', tekst: 'mało' }]).ok === false);
T('pamięć: ustawienie „ucz się" jest zapamiętywane', P.stanCzysty({ uczSie: false }).uczSie === false && P.stanCzysty({}).uczSie === true);

console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

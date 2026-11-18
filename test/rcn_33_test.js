'use strict';
/** OPERO 3.3 — rejestr cen po sprawdzeniu na żywo: adresy MSC/UL/NR_PORZ, kondygnacja, odsianie, filtr daty; oceny transakcji. */
const K = n => require('/root/work/build/app/renderer/' + n);
const G = K('rcn-geoportal.js'), C = K('rcn.js'), O = K('oceny-transakcji.js');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 500) : '')); } };
console.log('OPERO 3.3 — rejestr cen i oceny transakcji\n');
const a = G.adresKV('MSC:Gdańsk;UL:Kadetów;NR_PORZ:9');
T('adres z rejestru „MSC:…;UL:…;NR_PORZ:…" rozbity', a.tekst === 'ul. Kadetów 9, Gdańsk' && a.miejscowosc === 'Gdańsk' && a.ulica === 'Kadetów' && a.numer === '9', a);
T('zwykły adres nie jest ruszany', G.adresKV('ul. Kartuska 180, Gdańsk') === null);
// obiekt w formacie usługi (skrót z odpowiedzi na żywo, dane bez osób)
const gml = (o) => `<wfs:FeatureCollection><wfs:member><ms:lokale gml:id="lokale.1"><ms:GEOMETRIA><gml:Point><gml:pos>724004.5 467741.3</gml:pos></gml:Point></ms:GEOMETRIA><ms:TERYT>2261</ms:TERYT>
<ms:TRAN_LOKALNY_ID_IIP>abc-1</ms:TRAN_LOKALNY_ID_IIP><ms:TRAN_RODZAJ_TRANS>${o.rodzaj || 'wolnyRynek'}</ms:TRAN_RODZAJ_TRANS><ms:TRAN_RODZAJ_RYNKU>${o.rynek || 'rynekWtorny'}</ms:TRAN_RODZAJ_RYNKU>
<ms:TRAN_SPRZEDAJACY>osobaFizyczna</ms:TRAN_SPRZEDAJACY><ms:TRAN_CENA_BRUTTO>600000</ms:TRAN_CENA_BRUTTO><ms:DOK_OZNACZENIE>1234/2025</ms:DOK_OZNACZENIE>
<ms:DOK_DATA gml:id="x"><gml:timePosition>2025-10-06</gml:timePosition></ms:DOK_DATA><ms:NIER_RODZAJ>nieruchomoscLokalowa</ms:NIER_RODZAJ><ms:NIER_PRAWO>wlasnoscLokaluWrazZPrawemZwiazanym</ms:NIER_PRAWO>
<ms:NIER_UDZIAL>${o.udzial || '1/1'}</ms:NIER_UDZIAL><ms:LOK_ID_LOKALU>226101_1.0025.42_BUD.4_LOK</ms:LOK_ID_LOKALU><ms:LOK_FUNKCJA>${o.funkcja || 'mieszkalna'}</ms:LOK_FUNKCJA><ms:LOK_LICZBA_IZB>3</ms:LOK_LICZBA_IZB>
<ms:LOK_NR_KOND>2</ms:LOK_NR_KOND><ms:LOK_POW_UZYT>60</ms:LOK_POW_UZYT><ms:LOK_CENA_BRUTTO>600000</ms:LOK_CENA_BRUTTO><ms:LOK_ADRES>MSC:Gdańsk;UL:Kadetów;NR_PORZ:10</ms:LOK_ADRES></ms:lokale></wfs:member></wfs:FeatureCollection>`;
const t = G.zGml(gml({}), 'lokale').transakcje[0];
T('transakcja: adres, miejscowość, ulica', t.adres === 'ul. Kadetów 10, Gdańsk' && t.miejscowosc === 'Gdańsk' && t.ulica === 'ul. Kadetów 10', t);
T('transakcja: kondygnacja z LOK_NR_KOND, izby, cena 1 m²', t.pietro === 2 && t.pokoje === 3 && t.jednostkowa === 10000);
T('transakcja: słownik rejestru po polsku (rynek, rodzaj, prawo)', t.rynek === 'wtórny' && t.rodzaj === 'sprzedaż na wolnym rynku' && t.prawo === 'własność lokalu wraz z prawem związanym');
T('transakcja: identyfikatory źródła (lokal, transakcja, akt)', t.idObiektu === '226101_1.0025.42_BUD.4_LOK' && t.idTransakcji === 'abc-1' && t.akt === '1234/2025');
T('przydatność: zwykła sprzedaż mieszkania — tak', G.przydatnosc(t, 'mieszkanie') === '');
T('przydatność: sprzedaż bezprzetargowa — nie', /wolny rynek/.test(G.przydatnosc(G.zGml(gml({ rodzaj: 'sprzedazBezprzetargowa' }), 'lokale').transakcje[0], 'mieszkanie')));
T('przydatność: udział 1/2 — nie', /udział/.test(G.przydatnosc(G.zGml(gml({ udzial: '1/2' }), 'lokale').transakcje[0], 'mieszkanie')));
T('przydatność: garaż — nie', /niemieszkalny/.test(G.przydatnosc(G.zGml(gml({ funkcja: 'garaz' }), 'lokale').transakcje[0], 'mieszkanie')));
const oc = C.ocen([t, G.zGml(gml({ rodzaj: 'sprzedazZBonifikata' }), 'lokale').transakcje[0], G.zGml(gml({ udzial: '2/213' }), 'lokale').transakcje[0]], { dataWyceny: '2026-11-18', okresMiesiecy: 24 });
T('kontrola jakości: bonifikata i udział odrzucone z powodem', oc.statystyka.przyjete === 1 && oc.odrzucone.some(x => /bonifikat/.test(x.powod)) && oc.odrzucone.some(x => /udziału/.test(x.powod)), oc.odrzucone.map(x => x.powod));
const u = G.urlTransakcji({ typ: 'lokale', bbox: [723906, 465840, 725906, 467840], odDaty: '2024-11-18' });
const f = decodeURIComponent(u.split('FILTER=')[1].replace(/\+/g, ' '));
T('filtr daty po stronie usługi (FES): BBOX + DOK_DATA ≥ data', !/BBOX=/.test(u.split('FILTER')[0]) && /<gml:lowerCorner>723906 465840<\/gml:lowerCorner>/.test(f) && /PropertyIsGreaterThanOrEqualTo><fes:ValueReference>DOK_DATA<\/fes:ValueReference><fes:Literal>2024-11-18/.test(f), f);
const op = C.doOperatu([t]);
T('do operatu: izby i kondygnacja, rynek i położenie zostają przy transakcji', op[0].roomsFloor === '3 izby / kond. 2' && op[0].zrodlo.rynek === 'wtórny' && op[0].zrodlo.x === 724004.5 && op[0].zrodlo.idObiektu, op[0]);
// oceny
const proj = { market: { features: [
  { id: 1, name: 'Lokalizacja szczegółowa', rating: 'Korzystna' }, { id: 2, name: 'Standard wykończenia' }, { id: 3, name: 'Stan techniczny i wiek budynku' },
  { id: 4, name: 'Powierzchnia użytkowa' }, { id: 5, name: 'Kondygnacja' }, { id: 6, name: 'Garaż i miejsca postojowe' }, { id: 7, name: 'Usytuowanie', scaleMode: 'two' } ],
  transactions: [
    { area: 113, zrodlo: { rynek: 'pierwotny', x: 724004.5, y: 467741.3, pietro: 0 }, featureRatings: {} },
    { area: 60, zrodlo: { rynek: 'wtórny', x: 726004.5, y: 467741.3, pietro: 2 }, featureRatings: { 2: 'Korzystna' } },
  ] } };
const w = O.uzupelnij(proj, { punkt: { x: 724100, y: 467741.3 }, powierzchnia: 113.7 });
const [t1, t2] = proj.market.transactions;
T('oceny: 500 m od przedmiotu → ocena położenia jak przedmiotu', t1.featureRatings[1] === 'Korzystna' && /96 m/.test(t1.ratingNotes[1]), t1.ratingNotes);
T('oceny: rynek pierwotny → standard do wykończenia, budynek nowy', t1.featureRatings[2] === 'Niekorzystna' && t1.featureRatings[3] === 'Korzystna');
T('oceny: lokal o połowę mniejszy → powierzchnia korzystna (wyższa cena 1 m²)', t2.featureRatings[4] === 'Korzystna' && t1.featureRatings[4] !== 'Korzystna');
T('oceny: parter → niekorzystnie, 2. kondygnacja → korzystnie', t1.featureRatings[5] === 'Niekorzystna' && t2.featureRatings[5] === 'Korzystna');
T('oceny: brak danych → przeciętna z adnotacją', t1.featureRatings[6] === 'Przeciętna' && /nie opisuje/.test(t1.ratingNotes[6]));
T('oceny: ocena wpisana ręcznie zostaje', t2.featureRatings[2] === 'Korzystna');
T('oceny: skala dwustopniowa zostaje do decyzji', !t1.featureRatings[7] && w.pominiete === 2, w);
console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

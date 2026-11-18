'use strict';
/** OPERO — osie i kod powiatu w Rejestrze Cen (żeby transakcje były z właściwego miejsca). Czysta logika. */
const path = require('path'); const fs = require('fs');
const R = path.join(__dirname, '..', 'build', 'app', 'renderer');
const G = require(path.join(R, 'rcn-geoportal.js'));
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
console.log('OPERO — Rejestr Cen: właściwe miejsce w Polsce\n');

const gdansk = [{ teryt: '2261', x: 720100, y: 470050 }, { teryt: '2261', x: 720300, y: 470200 }, { teryt: '226101', x: 719900, y: 469900 }];
const lubelskie = [{ teryt: '0611', x: 470050, y: 720100 }, { teryt: '0612', x: 470200, y: 720300 }];
T('transakcje z powiatu nieruchomości są rozpoznane jako właściwe', G.zgodnyTeryt(gdansk, '2261') === true);
T('transakcje z innego województwa są rozpoznane jako OBCE', G.zgodnyTeryt(lubelskie, '2261') === false);
T('kod z identyfikatora działki też działa', G.zgodnyTeryt(gdansk, '226101_1.0003.55/7') === true);
T('bez kodu po którejś stronie program mówi „nie wiem", a nie „dobrze"', G.zgodnyTeryt(gdansk, '') === null && G.zgodnyTeryt([{ x: 1, y: 2 }], '2261') === null && G.zgodnyTeryt([], '2261') === null);
T('pojedyncza obca transakcja wśród właściwych nie psuje odpowiedzi', G.zgodnyTeryt([...gdansk, lubelskie[0]], '2261') === true);
T('prostokąt z osiami w odwrotnej kolejności', JSON.stringify(G.prostokatOdwrotny([469000, 719000, 471000, 721000])) === '[719000,469000,721000,471000]');

const pkt = { x: 470000, y: 720000, promien: 1000 };
const u = G.uzgodnij(gdansk, pkt);
T('współrzędne podane w odwrotnej kolejności są przestawiane do układu punktu wyceny', u.zamienione === 3 && u.transakcje.every(t => Math.abs(t.x - 470000) < 500 && Math.abs(t.y - 720000) < 500), u.transakcje);
T('po uzgodnieniu każda transakcja ma odległość w metrach', u.transakcje[0].odlegloscM === 112 && u.transakcje.every(t => t.odlegloscM > 0 && t.odlegloscM < 500), u.transakcje.map(t => t.odlegloscM));
const u2 = G.uzgodnij([{ x: 470050, y: 720100 }, { x: 300000, y: 500000 }, { x: null, y: null }], pkt);
T('współrzędne w tej samej kolejności zostają bez zmian', u2.zamienione === 0 && u2.transakcje[0].x === 470050);
T('transakcja daleko poza obszarem zapytania odpada', u2.poza === 1 && u2.transakcje.length === 2);
T('transakcja bez położenia zostaje, ale bez odległości', u2.bezPunktu === 1 && u2.transakcje[1].x === null && u2.transakcje[1].odlegloscM === undefined);

const gml = `<wfs:FeatureCollection><wfs:member><ms:lokale><ms:TERYT>2261</ms:TERYT><ms:LOK_CENA_BRUTTO>690000</ms:LOK_CENA_BRUTTO><ms:LOK_POW_UZYT>66</ms:LOK_POW_UZYT><ms:DOK_DATA>2026-08-10</ms:DOK_DATA><ms:LOK_FUNKCJA>Garaż</ms:LOK_FUNKCJA><ms:TRAN_RODZAJ_RYNKU>wtórny</ms:TRAN_RODZAJ_RYNKU><ms:NIER_UDZIAL>1/2</ms:NIER_UDZIAL><ms:LOK_ULICA>Ikara</ms:LOK_ULICA><ms:LOK_NR_BUD>97</ms:LOK_NR_BUD><ms:MIEJSCOWOSC>Gdańsk</ms:MIEJSCOWOSC><gml:pos>720100 470050</gml:pos></ms:lokale></wfs:member></wfs:FeatureCollection>`;
const z = G.zGml(gml, 'lokale');
T('funkcja lokalu, rynek i udział są czytane', z.transakcje[0].funkcja === 'garaż' && z.transakcje[0].rynek === 'wtórny' && z.transakcje[0].czescUdzialowa === true, z.transakcje[0]);
T('adres składa się z ulicy, numeru i miejscowości, gdy nie ma jednego pola', z.transakcje[0].adres === 'Ikara 97, Gdańsk' && z.transakcje[0].bezAdresu === false, z.transakcje[0].adres);
T('odpowiedź niesie nazwy pól rejestru do diagnozy', z.pola.includes('LOK_FUNKCJA') && z.pola.includes('TERYT'), z.pola);
const bez = G.zGml(gml.replace(/<ms:LOK_ULICA>.*<\/ms:MIEJSCOWOSC>/, ''), 'lokale');
T('brak adresu jest oznaczony, a nie zastąpiony kodem', bez.transakcje[0].adres === '' && bez.transakcje[0].bezAdresu === true);

const main = fs.readFileSync(path.join(R, '..', 'main.js'), 'utf8'), app = fs.readFileSync(path.join(R, 'app.js'), 'utf8');
T('program pyta rejestr w drugiej kolejności osi, gdy pierwsza dała obcy powiat', /for \(const odwrotna of \(maPunkt \? kolejnosci : \[false\]\)\)/.test(main) && /rcnGeo\.zgodnyTeryt\(r\.wszystkie, q\.teryt\)/.test(main));
T('transakcje z obcego powiatu nigdy nie są zwracane', /wybrane\.zObszaru === false\) \{[\s\S]{0,160}wybrane\.wszystkie = \[\];/.test(main));
T('kod powiatu idzie do rejestru z każdego miejsca, które o niego pyta', (app.match(/rcnGeoportal\(\{[^}]*teryt/g) || []).length >= 2);
T('szybka wycena odrzuca garaże, lokale użytkowe i udziały', /!t\.czescUdzialowa && !\/gara\|niemieszk/.test(app));
T('rozjazd szacunku i oferty ponad 60% daje ostrzeżenie', /Math\.abs\(oferta\.pct\) > 60/.test(app));

console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

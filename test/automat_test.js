'use strict';
/** OPERO — automat: otoczenie z OpenStreetMap, plan miejscowy, położenie. Czysta logika. */
const path = require('path');
const fs = require('fs');
const R = path.join(__dirname, '..', 'build', 'app', 'renderer');
const O = require(path.join(R, 'otoczenie.js'));
const OSM = require(path.join(R, 'adres-osm.js'));

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
console.log('OPERO — automat: otoczenie, plan, położenie\n');

const LAT = 54.4305, LON = 18.4712; // Gdańsk Osowa

/* ============== 1. PUNKT I ODLEGŁOŚĆ */
T('punkt w Polsce jest poprawny', O.punktPoprawny(LAT, LON));
T('punkt poza Polską jest odrzucony', !O.punktPoprawny(48.2, 16.37) && !O.punktPoprawny(0, 0));
T('puste i nieliczbowe współrzędne są odrzucone', !O.punktPoprawny('', '') && !O.punktPoprawny('abc', 18) && !O.punktPoprawny(null, undefined));
T('współrzędne zapisane tekstem są przyjęte', O.punktPoprawny('54.43', '18.47'));
const d1 = O.odleglosc(54.43, 18.47, 54.43 + 0.009, 18.47);
T('0,009° szerokości to ok. 1 km', d1 > 990 && d1 < 1010, d1);
T('odległość punktu od siebie to zero', O.odleglosc(LAT, LON, LAT, LON) === 0);
T('mała odległość zaokrągla się do 50 m', O.odlegloscTekst(237) === 'ok. 250 m' && O.odlegloscTekst(12) === 'ok. 50 m', [O.odlegloscTekst(237), O.odlegloscTekst(12)]);
T('duża odległość jest w kilometrach z przecinkiem', O.odlegloscTekst(1240) === 'ok. 1,2 km', O.odlegloscTekst(1240));
T('zła odległość nie daje napisu', O.odlegloscTekst(NaN) === '' && O.odlegloscTekst(-5) === '');

/* ============== 2. ZAPYTANIE O OTOCZENIE */
const q = O.zapytanie(LAT, LON);
T('zapytanie jest w formacie JSON z limitem czasu', q.startsWith('[out:json][timeout:25];'));
T('zapytanie szuka wokół punktu w promieniu 1500 m', q.includes('(around:1500,54.430500,18.471200)'), q.slice(0, 120));
T('zapytanie obejmuje przystanki, szkoły, sklepy i parki', ['"highway"="bus_stop"', '"amenity"="school"', '"shop"="supermarket"', '"leisure"="park"', '"railway"="station"'].every(x => q.includes(x)));
T('zapytanie prosi o środek obiektów powierzchniowych', /out center tags/.test(q));
T('promień jest ograniczony z obu stron', O.zapytanie(LAT, LON, 99999).includes('around:3000,') && O.zapytanie(LAT, LON, 5).includes('around:300,'));
T('dla złego punktu nie ma zapytania', O.zapytanie(0, 0) === '');

/* ============== 3. ODPOWIEDŹ MAPY */
const odp = { elements: [
  { type: 'node', lat: LAT + 0.002, lon: LON, tags: { highway: 'bus_stop', name: 'Osowa PKP' } },
  { type: 'node', lat: LAT + 0.0021, lon: LON + 0.0001, tags: { highway: 'bus_stop', name: 'Osowa PKP' } },
  { type: 'node', lat: LAT + 0.006, lon: LON, tags: { highway: 'bus_stop', name: 'Barniewicka' } },
  { type: 'node', lat: LAT + 0.004, lon: LON + 0.004, tags: { railway: 'station', name: 'Gdańsk Osowa' } },
  { type: 'way', center: { lat: LAT - 0.003, lon: LON }, tags: { amenity: 'school', name: 'Szkoła Podstawowa nr 81' } },
  { type: 'node', lat: LAT, lon: LON + 0.003, tags: { shop: 'supermarket', brand: 'Biedronka' } },
  { type: 'node', lat: LAT + 0.001, lon: LON + 0.001, tags: { amenity: 'pharmacy' } },
  { type: 'way', center: { lat: LAT - 0.008, lon: LON - 0.004 }, tags: { landuse: 'forest', name: 'Trójmiejski Park Krajobrazowy' } },
  { type: 'node', lat: LAT, lon: LON, tags: { amenity: 'bench' } },
  { type: 'way', tags: { leisure: 'park', name: 'bez położenia' } },
] };
const w = O.zOdpowiedzi(JSON.stringify(odp), LAT, LON);
T('odpowiedź jest czytana', w.ok && w.ile === 8, w.ile);
T('najbliższy przystanek ma nazwę i odległość', w.kategorie.autobus.najblizszy.nazwa === 'Osowa PKP' && Math.abs(w.kategorie.autobus.najblizszy.odl - 222) < 5, w.kategorie.autobus.najblizszy);
T('przystanek w obie strony liczy się raz', w.kategorie.autobus.ile === 2, w.kategorie.autobus.ile);
T('obiekt powierzchniowy bierze położenie ze środka', w.kategorie.szkola.najblizszy.nazwa === 'Szkoła Podstawowa nr 81' && w.kategorie.szkola.najblizszy.odl > 300);
T('sklep bez nazwy bierze markę', w.kategorie.sklep.najblizszy.nazwa === 'Biedronka');
T('obiekt spoza listy jest pomijany', !Object.values(w.kategorie).some(k => /bench/.test(JSON.stringify(k))));
T('obiekt bez położenia jest pomijany', !w.kategorie.park);
T('las z dwóch rodzajów znaczników trafia do jednej kategorii', w.kategorie.las.jeden === 'las');
T('zepsuta odpowiedź jest zgłaszana, nie wywraca programu', O.zOdpowiedzi('<html>błąd', LAT, LON).ok === false && O.zOdpowiedzi({ remark: 'timeout' }, LAT, LON).ok === false);
T('pusta mapa to poprawna odpowiedź bez obiektów', (() => { const p = O.zOdpowiedzi({ elements: [] }, LAT, LON); return p.ok && p.ile === 0; })());

/* ============== 4. ZDANIA DO OPERATU */
const opis = O.opis(w, { adres: 'ul. Siedleckiego 9', dzielnica: 'Osowa', miasto: 'Gdańsk', data: '13.11.2026' });
T('rubryka „komunikacja" wymienia przystanek i stację', /przystanek autobusowy „Osowa PKP" — ok\. 200 m/.test(opis.pola.transport) && /stacja kolejowa „Gdańsk Osowa"/.test(opis.pola.transport), opis.pola.transport);
T('obiekty w rubryce idą od najbliższego', opis.pola.transport.indexOf('Osowa PKP') < opis.pola.transport.indexOf('Gdańsk Osowa'));
T('rubryka „usługi" wymienia szkołę, sklep i aptekę', /szkoła/.test(opis.pola.services) && /Biedronka/.test(opis.pola.services) && /apteka — ok\./.test(opis.pola.services), opis.pola.services);
T('obiekt bez nazwy nie dostaje pustych cudzysłowów', !/„"/.test(opis.pola.services + opis.opis));
T('rubryka „zieleń" wymienia las', /las „Trójmiejski Park Krajobrazowy"/.test(opis.pola.recreation));
T('każda rubryka mówi, że to odległości w linii prostej', ['transport', 'services', 'recreation'].every(k => /w linii prostej/.test(opis.pola[k])));
T('opis zaczyna się od adresu', /^Nieruchomość położona jest pod adresem: ul\. Siedleckiego 9, dzielnica Osowa, Gdańsk\./.test(opis.opis));
T('opis podaje źródło i datę', /Źródło: OpenStreetMap/.test(opis.opis) && /stan na 13\.11\.2026/.test(opis.opis));
T('opis zostawia znacznik do potwierdzenia na oględzinach', /\[DO POTWIERDZENIA\]/.test(opis.opis));
T('opis nie wymienia kategorii, których mapa nie zna', !/tramwaj|metr[ao]|poczt|plac zabaw/.test(opis.opis));
const pusty = O.opis(O.zOdpowiedzi({ elements: [] }, LAT, LON), { adres: 'ul. X 1', miasto: 'Y' });
T('bez obiektów nie ma opisu — program nie pisze o niczym', pusty.jest === false && pusty.opis === '' && pusty.pola.transport === '');
const pods = O.podsumowanie(w);
T('podsumowanie mówi, co jest', pods.sa.length === 6, pods.sa.length);
T('i czego mapa nie pokazuje', pods.brak.includes('przystanek tramwajowy') && pods.brak.includes('park') && !pods.brak.includes('szkoła'), pods.brak);

/* ============== 5. PLAN MIEJSCOWY */
const u = O.mpzpUrl(LAT, LON);
T('zapytanie o plan idzie do krajowej integracji planów', u.startsWith('https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego?'));
T('pyta „co jest pod punktem"', /REQUEST=GetFeatureInfo/.test(u) && /INFO_FORMAT=text%2Fhtml/.test(u));
T('używa współrzędnych geograficznych — długość przed szerokością', /SRS=EPSG%3A4326/.test(u) && /BBOX=18\.4706\d*%2C54\.4299/.test(u), u);
T('dla złego punktu nie ma zapytania o plan', O.mpzpUrl(0, 0) === '');
const html = '<html><body><table><tr><th>Tytuł</th><td>MPZP Osowa rejon ulicy Siedleckiego</td></tr><tr><th>Uchwała</th><td>Uchwała Nr XL/1234/2021 Rady Miasta Gdańska</td></tr><tr><td><a href="https://bip.gdansk.pl/plany/1234">dokument</a></td></tr></table><script>alert(1)</script></body></html>';
const m = O.mpzpZOdpowiedzi(html);
T('rozpoznaje, że plan jest', m.ok && m.jest);
T('czyta tytuł planu', m.nazwa === 'MPZP Osowa rejon ulicy Siedleckiego', m.nazwa);
T('czyta uchwałę', /^Uchwała Nr XL\/1234\/2021 Rady Miasta Gdańska/.test(m.uchwala), m.uchwala);
T('bierze odnośnik do dokumentu gminy', m.link === 'https://bip.gdansk.pl/plany/1234');
T('tekst do przejrzenia nie zawiera kodu strony', !/<|alert/.test(m.tekst), m.tekst);
const brak = O.mpzpZOdpowiedzi('<html><body></body></html>');
T('pusta odpowiedź: brak planu w usłudze', brak.ok && brak.jest === false);
T('i uczciwa uwaga, że to nie przesądza o braku planu', /nie przesądza/.test(brak.powod));
T('błąd usługi jest rozpoznany jako błąd, nie jako plan', O.mpzpZOdpowiedzi('<ServiceExceptionReport><ServiceException>Layer not defined</ServiceException></ServiceExceptionReport>').ok === false);
T('symbolu terenu program nie zgaduje', !('symbol' in m) && !('przeznaczenie' in m));

/* ============== 6. POŁOŻENIE Z ADRESU */
const pkt = OSM.punkt(JSON.stringify([
  { lat: '48.2', lon: '16.3', address: { country_code: 'at' } },
  { lat: '54.4305', lon: '18.4712', display_name: '9, Siedleckiego, Osowa, Gdańsk', address: { house_number: '9', country_code: 'pl' } },
]));
T('bierze pierwszą polską pozycję', pkt && pkt.lat === 54.4305 && pkt.lon === 18.4712, pkt);
T('wie, czy trafił w numer budynku', pkt.dokladny === true && OSM.punkt([{ lat: 54.4, lon: 18.4, address: { road: 'X', country_code: 'pl' } }]).dokladny === false);
T('brak wyników daje null', OSM.punkt('[]') === null && OSM.punkt('śmieci') === null);

/* ============== 7. PROGRAM GŁÓWNY I OKNO */
const main = fs.readFileSync(path.join(R, '..', 'main.js'), 'utf8');
const app = fs.readFileSync(path.join(R, 'app.js'), 'utf8');
T('otoczenie i plan idą równolegle i nie blokują się nawzajem', /Promise\.allSettled\(\[otoczenie, mpzp\]\)/.test(main));
T('program przedstawia się usługom mapy', /otoczenie:zbierz[\s\S]{0,600}user-agent/.test(main));
T('automat wpisuje tylko do pustych rubryk', /if \(jest\)\{ if \(jest !== t\) pominiete\.push\(nazwa\); return false; \}/.test(app));
T('przy kilku działkach pod adresem numer NIE jest wpisywany', /numeru nie wpisałem/.test(app));
T('pusty przycisk PER pisze, zamiast odsyłać do pisania', /await perNapiszPole\(btn,cel,zadanie,pole\)/.test(app) && !/Najpierw napisz w tym polu wlasny tekst roboczy/.test(app));
T('tekst modelu z obcą liczbą idzie do decyzji, nie do operatu', /if \(!kontrola\.ok\)\{\s*perPolePodglad/.test(app));

console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

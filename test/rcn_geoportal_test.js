'use strict';
/**
 * OPERO — transakcje z Rejestru Cen Nieruchomości (usługa GUGiK).
 *
 * Najważniejsze w tym teście nie jest parsowanie XML-a, tylko dwie rzeczy,
 * których pomylenie kosztowałoby rzeczoznawcę operat:
 *   1. pusty wynik NIE znaczy „nie było transakcji" — rejestr obejmuje tylko
 *      powiaty, które przesłały dane, i program musi to mówić wprost,
 *   2. cena z całej transakcji nie jest ceną jednej nieruchomości; dzielenie
 *      jej przez powierzchnię jednego lokalu daje liczbę bez sensu.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const G = require(path.join(APP, 'renderer', 'rcn-geoportal.js'));

console.log('OPERO — RCN z Geoportalu\n');

/* --- 1. Adresy zapytań --- */
const bbox = G.prostokat(470000, 724000, 1000);
T('prostokąt liczony jest w metrach układu 1992',
  bbox[0] === 469000 && bbox[1] === 723000 && bbox[2] === 471000 && bbox[3] === 725000, JSON.stringify(bbox));
T('zbyt mały promień jest podnoszony do sensownego minimum',
  G.prostokat(470000, 724000, 1)[2] - 470000 === 100);
let bezPunktu = false;
try { G.prostokat(null, null); } catch { bezPunktu = true; }
T('bez współrzędnych program nie pyta usługi', bezPunktu);

const url = G.urlTransakcji({ typ: 'lokale', bbox });
T('zapytanie idzie do usługi GUGiK', url.startsWith('https://mapy.geoportal.gov.pl/wss/service/rcn?'));
T('to jest WFS 2.0.0 GetFeature', /SERVICE=WFS/.test(url) && /VERSION=2.0.0/.test(url) && /REQUEST=GetFeature/.test(url));
T('pytamy o właściwy typ obiektu', /TYPENAMES=ms%3Alokale/.test(url));
T('obszar i układ idą razem', /BBOX=469000%2C723000%2C471000%2C725000%2Curn%3Aogc%3Adef%3Acrs%3AEPSG%3A%3A2180/.test(url));
T('prosimy o GML, bo usługa nie daje JSON-a', /OUTPUTFORMAT=text%2Fxml.*gml%2F3.2.1/.test(url));
T('liczba obiektów jest ograniczona', /COUNT=\d+/.test(url) && Number(/COUNT=(\d+)/.exec(url)[1]) <= G.MAKS_OBIEKTOW);
T('da się pytać o budynki i działki',
  /ms%3Abudynki/.test(G.urlTransakcji({ typ: 'budynki', bbox })) && /ms%3Adzialki/.test(G.urlTransakcji({ typ: 'dzialki', bbox })));
let zlyTyp = false;
try { G.urlTransakcji({ typ: 'samoloty', bbox }); } catch { zlyTyp = true; }
T('nieznany rodzaj obiektu jest odrzucany', zlyTyp);

/* --- 2. Odpowiedź usługi (GML w kształcie ze schematu GUGiK) --- */
const lokal = (nad = {}) => {
  const d = { id: 1, adres: 'ul. Długa 12/3, Gdańsk', data: '2026-05-14', cenaTran: 480000, cenaLok: 480000,
    pow: 54.2, prawo: 'własność', rodzaj: 'sprzedaż', rynek: 'wtórny', udzial: '1/1', akt: 'Rep. A 123/2026', ...nad };
  return `<ms:lokale gml:id="lokale.${d.id}">
    <ms:GEOMETRIA><gml:Point srsName="EPSG:2180"><gml:pos>724000 470000</gml:pos></gml:Point></ms:GEOMETRIA>
    <ms:gid>${d.id}</ms:gid><ms:TERYT>226101_1</ms:TERYT>
    <ms:TRAN_RODZAJ_TRANS>${d.rodzaj}</ms:TRAN_RODZAJ_TRANS>
    <ms:TRAN_RODZAJ_RYNKU>${d.rynek}</ms:TRAN_RODZAJ_RYNKU>
    <ms:TRAN_CENA_BRUTTO>${d.cenaTran}</ms:TRAN_CENA_BRUTTO>
    <ms:DOK_OZNACZENIE>${d.akt}</ms:DOK_OZNACZENIE>
    <ms:DOK_DATA><gml:TimeInstant><gml:timePosition>${d.data}</gml:timePosition></gml:TimeInstant></ms:DOK_DATA>
    <ms:NIER_RODZAJ>lokalowa</ms:NIER_RODZAJ><ms:NIER_PRAWO>${d.prawo}</ms:NIER_PRAWO>
    <ms:NIER_UDZIAL>${d.udzial}</ms:NIER_UDZIAL>
    <ms:LOK_FUNKCJA>mieszkalna</ms:LOK_FUNKCJA><ms:LOK_LICZBA_IZB>3</ms:LOK_LICZBA_IZB>
    <ms:LOK_POW_UZYT>${d.pow}</ms:LOK_POW_UZYT>
    ${d.cenaLok == null ? '' : `<ms:LOK_CENA_BRUTTO>${d.cenaLok}</ms:LOK_CENA_BRUTTO>`}
    <ms:LOK_ADRES>${d.adres}</ms:LOK_ADRES>
  </ms:lokale>`;
};
const koperta = (tresc) => `<?xml version="1.0"?><wfs:FeatureCollection xmlns:wfs="http://www.opengis.net/wfs/2.0"
  xmlns:ms="http://mapserver.gis.umn.edu/mapserver" xmlns:gml="http://www.opengis.net/gml/3.2">
  ${tresc.map(t => `<wfs:member>${t}</wfs:member>`).join('')}</wfs:FeatureCollection>`;

const w = G.zGml(koperta([lokal(), lokal({ id: 2, adres: 'ul. Krótka 4/1, Gdańsk', pow: 40, cenaTran: 360000, cenaLok: 360000 })]), 'lokale');
T('transakcje są odczytane', w.ok && w.transakcje.length === 2, JSON.stringify(w.powod));
T('cena, powierzchnia i data trafiają na miejsce',
  w.transakcje[0].cena === 480000 && w.transakcje[0].powierzchnia === 54.2 && w.transakcje[0].data === '2026-05-14');
T('cena jednostkowa jest policzona', Math.abs(w.transakcje[0].jednostkowa - 480000 / 54.2) < 0.01);
T('adres i miejscowość są wyciągnięte',
  /Długa 12\/3/.test(w.transakcje[0].adres) && w.transakcje[0].miejscowosc === 'Gdańsk', w.transakcje[0].miejscowosc);
T('numer aktu notarialnego zostaje przy transakcji', w.transakcje[0].akt === 'Rep. A 123/2026');
T('prawo i rodzaj transakcji są przeniesione',
  w.transakcje[0].prawo === 'własność' && w.transakcje[0].rodzaj === 'sprzedaż');
T('rodzaj rynku jest zapisany w uwagach', /wtórny/.test(w.transakcje[0].uwagiZrodla));
T('transakcje mają ciągłą numerację', w.transakcje[1].zrodloWiersz === 2);

// Sedno: cena calej transakcji to NIE cena tego lokalu.
const bezCenyLokalu = G.zGml(koperta([lokal({ cenaLok: null, cenaTran: 900000 })]), 'lokale');
T('gdy powiat nie rozbił ceny, program używa ceny transakcji',
  bezCenyLokalu.transakcje[0].cena === 900000);
T('ale mówi wprost, że to cena całej transakcji',
  /całej transakcji/i.test(bezCenyLokalu.transakcje[0].uwagiZrodla), bezCenyLokalu.transakcje[0].uwagiZrodla);
T('transakcja dotycząca udziału jest oznaczona',
  /udziału 1\/2/.test(G.zGml(koperta([lokal({ udzial: '1/2' })]), 'lokale').transakcje[0].uwagiZrodla));

const niekompletne = G.zGml(koperta([lokal({ id: 3, pow: 0 }), lokal({ id: 4, data: '' }), lokal()]), 'lokale');
T('pozycje bez ceny, daty albo powierzchni są pomijane, a nie zgadywane',
  niekompletne.transakcje.length === 1 && niekompletne.pominieto === 2);

/* --- 3. Błąd usługi nazwany po imieniu --- */
const blad = G.zGml(`<?xml version="1.0"?><ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows/1.1">
  <ows:Exception><ows:ExceptionText>msWFSGetFeature(): typeName nie istnieje</ows:ExceptionText></ows:Exception></ows:ExceptionReport>`, 'lokale');
T('błąd usługi nie udaje pustego wyniku', !blad.ok && /typeName/.test(blad.powod), blad.powod);
T('pusta kolekcja nie jest błędem', G.zGml(koperta([]), 'lokale').ok === true);

/* --- 4. Komunikat: pustka ma DWA znaczenia --- */
const pusto = G.komunikat(G.zGml(koperta([]), 'lokale'), { powiat: 'gdański' });
T('przy pustym wyniku program nie twierdzi, że transakcji nie było',
  /nie znaczy, że ich nie było/i.test(pusto), pusto.slice(0, 120));
T('i tłumaczy, że rejestr obejmuje nie wszystkie powiaty',
  /powiat/i.test(pusto) && /320/.test(pusto));
T('podpowiada, co zrobić dalej', /wyciąg ze starostwa|rozszerz/i.test(pusto));

const zWynikiem = G.komunikat(w);
T('przy wyniku program mówi, ile pobrał', /2 transakcj/i.test(zWynikiem), zWynikiem);
T('i przypomina, że to ceny z aktów, a nie oferty', /akt(ów)? notarialnych/i.test(zWynikiem));
T('oraz że dobór należy do rzeczoznawcy', /należy do Ciebie/i.test(zWynikiem));

/* --- 5. Źródło do wpisania w operacie --- */
const zrodlo = G.opisZrodla('2026-11-03');
T('opis źródła nadaje się do wklejenia w operat',
  /Rejestr Cen Nieruchomości/.test(zrodlo) && /Geodezji i Kartografii/.test(zrodlo));
T('opis źródła niesie adres usługi i datę pobrania',
  zrodlo.includes('mapy.geoportal.gov.pl/wss/service/rcn') && zrodlo.includes('2026-11-03'));

/* --- 6. Moduł nie zna żadnego innego adresu --- */
const kod = fs.readFileSync(path.join(APP, 'renderer', 'rcn-geoportal.js'), 'utf8');
const adresy = (kod.match(/https?:\/\/[a-z0-9.\-]+/gi) || []).map(a => a.toLowerCase());
T('moduł pyta wyłącznie usług GUGiK i standardów OGC',
  adresy.every(a => /gugik\.gov\.pl|geoportal\.gov\.pl|opengis\.net|mapserver\.gis\.umn\.edu/.test(a)), adresy.join(', '));

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

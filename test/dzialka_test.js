'use strict';
/**
 * OPERO — od adresu do działki, od działki do księgi wieczystej.
 *
 * Najważniejsze, czego pilnuje ten test, nie jest techniczne: program NIE MA
 * prawa udawać, że zna numer księgi wieczystej. Nie ma darmowej, oficjalnej
 * wyszukiwarki „adres → KW" — numer księgi jest w ewidencji daną chronioną.
 * Sprawdzamy więc i to, że adresy zapytań idą wyłącznie do usług GUGiK, i to,
 * że numery KW biorą się wyłącznie z własnych danych rzeczoznawcy, i to, że
 * wniosek do starosty niesie prawdziwą podstawę prawną — bo pod tym wnioskiem
 * podpisuje się człowiek.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const D = require(path.join(APP, 'renderer', 'dzialka.js'));

console.log('OPERO — od adresu do działki\n');

/* --- 1. Adres w postaci, której oczekuje geokoder --- */
T('miejscowość, ulica i numer składają się w jeden adres',
  D.adresDoZapytania({ miasto: 'Gdańsk', ulica: 'Długa', numer: '12' }) === 'Gdańsk, Długa 12');
T('„ul.” przed nazwą ulicy jest zdejmowane',
  D.adresDoZapytania({ miasto: 'Gdańsk', ulica: 'ul. Długa', numer: '12' }) === 'Gdańsk, Długa 12');
T('aleja i plac też',
  D.adresDoZapytania({ miasto: 'Sopot', ulica: 'al. Niepodległości', numer: '5' }) === 'Sopot, Niepodległości 5');
T('sama miejscowość wystarczy', D.adresDoZapytania({ miasto: 'Krzewina' }) === 'Krzewina');
T('miejscowość z numerem bez ulicy', D.adresDoZapytania({ miasto: 'Krzewina', numer: '134' }) === 'Krzewina 134');
let bezMiasta = false;
try { D.adresDoZapytania({ ulica: 'Długa' }); } catch { bezMiasta = true; }
T('bez miejscowości program nie udaje, że szuka', bezMiasta);

/* --- 2. Adresy zapytań: tylko oficjalne usługi GUGiK --- */
const url1 = D.urlGeokodera('Gdańsk, Długa 12');
const url2 = D.urlDzialkiPoXY(630889.87, 497178.59);
const url3 = D.urlDzialkiPoNumerze('Stara Wieś', '756');
const url4 = D.urlGeoportalu('141201_1.0001.6509');
T('geokoder to usługa GUGiK', url1.startsWith('https://services.gugik.gov.pl/uug/?request=GetAddress'));
T('adres jest w zapytaniu zakodowany', url1.includes('Gda%C5%84sk%2C%20D%C5%82uga%2012'));
T('działki pobieramy z ULDK', url2.startsWith('https://uldk.gugik.gov.pl/?request=GetParcelByXY'));
T('pytamy o komplet pól działki',
  D.POLA_ULDK.every(p => url2.includes(p)) && url2.includes('xy=630889.87,497178.59'));
T('szukanie po obrębie i numerze też idzie do ULDK',
  url3.includes('request=GetParcelByIdOrNr') && url3.includes('Stara%20Wie%C5%9B%20756'));
T('link do mapy prowadzi do Geoportalu',
  url4 === 'https://mapy.geoportal.gov.pl/imapnext/imap/?identifyParcel=141201_1.0001.6509');
// To jest sedno: zaden adres w tym module nie moze prowadzic do cudzej bazy ksiag.
const zrodla = fs.readFileSync(path.join(APP, 'renderer', 'dzialka.js'), 'utf8');
const adresy = (zrodla.match(/https?:\/\/[a-z0-9.\-]+/gi) || []).map(a => a.toLowerCase());
T('moduł nie zna żadnego adresu poza GUGiK i Geoportalem',
  adresy.every(a => /gugik\.gov\.pl|geoportal\.gov\.pl/.test(a)), adresy.join(', '));

/* --- 3. Odpowiedź geokodera --- */
const odpUUG = JSON.stringify({ results: { 1: {
  city: 'Gdańsk', street: 'Długa', number: '12', code: '80-831',
  voivodeship: 'pomorskie', county: 'Gdańsk', commune: 'Gdańsk',
  x: 724000.12, y: 470000.45, teryt: '226101_1' } } });
const punkty = D.punktyZGeokodera(odpUUG);
T('z odpowiedzi geokodera wyjmujemy punkt', punkty.length === 1);
T('punkt ma współrzędne', punkty[0].x === 724000.12 && punkty[0].y === 470000.45);
T('punkt zna adres i województwo',
  punkty[0].miasto === 'Gdańsk' && punkty[0].ulica === 'Długa' && punkty[0].wojewodztwo === 'pomorskie');
T('odpowiedź jako lista też się rozłoży',
  D.punktyZGeokodera({ results: [{ x: 1, y: 2 }] }).length === 1);
T('śmieci zamiast odpowiedzi nie wywracają programu',
  D.punktyZGeokodera('to nie jest json').length === 0 && D.punktyZGeokodera(null).length === 0);
T('punkt bez współrzędnych jest pomijany',
  D.punktyZGeokodera({ results: [{ city: 'Gdańsk' }] }).length === 0);

/* „Stara Wieś" jest w Polsce setki razy — województwo musi coś znaczyć. */
const wiele = D.dopasujPunkty([
  { x: 1, y: 1, wojewodztwo: 'mazowieckie', kod: '05-500' },
  { x: 2, y: 2, wojewodztwo: 'pomorskie', kod: '83-110' },
], { wojewodztwo: 'pomorskie' });
T('wskazane województwo wysuwa właściwy punkt na przód', wiele[0].wojewodztwo === 'pomorskie');
T('ale pozostałe punkty nie znikają po cichu', wiele.length === 2);
T('kod pocztowy waży więcej niż województwo',
  D.dopasujPunkty([
    { x: 1, y: 1, wojewodztwo: 'pomorskie', kod: '00-000' },
    { x: 2, y: 2, wojewodztwo: 'mazowieckie', kod: '83-110' },
  ], { wojewodztwo: 'pomorskie', kod: '83-110' })[0].kod === '83-110');

/* --- 4. Odpowiedź ULDK --- */
const odpULDK = '0\n226101_1.0001.123/4|226101_1.0001.123/4|123/4|Śródmieście|Gdańsk|Gdańsk|pomorskie';
const wynik = D.dzialkiZOdpowiedzi(odpULDK);
T('działka wyjęta z odpowiedzi ULDK', wynik.ok && wynik.dzialki.length === 1);
T('działka ma identyfikator, numer i obręb',
  wynik.dzialki[0].id === '226101_1.0001.123/4' && wynik.dzialki[0].numer === '123/4'
  && wynik.dzialki[0].obreb === 'Śródmieście');
T('działka zna gminę, powiat i województwo',
  wynik.dzialki[0].gmina === 'Gdańsk' && wynik.dzialki[0].powiat === 'Gdańsk'
  && wynik.dzialki[0].wojewodztwo === 'pomorskie');

const wiele2 = D.dzialkiZOdpowiedzi('0\n2\nA|A|1|Obręb|G|P|W\nB|B|2|Obręb|G|P|W');
T('liczba wyników nie jest brana za działkę', wiele2.ok && wiele2.dzialki.length === 2);

const brak = D.dzialkiZOdpowiedzi('-1');
T('status inny niż zero to „nie znaleziono”, a nie pusta lista', !brak.ok && /nie ma działki/i.test(brak.powod));
T('pusta odpowiedź jest nazwana po imieniu', !D.dzialkiZOdpowiedzi('').ok);
T('odpowiedź nieczytelna jest nazwana po imieniu', !D.dzialkiZOdpowiedzi('cokolwiek').ok);

/* --- 5. Numer KW z WŁASNYCH danych rzeczoznawcy --- */
const adres = { miasto: 'Gdańsk', ulica: 'Długa', numer: '12' };
const dzialka = { id: '226101_1.0001.123/4', numer: '123/4', obreb: 'Śródmieście', gmina: 'Gdańsk', powiat: 'Gdańsk' };

const zWyciagu = D.kwZWlasnychZrodel({ adres, dzialka,
  transakcje: [{ address: 'ul. Długa 12', zrodlo: { kw: 'GD1G/00012345/0' } },
               { address: 'ul. Inna 3', zrodlo: { kw: 'GD1G/00099999/9' } }] });
T('numer KW znaleziony w wyciągu RCiWN po adresie',
  zWyciagu.length === 1 && zWyciagu[0].kw === 'GD1G/00012345/0' && zWyciagu[0].skad === 'rcn');
T('cudzy adres z wyciągu nie jest podstawiany', !zWyciagu.some(x => x.kw.includes('99999')));

// Najgrozniejszy blad, jaki moze tu popelnic program: podstawic ksiege spod
// sasiedniego numeru. Rzeczoznawca wpisalby do operatu cudza nieruchomosc.
T('numer domu musi zgadzać się co do znaku',
  D.kwZWlasnychZrodel({ adres, dzialka,
    transakcje: [{ address: 'ul. Długa 1', zrodlo: { kw: 'GD1G/00000001/1' } },
                 { address: 'ul. Długa 120', zrodlo: { kw: 'GD1G/00000120/2' } }] }).length === 0);
T('ta sama ulica w innym mieście bez numeru nie jest dopasowywana',
  !D.pasujeAdres({ miasto: 'Gdańsk', numer: '12' }, 'Sopot Długa 12'));
T('adres bez miejscowości w wyciągu nadal się dopasowuje',
  D.pasujeAdres({ miasto: 'Gdańsk', ulica: 'Długa', numer: '12' }, 'ul. Długa 12'));

const zKsiegi = D.kwZWlasnychZrodel({ adres, dzialka,
  ksiega: [{ dzialka: '226101_1.0001.123/4', kw: 'GD1G/00054321/1', kiedy: '2026-02-03T10:00:00Z' }] });
T('raz ustalony numer wraca przy tej samej działce',
  zKsiegi.length === 1 && zKsiegi[0].skad === 'ksiega' && zKsiegi[0].pewnosc === 'pewne');
T('numer z innej działki nie jest podstawiany',
  D.kwZWlasnychZrodel({ adres, dzialka, ksiega: [{ dzialka: 'INNA', kw: 'GD1G/00000001/1' }] }).length === 0);

const zHistorii = D.kwZWlasnychZrodel({ adres, dzialka,
  historia: [{ title: 'Gdańsk Długa 12 — lokal', kw: 'GD1G/00011111/1' }] });
T('numer z własnego operatu w historii też jest znajdowany', zHistorii.length === 1);

T('bez własnych danych program NIE wymyśla numeru',
  D.kwZWlasnychZrodel({ adres, dzialka }).length === 0);
T('ogonki i „ul.” nie przeszkadzają w dopasowaniu',
  D.uprosc('ul. Długa 12') === D.uprosc('Dluga 12'));

/* --- 6. Wniosek do starosty --- */
const wniosek = D.wniosekDoStarosty({
  dzialka, adres,
  profil: { name: 'Jan Kowalski', licenseNo: '1234', email: 'jan@example.com' },
  cel: 'sprzedaż', data: '2026-10-26',
});
T('wniosek adresuje właściwego starostę', /Starosta Gdańsk/.test(wniosek));
T('wniosek niesie identyfikator działki', wniosek.includes('226101_1.0001.123/4'));
T('wniosek niesie numer działki i obręb', /123\/4/.test(wniosek) && /Śródmieście/.test(wniosek));
T('wniosek wprost prosi o numer księgi wieczystej', /numer księgi wieczystej/i.test(wniosek));
// Podstawa prawna musi byc prawdziwa - pod wnioskiem podpisuje sie rzeczoznawca.
T('wniosek powołuje art. 155 ustawy o gospodarce nieruchomościami',
  /art\. 155 ust\. 1 pkt 1 i 2 oraz ust\. 3/.test(wniosek) && /gospodarce nieruchomościami/.test(wniosek));
T('wniosek powołuje Prawo geodezyjne i kartograficzne',
  /art\. 24/.test(wniosek) && /Prawo geodezyjne i kartograficzne/.test(wniosek));
T('wniosek podaje nazwisko i numer uprawnień', /Jan Kowalski/.test(wniosek) && /uprawnienia nr 1234/.test(wniosek));
T('wniosek podaje cel wykorzystania danych', /Cel wykorzystania danych/.test(wniosek) && /sprzedaż/.test(wniosek));
T('wniosek ma miejsce na podpis', /\.{10,}/.test(wniosek));
const pusty = D.wniosekDoStarosty({ dzialka: {}, adres: {}, profil: {} });
T('bez wypełnionego profilu wniosek pokazuje, co dopisać ręcznie',
  /\[imię i nazwisko rzeczoznawcy\]/.test(pusty) && /\[numer uprawnień zawodowych\]/.test(pusty));

/* --- 7. Kolejność dróg: najpierw darmowe --- */
const kroki = D.dalszeKroki({ dzialka, znalezioneKW: [{ kw: 'GD1G/00012345/0' }] });
T('gdy numer jest w swoich danych, stoi na pierwszym miejscu', kroki[0].id === 'wlasne');
T('płatny serwis jest zawsze na końcu', kroki[kroki.length - 1].id === 'platne');
T('program mówi wprost, że z płatnych baz nic nie pobiera',
  /nie obsługuje i nie pobiera/.test(kroki[kroki.length - 1].opis));
const krokiBezKW = D.dalszeKroki({ dzialka, znalezioneKW: [] });
T('bez własnego numeru pierwsze są drogi darmowe',
  krokiBezKW[0].id === 'geoportal' && krokiBezKW[1].id === 'wniosek');
T('każda droga mówi, ile kosztuje', D.dalszeKroki({ dzialka }).every(k => k.koszt));

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

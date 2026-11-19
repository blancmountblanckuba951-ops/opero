'use strict';
/** OPERO 3.4 — wizja (Claude czyta obrazy) i Mózg OPERO (n8n): polecenia, odczyt odpowiedzi, księga do operatu, okładka. */
const K = n => require('/root/work/build/app/renderer/' + n);
const V = K('wizja.js'), C = K('model-chmura.js');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 500) : '')); } };
console.log('OPERO 3.4 — wizja i Mózg OPERO\n');
// Mózg OPERO
const u = C.ustawienia({});
T('domyślnie: Mózg OPERO, włączony, zgoda wymagana', u.dostawca === 'opero' && u.wlaczony === true && u.zgoda === false && /n8n\.cloud\/webhook\/opero-mozg$/.test(u.baza));
T('bez zgody nie pracuje; ze zgodą — bez klucza i bez nazwy modelu', !C.gotowosc(u, false).aktywny && C.gotowosc({ zgoda: true }, false).aktywny);
T('własny klucz Anthropic nadal wymaga klucza i modelu', !C.gotowosc({ dostawca: 'anthropic', zgoda: true }, false).aktywny);
const z = C.zadanie({ zgoda: true }, null, [{ role: 'system', content: 'SYS' }, { role: 'user', content: [{ type: 'image', dataUrl: 'data:image/jpeg;base64,AAAA' }, { type: 'image', dataUrl: 'javascript:zle' }, { type: 'text', text: 'opisz' }] }], { maks: 900 });
T('zapytanie do Mózgu: system, polecenie, tylko prawdziwe obrazy, licencję dokłada program', z.body.system === 'SYS' && z.body.polecenie === 'opisz' && z.body.obrazy.length === 1 && z.body.maks === 900 && z.wymagaLicencji === true && !('licencja' in z.body), z);
T('odpowiedź Mózgu: tekst', C.zOdpowiedzi('opero', 200, JSON.stringify({ ok: true, text: '```json\n{"a":1}\n```' })).text === '{"a":1}');
T('odpowiedź Mózgu: odmowa licencji czytelna', /Licencja OPERO wygasła/.test(C.zOdpowiedzi('opero', 401, JSON.stringify({ ok: false, powod: 'Licencja OPERO wygasła.' })).powod));
// Klasyfikacja
const pol = V.polecenieKlasyfikacji(['IMG_1.jpg', 'kw.png']);
T('polecenie klasyfikacji wymienia pliki i rodzaje (kw, rzut, elewacja, wnętrze, mapa)', /1\. IMG_1\.jpg/.test(pol) && /"elewacja"/.test(pol) && /"kw"/.test(pol) && /okladka/.test(pol));
const odp = 'Oto wynik:\n```json\n{"obrazy":[{"nr":1,"rodzaj":"elewacja","podpis":"Budynek — elewacja frontowa","okladka":9},{"nr":2,"rodzaj":"kw","okladka":7},{"nr":3,"rodzaj":"wnetrze","pomieszczenie":"salon","podpis":"Salon","okladka":3},{"nr":4,"rodzaj":"cos","okladka":2}]}\n```';
const k = V.klasyfikacja(odp, 5);
T('klasyfikacja: JSON w bloku kodu, kolejność, nieznany rodzaj → inne, brak → inne', k.length === 5 && k[0].rodzaj === 'elewacja' && k[1].rodzaj === 'kw' && k[2].pomieszczenie === 'salon' && k[3].rodzaj === 'inne' && k[4].rodzaj === 'inne', k);
T('klasyfikacja: okładka tylko dla zdjęć z zewnątrz (księga i wnętrze = 0)', k[0].okladka === 9 && k[1].okladka === 0 && k[2].okladka === 0);
T('okładka: najlepsza elewacja', V.okladka([{ rodzaj: 'wnetrze', okladka: 10 }, { rodzaj: 'otoczenie', okladka: 9 }, { rodzaj: 'elewacja', okladka: 6 }, { rodzaj: 'elewacja', okladka: 8 }]) === 3);
T('okładka: bez elewacji — otoczenie; same wnętrza — brak', V.okladka([{ rodzaj: 'otoczenie', okladka: 4 }]) === 0 && V.okladka([{ rodzaj: 'wnetrze', okladka: 9 }]) === -1);
T('kategorie: elewacja → Budynek, wnętrze → Lokal (w domu: Wnętrze), mapa → Załącznik', V.kategoria('elewacja') === 'Budynek' && V.kategoria('wnetrze', false) === 'Lokal' && V.kategoria('wnetrze', true) === 'Wnętrze' && V.kategoria('mapa') === 'Załącznik');
// Księga
const kwOdp = JSON.stringify({ tekst: 'TREŚĆ KSIĘGI WIECZYSTEJ NR GD1G/00012345/6\nDZIAŁ I-O - OZNACZENIE NIERUCHOMOŚCI\nPowierzchnia użytkowa: 113,73 M2', pola: { numerKsiegi: 'gd1g/00012345/6', sad: 'Sąd Rejonowy Gdańsk-Północ', miejscowosc: 'Gdańsk', ulica: 'ul. Ikara', numerBudynku: '97', numerLokalu: '2', powierzchniaUzytkowa: '113,73 m2', udzial: '11373/22745', wlasciciele: ['Anna Nowak'], dzialIII: 'brak wpisów', dzialIV: 'brak wpisów' } });
const ks = V.ksiega(kwOdp);
T('księga: tekst działów i pola, numer znormalizowany', ks.ok && /DZIAŁ I-O/.test(ks.tekst) && ks.pola.numerKsiegi === 'GD1G/00012345/6' && ks.pola.powierzchniaUzytkowa === 113.73, ks.pola);
T('księga: zły numer odrzucony', V.ksiega(JSON.stringify({ pola: { numerKsiegi: 'GD1G/123/6' } })).pola.numerKsiegi === '');
const proj = { legal: { kwLocal: '' }, property: { city: 'Sopot', usableArea: 0 } };
const wp = V.ksiegaDoProjektu(proj, ks.pola);
T('księga → operat: tylko puste pola (miasto wpisane ręcznie zostaje)', proj.property.city === 'Sopot' && proj.legal.kwLocal === 'GD1G/00012345/6' && proj.property.usableArea === 113.73 && proj.property.street === 'Ikara' && proj.legal.ownerNames === 'Anna Nowak' && wp.includes('numer księgi') && !wp.includes('miejscowość'), proj);
T('księga → operat: każde pole oznaczone „ze zrzutu księgi — porównaj”', /porównaj z księgą/.test(proj.autoWpisane['legal.kwLocal'].zrodlo));
T('dokument: polecenie z rodzajami (wypis, akt, operat)', /wypis_mpzp/.test(V.polecenieDokumentu('a.pdf')) && /operat/.test(V.polecenieDokumentu('a.pdf')));
T('JSON: tekst bez JSON → null', V.json('nie wiem') === null);
console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

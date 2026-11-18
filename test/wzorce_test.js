'use strict';
/**
 * OPERO — wzorce: własne układy dokumentu, szablony operatu, zmiana rodzaju.
 * Czysta logika (renderer/wzorce.js) + drugie źródło adresów (adres-osm.js).
 */
const path = require('path');
const R = path.join(__dirname, '..', 'build', 'app', 'renderer');
const W = require(path.join(R, 'wzorce.js'));
const O = require(path.join(R, 'adres-osm.js'));
const AJ = require(path.join(R, 'adres-jedno.js'));

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
const rzuca = (f) => { try { f(); return ''; } catch (e) { return String(e.message || e); } };

const operat = () => ({
  module: { code: 'local_kcm' }, meta: { id: 'OP-1', createdAt: '2026-01-02T00:00:00Z', status: 'Roboczy' },
  author: { name: 'Jan Kowalski', licenseNo: '1234' },
  client: { name: 'Anna Nowak', nip: '' }, formalBasis: 'Umowa nr 5',
  property: { city: 'Gdańsk', district: 'Osowa', street: 'Siedleckiego', buildingNo: '9', localNo: '4', usableArea: 68, rooms: 3, floor: '2', rightType: 'prawo odrębnej własności lokalu mieszkalnego' },
  valuation: { methodCode: 'kcm', purpose: 'Zabezpieczenie kredytu', approachDescription: 'Opis podejścia', reportDate: '2026-11-01', valuationDate: '2026-11-01', roundTo: 100 },
  methodicalBasis: 'Moja podstawa metodyczna', legalBases: ['Ustawa A', 'Rozporządzenie B'], sources: ['Źródło 1'], attachments: ['Zał. 1'], clauses: 'Klauzula bankowa',
  legal: { kwLocal: 'GD1G/00012345/6', ownerNames: 'Anna Nowak' }, egib: { plotNo: '12/3' }, planning: { description: '' },
  location: { description: 'Blisko lasu' }, building: { year: '2010' }, local: { description: '' },
  narratives: { legal: 'Stan prawny opisany', market: 'Rynek lokali w Osowie', result: 'Uzasadnienie' },
  market: { ratingMode: 'three', weightMethod: 'manual', weightJustification: 'Wagi z analizy', transactions: [{ id: 't1' }, { id: 't2' }],
    features: [{ id: 'a', name: 'Lokalizacja', scaleMode: 'three', weight: 0.4, rating: 'Dobra', ratingNote: 'uwaga o TEJ nieruchomości', scaleMin: 'gorsza', scaleAvg: 'typowa', scaleMax: 'lepsza', pairs: [{ a: 1 }] },
               { id: 'b', name: 'Standard', scaleMode: 'three', weight: 0.6, rating: 'Przeciętna', scaleMin: 'niski', scaleAvg: 'średni', scaleMax: 'wysoki', pairs: [] }] },
  photos: [{ id: 'p1' }], files: [], costing: { hourlyRate: 150, hours: 12, vatRate: 23 },
  appearance: { theme: 'navy', accent: '#225577', fontFamily: 'Calibri, Arial, sans-serif', headingStyle: 'band', coverStyle: 'photo', bodyFontSize: 11, lineHeight: 1.5, pageMarginMm: 22, tableDensity: 'compact', photoColumns: 3, showToc: true, showIndexes: false, showHeaderFooter: true, headerText: 'Operat — lokal', footerText: 'Biuro JK' },
});

console.log('OPERO — wzorce: układy, szablony, zmiana rodzaju, adres z OSM\n');

/* ============== 1. WŁASNE UKŁADY */
const u1 = W.ukladZProjektu(operat(), '  Bank   PKO ');
T('układ bierze nazwę bez zbędnych spacji', u1.nazwa === 'Bank PKO', u1.nazwa);
T('układ niesie komplet pól wyglądu', W.KLUCZE_UKLADU.every(k => u1.szata[k] !== undefined), u1.szata);
T('układ NIE niesie tekstu nagłówka ani stopki', !('headerText' in u1.szata) && !('footerText' in u1.szata));
T('układ bez nazwy jest odrzucony', /nazwę/.test(rzuca(() => W.ukladZProjektu(operat(), '   '))));
let d = W.ukladDodaj([], u1);
T('pierwszy układ trafia na listę', d.lista.length === 1 && !d.nadpisano);
const zmieniony = operat(); zmieniony.appearance.pageMarginMm = 25;
d = W.ukladDodaj(d.lista, W.ukladZProjektu(zmieniony, 'bank pko'));
T('ta sama nazwa nadpisuje, nie dubluje', d.lista.length === 1 && d.nadpisano && d.lista[0].szata.pageMarginMm === 25, d.lista);
T('nadpisany układ zachowuje identyfikator', d.lista[0].id === u1.id);
const pelna = Array.from({ length: W.MAKS_UKLADOW }, (_, i) => W.ukladZProjektu(operat(), `Układ ${i}`));
T('lista układów ma limit', /najwyżej/.test(rzuca(() => W.ukladDodaj(pelna, W.ukladZProjektu(operat(), 'Jeszcze jeden')))));

const cel = { appearance: { headerText: 'Mój nagłówek', footerText: 'Moja stopka', theme: 'gold' } };
W.ukladZastosuj(cel, u1);
T('zastosowanie układu ustawia wygląd', cel.appearance.accent === '#225577' && cel.appearance.pageMarginMm === 22 && cel.appearance.coverStyle === 'photo', cel.appearance);
T('zastosowanie NIE rusza nagłówka i stopki operatu', cel.appearance.headerText === 'Mój nagłówek' && cel.appearance.footerText === 'Moja stopka');
T('operat pamięta, z którego układu korzysta', cel.appearance.stylPdf === u1.id);
T('rozpoznaje ustawiony układ własny', W.ukladRozpoznaj(cel, [u1]) === u1.id);
cel.appearance.lineHeight = 1.7;
T('dostrojony układ nie jest już rozpoznawany jako zapisany', W.ukladRozpoznaj(cel, [u1]) === null);
T('zmiana nazwy na zajętą jest odrzucona', /Masz już/.test(rzuca(() => W.ukladZmienNazwe([u1, { ...u1, id: 'uklad-x', nazwa: 'Sąd' }], 'uklad-x', 'BANK PKO'))));
T('usunięcie zdejmuje układ z listy', W.ukladUsun([u1], u1.id).length === 0);

/* -- filtr wartości: plik stanu mógł zostać zmieniony ręcznie */
const zly = W.szata({ accent: 'red; background:url(x)', fontFamily: 'Arial</style><script>', bodyFontSize: 99, lineHeight: 'abc', pageMarginMm: -4, theme: 'hacker', photoColumns: 2.6, showToc: 'true', coverStyle: null });
T('kolor spoza wzoru #rrggbb wraca do domyślnego', zly.accent === '#c99a2e', zly.accent);
T('krój pisma nie przepuszcza znaków kodu', !/[<>{};]/.test(zly.fontFamily), zly.fontFamily);
T('wielkość tekstu jest przycinana do zakresu', zly.bodyFontSize === 13, zly.bodyFontSize);
T('nieliczbowa interlinia wraca do domyślnej', zly.lineHeight === 1.38, zly.lineHeight);
T('ujemny margines jest podnoszony do minimum', zly.pageMarginMm === 10, zly.pageMarginMm);
T('nieznany motyw wraca do domyślnego', zly.theme === 'gold', zly.theme);
T('liczba zdjęć w wierszu jest całkowita', zly.photoColumns === 3, zly.photoColumns);
T('polska liczba z przecinkiem jest czytana', W.wartosc('bodyFontSize', '10,5') === 10.5);

/* ============== 2. SZABLONY OPERATU */
const sz = W.szablonZProjektu(operat(), 'Lokal dla banku');
const tekstSz = JSON.stringify(sz);
T('szablon pamięta rodzaj operatu', sz.modul === 'local_kcm');
T('szablon niesie cel, podstawy, źródła, klauzule', sz.dane.valuation.purpose === 'Zabezpieczenie kredytu' && sz.dane.legalBases.length === 2 && sz.dane.sources.length === 1 && sz.dane.clauses === 'Klauzula bankowa');
T('szablon niesie cechy z wagami i skalami', sz.dane.market.features.length === 2 && sz.dane.market.features[0].weight === 0.4 && sz.dane.market.features[0].scaleMax === 'lepsza');
T('szablon NIE niesie adresu', !/Siedleckiego|Osowa|Gdańsk/.test(tekstSz));
T('szablon NIE niesie klienta ani właściciela', !/Anna Nowak/.test(tekstSz));
T('szablon NIE niesie numeru księgi', !/GD1G/.test(tekstSz));
T('szablon NIE niesie transakcji ani zdjęć', !/"t1"|"p1"/.test(tekstSz) && !('transactions' in sz.dane.market));
T('szablon NIE niesie dat operatu', !/2026-11-01/.test(tekstSz));
T('cecha w szablonie nie ma oceny ani uwagi o konkretnej nieruchomości', !/uwaga o TEJ/.test(tekstSz) && !('rating' in sz.dane.market.features[0]) && !('pairs' in sz.dane.market.features[0]));
T('szablon bez nazwy jest odrzucony', /nazwę/.test(rzuca(() => W.szablonZProjektu(operat(), ''))));

const swiezy = { module: { code: 'local_kcm' }, valuation: { purpose: 'domyślny cel', reportDate: '2026-12-24' }, property: { city: '' }, client: { name: '' },
  market: { transactions: [], features: [{ id: 'x', name: 'domyślna' }] }, appearance: { headerText: 'Domyślny nagłówek', theme: 'gold' }, costing: { hours: 0 }, legalBases: ['domyślna'], sources: [], attachments: [], clauses: '' };
let licznik = 0;
W.szablonZastosuj(swiezy, sz, { noweId: () => `nowe${++licznik}` });
T('szablon ustawia cel i podstawy w nowym operacie', swiezy.valuation.purpose === 'Zabezpieczenie kredytu' && swiezy.legalBases[0] === 'Ustawa A' && swiezy.methodicalBasis === 'Moja podstawa metodyczna');
T('szablon nie zmienia dat nowego operatu', swiezy.valuation.reportDate === '2026-12-24');
T('cechy z szablonu dostają nowe identyfikatory i ocenę wyjściową', swiezy.market.features.length === 2 && swiezy.market.features[0].id === 'nowe1' && swiezy.market.features[0].rating === 'Przeciętna' && Array.isArray(swiezy.market.features[0].pairs));
T('szablon ustawia układ dokumentu', swiezy.appearance.accent === '#225577' && swiezy.appearance.headerText === 'Operat — lokal');
T('szablon ustawia stawki, nie godziny', swiezy.costing.hourlyRate === 150 && swiezy.costing.hours === 0);
T('operat pamięta, z jakiego szablonu powstał', swiezy.szablon && swiezy.szablon.nazwa === 'Lokal dla banku');
T('szablon innego rodzaju nie wejdzie do operatu', /innego rodzaju/.test(rzuca(() => W.szablonZastosuj({ module: { code: 'income' } }, sz))));
let ds = W.szablonDodaj([], sz);
ds = W.szablonDodaj(ds.lista, W.szablonZProjektu(operat(), 'lokal DLA banku'));
T('szablon o tej samej nazwie i rodzaju nadpisuje', ds.lista.length === 1 && ds.nadpisano);
const inny = operat(); inny.module.code = 'developed_pairs';
ds = W.szablonDodaj(ds.lista, W.szablonZProjektu(inny, 'Lokal dla banku'));
T('ta sama nazwa przy innym rodzaju to osobny szablon', ds.lista.length === 2);
T('usunięcie szablonu', W.szablonUsun(ds.lista, ds.lista[0].id).length === 1);

/* ============== 3. ZMIANA RODZAJU OPERATU */
const plan = W.zmianaPlan(operat());
T('plan wymienia, co zostaje', plan.zostaje.includes('zleceniodawca') && plan.zostaje.includes('zdjęcia') && plan.zostaje.some(x => /adres/.test(x)), plan.zostaje);
T('plan liczy transakcje, które nie przejdą', plan.przepada.some(x => /^2 transakcje/.test(x)), plan.przepada);
T('plan mówi o cechach i metodzie', plan.przepada.some(x => /cechy/.test(x)) && plan.przepada.some(x => /metoda/.test(x)));
const pusty = W.zmianaPlan({ property: {}, market: { transactions: [] } });
T('pusty operat nie udaje, że coś przenosi', !pusty.zostaje.includes('zleceniodawca') && !pusty.przepada.some(x => /transakcj/.test(x)), pusty);

const nowyRodzaj = { module: { code: 'developed_pairs' }, meta: { id: 'OP-NOWY', createdAt: '2026-11-12T00:00:00Z', status: 'Roboczy' },
  property: { city: '', street: '', rightType: 'prawo własności nieruchomości gruntowej zabudowanej', landArea: 0 },
  valuation: { methodCode: 'pairs', purpose: 'cel dla domu', reportDate: '2026-11-12' }, methodicalBasis: 'metoda par', client: { name: '', kind: 'osoba' }, author: { name: '' },
  legal: { kwLocal: '', court: '' }, egib: {}, planning: {}, location: {}, building: { type: 'budynek jednorodzinny' }, local: {},
  narratives: { legal: '', market: '', result: '' }, market: { transactions: [], features: [{ id: 'd1', name: 'Działka' }] }, photos: [], files: [], costing: {}, clauses: '',
  appearance: { headerText: 'Operat szacunkowy nieruchomości zabudowanej', theme: 'gold' }, legalBases: ['dla domu'] };
const po = W.zmienRodzaj(operat(), nowyRodzaj);
T('po zmianie rodzaj jest nowy', po.module.code === 'developed_pairs');
T('adres i powierzchnia zostają', po.property.city === 'Gdańsk' && po.property.street === 'Siedleckiego' && po.property.usableArea === 68);
T('rodzaj prawa jest z nowego rodzaju, nie ze starego', /gruntowej zabudowanej/.test(po.property.rightType), po.property.rightType);
T('klient, księga i zdjęcia zostają', po.client.name === 'Anna Nowak' && po.legal.kwLocal === 'GD1G/00012345/6' && po.photos.length === 1);
T('pola nowego rodzaju nie giną przy scalaniu', po.legal.court === '' && po.client.kind === 'osoba' && po.building.type === 'budynek jednorodzinny' && po.building.year === '2010');
T('daty operatu zostają', po.valuation.reportDate === '2026-11-01' && po.valuation.roundTo === 100);
T('metoda i cel są z nowego rodzaju', po.valuation.methodCode === 'pairs' && po.valuation.purpose === 'cel dla domu' && po.methodicalBasis === 'metoda par');
T('transakcje i cechy starego rynku NIE przechodzą', po.market.transactions.length === 0 && po.market.features[0].name === 'Działka');
T('opis stanu prawnego zostaje, opis rynku nie', po.narratives.legal === 'Stan prawny opisany' && po.narratives.market === '' && po.narratives.result === '');
T('wygląd zostaje, a nagłówek nazywa nowy rodzaj', po.appearance.accent === '#225577' && po.appearance.headerText === 'Operat szacunkowy nieruchomości zabudowanej');
T('to wciąż ten sam operat (identyfikator i data założenia)', po.meta.id === 'OP-1' && po.meta.createdAt === '2026-01-02T00:00:00Z');
T('zmiana nie psuje starego operatu', (() => { const s = operat(); W.zmienRodzaj(s, JSON.parse(JSON.stringify(nowyRodzaj))); return s.market.transactions.length === 2 && s.module.code === 'local_kcm'; })());

/* ============== 4. STAN NA DYSKU */
const stan = W.stanCzysty({ uklady: [u1, { id: 'zly', nazwa: 'x' }, null, 'tekst'], szablony: [sz, { id: 'szablon-1', nazwa: 'bez danych' }], domyslnyUklad: u1.id, obce: 'pole' });
T('stan odrzuca wpisy, które nie są układami', stan.uklady.length === 1);
T('stan odrzuca wpisy, które nie są szablonami', stan.szablony.length === 1);
T('stan nie przepuszcza obcych pól', !('obce' in stan));
T('pusty albo zepsuty stan daje puste listy', (() => { const s = W.stanCzysty('śmieci'); return s.uklady.length === 0 && s.szablony.length === 0 && s.domyslnyUklad === ''; })());

/* ============== 5. ADRES Z DRUGIEGO ŹRÓDŁA (OpenStreetMap) */
const url = O.zapytanie({ ulica: 'Siedleckiego', numer: '9', miasto: 'Gdańsk' });
T('zapytanie idzie do Nominatim po https', url.startsWith('https://nominatim.openstreetmap.org/search?'));
T('zapytanie jest ograniczone do Polski', /countrycodes=pl/.test(url));
T('z miejscowością pyta polami ulica + miasto', /street=9\+Siedleckiego/.test(url) && /city=Gda%C5%84sk/.test(url), url);
T('bez miejscowości pyta jedną frazą', /[?&]q=Siedleckiego\+9/.test(O.zapytanie({ ulica: 'Siedleckiego', numer: '9' })));
T('za krótka fraza nie daje zapytania', O.zapytanie({ ulica: 'Si' }) === '' && O.zapytanie({}) === '');
const odp = JSON.stringify([
  { address: { road: 'Adolfa Siedleckiego', house_number: '9', suburb: 'Osowa', city: 'Gdańsk', state: 'województwo pomorskie', postcode: '80-299', country_code: 'pl' } },
  { address: { road: 'Adolfa Siedleckiego', house_number: '9', suburb: 'Osowa', city: 'Gdańsk', state: 'województwo pomorskie', postcode: '80-299', country_code: 'pl' } },
  { address: { road: 'ulica Siedleckiego', village: 'Mała Wieś', county: 'powiat płocki', municipality: 'gmina Mała Wieś', country_code: 'pl', postcode: 'brak' } },
  { address: { road: 'Siedleckiego', city: 'Wilno', country_code: 'lt' } },
  { name: 'bez adresu' },
]);
const k = O.zOdpowiedzi(odp);
T('czyta ulicę, numer, miasto, dzielnicę, kod', k[0].ulica === 'Adolfa Siedleckiego' && k[0].numer === '9' && k[0].miasto === 'Gdańsk' && k[0].dzielnica === 'Osowa' && k[0].kod === '80-299', k[0]);
T('województwo, powiat i gmina bez przedrostków', k[0].wojewodztwo === 'pomorskie' && k[1].powiat === 'płocki' && k[1].gmina === 'Mała Wieś', k[1]);
T('powtórzona pozycja wchodzi raz', k.filter(x => x.miasto === 'Gdańsk').length === 1);
T('pozycja spoza Polski jest odrzucana', !k.some(x => x.miasto === 'Wilno'));
T('przedrostek „ulica" znika z nazwy', k[1].ulica === 'Siedleckiego', k[1].ulica);
T('kod pocztowy spoza wzoru jest pomijany', k[1].kod === '');
T('każda pozycja jest oznaczona źródłem', k.every(x => x.zrodlo === 'osm'));
T('współrzędnych w stopniach nie podaje jako metrów', k.every(x => Number.isNaN(x.x) && Number.isNaN(x.y)));
T('zepsuta odpowiedź daje pustą listę', O.zOdpowiedzi('<html>') .length === 0 && O.zOdpowiedzi('{"error":1}').length === 0);
const rozstrz = AJ.rozstrzygnij(AJ.odsiejDoFrazy(k, 'siedleckiego').filter(x => x.ulica), { ulica: 'siedleckiego', numer: '9' });
T('numer z OSM rozstrzyga miejscowość tą samą drogą co rejestr', rozstrz.stan === 'jedno' && rozstrz.wybrane && rozstrz.wybrane.miasto === 'Gdańsk' && !rozstrz.numerNieZnaleziony, rozstrz);
T('odstęp między zapytaniami to ponad sekunda', O.ODSTEP_MS >= 1000);
T('zaraz po zapytaniu każe czekać', O.ileCzekac(1000, 1300) === O.ODSTEP_MS - 300);
T('po sekundzie nie każe czekać', O.ileCzekac(1000, 1000 + O.ODSTEP_MS + 5) === 0 && O.ileCzekac(0) === 0);
T('podpis źródła jest gotowy do pokazania', /OpenStreetMap/.test(O.PODPIS));

/* -- program główny: drugie źródło tylko na żądanie */
const fs = require('fs');
const main = fs.readFileSync(path.join(R, '..', 'main.js'), 'utf8');
T('program główny pyta OSM tylko, gdy zapytanie tego żąda', /if \(q\.zapas === 'osm'\) return adresZOsm\(q\)/.test(main));
T('program przedstawia się usłudze z nazwy', /'user-agent': `OPERO\//.test(main));
T('program główny czyści wzorce przed zapisem', /writeAppState\(\{ wzorce: czysty \}\)/.test(main) && /wzorceLogika\.stanCzysty\(stan\)/.test(main));

console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

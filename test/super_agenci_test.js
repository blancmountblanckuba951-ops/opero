'use strict';
/** OPERO 3.5 — super-agenci (Prawny, Planistyczny, Zapytaj zespół), czytnik formatów, Mózg z PDF i wyszukiwarką. */
const K = n => require('/root/work/build/app/' + n);
const S = K('renderer/super-agenci.js'), C = K('renderer/model-chmura.js'), F = K('czytnik-formatow.js'), V = K('renderer/wizja.js');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 400) : '')); } };
console.log('OPERO 3.5 — super-agenci i czytnik formatów\n');
const projekt = () => ({ property: { street: 'Ikara', buildingNo: '97', localNo: '2', city: 'Gdańsk', usableArea: 113.73 }, egib: { plotId: '226101_1.0003.743' }, legal: { kwLocal: 'GD1G/00012345/6', ownerNames: 'Anna Nowak' }, valuation: { purpose: 'zabezpieczenie kredytu' }, planning: {} });
// Kontekst i prywatność
const k = S.kontekst(projekt());
T('kontekst: adres, działka, KW, cel — bez nazwisk właścicieli', /Ikara 97\/2/.test(k) && /226101_1\.0003\.743/.test(k) && /GD1G/.test(k) && !/Nowak/.test(k), k);
const kw = 'DZIAŁ II\nImię pierwsze: Anna\nNazwisko: Nowak\nPESEL 80010112345\nDZIAŁ III\nSłużebność przesyłu na rzecz Energa';
const bez = S.bezOsob(kw);
T('treść księgi do Claude bez imion, nazwisk i PESEL', !/Anna|Nowak|80010112345/.test(bez) && /Służebność przesyłu/.test(bez), bez);
const pol = S.polecenieprawnik(projekt(), kw);
T('polecenie prawnika: działy III/IV, aktualne teksty jednolite, JSON, bez nazwisk', /III i IV/.test(pol) && /AKTUALNYCH/.test(pol) && /WYŁĄCZNIE JSON/.test(pol) && !/Nowak/.test(pol));
// Prawnik
const odpP = '```json\n{"stanPrawny":"Nieruchomość stanowi odrębną własność lokalu. W dziale III wpisano służebność przesyłu.","rodzajPrawa":"odrębna własność lokalu","ryzyka":[{"opis":"Służebność przesyłu","waga":"srednia","wplywNaWartosc":"ograniczenie korzystania"},{"opis":"x","waga":"zla"}],"podstawy":[{"akt":"Ustawa o gospodarce nieruchomościami","publikator":"Dz.U. 2026 poz. 399","przepis":"art. 151"}],"doWyjasnienia":["zakres służebności"]}\n```';
const wp = S.prawnik(odpP);
T('prawnik: odczyt JSON z bloku kodu, nieznana waga → średnia', wp.ok && wp.ryzyka.length === 2 && wp.ryzyka[1].waga === 'srednia' && wp.podstawy[0].publikator === 'Dz.U. 2026 poz. 399', wp);
const pp = projekt(); pp.legal.ownershipType = 'spółdzielcze';
const wpis = S.prawnikDoProjektu(pp, wp, [{ url: 'https://isap.sejm.gov.pl/x' }], '2026-11-19');
T('prawnik do projektu: notatka do pustej rubryki, ręcznie wpisane prawo zostaje, analiza ze źródłami', pp.legal.kwNotes.startsWith('Nieruchomość') && pp.legal.ownershipType === 'spółdzielcze' && pp.legal.analizaPrawna.zrodla.length === 1 && wpis.length === 1, pp.legal);
T('prawnik: śmieci → brak wyniku', !S.prawnik('nie wiem').ok);
// Planista
const odpL = '{"jestPlan":true,"planName":"MPZP Brzeźno rejon ul. Ikara","resolution":"Uchwała nr XL/123/21","publikator":"Dz. Urz. Woj. Pom. 2021 poz. 100","zoneSymbol":"012-MN1","designation":"zabudowa mieszkaniowa jednorodzinna","sourceUrl":"https://www.gdansk.pl/plan","pewnosc":"srednia","doSprawdzenia":"symbol terenu"}';
const wl = S.planista(odpL);
const pl = projekt(); const wl2 = S.planistaDoProjektu(pl, wl, [], 'x');
T('planista średnia pewność: plan i przeznaczenie wpisane, symbol terenu NIE', pl.planning.planName && pl.planning.designation && !pl.planning.zoneSymbol && /Dz\. Urz/.test(pl.planning.resolution) && wl2.length >= 3, pl.planning);
const pn = projekt(); S.planistaDoProjektu(pn, { ...wl, pewnosc: 'niska' }, [], 'x');
T('planista niska pewność: nic nie wpisuje, analiza zostaje', !pn.planning.planName && pn.planning.analizaInternet?.pewnosc === 'niska');
const pw = projekt(); pw.planning.designation = 'ręcznie'; S.planistaDoProjektu(pw, { ...wl, pewnosc: 'wysoka' }, [], 'x');
T('planista wysoka pewność: symbol wpisany, ręczne przeznaczenie nietknięte', pw.planning.zoneSymbol === '012-MN1' && pw.planning.designation === 'ręcznie');
T('planista: tylko adresy http(s) jako źródło', S.planista('{"planName":"x","sourceUrl":"javascript:alert(1)"}').sourceUrl === '');
// Zapytaj zespół + markdown
const pz = S.polecenieZespol('Czy służebność obniża wartość?', projekt());
T('zespół: pytanie z kontekstem operatu', /służebność/.test(pz) && /Ikara/.test(pz));
const html = S.markdown('**Prawnik:** odpowiedź\n- punkt <script>\n## Źródła');
T('markdown: pogrubienie, lista, nagłówek, bez wstrzyknięcia HTML', /<b>Prawnik:<\/b>/.test(html) && /<li>punkt &lt;script&gt;<\/li>/.test(html) && /<h4>Źródła<\/h4>/.test(html) && !/<script>/.test(html), html);
// Mózg OPERO: PDF, wyszukiwarka, tryb
const z = C.zadanie({ zgoda: true }, null, [{ role: 'system', content: 'S' }, { role: 'user', content: [{ type: 'document', dataUrl: 'data:application/pdf;base64,JVBERi0x', nazwa: 'kw.pdf' }, { type: 'text', text: 'czytaj' }] }], { internet: true, wyszukiwan: 4, tryb: 'szybki', maks: 12000 });
T('Mózg: PDF w całości, wyszukiwarka, tryb szybki, limit 12000', z.body.dokumenty?.[0]?.nazwa === 'kw.pdf' && z.body.internet === true && z.body.wyszukiwan === 4 && z.body.tryb === 'szybki' && z.body.maks === 12000, z.body);
const z2 = C.zadanie({ zgoda: true }, null, [{ role: 'user', content: 'x' }], { tryb: 'zly' });
T('Mózg: nieznany tryb nie idzie na serwer, bez internetu domyślnie', !('tryb' in z2.body) && !z2.body.internet);
const odp = C.zOdpowiedzi('opero', 200, JSON.stringify({ ok: true, text: 'Art. 151', zrodla: [{ url: 'https://isap.sejm.gov.pl/a', tytul: 'ISAP' }, { url: 'javascript:x' }], wyszukiwan: 2 }));
T('Mózg: źródła tylko http(s) i liczba wyszukiwań', odp.ok && odp.zrodla.length === 1 && odp.wyszukiwan === 2);
const za = C.zadanie({ dostawca: 'anthropic', zgoda: true, model: 'claude-opus-5-5' }, 'sk-ant-test-0000000000', [{ role: 'user', content: [{ type: 'document', dataUrl: 'data:application/pdf;base64,JVBE', nazwa: 'a.pdf' }, { type: 'text', text: 'x' }] }], { internet: true });
T('własny klucz Anthropic: PDF jako dokument i wyszukiwarka', za.body.messages[0].content[0].type === 'document' && za.body.tools?.[0]?.name === 'web_search', za.body);
// Wizja: fakty z dokumentu
const pf = { property: {} };
const wf = V.faktyDoProjektu(pf, { dzialka: '743', powierzchniaDzialki: '412,5 m²', symbolMpzp: 'MN1', numerKw: 'gd1g/00012345/6' }, 'wypis.pdf');
T('fakty z wypisu: działka, powierzchnia z przecinkiem, symbol, KW', pf.egib.plotNo === '743' && pf.property.landArea === 412.5 && pf.planning.zoneSymbol === 'MN1' && pf.legal.kwLocal === 'GD1G/00012345/6' && wf.length === 4, pf);
// Czytnik formatów
T('RTF: polskie znaki (cp1250 i \\u), akapity', F.zRtf("{\\rtf1\\ansi Ksi\\'eaga \\par Dzia\\'b3 \\u379?yrard\\'f3w}") === 'Księga\nDział Żyrardów');
T('ODT/HTML: akapity, tabulatory, encje', F.zXml('<text:p>A&amp;B</text:p><text:p>x<text:tab/>y</text:p><script>z</script>') === 'A&B\nx\ty');
T('EML: nagłówki i treść', /Temat: Zlecenie wyceny/.test(F.zEml('From: a@b.pl\nSubject: Zlecenie wyceny\n\nTreść')) && /Treść/.test(F.zEml('From: a\n\nTreść')));
T('obrazy: rozpoznaje HEIC/TIFF/WEBP/AVIF i daje czytelny powód dla HEIC', F.OBRAZY.test('a.HEIC') && F.OBRAZY.test('b.tif') && F.OBRAZY_CHROMIUM.test('c.webp') && F.OBRAZY_BEZ_DEKODERA.test('d.heic') && /iPhone/.test(F.powodBezDekodera('d.heic')) && /TIFF/.test(F.powodBezDekodera('x.tiff')));
console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

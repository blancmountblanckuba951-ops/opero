'use strict';
/** OPERO 3.1 — Agent Geoportalu (czysta logika), rundy Agenta Rynku, zlecenie i autor z Ustawień, stronicowanie RCN. */
const K = n => require('/root/work/build/app/renderer/' + n);
const G = K('geoportal-agent.js'), A = K('agenci.js'), R = K('rcn-geoportal.js');
const fs = require('fs');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
console.log('OPERO 3.1 — geoportal, rynek, zlecenie\n');

// ---- ULDK
const u = G.uldkUrl('226101_1.0003.1172');
T('ULDK: adres z identyfikatorem, zasięgiem i obrysem w EPSG:2180', u.startsWith('https://uldk.gugik.gov.pl/?request=GetParcelById&id=226101_1.0003.1172') && /result=geom_extent,geom_wkt/.test(u) && /srid=2180/.test(u), u);
let blad = ''; try { G.uldkUrl('Ikara 97'); } catch (e) { blad = e.message; }
T('ULDK: odrzuca coś, co nie jest identyfikatorem', /identyfikator/.test(blad));
const odp = '0\n470100.1 726000.2 470160.3 726050.4|SRID=2180;POLYGON((470100.1 726000.2,470160.3 726000.2,470160.3 726050.4,470100.1 726050.4,470100.1 726000.2))|226101_1.0003.1172|1172|Matarnia|Gdańsk|Gdańsk|pomorskie\n';
const dz = G.zUldk(odp);
T('ULDK: rekord rozłożony na pola', dz.ok && dz.numer === '1172' && dz.obreb === 'Matarnia' && dz.gmina === 'Gdańsk' && dz.wojewodztwo === 'pomorskie', dz);
T('ULDK: zasięg czterema liczbami, WKT bez SRID', dz.zasieg.length === 4 && dz.wkt.startsWith('POLYGON'));
T('ULDK: -1 to brak działki z powodem', G.zUldk('-1 brak wyników\n').ok === false && /nie zna/.test(G.zUldk('-1 brak wyników\n').powod));
const kadr = G.kadr(dz.zasieg);
T('kadr: kwadrat z marginesem, nie mniejszy niż 140 m', Math.abs((kadr[2] - kadr[0]) - (kadr[3] - kadr[1])) < 0.01 && kadr[2] - kadr[0] >= 140 && kadr[0] < 470100 && kadr[3] > 726050, kadr);
const px = G.naPiksele('POLYGON((470100.1 726000.2,470160.3 726000.2,470160.3 726050.4,470100.1 726050.4,470100.1 726000.2))', kadr, 1200, 1200);
T('obrys: piksele w obrazie, góra mapy = północ', px.length === 1 && px[0].every(([x, y]) => x > 0 && x < 1200 && y > 0 && y < 1200) && px[0][2][1] < px[0][0][1], px[0]);
const odwr = G.naPiksele('POLYGON((726000.2 470100.1,726000.2 470160.3,726050.4 470160.3,726000.2 470100.1))', kadr, 1200, 1200);
T('obrys: odwrócona kolejność osi wykryta i poprawiona', odwr[0].every(([x, y]) => x > 0 && x < 1200 && y > 0 && y < 1200), odwr[0]);

// ---- WMS
const cap = `<?xml version="1.0"?><WMT_MS_Capabilities><Capability><Layer><Title>KIEG</Title>
<Layer queryable="1"><Name>dzialki</Name><Title>Działki</Title><Style><LegendURL><OnlineResource xlink:type="simple" xlink:href="https://integracja.gugik.gov.pl/leg?l=dzialki&amp;f=png"/></LegendURL></Style></Layer>
<Layer queryable="1"><Name>numery_dzialek</Name><Title>Numery działek</Title></Layer>
<Layer queryable="0"><Name>budynki</Name><Title>Budynki</Title></Layer>
<Layer queryable="0"><Name>inne</Name><Title>Coś innego</Title></Layer>
</Layer></Capability></WMT_MS_Capabilities>`;
const ws = G.warstwyZCap(cap);
T('Capabilities: warstwy z nazwą, tytułem i zapytywalnością', ws.length === 4 && ws[0].nazwa === 'dzialki' && ws[0].zapytywalna && !ws[2].zapytywalna, ws);
T('Capabilities: adres legendy odkodowany (&amp;)', ws[0].legenda === 'https://integracja.gugik.gov.pl/leg?l=dzialki&f=png');
const egib = G.usluga('egib');
const wyb = G.wybierzWarstwy(egib, ws);
T('warstwy: wybór preferowanych (działki, numery, budynki)', wyb.map(w => w.nazwa).join(',') === 'dzialki,numery_dzialek,budynki', wyb);
const mapa = G.mapaUrl({ usluga: egib, warstwy: wyb, kadr });
T('GetMap: WMS 1.1.1, EPSG:2180, przezroczysty PNG, kadr', /REQUEST=GetMap/.test(mapa) && /SRS=EPSG%3A2180/.test(mapa) && /TRANSPARENT=TRUE/.test(mapa) && /LAYERS=dzialki%2Cnumery_dzialek%2Cbudynki/.test(mapa), mapa);
const orto = G.mapaUrl({ usluga: G.usluga('orto'), warstwy: [{ nazwa: 'Raster' }], kadr });
T('GetMap: ortofotomapa jako JPEG bez przezroczystości', /FORMAT=image%2Fjpeg/.test(orto) && /TRANSPARENT=FALSE/.test(orto));
T('legenda: z Capabilities, a bez niej GetLegendGraphic', G.legendaUrl(egib, ws[0]) === ws[0].legenda && /REQUEST=GetLegendGraphic&LAYER=budynki/.test(G.legendaUrl(egib, ws[2])));
const info = G.infoUrl({ usluga: egib, warstwy: wyb.filter(w => w.zapytywalna), kadr });
T('GetFeatureInfo: środek kadru, tylko warstwy zapytywalne', /REQUEST=GetFeatureInfo/.test(info) && /X=600&Y=600/.test(info) && /QUERY_LAYERS=dzialki%2Cnumery_dzialek&/.test(info), info);
T('usługi: ortofotomapa, ewidencja, plan, uzbrojenie', ['orto', 'egib', 'mpzp', 'uzbrojenie'].every(id => G.usluga(id) && /^https:\/\//.test(G.usluga(id).url)));

// ---- opis szczegółowy
const html = '<html><body><table><tr><th>Identyfikator działki</th><td>226101_1.0003.1172</td></tr><tr><td>Numer działki</td><td>1172</td></tr><tr><td>Nazwa obrębu</td><td>Matarnia</td></tr><tr><td>Pole pow. w ewidencji [ha]</td><td>0,2275</td></tr><tr><td>Klasoużytki</td><td>B 0,2275</td></tr><tr><td>Numer KW</td><td>GD1G/00374430/8</td></tr></table><script>x()</script></body></html>';
const tx = G.infoTekst(html);
T('opis: HTML na wiersze „klucz: wartość", bez skryptów', /Numer działki: 1172/.test(tx) && !/x\(\)/.test(tx), tx);
const pe = G.polaZInfo(tx, 'egib');
T('opis: pola ewidencji (powierzchnia w ha, użytki, KW z ewidencji)', pe['egib.plotArea'] === '0,2275 ha' && /B 0,2275/.test(pe['egib.notes']) && pe['legal.kwCommon'] === 'GD1G/00374430/8' && pe['egib.district'] === 'Matarnia', pe);
const pm = G.polaZInfo(G.infoTekst('<table><tr><td>Symbol przeznaczenia</td><td>MN1</td></tr><tr><td>Przeznaczenie terenu</td><td>zabudowa mieszkaniowa jednorodzinna</td></tr><tr><td>Tytuł planu</td><td>Matarnia – rejon ul. Ikara</td></tr><tr><td>Uchwała</td><td>Uchwała nr XL/123/2019 Rady Miasta Gdańska</td></tr></table>'), 'mpzp');
T('opis: plan miejscowy — symbol, przeznaczenie, tytuł, uchwała', pm['planning.zoneSymbol'] === 'MN1' && /jednorodzinna/.test(pm['planning.designation']) && /Ikara/.test(pm['planning.planName']) && /XL\/123\/2019/.test(pm['planning.resolution']), pm);
T('opis: nic nie zgaduje z pustej odpowiedzi', Object.keys(G.polaZInfo('', 'egib')).length === 0 && Object.keys(G.polaZInfo('brak danych', 'mpzp')).length === 0);
T('podpis załącznika: działka, obręb, źródło i data', /działka nr 1172, obręb Matarnia/.test(G.podpis(egib, dz, '2026-11-17T10:00:00Z')) && /integracja\.gugik\.gov\.pl, pobrano 17\.11\.2026/.test(G.podpis(egib, dz, '2026-11-17T10:00:00Z')));

// ---- Agent Rynku: rundy
T('rynek: KCM potrzebuje ok. 12 transakcji, pary mniej', A.celTransakcji('local_kcm') === 12 && A.celTransakcji('developed_pairs') < 12);
const r0 = A.rundyRynku({});
T('rundy: cztery, coraz szersze (promień, okres, metraż)', r0.length === 4 && r0.every((r, i) => !i || (r.promien > r0[i - 1].promien && r.okres > r0[i - 1].okres && r.odchylka > r0[i - 1].odchylka)), r0);
T('rundy: ostatnia to 8 km i 10 lat', r0[3].promien === 8000 && r0[3].okres === 120);
const r1 = A.rundyRynku({ promien: 3000, okres: 48, odchylka: 25 });
T('rundy: nigdy węższe niż kryteria rzeczoznawcy', r1.every(r => r.promien >= 3000 && r.okres >= 48 && r.odchylka >= 25), r1);
const r2 = A.rundyRynku({ promien: 9000, okres: 200, odchylka: 60 });
T('rundy: identyczne rundy zlane w jedną', r2.length === 1, r2);
const opis = A.opisRynku(r0[1], 14, 'Gdańsk');
T('definicja rynku z faktycznego zakresu (2 km, 36 mies., 3 lata, ±30%)', /2000 m/.test(opis) && /36 miesięcy/.test(opis) && /3 lata/.test(opis) && /30%/.test(opis) && /14 transakcji/.test(opis), opis);

// ---- Zlecenie i autor
const p = { valuation: {}, client: {} };
const z = A.zlecenieDoProjektu(p, { kto: '  Bank Przykładowy S.A. ', nr: 'ZL/12/2026', data: '2026-11-10', cel: 'zabezpieczenie wierzytelności kredytowej' });
T('zlecenie: klient, numer, data, cel', p.client.name === 'Bank Przykładowy S.A.' && p.client.contractNo === 'ZL/12/2026' && p.client.contractDate === '2026-11-10' && p.valuation.purpose === 'zabezpieczenie wierzytelności kredytowej', p);
T('zlecenie: podstawa formalna bez pustych miejsc', p.formalBasis === 'Operat szacunkowy sporządzono na zlecenie: Bank Przykładowy S.A. (zlecenie / umowa nr ZL/12/2026 z dnia 10.11.2026). Cel wyceny: zabezpieczenie wierzytelności kredytowej.', p.formalBasis);
const p2 = { formalBasis: 'Postanowienie Sądu Rejonowego z dnia …', valuation: {} };
A.zlecenieDoProjektu(p2, { kto: 'Sąd Rejonowy' });
T('zlecenie: nie nadpisuje podstawy napisanej ręcznie', p2.formalBasis.startsWith('Postanowienie'));
T('zlecenie: zła data pominięta', A.zlecenieCzyste({ kto: 'X', data: '10.11.2026' }).data === '');
T('zlecenie: puste nic nie zmienia', A.zlecenieDoProjektu({}, {}).wpisane.length === 0);
const p3 = { author: { name: 'Ręcznie Wpisany' } };
const au = A.autorZProfilu(p3, { name: 'Jan Rzeczoznawca', licenseNo: '1234', company: 'Biuro', email: 'biuro@example.pl' });
T('autor z Ustawień: uzupełnia tylko puste pola', p3.author.name === 'Ręcznie Wpisany' && p3.author.licenseNo === '1234' && p3.author.company === 'Biuro' && au.wpisane.length === 3 && !au.brak, p3);
T('autor z Ustawień: pusty profil = brak', A.autorZProfilu({}, {}).brak === true);

// ---- Stronicowanie RCN
const url2 = R.urlTransakcji({ typ: 'lokale', bbox: [1, 2, 3, 4], odKtorego: 2000 });
T('RCN: kolejna strona wyników (STARTINDEX)', /STARTINDEX=2000/.test(url2) && /COUNT=1000/.test(url2));
const main = fs.readFileSync('/root/work/build/app/main.js', 'utf8');
T('RCN: główny proces pobiera kolejne strony aż do limitu i usuwa powtórzenia', /odKtorego: od/.test(main) && /RCN_LIMIT_STRON = 6/.test(main) && /rcnBezPowtorzen\(wszystkie\)/.test(main));
T('Geoportal: okno bez dostępu do programu (sandbox, bez preload, tylko geoportal.gov.pl)', /partition: 'persist:opero-geoportal', sandbox: true, contextIsolation: true, nodeIntegration: false/.test(main) && /geoportal\\\.gov\\\.pl/.test(main) && !/geoportal:okno[\s\S]{0,900}preload:/.test(main));
const pre = fs.readFileSync('/root/work/build/app/preload.js', 'utf8');
T('preload: geoportalDzialka i geoportalOkno', /geoportalDzialka/.test(pre) && /geoportalOkno/.test(pre));

console.log(`\n${ok} OK, ${zle} BŁĘDÓW`);
process.exit(zle ? 1 : 0);

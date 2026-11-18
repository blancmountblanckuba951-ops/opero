'use strict';
/** OPERO — okno portalu (czytanie ofert ze strony) i PER szukający w internecie. Czysta logika. */
const path = require('path'); const fs = require('fs');
const R = path.join(__dirname, '..', 'build', 'app', 'renderer');
const P = require(path.join(R, 'portal-czytaj.js')), S = require(path.join(R, 'siec-szukaj.js'));
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
console.log('OPERO — okno portalu i szukanie w internecie\n');

/* ============== 1. OFERTY Z TEKSTU STRONY */
const ZA = 'Mieszkanie 3-pokojowe z balkonem, Osowa\n890 000 zł\nul. Siedleckiego, Osowa, Gdańsk\n3 pokoje\n68 m²\n13 088 zł/m²\n2 piętro\nMieszkanie na sprzedaż Gdańsk Osowa\n1 250 000 zł\nGdańsk, Osowa, Ikara\n113,73 m² · 4 pokoje · parter\nRata od 4 500 zł\nKawalerka do wynajęcia\n2 500 zł\n30 m²';
const a = P.ofertyZTekstu(ZA, { miasto: 'Gdańsk', zrodlo: 'otodom.pl', dzien: '2026-11-13' });
T('dwie oferty sprzedaży z listy', a.ok && a.oferty.length === 2, a.oferty.length);
T('cena, powierzchnia i cena za m²', a.oferty[0].cena === 890000 && a.oferty[0].powierzchnia === 68 && a.oferty[0].jednostkowa === 13088, a.oferty[0]);
T('pokoje i piętro', a.oferty[0].pokoje === 3 && a.oferty[0].pietro === 2 && a.oferty[1].pokoje === 4 && a.oferty[1].pietro === 0);
T('metraż poprzedniej oferty nie przechodzi na następną', a.oferty[1].powierzchnia === 113.73, a.oferty[1].powierzchnia);
T('adres z wiersza z ulicą albo miejscowością', a.oferty[0].adres === 'ul. Siedleckiego, Osowa, Gdańsk' && /Ikara/.test(a.oferty[1].adres), [a.oferty[0].adres, a.oferty[1].adres]);
T('cena za m² nie jest brana za cenę mieszkania', !a.oferty.some(o => o.cena === 13088));
T('rata i czynsz najmu nie są ofertami sprzedaży', !a.oferty.some(o => o.cena === 4500 || o.cena === 2500));
T('każda oferta jest oznaczona jako cena OFERTOWA ze źródłem i datą', a.oferty.every(o => o.rodzajZrodla === 'oferty' && /OFERTOWA/.test(o.uwagi[0]) && /otodom\.pl/.test(o.uwagiZrodla) && o.data === '2026-11-13' && /nie jest cena transakcyjna/.test(o.uwagiZrodla)));
const PRZED = 'ul. Kartuska, Siedlce, Gdańsk\n55 m² · 2 pokoje · 3 piętro\n600 000 zł\nul. Długa, Śródmieście, Gdańsk\n42,5 m² · 2 pokoje\n720 000 zł';
const b = P.ofertyZTekstu(PRZED, { miasto: 'Gdańsk' });
T('układ „dane przed ceną" też jest czytany', b.oferty.length === 2 && b.oferty[0].powierzchnia === 55 && b.oferty[1].powierzchnia === 42.5 && b.oferty[0].pietro === 3, b.oferty.map(o => [o.cena, o.powierzchnia]));
T('ta sama oferta powtórzona na stronie wchodzi raz', P.ofertyZTekstu(ZA + '\n' + ZA, { miasto: 'Gdańsk' }).oferty.length === 2);
const bezPow = P.ofertyZTekstu('Dom na sprzedaż\n990 000 zł\nGdańsk', { miasto: 'Gdańsk' });
T('cena bez powierzchni nie tworzy oferty i jest to powiedziane', !bezPow.ok && /nie znalazłem powierzchni/.test(bezPow.komunikat) && bezPow.pominiete.length === 1, bezPow.komunikat);
T('strona bez cen: jasny komunikat', /nie widzę ofert/.test(P.ofertyZTekstu('Regulamin serwisu. Polityka prywatności.').komunikat));
T('absurdalna cena za m² jest odrzucana', P.ofertyZTekstu('Garaż\n45 000 zł\n500 m²').oferty.length === 0);
T('liczby z kropką jako separatorem tysięcy', P.liczba('1.250.000') === 1250000 && P.liczba('113,73') === 113.73);

/* -- adresy okna */
T('okno otwiera tylko https', P.adresDozwolony('https://www.otodom.pl/') && !P.adresDozwolony('http://otodom.pl/') && !P.adresDozwolony('file:///C:/x') && !P.adresDozwolony('javascript:alert(1)'));
T('okno nie otwiera adresów lokalnych', !P.adresDozwolony('https://localhost/x') && !P.adresDozwolony('https://192.168.1.1/'));
const uo = P.adresPortalu('olx', { miasto: 'Gdańsk', dzielnica: 'Osowa', pokoje: 3 });
T('adres OLX niesie kryteria z operatu', uo.startsWith('https://www.olx.pl/nieruchomosci/mieszkania/sprzedaz/q-') && /Gda%C5%84sk/.test(uo) && /Osowa/.test(uo), uo);
T('adres Otodom niesie miasto i zakres powierzchni', /otodom\.pl/.test(P.adresPortalu('otodom', { miasto: 'Gdańsk', powOd: 55, powDo: 80 })) && /55-80/.test(decodeURIComponent(P.adresPortalu('otodom', { miasto: 'Gdańsk', powOd: 55, powDo: 80 }))));
T('nieznany portal nie daje adresu', P.adresPortalu('cokolwiek', {}) === '');

/* ============== 2. SZUKANIE W INTERNECIE */
T('zapytanie o budynek: adres w cudzysłowie + temat', S.zapytanie('building.description', { ulica: 'Ikara', numer: '97', miasto: 'Gdańsk' }) === '"Ikara 97" Gdańsk budynek inwestycja rok budowy');
T('zapytanie o lokalizację bez dzielnicy nie ma dziur', S.zapytanie('location.description', { miasto: 'Gdańsk', dzielnica: '', ulica: 'Ikara' }) === 'Gdańsk Ikara okolica komunikacja infrastruktura');
T('zapytanie o plan miejscowy', /^miejscowy plan zagospodarowania przestrzennego Gdańsk Osowa/.test(S.zapytanie('planning.description', { miasto: 'Gdańsk', dzielnica: 'Osowa', ulica: 'Ikara' })));
T('zapytanie o rynek niesie bieżący rok', new RegExp(String(new Date().getFullYear())).test(S.zapytanie('market.marketDescription', { miasto: 'Gdańsk' })));
T('pole bez własnego tematu dostaje zapytanie z adresu', S.zapytanie('formalBasis', { ulica: 'Ikara', numer: '97', miasto: 'Gdańsk' }) === 'Ikara 97 Gdańsk');
const u = S.url('"Ikara 97" Gdańsk budynek');
T('adres zapytania: Brave Search, Polska, język polski', u.startsWith('https://api.search.brave.com/res/v1/web/search?') && /country=pl/.test(u) && /search_lang=pl/.test(u));
T('za krótkie zapytanie nie idzie do wyszukiwarki', S.url('a') === '' && S.url('') === '');
const odp = { web: { results: [
  { title: 'Osiedle <strong>Ikara</strong> — forum', url: 'https://forum.example.pl/ikara', description: 'Budynek oddany w <strong>2024</strong> r. &quot;podobno&quot;' },
  { title: 'Uchwała w sprawie MPZP Osowa', url: 'https://bip.gdansk.pl/uchwaly/1', description: 'Plan miejscowy rejonu ulicy Ikara.' },
  { title: 'powtórka', url: 'https://bip.gdansk.pl/uchwaly/1', description: 'x' },
  { title: 'zły adres', url: 'javascript:alert(1)', description: 'x' },
  { title: '', url: 'https://pusto.example.pl/', description: '' },
] } };
const w = S.zOdpowiedzi(JSON.stringify(odp));
T('wyniki są czytane, powtórki i złe adresy odpadają', w.ok && w.wyniki.length === 2, w.wyniki.length);
T('strona urzędowa idzie na górę i jest oznaczona', w.wyniki[0].domena === 'bip.gdansk.pl' && w.wyniki[0].urzedowe === true && w.wyniki[1].urzedowe === false);
T('znaczniki i encje z opisu są czyszczone', w.wyniki[1].tytul === 'Osiedle Ikara — forum' && w.wyniki[1].opis === 'Budynek oddany w 2024 r. "podobno"', w.wyniki[1]);
T('zepsuta odpowiedź i odpowiedź z błędem nie wywracają programu', S.zOdpowiedzi('<html>').ok === false && S.zOdpowiedzi({ message: 'Unauthorized' }).powod === 'Unauthorized');
const f = S.fakty(w.wyniki);
T('każdy fakt z internetu niesie domenę źródła', f.length === 2 && f[0].nazwa === 'z internetu (bip.gdansk.pl)' && /Plan miejscowy/.test(f[0].wartosc));
T('źródła do operatu: domena, tytuł, adres i data dostępu', /^bip\.gdansk\.pl — Uchwała w sprawie MPZP Osowa \(https:\/\/bip\.gdansk\.pl\/uchwaly\/1\), dostęp 13\.11\.2026$/.test(S.zrodla(w.wyniki, '13.11.2026')[0]), S.zrodla(w.wyniki, '13.11.2026')[0]);
T('komunikaty błędów wyszukiwarki są po ludzku', /klucz/.test(S.komunikatBledu(401)) && /Limit/.test(S.komunikatBledu(429)) && /błędem 500/.test(S.komunikatBledu(500)));

/* ============== 3. PROGRAM GŁÓWNY */
const main = fs.readFileSync(path.join(R, '..', 'main.js'), 'utf8'), app = fs.readFileSync(path.join(R, 'app.js'), 'utf8');
T('okno portalu ma własną, odciętą sesję bez dostępu do programu', /partition: 'persist:opero-portal', nodeIntegration: false, contextIsolation: true, sandbox: true/.test(main));
T('program czyta wyłącznie tekst otwartej strony', /document\.body\.innerText/.test(main) && !/portalOkno\.webContents\.session\.cookies|\.loadURL\([^)]*strona=/.test(main));
T('klucz wyszukiwarki jest szyfrowany przez system, gdy to możliwe', /safeStorage\.encryptString\(k\)/.test(main));
T('klucz idzie tylko w nagłówku zapytania do wyszukiwarki', /'x-subscription-token': klucz/.test(main) && !/logToFile\([^)]*klucz\)/.test(main));
T('tekst z internetu zawsze idzie do podglądu', /Tekst z internetu ZAWSZE idzie do podgladu[\s\S]{0,80}perPolePodglad/.test(app));
T('oferty z okna portalu idą do decyzji jak wklejone', /szukPortaleWczytaj\(\{ wiersze: w\.oferty/.test(app));

console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

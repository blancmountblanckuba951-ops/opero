'use strict';
/** OPERO 3.0 — logika „jednego okna": zrzuty KW (przypadek Ikara), opis, cechy segmentu, podręcznik. */
const fs = require('fs'), path = require('path');
const K = n => require('/root/work/build/app/renderer/' + n);
const O = K('ocr-uklad.js'), E = K('ekw-tresc.js'), OP = K('opis-operatu.js'), C = K('cechy.js'), W = K('wiedza-podrecznik.js'), CH = K('model-chmura.js');
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };
console.log('OPERO 3.0 — jedno okno (logika)\n');

// ---- KW ze zrzutów ekranu (odczyt pisma zapisany z prawdziwych zrzutów Ikara 97/2)
const zrzuty = [1, 2, 3, 4, 5].map(i => JSON.parse(fs.readFileSync(path.join(__dirname, 'dane', 'ikara-kw', `kw${i}.json`), 'utf8')));
const tekst = O.zrzutyNaTekst(zrzuty);
const w = E.czytaj(tekst);
T('zrzuty: nagłówek z odczytu oryginału (biały tekst na szarym pasku)', w.naglowek.kw === 'GD1G/00380276/5' && w.naglowek.rodzaj === 'lokal' && /Gdańsk-Północ/.test(w.naglowek.sad), w.naglowek);
T('zrzuty: rozpoznane wszystkie pięć działów', w.rozpoznane.join() === 'I-O,I-Sp,II,III,IV', w.rozpoznane);
T('zrzuty: położenie bez śmieci z ramek', w.io.wojewodztwo === 'pomorskie' && w.io.miejscowosc === 'Gdańsk', w.io);
T('zrzuty: powierzchnia 113,73 m²', w.io.powierzchnia === 113.73);
T('zrzuty: opis izb złożony z dwóch wierszy – komplet ośmiu rodzajów', (w.io.listaIzb || []).length === 8 && w.io.pokoje === 4, w.io.izby);
T('zrzuty: identyfikator lokalu', /^226101_1\.0003\.1172_BUD\.2_ ?LOK$/.test(w.io.identyfikatorLokalu || ''), w.io.identyfikatorLokalu);
T('zrzuty: księga macierzysta (z działu I-Sp, gdy w I-O ukośnik przeczytano jako 7) i udział', Object.fromEntries(E.doOperatu(w).map(p => [p.sciezka, p.wartosc]))['legal.kwCommon'] === 'GD1G/00374430/8' && w.isp.udzial === '11373/22745', [w.isp]);
T('zrzuty: właściciel – imię i nazwisko bez imion rodziców i bez PESEL', JSON.stringify(w.ii.wlasciciele) === '["Anna Nowak"]' && !/80010112345/.test(JSON.stringify(E.doOperatu(w))), w.ii.wlasciciele);
T('zrzuty: działy III i IV „brak wpisów"', w.iii && w.iii.brakWpisow && w.iv && w.iv.brakWpisow);
T('zrzuty: śmieci z odczytu nie udają ulicy ani numeru', !w.io.ulica && !w.io.numerBudynku && !w.io.kondygnacja, [w.io.ulica, w.io.numerBudynku, w.io.kondygnacja]);
const pola = Object.fromEntries(E.doOperatu(w).map(p => [p.sciezka, p.wartosc]));
T('zrzuty: działka z identyfikatora lokalu (1172, obręb 0003)', pola['egib.plotNo'] === '1172' && pola['egib.district'] === '0003' && pola['egib.plotId'] === '226101_1.0003.1172', pola);
T('zrzuty: rok i numer aktu notarialnego czytane w całości', /677\/2025/.test(pola['legal.currentEntryBasis'] || ''), pola['legal.currentEntryBasis']);
T('ocr: ramki tabeli zdjęte ze słów', JSON.stringify(O.czyscSlowa([{ t: '|POMORSKIE,', x: 1, y: 1, w: 1, h: 1 }, { t: '||', x: 1, y: 1, w: 1, h: 1 }, { t: '[113,7300', x: 1, y: 1, w: 1, h: 1 }]).map(x => x.t)) === '["POMORSKIE,","113,7300"]');
T('ocr: pomyłki w etykietach („Nurner") naprawiane', /Numer lokalu/.test(O.naprawEkw('Nurner lokalu')));
T('osoba: stary układ (imię, drugie imię, nazwisko, …) nadal działa', E.czytaj('DZIAŁ II - WŁASNOŚĆ\nOsoba fizyczna (Imię pierwsze, imię drugie, nazwisko, imię ojca, imię matki, PESEL)\tJAN, ---, KOWALSKI, PIOTR, ANNA, 80010112345').ii.wlasciciele[0] === 'Jan Kowalski');

// ---- opis zlecenia (przypadek Ikara)
const opis = fs.readFileSync('/root/work/przyklad-ikara/opis.txt', 'utf8');
const wo = OP.czytaj(opis), f = k => (wo.fakty.find(x => x.klucz === k) || {}).wartosc;
T('opis: adres Ikara 97/2, Gdańsk, Matarnia', f('street') === 'Ikara' && f('buildingNo') === '97' && f('unitNo') === '2' && f('city') === 'Gdańsk' && f('district') === 'Matarnia');
T('opis: lokal dwupoziomowy – bez zgadywania piętra', /dwupoziomowy/.test(f('floor')), f('floor'));
T('opis: rok oddania do użytkowania i data oględzin', f('yearBuilt') === 2025 && f('inspectionDate') === '2026-11-01', [f('yearBuilt'), f('inspectionDate')]);
T('opis: zabudowa bliźniacza rozpoznana', f('segment') === true);
T('opis: lokal w bliźniaku to nadal lokal (metoda korygowania ceny średniej)', OP.modul(wo, opis).modul === 'local_kcm');
T('opis: data oględzin w różnych zapisach', OP.czytaj('oględziny: 01.11.2026').fakty.find(x => x.klucz === 'inspectionDate').wartosc === '2026-11-01' && OP.czytaj('oględziny 2026-11-02').fakty.find(x => x.klucz === 'inspectionDate').wartosc === '2026-11-02');
const pr = { property: {}, valuation: { inspectionDate: '2026-11-17' } };
OP.doProjektu(pr, wo, { dzis: '2026-11-17' });
T('opis → projekt: data oględzin zastępuje domyślną dzisiejszą, typ zabudowy zapisany', pr.valuation.inspectionDate === '2026-11-01' && pr.property.segmentType === 'zabudowa bliźniacza');

// ---- cechy dla segmentu
const seg = C.sugeruj(C.rodzaj('local_kcm', { segment: true }));
T('cechy: zestaw dla zabudowy bliźniaczej – garaż i ogródek, bez windy', seg.some(c => /Garaż/.test(c.nazwa)) && seg.some(c => /Ogródek/.test(c.nazwa)) && !seg.some(c => /wind/i.test(c.nazwa)), seg.map(c => c.nazwa));
T('cechy: wagi segmentu sumują się do 100', Math.round(seg.reduce((s, c) => s + c.waga, 0) * 10) === 1000);
T('cechy: dom zabudowany nadal dostaje zestaw „dom"', C.rodzaj('developed_pairs', { segment: true }) === 'dom');

// ---- podręcznik (wiedza)
const strony = [{ nr: 12, tekst: 'Procedura szacowania w metodzie korygowania ceny średniej obejmuje określenie rynku, aktualizację cen, ustalenie cech rynkowych i ich wag, obliczenie ceny średniej oraz współczynników korygujących.' }, { nr: 48, tekst: 'Klauzule i zastrzeżenia: operat sporządzono zgodnie z przepisami; wykorzystanie w innym celu wymaga zgody.' }, { nr: 3, tekst: 'Spis treści książki.' }];
let st = W.dodaj({}, { nazwa: 'Mój podręcznik', strony, zrodlo: 'ocr' });
T('wiedza: podsumowanie', W.podsumowanie(st).stron === 3 && W.podsumowanie(st).ile === 1);
const sz = W.szukaj(st, { pytanie: 'procedura metody korygowania ceny średniej wagi cech', ile: 2 });
T('wiedza: wyszukanie właściwej strony z odwołaniem', sz.wyniki[0].strona === 12 && /korygowania/.test(sz.wyniki[0].wycinek), sz.wyniki);
T('wiedza: klauzule znajdują stronę z klauzulami', W.szukaj(st, { pytanie: 'klauzule zastrzeżenia' }).wyniki[0].strona === 48);
T('wiedza: polecenie zakazuje przepisywania tekstu podręcznika', /NIE przepisuj/.test(W.doPolecenia(sz.wyniki)) && /Mój podręcznik, s\. 12/.test(W.doPolecenia(sz.wyniki)));
T('wiedza: ten sam plik wgrany drugi raz zastępuje poprzedni', W.podsumowanie(W.dodaj(st, { nazwa: 'Mój podręcznik', strony: strony.slice(0, 1) })).stron === 1);
T('wiedza: pusty magazyn i puste pytanie', W.szukaj({}, { pytanie: 'x' }).wyniki.length === 0 && W.szukaj(st, { pytanie: '' }).wyniki.length === 0);
const ocr = fs.existsSync('/root/work/podrecznik-praktyki/txt/1-012.txt');
if (ocr) {
  const dok = { nazwa: 'Podręcznik cz. 1', strony: fs.readdirSync('/root/work/podrecznik-praktyki/txt').filter(x => /^1-\d{3}\.txt$/.test(x)).sort().map(x => ({ nr: Number(x.slice(2, 5)), tekst: fs.readFileSync('/root/work/podrecznik-praktyki/txt/' + x, 'utf8') })) };
  T('wiedza: skan podręcznika rozpoznany jako podręcznik', W.czyPodrecznik(dok.strony));
  const r = W.szukaj(W.dodaj({}, dok), { pytanie: 'procedura szacowania korygowania ceny średniej współczynniki korygujące', ile: 3 });
  T('wiedza: na prawdziwym podręczniku procedura KCM jest wśród trzech pierwszych stron', r.wyniki.some(x => [12, 13, 36, 37].includes(x.strona)), r.wyniki.map(x => x.strona));
} else T('wiedza: (brak lokalnego OCR podręcznika – pominięto)', true);

// ---- model w chmurze: zdjęcia
const z = CH.zadanie({ wlaczony: true, zgoda: true, dostawca: 'anthropic', model: 'm' }, 'K', [{ role: 'user', content: [{ type: 'image', dataUrl: 'data:image/jpeg;base64,AAAA' }, { type: 'text', text: 'opisz' }] }]);
T('chmura: zdjęcie w formacie Anthropic', z.body.messages[0].content[0].type === 'image' && z.body.messages[0].content[0].source.media_type === 'image/jpeg');
const z2 = CH.zadanie({ wlaczony: true, zgoda: true, dostawca: 'zgodny', baza: 'https://x.pl', model: 'm' }, 'K', [{ role: 'user', content: [{ type: 'image', dataUrl: 'data:image/png;base64,BB' }, { type: 'text', text: 'opisz' }] }]);
T('chmura: zdjęcie w formacie zgodnym (image_url)', z2.body.messages[0].content[0].type === 'image_url');
T('chmura: obraz z innego schematu odrzucony', CH.zadanie({ wlaczony: true, zgoda: true, dostawca: 'anthropic', model: 'm' }, 'K', [{ role: 'user', content: [{ type: 'image', dataUrl: 'http://x/y.png' }, { type: 'text', text: 'a' }] }]).body.messages[0].content.length === 1);

console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

'use strict';
/**
 * OPERO — wymogi operatu: dokumenty, pytania, czerwone flagi.
 *
 * Reguła, której pilnuje cały ten test: program może stwierdzić, że czegoś
 * NIE MA — nie może stwierdzić, że coś jest w porządku. Odhaczenie pozycji
 * należy do rzeczoznawcy, bo to on podpisuje się pod operatem.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app'), path.join(__dirname, '..', 'app')].find(p => fs.existsSync(p));
const P = require(path.join(APP, 'renderer', 'podrecznik.js'));

console.log('OPERO — wymogi operatu\n');

/* --- 1. Dokumenty --- */
const lokal = P.dokumentyDla('local_kcm');
const dochod = P.dokumentyDla('income');
const koszt = P.dokumentyDla('cost');
T('każdy rodzaj operatu ma listę wymaganych dokumentów',
  lokal.length >= 5 && dochod.length >= 5 && koszt.length >= 5);
T('księga wieczysta, ewidencja i przeznaczenie są wymagane zawsze',
  ['kw', 'egib', 'mpzp'].every(id => lokal.some(d => d.id === id) && dochod.some(d => d.id === id) && koszt.some(d => d.id === id)));
T('fotografie z oględzin są wymagane zawsze',
  [lokal, dochod, koszt].every(l => l.some(d => d.id === 'zdjecia')));
T('przy lokalu program prosi o rzut', lokal.some(d => d.id === 'rzut'));
T('przy wycenie dochodowej prosi o umowy najmu', dochod.some(d => d.id === 'umowy'));
T('przy kosztowej nie prosi o umowy najmu', !koszt.some(d => d.id === 'umowy'));
T('każdy dokument ma wyjaśnienie, po co jest',
  lokal.every(d => String(d.opis).length > 40));
// Sedno: gdy rzeczoznawca nie ma dokumentu, ma miec chocby jego ZDJECIE.
T('przy księdze wieczystej program dopuszcza zdjęcie lub skan',
  /zdjęcie|skan/i.test(P.DOKUMENTY.find(d => d.id === 'kw').zastepuje || ''));
T('fotografii z oględzin musi być więcej niż jedna',
  P.DOKUMENTY.find(d => d.id === 'zdjecia').minimum >= 3);

/* --- 2. Pytania --- */
function projekt(nad = {}) {
  return {
    property: { city: 'Gdańsk', usableArea: 54 }, valuation: {}, legal: {}, client: {},
    narratives: {}, market: { transactions: [], features: [] }, income: {}, modul: {},
    photos: [], files: [], clauses: [], ...nad,
  };
}

const pytaniaLokal = P.pytaniaBezOdpowiedzi(projekt(), 'local_kcm');
T('program ma konkretne pytania, a nie komunikat „uzupełnij dane"',
  pytaniaLokal.length >= 6 && pytaniaLokal.every(q => q.pytanie.includes('?')));
T('każde pytanie mówi, dlaczego jest zadawane',
  pytaniaLokal.every(q => String(q.dlaczego).length > 40));
T('każde pytanie wie, gdzie w operacie ląduje odpowiedź',
  pytaniaLokal.every(q => q.sciezka && q.sciezka.includes('.')));
T('program pyta o cel wyceny', pytaniaLokal.some(q => q.id === 'cel'));
T('program pyta o prawo do nieruchomości', pytaniaLokal.some(q => q.id === 'prawo'));
T('program pyta o obciążenia z działu III i IV', pytaniaLokal.some(q => /dziale III/.test(q.pytanie)));
T('przy wycenie dochodowej pyta zarządcę o czynsze i koszty', (() => {
  const q = P.pytaniaBezOdpowiedzi(projekt(), 'income').map(x => x.id);
  return q.includes('czynsze') && q.includes('koszty');
})());
T('przy kosztowej pyta o bazę cenową i podstawę zużycia', (() => {
  const q = P.pytaniaBezOdpowiedzi(projekt(), 'cost').map(x => x.id);
  return q.includes('bazaCen') && q.includes('zuzycie');
})());
T('pytań dochodowych nie zadaje przy lokalu',
  !pytaniaLokal.some(q => q.id === 'czynsze'));

// Pytanie znika, gdy odpowiedz juz jest w operacie - inaczej program pyta
// o to, co sam ma przed soba, i rzeczoznawca przestaje go sluchac.
const zWypelnionym = projekt({ valuation: { purpose: 'sprzedaż' }, property: { city: 'Gdańsk', rightType: 'własność' } });
T('pytanie o cel znika, gdy cel jest w operacie',
  !P.pytaniaBezOdpowiedzi(zWypelnionym, 'local_kcm').some(q => q.id === 'cel'));
T('pytanie o prawo znika, gdy prawo jest ustalone',
  !P.pytaniaBezOdpowiedzi(zWypelnionym, 'local_kcm').some(q => q.id === 'prawo'));
T('odpowiedź zapisana wprost też zamyka pytanie',
  !P.pytaniaBezOdpowiedzi(projekt({ odpowiedzi: { cel: 'kredyt hipoteczny' } }), 'local_kcm').some(q => q.id === 'cel'));
T('„[DO UZUPEŁNIENIA]" nie jest traktowane jak odpowiedź',
  P.pytaniaBezOdpowiedzi(projekt({ valuation: { purpose: '[DO UZUPEŁNIENIA]' } }), 'local_kcm').some(q => q.id === 'cel'));

/* --- 3. Czerwone flagi --- */
const flagi = (p, c, t) => P.czerwoneFlagi(p, c, t).map(f => f.id);

T('jedna transakcja decydująca o wyniku jest sygnalizowana',
  flagi(projekt({ market: { transactions: [
    { priceUnit: 100000 }, { priceUnit: 9000 }, { priceUnit: 9500 }], features: [] } }),
    { valueRounded: 1 }, 'local_kcm').includes('jedna-dominuje'));
T('trzykrotny rozrzut cen jest sygnalizowany',
  flagi(projekt({ market: { transactions: [
    { priceUnit: 3000 }, { priceUnit: 9000 }, { priceUnit: 10000 }, { priceUnit: 9500 }], features: [] } }),
    { valueRounded: 1 }, 'local_kcm').includes('rozrzut'));
T('trend wpisany ręcznie bez uzasadnienia jest sygnalizowany',
  flagi(projekt({ market: { transactions: [], features: [], trendSourceMode: 'manual', manualTrendRate: 0.5 } }),
    { valueRounded: 1 }, 'local_kcm').includes('trend-bez-analizy'));
T('wagi, które nie sumują się do 100%, są sygnalizowane',
  flagi(projekt({ market: { transactions: [], features: [{ weight: 0.3 }, { weight: 0.3 }] } }),
    { valueRounded: 1 }, 'local_kcm').includes('wagi'));
T('poprawne wagi nie są sygnalizowane',
  !flagi(projekt({ market: { transactions: [], weightJustification: 'bo tak', features: [{ weight: 0.5 }, { weight: 0.5 }] } }),
    { valueRounded: 1 }, 'local_kcm').includes('wagi'));
T('brak uzasadnienia wag jest sygnalizowany',
  flagi(projekt({ market: { transactions: [], features: [{ weight: 0.5 }, { weight: 0.5 }] } }),
    { valueRounded: 1 }, 'local_kcm').includes('wagi-bez-uzasadnienia'));
T('stopa kapitalizacji bez dowodu z rynku jest sygnalizowana',
  flagi(projekt({ income: { capRate: 7, rateEvidence: [], opex: [{}], vacancyPct: 5 } }),
    { valueRounded: 1 }, 'income').includes('stopa-bez-rynku'));
T('zerowe koszty operacyjne są sygnalizowane',
  flagi(projekt({ income: { capRate: 7, rateEvidence: [{ adopted: true }], opex: [], vacancyPct: 5 } }),
    { valueRounded: 1 }, 'income').includes('brak-opex'));
T('koszt jednostkowy bez bazy cenowej jest sygnalizowany',
  flagi(projekt({ modul: { zrodloCeny: '', uzasadnienieZuzycia: 'x' } }), { valueRounded: 1 }, 'cost').includes('koszt-bez-bazy'));
T('oględziny po dacie wyceny są sygnalizowane',
  flagi(projekt({ valuation: { valuationDate: '2026-09-01', inspectionDate: '2026-09-20' } }),
    { valueRounded: 1 }, 'local_kcm').includes('ogledziny-po-wycenie'));
T('data wyceny z przyszłości jest sygnalizowana',
  flagi(projekt({ valuation: { valuationDate: '2030-01-01' } }), { valueRounded: 1 }, 'local_kcm').includes('data-z-przyszlosci'));
T('brak klauzul jest sygnalizowany',
  flagi(projekt(), { valueRounded: 1 }, 'local_kcm').includes('brak-klauzul'));
T('operat bez wyniku jest sygnalizowany',
  flagi(projekt(), { valueRounded: 0 }, 'local_kcm').includes('brak-wyniku'));
T('każda flaga tłumaczy, czym grozi',
  P.czerwoneFlagi(projekt(), { valueRounded: 0 }, 'local_kcm').every(f => String(f.dlaczego).length > 40));

/* --- 4. Stan całości --- */
const pusty = P.stan(projekt(), { valueRounded: 0 }, 'local_kcm', {});
T('pusty operat nie jest gotowy do podpisu', pusty.gotowy === false);
T('program liczy braki po imieniu', /brakując/.test(pusty.podsumowanie) && /pytań|pytanie/.test(pusty.podsumowanie));
T('wszystkie wymagane dokumenty są oznaczone jako brakujące',
  pusty.brakDokumentow.length === P.dokumentyDla('local_kcm').length);

const zZalacznikami = P.stan(projekt(), { valueRounded: 1 }, 'local_kcm', { kw: 1, egib: 1, mpzp: 1, rzut: 1, zdjecia: 5, podstawa: 1 });
T('wgrane załączniki zdejmują braki dokumentów', zZalacznikami.brakDokumentow.length === 0);
T('ale dwa zdjęcia to za mało na dokumentację fotograficzną',
  P.stan(projekt(), { valueRounded: 1 }, 'local_kcm', { kw: 1, egib: 1, mpzp: 1, rzut: 1, zdjecia: 2, podstawa: 1 })
    .brakDokumentow.some(d => d.id === 'zdjecia'));
T('komplet dokumentów to jeszcze nie gotowy operat — zostają pytania',
  zZalacznikami.gotowy === false && zZalacznikami.pytania.length > 0);

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

'use strict';
/**
 * OPERO — Operat Express.
 *
 * Express ma dowieźć policzony operat z czterech danych i wyciągu RCiWN. Dwie
 * rzeczy są tu ważniejsze od samego wyniku i to one są sprawdzane najmocniej:
 *   1. program niczego nie zmyśla — brak danych kończy się odmową, nie liczbą,
 *   2. każde przyjęcie jest wypisane, a PDF zablokowany do czasu przejrzenia.
 */
const fs = require('node:fs');
const path = require('node:path');

let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d ? ' — ' + d : '')); } };

const APP = [path.join(__dirname, '..', 'build', 'app', 'renderer'),
             path.join(__dirname, '..', 'app', 'renderer')].find(p => fs.existsSync(p));
const Express = require(path.join(APP, 'express.js'));
const RCN = require(path.join(APP, 'rcn.js'));

// Silnik obliczeń to plik pisany pod przeglądarkę — wczytujemy go tak, jak
// robi to strona, zamiast go przepisywać na potrzeby testu.
const Calc = (() => {
  const kod = fs.readFileSync(path.join(APP, 'calc.bundle.js'), 'utf8');
  const okno = {};
  new Function('window', `${kod}\n;return window.OperatCalc;`)(okno);
  return okno.OperatCalc || new Function('window', `${kod}\n;return window.OperatCalc;`)({});
})();

console.log('OPERO — Operat Express\n');
T('silnik obliczeń i moduły wczytane', !!Calc?.calculate && !!Express?.przygotuj && !!RCN?.ocen);

/* --- minimalny projekt bazowy, taki jak z freshProject() --- */
function bazowy() {
  const mk = (name) => ({ id: name, name, scaleMode: 'three', weight: 0, rating: 'Przeciętna',
    scaleMin: 'słabo', scaleLow: '', scaleAvg: 'typowo', scaleHigh: '', scaleMax: 'bardzo dobrze', ratingNote: '', pairs: [] });
  return {
    schemaVersion: 11, module: { code: 'local_kcm' },
    author: { name: '', licenseNo: '', company: '' },
    property: { city: '', district: '', street: '', buildingNo: '', localNo: '', usableArea: 0 },
    valuation: { methodCode: 'kcm', approachCode: 'comparative', purpose: '', reportDate: '', valuationDate: '',
      priceLevelDate: '', inspectionDate: '', roundTo: 1000 },
    client: {}, legal: { kwLocal: '' },
    market: { trendSourceMode: 'pairs', manualTrendRate: 0, regressionBasis: 'mean', trendPrecisionMode: 'rounded',
      trendRoundDigits: 4, ratingMode: 'three', weightMethod: 'manual', weightJustification: '',
      transactions: [], trendPairs: [],
      features: ['Lokalizacja', 'Standard', 'Stan techniczny', 'Kondygnacja', 'Układ'].map(mk) },
    narratives: { subject: '', legal: '', market: '' },
  };
}

/* --- wyciąg RCiWN: 14 transakcji, w tym darowizna i duplikat --- */
function wyciag() {
  const t = [];
  const bazowaCena = 9000;
  for (let i = 0; i < 12; i++) {
    const mies = 23 - i;                       // od najstarszej do najnowszej
    const data = new Date(Date.UTC(2026, 8 - mies, 15)).toISOString().slice(0, 10);
    t.push({ zrodloWiersz: i + 1, adres: `ul. Testowa ${i + 1}, Gdańsk`, data,
      cena: Math.round((bazowaCena + i * 60) * 50), powierzchnia: 50, cenaJednostkowa: null,
      rodzaj: 'sprzedaż', prawo: 'własność', miejscowosc: 'Gdańsk', akt: `A ${i + 1}/2026`, uwagiZrodla: '' });
  }
  t.push({ zrodloWiersz: 13, adres: 'ul. Darowana 1, Gdańsk', data: '2026-05-01', cena: 1, powierzchnia: 50,
    rodzaj: 'darowizna', prawo: 'własność', miejscowosc: 'Gdańsk', akt: 'A 99/2026', uwagiZrodla: '' });
  t.push({ ...t[0], zrodloWiersz: 14 });       // duplikat tego samego aktu
  return t;
}

const przedmiot = { powierzchnia: 50, dataWyceny: '2026-09-15', miejscowosc: 'Gdańsk', prawo: 'własność', okresMiesiecy: 24 };
const ocena = RCN.ocen(wyciag(), przedmiot);
T('wyciąg odsiany: darowizna i duplikat odrzucone',
  ocena.przyjete.length === 12 && ocena.odrzucone.length === 2,
  `przyjęte ${ocena.przyjete.length}, odrzucone ${ocena.odrzucone.length}`);

const transakcje = RCN.doOperatu(ocena.przyjete);
const regresja = Calc.regressionTrend(transakcje);

/* ---------------------------------------------- 1. ODMOWA PRZY BRAKACH */
{
  const bezNiczego = Express.przygotuj({ bazowy: bazowy(), dane: {}, transakcje: [], regresja });
  T('bez danych Express odmawia, zamiast policzyć cokolwiek', bezNiczego.ok === false);
  T('odmowa mówi, czego brakuje', bezNiczego.braki.length >= 4, JSON.stringify(bezNiczego.braki));
  T('wśród braków jest powierzchnia i data wyceny',
    bezNiczego.braki.some(b => /powierzchnia/.test(b)) && bezNiczego.braki.some(b => /data wyceny/.test(b)));

  const bezTransakcji = Express.przygotuj({
    bazowy: bazowy(), transakcje: [], regresja,
    dane: { miasto: 'Gdańsk', powierzchnia: 50, dataWyceny: '2026-09-15', cel: 'sprzedaż' } });
  T('bez transakcji nie ma wyceny', bezTransakcji.ok === false
    && bezTransakcji.braki.some(b => /transakcje/.test(b)));
}

/* ---------------------------------------------- 2. PEŁNY PRZEBIEG */
const dane = { miasto: 'Gdańsk', ulica: 'Długa', numer: '12', lokal: '3', powierzchnia: 54.2,
  dataWyceny: '2026-09-15', cel: 'Określenie wartości rynkowej dla potrzeb sprzedaży', kw: 'GD1G/00012345/0' };
const profil = { name: 'Jan Kowalski', licenseNo: '1234', company: 'Biuro Wycen' };
const wynik = Express.przygotuj({ bazowy: bazowy(), dane, transakcje, regresja, profil });

T('Express składa projekt z kompletnego wsadu', wynik.ok === true, JSON.stringify(wynik.braki));
T('dane podane przez człowieka trafiają bez zmian',
  wynik.projekt.property.city === 'Gdańsk' && wynik.projekt.property.usableArea === 54.2
  && wynik.projekt.valuation.valuationDate === '2026-09-15');
T('numer KW i profil rzeczoznawcy są przeniesione',
  wynik.projekt.legal.kwLocal === 'GD1G/00012345/0' && wynik.projekt.author.licenseNo === '1234');
T('transakcje weszły do operatu', wynik.projekt.market.transactions.length === 12);

/* --- przyjęcia --- */
const pola = wynik.zalozenia.map(z => z.pole);
T('każde przyjęcie ma pole, wartość i powód',
  wynik.zalozenia.every(z => z.pole && z.wartosc && z.dlaczego && z.co));
T('trend jest opisany jako przyjęcie', pola.includes('market.trendSourceMode'));
T('wagi cech są opisane jako przyjęcie', pola.some(p => /weight/.test(p)));
T('oceny nieruchomości są opisane jako przyjęcie', pola.some(p => /rating/.test(p)));
T('data oględzin jest oznaczona do poprawienia',
  wynik.zalozenia.some(z => z.pole === 'valuation.inspectionDate' && z.waga === 'sprawdz'));

/* --- wartości neutralne --- */
const sumaWag = wynik.projekt.market.features.reduce((s, f) => s + Number(f.weight), 0);
T('wagi cech sumują się do jedności', Math.abs(sumaWag - 1) < 0.01, String(sumaWag));
T('wszystkie oceny są przeciętne — program nie ocenia tego, czego nie widział',
  wynik.projekt.market.features.every(f => f.rating === 'Przeciętna'));
T('Express nie pisze opisów za rzeczoznawcę',
  !wynik.projekt.narratives.market && !wynik.projekt.market.weightJustification);
T('mówi wprost, co zostało do napisania', wynik.doNapisania.length >= 3,
  JSON.stringify(wynik.doNapisania.map(x => x.co)));

/* --- i najważniejsze: to się liczy --- */
const obliczone = Calc.calculate(wynik.projekt);
T('silnik liczy wartość z projektu Express', Number(obliczone.valueRounded) > 0,
  String(obliczone.valueRounded));
T('wartość jest zaokrąglona do pełnego tysiąca', Number(obliczone.valueRounded) % 1000 === 0);
// Przy ocenach przecietnych suma Ui wypada w srodku zakresu, wiec wartosc to
// po prostu powierzchnia razy cena srednia skorygowana. Sprawdzamy to wprost,
// bo na tym opiera sie cale zapewnienie „wartosc neutralna, nic nie przechylamy".
T('przy ocenach przeciętnych wartość to powierzchnia razy cena średnia', (() => {
  const oczekiwana = wynik.projekt.property.usableArea * Number(obliczone.cavg) * Number(obliczone.sumUi);
  return oczekiwana > 0 && Math.abs(Number(obliczone.valueRaw) - oczekiwana) / oczekiwana < 0.001;
})(), `WN ${obliczone.valueRaw} przy Cśred ${obliczone.cavg} i ΣUi ${obliczone.sumUi}`);
T('suma Ui przy ocenach przeciętnych wypada w środku zakresu',
  Math.abs(Number(obliczone.sumUi) - 1) < 0.08, `ΣUi = ${obliczone.sumUi}`);

/* --- PDF zablokowany do czasu przejrzenia --- */
{
  const przed = Express.podsumowanie(wynik, false);
  T('PDF jest zablokowany, zanim rzeczoznawca przejrzy przyjęcia', przed.wolnoPdf === false);
  T('blokada mówi, co zrobić', /Przejrzyj/.test(przed.powodBlokady));
  T('podsumowanie liczy, ile rzeczy wymaga sprawdzenia', przed.doSprawdzenia >= 2, String(przed.doSprawdzenia));

  const poPotwierdzeniu = Express.podsumowanie({ ...wynik, doNapisania: [] }, true);
  T('po potwierdzeniu i napisaniu opisów PDF jest odblokowany', poPotwierdzeniu.wolnoPdf === true);
}

/* ---------------------------------------------- 3. TREND */
{
  const zal = [];
  Express.wybierzTrend({ valid: true, count: 12, r2: 0.81, monthlyRate: 0.42 }, zal);
  T('dobra regresja jest przyjmowana jako trend', zal[0].wartosc.includes('regresja'));
  const zal2 = [];
  const tryb = Express.wybierzTrend({ valid: true, count: 12, r2: 0.01, monthlyRate: 9 }, zal2);
  T('regresja, która nic nie tłumaczy, nie staje się trendem', tryb === 'none');
  T('i jest to powiedziane wprost', /R²/.test(zal2[0].dlaczego));
  const zal3 = [];
  T('za mało transakcji to też brak trendu',
    Express.wybierzTrend({ valid: false, count: 2 }, zal3) === 'none' && /Za mało/.test(zal3[0].dlaczego));
}

/* ======================================================================
   RODZAJE OPERATU — Express pyta tylko o to, czego dana metoda wymaga
   ====================================================================== */
{
  const T2 = T;
  T2('Express zna cztery rodzaje, które robi', Express.typyExpress().length === 4);
  T2('i nazywa te, których nie robi', Express.TYPY.filter(t => !t.express).length >= 4);
  T2('każdy nierobiony rodzaj ma POWÓD, a nie samo „nie”',
    Express.TYPY.filter(t => !t.express).every(t => String(t.powod || '').length > 40));
  T2('każdy robiony rodzaj mówi, jaką metodą liczy',
    Express.typyExpress().every(t => t.metoda && t.opis && t.ikona && t.droga));
  T2('każdy robiony rodzaj ma pola i wie, czy potrzebuje wyciągu',
    Express.typyExpress().every(t => (t.pola || []).length >= 5 && typeof t.wymagaRcn === 'boolean'));
  T2('każde pole ma klucz, nazwę i typ',
    Express.typyExpress().every(t => t.pola.every(f => f.klucz && f.nazwa &&
      ['tekst', 'liczba', 'data', 'wybor', 'adres'].includes(f.typ))));
  // Adres wpisuje sie w JEDNEJ rubryce: czlowiek podaje ulice, a miejscowosc
  // i dzielnice program znajduje w panstwowym rejestrze punktow adresowych.
  // Pola wypelniane przez program sa oznaczone, zeby czlowiek wiedzial, co
  // dopisal rejestr - pod operatem podpisuje sie on, nie rejestr.
  T2('adres ma jedno pole, nie szesc',
    Express.typyExpress().every(t => t.pola.filter(f => f.typ === 'adres').length === 1));
  T2('polem adresu jest ulica', Express.typyExpress().every(t => t.pola.find(f => f.typ === 'adres').klucz === 'ulica'));
  T2('miejscowosc i dzielnica sa oznaczone jako wypelniane z rejestru',
    Express.typyExpress().every(t => ['miasto', 'dzielnica'].every(k => t.pola.find(f => f.klucz === k)?.zRejestru === true)));
  // Numer NIE jest polem z rejestru: „Dluga 1" i „Dluga 12" to dwie rozne
  // nieruchomosci, dwie ksiegi wieczyste i dwoch wlascicieli.
  T2('numer budynku zostaje przy czlowieku',
    Express.typyExpress().every(t => t.pola.find(f => f.klucz === 'numer')?.zRejestru !== true));
  T2('pola wyboru mają opcje',
    Express.typyExpress().every(t => t.pola.filter(f => f.typ === 'wybor').every(f => (f.opcje || []).length >= 2)));

  // Sedno podzialu: dochodowy i kosztowy NIE pytaja o wyciag RCiWN, bo zadna
  // z tych metod go nie uzywa. Pytanie o niego kazaloby szukac danych na nic.
  T2('podejścia porównawcze potrzebują wyciągu RCiWN',
    Express.typ('local_kcm').wymagaRcn && Express.typ('developed_pairs').wymagaRcn);
  T2('dochodowe i kosztowe nie potrzebują wyciągu',
    !Express.typ('income').wymagaRcn && !Express.typ('cost').wymagaRcn);
  T2('dochodowy pyta o czynsz i stopę kapitalizacji',
    Express.typ('income').pola.some(f => f.klucz === 'czynszM2' && f.wymagane)
    && Express.typ('income').pola.some(f => f.klucz === 'stopaKap' && f.wymagane));
  T2('kosztowy pyta o koszt jednostkowy, jego źródło, wiek i trwałość',
    ['cenaJednostkowa', 'zrodloCeny', 'wiek', 'trwalosc'].every(k =>
      Express.typ('cost').pola.some(f => f.klucz === k && f.wymagane)));
  T2('lokal nie jest pytany o stopę kapitalizacji',
    !Express.typ('local_kcm').pola.some(f => f.klucz === 'stopaKap'));

  T2('brakujące pola są wypisane po nazwie', (() => {
    const b = Express.brakiPol('income', { ulica: 'Kartuska', miasto: 'Gdańsk', powierzchnia: 50, dataWyceny: '2026-01-01', cel: 'x' });
    return b.length === 2 && b.some(x => /czynsz/.test(x)) && b.some(x => /stopa/.test(x));
  })(), JSON.stringify(Express.brakiPol('income', { ulica: 'Kartuska', miasto: 'Gdańsk', powierzchnia: 50, dataWyceny: '2026-01-01', cel: 'x' })));
  T2('brak adresu jest wypisany tak samo jak każdy inny brak',
    Express.brakiPol('income', { miasto: 'Gdańsk' }).some(x => /adres/.test(x)));
  T2('rodzaj spoza Express jest odrzucany z powodem', (() => {
    const w = Express.przygotuj({ bazowy: bazowy(), typ: 'easement', dane: {} });
    return !w.ok && /Express nie robi/.test(w.braki[0]) && /pasa|zakres/i.test(w.braki[0]);
  })());
}

/* --- DOCHODOWY: kapitalizacja prosta liczy się i jest sprawdzalna --- */
{
  const baza = { ...bazowy(), module: { code: 'income' }, modul: {},
    income: { technique: 'cap', areaLettable: 0, leases: [], rentEvidence: [], rateEvidence: [],
      opex: [], dcf: [], otherIncome: 0, vacancyPct: 0, collectionPct: 0, capRate: 0,
      discountRate: 0, terminalRate: 0, techniqueJustification: '' } };
  const w = Express.przygotuj({ bazowy: baza, typ: 'income', dane: {
    ulica: 'Kartuska', miasto: 'Gdańsk', powierzchnia: 100, czynszM2: 60, stopaKap: 7, kosztyPct: 20, pustostan: 5,
    dataWyceny: '2026-09-01', cel: 'sprzedaż', zrodloStopy: '4 transakcje lokalami usługowymi' } });
  T('operat dochodowy daje się policzyć z Express', w.ok);
  T('projekt dostaje właściwy moduł', w.projekt.module.code === 'income');

  const Income = (() => {
    const kod = fs.readFileSync(path.join(APP, 'calc-income.js'), 'utf8');
    const okno = {};
    new Function('window', `${kod}\n;return window.OperoIncome;`)(okno);
    return okno.OperoIncome;
  })();
  const wy = Income.oblicz(w.projekt);
  // 100 m2 x 60 zl x 12 = 72 000 PGI; -5% = 68 400 EGI; -20% z PGI = 54 000 NOI;
  // 54 000 / 7% = 771 428,57 zl. Liczymy to tu z palca, zeby test wywalil sie,
  // gdy ktos zmieni sposob skladania pozycji, a nie dopiero u klienta.
  T('przychód potencjalny liczy się ze stawki za metr', wy.pgi.wartosc === 72000, String(wy.pgi.wartosc));
  T('pustostan pomniejsza przychód', wy.egi === 68400, String(wy.egi));
  T('koszty operacyjne pomniejszają dochód', wy.noi === 54000, String(wy.noi));
  T('wartość to dochód podzielony przez stopę', Math.abs(wy.marketValue - 771428.57) < 0.5, String(wy.marketValue));
  T('tabela najmu nie jest pusta przy niezerowym wyniku', (w.projekt.income.leases || []).length === 1);
  T('stawka stoi w polu, z którego czyta ją silnik', w.projekt.income.leases[0].effectiveRent === 60);
  T('podane źródło stopy wchodzi jako dowód przyjęty',
    w.projekt.income.rateEvidence.length === 1 && w.projekt.income.rateEvidence[0].adopted === true);

  const powody = w.zalozenia.map(z => `${z.co} ${z.dlaczego}`).join(' | ');
  T('program zapisuje, skąd wzięła się kwota przychodu', /PGI|przychód potencjalny/i.test(powody));
  T('i wypisuje technikę jako przyjętą', w.zalozenia.some(z => /kapitalizacja prosta/.test(z.wartosc)));
  T('uzasadnienie techniki zostaje do napisania',
    w.doNapisania.some(x => /techniki/i.test(x.co)));

  // Zero kosztow i zero pustostanu ZAWYZAJA wartosc - program musi to
  // powiedziec, a nie przemilczec.
  const bez = Express.przygotuj({ bazowy: baza, typ: 'income', dane: {
    ulica: 'Kartuska', miasto: 'Gdańsk', powierzchnia: 100, czynszM2: 60, stopaKap: 7,
    dataWyceny: '2026-09-01', cel: 'sprzedaż' } });
  const teksty = bez.zalozenia.map(z => z.dlaczego).join(' ');
  T('brak kosztów operacyjnych jest nazwany zawyżaniem wartości', /ZAWYŻA/i.test(teksty));
  T('zerowy pustostan jest nazwany założeniem skrajnie korzystnym', /skrajnie korzystn/i.test(teksty));
  T('stopa bez źródła jest oznaczona do sprawdzenia',
    bez.zalozenia.some(z => /stopa/i.test(z.co) && z.waga === 'sprawdz'));
  T('a stopa ze źródłem już nie',
    w.zalozenia.some(z => /stopa/i.test(z.co) && z.waga === 'info'));

  T('bez czynszu i stopy nie ma wyniku', (() => {
    const n = Express.przygotuj({ bazowy: baza, typ: 'income',
      dane: { ulica: 'Kartuska', miasto: 'Gdańsk', powierzchnia: 100, dataWyceny: '2026-09-01', cel: 'x' } });
    return !n.ok && n.braki.length === 2;
  })());
}

/* --- KOSZTOWY: koszt odtworzenia minus zużycie --- */
{
  const Moduly = (() => {
    const kod = fs.readFileSync(path.join(APP, 'calc-modules.js'), 'utf8');
    const okno = {};
    new Function('window', `${kod}\n;return window.OperoModuly;`)(okno);
    return okno.OperoModuly;
  })();
  const baza = { ...bazowy(), module: { code: 'cost' }, modul: Moduly.pustaStruktura('cost') };
  const w = Express.przygotuj({ bazowy: baza, typ: 'cost', dane: {
    ulica: 'Kartuska', miasto: 'Gdańsk', rodzajObiektu: 'budynek gospodarczy murowany', jednostka: 'm2',
    ilosc: 200, cenaJednostkowa: 4000, zrodloCeny: 'Sekocenbud, zeszyt 2/2026',
    wiek: 20, trwalosc: 80, dataWyceny: '2026-09-01', cel: 'ubezpieczenie' } });
  T('operat kosztowy daje się policzyć z Express', w.ok);
  const wy = Moduly.oblicz('cost', w.projekt);
  // 200 x 4000 = 800 000 w stanie nowym; zuzycie 20/80 = 25%; 800 000 x 0,75 = 600 000.
  T('koszt w stanie nowym to ilość razy stawka', wy.kosztNowy === 800000, String(wy.kosztNowy));
  T('zużycie liczone z wieku i trwałości', wy.zuzycieTechniczne === 25, String(wy.zuzycieTechniczne));
  T('wartość to koszt pomniejszony o zużycie', wy.marketValue === 600000, String(wy.marketValue));
  T('program mówi, jaką metodą policzył zużycie',
    w.zalozenia.some(z => /metoda czasowa/.test(z.wartosc)));
  T('i że przyjął odtworzenie, nie zastąpienie',
    w.zalozenia.some(z => /odtworzeni/.test(z.wartosc) && z.waga === 'sprawdz'));
  T('oba wymagane uzasadnienia zostają do napisania',
    w.doNapisania.some(x => /techniki/i.test(x.co)) && w.doNapisania.some(x => /zużycia/i.test(x.co)));
  T('bez źródła kosztu jednostkowego nie ma wyniku', (() => {
    const n = Express.przygotuj({ bazowy: baza, typ: 'cost', dane: {
      miasto: 'G', rodzajObiektu: 'x', jednostka: 'm2', ilosc: 200, cenaJednostkowa: 4000,
      wiek: 20, trwalosc: 80, dataWyceny: '2026-09-01', cel: 'x' } });
    return !n.ok && n.braki.some(b => /źródło/i.test(b));
  })());
  T('grunt niewliczony, gdy nie podano jego wartości', w.projekt.modul.wliczGrunt === 'nie');
}


/* --- PRZECINEK DZIESIETNY: tak pisze czlowiek, tak musi liczyc program ---
   Pola liczbowe Expressu sa polami tekstowymi, bo przegladarka odrzuca
   przecinek w type="number", a po polsku czesci dziesietne pisze sie
   przecinkiem. Gdyby program tego nie zamienial, melduje „brakuje
   powierzchni" nad polem, w ktorym powierzchnia stoi wpisana. */
{
  T('„54,30" to liczba, nie brak danej',
    Express.brakiPol('local_kcm', { ulica: 'Kartuska', miasto: 'Gdańsk', powierzchnia: '54,30', dataWyceny: '2026-11-03', cel: 'x' }).length === 0,
    JSON.stringify(Express.brakiPol('local_kcm', { ulica: 'Kartuska', miasto: 'Gdańsk', powierzchnia: '54,30', dataWyceny: '2026-11-03', cel: 'x' })));
  T('przecinek zamieniany na kropkę', Number(Express.naLiczbePl('54,30')) === 54.3);
  T('spacje w tysiącach nie przeszkadzają', Number(Express.naLiczbePl('1 234,5')) === 1234.5);
  T('puste pole zostaje puste, a nie zerem', Express.naLiczbePl('') === '');
  T('kropka też działa', Number(Express.naLiczbePl('54.30')) === 54.3);
  T('normalizacja rusza tylko pola liczbowe',
    Express.znormalizuj('local_kcm', { ulica: 'Kartuska, 1', powierzchnia: '54,30' }).ulica === 'Kartuska, 1');
  const w = Express.przygotuj({ bazowy: bazowy(), typ: 'local_kcm',
    dane: { ulica: 'Kartuska', numer: '201', miasto: 'Gdańsk', powierzchnia: '54,30', dataWyceny: '2026-09-01', cel: 'sprzedaż' },
    transakcje, regresja });
  T('operat z przecinkiem w powierzchni liczy się', w.ok, JSON.stringify(w.braki));
  T('i powierzchnia trafia do projektu jako liczba', w.ok && w.projekt.property.usableArea === 54.3,
    String(w.ok && w.projekt.property.usableArea));
}

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

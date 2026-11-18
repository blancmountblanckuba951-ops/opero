'use strict';
/* Kontrola zrodel i ZAPAS PROCENTOWY.
   Dwie rzeczy, ktore sie tu sprawdza:
   1. komunikat o bledzie NAZYWA usluge, ktora zawiodla - nigdy "serwer
      licencyjny", bo OPERO z zadnym sie nie laczy;
   2. kryteria sa celem, a nie plotem: zrodla pytamy szerzej o zapas, a to,
      co wpadlo dopiero dzieki niemu, jest oddzielone i podpisane. */
const Z = require('../build/app/renderer/zrodla-kontrola.js');
const S = require('../build/app/renderer/szukanie.js');

let ok = 0, zle = 0;
function T(opis, warunek, szczegol) {
  if (warunek) { ok++; console.log('  OK   ' + opis); }
  else { zle++; console.log('  BLAD ' + opis + (szczegol !== undefined ? ' — ' + JSON.stringify(szczegol) : '')); }
}

console.log('\n--- 1. Komunikat nazywa usluge, a nie licencje ---');
const zerwane = { cause: { code: 'ECONNRESET' } };
for (const z of Z.ZRODLA) {
  const k = Z.komunikat(zerwane, z.id);
  T(`${z.skrot}: komunikat podaje nazwę usługi`, k.includes(z.nazwa), k);
  T(`${z.skrot}: i ani slowa o serwerze licencyjnym`, !/licencyjn/i.test(k), k);
}
T('nieznane zrodlo tez nie klamie o licencji',
  !/licencyjn/i.test(Z.komunikat(zerwane, 'cos-innego')));
T('brak internetu nazwany jest brakiem internetu',
  /Brak połączenia z internetem/.test(Z.komunikat({ cause: { code: 'ENOTFOUND' } }, 'rcn')));
T('podmieniony certyfikat wskazuje antywirusa albo siec firmowa',
  /antywirus/i.test(Z.komunikat({ cause: { code: 'CERT_HAS_EXPIRED' } }, 'rcn')));
T('przy milczacym rejestrze program podpowiada wyciag ze starostwa',
  /wyciągu ze starostwa/.test(Z.komunikat(zerwane, 'rcn')));
T('blad 429 tlumaczy, ze to za duzo zapytan',
  /za dużo zapytań/.test(Z.komunikatHttp(429, 'dane-gov')), Z.komunikatHttp(429, 'dane-gov'));
T('blad 500 nazywa awarie po stronie uslugi',
  /awarię po swojej stronie/.test(Z.komunikatHttp(503, 'uug')));

console.log('\n--- 2. Ponawiamy tylko to, co ma sens ponawiac ---');
T('zerwane polaczenie powtarzamy', Z.wartoPowtorzyc({ cause: { code: 'ECONNRESET' } }));
T('przekroczony czas powtarzamy', Z.wartoPowtorzyc({ cause: { code: 'UND_ERR_CONNECT_TIMEOUT' } }));
T('przerwanie przez limit czasu powtarzamy', Z.wartoPowtorzyc({ name: 'AbortError' }));
T('odmowy polaczenia NIE powtarzamy', !Z.wartoPowtorzyc({ cause: { code: 'ECONNREFUSED' } }));
T('zlego adresu NIE powtarzamy', !Z.wartoPowtorzyc({ cause: { code: 'ENOTFOUND' } }));
T('bledu certyfikatu NIE powtarzamy', !Z.wartoPowtorzyc({ cause: { code: 'CERT_HAS_EXPIRED' } }));

console.log('\n--- 3. Stan uslug mowi, czy ma sens czekac ---');
const stan = Z.pusty();
T('przed sprawdzeniem stan jest nieznany, a nie udawany', stan.rcn.stan === 'nieznany');
T('i mowi to wprost', Z.opisWpisu(stan.rcn) === 'jeszcze nie sprawdzane');
Z.zapisz(stan, 'rcn', { ok: true, ms: 800 });
T('szybka odpowiedz to „dziala"', stan.rcn.stan === 'dziala');
T('z czasem odpowiedzi po polsku', /0,8 s/.test(Z.opisWpisu(stan.rcn)), Z.opisWpisu(stan.rcn));
Z.zapisz(stan, 'uldk', { ok: true, ms: 9000 });
T('odpowiedz po dziewieciu sekundach to juz „wolno"', stan.uldk.stan === 'wolno');
T('i program to nazywa', /wolno/.test(Z.opisWpisu(stan.uldk)));
Z.zapisz(stan, 'uug', { ok: true, ms: 300 });
Z.zapisz(stan, 'dane-gov', { ok: false, powod: 'Usługa nie odpowiedziała.' });
const pod = Z.podsumowanie(stan);
T('podsumowanie liczy, ile zrodel odpowiada', /3 z 4/.test(pod.tekst), pod.tekst);
T('i wymienia to, ktore milczy', /dane\.gov\.pl/.test(pod.tekst), pod.tekst);
T('swiecac na pomaranczowo', pod.waga === 'ostrzezenie');

const wszystkieOk = Z.pusty();
for (const z of Z.ZRODLA) Z.zapisz(wszystkieOk, z.id, { ok: true, ms: 500 });
T('komplet dzialajacych zrodel to zielone', Z.podsumowanie(wszystkieOk).waga === 'sukces');
const wszystkieZle = Z.pusty();
for (const z of Z.ZRODLA) Z.zapisz(wszystkieZle, z.id, { ok: false, powod: 'cisza' });
const padlo = Z.podsumowanie(wszystkieZle);
T('gdy milcza wszystkie, program wskazuje wlasne lacze, a nie urzedy',
  /Twojego połączenia albo zapory/.test(padlo.tekst), padlo.tekst);
T('i swieci na czerwono', padlo.waga === 'blad');

console.log('\n--- 4. Zapas procentowy: pytamy szerzej, pokazujemy osobno ---');
const k = S.kryteria({ miejscowosc: 'Gdańsk', powierzchnia: 60, odchylkaPowPct: 20,
  okresMiesiecy: 24, promienM: 1000, dataWyceny: '2026-11-05', zapasPct: 25 });
T('kryteria wpisane zostaja nietkniete', k.powOd === 48 && k.powDo === 72);
T('a pas z zapasem jest szerszy', k.powOdZapas === 45 && k.powDoZapas === 75);
T('okres tez dostaje zapas', k.okresMiesiecyZapas === 30, k.okresMiesiecyZapas);
T('i promien', k.promienMZapas === 1250, k.promienMZapas);
T('zapas jest domyslny, nie trzeba o nim pamietac', S.kryteria({ powierzchnia: 60 }).zapasPct === 25);
T('da sie go wylaczyc zerem', S.kryteria({ powierzchnia: 60, zapasPct: 0 }).zapasPct === 0);
T('przy zerze pas z zapasem rowna sie kryteriom',
  S.kryteria({ powierzchnia: 60, odchylkaPowPct: 20, zapasPct: 0 }).powOdZapas === 48);
T('opis kryteriow mowi o zapasie wprost', /zapas ±25%/.test(S.opisKryteriow(k)), S.opisKryteriow(k));

const zapytanie = S.kryteriaZapytania(k);
T('zrodla pytamy pasem z zapasem, a nie wpisanym', zapytanie.powOd === 45 && zapytanie.powDo === 75);
T('i szerszym promieniem', zapytanie.promienM === 1250);

const d = S.dopasuj([
  { powierzchnia: 60, miejscowosc: 'Gdańsk', data: '2026-05-01' },   // w kryteriach
  { powierzchnia: 46, miejscowosc: 'Gdańsk', data: '2026-05-01' },   // tylko w zapasie
  { powierzchnia: 60, miejscowosc: 'Gdańsk', data: '2024-06-01' },   // okres z zapasu
  { powierzchnia: 20, miejscowosc: 'Gdańsk', data: '2026-05-01' },   // poza wszystkim
  { powierzchnia: 60, miejscowosc: 'Gdynia', data: '2026-05-01' },   // inne miasto
], k);
T('to, co trafilo w kryteria, idzie osobno', d.pasujace.length === 1);
T('to, co wpadlo z zapasu, tez osobno', d.zZapasu.length === 2, d.zZapasu.map(x => x.powierzchnia));
T('reszta zostaje poza', d.niepasujace.length === 2);
T('lista do zaznaczenia to jedno i drugie razem', d.doPokazania.length === 3);
T('kazdy wiersz z zapasu jest oznaczony', d.zZapasu.every(x => x.zZapasu === true));
T('i kazdy mowi, czym wychodzi poza kryteria', d.zZapasu.every(x => x.opisZapasu));
// Kolejnosc jest wg DOPASOWANIA, wiec nie przywiazujemy sie do indeksow -
// sprawdzamy, ze oba powody padly, kazdy przy swojej pozycji.
const powodyZapasu = d.zZapasu.map(x => x.opisZapasu).join(' || ');
T('przy powierzchni podaje, ile metrow poza zakresem',
  /2 m² poza zakresem/.test(powodyZapasu), powodyZapasu);
T('przy dacie podaje, o ile miesiecy za stara i jaki jest okres',
  /29 miesięcy przed datą wyceny, a okres to 24/.test(powodyZapasu), powodyZapasu);
T('inne miasto nie jest kwestia zapasu', d.niepasujace.some(x => /inna miejscowość/.test(x.powodNiedopasowania)));

const poDacie = S.dopasuj([{ powierzchnia: 60, miejscowosc: 'Gdańsk', data: '2026-12-01' }], k);
T('transakcji PO dacie wyceny nie ratuje zaden zapas',
  poDacie.doPokazania.length === 0 && poDacie.niepasujace.length === 1);
T('i program mowi dlaczego', /PO dacie wyceny/.test(poDacie.niepasujace[0].powodNiedopasowania),
  poDacie.niepasujace[0].powodNiedopasowania);

const opis = S.opisDopasowania(d, k);
T('zdanie podsumowujace liczy jedno i drugie',
  /1 nieruchomość podobną/.test(opis) && /2 do Twojej decyzji/.test(opis), opis);
T('i mowi, ze zapas trzeba zaznaczyc recznie', /do zaznaczenia ręcznie/.test(opis), opis);

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

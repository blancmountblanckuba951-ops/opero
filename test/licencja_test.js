'use strict';
// Paczka zrodel trzyma program w app\\, repozytorium robocze w build\\app\\.
// Testy musza dzialac w obu ukladach, inaczej build na GitHubie wywala sie
// na samych testach, zanim w ogole dojdzie do instalatora.
const APP_DIR = (() => {
  const f = require('node:fs'), p = require('node:path');
  const a = p.join(__dirname, '..', 'build', 'app');
  return f.existsSync(a) ? a : p.join(__dirname, '..', 'app');
})();
// Licencja bez serwera. Sprawdzamy to, na czym stoi cała sprzedaż programu:
// czy klucza nie da się podrobić, czy wygasły naprawdę przestaje działać i czy
// odmowa mówi rzeczoznawcy, co ma zrobić, zamiast „błąd licencji".
const crypto = require('node:crypto');
const L = require(APP_DIR + '/licencja-offline.js');

let ok = 0, zle = 0;
const T = (n, w) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n); } };

console.log('Licencja offline\n');

// Własna para kluczy do testów — testy nie mogą zależeć od prawdziwego klucza
// prywatnego OPERO, bo tego w repozytorium nie ma i być nie może.
const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const PUB = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const PRIV = privateKey.export({ type: 'pkcs8', format: 'pem' });
const wydaj = (d) => L.wydaj(d, PRIV);
const sprawdz = (k, o = {}) => L.sprawdz(k, { kluczPubliczny: PUB, ...o });

const baza = { w: 1, plan: 'OPERO', nab: 'jan@example.pl', wyd: '2026-01-01T00:00:00.000Z', waz: '2027-01-01T00:00:00.000Z', urz: null, max: 1, nr: 'ABCD1234' };

/* --- klucz prawidłowy --- */
const dobry = wydaj(baza);
const w1 = sprawdz(dobry, { teraz: Date.parse('2026-06-01') });
T('prawidłowy klucz przechodzi', w1.ok === true);
T('program odczytuje plan i nabywcę', w1.dane.plan === 'OPERO' && w1.dane.nabywca === 'jan@example.pl');
T('data ważności wraca w czytelnej postaci', w1.dane.wazneDo.startsWith('2027-01-01'));
T('klucz na czas oznaczony nie udaje bezterminowego', w1.dane.bezterminowo === false);
T('zostało tyle dni, ile naprawdę zostało',
  L.dniDoKonca(baza.waz, Date.parse('2026-12-25T00:00:00Z')) === 7);
T('klucz bezterminowy nie ma licznika dni', L.dniDoKonca(null) === null);

/* --- klucz spoza OPERO --- */
const obcy = crypto.generateKeyPairSync('ed25519');
const podrobiony = L.wydaj({ ...baza, plan: 'OPERO CREATOR', waz: null }, obcy.privateKey.export({ type: 'pkcs8', format: 'pem' }));
const w2 = sprawdz(podrobiony);
T('klucz podpisany cudzym kluczem jest odrzucany', w2.ok === false && w2.powod === 'podpis');
T('odmowa za podpis nie zdradza, jak go obejść', !/klucz prywatn/i.test(w2.komunikat));

/* --- majstrowanie przy treści --- */
const czesci = dobry.split('.');
const podmieniona = Buffer.from(JSON.stringify({ ...baza, waz: '2099-01-01T00:00:00.000Z' }), 'utf8')
  .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const w3 = sprawdz(`${czesci[0]}.${podmieniona}.${czesci[2]}`);
T('przedłużenie daty w kluczu psuje podpis', w3.ok === false && w3.powod === 'podpis');

/* --- wygaśnięcie --- */
const w4 = sprawdz(dobry, { teraz: Date.parse('2027-01-02') });
T('klucz po dacie ważności nie działa', w4.ok === false && w4.powod === 'wygasl');
T('komunikat o wygaśnięciu podaje datę', /2027-01-01/.test(w4.komunikat));

/* --- przypisanie do urządzenia --- */
const naUrzadzenie = wydaj({ ...baza, urz: 'DEV-D1F7B2BA-9A47' });
T('klucz działa na swoim urządzeniu',
  sprawdz(naUrzadzenie, { teraz: Date.parse('2026-06-01'), kodUrzadzenia: 'DEV-D1F7B2BA-9A47' }).ok === true);
T('wielkość liter w kodzie urządzenia nie ma znaczenia',
  sprawdz(naUrzadzenie, { teraz: Date.parse('2026-06-01'), kodUrzadzenia: 'dev-d1f7b2ba-9a47' }).ok === true);
const w5 = sprawdz(naUrzadzenie, { teraz: Date.parse('2026-06-01'), kodUrzadzenia: 'DEV-00000000-0000' });
T('ten sam klucz na innym komputerze nie działa', w5.ok === false && w5.powod === 'inne_urzadzenie');
T('odmowa pokazuje oba kody, żeby było wiadomo, co się nie zgadza',
  /DEV-D1F7B2BA-9A47/.test(w5.komunikat) && /DEV-00000000-0000/.test(w5.komunikat));
T('klucz bez przypisania działa na dowolnym komputerze',
  sprawdz(wydaj({ ...baza, urz: null }), { teraz: Date.parse('2026-06-01'), kodUrzadzenia: 'DEV-COKOLWIEK-0001' }).ok === true);

/* --- klucz bezterminowy --- */
const wieczny = sprawdz(wydaj({ ...baza, waz: null, plan: 'OPERO CREATOR' }), { teraz: Date.parse('2099-01-01') });
T('klucz bezterminowy działa i za pięćdziesiąt lat', wieczny.ok === true && wieczny.dane.bezterminowo === true);

/* --- śmieci na wejściu --- */
const smieci = [
  ['pusty', ''],
  ['nie_klucz', 'OPERO-Y3H3-J7N7-DSF6-PQWR'],
  ['nie_klucz', 'zwykły tekst ze schowka'],
  ['nie_klucz', 'OPERO1.tylko-dwie-czesci'],
  ['podpis', 'OPERO1.AAAA.BBBB'],
];
T('żadne śmieci na wejściu nie wywracają sprawdzania',
  smieci.every(([powod, v]) => { const r = sprawdz(v); return r.ok === false && r.powod === powod; }));
T('każda odmowa mówi, co zrobić', smieci.every(([, v]) => sprawdz(v).komunikat.length > 20));

/* --- wklejanie z formatowaniem --- */
const zeSpacjami = ` ${dobry.slice(0, 30)}\n${dobry.slice(30, 60)} \r\n ${dobry.slice(60)} `;
T('klucz wklejony z łamaniem wierszy nadal działa',
  sprawdz(zeSpacjami, { teraz: Date.parse('2026-06-01') }).ok === true);
T('klucz wklejony w cudzysłowach nadal działa',
  sprawdz(`"${dobry}"`, { teraz: Date.parse('2026-06-01') }).ok === true);

/* --- co widać w programie --- */
T('program pokazuje tylko końcówkę klucza', L.skrot(dobry) === '…' + dobry.slice(-8));

/* --- nowszy format --- */
T('klucz z przyszłego formatu prosi o aktualizację, a nie o nowy klucz',
  sprawdz(wydaj({ ...baza, w: 2 })).powod === 'wersja');

/* --- klucz publiczny w programie jest prawdziwy --- */
T('program nosi prawdziwy klucz publiczny OPERO, nie zaślepkę',
  /^[A-Za-z0-9+/=]{40,}$/.test(L.KLUCZ_PUBLICZNY) && !/PLACEHOLDER/.test(L.KLUCZ_PUBLICZNY));
T('klucz publiczny daje się wczytać', (() => {
  try { crypto.createPublicKey({ key: Buffer.from(L.KLUCZ_PUBLICZNY, 'base64'), format: 'der', type: 'spki' }); return true; }
  catch { return false; }
})());
T('w programie nie ma klucza prywatnego',
  !/PRIVATE KEY/.test(require('node:fs').readFileSync(require.resolve(APP_DIR + '/licencja-offline.js'), 'utf8')));

console.log(`\n  Zaliczone: ${ok}  Niezaliczone: ${zle}`);
process.exit(zle ? 1 : 0);

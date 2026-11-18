'use strict';
/**
 * OPERO — klucz licencyjny z generatora 2.0 przechodzi przez KAŻDĄ drogę wpisania:
 * wklejenie, wklejenie z przełamaniem wierszy, plik z generatora, przycisk „Wklej".
 * Błąd z 1.46: filtr pod stary kod OPERO-XXXX odrzucał pełny klucz OPERO1.… (kropki, długość).
 */
const path = require('path'); const fs = require('fs'); const crypto = require('crypto');
const { Przegladarka } = require('./przegladarka');
const APP = path.join(__dirname, '..', 'build', 'app');
const L = require(path.join(APP, 'licencja-offline.js'));
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d) : '')); } };

// Klucz w dokładnie takiej postaci, jaką wydaje generator.
const para = crypto.generateKeyPairSync('ed25519');
const pem = para.privateKey.export({ type: 'pkcs8', format: 'pem' });
const pub = para.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const klucz = L.wydaj({ w: 1, plan: 'OPERO', nab: 'Jan Test', wyd: new Date().toISOString(), nr: '261115-ABCD', max: 1, waz: new Date(Date.now() + 30 * 864e5).toISOString() }, pem);
const plikGeneratora = ['KLUCZ LICENCYJNY OPERO', '', klucz, '', 'Wydany dla: Jan Test', 'Ważny do: 2026-12-15', '', 'Jak użyć: uruchom OPERO, wklej powyższy klucz w pole aktywacji i zatwierdź.'].join('\r\n');

(async () => {
  console.log('OPERO — klucz z generatora w oknie aktywacji\n');
  T('klucz z generatora ma kropki i ponad 64 znaki (tego nie przepuszczał stary filtr)', klucz.includes('.') && klucz.length > 64, klucz.length);
  T('podpis klucza zgadza się z kluczem publicznym pary', L.sprawdz(klucz, { kluczPubliczny: pub }).ok === true);

  // main.js: wyciąganie klucza z pliku generatora
  const main = fs.readFileSync(path.join(APP, 'main.js'), 'utf8');
  const fn = main.match(/function wyciagnijKluczOpero\(tekst\) \{[\s\S]*?\n\}/)[0];
  const wyciagnij = new Function(`${fn}; return wyciagnijKluczOpero;`)();
  T('z pliku generatora (nagłówek + opis) zostaje sam klucz', wyciagnij(plikGeneratora) === klucz);
  T('klucz przełamany na kilka wierszy jest sklejany', wyciagnij(klucz.slice(0, 50) + '\n' + klucz.slice(50, 120) + '\r\n  ' + klucz.slice(120)) === klucz);
  T('wczytanie pliku i aktywacja używają tego wyciągania', /code=wyciagnijKluczOpero\(fs\.readFileSync/.test(main) && /const surowy = wyciagnijKluczOpero\(code\);/.test(main));

  const p = await Przegladarka.uruchom('file:///tmp/widok/index.html');
  await p.pauza(1500);
  const w = await p.ocen(`
    const proby=[]; window.operatAPI.activateLicense=async(k)=>{proby.push(k);return {active:true,plan:'OPERO',expiresAt:new Date(Date.now()+864e5*30).toISOString()};};
    const wyniki={};
    const k=${JSON.stringify(klucz)}, plik=${JSON.stringify(plikGeneratora)};
    for(const [n,t] of Object.entries({goly:k, zSpacjami:'  '+k+'  ', zawiniety:k.slice(0,40)+'\\n'+k.slice(40), plik, cudzyslow:'"'+k+'"'})){
      proby.length=0; await activateLicenseCode(t,'settings'); wyniki[n]=proby[0]||null;
    }
    proby.length=0; await activateLicenseCode('Dzień dobry, przesyłam fakturę','settings'); wyniki.smieci=proby.length;
    wyniki.komunikat=document.querySelector('#statusBar')?.textContent||'';
    wyniki.wyglada=licenseKeyLooksValid(k); wyniki.wyciagnij=licenseKeyExtract(plik)===k;
    wyniki.placeholder=document.querySelector('#settingsLicenseKey').placeholder;
    return wyniki;`);
  for (const n of ['goly', 'zSpacjami', 'zawiniety', 'plik', 'cudzyslow']) T(`klucz wpisany jako „${n}" trafia do aktywacji w całości`, w[n] === klucz, w[n] && w[n].slice(0, 30));
  T('tekst bez klucza nie idzie do aktywacji', w.smieci === 0);
  T('komunikat mówi o kluczu „OPERO1.", nie o starym formacie', /OPERO1\./.test(w.komunikat) && !/OPERO-XXXX/.test(w.komunikat), w.komunikat);
  T('pole klucza w Ustawieniach podpowiada właściwą postać', /OPERO1\./.test(w.placeholder), w.placeholder);
  T('rozpoznanie i wyciąganie w oknie', w.wyglada && w.wyciagnij);
  await p.zamknij();
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

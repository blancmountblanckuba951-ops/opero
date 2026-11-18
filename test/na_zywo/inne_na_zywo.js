'use strict';
/** NA ŻYWO: otoczenie z OpenStreetMap, plan (KIMPZP), cenniki deweloperów z dane.gov.pl, geokoder i ULDK. */
const W = require('./wspolne');
const R = n => require(W.APP + '/renderer/' + n);
let ok = 0, zle = 0;
const T = (n, w, d) => { if (w) { ok++; console.log('  OK   ' + n); } else { zle++; console.log('  BLAD ' + n + (d !== undefined ? ' — ' + JSON.stringify(d).slice(0, 700) : '')); } };
(async () => {
  console.log('OPERO — usługi na żywo: otoczenie, plan, oferty, działka\n');
  const app = { getVersion: () => '3.3.0' };
  const otoczenie = new Function('otoczenieLogika', 'adresOsm', 'fetchWithTimeout', 'logToFile', 'app', 'let adresOsmOstatnie = 0; return ' + W.handler('otoczenie:zbierz'))(R('otoczenie.js'), R('adres-osm.js'), W.fetchWithTimeout, W.logToFile, app);
  const o = await otoczenie(null, { ulica: 'Ikara', numer: '97', miasto: 'Gdańsk', promien: 1500 });
  T('plan: gmina poza integracją rozpoznana (nie udaje planu)', o.mpzp && o.mpzp.jest === false && o.mpzp.bezSerwisu, o.mpzp);
  T('OpenStreetMap: położenie adresu', !!o.punkt && Math.abs(o.punkt.lat - 54.4) < 0.2, o.punkt || o.bledy);
  console.log(o.otoczenie?.ok ? '  OK   Overpass: otoczenie' : '  (pominięte) Overpass niedostępny z tego środowiska: ' + o.bledy.join('; '));
  if (o.otoczenie?.kategorie) console.log('   ', Object.values(o.otoczenie.kategorie).map(k => `${k.jeden}: ${k.najblizszy?.nazwa || '—'} ${k.najblizszy?.odl} m`).join('; ').slice(0, 900));
  console.log('    plan:', JSON.stringify(o.mpzp).slice(0, 300));
  // dane.gov.pl
  const kod = W.wytnij('async function ofertyPobierzJson(') + W.wytnij('async function ofertyWczytajPlik(');
  const zaw = new Function('fetchWithTimeout', 'logToFile', 'oferty', 'xlsxCzytnik', 'parseDelimited', 'requireActiveLicense', 'Buffer', 'ofertyEtap', 'zrodlaKontrola', kod + '\nreturn ' + W.handler('oferty:szukaj'));
  let oferty;
  try {
    oferty = await zaw(W.fetchWithTimeout, W.logToFile, R('oferty-dane-gov.js'), require(W.APP + '/xlsx-czytnik.js'), (t) => t.split(/\r?\n/).map(l => l.split(';')), () => {}, Buffer, () => {}, R('zrodla-kontrola.js'))(null, { miasto: 'Gdańsk' });
  } catch (e) { oferty = { ok: false, powod: String(e.message || e) }; }
  T('dane.gov.pl: cenniki deweloperów dla Gdańska', oferty?.ok && (oferty.oferty || []).length > 0, { ok: oferty?.ok, n: (oferty?.oferty || []).length, powod: oferty?.powod, kom: oferty?.komunikat, etapy: oferty?.etapy });
  if ((oferty?.oferty || []).length) console.log(`    ofert: ${oferty.oferty.length}, zbiory: ${(oferty.zrodla || []).map(z => z.zbior).slice(0, 4).join('; ')}`);
  console.log(`\nZaliczone: ${ok}  Niezaliczone: ${zle}`);
  if (zle) console.log(W.dziennik.slice(-12).join('\n'));
  process.exit(zle ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

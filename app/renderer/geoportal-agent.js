/* OPERO 3.1 — Agent Geoportalu (czesc czysta: adresy zapytan i czytanie odpowiedzi)
 *
 * Agent robi to, co rzeczoznawca robi recznie na geoportalu: znajduje dzialke,
 * oglada ja na ortofotomapie, na mapie ewidencyjnej, na planie miejscowym
 * i na mapie uzbrojenia terenu, otwiera legendy i opis szczegolowy dzialki,
 * a potem wszystko to dolacza do operatu jako zalaczniki.
 *
 * Zamiast „klikac kursorem" w strone, pyta te same publiczne uslugi GUGiK,
 * z ktorych korzysta sam geoportal (ULDK, WMS: GetCapabilities, GetMap,
 * GetLegendGraphic, GetFeatureInfo). To jest szybsze, powtarzalne i daje
 * obrazy w pelnej rozdzielczosci. Dodatkowo — jesli wlaczone — otwiera
 * widoczne okno geoportalu na tej dzialce i robi zrzut ekranu.
 *
 * Modul nie laczy sie z siecia; siec jest w procesie glownym (main.js).
 */
'use strict';

const GA_ULDK = 'https://uldk.gugik.gov.pl/';

/** Uslugi WMS, ktore oglada agent. Nazwy warstw program czyta z GetCapabilities. */
const GA_USLUGI = [
  { id: 'orto', tytul: 'Ortofotomapa', url: 'https://mapy.geoportal.gov.pl/wss/service/PZGIK/ORTO/WMS/StandardResolution',
    format: 'image/jpeg', przezroczysta: false, preferuj: /^(raster|orto)/i, maksWarstw: 1, legenda: false, info: false, mapa: ['Raster'] },
  { id: 'egib', tytul: 'Ewidencja gruntów i budynków (KIEG)', url: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow',
    format: 'image/png', przezroczysta: true, preferuj: /^(dzialki|numery_dzialek|budynki|kontury)$/i, maksWarstw: 6, legenda: true, info: true,
    mapa: ['dzialki', 'numery_dzialek', 'budynki', 'kontury'], pytaj: ['geoportal', 'dzialki', 'kontury'] },
  { id: 'mpzp', tytul: 'Plan miejscowy (KIMPZP)', url: 'https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego',
    format: 'image/png', przezroczysta: true, preferuj: /plan|raster|wektor|granic|przeznacz/i, maksWarstw: 10, legenda: true, info: true,
    mapa: ['raster', 'wektor-str', 'wektor-lzb', 'wektor-pow', 'wektor-lin', 'wektor-pkt', 'granice'], pytaj: ['plany_granice', 'wektor-str'] },
  { id: 'uzbrojenie', tytul: 'Uzbrojenie terenu (KIUT)', url: 'https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaUzbrojeniaTerenu',
    format: 'image/png', przezroczysta: true, preferuj: /przewod|uzbroj|siec|gaz|wod|kanal|elektro|cieplo|telekom/i, maksWarstw: 10, legenda: true, info: false,
    mapa: ['przewod_wodociagowy', 'przewod_kanalizacyjny', 'przewod_gazowy', 'przewod_elektroenergetyczny', 'przewod_cieplowniczy', 'przewod_telekomunikacyjny', 'przewod_specjalny', 'przewod_niezidentyfikowany', 'przewod_urzadzenia'] },
];

function gaUsluga(id){ return GA_USLUGI.find(u => u.id === id) || null; }

/* ------------------------------------------------------------------ ULDK */

const GA_POLA_ULDK = ['geom_extent', 'geom_wkt', 'id', 'parcel', 'region', 'commune', 'county', 'voivodeship'];

function gaUldkUrl(id){
  const i = String(id || '').trim();
  if (!/^\d{6}_\d\.\d{4}\.[\w\/.-]+$/.test(i)) throw new Error('To nie wygląda na identyfikator działki (np. 226101_1.0003.1172).');
  return `${GA_ULDK}?request=GetParcelById&id=${encodeURIComponent(i)}&result=${GA_POLA_ULDK.join(',')}&srid=2180`;
}

/** Odpowiedz ULDK: pierwsza linia to kod (0 = ok, -1 = brak), dalej rekord z polami rozdzielonymi „|". */
function gaZUldk(tekst){
  const linie = String(tekst || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!linie.length) return { ok: false, powod: 'ULDK nie odpowiedziała.' };
  const kod = Number(linie[0].split(/\s/)[0]);
  if (kod < 0 || !linie[1]) return { ok: false, powod: `ULDK nie zna tej działki${linie[0].includes(' ') ? ` (${linie[0].replace(/^-?\d+\s*/, '')})` : ''}.` };
  const p = linie[1].split('|');
  const o = {}; GA_POLA_ULDK.forEach((k, i) => { o[k] = (p[i] || '').trim(); });
  const ext = o.geom_extent.split(/[ ,;]+/).map(Number).filter(Number.isFinite);
  if (ext.length !== 4) return { ok: false, powod: 'ULDK zwróciła działkę bez zasięgu.' };
  return { ok: true, id: o.id, numer: o.parcel, obreb: o.region, gmina: o.commune, powiat: o.county, wojewodztwo: o.voivodeship,
    zasieg: ext, wkt: o.geom_wkt.replace(/^SRID=\d+;/i, '') };
}

/** Kwadrat wokol dzialki z marginesem — zeby bylo widac sasiedztwo. */
function gaKadr(zasieg, { margines = 0.6, minBok = 140 } = {}){
  const [x1, y1, x2, y2] = zasieg;
  const sx = (x1 + x2) / 2, sy = (y1 + y2) / 2;
  const bok = Math.max(minBok, Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * (1 + 2 * margines));
  return [sx - bok / 2, sy - bok / 2, sx + bok / 2, sy + bok / 2].map(v => Math.round(v * 100) / 100);
}

/* ------------------------------------------------------------------- WMS */

function gaParam(u, p){ return `${u}${u.includes('?') ? '&' : '?'}${new URLSearchParams(p).toString()}`; }

function gaCapUrl(usluga){ return gaParam(usluga.url, { SERVICE: 'WMS', REQUEST: 'GetCapabilities', VERSION: '1.1.1' }); }

function gaOdkoduj(t){
  return String(t ?? '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').trim();
}

/** Warstwy z GetCapabilities: nazwa, tytul, adres legendy, czy mozna pytac o informacje. */
function gaWarstwyZCap(xml){
  const s = String(xml || ''), out = [];
  const re = /<Layer\b([^>]*)>([\s\S]*?)(?=<Layer\b|<\/Layer>)/g;
  let m;
  while ((m = re.exec(s))){
    const atr = m[1], tresc = m[2];
    const nazwa = gaOdkoduj((/<Name>([\s\S]*?)<\/Name>/.exec(tresc) || [])[1]);
    if (!nazwa) continue;
    const tytul = gaOdkoduj((/<Title>([\s\S]*?)<\/Title>/.exec(tresc) || [])[1]) || nazwa;
    const leg = /<LegendURL[\s\S]*?<OnlineResource[^>]*xlink:href="([^"]+)"/.exec(tresc);
    out.push({ nazwa, tytul, legenda: leg ? gaOdkoduj(leg[1]) : '', zapytywalna: /queryable="1"/.test(atr) });
  }
  return out;
}

/** Wybor warstw do mapy: preferowane wg wzorca, inaczej wszystkie (do limitu). */
function gaWybierzWarstwy(usluga, warstwy, cel = 'mapa'){
  const l = (warstwy || []).filter(w => w.nazwa);
  // 3.3: najpierw dokładnie te warstwy, które pokazuje geoportal (sprawdzone na żywo),
  // w tej kolejności; dopiero gdy usługa ich nie ma — wybór po wzorcu.
  const lista = cel === 'info' ? (usluga.pytaj || usluga.mapa) : usluga.mapa;
  if (Array.isArray(lista)){
    const zn = lista.map(n => l.find(w => w.nazwa === n)).filter(Boolean);
    if (zn.length) return cel === 'info' ? zn.filter(w => w.zapytywalna) : zn;
  }
  const pref = l.filter(w => usluga.preferuj.test(w.nazwa) || usluga.preferuj.test(w.tytul));
  return (pref.length ? pref : l).slice(0, usluga.maksWarstw);
}

function gaMapaUrl({ usluga, warstwy, kadr, szer = 1200, wys = 1200 }){
  return gaParam(usluga.url, {
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: warstwy.map(w => w.nazwa || w).join(','), STYLES: '',
    SRS: 'EPSG:2180', BBOX: kadr.join(','), WIDTH: String(szer), HEIGHT: String(wys), FORMAT: usluga.format,
    TRANSPARENT: usluga.przezroczysta ? 'TRUE' : 'FALSE',
  });
}

function gaLegendaUrl(usluga, warstwa){
  if (warstwa.legenda) return warstwa.legenda;
  return gaParam(usluga.url, { SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetLegendGraphic', LAYER: warstwa.nazwa, FORMAT: 'image/png' });
}

function gaInfoUrl({ usluga, warstwy, kadr, szer = 1200, wys = 1200, format = 'text/html' }){
  const nazwy = warstwy.map(w => w.nazwa || w).join(',');
  return gaParam(usluga.url, {
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo', LAYERS: nazwy, QUERY_LAYERS: nazwy, STYLES: '',
    SRS: 'EPSG:2180', BBOX: kadr.join(','), WIDTH: String(szer), HEIGHT: String(wys),
    X: String(Math.round(szer / 2)), Y: String(Math.round(wys / 2)), INFO_FORMAT: format, FEATURE_COUNT: '10',
  });
}

/* ------------------------------------------------ opis szczegolowy dzialki */

/** HTML z GetFeatureInfo -> czysty tekst, wiersz po wierszu (tabele jako „klucz: wartosc"). */
function gaInfoTekst(html){
  let s = String(html || '');
  if (!/<[a-z]/i.test(s)) return s.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean).join('\n');
  s = s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '')
    .replace(/<\/t[dh]>\s*<t[dh][^>]*>/gi, ': ')
    .replace(/<br\s*\/?>|<\/tr>|<\/p>|<\/div>|<\/li>|<\/h\d>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return gaOdkoduj(s).split('\n').map(l => l.replace(/\s+/g, ' ').replace(/\s*:\s*/, ': ').trim()).filter(l => l && l !== ':').join('\n');
}

/** Pola operatu z opisu szczegolowego (ewidencja, plan). Tylko to, co jest napisane wprost. */
function gaPolaZInfo(tekst, rodzaj){
  const t = String(tekst || ''), pola = {};
  const wez = re => { const m = re.exec(t); return m ? m[1].trim() : ''; };
  if (rodzaj === 'egib'){
    const id = wez(/Identyfikator dzia[łl]ki\s*:\s*([\w.\/_-]+)/i);
    const nr = wez(/Numer dzia[łl]ki\s*:\s*([\w\/-]+)/i);
    const obreb = wez(/(?:Nazwa obr[ęe]bu|Obr[ęe]b(?: ewidencyjny)?)\s*:\s*([^\n]+)/i);
    const gm = wez(/(?:Nazwa gminy|Gmina)\s*:\s*([^\n]+)/i);
    const pow = wez(/(?:Pole pow[^:\n]{0,30}|Powierzchnia[^:\n]{0,30})\s*:\s*([\d.,]+(?: \d{3})*)/i);
    const kw = wez(/(?:Numer KW|Nr KW|Ksi[ęe]ga wieczysta)\s*:\s*([A-Z0-9]{4}\/\d{8}\/\d)/i);
    const uz = wez(/(?:Klasou[żz]ytki|U[żz]ytki gruntowe|U[żz]ytek)\s*:\s*([^\n]+)/i);
    if (id) pola['egib.plotId'] = id;
    if (nr) pola['egib.plotNo'] = nr;
    if (obreb) pola['egib.district'] = obreb;
    if (gm) pola['egib.unit'] = gm;
    if (pow){ const v = Number(pow.replace(/\s/g, '').replace(',', '.')); if (v > 0 && v < 100000) pola['egib.plotArea'] = String(v).replace('.', ',') + ' ha'; }
    if (kw) pola['legal.kwCommon'] = kw;
    if (uz) pola['egib.notes'] = `Użytki: ${uz.slice(0, 200)}`;
  } else if (rodzaj === 'mpzp'){
    const symbol = wez(/(?:Symbol(?: przeznaczenia| terenu)?|Oznaczenie(?: terenu)?)\s*:\s*([A-ZŁŚŻŹĆŃ0-9.\/ ,-]{1,30})/i);
    const przezn = wez(/(?:Przeznaczenie(?: terenu)?|Opis przeznaczenia)\s*:\s*([^\n]+)/i);
    const tytul = wez(/(?:Tytu[łl](?: planu)?|Nazwa planu|Plan)\s*:\s*([^\n]+)/i);
    const uchw = wez(/(Uchwa[łl]a[^\n]{3,160})/i);
    if (symbol) pola['planning.zoneSymbol'] = symbol;
    if (przezn) pola['planning.designation'] = przezn.slice(0, 400);
    if (tytul) pola['planning.planName'] = tytul.slice(0, 300);
    if (uchw) pola['planning.resolution'] = uchw.slice(0, 200);
  }
  return pola;
}

/* --------------------------------------------- obrys dzialki na obrazie */

function gaWktPierscienie(wkt){
  const s = String(wkt || '');
  const out = [];
  for (const m of s.matchAll(/\(\s*([-\d.]+\s+[-\d.]+(?:\s*,\s*[-\d.]+\s+[-\d.]+)+)\s*\)/g)){
    out.push(m[1].split(',').map(p => p.trim().split(/\s+/).map(Number)));
  }
  return out;
}

/** Wspolrzedne terenowe -> piksele obrazu (os Y obrazu w dol). */
function gaNaPiksele(wkt, kadr, szer = 1200, wys = 1200){
  const [x1, y1, x2, y2] = kadr;
  let pier = gaWktPierscienie(wkt);
  // Kolejnosc osi: jesli punkty nie leza w kadrze, a po zamianie leza — zamieniamy.
  const wKadrze = (p) => p[0] >= x1 && p[0] <= x2 && p[1] >= y1 && p[1] <= y2;
  const wszystkie = pier.flat();
  if (wszystkie.length && !wszystkie.some(wKadrze) && wszystkie.some(p => wKadrze([p[1], p[0]]))) pier = pier.map(r => r.map(p => [p[1], p[0]]));
  return pier.map(r => r.map(([x, y]) => [Math.round((x - x1) / (x2 - x1) * szer * 10) / 10, Math.round((y2 - y) / (y2 - y1) * wys * 10) / 10]));
}

/** Podpis zalacznika z mapa — z zrodlem i data pobrania. */
function gaPodpis(usluga, dzialka, kiedy){
  const d = String(kiedy || '').slice(0, 10).split('-').reverse().join('.');
  return `${usluga.tytul} — działka nr ${dzialka.numer || '?'}, obręb ${dzialka.obreb || '?'} (${dzialka.id || ''}). Źródło: ${usluga.url.replace(/^https?:\/\//, '').split('/')[0]}, pobrano ${d}.`;
}

const API_GEOAGENT = {
  ULDK: GA_ULDK, USLUGI: GA_USLUGI, usluga: gaUsluga, uldkUrl: gaUldkUrl, zUldk: gaZUldk, kadr: gaKadr,
  capUrl: gaCapUrl, warstwyZCap: gaWarstwyZCap, wybierzWarstwy: gaWybierzWarstwy, mapaUrl: gaMapaUrl, legendaUrl: gaLegendaUrl,
  infoUrl: gaInfoUrl, infoTekst: gaInfoTekst, polaZInfo: gaPolaZInfo, naPiksele: gaNaPiksele, podpis: gaPodpis,
};
if (typeof window !== 'undefined') window.OperoGeoAgent = API_GEOAGENT;
if (typeof module !== 'undefined' && module.exports) module.exports = API_GEOAGENT;

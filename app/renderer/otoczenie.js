'use strict';
/* ============================================================================
   OPERO — AUTOMAT: PROGRAM SAM ZBIERA DANE O NIERUCHOMOŚCI I PISZE OPISY
   ----------------------------------------------------------------------------
   Rzeczoznawca podaje adres. Program sam:
     1. ustala położenie (szerokość i długość geograficzną),
     2. sprawdza, co jest w otoczeniu i w jakiej odległości — przystanki,
        stacje, szkoły, przedszkola, sklepy, apteki, przychodnie, parki, lasy,
     3. pyta krajową integrację planów miejscowych, czy pod tym punktem
        obowiązuje plan,
     4. wpisuje to do operatu i pisze z tego gotowy opis lokalizacji.

   SKĄD DANE
     * otoczenie — OpenStreetMap (usługa Overpass), bezpłatnie, bez klucza;
     * położenie — OpenStreetMap (Nominatim), jedno zapytanie na kliknięcie;
     * plany — Krajowa Integracja Miejscowych Planów (Geoportal, GUGiK).

   CZEGO TEN MODUŁ NIE ROBI I DLACZEGO
     * Nie zmyśla. Każde zdanie opisu powstaje z konkretnego obiektu z mapy,
       z nazwą i odległością. Czego mapa nie zna — tego w opisie nie ma.
     * Odległości są W LINII PROSTEJ i tak są podpisane. Droga dojścia bywa
       dłuższa; rzeczoznawca widział to na oględzinach, program nie.
     * Nie ustala faktów prawnych: dostępu do drogi publicznej, klasy
       energetycznej, treści księgi. Tych rzeczy nie ma w żadnym otwartym
       rejestrze — wynikają z dokumentów, które ma w ręku rzeczoznawca.
     * Nie nadpisuje tego, co człowiek wpisał sam.
   ========================================================================= */

const OTO_OVERPASS = 'https://overpass-api.de/api/interpreter';
/** 3.3: zapasowe serwery Overpass — główny bywa przeciążony. */
const OTO_OVERPASS_ZAPAS = ['https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const OTO_MPZP = 'https://mapy.geoportal.gov.pl/wss/ext/KrajowaIntegracjaMiejscowychPlanowZagospodarowaniaPrzestrzennego';
const OTO_PROMIEN = 1500;
const OTO_PODPIS = 'OpenStreetMap (© autorzy OpenStreetMap)';

/**
 * Co program sprawdza w otoczeniu. `pole` mówi, do której rubryki operatu
 * trafia wynik; `jeden`/`wiele` to nazwa do zdania.
 */
const OTO_KATEGORIE = [
  { id: 'autobus', pole: 'transport', jeden: 'przystanek autobusowy', filtr: [['highway', 'bus_stop']] },
  { id: 'tramwaj', pole: 'transport', jeden: 'przystanek tramwajowy', filtr: [['railway', 'tram_stop']] },
  { id: 'kolej', pole: 'transport', jeden: 'stacja kolejowa', filtr: [['railway', 'station'], ['railway', 'halt']] },
  { id: 'metro', pole: 'transport', jeden: 'stacja metra', filtr: [['station', 'subway']] },
  { id: 'sklep', pole: 'services', jeden: 'sklep spożywczy', filtr: [['shop', 'supermarket'], ['shop', 'convenience']] },
  { id: 'szkola', pole: 'services', jeden: 'szkoła', filtr: [['amenity', 'school']] },
  { id: 'przedszkole', pole: 'services', jeden: 'przedszkole', filtr: [['amenity', 'kindergarten']] },
  { id: 'apteka', pole: 'services', jeden: 'apteka', filtr: [['amenity', 'pharmacy']] },
  { id: 'przychodnia', pole: 'services', jeden: 'przychodnia', filtr: [['amenity', 'clinic'], ['amenity', 'doctors'], ['amenity', 'hospital']] },
  { id: 'poczta', pole: 'services', jeden: 'placówka pocztowa', filtr: [['amenity', 'post_office']] },
  { id: 'park', pole: 'recreation', jeden: 'park', filtr: [['leisure', 'park']] },
  { id: 'las', pole: 'recreation', jeden: 'las', filtr: [['landuse', 'forest'], ['natural', 'wood']] },
  { id: 'plac', pole: 'recreation', jeden: 'plac zabaw', filtr: [['leisure', 'playground']] },
  { id: 'sport', pole: 'recreation', jeden: 'obiekt sportowy', filtr: [['leisure', 'sports_centre'], ['leisure', 'pitch'], ['leisure', 'swimming_pool']] },
  { id: 'woda', pole: 'recreation', jeden: 'zbiornik wodny', filtr: [['natural', 'water']] },
];

function otoTekst(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }

function otoPunktPoprawny(lat, lon) {
  const a = Number(lat), b = Number(lon);
  // Polska z zapasem. Punkt spoza tego prostokąta to pomyłka w danych,
  // a nie nieruchomość do wyceny.
  return Number.isFinite(a) && Number.isFinite(b) && a >= 48.9 && a <= 55 && b >= 14 && b <= 24.3;
}

/** Odległość w metrach między dwoma punktami (kula, wzór haversine). */
function otoOdleglosc(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180, R = 6371008.8;
  const dLat = (lat2 - lat1) * r, dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** „ok. 250 m" albo „ok. 1,2 km". Zaokrąglamy, bo metr dokładności tu nie istnieje. */
function otoOdlegloscTekst(m) {
  const n = Number(m);
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1000) return `ok. ${Math.max(50, Math.round(n / 50) * 50)} m`;
  return `ok. ${(Math.round(n / 100) / 10).toFixed(1).replace('.', ',')} km`;
}

/* ----------------------------------------------------------------- Overpass */

/** Zapytanie o wszystko, co nas interesuje, w promieniu od punktu. */
function otoZapytanie(lat, lon, promien = OTO_PROMIEN) {
  if (!otoPunktPoprawny(lat, lon)) return '';
  const R = Math.min(3000, Math.max(300, Math.round(Number(promien) || OTO_PROMIEN)));
  const gdzie = `(around:${R},${Number(lat).toFixed(6)},${Number(lon).toFixed(6)})`;
  const widziane = new Set();
  const wiersze = [];
  for (const k of OTO_KATEGORIE) for (const [klucz, wartosc] of k.filtr) {
    const w = `nwr${gdzie}["${klucz}"="${wartosc}"];`;
    if (!widziane.has(w)) { widziane.add(w); wiersze.push(w); }
  }
  return `[out:json][timeout:25];(${wiersze.join('')});out center tags 600;`;
}

function otoKategoriaObiektu(tagi) {
  for (const k of OTO_KATEGORIE) if (k.filtr.some(([klucz, w]) => tagi[klucz] === w)) return k;
  return null;
}

/**
 * Odpowiedź Overpass → dla każdej kategorii najbliższy obiekt i liczba
 * obiektów w promieniu. Obiekty powierzchniowe (park, las) mają odległość
 * do ŚRODKA — dlatego w zdaniu stoi „ok.".
 */
function otoZOdpowiedzi(odpowiedz, lat, lon) {
  let dane = odpowiedz;
  if (typeof odpowiedz === 'string') { try { dane = JSON.parse(odpowiedz); } catch { return { ok: false, powod: 'Usługa mapy odpowiedziała nieczytelnie.', kategorie: {}, ile: 0 }; } }
  const el = dane && Array.isArray(dane.elements) ? dane.elements : null;
  if (!el) return { ok: false, powod: 'Usługa mapy nie zwróciła listy obiektów.', kategorie: {}, ile: 0 };
  const kategorie = {};
  let ile = 0;
  for (const e of el) {
    const tagi = (e && e.tags) || {};
    const k = otoKategoriaObiektu(tagi);
    if (!k) continue;
    const eLat = Number(e.lat ?? e.center?.lat), eLon = Number(e.lon ?? e.center?.lon);
    if (!Number.isFinite(eLat) || !Number.isFinite(eLon)) continue;
    const odl = otoOdleglosc(Number(lat), Number(lon), eLat, eLon);
    const nazwa = otoTekst(tagi.name || tagi['name:pl'] || tagi.brand || tagi.operator || '').slice(0, 80);
    const wpis = kategorie[k.id] || (kategorie[k.id] = { id: k.id, pole: k.pole, jeden: k.jeden, ile: 0, najblizszy: null, nazwy: new Set() });
    // Przystanek w obie strony to dwa obiekty o tej samej nazwie — liczymy raz.
    const kluczNazwy = nazwa ? nazwa.toLowerCase() : `bez-nazwy-${Math.round(eLat * 2000)}-${Math.round(eLon * 2000)}`;
    if (!wpis.nazwy.has(kluczNazwy)) { wpis.nazwy.add(kluczNazwy); wpis.ile++; }
    if (!wpis.najblizszy || odl < wpis.najblizszy.odl) wpis.najblizszy = { nazwa, odl };
    ile++;
  }
  for (const w of Object.values(kategorie)) delete w.nazwy;
  return { ok: true, powod: '', kategorie, ile };
}

/* ------------------------------------------------------------------ zdania */

function otoZdanieObiektu(w) {
  const n = w.najblizszy;
  const nazwa = n.nazwa ? ` „${n.nazwa}"` : '';
  return `${w.jeden}${nazwa} — ${otoOdlegloscTekst(n.odl)}`;
}

const OTO_KOLEJNOSC = OTO_KATEGORIE.map(k => k.id);

/**
 * Trzy rubryki operatu + gotowy akapit. Każde zdanie ma za sobą obiekt
 * z mapy; kategorii, których w promieniu nie ma, po prostu nie wymieniamy
 * („brak szkoły" byłoby twierdzeniem, którego mapa nie uzasadnia — może jej
 * tylko nikt nie narysował).
 */
function otoOpis(wynik, { adres = '', dzielnica = '', miasto = '', promien = OTO_PROMIEN, data = '' } = {}) {
  const k = (wynik && wynik.kategorie) || {};
  const zPola = (pole) => OTO_KOLEJNOSC.map(id => k[id]).filter(w => w && w.pole === pole && w.najblizszy)
    .sort((a, b) => a.najblizszy.odl - b.najblizszy.odl);
  const lista = (pole) => zPola(pole).map(otoZdanieObiektu).join('; ');
  const transport = lista('transport'), services = lista('services'), recreation = lista('recreation');
  const dopisek = ' (odległości w linii prostej)';
  const pola = {
    transport: transport ? transport + dopisek : '',
    services: services ? services + dopisek : '',
    recreation: recreation ? recreation + dopisek : '',
  };
  const gdzie = [adres, dzielnica && `dzielnica ${dzielnica}`, miasto].filter(Boolean).join(', ');
  const akapity = [];
  if (gdzie) akapity.push(`Nieruchomość położona jest pod adresem: ${gdzie}.`);
  if (transport) akapity.push(`Komunikacja: w otoczeniu znajdują się: ${transport}.`);
  if (services) akapity.push(`Usługi: najbliższe obiekty to: ${services}.`);
  if (recreation) akapity.push(`Zieleń i rekreacja: ${recreation}.`);
  const jest = transport || services || recreation;
  if (jest) {
    akapity.push(`Odległości podano w linii prostej od punktu adresowego, w promieniu ${otoOdlegloscTekst(promien).replace('ok. ', '')}; `
      + `rzeczywista droga dojścia może być dłuższa. Źródło: ${OTO_PODPIS}${data ? `, stan na ${data}` : ''}. `
      + 'Dane zweryfikowano podczas oględzin [DO POTWIERDZENIA].');
  }
  return { pola, opis: jest ? akapity.join('\n') : '', jest: !!jest };
}

/** Krótkie podsumowanie do okna stanu: co znaleziono, czego nie. */
function otoPodsumowanie(wynik) {
  const k = (wynik && wynik.kategorie) || {};
  const sa = [], brak = [];
  for (const kat of OTO_KATEGORIE) {
    const w = k[kat.id];
    if (w && w.najblizszy) sa.push(otoZdanieObiektu(w));
    else brak.push(kat.jeden);
  }
  return { sa, brak };
}

/* --------------------------------------------------------------------- plany */

/**
 * Zapytanie „co jest pod tym punktem" do krajowej integracji planów.
 * Używamy WMS 1.1.1 ze współrzędnymi geograficznymi: kolejność osi jest tam
 * jednoznaczna (długość, szerokość), więc punkt nie wyląduje w złym miejscu.
 */
function otoMpzpUrl(lat, lon) {
  if (!otoPunktPoprawny(lat, lon)) return '';
  const d = 0.0006;
  const warstwy = 'granice,raster,wektor-str,wektor-lzb,wektor-pow,wektor-lin,wektor-pkt';
  const p = new URLSearchParams({
    SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetFeatureInfo',
    LAYERS: warstwy, QUERY_LAYERS: warstwy, STYLES: '',
    SRS: 'EPSG:4326',
    BBOX: [Number(lon) - d, Number(lat) - d, Number(lon) + d, Number(lat) + d].map(x => x.toFixed(6)).join(','),
    WIDTH: '101', HEIGHT: '101', X: '50', Y: '50',
    INFO_FORMAT: 'text/html', FEATURE_COUNT: '10',
  });
  return `${OTO_MPZP}?${p.toString()}`;
}

function otoHtmlNaTekst(html) {
  return String(html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(tr|p|div|li|h\d|table)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(td|th)>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .split('\n').map(l => l.replace(/\s+/g, ' ').replace(/^\s*\|\s*|\s*\|\s*$/g, '').trim()).filter(Boolean).join('\n');
}

/**
 * Odpowiedź usługi planów. Każda gmina publikuje inaczej, więc czytamy
 * ostrożnie: wyciągamy tylko to, co da się rozpoznać pewnie (tytuł, uchwałę,
 * odnośnik), a całą resztę pokazujemy człowiekowi jako tekst do przejrzenia.
 * Symbolu terenu i przeznaczenia NIE zgadujemy — są na rysunku planu.
 */
function otoMpzpZOdpowiedzi(html) {
  const surowe = String(html || '');
  if (/ServiceException|<ows:Exception/i.test(surowe)) {
    return { ok: false, jest: false, powod: 'Usługa planów odrzuciła zapytanie.', tekst: '' };
  }
  const tekst = otoHtmlNaTekst(surowe).slice(0, 2500);
  // 3.3 (sprawdzone na żywo): gmina poza krajową integracją odpowiada „brak serwisu dla wskazanego obszaru".
  if (/brak serwisu/i.test(tekst) && tekst.length < 200) {
    return { ok: true, jest: false, bezSerwisu: true, powod: 'Gmina nie udostępnia planów w krajowej integracji (KIMPZP). Plan sprawdź w gminnym serwisie planistycznym albo we wypisie z planu.', tekst: '', linki: [] };
  }
  const linki = [...surowe.matchAll(/href\s*=\s*["'](https?:\/\/[^"'<> ]+)["']/gi)].map(m => m[1])
    .filter(u => !/geoportal\.gov\.pl\/wss/i.test(u));
  if (tekst.replace(/[^\p{L}\p{N}]/gu, '').length < 12) {
    return { ok: true, jest: false, powod: 'Krajowa integracja planów nie pokazuje planu pod tym punktem. '
      + 'To nie przesądza, że planu nie ma — część gmin nie udostępnia planów w tej usłudze.', tekst: '', linki };
  }
  const linie = tekst.split('\n');
  const znajdz = (wzor) => { const l = linie.find(x => wzor.test(x)); return l ? otoTekst(l.replace(/^[^|:]*[|:]\s*/, '')) || otoTekst(l) : ''; };
  const uchwala = (tekst.match(/[Uu]chwał[aąy]\s+(?:[Nn]r\s*)?[^\n|]{3,120}/) || [''])[0].trim();
  const nazwa = znajdz(/^(tytu[łl]|nazwa)( planu| aktu)?\s*[|:]/i);
  return {
    ok: true, jest: true, powod: '',
    nazwa: nazwa.slice(0, 300), uchwala: uchwala.slice(0, 200),
    link: linki[0] || '', linki: linki.slice(0, 5), tekst,
  };
}

const API_OTO = {
  OVERPASS: OTO_OVERPASS, OVERPASS_ZAPAS: OTO_OVERPASS_ZAPAS, MPZP: OTO_MPZP, PROMIEN: OTO_PROMIEN, PODPIS: OTO_PODPIS, KATEGORIE: OTO_KATEGORIE,
  punktPoprawny: otoPunktPoprawny, odleglosc: otoOdleglosc, odlegloscTekst: otoOdlegloscTekst,
  zapytanie: otoZapytanie, zOdpowiedzi: otoZOdpowiedzi, opis: otoOpis, podsumowanie: otoPodsumowanie,
  mpzpUrl: otoMpzpUrl, mpzpZOdpowiedzi: otoMpzpZOdpowiedzi, htmlNaTekst: otoHtmlNaTekst,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_OTO;
if (typeof window !== 'undefined') window.OperoOtoczenie = API_OTO;

'use strict';
/* ============================================================================
   OPERO — TRANSAKCJE Z REJESTRU CEN NIERUCHOMOŚCI (usługa GUGiK)
   ----------------------------------------------------------------------------
   Od lutego 2026 Główny Urząd Geodezji i Kartografii udostępnia dane z
   Rejestru Cen Nieruchomości w serwisie geoportal.gov.pl — także jako usługę
   sieciową, bezpłatnie i bez logowania. To jest to samo źródło, z którego
   pochodzi wyciąg ze starostwa: ceny z aktów notarialnych, a nie oferty.

        usługa:  https://mapy.geoportal.gov.pl/wss/service/rcn
        WFS 2.0.0, typy: ms:lokale, ms:budynki, ms:dzialki
        układ domyślny EPSG:2180, odpowiedź w GML

   Czego ta usługa NIE daje i o czym program musi mówić wprost:

   1. NIE WSZYSTKIE POWIATY. Dane pochodzą tylko z powiatów, które je
      udostępniły — w chwili pisania około 320 z 380. Pusty wynik nie znaczy
      „nie było transakcji", tylko często „ten powiat jeszcze nie przesłał
      danych". Mylenie jednego z drugim byłoby groźne: rzeczoznawca
      napisałby w operacie, że rynek nie zawiera transakcji podobnych.

   2. TO ROZWIĄZANIE TYMCZASOWE. GUGiK zapowiada je do czasu nowelizacji
      przepisów i nie zastępuje nim usług prowadzonych przez starostów.
      Program ma więc traktować je jak wygodny skrót, a nie jak jedyną drogę —
      wyciąg ze starostwa zostaje.

   3. TO NIE JEST OFERTA. Ceny ofertowe z portali ogłoszeniowych nie są
      transakcjami i nie wolno ich mieszać z RCN. Tu pobieramy wyłącznie
      transakcje z rejestru.

   Ten moduł nie łączy się z siecią — składa adresy zapytań i rozkłada
   odpowiedź GML na transakcje w tym samym kształcie, w jakim czyta je moduł
   wyciągu RCiWN. Dzięki temu dane z Geoportalu przechodzą DOKŁADNIE tę samą
   kontrolę jakości co wyciąg ze starostwa: odrzucanie darowizn, duplikatów
   i cen rażąco odstających.
   ========================================================================= */

const USLUGA_RCN = 'https://mapy.geoportal.gov.pl/wss/service/rcn';
const TYPY_RCN = {
  lokale: { typeName: 'ms:lokale', nazwa: 'Lokale', pow: 'LOK_POW_UZYT', cena: 'LOK_CENA_BRUTTO', adres: 'LOK_ADRES' },
  budynki: { typeName: 'ms:budynki', nazwa: 'Budynki', pow: 'BUD_POW_UZYT', cena: 'BUD_CENA_BRUTTO', adres: 'BUD_ADRES' },
  dzialki: { typeName: 'ms:dzialki', nazwa: 'Działki', pow: 'DZI_POW_EWID', cena: 'DZI_CENA_BRUTTO', adres: 'DZI_ADRES' },
};
/** Ile metrów wokół punktu pytamy domyślnie. */
const RCN_PROMIEN_M = 1000;
const RCN_MAKS_OBIEKTOW = 1000;

function rcnGeoLiczba(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/\s+/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Prostokąt wokół punktu w układzie PUWG 1992. Układ jest metryczny, więc
 * promień w metrach dodaje się wprost — bez przeliczania stopni, które przy
 * 54 stopniu szerokości dawałoby prostokąt o bokach różnej długości.
 */
function rcnGeoProstokat(x, y, promien = RCN_PROMIEN_M) {
  const px = rcnGeoLiczba(x), py = rcnGeoLiczba(y), r = Math.max(100, rcnGeoLiczba(promien) || RCN_PROMIEN_M);
  if (px == null || py == null) throw new Error('Brak współrzędnych punktu.');
  return [px - r, py - r, px + r, py + r];
}

/** Adres zapytania o transakcje z prostokąta. */
function rcnGeoUrl({ typ = 'lokale', bbox, ile = RCN_MAKS_OBIEKTOW, odKtorego = 0, odDaty = '' } = {}) {
  const t = TYPY_RCN[typ];
  if (!t) throw new Error(`Nie znam rodzaju „${typ}”.`);
  if (!Array.isArray(bbox) || bbox.length !== 4) throw new Error('Brak zakresu obszaru.');
  const parametry = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature',
    TYPENAMES: t.typeName,
    SRSNAME: 'urn:ogc:def:crs:EPSG::2180',
    BBOX: `${bbox.map(v => Math.round(v)).join(',')},urn:ogc:def:crs:EPSG::2180`,
    COUNT: String(Math.min(RCN_MAKS_OBIEKTOW, Math.max(1, Number(ile) || RCN_MAKS_OBIEKTOW))),
    OUTPUTFORMAT: 'text/xml; subtype=gml/3.2.1',
  });
  if (Number(odKtorego) > 0) parametry.set('STARTINDEX', String(Math.floor(odKtorego)));
  // 3.3: filtr daty po stronie usługi (FES 2.0) — rejestr ma transakcje od lat 90.,
  // bez filtra pierwsze 1000 obiektów to bywa sama historia. BBOX idzie wtedy w filtrze.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(odDaty || ''))) {
    const r = bbox.map(v => Math.round(v));
    parametry.delete('BBOX');
    parametry.set('FILTER', '<fes:Filter xmlns:fes="http://www.opengis.net/fes/2.0" xmlns:gml="http://www.opengis.net/gml/3.2"><fes:And>'
      + `<fes:BBOX><fes:ValueReference>GEOMETRIA</fes:ValueReference><gml:Envelope srsName="urn:ogc:def:crs:EPSG::2180"><gml:lowerCorner>${r[0]} ${r[1]}</gml:lowerCorner><gml:upperCorner>${r[2]} ${r[3]}</gml:upperCorner></gml:Envelope></fes:BBOX>`
      + `<fes:PropertyIsGreaterThanOrEqualTo><fes:ValueReference>DOK_DATA</fes:ValueReference><fes:Literal>${odDaty}</fes:Literal></fes:PropertyIsGreaterThanOrEqualTo>`
      + '</fes:And></fes:Filter>');
  }
  return `${USLUGA_RCN}?${parametry.toString()}`;
}

/* --------------------------------------------------------------- czytanie */

function rcnGeoOdkoduj(t) {
  return String(t ?? '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}

/** Wartość pola z kawałka GML-a. Przestrzenie nazw pomijamy — bywają różne. */
function rcnGeoPole(xml, nazwa) {
  const m = new RegExp(`<(?:[A-Za-z0-9_]+:)?${nazwa}\\b[^>]*>([\\s\\S]*?)</(?:[A-Za-z0-9_]+:)?${nazwa}>`, 'i').exec(xml);
  if (!m) return '';
  // Pola czasowe przychodza jako gml:TimeInstant z zagniezdzonym timePosition.
  const czas = /<(?:[A-Za-z0-9_]+:)?timePosition[^>]*>([\s\S]*?)</i.exec(m[1]);
  return rcnGeoOdkoduj((czas ? czas[1] : m[1]).replace(/<[^>]*>/g, '')).trim();
}

/** Adres w formacie RCN „MSC:Gdańsk;UL:Kadetów;NR_PORZ:9" -> czytelny i rozbity. */
function rcnGeoAdresKV(v) {
  const t = String(v || '').trim();
  if (!/(^|;)\s*(MSC|UL|NR_PORZ)\s*:/i.test(t)) return null;
  const kv = {};
  for (const cz of t.split(';')) { const m = /^\s*([A-Z_]+)\s*:\s*(.*)$/i.exec(cz); if (m) kv[m[1].toUpperCase()] = m[2].trim(); }
  const msc = kv.MSC || '', ul = kv.UL || '', nr = kv.NR_PORZ || '';
  const ulica = ul ? `ul. ${ul}${nr ? ' ' + nr : ''}` : (nr ? `${msc} ${nr}`.trim() : '');
  return { tekst: [ulica, msc].filter(Boolean).join(', ') || msc, miejscowosc: msc, ulica: ul, numer: nr };
}

const RCN_SLOWNIK = {
  wolnyRynek: 'sprzedaż na wolnym rynku', sprzedazBezprzetargowa: 'sprzedaż bezprzetargowa', sprzedazZBonifikata: 'sprzedaż z bonifikatą',
  sprzedazNaCelPubliczny: 'sprzedaż na cel publiczny', sprzedazPrzetargowa: 'sprzedaż w przetargu', rynekPierwotny: 'pierwotny', rynekWtorny: 'wtórny',
  wlasnoscLokaluWrazZPrawemZwiazanym: 'własność lokalu wraz z prawem związanym', wlasnoscNieruchomosciGruntowej: 'własność nieruchomości gruntowej',
  uzytkowanieWieczyste: 'użytkowanie wieczyste', spoldzielczeWlasnosciowePrawoDoLokalu: 'spółdzielcze własnościowe prawo do lokalu',
  osobaFizyczna: 'osoba fizyczna', osobaPrawna: 'osoba prawna', jednostkaSamorzaduTerytorialnego: 'jednostka samorządu terytorialnego', skarbPanstwa: 'Skarb Państwa',
  nieruchomoscLokalowa: 'lokalowa', nieruchomoscGruntowaZabudowana: 'gruntowa zabudowana', nieruchomoscGruntowaNiezabudowana: 'gruntowa niezabudowana', nieruchomoscBudynkowa: 'budynkowa',
};
function rcnGeoSlowo(v) { const t = String(v || '').trim(); return RCN_SLOWNIK[t] || t; }

/**
 * 3.3: czy transakcja nadaje się do porównania. Zwraca '' albo powód odrzucenia.
 * `cel`: 'mieszkanie' (lokal mieszkalny), 'dom' (nieruchomość zabudowana), 'dzialka', 'inny'.
 */
function rcnGeoPrzydatnosc(t, cel = 'mieszkanie') {
  const kod = String(t.rodzajKod || '');
  if (/bezprzetarg|Bonifikat|CelPubliczny/i.test(kod) || /bezprzetarg|bonifikat|cel publiczny/i.test(String(t.rodzaj || ''))) return `nie wolny rynek (${t.rodzaj})`;
  if (t.czescUdzialowa) return `udział ${t.udzial}, nie cała nieruchomość`;
  const f = String(t.funkcja || '').toLowerCase(), rn = String(t.rodzajNieruchomosci || '').toLowerCase();
  if (cel === 'mieszkanie' && f && !/mieszk/.test(f)) return `lokal niemieszkalny (${f})`;
  if (cel === 'dom' && rn && !/gruntowa zabudowana|budynkowa/.test(rn)) return `nie nieruchomość zabudowana (${rn})`;
  if (cel === 'dom' && f && !/mieszk/.test(f)) return `budynek niemieszkalny (${f})`;
  if (cel === 'dzialka' && rn && !/gruntowa/.test(rn)) return `nie nieruchomość gruntowa (${rn})`;
  if (!(t.powierzchnia > 0) || !(t.cena > 0)) return 'brak ceny albo powierzchni';
  return '';
}

function rcnGeoDzien(v) {
  const t = String(v || '').trim();
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const pl = /(\d{2})[.\-/](\d{2})[.\-/](\d{4})/.exec(t);
  return pl ? `${pl[3]}-${pl[2]}-${pl[1]}` : '';
}

/**
 * Rozkład odpowiedzi na transakcje — w kształcie, który czyta moduł wyciągu
 * RCiWN. Jedna droga kontroli jakości dla obu źródeł.
 *
 * Cena: usługa podaje cenę całej transakcji (TRAN_CENA_BRUTTO) oraz, jeżeli
 * powiat ją rozbił, cenę samego lokalu/budynku/działki. Bierzemy tę
 * szczegółową, bo transakcja potrafi obejmować kilka nieruchomości naraz, a
 * wtedy cena łączna podzielona przez jedną powierzchnię daje liczbę bez sensu.
 */
function rcnGeoZGml(xml, typ = 'lokale') {
  const t = TYPY_RCN[typ] || TYPY_RCN.lokale;
  const tresc = String(xml || '');
  if (/<(?:[A-Za-z0-9_]+:)?(?:ExceptionReport|ServiceException)\b/i.test(tresc)) {
    const powod = rcnGeoPole(tresc, 'ExceptionText') || rcnGeoPole(tresc, 'ServiceException') || 'usługa zwróciła błąd';
    return { ok: false, powod: `Usługa Geoportalu odmówiła: ${powod}`, transakcje: [], razem: 0 };
  }
  const obiekty = tresc.match(new RegExp(`<(?:[A-Za-z0-9_]+:)?${typ}\\b[\\s\\S]*?</(?:[A-Za-z0-9_]+:)?${typ}>`, 'gi')) || [];
  const transakcje = [];
  let pominieto = 0;

  obiekty.forEach((o, i) => {
    const cenaSzczegolowa = rcnGeoLiczba(rcnGeoPole(o, t.cena));
    const cenaCalosci = rcnGeoLiczba(rcnGeoPole(o, 'TRAN_CENA_BRUTTO'));
    const cena = cenaSzczegolowa != null && cenaSzczegolowa > 0 ? cenaSzczegolowa : cenaCalosci;
    const powierzchnia = rcnGeoLiczba(rcnGeoPole(o, t.pow));
    const data = rcnGeoDzien(rcnGeoPole(o, 'DOK_DATA')) || rcnGeoDzien(rcnGeoPole(o, 'TRAN_WERSJA_ID'));
    // Adres: powiaty wypelniaja go roznie - jednym polem albo osobno ulica i numer.
    const zCzesci = [[rcnGeoPole(o, 'LOK_ULICA') || rcnGeoPole(o, 'BUD_ULICA') || rcnGeoPole(o, 'ULICA') || rcnGeoPole(o, 'NAZWA_ULICY'),
      rcnGeoPole(o, 'LOK_NR_BUD') || rcnGeoPole(o, 'NR_BUDYNKU') || rcnGeoPole(o, 'NUMER_PORZADKOWY') || rcnGeoPole(o, 'NR_PORZ')].filter(Boolean).join(' '),
      rcnGeoPole(o, 'LOK_MIEJSCOWOSC') || rcnGeoPole(o, 'MIEJSCOWOSC') || rcnGeoPole(o, 'NAZWA_MIEJSCOWOSCI')].filter(Boolean).join(', ');
    const adresSurowy = rcnGeoPole(o, t.adres) || rcnGeoPole(o, 'ADRES') || rcnGeoPole(o, 'NIER_ADRES') || zCzesci || rcnGeoPole(o, 'NIER_OPIS') || rcnGeoPole(o, 'DZI_NR_DZIALKI');
    const kv = rcnGeoAdresKV(adresSurowy);
    const adres = kv ? kv.tekst : adresSurowy;
    const rodzaj = rcnGeoPole(o, 'TRAN_RODZAJ_TRANS');
    const uwagi = [];
    if (cenaSzczegolowa == null && cenaCalosci != null) {
      uwagi.push('Cena z całej transakcji — powiat nie rozbił jej na pojedyncze nieruchomości.');
    }
    const rynek = rcnGeoSlowo(rcnGeoPole(o, 'TRAN_RODZAJ_RYNKU'));
    if (rynek) uwagi.push(`Rynek: ${rynek}.`);
    const sprzedajacy = rcnGeoSlowo(rcnGeoPole(o, 'TRAN_SPRZEDAJACY'));
    const rodzajNier = rcnGeoPole(o, 'NIER_RODZAJ');
    const udzial = rcnGeoPole(o, 'NIER_UDZIAL');
    if (udzial && !/^1\/1$|^1$/.test(udzial.trim())) uwagi.push(`Transakcja dotyczy udziału ${udzial}.`);

    if (!data || cena == null || !(powierzchnia > 0)) { pominieto++; return; }

    // Liczba izb i kondygnacja: przy doborze lokali podobnych wazy to tyle,
    // co metraz. Powiaty wypelniaja te pola nierowno, wiec brak nie jest
    // bledem - program ma wtedy powiedziec "nie wiem", a nie zgadnac.
    const izby = rcnGeoLiczba(rcnGeoPole(o, 'LOK_LICZBA_IZB')
      || rcnGeoPole(o, 'LOK_LICZBA_POKOI') || rcnGeoPole(o, 'LICZBA_IZB'));
    const kondygnacja = rcnGeoLiczba(rcnGeoPole(o, 'LOK_NR_KOND') || rcnGeoPole(o, 'LOK_KONDYGNACJA')
      || rcnGeoPole(o, 'LOK_NR_KONDYGNACJI') || rcnGeoPole(o, 'KONDYGNACJA'));
    const punkt = rcnGeoPunkt(o);

    transakcje.push({
      zrodloWiersz: i + 1,
      adres: adres || '',
      bezAdresu: !adres,
      miejscowosc: kv ? kv.miejscowosc : rcnGeoMiejscowosc(adres),
      ulica: kv ? (kv.ulica ? `ul. ${kv.ulica}${kv.numer ? ' ' + kv.numer : ''}` : '') : rcnGeoUlica(adres),
      x: punkt ? punkt.x : null,
      y: punkt ? punkt.y : null,
      pokoje: izby != null && izby > 0 ? izby : null,
      pietro: kondygnacja != null ? kondygnacja : null,
      data, cena,
      powierzchnia,
      jednostkowa: Math.round(cena / powierzchnia * 100) / 100,
      prawo: rcnGeoSlowo(rcnGeoPole(o, 'NIER_PRAWO')),
      rodzajNieruchomosci: rcnGeoSlowo(rodzajNier),
      sprzedajacy,
      idObiektu: rcnGeoPole(o, 'LOK_ID_LOKALU') || rcnGeoPole(o, 'BUD_ID_BUDYNKU') || rcnGeoPole(o, 'DZI_ID_DZIALKI'),
      idTransakcji: rcnGeoPole(o, 'TRAN_LOKALNY_ID_IIP') || rcnGeoPole(o, 'TRAN_OZNACZENIE_TRANS'),
      notariusz: rcnGeoPole(o, 'DOK_TWORCA'),
      przeznaczenieMpzp: rcnGeoPole(o, 'DZI_PRZEZN_WMPZP'),
      sposobUzytkowania: rcnGeoPole(o, 'DZI_SPOSOB_UZYT'),
      // Funkcja lokalu (mieszkalny / garaz / uzytkowy), rynek i udzial: bez nich
      // garaz albo polowa mieszkania wchodzi do porownan jako „tanie mieszkanie".
      funkcja: (rcnGeoPole(o, 'LOK_FUNKCJA') || rcnGeoPole(o, 'LOK_PRZEZNACZENIE') || rcnGeoPole(o, 'LOK_RODZAJ') || rcnGeoPole(o, 'BUD_RODZAJ') || '').toLowerCase(),
      rynek: (rynek || '').toLowerCase(),
      rodzajKod: rodzaj || '',
      udzial: (udzial || '').trim(),
      czescUdzialowa: !!(udzial && !/^1\/1$|^1$/.test(udzial.trim())),
      rodzaj: rcnGeoSlowo(rodzaj) || 'sprzedaż',
      akt: rcnGeoPole(o, 'DOK_OZNACZENIE'),
      kw: '',
      teryt: rcnGeoPole(o, 'TERYT'),
      uwagiZrodla: uwagi.join(' '),
      uwagi,
    });
  });

  // Nazwy pol pierwszego obiektu - do diagnozy, gdy powiat nazywa je inaczej,
  // niz program oczekuje (wtedy np. adres wychodzi pusty).
  const pola = obiekty.length ? [...new Set([...obiekty[0].matchAll(/<(?:[A-Za-z0-9_]+:)?([A-Za-z][A-Za-z0-9_]{2,40})\b[^>/]*>[^<]/g)].map(m => m[1]))].slice(0, 80) : [];
  return { ok: true, powod: '', transakcje, razem: obiekty.length, pominieto, pola };
}


/**
 * UZGODNIENIE OSI — obiekty z rejestru a punkt wyceny.
 *
 * Uklad panstwowy (EPSG:2180) bywa podawany w dwoch kolejnosciach: „wschod,
 * polnoc" albo „polnoc, wschod". Usluga adresowa i rejestr cen nie musza
 * uzywac tej samej. Gdy sie roznia, prostokat zapytania laduje w innej czesci
 * Polski, a program dostaje prawdziwe transakcje — tyle ze spod Lublina
 * zamiast z Gdanska. Tak wlasnie powstala wycena 4 700 zl/m2 w Gdansku.
 *
 * Nie zgadujemy, ktora kolejnosc jest wlasciwa. Sprawdzamy: obiekt, o ktory
 * pytalismy, MUSI lezec w poblizu punktu wyceny — w jednej albo w drugiej
 * kolejnosci osi. Jesli nie lezy w zadnej, to nie jest z naszego obszaru
 * i nie wolno go pokazac.
 */
function rcnGeoUzgodnij(transakcje, { x, y, promien } = {}) {
  const px = Number(x), py = Number(y), r = Math.max(100, Number(promien) || RCN_PROMIEN_M);
  const lim = r * 1.5 + 250;
  const out = [];
  let wObszarze = 0, poza = 0, bezPunktu = 0, zamienione = 0;
  for (const t of (transakcje || [])) {
    const a = Number(t.x), b = Number(t.y);
    if (t.x == null || t.y == null || !Number.isFinite(a) || !Number.isFinite(b)) { bezPunktu++; out.push({ ...t, x: null, y: null }); continue; }
    if (Math.abs(a - px) <= lim && Math.abs(b - py) <= lim) { wObszarze++; out.push({ ...t, odlegloscM: Math.round(Math.hypot(a - px, b - py)) }); }
    else if (Math.abs(b - px) <= lim && Math.abs(a - py) <= lim) { wObszarze++; zamienione++; out.push({ ...t, x: b, y: a, odlegloscM: Math.round(Math.hypot(b - px, a - py)) }); }
    else poza++;
  }
  return { transakcje: out, wObszarze, poza, bezPunktu, zamienione };
}

/** Ten sam prostokat z osiami w odwrotnej kolejnosci. */
function rcnGeoProstokatOdwrotny(bbox) { return [bbox[1], bbox[0], bbox[3], bbox[2]]; }

/**
 * Czy odpowiedz jest z WLASCIWEGO MIEJSCA w Polsce.
 *
 * Samych liczb nie da sie tu uzyc: prostokat z zamienionymi osiami oddaje
 * obiekty, ktorych wspolrzedne sa lustrzanym odbiciem naszych — liczbowo
 * wygladaja na „tuz obok". Rozstrzyga kod TERYT powiatu, ktory rejestr
 * podaje przy kazdej transakcji: musi zgadzac sie z powiatem wycenianej
 * nieruchomosci (pierwsze cztery cyfry identyfikatora dzialki).
 *
 * true  — wiekszosc transakcji jest z naszego powiatu (albo wojewodztwa),
 * false — sa z innego miejsca,
 * null  — nie da sie sprawdzic (brak kodu po ktorejs stronie).
 */
function rcnGeoZgodnyTeryt(transakcje, oczekiwany) {
  const cel = String(oczekiwany || '').replace(/\D/g, '').slice(0, 4);
  if (cel.length < 2) return null;
  const kody = (transakcje || []).map(t => String(t.teryt || '').replace(/\D/g, '')).filter(k => k.length >= 2);
  if (!kody.length) return null;
  const zgodne = kody.filter(k => k.slice(0, 2) === cel.slice(0, 2)).length;
  return zgodne >= Math.max(1, kody.length * 0.5);
}

/**
 * Wspolrzedne obiektu z GML.
 *
 * Usluga oddaje geometrie na kilka sposobow (gml:pos, gml:posList,
 * gml:coordinates, czasem tylko srodek obwiedni), a powiaty roznie ja
 * wypelniaja. Bierzemy PIERWSZA pare liczb, jaka da sie odczytac — bo do
 * doboru nieruchomosci podobnych wystarczy punkt, a nie dokladny obrys.
 *
 * To jest najwazniejsza liczba w calym doborze: bez niej program nie wie,
 * czy transakcja jest z tej samej dzielnicy, czy z drugiego konca miasta,
 * i musi zgadywac po nazwie ulicy.
 */
function rcnGeoPunkt(o) {
  const tekst = String(o || '');
  const pary = [
    /<(?:[A-Za-z0-9_]+:)?pos\b[^>]*>([^<]+)</i,
    /<(?:[A-Za-z0-9_]+:)?posList\b[^>]*>([^<]+)</i,
    /<(?:[A-Za-z0-9_]+:)?coordinates\b[^>]*>([^<]+)</i,
    /<(?:[A-Za-z0-9_]+:)?lowerCorner\b[^>]*>([^<]+)</i,
  ];
  for (const re of pary) {
    const m = tekst.match(re);
    if (!m) continue;
    const liczby = String(m[1]).trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
    if (liczby.length >= 2) return { x: liczby[0], y: liczby[1] };
  }
  return null;
}

/**
 * Ulica z adresu w rejestrze — bez numeru, bez miejscowosci, bez kodu.
 *
 * Uwaga na granice slowa po skrocie: "ul." konczy sie kropka, po ktorej
 * idzie spacja, wiec wzorzec z \b po kropce NIE trafia i skrot zostaje
 * w nazwie ulicy. Dwie nazwy, z ktorych jedna ma "ul.", a druga nie,
 * przestaja wtedy byc ta sama ulica i caly dobor po ulicy sie sypie.
 */
const RCN_SKROT_ULICY = /(^|[\s,])(?:ul|al|pl|os|ulica|aleja|aleje|plac|osiedle)\.?\s+/gi;

function rcnGeoUlica(adres) {
  const t = String(adres || '').replace(/\d{2}-\d{3}/g, ' ').trim();
  if (!t) return '';
  const czesci = t.split(',').map(x => x.trim()).filter(Boolean);
  // Adres bywa "Gdansk, ul. Kartuska 180" albo "ul. Kartuska 180, Gdansk" —
  // bierzemy te czesc, w ktorej stoi skrot ulicy, a gdy go nigdzie nie ma,
  // pierwsza niepusta.
  RCN_SKROT_ULICY.lastIndex = 0;
  const zUlica = czesci.find(x => { RCN_SKROT_ULICY.lastIndex = 0; return RCN_SKROT_ULICY.test(x); });
  const wybrana = zUlica || czesci[0] || t;
  return wybrana
    .replace(RCN_SKROT_ULICY, '$1')
    .replace(/\s+\d+[A-Za-z]?(\s*\/\s*\d+[A-Za-z]?)?\s*$/, '')
    .replace(/[\s,—-]+$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Z adresu w rejestrze wyciągamy miejscowość — bywa na początku albo na końcu. */
function rcnGeoMiejscowosc(adres) {
  const t = String(adres || '').trim();
  if (!t) return '';
  const czesci = t.split(',').map(x => x.trim()).filter(Boolean);
  if (czesci.length < 2) return '';
  const zUlica = czesci.findIndex(x => /^(ul|al|pl|os)\b\.?/i.test(x));
  if (zUlica === 0) return czesci[czesci.length - 1];
  return czesci[0];
}

/**
 * Co powiedzieć człowiekowi o wyniku. Pusty wynik ma DWA różne znaczenia i
 * program nie ma prawa ich mylić.
 */
function rcnGeoKomunikat(wynik, { powiat } = {}) {
  if (!wynik.ok) return wynik.powod;
  if (!wynik.transakcje.length) {
    return `W tym obszarze usługa Geoportalu nie zwróciła żadnej transakcji. To nie znaczy, że ich nie było: `
      + `rejestr obejmuje tylko powiaty, które przesłały dane (w 2026 r. około 320 z 380)${powiat ? `, a ten operat dotyczy powiatu ${powiat}` : ''}. `
      + `Sprawdź wyciąg ze starostwa albo rozszerz obszar.`;
  }
  const bezCeny = wynik.pominieto ? ` Pominięto ${wynik.pominieto} pozycji bez kompletu: daty, ceny albo powierzchni.` : '';
  return `Z Rejestru Cen Nieruchomości pobrano ${wynik.transakcje.length} ${wynik.transakcje.length === 1 ? 'transakcję' : 'transakcji'}.${bezCeny}`
    + ` To ceny z aktów notarialnych, nie oferty — ale dobór nieruchomości podobnych i tak należy do Ciebie.`;
}

/** Zdanie do operatu: skąd te dane pochodzą. Źródło musi dać się wskazać. */
function rcnGeoOpisZrodla(data = new Date()) {
  const d = new Date(data).toISOString().slice(0, 10);
  return `Rejestr Cen Nieruchomości — dane udostępniane przez Główny Urząd Geodezji i Kartografii `
    + `w serwisie geoportal.gov.pl (usługa ${USLUGA_RCN}), pobrane ${d}.`;
}

const API_RCNGEO = {
  punkt: rcnGeoPunkt, ulica: rcnGeoUlica,
  USLUGA: USLUGA_RCN, TYPY: TYPY_RCN, PROMIEN_M: RCN_PROMIEN_M, MAKS_OBIEKTOW: RCN_MAKS_OBIEKTOW,
  prostokat: rcnGeoProstokat, przydatnosc: rcnGeoPrzydatnosc, adresKV: rcnGeoAdresKV, slowo: rcnGeoSlowo, uzgodnij: rcnGeoUzgodnij, prostokatOdwrotny: rcnGeoProstokatOdwrotny, zgodnyTeryt: rcnGeoZgodnyTeryt, urlTransakcji: rcnGeoUrl, zGml: rcnGeoZGml, komunikat: rcnGeoKomunikat,
  opisZrodla: rcnGeoOpisZrodla, pole: rcnGeoPole, dzien: rcnGeoDzien, miejscowoscZAdresu: rcnGeoMiejscowosc,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_RCNGEO;
if (typeof window !== 'undefined') window.OperoRcnGeo = API_RCNGEO;

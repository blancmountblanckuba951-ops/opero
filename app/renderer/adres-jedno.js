'use strict';
/* ============================================================================
   OPERO — JEDNA RUBRYKA NA ADRES
   ----------------------------------------------------------------------------
   Dotąd adres wpisywało się w pięciu polach: województwo, powiat, gmina,
   miejscowość, ulica, numer. Sześć razy to samo, przy każdym operacie, i
   za każdym razem z ryzykiem, że jedno pole zostanie z poprzedniej sprawy.

   Teraz jest jedna rubryka: wpisujesz ULICĘ. Program sam szuka w państwowym
   rejestrze punktów adresowych, w jakim to jest mieście i w jakiej dzielnicy,
   i sam dopisuje gminę, powiat, województwo i kod pocztowy. Numer podajesz
   osobno — bo numer rozstrzyga o nieruchomości i nie wolno go zgadywać.

   TRZY ZASADY, KTÓRYCH TEN MODUŁ NIE ŁAMIE

   1. NUMER MUSI SIĘ ZGADZAĆ CO DO ZNAKU. „Długa 1" i „Długa 12" to dwie różne
      nieruchomości, dwóch różnych właścicieli i dwie różne księgi wieczyste.
      Dopasowanie „zaczyna się od" byłoby tu najgroźniejszym rodzajem pomocy:
      wyglądałoby na trafione.

   2. JEDNA ULICA W KILKU MIASTACH TO PYTANIE, NIE DOMYSŁ. „Kartuska" jest
      w Gdańsku i w kilkunastu innych miejscach. Program, który wybrałby
      pierwszą z listy, wstawiłby do operatu obcą miejscowość.

   3. CO PROGRAM DOPISAŁ SAM, TO JEST OZNACZONE. Rzeczoznawca podpisuje operat
      własnym nazwiskiem; musi widzieć, która część adresu jest jego, a która
      z rejestru — i móc ją poprawić.
   ========================================================================= */

const AJ_USLUGA = 'https://services.gugik.gov.pl/uug/';
/** Od ilu znaków warto pytać usługę. Krócej to nie nazwa ulicy, a litera. */
const AJ_OD_ZNAKOW = 3;
const AJ_MAKS = 20;
/** Ile \u201emoich miast\u201d dopytujemy, gdy czlowiek nie podal miejscowosci. */
const AJ_MAKS_MIAST = 4;

const AJ_PRZEDROSTKI = /^(ul|ulica|al|aleja|aleje|pl|plac|os|osiedle|rondo|skwer|bulwar|droga|szosa)\b\.?\s*/i;

function ajTekst(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }

function ajUprosc(tekst) {
  return String(tekst || '')
    .toLowerCase().replace(/ł/g, 'l')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Nazwa ulicy bez przedrostka — „ul. Długa" i „Długa" to ta sama ulica. */
function ajNazwaUlicy(tekst) {
  return ajTekst(String(tekst || '').replace(AJ_PRZEDROSTKI, ''));
}

/**
 * Numer nieruchomości: „12", „12A", „1C", „12/3", „12 m 5". Numer MUSI mieć
 * cyfrę — inaczej „Kartuska Nowa" rozpadłoby się na ulicę „Kartuska"
 * i numer „Nowa".
 */
function ajCzyNumer(kawalek) {
  const t = ajTekst(kawalek);
  return /\d/.test(t) && /^\d+[a-zA-Z]?(\s*[/m]\s*\d+[a-zA-Z]?)?$/.test(t.replace(/\s*m\.\s*/i, ' m '));
}

function ajCzyKod(kawalek) { return /^\d{2}-\d{3}$/.test(ajTekst(kawalek)); }

/**
 * Rozbiór tego, co człowiek wpisał w jedną rubrykę. Wpisuje różnie:
 *   „Kartuska"                          → tylko ulica
 *   „ul. Kartuska 201"                  → ulica i numer
 *   „Kartuska 201, 80-125 Gdańsk"       → wszystko
 *   „Gdańsk, Kartuska 201"              → miasto z przodu
 * Program ma to przyjąć w każdej z tych postaci, bo inaczej rubryka „jedno
 * pole" byłaby rubryką „jedno pole, ale po mojemu".
 */
function ajRozbij(wejscie) {
  const surowe = ajTekst(wejscie);
  const wynik = { ulica: '', numer: '', miasto: '', kod: '', surowe };
  if (!surowe) return wynik;

  let czesci = surowe.split(',').map(x => ajTekst(x)).filter(Boolean);

  // Kod pocztowy wyjmujemy pierwszy - jest nie do pomylenia z niczym innym.
  // Po polsku kod STOI PRZED miejscowoscia („80-125 Gdansk"), wiec jesli po
  // wyjeciu kodu w tym samym kawalku zostala nazwa bez cyfr, to jest miasto.
  // Bez tej reguly „80-125 Gdansk, Kartuska" dalaby miasto „Kartuska".
  czesci = czesci.map(cz => {
    const m = /\b(\d{2}-\d{3})\b/.exec(cz);
    if (!m) return cz;
    wynik.kod = m[1];
    const reszta = ajTekst(cz.replace(m[1], ''));
    if (reszta && !/\d/.test(reszta) && !wynik.miasto) wynik.miasto = reszta;
    return reszta && /\d/.test(reszta) ? reszta : '';
  }).filter(Boolean);

  if (!wynik.miasto && czesci.length >= 2) {
    // Miastem jest ta czesc, w ktorej NIE MA cyfr - przy dwoch takich bierzemy
    // ostatnia, bo tak zapisuje sie adres po polsku.
    const bezCyfr = czesci.filter(cz => !/\d/.test(cz));
    const zCyframi = czesci.filter(cz => /\d/.test(cz));
    if (bezCyfr.length && zCyframi.length) {
      wynik.miasto = bezCyfr[bezCyfr.length - 1];
      czesci = zCyframi;
    } else {
      wynik.miasto = czesci[czesci.length - 1];
      czesci = czesci.slice(0, -1);
    }
  } else if (wynik.miasto && czesci.length) {
    czesci = czesci.filter(cz => ajUprosc(cz) !== ajUprosc(wynik.miasto));
  }

  const reszta = ajTekst(czesci.join(' ')).replace(AJ_PRZEDROSTKI, '');
  // Numer stoi na koncu i jest jednym wyrazeniem: „12", „12A", „12/3",
  // „12 m 5", „1C". Bierzemy go jednym chwytem, zeby „Dluga 1 m 5" nie
  // rozpadlo sie na ulice „Dluga 1 m" i numer „5".
  const mNum = /(?:^|\s)(\d+\s*[a-zA-Z]?(?:\s*(?:\/|m\.?)\s*\d+\s*[a-zA-Z]?)*)$/.exec(reszta);
  if (mNum && ajTekst(reszta.slice(0, mNum.index))) {
    wynik.numer = ajTekst(mNum[1]).replace(/\s*\/\s*/g, '/').replace(/\s*m\.?\s*/i, ' m ').replace(/\s+/g, ' ').trim();
    wynik.ulica = ajTekst(reszta.slice(0, mNum.index));
  } else {
    wynik.ulica = reszta;
  }
  return wynik;
}

/* --------------------------------------------------------------- zapytanie */

/**
 * Adres zapytania do usługi. Numer DOŁĄCZAMY, gdy go znamy — usługa zwraca
 * wtedy ten jeden punkt adresowy z kodem i współrzędnymi, zamiast całej ulicy.
 */
/**
 * Jedno zapytanie do usługi geokodowania.
 *
 * Numer DOŁĄCZAMY, gdy go znamy — usługa zwraca wtedy ten jeden punkt
 * adresowy z kodem i współrzędnymi, zamiast całej ulicy.
 */
function ajZapytanie({ ulica = '', numer = '', miasto = '' } = {}) {
  const u = ajNazwaUlicy(ulica);
  if (ajUprosc(u).length < AJ_OD_ZNAKOW) return null;
  const czesci = [];
  if (ajTekst(miasto)) czesci.push(ajTekst(miasto));
  czesci.push(ajTekst(numer) ? `${u} ${ajTekst(numer)}` : u);
  return `${AJ_USLUGA}?request=GetAddress&address=${encodeURIComponent(czesci.join(', '))}`;
}

/**
 * KILKA zapytań zamiast jednego — bo tak wygląda prawdziwe wpisywanie adresu.
 *
 * Rzeczoznawca pisze „chrzanowskiego", a ulica nazywa się „Bernarda
 * Chrzanowskiego". Geokoder, który dostaje samo nazwisko bez miejscowości,
 * zwraca pustkę — i program melduje „nie ma takiej ulicy", choć ulica jest.
 * To najgorszy rodzaj odpowiedzi: nieprawdziwy i brzmiący stanowczo.
 *
 * Dlatego pytamy na kilka sposobów i scalamy wyniki:
 *
 *   1. tak, jak człowiek wpisał — najczęściej wystarcza,
 *   2. z miejscowością, którą program już zna (z operatu albo z pola obok) —
 *      z nią geokoder trafia nawet w sam człon nazwiska,
 *   3. z dopiskiem „ulica" — usługa inaczej traktuje frazę, o której wie,
 *      że jest nazwą ulicy, niż gołe słowo,
 *   4. z miastami, w których rzeczoznawca już pracował — bo wycenia zwykle
 *      w kilku tych samych miejscach, a nie w całej Polsce.
 *
 * Kolejność ma znaczenie: pierwsze zapytanie jest najtańsze i najczęściej
 * trafne, więc dalsze lecą tylko wtedy, gdy wcześniejsze nic nie dały.
 */
function ajZapytania({ ulica = '', numer = '', miasto = '', znaneMiasta = [] } = {}) {
  const u = ajNazwaUlicy(ulica);
  if (ajUprosc(u).length < AJ_OD_ZNAKOW) return [];
  const rozbite = ajRozbij(ulica);
  const miastoZPola = ajTekst(miasto) || rozbite.miasto;
  const lista = [];
  const dodaj = (opis, q) => {
    const url = ajZapytanie(q);
    if (!url || lista.some(x => x.url === url)) return;
    lista.push({ opis, url, miasto: q.miasto || '' });
  };

  dodaj('tak, jak wpisałeś', { ulica: u, numer, miasto: miastoZPola });
  if (!miastoZPola) {
    for (const m of (znaneMiasta || []).slice(0, AJ_MAKS_MIAST)) {
      if (!ajTekst(m)) continue;
      dodaj(ajTekst(m), { ulica: u, numer, miasto: m });
    }
  }
  return lista;
}

/**
 * Odpowiedź usługi na pełne punkty adresowe. Usługa raz oddaje listę, raz
 * obiekt z kluczami „1", „2" — i raz nazywa dzielnicę `district`, a raz
 * `simc`/`city`. Czytamy tolerancyjnie, bo program ma pracować dalej także
 * wtedy, gdy GUGiK coś u siebie przestawi.
 */
function ajZOdpowiedzi(odpowiedz) {
  let dane = odpowiedz;
  if (typeof odpowiedz === 'string') {
    try { dane = JSON.parse(odpowiedz.replace(/^﻿/, '')); } catch { return []; }
  }
  const surowe = dane?.results ?? dane?.result ?? dane;
  const lista = Array.isArray(surowe) ? surowe : (surowe && typeof surowe === 'object') ? Object.values(surowe) : [];
  const widziane = new Set();
  const out = [];
  for (const w of lista) {
    if (!w || typeof w !== 'object') continue;
    const miasto = ajTekst(w.city ?? w.miejscowosc ?? w.locality ?? '');
    const ulica = ajNazwaUlicy(w.street ?? w.ulica ?? '');
    if (!miasto && !ulica) continue;
    const kandydat = {
      ulica, miasto,
      numer: ajTekst(w.number ?? w.numer ?? ''),
      dzielnica: ajTekst(w.district ?? w.dzielnica ?? w.city_part ?? w.czescMiejscowosci ?? ''),
      gmina: ajTekst(w.commune ?? w.gmina ?? ''),
      powiat: ajTekst(w.county ?? w.powiat ?? ''),
      wojewodztwo: ajTekst(w.voivodeship ?? w.wojewodztwo ?? w.province ?? ''),
      kod: ajTekst(w.code ?? w.kod ?? w.postcode ?? ''),
      teryt: ajTekst(w.teryt ?? w.simc ?? ''),
      x: Number(w.x ?? w.X), y: Number(w.y ?? w.Y),
      zrodlo: 'gugik',
    };
    const klucz = ajUprosc(`${kandydat.ulica}|${kandydat.numer}|${kandydat.miasto}|${kandydat.dzielnica}`);
    if (widziane.has(klucz)) continue;
    widziane.add(klucz);
    out.push(kandydat);
  }
  return out.slice(0, AJ_MAKS);
}

/* ----------------------------------------------------------- rozstrzyganie */

/**
 * Czy ta pozycja jest tą ulicą, o którą człowiek pytał.
 *
 * Geokoder bywa hojny: zapytany o „chrzanowskiego" w Gdańsku odda i
 * „Bernarda Chrzanowskiego", i kilka pozycji, które z tą nazwą nie mają nic
 * wspólnego — bo dopasował miejscowość albo kod. Gdyby program pokazał je
 * wszystkie, lista ulic przestałaby być listą ulic.
 *
 * Dopasowujemy więc po FRAGMENCIE nazwy, w obie strony: „chrzanowskiego"
 * pasuje do „Bernarda Chrzanowskiego", a „bernarda chrzanowskiego" pasuje do
 * „Chrzanowskiego". Tak właśnie pisze człowiek: raz samo nazwisko, raz całość.
 */
function ajPasujeDoFrazy(kandydat, fraza) {
  const f = ajUprosc(ajNazwaUlicy(fraza));
  if (!f) return true;
  const u = ajUprosc(kandydat?.ulica || '');
  if (!u) return false;
  if (u.includes(f) || f.includes(u)) return true;
  // Kazde slowo frazy musi znalezc swoj odpowiednik w nazwie ulicy - po
  // rdzeniu, bo po polsku to samo slowo stoi raz w mianowniku, raz w dopelniaczu.
  const slowaF = f.split(' ').filter(Boolean);
  const slowaU = u.split(' ').filter(Boolean);
  return slowaF.every(sf => slowaU.some(su => {
    const n = Math.min(sf.length, su.length);
    if (n < 4) return sf === su;
    return sf.slice(0, n - 1) === su.slice(0, n - 1);
  }));
}

/** Odsiew pozycji, które z wpisaną nazwą nie mają nic wspólnego. */
function ajOdsiejDoFrazy(kandydaci = [], fraza) {
  const f = ajUprosc(ajNazwaUlicy(fraza));
  if (!f) return kandydaci.slice();
  const pasujace = kandydaci.filter(k => ajPasujeDoFrazy(k, fraza));
  // Gdy NIC nie pasuje, oddajemy wszystko: lepiej pokazac czlowiekowi, co
  // usluga zwrocila, niz powiedziec mu, ze nie ma nic.
  return pasujace.length ? pasujace : kandydaci.slice();
}

/** Numer musi się zgadzać CO DO ZNAKU. Nie „zaczyna się od", nie „zawiera". */
function ajPasujeNumer(kandydat, numer) {
  const szukany = ajUprosc(numer).replace(/\s+/g, '');
  if (!szukany) return true;
  return ajUprosc(kandydat?.numer || '').replace(/\s+/g, '') === szukany;
}

/**
 * Miejsca: ta sama nazwa ulicy potrafi być w wielu miastach i dzielnicach,
 * a przy wpisanym kawałku nazwy („Kartu") usługa odda kilka RÓŻNYCH ulic.
 * Dlatego grupujemy po ULICY i miejscu razem — człowiek ma zobaczyć listę
 * prawdziwych ulic z miastami i wskazać tę swoją, zamiast zgadywać, którą
 * z nich program sobie wybrał.
 */
function ajMiejsca(kandydaci = []) {
  const mapa = new Map();
  for (const k of kandydaci) {
    const klucz = ajUprosc(`${k.ulica}|${k.miasto}|${k.dzielnica}`);
    if (!mapa.has(klucz)) {
      mapa.set(klucz, {
        ulica: k.ulica,
        miasto: k.miasto, dzielnica: k.dzielnica, gmina: k.gmina, powiat: k.powiat,
        wojewodztwo: k.wojewodztwo, kod: k.kod, ile: 0, numery: [], przyklad: k,
      });
    }
    const m = mapa.get(klucz);
    m.ile++;
    if (k.numer && !m.numery.includes(k.numer)) m.numery.push(k.numer);
    if (!m.kod && k.kod) m.kod = k.kod;
  }
  return [...mapa.values()].sort((a, b) => b.ile - a.ile);
}

/**
 * Co program ma zrobić z tym, co znalazł.
 *
 *   'brak'  — nic nie znaleziono; adres wpisuje człowiek ręcznie,
 *   'jedno' — jedno miejsce; program wypełnia pola i mówi, co wypełnił,
 *   'wybor' — kilka miejsc; program PYTA i nie wybiera za człowieka.
 *
 * Trzeci przypadek jest sednem tego modułu. Wybranie pierwszego z listy
 * byłoby wygodniejsze i raz na kilka razy wstawiłoby do operatu obce miasto.
 */
function ajRozstrzygnij(kandydaci = [], { numer = '', ulica = '' } = {}) {
  // Najpierw odsiewamy to, co z wpisana nazwa nie ma nic wspolnego - dopiero
  // potem patrzymy na numer. Odwrotna kolejnosc dalaby liste adresow z innych
  // ulic, ktore przypadkiem maja ten sam numer.
  const zFrazy = ajOdsiejDoFrazy(kandydaci, ulica);
  const pasujace = ajTekst(numer)
    ? zFrazy.filter(k => ajPasujeNumer(k, numer))
    : zFrazy.slice();
  const uzyte = pasujace.length ? pasujace : zFrazy.slice();
  const miejsca = ajMiejsca(uzyte);
  const nazwaUlicy = ajNazwaUlicy(ulica || uzyte[0]?.ulica || '');

  if (!miejsca.length) {
    return {
      stan: 'brak', miejsca: [], wybrane: null, kandydaci: [],
      numerNieZnaleziony: false,
      pytanie: nazwaUlicy
        ? `W rejestrze punktów adresowych nie ma ulicy „${nazwaUlicy}". Sprawdź pisownię albo wpisz miejscowość i ulicę osobno — program nie zgaduje adresów.`
        : 'Wpisz nazwę ulicy — od trzech znaków program zacznie szukać.',
    };
  }

  const numerNieZnaleziony = Boolean(ajTekst(numer)) && pasujace.length === 0;

  if (miejsca.length === 1) {
    const m = miejsca[0];
    // Nazwe ulicy bierzemy Z REJESTRU, a nie z tego, co czlowiek wpisal:
    // wpisal „Kartu", a ulica nazywa sie „Kartuska" i tak ma stac w operacie.
    const dokladny = uzyte.find(k => ajPasujeNumer(k, numer)) || m.przyklad;
    return {
      stan: 'jedno', miejsca, kandydaci: uzyte, wybrane: { ...dokladny, ulica: m.ulica || nazwaUlicy || dokladny.ulica },
      numerNieZnaleziony,
      pytanie: numerNieZnaleziony
        ? `Ulica „${nazwaUlicy}" jest w ${ajOpisMiejsca(m)}, ale numeru ${ajTekst(numer)} w rejestrze pod nią nie ma. `
          + 'Sprawdź numer — program go nie podmieni, bo inny numer to inna nieruchomość.'
        : '',
    };
  }

  return {
    stan: 'wybor', miejsca, kandydaci: uzyte, wybrane: null, numerNieZnaleziony,
    pytanie: `Pod „${nazwaUlicy}" rejestr ma ${miejsca.length} ${miejsca.length < 5 ? 'pozycje' : 'pozycji'}: `
      + `${miejsca.slice(0, 5).map(m => ajOpisMiejsca(m, { zUlica: true })).join('; ')}`
      + `${miejsca.length > 5 ? ' i dalszych' : ''}. Które z nich? Program nie wybierze za Ciebie — obca miejscowość w operacie to błąd, którego nie widać.`,
  };
}

function ajOpisMiejsca(m, { zUlica = false } = {}) {
  if (!m) return '';
  const czesci = [];
  if (zUlica && m.ulica) czesci.push(`ul. ${m.ulica}`);
  czesci.push(m.miasto);
  if (m.dzielnica && ajUprosc(m.dzielnica) !== ajUprosc(m.miasto)) czesci.push(`dzielnica ${m.dzielnica}`);
  if (m.powiat && ajUprosc(m.powiat) !== ajUprosc(m.miasto)) czesci.push(`pow. ${m.powiat}`);
  if (m.wojewodztwo) czesci.push(`woj. ${m.wojewodztwo.toLowerCase()}`);
  return czesci.filter(Boolean).join(', ');
}

/** Adres jednym zdaniem — tak, jak pójdzie do operatu. */
function ajPelny({ ulica = '', numer = '', kod = '', miasto = '', dzielnica = '' } = {}) {
  const u = ajNazwaUlicy(ulica);
  const pierwsza = [u && `ul. ${u}`, ajTekst(numer)].filter(Boolean).join(' ');
  const druga = [ajTekst(kod), ajTekst(miasto)].filter(Boolean).join(' ');
  const trzecia = dzielnica && ajUprosc(dzielnica) !== ajUprosc(miasto) ? `dzielnica ${ajTekst(dzielnica)}` : '';
  return [pierwsza, druga, trzecia].filter(Boolean).join(', ');
}

/**
 * Które pola program wypełnił sam. To nie jest ozdoba interfejsu: pod operatem
 * podpisuje się człowiek, więc musi widzieć, co dopisał rejestr, i móc to
 * poprawić bez szukania, gdzie to się wzięło.
 */
function ajUzupelnione(przed = {}, po = {}) {
  const pola = ['ulica', 'numer', 'kod', 'miasto', 'dzielnica', 'gmina', 'powiat', 'wojewodztwo'];
  return pola.filter(p => !ajTekst(przed[p]) && ajTekst(po[p]));
}

function ajKomunikat(rozstrzygniecie, { numer = '' } = {}) {
  if (!rozstrzygniecie) return '';
  if (rozstrzygniecie.stan !== 'jedno') return rozstrzygniecie.pytanie;
  const w = rozstrzygniecie.wybrane || {};
  const gdzie = ajOpisMiejsca(rozstrzygniecie.miejsca[0]);
  const ogon = rozstrzygniecie.pytanie ? ` ${rozstrzygniecie.pytanie}` : '';
  return `Znalazłem: ${gdzie}.${ajTekst(numer) && !rozstrzygniecie.numerNieZnaleziony
    ? ` Numer ${ajTekst(numer)} jest w rejestrze${w.kod ? `, kod ${w.kod}` : ''}.` : ''}`
    + ' Uzupełniłem gminę, powiat i województwo z rejestru — sprawdź je i popraw, jeżeli trzeba.' + ogon;
}

const API_AJ = {
  USLUGA: AJ_USLUGA, OD_ZNAKOW: AJ_OD_ZNAKOW, MAKS: AJ_MAKS,
  rozbij: ajRozbij, zapytanie: ajZapytanie, zapytania: ajZapytania, zOdpowiedzi: ajZOdpowiedzi,
  MAKS_MIAST: AJ_MAKS_MIAST,
  rozstrzygnij: ajRozstrzygnij, miejsca: ajMiejsca, pasujeNumer: ajPasujeNumer,
  pasujeDoFrazy: ajPasujeDoFrazy, odsiejDoFrazy: ajOdsiejDoFrazy,
  pelny: ajPelny, opisMiejsca: ajOpisMiejsca, uzupelnione: ajUzupelnione, komunikat: ajKomunikat,
  nazwaUlicy: ajNazwaUlicy, czyNumer: ajCzyNumer, czyKod: ajCzyKod, uprosc: ajUprosc,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_AJ;
if (typeof window !== 'undefined') window.OperoAdres = API_AJ;

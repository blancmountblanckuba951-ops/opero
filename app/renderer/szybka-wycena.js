'use strict';
/* ============================================================================
   OPERO — SZYBKA WYCENA (Express)
   ----------------------------------------------------------------------------
   Kilka danych — adres, powierzchnia, pokoje, piętro, stan — i od razu
   orientacyjna wartość z przedziałem. Tak jak w programach do szybkiej
   wyceny, z jedną różnicą: tu widać, Z CZEGO wynik powstał.

   JAK LICZY
     1. Bierze transakcje z Rejestru Cen Nieruchomości i z własnej bazy.
     2. Wybiera podobne tym samym modułem doboru co pełny operat
        (położenie, powierzchnia, pokoje, piętro, czas).
     3. Z cen za m² podobnych transakcji liczy dolny kwartyl, medianę
        i górny kwartyl.
     4. Stan lokalu wskazuje miejsce w tym przedziale: do remontu — dolny
        kwartyl, przeciętny — mediana, dobry — między medianą a górnym
        kwartylem, wysoki — górny kwartyl.

   CZEGO NIE ROBI
     * Nie stosuje wymyślonych współczynników („+7% za balkon"). Jedyną
       korektą jest położenie w rozrzucie cen, który pokazał sam rynek.
     * Nie udaje operatu. To szacunek orientacyjny: bez oględzin, bez badania
       księgi, bez cech i wag. Do banku ani sądu się nie nadaje.
     * Przy mniej niż trzech podobnych transakcjach nie podaje liczby wcale.
   ========================================================================= */

const SW_STANY = [
  { id: 'remont', nazwa: 'do remontu', opis: 'dolny kwartyl cen podobnych lokali' },
  { id: 'przecietny', nazwa: 'przeciętny', opis: 'mediana cen podobnych lokali' },
  { id: 'dobry', nazwa: 'dobry', opis: 'między medianą a górnym kwartylem' },
  { id: 'wysoki', nazwa: 'wysoki standard', opis: 'górny kwartyl cen podobnych lokali' },
];
const SW_MIN = 3;

/** Kwantyl z interpolacją liniową (lista posortowana rosnąco). */
function swKwantyl(posortowane, q) {
  const n = posortowane.length;
  if (!n) return null;
  if (n === 1) return posortowane[0];
  const poz = (n - 1) * q, d = Math.floor(poz), g = Math.ceil(poz);
  return posortowane[d] + (posortowane[g] - posortowane[d]) * (poz - d);
}

function swZaokr(x, do_ = 1000) { return Math.round(x / do_) * do_; }

/**
 * Szybka wycena z listy transakcji.
 * `dobierz` to funkcja doboru z modułu szukania (ta sama co w pełnym operacie).
 */
function swWycen(pozycje, kryteria, { stan = 'przecietny', dobierz } = {}) {
  const pow = Number(kryteria && kryteria.powierzchnia) || 0;
  if (!(pow > 0)) return { ok: false, powod: 'Podaj powierzchnię lokalu.' };
  if (typeof dobierz !== 'function') return { ok: false, powod: 'Brak modułu doboru transakcji.' };
  const d = dobierz(Array.isArray(pozycje) ? pozycje : [], kryteria);
  let uzyte = (d.pasujace || []).slice();
  let zZapasem = false;
  // Za mało wzorcowych: dobieramy z zapasu (dalsze dopasowanie) i mówimy o tym.
  if (uzyte.length < 5 && (d.zZapasu || []).length) { uzyte = uzyte.concat(d.zZapasu); zZapasem = true; }
  uzyte = uzyte.filter(t => Number(t.jednostkowa) > 0 && t.rodzajZrodla !== 'oferty');
  if (uzyte.length < SW_MIN) {
    return { ok: false, ile: uzyte.length, sprawdzono: (pozycje || []).length,
      powod: uzyte.length
        ? `Znalazłem tylko ${uzyte.length} ${uzyte.length === 1 ? 'podobną transakcję' : 'podobne transakcje'} — to za mało, żeby uczciwie podać wartość. Poszerz promień albo odchyłkę powierzchni.`
        : 'Nie znalazłem podobnych transakcji dla tego adresu. Sprawdź adres albo poszerz kryteria.' };
  }
  const ceny = uzyte.map(t => Number(t.jednostkowa)).sort((a, b) => a - b);
  const q1 = swKwantyl(ceny, 0.25), med = swKwantyl(ceny, 0.5), q3 = swKwantyl(ceny, 0.75);
  const jedn = stan === 'remont' ? q1 : stan === 'dobry' ? (med + q3) / 2 : stan === 'wysoki' ? q3 : med;
  const rozrzut = med ? (q3 - q1) / med : 0;
  const n = uzyte.length;
  const pewnosc = (n >= 8 && rozrzut <= 0.15 && !zZapasem) ? 'wysoka' : (n >= 5 && rozrzut <= 0.25) ? 'średnia' : 'niska';
  const s = SW_STANY.find(x => x.id === stan) || SW_STANY[1];
  const najlepsze = uzyte.slice().sort((a, b) => ((b.dobor && b.dobor.punkty) || 0) - ((a.dobor && a.dobor.punkty) || 0)).slice(0, 6);
  return {
    ok: true, ile: n, sprawdzono: (pozycje || []).length, zZapasem,
    jednostkowa: Math.round(jedn), wartosc: swZaokr(jedn * pow),
    od: swZaokr(q1 * pow), do: swZaokr(q3 * pow),
    q1: Math.round(q1), mediana: Math.round(med), q3: Math.round(q3),
    rozrzutPct: Math.round(rozrzut * 1000) / 10, pewnosc,
    stan: s.id, stanOpis: s.opis,
    transakcje: najlepsze.map(t => ({ adres: t.adres || '', data: t.data || '', powierzchnia: t.powierzchnia, cena: t.cena,
      jednostkowa: Math.round(Number(t.jednostkowa)), punkty: (t.dobor && t.dobor.punkty) || null, zrodlo: t.zrodloNazwa || t.zrodlo || '',
      pokoje: t.pokoje ?? null, pietro: t.pietro ?? null, rynek: t.rynek || '', odlegloscM: t.odlegloscM ?? null })),
    uzyte,
  };
}

/** Porównanie z ceną ofertową: o ile procent oferta różni się od szacunku. */
function swOferta(wynik, cenaOfertowa) {
  const c = Number(cenaOfertowa) || 0;
  if (!wynik || !wynik.ok || !(c > 0)) return null;
  const pct = Math.round((c / wynik.wartosc - 1) * 1000) / 10;
  const wPrzedziale = c >= wynik.od && c <= wynik.do;
  return { cena: c, pct, wPrzedziale,
    zdanie: wPrzedziale ? 'Cena ofertowa mieści się w przedziale cen podobnych lokali.'
      : pct > 0 ? `Cena ofertowa jest o ${String(Math.abs(pct)).replace('.', ',')}% wyższa od szacunku i powyżej górnego kwartyla rynku.`
        : `Cena ofertowa jest o ${String(Math.abs(pct)).replace('.', ',')}% niższa od szacunku i poniżej dolnego kwartyla rynku.` };
}

const API_SW = { STANY: SW_STANY, MIN: SW_MIN, kwantyl: swKwantyl, wycen: swWycen, oferta: swOferta };
if (typeof module !== 'undefined' && module.exports) module.exports = API_SW;
if (typeof window !== 'undefined') window.OperoSzybka = API_SW;

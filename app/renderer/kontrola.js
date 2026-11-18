'use strict';
/**
 * OPERO 1.11.0 — kontrola operatu w trakcie pracy.
 *
 * Do tej pory OPERO mówiło tylko, czego BRAKUJE. To za mało: operat bywa
 * kompletny i jednocześnie zły — daty w złej kolejności, jedna cecha z wagą 0,7
 * bez słowa uzasadnienia, wartość poza przedziałem Cmin–Cmax, oględziny sprzed
 * roku. Takie rzeczy wychodzą dopiero u zamawiającego albo w sądzie.
 *
 * Ten moduł ocenia operat na trzy sposoby i każdy z nich nazywa po imieniu:
 *   • zrobione dobrze  — żeby było widać, co już jest w porządku,
 *   • uwaga            — da się wygenerować PDF, ale coś woła o wyjaśnienie,
 *   • błąd             — tego nie wolno zostawić.
 *
 * Czego moduł NIE robi: nie poprawia niczego sam i nie podejmuje decyzji
 * zawodowej. Mówi, co widzi, i wskazuje krok, w którym się to naprawia.
 */

const ASPEKTY = [
  ['przedmiot', 'Przedmiot i cel wyceny'],
  ['daty', 'Daty'],
  ['prawny', 'Stan prawny'],
  ['rynek', 'Rynek i jego analiza'],
  ['zbior', 'Zbiór porównawczy'],
  ['cechy', 'Cechy i wagi'],
  ['wynik', 'Wynik i jego kontrola'],
  ['zrodla', 'Źródła, podstawy i klauzule'],
];

// Który krok kreatora odpowiada za który aspekt — po to, żeby z listy kontroli
// dało się kliknąć prosto w miejsce, w którym rzecz się naprawia.
const KROK_ASPEKTU = {
  przedmiot: 'project', daty: 'project', prawny: 'legal', rynek: 'market',
  zbior: 'market', cechy: 'features', wynik: 'result', zrodla: 'clauses',
};
const ASPEKT_KROKU = {
  project: 'przedmiot', legal: 'prawny', egib: 'przedmiot', building: 'przedmiot',
  local: 'przedmiot', market: 'rynek', features: 'cechy', clauses: 'zrodla',
  income: 'wynik', modul: 'wynik', result: 'wynik',
};

function liczba(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function jest(v) { return v != null && String(v).trim() !== ''; }
function doDnia(v) { const d = new Date(v); return isNaN(d) ? null : d; }
function dni(a, b) {
  const x = doDnia(a), y = doDnia(b);
  return (x && y) ? Math.round((y - x) / 86400000) : null;
}
/** Liczba po polsku. W operacie wszystko ma przecinek dziesietny, wiec opinia
 *  programu nie moze nagle przechodzic na kropki. */
function lb(n, d = 2) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(d).replace('.', ',') : '—';
}
function pl(n, d = 0) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
}


/* ============================================================
   OPINIOWANIE MERYTORYCZNE (1.12.0)

   Dotąd kontrola pilnowała formy: czy pole wypełnione, czy daty w kolejności.
   Teraz zabiera też głos w sprawach, w których program ma dane, żeby coś
   sensownego powiedzieć: czy cecha w ogóle różnicuje ceny na tym rynku, która
   cecha pracuje najmocniej, czy ocena przedmiotu nie wychodzi poza rynek,
   i czy parametry pozostałych podejść mieszczą się w granicach zdrowego rozsądku.

   Granica jest cały czas ta sama: program pokazuje liczby i nazywa wątpliwość.
   Decyzję — przyjąć, odrzucić, uzasadnić inaczej — podejmuje rzeczoznawca.
   ============================================================ */

/** Zamienia ocenę opisową na pozycję w skali 0–1. Bez tego nie da się policzyć,
 *  czy cecha ma cokolwiek wspólnego z ceną. */
function rangaOceny(cecha, ocena, trybGlobalny) {
  const v = String(ocena ?? '').trim();
  if (!v) return null;
  const tryb = cecha?.scaleMode || trybGlobalny || 'three';
  const skala = tryb === 'five' ? [cecha.scaleMin, cecha.scaleLow, cecha.scaleAvg, cecha.scaleHigh, cecha.scaleMax]
    : tryb === 'two' ? [cecha.scaleMin, cecha.scaleMax]
    : [cecha.scaleMin, cecha.scaleAvg, cecha.scaleMax];
  const i = skala.findIndex(x => String(x ?? '').trim().toLowerCase() === v.toLowerCase());
  if (i >= 0 && skala.length > 1) return i / (skala.length - 1);
  // Niektórzy wpisują wprost liczbę (1–3, 1–5) zamiast opisu ze skali.
  const n = Number(v.replace(',', '.'));
  if (Number.isFinite(n)) {
    const max = tryb === 'five' ? 5 : tryb === 'two' ? 2 : 3;
    if (n >= 1 && n <= max) return (n - 1) / (max - 1);
    if (n >= 0 && n <= 1) return n;
  }
  return null;
}

/** Korelacja liniowa — na tyle prosta, żeby dało się ją sprawdzić ręcznie. */
function korelacja(xs, ys) {
  const pary = xs.map((x, i) => [x, ys[i]]).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  const n = pary.length;
  if (n < 3) return null;
  const sx = pary.reduce((s, [a]) => s + a, 0) / n, sy = pary.reduce((s, [, b]) => s + b, 0) / n;
  let licz = 0, mx = 0, my = 0;
  for (const [a, b] of pary) { licz += (a - sx) * (b - sy); mx += (a - sx) ** 2; my += (b - sy) ** 2; }
  if (mx === 0 || my === 0) return null;      // cecha albo cena bez zróżnicowania
  return { r: licz / Math.sqrt(mx * my), n };
}

function opiniujCechy(p, c, dodaj) {
  const cechy = Array.isArray(p.market?.features) ? p.market.features : [];
  const tx = (Array.isArray(p.market?.transactions) ? p.market.transactions : [])
    .filter(t => Number(t.priceUnit) > 0);
  if (!cechy.length) return;
  const tryb = p.market?.ratingMode || 'three';

  /* --- liczba cech wobec liczby transakcji --- */
  if (cechy.length < 3) {
    dodaj('cechy', 'uwaga', `Tylko ${cechy.length} ${cechy.length === 1 ? 'cecha' : 'cechy'} rynkowe`,
      'Przy tak krótkiej liście trudno wykazać, że zbiór cech wyczerpuje to, co na tym rynku różnicuje ceny.');
  }
  if (tx.length && cechy.length > Math.max(4, tx.length / 3)) {
    dodaj('cechy', 'uwaga', `Dużo cech jak na ${tx.length} transakcji`,
      `${cechy.length} cech przy ${tx.length} transakcjach — każda kolejna cecha dzieli ten sam materiał dowodowy na drobniejsze kawałki i wagi robią się nieweryfikowalne.`);
  }

  /* --- cechy o tym samym znaczeniu --- */
  const nazwy = cechy.map(f => String(f.name || '').toLowerCase().trim()).filter(Boolean);
  const bliskie = [['lokalizacja', 'położenie'], ['standard', 'wykończenie'], ['stan techniczny', 'stan']];
  for (const grupa of bliskie) {
    const trafione = grupa.filter(g => nazwy.some(n => n.includes(g)));
    if (trafione.length > 1) {
      dodaj('cechy', 'uwaga', `Cechy mogą opisywać to samo: ${trafione.join(' i ')}`,
        'Dwie cechy o tym samym znaczeniu liczą ten sam wpływ dwa razy. Albo je połącz, albo wyraźnie rozgranicz w definicjach skali.');
    }
  }

  /* --- co naprawde rozniczkuje ceny --- */
  const analiza = [];
  for (const f of cechy) {
    const rangi = [], ceny = [];
    for (const t of tx) {
      const r = rangaOceny(f, t.featureRatings?.[f.id], tryb);
      if (r != null) { rangi.push(r); ceny.push(Number(t.priceUnit)); }
    }
    const k = korelacja(rangi, ceny);
    const rozpietosc = rangi.length ? Math.max(...rangi) - Math.min(...rangi) : 0;
    const waga = Number(f.weight) || 0;
    analiza.push({ f, k, rozpietosc, waga, ocen: rangi.length, praca: waga * rozpietosc });
  }

  for (const a of analiza) {
    const nazwa = a.f.name || 'cecha bez nazwy';
    if (a.ocen >= 3 && a.rozpietosc === 0) {
      dodaj('cechy', 'uwaga', `Cecha „${nazwa}" ma wszędzie tę samą ocenę`,
        'Skoro żadna transakcja nie różni się tą cechą od pozostałych, nie wnosi ona nic do wyniku — rozważ usunięcie albo przeskalowanie definicji.');
      continue;
    }
    if (a.k && Math.abs(a.k.r) < 0.15 && a.waga >= 0.15) {
      dodaj('cechy', 'uwaga', `Cecha „${nazwa}" nie różnicuje cen, a ma istotną wagę`,
        `Zależność oceny od ceny jest znikoma (r = ${lb(a.k.r)} przy ${a.k.n} obserwacjach), a waga wynosi ${lb(a.waga)}. Albo rynek tej cechy nie wycenia, albo skala jest źle opisana.`);
    }
    if (a.k && Math.abs(a.k.r) >= 0.5 && a.waga > 0 && a.waga < 0.1) {
      dodaj('cechy', 'uwaga', `Cecha „${nazwa}" mocno różnicuje ceny, a ma niską wagę`,
        `r = ${lb(a.k.r)} przy wadze ${lb(a.waga)}. Sprawdź, czy wagi odpowiadają temu, co widać w danych.`);
    }
    if (a.k && a.k.r <= -0.4 && a.waga > 0) {
      dodaj('cechy', 'uwaga', `Cecha „${nazwa}" działa odwrotnie, niż sugeruje skala`,
        `Im wyższa ocena, tym niższa cena (r = ${lb(a.k.r)}). Skala może być odwrócona — sprawdź, czy „lepsza" strona skali to rzeczywiście ta droższa.`);
    }
  }

  /* --- ranking: ktora cecha pracuje najmocniej --- */
  const pracujace = analiza.filter(a => a.praca > 0).sort((x, y) => y.praca - x.praca);
  if (pracujace.length >= 2) {
    const naj = pracujace[0], naj2 = pracujace[1], gorsza = pracujace[pracujace.length - 1];
    const udzial = (x) => Math.round(x.praca / naj.praca * 100);
    dodaj('cechy', 'ok', 'Które cechy najmocniej wpływają na wynik',
      `Wpływ = waga × rozpiętość ocen w zbiorze; r pokazuje osobno, czy cecha idzie w parze z ceną. ` +
      `1. ${naj.f.name || '—'} (waga ${lb(naj.waga)}${naj.k ? `, r = ${lb(naj.k.r)}` : ''}) · ` +
      `2. ${naj2.f.name || '—'} (waga ${lb(naj2.waga)}${naj2.k ? `, r = ${lb(naj2.k.r)}` : ''}). ` +
      `Najmniejszy wpływ: ${gorsza.f.name || '—'} — ${udzial(gorsza)}% tego, co najmocniejsza.`);
  }

  /* --- ocena przedmiotu poza zakresem rynku --- */
  for (const a of analiza) {
    if (a.ocen < 3) continue;
    const przedmiot = rangaOceny(a.f, a.f.rating, tryb);
    if (przedmiot == null) continue;
    const rangi = tx.map(t => rangaOceny(a.f, t.featureRatings?.[a.f.id], tryb)).filter(x => x != null);
    const lo = Math.min(...rangi), hi = Math.max(...rangi);
    if (przedmiot > hi + 1e-9 || przedmiot < lo - 1e-9) {
      dodaj('cechy', 'uwaga', `Ocena przedmiotu wykracza poza zbiór porównawczy: „${a.f.name || 'cecha'}"`,
        'Wyceniana nieruchomość ma tę cechę lepszą albo gorszą niż wszystkie transakcje w zbiorze. Wynik powstaje wtedy przez wyjście poza rynek, z którego go wyprowadzasz — dobierz transakcję obejmującą ten poziom albo opisz ograniczenie w operacie.');
    }
  }

  /* --- brakujace oceny --- */
  const brakOcen = tx.reduce((n, t) => n + cechy.filter(f => !String(t.featureRatings?.[f.id] ?? '').trim()).length, 0);
  if (!brakOcen && tx.length && cechy.length) {
    dodaj('cechy', 'ok', 'Macierz ocen cech jest kompletna', `${tx.length} transakcji × ${cechy.length} cech`);
  }
}

/** Pełny łańcuch dat operatu — nie tylko „czy jest", ale czy układa się sensownie. */
function opiniujDaty(p, dodaj) {
  const d = {
    ogledziny: p.valuation?.inspectionDate, wycena: p.valuation?.valuationDate,
    stan: p.valuation?.propertyStateDate || p.valuation?.stateDate,
    prawny: p.valuation?.legalStateDate, ceny: p.valuation?.priceLevelDate,
    sporzadzenia: p.valuation?.reportDate || p.meta?.reportDate,
  };
  if (d.ogledziny && d.stan && dni(d.ogledziny, d.stan) < 0) {
    dodaj('daty', 'uwaga', 'Stan nieruchomości przyjęty na datę wcześniejszą niż oględziny',
      `Oględziny ${d.ogledziny}, stan ${d.stan}. Jeśli to celowe, wyjaśnij, skąd wiesz, jak nieruchomość wyglądała wcześniej.`);
  }
  if (d.sporzadzenia && d.wycena) {
    const r = dni(d.wycena, d.sporzadzenia);
    if (r != null && r < 0) {
      dodaj('daty', 'blad', 'Operat sporządzony przed datą wyceny', `${d.sporzadzenia} < ${d.wycena}`);
    } else if (r != null && r > 365) {
      dodaj('daty', 'uwaga', 'Od daty wyceny minął ponad rok',
        `${r} dni do daty sporządzenia. Operat starszy niż 12 miesięcy wymaga potwierdzenia aktualności.`);
    } else if (r != null) {
      dodaj('daty', 'ok', 'Operat sporządzony po dacie wyceny', `${d.wycena} → ${d.sporzadzenia}`);
    }
  }
  const tx = Array.isArray(p.market?.transactions) ? p.market.transactions : [];
  if (d.ceny && tx.length) {
    const po = tx.filter(t => t.date && dni(t.date, d.ceny) < 0);
    if (po.length) {
      dodaj('daty', 'uwaga', 'Transakcja późniejsza niż przyjęty poziom cen',
        `${po.length} ${po.length === 1 ? 'pozycja wykracza' : 'pozycji wykracza'} poza datę poziomu cen ${d.ceny}. Albo przesuń poziom cen, albo wyjaśnij, czemu ta transakcja go nie wyznacza.`);
    }
  }
}

/** Pozostałe podejścia: parametry, które łatwo wpisać, a trudno obronić. */
function opiniujModuly(p, dodaj, kod) {
  const m = p.modul || {};
  const i = p.income || {};
  const licz = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

  /* --- dochodowe --- */
  if (kod === 'income' || i.stopaKapitalizacji != null || i.czynsze) {
    const R = licz(i.stopaKapitalizacji);
    if (R != null && R > 0) {
      if (R < 3 || R > 12) {
        dodaj('wynik', 'uwaga', `Stopa kapitalizacji ${R}% poza typowym zakresem`,
          'Dla większości nieruchomości komercyjnych w Polsce mieści się między 3 a 12%. Jeśli ta wartość wynika z dowodów rynkowych, pokaż je w operacie — inaczej będzie pierwszą rzeczą, którą zakwestionuje recenzent.');
      } else {
        dodaj('wynik', 'ok', 'Stopa kapitalizacji w typowym zakresie', `${R}%`);
      }
    }
    const pust = licz(i.pustostany);
    if (pust === 0) {
      dodaj('wynik', 'uwaga', 'Pustostany przyjęte na poziomie 0%',
        'Zerowa strata na pustostanach i nieściągalności oznacza założenie rynku bez ryzyka. To wyjątek, nie reguła — wymaga uzasadnienia.');
    }
    const noi = licz(i.noi);
    if (noi != null && noi <= 0) {
      dodaj('wynik', 'blad', 'Dochód operacyjny netto nie jest dodatni',
        'Przy NOI ≤ 0 kapitalizacja nie ma sensu ekonomicznego — sprawdź koszty właściciela i stawki czynszu.');
    }
  }

  /* --- kosztowe --- */
  if (kod === 'cost') {
    const z = licz(m.zuzycieLaczne ?? m.zuzycieCzasowe);
    if (z != null) {
      if (z >= 85) {
        dodaj('wynik', 'uwaga', `Zużycie ${z}% — obiekt bliski końca okresu użytkowania`,
          'Przy tak wysokim zużyciu wartość odtworzeniowa bywa wyższa od rynkowej. Sprawdź, czy podejście kosztowe jest tu właściwe.');
      } else if (z === 0) {
        dodaj('wynik', 'uwaga', 'Zużycie przyjęte jako zerowe',
          'Zerowe zużycie oznacza obiekt nowy i nieużywany. Jeśli taki nie jest, wynik będzie zawyżony.');
      }
    }
    const el = Array.isArray(m.elementy) ? m.elementy : [];
    if (el.length) {
      const suma = el.reduce((s, x) => s + (licz(x.udzial) || 0), 0);
      if (Math.abs(suma - 100) > 0.5) {
        dodaj('wynik', 'blad', `Udziały elementów scalonych sumują się do ${suma.toFixed(1)}%`,
          'Muszą dawać 100% — inaczej zużycie ważone liczy się od niepełnej całości.');
      } else {
        dodaj('wynik', 'ok', 'Udziały elementów scalonych sumują się do 100%');
      }
    }
  }

  /* --- oplaty adiacencka i planistyczna --- */
  if (kod === 'fees') {
    const st = licz(m.stawka), delta = licz(m.delta);
    const limit = /planist/i.test(String(m.rodzaj || '')) ? 30 : 50;
    if (st != null && st > limit) {
      dodaj('wynik', 'blad', `Stawka ${st}% przekracza ustawowy limit ${limit}%`,
        'Stawkę ustala uchwała rady gminy, ale nie może przekroczyć granicy z ustawy.');
    } else if (st != null && st > 0) {
      dodaj('wynik', 'ok', 'Stawka opłaty mieści się w granicy ustawowej', `${st}% ≤ ${limit}%`);
    }
    if (delta != null && delta <= 0) {
      dodaj('wynik', 'uwaga', 'Brak wzrostu wartości — opłata wynosi zero',
        'Przy ΔW ≤ 0 opłaty się nie nalicza. Sprawdź, czy to wniosek z wyceny, czy skutek pomyłki w stanie „przed" i „po".');
    }
  }

  /* --- wywlaszczenie --- */
  if (kod === 'expropriation') {
    const pow = licz(m.powiekszenie);
    if (pow != null && pow > 50) {
      dodaj('wynik', 'blad', `Powiększenie ${pow}% przekracza dopuszczalne 50%`,
        'Ustawa ogranicza powiększenie odszkodowania do 50% wartości.');
    }
  }

  /* --- sluzebnosc --- */
  if (kod === 'easement') {
    if (!String(m.uzasadnienieMetody || '').trim() && String(m.metoda || '').trim()) {
      dodaj('wynik', 'uwaga', 'Metoda wyceny służebności przyjęta bez uzasadnienia',
        'Metody dają różne wyniki na tych samych danych, więc wybór trzeba uzasadnić, a nie tylko wskazać.');
    }
    const S = licz(m.wspolczynnikS), k = licz(m.wspolczynnikK);
    if (S != null && (S < 0 || S > 100)) dodaj('wynik', 'blad', `Współczynnik S poza zakresem 0–100% (${S})`);
    if (k != null && (k <= 0 || k > 1)) dodaj('wynik', 'uwaga', `Współczynnik k poza typowym zakresem 0–1 (${k})`,
      'Wartość spoza tego przedziału wymaga wskazania podstawy.');
  }

  /* --- rolna i lesna --- */
  if (kod === 'agri_forest') {
    if (licz(m.cenaDrewna) > 0 && !String(m.zrodloCenyDrewna || '').trim()) {
      dodaj('wynik', 'blad', 'Cena drewna bez wskazanego źródła',
        'To parametr urzędowy — musi mieć źródło i datę obowiązywania.');
    }
    if (licz(m.wskaznikN) > 0 && !String(m.zrodloWskaznika || '').trim()) {
      dodaj('wynik', 'blad', 'Wskaźnik szacunkowy bez wskazanego źródła',
        'Wskaźnik pochodzi z załącznika do rozporządzenia — podaj który i z jakiej daty.');
    }
  }
}

/**
 * @param project  projekt operatu
 * @param calc     wynik zamrożonego silnika (może być null, gdy jeszcze nie liczy)
 * @param brakiWgKroku  mapa { krok: [opisy braków] } z walidacji kreatora
 * @param opcje    { modul, parowy }
 */

/**
 * Wymagania weryfikatora operatu (1.18.0).
 *
 * Zrodlo: wymagania bankow wobec operatow sporzadzanych na potrzeby
 * zabezpieczenia wierzytelnosci — to one najczesciej decyduja o tym, czy
 * operat wroci do poprawy. Sprawdzamy rzeczy, ktore w praktyce sa odrzucane:
 * brak dostepu do drogi, niepelna baza transakcji, powierzchnia bez zrodla,
 * przeterminowany wypis, brak oswiadczenia o niezaleznosci.
 */
function opiniujWeryfikatora(p, dodaj) {
  const prop = p.property || {}, egib = p.egib || {}, bud = p.building || {};
  const cel = String(p.valuation?.purpose || '').toLowerCase();
  const dlaBanku = /zabezpiecz|kredyt|hipotek|bank/.test(cel);

  if (!jest(prop.roadAccess)) {
    dodaj('prawny', 'uwaga', 'Nie opisano dostępu do drogi publicznej',
      'Weryfikatorzy sprawdzają to w pierwszej kolejności. Wskaż, czy dostęp jest bezpośredni, przez drogę wewnętrzną, czy przez służebność.', 'egib');
  } else if (prop.roadAccess === 'brak') {
    dodaj('prawny', 'blad', 'Brak prawnie uregulowanego dostępu do drogi publicznej',
      'To istotnie wpływa na wartość i zbywalność. Opisz skutek w analizie i uwzględnij go w cechach rynkowych.', 'egib');
  } else if (prop.roadAccess !== 'bezposredni' && !jest(prop.roadAccessProof)) {
    dodaj('prawny', 'uwaga', 'Dostęp do drogi nie ma wskazanego dowodu',
      'Przy dostępie innym niż bezpośredni trzeba wskazać dokument: KW drogi, zaświadczenie gminy, uchwałę o kategorii drogi albo zapis w planie.', 'egib');
  } else {
    dodaj('prawny', 'ok', 'Dostęp do drogi publicznej opisany', '', 'egib');
  }

  const pow = liczba(prop.usableArea);
  if (pow && !jest(prop.usableAreaSource)) {
    dodaj('przedmiot', 'uwaga', 'Powierzchnia użytkowa bez wskazanego źródła',
      `Przyjęto ${lb(pow)} m², ale nie wiadomo, skąd ta liczba pochodzi. Wskaż akt, projekt, inwentaryzację albo pomiar własny.`, 'egib');
  } else if (pow && jest(prop.usableAreaSource)) {
    dodaj('przedmiot', 'ok', 'Powierzchnia użytkowa ma wskazane źródło', '', 'egib');
  }

  const wycena = p.valuation?.valuationDate;
  if (jest(egib.extractDate) && jest(wycena)) {
    const r = dni(egib.extractDate, wycena);
    if (r != null && r > 183) {
      dodaj('zrodla', 'uwaga', 'Wypis z EGiB starszy niż pół roku',
        `Między wypisem (${egib.extractDate}) a datą wyceny minęło ${r} dni. Banki wymagają dokumentu nie starszego niż 6 miesięcy.`, 'egib');
    } else if (r != null && r < 0) {
      dodaj('zrodla', 'uwaga', 'Wypis z EGiB wystawiony po dacie wyceny',
        `Wypis ${egib.extractDate}, data wyceny ${wycena}. Sprawdź, czy opisujesz stan właściwy dla daty wyceny.`, 'egib');
    } else if (r != null) {
      dodaj('zrodla', 'ok', 'Wypis z EGiB aktualny względem daty wyceny', `${r} dni`, 'egib');
    }
  }

  const tx = Array.isArray(p.market?.transactions) ? p.market.transactions : [];
  if (tx.length) {
    const bezDaty = tx.filter(t => !jest(t.date)).length;
    // Transakcje wpisuje sie albo cena calkowita, albo cena jednostkowa —
    // obie sa poprawnym zapisem, wiec brakiem jest dopiero brak obu.
    const bezCeny = tx.filter(t => !liczba(t.price) && !liczba(t.priceUnit)).length;
    const bezPow = tx.filter(t => !liczba(t.area)).length;
    const bezAdresu = tx.filter(t => !jest(t.address)).length;
    const braki = [];
    if (bezDaty) braki.push(`${bezDaty} bez daty`);
    if (bezCeny) braki.push(`${bezCeny} bez ceny`);
    if (bezPow) braki.push(`${bezPow} bez powierzchni`);

    if (braki.length) {
      dodaj('zbior', 'blad', 'Baza transakcji jest niekompletna',
        `${braki.join(', ')}. Weryfikator wymaga dla każdej transakcji daty, ceny i powierzchni — inaczej nie da się odtworzyć doboru.`, 'market');
    } else if (bezAdresu) {
      dodaj('zbior', 'uwaga', 'Część transakcji nie ma lokalizacji',
        `${bezAdresu} z ${tx.length} pozycji bez adresu albo obrębu. Bank sprawdza, czy porównawcze pochodzą z tego samego rynku.`, 'market');
    } else {
      dodaj('zbior', 'ok', 'Każda transakcja ma datę, cenę, powierzchnię i lokalizację', `${tx.length} pozycji`, 'market');
    }
  }

  if (dlaBanku) {
    if (!p.author?.independence) {
      dodaj('zrodla', 'blad', 'Brak oświadczenia o braku konfliktu interesów',
        'Przy wycenie dla zabezpieczenia wierzytelności bank wymaga oświadczenia, że rzeczoznawca nie jest powiązany ze stronami, a wynagrodzenie nie zależy od wyniku wyceny.', 'egib');
    } else {
      dodaj('zrodla', 'ok', 'Oświadczenie o braku konfliktu interesów złożone', '', 'egib');
    }
    if (!jest(bud.energyClass) && !jest(bud.energyEP)) {
      dodaj('zrodla', 'uwaga', 'Brak danych ze świadectwa charakterystyki energetycznej',
        'Przy operatach bankowych klasa energetyczna i wskaźnik EP są dziś częścią oceny nieruchomości.', 'egib');
    }
    if (!/ryzyk/i.test(String(p.clauses || ''))) {
      dodaj('zrodla', 'uwaga', 'Brak opinii o obszarach ryzyka dla zabezpieczenia',
        'Rozporządzenie wymaga wskazania obszarów ryzyka wpływających na wartość w przyszłości oraz okoliczności ograniczających przydatność nieruchomości jako zabezpieczenia. To osobny załącznik do operatu.', 'clauses');
    }
  }
}

function ocen(project, calc, brakiWgKroku, opcje) {
  const p = project || {}, c = calc || {}, o = opcje || {};
  const braki = brakiWgKroku || {};
  // Zapisany projekt bywa uszkodzony — pusty wiersz w tabeli albo null po
  // nieudanym imporcie. Kontrola nie moze sie na tym wywrocic, bo wtedy znika
  // jedyne narzedzie, ktore mialo o tym poinformowac.
  const tylkoObiekty = (x) => (Array.isArray(x) ? x : []).filter(y => y && typeof y === 'object');
  if (p.market) {
    p.market = { ...p.market, transactions: tylkoObiekty(p.market.transactions), features: tylkoObiekty(p.market.features) };
  }
  const poz = [];
  const dodaj = (aspekt, stan, tytul, szczegol, krok) =>
    poz.push({ aspekt, stan, tytul, szczegol: szczegol || '', krok: krok || KROK_ASPEKTU[aspekt] || 'project' });

  /* ---------- braki z kreatora trafiaja do wlasciwego aspektu ---------- */
  for (const [krok, lista] of Object.entries(braki)) {
    const aspekt = ASPEKT_KROKU[krok] || 'przedmiot';
    for (const b of (lista || [])) {
      // Tytulem jest brakujaca rzecz, a nie slowo „brak". Lista, na ktorej
      // pietnascie pozycji nazywa sie tak samo, nie mowi nic — trzeba ja czytac
      // dopiero w drugiej linii.
      const opis = String(b).trim();
      const tytul = opis.charAt(0).toUpperCase() + opis.slice(1);
      dodaj(aspekt, 'blad', tytul.length > 90 ? tytul.slice(0, 88) + '…' : tytul,
        'Pole wymagane — bez niego OPERO nie wygeneruje PDF.', krok);
    }
  }

  /* ---------- przedmiot ---------- */
  const pow = liczba(p.property?.usableArea);
  if (pow > 0) dodaj('przedmiot', 'ok', 'Powierzchnia przedmiotu wyceny podana', `${pl(pow, 2)} m²`);
  if (jest(p.valuation?.purpose)) dodaj('przedmiot', 'ok', 'Cel wyceny określony', String(p.valuation.purpose).slice(0, 120));
  if (jest(p.valuation?.approachDescription)) dodaj('przedmiot', 'ok', 'Wybór podejścia i metody uzasadniony');

  /* ---------- daty ---------- */
  const dWyceny = p.valuation?.valuationDate, dOgledzin = p.valuation?.inspectionDate;
  const dStanu = p.valuation?.propertyStateDate || p.valuation?.stateDate;
  const dPrawny = p.valuation?.legalStateDate, dCen = p.valuation?.priceLevelDate;
  if (jest(dWyceny) && jest(dOgledzin)) {
    const r = dni(dOgledzin, dWyceny);
    if (r != null && r < 0) {
      dodaj('daty', 'blad', 'Oględziny po dacie wyceny',
        `Oględziny ${dOgledzin} są późniejsze niż data wyceny ${dWyceny}. Wartość określa się na stan znany na datę wyceny.`);
    } else {
      dodaj('daty', 'ok', 'Oględziny przed datą wyceny', `${dOgledzin} → ${dWyceny}`);
      if (r != null && r > 183) {
        dodaj('daty', 'uwaga', 'Oględziny sprzed ponad pół roku',
          `Między oględzinami a datą wyceny minęło ${r} dni. Wyjaśnij w operacie, na jakiej podstawie przyjmujesz niezmieniony stan nieruchomości.`);
      }
    }
  }
  if (jest(dPrawny) && jest(dWyceny)) {
    const r = dni(dPrawny, dWyceny);
    if (r != null && r < 0) dodaj('daty', 'blad', 'Badanie stanu prawnego po dacie wyceny',
      `Stan prawny badany ${dPrawny}, data wyceny ${dWyceny}.`);
    else dodaj('daty', 'ok', 'Stan prawny zbadany na datę nie późniejszą niż wycena');
  }
  if (jest(dCen) && jest(dWyceny) && dCen !== dWyceny) {
    dodaj('daty', 'uwaga', 'Data poziomu cen inna niż data wyceny',
      `Poziom cen ${dCen}, wycena ${dWyceny}. To dopuszczalne, ale musi być w operacie wyjaśnione.`);
  }
  if (jest(dStanu) && jest(dWyceny) && dni(dStanu, dWyceny) < 0) {
    dodaj('daty', 'blad', 'Data stanu nieruchomości po dacie wyceny', `${dStanu} > ${dWyceny}`);
  }

  /* ---------- stan prawny ---------- */
  if (jest(p.legal?.kwLocal)) dodaj('prawny', 'ok', 'Księga wieczysta wskazana', String(p.legal.kwLocal));
  if (jest(p.legal?.sectionIII) && jest(p.legal?.sectionIV)) dodaj('prawny', 'ok', 'Działy III i IV opisane');
  const kwa = liczba(p.property?.kwArea), ua = liczba(p.property?.usableArea), ba = liczba(p.property?.basementArea) || 0;
  if (kwa > 0 && ua > 0 && Math.abs(kwa - ua - ba) <= 0.02) {
    dodaj('prawny', 'ok', 'Powierzchnia z księgi zgadza się z powierzchnią lokalu');
  }

  /* ---------- rynek ---------- */
  const tx = Array.isArray(p.market?.transactions) ? p.market.transactions : [];
  const kompletne = tx.filter(t => liczba(t.priceUnit) > 0 && jest(t.address) && jest(t.date) && liczba(t.area) > 0);
  const wymagane = o.parowy ? 3 : 12;
  if (kompletne.length >= wymagane) {
    dodaj('rynek', 'ok', 'Zbiór transakcji spełnia wymagane minimum', `${kompletne.length} kompletnych (wymagane ${wymagane})`);
  }
  if (jest(p.market?.marketDescription)) dodaj('rynek', 'ok', 'Rynek lokalny opisany');
  if (kompletne.length) {
    const daty = kompletne.map(t => doDnia(t.date)).filter(Boolean).sort((a, b) => a - b);
    if (daty.length >= 2) {
      const rozpietoscMies = Math.round((daty[daty.length - 1] - daty[0]) / 2629800000);
      if (rozpietoscMies <= 1) {
        dodaj('rynek', 'uwaga', 'Wszystkie transakcje z jednego miesiąca',
          'Tak wąski przedział nie pokazuje zmiany cen w czasie — trudno będzie uzasadnić przyjęty trend.');
      } else {
        dodaj('rynek', 'ok', 'Transakcje rozłożone w czasie', `przedział ${rozpietoscMies} mies.`);
      }
      const najstarsza = Math.round((Date.now() - daty[0]) / 2629800000);
      if (najstarsza > 36) {
        dodaj('rynek', 'uwaga', 'Najstarsza transakcja sprzed ponad trzech lat',
          `${najstarsza} mies. — rozważ, czy nadal opisuje ten sam rynek.`);
      }
    }
  }

  /* ---------- zbior porownawczy ---------- */
  if (tx.length) {
    const poDacie = tx.filter(t => jest(t.date) && jest(dWyceny) && dni(t.date, dWyceny) < 0);
    if (poDacie.length) {
      dodaj('zbior', 'blad', 'Transakcja po dacie wyceny',
        `${poDacie.length} ${poDacie.length === 1 ? 'pozycja ma datę' : 'pozycje mają daty'} późniejsze niż data wyceny.`);
    } else if (kompletne.length) {
      dodaj('zbior', 'ok', 'Żadna transakcja nie jest późniejsza niż data wyceny');
    }

    const adresy = new Map();
    const duble = [];
    for (const t of kompletne) {
      const k = `${String(t.address).toLowerCase().trim()}|${t.date}`;
      if (adresy.has(k)) duble.push(t.address); else adresy.set(k, true);
    }
    if (duble.length) {
      dodaj('zbior', 'uwaga', 'Powtórzony adres i data w zbiorze',
        `Sprawdź, czy to nie ta sama transakcja wpisana dwa razy: ${[...new Set(duble)].slice(0, 3).join(', ')}.`);
    } else if (kompletne.length > 1) {
      dodaj('zbior', 'ok', 'Brak powtórzonych transakcji');
    }

    const bezPow = kompletne.filter(t => !(liczba(t.area) > 0));
    if (bezPow.length) dodaj('zbior', 'blad', 'Transakcja bez powierzchni', `${bezPow.length} pozycji.`);
  }

  const cmin = liczba(c.cmin), cmax = liczba(c.cmax), dC = liczba(c.deltaC);
  if (cmin != null && cmax != null && cmin > 0) {
    if (cmax < cmin) {
      dodaj('zbior', 'blad', 'Cmax mniejsze od Cmin', 'Sprawdź ceny skorygowane — zbiór jest wewnętrznie sprzeczny.');
    } else {
      const rozrzut = (cmax - cmin) / cmin;
      if (rozrzut > 1.5) {
        dodaj('zbior', 'uwaga', 'Bardzo szeroki przedział cen',
          `Cmin ${pl(cmin)} – Cmax ${pl(cmax)} zł/m² (rozrzut ${Math.round(rozrzut * 100)}%). Przy takim rozrzucie trzeba wykazać, że to wciąż jeden rynek.`);
      } else {
        dodaj('zbior', 'ok', 'Przedział cen skorygowanych wygląda spójnie',
          `Cmin ${pl(cmin)} – Cmax ${pl(cmax)} zł/m²`);
      }
    }
  }

  /* ---------- cechy i wagi ---------- */
  const sumaWag = liczba(c.weightSum);
  if (sumaWag != null) {
    if (Math.abs(sumaWag - 1) <= 0.001) dodaj('cechy', 'ok', 'Suma wag cech wynosi 1,00');
    else dodaj('cechy', 'blad', 'Suma wag cech różna od 1,00', `teraz ${pl(sumaWag, 4)}`);
  }
  const cechy = Array.isArray(p.market?.features) ? p.market.features : [];
  const dominujaca = cechy.find(f => liczba(f.weight) > 0.5);
  if (dominujaca) {
    dodaj('cechy', 'uwaga', 'Jedna cecha waży ponad połowę',
      `„${dominujaca.name || 'cecha'}" ma wagę ${pl(dominujaca.weight, 2)}. To bywa uzasadnione, ale musi być wykazane w analizie rynku, a nie przyjęte.`);
  }
  if (jest(p.market?.weightJustification)) dodaj('cechy', 'ok', 'Sposób ustalenia wag uzasadniony');
  if (cechy.length && cechy.every(f => liczba(f.weight) > 0)) {
    dodaj('cechy', 'ok', 'Każda cecha ma wagę większą od zera', `${cechy.length} cech`);
  }

  /* ---------- wynik ---------- */
  const jedn = liczba(c.unitRaw), wart = liczba(c.valueRounded), jednPo = liczba(c.unitAfterRound);
  if (jedn != null && cmin != null && cmax != null && cmin > 0 && cmax >= cmin) {
    if (jedn < cmin || jedn > cmax) {
      dodaj('wynik', 'blad', 'Cena jednostkowa poza przedziałem Cmin–Cmax',
        `Wynik ${pl(jedn)} zł/m² wypada poza ${pl(cmin)}–${pl(cmax)} zł/m². Sprawdź oceny cech i korekty — wynik nie może leżeć poza rynkiem, z którego powstał.`);
    } else {
      dodaj('wynik', 'ok', 'Cena jednostkowa mieści się w przedziale rynkowym',
        `${pl(jedn)} zł/m² w ${pl(cmin)}–${pl(cmax)}`);
    }
  }
  if (wart > 0) {
    dodaj('wynik', 'ok', 'Wartość rynkowa policzona', `${pl(wart)} zł`);
    if (jednPo != null && jedn != null && jedn > 0) {
      const odchylenie = Math.abs(jednPo - jedn) / jedn;
      if (odchylenie > 0.02) {
        dodaj('wynik', 'uwaga', 'Zaokrąglenie zmienia wynik o ponad 2%',
          `Przed zaokrągleniem ${pl(jedn)} zł/m², po ${pl(jednPo)} zł/m². Rozważ dokładniejszy stopień zaokrąglenia.`);
      }
    }
  }
  const sumaUi = liczba(c.sumUi);
  if (sumaUi != null && Math.abs(sumaUi) > 0) dodaj('wynik', 'ok', 'Suma poprawek Ui policzona', `${pl(sumaUi, 2)} zł/m²`);

  /* ---------- zrodla ---------- */
  if ((p.legalBases || []).length >= 2) dodaj('zrodla', 'ok', 'Podstawy prawne wskazane', `${p.legalBases.length} pozycji`);
  if ((p.sources || []).length >= 1) dodaj('zrodla', 'ok', 'Materiały źródłowe wymienione', `${p.sources.length} pozycji`);
  if (jest(p.clauses)) dodaj('zrodla', 'ok', 'Klauzule i ustalenia dodatkowe wpisane');
  if ((p.photos || []).length) dodaj('zrodla', 'ok', 'Dokumentacja fotograficzna dołączona', `${p.photos.length} zdjęć`);
  else dodaj('zrodla', 'uwaga', 'Brak zdjęć z oględzin',
    'Fotografie nie są obowiązkowe, ale bez nich trudniej wykazać stan nieruchomości na datę oględzin.');

  /* ---------- opiniowanie merytoryczne ---------- */
  try { opiniujCechy(p, c, dodaj); } catch (e) { /* opinia nie może wywrócić kontroli */ }
  try { opiniujDaty(p, dodaj); } catch (e) {}
  try { opiniujWeryfikatora(p, dodaj); } catch (e) {}
  try { opiniujModuly(p, dodaj, String(o.modul || '')); } catch (e) {}

  /* ---------- podsumowanie ---------- */
  const WAGA = { blad: 0, uwaga: 1, ok: 2 };
  const aspekty = ASPEKTY.map(([kod, nazwa]) => {
    const lista = poz.filter(x => x.aspekt === kod).sort((a, b) => WAGA[a.stan] - WAGA[b.stan]);
    return {
      kod, nazwa, pozycje: lista,
      ok: lista.filter(x => x.stan === 'ok').length,
      uwagi: lista.filter(x => x.stan === 'uwaga').length,
      bledy: lista.filter(x => x.stan === 'blad').length,
      krok: KROK_ASPEKTU[kod],
    };
  });
  const bledy = poz.filter(x => x.stan === 'blad').length;
  const uwagi = poz.filter(x => x.stan === 'uwaga').length;
  const ok = poz.filter(x => x.stan === 'ok').length;
  // Gotowosc liczymy z udzialu rzeczy zrobionych dobrze; uwaga waży pół błędu,
  // bo nie blokuje PDF, ale też nie jest niczym.
  const waga = ok + uwagi * 0.5;
  const mianownik = ok + uwagi + bledy;
  return {
    aspekty, pozycje: poz,
    podsumowanie: {
      ok, uwagi, bledy,
      gotowosc: mianownik ? Math.round(waga / mianownik * 100) : 0,
      gotowyDoPDF: bledy === 0,
    },
  };
}

// Kazdy plik renderera dziala we wspolnym zakresie globalnym strony, wiec
// nazwa „API" w dwoch modulach to blad skladni calej strony i polowa programu
// przestaje sie inicjalizowac. Nazwy eksportow musza byc rozlaczne.
const API_KONTROLA = { ocen, ASPEKTY, rangaOceny, korelacja };
if (typeof module !== 'undefined' && module.exports) module.exports = API_KONTROLA;
if (typeof window !== 'undefined') window.OperoKontrola = API_KONTROLA;

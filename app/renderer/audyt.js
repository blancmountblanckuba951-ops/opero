'use strict';
/* ============================================================================
   OPERO — AUDYT OPERATU PRZED PODPISEM
   ----------------------------------------------------------------------------
   Ostatnia kontrola całości: nie „czy pola są wypełnione", tylko „czy ten
   operat da się obronić". Reguły odpowiadają wymaganiom, które stawia
   ustawa o gospodarce nieruchomościami, rozporządzenie w sprawie wyceny
   nieruchomości oraz praktyka weryfikacji operatów — ujęte tak, jak układa
   je podręcznikowa matryca kontroli jakości:

     tekst · tabela transakcyjna · arkusz obliczeń · opis rynku ·
     opis nieruchomości · uzasadnienie wyniku · załączniki · daty i stan prawny

   DLACZEGO OSOBNO OD „KONTROLI OPERATU"

   Kontrola bieżąca pilnuje, żeby dało się wygenerować PDF — pilnuje BRAKÓW.
   Audyt pilnuje SPÓJNOŚCI i toku rozumowania: czy liczby w tekście zgadzają
   się z tabelami, czy wagi sumują się do jedności, czy daty układają się
   w sensowną kolejność, czy każda transakcja ma źródło, czy wynik ma
   uzasadnienie. To są rzeczy, o które pyta weryfikator, a nie generator PDF.

   ZASADA: ŻADNA REGUŁA NIE ZGADUJE

   Reguła, która nie ma danych, zwraca „nie sprawdzone" i mówi, czego jej
   brakuje. Audyt, który milczy przy pustym operacie, jest gorszy niż brak
   audytu — bo daje spokój, na który nikt nie zapracował.
   ========================================================================= */

const AUDYT_DZIALY = [
  { id: 'daty', nazwa: 'Daty i stan prawny' },
  { id: 'przedmiot', nazwa: 'Opis nieruchomości' },
  { id: 'rynek', nazwa: 'Opis rynku' },
  { id: 'transakcje', nazwa: 'Tabela transakcyjna' },
  { id: 'obliczenia', nazwa: 'Arkusz obliczeń' },
  { id: 'wynik', nazwa: 'Uzasadnienie wyniku' },
  { id: 'tekst', nazwa: 'Kontrola tekstu' },
  { id: 'zalaczniki', nazwa: 'Załączniki' },
];

function audJest(v) { return v != null && String(v).trim() !== ''; }
function audLiczba(v) { const n = Number(v); return Number.isFinite(n) ? n : null; }
function audDzien(v) { const t = Date.parse(String(v || '')); return Number.isFinite(t) ? new Date(t) : null; }
function audDni(a, b) {
  const x = audDzien(a), y = audDzien(b);
  if (!x || !y) return null;
  return Math.round((y - x) / 86400000);
}
function audPl(n, d = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '—';
  return x.toLocaleString('pl-PL', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function audOdmien(n, jeden, dwa, piec) {
  const i = Math.abs(Math.trunc(Number(n) || 0));
  if (i === 1) return jeden;
  const ost = i % 10, dwaOst = i % 100;
  return (ost >= 2 && ost <= 4 && (dwaOst < 12 || dwaOst > 14)) ? dwa : piec;
}

/**
 * Wszystkie liczby z tekstu rozdzialu — do porownania z tabelami.
 * Bierzemy tylko liczby znaczace (od tysiaca albo z przecinkiem), bo numery
 * paragrafow i lata nie sa danymi wyceny.
 */
function audLiczbyZTekstu(tekst) {
  const out = [];
  const re = /(\d[\d  ]{2,}(?:[.,]\d+)?|\d+[.,]\d+)/g;
  let m;
  while ((m = re.exec(String(tekst || '')))) {
    const n = Number(String(m[1]).replace(/[\s ]/g, '').replace(',', '.'));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/* ------------------------------------------------------------- reguly */

function audRegulyDaty(p, dodaj) {
  const v = p.valuation || {};
  const pary = [
    ['valuationDate', 'data wyceny'],
    ['reportDate', 'data sporządzenia operatu'],
    ['inspectionDate', 'data oględzin'],
    ['priceLevelDate', 'data poziomu cen'],
  ];
  const brak = pary.filter(([k]) => !audJest(v[k])).map(([, n]) => n);
  if (brak.length) {
    dodaj('daty', 'blad', `Brakuje ${audOdmien(brak.length, 'daty', 'dat', 'dat')}: ${brak.join(', ')}`,
      'Operat rozdziela datę wartości, datę stanu, datę oględzin i datę sporządzenia. '
      + 'Bez nich nie wiadomo, na jaki moment odnosi się wynik.');
  } else {
    dodaj('daty', 'ok', 'Wszystkie cztery daty operatu są podane');
  }

  const doWyceny = audDni(v.inspectionDate, v.valuationDate);
  if (doWyceny != null && doWyceny < 0) {
    dodaj('daty', 'blad', 'Oględziny po dacie wyceny',
      `Oględziny są ${Math.abs(doWyceny)} ${audOdmien(Math.abs(doWyceny), 'dzień', 'dni', 'dni')} PO dacie wyceny. `
      + 'Stan przyjęty do wyceny musi być stanem z daty wyceny albo wcześniejszym, opisanym jako przyjęty.');
  }
  const doSporzadzenia = audDni(v.valuationDate, v.reportDate);
  if (doSporzadzenia != null && doSporzadzenia < 0) {
    dodaj('daty', 'blad', 'Operat sporządzony przed datą wyceny',
      'Data sporządzenia nie może być wcześniejsza niż data, na którą określono wartość.');
  }
  if (doSporzadzenia != null && doSporzadzenia > 365) {
    dodaj('daty', 'uwaga', 'Od daty wyceny minął ponad rok',
      `Między datą wyceny a sporządzeniem operatu jest ${doSporzadzenia} dni. `
      + 'Operat może być wykorzystany po 12 miesiącach dopiero po potwierdzeniu aktualności.');
  }
  const odOgledzin = audDni(v.inspectionDate, v.reportDate);
  if (odOgledzin != null && odOgledzin > 180) {
    dodaj('daty', 'uwaga', 'Oględziny sprzed ponad pół roku',
      `Od oględzin minęło ${odOgledzin} dni. Weryfikator zapyta, czy stan nie zmienił się od tego czasu.`);
  }
  if (!audJest(v.inspectionDate)) {
    dodaj('daty', 'uwaga', 'Brak daty oględzin',
      'Jeżeli oględzin nie było, trzeba to napisać wprost i wskazać, skąd pochodzi opis stanu.');
  }

  const pr = p.legal || {};
  // Numer ksiegi lokalu stoi w legal.kwLocal (kwNumber i landRegister to stare nazwy pol).
  if (!audJest(pr.kwLocal) && !audJest(pr.kwNumber) && !audJest(pr.landRegister)) {
    dodaj('daty', 'uwaga', 'Nie wskazano księgi wieczystej',
      'Ustalenie stanu prawnego opiera się na księdze wieczystej, ewidencji i dokumentach nabycia. '
      + 'Jeżeli księgi nie ma, trzeba to napisać i podać, na czym oparto stan prawny.');
  }
}

function audRegulyPrzedmiot(p, dodaj) {
  const n = p.property || {};
  const opisy = [
    ['city', 'miejscowość'], ['street', 'ulica'],
    ['usableArea', 'powierzchnia użytkowa'], ['rightType', 'rodzaj prawa'],
  ];
  const brak = opisy.filter(([k]) => !audJest(n[k]) || (k === 'usableArea' && !(audLiczba(n[k]) > 0))).map(([, x]) => x);
  if (brak.length) {
    dodaj('przedmiot', 'blad', `Opis nieruchomości niepełny: brak ${brak.join(', ')}`,
      'Identyfikacja przedmiotu wyceny musi być jednoznaczna: co, gdzie i jakie prawo jest wyceniane.');
  } else {
    dodaj('przedmiot', 'ok', 'Przedmiot wyceny jednoznacznie zidentyfikowany');
  }

  const pow = audLiczba(n.usableArea), powKw = audLiczba(n.kwArea);
  if (pow > 0 && powKw > 0) {
    const roznica = Math.abs(pow - powKw) / pow * 100;
    if (roznica > 2) {
      dodaj('przedmiot', 'uwaga', 'Powierzchnia z dokumentów różni się od powierzchni z księgi',
        `${audPl(pow, 2)} m² wobec ${audPl(powKw, 2)} m² w KW — różnica ${audPl(roznica, 1)}%. `
        + 'Rozbieżność trzeba wyjaśnić w operacie i wskazać, którą przyjęto do wyceny i dlaczego.');
    } else {
      dodaj('przedmiot', 'ok', 'Powierzchnia zgodna z księgą wieczystą');
    }
  }
  if (!audJest(n.technicalCondition) && !audJest(p.building?.technicalCondition) && !audJest(p.building?.condition) && !audJest(p.local?.technicalCondition)) {
    dodaj('przedmiot', 'uwaga', 'Brak opisu stanu techniczno-użytkowego',
      'Opis ma wskazywać to, co wpływa na wartość: konstrukcję, standard, zużycie, funkcjonalność '
      + 'i ograniczenia w użytkowaniu — a nie być katalogiem cech.');
  }
}

function audRegulyRynek(p, c, dodaj) {
  const r = p.market || {};
  const tx = Array.isArray(r.transactions) ? r.transactions : [];
  if (!audJest(r.marketDescription) && !audJest(p.narratives?.market)) {
    dodaj('rynek', 'blad', 'Brak opisu rynku',
      'Opis rynku ma podać zakres rodzajowy, przestrzenny i czasowy, liczbę transakcji, '
      + 'poziom i rozrzut cen, trend oraz wniosek dla przyjętej metody.');
  } else {
    dodaj('rynek', 'ok', 'Rynek opisany');
  }
  if (tx.length && tx.length < 3) {
    dodaj('rynek', 'uwaga', `Zbiór porównawczy liczy ${tx.length} ${audOdmien(tx.length, 'transakcję', 'transakcje', 'transakcji')}`,
      'Przy tak małym zbiorze trzeba wyraźnie uzasadnić, dlaczego wystarcza — to pierwsze pytanie weryfikatora.');
  } else if (tx.length >= 3) {
    dodaj('rynek', 'ok', `Zbiór porównawczy: ${tx.length} ${audOdmien(tx.length, 'transakcja', 'transakcje', 'transakcji')}`);
  }
  const ceny = tx.map(t => audLiczba(t.priceUnit)).filter(x => x > 0);
  if (ceny.length >= 2) {
    const min = Math.min(...ceny), max = Math.max(...ceny);
    const rozrzut = min > 0 ? (max - min) / min * 100 : 0;
    if (rozrzut > 100) {
      dodaj('rynek', 'uwaga', 'Bardzo duży rozrzut cen w zbiorze',
        `Od ${audPl(min, 0)} do ${audPl(max, 0)} zł/m² — rozpiętość ${audPl(rozrzut, 0)}%. `
        + 'Taki rozrzut zwykle znaczy, że w zbiorze są dwa różne rynki albo pozycja odstająca.');
    } else {
      dodaj('rynek', 'ok', `Rozrzut cen w zbiorze: ${audPl(min, 0)}–${audPl(max, 0)} zł/m²`);
    }
  }
  if (c && c.trendMode && c.trendMode !== 'none' && !audJest(r.trendJustification)) {
    dodaj('rynek', 'uwaga', 'Trend czasowy przyjęty bez uzasadnienia',
      'Korekta czasowa zmienia każdą cenę w zbiorze — podstawa jej przyjęcia musi być w operacie.');
  }
}

function audRegulyTransakcje(p, dodaj) {
  const tx = (Array.isArray(p.market?.transactions) ? p.market.transactions : []);
  if (!tx.length) {
    dodaj('transakcje', 'blad', 'Tabela transakcyjna jest pusta',
      'Bez transakcji podejście porównawcze nie ma czego porównywać.');
    return;
  }
  const bezDaty = tx.filter(t => !audJest(t.date)).length;
  const bezCeny = tx.filter(t => !(audLiczba(t.priceUnit) > 0)).length;
  const bezPow = tx.filter(t => !(audLiczba(t.area) > 0)).length;
  const bezAdresu = tx.filter(t => !audJest(t.address)).length;
  const bezZrodla = tx.filter(t => !t.zrodlo && !audJest(t.source)).length;

  const brakujace = [
    [bezDaty, 'bez daty'], [bezCeny, 'bez ceny jednostkowej'],
    [bezPow, 'bez powierzchni'], [bezAdresu, 'bez adresu'],
  ].filter(([n]) => n > 0);
  if (brakujace.length) {
    dodaj('transakcje', 'blad', 'Tabela transakcyjna ma luki',
      brakujace.map(([n, co]) => `${n} ${audOdmien(n, 'pozycja', 'pozycje', 'pozycji')} ${co}`).join(', ')
      + '. Każdy wiersz musi mieć identyfikator, datę, cenę, jednostkę, prawo, powierzchnię, cechy i źródło.');
  } else {
    dodaj('transakcje', 'ok', 'Każdy wiersz tabeli ma komplet danych podstawowych');
  }
  if (bezZrodla) {
    dodaj('transakcje', 'uwaga', `${bezZrodla} ${audOdmien(bezZrodla, 'transakcja', 'transakcje', 'transakcji')} bez wskazanego źródła`,
      'Przy każdej pozycji trzeba umieć wskazać, skąd pochodzi — akt, wyciąg, rejestr albo własna baza.');
  } else {
    dodaj('transakcje', 'ok', 'Każda transakcja ma wskazane źródło');
  }

  // Oceny cech: bez nich korygowanie ceny sredniej nie ma czego korygowac.
  const cechy = Array.isArray(p.market?.features) ? p.market.features : [];
  if (cechy.length) {
    const brakOcen = tx.reduce((n, t) => n + cechy.filter(f => !audJest(t.featureRatings?.[f.id])).length, 0);
    if (brakOcen) {
      dodaj('transakcje', 'blad', `W macierzy brakuje ${brakOcen} ${audOdmien(brakOcen, 'oceny', 'ocen', 'ocen')} cech`,
        'Każda transakcja musi mieć ocenę każdej cechy — inaczej silnik liczy na niepełnej macierzy.');
    } else {
      dodaj('transakcje', 'ok', 'Macierz ocen cech jest kompletna');
    }
  }

  // Duplikaty zawyzaja wage transakcji w sredniej.
  const klucze = new Map();
  let duble = 0;
  for (const t of tx) {
    const k = [t.date, Math.round(audLiczba(t.priceUnit) || 0), Math.round((audLiczba(t.area) || 0) * 100)].join('|');
    if (klucze.has(k)) duble++; else klucze.set(k, 1);
  }
  if (duble) {
    dodaj('transakcje', 'blad', `${duble} ${audOdmien(duble, 'pozycja powtarza się', 'pozycje powtarzają się', 'pozycji powtarza się')} w tabeli`,
      'Ta sama transakcja policzona dwa razy zawyża swoją wagę w średniej i zniekształca wynik.');
  }
}

function audRegulyObliczenia(p, c, dodaj) {
  const cechy = Array.isArray(p.market?.features) ? p.market.features : [];
  if (!cechy.length) {
    dodaj('obliczenia', 'blad', 'Nie określono cech rynkowych',
      'Metoda korygowania ceny średniej opiera się na cechach i ich wagach — bez nich nie ma czego korygować.');
  } else {
    const suma = cechy.reduce((s, f) => s + (audLiczba(f.weight) || 0), 0);
    const pct = Math.round(suma * 1000) / 10;
    if (Math.abs(suma - 1) > 0.005) {
      dodaj('obliczenia', 'blad', `Wagi cech sumują się do ${audPl(pct, 1)}%, a muszą do 100%`,
        'Przy złej sumie silnik policzy wartość, która wygląda poprawnie, a jest zaniżona albo zawyżona '
        + 'proporcjonalnie do błędu sumy.');
    } else {
      dodaj('obliczenia', 'ok', 'Wagi cech sumują się do 100%');
    }
    const zerowe = cechy.filter(f => !(audLiczba(f.weight) > 0));
    if (zerowe.length) {
      dodaj('obliczenia', 'uwaga', `${zerowe.length} ${audOdmien(zerowe.length, 'cecha ma', 'cechy mają', 'cech ma')} wagę zero`,
        'Cecha z wagą zero nie wpływa na wynik — albo nadaj jej wagę, albo usuń, żeby nie sugerowała, '
        + 'że była brana pod uwagę.');
    }
    const bezUzasadnienia = cechy.filter(f => !audJest(f.ratingNote));
    if (bezUzasadnienia.length) {
      dodaj('obliczenia', 'uwaga', `${bezUzasadnienia.length} ${audOdmien(bezUzasadnienia.length, 'ocena', 'oceny', 'ocen')} cech bez uzasadnienia`,
        'Przy każdej ocenie trzeba wskazać fakty o wycenianej nieruchomości, które do tej oceny prowadzą.');
    }
    const metoda = String(p.market?.weightMethod || '');
    if (!metoda || metoda === 'manual') {
      dodaj('obliczenia', 'uwaga', 'Wagi przyjęte bez wskazania metody ich wyprowadzenia',
        'Podaj, skąd pochodzą: analiza par nieruchomości podobnych, analiza statystyczna zbioru '
        + 'czy ocena ekspercka poparta badaniem rynku.');
    } else {
      dodaj('obliczenia', 'ok', 'Wskazano metodę wyprowadzenia wag');
    }
  }

  const wartosc = audLiczba(c?.valueRounded);
  const przed = audLiczba(c?.value);
  if (wartosc > 0 && przed > 0) {
    const roznica = Math.abs(wartosc - przed) / przed * 100;
    if (roznica > 5) {
      dodaj('obliczenia', 'uwaga', 'Zaokrąglenie zmienia wynik o ponad 5%',
        `Z ${audPl(przed, 0)} zł na ${audPl(wartosc, 0)} zł. Zaokrąglenie ma porządkować zapis, a nie korygować wynik.`);
    } else {
      dodaj('obliczenia', 'ok', 'Zaokrąglenie wyniku mieści się w rozsądnych granicach');
    }
  }
  const cavg = audLiczba(c?.cavg), jedn = audLiczba(c?.unitAfterRound);
  if (cavg > 0 && jedn > 0) {
    const odchylenie = (jedn - cavg) / cavg * 100;
    if (Math.abs(odchylenie) > 40) {
      dodaj('obliczenia', 'uwaga', 'Cena jednostkowa mocno odbiega od średniej rynkowej',
        `${audPl(jedn, 0)} zł/m² wobec średniej ${audPl(cavg, 0)} zł/m² (${odchylenie > 0 ? '+' : ''}${audPl(odchylenie, 0)}%). `
        + 'Przy korygowaniu ceny średniej takie odchylenie wymaga wyraźnego uzasadnienia.');
    } else {
      dodaj('obliczenia', 'ok', 'Cena jednostkowa mieści się w rozsądnej relacji do średniej');
    }
  }
}

function audRegulyWynik(p, c, dodaj) {
  const w = audLiczba(c?.valueRounded);
  if (!(w > 0)) {
    dodaj('wynik', 'blad', 'Brak wyniku wyceny',
      'Operat bez wartości końcowej nie jest operatem.');
    return;
  }
  dodaj('wynik', 'ok', `Wartość końcowa: ${audPl(w, 0)} zł`);
  if (!audJest(p.narratives?.result) && !audJest(p.valuation?.resultJustification)) {
    dodaj('wynik', 'blad', 'Wynik bez uzasadnienia',
      'Uzasadnienie ma prowadzić od danych przez parametry i obliczenia do kontroli rynkowej, '
      + 'zaokrąglenia i wartości — każdy krok ze źródłem albo wyjaśnieniem.');
  } else {
    dodaj('wynik', 'ok', 'Wynik ma uzasadnienie');
  }
  if (!audJest(p.valuation?.approachDescription) && !audJest(p.narratives?.scope)) {
    dodaj('wynik', 'uwaga', 'Brak uzasadnienia wyboru podejścia i metody',
      'Wybór sposobu wyceny musi wynikać z celu, rodzaju nieruchomości i dostępnych danych rynkowych.');
  }
}

function audRegulyTekst(p, c, dodaj) {
  const n = p.narratives || {};
  const rozdzialy = Object.keys(n).filter(k => audJest(n[k]));
  if (!rozdzialy.length) {
    dodaj('tekst', 'uwaga', 'Operat nie ma jeszcze napisanych rozdziałów',
      'Program nie ma czego sprawdzić pod kątem zgodności tekstu z tabelami.');
    return;
  }
  dodaj('tekst', 'ok', `Napisanych rozdziałów: ${rozdzialy.length}`);

  // Liczby w tekscie musza miec pokrycie w danych operatu.
  const znane = new Set();
  const dodajZnana = (v) => { const x = audLiczba(v); if (x != null) znane.add(Math.round(x * 100) / 100); };
  dodajZnana(c?.valueRounded); dodajZnana(c?.value); dodajZnana(c?.cavg);
  dodajZnana(c?.unitAfterRound); dodajZnana(p.property?.usableArea); dodajZnana(p.property?.kwArea);
  (p.market?.transactions || []).forEach(t => { dodajZnana(t.priceUnit); dodajZnana(t.area); });
  (p.market?.features || []).forEach(f => dodajZnana((audLiczba(f.weight) || 0) * 100));

  const pasuje = (x) => {
    for (const z of znane) {
      if (z === 0) continue;
      if (Math.abs(x - z) / Math.max(1, Math.abs(z)) < 0.02) return true;
    }
    return false;
  };
  const obce = [];
  for (const [klucz, tekst] of Object.entries(n)) {
    if (!audJest(tekst)) continue;
    for (const x of audLiczbyZTekstu(tekst)) {
      // Lata i male liczby porzadkowe nie sa danymi wyceny.
      if (x >= 1900 && x <= 2100 && Number.isInteger(x)) continue;
      if (x < 1000 && Number.isInteger(x)) continue;
      if (!pasuje(x)) obce.push({ rozdzial: klucz, liczba: x });
    }
  }
  if (obce.length) {
    const ile = obce.length;
    dodaj('tekst', 'blad', `${ile} ${audOdmien(ile, 'liczba w tekście nie ma', 'liczby w tekście nie mają', 'liczb w tekście nie ma')} pokrycia w danych operatu`,
      `Na przykład ${obce.slice(0, 3).map(o => audPl(o.liczba, 0)).join(', ')}. `
      + 'Każda liczba w tekście musi dać się odnaleźć w tabelach albo w arkuszu obliczeń.');
  } else {
    dodaj('tekst', 'ok', 'Liczby w tekście mają pokrycie w danych operatu');
  }

  const doUzupelnienia = Object.values(n).filter(t => /DO UZUPEŁNIENIA/i.test(String(t))).length;
  if (doUzupelnienia) {
    dodaj('tekst', 'blad', `${doUzupelnienia} ${audOdmien(doUzupelnienia, 'rozdział zawiera', 'rozdziały zawierają', 'rozdziałów zawiera')} znacznik [DO UZUPEŁNIENIA]`,
      'To są miejsca, w których program odmówił zgadywania. Operat z takim znacznikiem nie nadaje się do podpisu.');
  }
  const cudzeNazwy = [...Object.values(n), p.location?.description, p.building?.description, p.local?.description].filter(x => typeof x === 'string').join(' ');
  if (p.property?.city && cudzeNazwy && !cudzeNazwy.includes(p.property.city)) {
    dodaj('tekst', 'uwaga', 'W tekście nie pada nazwa miejscowości z opisu nieruchomości',
      'Częsty ślad po poprzednim operacie: tekst opisuje inną nieruchomość niż tabele.');
  }
}

function audRegulyZalaczniki(p, dodaj) {
  const zal = [].concat(p.files || [], p.photos || []);
  if (!zal.length) {
    dodaj('zalaczniki', 'uwaga', 'Operat nie ma załączników',
      'Zwykle dołącza się wypis i wyrys, odpis księgi, dokumentację zdjęciową i mapę. '
      + 'Jeżeli czegoś nie ma, trzeba napisać dlaczego.');
    return;
  }
  dodaj('zalaczniki', 'ok', `Załączników: ${zal.length}`);
  const bezOpisu = zal.filter(z => !audJest(z.nazwa) && !audJest(z.name)).length;
  if (bezOpisu) {
    dodaj('zalaczniki', 'uwaga', `${bezOpisu} ${audOdmien(bezOpisu, 'załącznik bez nazwy', 'załączniki bez nazwy', 'załączników bez nazwy')}`,
      'Każdy załącznik ma być przywołany w tekście i mieć źródło oraz datę.');
  }
}

/* --------------------------------------------------------------- audyt */

function audytOperatu(project, calc) {
  const p = project || {}, c = calc || {};
  const poz = [];
  const dodaj = (dzial, stan, tytul, szczegol) =>
    poz.push({ dzial, stan, tytul, szczegol: szczegol || '' });

  audRegulyDaty(p, dodaj);
  audRegulyPrzedmiot(p, dodaj);
  audRegulyRynek(p, c, dodaj);
  audRegulyTransakcje(p, dodaj);
  audRegulyObliczenia(p, c, dodaj);
  audRegulyWynik(p, c, dodaj);
  audRegulyTekst(p, c, dodaj);
  audRegulyZalaczniki(p, dodaj);

  const dzialy = AUDYT_DZIALY.map(d => {
    const lista = poz.filter(x => x.dzial === d.id);
    return {
      ...d, pozycje: lista,
      bledy: lista.filter(x => x.stan === 'blad').length,
      uwagi: lista.filter(x => x.stan === 'uwaga').length,
      ok: lista.filter(x => x.stan === 'ok').length,
    };
  });
  const bledy = poz.filter(x => x.stan === 'blad').length;
  const uwagi = poz.filter(x => x.stan === 'uwaga').length;
  const ok = poz.filter(x => x.stan === 'ok').length;

  return {
    dzialy, pozycje: poz,
    podsumowanie: {
      ok, uwagi, bledy,
      doPodpisu: bledy === 0,
      waga: bledy ? 'blad' : uwagi ? 'ostrzezenie' : 'sukces',
      tekst: bledy
        ? `Operat nie nadaje się jeszcze do podpisu: ${bledy} ${audOdmien(bledy, 'błąd', 'błędy', 'błędów')}`
          + (uwagi ? ` i ${uwagi} ${audOdmien(uwagi, 'uwaga', 'uwagi', 'uwag')}` : '') + '.'
        : uwagi
          ? `Bez błędów, ale ${uwagi} ${audOdmien(uwagi, 'rzecz wymaga', 'rzeczy wymagają', 'rzeczy wymaga')} Twojej decyzji przed podpisem.`
          : 'Audyt nie znalazł nic do poprawienia. Decyzję o podpisie podejmujesz Ty.',
    },
  };
}

/** Polecenie dla PER: audyt opisowy nad tym, czego reguły nie złapią. */
function audytPolecenieDlaPER(wynik, project) {
  const w = wynik || { pozycje: [] };
  const problemy = w.pozycje.filter(x => x.stan !== 'ok')
    .map(x => `- [${x.stan === 'blad' ? 'BŁĄD' : 'uwaga'}] ${x.tytul}: ${x.szczegol}`).join('\n');
  return {
    rozdzial: 'audyt',
    zadanie: 'Przeczytaj operat jak weryfikator, który nie zna oczekiwanego wyniku. '
      + 'Sprawdź tok rozumowania: czy wybór podejścia wynika z celu i danych, czy opis rynku prowadzi '
      + 'do przyjętej metody, czy uzasadnienie ocen cech opiera się na faktach o tej nieruchomości, '
      + 'czy wnioski zgadzają się z tabelami. Wypisz wyłącznie to, co budzi wątpliwość, '
      + 'i przy każdym punkcie podaj, co trzeba poprawić. Nie oceniaj samej kwoty i niczego nie dopisuj do operatu.',
    kontekst: `Automatyczny audyt znalazł:\n${problemy || '- nic'}\n`,
  };
}

const API_AUDYT = {
  DZIALY: AUDYT_DZIALY,
  audyt: audytOperatu, polecenieDlaPER: audytPolecenieDlaPER,
  liczbyZTekstu: audLiczbyZTekstu, odmien: audOdmien,
};
if (typeof module !== 'undefined' && module.exports) module.exports = API_AUDYT;
if (typeof window !== 'undefined') window.OperoAudyt = API_AUDYT;
